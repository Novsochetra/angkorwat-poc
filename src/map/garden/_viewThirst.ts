import { BufferGeometry, Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Sphere, Vector3 } from 'three';
import { getVoxelMaterial, VOXEL_MATERIALS } from '../../voxel/materials';
import { getVoxelDepthMaterial } from '../../voxel/shadow';
import { openSidesIndex, unitVoxelGeometry } from '../../voxel/VoxelMesh';

/**
 * A drop of water over each plant of his that wants it (garden/state.ts
 * `thirsty`): a little teardrop of blocks (a light-blue body narrowing to its
 * tip, a white glint), floating just over the plant's top, bobbing and turning
 * slowly. Wilting badly (`droop` 2) it pulses quicker and a second tiny drop
 * and an orange rim show beside it: water it now. Watered, it bursts into a few
 * splashes (the view's effects: `pop`) and is gone; otherwise it eases in and
 * out. Shown while the camera is near the garden (`NEAR` m: roaming there, not
 * the overview), in shots only with `gardenthirst=1`.
 *
 * One instanced mesh of `petal` blocks (the map's family, cut edges: the
 * drop reads round), a fixed pool (no allocation a frame), nothing drawn when
 * no drop shows. No shadows.
 */

/** The drop's blocks (local m, foot of the drop at 0; scaled by `SIZE`): x, y, z, size x, y, z, colour, urgent only. */
const BODY: readonly (readonly [number, number, number, number, number, number, number, number])[] = [
  // the round body (two blocks across each other: round from every side), its shoulder, the tip
  [0, 0.11, 0, 0.22, 0.17, 0.17, 0x4aa8e6, 0],
  [0, 0.11, 0, 0.17, 0.17, 0.22, 0x4aa8e6, 0],
  [0, 0.11, 0, 0.19, 0.21, 0.19, 0x58b2ea, 0],
  [0, 0.25, 0, 0.13, 0.1, 0.13, 0x6cc0f0, 0],
  [0, 0.33, 0, 0.08, 0.08, 0.08, 0x84ccf4, 0],
  [0, 0.4, 0, 0.04, 0.07, 0.04, 0x9cd8f6, 0],
  // the glint (white, on its front)
  [0.05, 0.15, 0.09, 0.045, 0.07, 0.03, 0xf4fbff, 0],
  // urgent: a second tiny drop beside it, and an orange rim round its foot
  [0.2, 0.06, 0.02, 0.09, 0.1, 0.09, 0x4aa8e6, 1],
  [0, 0.02, 0, 0.27, 0.025, 0.27, 0xf0902a, 1],
];
const N = BODY.length;
/** Its size on the map (it reads from the follow camera at 20 m, and on a phone). */
const SIZE = 2.1;
/** Shown within this far of the camera (m), and eased in over this far again. */
const NEAR = 45;
const NEAR_FADE = 8;
const CAP = 64;

interface Slot {
  /** The plant's id. */
  id: number;
  /** Shown now (0‥1), wanted (0, 1), urgent (0‥1 eased). */
  k: number;
  want: number;
  urgent: number;
  x: number;
  y: number;
  z: number;
  /** Its phase (bob, turn: its own), and seen this frame. */
  phase: number;
  seen: boolean;
  thirsty: boolean;
}

const _c = new Color();
const _eye = new Vector3();

export class ThirstDrops {
  readonly mesh: InstancedMesh;
  private readonly m: Float32Array;
  private readonly col: Float32Array;
  private readonly base: Float32Array;
  private readonly slots: Slot[] = [];
  /** Shots: off unless `gardenthirst=1`. */
  private readonly on: boolean;
  private time = 0;

