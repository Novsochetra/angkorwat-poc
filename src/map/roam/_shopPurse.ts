import type { ConsumeKind, Shop, ShopItem } from '../shop';
import type { Lang } from '../types';
import { lang, num } from '../ui/lang';

/**
 * The explorer's purse and his bag of snacks (buying while roaming:
 * _shop.ts). Riel only (៛, 4 000 ≈ 1 US$). A calm game: money should
 * rarely stop anyone from tasting something, so there is pocket money:
 *
 * - every visit starts with at least `POCKET` (20 000 ៛: a meal, a coconut,
 *   a cake and a coffee, and some over);
 * - every dawn of the map's day (`clock` passing 0.75, the day cycle's six
 *   minutes) the purse is topped up to `POCKET` again, and so it is after
 *   `POCKET_EVERY` s of roaming where the time of day stands still (the
 *   day or night setting). It is never taken away: what is over `POCKET`
 *   stays.
 *
 * What he keeps for later (`CARRY_MAX` things at most) goes in his bag,
 * with what it is (its names, how it is eaten, its colours) so it can be
 * eaten after its stall has closed or on another visit. `tasted` counts the
 * dishes and drinks he has had (by item id: a coconut is a coconut at every
 * stall).
 *
 * Kept in this browser (localStorage `PURSE_KEY`, versioned, every access in
 * try / catch: private windows just forget). Shots never save. URL (checks):
 * `buy=0` starts clean (`POCKET`, nothing kept) and saves nothing ·
 * `purse=<riel>` that much in the purse (saves nothing) · `kept=<item>,…`
 * he carries those (item ids of the registered shops, e.g. `numKrok`).
 */

export const PURSE_KEY = 'angkor-map-purse-v1';
/** Pocket money: the purse is topped up to this at the start of a visit and each dawn (riel). */
export const POCKET = 20_000;
/** Where the time of day stands still, pocket money comes this often (s of roaming: one day of the cycle). */
export const POCKET_EVERY = 360;
/** Things he carries at most (kept for later). */
export const CARRY_MAX = 3;

/** One thing in his bag: which shop and item it came from, and enough to eat it without them. */
export interface Kept {
  shop: string;
  id: string;
  name: Record<Lang, string>;
  consume: ConsumeKind;
  colors?: number[];
}

export interface Purse {
  readonly riel: number;
  readonly kept: readonly Kept[];
  /** Dishes and drinks he has had, by item id: how many times. */
  readonly tasted: Readonly<Record<string, number>>;
  /** Pay `n` riel; false (nothing taken) when he has not that much. */
  pay(n: number): boolean;
  /** Put a thing in his bag; false when it is full. */
  keep(k: Kept): boolean;
  /** Take thing `i` out of his bag (to eat it), or null. */
  take(i: number): Kept | null;
  /** He had it (a dish or a drink: its item id). */
  taste(id: string): void;
  /** Pocket money: top the purse up to `POCKET`; returns what it added (0: he had that much). */
  pocket(): number;
  /** Something changed (the riel, the bag): the interface shows it again. */
  onChange(fn: () => void): void;
}

interface Saved {
  v: 1;
  riel: number;
  kept: Kept[];
  tasted: Record<string, number>;
}

/** A thing from a shop's item, for the bag. */
export function keptOf(s: Shop, item: ShopItem): Kept {
  return { shop: s.id, id: item.id, name: item.name, consume: item.consume, ...(item.colors ? { colors: item.colors } : {}) };
}

/**
 * Riel as the stalls write it: `៤,០០០ ៛` in Khmer (Khmer digits), `4,000 ៛`
 * in English (a thin no-break space before the sign).
 */
