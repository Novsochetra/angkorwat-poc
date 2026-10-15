import { saveBlocksNow } from '../blocks/save';
import { BLOCKS, cellMin, cellOf } from '../blocks/store';
import { progress } from '../progress';
import { FOOT_KIND_IDS, FOOT_KINDS, planFoot, rectOf, sizeFault, type FootKind, type FootPart, type FootPlan, type FootRect, type FootSide } from './footPlan';
import { MATERIAL_IDS, type Materials } from './materials';
import { BUILT } from './pieces';
import { PLOT_BOX } from './plot';
import { distTo, overlap, type Foot } from './state';

/**
 * His footprint buildings (AWP-20: the plans, build/footPlan.ts; drawing and
 * the work, roam/_buildFoot*.ts and roam/_build.ts), kept between visits, no
 * three.js.
 *
 * - **A record** (`FootRec`): its kind, its footprint (cells), its door side,
 *   how far it is built (`done` 0‥1), how many of its plan's blocks are in the
 *   block layer (`written`), and what it cost (the materials, kept: taking it
 *   down gives back half of them, whatever the prices are by then).
 * - **The blocks are the block layer's** (blocks/store.ts `BLOCKS`, saved by
 *   blocks/save.ts): `setDone` writes the plan's next blocks as he builds (a
 *   step of `n / 60` blocks at a time, so the layer and the walk map are made
 *   again about once a second of work, not every frame) and takes them away
 *   as he takes it down; `remove` clears every cell of its plan. Paint
 *   (AWP-22) on its blocks is kept: nothing here writes a cell twice. Finished
 *   or taken down, the block save is written at once and the list right after,
 *   in one task (blocks/save.ts `saveBlocksNow`): a tab closed then keeps both or
 *   neither, so no block of a building taken down can come back without it.
 *   When the map loads, a record's blocks so far that the saved build lacks (a
 *   block save behind the list mid-build, or one lost or broken: blocks/save.ts
 *   loads nothing then) are written again. Blocks with no record are never
 *   taken out on load: his land may hold blocks of his own besides.
 * - **Saved**: progress.ts `build.foot` (`[{ uid, kind, i0, k0, i1, k1, door,
 *   done, w, cost }]`), on every change, at most once a second while one
 *   rises. On load a record that does not read (an unknown kind, a size its
 *   kind does not allow, far from his land, a broken number, more of a kind
 *   than it may have, one over another) is left out, and its cost is read as
 *   whole numbers 0‥999 (a broken value never gives back a heap). Shots and
 *   `progress=0` keep nothing.
 * - **For the rest of the game**: `BUILT.feet(x, z, r)` (the garden plants
 *   nowhere on one), `BUILT.feetOver(foot, m)` (the placing rules: no piece
 *   and no footprint on one), the land's budget (`pending`: blocks still to
 *   come of those under way).
 */

export interface FootRec {
  /** Unique (`<kind>-<n>`), kept with it. */
  readonly uid: string;
  readonly kind: FootKind;
  readonly rect: FootRect;
  readonly door: FootSide;
  /** 0‥1 built. */
  done: number;
  /** Its plan's first blocks in the layer. */
  written: number;
  /** What it cost (the materials; what he lacked he bought). */
  readonly cost: Materials;
}

export type FootEventType = 'added' | 'progress' | 'done' | 'removed';

const KEY = 'build.foot';
const SAVE_EVERY = 1;
/** The plans are written this many steps over a building's blocks at most. */
const STEPS = 60;
/** The most records a save may hold. */
const MOST = FOOT_KIND_IDS.reduce((n, k) => n + FOOT_KINDS[k].most, 0);
/** A record's footprint is this far from his land's box at most (cells). */
const NEAR = 40;

const list: FootRec[] = [];
const listeners: ((type: FootEventType, rec: FootRec) => void)[] = [];
let ground: ((x: number, z: number) => number) | null = null;
let pending = false;
let since = 0;
const plans = new Map<string, { key: string; plan: FootPlan }>();

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A plan's key: what makes it (a record's footprint, door, kind). */
const planKey = (kind: FootKind, r: FootRect, door: FootSide) => `${kind}|${r.i0},${r.k0},${r.i1},${r.k1}|${door}`;

/** The plan of a footprint (made once a footprint; `ground` must be set: `FOOTS.init`). */
export function footPlan(kind: FootKind, rect: FootRect, door: FootSide): FootPlan {
  if (!ground) throw new Error('[foot] FOOTS.init(ground) first');
  return planFoot(kind, rect, door, ground);
}

function planOf(rec: FootRec): FootPlan {
  const key = planKey(rec.kind, rec.rect, rec.door);
  const c = plans.get(rec.uid);
  if (c && c.key === key) return c.plan;
  const plan = footPlan(rec.kind, rec.rect, rec.door);
  plans.set(rec.uid, { key, plan });
  return plan;
}

