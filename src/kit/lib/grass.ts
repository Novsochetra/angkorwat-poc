import type { VoxelMaterialKey } from '../../voxel/materials';
import { hash3, valueNoise3 } from '../../voxel/random';
import type { Surf, VoxelGrid } from '../../voxel/VoxelBuilder';
import { FLOWER } from '../palette';
import type { PieceBuilder } from '../PieceBuilder';
import { rng, scatter, TEXEL } from '../shapes';

/**
 * Grass for the world kit, as the sheets draw it: blades one texel (1/16 m)
 * wide that climb in little sideways steps, near-black green at the root,
 * olive in the middle and yellow-green at the tips — the "+" tufts of the
 * §18.2 grass tile, the spiky clumps of §20 ⑪, the §18.1 ground-foliage tuft
 * and small plant.
 *
 * Builders draw into a {@link VoxelGrid} of TEXEL cells (`grassGrid()`, or
 * `topGrid()` of lib/ground.ts on a tile) in cell units: (i, k) is the root
 * column and `j` the first row above the ground (default 0). Ghost the row
 * under the roots (`ghostGround`) so ambient occlusion darkens the base the way
 * the sheets do.
 */

/** Blade tones from the root up (sRGB albedo, calibrated against the sheets). */
export interface GrassTones {
  base: readonly number[];
  mid: readonly number[];
  tip: readonly number[];
}

export const GRASS_TONES = {
  /** §18.2 tile tufts: lime blades, a step brighter than the lawn they stand on. */
  lawn: { base: [0x3f5a34, 0x46613a], mid: [0x5f7e36, 0x688737], tip: [0x98b23c, 0xa4bb3e] },
  /** §20 grass patches, §18.1 grass tuft: olive blades with yellow-green tips. */
  meadow: { base: [0x2a4a44, 0x315247, 0x28453f], mid: [0x4c6e4f, 0x567850, 0x50724c], tip: [0x7f994e, 0x89a350, 0x79934b] },
  /** Late dry season: the same clumps going to straw at the tips. */
  dry: { base: [0x2e4125, 0x3a4b27], mid: [0x66742d, 0x77802f], tip: [0xb0a246, 0xbfae52, 0x9c8e3a] },
} as const satisfies Record<string, GrassTones>;

/**
 * The §18.2 lawn mosaic, dark to bright, and the share of texels of each: the
 * six tones of the sheet's grass top (deep green through olive to lime, #8a9732
 * on average), as albedo that renders like them on a flat top.
 */
export const LAWN_TONES = [0x3d543f, 0x566d42, 0x6c8342, 0x85973e, 0x99a83e, 0xaab540] as const;
export const LAWN_SHARES = [0.1, 0.13, 0.19, 0.25, 0.22, 0.11] as const;

/**
 * Tone of band `f` (0 = root, 1 = tip) of one blade: the same all along the
 * band, so `commitGrass` can draw each band of a blade as one long stalk.
 */
function bladeTone(tones: GrassTones, f: number, seed: number): number {
  const band = f >= 0.7 ? 2 : f >= 0.28 ? 1 : 0;
  const list = [tones.base, tones.mid, tones.tip][band];
  return list[Math.floor(hash3(band, 3, 5, seed) * list.length) % list.length];
}

/** A seed of its own for cell (i, j, k), for per-cell tones. */
const cellSeed = (i: number, j: number, k: number, seed: number) => Math.floor(hash3(i, j, k, seed) * 1e9);

const DIRS4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** A texel grid for grass (`leaves` family) with cell (0, 0, 0) at `origin` (metres, on the texel grid). */
export function grassGrid(p: PieceBuilder, origin: [number, number, number], seed = 1): VoxelGrid {
  return p.voxels.grid({ cell: TEXEL, origin, mat: 'leaves', jitter: 0.06, ao: 0.32, seed });
}

