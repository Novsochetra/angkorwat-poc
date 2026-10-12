import { BUILD_NEAR, BUILT, PIECES, pieceToWorld, type Built, type PieceId } from '../build/pieces';
import { corners, distTo, overlap, type Foot } from '../build/state';
import { KINDS, isTree, stageOf, trunkAt } from '../garden/kinds';
import { GARDEN } from '../garden/state';
import { EV_HOMES } from '../hamlet/_evSpots';
import { HOME_AT, HOME_DOG, HOME_GRAN, HOME_SIZE, HOME_STAIR, HOME_STAIR_FOOT, HOME_Z, homeHammock, homeLocal } from '../hamlet/_homePlan';
import { SURFACE } from '../heightfield';
import type { WordKey } from '../ui/lang';
import type { RoamWorld } from './types';

/**
 * Where a piece may be built at home (the add-on `build`: roam/_build.ts), with
 * no three.js: plain rules over the land (the height field: water, the road's
 * and the trails' surface, the rice fields), the walk map (what stands there),
 * the house's own plan (hamlet/_homePlan.ts), his garden (garden/state.ts) and
 * what he has built already (build/state.ts).
 *
 * `canBuild(world, id, x, z, yaw)` is null when the piece can stand there
 * (its middle at x, z, turned `yaw`), else the reason (`BuildReason`, its words
 * `BUILD_REASON_WORDS`), checked in this order over points across its
 * footprint (every `STEP` m, its edges too):
 * - `far`: its middle more than `BUILD_NEAR` m from the house's, or a point out of the roaming area;
 * - `water`: the Kulen stream, its sandy bank or bed, any water under it;
 * - `path`: the road's or a path's surface, a jungle trail's tread (the Kulen
 *   foot trail runs 12 m west of the house), half a metre round them;
 * - `field`: a rice field's plot;
 * - `house`: the house and the ground under it and its eaves, its stair and
 *   room at its foot, the jar there, the spirit house, the bougainvillea, the
 *   grandmother's places, the hammock's bay, the dog's bed (as the garden
 *   keeps them: roam/_gardenSpots.ts);
 * - `yard`: a neighbour's house and yard (the sugar-palm village's houses and
 *   what the village built: the land's `occupied` cells outside his own yard);
 * - `steep`: the land under it is not level (it is built of big blocks: a step
 *   through it would leave it hanging);
 * - `plant`: a plant of his garden stands there (its bed or its trunk);
 * - `piece`: something he built stands there (footprints overlap; fence runs may touch), or before one he
 *   uses from there (the spirit house's kneeling place, the pen's gate: `FRONT`);
 * - `thing`: something else stands there (the walk map's top over the land);
 * - `front`: the room before it is not clear (its kneeling place, its gate: water, the house, a step, something
 *   standing, a piece of his).
 * No allocation.
 */

export type BuildReason = 'far' | 'water' | 'path' | 'field' | 'house' | 'yard' | 'steep' | 'plant' | 'piece' | 'thing' | 'front';

export const BUILD_REASON_WORDS: Record<BuildReason, WordKey> = {
  far: 'buildNoFar',
  water: 'buildNoWater',
  path: 'buildNoPath',
  field: 'buildNoField',
  house: 'buildNoHouse',
  yard: 'buildNoYard',
  steep: 'buildNoSteep',
  plant: 'buildNoPlant',
  piece: 'buildNoPiece',
  thing: 'buildNoThing',
  front: 'buildNoFront',
};

/** Points across a footprint this far apart at most (m). */
const STEP = 0.7;
/** The land under a piece may step this much (m) and no more. */
const LEVEL = 0.12;
/** Things standing taller than this over the land are in the way (m). */
const THING = 0.3;
/** Water (the stream, its bank) is kept this far clear (m). */
const WATER_MARGIN = 0.6;
/** Paths and trails are kept this far clear (m). */
const PATH_MARGIN = 0.5;
/** Footprints may touch this much (m: a fence's run against the next one's). */
const TOUCH = 0.03;