  constructor(shot: boolean) {
    this.on = !shot || new URLSearchParams(location.search).get('gardenthirst') === '1';
    const spec = VOXEL_MATERIALS.petal;
    const unit = unitVoxelGeometry(spec.bevel, 1, spec.chamfer ?? false);
    const geo = new BufferGeometry();
    geo.setIndex(openSidesIndex(unit, 63));
    geo.setAttribute('position', unit.getAttribute('position'));
    geo.setAttribute('normal', unit.getAttribute('normal'));
    this.m = new Float32Array(CAP * N * 16);
    this.col = new Float32Array(CAP * N * 3);
    geo.setAttribute('voxOpen', new InstancedBufferAttribute(new Float32Array(CAP * N).fill(63), 1));
    geo.setAttribute('voxRadius', new InstancedBufferAttribute(new Float32Array(CAP * N), 1));
    const mesh = new InstancedMesh(geo, getVoxelMaterial('petal'), 0);
    mesh.instanceMatrix = new InstancedBufferAttribute(this.m, 16).setUsage(DynamicDrawUsage);
    mesh.instanceColor = new InstancedBufferAttribute(this.col, 3).setUsage(DynamicDrawUsage);
    mesh.customDepthMaterial = getVoxelDepthMaterial('petal');
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.name = 'garden:thirst:petal';
    mesh.boundingSphere = new Sphere(new Vector3(), 0);
    mesh.count = 0;
    mesh.visible = false;
    this.mesh = mesh;
    this.base = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      _c.setHex(BODY[i][6]);
      this.base[i * 3] = _c.r;
      this.base[i * 3 + 1] = _c.g;
      this.base[i * 3 + 2] = _c.b;
    }
  }

  /** A plant this frame: does it want water (and how badly), and where its drop floats (m, the map). */
  set(id: number, thirsty: boolean, urgent: boolean, x: number, y: number, z: number): void {
    if (!this.on) return;
    let s: Slot | null = null;
    for (let i = 0; i < this.slots.length; i++) if (this.slots[i].id === id) s = this.slots[i];
    if (!s) {
      if (!thirsty || this.slots.length >= CAP) return;
      this.slots.push((s = { id, k: 0, want: 0, urgent: 0, x, y, z, phase: (id * 2.39996) % (Math.PI * 2), seen: true, thirsty }));
    }
    s.seen = true;
    s.thirsty = thirsty;
    s.want = thirsty ? 1 : 0;
    s.urgent += ((urgent ? 1 : 0) - s.urgent) * 0.1;
    s.x = x;
    s.y = y;
    s.z = z;
  }

  /**
   * Each frame, after the plants' `set`: the drops eased, written (`camera`: shown near it only). Returns the drops
   * that burst this frame (watered) into `burst` (x, y, z each), their count.
   */
  frame(dt: number, camera: { matrixWorld: { elements: ArrayLike<number> } }, burst: Float32Array): number {
    const mesh = this.mesh;
    if (!this.on || !this.slots.length) {
      if (mesh.visible) mesh.visible = false;
      return 0;
    }
    this.time += dt;
    const e = camera.matrixWorld.elements;
    _eye.set(e[12], e[13], e[14]);
    const m = this.m;
    const col = this.col;
    let n = 0;
    let bursts = 0;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let si = this.slots.length - 1; si >= 0; si--) {
      const s = this.slots[si];
      // (a plant gone: its drop goes)
      if (!s.seen) s.want = 0;
      s.seen = false;
      const d = Math.hypot(s.x - _eye.x, s.y - _eye.y, s.z - _eye.z);
      const near = Math.max(0, Math.min(1, (NEAR + NEAR_FADE - d) / NEAR_FADE));
      const want = s.want * near;
      // Watered while shown: it bursts (splashes) and is gone at once.
      if (s.k > 0.5 && !s.thirsty && near > 0.5 && dt > 0) {
        if (bursts * 3 + 2 < burst.length) {
          burst[bursts * 3] = s.x;
          burst[bursts * 3 + 1] = s.y + 0.25 * SIZE;
          burst[bursts * 3 + 2] = s.z;
          bursts++;
        }
        s.k = 0;
      } else s.k += (want - s.k) * (dt > 0 ? 1 - Math.exp(-dt * 5) : 1);
      if (s.k < 0.01 && want === 0) {
        this.slots[si] = this.slots[this.slots.length - 1];
        this.slots.pop();
        continue;
      }
      if (s.k < 0.01) continue;
      const t = this.time + s.phase;
      const pulse = 1 + (0.06 + 0.1 * s.urgent) * Math.sin(t * (2.4 + 3.6 * s.urgent));
      const sc = SIZE * s.k * pulse;
      const turn = t * 0.7;
      const c = Math.cos(turn);
      const sn = Math.sin(turn);
      const by = s.y + 0.07 * Math.sin(t * 1.9);
      for (let i = 0; i < N; i++) {
        const b = BODY[i];
        const u = b[7] ? s.urgent : 1;
        if (u < 0.05) continue;
        const k = sc * (b[7] ? u : 1);
        const o = n * 16;
        m[o] = c * b[3] * k;
        m[o + 1] = 0;
        m[o + 2] = -sn * b[3] * k;
        m[o + 3] = 0;
        m[o + 4] = 0;
        m[o + 5] = b[4] * k;
        m[o + 6] = 0;
        m[o + 7] = 0;
        m[o + 8] = sn * b[5] * k;
        m[o + 9] = 0;
        m[o + 10] = c * b[5] * k;
        m[o + 11] = 0;
        m[o + 12] = s.x + (c * b[0] + sn * b[2]) * sc;
        m[o + 13] = by + b[1] * sc;
        m[o + 14] = s.z + (-sn * b[0] + c * b[2]) * sc;
        m[o + 15] = 1;
        col[n * 3] = this.base[i * 3];
        col[n * 3 + 1] = this.base[i * 3 + 1];
        col[n * 3 + 2] = this.base[i * 3 + 2];
        n++;
      }
      x0 = Math.min(x0, s.x);
      x1 = Math.max(x1, s.x);
      y0 = Math.min(y0, by);
      y1 = Math.max(y1, by + 0.5 * SIZE);
      z0 = Math.min(z0, s.z);
      z1 = Math.max(z1, s.z);
    }
    mesh.count = n;
    mesh.visible = n > 0;
    if (n) {
      mesh.boundingSphere!.center.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      mesh.boundingSphere!.radius = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + SIZE;
      const im = mesh.instanceMatrix;
      im.clearUpdateRanges();
      im.addUpdateRange(0, n * 16);
      im.needsUpdate = true;
      const ic = mesh.instanceColor!;
      ic.clearUpdateRanges();
      ic.addUpdateRange(0, n * 3);
      ic.needsUpdate = true;
    }
    return bursts;
  }

  /** Drops shown now (stats). */
  get shown(): number {
    return this.slots.length;
  }

  dispose(): void {
    const geo = this.mesh.geometry;
    geo.setIndex(null);
    geo.deleteAttribute('position');
    geo.deleteAttribute('normal');
    geo.dispose();
    this.mesh.dispose();
  }
}
