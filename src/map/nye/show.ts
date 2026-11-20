import { mulberry32 } from '../../voxel/random';
import { NYE_TIMES } from './clock';
import { PLATEAUS } from '../layout';
import { VIEW } from './plan';

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


/**
 * A rocket whose sparks strobe as they fade (glitter): some chrysanthemums, willows and peonies, from the seed, so
 * the script's fields stay as they are (the fireworks part reads it; the sound may crackle them).
 */
export const isGlitter = (r: Rocket): boolean => r.kind !== 'crackle' && r.kind !== 'ring' && r.seed % 5 === 0;

/**
 * How bright a rocket's burst is `tau` seconds after it burst (0 before; ≈ 1 for a 35 m peony at its peak): its
 * flash, then the glow of its sparks (a willow's lasts). The light it throws on the world (fireworks.ts: the lamps,
 * the smoke, the water) and, if wanted, the bang's loudness.
 */
export function burstLight(r: Rocket, tau: number): number {
  if (tau < 0) return 0;
  const tail = r.kind === 'willow' ? 0.35 * Math.exp(-tau / 2.6) : 0;
  return burstPower(r) * (0.75 * Math.exp(-tau / 0.09) + 0.35 * Math.exp(-tau / 0.7) + tail);
}

/** A burst's light's strength (its size squared, a 35 m burst 1; crackles less): `burstLight` scales its curve by this. */
export const burstPower = (r: Rocket): number => (r.size / 35) * (r.size / 35) * (r.kind === 'crackle' ? 0.6 : 1);

// ── The script ──────────────────────────────────────────────────────────────────────────────────────────────────
//
// Seen from the square (plan.ts `VIEW`: from inside the gate, looking north at the stage), Phnom Kulen fills the
// view: its ridge stands 40° high straight ahead, over the top of a landscape view (≈ 34°), and falls away to the
// east (33° at 20° right of the stage, 26° at 30°, 16.5° at 40°; the falls are 48° right, at the view's right
// edge). So the bursts sit over the hill's east flank, right of the stage and left of the falls (33°‥48° right),
// in three layers: high and far (big, 18°‥25° up from the square), the middle, and low and near (small crackles
// before the falls); each above what of the hill stands in front of it from the square (a big burst may reach
// over the view's top) and clear of the slope under it. Placed by bearing, distance and height from the square,
// then put on the map (round plan.ts `SHOW_AREA`'s ground, east of it for the low ones). Over them, the crown: about
// a fifth of the shells (and a third of the finale's willows) burst high over the summit and its east shoulder
// (160‥190 m; the overview's frame ends ≈ 190 m up over Kulen): over the stage when the crowd looks up, and over the hill from the overview and the rest of the map,
// whose frame leaves the east flank out.

const DEG = Math.PI / 180;
const CAM = VIEW.cam;
/** Phnom Kulen as layout.ts `PLATEAUS` has it, without its noise and steps (the land is within ±10 m of this). */
const KULEN = PLATEAUS.find((p) => p.name === 'Phnom Kulen') ?? { x: 380, z: -460, rx: 190, rz: 170, top: 150 };

/** The hill's height at a point, about (m; the plain's 8 off it). */
function hillAt(x: number, z: number): number {
  const d = Math.hypot((x - KULEN.x) / KULEN.rx, (z - KULEN.z) / KULEN.rz);
  if (d >= 1) return 8;
  const t = Math.min(1, (1 - d) / 0.72);
  return Math.max(8, KULEN.top * Math.pow(t, 0.85));
}

/** How high (radians) the hill stands seen from the square along `bearing` (radians right of north), nearer than `d` m. */
function ridgeBefore(bearing: number, d: number): number {
  let best = -1;
  const sx = Math.sin(bearing);
  const sz = -Math.cos(bearing);
  for (let s = 20; s < d - 15; s += 6) best = Math.max(best, Math.atan2(hillAt(CAM[0] + sx * s, CAM[2] + sz * s) + 6 - CAM[1], s));
  return best;
}

