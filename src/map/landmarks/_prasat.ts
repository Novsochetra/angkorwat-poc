import { traceSource, type SourceTrace } from '../../feedback/sourceTrace';
import type { VoxelMaterialKey } from '../../voxel/materials';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder, VoxelGrid } from '../../voxel/VoxelBuilder';

/**
 * Shared masonry for the River Gate, Ta Prohm and Phnom Kulen:
 * sandstone palettes, a voxel grid addressed in metres ({@link Mason}), and
 * Khmer shapes built on it — redented (cross-plan) blocks, lotus-bud towers
 * (prasat), gate pavilions (gopura), naga balustrades, stupas and garden
 * trees. Lamps, pools and turned frames are in `_prasatKit.ts`.
 *
 * Everything is built in a local frame on a 1 m (massing) or 0.5 m (detail)
 * grid, so blocks stay aligned even when the whole piece is turned to follow
 * a road (see `Frame` in `_prasatKit.ts`).
 */

export type Tones = readonly number[];
/** One colour, or a list of close tones picked per cell. */
export type Paint = number | Tones;

// ── Palettes (sRGB) ─────────────────────────────────────────────────────────
// Grey-tan temple sandstone, a touch cooler and paler than the ochre cliffs,
// so the buildings read as built stone against the land.
export const STONE: Tones = [0xb8a283, 0xad9778, 0xc2ad8d, 0xa58e70];
/** Cornices, finials, sunlit trim. */
export const STONE_LIGHT: Tones = [0xcfba98, 0xc6b08d, 0xd8c4a2];
/** Old, stained stone (lower courses, recesses). */
export const STONE_DARK: Tones = [0x857058, 0x7a664f, 0x8f7a61];
/** Red laterite of foundations and platforms. */
export const LATERITE: Tones = [0x9c6d50, 0x916349, 0xa67858, 0x8a5e46];
/** Door openings and windows (deep shadow). */
export const SHADOW: Tones = [0x2f261f, 0x3a2f26, 0x342a22];
/** Moss and lichen on the tops of old stone. */
export const MOSS: Tones = [0x5e7d33, 0x6b8a3a, 0x52702c, 0x769440];
/** Garden grass (the terrain's grass tops). */
export const GRASS: Tones = [0x72a03a, 0x669432, 0x80aa40, 0x5e8a2f, 0x8bb047];
export const LEAF: Tones = [0x3f6e2a, 0x4a7a2e, 0x57883a, 0x355f25];
export const BARK: Tones = [0x6b4d36, 0x5f4431, 0x76553b];
export const FLOWER_PINK: Tones = [0xe7799c, 0xd9668b, 0xf294b4, 0xf0a8c0];
export const FLOWER_ORANGE: Tones = [0xf0993a, 0xe6822c, 0xf6b050];

/** The stone of one temple: walls, trim, stained courses, footings. */
export interface Palette {
  stone: Tones;
  light: Tones;
  dark: Tones;
  base: Tones;
}
export const SANDSTONE: Palette = { stone: STONE, light: STONE_LIGHT, dark: STONE_DARK, base: LATERITE };

export const pick = (list: Tones, r: number): number => list[Math.min(list.length - 1, Math.floor(r * list.length))];

export interface FillOpts {
  mat?: VoxelMaterialKey;
  shade?: number;
  seed?: number;
  src?: SourceTrace;
  /** Keep only the cells whose centre (m, builder space) passes. */
  keep?: (x: number, y: number, z: number) => boolean;
}

/**
 * A voxel grid in metres: `fill` takes a box by its corners (m) and fills the
 * cells whose centres are inside. Corners should sit on the grid (multiples
 * of the cell size). Colours come from a tone list, picked per cell with a
 * seeded hash, so every build is the same.
 */
export class Mason {
  readonly grid: VoxelGrid;

