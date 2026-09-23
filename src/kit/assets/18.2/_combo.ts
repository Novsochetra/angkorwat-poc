import type { VoxelMaterialKey } from '../../../voxel/materials';
import { VoxelBuilder, type VoxelBox } from '../../../voxel/VoxelBuilder';
import { TILE } from '../../lib/ground';
import { TEXEL } from '../../shapes';
import { DEPTH, N, Texels, type TexelStyle } from './_tiles';

/**
 * The §18.2 combination tiles: ground tiles of whole metres (2 × 2 m on the
 * sheet) painted texel by texel like the 1 m tiles, their pattern running on
 * unbroken over the whole top. {@link Canvas} holds the painting in texels of
 * the whole tile and has the tiles' `Texels` draw it one metre at a time (it
 * keeps its plates inside a 1 m tile): each metre gets its own cells plus a
 * ring of its neighbours' as ghosts, so no faces are drawn between metres,
 * raised detail shades as one piece, and lumps that run on into the next
 * metre are merged into it afterwards.
 */

type Vec3 = [number, number, number];

interface Cell {
  i: number;
  j: number;
  k: number;
  color: number;
  s: TexelStyle;
  ghost: boolean;
}

const BIAS = 512;
const SPAN = 1024;
const key = (i: number, j: number, k: number) => ((i + BIAS) * SPAN + (j + BIAS)) * SPAN + (k + BIAS);

const N6: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/** Side bits (`open` / `merge`) of +x, −x, +z, −z and their directions. */
const SIDES: [number, number, number][] = [
  [1, 1, 0],
  [2, -1, 0],
  [16, 0, 1],
  [32, 0, -1],
];

/**
 * Texel cells of a w × d m tile: cell (i, j, k) spans x from −w/2 + i/16,
 * y from j/16 (j = −1 is the top layer of the ground, j = 0 stands on it),
 * z from −d/2 + k/16. Styles as `Texels` (group 0 = the painted skin).
 */
export class Canvas {
  /** Texels along x and z. */
  readonly ni: number;
  readonly nk: number;
  private readonly cells = new Map<number, Cell>();
  private groups = 1;

  constructor(
    readonly w: number,
    readonly d: number,
    readonly mat: VoxelMaterialKey,
  ) {
    this.ni = Math.round(w / TEXEL);
    this.nk = Math.round(d / TEXEL);
  }

  set(i: number, j: number, k: number, color: number, s: TexelStyle = {}): this {
    this.cells.set(key(i, j, k), { i, j, k, color, s, ghost: false });
    return this;
  }

  /** Occupied but drawn by something else (the inside of the body). */
  ghost(i: number, j: number, k: number): this {
    if (!this.cells.has(key(i, j, k))) this.cells.set(key(i, j, k), { i, j, k, color: 0, s: {}, ghost: true });
    return this;
  }

  has(i: number, j: number, k: number): boolean {
    return this.cells.has(key(i, j, k));
  }

  /** Colour of a drawn cell (undefined for empty or ghost cells). */
  color(i: number, j: number, k: number): number | undefined {
    const c = this.cells.get(key(i, j, k));
    return c && !c.ghost ? c.color : undefined;
  }

  delete(i: number, j: number, k: number): this {
    this.cells.delete(key(i, j, k));
    return this;
  }

  /** A group of its own for raised detail (see `TexelStyle.group`). */
  loose(): number {
    return this.groups++;
  }

  /** Is (i, k) a column of the tile? */
  inside(i: number, k: number): boolean {
    return i >= 0 && k >= 0 && i < this.ni && k < this.nk;
  }

  /** Highest drawn cell of a column (−1 = the ground's own top layer), or −Infinity. */
  top(i: number, k: number, from = 8): number {
    for (let j = from; j >= -DEPTH; j--) if (this.color(i, j, k) !== undefined) return j;
    return -Infinity;
  }

  /**
   * The visible skin of the body `depth` texels deep: its top layer and four
   * sides (the bottom is never seen). Ghosts the cells just inside it, so only
   * outward faces get painted.
   */
  skin(depth = DEPTH): Vec3[] {
    const out: Vec3[] = [];
    const [ni, nk] = [this.ni, this.nk];
    for (let j = -depth - 1; j < 0; j++)
      for (let i = 0; i < ni; i++)
        for (let k = 0; k < nk; k++) {
          const rim = i === 0 || k === 0 || i === ni - 1 || k === nk - 1;
          if (j === -depth - 1) this.ghost(i, j, k);
          else if (j === -1 || rim) out.push([i, j, k]);
          else if (j === -2 || i === 1 || k === 1 || i === ni - 2 || k === nk - 2) this.ghost(i, j, k);
        }
    return out;
  }

