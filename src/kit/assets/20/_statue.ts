import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { traceSource } from '../../../feedback/sourceTrace';
import { hash3, valueNoise3 } from '../../../voxel/random';
import type { VoxelMaterialKey } from '../../../voxel/materials';
import type { Surf, VoxelBuilder } from '../../../voxel/VoxelBuilder';
import { fromSheet } from '../../palette';
import { TEXEL } from '../../shapes';
import { PROP_MOSS } from './_masonry-props';

/**
 * Sculpting kit for the §20 broken statues: a sparse carve grid whose cells
 * carry a part tag (face stone, eye slit, hair curls, plinth…), filled from
 * design functions and damaged by breaks, bites and chipped edges.
 *
 * Designs are written in texels at the statue's default size; a grid samples
 * them at its cell centres divided by the scale, so a taller statue gets more
 * cells rather than bigger ones and every cell stays on the texel grid.
 */
export type V3 = [number, number, number];

/**
 * What a cell is: a tag (low 4 bits: face stone, eye slit, curls…) that decides
 * its colour, and the stone it belongs to (higher bits): cells of one stone
 * merge into one carved surface, different stones meet in a seam — the chunky
 * blocks the sheet builds its statues from.
 */
export type Part = number;
export const part = (tag: number, stone: number): Part => tag | (stone << 4);
export const tagOf = (p: Part) => p & 15;
export const stoneOf = (p: Part) => p >> 4;

/**
 * The statues' stone, sampled off the sheet's statue crop the way the §20
 * props sample theirs (the average of a lit top and a lit front, through
 * fromSheet): the fallen head, the headless figure's shoulders and chest, the
 * Buddha's chest and the broken pedestal. A taupe a touch greyer than the
 * props' tan blocks, as the sheet draws its statues.
 */
export const STATUE_STONE = [0xb69176, 0xac8d70, 0xb29277, 0xa78761, 0xaf8e70].map(fromSheet);
/** Moss mats: the §20 props' yellow-olive, mostly mid tones with a lit and a dark one. */
export const STATUE_MOSS = [PROP_MOSS.mid[0], PROP_MOSS.mid[1], PROP_MOSS.lit[1], PROP_MOSS.mid[0], PROP_MOSS.deep[0]];

/** Thickness of a moss mat, as a share of the cell. */
const CUSHION = 0.34;

const BIAS = 1024;
const SPAN = 2048;
const key = (i: number, j: number, k: number) => ((i + BIAS) * SPAN + (j + BIAS)) * SPAN + (k + BIAS);
const unkey = (kk: number): V3 => {
  const r = Math.floor(kk / SPAN);
  return [Math.floor(r / SPAN) - BIAS, (r % SPAN) - BIAS, (kk % SPAN) - BIAS];
};
const N6: V3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

// ── Signed distances (design units) ──────────────────────────────────────────
// Designs are sampled at every cell of a grid, so the forms are built once as
// distance functions (`box`, `bar`, `ellipsoid`) with their frames worked out.

/** A signed distance function: < 0 inside the form. */
export type Sd = (x: number, y: number, z: number) => number;

