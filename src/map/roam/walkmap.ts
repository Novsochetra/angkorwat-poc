import { Matrix4, type InstancedMesh, type Object3D } from 'three';
import type { VoxelMaterialKey } from '../../voxel/materials';
import type { HeightField } from '../heightfield';
import { MAP_BOUNDS } from '../layout';
import type { MapPart } from '../types';

/**
 * The walk map: what is solid on the map, for the roaming explorer and his
 * camera. The map is cut into columns of 0.5 m (half a landmark block); each
 * column is a short list of solid spans, bottom to top: the land (from the
 * height field) with whatever stands on it, then anything with a gap under
 * it (a bridge deck, a gallery roof, a branch). So the explorer climbs temple
 * stairs, walks on terraces and bridges and under roofs, and is stopped by
 * walls and tree trunks.
 *
 * Made from the voxel meshes of the built parts: every block but leaves
 * (canopies and bushes don't block), light (glow), water and moving things
 * (the explorer, birds). The land's own column blocks are left out where
 * they only repeat the height field (they are hollow: only their shells are
 * blocks); rocks, pillars and lips that stand out of it are kept.
 *
 * Two more kinds for the follow camera: `hard`, the same less tree bark, and
 * `soft`, the leaves (crowns, bushes, vines) and bark alone over the land:
 * what it can see through (the near fade, _nearFade.ts, dissolves them) but
 * keeps out of, softly.
 *
 * Cheap to make: the blocks are only sorted into 16 m chunks up front; a
 * chunk's columns are built the first time something asks about it.
 */

/** Column size (m). */
const RES = 0.5;
/** Chunk size in columns (16 m). */
const CN = 32;
/** Gaps between two solids thinner than this are filled (m). */
const SEAM = 0.5;
/** The map's edges and a margin round them (the explorer's ledge by the overview camera is past the south edge). */
const BOUNDS = { x0: MAP_BOUNDS.x0 - 64, x1: MAP_BOUNDS.x1 + 64, z0: MAP_BOUNDS.z0 - 64, z1: MAP_BOUNDS.z1 + 96 };

/** Block families that are not solid to walk on or into. */
const SOFT = new Set<VoxelMaterialKey>(['mapLeaf', 'leaves', 'foliage', 'petal', 'glow', 'water', 'wax']);
/** What the follow camera sees through (a `soft` map holds only these, a `hard` one none). */
const SEE_THROUGH = new Set<VoxelMaterialKey>(['mapLeaf', 'leaves', 'foliage', 'petal', 'mapBark']);

/** What a walk map holds: see `WalkMap`. */
export type WalkMapKind = 'walk' | 'hard' | 'soft';
/** Parts with nothing to stand on (or that move). */
const SKIP_PARTS = new Set(['atmosphere', 'water', 'undergrowth', 'clouds', 'rain', 'rainbow', 'life', 'people', 'jungleFauna', 'paddies', 'festival', 'treasure', 'roam']);

const MESH_BITS = 10;
const INST_BITS = 22;
const INST_MASK = (1 << INST_BITS) - 1;

interface Chunk {
  /** Highest solid top per column. */
  top: Float32Array;
  /**
   * Columns with more than one span: [top of the ground span, bottom 1, top 1,
   * bottom 2, top 2, …] (the ground span has no bottom). Most columns have
   * none (and most chunks: null).
   */
  spans: (Float32Array | undefined)[] | null;
}

interface Source {
  array: Float32Array;
  /** The mesh's world matrix, when it is not the identity. */
  world: Matrix4 | null;
}

/** One block's footprint (a box turned about y, or its bounding box if tilted) and its bottom and top. */
interface Foot {
  x: number;
  z: number;
  /** Half axes of the footprint (m, map x and z), and 1 / their squared length. */
  ux: number;
  uz: number;
  vx: number;
  vz: number;
  iu: number;
  iv: number;
  /** Bounding box of the footprint. */
  hx: number;
  hz: number;
  y0: number;
  y1: number;
}

const _m = new Matrix4();

export class WalkMap {
  /** Build time of the chunk index (ms) and blocks it holds. */
  readonly stats = { ms: 0, blocks: 0, chunks: 0 };
  private readonly x0 = BOUNDS.x0;
  private readonly z0 = BOUNDS.z0;
  private readonly ci: number;
  private readonly ck: number;
  private readonly sources: Source[] = [];
  /** Blocks per chunk: `items[start[c] … start[c + 1]]` (mesh << 22 | instance). */
  private readonly start: Uint32Array;
  private readonly items: Uint32Array;
  private readonly chunks: (Chunk | undefined)[];
  private readonly foot: Foot = { x: 0, z: 0, ux: 0, uz: 0, vx: 0, vz: 0, iu: 0, iv: 0, hx: 0, hz: 0, y0: 0, y1: 0 };

