import { CALM_WEATHER, WEATHER_SETTINGS, type MapFrame, type MapWeather, type WeatherSetting } from '../types';
import { WIND } from './haze';

/**
 * The weather over the highlands: sets `f.weather` every frame, before the
 * parts' `update` (main.ts).
 *
 * Mostly fair and calm, a light breeze that comes and goes. Now and then a
 * passing monsoon shower: the clouds build for a minute or so, a gust front
 * comes in just before the rain, rain for a minute or two (heavier and
 * lighter by turns), then it eases off and the sky clears; after it, while
 * the sun is low (by day), often a rainbow in the west-north-west, and the
 * land stays wet (thicker, lower mist) for a few minutes. Rarely a storm:
 * longer, darker, windier, with lightning (`flash`: a short flicker of one
 * to four strokes, several a storm) and thunder after each (`flashAt`,
 * `flashX` / `flashZ`: the sound follows, later the farther it struck).
 *
 * How often it rains is the player's weather setting (`MapSettings.weather`,
 * the settings panel; `setting` below):
 * - `season` (the default) follows the year like real Cambodia (`f.season`,
 *   `YEAR`): the dry season (December–March, ≈ 0.65–0.95) never rains and
 *   the air is hot, hazy and still (a lighter breeze); round Khmer New Year
 *   (≈ 0.95–0.08) the mango rains, now and then a light shower; the wet
 *   season (late May–October, ≈ 0.1–0.55) a shower every 7–15 minutes of
 *   play, now and then a storm (most often as the rains set in, ≈ 0.1–0.2);
 *   May and November in between. The first rain 3–8 minutes in.
 * - `clear`: never rains; the breeze comes and goes.
 * - `rainy`: a shower every 7–13 minutes (rain from ≈ 150–190 s), about one
 *   in four a storm (never the first).
 * - `stormy`: a storm every 7–11 minutes (rain from ≈ 2 minutes in), now and
 *   then a shower between two.
 * Changing the setting: what has begun runs its course and the new schedule
 * starts from then, fair at first (its first rain as above); a switch to
 * clear fades the rain out over `FADE` s (the land dries on its own).
 *
 * All of it is a closed-form function of `f.t` (page seconds), the day the
 * page opened (`f.day`, the seed), the setting (and when it changed) and
 * `f.season` (read as each shower begins): the same moment always has the
 * same weather, and everything eases (no jumps). `schedule(until, mode,
 * season)` lists the showers of a setting from the page's start.
 *
 * Headless shots (`shot=1`) are calm unless the URL holds a weather.
 * URL (checks): `weather=clear|rain|storm|rainbow` holds that weather ·
 * `weather=auto` the schedule of the setting (the default on the live page;
 * in shots, the schedule at `t=`, the setting's default: the season) ·
 * `weather=season|rainy|stormy` that setting's schedule, whatever the
 * setting · `wind=0‥1` holds the wind · `cloud=`, `rain=`,
 * `storm=`, `rainbow=`, `wet=` (0‥1) hold one value · `flash=0‥1` a
 * lightning flash at the shot's time (on a live page it strikes again, with
 * its thunder, every `HELD_FLASH_EVERY` s; live with `weather=storm` and no
 * `flash=`, flashes come on their own every few seconds).
 */
export interface Weather {
  update(f: MapFrame): void;
  /**
   * The showers and storms that begin before `until` (s) under the setting
   * `mode` (default: the one in use) held from the page's start, at the time
   * of the year `season` (default: this frame's), for checks (empty when the
   * URL holds a weather).
   */
  schedule(until: number, mode?: WeatherSetting, season?: number): readonly WeatherEvent[];
}

