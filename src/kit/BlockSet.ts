import { traceSource, type SourceTrace } from '../feedback/sourceTrace';
import { VOXEL_MATERIALS, type VoxelMaterialKey } from '../voxel/materials';
import { hash3, valueNoise3 } from '../voxel/random';
import type { Surf, VoxelBuilder } from '../voxel/VoxelBuilder';
import { SANDSTONE } from './palette';

/**
 * Masonry of dressed stone blocks that can be damaged (plan §19.2).
 *
 * Blocks are boxes on a carve grid (default 1/8 m: four cells to a 0.5 m block).
 * Intact blocks are emitted as one rounded box each, so walls stay cheap; a block
 * that has been carved (broken corner, eroded edge, crack, chip…) is emitted as
 * its remaining carve cells, with the faces the damage exposed in the rougher
 * `broken` stone colour — the "rough interior" of the reference sheet.
 */
export interface BlockStyle {
  /** Material family (default `sandstone`). */
  mat?: VoxelMaterialKey;
  /** Pattern amounts (moss, lichen, cracks, stain for sandstone). */
  surf?: Surf;
  /** Brightness multiplier. */
  shade?: number;
  /** Colour of faces exposed by carving (default: the broken-sandstone tones; null = keep the block colour). */
  broken?: readonly number[] | null;
}

interface Block {
  id: number;
  /** Carve-cell bounds: min inclusive, max exclusive. */
  i0: number;
  j0: number;
  k0: number;
  i1: number;
  j1: number;
  k1: number;
  color: number;
  mat: VoxelMaterialKey;
  surf?: Surf;
  shade: number;
  broken: readonly number[] | null;
  src?: SourceTrace;
  removed: boolean;
  /** Keys of carve cells removed from this block. */
  carved: Set<number> | null;
}

const BIAS = 4096;
const SPAN = 8192;
const key = (i: number, j: number, k: number) => ((i + BIAS) * SPAN + (j + BIAS)) * SPAN + (k + BIAS);
const unkey = (kk: number): [number, number, number] => {
  const k = (kk % SPAN) - BIAS;
  const r = Math.floor(kk / SPAN);
  return [Math.floor(r / SPAN) - BIAS, (r % SPAN) - BIAS, k];
};
const N6: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

export class BlockSet {
  private readonly blocks: Block[] = [];
  /** Carve cell → id of the block that owns it. */
  private readonly owner = new Map<number, number>();
  /** Every carve cell damage has removed (whole-block removal doesn't count). */
  private readonly carvedAll = new Set<number>();

  /** @param res carve-cell size in metres (1/8 m default; 1/16 m for fine cracks). */
  constructor(readonly res = 0.125) {}

  /**
   * A block from min/max corners in metres (snapped to the carve grid). Returns
   * its id, or -1 if empty. Stone already laid wins: a block overlapping earlier
   * ones keeps only the free cells (and is emitted as those), so overlapping
   * authoring never double-draws.
   */
  add(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, style: BlockStyle = {}): number {
    const r = this.res;
    const [i0, i1] = [Math.round(Math.min(x0, x1) / r), Math.round(Math.max(x0, x1) / r)];
    const [j0, j1] = [Math.round(Math.min(y0, y1) / r), Math.round(Math.max(y0, y1) / r)];
    const [k0, k1] = [Math.round(Math.min(z0, z1) / r), Math.round(Math.max(z0, z1) / r)];
    if (i1 <= i0 || j1 <= j0 || k1 <= k0) return -1;
    const id = this.blocks.length;
    this.blocks.push({
      id,
      i0,
      j0,
      k0,
      i1,
      j1,
      k1,
      color,
      mat: style.mat ?? 'sandstone',
      surf: style.surf,
      shade: style.shade ?? 1,
      broken: style.broken === undefined ? SANDSTONE.broken : style.broken,
      src: traceSource(),
      removed: false,
      carved: null,
    });
    let clipped = false;
    for (let i = i0; i < i1; i++)
      for (let j = j0; j < j1; j++)
        for (let k = k0; k < k1; k++) {
          const kk = key(i, j, k);
          if (this.owner.has(kk)) clipped = true;
          else this.owner.set(kk, id);
        }
    // (a clipped block is drawn as its own cells, like a carved one, minus the broken faces)
    if (clipped) this.blocks[id].carved = new Set();
    return id;
  }

