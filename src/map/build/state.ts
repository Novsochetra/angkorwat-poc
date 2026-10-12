import { progress } from '../progress';
import { BUILT, PIECE_IDS, PIECES, type Built, type PieceId } from './pieces';

/**
 * What he has built at home (the build add-on, roam/_build*.ts; the pieces and
 * their numbers: build/pieces.ts), kept between visits: each piece's place, its
 * turn, how far it is built (a piece left half built stays half built) and its
 * seeded variety. No three.js: the add-on, the view (build/view.ts), the walk
 * map (roam/_buildWalk.ts), the garden and his cattle read the same list
 * (`BUILT` in pieces.ts is kept up to date here: `list`, `version`, `blocks`).
 *
 * - **Saved**: progress.ts `build.pieces` (a list of `{ uid, id, x, y, z, yaw,
 *   done, seed }`), written on every change, and at most once a second while a
 *   piece rises (`progress`). Shots and `progress=0` keep nothing.
 * - **Footprints**: a piece's footprint is its `w × d` box round its middle,
 *   turned by its `yaw` (pieces.ts "A piece's frame"). `distTo` is how far a
 *   point is from one (0 inside), `overlap` whether two would overlap.
 * - **Events** (`on`): `added` (paid for, nothing standing yet), `progress` (a
 *   block more), `done` (it stands: its seat, its hammock, its spirit house's
 *   prayer spot are used from then on), `removed` (taken down).
 */

type Mut = { -readonly [K in keyof Built]: Built[K] };

export type BuildEventType = 'added' | 'progress' | 'done' | 'removed';
export interface BuildEvent {
  readonly type: BuildEventType;
  readonly piece: Built;
}

const KEY = 'build.pieces';
/** While a piece rises, it is saved at most this often (s of play). */
const SAVE_EVERY = 1;

const list: Mut[] = [];
const listeners: ((e: BuildEvent) => void)[] = [];
/** The list as saved last (progress' sake): seconds since, and whether something waits. */
let pending = false;
let sinceSave = 0;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** One saved piece, checked (an old or broken one is left out). */
function readOne(v: unknown): Mut | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.uid !== 'string' || typeof o.id !== 'string' || !(o.id in PIECES)) return null;
  if (!isNum(o.x) || !isNum(o.y) || !isNum(o.z) || !isNum(o.yaw) || !isNum(o.done) || !isNum(o.seed)) return null;
  return { uid: o.uid, id: o.id as PieceId, x: o.x, y: o.y, z: o.z, yaw: o.yaw, done: Math.min(1, Math.max(0, o.done)), seed: o.seed };
}

const isList = (v: unknown): v is never[] => Array.isArray(v);

function load(): void {
  const raw = progress.get(KEY, [], isList) as unknown[];
  for (const v of raw) {
    const p = readOne(v);
    // (no more of a kind than it may have: an edited save cannot fill the meadow)
    if (p && !list.some((q) => q.uid === p.uid) && count(p.id) < PIECES[p.id].max) list.push(p);
  }
}

function save(): void {
  pending = false;
  sinceSave = 0;
  if (!progress.saving) return;
  progress.set(
    KEY,
    list.map((p) => ({ uid: p.uid, id: p.id, x: round(p.x, 100), y: round(p.y, 100), z: round(p.z, 100), yaw: round(p.yaw, 1000), done: round(p.done, 1000), seed: round(p.seed, 1000) })),
  );
}

const round = (v: number, k: number) => Math.round(v * k) / k;

function emit(type: BuildEventType, piece: Built): void {
  BUILT.version++;
  for (const fn of listeners)
    try {
      fn({ type, piece });
    } catch (e) {
      console.error('[build] a listener failed:', e);
    }
}

/** How many of a kind he has (standing or under way). */
function count(id: PieceId): number {
  let n = 0;
  for (const p of list) if (p.id === id) n++;
  return n;
}

/** A number 0‥1 from a place (the same every time: never Math.random). */
export function seedAt(x: number, z: number): number {
  const v = Math.sin(x * 12.9898 + z * 78.233 + 4.17) * 43758.5453;
  return v - Math.floor(v);
}

// ── Footprints ──────────────────────────────────────────────────────────────

/** What a footprint needs: the piece's kind, its middle and its turn. */
export interface Foot {
  readonly id: PieceId;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

/** A world point (x, z) in a piece's frame (into `out`: local x, z). */
export function toLocal(b: Pick<Foot, 'x' | 'z' | 'yaw'>, x: number, z: number, out: [number, number]): [number, number] {
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  const dx = x - b.x;
  const dz = z - b.z;
  out[0] = dx * c - dz * s;
  out[1] = dx * s + dz * c;
  return out;
}

const _l: [number, number] = [0, 0];

/** How far (x, z) is from a piece's footprint (m; 0 inside it). */
export function distTo(b: Foot, x: number, z: number): number {
  toLocal(b, x, z, _l);
  const p = PIECES[b.id];
  const ex = Math.max(0, Math.abs(_l[0]) - p.w / 2);
  const ez = Math.max(0, Math.abs(_l[1]) - p.d / 2);
  return Math.hypot(ex, ez);
}

/** Half a footprint's reach along a world direction (ux, uz unit), grown by `m`. */
function reach(b: Foot, ux: number, uz: number, m: number): number {
  const p = PIECES[b.id];
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  // (its local x axis on the map is (c, −s), its local z axis (s, c): pieces.ts `pieceToWorld`)
  return (p.w / 2 + m) * Math.abs(ux * c - uz * s) + (p.d / 2 + m) * Math.abs(ux * s + uz * c);
}

/** Would two footprints overlap, each grown by `m` (m; negative: they may touch that much)? Separating axes. */
export function overlap(a: Foot, b: Foot, m = 0): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (const f of [a, b]) {
    const c = Math.cos(f.yaw);
    const s = Math.sin(f.yaw);
    for (const [ux, uz] of [
      [c, -s],
      [s, c],
    ] as const) {
      if (Math.abs(dx * ux + dz * uz) >= reach(a, ux, uz, m) + reach(b, ux, uz, m)) return false;
    }
  }
  return true;
}

