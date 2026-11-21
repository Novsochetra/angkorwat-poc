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

/** Stalls round the square's sides (New Year snacks), each facing the square's middle. */
export const STALLS: readonly { x: number; z: number; facing: number }[] = [
  { x: 354, z: -271, facing: Math.PI / 2 + 0.25 },
  { x: 352, z: -257, facing: Math.PI / 2 - 0.1 },
  { x: 412, z: -271, facing: -Math.PI / 2 - 0.25 },
  { x: 414, z: -257, facing: -Math.PI / 2 + 0.1 },
];

/** Naga (Khmer: cobras with a smooth fan hood, as on Angkor Wat's causeway) guarding the stage's stairs, facing south. */
export const NAGA: readonly { x: number; z: number; facing: number }[] = [
  { x: 376.5, z: -282.5, facing: 0 },
  { x: 389.5, z: -282.5, facing: 0 },
];

/**
 * The fireworks: launched from Kulen's slopes behind and right of the stage and over the falls, so from the square
 * they fill the sky over the hill and right of it (the owner's fireworks reference: the hill on the left, the bursts
 * over and beside it), and are seen from most of the map. `x`, `z` the show's middle, `spread` m each way in x,
 * `depth` in z; bursts between `low` and `high` m over the sea level (the hill's top is 150 m): the crown over its
 * upper south face and summit (to 186 m), the big high ones over its east flank (to ≈ 260 m), crackles low by the
 * falls (nye/show.ts places them).
 */
export const SHOW_AREA = { x: 464, z: -412, spread: 140, depth: 60, low: 45, high: 260 } as const;

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

/**
 * The shore plaza where the lakeside crowd gathers, facing the stage (the owner's lake reference, 2026-11-21:
 * assets/new-year-online/lake-reference.png): a ROUND paved plaza on the meadow, its middle on the stage's axis 44.5 m
 * from the stage (the bank is ≈ 25 m out from it there), `rx` = `rz` its radius to the ring wall (m). Fixed on the
 * land: the jetty runs from its front down the ghat to wherever the stage floats. The plaza's own layout (its ring
 * wall, gate, salas, stalls, fire pillars) is below (`lakePlazaAt`, `LAKE_WALL` …), as pure geometry for the people.
 */
export const LAKE_SHORE = { x: -342.09, z: -61.4, rx: 21, rz: 21 } as const;

/** The lake show: the bursts over the open water behind the stage seen from the shore (its middle, m each way; `low`‥`high` m over the water). */
export const LAKE_SHOW = { x: -488, z: 47, spread: 110, depth: 60, low: 30, high: 225 } as const;

/** The lakeside crowd's camera (shots and the film): on the terrace's back, eye height, looking over the stage to the lake. */
export const LAKE_VIEW = { cam: [-330, 12.5, -76] as const, at: [-385, 30, -15] as const, fov: 55 } as const;

/** On the shore plaza, inside its ring wall (with a margin m). */
export function onLakeShore(x: number, z: number, margin = 0): boolean {
  const dx = (x - LAKE_SHORE.x) / (LAKE_SHORE.rx + margin);
  const dz = (z - LAKE_SHORE.z) / (LAKE_SHORE.rz + margin);
  return dx * dx + dz * dz <= 1;
}

// ── The plaza's layout (nye/_lkPlaza*.ts builds it; the people and the mini-map can read it) ─────────────────────────
//
// Bearings `phi` round the plaza's middle: 0 toward the stage (down the jetty), + toward the stage's +u (the
// north-west: the right hand seen from the plaza's back), ±π its back (the land side). Radians; `DEG` for degrees.

const DEG = Math.PI / 180;
const PF: readonly [number, number] = [-Math.sin(LAKE_STAGE.yaw), -Math.cos(LAKE_STAGE.yaw)];
const PU: readonly [number, number] = [Math.cos(LAKE_STAGE.yaw), -Math.sin(LAKE_STAGE.yaw)];

/** The map point (x, z) at bearing `phi` and `r` m from the plaza's middle. */
export function lakePlazaAt(phi: number, r: number): [number, number] {
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  return [LAKE_SHORE.x + (PF[0] * c + PU[0] * s) * r, LAKE_SHORE.z + (PF[1] * c + PU[1] * s) * r];
}

/** A map point's bearing (radians, −π‥π) and distance (m) from the plaza's middle. */
export function lakePlazaPolar(x: number, z: number): [number, number] {
  const dx = x - LAKE_SHORE.x;
  const dz = z - LAKE_SHORE.z;
  return [Math.atan2(dx * PU[0] + dz * PU[1], dx * PF[0] + dz * PF[1]), Math.hypot(dx, dz)];
}

/** The way something at bearing `phi` faces the plaza's middle (a yaw: radians toward (sin, cos) in x, z). */
export function lakeFacingIn(phi: number): number {
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  return Math.atan2(-(PF[0] * c + PU[0] * s), -(PF[1] * c + PU[1] * s));
}

/**
 * The ring wall round the plaza (a low stone wall, fire pillars on it): its middle line `r` m out, its openings — the
 * front to the landing and the ghat (|phi| < `front`), the land gate (`LAKE_GATE`), the side way in from the east shore
 * trail (`LAKE_SIDE`, where the crowd's way reaches the plaza: people/_nyeLakePlan.ts `ENTRY`) — and the two salas,
 * which stand in its line (`LAKE_SALAS`). `half` its footing's half thickness, `top` its coping's top over the land (m).
 */
export const LAKE_WALL = { r: 21.45, front: 30 * DEG, half: 0.25, top: 0.88 } as const;

/** The land gate: an Angkor gate with Bayon faces on the wall's line at `phi`, `half` m either side of it, `depth` m deep (≈ 8.8 m to its tower's bud). */
export const LAKE_GATE = { phi: -160 * DEG, half: 3.63, depth: 2.86 } as const;