/** Mark the ground under cells i0‥i1 × k0‥k1 as solid (the row below `j`), so roots get their AO. */
export function ghostGround(g: VoxelGrid, i0: number, k0: number, i1: number, k1: number, j = 0): void {
  for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) if (!g.has(i, j - 1, k)) g.ghost(i, j - 1, k);
}

/** Drop the cells a tuft pushed outside columns 0‥n−1 × 0‥m−1 (a tile's footprint), keeping ghosts. */
export function clipToFootprint(g: VoxelGrid, n: number, m: number): void {
  const out: [number, number, number][] = [];
  g.forEach((i, j, k, c) => {
    if (!c.ghost && (i < 0 || i >= n || k < 0 || k >= m)) out.push([i, j, k]);
  });
  for (const [i, j, k] of out) g.delete(i, j, k);
}

export interface BladeOptions {
  /** Height in texels. */
  h: number;
  /** Outward direction the blade leans towards, in cells (e.g. [1, 0], [1, −1]). */
  dir?: readonly [number, number];
  /** Sideways steps outward along the blade (0 = upright). */
  steps?: number;
  /** Where the steps sit: 0 = low (the blade arches out from the root), 1 = near the tip; default 0.5 (evenly). */
  bend?: number;
  /**
   * Chance of a side shoot (up to two on tall blades): one or two texels out,
   * then turning up like a candelabra arm — or, near the tip, the sheet's "Γ".
   */
  nub?: number;
  tones: GrassTones;
  seed: number;
}

/**
 * One blade rooted at (i, j, k): a column of cells that steps one texel
 * outward now and then (the step keeps a connecting cell, so the blade reads
 * as a pixel-art stair, not loose diagonal cubes), with side shoots.
 */
export function grassBlade(g: VoxelGrid, i: number, j: number, k: number, o: BladeOptions): void {
  const r = rng(o.seed);
  const h = Math.max(1, Math.round(o.h));
  const [di, dk] = o.dir ?? [0, 0];
  const put = (x: number, y: number, z: number, f: number) => {
    if (!g.has(x, y, z)) g.set(x, y, z, bladeTone(o.tones, f, o.seed));
  };
  // Rows where the blade steps out (never the root or the tip), bunched low or high by `bend`.
  const steps = di || dk ? Math.min(Math.round(o.steps ?? 0), h - 2) : 0;
  const gamma = 2 ** (1 - 2 * (o.bend ?? 0.5));
  const stepAt = new Set<number>();
  for (let s = 0; s < steps; s++) stepAt.add(Math.max(1, Math.min(h - 2, Math.round(h * ((s + 1) / (steps + 1)) ** gamma + r.range(-0.4, 0.4)))));
  // Side shoots: rows in the upper two thirds, on alternate sides across the lean.
  const nub = o.nub ?? 0;
  const shootAt = new Map<number, number>();
  if (h >= 3 && r.chance(nub)) shootAt.set(r.int(Math.max(1, Math.floor(h * 0.35)), h - 1), 1);
  if (h >= 6 && r.chance(nub * 0.6)) shootAt.set(r.int(Math.max(1, Math.floor(h * 0.3)), h - 2), -1);
  const [ci, ck] = di || dk ? [-dk, di] : r.pick(DIRS4);
  let x = i;
  let z = k;
  for (let t = 0; t < h; t++) {
    const f = h === 1 ? 1 : t / (h - 1);
    if (stepAt.has(t)) {
      x += di;
      z += dk;
      put(x, j + t - 1, z, (t - 1) / (h - 1));
    }
    put(x, j + t, z, f);
    const side = shootAt.get(t);
    if (side) {
      const out = r.int(1, 2);
      const up = t >= h - 2 ? 0 : r.int(1, Math.min(3, h - 1 - t));
      for (let s = 1; s <= out; s++) put(x + side * ci * s, j + t, z + side * ck * s, Math.min(1, f + 0.15));
      for (let u = 1; u <= up; u++) put(x + side * ci * out, j + t + u, z + side * ck * out, Math.min(1, (t + u) / (h - 1) + 0.15));
    }
  }
}

