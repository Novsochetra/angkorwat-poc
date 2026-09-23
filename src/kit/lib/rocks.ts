import { hash3, valueNoise3 } from '../../voxel/random';
import type { Surf } from '../../voxel/VoxelBuilder';
import { BlockSet } from '../BlockSet';
import { fromSheet } from '../palette';
import type { PieceBuilder } from '../PieceBuilder';
import { rng, snap, TEXEL, type Rng } from '../shapes';
import { leafSurf, stoneSurf, type StoneFinish } from '../surface';

/**
 * Rocks and stone debris for the world kit — the §18.2 ⑧ small-rocks tile, the
 * §20 ① stone fragments, and the stones under bushes, beside roots and in the
 * dioramas. The sheets draw both as little heaps of rounded blocks with seams
 * between them, so both are laid on the texel grid:
 *
 *  - {@link rock}: a rounded natural rock or pebble — a stepped dome of
 *    rounded slabs, one per course (each its own grey-greige tone, pale on the
 *    crown), optionally bedded in the ground or clipped flush with a tile's side.
 *  - {@link fragment}: a broken sandstone chunk — a few dressed sub-blocks laid
 *    as a {@link BlockSet} like a piece of fallen masonry, chipped along its
 *    edges, dotted with dark pores, moss on top.
 *  - {@link scatterRocks}: a group of either, sized the way debris lies (a few
 *    big stones, many small ones) and spaced so they don't overlap.
 *
 * Everything is in metres, piece space (y = the ground the stones lie on), on
 * the 1/16 m texel grid, and deterministic for a seed.
 */

/**
 * Stone tones (sRGB albedo), light → dark, sampled from the sheets. The field
 * stones and the debris are matched on their lit tops (as albedo that renders
 * like the sheet on a top face: the studio lights tops warmer than fromSheet's
 * top/front average), the other palettes through fromSheet.
 */
export const ROCK = {
  /** Grey-greige field stone of the §18.2 small-rocks tile (lit tops as the sheet's: #dccab0 on a pale crown … #85776a at a dark foot). */
  grey: [0xd6cab4, 0xc4b4a2, 0xb0a192, 0x9a8f84, 0x827a72],
  /** Grey-brown stone (laterite-stained, river-worn): warmer, for dirt paths and roots. */
  brown: [0xa88a6c, 0x9a7d62, 0x8a6f58, 0x76604d, 0x645244].map(fromSheet),
  /** §20 stone fragments: olive / grey-taupe weathered sandstone (lit tops ≈ the sheet's #c39b70, sides #8f724f). */
  debris: [0xb39977, 0xa68e6e, 0x9e876a, 0x947f64, 0xa49278],
  /** Faces broken open on the debris (bites, chipped edges): a shade darker and browner. */
  debrisBroken: [0x8a7a5c, 0x7e7058, 0x958663],
} as const;

/** Moss on the debris: the §20 sheet's dark olive through yellow-green to its sunlit tips (#363c1f … #b0a655). */
export const DEBRIS_MOSS = [0x3e4732, 0x50553c, 0x696f3f, 0x7d7f40, 0x8c8f40, 0xa9a55e] as const;

/** Moss on the field stones: the §18.2 sheet's olive moss (#313820 … #929431). */
const ROCK_MOSS = [0x3a4133, 0x4e5638, 0x63693c, 0x767d40, 0x888f44, 0x999f4a] as const;

/** The dark pores the §20 sheet dots over every face: olive-grey, the tones of the §20 masonry props' pores. */
const PORES = [0x5e5244, 0x54493c, 0x665848, 0x4e4438] as const;

/**
 * The §20 debris finish: weathered olive-grey sandstone with dark mottling,
 * lichen and a few chips. Its moss amount goes to {@link fragment}'s moss
 * cushions rather than the stone pattern.
 */
export const FRAGMENT_FINISH: StoneFinish = {
  palette: ROCK.debris,
  surf: stoneSurf({ stain: 0.4, crack: 0.25, lichen: 0.1, moss: 0.2 }),
  wear: 0.05,
};

/** Weathering of the field stones: pale lichen, dark streaks, a few cracks. */
export const ROCK_SURF = stoneSurf({ lichen: 0.36, stain: 0.28, crack: 0.2 });

/** Width, height, depth (metres) from a size: a single number is the width, depth ≈ width, height ≈ `h` × width. */
function dims(size: number | readonly [number, number, number], h: number): [number, number, number] {
  return typeof size === 'number' ? [size, size * h, size] : [size[0], size[1], size[2]];
}

/** Axis-aligned bounds of a stone (metres). */
export interface StoneBounds {
  min: [number, number, number];
  max: [number, number, number];
}

