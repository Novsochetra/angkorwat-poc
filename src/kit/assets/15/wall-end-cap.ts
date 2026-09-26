import { FACE, wallPier, WALL_STONE } from '../../lib/wall';
import { defineKitAsset } from '../../types';
import { SHEET_15 } from './_core-segment';

/**
 * §15 ⑤ Wall end cap: the free-standing pier that ends a run of wall — a heavy
 * moulded base, a body with a framed niche (a false door) in its face, the
 * cornice as its capital and a stepped head crowned by a block, moss on every
 * step. Centred on the origin; the "wall end" variant has its −X side cut
 * flush, so an open-ended run butts against it (place it 1.0 m past the run's
 * end).
 */
const VARIANTS = [
  { id: 'free', name: 'Free-standing', stone: WALL_STONE.weathered, joins: 0 },
  { id: 'mossy', name: 'Mossy', stone: WALL_STONE.mossy, joins: 0 },
  { id: 'clean', name: 'Clean (new)', stone: WALL_STONE.clean, joins: 0 },
  { id: 'wall-end', name: 'Wall end (a run joins at −X)', stone: WALL_STONE.weathered, joins: FACE.nx },
];

export default defineKitAsset({
  section: '15',
  order: 5,
  name: 'Wall end cap',
  caption: 'Terminal pier with a framed niche and a stepped head.',
  size: {
    real: 'shaft 2.0 m wide × 1.5 m deep (base 2.5 × 2.0 m), cornice at 5.0 m, head to 6.5 m',
    sheet: '≈ 2 × as tall as wide, the front wider than the side (≈ 4 : 3), ≈ 3.5 m',
    note: 'It ends a 5 m wall, so its cornice lines up with the wall’s and its head rises 1.5 m above (a pier head standing 0.5–1 m clear of the coping, like the gallery pier heads). 1.5 m deep = the 1 m wall + 0.25 m proud each side; 2.0 m wide keeps the sheet’s broader front, which carries the niche: a false door 0.75 × 2.375 m, 0.375 m deep, in a proud frame.',
  },
  variants: VARIANTS.map(({ id, name }) => ({ id, name })),
  mainView: 'iso',
  shots: [
    { view: 'front', label: 'Front view' },
    { view: 'side', label: 'Side view' },
    { view: 'top', label: 'Top view' },
    { view: 'iso', variant: 'mossy', label: 'Mossy' },
    { view: 'iso', variant: 'clean', label: 'Clean (new)' },
    { view: 'iso', variant: 'wall-end', label: 'Wall end' },
  ],
  ref: { sheet: SHEET_15, box: [1279, 92, 1518, 352] },
  build: ({ variant, seed, height }) => {
    const v = VARIANTS.find((x) => x.id === variant) ?? VARIANTS[0];
    return wallPier({ width: 2, depth: 1.5, height, niche: 'front', joins: v.joins, finish: v.stone.finish, weather: v.stone.weather, seed });
  },
});
