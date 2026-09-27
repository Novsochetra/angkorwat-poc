import { BufferGeometry, Color, Float32BufferAttribute, Mesh, MeshStandardMaterial, type WebGLProgramParametersWithUniforms } from 'three';
import type { MapFrame } from '../types';

/**
 * The palm juice boiling down in the woks: one flat disc per wok (a quad cut
 * round in the shader), lit like the land round it (shadows, haze) and made
 * to boil in the fragment shader. Each wok is at its own stage (`stage`):
 * the fresh juice pale gold under a froth of small fast bubbles (the foam is
 * skimmed off in real life), then amber, then the thick dark caramel of the
 * last wok, where big slow bubbles swell, shine and pop into rings. The
 * surface is glossy (a low roughness and the bubbles' domes bend the
 * highlights). As the fire dies (`boil` → 0) the bubbles stop and it cools
 * to a dark skin. One draw; no shadow cast; no work on the CPU but two
 * uniforms a frame.
 */

export interface WokSurface {
  x: number;
  y: number;
  z: number;
  r: number;
  /** 0 fresh juice … 1 thick syrup. */
  stage: number;
  seed: number;
}

interface SyrupUniforms {
  uSyTime: { value: number };
  uSyBoil: { value: number };
  uSyFresh: { value: Color };
  uSyAmber: { value: Color };
  uSyDark: { value: Color };
  uSyFoam: { value: Color };
  uSyCold: { value: Color };
}

const PARS = /* glsl */ `
uniform float uSyTime;
uniform float uSyBoil;
uniform vec3 uSyFresh;
uniform vec3 uSyAmber;
uniform vec3 uSyDark;
uniform vec3 uSyFoam;
uniform vec3 uSyCold;
varying vec3 vSyDisc;
float syHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float syNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(syHash(i), syHash(i + vec2(1.0, 0.0)), f.x), mix(syHash(i + vec2(0.0, 1.0)), syHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// One layer of bubbles on a grid of cells over the disc: each swells over its own life, then pops.
// out: xy the dome's slope (for the normal), z the bubble's share (0 none … 1 on it), w the ring of a pop.
vec4 syBubbles(vec2 uv, float cells, float rate, float size, float seed) {
  vec2 p = uv * cells;
  vec2 c = floor(p);
  vec2 f = fract(p) - 0.5;
  float h = syHash(c + seed);
  vec2 at = (vec2(syHash(c + seed + 3.1), syHash(c + seed + 5.7)) - 0.5) * 0.45;
  float life = fract(uSyTime * rate * (0.55 + 0.9 * h) + h * 7.3);
  float r = size * (0.45 + 0.55 * h) * smoothstep(0.0, 0.85, life);
  vec2 d = f - at;
  float dl = length(d);
  float on = (1.0 - smoothstep(r * 0.8, r, dl)) * step(life, 0.88) * step(0.25, h);
  vec2 slope = on * d / max(r, 1e-3);
  // (the pop: a ring spreading and fading)
  float pr = (life - 0.88) / 0.12;
  float ring = step(0.88, life) * step(0.25, h) * (1.0 - pr) * (1.0 - smoothstep(0.0, 0.05, abs(dl - size * (0.5 + 0.9 * pr))));
  return vec4(slope, on, ring);
}
`;