function emptyBounds(): StoneBounds {
  return { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
}

function grow(b: StoneBounds, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
  b.min[0] = Math.min(b.min[0], x0);
  b.min[1] = Math.min(b.min[1], y0);
  b.min[2] = Math.min(b.min[2], z0);
  b.max[0] = Math.max(b.max[0], x1);
  b.max[1] = Math.max(b.max[1], y1);
  b.max[2] = Math.max(b.max[2], z1);
}

// ── Natural rocks ─────────────────────────────────────────────────────────────

export interface RockOptions {
  /** Centre of the rock's footprint on the ground (metres); y = the ground. */
  at: readonly [number, number, number];
  /** Visible size (metres): width, height above the ground, depth. A number is the width (height 0.6 × width). */
  size: number | readonly [number, number, number];
  seed?: number;
  /** Tones light → dark (default {@link ROCK}.grey). */
  palette?: readonly number[];
  /** `sandstone` pattern amounts (default {@link ROCK_SURF}). */
  surf?: Surf;
  /** Moss over the upper courses, 0‥1 (replaces the surf's moss; the bottom course gets a third of it). */
  moss?: number;
  /** Raised moss cushions on the tops, hanging down the sides, 0‥1 (default none; see {@link fragment}). */
  cushions?: number;
  /** Pale lichen blotches, 0‥1 (replaces the surf's lichen). */
  lichen?: number;
  /** Tone of the middle courses: index into the palette (default: random); the crown is a tone lighter, the bottom course a tone darker. */
  tone?: number;
  /** How far the stone continues below the ground (metres): stones bedded in soil. */
  sink?: number;
  /** Clip the stone to this rectangle (metres: x0, z0, x1, z1) — flush with a tile's sides. */
  clip?: readonly [number, number, number, number];
  /** Cell size (default one texel). */
  cell?: number;
  /** Add a collision box when the rock is at least this wide (metres, default 0.3). */
  collide?: number;
}

/** A rock laid by {@link rock}: its bounds, and the ground cells it stands on. */
export interface RockShape extends StoneBounds {
  /** Footprint cells [i, k], world-aligned (i = ⌊x / cell⌋, k = ⌊z / cell⌋). */
  foot: [number, number][];
}

/**
 * A rounded natural rock on a piece. Returns its bounds and footprint (empty if
 * clipped away).
 *
 * As the sheets draw them: a stepped dome of rounded slabs — the bottom course
 * the stone's whole footprint, each course above set in a cell (the upper ones
 * nudged towards one side, so no two stones match) — every course's corners
 * chamfered, more on bigger stones. A course is laid as a cross of two or
 * three overlapping boxes, so its outline is a clean octagon whose corners the
 * bevels round off, as in the sheet's top view; dark at the foot, pale on the
 * crown, moss on the upper courses. Pebbles are a single cell, small stones a
 * cell with a smaller one on top. A bedded stone continues straight down (its
 * face shows where a tile's side cuts it).
 */
export function rock(p: PieceBuilder, o: RockOptions): RockShape {
  const c = o.cell ?? TEXEL;
  const seed = o.seed ?? 1;
  const r = rng(seed * 17 + 5);
  const [W, H, D] = dims(o.size, 0.6);
  const pal = o.palette ?? ROCK.grey;
  const base = o.surf ?? ROCK_SURF;
  const moss = o.moss ?? base[0];
  const lichen = o.lichen ?? base[1];
  const nx = Math.max(1, Math.round(W / c));
  const nz = Math.max(1, Math.round(D / c));
  const up = Math.max(1, Math.round(H / c));
  const down = Math.max(0, Math.round((o.sink ?? 0) / c));
  // Footprint in cells, world-aligned so the texels line up.
  const i0 = Math.round(o.at[0] / c - nx / 2);
  const k0 = Math.round(o.at[2] / c - nz / 2);
  const j0 = Math.round(o.at[1] / c);
  const clip = o.clip ? [Math.ceil(o.clip[0] / c - 1e-6), Math.ceil(o.clip[1] / c - 1e-6), Math.floor(o.clip[2] / c + 1e-6), Math.floor(o.clip[3] / c + 1e-6)] : [-Infinity, -Infinity, Infinity, Infinity];

  // Courses, bottom first (cells relative to the footprint's corner; y in cells
  // above the ground): as many as the stone is wide and tall enough for, the
  // bottom one taking the spare height.
  const courses: { a0: number; a1: number; b0: number; b1: number; y0: number; y1: number }[] = [];
  const count = Math.max(1, Math.min(up, Math.floor((Math.min(nx, nz) + 1) / 2)));
  // (the upper courses slump along one axis only, so none hangs over a chamfered corner below)
  const [alongX, dir] = [r.chance(0.5), r.chance(0.5) ? 1 : -1];
  for (let n = 0; n < count; n++) {
    const q = courses[n - 1];
    let [a0, a1, b0, b1] = q ? [q.a0 + 1, q.a1 - 1, q.b0 + 1, q.b1 - 1] : [0, nx, 0, nz];
    const shift = (d0: number, d1: number): [number, number] => (dir < 0 ? [d0 + dir, d1] : [d0, d1 + dir]);
    // (a crown of one cell grows to two along the slump, so it reads as a cap, not a knob)
    if (q && a1 - a0 === 1 && b1 - b0 === 1) [a0, a1, b0, b1] = alongX ? [...shift(a0, a1), b0, b1] : [a0, a1, ...shift(b0, b1)];
    else if (q && r.chance(0.6)) [a0, a1, b0, b1] = alongX ? [a0 + dir, a1 + dir, b0, b1] : [a0, a1, b0 + dir, b1 + dir];
    // (and always stays on the course below)
    [a0, a1, b0, b1] = q ? [Math.max(a0, q.a0), Math.min(a1, q.a1), Math.max(b0, q.b0), Math.min(b1, q.b1)] : [a0, a1, b0, b1];
    courses.push({ a0, a1, b0, b1, y0: n ? up - count + n : -down, y1: up - count + n + 1 });
  }
  // A stone too small to dome gets a cell on top of it.
  if (count === 1 && up > 1 && nx * nz > 1) {
    const [a, b] = [r.int(0, nx - 1), r.int(0, nz - 1)];
    courses[0].y1 = up - 1;
    courses.push({ a0: a, a1: a + 1, b0: b, b1: b + 1, y0: up - 1, y1: up });
  }
  const chamferOf = (w: number, d: number) => (Math.min(w, d) >= 8 ? 3 : Math.min(w, d) >= 6 ? 2 : Math.min(w, d) >= 3 ? 1 : 0);

  // Mostly mid greys, some paler or darker; the crown a tone lighter, the foot a tone darker.
  const tone = o.tone ?? (r.chance(0.5) ? 2 : r.chance(0.5) ? 1 : 3);
  const pick = (t: number) => pal[Math.max(0, Math.min(pal.length - 1, t))];
  // (the stone's cells, for its bounds, the moss and the footprint)
  const set = new BlockSet(c);
  courses.forEach((q, n) => {
    const color = pick(courses.length === 1 ? tone : n === 0 ? tone + 1 : n === courses.length - 1 ? tone - 1 : tone);
    const surf: Surf = [n ? moss : moss / 3, lichen, base[2], base[3]];
    const shade = 1 + (hash3(n, i0, k0, seed) - 0.5) * 0.08;
    const ch = chamferOf(q.a1 - q.a0, q.b1 - q.b0);
    for (let t = 0; t <= ch; t++) {
      const x0 = Math.max(i0 + q.a0 + t, clip[0]);
      const x1 = Math.min(i0 + q.a1 - t, clip[2]);
      const z0 = Math.max(k0 + q.b0 + ch - t, clip[1]);
      const z1 = Math.min(k0 + q.b1 - ch + t, clip[3]);
      if (x1 <= x0 || z1 <= z0) continue;
      const [y0, y1] = [(j0 + q.y0) * c, (j0 + q.y1) * c];
      p.voxels.span(x0 * c, y0, z0 * c, x1 * c, y1, z1 * c, color, 'sandstone', { surf, shade });
      set.add(x0 * c, y0, z0 * c, x1 * c, y1, z1 * c, color);
    }
  });

  const b = set.bounds();
  if (!Number.isFinite(b.min[0])) return { ...b, foot: [] };
  if (o.cushions && c === TEXEL) mossCushions(p, set, b, o.cushions, seed, ROCK_MOSS);
  const w = Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]);
  if (w >= (o.collide ?? 0.3)) p.collider(b.min[0], j0 * c, b.min[2], b.max[0], b.max[1], b.max[2]);
  const foot: [number, number][] = [];
  for (let i = i0; i < i0 + nx; i++) for (let k = k0; k < k0 + nz; k++) if (set.solidAt((i + 0.5) * c, (j0 + 0.5) * c, (k + 0.5) * c)) foot.push([i, k]);
  return { min: b.min, max: b.max, foot };
}

