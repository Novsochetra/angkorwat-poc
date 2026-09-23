import { fragment, scatterRocks, type TexelBox } from '../../lib/rocks';
import { PieceBuilder } from '../../PieceBuilder';
import { rng } from '../../shapes';
import type { StoneFinish } from '../../surface';
import { defineKitAsset, type KitPiece } from '../../types';
import { PROP_BROKEN, PROP_MOSS, PROP_STONE, PROP_STONE_OLD, PROP_SURF } from './_masonry-props';

/**
 * §20 ① Stone fragments: small broken pieces of sandstone lying about — the
 * sheet's debris is a dozen chunks grouped fairly close, each a little heap of
 * cubes (a bottom course, smaller blocks stacked towards the back), weathered
 * olive-tan with dark pores, chipped edges and moss on the tops.
 */

/**
 * The stone of the §20 masonry props (20/_masonry-props.ts), so the debris sits
 * with the fallen blocks, steps and channels it broke off: their olive-leaning
 * tan with an older, greyer stone here and there, their paler broken faces and
 * their yellow-olive moss (dark → light).
 */
const luma = (c: number) => ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11;
const FINISH: StoneFinish = { palette: [...PROP_STONE, ...PROP_STONE_OLD], surf: PROP_SURF.top, wear: 0.05 };
const STONE = { finish: FINISH, broken: PROP_BROKEN, mossTones: [...PROP_MOSS.deep, ...PROP_MOSS.mid, ...PROP_MOSS.lit].sort((a, b) => luma(a) - luma(b)) };

/** A piece of the sheet's debris: its sub-blocks (texels, round its footprint's centre) and its moss. */
interface Piece {
  blocks: TexelBox[];
  moss: number;
}

/**
 * The sheet's thirteen pieces, each drawn from its picture: the stepped heap,
 * the slab resting on stones, the tall mossy block, the long broken slab, the
 * lone cubes.
 */
const PIECES: Record<string, Piece> = {
  // Stepped heap: three cubes and one on top at the back.
  heap: { moss: 0.28, blocks: [[-3, 0, 0, 0, 3, 3], [0, 0, -1, 4, 3, 3], [-3, 0, -3, 0, 3, 0], [-2, 3, -3, 1, 6, 0]] },
  // A broken slab resting on three stones, the front corner hollow.
  slab: { moss: 0.12, blocks: [[-3, 0, -3, 0, 2, 0], [0, 0, -3, 3, 2, 0], [-3, 0, 0, 0, 2, 3], [-3, 2, -3, 0, 4, 3], [0, 2, -3, 3, 4, 3]] },
  // Tall block of eight cubes and one on top, heavy with moss.
  tall: { moss: 0.6, blocks: [[-3, 0, -3, 0, 3, 0], [0, 0, -3, 3, 3, 0], [-3, 0, 0, 0, 3, 3], [0, 0, 0, 3, 3, 3], [-3, 3, -3, 0, 6, 0], [0, 3, -3, 3, 6, 0], [-3, 3, 0, 0, 6, 3], [0, 3, 0, 3, 5, 3], [0, 6, -3, 3, 8, 0]] },
  // Four cubes with two more stacked at the back left.
  cubes: { moss: 0.24, blocks: [[-3, 0, -3, 0, 3, 0], [0, 0, -3, 3, 2, 0], [-3, 0, 0, 0, 3, 3], [0, 0, 0, 3, 3, 3], [-3, 3, -3, 0, 5, 0], [-3, 3, 0, 0, 5, 2]] },
  // Their broken-off neighbour: two cubes and a low one in front.
  neighbour: { moss: 0.1, blocks: [[-2, 0, -2, 1, 3, 1], [1, 0, -2, 3, 3, 2], [-2, 0, 1, 1, 2, 3]] },
  // Lone notched block.
  notched: { moss: 0.08, blocks: [[-2, 0, -2, 3, 4, 2]] },
  // Small mossy heap.
  mossyHeap: { moss: 0.32, blocks: [[-3, 0, -3, 0, 2, 0], [0, 0, -3, 2, 2, 0], [-3, 0, 0, 0, 2, 2], [0, 0, 0, 2, 2, 2], [-3, 2, -3, 0, 4, 0]] },
  // Big mossy pile: three courses at the back, lower blocks in front.
  pile: { moss: 0.6, blocks: [[-4, 0, -4, 0, 3, 0], [0, 0, -4, 4, 3, 0], [-4, 0, 0, 0, 3, 4], [0, 0, 0, 4, 3, 4], [-4, 3, -4, 0, 6, 0], [0, 3, -4, 4, 6, 0], [-4, 3, 0, 0, 5, 4], [-4, 6, -4, 0, 8, 0]] },
  // Mossy chunk, taller at the back.
  mossyChunk: { moss: 0.5, blocks: [[-3, 0, -3, 0, 4, 0], [0, 0, -3, 3, 3, 0], [-3, 0, 0, 0, 3, 3], [0, 0, 0, 3, 3, 3]] },
  // Long broken slab: two blocks side by side and a low strip behind.
  longSlab: { moss: 0.12, blocks: [[-4, 0, -2, 0, 3, 2], [0, 0, -2, 4, 3, 2], [-4, 0, -4, 4, 2, -2]] },
  // Stepped chunk.
  stepped: { moss: 0.24, blocks: [[-3, 0, -3, 0, 3, 0], [0, 0, -3, 3, 3, 0], [-3, 0, 0, 0, 2, 3], [0, 0, 0, 3, 3, 3], [-3, 3, -3, 0, 5, 0], [0, 3, -3, 3, 4, 0]] },
  // Small debris: a chip, a cube, a pair.
  chip: { moss: 0.32, blocks: [[-1, 0, -1, 2, 2, 2]] },
  cube: { moss: 0.36, blocks: [[-2, 0, -2, 2, 3, 2]] },
  pair: { moss: 0.4, blocks: [[-3, 0, -1, 0, 2, 2], [0, 0, -2, 2, 3, 1]] },
};

