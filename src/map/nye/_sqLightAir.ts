import { Color, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, PlaneGeometry, ShaderMaterial, Sphere, Vector3 } from 'three';
import { hash3 } from '../../voxel/random';
import type { HeightField } from '../heightfield';
import { hazeUniforms } from '../sky/haze';
import { NOISE_GLSL } from '../water/glsl';
import { onSquare, SQUARE } from './plan';

/**
 * The air round the festival square at night (AWP-35; the owner: "subtle atmospheric fog: a cool blue mist in the
 * forest edges and over the water; waterfall mist near the square"): soft puffs of mist, one draw (blended, not
 * added: mist hides a little of what is behind it), the night only (`uLevel`).
 *
 * - **the forest edges**: a broken ring of low mist lying in the trees and the meadow round the square, slowly
 *   drifting; cool blue, warmer the nearer it lies to the square's light;
 * - **over the water**: along the stream and over the pool near the square, a little above the water;
 * - **the falls' foot**: spray rising and drifting down the stream from the foot of each tall fall near the square,
 *   more than the map's own (`water/spray.ts`, which the overview keeps as it was).
 *
 * Each puff fades as the camera comes into it (no mist in the face, no pixels spent there). On low: about half.
 * Nothing moves but in the shader.
 */

/** How far round the square the air reaches (m). */
const REACH = 130;