  get count(): number {
    return this.blocks.length;
  }

  /** Min / max corners (metres) of a block. */
  boxOf(id: number): { min: [number, number, number]; max: [number, number, number] } {
    const b = this.blocks[id];
    const r = this.res;
    return { min: [b.i0 * r, b.j0 * r, b.k0 * r], max: [b.i1 * r, b.j1 * r, b.k1 * r] };
  }

  /** Change a block's colour / look after laying it. */
  restyle(id: number, color?: number, style: BlockStyle = {}): void {
    const b = this.blocks[id];
    if (!b) return;
    if (color !== undefined) b.color = color;
    if (style.mat) b.mat = style.mat;
    if (style.surf) b.surf = style.surf;
    if (style.shade !== undefined) b.shade = style.shade;
    if (style.broken !== undefined) b.broken = style.broken;
  }

  /** Take a whole block out (the "missing block"). */
  remove(id: number): void {
    const b = this.blocks[id];
    if (!b || b.removed) return;
    b.removed = true;
    for (let i = b.i0; i < b.i1; i++)
      for (let j = b.j0; j < b.j1; j++)
        for (let k = b.k0; k < b.k1; k++) {
          const kk = key(i, j, k);
          if (this.owner.get(kk) === id) this.owner.delete(kk);
        }
  }

  /** Ids of the blocks whose centre satisfies `pred` (metres). */
  find(pred: (x: number, y: number, z: number, id: number) => boolean): number[] {
    const r = this.res;
    return this.blocks.filter((b) => !b.removed && pred(((b.i0 + b.i1) / 2) * r, ((b.j0 + b.j1) / 2) * r, ((b.k0 + b.k1) / 2) * r, b.id)).map((b) => b.id);
  }

  /** Is the point (metres) inside stone? */
  solidAt(x: number, y: number, z: number): boolean {
    const r = this.res;
    return this.owner.has(key(Math.floor(x / r), Math.floor(y / r), Math.floor(z / r)));
  }

  /** Carve away every cell whose centre (metres) satisfies `pred`; returns how many went. */
  carve(pred: (x: number, y: number, z: number) => boolean, bounds?: { min: [number, number, number]; max: [number, number, number] }): number {
    const r = this.res;
    let n = 0;
    const cells: number[] = [];
    if (bounds) {
      for (let i = Math.floor(bounds.min[0] / r); i < Math.ceil(bounds.max[0] / r); i++)
        for (let j = Math.floor(bounds.min[1] / r); j < Math.ceil(bounds.max[1] / r); j++)
          for (let k = Math.floor(bounds.min[2] / r); k < Math.ceil(bounds.max[2] / r); k++) {
            const kk = key(i, j, k);
            if (this.owner.has(kk)) cells.push(kk);
          }
    } else cells.push(...this.owner.keys());
    for (const kk of cells) {
      const [i, j, k] = unkey(kk);
      if (pred((i + 0.5) * r, (j + 0.5) * r, (k + 0.5) * r)) {
        this.removeCell(kk);
        n++;
      }
    }
    return n;
  }

  /** A rough bite: cells within a noise-perturbed sphere (metres). */
  carveSphere(cx: number, cy: number, cz: number, radius: number, seed = 1, rough = 0.35): number {
    const s = 1 / Math.max(this.res * 2, radius * 0.45);
    return this.carve(
      (x, y, z) => Math.hypot(x - cx, y - cy, z - cz) < radius * (1 + (valueNoise3(x * s, y * s, z * s, seed) - 0.5) * 2 * rough),
      { min: [cx - radius * 1.5, cy - radius * 1.5, cz - radius * 1.5], max: [cx + radius * 1.5, cy + radius * 1.5, cz + radius * 1.5] },
    );
  }

