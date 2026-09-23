import { defineKitAsset, type KitPiece } from '../../types';
import { B, Mason, MOSS_TRACE, MOSSY, within } from './_damage-a';

/**
 * §19.2 ① Broken corner — "Corner broken off, exposing rough interior."
 * The sheet's card: a neat two-by-two-by-two stack of 0.5 m blocks, every
 * stone whole except the top front-right one, whose corner has broken away
 * in a rough stepped crater of lighter, fresher stone, a crack running back
 * from it across the top and moss on the stones at the lower right; under it
 * smaller stacks with broken corners, a stack with a broken edge, and the
 * break seen from above as a tile.
 */

type Box = { min: [number, number, number]; max: [number, number, number] };

function build(variant: string, seed: number): KitPiece {
  const m = new Mason(seed);
  const near = (cx: number, cy: number, cz: number, d: number) => (x: number, y: number, z: number) => Math.hypot(x - cx, y - cy, z - cz) < d;
  /** Is a point inside a stone's box? */
  const inside = (b: Box) => (x: number, y: number, z: number) => within(x, y, z, b.min, b.max);
  if (variant === 'stack') {
    // Two wide, one deep, two high; the upper right stone has broken down towards its outer end.
    m.row([-B, 0.0625, B], 0, B, -B / 2, B / 2);
    m.row([-B, -0.0625, B], B, 2 * B, -B / 2, B / 2);
    const top: Box = { min: [-0.0625, B, -B / 2], max: [B, 2 * B, B / 2] };
    m.terrace({ ...top, fall: [1, 0.4], high: 0.9375, low: 0.625, rough: 0.22 });
    m.breakAway({ at: [B, 0.875, B / 2], reach: [0.24, 0.26], below: 0.3125, ledges: 2, rough: 0.3, square: 2, clip: top });
    m.roughen(0.45, inside(top));
    m.style((x, y) => x > 0 && y < B, MOSSY);
    m.style((x, y) => x > 0 && y > B, MOSS_TRACE);
  } else if (variant === 'chipped') {
    // A block with a smaller one on it, chipped all round and broken at a corner each.
    m.block(-0.25, 0, -0.25, 0.25, B, 0.25);
    m.block(-0.25, B, -0.1875, 0.1875, B + 0.375, 0.25);
    m.breakAway({ at: [-0.25, B + 0.375, 0.25], reach: [0.22, 0.2], below: 0.25, ledges: 2 });
    m.breakAway({ at: [0.25, 0.25, 0.25], reach: [0.14, 0.18], below: 0.25, above: 0.13, ledges: 2 }, seed + 3);
    m.nick(0.35, () => true);
    m.roughen(0.3, () => true);
  } else if (variant === 'edge') {
    // Three courses, one deep: the front-right arris of the long middle stone has broken away.
    m.row([-B, 0, B], 0, B, -B / 2, B / 2);
    m.row([-B, B], B, 2 * B, -B / 2, B / 2);
    m.row([-B, -0.0625, B], 2 * B, 3 * B, -B / 2, B / 2);
    const mid: Box = { min: [-B, B, -B / 2], max: [B, 2 * B, B / 2] };
    m.breakAway({ at: [B, 1.5 * B, B / 2], reach: [0.36, 0.34], below: 0.25, above: 0.25, ledges: 3, clip: mid });
    m.roughen(0.4, (x, y, z) => inside(mid)(x, y, z) && near(B, 1.5 * B, B / 2, 0.6)(x, y, z));
    m.style((x, y) => x > 0 && y < B, MOSSY);
  } else if (variant === 'tile') {
    // The break from above: paving stones, the corner of one broken into a deep pit.
    m.row([-0.75, -0.5, 0.125, 0.75], 0, B, -B, 0);
    m.row([-0.75, -0.0625, 0.75], 0, B, 0, B);
    m.breakAway({ at: [-0.0625, B, 0.0], reach: [0.36, 0.32], below: 0.375, ledges: 3, rough: 0.34 });
    m.roughen(0.4, near(-0.0625, B, 0, 0.5));
    m.style(near(-0.0625, B / 2, 0, 0.6), MOSS_TRACE);
  } else {
    // Two by two by two, the joints of the two courses a texel or two apart; every stone whole but one.
    m.row([-B, -0.0625, B], 0, B, 0, B);
    m.row([-B, 0.0625, B], 0, B, -B, 0);
    m.row([-B, 0.0625, B], B, 2 * B, 0, B);
    m.row([-B, -0.0625, B], B, 2 * B, -B, 0);
    // The top front-right stone has broken off: its top falls away in rough terraces to the right…
    const top: Box = { min: [0.0625, B, 0], max: [B, 2 * B, B] };
    m.terrace({ ...top, fall: [1, 0.3], high: 0.875, low: 0.6875, rough: 0.2 });
    // …its outer corner deeper still, down towards the course below, the break ragged in single texels…
    m.breakAway({ at: [B, 0.875, B], reach: [0.28, 0.32], below: 0.3125, ledges: 3, rough: 0.3, square: 2, clip: top });
    m.roughen(0.45, inside(top));
    // …and a crack runs back from it across the stone behind.
    m.crack({ on: 'top', from: [0.26, 0.0], to: [0.2, -B], through: [2 * B - 0.1875, 2 * B], wander: 1 });
    // Moss on the stones below the break, a trace of it on the broken ledges.
    m.style((x, y) => x > 0 && y < B, MOSSY);
    m.style((x, y, z) => x > 0 && y > B && z > 0, MOSS_TRACE);
  }
  return m.finish();
}

export default defineKitAsset({
  section: '19.2',
  order: 1,
  name: 'Broken corner',
  caption: 'Corner broken off, exposing rough interior.',
  size: {
    real: '1.0 × 1.0 m, 1.0 m high (0.5 m blocks)',
    sheet: 'not given',
    note: 'Angkor Wat’s sandstone blocks run 0.4–0.6 m high and 0.5–1.2 m long; the sheet’s neat two-by-two-by-two stack of the kit’s 0.5 m blocks (TEMPLE_BLOCK_M) is a 1 m cube. Its top front-right stone has lost its top in 1/8 m terraces, its outer corner down to 0.44 m.',
  },
  variants: [
    { id: 'corner', name: 'Broken corner' },
    { id: 'stack', name: 'Broken stack' },
    { id: 'chipped', name: 'Chipped blocks' },
    { id: 'edge', name: 'Broken edge' },
    { id: 'tile', name: 'Tile (top view)' },
  ],
  shots: [
    { view: 'iso', variant: 'stack', label: 'Broken stack' },
    { view: 'iso', variant: 'chipped', label: 'Chipped blocks' },
    { view: 'iso', variant: 'edge', label: 'Broken edge' },
    { view: 'top', variant: 'tile', label: 'Tile (top view)' },
  ],
  ref: { sheet: 'section 19/DC8CFA59-53FC-45C2-9C62-F650EC8907C8.PNG', box: [18, 131, 259, 642] },
  build: ({ variant, seed }) => build(variant, seed),
});
