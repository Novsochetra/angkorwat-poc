import { hash3 } from '../../voxel/random';
import { envelopeWear, ramp } from '../assets/19.2/_damage-b';
import { BlockSet } from '../BlockSet';
import { fromSheet, SANDSTONE } from '../palette';
import { placePiece, type PlaceTarget } from '../place';
import { rng } from '../shapes';
import { defineKitScene } from '../scene';
import { stoneSurf } from '../surface';
import { finishLook, heap, hollow, mossLedges, noise, paving, plain, Ruin, soil, tufts, type Finish, type Look, type Rubble, type Tuft } from './_scenes192';

/**
 * §19.2 "In-game usage examples — aged temple structure with various damage":
 * the entrance of a temple on its stepped platform. A wide stair of worn
 * steps climbs to a doorway between two pillars, its dark passage behind; on
 * the left a bastion of steep tiers carries the stump of a corner tower; on
 * the right a pier split by a long crack. The damage is the point: step
 * nosings worn round and broken, stones missing from the tiers and the stair,
 * the tower's top and a whole bay of the upper storey collapsed, the lintel
 * cracked, arrises chipped everywhere, moss on every ledge and tread, grass in
 * the joints and fallen fragments at the foot.
 */
const RISE = 0.25;
/** Temple floor: the platform top, eight tiers up. */
const FLOOR = 2.0;
const TIERS = 8;
/** The stair: x range, bottom step's nosing, tread depth. */
const STAIR = { x0: -2.25, x1: 2.25, z: 0.5, tread: 0.4 };
/** The terrace's steep tiers either side of the stair: bottom tier's front, setback per tier. */
const TERRACE = { z: -1.25, set: 0.15 };
/** The bastion on the left, standing out further: its x range, bottom front, setback per tier. */
const BAST = { x0: -9, x1: -3.0, z: 0.6, set: 0.2 };
/** The temple's front wall: faces, height to the cornice. */
const WALL = { x0: -5.5, x1: 9, front: -3.5, back: -4.5, top: 6.5 };
/** The platform's rear. */
const BACK = -8;
/** Doorway (x range, top) and the pillars flanking it (standing 1 m proud). */
const DOOR = { x0: -0.9, x1: 0.9, top: 4.75 };
const PILLARS: [number, number][] = [
  [-2.0, -1.0],
  [1.0, 2.0],
];
/** The cracked pier on the right, and pilasters along the wall (standing 0.25 m proud). */
const PIER: [number, number] = [4.25, 5.25];
const PILASTERS: [number, number][] = [
  [-4.5, -3.75],
  [6.5, 7.25],
];
/** Corner tower on the bastion. */
const TOWER = { x0: -8.0, x1: -5.5, z0: -4.5, z1: -2.0, top: 7.5 };
/** Upper storey: set back on the wall, a bay collapsed through it and down into the wall below. */
const UPPER = { z0: -4.25, z1: -3.75, y0: 7.0, y1: 9.0 };
const COLLAPSE = { x0: 2.15, x1: 7.4, bottom: 4.4, at: 3.2 };

/** Tread / tier top height at (x, z) in front of the platform (for the rubble). */
function ground(x: number, z: number): number {
  const [z0, step] = x > STAIR.x0 && x < STAIR.x1 ? [STAIR.z, STAIR.tread] : x < BAST.x1 ? [BAST.z, BAST.set] : [TERRACE.z, TERRACE.set];
  return Math.max(0, Math.min(TIERS, Math.floor((z0 - z) / step) + 1)) * RISE;
}

/** Finish patches: warm, sunlit steps and tiers; weathered and dark higher up; mossy low and in the shade of the tower. */
function finishAt(x: number, y: number, z: number): Finish {
  const s =
    0.3 +
    0.24 * ramp(2.5, 6.5, y) +
    0.14 * ramp(-4, -7, x) +
    0.14 * ramp(0.6, 0, y) +
    (noise(x, y, z, 1.6, 71) - 0.5) * 0.7 +
    (hash3(Math.round(x * 8), Math.round(y * 8), Math.round(z * 8), 72) - 0.5) * 0.24;
  return s < 0.14 ? 'clean' : s < 0.26 ? 'warm' : s < 0.34 ? 'cracked' : s < 0.6 ? 'weathered' : s < 0.78 ? 'dark' : 'mossy';
}

