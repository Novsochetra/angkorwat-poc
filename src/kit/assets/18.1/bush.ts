import { hash3, valueNoise3 } from '../../../voxel/random';
import { BlockSet } from '../../BlockSet';
import { fromSheet } from '../../palette';
import { PieceBuilder } from '../../PieceBuilder';
import { rng, TEXEL, type Rng } from '../../shapes';
import { barkSurf, leafSurf, stoneSurf } from '../../surface';
import { defineKitAsset, type KitPiece } from '../../types';
import { blossoms, cellKey, CellSet, DOWN, LEAF_CELL, leafMass, pickT, sheetTone, UP, type LeafLook, type LeafPlus } from './_samples';

/**
 * §18.1 ⑤ Bush — a low, wide, rounded mound of distinct leaf clumps, as on
 * the sheet: the tallest clump just left of the middle, a green one behind it
 * to the right, lower ones at the far left, in front and at the far right,
 * with dark creases between them. Each clump is a round ball of 1/8 m leaf
 * cells on a short woody stem, its skin broken into plus-shaped leaf
 * clusters — bright yellow-green where the sun hits its top, mid greens down
 * its sides, dark teal underneath. Pale sandstone blocks lie tucked in at the
 * foot: a pile of three at the front left, a stepped heap at the right,
 * strays in front and a pair behind, some mossy; moss, crumbs of soil and
 * grass tufts round the base.
 */
const C = LEAF_CELL;
const T = TEXEL;
const S = (...hex: number[]) => hex.map(sheetTone);

/** The default bush stands 1.6 m (real bushes 1–2 m); `height` scales it. */
const HEIGHT = 1.6;

/** A clump's leaves: sunlit top, lit upper sides, mid greens, the shaded underside, the gaps. */
interface BushLook extends LeafLook {
  top: readonly number[];
}

/**
 * Leaf looks of the sheet's clumps (measure.py on its front view): bright
 * yellow-green crowns, olive upper sides, cool dark greens lower down and in
 * the gaps — the lit tones a tenth and the shadows a fifth darker than
 * sampled, like the leaf cubes, since the studio lights shaded sides more
 * than the sheet does (checked on the whole card's median and tones).
 */
const LOOK = {
  /** Sunlit yellow-green: the tall clump and the far-left one. */
  sun: { top: S(0x9ea82a, 0x92a226, 0xaab030), light: S(0x7c8e22, 0x74882a, 0x82942a), mid: S(0x40602a, 0x48672c, 0x3c5c2c), deep: S(0x1c3420, 0x183019, 0x1f3822), gap: sheetTone(0x0a180c), surf: leafSurf() },
  /** Mid green, bluer in the shade: the clump behind and the far-right one. */
  green: { top: S(0x8e9c30, 0x86962e, 0x96a236), light: S(0x617834, 0x5a7234, 0x687e38), mid: S(0x2f5232, 0x365a34, 0x2c4e30), deep: S(0x152e22, 0x19362a, 0x122a1e), gap: sheetTone(0x0a1c17), surf: leafSurf() },
  /** Cool, teal-shaded: the low clump in front. */
  teal: { top: S(0x88a04a, 0x90a24c, 0x80984a), light: S(0x64824a, 0x5c7c48, 0x6c884c), mid: S(0x365e42, 0x305a40, 0x3a6246), deep: S(0x16352c, 0x12302a, 0x1a3a30), gap: sheetTone(0x0a1b1b), surf: leafSurf() },
} satisfies Record<string, BushLook>;

/** Pale sandstone of the sheet's stones: pinkish tan in the sun, some greyer (lit faces, fromSheet). */
const STONE = [0xc69e77, 0xd3a67d, 0xbca28a, 0xb09c8a, 0xc4a283].map(fromSheet);
const STEM = S(0x5e4028, 0x6e4c30, 0x523822);
const MOSS = S(0x6f8a2c, 0x5f7a2a, 0x7f9a32, 0x4f6a26, 0x8fa438);
const GRASS = S(0x6f9a30, 0x86a838, 0x5d8a2c, 0x9ab43c);
const DIRT = S(0x9a6238, 0x86562f, 0xa8703f);

interface Clump {
  /** Centre (metres): footprint x, z and the height of its widest part. */
  x: number;
  y: number;
  z: number;
  /** Radius, and how far it reaches above and below the centre (metres). */
  r: number;
  up: number;
  down: number;
  look: BushLook;
}

