import { Vector3, type PerspectiveCamera } from 'three';
import type { MapPart, RoamMode, Subject, SubjectKind } from '../types';
import { SPECIES, SPECIES_BY_KIND, STAMP_BY_ID, STAMPS, type StampDef } from './_bookData';
import type { WorshipSpot } from './_worship';
import type { RoamWorld } from './types';

/**
 * The explorer's journal: gentle goals for roaming, no timers.
 *
 * - **Nature book**: when a photo is taken, the living things in it — the
 *   parts' `subjects` (animals, people, bamboo), in the frame, big enough
 *   (near, or zoomed in), not hidden behind stone or land (a ray through
 *   the walk map, roam/world.ts) — fill their pages: the first photo of each
 *   gives its page a picture (a crop round it from the photo), and a soft
 *   message says what is new.
 * - **Temple passport**: a stamp for each of the six places (reaching its
 *   beacon on foot) and each jungle site (walking into its clearing), with
 *   the date; a lotus seal on it when he kneels and prays there (_pray.ts).
 *
 * Kept in this browser (localStorage `STORE`, versioned; the journal still
 * works for the visit without it). The album (V) shows both (_bookUi.ts).
 *
 * Checks: `window.__journal` · URL `stamps=all` / `book=all` fill everything
 * for the visit (not saved; the book without pictures) · `journal=0` starts
 * empty and saves nothing.
 */

/** localStorage key (the version in it: a new shape gets a new key). */
export const STORE = 'angkor-map-journal-v1';

/** A page of the nature book: when it was first photographed, its picture (JPEG data URL, '' if none), where, how many photos. */
export interface PageRecord {
  t: number;
  img: string;
  x: number;
  z: number;
  n: number;
}

/** A stamp: when he got there, and when he prayed there (the lotus seal). */
export interface StampRecord {
  t: number;
  pray?: number;
}

interface Saved {
  v: 1;
  book: Partial<Record<SubjectKind, PageRecord>>;
  stamps: Record<string, StampRecord>;
}

/** Farthest a living thing counts in a photo (m). */
const MAX_DIST = 140;
/** Smallest it may be in the frame: its size over the frame's height (the zoom helps). */
const MIN_SIZE = 0.045;
/** How far in from the frame's edges its middle must be (NDC). */
const EDGE = 0.94;
/** The picture on a page (px, 4:3). */
const THUMB_W = 240;
const THUMB_H = 180;

export interface JournalDeps {
  world: RoamWorld;
  /** The map's parts (read for their `subjects`). */
  parts: readonly MapPart[];
  /** A soft message on screen. */
  toast(text: string): void;
  /** The name to show for a page or a stamp in the language in use. */
  name(what: { kind: SubjectKind } | { stamp: StampDef }): string;
  /** A new page or stamp: words for the message (ui/lang.ts). */
  words: { page(names: string): string; stamp(name: string): string; lotus(name: string): string };
}

export interface Journal {
  readonly book: Readonly<Partial<Record<SubjectKind, PageRecord>>>;
  readonly stamps: Readonly<Record<string, StampRecord>>;
  /**
   * A photo was just taken (right after the frame was drawn: `canvas` still
   * holds it, `camera` is the lens it was taken with): fill the pages of
   * what is in it. Returns the kinds in it (new or not). `occluder`: the
   * explorer himself in a selfie (things behind him do not count).
   */
  photographed(camera: PerspectiveCamera, canvas: HTMLCanvasElement, occluder?: Subject | null): SubjectKind[];
  /** Each roaming step: a stamp for a place or a site he reaches on foot. */
  step(pos: Vector3, mode: RoamMode, grounded: boolean): void;
  /** He finished a prayer at a worship spot (null: not at a known one; `pos`: where he knelt). */
  prayed(spot: WorshipSpot | null, pos: Vector3): void;
  /** The stamp nearest (x, z) within `extra` m of its reach, or null (where a photo was taken, a prayer's place). */
  stampNear(x: number, z: number, extra: number): StampDef | null;
  /** Something changed (a page, a stamp): the album shows it again. */
  onChange(fn: () => void): void;
}

const _v = new Vector3();

/** A living thing in the frame: how far, how big on the picture (its radius over half the frame's height), where (NDC). */
interface Seen {
  s: Subject;
  dist: number;
  size: number;
  x: number;
  y: number;
}

