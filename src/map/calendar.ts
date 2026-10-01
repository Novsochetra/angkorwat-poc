import { TIME, type MapMoment } from './time';
import type { WordKey } from './ui/lang';

/**
 * The calendar of what happens on the map, and when: the festivals (the Water
 * Festival, Khmer New Year, Pchum Ben, Visak Bochea), the day's moments (the
 * monks' alms round at dawn, the morning market, the apsara dancers at night…)
 * and the rare ones (the equinox sunrise over Angkor Wat). Each part that makes
 * an event happen registers it here (`registerEvent`), with the same rule it
 * plays by (`on`); the roaming calendar (roam/_calendar*.ts) lists them, says
 * how long until the next one, and can wait for it (time.ts `skipTo`).
 *
 * No three.js, nothing per frame: `nextOf` is worked out when asked.
 */

export type EventKind = 'festival' | 'daily' | 'rare';

export interface CalendarEvent {
  /** Unique, e.g. `water`, `dakbat`, `equinox`. */
  id: string;
  kind: EventKind;
  /** Its name and a line of what happens (ui/lang.ts). */
  name: WordKey;
  note: WordKey;
  /** Where it happens (m, map x and z), for the maps and "Go there"; null: all over the map. */
  where: { x: number; z: number } | null;
  /** On at this moment (the same rule the part plays it by). */
  on(m: MapMoment): boolean;
  /** How finely to look for its start (days of the cycle; default `STEP`): less than its shortest window. */
  step?: number;
}

/** Days of the cycle between looks for a start (≈ 15 min of the map's day, 4 s of play). */
export const STEP = 1 / 96;
/** How far ahead to look (days of the cycle: about five of the map's years). */
export const HORIZON = 120;

export const CALENDAR: CalendarEvent[] = [];

/** A part adds its event (one with the same id replaces the old one). */
export function registerEvent(e: CalendarEvent): void {
  const i = CALENDAR.findIndex((o) => o.id === e.id);
  if (i >= 0) CALENDAR[i] = e;
  else CALENDAR.push(e);
}

export interface EventTime {
  /** On now. */
  now: boolean;
  /** When it (last) began, or begins next (days of the cycle); NaN when not within `HORIZON`. */
  start: number;
  /** When it ends (days of the cycle; NaN when not found). */
  end: number;
}

/**
 * When `e` is on next, from `from` days of the cycle (default now): on now (and since when, until when), or when it
 * begins next and ends; NaN when not within `horizon` days.
 */
export function nextOf(e: CalendarEvent, from = TIME.days(), horizon = HORIZON): EventTime {
  const step = e.step ?? STEP;
  const on = (d: number) => e.on(TIME.moment(d));
  /** The edge between `a` (state `sa`) and `b`, to a hundredth of a step. */
  const edge = (a: number, b: number, sa: boolean): number => {
    for (let i = 0; i < 7; i++) {
      const m = (a + b) / 2;
      if (on(m) === sa) a = m;
      else b = m;
    }
    return b;
  };
  const scan = (d0: number, want: boolean, dir: 1 | -1, limit: number): number => {
    let d = d0;
    for (let k = 0; k * step < limit; k++) {
      const n = d + dir * step;
      if (on(n) === want) return dir > 0 ? edge(d, n, !want) : edge(n, d, want);
      d = n;
    }
    return NaN;
  };
  if (on(from)) {
    const start = scan(from, false, -1, horizon);
    return { now: true, start: Number.isNaN(start) ? from : start, end: scan(from, false, 1, horizon) };
  }
  const start = scan(from, true, 1, horizon);
  const end = Number.isNaN(start) ? NaN : scan(start + step / 100, false, 1, horizon);
  return { now: false, start, end };
}