  constructor(
    readonly builder: VoxelBuilder,
    readonly cell: number,
    opts: { seed?: number; jitter?: number; ao?: number; mat?: VoxelMaterialKey } = {},
  ) {
    this.grid = builder.grid({ cell, origin: [0, 0, 0], mat: opts.mat ?? 'mapStone', jitter: opts.jitter ?? 0.04, ao: opts.ao ?? 0.32, seed: opts.seed ?? 1 });
  }

  private range(a: number, b: number): [number, number] {
    return [Math.round(Math.min(a, b) / this.cell), Math.round(Math.max(a, b) / this.cell)];
  }

  /** Fill the box [x0, x1) × [y0, y1) × [z0, z1) (m). */
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, paint: Paint, o: FillOpts = {}): this {
    const c = this.cell;
    const [i0, i1] = this.range(x0, x1);
    const [j0, j1] = this.range(y0, y1);
    const [k0, k1] = this.range(z0, z1);
    const seed = o.seed ?? 11;
    for (let i = i0; i < i1; i++)
      for (let j = j0; j < j1; j++)
        for (let k = k0; k < k1; k++) {
          if (o.keep && !o.keep((i + 0.5) * c, (j + 0.5) * c, (k + 0.5) * c)) continue;
          const color = typeof paint === 'number' ? paint : pick(paint, hash3(i, j, k, seed));
          this.grid.put(i, j, k, { color, mat: o.mat, shade: o.shade, src: o.src });
        }
    return this;
  }

  /** Empty the box (openings, passages). */
  clear(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): this {
    const [i0, i1] = this.range(x0, x1);
    const [j0, j1] = this.range(y0, y1);
    const [k0, k1] = this.range(z0, z1);
    for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) for (let k = k0; k < k1; k++) this.grid.delete(i, j, k);
    return this;
  }

  /** Recolour the filled cells in the box (windows, bands). */
  paint(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, paint: Paint, o: FillOpts = {}): this {
    const c = this.cell;
    const [i0, i1] = this.range(x0, x1);
    const [j0, j1] = this.range(y0, y1);
    const [k0, k1] = this.range(z0, z1);
    const seed = o.seed ?? 13;
    for (let i = i0; i < i1; i++)
      for (let j = j0; j < j1; j++)
        for (let k = k0; k < k1; k++) {
          const cell = this.grid.get(i, j, k);
          if (!cell || (o.keep && !o.keep((i + 0.5) * c, (j + 0.5) * c, (k + 0.5) * c))) continue;
          cell.color = typeof paint === 'number' ? paint : pick(paint, hash3(i, j, k, seed));
          if (o.mat) cell.mat = o.mat;
          if (o.shade !== undefined) cell.shade = o.shade;
        }
    return this;
  }

  /** Is the cell holding this point (m) filled? */
  has(x: number, y: number, z: number): boolean {
    const c = this.cell;
    return this.grid.has(Math.floor(x / c), Math.floor(y / c), Math.floor(z / c));
  }

  /**
   * Age the stone: moss on a share of the cells open to the sky, and a darker
   * stain on the lowest course. Call before `commit`.
   */
  weather(moss: number, seed = 5, mossTones: Tones = MOSS): this {
    const g = this.grid;
    g.forEach((i, j, k, cell) => {
      if (cell.mat !== 'mapStone' || g.has(i, j + 1, k)) return;
      if (hash3(i, j, k, seed) < moss) cell.color = pick(mossTones, hash3(i, k, j, seed + 1));
    });
    return this;
  }

  /** Patches of moss and stain on the walls: a share of the cells open to the side. */
  mottle(share: number, tones: Tones, seed = 9): this {
    const g = this.grid;
    g.forEach((i, j, k, cell) => {
      if (cell.mat !== 'mapStone') return;
      if (g.has(i + 1, j, k) && g.has(i - 1, j, k) && g.has(i, j, k + 1) && g.has(i, j, k - 1)) return;
      // Patches, not salt and pepper: a coarse hash picks the patch, a fine one thins it.
      if (hash3(i >> 1, j >> 1, k >> 1, seed) < share && hash3(i, j, k, seed + 1) < 0.7) cell.color = pick(tones, hash3(i, k, j, seed + 2));
    });
    return this;
  }

  commit(): VoxelBuilder {
    return this.grid.commit();
  }
}

