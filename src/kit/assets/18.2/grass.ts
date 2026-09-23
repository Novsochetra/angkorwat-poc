import { topGrid } from '../../lib/ground';
import { clipToFootprint, commitGrass, grassTuft, GRASS_TONES, LAWN_TONES, lawnMosaic, plusTuft, sprout } from '../../lib/grass';
import { PieceBuilder } from '../../PieceBuilder';
import { rng, scatter } from '../../shapes';
import { defineKitAsset } from '../../types';
import { valueNoise3 } from '../../../voxel/random';
import { edgeColumns, N, onSide, onTop, skinCells, Texels, texelValue, toneRanker } from './_tiles';

/**
 * §18.2 ① Grass: a 1 m ground tile of grass-topped soil, painted texel by texel
 * on the shared §18.2 skin (_tiles.ts) like its neighbours. The top is a lawn
 * mosaic of lime, olive and deep-green texels (the soil pattern's own grass
 * renders too dark and blue beside the sheet), darker around each tuft; the
 * sides are red-brown earth with dark crumbs and a few grey stones, the grass
 * hanging one to six texels down them. Raised tufts stand on the lawn: the
 * sheet's "+" tufts on clean grass, a few tufts and sprouts between bare dirt
 * on patchy grass, clusters of tall blades.
 */

/** The sheet's earth under the grass (lit side face, dark → light) and each tone's share. */
const EARTH = [0x312823, 0x563f32, 0x6f4e3a, 0x895f41, 0xa3754f].map(onSide);
const EARTH_SHARES = [9, 19, 36, 27, 9];
/** Grey stones bedded in the earth. */
const STONE = [0x6e6a6c, 0x5e5a5c, 0x7c7674].map(onSide);
/** Grass hanging down the sides: the first row under the lawn, then deeper down. */
const DRIP_TOP = [0x9ea831, 0x839236, 0x8a9830].map(onSide);
const DRIP = [0x677d35, 0x4e612f, 0x5c7331, 0x3d4f2c].map(onSide);
/** Bare dirt showing through patchy grass (the dirt tile's mixed earth). */
const DIRT = [0x6e4e30, 0x8a6035, 0xa6733d, 0xbd8a4a].map(onTop);

/** Tuft centres on the tile (texel indices), kept off the edges so neighbouring tiles join cleanly. */
function spots(seed: number, n: number, minDist: number, ok: (i: number, k: number) => boolean = () => true): [number, number][] {
  const inner = N - 5;
  return scatter(seed, n * 3, inner, inner, minDist).map(([x, z]): [number, number] => [Math.round(x + N / 2 - 0.5), Math.round(z + N / 2 - 0.5)]).filter(([i, k]) => ok(i, k)).slice(0, n);
}

export default defineKitAsset({
  section: '18.2',
  order: 1,
  name: 'Grass',
  caption: 'Grass-topped soil with small tufts.',
  size: {
    real: '1 × 1 m tile, 0.5 m of soil; tufts 19 cm, tall grass to 60 cm',
    sheet: 'not given',
    note: 'Ground tiles are 1 m squares on the 1/16 m texel grid (the sheet’s top view counts 16 × 16 texels); 0.5 m of soil like the other §18.2 tiles, the walkable top at y = 0.',
  },
  variants: [
    { id: 'clean', name: 'Clean grass' },
    { id: 'patchy', name: 'Patchy grass' },
    { id: 'tall', name: 'Tall grass' },
  ],
  shots: [
    { view: 'iso', variant: 'patchy', label: 'Patchy grass' },
    { view: 'iso', variant: 'tall', label: 'Tall grass' },
    { view: 'top', label: 'Top view (tile)' },
  ],
  ref: { sheet: 'section 18/section 18.2.png', box: [18, 130, 210, 662] },
  build: ({ variant, seed }) => {
    const p = new PieceBuilder();
    const r = rng(seed * 7 + 3);
    const bare = (i: number, k: number) => variant === 'patchy' && valueNoise3(i * 0.24, k * 0.24, 0.5, seed + 40) > 0.6;

    // Tufts first, so the lawn can darken around them.
    const g = topGrid(p, { mat: 'leaves', seed });
    if (variant === 'clean') {
      spots(seed, r.int(6, 8), 4).forEach(([i, k], n) => plusTuft(g, i, k, { seed: seed * 31 + n }));
    } else if (variant === 'patchy') {
      spots(seed, 3, 4, (i, k) => !bare(i, k)).forEach(([i, k], n) => plusTuft(g, i, k, { height: 2, seed: seed * 31 + n }));
      spots(seed + 1, 2, 3, bare).forEach(([i, k], n) => sprout(g, i, k, { tones: GRASS_TONES.lawn, seed: seed * 17 + n }));
    } else {
      spots(seed, 7, 4.5).forEach(([i, k], n) => {
        if (n < 4) grassTuft(g, i, k, { height: r.int(6, 10), radius: 0.9, spacing: 1.2, lean: 0.6, nub: 0.4, arms: 0.3, tones: GRASS_TONES.lawn, seed: seed * 53 + n });
        else plusTuft(g, i, k, { seed: seed * 31 + n });
      });
    }
    clipToFootprint(g, N, N);
    // Brighter sunlit tops than the patches': the sheet's crosses shine against the lawn.
    commitGrass(p, g, { seed, sun: 0.7 });

    // The body's skin: lawn on top (darker around the tufts, most on the side away
    // from the key light, upper left in front), earth down the sides.
    const t = new Texels('soil');
    const cells = skinCells(t);
    const top = cells.filter(([, j]) => j === -1);
    const sides = cells.filter(([, j]) => j < -1);
    const tone = lawnMosaic(N, N, seed);
    const tuft = (i: number, k: number) => g.has(i, 0, k);
    const shade = (i: number, k: number) => (tuft(i - 1, k) || tuft(i, k + 1) || tuft(i - 1, k + 1) ? 3 : tuft(i + 1, k) || tuft(i, k - 1) ? 1 : 0);
    for (const [i, j, k] of top) {
      if (bare(i, k)) t.set(i, j, k, DIRT[Math.floor(texelValue(i, 0, k, seed, 0.5, 0.4) * DIRT.length)]);
      else t.set(i, j, k, LAWN_TONES[Math.max(0, tone[k * N + i] - shade(i, k))], { mat: 'leaves' });
    }
    const value = ([i, j, k]: [number, number, number]) => texelValue(i, j, k, seed, 0.5, 0.45);
    const rank = toneRanker(sides.map(value), EARTH_SHARES);
    for (const c of sides) t.set(c[0], c[1], c[2], EARTH[rank(value(c))]);
    // A few grey stones, one or two texels, in the lower earth.
    for (const [i, j, k] of sides) if (j < -3 && texelValue(i, j, k, seed + 9, 0.7, 0.5) > 0.8) t.set(i, j, k, STONE[Math.floor(texelValue(i, j, k, seed + 10, 0.9, 0.3) * STONE.length)]);
    // Grass over the edges: under the lawn's lip, one to six texels hanging down.
    for (const [i, k] of edgeColumns()) {
      if (bare(i, k)) continue;
      const len = r.int(1, 3) + (r.chance(0.4) ? r.int(1, 3) : 0);
      for (let d = 0; d < len; d++) t.set(i, -2 - d, k, d === 0 ? r.pick(DRIP_TOP) : r.pick(DRIP), { mat: 'leaves' });
    }
    t.emit(p.voxels);
    p.collider(-0.5, -0.5, -0.5, 0.5, 0, 0.5);
    return p.done();
  },
});
