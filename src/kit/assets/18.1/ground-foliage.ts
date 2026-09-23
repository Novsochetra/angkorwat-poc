import { PieceBuilder } from '../../PieceBuilder';
import { snap } from '../../shapes';
import { defineKitAsset, type KitPiece } from '../../types';
import { FOLIAGE } from './_foliage';

/**
 * §18.1 Ground foliage: the sheet's strip of small jungle-floor items — a
 * grass tuft, a small plant, a fern, a leaf pile, a knotty root mound and a
 * mossy rock — each a variant of its own for dioramas and the level (their
 * builders are in _foliage.ts), and the whole strip as the main variant.
 */

/** Free ground between the items of the strip (metres). */
const GAP = 0.12;

/**
 * The strip: the items in the sheet's order along the iso view's horizontal
 * (+x, −z), so the card's main render reads left to right like the sheet.
 */
function strip(seed: number): KitPiece {
  const p = new PieceBuilder();
  const total = FOLIAGE.reduce((s, f) => s + 2 * f.half, 0) + GAP * (FOLIAGE.length - 1);
  let t = -total / 2;
  FOLIAGE.forEach((f, n) => {
    t += f.half;
    f.build(p, { at: [snap(t * Math.SQRT1_2), snap(-t * Math.SQRT1_2)], seed: seed * 10 + n });
    t += f.half + GAP;
  });
  return p.done();
}

export default defineKitAsset({
  section: '18.1',
  order: 9,
  name: 'Ground foliage',
  caption: 'Grass, small plants, ferns, leaf litter, roots and mossy stones for the jungle floor.',
  size: {
    real: 'grass tuft 0.5 m on a 0.6 m mat, small plant 0.55 m, fern ≈ 0.8 m across × 0.5 m, leaf pile ⌀ 0.6 m × 0.3 m, root mound ≈ 1.2 × 0.5 m, mossy rock ≈ 0.6 × 0.5 m',
    sheet: 'not given',
    note: 'Built to the real plants and stones of the forest floor: grass clumps 0.3–0.6 m, a half-metre sapling, a sword fern’s arching fronds, a heap of fig and dipterocarp leaves (12–20 cm), a stump broken off low with its buttress roots, a knee-high boulder. Blades, leaflets and leaves are one 1/16 m texel wide like every kit surface (the sapling’s cells half that, so its leaves keep the sheet’s stepped outline).',
  },
  variants: [{ id: 'strip', name: 'Ground foliage' }, ...FOLIAGE.map((f) => ({ id: f.id, name: f.name }))],
  shots: FOLIAGE.map((f) => ({ view: 'iso' as const, variant: f.id, label: f.name })),
  ref: { sheet: 'section 18/section 18.1.png', box: [974, 598, 1518, 742] },
  build: ({ variant, seed }) => {
    const item = FOLIAGE.find((f) => f.id === variant);
    if (!item) return strip(seed);
    const p = new PieceBuilder();
    item.build(p, { seed });
    return p.done();
  },
});
