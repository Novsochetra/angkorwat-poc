import { hash3 } from '../../../voxel/random';
import type { Surf, VoxelBuilder, VoxelGrid } from '../../../voxel/VoxelBuilder';
import { Color } from 'three';
import { FLOWER } from '../../palette';
import type { PieceBuilder } from '../../PieceBuilder';
import { TEXEL, type Rng } from '../../shapes';
import { leafSurf } from '../../surface';

/**
 * Shared pieces of the §18.1 vegetation samples: the leaf "materials" of the
 * sheet's Leaf Variations (used by the leaf cubes and the bush) and the leaf
 * mass generator that gives them the sheet's look — every face broken into
 * plus-shaped leaf clusters, some raised, some sunk into dark gaps.
 */

/** Pixel of the sheet's leaf masses: 2 texels (1/8 m). */
export const LEAF_CELL = 1 / 8;

export interface LeafLook {
  /** Clusters on top, in full sun (default: `light`). */
  top?: readonly number[];
  /** Raised clusters: the sun-lit leaves. */
  light: readonly number[];
  /** Raised clusters a shade darker. */
  mid: readonly number[];
  /** Flush clusters: the shadowed leaves beneath the raised ones. */
  deep: readonly number[];
  /** The dark leaves at the bottom of the gaps. */
  gap: number;
  surf: Surf;
}

/** Light on a lit face before tone mapping, per channel (from SHEET_GAIN on clean sandstone). */
const LIT = [0.97, 0.928, 0.886];
const _c = new Color();

/**
 * Like fromSheet(), for saturated colours too: the studio's neutral tone
 * mapping pulls a colour's weakest channel towards black when it is dark —
 * blue, for leaf greens and bark browns — which the stone-calibrated
 * fromSheet() doesn't undo. This inverts that offset as well (checked on the
 * leaf cubes: lit faces land within a few percent of the sheet).
 */
export function sheetTone(hex: number): number {
  _c.setHex(hex);
  const t = [_c.r, _c.g, _c.b];
  const m = Math.min(...t);
  const off = (m < 0.04 ? Math.sqrt(m / 6.25) : m + 0.04) - m;
  _c.setRGB(...(t.map((v, i) => Math.min(1, (v + off) / LIT[i])) as [number, number, number]));
  return _c.getHex();
}

const S = (...hex: number[]) => hex.map(sheetTone);

/**
 * The canopy materials of the sheet's Leaf Variations, sampled off its six
 * cubes (measure.py, k-means tones of the top and the lit left face): the
 * clusters on top, the raised and flush clusters of the sides (light, mid),
 * the shadowed ones and the dark gaps — olive and yellow-green in the light,
 * cool greens beneath. The light tones are a tenth darker and the shadows a
 * fifth darker than sampled, since the studio lights the shaded sides more
 * than the sheet (checked on the whole cubes' medians).
 */
export const LEAF_LOOK = {
  bright: { top: S(0x95a547, 0x84973f, 0x8d9e43), light: S(0x909d2e, 0x7c8c26, 0x87952b), mid: S(0x6c7e28, 0x647627, 0x71842d), deep: S(0x34451e, 0x3a4d21, 0x324822), gap: sheetTone(0x142116), surf: leafSurf() },
  dark: { top: S(0x67793e, 0x5e703a, 0x6e7e41), light: S(0x586734, 0x56632e, 0x5e6e34), mid: S(0x485728, 0x4c5d2d, 0x425329), deep: S(0x2b371b, 0x263a23, 0x233326), gap: sheetTone(0x0b140d), surf: leafSurf() },
  yellowish: { top: S(0xb6ab34, 0xa6a236, 0xafa93f), light: S(0xa29820, 0x978f1f, 0xa99e2b), mid: S(0x868629, 0x79883b, 0x818027), deep: S(0x3b4616, 0x455a2e, 0x404b1b), gap: sheetTone(0x141f0f), surf: leafSurf({ yellow: 0.15 }) },
  jungle: { top: S(0x9ba644, 0x849332, 0x8e9d3d), light: S(0x88962d, 0x7a9032, 0x808e31), mid: S(0x577638, 0x3c6848, 0x4d6d38), deep: S(0x1f3f30, 0x1c3f35, 0x234434), gap: sheetTone(0x081a1a), surf: leafSurf() },
  vines: { top: S(0xb0ab3d, 0x94902f, 0xa29d36), light: S(0x7d8626, 0x717929, 0x858c2b), mid: S(0x696d27, 0x5c622d, 0x636929), deep: S(0x353b1a, 0x2e4027, 0x323a1e), gap: sheetTone(0x0f160f), surf: leafSurf() },
  flowers: { top: S(0x969f36, 0x879231, 0x8e9934), light: S(0x8f941e, 0x7c8524, 0x879026), mid: S(0x717e20, 0x697623, 0x768427), deep: S(0x38421a, 0x323d1b, 0x3b461d), gap: sheetTone(0x141a0e), surf: leafSurf({ flowers: 0.05 }) },
} satisfies Record<string, LeafLook>;

