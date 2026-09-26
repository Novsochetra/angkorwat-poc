import { Color, MathUtils, Vector3 } from 'three';
import { OVERVIEW, PLACES } from '../layout';
import type { MapWeather } from '../types';

/**
 * The look of the map at each time of day: colours (sRGB hex, as sampled
 * from the concept art) and strengths at four keys — golden hour (night 0),
 * dusk (0.5, the evening), moonlit night (1) and dawn (0.5, the morning) —
 * blended smoothly in between. The clock (`MapFrame.clock`: 0 afternoon,
 * 0.25 dusk, 0.5 night, 0.75 dawn) picks the side: dusk on the way into the
 * night, dawn on the way out. Then the weather leans on it (cloud cover,
 * rain, a lightning flash) and the moon's phase sets how bright the night is.
 * `SKY` holds the blend for the current frame (linear colours); the
 * atmosphere writes it first thing every frame, the mist and the picture
 * grade read it.
 *
 * The sun and the moon move (`sunPath`, `moonPath`): the sun hugs the
 * northern horizon all day (the whole day of the map is golden light), comes
 * up behind Angkor Wat at dawn, stands where the concept art has it in the
 * afternoon and goes down over the eastern hills at dusk; the moon rises
 * after dusk, is where the art has it at midnight and sets before dawn.
 * Both travel left to right as the picker sees them.
 */

interface Key {
  /** Sky straight up and at the top of the view. */
  zenith: number;
  /** Sky a little above the horizon, away from the sun. */
  horizon: number;
  /** Haze away from the sun (= scene fog colour). */
  haze: number;
  /** Haze looking at the sun / moon. */
  hazeSun: number;
  /** Sun or moon glow in the sky, and its strength. */
  glow: number;
  glowStrength: number;
  /** Key light (sun by day, moon by night). */
  key: number;
  keyIntensity: number;
  /** Sky fill (hemisphere). */
  fillSky: number;
  fillGround: number;
  fillIntensity: number;
  /** Mist: sunlit tops and shaded sides. */
  mistLit: number;
  mistShade: number;
  /** Far silhouettes before the haze. */
  far: number;
  /** Clouds in the sky: lit edge, body. */
  cloudLit: number;
  cloudBody: number;
  /** Stars 0‥1. */
  stars: number;
  /** Distance haze: start (m) and 63 % distance (m). */
  hazeNear: number;
  hazeFar: number;
  /** Valley mist: scale height (m), density (per m), max share; banks: size (m), mound height (m), coverage (0‥1, higher = fewer). */
  lowH: number;
  lowDensity: number;
  lowMax: number;
  bankSize: number;
  mound: number;
  coverage: number;
  /** Exposure of the picture. */
  exposure: number;
  /** The key light's shadows: how dark (0‥1) and how soft (blur radius, shadow-map texels). */
  shadow: number;
  shadowSoft: number;
}

const DAY: Key = {
  zenith: 0x93a2d0,
  horizon: 0xb0a4c6,
  haze: 0x8a90bc,
  hazeSun: 0xffc690,
  glow: 0xffb070,
  glowStrength: 1,
  key: 0xffcf9a,
  keyIntensity: 3.9,
  fillSky: 0x9fb0e6,
  fillGround: 0x7a6048,
  fillIntensity: 1.45,
  mistLit: 0xffe6d0,
  mistShade: 0xa2a6cc,
  far: 0x5a6488,
  cloudLit: 0xffcc98,
  cloudBody: 0xb8a4c4,
  stars: 0,
  hazeNear: 160,
  hazeFar: 1400,
  lowH: 5.5,
  lowDensity: 0.04,
  lowMax: 0.72,
  bankSize: 240,
  mound: 10,
  coverage: 0.46,
  exposure: 1.1,
  shadow: 1,
  shadowSoft: 2.5,
};

