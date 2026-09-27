import type { Object3D } from 'three';
import { hash3 } from '../../voxel/random';
import type { HeightField, Waterfall } from '../heightfield';
import { KULEN_PICNIC } from '../layout';

/**
 * Where things stand at the Kulen picnic place (layout.ts `KULEN_PICNIC`)
 * and at the pilgrims' drinks stall by the mountain road's foot, read from
 * the land at build time (no three.js): the world pass shapes the Kulen
 * stream, its falls and the pool, so nothing here is written down in
 * metres; it is found.
 *
 * - The **fall**: the Kulen stream's lowest big fall near the picnic place
 *   (`field.falls`), and where its water lands (`plunge`, on the pool).
 * - Two **levels**: the levelled terrace round `KULEN_PICNIC` (the height
 *   field flattens it, `clearHamlets`) and the **beach** by the water below
 *   it (the same as the terrace where no step comes between); every metre of
 *   them, how far the water is and which way.
 * - The **huts** (`KnHut`): 4–6 picnic huts facing the pool, turned a little
 *   to the fall: first on the beach with their fronts out over the shallow
 *   water, then along the terrace's edge, then a row behind; clear of the
 *   picnic trail and of each other, the best ones first (the families take
 *   those).
 * - The **steps** (`KnStep`): flights of stone steps from the terrace's edge
 *   down to the beach, one near where the trail comes in, one near the
 *   children's rock.
 * - The **stall** (the grill, fruit, drinks) back from the edge, the
 *   **motos** parked by the trail, the **sign** where it comes in, the
 *   **rock** the children jump from, where they wade and go into the water
 *   (`bank`), flat **stones** from there out toward the rock, the seller's
 *   **round**.
 * - A walk grid over both levels and the steps (`terracePath`).
 * - The **drinks stall** at the mountain road's foot (`roadStall`), where
 *   pilgrims rest before and after the climb.
 *
 * `kulenSite(field)` is worked out once per field (the hamlet piece and the
 * people scene both ask for it).
 */

/** A place and the way it faces (radians: toward (sin, cos) in x, z). */
export interface KnSpot {
  x: number;
  z: number;
  yaw: number;
}

/** A picnic hut: its middle, facing (the water side is its front, +z of its frame), size, deck. */
export interface KnHut extends KnSpot {
  /** Width across its front (m, its local x) and depth (m, local z). */
  w: number;
  d: number;
  /** The level it stands on (m: the terrace or the beach) and the top of its deck (m). */
  ground: number;
  floor: number;
  /** Its front stands out over the water (posts down in the pool). */
  over: boolean;
}

/** A flight of stone steps: the top of its first step at the terrace's edge (x, z), going down toward `yaw`. */
export interface KnStep extends KnSpot {
  /** The terrace and the beach (m). */
  top: number;
  bottom: number;
  /** Steps in it, each `run` deep, `w` wide (m). */
  n: number;
  run: number;
  w: number;
}

export interface KulenSite {
  /** The fall above the pool (null: no fall found; the pool is then just the stream). */
  fall: Waterfall | null;
  /** Where its water lands (m). */
  plunge: { x: number; z: number };
  /** The pool's surface (m). */
  level: number;
  /** The terrace's ground and the beach's by the water (m; the same where no step comes between). */
  ground: number;
  beach: number;
  huts: KnHut[];
  steps: KnStep[];
  /** The food stall's middle, its counter facing its customers. */
  stall: KnSpot;
  motos: KnSpot[];
  /** The wooden sign by the trail, facing those coming in. */
  sign: KnSpot;
  /** Where the picnic trail comes to the picnic place (families come and go there). */
  entry: { x: number; z: number };
  /** The rock the children jump from (its top, m) and the water they wade in. */
  rock: { x: number; z: number; top: number; size: number };
  wade: { x: number; z: number }[];
  /** Where the children step into the water (on the land) and the water there. */
  bank: { x: number; z: number };
  bankWater: { x: number; z: number };
  /** Flat stones from the children's bank out toward their rock. */
  stones: { x: number; z: number; s: number }[];
  /** The seller's round: from the stall past the huts' land sides and back. */
  round: { x: number; z: number; hut: number }[];
}

/**
 * The built picnic place (its hamlet piece's object), set when it is built,
 * for the people's walk map (they stand on its steps and its decks): the
 * hamlet part is built before the people.
 */
export const KN_BUILT: { object: Object3D | null } = { object: null };

/** Sizes of a hut (m, true size × the people's 1.4). */
export const HUT_W = 3.4;
export const HUT_D = 3.0;
/** Deck over the ground (m). */
export const HUT_FLOOR = 0.7;
/** Huts: at most, and how far apart their middles stay (m). */
const HUTS = 5;
const HUT_GAP = 5.6;
/** Keep this far from a jungle trail's middle line (m): the tread (1 m) and a step. */
const TRAIL_KEEP = 2.2;
/** A flight of steps: each step's rise at most, its run, its width (m). */
const STEP_RISE = 0.5;
const STEP_RUN = 0.62;
const STEP_W = 1.8;

const cache = new WeakMap<HeightField, KulenSite>();

export function kulenSite(field: HeightField): KulenSite {
  let s = cache.get(field);
  if (!s) cache.set(field, (s = findSite(field)));
  return s;
}

