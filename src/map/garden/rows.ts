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
 * - **His way** (`rowAxis`, roam/_garden.ts): the house's line nearest the way
 *   he last walked (not the way a dig turned him to face the plant), so a row
 *   goes along the house's lines however the camera stood. The ghost is looked
 *   for straight ahead of his feet along it.
 * - **The line** the ghost goes on, a line along his way:
 *   - a **row** of his: two or more plants a whole number of spacings apart on
 *     a line within 30° of his way (its own angle: an old crooked row goes on
 *     straight; a gap does not break it);
 *   - else the line through one of his plants along his way;
 *   - the nearest of them within half a spacing across (a row first), and the
 *     line it was on a moment ago while he stays less than a whole spacing
 *     across it (`RowHold`): it changes rows only on purpose;
 *   - else a line beside the nearest plant's, a whole number of spacings over
 *     (a new row beside the last, its spots in line with the old row's);
 *   - else his land's half-metre grid (build/plot.ts `PLOT_BOX`, build mode's,
 *     AWP-30: rows line up with his fences too).
 * - **The spot** on that line, at whole spacings from its plant: the first one
 *   free (the garden's rules, `ok`) from the row's first gap up to the ghost (gaps
 *   filled first, in order), else the next free ones on along the line (a refused
 *   spot — a land step, a fence, the cart — is stepped over, never left by).
 * - **The guide** (`rowNext`): the line's first plant and the next free spots
 *   on along it — the ones the next digs take.
 */

/** The land's grid (m), as build mode's (roam/_build.ts `GRID`). */
export const ROW_GRID = 0.5;
/** Two plants make a row when they stand a whole number of spacings apart (1‥`m`), within `tol` m, at most `deg` off his way. */
const ROW = { m: 8, tol: 0.12, deg: 30 };
/** A line is taken within this share of a spacing across; one held is kept within this share. */
const TAKE = 0.5;
const KEEP = 1.0;
/** A row is taken before a lone plant's line by this share of a spacing. */
const ROW_FIRST = 0.25;
/** Gaps behind the ghost are filled first: this many spacings back at most, and this far (m). */
const BACK = { steps: 2, m: 3.2 };
/** A refused spot is stepped over: on along the line this far at most (m), and at least this many spots. */
const ON = { m: 4, least: 2 };
const onSpots = (s: number): number => Math.max(ON.least, Math.floor(ON.m / s + 1e-6));
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

/** The house's line nearest a way (rad, as `body.yaw`), held on the one it had (`held`) until the way is `hold` rad past the middle. */
export function rowAxis(yaw: number, held: number | null, hold = (5 * Math.PI) / 180): number {
  const q = Math.PI / 2;
  if (held !== null) {
    const d = Math.atan2(Math.sin(yaw - held), Math.cos(yaw - held));
    if (Math.abs(d) < q / 2 + hold) return held;
  }
  const a = HOME_AT.facing + Math.round((yaw - HOME_AT.facing) / q) * q;
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** A plant's turn on the house's lines: `yaw` (rad, as `body.yaw`) to the nearest quarter turn from the house's frame. */
export const rowYaw = (yaw: number): number => rowAxis(yaw, null);

/** The line the ghost was on a moment ago (kept while he stays less than a spacing across it). */
export interface RowHold {
  on: boolean;
  ox: number;
  oz: number;
  dx: number;
  dz: number;
  step: number;
}
export const newRowHold = (): RowHold => ({ on: false, ox: 0, oz: 0, dx: 0, dz: 1, step: 1 });

/** Where `snapRow` put the ghost. */
export interface RowSpot {
  x: number;
  z: number;
  /** `row` on a row of his, `line` on a plant's line (or beside one), `grid` his land's grid. */
  how: 'row' | 'line' | 'grid';
  /** The line: a point on it (`ox`, `oz`: a plant of it, or the grid's spot), its way (unit, along his), its spacing (m). */
  ox: number;
  oz: number;
  dx: number;
  dz: number;
  step: number;
  /** The spot's number on the line (spacings from `ox`, `oz`). */
  k: number;
  /** The line's first plant (the guide's dashes start there), or none. */
  hasFrom: boolean;
  fx: number;
  fz: number;
  /** The next free spots on (x, z pairs), and how many. */
  readonly next: Float64Array;
  nNext: number;
}

export const newRowSpot = (): RowSpot => ({ x: 0, z: 0, how: 'grid', ox: 0, oz: 0, dx: 0, dz: 1, step: 1, k: 0, hasFrom: false, fx: 0, fz: 0, next: new Float64Array(GUIDE_NEXT * 2), nNext: 0 });

/** What a garden plant is to the rows. */
export interface RowPlant {
  readonly kind: PlantKindId;
  readonly x: number;
  readonly z: number;
  readonly at: 'home' | 'pagoda';
}

/** A candidate line. */
interface Line {
  ox: number;
  oz: number;
  dx: number;
  dz: number;
  s: number;
  row: boolean;
  /** How far the ghost's aim is across it (m, signed), and its score. */
  across: number;
  score: number;
}
const POOL: Line[] = [];
let nLines = 0;
function line(ox: number, oz: number, dx: number, dz: number, s: number, row: boolean, rx: number, rz: number, feet?: readonly [number, number]): Line {
  if (nLines === POOL.length) POOL.push({ ox: 0, oz: 0, dx: 0, dz: 1, s: 1, row: false, across: 0, score: 0 });
  const l = POOL[nLines++];
  l.ox = ox;
  l.oz = oz;
  l.dx = dx;
  l.dz = dz;
  l.s = s;
  l.row = row;
  l.across = (rx - ox) * dz - (rz - oz) * dx;
  // (a row at its own angle: he is on it when his feet are, though the ghost ahead along the house's line is not)
  if (feet) {
    const af = (feet[0] - ox) * dz - (feet[1] - oz) * dx;
    if (Math.abs(af) < Math.abs(l.across)) l.across = af;
  }
  l.score = Math.abs(l.across) - (row ? ROW_FIRST * s : 0);
  return l;
}

const COS_ROW = Math.cos((ROW.deg * Math.PI) / 180);
/** The same line (its way within ~2°, its point on it within 5 cm). */
const sameLine = (a: { ox: number; oz: number; dx: number; dz: number }, b: { ox: number; oz: number; dx: number; dz: number }): boolean =>
  Math.abs(a.dx * b.dz - a.dz * b.dx) < 0.035 && Math.abs((b.ox - a.ox) * a.dz - (b.oz - a.oz) * a.dx) < 0.05;

/**
 * Where the ghost of `kind` goes with Rows on (into `out`): his feet at (`px`, `pz`), the ghost `ahead` m before them
 * along `axis` (rad, as `body.yaw`: a house's line, `rowAxis`), `plants` the garden, `ok(x, z)` the garden's rules
 * there (roam/_gardenSpots.ts `canPlant` is null), `hold` the line it was on (updated).
 */
export function snapRow(
  kind: PlantKindId,
  px: number,
  pz: number,
  ahead: number,
  axis: number,
  plants: readonly RowPlant[],
  ok: (x: number, z: number) => boolean,
  hold: RowHold,
  out: RowSpot,
): RowSpot {
  const own = rowStep(kind);
  const ax = Math.sin(axis);
  const az = Math.cos(axis);
  const rx = px + ax * ahead;
  const rz = pz + az * ahead;
  const feet = [px, pz] as const;
  nLines = 0;
  for (const p of plants) {
    if (p.at !== 'home') continue;
    const sp = rowStep(p.kind);
    const s = Math.max(own, sp);
    if (Math.hypot(p.x - rx, p.z - rz) > 4 * s + ahead + 2) continue;
    // Its line along his way.
    line(p.x, p.z, ax, az, s, false, rx, rz);
    // A row of his through it: another plant a whole number of spacings away, on a line near his way.
    for (const q of plants) {
      if (q === p || q.at !== 'home') continue;
      const sq = Math.max(sp, rowStep(q.kind));
      const ex = p.x - q.x;
      const ez = p.z - q.z;
      const d = Math.hypot(ex, ez);
      const m = Math.round(d / sq);
      if (m < 1 || m > ROW.m || Math.abs(d - m * sq) > ROW.tol) continue;
      let ux = ex / d;
      let uz = ez / d;
      const c = ux * ax + uz * az;
      if (Math.abs(c) < COS_ROW) continue;
      if (c < 0) {
        ux = -ux;
        uz = -uz;
      }
      line(p.x, p.z, ux, uz, Math.max(own, sq), true, rx, rz, feet);
    }
  }
  // The line held a moment ago, while he stays less than a spacing across it (a row through it first).
  let chosen: Line | null = null;
  if (hold.on && hold.dx * ax + hold.dz * az > COS_ROW) {
    const across = Math.min(Math.abs((rx - hold.ox) * hold.dz - (rz - hold.oz) * hold.dx), Math.abs((px - hold.ox) * hold.dz - (pz - hold.oz) * hold.dx));
    if (across < KEEP * hold.step) {
      for (let i = 0; i < nLines; i++) if (sameLine(hold, POOL[i]) && (!chosen || (POOL[i].row && !chosen.row))) chosen = POOL[i];
      chosen ??= line(hold.ox, hold.oz, hold.dx, hold.dz, hold.step, false, rx, rz);
    }
  }
  // Else the nearest within half a spacing (a row first).
  if (!chosen)
    for (let i = 0; i < nLines; i++) {
      const l = POOL[i];
      if (l.score < TAKE * l.s && (!chosen || l.score < chosen.score)) chosen = l;
    }
  // Else beside the nearest plant's line, a whole number of spacings over (its point moved that many spacings across).
  if (!chosen) {
    let near: Line | null = null;
    for (let i = 0; i < nLines; i++) if (!POOL[i].row && (!near || Math.abs(POOL[i].across) < Math.abs(near.across))) near = POOL[i];
    if (near) {
      const n = Math.round(near.across / near.s);
      chosen = line(near.ox + near.dz * n * near.s, near.oz - near.dx * n * near.s, near.dx, near.dz, near.s, false, rx, rz);
    }
  }
  // Else his land's grid.
  const grid = !chosen;
  chosen ??= line(onRowGrid(rx, PLOT_BOX.x0), onRowGrid(rz, PLOT_BOX.z0), ax, az, own, false, rx, rz);
  const L = chosen;
  // The plants on it: the first (along its way).
  let first = Infinity;
  let fx = 0;
  let fz = 0;
  let onIt = 0;
  for (const p of plants) {
    if (p.at !== 'home') continue;
    if (Math.abs((p.x - L.ox) * L.dz - (p.z - L.oz) * L.dx) > 0.05) continue;
    onIt++;
    const tp = (p.x - L.ox) * L.dx + (p.z - L.oz) * L.dz;
    if (tp < first) {
      first = tp;
      fx = p.x;
      fz = p.z;
    }
  }
  // The ghost's place along it (spacings from its point); the first free spot from the row's first gap up to it, else on.
  const t = ((rx - L.ox) * L.dx + (rz - L.oz) * L.dz) / L.s;
  const xAt = (k: number) => L.ox + L.dx * L.s * k;
  const zAt = (k: number) => L.oz + L.dz * L.s * k;
  const kHi = Math.round(t);
  let kLo = kHi;
  if (first !== Infinity) kLo = Math.min(kHi, Math.max(Math.round(first / L.s) + 1, Math.ceil(t - Math.min(BACK.steps, BACK.m / L.s) - 1e-6)));
  let k = Number.NaN;
  for (let i = kLo; i <= kHi + onSpots(L.s); i++)
    if (ok(xAt(i), zAt(i))) {
      k = i;
      break;
    }
  if (Number.isNaN(k)) k = kHi;
  out.x = xAt(k);
  out.z = zAt(k);
  out.how = grid ? 'grid' : L.row || onIt >= 2 ? 'row' : 'line';
  out.ox = L.ox;
  out.oz = L.oz;
  out.dx = L.dx;
  out.dz = L.dz;
  out.step = L.s;
  out.k = k;
  out.hasFrom = first !== Infinity;
  out.fx = fx;
  out.fz = fz;
  hold.on = true;
  hold.ox = L.ox;
  hold.oz = L.oz;
  hold.dx = L.dx;
  hold.dz = L.dz;
  hold.step = L.s;
  return out;
}

/** The guide's next spots (into `spot.next`): the next free ones on along its line after the ghost's — the next digs'. */
export function rowNext(spot: RowSpot, ok: (x: number, z: number) => boolean): void {
  spot.nNext = 0;
  // (a refused spot stepped over as the next dig will: at most `ON` on past the last free one)
  let last = spot.k;
  for (let k = spot.k + 1; k <= last + 1 + onSpots(spot.step) && spot.nNext < GUIDE_NEXT; k++) {
    const x = spot.ox + spot.dx * spot.step * k;
    const z = spot.oz + spot.dz * spot.step * k;
    if (!ok(x, z)) continue;
    last = k;
    spot.next[spot.nNext * 2] = x;
    spot.next[spot.nNext * 2 + 1] = z;
    spot.nNext++;
  }
}
