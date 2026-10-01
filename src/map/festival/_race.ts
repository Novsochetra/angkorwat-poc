import { LAKES, RACE_COURSE } from '../layout';
import { hash3 } from '../../voxel/random';

/**
 * The racing boat (ngo) race on the great lake (Bon Om Touk), heat after heat by
 * day: four boats (ngo), two to a heat, race side by side from the start
 * out west under the mist to the finish by the village (`RACE_COURSE`),
 * coast past the line, turn north and paddle back easy along the north
 * lanes, turn again and wait at the start for their next heat. The other
 * pair races while one comes back, so the lanes never cross.
 *
 * Each boat runs a loop ("stadium"): race lane `zr` east, a half circle
 * (radius `(zr − zret) / 2`) to its return lane `zret`, west, a half circle
 * back. The inner boat of a pair turns inside the outer one (almost the
 * same centre), so their turns never cross either. A heat's speeds are
 * seeded (`hash3`): one crew pulls ahead, a different one each heat.
 */

/** Seconds from one heat of a pair to its next (the two pairs race half a round apart). */
export const HEAT_ROUND = 240;
/** Start and finish (x, m) and the lane line (z). */
const X_START = RACE_COURSE.from[0];
const X_FINISH = RACE_COURSE.to[0];
/** Past the line before the turn (m). */
const COAST = 8;
/** Race lanes (z) and return lanes, inner boat then outer. */
const LANES: [number, number][] = [
  [8, -6],
  [18, -14],
];
/** Waiting at the start before the gun (s), and the pull away to full speed (s). */
const READY = 6;
const ACCEL = 4;
/** Paddling back (m/s). */
const V_BACK = 2.3;

export interface BoatPose {
  x: number;
  z: number;
  /** Heading (0 = +z, turning to +x). */
  yaw: number;
  /** How hard the crew rows: 0 resting … 1 racing (eased on the way). */
  row: number;
  /** Speed (m/s), for the bow wave. */
  speed: number;
  /** Racing now (between the gun and the line). */
  racing: boolean;
  /** Metres to the finish while racing (else 0). */
  toGo: number;
}

/** A boat on its loop: which pair (0, 1), inner (0) or outer (1). */
interface Loop {
  pair: number;
  lane: number;
  zr: number;
  zret: number;
  r: number;
}

export const BOATS: readonly Loop[] = [0, 1, 2, 3].map((k) => {
  const [zr, zret] = LANES[k & 1];
  return { pair: k >> 1, lane: k & 1, zr, zret, r: (zr - zret) / 2 };
});

/** The heat's top speed of boat `k` (m/s): calm enough to watch, one crew a little quicker. */
function vRace(k: number, heat: number): number {
  return 3.15 + 0.35 * hash3(heat, k, 7, 911);
}

/** Where boat `k` is at time `t` (s) of the day's racing. */
export function boatAt(k: number, t: number, out: BoatPose): BoatPose {
  const b = BOATS[k];
  const local = t - (b.pair * HEAT_ROUND) / 2;
  const heat = Math.floor(local / HEAT_ROUND);
  let tau = local - heat * HEAT_ROUND;
  const v = vRace(k, heat);
  out.racing = false;
  out.toGo = 0;
  // Ready at the start.
  if (tau < READY) return set(out, X_START, b.zr, Math.PI / 2, 0.15, 0);
  tau -= READY;
  // The race: away to full speed, then on to the line.
  const length = X_FINISH - X_START;
  const tRace = length / v + ACCEL / 2;
  if (tau < tRace) {
    const s = tau < ACCEL ? (0.5 * v * tau * tau) / ACCEL : 0.5 * v * ACCEL + v * (tau - ACCEL);
    out.racing = true;
    out.toGo = length - s;
    return set(out, X_START + s, b.zr, Math.PI / 2, 1, tau < ACCEL ? (v * tau) / ACCEL : v);
  }
  tau -= tRace;
  // Coasting past the line, slowing to the easy pace.
  const tCoast = (2 * COAST) / (v + V_BACK);
  if (tau < tCoast) {
    const a = (v - V_BACK) / tCoast;
    return set(out, X_FINISH + v * tau - 0.5 * a * tau * tau, b.zr, Math.PI / 2, 0.5, v - a * tau);
  }
  tau -= tCoast;
  // Easy: the turn north, back west, the turn south, and in to the start (slowing to a stop).
  const xe = X_FINISH + COAST;
  const xw = X_START - COAST;
  const arc = Math.PI * b.r;
  const back = xe - xw;
  let s = tau * V_BACK;
  const cz = b.zr - b.r;
  if (s < arc) {
    const th = s / b.r;
    return set(out, xe + b.r * Math.sin(th), cz + b.r * Math.cos(th), Math.PI / 2 + th, 0.5, V_BACK);
  }
  s -= arc;
  if (s < back) return set(out, xe - s, b.zret, -Math.PI / 2, 0.5, V_BACK);
  s -= back;
  if (s < arc) {
    const th = Math.PI + s / b.r;
    return set(out, xw + b.r * Math.sin(th), cz + b.r * Math.cos(th), Math.PI / 2 + th, 0.5, V_BACK);
  }
  s -= arc;
  // In to the line: slowing over COAST metres.
  const tIn = (2 * COAST) / V_BACK;
  const ti = s / V_BACK;
  if (ti < tIn) {
    const a = V_BACK / tIn;
    return set(out, xw + V_BACK * ti - 0.5 * a * ti * ti, b.zr, Math.PI / 2, 0.35 * (1 - ti / tIn), V_BACK - a * ti);
  }
  // Resting at the start, waiting for the next heat.
  return set(out, X_START, b.zr, Math.PI / 2, 0, 0);
}

