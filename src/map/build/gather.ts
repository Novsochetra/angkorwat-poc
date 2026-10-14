import { progress } from '../progress';
import type { WordKey } from '../ui/lang';
import { MATERIALS, type GatherAction, type MaterialId } from './materials';

/**
 * **Where materials are gathered** (ticket AWP-9): the registry every gathering
 * source fills, and what each spot has left. No three.js, nothing per frame but
 * `advance`: the gathering add-on (roam/_gather.ts) reads it, the sources
 * register into it.
 *
 * A **source** (`registerGatherSource`) is one kind of place: the bamboo clumps,
 * the woodcutters' logs (AWP-11), the sugar-palm village's thatch (AWP-12), the
 * clay banks (AWP-13), a bamboo forest (AWP-15)… It may live in a map part (it
 * knows where its things stand) or in a roaming module; it lists its **spots**
 * (`GatherSpot`: where, which material, the hits one piece takes, how many pieces
 * before it is spent, the game days it takes to grow back, where the blow lands)
 * and may add:
 * - `can(spot, at)`: can he gather here now? null yes, else the words why not
 *   (shown with no key: "The bamboo is too young", "Not at night"…);
 * - `onHit(spot, n, of)`: each hit lands (n of `spot.hits`): shake the clump, chip
 *   the log (the add-on plays the sound, throws the chips, shakes the pad);
 * - `onTake(spot, left)`: a piece came off (hide a cane, a frond); `left` pieces stay;
 * - `onLeft(spot, left)`: what a spot has left changed some other way (it grew
 *   back, a check, a load): draw it so;
 * - `onWork(spot, x, z)`: he sets to work at it from (x, z) (or a check puts him
 *   there): the side he works it from (the bamboo's canes before him go first).
 *
 * `gatherTakenAt(spot)` gives the clock times its pieces still growing back were
 * taken (oldest first): how far each has grown back.
 *
 * **What a spot has left** is kept here (`gatherLeft`), not by the source: each
 * piece taken comes back `regrowDays` game days later, on the gathering's own
 * clock (`GATHER.clock`, game days, saved: it runs with the map's time while he
 * plays, as the garden's does; roam/_gather.ts moves it on). A spot with
 * `regrowDays` 0 never runs out. Saved (progress.ts `gather.spots`: per spot id,
 * the clock times its pieces were taken; `gather.clock`).
 *
 * Spot ids are kept with the save, so they must not change between visits: make
 * them from the source's id and the spot's place or number (`bamboo:481,-105`).
 */

export interface GatherSpot {
  /** Unique and stable (saved): `<source>:<something fixed>`. */
  readonly id: string;
  readonly material: MaterialId;
  /** Its middle on the map (m). */
  readonly x: number;
  readonly z: number;
  /** How far from its middle its foot reaches (m): he stands just outside it, facing its middle. */
  readonly r: number;
  /** Hits for one piece. */
  readonly hits: number;
  /** Pieces it gives before it is spent. */
  readonly pieces: number;
  /** Game days a piece takes to grow back (0: it is never spent). */
  readonly regrowDays: number;
  /** Where the blow lands (m over the ground; default: a chop at knee height, a dig on the ground). */
  readonly hitY?: number;
  /** How it is gathered (default: the material's). */
  readonly action?: GatherAction;
  /**
   * A long thing lying on the ground (a felled trunk): the way its length runs (rad, as `atan2(dx, dz)`). He stands
   * across it, on the side he comes from, not at its end.
   */
  readonly along?: number;
}

/** Where he is when a source is asked `can` (feet, m) and whether it is night. */
export interface GatherAt {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly night: number;
}