  /** The top texel column along each edge, with its outward direction: [i, k, di, dk] (corners once per side). */
  edges(): [number, number, number, number][] {
    const out: [number, number, number, number][] = [];
    for (let a = 0; a < this.ni; a++) out.push([a, this.nk - 1, 0, 1], [a, 0, 0, -1]);
    for (let a = 0; a < this.nk; a++) out.push([this.ni - 1, a, 1, 0], [0, a, -1, 0]);
    return out;
  }

  /** Emit everything (piece space, the tile centred on the origin); returns the number of boxes. */
  emit(b: VoxelBuilder): number {
    let count = 0;
    // Skin cells closed in on every side by skin draw nothing: pass them as ghosts (cheaper, same result).
    const closed = (c: Cell) =>
      (c.s.group ?? 0) === 0 &&
      N6.every(([a, d, e]) => {
        const n = this.cells.get(key(c.i + a, c.j + d, c.k + e));
        return !!n && (n.ghost || (n.s.group ?? 0) === 0);
      });
    // One pass over the cells: each goes to its own metre, and as a ghost to
    // the metres whose ring it lies in.
    const [mi, mk] = [Math.ceil(this.ni / N), Math.ceil(this.nk / N)];
    const parts = Array.from({ length: mi * mk }, () => new Texels(this.mat));
    for (const c of this.cells.values()) {
      const [qi, qk] = [Math.floor(c.i / N), Math.floor(c.k / N)];
      const drawn = !c.ghost && !closed(c);
      for (let a = Math.max(0, qi - 1); a <= Math.min(mi - 1, qi + 1); a++)
        for (let d = Math.max(0, qk - 1); d <= Math.min(mk - 1, qk + 1); d++) {
          const [li, lk] = [c.i - a * N, c.k - d * N];
          if (li < -1 || lk < -1 || li > N || lk > N) continue;
          if (drawn && a === qi && d === qk) parts[a * mk + d].set(li, c.j, lk, c.color, c.s);
          else parts[a * mk + d].ghost(li, c.j, lk);
        }
    }
    parts.forEach((t, q) => {
      const [qi, qk] = [Math.floor(q / mk), q % mk];
      const part = new VoxelBuilder();
      count += t.emit(part);
      for (const box of part.boxes) this.stitch(box, qi * N, qk * N);
      part.translate(-this.w / 2 + (qi + 0.5) * TILE, 0, -this.d / 2 + (qk + 0.5) * TILE);
      b.append(part);
    });
    return count;
  }

  /**
   * A raised run ending on a metre's edge merges into the cells across it when
   * they are the same lump (group, colour and flat shade alike) — what `Texels`
   * does inside a metre — so a cushion over the seam stays one soft mass.
   */
  private stitch(box: VoxelBox, i0: number, k0: number): void {
    const T = TEXEL;
    if (box.sy < T * 0.9 || box.sz < T * 0.9 || box.sx < T * 0.9) return; // plates and caps
    const a0 = i0 + Math.round((box.x - box.sx / 2 + TILE / 2) / T);
    const a1 = i0 + Math.round((box.x + box.sx / 2 + TILE / 2) / T);
    const j = Math.round(box.y / T - 0.5);
    const k = k0 + Math.round((box.z + TILE / 2) / T - 0.5);
    const flat = (c: Cell) => (c.s.cap !== undefined || !c.s.ao ? (c.s.shade ?? 1) : NaN);
    const alike = (a?: Cell, c?: Cell) =>
      !!a && !!c && !a.ghost && !c.ghost && (a.s.group ?? 0) !== 0 && a.s.group === c.s.group && a.color === c.color && (a.s.mat ?? this.mat) === (c.s.mat ?? this.mat) && a.s.surf === c.s.surf && flat(a) === flat(c);
    const cell = (i: number, kk: number) => this.cells.get(key(i, j, kk));
    for (const [bit, di, dk] of SIDES) {
      if ((box.merge ?? 0) & bit) continue;
      // Only sides on a seam between two metres of this tile.
      const edge = di > 0 ? a1 : di < 0 ? a0 : dk > 0 ? k + 1 : k;
      const on = di !== 0 ? edge % N === 0 && edge > 0 && edge < this.ni : edge % N === 0 && edge > 0 && edge < this.nk;
      if (!on) continue;
      let all = true;
      if (di !== 0) all = alike(cell(di > 0 ? a1 - 1 : a0, k), cell(di > 0 ? a1 : a0 - 1, k));
      else for (let i = a0; i < a1 && all; i++) all = alike(cell(i, k), cell(i, k + dk));
      if (!all) continue;
      box.merge = (box.merge ?? 0) | bit;
      if (box.open !== undefined) box.open &= ~bit;
    }
  }
}
