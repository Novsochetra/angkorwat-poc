import { TEXEL as T } from '../../shapes';
import { stoneSurf } from '../../surface';
import { defineKitAsset, type KitPiece } from '../../types';
import { B, Mason, MOSSY, within } from './_damage-a';

/**
 * §19.2 ② Missing block — "Block missing, leaving an empty space."
 * The sheet's card: a two-course wall of 0.5 m blocks with a face block gone,
 * leaving a deep, dark recess in the front — the stones round it in shadow,
 * the block behind it dim at the back, the rim a little chipped — over the lit
 * sill of the stone below; beneath it a wall with a gap at the bottom (a
 * lintel bridging it), a stack missing a block at its side, and the hole seen
 * from above as a dark pit in the paving.
 */

/** Tops of the walls: moss and grime settle in the joints. */
const TOPS = stoneSurf({ moss: 0.24, stain: 0.44, lichen: 0.42 });

type V3 = [number, number, number];

function build(variant: string, seed: number): KitPiece {
  const m = new Mason(seed);
  /** Take out the blocks in a box, keep it as a dark hollow and chip the arrises round it. */
  const hole = (min: V3, max: V3, nicks = 0.3) => {
    m.hollow(min, max);
    m.nick(nicks, (x, y, z) => within(x, y, z, min, max, 0.19));
  };
  if (variant === 'arch') {
    // One block thick: the bottom middle block is gone, the course above bridges the gap.
    m.row([-0.75, -0.25, 0.25, 0.75], 0, B, -B / 2, B / 2);
    m.row([-0.75, 0.0625, 0.75], B, 2 * B, -B / 2, B / 2);
    m.style((x, y) => x < -0.25 && y < B, MOSSY);
    m.hollow([-0.25, 0, -B / 2], [0.25, B, B / 2]);
    m.nick(0.35, (x, y, z) => x > -0.2 && within(x, y, z, [-0.25, 0, -B / 2], [0.25, B, B / 2], 0.19));
    return m.finish();
  }
  if (variant === 'side') {
    // Two by two blocks, three courses; the middle course has lost its front-right block.
    m.row([-B, 0, B], 0, B, -B, 0);
    m.row([-B, 0.0625, B], 0, B, 0, B);
    m.row([-B, 0, B], B, 2 * B, -B, 0);
    m.row([-B, 0, B], B, 2 * B, 0, B);
    m.block(-B, 2 * B, -B, 0, 3 * B, B);
    m.block(0, 2 * B, -B, B, 3 * B, B);
    m.style((_x, y) => y > 2 * B, TOPS);
    hole([-T, B - T, -T], [B, 2 * B, B]);
    return m.finish();
  }
  if (variant === 'tile') {
    // Paving from above: three rows, the middle one missing a block — a dark pit over its bed.
    m.row([-0.75, -0.25, 0.3125, 0.75], 0, B, -0.625, -0.25);
    m.row([-0.75, -0.375, 0.125, 0.75], 0, B, -0.25, 0.25);
    m.row([-0.75, -0.0625, 0.4375, 0.75], 0, B, 0.25, 0.625);
    m.hollow([-0.375 - T, 0.125, -0.25 - T], [0.125, B, 0.25]);
    m.block(-0.375, 0, -0.25, 0.125, 0.125, 0.25);
    m.nick(0.4, (x, y, z) => y > 0.14 && within(x, y, z, [-0.375, 0, -0.25], [0.125, B, 0.25], 0.19));
    return m.finish();
  }
  // Two courses of 0.5 m blocks on a 0.25 m footing course that gives the hole
  // its sill: 0.5 m face stones backed by 0.375 m ones. A 0.75 m face stone of
  // the lower course is gone, under the long stone of the upper course that
  // still spans it; the hollow takes in the open joints round it (a texel
  // below and behind), so its sill and back read dark too.
  const [F, D] = [0.25, 0.375];
  m.row([-0.875, -0.3125, 0.4375, 0.875], 0, F, 0, B);
  m.row([-0.875, 0.0625, 0.875], 0, F, -D, 0);
  m.row([-0.875, -0.375, 0.375, 0.875], F, F + B, 0, B);
  m.row([-0.875, -0.5, 0.25, 0.875], F, F + B, -D, 0);
  m.row([-0.875, -0.4375, 0.4375, 0.875], F + B, F + 2 * B, 0, B);
  m.row([-0.875, -0.1875, 0.5, 0.875], F + B, F + 2 * B, -D, 0);
  m.style((_x, y) => y > F + B, TOPS);
  // A fragment of the fallen stone lies at the foot of the wall, a chip beside it.
  m.block(-0.5625, 0, 0.625, -0.25, 0.1875, 0.875);
  m.block(-0.1875, 0, 0.6875, -0.0625, 0.125, 0.8125);
  hole([-0.375 - T, F - T, -T], [0.375 + T, F + B, B]);
  m.breakAway({ at: [-0.25, 0.1875, 0.875], reach: [0.16, 0.14], below: 0.125, ledges: 2 }, seed + 5);
  return m.finish({
    colliders: [
      [-0.875, 0, -D, 0.875, F + 2 * B, B],
      [-0.5625, 0, 0.625, -0.25, 0.1875, 0.875],
    ],
  });
}

export default defineKitAsset({
  section: '19.2',
  order: 2,
  name: 'Missing block',
  caption: 'Block missing, leaving an empty space.',
  size: {
    real: '1.75 × 0.875 m, 1.25 m high (0.5 m blocks on a 0.25 m footing)',
    sheet: 'not given',
    note: 'Built from real 0.5 m sandstone blocks (TEMPLE_BLOCK_M): two courses of 0.5 m face stones backed by 0.375 m ones, on a footing course that gives the hole its sill, so the gap of the missing 0.75 × 0.5 × 0.5 m face stone reads as a deep recess with the stone behind it in shadow, as on the sheet.',
  },
  variants: [
    { id: 'wall', name: 'Missing block' },
    { id: 'arch', name: 'Gap below' },
    { id: 'side', name: 'Missing side block' },
    { id: 'tile', name: 'Tile (top view)' },
  ],
  shots: [
    { view: 'iso', variant: 'arch', label: 'Gap below' },
    { view: 'iso', variant: 'side', label: 'Missing side block' },
    { view: 'top', variant: 'tile', label: 'Tile (top view)' },
  ],
  ref: { sheet: 'section 19/DC8CFA59-53FC-45C2-9C62-F650EC8907C8.PNG', box: [271, 131, 512, 642] },
  build: ({ variant, seed }) => build(variant, seed),
});