/** Dusk: warm, the last red and orange light over the hills where the sun went down. */
const DUSK: Key = {
  zenith: 0x3e4a88,
  horizon: 0x9a6e96,
  haze: 0x5c5a8c,
  hazeSun: 0xe08a78,
  glow: 0xd07060,
  glowStrength: 0.55,
  key: 0xd99a90,
  keyIntensity: 1.5,
  fillSky: 0x6f78b8,
  fillGround: 0x3a3040,
  fillIntensity: 1.0,
  mistLit: 0xc8a4b8,
  mistShade: 0x6a6c9a,
  far: 0x33385e,
  cloudLit: 0xe0a0a0,
  cloudBody: 0x6a5c88,
  stars: 0.25,
  hazeNear: 140,
  hazeFar: 1150,
  lowH: 5.5,
  lowDensity: 0.045,
  lowMax: 0.8,
  bankSize: 240,
  mound: 10,
  coverage: 0.44,
  exposure: 1.05,
  shadow: 1,
  shadowSoft: 2.5,
};

/**
 * Dawn: cool and clean — a blue sky blushing pink, pale gold low behind
 * Angkor Wat where the sun comes up, the valley mist thick and glowing,
 * soft light and soft shadows (clearly not the warm red of dusk).
 */
const DAWN: Key = {
  zenith: 0x5066aa,
  horizon: 0xd2a2bc,
  haze: 0x9aa0cc,
  hazeSun: 0xffe0b0,
  glow: 0xffd098,
  glowStrength: 0.9,
  key: 0xffd6c0,
  keyIntensity: 1.9,
  fillSky: 0x94a2dc,
  fillGround: 0x5c5064,
  fillIntensity: 1.35,
  mistLit: 0xfff0e4,
  mistShade: 0xa8acd8,
  far: 0x56608e,
  cloudLit: 0xffc8c0,
  cloudBody: 0x9c94c0,
  stars: 0.12,
  hazeNear: 125,
  hazeFar: 1100,
  lowH: 6.5,
  lowDensity: 0.055,
  lowMax: 0.84,
  bankSize: 240,
  mound: 12,
  coverage: 0.39,
  exposure: 1.05,
  shadow: 0.72,
  shadowSoft: 3.6,
};

const NIGHT: Key = {
  zenith: 0x0a2258,
  horizon: 0x1a3a78,
  haze: 0x173a7a,
  hazeSun: 0x4c72b8,
  glow: 0x6f94d8,
  glowStrength: 0.3,
  key: 0x9cb8ff,
  keyIntensity: 1.35,
  fillSky: 0x3a5cb0,
  fillGround: 0x141c34,
  fillIntensity: 1.1,
  mistLit: 0x86a6e0,
  mistShade: 0x355690,
  far: 0x0e1c44,
  cloudLit: 0x5a78b4,
  cloudBody: 0x16285c,
  stars: 1,
  hazeNear: 140,
  hazeFar: 1100,
  lowH: 5.5,
  lowDensity: 0.05,
  lowMax: 0.8,
  bankSize: 240,
  mound: 10,
  coverage: 0.42,
  exposure: 1.15,
  shadow: 1,
  shadowSoft: 2.5,
};

/** Rain: the sky, haze and far hills go to these (a cool grey, darker in a storm). */
const RAIN = { sky: 0x70788c, haze: 0x767e90, far: 0x3c4458, cloud: 0x5c6274, night: 0x101a30 };
/** A lightning flash: this cold white is added to the sky and the haze at its peak. */
const FLASH = 0xc8d4ff;

const COLOR_KEYS = ['zenith', 'horizon', 'haze', 'hazeSun', 'glow', 'key', 'fillSky', 'fillGround', 'mistLit', 'mistShade', 'far', 'cloudLit', 'cloudBody'] as const;
const NUMBER_KEYS = ['glowStrength', 'keyIntensity', 'fillIntensity', 'stars', 'hazeNear', 'hazeFar', 'lowH', 'lowDensity', 'lowMax', 'bankSize', 'mound', 'coverage', 'exposure', 'shadow', 'shadowSoft'] as const;
type ColorKey = (typeof COLOR_KEYS)[number];
type NumberKey = (typeof NUMBER_KEYS)[number];

