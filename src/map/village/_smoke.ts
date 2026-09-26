import { BufferGeometry, Color, Float32BufferAttribute, Points, ShaderMaterial, UniformsLib, UniformsUtils, Vector2 } from 'three';
import { hash3 } from '../../voxel/random';
import type { MapFrame } from '../types';

/**
 * Cooking smoke from the village's kitchen fires: a few thin wisps rising
 * slowly, leaning with the wind and spreading as they go, gone some metres
 * up. Cheap: one cloud of camera-facing points, every puff moved in the
 * vertex shader from the time (no work per frame but a few uniforms).
 * More smoke at the cooking times (dawn, midday, dusk), a thread of it late
 * at night; each fire has its own times. At night the smoke is dark and the
 * fire under it tints its foot.
 */

/** Puffs per fire, the life of a puff (s), how high it rises (m). */
const PUFFS = 14;
const LIFE = 18;
const RISE = 9;

export interface SmokeSource {
  x: number;
  y: number;
  z: number;
}

interface SmokeUniforms {
  uTime: { value: number };
  uScale: { value: number };
  uAmount: { value: number };
  uWind: { value: Vector2 };
  uColor: { value: Color };
  uEmber: { value: number };
}

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** How much the fires smoke through the day (clock, amount): supper from the golden afternoon to dusk, embers at night, breakfast at dawn. */
const KEYS: [number, number][] = [
  [0, 0.75],
  [0.12, 0.9],
  [0.25, 0.7],
  [0.33, 0.2],
  [0.62, 0.12],
  [0.72, 0.6],
  [0.78, 1],
  [0.86, 0.6],
  [0.93, 0.35],
  [1, 0.75],
];

/** How much the fires smoke at a time of day (0‥1). */
export function smokeAmount(clock: number): number {
  const c = clock - Math.floor(clock);
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [a, va] = KEYS[i];
    const [b, vb] = KEYS[i + 1];
    if (c <= b) return va + (vb - va) * smooth(a, b, c);
  }
  return KEYS[0][1];
}

export function buildSmoke(sources: SmokeSource[]): { object: Points; update(f: MapFrame, scale: number): void } {
  const n = sources.length * PUFFS;
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n * 3);
  sources.forEach((s, j) => {
    for (let i = 0; i < PUFFS; i++) {
      const k = j * PUFFS + i;
      pos.set([s.x, s.y, s.z], k * 3);
      // Phase along the life, a random, and the fire's own gate (when it burns).
      seed.set([(i + hash3(i, j, 1, 51) * 0.6) / PUFFS, hash3(i, j, 2, 52), hash3(j, 0, 3, 53)], k * 3);
    }
  });
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new Float32BufferAttribute(seed, 3));
  const material = new ShaderMaterial({
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      { uTime: { value: 0 }, uScale: { value: 800 }, uAmount: { value: 0.5 }, uWind: { value: new Vector2(0.2, 0.1) }, uColor: { value: new Color(0.8, 0.8, 0.82) }, uEmber: { value: 0 } },
    ]),
    vertexShader: /* glsl */ `
      attribute vec3 aSeed;
      uniform float uTime;
      uniform float uScale;
      uniform float uAmount;
      uniform vec2 uWind;
      varying float vA;
      varying float vAge;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        float age = fract(uTime / ${LIFE.toFixed(1)} + aSeed.x);
        // This fire burns when the amount is over its gate.
        float on = clamp((uAmount * 1.5 - aSeed.z * 0.6) * 2.0, 0.0, 1.0);
        vec3 p = position;
        p.y += age * ${RISE.toFixed(1)} * (1.0 - 0.3 * age);
        float sway = uTime * 0.21 + aSeed.y * 6.283;
        p.xz += uWind * age * age * 7.0 + vec2(sin(sway + age * 2.5), cos(sway * 0.8 + age * 2.0)) * (0.15 + age * 0.9);
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        float size = mix(0.45, 3.6, sqrt(age)) * (0.8 + 0.4 * aSeed.y);
        gl_PointSize = min(size * uScale / max(1.0, -mvPosition.z), 420.0);
        vA = smoothstep(0.0, 0.1, age) * (1.0 - smoothstep(0.35, 1.0, age)) * on * (0.55 + 0.45 * uAmount);
        vAge = age;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uEmber;
      varying float vA;
      varying float vAge;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(p, p);
        if (r2 >= 1.0 || vA <= 0.002) discard;
        // A soft puff, a little thicker low on one side (lit from above).
        float a = exp(-r2 * 3.2) * (1.0 - r2) * (0.85 + 0.15 * p.y);
        vec3 col = uColor * (0.92 + 0.12 * -p.y);
        col = mix(col, vec3(1.0, 0.45, 0.16) * 0.9, uEmber * (1.0 - smoothstep(0.0, 0.18, vAge)));
        gl_FragColor = vec4(col, a * vA * 0.42);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  material.name = 'village:smoke';
  const object = new Points(geo, material);
  object.name = 'village:smoke';
  object.frustumCulled = false;
  object.renderOrder = 3;
  const u = material.uniforms as unknown as SmokeUniforms;
  const day = new Color(0.82, 0.82, 0.84);
  const dusk = new Color(0.72, 0.64, 0.62);
  const night = new Color(0.16, 0.18, 0.24);
  return {
    object,
    update(f, scale) {
      u.uTime.value = f.t;
      u.uScale.value = scale;
      const w = f.weather;
      // Rain damps the fires; a breeze leans the smoke (a faint drift in still air).
      u.uAmount.value = smokeAmount(f.clock) * (1 - 0.6 * w.rain);
      const wind = 0.12 + w.wind * 0.9;
      u.uWind.value.set(Math.sin(w.windDir) * wind + 0.05, Math.cos(w.windDir) * wind + 0.03);
      const n = f.night;
      u.uColor.value.copy(day).lerp(dusk, Math.min(1, n * 2) * (1 - n)).lerp(night, smooth(0.35, 0.9, n));
      u.uEmber.value = smooth(0.4, 0.9, n) * 0.6;
    },
  };
}
