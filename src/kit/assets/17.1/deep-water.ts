import { lilies, WATER_DEPTH, waterTile } from '../../lib/water';
import { PieceBuilder } from '../../PieceBuilder';
import { defineKitAsset } from '../../types';

/**
 * ⑥ Deep water — a 4 × 4 m tile of the moat's deep middle, as on the §17.1
 * sheets: a darker, saturated blue with no bottom in sight, the mosaic of its
 * top in navy and blue squares, the bed only a dark band along its foot.
 * Variants: sheet B's tile with lily pads, and a darker, stiller one.
 *
 * The surface is at y = 0; 1.5 m of water over a silt bed.
 */
export default defineKitAsset({
  section: '17.1',
  order: 6,
  name: 'Deep water',
  caption: 'Deeper water with darker tone.',
  size: {
    real: '4 × 4 m tile, surface at y = 0, 1.5 m of water over a 0.25 m silt bed (1.75 m tall)',
    sheet: 'not given (a slab like the water surface tile)',
    note: 'SIZES-ARCH §1.15: the moat is ≈ 4 m deep from the bank top, its surface 2.5 m down, so the deep middle holds 1.5 m (1–1.5 m in the dry season, more in the wet).',
  },
  variants: [
    { id: 'deep', name: 'Deep' },
    { id: 'lilies', name: 'Lily pads', ref: { sheet: 'section 17/B65034CE-0DD5-499B-B913-792827EFB323.PNG', box: [1279, 138, 1516, 482] } },
    { id: 'darker', name: 'Darker' },
  ],
  shots: [
    { view: 'top', label: 'Top view' },
    { view: 'iso', variant: 'lilies', label: 'Lily pads' },
    { view: 'iso', variant: 'darker', label: 'Darker' },
  ],
  ref: { sheet: 'section 17/9CD32C14-908E-487E-9287-BF45055F93A6.PNG', box: [1279, 136, 1516, 456] },
  build: ({ variant, seed, height }) => {
    const p = new PieceBuilder();
    const s = waterTile(p, { depth: height ?? WATER_DEPTH.deep, tint: variant === 'darker' ? 'dark' : 'moat', bed: 'silt', glints: variant === 'darker' ? 0 : 0.12, seed });
    if (variant === 'lilies') lilies(p, s, { seed, clusters: 4, flowers: 0, pads: 3 });
    return p.done();
  },
});