export type SkyState = Record<ColorKey, Color> &
  Record<NumberKey, number> & {
    night: number;
    /** The day's clock (0 afternoon, 0.25 dusk, 0.5 night, 0.75 dawn) and how much of the dawn key is in the blend (0‥1). */
    clock: number;
    dawn: number;
    /** Where the sun disc and the moon disc are (unit, world), and how visible each is (0‥1). */
    sunDir: Vector3;
    moonDir: Vector3;
    sun: number;
    moon: number;
    /**
     * The moon's phase: its age in the month (0 new, 0.25 first quarter,
     * 0.5 full, 0.75 last quarter), the lit share of its disc (0‥1), and the
     * direction the sunlight comes from, in the disc's own frame (x right,
     * y up, z toward the viewer): the lit side and the terminator.
     */
    moonAge: number;
    moonLit: number;
    moonLight: Vector3;
    /** The weather as the sky shows it (0‥1): cloud cover, rain, a lightning flash now. */
    cloud: number;
    rain: number;
    flash: number;
    /** The glow in the haze: towards the sun by day, the moon by night. */
    glowDir: Vector3;
    /** Towards the key light (a cheat: from the upper right and front, so faces toward the camera read). */
    keyDir: Vector3;
  };

const DEG = Math.PI / 180;

/**
 * Where the art has the sun disc and the moon (world directions): seen from
 * the overview camera the sun sits at 66 % across / 11 % down the picture,
 * the moon at 69 % / 6 %. These are the sun at clock 0 (the golden
 * afternoon) and the moon at clock 0.5 (midnight).
 */
export const SUN_DIR = new Vector3(0.2645, 0.0387, -0.9636).normalize();
export const MOON_DIR = new Vector3(0.3065, 0.0735, -0.949).normalize();
/** Key light directions (towards the light): low sun from the east-south-east, higher moon. */
export const KEY_DAY = new Vector3(0.7, 0.42, 0.58).normalize();
export const KEY_NIGHT = new Vector3(0.46, 0.62, 0.64).normalize();

/** Compass bearing (rad, 0 north, + east) and elevation (rad) of a direction. */
const bearingOf = (v: Vector3) => Math.atan2(v.x, -v.z);
const elevationOf = (v: Vector3) => Math.asin(MathUtils.clamp(v.y, -1, 1));
/** Direction from a bearing and an elevation (rad). */
const fromAngles = (out: Vector3, bearing: number, el: number) => out.set(Math.sin(bearing) * Math.cos(el), Math.sin(el), -Math.cos(bearing) * Math.cos(el));

const SUN_B = bearingOf(SUN_DIR) / DEG;
const SUN_E = elevationOf(SUN_DIR) / DEG;
const MOON_B = bearingOf(MOON_DIR) / DEG;
const MOON_E = elevationOf(MOON_DIR) / DEG;
/** Angkor Wat's central tower seen from the overview camera (degrees). */
const AW = PLACES.find((p) => p.id === 'sanctuary')!;
const AW_B = Math.atan2(AW.x - OVERVIEW.pos[0], OVERVIEW.pos[2] - AW.z) / DEG;
/**
 * Where the sun comes up (degrees): behind Angkor Wat's right-hand towers,
 * where the far ridges dip to ≈ 1.5° (right behind the central tower they
 * stand ≈ 3° high, behind the temple's card).
 */
const RISE_B = AW_B + 7.5;

/** A path through the sky: (clock, bearing°, elevation°), looped over the day. */
type Path = readonly (readonly [number, number, number])[];

/**
 * The sun: low over the northern hills all day, left to right as the
 * picker sees it. It comes up behind Angkor Wat at dawn (0.75), climbs a
 * little and slides along the ridges to where the art has it at clock 0;
 * it goes down behind the hills on the right between 0.1 and 0.16 and
 * passes under the land back to the left by the next dawn.
 */
const SUN_PATH: Path = [
  [0, SUN_B, SUN_E],
  [0.07, SUN_B + 4, SUN_E - 0.5],
  [0.14, SUN_B + 7.5, 0.2],
  [0.2, SUN_B + 10.5, -2.2],
  [0.3, SUN_B + 15, -7],
  [0.5, SUN_B + 18, -14],
  [0.63, RISE_B - 7, -7],
  [0.7, RISE_B - 2, -0.8],
  [0.75, RISE_B, 0.7],
  [0.81, RISE_B + 2, 1.8],
  [0.88, RISE_B + 4.2, 2.45],
  [0.94, SUN_B - 1.8, 2.4],
];

/**
 * The moon: comes up over the far hills after dusk (≈ 0.33), right of the
 * Angkor Wat card, stands where the art has it at midnight and goes down
 * on the right before dawn (≈ 0.68).
 */
