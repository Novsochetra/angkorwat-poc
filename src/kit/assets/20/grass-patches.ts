import { BlockSet } from '../../BlockSet';
import { commitGrass, flatLayer, FLOWER_TONES, flower, ghostGround, grassClump, grassGrid, grassMat, grassTuft, GRASS_TONES, PLATE, smallPlant, sprout, type ClumpOptions } from '../../lib/grass';
import { LITTER, SANDSTONE, SOIL } from '../../palette';
import { PieceBuilder } from '../../PieceBuilder';
import { rng, scatter, TEXEL } from '../../shapes';
import { soilSurf, stoneSurf } from '../../surface';
import { defineKitAsset } from '../../types';
import { hash3, valueNoise3 } from '../../../voxel/random';
import type { VoxelGrid } from '../../../voxel/VoxelBuilder';

/**
 * §20 ⑪ Grass patches: the sheet's spiky clumps of one-texel blades (dark
 * green at the root, yellow-green at the sunlit tips, the outer ones stepping
 * outward as they rise and branching like candelabra) — the panel's mix
 * scattered over the ground, a single tuft, a tall clump, a bushy one, a
 * flowering bank, turf on a soil block, wild grass in dry litter and turf
 * overgrowing two fallen sandstone blocks. The grass is walk-through; only the
 * soil and stone bases collide.
 */
const T = TEXEL;
const MEADOW = GRASS_TONES.meadow;
/** The sheet's soil bases: dark brown under the turf. */
const SOIL_BASE = 0x7a5f4d;

/** A grid of n × m texels centred on the origin, its row 0 standing on the ground. */
function patchGrid(p: PieceBuilder, n: number, m: number, seed: number): VoxelGrid {
  const g = grassGrid(p, [(-n / 2) * T, 0, (-m / 2) * T], seed);
  ghostGround(g, -4, -4, n + 3, m + 3);
  return g;
}

/** A soil block standing on the ground (texel cells i0‥i1 × k0‥k1 of a patch grid n × m), grass down its sides. */
function soilBlock(p: PieceBuilder, n: number, m: number, i0: number, k0: number, i1: number, k1: number, h: number): void {
  const [x0, z0, x1, z1] = [(i0 - n / 2) * T, (k0 - m / 2) * T, (i1 - n / 2) * T, (k1 - m / 2) * T];
  p.voxels.span(x0, 0, z0, x1, h * T, z1, SOIL_BASE, 'soil', { surf: soilSurf({ grass: 0.9, moss: 0.2 }) });
  p.collider(x0, 0, z0, x1, h * T, z1);
}

/**
 * Ground cover under the clumps of an n × m patch (ellipses [i, k, rx, rz] in
 * texels): thin plates of dirt, straw and dry leaves (`litter` share),
 * thinning out towards the rim — the brown spot the sheet's tufts stand in.
 */
function groundCover(p: PieceBuilder, n: number, m: number, spots: [number, number, number, number][], seed: number, litter = 0.25): void {
  const straw = GRASS_TONES.dry.tip;
  flatLayer(
    p,
    n,
    m,
    [(-n / 2) * T, 0, (-m / 2) * T],
    (i, k) => {
      const e = Math.min(...spots.map(([ci, ck, rx, rz]) => Math.hypot((i + 0.5 - ci) / rx, (k + 0.5 - ck) / rz)));
      const v = valueNoise3(i * 0.5, k * 0.5, 2.5, seed) * 0.5 + hash3(i, 2, k, seed) * 0.5;
      if (e > 1 || v < e * 0.8) return null;
      const h = hash3(i, 3, k, seed);
      if (h < litter) return { color: LITTER.dry[Math.floor(h * 20) % LITTER.dry.length], mat: 'leaves' };
      if (h < litter + 0.25) return { color: straw[Math.floor(h * 20) % straw.length], mat: 'leaves' };
      return { color: SOIL.dirt[Math.floor(h * 20) % SOIL.dirt.length], mat: 'soil' };
    },
    PLATE,
  );
}

