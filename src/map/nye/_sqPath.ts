import { traceSource, type SourceTrace } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { Glow } from '../festival/_glow';
import type { HeightField } from '../heightfield';
import type { Lamps } from '../landmarks/_prasatKit';
import { BRIDGE, LANTERN_WALK, onSquare, SQUARE } from './plan';
import { TOP } from './_sqFloor';
import { khmerLamp, LATERITE, PAVER, PAVER_LIGHT, pick } from './_sqKit';
import { flowerBed, glazedJar, stonePlanter } from './_sqPathKit';
import { fireBowl, groundOk, onAvenue } from './_sqWalk';

/**
 * The garden paths round the festival square (AWP-35; the owner's reference: "a stone path with stone lanterns and fire
 * bowls winding in from the front", "stone pathways winding through the gardens to the plaza, the stalls' sides and the
 * river"). Each winds (a smooth curve through its points) between kerbs of laterite, its flagstones Kulen sandstone with
 * now and then a laterite one, laid in courses of two or three across, the grass showing in the joints:
 *
 * - **the front path** from the back trail (where the crowd's overhead view begins) up through the gardens to the
 *   avenue's west side by the gate, between a lamp and a flag; fire bowls and carved planters at its mouth, Khmer lamps
 *   along it, glazed jars where it reaches the avenue;
 * - **the river path** from the avenue's east side round the square's south-east outside its edge, over the picnic trail
 *   (the stones stop at its tread), down to the Kulen stream's quay and the footbridge (plan.ts `BRIDGE`, `_sqRiver.ts`);
 * - **the east bank's** few steps from the bridge to a stone bench under the trumpet tree, looking back at the square.
 *
 * Flower beds line both sides just outside the kerbs (broken at the lamps and planters); the meadow (`_sqMeadow.ts`)
 * plants shrubs behind them and keeps the garden dense within ≈ 9 m of a path. The flagstones and kerbs go into the
 * floor's builder (`fb`: kept out of the walk map, no shadow; he walks on the land under them, as on the square), the
 * lamps, bowls, planters and beds into the square's (`b`): no draw of their own. They keep off the trails' treads,
 * water, the square, the avenue, and the string-light poles' and flags' spots (`_sqGlow.ts`, `_sqFlags.ts`); each path
 * and its borders are marked built (`field.occupy`), so the vegetation's trees, palms and undergrowth keep off.
 */

type P2 = readonly [number, number];

interface PathPlan {
  name: string;
  pts: readonly P2[];
  /** Width between the kerbs (m); narrowed to 1.6 m over its first `neckStart` or last `neckEnd` m (where it meets the avenue, between a kerb lamp and a flag). */
  w: number;
  neckStart?: number;
  neckEnd?: number;
  /** Lamps every `every` m (alternating sides) from `from` to `until` m before its end; 0: none. */
  every: number;
  from: number;
  until: number;
}

export const PATHS: readonly PathPlan[] = [
  {
    name: 'front',
    pts: [
      [363.2, -225.0],
      [364.6, -228.7],
      [368.8, -231.3],
      [374.2, -231.2],
      [378.4, -232.9],
      [381.35, -233.4],
    ],
    w: 2.2,
    neckEnd: 2.4,
    every: 4.6,
    from: 7.4,
    until: 4.4,
  },
  {
    name: 'river',
    pts: [
      [386.65, -233.4],
      [390.2, -233.3],
      [395.2, -232.1],
      [400.6, -232.9],
      [405.6, -234.9],
      [410.6, -238.3],
      [415, -242.3],
      [420, -245.7],
      [424.8, -247.5],
      [BRIDGE.x0 - 1.4, BRIDGE.z],
    ],
    w: 2.0,
    neckStart: 2.4,
    every: 5.2,
    from: 5.2,
    until: 3.5,
  },
  {
    name: 'east bank',
    pts: [
      [BRIDGE.x1 + 0.6, BRIDGE.z],
      [448.4, BRIDGE.z - 0.5],
      [451.2, BRIDGE.z - 2.4],
      [452.4, BRIDGE.z - 5.2],
    ],
    w: 1.6,
    every: 0,
    from: 0,
    until: 0,
  },
];

/** A point along a path: where, its heading (unit), how far along (m). */
export interface PathPoint {
  x: number;
  z: number;
  tx: number;
  tz: number;
  s: number;
}

