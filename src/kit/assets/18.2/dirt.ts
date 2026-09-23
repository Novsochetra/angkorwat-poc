import type { VoxelBuilder } from '../../../voxel/VoxelBuilder';
import { PieceBuilder } from '../../PieceBuilder';
import { rng, scatter, type Rng } from '../../shapes';
import { defineKitAsset, type KitPiece } from '../../types';
import { N, Texels, onSide, onTop, skinCells, texelValue, toneRanker } from './_tiles';

/**
 * ② Dirt: a brown dirt tile painted texel by texel like the sheet — pale clods,
 * mid browns and dark crumbs on top, the same earth darker and greyer down the
 * sides — with a few four-leaf sprouts, grey pebbles and moss on the sides.
 */
interface Palette {
  /** Sheet tones, dark → light. */
  tones: readonly number[];
  /** Share of each tone. */
  weights: readonly number[];
}

interface DirtLook {
  top: Palette;
  side: Palette;
  sprouts: number;
  /** Raised clods (the bumpy tops of the dry and wet cubes) and their tones (indices into top). */
  clods: number;
  clodTones: [number, number];
  pebbles: number;
  /** Moss blotches on the sides (0‥1). */
  moss: number;
  /** Grass patches over the top (mixed dirt, 0‥1). */
  grass: number;
}

const LOOKS: Record<string, DirtLook> = {
  // The sheet's main cube: sun-dried earth with a few sprouts.
  dry: {
    top: {
      tones: [0x4a3528, 0x7a5236, 0x9b653e, 0xb87a46, 0xd99a58, 0xefbe7c],
      weights: [5, 19, 31, 24, 15, 6],
    },
    side: {
      tones: [0x3c3221, 0x5f4630, 0x805836, 0xa2703f, 0xc48a4e],
      weights: [10, 34, 33, 18, 5],
    },
    sprouts: 6,
    clods: 2,
    clodTones: [2, 4],
    pebbles: 3,
    moss: 0.5,
    grass: 0,
  },
  // Darker and richer, damp: few pale clods left on top.
  wet: {
    top: {
      tones: [0x3e2b21, 0x5a3e2f, 0x77523a, 0x956845, 0xb88657, 0xd3a676],
      weights: [10, 22, 32, 23, 10, 3],
    },
    side: {
      tones: [0x2e2219, 0x46322a, 0x573f2e, 0x6a4c36, 0x86603f],
      weights: [12, 30, 35, 16, 7],
    },
    sprouts: 2,
    clods: 4,
    clodTones: [3, 5],
    pebbles: 2,
    moss: 0.35,
    grass: 0,
  },
  // Dirt with grass bits and pebbles.
  mixed: {
    top: {
      tones: [0x4e3a28, 0x6e4e30, 0x8a6035, 0xa6733d, 0xbd8a4a, 0xd6a664],
      weights: [6, 20, 32, 25, 12, 5],
    },
    side: {
      tones: [0x3e2e22, 0x523d2c, 0x6c4b35, 0x845c41, 0xa07650],
      weights: [8, 22, 40, 22, 8],
    },
    sprouts: 2,
    clods: 0,
    clodTones: [2, 4],
    pebbles: 6,
    moss: 0.4,
    grass: 0.5,
  },
};

const SPROUT = {
  leaf: [0x8a9c2e, 0x98a830, 0xa6b034, 0x7d922c].map(onTop),
  heart: onTop(0x56702c),
};
const GRASS = {
  flat: [0x5e6c26, 0x6c7a28, 0x7c862a, 0x505e24].map(onTop),
  tuft: [0x94982a, 0xa8a42c, 0xbab232, 0x84902a].map(onTop),
  side: [0x4a5a24, 0x56682a, 0x3e4c22].map(onSide),
};
const MOSS = [0x33402a, 0x3e4c26, 0x4a5a2a, 0x5a6a2e].map(onSide);
const PEBBLE = [0x8a8076, 0x776d62, 0x988e82, 0x685f55].map(onTop);

const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Tile-space centre of a texel column (metres). */
const at = (i: number) => -0.5 + (i + 0.5) / N;

