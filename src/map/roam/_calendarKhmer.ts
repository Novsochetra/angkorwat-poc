import type { RealSpan } from '../calendar';

/**
 * The Khmer lunisolar calendar (ចន្ទគតិ), for the calendar of events' "In real
 * life" dates (map/calendar.ts `real`): the festivals that go by the moon fall
 * on a lunar day of a lunar month (Bon Om Touk: the 14th of the waxing moon of
 * Kadeuk to the 1st of the waning; Pchum Ben: the 14th of the waning moon of
 * Phatrabot to the 1st waxing of Assoch; Visak Bochea: the full moon of
 * Pisakh). A year has 354 days, 355 with a leap day (an extra day in Jesth,
 * ឆ្នាំចន្ទ្រាធិមាស) or 384 with a leap month (a second Asadh, ឆ្នាំអធិកមាស),
 * by the old rules of the Khmer calendar (Chhankitek: aharkun, avoman,
 * bodithey, kromathupul), counted from 1 January 1900 (the 1st of the waxing
 * moon of Boss), the way the momentkh library does it.
 *
 * Checked against the official dates (Cambodia's public holidays): the Water
 * Festival every year 2016‥2026 (2026: 23‥25 November), Visak Bochea 2024‥2026
 * (2026: 1 May), Pchum Ben 2024‥2026 (2026: 10‥12 October).
 *
 * No three.js, nothing per frame (a date is worked out when asked, and kept).
 */

/** The lunar months, in their order of the year from Migasir (index 11 Kadeuk; 12 and 13 the leap year's two Asadh). */
export const LUNAR = { migasir: 0, boss: 1, meak: 2, phalkun: 3, cheit: 4, pisakh: 5, jesth: 6, asadh: 7, srap: 8, phatrabot: 9, assoch: 10, kadeuk: 11, asadh1: 12, asadh2: 13 } as const;

// ── The year's rules (Buddhist Era year `be`) ────────────────────────────────
const aharkun = (be: number): number => Math.floor((be * 292207 + 499) / 800) + 4;
const kromthupul = (be: number): number => 800 - ((be * 292207 + 499) % 800);
const avoman = (be: number): number => (aharkun(be) * 11 + 25) % 692;
function bodithey(be: number): number {
  const a = aharkun(be);
  return (Math.floor((a * 11 + 25) / 692) + a + 29) % 30;
}
const solarLeap = (be: number): boolean => kromthupul(be) <= 207;
/** A leap day by the reckoning (Chantrathimeas). */
function leapDayBy(be: number): boolean {
  const av = avoman(be);
  if (av === 0 && avoman(be - 1) === 137) return true;
  if (solarLeap(be)) return av < 127;
  if (av === 137 && avoman(be + 1) === 0) return false;
  return av < 138;
}
/** A leap month (Adhikameas). */
function leapMonthBy(be: number): boolean {
  const b = bodithey(be);
  const n = bodithey(be + 1);
  if (b === 25 && n === 5) return false;
  return (b === 24 && n === 6) || b >= 25 || b < 6;
}
const leapCache = new Map<number, 0 | 1 | 2>();
/** 1: a leap month, 2: a leap day (moved on from a leap month year if it fell there), 0: neither. */
function leapType(be: number): 0 | 1 | 2 {
  let v = leapCache.get(be);
  if (v !== undefined) return v;
  v = 0;
  if (leapMonthBy(be)) v = 1;
  else if (leapDayBy(be)) v = 2;
  else if (leapMonthBy(be - 1))
    for (let p = be - 1; ; ) {
      if (leapDayBy(p)) {
        v = 2;
        break;
      }
      p -= 1;
      if (!leapMonthBy(p)) break;
    }
  leapCache.set(be, v);
  return v;
}
function daysInMonth(m: number, be: number): number {
  const lt = leapType(be);
  if (m === LUNAR.jesth && lt === 2) return 30;
  if (m === LUNAR.asadh1 || m === LUNAR.asadh2) return lt === 1 ? 30 : 0;
  return m % 2 === 0 ? 29 : 30;
}
const daysInYear = (be: number): number => {
  const lt = leapType(be);
  return lt === 1 ? 384 : lt === 2 ? 355 : 354;
};
function nextMonth(m: number, be: number): number {
  if (m === LUNAR.jesth && leapType(be) === 1) return LUNAR.asadh1;
  if (m === LUNAR.kadeuk) return LUNAR.migasir;
  if (m === LUNAR.asadh1) return LUNAR.asadh2;
  if (m === LUNAR.asadh2) return LUNAR.srap;
  return m + 1;
}
/** The Buddhist Era year a Gregorian month is reckoned in (it turns in April, at Khmer New Year: near enough for the months). */
const maybeBE = (y: number, month: number): number => (month <= 4 ? y + 543 : y + 544);