/** A stone: footprint centre and size (metres, at the default height); `on`: it rests on the stones below. */
interface Stone {
  x: number;
  z: number;
  w: number;
  h: number;
  d: number;
  on?: boolean;
}

// The relief (proud leaf clusters) adds about a cell to every clump.
const CLUMPS: Clump[] = [
  // The tall sunlit one just left of the middle, and the green one behind it to the right.
  { x: -0.2, y: 1.02, z: -0.2, r: 0.64, up: 0.46, down: 0.44, look: LOOK.sun },
  { x: 0.56, y: 0.9, z: -0.42, r: 0.52, up: 0.42, down: 0.42, look: LOOK.green },
  // Low ones: far left, in front, far right; two filling the back.
  { x: -1.02, y: 0.52, z: 0.06, r: 0.44, up: 0.4, down: 0.4, look: LOOK.sun },
  { x: 0.06, y: 0.48, z: 0.42, r: 0.48, up: 0.4, down: 0.4, look: LOOK.teal },
  { x: 1.1, y: 0.46, z: -0.02, r: 0.4, up: 0.36, down: 0.38, look: LOOK.green },
  { x: -0.74, y: 0.6, z: -0.6, r: 0.42, up: 0.36, down: 0.42, look: LOOK.green },
  { x: 0.28, y: 0.5, z: -0.92, r: 0.4, up: 0.34, down: 0.4, look: LOOK.teal },
];

/** The shrub: one rounded mound of clumps on the ground, no stones. */
const SHRUB: Clump[] = [
  { x: 0, y: 0.62, z: -0.12, r: 0.6, up: 0.46, down: 0.54, look: LOOK.green },
  { x: -0.62, y: 0.4, z: 0.26, r: 0.42, up: 0.36, down: 0.36, look: LOOK.sun },
  { x: 0.58, y: 0.38, z: 0.28, r: 0.4, up: 0.34, down: 0.34, look: LOOK.teal },
  { x: 0.2, y: 0.42, z: -0.76, r: 0.38, up: 0.32, down: 0.38, look: LOOK.sun },
];

const STONES: Stone[] = [
  // Front left, between the far-left clump and the front one: two side by side, a long one across them.
  { x: -0.7, z: 0.68, w: 0.3125, h: 0.1875, d: 0.3125 },
  { x: -0.38, z: 0.74, w: 0.3125, h: 0.1875, d: 0.3125 },
  { x: -0.56, z: 0.7, w: 0.5, h: 0.1875, d: 0.3125, on: true },
  // Right, before the green clumps: a stepped heap of three courses.
  { x: 0.82, z: 0.46, w: 0.375, h: 0.25, d: 0.3125 },
  { x: 1.2, z: 0.42, w: 0.3125, h: 0.1875, d: 0.3125 },
  { x: 0.98, z: 0.38, w: 0.5, h: 0.1875, d: 0.3125, on: true },
  { x: 0.94, z: 0.3, w: 0.3125, h: 0.1875, d: 0.25, on: true },
  // Strays in front.
  { x: 0.42, z: 0.96, w: 0.25, h: 0.125, d: 0.1875 },
  { x: 1.4, z: 0.76, w: 0.1875, h: 0.125, d: 0.25 },
  { x: 0.02, z: 1.0, w: 0.1875, h: 0.0625, d: 0.125 },
  // Behind: a pair, seen from the side.
  { x: 0.86, z: -0.92, w: 0.375, h: 0.25, d: 0.3125 },
  { x: 0.84, z: -0.88, w: 0.25, h: 0.1875, d: 0.25, on: true },
];

/** |t|^2.2: a ball a touch squarer than round, like the sheet's voxel clumps. */
const p22 = (t: number) => Math.abs(t) ** 2.2;

/** Height of a tier of leaves (metres): three cells. */
const TIER = 3 * C;

/**
 * How far a point (metres) lies into a clump: < 1 inside, before the lumps.
 * The underside narrows towards the stem, so a clump sits on it like a
 * little canopy instead of a drum, and the leaves hang in tiers like the
 * sheet's: each tier flares out at its foot and overhangs the one below.
 */
function clumpDist(c: Clump, x: number, y: number, z: number): number {
  const dy = y - c.y;
  const f = (((dy + c.up) / TIER) % 1 + 1) % 1;
  const w = c.r * (dy < 0 ? 1 + (0.3 * dy) / c.down : 1) * (1.09 - 0.18 * f);
  return p22((x - c.x) / w) + p22(dy / (dy > 0 ? c.up : c.down)) + p22((z - c.z) / (w * 0.92));
}