export interface GatherSource {
  /** Unique: the first part of its spots' ids. */
  readonly id: string;
  /** Its spots (the same array while they do not change: it is read every step near him). */
  spots(): readonly GatherSpot[];
  /** Null: he may gather `spot` now; else the words why not (no key in the prompt). */
  can?(spot: GatherSpot, at: GatherAt): WordKey | null;
  /** Hit `n` of `spot.hits` landed (1‥hits). */
  onHit?(spot: GatherSpot, n: number, of: number): void;
  /** A piece came off; `left` remain. */
  onTake?(spot: GatherSpot, left: number): void;
  /** What `spot` has left changed (it grew back; a check set it): `left` now. */
  onLeft?(spot: GatherSpot, left: number): void;
  /** He sets to work at `spot`, standing at (x, z) (m), or a check puts him there. */
  onWork?(spot: GatherSpot, x: number, z: number): void;
  /**
   * Its own words for a spot with none left ({n} game days to go; by tomorrow), for what comes back another way than
   * growing (the woodcutters fell another tree; the water brings more clay). Default "None left: it grows back in…".
   */
  readonly spent?: { readonly days: WordKey; readonly soon: WordKey };
}

const SOURCES: GatherSource[] = [];
const listeners: (() => void)[] = [];
let version = 0;

/** A source registers itself (one with the same id replaces the old). */
export function registerGatherSource(s: GatherSource): void {
  const i = SOURCES.findIndex((o) => o.id === s.id);
  if (i >= 0) SOURCES[i] = s;
  else SOURCES.push(s);
  // (its spots with pieces growing back, from the save: into the regrowing list)
  for (const sp of s.spots()) if (taken[sp.id]) growing.set(sp.id, sp);
  nextGrow = -Infinity;
  version++;
  for (const fn of listeners) fn();
}

/**
 * The spots with pieces growing back (by id; only these are looked at as the clock runs, never every spot of every
 * source: a bamboo forest has hundreds), and the clock time the next piece is back (−∞: work it out again).
 */
const growing = new Map<string, GatherSpot>();
let nextGrow = -Infinity;
function nextGrowAt(): number {
  let t = Infinity;
  for (const [id, sp] of growing) {
    const ts = taken[id];
    if (ts) for (const at of ts) t = Math.min(t, at + sp.regrowDays);
  }
  return t;
}

/** Every source registered. */
export const gatherSources = (): readonly GatherSource[] => SOURCES;

/** The source a spot belongs to (by its id's first part). */
export function sourceOf(spot: GatherSpot): GatherSource | null {
  const id = spot.id.slice(0, spot.id.indexOf(':'));
  return SOURCES.find((s) => s.id === id) ?? null;
}

/** Where the blow lands (m over the ground) and how it is gathered. */
export const hitYOf = (s: GatherSpot): number => s.hitY ?? (actionOf(s) === 'dig' ? 0 : 0.45);
export const actionOf = (s: GatherSpot): GatherAction => s.action ?? MATERIALS[s.material].action;

// ── What each spot has left (the gathering's clock) ─────────────────────────

const isTaken = (v: unknown): v is Record<string, number[]> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Per spot id: the clock's times its pieces were taken (those still growing back). */
const taken: Record<string, number[]> = {};
/** The clock at most (game days: far over any play; a broken value reads as 0). */
const CLOCK_MAX = 1e6;
let clock = progress.get('gather.clock', 0, isNum);
if (clock > CLOCK_MAX) clock = 0;
// (a broken save: only times on the clock so far are kept (one in the future would hold a spot spent), at most a few a spot)
for (const [id, ts] of Object.entries(progress.get('gather.spots', {}, isTaken)))
  if (Array.isArray(ts) && id.length < 200) {
    const ok = ts.filter((at) => isNum(at) && at <= clock).slice(0, 64);
    if (ok.length) taken[id] = ok;
  }
let savedClock = clock;

function save(): void {
  progress.set('gather.spots', Object.keys(taken).length ? taken : null);
  progress.set('gather.clock', clock);
  savedClock = clock;
}

/** Pieces `spot` has left now. */
export function gatherLeft(spot: GatherSpot): number {
  const ts = taken[spot.id];
  if (!ts || spot.regrowDays <= 0) return spot.pieces;
  let n = 0;
  for (const at of ts) if (clock - at < spot.regrowDays) n++;
  return Math.max(0, spot.pieces - n);
}