/** One passing shower or storm (page seconds). */
export interface WeatherEvent {
  kind: 'shower' | 'storm';
  /** The clouds begin to build. */
  start: number;
  /** The first drops (the gust front comes just before). */
  rainOn: number;
  /** Full rain from `full` to `easeOff`. */
  full: number;
  easeOff: number;
  /** The last drops. */
  dry: number;
  /** The sky is clear again. */
  clear: number;
  /** Peaks: cloud cover, rain, wind of the gust front (0‥1). */
  cloud: number;
  rain: number;
  wind: number;
  /** A rainbow after it (0 none … 1 full; by day only), from `bowOn` to `bowOff`. */
  bow: number;
  bowOn: number;
  bowOff: number;
  /** Lightning (storms). */
  flashes: Flash[];
}

/** One lightning flash: when (s), how bright (0‥1), where (m), and its strokes (s after `t`). */
export interface Flash {
  t: number;
  power: number;
  x: number;
  z: number;
  strokes: number[];
}

type Held = Partial<MapWeather>;

/** The mist's wind (sky/haze.ts): toward the west-north-west. `windDir` wanders round it. */
const BASE_DIR = Math.atan2(WIND.x, WIND.z);
/** Where lightning strikes round (m): the middle of the map. */
const STORM_CENTRE = { x: 0, z: -200 };
/** How long the land takes to dry after rain (s, time constant). */
const DRY_TAU = 170;
/** A switch to clear fades the showers out over this long (s). */
const FADE = 30;
/** A held flash (`flash=` with a held weather) strikes again this often on a live page (s). */
const HELD_FLASH_EVERY = 12;

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** 0 before a, 1 after b, eased between. */
const ramp = (t: number, a: number, b: number) => smooth((t - a) / (b - a));
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Seeded random numbers (0‥1). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Lightning from `from` to `to` (s): a flash every `gap` s (min, max), 1–4 strokes each. */
function flashTrain(r: () => number, from: number, to: number, gap: [number, number]): Flash[] {
  const out: Flash[] = [];
  for (let t = from + r() * gap[0]; t < to; t += gap[0] + r() * (gap[1] - gap[0])) {
    const strokes = [0];
    for (let k = 0, n = Math.floor(r() * 3.2); k < n; k++) strokes.push(strokes[k] + 0.045 + r() * 0.1);
    const a = r() * Math.PI * 2;
    const d = 350 + r() * r() * 1500;
    out.push({ t, power: 0.45 + 0.55 * r(), x: STORM_CENTRE.x + Math.sin(a) * d, z: STORM_CENTRE.z + Math.cos(a) * d, strokes });
  }
  return out;
}

/** The flicker of a flash at `dt` s after it began (0‥1 before its power). */
function flicker(fl: Flash, dt: number): number {
  let v = 0;
  for (const s of fl.strokes) {
    const x = dt - s;
    if (x < 0) continue;
    // (a stroke: up in a frame, gone in a few; a dim afterglow)
    v = Math.max(v, Math.exp(-x / 0.055) * (x < 0.012 ? x / 0.012 : 1) + 0.18 * Math.exp(-x / 0.35));
  }
  return v * fl.power;
}

/** The last flash of a list that has begun by `t` (null: none yet). */
function lastFlash(list: readonly Flash[], t: number): Flash | null {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].t <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 ? list[lo - 1] : null;
}

/**
 * The rains through the year (`f.season`, 0 = mid-April), eased between these
 * marks: [season, the chance a fair spell ends in a shower, the chance it is a
 * storm, how light the showers are (0 a monsoon downpour … 1 a sprinkle), how
 * still and hazy the air is].
 */
const YEAR: readonly (readonly [number, number, number, number, number])[] = [
  [0, 0.06, 0, 1, 0.6], // mid-April, Khmer New Year: the mango rains, a rare light shower in the heat
  [0.05, 0.25, 0.12, 0.6, 0.3], // early May: the first real showers
  [0.1, 0.85, 0.4, 0.1, 0], // late May: the rains set in, storms most often
  [0.2, 0.95, 0.3, 0, 0],
  [0.55, 0.9, 0.15, 0, 0], // the end of October
  [0.6, 0.45, 0.08, 0.3, 0.3], // November: the rains end
  [0.65, 0, 0, 1, 0.8],
  [0.95, 0, 0, 1, 1], // December to March: the dry season, no rain, hot, hazy and still
  [1, 0.06, 0, 1, 0.6],
];