/**
 * A seedling like the sheet's green crosses: four leaves tilted up round a
 * darker heart (≈ 18 cm across, 6 cm tall; it stays inside a texel of the
 * tile's edge).
 */
function sprout(v: VoxelBuilder, ci: number, ck: number, r: Rng): void {
  const [x, z] = [at(ci), at(ck)];
  v.box(x, 0.022, z, 0.05, 0.044, 0.05, SPROUT.heart, 'leaves');
  for (const [dx, dz] of DIRS) {
    const tilt = r.range(0.35, 0.6);
    const len = r.range(0.062, 0.07);
    v.box(x + dx * 0.055, 0.03, z + dz * 0.055, dx ? len : 0.056, 0.022, dz ? len : 0.056, r.pick(SPROUT.leaf), 'leaves', {
      rz: dx * tilt,
      rx: -dz * tilt,
    });
  }
}

function calib(): KitPiece {
  // TEMP calibration: grey ramp patches (4×4 texels) on top, 4 texels wide on the sides.
  const p = new PieceBuilder();
  const t = new Texels('soil');
  const lv = (n: number) => Math.round(8 + (247 * n) / 15);
  const grey = (n: number) => lv(n) * 0x10101;
  for (const [i, j, k] of skinCells(t)) {
    const n = j === -1 ? Math.floor(i / 4) + 4 * Math.floor(k / 4) : (i === N - 1 ? Math.floor(k / 4) : Math.floor(i / 4)) + (j < -4 ? 4 : 0);
    t.set(i, j, k, grey(j === -1 ? n : n * 2));
  }
  t.emit(p.voxels);
  return p.done();
}