/** The path's middle line, smoothed (Catmull-Rom through its points), every `step` m. */
export function pathLine(pts: readonly P2[], step = 0.25): PathPoint[] {
  const out: PathPoint[] = [];
  const P = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  let s = 0;
  let prev: [number, number] | null = null;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
    const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.ceil(L / (step * 0.5)));
    for (let k = i ? 1 : 0; k <= n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      const x = cr(p0[0], p1[0], p2[0], p3[0]);
      const z = cr(p0[1], p1[1], p2[1], p3[1]);
      if (prev) s += Math.hypot(x - prev[0], z - prev[1]);
      prev = [x, z];
      out.push({ x, z, tx: 0, tz: 0, s });
    }
  }
  for (let i = 0; i < out.length; i++) {
    const a = out[Math.max(0, i - 1)];
    const b = out[Math.min(out.length - 1, i + 1)];
    const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    out[i].tx = (b.x - a.x) / L;
    out[i].tz = (b.z - a.z) / L;
  }
  // (resampled evenly along its length)
  const even: PathPoint[] = [];
  const total = out[out.length - 1].s;
  let j = 0;
  for (let d = 0; d <= total + 1e-6; d += step) {
    while (j + 1 < out.length - 1 && out[j + 1].s < d) j++;
    const a = out[j];
    const b = out[j + 1] ?? a;
    const u = b.s > a.s ? Math.min(1, Math.max(0, (d - a.s) / (b.s - a.s))) : 0;
    const tx = a.tx + (b.tx - a.tx) * u;
    const tz = a.tz + (b.tz - a.tz) * u;
    const tl = Math.hypot(tx, tz) || 1;
    even.push({ x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, tx: tx / tl, tz: tz / tl, s: d });
  }
  return even;
}

/** Every path's middle line (made once). */
export const PATH_LINES: readonly { plan: PathPlan; line: PathPoint[]; box: [number, number, number, number] }[] = PATHS.map((plan) => {
  const line = pathLine(plan.pts);
  const xs = line.map((p) => p.x);
  const zs = line.map((p) => p.z);
  return { plan, line, box: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] };
});

/** Distance (m) from (x, z) to the nearest path's middle line, less its half width (a path's box first: far ones skipped). */
export function toGardenPath(x: number, z: number): number {
  let best = Infinity;
  for (const { plan, line, box } of PATH_LINES) {
    const out = Math.hypot(Math.max(0, box[0] - x, x - box[2]), Math.max(0, box[1] - z, z - box[3])) - plan.w / 2;
    if (out > best || out > 30) continue;
    // (every fourth point, then the points round the near ones)
    for (let i = 0; i < line.length; i += 4) {
      const p = line[i];
      if (Math.hypot(p.x - x, p.z - z) - plan.w / 2 > best + 1.2) continue;
      for (let k = Math.max(0, i - 4); k < Math.min(line.length, i + 4); k++) best = Math.min(best, Math.hypot(line[k].x - x, line[k].z - z) - plan.w / 2);
    }
  }
  return best;
}

/** The width of a path at `s` m along it (narrowed to 1.6 m at a neck). */
function widthAt(plan: PathPlan, s: number, total: number): number {
  if (plan.neckEnd && s > total - plan.neckEnd) return Math.min(plan.w, 1.6 + (total - s) * 0.12);
  if (plan.neckStart && s < plan.neckStart) return Math.min(plan.w, 1.6 + s * 0.12);
  return plan.w;
}

/**
 * The string-light poles' spots (`_sqGlow.ts`: the tall poles round the square at their angles and the radii they try,
 * the walk's pole pairs before the gate), kept free: nothing solid of the paths' within `r` m of one.
 */
const POLE_TH = [-16, 18, 48, 72, 108, 132, 162, 196];
const POLE_K = [1.1, 1.16, 1.04, 1.22];
const POLE_SPOTS: P2[] = [
  // (and the flags' slim poles round the square's edge, `_sqFlags.ts`: θ 30°, 58°, 122°, 150° at 1.07)
  ...[30, 58, 122, 150].map((th): P2 => [SQUARE.x + Math.cos((th * Math.PI) / 180) * SQUARE.rx * 1.07, SQUARE.z + Math.sin((th * Math.PI) / 180) * SQUARE.rz * 1.07]),
  ...POLE_TH.flatMap((th) => POLE_K.map((k): P2 => [SQUARE.x + Math.cos((th * Math.PI) / 180) * SQUARE.rx * k, SQUARE.z + Math.sin((th * Math.PI) / 180) * SQUARE.rz * k])),
  ...[7, 15].flatMap((s) => [6.4, 7.2, 5.6, 8.2].flatMap((d): P2[] => [[LANTERN_WALK[LANTERN_WALK.length - 1][0] - d, LANTERN_WALK[LANTERN_WALK.length - 1][1] + s], [LANTERN_WALK[LANTERN_WALK.length - 1][0] + d, LANTERN_WALK[LANTERN_WALK.length - 1][1] + s]])),
];
export function poleRoom(x: number, z: number, r = 1.6): boolean {
  return !POLE_SPOTS.some(([px, pz]) => Math.hypot(px - x, pz - z) < r);
}

