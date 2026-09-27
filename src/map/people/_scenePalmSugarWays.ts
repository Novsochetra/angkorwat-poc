import { HAMMOCK, HOME, HUT, PILE, RACK, RACKS, ROOF, STAIR, STALL, STALL_TABLE, STOVE, YARD } from '../hamlet/_psPlan';
import type { Point } from './_routes';

/**
 * The palm sugar family's ways round their yard (`_scenePalmSugar.ts`):
 * people walk straight from spot to spot, so a walk that would cut through
 * the shed's woven wall, the stove, the house (its veranda and stair, the
 * jars under its eave), the drying racks, the stall's table, the frond
 * stack or the firewood goes round it instead, by one or two of its corners
 * (the shortest way). Only when a walk is planned, never per frame.
 */

/** A box people keep out of (world m): x0, z0, x1, z1. */
type Box = [number, number, number, number];

const hut = (x0: number, z0: number, x1: number, z1: number): Box => [HUT.x + x0, HUT.z + z0, HUT.x + x1, HUT.z + z1];
const home = (x0: number, z0: number, x1: number, z1: number): Box => [HOME.x + x0, HOME.z + z0, HOME.x + x1, HOME.z + z1];

/** (exported for checks: scratch scripts test that nobody walks through them) */
export const BOXES: Box[] = [
  // The shed's west wall (its whole length), the stove with the chimney, the firewood and fronds north, the tube rack.
  hut(-ROOF.postX - 0.2, ROOF.rows[0] - 0.15, -ROOF.postX + 0.2, ROOF.rows[2] - 0.1),
  hut(STOVE.x - STOVE.w / 2 - 0.05, STOVE.z0 - 0.75, STOVE.x + STOVE.w / 2 + 0.05, STOVE.z1 + 0.05),
  hut(PILE.x0 - 0.2, PILE.z0 - 0.3, PILE.x1 + 0.2, PILE.z1 + 0.1),
  hut(RACK.x - 0.35, RACK.z0 - 0.15, RACK.x + 0.45, RACK.z1 + 0.15),
  // Under the house one walks between the posts: only its stair, the kre, the hammock, the hens' basket, the jars under
  // the south eave keep people out; round it the banana clump and the pots by the veranda.
  home(STAIR.x - 0.5, STAIR.z0 - 0.1, STAIR.x + 0.5, STAIR.z1 + 0.05),
  home(-1.85, -2.4, -0.3, -0.8),
  home(HAMMOCK.x - 0.3, HAMMOCK.z0 + 0.3, HAMMOCK.x + 0.3, HAMMOCK.z1 - 0.3),
  home(YARD.coop.x - 0.4, YARD.coop.z - 0.4, YARD.coop.x + 0.4, YARD.coop.z + 0.4),
  home(-2.05, YARD.jars.z - 0.45, 2.05, YARD.jars.z + 0.6),
  [YARD.banana.x - 0.5, YARD.banana.z - 0.5, YARD.banana.x + 1.4, YARD.banana.z + 1.2],
  [YARD.pots.x - 0.3, YARD.pots.z - 0.3, YARD.pots.x + 0.85, YARD.pots.z + 0.6],
  // The racks (the aisle between them open), the stall's table and ice box, the frond stack.
  ...RACKS.map((r): Box => [r.x0 - 0.1, r.z - r.w / 2 - 0.1, r.x1 + 0.1, r.z + r.w / 2 + 0.1]),
  [STALL.x + STALL_TABLE.x0 - 0.1, STALL.z + STALL_TABLE.z0 - 0.1, STALL.x + STALL_TABLE.x1 + 0.1, STALL.z + 2.15],
  [YARD.fronds.x0 - 0.2, YARD.fronds.z - 0.9, YARD.fronds.x1 + 0.2, YARD.fronds.z + 0.9],
];
/** How far round a corner the way goes (m). */
const MARGIN = 0.45;

const inside = (b: Box, x: number, z: number): boolean => x > b[0] && x < b[2] && z > b[1] && z < b[3];

/** Does the segment (ax, az)–(bx, bz) cross box b (slab test)? */
function crosses(b: Box, ax: number, az: number, bx: number, bz: number): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  for (const [p, d, lo, hi] of [
    [ax, dx, b[0], b[2]],
    [az, dz, b[1], b[3]],
  ]) {
    if (Math.abs(d) < 1e-9) {
      if (p <= lo || p >= hi) return false;
      continue;
    }
    let u0 = (lo - p) / d;
    let u1 = (hi - p) / d;
    if (u0 > u1) [u0, u1] = [u1, u0];
    t0 = Math.max(t0, u0);
    t1 = Math.min(t1, u1);
    if (t0 >= t1) return false;
  }
  return true;
}

/** The first box the leg goes through (neither end in it), or null. */
function blocker(ax: number, az: number, bx: number, bz: number): Box | null {
  for (const b of BOXES) if (!inside(b, ax, az) && !inside(b, bx, bz) && crosses(b, ax, az, bx, bz)) return b;
  return null;
}

/** The leg from A to B round what is in its way: the corner points to add between them. */
function around(ax: number, az: number, bx: number, bz: number, depth: number): [number, number][] {
  const b = blocker(ax, az, bx, bz);
  if (!b || depth > 3) return [];
  const c: [number, number][] = [
    [b[0] - MARGIN, b[1] - MARGIN],
    [b[2] + MARGIN, b[1] - MARGIN],
    [b[2] + MARGIN, b[3] + MARGIN],
    [b[0] - MARGIN, b[3] + MARGIN],
  ];
  const clear = (px: number, pz: number, qx: number, qz: number) => !crosses(b, px, pz, qx, qz);
  let best: [number, number][] | null = null;
  let bestLen = Infinity;
  const len = (pts: [number, number][]) => {
    let l = 0;
    let [px, pz] = [ax, az];
    for (const [x, z] of [...pts, [bx, bz] as [number, number]]) {
      l += Math.hypot(x - px, z - pz);
      [px, pz] = [x, z];
    }
    return l;
  };
  for (let i = 0; i < 4; i++) {
    const one: [number, number][] = [c[i]];
    if (clear(ax, az, c[i][0], c[i][1]) && clear(c[i][0], c[i][1], bx, bz) && len(one) < bestLen) {
      best = one;
      bestLen = len(one);
    }
    for (const j of [(i + 1) % 4, (i + 3) % 4]) {
      const two: [number, number][] = [c[i], c[j]];
      if (clear(ax, az, c[i][0], c[i][1]) && clear(c[j][0], c[j][1], bx, bz) && len(two) < bestLen) {
        best = two;
        bestLen = len(two);
      }
    }
  }
  if (!best) return [];
  // (the new legs may meet another box: round that too)
  const out: [number, number][] = [];
  let [px, pz] = [ax, az];
  for (const [x, z] of best) {
    out.push(...around(px, pz, x, z, depth + 1), [x, z]);
    [px, pz] = [x, z];
  }
  out.push(...around(px, pz, bx, bz, depth + 1));
  return out;
}

/** A walk from (x, z) along `path`, with the corners it needs to go round the yard's things (`pt` puts a point on the ground). */
export function psRoute(x: number, z: number, path: readonly Point[], pt: (x: number, z: number) => Point): Point[] {
  const out: Point[] = [];
  let [px, pz] = [x, z];
  for (const p of path) {
    for (const [cx, cz] of around(px, pz, p.x, p.z, 0)) out.push(pt(cx, cz));
    out.push(p);
    [px, pz] = [p.x, p.z];
  }
  return out;
}