/** The juice in the woks: one mesh of a disc per wok; `update` boils it (`boil` 0‥1: the fire). */
export function buildSyrup(woks: WokSurface[]): { mesh: Mesh; update(f: MapFrame, boil: number): void } {
  const pos: number[] = [];
  const disc: number[] = [];
  const idx: number[] = [];
  woks.forEach((w, k) => {
    for (const [a, b] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      pos.push(w.x + a * w.r, w.y, w.z + b * w.r);
      // (x, z on the disc −1‥1; the stage and a seed packed: stage + seed·10)
      disc.push(a, b, w.stage + Math.floor(w.seed * 97 + k * 13) * 10);
    }
    idx.push(k * 4, k * 4 + 2, k * 4 + 1, k * 4, k * 4 + 3, k * 4 + 2);
  });
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setAttribute('aSyDisc', new Float32BufferAttribute(disc, 3));
  geo.setIndex(idx);
  const u: SyrupUniforms = {
    uSyTime: { value: 0 },
    uSyBoil: { value: 1 },
    uSyFresh: { value: new Color(0xd4a84e) },
    uSyAmber: { value: new Color(0xb0661c) },
    uSyDark: { value: new Color(0x86440f) },
    uSyFoam: { value: new Color(0xf0dca4) },
    uSyCold: { value: new Color(0x3a2212) },
  };
  const material = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.22, metalness: 0 });
  material.name = 'palmSugar:syrup';
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aSyDisc;\nvarying vec3 vSyDisc;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSyDisc = aSyDisc;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${PARS}\nvec3 syNormal;`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
  vec2 uv = vSyDisc.xy;
  float rr = length(uv);
  if (rr > 1.0) discard;
  float seed = floor(vSyDisc.z / 10.0);
  float stage = clamp(vSyDisc.z - seed * 10.0, 0.0, 1.0);
  float boil = uSyBoil;
  // The syrup rolls from the middle out (the fire is under the middle).
  float swirl = uSyTime * mix(0.35, 0.12, stage);
  vec2 flow = uv * (1.0 - 0.25 * sin(swirl + rr * 3.0));
  // Thin juice: many small quick bubbles; thick syrup: fewer, big, slow ones.
  vec4 small = syBubbles(flow + seed, mix(11.0, 7.0, stage), mix(1.1, 0.6, stage), 0.36, seed);
  vec4 big = syBubbles(flow * 0.9 + seed * 1.7, mix(5.5, 3.2, stage), mix(0.5, 0.22, stage), 0.42, seed + 9.0);
  vec4 bub = mix(small, big, stage * 0.7) * boil;
  // Froth on the fresh juice: pale foam drifting round the rim.
  float foam = smoothstep(0.52, 0.72, syNoise(uv * 3.5 + vec2(uSyTime * 0.13, -uSyTime * 0.09) + seed)) * (1.0 - stage) * boil;
  foam *= smoothstep(0.25, 0.8, rr) + 0.35;
  vec3 col = stage < 0.5 ? mix(uSyFresh, uSyAmber, stage * 2.0) : mix(uSyAmber, uSyDark, stage * 2.0 - 1.0);
  // Deeper colour toward the middle (thicker), lighter where it thins on the iron.
  col *= 0.86 + 0.2 * smoothstep(0.3, 0.95, rr);
  // (a bubble: its thin skin lighter, a bright cap where it faces up)
  float cap = bub.z * (1.0 - clamp(dot(bub.xy, bub.xy), 0.0, 1.0));
  col = mix(col, col * 1.35 + vec3(0.06, 0.03, 0.0), bub.z * 0.55) + cap * vec3(0.1, 0.06, 0.02);
  col = mix(col, uSyFoam, clamp(foam, 0.0, 0.85));
  col += bub.w * vec3(0.2, 0.12, 0.04);
  // Cooling: the fire out, a dark skin.
  col = mix(uSyCold, col, 0.25 + 0.75 * boil);
  // (the rim: it climbs the dark iron)
  col *= mix(1.0, 0.5, smoothstep(0.86, 1.0, rr));
  diffuseColor.rgb = col;
  syNormal = normalize(vec3(bub.x * 0.5, 1.0, bub.y * 0.5) + vec3(sin(uv.x * 9.0 + uSyTime * 1.7), 0.0, cos(uv.y * 8.0 - uSyTime * 1.3)) * 0.04 * boil);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        '#include <normal_fragment_maps>\n  normal = normalize((viewMatrix * vec4(syNormal, 0.0)).xyz);',
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(0.55, 0.18, uSyBoil) + 0.2 * clamp(foam, 0.0, 1.0);');
  };
  material.customProgramCacheKey = () => 'palm-sugar-syrup-v1';
  const mesh = new Mesh(geo, material);
  mesh.name = 'palmSugar:syrup';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return {
    mesh,
    update(f, boil) {
      u.uSyTime.value = f.t % 600;
      u.uSyBoil.value = boil;
    },
  };
}