const MOON_PATH: Path = [
  [0, MOON_B, -24],
  [0.25, 3, -5],
  [0.32, 7.5, -0.9],
  [0.4, 12, 2.4],
  [0.5, MOON_B, MOON_E],
  [0.6, 23.5, 2.9],
  [0.68, 27.5, -0.2],
  [0.75, 31, -4.5],
];

/**
 * A smooth curve through a looped path at clock c (0‥1): cubic Hermite
 * with Catmull-Rom tangents (keys may be spaced unevenly); exactly the key
 * values at the keys. `col` 1 = bearing, 2 = elevation.
 */
function onPath(path: Path, c: number, col: 1 | 2): number {
  const n = path.length;
  c = c - Math.floor(c);
  let i = n - 1;
  for (let k = 0; k < n; k++) if (path[k][0] <= c) i = k;
  if (c < path[0][0]) c += 1;
  // (a key k laps into the next day for k ≥ n, the last one for k < 0)
  const at = (k: number): [number, number] => {
    const lap = Math.floor(k / n);
    const p = path[k - lap * n];
    return [p[0] + lap, p[col]];
  };
  const [c0, v0] = at(i - 1);
  const [c1, v1] = at(i);
  const [c2, v2] = at(i + 1);
  const [c3, v3] = at(i + 2);
  const h = c2 - c1;
  const t = (c - c1) / h;
  const m1 = ((v2 - v0) / (c2 - c0)) * h;
  const m2 = ((v3 - v1) / (c3 - c1)) * h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * v1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * v2 + (t3 - t2) * m2;
}

/** The sun at clock c: its direction (unit) → out; returns its elevation (rad). */
export function sunPath(out: Vector3, c: number): number {
  const el = onPath(SUN_PATH, c, 2) * DEG;
  fromAngles(out, onPath(SUN_PATH, c, 1) * DEG, el);
  return el;
}
/** The moon at clock c: its direction (unit) → out; returns its elevation (rad). */
export function moonPath(out: Vector3, c: number): number {
  const el = onPath(MOON_PATH, c, 2) * DEG;
  fromAngles(out, onPath(MOON_PATH, c, 1) * DEG, el);
  return el;
}

/** Days from one new moon to the next. */
export const SYNODIC_MONTH = 29.530589;
/** The lit side of a crescent leans down this far (rad): near the tropics a young moon lies on its back like a boat. */
const MOON_TILT = 0.5;

export const SKY: SkyState = {
  ...(Object.fromEntries(COLOR_KEYS.map((k) => [k, new Color()])) as Record<ColorKey, Color>),
  ...(Object.fromEntries(NUMBER_KEYS.map((k) => [k, 0])) as Record<NumberKey, number>),
  night: 0,
  clock: 0,
  dawn: 0,
  sunDir: SUN_DIR.clone(),
  moonDir: MOON_DIR.clone(),
  sun: 1,
  moon: 0,
  moonAge: 0.5,
  moonLit: 1,
  moonLight: new Vector3(0, 0, 1),
  cloud: 0,
  rain: 0,
  flash: 0,
  glowDir: SUN_DIR.clone(),
  keyDir: KEY_DAY.clone(),
};

const _a = new Color();
const _b = new Color();
const _v = new Vector3();
const _w = new Vector3();
const smooth = (t: number) => t * t * (3 - 2 * t);
const band = (a: number, b: number, x: number) => smooth(MathUtils.clamp((x - a) / (b - a), 0, 1));

/** Turn a key light direction: its bearing by `turn`, its elevation by `lift` (rad), kept at least `min` up. */
function turnKey(out: Vector3, key: Vector3, turn: number, lift: number, min: number): Vector3 {
  return fromAngles(out, bearingOf(key) + turn, Math.max(min, elevationOf(key) + lift));
}

/** What the sky needs from a frame (a `MapFrame` has it all). */
export interface SkyInput {
  night: number;
  clock: number;
  day: number;
  weather: MapWeather;
}