/** Snap a length to the grid (at least one cell). */
export const snapTo = (v: number, cell: number): number => Math.max(cell, Math.round(v / cell) * cell);

/**
 * Keep-test of a redented square (the Khmer cross plan): the box of half
 * sizes `hx` × `hz` round (cx, cz) with its corners cut in two steps of `n`.
 */
export function redentKeep(cx: number, cz: number, hx: number, hz: number, n: number): (x: number, y: number, z: number) => boolean {
  return (x, _y, z) => {
    const a = Math.abs(x - cx);
    const b = Math.abs(z - cz);
    if (hx - 2 * n < n || hz - 2 * n < n) return !(a > hx - n && b > hz - n);
    return !(a > hx - 2 * n && b > hz - 2 * n && (a > hx - n || b > hz - n));
  };
}

/** A redented block from y0 to y1. */
export function redent(m: Mason, cx: number, cz: number, y0: number, y1: number, hx: number, hz: number, paint: Paint, o: FillOpts = {}): void {
  const n = m.cell;
  const r = redentKeep(cx, cz, hx, hz, n);
  const keep = o.keep;
  m.fill(cx - hx, y0, cz - hz, cx + hx, y1, cz + hz, paint, { ...o, keep: keep ? (x, y, z) => r(x, y, z) && keep(x, y, z) : r });
}

/** Sides of a building (bit mask): +x 1, −x 2, +z 4, −z 8. */
export const SIDE = { px: 1, nx: 2, pz: 4, nz: 8, all: 15 } as const;

export interface PrasatOpts {
  /** Total height from `y0` to the tip (m). */
  h: number;
  /** Width of the sanctuary body (m, a multiple of 2 cells). */
  w: number;
  /** Tiers of the tower above the body. */
  tiers?: number;
  /** Sides with a porch and a door (see {@link SIDE}). */
  doors?: number;
  /** Share of the height that is the body (the rest is the tower). */
  body?: number;
  /** Finer grid for the tiers (a smoother bud, thinner cornices). */
  fine?: Mason;
  pal?: Palette;
  src?: SourceTrace;
}

/**
 * Lotus-bud tower (prasat) on `m` (1 m or 0.5 m cells): a redented sanctuary
 * body with porches and dark doors, a cornice, then tiers that curve in like
 * a lotus bud (each with its own cornice and a niche on every face), and a
 * finial. Returns the door lintel height and the tip, for lamps.
 */
