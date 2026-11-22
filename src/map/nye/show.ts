import { mulberry32 } from '../../voxel/random';
import { NYE_TIMES } from './clock';
import { LAKES, PLATEAUS } from '../layout';
import { LAKE_VIEW, VIEW } from './plan';
import { ANGKOR_FOOT } from './_fwAngkor';

/**
 * The New Year's Eve fireworks show (AWP-35) as a script: every rocket's launch time, place, colour, kind and
 * size, seeded, so every device makes the same list and plays it from the real clock (clock.ts `showTime`):
 * the same rocket at the same second for everyone, no network. The fireworks part (fireworks.ts) draws it,
 * the sound (audio/fireworks.ts) bangs it, both from this list. No three.js.
 *
 * The look is the owner's reference (assets/new-year-online/fireworks-reference.png): mostly temple gold, then
 * purple and lotus pink, a few ice blue-white accents, the flag's red and blue and jade now and then; peonies,
 * chrysanthemums, gold willows and palms, low crackles, comets, crossettes; rising trails; layered depths; the
 * signature (Angkor Wat as on the flag: its terrace, gallery and three towers) right after midnight, twice in the show and to end it;
 * a calm start, building up, a finale of layered waves.
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
  | 'ring'
  /** A few (6‥9) thick bright gold arms fanned up and out, drooping heavy at their tips; on a gold comet trunk. */
  | 'palm'
  /** A bright coloured star climbing alone with a long glittering tail, a tiny pop at its top (fired in fans). */
  | 'comet'
  /**
   * The signature: gold sparks that draw Angkor Wat as on the flag: the stepped terrace, the gallery and the three lotus-bud towers (as on
   * the flag: three towers, never five; nye/_fwAngkor.ts), flat, turned to the square (or `Rocket.face`), held crisp
   * a second, then drooping and fading gold. Its silhouette and stairs the rocket's colour, its steps and pillars the second.
   */
  | 'angkor';

/** The show's colours (sRGB hex): index into this from `Rocket.color`. */
export const SHOW_COLOURS = {
  /** Temple gold (the most). */
  gold: 0xffc65a,
  /** Deep gold for willows. */
  willow: 0xffa83a,
  purple: 0xb070ff,
  /** Lotus pink. */
  lotus: 0xff6fb8,
  /** Ice blue (a few, as accents; blue enough not to bloom white). */
  ice: 0xb0d4ff,
  /** White flash (crackles). */
  white: 0xfff4e0,
  /** The flag of Cambodia's red (sparingly: the flag moment, accents). */
  red: 0xff3047,
  /** The flag's blue, bright enough to show in the night sky. */
  blue: 0x5c8cff,
  /** Jade (sparingly; a little deep: green is the brightest colour to the eye, and a fresh jade burst bloomed into a soft ball). */
  jade: 0x2ed39a,
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
  /** A crossette (peonies, chrysanthemums, palms): late in their life its stars each pop into a few white-gold crackles. */
  cross: boolean;
  /** The signature's picture faces this point (x, z on the map); its site's crowd view (`SHOW_SITES[site].view`) if not given. */
  face?: readonly [number, number];
  /** Where it is fired: over Phnom Kulen for the festival square, or over the great lake for the lakeside crowd. */
  site: ShowSite;
  /**
   * A small low burst (the low layer: crackles, small shells near the crowd): the fireworks part draws it on low
   * graphics only near its site (`SITE_NEAR`), so a phone far off keeps its budget; never by chance, so what is drawn
   * near a site is the same on every device.
   */
  close: boolean;
  /** A valley shell (low, near a venue: `valleyShells`): its glow and flash kept small and soft. */
  valley?: boolean;
}

/** The two shows, one clock: over Phnom Kulen for the festival square, over the great lake for the lakeside crowd. */
export type ShowSite = 'kulen' | 'lake';

/**
 * Each show's crowd camera (`view`: plan.ts `VIEW`, `LAKE_VIEW`) and its middle in the sky (`at`, m: where the bursts
 * are, about; what "Watch the fireworks" turns to before any burst lights the sky, and what the light follows).
 */
export const SHOW_SITES: Record<ShowSite, { view: readonly [number, number, number]; at: { x: number; y: number; z: number } }> = {
  kulen: { view: VIEW.cam, at: { x: 465, y: 145, z: -420 } },
  lake: { view: LAKE_VIEW.cam, at: { x: -495, y: 60, z: 50 } },
};

/** On low graphics a site's `close` rockets are drawn only with the camera this near its crowd view (m). */
export const SITE_NEAR = 600;

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
export const isGlitter = (r: Rocket): boolean => (r.kind === 'peony' || r.kind === 'chrysanthemum' || r.kind === 'willow' || r.kind === 'palm') && r.seed % 5 === 0;

/** When a crossette's stars pop, about (s after its burst: the shader's 0.6‥0.7 of their kind's life): the sound's crackles. */
export const CROSS_POP: Partial<Record<BurstKind, number>> = { peony: 1.9, chrysanthemum: 2.2, palm: 2.5 };

/** How much of a willow's lasting glow each kind has (the shader's `KL`). */
const LASTING: Partial<Record<BurstKind, number>> = { willow: 1, palm: 0.6, angkor: 1 };

/**
 * How bright a rocket's burst is `tau` seconds after it burst (0 before; ≈ 1 for a 40 m peony at its peak): its
 * flash, then the glow of its sparks (a willow's lasts). The light it throws on the world (fireworks.ts: the lamps,
 * the smoke, the water) and, if wanted, the bang's loudness.
 */
export function burstLight(r: Rocket, tau: number): number {
  if (tau < 0) return 0;
  const tail = (LASTING[r.kind] ?? 0) * 0.35 * Math.exp(-tau / 2.6);
  return burstPower(r) * (0.75 * Math.exp(-tau / 0.09) + 0.35 * Math.exp(-tau / 0.7) + tail);
}

/**
 * The light a burst leaves in the haze and the clouds round it `tau` s after it burst (the sky's tint, sky/tint.ts): as
 * `burstLight`, but its flash counts for little, so a burst just opening tints the sky as its stars do, never as one
 * bright soft ball of its colour round it.
 */
export function burstGlow(r: Rocket, tau: number): number {
  if (tau < 0) return 0;
  const tail = (LASTING[r.kind] ?? 0) * 0.35 * Math.exp(-tau / 2.6);
  return burstPower(r) * (0.15 * Math.exp(-tau / 0.09) + 0.35 * Math.exp(-tau / 0.7) + tail);
}

/** A burst's light's strength (its size squared, a 40 m burst 1; crackles less): `burstLight` scales its curve by this. */
export const burstPower = (r: Rocket): number => (r.size / 40) * (r.size / 40) * (r.kind === 'crackle' ? 0.6 : 1);

