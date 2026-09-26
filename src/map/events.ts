import { hash3 } from '../voxel/random';
import type { MapFrame } from './types';
import { festivalNow, type Festival } from './festival/_schedule';

/**
 * The day at Angkor: what happens when (the event clock). It knows the
 * temple's hours and the animals' habits, and tells the parts and the
 * sound; they read it with `eventsNow(f)` (or `EVENTS`, the same object,
 * as it was last worked out). Nothing here draws or plays: it only says.
 *
 * Driven by `f.clock` (0 golden afternoon, 0.25 dusk, 0.5 night, 0.75
 * dawn), `f.day` (each day a little different: seeded) and `f.weather`.
 *
 * Two kinds of event:
 *
 * - At an hour (windows of `f.clock`):
 *   - `dawnChant` 0.72–0.82 (± a little): the monks chant their morning
 *     Pali prayers at Angkor Wat and at the village pagoda, while it is on
 *     (audio/temple.ts);
 *   - `duskDrum` ≈ 0.22–0.26: the pagoda's skor drum at sunset, slow
 *     strokes speeding up to a roll, twice, then the bronze bell (also,
 *     faintly, from Angkor Wat).
 * - In the daylight (windows of `dayPhase`, 0 sunrise … 1 the evening):
 *   - `noonBell` ≈ 0.45 (just before noon: the monks' last meal of the day);
 *   - `elephantBath` ≈ 0.5–0.6: the cow elephant and her calf leave the
 *     valley road for the river below the River Gate (fauna/_landBath.ts);
 *   - `monkeyCrossing` three times a day: a macaque troop runs across the
 *     valley road in a line (fauna/_landCrossing.ts).
 *   None start in a storm (the animals keep under cover then).
 *
 * The daylight follows the clock while it runs (the "cycle" time
 * setting: a day in 6 min). When the clock is held in the day (the
 * default page: always the golden afternoon), the daylight events run on
 * their own loop of `HELD_DAY` s, so a visit still sees the elephants
 * bathe and the monkeys cross. A held clock inside an hour's window
 * (`clock=0.24`) sounds its drum again every `REPEAT` s. The drum begins
 * only as the clock goes forward through its hour in its own time (held or
 * the day's cycle), not when the time of day is switched in the settings
 * (the clock then eases through dusk, day → night and back) or jumps.
 *
 * For people and animals in bad weather: `shelter` (0‥1, the storm: birds
 * stop flying, monkeys huddle), `umbrellas` (0‥1, people open umbrellas
 * in rain) and `hurry` (1‥1.5, people walk faster in rain).
 *
 * Festivals (hooks for later parts): `festival` names the one on now,
 * from the time of the year (`f.season`) and the moon (`f.day`): the same
 * as the festival part's (`festivalNow`, festival/_schedule.ts, `fest=`).
 *
 * URL: `event=<name>` holds one event on from the start (checks: with
 * `t=` it is that far in); stills show daylight events only when asked for
 * (`event=`, or `events=1` for all of them), so the overview stays as it
 * is. `window.__events` is this state (`log`: what began when).
 */

export type TempleEvent = 'dawnChant' | 'duskDrum' | 'noonBell' | 'elephantBath' | 'monkeyCrossing';
export const TEMPLE_EVENTS: readonly TempleEvent[] = ['dawnChant', 'duskDrum', 'noonBell', 'elephantBath', 'monkeyCrossing'];

/** The festival on now (the one the festival part shows: festival/_schedule.ts). */
export type { Festival } from './festival/_schedule';

export interface EventLogEntry {
  name: TempleEvent | 'storm';
  /** Page time (s, `f.t`), the clock and the day when it began. */
  t: number;
  clock: number;
  day: number;
}

export interface EventState {
  /** The event's window is open now (a lasting event plays while it is; actors start when it opens). */
  on: Record<TempleEvent, boolean>;
  /** How many times each began (a new number: it began again). */
  count: Record<TempleEvent, number>;
  /** When each last began (page s, `f.t`; −1e9 never). */
  began: Record<TempleEvent, number>;
  /** Where the daylight is: 0 sunrise … 0.5 noon … 1 the evening; NaN at night. */
  dayPhase: number;
  /** A storm: 0 calm … 1 everyone takes cover (eased). */
  shelter: number;
  /** Rain: 0 … 1 umbrellas up (eased). */
  umbrellas: number;
  /** Walking speed factor in rain (1 … 1.5). */
  hurry: number;
  /** A storm is on (`f.weather.storm` above 0.3). */
  storm: boolean;
  /** The festival on now, if any. */
  festival: Festival | null;
  /** The event held on by the URL (`event=`), if any. */
  forced: TempleEvent | null;
  /** The last events that began (oldest first; checks). */
  log: EventLogEntry[];
}