export interface TuftOptions {
  /** Tallest blade (texels), default 4; blades towards the rim are a little shorter. */
  height?: number;
  /** Radius of the root clump (texels), default from the height. */
  radius?: number;
  /** Spacing of the roots (texels): 1 = packed, 2 = a texel of air between blades (default 1.3). */
  spacing?: number;
  /** How far the blades fan out (0 upright … 1 splayed like a fountain), default 0.35. */
  lean?: number;
  /** Chance of side shoots on each blade (see BladeOptions.nub), default 0.4. */
  nub?: number;
  /** The skirt of short blades splayed on the ground round the clump (0 none … 1 full), default 0.4. */
  arms?: number;
  /** Ground row, default 0. */
  j?: number;
  seed?: number;
  tones?: GrassTones;
}

/**
 * A spiky tuft, fanned like a fountain: blades rooted close together in a
 * small disc, most of them nearly full height, the ones further out stepping
 * outward more often, branching like candelabra, and a skirt of short blades
 * that run out along the ground and turn up — the §18.1 grass tuft and the
 * clumps of §20 ⑪.
 */
export function grassTuft(g: VoxelGrid, i: number, k: number, o: TuftOptions = {}): void {
  const seed = o.seed ?? 1;
  const r = rng(seed);
  const H = o.height ?? 4;
  const R = o.radius ?? Math.max(1, H / 4);
  const j = o.j ?? 0;
  const tones = o.tones ?? GRASS_TONES.meadow;
  const lean = o.lean ?? 0.35;
  const sp = o.spacing ?? 1.3;
  const nub = o.nub ?? 0.4;
  // Roots: a Poisson disc (always one in the middle), each blade leaning away from the centre.
  const roots: [number, number][] = [[0, 0], ...scatter(seed, Math.ceil((Math.PI * (R + 0.5) ** 2) / (sp * sp)) * 2, 2 * R + 1, 2 * R + 1, sp)];
  const seen = new Set<number>();
  roots.forEach(([x, z], b) => {
    const d = Math.hypot(x, z);
    if (d > R + 0.5) return;
    const ri = i + Math.round(x);
    const rk = k + Math.round(z);
    const key = (ri + 512) * 1024 + rk + 512;
    if (seen.has(key)) return;
    seen.add(key);
    const rim = Math.min(1, d / Math.max(R, 1));
    const h = Math.max(1, Math.round(H * (1 - 0.3 * rim * rim) * (b === 0 ? 1 : r.range(0.72, 1.04))));
    // Blades in the middle stand up straight; the rim ones arch out from low down.
    const dir: readonly [number, number] = rim < 0.25 ? r.pick(DIRS4) : [Math.round(x / d), Math.round(z / d)];
    grassBlade(g, ri, j, rk, { h, dir, steps: (lean * (0.1 + rim * rim) * h) / 2, bend: 0.8 - 0.7 * rim, nub, tones, seed: seed * 97 + b });
  });
  // The skirt: from the rim, a runner along the ground, then a short blade stepping out.
  const skirt = Math.round((o.arms ?? 0.4) * (3 + R * 3));
  for (let a = 0; a < skirt; a++) {
    const ang = ((a + r.range(-0.35, 0.35)) / skirt) * Math.PI * 2;
    const dir: [number, number] = [Math.round(Math.cos(ang)), Math.round(Math.sin(ang))];
    let x = i + Math.round(Math.cos(ang) * (R + 0.4));
    let z = k + Math.round(Math.sin(ang) * (R + 0.4));
    const run = r.int(0, 2);
    for (let s = 0; s < run; s++, x += dir[0], z += dir[1]) if (!g.has(x, j, z)) g.set(x, j, z, bladeTone(tones, 0.35, seed + a));
    grassBlade(g, x, j, z, { h: r.int(1, Math.max(2, Math.round(H / 3))), dir, steps: 1, bend: 0, nub: nub * 0.5, tones, seed: seed * 89 + a });
  }
}

