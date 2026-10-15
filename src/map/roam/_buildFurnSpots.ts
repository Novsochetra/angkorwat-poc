import { BLOCKS, cellOf } from '../blocks/store';
import { cartBlockWhy } from '../build/haul';
import { FURN, HANG, isFurniture, type FurnitureId } from '../build/furniture';
import { shelterUnder } from '../build/models/shelter';
import { BUILT, PIECES, pieceToWorld, type Built, type PieceId } from '../build/pieces';
import { inPlot } from '../build/plot';
import { distTo, toLocal } from '../build/state';
import { HOME_SIZE, HOME_Z, homeFloor, homeLocal } from '../hamlet/_homePlan';
import type { WordKey } from '../ui/lang';
import { BUILD_REASON_WORDS, canBuild, type BuildReason } from './_buildSpots';
import type { RoamWorld } from './types';

/**
 * Where a piece of furniture or a lantern may stand (AWP-23; the pieces:
 * build/furniture.ts; the add-on: roam/_build.ts asks `furnSpot` for its ghost
 * in place of `canBuild`), with no three.js.
 *
 * **Its floor** is what feet at his level stand on under it (the walk map's
 * `standAt` from his feet's height: the land, a floor of the blocks he built,
 * his stilt house's floor or veranda), the same under every point of its
 * footprint (every `STEP` m and its edges): a point where it is lower is past
 * the floor's edge (`edge`), higher or a wall is something in the way.
 * - **The land**: the yard pieces' rules (_buildSpots.ts `canBuild`: his land,
 *   water, the path, the house, level ground, trees, his garden…), except that
 *   only what fills the same height is in its way (a mat goes under a hanging
 *   lantern, the hammock's cloth and the shelter's roof are not in the way: a
 *   shelter's posts and bench are).
 * - **His blocks** (blocks/store.ts): on his land, a block of his under each
 *   point (another floor is someone else's: `thing`).
 * - **His stilt house** (hamlet/_homePlan.ts): its rooms and veranda, round
 *   its own things and the ways through it (`HOUSE_KEEP`: the sleeping mat and
 *   its net, where he gets up, the sitting mat, the jar, the doors' swing, the
 *   way from the doors to the stair, the veranda's mat): `keep`.
 * - **What he built**: pieces whose height (`FURN[id].band`, a yard piece's
 *   ground to its top) meets its own and whose footprints overlap (`piece`);
 *   the room before the spirit house and the pen's gate (`front`).
 * - **A hanging lantern** (`FURN[id].hang`): a roof over its middle (the walk
 *   map's `ceilingAt`: his blocks, his house's roof; a shelter he built: its
 *   rafters, `shelterUnder`) at least `HANG.min` over the floor (`hangLow`) and
 *   at most `HANG.max` (`hangHigh`); none: `hang`.
 *
 * No allocation per question.
 */

export type FurnReason = BuildReason | 'edge' | 'keep' | 'hang' | 'hangLow' | 'hangHigh';

const FURN_WORDS: Record<Exclude<FurnReason, BuildReason>, WordKey> = {
  edge: 'buildNoEdge',
  keep: 'buildNoKeep',
  hang: 'buildNoHang',
  hangLow: 'buildNoHangLow',
  hangHigh: 'buildNoHangHigh',
};

/** The words of a reason (a yard piece's or furniture's). */
export const reasonWord = (r: FurnReason): WordKey => (r in FURN_WORDS ? FURN_WORDS[r as keyof typeof FURN_WORDS] : BUILD_REASON_WORDS[r as BuildReason]);

/** Points across a footprint this far apart at most (m). */
const STEP = 0.25;
/** The floor under it may step this much (m: a floor of blocks is flat; the land a little less so). */
const LEVEL = { floor: 0.06, land: 0.12 };
/** Feet step up this much (m: the walker's), and the floor is at his level within this (m). */
const UP = 0.35;
const AT_LEVEL = 0.45;
/** Footprints may touch this much (m). */
const TOUCH = 0.03;
/** It is on the land when its floor is this near the land's height (m). */
const ON_LAND = 0.08;

