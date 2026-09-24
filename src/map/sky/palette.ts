import { Color, MathUtils, Vector3 } from 'three';

/**
 * The look of the map at each time of day: colours (sRGB hex, as sampled
 * from the concept art) and strengths at three keys — golden hour (night 0),
 * dusk (0.5) and moonlit night (1) — blended smoothly in between.
 * `SKY` holds the blend for the current frame (linear colours); the
 * atmosphere writes it first thing every frame, the mist and the picture
 * grade read it.
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
};

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
};

const COLOR_KEYS = ['zenith', 'horizon', 'haze', 'hazeSun', 'glow', 'key', 'fillSky', 'fillGround', 'mistLit', 'mistShade', 'far', 'cloudLit', 'cloudBody'] as const;
const NUMBER_KEYS = ['glowStrength', 'keyIntensity', 'fillIntensity', 'stars', 'hazeNear', 'hazeFar', 'lowH', 'lowDensity', 'lowMax', 'bankSize', 'mound', 'coverage', 'exposure'] as const;
type ColorKey = (typeof COLOR_KEYS)[number];
type NumberKey = (typeof NUMBER_KEYS)[number];

export type SkyState = Record<ColorKey, Color> &
  Record<NumberKey, number> & {
    night: number;
    /** Where the sun disc and the moon disc are (unit, world), and how visible each is (0‥1). */
    sunDir: Vector3;
    moonDir: Vector3;
    sun: number;
    moon: number;
    /** The glow in the haze: towards the sun by day, the moon by night. */
    glowDir: Vector3;
    /** Towards the key light (a cheat: from the upper right and front, so faces toward the camera read). */
    keyDir: Vector3;
  };

/**
 * Where the art has the sun disc and the moon (world directions): seen from
 * the overview camera the sun sits at 66 % across / 11 % down the picture,
 * the moon at 69 % / 6 %.
 */
export const SUN_DIR = new Vector3(0.2645, 0.0387, -0.9636).normalize();
export const MOON_DIR = new Vector3(0.3065, 0.0735, -0.949).normalize();
/** Key light directions (towards the light): low sun from the east-south-east, higher moon. */
export const KEY_DAY = new Vector3(0.7, 0.42, 0.58).normalize();
export const KEY_NIGHT = new Vector3(0.46, 0.62, 0.64).normalize();

export const SKY: SkyState = {
  ...(Object.fromEntries(COLOR_KEYS.map((k) => [k, new Color()])) as Record<ColorKey, Color>),
  ...(Object.fromEntries(NUMBER_KEYS.map((k) => [k, 0])) as Record<NumberKey, number>),
  night: 0,
  sunDir: SUN_DIR.clone(),
  moonDir: MOON_DIR.clone(),
  sun: 1,
  moon: 0,
  glowDir: SUN_DIR.clone(),
  keyDir: KEY_DAY.clone(),
};

const _a = new Color();
const _b = new Color();
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Lower a direction's elevation by `angle` radians (same compass bearing). */
function sink(out: Vector3, dir: Vector3, angle: number): Vector3 {
  const el = Math.asin(MathUtils.clamp(dir.y, -1, 1)) - angle;
  const h = Math.hypot(dir.x, dir.z) || 1;
  return out.set((dir.x / h) * Math.cos(el), Math.sin(el), (dir.z / h) * Math.cos(el));
}

/** Blend the keys for `night` (0‥1) into {@link SKY}. */
export function updateSky(night: number): SkyState {
  const n = MathUtils.clamp(night, 0, 1);
  const [k0, k1, t] = n < 0.5 ? [DAY, DUSK, smooth(n / 0.5)] : [DUSK, NIGHT, smooth((n - 0.5) / 0.5)];
  for (const k of COLOR_KEYS) SKY[k].copy(_a.setHex(k0[k])).lerp(_b.setHex(k1[k]), t);
  for (const k of NUMBER_KEYS) SKY[k] = k0[k] + (k1[k] - k0[k]) * t;
  SKY.night = n;
  // The sun sets behind the far hills as night comes; the moon rises after.
  const sunSet = smooth(MathUtils.clamp(n / 0.45, 0, 1));
  sink(SKY.sunDir, SUN_DIR, sunSet * 0.14);
  SKY.sun = 1 - sunSet;
  const moonRise = smooth(MathUtils.clamp((n - 0.4) / 0.6, 0, 1));
  sink(SKY.moonDir, MOON_DIR, (1 - moonRise) * 0.12);
  SKY.moon = moonRise;
  const g = smooth(MathUtils.clamp((n - 0.3) / 0.4, 0, 1));
  SKY.glowDir.copy(SUN_DIR).lerp(MOON_DIR, g).normalize();
  SKY.keyDir.copy(KEY_DAY).lerp(KEY_NIGHT, smooth(n)).normalize();
  return SKY;
}