function set(o: BoatPose, x: number, z: number, yaw: number, row: number, speed: number): BoatPose {
  o.x = x;
  o.z = z;
  o.yaw = yaw;
  o.row = row;
  o.speed = speed;
  return o;
}

/** Where the boats lie at night: moored side by side off the village beach, bows out to the lake (x, z, yaw). */
export const MOORINGS: [number, number, number][] = [
  [-316, -3, -Math.PI / 2 - 0.08],
  [-317, 3.5, -Math.PI / 2 + 0.04],
  [-316, 10, -Math.PI / 2 - 0.03],
  [-317, 16.5, -Math.PI / 2 + 0.06],
];

// ── The challenge: the player's own race (roam/_raceRow.ts) ─────────────────
//
// Two more ngo wait by the north shore, west of the village beach, at a small
// landing with a gangway down to the inshore boat, a few people and the
// officials' boat at the finish. On foot at the gangway (by day, the Water
// Festival on), E "Join a racing boat": he takes the free place behind the last
// pair of rowers and the two boats race east from the start line out west to
// the finish by the landing, in lanes of their own north of the four crews' way
// back (z −6, −14), so the heats above go on as before. The add-on holds the
// boats while he is in one (`CHALLENGE.active`), writing where they are each
// step; the festival part (_water.ts) draws them there, and at their moorings
// when he is not. No three.js here.

/** The two challenge boats' paint and shirts (his, then the rival's): purple and gold, teal; apart from the four crews' red, green, blue and yellow. */
export const CH_CREWS = [
  { hull: 0x6a2a86, band: 0xe8b84a, dots: 0xf4f0e6, line: 0xe8b84a, shirt: 0x8a46b2 },
  { hull: 0x14807a, band: 0xf0c850, dots: 0xf4f0e6, line: 0xb8262a, shirt: 0x22a39a },
];
/** The great lake's water (m): the boats float on it (as village/_spots.ts `LAKE_LEVEL`). */
const LAKE_Y = LAKES[0].level;
/** Their lanes (z), his inshore (north), heading east (+x). */
export const CH_LANES = [-28.5, -21.5] as const;
/** The start line (x: out west, past the roaming area's edge at −450) and the finish by the landing (x); the course (m). */
export const CH_START = -478;
export const CH_FINISH = -375;
export const CH_LENGTH = CH_FINISH - CH_START;
/** Heading of the race (east). */
export const CH_YAW = Math.PI / 2;
/** Where the two boats wait (x, z, yaw): in line along the north shore, bows east, his nearest the landing. */
export const CH_MOOR: readonly (readonly [number, number, number])[] = [
  [-389, -40.5, Math.PI / 2],
  [-414.5, -39, Math.PI / 2],
];
/** His place in his boat (boat space, m: +z ahead, +x port): the top of a thwart of his own behind the last pair, on the port side (his paddle on the shore's side). */
export const CH_SEAT = { x: 0.42, y: 0.47, z: -7.1 } as const;
/**
 * The landing's gangway: a plank from the shore (its foot, on the grass 1 m over the lake) down onto his boat's
 * port gunwale beside his place (its head), as the boat lies at its mooring (world m); its width.
 */