/** One daylight loop while the clock is held in the day (s). */
export const HELD_DAY = 600;
/** A held clock inside an hour's window (or a forced one-shot) fires it again this often (s). */
const REPEAT = 150;
/** The daylight: from this clock (sunrise, a little after dawn) over this much of the day. */
const DAY_START = 0.8;
const DAY_SPAN = 0.4;
/** Kept in the log. */
const LOG = 96;

/** A window: when it opens in its day (0‥1 of the clock, or of the daylight) and how long it stays open. */
interface Slot {
  name: TempleEvent;
  /** On the clock, or in the daylight. */
  kind: 'clock' | 'day';
  /** Opens at `at + jitter · (random of the day)`, open `len`. */
  at: number;
  jitter: number;
  len: number;
  /** Lasting (on while open) or a one-shot (begins when it opens). */
  lasting?: boolean;
}

const SLOTS: Slot[] = [
  { name: 'dawnChant', kind: 'clock', at: 0.71, jitter: 0.02, len: 0.1, lasting: true },
  { name: 'duskDrum', kind: 'clock', at: 0.217, jitter: 0.01, len: 0.04 },
  { name: 'noonBell', kind: 'day', at: 0.44, jitter: 0.02, len: 0.03 },
  { name: 'elephantBath', kind: 'day', at: 0.5, jitter: 0.08, len: 0.1 },
  { name: 'monkeyCrossing', kind: 'day', at: 0.1, jitter: 0.1, len: 0.04 },
  { name: 'monkeyCrossing', kind: 'day', at: 0.38, jitter: 0.08, len: 0.04 },
  { name: 'monkeyCrossing', kind: 'day', at: 0.72, jitter: 0.1, len: 0.04 },
];

const params = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
/** A still leaves the daylight events out (the overview stays as it is) unless one is asked for (`event=`) or all are (`events=1`). */
const QUIET_DAY = params.get('shot') === '1' && params.get('events') !== '1';
const FORCED = TEMPLE_EVENTS.includes(params.get('event') as TempleEvent) ? (params.get('event') as TempleEvent) : null;

const record = <T>(v: T) => Object.fromEntries(TEMPLE_EVENTS.map((k) => [k, v])) as Record<TempleEvent, T>;

/** The events now (the last worked out: `eventsNow(f)` brings it up to date). */
export const EVENTS: EventState = {
  on: record(false),
  count: record(0),
  began: record(-1e9),
  dayPhase: Number.NaN,
  shelter: 0,
  umbrellas: 0,
  hurry: 1,
  storm: false,
  festival: null,
  forced: FORCED,
  log: [],
};

// ── The clock's state between frames ─────────────────────────────────────────
let lastT = Number.NaN;
let lastClock = Number.NaN;
/** The daylight while the clock is held (its own loop), and how many loops it made. */
let heldPhase = Number.NaN;
let heldLoops = 0;
/** Seconds the clock has stood still. */
let heldFor = 0;
/** Per slot: open last frame, and the page time it last fired. */
const wasOpen = SLOTS.map(() => false);
const firedAt = SLOTS.map(() => -1e9);
let forcedAt = -1e9;

const wrap01 = (v: number) => ((v % 1) + 1) % 1;
/** The daylight of a clock (0‥1), or NaN at night. */
export function dayPhaseOf(clock: number): number {
  const p = wrap01(clock - DAY_START) / DAY_SPAN;
  return p <= 1 ? p : Number.NaN;
}
/** Whether `v` is in [a, a + len) on a wrapping 0‥1 dial. */
const inside = (v: number, a: number, len: number) => wrap01(v - a) < len;

function fire(name: TempleEvent | 'storm', f: MapFrame): void {
  if (name !== 'storm') {
    EVENTS.count[name]++;
    EVENTS.began[name] = f.t;
  }
  EVENTS.log.push({ name, t: Math.round(f.t * 10) / 10, clock: Math.round(f.clock * 1000) / 1000, day: f.day });
  if (EVENTS.log.length > LOG) EVENTS.log.shift();
}