// ── The script ──────────────────────────────────────────────────────────────────────────────────────────────────
//
// Seen from the square (plan.ts `VIEW`: from inside the gate, looking north at the stage), Phnom Kulen fills the
// view: its skyline (the land and its forest, measured with `fwstats=1`) stands 41° high straight ahead and falls away
// to the east (35° at 20° right of the stage, 27° at 30°, 18° at 40°, 6° at 50°, the plain from 60°; the falls are
// 42° right). The crowd looks up at it (the fireworks view, `cam=384,11,-248,410,60,-335,60`: 28° up, 60° tall), so
// the bursts fill the sky round the hill as the owner's reference does, big (a high shell's diameter about a third of
// that picture's height) and several at once: the high and far ones (24°‥38° up) and the middle (16°‥30°) right of
// the stage over the east flank (28°‥62° right), the low and near ones (crackles, small shells) before the falls, and
// the crown over the hill: shells bursting 120‥150 m out over its upper south face and summit, 40°‥55° up from the
// square, seen over the ridge from the square and over the hill from the overview (its frame ends ≈ 190 m up over
// Kulen) and the rest of the map. Each above what of the hill stands in front of it from the square by more than half
// its radius and clear of the slope under it. Placed by bearing, distance and height from the square, then put on the
// map (round plan.ts `SHOW_AREA`).

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
  high: { d: [210, 255], el: [24, 38], size: [42, 54], b: [28, 60] },
  mid: { d: [160, 205], el: [16, 30], size: [30, 40], b: [32, 62] },
  low: { d: [100, 140], el: [9, 15], size: [10, 16], b: [40, 60] },
};

/**
 * The crown: over Kulen's upper south face and its summit (bearing ° right of north and distance m from the square,
 * radius m, the highest middle m): over the ridge from the square, over the hill from the overview (the picker's
 * camera) and the rest of the map. A bearing outside its range (the east flank's 28°‥50°, as the acts give the other
 * layers) is spread across it, west to east.
 */
const CROWN = { b: [-24, 24], d: [115, 150], size: [30, 40], top: 186 };

interface Spot {
  x: number;
  y: number;
  z: number;
  size: number;
}

/** A burst point in a layer at a bearing (°; random in the layer's range if not given): above the hill in front of it and clear of the slope. */
function spotIn(rnd: () => number, layer: Layer, bearing?: number, sizeK = 1): Spot {
  if (layer === 'crown') {
    const inside = bearing !== undefined && bearing >= CROWN.b[0] - 6 && bearing <= CROWN.b[1] + 3;
    const k = bearing === undefined ? rnd() : Math.min(1, Math.max(0, (bearing - 28) / 22));
    const b = (inside ? bearing : CROWN.b[0] + k * (CROWN.b[1] - CROWN.b[0])) * DEG;
    const d = CROWN.d[0] + rnd() * (CROWN.d[1] - CROWN.d[0]);
    const size = (CROWN.size[0] + rnd() * (CROWN.size[1] - CROWN.size[0])) * sizeK;
    const x = CAM[0] + Math.sin(b) * d;
    const z = CAM[2] - Math.cos(b) * d;
    // (its middle over the slope before it by 0.6 of its radius seen from the square, a few degrees more by chance;
    // clear of the slope under it; no higher than the overview sees)
    const el = ridgeBefore(b, d) + (0.6 * size) / d + rnd() * 4 * DEG;
    return { x, z, size, y: Math.min(CROWN.top, Math.max(CAM[1] + Math.tan(el) * d, hillAt(x, z) + 24 + 0.5 * size)) };
  }
  const L = LAYERS[layer];
  const b = (bearing ?? L.b[0] + rnd() * (L.b[1] - L.b[0])) * DEG;
  const d = L.d[0] + rnd() * (L.d[1] - L.d[0]);
  const size = (L.size[0] + rnd() * (L.size[1] - L.size[0])) * sizeK;
  let el = (L.el[0] + rnd() * (L.el[1] - L.el[0])) * DEG;
  const x = CAM[0] + Math.sin(b) * d;
  const z = CAM[2] - Math.cos(b) * d;
  // (above what of the hill stands in front of it, by more than half its own radius; clear of the slope under it; at most 44°)
  const front = ridgeBefore(b, d) + (0.6 * size) / d;
  const slope = Math.atan2(hillAt(x, z) + 28 + 0.5 * size - CAM[1], d);
  el = Math.min(44 * DEG, Math.max(el, front, slope));
  return { x, y: CAM[1] + Math.tan(el) * d, z, size };
}

/** The script being made: its rockets, its random numbers. */
class Maker {
  readonly out: Rocket[] = [];
  constructor(
    readonly rnd: () => number,
    readonly site: ShowSite = 'kulen',
    /** The ground (or water: a barge's deck) a rocket is launched from at (x, z). */
    readonly ground: (x: number, z: number) => number = hillAt,
  ) {}
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
    return this.fireFrom(burst, s, x, z, rise, kind, color, color2);
  }
  /** A rocket from a given launch point (x, z on the land) bursting at `s` at `burst`, `rise` s after its launch. */
  fireFrom(burst: number, s: Spot, x: number, z: number, rise: number, kind: BurstKind, color: ShowColour, color2: ShowColour = color): Rocket {
    const r: Rocket = {
      t: Math.max(0, burst - rise),
      x,
      y: this.ground(x, z),
      z,
      bx: s.x,
      by: s.y,
      bz: s.z,
      rise,
      kind,
      color,
      color2,
      size: s.size,
      seed: Math.floor(this.rnd() * 2 ** 30),
      cross: false,
      site: this.site,
      close: false,
    };
    r.rise = burst - r.t;
    this.out.push(r);
    return r;
  }
}

const BRIGHT: readonly ShowColour[] = ['gold', 'gold', 'gold', 'purple', 'lotus', 'gold', 'purple', 'lotus', 'ice'];
/** The new colours, used sparingly (one shell in ten or so). */
const ACCENT: readonly ShowColour[] = ['jade', 'red', 'blue', 'red', 'jade', 'blue'];
const SECOND: Partial<Record<ShowColour, readonly ShowColour[]>> = {
  gold: ['gold', 'gold', 'willow', 'lotus', 'purple', 'white'],
  purple: ['purple', 'lotus', 'gold', 'ice'],
  lotus: ['lotus', 'purple', 'gold', 'white'],
  ice: ['ice', 'white', 'purple'],
  red: ['red', 'white', 'gold'],
  blue: ['blue', 'ice', 'white'],
  jade: ['jade', 'gold', 'ice'],
};

/** The signature over Kulen's east flank for the crowd (bearing ° right of north from the square, distance m, radius m): above the ridge before it. */
function signatureSpot(bearing: number, d: number, size: number): Spot {
  const b = bearing * DEG;
  const x = CAM[0] + Math.sin(b) * d;
  const z = CAM[2] - Math.cos(b) * d;
  // (its foot 2° over the ridge from the square and 25 m over the slope under it; its picture ≈ 1.25 radii tall)
  const foot = Math.max(CAM[1] + Math.tan(ridgeBefore(b, d) + 2 * DEG) * d, hillAt(x, z) + 25);
  return { x, z, size, y: foot + -ANGKOR_FOOT * size };
}
/** The signature over Kulen's west shoulder, where the overview (the picker's camera) and the rest of the map see it; it faces between the square and the overview. */
const SIGNATURE_WEST = { x: 240, z: -395, face: [259, -295] as const };