/** Water over the land here (a pool, the stream). */
export function wetAt(f: HeightField, x: number, z: number): boolean {
  const w = f.waterAt(x, z);
  return w !== null && w > f.heightAt(x, z) + 0.05;
}

/** The jungle trails' samples near a point (within `r` m), for `trailDist`. */
function trailsNear(f: HeightField, x: number, z: number, r: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (const t of f.trails) for (const s of t.samples) if (Math.abs(s.x - x) < r && Math.abs(s.z - z) < r) out.push(s);
  return out;
}

/** Trail samples in 4 m buckets (see `trailDist`). */
type TrailBuckets = Map<number, { x: number; z: number }[]>;

function bucketTrails(near: readonly { x: number; z: number }[]): TrailBuckets {
  const b: TrailBuckets = new Map();
  for (const s of near) {
    const key = Math.floor(s.x / 4) * 4096 + Math.floor(s.z / 4);
    let list = b.get(key);
    if (!list) b.set(key, (list = []));
    list.push(s);
  }
  return b;
}

/** Distance (m) from (x, z) to the nearest trail sample within 8 m (else 8). */
function trailDist(near: TrailBuckets, x: number, z: number): number {
  let d = 64;
  const bi = Math.floor(x / 4);
  const bk = Math.floor(z / 4);
  for (let k = bk - 2; k <= bk + 2; k++)
    for (let i = bi - 2; i <= bi + 2; i++) {
      const list = near.get(i * 4096 + k);
      if (!list) continue;
      for (const s of list) {
        const q = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z);
        if (q < d) d = q;
      }
    }
  return Math.sqrt(d);
}

/** Is (x, z) inside the box of a frame (x, z, yaw) from (a0, b0) to (a1, b1) in its local x, z, with a margin? */
function inBox(x: number, z: number, s: KnSpot, a0: number, a1: number, b0: number, b1: number, m: number): boolean {
  const dx = x - s.x;
  const dz = z - s.z;
  const c = Math.cos(s.yaw);
  const sn = Math.sin(s.yaw);
  const lx = dx * c - dz * sn;
  const lz = dx * sn + dz * c;
  return lx > a0 - m && lx < a1 + m && lz > b0 - m && lz < b1 + m;
}

/** Is (x, z) on a flight of steps (its footprint, from the terrace's edge to the beach)? */
export function onSteps(steps: readonly KnStep[], x: number, z: number, margin = 0): boolean {
  for (const s of steps) if (inBox(x, z, s, -s.w / 2, s.w / 2, 0, s.n * s.run, margin)) return true;
  return false;
}