/** Blend the keys for the time of day, the moon and the weather into {@link SKY}. */
export function updateSky(f: SkyInput): SkyState {
  const n = MathUtils.clamp(f.night, 0, 1);
  const clock = f.clock - Math.floor(f.clock);
  // Dusk on the way into the night, dawn on the way out (they meet the day and night keys where their own share is 0: no jump).
  const mid = clock > 0.5 ? DAWN : DUSK;
  // (before sunrise the night lingers longer than it comes on after sunset: a deep blue hour, then the dawn)
  const [k0, k1, t] = n < 0.5 ? [DAY, mid, smooth(n / 0.5)] : [mid, NIGHT, smooth((n - 0.5) / 0.5) ** (mid === DAWN ? 0.6 : 1)];
  for (const k of COLOR_KEYS) SKY[k].copy(_a.setHex(k0[k])).lerp(_b.setHex(k1[k]), t);
  for (const k of NUMBER_KEYS) SKY[k] = k0[k] + (k1[k] - k0[k]) * t;
  SKY.night = n;
  SKY.clock = clock;
  SKY.dawn = mid === DAWN ? (n < 0.5 ? t : 1 - t) : 0;

  // The sun and the moon on their paths; each shows while it is over the far hills.
  const sunEl = sunPath(SKY.sunDir, clock);
  SKY.sun = band(-0.045, -0.012, sunEl);
  const moonEl = moonPath(SKY.moonDir, clock);
  SKY.moon = band(-0.05, -0.01, moonEl);
  const moonUp = band(-0.07, 0.02, moonEl);

  // The moon's phase: the month's age from the days gone by (the clock's day turns in the afternoon).
  const age = (((f.day + clock) / SYNODIC_MONTH) % 1 + 1) % 1;
  const phase = age * Math.PI * 2;
  SKY.moonAge = age;
  SKY.moonLit = (1 - Math.cos(phase)) / 2;
  // Sunlight on the moon: from behind it at new moon, from our side at full; waxing
  // lit on the right (where the sun went down), waning on the left, the lit side leaning down.
  const s = Math.sin(phase);
  SKY.moonLight.set(s * Math.cos(MOON_TILT), -Math.abs(s) * Math.sin(MOON_TILT), -Math.cos(phase)).normalize();

  // A full moon lights the night; a thin one (or none up) leaves it darker, never too dark to see.
  const nightK = smooth(MathUtils.clamp((n - 0.5) / 0.5, 0, 1));
  const moonPower = (0.55 + 0.45 * SKY.moonLit) * (0.7 + 0.3 * moonUp);
  SKY.keyIntensity *= 1 + (moonPower - 1) * nightK;
  SKY.fillIntensity *= 1 + (0.86 + 0.14 * SKY.moonLit - 1) * nightK;
  SKY.exposure += 0.07 * (1 - SKY.moonLit) * nightK;
  // (moonlight washes out the faintest stars)
  SKY.stars *= 1 + 0.15 * (1 - SKY.moonLit * moonUp) * nightK;

  // The glow in the haze: at the sun while it is up or in twilight (kept up at the
  // horizon where it has just set or is about to rise), else at the moon.
  const g = 1 - band(-0.2, 0, sunEl);
  fromAngles(_v, bearingOf(SKY.sunDir), Math.max(sunEl, 0.02));
  fromAngles(_w, bearingOf(SKY.moonDir), Math.max(moonEl, 0.03));
  SKY.glowDir.copy(_v).lerp(_w, g).normalize();
  // (only as much moon glow as there is moon)
  const moonGlow = 0.3 + 0.7 * SKY.moonLit * moonUp;
  SKY.glowStrength *= 1 + (moonGlow - 1) * g * g;
  SKY.hazeSun.lerp(SKY.haze, (1 - moonGlow) * 0.7 * g * g);

  // The key light turns with them: the sun's key swings round and drops as the sun
  // goes down or comes up; the moon's as the moon crosses the sky. (The shadow map is
  // drawn again when it turns: atmosphere.ts turns it only every few frames.)
  turnKey(_v, KEY_DAY, (bearingOf(SKY.sunDir) - SUN_B * DEG) * 0.8, (sunEl - SUN_E * DEG) * 3, 10 * DEG);
  turnKey(_w, KEY_NIGHT, (bearingOf(SKY.moonDir) - MOON_B * DEG) * 0.8, (moonEl - MOON_E * DEG) * 1.5, 18 * DEG);
  SKY.keyDir.copy(_v).lerp(_w, smooth(n)).normalize();

  weather(f.weather);
  return SKY;
}