  constructor(
    private readonly field: HeightField,
    parts: readonly MapPart[],
    kind: WalkMapKind = 'walk',
  ) {
    const t0 = performance.now();
    const size = CN * RES;
    this.ci = Math.ceil((BOUNDS.x1 - BOUNDS.x0) / size);
    this.ck = Math.ceil((BOUNDS.z1 - BOUNDS.z0) / size);
    this.chunks = new Array(this.ci * this.ck);

    // Every solid block: which chunks it touches.
    let chunkOf = new Uint32Array(1 << 16);
    let itemOf = new Uint32Array(1 << 16);
    let n = 0;
    const push = (c: number, item: number) => {
      if (n === chunkOf.length) {
        const a = new Uint32Array(n * 2);
        a.set(chunkOf);
        chunkOf = a;
        const b = new Uint32Array(n * 2);
        b.set(itemOf);
        itemOf = b;
      }
      chunkOf[n] = c;
      itemOf[n++] = item;
    };
    for (const part of parts) {
      if (SKIP_PARTS.has(part.name)) continue;
      const land = part.name === 'terrain';
      // (the explorer stands in the foreground part)
      const skip = (part as { explorer?: { object: Object3D } }).explorer?.object;
      part.object.updateMatrixWorld(true);
      part.object.traverse((o) => {
        const mesh = o as InstancedMesh;
        // (`userData.noWalk`: a moving piece of a solid part, e.g. the camps' swing seat)
        if (!mesh.isInstancedMesh || !mesh.userData.voxelShape || !mesh.count || mesh.userData.noWalk) return;
        const mat = mesh.name.slice(mesh.name.lastIndexOf(':') + 1) as VoxelMaterialKey;
        const keep = kind === 'soft' ? SEE_THROUGH.has(mat) : !SOFT.has(mat) && !(kind === 'hard' && SEE_THROUGH.has(mat));
        if (!keep || (skip && isUnder(mesh, skip))) return;
        if (this.sources.length >= 1 << MESH_BITS || mesh.count > INST_MASK) return;
        const s = this.sources.length;
        this.sources.push({ array: mesh.instanceMatrix.array as Float32Array, world: mesh.matrixWorld.equals(IDENTITY) ? null : mesh.matrixWorld.clone() });
        for (let i = 0; i < mesh.count; i++) {
          const f = this.footOf(s, i);
          if (land && f.y1 <= this.landUnder(f) + 0.05) continue;
          if (f.x + f.hx < BOUNDS.x0 || f.x - f.hx > BOUNDS.x1 || f.z + f.hz < BOUNDS.z0 || f.z - f.hz > BOUNDS.z1) continue;
          const [a0, a1] = this.chunkSpan(f.x - f.hx, f.x + f.hx, this.x0, this.ci);
          const [b0, b1] = this.chunkSpan(f.z - f.hz, f.z + f.hz, this.z0, this.ck);
          for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) push(a + b * this.ci, (s << INST_BITS) | i);
          this.stats.blocks++;
        }
      });
    }
    // Sort the list by chunk (counting sort).
    this.start = new Uint32Array(this.ci * this.ck + 1);
    for (let j = 0; j < n; j++) this.start[chunkOf[j] + 1]++;
    for (let c = 0; c < this.ci * this.ck; c++) this.start[c + 1] += this.start[c];
    this.items = new Uint32Array(n);
    const fill = this.start.slice(0, -1);
    for (let j = 0; j < n; j++) this.items[fill[chunkOf[j]]++] = itemOf[j];
    this.stats.ms = Math.round(performance.now() - t0);
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  /** Highest solid top at (x, z) (m). */
  topAt(x: number, z: number): number {
    const c = this.cell(x, z);
    return c < 0 ? this.field.heightAt(x, z) : this.at!.top[c];
  }

  /**
   * Where feet at height `y` would stand at (x, z): the top of the highest
   * solid that starts no higher than `y + up`, if it also ends there and has
   * `height` m of room above it; NaN where a wall or a low roof is in the way.
   */
  standAt(x: number, z: number, y: number, up: number, height: number): number {
    const c = this.cell(x, z);
    const reach = y + up;
    if (c < 0) {
      const g = this.field.heightAt(x, z);
      return g > reach ? NaN : g;
    }
    const s = this.at!.spans?.[c];
    if (!s) {
      const g = this.at!.top[c];
      return g > reach ? NaN : g;
    }
    let k = 0;
    for (let j = s.length - 2; j >= 1; j -= 2)
      if (s[j] <= reach) {
        k = j + 1;
        break;
      }
    const top = s[k];
    if (top > reach) return NaN;
    const next = k + 1 < s.length ? s[k + 1] : Infinity;
    return next - top < height ? NaN : top;
  }