  /**
   * Weathering: chip exposed edges and corners away in irregular runs.
   * `amount` 0‥1 (0.2 = a few chips, 0.6 = heavily eroded); `passes` digs deeper.
   */
  erode(amount: number, seed = 1, o: { passes?: number; where?: (x: number, y: number, z: number) => boolean } = {}): number {
    if (amount <= 0) return 0;
    const r = this.res;
    let removed = 0;
    for (let pass = 0; pass < (o.passes ?? (amount > 0.5 ? 2 : 1)); pass++) {
      const drop: number[] = [];
      for (const kk of this.owner.keys()) {
        const [i, j, k] = unkey(kk);
        let exposed = 0;
        let fromAbove = false;
        for (const [dx, dy, dz] of N6)
          if (!this.owner.has(key(i + dx, j + dy, k + dz))) {
            exposed++;
            if (dy === 1) fromAbove = true;
          }
        if (exposed < 2) continue;
        const x = (i + 0.5) * r;
        const y = (j + 0.5) * r;
        const z = (k + 0.5) * r;
        if (o.where && !o.where(x, y, z)) continue;
        // Runs of chips rather than salt-and-pepper: noise decides where it's worn.
        const run = valueNoise3(i * 0.45, j * 0.45, k * 0.45, seed + pass * 17) * 1.4;
        const p = amount * (exposed >= 3 ? 0.95 : fromAbove ? 0.6 : 0.42) * run * (pass ? 0.55 : 1);
        if (hash3(i, j, k, seed + 31 + pass) < p) drop.push(kk);
      }
      for (const kk of drop) this.removeCell(kk);
      removed += drop.length;
    }
    return removed;
  }

  private removeCell(kk: number): void {
    const id = this.owner.get(kk);
    if (id === undefined) return;
    this.owner.delete(kk);
    this.carvedAll.add(kk);
    const b = this.blocks[id];
    (b.carved ??= new Set()).add(kk);
  }

  /** Bounds (metres) of everything still standing. */
  bounds(): { min: [number, number, number]; max: [number, number, number] } {
    const r = this.res;
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (const b of this.blocks) {
      if (b.removed) continue;
      min[0] = Math.min(min[0], b.i0 * r);
      min[1] = Math.min(min[1], b.j0 * r);
      min[2] = Math.min(min[2], b.k0 * r);
      max[0] = Math.max(max[0], b.i1 * r);
      max[1] = Math.max(max[1], b.j1 * r);
      max[2] = Math.max(max[2], b.k1 * r);
    }
    return { min, max };
  }

