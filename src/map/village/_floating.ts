import { InstancedBufferAttribute, type InstancedMesh, type Material, type Object3D } from 'three';
import { traceSource, type SourceTrace } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { Frame } from '../landmarks/_prasatKit';
import { houseBody, type HouseBody } from './_house';
import { BAMBOO, BLOOM, DECK, jar, laundry, LEAF, Local, potPlant, ROOFS, skiff, tone, type GlowFn } from './_kit';
import { LAKE_LEVEL, type FloatSpec } from './_spots';

/**
 * What floats in the village and bobs on the lake: the floating houses on
 * bamboo rafts buoyed by blue drums (a shop by the jetty's head, a fish
 * farm, a floating garden), the boats moored at the stilt houses' ladders,
 * clusters of water hyacinth. All in one voxel build; each raft bobs and
 * rocks very gently on its own (`Bobbing`: in the vertex shader, each block
 * turned about its raft's middle; the lit panes on the rafts, a few, on the
 * CPU when the camera is near).
 */

/** One thing that floats: its pivot on the water, how far it heaves (m) and rocks (rad), and when. */
export interface Raft {
  x: number;
  z: number;
  heave: number;
  rock: number;
  phase: number;
}

export class Floaters {
  readonly b = new VoxelBuilder();
  /** The raft of every box in `b`, in order. */
  readonly owner: number[] = [];
  readonly rafts: Raft[] = [];

  add(x: number, z: number, heave: number, rock: number): number {
    this.rafts.push({ x, z, heave, rock, phase: hash3(Math.round(x * 10), Math.round(z * 10), 5, 61) * Math.PI * 2 });
    return this.rafts.length - 1;
  }

  /** Build into raft `owner` in a local frame. */
  put(fr: Frame, owner: number, seed: number, src: SourceTrace | undefined, fn: (L: Local) => void): void {
    const lb = new VoxelBuilder();
    fn(new Local(lb, src, seed));
    fr.place(lb, this.b);
    for (let i = 0; i < lb.boxes.length; i++) this.owner.push(owner);
  }
}

const DRUM = [0x2f6fa8, 0x2a64a0, 0x3a7ab4];

/**
 * A floating house (or the shop, the garden, the fish farm) on its raft.
 * `glow(owner)` gives the glow function for panes that bob with the raft.
 */
