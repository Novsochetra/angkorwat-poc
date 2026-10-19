import { PLOT_BOX } from '../build/plot';
import { HOME_AT } from '../hamlet/_homePlan';
import { isTree, KINDS, type PlantKindId } from './kinds';

/**
 * Planting in rows (AWP-32): where planting mode's ghost goes when "Rows" is on
 * (roam/_garden.ts; the player's choice, on by default; off, it goes where his
 * feet and facing put it, as before). No three.js, nothing made per call.
 *
 * - **The spacing** of a kind (`rowStep`): its room (kinds.ts `room`: no two
 *   plants nearer than the larger of their rooms) and, for a crop, its dug bed
 *   (garden/_viewEarth.ts: half its side `room × 0.75` within 0.45‥0.85 m) with
 *   a hand's gap, rounded up to the half metre: corn 1, eggplant 1.5, sugarcane
 *   1.5, pumpkin 2; papaya 1.5, banana 2, guava 2.5, coconut 3, sugar palm 3,
 *   mango 3.5, jackfruit 3.5, durian 4. Two kinds side by side keep the larger.
 * - **On along a row** (`row`): where two plants stand a spacing apart, the
 *   ghost ahead of the row's end on its line (within `LINE` of it) goes on it,
 *   a whole number of spacings on: the row's own line, whatever its angle (an old
 *   crooked row goes on straight). It wins over every other spot (`ROW_FIRST`):
 *   going on straight is the default.
 * - **In line with a plant** (`line`): near his plants the ghost steps on a grid
 *   of the spacing laid from the nearest of them along the house's lines — in
 *   line with it, a spacing or more along, beside it a spacing over (a new row
 *   started beside the last one); its guide runs along the house's line he faces.
 * - **Else his land's grid** (`grid`): the half metre from its corner
 *   (build/plot.ts `PLOT_BOX`), the one build mode's ghost steps on (AWP-30), so
 *   the garden's rows line up with his fences too.
 * A spot the garden's rules refuse is skipped for the next best; the spot it held
 * a moment ago is kept while it still suits (`HELD`: no flicker as he sways).
 * - **The guide**: the row's way, its first plant and its next spots (as far as
 *   they can be planted), for the ghost's faint dashes and marks.
 */

/** The land's grid (m), as build mode's (roam/_build.ts `GRID`). */
export const ROW_GRID = 0.5;
/** A plant's grid reaches this far round it (m: a few spacings, and a margin). */
const REACH = { per: 4, more: 2 };
/** On along a row: the ghost within this of the row's line (m: at least, and per metre of spacing), ahead of its end. */
const LINE = { least: 0.8, per: 0.45 };
/** The row's continuation wins by this much (m); the spot held a moment ago by this; a plant's grid by its plant's nearness. */
const ROW_FIRST = 0.8;
const HELD = 0.3;
const NEAR_FIRST = 0.08;
/** On along a row, the next spot is kept until the ghost is this share of a spacing past the middle to the one after. */
const NEXT_FIRST = 0.3;
/** Two plants make a row when they stand a spacing apart, give or take this share of it. */
const ROW_TOL = 0.3;
/** Next spots the guide shows at most. */
export const GUIDE_NEXT = 3;

/** Half the side of a crop's dug bed (m; garden/_viewEarth.ts). */
export const bedHalf = (kind: PlantKindId): number => Math.min(0.85, Math.max(0.45, KINDS[kind].room * 0.75));

const STEP = new Map<PlantKindId, number>();
/** The spacing of a kind's rows (m, a half metre's multiple): its room, and a crop's bed with a gap. */
export function rowStep(kind: PlantKindId): number {
  let s = STEP.get(kind);
  if (s === undefined) {
    const k = KINDS[kind];
    const need = isTree(k) ? k.room : Math.max(k.room, bedHalf(kind) * 2 + 0.1);
    s = Math.ceil(need / ROW_GRID - 1e-6) * ROW_GRID;
    STEP.set(kind, s);
  }
  return s;
}

/** A spot (x or z, m) on his land's grid. */
export const onRowGrid = (v: number, o: number): number => o + Math.round((v - o) / ROW_GRID) * ROW_GRID;

/** Where `snapRow` put the ghost. */
export interface RowSpot {
  x: number;
  z: number;
  /** `row` on along a row, `line` on a plant's grid, `grid` his land's grid. */
  how: 'row' | 'line' | 'grid';
  /** The row's way (unit x, z) and spacing (m). */
  dx: number;
  dz: number;
  step: number;
  /** The row's first plant (the guide's dashes start there), or none. */
  hasFrom: boolean;
  fx: number;
  fz: number;
  /** The next spots on (x, z pairs) that can be planted, and how many. */
  readonly next: Float64Array;
  nNext: number;
}

