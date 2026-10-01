/**
 * The map's time, for what plans ahead or waits for it (the calendar of
 * events, sleeping in his stilt house): main.ts fills these hooks once the
 * map is built. No three.js.
 *
 * The time of day runs on "days of the cycle" (`days()`, continuous): its
 * fraction is `MapFrame.clock` (0 golden afternoon, 0.25 dusk, 0.5 night,
 * 0.75 dawn); `moment(d)` gives the clock, the day (moon phases, festivals)
 * and the time of the year (`season`) at any of them, as main.ts works them
 * out. While the Time setting is "Cycle" (the default), a day of the cycle
 * takes `dayLength` seconds of play; else the clock stands still (day or
 * night) and only a switch of the setting moves it.
 */
export interface MapMoment {
  clock: number;
  day: number;
  season: number;
}

export interface TimeHooks {
  /** Days of the cycle now (its fraction is the clock). */
  days(): number;
  /** The clock runs (the Time setting is "Cycle", nothing in the URL holds it). */
  cycling(): boolean;
  /** Seconds of play a day of the cycle takes while it runs. */
  readonly dayLength: number;
  /** The clock, the day and the season at `d` days of the cycle. */
  moment(d: number): MapMoment;
  /**
   * Move the time on to `d` days of the cycle (≥ now): the clock, the moon, the season and what they bring (the
   * festivals, the rice) jump there; the light is there at once (no slow dusk). False, nothing changed, while the
   * clock does not run (`cycling()` false) or in a headless shot.
   */
  skipTo(d: number): boolean;
  /** Parts built only when wanted (lazy.ts: the festival, the rain…) are still being built. */
  building(): boolean;
}

export const TIME: TimeHooks = {
  days: () => 0,
  cycling: () => false,
  dayLength: 360,
  moment: (d) => ({ clock: ((d % 1) + 1) % 1, day: Math.floor(d), season: 0 }),
  skipTo: () => false,
  building: () => false,
};
