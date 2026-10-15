import { cartBlockWhy } from '../build/haul';
import { ROPE, STAKES } from '../cattle/plan';
import { CATTLE } from '../cattle/state';
import { BIKE_OWN } from './_bikeOwn';
import { BUILT, PIECES, pieceToWorld, type Built, type PieceId } from '../build/pieces';
import { inPlot, PLOT_TREES } from '../build/plot';
import { corners, distTo, overlap, sizeOf, type Foot } from '../build/state';
import { KINDS, isTree, stageOf, trunkAt } from '../garden/kinds';
import { GARDEN } from '../garden/state';
import { EV_HOMES } from '../hamlet/_evSpots';
import { HOME_DOG, HOME_GRAN, HOME_SIZE, HOME_STAIR, HOME_STAIR_FOOT, HOME_Z, homeHammock, homeLocal } from '../hamlet/_homePlan';
import { SURFACE } from '../heightfield';
import { canopyOf, type Canopy } from '../veg/canopy';
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
 * - `far`: a point out of the roaming area;
 * - `water`: the Kulen stream, its sandy bank or bed, any water under it;
 * - `path`: the road's or a path's surface, a jungle trail's tread (the Kulen
 *   foot trail runs along his land's west edge), half a metre round them;
 * - `field`: a rice field's plot;
 * - `plot`: past his land (build/plot.ts `PLOT_CORNERS`: every point of it on his land);
 *   `yard` there when it is a neighbour's house and yard (the sugar-palm
 *   village's houses and what the village built: the land's `occupied` cells);
 * - `house`: the house and the ground under it and its eaves, its stair and
 *   room at its foot, the jar there, the spirit house, the bougainvillea, the
 *   grandmother's places, the hammock's bay, the dog's bed (as the garden
 *   keeps them: roam/_gardenSpots.ts);
 * - `steep`: the land under it is not level (it is built of big blocks: a step
 *   through it would leave it hanging);
 * - `tree`: a tree on his land (build/plot.ts `PLOT_TREES`, and the jungle's own:
 *   veg/canopy.ts): its trunk, and its crown for a piece taller than its lowest leaves;
 * - `plant`: a plant of his garden stands there (its bed or its trunk);
 * - `piece`: something he built stands there (footprints overlap; fence runs may touch, and cross where an end
 *   meets an end: `fenceJoint`), or before one he
 *   uses from there (the spirit house's kneeling place, the pen's gate: `FRONT`);
 * - `cart`, `cartPlace`: his ox cart and its oxen where they stand, or their place by the house while away (build/haul.ts `cartBlockWhy`);
 * - `cow`: one of his own cows' stakes and the rope's reach round it (cattle/plan.ts `STAKES`, `ROPE`; AWP-20);
 * - `bike`: his own bicycle where he left it (roam/_bikeOwn.ts `BIKE_OWN`; AWP-20);
 * - `thing`: something else stands there (the walk map's top over the land);
 * - `front`: the room before it is not clear (its kneeling place, its gate: water, the house, a step, something
 *   standing, a piece of his).
 * No allocation.
 */

export type BuildReason = 'far' | 'water' | 'path' | 'field' | 'plot' | 'house' | 'yard' | 'steep' | 'tree' | 'plant' | 'piece' | 'cart' | 'cartPlace' | 'cow' | 'bike' | 'thing' | 'front';

export const BUILD_REASON_WORDS: Record<BuildReason, WordKey> = {
  far: 'buildNoFar',
  water: 'buildNoWater',
  path: 'buildNoPath',
  field: 'buildNoField',
  plot: 'buildNoPlot',
  house: 'buildNoHouse',
  yard: 'buildNoYard',
  steep: 'buildNoSteep',
  tree: 'buildNoTree',
  plant: 'buildNoPlant',
  piece: 'buildNoPiece',
  cart: 'haulHere',
  cartPlace: 'haulPlace',
  cow: 'buildNoCow',
  bike: 'buildNoBike',
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
/** His cow's room past its rope's reach (m: its body round its middle), and his bicycle's round where it stands (m: a frame 1.8 m long). */
const COW_ROOM = 0.6;
const BIKE_ROOM = 1.1;
/** Footprints may touch this much (m: a fence's run against the next one's). */
const TOUCH = 0.03;
/** A point this near a piece he built is that piece's (the walk map's top there is his own posts and rails) (m). */
const OWN = 0.12;
/**
 * Two fence runs may cross this far in from their ends (m): a run going on from another's end at an angle (a corner,
 * a bend: roam/_build.ts `snapFence`) shares its end post's room. Enough for a bend of 30° or more (0.25 m deep runs).
 */
export const FENCE_JOINT = 0.5;
/**
 * Would footprint `f` stand in piece `b`: footprints may touch (`TOUCH`); two fence runs cross only at a joint (an end
 * on an end: `fenceJoint`), and side by side they may touch but never stand in each other (no touching tolerance).
 */
export function overlapsBuilt(f: Foot, b: Foot): boolean {
  if (f.id !== 'fence' || b.id !== 'fence') return overlap(f, b, -TOUCH);
  const j = fenceJoint(f, b);
  return overlap(f, b, j ? -TOUCH : 0, j);
}
/** Two fence runs' ends meet when this near (m: roam/_build.ts `snapFence` puts them on each other). */
const MEET = 0.06;

/**
 * How far in from their ends two pieces may cross: `FENCE_JOINT` for two fence runs with an end on an end (a joint),
 * else 0 (in line past each other, side by side, a T through the middle: refused as any overlap).
 */
export function fenceJoint(a: Foot, b: Foot): number {
  if (a.id !== 'fence' || b.id !== 'fence') return 0;
  const h = PIECES.fence.w / 2;
  for (let i = -1; i <= 1; i += 2)
    for (let k = -1; k <= 1; k += 2) {
      const ax = a.x + i * h * Math.cos(a.yaw);
      const az = a.z - i * h * Math.sin(a.yaw);
      const bx = b.x + k * h * Math.cos(b.yaw);
      const bz = b.z - k * h * Math.sin(b.yaw);
      if (Math.hypot(ax - bx, az - bz) < MEET) return FENCE_JOINT;
    }
  return 0;
}

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
  const p = sizeOf(f);
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

const _foot: { id: PieceId | 'foot'; x: number; z: number; yaw: number; w?: number; d?: number } = { id: 'kre', x: 0, z: 0, yaw: 0 };
/** The jungle's trees are looked for this far round a footprint (m: the widest crown). */
const CANOPY_REACH = 7;
/** A wild crown keeps a tall piece this share of its reach away (its rim thins out). */
const CROWN = 0.85;
let _can: Canopy | null = null;
let _tall = 0;
let _hit = false;
/** One of the jungle's trees near `_foot`: its trunk (and the room round it), its crown over a piece taller than its lowest leaves. */
const wildTree = (n: number): void => {
  if (_hit || !_can) return;
  const t = _can.trees[n];
  if (t.kind === 'bush') return;
  const d = distTo(_foot, t.x, t.z);
  if (d < _can.trunk[n] + 0.2 || (_tall > t.low && d < t.r * CROWN)) _hit = true;
};
let _world: RoamWorld | null = null;
let _h0 = 0;
let _lo = 0;
let _hi = 0;
let _level = LEVEL;

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
/** Past his land: a neighbour's yard (the village built there: its `occupied` cells, a house's yard), else just past it. */
function pastLand(x: number, z: number): BuildReason {
  const f = _world!.field;
  const c = f.index(x, z);
  if (c >= 0 && f.occupied[c]) return 'yard';
  for (const h of EV_HOMES) if (Math.hypot(x - h.x, z - h.z) < Math.max(h.w, h.d) / 2 + 5) return 'yard';
  return 'plot';
}
const onLand = (x: number, z: number): BuildReason | null => (inPlot(x, z) ? null : pastLand(x, z));
const onHouse = (x: number, z: number): BuildReason | null => {
  const [lx, lz] = homeLocal(x, z);
  return atHouse(lx, lz) ? 'house' : null;
};
const onLevel = (x: number, z: number): BuildReason | null => {
  const h = _world!.field.heightAt(x, z);
  _lo = Math.min(_lo, h);
  _hi = Math.max(_hi, h);
  return _hi - _lo > _level || Math.abs(h - _h0) > _level ? 'steep' : null;
};
const onCart = (x: number, z: number): BuildReason | null => {
  const w = cartBlockWhy(x, z);
  return w === 'here' ? 'cart' : w === 'place' ? 'cartPlace' : null;
};
const onThing = (x: number, z: number): BuildReason | null => {
  const w = _world!;
  // (what he built himself is the pieces' own rule, `piece`: two fence runs meeting at a joint stand in each other's posts)
  return w.groundAt(x, z) - w.field.heightAt(x, z) > THING && !BUILT.blocks(x, z, OWN) ? 'thing' : null;
};

/**
 * A footprint of its own size (AWP-20: a footprint building's land, `id` 'foot'): across (x, m), deep (z, m), its top
 * over the ground (m: a tree's crown over it), and how much the land under it may step (m; else `LEVEL`).
 */
export interface BuildSize {
  readonly w: number;
  readonly d: number;
  readonly h: number;
  readonly level?: number;
}

/**
 * Where `id` can stand at (x, z) turned `yaw`: null, or why not. `ignore`: a piece of his not to count (the one being
 * moved). `size`: a footprint of its own size (a footprint building's part: `id` 'foot').
 */
export function canBuild(world: RoamWorld, id: PieceId | 'foot', x: number, z: number, yaw: number, ignore: Built | null = null, size: BuildSize | null = null): BuildReason | null {
  _world = world;
  const f = _foot;
  f.id = id;
  f.x = x;
  f.z = z;
  f.yaw = yaw;
  f.w = size?.w;
  f.d = size?.d;
  _level = size?.level ?? LEVEL;
  const p = size ?? PIECES[id as PieceId];
  // (the land, the water, the paths and fields round it, his land's edge, the house)
  let r = eachPoint(f, WATER_MARGIN, onWater) ?? eachPoint(f, PATH_MARGIN, onPath) ?? eachPoint(f, 0, onLand) ?? eachPoint(f, 0.1, onHouse);
  if (r) return r;
  _h0 = world.field.heightAt(x, z);
  _lo = _hi = _h0;
  r = eachPoint(f, 0, onLevel);
  if (r) return r;
  // The trees on his land: a trunk (and the room round it), a crown over a piece taller than its lowest leaves.
  for (const t of PLOT_TREES) if (distTo(f, t.x, t.z) < t.trunk || (p.h > t.low && distTo(f, t.cx, t.cz) < t.cr)) return 'tree';
  // The jungle's own trees on it (veg/canopy.ts: trunk, crown reach and height; not the bushes).
  const can = canopyOf(world.field);
  if (can) {
    _can = can;
    _tall = p.h;
    _hit = false;
    const reach = Math.hypot(p.w, p.d) / 2;
    can.near(x - reach, z - reach, x + reach, z + reach, CANOPY_REACH, wildTree);
    if (_hit) return 'tree';
  }
  // His garden's plants: a crop's bed, a tree's trunk and the ring round it.
  for (const q of GARDEN.plants) {
    if (q.at !== 'home') continue;
    const k = KINDS[q.kind];
    const room = isTree(k) ? Math.max(0.6, trunkAt(k, stageOf(k, q.age)) + 0.4) : Math.min(k.room, 1.2) * 0.8;
    if (distTo(f, q.x, q.z) < room) return 'plant';
  }
  // What he built already (fence runs may touch end to end), and the room before one he uses from there.
  for (const b of BUILT.list) if (b !== ignore && (overlapsBuilt(f, b) || coversFront(f, b))) return 'piece';
  // A footprint building's land (AWP-20: its footprint and eaves, its stair, a fence's line).
  if (BUILT.feetOver(f, -TOUCH)) return 'piece';
  // His ox cart and its oxen, where they stand and their place by the house (build/haul.ts; AWP-14).
  r = eachPoint(f, 0.2, onCart);
  if (r) return r;
  // His own cows on their stakes (the rope's reach round each), his own bicycle where he left it (AWP-20).
  for (const c of CATTLE.herd) {
    const s = STAKES[c.stake];
    if (s && distTo(f, s[0], s[1]) < ROPE + COW_ROOM) return 'cow';
  }
  if (BIKE_OWN.kind && !BIKE_OWN.riding && distTo(f, BIKE_OWN.x, BIKE_OWN.z) < BIKE_ROOM) return 'bike';
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
  const room = FRONT[b.id as PieceId];
  if (!room) return false;
  for (const [x, z, r] of room) {
    pieceToWorld(b, x, z, _fp);
    if (distTo(f, _fp[0], _fp[1]) < r) return true;
  }
  return false;
}

/** The room before `f` (its kneeling place, its gate) is not clear (water, the house, a step, something standing, a piece of his): 'front'. */
function frontBlocked(world: RoamWorld, f: Foot, h0: number, ignore: Built | null): BuildReason | null {
  const room = FRONT[f.id as PieceId];
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
  _foot.w = _foot.d = undefined;
  _foot.x = 0;
  _foot.z = 0;
  _foot.yaw = yaw;
  const fx = Math.sin(faceYaw);
  const fz = Math.cos(faceYaw);
  let far = 0;
  for (const [cx, cz] of corners(_foot, 0, _corners)) far = Math.max(far, -(cx * fx + cz * fz));
  return far + 1.7;
}
