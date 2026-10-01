/**
 * Kicking the sey (ទាត់សី) in the sugar-palm village: what the children's
 * circle (people/_seyCircle.ts, in the village's people scene) and the
 * roaming add-on (roam/_sey.ts: the explorer joins in) share, as plain
 * numbers — no three.js, no import, nothing per frame allocated.
 *
 * The sey is a shuttlecock of feathers on a weighted base (stacked rubber
 * discs and a washer), kicked with the inside of the foot (or, showing off, a
 * back-heel). It flies like one: kicked hard, it slows quickly, turns over at
 * the top and comes down steeply, base first (`flightAt`: a fall against
 * linear drag, closed form, so every flight is set by where it starts, where
 * it is to be kicked again and when).
 *
 * Who writes what:
 * - The circle (the people scene's step, its clock `t`): `out`, `y`, the
 *   flight (`flight`), the sey's place (`sx…`), the children's sounds and
 *   words for the add-on (`events`), `t`.
 * - The add-on (each roaming step): `joined`, `angle`, `ready`, where his two
 *   kick spots are (`footR`, `footL`), his kicks (`kick`), `paused`.
 * - Both read the other's. A shot (`sey=…`) sets `shot`: the circle then
 *   holds a still moment (`tableau`), the same every time.
 */

/** The circle's middle (world m) and the children's distance from it; the explorer stands a little further out (he is bigger). */
export const SEY_SPOT = { x: 406.5, z: -77.5 } as const;
export const SEY_R = 2.9;
export const SEY_R_ME = 3.15;
/** The day the children are out kicking (the clock: 0 afternoon, 0.25 dusk, 0.75 dawn): mid-morning to before dusk. */
export const SEY_FROM = 0.84;
export const SEY_TO = 0.2;
/**
 * His kick: the sey comes down to his foot's spot this high over the ground (m) when the timing ring closes; his foot
 * meets it this long after the press (s): the inside of the foot at once, the heel after a quick turn.
 */
export const SEY_KICK_Y = 0.8;
export const SEY_SNAP = 0.06;
export const SEY_HEEL = 0.09;
/** Drag: the speed the sey falls at (m/s, its terminal speed). */
export const SEY_FALL = 3.4;
const G = 9.8;
const K = G / SEY_FALL;

/** By day, in the children's hours. */
export const seyHours = (clock: number): boolean => clock >= SEY_FROM || clock < SEY_TO;

/** Who: a child of the circle (0‥3), the explorer, or nobody (it falls to the ground). */
export const ME = -1;
export const NOBODY = -2;

/** A flight of the sey, from where it was kicked (`s…`, at `t0`) to where it is to be kicked again (`e…`, at `t1`); after `t1` it falls on by the same law. */
export interface SeyFlight {
  on: boolean;
  t0: number;
  t1: number;
  sx: number;
  sy: number;
  sz: number;
  ex: number;
  ey: number;
  ez: number;
  /** Its start velocity (m/s), solved by `aim`. */
  vx: number;
  vy: number;
  vz: number;
  /** Who kicked it, who it goes to (`ME`, a child, `NOBODY`). */
  from: number;
  to: number;
  /** The explorer's foot it comes to ('R' / 'L'), when `to` is `ME`. */
  foot: 'R' | 'L';
  /** How it was sent: a kick, his heel, a little toss from a hand to start again. */
  kind: 'kick' | 'heel' | 'toss';
  /** Its number (each new flight counts up). */
  n: number;
}

export const newFlight = (): SeyFlight => ({ on: false, t0: 0, t1: 1, sx: 0, sy: 0, sz: 0, ex: 0, ey: 0, ez: 0, vx: 0, vy: 0, vz: 0, from: NOBODY, to: NOBODY, foot: 'R', kind: 'kick', n: 0 });

/** Set `f` to leave (sx, sy, sz) at `t0` and reach (ex, ey, ez) at `t1`. */
export function aim(f: SeyFlight, t0: number, t1: number, sx: number, sy: number, sz: number, ex: number, ey: number, ez: number): SeyFlight {
  const T = Math.max(0.2, t1 - t0);
  const F = (1 - Math.exp(-K * T)) / K;
  f.on = true;
  f.t0 = t0;
  f.t1 = t0 + T;
  f.sx = sx;
  f.sy = sy;
  f.sz = sz;
  f.ex = ex;
  f.ey = ey;
  f.ez = ez;
  f.vx = (ex - sx) / F;
  f.vz = (ez - sz) / F;
  f.vy = (ey - sy + SEY_FALL * T) / F - SEY_FALL;
  f.n++;
  return f;
}