/** One saved record, checked (null: left out). */
function readOne(v: unknown): FootRec | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.uid !== 'string' || typeof o.kind !== 'string' || !(o.kind in FOOT_KINDS)) return null;
  if (![o.i0, o.k0, o.i1, o.k1, o.door, o.w].every(isInt) || !isNum(o.done)) return null;
  const kind = o.kind as FootKind;
  const rect = rectOf(o.i0 as number, o.k0 as number, o.i1 as number, o.k1 as number);
  if (sizeFault(kind, rect)) return null;
  const far = cellOf(PLOT_BOX.x0) - NEAR > rect.i0 || cellOf(PLOT_BOX.x1) + NEAR < rect.i1 || cellOf(PLOT_BOX.z0) - NEAR > rect.k0 || cellOf(PLOT_BOX.z1) + NEAR < rect.k1;
  if (far || (o.door as number) < 0 || (o.door as number) > 3) return null;
  const cost: Materials = {};
  if (typeof o.cost === 'object' && o.cost !== null && !Array.isArray(o.cost))
    for (const m of MATERIAL_IDS) {
      const n = (o.cost as Record<string, unknown>)[m];
      if (isInt(n) && n > 0 && n <= 999) cost[m] = n;
    }
  return { uid: o.uid, kind, rect, door: o.door as FootSide, done: Math.min(1, Math.max(0, o.done as number)), written: Math.max(0, o.w as number), cost };
}

const isList = (v: unknown): v is never[] => Array.isArray(v);

function load(): void {
  for (const v of progress.get(KEY, [], isList) as unknown[]) {
    const r = readOne(v);
    if (!r || list.length >= MOST || list.some((q) => q.uid === r.uid) || count(r.kind) >= FOOT_KINDS[r.kind].most) continue;
    // (never one over another: an edited save)
    if (partsOf(r).some((p) => overFeet(p, 0, null))) continue;
    list.push(r);
  }
}

function save(): void {
  pending = false;
  since = 0;
  if (!progress.saving) return;
  progress.set(
    KEY,
    list.map((r) => ({ uid: r.uid, kind: r.kind, ...r.rect, door: r.door, done: Math.round(r.done * 1000) / 1000, w: r.written, cost: r.cost })),
  );
}

function emit(type: FootEventType, rec: FootRec): void {
  for (const fn of listeners)
    try {
      fn(type, rec);
    } catch (e) {
      console.error('[foot] a listener failed:', e);
    }
}

function count(kind: FootKind): number {
  let n = 0;
  for (const r of list) if (r.kind === kind) n++;
  return n;
}

// ── The land a record takes ─────────────────────────────────────────────────

/**
 * A record's parts (cells, footPlan.ts `FootPart`), before its plan can be made (no ground yet): the footprint grown
 * by its eaves (a roofed kind), a fence's lines; the house's stair from its plan once there is ground.
 */
function partsOf(r: FootRec): readonly FootPart[] {
  if (ground) return planOf(r).parts;
  const { i0, k0, i1, k1 } = r.rect;
  if (r.kind !== 'fence') return [{ i0: i0 - 1, k0: k0 - 1, i1: i1 + 1, k1: k1 + 1, h: 10, level: 99 }];
  const line = i0 === i1 || k0 === k1;
  if (line) return [{ i0, k0, i1, k1, h: 2, level: 99 }];
  return [
    { i0, k0, i1, k1: k0, h: 2, level: 99 },
    { i0: i1, k0, i1, k1, h: 2, level: 99 },
    { i0, k0: k1, i1, k1, h: 2, level: 99 },
    { i0, k0, i1: i0, k1, h: 2, level: 99 },
  ];
}

/** A footprint of its own size, filled in place. */
export type PartFoot = { id: 'foot'; x: number; z: number; yaw: number; w: number; d: number };

/** A part (cells) as a footprint on the map (m: its middle, its size; along the axes). */
export function partFoot(p: Pick<FootPart, 'i0' | 'k0' | 'i1' | 'k1'>, out: PartFoot = { id: 'foot', x: 0, z: 0, yaw: 0, w: 0, d: 0 }): PartFoot {
  const x0 = cellMin(p.i0);
  const x1 = cellMin(p.i1 + 1);
  const z0 = cellMin(p.k0);
  const z1 = cellMin(p.k1 + 1);
  out.x = (x0 + x1) / 2;
  out.z = (z0 + z1) / 2;
  out.w = x1 - x0;
  out.d = z1 - z0;
  out.yaw = 0;
  return out;
}