export function prasat(m: Mason, cx: number, cz: number, y0: number, o: PrasatOpts): { lintel: number; top: number } {
  const c = m.cell;
  const src = o.src ?? traceSource();
  const P = o.pal ?? SANDSTONE;
  const hw = o.w / 2;
  const bodyH = snapTo(o.h * (o.body ?? 0.3), c);
  const doors = o.doors ?? SIDE.all;
  // Body.
  redent(m, cx, cz, y0, y0 + bodyH, hw, hw, P.stone, { src });
  m.paint(cx - hw, y0, cz - hw, cx + hw, y0 + c, cz + hw, P.dark, { src });
  // Porches with doors.
  const pw = snapTo(o.w * 0.26, c);
  const pd = snapTo(Math.max(c, o.w * 0.12), c);
  const ph = snapTo(bodyH * 0.82, c);
  const dw = Math.max(c, snapTo(o.w * 0.12, c));
  const dh = snapTo(bodyH * 0.55, c);
  const lintel = y0 + dh;
  const dirs: [number, number, number][] = [
    [SIDE.px, 1, 0],
    [SIDE.nx, -1, 0],
    [SIDE.pz, 0, 1],
    [SIDE.nz, 0, -1],
  ];
  for (const [bit, dx, dz] of dirs) {
    if (!(doors & bit)) continue;
    const a = hw + pd;
    if (dx) {
      const x0 = dx > 0 ? cx + hw : cx - a;
      m.fill(x0, y0, cz - pw, x0 + pd, y0 + ph, cz + pw, P.stone, { src });
      // Pediment: two steps over the porch.
      m.fill(x0, y0 + ph, cz - pw + c, x0 + pd, y0 + ph + c, cz + pw - c, P.light, { src });
      const xf = dx > 0 ? cx + a - c : cx - a;
      m.clear(xf, y0, cz - dw, xf + c, y0 + dh, cz + dw);
      m.paint(xf - dx * c, y0, cz - dw, xf - dx * c + c, y0 + dh, cz + dw, SHADOW, { src });
    } else {
      const z0 = dz > 0 ? cz + hw : cz - a;
      m.fill(cx - pw, y0, z0, cx + pw, y0 + ph, z0 + pd, P.stone, { src });
      m.fill(cx - pw + c, y0 + ph, z0, cx + pw - c, y0 + ph + c, z0 + pd, P.light, { src });
      const zf = dz > 0 ? cz + a - c : cz - a;
      m.clear(cx - dw, y0, zf, cx + dw, y0 + dh, zf + c);
      m.paint(cx - dw, y0, zf - dz * c, cx + dw, y0 + dh, zf - dz * c + c, SHADOW, { src });
    }
  }
  // Cornice.
  let y = y0 + bodyH;
  redent(m, cx, cz, y, y + c, hw + c, hw + c, P.light, { src });
  y += c;
  // Tiers, curving in like a bud.
  const t = o.fine ?? m;
  const tc = t.cell;
  const tiers = o.tiers ?? 5;
  const finialH = snapTo(o.h * 0.08, tc);
  const tierH = Math.max(3 * tc, snapTo((o.h - bodyH - c - finialH) / tiers, tc));
  for (let n = 0; n < tiers; n++) {
    const u = (n + 0.5) / tiers;
    const half = Math.max(tc, snapTo(hw * 0.94 * Math.pow(1 - Math.pow(u, 2.2), 0.5), tc));
    redent(t, cx, cz, y, y + tierH - tc, half, half, P.stone, { src });
    redent(t, cx, cz, y + tierH - tc, y + tierH, half + tc, half + tc, P.light, { src });
    // A dark niche in the middle of every face.
    if (half >= 2 * c && tierH >= 3 * tc) {
      const ny0 = y + tc;
      const ny1 = y + tierH - tc;
      const nw = Math.max(tc, snapTo(half * 0.18, tc));
      t.paint(cx - nw, ny0, cz + half - tc, cx + nw, ny1, cz + half, SHADOW, { src });
      t.paint(cx - nw, ny0, cz - half, cx + nw, ny1, cz - half + tc, SHADOW, { src });
      t.paint(cx + half - tc, ny0, cz - nw, cx + half, ny1, cz + nw, SHADOW, { src });
      t.paint(cx - half, ny0, cz - nw, cx - half + tc, ny1, cz + nw, SHADOW, { src });
    }
    y += tierH;
  }
  // Finial: a bud and its spike.
  const fh = Math.max(tc, finialH);
  const fw = Math.max(tc / 2, snapTo(hw * 0.2, tc));
  t.fill(cx - fw, y, cz - fw, cx + fw, y + fh, cz + fw, P.light, { src });
  y += fh;
  const sw = Math.max(tc / 2, snapTo(fw / 2, tc / 2));
  t.fill(cx - sw, y, cz - sw, cx + sw, y + fh, cz + sw, P.light, { src });
  y += fh;
  return { lintel, top: y };
}

/**
 * Stepped top of a gate or shrine on `d` (fine cells): tiers of the given
 * half widths, each with a cornice, then a bud and a spike.
 */
