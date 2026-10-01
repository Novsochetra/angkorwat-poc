/**
 * When the festivals are on (no three.js: the sound and the interface read
 * it too).
 *
 * - **Bon Om Touk** (បុណ្យអុំទូក, the Water Festival): the three days round
 *   the full moon of the month Kadeuk, late October to late November
 *   (`MapFrame.season` ≈ 0.52‥0.63, the real dates of the last years), when
 *   the moon is within `WATER_MOON` days of full (`MapFrame.day`: days since
 *   a new moon). Racing boats (ngo) race by day, lit floats and floating candles
 *   at night, people salute the moon (Sampeah Preah Khae).
 * - **Chaul Chnam Thmey** (បុណ្យចូលឆ្នាំខ្មែរ, Khmer New Year): mid-April,
 *   `season` ≥ 0.98 or < 0.03 (the three days and the week round them).
 *
 * - **Pchum Ben** (បុណ្យភ្ជុំបិណ្ឌ): the fifteen days of the waning moon of
 *   Phatrabot, late September to mid-October, ending with Pchum on the new
 *   moon (`pchumBenAt`; `pchumDay` the last, biggest day).
 * - **Visak Bochea** (បុណ្យវិសាខបូជា): the full moon of Pisakh, late April to
 *   May (`visakAt`).
 *
 * The two at the pagoda are each the moon's part (waning, full) whose day,
 * carried to the moon's end (Pchum) or its full moon at the real pace of the
 * moon through the year, falls in the festival's span of the real year: on
 * the real days as the map opens (checked against the Khmer calendar,
 * roam/_calendarKhmer.ts, 1995‥2060: within a day but in three years), and
 * in the map's quick year (24 days of the cycle, the moon 29.5) about one
 * year in two (Pchum Ben) and one in five (Visak Bochea).
 *
 * URL `fest=water|newyear|pchumben|visak` holds one (shots, and for the
 * player to see it); `fest=0` none. A shot that sets neither `fest=`,
 * `season=` nor `day=` has none (its default moment would be Pchum Ben).
 *
 * The festival part is built only for a visit that can see one: as the page
 * opens when one is on (or held), else once `festivalSoon` says one is near.
 */

export type Festival = 'water' | 'newyear' | 'pchumben' | 'visak';

/** Days from one new moon to the next (sky/palette.ts `SYNODIC_MONTH`). */
export const MONTH = 29.530589;
/** The Water Festival's part of the year (`season`). */
const WATER_SEASON: [number, number] = [0.52, 0.63];
/** …and how far from the full moon its days reach (days). */
const WATER_MOON = 2.5;
/** Khmer New Year: from `NEWYEAR_FROM` round to `NEWYEAR_TO` (season wraps at 1). */
const NEWYEAR_FROM = 0.98;
const NEWYEAR_TO = 0.03;
/**
 * Pchum Ben: the moon's waning half (its age from `wane`, and up to `after`
 * past the new moon: the map's day count runs a little behind the real
 * moon), whose last day (age `end`, the 15th of the waning moon) falls in
 * `season` [`from`, `to`] at the real pace (a year of 365.25 days).
 */
const PCHUM = { wane: 14.0, after: 0.45, end: 29.4, from: 0.4285, to: 0.5105 } as const;
/** Visak Bochea: the full moon day (the map's age `full`) ± `band` days, its full moon in `season` [`from`, `to`] at the real pace. */
const VISAK = { full: 13.3, band: 1.8, from: 0.03, to: 0.111 } as const;
/** Days in the real year (the projections above). */
const YEAR = 365.25;

/** The URL's festival (`fest=`): held, none (`0`), or `undefined` (follow the calendar). */
const forced: Festival | null | undefined = (() => {
  if (typeof location === 'undefined') return undefined;
  const q = new URLSearchParams(location.search);
  const v = q.get('fest');
  if (v === 'water' || v === 'newyear' || v === 'pchumben' || v === 'visak') return v;
  if (v === '0' || v === 'none') return null;
  // (a shot's default moment, season 0.45 and a full moon, is the first day of Pchum Ben: shots are calm unless they say)
  if (v === null && q.get('shot') === '1' && !q.has('season') && !q.has('day')) return null;
  return undefined;
})();

/** The moon's age (days since the new moon, 0‥29.5). */
export function moonAge(day: number): number {
  return ((day % MONTH) + MONTH) % MONTH;
}

/** How full the moon is (0 new … 1 full). */
export function moonFull(day: number): number {
  return 0.5 - 0.5 * Math.cos((moonAge(day) / MONTH) * Math.PI * 2);
}

