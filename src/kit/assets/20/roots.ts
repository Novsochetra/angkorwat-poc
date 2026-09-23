import { hash3 } from '../../../voxel/random';
import type { VoxelGrid } from '../../../voxel/VoxelBuilder';
import { BlockSet } from '../../BlockSet';
import { commitRoots, hollowStump, mossOver, ROOT_LOOK, rootLimb, type RootGround, type RootPoint, type RootStyle } from '../../lib/roots';
import { PieceBuilder } from '../../PieceBuilder';
import { fillEllipsoid, rng, TEXEL, tone } from '../../shapes';
import { leafSurf, STONE_FINISH, stoneSurf, surfMax } from '../../surface';
import { defineKitAsset, type KitPiece } from '../../types';

/**
 * ⑩ Roots — "tree roots growing over ruins": the sheet's big hollow stump,
 * broken off 1.2–1.3 m up, a dark rotten hollow inside its ragged rim, its
 * thick gnarled roots flaring out of the foot as buttresses and running off
 * over the ground, arching over a knee here and there and gripping it with
 * forked toes; and knotty root masses without a trunk — a thick limb raised
 * on its legs and broken off in a square-cut stub, a root grown along a
 * fallen sandstone block with its legs gripping down the block's sides, and
 * a low root plate where a tree rotted away. Brown bark with lighter ridges,
 * moss on the tops and leafy moss clumps in the crotches.
 *
 * Everything is built of the kit's 1/16 m texels; the trunk's boards and the
 * buttresses' walls are joined into tall blocks (see `commitRoots`), so the
 * big stump stays within a prop's block budget.
 */

/** Leafy moss clumps, dark → sunlit (sheet: the olive-green clumps around the stump's foot). */
const GREENS = [0x3c4c22, 0x4e6228, 0x647a2e, 0x7a8e34, 0x97a63e];
/** Moss pads on the wood's tops, and the pattern of the clumps' sunlit tips. */
const MOSS = [0x4a5a26, 0x5e7030, 0x74863a, 0x8c9a40];
const TIPS = leafSurf({ yellow: 0.3 });

/**
 * Leafy clumps in the crotches: free ground next to the wood, near where the
 * roots leave the stump or the limb (`near`), a few texels high.
 */
function clumps(g: VoxelGrid, seed: number, near: RootPoint[], count: number): void {
  const r = rng(seed * 7 + 5);
  const wood = (x: number, z: number) => g.has(Math.floor(x / TEXEL), 0, Math.floor(z / TEXEL));
  for (let n = 0, tries = 0; n < count && tries < count * 12; tries++) {
    const k = near[Math.floor(r() * near.length)];
    if (!k) return;
    const a = r.range(0, Math.PI * 2);
    const d = k.r + r.range(0.04, 0.16);
    const [x, z] = [k.x + Math.cos(a) * d, k.z + Math.sin(a) * d];
    const d2 = TEXEL * 2;
    if (wood(x, z) || !(wood(x + d2, z) || wood(x - d2, z) || wood(x, z + d2) || wood(x, z - d2))) continue;
    n++;
    const [ci, ck] = [x / TEXEL, z / TEXEL];
    const rad: [number, number, number] = [r.range(1.2, 2.2), r.range(1.1, 2), r.range(1.2, 2.2)];
    fillEllipsoid(g, [ci, 0, ck], rad, (i, j, k2) => (j < 0 || g.has(i, j, k2) ? null : tone(GREENS, i, j + (j > 0 ? 1 : 0), k2, seed)), { rough: 0.45, seed: seed + n });
  }
}