export function tieredTop(d: Mason, cx: number, cz: number, y0: number, halves: number[], tierH: number, src?: SourceTrace, P: Palette = SANDSTONE): number {
  const c = d.cell;
  let y = y0;
  for (const half of halves) {
    redent(d, cx, cz, y, y + tierH - c, half, half, P.stone, { src });
    // A light band (no overhang: the tiers recede in a smooth bud) and small
    // antefixes in the corners of the redents.
    redent(d, cx, cz, y + tierH - c, y + tierH, half, half, P.light, { src });
    if (half >= 1.5) {
      const a = half - 1.5 * c;
      for (const [sx, sz] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ])
        d.fill(cx + sx * a - c / 2, y + tierH, cz + sz * a - c / 2, cx + sx * a + c / 2, y + tierH + c, cz + sz * a + c / 2, P.light, { src });
      d.paint(cx - c / 2, y + c, cz + half - c, cx + c / 2, y + tierH - c, cz + half, SHADOW, { src });
      d.paint(cx - c / 2, y + c, cz - half, cx + c / 2, y + tierH - c, cz - half + c, SHADOW, { src });
      d.paint(cx + half - c, y + c, cz - c / 2, cx + half, y + tierH - c, cz + c / 2, SHADOW, { src });
      d.paint(cx - half, y + c, cz - c / 2, cx - half + c, y + tierH - c, cz + c / 2, SHADOW, { src });
    }
    y += tierH;
  }
  d.fill(cx - c, y, cz - c, cx + c, y + 2 * c, cz + c, P.light, { src });
  d.fill(cx - c / 2, y + 2 * c, cz - c / 2, cx + c / 2, y + 4 * c, cz + c / 2, P.light, { src });
  return y + 4 * c;
}

/** A small stupa on fine cells: plinth, drum, bell, box and spire. Height ≈ `h`. */
export function stupa(d: Mason, cx: number, cz: number, y0: number, h: number, src?: SourceTrace, P: Palette = SANDSTONE): void {
  const c = d.cell;
  const s = (v: number) => snapTo(v, c);
  const w = s(h * 0.32);
  let y = y0;
  const layer = (half: number, hh: number, paint: Paint) => {
    redent(d, cx, cz, y, y + hh, half, half, paint, { src });
    y += hh;
  };
  layer(w, s(h * 0.12), P.base);
  layer(w - c, s(h * 0.1), P.stone);
  layer(Math.max(c, w - c), s(h * 0.22), P.light);
  layer(Math.max(c, w - 2 * c), s(h * 0.08), P.stone);
  layer(Math.max(c / 2, s(w * 0.45)), s(h * 0.1), P.stone);
  d.fill(cx - c / 2, y, cz - c / 2, cx + c / 2, y + s(h * 0.28), cz + c / 2, P.light, { src });
}

export interface GopuraOpts {
  /** Road height under the passage (m). */
  g: number;
  /** Wing lengths beyond the body on the −z and +z sides (m, 0 = none). */
  wings: [number, number];
  /** Depth of foundation under each side where the ground falls away (m). */
  footing?: (x: number, z: number) => number;
  src?: SourceTrace;
}

/**
 * Gate pavilion (gopura) in its own frame: the road runs along x through a
 * 6 m passage at z = −3‥3. A body 6 m deep and 10 m across, porches with
 * stepped pediments, a tiered tower over the passage, and low wings with
 * windows ending in small pavilions. `m` has 1 m cells, `d` 0.5 m cells.
 * Returns lamp spots (local m) by the passage mouths.
 */