/** The show (`SHOW_LENGTH` s): the acts, in order of burst; the list sorted by launch. */
function makeScript(): Rocket[] {
  const m = new Maker(mulberry32(0x2027_0101));
  const rnd = m.rnd;
  const second = (c: ShowColour) => m.pick(SECOND[c] ?? [c]);
  // (a colour: mostly the reference's, now and then one of the new ones)
  const colour = (accent = 0.1): ShowColour => (rnd() < accent ? m.pick(ACCENT) : m.pick(BRIGHT));
  // (high, or now and then the crown over the summit)
  const up = (crown: number): Layer => (rnd() < crown ? 'crown' : 'high');
  const shell = (at: number, layer: Layer, kind: BurstKind, color: ShowColour, bearing?: number, sizeK = 1) => {
    const r = m.fire(at, spotIn(rnd, layer, bearing, sizeK), kind, color, kind === 'willow' || kind === 'palm' ? 'willow' : second(color));
    r.close = layer === 'low';
    return r;
  };
  /** Some peonies, chrysanthemums and palms are crossettes (`chance` of them). */
  const crossed = (r: Rocket, chance: number): Rocket => {
    r.cross = (r.kind === 'peony' || r.kind === 'chrysanthemum' || r.kind === 'palm') && rnd() < chance;
    return r;
  };
  /** A palm on its gold trunk; a crossette now and then. */
  const palm = (at: number, layer: Layer, bearing?: number, cross = 0.25) => crossed(shell(at, layer, 'palm', 'gold', bearing, (layer === 'mid' ? 1.3 : 1) * (0.95 + rnd() * 0.15)), cross);
  /** A fan of `count` comets from one spot low by the falls, each a little after the last, bursting at about `at`. */
  const comets = (at: number, count: number, c: ShowColour = colour(0.15)) => {
    const b0 = 43 + rnd() * 4;
    const d = 115 + rnd() * 30;
    const fx = CAM[0] + Math.sin(b0 * DEG) * d;
    const fz = CAM[2] - Math.cos(b0 * DEG) * d;
    const tail = rnd() < 0.5 ? 'gold' : 'white';
    for (let i = 0; i < count; i++) {
      const off = (i - (count - 1) / 2) * (3.2 + rnd() * 1.2);
      const b = (b0 + off) * DEG;
      const dd = d + (rnd() - 0.5) * 12;
      const x = CAM[0] + Math.sin(b) * dd;
      const z = CAM[2] - Math.cos(b) * dd;
      const y = Math.max(CAM[1] + Math.tan((27 + rnd() * 6 - Math.abs(off) * 0.35) * DEG) * dd, hillAt(x, z) + 45);
      const lx = fx + (rnd() - 0.5) * 4;
      const lz = fz + (rnd() - 0.5) * 4;
      m.fireFrom(at + i * 0.16 + rnd() * 0.14, { x, y, z, size: 4 + rnd() * 2.5 }, lx, lz, 2.1 + rnd() * 0.6, 'comet', i % 3 === 1 && rnd() < 0.5 ? second(c) : c, tail);
    }
  };
  /** The signature: over the east flank for the crowd, or (`west`) over the west shoulder for the overview. */
  const signature = (at: number, west: boolean, sizeK = 1) => {
    if (!west) return m.fire(at, signatureSpot(43 + (rnd() - 0.5) * 2, 230, 54 * sizeK), 'angkor', 'gold', 'willow');
    const s = SIGNATURE_WEST;
    const size = 48 * sizeK;
    const r = m.fire(at, { x: s.x, z: s.z, size, y: hillAt(s.x, s.z) + 25 + -ANGKOR_FOOT * size }, 'angkor', 'gold', 'willow');
    r.face = s.face;
    return r;
  };
  // (an act's bursts keep clear of a signature: none of its own within `gap` s of these)
  const SIGNATURES = [7.2, 205, 338];
  const clear = (t: number, gap = 2.2) => SIGNATURES.every((s) => Math.abs(t - s) > gap);

  // ── Midnight (0‥8 s): a fan of five gold chrysanthemums as the year turns (a breath apart, not as one), two gold
  // willows hanging over the summit and an ice peony high between them; then the first big moment: the signature, a
  // golden Angkor Wat (as on the flag) over the east flank for the crowd, its twin over the west shoulder for
  // the rest of the map.
  for (let i = 0; i < 5; i++) shell(2.6 + [0, 0.12, 0.05, 0.17, 0.08][i], i % 2 ? 'mid' : 'high', 'chrysanthemum', 'gold', 30 + i * 6.5, 0.95 + 0.2 * rnd());
  shell(3.2, 'crown', 'willow', 'willow', -16);
  shell(3.35, 'crown', 'willow', 'willow', 14);
  shell(4.4, 'crown', 'peony', 'ice', -1, 1.05);
  signature(7.2, false);
  signature(7.9, true);

  // ── The opening (11‥70 s): a calm start, two or three at once in many colours, in different parts of the sky (one
  // over the east flank, one over the hill), a palm now and then, a comet fan. At 24 s the flag: blue, red and blue
  // peonies across the sky, a white one in the red's middle (the temple), then red-and-white and blue pairs.
  for (let t = 11.5; t < 70; t += 1.05 + rnd() * 0.7) {
    if (t > 21 && t < 28.6) continue;
    const k = rnd();
    if (k < 0.12) palm(t, 'mid', undefined, 0);
    else if (k < 0.22) shell(t, up(0.4), 'willow', 'willow');
    else shell(t, rnd() < 0.5 ? 'mid' : up(0.3), rnd() < 0.5 ? 'peony' : 'chrysanthemum', colour(0.08), undefined, 0.9 + rnd() * 0.2);
    if (rnd() < 0.7) shell(t + 0.35 + rnd() * 0.5, rnd() < 0.55 ? 'crown' : 'high', rnd() < 0.6 ? 'peony' : 'chrysanthemum', colour(0.08), undefined, 0.85 + rnd() * 0.2);
    if (rnd() < 0.2) shell(t + 0.9 + rnd() * 0.4, 'low', rnd() < 0.5 ? 'crackle' : 'peony', m.pick(['gold', 'white', 'lotus'] as const));
  }
  const red = spotIn(rnd, 'mid', 42, 1.25);
  m.fire(24, spotIn(rnd, 'mid', 33), 'peony', 'blue', 'blue');
  m.fire(24.1, red, 'peony', 'red', 'red');
  m.fire(24.04, spotIn(rnd, 'mid', 52), 'peony', 'blue', 'blue');
  m.fire(24.45, { ...red, size: red.size * 0.4 }, 'peony', 'white', 'white');
  m.fire(26.4, spotIn(rnd, 'high', 35), 'peony', 'red', 'white');
  m.fire(26.6, spotIn(rnd, 'high', 50), 'peony', 'blue', 'ice');
  m.fire(26.9, spotIn(rnd, 'crown', -8), 'peony', 'red', 'white');
  m.fire(27.6, spotIn(rnd, 'high', 42), 'chrysanthemum', 'white', 'red');
  m.fire(28.2, spotIn(rnd, 'crown', 14), 'peony', 'blue', 'ice');
  // (and gold again after the flag, over the hill and to its right)
  shell(29.3, 'crown', 'chrysanthemum', 'gold', -12, 0.95);
  shell(29.6, 'high', 'chrysanthemum', 'gold', 47, 0.95);
  comets(47, 3, 'gold');

  // ── Colours (70‥180 s): three or four at once: pairs mirrored about the show's middle, rings, two-tone peonies,
  // the first crackles, palms, comet fans between the shells, the first crossettes; over the hill another shell
  // most beats.
  let fanAt = 84;
  for (let t = 70; t < 180; t += 0.8 + rnd() * 0.5) {
    if (t >= fanAt) {
      comets(t, 3 + Math.floor(rnd() * 3));
      fanAt += 22 + rnd() * 8;
      continue;
    }
    const k = rnd();
    if (k < 0.27) {
      // (a pair, mirrored: the same kind and colour left and right of the middle, a breath apart, not the same size)
      const c = colour(0.12);
      const kind: BurstKind = rnd() < 0.5 ? 'peony' : 'chrysanthemum';
      const off = 5 + rnd() * 7;
      const layer: Layer = rnd() < 0.5 ? 'mid' : 'high';
      const cr = rnd() < 0.2;
      crossed(shell(t, layer, kind, c, 44 - off, 0.92 + rnd() * 0.12), cr ? 1 : 0);
      crossed(shell(t + 0.08 + rnd() * 0.15, layer, kind, c, 44 + off, 0.92 + rnd() * 0.12), cr ? 1 : 0);
    } else if (k < 0.4) shell(t, 'mid', 'ring', m.pick(['purple', 'lotus', 'gold', 'ice', 'jade'] as const));
    else if (k < 0.52) {
      for (let i = 0; i < 3; i++) shell(t + i * 0.35, 'low', 'crackle', i === 1 ? 'white' : 'gold', 42 + i * 5);
    } else if (k < 0.62) palm(t, rnd() < 0.5 ? 'mid' : up(0.3));
    else crossed(shell(t, rnd() < 0.5 ? 'mid' : up(0.3), rnd() < 0.5 ? 'peony' : 'chrysanthemum', colour(0.12)), 0.18);
    if (rnd() < 0.7) crossed(shell(t + 0.4 + rnd() * 0.5, 'crown', rnd() < 0.5 ? 'peony' : rnd() < 0.5 ? 'chrysanthemum' : 'willow', colour(0.1)), 0.15);
  }

  // ── Layers (180‥290 s): five or six at once, big high bursts over small low ones at different depths, the crown over
  // the hill busy; palms, comets, crossettes, ice accents; at 205 s the signature again (over the west shoulder: the
  // map's turn).
  fanAt = 186;
  for (let t = 180; t < 290; t += 0.55 + rnd() * 0.45) {
    if (!clear(t)) continue;
    if (t >= fanAt) {
      comets(t, 3 + Math.floor(rnd() * 3));
      fanAt += 13 + rnd() * 7;
    } else if (rnd() < 0.16) palm(t, up(0.3));
    else crossed(shell(t, up(0.3), rnd() < 0.5 ? 'chrysanthemum' : 'peony', colour(0.12)), 0.22);
    if (rnd() < 0.5) shell(t + 0.15 + rnd() * 0.3, 'low', rnd() < 0.7 ? 'crackle' : 'peony', m.pick(['gold', 'white', 'lotus'] as const));
    if (rnd() < 0.35) shell(t + 0.4, 'mid', m.pick(['ring', 'peony', 'chrysanthemum'] as const), colour(0.15));
    if (rnd() < 0.5) crossed(shell(t + 0.6 + rnd() * 0.3, 'crown', rnd() < 0.75 ? m.pick(['peony', 'chrysanthemum'] as const) : 'willow', rnd() < 0.15 ? 'ice' : colour(0.1)), 0.2);
  }
  signature(205, true);

  // ── Building up (290‥400 s): seven or eight at once, faster: fans of five chrysanthemums every 11 s, comet fans
  // between them, crackle carpets, willows and palms coming in, crossettes, the crown full; at 338 s the signature over
  // the east flank, the sky round it clear.
  let fan = 292;
  fanAt = 297;
  for (let t = 290; t < 400; t += 0.33 + rnd() * 0.3) {
    if (!clear(t, 2.6)) continue;
    if (t >= fan) {
      const c = m.pick(['gold', 'purple', 'lotus', 'gold', 'jade'] as const);
      for (let i = 0; i < 5; i++) crossed(shell(t + i * 0.12 + rnd() * 0.06, 'mid', 'chrysanthemum', c, 32 + i * 6.5, 0.9 + rnd() * 0.2), c === 'gold' ? 0.4 : 0);
      fan += 10 + rnd() * 3;
      t += 1.2;
      continue;
    }
    if (t >= fanAt) {
      comets(t, 4 + Math.floor(rnd() * 2));
      fanAt += 9 + rnd() * 6;
      t += 0.6;
      continue;
    }
    const k = rnd();
    if (k < 0.22) for (let i = 0; i < 4; i++) shell(t + i * 0.18, 'low', 'crackle', i % 2 ? 'white' : 'gold', 41 + i * 4 + rnd() * 2);
    else if (k < 0.35) shell(t, up(0.4), 'willow', 'willow');
    else if (k < 0.45) palm(t, up(0.35), undefined, 0.35);
    else if (k < 0.54) shell(t, 'mid', 'ring', m.pick(['purple', 'lotus', 'ice', 'jade'] as const));
    else crossed(shell(t, rnd() < 0.6 ? up(0.3) : 'mid', rnd() < 0.55 ? 'chrysanthemum' : 'peony', colour(0.12)), 0.25);
    if (rnd() < 0.45) crossed(shell(t + 0.3 + rnd() * 0.3, 'crown', rnd() < 0.7 ? m.pick(['peony', 'chrysanthemum'] as const) : 'willow', colour(0.12)), 0.25);
  }
  signature(338, false, 1.05);

  // ── A lull (400‥425 s): the sky clears; a few small ice and lotus peonies, a jade one, one lone gold willow over the
  // summit.
  for (const [t, kind, c] of [
    [403, 'peony', 'ice'],
    [408, 'peony', 'lotus'],
    [413.5, 'willow', 'willow'],
    [419, 'peony', 'jade'],
  ] as const)
    shell(t, kind === 'willow' ? 'crown' : 'mid', kind, c, kind === 'willow' ? 0 : undefined, kind === 'willow' ? 1.1 : 0.8);

  // ── The finale (425‥468 s): layered waves, more and quicker: gold willows high and over the crown, palms, comet fans
  // low by the falls, rings and crackles under them, purple, lotus and jade crossettes in between, each wave's shells
  // a breath apart and of different sizes. Then the last wave: a carpet of gold willows across the sky, and out of
  // it the signature over the east flank, its twin over the west shoulder a moment later; crackles low under them.
  let n = 3;
  let wave = 0;
  for (let t = 425; t < 459; t += Math.max(0.9, 2.2 - (t - 425) * 0.04), wave++) {
    // (spread across the whole sky, over the hill and right of it, not heaped in one place: the mid layer every other wave)
    for (let i = 0; i < n; i++) shell(t + rnd() * 0.35, i % 3 === 2 && wave % 2 ? 'mid' : i % 3 === 1 ? 'crown' : 'high', 'willow', 'willow', 28 + ((i + 0.5 + (rnd() - 0.5) * 0.6) / n) * 32, 0.9 + rnd() * 0.25);
    const extra = wave % 4;
    if (extra === 0) palm(t + 0.4 + rnd() * 0.2, rnd() < 0.5 ? 'high' : 'mid', 30 + rnd() * 25, 0.5);
    else if (extra === 1) comets(t + 0.6, 3 + Math.floor(rnd() * 2));
    else if (extra === 2) shell(t + 0.5, 'mid', 'ring', m.pick(['purple', 'lotus', 'jade'] as const));
    else crossed(shell(t + 0.45, 'mid', rnd() < 0.5 ? 'peony' : 'chrysanthemum', m.pick(['purple', 'lotus', 'jade', 'purple', 'lotus'] as const)), 0.6);
    // (and in every wave a purple, lotus or jade shell high among the willows, its size its own)
    crossed(shell(t + 0.2 + rnd() * 0.4, up(0.3), rnd() < 0.6 ? 'peony' : 'chrysanthemum', (['purple', 'lotus', 'jade', 'lotus', 'purple', 'ice'] as const)[wave % 6], 30 + rnd() * 25, 0.85 + rnd() * 0.3), 0.3);
    if (rnd() < 0.55) for (let i = 0; i < 3; i++) shell(t + 0.3 + i * 0.17 + rnd() * 0.05, 'low', 'crackle', i === 1 ? 'white' : 'gold');
    if (t > 445) crossed(shell(t + 0.7, 'mid', 'chrysanthemum', 'gold', undefined, 0.85 + rnd() * 0.2), 0.5);
    n = Math.min(8, n + (rnd() < 0.5 ? 1 : 0));
  }
  for (let i = 0; i < 16; i++) shell(461.4 + i * 0.07 + rnd() * 0.25, i % 3 === 1 ? 'mid' : i % 3 === 2 ? 'crown' : 'high', 'willow', 'willow', 28 + (i / 15) * 30, 1.05 + rnd() * 0.15);
  for (let i = 0; i < 2; i++) palm(462.2 + i * 0.35, 'mid', i ? 54 : 33, 1);
  for (let i = 0; i < 6; i++) shell(462.6 + i * 0.13 + rnd() * 0.05, 'low', 'crackle', i % 2 ? 'white' : 'gold', 41 + i * 3);
  signature(464.6, false, 1.1);
  signature(465.2, true, 1.05);

  const out = [...m.out, ...valleyShells('kulen'), ...lakeShow(), ...valleyShells('lake')].filter((r) => burstAt(r) < SHOW_LENGTH - 6);
  out.sort((a, b) => a.t - b.t || a.seed - b.seed || (a.site === b.site ? 0 : a.site === 'kulen' ? -1 : 1));
  return out;
}

