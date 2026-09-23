import { PieceBuilder } from '../../PieceBuilder';
import { rng } from '../../shapes';
import { defineKitAsset } from '../../types';
import { broadleafTree } from './_broadleaf';

/**
 * §18.1 ② Medium tree: a sturdy broadleaf — a tamarind, mango or young
 * dipterocarp by the temple walls. The sheet draws a thick trunk whose root
 * flare steps down over a few small sandstone stones, a rounded canopy of
 * distinct leaf clumps (bright on top, darker below) with branches showing
 * between the lower ones, and a few hanging vines.
 */
export default defineKitAsset({
  section: '18.1',
  order: 2,
  name: 'Medium tree',
  caption: 'Sturdy broadleaf: thick trunk on a root flare, rounded canopy of leaf clumps, a few vines.',
  size: {
    real: '≈ 11 m tall (9.5–12 m by seed), canopy ≈ 9–10 m, trunk 1.5 m flaring to ≈ 2.5 m',
    sheet: '6–8 m',
    note: 'Mid-size tropical trees around Angkor (tamarind, mango, young dipterocarps) grow 10–15 m tall on 1–1.5 m trunks; a 6–8 m tree would barely top a gallery roof. Shape and proportions follow the sheet, its stout flared trunk included.',
  },
  variants: [{ id: 'tree', name: 'Medium tree' }],
  shots: [
    { view: 'side', label: 'Side view' },
    { view: 'top', label: 'Top view' },
  ],
  mainView: 'iso-low',
  ref: { sheet: 'section 18/section 18.1.png', box: [292, 128, 532, 592] },
  build: ({ seed, height }) => {
    const r = rng(seed * 101 + 7);
    // Seed 1 is the typical tree (the card's); other seeds vary 9–13 m.
    const h = height ?? (seed === 1 ? 11 : 11 * r.range(0.82, 1.18));
    const p = new PieceBuilder();
    broadleafTree(p, { height: h, width: h * r.range(0.84, 0.92), seed, base: 0.4, trunk: h * 0.13, clumps: 16, roots: 6, rootReach: h * 0.24, vines: 5, stones: 4 });
    return p.done();
  },
});