/** In the house's frame (local m): boxes [x0, z0, x1, z1] and circles [x, z, r] kept clear on its floor. */
const HOUSE_KEEP_BOX: readonly (readonly [number, number, number, number])[] = [
  // the sleeping mat under its net
  [-3.4, -3.4, 0.2, -1.6],
  // the sitting mat (1.2 × 1.8 m round 1.4, −1.35)
  [0.7, -2.35, 2.1, -0.35],
  // the doors' swing inside, the doorway
  [-1.2, -0.1, 1.2, 1.35],
  // the way from the doors to the stair on the veranda
  [-1.2, 1.1, 3.0, 3.6],
  // the veranda's mat
  [-3.0, 1.45, -1.6, 3.35],
];
const HOUSE_KEEP_RING: readonly (readonly [number, number, number])[] = [
  // where he steps out of the net, and stretches on waking (HOME_IN `out`, `wake`)
  [-0.3, -1.35, 0.6],
  [1.1, -0.45, 0.6],
  // the jar by the door
  [2.55, 0.55, 0.6],
];

/** What `furnSpot` found: its floor (m), the roof over a hanging lantern (m; Infinity none), why not (null: it can stand there). */
export interface FurnSpot {
  y: number;
  ceil: number;
  reason: FurnReason | null;
}

const _l: [number, number] = [0, 0];
const _w: [number, number] = [0, 0];
const _foot = { id: 'teamat' as PieceId, x: 0, z: 0, yaw: 0 };

/** Each point across a footprint `id` at (x, z, yaw), shrunk by `m`: `fn` returns true to stop (and `eachIn` returns true). */
function eachIn(id: PieceId, x: number, z: number, yaw: number, m: number, fn: (px: number, pz: number) => boolean): boolean {
  const p = PIECES[id];
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const hw = Math.max(0.01, p.w / 2 - m);
  const hd = Math.max(0.01, p.d / 2 - m);
  const nx = Math.max(1, Math.ceil((hw * 2) / STEP));
  const nz = Math.max(1, Math.ceil((hd * 2) / STEP));
  for (let i = 0; i <= nx; i++)
    for (let k = 0; k <= nz; k++) {
      const lx = -hw + (i / nx) * hw * 2;
      const lz = -hd + (k / nz) * hd * 2;
      if (fn(x + lx * c + lz * s, z - lx * s + lz * c)) return true;
    }
  return false;
}

/** Is (x, z) on his stilt house's floor (its rooms and veranda), `m` in from its edges? */
function onHouse(x: number, z: number, m = 0): boolean {
  const [lx, lz] = homeLocal(x, z);
  return Math.abs(lx) < HOME_SIZE.w / 2 - m && lz > HOME_Z.back + m && lz < HOME_Z.front - m;
}

/** Is (x, z) one of the house's places kept clear? */
function houseKeep(x: number, z: number, grow: number): boolean {
  const [lx, lz] = homeLocal(x, z);
  for (const [x0, z0, x1, z1] of HOUSE_KEEP_BOX) if (lx > x0 - grow && lx < x1 + grow && lz > z0 - grow && lz < z1 + grow) return true;
  for (const [cx, cz, r] of HOUSE_KEEP_RING) if (Math.hypot(lx - cx, lz - cz) < r + grow) return true;
  return false;
}

/** The part of the height over its floor a piece fills (m): furniture's band, a yard piece from the ground to its top. */
function bandOf(id: PieceId): readonly [number, number] {
  return isFurniture(id) ? FURN[id].band : [0, PIECES[id].h];
}

/** Two rectangles on the map (middle, half sizes, turn) overlap, each grown by `m` (separating axes). */
function rects(ax: number, az: number, ahw: number, ahd: number, ayaw: number, bx: number, bz: number, bhw: number, bhd: number, byaw: number, m: number): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const ac = Math.cos(ayaw);
  const as = Math.sin(ayaw);
  const bc = Math.cos(byaw);
  const bs = Math.sin(byaw);
  for (let k = 0; k < 4; k++) {
    const c = k < 2 ? ac : bc;
    const s = k < 2 ? as : bs;
    // (the rectangle's local x axis on the map is (c, −s), its local z axis (s, c))
    const ux = k % 2 ? s : c;
    const uz = k % 2 ? c : -s;
    const ra = (ahw + m) * Math.abs(ux * ac - uz * as) + (ahd + m) * Math.abs(ux * as + uz * ac);
    const rb = (bhw + m) * Math.abs(ux * bc - uz * bs) + (bhd + m) * Math.abs(ux * bs + uz * bc);
    if (Math.abs(dx * ux + dz * uz) >= ra + rb) return false;
  }
  return true;
}

