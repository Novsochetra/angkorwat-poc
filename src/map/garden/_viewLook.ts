import { Color, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { SourceTrace } from '../../feedback/sourceTrace';
import type { VoxelMaterialKey } from '../../voxel/materials';
import type { VoxelBox } from '../../voxel/VoxelBuilder';
import { KINDS } from './kinds';
import { plantBlocks } from './look';
import { lookKey, type PlantLook } from './state';

/**
 * A plant's look as the garden's view draws it (garden/view.ts): its model's
 * blocks (garden/look.ts) packed once per look, family by family, as the
 * instances of the view's meshes take them (local metres, the plant's foot at
 * the origin: the view turns and sets each copy on the land), and its far
 * shapes (a crown or two and a trunk: `far`), cached by `lookKey`.
 *
 * The packing is VoxelMesh.ts `packVoxelMesh`'s, per block (its matrix, its
 * colour in linear light times its shade, its open sides and joints, its own
 * bevel), without the bounds it works out (the view keeps its own).
 */

/** One family's blocks of a look (or of a plant's earth): `n` blocks, 16 floats of matrix, 3 of colour, 1 each of open sides and bevel. */
export interface Blocks {
  readonly mat: VoxelMaterialKey;
  readonly n: number;
  readonly m: Float32Array;
  readonly c: Float32Array;
  readonly o: Float32Array;
  readonly r: Float32Array;
  /** The code that made each block (dev builds: the bug report names it), or null. */
  readonly src: (SourceTrace | undefined)[] | null;
}

/** The far shapes of a look: plain boxes (local), the crown's in `leaf`, the trunk's in `bark`. */
export interface FarShape {
  readonly leaf: Blocks | null;
  readonly bark: Blocks | null;
}

export interface LookData {
  readonly key: string;
  readonly look: PlantLook;
  /** Near: every block of the model, a list per family (as `FAMILIES`: null where it has none). */
  readonly fams: readonly (Blocks | null)[];
  readonly far: FarShape;
  /** Its height (m, the top of its highest block) and reach (m, from its foot's axis), for the bounds and the far view. */
  readonly height: number;
  readonly reach: number;
  readonly blocks: number;
  /** How long its build took (ms: the model and the packing). */
  readonly ms: number;
}

/** The families the garden draws (garden/look.ts: the model contract; `mapRock` is also the earth's). */
export const FAMILIES: readonly VoxelMaterialKey[] = ['mapLeaf', 'mapBark', 'petal', 'mapStone', 'mapRock', 'mapGrass'];

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3();
const _c = new Color();

/** Blocks of one family, packed (`boxes` all of `mat`). */
export function packBlocks(mat: VoxelMaterialKey, boxes: readonly VoxelBox[]): Blocks {
  const n = boxes.length;
  const m = new Float32Array(n * 16);
  const c = new Float32Array(n * 3);
  const o = new Float32Array(n);
  const r = new Float32Array(n);
  let src: (SourceTrace | undefined)[] | null = null;
  for (let i = 0; i < n; i++) {
    const b = boxes[i];
    o[i] = (b.open ?? 63) | ((b.joint ?? 0) << 6);
    r[i] = b.radius ?? 0;
    _p.set(b.x, b.y, b.z);
    if (b.rx || b.ry || b.rz) _q.setFromEuler(_e.set(b.rx ?? 0, b.ry ?? 0, b.rz ?? 0));
    else _q.identity();
    _m.compose(_p, _q, _s.set(b.sx, b.sy, b.sz));
    _m.toArray(m, i * 16);
    // (the map's families have no pattern: the shade is in the colour, as packVoxelMesh does)
    _c.setHex(b.color).multiplyScalar(b.shade);
    _c.toArray(c, i * 3);
    if (b.src) (src ??= new Array<SourceTrace | undefined>(n))[i] = b.src;
  }
  return { mat, n, m, c, o, r, src };
}

/** A plain box (local), its colour already linear. */
interface FarBox {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  r: number;
  g: number;
  b: number;
}

function packFar(mat: VoxelMaterialKey, list: readonly FarBox[]): Blocks | null {
  if (!list.length) return null;
  const n = list.length;
  const m = new Float32Array(n * 16);
  const c = new Float32Array(n * 3);
  const o = new Float32Array(n).fill(63);
  const r = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const f = list[i];
    _m.makeScale(f.sx, f.sy, f.sz).setPosition(f.x, f.y, f.z).toArray(m, i * 16);
    c[i * 3] = f.r;
    c[i * 3 + 1] = f.g;
    c[i * 3 + 2] = f.b;
  }
  return { mat, n, m, c, o, r, src: null };
}

