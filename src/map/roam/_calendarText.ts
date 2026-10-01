import type { RealSpan } from '../calendar';
import { MONTH, moonAge } from '../festival/_schedule';
import { rainsOf } from '../sky/weather';
import { lang, num, t, type WordKey } from '../ui/lang';

/**
 * The calendar of events' words for times (roam/_calendar*.ts): the time of day
 * an event comes ("at dawn", "after dark") and until when it goes on, how long
 * until it in play ("in 3 min"), days of the map, the real-life dates (Khmer
 * digits and month names in Khmer), the Khmer lunar date, and the map's moment
 * (the time of day, the season, the moon's day: "ព្រលឹម · រដូវវស្សា · ថ្ងៃ៥កើត").
 */

/** The parts of the day by the clock (0 golden afternoon … 0.25 dusk, 0.5 midnight, 0.75 dawn; the sun up ≈ 0.8, down ≈ 0.16): from, "at …", "until …". */
const PARTS: readonly (readonly [number, WordKey, WordKey])[] = [
  [0.03, 'whenAtAfternoon', 'whenTilAfternoon'],
  [0.15, 'whenAtDusk', 'whenTilDusk'],
  [0.27, 'whenAtEvening', 'whenTilEvening'],
  [0.43, 'whenAtMidnight', 'whenTilMidnight'],
  [0.57, 'whenAtLate', 'whenTilLate'],
  [0.7, 'whenAtDawn', 'whenTilDawn'],
  [0.8, 'whenAtMorning', 'whenTilMorning'],
  [0.93, 'whenAtNoon', 'whenTilNoon'],
];
const partOf = (clock: number) => {
  const c = ((clock % 1) + 1) % 1;
  let p = PARTS[PARTS.length - 1];
  for (const q of PARTS) if (c >= q[0]) p = q;
  return p;
};
/** "at dawn", "after dark": the part of the day of a clock. */
export const atWords = (clock: number): string => t(partOf(clock)[1]);
/** "until midnight". */
export const untilWords = (clock: number): string => t(partOf(clock)[2]);

/** A capital first letter (English: a phrase that opens a line). */
export const cap = (s: string): string => (lang() === 'en' ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** "in 42 s", "in 3 min", "in 1 h 12 min", "any moment" (seconds of play). */
export function inWords(s: number): string {
  if (s < 5) return t('whenSoon');
  if (s < 60) return t('whenInSec', { n: num(Math.round(s)) });
  const min = Math.max(1, Math.round(s / 60));
  if (min < 60) return t('whenInMin', { n: num(min) });
  return t('whenInHm', { h: num(Math.floor(min / 60)), m: num(min % 60) });
}

/** "42 s left", "3 min left". */
export function leftWords(s: number): string {
  if (s < 60) return t('whenLeftSec', { n: num(Math.max(1, Math.round(s))) });
  return t('whenLeftMin', { n: num(Math.max(1, Math.round(s / 60))) });
}

/** "72 min", "2 h 30 min" (seconds of play). */
export function playWords(s: number): string {
  const min = Math.max(1, Math.round(s / 60));
  return min < 60 ? t('whenMin', { n: num(min) }) : t('whenHm', { h: num(Math.floor(min / 60)), m: num(min % 60) });
}

/** "in 12 days of the map · about 1 h 12 min of play" (`days` of the cycle, `dayLength` s of play each; `held`: the clock stands still). */
export function daysWords(days: number, dayLength: number, held: boolean): string {
  const n = Math.round(days);
  const d = n <= 1 ? t('whenDay1') : t('whenDays', { n: num(n) });
  return `${d} · ${held ? t('whenRuns') : t('whenPlay', { t: playWords(days * dayLength) })}`;
}

const MONTHS = () => t('whenMonths').split('|');
/** "23–25 November 2026" / "ថ្ងៃទី ២៣–២៥ ខែវិច្ឆិកា ឆ្នាំ ២០២៦". */
export function datesWords(r: RealSpan): string {
  const m = MONTHS();
  const a = r.first;
  const b = r.last;
  const y = num(b.getFullYear());
  if (a.getMonth() === b.getMonth() && a.getDate() === b.getDate()) return t('whenDate', { d: num(a.getDate()), m: m[a.getMonth()], y });
  if (a.getMonth() === b.getMonth()) return t('whenDates', { d1: num(a.getDate()), d2: num(b.getDate()), m: m[a.getMonth()], y });
  return t('whenDates2', { d1: num(a.getDate()), m1: m[a.getMonth()], d2: num(b.getDate()), m2: m[b.getMonth()], y });
}

/** The lunar date: "ថ្ងៃ១៥កើត ខែកត្តិក (ពេញបូណ៌មី)" / "Full moon of Kadeuk"; `day` 0‥29 (14 the full moon). */
export function lunarWords(month: number, day: number): string {
  const name = t('whenLunarMonths').split('|')[month] ?? '';
  if (day === 14) return t('whenLunarFull', { month: name });
  return t('whenLunar', { n: num(day < 15 ? day + 1 : day - 14), phase: t(day < 15 ? 'whenWax' : 'whenWane'), month: name });
}

/** "In real life: 23–25 November 2026 · ថ្ងៃ១៥កើត ខែកត្តិក (ពេញបូណ៌មី)" (`today`: the real day now). */
export function realWords(r: RealSpan, today: Date): string {
  const d0 = new Date(r.first);
  d0.setHours(0, 0, 0, 0);
  const d1 = new Date(r.last);
  d1.setHours(23, 59, 59, 999);
  const on = today.getTime() >= d0.getTime() && today.getTime() <= d1.getTime();
  const line = t(on ? 'whenRealOn' : 'whenReal', { date: datesWords(r) });
  return r.lunar ? `${line} · ${lunarWords(r.lunar.month, r.lunar.day)}` : line;
}

/** The map's moment under the card's title: the part of the day, the season (by its rains: sky/weather.ts), the moon's day. */
export function momentWords(clock: number, season: number, day: number): string {
  const rainy = rainsOf(season).chance >= 0.5;
  const age = moonAge(day);
  const half = MONTH / 2;
  const moon =
    Math.abs(age - half) < 0.75
      ? t('whenMoonFull')
      : age < half
        ? t('whenMoonDay', { n: num(Math.min(15, Math.floor(age) + 1)), phase: t('whenWax') })
        : t('whenMoonDay', { n: num(Math.min(15, Math.floor(age - half) + 1)), phase: t('whenWane') });
  return `${cap(atWords(clock))} · ${t(rainy ? 'whenRainy' : 'whenDry')} · ${moon}`;
}