const _pf: PartFoot = { id: 'foot', x: 0, z: 0, yaw: 0, w: 0, d: 0 };
/** Would `p` (cells) stand in a record's land (`ignore`: one not to count)? Touching is allowed (`m` < 0: that much). */
function overFeet(p: FootPart, m: number, ignore: FootRec | null): boolean {
  const f = partFoot(p, { id: 'foot', x: 0, z: 0, yaw: 0, w: 0, d: 0 });
  return feetOver(f, m, ignore);
}
/** Would footprint `f` (grown by `m`) stand in a record's land? */
function feetOver(f: Foot, m: number, ignore: FootRec | null = null): boolean {
  for (const r of list) {
    if (r === ignore) continue;
    for (const p of partsOf(r)) if (overlap(f, partFoot(p, _pf), m)) return true;
  }
  return false;
}

// ── The list ────────────────────────────────────────────────────────────────

/** Write (or take away) a record's plan's blocks from `written` to `to` (one change of the layer). */
function writeTo(rec: FootRec, to: number): void {
  const plan = planOf(rec);
  const n = Math.max(0, Math.min(plan.n, to));
  if (n === rec.written) return;
  const { cells, raws } = plan;
  BLOCKS.batch(() => {
    if (n > rec.written) for (let b = rec.written; b < n; b++) BLOCKS.setRaw(cells[b * 3], cells[b * 3 + 1], cells[b * 3 + 2], raws[b]);
    else for (let b = rec.written - 1; b >= n; b--) BLOCKS.setRaw(cells[b * 3], cells[b * 3 + 1], cells[b * 3 + 2], 0);
  });
  rec.written = n;
}

