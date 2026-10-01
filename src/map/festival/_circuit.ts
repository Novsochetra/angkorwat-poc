import { PAGODA } from '../village/_spots';
import type { Festival } from './_schedule';

/**
 * The walk round the village pagoda's hall (vihear, វិហារ) at its two
 * festivals, and the line of people on it (no three.js: the festival part
 * moves the people, the roaming add-ons put the explorer in the line, the
 * sound follows the monks; all read and write `PROCESSION`).
 *
 * The way round (pradakshina, ប្រទក្សិណ): on the terrace (top 9 m) round the
 * hall's plinth, clockwise seen from above, the hall on the walker's right:
 * east along the front (over the front step, between the plinth and the
 * front seima), south down the east side (out round the middle seima
 * shrine), west along the back (between the plinth and the back seima),
 * north up the west side. Sampled into `N` equal steps: `pathAt(s)` is a
 * lookup, no allocation.
 *
 * The line: `SLOTS` places spaced evenly round the way, moving at `SPEED`
 * (a round in `ROUND` s, so every repeating motion fits the festival kit's
 * 600 s clock); the walkers fill all of them but one, the free one just
 * ahead of the first walker (the monks lead at Visak Bochea). The explorer
 * joining takes a place: the walkers from there on step back one place, the
 * last into the free one; leaving, they close up again.
 */

const X = PAGODA.x;
const TY = PAGODA.terrace.y;
/** The front step up to the porch (village/_pagoda.ts): its half width and top. */
const STEP_HALF = 2;
const STEP_TOP = TY + 0.5;

/** The way's lines (m): the front and back (z), the sides (x from the hall's axis), the sides' bulge round the middle seima. */
const WAY = { north: 94.2, south: 114.22, side: 6.42, bulge: 8.25, corner: 0.62, seimaZ: 104.25, bulgeHalf: 1.45, bulgeRamp: 1.35, stepZ: 94.02 } as const;

/** Samples round the way. */
const N = 1024;
/** A round takes this long (s): 600 s is a whole number of rounds and of places' passing (the kit's clock). */
export const ROUND = 60;
/** Places round the way. */
export const SLOTS = 30;

export interface PathPoint {
  x: number;
  y: number;
  z: number;
  /** Heading along the way (radians: 0 = +z, π/2 = +x). */
  yaw: number;
}

/** The way as a closed polyline before resampling: (x, z) pairs from the front's middle, clockwise from above. */
function outline(): number[] {
  const pts: number[] = [];
  const W = WAY;
  const push = (x: number, z: number) => pts.push(X + x, z);
  const arc = (cx: number, cz: number, a0: number, a1: number) => {
    for (let i = 1; i <= 6; i++) {
      const a = a0 + ((a1 - a0) * i) / 6;
      push(cx + Math.sin(a) * W.corner, cz + Math.cos(a) * W.corner);
    }
  };
  const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
  /** A side's x at z: out round the middle seima. */
  const sideX = (z: number) => {
    const d = Math.abs(z - W.seimaZ);
    const k = 1 - ease((d - W.bulgeHalf) / W.bulgeRamp);
    return W.side + (W.bulge - W.side) * k;
  };
  const x0 = W.side - W.corner;
  const zN = W.north;
  const zS = W.south;
  // The front, east from the middle (on the step, then down beside it).
  for (let x = 0; x < x0; x += 0.25) push(x, frontZ(x));
  // NE corner: from heading +x round to +z (angles: sin → x, cos → z).
  arc(x0, zN + W.corner, Math.PI, Math.PI / 2);
  for (let z = zN + W.corner; z < zS - W.corner; z += 0.25) push(sideX(z), z);
  arc(x0, zS - W.corner, Math.PI / 2, 0);
  for (let x = x0; x > -x0; x -= 0.25) push(x, zS);
  arc(-x0, zS - W.corner, 0, -Math.PI / 2);
  for (let z = zS - W.corner; z > zN + W.corner; z -= 0.25) push(-sideX(z), z);
  arc(-x0, zN + W.corner, -Math.PI / 2, -Math.PI);
  for (let x = -x0; x < 0; x += 0.25) push(x, frontZ(x));
  return pts;
}

