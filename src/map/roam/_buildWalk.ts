import { BUILT, PIECES } from '../build/pieces';
import type { RoamWorld } from './types';

/**
 * What he built, in the walk map (roam/walkmap.ts is made once from the map's
 * parts; his pieces come and go after): each piece's `solids` (pieces.ts: posts,
 * rails, a bed's frame, a jar; boxes in its frame, turned by its `yaw`) stand on
 * the ground under its middle. Laid over the world's `standAt` (his feet, the
 * dog's way-finding), `hardStandAt` and `hardClearance` (the follow camera
 * stops at them), `clearance` (the photo's lens), `groundAt` (what stands
 * there: the garden plants nowhere on one) and `woodAt` (his steps on a bed's
 * or a pen's wood sound of wood), as _gardenWalk.ts lays the trees and
 * _homeWalk.ts the doorway. Where no piece stands every answer is the world's
 * own. A piece is solid once it is a little built (`SOLID_AT`); he is never
 * shut in one he stands in (it is not a wall to feet already inside it).
 *
 * Only a floor carries his feet (`floor`: the bed, the shelter's bench: what he
 * sits on, `PIECES[id].seat`): he steps onto it. Anything else (a jar, the
 * haystack, a post, a rail, the fence) is in his way to the feet and the dog
 * however low it is, never a step he hops onto (the walker hops up 2.2 m: he
 * went over the jar and onto a post's top), unless his feet are on it already.
 * The camera's (`hardStandAt`) is left as it was: the tops are its floor.
 *
 * Cheap: a box round every piece first, then a circle per piece, then its few
 * boxes. The list is made again when `BUILT.version` changes. Nothing allocated
 * per question.
 */

/** A piece is solid from this far built (0‥1). */
const SOLID_AT = 0.05;

interface Solid {
  /** Its piece's middle and turn (cos, sin), the box's middle in the piece's frame, its half size, from the ground to its top (m). */
  px: number;
  pz: number;
  c: number;
  s: number;
  x: number;
  z: number;
  hw: number;
  hd: number;
  y0: number;
  y1: number;
  /** Feet may step onto its top (a seat: the bed, the bench). */
  floor: boolean;
  /** Round the box (m, on the map) for a quick test. */
  wx: number;
  wz: number;
  r: number;
}

/** What is left of a segment (0‥1) while `slab` narrows it. */
let t0 = 0;
let t1 = 1;

/** One axis of a box: narrows `t0‥t1` to where p → q is between lo and hi; false once nothing is left. */
function slab(p: number, q: number, lo: number, hi: number): boolean {
  const d = q - p;
  if (Math.abs(d) < 1e-9) return p > lo && p < hi;
  const u = (lo - p) / d;
  const v = (hi - p) / d;
  t0 = Math.max(t0, Math.min(u, v));
  t1 = Math.min(t1, Math.max(u, v));
  return t0 <= t1;
}