// ── Broken sandstone fragments ───────────────────────────────────────────────

/** A sub-block of a fragment in texels relative to its base centre: x0, y0, z0, x1, y1, z1 (y0 = 0 on the ground). */
export type TexelBox = readonly [number, number, number, number, number, number];

export interface FragmentOptions {
  /** Centre of the chunk's footprint on the ground (metres, snapped to the texel grid). */
  at: readonly [number, number, number];
  /** The chunk's sub-blocks (texels) — or generated from `size` and `seed` ({@link fragmentBlocks}). */
  blocks?: readonly TexelBox[];
  /** Size of a generated chunk (metres): width, height, depth; a number is the width. */
  size?: number | readonly [number, number, number];
  seed?: number;
  /** Stone finish: tones, pattern amounts and edge wear (default {@link FRAGMENT_FINISH}). */
  finish?: StoneFinish;
  /** Tones of the faces broken open (default {@link ROCK}.debrisBroken). */
  broken?: readonly number[];
  /** Moss cushions over the tops and down the sides, 0‥1 (default the finish's moss amount). */
  moss?: number;
  /** The moss's tones, dark → light (default {@link DEBRIS_MOSS}). */
  mossTones?: readonly number[];
  /** Chipped edges, 0‥1 (default the finish's wear). */
  wear?: number;
  /** Rough bites broken out of the top edges (default 0–1 by size). */
  bites?: number;
  /** Share of the bigger cubes' faces (4 texels and up) with a one-texel pit dug in (default none: the painted pores stand in for them). */
  pits?: number;
  /** Dark pores dotted over the faces, per texel of face (default 0.09: most 3 × 3 faces get one, some two or none). */
  speckle?: number;
  /** Quarter turns about +Y. */
  turn?: number;
  /** Add a collision box when the chunk is at least this wide (metres, default 0.3). */
  collide?: number;
}