export function floatingHome(fl: Floaters, f: FloatSpec, glowOf: (owner: number, fr: Frame) => GlowFn): void {
  const src = traceSource();
  const fr = new Frame(f.x, 0, f.z, f.facing);
  const own = fl.add(f.x, f.z, 0.05, 0.012);
  const W = f.w;
  const D = f.d;
  const top = LAKE_LEVEL + 0.35;
  fl.put(fr, own, f.seed * 131, src, (L) => {
    // The raft: bundles of bamboo across it, blue drums under its long edges, a plank deck.
    for (let z = -D / 2, i = 0; z < D / 2 - 0.05; z += 0.45, i++) L.span(-W / 2, LAKE_LEVEL - 0.15, z, W / 2, LAKE_LEVEL + 0.15, Math.min(D / 2, z + 0.45), tone(BAMBOO, L.r(i, 1)), 'mapBark', 0.9);
    for (const side of [-1, 1])
      for (let x = -W / 2 + 0.6; x < W / 2 - 0.3; x += 1.4) L.box(x, LAKE_LEVEL - 0.05, side * (D / 2 - 0.35), 0.62, 0.55, 0.62, tone(DRUM, L.r(x, side)), 'metal');
    if (f.kind !== 'cage')
      for (let x = -W / 2 + 0.2, i = 0; x < W / 2 - 0.1; x += 0.5, i++) L.span(x, LAKE_LEVEL + 0.15, -D / 2 + 0.15, Math.min(W / 2 - 0.2, x + 0.5), top, D / 2 - 0.15, tone(DECK, L.r(i, 2)), 'mapBark');
  });

  if (f.kind === 'house' || f.kind === 'shop') {
    const body: HouseBody = { w: W - 1.2, d: D - 2.2, v: 1.6, floor: top, roof: f.roof, walls: f.walls, lit: f.lit, shop: f.kind === 'shop', gap: 0 };
    // (the house sits back on the raft: a strip of open deck in front)
    const hf = new Frame(fr.wx(0, -0.3), 0, fr.wz(0, -0.3), f.facing);
    fl.put(hf, own, f.seed * 131 + 1, src, (L) => {
      houseBody(L, body, glowOf(own, hf));
    });
    fl.put(fr, own, f.seed * 131 + 2, src, (L) => {
      // Life on the deck: jars, pots, washing, a skiff alongside, an antenna on a bamboo pole.
      jar(L, -W / 2 + 0.5, top, D / 2 - 0.5);
      if (f.kind === 'house') {
        potPlant(L, W / 2 - 0.5, top, D / 2 - 0.5, true);
        potPlant(L, W / 2 - 1.2, top, D / 2 - 0.45);
        laundry(L, -W / 2 + 0.25, -D / 2 + 0.6, -W / 2 + 0.25, D / 2 - 1.2, top + 2.0);
      } else {
        for (let i = 0; i < 3; i++) L.box(-W / 2 + 1.4 + i * 0.5, top + 0.2, D / 2 - 0.45, 0.45, 0.4, 0.35, tone([0x2a8a4a, 0xd8a030, 0xc83a2a], L.r(i, 5)), 'petal');
      }
      L.box(W / 2 - 0.3, top + 3.2, -D / 2 + 0.4, 0.1, 6.4, 0.1, tone(BAMBOO, 0.3), 'mapBark');
      L.box(W / 2 - 0.3, top + 6.1, -D / 2 + 0.4, 1.2, 0.05, 0.05, 0x8a8a8a, 'metal');
      L.box(W / 2 - 0.3, top + 5.8, -D / 2 + 0.4, 0.8, 0.05, 0.05, 0x8a8a8a, 'metal');
      skiff(L, 0, LAKE_LEVEL, -D / 2 - 0.75, 4.2, f.seed);
    });
  } else if (f.kind === 'garden') {
    fl.put(fr, own, f.seed * 131 + 3, src, (L) => {
      // Beds of earth in wooden frames, rows of greens (morning glory, herbs), a trellis of gourds.
      for (let row = 0; row < 3; row++) {
        const z0 = -D / 2 + 0.5 + row * 1.25;
        L.span(-W / 2 + 0.4, top, z0, W / 2 - 0.4, top + 0.3, z0 + 0.9, 0x5a3e28, 'mapBark');
        for (let x = -W / 2 + 0.7, i = 0; x < W / 2 - 0.5; x += 0.55, i++) {
          const h = 0.25 + L.r(i, row, 6) * 0.35;
          L.box(x, top + 0.3 + h / 2, z0 + 0.45, 0.45, h, 0.6, tone(LEAF, L.r(i, row, 7)), 'mapLeaf');
          if (L.r(i, row, 8) < 0.15) L.box(x, top + 0.35 + h, z0 + 0.45, 0.25, 0.15, 0.25, tone(BLOOM, L.r(i, row, 9)), 'petal');
        }
      }
      for (const x of [-W / 2 + 0.5, W / 2 - 0.5]) L.box(x, top + 1.1, D / 2 - 0.4, 0.1, 2.2, 0.1, tone(BAMBOO, 0.5), 'mapBark');
      L.span(-W / 2 + 0.5, top + 2.1, D / 2 - 0.45, W / 2 - 0.5, top + 2.2, D / 2 - 0.35, tone(BAMBOO, 0.7), 'mapBark');
      for (let x = -W / 2 + 0.8, i = 0; x < W / 2 - 0.6; x += 0.7, i++) {
        L.box(x, top + 1.6, D / 2 - 0.4, 0.5, 1.0 - L.r(i, 10) * 0.4, 0.3, tone(LEAF, L.r(i, 11)), 'mapLeaf');
        if (i % 2) L.box(x + 0.1, top + 1.3, D / 2 - 0.3, 0.2, 0.35, 0.2, 0xa8b850, 'mapLeaf');
      }
    });
  } else {
    // The fish farm: a square of floating walkways round a netted pen, a hut on one corner.
    fl.put(fr, own, f.seed * 131 + 4, src, (L) => {
      const walk = 0.9;
      for (const s of [-1, 1]) {
        L.span(-W / 2, LAKE_LEVEL + 0.15, s > 0 ? D / 2 - walk : -D / 2, W / 2, top, s > 0 ? D / 2 : -D / 2 + walk, tone(DECK, L.r(s, 12)), 'mapBark');
        L.span(s > 0 ? W / 2 - walk : -W / 2, LAKE_LEVEL + 0.15, -D / 2 + walk, s > 0 ? W / 2 : -W / 2 + walk, top, D / 2 - walk, tone(DECK, L.r(s, 13)), 'mapBark');
      }
      // Net posts and the net's rim just over the water.
      const inner = W / 2 - walk;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const x = Math.max(-inner, Math.min(inner, Math.cos(a) * inner * 1.4));
        const z = Math.max(-inner, Math.min(inner, Math.sin(a) * inner * 1.4));
        L.box(x * 0.92, top + 0.4, z * 0.92, 0.08, 0.8, 0.08, tone(BAMBOO, L.r(i, 14)), 'mapBark');
      }
      L.span(-inner + 0.1, LAKE_LEVEL + 0.02, -inner + 0.1, inner - 0.1, LAKE_LEVEL + 0.06, inner - 0.1, 0x2c3a34, 'petal');
      // The keeper's hut.
      const hx = W / 2 - 1.6;
      const hz = -D / 2 + 1.6;
      for (const [dx, dz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ])
        L.box(hx + dx * 1.2, top + 1.1, hz + dz * 1.2, 0.14, 2.2, 0.14, tone(BAMBOO, L.r(dx, dz)), 'mapBark');
      for (let k = 0; k < 4; k++) L.span(hx - 1.5 + k * 0.3, top + 2.2 + k * 0.3, hz - 1.5, hx + 1.5 - k * 0.3, top + 2.55 + k * 0.3, hz + 1.5, tone(ROOFS.thatch, L.r(k, 15)), 'mapBark');
      L.span(hx - 1.2, top, hz - 1.2, hx + 1.2, top + 0.9, hz - 1.1, tone(BAMBOO, 0.2), 'mapBark');
      jar(L, hx, top, hz + 0.3, 0.8);
    });
  }
}