/** The year's rains at `season` (0‥1): the chance of a shower, of a storm, how light, how still (`YEAR`). */
export function rainsOf(season: number): { chance: number; storm: number; light: number; still: number } {
  const s = ((season % 1) + 1) % 1;
  let i = 1;
  while (i < YEAR.length - 1 && YEAR[i][0] < s) i++;
  const a = YEAR[i - 1];
  const b = YEAR[i];
  const k = clamp01((s - a[0]) / (b[0] - a[0]));
  const at = (j: number) => a[j] + (b[j] - a[j]) * k;
  return { chance: at(1), storm: at(2), light: at(3), still: at(4) };
}

/** One passing shower (light 0‥1: a lighter, shorter one) or storm, beginning at `start`. */
function passing(r: () => number, storm: boolean, start: number, light: number): WeatherEvent {
  const build = storm ? 95 + r() * 25 : 70 + r() * 25;
  const rainOn = start + build;
  const full = rainOn + (storm ? 15 : 20);
  const easeOff = full + (storm ? 120 + r() * 50 : (55 + r() * 55) * (1 - 0.45 * light));
  const dry = easeOff + (storm ? 40 : 30);
  const clear = dry + 70 + r() * 30;
  const bow = r() < (storm ? 0.55 : 0.75) ? 0.75 + 0.25 * r() : 0;
  const bowOn = easeOff + (dry - easeOff) * 0.4;
  const bowOff = dry + 70 + r() * 30;
  return {
    kind: storm ? 'storm' : 'shower',
    start,
    rainOn,
    full,
    easeOff,
    dry,
    clear,
    cloud: storm ? 1 : (0.72 + r() * 0.18) * (1 - 0.3 * light),
    rain: storm ? 1 : (0.5 + r() * 0.35) * (1 - 0.5 * light),
    wind: storm ? 0.8 + r() * 0.15 : (0.4 + r() * 0.2) * (1 - 0.35 * light),
    bow,
    bowOn,
    bowOff,
    flashes: storm ? flashTrain(r, full - 12, easeOff + 15, [5, 17]) : [],
  };
}

/** The weather of the passing showers at one moment (the most of each), gathered over the schedules. */
interface Passing {
  cloud: number;
  rain: number;
  storm: number;
  wind: number;
  bow: number;
  wet: number;
  flash: number;
  /** The last flash that struck (null: none yet). */
  fl: Flash | null;
  /** Clouds of showers still building or raining (they hide a rainbow of one gone by). */
  build: number;
}

/**
 * The showers and storms of one stretch of play under one weather setting
 * (from `from`, page s), made as far ahead as asked for.
 */
class Schedule {
  readonly events: WeatherEvent[] = [];
  private readonly r: () => number;
  /** When the next fair spell may end (s): a shower or storm begins then (following the season: by its chance). */
  private next: number;
  private storms = 0;

  constructor(
    seed: number,
    readonly mode: WeatherSetting,
    from: number,
  ) {
    const r = (this.r = rng(seed));
    // The first rain: ≈ 2½–3 min in (rainy), ≈ 2 min (stormy), 3–8 min (the season, when it rains).
    this.next = mode === 'clear' ? Infinity : from + (mode === 'rainy' ? 70 + r() * 40 : mode === 'stormy' ? 15 + r() * 20 : 110 + r() * 275);
  }