/** Split n texels into sub-block spans of 2–4 texels (the sheet's chunks are a few cubes a side). */
function spans(n: number, r: Rng): number[] {
  if (n <= 3) return [0, n];
  const parts = Math.max(2, Math.round(n / 3.2));
  const cuts = [0];
  for (let s = 1; s < parts; s++) cuts.push(Math.round((n * s) / parts + r.range(-0.45, 0.45)));
  cuts.push(n);
  return cuts;
}

/**
 * The sub-blocks of a broken chunk about `size` big: a bottom course of a few
 * blocks (sometimes a corner gone), smaller blocks stacked towards the back,
 * tops and outer faces set in by a texel here and there so no two chunks match.
 */
export function fragmentBlocks(size: number | readonly [number, number, number], seed: number): TexelBox[] {
  const r = rng(seed * 7 + 3);
  const [W, H, D] = dims(size, 0.7);
  const w = Math.max(1, Math.round(W / TEXEL));
  const h = Math.max(1, Math.round(H / TEXEL));
  const d = Math.max(1, Math.round(D / TEXEL));
  const xs = spans(w, r);
  const zs = spans(d, r);
  const ys = spans(h, r);
  const nx = xs.length - 1;
  const nz = zs.length - 1;
  const ny = ys.length - 1;
  const occ = new Set<number>();
  const id = (a: number, l: number, c: number) => (l * 8 + a) * 8 + c;
  for (let a = 0; a < nx; a++) for (let c = 0; c < nz; c++) occ.add(id(a, 0, c));
  // A front corner broken away from the bottom course.
  if (nx * nz >= 3 && r.chance(0.4)) occ.delete(r.chance(0.5) ? id(nx - 1, 0, nz - 1) : r.chance(0.5) ? id(0, 0, nz - 1) : id(nx - 1, 0, 0));
  for (let l = 1; l < ny; l++) {
    let any = false;
    for (let a = 0; a < nx; a++)
      for (let c = 0; c < nz; c++) {
        if (!occ.has(id(a, l - 1, c))) continue;
        // Upper blocks lean to the back (−x, −z), so the stepped front shows.
        const back = (a < nx / 2 ? 0.2 : 0) + (c < nz / 2 ? 0.2 : 0);
        if (r.chance((l === 1 ? 0.4 : 0.25) + back)) {
          occ.add(id(a, l, c));
          any = true;
        }
      }
    if (!any) {
      // At least one block per course: the back-most one standing on stone.
      for (let s = 0; s < nx + nz && !any; s++)
        for (let a = 0; a < nx && !any; a++) {
          const c = s - a;
          if (c >= 0 && c < nz && occ.has(id(a, l - 1, c))) {
            occ.add(id(a, l, c));
            any = true;
          }
        }
    }
  }
  const ox = Math.floor(w / 2);
  const oz = Math.floor(d / 2);
  const out: TexelBox[] = [];
  for (let l = 0; l < ny; l++)
    for (let a = 0; a < nx; a++)
      for (let c = 0; c < nz; c++) {
        if (!occ.has(id(a, l, c))) continue;
        let [x0, x1, z0, z1] = [xs[a], xs[a + 1], zs[c], zs[c + 1]];
        let y1 = ys[l + 1];
        const capped = occ.has(id(a, l + 1, c));
        if (!capped && y1 - ys[l] >= 2 && r.chance(0.35)) y1--;
        // Outer faces set in a texel (not under a block above, so stacks stay supported).
        if (!capped && x1 - x0 >= 3) {
          if (a === 0 && r.chance(0.3)) x0++;
          else if (a === nx - 1 && r.chance(0.3)) x1--;
        }
        if (!capped && z1 - z0 >= 3) {
          if (c === 0 && r.chance(0.3)) z0++;
          else if (c === nz - 1 && r.chance(0.3)) z1--;
        }
        out.push([x0 - ox, ys[l], z0 - oz, x1 - ox, y1, z1 - oz]);
      }
  // A single small cube gets a chip beside it or a smaller cube on top.
  if (out.length === 1 && w >= 2 && d >= 2) {
    const [x0, , z0, x1, top, z1] = out[0];
    if (r.chance(0.5)) {
      const side = r.int(0, 3);
      const [cx, cz] = side === 0 ? [x1, r.int(z0, z1 - 1)] : side === 1 ? [x0 - 1, r.int(z0, z1 - 1)] : side === 2 ? [r.int(x0, x1 - 1), z1] : [r.int(x0, x1 - 1), z0 - 1];
      out.push([cx, 0, cz, cx + 1, 1, cz + 1]);
    } else if (r.chance(0.5)) {
      const [cx, cz] = [x0 + r.int(0, 1), z0 + r.int(0, 1)];
      out.push([cx, top, cz, cx + x1 - x0 - 1, top + Math.max(1, top - 1), cz + z1 - z0 - 1]);
    }
  }
  return out;
}

