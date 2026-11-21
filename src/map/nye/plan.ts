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

/** The paved square: an ellipse round its centre (m): 68 × 48 m (the owner: room for the crowd; west of it the sala, east the picnic trail). */
export const SQUARE = { x: 383, z: -262, rx: 34, rz: 24 } as const;

/**
 * The stage at the square's north side, its back to Kulen, facing south (+z) across the square: a stone
 * platform `h` m high from `x0` to `x1`, front edge at `front`, back at `back`; stairs down its front
 * middle (`stair` m wide, to `stairTo`). The board's gate stands on it (`BOARD`).
 */
export const STAGE = { x: 383, x0: 365, x1: 401, front: -284, back: -297, h: 1.6, stair: 8, stairTo: -280, facing: 0 } as const;

/**
 * The countdown board in its stage gate, facing south: its middle (`y` over `GROUND`), its screen `w` × `h`
 * m; the temple top (a Khmer prasat, carved) rises over the gate to `top` m over the ground.
 */
export const BOARD = { x: 383, y: 8.4, z: -290.6, w: 18, h: 9, top: 28 } as const;

/** The gathering ring of light on the floor: the meeting point (also on the mini-map). */
export const RING = { x: 383, z: -261, r: 10 } as const;

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
  // (then in under the welcome arch at the avenue's south end, and straight north up the avenue to the gate: _sqWalk.ts `AVENUE`)
  [392, -203],
  [384, -203],
  [384, -236],
];

/** What a stall sells (nye/_sqStalls.ts): the four snack stalls and the sugarcane juice cart are shops (E Buy). */
export type StallKind = 'sweets' | 'grill' | 'drinks' | 'cakes' | 'flowers' | 'toys' | 'cane';

/**
 * Stalls on the square, each facing the square's middle: the four New Year snack stalls at its sides; lotus and
 * jasmine garlands by the gate's east, paper lamps and toys by its west, the sugarcane juice cart (a pushcart under a
 * parasol: `cane`) east of the ring.
 */
export const STALLS: readonly { x: number; z: number; facing: number; kind: StallKind }[] = [
  { x: 354, z: -271, facing: Math.PI / 2 + 0.25, kind: 'sweets' },
  { x: 352, z: -257, facing: Math.PI / 2 - 0.1, kind: 'grill' },
  { x: 412, z: -271, facing: -Math.PI / 2 - 0.25, kind: 'drinks' },
  { x: 414, z: -257, facing: -Math.PI / 2 + 0.1, kind: 'cakes' },
  { x: 398, z: -246.2, facing: -2.36, kind: 'flowers' },
  { x: 368, z: -246.2, facing: 2.36, kind: 'toys' },
  { x: 404, z: -266.5, facing: -1.33, kind: 'cane' },
];

/** Stalls are drawn this many times a real one's metres (nye/_sqStalls.ts), for the map's people (1.4 × a real person). */
export const STALL_K = 1.3;

/**
 * Festival seating on the square (nye/_sqSeats.ts builds it; people/_nyePlan.ts seats the crowd there): low tables
 * with four stools by the food stalls (`yaw`: the table's long side along (cos, −sin) in x, z), low wooden benches
 * (`facing`: the way the sitters face; `len` m), fire bowls on stone stems that children run round. Seats' tops are
 * `SEAT_H` m over the paving, the tables' `TABLE_H`.
 */
export const SEAT_H = 0.24;
export const TABLE_H = 0.6;
export const TABLES: readonly { x: number; z: number; yaw: number }[] = [
  { x: 362.5, z: -270, yaw: 0.15 },
  { x: 364.5, z: -263.5, yaw: -0.1 },
  { x: 361, z: -257, yaw: 0.2 },
  { x: 405.5, z: -259.5, yaw: -0.15 },
];
export const BENCHES: readonly { x: number; z: number; facing: number; len: number }[] = [
  { x: 360.6, z: -278.6, facing: 1.75, len: 2.2 },
  { x: 405.4, z: -278.6, facing: -1.75, len: 2.2 },
  { x: 359.8, z: -250.2, facing: 2.0, len: 2.2 },
  { x: 406.2, z: -250.2, facing: -2.0, len: 2.2 },
];
export const FIRES: readonly { x: number; z: number }[] = [
  { x: 372.6, z: -252 },
  { x: 393.4, z: -252 },
];

/**
 * The sala (សាលា) on the square's west side, outside its edge (nye/_sqSala.ts): its middle, `w` × `d` m; its floor
 * `SALA_FLOOR` m over the land's lowest corner under it. Monks watch from it on the night (people/_nyePlan.ts).
 */
export const SALA = { x: SQUARE.x - SQUARE.rx - 10.5, z: SQUARE.z - 0.5, w: 6.4, d: 8.8 } as const;
export const SALA_FLOOR = 0.75;