function findSite(f: HeightField): KulenSite {
  const P = KULEN_PICNIC;
  const ground = f.heightAt(P.x, P.z);
  const near = bucketTrails(trailsNear(f, P.x, P.z, P.r + 34));

  // ── The fall and where it lands ──────────────────────────────────────────
  let fall: Waterfall | null = null;
  let best = Infinity;
  for (const fl of f.falls) {
    if (fl.river !== 'Kulen stream' || fl.top - fl.bottom < 3) continue;
    const d = Math.hypot(fl.x + fl.dir[0] * 3 - P.x, fl.z + fl.dir[1] * 3 - P.z);
    if (d > P.r + 34) continue;
    // (the lowest one near: the big fall over the pool, not one higher up the mountain)
    const score = fl.bottom + d * 0.25;
    if (score < best) [best, fall] = [score, fl];
  }
  let plunge = { x: P.x + 12, z: P.z };
  let level = ground - 1;
  if (fall) {
    // Down the flow from the lip to the first water at the fall's foot.
    plunge = { x: fall.x + fall.dir[0] * 3, z: fall.z + fall.dir[1] * 3 };
    for (let t = 1; t < 14; t += 0.5) {
      const x = fall.x + fall.dir[0] * t;
      const z = fall.z + fall.dir[1] * t;
      const w = f.waterAt(x, z);
      if (w !== null && w <= fall.bottom + 0.6 && wetAt(f, x, z)) {
        plunge = { x: x + fall.dir[0] * 1.5, z: z + fall.dir[1] * 1.5 };
        break;
      }
    }
    level = f.waterAt(plunge.x, plunge.z) ?? fall.bottom;
  } else {
    // (no fall: the nearest water)
    let bd = Infinity;
    for (let dz = -P.r - 10; dz <= P.r + 10; dz += 2)
      for (let dx = -P.r - 10; dx <= P.r + 10; dx += 2) {
        const x = P.x + dx;
        const z = P.z + dz;
        if (!wetAt(f, x, z)) continue;
        const d = Math.hypot(dx, dz);
        if (d < bd) [bd, plunge, level] = [d, { x, z }, f.waterAt(x, z)!];
      }
  }

  // ── The water, the beach by it, every metre of both levels ───────────────
  const R = P.r + 1;
  const W = R + 14;
  const water: { x: number; z: number }[] = [];
  for (let z = P.z - W; z <= P.z + W; z += 1)
    for (let x = P.x - W; x <= P.x + W; x += 1) if (wetAt(f, x + 0.5, z + 0.5) && Math.abs((f.waterAt(x + 0.5, z + 0.5) ?? 0) - level) < 1.5) water.push({ x: x + 0.5, z: z + 0.5 });
  // (the water in 4 m buckets: a question looks only in the buckets within its reach)
  const buckets = new Map<number, { x: number; z: number }[]>();
  const bkey = (i: number, k: number) => i * 4096 + k;
  for (const w of water) {
    const key = bkey(Math.floor(w.x / 4), Math.floor(w.z / 4));
    let list = buckets.get(key);
    if (!list) buckets.set(key, (list = []));
    list.push(w);
  }
  const waterDist = (x: number, z: number, reach = 40): { d: number; wx: number; wz: number } => {
    let d = reach;
    let wx = 0;
    let wz = 1;
    const r = Math.ceil(reach / 4);
    const bi = Math.floor(x / 4);
    const bk = Math.floor(z / 4);
    for (let k = bk - r; k <= bk + r; k++)
      for (let i = bi - r; i <= bi + r; i++) {
        const list = buckets.get(bkey(i, k));
        if (!list) continue;
        for (const w of list) {
          const q = Math.hypot(w.x - x, w.z - z);
          if (q < d) [d, wx, wz] = [q, (w.x - x) / (q || 1), (w.z - z) / (q || 1)];
        }
      }
    return { d, wx, wz };
  };
  // The beach: the land most common within a few metres of the water on the terrace's side (lower than the terrace).
  const counts = new Map<number, number>();
  for (let z = P.z - W; z <= P.z + W; z += 1)
    for (let x = P.x - W; x <= P.x + W; x += 1) {
      if (wetAt(f, x, z) || Math.hypot(x - P.x, z - P.z) > R + 12) continue;
      const h = f.heightAt(x, z);
      if (h > ground + 0.3 || h < level - 0.1 || waterDist(x, z, 3.2).d >= 3.2) continue;
      const k = Math.round(h * 2) / 2;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  let beach = ground;
  let most = 0;
  for (const [h, n] of counts) if (n > most) [most, beach] = [n, h];
  const two = beach < ground - 0.6;
  const onTerrace = (x: number, z: number) => !wetAt(f, x, z) && Math.abs(f.heightAt(x, z) - ground) <= 0.6 && Math.hypot(x - P.x, z - P.z) <= R + 2;
  const onBeach = (x: number, z: number) => two && !wetAt(f, x, z) && Math.abs(f.heightAt(x, z) - beach) <= 0.6 && Math.hypot(x - P.x, z - P.z) <= R + 12;
  /** The level of the land here (the terrace, the beach), or NaN (neither: a slope, the water, too far). */
  const levelOf = (x: number, z: number) => (onTerrace(x, z) ? ground : onBeach(x, z) ? beach : NaN);

  interface Cell {
    x: number;
    z: number;
    /** Its level, the water's distance (m) and the way to it (unit). */
    lv: number;
    wd: number;
    wx: number;
    wz: number;
  }
  const cells: Cell[] = [];
  for (let z = P.z - R - 12; z <= P.z + R + 12; z += 1)
    for (let x = P.x - R - 12; x <= P.x + R + 12; x += 1) {
      const lv = levelOf(x, z);
      if (Number.isNaN(lv)) continue;
      const w = waterDist(x, z, 16);
      // (beach cells only near the water: the beach is the strip by it)
      if (lv === beach && two && w.d > 7) continue;
      cells.push({ x, z, lv, wd: w.d, wx: w.wx, wz: w.wz });
    }

  // ── Huts: on the beach over the water, along the terrace's edge, a row behind ─
  /** A hut's corner points (m) for a middle, facing and size, and its front's middle. */
  const corners = (x: number, z: number, yaw: number, w: number, d: number): [number, number, boolean][] => {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const out: [number, number, boolean][] = [];
    for (const [lx, lz] of [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [0, -d / 2],
      [0, 0],
      [-w / 2, d / 2],
      [w / 2, d / 2],
      [0, d / 2],
    ])
      out.push([x + lx * c + lz * s, z - lx * s + lz * c, lz > 0.1]);
    return out;
  };
  const huts: KnHut[] = [];
  const PASSES = [
    // (on the beach, the fronts out over the shallow water)
    { level: beach, reach: 2.6, keep: TRAIL_KEEP, gap: HUT_GAP, beachOnly: true },
    // (along the terrace's edge; a little back; a row behind)
    { level: ground, reach: two ? 10 : 4.5, keep: TRAIL_KEEP, gap: HUT_GAP, beachOnly: false },
    { level: ground, reach: two ? 14 : 9, keep: TRAIL_KEEP - 0.6, gap: HUT_GAP, beachOnly: false },
    { level: ground, reach: 18, keep: TRAIL_KEEP - 0.8, gap: HUT_GAP - 0.6, beachOnly: false },
  ];
  const pick = (pass: (typeof PASSES)[number]) => {
    let top: { h: KnHut; score: number } | null = null;
    for (const c of cells) {
      if (c.lv !== pass.level || c.wd > pass.reach || c.wd < 1.2) continue;
      if (pass.beachOnly && !two) continue;
      // Facing the water, turned a little toward where the fall comes down.
      const tp = Math.atan2(plunge.x - c.x, plunge.z - c.z);
      const tw = Math.atan2(c.wx, c.wz);
      let dy = tp - tw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const yaw = tw + Math.max(-0.5, Math.min(0.5, dy * 0.45));
      // (its middle a little back from the water's edge: the front over the bank or the shallows)
      const back = pass.beachOnly ? Math.max(0, HUT_D / 2 - c.wd + 0.9) : 0;
      const x = c.x - Math.sin(yaw) * back;
      const z = c.z - Math.cos(yaw) * back;
      const dp = Math.hypot(plunge.x - x, plunge.z - z);
      if (dp < 7) continue;
      if (huts.some((h) => Math.hypot(h.x - x, h.z - z) < pass.gap)) continue;
      let ok = true;
      let over = false;
      for (const [px, pz, front] of corners(x, z, yaw, HUT_W + 0.4, HUT_D + 0.2)) {
        if (trailDist(near, px, pz) < pass.keep) ok = false;
        if (Math.abs(levelOf(px, pz) - pass.level) < 0.1) continue;
        // (the front may stand over shallow water; nothing else)
        if (front && wetAt(f, px, pz) && (f.waterAt(px, pz) ?? 0) - f.heightAt(px, pz) < 1.4) over = true;
        else ok = false;
      }
      if (!ok) continue;
      const score = -Math.abs(c.wd - (pass.beachOnly ? 1.4 : 2)) * 1.2 - Math.abs(dp - 12) * 0.12 + (over ? 0.8 : 0) + hash3(c.x, c.z, 7, 41) * 0.3;
      if (!top || score > top.score) top = { h: { x, z, yaw, w: HUT_W, d: HUT_D, ground: pass.level, floor: pass.level + HUT_FLOOR, over }, score };
    }
    if (top) huts.push(top.h);
    return !!top;
  };
  for (const pass of PASSES) while (huts.length < (pass.beachOnly ? 2 : HUTS) && pick(pass));
  // (the best first: nearest the water with the fall in view; the families take those)
  huts.sort((a, b) => Math.hypot(a.x - plunge.x, a.z - plunge.z) - Math.hypot(b.x - plunge.x, b.z - plunge.z));
  const clearOfHuts = (x: number, z: number, room: number) => huts.every((h) => !inBox(x, z, h, -h.w / 2, h.w / 2, -h.d / 2, h.d / 2, room));

  // ── Where the trail comes in ─────────────────────────────────────────────
  const trail = f.trails.find((t) => t.name === 'picnic trail');
  let entry = { x: P.x - P.r * 0.7, z: P.z + P.r * 0.7 };
  if (trail) {
    // (the last sample of it on either level, from its far end)
    for (const s of trail.samples)
      if (Math.hypot(s.x - P.x, s.z - P.z) <= R + 12 && !Number.isNaN(levelOf(s.x, s.z))) {
        entry = { x: s.x, z: s.z };
        break;
      }
  }
  const tdir = trailDir(f, entry.x, entry.z);

  // ── Steps from the terrace's edge down to the beach ─────────────────────
  const steps: KnStep[] = [];
  if (two) {
    const drop = ground - beach;
    const n = Math.max(2, Math.ceil(drop / STEP_RISE) - 1);
    const len = n * STEP_RUN;
    // Every edge of the terrace: a terrace metre with the beach a metre or two below it toward the water.
    const edges: KnStep[] = [];
    for (const c of cells) {
      if (c.lv !== ground) continue;
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        // (down toward the water: the beach within two metres, its steps' whole footprint on the beach)
        if (dx * c.wx + dz * c.wz < 0.3) continue;
        let edge = -1;
        for (let k = 0.5; k <= 2; k += 0.5) if (onBeach(c.x + dx * k, c.z + dz * k)) {
          edge = k - 0.5;
          break;
        }
        if (edge < 0) continue;
        const x = c.x + dx * (edge + 0.3);
        const z = c.z + dz * (edge + 0.3);
        const s: KnStep = { x, z, yaw: Math.atan2(dx, dz), top: ground, bottom: beach, n, run: STEP_RUN, w: STEP_W };
        let ok = true;
        for (let u = 0.3; u <= len + 0.9 && ok; u += 0.3)
          for (const a of [-STEP_W / 2, 0, STEP_W / 2]) {
            const px = x + dx * u + dz * a;
            const pz = z + dz * u - dx * a;
            if (!onBeach(px, pz) || !clearOfHuts(px, pz, 0.8)) ok = false;
          }
        if (ok) edges.push(s);
      }
    }
    // One near where the trail comes in (the families), one near the children's way to the water.
    const byEntry = edges.slice().sort((a, b) => Math.hypot(a.x - entry.x, a.z - entry.z) - Math.hypot(b.x - entry.x, b.z - entry.z))[0];
    if (byEntry) steps.push(byEntry);
    const byMiddle = edges
      .filter((s) => !steps.some((q) => Math.hypot(q.x - s.x, q.z - s.z) < 8))
      .sort((a, b) => Math.hypot(a.x - plunge.x, a.z - plunge.z) - Math.hypot(b.x - plunge.x, b.z - plunge.z))[0];
    if (byMiddle) steps.push(byMiddle);
  }

  // ── The stall: on the terrace, back from the edge, near the way in ──────
  const inWay = (x: number, z: number) => onSteps(steps, x, z, 1.2);
  let stall: KnSpot = { x: P.x - 4, z: P.z, yaw: 0 };
  {
    const goal = steps[0] ?? entry;
    let top = -Infinity;
    for (const c of cells) {
      if (c.lv !== ground || !clearOfHuts(c.x, c.z, 3.4) || inWay(c.x, c.z) || trailDist(near, c.x, c.z) < 3.4) continue;
      if (!onTerrace(c.x + 2.5, c.z) || !onTerrace(c.x - 2.5, c.z) || !onTerrace(c.x, c.z + 2.5) || !onTerrace(c.x, c.z - 2.5)) continue;
      if (steps.some((s) => Math.hypot(s.x - c.x, s.z - c.z) < 4.5)) continue;
      const de = Math.hypot(c.x - goal.x, c.z - goal.z);
      const score = -Math.abs(de - 7) * 0.6 - Math.abs(c.wd - (two ? 9 : 7)) * 0.3 + hash3(c.x, c.z, 3, 43) * 0.2;
      if (score > top) {
        top = score;
        // (its counter toward the water and the huts: where its customers are)
        stall = { x: c.x, z: c.z, yaw: Math.atan2(c.wx, c.wz) };
      }
    }
  }

  // ── Motos by the trail just outside, the sign where it comes in ─────────
  const motos: KnSpot[] = [];
  const sideways = (x: number, z: number, dx: number, dz: number, side: number) => ({ x: x - dz * side, z: z + dx * side });
  {
    // By where the trail comes in, on its level, off the tread, side by side, their noses toward the trail.
    const entryY = f.heightAt(entry.x, entry.z);
    const spots: { x: number; z: number; d: number }[] = [];
    for (let dz = -8; dz <= 8; dz += 1)
      for (let dx = -8; dx <= 8; dx += 1) {
        const x = entry.x + dx;
        const z = entry.z + dz;
        const d = Math.hypot(dx, dz);
        if (d < 2.5 || d > 8.5 || wetAt(f, x, z) || Math.abs(f.heightAt(x, z) - entryY) > 0.3) continue;
        if (Math.abs(f.heightAt(x + 1, z) - entryY) > 0.3 || Math.abs(f.heightAt(x - 1, z) - entryY) > 0.3 || Math.abs(f.heightAt(x, z + 1) - entryY) > 0.3 || Math.abs(f.heightAt(x, z - 1) - entryY) > 0.3) continue;
        if (trailDist(near, x, z) < 1.7 || !clearOfHuts(x, z, 1.5) || inWay(x, z) || waterDist(x, z, 3).d < 1.5) continue;
        spots.push({ x, z, d });
      }
    spots.sort((a, b) => a.d - b.d);
    for (const p of spots) {
      if (motos.length >= 4) break;
      if (motos.some((m) => Math.hypot(m.x - p.x, m.z - p.z) < 1.8)) continue;
      motos.push({ x: p.x, z: p.z, yaw: Math.atan2(entry.x - p.x, entry.z - p.z) });
    }
  }
  // (beside the trail a step before it comes in, on dry level ground, its board toward those coming)
  let sign: KnSpot = { x: entry.x - tdir[0] * 2, z: entry.z - tdir[1] * 2, yaw: Math.atan2(-tdir[0], -tdir[1]) };
  for (const side of [1, -1, 1.6, -1.6]) {
    const p = sideways(entry.x - tdir[0] * 1.5, entry.z - tdir[1] * 1.5, tdir[0], tdir[1], side * 1.9);
    if (wetAt(f, p.x, p.z) || Number.isNaN(levelOf(p.x, p.z)) || !clearOfHuts(p.x, p.z, 1) || inWay(p.x, p.z) || motos.some((m) => Math.hypot(m.x - p.x, m.z - p.z) < 1.5)) continue;
    sign = { x: p.x, z: p.z, yaw: Math.atan2(-tdir[0], -tdir[1]) };
    break;
  }

  // ── The children's rock and the water they wade in ───────────────────────
  // A boulder in the pool a couple of metres out from the land nearest the huts, well off the fall; the wading spots round it.
  const shore = cells.filter((c) => c.lv === (two ? beach : ground));
  let rock = { x: plunge.x, z: plunge.z, top: level + 1, size: 1.9 };
  {
    let top = -Infinity;
    for (const w of water) {
      const dp = Math.hypot(w.x - plunge.x, w.z - plunge.z);
      if (dp < 7 || dp > 16) continue;
      let dt = 99;
      for (const c of shore) dt = Math.min(dt, Math.hypot(c.x - w.x, c.z - w.z));
      if (dt > 3.5 || dt < 1.4) continue;
      const depth = (f.waterAt(w.x, w.z) ?? level) - f.heightAt(w.x, w.z);
      if (depth < 0.35 || trailDist(near, w.x, w.z) < 2.5 || !clearOfHuts(w.x, w.z, 1.8)) continue;
      const nearHut = huts.length ? Math.min(...huts.map((h) => Math.hypot(h.x - w.x, h.z - w.z))) : 10;
      const score = -Math.abs(dt - 2.2) - Math.abs(dp - 10) * 0.25 - Math.abs(nearHut - 6) * 0.15 + hash3(w.x * 2, w.z * 2, 5, 44) * 0.2;
      if (score > top) {
        top = score;
        rock = { x: w.x, z: w.z, top: level + 1.0, size: 1.9 };
      }
    }
  }
  const wade: { x: number; z: number }[] = [];
  for (const w of water) {
    if (wade.length >= 6) break;
    const d = Math.hypot(w.x - rock.x, w.z - rock.z);
    if (d < 2.4 || d > 6 || Math.hypot(w.x - plunge.x, w.z - plunge.z) < 6) continue;
    const depth = (f.waterAt(w.x, w.z) ?? level) - f.heightAt(w.x, w.z);
    if (depth < 0.35 || !clearOfHuts(w.x, w.z, 1.2)) continue;
    if (wade.some((q) => Math.hypot(q.x - w.x, q.z - w.z) < 1.8)) continue;
    wade.push({ x: w.x, z: w.z });
  }
  if (!wade.length) wade.push({ x: rock.x + 2.5, z: rock.z }, { x: rock.x, z: rock.z + 2.5 });
  // Where they go in: the shore nearest the rock (clear of the huts and the steps), and the water by it.
  let bank = { x: rock.x, z: rock.z };
  {
    let bd = Infinity;
    for (const c of shore) {
      if (!clearOfHuts(c.x, c.z, 0.6) || onSteps(steps, c.x, c.z, 0.2) || c.wd > 2.2) continue;
      const d = Math.hypot(c.x - rock.x, c.z - rock.z);
      if (d < bd) [bd, bank] = [d, { x: c.x, z: c.z }];
    }
  }
  let bankWater = wade[0];
  {
    let bd = Infinity;
    for (const w of water) {
      const d = Math.hypot(w.x - bank.x, w.z - bank.z);
      const depth = (f.waterAt(w.x, w.z) ?? level) - f.heightAt(w.x, w.z);
      if (d < bd && d > 0.9 && depth > 0.3) [bd, bankWater] = [d, w];
    }
  }

  // ── Stepping stones from the children's bank out toward their rock ─────
  const stones: { x: number; z: number; s: number }[] = [];
  {
    const dx = rock.x - bankWater.x;
    const dz = rock.z - bankWater.z;
    const l = Math.hypot(dx, dz);
    for (let u = 0; u < l - rock.size / 2 - 0.8; u += 1.1) {
      const x = bankWater.x + (dx / l) * u + (hash3(u * 10, 1, 2, 45) - 0.5) * 0.3;
      const z = bankWater.z + (dz / l) * u + (hash3(u * 10, 3, 4, 45) - 0.5) * 0.3;
      if (!wetAt(f, x, z) || !clearOfHuts(x, z, 0.5)) continue;
      stones.push({ x, z, s: 0.75 + 0.3 * hash3(u * 10, 5, 6, 46) });
    }
  }

  // ── The seller's round: the land side of each hut, from the stall and back ─
  const round: { x: number; z: number; hut: number }[] = [{ x: stall.x + Math.sin(stall.yaw) * 1.8, z: stall.z + Math.cos(stall.yaw) * 1.8, hut: -1 }];
  const order = huts.map((h, i) => ({ h, i, a: Math.atan2(h.x - P.x, h.z - P.z) })).sort((p, q) => p.a - q.a);
  for (const { h, i } of order) {
    // (behind the hut, a step off its back edge, where she holds up her basket)
    const x = h.x - Math.sin(h.yaw) * (h.d / 2 + 0.9);
    const z = h.z - Math.cos(h.yaw) * (h.d / 2 + 0.9);
    if (Math.abs(levelOf(x, z) - h.ground) < 0.1) round.push({ x, z, hut: i });
  }

  return { fall, plunge, level, ground, beach, huts, steps, stall, motos, sign, entry, rock, wade, bank, bankWater, stones, round };
}

