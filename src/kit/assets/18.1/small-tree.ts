import { PieceBuilder } from '../../PieceBuilder';
import { rng } from '../../shapes';
import { defineKitAsset } from '../../types';
import { broadleafTree } from './_broadleaf';

/**
 * §18.1 ③ Small tree: a young broadleaf. The sheet draws a short, stout
 * brown trunk with a little root flare and a couple of small stones, limbs
 * forking under a compact round canopy of a handful of leaf clumps.
 */
export default defineKitAsset({
  section: '18.1',
  order: 3,
  name: 'Small tree',
  caption: 'Young broadleaf: short stout trunk, small root flare, compact round canopy.',
  size: {
    real: '≈ 5 m tall (4–6.5 m by seed), canopy ≈ 4–4.5 m, trunk 0.75 m',
    sheet: '3–4 m',
    note: 'A young tree that already shades the explorer stands 4–6.5 m; at 3–4 m it would be a large shrub. The sheet draws the canopy as wide as the tree is tall; here it is ≈ 0.8 × the height, its hanging side clumps held clear of the trunk so the limbs show.',
  },
  variants: [{ id: 'tree', name: 'Small tree' }],
  shots: [
    { view: 'side', label: 'Side view' },
    { view: 'top', label: 'Top view' },
  ],
  mainView: 'iso-low',
  ref: { sheet: 'section 18/section 18.1.png', box: [540, 128, 760, 592] },
  build: ({ seed, height }) => {
    const r = rng(seed * 101 + 11);
    // Seed 1 is the typical tree (the card's); other seeds vary 4–6.5 m.
    const h = height ?? (seed === 1 ? 5 : 5 * r.range(0.8, 1.3));
    const p = new PieceBuilder();
    broadleafTree(p, { height: h, width: h * r.range(0.7, 0.78), seed, base: 0.36, trunk: h * 0.15, clumps: 10, roots: 5, rootReach: h * 0.22, vines: 0, stones: 2 });
    return p.done();
  },
});