type Layer = 'crown' | 'high' | 'mid' | 'low';
/** Each layer: distance from the square (m), elevation seen from it (°), burst radius (m), bearing range (° right of north). */
const LAYERS: Record<Exclude<Layer, 'crown'>, { d: [number, number]; el: [number, number]; size: [number, number]; b: [number, number] }> = {
  high: { d: [200, 250], el: [18, 25], size: [32, 42], b: [33, 46] },
  mid: { d: [150, 200], el: [13, 19], size: [20, 29], b: [34, 47] },
  low: { d: [100, 140], el: [8, 12], size: [8, 13], b: [38, 48] },
};

/** The crown: the highest, biggest bursts, over Kulen's summit and its west flank, where the overview (the picker's camera) sees them over the hill (m on the map). */
const CROWN = { x0: 275, x1: 410, z0: -395, z1: -440, y: [150, 176], size: [36, 46] };

interface Spot {
  x: number;
  y: number;
  z: number;
  size: number;
}

/** A burst point in a layer at a bearing (°; random in the layer's range if not given): above the hill in front of it and clear of the slope. */
function spotIn(rnd: () => number, layer: Layer, bearing?: number, sizeK = 1): Spot {
  if (layer === 'crown') {
    // (over the summit, high: seen over the hill from the overview and the far side of the map; from the square,
    // looking up over the stage. A bearing given moves it west (low) to east (high) across its strip)
    const k = bearing === undefined ? rnd() : Math.min(1, Math.max(0, (bearing - 28) / 21));
    const x = CROWN.x0 + k * (CROWN.x1 - CROWN.x0) + (rnd() - 0.5) * 12;
    const z = CROWN.z0 - rnd() * (CROWN.z0 - CROWN.z1);
    const size = (CROWN.size[0] + rnd() * (CROWN.size[1] - CROWN.size[0])) * sizeK;
    return { x, z, size, y: Math.max(CROWN.y[0] + rnd() * (CROWN.y[1] - CROWN.y[0]), hillAt(x, z) + 22 + 0.6 * size) };
  }
  const L = LAYERS[layer];
  const b = (bearing ?? L.b[0] + rnd() * (L.b[1] - L.b[0])) * DEG;
  const d = L.d[0] + rnd() * (L.d[1] - L.d[0]);
  const size = (L.size[0] + rnd() * (L.size[1] - L.size[0])) * sizeK;
  let el = (L.el[0] + rnd() * (L.el[1] - L.el[0])) * DEG;
  const x = CAM[0] + Math.sin(b) * d;
  const z = CAM[2] - Math.cos(b) * d;
  // (above what of the hill stands in front of it, by a share of its own size; clear of the slope under it; at most 30°)
  const front = ridgeBefore(b, d) + (0.45 * size) / d;
  const slope = Math.atan2(hillAt(x, z) + 28 + 0.5 * size - CAM[1], d);
  el = Math.min(30 * DEG, Math.max(el, front, slope));
  return { x, y: CAM[1] + Math.tan(el) * d, z, size };
}

/** The script being made: its rockets, its random numbers. */
class Maker {
  readonly out: Rocket[] = [];
  constructor(readonly rnd: () => number) {}
  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.rnd() * list.length) % list.length];
  }
  /** A rocket bursting at `s` (its launch `rise` earlier: `burst` is the time it bursts at). */
  fire(burst: number, s: Spot, kind: BurstKind, color: ShowColour, color2: ShowColour = color): Rocket {
    const rnd = this.rnd;
    // (launched from the hill's slope under it or the plain, leaning a little: 3°‥9° off the vertical)
    const lean = (3 + rnd() * 6) * DEG;
    const dir = rnd() * Math.PI * 2;
    const ground = hillAt(s.x, s.z);
    const climb = Math.max(25, s.y - ground);
    const x = s.x - Math.sin(dir) * Math.tan(lean) * climb;
    const z = s.z - Math.cos(dir) * Math.tan(lean) * climb;
    const y = hillAt(x, z);
    // (a shell slows as it climbs: ≈ 2 s to 60 m, 3.4 s to 160 m)
    const rise = Math.min(4, 1.2 + Math.sqrt(s.y - y) * 0.17 + rnd() * 0.25);
    const r: Rocket = { t: Math.max(0, burst - rise), x, y, z, bx: s.x, by: s.y, bz: s.z, rise, kind, color, color2, size: s.size, seed: Math.floor(rnd() * 2 ** 30) };
    r.rise = burst - r.t;
    this.out.push(r);
    return r;
  }
}