/** The scatter's clumps, in the sheet panel's mix (a clump of rx = rz = 0.5 is a single tuft). */
const MIX: { flowers?: boolean; litter?: boolean; o: Omit<ClumpOptions, 'tones' | 'seed'> }[] = [
  { o: { rx: 0.5, rz: 0.5, height: 9, radius: 2.6, spacing: 1.1, lean: 1, nub: 0.8, arms: 0.8 } },
  { o: { rx: 0.5, rz: 0.5, height: 7, radius: 2.2, spacing: 1.15, lean: 1.1, nub: 0.8, arms: 0.8 } },
  { o: { rx: 3.5, rz: 2.5, height: 5, gap: 2.6, radius: 1.6, spacing: 1.15, lean: 1.2, nub: 0.9, arms: 0.6 } },
  { o: { rx: 2.5, rz: 2.5, height: 7, gap: 2.6, radius: 1.8, spacing: 1.15, lean: 1.4, nub: 1, arms: 0.7 } },
  { o: { rx: 0.5, rz: 0.5, height: 11, radius: 2.8, spacing: 1.1, lean: 0.8, nub: 0.8, arms: 0.9 } },
  { flowers: true, o: { rx: 2.5, rz: 2, height: 4, gap: 2.4, radius: 1.4, spacing: 1.15, lean: 1, nub: 0.6, arms: 0.5 } },
  { litter: true, o: { rx: 0.5, rz: 0.5, height: 9, radius: 2.4, spacing: 1.1, lean: 0.9, nub: 0.8, arms: 0.8 } },
  { o: { rx: 0.5, rz: 0.5, height: 6, radius: 2, spacing: 1.15, lean: 1.1, nub: 0.7, arms: 0.8 } },
];

