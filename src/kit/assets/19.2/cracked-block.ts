import { stoneSurf, surfMax } from '../../surface';
import { defineKitAsset, type KitPiece } from '../../types';
import { B, Mason, PLAIN } from './_damage-a';

/**
 * §19.2 ③ Cracked block — "Surface cracks from age and pressure."
 * The sheet's card: a two-course wall whose blocks are split by dark, stepped
 * cracks — a big block broken into three with a wedge in the middle, a crack
 * down the corner block and across its top, a crack on the side — below it a
 * pair of cracked blocks, a split block, and the cracks seen from above as a tile.
 */
const HAIRLINES = surfMax(PLAIN, stoneSurf({ crack: 0.3 }));

function build(variant: string, seed: number): KitPiece {
  const m = new Mason(seed);
  const s = (k: number) => seed * 31 + k;
  if (variant === 'pair') {
    // Two by two by two; a crack runs down the front-left column through both courses.
    m.row([-B, 0, B], 0, B, -B, 0);
    m.row([-B, 0, B], 0, B, 0, B);
    m.row([-B, 0, B], B, 2 * B, -B, 0);
    m.row([-B, 0, B], B, 2 * B, 0, B);
    m.crack({ on: 'front', from: [-0.12, 2 * B], to: [-0.2, 0], through: [0, B], wander: 2.4 }, s(1));
    m.crack({ on: 'front', from: [0.3, B], to: [0.36, 0.1], through: [0.25, B] }, s(2));
    m.nick(0.25, (x, _y, z) => z > 0 && x < 0.1);
  } else if (variant === 'split') {
    // A long block split in three, a shorter one on it split in two.
    m.block(-B, 0, -B / 2, B, B, B / 2, HAIRLINES);
    m.block(-B, B, -B / 2, 0, 2 * B, B / 2);
    m.crack({ on: 'front', from: [-0.1, B], to: [-0.42, 0], through: [-B / 2, B / 2] }, s(1));
    m.crack({ on: 'front', from: [0.22, B], to: [0.28, 0], through: [-B / 2, B / 2] }, s(2));
    m.crack({ on: 'front', from: [-0.24, 2 * B], to: [-0.3, B], through: [-B / 2, B / 2] }, s(3));
    m.nick(0.25, () => true);
  } else if (variant === 'tile') {
    // Paving from above; the big middle stone is split by a stepped crack and a branch.
    m.row([-0.75, -0.375, 0.125, 0.75], 0, B, -B, -0.125);
    m.row([-0.75, -0.375, 0.25, 0.75], 0, B, -0.125, B);
    m.crack({ on: 'top', from: [-0.36, -0.1], to: [0.1, 0.48], through: [0.18, B], wander: 1.2 }, s(1));
    m.crack({ on: 'top', from: [-0.08, 0.2], to: [0.24, 0.02], through: [0.25, B] }, s(2));
    m.crack({ on: 'top', from: [0.62, -0.5], to: [0.5, -0.14], through: [0.3, B] }, s(3));
    m.style((x) => x < -0.375 || x > 0.25, HAIRLINES);
  } else {
    // Front skin: a 0.75 m block below between two halves, three blocks above.
    m.row([-0.875, -0.375, 0.375, 0.875], 0, B, 0, B);
    m.row([-0.875, -0.3125, 0.125, 0.875], B, 2 * B, 0, B);
    m.row([-0.875, 0, 0.875], 0, B, -B, 0);
    m.row([-0.875, -0.125, 0.5, 0.875], B, 2 * B, -B, 0);
    m.style((_x, _y, z) => z < 0, HAIRLINES);
    // The big block splits in three: a wedge between two cracks from one point on top…
    m.crack({ on: 'front', from: [-0.02, B], to: [-0.34, 0], through: [0, B], wander: 0.8 }, s(1));
    m.crack({ on: 'front', from: [0.02, B], to: [0.26, 0], through: [0, B], wander: 0.8 }, s(2));
    // …the corner block cracks down its face and back across its top, the one below down its side.
    m.crack({ on: 'front', from: [0.36, 2 * B], to: [0.3, B], through: [0, B], wander: 2.4 }, s(3));
    m.crack({ on: 'side', from: [0.34, B], to: [0.1, 0], through: [0.5, 0.875] }, s(4));
  }
  return m.finish();
}

export default defineKitAsset({
  section: '19.2',
  order: 3,
  name: 'Cracked block',
  caption: 'Surface cracks from age and pressure.',
  size: {
    real: '1.75 × 1.0 m, 1.0 m high (0.5–0.75 m blocks)',
    sheet: 'not given',
    note: 'Real sandstone blocks (0.5 m courses, 0.44–0.75 m long); cracks are one texel (6 cm) gaps so they read at game distance like the sheet’s dark lines.',
  },
  variants: [
    { id: 'wall', name: 'Cracked block' },
    { id: 'pair', name: 'Cracked pair' },
    { id: 'split', name: 'Split block' },
    { id: 'tile', name: 'Tile (top view)' },
  ],
  shots: [
    { view: 'iso', variant: 'pair', label: 'Cracked pair' },
    { view: 'iso', variant: 'split', label: 'Split block' },
    { view: 'top', variant: 'tile', label: 'Tile (top view)' },
  ],
  ref: { sheet: 'section 19/DC8CFA59-53FC-45C2-9C62-F650EC8907C8.PNG', box: [524, 131, 764, 642] },
  build: ({ variant, seed }) => build(variant, seed),
});
