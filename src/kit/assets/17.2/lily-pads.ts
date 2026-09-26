import { WATER_DEPTH, waterTile } from '../../lib/water';
import { PieceBuilder } from '../../PieceBuilder';
import { defineKitAsset } from '../../types';
import { lilyField } from './_flora-lilies';
import { lotusStand } from './_flora-lotus';

/**
 * ③ Lily pads — water lilies on a 4 × 4 m tile of moat water (the §17.1
 * water surface): colonies of round, notched pads with pink flowers standing
 * over them, as the sheet draws them (its clover pads made real); the same
 * with white flowers; and a stand of sacred lotus, its leaves and flowers held
 * up out of the water. The scatters are `lilyField` and `lotusStand`
 * (`_flora-lilies.ts`, `_flora-lotus.ts`), for any water surface.
 */
export default defineKitAsset({
  section: '17.2',
  order: 3,
  name: 'Lily pads',
  caption: 'Lily pads with flowers.',
  size: {
    real: 'pads 0.2–0.4 m, flowers 0.13–0.17 m standing 0.05–0.16 m above the water, colonies 1–2 m on a 4 × 4 m tile; lotus leaves 0.34–0.6 m held up to ≈ 1 m, flowers 0.22–0.27 m',
    sheet: 'not given; its pads read ≈ 0.5 m and its flowers ≈ 0.3 m against its 1/4 m water mosaic',
    note: 'SIZES-ARCH §1.16: Nymphaea pubescens (the lilies of the moat and pools) has round pads 0.15–0.4 m with one V-notch, not the sheet\'s four lobes, and flowers ≈ 0.15 m held a little above the water; Nelumbo holds 0.3–0.8 m leaves 0.3–1.5 m up and 0.2–0.3 m flowers above them. Real sizes are about half the sheet\'s, so a colony holds more, smaller pads.',
  },
  variants: [
    { id: 'pink', name: 'Water lilies' },
    { id: 'white', name: 'White lilies' },
    { id: 'lotus', name: 'Lotus' },
  ],
  shots: [
    { view: 'top', label: 'Top view' },
    { view: 'iso', variant: 'white', label: 'White lilies' },
    { view: 'iso', variant: 'lotus', label: 'Lotus' },
    { view: 'front', variant: 'lotus', label: 'Lotus, front' },
  ],
  ref: { sheet: 'section 17/9CD32C14-908E-487E-9287-BF45055F93A6.PNG', box: [630, 512, 907, 716] },
  build: ({ variant, seed }) => {
    const p = new PieceBuilder();
    const s = waterTile(p, { depth: WATER_DEPTH.open, tint: 'moat', bed: 'silt', glints: 0.15, seed });
    if (variant === 'lotus') lotusStand(p, s, { seed, x: -0.35, z: -0.4 });
    else lilyField(p, s, { seed, kind: variant === 'white' ? 'white' : 'pink', groups: 4, plants: [1, 2] });
    return p.done();
  },
});
