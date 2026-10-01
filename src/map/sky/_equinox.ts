import { registerEvent, type RealSpan } from '../calendar';
import { TIME, type MapMoment } from '../time';

/**
 * The equinox sunrise over Angkor Wat: twice a year, about 20 March and 22
 * September, the sun comes up right behind the central tower seen from the
 * causeway in front of the temple (Angkor Wat faces west: its back is the
 * east), and people gather before dawn to watch it.
 *
 * The rule, in one place: the sky (palette.ts) turns the dawn sun by it, the
 * crowd (people/_sceneEquinox.ts) gathers by it, the roaming add-on
 * (roam/_equinox.ts: the halo, the toasts, the passport stamp) plays the
 * moment by it, and the calendar of events (calendar.ts) asks it.
 *
 * - **The sun's rising point** moves with the time of year (`MapFrame.season`,
 *   0 = 14 April): at Angkor (13.4° N) it rises up to 24° north of east in the
 *   hot season (June) and as far south in the cool season (December), right on
 *   the temple's axis at the equinoxes (`riseBearing`). On the map the axis is
 *   x = 0 and the temple faces the road (+z): its east is the map's −z, so the
 *   June sun comes up left of the central tower as the causeway sees it, the
 *   December sun right of it. One map day is a fortnight of the year (the year
 *   passes in 24 days of the cycle: main.ts `SEASON_PER_DAY`), so the point
 *   steps from morning to morning (each morning keeps its own all through) and
 *   the equinox morning's is exactly on the axis.
 * - **The equinox morning**: the morning whose dawn falls within half a map day
 *   of an equinox (`equinoxMorning`): one each equinox, every half of the map's
 *   year. Visitors gather on the causeway and at the reflecting pools' edge in
 *   the dark before dawn (`GATHER`), the sun's disc reaches the tower top from afar
 *   (`ON_TOWER`), a gold halo crowns the tower (`haloAt`), and they leave once
 *   the sun has climbed off it (`LEAVE`).
 * - A shot that names no time of year (no `season=`: main.ts's stand-in 0.45)
 *   keeps the concept art's dawn (the sun behind the right-hand towers, as it
 *   rises in mid-October) and no equinox. `equinox=1` holds an equinox dawn
 *   (the sun on the axis, the crowd and the halo by `clock=`), `equinox=0` never.
 *
 * No three.js, nothing allocated per frame.
 */

const DEG = Math.PI / 180;
/** Days of the real year. */
const YEAR = 365.2422;
/** The time of year (`MapFrame.season`: 0 = 14 April) of a date in days after 14 April (minus: before it). */
const at = (days: number) => (((days / YEAR) % 1) + 1) % 1;
/** The equinoxes and the solstices (`season`): 20 March, 21 June, 22 September, 21 December. */
export const SPRING = at(-25);
const JUNE = at(68);
export const AUTUMN = at(161);
const DECEMBER = at(251);
/** Angkor Wat's latitude, and the tilt of the earth's axis (rad). */
const LAT = 13.41 * DEG;
const TILT = 23.44 * DEG;
/** The temple's east on the map (compass bearing, degrees: 0 the map's north, + east): its axis, x = 0, away from the road. */
export const AXIS_BEARING = 0;
/** The year's mornings when the season stands still (`season=`): a day of the cycle as the live page has it. */
const MORNING = 1 / 24;

/** The causeway between the reflecting pools in front of the main gate (m; its pad's floor). */
export const CAUSEWAY = { x: 0, y: 56, z: -163 };
/** Where the equinox is watched from (m): the pad in front of the gate, from the road's last stair to the gate, the pools' edges included. */
export const WATCH_AREA = { x0: -62, x1: 62, z0: -172, z1: -146, y: 52 };
/** The central tower's tip (m: landmarks/sanctuary.ts `tower(… top: 116)`). */
export const TOWER_TOP = { x: 0, y: 116, z: -209 };

/** The clock through the equinox morning: the first visitors set out, the first light, the disc on the tower (from afar), the halo gone, they leave, all gone. */
export const GATHER = 0.55;
export const FIRST_LIGHT = 0.735;
export const ON_TOWER = 0.752;
export const HALO_END = 0.815;
export const LEAVE = 0.84;
export const GONE = 0.99;

const params = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
/** `equinox=1`: every dawn is the equinox's; `equinox=0`: never; else the time of year says. */
const HOLD: boolean | null = params.get('equinox') === '1' ? true : params.get('equinox') === '0' ? false : null;
/** A still that names no time of year (main.ts's stand-in season): the concept art's dawn, no equinox. */
const STAND_IN = params.get('shot') === '1' && !params.has('season');

/** The URL holds the equinox (`equinox=1`): the bug report's shot asks for it again. */
export const equinoxHeld = (): boolean => HOLD === true;

const wrap = (v: number) => v - Math.floor(v);
/** `v` − `from` across the year's wrap, in −0.5‥0.5. */
const off = (v: number, from: number) => wrap(v - from + 0.5) - 0.5;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The time.ts stub, before main.ts sets the map's time up. */
const STUB = TIME.moment;
let perDay = NaN;
/** How far the season moves in a day of the cycle (0: it stands still: a shot, `season=`). */
function seasonPerDay(): number {
  if (!Number.isNaN(perDay)) return perDay;
  if (TIME.moment === STUB) return 0;
  perDay = wrap(TIME.moment(1).season - TIME.moment(0).season);
  return perDay;
}

