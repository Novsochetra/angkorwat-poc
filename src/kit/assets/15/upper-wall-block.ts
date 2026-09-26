import { wallSegment, WALL_STONE } from '../../lib/wall';
import { defineKitAsset } from '../../types';
import { SHEET_15 } from './_core-segment';

/**
 * §15 ⑪ Upper wall block: the top layer of every §15 wall — two cornice bands
 * corbelling out and the coping on top, moss on the ledges — as a 2 m module.
 * The block variants return the cornice round their ends (the sheet's block);
 * the module variant has open ends and tiles along the top of a wall.
 */
const VARIANTS = [
  { id: 'block', name: 'Weathered block', stone: WALL_STONE.weathered, ends: 'return' as const, coping: undefined },
  { id: 'mossy', name: 'Mossy', stone: WALL_STONE.mossy, ends: 'return' as const, coping: undefined },
  { id: 'clean', name: 'Clean (new)', stone: WALL_STONE.clean, ends: 'return' as const, coping: undefined },
  { id: 'module', name: 'Module (open ends, tiles)', stone: WALL_STONE.weathered, ends: 'open' as const, coping: undefined },
  { id: 'cornice', name: 'Cornice only (under a roof)', stone: WALL_STONE.weathered, ends: 'open' as const, coping: 0 },
];

export default defineKitAsset({
  section: '15',
  order: 11,
  name: 'Upper wall block',
  caption: 'Cornice course that caps a wall: projecting bands and a coping.',
  size: {
    real: '2.0 m long × 1.5 m deep at the top band (on a 1.0 m wall) × 0.5 m cornice (two 0.25 m bands set out 0.125 and 0.25 m) + 0.375 m coping',
    sheet: '≈ 2 blocks deep, 2–3 courses (≈ 1 m) high',
    note: 'Cornices at Angkor Wat stand ≈ 0.5 m (two ≈ 0.25 m bands) and project 0.25–0.375 m; the kit wall’s cornice, as a 2 m module. The coping (set in a texel from the wall faces) caps a free-standing wall; walls under a gallery roof leave it off.',
  },
  variants: VARIANTS.map(({ id, name }) => ({ id, name })),
  shots: [
    { view: 'top', label: 'Top view' },
    { view: 'front', label: 'Front view' },
    { view: 'iso', variant: 'mossy', label: 'Mossy' },
    { view: 'iso', variant: 'clean', label: 'Clean (new)' },
    { view: 'iso', variant: 'module', label: 'Module (tiles)' },
    { view: 'iso', variant: 'cornice', label: 'Cornice only' },
  ],
  ref: { sheet: SHEET_15, box: [680, 579, 961, 792] },
  build: ({ variant, seed }) => {
    const v = VARIANTS.find((x) => x.id === variant) ?? VARIANTS[0];
    return wallSegment({ length: 2, layers: { plinth: false, body: false }, coping: v.coping, ends: v.ends, openings: [], finish: v.stone.finish, weather: v.stone.weather, seed });
  },
});
