import { lilies, WATER_DEPTH, waterTile, type BedKind, type WaterTintName } from '../../lib/water';
import { PieceBuilder } from '../../PieceBuilder';
import { defineKitAsset } from '../../types';

/**
 * ⑤ Shallow water — a 4 × 4 m tile of the moat's margins, as on the §17.1
 * sheets: pale, clear water with the bed plain to see through it — on sheet A
 * a jumble of sunken blocks (olive, tan, mossy) on orange-brown ground, on its
 * small tiles a sandy bed dotted with pebbles and olive weed, on sheet B the
 * same with lily pads on top.
 *
 * The surface is at y = 0; 0.5 m of water over the bed.
 */
interface Look {
  bed: BedKind;
  tint: WaterTintName;
  flora?: [number, number, number];
}

const LOOKS: Record<string, Look> = {
  stony: { bed: 'stones', tint: 'moat' },
  sandy: { bed: 'sand', tint: 'clear' },
  pebbly: { bed: 'pebbles', tint: 'clear' },
  weedy: { bed: 'weeds', tint: 'clear' },
  lilies: { bed: 'pebbles', tint: 'clear', flora: [4, 2, 2] },
};

export default defineKitAsset({
  section: '17.1',
  order: 5,
  name: 'Shallow water',
  caption: 'Shallow water with visible ground.',
  size: {
    real: '4 × 4 m tile, surface at y = 0, 0.5 m of water over a 0.25 m bed (0.75 m tall)',
    sheet: 'not given (a slab like the water surface tile)',
    note: 'SIZES-ARCH §17.1: the moat’s shallow margins hold 0.25–0.75 m of water; 0.5 m is their middle, half a metre above the open-water tile’s bed. Sunken stones 0.2–0.45 m across, standing up to 0.3 m.',
  },
  variants: [
    { id: 'stony', name: 'Stony bed' },
    { id: 'sandy', name: 'Sandy bed' },
    { id: 'pebbly', name: 'Pebbles' },
    { id: 'weedy', name: 'Water weed' },
    { id: 'lilies', name: 'Lily pads', ref: { sheet: 'section 17/B65034CE-0DD5-499B-B913-792827EFB323.PNG', box: [1026, 138, 1263, 482] } },
  ],
  shots: [
    { view: 'top', label: 'Top view' },
    { view: 'iso', variant: 'sandy', label: 'Sandy bed' },
    { view: 'iso', variant: 'pebbly', label: 'Pebbles' },
    { view: 'iso', variant: 'weedy', label: 'Water weed' },
  ],
  ref: { sheet: 'section 17/9CD32C14-908E-487E-9287-BF45055F93A6.PNG', box: [1026, 136, 1263, 456] },
  build: ({ variant, seed, height }) => {
    const look = LOOKS[variant] ?? LOOKS.stony;
    const p = new PieceBuilder();
    const s = waterTile(p, { depth: height ?? WATER_DEPTH.shallow, tint: look.tint, bed: look.bed, glints: 0.15, seed });
    if (look.flora) lilies(p, s, { seed, clusters: look.flora[0], flowers: look.flora[1], pads: look.flora[2] });
    return p.done();
  },
});