/** A cluster of water hyacinth floating at (x, z): round leaves, a few lilac flower spikes. */
export function hyacinth(fl: Floaters, x: number, z: number, n: number, seed: number): void {
  const own = fl.add(x, z, 0.03, 0.02);
  const fr = new Frame(x, 0, z, hash3(seed, 1, 2, 62) * Math.PI);
  fl.put(fr, own, seed, traceSource(), (L) => {
    for (let i = 0; i < n; i++) {
      const a = L.r(i, 1, 63) * Math.PI * 2;
      const d = Math.sqrt(L.r(i, 2, 64)) * (0.5 + n * 0.12);
      const s = 0.45 + L.r(i, 3, 65) * 0.35;
      const px = Math.cos(a) * d;
      const pz = Math.sin(a) * d;
      L.box(px, LAKE_LEVEL + 0.1, pz, s, 0.22, s, tone(LEAF, L.r(i, 4, 66)), 'mapLeaf', 1.05);
      if (L.r(i, 5, 67) < 0.3) L.box(px, LAKE_LEVEL + 0.34, pz, 0.14, 0.26, 0.14, tone([0xb89ad8, 0xa888d0, 0xc4a8e0], L.r(i, 6, 68)), 'petal');
    }
  });
}

/** A boat moored at (x, z) (along the heading `yaw`), bobbing a little. */
export function mooredSkiff(fl: Floaters, x: number, z: number, yaw: number, seed: number, len = 4.2): void {
  const own = fl.add(x, z, 0.04, 0.02);
  // (the skiff is built along local x: turn it so x runs along `yaw`)
  fl.put(new Frame(x, 0, z, yaw - Math.PI / 2), own, seed, traceSource(), (L) => skiff(L, 0, LAKE_LEVEL, 0, len, seed));
}

