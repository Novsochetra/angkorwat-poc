import { defineKitAsset } from '../../types';
import { buildPalm } from './_palm';

/**
 * §18.1 ④ Palm tree. The sheet draws a feather palm: a tall ringed trunk on a
 * wider foot, a crown of arching fronds whose leaflets droop at the tips, brown
 * dead fronds and fruit hanging below. The second variant is the palm that
 * actually lines Angkor's causeways and rice fields — the sugar palm.
 */
export default defineKitAsset({
  section: '18.1',
  order: 4,
  name: 'Palm tree',
  caption: 'Tall ringed trunk with a crown of arching, drooping fronds.',
  size: {
    real: '13–18 m tall (≈15 m, by seed), trunk ⌀ 0.55–0.7 m; crown 8–10 m (4–5 m fronds), sugar palm ≈6.5 m',
    sheet: '8–10 m',
    note: 'Mature palms are taller than the sheet says: coconut-type palms reach 15–25 m with 4–6 m fronds, and Angkor’s sugar palms (Borassus flabellifer, Cambodia’s national tree) stand 15–20 m, up to 30 m; an 8–10 m palm would look like a sapling beside the temple. The sheet’s look is kept at real size: ringed trunk on a stepped foot, a full crown of arching fronds, dead fronds and fruit under it.',
  },
  variants: [
    { id: 'sheet', name: 'Palm (sheet)' },
    { id: 'sugar', name: 'Sugar palm' },
  ],
  shots: [
    { view: 'side', label: 'Side view' },
    { view: 'top', label: 'Top view' },
    { view: 'iso', variant: 'sugar', label: 'Sugar palm' },
  ],
  mainView: 'iso-low',
  ref: { sheet: 'section 18/section 18.1.png', box: [768, 128, 1002, 592] },
  build: ({ variant, seed, height }) => buildPalm({ kind: variant === 'sugar' ? 'sugar' : 'feather', seed, height }),
});