/** Distance to a box round the origin with inner half sizes h and edges rounded by r. */
function boxDist(px: number, py: number, pz: number, hx: number, hy: number, hz: number, r: number): number {
  const qx = Math.abs(px) - hx;
  const qy = Math.abs(py) - hy;
  const qz = Math.abs(pz) - hz;
  const ox = qx > 0 ? qx : 0;
  const oy = qy > 0 ? qy : 0;
  const oz = qz > 0 ? qz : 0;
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

/** Box with rounded edges: centre, half sizes, corner radius (for sizes that vary per sample). */
export function sdBox(x: number, y: number, z: number, c: V3, h: V3, r = 0): number {
  return boxDist(x - c[0], y - c[1], z - c[2], h[0] - r, h[1] - r, h[2] - r, r);
}

/** Box with rounded edges: centre, half sizes, corner radius. */
export function box(c: V3, h: V3, r = 0): Sd {
  const [cx, cy, cz] = c;
  const [hx, hy, hz] = [h[0] - r, h[1] - r, h[2] - r];
  return (x, y, z) => boxDist(x - cx, y - cy, z - cz, hx, hy, hz, r);
}

/** Ellipsoid (approximate distance, exact sign): centre, radii. */
export function ellipsoid(c: V3, rad: V3): Sd {
  const [cx, cy, cz] = c;
  const [ix, iy, iz] = [1 / rad[0], 1 / rad[1], 1 / rad[2]];
  const inner = -Math.min(...rad);
  return (x, y, z) => {
    const ax = (x - cx) * ix;
    const ay = (y - cy) * iy;
    const az = (z - cz) * iz;
    const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
    const k1 = Math.sqrt(ax * ax * ix * ix + ay * ay * iy * iy + az * az * iz * iz);
    return k1 > 0 ? (k0 * (k0 - 1)) / k1 : inner;
  };
}

/**
 * A block laid from a to b (a limb carved as a chunky bevelled block): half
 * width `hw` across (horizontal), half height `hh`, edges rounded by `r`.
 */
export function bar(a: V3, b: V3, hw: number, hh: number, r = 0): Sd {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const len = Math.hypot(ux, uy, uz);
  const [dx, dy, dz] = [ux / len, uy / len, uz / len];
  // Horizontal perpendicular (up × axis), falling back to x for vertical bars.
  let vx = dz;
  let vz = -dx;
  const vl = Math.hypot(vx, vz);
  if (vl < 1e-4) [vx, vz] = [1, 0];
  else [vx, vz] = [vx / vl, vz / vl];
  const [wx, wy, wz] = [dy * vz, dz * vx - dx * vz, -dy * vx];
  const [mx, my, mz] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const [hl, hv, hu] = [len / 2 - r, hw - r, hh - r];
  return (x, y, z) => {
    const px = x - mx;
    const py = y - my;
    const pz = z - mz;
    return boxDist(px * dx + py * dy + pz * dz, px * vx + pz * vz, px * wx + py * wy + pz * wz, hl, hv, hu, r);
  };
}

/** Inside a noise-perturbed sphere (design units): the shape of bites and breaks. */
function lump(c: V3, r: number, seed: number, rough: number): (x: number, y: number, z: number) => boolean {
  const s = 1 / Math.max(1, r * 0.5);
  const out = r * (1 + rough);
  return (x, y, z) => {
    const d = Math.hypot(x - c[0], y - c[1], z - c[2]);
    return d < out && d < r * (1 + (valueNoise3(x * s, y * s, z * s, seed) - 0.5) * 2 * rough);
  };
}

/** Smooth union: blends two forms over `k` units, like carved transitions. */
export function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// ── Carve grid ────────────────────────────────────────────────────────────────

export interface CellInfo {
  i: number;
  j: number;
  k: number;
  /** Cell centre in design units. */
  x: number;
  y: number;
  z: number;
  part: Part;
  /** Nothing above: the face moss and rain land on. */
  top: boolean;
  /** Share of the 3 × 3 cells above that are open (1 = a broad roof, low = a narrow ledge). */
  sky: number;
  /** Next to stone that broke away: shows a fresh break. */
  scar: boolean;
}

export interface CellLook {
  color: number;
  mat?: VoxelMaterialKey;
  surf?: Surf;
  shade?: number;
  /** A mat of moss on the cell's top face: its colour (sheet olive). */
  cushion?: number;
}

/** The 26 neighbours of a cell: offsets and the weight of each in the exposure (faces, edges, corners). */
const N26: [number, number, number, number][] = [];
for (let dx = -1; dx <= 1; dx++)
  for (let dy = -1; dy <= 1; dy++)
    for (let dz = -1; dz <= 1; dz++) {
      const m = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
      if (m) N26.push([dx, dy, dz, m === 1 ? 1 : m === 2 ? 0.6 : 0.35]);
    }
const N26_TOTAL = N26.reduce((t, n) => t + n[3], 0);

/**
 * A carver's cells (1) and ghosts (2) as a dense grid for the passes that
 * look at every cell's neighbours, padded by `pad` cells so lookups round
 * any cell stay inside. Index steps: `sx`, `sy`, 1 along x, y, z.
 */
class Dense {
  readonly grid: Uint8Array;
  readonly lo: V3;
  readonly n: V3;
  readonly pad: number;
  readonly sx: number;
  readonly sy: number;
  /** Index offsets of the six face neighbours (±x, ±y, ±z) and of the 26. */
  readonly n6: number[];
  readonly n26: number[];

  constructor(cells: Map<number, V3>, ghosts: Map<number, V3>, pad: number) {
    this.pad = pad;
    const lo: V3 = [Infinity, Infinity, Infinity];
    const hi: V3 = [-Infinity, -Infinity, -Infinity];
    const reach = (q: V3) => {
      for (let a = 0; a < 3; a++) {
        if (q[a] - pad < lo[a]) lo[a] = q[a] - pad;
        if (q[a] + pad > hi[a]) hi[a] = q[a] + pad;
      }
    };
    for (const q of cells.values()) reach(q);
    for (const q of ghosts.values()) reach(q);
    this.lo = lo;
    this.n = [hi[0] - lo[0] + 1, hi[1] - lo[1] + 1, hi[2] - lo[2] + 1];
    this.sy = this.n[2];
    this.sx = this.n[1] * this.n[2];
    this.n6 = N6.map(([x, y, z]) => x * this.sx + y * this.sy + z);
    this.n26 = N26.map(([x, y, z]) => x * this.sx + y * this.sy + z);
    this.grid = new Uint8Array(cells.size ? this.n[0] * this.sx : 0);
    for (const [i, j, k] of ghosts.values()) this.grid[this.at(i, j, k)] = 2;
    for (const [i, j, k] of cells.values()) this.grid[this.at(i, j, k)] = 1;
  }

  at(i: number, j: number, k: number): number {
    return (i - this.lo[0]) * this.sx + (j - this.lo[1]) * this.sy + k - this.lo[2];
  }

  /** Does the grid, padding included, reach cell (i, j, k)? */
  holds(i: number, j: number, k: number): boolean {
    return i >= this.lo[0] && j >= this.lo[1] && k >= this.lo[2] && i < this.lo[0] + this.n[0] && j < this.lo[1] + this.n[1] && k < this.lo[2] + this.n[2];
  }

  /** Open face sides of the cell at index `q`, counted. */
  openSides(q: number): number {
    let open = 0;
    for (const o of this.n6) if (!this.grid[q + o]) open++;
    return open;
  }
}

/**
 * A sparse grid of statue cells. `cell` and `origin` are metres (origin = min
 * corner of cell 0, keep it on the texel grid); `unit` is metres per design
 * unit (one texel times the statue's scale).
 */
export class Carver {
  private readonly cells = new Map<number, Part>();
  private readonly idx = new Map<number, V3>();
  /** Cells damage took away: the stone around them shows the break. */
  private readonly scars = new Set<number>();
  /** Solid for shading and culling, drawn by someone else (plinth, another grid). */
  private readonly ghosts = new Map<number, V3>();
  /** The cells and ghosts dense, kept in step while cells come and go (see {@link dense}). */
  private grid?: Dense;

  /** Where the carver was made (for the feedback tool's picker). */
  private readonly src = traceSource();

  constructor(
    readonly cell: number,
    readonly origin: V3,
    readonly unit: number,
  ) {}

  /** Design coordinates of a cell centre. */
  design(i: number, j: number, k: number): V3 {
    const u = this.unit;
    return [(this.origin[0] + (i + 0.5) * this.cell) / u, (this.origin[1] + (j + 0.5) * this.cell) / u, (this.origin[2] + (k + 0.5) * this.cell) / u];
  }

  /** Index range of the cells whose centres lie in a design box. */
  private range(min: V3, max: V3): [number, number, number, number, number, number] {
    const u = this.unit;
    const c = this.cell;
    const lo = (a: number) => Math.ceil((min[a] * u - this.origin[a]) / c - 0.5);
    const hi = (a: number) => Math.floor((max[a] * u - this.origin[a]) / c - 0.5);
    return [lo(0), hi(0), lo(1), hi(1), lo(2), hi(2)];
  }

  /** Is there a cell at this point (metres)? */
  occupies(x: number, y: number, z: number): boolean {
    const c = this.cell;
    return this.cells.has(key(Math.floor((x - this.origin[0]) / c), Math.floor((y - this.origin[1]) / c), Math.floor((z - this.origin[2]) / c)));
  }

  set(i: number, j: number, k: number, part: Part): void {
    const kk = key(i, j, k);
    this.cells.set(kk, part);
    this.idx.set(kk, [i, j, k]);
    this.mark(i, j, k, 1);
  }

  /** Keep the dense grid in step (or let it go when a cell falls outside it). */
  private mark(i: number, j: number, k: number, v: number): void {
    if (!this.grid) return;
    if (this.grid.holds(i, j, k)) this.grid.grid[this.grid.at(i, j, k)] = v;
    else this.grid = undefined;
  }

  /**
   * Sample a design over a design-space box: `fn` returns the part at a cell
   * centre, or 0 for empty. Filled cells replace what was there.
   */
  add(min: V3, max: V3, fn: (x: number, y: number, z: number) => Part): void {
    const [i0, i1, j0, j1, k0, k1] = this.range(min, max);
    const s = this.cell / this.unit;
    const [bx, by, bz] = this.origin.map((o) => o / this.unit + s / 2);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++)
        for (let k = k0; k <= k1; k++) {
          const p = fn(bx + i * s, by + j * s, bz + k * s);
          if (p) this.set(i, j, k, p);
        }
  }

  /** Remove cells (design-space test). `scar` = broken away, so the rest shows the break. */
  cut(pred: (x: number, y: number, z: number, part: Part) => boolean, scar = true, keys: Iterable<number> = this.cells.keys()): number {
    const drop: number[] = [];
    for (const kk of keys) {
      const [i, j, k] = this.idx.get(kk)!;
      const [x, y, z] = this.design(i, j, k);
      if (pred(x, y, z, this.cells.get(kk)!)) drop.push(kk);
    }
    for (const kk of drop) this.drop(kk, scar);
    return drop.length;
  }

  /** A rough bite out of the stone (noise-perturbed sphere, design units). */
  bite(c: V3, r: number, seed: number, rough = 0.35): number {
    return this.cut(lump(c, r, seed, rough), true, this.around(c, r * (1 + rough)));
  }

  /** Keys of the cells whose centres lie within the cube of half size `r` round `c` (design units). */
  private around(c: V3, r: number): number[] {
    const [i0, i1, j0, j1, k0, k1] = this.range([c[0] - r, c[1] - r, c[2] - r], [c[0] + r, c[1] + r, c[2] + r]);
    const out: number[] = [];
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++)
        for (let k = k0; k <= k1; k++) {
          const kk = key(i, j, k);
          if (this.cells.has(kk)) out.push(kk);
        }
    return out;
  }

  /**
   * Break the cells that pass `pred` off into a piece of their own (same grid):
   * the stone left behind and the piece both show the break.
   */
  breakOff(pred: (x: number, y: number, z: number, part: Part) => boolean, keys: Iterable<number> = this.cells.keys()): Carver {
    const piece = new Carver(this.cell, this.origin, this.unit);
    for (const kk of keys) {
      const [i, j, k] = this.idx.get(kk)!;
      const [x, y, z] = this.design(i, j, k);
      const part = this.cells.get(kk)!;
      if (pred(x, y, z, part)) piece.set(i, j, k, part);
    }
    for (const [kk] of piece.cells) this.drop(kk, true);
    for (const [kk] of piece.cells) {
      const [i, j, k] = piece.idx.get(kk)!;
      for (const [dx, dy, dz] of N6) {
        const nk = key(i + dx, j + dy, k + dz);
        if (this.cells.has(nk)) piece.scars.add(nk);
      }
    }
    return piece;
  }

  /** A rough lump broken off (noise-perturbed sphere, design units). */
  breakSphere(c: V3, r: number, seed: number, rough = 0.35): Carver {
    return this.breakOff(lump(c, r, seed, rough), this.around(c, r * (1 + rough)));
  }

  /**
   * The same stone turned a quarter turn about an axis through the grid's
   * origin (+90°, right-handed): a fallen piece that keeps the texel grid.
   */
  turned(axis: 'x' | 'y' | 'z'): Carver {
    const out = new Carver(this.cell, this.origin, this.unit);
    const map = ([i, j, k]: V3): V3 => (axis === 'x' ? [i, -k - 1, j] : axis === 'y' ? [k, j, -i - 1] : [-j - 1, i, k]);
    for (const [kk, part] of this.cells) {
      const [i, j, k] = map(this.idx.get(kk)!);
      out.set(i, j, k, part);
    }
    for (const kk of this.scars) out.scars.add(key(...map(unkey(kk))));
    return out;
  }

  /** Rest the stone on the ground: the layer under its lowest cells counts as solid. */
  settle(): number {
    let low = Infinity;
    for (const [, j] of this.idx.values()) low = Math.min(low, j);
    for (const [i, j, k] of this.idx.values())
      if (j === low) {
        this.ghosts.set(key(i, j - 1, k), [i, j - 1, k]);
        this.mark(i, j - 1, k, 2);
      }
    return low;
  }

  /**
   * Weathering: chip exposed corners and edges in irregular runs (0‥1), only
   * where `where` allows (keep faces and fingers crisp).
   */
  chip(amount: number, seed: number, where: (x: number, y: number, z: number, part: Part) => boolean = () => true): number {
    const d = this.dense(1);
    const drop: number[] = [];
    for (const [kk, part] of this.cells) {
      const [i, j, k] = this.idx.get(kk)!;
      const open = d.openSides(d.at(i, j, k));
      if (open < 3) continue;
      const [x, y, z] = this.design(i, j, k);
      if (!where(x, y, z, part)) continue;
      const run = valueNoise3(x * 0.4, y * 0.4, z * 0.4, seed) * 1.5;
      if (hash3(i, j, k, seed + 7) < amount * run * (open >= 4 ? 1 : 0.55)) drop.push(kk);
    }
    for (const kk of drop) this.drop(kk, true);
    return drop.length;
  }

  private drop(kk: number, scar: boolean): void {
    const [i, j, k] = this.idx.get(kk)!;
    this.cells.delete(kk);
    this.idx.delete(kk);
    this.mark(i, j, k, this.ghosts.has(kk) ? 2 : 0);
    if (scar) this.scars.add(kk);
  }

  /**
   * The cells and ghosts as they stand, dense and padded by at least `pad`
   * cells (see {@link Dense}); built once and then kept in step.
   */
  private dense(pad: number): Dense {
    if (!this.grid || this.grid.pad < pad) this.grid = new Dense(this.idx, this.ghosts, Math.max(pad, 4));
    return this.grid;
  }

  /** Mark design-space cells as solid but drawn elsewhere (ground, plinth, a neighbouring grid). */
  ghost(min: V3, max: V3): void {
    const [i0, i1, j0, j1, k0, k1] = this.range(min, max);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++)
        for (let k = k0; k <= k1; k++) {
          const kk = key(i, j, k);
          this.ghosts.set(kk, [i, j, k]);
          if (!this.cells.has(kk)) this.mark(i, j, k, 2);
        }
  }

  /**
   * Drop loose bits damage left behind: groups of fewer than `min` cells that
   * touch nothing solid outside this grid (the ground, the pedestal, another grid).
   */
  prune(min = 12): void {
    const d = this.dense(1);
    const [, ny, nz] = d.n;
    const seen = new Uint8Array(d.grid.length);
    const loose: number[] = [];
    for (const kk of this.cells.keys()) {
      const [i, j, k] = this.idx.get(kk)!;
      const start = d.at(i, j, k);
      if (seen[start]) continue;
      seen[start] = 1;
      const group = [start];
      const keys = [kk];
      let anchored = false;
      for (let n = 0; n < group.length; n++)
        for (const s of d.n6) {
          const q = group[n] + s;
          if (d.grid[q] === 2) anchored = true;
          else if (d.grid[q] === 1 && !seen[q]) {
            seen[q] = 1;
            group.push(q);
            const x = Math.floor(q / (ny * nz));
            const y = Math.floor(q / nz) % ny;
            keys.push(key(x + d.lo[0], y + d.lo[1], (q % nz) + d.lo[2]));
          }
        }
      if (!anchored && group.length < min) loose.push(...keys);
    }
    for (const kk of loose) this.drop(kk, false);
  }

  /**
   * Add a cell beside exposed cells of the parts `from` picks (curls, moss
   * cushions…): for every open side but the underside, `fn` gets the new
   * cell's centre, the side (index into ±x, ±y, ±z) and the part it grows
   * from, and returns its part or 0.
   */
  grow(from: (p: Part) => boolean, fn: (x: number, y: number, z: number, side: number, from: Part) => Part): void {
    const add: [number, number, number, Part][] = [];
    for (const [kk, p] of this.cells) {
      if (!from(p)) continue;
      const [i, j, k] = this.idx.get(kk)!;
      for (let n = 0; n < 6; n++) {
        const [dx, dy, dz] = N6[n];
        const nk = key(i + dx, j + dy, k + dz);
        if (dy < 0 || this.cells.has(nk) || this.ghosts.has(nk)) continue;
        const [x, y, z] = this.design(i + dx, j + dy, k + dz);
        const np = fn(x, y, z, n, p);
        if (np) add.push([i + dx, j + dy, k + dz, np]);
      }
    }
    for (const [i, j, k, p] of add) this.set(i, j, k, p);
  }

  /**
   * The solid cells (drawn or ghost), dense and padded by `pad` + 1 cells,
   * with a 3D summed-area table over them: `hemmed` gives the share of solid
   * cells in the (2r + 1)³ window round the cell at index `q` (r ≤ pad).
   */
  private field(pad: number): { d: Dense; hemmed: (q: number, r: number) => number } {
    const d = this.dense(pad + 1);
    const { sx, sy } = d;
    const [nx, ny, nz] = d.n;
    // Sums over [0‥x] × [0‥y] × [0‥z]; the padding keeps the 0 slices empty.
    const s = new Int32Array(d.grid.length);
    for (let q = 0; q < s.length; q++) s[q] = d.grid[q] ? 1 : 0;
    for (let x = 1; x < nx; x++)
      for (let y = 1; y < ny; y++)
        for (let z = 1; z < nz; z++) {
          const q = x * sx + y * sy + z;
          s[q] += s[q - sx] + s[q - sy] + s[q - 1] - s[q - sx - sy] - s[q - sx - 1] - s[q - sy - 1] + s[q - sx - sy - 1];
        }
    return {
      d,
      hemmed: (q, r) => {
        const w = 2 * r + 1;
        const [ax, ay] = [w * sx, w * sy];
        const q1 = q + r * (sx + sy + 1);
        return (s[q1] - s[q1 - ax] - s[q1 - ay] - s[q1 - w] + s[q1 - ax - ay] + s[q1 - ax - w] + s[q1 - ay - w] - s[q1 - ax - ay - w]) / w ** 3;
      },
    };
  }

  /**
   * Emit the visible cells into a builder, coloured by `look`. Sides shared
   * with a cell of the same stone merge (no bevel, one carved surface); open
   * sides get the rim, sides against another stone keep a seam. Shading is
   * baked like a VoxelGrid's: exposure-based occlusion plus a little jitter,
   * both per texel so half-texel cells don't speckle. On top of that a
   * `cavity` term darkens stone that is hemmed in within ~9 cm (armpits,
   * under the chin, between the legs) the way the sheet's renders shade
   * their crevices, and lifts the rounded edges a little.
   */
  emit(b: VoxelBuilder, look: (c: CellInfo) => CellLook, o: { jitter?: number; ao?: number; cavity?: number; seed?: number } = {}): void {
    const jitter = o.jitter ?? 0.02;
    const ao = o.ao ?? 0.4;
    const cavity = o.cavity ?? 0.9;
    const seed = o.seed ?? 1;
    const c = this.cell;
    if (!this.cells.size) return;
    const reach = Math.max(1, Math.round(0.09 / c));
    const { d, hemmed } = this.field(reach);
    const g = d.grid;
    const { sx, sy } = d;
    /** Occupancy of a cell on a flat wall. */
    const flat = (reach + 1) / (2 * reach + 1);
    const mats = new Map<number, [number, number, number, number, number]>();
    for (const [kk, p] of this.cells) {
      const [i, j, k] = this.idx.get(kk)!;
      const q = d.at(i, j, k);
      if (!d.openSides(q)) continue;
      let open = 0;
      let merge = 0;
      let scar = false;
      let seam = false;
      for (let n = 0; n < 6; n++) {
        const [dx, dy, dz] = N6[n];
        const nk = key(i + dx, j + dy, k + dz);
        const q = this.cells.get(nk);
        if (q === undefined) {
          if (!this.ghosts.has(nk)) open |= 1 << n;
          if (this.scars.has(nk)) scar = true;
        } else if (stoneOf(q) === stoneOf(p)) merge |= 1 << n;
        else seam = true;
      }
      if (!open) continue;
      const [x, y, z] = this.design(i, j, k);
      // Exposure over the 26-neighbourhood: flat walls 1.0, edges lighter, folds darker.
      let exp = 0;
      for (let n = 0; n < 26; n++) if (!g[q + d.n26[n]]) exp += N26[n][3];
      // Joints between stones read as dark lines, like the sheet's chunky blocks.
      let shade = (1 + ao * Math.max(-0.7, Math.min(0.45, (exp / N26_TOTAL - 0.305) * 2))) * (seam ? 0.82 : 1);
      if (g[q + sy] && !g[q + 1] && g[q + sy + 1]) shade *= 1 - ao * 0.35;
      const hem = hemmed(q, reach) - flat;
      shade *= hem > 0 ? 1 - cavity * Math.min(0.62, hem * 2.3) : 1 - cavity * Math.max(-0.1, hem * 0.35);
      const wx = this.origin[0] + (i + 0.5) * c;
      const wy = this.origin[1] + (j + 0.5) * c;
      const wz = this.origin[2] + (k + 0.5) * c;
      shade *= 1 + (hash3(Math.floor(wx / TEXEL), Math.floor(wy / TEXEL), Math.floor(wz / TEXEL), seed) - 0.5) * 2 * jitter;
      let sky = 0;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (!g[q + sy + dx * sx + dz]) sky += 1 / 9;
      const l = look({ i, j, k, x, y, z, part: p, top: !g[q + sy], sky, scar });
      b.box(wx, wy, wz, c, c, c, l.color, l.mat ?? 'sandstone', {
        shade: shade * (l.shade ?? 1),
        open,
        merge,
        surf: l.surf,
        src: this.src,
      });
      if (l.cushion !== undefined && open & 4) mats.set(kk, [wx, wy, wz, l.cushion, shade]);
    }
    // Moss mats: thin slabs on the tops, merged with their neighbours into one cushion.
    const h = c * CUSHION;
    for (const [kk, [wx, wy, wz, color, shade]] of mats) {
      const [i, j, k] = this.idx.get(kk)!;
      const m = (di: number, dk: number, bit: number) => (mats.has(key(i + di, j, k + dk)) ? bit : 0);
      const merge = m(1, 0, 1) | m(-1, 0, 2) | m(0, 1, 16) | m(0, -1, 32);
      b.box(wx, wy + c / 2 + h / 2, wz, c, h, c, color, 'leaves', { shade, open: 63 & ~merge & ~8, merge, surf: [0, 0.35, 0, 0], src: this.src });
    }
  }
}

