import { clipToFootprint, commitGrass, plusTuft, sprout, type GrassTones } from '../../lib/grass';
import { topGrid } from '../../lib/ground';
import { rock } from '../../lib/rocks';
import { PieceBuilder } from '../../PieceBuilder';
import { rng, TEXEL, type Rng } from '../../shapes';
import { defineKitAsset, type KitPiece } from '../../types';
import { DEPTH, N, Texels, edgeColumns, onSide, onTop, skinCells, texelValue, toneRanker } from './_tiles';

/**
 * §18.2 ⑧ Small rocks: a 1 m tile of dark soil with rounded grey-greige stones
 * bedded in it, as the sheet draws it — several medium stones, none much bigger
 * than the rest, smaller stones and pebbles between them, lichen and moss on
 * their tops, the soil darker round their feet, moss and bits of grass in the
 * gaps. The soil is painted texel by texel on the shared §18.2 skin
 * (_tiles.ts) like its neighbours: dark crumbly earth on top, a warmer brown
 * down the sides with stones bedded in it and moss hanging over the edge.
 */

/** A stone of a layout, in tile texels: centre of its footprint (x, z; 0‥16), footprint w × d, height above the soil. */
type Stone = readonly [x: number, z: number, w: number, d: number, h: number];

/**
 * The sheet's top view, rebalanced: six medium stones (19–31 cm) spread over
 * the tile — the middle one hardly bigger than the others — four small ones
 * and loose pebbles between, every stone a texel clear of the tile's edge and
 * of its neighbours, so the dark soil shows round each of them.
 */
const ROCKS: Stone[] = [
  [7.6, 8.2, 5, 5, 3],
  [13, 6.2, 4, 4, 3],
  [2.6, 8.2, 3, 4, 2],
  [3, 13.2, 4, 3, 3],
  [13.2, 12.6, 3, 3, 2],
  [5.2, 2.4, 4, 3, 2],
  [9.8, 14.4, 2, 2, 2],
  [12.4, 1.6, 2, 2, 2],
  [8.6, 3.6, 2, 2, 1],
  [6.6, 14.4, 2, 2, 1],
];

/** The sheet's rock cluster: one bigger stone at the back, smaller ones huddled against it, pebbles round about. */
const CLUSTER: Stone[] = [
  [7, 6.2, 6, 5, 5],
  [11.6, 8.6, 4, 3, 2],
  [2.2, 6.6, 3, 3, 2],
  [11.8, 3.4, 3, 2, 2],
  [5.2, 11.2, 3, 3, 2],
  [8.6, 11.4, 2, 2, 1],
  [13.4, 12.6, 2, 1, 1],
  [2.6, 13.4, 2, 2, 1],
  [1.6, 1.8, 1, 1, 1],
  [10.4, 14.2, 1, 1, 1],
];

interface Look {
  /** Moss on the stones: in the stone's pattern, and raised cushions on their tops (0‥1). */
  moss: number;
  stoneCushions: number;
  /** Share of the free soil grown over with flat moss, and of the moss raised into little cushions. */
  carpet: number;
  cushions: number;
  /** Grass tufts and loose pebbles in the gaps. */
  tufts: number;
  pebbles: number;
}

const LOOKS: Record<string, Look> = {
  rocks: { moss: 0.4, stoneCushions: 0.26, carpet: 0.16, cushions: 0.25, tufts: 3, pebbles: 6 },
  pebbles: { moss: 0.22, stoneCushions: 0.1, carpet: 0.1, cushions: 0.15, tufts: 2, pebbles: 0 },
  cluster: { moss: 0.45, stoneCushions: 0.32, carpet: 0.22, cushions: 0.3, tufts: 3, pebbles: 3 },
};

