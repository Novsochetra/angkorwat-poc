import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshLambertMaterial, Sphere, Vector3, type Group } from 'three';
import type { LifeUniforms } from './_sqLife';

/**
 * Winged life round the festival square (AWP-35; `_sqLife.ts` says where): butterflies in the gardens and round the
 * flowering trees and dragonflies over the Kulen stream by day; moths round the lamps and the string lights and bats
 * crossing the sky (and circling the stage's prasat, as flying foxes round Angkor Wat's towers) at night.
 *
 * All of them are one program, posed in the vertex shader from the clock (no matrix changes: the part is FROZEN):
 * each flyer loops round its spot on an ellipse (`r`, `w`; `uneven` makes it stop and dart, as a dragonfly hovers),
 * bobs, jitters, and may cross on a long straight pass that repeats (`pass`: the bats), fading in and out at its ends.
 * Its wings (a two-lobed wing each side and a thin body: 16 triangles) beat about its body's axis. Two meshes, the
 * day's and the night's, each one draw, hidden while their time is not on. Nothing is worked out on the CPU a frame.
 */

export interface Flyer {
  /** The middle of its loop (world m). */
  at: [number, number, number];
  /** 0 by day (butterflies, dragonflies), 1 at night (moths, bats). */
  night: 0 | 1;
  /** The loop: radius (m; across it a little less), angular speed (rad/s, signed), bob (m), unevenness 0‥0.9. */
  r: number;
  w: number;
  bob: number;
  uneven: number;
  /** A straight pass that repeats: direction (x, z: unit), length (m), period (s). */
  pass?: { dx: number; dz: number; len: number; period: number };
  /** Wingspan (m), the wing's chord over the span, beats a second, beat (rad). */
  span: number;
  chord: number;
  rate: number;
  beat: number;
  /** Quick small jinks (m). */
  jitter: number;
  /** Colour (sRGB) and its own light at night (0‥1: a moth in a lamp's light). */
  color: number;
  glow: number;
}

/** Floats an instance: fPos 4 (x, y, z, night), fPath 4, fPass 4, fWing 4, fSeed 4, fCol 4. */
const STRIDE = 24;

const VERTEX = /* glsl */ `
attribute float wSide;
attribute vec4 fPos;
attribute vec4 fPath;
attribute vec4 fPass;
attribute vec4 fWing;
attribute vec4 fSeed;
attribute vec4 fCol;
uniform float uLifeT;
uniform float uDayOn;
uniform float uFlyNight;
varying vec3 vWCol;
varying vec3 vWGlow;
`;

/** The pose (replaces three's normal and position starts): where it is on its loop and pass, its heading, its wings. */
const POSE = /* glsl */ `
  float t = uLifeT;
  float wt = fPath.y * t + fSeed.x;
  float th = wt + fPath.w * sin(wt);
  float dth = fPath.y * (1.0 + fPath.w * cos(wt));
  float r2 = fPath.x * (0.55 + 0.45 * fract(fSeed.x * 3.71));
  float lap = fract(t / fPass.w + fSeed.z);
  vec3 dir = vec3(fPass.x, 0.0, fPass.y);
  vec3 at = fPos.xyz + vec3(fPath.x * cos(th), fPath.z * sin(0.63 * wt + fSeed.y), r2 * sin(th)) + dir * (fPass.z * (lap - 0.5))
    + fSeed.w * vec3(sin(t * 9.1 + fSeed.y), 0.6 * sin(t * 7.3 + fSeed.z * 6.2831853), cos(t * 8.3 + fSeed.x));
  vec3 vel = vec3(-fPath.x * sin(th) * dth, 0.0, r2 * cos(th) * dth) + dir * (fPass.z / fPass.w);
  float yaw = atan(vel.x, vel.z + 1e-5);
  // (a pass fades in and out at its ends; a loop is always there)
  float ends = mix(1.0, smoothstep(0.0, 0.06, lap) * (1.0 - smoothstep(0.94, 1.0, lap)), step(0.5, fPass.z));
  float on = mix(uDayOn, uFlyNight, fPos.w) * ends;
  float flap = fWing.w * (0.3 + 0.7 * sin(6.2831853 * fWing.z * t + fSeed.y * 3.0));
  float side = abs(wSide);
  float span = fWing.x * on;
  float cy = cos(yaw);
  float sy = sin(yaw);
  mat3 turn = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy);
  vec3 local = vec3(
    mix(position.x * span * 0.05, wSide * position.x * 0.5 * span * cos(flap), side),
    side * position.x * 0.5 * span * sin(flap),
    position.z * span * mix(0.5, fWing.y, side));
  vec3 objectNormal = turn * mix(vec3(0.0, 1.0, 0.0), vec3(-wSide * sin(flap), cos(flap), 0.0), side);
  vec3 wingAt = at + turn * local;
  vWCol = fCol.rgb;
  vWGlow = fCol.rgb * fCol.w * uFlyNight;
`;