export function installBuildWalk(world: RoamWorld): void {
  const solids: Solid[] = [];
  let seen = -1;
  let x0 = 0;
  let x1 = -1;
  let z0 = 0;
  let z1 = -1;

  function refresh(): void {
    if (seen === BUILT.version) return;
    seen = BUILT.version;
    solids.length = 0;
    x0 = z0 = Infinity;
    x1 = z1 = -Infinity;
    for (const b of BUILT.list) {
      if (b.done < SOLID_AT) continue;
      const c = Math.cos(b.yaw);
      const s = Math.sin(b.yaw);
      const P = PIECES[b.id];
      // (a seat over the ground with no solid under it, as a bench: a box under the seat, so he sits on something)
      const seat = P.seat;
      const bench = seat && seat.y > 0.3 && !P.solids.some(([x, z, w, d, top]) => Math.abs(seat.x - x) < w / 2 && Math.abs(seat.z - z) < d / 2 && top >= seat.y - 0.05);
      const boxes = bench ? [...P.solids, [seat.x, seat.z, Math.min(2.8, P.w - 0.8), 0.5, seat.y] as const] : P.solids;
      for (const [x, z, w, d, top] of boxes) {
        const wx = b.x + x * c + z * s;
        const wz = b.z - x * s + z * c;
        const r = Math.hypot(w, d) / 2;
        const floor = !!seat && Math.abs(top - seat.y) < 0.1;
        solids.push({ px: b.x, pz: b.z, c, s, x, z, hw: w / 2, hd: d / 2, y0: b.y, y1: b.y + top, floor, wx, wz, r });
        x0 = Math.min(x0, wx - r);
        x1 = Math.max(x1, wx + r);
        z0 = Math.min(z0, wz - r);
        z1 = Math.max(z1, wz + r);
      }
    }
  }

  /** Is (x, z) inside the box (grown by `m`)? */
  const inside = (o: Solid, x: number, z: number, m = 0): boolean => {
    const dx = x - o.px;
    const dz = z - o.pz;
    const lx = dx * o.c - dz * o.s - o.x;
    const lz = dx * o.s + dz * o.c - o.z;
    return Math.abs(lx) < o.hw + m && Math.abs(lz) < o.hd + m;
  };

  /**
   * Feet at `y` at (x, z) with `up` of step and `h` of room: the pieces' answer over `g` (the world's). `steps`: what
   * is not a floor is a wall, not a step (the feet, the dog); else every top is ground (the camera's floor).
   */
  function stand(g: number, x: number, z: number, y: number, up: number, h: number, steps: boolean): number {
    if (Number.isNaN(g)) return g;
    refresh();
    if (!solids.length || x < x0 || x > x1 || z < z0 || z > z1) return g;
    let best = g;
    for (const o of solids) {
      if ((x - o.wx) ** 2 + (z - o.wz) ** 2 > o.r * o.r || !inside(o, x, z)) continue;
      // (a top under the feet: a floor, or one they are on already)
      if (o.y1 <= y + up && (!steps || o.floor || y >= o.y1 - 0.06)) best = Math.max(best, o.y1);
      // (a wall to a body that reaches into it; not to feet already over it or under its bottom)
      else if (y + h > o.y0 && y < o.y1) return NaN;
    }
    return best;
  }

  /** Part of the way a → b (0‥1) before it enters a piece's solid, from a; 1 if none (a box in its piece's frame: slabs). */
  function cut(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
    refresh();
    if (!solids.length || Math.max(ax, bx) < x0 || Math.min(ax, bx) > x1 || Math.max(az, bz) < z0 || Math.min(az, bz) > z1) return 1;
    let best = 1;
    for (const o of solids) {
      // (into the piece's frame, relative to the box's middle)
      const dax = ax - o.px;
      const daz = az - o.pz;
      const dbx = bx - o.px;
      const dbz = bz - o.pz;
      const alx = dax * o.c - daz * o.s - o.x;
      const alz = dax * o.s + daz * o.c - o.z;
      const blx = dbx * o.c - dbz * o.s - o.x;
      const blz = dbx * o.s + dbz * o.c - o.z;
      t0 = 0;
      t1 = 1;
      const ok = slab(alx, blx, -o.hw, o.hw) && slab(alz, blz, -o.hd, o.hd) && slab(ay, by, o.y0, o.y1);
      // (a starts inside it: not a bar, the camera comes out of it)
      if (ok && t0 > 0 && t0 < best) best = t0;
    }
    return best;
  }

  const { standAt, hardStandAt, clearance, hardClearance, groundAt, woodAt } = world;
  if (standAt) world.standAt = (x, z, y, up, h) => stand(standAt(x, z, y, up, h), x, z, y, up, h, true);
  if (hardStandAt) world.hardStandAt = (x, z, y, up, h) => stand(hardStandAt(x, z, y, up, h), x, z, y, up, h, false);
  if (clearance) world.clearance = (ax, ay, az, bx, by, bz) => Math.min(clearance(ax, ay, az, bx, by, bz), cut(ax, ay, az, bx, by, bz));
  if (hardClearance) world.hardClearance = (ax, ay, az, bx, by, bz) => Math.min(hardClearance(ax, ay, az, bx, by, bz), cut(ax, ay, az, bx, by, bz));
  world.groundAt = (x, z) => {
    const g = groundAt(x, z);
    refresh();
    if (!solids.length || x < x0 || x > x1 || z < z0 || z > z1) return g;
    let best = g;
    for (const o of solids) if (inside(o, x, z)) best = Math.max(best, o.y1);
    return best;
  };
  world.woodAt = (x, z, y) => {
    if (woodAt?.(x, z, y)) return true;
    refresh();
    if (!solids.length || x < x0 || x > x1 || z < z0 || z > z1) return false;
    for (const o of solids) if (Math.abs(y - o.y1) < 0.12 && inside(o, x, z, 0.05)) return true;
    return false;
  };
}