export const FOOTS = {
  get list(): readonly FootRec[] {
    return list;
  },
  count,
  byUid(uid: string): FootRec | null {
    return list.find((r) => r.uid === uid) ?? null;
  },
  on(fn: (type: FootEventType, rec: FootRec) => void): void {
    listeners.push(fn);
  },
  /** The plan of a record (its blocks in order, its parts, its cost). */
  plan: planOf,
  /** The land a record takes. */
  parts: partsOf,

  /**
   * The land's height (once roaming is built): the plans can be made from then on. A record whose blocks are all
   * missing from the layer (a block save that did not load) has them written again.
   */
  init(heightAt: (x: number, z: number) => number): void {
    if (ground) return;
    ground = heightAt;
    for (const r of list) {
      const plan = planOf(r);
      r.written = Math.min(r.written, plan.n);
      // (its blocks so far that the saved build lacks — a block save behind the list, or one that did not load —
      // written again: the building stands as far as its record says; nothing of it is ever taken out here)
      let gone = 0;
      BLOCKS.batch(() => {
        for (let b = 0; b < r.written; b++) {
          const i = plan.cells[b * 3];
          const j = plan.cells[b * 3 + 1];
          const k = plan.cells[b * 3 + 2];
          if (BLOCKS.raw(i, j, k)) continue;
          BLOCKS.setRaw(i, j, k, plan.raws[b]);
          gone++;
        }
      });
      if (gone) console.warn(`[foot] ${r.uid}: ${gone} of its ${r.written} blocks were missing from the saved build, written again`);
    }
  },

  /** A new building (paid for): nothing standing yet (or as far as `done`: a check's). Null: he has all of its kind. */
  add(kind: FootKind, rect: FootRect, door: FootSide, cost: Materials, done = 0): FootRec | null {
    if (count(kind) >= FOOT_KINDS[kind].most) return null;
    let n = 1;
    for (const r of list) if (r.kind === kind) n = Math.max(n, Number(r.uid.slice(kind.length + 1)) + 1 || n);
    const rec: FootRec = { uid: `${kind}-${n}`, kind, rect, door, done: 0, written: 0, cost: { ...cost } };
    list.push(rec);
    BUILT.version++;
    emit('added', rec);
    if (done > 0) this.setDone(rec, done);
    save();
    return rec;
  },

  /** How far it is built (0‥1): its blocks follow, a step at a time (all of them at 0 and 1). */
  setDone(rec: FootRec, v: number): void {
    if (!list.includes(rec)) return;
    const d = Math.min(1, Math.max(0, v));
    const was = rec.done;
    rec.done = d;
    const plan = planOf(rec);
    const to = d >= 1 ? plan.n : Math.floor(d * plan.n);
    const step = Math.max(1, Math.ceil(plan.n / STEPS));
    if (d >= 1 || d <= 0 || Math.abs(to - rec.written) >= step) writeTo(rec, to);
    if (d >= 1 && was < 1) {
      // (the blocks saved first, then the list: one task, so a closed tab keeps both or neither)
      saveBlocksNow();
      save();
      emit('done', rec);
      return;
    }
    pending = true;
    emit('progress', rec);
  },

  /** Taken down: every block of its plan away, gone from the list. */
  remove(rec: FootRec): void {
    const at = list.indexOf(rec);
    if (at < 0) return;
    const plan = planOf(rec);
    BLOCKS.batch(() => {
      for (let b = 0; b < plan.n; b++) BLOCKS.setRaw(plan.cells[b * 3], plan.cells[b * 3 + 1], plan.cells[b * 3 + 2], 0);
    });
    list.splice(at, 1);
    plans.delete(rec.uid);
    BUILT.version++;
    // (its blocks' removal saved at once, then the list without it, in one task: no block of it can come back on a
    // reload with no building to take it down)
    saveBlocksNow();
    save();
    emit('removed', rec);
  },

  /** Each frame: what waits is saved once a second (or now). */
  tick(dt: number, now = false): void {
    if (!pending) return;
    since += dt;
    if (now || since >= SAVE_EVERY) save();
  },

  /** Every building taken away with its blocks (a check's `foot=0`; not saved in a shot). */
  clear(): void {
    while (list.length) this.remove(list[list.length - 1]);
  },

  /** Blocks still to come of the buildings under way (his land's budget counts them as taken). */
  pending(): number {
    let n = 0;
    for (const r of list) if (r.done < 1) n += planOf(r).n - r.written;
    return n;
  },

  /** What taking one down gives back: half its materials (rounded down). */
  back(rec: FootRec): { cost: Materials; riel: number } {
    const cost: Materials = {};
    for (const m of MATERIAL_IDS) if (Math.floor((rec.cost[m] ?? 0) / 2) > 0) cost[m] = Math.floor((rec.cost[m] ?? 0) / 2);
    return { cost, riel: 0 };
  },

  /** How far (x, z) is from a record's land (m; 0 in it). */
  distTo(rec: FootRec, x: number, z: number): number {
    let d = Infinity;
    for (const p of partsOf(rec)) d = Math.min(d, distTo(partFoot(p, _pf), x, z));
    return d;
  },

  /** A footprint's parts would stand in a record's land (touching allowed). */
  over(parts: readonly FootPart[], ignore: FootRec | null = null): boolean {
    return parts.some((p) => overFeet(p, -0.03, ignore));
  },

  /**
   * A check's buildings (`foot=<kind>@x0/z0/x1/z1[/door][:done],…`: two corners in metres, on the block grid; the door
   * side 0 north, 1 east, 2 south, 3 west (2 if left out); done 0‥1, 1 if left out). Returns how many were added.
   */
  fromUrl(v: string): number {
    let n = 0;
    for (const part of v.split(',')) {
      const m = /^([a-z]+)@(-?[\d.]+)\/(-?[\d.]+)\/(-?[\d.]+)\/(-?[\d.]+)(?:\/([0-3]))?(?::([\d.]+))?$/.exec(part.trim());
      if (!m || !(m[1] in FOOT_KINDS)) {
        if (part.trim()) console.warn(`[foot] foot=: "${part}" is not <kind>@x0/z0/x1/z1[/door][:done] (kinds: ${FOOT_KIND_IDS.join(', ')})`);
        continue;
      }
      const kind = m[1] as FootKind;
      const rect = rectOf(cellOf(Number(m[2])), cellOf(Number(m[3])), cellOf(Number(m[4]) - 0.001), cellOf(Number(m[5]) - 0.001));
      const fault = sizeFault(kind, rect);
      if (fault) {
        console.warn(`[foot] foot=: "${part}" is too ${fault} for a ${kind}`);
        continue;
      }
      const door = (m[6] === undefined ? 2 : Number(m[6])) as FootSide;
      const done = m[7] === undefined ? 1 : Number(m[7]);
      const plan = footPlan(kind, rect, door);
      if (this.add(kind, rect, door, plan.cost, done)) n++;
      else console.warn(`[foot] foot=: no more than ${FOOT_KINDS[kind].most} × ${kind}`);
    }
    return n;
  },

  /** The buildings as a check's `foot=` (bug reports), or null. */
  report(): string | null {
    if (!list.length) return null;
    const m = (c: number) => +cellMin(c).toFixed(2);
    return list.map((r) => `${r.kind}@${m(r.rect.i0)}/${m(r.rect.k0)}/${m(r.rect.i1 + 1)}/${m(r.rect.k1 + 1)}/${r.door}${r.done < 1 ? `:${r.done.toFixed(3)}` : ''}`).join(',');
  },
};

load();
BUILT.feet = (x: number, z: number, r: number): boolean => {
  for (const rec of list) if (FOOTS.distTo(rec, x, z) < r) return true;
  return false;
};
BUILT.feetOver = (f: Foot, m: number): boolean => feetOver(f, m);
