import { wallSegment, WALL_STONE } from '../../lib/wall';
import { defineKitAsset } from '../../types';
import { SHEET_15 } from './_core-segment';

/**
 * §15 ⑩ Foundation block: the base layer of every §15 wall — the moulded
 * plinth, a heavy 0.5 m footing and two 0.25 m bands stepping back towards the
 * wall face — as a 2 m module. The block variants return the mouldings round
 * their ends (the sheet's block); the module variant has open ends and tiles
 * under a run of wall.
 */
const VARIANTS = [
  { id: 'block', name: 'Weathered block', stone: WALL_STONE.weathered, ends: 'return' as const },
  { id: 'mossy', name: 'Mossy', stone: WALL_STONE.mossy, ends: 'return' as const },
  { id: 'clean', name: 'Clean (new)', stone: WALL_STONE.clean, ends: 'return' as const },
  { id: 'module', name: 'Module (open ends, tiles)', stone: WALL_STONE.weathered, ends: 'open' as const },
];

export default defineKitAsset({
  section: '15',
  order: 10,
  name: 'Foundation block',
  caption: 'Heavy moulded base course that every wall stands on.',
  size: {
    real: '2.0 m long × 1.5 m deep at the footing (under a 1.0 m wall) × 1.0 m high: a 0.5 m footing set out 0.25 m, bands of 0.25 m set out 0.125 and 0.0625 m',
    sheet: '≈ 3 × 3 stones on top, 2 courses (≈ 1 m) high',
    note: 'Gallery plinths at Angkor Wat stand 1.0–1.7 m; the kit wall’s 1.0 m plinth. A 2 m module on the kit’s bay; the stones run 0.75–1.5 m long and 0.5–0.75 m deep (Angkor Wat blocks: ≈ 0.45–0.5 × 0.6 × 1–1.2 m).',
  },
  variants: VARIANTS.map(({ id, name }) => ({ id, name })),
  shots: [
    { view: 'top', label: 'Top view' },
    { view: 'front', label: 'Front view' },
    { view: 'iso', variant: 'mossy', label: 'Mossy' },
    { view: 'iso', variant: 'clean', label: 'Clean (new)' },
    { view: 'iso', variant: 'module', label: 'Module (tiles)' },
  ],
  ref: { sheet: SHEET_15, box: [417, 579, 662, 792] },
  build: ({ variant, seed }) => {
    const v = VARIANTS.find((x) => x.id === variant) ?? VARIANTS[0];
    return wallSegment({ length: 2, layers: { body: false, cornice: false }, ends: v.ends, openings: [], finish: v.stone.finish, weather: v.stone.weather, seed });
  },
});
