import { WALL, WALL_STONE, wallSegment, wallSpan, type WallEnd, type WallStone } from '../../lib/wall';
import { defineKitAsset } from '../../types';
import { SHEET_15 } from './_core-segment';
import { windowOpening, type WindowSpec } from './_openings-frames';

/**
 * §15 ⑦ Window opening: a run of temple wall pierced by a row of baluster
 * windows between end piers, as on the sheet — the sill string under them,
 * the head string carved with a fret over them as their lintel, the cornice
 * and coping above. Each window is Angkor Wat's (7 lathe-turned balusters
 * nearly touching in a 1.375 × 1.625 m opening; the sheet draws 2–3), one to
 * each 2 m bay. Variants: blind windows (a dark recess, the balusters under a
 * lowered stone blind), the smaller 5-baluster window, mossy stone, and the
 * three bays alone with open ends, which drop into a run of §15 segments.
 */

interface WindowVariant {
  id: string;
  name: string;
  length: number;
  ends: WallEnd;
  stone: WallStone;
  window: Omit<WindowSpec, 'x'>;
}

const VARIANTS: WindowVariant[] = [
  { id: 'open', name: 'Open windows', length: 8, ends: 'pier', stone: WALL_STONE.weathered, window: {} },
  { id: 'blind', name: 'Blind windows', length: 8, ends: 'pier', stone: WALL_STONE.weathered, window: { blind: true } },
  { id: 'five', name: '5 balusters', length: 8, ends: 'pier', stone: WALL_STONE.weathered, window: { type: 'five' } },
  { id: 'mossy', name: 'Mossy', length: 8, ends: 'pier', stone: WALL_STONE.mossy, window: {} },
  { id: 'bays', name: 'Window bays (tiles)', length: 6, ends: 'open', stone: WALL_STONE.weathered, window: {} },
];

export default defineKitAsset({
  section: '15',
  order: 7,
  name: 'Window opening',
  caption: 'Row of baluster windows between piers, a cornice over them.',
  size: {
    real: '8.0 m run (three 2 m window bays between 1 m end piers) × 1.0 m thick × 5.0 m to the cornice (5.375 m coping, 6.125 m pier heads); windows 1.375 × 1.625 m clear with 7 balusters 0.196 m apart, frame 0.1875 m, sill 1.5 m above the ground (0.5 m above the plinth); 5-baluster window 1.0 × 1.375 m; the bays alone 6.0 m',
    sheet: 'three windows of 2–3 balusters, ≈ 1 × 1.3 m, between end piers, in a wall ≈ 3 m high (6 courses), the run ≈ 1.6 × as long as high',
    note: 'Measured Angkor Wat windows are ≈ 1.37 m wide and 1.5–1.8 m high with 7 balusters (some 5) so close their rings nearly touch, the sill ≈ 0.54 m over the gallery floor (SIZES-ARCH §1.5): the sheet’s 2–3 balusters are too few. The wall is the §15 standard (5 m to the cornice; the sheet’s 3 m is too low). At that height, three 2 m bays between the 1 m piers keep the sheet’s long, low proportions (8 m); the bays without the piers (6 m) tile on the kit’s 2 m rhythm.',
  },
  variants: VARIANTS.map(({ id, name }) => ({ id, name })),
  shots: [
    { view: 'front', label: 'Front view' },
    { view: 'top', label: 'Top view' },
    { view: 'side', label: 'Side view' },
    { view: 'iso', variant: 'blind', label: 'Blind windows' },
    { view: 'iso', variant: 'five', label: '5 balusters' },
    { view: 'iso', variant: 'mossy', label: 'Mossy' },
    { view: 'iso', variant: 'bays', label: 'Window bays (tiles)' },
  ],
  ref: { sheet: SHEET_15, box: [520, 362, 1025, 570] },
  build: ({ variant, seed, height }) => {
    const v = VARIANTS.find((x) => x.id === variant) ?? VARIANTS[0];
    // (the window band needs the standard wall's height at least)
    const H = Math.max(WALL.height, height ?? WALL.height);
    const [x0, x1] = wallSpan({ length: v.length, ends: v.ends });
    const n = Math.round((x1 - x0) / WALL.bay);
    const openings = Array.from({ length: n }, (_, i) => windowOpening({ ...v.window, x: x0 + (i + 0.5) * WALL.bay }));
    return wallSegment({ length: v.length, height: H, ends: v.ends, finish: v.stone.finish, weather: v.stone.weather, seed, openings });
  },
});