export interface ClumpOptions extends TuftOptions {
  /** Half-extents (texels) of the clump's elliptic footprint along x and z. */
  rx: number;
  rz: number;
  /** Mean distance between the tufts (texels), default 3. */
  gap?: number;
}

/**
 * A clump of tufts filling an ellipse around (i, k): tallest in the middle,
 * lower and more splayed towards the rim, low shoots only on the rim — the
 * mounded clumps of §20 ⑪.
 */
export function grassClump(g: VoxelGrid, i: number, k: number, o: ClumpOptions): void {
  const seed = o.seed ?? 1;
  const r = rng(seed);
  const gap = o.gap ?? 3;
  const H = o.height ?? 5;
  // Always a tuft in the middle (small clumps may get no other).
  const pts: [number, number][] = [[0, 0], ...scatter(seed + 7, Math.ceil(((Math.PI * o.rx * o.rz) / (gap * gap)) * 1.6), 2 * o.rx, 2 * o.rz, gap * 0.8)];
  pts.forEach(([x, z], n) => {
    if (n > 0 && Math.hypot(x, z) < gap * 0.6) return;
    const e = Math.hypot(x / o.rx, z / o.rz);
    if (e > 1) return;
    grassTuft(g, Math.round(i + x), Math.round(k + z), {
      ...o,
      height: Math.max(2, Math.round(H * (1 - 0.45 * e * e) * r.range(0.8, 1.08))),
      radius: o.radius ?? 1.4,
      lean: (o.lean ?? 0.35) * (0.6 + e),
      // Only the rim tufts get a skirt (all of a clump too small to have a middle).
      arms: e > 0.65 || Math.max(o.rx, o.rz) < 1.5 ? (o.arms ?? 0.4) : 0,
      seed: seed * 29 + n,
    });
  });
}

/**
 * A mat of turf over the top of a block (cells i0‥i1 × k0‥k1 on row j, the
 * block top just below): one texel thick with a few lumps, its rim drooping
 * one to three texels down the block's sides (never below row 0, the ground)
 * — grass grown over a soil base or a fallen stone (§20 ⑪). Ghosts the block
 * under it for the AO.
 */
export function grassMat(g: VoxelGrid, i0: number, k0: number, i1: number, k1: number, o: { j?: number; droop?: number; seed?: number; tones?: GrassTones } = {}): void {
  const seed = o.seed ?? 1;
  const r = rng(seed);
  const j = o.j ?? 0;
  const tones = o.tones ?? GRASS_TONES.meadow;
  const droop = o.droop ?? 0.5;
  for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) for (let y = j - 5; y < j; y++) if (!g.has(i, y, k)) g.ghost(i, y, k);
  for (let i = i0; i <= i1; i++)
    for (let k = k0; k <= k1; k++) {
      const v = valueNoise3(i * 0.3, k * 0.3, 1.5, seed);
      g.set(i, j, k, bladeTone(tones, 0.45 + v * 0.5, cellSeed(i, j, k, seed)));
      if (v > 0.62 && r.chance(0.6)) g.set(i, j + 1, k, bladeTone(tones, 0.9, cellSeed(i, j + 1, k, seed)));
      const oi = i === i0 ? -1 : i === i1 ? 1 : 0;
      const ok = k === k0 ? -1 : k === k1 ? 1 : 0;
      if ((oi || ok) && r.chance(droop)) {
        const len = r.int(1, 3);
        for (let t = 0; t < len && j - t >= 0; t++) g.set(i + oi, j - t, k + ok, bladeTone(tones, t === 0 ? 0.5 : 0.2, cellSeed(i, 0, k, seed)));
      }
    }
}

