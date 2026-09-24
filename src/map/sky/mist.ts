import { DataTexture, DataUtils, DoubleSide, HalfFloatType, LinearFilter, RGFormat, ShaderMaterial, Vector4 } from 'three';
import type { HeightField } from '../heightfield';
import { MAP_BOUNDS, PLACES } from '../layout';
import { hazeUniforms } from './haze';

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
// Metres outside the side and back edges of the land (negative inside).
float outsideLand(vec2 p) {
  vec2 uv = (p - hazeLandBounds.xy) * hazeLandBounds.zw;
  return max(max(-uv.x / hazeLandBounds.z, (uv.x - 1.0) / hazeLandBounds.z), -uv.y / hazeLandBounds.w);
}
`;

/**
 * A layer of the sea of mist beyond the land: a big flat plane at height `y`.
 * The layers share one noise field and each higher one keeps only its
 * thicker parts, so together they build soft mounds, lit on the key light's
 * side. Inside the land they are clear (the valley mist there is in the
 * haze, sky/haze.ts, so it never cuts trees with a hard line).
 * @param k layer 0 (lowest) ‥ 1 (highest)
 */
export function mistLayerMaterial(y: number, k: number): ShaderMaterial {
  return new ShaderMaterial({
    name: `mist layer ${y} m`,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
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
        float vis = smoothstep(-60.0, 40.0, outsideLand(p));
        if (vis < 0.004) discard;
        vec2 drift = vec2(hazeMist.x * 0.0012, hazeMist.x * 0.0005);
        vec2 q = p * hazeMist.y * 0.55;
        float n = hazeBankNoise(q, drift);
        vec2 k = hazeKeyDir.xz;
        float nl = hazeBankNoise(q + k / max(length(k), 1e-3) * 20.0 * hazeMist.y * 0.55, drift);
        n = n * 0.85 + texture2D(hazeNoise, p / 170.0 + drift * 2.0).b * 0.15;
        float lo = 0.12 + uK * 0.5;
        float dens = smoothstep(lo, lo + 0.2, n) * vis;
        // Where land rises into the sea, the whole stack gives way at once (per
        // layer it would repeat the land's shape at each height: streaks).
        dens *= smoothstep(0.0, 8.0, 10.0 - landAt(p).x);
        vec3 ray = vWorld - cameraPosition;
        float dist = length(ray);
        dens *= smoothstep(30.0, 140.0, dist);
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
 * Soft cloud banks: camera-facing (upright) or flat puffs, one instanced draw.
 * Per instance: aCentre (base centre, m), aSize (width, height m; height < 0 = a
 * flat wisp lying on the mist, `aSeed.y` its heading), aSeed (x: seed, y:
 * heading, z: drift speed, w: opacity).
 */
export function mistBankMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    name: 'mist banks',
    transparent: true,
    depthWrite: false,
    fog: true,
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
      varying float vFlat;
      void main() {
        vUv = position.xy + 0.5;
        vSeed = aSeed;
        vec3 c = aCentre;
        // A slow drift back and forth (tens of metres over minutes).
        float ph = hazeMist.x * 0.02 * aSeed.z + aSeed.x * 6.28;
        c.x += sin(ph) * 10.0 * aSeed.z;
        c.z += cos(ph * 0.7) * 6.0 * aSeed.z;
        vec3 w;
        if (aSize.y < 0.0) {
          // Flat wisp, along its heading.
          vFlat = 1.0;
          vec2 dir = vec2(cos(aSeed.y), sin(aSeed.y));
          vec2 side = vec2(-dir.y, dir.x);
          vec2 xz = c.xz + dir * position.x * aSize.x + side * position.y * -aSize.y;
          w = vec3(xz.x, c.y, xz.y);
        } else {
          // A puff facing the camera (round from any height), its middle half its height up.
          vFlat = 0.0;
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          w = c + vec3(0.0, aSize.y * 0.5, 0.0) + right * position.x * aSize.x + up * position.y * aSize.y;
        }
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
      varying float vFlat;
      void main() {
        vec2 uv = vUv;
        vec2 off = vSeed.xx * vec2(7.31, 3.17) + vec2(hazeMist.x * 0.0015, 0.0);
        float dens;
        float lit;
        if (vFlat > 0.5) {
          vec2 e = (uv - 0.5) * 2.0;
          float n = texture2D(hazeNoise, uv * vec2(1.4, 0.6) + off).r * 0.65 + texture2D(hazeNoise, uv * vec2(3.0, 1.2) + off * 1.7).a * 0.35;
          dens = smoothstep(0.0, 0.8, 1.0 - dot(e, e)) * smoothstep(0.3, 0.65, n);
          lit = 0.55 + 0.35 * n;
        } else {
          // A puff: a soft round blob, its edge broken by billowy noise.
          vec2 e = (uv - 0.5) * 2.0;
          float n = texture2D(hazeNoise, uv * vec2(1.1, 0.8) + off).a * 0.6 + texture2D(hazeNoise, uv * vec2(2.3, 1.7) + off * 1.3).r * 0.4;
          float shape = 1.0 - dot(e, e);
          dens = smoothstep(0.0, 0.6, shape + (n - 0.5) * 0.8);
          // Lit on top and on the key light's side.
          float side = dot(normalize(vec2(hazeKeyDir.x, hazeKeyDir.z) + 1e-4), vec2(e.x, 0.0));
          lit = clamp(0.35 + e.y * 0.35 + (n - 0.5) * 0.6 + side * 0.15, 0.0, 1.0);
        }
        // Keep clear of the ground under it and of the road and places.
        vec2 land = landAt(vWorld.xz);
        dens *= smoothstep(-2.0, 6.0, vWorld.y - land.x) * mix(land.y, 1.0, hazeEdge(vWorld.xz) * 0.8 + 0.2 * vFlat);
        // (below the top of the sea of mist the bank is inside it: fade, or its
        // shaded underside shows through the sea like a reflection)
        dens *= smoothstep(12.0, 30.0, vWorld.y);
        vec3 ray = vWorld - cameraPosition;
        float dist = length(ray);
        dens *= smoothstep(40.0, 160.0, dist) * vSeed.w;
        if (dens < 0.004) discard;
        vec3 col = hazeMistColor(vec2(1.0, lit), hazeColorDir(ray / dist));
        gl_FragColor = vec4(col, dens);
        #include <fog_fragment>
      }`,
  });
}
