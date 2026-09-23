import { traceSource, type SourceTrace } from '../../../feedback/sourceTrace';
import type { VoxelMaterialKey } from '../../../voxel/materials';
import { hash3, valueNoise3 } from '../../../voxel/random';
import type { Surf, VoxelBuilder } from '../../../voxel/VoxelBuilder';
import { TILE, TILE_DEPTH } from '../../lib/ground';
import { TEXEL } from '../../shapes';

/**
 * Shared kit of the §18.2 ground tiles (1 m × 1 m, walkable top at y = 0, 0.5 m
 * of ground below, so tiles sit side by side on one level).
 *
 * The sheet paints every tile texel by texel with strong contrast — pale clods
 * next to dark crumbs, yellow moss beside dark moss — far more than the ±20 %
 * speckle a material pattern adds to one block. So the visible skin of a tile is
 * laid as texel cells with their own colours ({@link Texels}), drawn as thin
 * painted plates on their exposed faces: no bevel grooves between texels, so a
 * face reads as one painted block, and only raised detail (sprouts, cushions,
 * rosettes, pebbles) shows its little cubes.
 */

/** Texels along a tile side (16) and down its body (8). */
export const N = Math.round(TILE / TEXEL);
export const DEPTH = Math.round(TILE_DEPTH / TEXEL);

/**
 * How the studio renders a flat tile face of grey albedo, measured on a grey-ramp
 * tile (sRGB 0–255, median per patch): rows of [albedo, r, g, b]. The top takes
 * the key light almost head-on (≈ 1:1, a little warm, darks deeper); the front
 * face (+z) about 0.85× with deeper darks.
 */
const TOP_RESPONSE = [
  [0, 0, 0, 0],
  [24, 20, 15, 10],
  [41, 32, 27, 23],
  [57, 47, 43, 38],
  [74, 69, 64, 61],
  [90, 88, 84, 80],
  [107, 108, 103, 99],
  [123, 125, 120, 115],
  [140, 145, 139, 134],
  [156, 162, 156, 151],
  [173, 181, 175, 169],
  [189, 199, 192, 186],
  [206, 212, 205, 199],
  [222, 227, 219, 213],
  [239, 240, 232, 226],
  [255, 245, 237, 230],
] as const;
const FRONT_RESPONSE = [
  [0, 0, 0, 0],
  [8, 6, 4, 3],
  [41, 18, 15, 14],
  [74, 44, 42, 41],
  [107, 82, 80, 79],
  [140, 114, 111, 110],
  [173, 146, 143, 143],
  [206, 177, 174, 173],
  [239, 206, 202, 201],
  [255, 215, 211, 210],
] as const;

/** The albedo channel that renders as `v` (0–255) under a measured response. */
function invert(table: readonly (readonly number[])[], ch: number, v: number): number {
  for (let n = 1; n < table.length; n++) {
    const [a0, a1, r0, r1] = [table[n - 1][0], table[n][0], table[n - 1][ch + 1], table[n][ch + 1]];
    if (v <= r1) return a0 + ((a1 - a0) * (v - r0)) / Math.max(1e-6, r1 - r0);
  }
  return 255;
}
function albedo(table: readonly (readonly number[])[], hex: number): number {
  const c = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v, ch) => Math.round(Math.min(255, Math.max(0, invert(table, ch, v)))));
  return (c[0] << 16) | (c[1] << 8) | c[2];
}
/**
 * Albedo for a colour picked off a top face of the sheet, so the studio renders
 * the tile's top like the sheet (the kit's `fromSheet` averages top and front
 * faces; the tiles' look lives on the top, so they invert each face instead).
 */
export const onTop = (hex: number) => albedo(TOP_RESPONSE, hex);
/** Albedo for a colour picked off a lit side (front) face of the sheet. */
export const onSide = (hex: number) => albedo(FRONT_RESPONSE, hex);