/** The festival on now (or none), from the time of the year and the moon (and the time of day: `festivalAt`). */
export function festivalNow(f: { season: number; day: number; clock?: number }): Festival | null {
  if (forced !== undefined) return forced;
  return festivalAt(f.season, f.day, f.clock);
}

/**
 * The festival of a moment (the time of the year and the day), whatever the URL holds (`fest=`): the calendar asks it
 * of any moment (map/calendar.ts). The pagoda's two go by whole days of the map (`day`, afternoon to afternoon, a
 * night in each): their season is the one the day began with (`clock`, the time of day: 0 when it is not given), so a
 * festival day never loses its night's procession or its walk before dawn.
 */
export function festivalAt(season: number, day: number, clock = 0): Festival | null {
  const s = ((season % 1) + 1) % 1;
  if (s >= NEWYEAR_FROM || s < NEWYEAR_TO) return 'newyear';
  if (s >= WATER_SEASON[0] && s <= WATER_SEASON[1] && Math.abs(moonAge(day) - MONTH / 2) <= WATER_MOON) return 'water';
  const s0 = (((s - (((clock % 1) + 1) % 1) * SEASON_PER_DAY) % 1) + 1) % 1;
  if (pchumBenAt(s0, day)) return 'pchumben';
  if (visakAt(s0, day)) return 'visak';
  return null;
}

/** Pchum Ben's fifteen days (see `PCHUM`), the year's part wrapped (0‥1). */
export function pchumBenAt(s: number, day: number): boolean {
  const a = moonAge(day);
  if (!(a >= PCHUM.wane || a < PCHUM.after)) return false;
  const end = s + (PCHUM.end - (a < PCHUM.after ? a + MONTH : a)) / YEAR;
  return end >= PCHUM.from && end <= PCHUM.to;
}

/** Pchum (ភ្ជុំ), the last and biggest day of Pchum Ben: the 15th of the waning moon (while Pchum Ben is on). */
export function pchumDay(day: number): boolean {
  const a = moonAge(day);
  return a >= PCHUM.end - 0.8 || a < PCHUM.after;
}

/** Visak Bochea's days round the full moon of Pisakh (see `VISAK`), the year's part wrapped (0‥1). */
export function visakAt(s: number, day: number): boolean {
  const a = moonAge(day);
  if (Math.abs(a - VISAK.full) > VISAK.band) return false;
  const full = s + (VISAK.full - a) / YEAR;
  return full >= VISAK.from && full <= VISAK.to;
}

/** A festival is held by the URL (`fest=`). */
export const festivalForced = (): boolean => forced !== undefined;

/**
 * How far `festivalSoon` looks: a day of the map's cycle ahead (six minutes
 * of play), half a day back (a switch of the time of day moves the clock half
 * a day either way), the season moving with it as it does in the cycle
 * (main.ts `SEASON_PER_DAY`).
 */
const SOON_DAYS = 1;
const SEASON_PER_DAY = 1 / 24;

/**
 * A festival is on now, or will be within a day of the map's time (or half
 * a day back, the clock turned back): the festival part is built then, in
 * the background (main.ts, lazy.ts), minutes of play before it shows. Never
 * with `fest=0`.
 */
export function festivalSoon(f: { season: number; day: number }): boolean {
  if (forced !== undefined) return forced !== null;
  for (let k = -1; k <= 2; k++) {
    const d = (k / 2) * SOON_DAYS;
    if (festivalNow({ season: f.season + d * SEASON_PER_DAY, day: f.day + d })) return true;
  }
  return false;
}

/**
 * What the festival part shows now, for the sound (audio/festival.ts):
 * written by the part every frame (nothing while no festival is on, or
 * when the part is not built).
 */
export interface FestivalScene {
  kind: Festival | null;
  /** Page time of this state (s, `MapFrame.t`). */
  t: number;
  /** Racing boats (ngo): where each is, how hard the crew rows (0 resting … 1 racing), its stroke clock (strokes since t = 0, the drum on whole numbers). */
  boats: { x: number; y: number; z: number; row: number; stroke: number; racing: boolean }[];
  /** Strokes a second (the drum's beat). */
  strokeHz: number;
  /** The crowd on the shore: where, how many cheer (0‥1), whether it is night (a murmur). */
  crowd: { x: number; y: number; z: number; cheer: number } | null;
  /** New Year: the musicians (roneat and skor drum) and the children playing (laughter). */
  music: { x: number; y: number; z: number } | null;
  play: { x: number; y: number; z: number } | null;
  /** 0 day … 1 night. */
  night: number;
}

export const FESTIVAL_SCENE: FestivalScene = { kind: null, t: 0, boats: [], strokeHz: 0.9, crowd: null, music: null, play: null, night: 0 };