// ── The lake show ───────────────────────────────────────────────────────────────────────────────────────────────
//
// The same night by the great lake (plan.ts `LAKE_STAGE`, `LAKE_SHORE`): the lakeside crowd looks south-west from the
// shore terrace (`LAKE_VIEW`: bearing ≈ 222°, the floating stage 50 m off at 219°, the floating village's lights to
// the left at 170°‥190°) over the open water. Its bursts are over the water behind the stage (bearings 208°‥258°,
// clear of the village), in layers by distance and elevation from the terrace as Kulen's are from the square, and
// mirrored in the lake; launched from three rows of barges on the water (`LAKE_BARGES`; the fireworks part draws
// them, a lantern each). It follows Kulen's acts on the same clock (midnight's fan, the flag at 24 s, the signature
// at 7.2, 205, 338 and to end, the build-up, the finale's waves), at under half its density: its own seed, so Kulen's
// script is as it was.

const LCAM = LAKE_VIEW.cam;
const GREAT_LAKE = LAKES.find((l) => l.name === 'Great lake') ?? { x: -490, z: 22, rx: 206, rz: 78, rot: 0.05, level: 5 };
/** The lake's water level (m), and a barge's deck over it. */
const WATER = GREAT_LAKE.level;
const DECK = WATER + 0.7;

