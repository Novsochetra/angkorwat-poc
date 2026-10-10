import { SURFACE } from '../heightfield';
import { EV_HOMES } from '../hamlet/_evSpots';
import { HOME, HOME_AT, HOME_DOG, HOME_GRAN, HOME_SIZE, HOME_STAIR, HOME_STAIR_FOOT, HOME_Z, homeHammock, homeLocal, homeToWorld } from '../hamlet/_homePlan';
import { isTree, KINDS, trunkAt, stageOf, type PlantKindId } from '../garden/kinds';
import { GARDEN, type Plant } from '../garden/state';
import type { WordKey } from '../ui/lang';
import type { RoamWorld } from './types';

/**
 * Where he may plant in his home garden (the add-on `garden`: roam/_garden.ts),
 * and where he fills his watering can. No three.js: plain rules over the land
 * (the height field: water, the road's surface, the jungle trails), the walk
 * map (what stands on the land) and the house's own plan (hamlet/_homePlan.ts).
 *
 * `canPlant(world, kind, x, z)` is `null` when the kind can go there, else the
 * reason (`SpotReason`, its words `REASON_WORDS`), checked in this order:
 * - `far`: more than `AREA` m from the house's middle, or out of the roaming area;
 * - `full`: 40 crops or 12 trees near the house already (garden/state.ts `roomFor`);
 * - `water`: in the Kulen stream, on its sandy bank, or within `WATER_MARGIN` m of
 *   water (the plant's room and a margin);
 * - `path`: on the road or a path's surface, on a jungle trail's tread or the band
 *   beside it (the Kulen foot trail runs 12 m west of the house);
 * - `house`: the house and the ground under it (the hammock, the jars, the
 *   woodpile), its stair and the stair's foot, the jar where he washes his feet
 *   (and fills his can), the dog's bed, the spirit house, the bougainvillea, the
 *   grandmother's places (her sweeping round, her mat and lamp);
 * - `yard`: someone else's house or yard (the sugar-palm village's houses,
 *   `EV_HOMES`, and whatever the village built on: the land's `occupied` cells
 *   outside his own yard);
 * - `level`: the plant's room is not all on one level of the land (it is built of
 *   big blocks: a step through the bed would leave it hanging);
 * - `room`: nearer another plant than the larger of their rooms (`KINDS[k].room`);
 * - `thing`: something built stands there (the walk map's top over the land);
 * - `pagoda`: the bodhi is planted at the village pagoda, not at home.
 */

/** He gardens within this far of the house's middle (m). */
export const AREA = 40;
/** The ring and the E row look this far (m: a margin round `AREA` so the ring says "too far" at its edge). */
export const AREA_SEEN = AREA + 6;
/** Free of water this far round the plant's room (m). */
const WATER_MARGIN = 1.2;
/** Things standing taller than this over the land are in the way (m). */
const THING = 0.3;
/** The plant goes this far in front of his feet (m, at his size on the map): where the hoe bites. */
export const PLANT_AHEAD = 1.0;

export type SpotReason = 'far' | 'full' | 'water' | 'path' | 'house' | 'yard' | 'level' | 'room' | 'thing' | 'pagoda';

export const REASON_WORDS: Record<SpotReason, WordKey> = {
  far: 'gardenNoFar',
  full: 'gardenNoFull',
  water: 'gardenNoWater',
  path: 'gardenNoPath',
  house: 'gardenNoHouse',
  yard: 'gardenNoYard',
  level: 'gardenNoLevel',
  room: 'gardenNoRoom',
  thing: 'gardenNoThing',
  pagoda: 'gardenNoPagoda',
};