export function gopura(m: Mason, d: Mason, o: GopuraOpts): [number, number, number][] {
  const src = o.src ?? traceSource();
  const g = o.g;
  const passage = (_x: number, y: number, z: number) => Math.abs(z) > 3 || y > g + 5;
  // Plinth, and a footing down to the ground where it falls away.
  m.fill(-4, g, -6, 4, g + 1, 6, LATERITE, { src, keep: (_x, _y, z) => Math.abs(z) > 3 });
  const zn = o.wings[0] >= 2 ? -5 - o.wings[0] : -6;
  const zp = o.wings[1] >= 2 ? 5 + o.wings[1] : 6;
  if (o.footing)
    for (let x = -4; x < 4; x++)
      for (let z = zn; z < zp; z++) {
        if (Math.abs(z + 0.5) < 3 || (Math.abs(z + 0.5) > 6 && Math.abs(x + 0.5) > 3)) continue;
        const f = Math.ceil(o.footing(x + 0.5, z + 0.5));
        if (f > 0) m.fill(x, g - f, z, x + 1, g, z + 1, LATERITE, { src });
      }
  // Body with the passage through it, and the porches.
  m.fill(-3, g + 1, -5, 3, g + 6, 5, STONE, { src, keep: passage });
  m.fill(-3, g, -5, 3, g + 1, 5, STONE_DARK, { src, keep: passage });
  for (const sx of [1, -1]) {
    const x0 = sx > 0 ? 3 : -4;
    m.fill(x0, g, -4, x0 + 1, g + 6, 4, STONE, { src, keep: passage });
    // Stepped pediment over the porch (fine cells).
    for (let s = 0; s < 6; s++) d.fill(x0, g + 6 + s * 0.5, -3 + s * 0.5, x0 + 1, g + 6.5 + s * 0.5, 3 - s * 0.5, STONE_LIGHT, { src });
  }
  // Cornice, then the tower.
  d.fill(-3.5, g + 6, -5.5, 3.5, g + 6.5, 5.5, STONE_LIGHT, { src });
  redent(d, 0, 0, g + 6.5, g + 7.5, 3, 4, STONE, { src });
  tieredTop(d, 0, 0, g + 7.5, [3, 2.5, 2, 1.5], 1.5, src);
  // Windows on the body sides.
  for (const sz of [1, -1]) m.paint(-1, g + 2, sz > 0 ? 4 : -5, 1, g + 4, sz > 0 ? 5 : -4, SHADOW, { src });
  // Wings with windows, ending in a small pavilion.
  for (const [side, len] of [
    [-1, o.wings[0]],
    [1, o.wings[1]],
  ] as const) {
    if (len < 2) continue;
    const za = side > 0 ? 5 : -5 - len;
    const zb = side > 0 ? 5 + len : -5;
    m.fill(-2, g, za, 2, g + 4, zb, STONE, { src });
    m.paint(-2, g, za, 2, g + 1, zb, STONE_DARK, { src });
    for (let z = za + 1; z < zb - 1; z += 2) {
      m.paint(-2, g + 1, z, -1, g + 3, z + 1, SHADOW, { src });
      m.paint(1, g + 1, z, 2, g + 3, z + 1, SHADOW, { src });
    }
    d.fill(-2.5, g + 4, za, 2.5, g + 4.5, zb, STONE_LIGHT, { src });
    d.fill(-1.5, g + 4.5, za, 1.5, g + 5, zb, STONE, { src });
    d.fill(-0.5, g + 5, za, 0.5, g + 5.5, zb, STONE, { src });
    // End pavilion.
    const ea = side > 0 ? zb - 3 : za;
    const ec = ea + 1.5;
    m.fill(-3, g, ea, 3, g + 5, ea + 3, STONE, { src });
    m.paint(-3, g, ea, 3, g + 1, ea + 3, LATERITE, { src });
    const ze = side > 0 ? ea + 2 : ea;
    m.paint(-1, g + 1, ze, 1, g + 4, ze + 1, SHADOW, { src });
    d.fill(-3.5, g + 5, ea - 0.5, 3.5, g + 5.5, ea + 3.5, STONE_LIGHT, { src });
    tieredTop(d, 0, ec, g + 5.5, [2, 1.5, 1], 1.5, src);
  }
  return [
    [4.5, g + 3.5, 3.75],
    [4.5, g + 3.5, -3.75],
    [-4.5, g + 3.5, 3.75],
    [-4.5, g + 3.5, -3.75],
  ];
}