// ── Placing ───────────────────────────────────────────────────────────────────

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _v = new Vector3();

/**
 * Turn every box added since `start` rigidly about `pivot` (metres) by the
 * Euler angles `rot` (radians, XYZ): fallen pieces lying askew.
 */
export function rotateSince(b: VoxelBuilder, start: number, pivot: V3, rot: V3): void {
  _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
  _m.makeRotationFromQuaternion(_q);
  for (let n = start; n < b.boxes.length; n++) {
    const box = b.boxes[n];
    _v.set(box.x - pivot[0], box.y - pivot[1], box.z - pivot[2]).applyMatrix4(_m);
    box.x = _v.x + pivot[0];
    box.y = _v.y + pivot[1];
    box.z = _v.z + pivot[2];
    box.rx = rot[0];
    box.ry = rot[1];
    box.rz = rot[2];
  }
}

/** Lowest corner height of the boxes since `start` (rotated boxes included). */
export function lowestSince(b: VoxelBuilder, start: number): number {
  let low = Infinity;
  for (let n = start; n < b.boxes.length; n++) {
    const box = b.boxes[n];
    _q.setFromEuler(_e.set(box.rx ?? 0, box.ry ?? 0, box.rz ?? 0));
    for (let c = 0; c < 8; c++) {
      _v.set(((c & 1) - 0.5) * box.sx, (((c >> 1) & 1) - 0.5) * box.sy, (((c >> 2) & 1) - 0.5) * box.sz).applyQuaternion(_q);
      low = Math.min(low, box.y + _v.y);
    }
  }
  return low;
}