export type LeafLookId = keyof typeof LEAF_LOOK;

/** The six face directions: +x, −x, +y, −y, +z, −z. */
export const DIRS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
export const UP = 2;
export const DOWN = 3;

/** Face-plane coordinates of a cell for a face direction. */
const faceUV = (d: number, i: number, j: number, k: number): [number, number] => (d < 2 ? [k, j] : d < 4 ? [i, k] : [i, j]);

/**
 * The plane tiles with Greek crosses: centres are the cells with u + 2v ≡ 0
 * (mod 5), every other cell is one arm of exactly one of them.
 */
export function plusCentre(u: number, v: number): [number, number] {
  const r = (((u + 2 * v) % 5) + 5) % 5;
  return r === 0 ? [u, v] : r === 1 ? [u - 1, v] : r === 2 ? [u, v - 1] : r === 3 ? [u, v + 1] : [u + 1, v];
}

/** One plus-shaped leaf cluster on a face of a mass. */
export interface LeafPlus {
  /** Merge group (≥ 1): the cells of a cluster render as one clump. */
  id: number;
  dir: number;
  /** −1 sunk (a dark gap), 0 flush, 1 raised by a cell. */
  depth: number;
  /** Stable random 0‥1 of the cluster (tone pick). */
  t: number;
  /** Its surface cells and the cells it raises. */
  cells: [number, number, number][];
  raised: [number, number, number][];
  /** Is this cell (surface or raised) the centre of the cross? */
  isCentre: (i: number, j: number, k: number) => boolean;
}

/** Map key of a grid cell. */
export const cellKey = (i: number, j: number, k: number) => ((i + 512) * 1024 + (j + 512)) * 1024 + (k + 512);
const key = cellKey;

/** Palette entry for a 0‥1 value. */
export const pickT = (pal: readonly number[], t: number) => pal[Math.min(pal.length - 1, Math.floor(t * pal.length))];

/** A set of grid cells (the solid of a leaf mass before it is skinned). */
export class CellSet {
  private readonly m = new Map<number, [number, number, number]>();
  add(i: number, j: number, k: number): void {
    this.m.set(key(i, j, k), [i, j, k]);
  }
  has(i: number, j: number, k: number): boolean {
    return this.m.has(key(i, j, k));
  }
  delete(i: number, j: number, k: number): void {
    this.m.delete(key(i, j, k));
  }
  get size(): number {
    return this.m.size;
  }
  values(): IterableIterator<[number, number, number]> {
    return this.m.values();
  }
}

export interface LeafMassOptions {
  look: LeafLook;
  seed: number;
  /** Share of clusters sunk into gaps / raised (defaults 0.24 / 0.38); raise may differ per face direction. */
  sink?: number;
  raise?: number | ((dir: number) => number);
  /** Centre of the mass (cells), or of the part a cell belongs to: decides which way a stepped surface faces. */
  centre: [number, number, number] | ((i: number, j: number, k: number) => [number, number, number]);
  /** Colour of a flush / raised cluster cell (default: by depth and facing). */
  tone?: (p: LeafPlus, i: number, j: number, k: number) => number;
  /** Cells below this layer count as solid ground (never skinned against). */
  floor?: number;
  /** Cells taken by something else (stones, stems): solid, and never grown into. */
  blocked?: (i: number, j: number, k: number) => boolean;
}

export interface LeafMass {
  pluses: Map<string, LeafPlus>;
  /** Merge group of a cell: its cluster's id, 0 for the dark inner leaves. */
  group: Map<number, number>;
}