  /**
   * Emit the voxels: intact blocks as single boxes (faces hidden by neighbours
   * culled from the rim highlight), carved blocks as their remaining cells.
   * Sides against another block are flagged `joint`, so the stone's gap opens
   * a thin joint there.
   */
  emit(b: VoxelBuilder, o: { jitter?: number; seed?: number } = {}): VoxelBuilder {
    const r = this.res;
    const jitter = o.jitter ?? 0.05;
    const seed = o.seed ?? 1;
    const carvedBlocks = this.blocks.filter((bl) => !bl.removed && bl.carved);
    const covered = (i0: number, i1: number, j0: number, j1: number, k0: number, k1: number) => {
      for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) for (let k = k0; k < k1; k++) if (!this.owner.has(key(i, j, k))) return false;
      return true;
    };
    for (const bl of this.blocks) {
      if (bl.removed || bl.carved) continue;
      const { i0, i1, j0, j1, k0, k1 } = bl;
      const open =
        (covered(i1, i1 + 1, j0, j1, k0, k1) ? 0 : 1) |
        (covered(i0 - 1, i0, j0, j1, k0, k1) ? 0 : 2) |
        (covered(i0, i1, j1, j1 + 1, k0, k1) ? 0 : 4) |
        (covered(i0, i1, j0 - 1, j0, k0, k1) ? 0 : 8) |
        (covered(i0, i1, j0, j1, k1, k1 + 1) ? 0 : 16) |
        (covered(i0, i1, j0, j1, k0 - 1, k0) ? 0 : 32);
      if (open === 0) continue;
      const shade = bl.shade * (1 + (hash3(i0, j0, k0, seed) - 0.5) * 2 * jitter);
      b.box(((i0 + i1) / 2) * r, ((j0 + j1) / 2) * r, ((k0 + k1) / 2) * r, (i1 - i0) * r, (j1 - j0) * r, (k1 - k0) * r, bl.color, bl.mat, {
        shade,
        open,
        joint: ~open & 63,
        surf: bl.surf,
        src: bl.src,
      });
    }
    if (!carvedBlocks.length) return b;
    // Carved blocks: their remaining cells, merged into x-runs. Sides that continue
    // into the same block are flagged `merge` (no bevel), so the cells still read as
    // one stone with bites out of it; joints to other blocks keep their groove. Cells
    // on the stone's own surface keep its bevel, so worn blocks have the same edges
    // as intact ones; cells the damage laid bare keep small, sharp edges.
    const status = (id: number, i: number, j: number, k: number) => {
      const n = this.owner.get(key(i, j, k));
      return n === undefined ? 1 : n === id ? 2 : 0; // 1 open, 2 same stone, 0 other stone
    };
    for (const bl of carvedBlocks) {
      const shade = bl.shade * (1 + (hash3(bl.i0, bl.j0, bl.k0, seed) - 0.5) * 2 * jitter);
      const radius = Math.min(bl.i1 - bl.i0, bl.j1 - bl.j0, bl.k1 - bl.k0) * r * VOXEL_MATERIALS[bl.mat].bevel;
      for (let j = bl.j0; j < bl.j1; j++)
        for (let k = bl.k0; k < bl.k1; k++) {
          let run: { i0: number; i1: number; color: number; sig: number; raw: boolean } | null = null;
          const flush = () => {
            if (!run) return;
            const r0 = run;
            run = null;
            const sx = status(bl.id, r0.i1, j, k);
            const nx = status(bl.id, r0.i0 - 1, j, k);
            const open = (sx === 1 ? 1 : 0) | (nx === 1 ? 2 : 0) | (r0.sig & 0b111100);
            const merge = (sx === 2 ? 1 : 0) | (nx === 2 ? 2 : 0) | ((r0.sig >> 6) & 0b111100);
            const joint = (sx === 0 ? 1 : 0) | (nx === 0 ? 2 : 0) | ((r0.sig >> 12) & 0b111100);
            if (open === 0) return; // buried inside the stone
            b.box(((r0.i0 + r0.i1) / 2) * r, (j + 0.5) * r, (k + 0.5) * r, (r0.i1 - r0.i0) * r, r, r, r0.color, bl.mat, {
              shade,
              open,
              merge,
              joint,
              radius: r0.raw ? undefined : radius,
              surf: bl.surf,
              src: bl.src,
            });
          };
          for (let i = bl.i0; i <= bl.i1; i++) {
            const inside = i < bl.i1 && this.owner.get(key(i, j, k)) === bl.id;
            if (!inside) {
              flush();
              continue;
            }
            // Perpendicular sides: open, merge and joint bits (y, z) of this cell.
            const st = [status(bl.id, i, j + 1, k), status(bl.id, i, j - 1, k), status(bl.id, i, j, k + 1), status(bl.id, i, j, k - 1)];
            const sides = (v: number) => (st[0] === v ? 4 : 0) | (st[1] === v ? 8 : 0) | (st[2] === v ? 16 : 0) | (st[3] === v ? 32 : 0);
            const sig = sides(1) | (sides(2) << 6) | (sides(0) << 12);
            // Faces the damage opened up get the rough broken-stone colour.
            let raw = false;
            for (const [dx, dy, dz] of N6) if (this.carvedAll.has(key(i + dx, j + dy, k + dz))) raw = true;
            const color = raw && bl.broken ? bl.broken[Math.floor(hash3(i, j, k, seed + 5) * bl.broken.length)] : bl.color;
            // Hidden cells (no open side along y/z and covered ends) still split runs cleanly.
            if (run && run.color === color && run.sig === sig && run.raw === raw) run.i1 = i + 1;
            else {
              flush();
              run = { i0: i, i1: i + 1, color, sig, raw };
            }
          }
          flush();
        }
    }
    return b;
  }
}