/** Bounds (metres) of the unrotated boxes since `start`. */
export function boundsSince(b: VoxelBuilder, start: number): { min: V3; max: V3 } {
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (let n = start; n < b.boxes.length; n++) {
    const box = b.boxes[n];
    min[0] = Math.min(min[0], box.x - box.sx / 2);
    min[1] = Math.min(min[1], box.y - box.sy / 2);
    min[2] = Math.min(min[2], box.z - box.sz / 2);
    max[0] = Math.max(max[0], box.x + box.sx / 2);
    max[1] = Math.max(max[1], box.y + box.sy / 2);
    max[2] = Math.max(max[2], box.z + box.sz / 2);
  }
  return { min, max };
}

/** Centre (metres) of the boxes since `start`. */
export function centreSince(b: VoxelBuilder, start: number): V3 {
  const c: V3 = [0, 0, 0];
  const n = Math.max(1, b.boxes.length - start);
  for (let i = start; i < b.boxes.length; i++) {
    c[0] += b.boxes[i].x / n;
    c[1] += b.boxes[i].y / n;
    c[2] += b.boxes[i].z / n;
  }
  return c;
}

/** Shift the boxes since `start`. */
export function moveSince(b: VoxelBuilder, start: number, dx: number, dy: number, dz: number): void {
  for (let n = start; n < b.boxes.length; n++) {
    b.boxes[n].x += dx;
    b.boxes[n].y += dy;
    b.boxes[n].z += dz;
  }
}

/** Low-frequency tone pick: neighbouring cells share tones, like weathered blotches. */
export function blotch(palette: readonly number[], x: number, y: number, z: number, seed: number, scale = 0.22): number {
  const n = valueNoise3(x * scale, y * scale, z * scale, seed) * 0.75 + hash3(Math.floor(x), Math.floor(y), Math.floor(z), seed) * 0.25;
  return palette[Math.min(palette.length - 1, Math.floor(n * palette.length))];
}