/** The footprint's middle and corners on the map (into `out`, 4 × [x, z]), grown by `m`. */
export function corners(b: Foot, m: number, out: [number, number][]): [number, number][] {
  const p = PIECES[b.id];
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  const hw = p.w / 2 + m;
  const hd = p.d / 2 + m;
  let i = 0;
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    const lx = sx * hw;
    const lz = sz * hd;
    const o = (out[i++] ??= [0, 0]);
    o[0] = b.x + lx * c + lz * s;
    o[1] = b.z - lx * s + lz * c;
  }
  return out;
}

// ── The list ────────────────────────────────────────────────────────────────

export const BUILD = {
  /** Every piece, in the order he put them up. */
  get list(): readonly Built[] {
    return list;
  },
  /** How many of a kind he has (standing or under way). */
  count,
  byUid(uid: string): Built | null {
    return list.find((p) => p.uid === uid) ?? null;
  },
  /** Something changed (a piece added, a block more, done, taken down). */
  on(fn: (e: BuildEvent) => void): void {
    listeners.push(fn);
  },

  /** A new piece (paid for): nothing standing yet (`done` 0), or as given (a check's). Null: he has all of its kind. */
  add(id: PieceId, x: number, y: number, z: number, yaw: number, done = 0, seed?: number): Built | null {
    if (count(id) >= PIECES[id].max) return null;
    let n = 1;
    for (const p of list) if (p.id === id) n = Math.max(n, Number(p.uid.slice(id.length + 1)) + 1 || n);
    const p: Mut = { uid: `${id}-${n}`, id, x, y, z, yaw: Math.atan2(Math.sin(yaw), Math.cos(yaw)), done: Math.min(1, Math.max(0, done)), seed: seed ?? seedAt(x, z) };
    list.push(p);
    save();
    emit('added', p);
    if (p.done >= 1) emit('done', p);
    return p;
  },

  /** How far it is built now (0‥1): `progress`, or `done` once it reaches 1. Saved at most once a second meanwhile. */
  setDone(b: Built, done: number): void {
    const p = list.find((q) => q === b);
    if (!p) return;
    const v = Math.min(1, Math.max(0, done));
    if (v === p.done) return;
    const was = p.done;
    p.done = v;
    if (v >= 1 && was < 1) {
      save();
      emit('done', p);
      return;
    }
    pending = true;
    emit('progress', p);
  },

  /** Taken down (gone from the list). */
  remove(b: Built): void {
    const i = list.findIndex((q) => q === b);
    if (i < 0) return;
    const [p] = list.splice(i, 1);
    save();
    emit('removed', p);
  },

  /** Each frame: what waits to be saved goes once a second (or now: `now`). */
  tick(dt: number, now = false): void {
    if (!pending) return;
    sinceSave += dt;
    if (now || sinceSave >= SAVE_EVERY) save();
  },

  /** Every piece taken away (a check's `build=0`; not saved). */
  clear(): void {
    while (list.length) {
      const p = list.pop()!;
      emit('removed', p);
    }
  },

  /**
   * A check's pieces (`build=<id>@x/z/yaw[:done],…`, yaw in degrees, done 0‥1 (1 if left out); `ground` the land's
   * height for each). Unknown kinds, bad numbers and more than a kind's `max` are left out (a warning).
   */
  fromUrl(v: string, ground: (x: number, z: number) => number): number {
    let n = 0;
    for (const part of v.split(',')) {
      const m = /^([a-z]+)@(-?[\d.]+)\/(-?[\d.]+)(?:\/(-?[\d.]+))?(?::([\d.]+))?$/.exec(part.trim());
      if (!m || !(m[1] in PIECES)) {
        if (part.trim()) console.warn(`[build] build=: "${part}" is not <id>@x/z/yaw[:done] (ids: ${PIECE_IDS.join(', ')})`);
        continue;
      }
      const id = m[1] as PieceId;
      const x = Number(m[2]);
      const z = Number(m[3]);
      const yaw = ((Number(m[4]) || 0) * Math.PI) / 180;
      const done = m[5] === undefined ? 1 : Number(m[5]);
      if (![x, z, yaw, done].every(Number.isFinite)) continue;
      if (this.add(id, x, ground(x, z), z, yaw, done)) n++;
      else console.warn(`[build] build=: no more than ${PIECES[id].max} × ${id}`);
    }
    return n;
  },

  /** The pieces as a check's `build=` (bug reports), or null. */
  report(): string | null {
    if (!list.length) return null;
    return list.map((p) => `${p.id}@${p.x.toFixed(2)}/${p.z.toFixed(2)}/${((p.yaw * 180) / Math.PI).toFixed(1)}${p.done < 1 ? `:${p.done.toFixed(3)}` : ''}`).join(',');
  },
};

load();
BUILT.list = list;
BUILT.blocks = (x: number, z: number, r: number): boolean => {
  for (const p of list) if (distTo(p, x, z) < r) return true;
  return false;
};
