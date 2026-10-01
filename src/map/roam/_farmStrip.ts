import { RICE_HILLS, texelOf } from '../paddies/rice';
import { plotAt, PLOTS, plotSeason } from '../paddies/stages';

/**
 * The explorer's own strip of rice where he helps the farmers
 * (roam/_farmWork.ts): real hills of the paddies' rice (paddies/rice.ts, its
 * `RICE_HILLS`), so his clumps are the field's own, in its rows and spacing,
 * and grow (or stand as stubble) with the season like every other.
 *
 * A strip is `STRIP` hills in rows beside the farmers' row (`ACROSS` a row:
 * planting two, what his short right arm reaches from one place; reaping
 * four, a swath wide enough to show among the tall heavy heads, cut to and
 * fro), going the way their work goes (`w`): planting, the rows behind him
 * as he steps back; reaping, the rows of standing rice ahead of him. Each hill's
 * planting or cutting day is rewritten (`aT1.y`, `aT1.z`, plot-local season)
 * and those texels uploaded:
 *
 * - planting, his hills are kept unplanted (`hide`: never planted, until he
 *   plants it) and planted the moment his hand pushes them in (`plant`):
 *   seedlings just set out, which then grow with the season;
 * - reaping, his standing hills are kept from the plot's own sweep (`hold`:
 *   not cut, until he cuts it) and cut when the sickle goes through (`cut`):
 *   short straw stubble.
 *
 * `restore` puts a hill's own days back (one he did not get to). What he
 * planted or cut stays so for the visit. Nothing here runs per frame but
 * what the caller asks; the hills of a strip are found by one pass over the
 * rice's numbers (≈ 30 000 hills).
 */

/** Clumps in a strip (a row of his), and how many across each of its rows by the work. */
export const STRIP = 12;
export const ACROSS: Record<StripKind, number> = { plant: 2, reap: 4 };
const ROWS = (kind: StripKind) => STRIP / ACROSS[kind];
/** The rice's rows are this far apart (m; paddies/rice.ts `ROW`). */
export const ROW_GAP = 0.55;
/** A day that never comes (plot-local season). */
const NEVER = 2;

export type StripKind = 'plant' | 'reap';

export interface Hill {
  /** Its number in the rice's numbers. */
  i: number;
  x: number;
  y: number;
  z: number;
  /** Its row in the strip (0 first) and place across it (0 his left … across − 1). */
  row: number;
  col: number;
  /** Its own planting and cutting days (plot-local season), as the rice made them. */
  plant0: number;
  cut0: number;
  /** He has planted or cut it. */
  done: boolean;
}

export interface Strip {
  kind: StripKind;
  plot: number;
  /** The way the work goes (unit x, z): planting he steps back this way, facing the other; reaping he goes on this way. */
  wx: number;
  wz: number;
  /** In order of the work: row by row, across each from his left (`row`, `col`). */
  hills: Hill[];
}

/** Every hill he has changed (planted, cut, kept back), with its own days: put back with `restore`. */
const changed = new Map<number, { plant: number; cut: number }>();

/**
 * The rice's numbers have gone to the GPU once (three calls the texture's `onUpdate` after an upload): before
 * that a change is sent whole with the rest (three's first upload of a texture with update ranges would send only
 * those); after, only the texels changed.
 */
let sent = false;
let watched = false;

/** The rice is built and its numbers are there. */
export function riceReady(): boolean {
  const tex = RICE_HILLS.tex;
  if (!RICE_HILLS.data || !tex) return false;
  if (!watched) {
    watched = true;
    const before = tex.onUpdate;
    tex.onUpdate = (t) => {
      sent = true;
      before?.call(tex, t);
    };
  }
  return true;
}

/** The plot-local season of plot `plot` at `season`. */
export const localSeason = (plot: number, season: number): number => plotSeason(season, PLOTS[plot].lag);

/** Hills of a plot's rows (not the nursery bed's seedlings) round (x, z) within `r` m: their numbers. */
function hillsNear(plot: number, x: number, z: number, r: number, out: number[]): number[] {
  out.length = 0;
  const d = RICE_HILLS.data;
  if (!d) return out;
  for (let i = 0; i < RICE_HILLS.count; i++) {
    const o = texelOf(i);
    const hx = d[o];
    const hz = d[o + 2];
    if (Math.abs(hx - x) > r || Math.abs(hz - z) > r) continue;
    // (a nursery seedling: `aT2.x` odd)
    if (Math.floor(d[o + 8] + 0.5) % 2 === 1) continue;
    if (plotAt(hx, hz) !== plot) continue;
    out.push(i);
  }
  return out;
}

const near: number[] = [];

/**
 * His strip in plot `plot` from the place `(sx, sz)` at the farmers' row, the work going `(wx, wz)`, or null where
 * there is not room for a whole one (the plot's edge). Planting: hills he has not planted yet; reaping: standing
 * ones (not yet cut by the plot's sweep at plot-local season `s`, nor by him).
 */