/** Round the house (local m): boxes [x0, z0, x1, z1] and circles [x, z, r] kept clear. */
const KEEP_BOX: readonly (readonly [number, number, number, number])[] = (() => {
  const w = HOME_SIZE.w / 2;
  const s0 = HOME_STAIR.x - HOME_STAIR.width / 2;
  const s1 = HOME_STAIR.x + HOME_STAIR.width / 2;
  return [
    // the house, under it and its eaves (the roof reaches past the walls)
    [-w - 0.9, HOME_Z.back - 0.9, w + 0.9, HOME_Z.front + 0.6],
    // the stair, and room to come down it and walk off
    [s0 - 0.6, HOME_Z.front, s1 + 0.6, HOME_STAIR_FOOT + 1.4],
  ];
})();
const KEEP_RING: readonly (readonly [number, number, number])[] = (() => {
  const s1 = HOME_STAIR.x + HOME_STAIR.width / 2;
  const hm = homeHammock();
  return [
    // the jar at the stair's foot (he fills his can there: room round it)
    [s1 + 0.75, HOME_STAIR_FOOT - 1.0, 1.5],
    // the dog's bed
    [HOME_DOG.x, HOME_DOG.z, 1.0],
    // the spirit house, a pot plant, the bougainvillea (hamlet/_home.ts "The yard")
    [-2.9, HOME_STAIR_FOOT + 1.5, 1.4],
    [HOME_STAIR.x - HOME_STAIR.width / 2 - 1.2, HOME_STAIR_FOOT - 0.3, 0.6],
    [-HOME_SIZE.w / 2 - 1.1, HOME_Z.front + 1.2, 1.2],
    // the grandmother's sweeping round, her mat, her lamp
    [HOME_GRAN.sweep.x, HOME_GRAN.sweep.z, HOME_GRAN.sweep.r + 0.6],
    [HOME_GRAN.sit.x, HOME_GRAN.sit.z, 1.1],
    [HOME_GRAN.lamp.x, HOME_GRAN.lamp.z, 0.6],
    // the hammock's bay (under the floor: the house's box has it; its ropes reach out a little)
    [(hm.x0 + hm.x1) / 2, hm.z, 1.2],
  ];
})();
/** His own yard (local): the land's `occupied` cells in it are the house's, not a neighbour's (hamlet/_home.ts `field.occupy`). */
const OWN_YARD = { x0: -HOME_SIZE.w / 2 - 2.2 - 2, x1: HOME_SIZE.w / 2 + 4.6 + 2, z0: HOME_Z.back - 1.6 - 2, z1: HOME_STAIR_FOOT + 4.6 + 2 };

/** By the house (local x, z: a box or a circle, grown by `r`). */
function atHouse(lx: number, lz: number, r: number): boolean {
  for (const [x0, z0, x1, z1] of KEEP_BOX) if (lx > x0 - r && lx < x1 + r && lz > z0 - r && lz < z1 + r) return true;
  for (const [x, z, rr] of KEEP_RING) if (Math.hypot(lx - x, lz - z) < rr + r) return true;
  return false;
}

/** A neighbour's house and yard (the sugar-palm village's houses: their middle, half their size and a yard round). */
function atNeighbour(x: number, z: number, r: number): boolean {
  for (const h of EV_HOMES) {
    const d = Math.hypot(x - h.x, z - h.z);
    if (d < Math.max(h.w, h.d) / 2 + 5 + r) return true;
  }
  return false;
}

/** Eight directions round a point (unit x, z), and the middle. */
const RING8: readonly (readonly [number, number])[] = [[0, 0], [1, 0], [0.7071, 0.7071], [0, 1], [-0.7071, 0.7071], [-1, 0], [-0.7071, -0.7071], [0, -1], [0.7071, -0.7071]];

/** The room a kind's plant needs round it (m). */
export const roomOf = (k: PlantKindId): number => KINDS[k].room;

/** Where `kind` can be planted at (x, z): null, or why not. No allocation. */
export function canPlant(world: RoamWorld, kind: PlantKindId, x: number, z: number, near = true): SpotReason | null {
  const k = KINDS[kind];
  if (kind === 'bodhi') return 'pagoda';
  const f = world.field;
  // (`near` false: a shot's lineup may run past the garden's 40 m, every other rule kept)
  if ((near && Math.hypot(x - HOME_AT.x, z - HOME_AT.z) > AREA) || !world.inBounds(x, z)) return 'far';
  if (!GARDEN.roomFor(k.size)) return 'full';
  const room = k.room;
  // Water: the stream, its bank, and a margin round the room.
  const wr = room + WATER_MARGIN;
  for (const [dx, dz] of RING8) {
    const px = x + dx * wr;
    const pz = z + dz * wr;
    if (f.waterAt(px, pz) !== null || world.waterAt(px, pz) !== null) return 'water';
    const sx = x + dx * room;
    const sz = z + dz * room;
    if (f.surfaceAt(sx, sz) === SURFACE.sand || f.surfaceAt(sx, sz) === SURFACE.bed) return 'water';
  }
  // Paths: the road's surface, a trail's tread and its band (in the room, and half a metre round).
  const pr = Math.min(room, 1.2) + 0.5;
  for (const [dx, dz] of RING8) {
    const px = x + dx * pr;
    const pz = z + dz * pr;
    const c = f.index(px, pz);
    if (c < 0) return 'far';
    if (f.trail[c] || f.surface[c] === SURFACE.path || f.surface[c] === SURFACE.pad) return 'path';
  }
  // The house and its things; a neighbour's house and yard.
  const hr = Math.min(room, 1.5) * 0.6;
  for (const [dx, dz] of RING8) {
    const [lx, lz] = homeLocal(x + dx * hr, z + dz * hr);
    if (atHouse(lx, lz, 0)) return 'house';
  }
  if (atNeighbour(x, z, room * 0.5)) return 'yard';
  for (const [dx, dz] of RING8) {
    const px = x + dx * hr;
    const pz = z + dz * hr;
    const c = f.index(px, pz);
    if (c >= 0 && f.occupied[c]) {
      const [lx, lz] = homeLocal(px, pz);
      if (!(lx > OWN_YARD.x0 && lx < OWN_YARD.x1 && lz > OWN_YARD.z0 && lz < OWN_YARD.z1)) return 'yard';
    }
  }
  // One level of the land for the whole room (a tree's: its crown's ground can step; its foot's metre must not).
  const h0 = f.heightAt(x, z);
  const lr = isTree(k) ? Math.min(room, 1.6) : room * 0.9;
  for (const [dx, dz] of RING8) if (Math.abs(f.heightAt(x + dx * lr, z + dz * lr) - h0) > 0.05) return 'level';
  // Room: nearer no plant than the larger of the two rooms.
  for (const p of GARDEN.plants) {
    const r = Math.max(room, KINDS[p.kind].room);
    const dx = p.x - x;
    const dz = p.z - z;
    if (dx * dx + dz * dz < r * r) return 'room';
  }
  // Something built stands there (the walk map's top over the land).
  const tr = Math.min(room * 0.6, 0.6);
  for (const [dx, dz] of RING8) {
    const px = x + dx * tr;
    const pz = z + dz * tr;
    if (world.groundAt(px, pz) - f.heightAt(px, pz) > THING) return 'thing';
  }
  return null;
}