/**
 * Skin a solid of leaf cells like the sheet's leaf blocks: each exposed cell
 * belongs to one plus-shaped cluster of the face it looks out of (the Greek-
 * cross tiling of that face plane, shifted per face); sunk clusters leave dark
 * gaps, raised ones stand a cell proud. Inner cells are the gap colour (the
 * grid culls the hidden ones). Returns the clusters for flowers, vines…
 */
export function leafMass(g: VoxelGrid, solid: CellSet, o: LeafMassOptions): LeafMass {
  const { look, seed } = o;
  const centreOf = typeof o.centre === 'function' ? o.centre : () => o.centre as [number, number, number];
  const blocked = o.blocked ?? (() => false);
  const sink = o.sink ?? 0.24;
  const raiseOf = typeof o.raise === 'function' ? o.raise : (d: number) => (d === DOWN ? 0 : ((o.raise as number | undefined) ?? 0.38));
  const offs = DIRS.map((_, d) => [Math.floor(hash3(d, 1, 2, seed) * 5), Math.floor(hash3(d, 3, 4, seed) * 5)]);
  const pluses = new Map<string, LeafPlus>();
  const plusOf = (d: number, i: number, j: number, k: number): LeafPlus => {
    const [u, v] = faceUV(d, i, j, k);
    const [cu, cv] = plusCentre(u + offs[d][0], v + offs[d][1]);
    // Clusters on parallel faces at different depths are different clusters.
    const layer = d < 2 ? i : d < 4 ? j : k;
    const id = `${d},${cu},${cv},${layer}`;
    let p = pluses.get(id);
    if (!p) {
      const x = hash3(cu, cv, d * 131 + layer, seed);
      const depth = x < sink ? -1 : x > 1 - raiseOf(d) ? 1 : 0;
      const isCentre = (a: number, b: number, c: number) => {
        const [su, sv] = faceUV(d, a, b, c);
        return su + offs[d][0] === cu && sv + offs[d][1] === cv;
      };
      p = { id: pluses.size + 1, dir: d, depth, t: hash3(cu, cv, d * 131 + layer, seed + 7), cells: [], raised: [], isCentre };
      pluses.set(id, p);
    }
    return p;
  };
  // Raised clusters are the lit leaves, flush ones (and undersides) the shadowed leaves beneath.
  const tone =
    o.tone ??
    ((p: LeafPlus) => {
      if (p.depth > 0 && p.dir !== DOWN) return p.t < 0.7 ? pickT(look.light, p.t / 0.7) : pickT(look.mid, (p.t - 0.7) / 0.3);
      return p.t < 0.3 ? pickT(look.mid, p.t / 0.3) : pickT(look.deep, (p.t - 0.3) / 0.7);
    });
  const floor = o.floor ?? -Infinity;
  const todo: { c: [number, number, number]; p: LeafPlus | null }[] = [];
  for (const c of solid.values()) {
    const [i, j, k] = c;
    const centre = centreOf(i, j, k);
    let best = -1;
    let bestDot = -Infinity;
    for (let d = 0; d < 6; d++) {
      const [dx, dy, dz] = DIRS[d];
      if (j + dy < floor || solid.has(i + dx, j + dy, k + dz) || blocked(i + dx, j + dy, k + dz)) continue;
      // Prefer the direction that points away from the centre (tops win ties).
      const dot = dx * (i + 0.5 - centre[0]) + dy * (j + 0.5 - centre[1]) + dz * (k + 0.5 - centre[2]) + (d === UP ? 0.75 : 0);
      if (dot > bestDot) {
        bestDot = dot;
        best = d;
      }
    }
    todo.push({ c, p: best < 0 ? null : plusOf(best, i, j, k) });
  }
  const group = new Map<number, number>();
  for (const { c, p } of todo) {
    const [i, j, k] = c;
    if (!p) {
      g.set(i, j, k, look.gap, 'leaves', 1, look.surf);
      group.set(key(i, j, k), 0);
      continue;
    }
    if (p.depth < 0) continue;
    p.cells.push(c);
    g.set(i, j, k, tone(p, i, j, k), 'leaves', 1, look.surf);
    group.set(key(i, j, k), p.id);
    if (p.depth > 0) {
      const [dx, dy, dz] = DIRS[p.dir];
      const r: [number, number, number] = [i + dx, j + dy, k + dz];
      if (!solid.has(...r) && !blocked(...r)) {
        p.raised.push(r);
        g.set(r[0], r[1], r[2], tone(p, ...r), 'leaves', 1, look.surf);
        group.set(key(...r), p.id);
      }
    }
  }
  return { pluses, group };
}

