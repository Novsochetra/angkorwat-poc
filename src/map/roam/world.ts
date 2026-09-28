import type { HeightField } from '../heightfield';
import { PLACES, type PlaceDef } from '../layout';
// (the land is closed off round the roaming area: the map less its sinking side and back edges)
import { inRoam, roamInside } from '../terrain/views';
import type { MapPart } from '../types';
import { buildFlow, riverField } from './flow';
import type { RoamWorld } from './types';
import { WalkMap } from './walkmap';
import { buildWoodFloor } from './_woodFloor';

/** How close to a place's beacon the explorer must be to enter it (m, across and up or down). */
const ENTER_REACH = 16;
const ENTER_RISE = 10;

/** The roaming world, and the making of what it holds that can wait (see `buildRoamWorld`). */
export interface RoamWorldMaker {
  readonly world: RoamWorld;
  /** Everything is made. */
  readonly ready: boolean;
  /** Make more of it, for about `ms` milliseconds (idle time, or `hurried`: the "Jump in" card is open); true once all is. */
  step(ms: number, hurried?: boolean): boolean;
  /** Make the rest now. */
  finish(): void;
}

/**
 * The world as the roaming modes see it: what is solid (the walk map:
 * land, temples, the road with its stairs and bridges, tree trunks), what
 * the follow camera sees through and not (two more walk maps: leaves and
 * bark, the rest), water, river current, the roaming area and the places'
 * entrances.
 *
 * The walk map is made now: the take-off ramps and the balloon's field are
 * put on it as the map is built (launchSpots.ts, balloon.ts), and the
 * overview shows them. With `later`, the follow camera's two walk maps and
 * the planks underfoot (_woodFloor.ts) only note their meshes now (as they
 * are: a part may draw fewer of its blocks later), and the rivers' current
 * and bank distances wait too (flow.ts: the boat's landing asks for a few
 * tiles as the map is built); `step` makes them in idle time (roam.ts:
 * after Start, and at once when the "Jump in" card opens); a question
 * before that makes what it needs at once. Either way they hold the same.
 */
export function buildRoamWorld(field: HeightField, parts: readonly MapPart[], later = false): RoamWorldMaker {
  const t0 = performance.now();
  const river = riverField(field);
  const flow = buildFlow(field);
  const level = performance.now() - t0;
  const walk = new WalkMap(field, parts);
  const t1 = performance.now();
  const hard = new WalkMap(field, parts, 'hard', later);
  const soft = new WalkMap(field, parts, 'soft', later);
  const wood = buildWoodFloor(parts, later);
  // (made with the map, as before: headless shots, a page that starts roaming)
  if (!later) river.step(Infinity);
  const ms = (m: WalkMap) => `${m.stats.blocks} blocks in ${m.stats.ms} ms`;
  const rivers = () => `the rivers' current and ${river.stats.tiles} of ${river.stats.of} bank tiles (${river.stats.wetTiles} with water) in ${river.stats.ms} ms`;
  const made = () => `the camera's: hard ${ms(hard)}, soft ${ms(soft)} · planks: ${wood.columns} columns in ${wood.ms} ms · ${rivers()}`;
  const head = `[map] roam walk map: ${ms(walk)} · rivers set up in ${level.toFixed(0)} ms`;
  const total = `the roaming world built in ${(performance.now() - t0).toFixed(0)} ms`;
  console.info(later ? `${head} · made later: the camera's walk maps, the planks, the rivers' current and banks (noted in ${(performance.now() - t1).toFixed(0)} ms) · ${total}` : `${head} · ${made()} · ${total}`);
  /** When the making began (ms), in how many slices, the longest (ms), and whether some were hurried. */
  let first = 0;
  let slices = 0;
  let longest = 0;
  let hurry = false;
  let ready = !later;
  const done = (how: string) => {
    ready = true;
    console.info(`[map] roam walk maps made ${how}: ${made()}${slices ? ` · ${slices} slices (up to ${longest.toFixed(1)} ms) over ${((performance.now() - first) / 1000).toFixed(1)} s` : ''} · chunks built so far: walk ${walk.stats.chunks}, hard ${hard.stats.chunks}, soft ${soft.stats.chunks}`);
  };
  const world: RoamWorld = {
    field,
    groundAt: (x, z) => walk.topAt(x, z),
    // (the water as drawn: the height field's cells run past the cliff lips)
    waterAt: (x, z) => river.levelAt(x, z),
    flowAt: (x, z, out) => flow(x, z, out),
    inBounds: inRoam,
    edgeDistance: (x, z) => roamInside(x, z),
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
  return {
    world,
    get ready() {
      // (a question made the rest at once)
      if (!ready && hard.ready && soft.ready && wood.ready && river.ready) done('at the first question');
      return ready;
    },
    step(budget, hurried = false) {
      if (this.ready) return true;
      const t1 = performance.now();
      if (!slices++) first = t1;
      hurry ||= hurried;
      const until = t1 + budget;
      let all = true;
      for (const m of [hard, soft, wood, river]) if (!m.ready && (performance.now() >= until || !m.step(until - performance.now()))) all = false;
      longest = Math.max(longest, performance.now() - t1);
      if (all) done(hurry ? 'in slices, hurried (the "Jump in" card opened)' : 'in idle time');
      return all;
    },
    finish() {
      if (this.ready) return;
      hard.finish();
      soft.finish();
      wood.step(Infinity);
      river.step(Infinity);
      done('at once');
    },
  };
}