function build(variant: string, seed: number, height = HEIGHT): KitPiece {
  const k = height / HEIGHT;
  const p = new PieceBuilder();
  const r = rng(seed * 31 + 7);
  // Each seed nudges the clumps a little: no two bushes alike.
  const clumps = (variant === 'shrub' ? SHRUB : CLUMPS).map((c) => {
    const f = r.range(0.92, 1.08);
    const tall = r.range(0.94, 1.06);
    return { ...c, x: (c.x + r.range(-0.07, 0.07)) * k, z: (c.z + r.range(-0.07, 0.07)) * k, y: c.y * tall * k, r: c.r * f * k, up: c.up * tall * k, down: c.down * k };
  });
  const stones = variant === 'shrub' ? [] : variant === 'flowering' ? STONES.slice(0, 3).concat(STONES.slice(7, 9)) : STONES;

  // Stones: sandstone blocks with moss on top and a chipped corner or two (scaled with the bush, on the texel grid).
  const set = new BlockSet(T);
  const sz = (v: number) => Math.max(T, Math.round((v * k) / T) * T);
  const boxes: (readonly [number, number, number, number, number, number])[] = [];
  for (const s of stones) {
    const x0 = Math.round((s.x - s.w / 2) * k / T) * T;
    const z0 = Math.round((s.z - s.d / 2) * k / T) * T;
    const [x1, z1] = [x0 + sz(s.w), z0 + sz(s.d)];
    const y0 = s.on ? Math.max(0, ...boxes.filter((b) => b[0] < x1 && b[3] > x0 && b[2] < z1 && b[5] > z0).map((b) => b[4])) : 0;
    boxes.push([x0, y0, z0, x1, y0 + sz(s.h), z1]);
  }
  boxes.forEach((b, n) => {
    const color = STONE[Math.floor(hash3(n, 1, 2, seed) * STONE.length)];
    set.add(...b, color, { surf: stoneSurf({ moss: hash3(n, 3, 4, seed) < 0.5 ? 0.45 : 0.15, lichen: 0.2, stain: 0.3, crack: 0.1 }) });
  });
  boxes.forEach((b, n) => {
    if (hash3(n, 5, 6, seed) < 0.35) set.carveSphere(hash3(n, 7, 1, seed) < 0.5 ? b[0] : b[3], b[4], hash3(n, 8, 1, seed) < 0.5 ? b[2] : b[5], 0.09, seed + n);
  });
  set.emit(p.voxels, { seed });
  for (const b of boxes) p.collider(...b);
  const inStone = (x: number, y: number, z: number) => boxes.some((b) => x > b[0] - 0.02 && x < b[3] + 0.02 && y > b[1] - 0.02 && y < b[4] + 0.02 && z > b[2] - 0.02 && z < b[5] + 0.02);

  // A short woody stem under each clump, reaching up into its leaves (it shows in the shade beneath).
  const stems: (readonly [number, number, number, number, number])[] = [];
  for (const c of clumps) {
    const w = c.r > 0.55 * k ? 4 * T : 3 * T;
    const sx = Math.round((c.x + c.r * 0.08) / T) * T;
    const sz = Math.round((c.z + c.r * 0.12) / T) * T;
    if (inStone(sx, 0.05, sz)) continue;
    const stem = [sx - w / 2, sz - w / 2, sx + w / 2, sz + w / 2, c.y - c.down * 0.4] as const;
    stems.push(stem);
    p.voxels.span(stem[0], 0, stem[1], stem[2], stem[4], stem[3], r.pick(STEM), 'trunk', { surf: barkSurf({ moss: 0.3, stain: 0.3 }) });
  }
  const inStem = (x: number, y: number, z: number) => stems.some(([x0, z0, x1, z1, y1]) => x > x0 - 0.02 && x < x1 + 0.02 && z > z0 - 0.02 && z < z1 + 0.02 && y < y1);
  const blockedAt = (x: number, y: number, z: number) => inStone(x, y, z) || inStem(x, y, z);

  // The leaves: each cell goes to the clump it lies deepest in; where two
  // clumps meet near their skins a crease is left open, so they read apart.
  const g = p.voxels.grid({ cell: C, origin: [0, 0, 0], mat: 'leaves', jitter: 0.07, ao: 0.5, seed });
  const solid = new CellSet();
  const owner = new Map<number, number>();
  const x0 = Math.min(...clumps.map((c) => c.x - c.r * 1.3));
  const x1 = Math.max(...clumps.map((c) => c.x + c.r * 1.3));
  const z0 = Math.min(...clumps.map((c) => c.z - c.r * 1.3));
  const z1 = Math.max(...clumps.map((c) => c.z + c.r * 1.3));
  const y1 = Math.max(...clumps.map((c) => c.y + c.up * 1.3));
  for (let i = Math.floor(x0 / C); i <= Math.ceil(x1 / C); i++)
    for (let j = 0; j <= Math.ceil(y1 / C); j++)
      for (let q = Math.floor(z0 / C); q <= Math.ceil(z1 / C); q++) {
        const [x, y, z] = [(i + 0.5) * C, (j + 0.5) * C, (q + 0.5) * C];
        let best = -1;
        let d1 = Infinity;
        let d2 = Infinity;
        clumps.forEach((c, n) => {
          // (The lumps change the distance by a third at most: skip clumps that can't reach this cell.)
          const d0 = clumpDist(c, x, y, z);
          if (d0 > 1.55) return;
          // Lumpy: a slow swell and finer bumps (seeded per clump).
          const lump = (valueNoise3(x * 3.4, y * 3.4, z * 3.4, seed + n * 17) - 0.5) * 0.4 + (valueNoise3(x * 8, y * 8, z * 8, seed + n * 17 + 1) - 0.5) * 0.22;
          const d = d0 / (1 + lump);
          if (d < d1) {
            d2 = d1;
            d1 = d;
            best = n;
          } else if (d < d2) d2 = d;
        });
        if (d1 > 1) continue;
        // (Not through the crowns, though: there a crease would read as a pit.)
        const crease = d2 - d1 < 0.16 && d1 > 0.4 && y < clumps[best].y + clumps[best].up * 0.3;
        if (crease || blockedAt(x, y, z)) continue;
        solid.add(i, j, q);
        owner.set(cellKey(i, j, q), best);
      }
  const clumpOf = (i: number, j: number, q: number) => clumps[owner.get(cellKey(i, j, q)) ?? 0];
  // Sunlit crowns (the proud clusters brightest), lit ledges lower down; the
  // sides light above, mid greens lower down, the shaded underside.
  const tone = (pl: LeafPlus, i: number, j: number, q: number) => {
    const c = clumpOf(i, j, q);
    const L = c.look;
    if (pl.dir === DOWN) return pickT(L.deep, pl.t);
    const up = ((j + 0.5) * C - (c.y - c.down)) / (c.up + c.down);
    const s = up + (pl.depth > 0 ? 0.14 : 0) + (pl.t - 0.5) * 0.45;
    if (pl.dir === UP) return s > 0.78 ? pickT(L.top, pl.t) : pickT(L.light, pl.t);
    return s > 0.5 ? pickT(L.light, pl.t) : s > 0.2 ? pickT(L.mid, pl.t) : pickT(L.deep, pl.t);
  };
  const surf = leafSurf({ flowers: variant === 'flowering' ? 0.06 : 0 });
  const { pluses } = leafMass(g, solid, {
    look: { ...LOOK.green, surf },
    seed,
    sink: 0.08,
    raise: (d) => (d === UP ? 0.4 : d === DOWN ? 0 : 0.36),
    floor: 0,
    tone,
    centre: (i, j, q) => {
      const c = clumpOf(i, j, q);
      return [c.x / C, c.y / C, c.z / C];
    },
    blocked: (i, j, q) => blockedAt((i + 0.5) * C, (j + 0.5) * C, (q + 0.5) * C),
  });
  // A few leaves dangle from the undersides into the shade below.
  for (const [i, j, q] of solid.values()) {
    if (j < 2 || solid.has(i, j - 1, q) || g.has(i, j - 1, q) || hash3(i, j, q, seed + 3) > 0.22) continue;
    if (!blockedAt((i + 0.5) * C, (j - 0.5) * C, (q + 0.5) * C)) g.set(i, j - 1, q, pickT(clumpOf(i, j, q).look.deep, hash3(i, 1, q, seed)), 'leaves', 1, surf);
  }
  g.commit();
  if (variant === 'flowering') blossoms(p, g, pluses, r, { [UP]: 5, 4: 4, 0: 3, 1: 1, 5: 1 }, false);

  groundCover(p, r, clumps, blockedAt);
  // The mound blocks where it is dense: a low box over the big clumps' feet.
  const core = clumps.filter((c) => c.y > 0.8 * k || variant === 'shrub');
  p.collider(Math.min(...core.map((c) => c.x - c.r * 0.7)), 0, Math.min(...core.map((c) => c.z - c.r * 0.7)), Math.max(...core.map((c) => c.x + c.r * 0.7)), 0.6 * k, Math.max(...core.map((c) => c.z + c.r * 0.7)));
  return p.done();
}