export function findStrip(kind: StripKind, plot: number, sx: number, sz: number, wx: number, wz: number, s: number, ahead = kind === 'plant' ? 0.05 : 0.3): Strip | null {
  const d = RICE_HILLS.data;
  if (!d || plot < 0) return null;
  const across = ACROSS[kind];
  const rows = ROWS(kind);
  const half = (across - 1) * 0.21 + 0.3;
  const reach = ahead + (rows + 3) * ROW_GAP + 1;
  hillsNear(plot, sx + wx * reach * 0.5, sz + wz * reach * 0.5, reach * 0.5 + 1, near);
  // (across: to his left as he works, facing f = face·w: his left is (f.z, −f.x); planting he faces back, against
  // the way the work goes)
  const face = kind === 'plant' ? -1 : 1;
  const ax = wz * face;
  const az = -wx * face;
  // (planting from just behind the farmers' line; reaping a little ahead of theirs, past its ragged edge)
  const from = ahead;
  const cands: { i: number; along: number; side: number }[] = [];
  for (const i of near) {
    const o = texelOf(i);
    const dx = d[o] - sx;
    const dz = d[o + 2] - sz;
    const along = dx * wx + dz * wz;
    const side = dx * ax + dz * az;
    if (along < from || along > from + (rows + 3) * ROW_GAP || Math.abs(side) > half) continue;
    const mine = changed.get(i);
    // (planting: not one he has planted; reaping: standing, not cut by the plot's own sweep nor by him)
    if (kind === 'plant' && mine && d[o + 5] < NEVER - 0.5) continue;
    if (kind === 'reap' && (s >= (mine?.cut ?? d[o + 6]) || (mine && d[o + 6] < NEVER - 0.5))) continue;
    cands.push({ i, along, side });
  }
  // Rows: the hills by how far along, a new row where the next is more than half a row on; a row with too few
  // left in it (a ragged edge of the reapers' cut) is passed over, a longer gap (the plot's edge) ends the strip.
  cands.sort((p, q) => p.along - q.along);
  const hills: Hill[] = [];
  let row: typeof cands = [];
  let last = from - ROW_GAP;
  const flush = () => {
    if (row.length < across) return;
    // (the ones nearest the line he works along, from his left; reaping, every other row from his right: to and fro)
    row.sort((p, q) => Math.abs(p.side) - Math.abs(q.side));
    const r = hills.length / across;
    const some = row.slice(0, across).sort((p, q) => (kind === 'reap' && r % 2 === 1 ? p.side - q.side : q.side - p.side));
    last = row[0].along;
    for (let c = 0; c < some.length; c++) {
      const o = texelOf(some[c].i);
      const own = changed.get(some[c].i);
      hills.push({ i: some[c].i, x: d[o], y: d[o + 1], z: d[o + 2], row: r, col: c, plant0: own?.plant ?? d[o + 5], cut0: own?.cut ?? d[o + 6], done: false });
    }
  };
  for (const c of cands) {
    if (hills.length >= STRIP) break;
    if (row.length && c.along - row[0].along > ROW_GAP * 0.5) {
      flush();
      row = [];
    }
    if (c.along - last > ROW_GAP * 3.6) break;
    row.push(c);
  }
  if (hills.length < STRIP && row.length) flush();
  if (hills.length < STRIP) return null;
  hills.length = STRIP;
  return { kind, plot, wx, wz, hills };
}

/** Upload this hill's texels (all of the rice's numbers: `whole`, or before their first upload). */
function upload(i: number, whole: boolean): void {
  const tex = RICE_HILLS.tex;
  if (!tex) return;
  riceReady();
  if (whole || !sent) tex.clearUpdateRanges();
  else tex.addUpdateRange(texelOf(i), 12);
  tex.needsUpdate = true;
}

/** Remember a hill's own days before the first change. */
function keep(i: number): void {
  const d = RICE_HILLS.data!;
  const o = texelOf(i);
  if (!changed.has(i)) changed.set(i, { plant: d[o + 5], cut: d[o + 6] });
}

/** Planting: keep it unplanted until he plants it. */
export function hide(h: Hill, whole = false): void {
  const d = RICE_HILLS.data;
  if (!d) return;
  keep(h.i);
  d[texelOf(h.i) + 5] = NEVER;
  upload(h.i, whole);
}

/**
 * Planting, a strip's hill going under while the player may see it (a new strip beside the row where it had been
 * planted already): it shrinks back into the water over the hand-over (`k` 0 up ‥ 1 gone; rice.ts plants a hill
 * over 0.006 of the season: here backwards), then stays unplanted.
 */
export function shrink(h: Hill, s: number, k: number): void {
  const d = RICE_HILLS.data;
  if (!d) return;
  keep(h.i);
  d[texelOf(h.i) + 5] = k >= 1 ? NEVER : s - 0.0062 * (1 - k);
  upload(h.i, false);
}

/** Planted now (plot-local season `s`): a seedling just set out, at once (rice.ts plants over 0.006 of the season). */
export function plant(h: Hill, s: number, whole = false): void {
  const d = RICE_HILLS.data;
  if (!d) return;
  keep(h.i);
  d[texelOf(h.i) + 5] = s - 0.0062;
  h.done = true;
  upload(h.i, whole);
}

/** Reaping: keep it standing (the plot's own sweep passes it by) until he cuts it. */
export function hold(h: Hill, whole = false): void {
  const d = RICE_HILLS.data;
  if (!d) return;
  keep(h.i);
  d[texelOf(h.i) + 6] = NEVER;
  upload(h.i, whole);
}

/** Cut now (plot-local season `s`): stubble at once (rice.ts cuts over 0.003). */
export function cut(h: Hill, s: number, whole = false): void {
  const d = RICE_HILLS.data;
  if (!d) return;
  keep(h.i);
  d[texelOf(h.i) + 6] = s - 0.0032;
  h.done = true;
  upload(h.i, whole);
}

/** A hill he did not get to: its own days again. */
export function restore(h: Hill, whole = false): void {
  const d = RICE_HILLS.data;
  const own = changed.get(h.i);
  if (!d || !own || h.done) return;
  const o = texelOf(h.i);
  d[o + 5] = own.plant;
  d[o + 6] = own.cut;
  changed.delete(h.i);
  upload(h.i, whole);
}

/** Let the plot's rows be drawn before its own planting (his first clumps where the farmers are just starting). */
export function openPlot(plot: number, on: boolean): void {
  if (plot >= 0 && plot < RICE_HILLS.early.length) RICE_HILLS.early[plot] = on ? 1 : 0;
}