  /** Make the showers and storms that begin by `t` (the year's rains as they are at `season`). */
  reach(t: number, season: number): void {
    const r = this.r;
    while (this.next <= t) {
      const start = this.next;
      const n = this.events.length;
      const prev = this.events[n - 1];
      let storm: boolean;
      let light = 0;
      if (this.mode === 'season') {
        const y = rainsOf(season);
        if (r() >= y.chance) {
          // (a fair spell that stays fair: the next chance a while later)
          this.next = start + 480 + r() * 360;
          continue;
        }
        // (never first)
        storm = n > 0 && r() < y.storm;
        light = storm ? 0 : y.light;
      } else if (this.mode === 'rainy') {
        // (never first; about one in four after, and one at least by the fourth)
        storm = n > 0 && (r() < 0.25 || (n === 3 && this.storms === 0));
      } else {
        // (stormy: storms, now and then a shower between two)
        storm = !prev || prev.kind === 'shower' || r() >= 0.3;
      }
      if (storm) this.storms++;
      const e = passing(r, storm, start, light);
      this.events.push(e);
      // The fair spell after it: 3½–7 min (rainy), 1–3½ min (stormy), 3–9 min (the season).
      this.next = e.clear + (this.mode === 'rainy' ? 200 + r() * 220 : this.mode === 'stormy' ? 60 + r() * 160 : 180 + r() * 360);
    }
  }

  /**
   * This schedule's showers at `t` into `a` (the most of each): the ones that
   * began before `until` (when the setting changed), all fading out over
   * `FADE` s from `fade` (a switch to clear).
   */
  sample(t: number, until: number, fade: number, p: readonly number[], a: Passing): void {
    const TAU = Math.PI * 2;
    const k = fade === Infinity ? 1 : 1 - ramp(t, fade, fade + FADE);
    // (faded: the rain stops half way through the fade, then no more lightning and the land dries)
    const tw = Math.min(t, fade + FADE / 2);
    // (and a shower still building stops building at the switch: Clear never brings heavier rain)
    const tu = Math.min(t, fade);
    const drying = Math.exp(-Math.max(0, t - tw) / DRY_TAU);
    for (const e of this.events) {
      if (e.start > t || e.start >= until) break;
      // Wet: up with the rain, then drying.
      const soak = e.rain * ramp(tw, e.rainOn, e.full + 40);
      a.wet = Math.max(a.wet, (tw < e.dry ? soak : soak * Math.exp(-(tw - e.dry) / DRY_TAU)) * drying);
      if (k <= 0 || t > Math.max(e.clear, e.bowOff)) continue;
      const cloud = k * e.cloud * ramp(tu, e.start, e.rainOn + 10) * (1 - ramp(t, e.easeOff, e.clear));
      a.cloud = Math.max(a.cloud, cloud);
      if (t < e.easeOff) a.build = Math.max(a.build, cloud);
      // Rain: heavier and lighter by turns while it lasts.
      const pulse = 0.82 + 0.18 * Math.sin((t * TAU) / 23 + p[4]) * Math.sin((t * TAU) / 11 + p[5]);
      a.rain = Math.max(a.rain, k * e.rain * ramp(tu, e.rainOn, e.full) * (1 - ramp(t, e.easeOff, e.dry)) * pulse);
      if (e.kind === 'storm') a.storm = Math.max(a.storm, k * ramp(tu, e.rainOn + 5, e.full + 10) * (1 - ramp(t, e.easeOff - 20, e.dry)));
      // The gust front just before the rain, then a steady wind in it, dying away as it passes.
      const front = ramp(tu, e.rainOn - 40, e.rainOn - 5) * (1 - 0.4 * ramp(t, e.rainOn + 5, e.full + 30));
      a.wind = Math.max(a.wind, k * e.wind * front * (1 - ramp(t, e.easeOff, e.dry + 40)));
      a.bow = Math.max(a.bow, k * e.bow * ramp(t, e.bowOn, e.dry + 15) * (1 - ramp(t, e.bowOff - 30, e.bowOff)));
      const last = lastFlash(e.flashes, tw);
      if (last) {
        if (!a.fl || last.t > a.fl.t) a.fl = last;
        if (t - last.t < 2) a.flash = Math.max(a.flash, k * flicker(last, t - last.t));
      }
    }
  }
}

/** A stretch of play under one setting: its schedule, until the setting changed (`to`), faded out from `fade` (a switch to clear). */
interface Stretch {
  s: Schedule;
  to: number;
  fade: number;
}

