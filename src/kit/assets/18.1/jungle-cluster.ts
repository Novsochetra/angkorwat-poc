import { defineKitAsset } from '../../types';
import { buildJungle, type JungleKind } from './_jungle';

/**
 * §18.1 ⑥ Dense jungle cluster. The sheet's front view shows several trunks
 * of different heights with dark gaps between them under a continuous canopy,
 * vines hanging from it, bushes, grass and mossy fallen blocks at their feet;
 * its top view, a dozen distinct crowns. The variants put a broken wall stub
 * among the trees, or thin the patch to the edge of the jungle along a path.
 */
const KINDS: Record<string, JungleKind> = { dense: 'dense', 'with-ruins': 'ruins', edge: 'edge' };

export default defineKitAsset({
  section: '18.1',
  order: 6,
  name: 'Dense jungle cluster',
  caption: 'Tall trees of mixed heights, overlapping crowns, vines, undergrowth and mossy fallen blocks.',
  size: {
    real: '≈ 16 × 16 m patch (edge strip 16 × 7 m), crowns overhanging to ≈ 19 m; big trees 9.5–19 m (the tallest 17–21 m by seed), young ones 6–8 m, a 15 m palm, shrubs and bushes 1.4–3 m, blocks 0.5–0.6 m high and up to 1.75 m long',
    sheet: 'not given',
    note: 'The sheet gives no size. Angkor’s forest has a canopy at 15–25 m under emergents of 30 m and more; a 16 m patch holding five big trunks, two young trees, a palm and the undergrowth keeps the crowns touching, as drawn. The sheet draws the cluster a little wider than tall, so the tallest tree stands 19 m by default rather than 22. `height` sets the tallest tree; the others scale with it.',
  },
  variants: [
    { id: 'dense', name: 'Dense jungle' },
    { id: 'with-ruins', name: 'With ruins' },
    { id: 'edge', name: 'Jungle edge' },
  ],
  shots: [
    { view: 'side', label: 'Side view' },
    { view: 'top', label: 'Top view (cluster layout)' },
    { view: 'iso', variant: 'with-ruins', label: 'With ruins' },
    { view: 'iso', variant: 'edge', label: 'Jungle edge' },
  ],
  // The sheet draws it square on: the trunks side by side under one canopy.
  mainView: 'front',
  ref: { sheet: 'section 18/section 18.1.png', box: [1238, 128, 1518, 592] },
  build: ({ variant, seed, height }) => buildJungle({ kind: KINDS[variant] ?? 'dense', seed, height }),
});