/** Dark soil of the sheet's top view (dark → light) and each tone's share. */
const SOIL = [0x3a302a, 0x544032, 0x684c38, 0x7a573e, 0x8c6645].map(onTop);
const SOIL_W = [8, 22, 36, 22, 12];
/** The warmer earth of the sheet's lit side face. */
const EARTH = [0x292419, 0x4f4027, 0x71553b, 0x8d6d4e, 0xa37e58].map(onSide);
const EARTH_W = [10, 24, 36, 22, 8];
/** Moss on the soil (sheet: dark olive to the yellow-green of its lit tufts), on top and hanging down the sides. */
const MOSS = [0x22291b, 0x2f3520, 0x3a3f26, 0x4a4d28, 0x56582a].map(onTop);
const MOSS_TIPS = [0x56582a, 0x66682d, 0x7d7d3a, 0x8a8c38].map(onTop);
const MOSS_SIDE = [0x2c341f, 0x3c4125, 0x56582a, 0x6a6b2e, 0x8c891d].map(onSide);
/** Grass between the stones: the sheet's olive blades, darker than the lawn tile's lime (they grow in the stones' shade). */
const GRASS: GrassTones = { base: [0x2e3322, 0x333925], mid: [0x4b5229, 0x52592b], tip: [0x666a2c, 0x6f7430] };
/** Stones bedded in the side faces (the sheet's grey-greige, dark → light), and loose pebbles on top. */
const STONE_SIDE = [0x57504c, 0x6c625c, 0x807369, 0x968678].map(onSide);
const PEBBLE = [0x7b6e67, 0x928176, 0xa99484].map(onTop);

/** The 4-neighbours and the diagonals of a texel. */
const AROUND: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * The pebble bed: flat stones over the whole top, a texel of soil between
 * them and round the edge, packed biggest first; pebbles in what is left.
 */
function pebbleBed(r: Rng): Stone[] {
  const taken = new Set<number>();
  const out: Stone[] = [];
  const fits = (i0: number, k0: number, w: number, d: number) => {
    if (i0 < 1 || k0 < 1 || i0 + w > N - 1 || k0 + d > N - 1) return false;
    for (let i = i0 - 1; i <= i0 + w; i++) for (let k = k0 - 1; k <= k0 + d; k++) if (taken.has(i * N + k)) return false;
    return true;
  };
  const sizes: [number, number, number][] = [[4, 3, 60], [3, 4, 60], [3, 3, 90], [3, 2, 90], [2, 3, 90], [2, 2, 120], [1, 1, 160]];
  for (const [w, d, tries] of sizes)
    for (let t = 0; t < tries; t++) {
      const [i0, k0] = [r.int(1, N - 1 - w), r.int(1, N - 1 - d)];
      if (!fits(i0, k0, w, d)) continue;
      for (let i = i0; i < i0 + w; i++) for (let k = k0; k < k0 + d; k++) taken.add(i * N + k);
      out.push([i0 + w / 2, k0 + d / 2, w, d, w * d >= 9 && r.chance(0.3) ? 2 : 1]);
    }
  return out;
}

/** A layout turned or mirrored on the tile (eight ways), so each seed lays the stones differently. */
function transform(stones: Stone[], way: number): Stone[] {
  return stones.map(([x, z, w, d, h]) => {
    let [a, b, sw, sd] = [x, z, w, d];
    if (way & 1) a = N - a;
    if (way & 2) b = N - b;
    if (way & 4) [a, b, sw, sd] = [b, a, sd, sw];
    return [a, b, sw, sd, h];
  });
}