/** The way a jungle trail runs at (x, z) (unit x, z, toward its end), from its samples. */
function trailDir(f: HeightField, x: number, z: number): [number, number] {
  let bt = -1;
  let bi = 0;
  let bd = Infinity;
  f.trails.forEach((t, ti) =>
    t.samples.forEach((s, i) => {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bd) [bd, bt, bi] = [d, ti, i];
    }),
  );
  if (bt < 0) return [0, -1];
  const ss = f.trails[bt].samples;
  const a = ss[Math.max(0, bi - 2)];
  const b = ss[Math.min(ss.length - 1, bi + 2)];
  const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return [(b.x - a.x) / l, (b.z - a.z) / l];
}

// ── The drinks stall at the mountain road's foot ─────────────────────────────

/** The pilgrims' drinks stall by the mountain road (its counter toward the road), and the road point before it. */
export interface RoadStall extends KnSpot {
  ground: number;
  /** On the road in front of it (m): where pilgrims step off to rest. */
  road: { x: number; z: number };
}

const roadCache = new WeakMap<HeightField, RoadStall | null>();

/** Near here the mountain road starts to climb (layout.ts `PATHS`, 'garden and mountain road'). */
const ROAD_FOOT = { x: 320, z: -300 };

export function roadStall(field: HeightField): RoadStall | null {
  if (!roadCache.has(field)) roadCache.set(field, findRoadStall(field));
  return roadCache.get(field)!;
}