function build(variant: string, seed: number, height?: number): KitPiece {
  const p = new PieceBuilder();
  const r = rng(seed * 11 + 3);
  // Wood and moss on one texel grid (the wood is painted as bark, the grid's own family is the moss's).
  const g = p.voxels.grid({ cell: TEXEL, origin: [0, 0, 0], mat: 'leaves', jitter: 0.06, ao: 0.58, seed });
  const style: RootStyle = { look: ROOT_LOOK.gnarled, seed, wiggle: 1.1, taper: 1.5, flat: 1, knuckle: TEXEL * 5 };
  let near: RootPoint[] = [];
  let greens = 10;

  if (variant === 'stump') {
    // The sheet's big stump: ⌀ 0.9 m (1.2 m over the flare), broken off 1.2–1.3 m up, eight roots reaching ~1.5 m.
    const H = height ?? r.range(1.2, 1.3);
    near = hollowStump(g, { ...style, radius: 0.46, height: H, roots: 8, reach: 1.55, thickness: 0.16, lift: 0.4, hollow: 0.45 }).filter((k) => Math.hypot(k.x, k.z) < 0.9);
    greens = 20;
    p.collider(-0.46, 0, -0.46, 0.46, H, 0.46);
    // The flare and the roots near the trunk: a low step around it.
    p.collider(-0.85, 0, -0.85, 0.85, 0.35, 0.85);
  } else if (variant === 'over-stone') {
    // A fallen block, weathered and mossy, a root lying along it with its legs gripping down its long sides.
    const f = STONE_FINISH.weathered;
    const set = new BlockSet(0.125);
    set.add(-0.5, 0, -0.25, 0.5, 0.5, 0.25, f.palette[seed % f.palette.length], { surf: surfMax(f.surf, stoneSurf({ moss: 0.45 })) });
    set.erode(f.wear, seed + 5);
    set.emit(p.voxels, { seed });
    p.collider(-0.5, 0, -0.25, 0.5, 0.5, 0.25);
    const onStone = (x: number, z: number) => Math.abs(x) < 0.5 && Math.abs(z) < 0.25;
    const ground: RootGround = { height: (x, z) => (onStone(x, z) ? 0.5 : 0), soft: (x, z) => !onStone(x, z) };
    // The stone is solid for the wood's shading.
    for (let i = -8; i < 8; i++) for (let k = -4; k < 4; k++) for (let j = 0; j < 8; j++) g.ghost(i, j, k);
    near = rootLimb(g, { ...style, ground, at: [r.range(-0.1, 0.1), r.range(-0.05, 0.05)], heading: r.range(-0.25, 0.25), length: 2.3, height: 0.02, thickness: 0.14, legs: 6 });
  } else if (variant === 'spread') {
    // A low root plate where the tree rotted away: a rotten ring of a base, roots radiating 1.5 m.
    near = hollowStump(g, { ...style, radius: 0.36, height: 0.25, roots: 8, reach: 1.55, thickness: 0.13, lift: 0.55, hollow: 0.12 }).filter((k) => Math.hypot(k.x, k.z) < 0.8);
    p.collider(-0.4, 0, -0.4, 0.4, 0.28, 0.4);
  } else {
    // A gnarled cluster: a thick limb raised on its legs, broken off in a stub at one end.
    near = rootLimb(g, { ...style, heading: r.range(-0.4, 0.4) + (r.chance(0.5) ? Math.PI : 0), length: 2, height: 0.22, thickness: 0.16, legs: 7, stub: true });
    greens = 7;
    const body = near.filter((k) => k.y > 0.2);
    if (body.length) {
      const xs = body.map((k) => k.x);
      const zs = body.map((k) => k.z);
      p.collider(Math.min(...xs), 0, Math.min(...zs), Math.max(...xs), Math.max(...body.map((k) => k.y + k.r)), Math.max(...zs));
    }
  }

  // Moss: pads on the wood's tops, leafy clumps in the crotches, a few bright tips.
  mossOver(g, { amount: variant === 'stump' ? 0.06 : 0.12, seed, palette: MOSS });
  clumps(g, seed, near, greens);
  const foot: [number, number][] = [];
  g.forEach((i, j, k, c) => {
    if (c.ghost) return;
    if (j === 0) foot.push([i, k]);
    if (c.mat === 'leaves' && !g.has(i, j + 1, k) && hash3(i, j, k, seed + 9) < 0.12) g.set(i, j, k, GREENS[GREENS.length - 1], 'leaves', 1, TIPS);
  });
  // The ground under it all, so everything gets its contact shadow.
  for (const [i, k] of foot) for (let a = 0; a < 9; a++) g.ghost(i + (a % 3) - 1, -1, k + Math.floor(a / 3) - 1);
  commitRoots(g, p.voxels, { columns: true });
  return p.done();
}

export default defineKitAsset({
  section: '20',
  order: 10,
  name: 'Roots',
  caption: 'Tree roots growing over ruins.',
  size: {
    real: 'stump ⌀ 0.9 m (1.2 m over the flare), 1.2–1.3 m tall, roots reaching ~1.5 m from its axis (≈ 3 m across); clusters ~2 m long, up to 0.65 m high',
    sheet: 'not given',
    note: 'A big rainforest tree broken off above its root flare, as tall as the sheet’s stump is to its width; the clusters are root masses a person steps around.',
  },
  variants: [
    { id: 'stump', name: 'Stump' },
    { id: 'cluster', name: 'Root cluster' },
    { id: 'over-stone', name: 'Over a stone' },
    { id: 'spread', name: 'Root plate' },
  ],
  ref: { sheet: 'section 20/6706F03E-0DFA-4AFA-80F0-5C031D4F49D5.PNG', box: [1230, 408, 1520, 692] },
  build: ({ variant, seed, height }) => build(variant, seed, height),
});
