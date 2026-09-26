import { BufferGeometry, Color, Float32BufferAttribute, MeshStandardMaterial, Vector3, type Vector4, type DataTexture } from 'three';
import { CELL } from '../heightfield';
import { RAIN_RINGS_GLSL } from '../sky/rain';
import { NOISE_GLSL } from './glsl';
import { NONE, type WaterGrid } from './grid';

/**
 * River and pool surfaces: one quad per water cell at its level, and a short
 * side (1 m, down to the bed) wherever the ground or the water beside it is
 * lower, so no water edge floats over a gap. Steps between two water levels
 * get a cascade (falls.ts) instead.
 */
export function buildSurfaceGeometry(g: WaterGrid): BufferGeometry {
  const f = g.field;
  const { nx, nz } = f;
  const pos: number[] = [];
  const nor: number[] = [];
  const h = CELL / 2;
  const quad = (a: number[], b: number[], c: number[], d: number[], n: number[]) => {
    // Wind it to face n.
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const facing = (u[1] * v[2] - u[2] * v[1]) * n[0] + (u[2] * v[0] - u[0] * v[2]) * n[1] + (u[0] * v[1] - u[1] * v[0]) * n[2];
    if (facing >= 0) pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    else pos.push(...a, ...c, ...b, ...a, ...d, ...c);
    for (let k = 0; k < 6; k++) nor.push(...n);
  };
  for (let k = 0; k < nz; k++)
    for (let i = 0; i < nx; i++) {
      const c = i + k * nx;
      const L = g.level[c];
      if (L <= NONE) continue;
      const [x, z] = f.cellCenter(i, k);
      quad([x - h, L, z - h], [x - h, L, z + h], [x + h, L, z + h], [x + h, L, z - h], [0, 1, 0]);
      for (const [di, dk] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const i2 = i + di;
        const k2 = k + dk;
        if (i2 < 0 || k2 < 0 || i2 >= nx || k2 >= nz) continue;
        const m = i2 + k2 * nx;
        if (g.level[m] > NONE) continue;
        const low = Math.max(f.height[m], L - 1);
        if (low >= L - 0.01) continue;
        // Side face on the edge towards the lower neighbour, facing it.
        const ex = x + di * h;
        const ez = z + dk * h;
        const ax = ex - dk * h;
        const az = ez - di * h;
        const bx = ex + dk * h;
        const bz = ez + di * h;
        quad([ax, L, az], [ax, low, az], [bx, low, bz], [bx, L, bz], [di, 0, dk]);
      }
    }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  geo.computeBoundingSphere();
  return geo;
}

export interface SurfaceUniforms {
  uTime: { value: number };
  uData: { value: DataTexture };
  uDataBox: { value: Vector4 };
  uShallow: { value: Color };
  uDeep: { value: Color };
  uFoam: { value: Color };
  /** What the water mirrors at a low angle: the sky near the horizon. */
  uSky: { value: Color };
  uFlowSpeed: { value: number };
  uSparkle: { value: number };
  uLightDirW: { value: Vector3 };
  /** Rain on the water (0‥1, `f.weather.rain`): rings and splashes up close, a duller, stippled surface. */
  uRain: { value: number };
}

/**
 * The water: a MeshStandardMaterial (so it takes the scene's sun or moon,
 * sky light, shadows and fog) whose colour, normal and roughness come from
 * the water map and flowing noise:
 *  - ripples drift along the local flow (two phases of noise, cross-faded);
 *  - jade at the banks, deep teal in the middle, foam lines along the banks,
 *    patches of foam under falls and round rocks and piers;
 *  - the sky mirrored at low angles (Fresnel), and the sun's (or the moon's)
 *    highlight broken into glints.
 */