export function createJournal(d: JournalDeps): Journal {
  const params = new URLSearchParams(location.search);
  const saving = params.get('journal') !== '0';
  const state: Saved = saving ? load() : { v: 1, book: {}, stamps: {} };
  const listeners: (() => void)[] = [];
  const found: Subject[] = [];
  // Checks: everything filled for the visit (not saved).
  let demo = false;
  if (params.get('stamps') === 'all') {
    demo = true;
    const t = Date.now();
    STAMPS.forEach((s, i) => (state.stamps[s.id] ??= { t: t - i * 86_400_000, ...(i % 3 === 0 ? { pray: t } : {}) }));
  }
  if (params.get('book') === 'all') {
    demo = true;
    for (const s of SPECIES) state.book[s.kind] ??= { t: Date.now(), img: '', x: 0, z: -160, n: 1 };
  }

  function save(): void {
    if (!saving || demo) return;
    // Full (the pictures)? Keep the words at least: the pages without the
    // newest pictures (dropped one by one, newest first, until it fits).
    const book = { ...state.book };
    const newest = (Object.keys(book) as SubjectKind[]).filter((k) => book[k]?.img).sort((a, b) => book[b]!.t - book[a]!.t);
    for (let dropped = 0; ; dropped++) {
      try {
        localStorage.setItem(STORE, JSON.stringify({ ...state, book }));
        if (dropped) console.warn(`[map] journal: storage full, saved without the ${dropped} newest pictures`);
        return;
      } catch (e) {
        // (private mode, or nothing left to drop: the journal lasts for this visit)
        const full = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');
        if (!full || dropped >= newest.length) return;
        const k = newest[dropped];
        book[k] = { ...book[k]!, img: '' };
      }
    }
  }

  function changed(): void {
    save();
    for (const fn of listeners) fn();
  }

  /** Nothing between the lens and it (walls, stone, the land; not leaves). */
  function inSight(from: Vector3, x: number, y: number, z: number, r: number): boolean {
    const w = d.world;
    const clear = w.hardClearance ?? w.clearance;
    if (!clear) return true;
    const len = Math.hypot(x - from.x, y - from.y, z - from.z);
    if (len < 0.5) return true;
    const free = clear(from.x, from.y, from.z, x, y, z);
    return free * len >= len - Math.max(r, 0.4) - 0.3;
  }

  /** A crop round what is at (u, v) (0‥1 of the view from the top left), `size` of the view's height: a small JPEG. */
  function thumb(canvas: HTMLCanvasElement, u: number, v: number, size: number): string {
    try {
      const W = canvas.width;
      const H = canvas.height;
      let ch = Math.min(H, Math.max(H * 0.3, size * H * 3.2));
      let cw = (ch * THUMB_W) / THUMB_H;
      if (cw > W) {
        cw = W;
        ch = (W * THUMB_H) / THUMB_W;
      }
      const sx = Math.min(W - cw, Math.max(0, u * W - cw / 2));
      const sy = Math.min(H - ch, Math.max(0, v * H - ch / 2));
      const c = document.createElement('canvas');
      c.width = THUMB_W;
      c.height = THUMB_H;
      const g = c.getContext('2d');
      if (!g) return '';
      g.drawImage(canvas, sx, sy, cw, ch, 0, 0, THUMB_W, THUMB_H);
      return c.toDataURL('image/jpeg', 0.8);
    } catch {
      return '';
    }
  }

  function stampNear(x: number, z: number, extra: number): StampDef | null {
    let best: StampDef | null = null;
    let bd = Infinity;
    for (const s of STAMPS) {
      const dd = Math.hypot(s.x - x, s.z - z) - s.reach;
      if (dd < extra && dd < bd) [best, bd] = [s, dd];
    }
    return best;
  }

  function stamp(id: string): boolean {
    if (state.stamps[id]) return false;
    state.stamps[id] = { t: Date.now() };
    return true;
  }

  const api: Journal = {
    get book() {
      return state.book;
    },
    get stamps() {
      return state.stamps;
    },
    photographed(camera, canvas, occluder) {
      found.length = 0;
      for (const p of d.parts) {
        try {
          p.subjects?.(found);
        } catch (e) {
          console.warn(`[map] journal: ${p.name} subjects failed`, e);
        }
      }
      if (occluder) found.push(occluder);
      camera.updateMatrixWorld();
      const eye = camera.getWorldPosition(new Vector3());
      const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
      // Everything in the frame (big things in front hide what is behind them: `seen`).
      const inView: Seen[] = [];
      for (const s of found) {
        const dist = Math.hypot(s.x - eye.x, s.y - eye.y, s.z - eye.z);
        if (dist > MAX_DIST || dist < 0.3) continue;
        _v.set(s.x, s.y, s.z).project(camera);
        if (_v.z > 1 || _v.z < -1 || Math.abs(_v.x) > 1.2 || Math.abs(_v.y) > 1.2) continue;
        inView.push({ s, dist, size: s.r / (dist * tanHalf), x: _v.x, y: _v.y });
      }
      /** Behind something nearer and bigger on the picture (a monk in front of the monkey). */
      const covered = (c: Seen) =>
        inView.some((o) => o !== c && o.dist < c.dist - c.s.r && Math.hypot((o.x - c.x) * camera.aspect, o.y - c.y) + c.size * 0.5 < o.size * 0.85);
      // The best view of each kind in the frame: the biggest, nearest the middle.
      const best = new Map<SubjectKind, { u: number; v: number; size: number; score: number }>();
      for (const c of inView) {
        const s = c.s;
        if (s === occluder || !SPECIES_BY_KIND.has(s.kind) || c.size < MIN_SIZE) continue;
        if (Math.abs(c.x) > EDGE || Math.abs(c.y) > EDGE) continue;
        if (!inSight(eye, s.x, s.y, s.z, s.r) && !inSight(eye, s.x, s.y + s.r * 0.8, s.z, s.r * 0.5)) continue;
        if (covered(c)) continue;
        const score = c.size * (1.4 - Math.hypot(c.x, c.y) * 0.4);
        const b = best.get(s.kind);
        if (!b || score > b.score) best.set(s.kind, { u: (c.x + 1) / 2, v: (1 - c.y) / 2, size: c.size, score });
      }
      if (!best.size) return [];
      const fresh: SubjectKind[] = [];
      for (const [kind, b] of best) {
        const page = state.book[kind];
        if (page) {
          page.n++;
          // (a page filled by a check has no picture yet: the first real one gives it)
          if (!page.img) page.img = thumb(canvas, b.u, b.v, b.size);
          continue;
        }
        state.book[kind] = { t: Date.now(), img: thumb(canvas, b.u, b.v, b.size), x: Math.round(eye.x), z: Math.round(eye.z), n: 1 };
        fresh.push(kind);
      }
      if (fresh.length) d.toast(d.words.page(fresh.map((k) => d.name({ kind: k })).join(', ')));
      changed();
      return [...best.keys()];
    },
    step(pos, mode, grounded) {
      if (mode !== 'walk' || !grounded) return;
      // (the six places: reaching the beacon, as for entering; the jungle sites: into the clearing)
      const place = d.world.placeNear(pos.x, pos.z, pos.y);
      if (place && stamp(place.id)) {
        d.toast(d.words.stamp(d.name({ stamp: STAMP_BY_ID.get(place.id)! })));
        changed();
        return;
      }
      for (const s of STAMPS) {
        if (s.temple || state.stamps[s.id]) continue;
        if (Math.hypot(s.x - pos.x, s.z - pos.z) > s.reach) continue;
        if (Math.abs(d.world.field.heightAt(s.x, s.z) - pos.y) > 8) continue;
        stamp(s.id);
        d.toast(d.words.stamp(d.name({ stamp: s })));
        changed();
        return;
      }
    },
    prayed(spot, pos) {
      const s = (spot?.place && STAMP_BY_ID.get(spot.place)) || stampNear(spot?.x ?? pos.x, spot?.z ?? pos.z, 25);
      if (!s) return;
      const rec = (state.stamps[s.id] ??= { t: Date.now() });
      if (rec.pray) return;
      rec.pray = Date.now();
      d.toast(d.words.lotus(d.name({ stamp: s })));
      changed();
    },
    stampNear,
    onChange(fn) {
      listeners.push(fn);
    },
  };
  Object.assign(window, { __journal: api });
  return api;
}