/** Mix two sRGB colours (t = 0 → a, 1 → b). */
export function mix(a: number, b: number, t: number): number {
  const c = [16, 8, 0].map((s) => Math.round(Math.min(255, Math.max(0, ((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t))));
  return (c[0] << 16) | (c[1] << 8) | c[2];
}

/** Scale an sRGB colour's brightness. */
export function scale(hex: number, k: number): number {
  const c = [16, 8, 0].map((s) => Math.round(Math.min(255, ((hex >> s) & 255) * k)));
  return (c[0] << 16) | (c[1] << 8) | c[2];
}

/** The top texel column along each tile edge: [i, k] of every edge texel, each side once. */
export function edgeColumns(): [number, number][] {
  const out: [number, number][] = [];
  for (let a = 0; a < N; a++) out.push([a, N - 1], [N - 1, a], [a, 0], [0, a]);
  return out;
}

export interface TexelStyle {
  /** Material family (default: the canvas's). */
  mat?: VoxelMaterialKey;
  surf?: Surf;
  shade?: number;
  /**
   * 0 (default) = the tile's skin, drawn as flat painted plates; any other group
   * (from {@link Texels.loose}) is raised detail drawn as little cubes, and cells
   * of one group merge where their colours match.
   */
  group?: number;
  /** Bake exposure shading (raised lumps: lit tops and edges, dark crevices). */
  ao?: boolean;
  /**
   * Paint the cell's top with this colour (a thin plate on it): a raised mass
   * can then share one body colour, so its cubes merge into one soft lump,
   * while its top keeps texel-by-texel colour (and the exposure shading).
   */
  cap?: number;
  /** Skin only: colour of the cell's vertical faces, when they differ from its top (a lit rim over shaded sides). */
  side?: number;
}

interface Cell {
  i: number;
  j: number;
  k: number;
  color: number;
  mat: VoxelMaterialKey;
  surf?: Surf;
  shade: number;
  group: number;
  ao: boolean;
  cap?: number;
  side?: number;
  ghost: boolean;
  src?: SourceTrace;
}

type Vec3 = [number, number, number];
const BIAS = 512;
const SPAN = 1024;
const key = (i: number, j: number, k: number) => ((i + BIAS) * SPAN + (j + BIAS)) * SPAN + (k + BIAS);
const sameSurf = (a?: Surf, b?: Surf) => a === b || (!!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]);
/** Face directions in `open` bit order (+x, −x, +y, −y, +z, −z). */
const FACES: Vec3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
/**
 * Thickness of a skin plate: thin enough that its bevel (5–10 % of it) leaves no
 * visible groove between neighbouring plates.
 */
const PLATE = 0.001;
/** Neighbouring plates overlap by this much, so their bevels leave no crack between them. */
const OVERLAP = 0.0003;

/**
 * Keep a plate's overlap inside the tile (and, for the ground's own skin,
 * between its bottom and the walkable top), so neighbouring tiles' plates
 * never overlap and the top stays at y = 0.
 */
function clampToTile(lo: Vec3, hi: Vec3, ground = false): void {
  for (const a of [0, 2]) {
    lo[a] = Math.max(lo[a], -TILE / 2);
    hi[a] = Math.min(hi[a], TILE / 2);
  }
  if (!ground) return;
  lo[1] = Math.max(lo[1], -TILE_DEPTH);
  hi[1] = Math.min(hi[1], 0);
}

/**
 * Texel cells in tile space: cell (i, j, k) spans x from −0.5 + i/16, y from j/16
 * (so j = −1 is the top layer of the ground, j = 0 stands on it), z from −0.5 + k/16.
 */
export class Texels {
  private readonly cells = new Map<number, Cell>();
  private groups = 1;

  constructor(
    readonly mat: VoxelMaterialKey,
    readonly o: { ao?: number } = {},
  ) {}

  set(i: number, j: number, k: number, color: number, s: TexelStyle = {}): this {
    this.cells.set(key(i, j, k), {
      i,
      j,
      k,
      color,
      mat: s.mat ?? this.mat,
      surf: s.surf,
      shade: s.shade ?? 1,
      group: s.group ?? 0,
      ao: s.ao ?? false,
      cap: s.cap,
      side: s.side,
      ghost: false,
      src: traceSource(),
    });
    return this;
  }

  /** Occupied but drawn by something else (the inside of the body, a slab box). */
  ghost(i: number, j: number, k: number): this {
    if (!this.cells.has(key(i, j, k)))
      this.cells.set(key(i, j, k), {
        i,
        j,
        k,
        color: 0,
        mat: this.mat,
        shade: 1,
        group: -1,
        ao: false,
        ghost: true,
      });
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

  /** A group of its own for raised detail (its cubes stay visible). */
  loose(): number {
    return this.groups++;
  }

  private shadeOf(c: Cell): number {
    const ao = this.o.ao ?? 0.3;
    if (!c.ao || ao <= 0) return c.shade;
    // Same exposure measure as VoxelGrid: flat walls 1.0, convex lumps brighter, crevices darker.
    let open = 0;
    let total = 0;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const n = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
          if (n === 0) continue;
          const w = n === 1 ? 1 : n === 2 ? 0.6 : 0.35;
          total += w;
          if (!this.has(c.i + dx, c.j + dy, c.k + dz)) open += w;
        }
    let shade = c.shade * (1 + ao * Math.max(-0.7, Math.min(0.45, (open / total - 0.305) * 2)));
    if (this.has(c.i, c.j + 1, c.k) && !this.has(c.i, c.j, c.k + 1) && this.has(c.i, c.j + 1, c.k + 1)) shade *= 1 - ao * 0.35;
    return shade;
  }

  /** Emit the visible cells (tile space, metres); returns the number of boxes. */
  emit(b: VoxelBuilder): number {
    const list = [...this.cells.values()].filter((c) => !c.ghost);
    list.sort((a, b) => a.j - b.j || a.k - b.k || a.i - b.i);
    const x0 = -TILE / 2;
    const z0 = -TILE / 2;
    const T = TEXEL;
    let count = 0;
    const alike = (a: Cell, c: Cell) => a.color === c.color && a.side === c.side && a.mat === c.mat && a.shade === c.shade && sameSurf(a.surf, c.surf);

    // Skin: one plate per exposed face, runs of equal plates joined (along x,
    // or along z on the ±x faces). Plates stay inside their cell, so plates of
    // different cells never overlap.
    const done = new Set<string>();
    // Raised detail doesn't count as cover: its bevels leave notches at the
    // bottom that would look into the hollow tile.
    const exposed = (c: Cell, f: number) => {
      const n = this.cells.get(key(c.i + FACES[f][0], c.j + FACES[f][1], c.k + FACES[f][2]));
      return !n || (!n.ghost && n.group !== 0);
    };
    for (const c of list) {
      if (c.group !== 0) continue;
      for (let f = 0; f < 6; f++) {
        if (!exposed(c, f) || done.has(`${c.i},${c.j},${c.k},${f}`)) continue;
        const along: Vec3 = f < 2 ? [0, 0, 1] : [1, 0, 0];
        let n = 1;
        for (;;) {
          const m = this.cells.get(key(c.i + along[0] * n, c.j, c.k + along[2] * n));
          if (!m || m.ghost || m.group !== 0 || !alike(m, c) || !exposed(m, f)) break;
          done.add(`${m.i},${m.j},${m.k},${f}`);
          n++;
        }
        const [fx, fy, fz] = FACES[f];
        const lo: Vec3 = [x0 + c.i * T, c.j * T, z0 + c.k * T];
        const hi: Vec3 = [lo[0] + (along[0] ? n : 1) * T, lo[1] + T, lo[2] + (along[2] ? n : 1) * T];
        // Squash the cell to a plate against its face, a hair wider in its plane.
        for (let a = 0; a < 3; a++) {
          const d = [fx, fy, fz][a];
          if (d > 0) lo[a] = hi[a] - PLATE;
          else if (d < 0) hi[a] = lo[a] + PLATE;
          else {
            lo[a] -= OVERLAP;
            hi[a] += OVERLAP;
          }
        }
        clampToTile(lo, hi, c.j < 0);
        b.span(lo[0], lo[1], lo[2], hi[0], hi[1], hi[2], fy === 0 ? (c.side ?? c.color) : c.color, c.mat, {
          shade: c.shade,
          open: 1 << f,
          surf: c.surf,
          src: c.src,
        });
        count++;
      }
    }

    // Raised detail: little cubes, x-runs of equal cells joined; cells of one
    // group merge where they match (a cushion stays one lump of moss).
    // (A capped cell's exposure shading goes on its cap, so its body can merge.)
    const shades = new Map<Cell, number>();
    for (const c of list) if (c.group !== 0) shades.set(c, c.cap === undefined ? this.shadeOf(c) : c.shade);
    const status = (c: Cell, i: number, j: number, k: number) => {
      const n = this.cells.get(key(i, j, k));
      if (!n) return 0;
      return !n.ghost && n.group === c.group && alike(n, c) && shades.get(n) === shades.get(c) ? 2 : 1;
    };
    const sig = (c: Cell) => status(c, c.i, c.j + 1, c.k) | (status(c, c.i, c.j - 1, c.k) << 2) | (status(c, c.i, c.j, c.k + 1) << 4) | (status(c, c.i, c.j, c.k - 1) << 6);
    const used = new Set<Cell>();
    for (const c of list) {
      if (c.group === 0 || used.has(c)) continue;
      const s = sig(c);
      const shade = shades.get(c)!;
      let i1 = c.i + 1;
      for (;;) {
        const n = this.cells.get(key(i1, c.j, c.k));
        if (!n || n.ghost || n.group !== c.group || !alike(n, c) || shades.get(n) !== shade || sig(n) !== s) break;
        used.add(n);
        i1++;
      }
      const st = [status(c, i1, c.j, c.k), status(c, c.i - 1, c.j, c.k), s & 3, (s >> 2) & 3, (s >> 4) & 3, (s >> 6) & 3];
      let open = 0;
      let merge = 0;
      st.forEach((v, bit) => {
        if (v === 0) open |= 1 << bit;
        if (v === 2) merge |= 1 << bit;
      });
      if (open === 0) continue; // buried
      b.span(x0 + c.i * T, c.j * T, z0 + c.k * T, x0 + i1 * T, (c.j + 1) * T, z0 + (c.k + 1) * T, c.color, c.mat, { shade, open, merge, surf: c.surf, src: c.src });
      count++;
    }
    // Caps: a painted plate on every capped top that nothing stands on.
    for (const c of list) {
      if (c.group === 0 || c.cap === undefined || this.has(c.i, c.j + 1, c.k)) continue;
      const y = (c.j + 1) * T;
      const lo: Vec3 = [x0 + c.i * T - OVERLAP, y, z0 + c.k * T - OVERLAP];
      const hi: Vec3 = [x0 + (c.i + 1) * T + OVERLAP, y + PLATE, z0 + (c.k + 1) * T + OVERLAP];
      clampToTile(lo, hi);
      b.span(lo[0], lo[1], lo[2], hi[0], hi[1], hi[2], c.cap, c.mat, {
        shade: this.shadeOf(c),
        open: 4,
        surf: c.surf,
        src: c.src,
      });
      count++;
    }
    return count;
  }
}

/**
 * Tones by rank: every cell gets a value (noise + hash), and the values are cut
 * at the quantiles of `weights`, so a surface shows each palette tone in the
 * share the sheet does (palette dark → light, weights in the same order).
 */
export function toneRanker(values: number[], weights: readonly number[]): (v: number) => number {
  const sorted = [...values].sort((a, b) => a - b);
  const total = weights.reduce((s, w) => s + w, 0);
  const cuts: number[] = [];
  let acc = 0;
  for (const w of weights) {
    acc += w / total;
    cuts.push(sorted[Math.min(sorted.length - 1, Math.floor(acc * sorted.length))]);
  }
  return (v) => {
    for (let t = 0; t < cuts.length; t++) if (v < cuts[t]) return t;
    return cuts.length - 1;
  };
}

/** Clustered texel value: soft blotches a few texels wide plus per-texel noise, like the sheet's pixel texture. */
export function texelValue(i: number, j: number, k: number, seed: number, blotch = 0.42, mix = 0.6): number {
  return valueNoise3(i * blotch, j * blotch, k * blotch, seed) * mix + hash3(i, j, k, seed + 7) * (1 - mix);
}

/**
 * The visible skin of the tile body (top layer and four sides; the bottom is
 * never seen). Also ghosts the cells just inside it and under its rim, so only
 * outward faces get painted.
 */
export function skinCells(t: Texels, depth = DEPTH): Vec3[] {
  const out: Vec3[] = [];
  for (let j = -depth - 1; j < 0; j++)
    for (let i = -1; i <= N; i++)
      for (let k = -1; k <= N; k++) {
        const inside = i >= 0 && k >= 0 && i < N && k < N;
        const rim = i === 0 || k === 0 || i === N - 1 || k === N - 1;
        if (!inside) continue;
        if (j === -depth - 1) t.ghost(i, j, k);
        else if (j === -1 || rim) out.push([i, j, k]);
        else if (j === -2 || i === 1 || k === 1 || i === N - 2 || k === N - 2) t.ghost(i, j, k);
      }
  return out;
}
