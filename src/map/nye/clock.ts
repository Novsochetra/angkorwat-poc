/**
 * New Year's Eve online (AWP-35, docs/discussion/new-year-online.md): WHEN it is.
 *
 * **The only place in the code that knows the date.** Midnight is Cambodia's,
 * one moment for everyone: 1 January 2027 00:00 ICT (UTC+7) = 31 December 2026
 * 17:00 UTC. Everything else (the square's board, the night-time hold, the
 * countdown overlay, the fireworks show, the calendar entry, the sound) asks
 * this module how far "now" is from that midnight, and never reads a date of
 * its own. The show is played from the real clock, so every player sees the same
 * rocket at the same second with no network; `setServerOffset` corrects the
 * device's clock by the live server's when one answers (phase 2).
 *
 * The URL moves "now" for this screen only (harmless: it changes nothing for
 * anyone else), so the whole night can be tried at any time:
 *
 * - `nye=+2m` (or `+90s`, `+1h`, `+3d`, `-30s`): midnight comes that long after
 *   the page opened (`-30s`: it came 30 s ago, the show is 30 s in);
 * - `nye=<ISO time>` (`nye=2026-12-31T23:59:00+07:00`): pretend it is then now;
 * - `nye=0`: no New Year's Eve at all (the square is not built: compare);
 * - `countdown=<s>`: now is `s` seconds before midnight (a shot holds it there);
 * - `fireworks=<s>`: now is `s` seconds after midnight (the show at second `s`);
 * - `nyeboard=days|hms|last10|midnight|after`: the board shows that state
 *   (with its own sample numbers when the time does not give them).
 *
 * In a headless shot (`shot=1`) time stands still at the URL's moment (or the
 * real one), and the night-time hold comes only when the URL asks for the
 * event (`nye=`, `countdown=`, `fireworks=`): shots stay calm unless they say.
 *
 * No three.js, nothing per frame but arithmetic.
 */

/** Midnight in Cambodia, 1 January 2027 00:00 ICT (UTC+7) = 31 December 2026 17:00 UTC (ms since 1970). */
export const NYE_MIDNIGHT = Date.UTC(2026, 11, 31, 17, 0, 0);
/** The year that begins (the board's greeting, "២០២៧"). */
export const NYE_YEAR = 2027;

/** The night's times, in seconds from midnight (negative: before). */
export const NYE_TIMES = {
  /** 22:30 ICT: the map's time comes to real night by itself (a toast says why). */
  nightFrom: -90 * 60,
  /** The last ten seconds: one huge numeral at a time. */
  last10: -10,
  /** The fireworks show's length (s; the script in show.ts fits it). */
  show: 480,
  /** The board's greeting "សួស្តីឆ្នាំថ្មី ២០២៧" lasts this long, then "See you next year". */
  greeting: 10 * 60,
  /** 00:45 ICT: the map's time goes back to the player's setting. */
  nightTo: 45 * 60,
  /** The square stays (its board saying "See you next year") until the next midnight, then is no longer built. */
  squareTo: 24 * 3600,
} as const;

/** Where the night is. */
export type NyePhase =
  /** Days ahead (the board counts days : hours : minutes : seconds). */
  | 'days'
  /** The last day (hours : minutes : seconds, the days gone). */
  | 'lastDay'
  /** From 22:30: the night-time hold. */
  | 'night'
  /** The last ten seconds. */
  | 'last10'
  /** Midnight: the greeting (the show plays its first `show` seconds). */
  | 'midnight'
  /** After the greeting, until the night ends: "See you next year". */
  | 'after'
  /** The night is over; the square still stands until `squareTo` ("See you next year"). */
  | 'over'
  /** Gone: the square is no longer built. */
  | 'gone';

const params = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
const shot = params.get('shot') === '1';
const pageOpened = Date.now();

/** `+2m`, `-30s`, `+1h`, `+3d` → ms (NaN if not that form). */
function parseShift(v: string): number {
  // (a `+` typed in an address arrives as a space: `nye=+2m` reads " 2m")
  const m = /^([+-])(\d+(?:\.\d+)?)([smhd]?)$/.exec(v.replace(/^ /, '+').trimEnd());
  if (!m) return NaN;
  const unit = { s: 1e3, m: 6e4, h: 3.6e6, d: 8.64e7, '': 1e3 }[m[3] as 's' | 'm' | 'h' | 'd' | ''];
  return (m[1] === '-' ? -1 : 1) * Number(m[2]) * unit;
}

/**
 * How far this screen's "now" is moved from the device's clock (ms), from the URL; and whether the URL holds the
 * event (`asked`) and stands it still (`held`: a shot, or `countdown=` / `fireworks=` in a shot).
 */
const url = (() => {
  const nye = params.get('nye');
  const countdown = params.get('countdown');
  const fireworks = params.get('fireworks');
  let shift = 0;
  let asked = false;
  if (nye !== null && nye !== '0') {
    asked = true;
    const d = parseShift(nye);
    if (Number.isFinite(d)) shift = NYE_MIDNIGHT - (pageOpened + d);
    else {
      const at = Date.parse(nye);
      if (Number.isFinite(at)) shift = at - pageOpened;
    }
  }
  if (countdown !== null && Number.isFinite(Number(countdown))) {
    asked = true;
    shift = NYE_MIDNIGHT - Number(countdown) * 1000 - pageOpened;
  }
  if (fireworks !== null && Number.isFinite(Number(fireworks))) {
    asked = true;
    shift = NYE_MIDNIGHT + Number(fireworks) * 1000 - pageOpened;
  }
  return { shift, asked, off: nye === '0' };
})();

