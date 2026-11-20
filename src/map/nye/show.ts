import { mulberry32 } from '../../voxel/random';
import { NYE_TIMES } from './clock';
import { SHOW_AREA } from './plan';

/**
 * The New Year's Eve fireworks show (AWP-35) as a script: every rocket's launch time, place, colour, kind and
 * size, seeded, so every device makes the same list and plays it from the real clock (clock.ts `showTime`):
 * the same rocket at the same second for everyone, no network. The fireworks part (fireworks.ts) draws it,
 * the sound (audio/fireworks.ts) bangs it, both from this list. No three.js.
 *
 * The look is the owner's reference (assets/new-year-online/fireworks-reference.png): mostly temple gold, then
 * purple and lotus pink, a few ice blue-white accents; peonies, chrysanthemums, gold willows, low crackles;
 * rising trails; layered depths; a slow start, building up, a gold-willow finale.
 */

/** Kinds of burst. */
export type BurstKind =
  /** A round ball of sparks, no trails. */
  | 'peony'
  /** Sparks that leave trails. */
  | 'chrysanthemum'
  /** Long gold trails that droop and fade slowly. */
  | 'willow'
  /** Small, low, crackling (many tiny flashes). */
  | 'crackle'
  /** A flat ring of sparks. */
  | 'ring';

/** The show's colours (sRGB hex): index into this from `Rocket.color`. */
export const SHOW_COLOURS = {
  /** Temple gold (the most). */
  gold: 0xffc65a,
  /** Deep gold for willows. */
  willow: 0xffa83a,
  purple: 0xb070ff,
  /** Lotus pink. */
  lotus: 0xff6fb8,
  /** Ice blue-white (a few, as accents). */
  ice: 0xcfe8ff,
  /** White flash (crackles). */
  white: 0xfff4e0,
} as const;
export type ShowColour = keyof typeof SHOW_COLOURS;

export interface Rocket {
  /** Launch time (s after midnight). */
  t: number;
  /** Launch point (m, world). */
  x: number;
  y: number;
  z: number;
  /** Burst point (m, world). */
  bx: number;
  by: number;
  bz: number;
  /** Seconds from launch to burst. */
  rise: number;
  kind: BurstKind;
  color: ShowColour;
  /** A second colour (sparks' tips, a two-tone peony), or the same. */
  color2: ShowColour;
  /** Burst radius (m). */
  size: number;
  /** Seed for its sparks (directions, flicker). */
  seed: number;
}

/** The show's length (s). */
export const SHOW_LENGTH = NYE_TIMES.show;

let script: Rocket[] | null = null;

/** The whole show, sorted by launch time (made once; the same on every device). */
export function showScript(): readonly Rocket[] {
  return (script ??= makeScript());
}

/** The burst time of a rocket (s after midnight). */
export const burstAt = (r: Rocket): number => r.t + r.rise;

/**
 * The rockets launched in [t0, t1) (s after midnight): a slice of the script, found by bisection (no allocation
 * but the slice's own indices: `out` gets them).
 */
export function rocketsBetween(t0: number, t1: number, out: number[]): number[] {
  out.length = 0;
  const s = showScript();
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (s[m].t < t0) lo = m + 1;
    else hi = m;
  }
  for (let i = lo; i < s.length && s[i].t < t1; i++) out.push(i);
  return out;
}

/** (A first script, to be replaced by the show's real one: a steady stream of gold peonies over the show area.) */
function makeScript(): Rocket[] {
  const rnd = mulberry32(0x2027);
  const out: Rocket[] = [];
  for (let t = 1; t < SHOW_LENGTH - 10; t += 0.8 + rnd() * 1.6) {
    const x = SHOW_AREA.x + (rnd() * 2 - 1) * SHOW_AREA.spread;
    const z = SHOW_AREA.z + (rnd() * 2 - 1) * SHOW_AREA.depth;
    const by = SHOW_AREA.low + rnd() * (SHOW_AREA.high - SHOW_AREA.low);
    out.push({ t, x, y: 40, z, bx: x, by, bz: z, rise: 2.2, kind: 'peony', color: 'gold', color2: 'gold', size: 30, seed: Math.floor(rnd() * 1e9) });
  }
  return out;
}
