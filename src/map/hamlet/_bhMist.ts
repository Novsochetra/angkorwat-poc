import { BufferGeometry, Color, Float32BufferAttribute, Points, ShaderMaterial, UniformsLib, UniformsUtils } from 'three';
import { hash3 } from '../../voxel/random';
import { SKY } from '../sky/palette';
import type { MapFrame } from '../types';

/**
 * Mist on the lotus pond: at dawn a soft white breath lies on the water and
 * a little over its banks, drifting slowly and thinning as the sun comes
 * up behind Angkor Wat; a thin veil again late in the evening and in the
 * night. Camera-facing soft puffs moved in the vertex shader (one draw, no
 * per-frame work but a few uniforms), coloured like the map's mist
 * (`SKY.mistLit`, warmer where the low sun lights it); nothing drawn by
 * day. URL: `pondmist=1` holds it full (checks).
 */

/** How thick the mist lies through the day (clock, amount): the dawn most of all. */
const KEYS: [number, number][] = [
  [0, 0],
  [0.24, 0],
  [0.32, 0.25],
  [0.5, 0.4],
  [0.66, 0.55],
  [0.74, 0.95],
  [0.8, 1],
  [0.86, 0.55],
  [0.92, 0],
  [1, 0],
];

function amountAt(clock: number): number {
  const c = clock - Math.floor(clock);
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [a, va] = KEYS[i];
    const [b, vb] = KEYS[i + 1];
    if (c <= b) {
      const t = (c - a) / (b - a);
      return va + (vb - va) * t * t * (3 - 2 * t);
    }
  }
  return 0;
}

export interface PondMist {
  object: Points;
  update(f: MapFrame, scale: number): void;
}

/** Puffs over an ellipse (the pond's middle, radii, turn), `level` the water. */
export function buildPondMist(x: number, z: number, rx: number, rz: number, rot: number, level: number, hold: boolean): PondMist {
  const N = 34;
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N * 3);
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let i = 0; i < N; i++) {
    const a = hash3(i, 1, 2, 81) * Math.PI * 2;
    const d = Math.sqrt(hash3(i, 3, 4, 81)) * 1.15;
    const u = Math.cos(a) * d * (rx + 2);
    const v = Math.sin(a) * d * (rz + 2);
    pos.set([x + u * c - v * s, level + 0.25 + hash3(i, 5, 6, 81) * 0.9, z + u * s + v * c], i * 3);
    seed.set([hash3(i, 7, 8, 81), hash3(i, 9, 10, 81), hash3(i, 11, 12, 81)], i * 3);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new Float32BufferAttribute(seed, 3));
  const material = new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.fog, { uTime: { value: 0 }, uScale: { value: 800 }, uAmount: { value: 0 }, uColor: { value: new Color(0.8, 0.85, 0.9) }, uWarm: { value: new Color(1, 0.8, 0.6) } }]),
    vertexShader: /* glsl */ `
      attribute vec3 aSeed;
      uniform float uTime;
      uniform float uScale;
      uniform float uAmount;
      varying float vA;
      varying float vSide;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vec3 p = position;
        // A slow drift round its place, and a breath in and out.
        float t = uTime * (0.025 + 0.02 * aSeed.x) + aSeed.y * 6.2832;
        p.x += sin(t) * 1.6;
        p.z += cos(t * 0.8) * 1.2;
        p.y += 0.25 * sin(uTime * 0.07 + aSeed.z * 6.2832);
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        float size = 5.5 + 4.0 * aSeed.x;
        gl_PointSize = min(size * uScale / max(1.0, -mvPosition.z), 520.0);
        float breath = 0.75 + 0.25 * sin(uTime * 0.11 + aSeed.x * 6.2832);
        // (thinner right in front of the camera: no grey sheet over the view)
        vA = uAmount * breath * smoothstep(2.0, 9.0, -mvPosition.z);
        vSide = aSeed.z;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uWarm;
      varying float vA;
      varying float vSide;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        vec2 q = gl_PointCoord * 2.0 - 1.0;
        // A wide, flat puff (squashed up and down), softest at its rim.
        q.y *= 1.9;
        float r2 = dot(q, q);
        if (r2 >= 1.0 || vA <= 0.002) discard;
        float a = exp(-r2 * 2.6) * (1.0 - r2);
        vec3 col = mix(uColor, uWarm, 0.35 * (0.5 - q.y * 0.5) * vSide);
        gl_FragColor = vec4(col, a * vA * 0.3);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  material.name = 'hamlet:pond-mist';
  const object = new Points(geo, material);
  object.name = 'hamlet:pond-mist';
  object.frustumCulled = false;
  object.renderOrder = 3;
  object.visible = false;
  const u = material.uniforms;
  const warm = new Color();
  return {
    object,
    update(f, scale) {
      const k = hold ? 1 : amountAt(f.clock) * (1 - 0.7 * f.weather.wind) * (1 - 0.5 * f.weather.rain);
      object.visible = k > 0.01;
      if (!object.visible) return;
      u.uTime.value = f.drift;
      u.uScale.value = scale;
      u.uAmount.value = k;
      (u.uColor.value as Color).copy(SKY.mistLit);
      // (at dawn the low sun warms its top; at night it stays cool)
      (u.uWarm.value as Color).copy(warm.copy(SKY.mistLit).lerp(SKY.glow, 0.5 * SKY.dawn));
    },
  };
}
