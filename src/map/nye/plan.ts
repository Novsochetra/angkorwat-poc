/**
 * New Year's Eve online (AWP-35): WHERE everything stands on the festival square at the foot of Phnom Kulen,
 * between the hill and the sugar-palm village (the owner's sheet, assets/new-year-online/plaza-sheet.png:
 * "proposed placement"). No three.js: the square, the stage, the people, the fireworks, the mini-map and the
 * sound all read it.
 *
 * The ground (checked 2026-11-20 with the height field): x 356‥412, z −290‥−238 is flat at 8 m, nothing
 * built on it; the back trail runs along its south edge (z ≈ −228‥−236), the picnic trail just east of it
 * (x ≈ 412‥428), Kulen's slope rises behind it from z ≈ −295, the zip line's last station stands west of it
 * at (348, −236), the woodcutters' camp south-east at (402, −216). From the square, looking north: the lit
 * stairway climbs Kulen on the left, the temple on its top, the Kulen falls on the right.
 *
 * Axes: +x east, −z north, +y up; `facing` is radians toward (sin, cos) in x, z (0 = +z, south).
 * Heights: `GROUND` is the land's top there (field.heightAt); parts read the field, this is what it was.
 */

/** The land's top over the square (m; the height field's own, checked). */
export const GROUND = 8;

/** The paved square: an ellipse round its centre (m). */
export const SQUARE = { x: 383, z: -262, rx: 22, rz: 21 } as const;

/**
 * The stage at the square's north side, its back to Kulen, facing south (+z) across the square: a stone
 * platform `h` m high from `x0` to `x1`, front edge at `front`, back at `back`; stairs down its front
 * middle (`stair` m wide, to `stairTo`). The board's gate stands on it (`BOARD`).
 */
export const STAGE = { x: 383, x0: 369, x1: 397, front: -284, back: -297, h: 1.6, stair: 8, stairTo: -280, facing: 0 } as const;

/**
 * The countdown board in its stage gate, facing south: its middle (`y` over `GROUND`), its screen `w` × `h`
 * m; the temple top (a Khmer prasat, carved) rises over the gate to `top` m over the ground.
 */
export const BOARD = { x: 383, y: 7.4, z: -290.6, w: 13, h: 6.5, top: 24 } as const;

/** The gathering ring of light on the floor: the meeting point (also on the mini-map). */
export const RING = { x: 383, z: -261, r: 8.5 } as const;

/**
 * The entrance gate on the village side (south), Bayon faces on its tower as at Angkor Thom's gates;
 * `w` m wide opening, facing south (the way people come in from the village).
 */
export const GATE = { x: 384, z: -239.5, w: 4.6, facing: 0 } as const;

/**
 * The lantern walk to the gate: from the village up the Kulen foot trail (layout.ts `TRAILS`), along the back
 * trail's stretch past the woodcutters' camp, to the gate (points on the map, m; heights from the land).
 */
export const LANTERN_WALK: readonly [number, number][] = [
  [410, -62],
  [412, -96],
  [414, -130],
  [410, -170],
  [404, -206],
  [398, -222],
  [390, -230],
  [384, -236],
];

/** Stalls round the square's sides (New Year snacks), each facing the square's middle. */
export const STALLS: readonly { x: number; z: number; facing: number }[] = [
  { x: 364, z: -270, facing: Math.PI / 2 + 0.25 },
  { x: 363, z: -256, facing: Math.PI / 2 - 0.1 },
  { x: 402, z: -270, facing: -Math.PI / 2 - 0.25 },
  { x: 403, z: -256, facing: -Math.PI / 2 + 0.1 },
];

/** Naga (Khmer: cobras with a smooth fan hood, as on Angkor Wat's causeway) guarding the stage's stairs, facing south. */
export const NAGA: readonly { x: number; z: number; facing: number }[] = [
  { x: 376.5, z: -282.5, facing: 0 },
  { x: 389.5, z: -282.5, facing: 0 },
];

/**
 * The fireworks: launched from Kulen's lower slopes behind and right of the stage and over the falls, so from the
 * square they rise over the stage with the hill on the left and the falls on the right (the owner's fireworks
 * reference), and are seen from most of the map. `x`, `z` the show's middle, `spread` m each way in x; bursts
 * between `low` and `high` m over the sea level (the hill's top is 150 m).
 */
export const SHOW_AREA = { x: 425, z: -385, spread: 90, depth: 60, low: 45, high: 250 } as const;

/** Where a crowd camera looks at it all from (shots and the promo): inside the square, just past the gate's tower (≈ 19 m tall over the passage). */
export const VIEW = { cam: [384, 11, -248] as const, at: [388, 20, -330] as const, fov: 55 } as const;

/** Inside the square (with a margin m): no trees, nothing else built there. */
export function onSquare(x: number, z: number, margin = 0): boolean {
  const dx = (x - SQUARE.x) / (SQUARE.rx + margin);
  const dz = (z - SQUARE.z) / (SQUARE.rz + margin);
  return dx * dx + dz * dz <= 1 || (x >= STAGE.x0 - margin && x <= STAGE.x1 + margin && z >= STAGE.back - margin && z <= STAGE.front + margin);
}
