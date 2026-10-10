import { KINDS } from '../garden/kinds';
import { GARDEN, thirsty, type Plant } from '../garden/state';
import { homeStilts, homeToWorld } from '../hamlet/_homePlan';
import { jarAt, JAR_RIM, reachOf } from './_gardenSpots';
import type { RoamWorld } from './types';

/**
 * Where the shoulder pole's work is (roam/_carryPole.ts), with no three.js:
 *
 * - **its place** at his house: leaning on the front stilt by the stair, on its
 *   west side (the yard's jar a few steps on; the gift basket is up on the veranda,
 *   the grandmother's mat further west): `restAt`;
 * - **water he can reach** with the buckets: any open water up to 1.6 m before him,
 *   dipped from a low edge or the shallows, or lowered on the buckets' ropes from a
 *   high bank, a bridge or the jetty (roam/_waterReach.ts `waterAhead`). Anywhere on the map;
 * - **his jar** (the yard's, at the stair's foot: _gardenSpots.ts `jarAt`);
 * - **a thirsty plant** of his home garden within reach (as the can's: `reachOf`).
 */

/** The pole's place: its foot on the ground beside the stilt (house-local m), the stilt it leans on (local). */
export function restAt(): { x: number; z: number; yaw: number; stilt: [number, number] } {
  const { xs, zs } = homeStilts();
  const sx = xs[xs.length - 1];
  const sz = zs[zs.length - 1];
  // (its foot a little out to the west of the stilt; it leans in, along the house's front: local −z)
  const [x, z] = homeToWorld(sx + 0.62, sz - 0.05);
  const stilt = homeToWorld(sx, sz);
  // (its frame's +z from the foot to the stilt it leans on)
  return { x, z, yaw: Math.atan2(stilt[0] - x, stilt[1] - z), stilt };
}

/** Near enough the pole's place (or where he set it down) to take it up (m from its foot). */
export const TAKE_REACH = 1.7;

/** Near enough his yard's jar to pour the buckets into it (m from its middle). */
const JAR_REACH = 2.0;

/** By his jar (feet at x, z): its middle and its rim's height (into `out`), or false. */
export function jarNear(world: RoamWorld, x: number, z: number, out: { x: number; y: number; z: number }): boolean {
  const [jx, jz] = jarAt();
  if (Math.hypot(x - jx, z - jz) > JAR_REACH) return false;
  out.x = jx;
  out.z = jz;
  out.y = world.field.heightAt(jx, jz) + JAR_RIM;
  return true;
}

/** The thirsty plant of his home garden nearest him within its reach (the one the dipper would water), or null. */
export function thirstyNear(x: number, z: number): Plant | null {
  let best: Plant | null = null;
  let bd = Infinity;
  for (const p of GARDEN.plants) {
    if (p.at !== 'home' || !thirsty(p) || !KINDS[p.kind]) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d > reachOf(p) || d >= bd) continue;
    best = p;
    bd = d;
  }
  return best;
}