export class Wings {
  private readonly day: number[] = [];
  private readonly night: number[] = [];
  private readonly c = new Color();

  get count(): number {
    return (this.day.length + this.night.length) / STRIDE;
  }

  /** A flyer; `seed` four values 0‥1 of its own (phases). */
  add(f: Flyer, seed: [number, number, number, number]): void {
    this.c.setHex(f.color);
    const p = f.pass;
    const tau = Math.PI * 2;
    (f.night ? this.night : this.day).push(
      f.at[0],
      f.at[1],
      f.at[2],
      f.night,
      f.r,
      f.w,
      f.bob,
      f.uneven,
      p ? p.dx : 1,
      p ? p.dz : 0,
      p ? p.len : 0,
      p ? p.period : 1,
      f.span,
      f.chord,
      f.rate,
      f.beat,
      seed[0] * tau,
      seed[1] * tau,
      seed[2],
      f.jitter,
      this.c.r,
      this.c.g,
      this.c.b,
      f.glow,
    );
  }

  /** The day's and the night's meshes into `parent` (one material); `update` shows each only while its time is on. */
  build(parent: Group, u: LifeUniforms): { update(): void } {
    const material = new MeshLambertMaterial({ color: 0xffffff, side: DoubleSide });
    material.name = 'nye:life:wings';
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${VERTEX}`)
        .replace('#include <beginnormal_vertex>', POSE)
        .replace('#include <begin_vertex>', 'vec3 transformed = wingAt;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWCol;\nvarying vec3 vWGlow;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= vWCol;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vWGlow;');
    };
    material.customProgramCacheKey = () => 'nye-life-wings';
    const shape = wingGeometry();
    const meshes = [this.day, this.night].map((data, k) => {
      if (!data.length) return null;
      const n = data.length / STRIDE;
      const geo = new InstancedBufferGeometry();
      geo.setIndex(shape.getIndex());
      for (const name of ['position', 'normal', 'wSide']) geo.setAttribute(name, shape.getAttribute(name));
      const take = (off: number) => {
        const a = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) for (let j = 0; j < 4; j++) a[i * 4 + j] = data[i * STRIDE + off + j];
        return new InstancedBufferAttribute(a, 4);
      };
      ['fPos', 'fPath', 'fPass', 'fWing', 'fSeed', 'fCol'].forEach((name, j) => geo.setAttribute(name, take(j * 4)));
      geo.instanceCount = n;
      geo.boundingSphere = reach(data);
      const mesh = new Mesh(geo, material);
      mesh.name = k ? 'nye:life:night flyers' : 'nye:life:day flyers';
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.raycast = () => {};
      parent.add(mesh);
      return mesh;
    });
    return {
      update() {
        if (meshes[0]) meshes[0].visible = u.uDayOn.value > 0.002;
        if (meshes[1]) meshes[1].visible = u.uFlyNight.value > 0.002;
      },
    };
  }
}

/** The sphere that holds every flyer of a list wherever it flies (its loop, bob, jinks and pass). */
function reach(data: number[]): Sphere {
  const pts: Vector3[] = [];
  let far = 0;
  for (let o = 0; o < data.length; o += STRIDE) {
    pts.push(new Vector3(data[o], data[o + 1], data[o + 2]));
    far = Math.max(far, data[o + 4] + data[o + 6] + data[o + 10] / 2 + data[o + 19] * 1.6 + data[o + 12]);
  }
  const s = new Sphere().setFromPoints(pts);
  s.radius += far;
  return s;
}

/**
 * One flyer's mesh, before the shader poses it: a wing each side (`wSide` ±1; x 0 at the body → 1 at the tip, z forward,
 * a forewing and a hindwing in one outline, fanned from the hinge) and a thin body along z (`wSide` 0).
 */
function wingGeometry(): BufferGeometry {
  const outline: [number, number][] = [
    [0, 0.18],
    [0.42, 0.5],
    [0.92, 0.44],
    [1.0, 0.12],
    [0.62, -0.06],
    [0.74, -0.38],
    [0.42, -0.62],
    [0, -0.34],
  ];
  const pos: number[] = [];
  const side: number[] = [];
  const idx: number[] = [];
  for (const s of [-1, 1]) {
    const base = pos.length / 3;
    pos.push(0, 0, -0.06);
    side.push(s);
    for (const [x, z] of outline) {
      pos.push(x, 0, z);
      side.push(s);
    }
    for (let i = 0; i < outline.length - 1; i++) idx.push(base, base + 1 + i, base + 2 + i);
  }
  const body = pos.length / 3;
  for (const [x, z] of [
    [-1, -0.62],
    [1, -0.62],
    [1, 0.5],
    [-1, 0.5],
  ]) {
    pos.push(x, 0, z);
    side.push(0);
  }
  idx.push(body, body + 1, body + 2, body, body + 2, body + 3);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setAttribute('wSide', new Float32BufferAttribute(side, 1));
  geo.setIndex(idx);
  return geo;
}