/**
 * Blocks seen from far as a coarse grid of plain cells (`cell` m): each block's sides spread over the cells it
 * lies in (sampled a cell apart along its own turned axes); a cell where they cover at least `fill` of a cell's
 * face is one box, of their mean colour (`thin`: as wide as the blocks there, for a trunk, not the whole cell).
 */
function grid(list: readonly VoxelBox[], cell: number, fill: number, thin: boolean, out: FarBox[]): void {
  if (!list.length) return;
  const cells = new Map<number, { a: number; r: number; g: number; b: number; w: number; x: number; y: number; z: number }>();
  const key = (i: number, j: number, k: number) => ((i + 512) * 1024 + (j + 512)) * 1024 + (k + 512);
  for (const b of list) {
    const area = b.sx * b.sy + b.sy * b.sz + b.sx * b.sz;
    const nx = Math.max(1, Math.ceil(b.sx / cell));
    const ny = Math.max(1, Math.ceil(b.sy / cell));
    const nz = Math.max(1, Math.ceil(b.sz / cell));
    const n = nx * ny * nz;
    if (b.rx || b.ry || b.rz) _q.setFromEuler(_e.set(b.rx ?? 0, b.ry ?? 0, b.rz ?? 0));
    else _q.identity();
    _c.setHex(b.color).multiplyScalar(b.shade);
    for (let u = 0; u < nx; u++)
      for (let v = 0; v < ny; v++)
        for (let w = 0; w < nz; w++) {
          _p.set(((u + 0.5) / nx - 0.5) * b.sx, ((v + 0.5) / ny - 0.5) * b.sy, ((w + 0.5) / nz - 0.5) * b.sz).applyQuaternion(_q);
          const x = b.x + _p.x;
          const y = b.y + _p.y;
          const z = b.z + _p.z;
          const k = key(Math.floor(x / cell), Math.floor(y / cell), Math.floor(z / cell));
          let c = cells.get(k);
          if (!c) cells.set(k, (c = { a: 0, r: 0, g: 0, b: 0, w: 0, x: 0, y: 0, z: 0 }));
          const da = area / n;
          c.a += da;
          c.r += _c.r * da;
          c.g += _c.g * da;
          c.b += _c.b * da;
          c.w += Math.min(b.sx, b.sz) * da;
          c.x += x * da;
          c.y += y * da;
          c.z += z * da;
        }
  }
  for (const [k, c] of cells) {
    if (c.a < fill * cell * cell) continue;
    const i = Math.floor(k / (1024 * 1024)) - 512;
    const j = (Math.floor(k / 1024) % 1024) - 512;
    const kk = (k % 1024) - 512;
    const w = thin ? Math.min(cell, Math.max(0.08, c.w / c.a)) : cell;
    // (a trunk's cell sits on its blocks' middle line; a crown's on the grid)
    const x = thin ? c.x / c.a : (i + 0.5) * cell;
    const z = thin ? c.z / c.a : (kk + 0.5) * cell;
    // (a crown of plain boxes has no lit rims: a little brighter, as its blocks look together)
    const lift = thin ? 1 : 1.12;
    out.push({ x, y: (j + 0.5) * cell, z, sx: w, sy: cell, sz: w, r: (c.r / c.a) * lift, g: (c.g / c.a) * lift, b: (c.b / c.a) * lift });
  }
}