/** Round the house (local m): boxes [x0, z0, x1, z1] and circles [x, z, r] kept clear (as roam/_gardenSpots.ts keeps them). */
const KEEP_BOX: readonly (readonly [number, number, number, number])[] = (() => {
  const w = HOME_SIZE.w / 2;
  const s0 = HOME_STAIR.x - HOME_STAIR.width / 2;
  const s1 = HOME_STAIR.x + HOME_STAIR.width / 2;
  return [
    // the house, under it and its eaves
    [-w - 0.9, HOME_Z.back - 0.9, w + 0.9, HOME_Z.front + 0.6],
    // the stair, and room to come down it and walk off
    [s0 - 0.6, HOME_Z.front, s1 + 0.6, HOME_STAIR_FOOT + 1.4],
  ];
})();
const KEEP_RING: readonly (readonly [number, number, number])[] = (() => {
  const s1 = HOME_STAIR.x + HOME_STAIR.width / 2;
  const hm = homeHammock();
  return [
    [s1 + 0.75, HOME_STAIR_FOOT - 1.0, 1.5],
    [-2.9, HOME_STAIR_FOOT + 1.5, 1.4],
    [HOME_STAIR.x - HOME_STAIR.width / 2 - 1.2, HOME_STAIR_FOOT - 0.3, 0.6],
    [-HOME_SIZE.w / 2 - 1.1, HOME_Z.front + 1.2, 1.2],
    [HOME_GRAN.sweep.x, HOME_GRAN.sweep.z, HOME_GRAN.sweep.r + 0.6],
    [HOME_GRAN.sit.x, HOME_GRAN.sit.z, 1.1],
    [HOME_GRAN.lamp.x, HOME_GRAN.lamp.z, 0.6],
    [(hm.x0 + hm.x1) / 2, hm.z, 1.2],
    [HOME_DOG.x, HOME_DOG.z, 1.0],
  ];
})();
/** His own yard (local): the land's `occupied` cells in it are the house's, not a neighbour's. */
const OWN_YARD = { x0: -HOME_SIZE.w / 2 - 4.2, x1: HOME_SIZE.w / 2 + 6.6, z0: HOME_Z.back - 3.6, z1: HOME_STAIR_FOOT + 6.6 };

/** By the house (local x, z). */
function atHouse(lx: number, lz: number): boolean {
  for (const [x0, z0, x1, z1] of KEEP_BOX) if (lx > x0 && lx < x1 && lz > z0 && lz < z1) return true;
  for (const [x, z, r] of KEEP_RING) if (Math.hypot(lx - x, lz - z) < r) return true;
  return false;
}

/** Is he by his house (feet at x, z: within `r` m of the house's footprint and its stair, on the ground)? */
export function byHouse(x: number, z: number, r: number): boolean {
  const [lx, lz] = homeLocal(x, z);
  for (const [x0, z0, x1, z1] of KEEP_BOX) if (lx > x0 - r && lx < x1 + r && lz > z0 - r && lz < z1 + r) return true;
  return false;
}

/** Each point across the footprint (grown by `m`), as world x, z: `fn` returns a reason to stop. */
function eachPoint(f: Foot, m: number, fn: (x: number, z: number) => BuildReason | null): BuildReason | null {
  const p = PIECES[f.id];
  const c = Math.cos(f.yaw);
  const s = Math.sin(f.yaw);
  const hw = p.w / 2 + m;
  const hd = p.d / 2 + m;
  const nx = Math.max(1, Math.ceil((hw * 2) / STEP));
  const nz = Math.max(1, Math.ceil((hd * 2) / STEP));
  for (let i = 0; i <= nx; i++)
    for (let k = 0; k <= nz; k++) {
      const lx = -hw + (i / nx) * hw * 2;
      const lz = -hd + (k / nz) * hd * 2;
      const r = fn(f.x + lx * c + lz * s, f.z - lx * s + lz * c);
      if (r) return r;
    }
  return null;
}

const _foot = { id: 'kre' as PieceId, x: 0, z: 0, yaw: 0 };
let _world: RoamWorld | null = null;
let _h0 = 0;
let _lo = 0;
let _hi = 0;

const onWater = (x: number, z: number): BuildReason | null => {
  const w = _world!;
  const f = w.field;
  if (f.waterAt(x, z) !== null || w.waterAt(x, z) !== null) return 'water';
  const s = f.surfaceAt(x, z);
  if (s === SURFACE.sand || s === SURFACE.bed) return 'water';
  if (!w.inBounds(x, z)) return 'far';
  return null;
};
const onPath = (x: number, z: number): BuildReason | null => {
  const f = _world!.field;
  const c = f.index(x, z);
  if (c < 0) return 'far';
  if (f.trail[c] || f.surface[c] === SURFACE.path || f.surface[c] === SURFACE.pad) return 'path';
  if (f.surface[c] === SURFACE.paddy) return 'field';
  return null;
};
const onHouse = (x: number, z: number): BuildReason | null => {
  const [lx, lz] = homeLocal(x, z);
  if (atHouse(lx, lz)) return 'house';
  const f = _world!.field;
  const c = f.index(x, z);
  if (c >= 0 && f.occupied[c] && !(lx > OWN_YARD.x0 && lx < OWN_YARD.x1 && lz > OWN_YARD.z0 && lz < OWN_YARD.z1)) return 'yard';
  return null;
};
const onLevel = (x: number, z: number): BuildReason | null => {
  const h = _world!.field.heightAt(x, z);
  _lo = Math.min(_lo, h);
  _hi = Math.max(_hi, h);
  return _hi - _lo > LEVEL || Math.abs(h - _h0) > LEVEL ? 'steep' : null;
};
const onThing = (x: number, z: number): BuildReason | null => {
  const w = _world!;
  return w.groundAt(x, z) - w.field.heightAt(x, z) > THING ? 'thing' : null;
};