/** A table's four stools (map x, z; `facing` the table). */
export function tableStools(t: { x: number; z: number; yaw: number }): { x: number; z: number; facing: number }[] {
  const c = Math.cos(t.yaw);
  const s = Math.sin(t.yaw);
  const out: { x: number; z: number; facing: number }[] = [];
  for (const side of [1, -1])
    for (const u of [-0.45, 0.45]) {
      const lz = side * 0.98;
      out.push({ x: t.x + u * c + lz * s, z: t.z - u * s + lz * c, facing: t.yaw + (side > 0 ? Math.PI : 0) });
    }
  return out;
}

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
export const VIEW = { cam: [384, 11, -248] as const, at: [410, 40, -335] as const, fov: 55 } as const;

/** Inside the square (with a margin m): no trees, nothing else built there. */
export function onSquare(x: number, z: number, margin = 0): boolean {
  const dx = (x - SQUARE.x) / (SQUARE.rx + margin);
  const dz = (z - SQUARE.z) / (SQUARE.rz + margin);
  return dx * dx + dz * dz <= 1 || (x >= STAGE.x0 - margin && x <= STAGE.x1 + margin && z >= STAGE.back - margin && z <= STAGE.front + margin);
}

// ── The second stage: by the great lake, north of the floating village (the owner, 2026-11-21) ───────────────────
//
// The ground (checked with the height field): the lake's north-east shore meadow, x −380‥−320, z −90‥−50, is flat at
// 8 m; under it a sand beach 1 m over the water (6 m) from z ≈ −48 there, ≈ 8 m wide, and the water (level 5, bed 4)
// past it — at x −360 from z ≈ −36, curving south-east to x ≈ −320 at z −12 (the beach's edge to x ≈ −308 at z −24);
// the shallows are 1 m deep (0.6 by the beach); the lake trail
// runs along its north edge (z ≈ −94‥−100), the east shore trail at x ≈ −290, the Bayon stream at x ≈ −404; the
// floating village lies ≈ 100 m south (−300, 74). From the shore the crowd looks south-west over a floating stage
// across the open lake, the fireworks over the water behind the stage (and in it), the floating village's lights to
// the left, the western cliffs and their lit stairway behind.

/**
 * The lake stage: a floating stage on pontoons in the shallows off the shore (13 m out along its axis from where the
 * owner first set it, (−362, −37): that was the beach's edge; now all of it floats but a corner of its front by the
 * beach), its front (the board) facing the shore
 * (`yaw`: radians toward (sin, cos) in x, z; the crowd is that way), `w` × `d` m, its deck `deck` m over the water.
 */
export const LAKE_STAGE = { x: -370.2, z: -26.9, yaw: Math.atan2(22, -27), w: 22, d: 12, deck: 1.2 } as const;

/** The shore terrace where the lakeside crowd gathers, facing the stage: a paved ellipse on the meadow (m). */
export const LAKE_SHORE = { x: -342, z: -64, rx: 20, rz: 15 } as const;

/** The lake show: the bursts over the open water behind the stage seen from the shore (m; `low`‥`high` over the water). */
export const LAKE_SHOW = { x: -440, z: 10, spread: 70, depth: 45, low: 40, high: 210 } as const;

/** The lakeside crowd's camera (shots and the film): on the terrace's back, eye height, looking over the stage to the lake. */
export const LAKE_VIEW = { cam: [-330, 12.5, -76] as const, at: [-385, 30, -15] as const, fov: 55 } as const;

/** On the shore terrace (with a margin m). */
export function onLakeShore(x: number, z: number, margin = 0): boolean {
  const dx = (x - LAKE_SHORE.x) / (LAKE_SHORE.rx + margin);
  const dz = (z - LAKE_SHORE.z) / (LAKE_SHORE.rz + margin);
  return dx * dx + dz * dz <= 1;
}

/**
 * Between the lake stage and the terrace (with a margin m): the landing, the ghat down the bank and the jetty, in the
 * stage's frame `u` across ±14 m, `v` 4‥32 m toward the shore. No loose rock is laid there (terrain/rocks.ts: an outcrop
 * on the bank's lip stood in the ghat).
 */
export function onLakeLanding(x: number, z: number, margin = 0): boolean {
  const dx = x - LAKE_STAGE.x;
  const dz = z - LAKE_STAGE.z;
  const u = dx * Math.cos(LAKE_STAGE.yaw) - dz * Math.sin(LAKE_STAGE.yaw);
  const v = dx * Math.sin(LAKE_STAGE.yaw) + dz * Math.cos(LAKE_STAGE.yaw);
  return Math.abs(u) <= 14 + margin && v >= 4 - margin && v <= 32 + margin;
}