/**
 * Something he built in the way of `id` at (x, y, z, yaw): a piece filling the same height whose footprint overlaps
 * (a shelter, a hammock: their posts and bench only), or the room before one he uses from there (`front`).
 */
function builtInWay(id: PieceId, x: number, y: number, z: number, yaw: number, ignore: Built | null): 'piece' | 'front' | null {
  const P = PIECES[id];
  const [a0, a1] = bandOf(id);
  for (const b of BUILT.list) {
    if (b === ignore) continue;
    const Q = PIECES[b.id];
    const [b0, b1] = bandOf(b.id);
    if (b.y + b0 >= y + a1 - 0.01 || y + a0 >= b.y + b1 - 0.01) continue;
    if (Q.walkThrough && !isFurniture(b.id)) {
      // (under the shelter's roof, beside the hammock's cloth: only their posts and the bench are in the way)
      for (const [sx, sz, sw, sd, top] of Q.solids) {
        if (b.y + top <= y + a0) continue;
        pieceToWorld(b, sx, sz, _w);
        if (rects(x, z, P.w / 2, P.d / 2, yaw, _w[0], _w[1], sw / 2, sd / 2, b.yaw, -TOUCH)) return 'piece';
      }
    } else if (rects(x, z, P.w / 2, P.d / 2, yaw, b.x, b.z, Q.w / 2, Q.d / 2, b.yaw, -TOUCH)) return 'piece';
  }
  // (the spirit house's kneeling place, the pen's gate: kept clear on the ground before them)
  _foot.id = id;
  _foot.x = x;
  _foot.z = z;
  _foot.yaw = yaw;
  for (const b of BUILT.list) {
    if (b === ignore || Math.abs(b.y - y) > 0.5) continue;
    const Q = PIECES[b.id];
    if (Q.kneel) {
      pieceToWorld(b, Q.kneel.x, Q.kneel.z, _w);
      if (distTo(_foot, _w[0], _w[1]) < 0.45) return 'front';
    }
    if (Q.pen) {
      pieceToWorld(b, Q.pen.gate[0], Q.pen.gate[1] + 0.95, _w);
      if (distTo(_foot, _w[0], _w[1]) < 0.75) return 'front';
    }
  }
  return null;
}

/**
 * The roof over a hanging lantern's middle (x, z) on a floor at `y` (m): his blocks or his house's roof (the walk
 * map's `ceilingAt`), or a shelter he built (its rafters, its plates); Infinity none.
 */
export function hangCeil(world: RoamWorld, x: number, z: number, y: number): number {
  let c = world.ceilingAt?.(x, z, y + 0.3) ?? Infinity;
  for (const b of BUILT.list) {
    if (b.id !== 'shelter' || b.done < 1 || Math.abs(b.y - y) > 0.3) continue;
    toLocal(b, x, z, _l);
    c = Math.min(c, b.y + shelterUnder(_l[0], _l[1]));
  }
  return c;
}

/**
 * Where furniture `id` may stand with its middle at (x, z) turned `yaw`, for him with his feet at `feetY` (into
 * `out`: its floor, the roof over a hanging lantern, why not). `ignore`: a piece of his not to count.
 */