function build(variant: string, seed: number): KitPiece {
  const look = LOOKS[variant] ?? LOOKS.rocks;
  const r = rng(seed * 7919 + 13);
  const p = new PieceBuilder();

  // The stones. (Seed 1 is the sheet's layout; other seeds turn or mirror it.)
  const layout = variant === 'pebbles' ? pebbleBed(r) : transform(variant === 'cluster' ? CLUSTER : ROCKS, seed === 1 ? 0 : r.int(1, 7));
  /** Texel columns (i · N + k) under a stone. */
  const under = new Set<number>();
  layout.forEach(([x, z, w, d, h], n) => {
    const s = rock(p, { at: [x / N - 0.5, 0, z / N - 0.5], size: [w * TEXEL, h * TEXEL, d * TEXEL], seed: seed * 131 + n, moss: look.moss, cushions: look.stoneCushions, collide: 0.2 });
    for (const [i, k] of s.foot) under.add((i + N / 2) * N + k + N / 2);
  });
  const isRock = (i: number, k: number) => under.has(i * N + k);
  const nearRock = (i: number, k: number) => AROUND.some(([di, dk]) => isRock(i + di, k + dk));

  // The soil skin: dark earth on top, toned by rank like the sheet's, a shade
  // darker in each stone's shadow (away from the key light, upper left in
  // front); flat moss in patches, thickest against the stones.
  const t = new Texels('soil');
  const cells = skinCells(t);
  const top = cells.filter(([, j]) => j === -1);
  const sides = cells.filter(([, j]) => j < -1);
  const value = ([i, j, k]: [number, number, number]) => texelValue(i, j, k, seed, 0.5, 0.45);
  const rankTop = toneRanker(top.map(value), SOIL_W);
  const rankSide = toneRanker(sides.map(value), EARTH_W);
  const moss = new Set<number>();
  for (const c of top) {
    const [i, , k] = c;
    // (under a stone: one dark tone, so those hidden plates merge into few)
    if (isRock(i, k)) {
      t.set(i, -1, k, SOIL[0]);
      continue;
    }
    // (the edge texels' sides take the earth of the side faces, not the top's dark soil)
    const side = i === 0 || k === 0 || i === N - 1 || k === N - 1 ? EARTH[rankSide(value(c))] : undefined;
    const shade = isRock(i - 1, k) || isRock(i, k + 1) || isRock(i - 1, k + 1) ? 1 : 0;
    const m = texelValue(i, 3, k, seed + 40, 0.3, 0.75) + (nearRock(i, k) ? 0.22 : 0);
    if (m > 1.14 - look.carpet) {
      moss.add(i * N + k);
      t.set(i, -1, k, MOSS[Math.max(0, Math.min(MOSS.length - 1, Math.floor(texelValue(i, 5, k, seed + 41, 0.6, 0.5) * MOSS.length) - shade))], { mat: 'leaves', side });
    } else t.set(i, -1, k, SOIL[Math.max(0, rankTop(value(c)) - shade)], { side });
  }

  // Moss cushions: little raised lumps on the thickest moss, their tops painted
  // olive to the sheet's sunlit yellow-green.
  const lump = t.loose();
  for (const key of moss) {
    const [i, k] = [Math.floor(key / N), key % N];
    const v = texelValue(i, 7, k, seed + 43, 0.5, 0.6) + (nearRock(i, k) ? 0.15 : 0);
    if (v > 1.05 - look.cushions) t.set(i, 0, k, MOSS[1], { mat: 'leaves', group: lump, ao: true, cap: MOSS_TIPS[Math.min(MOSS_TIPS.length - 1, Math.floor(texelValue(i, 8, k, seed + 44, 0.6, 0.5) * MOSS_TIPS.length))] });
  }

  // Loose pebbles: single grey texels on the soil, clear of everything else.
  const free = (i: number, k: number) => i >= 1 && k >= 1 && i < N - 1 && k < N - 1 && !isRock(i, k) && !t.has(i, 0, k);
  for (let n = 0, tries = 0; n < look.pebbles && tries < 60; tries++) {
    const [i, k] = [r.int(1, N - 2), r.int(1, N - 2)];
    if (!free(i, k) || AROUND.some(([di, dk]) => !free(i + di, k + dk))) continue;
    t.set(i, 0, k, PEBBLE[r.int(0, PEBBLE.length - 1)], { mat: 'sandstone', group: t.loose(), ao: true });
    n++;
  }

  // The sides: earth toned by rank, stones bedded in it, moss hanging from the
  // mossy edge texels.
  for (const c of sides) t.set(c[0], c[1], c[2], EARTH[rankSide(value(c))]);
  sideStones(t, r);
  for (const [i, k] of edgeColumns()) {
    if (!moss.has(i * N + k)) continue;
    const len = 1 + Math.round(texelValue(i, 2, k, seed + 17, 0.35, 0.55) ** 2 * 5);
    for (let j = -2; j >= Math.max(-DEPTH, -1 - len); j--) t.set(i, j, k, MOSS_SIDE[Math.min(MOSS_SIDE.length - 1, Math.floor(texelValue(i, j, k, seed + 18, 0.6, 0.5) * MOSS_SIDE.length) + (j === -2 ? 1 : 0))], { mat: 'leaves' });
  }
  t.emit(p.voxels);

  // Bits of grass in the gaps: short "+" tufts and seedlings, clear of the
  // stones, the moss lumps and each other.
  const g = topGrid(p, { mat: 'leaves', seed });
  const open = (a: number, b: number) => free(a, b) && !g.has(a, 0, b) && !AROUND.slice(0, 4).some(([di, dk]) => g.has(a + di, 0, b + dk));
  for (let n = 0, tries = 0; n < look.tufts && tries < 200; tries++) {
    const [i, k] = [r.int(1, N - 2), r.int(1, N - 2)];
    if (!open(i, k) || AROUND.slice(0, 4).some(([di, dk]) => isRock(i + di, k + dk) || !open(i + di, k + dk))) continue;
    if (n % 3 === 2) sprout(g, i, k, { tones: GRASS, seed: seed * 17 + n });
    else plusTuft(g, i, k, { height: 2, tones: GRASS, seed: seed * 31 + n });
    n++;
  }
  clipToFootprint(g, N, N);
  commitGrass(p, g, { seed, sun: 0.1 });
  p.collider(-0.5, -0.5, -0.5, 0.5, 0, 0.5);
  return p.done();
}