export const CH_GANGWAY = { foot: [-396.1, 6.02, -45.4], head: [-396.1, 5.66, -41.5], width: 0.62 } as const;
/** The officials' boat at the finish, north of his lane (x, z): anchored along the course. */
export const CH_JUDGES: readonly [number, number] = [-375, -33.6];
/** The finish's and the start's buoys across the lanes (z). */
export const CH_BUOYS_Z: readonly number[] = [-31.6, -25, -18.4];
/** The landing's people on the shore (x, z, facing yaw): they watch the finish. */
export const CH_WATCHERS: readonly (readonly [number, number, number])[] = [
  [-387.5, -45.6, -2.7],
  [-384.6, -44.4, -2.6],
  [-381.4, -42.9, -2.5],
  [-378.6, -42.2, -2.3],
  [-375.6, -41.6, -2.2],
  [-372.4, -40.6, -2.1],
  [-369.6, -39.8, -2.0],
];

/** A boat in the challenge, as the add-on writes it while it holds them (world m, radians). */
export interface ChallengeBoat {
  x: number;
  /** The water line's height under the boat's middle (with its bob). */
  y: number;
  z: number;
  /** Heading (0 = +z, turning to +x), pitch (+ bow down) and roll (+ port up). */
  yaw: number;
  pitch: number;
  roll: number;
  /** Speed (m/s): the foam at the bow and along the sides. */
  speed: number;
  /** The crew's stroke clock (strokes since anything: a catch on every whole number). */
  stroke: number;
  /** How hard the crew rows (0 resting … 1 racing). */
  row: number;
  /** After the race: 1 the crew won (arms up), −1 it lost (paddles across, heads down); 0 rowing or waiting. */
  mood: number;
}

const boat = (k: number): ChallengeBoat => ({ x: CH_MOOR[k][0], y: LAKE_Y, z: CH_MOOR[k][1], yaw: CH_MOOR[k][2], pitch: 0, roll: 0, speed: 0, stroke: 0, row: 0, mood: 0 });

/** What the add-on tells the festival part (and its sound) about the challenge, every step. */
export const CHALLENGE = {
  /** The add-on holds the boats (he is boarding, at the start, racing, at the result): they are where `boats` says. */
  active: false,
  /** He sits in boat 0 (his place is his). */
  aboard: false,
  boats: [boat(0), boat(1)] as ChallengeBoat[],
  /** The landing's people and the officials: how much they cheer (0‥1), and the officials' flag raised (0‥1). */
  cheer: 0,
  flag: 0,
};

/**
 * A point in boat space (m: +x port, +y up, +z ahead) → world, for a boat at (x, y, z) turned as the festival's kit
 * turns it (`Euler(pitch, yaw, roll, 'YXZ')`).
 */
export function boatToWorld(b: Pick<ChallengeBoat, 'x' | 'y' | 'z' | 'yaw' | 'pitch' | 'roll'>, lx: number, ly: number, lz: number, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const cr = Math.cos(b.roll);
  const sr = Math.sin(b.roll);
  const x1 = lx * cr - ly * sr;
  const y1 = lx * sr + ly * cr;
  const cp = Math.cos(b.pitch);
  const sp = Math.sin(b.pitch);
  const y2 = y1 * cp - lz * sp;
  const z2 = y1 * sp + lz * cp;
  const cy = Math.cos(b.yaw);
  const sy = Math.sin(b.yaw);
  out.x = b.x + x1 * cy + z2 * sy;
  out.y = b.y + y2;
  out.z = b.z - x1 * sy + z2 * cy;
  return out;
}

/** Boat `k` of the challenge waiting at its mooring at time `t` (s, the festival's clock), rocking a little: written to `out` (speed, stroke, row and mood left as they are). */
export function chMoored(k: number, t: number, out: ChallengeBoat): ChallengeBoat {
  const [x, z, yaw] = CH_MOOR[k];
  out.x = x;
  out.y = LAKE_Y + Math.sin(t * 0.9 + k * 1.3) * 0.025;
  out.z = z;
  out.yaw = yaw;
  out.pitch = 0.01 * Math.sin(t * 0.8 + k * 2.3);
  out.roll = 0.012 * Math.sin(t * 0.6 + k);
  return out;
}
