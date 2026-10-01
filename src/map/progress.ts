/**
 * What the player has done and has, kept between visits: his name in Khmer
 * letters, the dog that follows him, his stilt house, the clothes he bought,
 * the red string on his wrist, how many fish he sold… (the roaming add-ons:
 * roam/_addons.ts). One record in the browser's storage; each add-on keeps
 * its own keys, named with its prefix (`dog.name`, `home.owned`, `name.km`).
 *
 * A value read back is checked by the reader (`progress.get(key, fallback, isOk)`):
 * an old or broken one gives the fallback. Headless shots and `progress=0`
 * keep nothing (they start fresh every time, and save nothing); a shot sets
 * what it needs with its own URL values.
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

function load(): Saved {
  const empty: Saved = { v: 1, values: {} };
  if (!saving) return empty;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as unknown;
    if (typeof raw !== 'object' || raw === null || (raw as Saved).v !== 1) return empty;
    const values = (raw as Saved).values;
    if (typeof values !== 'object' || values === null || Array.isArray(values)) return empty;
    return { v: 1, values: values as Record<string, Json> };
  } catch {
    return empty;
  }
}

const state = load();
const listeners: ((key: string) => void)[] = [];

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
    if (value === null) delete state.values[key];
    else state.values[key] = value;
    if (saving)
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
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
