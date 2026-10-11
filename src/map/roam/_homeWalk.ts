import { HOME, HOME_AT, HOME_DOOR, HOME_T, HOME_Z } from '../hamlet/_homePlan';
import type { RoamWorld } from './types';

/**
 * His stilt house's doorway in the walk map (roam/walkmap.ts): the house is
 * the map's (the hamlet part: hamlet/_home.ts), so its floor, walls, stair
 * and veranda are in the walk map like the village's houses; its doors move
 * (`userData.noWalk`), so the doorway is open there. While they are shut (not
 * his yet, not opened yet, or closed again: roam/_homeDoor.ts) this lays a
 * wall across it over the world's `standAt` (as the zip line lays its
 * platforms, _zipWalk.ts): feet at the floor's height cannot stand in the
 * doorway, his or the dog's (its way-finding asks the same `standAt`:
 * _dogPath.ts). And over `clearance` and `hardClearance`, the shut doors stop
 * the follow camera and the photo's lens as a wall does. Anywhere else, and
 * once the doors are open, every answer is the world's own. (Asked many
 * times a step: nothing allocated.)
 */

/** The wall across the doorway (local x, z; m): the doorway's width and the wall's depth, a little more. */
const HALF = HOME_DOOR.half + 0.1;
const Z0 = HOME_Z.wall - HOME_T - 0.12;
const Z1 = HOME_Z.wall + 0.08;
/** The doors count as open from this far open (`HOME.door`). */
const OPEN_AT = 0.6;
/** The same wall's box for roam/_homeDoor.ts (local m). */
export const DOORWAY = { half: HALF, z0: Z0, z1: Z1 } as const;
/** The house's frame (as _homePlan.ts `homeLocal`). */
const S = Math.sin(HOME_AT.facing);
const C = Math.cos(HOME_AT.facing);
const lxOf = (x: number, z: number) => (x - HOME_AT.x) * C - (z - HOME_AT.z) * S;
const lzOf = (x: number, z: number) => (x - HOME_AT.x) * S + (z - HOME_AT.z) * C;

/** The doors stop things now (shut, or not far enough open). */
export const doorsShut = (): boolean => HOME.door < OPEN_AT;

/**
 * Does a body `r` m round at the map's (x, z) reach into the doorway's wall (as it is laid while the doors are
 * shut)? roam/_homeDoor.ts: the doors are never shut on him or the dog.
 */
export function inDoorway(x: number, z: number, r: number): boolean {
  const lx = lxOf(x, z);
  const lz = lzOf(x, z);
  return lx > -HALF - r && lx < HALF + r && lz > Z0 - r && lz < Z1 + r;
}

export function installHomeWalk(world: RoamWorld, floor: number): void {
  const { standAt, clearance, hardClearance } = world;
  if (standAt)
    world.standAt = (x, z, y, up, h) => {
      if (HOME.door < OPEN_AT && y + up > floor - 0.5 && y < floor + HOME_DOOR.h) {
        const lx = lxOf(x, z);
        const lz = lzOf(x, z);
        if (lx > -HALF && lx < HALF && lz > Z0 && lz < Z1) return NaN;
      }
      return standAt(x, z, y, up, h);
    };
  // (the camera's: the shut doors are a wall to it, as the house's own walls are)
  if (clearance) world.clearance = (ax, ay, az, bx, by, bz) => Math.min(clearance(ax, ay, az, bx, by, bz), HOME.door < OPEN_AT ? slab(ax, ay, az, bx, by, bz, floor) : 1);
  if (hardClearance) world.hardClearance = (ax, ay, az, bx, by, bz) => Math.min(hardClearance(ax, ay, az, bx, by, bz), HOME.door < OPEN_AT ? slab(ax, ay, az, bx, by, bz, floor) : 1);
}

/** What is left of the segment (0‥1) while `slab` narrows it. */
let t0 = 0;
let t1 = 1;

/** The part of a → b before it comes into the doorway's wall (0‥1; 1: it misses it): a box, the slab method in the house's frame. */
function slab(ax: number, ay: number, az: number, bx: number, by: number, bz: number, floor: number): number {
  t0 = 0;
  t1 = 1;
  if (!axis(lzOf(ax, az), lzOf(bx, bz), Z0, Z1) || !axis(lxOf(ax, az), lxOf(bx, bz), -HALF, HALF) || !axis(ay, by, floor, floor + HOME_DOOR.h)) return 1;
  return t0;
}

/** One axis of the box: narrows `t0‥t1` to where p → q is between lo and hi; false once nothing is left. */
function axis(p: number, q: number, lo: number, hi: number): boolean {
  const d = q - p;
  if (Math.abs(d) < 1e-9) return p > lo && p < hi;
  const a = (lo - p) / d;
  const b = (hi - p) / d;
  if (Math.min(a, b) > t0) t0 = Math.min(a, b);
  if (Math.max(a, b) < t1) t1 = Math.max(a, b);
  return t0 <= t1;
}