/** Where pieces lie (m): the piece, the centre of its footprint. */
type Layout = [piece: string, x: number, z: number][];

/**
 * The sheet's group, in its rows as the iso view sees them (the heap, slab and
 * tall block at the back, the big mossy pile on the left, the small debris in
 * front), packed into a 2.4 m square rather than the sheet's diamond so the
 * pieces fill the card, each clear of its neighbours on screen.
 */
const SHEET: Layout = [
  ['heap', -0.8125, -0.25],
  ['slab', -0.875, -0.9375],
  ['tall', -0.1875, -1],
  ['cubes', -0.1875, -0.3125],
  ['neighbour', 0.4375, 0.125],
  ['notched', 0.4375, -0.875],
  ['mossyHeap', 1.0625, -0.9375],
  ['pile', -1, 0.875],
  ['mossyChunk', 0, 0.375],
  ['longSlab', 0.6875, -0.3125],
  ['stepped', -0.1875, 1],
  ['chip', 0.5625, 0.6875],
  ['cube', 1.0625, 0.25],
  ['pair', 1, 0.875],
];

/** The sheet's four biggest chunks together (chips are scattered round them). */
const LARGE: Layout = [
  ['pile', -0.3125, -0.3125],
  ['heap', 0.4375, -0.3125],
  ['cubes', -0.3125, 0.4375],
  ['longSlab', 0.375, 0.4375],
];

/** Its mossiest pieces together, mossier still. */
const MOSSY: Layout = [
  ['tall', -0.375, -0.375],
  ['mossyChunk', 0.375, -0.3125],
  ['mossyHeap', -0.3125, 0.375],
  ['stepped', 0.375, 0.4375],
];

/** A piece mirrored or turned with its group (eight ways), so the gaps between pieces stay. */
function transform([name, x, z]: Layout[number], way: number): { x: number; z: number; blocks: TexelBox[] } {
  let blocks = PIECES[name].blocks;
  if (way & 1) [x, blocks] = [-x, blocks.map(([x0, y0, z0, x1, y1, z1]): TexelBox => [-x1, y0, z0, -x0, y1, z1])];
  if (way & 2) [z, blocks] = [-z, blocks.map(([x0, y0, z0, x1, y1, z1]): TexelBox => [x0, y0, -z1, x1, y1, -z0])];
  if (way & 4) [x, z, blocks] = [z, x, blocks.map(([x0, y0, z0, x1, y1, z1]): TexelBox => [z0, y0, x0, z1, y1, x1])];
  return { x, z, blocks };
}

function build(variant: string, seed: number): KitPiece {
  const p = new PieceBuilder();
  if (variant === 'small') {
    scatterRocks(p, { kind: 'fragment', w: 1, d: 0.9, count: 16, size: [0.08, 0.25], seed, gap: 0.3, fragment: { ...STONE, moss: 0.3 } });
    return p.done();
  }
  // The pieces; other seeds mirror or turn the group and vary each piece's damage.
  const r = rng(seed * 409 + 3);
  const way = seed === 1 ? 0 : r.int(1, 7);
  const layout = variant === 'large' ? LARGE : variant === 'mossy' ? MOSSY : SHEET;
  const placed = layout.map((spot, n) => {
    const t = transform(spot, way);
    const moss = PIECES[spot[0]].moss + (variant === 'mossy' ? 0.12 : 0);
    return fragment(p, { ...STONE, at: [t.x, 0, t.z], blocks: t.blocks, moss, seed: seed * 97 + n });
  });
  if (variant === 'large' || variant === 'mossy') {
    // Chips knocked off them, lying round about.
    const onPiece = (x: number, z: number, rad: number) => placed.some((b) => x > b.min[0] - rad - 0.06 && x < b.max[0] + rad + 0.06 && z > b.min[2] - rad - 0.06 && z < b.max[2] + rad + 0.06);
    const sizes = variant === 'large' ? [0.16, 0.13, 0.11, 0.1, 0.08, 0.07, 0.06] : [0.13, 0.1, 0.08, 0.07];
    scatterRocks(p, { kind: 'fragment', w: 1.9, d: 1.8, sizes, seed: seed + 7, gap: 0.5, avoid: onPiece, fragment: { ...STONE, moss: variant === 'mossy' ? 0.55 : 0.25 } });
  }
  return p.done();
}

export default defineKitAsset({
  section: '20',
  order: 1,
  name: 'Stone fragments',
  caption: 'Small broken stone pieces and debris.',
  size: {
    real: 'pieces 19–50 cm (chips from 6 cm), the group ≈ 2.4 × 2.4 m',
    sheet: 'not given',
    note: 'Debris broken off 0.5 m temple blocks: the sheet’s biggest chunk is about one block wide, the smallest under half that. The sheet groups them closely, so they lie 12–25 cm apart in a 2.4 m square.',
  },
  variants: [
    { id: 'scatter', name: 'Scatter' },
    { id: 'large', name: 'Large chunks' },
    { id: 'small', name: 'Small debris' },
    { id: 'mossy', name: 'Mossy pieces' },
  ],
  ref: { sheet: 'section 20/6706F03E-0DFA-4AFA-80F0-5C031D4F49D5.PNG', box: [16, 88, 302, 398] },
  build: ({ variant, seed }) => build(variant, seed),
});