/** Where `id` can stand at (x, z) turned `yaw`: null, or why not. `ignore`: a piece of his not to count (the one being moved). */
export function canBuild(world: RoamWorld, id: PieceId, x: number, z: number, yaw: number, ignore: Built | null = null): BuildReason | null {
  if (Math.hypot(x - HOME_AT.x, z - HOME_AT.z) > BUILD_NEAR) return 'far';
  _world = world;
  const f = _foot;
  f.id = id;
  f.x = x;
  f.z = z;
  f.yaw = yaw;
  const p = PIECES[id];
  // (the land, the water, the paths and fields round it, the house, the neighbours)
  let r = eachPoint(f, WATER_MARGIN, onWater) ?? eachPoint(f, PATH_MARGIN, onPath) ?? eachPoint(f, 0.1, onHouse);
  if (r) return r;
  for (const h of EV_HOMES) if (Math.hypot(x - h.x, z - h.z) < Math.max(h.w, h.d) / 2 + 5 + Math.max(p.w, p.d) / 2) return 'yard';
  _h0 = world.field.heightAt(x, z);
  _lo = _hi = _h0;
  r = eachPoint(f, 0, onLevel);
  if (r) return r;
  // His garden's plants: a crop's bed, a tree's trunk and the ring round it.
  for (const q of GARDEN.plants) {
    if (q.at !== 'home') continue;
    const k = KINDS[q.kind];
    const room = isTree(k) ? Math.max(0.6, trunkAt(k, stageOf(k, q.age)) + 0.4) : Math.min(k.room, 1.2) * 0.8;
    if (distTo(f, q.x, q.z) < room) return 'plant';
  }
  // What he built already (fence runs may touch end to end), and the room before one he uses from there.
  for (const b of BUILT.list) if (b !== ignore && (overlap(f, b, -TOUCH) || coversFront(f, b))) return 'piece';
  // Anything else standing there.
  return eachPoint(f, -0.05, onThing) ?? frontBlocked(world, f, _h0, ignore);
}

/**
 * The room a piece is used from, kept clear (its frame, m: x, z, radius): the spirit house's kneeling place (E Pray:
 * he kneels there, facing it), the way in at the pen's gate (and his cattle's).
 */
const FRONT: Partial<Record<PieceId, readonly (readonly [number, number, number])[]>> = (() => {
  const s = PIECES.spirit.kneel!;
  const g = PIECES.pen.pen!.gate;
  return { spirit: [[s.x, s.z, 0.45]], pen: [[g[0], g[1] + 0.95, 0.75]] };
})();
/** The room before it may be this much higher or lower than the piece's ground (m): he stands on it. */
const FRONT_LEVEL = 0.35;
const _fp: [number, number] = [0, 0];

/** Would footprint `f` cover the room before `b` (its kneeling place, its gate)? */
function coversFront(f: Foot, b: Foot): boolean {
  const room = FRONT[b.id];
  if (!room) return false;
  for (const [x, z, r] of room) {
    pieceToWorld(b, x, z, _fp);
    if (distTo(f, _fp[0], _fp[1]) < r) return true;
  }
  return false;
}

/** The room before `f` (its kneeling place, its gate) is not clear (water, the house, a step, something standing, a piece of his): 'front'. */
function frontBlocked(world: RoamWorld, f: Foot, h0: number, ignore: Built | null): BuildReason | null {
  const room = FRONT[f.id];
  if (!room) return null;
  for (const [lx, lz, r] of room)
    for (let k = 0; k < 5; k++) {
      // (its middle and four points round it)
      const a = (k * Math.PI) / 2;
      pieceToWorld(f, lx + (k ? Math.cos(a) * r * 0.8 : 0), lz + (k ? Math.sin(a) * r * 0.8 : 0), _fp);
      const [x, z] = _fp;
      if (onWater(x, z) || onHouse(x, z)) return 'front';
      if (Math.abs(world.field.heightAt(x, z) - h0) > FRONT_LEVEL || onThing(x, z)) return 'front';
      for (const b of BUILT.list) if (b !== ignore && distTo(b, x, z) < 0.05) return 'front';
    }
  return null;
}

const _corners: [number, number][] = [];
/** How far ahead of his feet a piece's ghost goes (m): its half reach along the way he faces, and two steps more. */
export function ghostAhead(id: PieceId, yaw: number, faceYaw: number): number {
  _foot.id = id;
  _foot.x = 0;
  _foot.z = 0;
  _foot.yaw = yaw;
  const fx = Math.sin(faceYaw);
  const fz = Math.cos(faceYaw);
  let far = 0;
  for (const [cx, cz] of corners(_foot, 0, _corners)) far = Math.max(far, -(cx * fx + cz * fz));
  return far + 1.7;
}