/** The weather on the light: clouds dim the sun and soften shadows, rain cools and darkens, lightning flashes. */
function weather(w: MapWeather): void {
  const cloud = MathUtils.clamp(Math.max(w.cloud, w.rain * 0.9, w.storm), 0, 1);
  const rain = MathUtils.clamp(w.rain, 0, 1);
  const storm = MathUtils.clamp(w.storm, 0, 1);
  const flash = MathUtils.clamp(w.flash, 0, 1);
  SKY.cloud = cloud;
  SKY.rain = rain;
  SKY.flash = flash;
  if (cloud + rain + storm + flash + w.wet <= 0) return;
  const day = 1 - SKY.night;

  // Cloud cover: the sun and moon go behind it, the key light dims and its shadows go soft and pale; the sky light stays.
  // (thin cloud lets them through, pale; from about three quarters cover they are gone)
  SKY.sun *= 1 - band(0.15, 0.75, cloud);
  SKY.moon *= 1 - band(0.1, 0.7, cloud);
  SKY.glowStrength *= 1 - 0.65 * cloud;
  SKY.keyIntensity *= (1 - 0.62 * cloud) * (1 - 0.25 * storm);
  SKY.fillIntensity *= 1 + 0.12 * cloud * day - 0.12 * rain;
  SKY.shadow *= 1 - 0.62 * cloud;
  SKY.shadowSoft += 2.5 * cloud;
  SKY.hazeSun.lerp(SKY.haze, 0.6 * cloud);
  SKY.key.lerp(_a.setScalar(0.8), 0.35 * cloud);

  // Rain: cool, grey and darker; the haze closes in and the mist lies thicker.
  const wet = rain * 0.75 + storm * 0.25;
  // (the rain's hue: grey by day, a dark blue by night)
  const hue = (hex: number) => _b.setHex(hex).lerp(_a.setHex(RAIN.night), SKY.night);
  const grey = (c: Color, to: Color, k: number) => {
    const l = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
    const tl = to.r * 0.2126 + to.g * 0.7152 + to.b * 0.0722;
    // (the rain colour at this colour's brightness, darkened a little more in a storm)
    c.lerp(_a.copy(to).multiplyScalar((l / Math.max(tl, 1e-4)) * (1 - 0.25 * rain - 0.3 * storm)), k);
  };
  hue(RAIN.sky);
  for (const c of [SKY.zenith, SKY.horizon]) grey(c, _b, wet * 0.85);
  grey(SKY.fillSky, _b, wet * 0.5);
  hue(RAIN.haze);
  for (const c of [SKY.haze, SKY.hazeSun, SKY.mistShade]) grey(c, _b, wet * 0.8);
  grey(SKY.mistLit, _b, wet * 0.6);
  hue(RAIN.far);
  grey(SKY.far, _b, wet * 0.7);
  hue(RAIN.cloud);
  grey(SKY.cloudBody, _b, wet * 0.85);
  grey(SKY.cloudLit, _b, wet * 0.6);
  SKY.hazeNear *= 1 - 0.5 * wet;
  SKY.hazeFar *= 1 - 0.45 * wet;
  SKY.lowDensity *= 1 + 0.35 * wet;
  SKY.coverage -= 0.05 * wet;
  SKY.stars *= 1 - cloud;
  SKY.exposure *= 1 - 0.06 * wet;
  // (after rain the wet land breathes out thicker, lower valley mist)
  const soaked = MathUtils.clamp(w.wet, 0, 1);
  SKY.lowDensity *= 1 + 0.5 * soaked;
  SKY.lowH *= 1 - 0.2 * soaked;
  SKY.coverage -= 0.06 * soaked;

  // Lightning: for a moment the sky, the haze and the clouds light up cold and white, and the sky light floods the land.
  if (flash > 0) {
    _b.setHex(FLASH);
    const f = flash * (0.6 + 0.6 * SKY.night);
    const lighten = (c: Color, k: number) => c.add(_a.copy(_b).multiplyScalar(k));
    for (const c of [SKY.zenith, SKY.horizon, SKY.haze, SKY.hazeSun, SKY.far]) lighten(c, f * 0.55);
    lighten(SKY.cloudBody, f * 0.9);
    lighten(SKY.cloudLit, f * 1.1);
    lighten(SKY.mistLit, f * 0.5);
    lighten(SKY.mistShade, f * 0.4);
    SKY.fillSky.lerp(_b, Math.min(1, flash * 1.5));
    SKY.fillIntensity += flash * (2.5 + 4 * SKY.night);
  }
}