export function buildSquareAir(field: HeightField, low: boolean): { mesh: Mesh; u: { uLevel: { value: number }; uTime: { value: number } } } | null {
  const base: number[] = [];
  const move: number[] = [];
  const look: number[] = [];
  /** A puff: at (x, y, z), `size` m; drifting (dx, dz) m and rising `rise` m over `period` s; `alpha`, `warm` 0‥1, kind 0 lying, 1 rising. */
  const puff = (x: number, y: number, z: number, size: number, dx: number, dz: number, rise: number, period: number, alpha: number, warm: number, kind: number) => {
    base.push(x, y, z, size);
    move.push(dx, rise, dz, period);
    look.push(alpha, warm, hash3(x, z, size, 611), kind);
  };
  const keep = (i: number, seed: number) => !low || hash3(i, seed, 3, 612) < 0.5;

  // ── The forest edges: a broken ring round the square ──
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 + 0.3 * hash3(i, 1, 1, 613);
    const k = 1.35 + 0.55 * hash3(i, 2, 1, 613);
    const x = SQUARE.x + Math.cos(a) * SQUARE.rx * k;
    const z = SQUARE.z + Math.sin(a) * SQUARE.rz * k;
    if (!keep(i, 1) || onSquare(x, z, 5) || field.index(x, z) < 0) continue;
    const g = field.heightAt(x, z);
    // (only where the land is near the square's own: not high on Kulen's slope)
    if (g > 14) continue;
    const near = 1 - Math.min(1, (k - 1.35) / 0.55);
    puff(x, g + 1.2 + 1.4 * hash3(i, 3, 1, 613), z, 11 + 6 * hash3(i, 4, 1, 613), 3 * Math.cos(a + 1.6), 3 * Math.sin(a + 1.6), 0.6, 40 + 30 * hash3(i, 5, 1, 613), 0.3, 0.45 * near, 0);
  }

  // ── Over the water: the stream and the pool near the square ──
  let w = 0;
  for (const river of field.rivers)
    for (let s = 0; s < river.samples.length; s += 3) {
      const p = river.samples[s];
      if (Math.hypot(p.x - SQUARE.x, p.z - SQUARE.z) > REACH) continue;
      if (!keep(w++, 2)) continue;
      const size = Math.max(6, Math.min(12, p.w * 1.6));
      puff(p.x, p.level + 0.9, p.z, size, p.dir[0] * 6, p.dir[1] * 6, 0.5, 30 + 20 * hash3(p.x, p.z, 1, 614), 0.34, 0.15, 0);
    }

  // ── The falls' foot: spray rising and drifting down the stream ──
  for (const f of field.falls) {
    const drop = f.top - f.bottom;
    if (drop < 6 || Math.hypot(f.x - SQUARE.x, f.z - SQUARE.z) > REACH) continue;
    const n = Math.round((low ? 5 : 11) * Math.min(1.4, drop / 14));
    const side: [number, number] = [-f.dir[1], f.dir[0]];
    for (let i = 0; i < n; i++) {
      const u = (hash3(f.x, i, 1, 615) - 0.5) * f.width;
      const fwd = 1.2 + 3 * hash3(f.x, i, 2, 615);
      const x = f.x + side[0] * u + f.dir[0] * fwd;
      const z = f.z + side[1] * u + f.dir[1] * fwd;
      const go = 3 + 4 * hash3(f.x, i, 3, 615);
      puff(x, f.bottom + 0.6, z, 5 + drop * 0.25 + 3 * hash3(f.x, i, 4, 615), f.dir[0] * go, f.dir[1] * go, 2 + drop * 0.3 * (0.5 + hash3(f.x, i, 5, 615)), 6 + 5 * hash3(f.x, i, 6, 615), 0.42, 0.1, 1);
    }
    // (a veil up the fall's lower half)
    for (let i = 0; i < (low ? 1 : 3); i++) {
      const u = (hash3(f.z, i, 7, 615) - 0.5) * f.width * 0.7;
      puff(f.x + side[0] * u + f.dir[0] * 1.2, f.bottom + drop * (0.15 + 0.3 * hash3(f.z, i, 8, 615)), f.z + side[1] * u + f.dir[1] * 1.2, 6 + drop * 0.2, f.dir[0] * 1.5, f.dir[1] * 1.5, 2.5, 9 + 4 * hash3(f.z, i, 9, 615), 0.22, 0.05, 1);
    }
  }

  const n = base.length / 4;
  if (!n) return null;
  const quad = new PlaneGeometry(1, 1);
  const geo = new InstancedBufferGeometry();
  geo.setIndex(quad.getIndex());
  geo.setAttribute('position', quad.getAttribute('position'));
  geo.setAttribute('aBase', new InstancedBufferAttribute(new Float32Array(base), 4));
  geo.setAttribute('aMove', new InstancedBufferAttribute(new Float32Array(move), 4));
  geo.setAttribute('aLook', new InstancedBufferAttribute(new Float32Array(look), 4));
  geo.instanceCount = n;
  const pts: Vector3[] = [];
  for (let i = 0; i < n; i++) pts.push(new Vector3(base[i * 4], base[i * 4 + 1], base[i * 4 + 2]));
  const sphere = new Sphere().setFromPoints(pts);
  sphere.radius += 20;
  geo.boundingSphere = sphere;
  const u = {
    ...hazeUniforms(),
    uLevel: { value: 0 },
    uTime: { value: 0 },
    // (linear: a cool moonlit blue, and the square's gold on the mist near it)
    uCool: { value: new Color(0x3d5578) },
    uWarm: { value: new Color(0xb07a48) },
  };
  const material = new ShaderMaterial({
    name: 'nye:air',
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: u,
    // (upright puffs: the haze's mist mode, as the falls' spray)
    defines: { HAZE_MIST: '' },
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      attribute vec4 aBase;
      attribute vec4 aMove;
      attribute vec4 aLook;
      uniform float uTime;
      uniform float uLevel;
      varying vec2 vUv;
      varying float vA;
      varying float vWarm;
      varying float vSeed;
      void main() {
        float age = fract(uTime / aMove.w + aLook.z);
        // Lying mist drifts to and fro and breathes; spray rises, swells and goes.
        float sway = sin(6.2832 * age);
        float rising = aLook.w;
        float up = 1.0 - (1.0 - age) * (1.0 - age);
        vec3 c = aBase.xyz + vec3(aMove.x, 0.0, aMove.z) * mix(sway * 0.5, age, rising) + vec3(0.0, aMove.y * mix(0.5 + 0.5 * sway, up, rising), 0.0);
        float size = aBase.w * mix(1.0 + 0.08 * sway, 0.55 + 0.9 * age, rising);
        vec4 mvPosition = viewMatrix * vec4(c, 1.0);
        float dist = length(mvPosition.xyz);
        float env = mix(0.75 + 0.25 * sway, smoothstep(0.0, 0.25, age) * (1.0 - smoothstep(0.45, 1.0, age)), rising);
        vA = aLook.x * env * uLevel * smoothstep(size * 0.35, size * 1.1, dist);
        vWarm = aLook.y;
        vSeed = aLook.z;
        vUv = position.xy * 2.0;
        mvPosition.xy += position.xy * size;
        gl_Position = projectionMatrix * mvPosition;
        if (vA < 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime;
      uniform vec3 uCool;
      uniform vec3 uWarm;
      varying vec2 vUv;
      varying float vA;
      varying float vWarm;
      varying float vSeed;
      ${NOISE_GLSL}
      void main() {
        float r = length(vUv);
        if (r > 1.0) discard;
        float n = wNoise(vUv * 1.6 + vSeed * 37.0 + vec2(uTime * 0.02, 0.0)) * 0.6 + wNoise(vUv * 3.7 + vSeed * 11.0) * 0.4;
        float a = exp(-r * r * 3.2) * (1.0 - r * r) * smoothstep(0.1, 0.85, n + 0.3 * (1.0 - r));
        gl_FragColor = vec4(mix(uCool, uWarm, vWarm), a * vA);
        #include <fog_fragment>
      }`,
  });
  const mesh = new Mesh(geo, material);
  mesh.name = 'nye:air';
  // (before the lights' glows, after the solid world)
  mesh.renderOrder = 8;
  mesh.frustumCulled = true;
  mesh.raycast = () => {};
  mesh.visible = false;
  return { mesh, u };
}