function findRoadStall(f: HeightField): RoadStall | null {
  const road = f.paths.find((p) => p.name === 'garden and mountain road');
  if (!road) return null;
  const ss = road.samples;
  // The road as it is built climbs at most a metre a metre (road/line.ts: a long stair raised over the
  // land where the mountain is steeper): its height, from its top down, is the land or the stair coming down.
  const h = new Float32Array(ss.length);
  h[ss.length - 1] = ss[ss.length - 1].y;
  for (let i = ss.length - 2; i >= 0; i--) h[i] = Math.max(ss[i].y, h[i + 1] - Math.hypot(ss[i + 1].x - ss[i].x, ss[i + 1].z - ss[i].z));
  let i0 = 0;
  let bd = Infinity;
  ss.forEach((s, i) => {
    const d = Math.hypot(s.x - ROAD_FOOT.x, s.z - ROAD_FOOT.z);
    if (d < bd) [bd, i0] = [d, i];
  });
  // Down from there to where the stair's first step meets the land (the climb's foot), and a few metres on.
  let foot = i0;
  while (foot > 0 && h[foot] > ss[foot].y + 0.3) foot--;
  for (let k = Math.max(1, foot - 3); k > Math.max(1, foot - 30); k--) {
    const s = ss[k];
    if (h[k] > s.y + 0.3) continue;
    const a = ss[k - 1];
    const b = ss[Math.min(ss.length - 1, k + 1)];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const tx = (b.x - a.x) / l;
    const tz = (b.z - a.z) / l;
    for (const side of [-1, 1]) {
      const x = s.x - tz * side * 5.2;
      const z = s.z + tx * side * 5.2;
      const g = f.heightAt(x, z);
      let flat = !wetAt(f, x, z) && Math.abs(g - s.y) < 0.7;
      for (const [ox, oz] of [
        [2, 0],
        [-2, 0],
        [0, 2],
        [0, -2],
      ])
        if (wetAt(f, x + ox, z + oz) || Math.abs(f.heightAt(x + ox, z + oz) - g) > 0.1) flat = false;
      if (!flat) continue;
      // (its counter toward the road)
      return { x, z, yaw: Math.atan2(s.x - x, s.z - z), ground: g, road: { x: s.x, z: s.z } };
    }
  }
  return null;
}