/** Turn a texel box about +Y in quarter turns (turn 1 maps +Z to +X). */
function turnBox(bx: TexelBox, turn: number): TexelBox {
  let [x0, y0, z0, x1, y1, z1] = bx;
  for (let t = 0; t < (turn & 3); t++) [x0, z0, x1, z1] = [z0, -x1, z1, -x0];
  return [Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1)];
}

/** Outward normals of the faces a chunk shows: the top and the four sides. */
const FACES: readonly (readonly [number, number, number])[] = [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
/** A cell and its six neighbours (pores keep a texel apart). */
const NEAR: readonly (readonly [number, number, number])[] = [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/**
 * A broken sandstone chunk on a piece: its sub-blocks laid as a {@link BlockSet}
 * on the texel grid (each block its own tone, so the chunk reads as the sheet's
 * little heap of cubes), then chipped along its edges and bitten at the top —
 * the faces that exposes take the broken-stone tones — and dotted with the
 * sheet's dark pores. The bottom course is never chipped, so the chunk sits
 * flat. Returns its bounds (metres).
 */
export function fragment(p: PieceBuilder, o: FragmentOptions): StoneBounds {
  const seed = o.seed ?? 1;
  const r = rng(seed * 13 + 1);
  const f = o.finish ?? FRAGMENT_FINISH;
  const surf: Surf = [0, f.surf[1], f.surf[2], f.surf[3]];
  const broken = o.broken ?? ROCK.debrisBroken;
  const blocks = (o.blocks ?? fragmentBlocks(o.size ?? 0.25, seed)).map((bx) => turnBox(bx, o.turn ?? 0));
  const [ax, ay, az] = [snap(o.at[0]), snap(o.at[1]), snap(o.at[2])];
  const set = new BlockSet(TEXEL);
  const b = emptyBounds();
  const tone = r.int(0, f.palette.length - 1);
  blocks.forEach(([x0, y0, z0, x1, y1, z1], n) => {
    // Neighbouring blocks step through the palette, so each cube shows its own tone.
    const color = f.palette[(tone + n * 2 + (r.chance(0.3) ? 1 : 0)) % f.palette.length];
    set.add(ax + x0 * TEXEL, ay + y0 * TEXEL, az + z0 * TEXEL, ax + x1 * TEXEL, ay + y1 * TEXEL, az + z1 * TEXEL, color, { surf, broken });
    grow(b, ax + x0 * TEXEL, ay + y0 * TEXEL, az + z0 * TEXEL, ax + x1 * TEXEL, ay + y1 * TEXEL, az + z1 * TEXEL);
  });
  if (!blocks.length) return b;
  // Cell centre (metres) of texel (i, j, k) of the chunk, and whether it is stone.
  const at = (i: number, j: number, k: number): [number, number, number] => [ax + (i + 0.5) * TEXEL, ay + (j + 0.5) * TEXEL, az + (k + 0.5) * TEXEL];
  const solid = (i: number, j: number, k: number) => set.solidAt(...at(i, j, k));
  // A spot (u, v texels in) on each face of a sub-block: texel coordinates of the cell under it.
  const onFace = ([x0, y0, z0, x1, y1, z1]: TexelBox, [nx, ny, nz]: readonly [number, number, number], u: number, v: number): [number, number, number] =>
    nx ? [nx > 0 ? x1 - 1 : x0, y0 + v, z0 + u] : ny ? [x0 + u, y1 - 1, z0 + v] : [x0 + u, y0 + v, nz > 0 ? z1 - 1 : z0];
  const spanOf = ([x0, y0, z0, x1, y1, z1]: TexelBox, [nx, ny]: readonly [number, number, number]): [number, number] => (nx ? [z1 - z0, y1 - y0] : ny ? [x1 - x0, z1 - z0] : [x1 - x0, y1 - y0]);
  // Pits: single texels dug out of the faces of the bigger cubes — broken-open pores.
  const pits = new Set<string>();
  const cell = (x: number, y: number, z: number) => `${Math.floor(x / TEXEL)},${Math.floor(y / TEXEL)},${Math.floor(z / TEXEL)}`;
  const density = o.pits ?? 0;
  for (const box of blocks)
    for (const face of FACES) {
      const [su, sv] = spanOf(box, face);
      if (su < 4 || sv < 4 || !r.chance(density)) continue;
      const [i, j, k] = onFace(box, face, 1 + r.int(0, su - 3), 1 + r.int(0, sv - 3));
      // (only on open faces, and never through the bottom course)
      if (j === 0 || solid(i + face[0], j + face[1], k + face[2])) continue;
      pits.add(cell(...at(i, j, k)));
    }
  if (pits.size) set.carve((x, y, z) => pits.has(cell(x, y, z)), b);
  const w = Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]);
  // Bites out of the upper edges of bigger chunks: the broken-off corners.
  const bites = o.bites ?? (w >= 0.3 ? r.int(0, 1) : 0);
  for (let n = 0; n < bites; n++) {
    const x = r.chance(0.5) ? b.min[0] : b.max[0];
    const z = r.chance(0.5) ? b.min[2] : b.max[2];
    set.carveSphere(x + r.range(-0.4, 0.4) * TEXEL, b.max[1] - r.range(0, 1.5) * TEXEL, z + r.range(-0.4, 0.4) * TEXEL, TEXEL * r.range(1.3, 2.2), seed + n * 5);
  }
  set.erode(o.wear ?? f.wear, seed + 11, { where: (_x, y) => y > ay + TEXEL });
  set.emit(p.voxels, { seed });
  const moss = mossCushions(p, set, b, o.moss ?? f.surf[0], seed, o.mossTones);
  // Dark pores painted on the faces (thin plates): the sheet's dark dots,
  // scattered anywhere on a face — most cube faces get one, some two or none,
  // a few run two texels — kept off moss and off each other, and trimmed clear
  // of the cube's rounded edges (a pore on an edge texel comes out smaller).
  const dots = new Set<string>();
  const speckle = o.speckle ?? 0.09;
  for (const box of blocks)
    for (const face of FACES) {
      const [su, sv] = spanOf(box, face);
      if (su < 2 || sv < 2) continue;
      const [dx, dy, dz] = face;
      // (no rim: only the face a pore lies on counts as open, so it reads as a hole, not a stud)
      const open = dy ? 4 : dx ? (dx > 0 ? 1 : 2) : dz > 0 ? 16 : 32;
      const spot = (i: number, j: number, k: number) => `${i},${j},${k},${dx},${dy},${dz}`;
      const taken = (i: number, j: number, k: number) => NEAR.some(([a, b, c]) => dots.has(spot(i + a, j + b, k + c)));
      // (the face's flat part: the sub-block less its bevel, 10 % of its thinnest side)
      const bevel = Math.min(box[3] - box[0], box[4] - box[1], box[5] - box[2]) * TEXEL * 0.1 + 0.002;
      const flat0 = [ax + box[0] * TEXEL + bevel, ay + box[1] * TEXEL + bevel, az + box[2] * TEXEL + bevel];
      const flat1 = [ax + box[3] * TEXEL - bevel, ay + box[4] * TEXEL - bevel, az + box[5] * TEXEL - bevel];
      for (let n = Math.floor(su * sv * speckle + r() * 1.2); n > 0; n--) {
        const [u, v] = [r.int(0, su - 1), r.int(0, sv - 1)];
        // (a long pore runs along the face's first axis)
        const len = u < su - 1 && r.chance(0.25) ? 2 : 1;
        const cells = Array.from({ length: len }, (_, e) => onFace(box, face, u + e, v));
        if (cells.some(([i, j, k]) => !solid(i, j, k) || solid(i + dx, j + dy, k + dz) || moss.has(spot(i, j, k)) || taken(i, j, k))) continue;
        const color = PORES[Math.floor(hash3(u, v, n, seed) * PORES.length)];
        for (const [i, j, k] of cells) {
          dots.add(spot(i, j, k));
          const lo = [ax + i * TEXEL, ay + j * TEXEL, az + k * TEXEL];
          const hi = [lo[0] + TEXEL, lo[1] + TEXEL, lo[2] + TEXEL];
          face.forEach((d, a) => {
            if (d > 0) [lo[a], hi[a]] = [hi[a], hi[a] + 0.003];
            else if (d < 0) [lo[a], hi[a]] = [lo[a] - 0.003, lo[a]];
            else [lo[a], hi[a]] = [Math.max(lo[a], flat0[a]), Math.min(hi[a], flat1[a])];
          });
          if (hi.every((h, a) => h > lo[a])) p.voxels.span(lo[0], lo[1], lo[2], hi[0], hi[1], hi[2], color, 'sandstone', { open });
        }
      }
    }
  if (w >= (o.collide ?? 0.3)) p.collider(b.min[0], b.min[1], b.min[2], b.max[0], b.max[1], b.max[2]);
  return b;
}

