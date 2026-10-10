import { type Box3, BufferGeometry, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, type Sphere } from 'three';
import type { SourceTrace } from '../../feedback/sourceTrace';
import { getVoxelMaterial, VOXEL_MATERIALS, type VoxelMaterialKey, type VoxelMaterialSpec } from '../../voxel/materials';
import { getVoxelDepthMaterial } from '../../voxel/shadow';
import { openSidesIndex, unitVoxelGeometry } from '../../voxel/VoxelMesh';
import type { Blocks } from './_viewLook';

/**
 * One family's blocks of the garden (garden/view.ts): one InstancedMesh (one
 * draw), its instances handed out in runs, a run a plant's blocks of that
 * family (`alloc`): a plant that changes writes its own run again and nothing
 * else, and only that range goes up to the GPU (`flush`). A run let go is a
 * hole (its blocks shrunk to nothing where the garden is) until a plant's run
 * fits in it; when the end is reached the runs are packed together, and only
 * when that is not enough the buffers grow (twice as big: the same mesh, new
 * buffers, the old ones freed).
 *
 * The mesh is a voxel mesh as VoxelMesh.ts `unpackVoxelMesh` makes them (the
 * family's material and shadow caster, `voxelShape` for the graphics level's
 * plain boxes: graphics.ts `setGraphics`), so the map's shaders draw it: no
 * new program.
 */

export interface Run {
  start: number;
  /** Slots it holds, and how many it uses (the rest are shrunk away). */
  cap: number;
  n: number;
}

/** A matrix that draws nothing (a hole): 0.1 mm at the garden's middle. */
const TINY = 1e-4;

export class Pool {
  readonly mesh: InstancedMesh;
  private cap: number;
  private top = 0;
  private holes: Run[] = [];
  private live: Run[] = [];
  private m: Float32Array;
  private c: Float32Array;
  private o: Float32Array;
  private r: Float32Array;
  private src: (SourceTrace | undefined)[];
  /** Dirty ranges (slots) of the matrices, the colours, the open sides and bevels. */
  private mLo = Infinity;
  private mHi = -1;
  private cLo = Infinity;
  private cHi = -1;
  private aLo = Infinity;
  private aHi = -1;
  /** Where the holes are parked (the garden's middle). */
  park = { x: 0, y: 0, z: 0 };
  /** The family's cut block and plain box, and which one it draws now. */
  private readonly cut: BufferGeometry;
  private readonly box: BufferGeometry;
  private isPlain: boolean;
  /** Grown or packed (stats). */
  grows = 0;
  packs = 0;

  constructor(
    readonly mat: VoxelMaterialKey,
    name: string,
    plain: boolean,
    cap: number,
    sphere: Sphere,
    box: Box3,
  ) {
    this.cap = cap;
    this.m = new Float32Array(cap * 16);
    this.c = new Float32Array(cap * 3);
    this.o = new Float32Array(cap);
    this.r = new Float32Array(cap);
    this.src = new Array<SourceTrace | undefined>(cap);
    const spec = VOXEL_MATERIALS[mat] as VoxelMaterialSpec;
    const flat = spec.chamfer ?? false;
    // (as packVoxelMesh: chamfered families get one cut from medium up; the far shapes are plain boxes)
    this.cut = unitVoxelGeometry(spec.bevel, 1, flat);
    this.box = unitVoxelGeometry(spec.bevel, 0);
    const unit = plain ? this.box : this.cut;
    this.isPlain = plain;
    const geo = new BufferGeometry();
    geo.setIndex(openSidesIndex(unit, 63));
    geo.setAttribute('position', unit.getAttribute('position'));
    geo.setAttribute('normal', unit.getAttribute('normal'));
    const mesh = new InstancedMesh(geo, getVoxelMaterial(mat), 0);
    mesh.name = `${name}:${mat}`;
    // (no `voxelShape`: graphics.ts `setGraphics` and `plainFar` leave these meshes to the garden's view, which swaps
    // their blocks between cut and plain itself, `plain`: its blocks move too often for plainFar's rule)
    mesh.customDepthMaterial = getVoxelDepthMaterial(mat);
    // (shadows cast and received, as the village's blocks: VoxelMesh.ts `unpackVoxelMesh`)
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.boundingSphere = sphere;
    mesh.boundingBox = box;
    mesh.count = 0;
    mesh.visible = false;
    this.mesh = mesh;
    this.attach();
  }

  /** The buffers on the mesh (made, or grown). */
  private attach(): void {
    const mesh = this.mesh;
    const geo = mesh.geometry;
    mesh.instanceMatrix = new InstancedBufferAttribute(this.m, 16).setUsage(DynamicDrawUsage);
    mesh.instanceColor = new InstancedBufferAttribute(this.c, 3).setUsage(DynamicDrawUsage);
    geo.setAttribute('voxOpen', new InstancedBufferAttribute(this.o, 1).setUsage(DynamicDrawUsage));
    geo.setAttribute('voxRadius', new InstancedBufferAttribute(this.r, 1).setUsage(DynamicDrawUsage));
    mesh.userData.voxelSources = this.src;
  }