/**
 * The short "+" tuft of the §18.2 grass tile: a centre blade (default three
 * texels tall) and four one-texel shoots around it (one sometimes a texel
 * taller or missing).
 */
export function plusTuft(g: VoxelGrid, i: number, k: number, o: { height?: number; j?: number; seed?: number; tones?: GrassTones } = {}): void {
  const seed = o.seed ?? 1;
  const r = rng(seed);
  const j = o.j ?? 0;
  const tones = o.tones ?? GRASS_TONES.lawn;
  const h = o.height ?? 3;
  for (let t = 0; t < h; t++) g.set(i, j + t, k, bladeTone(tones, h === 1 ? 1 : t / (h - 1), seed));
  const tall = r.int(0, 3);
  const gone = r.chance(0.2) ? (tall + r.int(1, 3)) % 4 : -1;
  DIRS4.forEach(([di, dk], n) => {
    if (n === gone) return;
    g.set(i + di, j, k + dk, bladeTone(tones, 0.5, seed + n));
    if (n === tall && h > 2) g.set(i + di, j + 1, k + dk, bladeTone(tones, 1, seed + n));
  });
}

/** A seedling: a stem one or two texels tall and two leaves opening in a V. */
export function sprout(g: VoxelGrid, i: number, k: number, o: { j?: number; seed?: number; tones?: GrassTones } = {}): void {
  const seed = o.seed ?? 1;
  const r = rng(seed);
  const j = o.j ?? 0;
  const tones = o.tones ?? GRASS_TONES.meadow;
  const h = r.int(1, 2);
  for (let t = 0; t < h; t++) g.set(i, j + t, k, bladeTone(tones, 0.5, seed));
  const [di, dk] = r.pick(DIRS4);
  g.set(i + di, j + h, k + dk, bladeTone(tones, 1, seed));
  g.set(i - di, j + h, k - dk, bladeTone(tones, 1, seed + 1));
}

/**
 * The §18.1 "small plant": a stem 3–5 texels tall with flat leaves (two
 * texels long) fanning out in turn up it and a leaf pair on top.
 */
export function smallPlant(g: VoxelGrid, i: number, k: number, o: { height?: number; j?: number; seed?: number; tones?: GrassTones } = {}): void {
  const seed = o.seed ?? 1;
  const r = rng(seed);
  const j = o.j ?? 0;
  const tones = o.tones ?? GRASS_TONES.meadow;
  const h = o.height ?? r.int(3, 5);
  for (let t = 0; t < h; t++) g.set(i, j + t, k, bladeTone(tones, (t / h) * 0.6, seed));
  let d = r.int(0, 3);
  for (let t = 1; t < h; t += r.chance(0.4) ? 2 : 1) {
    const [di, dk] = DIRS4[d];
    d = (d + 1 + r.int(0, 1)) % 4;
    // Leaves reach out two texels, the tip lifting on some.
    g.set(i + di, j + t, k + dk, bladeTone(tones, 0.75, seed + t));
    g.set(i + 2 * di, j + t + (r.chance(0.4) ? 1 : 0), k + 2 * dk, bladeTone(tones, 1, seed + t));
  }
  g.set(i, j + h, k, bladeTone(tones, 1, seed));
}

/** Petal colours of the sheets' meadow flowers. */
export const FLOWER_TONES = {
  pink: FLOWER.pink,
  deep: FLOWER.deep,
  cream: FLOWER.cream,
  yellow: FLOWER.yellow,
} as const;

/**
 * A flower on a thin stem: `h` texels of stem, then a one-texel bloom (with
 * one or two more petals beside it on the bigger ones) in the `petal` family.
 */
