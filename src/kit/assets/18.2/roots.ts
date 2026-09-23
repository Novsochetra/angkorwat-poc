import { hash3 } from '../../../voxel/random';
import type { VoxelGrid } from '../../../voxel/VoxelBuilder';
import { TILE } from '../../lib/ground';
import { commitRoots, cutStump, mossOver, ROOT_LOOK, trail, type RootGround, type RootStyle, type TrailFork } from '../../lib/roots';
import { PieceBuilder } from '../../PieceBuilder';
import { rng, TEXEL, tone } from '../../shapes';
import { stoneSurf } from '../../surface';
import { defineKitAsset, type KitPiece } from '../../types';
import { DEPTH, N, Texels, edgeColumns, onSide, onTop, skinCells, texelValue, toneRanker } from './_tiles';

/**
 * ⑦ Roots: a 1 m tile of dark forest floor with mossy patches and pale roots
 * running over it. On the sheet's main tile a cut stump stands at the back
 * with a clean ring top, and a few continuous roots, 2–4 texels thick, fan out
 * from its foot across the top, fork, and drape over the front and right
 * edges down the dark earth sides; plenty of soil and moss shows between
 * them, with grey pebbles. The small cubes show thin roots and a root cluster.
 *
 * The ground is painted texel by texel like the other §18.2 tiles (sheet
 * colours through `onTop` / `onSide`); the roots and the stump are texel
 * cells on top that merge into smooth knuckles.
 */

/** Earth of the sides (sheet: the main tile's lit front face), dark → light, and shares. */
const EARTH = [0x2d2015, 0x4b3321, 0x5e402b, 0x6c4a31, 0x7a5639].map(onSide);
const EARTH_W = [8, 16, 30, 30, 16];
/** Bare forest floor on top (sheet: the top view between the moss). */
const SOIL = [0x2a2119, 0x3d3022, 0x4e3c2a, 0x5f4a33].map(onTop);
const SOIL_W = [15, 30, 35, 20];
/** The moss carpet, dark hollows to sunlit yellow, and its raised cushions. */
const MOSS = [0x3c4420, 0x505623, 0x6c702b, 0x8f8e34, 0xb9ad31].map(onTop);
const MOSS_W = [12, 24, 30, 22, 12];
const CUSHION = [0x5a6428, 0x767a2c, 0x908e2c, 0xaaa42e, 0xc4b84c].map(onTop);
const MOSS_SIDE = [0x2c341f, 0x3e4824, 0x54602a, 0x6c742c, 0x868a30].map(onSide);
/** Grey pebbles, plus-shaped like the sheet's top view. */
const PEBBLE = [0x6c655d, 0x847a70, 0x9a9086, 0x5a544e];

interface Look {
  /** Share of the top under moss, and of the moss raised into cushions. */
  moss: number;
  lift: number;
  pebbles: number;
}

const LOOKS: Record<string, Look> = {
  thick: { moss: 0.56, lift: 0.6, pebbles: 3 },
  thin: { moss: 0.62, lift: 0.55, pebbles: 4 },
  cluster: { moss: 0.56, lift: 0.55, pebbles: 3 },
};