export interface MasonryOptions {
  /** Block length range along the course (metres). */
  length: [number, number];
  /** Course height (metres). */
  course: number;
  /** Deepest single block; thicker volumes get several skins. */
  depth?: number;
  /** Course direction (default: the longer horizontal side). */
  axis?: 'x' | 'z';
  palette: readonly number[];
  style?: BlockStyle | ((id: number, course: number) => BlockStyle);
  seed?: number;
  /** Offset alternate courses by about half a block (running bond, default true). */
  stagger?: boolean;
}

/**
 * Lay a box volume (metres) as masonry courses with staggered joints — walls,
 * platforms, steps, rims. Returns the ids of the blocks, bottom course first.
 */
export function masonry(set: BlockSet, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, o: MasonryOptions): number[] {
  const r = set.res;
  const q = (v: number) => Math.round(v / r) * r;
  const [ax, bx] = [q(Math.min(x0, x1)), q(Math.max(x0, x1))];
  const [ay, by] = [q(Math.min(y0, y1)), q(Math.max(y0, y1))];
  const [az, bz] = [q(Math.min(z0, z1)), q(Math.max(z0, z1))];
  const axis = o.axis ?? (bx - ax >= bz - az ? 'x' : 'z');
  const [a0, a1] = axis === 'x' ? [ax, bx] : [az, bz];
  const [d0, d1] = axis === 'x' ? [az, bz] : [ax, bx];
  const seed = o.seed ?? 1;
  const ids: number[] = [];
  const courses = Math.max(1, Math.round((by - ay) / o.course));
  const maxDepth = o.depth ?? Infinity;
  const skins = Math.max(1, Math.ceil((d1 - d0) / maxDepth - 1e-6));
  for (let c = 0; c < courses; c++) {
    const cy0 = q(ay + ((by - ay) * c) / courses);
    const cy1 = q(ay + ((by - ay) * (c + 1)) / courses);
    for (let s = 0; s < skins; s++) {
      const sd0 = q(d0 + ((d1 - d0) * s) / skins);
      const sd1 = q(d0 + ((d1 - d0) * (s + 1)) / skins);
      let a = a0;
      let n = 0;
      // Running bond: every other course starts with a part block.
      if (o.stagger ?? true) {
        const off = (c + s) % 2 ? q(((o.length[0] + o.length[1]) / 4) * (0.8 + 0.4 * hash3(c, s, 1, seed))) : 0;
        if (off > r && off < a1 - a0) {
          ids.push(put(a, a + off));
          a += off;
        }
      }
      while (a < a1 - 1e-6) {
        let len = q(o.length[0] + (o.length[1] - o.length[0]) * hash3(c, s, n++, seed + 3));
        len = Math.max(r, len);
        // Don't leave a sliver at the end of the course.
        if (a1 - (a + len) < o.length[0] * 0.5) len = a1 - a;
        ids.push(put(a, a + len));
        a += len;
      }
      function put(p0: number, p1: number): number {
        const color = o.palette[Math.floor(hash3(Math.round(p0 / r), c, s, seed + 9) * o.palette.length)];
        const id = axis === 'x' ? set.add(p0, cy0, sd0, p1, cy1, sd1, color) : set.add(sd0, cy0, p0, sd1, cy1, p1, color);
        const style = typeof o.style === 'function' ? o.style(id, c) : o.style;
        if (style && id >= 0) set.restyle(id, undefined, style);
        return id;
      }
    }
  }
  return ids.filter((id) => id >= 0);
}