  /** Draw its blocks as plain boxes (far off, the low level) or with their cut edges. */
  plain(on: boolean): void {
    if (on === this.isPlain) return;
    this.isPlain = on;
    const unit = on ? this.box : this.cut;
    const geo = this.mesh.geometry;
    geo.setIndex(openSidesIndex(unit, 63));
    geo.setAttribute('position', unit.getAttribute('position'));
    geo.setAttribute('normal', unit.getAttribute('normal'));
  }

  /** The largest cut edge of its blocks (m: graphics.ts `chamferOf`; for when it may go plain). */
  edge(): number {
    const spec = VOXEL_MATERIALS[this.mat] as VoxelMaterialSpec;
    const e = this.m;
    let edge = 0;
    for (let i = 0; i < this.top; i++) {
      const k = i * 16;
      const side = Math.min(Math.hypot(e[k], e[k + 1], e[k + 2]), Math.hypot(e[k + 4], e[k + 5], e[k + 6]), Math.hypot(e[k + 8], e[k + 9], e[k + 10]));
      edge = Math.max(edge, this.r[i] > 0 ? Math.min(this.r[i], side * 0.45) : side * spec.bevel);
    }
    return edge;
  }

  get used(): number {
    return this.top;
  }
  get size(): number {
    return this.cap;
  }

  /** A run of `n` slots (`n` > 0). */
  alloc(n: number): Run {
    for (let i = 0; i < this.holes.length; i++) {
      const h = this.holes[i];
      if (h.cap < n) continue;
      this.holes.splice(i, 1);
      if (h.cap > n) this.holes.push({ start: h.start + n, cap: h.cap - n, n: 0 });
      const run = { start: h.start, cap: n, n };
      this.live.push(run);
      return run;
    }
    if (this.top + n > this.cap) {
      if (this.holes.length) this.pack();
      if (this.top + n > this.cap) this.grow(this.top + n);
    }
    const run = { start: this.top, cap: n, n };
    this.top += n;
    this.live.push(run);
    return run;
  }

  /** Let a run go: its blocks shrink away; its slots are free. */
  release(run: Run): void {
    const i = this.live.indexOf(run);
    if (i < 0) return;
    this.live.splice(i, 1);
    this.hide(run.start, run.cap);
    run.n = 0;
    if (run.start + run.cap === this.top) {
      this.top = run.start;
      // (holes now at the end go too)
      for (let again = true; again; ) {
        again = false;
        for (let k = 0; k < this.holes.length; k++)
          if (this.holes[k].start + this.holes[k].cap === this.top) {
            this.top = this.holes[k].start;
            this.holes.splice(k, 1);
            again = true;
            break;
          }
      }
    } else this.holes.push({ start: run.start, cap: run.cap, n: 0 });
  }

  /** The run for `n` blocks: the same one if it fits (its extra slots shrunk away), else a new one (the old let go). */
  fit(run: Run | null, n: number): Run | null {
    if (n <= 0) {
      if (run) this.release(run);
      return null;
    }
    if (run && n <= run.cap) {
      if (n < run.n) this.hide(run.start + n, run.n - n);
      run.n = n;
      return run;
    }
    if (run) this.release(run);
    return this.alloc(n);
  }

  /** Slots `from`‥ shrunk away (a hole). */
  private hide(from: number, n: number): void {
    const m = this.m;
    const { x, y, z } = this.park;
    for (let i = from; i < from + n; i++) {
      const k = i * 16;
      m.fill(0, k, k + 16);
      m[k] = m[k + 5] = m[k + 10] = TINY;
      m[k + 12] = x;
      m[k + 13] = y;
      m[k + 14] = z;
      m[k + 15] = 1;
      this.src[i] = undefined;
    }
    this.markM(from, n);
  }

