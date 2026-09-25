import { DataTexture, DataUtils, DoubleSide, HalfFloatType, LinearFilter, RGFormat, ShaderMaterial, Vector4 } from 'three';
import type { HeightField } from '../heightfield';
import { MAP_BOUNDS, PLACES } from '../layout';
import { hazeUniforms, WIND } from './haze';

/**
 * Mist materials and the land map they read.
 *
 * The land map is a small texture over the map (4 m texels): r = ground
 * height (m), g = how much mist may lie there (1 = free, 0 = keep clear: the
 * road, the places). Mist fades out where the ground comes up to it, so it
 * never cuts the land with a hard line. Outside the map the ground reads as
 * far below and the mist is free — a sea of cloud.
 */

const TEXEL = 4;

export interface LandMap {
  texture: DataTexture;
  /** (x0, z0, 1 / width, 1 / depth) of the map in metres. */
  bounds: Vector4;
  /** Mist allowed at a point (0‥1), as in the texture. */
  allowAt(x: number, z: number): number;
}

const landMaps = new WeakMap<HeightField, LandMap>();

/** The land map of a height field (built once, then shared). */
export function buildLandMap(field: HeightField): LandMap {
  const hit = landMaps.get(field);
  if (hit) return hit;
  const w = Math.ceil((MAP_BOUNDS.x1 - MAP_BOUNDS.x0) / TEXEL);
  const d = Math.ceil((MAP_BOUNDS.z1 - MAP_BOUNDS.z0) / TEXEL);
  const height = new Float32Array(w * d);
  const allow = new Float32Array(w * d).fill(1);
  const step = TEXEL / field.cell;
  for (let k = 0; k < d; k++)
    for (let i = 0; i < w; i++) {
      // Highest ground in the texel (so mist fades before it meets a block).
      let h = -50;
      for (let b = 0; b < step; b++)
        for (let a = 0; a < step; a++) {
          const ci = i * step + a;
          const ck = k * step + b;
          if (ci < field.nx && ck < field.nz) h = Math.max(h, field.height[ci + ck * field.nx]);
        }
      height[i + k * w] = h;
    }
  // Keep the road and the places clear (soft edges).
  const clear = (x: number, z: number, r0: number, r1: number, floor: number) => {
    const i0 = Math.max(0, Math.floor((x - r1 - MAP_BOUNDS.x0) / TEXEL));
    const i1 = Math.min(w - 1, Math.ceil((x + r1 - MAP_BOUNDS.x0) / TEXEL));
    const k0 = Math.max(0, Math.floor((z - r1 - MAP_BOUNDS.z0) / TEXEL));
    const k1 = Math.min(d - 1, Math.ceil((z + r1 - MAP_BOUNDS.z0) / TEXEL));
    for (let k = k0; k <= k1; k++)
      for (let i = i0; i <= i1; i++) {
        const px = MAP_BOUNDS.x0 + (i + 0.5) * TEXEL;
        const pz = MAP_BOUNDS.z0 + (k + 0.5) * TEXEL;
        const t = Math.min(1, Math.max(0, (Math.hypot(px - x, pz - z) - r0) / (r1 - r0)));
        const v = floor + (1 - floor) * t * t * (3 - 2 * t);
        const c = i + k * w;
        if (v < allow[c]) allow[c] = v;
      }
  };
  for (const p of field.paths) for (let s = 0; s < p.samples.length; s += 3) clear(p.samples[s].x, p.samples[s].z, 8, 30, 0.2);
  for (const p of PLACES) clear(p.x, p.z, Math.max(...p.pad) * 0.8, Math.max(...p.pad) + 40, 0);
  for (const p of PLACES) clear(p.anchor[0], p.anchor[2], 10, 45, 0);
  const data = new Uint16Array(w * d * 2);
  for (let c = 0; c < w * d; c++) {
    data[c * 2] = DataUtils.toHalfFloat(height[c]);
    data[c * 2 + 1] = DataUtils.toHalfFloat(allow[c]);
  }
  const texture = new DataTexture(data, w, d, RGFormat, HalfFloatType);
  texture.magFilter = texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  texture.name = 'mist land map';
  const bounds = new Vector4(MAP_BOUNDS.x0, MAP_BOUNDS.z0, 1 / (w * TEXEL), 1 / (d * TEXEL));
  const map: LandMap = {
    texture,
    bounds,
    allowAt(x, z) {
      const i = Math.floor((x - MAP_BOUNDS.x0) / TEXEL);
      const k = Math.floor((z - MAP_BOUNDS.z0) / TEXEL);
      return i < 0 || k < 0 || i >= w || k >= d ? 1 : allow[i + k * w];
    },
  };
  landMaps.set(field, map);
  return map;
}