/** The house is his and he is near enough it to garden (feet at x, z). */
export const inGardenArea = (x: number, z: number, margin = AREA_SEEN): boolean => HOME.owned && Math.hypot(x - HOME_AT.x, z - HOME_AT.z) < margin;

// ── Filling the can ─────────────────────────────────────────────────────────

/** The water jar at his stair's foot (local; hamlet/_home.ts "The yard": the jar to wash his feet). */
export const JAR_LOCAL = { x: HOME_STAIR.x + HOME_STAIR.width / 2 + 0.75, z: HOME_STAIR_FOOT - 1.0 } as const;
/** The jar's middle on the map, its rim's height over the ground (m). */
export function jarAt(): [number, number] {
  return homeToWorld(JAR_LOCAL.x, JAR_LOCAL.z);
}
export const JAR_RIM = 0.82;
/** Near enough the jar to fill the can (m from its middle). */
const JAR_REACH = 1.9;
/** He dips the can in the jar standing this far from its middle (m). */
export const JAR_STAND = 0.75;

export interface FillSpot {
  readonly at: 'jar' | 'stream';
  /** The water (m): the jar's middle at its rim, or the stream's surface ahead of him. */
  x: number;
  y: number;
  z: number;
}

/** Where he would fill the can from where he stands (`out` filled), or null: the jar within reach, or the stream's edge ahead of him. */
export function fillSpot(world: RoamWorld, x: number, y: number, z: number, yaw: number, out: { at: 'jar' | 'stream'; x: number; y: number; z: number }): boolean {
  const [jx, jz] = jarAt();
  if (Math.hypot(x - jx, z - jz) < JAR_REACH) {
    out.at = 'jar';
    out.x = jx;
    out.z = jz;
    out.y = world.field.heightAt(jx, jz) + JAR_RIM;
    return true;
  }
  if (!inGardenArea(x, z, AREA + 25)) return false;
  // (not standing in it: on the bank, the water just ahead and not far below his feet)
  const here = world.waterAt(x, z);
  if (here !== null && here > y - 0.05) return false;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  for (const d of [0.7, 1.1, 1.6, 2.1]) {
    const px = x + fx * d;
    const pz = z + fz * d;
    const w = world.waterAt(px, pz);
    if (w === null) continue;
    if (y - w > 2.2 || w > y + 0.2) return false;
    out.at = 'stream';
    out.x = px;
    out.y = w;
    out.z = pz;
    return true;
  }
  return false;
}

// ── Reaching a plant ────────────────────────────────────────────────────────

/** From how far (m, his feet to the plant's middle) E reaches a plant. */
export function reachOf(p: Plant): number {
  const k = KINDS[p.kind];
  if (!isTree(k)) return 1.6 + k.room * 0.4;
  const stage = stageOf(k, p.age);
  let r = trunkAt(k, stage) + (stage >= 3 ? 2.0 : 1.6);
  if (stage === 4 && k.fruit.pick === 'pole') r = Math.max(r, k.spread * 0.75);
  if (stage === 4 && k.fruit.pick === 'ground') r = Math.max(r, trunkAt(k, stage) + 2.4);
  return r;
}