export const newRowSpot = (): RowSpot => ({ x: 0, z: 0, how: 'grid', dx: 0, dz: 1, step: 1, hasFrom: false, fx: 0, fz: 0, next: new Float64Array(GUIDE_NEXT * 2), nNext: 0 });

/** What a garden plant is to the rows. */
export interface RowPlant {
  readonly kind: PlantKindId;
  readonly x: number;
  readonly z: number;
  readonly at: 'home' | 'pagoda';
}

/** The house's lines (unit x, z): its front's way (`U`) and its side's (`V`). */
const U = [Math.sin(HOME_AT.facing), Math.cos(HOME_AT.facing)] as const;
const V = [Math.cos(HOME_AT.facing), -Math.sin(HOME_AT.facing)] as const;
/** The four ways on the house's lines. */
const AXES: readonly (readonly [number, number])[] = [U, [-U[0], -U[1]], V, [-V[0], -V[1]]];

/** The house's line nearest a way (`yaw` as `body.yaw`: x sin, z cos), into `out` (unit x, z). */
function axisNear(yaw: number, out: { dx: number; dz: number }): void {
  const x = Math.sin(yaw);
  const z = Math.cos(yaw);
  let best = -2;
  for (const [ax, az] of AXES) {
    const d = ax * x + az * z;
    if (d > best) {
      best = d;
      out.dx = ax;
      out.dz = az;
    }
  }
}

/** A plant's turn on the house's lines: `yaw` (rad, as `body.yaw`) to the nearest quarter turn from the house's frame. */
export function rowYaw(yaw: number): number {
  const q = Math.PI / 2;
  const r = HOME_AT.facing + Math.round((yaw - HOME_AT.facing) / q) * q;
  return Math.atan2(Math.sin(r), Math.cos(r));
}

/** A candidate spot: where, its score, how, its way, the plant it is laid from (`fx`, `fz`) and whether in line with it. */
interface Cand {
  x: number;
  z: number;
  score: number;
  how: 'row' | 'line';
  dx: number;
  dz: number;
  step: number;
  fx: number;
  fz: number;
  from: boolean;
}
const POOL: Cand[] = [];
let nCand = 0;
function cand(x: number, z: number, score: number, how: 'row' | 'line', step: number, fx: number, fz: number): Cand {
  if (nCand === POOL.length) POOL.push({ x: 0, z: 0, score: 0, how: 'line', dx: 0, dz: 0, step: 0, fx: 0, fz: 0, from: false });
  const c = POOL[nCand++];
  c.x = x;
  c.z = z;
  c.score = score;
  c.how = how;
  c.step = step;
  c.fx = fx;
  c.fz = fz;
  c.dx = 0;
  c.dz = 0;
  c.from = false;
  return c;
}

