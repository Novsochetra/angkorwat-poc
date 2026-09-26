import { RACE_COURSE } from '../layout';
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