export function surfaceMaterial(tex: DataTexture, box: Vector4): { material: MeshStandardMaterial; uniforms: SurfaceUniforms } {
  const uniforms: SurfaceUniforms = {
    uTime: { value: 0 },
    uData: { value: tex },
    uDataBox: { value: box },
    uShallow: { value: new Color() },
    uDeep: { value: new Color() },
    uFoam: { value: new Color() },
    uSky: { value: new Color() },
    uFlowSpeed: { value: 0.75 },
    uSparkle: { value: 4 },
    uLightDirW: { value: new Vector3(0, 1, 0) },
    uRain: { value: 0 },
  };
  const material = new MeshStandardMaterial({ roughness: 0.2, metalness: 0 });
  material.name = 'water surface';
  material.customProgramCacheKey = () => 'map-water-surface';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\n  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vWNormal = normalize(mat3(modelMatrix) * objectNormal);',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SURFACE_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${SURFACE_MAIN}`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(roughness, 0.85, wFoam);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);')
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n  reflectedLight.directSpecular *= 1.0 + wSpark * uSparkle;')
      .replace(
        '#include <opaque_fragment>',
        `outgoingLight = mix(totalDiffuse + totalEmissiveRadiance, uSky, wFres) + totalSpecular;\n#include <opaque_fragment>`,
      );
  };
  return { material, uniforms };
}

const SURFACE_PARS = /* glsl */ `
uniform float uTime;
uniform sampler2D uData;
uniform vec4 uDataBox;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform vec3 uSky;
uniform float uFlowSpeed;
uniform float uSparkle;
uniform vec3 uLightDirW;
uniform float uRain;
varying vec3 vWPos;
varying vec3 vWNormal;
${NOISE_GLSL}
${RAIN_RINGS_GLSL}
const mat2 W_ROT1 = mat2(0.8, -0.6, 0.6, 0.8);
const mat2 W_ROT2 = mat2(-0.28, 0.96, -0.96, -0.28);
// Ripple height (centred) and its gradient, world metres.
vec3 wRipples(vec2 p, float lod) {
  vec3 a = wNoiseD(p * 0.55);
  a.yz *= 0.55;
  vec2 pb = W_ROT1 * p * 1.3 + 5.2;
  vec3 b = wNoiseD(pb);
  b.yz = (b.yz * W_ROT1) * 1.3;
  vec2 pc = W_ROT2 * p * 2.9 + 11.7;
  vec3 c = wNoiseD(pc);
  c.yz = (c.yz * W_ROT2) * 2.9;
  a.x -= 0.5; b.x -= 0.5; c.x -= 0.5;
  return a * 0.5 + b * 0.3 * (1.0 - 0.6 * lod) + c * 0.16 * (1.0 - lod);
}
// Noise smeared along the flow (a short line integral): streaks that follow the river.
float wStreak(vec2 p, vec2 fd, float scale) {
  float s = 0.0;
  for (int i = 0; i < 6; i++) s += wNoise(W_ROT1 * (p - fd * float(i)) * scale);
  return (s / 6.0 - 0.5) * 2.2 + 0.5;
}
`;