  /**
   * Write blocks `b` into `run` through `a` (where the plant's blocks go: 3 × 4 column-major, its x, y and z axes
   * then its place; a block's local matrix is multiplied by it), from block `first` on
   * (`count` of them). `move` (world, per block, 3 floats a block, or null) is added to each block's place.
   */
  write(run: Run, b: Blocks, a: Float64Array, move: Float32Array | null = null, first = 0, count = b.n, attrs = true): void {
    const m = this.m;
    const L = b.m;
    const a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5], a6 = a[6], a7 = a[7], a8 = a[8], tx = a[9], ty = a[10], tz = a[11];
    for (let i = first; i < first + count; i++) {
      const s = i * 16;
      const d = (run.start + i) * 16;
      for (let col = 0; col < 3; col++) {
        const lx = L[s + col * 4];
        const ly = L[s + col * 4 + 1];
        const lz = L[s + col * 4 + 2];
        m[d + col * 4] = a0 * lx + a3 * ly + a6 * lz;
        m[d + col * 4 + 1] = a1 * lx + a4 * ly + a7 * lz;
        m[d + col * 4 + 2] = a2 * lx + a5 * ly + a8 * lz;
        m[d + col * 4 + 3] = 0;
      }
      const px = L[s + 12];
      const py = L[s + 13];
      const pz = L[s + 14];
      m[d + 12] = a0 * px + a3 * py + a6 * pz + tx + (move ? move[i * 3] : 0);
      m[d + 13] = a1 * px + a4 * py + a7 * pz + ty + (move ? move[i * 3 + 1] : 0);
      m[d + 14] = a2 * px + a5 * py + a8 * pz + tz + (move ? move[i * 3 + 2] : 0);
      m[d + 15] = 1;
    }
    this.markM(run.start + first, count);
    if (!attrs) return;
    this.c.set(b.c.subarray(first * 3, (first + count) * 3), (run.start + first) * 3);
    this.o.set(b.o.subarray(first, first + count), run.start + first);
    this.r.set(b.r.subarray(first, first + count), run.start + first);
    if (b.src) for (let i = first; i < first + count; i++) this.src[run.start + i] = b.src[i];
    this.markC(run.start + first, count);
    this.markA(run.start + first, count);
  }

  /** Write colours only (`c`: 3 floats a block, linear) into `run` from its block `first` on. */
  colors(run: Run, c: Float32Array, first = 0, count = c.length / 3): void {
    this.c.set(c.subarray(0, count * 3), (run.start + first) * 3);
    this.markC(run.start + first, count);
  }

  private markM(from: number, n: number): void {
    this.mLo = Math.min(this.mLo, from);
    this.mHi = Math.max(this.mHi, from + n);
  }
  private markC(from: number, n: number): void {
    this.cLo = Math.min(this.cLo, from);
    this.cHi = Math.max(this.cHi, from + n);
  }
  private markA(from: number, n: number): void {
    this.aLo = Math.min(this.aLo, from);
    this.aHi = Math.max(this.aHi, from + n);
  }

  /** Send what changed to the GPU (once a frame, after the writes). */
  flush(): void {
    const mesh = this.mesh;
    mesh.count = this.top;
    mesh.visible = this.top > 0;
    const geo = mesh.geometry;
    if (this.mHi > this.mLo) {
      const at = mesh.instanceMatrix;
      at.clearUpdateRanges();
      at.addUpdateRange(this.mLo * 16, (this.mHi - this.mLo) * 16);
      at.needsUpdate = true;
    }
    if (this.cHi > this.cLo && mesh.instanceColor) {
      const at = mesh.instanceColor;
      at.clearUpdateRanges();
      at.addUpdateRange(this.cLo * 3, (this.cHi - this.cLo) * 3);
      at.needsUpdate = true;
    }
    if (this.aHi > this.aLo) {
      for (let k = 0; k < 2; k++) {
        const at = geo.getAttribute(k ? 'voxRadius' : 'voxOpen') as InstancedBufferAttribute;
        at.clearUpdateRanges();
        at.addUpdateRange(this.aLo, this.aHi - this.aLo);
        at.needsUpdate = true;
      }
    }
    this.mLo = this.cLo = this.aLo = Infinity;
    this.mHi = this.cHi = this.aHi = -1;
  }

  /** The runs packed together from the start (their blocks moved down as they are), the holes gone. */
  private pack(): void {
    this.live.sort((p, q) => p.start - q.start);
    let at = 0;
    for (const run of this.live) {
      if (run.start !== at) {
        this.m.copyWithin(at * 16, run.start * 16, (run.start + run.cap) * 16);
        this.c.copyWithin(at * 3, run.start * 3, (run.start + run.cap) * 3);
        this.o.copyWithin(at, run.start, run.start + run.cap);
        this.r.copyWithin(at, run.start, run.start + run.cap);
        for (let i = 0; i < run.cap; i++) this.src[at + i] = this.src[run.start + i];
        run.start = at;
      }
      at += run.cap;
    }
    this.hide(at, Math.max(0, this.top - at));
    this.top = at;
    this.holes.length = 0;
    this.markM(0, at);
    this.markC(0, at);
    this.markA(0, at);
    this.packs++;
  }

  /** Bigger buffers (at least `need` slots): the same mesh, its old GPU buffers freed. */
  private grow(need: number): void {
    let cap = this.cap;
    while (cap < need) cap *= 2;
    const m = new Float32Array(cap * 16);
    m.set(this.m);
    const c = new Float32Array(cap * 3);
    c.set(this.c);
    const o = new Float32Array(cap);
    o.set(this.o);
    const r = new Float32Array(cap);
    r.set(this.r);
    this.m = m;
    this.c = c;
    this.o = o;
    this.r = r;
    this.src.length = cap;
    this.cap = cap;
    // Free the old buffers (the geometry's own attributes and the instances'), not the shared unit block's
    // (VoxelMesh.ts `disposeVoxelMesh` does the same): they are put back after.
    const mesh = this.mesh;
    const geo = mesh.geometry;
    const index = geo.index;
    const position = geo.getAttribute('position');
    const normal = geo.getAttribute('normal');
    geo.setIndex(null);
    geo.deleteAttribute('position');
    geo.deleteAttribute('normal');
    geo.dispose();
    mesh.dispose();
    geo.setIndex(index);
    geo.setAttribute('position', position);
    geo.setAttribute('normal', normal);
    this.attach();
    this.markM(0, this.top);
    this.markC(0, this.top);
    this.markA(0, this.top);
    this.grows++;
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
