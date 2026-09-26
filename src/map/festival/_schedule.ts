/**
 * When the festivals are on (no three.js: the sound and the interface read
 * it too).
 *
 * - **Bon Om Touk** (បុណ្យអុំទូក, the Water Festival): the three days round
 *   the full moon of the month Kadeuk, late October to late November
 *   (`MapFrame.season` ≈ 0.52‥0.63, the real dates of the last years), when
 *   the moon is within `WATER_MOON` days of full (`MapFrame.day`: days since
 *   a new moon). Dragon boats race by day, lit floats and floating candles
 *   at night, people salute the moon (Sampeah Preah Khae).
 * - **Chaul Chnam Thmey** (បុណ្យចូលឆ្នាំខ្មែរ, Khmer New Year): mid-April,
 *   `season` ≥ 0.98 or < 0.03 (the three days and the week round them).
 *
 * URL `fest=water|newyear` holds one (shots, and for the player to see it);
 * `fest=0` none.
 */

export type Festival = 'water' | 'newyear';

/** Days from one new moon to the next (sky/palette.ts `SYNODIC_MONTH`). */
const MONTH = 29.530589;
/** The Water Festival's part of the year (`season`). */
const WATER_SEASON: [number, number] = [0.52, 0.63];
/** …and how far from the full moon its days reach (days). */
const WATER_MOON = 2.5;
/** Khmer New Year: from `NEWYEAR_FROM` round to `NEWYEAR_TO` (season wraps at 1). */
const NEWYEAR_FROM = 0.98;
const NEWYEAR_TO = 0.03;

/** The URL's festival (`fest=`): held, none (`0`), or `undefined` (follow the calendar). */
const forced: Festival | null | undefined = (() => {
  if (typeof location === 'undefined') return undefined;
  const v = new URLSearchParams(location.search).get('fest');
  if (v === 'water' || v === 'newyear') return v;
  if (v === '0' || v === 'none') return null;
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

/** The festival on now (or none), from the time of the year and the moon. */
export function festivalNow(f: { season: number; day: number }): Festival | null {
  if (forced !== undefined) return forced;
  const s = ((f.season % 1) + 1) % 1;
  if (s >= NEWYEAR_FROM || s < NEWYEAR_TO) return 'newyear';
  if (s >= WATER_SEASON[0] && s <= WATER_SEASON[1] && Math.abs(moonAge(f.day) - MONTH / 2) <= WATER_MOON) return 'water';
  return null;
}

/** A festival is held by the URL (`fest=`). */
export const festivalForced = (): boolean => forced !== undefined;

/**
 * What the festival part shows now, for the sound (audio/festival.ts):
 * written by the part every frame (nothing while no festival is on, or
 * when the part is not built).
 */
export interface FestivalScene {
  kind: Festival | null;
  /** Page time of this state (s, `MapFrame.t`). */
  t: number;
  /** Dragon boats: where each is, how hard the crew rows (0 resting … 1 racing), its stroke clock (strokes since t = 0, the drum on whole numbers). */
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