/** The time of year at this morning's dawn (clock 0.75 of the day: the one ahead in the afternoon and the night, the one gone by in the morning). */
export function dawnSeason(season: number, clock: number): number {
  return wrap(season + (0.75 - wrap(clock)) * seasonPerDay());
}

/** The equinox `mornings` found last (no object a call: per-frame callers). */
let nearE = AUTUMN;
/** How far `s` is from the nearer equinox in mornings (rounded: the morning it falls on is 0); that equinox → `nearE`. */
function mornings(s: number): number {
  const step = seasonPerDay() || MORNING;
  const a = off(s, AUTUMN);
  const p = off(s, SPRING);
  const near = Math.abs(a) <= Math.abs(p);
  nearE = near ? AUTUMN : SPRING;
  // (half-open, so a dawn exactly between two mornings belongs to one)
  return Math.floor((near ? a : p) / step + 0.5);
}

/** The year as an angle (rad): 0 at the spring equinox, π/2 in June, π at the autumn one, 3π/2 in December (each quarter as long as the real one). */
function yearAngle(s: number): number {
  const u = wrap(s - SPRING);
  const q1 = wrap(JUNE - SPRING);
  const q2 = wrap(AUTUMN - SPRING);
  const q3 = wrap(DECEMBER - SPRING);
  const q = u < q1 ? (u / q1) : u < q2 ? 1 + (u - q1) / (q2 - q1) : u < q3 ? 2 + (u - q2) / (q3 - q2) : 3 + (u - q3) / (1 - q3);
  return (q * Math.PI) / 2;
}

/** How far north of east the sun rises at Angkor at time of year `s` (degrees; minus: south): sin = sin(declination) / cos(latitude). */
export function riseNorth(s: number): number {
  const sinDec = Math.sin(TILT) * Math.sin(yearAngle(s));
  return Math.asin(Math.min(1, Math.max(-1, sinDec / Math.cos(LAT)))) / DEG;
}

/**
 * Where this morning's sun comes up (compass bearing on the map, degrees: 0 the temple's axis, + right of the central
 * tower as the causeway sees it), or null: the concept art's own dawn (a still that names no time of year).
 */
export function riseBearing(season: number, clock: number): number | null {
  if (HOLD === true) return AXIS_BEARING;
  if (STAND_IN) return null;
  const k = mornings(dawnSeason(season, clock));
  // (the morning's own time of year, on the grid of mornings round the equinox: that morning is exactly on the axis)
  const s = nearE + k * (seasonPerDay() || MORNING);
  return AXIS_BEARING - riseNorth(s);
}

/** This morning (its dawn ahead, or just gone by) is an equinox morning: the rule everything plays by. */
export function equinoxMorning(season: number, clock: number): boolean {
  if (HOLD !== null) return HOLD;
  if (STAND_IN) return false;
  return mornings(dawnSeason(season, clock)) === 0;
}

/** The watch is on (an equinox morning, from the first visitors setting out until they leave): the calendar's event. */
export function equinoxOn(m: { season: number; clock: number }): boolean {
  const c = wrap(m.clock);
  return c >= GATHER && c < LEAVE && equinoxMorning(m.season, c);
}

/** How strong the gold halo round the tower is at clock `c` on an equinox morning (0‥1): in as the sun reaches the tower top, out as it climbs off. */
export function haloAt(c: number): number {
  c = wrap(c);
  return smooth(FIRST_LIGHT, ON_TOWER, c) * (1 - smooth(0.785, HALO_END, c));
}

/** Inside the watching area in front of the gate (feet at y). */
export function inWatchArea(x: number, y: number, z: number): boolean {
  const a = WATCH_AREA;
  return x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1 && y >= a.y;
}

// ── In real life ─────────────────────────────────────────────────────────────

/** The March (0) or September (1) equinox of `year` (UTC ms): Meeus' mean equinox (good to about an hour). */
function realEquinox(year: number, which: 0 | 1): number {
  const y = (year - 2000) / 1000;
  const jde =
    which === 0
      ? 2451623.80984 + 365242.37404 * y + 0.05169 * y * y - 0.00411 * y ** 3 - 0.00057 * y ** 4
      : 2451810.21715 + 365242.01767 * y - 0.11575 * y * y + 0.00337 * y ** 3 + 0.00078 * y ** 4;
  return (jde - 2440587.5) * 86_400_000;
}

/** Cambodia's clock (UTC+7). */
const ICT = 7 * 3_600_000;

/** The next equinox sunrise days in Cambodia from the real day `from` (still on, that day counts): the equinox's day and one either side. */
export function nextRealEquinox(from: Date): RealSpan | null {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12);
  for (let year = from.getFullYear(); year <= from.getFullYear() + 1; year++)
    for (const which of [0, 1] as const) {
      const d = new Date(realEquinox(year, which) + ICT);
      const [y, m, day] = [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()];
      const last = new Date(y, m, day + 1, 12);
      if (last >= today) return { first: new Date(y, m, day - 1, 12), last };
    }
  return null;
}

registerEvent({
  id: 'equinox',
  kind: 'rare',
  name: 'equiName',
  note: 'equiNote',
  place: 'equiPlace',
  begins: 'equiBegins',
  where: { x: CAUSEWAY.x, z: CAUSEWAY.z },
  on: (m: MapMoment) => equinoxOn(m),
  real: nextRealEquinox,
});