  /** Bottom of the first solid above height `y` at (x, z), or Infinity. */
  ceilingAt(x: number, z: number, y: number): number {
    const c = this.cell(x, z);
    if (c < 0) return Infinity;
    const s = this.at!.spans?.[c];
    if (!s) return Infinity;
    for (let j = 1; j < s.length; j += 2) if (s[j] > y) return s[j];
    return Infinity;
  }

  /** Is the point (x, y, z) inside something solid? */
  solid(x: number, y: number, z: number): boolean {
    const c = this.cell(x, z);
    if (c < 0) return y < this.field.heightAt(x, z);
    const s = this.at!.spans?.[c];
    if (!s) return y < this.at!.top[c];
    if (y < s[0]) return true;
    for (let j = 1; j < s.length; j += 2) if (y >= s[j] && y < s[j + 1]) return true;
    return false;
  }

  /**
   * Part of the segment a → b (0‥1) that is free of solid blocks, from a.
   * With `leave`, what a is inside does not count: from where the segment
   * comes out of it (he stands in a bush).
   */
  clearance(ax: number, ay: number, az: number, bx: number, by: number, bz: number, leave = false): number {
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    const n = Math.max(1, Math.ceil(len / (RES * 0.5)));
    let inside = leave && this.solid(ax, ay, az);
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const hit = this.solid(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t);
      if (inside) inside = hit;
      else if (hit) return (i - 1) / n;
    }
    return 1;
  }

  // ── Columns ────────────────────────────────────────────────────────────────

  /** The chunk of the last `cell` call. */
  private at: Chunk | null = null;

  /** Column index of (x, z) in its chunk (built on first use; sets `at`), or −1 off the map. */
  private cell(x: number, z: number): number {
    const i = Math.floor((x - this.x0) / RES);
    const k = Math.floor((z - this.z0) / RES);
    const a = Math.floor(i / CN);
    const b = Math.floor(k / CN);
    if (a < 0 || b < 0 || a >= this.ci || b >= this.ck) return -1;
    const id = a + b * this.ci;
    this.at = this.chunks[id] ?? (this.chunks[id] = this.build(a, b));
    return i - a * CN + (k - b * CN) * CN;
  }

  /** The columns of chunk (a, b): the land, then its blocks from the lowest up. */
  private build(a: number, b: number): Chunk {
    const n = CN * CN;
    const cx0 = this.x0 + a * CN * RES;
    const cz0 = this.z0 + b * CN * RES;
    // The span being built per column (bottom, top), and the finished ones under it.
    const lo = new Float32Array(n).fill(-Infinity);
    const hi = new Float32Array(n);
    const below: (number[] | undefined)[] = new Array(n);
    for (let k = 0; k < CN; k++) for (let i = 0; i < CN; i++) hi[i + k * CN] = this.field.heightAt(cx0 + (i + 0.5) * RES, cz0 + (k + 0.5) * RES);

    const id = a + b * this.ci;
    const from = this.start[id];
    const count = this.start[id + 1] - from;
    const feet: Foot[] = [];
    for (let j = 0; j < count; j++) {
      const item = this.items[from + j];
      feet.push({ ...this.footOf(item >>> INST_BITS, item & INST_MASK) });
    }
    feet.sort((p, q) => p.y0 - q.y0);

    const add = (c: number, y0: number, y1: number) => {
      if (y0 <= hi[c] + SEAM) {
        if (y1 > hi[c]) hi[c] = y1;
      } else {
        (below[c] ??= []).push(lo[c], hi[c]);
        lo[c] = y0;
        hi[c] = y1;
      }
    };
    for (const f of feet) {
      // Columns whose centre is on the block (a block smaller than a column: the one under its centre).
      const i0 = Math.max(0, Math.floor((f.x - f.hx - cx0) / RES));
      const i1 = Math.min(CN - 1, Math.floor((f.x + f.hx - cx0) / RES));
      const k0 = Math.max(0, Math.floor((f.z - f.hz - cz0) / RES));
      const k1 = Math.min(CN - 1, Math.floor((f.z + f.hz - cz0) / RES));
      let hit = false;
      for (let k = k0; k <= k1; k++)
        for (let i = i0; i <= i1; i++) {
          const dx = cx0 + (i + 0.5) * RES - f.x;
          const dz = cz0 + (k + 0.5) * RES - f.z;
          const u = (dx * f.ux + dz * f.uz) * f.iu;
          const v = (dx * f.vx + dz * f.vz) * f.iv;
          if (u < -1 || u >= 1 || v < -1 || v >= 1) continue;
          add(i + k * CN, f.y0, f.y1);
          hit = true;
        }
      if (!hit) {
        const i = Math.floor((f.x - cx0) / RES);
        const k = Math.floor((f.z - cz0) / RES);
        if (i >= 0 && k >= 0 && i < CN && k < CN) add(i + k * CN, f.y0, f.y1);
      }
    }

    let spans: (Float32Array | undefined)[] | null = null;
    for (let c = 0; c < n; c++) {
      const d = below[c];
      if (!d) continue;
      spans ??= new Array(n);
      // [ground top, (bottom, top)…]: the first finished span is the ground one (its bottom is −∞).
      const s = new Float32Array(d.length + 1);
      for (let j = 1; j < d.length; j++) s[j - 1] = d[j];
      s[d.length - 1] = lo[c];
      s[d.length] = hi[c];
      spans[c] = s;
    }
    this.stats.chunks++;
    return { top: hi, spans };
  }

  /** Footprint, bottom and top of block `i` of source `s` (a shared object: copy to keep). */
  private footOf(s: number, i: number): Foot {
    const src = this.sources[s];
    let e: ArrayLike<number> = src.array;
    let o = i * 16;
    if (src.world) {
      e = _m.fromArray(src.array, o).premultiply(src.world).elements;
      o = 0;
    }
    const f = this.foot;
    // Columns of the matrix: the block's x, y and z edges (scaled); then its centre.
    const e0 = e[o];
    const e1 = e[o + 1];
    const e2 = e[o + 2];
    const e4 = e[o + 4];
    const e5 = e[o + 5];
    const e6 = e[o + 6];
    const e8 = e[o + 8];
    const e9 = e[o + 9];
    const e10 = e[o + 10];
    f.x = e[o + 12];
    f.z = e[o + 14];
    const hy = 0.5 * (Math.abs(e1) + Math.abs(e5) + Math.abs(e9));
    f.y0 = e[o + 13] - hy;
    f.y1 = e[o + 13] + hy;
    f.hx = 0.5 * (Math.abs(e0) + Math.abs(e4) + Math.abs(e8));
    f.hz = 0.5 * (Math.abs(e2) + Math.abs(e6) + Math.abs(e10));
    const tilted = Math.abs(e1) + Math.abs(e9) + Math.abs(e4) + Math.abs(e6) > 1e-3 * (Math.abs(e5) + 1);
    if (tilted) {
      // Tilted (rare): its bounding box.
      f.ux = f.hx;
      f.uz = 0;
      f.vx = 0;
      f.vz = f.hz;
    } else {
      // Turned about y: its own x and z edges (half).
      f.ux = e0 / 2;
      f.uz = e2 / 2;
      f.vx = e8 / 2;
      f.vz = e10 / 2;
    }
    f.iu = 1 / Math.max(1e-6, f.ux * f.ux + f.uz * f.uz);
    f.iv = 1 / Math.max(1e-6, f.vx * f.vx + f.vz * f.vz);
    return f;
  }

  /** Lowest land under a block's footprint (its corners and centre). */
  private landUnder(f: Foot): number {
    const h = (x: number, z: number) => this.field.heightAt(x, z);
    const ex = Math.max(0, f.hx - 0.05);
    const ez = Math.max(0, f.hz - 0.05);
    return Math.min(h(f.x, f.z), h(f.x - ex, f.z - ez), h(f.x + ex, f.z - ez), h(f.x - ex, f.z + ez), h(f.x + ex, f.z + ez));
  }

  /** Chunks a span of the map covers along one axis (clamped). */
  private chunkSpan(p0: number, p1: number, origin: number, count: number): [number, number] {
    const size = CN * RES;
    return [Math.max(0, Math.min(count - 1, Math.floor((p0 - origin) / size))), Math.max(0, Math.min(count - 1, Math.floor((p1 - origin) / size)))];
  }
}

const IDENTITY = new Matrix4();

function isUnder(o: Object3D, root: Object3D): boolean {
  for (let p: Object3D | null = o; p; p = p.parent) if (p === root) return true;
  return false;
}