export interface PathsOut {
  /** Lamps, bowls and planters (map x, z). */
  lights: [number, number][];
  stones: number;
  blocks: number;
}

/**
 * Lay the paths: flagstones and kerbs into `fb`, lamps, fire bowls and planters into `b` (their flames into `lamps`,
 * halos into `glow`). Call before the meadow, which keeps its plants off them (`toGardenPath`).
 */
export function layGardenPaths(b: VoxelBuilder, fb: VoxelBuilder, field: HeightField, lamps: Lamps, glow: Glow | null, low: boolean): PathsOut {
  const src = traceSource();
  const f0 = fb.boxes.length;
  const b0 = b.boxes.length;
  const lights: [number, number][] = [];
  // (the ground as it was before the paths kept their corridors: their lamps and planters stand in them)
  const before = field.occupied.slice();
  for (const [pi, { plan, line }] of PATH_LINES.entries()) flagstones(fb, field, plan, line, pi, low, src);
  for (const [pi, { plan, line }] of PATH_LINES.entries()) furnish(b, field, plan, line, pi, lamps, glow, low, lights, before, src);
  for (const [pi, { plan, line }] of PATH_LINES.entries()) borderBeds(b, field, plan, line, pi, lights, low, src);
  return { lights, stones: fb.boxes.length - f0, blocks: b.boxes.length - b0 };
}

/** Ground a flagstone may lie on: off a trail's tread, water, the square, the avenue. */
function paveable(field: HeightField, x: number, z: number): boolean {
  const c = field.index(x, z);
  return c >= 0 && field.trail[c] !== 2 && field.waterAt(x, z) === null && !onSquare(x, z, 0.3) && !onAvenue(x, z, -0.05);
}

/** The flagstones in courses across the path, two or three a course, and the laterite kerbs along its sides. */
function flagstones(fb: VoxelBuilder, field: HeightField, plan: PathPlan, line: PathPoint[], seed: number, low: boolean, src: SourceTrace | undefined): void {
  const total = line[line.length - 1].s;
  const at = (s: number) => line[Math.max(0, Math.min(line.length - 1, Math.round(s / 0.25)))];
  let s = 0.05;
  let course = 0;
  while (s < total - 0.1) {
    const len = Math.min(total - s, (low ? 0.75 : 0.55) + 0.22 * hash3(seed, course, 1, 151));
    const p = at(s + len / 2);
    const w = widthAt(plan, s + len / 2, total) - 0.1;
    const ry = Math.atan2(p.tx, p.tz);
    // (two or three stones across, their joints not in line with the last course's)
    const k = w > 1.75 && !low ? 3 : 2;
    const cuts = [0];
    for (let i = 1; i < k; i++) cuts.push(i / k + (hash3(seed, course, 10 + i, 151) - 0.5) * 0.22);
    cuts.push(1);
    for (let i = 0; i < k; i++) {
      const a = cuts[i] * w - w / 2;
      const c = cuts[i + 1] * w - w / 2;
      const o = (a + c) / 2;
      const x = p.x - p.tz * o;
      const z = p.z + p.tx * o;
      if (!paveable(field, x, z)) continue;
      const h = hash3(seed, course * 3 + i, 2, 151);
      const tone = h < 0.14 ? pick(LATERITE, x, z, 3, 151) : h < 0.55 ? pick(PAVER, x, z, 4, 151) : pick(PAVER_LIGHT, x, z, 5, 151);
      fb.box(x, field.heightAt(x, z) + TOP - 0.06, z, c - a - 0.07, 0.12, len - 0.07, tone, 'mapStone', { src, ry: ry + (h - 0.5) * 0.06, shade: 0.9 + 0.14 * hash3(seed, course, 20 + i, 151) });
    }
    s += len;
    course++;
  }
  // The kerbs: laterite blocks along both sides, a hand high.
  const piece = low ? 1.0 : 0.62;
  for (const side of [-1, 1])
    for (let d = 0.1, i = 0; d < total - 0.2; d += piece, i++) {
      const len = Math.min(piece, total - d);
      const p = at(d + len / 2);
      const o = side * (widthAt(plan, d + len / 2, total) / 2 + 0.1);
      const x = p.x - p.tz * o;
      const z = p.z + p.tx * o;
      if (!paveable(field, x, z)) continue;
      fb.box(x, field.heightAt(x, z) + TOP + 0.01, z, 0.2, 0.18, len - 0.05, pick(LATERITE, x, z, 6, 151), 'mapStone', { src, ry: Math.atan2(p.tx, p.tz), shade: 0.88 + 0.1 * hash3(seed, i, side, 152) });
    }
  // (the path and its borders kept clear: the vegetation's trees, palms and undergrowth keep off them)
  const m = plan.w / 2 + 0.9;
  for (const p of line) if (paveable(field, p.x, p.z)) field.occupy(p.x - m, p.z - m, p.x + m, p.z + m);
}