export function flower(g: VoxelGrid, i: number, k: number, o: { h?: number; j?: number; seed?: number; petals?: readonly number[]; tones?: GrassTones } = {}): void {
  const seed = o.seed ?? 1;
  const r = rng(seed);
  const j = o.j ?? 0;
  const h = o.h ?? r.int(1, 3);
  const petals = o.petals ?? FLOWER_TONES.pink;
  const tones = o.tones ?? GRASS_TONES.meadow;
  for (let t = 0; t < h; t++) g.set(i, j + t, k, bladeTone(tones, 0.4, seed));
  const petal = (x: number, y: number, z: number) => g.set(x, y, z, petals[Math.floor(hash3(x, y, z, seed) * petals.length) % petals.length], 'petal');
  petal(i, j + h, k);
  const extra = r.int(0, 2);
  for (let n = 0; n < extra; n++) {
    const [di, dk] = r.pick(DIRS4);
    petal(i + di, j + h - (r.chance(0.3) ? 1 : 0), k + dk);
  }
}

/** One texel of a flat layer: its colour and family (and pattern amounts). */
export interface LayerCell {
  color: number;
  mat: VoxelMaterialKey;
  surf?: Surf;
}

/**
 * A flat layer `h` thick (default one texel) over an n × m texel area whose
 * min corner is `origin` (metres): `cell(i, k)` gives each texel's look, or
 * null for a gap. Runs of equal texels become one rectangle. Sides merge (stay
 * flat) only into a neighbour of the same look — merged faces overlap, so
 * different colours would z-fight — which is why a mosaic of many colours is
 * best laid as thin plates (h = PLATE): a block's bevel scales with its
 * thinnest side, so plate seams stay invisible.
 */
export function flatLayer(p: PieceBuilder, n: number, m: number, origin: [number, number, number], cell: (i: number, k: number) => LayerCell | null, h = TEXEL): void {
  const cells = Array.from({ length: n * m }, (_, x) => cell(x % n, Math.floor(x / n)));
  const same = (a: LayerCell | null, b: LayerCell | null) => !!a && !!b && a.color === b.color && a.mat === b.mat && a.surf === b.surf;
  const at = (i: number, k: number) => (i >= 0 && i < n && k >= 0 && k < m ? cells[k * n + i] : null);
  const done = new Uint8Array(n * m);
  const [ox, oy, oz] = origin;
  for (let k = 0; k < m; k++)
    for (let i = 0; i < n; i++) {
      const c = cells[k * n + i];
      if (!c || done[k * n + i]) continue;
      let w = 1;
      while (i + w < n && !done[k * n + i + w] && same(c, cells[k * n + i + w])) w++;
      let d = 1;
      grow: while (k + d < m) {
        for (let x = i; x < i + w; x++) if (done[(k + d) * n + x] || !same(c, cells[(k + d) * n + x])) break grow;
        d++;
      }
      for (let z = k; z < k + d; z++) for (let x = i; x < i + w; x++) done[z * n + x] = 1;
      // Per side (+x, −x, +z, −z): does the layer go on past all of it, and in the same look?
      const side = (cellsAlong: (LayerCell | null)[]) => [cellsAlong.every((q) => !!q), cellsAlong.every((q) => same(c, q))];
      const range = (len: number, f: (t: number) => LayerCell | null) => Array.from({ length: len }, (_, t) => f(t));
      const sides = [
        side(range(d, (t) => at(i + w, k + t))),
        side(range(d, (t) => at(i - 1, k + t))),
        side(range(w, (t) => at(i + t, k + d))),
        side(range(w, (t) => at(i + t, k - 1))),
      ];
      const bits = [1, 2, 16, 32];
      const open = sides.reduce((o, [covered], s) => (covered ? o : o | bits[s]), 4);
      const merge = sides.reduce((o, [, alike], s) => (alike ? o | bits[s] : o), 8);
      p.voxels.span(ox + i * TEXEL, oy, oz + k * TEXEL, ox + (i + w) * TEXEL, oy + h, oz + (k + d) * TEXEL, c.color, c.mat, { surf: c.surf, merge, open });
    }
}