/**
 * Bring the events up to date for this frame (once per frame: a second
 * call with the same `f.t` just returns them) and return them.
 */
export function eventsNow(f: MapFrame): Readonly<EventState> {
  if (f.t === lastT) return EVENTS;
  const first = Number.isNaN(lastT);
  const dt = first ? 0 : Math.max(0, f.t - lastT);
  lastT = f.t;
  const clock = wrap01(f.clock);
  // How fast the clock moves: held (0), the day's cycle (~1/360 a second), or a quick switch between day and night.
  let rate = 0;
  let dc = 0;
  if (!first && dt > 0) {
    dc = clock - lastClock;
    if (dc > 0.5) dc -= 1;
    if (dc < -0.5) dc += 1;
    rate = Math.abs(dc) / dt;
  }
  lastClock = clock;
  const held = rate < 1e-5;
  heldFor = held ? heldFor + dt : 0;
  const switching = rate > 0.01;
  // The clock goes on in its own time (held, or forward with the day's cycle): an hour's one-shot begins only then,
  // not while the time of day is switched in the settings (the clock eases through dusk either way) nor on a jump.
  const onTime = !switching && dc >= 0;

  // ── The daylight ──
  const clockPhase = dayPhaseOf(clock);
  if (Number.isNaN(clockPhase)) heldPhase = Number.NaN;
  else if (!held || Number.isNaN(heldPhase)) heldPhase = clockPhase;
  else {
    heldPhase += Math.min(dt, 5) / HELD_DAY;
    while (heldPhase >= 1) {
      heldPhase -= 1;
      heldLoops++;
    }
  }
  const phase = heldPhase;
  EVENTS.dayPhase = phase;

  // ── Weather ──
  const w = f.weather;
  const k = dt > 0 ? 1 - Math.exp(-dt / 3) : 1;
  const shelterTo = Math.min(1, Math.max(0, (w.storm - 0.15) / 0.45, (w.rain - 0.75) / 0.25 * 0.6));
  EVENTS.shelter += (shelterTo - EVENTS.shelter) * k;
  EVENTS.umbrellas += (Math.min(1, Math.max(0, (w.rain - 0.12) / 0.3)) - EVENTS.umbrellas) * k;
  EVENTS.hurry = 1 + 0.5 * Math.min(1, Math.max(0, (w.rain - 0.1) / 0.6));
  const storm = EVENTS.storm ? w.storm > 0.2 : w.storm > 0.3;
  if (storm && !EVENTS.storm) fire('storm', f);
  EVENTS.storm = storm;
  EVENTS.festival = festivalNow(f);
  // (daylight events wait out a storm or a downpour)
  const calm = w.storm < 0.35 && w.rain < 0.8;

  // ── The windows ──
  const dayKey = f.day * 97 + heldLoops;
  for (const name of TEMPLE_EVENTS) EVENTS.on[name] = false;
  SLOTS.forEach((s, i) => {
    let open = false;
    if (s.kind === 'clock') {
      const at = s.at + s.jitter * (hash3(f.day, i, 41) - 0.5);
      open = inside(clock, at, s.len);
    } else if (!Number.isNaN(phase) && !switching && calm && !QUIET_DAY) {
      const at = s.at + s.jitter * hash3(dayKey, i, 43);
      open = phase >= at && phase < at + s.len;
    }
    if (open) EVENTS.on[s.name] = true;
    // Begins as the window opens (an hour's one-shot: only as the clock goes forward through it, `onTime`);
    // a clock held inside it (a one-shot) begins again every REPEAT s.
    const opens = open && !wasOpen[i] && (s.kind !== 'clock' || s.lasting || onTime);
    const again = open && !s.lasting && held && heldFor > 1 && f.t - firedAt[i] > REPEAT;
    if (opens || again) {
      firedAt[i] = f.t;
      fire(s.name, f);
    }
    wasOpen[i] = open;
  });

  // ── Held on by the URL ──
  if (FORCED) {
    EVENTS.on[FORCED] = true;
    if (first || (dt > 0 && FORCED !== 'dawnChant' && f.t - forcedAt > REPEAT)) {
      forcedAt = f.t;
      fire(FORCED, f);
    }
  }
  if (first && typeof window !== 'undefined') Object.assign(window, { __events: EVENTS });
  return EVENTS;
}