// ── Walking on the terrace, the beach and the steps between ─────────────────

/** Grid step of the walk grid (m), and how far round the picnic place's middle it reaches (m). */
const WALK_STEP = 0.5;
const WALK_REACH = KULEN_PICNIC.r + 16;

/**
 * Where people may walk (not in the huts, the stall, the water or up a
 * bank), made once per site: each cell's level (0 the beach, 1 the terrace,
 * 0.5 the steps between), −1 where they may not; the walks found on it.
 */
interface WalkGrid {
  x0: number;
  z0: number;
  n: number;
  lv: Float32Array;
  paths: Map<string, { x: number; z: number }[]>;
}
const walkCache = new WeakMap<KulenSite, WalkGrid>();

function walkGrid(site: KulenSite, f: HeightField): WalkGrid {
  let g = walkCache.get(site);
  if (g) return g;
  const P = KULEN_PICNIC;
  const n = Math.ceil((2 * WALK_REACH) / WALK_STEP);
  const x0 = P.x - WALK_REACH;
  const z0 = P.z - WALK_REACH;
  const lv = new Float32Array(n * n).fill(-1);
  const two = site.beach < site.ground - 0.6;
  for (let k = 0; k < n; k++)
    for (let i = 0; i < n; i++) {
      const x = x0 + (i + 0.5) * WALK_STEP;
      const z = z0 + (k + 0.5) * WALK_STEP;
      if (wetAt(f, x, z)) continue;
      if (site.huts.some((h) => inBox(x, z, h, -h.w / 2, h.w / 2, -h.d / 2, h.d / 2, 0.45))) continue;
      // (the stall: counter, grill, cooler and crates; its table and stools in front)
      if (inBox(x, z, site.stall, -2.1, 3.3, -1.5, 1.4, 0.3) || inBox(x, z, site.stall, -1.9, 1.1, 1.8, 3.8, 0.1)) continue;
      if (Math.hypot(x - site.rock.x, z - site.rock.z) < site.rock.size / 2 + 0.4) continue;
      if (Math.hypot(x - site.sign.x, z - site.sign.z) < 1.2) continue;
      const h = f.heightAt(x, z);
      if (onSteps(site.steps, x, z)) lv[i + k * n] = 0.5;
      else if (Math.abs(h - site.ground) <= 0.6) lv[i + k * n] = 1;
      else if (two && Math.abs(h - site.beach) <= 0.6) {
        // (on the beach, half a metre off the foot of the terrace's side: people keep clear of the wall)
        let wall = false;
        for (const [ox, oz] of [
          [0.6, 0],
          [-0.6, 0],
          [0, 0.6],
          [0, -0.6],
        ])
          if (f.heightAt(x + ox, z + oz) > site.beach + 1 && !onSteps(site.steps, x + ox, z + oz)) wall = true;
        if (!wall) lv[i + k * n] = 0;
      }
    }
  g = { x0, z0, n, lv, paths: new Map() };
  walkCache.set(site, g);
  return g;
}