/** The weather of one visit by its settings: the breeze and the schedules of the settings chosen. */
class Skies {
  /** Phases of the breeze and the rain's pulse. */
  readonly phase: number[];
  private readonly day: number;
  private readonly stretches: Stretch[] = [];
  /** How still the air is (the dry season), eased. */
  private still = NaN;

  constructor(day: number) {
    this.day = Math.floor(day) || 0;
    const r = rng(this.day * 7919 + 17);
    this.phase = Array.from({ length: 6 }, () => r() * Math.PI * 2);
  }

  /** The schedule of `mode` from `from` (s), the `n`-th of the visit (the same day, setting and `n`: the same weather). */
  plan(mode: WeatherSetting, from: number, n: number): Schedule {
    return new Schedule(this.day * 7919 + 101 + WEATHER_SETTINGS.indexOf(mode) * 1013 + n * 104729, mode, from);
  }

  /** The weather at `f.t` under the setting `mode` into `w` (the rainbow before the time of day). */
  sample(f: MapFrame, mode: WeatherSetting, w: MapWeather): void {
    const t = f.t;
    const list = this.stretches;
    const now = list[list.length - 1];
    if (!now) list.push({ s: this.plan(mode, 0, 0), to: Infinity, fade: Infinity });
    else if (now.s.mode !== mode) {
      // The setting changed: what has begun runs its course (a switch to clear fades it out), the new
      // schedule starts from now (fair at first).
      now.to = t;
      if (mode === 'clear') for (const s of list) s.fade = Math.min(s.fade, t);
      list.push({ s: this.plan(mode, t, list.length), to: Infinity, fade: Infinity });
      // (stretches long over are forgotten)
      while (list.length > 6 || list[0].to < t - 1500) list.shift();
    }
    list[list.length - 1].s.reach(t + 1, f.season);
    const a: Passing = { cloud: 0, rain: 0, storm: 0, wind: 0, bow: 0, wet: 0, flash: 0, fl: null, build: 0 };
    const p = this.phase;
    for (const s of list) s.s.sample(t, s.to, s.fade, p, a);
    // The air of the season: hot, hazy and still in the dry months (eased as the setting or the year turns).
    const still = mode === 'season' ? rainsOf(f.season).still : 0;
    this.still = Number.isNaN(this.still) || f.dt <= 0 ? still : this.still + (still - this.still) * (1 - Math.exp(-f.dt / 20));
    const TAU = Math.PI * 2;
    // The breeze: comes and goes over a minute or two, lulls between.
    const b = 0.5 + 0.3 * Math.sin((t * TAU) / 113 + p[0]) + 0.15 * Math.sin((t * TAU) / 47 + p[1]) + 0.05 * Math.sin((t * TAU) / 29 + p[2]);
    const breeze = (0.04 + 0.26 * smooth(b)) * (1 - 0.4 * this.still);
    // Little gusts on top (a few seconds each).
    const gust = Math.max(0, Math.sin((t * TAU) / 9.3 + p[3]) * Math.sin((t * TAU) / 5.7 + 1)) * (1 - 0.5 * this.still);
    w.cloud = a.cloud;
    w.rain = a.rain;
    w.storm = a.storm;
    w.wind = clamp01(Math.max(breeze, a.wind) + gust * 0.06 * (0.5 + 2 * a.wind));
    // (it veers a little with the gust front)
    w.windDir = BASE_DIR + 0.22 * Math.sin((t * TAU) / 260 + p[5]) + 0.1 * Math.sin((t * TAU) / 71 + p[2]) + 0.25 * a.wind;
    // (a new shower building after a change of setting hides the rainbow of the last)
    w.rainbow = a.bow * (1 - ramp(a.build, 0.25, 0.7));
    w.wet = a.wet;
    w.flash = a.flash;
    if (a.fl) {
      w.flashAt = a.fl.t;
      w.flashX = a.fl.x;
      w.flashZ = a.fl.z;
    }
  }
}