export default defineKitAsset({
  section: '20',
  order: 11,
  name: 'Grass patches',
  caption: 'Grass and small vegetation patches.',
  size: {
    real: 'tufts 0.3–0.7 m tall, patches 0.7–1.6 m across',
    sheet: 'not given',
    note: 'Blades are one 1/16 m texel wide like every kit surface, so a tuft is 5–11 texels tall — knee-high tropical grass beside the 1.70 m explorer (the sheet draws its tufts with 10–13 rows).',
  },
  variants: [
    { id: 'scatter', name: 'Grass scatter' },
    { id: 'tuft', name: 'Grass tuft' },
    { id: 'tall', name: 'Tall grass' },
    { id: 'bushy', name: 'Bushy clump' },
    { id: 'flowering', name: 'Flowering patch' },
    { id: 'on-soil', name: 'Turf on soil' },
    { id: 'wild', name: 'Wild grass' },
    { id: 'on-stone', name: 'Overgrown stones' },
  ],
  shots: [
    { view: 'iso', variant: 'tuft', label: 'Grass tuft' },
    { view: 'iso', variant: 'tall', label: 'Tall grass' },
    { view: 'iso', variant: 'on-soil', label: 'Turf on soil' },
    { view: 'iso', variant: 'on-stone', label: 'Overgrown stones' },
  ],
  ref: { sheet: 'section 20/6706F03E-0DFA-4AFA-80F0-5C031D4F49D5.PNG', box: [16, 702, 580, 962] },
  build: ({ variant, seed }) => {
    const p = new PieceBuilder();
    const r = rng(seed);
    if (variant === 'scatter') {
      // The sheet panel's mix as it would grow, each clump in its own spot of a
      // loose 4 × 2 grid over about 3.3 × 1.8 m of ground.
      const n = 54;
      const m = 29;
      const order = MIX.map((_, t) => t).sort((a, b) => hash3(a, 5, 1, seed) - hash3(b, 5, 1, seed));
      const at = order.map((t, s): [number, number, number] => [t, 7 + (s % 4) * 13 + r.int(-1, 1), 7 + Math.floor(s / 4) * 15 + r.int(-1, 1)]);
      groundCover(p, n, m, at.map(([t, i, k]) => [i, k, MIX[t].o.rx + 2.5, MIX[t].o.rz + 2.5]), seed, 0.2);
      const g = patchGrid(p, n, m, seed);
      for (const [t, i, k] of at) {
        grassClump(g, i, k, { ...MIX[t].o, tones: MEADOW, seed: seed * 7 + t });
        if (MIX[t].litter) grassTuft(g, i - 2, k + 2, { height: 4, radius: 1, lean: 1, tones: GRASS_TONES.dry, seed: seed + t });
        if (MIX[t].flowers)
          for (let f = 0; f < 4; f++) flower(g, i + r.int(-3, 3), k + r.int(-2, 2), { h: r.int(1, 2), petals: f % 2 ? FLOWER_TONES.cream : FLOWER_TONES.pink, seed: seed + f });
      }
      commitGrass(p, g, { seed });
    } else if (variant === 'tuft') {
      groundCover(p, 14, 14, [[7, 7, 4, 4]], seed);
      const g = patchGrid(p, 18, 18, seed);
      grassTuft(g, 9, 9, { height: 9, radius: 2.3, spacing: 1.2, lean: 1, nub: 0.8, arms: 0.8, tones: MEADOW, seed });
      commitGrass(p, g, { seed });
    } else if (variant === 'tall') {
      groundCover(p, 16, 16, [[8, 8, 5, 5]], seed);
      const g = patchGrid(p, 20, 20, seed);
      grassTuft(g, 10, 10, { height: 11, radius: 3, spacing: 1.2, lean: 0.8, nub: 0.8, arms: 0.9, tones: MEADOW, seed });
      commitGrass(p, g, { seed });
    } else if (variant === 'bushy') {
      // Blades that branch and splay like coral.
      groundCover(p, 16, 16, [[8, 8, 5, 5]], seed, 0.1);
      const g = patchGrid(p, 18, 18, seed);
      grassClump(g, 9, 9, { rx: 3, rz: 3, height: 8, gap: 2.6, radius: 1.8, spacing: 1.25, lean: 1.4, nub: 1, arms: 0.8, tones: MEADOW, seed });
      commitGrass(p, g, { seed });
    } else if (variant === 'flowering') {
      // A low bank of soil in two steps under turf full of flowers, a taller clump behind.
      const n = 20;
      const m = 12;
      soilBlock(p, n, m, 0, 0, 11, 12, 3);
      soilBlock(p, n, m, 11, 1, 20, 11, 2);
      const g = patchGrid(p, n, m, seed);
      grassMat(g, 0, 0, 10, 11, { j: 3, droop: 0.35, tones: MEADOW, seed });
      grassMat(g, 11, 1, 19, 10, { j: 2, droop: 0.35, tones: MEADOW, seed: seed + 1 });
      grassClump(g, 13, 4, { rx: 3.5, rz: 2, j: 3, height: 7, gap: 2.6, radius: 1.5, spacing: 1.25, lean: 1, nub: 0.8, tones: MEADOW, seed });
      grassClump(g, 4, 7, { rx: 2, rz: 2.5, j: 4, height: 4, gap: 2.6, radius: 1.3, spacing: 1.25, lean: 1, tones: MEADOW, seed: seed + 5 });
      scatter(seed + 9, 12, n - 2, m - 2, 2).forEach(([x, z], t) => {
        const i = Math.round(x + n / 2);
        const k = Math.round(z + m / 2);
        const j = i <= 10 ? 4 : 3;
        if (!g.has(i, j, k)) flower(g, i, k, { j, h: r.int(1, 2), petals: t % 3 === 2 ? FLOWER_TONES.cream : FLOWER_TONES.pink, seed: seed + t });
      });
      commitGrass(p, g, { seed });
    } else if (variant === 'on-soil') {
      // Turf on a soil block, its rim drooping over the sides, a dense clump on top.
      const n = 16;
      const m = 12;
      soilBlock(p, n, m, 0, 0, n, m, 5);
      const g = patchGrid(p, n, m, seed);
      grassMat(g, 0, 0, n - 1, m - 1, { j: 5, droop: 0.6, tones: MEADOW, seed });
      grassClump(g, 8, 6, { rx: 5, rz: 3, j: 6, height: 7, gap: 2.6, radius: 1.7, spacing: 1.25, lean: 1.2, nub: 0.9, arms: 0.5, tones: MEADOW, seed });
      commitGrass(p, g, { seed });
    } else if (variant === 'wild') {
      // A clump standing in dry leaves and straw, a seedling and a small plant beside it.
      groundCover(p, 16, 14, [[8, 7, 7.5, 6.5]], seed, 0.45);
      const g = patchGrid(p, 16, 14, seed);
      grassClump(g, 8, 7, { rx: 3, rz: 2.5, height: 10, gap: 2.8, radius: 1.8, spacing: 1.25, lean: 0.9, nub: 0.8, arms: 0.6, tones: MEADOW, seed });
      grassTuft(g, 4, 10, { height: 6, radius: 1.2, lean: 1, tones: GRASS_TONES.dry, seed: seed + 11 });
      sprout(g, 2, 3, { seed: seed + 1 });
      smallPlant(g, 13, 11, { seed: seed + 2 });
      commitGrass(p, g, { seed });
    } else {
      // Two fallen sandstone blocks under turf and flowers, tufts at their feet.
      const set = new BlockSet(0.125);
      const style = { surf: stoneSurf({ moss: 0.4, lichen: 0.3, crack: 0.25, stain: 0.15 }) };
      set.add(-0.625, 0, -0.375, 0, 0.375, 0.375, SANDSTONE.mossy[seed % SANDSTONE.mossy.length], style);
      set.add(0, 0, -0.375, 0.5, 0.25, 0.25, SANDSTONE.mossy[(seed + 2) % SANDSTONE.mossy.length], style);
      // Chipped edges below the turf line only, so the turf lies on whole stone.
      set.erode(0.3, seed, { where: (x, y) => y < (x < 0 ? 0.25 : 0.125) });
      set.emit(p.voxels, { seed });
      p.collider(-0.625, 0, -0.375, 0, 0.375, 0.375);
      p.collider(0, 0, -0.375, 0.5, 0.25, 0.25);
      const n = 24;
      const m = 16;
      const g = patchGrid(p, n, m, seed);
      grassMat(g, 2, 2, 11, 13, { j: 6, droop: 0.45, tones: MEADOW, seed });
      grassMat(g, 12, 2, 19, 11, { j: 4, droop: 0.45, tones: MEADOW, seed: seed + 1 });
      grassClump(g, 6, 7, { rx: 3, rz: 3.5, j: 7, height: 6, gap: 2.6, radius: 1.5, spacing: 1.25, lean: 1, nub: 0.8, tones: MEADOW, seed });
      grassClump(g, 16, 6, { rx: 2, rz: 2.5, j: 5, height: 4, gap: 2.6, radius: 1.3, spacing: 1.25, lean: 1, tones: MEADOW, seed: seed + 1 });
      flower(g, 4, 4, { j: 7, h: 2, seed });
      flower(g, 9, 11, { j: 7, h: 1, petals: FLOWER_TONES.cream, seed: seed + 2 });
      flower(g, 15, 9, { j: 5, h: 1, petals: FLOWER_TONES.deep, seed: seed + 3 });
      grassTuft(g, 1, 14, { height: 4, radius: 1.2, lean: 1, arms: 0.6, tones: MEADOW, seed: seed + 7 });
      grassTuft(g, 21, 13, { height: 3, radius: 1, lean: 1, arms: 0.6, tones: MEADOW, seed: seed + 8 });
      commitGrass(p, g, { seed });
    }
    return p.done();
  },
});
