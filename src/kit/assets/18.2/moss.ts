import { PieceBuilder } from '../../PieceBuilder';
import { rng, scatter } from '../../shapes';
import { defineKitAsset, type KitPiece } from '../../types';
import { DEPTH, N, Texels, edgeColumns, mix, onSide, onTop, skinCells, texelValue, toneRanker } from './_tiles';

/**
 * ④ Moss: ground grown over with moss — soft yellow-green cushions and darker
 * hollows, grey-brown stones peeking through, and the moss draping over the
 * edges down a dark earth body, as on the sheet. The mossy-stone variant is a
 * block of old sandstone with moss in its joints and on its tops.
 */
interface MossLook {
  /** Carpet tones (sheet colours, dark → light) and their shares; cushions take the lighter end. */
  moss: readonly number[];
  mossW: readonly number[];
  /** Cushion tones, from the hollows up to the sunlit tips. */
  cushion: readonly number[];
  /** Share of the moss raised one texel into cushions, and two texels. */
  lift: number;
  lift2: number;
  /** Stones showing through the moss, and their radius (texels). */
  stones: number;
  stoneR: [number, number];
  /** Solid moss rows along the top of the sides, and the longest drip below them (texels). */
  band: number;
  drip: number;
}

const LOOKS: Record<string, MossLook> = {
  // The sheet's main cube: cushions over stone, a few stones showing.
  light: {
    moss: [0x2a3024, 0x494b36, 0x5c6230, 0x6e6c34, 0x84832d],
    mossW: [10, 20, 26, 26, 18],
    cushion: [0x5a6428, 0x767a2c, 0x908e2c, 0xaaa42e, 0xc4b84c],
    lift: 0.5,
    lift2: 0.05,
    stones: 5,
    stoneR: [1.4, 2.6],
    band: 1,
    drip: 5,
  },
  // Thick, dark, lumpy moss: hardly any stone left.
  dense: {
    moss: [0x1e251c, 0x2e3822, 0x3e4a25, 0x525e28, 0x6a722a],
    mossW: [16, 24, 28, 20, 12],
    cushion: [0x46522a, 0x5e6a2c, 0x78802e, 0x929430, 0xaaa63a],
    lift: 0.72,
    lift2: 0.3,
    stones: 2,
    stoneR: [1.2, 2],
    band: 2,
    drip: 7,
  },
};

const STONE = [0x4e4a38, 0x5e5842, 0x6c644c, 0x7a7056, 0x8a7e62].map(onTop);
const STONE_W = [12, 26, 32, 20, 10];
const EARTH = {
  tones: [0x2e2619, 0x4e3e27, 0x6a4d35, 0x7d5d40, 0x947050].map(onSide),
  weights: [10, 28, 35, 20, 7],
};
const MOSS_SIDE = [0x2c341f, 0x3e4824, 0x54602a, 0x6c742c, 0x868a30].map(onSide);

/** Mossy stone: grey-brown sandstone blocks (sheet: the third small cube). */
const BLOCK = [0x9c8a68, 0xb39d7d, 0xa8957a, 0xc2ad8e].map(onTop);
const BLOCK_SIDE = [0x7a6a52, 0x6a5c46, 0x857258, 0x5e5240].map(onSide);

/**
 * Moss hanging over a tile edge: a solid band along the top of the side under
 * every mossy edge texel, then ragged drips (noise lengths, a few long strands).
 */
function drape(t: Texels, mossy: (i: number, k: number) => boolean, band: number, drip: number, seed: number): void {
  for (const [i, k] of edgeColumns()) {
    if (!mossy(i, k)) continue;
    const v = texelValue(i, 2, k, seed, 0.35, 0.55);
    const len = band + Math.round(v * v * drip * 1.6);
    for (let j = -2; j >= Math.max(-DEPTH, -1 - len); j--) {
      // Lighter where the band catches the light, darker down the drips.
      const tone = Math.min(MOSS_SIDE.length - 1, Math.floor(texelValue(i, j, k, seed + 1, 0.6, 0.5) * MOSS_SIDE.length) + (j >= -1 - band ? 1 : 0));
      t.set(i, j, k, MOSS_SIDE[tone], { mat: 'leaves' });
    }
  }
}