/** The path's lamps, fire bowls and planters. */
function furnish(b: VoxelBuilder, field: HeightField, plan: PathPlan, line: PathPoint[], seed: number, lamps: Lamps, glow: Glow | null, low: boolean, lights: [number, number][], before: ArrayLike<number>, src: SourceTrace | undefined): void {
  const total = line[line.length - 1].s;
  const at = (s: number) => line[Math.max(0, Math.min(line.length - 1, Math.round(s / 0.25)))];
  // A spot beside the path at `s`, `side` (−1 left, +1 right), trying a few distances out from its edge.
  const beside = (s: number, side: number, outs: readonly number[]): [number, number] | null => {
    const p = at(s);
    for (const out of outs) {
      const o = side * (widthAt(plan, s, total) / 2 + out);
      const x = p.x - p.tz * o;
      const z = p.z + p.tx * o;
      if (!groundOk(field, x, z, before) || onSquare(x, z, 1.2) || onAvenue(x, z, 1.2) || !poleRoom(x, z)) continue;
      if (lights.some(([lx, lz]) => Math.hypot(lx - x, lz - z) < 1.2)) continue;
      if (toGardenPath(x, z) < 0.35) continue;
      return [x, z];
    }
    return null;
  };
  const place = (x: number, z: number, r: number) => {
    field.occupy(x - r, z - r, x + r, z + r);
    lights.push([x, z]);
  };
  if (plan.name === 'front') {
    // The mouth on the back trail: carved planters, then a fire bowl each side.
    for (const side of [-1, 1]) {
      const pl = beside(0.9, side, [0.75, 1.0, 1.3]);
      if (pl) {
        stonePlanter(b, pl[0], field.heightAt(pl[0], pl[1]), pl[1], 0.95, Math.atan2(at(0.9).tx, at(0.9).tz), seed * 10 + side, low, src);
        place(pl[0], pl[1], 0.6);
      }
      const fbw = beside(3.4, side, [0.7, 0.95, 1.2]);
      if (fbw) {
        fireBowl(b, field, fbw[0], fbw[1], 0.95, src, lamps, glow, low);
        lights.push(fbw);
      }
    }
    // Glazed jars where it meets the avenue.
    for (const side of [-1, 1]) {
      const j = beside(total - 3.6, side, [0.6, 0.85]);
      if (!j) continue;
      glazedJar(b, j[0], field.heightAt(j[0], j[1]), j[1], 1.05, side < 0 ? 'ti' : 'flowers', seed * 20 + side, low, src);
      place(j[0], j[1], 0.5);
    }
  }
  if (plan.name === 'river') {
    // Jars as it leaves the avenue, a fire bowl each side where it reaches the picnic trail.
    for (const side of [-1, 1]) {
      const j = beside(3.4, side, [0.6, 0.85]);
      if (j) {
        glazedJar(b, j[0], field.heightAt(j[0], j[1]), j[1], 1.0, side < 0 ? 'flowers' : 'ti', seed * 20 + side, low, src);
        place(j[0], j[1], 0.5);
      }
    }
    const cross = trailCrossing(field, line);
    if (cross !== null)
      for (const side of [-1, 1]) {
        const fbw = beside(cross - 1.6, side, [0.6, 0.9, 1.2]);
        if (!fbw) continue;
        fireBowl(b, field, fbw[0], fbw[1], 0.9, src, lamps, glow, low);
        lights.push(fbw);
      }
  }
  if (plan.name === 'east bank') {
    // The bench at its end, facing back over the stream to the square; a jar of lotus beside it.
    const p = at(total);
    const x = p.x + p.tx * 0.9;
    const z = p.z + p.tz * 0.9;
    const g = field.heightAt(x, z);
    bench(b, x, g, z, Math.PI / 2, src);
    field.occupy(x - 1, z - 1, x + 1, z + 1);
    const jx = x - p.tz * 1.6;
    const jz = z + p.tx * 1.6;
    if (groundOk(field, jx, jz, before)) glazedJar(b, jx, field.heightAt(jx, jz), jz, 0.9, 'lotus', seed * 20, low, src);
    khmerLamp(b, x + p.tz * 1.5, g, z - p.tx * 1.5, 1.05, 70 + seed, src, lamps, glow, 1.9);
    lights.push([x, z]);
  }
  if (!plan.every) return;
  // Khmer lamps along it, alternating sides (a lamp left out where no ground is fit).
  const every = low ? plan.every * 1.5 : plan.every;
  let side = plan.name === 'front' ? 1 : -1;
  for (let s = plan.from; s < total - plan.until; s += every, side = -side) {
    const spot = beside(s, side, [0.55, 0.8, 1.1]) ?? beside(s, -side, [0.55, 0.8, 1.1]);
    if (!spot) continue;
    khmerLamp(b, spot[0], field.heightAt(spot[0], spot[1]), spot[1], 1.15, 60 + seed * 13 + Math.round(s), src, lamps, glow, 2.0);
    place(spot[0], spot[1], 0.55);
  }
}

