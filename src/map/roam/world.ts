import type { HeightField } from '../heightfield';
import { PLACES, type PlaceDef } from '../layout';
// (the land is closed off round this box: the map less its sinking side and back edges)
import { ROAM_AREA } from '../terrain/views';
import type { MapPart } from '../types';
import { buildFlow, riverField } from './flow';
import type { RoamWorld } from './types';
import { WalkMap } from './walkmap';
import { buildWoodFloor } from './_woodFloor';

/** How close to a place's beacon the explorer must be to enter it (m, across and up or down). */
const ENTER_REACH = 16;
const ENTER_RISE = 10;

/**
 * The world as the roaming modes see it: what is solid (the walk map:
 * land, temples, the road with its stairs and bridges, tree trunks), what
 * the follow camera sees through and not (two more walk maps: leaves and
 * bark, the rest), water, river current, the roaming area and the places'
 * entrances.
 */
export function buildRoamWorld(field: HeightField, parts: readonly MapPart[]): RoamWorld {
  const flow = buildFlow(field);
  const river = riverField(field);
  const walk = new WalkMap(field, parts);
  const hard = new WalkMap(field, parts, 'hard');
  const soft = new WalkMap(field, parts, 'soft');
  const wood = buildWoodFloor(parts);
  const ms = (m: WalkMap) => `${m.stats.blocks} blocks in ${m.stats.ms} ms`;
  console.info(`[map] roam walk map: ${ms(walk)} · the camera's: hard ${ms(hard)}, soft ${ms(soft)} · planks: ${wood.columns} columns`);
  const a = ROAM_AREA;
  return {
    field,
    groundAt: (x, z) => walk.topAt(x, z),
    // (the water as drawn: the height field's cells run past the cliff lips)
    waterAt: (x, z) => river.levelAt(x, z),
    flowAt: (x, z, out) => flow(x, z, out),
    inBounds: (x, z) => x > a.x0 && x < a.x1 && z > a.z0 && z < a.z1,
    edgeDistance: (x, z) => Math.min(x - a.x0, a.x1 - x, z - a.z0, a.z1 - z),
    standAt: (x, z, y, up, height) => walk.standAt(x, z, y, up, height),
    woodAt: (x, z, y) => wood.at(x, z, y),
    ceilingAt: (x, z, y) => walk.ceilingAt(x, z, y),
    clearance: (ax, ay, az, bx, by, bz) => walk.clearance(ax, ay, az, bx, by, bz),
    hardClearance: (ax, ay, az, bx, by, bz) => hard.clearance(ax, ay, az, bx, by, bz),
    hardStandAt: (x, z, y, up, height) => hard.standAt(x, z, y, up, height),
    softClearance: (ax, ay, az, bx, by, bz, leave) => soft.clearance(ax, ay, az, bx, by, bz, leave),
    placeNear(x, z, y): PlaceDef | null {
      let best: PlaceDef | null = null;
      let bestD = ENTER_REACH;
      for (const p of PLACES) {
        // (not from the foot of the place's cliff, or from above)
        if (y !== undefined && Math.abs(p.anchor[1] - y) > ENTER_RISE) continue;
        const d = Math.hypot(p.anchor[0] - x, p.anchor[2] - z);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      return best;
    },
  };
}