const MIST_COMMON = /* glsl */ `
// Ground height (m) and mist allowance at a map point; outside the map: deep, free.
vec2 landAt(vec2 p) {
  vec2 uv = (p - hazeLandBounds.xy) * hazeLandBounds.zw;
  vec2 v = texture2D(hazeLand, clamp(uv, vec2(0.001), vec2(0.999))).rg;
  vec2 o = max(max(-uv, uv - 1.0), 0.0) / hazeLandBounds.zw;
  float out_ = length(o);
  v.x = mix(v.x, -60.0, smoothstep(0.0, 60.0, out_));
  v.y = mix(v.y, 1.0, smoothstep(0.0, 40.0, out_));
  return v;
}
// Metres outside the land's edges (negative inside). The front edge (under the
// overview camera) counts only when front = 1 (seen when roaming looks south).
float outsideLand(vec2 p, float front) {
  vec2 uv = (p - hazeLandBounds.xy) * hazeLandBounds.zw;
  float o = max(max(-uv.x / hazeLandBounds.z, (uv.x - 1.0) / hazeLandBounds.z), -uv.y / hazeLandBounds.w);
  return front > 0.5 ? max(o, (uv.y - 1.0) / hazeLandBounds.w) : o;
}
`;

/** Mist itself: no cloud shadows, an even valley mist in front (sky/haze.ts). */
const MIST_DEFINES = { HAZE_MIST: '' };

/**
 * A layer of the sea of mist beyond the land: a big flat plane at height `y`.
 * The layers share one noise field and each higher one keeps only its
 * thicker parts, so together they build soft mounds, lit on the key light's
 * side. The sea flows with the wind, its mounds roll (slow swirls bend it)
 * and swell and settle. Inside the land they are clear (the valley mist
 * there is in the haze, sky/haze.ts, so it never cuts trees with a hard line).
 * Seen edge-on or from below (roaming near its height) a layer thins out, so
 * it never shows as a hard line or streaks.
 * @param k layer 0 (lowest) ‥ 1 (highest)
 */