/**
 * Flower beds along both sides of a path, just outside its kerbs (in lengths of ≈ 2 m, broken where a lamp, bowl or
 * planter stands, at a trail, the square, the avenue and the poles' spots).
 */
function borderBeds(b: VoxelBuilder, field: HeightField, plan: PathPlan, line: PathPoint[], seed: number, lights: readonly [number, number][], low: boolean, src: SourceTrace | undefined): void {
  const total = line[line.length - 1].s;
  const at = (s: number) => line[Math.max(0, Math.min(line.length - 1, Math.round(s / 0.25)))];
  const W = 0.8;
  const len = 1.9;
  const ok = (x: number, z: number) => {
    const c = field.index(x, z);
    if (c < 0 || field.trail[c] !== 0 || field.waterAt(x, z) !== null || field.dropAt(x, z) > 0.6) return false;
    if (onSquare(x, z, 0.8) || onAvenue(x, z, 1.9) || !poleRoom(x, z, 1.3) || toGardenPath(x, z) < 0.25) return false;
    return !lights.some(([lx, lz]) => Math.hypot(lx - x, lz - z) < 0.95);
  };
  for (const side of [-1, 1])
    for (let s = 1.2, i = 0; s + len < total - 0.8; s += len + 0.25, i++) {
      const pts: [number, number][] = [s, s + len / 2, s + len].map((d) => {
        const p = at(d);
        const o = side * (widthAt(plan, d, total) / 2 + 0.3 + W / 2);
        return [p.x - p.tz * o, p.z + p.tx * o];
      });
      if (!pts.every(([x, z]) => ok(x, z))) continue;
      flowerBed(b, field, pts[0][0], pts[0][1], pts[2][0], pts[2][1], 900 + seed * 50 + i * 2 + (side > 0 ? 1 : 0), low, src, W);
    }
}

/** How far along a path (m) it first meets a trail's tread, or null. */
function trailCrossing(field: HeightField, line: PathPoint[]): number | null {
  for (const p of line) if (field.trail[field.index(p.x, p.z)] === 2) return p.s;
  return null;
}

/** A sandstone garden bench (a slab on two legs), its seat facing `ry`. */
function bench(b: VoxelBuilder, x: number, y: number, z: number, ry: number, src: SourceTrace | undefined): void {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  for (const u of [-0.62, 0.62]) b.box(x + c * u, y + 0.2, z - s * u, 0.22, 0.4, 0.4, pick(LATERITE, x, z, 7 + u, 153), 'mapStone', { src, ry, shade: 0.92 });
  b.box(x, y + 0.45, z, 1.7, 0.1, 0.5, pick(PAVER_LIGHT, x, z, 9, 153), 'mapStone', { src, ry, shade: 1.04 });
}

/** On a garden path or within `margin` m of its kerbs (the garden's beds keep off). */
export function onGardenPath(x: number, z: number, margin = 0): boolean {
  return toGardenPath(x, z) < margin;
}