/** The plant (home) that stands nearest (x, z) within `r` m, or null. */
function plantAt(plants: readonly RowPlant[], x: number, z: number, r: number): RowPlant | null {
  let best: RowPlant | null = null;
  let bd = r * r;
  for (const p of plants) {
    if (p.at !== 'home') continue;
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

const _ax = { dx: 0, dz: 1 };

/**
 * Where the ghost of `kind` goes with Rows on (into `out`): `(rawX, rawZ)` where his feet and facing put it, `yaw` the
 * way he faces (as `body.yaw`), `plants` the garden, `ok(x, z)` the garden's rules there (roam/_gardenSpots.ts
 * `canPlant` is null), `held` the spot it took last step (or null).
 */
export function snapRow(
  kind: PlantKindId,
  rawX: number,
  rawZ: number,
  yaw: number,
  plants: readonly RowPlant[],
  ok: (x: number, z: number) => boolean,
  held: { x: number; z: number } | null,
  out: RowSpot,
): RowSpot {
  const own = rowStep(kind);
  axisNear(yaw, _ax);
  nCand = 0;
  for (const p of plants) {
    if (p.at !== 'home') continue;
    const s = Math.max(own, rowStep(p.kind));
    const dp = Math.hypot(p.x - rawX, p.z - rawZ);
    if (dp > REACH.per * s + REACH.more) continue;
    // On along a row: a plant a spacing behind it (their own spacing), the ghost ahead of it near the row's line.
    for (const q of plants) {
      if (q === p || q.at !== 'home') continue;
      const sq = Math.max(rowStep(p.kind), rowStep(q.kind));
      const ex = p.x - q.x;
      const ez = p.z - q.z;
      const d = Math.hypot(ex, ez);
      if (Math.abs(d - sq) > sq * ROW_TOL) continue;
      const ux = ex / d;
      const uz = ez / d;
      const along = (rawX - p.x) * ux + (rawZ - p.z) * uz;
      const across = -(rawX - p.x) * uz + (rawZ - p.z) * ux;
      if (along < s * 0.4 || Math.abs(across) > LINE.least + LINE.per * s) continue;
      // (the next free spot first: a spot further on only once the ghost is well past it)
      const k = Math.max(1, Math.round(along / s - NEXT_FIRST));
      const c = cand(p.x + ux * s * k, p.z + uz * s * k, 0, 'row', s, q.x, q.z);
      c.score = Math.hypot(c.x - rawX, c.z - rawZ) - ROW_FIRST;
      c.dx = ux;
      c.dz = uz;
      c.from = true;
      // (the row's first plant: back along it, plant by plant)
      for (let i = 0; i < 40; i++) {
        const b = plantAt(plants, c.fx - ux * sq, c.fz - uz * sq, sq * ROW_TOL);
        if (!b) break;
        c.fx = b.x;
        c.fz = b.z;
      }
    }
    // Its grid (the spacing, along the house's lines): the four corners round the ghost, a little for the nearer plant.
    const a = (rawX - p.x) * U[0] + (rawZ - p.z) * U[1];
    const b = (rawX - p.x) * V[0] + (rawZ - p.z) * V[1];
    const a0 = Math.floor(a / s);
    const b0 = Math.floor(b / s);
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++) {
        const ka = a0 + i;
        const kb = b0 + j;
        if (!ka && !kb) continue;
        const x = p.x + (U[0] * ka + V[0] * kb) * s;
        const z = p.z + (U[1] * ka + V[1] * kb) * s;
        const c = cand(x, z, 0, 'line', s, p.x, p.z);
        c.score = Math.hypot(x - rawX, z - rawZ) + NEAR_FIRST * dp;
        // (its way: the house's line he faces along; the guide's dashes from its plant when in line with it that way)
        c.dx = _ax.dx;
        c.dz = _ax.dz;
        const l = Math.hypot(x - p.x, z - p.z);
        c.from = ((x - p.x) * _ax.dx + (z - p.z) * _ax.dz) / l > 0.999;
      }
  }
  // The spot held a moment ago first while it suits; then the best that the garden's rules let go there.
  if (held)
    for (let i = 0; i < nCand; i++) {
      const c = POOL[i];
      if (Math.abs(c.x - held.x) < 0.01 && Math.abs(c.z - held.z) < 0.01) c.score -= HELD;
    }
  let chosen: Cand | null = null;
  for (let tries = 0; tries < nCand; tries++) {
    let best: Cand | null = null;
    for (let i = 0; i < nCand; i++) {
      const c = POOL[i];
      if (c.score !== Infinity && (!best || c.score < best.score)) best = c;
    }
    if (!best) break;
    if (ok(best.x, best.z)) {
      chosen = best;
      break;
    }
    // (refused there: every candidate at that spot is out)
    const bx = best.x;
    const bz = best.z;
    for (let i = 0; i < nCand; i++) {
      const c = POOL[i];
      if (Math.abs(c.x - bx) < 0.01 && Math.abs(c.z - bz) < 0.01) c.score = Infinity;
    }
  }
  if (chosen) {
    out.x = chosen.x;
    out.z = chosen.z;
    out.how = chosen.how;
    out.step = chosen.step;
    out.hasFrom = chosen.from;
    out.fx = chosen.fx;
    out.fz = chosen.fz;
    out.dx = chosen.dx;
    out.dz = chosen.dz;
  } else {
    // His land's grid; the guide along the house's line nearest the way he faces.
    out.x = onRowGrid(rawX, PLOT_BOX.x0);
    out.z = onRowGrid(rawZ, PLOT_BOX.z0);
    out.how = 'grid';
    out.dx = _ax.dx;
    out.dz = _ax.dz;
    out.step = own;
    out.hasFrom = false;
  }
  return out;
}

/** The guide's next spots on from `spot` along its way (into `spot.next`), as far as they can be planted (`ok`). */
export function rowNext(spot: RowSpot, ok: (x: number, z: number) => boolean): void {
  spot.nNext = 0;
  for (let k = 1; k <= GUIDE_NEXT; k++) {
    const x = spot.x + spot.dx * spot.step * k;
    const z = spot.z + spot.dz * spot.step * k;
    if (!ok(x, z)) break;
    spot.next[spot.nNext * 2] = x;
    spot.next[spot.nNext * 2 + 1] = z;
    spot.nNext++;
  }
}