function build(variant: string, seed: number): KitPiece {
  if (variant === 'calib') return calib();
  const look = LOOKS[variant] ?? LOOKS.dry;
  const top = look.top.tones.map(onTop);
  const side = look.side.tones.map(onSide);
  const p = new PieceBuilder();
  const t = new Texels('soil');
  const r = rng(seed * 31 + 5);

  // The earth: every visible texel of the body, toned by rank so each tone
  // covers the share it has on the sheet's faces.
  const cells = skinCells(t);
  const value = ([i, j, k]: [number, number, number]) => texelValue(i, j, k, seed, 0.5, 0.45);
  const topCells = cells.filter(([, j]) => j === -1);
  const sideCells = cells.filter(([, j]) => j < -1);
  const rankTop = toneRanker(topCells.map(value), look.top.weights);
  const rankSide = toneRanker(sideCells.map(value), look.side.weights);
  for (const c of topCells) t.set(c[0], c[1], c[2], top[rankTop(value(c))]);
  for (const c of sideCells) t.set(c[0], c[1], c[2], side[rankSide(value(c))]);

  // Moss in blotches on the sides, mostly high up, like the sheet's green smudges.
  for (const [i, j, k] of sideCells) {
    const m = texelValue(i, j, k, seed + 60, 0.3, 0.8) + (j + 8) * 0.012;
    if (m > 1 - look.moss * 0.36) t.set(i, j, k, MOSS[Math.floor(texelValue(i, j, k, seed + 61, 0.6, 0.3) * MOSS.length)]);
  }

  // Grass patches (mixed dirt): flat green texels under lumpy yellow-green
  // clumps, hanging over the edges where a patch reaches one.
  const tufts = t.loose();
  if (look.grass > 0)
    for (let i = 0; i < N; i++)
      for (let k = 0; k < N; k++) {
        const v = texelValue(i, 3, k, seed + 40, 0.2, 0.85);
        if (v < 1 - look.grass * 0.62) continue;
        t.set(i, -1, k, r.pick(GRASS.flat));
        if (v > 1 - look.grass * 0.45 && r.chance(0.75)) {
          t.set(i, 0, k, r.pick(GRASS.tuft), {
            mat: 'leaves',
            group: tufts,
            ao: true,
          });
          if (v > 1 - look.grass * 0.25 && r.chance(0.5))
            t.set(i, 1, k, r.pick(GRASS.tuft), {
              mat: 'leaves',
              group: tufts,
              ao: true,
            });
        }
        for (const [di, dk] of DIRS) {
          if (i + di >= 0 && i + di < N && k + dk >= 0 && k + dk < N) continue;
          const len = r.int(0, 3);
          for (let j = -2; j >= -1 - len; j--) t.set(i, j, k, r.pick(GRASS.side));
        }
      }

  // Sprouts, spread out like the sheet's top view; the first sits at the front
  // or right edge (its leaves just inside the tile) with its moss spilling
  // down the side.
  const spots: [number, number][] = [];
  if (look.sprouts > 0) spots.push(r.chance(0.5) ? [r.int(3, N - 4), N - 2] : [N - 2, r.int(3, N - 4)]);
  for (const [x, z] of scatter(seed + 3, look.sprouts * 3, 0.8, 0.8, 0.3)) {
    if (spots.length >= look.sprouts) break;
    const s: [number, number] = [Math.floor((x + 0.5) * N), Math.floor((z + 0.5) * N)];
    if (spots.every(([a, b]) => Math.hypot(a - s[0], b - s[1]) >= 5)) spots.push(s);
  }
  for (const [ci, ck] of spots) {
    sprout(p.voxels, ci, ck, r);
    const edgeZ = ck >= N - 2;
    const edgeX = ci >= N - 2;
    if (!edgeZ && !edgeX) continue;
    for (let s = -2; s <= 2; s++) {
      const along = (edgeZ ? ci : ck) + s;
      if (along < 0 || along >= N) continue;
      const len = Math.abs(s) === 2 ? r.int(0, 1) : r.int(1, 4);
      for (let j = -1; j >= -len; j--) {
        if (edgeZ) t.set(along, j, N - 1, r.pick(MOSS));
        else t.set(N - 1, j, along, r.pick(MOSS));
      }
    }
  }

  // Clods and pebbles: single raised texels, and a few flush grey ones.
  const free = (i: number, k: number) => !t.has(i, 0, k) && spots.every(([a, b]) => Math.abs(a - i) + Math.abs(b - k) > 2);
  for (let n = 0; n < look.clods; n++) {
    // A clump of two to four texels of the paler earth.
    const [i, k] = [r.int(1, N - 2), r.int(1, N - 2)];
    if (!free(i, k)) continue;
    const g = t.loose();
    const clod = () => top[r.int(look.clodTones[0], look.clodTones[1])];
    t.set(i, 0, k, clod(), { group: g, ao: true });
    for (const [di, dk] of DIRS) if (r.chance(0.45) && free(i + di, k + dk)) t.set(i + di, 0, k + dk, clod(), { group: g, ao: true });
  }
  for (let n = 0; n < look.pebbles; n++) {
    const [i, k] = [r.int(1, N - 2), r.int(1, N - 2)];
    if (!free(i, k)) continue;
    if (n % 2 === 0) t.set(i, 0, k, r.pick(PEBBLE), { group: t.loose(), ao: true });
    else t.set(i, -1, k, r.pick(PEBBLE));
  }

  t.emit(p.voxels);
  p.collider(-0.5, -0.5, -0.5, 0.5, 0, 0.5);
  return p.done();
}

export default defineKitAsset({
  section: '18.2',
  order: 2,
  name: 'Dirt',
  caption: 'Bare earth for paths, clearings and around roots.',
  size: {
    real: '1 m × 1 m tile, 0.5 m of soil',
    sheet: 'cube ≈ 1 × 0.7 m',
    note: 'The kit’s ground grid: 1 m tiles, walkable top at y = 0 and 0.5 m of soil, so every ground tile lines up; the sheet draws its cubes a little deeper.',
  },
  variants: [
    { id: 'dry', name: 'Dry dirt' },
    { id: 'wet', name: 'Wet dirt' },
    { id: 'mixed', name: 'Mixed dirt' },
  ],
  shots: [
    { view: 'iso', variant: 'wet', label: 'Wet dirt' },
    { view: 'iso', variant: 'mixed', label: 'Mixed dirt' },
    { view: 'top', label: 'Top view (tile)' },
  ],
  ref: { sheet: 'section 18/section 18.2.png', box: [216, 130, 408, 662] },
  build: ({ variant, seed }) => build(variant, seed),
});
