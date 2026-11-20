/**
 * What the player has done and has, kept between visits: his name in Khmer
 * letters, the dog that follows him, his stilt house, the clothes he bought,
 * the red string on his wrist, how many fish he sold… (the roaming add-ons:
 * roam/_addons.ts), the blocks he built (`blocks.plot`: blocks/save.ts).
 * One record in the browser's storage; each add-on keeps its own keys,
 * named with its prefix (`dog.name`, `home.owned`, `name.km`).
 *
 * A value read back is checked by the reader (`progress.get(key, fallback, isOk)`):
 * an old or broken one gives the fallback. Headless shots and `progress=0`
 * keep nothing (they start fresh every time, and save nothing); a shot sets
 * what it needs with its own URL values.
 *
 * Two pages of the map at once (a tab left open from an earlier visit, a phone's
 * suspended tab): a save writes only its own key into the record as it is in the
 * storage now, never this page's whole copy from when it loaded, so an old tab's
 * garden or cattle saving every few seconds does not undo what the other tab
 * kept (his bicycle, his dog: AWP-36); a page reads what another one saved
 * (the `storage` event, and before each save).
 *
 * No three.js, nothing per frame.
 */

const KEY = 'angkor-map-progress-v1';

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

interface Saved {
  v: 1;
  values: Record<string, Json>;
}

const params = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
/** Saving: the live page (not a headless shot, not `progress=0`). */
const saving = params.get('shot') !== '1' && params.get('progress') !== '0' && typeof localStorage !== 'undefined';

/** The record's text as this page last read or wrote it (a different one in the storage: another page saved). */
let seen: string | null = null;

function load(): Saved {
  const empty: Saved = { v: 1, values: {} };
  if (!saving) return empty;
  try {
    seen = localStorage.getItem(KEY);
    return parse(seen, empty);
  } catch (e) {
    return broken(String(e).slice(0, 120), empty);
  }
}

function parse(text: string | null, empty: Saved): Saved {
  try {
    const raw = JSON.parse(text ?? 'null') as unknown;
    if (raw === null) return empty;
    if (typeof raw !== 'object' || (raw as Saved).v !== 1) return broken('not version 1', empty);
    const values = (raw as Saved).values;
    if (typeof values !== 'object' || values === null || Array.isArray(values)) return broken('no values', empty);
    return { v: 1, values: values as Record<string, Json> };
  } catch (e) {
    return broken(String(e).slice(0, 120), empty);
  }
}

/** A saved record that cannot be read: said in the console (it is written over at the next change). */
function broken(why: string, empty: Saved): Saved {
  console.warn(`[progress] the saved progress could not be read (${why}): starting fresh`);
  return empty;
}

const state = load();
const listeners: ((key: string) => void)[] = [];

/** What another page saved since this one last read or wrote the record (kept as this page's values; none, or unreadable: as they are). */
function catchUp(text: string | null): void {
  if (text === seen || text === null) return;
  seen = text;
  const none: Saved = { v: 1, values: {} };
  const other = parse(text, none);
  if (other !== none) state.values = other.values;
}

if (saving && typeof addEventListener === 'function')
  addEventListener('storage', (e) => {
    if (e.key === KEY) catchUp(e.newValue);
  });

export interface Progress {
  /** The value kept under `key`, or `fallback` (none yet, or it fails `isOk`). */
  get<T extends Json>(key: string, fallback: T, isOk?: (v: unknown) => v is T): T;
  /** Keep `value` under `key` (null forgets it). */
  set(key: string, value: Json): void;
  /** Something changed (its key). */
  onChange(fn: (key: string) => void): void;
  /** Kept between visits (false in shots and with `progress=0`). */
  readonly saving: boolean;
}

export const progress: Progress = {
  get<T extends Json>(key: string, fallback: T, isOk?: (v: unknown) => v is T): T {
    const v = state.values[key];
    if (v === undefined) return fallback;
    if (isOk ? !isOk(v) : typeof v !== typeof fallback) return fallback;
    return v as T;
  },
  set(key, value) {
    if (saving)
      try {
        catchUp(localStorage.getItem(KEY));
      } catch {
        /* no storage */
      }
    if (value === null) delete state.values[key];
    else state.values[key] = value;
    if (saving)
      try {
        const text = JSON.stringify(state);
        localStorage.setItem(KEY, text);
        seen = text;
      } catch {
        /* no storage: kept until the page closes */
      }
    for (const fn of listeners) fn(key);
  },
  onChange(fn) {
    listeners.push(fn);
  },
  saving,
};