/** Thickness of the moss laid over stone (metres): a coat that catches the light, thicker on the tops' cushions. */
const MOSS_COAT = 0.008;
const MOSS_CUSHION = 0.016;

/**
 * Moss over a stone, as the §20 sheet paints it: patches on the exposed tops
 * (mossier the higher they are), thickest in their middle, that hang a texel or
 * three down the open sides below them in ragged curtains. Each patch is a thin
 * leaf-textured plate on the stone's face, in `tones` (dark → light; the
 * sheet's yellow-olive by default); top plates merge along x. Returns the faces
 * it covered (`i,j,k,dx,dy,dz`).
 */
function mossCushions(p: PieceBuilder, set: BlockSet, b: StoneBounds, amount: number, seed: number, tones: readonly number[] = DEBRIS_MOSS): Set<string> {
  const covered = new Set<string>();
  if (amount <= 0) return covered;
  const T = TEXEL;
  const solid = (i: number, j: number, k: number) => set.solidAt((i + 0.5) * T, (j + 0.5) * T, (k + 0.5) * T);
  const [i0, j0, k0] = [Math.round(b.min[0] / T), Math.round(b.min[1] / T), Math.round(b.min[2] / T)];
  const [i1, j1, k1] = [Math.round(b.max[0] / T), Math.round(b.max[1] / T), Math.round(b.max[2] / T)];
  const surf = leafSurf({ yellow: 0.12 });
  // Tones in soft patches, dark to yellow; the cushions a step brighter.
  const tone = (i: number, j: number, k: number, lift: number) => tones[Math.max(0, Math.min(tones.length - 1, Math.floor((valueNoise3(i * 0.55, j * 0.55, k * 0.55, seed + 3) * 0.75 + hash3(i, j, k, seed + 3) * 0.25) * tones.length + lift)))];
  // Growth on a top: noise patches, more of it higher up.
  const growth = (i: number, j: number, k: number) => valueNoise3(i * 0.6, j * 0.4, k * 0.6, seed) * 0.72 + hash3(i, j, k, seed) * 0.28 + ((j - j0) / Math.max(1, j1 - j0)) * 0.2;
  const mossy = (i: number, j: number, k: number) => solid(i, j, k) && !solid(i, j + 1, k) && growth(i, j, k) >= 1.1 - amount;
  const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  for (let j = j1 - 1; j >= j0; j--)
    for (let k = k0; k < k1; k++) {
      let run: { i: number; color: number; thick: number } | null = null;
      const flush = (end: number) => {
        if (run) p.voxels.span(run.i * T, (j + 1) * T, k * T, end * T, (j + 1) * T + run.thick, (k + 1) * T, run.color, 'leaves', { surf });
        run = null;
      };
      for (let i = i0; i <= i1; i++) {
        if (i === i1 || !mossy(i, j, k)) {
          flush(i);
          continue;
        }
        covered.add(`${i},${j},${k},0,1,0`);
        // A cushion where the patch is thick (all four neighbours mossy too), a coat at its rim.
        const inner = sides.every(([dx, dz]) => mossy(i + dx, j, k + dz));
        const thick = inner && growth(i, j, k) > 1.25 - amount ? MOSS_CUSHION : MOSS_COAT;
        const color = tone(i, j, k, thick > MOSS_COAT ? 1.6 : 0.8);
        if (!run || run.color !== color || run.thick !== thick) {
          flush(i);
          run = { i, color, thick };
        }
        // Curtains down the open sides below the patch: lengths vary smoothly along the edge.
        for (const [dx, dz] of sides) {
          if (solid(i + dx, j, k + dz)) continue;
          const len = Math.floor(valueNoise3((i + dx * 0.5) * 0.7, j * 0.3, (k + dz * 0.5) * 0.7, seed + 9) * (1 + amount * 4.2));
          for (let m = 0; m < len; m++) {
            const jj = j - m;
            if (!solid(i, jj, k) || solid(i + dx, jj, k + dz)) break;
            covered.add(`${i},${jj},${k},${dx},0,${dz}`);
            const x = (i + 0.5 + dx * 0.5) * T + (dx * MOSS_COAT) / 2;
            const z = (k + 0.5 + dz * 0.5) * T + (dz * MOSS_COAT) / 2;
            p.voxels.box(x, (jj + 0.5) * T, z, dx ? MOSS_COAT : T, T, dz ? MOSS_COAT : T, tone(i, jj, k, 0.8 - m * 0.7), 'leaves', { surf });
          }
        }
      }
    }
  return covered;
}