/** The far shapes of a model's blocks: its leaves as a coarse grid of plain cells, its bark as a thin column of them. */
function farOf(boxes: readonly VoxelBox[], height: number): FarShape {
  const leaves = boxes.filter((b) => b.mat === 'mapLeaf');
  const bark = boxes.filter((b) => b.mat === 'mapBark');
  // (a cell a sixth of the plant's height: a big crown in a few dozen cells, a crop in a handful)
  const cell = Math.min(1.3, Math.max(0.25, height / 6));
  const crowns: FarBox[] = [];
  grid(leaves, cell, 0.3, false, crowns);
  const trunk: FarBox[] = [];
  grid(bark, Math.max(0.3, cell * 0.8), 0.15, true, trunk);
  return { leaf: packFar('mapLeaf', crowns), bark: packFar('mapBark', trunk) };
}

/** A look's data, built now (its model and the packing). */
export function buildLook(look: PlantLook, key = lookKey(look)): LookData {
  const t0 = performance.now();
  const boxes = plantBlocks(look).boxes;
  const by = new Map<VoxelMaterialKey, VoxelBox[]>();
  let height = 0;
  let reach = 0;
  for (const b of boxes) {
    let list = by.get(b.mat);
    if (!list) by.set(b.mat, (list = []));
    list.push(b);
    const half = Math.max(b.sx, b.sy, b.sz) * 0.75;
    height = Math.max(height, b.y + half);
    reach = Math.max(reach, Math.hypot(b.x, b.z) + half);
  }
  const fams = FAMILIES.map((mat) => {
    const list = by.get(mat);
    return list ? packBlocks(mat, list) : null;
  });
  for (const [mat, list] of by) if (!FAMILIES.includes(mat)) warnFamily(look, mat, list.length);
  // (a plant with no model yet still has a size: its kind's)
  if (!boxes.length) height = KINDS[look.kind].height * 0.1;
  return { key, look, fams, far: farOf(boxes, height), height, reach, blocks: boxes.length, ms: performance.now() - t0 };
}

const warned = new Set<string>();
function warnFamily(look: PlantLook, mat: VoxelMaterialKey, n: number): void {
  const k = `${look.kind}|${mat}`;
  if (warned.has(k)) return;
  warned.add(k);
  console.warn(`[garden] the ${look.kind} model draws ${n} blocks of "${mat}", not a family the garden draws (garden/look.ts: mapLeaf, mapBark, petal, mapStone, mapRock, mapGrass): left out`);
}

/**
 * The looks built so far, by `lookKey`: those in use, and the last `KEEP` let go (a fruit that ripens again,
 * a stage that comes back after a rebuild), the oldest dropped first.
 */
export class LookCache {
  private readonly map = new Map<string, LookData>();
  private readonly uses = new Map<string, number>();
  private static readonly KEEP = 24;

  get size(): number {
    return this.map.size;
  }

  /** A look's data (built if new), counted as used until `release`. */
  take(look: PlantLook): LookData {
    const key = lookKey(look);
    let d = this.map.get(key);
    if (!d) {
      d = buildLook(look, key);
      this.map.set(key, d);
    } else {
      // (most recent last)
      this.map.delete(key);
      this.map.set(key, d);
    }
    this.uses.set(key, (this.uses.get(key) ?? 0) + 1);
    return d;
  }

  release(d: LookData): void {
    const n = (this.uses.get(d.key) ?? 1) - 1;
    if (n > 0) {
      this.uses.set(d.key, n);
      return;
    }
    this.uses.delete(d.key);
    this.trim();
  }

  /** Build a look ahead of time (idle time: the next stage, the fruit about to ripen), unless it is built: true if it was built now. */
  warm(look: PlantLook): boolean {
    const key = lookKey(look);
    if (this.map.has(key)) return false;
    this.map.set(key, buildLook(look, key));
    this.trim();
    return true;
  }

  /** The oldest unused looks beyond `KEEP` dropped. */
  private trim(): void {
    let unused = 0;
    for (const k of this.map.keys()) if (!this.uses.has(k)) unused++;
    for (const k of this.map.keys()) {
      if (unused <= LookCache.KEEP) break;
      if (this.uses.has(k)) continue;
      this.map.delete(k);
      unused--;
    }
  }

  clear(): void {
    this.map.clear();
    this.uses.clear();
  }
}
