import { BLOCKS, BLOCK_M, cellOf } from '../blocks/store';
import { BUILT, PIECES } from '../build/pieces';
import { CATTLE_OBSTACLES, STAKES, STAKE_ROOM } from '../cattle/plan';
import { CATTLE } from '../cattle/state';
import type { RoamWorld } from './types';

/**
 * Does his ox cart (or its pair of oxen) fit where it would stand? (the add-on
 * `haul`, roam/_haul.ts; ticket AWP-14, review 2). Its body as a box turned to
 * its heading (`CartBox`: from its axle or yoke, `back` ‥ `front` along it,
 * ±`half` across), tested against:
 * - **what he built** (build/pieces.ts `BUILT`): each piece's whole footprint
 *   (`w` × `d`, turned to its own heading), box against box, exactly (a fence
 *   run is 0.25 m thick, a lamp post 0.3 m: no sampling can step over them);
 *   a cart never stands in a pen, under a shelter, over a bed or a hammock;
 * - **the player's blocks** (blocks/store.ts `BLOCKS`): every cell column
 *   whose square meets the box, a solid cell anywhere from the ground to the
 *   load's top, exactly;
 * - **everything else of the map** (the walk map: houses, stalls, walls, a
 *   trunk, a stair, a jar): what stands over the land (`world.groundAt` over
 *   `field.heightAt`), looked at every `GRID` m across the whole box (the
 *   walk map's own cells are 0.5 m: every one is looked at).
 * The add-on tests the cart's and the oxen's boxes at every point the way
 * adds (each 0.5 m: the box is 4.5 m long, so where its front goes is inside
 * the next box: nothing is jumped over) and at a saved place.
 *
 * No allocation; nothing per frame but what the way adds.
 */

/** A box on the map: its origin (the axle, the yoke), its heading (rad, 0 = +z), its reach along it and half across (m). */
export interface CartBox {
  x: number;
  z: number;
  yaw: number;
  back: number;
  front: number;
  half: number;
}

/** What stands over the land counts as in the way past this (m): a step, a wall, a trunk (as `passable`). */
const BUILT_UP = 0.35;
/** The map looked at every this far across the box (m). */
const GRID = 0.2;
/** Room it needs over the ground for the player's blocks (m: the load's top, the oxen's horns). */
const HIGH = 3.4;
/** A little room kept round the box (m). */
const MARGIN = 0.05;

/** Is a rectangle (middle cx, cz; heading `yaw`; half across `hw`, half along `hd`) in the box `b`? (two turned rectangles: separating axes) */
export function boxMeetsRect(b: CartBox, cx: number, cz: number, yaw: number, hw: number, hd: number): boolean {
  const f1x = Math.sin(b.yaw);
  const f1z = Math.cos(b.yaw);
  const a1x = f1z;
  const a1z = -f1x;
  const m = (b.back + b.front) / 2;
  const L = (b.front - b.back) / 2 + MARGIN;
  const H = b.half + MARGIN;
  const ox = b.x + f1x * m;
  const oz = b.z + f1z * m;
  const f2x = Math.sin(yaw);
  const f2z = Math.cos(yaw);
  const a2x = f2z;
  const a2z = -f2x;
  const dx = cx - ox;
  const dz = cz - oz;
  // (each axis: the boxes' reach along it against the middles' distance)
  const sep = (nx: number, nz: number): boolean => {
    const r1 = L * Math.abs(f1x * nx + f1z * nz) + H * Math.abs(a1x * nx + a1z * nz);
    const r2 = hd * Math.abs(f2x * nx + f2z * nz) + hw * Math.abs(a2x * nx + a2z * nz);
    return Math.abs(dx * nx + dz * nz) > r1 + r2;
  };
  return !(sep(f1x, f1z) || sep(a1x, a1z) || sep(f2x, f2z) || sep(a2x, a2z));
}

/** The box's reach on the map's axes (min x, max x, min z, max z), into `out`. */
function bounds(b: CartBox, out: number[]): number[] {
  const fx = Math.sin(b.yaw);
  const fz = Math.cos(b.yaw);
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const u of [b.back - MARGIN, b.front + MARGIN])
    for (const v of [-b.half - MARGIN, b.half + MARGIN]) {
      const x = b.x + fx * u + fz * v;
      const z = b.z + fz * u - fx * v;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
  out[0] = x0;
  out[1] = x1;
  out[2] = z0;
  out[3] = z1;
  return out;
}
const _bb = [0, 0, 0, 0];