export interface NagaOpts {
  /** Deck height (m). */
  g: number;
  /** Side of the road: +1 = +z, −1 = −z. */
  side: 1 | -1;
  /** Centre line of the balustrade (m, |z|). */
  z: number;
  /** A raised fan head at the start and the end. */
  heads?: [boolean, boolean];
  src?: SourceTrace;
}

/**
 * Naga balustrade on fine cells along x from `x0` to `x1`: a low wall, short
 * posts, and the serpent's body resting on them; at each end the body rears
 * up into a fan of heads on a pedestal. Returns the tops of the heads (lamps).
 */
export function naga(d: Mason, x0: number, x1: number, o: NagaOpts): [number, number, number][] {
  const src = o.src ?? traceSource();
  const { g, side } = o;
  const z = side * o.z;
  const za = z - 0.25;
  const zb = z + 0.25;
  const heads = o.heads ?? [true, true];
  const lamps: [number, number, number][] = [];
  const a = x0 + (heads[0] ? 1 : 0);
  const b = x1 - (heads[1] ? 1 : 0);
  d.fill(a, g, za, b, g + 0.5, zb, STONE, { src });
  for (let x = a; x + 0.5 <= b; x += 1.5) d.fill(x, g + 0.5, za, x + 0.5, g + 1, zb, STONE, { src });
  d.fill(a, g + 1, za, b, g + 1.5, zb, STONE_LIGHT, { src });
  for (const end of [0, 1] as const) {
    if (!heads[end]) continue;
    const dir = end === 0 ? -1 : 1;
    const xe = end === 0 ? x0 : x1 - 1;
    // Pedestal.
    d.fill(xe, g, za - 0.5, xe + 1, g + 1.5, zb + 0.5, STONE, { src });
    // Fan of heads, spread a little outwards from the road.
    const fz = z + side * 0.5;
    const rows = [0.5, 1, 1.5, 1.5, 1, 0.5];
    const xf = dir > 0 ? xe + 0.5 : xe;
    rows.forEach((hw, r) => {
      d.fill(xf, g + 1.5 + r * 0.5, fz - hw, xf + 0.5, g + 2 + r * 0.5, fz + hw, STONE_LIGHT, { src });
    });
    // Neck behind the fan.
    const xn = dir > 0 ? xe : xe + 0.5;
    d.fill(xn, g + 1.5, z - 0.25, xn + 0.5, g + 3, z + 0.25, STONE, { src });
    lamps.push([xf + 0.25, g + 4.75, fz]);
  }
  return lamps;
}

/**
 * A garden tree of 1 m blocks: a short trunk and a rounded crown, some leaf
 * blocks in blossom. Adds its blocks straight to `b` (world metres).
 */
export function gardenTree(b: VoxelBuilder, x: number, y: number, z: number, h: number, seed: number, bloom?: Tones): void {
  const src = traceSource();
  const trunk = Math.max(2, Math.round(h * 0.4));
  for (let j = 0; j < trunk; j++) b.box(x, y + j + 0.5, z, 0.8, 1, 0.8, pick(BARK, hash3(j, seed, 1, 3)), 'mapBark', { src });
  const R = h * 0.36;
  const cy = y + trunk + R * 0.55;
  const n = Math.ceil(R);
  for (let i = -n; i <= n; i++)
    for (let j = -n; j <= n; j++)
      for (let k = -n; k <= n; k++) {
        const r = Math.hypot(i, j * 1.35, k) / R + (hash3(i, j, k, seed) - 0.5) * 0.4;
        if (r > 1) continue;
        // Hidden inner blocks are left out.
        if (r < 0.55 && Math.abs(j) < n - 1) continue;
        const flower = bloom && j >= 0 && hash3(i, j, k, seed + 9) < 0.28;
        const color = flower ? pick(bloom, hash3(k, i, j, seed)) : pick(LEAF, hash3(i, k, j, seed + 2));
        const shade = 0.82 + 0.3 * ((j + n) / (2 * n));
        b.box(x + i, cy + j, z + k, 1, 1, 1, color, 'mapLeaf', { src, shade });
      }
}