// ── Groups ───────────────────────────────────────────────────────────────────

export interface ScatterOptions {
  /** Centre of the area on the ground (metres, default the origin). */
  at?: readonly [number, number, number];
  /** Area (metres). */
  w: number;
  d: number;
  /** Widths (metres) of the stones to place (placed biggest first)… */
  sizes?: readonly number[];
  /** …or this many stones with widths in `size`, most of them near the small end. */
  count?: number;
  size?: readonly [number, number];
  seed: number;
  /** Natural rocks (default) or broken sandstone fragments. */
  kind?: 'rock' | 'fragment';
  /** Height as a share of the width (± 25 %; default 0.6 rocks, 0.7 fragments). */
  height?: number;
  /** Free space between stones as a share of their widths (default 0.2). */
  gap?: number;
  /** Let stones reach past the area's edge (a tile clips them flush with its sides). */
  overhang?: boolean;
  /** Keep stones off spots (area-relative metres, with the stone's radius). */
  avoid?: (x: number, z: number, r: number) => boolean;
  /** Options for every rock / fragment (palette, moss, sink, clip…). */
  rock?: Partial<Omit<RockOptions, 'at' | 'size' | 'seed'>>;
  fragment?: Partial<Omit<FragmentOptions, 'at' | 'size' | 'seed' | 'blocks'>>;
}