export function mistLayerMaterial(y: number, k: number): ShaderMaterial {
  return new ShaderMaterial({
    name: `mist layer ${y} m`,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
    defines: MIST_DEFINES,
    uniforms: { ...hazeUniforms(), uY: { value: y }, uK: { value: k } },
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      ${MIST_COMMON}
      uniform float uY;
      uniform float uK;
      varying vec3 vWorld;
      void main() {
        vec2 p = vWorld.xz;
        float vis = smoothstep(-60.0, 40.0, outsideLand(p, 0.0));
        // (beyond the front edge it starts at the edge: the land runs to it; seen
        // from high up it reaches in over the edge, sky/haze.ts hazeFrontBank)
        float front = hazeFrontBank(p, cameraPosition);
        vis = max(vis, max(smoothstep(0.0, 60.0, outsideLand(p, 1.0)), front));
        if (vis < 0.004) discard;
        float t = hazeMist.x;
        float scale = hazeMist.y * 0.55;
        vec2 q = p * scale;
        // Slow swirls, two of them crossing, so the mounds roll and change shape.
        vec2 sw = texture2D(hazeNoise, q * 0.3 + vec2(0.0012, -0.0034) * t).rg
                + texture2D(hazeNoise, q * 0.5 + vec2(-0.0029, 0.0011) * t + 0.43).gr - 1.0;
        q += sw * 0.12;
        // Carried by the wind, about 3 m/s (the valley mist nearer moves 2 m/s).
        vec2 drift = HAZE_WIND * (t * 3.0 * scale);
        float n = hazeBankNoise(q, drift);
        vec2 k = hazeKeyDir.xz;
        float nl = hazeBankNoise(q + k / max(length(k), 1e-3) * 20.0 * scale, drift);
        n = n * 0.85 + texture2D(hazeNoise, (p - HAZE_WIND * t * 4.5) / 170.0).b * 0.15;
        // Breathing: the mounds swell and settle (≈ 25 s), each layer a little out of step.
        float lo = 0.12 + uK * 0.5 + 0.045 * sin(t * 0.25 + sw.x * 12.0 - uK * 1.6);
        float dens = smoothstep(lo, lo + 0.2, n) * vis;
        // Where land rises into the sea, the whole stack gives way at once (per
        // layer it would repeat the land's shape at each height: streaks).
        dens *= max(smoothstep(0.0, 8.0, 10.0 - landAt(p).x), front);
        vec3 ray = vWorld - cameraPosition;
        float dist = length(ray);
        dens *= smoothstep(30.0, 140.0, dist);
        // Seen at a grazing angle its noise smears into streaks, and edge-on it
        // is a hard line: thin it out, all the sooner the nearer the eye is to
        // its height (roaming). From below, the eye is in the mist: no layer.
        float dy = cameraPosition.y - uY;
        float near = 1.0 - smoothstep(6.0, 30.0, dy);
        dens *= smoothstep(mix(0.004, 0.015, near), mix(0.03, 0.06, near), abs(ray.y) / dist);
        dens *= smoothstep(-1.0, 3.0, dy);
        if (dens < 0.004) discard;
        // Brighter up the stack (the tops catch the light), a little relief towards the key light.
        float lit = 0.22 + 0.68 * uK + clamp((nl - n) * 3.0, -0.12, 0.12);
        vec3 col = hazeMistColor(vec2(1.0, clamp(lit, 0.0, 1.0)), hazeColorDir(ray / dist));
        gl_FragColor = vec4(col, dens * mix(0.92, 0.6, uK));
        #include <fog_fragment>
      }`,
  });
}

/**
 * Soft cloud banks: camera-facing puffs, one instanced draw (clouds.ts moves
 * and sorts them). Per instance: aCentre (base centre, m), aSize (width,
 * height m), aSeed (x: seed, y: wisp 0 = a round puff ‥ 1 = a long thin wisp,
 * z: how fast the mist rolls through it (m/s), w: opacity).
 * Inside, the mist streams along the wind (as seen on screen) and rises,
 * bent by a slow swirl, so the edges billow and the lit tops roll over.
 */
export function mistBankMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    name: 'mist banks',
    transparent: true,
    depthWrite: false,
    fog: true,
    defines: MIST_DEFINES,
    uniforms: { ...hazeUniforms() },
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      uniform vec4 hazeMist;
      attribute vec3 aCentre;
      attribute vec2 aSize;
      attribute vec4 aSeed;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec4 vSeed;
      varying vec2 vFlow;
      varying float vInside;
      void main() {
        vUv = position.xy + 0.5;
        vSeed = aSeed;
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        // How far the mist inside has moved (in the puff's own units): along
        // the wind as it crosses the screen, and slowly upwards.
        float windX = dot(vec3(${WIND.x.toFixed(4)}, 0.0, ${WIND.z.toFixed(4)}), right);
        float travel = hazeMist.x * aSeed.z;
        vFlow = vec2(-windX * travel / aSize.x, -0.3 * travel / aSize.y);
        // A puff facing the camera (round from any height), its middle half its height up.
        vec3 mid = aCentre + vec3(0.0, aSize.y * 0.5, 0.0);
        vec3 w = mid + right * position.x * aSize.x + up * position.y * aSize.y;
        // (the camera inside a bank: it fades, the haze around takes over)
        vec3 rel = (cameraPosition - mid) / (vec3(aSize.x, aSize.y, aSize.x) * 0.5);
        vInside = length(rel);
        vWorld = w;
        vec4 mvPosition = viewMatrix * vec4(w, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      ${MIST_COMMON}
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec4 vSeed;
      varying vec2 vFlow;
      varying float vInside;
      void main() {
        vec2 uv = vUv;
        vec2 e = (uv - 0.5) * 2.0;
        float wisp = vSeed.y;
        vec2 off = vSeed.xx * vec2(7.31, 3.17);
        // A slow swirl bends the noise (it turns as the mist streams through).
        vec2 sw = texture2D(hazeNoise, uv * vec2(0.45, 0.35) + off + vFlow * 0.35).rg - 0.5;
        vec2 u = uv + sw * vec2(0.22, 0.3);
        // Billowy noise streaming through the puff (a wisp's is stretched along it).
        vec2 st = mix(vec2(1.1, 0.8), vec2(0.7, 1.6), wisp);
        float n = texture2D(hazeNoise, u * st + off + vFlow).a * 0.6
                + texture2D(hazeNoise, u * st * 2.1 + off * 1.3 + vFlow * 1.7).r * 0.4;
        // A soft round blob (a wisp: flatter, thinner at the ends), its edge broken by the noise.
        float shape = 1.0 - dot(e, e);
        float wispShape = (1.0 - e.x * e.x) * (1.0 - pow(abs(e.y), 1.5));
        shape = mix(shape, wispShape * 0.8, wisp);
        float dens = smoothstep(0.0, 0.6, shape + (n - 0.5) * mix(0.8, 1.1, wisp));
        // Lit on top and on the key light's side; the lit tops roll with the noise.
        float side = dot(normalize(vec2(hazeKeyDir.x, hazeKeyDir.z) + 1e-4), vec2(e.x, 0.0));
        float lit = clamp(0.35 + e.y * 0.35 + (n - 0.5) * 0.6 + side * 0.15, 0.0, 1.0);
        // Keep clear of the ground under it and of the road and places.
        vec2 land = landAt(vWorld.xz);
        dens *= smoothstep(-2.0, 6.0, vWorld.y - land.x) * mix(land.y, 1.0, hazeEdge(vWorld.xz) * 0.8);
        // (below the top of the sea of mist the bank is inside it: fade, or its
        // shaded underside shows through the sea like a reflection)
        dens *= smoothstep(12.0, 30.0, vWorld.y);
        vec3 ray = vWorld - cameraPosition;
        float dist = length(ray);
        dens *= smoothstep(40.0, 160.0, dist) * smoothstep(0.5, 1.1, vInside) * vSeed.w;
        if (dens < 0.004) discard;
        vec3 col = hazeMistColor(vec2(1.0, lit), hazeColorDir(ray / dist));
        gl_FragColor = vec4(col, dens);
        #include <fog_fragment>
      }`,
  });
}
