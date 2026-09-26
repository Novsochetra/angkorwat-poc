import { wallCorner, WALL_STONE } from '../../lib/wall';
import { defineKitAsset } from '../../types';
import { SHEET_15 } from './_core-segment';

/**
 * §15 ④ Wall corner: two arms of wall meeting at 90° round a square corner
 * pier — the sheet's outside corner, its arms ending in piers — plus the
 * corner that joins runs (open arm ends) and the inside corner. The origin is
 * where the two wall axes cross (see `wallCorner` in lib/wall.ts).
 */
const VARIANTS = [
  { id: 'outside', name: 'Outside corner', stone: WALL_STONE.weathered, inside: false, ends: 'pier' as const },
  { id: 'mossy', name: 'Mossy', stone: WALL_STONE.mossy, inside: false, ends: 'pier' as const },
  { id: 'clean', name: 'Clean (new)', stone: WALL_STONE.clean, inside: false, ends: 'pier' as const },
  { id: 'open', name: 'Outside, open ends (joins runs)', stone: WALL_STONE.weathered, inside: false, ends: 'open' as const },
  { id: 'inside', name: 'Inside corner (joins runs)', stone: WALL_STONE.weathered, inside: true, ends: 'open' as const },
];

export default defineKitAsset({
  section: '15',
  order: 4,
  name: 'Wall corner',
  caption: 'Two runs of wall turning 90° round a square corner pier.',
  size: {
    real: 'arms 6.0 m from the corner (the wall axes’ crossing), 1.0 m thick × 5.0 m to the cornice; corner pier 1.5 × 1.5 m; pier heads 6.125 m',
    sheet: 'arms ≈ 1.3 × as long as the wall is high (≈ 3 m high), 2 blocks thick; corner pier ≈ 3 blocks square; ~5 balusters an arm',
    note: 'Walls at the kit standard (≈ 5 m to the cornice, 1.0 m thick). The corner pier is the 1 m wall plus 0.25 m standing proud on each face, like the segments’ end piers. Each arm reaches 6 m (three 2 m bays) from the corner, so the next straight segment starts on the 2 m grid and the L keeps the sheet’s long arms at the true height: two bays of blind windows (7 balusters each) between the corner pier and the end pier.',
  },
  variants: VARIANTS.map(({ id, name }) => ({ id, name })),
  shots: [
    { view: 'top', label: 'Top view' },
    { view: 'front', label: 'Front view' },
    { view: 'iso', variant: 'mossy', label: 'Mossy' },
    { view: 'iso', variant: 'clean', label: 'Clean (new)' },
    { view: 'iso', variant: 'open', label: 'Open ends (joins runs)' },
    { view: 'iso', variant: 'inside', label: 'Inside corner' },
  ],
  ref: { sheet: SHEET_15, box: [967, 92, 1266, 352] },
  build: ({ variant, seed, height }) => {
    const v = VARIANTS.find((x) => x.id === variant) ?? VARIANTS[0];
    return wallCorner({ height, inside: v.inside, ends: v.ends, finish: v.stone.finish, weather: v.stone.weather, seed });
  },
});