/** Thickness of mosaic plates laid over a surface (1/128 m: seams under a millimetre). */
export const PLATE = TEXEL / 8;

/** Mix two sRGB colours (t = 0 → a, 1 → b). */
function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round((((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t)) << s;
  return ch(16) | ch(8) | ch(0);
}

/** The sunlit yellow-green the sheets give the tops of blades and steps. */
export const SUNLIT = 0xd6d64a;
/** Thickness of the sunlit caps (a highlight, not a lid). */
const CAP = TEXEL / 16;

/** Neighbour weights of the grids' ambient occlusion (see VoxelGrid.commit). */
const AO_W = [0, 1, 0.6, 0.35];
/** Exposure of a cell on a flat wall with those weights. */
const AO_FLAT = 0.305;

/**
 * Emit a grass grid (use instead of `g.commit()`): each column's run of equal
 * cells becomes one tall box, so a blade reads as a continuous stalk in two or
 * three tones rather than a stack of bevelled cubes, and every exposed top of
 * a `leaves` run gets a sunlit cap — a thin plate pulled `sun` of the way to
 * SUNLIT, because the sheets light blade tips and steps far brighter than their
 * sides (which fall to dark green), more than the studio light alone does.
 * Runs keep the grids' ambient occlusion (averaged over their cells) and jitter.
 */
export function commitGrass(p: PieceBuilder, g: VoxelGrid, o: { sun?: number; ao?: number; jitter?: number; seed?: number } = {}): void {
  const sun = o.sun ?? 0.3;
  const ao = o.ao ?? 0.32;
  const jitter = o.jitter ?? 0.06;
  const seed = o.seed ?? 1;
  const [cx, cy, cz] = g.cell;
  const [ox, oy, oz] = g.origin;
  const cols = new Map<number, number[]>();
  g.forEach((i, j, k, c) => {
    if (c.ghost) return;
    const key = (i + 1024) * 2048 + k + 1024;
    const col = cols.get(key);
    if (col) col.push(j);
    else cols.set(key, [j]);
  });
  const exposure = (i: number, j: number, k: number) => {
    let open = 0;
    let total = 0;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const w = AO_W[Math.abs(dx) + Math.abs(dy) + Math.abs(dz)];
          total += w;
          if (w && !g.has(i + dx, j + dy, k + dz)) open += w;
        }
    return open / total;
  };
  for (const [key, js] of cols) {
    const i = Math.floor(key / 2048) - 1024;
    const k = (key % 2048) - 1024;
    js.sort((a, b) => a - b);
    for (let n = 0; n < js.length; ) {
      const c = g.get(i, js[n], k)!;
      let m = n + 1;
      while (m < js.length && js[m] === js[m - 1] + 1) {
        const d = g.get(i, js[m], k)!;
        if (d.color !== c.color || d.mat !== c.mat || d.surf !== c.surf) break;
        m++;
      }
      const j0 = js[n];
      const j1 = js[m - 1];
      n = m;
      let exp = 0;
      let open = 0;
      for (let j = j0; j <= j1; j++) {
        exp += exposure(i, j, k);
        open |= (g.has(i + 1, j, k) ? 0 : 1) | (g.has(i - 1, j, k) ? 0 : 2) | (g.has(i, j, k + 1) ? 0 : 16) | (g.has(i, j, k - 1) ? 0 : 32);
      }
      const top = !g.has(i, j1 + 1, k);
      open |= (top ? 4 : 0) | (g.has(i, j0 - 1, k) ? 0 : 8);
      if (!open) continue;
      const shade = (1 + ao * Math.max(-0.7, Math.min(0.45, (exp / (j1 - j0 + 1) - AO_FLAT) * 2))) * (1 + (hash3(i, j0, k, seed) - 0.5) * 2 * jitter);
      const x = ox + (i + 0.5) * cx;
      const z = oz + (k + 0.5) * cz;
      const y0 = oy + j0 * cy;
      const y1 = oy + (j1 + 1) * cy;
      p.voxels.box(x, (y0 + y1) / 2, z, cx, y1 - y0, cz, c.color, c.mat, { shade, open, surf: c.surf, src: g.src });
      if (top && c.mat === 'leaves' && sun > 0) p.voxels.box(x, y1 + CAP / 2, z, cx, CAP, cz, mix(c.color, SUNLIT, sun), 'leaves', { shade, src: g.src });
    }
  }
}