/** Where the sey of flight `f` is at time `t` (and how it moves: `v…`), written to `out`. */
export function flightAt(f: SeyFlight, t: number, out: SeyPoint): SeyPoint {
  const tau = Math.max(0, t - f.t0);
  const ek = Math.exp(-K * tau);
  const e = (1 - ek) / K;
  out.x = f.sx + f.vx * e;
  out.y = f.sy - SEY_FALL * tau + (f.vy + SEY_FALL) * e;
  out.z = f.sz + f.vz * e;
  out.vx = f.vx * ek;
  out.vy = -SEY_FALL + (f.vy + SEY_FALL) * ek;
  out.vz = f.vz * ek;
  return out;
}

/** When flight `f` comes down to height `y` (s, the game's clock), falling (after its top). */
export function flightDown(f: SeyFlight, y: number): number {
  const p = SCRATCH;
  // (from the top on it only falls: a few Newton steps from the end of the flight)
  let t = Math.max(f.t1, apexAt(f));
  for (let i = 0; i < 8; i++) {
    flightAt(f, t, p);
    const d = p.y - y;
    if (Math.abs(d) < 1e-4 || p.vy > -1e-3) break;
    t -= d / p.vy;
  }
  return t;
}

/** When flight `f` is at its top. */
export function apexAt(f: SeyFlight): number {
  return f.vy <= 0 ? f.t0 : f.t0 + Math.log((f.vy + SEY_FALL) / SEY_FALL) / K;
}

export interface SeyPoint {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}
export const newPoint = (): SeyPoint => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
const SCRATCH = newPoint();

/** His kick: what came of a press of Space or E (the add-on judges it). */
export type SeyResult = 'good' | 'perfect' | 'early' | 'late';

/** Something the circle tells the add-on to sound or say (`events`, a ring of them). */
export interface SeyEvent {
  kind: 'thock' | 'flutter' | 'tap' | 'laugh' | 'cheer' | 'catch';
  x: number;
  y: number;
  z: number;
  gain: number;
}

const EVENTS = 8;

/** What the circle and the add-on share. */
export const SEY = {
  // ── The circle's (people/_seyCircle.ts) ──
  /** The children are out kicking (by day, no downpour, the village shown) and the circle is built. */
  out: false,
  /** The ground at the circle's middle (m). */
  y: 0,
  /** The game's clock (s): the circle's step adds to it (not while `paused`). */
  t: 0,
  /** The flight now (`on` false: the sey is in a hand or on the ground). */
  flight: newFlight(),
  /** Where the sey is now (m). */
  sx: 0,
  sy: 0,
  sz: 0,
  /** The circle has opened a place for him and the children stand round it (he may be kicked to). */
  open: false,
  /** Sounds and words for the add-on: `events[(head - k) % EVENTS]`, `head` counting up. */
  events: Array.from({ length: EVENTS }, (): SeyEvent => ({ kind: 'thock', x: 0, y: 0, z: 0, gain: 0 })),
  head: 0,

  // ── The add-on's (roam/_sey.ts) ──
  /** He is in the game (walking into his place, or there). */
  joined: false,
  /** His place round the circle (radians: toward (sin, cos) from the middle). */
  angle: 0,
  /** He stands in his place, ready (the circle may send the sey to him). */
  ready: false,
  /** Where his right and left foot meet the sey (m): in front of him, at the height of a kick. */
  footR: { x: 0, y: 0, z: 0 },
  footL: { x: 0, y: 0, z: 0 },
  /** His last kick: its count, what came of it, the flight it was at, and when his foot meets the sey (the game's clock). */
  kick: { n: 0, result: 'good' as SeyResult, flight: 0, at: 0 },
  /** His kicks in a row (the circle's children cheer at some). */
  streak: 0,
  /** A card asks something (Back to the map?): the game waits. */
  paused: false,

  // ── Checks ──
  /** A still for a shot (`sey=1|kick|heel|miss`): the circle holds that moment; '' plays. */
  shot: '' as '' | 'play' | 'kick' | 'heel' | 'miss',
};

/** The circle: tell the add-on of a sound or a word. */
export function seyEvent(kind: SeyEvent['kind'], x: number, y: number, z: number, gain = 1): void {
  const e = SEY.events[SEY.head % EVENTS];
  e.kind = kind;
  e.x = x;
  e.y = y;
  e.z = z;
  e.gain = gain;
  SEY.head++;
}
export const SEY_EVENTS = EVENTS;