/** A stone placed by {@link scatterRocks}. */
export interface PlacedStone {
  x: number;
  z: number;
  /** Width and height (metres). */
  w: number;
  h: number;
  seed: number;
  bounds: StoneBounds;
}

/**
 * Scatter a group of rocks or fragments over an area: sizes skewed small, the
 * big ones placed first, each clear of the others. Returns what it placed (for
 * moss around the stones, more detail).
 */
export function scatterRocks(p: PieceBuilder, o: ScatterOptions): PlacedStone[] {
  const r = rng(o.seed * 101 + 17);
  const [cx, cy, cz] = o.at ?? [0, 0, 0];
  const kind = o.kind ?? 'rock';
  const [s0, s1] = o.size ?? [0.08, 0.3];
  const sizes = (o.sizes ?? Array.from({ length: o.count ?? 8 }, () => s0 + (s1 - s0) * Math.pow(r(), 2.2))).slice().sort((a, b) => b - a);
  const gap = o.gap ?? 0.2;
  const placed: PlacedStone[] = [];
  sizes.forEach((w, n) => {
    const room = o.overhang ? 0 : w;
    for (let t = 0; t < 60; t++) {
      const x = cx + (r() - 0.5) * Math.max(0, o.w - room);
      const z = cz + (r() - 0.5) * Math.max(0, o.d - room);
      if (o.avoid?.(x - cx, z - cz, w / 2)) continue;
      if (placed.some((s) => Math.hypot(s.x - x, s.z - z) < ((s.w + w) / 2) * (1 + gap))) continue;
      const h = w * (o.height ?? (kind === 'rock' ? 0.6 : 0.7)) * r.range(0.75, 1.25);
      const seed = o.seed * 1000 + n * 37 + 5;
      const bounds =
        kind === 'fragment'
          ? fragment(p, { ...o.fragment, at: [x, cy, z], size: [w, h, w * r.range(0.75, 1.1)], seed, turn: r.int(0, 3) })
          : rock(p, { ...o.rock, at: [x, cy, z], size: [w, h, w * r.range(0.8, 1.15)], seed });
      placed.push({ x, z, w, h, seed, bounds });
      return;
    }
  });
  return placed;
}