/** The front's z at x (from the axis): on the step (`stepZ`) across its width, beside it a little further from the seima. */
function frontZ(x: number): number {
  const u = Math.min(1, Math.max(0, (Math.abs(x) - (STEP_HALF - 0.1)) / 0.55));
  return WAY.stepZ + (WAY.north - WAY.stepZ) * u * u * (3 - 2 * u);
}

/** The floor under the way at x: the front step's top across its width (stepping up and down at its ends), else the terrace. */
function floorAt(x: number, z: number): number {
  if (z > WAY.north + 1) return TY;
  const d = Math.abs(x - X);
  const u = Math.min(1, Math.max(0, (d - (STEP_HALF - 0.12)) / 0.42));
  return STEP_TOP - 0.5 * u * u * (3 - 2 * u);
}

const PX = new Float32Array(N + 1);
const PZ = new Float32Array(N + 1);
const PY = new Float32Array(N + 1);
const PYAW = new Float32Array(N + 1);
/** Length of the way round (m). */
export const LENGTH = (() => {
  const p = outline();
  const n = p.length / 2;
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    cum[i + 1] = cum[i] + Math.hypot(p[j * 2] - p[i * 2], p[j * 2 + 1] - p[i * 2 + 1]);
  }
  const L = cum[n];
  let k = 0;
  for (let i = 0; i <= N; i++) {
    const s = (i / N) * L;
    while (k < n - 1 && cum[k + 1] < s) k++;
    const j = (k + 1) % n;
    const u = (s - cum[k]) / Math.max(1e-6, cum[k + 1] - cum[k]);
    PX[i] = p[k * 2] + (p[j * 2] - p[k * 2]) * u;
    PZ[i] = p[k * 2 + 1] + (p[j * 2 + 1] - p[k * 2 + 1]) * u;
    PY[i] = floorAt(PX[i], PZ[i]);
  }
  // Headings: along the way, smoothed over a metre either side (no snap at the samples).
  const w = Math.max(1, Math.round((1 / L) * N));
  for (let i = 0; i <= N; i++) {
    const a = (i - w + N) % N;
    const b = (i + w) % N;
    PYAW[i] = Math.atan2(PX[b] - PX[a], PZ[b] - PZ[a]);
  }
  return L;
})();

/** Metres a second along the way. */
export const SPEED = LENGTH / ROUND;
/** Between two places (m). */
export const GAP = LENGTH / SLOTS;

/** Wrap a position along the way into 0‥LENGTH. */
export const wrapS = (s: number): number => ((s % LENGTH) + LENGTH) % LENGTH;

/** Where the way is at `s` m from the front's middle (written into `out`). */
export function pathAt(s: number, out: PathPoint): PathPoint {
  const f = (wrapS(s) / LENGTH) * N;
  const i = Math.min(N - 1, Math.floor(f));
  const u = f - i;
  out.x = PX[i] + (PX[i + 1] - PX[i]) * u;
  out.y = PY[i] + (PY[i + 1] - PY[i]) * u;
  out.z = PZ[i] + (PZ[i + 1] - PZ[i]) * u;
  const a = PYAW[i];
  let d = PYAW[i + 1] - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  out.yaw = a + d * u;
  return out;
}

/** The nearest point of the way to (x, z): its position along it (m) and how far off (m). */
export function nearestOnPath(x: number, z: number, out: { s: number; d: number }): { s: number; d: number } {
  let best = Infinity;
  let bi = 0;
  for (let i = 0; i < N; i += 4) {
    const d = (PX[i] - x) ** 2 + (PZ[i] - z) ** 2;
    if (d < best) {
      best = d;
      bi = i;
    }
  }
  for (let i = bi - 4; i <= bi + 4; i++) {
    const k = (i + N) % N;
    const d = (PX[k] - x) ** 2 + (PZ[k] - z) ** 2;
    if (d < best) {
      best = d;
      bi = k;
    }
  }
  out.s = (bi / N) * LENGTH;
  out.d = Math.sqrt(best);
  return out;
}

/** Along the way from `a` forward to `b` (m, 0‥LENGTH). */
export const ahead = (a: number, b: number): number => wrapS(b - a);

/** A sticky-rice ball (bay ben) as thrown and as it lies where it fell (m across). */
export const BALL_SIZE = 0.075;

/** Where the front step's middle is along the way (m): the way starts there. */
export const STEP_S = 0;