/**
 * The ground round the bush: moss creeping out between the stones and under
 * the clumps, crumbs of soil at the front, and tufts of grass at the ends,
 * like the sheet's base.
 */
function groundCover(p: PieceBuilder, r: Rng, clumps: Clump[], blocked: (x: number, y: number, z: number) => boolean): void {
  const b = p.voxels;
  const taken = new Set<string>();
  const cell = (x: number, z: number) => {
    const id = `${x},${z}`;
    if (taken.has(id) || blocked(x, T / 2, z)) return false;
    taken.add(id);
    return true;
  };
  for (let n = 0; n < 90; n++) {
    const c = r.pick(clumps);
    const a = r.range(0, Math.PI * 2);
    const d = c.r * r.range(0.6, 1.25);
    const x = Math.round((c.x + Math.sin(a) * d) / C) * C;
    const z = Math.round((c.z + Math.cos(a) * d) / C) * C;
    if (!cell(x, z)) continue;
    const h = r.chance(0.25) ? 2 * T : T;
    b.box(x, h / 2, z, C, h, C, r.pick(MOSS), 'leaves', { surf: leafSurf() });
  }
  // The ends and the front edge of the mound.
  const x0 = Math.min(...clumps.map((c) => c.x - c.r));
  const x1 = Math.max(...clumps.map((c) => c.x + c.r));
  const zf = Math.max(...clumps.map((c) => c.z + c.r * 0.8));
  const at = (u: number) => x0 + (x1 - x0) * u;
  for (let n = 0; n < 6; n++) {
    const x = Math.round(at(r.range(0.05, 0.6)) / T) * T;
    const z = Math.round((zf + r.range(-0.15, 0.25)) / T) * T;
    if (cell(x, z)) b.box(x, T / 4, z, T, T / 2, T, r.pick(DIRT), 'soil');
  }
  // Grass tufts: short blades fanning out from a point.
  for (const [tx, tz, n] of [
    [at(0.02), zf * 0.45, 11],
    [at(0.12), zf - 0.1, 8],
    [at(0.98), zf * 0.2, 10],
    [at(0.93), zf - 0.25, 7],
    [at(0.42), zf + 0.06, 6],
    [at(0.7), zf, 6],
  ]) {
    const cx = Math.round(tx / T) * T;
    const cz = Math.round(tz / T) * T;
    if (blocked(cx, T, cz)) continue;
    for (let q = 0; q < n; q++) {
      const h = r.int(2, 5) * T;
      const a = r.range(0, Math.PI * 2);
      const lean = r.range(0.1, 0.55);
      // Rooted round the tuft's centre, leaning outwards (Euler XYZ: rx, then rz).
      const [rx, rz] = [Math.cos(a) * lean, -Math.sin(a) * lean];
      const up = [-Math.sin(rz), Math.cos(rz) * Math.cos(rx), Math.cos(rz) * Math.sin(rx)];
      const [bx, bz] = [cx + Math.sin(a) * T, cz + Math.cos(a) * T];
      b.box(bx + (up[0] * h) / 2, (up[1] * h) / 2, bz + (up[2] * h) / 2, T, h, T, r.pick(GRASS), 'leaves', { surf: leafSurf(), rx, rz });
    }
  }
}

export default defineKitAsset({
  section: '18.1',
  order: 5,
  name: 'Bush',
  caption: 'Leafy clumps round a few fallen sandstone blocks.',
  size: {
    real: '≈1.65 m tall, ≈3.2 × 2.5 m; the shrub ≈1.15 m (bushes 1–2 m tall, 2–3.5 m wide)',
    sheet: '1–2 m',
    note: 'The sheet’s height is right; the clumps spread about twice as wide as they are tall, like the drawing. The stones are 0.2–0.5 m fallen blocks. `height` scales the whole bush, stones included.',
  },
  variants: [
    { id: 'bush', name: 'Bush with stones' },
    { id: 'shrub', name: 'Shrub' },
    { id: 'flowering', name: 'Flowering bush' },
  ],
  mainView: 'iso-low',
  shots: [
    { view: 'side', label: 'Side view' },
    { view: 'top', label: 'Top view' },
  ],
  ref: { sheet: 'section 18/section 18.1.png', box: [1010, 128, 1230, 592] },
  build: ({ variant, seed, height }) => build(variant, seed, height),
});