/** The bobbing's clock (s) and the lake's level, shared by every bobbing material. */
const BOB = { uBobTime: { value: 0 }, uBobLevel: { value: LAKE_LEVEL } };

/**
 * A raft's heave and rock in the vertex shader, as `Bobbing.update` works
 * it out on the CPU: the instance matrix turned about the raft's middle on
 * the water (`aBob` = middle x, z, phase, heave; `aBobRock` = rock). Every
 * use of the instance matrix after it (the block's size and bevel, place,
 * normal, shadow) takes the bobbing one.
 */
const BOB_GLSL = /* glsl */ `
attribute vec4 aBob;
attribute float aBobRock;
uniform float uBobTime;
uniform float uBobLevel;
mat4 voxBobIM;
mat4 voxBobbed() {
  float w = uBobTime * (0.9 + fract(aBob.z) * 0.3);
  float dy = aBob.w * sin(w + aBob.z);
  float ax = aBobRock * sin(w * 0.77 + aBob.z * 1.7);
  float az = aBobRock * sin(w * 1.13 + aBob.z * 0.6);
  float cx = cos(ax);
  float sx = sin(ax);
  float cz = cos(az);
  float sz = sin(az);
  mat3 R = mat3(cz, cx * sz, sx * sz, -sz, cx * cz, sx * cz, 0.0, -sx, cx);
  vec3 p = vec3(aBob.x, uBobLevel, aBob.y);
  vec3 s = p - R * p + vec3(0.0, dy, 0.0);
  return mat4(vec4(R[0], 0.0), vec4(R[1], 0.0), vec4(R[2], 0.0), vec4(s, 1.0)) * instanceMatrix;
}
#define instanceMatrix voxBobIM
`;

const twins = new Map<Material, Material>();

/**
 * The bobbing twin of a shared voxel material (or its shadow's): the same
 * shading and the same look uniforms (its own compile adds the bobbing),
 * so a family costs one more program, compiled at load (village/index.ts
 * draws the village's meshes wherever the camera is in the first frames).
 */
function bobbingTwin<M extends Material>(base: M): M {
  const hit = twins.get(base);
  if (hit) return hit as M;
  const m = base.clone();
  const defines = (base as { defines?: Record<string, unknown> }).defines;
  (m as { defines?: Record<string, unknown> }).defines = { ...(defines ?? {}) };
  // (the base's own compile and key as they are then: roam/_nearFade.ts adds its fade to the leaf and bark families later)
  m.onBeforeCompile = (shader, renderer) => {
    base.onBeforeCompile(shader, renderer);
    Object.assign(shader.uniforms, BOB);
    shader.vertexShader = shader.vertexShader.replace('void main() {', `${BOB_GLSL}\nvoid main() {\n  voxBobIM = voxBobbed();`);
  };
  m.customProgramCacheKey = () => `${base.customProgramCacheKey()}:bob-v1`;
  twins.set(base, m);
  return m;
}

/**
 * Bobbing: each box of the floating build moves with its raft (heave, and a
 * slow rock about the raft's middle): the voxel meshes in the vertex shader
 * (`trackVoxels`: nothing to do on the CPU), the lit panes on the CPU
 * (`track`: their instance matrices turned every `update`, a few dozen).
 * The walk map and the boat keep the rafts still (a few centimetres).
 */
export class Bobbing {
  private readonly items: { mesh: InstancedMesh; base: Float32Array; owner: Uint16Array }[] = [];
  private readonly m: Float32Array;

  constructor(private readonly rafts: readonly Raft[]) {
    this.m = new Float32Array(rafts.length * 12);
  }