/** The live server's clock minus the device's (ms): set when one answers (phase 2); 0 alone. */
let serverOffset = 0;
export function setServerOffset(ms: number): void {
  if (Number.isFinite(ms)) serverOffset = ms;
}

/** The URL asks for the event (`nye=`, `countdown=`, `fireworks=`): shots then show its night too. */
export const nyeAsked = (): boolean => url.asked;
/** `nye=0`: no New Year's Eve on this screen. */
export const nyeOff = (): boolean => url.off;

/** Now, as this screen counts it (ms since 1970): the device's clock, the server's correction, the URL's move. A shot stands still. */
export function nyeNow(): number {
  return (shot ? pageOpened + videoMs : Date.now()) + serverOffset + url.shift;
}

/** A video (`video=1`, scripts/video.mjs): how far its scene time has moved on from its first frame (ms). */
let videoMs = 0;
let videoFrom: number | null = null;
/**
 * main.ts, each frame of a video: the scene's time `t` (s). The night moves on with it from the URL's moment, so a
 * shot from `countdown=12` plays the count, midnight and the first bursts (the board, the overlay, the people, the
 * fireworks all in step). Still shots never call it: they stand still.
 */
export function nyeVideoTime(t: number): void {
  videoFrom ??= t;
  videoMs = (t - videoFrom) * 1000;
}

/** Seconds from midnight to `now` (negative before midnight). */
export const nyeSeconds = (now = nyeNow()): number => (now - NYE_MIDNIGHT) / 1000;

/** Where the night is at `now`. */
export function nyePhase(now = nyeNow()): NyePhase {
  if (url.off) return 'gone';
  const s = nyeSeconds(now);
  if (s < -24 * 3600) return 'days';
  if (s < NYE_TIMES.nightFrom) return 'lastDay';
  if (s < NYE_TIMES.last10) return 'night';
  if (s < 0) return 'last10';
  if (s < NYE_TIMES.greeting) return 'midnight';
  if (s < NYE_TIMES.nightTo) return 'after';
  if (s < NYE_TIMES.squareTo) return 'over';
  return 'gone';
}

/** The square (stage, board, lamps) is built: from the day it ships until the day after the night. */
export const squareShown = (now = nyeNow()): boolean => nyePhase(now) !== 'gone';

/**
 * The map's time is held at night (22:30‥00:45 ICT): main.ts eases the sky there and stops the day's cycle while
 * this is true; the player's own setting comes back after. In a shot only when the URL asks for the event.
 */
export function nightHeld(now = nyeNow()): boolean {
  if (url.off || (shot && !url.asked)) return false;
  const s = nyeSeconds(now);
  return s >= NYE_TIMES.nightFrom && s < NYE_TIMES.nightTo;
}

/** Seconds into the fireworks show at `now`, or null when it is not playing (before midnight, after its end). */
export function showTime(now = nyeNow()): number | null {
  if (url.off) return null;
  const s = nyeSeconds(now);
  return s >= 0 && s < NYE_TIMES.show ? s : null;
}

/** The fireworks show is within `ahead` seconds (or playing): the fireworks part is built then (lazy.ts). */
export function showSoon(ahead = 3600, now = nyeNow()): boolean {
  if (url.off) return false;
  const s = nyeSeconds(now);
  return s >= -ahead && s < NYE_TIMES.show;
}

/** What the board shows. */
export type BoardState = 'days' | 'hms' | 'last10' | 'midnight' | 'after';
export const BOARD_STATES: readonly BoardState[] = ['days', 'hms', 'last10', 'midnight', 'after'];

export interface BoardShow {
  state: BoardState;
  /** Whole days, hours, minutes, seconds to midnight (0 after it). */
  d: number;
  h: number;
  m: number;
  s: number;
  /** The last ten seconds: the numeral (10‥1). */
  n: number;
}

/** `nyeboard=<state>`: the board held in that state (shots), else null. */
const boardParam = ((): BoardState | null => {
  const v = params.get('nyeboard');
  return BOARD_STATES.find((b) => b === v) ?? null;
})();

/** What the board shows at `now` (`nyeboard=` holds a state; numbers then from the time if they fit, else a sample). */
export function boardAt(now = nyeNow()): BoardShow {
  const left = Math.max(0, Math.ceil(-nyeSeconds(now)));
  const split = (sec: number) => ({ d: Math.floor(sec / 86400), h: Math.floor(sec / 3600) % 24, m: Math.floor(sec / 60) % 60, s: sec % 60 });
  const phase = nyePhase(now);
  let state: BoardState =
    phase === 'days' ? 'days' : phase === 'lastDay' || phase === 'night' ? 'hms' : phase === 'last10' ? 'last10' : phase === 'midnight' ? 'midnight' : 'after';
  let t = split(left);
  let n = Math.min(10, Math.max(1, left));
  if (boardParam) {
    state = boardParam;
    // (a held state's sample numbers where the time does not give them: as the owner's reference)
    if (state === 'days' && t.d < 1) t = { d: 3, h: 12, m: 45, s: 28 };
    if (state === 'hms' && (left <= 10 || t.d > 0)) t = { d: 0, h: 0, m: 0, s: 10 };
    if (state === 'last10' && (left > 10 || left < 1)) n = 7;
  }
  return { state, ...t, n };
}