/**
 * Commit a grid, then flag the sides between cells of one group as merged, so
 * each leaf cluster renders as one smooth clump (no bevel seams inside it).
 */
export function commitMerged(g: VoxelGrid, b: VoxelBuilder, group: Map<number, number>): void {
  const from = b.boxes.length;
  g.commit();
  for (let n = from; n < b.boxes.length; n++) {
    const box = b.boxes[n];
    const i = Math.round((box.x - g.origin[0]) / g.cell[0] - 0.5);
    const j = Math.round((box.y - g.origin[1]) / g.cell[1] - 0.5);
    const k = Math.round((box.z - g.origin[2]) / g.cell[2] - 0.5);
    const id = group.get(key(i, j, k));
    if (id === undefined) continue;
    let merge = 0;
    for (let d = 0; d < 6; d++) if (group.get(key(i + DIRS[d][0], j + DIRS[d][1], k + DIRS[d][2])) === id) merge |= 1 << d;
    if (merge) box.merge = merge;
  }
}

/** Soft pinks of the sheet's blossoms (no magenta). */
const PETAL = [FLOWER.pink[0], FLOWER.pink[2]];

/**
 * One blossom like the sheet's: a big cross of pink petals round a deep-pink
 * heart, lying on a surface that faces `dir` (a {@link DIRS} index); `at` is
 * the point of that surface under the heart (metres).
 */
export function blossom(p: PieceBuilder, at: readonly [number, number, number], dir: number, r: Rng): void {
  const T = TEXEL;
  const [dx, dy, dz] = DIRS[dir];
  const [cx, cy, cz] = at;
  // In-plane axes a, b and the height over the surface.
  const pos = (a: number, b: number, out: number): [number, number, number] =>
    dx !== 0 ? [cx + dx * out, cy + b, cz + a] : dy !== 0 ? [cx + a, cy + dy * out, cz + b] : [cx + a, cy + b, cz + dz * out];
  const size = (w: number, h: number, t: number): [number, number, number] => (dx !== 0 ? [t, h, w] : dy !== 0 ? [w, t, h] : [w, h, t]);
  const petal = r.pick(PETAL);
  p.voxels.box(...pos(0, 0, T), ...size(6 * T, 2 * T, 2 * T), petal, 'petal');
  p.voxels.box(...pos(0, 2 * T, T), ...size(2 * T, 2 * T, 2 * T), petal, 'petal');
  p.voxels.box(...pos(0, -2 * T, T), ...size(2 * T, 2 * T, 2 * T), petal, 'petal');
  p.voxels.box(...pos(0, 0, 2.5 * T), ...size(T * 1.5, T * 1.5, T), r.pick(FLOWER.deep), 'petal');
}

/**
 * Blossoms like the sheet's: big crosses of pink petals round a deep-pink
 * heart, centred on leaf clusters (whole ones only, unless `whole` is false),
 * never touching. `quota` caps them per face direction (e.g. four on top, two
 * down the front).
 */
export function blossoms(p: PieceBuilder, g: VoxelGrid, pluses: Map<string, LeafPlus>, r: Rng, quota: Partial<Record<number, number>>, whole = true): void {
  const left = { ...quota };
  const placed: [number, number, number][] = [];
  const list = [...pluses.values()].sort((a, b) => a.t - b.t);
  for (const q of list) {
    if (!left[q.dir] || q.depth < 0) continue;
    const cells = q.depth > 0 ? q.raised : q.cells;
    const c = cells.find(([i, j, k]) => q.isCentre(i, j, k));
    if (!c || (whole && cells.length !== 5)) continue;
    if (placed.some(([i, j, k]) => Math.abs(i - c[0]) + Math.abs(j - c[1]) + Math.abs(k - c[2]) < 4)) continue;
    left[q.dir]!--;
    placed.push(c);
    const [dx, dy, dz] = DIRS[q.dir];
    const [cx, cy, cz] = g.center(...c);
    const h = g.cell[0] / 2;
    blossom(p, [cx + dx * h, cy + dy * h, cz + dz * h], q.dir, r);
  }
}
