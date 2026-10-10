import type { RoamWorld } from './types';

/**
 * Where he can reach water to fill something from (the watering can: _gardenSpots.ts `fillSpot`; the shoulder pole's
 * buckets: _carryPoleSpots.ts): one rule for both, so the can and the buckets can never differ.
 *
 * Open water (no deck, jetty or bank over it) up to 1.6 m before him, straight on or a little to either side (the first
 * found); within `REACH_DROP` under his feet he dips (squatting at a low edge, the washing steps; or wading in the
 * shallows: before him), deeper — to `ROPE_DROP`: the Kulen stream's metre-high banks, the village bridge (5.35 m), the
 * jetty — he lowers it on a cord. Higher than `WALL` over his feet between him and the water is a wall (not this way);
 * a bridge's rail is not. He stands at `edgeBefore`: the last spot at his own level on the way to it.
 */

/** Reached by hand this far under his feet (m); on a cord this far. */
export const REACH_DROP = 0.45;
export const ROPE_DROP = 6;
/** How far before him he looks for water (m: each step), and the ways round his facing (radians: straight on first). */
const AHEAD = [0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6] as const;
const AROUND = [0, 0.35, -0.35, 0.7, -0.7] as const;
/** Wading: not deeper than this over his feet (m). */
const WADE = 0.6;
/** Higher than this over his feet between him and the water (m), it is a wall, not a rail he leans over. */
const WALL = 1.3;

/** Water he can fill from: `dip` (by hand: a low edge, wading) or `rope` (lowered on a cord: a high bank, a bridge, a jetty). */
export interface WaterSpot {
  how: 'dip' | 'rope';
  x: number;
  y: number;
  z: number;
}

/** The water he would fill from where he stands, facing `yaw` (into `out`), or false. No allocation. */
export function waterAhead(world: RoamWorld, x: number, y: number, z: number, yaw: number, out: WaterSpot): boolean {
  const here = world.waterAt(x, z);
  if (here !== null && here > y - 0.05) {
    if (here - y > WADE) return false;
    out.how = 'dip';
    out.x = x + Math.sin(yaw) * AHEAD[1];
    out.y = here;
    out.z = z + Math.cos(yaw) * AHEAD[1];
    return true;
  }
  for (const a of AROUND) {
    const fx = Math.sin(yaw + a);
    const fz = Math.cos(yaw + a);
    for (const d of AHEAD) {
      const px = x + fx * d;
      const pz = z + fz * d;
      const w = world.waterAt(px, pz);
      if (w === null) continue;
      // (a deck, a jetty or the bank over it: not open water yet; a wall in the way: not this way)
      const top = world.groundAt(px, pz);
      if (Number.isFinite(top) && top > y + WALL) break;
      if (Number.isFinite(top) && top > w + 0.05) continue;
      const drop = y - w;
      if (drop < -0.2 || drop > ROPE_DROP) break;
      out.how = drop <= REACH_DROP ? 'dip' : 'rope';
      out.x = px;
      out.y = w;
      out.z = pz;
      return true;
    }
  }
  return false;
}

/**
 * Where he stands to reach `target` from (x, y, z) (into `out`, y his floor): the last spot at his own level on the
 * way, at most `d` m before the water (a bank's edge; a bridge's deck before its rail).
 */
export function edgeBefore(world: RoamWorld, x: number, y: number, z: number, target: { x: number; z: number }, d: number, out: { x: number; y: number; z: number }): void {
  const dx = target.x - x;
  const dz = target.z - z;
  const len = Math.hypot(dx, dz) || 1;
  out.x = x;
  out.y = y;
  out.z = z;
  for (let s = 0.1; s <= len - d + 1e-6; s += 0.1) {
    const px = x + (dx / len) * s;
    const pz = z + (dz / len) * s;
    const g = world.groundAt(px, pz);
    if (!Number.isFinite(g) || Math.abs(g - y) > 0.3) break;
    out.x = px;
    out.y = g;
    out.z = pz;
  }
}
