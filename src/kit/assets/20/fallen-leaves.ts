import { LEAF_SHAPES, LeafBed, leafCluster, leafPile, LITTER_MIX, LITTER_TONES, scatterLeaves, type LeafShape } from '../../lib/leaves';
import { PieceBuilder } from '../../PieceBuilder';
import { rng, TEXEL, type Rng } from '../../shapes';
import { leafSurf } from '../../surface';
import { defineKitAsset, type KitPiece } from '../../types';

/**
 * ⑨ Fallen leaves: loose ground detail, no tile — as the sheet draws it,
 * rosettes of lobed leaves (brown, orange, rust, olive; one fresh green-yellow)
 * lying round a point and over each other, small stacked piles, and single
 * leaves between them. Leaves rest on the ground and on each other; nothing to
 * collide with.
 */

/** The sheet's leaves: lobed oak-like blades, now and then a star. */
const LOBED: readonly LeafShape[] = [LEAF_SHAPES.oak, LEAF_SHAPES.oak, LEAF_SHAPES.oak, LEAF_SHAPES.star];
const SIZE = [0.13, 0.21] as const;
/** A finer lattice than the tile's (a quarter texel) so an oak leaf's lobes show, and thinner plates (≈ 1 cm, as drawn). */
const FINE = { cell: TEXEL / 4, thick: TEXEL / 6 };
/** Fresh leaves: yellow-green with yellowing blotches. */
const FRESH = { palette: LITTER_MIX.fresh, surf: leafSurf({ yellow: 0.35 }) };

type Group = (bed: LeafBed, p: PieceBuilder, x: number, z: number, seed: number) => void;

const cluster =
  (count: number, palette: readonly number[], o: { surf?: ReturnType<typeof leafSurf>; size?: readonly [number, number] } = {}): Group =>
  (bed, p, x, z, seed) =>
    leafCluster(p, { bed, x, z, count, palette, shapes: LOBED, size: o.size ?? SIZE, surf: o.surf, torn: 0.2, ...FINE, seed });

/** A low stack of leaves (no core): the sheet's small piles. */
const stack =
  (count: number, palette: readonly number[]): Group =>
  (bed, p, x, z, seed) =>
    leafPile(p, { bed, x, z, r: 0.14, height: 0.06, count, palette, shapes: LOBED, size: SIZE, torn: 0.2, ...FINE, seed });

/** Single leaves spread over a w × d area, kept apart from everything else. */
function singles(bed: LeafBed, p: PieceBuilder, x: number, z: number, w: number, d: number, count: number, palette: readonly number[], seed: number): void {
  scatterLeaves(p, { bed, x, z, w, d, count, palette, shapes: LOBED, size: [0.1, 0.19], torn: 0.3, spacing: 1.4, ...FINE, seed });
}

/**
 * The sheet's whole card: a big mixed rosette, an olive one, a rust stack, a
 * green-yellow rosette, a small rust pair and single leaves round them —
 * group spots jittered and swapped by seed.
 */
function litter(bed: LeafBed, p: PieceBuilder, r: Rng, seed: number): void {
  const groups: Group[] = [
    cluster(12, LITTER_MIX.fallen),
    cluster(7, [...LITTER_TONES.olive, ...LITTER_TONES.olive, ...LITTER_TONES.brown, ...LITTER_TONES.yellow]),
    stack(6, LITTER_MIX.autumn),
    cluster(6, FRESH.palette, { surf: FRESH.surf, size: [0.12, 0.17] }),
    cluster(4, LITTER_MIX.autumn, { size: [0.11, 0.16] }),
  ];
  const spots: [number, number][] = [
    [-0.28, -0.18],
    [0.28, -0.2],
    [0.3, 0.16],
    [-0.1, 0.24],
    [-0.44, 0.26],
  ];
  // Swap the small groups' spots now and then, so seeds differ in layout too.
  if (r.chance(0.5)) [spots[3], spots[4]] = [spots[4], spots[3]];
  if (r.chance(0.5)) [spots[1], spots[2]] = [spots[2], spots[1]];
  groups.forEach((g, i) => g(bed, p, spots[i][0] + r.range(-0.05, 0.05), spots[i][1] + r.range(-0.05, 0.05), seed * 11 + i));
  singles(bed, p, 0, 0.02, 1.15, 0.9, 9, LITTER_MIX.fallen, seed + 5);
}

function build(variant: string, seed: number): KitPiece {
  const p = new PieceBuilder();
  const r = rng(seed * 29 + 3);
  const bed = new LeafBed({ w: 1.8, d: 1.5 });
  if (variant === 'cluster') cluster(11, LITTER_MIX.fallen)(bed, p, 0, 0, seed);
  else if (variant === 'pile') leafPile(p, { bed, r: 0.2, height: 0.06, count: 11, palette: LITTER_MIX.fallen, shapes: LOBED, size: SIZE, torn: 0.2, ...FINE, seed });
  else if (variant === 'single') singles(bed, p, 0, 0, 0.55, 0.45, 5, LITTER_MIX.fallen, seed);
  else if (variant === 'green') cluster(7, FRESH.palette, { surf: FRESH.surf })(bed, p, 0, 0, seed);
  else if (variant === 'autumn') cluster(9, LITTER_MIX.autumn)(bed, p, 0, 0, seed);
  else litter(bed, p, r, seed);
  bed.commit(p);
  return p.done();
}

export default defineKitAsset({
  section: '20',
  order: 9,
  name: 'Fallen leaves',
  caption: 'Dry and fallen leaves (ground detail).',
  size: {
    real: 'leaves 0.1–0.21 m; rosettes 0.35–0.5 m across; litter patch ≈ 1.3 × 1 m',
    sheet: 'not given',
    note: 'Built to real leaf size: Angkor’s trees (dipterocarps, figs) drop leaves 15–25 cm long, the small ones less. The sheet’s stylised lobed leaves keep their outline at that size; a rosette of 6–12 of them spans about half a metre.',
  },
  variants: [
    { id: 'litter', name: 'Leaf litter' },
    { id: 'cluster', name: 'Cluster' },
    { id: 'pile', name: 'Small pile' },
    { id: 'green', name: 'Green-yellow' },
    { id: 'autumn', name: 'Rust red' },
    { id: 'single', name: 'Single leaves' },
  ],
  shots: [
    { view: 'iso', variant: 'cluster', label: 'Cluster' },
    { view: 'iso', variant: 'pile', label: 'Small pile' },
    { view: 'iso', variant: 'green', label: 'Green-yellow' },
    { view: 'top', label: 'Top view' },
  ],
  ref: { sheet: 'section 20/6706F03E-0DFA-4AFA-80F0-5C031D4F49D5.PNG', box: [916, 408, 1222, 692] },
  build: ({ variant, seed }) => build(variant, seed),
});