/** The stair's treads: sunlit, worn clean by feet — the sheet's brightest stones. */
const tread = (x: number, y: number, z: number): Look =>
  finishLook(noise(x, y, z, 1.3, 77) > 0.62 ? 'weathered' : noise(x, y, z, 0.9, 78) > 0.5 ? 'clean' : 'warm', x, y, z, 79, stoneSurf({ moss: 0.08, stain: 0.18, lichen: 0.1 }));

/** Moss low on the tiers and steps, run-off streaks down the upper walls. */
const look = (x: number, y: number, z: number): Look =>
  finishLook(finishAt(x, y, z), x, y, z, 73, stoneSurf({ moss: 0.25 * ramp(1.5, 0.3, y) + 0.1 * ramp(-5, -8, x), stain: 0.45 * ramp(4, 7.5, y) * noise(x, 0, z, 1.1, 74), lichen: 0.1 }));

export default defineKitScene({
  name: 'Aged temple',
  caption: 'Aged temple structure with various damage: worn steps, a cracked pier, broken tiers, a collapsed upper storey, moss and fallen fragments.',
  source: '19.2 Stone damage · In-game usage examples · Aged temple structure with various damage',
  size: [18, 16],
  camera: { az: -20, el: 14, dist: 16, target: [-0.8, 3.2, -1.5] },
  spawn: { x: 1.5, z: 4.5, yaw: 180 },
  async build(ctx, p) {
    const target: PlaceTarget = { voxels: p.voxels, collider: (c) => p.colliders.push(c), extra: (o) => p.extras.push(o) };
    const base = new Ruin(look);

    // ── The platform: steep tiers of 0.25 m, the stair, the bastion ──
    // Each tier a course running back to the platform's rear, stones up to 1.5 m deep.
    const tiers = (x0: number, x1: number, z: number, set: number, seed: number, stair = false) => {
      for (let k = 0; k < TIERS; k++) {
        const front = z - k * set;
        base.courses(x0, k * RISE, BACK, x1, (k + 1) * RISE, front, { length: stair ? [0.875, 1.625] : [0.5, 1.0], course: RISE, depth: 1.5, axis: 'x', seed: seed + k, look: stair ? tread : undefined });
        p.collider(x0, k * RISE, BACK, x1, (k + 1) * RISE, front);
      }
    };
    tiers(BAST.x0, BAST.x1, BAST.z, BAST.set, 100);
    tiers(BAST.x1, STAIR.x0, TERRACE.z, TERRACE.set, 120);
    tiers(STAIR.x1, 9, TERRACE.z, TERRACE.set, 140);
    // (the steps of long stones, as the sheet's stair)
    tiers(STAIR.x0, STAIR.x1, STAIR.z, STAIR.tread, 160, true);
    // Stones missing from the stair's and the tiers' faces, leaving dark holes into the platform.
    const front = (x: number, k: number) => (x > STAIR.x0 && x < STAIR.x1 ? STAIR.z - k * STAIR.tread : x < BAST.x1 ? BAST.z - k * BAST.set : TERRACE.z - k * TERRACE.set);
    const missing = [
      [0.6, 1.5, 2],
      [-1.9, -1.1, 5],
      [-5.6, -4.9, 3],
      [5.2, 6.1, 4],
    ];
    const face = (x: number, y: number, z: number, [x0, x1, k]: number[], depth: number) => Math.floor(y / RISE) === k && x > x0 && x < x1 && z > front(x, k) - depth;
    base.omit((x, y, z) => missing.some((m) => face(x, y, z, m, 0.8)));
    // Worn: every nosing and tier edge rounded back, deepest where feet and rain wore them.
    const nose = (x: number, y: number, z: number) => {
      const k = Math.floor(y / RISE);
      const depth = front(x, k) - z + ((k + 1) * RISE - y) * 1.4;
      if (depth > 0.3) return true;
      return depth >= (x > STAIR.x0 && x < STAIR.x1 ? 0.12 * (1 - Math.abs(x) / 2.5) : 0.05) + 0.22 * (noise(x, y, z, 0.6, 75) - 0.56);
    };
    base.lay({ wear: (x, y, z) => y > FLOOR - RISE || nose(x, y, z), piece: (_x, y) => ({ surf: stoneSurf({ moss: 0.3 + 0.3 * ramp(1.5, 0, y), stain: 0.4 }) }) });
    // A broken tier corner on the bastion, a step's end broken off.
    base.breakAway({ at: [BAST.x1, 1.5, BAST.z - 5 * BAST.set], reach: [0.7, 0.55], below: 0.75, ledges: 3 }, 81);
    base.breakAway({ at: [STAIR.x1, 1.0, STAIR.z - 3 * STAIR.tread], reach: [0.6, 0.5], below: 0.5, ledges: 2 }, 82);
    base.crack({ on: 'top', from: [-0.4, STAIR.z - 2 * STAIR.tread], to: [0.3, STAIR.z - 2 * STAIR.tread - 0.6], through: [0.5, 0.75], wander: 2 }, 83);
    base.nick(0.4, 84, [-9.2, 0, -3.2], [9.2, FLOOR, BAST.z + 0.1]);
    // The stones at the back of the holes, in shadow.
    base.restyle((x, y, z) => missing.some((m) => face(x, y, z, [m[0] - 0.4, m[1] + 0.4, m[2]], 3.5)), { shade: 0.6, surf: stoneSurf({ stain: 0.4 }) }, hollow);
    base.emit(p, 85);

    // ── The temple: front wall, doorway between pillars, cracked pier, corner tower, upper storey ──
    const temple = new Ruin(look);
    const L = { length: [0.5, 1.0] as [number, number], course: 0.5, axis: 'x' as const };
    // Front wall either side of the door (two skins), and the courses over the door up to the cornice.
    temple.courses(WALL.x0, FLOOR, WALL.back, DOOR.x0, WALL.top, WALL.front, { ...L, seed: 200 });
    temple.courses(DOOR.x1, FLOOR, WALL.back, WALL.x1, WALL.top, WALL.front, { ...L, seed: 201 });
    temple.courses(DOOR.x0, DOOR.top + 0.5, WALL.back, DOOR.x1, WALL.top, WALL.front, { ...L, seed: 202 });
    // The door's own lintel in the wall, and the threshold.
    temple.stone(DOOR.x0 - 0.25, DOOR.top, WALL.back, DOOR.x1 + 0.25, DOOR.top + 0.5, WALL.front);
    // Pillars in front, their capitals, and the great lintel across them.
    PILLARS.forEach(([a, b], n) => {
      temple.courses(a, FLOOR, WALL.front, b, 5.5, WALL.front + 1.0, { length: [0.5, 0.5], course: 0.5, depth: 0.5, axis: 'x', seed: 210 + n });
      temple.stone(a - 0.125, 5.5, WALL.front, b + 0.125, 5.75, WALL.front + 1.125);
    });
    temple.stone(PILLARS[0][0] - 0.125, 5.75, WALL.front, PILLARS[1][1] + 0.125, 6.25, WALL.front + 1.125);
    temple.courses(PILLARS[0][1], 4.75, WALL.front + 0.5, PILLARS[1][0], 5.75, WALL.front + 1.0, { length: [0.5, 1.0], course: 0.5, axis: 'x', seed: 215 });
    // The cracked pier and the pilasters.
    temple.courses(PIER[0], FLOOR, WALL.front, PIER[1], WALL.top, WALL.front + 0.75, { length: [0.5, 0.5], course: 0.5, depth: 0.75, axis: 'x', seed: 220 });
    PILASTERS.forEach(([a, b], n) => temple.courses(a, FLOOR, WALL.front, b, WALL.top, WALL.front + 0.25, { length: [b - a, b - a], course: 0.5, depth: 0.25, axis: 'x', seed: 225 + n }));
    // Cornice: two courses stepping out.
    temple.courses(WALL.x0, WALL.top, WALL.back - 0.125, WALL.x1, WALL.top + 0.25, WALL.front + 0.25, { length: [0.75, 1.25], course: 0.25, depth: 0.75, axis: 'x', seed: 230 });
    temple.courses(WALL.x0, WALL.top + 0.25, WALL.back, WALL.x1, WALL.top + 0.5, WALL.front + 0.125, { length: [0.75, 1.25], course: 0.25, depth: 0.75, axis: 'x', seed: 231 });
    // Corner tower on the bastion: a shell of one skin round a hollow core, its stones a little bigger.
    temple.courses(TOWER.x0, FLOOR, TOWER.z1 - 0.5, TOWER.x1, TOWER.top, TOWER.z1, { length: [0.75, 1.25], course: 0.5, axis: 'x', seed: 240 });
    temple.courses(TOWER.x0, FLOOR, TOWER.z0, TOWER.x0 + 0.5, TOWER.top, TOWER.z1 - 0.5, { length: [0.75, 1.25], course: 0.5, axis: 'z', seed: 241 });
    temple.courses(TOWER.x1 - 0.5, FLOOR, TOWER.z0 + 0.5, TOWER.x1, TOWER.top, TOWER.z1 - 0.5, { length: [0.75, 1.25], course: 0.5, axis: 'z', seed: 242 });
    temple.courses(TOWER.x0 + 0.5, FLOOR, TOWER.z0, TOWER.x1, TOWER.top, TOWER.z0 + 0.5, { length: [0.75, 1.25], course: 0.5, axis: 'x', seed: 243 });
    // Upper storey, set back on the wall.
    temple.courses(WALL.x0, UPPER.y0, UPPER.z0, WALL.x1, UPPER.y1, UPPER.z1, { length: [0.625, 1.25], course: 0.5, axis: 'x', seed: 250 });
    temple.courses(WALL.x0, UPPER.y1, UPPER.z0 - 0.125, WALL.x1, UPPER.y1 + 0.25, UPPER.z1 + 0.125, { length: [0.75, 1.25], course: 0.25, depth: 0.75, axis: 'x', seed: 251 });
    for (let x = WALL.x0 + 1.25; x < WALL.x1 - 0.5; x += 2.5) temple.courses(x, UPPER.y0, UPPER.z1, x + 0.5, UPPER.y1, UPPER.z1 + 0.125, { length: [0.5, 0.5], course: 0.5, depth: 0.125, axis: 'x', seed: 252 + x });

    // Collapse: the tower's top gone in a slope towards the corner; a bay of the upper
    // storey fallen, taking the cornice and the top of the wall below with it.
    const bay = (x: number, y: number) =>
      x > COLLAPSE.x0 &&
      x < COLLAPSE.x1 &&
      y > Math.max(COLLAPSE.bottom + 1.3 * Math.abs(x - COLLAPSE.at), UPPER.y0 + Math.max(0, 1.3 - 0.9 * Math.min(x - COLLAPSE.x0, COLLAPSE.x1 - x))) + (noise(x, y, 0, 0.5, 90) - 0.5) * 0.6;
    const tower = (x: number, y: number, z: number) => x < TOWER.x1 && y > TOWER.top - 2.6 + 1.5 * ramp(TOWER.x0, TOWER.x1, x) + 0.6 * ramp(TOWER.z1, TOWER.z0, z) + (noise(x, y, z, 0.6, 91) - 0.5) * 0.7;
    // Stones gone from the upper storey's face: openings the sky shows through.
    const gaps = [-4.2, -1.6, 0.9].map((x0) => [x0, x0 + 0.8]);
    temple.omit((x, y, z) => bay(x, y) || tower(x, y, z) || (y > UPPER.y0 + 0.4 && y < UPPER.y1 - 0.4 && z < UPPER.z1 && gaps.some(([a, b]) => x > a && x < b)));
    // Round the collapses the stones are broken back in rough steps; the cornice's top edge worn.
    const cornice = envelopeWear([-20, WALL.top, WALL.back - 0.125], [20, WALL.top + 0.5, WALL.front + 0.25], (x, y, z) => 0.3 * (noise(x, y, z, 0.3, 92) - 0.55), { mode: 'top' });
    const broken = (x: number, y: number, z: number) =>
      (x > COLLAPSE.x0 - 0.5 && x < COLLAPSE.x1 + 0.5 && y > COLLAPSE.bottom - 0.6 && bay(x + 0.35 * (noise(x, y, z, 0.3, 93) - 0.3), y + 0.3)) || (x < TOWER.x1 + 0.4 && y > TOWER.top - 3.6 && tower(x + 0.2, y + 0.35, z));
    temple.lay({ wear: (x, y, z) => !broken(x, y, z) && (y < WALL.top || y > WALL.top + 0.5 || cornice(x, y, z)), piece: (_x, y) => ({ surf: stoneSurf({ moss: 0.35 + 0.2 * ramp(6, 9, y), stain: 0.4 }) }) });
    // The pillars' feet and the cracked pier in shadow where they meet the porch; the passage dark.
    temple.restyle((x, y, z) => x > DOOR.x0 - 0.3 && x < DOOR.x1 + 0.3 && y < DOOR.top + 0.5 && z < WALL.front && z > WALL.back - 0.1, { shade: 0.5 });

    // ── Damage carved into the temple ──
    // The long crack down the pier, a branch, and cracks through the lintels.
    temple.crack({ on: 'front', from: [4.95, WALL.top], to: [4.55, 3.2], through: [WALL.front - 0.1, WALL.front + 0.75], wander: 3 }, 101);
    temple.crack({ on: 'front', from: [4.75, 5.0], to: [5.25, 4.1], through: [WALL.front, WALL.front + 0.75], wander: 1 }, 102);
    temple.crack({ on: 'front', from: [0.3, 6.25], to: [0.05, 5.75], through: [WALL.front, WALL.front + 1.125], wander: 1 }, 103);
    temple.crack({ on: 'front', from: [-0.2, DOOR.top + 0.5], to: [0.1, DOOR.top], through: [WALL.back, WALL.front], wander: 1 }, 104);
    temple.crack({ on: 'front', from: [-1.6, 5.0], to: [-1.35, 3.1], through: [WALL.front, WALL.front + 1.0], wander: 2 }, 105);
    // Broken corners: the right pillar's capital, the cornice's end, the wall at the tower.
    temple.breakAway({ at: [PILLARS[1][1] + 0.125, 6.25, WALL.front + 1.125], reach: [0.7, 0.6], below: 0.9, ledges: 3 }, 106);
    temple.breakAway({ at: [WALL.x1, WALL.top + 0.5, WALL.front + 0.25], reach: [1.2, 0.7], below: 1.2, ledges: 3 }, 107);
    temple.breakAway({ at: [PIER[1], WALL.top, WALL.front + 0.75], reach: [0.5, 0.5], below: 0.6, ledges: 2 }, 108);
    temple.nick(0.4, 109, [-9, FLOOR, -5], [9.2, UPPER.y1 + 0.3, WALL.front + 1.2]);
    temple.emit(p, 110);

    // The dark room behind the doorway (seen through it): floor, walls and ceiling in shadow.
    const dark = SANDSTONE.cavity;
    p.voxels.span(DOOR.x0 - 0.6, FLOOR, -7.3, DOOR.x1 + 0.6, FLOOR + 0.02, WALL.back, dark[2], 'sandstone', { surf: stoneSurf({ stain: 0.5 }) });
    p.voxels.span(DOOR.x0 - 0.6, FLOOR, -7.4, DOOR.x1 + 0.6, 5.5, -7.3, dark[0], 'sandstone', { surf: stoneSurf({ stain: 0.4 }) });
    for (const x of [DOOR.x0 - 0.7, DOOR.x1 + 0.6]) p.voxels.span(x, FLOOR, -7.3, x + 0.1, 5.5, WALL.back, dark[1], 'sandstone', { surf: stoneSurf({ stain: 0.4 }) });
    p.voxels.span(DOOR.x0 - 0.6, 5.4, -7.3, DOOR.x1 + 0.6, 5.5, WALL.back, dark[1], 'sandstone', {});
    // The rest of the temple behind (nothing damaged, laid plain): its back and end walls, the tower's rear, the roof.
    const rear = { palette: SANDSTONE.dark, style: () => ({ surf: stoneSurf({ stain: 0.5, moss: 0.2 }) }), length: [0.625, 1.125] as [number, number], y0: FLOOR, courses: Array<number>(9).fill(0.5) };
    plain(p, { ...rear, x0: WALL.x0, x1: WALL.x1, z0: BACK, z1: BACK + 0.5, seed: 260 });
    plain(p, { ...rear, x0: WALL.x1 - 0.5, x1: WALL.x1, z0: BACK + 0.5, z1: WALL.back, skins: 3, length: [0.5, 0.5], seed: 261 });
    plain(p, { ...rear, x0: TOWER.x0, x1: TOWER.x1, z0: BACK + 0.5, z1: TOWER.z0, skins: 2, seed: 262 });
    plain(p, { ...rear, x0: TOWER.x1, x1: WALL.x1, z0: BACK, z1: WALL.back - 0.125, y0: WALL.top, courses: [0.25], length: [1.0, 1.5], seed: 263 });

    // Colliders: the walls, pillars, pier, tower (the doorway and the passage open).
    p.collider(WALL.x0, FLOOR, WALL.back, DOOR.x0, WALL.top + 0.5, WALL.front);
    p.collider(DOOR.x1, FLOOR, WALL.back, COLLAPSE.x0, WALL.top + 0.5, WALL.front);
    p.collider(COLLAPSE.x0, FLOOR, WALL.back, COLLAPSE.x1, COLLAPSE.bottom, WALL.front);
    p.collider(COLLAPSE.x1, FLOOR, WALL.back, WALL.x1, WALL.top + 0.5, WALL.front);
    for (const [a, b] of PILASTERS) p.collider(a, FLOOR, WALL.front, b, WALL.top, WALL.front + 0.25);
    p.collider(DOOR.x0, DOOR.top, WALL.back, DOOR.x1, WALL.top + 0.5, WALL.front);
    for (const [a, b] of PILLARS) p.collider(a, FLOOR, WALL.front, b, 5.75, WALL.front + 1.0);
    p.collider(PIER[0], FLOOR, WALL.front, PIER[1], WALL.top, WALL.front + 0.75);
    p.collider(TOWER.x0, FLOOR, TOWER.z0, TOWER.x1, TOWER.top - 1.5, TOWER.z1);
    p.collider(DOOR.x0 - 0.7, FLOOR, -7.4, DOOR.x1 + 0.7, 5.5, -7.3);
    for (const x of [DOOR.x0 - 0.7, DOOR.x1 + 0.6]) p.collider(x, FLOOR, -7.3, x + 0.1, 5.5, WALL.back);
    p.collider(WALL.x0, FLOOR, BACK, WALL.x1, WALL.top, BACK + 0.5);

    // Moss: on every tread and tier, the ledges of the breaks, the cornice and the tops of the ruins.
    mossLedges(p, base, (x, y) => (x > STAIR.x0 && x < STAIR.x1 ? 0.18 : 0.3) + 0.08 * ramp(-4, -8, x) - 0.12 * ramp(1.2, 1.9, y) * ramp(-2.5, -1.5, x) * ramp(2.5, 1.5, x), 131);
    mossLedges(p, temple, (_x, y) => (y > WALL.top ? 0.45 : 0.28), 132);

    // ── Ground: a paved court at the foot of the stair, soil and grass round it ──
    const court = paving(p, {
      x0: -9,
      x1: 9,
      z0: TERRACE.z,
      z1: 8,
      under: (x, z) => z < (x > STAIR.x0 - 0.1 && x < STAIR.x1 + 0.1 ? STAIR.z : x < BAST.x1 + 0.1 ? BAST.z : TERRACE.z) + 0.02,
      seed: 140,
      look: (x, z) => ({
        color: COURT[Math.floor(hash3(Math.round(x * 4), 1, Math.round(z * 4), 141) * COURT.length)],
        style: { surf: stoneSurf({ lichen: 0.12, stain: 0.2 + 0.2 * noise(x, 0, z, 2, 142), moss: 0.15 }) },
      }),
      gone: (x, z) => hash3(Math.round(x * 2), Math.round(z * 2), 3, 143) < 0.04 + 0.2 * ramp(6, 8, z) + 0.15 * ramp(7, 9, Math.abs(x)),
    });
    soil(p, -9, BACK, 9, TERRACE.z);

    // ── Fallen fragments: at the bastion's foot, on the stair, from the collapsed bay ──
    const rubble = new BlockSet(1 / 16);
    const rock = (x: number, z: number) => finishLook(noise(x, 0, z, 1.2, 150) > 0.5 ? 'weathered' : 'dark', x, 0, z, 151, stoneSurf({ stain: 0.45, moss: 0.35, lichen: 0.12 }));
    const pieces = (list: number[][], tilt = false): Rubble[] => list.map(([x, z, w, h, d, rx = 0, ry = 0, rz = 0]) => ({ x, z, size: [w, h, d], look: rock(x, z), ...(tilt ? { tilt: [rx, ry, rz] } : {}) }));
    heap(
      p,
      rubble,
      [
        // The collapse's stones on the porch below it, spilling down the tiers.
        ...pieces([
          [2.6, -3.0, 0.75, 0.5, 0.5],
          [3.5, -2.9, 1.0, 0.5, 0.5],
          [4.3, -2.2, 0.5, 0.4375, 0.5],
          [3.0, -2.5, 0.625, 0.375, 0.5],
          [3.9, -1.5, 0.5, 0.375, 0.375],
          [3.2, -1.0, 0.375, 0.3125, 0.375],
          [4.8, -0.6, 0.5, 0.3125, 0.5],
          [3.6, 0.2, 0.375, 0.25, 0.375],
        ]),
        ...pieces([[2.9, -1.9, 1.0, 0.5, 0.5, 0.25, 0.3, 0.35], [4.5, 0.6, 0.75, 0.5, 0.5, 0.1, -0.5, 0.08]], true),
        // Step stones pushed out of the stair, lying on the treads below their gaps.
        ...pieces([[1.05, STAIR.z - 1.5 * STAIR.tread, 0.75, 0.25, 0.375, 0.15, 0.4, 0.05], [-1.5, STAIR.z - 4.5 * STAIR.tread, 0.625, 0.25, 0.375, 0.1, -0.3, -0.12]], true),
        // Broken pieces at the foot of the stair and the bastion.
        ...pieces([
          [-3.3, 1.6, 0.75, 0.5, 0.625],
          [-2.6, 2.1, 0.5, 0.375, 0.5],
          [-4.0, 2.3, 0.625, 0.4375, 0.5],
          [-3.5, 2.9, 0.375, 0.25, 0.375],
          [-6.0, 1.4, 0.625, 0.4375, 0.5],
          [-5.2, 1.8, 0.375, 0.3125, 0.375],
          [-7.4, 1.3, 0.5, 0.375, 0.5],
          [1.9, 1.6, 0.375, 0.25, 0.375],
        ]),
        ...pieces([[-4.8, 2.9, 1.0, 0.5, 0.5, 0.05, 0.45, 0.1], [2.6, 2.6, 0.75, 0.5, 0.5, 0, -0.3, 0.06]], true),
      ],
      ground,
      152,
    );
    rubble.emit(p.voxels, { seed: 153, jitter: 0.08 });
    mossLedges(p, rubble, () => 0.35, 154);
    // Kit pieces: a fallen carved lintel, debris, a broken heap by the tiers.
    const lintel = await ctx.get('19.2/collapsed-decorative', { variant: 'fallen', seed: 7 });
    if (lintel) placePiece(target, lintel, { x: 5.6, y: 0, z: 1.3, turn: 3 });
    const debris = await ctx.get('20/stone-fragments', { variant: 'scatter', seed: 4 });
    if (debris) placePiece(target, debris, { x: -5.6, y: 0, z: 4.2 });
    const chunks = await ctx.get('20/stone-fragments', { variant: 'large', seed: 6 });
    if (chunks) placePiece(target, chunks, { x: 7.0, y: 0, z: 3.4, turn: 2 });

    // ── Grass in the joints of the steps and tiers, at their feet, in the court ──
    const r = rng(9);
    const grass: Tuft[] = [];
    // (in the joint where a tread meets the riser above it: at the stair's ends, mostly)
    for (let k = 0; k < TIERS - 1; k++) {
      for (const x of [STAIR.x0 + r.range(0.1, 0.8), STAIR.x1 - r.range(0.1, 0.8)]) if (r.chance(0.45)) grass.push({ x, y: (k + 1) * RISE, z: STAIR.z - k * STAIR.tread - r.range(0.22, 0.3), height: r.int(2, 5), radius: 1 });
      for (let x = BAST.x0 + r.range(0, 1.5); x < BAST.x1; x += r.range(1.5, 3.5)) if (r.chance(0.35)) grass.push({ x, y: (k + 1) * RISE, z: BAST.z - (k + 0.5) * BAST.set, height: r.int(2, 5), radius: 1 });
      for (let x = STAIR.x1 + r.range(0, 1.5); x < 9; x += r.range(1.5, 3.5)) if (r.chance(0.3)) grass.push({ x, y: (k + 1) * RISE, z: TERRACE.z - (k + 0.5) * TERRACE.set, height: r.int(2, 5), radius: 1 });
    }
    for (let x = -8.8; x < 8.8; x += r.range(0.7, 2.2)) grass.push({ x, y: 0, z: (x < BAST.x1 ? BAST.z : x > STAIR.x1 || x < STAIR.x0 ? TERRACE.z : STAIR.z) + r.range(0.05, 0.2), height: r.int(3, 8), radius: r.chance(0.4) ? 1.5 : 1 });
    for (const [x, z] of court.joints) if (r.chance(0.1)) grass.push({ x, y: 0, z, height: r.int(2, 4), radius: 1 });
    for (const [x, z] of court.holes) grass.push({ x, y: -0.25, z, height: r.int(5, 8), radius: 1.5 });
    // Plants on the high ledges: the cornice, the tower's broken top, the pillar capitals.
    for (const [x, y, z] of [
      [1.6, WALL.top + 0.5, WALL.front - 0.2],
      [7.8, WALL.top + 0.5, WALL.front - 0.3],
      [-6.8, 5.0, -2.3],
      [-1.5, 5.75, WALL.front + 0.8],
      [7.9, UPPER.y0, UPPER.z1 + 0.1],
    ])
      grass.push({ x, y, z, height: r.int(4, 7), radius: 1.5 });
    tufts(p, grass, 161);
  },
});

/** The court's slabs: the sheet's sunlit tan, a little greyer than the damaged wall's. */
const COURT = [0xcfa272, 0xc89c6e, 0xd7ab7b, 0xbf9469].map(fromSheet);
