import { HOME, HOME_DOOR, HOME_T, HOME_Z, homeLocal } from '../hamlet/_homePlan';
import type { RoamWorld } from './types';

/**
 * His stilt house's doorway in the walk map (roam/walkmap.ts): the house is
 * the map's (the hamlet part: hamlet/_home.ts), so its floor, walls, stair
 * and veranda are in the walk map like the village's houses; its doors move
 * (`userData.noWalk`), so the doorway is open there. While they are shut (not
 * his yet, or not opened yet) this lays a wall across it over the world's
 * `standAt` (as the zip line lays its platforms, _zipWalk.ts): feet at the
 * floor's height cannot stand in the doorway. Anywhere else, and once the
 * doors are open, every answer is the world's own.
 */

/** The wall across the doorway (local x, z; m): the doorway's width and the wall's depth, a little more. */
const HALF = HOME_DOOR.half + 0.1;
const Z0 = HOME_Z.wall - HOME_T - 0.12;
const Z1 = HOME_Z.wall + 0.08;
/** The doors count as open from this far open (`HOME.door`). */
const OPEN_AT = 0.6;

export function installHomeWalk(world: RoamWorld, floor: number): void {
  const { standAt } = world;
  if (!standAt) return;
  world.standAt = (x, z, y, up, h) => {
    if (HOME.door < OPEN_AT && y + up > floor - 0.5 && y < floor + HOME_DOOR.h) {
      const [lx, lz] = homeLocal(x, z);
      if (lx > -HALF && lx < HALF && lz > Z0 && lz < Z1) return NaN;
    }
    return standAt(x, z, y, up, h);
  };
}