const SURFACE_MAIN = /* glsl */ `
  vec3 wN = vec3(0.0, 1.0, 0.0);
  float wFoam = 0.0;
  float wFres = 0.0;
  float wSpark = 0.0;
  {
    vec4 wd = texture2D(uData, (vWPos.xz - uDataBox.xy) * uDataBox.zw);
    float bank = wd.r * 6.0;
    vec2 flow = (wd.ba - 0.5) * 4.0;
    float fl = length(flow);
    vec2 fd = fl > 0.05 ? flow / fl : vec2(0.0, 1.0);
    vec2 vel = fd * uFlowSpeed * clamp(fl, 0.3, 2.2);
    // Two phases of the pattern slide down the flow and cross-fade, so it never stretches.
    const float T = 3.2;
    float ph0 = fract(uTime / T);
    float ph1 = fract(uTime / T + 0.5);
    float w0 = 1.0 - abs(1.0 - 2.0 * ph0);
    float w1 = 1.0 - w0;
    float nrm = inversesqrt(w0 * w0 + w1 * w1);
    vec2 p0 = vWPos.xz - vel * (T * ph0);
    vec2 p1 = vWPos.xz - vel * (T * ph1) + vec2(4.7, 2.3);
    float dist = length(vWPos - cameraPosition);
    float lod = smoothstep(120.0, 650.0, dist);

    vec3 rp = (wRipples(p0, lod) * w0 + wRipples(p1, lod) * w1) * nrm;
    float f0 = wNoise(p0 * 0.8 + 17.0) * 0.62 + wNoise(W_ROT2 * p0 * 2.1 + 41.0) * 0.38;
    float f1 = wNoise(p1 * 0.8 + 17.0) * 0.62 + wNoise(W_ROT2 * p1 * 2.1 + 41.0) * 0.38;
    float fn = ((f0 - 0.5) * w0 + (f1 - 0.5) * w1) * nrm + 0.5;
    float st = ((wStreak(p0, fd, 1.5) - 0.5) * w0 + (wStreak(p1, fd, 1.5) - 0.5) * w1) * nrm + 0.5;

    // Foam: a broken line along the banks, patches where the map says (falls, rocks, piers),
    // faint threads drawn out along the flow.
    float edge = 1.0 - smoothstep(0.05, 1.5, bank);
    float bankFoam = smoothstep(0.5, 0.85, edge * (0.5 + fn * 0.95));
    float patchFoam = smoothstep(0.3, 0.78, wd.g * (0.3 + fn * 0.7 + st * 0.6));
    float threads = smoothstep(0.72, 0.95, st) * 0.3 * smoothstep(0.8, 2.5, bank) * (1.0 - 0.8 * lod);
    wFoam = clamp(max(max(bankFoam * 0.85, patchFoam), threads), 0.0, 1.0);

    float amp = 0.2 * (1.0 - 0.5 * lod) * (1.0 - 0.7 * wFoam);
    wN = normalize(vec3(-rp.y * amp, 1.0, -rp.z * amp));

    float deepT = smoothstep(0.5, 4.5, bank);
    vec3 col = mix(uShallow, uDeep, deepT);
    col *= 0.9 + 0.3 * rp.x + 0.25 * (st - 0.5);
    col = mix(col, uFoam, wFoam);

    // Rain: rings spreading where drops hit and a splash at each (up close), the mirror dulled.
    float wRain = 0.0;
    if (uRain > 0.001) {
      wRain = uRain * (1.0 - wFoam);
      vec3 rr = rainRings(vWPos.xz, uTime, uRain) * (1.0 - smoothstep(35.0, 110.0, dist));
      wN = normalize(wN + vec3(rr.x, 0.0, rr.y) * 0.5 * (1.0 - wFoam));
      col = mix(col, uFoam, clamp(rr.z, 0.0, 1.0) * 0.55 * (1.0 - wFoam));
    }

    vec3 V = normalize(cameraPosition - vWPos);
    wFres = (0.02 + 0.98 * pow(1.0 - max(dot(wN, V), 0.0), 5.0)) * (1.0 - wFoam) * (1.0 - 0.3 * wRain);
    float s0 = wNoise(W_ROT2 * p0 * 3.4 + 71.0);
    float s1 = wNoise(W_ROT2 * p1 * 3.4 + 71.0);
    float sp = ((s0 - 0.5) * w0 + (s1 - 0.5) * w1) * nrm + 0.5;
    wSpark = smoothstep(0.6, 0.9, sp) * (1.0 - wFoam) * (1.0 - 0.8 * wRain);

    if (vWNormal.y < 0.5) {
      // Sides: shallow water spilling down to the bed.
      wN = normalize(vWNormal);
      col = mix(uShallow, uFoam, 0.35 + 0.3 * fn);
      wFres = 0.0;
      wSpark = 0.0;
    }
    diffuseColor.rgb = col;
  }
`;
