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
 * the origin: the view turns and sets each copy on the land), and where its
 * crown is, cached by `lookKey`.
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

export interface LookData {
  readonly key: string;
  readonly look: PlantLook;
  /** Near: every block of the model, a list per family (as `FAMILIES`: null where it has none). */
  readonly fams: readonly (Blocks | null)[];
  /** Its crown (its leaves): where it begins over the foot (m: a fifth of its leaves lie lower) and its radius (m: four fifths of its leaves lie inside); null: no leaves. */
  readonly crown: { readonly base: number; readonly r: number } | null;
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

/** Where a crown's leaves begin and how far out most of them reach (by the area they show). */
function crownOf(boxes: readonly VoxelBox[]): { base: number; r: number } | null {
  const leaves = boxes.filter((b) => b.mat === 'mapLeaf');
  if (!leaves.length) return null;
  const area = (b: VoxelBox) => b.sx * b.sy + b.sy * b.sz + b.sx * b.sz;
  let total = 0;
  for (const b of leaves) total += area(b);
  const at = (list: VoxelBox[], v: (b: VoxelBox) => number, share: number) => {
    list.sort((p, q) => v(p) - v(q));
    let sum = 0;
    for (const b of list) {
      sum += area(b);
      if (sum >= share * total) return v(b);
    }
    return v(list[list.length - 1]);
  };
  const base = at([...leaves], (b) => b.y - b.sy / 2, 0.2);
  const r = at([...leaves], (b) => Math.hypot(b.x, b.z) + Math.max(b.sx, b.sz) / 2, 0.8);
  return { base: Math.max(0, base), r };
}

/**
 * The crowns of the garden's plants now (by plant id; the view, garden/view.ts, sets them as it builds each look):
 * their foot on the map and where their leaves are, for the follow camera to keep out of (roam/_gardenWalk.ts).
 */
export const CROWNS = new Map<number, { x: number; z: number; y0: number; y1: number; r: number }>();

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
  return { key, look, fams, crown: crownOf(boxes), height, reach, blocks: boxes.length, ms: performance.now() - t0 };
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