/**
 * Spots round the pagoda (world m): where the elder who hands out what is
 * carried round stands, beside the way in at the top of the naga stair
 * (between two front seima, clear of the way), turned to who comes up; and
 * the offering trays either side of the hall's door (Visak Bochea's
 * candles and lotus), the kneeling place before the eastern one.
 */
export const PAGODA_SPOTS = {
  giver: { x: X - 4.95, y: TY, z: 93.05, yaw: 1.62 },
  /** Low trays on the porch either side of the door (their middles; the floor 10). */
  trays: [
    { x: X - 2.15, z: 97.75 },
    { x: X + 2.15, z: 97.75 },
  ],
  /** Kneeling before the eastern tray, facing the hall's Buddha through the door. */
  kneel: { x: X + 2.15, y: PAGODA.floor, z: 96.55, fx: X + 0.9, fz: 110.9 },
  /** Up the front step from the way to the porch (the step's middle, then the porch floor). */
  stepIn: { x: X + 1.2, z: 95.4 },
  /** The middle of the hall (the chant inside), the floor + 2 m. */
  hall: { x: X, y: PAGODA.floor + 2, z: 104.5 },
} as const;

/**
 * The line of people round the hall now: written by the festival part every
 * frame while one of the pagoda's festivals is on (else `kind` null), read
 * by the roaming add-ons (roam/_procession.ts) and their sound; the
 * add-ons write `joinAt` / `joinedAt` / `leftAt` / `giveAt`.
 */
export interface Procession {
  /** The festival whose line it is (null: none on, or the festival part is not built). */
  kind: Extract<Festival, 'pchumben' | 'visak'> | null;
  /** The line is walking now (Pchum Ben before dawn, Visak Bochea at night; or the explorer is in it). */
  running: boolean;
  /** Every walker is on the way (not coming up or going down the stair): he may join. */
  full: boolean;
  /** The festival's clock (s) of this state. */
  t: number;
  /** Where place 0 is along the way now (m). */
  head: number;
  /** Walkers in the line (places 0‥walkers−1), the first `lead` the monks (none to join ahead of them). */
  walkers: number;
  lead: number;
  /** The place the explorer took (−1: he is not in the line); when he joined and when he left (festival clock, s). */
  joinAt: number;
  joinedAt: number;
  leftAt: number;
  /** The walker nearest him when he joined hands it over (the elder by the stair when −2): until this festival time. */
  giver: number;
  giveUntil: number;
  /** The monks at the line's head (Visak Bochea), or the hall (Pchum Ben): the chant comes from here; null: no chant now. */
  chant: { x: number; y: number; z: number } | null;
  /** 0 day … 1 night (the festival part's `MapFrame.night`). */
  night: number;
}

export const PROCESSION: Procession = {
  kind: null,
  running: false,
  full: false,
  t: 0,
  head: 0,
  walkers: SLOTS - 1,
  lead: 0,
  joinAt: -1,
  joinedAt: -1e9,
  leftAt: -1e9,
  giver: -1,
  giveUntil: -1e9,
  chant: null,
  night: 0,
};

/** URL `festline=1|0` (checks): the line walks (or not) whatever the time of day; else null. */
export const LINE_HELD: boolean | null = (() => {
  if (typeof location === 'undefined') return null;
  const v = new URLSearchParams(location.search).get('festline');
  return v === '1' ? true : v === '0' ? false : null;
})();

/** How long the line takes to make room for him, or to close up after him (s). */
export const MAKE_ROOM = 1.8;

/** How far (0‥1, eased) the line has made room for him now (1: room made; back to 0 after he left). */
export function roomMade(p: Procession, t: number): number {
  const k = p.joinAt >= 0 ? (t - p.joinedAt) / MAKE_ROOM : 1 - (t - p.leftAt) / MAKE_ROOM;
  const u = k < 0 ? 0 : k > 1 ? 1 : k;
  return u * u * (3 - 2 * u);
}

/** Where walker `i` is along the way now (m): its place, those from where he joined one further back. */
export function walkerS(p: Procession, i: number, t: number, joinedSlot: number): number {
  const back = joinedSlot >= 0 && i >= joinedSlot ? roomMade(p, t) : 0;
  return wrapS(p.head - (i + back) * GAP);
}

/** The place's position along the way for place `k` now (m). */
export const slotS = (p: Procession, k: number): number => wrapS(p.head - k * GAP);
