import type { DoorSize } from '../../lib/openings';
import { WALL, WALL_STONE, wallSegment, wallSpan, type WallEnd, type WallOpening, type WallStone } from '../../lib/wall';
import { snap } from '../../shapes';
import { defineKitAsset } from '../../types';
import { SHEET_15 } from './_core-segment';
import { doorOpening, windowOpening } from './_openings-frames';

/**
 * §15 ⑥ Door opening: a run of temple wall with a doorway at ground level —
 * as on the sheet a tall opening under a carved band, a baluster window
 * beside it and a pier at each end — built the way Angkor Wat's doors are: a
 * 2 : 1 opening (the sheet's is ≈ 3 : 1) lined by jambs, with octagonal
 * colonnettes carrying a proud carved lintel and pilasters outside them, a
 * surround ≈ 3 × the clear width, on both faces (lib/openings `doorFrame`).
 * The plinth bands and string courses of the wall (lib/wall) stop against the
 * pilasters; a 7-baluster window stands either side. The doorway stays open
 * in the colliders over a 0.125 m threshold, so the explorer walks through.
 * The "door bay" variant is the door alone in a 4 m run with open ends: it
 * drops into a run of §15 segments (next one at x ± 4).
 */

interface DoorVariant {
  id: string;
  name: string;
  size: DoorSize;
  length: number;
  stone: WallStone;
  ends: WallEnd;
  windows: boolean;
}

const VARIANTS: DoorVariant[] = [
  { id: 'standard', name: 'Gallery door', size: 'standard', length: 10, stone: WALL_STONE.weathered, ends: 'pier', windows: true },
  { id: 'main', name: 'Main door', size: 'main', length: 12, stone: WALL_STONE.weathered, ends: 'pier', windows: true },
  { id: 'small', name: 'Small door', size: 'small', length: 10, stone: WALL_STONE.weathered, ends: 'pier', windows: true },
  { id: 'mossy', name: 'Mossy', size: 'standard', length: 10, stone: WALL_STONE.mossy, ends: 'pier', windows: true },
  { id: 'bay', name: 'Door bay (tiles)', size: 'standard', length: 4, stone: WALL_STONE.weathered, ends: 'open', windows: false },
];

export default defineKitAsset({
  section: '15',
  order: 6,
  name: 'Door opening',
  caption: 'Doorway through the wall under a carved lintel, windows either side.',
  size: {
    real: 'gallery door 1.25 × 2.5 m clear over a 0.125 m threshold, 0.5 m lintel, carved surround 3.875 m wide × 3.125 m; in a 10 m run of 1.0 m wall, 5.0 m to the cornice (5.375 m coping, 6.125 m pier heads), a 1.375 × 1.625 m window of 7 balusters either side. Main door 1.75 × 3.375 m (surround 4.875 m, 12 m run); small 1.0 × 2.0625 m (surround 3.0 m); door bay 4.0 m',
    sheet: 'a doorway ≈ 3 : 1 cut plainly into a wall ≈ 3 m high (6 courses), under a carved band, a window of 2–3 balusters beside it, the run ≈ 1.6 × as long as high',
    note: 'Angkor Wat doors measure ≈ 2 : 1 (an inner door ≈ 0.99 × 2.06 m beside a 1.37 m window), framed by colonnettes and pilasters ≈ 3 × the clear width under a 0.5 m lintel (SIZES-ARCH §1.4); the kit’s gallery door is 1.25 × 2.5 m. The wall is the §15 standard (5 m to the cornice; the sheet’s 3 m is too low). The door stands on the ground, not on the 1 m plinth as a gallery door does, so the 1.70 m explorer walks straight in over a 0.125 m threshold. 10 m = the 4 m door bay, a 2 m window bay either side and 1 m end piers, close to the sheet’s proportions; the door bay alone tiles on the 2 m rhythm.',
  },
  variants: VARIANTS.map(({ id, name }) => ({ id, name })),
  shots: [
    { view: 'front', label: 'Front view' },
    { view: 'top', label: 'Top view' },
    { view: 'side', label: 'Side view' },
    { view: 'iso', variant: 'main', label: 'Main door' },
    { view: 'iso', variant: 'small', label: 'Small door' },
    { view: 'iso', variant: 'mossy', label: 'Mossy' },
    { view: 'iso', variant: 'bay', label: 'Door bay (tiles)' },
  ],
  ref: { sheet: SHEET_15, box: [18, 362, 503, 570] },
  build: ({ variant, seed, height }) => {
    const v = VARIANTS.find((x) => x.id === variant) ?? VARIANTS[0];
    // (the band of windows and the door need the standard wall's height at least)
    const H = Math.max(WALL.height, height ?? WALL.height);
    const openings: WallOpening[] = [];
    const door = doorOpening({ size: v.size, span: v.windows ? undefined : [-v.length / 2, v.length / 2], weather: v.stone.weather, seed });
    openings.push(door);
    if (v.windows) {
      // A window centred in the wall left either side of the surround.
      const [, x1] = wallSpan({ length: v.length, ends: v.ends });
      const x = snap((x1 + (door.width ?? 0) / 2) / 2, 0.125);
      openings.push(windowOpening({ x: -x }), windowOpening({ x }));
    }
    return wallSegment({ length: v.length, height: H, ends: v.ends, finish: v.stone.finish, weather: v.stone.weather, seed, openings });
  },
});