export function furnSpot(world: RoamWorld, id: FurnitureId, x: number, z: number, yaw: number, feetY: number, out: FurnSpot, ignore: Built | null = null): FurnSpot {
  out.ceil = Infinity;
  out.reason = null;
  const f = FURN[id];
  const room = Math.min(2.2, Math.max(0.3, f.hang ? 0.5 : f.band[1]));
  const stand = world.standAt;
  const floorAt = (px: number, pz: number): number => (stand ? stand(px, pz, feetY, UP, room) : world.groundAt(px, pz));
  // Its floor at its middle: at his level.
  const y0 = floorAt(x, z);
  out.y = Number.isFinite(y0) ? y0 : feetY;
  if (!Number.isFinite(y0)) return fail(out, 'thing');
  if (y0 < feetY - AT_LEVEL) return fail(out, 'edge');
  const land = world.field.heightAt(x, z);
  const onLand = Math.abs(y0 - land) < ON_LAND;
  const level = onLand ? LEVEL.land : LEVEL.floor;
  // The same floor under every point (lower: past its edge; higher, or no room: in the way).
  let why: FurnReason | null = null;
  eachIn(id, x, z, yaw, 0.02, (px, pz) => {
    const s = floorAt(px, pz);
    // (no floor at his level there: the land steps up, or something stands there)
    if (!Number.isFinite(s)) why = onLand && world.field.heightAt(px, pz) > y0 + UP ? 'steep' : 'thing';
    else if (s < y0 - Math.max(level, 0.3)) why = onLand ? 'steep' : 'edge';
    else if (Math.abs(s - y0) > level) why = onLand ? 'steep' : 'thing';
    return why !== null;
  });
  if (why) return fail(out, why);

  if (onLand) {
    // The land: the yard pieces' rules; "something he built" again with heights (a mat under a lantern, under a shelter's roof).
    out.y = land;
    let r: FurnReason | null = canBuild(world, id, x, z, yaw, ignore);
    // (something standing over the land: the floor under every point is the land with room over it at his level, so
    // only a roof is over it: his shed's, his blocks')
    if (r === 'thing') r = null;
    if (r === 'piece' || r === 'front') {
      r = builtInWay(id, x, land, z, yaw, ignore);
      // (none at its height: the yard pieces' rule after theirs)
      if (!r && eachIn(id, x, z, yaw, 0, (px, pz) => cartBlockWhy(px, pz) !== null)) r = 'cart';
    }
    if (r) return fail(out, r);
  } else if (onHouse(x, z) && Math.abs(y0 - homeFloor(world.field).floor) < 0.4) {
    // His stilt house: all of it on its floor, round its own things.
    if (eachIn(id, x, z, yaw, 0, (px, pz) => !onHouse(px, pz, 0.05))) return fail(out, 'edge');
    if (eachIn(id, x, z, yaw, 0, (px, pz) => houseKeep(px, pz, 0.05))) return fail(out, 'keep');
    const r = builtInWay(id, x, y0, z, yaw, ignore);
    if (r) return fail(out, r);
  } else {
    // His blocks: on his land, a block of his under every point.
    if (eachIn(id, x, z, yaw, 0, (px, pz) => !inPlot(px, pz))) return fail(out, 'plot');
    const j = cellOf(y0 - 0.01);
    if (eachIn(id, x, z, yaw, 0.02, (px, pz) => !BLOCKS.solid(cellOf(px), j, cellOf(pz)))) return fail(out, 'thing');
    const r = builtInWay(id, x, y0, z, yaw, ignore);
    if (r) return fail(out, r);
  }

  // A hanging lantern: a roof over it, neither too low nor too high.
  if (f.hang) {
    const c = hangCeil(world, x, z, out.y);
    out.ceil = c;
    if (!Number.isFinite(c)) return fail(out, 'hang');
    if (c - out.y < HANG.min) return fail(out, 'hangLow');
    if (c - out.y > HANG.max) return fail(out, 'hangHigh');
  }
  return out;
}

function fail(out: FurnSpot, r: FurnReason): FurnSpot {
  out.reason = r;
  return out;
}

/** He stands on a floor furniture may go on (his house's, or his blocks on his land), not the land (`E  Build…` from there). */
export function onFurnFloor(world: RoamWorld, x: number, y: number, z: number): boolean {
  if (y - world.field.heightAt(x, z) < 0.3) return false;
  if (onHouse(x, z) && Math.abs(y - homeFloor(world.field).floor) < 0.4) return true;
  return inPlot(x, z) && BLOCKS.solid(cellOf(x), cellOf(y - 0.05), cellOf(z));
}