/**
 * A walk from `a` to `b` (m) round the huts and the stall, up and down the
 * steps between the terrace and the beach: the shortest way over the walk
 * grid, straightened (points only where it turns). Ends off the grid (in the
 * water, by a moto) are walked to straight from the nearest free point.
 */
export function terracePath(site: KulenSite, f: HeightField, a: { x: number; z: number }, b: { x: number; z: number }): { x: number; z: number }[] {
  const g = walkGrid(site, f);
  // (the same few walks come again and again: from a moto to a hut, a hut to the pool, round the seller's round)
  const key = `${Math.round(a.x * 4)},${Math.round(a.z * 4)}>${Math.round(b.x * 4)},${Math.round(b.z * 4)}`;
  const known = g.paths.get(key);
  if (known) return known;
  const path = findPath(g, a, b);
  g.paths.set(key, path);
  return path;
}

function findPath(g: WalkGrid, a: { x: number; z: number }, b: { x: number; z: number }): { x: number; z: number }[] {
  const { n, lv, x0, z0 } = g;
  const cell = (p: { x: number; z: number }) => {
    const i = Math.floor((p.x - x0) / WALK_STEP);
    const k = Math.floor((p.z - z0) / WALK_STEP);
    return i >= 0 && k >= 0 && i < n && k < n ? i + k * n : -1;
  };
  /** The free cell nearest a point (within 4 m). */
  const nearestFree = (p: { x: number; z: number }) => {
    const c = cell(p);
    if (c >= 0 && lv[c] >= 0) return c;
    let best = -1;
    let bd = Infinity;
    const r = Math.ceil(4 / WALK_STEP);
    const ci = Math.floor((p.x - x0) / WALK_STEP);
    const ck = Math.floor((p.z - z0) / WALK_STEP);
    for (let k = Math.max(0, ck - r); k <= Math.min(n - 1, ck + r); k++)
      for (let i = Math.max(0, ci - r); i <= Math.min(n - 1, ci + r); i++) {
        if (lv[i + k * n] < 0) continue;
        const d = (i - ci) ** 2 + (k - ck) ** 2;
        if (d < bd) [bd, best] = [d, i + k * n];
      }
    return best;
  };
  const s0 = nearestFree(a);
  const s1 = nearestFree(b);
  if (s0 < 0 || s1 < 0) return [a, b];
  // A* over the grid (8 neighbours, a binary heap; from one level to the other only by the steps).
  const dist = new Float32Array(n * n).fill(Infinity);
  const prev = new Int32Array(n * n).fill(-1);
  const done = new Uint8Array(n * n);
  const ti = s1 % n;
  const tk = (s1 - ti) / n;
  const guess = (c: number) => {
    const i = c % n;
    return Math.hypot(i - ti, (c - i) / n - tk);
  };
  const heap: [number, number][] = [];
  const push = (d: number, v: number) => {
    heap.push([d, v]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p][0] <= heap[k][0]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = (): number => {
    const top = heap[0][1];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  /** May one step go from cell v to w (both free, one level to the next only by the steps)? */
  const joins = (v: number, w: number) => lv[w] >= 0 && Math.abs(lv[w] - lv[v]) <= 0.5;
  dist[s0] = 0;
  push(guess(s0), s0);
  while (heap.length) {
    const v = pop();
    if (done[v]) continue;
    done[v] = 1;
    if (v === s1) break;
    const vi = v % n;
    const vk = (v - vi) / n;
    for (let dk = -1; dk <= 1; dk++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dk) continue;
        const i = vi + di;
        const k = vk + dk;
        if (i < 0 || k < 0 || i >= n || k >= n) continue;
        const w = i + k * n;
        // (no corner cutting past a cell they may not step on)
        if (done[w] || !joins(v, w) || (di && dk && (!joins(v, vi + di + vk * n) || !joins(v, vi + (vk + dk) * n)))) continue;
        const d = dist[v] + (di && dk ? Math.SQRT2 : 1);
        if (d < dist[w]) {
          dist[w] = d;
          prev[w] = v;
          push(d + guess(w), w);
        }
      }
  }
  if (prev[s1] < 0 && s1 !== s0) return [a, b];
  const cells: number[] = [];
  for (let v = s1; v >= 0; v = prev[v]) {
    cells.push(v);
    if (v === s0) break;
  }
  cells.reverse();
  const pt = (c: number) => ({ x: x0 + ((c % n) + 0.5) * WALK_STEP, z: z0 + (Math.floor(c / n) + 0.5) * WALK_STEP });
  /** A straight walk between two points stays on cells they may step on, one level to the next only by the steps. */
  const clear = (p: { x: number; z: number }, q: { x: number; z: number }) => {
    const steps = Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / (WALK_STEP * 0.5));
    let last = cell(p);
    for (let s = 1; s <= steps; s++) {
      const c = cell({ x: p.x + ((q.x - p.x) * s) / steps, z: p.z + ((q.z - p.z) * s) / steps });
      if (c < 0 || lv[c] < 0 || (last >= 0 && Math.abs(lv[c] - lv[last]) > 0.5)) return false;
      last = c;
    }
    return true;
  };
  // Straighten: from each kept point, on to the farthest point it sees.
  const pts = cells.map(pt);
  const out = [a];
  if (Math.hypot(pts[0].x - a.x, pts[0].z - a.z) > 0.3) out.push(pts[0]);
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !clear(pts[i], pts[j])) j--;
    out.push(pts[j]);
    i = j;
  }
  if (Math.hypot(out[out.length - 1].x - b.x, out[out.length - 1].z - b.z) > 0.2) out.push(b);
  return out;
}