/**
 * The saved journal (or an empty one: none yet, another version, broken, or
 * no storage). Only records of the right shape come in (an older build's or
 * a hand-edited one may hold anything): a page with numbers for its date
 * and count and a string for its picture, a stamp with a number for its
 * date; anything else is left out.
 */
function load(): Saved {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) {
      const s = JSON.parse(raw) as unknown;
      if (isRecord(s) && s.v === 1) return { v: 1, book: keep(s.book, toPage), stamps: keep(s.stamps, toStamp) };
    }
  } catch {
    /* no storage, or not ours */
  }
  return { v: 1, book: {}, stamps: {} };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The entries of `v` (an object) that `to` accepts, as `to` made them. */
function keep<T>(v: unknown, to: (r: Record<string, unknown>) => T | null): Record<string, T> {
  if (!isRecord(v)) return {};
  const out: [string, T][] = [];
  for (const [k, r] of Object.entries(v)) {
    const rec = isRecord(r) ? to(r) : null;
    if (rec) out.push([k, rec]);
  }
  return Object.fromEntries(out);
}

function toPage(r: Record<string, unknown>): PageRecord | null {
  if (!isNum(r.t) || !isNum(r.n) || typeof r.img !== 'string') return null;
  // (where it was taken: only for the page's "near …"; none, no words)
  return { t: r.t, img: r.img, x: isNum(r.x) ? r.x : NaN, z: isNum(r.z) ? r.z : NaN, n: r.n };
}

function toStamp(r: Record<string, unknown>): StampRecord | null {
  if (!isNum(r.t)) return null;
  return isNum(r.pray) ? { t: r.t, pray: r.pray } : { t: r.t };
}