/** The clock times the pieces of `spot` still growing back were taken, oldest first (a copy; empty: it has them all). */
export function gatherTakenAt(spot: GatherSpot): number[] {
  const ts = taken[spot.id];
  if (!ts || spot.regrowDays <= 0) return [];
  return ts.filter((at) => clock - at < spot.regrowDays).sort((a, b) => a - b);
}

/** Game days until `spot`'s next piece grows back (0: it has all its pieces). */
export function gatherRegrowIn(spot: GatherSpot): number {
  const ts = taken[spot.id];
  if (!ts || spot.regrowDays <= 0 || gatherLeft(spot) >= spot.pieces) return 0;
  let first = Infinity;
  for (const at of ts) if (clock - at < spot.regrowDays) first = Math.min(first, at);
  return Math.max(0, first + spot.regrowDays - clock);
}

export const GATHER = {
  /** The gathering's clock (game days). */
  get clock(): number {
    return clock;
  },
  /** Bumps when a source registers, a piece is taken or a spot grows back. */
  get version(): number {
    return version;
  },
  /** Something changed (a source came, a piece was taken, one grew back). */
  onChange(fn: () => void): void {
    listeners.push(fn);
  },

  /** A piece comes off `spot` (after its last hit): false when it has none left. */
  take(spot: GatherSpot): boolean {
    const left = gatherLeft(spot);
    if (left <= 0) return false;
    if (spot.regrowDays > 0) {
      const ts = (taken[spot.id] ??= []);
      // (only those still growing back are kept)
      for (let i = ts.length - 1; i >= 0; i--) if (clock - ts[i] >= spot.regrowDays) ts.splice(i, 1);
      ts.push(+clock.toFixed(4));
      growing.set(spot.id, spot);
      nextGrow = -Infinity;
      save();
    }
    version++;
    sourceOf(spot)?.onTake?.(spot, left - 1);
    for (const fn of listeners) fn();
    return true;
  },

  /**
   * The clock moves on `days` (roam/_gather.ts, each frame while the game is played): spots whose pieces grow back
   * are told (`onLeft`). Saved now and then (and with every piece taken).
   */
  advance(days: number): void {
    if (!(days > 0) || !Number.isFinite(days)) return;
    clock += days;
    let grew = false;
    // (nothing is due back yet: no spot is looked at)
    if (nextGrow === -Infinity) nextGrow = nextGrowAt();
    if (clock >= nextGrow) {
      for (const [id, s] of growing) {
        const ts = taken[id];
        if (!ts || s.regrowDays <= 0) {
          growing.delete(id);
          continue;
        }
        const n = ts.length;
        // (what has grown back is forgotten; a spot all grown back is dropped)
        for (let i = ts.length - 1; i >= 0; i--) if (clock - ts[i] >= s.regrowDays) ts.splice(i, 1);
        if (ts.length === n) continue;
        grew = true;
        if (!ts.length) {
          delete taken[id];
          growing.delete(id);
        }
        sourceOf(s)?.onLeft?.(s, gatherLeft(s));
      }
      nextGrow = nextGrowAt();
    }
    if (grew) {
      version++;
      for (const fn of listeners) fn();
    }
    if (grew || clock - savedClock > 0.05) save();
  },

  /** Checks (the URL, shots): `spot` has `left` pieces now (as if the rest were just taken). */
  setLeft(spot: GatherSpot, left: number): void {
    const n = Math.max(0, Math.min(spot.pieces, Math.floor(left)));
    if (n >= spot.pieces) {
      delete taken[spot.id];
      growing.delete(spot.id);
    } else {
      taken[spot.id] = Array.from({ length: spot.pieces - n }, () => clock);
      growing.set(spot.id, spot);
    }
    nextGrow = -Infinity;
    save();
    version++;
    sourceOf(spot)?.onLeft?.(spot, n);
    for (const fn of listeners) fn();
  },
};
