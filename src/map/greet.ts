/**
 * The explorer's greeting, for everyone who may greet him back: the roaming
 * explorer (roam/_greet.ts) writes it when he greets — a sampeah to the
 * Khmer people in front of him, a wave to visitors, children or people far
 * off — and the people part (people/_greetBack.ts) reads it each frame:
 * those near him who can see him, not busy, turn to him and greet back in
 * their own way (an adult sampeahs and says "ជម្រាបសួរ", a child waves and
 * calls "សួស្ដី!", a monk nods, a visitor waves). No three.js.
 *
 * The other way round, `nearby` asks the people part who stands nearest in
 * front of him (so roaming can pick the sampeah or the wave without
 * importing the people part): the people part lends its finder with
 * `setNearbyFinder` when it is built. Nothing runs until he greets.
 */
export interface Greeting {
  /** When he greeted (s, `MapFrame.t`); −1e9 before any. */
  t: number;
  /** Where he stood (m, his feet) and the way he faced (radians: toward (sin, cos) in x, z). */
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** How: palms together (sampeah) or a wave. */
  kind: 'sampeah' | 'wave';
  /** Counts up with each greeting (a reader keeps the last it answered). */
  n: number;
}

export const GREET: Greeting = { t: -1e9, x: 0, y: 0, z: 0, yaw: 0, kind: 'sampeah', n: 0 };

/** The explorer greets now, from (x, y, z) facing `yaw`. */
export function greet(t: number, x: number, y: number, z: number, yaw: number, kind: Greeting['kind']): void {
  GREET.t = t;
  GREET.x = x;
  GREET.y = y;
  GREET.z = z;
  GREET.yaw = yaw;
  GREET.kind = kind;
  GREET.n++;
}

/** Someone near the explorer: where they stand (m, feet), how far off (m), who (`Look.kind`: villager, kid, monk, visitor…), and whether an elder (grey hair). */
export interface Nearby {
  x: number;
  y: number;
  z: number;
  d: number;
  kind: string;
  elder: boolean;
}

/**
 * Finds the person nearest (x, y, z) within `range` m and `cone` radians
 * either side of `yaw`, on about the same floor; fills `out` and says
 * whether there was one.
 */
export type NearbyFinder = (x: number, y: number, z: number, yaw: number, range: number, cone: number, out: Nearby) => boolean;

let finder: NearbyFinder | null = null;

/** The people part lends its finder (null: none, e.g. `people=0`). */
export function setNearbyFinder(f: NearbyFinder | null): void {
  finder = f;
}

/** The person nearest him in front (see `NearbyFinder`), in `out`; null when nobody is there or there are no people. */
export function nearby(x: number, y: number, z: number, yaw: number, range: number, cone: number, out: Nearby): Nearby | null {
  return finder?.(x, y, z, yaw, range, cone, out) ? out : null;
}