export function riel(n: number): string {
  const s = Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${num(s)} ៛`;
}

/** A thing's (or an item's) name in the language in use. */
export const nameOf = (k: { name: Record<Lang, string> }): string => k.name[lang()];

/** `find(id)`: the shop and item for an item id (`shop:item`, or the first shop selling `item`), for the URL's `kept=`. */
export function createPurse(params: URLSearchParams, shot: boolean, find: (id: string) => Kept | null): Purse {
  const url = params.has('purse') ? Number(params.get('purse')) : NaN;
  const saving = !shot && params.get('buy') !== '0' && !Number.isFinite(url);
  const state: Saved = saving ? load() : { v: 1, riel: 0, kept: [], tasted: {} };
  // (a visit starts with pocket money; a check's own amount instead)
  state.riel = Number.isFinite(url) ? Math.max(0, Math.round(url)) : Math.max(state.riel, POCKET);
  const kp = params.get('kept');
  if (kp)
    state.kept = kp
      .split(',')
      .map((id) => find(id.trim()))
      .filter((k): k is Kept => !!k)
      .slice(0, CARRY_MAX);
  const listeners: (() => void)[] = [];
  const changed = () => {
    if (saving) save(state);
    for (const fn of listeners) fn();
  };
  if (saving) save(state);

  return {
    get riel() {
      return state.riel;
    },
    get kept() {
      return state.kept;
    },
    get tasted() {
      return state.tasted;
    },
    pay(n) {
      if (state.riel < n) return false;
      state.riel -= n;
      changed();
      return true;
    },
    keep(k) {
      if (state.kept.length >= CARRY_MAX) return false;
      state.kept.push(k);
      changed();
      return true;
    },
    take(i) {
      const k = state.kept[i];
      if (!k) return null;
      state.kept.splice(i, 1);
      changed();
      return k;
    },
    taste(id) {
      state.tasted[id] = (state.tasted[id] ?? 0) + 1;
      changed();
    },
    pocket() {
      const add = Math.max(0, POCKET - state.riel);
      if (add > 0) {
        state.riel += add;
        changed();
      }
      return add;
    },
    onChange(fn) {
      listeners.push(fn);
    },
  };
}

function save(s: Saved): void {
  try {
    localStorage.setItem(PURSE_KEY, JSON.stringify(s));
  } catch {
    /* no storage: kept until the page closes */
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const CONSUME: readonly ConsumeKind[] = ['noodles', 'riceBowl', 'skewer', 'fruit', 'sweet', 'coconut', 'cupDrink', 'bagDrink', 'bottle'];

/** The saved purse (or an empty one: none yet, another version, broken, or no storage); only records of the right shape come in. */
function load(): Saved {
  const empty: Saved = { v: 1, riel: 0, kept: [], tasted: {} };
  try {
    const raw = JSON.parse(localStorage.getItem(PURSE_KEY) ?? 'null') as unknown;
    if (!isRecord(raw) || raw.v !== 1) return empty;
    const kept = Array.isArray(raw.kept) ? raw.kept.map(toKept).filter((k): k is Kept => !!k).slice(0, CARRY_MAX) : [];
    const tasted: Record<string, number> = {};
    if (isRecord(raw.tasted)) for (const [k, v] of Object.entries(raw.tasted)) if (isNum(v) && v > 0) tasted[k] = Math.round(v);
    return { v: 1, riel: isNum(raw.riel) ? Math.max(0, Math.round(raw.riel)) : 0, kept, tasted };
  } catch {
    return empty;
  }
}

function toKept(r: unknown): Kept | null {
  if (!isRecord(r) || typeof r.shop !== 'string' || typeof r.id !== 'string' || !CONSUME.includes(r.consume as ConsumeKind)) return null;
  const n = r.name;
  if (!isRecord(n) || typeof n.km !== 'string' || typeof n.en !== 'string') return null;
  const colors = Array.isArray(r.colors) && r.colors.every(isNum) ? (r.colors as number[]) : undefined;
  return { shop: r.shop, id: r.id, name: { km: n.km, en: n.en }, consume: r.consume as ConsumeKind, ...(colors ? { colors } : {}) };
}