/** Inside the great lake's ellipse (its shore's roughness left out), `margin` m in from its shore. */
export function inGreatLake(x: number, z: number, margin = 0): boolean {
  const c = Math.cos(GREAT_LAKE.rot ?? 0);
  const s = Math.sin(GREAT_LAKE.rot ?? 0);
  const dx = x - GREAT_LAKE.x;
  const dz = z - GREAT_LAKE.z;
  return Math.hypot((dx * c + dz * s) / (GREAT_LAKE.rx - margin), (-dx * s + dz * c) / (GREAT_LAKE.rz - margin)) < 1;
}

/** A point at a bearing (° right of north) and distance (m) from the lakeside view. */
const fromShore = (bearing: number, d: number): [number, number] => [LCAM[0] + Math.sin(bearing * DEG) * d, LCAM[2] - Math.cos(bearing * DEG) * d];

/**
 * The barges the lake show is fired from (x, z on the water, m; `yaw` along their row): three rows across the view at
 * 118, 172 and 232 m from the terrace, one every 6° (bearings 208°‥256°), those on open water (10 m in from the
 * shore). The same list for the script and the drawing.
 */
export const LAKE_BARGES: readonly { x: number; z: number; yaw: number }[] = (() => {
  const out: { x: number; z: number; yaw: number }[] = [];
  for (const d of [118, 172, 232])
    for (let b = 208; b <= 256; b += 6) {
      const [x, z] = fromShore(b + (d === 172 ? 3 : 0), d);
      if (inGreatLake(x, z, 12)) out.push({ x, z, yaw: (b + 90) * DEG });
    }
  return out;
})();