const BRIGHT: readonly ShowColour[] = ['gold', 'gold', 'gold', 'purple', 'lotus', 'gold', 'purple', 'lotus', 'ice'];
const SECOND: Partial<Record<ShowColour, readonly ShowColour[]>> = {
  gold: ['gold', 'gold', 'willow', 'lotus', 'purple', 'white'],
  purple: ['purple', 'lotus', 'gold', 'ice'],
  lotus: ['lotus', 'purple', 'gold', 'white'],
  ice: ['ice', 'white', 'purple'],
};

/** The show (`SHOW_LENGTH` s): the acts, in order of burst; the list sorted by launch. */
function makeScript(): Rocket[] {
  const m = new Maker(mulberry32(0x2027_0101));
  const rnd = m.rnd;
  const second = (c: ShowColour) => m.pick(SECOND[c] ?? [c]);
  // (high, or now and then the crown over the summit)
  const up = (crown: number): Layer => (rnd() < crown ? 'crown' : 'high');
  const shell = (at: number, layer: Layer, kind: BurstKind, color: ShowColour, bearing?: number, sizeK = 1) => m.fire(at, spotIn(rnd, layer, bearing, sizeK), kind, color, kind === 'willow' ? 'willow' : second(color));

  // ── Midnight (0‥8 s): a fan of five gold chrysanthemums, all bursting at once as the year turns, then an ice
  // peony high in the middle of them.
  for (let i = 0; i < 5; i++) shell(2.6, i % 2 ? 'mid' : 'high', 'chrysanthemum', 'gold', 33 + i * 3.2);
  shell(4.4, 'crown', 'peony', 'ice', 38, 1.1);

  // ── A slow start (8‥70 s): one at a time, gold, a purple now and then, a willow.
  for (let t = 9; t < 70; t += 3 + rnd() * 2.2) {
    const k = rnd();
    const kind: BurstKind = k < 0.45 ? 'peony' : k < 0.85 ? 'chrysanthemum' : 'willow';
    shell(t, rnd() < 0.5 ? 'mid' : up(0.3), kind, kind === 'willow' ? 'willow' : rnd() < 0.75 ? 'gold' : 'purple');
  }

  // ── Colours (70‥180 s): pairs mirrored about the show's middle, rings, two-tone peonies, the first crackles.
  for (let t = 70; t < 180; t += 1.7 + rnd() * 1.2) {
    const k = rnd();
    if (k < 0.3) {
      // (a pair, mirrored: the same kind and colour left and right of the middle at once)
      const c = m.pick(BRIGHT);
      const kind: BurstKind = rnd() < 0.5 ? 'peony' : 'chrysanthemum';
      const off = 3 + rnd() * 4;
      const layer: Layer = rnd() < 0.5 ? 'mid' : 'high';
      shell(t, layer, kind, c, 40 - off);
      shell(t, layer, kind, c, 40 + off);
    } else if (k < 0.45) shell(t, 'mid', 'ring', m.pick(['purple', 'lotus', 'gold', 'ice'] as const));
    else if (k < 0.58) {
      for (let i = 0; i < 3; i++) shell(t + i * 0.35, 'low', 'crackle', i === 1 ? 'white' : 'gold', 39 + i * 3);
    } else shell(t, rnd() < 0.5 ? 'mid' : up(0.3), rnd() < 0.5 ? 'peony' : 'chrysanthemum', m.pick(BRIGHT));
  }

  // ── Layers (180‥290 s): big high bursts over small low ones, several at once at different depths; ice accents.
  for (let t = 180; t < 290; t += 1.0 + rnd() * 0.9) {
    shell(t, up(0.3), rnd() < 0.5 ? 'chrysanthemum' : 'peony', m.pick(BRIGHT));
    if (rnd() < 0.6) shell(t + 0.15 + rnd() * 0.3, 'low', rnd() < 0.7 ? 'crackle' : 'peony', m.pick(['gold', 'white', 'lotus'] as const));
    if (rnd() < 0.35) shell(t + 0.4, 'mid', m.pick(['ring', 'peony', 'chrysanthemum'] as const), m.pick(BRIGHT));
    if (rnd() < 0.08) shell(t + 0.6, 'crown', 'peony', 'ice', undefined, 1.15);
  }

  // ── Building up (290‥400 s): faster, fans of five every 11 s, crackle carpets, willows coming in.
  let fan = 292;
  for (let t = 290; t < 400; t += 0.55 + rnd() * 0.55) {
    if (t >= fan) {
      const c = m.pick(['gold', 'purple', 'lotus', 'gold'] as const);
      for (let i = 0; i < 5; i++) shell(t + i * 0.12, 'mid', 'chrysanthemum', c, 33 + i * 3.3);
      fan += 10 + rnd() * 3;
      t += 1.2;
      continue;
    }
    const k = rnd();
    if (k < 0.25) for (let i = 0; i < 4; i++) shell(t + i * 0.18, 'low', 'crackle', i % 2 ? 'white' : 'gold', 39 + i * 2.5 + rnd() * 1.5);
    else if (k < 0.4) shell(t, up(0.4), 'willow', 'willow');
    else if (k < 0.5) shell(t, 'mid', 'ring', m.pick(['purple', 'lotus', 'ice'] as const));
    else shell(t, rnd() < 0.6 ? up(0.3) : 'mid', rnd() < 0.55 ? 'chrysanthemum' : 'peony', m.pick(BRIGHT));
  }

  // ── A lull (400‥425 s): the sky clears; a few small ice and lotus peonies, one lone gold willow.
  for (const [t, kind, c] of [
    [403, 'peony', 'ice'],
    [408, 'peony', 'lotus'],
    [413.5, 'willow', 'willow'],
    [419, 'peony', 'ice'],
  ] as const)
    shell(t, kind === 'willow' ? 'crown' : 'mid', kind, c, kind === 'willow' ? 40 : undefined, kind === 'willow' ? 1.1 : 0.8);

  // ── The finale (425‥472 s): waves of gold willows, more and quicker, crackles under them, gold chrysanthemums
  // racing low; then the last wave: the whole sky in gold willows, white-gold peonies in their middle.
  let n = 3;
  for (let t = 425; t < 462; t += Math.max(0.9, 2.2 - (t - 425) * 0.04)) {
    for (let i = 0; i < n; i++) shell(t + rnd() * 0.25, i % 3 === 2 ? 'mid' : i % 3 === 1 ? 'crown' : 'high', 'willow', 'willow', 29 + ((i + 0.5 + (rnd() - 0.5) * 0.6) / n) * 20);
    if (rnd() < 0.7) for (let i = 0; i < 3; i++) shell(t + 0.3 + i * 0.15, 'low', 'crackle', i === 1 ? 'white' : 'gold');
    if (t > 445) shell(t + 0.5, 'mid', 'chrysanthemum', 'gold');
    n = Math.min(8, n + (rnd() < 0.5 ? 1 : 0));
  }
  for (let i = 0; i < 18; i++) shell(464 + i * 0.06 + rnd() * 0.2, i % 3 === 1 ? 'mid' : i % 3 === 2 ? 'crown' : 'high', 'willow', 'willow', 28 + (i / 17) * 21, 1.15);
  for (let i = 0; i < 6; i++) shell(464.6 + i * 0.1, 'mid', 'peony', i % 2 ? 'white' : 'gold', 35 + i * 2, 1.1);
  for (let i = 0; i < 8; i++) shell(465.2 + i * 0.12, 'low', 'crackle', i % 2 ? 'white' : 'gold', 38 + i * 1.3);

  const out = m.out.filter((r) => burstAt(r) < SHOW_LENGTH - 6);
  out.sort((a, b) => a.t - b.t || a.seed - b.seed);
  return out;
}