function buildMoss(look: MossLook, seed: number, t: Texels): void {
  const r = rng(seed * 13 + 7);
  const cells = skinCells(t);
  // The earth body.
  const sides = cells.filter(([, j]) => j < -1);
  const sv = sides.map(([i, j, k]) => texelValue(i, j, k, seed, 0.5, 0.45));
  const sr = toneRanker(sv, EARTH.weights);
  sides.forEach(([i, j, k], n) => t.set(i, j, k, EARTH.tones[sr(sv[n])], { mat: 'soil' }));

  // Stones peeking through: rough discs of grey-brown texels, flush with the ground.
  const stone = new Set<number>();
  for (const [x, z] of scatter(seed + 5, look.stones, 0.8, 0.8, 0.3)) {
    const [ci, ck] = [(x + 0.5) * N, (z + 0.5) * N];
    const rad = r.range(look.stoneR[0], look.stoneR[1]);
    for (let i = Math.floor(ci - rad - 1); i <= ci + rad + 1; i++)
      for (let k = Math.floor(ck - rad - 1); k <= ck + rad + 1; k++) {
        if (i < 0 || k < 0 || i >= N || k >= N) continue;
        if (Math.hypot(i + 0.5 - ci, k + 0.5 - ck) < rad + (texelValue(i, 0, k, seed + 9, 0.8, 0.5) - 0.5) * 1.2) stone.add(i * N + k);
      }
  }
  const tops = cells.filter(([, j]) => j === -1);
  const stoneCells = tops.filter(([i, , k]) => stone.has(i * N + k));
  const tv = stoneCells.map(([i, j, k]) => texelValue(i, j, k, seed + 2, 0.6, 0.4));
  const tr = toneRanker(tv, STONE_W);
  stoneCells.forEach(([i, j, k], n) => t.set(i, j, k, STONE[tr(tv[n])]));

  // The moss carpet: every texel its own tone, dark hollows to olive.
  const moss = tops.filter(([i, , k]) => !stone.has(i * N + k));
  const mv = moss.map(([i, , k]) => texelValue(i, 4, k, seed + 3, 0.55, 0.5));
  const mr = toneRanker(mv, look.mossW);
  const carpet = look.moss.map(onTop);
  moss.forEach(([i, , k], n) => t.set(i, -1, k, carpet[mr(mv[n])], { mat: 'leaves' }));

  // Cushions: small lumps where the growth field is high. One body colour for
  // all of them (dark green sides, so neighbouring cubes merge into a soft
  // mass), each texel's top painted from olive to the sheet's sunlit yellow
  // tips, a step brighter on the second tier.
  const grow = moss.map(([i, , k]) => texelValue(i, 6, k, seed + 11, 0.5, 0.62));
  const cut = (share: number) => [...grow].sort((a, b) => b - a)[Math.floor(grow.length * share)] ?? 2;
  const [cut1, cut2] = [cut(look.lift), cut(look.lift2)];
  const cushion = look.cushion.map(onTop);
  const lump = t.loose();
  const raised = moss.map((c, n) => [c, grow[n]] as const).filter(([, g]) => g > cut1);
  const cv = raised.map(([[i, , k]]) => texelValue(i, 8, k, seed + 13, 0.6, 0.45));
  const cr = toneRanker(cv, [14, 24, 28, 22, 12]);
  raised.forEach(([[i, , k], g], n) => {
    const tone = cr(cv[n]);
    t.set(i, 0, k, cushion[0], { mat: 'leaves', group: lump, ao: true, cap: cushion[tone] });
    if (g > cut2) t.set(i, 1, k, cushion[0], { mat: 'leaves', group: lump, ao: true, cap: cushion[Math.min(cushion.length - 1, tone + 1)] });
  });

  drape(t, (i, k) => !stone.has(i * N + k), look.band, look.drip, seed + 17);
}

/**
 * Mossy stone: 2 × 2 sandstone blocks on top, two courses down the sides (the
 * lower one staggered), moss in the joints and over the tops.
 */