/** A weather the URL holds. */
const HELD: Record<string, Held> = {
  clear: {},
  rain: { cloud: 0.85, rain: 0.8, wind: 0.45, wet: 0.8 },
  storm: { cloud: 1, rain: 1, storm: 1, wind: 0.85, wet: 1 },
  rainbow: { cloud: 0.35, wind: 0.12, rainbow: 1, wet: 0.7 },
};
const NUMBERS = ['wind', 'cloud', 'rain', 'storm', 'rainbow', 'wet', 'flash'] as const;

/** `v` if it is a weather setting (null: not one, e.g. a word of the URL or an older page's saved setting). */
const asSetting = (v: unknown): WeatherSetting | null => (WEATHER_SETTINGS.includes(v as WeatherSetting) ? (v as WeatherSetting) : null);

/** `setting`: the weather setting in use (the settings panel; read every frame). */
export function createWeather(params: URLSearchParams, setting: () => WeatherSetting = () => 'season'): Weather {
  const shot = params.get('shot') === '1';
  const kind = params.get('weather') ?? (shot ? 'clear' : 'auto');
  const auto = !(kind in HELD);
  /** A setting's schedule the URL asks for (checks), whatever the setting. */
  const forced = asSetting(kind);
  const mode = () => forced ?? asSetting(setting()) ?? 'season';
  const held: Held = { ...(HELD[kind] ?? {}) };
  for (const k of NUMBERS) if (params.has(k)) held[k] = clamp01(Number(params.get(k)) || 0);
  let skies: Skies | null = null;
  // (a held storm on the live page: lightning every few seconds, on its own train)
  const heldFlashes = !auto && !shot && (held.storm ?? 0) > 0 && !params.has('flash') ? flashTrain(rng(5), 3, 1e7, [6, 16]) : [];
  const ensure = (day: number) => (skies ??= new Skies(day));
  /** When a held flash (`flash=`) first struck (page s). */
  let flashFrom: number | undefined;
  /** The time of the year of the last frame (for `schedule`). */
  let season = 0.45;

  return {
    update(f) {
      const w = f.weather;
      const s = ensure(f.day);
      season = f.season;
      if (auto) s.sample(f, mode(), w);
      else {
        Object.assign(w, CALM_WEATHER, held);
        const p = s.phase;
        w.windDir = BASE_DIR + 0.22 * Math.sin((f.t * Math.PI * 2) / 260 + p[5]);
        const last = lastFlash(heldFlashes, f.t);
        if (last) {
          w.flash = f.t - last.t < 2 ? flicker(last, f.t - last.t) : 0;
          w.flashAt = last.t;
          w.flashX = last.x;
          w.flashZ = last.z;
        }
        // (a held flash: struck a little way off as the page opens, and again every HELD_FLASH_EVERY s, like a
        // held storm; not a new strike, with its thunder, every frame)
        if ((held.flash ?? 0) > 0) {
          flashFrom ??= f.t;
          w.flashAt = f.t - ((f.t - flashFrom) % HELD_FLASH_EVERY);
          w.flashX = STORM_CENTRE.x - 250;
          w.flashZ = STORM_CENTRE.z - 150;
        }
      }
      if (auto) for (const k of NUMBERS) if (held[k] !== undefined) w[k] = held[k];
      // A rainbow only while the sun is up (and low: all the map's day is golden hour).
      w.rainbow *= 1 - ramp(f.night, 0.2, 0.42);
      current = w;
    },
    schedule(until, m = mode(), at = season) {
      if (!auto) return [];
      const s = (skies ?? new Skies(0)).plan(m, 0, 0);
      s.reach(until, at);
      return s.events.filter((e) => e.start < until);
    },
  };
}

let current: MapWeather = { ...CALM_WEATHER, windDir: BASE_DIR };

/**
 * The weather of this frame, for things that are not handed the frame (the
 * ramps' flags): the same object as `f.weather` once the page runs.
 */
export function weatherNow(): Readonly<MapWeather> {
  return current;
}