/** A root of a layout: heading in degrees, length and radii (metres), how far it hangs down the side. */
interface Root {
  deg: number;
  len: number;
  r: [number, number];
  hang: number;
  bend?: number;
  split?: number;
  forks?: TrailFork[];
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * The main tile: from the stump's foot a thick root to the front, forking to
 * the front-left corner; one diagonal to the front-right, forking to the
 * right side; one to the right side; short ones over the left and back edges.
 */
const THICK: Root[] = [
  { deg: 100, len: 0.62, r: [0.088, 0.056], hang: 0.34, bend: -0.25, split: 0.5, forks: [{ at: 0.42, turn: 0.62, length: 0.36, share: 0.72, end: 0.75, hang: 0.2 }] },
  { deg: 50, len: 0.86, r: [0.092, 0.056], hang: 0.38, bend: 0.2, split: 0.55, forks: [{ at: 0.5, turn: -0.72, length: 0.36, share: 0.75, end: 0.8, hang: 0.28 }] },
  { deg: -6, len: 0.66, r: [0.08, 0.052], hang: 0.28, bend: 0.3 },
  { deg: 158, len: 0.3, r: [0.07, 0.046], hang: 0.16 },
  { deg: 225, len: 0.28, r: [0.062, 0.044], hang: 0.14 },
];

/** Thin roots: a web coming in over the back edge, forking twice on its way to the front and right. */
const THIN: Root[] = [
  { deg: 88, len: 1.1, r: [0.05, 0.035], hang: 0.3, bend: -0.35, split: 0.5, forks: [{ at: 0.3, turn: 0.75, length: 0.55, share: 0.8, end: 0.8, hang: 0.24, forks: [{ at: 0.5, turn: -0.7, length: 0.3, share: 0.85, hang: 0.18 }] }] },
  { deg: 62, len: 1.2, r: [0.048, 0.034], hang: 0.34, bend: 0.25, split: 0.6, forks: [{ at: 0.4, turn: -0.8, length: 0.55, share: 0.8, end: 0.85, hang: 0.3, split: 0.5 }] },
];

/** A root cluster: a gnarled knot at the back, six roots arching out of it and fanning to the edges. */
const CLUSTER: Root[] = [
  { deg: 95, len: 0.7, r: [0.075, 0.058], hang: 0.3, bend: -0.2, split: 0.5 },
  { deg: 62, len: 0.8, r: [0.072, 0.055], hang: 0.34, bend: 0.25, forks: [{ at: 0.55, turn: 0.55, length: 0.3, share: 0.75, end: 0.8, hang: 0.22 }] },
  { deg: 22, len: 0.72, r: [0.07, 0.054], hang: 0.26, bend: -0.2 },
  { deg: 130, len: 0.5, r: [0.065, 0.05], hang: 0.22 },
  { deg: -28, len: 0.5, r: [0.06, 0.045], hang: 0.18 },
  { deg: 200, len: 0.3, r: [0.055, 0.04], hang: 0.12 },
];

/** The tile's body cells as ghosts in the roots' grid: the top and the side skin, so roots get their contact shadow. */
function ghostBody(g: VoxelGrid): void {
  for (let j = -DEPTH; j <= -1; j++)
    for (let i = 0; i < N; i++)
      for (let k = 0; k < N; k++) if (j === -1 || i === 0 || k === 0 || i === N - 1 || k === N - 1) g.ghost(i, j, k);
}

function build(variant: string, seed: number): KitPiece {
  const p = new PieceBuilder();
  const look = LOOKS[variant] ?? LOOKS.thick;
  const r = rng(seed * 17 + 5);
  p.collider(-TILE / 2, -DEPTH * TEXEL, -TILE / 2, TILE / 2, 0, TILE / 2);

  // Roots and stump: texel cells on the top (cell (i, 0, k) stands on top texel (i, k)).
  const g = p.voxels.grid({ cell: TEXEL, origin: [-TILE / 2, 0, -TILE / 2], mat: 'trunk', jitter: 0.05, ao: 0.32, seed });
  ghostBody(g);
  const ground: RootGround = { height: (x, z) => (Math.abs(x) > TILE / 2 || Math.abs(z) > TILE / 2 ? -Infinity : 0) };
  const style: RootStyle = { look: ROOT_LOOK.clean, seed, ground, wiggle: 0.8, taper: 1.2, knuckle: TEXEL * 5 };
  const lay = (roots: Root[], at: [number, number], start: number, lift: number) =>
    roots.forEach((o, n) => {
      const h = rad(o.deg) + r.range(-0.1, 0.1);
      const len = o.len * r.range(0.95, 1.05);
      const from = [at[0] + Math.cos(h) * start, lift, at[1] + Math.sin(h) * start] as const;
      trail(g, { from, heading: h, length: len, radius: o.r, tip: TEXEL * 0.45, drop: 0.16, bend: o.bend, hang: o.hang * r.range(0.85, 1.1), split: o.split, forks: o.forks }, style, n + 2);
    });
  if (variant === 'thin') {
    lay(THIN, [r.range(-0.08, 0.02), -TILE / 2 + 0.02], 0, 0);
  } else if (variant === 'cluster') {
    // The knot: a lumpy mound of bark the roots arch out of.
    const [ci, ck] = [6 + r.int(0, 1), 5 + r.int(0, 1)];
    for (let i = ci - 2; i <= ci + 2; i++)
      for (let k = ck - 2; k <= ck + 2; k++) {
        const d = Math.hypot(i - ci, k - ck);
        const hgt = d < 1 ? 3 : d < 1.9 ? 2 : d < 2.3 && hash3(i, 0, k, seed) < 0.6 ? 1 : 0;
        for (let j = 0; j < hgt; j++) g.set(i, j, k, tone(ROOT_LOOK.clean.bark, i, j, k, seed), 'trunk');
      }
    lay(CLUSTER, [(ci + 0.5) * TEXEL - TILE / 2, (ck + 0.5) * TEXEL - TILE / 2], 0.05, 0.07);
  } else {
    // The stump at the back, drawn over its roots' starts: they leave its foot.
    const at: [number, number] = [4.5 * TEXEL - TILE / 2, 4.5 * TEXEL - TILE / 2];
    lay(THICK, at, 0.1, 0);
    cutStump(g, { look: ROOT_LOOK.clean, seed, at, radius: 2.4 * TEXEL, height: 5 * TEXEL });
    p.collider(at[0] - 0.16, 0, at[1] - 0.16, at[0] + 0.16, 5 * TEXEL, at[1] + 0.16);
  }
  mossOver(g, { amount: variant === 'thin' ? 0.12 : 0.08, seed });

  // Pebbles where the roots left room: plus-shaped, a few with a raised middle.
  const free = (i: number, k: number, pad: number) => {
    for (let a = i - pad; a <= i + pad; a++) for (let b = k - pad; b <= k + pad; b++) if (a < 0 || b < 0 || a >= N || b >= N || g.has(a, 0, b)) return false;
    return true;
  };
  for (let n = 0, tries = 0; n < look.pebbles && tries < 80; tries++) {
    const [ci, ck] = [r.int(2, N - 3), r.int(2, N - 3)];
    if (!free(ci, ck, 1)) continue;
    n++;
    const tall = r.chance(0.5);
    for (const [di, dk] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) g.set(ci + di, 0, ck + dk, tone(PEBBLE, ci + di, 0, ck + dk, seed), 'sandstone', 1, stoneSurf({ lichen: 0.25, moss: 0.1 }));
    if (tall) g.set(ci, 1, ck, tone(PEBBLE, ci, 1, ck, seed + 1), 'sandstone', 1, stoneSurf({ lichen: 0.25 }));
  }

  // The ground, texel by texel: earth sides, forest floor and moss on top.
  const t = new Texels('soil', { ao: 0.3 });
  const cells = skinCells(t);
  const sides = cells.filter(([, j]) => j < -1);
  const sv = sides.map(([i, j, k]) => texelValue(i, j, k, seed, 0.5, 0.45));
  const sr = toneRanker(sv, EARTH_W);
  sides.forEach(([i, j, k], n) => t.set(i, j, k, EARTH[sr(sv[n])]));
  const tops = cells.filter(([, j]) => j === -1);
  const mv = tops.map(([i, , k]) => texelValue(i, 4, k, seed + 3, 0.34, 0.72));
  const mossCut = [...mv].sort((a, b) => b - a)[Math.floor(mv.length * look.moss)];
  const mossy = new Set(tops.filter((_, n) => mv[n] > mossCut).map(([i, , k]) => i * N + k));
  const moss = tops.filter(([i, , k]) => mossy.has(i * N + k));
  const soil = tops.filter(([i, , k]) => !mossy.has(i * N + k));
  const tv = soil.map(([i, j, k]) => texelValue(i, j, k, seed + 5, 0.6, 0.45));
  const tr = toneRanker(tv, SOIL_W);
  soil.forEach(([i, j, k], n) => t.set(i, j, k, SOIL[tr(tv[n])]));
  const cv = moss.map(([i, , k]) => texelValue(i, 6, k, seed + 7, 0.55, 0.5));
  const cr = toneRanker(cv, MOSS_W);
  moss.forEach(([i, , k], n) => t.set(i, -1, k, MOSS[cr(cv[n])], { mat: 'leaves' }));

  // Cushions on the moss where nothing stands, most against the roots: one dark body colour,
  // lit tops painted texel by texel, a second tier in the middle of a patch.
  const lump = t.loose();
  const nearRoot = (i: number, k: number) => [-1, 1].some((d) => g.get(i + d, 0, k)?.mat === 'trunk' || g.get(i, 0, k + d)?.mat === 'trunk');
  const gv = moss.map(([i, , k]) => texelValue(i, 8, k, seed + 11, 0.5, 0.6) + (nearRoot(i, k) ? 0.18 : 0));
  const cut1 = [...gv].sort((a, b) => b - a)[Math.floor(gv.length * look.lift)];
  const raised = new Set(moss.filter((_, n) => gv[n] > cut1).map(([i, , k]) => i * N + k));
  moss.forEach(([i, , k], n) => {
    if (gv[n] <= cut1 || g.has(i, 0, k) || g.has(i, 1, k)) return;
    const lit = Math.min(CUSHION.length - 2, Math.floor(texelValue(i, 9, k, seed + 13, 0.6, 0.45) * (CUSHION.length - 1)));
    t.set(i, 0, k, CUSHION[0], { mat: 'leaves', group: lump, ao: true, cap: CUSHION[lit] });
    g.ghost(i, 0, k);
    const inner = [raised.has((i + 1) * N + k), raised.has((i - 1) * N + k), raised.has(i * N + k + 1), raised.has(i * N + k - 1)].every(Boolean);
    if (!inner || hash3(i, 1, k, seed + 15) < 0.25) return;
    t.set(i, 1, k, CUSHION[0], { mat: 'leaves', group: lump, ao: true, cap: CUSHION[lit + 1] });
    g.ghost(i, 1, k);
  });

  // Moss hanging over the edges here and there under the mossy rim: short ragged drips,
  // and a few patches of it further down the sides.
  for (const [i, k] of edgeColumns()) {
    const v = texelValue(i, 2, k, seed + 17, 0.35, 0.55);
    if (!mossy.has(i * N + k) || v < 0.4) continue;
    const len = Math.round(v * v * 5);
    for (let j = -2; j >= Math.max(-DEPTH, -1 - len); j--) t.set(i, j, k, MOSS_SIDE[Math.min(MOSS_SIDE.length - 1, Math.floor(texelValue(i, j, k, seed + 19, 0.6, 0.5) * MOSS_SIDE.length) + (j === -2 ? 1 : 0))], { mat: 'leaves' });
  }
  const skin = sides.filter(([i, j, k]) => j > -DEPTH + 2 && texelValue(i, j, k, seed + 23, 0.45, 0.7) > 0.74);
  for (const [i, j, k] of skin) t.set(i, j, k, MOSS_SIDE[Math.floor(hash3(i, j, k, seed + 25) * (MOSS_SIDE.length - 1))], { mat: 'leaves' });

  commitRoots(g, p.voxels);
  t.emit(p.voxels);
  return p.done();
}

export default defineKitAsset({
  section: '18.2',
  order: 7,
  name: 'Roots',
  caption: 'Roots breaking through the forest floor.',
  size: { real: '1 m × 1 m tile, 0.5 m of soil; roots 6–18 cm thick, a stump ⌀ 30 cm', note: 'The kit’s ground grid: 1 m tiles, walkable top at 0. The stump is a small one so it fits a tile.' },
  variants: [
    { id: 'thick', name: 'Thick roots' },
    { id: 'thin', name: 'Thin roots' },
    { id: 'cluster', name: 'Root cluster' },
  ],
  shots: [
    { view: 'iso', variant: 'thin', label: 'Thin roots' },
    { view: 'iso', variant: 'cluster', label: 'Root cluster' },
    { view: 'top', label: 'Top view (tile)' },
  ],
  ref: { sheet: 'section 18/section 18.2.png', box: [1139, 130, 1331, 662] },
  build: ({ variant, seed }) => build(variant, seed),
});