function buildStone(seed: number, t: Texels): void {
  const cells = skinCells(t);
  // Which block a skin texel belongs to, and whether it lies in a joint.
  const along = (i: number, k: number) => (k === 0 || k === N - 1 ? i : k);
  const off = (j: number) => (j < -4 ? 4 : 0);
  const blockOf = (i: number, j: number, k: number) => (j === -1 ? (i >> 3) + 2 * (k >> 3) : 4 + ((along(i, k) + off(j)) >> 3) + 3 * (j < -4 ? 1 : 0));
  const joint = (i: number, j: number, k: number) => (j === -1 ? i % 8 === 0 || k % 8 === 0 : (along(i, k) + off(j)) % 8 === 0 || j === -5);
  const v = cells.map(([i, j, k]) => texelValue(i, j, k, seed, 0.5, 0.5));
  const rank = toneRanker(v, [10, 30, 40, 20]);
  const growth = (i: number, j: number, k: number) => texelValue(i, j, k, seed + 5, 0.3, 0.8) + (joint(i, j, k) ? 0.3 : 0) + (j === -1 ? 0.1 : -0.04 * (-1 - j));
  const mossTones = LOOKS.light.moss.map(onTop);
  const tips = LOOKS.light.cushion.map(onTop);
  cells.forEach(([i, j, k], n) => {
    const b = blockOf(i, j, k);
    const shade = [0.9, 0.97, 1.03, 1.1][rank(v[n])];
    const base = j === -1 ? BLOCK[b % BLOCK.length] : BLOCK_SIDE[b % BLOCK_SIDE.length];
    let c = mix(base, shade > 1 ? 0xffffff : 0x000000, Math.abs(1 - shade));
    if (joint(i, j, k)) c = mix(c, 0x201a12, 0.55);
    if (growth(i, j, k) > 0.64) {
      const pal = j === -1 ? mossTones : MOSS_SIDE;
      t.set(i, j, k, pal[Math.floor(texelValue(i, j, k, seed + 6, 0.6, 0.5) * pal.length)], { mat: 'leaves' });
    } else t.set(i, j, k, c);
  });
  // Cushions on the thickest moss of the tops.
  const lump = t.loose();
  for (let i = 0; i < N; i++)
    for (let k = 0; k < N; k++) if (growth(i, -1, k) > 0.84) t.set(i, 0, k, tips[Math.floor(texelValue(i, 1, k, seed + 8, 0.6, 0.5) * tips.length)], { mat: 'leaves', group: lump, ao: true });
}

function build(variant: string, seed: number): KitPiece {
  const t = new Texels('sandstone');
  if (variant === 'stone') buildStone(seed, t);
  else buildMoss(LOOKS[variant] ?? LOOKS.light, seed, t);
  const p = new PieceBuilder();
  t.emit(p.voxels);
  p.collider(-0.5, -0.5, -0.5, 0.5, 0, 0.5);
  return p.done();
}

export default defineKitAsset({
  section: '18.2',
  order: 4,
  name: 'Moss',
  caption: 'Moss cushions over stone and earth, draping over the edges.',
  size: {
    real: '1 m × 1 m tile, 0.5 m deep; cushions up to 12 cm',
    sheet: 'cube ≈ 1 × 0.7 m',
    note: 'The kit’s ground grid: 1 m tiles, walkable top at y = 0 (moss cushions stand 6–12 cm proud), 0.5 m deep so every ground tile lines up.',
  },
  variants: [
    { id: 'light', name: 'Light moss' },
    { id: 'dense', name: 'Dense moss' },
    { id: 'stone', name: 'Mossy stone' },
  ],
  shots: [
    { view: 'iso', variant: 'dense', label: 'Dense moss' },
    { view: 'iso', variant: 'stone', label: 'Mossy stone' },
    { view: 'top', label: 'Top view (tile)' },
  ],
  ref: { sheet: 'section 18/section 18.2.png', box: [590, 130, 782, 662] },
  build: ({ variant, seed }) => build(variant, seed),
});