/**
 * Stones bedded in the side faces, as the sheet's cube shows them: a rounded
 * patch or two per side, three to five texels wide, flush with the earth,
 * their top row catching the light and their bottom row in shadow.
 */
function sideStones(t: Texels, r: Rng): void {
  for (let side = 0; side < 4; side++) {
    const used: [number, number, number, number][] = [];
    for (let n = 0, count = r.int(1, 2), tries = 0; n < count && tries < 30; tries++) {
      const [w, h] = [r.int(3, 5), r.int(2, 3)];
      const [u0, top] = [r.int(0, N - w), -r.int(3, DEPTH - h)];
      if (used.some(([a0, a1, j0, j1]) => u0 <= a1 + 1 && u0 + w - 1 >= a0 - 1 && top >= j1 - 1 && top - h + 1 <= j0 + 1)) continue;
      used.push([u0, u0 + w - 1, top, top - h + 1]);
      for (let a = 0; a < w; a++)
        for (let b = 0; b < h; b++) {
          // (rounded: the four corner texels left to the earth on bigger stones)
          if (w >= 4 && h >= 3 && (a === 0 || a === w - 1) && (b === 0 || b === h - 1)) continue;
          const u = u0 + a;
          const [i, k] = side === 0 ? [N - 1, u] : side === 1 ? [0, u] : side === 2 ? [u, N - 1] : [u, 0];
          const tone = b === 0 ? 3 - r.int(0, 1) : b === h - 1 ? r.int(0, 1) : 1 + r.int(0, 1);
          t.set(i, top - b, k, STONE_SIDE[tone], { mat: 'sandstone' });
        }
      n++;
    }
  }
}

export default defineKitAsset({
  section: '18.2',
  order: 8,
  name: 'Small rocks',
  caption: 'Dark soil with rounded grey stones and pebbles bedded in it.',
  size: {
    real: '1 m × 1 m tile, 0.5 m of soil; stones 6–31 cm across, up to 19 cm above the soil (the cluster’s big stone 38 cm across, 31 cm high)',
    sheet: 'not given',
    note: 'Ground tiles are 1 m squares with 0.5 m of soil like the other §18.2 tiles (the sheet draws its cube deeper). Stones follow the sheet’s top view on the 1/16 m texel grid, rebalanced so no stone dominates: six of 19–31 cm, the rest 6–13 cm, all a texel clear of the tile’s edge so neighbouring tiles join cleanly.',
  },
  variants: [
    { id: 'rocks', name: 'Rocks' },
    { id: 'pebbles', name: 'Pebbles' },
    { id: 'cluster', name: 'Rock cluster' },
  ],
  shots: [
    { view: 'iso', variant: 'pebbles', label: 'Pebbles' },
    { view: 'iso', variant: 'rocks', label: 'Rocks' },
    { view: 'iso', variant: 'cluster', label: 'Rock cluster' },
    { view: 'top', variant: 'rocks', label: 'Top view (tile)' },
  ],
  ref: { sheet: 'section 18/section 18.2.png', box: [1327, 130, 1519, 662] },
  build: ({ variant, seed }) => build(variant, seed),
});