// ── Days ──────────────────────────────────────────────────────────────────
const DAY_MS = 86_400_000;
/** Days since 1970 of a Gregorian date (UTC: whole days). */
const dayNo = (y: number, m: number, d: number): number => Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
const gregOf = (n: number): { year: number; month: number; day: number } => {
  const d = new Date(n * DAY_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
};

/** The lunar date of a day (`month` index of `LUNAR`; `day` 0‥29: 0‥14 the 1st‥15th of the waxing moon, 15‥ the waning). */
export function khmerLunar(y: number, m: number, d: number): { month: number; day: number } {
  let e = dayNo(1900, 1, 1);
  let month: number = LUNAR.boss;
  let diff = dayNo(y, m, d) - e;
  if (diff > 0)
    for (;;) {
      const g = gregOf(e);
      const n = daysInYear(maybeBE(g.year + 1, g.month));
      if (diff <= n) break;
      diff -= n;
      e += n;
    }
  while (diff > 0) {
    const g = gregOf(e);
    const be = maybeBE(g.year, g.month);
    const n = daysInMonth(month, be);
    if (diff <= n) break;
    diff -= n;
    e += n;
    month = nextMonth(month, be);
  }
  return { month, day: diff };
}

/** A local date at noon (a day of the player's own calendar). */
const noon = (y: number, m: number, d: number): Date => new Date(y, m - 1, d, 12);

const spans = new Map<string, RealSpan | null>();

/**
 * The next days in real life that run from `before` days ahead of the lunar day (`month`, `day`) to `after` days
 * past it, from the local day `from` (a span that is still on then counts); null: none within 400 days.
 */
export function nextLunarSpan(from: Date, month: number, day: number, before: number, after: number): RealSpan | null {
  const key = `${from.getFullYear()}-${from.getMonth()}-${from.getDate()} ${month} ${day} ${before} ${after}`;
  if (spans.has(key)) return spans.get(key)!;
  const n0 = dayNo(from.getFullYear(), from.getMonth() + 1, from.getDate());
  let out: RealSpan | null = null;
  for (let n = n0 - after; n < n0 + 400; n++) {
    const g = gregOf(n);
    const l = khmerLunar(g.year, g.month, g.day);
    if (l.month !== month || l.day !== day) continue;
    const a = gregOf(n - before);
    const b = gregOf(n + after);
    out = { first: noon(a.year, a.month, a.day), last: noon(b.year, b.month, b.day), lunar: { month, day } };
    break;
  }
  spans.set(key, out);
  return out;
}

/**
 * The next Khmer New Year in real life from the local day `from`: the three days from 14 April (Moha Songkran
 * falls on the 13th or the 14th; the holidays are the 14th‥16th: 2025, 2026, 2027), the same day the map's year
 * turns (main.ts `SEASON0`: 0 at 14 April).
 */
export function nextNewYear(from: Date): RealSpan {
  const y = from.getFullYear();
  const last = noon(y, 4, 16);
  const yy = from.getTime() <= last.getTime() + DAY_MS / 2 ? y : y + 1;
  return { first: noon(yy, 4, 14), last: noon(yy, 4, 16) };
}