/**
 * Tone indices (into LAWN_TONES, dark to bright) of an n × m lawn, at k·n + i:
 * per-texel squares that clump into small blotches, with exactly `shares` of
 * each tone — texels are ranked by a blotch noise plus per-texel jitter and
 * dealt out dark to bright.
 */
export function lawnMosaic(n: number, m: number, seed: number, shares: readonly number[] = LAWN_SHARES): number[] {
  const v = Array.from({ length: n * m }, (_, x) => {
    const i = x % n;
    const k = Math.floor(x / n);
    return valueNoise3(i * 0.42, k * 0.42, 0.5, seed) * 0.5 + hash3(i, 7, k, seed) * 0.5;
  });
  const out = new Array<number>(n * m);
  const total = shares.reduce((a, b) => a + b, 0);
  let t = 0;
  let edge = (shares[0] / total) * n * m;
  v.map((_, x) => x)
    .sort((a, b) => v[a] - v[b])
    .forEach((x, rank) => {
      while (rank >= edge && t < shares.length - 1) edge += (shares[++t] / total) * n * m;
      out[x] = t;
    });
  return out;
}

export interface PatchOptions {
  /** Centre of the patch on its ground (metres), default the origin. */
  at?: [number, number, number];
  /** Footprint (metres). */
  w: number;
  d: number;
  /** Tallest blades (texels) in the middle of the patch, default 5. */
  height?: number;
  /** Mean distance between tufts (texels), default 3; smaller is denser. */
  gap?: number;
  /** Number of flowers among the tufts, default 0. */
  flowers?: number;
  /** Petal colours of those flowers (default pink and cream). */
  petals?: readonly (readonly number[])[];
  seed?: number;
  tones?: GrassTones;
}

/**
 * A ready-made patch on open ground (its own grid, emitted): a grass clump
 * filling the w × d ellipse, with flowers on short stems between the tufts.
 * For dioramas and the ground-foliage card.
 */
export function grassPatch(p: PieceBuilder, o: PatchOptions): void {
  const seed = o.seed ?? 1;
  const r = rng(seed);
  const [cx, cy, cz] = o.at ?? [0, 0, 0];
  const n = Math.max(2, Math.round(o.w / TEXEL));
  const m = Math.max(2, Math.round(o.d / TEXEL));
  const g = grassGrid(p, [Math.round(cx / TEXEL - n / 2) * TEXEL, cy, Math.round(cz / TEXEL - m / 2) * TEXEL], seed);
  ghostGround(g, -3, -3, n + 2, m + 2);
  const tones = o.tones ?? GRASS_TONES.meadow;
  grassClump(g, n / 2, m / 2, { rx: Math.max(0.5, n / 2 - 1.5), rz: Math.max(0.5, m / 2 - 1.5), height: o.height ?? 5, gap: o.gap, tones, seed });
  const petals = o.petals ?? [FLOWER_TONES.pink, FLOWER_TONES.cream];
  scatter(seed + 3, o.flowers ?? 0, n - 3, m - 3, 2).forEach(([x, z], t) => {
    const i = Math.round(x + n / 2);
    const k = Math.round(z + m / 2);
    if (!g.has(i, 0, k)) flower(g, i, k, { h: r.int(1, 3), petals: r.pick(petals), tones, seed: seed + t });
  });
  commitGrass(p, g, { seed });
}