/** The paved avenue out from the gate to where the lake trail and the east shore trail meet: from `r0` to `r1` m out along the gate's bearing, `w` m wide. */
export const LAKE_AVENUE = { phi: LAKE_GATE.phi, r0: LAKE_WALL.r + LAKE_GATE.depth / 2, r1: 45, w: 4.2 } as const;

/** The side way in (an opening between two fire pillars). */
export const LAKE_SIDE = { phi: -127 * DEG, half: 2.2 } as const;

/** The two salas on the rim either side of the stage (their middles; each faces the plaza's middle; `w` × `d` m). */
export const LAKE_SALAS: readonly { x: number; z: number; phi: number; facing: number; w: number; d: number }[] = [62, -62].map((d) => {
  const [x, z] = lakePlazaAt(d * DEG, 22.6);
  return { x, z, phi: d * DEG, facing: lakeFacingIn(d * DEG), w: 6.4, d: 7.0 };
});

/** The food stalls inside the ring wall, their backs to it (their middles; each faces the plaza's middle; ≈ 3.4 × 2.6 m). */
export const LAKE_STALLS: readonly { x: number; z: number; phi: number; facing: number }[] = [84, 106, -84, -104].map((d) => {
  const [x, z] = lakePlazaAt(d * DEG, 18.6);
  return { x, z, phi: d * DEG, facing: lakeFacingIn(d * DEG) };
});

/** The fire pillars on the ring wall (bearings): the two big ones flanking the landing, the rest along the wall's runs. */
export const LAKE_PILLARS: readonly { phi: number; x: number; z: number; big: boolean }[] = [30, 51.5, 74, 96, 118, 140, 162.5, -30, -51.5, -74, -98, -119, -135].map((d) => {
  const [x, z] = lakePlazaAt(d * DEG, LAKE_WALL.r);
  return { phi: d * DEG, x, z, big: Math.abs(d) === 30 };
});

/**
 * The ring wall's runs: bearings from → to (radians, 0‥2π round from the front opening's right edge, +φ), the openings
 * (the front, the land gate, the side way) and the salas left out. The plaza's builder lays the wall along them, the
 * walk map's overlay (roam/_nyePlazaWalk.ts) makes them walls to his feet.
 */
export function lakeWallRuns(): [number, number][] {
  const R = LAKE_WALL.r;
  const gate = Math.atan((LAKE_GATE.half - 0.15) / R);
  const sala = (s: (typeof LAKE_SALAS)[number]) => Math.atan(s.w / 2 / R) + 0.01;
  const side = Math.atan((LAKE_SIDE.half + 0.5) / R);
  const norm = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const cuts = [...LAKE_SALAS.map((s) => [s.phi - sala(s), s.phi + sala(s)]), [LAKE_SIDE.phi - side, LAKE_SIDE.phi + side], [LAKE_GATE.phi - gate, LAKE_GATE.phi + gate]]
    .map(([a, b]) => [norm(a), norm(b)] as [number, number])
    .sort((p, q) => p[0] - q[0]);
  const runs: [number, number][] = [];
  let at = LAKE_WALL.front;
  for (const [a, b] of cuts) {
    if (a > at) runs.push([at, a]);
    at = Math.max(at, b);
  }
  if (2 * Math.PI - LAKE_WALL.front > at) runs.push([at, 2 * Math.PI - LAKE_WALL.front]);
  return runs;
}

/**
 * The naga balustrades' pedestals either side of the avenue (m along it from the gate's middle; `kerb` m across from its
 * middle line): the braziers' by the gate (`foot`, `footHalf` m square, `footTop` m high), the hoods' (`head`).
 */
export const LAKE_NAGA = {
  kerb: LAKE_AVENUE.w / 2 + 0.42,
  foot: LAKE_GATE.depth / 2 + 1,
  head: LAKE_GATE.depth / 2 + 7.2,
  footHalf: 0.65,
  footTop: 1.05,
  headHalf: 0.73,
  headTop: 0.67,
} as const;

/** A sala's floor over its lowest corner (m), its furniture in its frame (x across, z toward the plaza; half sizes; top over the floor). */
export const LAKE_SALA_FLOOR = 0.66;
export const LAKE_SALA_FURNITURE: readonly { x: number; z: number; hx: number; hz: number; top: number }[] = [
  // (the low tables with fruit and cakes, the bench along the back: sala d 7, w 6.4)
  { x: 0, z: -7 / 6 - 0.5, hx: 0.8, hz: 0.4, top: 0.4 },
  { x: 0, z: 7 / 6 + 0.3, hx: 0.8, hz: 0.4, top: 0.4 },
  { x: 0, z: -7 / 2 + 0.75, hx: (6.4 - 1.6) / 2, hz: 0.23, top: 0.46 },
];

/** A stall's counter in its frame (x across, z toward the plaza's middle; its top over the stall's floor, m). */
export const LAKE_STALL_COUNTER = { z: 0.75, w: 2.8, d: 0.62, top: 1.0 } as const;

/** The gold lotus mandala in the plaza's middle (its rim, m: the Kulen ring's painting, nye/_sqRing.ts). */
export const LAKE_MANDALA = { x: LAKE_SHORE.x, z: LAKE_SHORE.z, r: 8.6 } as const;

/** The lily pond outside the wall, left of the avenue by the gate: an ellipse, `rx` m along its bearing (toward the plaza's middle: `yaw`), `rz` m across. */
export const LAKE_POND = (() => {
  const [x, z] = lakePlazaAt(-147 * DEG, 29.5);
  return { x, z, rx: 3.6, rz: 2.6, yaw: lakeFacingIn(-147 * DEG) };
})();

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