  /** Bob the instanced meshes under `root` built from `b` in the vertex shader (the boxes of family `mat` are that mesh's instances, in order). */
  trackVoxels(root: Object3D, boxes: readonly { mat: string }[], owner: readonly number[]): void {
    root.traverse((o) => {
      const mesh = o as InstancedMesh;
      if (!mesh.isInstancedMesh) return;
      const mat = mesh.name.slice(mesh.name.lastIndexOf(':') + 1);
      const list: number[] = [];
      boxes.forEach((b, i) => {
        if (b.mat === mat) list.push(owner[i]);
      });
      if (list.length !== mesh.count) return;
      const bob = new Float32Array(list.length * 4);
      const rock = new Float32Array(list.length);
      list.forEach((own, i) => {
        const r = this.rafts[own];
        bob.set([r.x, r.z, r.phase, r.heave], i * 4);
        rock[i] = r.rock;
      });
      mesh.geometry.setAttribute('aBob', new InstancedBufferAttribute(bob, 4));
      mesh.geometry.setAttribute('aBobRock', new InstancedBufferAttribute(rock, 1));
      mesh.material = bobbingTwin(mesh.material as Material);
      if (mesh.customDepthMaterial) mesh.customDepthMaterial = bobbingTwin(mesh.customDepthMaterial);
    });
  }

  /** Bob an instanced mesh on the CPU (`owner`: the raft of each instance). */
  track(mesh: InstancedMesh, owner: readonly number[]): void {
    this.items.push({ mesh, base: (mesh.instanceMatrix.array as Float32Array).slice(), owner: Uint16Array.from(owner) });
  }

  /** The shaders' clock (every frame). */
  clock(t: number): void {
    BOB.uBobTime.value = t;
  }

  /** Turn the CPU-bobbed meshes to time `t`. */
  update(t: number): void {
    if (!this.items.length) return;
    // Each raft's turn (3 × 3) and shift, about its middle on the water.
    const m = this.m;
    this.rafts.forEach((r, i) => {
      const w = 0.9 + (r.phase % 1) * 0.3;
      const dy = r.heave * Math.sin(t * w + r.phase);
      const ax = r.rock * Math.sin(t * w * 0.77 + r.phase * 1.7);
      const az = r.rock * Math.sin(t * w * 1.13 + r.phase * 0.6);
      const cx = Math.cos(ax);
      const sx = Math.sin(ax);
      const cz = Math.cos(az);
      const sz = Math.sin(az);
      // R = Rx(ax) · Rz(az), column-major 3 × 3.
      const o = i * 12;
      m[o] = cz;
      m[o + 1] = cx * sz;
      m[o + 2] = sx * sz;
      m[o + 3] = -sz;
      m[o + 4] = cx * cz;
      m[o + 5] = sx * cz;
      m[o + 6] = 0;
      m[o + 7] = -sx;
      m[o + 8] = cx;
      // Shift: p − R p + (0, dy, 0), p = (x, level, z).
      const px = r.x;
      const py = LAKE_LEVEL;
      const pz = r.z;
      m[o + 9] = px - (m[o] * px + m[o + 3] * py + m[o + 6] * pz);
      m[o + 10] = py - (m[o + 1] * px + m[o + 4] * py + m[o + 7] * pz) + dy;
      m[o + 11] = pz - (m[o + 2] * px + m[o + 5] * py + m[o + 8] * pz);
    });
    for (const { mesh, base, owner } of this.items) {
      const a = mesh.instanceMatrix.array as Float32Array;
      for (let i = 0; i < owner.length; i++) {
        const o = owner[i] * 12;
        const k = i * 16;
        for (let c = 0; c < 4; c++) {
          const b0 = base[k + c * 4];
          const b1 = base[k + c * 4 + 1];
          const b2 = base[k + c * 4 + 2];
          a[k + c * 4] = m[o] * b0 + m[o + 3] * b1 + m[o + 6] * b2;
          a[k + c * 4 + 1] = m[o + 1] * b0 + m[o + 4] * b1 + m[o + 7] * b2;
          a[k + c * 4 + 2] = m[o + 2] * b0 + m[o + 5] * b1 + m[o + 8] * b2;
        }
        a[k + 12] += m[o + 9];
        a[k + 13] += m[o + 10];
        a[k + 14] += m[o + 11];
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
