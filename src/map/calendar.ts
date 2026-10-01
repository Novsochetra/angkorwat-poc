import { TIME, type MapMoment } from './time';
import type { WordKey } from './ui/lang';

/**
 * The calendar of what happens on the map, and when: the festivals (the Water
 * Festival, Khmer New Year, Pchum Ben, Visak Bochea), the day's moments (the
 * monks' alms round at dawn, the morning market, the apsara dancers at night…),
 * the seasons (rice planting, the harvest, the kites) and the rare ones (the
 * equinox sunrise over Angkor Wat). Each part that makes an event happen
 * registers it here (`registerEvent`), with the same rule it plays by (`on`);
 * the roaming calendar (roam/_calendar*.ts: key 9, the card, the toasts, the
 * gold marks on the maps) lists them, says how long until the next one, and
 * can wait for it (time.ts `skipTo`).
 *
 * A new event needs only its registration: the card shows any (its icon by
 * id in roam/_calendarIcons.ts `EVENT_ART`, else by kind), the toasts and the
 * maps follow. Words in ui/lang.ts (`name`, `note`, `place`, `begins`).
 *
 * No three.js, nothing per frame: `nextOf` is worked out when asked.
 */

/** A festival (once a year, by the moon and the season), a moment of the day, a time of the year, or a rare moment. */
export type EventKind = 'festival' | 'daily' | 'season' | 'rare';

/** A span of real days in Cambodia: its first and last day (local dates, at noon), and its main day in the Khmer lunar calendar. */
export interface RealSpan {
  first: Date;
  last: Date;
  /** The main day's lunar date (roam/_calendarKhmer.ts: `month` index, `day` 0‥29: 14 the full moon), when it goes by the moon. */
  lunar?: { month: number; day: number };
}

export interface CalendarEvent {
  /** Unique, e.g. `water`, `dakbat`, `equinox`. */
  id: string;
  kind: EventKind;
  /** Its name and a line of what happens (ui/lang.ts). */
  name: WordKey;
  note: WordKey;
  /** Where it happens (m, map x and z), for the maps and "Show on map"; null: all over the map (or not known yet). */
  where: { x: number; z: number } | null;
  /** On at this moment (the same rule the part plays it by). */
  on(m: MapMoment): boolean;
  /** How finely to look for its start (days of the cycle; default `STEP`): less than its shortest window. */
  step?: number;
  /** Where it happens in words ("Sugar Palm Village"), for the card and the toast. */
  place?: WordKey;
  /** What the toast says as it begins ("The morning market is open"); default: its name. */
  begins?: WordKey;
  /** On at this moment as the map shows it now, when a URL may hold it (`fest=`); default `on`. */
  shown?(m: MapMoment): boolean;
  /** How far ahead to look for it (days of the cycle; default `HORIZON`). */
  horizon?: number;
  /** A daily one's toast as it begins comes only this near (m; default `NEAR`), or the first time in a visit. */
  near?: number;
  /**
   * While the clock stands still in the day (the Time setting "Day"): an event that runs on a loop of its own
   * then (events.ts: the elephants, the monkeys): on now, and seconds of play to its next start (NaN: none).
   * Absent: it waits for the clock to run (or is on all along, as `on` says at the held moment).
   */
  heldDay?(): { on: boolean; next: number };
  /** The next time it happens in Cambodia in real life, from the real day `from` (still on that day counts): its days. */
  real?(from: Date): RealSpan | null;
}

/** Days of the cycle between looks for a start (≈ 15 min of the map's day, 4 s of play). */
export const STEP = 1 / 96;
/** How far ahead to look (days of the cycle: about five of the map's years). */
export const HORIZON = 120;
/** A daily event's toast as it begins: he is this near (m). */
export const NEAR = 260;

export const CALENDAR: CalendarEvent[] = [];

/** A part adds its event (one with the same id replaces the old one). */
export function registerEvent(e: CalendarEvent): void {
  const i = CALENDAR.findIndex((o) => o.id === e.id);
  if (i >= 0) CALENDAR[i] = e;
  else CALENDAR.push(e);
}

/** An event by its id (null: none). */
export const eventById = (id: string): CalendarEvent | null => CALENDAR.find((e) => e.id === id) ?? null;

/**
 * What is on now, for the maps (ui/minimap.ts draws a gold mark where each is): the roaming calendar
 * (roam/_calendar.ts) writes it twice a second while roaming; `n` counts its changes.
 */
export const ON_NOW: { events: CalendarEvent[]; n: number } = { events: [], n: 0 };

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
export function nextOf(e: CalendarEvent, from = TIME.days(), horizon = e.horizon ?? HORIZON): EventTime {
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