/** A piece he built (or is building) is in the box: its whole footprint. */
export function builtInBox(b: CartBox): boolean {
  for (const p of BUILT.list) {
    const s = PIECES[p.id];
    if (boxMeetsRect(b, p.x, p.z, p.yaw, s.w / 2, s.d / 2)) return true;
  }
  return false;
}

/** A solid player block is in the box, from the land under it up to `HIGH` over it. */
export function blocksInBox(world: RoamWorld, b: CartBox): boolean {
  if (!BLOCKS.count) return false;
  bounds(b, _bb);
  const f = world.field;
  for (let i = cellOf(_bb[0]); i <= cellOf(_bb[1]); i++)
    for (let k = cellOf(_bb[2]); k <= cellOf(_bb[3]); k++) {
      const cx = (i + 0.5) * BLOCK_M;
      const cz = (k + 0.5) * BLOCK_M;
      if (!boxMeetsRect(b, cx, cz, 0, BLOCK_M / 2, BLOCK_M / 2)) continue;
      const g = f.heightAt(cx, cz);
      for (let j = cellOf(g - 0.01); j <= cellOf(g + HIGH); j++) if (BLOCKS.solid(i, j, k)) return true;
    }
  return false;
}

/** Something of the map stands over the land in the box (looked at every `GRID` m, its edges too). */
export function worldInBox(world: RoamWorld, b: CartBox): boolean {
  const f = world.field;
  const fx = Math.sin(b.yaw);
  const fz = Math.cos(b.yaw);
  const nu = Math.max(1, Math.ceil((b.front - b.back) / GRID));
  const nv = Math.max(1, Math.ceil((2 * b.half) / GRID));
  for (let iu = 0; iu <= nu; iu++) {
    const u = b.back + ((b.front - b.back) * iu) / nu;
    for (let iv = 0; iv <= nv; iv++) {
      const v = -b.half + (2 * b.half * iv) / nv;
      const x = b.x + fx * u + fz * v;
      const z = b.z + fz * u - fx * v;
      if (world.groundAt(x, z) - f.heightAt(x, z) > BUILT_UP) return true;
    }
  }
  return false;
}

/** Does the box meet the disc (cx, cz, r)? (the nearest point of the box to its middle, in the box's own frame) */
export function boxMeetsCircle(b: CartBox, cx: number, cz: number, r: number): boolean {
  const fx = Math.sin(b.yaw);
  const fz = Math.cos(b.yaw);
  const dx = cx - b.x;
  const dz = cz - b.z;
  const a = dx * fx + dz * fz;
  const c = dx * fz - dz * fx;
  const oa = Math.max(b.back - MARGIN - a, a - b.front - MARGIN, 0);
  const oc = Math.max(Math.abs(c) - b.half - MARGIN, 0);
  return oa * oa + oc * oc < r * r;
}

/** A stake one of his cows is tied to (cattle/plan.ts `STAKE_ROOM` round it): the cart keeps out of its room. */
export function stakeInBox(b: CartBox): boolean {
  for (const c of CATTLE.herd) {
    const s = STAKES[c.stake];
    if (s && boxMeetsCircle(b, s[0], s[1], STAKE_ROOM)) return true;
  }
  return false;
}

/** A cow (his or the trader's, where it stands this frame: cattle/plan.ts `CATTLE_OBSTACLES`) is in the box. */
export function cowInBox(b: CartBox): boolean {
  const O = CATTLE_OBSTACLES;
  for (let i = 0; i < O.n; i++) if (boxMeetsCircle(b, O.x[i], O.z[i], O.r[i])) return true;
  return false;
}

/**
 * The box is clear of his pieces, his cows' stakes in use, his blocks and the map's things (the cheapest first): the
 * one rule for where the cart may stand, as it moves and as a saved place is checked. (What moves, his cattle, is
 * `cowInBox`: the moving cart stops for them, a parked one is never refused for them: they walk round it.)
 */
export const boxClear = (world: RoamWorld, b: CartBox): boolean => !builtInBox(b) && !stakeInBox(b) && !blocksInBox(world, b) && !worldInBox(world, b);