/** The barge nearest (x, z). */
function bargeNear(x: number, z: number): { x: number; z: number } {
  let best = LAKE_BARGES[0];
  let bd = Infinity;
  for (const b of LAKE_BARGES) {
    const d = (b.x - x) ** 2 + (b.z - z) ** 2;
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

/**
 * The lake's layers: distance from the terrace (m), elevation seen from it (°), burst radius (m), bearings (°). Low over
 * the water, spread across the horizon behind the stage (as the owner's lake reference: the bursts just over the far
 * shore, 5°‥24° up from the terrace), so they also sit in the sky of the owner's view from over the plaza (l-over: its
 * picture ends ≈ 3° over the horizon seen from 38 m up) and are mirrored on the water under them.
 */
const LAKE_LAYERS: Record<Layer, { d: [number, number]; el: [number, number]; size: [number, number]; b: [number, number] }> = {
  // (the far high ones: over the open water west of the stage, seen from the floating village and far off)
  crown: { d: [230, 300], el: [14, 24], size: [40, 50], b: [222, 258] },
  high: { d: [180, 240], el: [9, 18], size: [34, 44], b: [206, 258] },
  mid: { d: [140, 205], el: [5, 11], size: [24, 32], b: [204, 258] },
  // (small and low, right of the stage and its board, before the far rows)
  low: { d: [105, 130], el: [5, 9], size: [9, 13], b: [226, 256] },
};

/** A lake burst point in a layer at a bearing (°; random in the layer's if not given): over open water, clear of it. */
function lakeSpot(rnd: () => number, layer: Layer, bearing?: number, sizeK = 1): Spot {
  const L = LAKE_LAYERS[layer];
  let b = bearing ?? L.b[0] + rnd() * (L.b[1] - L.b[0]);
  const d = L.d[0] + rnd() * (L.d[1] - L.d[0]);
  const size = (L.size[0] + rnd() * (L.size[1] - L.size[0])) * sizeK;
  const el = (L.el[0] + rnd() * (L.el[1] - L.el[0])) * DEG;
  // (over the water, well in from the shore: turned toward 245°, where the lake reaches from 90 to 330 m off)
  for (let k = 0; k < 40 && !inGreatLake(...fromShore(b, d), 0.25 * size + 6); k++) b += Math.sign(245 - b) * 2;
  const [x, z] = fromShore(b, d);
  // (its lowest stars may fall into the lake, as over real water)
  const y = Math.max(LCAM[1] + Math.tan(Math.min(40 * DEG, el)) * d, WATER + 14 + 0.5 * size);
  return { x, y, z, size };
}

/** The lake show (its own seed): Kulen's acts at about its density (five to seven at once across the horizon in the busy parts). */
function lakeShow(): Rocket[] {
  const m = new Maker(mulberry32(0x2027_1a6e), 'lake', () => DECK);
  const rnd = m.rnd;
  const second = (c: ShowColour) => m.pick(SECOND[c] ?? [c]);
  const colour = (accent = 0.1): ShowColour => (rnd() < accent ? m.pick(ACCENT) : m.pick(BRIGHT));
  const up = (crown: number): Layer => (rnd() < crown ? 'crown' : 'high');
  /** A rocket bursting at `s` at `at`, from the barge nearest under it (a few metres along its deck). */
  const fire = (at: number, s: Spot, kind: BurstKind, color: ShowColour, color2: ShowColour = color): Rocket => {
    const b = bargeNear(s.x, s.z);
    const x = b.x + (rnd() - 0.5) * 3;
    const z = b.z + (rnd() - 0.5) * 3;
    const rise = Math.min(4, 1.2 + Math.sqrt(s.y - DECK) * 0.17 + rnd() * 0.25);
    return m.fireFrom(at, s, x, z, rise, kind, color, color2);
  };
  const shell = (at: number, layer: Layer, kind: BurstKind, color: ShowColour, bearing?: number, sizeK = 1) => {
    const r = fire(at, lakeSpot(rnd, layer, bearing, sizeK), kind, color, kind === 'willow' || kind === 'palm' ? 'willow' : second(color));
    // (low over the water by the venue never pale: a bright ice or white burst there hazed the plaza in the bloom)
    if ((layer === 'mid' || layer === 'low') && kind !== 'crackle') {
      if (r.color === 'ice' || r.color === 'white') r.color = 'purple';
      if (r.color2 === 'ice' || r.color2 === 'white') r.color2 = 'lotus';
    }
    r.close = layer === 'low';
    return r;
  };
  const crossed = (r: Rocket, chance: number): Rocket => {
    r.cross = (r.kind === 'peony' || r.kind === 'chrysanthemum' || r.kind === 'palm') && rnd() < chance;
    return r;
  };
  const palm = (at: number, layer: Layer, bearing?: number, cross = 0.25) => crossed(shell(at, layer, 'palm', 'gold', bearing, (layer === 'mid' ? 1.3 : 1) * (0.95 + rnd() * 0.15)), cross);
  /** A fan of comets from one barge of the near row, right of the stage. */
  const comets = (at: number, count: number, c: ShowColour = colour(0.15)) => {
    const b0 = 230 + rnd() * 12;
    const [fx, fz] = fromShore(b0, 118);
    const from = bargeNear(fx, fz);
    const tail = rnd() < 0.5 ? 'gold' : 'white';
    for (let i = 0; i < count; i++) {
      const off = (i - (count - 1) / 2) * (4.5 + rnd() * 1.5);
      const dd = 118 + (rnd() - 0.5) * 14;
      const [x, z] = fromShore(b0 + off, dd);
      const y = Math.max(LCAM[1] + Math.tan((24 + rnd() * 5 - Math.abs(off) * 0.3) * DEG) * dd, WATER + 40);
      m.fireFrom(at + i * 0.16 + rnd() * 0.14, { x, y, z, size: 4 + rnd() * 2.5 }, from.x + (rnd() - 0.5) * 2, from.z + (rnd() - 0.5) * 2, 2.1 + rnd() * 0.6, 'comet', i % 3 === 1 && rnd() < 0.5 ? second(c) : c, tail);
    }
  };
  /**
   * The signature: over the water behind the stage, facing the terrace; or (`village`) farther west over the open
   * water, facing the floating village (and the rest of the map's south-west).
   */
  const signature = (at: number, village: boolean, sizeK = 1) => {
    if (!village) {
      const size = 52 * sizeK;
      const d = 210;
      const [x, z] = fromShore(222 + (rnd() - 0.5) * 3, d);
      // (its foot 10° up from the terrace: over the stage's board and the far barges)
      const foot = Math.max(LCAM[1] + Math.tan(10 * DEG) * d, WATER + 25);
      const r = fire(at, { x, z, size, y: foot + -ANGKOR_FOOT * size }, 'angkor', 'gold', 'willow');
      r.face = [LCAM[0], LCAM[2]];
      return r;
    }
    const size = 44 * sizeK;
    const r = fire(at, { x: -455, z: 2, size, y: WATER + 45 + -ANGKOR_FOOT * size }, 'angkor', 'gold', 'willow');
    r.face = [-300, 40];
    return r;
  };
  const SIGNATURES = [7.2, 205, 338];
  const clear = (t: number, gap = 2.2) => SIGNATURES.every((s) => Math.abs(t - s) > gap);

  // ── Midnight: a fan of four gold chrysanthemums as the year turns, an ice peony high over them; the signature.
  for (let i = 0; i < 4; i++) shell(2.6 + [0, 0.12, 0.06, 0.16][i], i % 2 ? 'mid' : 'high', 'chrysanthemum', 'gold', 212 + i * 13, 0.95 + 0.2 * rnd());
  shell(3.3, 'crown', 'willow', 'willow', 246);
  shell(4.4, 'crown', 'peony', 'ice', 228, 1.05);
  signature(7.2, false);

  // ── The opening (12‥70 s), two at once now and then; the flag at 24 s, as over Kulen.
  for (let t = 12.5; t < 70; t += 0.95 + rnd() * 0.6) {
    if (t > 21 && t < 28.6) continue;
    const k = rnd();
    if (k < 0.12) palm(t, 'mid', undefined, 0);
    else if (k < 0.22) shell(t, up(0.3), 'willow', 'willow');
    else shell(t, rnd() < 0.55 ? 'mid' : up(0.35), rnd() < 0.5 ? 'peony' : 'chrysanthemum', colour(0.08), undefined, 0.85 + rnd() * 0.2);
    if (rnd() < 0.65) shell(t + 0.4 + rnd() * 0.5, rnd() < 0.5 ? 'high' : 'crown', rnd() < 0.6 ? 'peony' : 'chrysanthemum', colour(0.08), undefined, 0.85 + rnd() * 0.2);
  }
  const red = lakeSpot(rnd, 'mid', 232, 1.25);
  fire(24, lakeSpot(rnd, 'mid', 214), 'peony', 'blue', 'blue');
  fire(24.1, red, 'peony', 'red', 'red');
  fire(24.04, lakeSpot(rnd, 'mid', 250), 'peony', 'blue', 'blue');
  fire(24.45, { ...red, size: red.size * 0.4 }, 'peony', 'white', 'white');
  fire(26.5, lakeSpot(rnd, 'high', 220), 'peony', 'red', 'white');
  fire(26.7, lakeSpot(rnd, 'high', 244), 'peony', 'blue', 'ice');
  fire(27.8, lakeSpot(rnd, 'crown', 232), 'chrysanthemum', 'white', 'red');
  shell(29.4, 'high', 'chrysanthemum', 'gold', 216, 0.95);
  shell(29.7, 'crown', 'chrysanthemum', 'gold', 248, 0.95);
  comets(49, 3, 'gold');

  // ── Colours (70‥180 s): three at once: mirrored pairs, rings, crackles, palms, a comet fan now and then.
  let fanAt = 92;
  for (let t = 71; t < 180; t += 0.75 + rnd() * 0.45) {
    if (t >= fanAt) {
      comets(t, 3);
      fanAt += 30 + rnd() * 10;
      continue;
    }
    const k = rnd();
    if (k < 0.25) {
      const c = colour(0.12);
      const kind: BurstKind = rnd() < 0.5 ? 'peony' : 'chrysanthemum';
      const off = 8 + rnd() * 9;
      const layer: Layer = rnd() < 0.5 ? 'mid' : 'high';
      const cr = rnd() < 0.2;
      crossed(shell(t, layer, kind, c, 232 - off, 0.92 + rnd() * 0.12), cr ? 1 : 0);
      crossed(shell(t + 0.08 + rnd() * 0.15, layer, kind, c, 232 + off, 0.92 + rnd() * 0.12), cr ? 1 : 0);
    } else if (k < 0.38) shell(t, 'mid', 'ring', m.pick(['purple', 'lotus', 'gold', 'ice', 'jade'] as const));
    else if (k < 0.5) for (let i = 0; i < 2; i++) shell(t + i * 0.35, 'low', 'crackle', i ? 'white' : 'gold', 232 + i * 9);
    else if (k < 0.6) palm(t, rnd() < 0.5 ? 'mid' : up(0.3));
    else crossed(shell(t, rnd() < 0.5 ? 'mid' : up(0.3), rnd() < 0.5 ? 'peony' : 'chrysanthemum', colour(0.12)), 0.18);
    if (rnd() < 0.45) crossed(shell(t + 0.4 + rnd() * 0.5, rnd() < 0.5 ? 'crown' : 'high', rnd() < 0.5 ? 'peony' : 'chrysanthemum', colour(0.1)), 0.15);
  }

  // ── Layers (180‥290 s): four or five at once, high over low, palms, comets; at 205 s the signature faces the
  // floating village.
  fanAt = 190;
  for (let t = 181; t < 290; t += 0.5 + rnd() * 0.45) {
    if (!clear(t)) continue;
    if (t >= fanAt) {
      comets(t, 3 + Math.floor(rnd() * 2));
      fanAt += 20 + rnd() * 8;
    } else if (rnd() < 0.16) palm(t, up(0.3));
    else crossed(shell(t, up(0.3), rnd() < 0.5 ? 'chrysanthemum' : 'peony', colour(0.12)), 0.22);
    if (rnd() < 0.5) shell(t + 0.15 + rnd() * 0.3, 'low', rnd() < 0.7 ? 'crackle' : 'peony', m.pick(['gold', 'white', 'lotus'] as const));
    if (rnd() < 0.35) shell(t + 0.4, 'mid', m.pick(['ring', 'peony', 'chrysanthemum'] as const), colour(0.15));
    if (rnd() < 0.35) crossed(shell(t + 0.6 + rnd() * 0.3, 'crown', rnd() < 0.75 ? m.pick(['peony', 'chrysanthemum'] as const) : 'willow', colour(0.12)), 0.2);
  }
  signature(205, true);

  // ── Building up (290‥400 s): five or six at once: fans of four chrysanthemums every 12 s, comet fans, crackles,
  // willows and palms; the signature again at 338 s, the sky round it clear.
  let fan = 293;
  fanAt = 300;
  for (let t = 290; t < 400; t += 0.32 + rnd() * 0.3) {
    if (!clear(t, 2.6)) continue;
    if (t >= fan) {
      const c = m.pick(['gold', 'purple', 'lotus', 'gold', 'jade'] as const);
      for (let i = 0; i < 4; i++) crossed(shell(t + i * 0.13 + rnd() * 0.06, 'mid', 'chrysanthemum', c, 212 + i * 13, 0.9 + rnd() * 0.2), c === 'gold' ? 0.4 : 0);
      fan += 11 + rnd() * 3;
      t += 1.2;
      continue;
    }
    if (t >= fanAt) {
      comets(t, 3 + Math.floor(rnd() * 2));
      fanAt += 13 + rnd() * 7;
      t += 0.6;
      continue;
    }
    const k = rnd();
    if (k < 0.2) for (let i = 0; i < 3; i++) shell(t + i * 0.2, 'low', 'crackle', i % 2 ? 'white' : 'gold', 230 + i * 7 + rnd() * 3);
    else if (k < 0.34) shell(t, up(0.4), 'willow', 'willow');
    else if (k < 0.44) palm(t, up(0.35), undefined, 0.35);
    else if (k < 0.53) shell(t, 'mid', 'ring', m.pick(['purple', 'lotus', 'ice', 'jade'] as const));
    else crossed(shell(t, rnd() < 0.6 ? up(0.3) : 'mid', rnd() < 0.55 ? 'chrysanthemum' : 'peony', colour(0.12)), 0.25);
    if (rnd() < 0.3) crossed(shell(t + 0.3 + rnd() * 0.3, 'crown', rnd() < 0.7 ? m.pick(['peony', 'chrysanthemum'] as const) : 'willow', colour(0.12)), 0.25);
  }
  signature(338, false, 1.05);

  // ── The lull: an ice peony, a lotus one, a lone gold willow.
  shell(405, 'mid', 'peony', 'ice', undefined, 0.8);
  shell(409.5, 'mid', 'peony', 'lotus', undefined, 0.8);
  shell(413.5, 'crown', 'willow', 'willow', 246, 1.05);

  // ── The finale (425‥468 s): waves of gold willows (3, growing to 5), a palm, comets, a ring or a crossette in
  // turn, a coloured shell high among them, crackles low; the last carpet of willows and the two signatures.
  let n = 3;
  let wave = 0;
  for (let t = 425.3; t < 459; t += Math.max(1.0, 2.3 - (t - 425) * 0.04), wave++) {
    for (let i = 0; i < n; i++) shell(t + rnd() * 0.35, i % 3 === 2 ? 'mid' : i % 3 === 1 ? 'crown' : 'high', 'willow', 'willow', 210 + ((i + 0.5 + (rnd() - 0.5) * 0.6) / n) * 46, 0.9 + rnd() * 0.25);
    const extra = wave % 4;
    if (extra === 0) palm(t + 0.4 + rnd() * 0.2, rnd() < 0.5 ? 'high' : 'mid', 212 + rnd() * 42, 0.5);
    else if (extra === 1) comets(t + 0.6, 3);
    else if (extra === 2) shell(t + 0.5, 'mid', 'ring', m.pick(['purple', 'lotus', 'jade'] as const));
    else crossed(shell(t + 0.45, 'mid', rnd() < 0.5 ? 'peony' : 'chrysanthemum', m.pick(['purple', 'lotus', 'jade', 'purple', 'lotus'] as const)), 0.6);
    crossed(shell(t + 0.2 + rnd() * 0.4, up(0.3), rnd() < 0.6 ? 'peony' : 'chrysanthemum', (['purple', 'lotus', 'jade', 'lotus', 'purple', 'ice'] as const)[wave % 6], 212 + rnd() * 42, 0.85 + rnd() * 0.3), 0.3);
    if (rnd() < 0.45) for (let i = 0; i < 2; i++) shell(t + 0.3 + i * 0.2 + rnd() * 0.05, 'low', 'crackle', i ? 'white' : 'gold');
    n = Math.min(5, n + (rnd() < 0.45 ? 1 : 0));
  }
  for (let i = 0; i < 9; i++) shell(461.5 + i * 0.11 + rnd() * 0.25, i % 3 === 1 ? 'mid' : i % 3 === 2 ? 'crown' : 'high', 'willow', 'willow', 208 + (i / 8) * 50, 1.05 + rnd() * 0.15);
  palm(462.3, 'mid', 240, 1);
  for (let i = 0; i < 3; i++) shell(462.7 + i * 0.15 + rnd() * 0.05, 'low', 'crackle', i % 2 ? 'white' : 'gold', 230 + i * 8);
  signature(464.6, false, 1.1);
  signature(465.2, true, 1.0);
  return m.out;
}

// ── The valley shells ───────────────────────────────────────────────────────────────────────────────────────────────
//
// Low shells, small to mid (13‥26 m), 25‥60 m up: over the Kulen pool, the picnic place and the plain east of the falls
// (in front of the falls' benches, which hide what is behind them from over the square), and over the open water well
// out behind the lake stage (150‥215 m from the terrace, not right behind the stage), in front of the big shells' falling
// gold; never ice or white, their glow and flash small and soft (`Rocket.valley`: so near, a bright pale one hazed the
// plaza and its trees); so the views from above (over the square, over the lake's
// plaza: their pictures end a few degrees over the horizon) have bursts in them too, while the crowds see them low under
// the big ones. A few through the show, more as it builds, a steady stream through the finale in colours that stand out
// from its gold willows. Their own seeds: the rest of the script is as it was.
// `Rocket.close`: on low graphics drawn only near their site.

/** Kulen's: bearing (° right of north) and distance (m) from the square, radius (m), height over the sea (m). */
const VALLEY = { b: [38, 64], d: [78, 120], size: [13, 20], y: [30, 58] };
/** In the finale, colours that stand out from its gold willows. */
const FINALE_VALLEY: readonly ShowColour[] = ['purple', 'lotus', 'jade', 'lotus', 'purple'];
/** Through the show (never ice or white so near the venues: a bright pale burst low over the water hazed the plaza). */
const VALLEY_COLOURS: readonly ShowColour[] = ['gold', 'purple', 'lotus', 'gold', 'jade', 'lotus', 'purple', 'red', 'blue'];
/** The lake's: bearing and distance from the terrace, radius, height over the sea. */
const LAKE_VALLEY = { b: [206, 256], d: [150, 215], size: [18, 26], y: [26, 44] };

function valleyShells(site: ShowSite): Rocket[] {
  const lake = site === 'lake';
  const m = new Maker(mulberry32(lake ? 0x2027_1a11 : 0x2027_0a11), site, lake ? () => DECK : hillAt);
  const rnd = m.rnd;
  const V = lake ? LAKE_VALLEY : VALLEY;
  const spot = (): Spot => {
    let b = V.b[0] + rnd() * (V.b[1] - V.b[0]);
    const d = V.d[0] + rnd() * (V.d[1] - V.d[0]);
    const size = V.size[0] + rnd() * (V.size[1] - V.size[0]);
    const y0 = V.y[0] + rnd() * (V.y[1] - V.y[0]);
    if (lake) {
      for (let k = 0; k < 40 && !inGreatLake(...fromShore(b, d), 0.25 * size + 6); k++) b += Math.sign(245 - b) * 2;
      const [x, z] = fromShore(b, d);
      return { x, z, size, y: Math.max(y0, WATER + 14 + 0.5 * size) };
    }
    const x = CAM[0] + Math.sin(b * DEG) * d;
    const z = CAM[2] - Math.cos(b * DEG) * d;
    return { x, z, size, y: Math.max(y0, hillAt(x, z) + 11 + 0.5 * size) };
  };
  const fire = (at: number) => {
    const k = rnd();
    const kind: BurstKind = k < 0.45 ? 'peony' : k < 0.8 ? 'chrysanthemum' : k < 0.9 ? 'ring' : 'crackle';
    const c: ShowColour = kind === 'crackle' ? 'gold' : m.pick(at > 425 ? FINALE_VALLEY : VALLEY_COLOURS);
    const c2 = m.pick((SECOND[c] ?? [c]).filter((k) => k !== 'white' && k !== 'ice'));
    const s = spot();
    let r: Rocket;
    if (lake) {
      const b = bargeNear(s.x, s.z);
      r = m.fireFrom(at, s, b.x + (rnd() - 0.5) * 3, b.z + (rnd() - 0.5) * 3, Math.min(4, 1.2 + Math.sqrt(s.y - DECK) * 0.17 + rnd() * 0.25), kind, c, c2);
    } else r = m.fire(at, s, kind, c, c2);
    r.close = true;
    r.valley = true;
    return r;
  };
  const signatures = [7.2, 205, 338];
  // (how often, by the acts: a few through the show, more as it builds, a stream through the finale)
  const gap = (t: number): number => (t < 70 ? 3.4 : t < 180 ? 2.4 : t < 290 ? 1.6 : t < 400 ? 0.95 : t < 425 ? 6 : lake ? 0.85 : 0.6);
  for (let t = 12; t < 462; t += gap(t) * (0.8 + 0.4 * rnd())) {
    if (signatures.some((sg) => Math.abs(t - sg) < 2.6) || (t > 21 && t < 29)) continue;
    fire(t);
  }
  return m.out;
}
