import { Matrix4, Quaternion, Vector3 } from 'three';
import { newShareState, sharePose } from '../../character/share';
import { WALK_SPEED } from '../../world/scale';
import { SFX } from '../audio/addonSfx';
import '../audio/_cart';
import '../audio/_haul';
import { CART_AT, CART_HOME, CART_LIMIT, CART_LOAD, cartHome, saveCartAt } from '../build/haul';
import { BAG, MATERIALS, MATERIAL_IDS, STORE, materialsText, type MaterialId, type Materials } from '../build/materials';
import { CH } from '../fauna/_kit';
import { HOME, HOME_AT } from '../hamlet/_homePlan';
import { pad } from '../pad/pad';
import { OX_NOSE, oxGait, oxHz, oxPoint, type OxPose } from '../people/_oxRide';
import { PEOPLE_SCALE } from '../people/_personModel';
import { GATE_DOWN, REACH, WHEEL_R } from '../people/_sceneCart';
import { progress } from '../progress';
import type { MapFrame } from '../types';
import { lang, num, t, type WordKey } from '../ui/lang';
import { ADDONS, registerAddon, touchJump, type AddonEnv, type AddonHold, type AddonKey } from './_addons';
import { CAP, HOLD, HaulView, OX_BACK, OX_SIDE } from './_haulModel';
import { angleDiff } from './followCam';
import type { RoamCtx } from './types';
import { PACE as WALK_PACE, stepSound } from './walker';

/**
 * **His ox cart** (រទេះគោ: add-on `haul`, ticket AWP-14; the guide:
 * docs/map-work/addons.md "His ox cart"): it hauls what he gathers past his
 * carry limit. The family's cart and its pair of white oxen stand by his house
 * (build/haul.ts `CART_HOME`); once the house is his (`HOME.owned`) they are his
 * to use. Not the village's cart he rides (roam/_cartRide.ts): that one goes
 * round its loop by the great lake, far from his house, and stays a ride.
 *
 * - **Leading it** (ដឹករទេះគោ): before the oxen, E "Lead the ox cart": he takes
 *   the right ox's nose rope and walks on at the oxen's pace (`OX_PACE`: no
 *   running while he leads); the oxen and the cart follow the way he walked, a
 *   few steps behind him (`GAP`). It goes only where a cart can (`passable`:
 *   land, no step it cannot roll up, no deep water, nothing standing or built
 *   across its width, room overhead); where it cannot, it stops, and once he is
 *   a rope's length from the oxen (`ROPE_MAX`) he lets go ("The oxen can't take
 *   the cart that way"). E (the prompt over him says so), another mode, back to
 *   the map, or anything else taking him (gathering, a ride…) lets go too: the
 *   cart waits where it stands, its place saved (build/haul.ts `CART_AT`).
 * - **Loading** (at its tail, his bag not empty): E "Load the cart (18/60)" —
 *   he lifts the pieces in one by one, logs first, then bamboo, thatch, clay
 *   (as a farmer packs: the heavy and long below), all of his bag that fits in
 *   one press; the stick held away stops him (what is in stays in). The cart
 *   holds `CART_LIMIT` (60) in weight: build/haul.ts says why.
 * - **Unloading at home** (the cart within `HOME_NEAR` of his house): E "Unload
 *   at home (18/60)" — he lifts the pieces off, the top first, and puts them down
 *   in his home store (`STORE`): the build card uses them. Away from home a
 *   loaded cart says "Lead it home to unload".
 * - **The load shows on the cart** (_haulModel.ts): logs, bamboo poles, bundles
 *   of palm thatch, baskets of clay, each as he loads it.
 *
 * Sounds: each piece laid in or put down (audio/_haul.ts), the wheels rolling
 * and a hub's knock as he leads it (the ride's, audio/_cart.ts), the oxen's
 * bells and the axle's creak (the people's, through the map's calls).
 *
 * URL (shots and the dev server only, `env.shot || import.meta.env.DEV`: on the
 * live site a link never fills or moves his cart): `cartload=<material>:<n>,…`
 * (what is on it; `0` empty) · `cartat=<x>,<z>,<yaw°>` (where it stands: the
 * ground under its axle, its heading) · `cartlead=1` (he leads it: it stands
 * behind him, the way he faces at `at=`, `yaw=`) · `cartwork=load|unload[:<u>]`
 * (him at its tail, loading or unloading, held `u` (0‥1) into a piece: the
 * picture of a check; `u` 0.5 by default). `report()` gives them back.
 * `window.__haul` (shots, the dev server): `state()`, `passable(x, z, yaw°)`.
 * Console lines `[haul] …`.
 */

// ── Tuning ─────────────────────────────────────────────────────────────────

/** The cart is drawn at the people's scale (its space is true size). */
const K = PEOPLE_SCALE;
/** From the axle to the yoke on the map (m). */
const REACH_M = REACH * K;
/** The oxen's walk while he leads them, and his (m/s); the most they go catching up with him. */
const OX_PACE = 2.0;
const CATCH = 2.7;
/** How quickly they get going and stop (m/s²). */
const ACCEL = 1.4;
const DECEL = 3.0;
/** His feet to the yoke along the way while he leads (m): the oxen's heads a long step behind him. */
const GAP = 2.7;
/** His hand farther than this from the ox's nose (m): he lets go. */
const ROPE_MAX = 6.5;
/** The way is kept as points this far apart (m). */
const STEP = 0.5;
/** Across the way, where the cart needs room (m from its middle: the wheels' hubs and the oxen side by side). */
const ACROSS = [-1.15, -0.6, 0, 0.6, 1.15];
/**
 * The land may rise or fall this much from one point of the way to the next (m), or across it: one of its steps. The
 * map's land is built of 2 m blocks, its slopes are steps of them; the walker hops one, a ridden cow climbs one
 * (_cowRide.ts `UP`), the village's cart rolls over them on its smoothed trail: so does this one (`landAt`, `wayY`).
 */
const RISE = 2.2;
/** Its roll at most (rad): with one wheel up a step beside it, it leans a little, no more. */
const ROLL_MAX = 0.12;
/** What stands more than this over the land is in the way (m: a step, a wall, a trunk, a stair, a jar). */
const BUILT_UP = 0.35;
/** Water deeper than this: no (m). */
const WET = 0.25;
/** Room it needs overhead (m: the load and the oxen's horns). */
const HIGH = 3.4;
/** Where he stands to load (cart space, true m: behind the tail), and how near it (m). */
const TAIL = -1.95;
const TAIL_REACH = 1.5;
/** Where he stands to take the rope (m before the yoke), and how near it. */
const HEAD_AHEAD = 2.5;
const HEAD_REACH = 1.8;
/** His feet this near the cart's ground (m: a land step either way): he is by it, not on a ledge over it. */
const LEVEL = 2.4;
/** The cart this near his house's middle (m): he can unload it at home. */
const HOME_NEAR = 14;
/** Farther than this from the camera it is not drawn (m: as the village's cart). */
const HIDE = 420;
/** Seconds a piece takes to lift in or out. */
const PIECE = 0.8;
/** While he leads, its place is kept this often (s). */
const SAVE_EVERY = 4;
/** The stick held away this long (s) stops the work. */
const PUSH = 0.15;
/** The cart and the oxen as boxes he keeps out of on foot (m: along from the axle / the yoke, half across). */
const CART_BOX = { back: -1.75, front: 2.7, half: 1.25 };
const OXEN_BOX = { back: -2.45, front: 1.45, half: 1.05 };
/** His body's radius on foot (m). */
const BODY_R = 0.42;
/**
 * While he leads, the camera looks down at least this much (rad): the oxen and the cart are right behind him, so from
 * behind him it looks over them (from lower down it would be in them).
 */
const LEAD_PITCH = 0.5;
/** …and it is out at least this far (m): him, the oxen and the cart in one view. (Not swung to one side: W walks the way the camera looks.) */
const LEAD_DIST = 9.5;
/** The camera at the work: round to his right, tilt, distance (m), eased over `for` s. */
const FRAME = { side: 0.75, pitch: 0.38, distance: 7.5, rate: 2.2, for: 1.6 };
/** Loading packs these first; unloading takes the top first. */
const LOAD_ORDER: readonly MaterialId[] = ['log', 'bamboo', 'thatch', 'clay'];
const UNLOAD_ORDER: readonly MaterialId[] = ['clay', 'thatch', 'bamboo', 'log'];
/** The most of one material his home store keeps (build/materials.ts). */
const STORE_MOST = 999;

// ── State ──────────────────────────────────────────────────────────────────

let env: AddonEnv | null = null;
let view: HaulView | null = null;
/** Drawn now (near the camera), and something moved or changed since it was last written. */
let shown = false;
let dirty = true;
let loadVer = -1;
/** Where it is (map, m): the axle's middle on the ground, the yoke; the cart's and the oxen's headings, its pitch and roll; the wheels' turn. */
const P = { ax: 0, ay: 0, az: 0, yx: 0, yy: 0, yz: 0, oy: 0, yaw: 0, oxYaw: 0, pitch: 0, roll: 0, wheel: 0 };
/** The tailboard: 0 up ‥ 1 let down (for the work). */
let gate = 0;

/** He leads it: the way (points every `STEP` m and how far along each is), the yoke's place on it, its speed. */
let leading = false;
const way = { x: [] as number[], y: [] as number[], z: [] as number[], s: [] as number[] };
let yokeS = 0;
let speed = 0;
/** The way could not go on (a place the cart cannot go). */
let blocked = false;
let saveWait = 0;
/** The camera's lowest tilt before he took the rope (put back when he lets go), and the one set while he leads. */
let pitchBefore: number | null = null;
let pitchLead = 0;
let creakAt = 0;
let bellAt = 0;
let knockRolled = 0;
/** The rolling sound is on (set to 0 once when it stops: the ride sets it too). */
let rolling = false;

/** Loading or unloading. */
interface Work {
  readonly kind: 'load' | 'unload';
  phase: 'step' | 'turn' | 'work' | 'done';
  /** Seconds in this phase. */
  t: number;
  /** How far through the piece under way (0‥1; −1 none), which material, moved over yet. */
  u: number;
  piece: MaterialId | null;
  done: boolean;
  /** Pieces moved this time. */
  readonly moved: Materials;
  /** Held still (a check's picture). */
  readonly frozen: boolean;
  push: number;
  /** Where he stands (map). */
  readonly stand: Vector3;
}
let W: Work | null = null;
const pose = newShareState();
const posture = () => sharePose(pose);
/** The camera before the work and how long it has been framed. */
let framed = 0;
let touchOn = false;

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _h = new Vector3();
const _n = new Vector3();
const _m1 = new Matrix4();
const _m2 = new Matrix4();
const _q1 = new Quaternion();
const _q2 = new Quaternion();
const _s1 = new Vector3();
const _s2 = new Vector3();
const _ox: OxPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: K, gait: 0, rest: 0, head: 0, turn: 0, phase: 0 };

const damp = (rate: number, dt: number) => (dt > 0 ? 1 - Math.exp(-rate * dt) : 1);
const smooth = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};
const weightOf = (ms: Materials): number => MATERIAL_IDS.reduce((w, m) => w + (ms[m] ?? 0) * MATERIALS[m].weight, 0);

// ── Words (made once a language and value) ────────────────────────────────

let wordsLang = '';
const said = new Map<string, string>();
function words(key: string, make: () => string): string {
  if (lang() !== wordsLang) {
    wordsLang = lang();
    said.clear();
  }
  let s = said.get(key);
  if (s === undefined) {
    if (said.size > 200) said.clear();
    s = make();
    said.set(key, s);
  }
  return s;
}
const counted = (key: WordKey, keyed: boolean) => {
  const n = CART_LOAD.load();
  return words(`${key}|${n}`, () => `${keyed ? 'E  ' : ''}${t(key, { n: num(n), max: num(CART_LIMIT) })}`);
};

// ── The way it goes (while he leads) ───────────────────────────────────────

function wayClear(): void {
  way.x.length = way.y.length = way.z.length = way.s.length = 0;
}

function wayPush(x: number, y: number, z: number): void {
  const n = way.s.length;
  way.s.push(n ? way.s[n - 1] + Math.hypot(x - way.x[n - 1], z - way.z[n - 1]) : 0);
  way.x.push(x);
  way.y.push(y);
  way.z.push(z);
}

const wayEnd = (): number => (way.s.length ? way.s[way.s.length - 1] : 0);

/** The way at `s` (m along it, held to its ends), into `out`. */
function wayAt(s: number, out: Vector3): Vector3 {
  const n = way.s.length;
  if (!n) return out.set(P.yx, P.yy, P.yz);
  if (s <= way.s[0]) return out.set(way.x[0], way.y[0], way.z[0]);
  if (s >= way.s[n - 1]) return out.set(way.x[n - 1], way.y[n - 1], way.z[n - 1]);
  let i = n - 2;
  while (i > 0 && way.s[i] > s) i--;
  const k = (s - way.s[i]) / Math.max(1e-6, way.s[i + 1] - way.s[i]);
  return out.set(way.x[i] + (way.x[i + 1] - way.x[i]) * k, way.y[i] + (way.y[i + 1] - way.y[i]) * k, way.z[i] + (way.z[i + 1] - way.z[i]) * k);
}

/** The way's points from before `s` forgotten (the cart has gone past them). */
function wayTrim(s: number): void {
  let k = 0;
  while (k < way.s.length - 2 && way.s[k + 1] < s) k++;
  if (!k) return;
  way.x.splice(0, k);
  way.y.splice(0, k);
  way.z.splice(0, k);
  way.s.splice(0, k);
}

/**
 * Can the cart stand at (x, z), going (dx, dz) (a unit), from ground `prevY`? The land under it there (m), or NaN:
 * off the roaming area, a step it cannot roll (`RISE`), or across its width (`ACROSS`) something standing or built,
 * water, a roof too low, the land too uneven.
 */
function passable(ctx: Pick<RoamCtx, 'world'>, x: number, z: number, dx: number, dz: number, prevY: number): number {
  const w = ctx.world;
  const f = w.field;
  const h = f.heightAt(x, z);
  if (!Number.isFinite(h) || Math.abs(h - prevY) > RISE) return Number.NaN;
  for (const off of ACROSS) {
    const px = x + dz * off;
    const pz = z - dx * off;
    if (!w.inBounds(px, pz)) return Number.NaN;
    const hl = f.heightAt(px, pz);
    if (!Number.isFinite(hl) || Math.abs(hl - h) > RISE) return Number.NaN;
    if (w.groundAt(px, pz) - hl > BUILT_UP) return Number.NaN;
    const water = w.waterAt(px, pz);
    if (water !== null && water - hl > WET) return Number.NaN;
    if (w.ceilingAt && w.ceilingAt(px, pz, hl + 0.2) < hl + HIGH) return Number.NaN;
  }
  return h;
}

/** The way goes on toward his feet, a point every `STEP` m, as far as the cart can go. */
function wayOn(ctx: RoamCtx): void {
  const p = ctx.body.pos;
  let n = way.s.length - 1;
  if (n < 0) return;
  let guard = 0;
  for (;;) {
    const lx = way.x[n];
    const lz = way.z[n];
    const dx = p.x - lx;
    const dz = p.z - lz;
    const d = Math.hypot(dx, dz);
    if (d < STEP || guard++ > 40) return;
    const ux = dx / d;
    const uz = dz / d;
    const x = lx + ux * STEP;
    const z = lz + uz * STEP;
    const h = passable(ctx, x, z, ux, uz, way.y[n]);
    if (Number.isNaN(h)) {
      blocked = true;
      return;
    }
    blocked = false;
    wayPush(x, h, z);
    n++;
  }
}

// ── Where it is ────────────────────────────────────────────────────────────

/** The land under (x, z), smoothed over a metre round it: the wheels roll over a land step as up a short ramp. */
function landAt(ctx: Pick<RoamCtx, 'world'>, x: number, z: number): number {
  const f = ctx.world.field;
  return (2 * f.heightAt(x, z) + f.heightAt(x + 1, z) + f.heightAt(x - 1, z) + f.heightAt(x, z + 1) + f.heightAt(x, z - 1)) / 6;
}

/** The way's land at `s`, smoothed along it over ±1.5 m (as the village cart's loop is). */
function wayY(s: number): number {
  let sum = 0;
  for (let k = -3; k <= 3; k++) sum += wayAt(s + k * 0.5, _t).y;
  return sum / 7;
}
const _t = new Vector3();

/** Its roll (+ its left side up, held to `ROLL_MAX`) and pitch (front down) on the land under its wheels and the yoke. */
function tilt(ctx: Pick<RoamCtx, 'world'>): void {
  const lx = Math.cos(P.yaw) * 0.74 * K;
  const lz = -Math.sin(P.yaw) * 0.74 * K;
  const d = landAt(ctx, P.ax + lx, P.az + lz) - landAt(ctx, P.ax - lx, P.az - lz);
  P.roll = Number.isFinite(d) ? Math.max(-ROLL_MAX, Math.min(ROLL_MAX, Math.atan2(d, 2 * 0.74 * K) * 0.8)) : 0;
  P.pitch = Math.atan2(P.ay - P.yy, REACH_M) * 0.8;
}

/** Stand it at `CART_AT` (not led): the yoke straight ahead of the axle, the oxen the same way. */
function placeAt(ctx: Pick<RoamCtx, 'world'>): void {
  P.ax = CART_AT.x;
  P.az = CART_AT.z;
  P.yaw = CART_AT.yaw;
  P.oxYaw = CART_AT.yaw;
  P.ay = landAt(ctx, P.ax, P.az);
  P.yx = P.ax + Math.sin(P.yaw) * REACH_M;
  P.yz = P.az + Math.cos(P.yaw) * REACH_M;
  P.yy = landAt(ctx, P.yx, P.yz);
  P.oy = landAt(ctx, P.yx - Math.sin(P.yaw) * OX_BACK * K, P.yz - Math.cos(P.yaw) * OX_BACK * K);
  tilt(ctx);
  dirty = true;
}

/** Place it on the way (he leads it): the yoke at `yokeS`, the axle a pole's reach back along it (a chord), the oxen along the way. */
function placeOnWay(ctx: RoamCtx): void {
  wayAt(yokeS, _a);
  wayAt(yokeS - REACH_M, _b);
  P.yaw = Math.atan2(_a.x - _b.x, _a.z - _b.z);
  P.yx = _a.x;
  P.yz = _a.z;
  P.yy = wayY(yokeS);
  // (the pole's end rides at the yoke: the axle comes forward on a tight turn)
  P.ax = _a.x - Math.sin(P.yaw) * REACH_M;
  P.az = _a.z - Math.cos(P.yaw) * REACH_M;
  P.ay = wayY(yokeS - REACH_M);
  P.oy = wayY(yokeS - OX_BACK * K);
  wayAt(Math.min(wayEnd(), yokeS + 0.8), _b);
  wayAt(yokeS - 0.8, _c);
  P.oxYaw = Math.hypot(_b.x - _c.x, _b.z - _c.z) > 0.2 ? Math.atan2(_b.x - _c.x, _b.z - _c.z) : P.yaw;
  tilt(ctx);
  CART_AT.x = P.ax;
  CART_AT.z = P.az;
  CART_AT.yaw = P.yaw;
  dirty = true;
}

/** A point of the cart (its space, true m) on the map as placed now, into `out` (flat: its pitch and roll left out). */
function cartPoint(x: number, z: number, out: Vector3): Vector3 {
  const s = Math.sin(P.yaw);
  const c = Math.cos(P.yaw);
  return out.set(P.ax + (x * c + z * s) * K, P.ay, P.az + (-x * s + z * c) * K);
}

/** Where he stands to load (behind the tail), and to take the rope (before the oxen). */
const tailSpot = (out: Vector3) => cartPoint(0, TAIL, out);
function headSpot(out: Vector3): Vector3 {
  return out.set(P.yx + Math.sin(P.oxYaw) * HEAD_AHEAD, P.yy, P.yz + Math.cos(P.oxYaw) * HEAD_AHEAD);
}

/** By its tail, on foot. */
function nearTail(ctx: RoamCtx): boolean {
  const p = ctx.body.pos;
  tailSpot(_c);
  return Math.hypot(p.x - _c.x, p.z - _c.z) < TAIL_REACH && Math.abs(p.y - P.ay) < LEVEL;
}

/** Before the oxen, on foot. */
function nearHead(ctx: RoamCtx): boolean {
  const p = ctx.body.pos;
  headSpot(_c);
  return Math.hypot(p.x - _c.x, p.z - _c.z) < HEAD_REACH && Math.abs(p.y - P.yy) < LEVEL;
}

/** The cart by his house: he can unload it into his store. */
const atHome = (): boolean => Math.hypot(P.ax - HOME_AT.x, P.az - HOME_AT.z) < HOME_NEAR;

/**
 * How far (m) (x, z) is outside the cart's box and the oxen's, grown by `grow` (≤ 0: inside one; `push` is then the
 * nearest way out: a unit x, z and how far). As the ride's (roam/_cartRide.ts).
 */
const push = { x: 0, z: 0, d: 0 };
function outside(x: number, z: number, grow: number): number {
  let best = Infinity;
  for (let k = 0; k < 2; k++) {
    const ox = k === 0 ? P.ax : P.yx;
    const oz = k === 0 ? P.az : P.yz;
    const yaw = k === 0 ? P.yaw : P.oxYaw;
    const b = k === 0 ? CART_BOX : OXEN_BOX;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const dx = x - ox;
    const dz = z - oz;
    const a = dx * fx + dz * fz;
    const c = dx * fz - dz * fx;
    const back = b.back - grow;
    const front = b.front + grow;
    const half = b.half + grow;
    const oa = Math.max(back - a, a - front, 0);
    const oc = Math.max(Math.abs(c) - half, 0);
    const out = Math.sqrt(oa * oa + oc * oc);
    if (out > 0) {
      best = Math.min(best, out);
      continue;
    }
    let d = a - back;
    let sa = -1;
    let sc = 0;
    if (front - a < d) {
      d = front - a;
      sa = 1;
    }
    if (half - c < d) {
      d = half - c;
      sa = 0;
      sc = 1;
    }
    if (c + half < d) {
      d = c + half;
      sa = 0;
      sc = -1;
    }
    if (-d < best) {
      best = -d;
      push.x = fx * sa + fz * sc;
      push.z = fz * sa - fx * sc;
      push.d = d;
    }
  }
  return best;
}

/** The right ox's nose (map, m) as drawn now, into `out` (the rope's end). */
function nose(out: Vector3): Vector3 {
  const s = -OX_SIDE;
  _ox.x = P.yx + Math.cos(P.oxYaw) * s * K - Math.sin(P.oxYaw) * OX_BACK * K;
  _ox.z = P.yz - Math.sin(P.oxYaw) * s * K - Math.cos(P.oxYaw) * OX_BACK * K;
  _ox.y = P.oy;
  _ox.yaw = P.oxYaw;
  _ox.gait = speed > 0.05 ? 1 : 0;
  _ox.head = speed > 0.05 ? 0.35 : 0;
  return oxPoint(_ox, 'head', OX_NOSE, out);
}

/** His right hand (map, m: a little under the wrist), into `out`. */
function hand(out: Vector3, side: 'L' | 'R' = 'R'): Vector3 {
  // (getWorldPosition brings the wrist's chain of parents up to date: as the explorer was last posed)
  return env!.explorer.rig.joints[side === 'R' ? 'wristR' : 'wristL'].getWorldPosition(out);
}

// ── Leading ────────────────────────────────────────────────────────────────

/** He takes the rope: the way starts behind the cart, through it, to his feet. */
function takeRope(ctx: RoamCtx, quiet = false): void {
  wayClear();
  const f = ctx.world.field;
  const bx = -Math.sin(P.yaw);
  const bz = -Math.cos(P.yaw);
  // (from 2 m behind the axle up to the yoke, every STEP m)
  for (let d = REACH_M + 2; d >= -0.001; d -= STEP) {
    const x = P.yx + bx * d;
    const z = P.yz + bz * d;
    wayPush(x, f.heightAt(x, z), z);
  }
  yokeS = wayEnd();
  speed = 0;
  blocked = false;
  leading = true;
  saveWait = SAVE_EVERY;
  wayOn(ctx);
  // (the camera over the oxen behind him)
  pitchBefore ??= ctx.cam.pitchMin;
  pitchLead = Math.max(pitchBefore, LEAD_PITCH);
  ctx.cam.pitchMin = pitchLead;
  if (!quiet) {
    SFX.play('haulRope', 0.9);
    pad.rumble('tick', 0.35);
    ctx.hud.toast(t('haulLeadHint'));
  }
  console.info(`[haul] he leads the cart from (${P.ax.toFixed(1)}, ${P.az.toFixed(1)}), load ${JSON.stringify(CART_LOAD.all())}`);
}

/** He lets go: the cart stands where it is (kept). `why`: the toast's words (null: none). */
function letGo(why: WordKey | null): void {
  if (!leading) return;
  leading = false;
  speed = 0;
  wayClear();
  if (rolling) {
    SFX.level('cartRoll', 0);
    rolling = false;
  }
  saveCartAt();
  view?.rope(null);
  // (the camera's floor as it was, unless something else has set its own meanwhile)
  if (env && pitchBefore !== null && env.cam.pitchMin === pitchLead) env.cam.pitchMin = pitchBefore;
  pitchBefore = null;
  if (why) {
    env?.hud.toast(t(why));
    SFX.play('haulRope', 0.6);
  }
  dirty = true;
  console.info(`[haul] he lets go (${why ?? 'quietly'}): the cart stands at (${CART_AT.x.toFixed(1)}, ${CART_AT.z.toFixed(1)}) facing ${((CART_AT.yaw * 180) / Math.PI).toFixed(0)}°`);
}

/** Someone else has him now (a ride, the gathering, praying…): not the cart's own work. */
const othersHave = (): boolean => ADDONS.some((a) => a.id !== 'haul' && a.holding);

/** One step of leading: the way on to his feet, the cart along it, the rope's length. */
function lead(ctx: RoamCtx, dt: number): void {
  if (othersHave() || ctx.body.explorer.animator.posture || ctx.body.explorer.currentAction === 'pray') {
    letGo('haulLetGoToast');
    return;
  }
  wayOn(ctx);
  const want = wayEnd() - GAP;
  const ahead = want - yokeS;
  const target = ahead > 0.02 ? Math.min(CATCH, OX_PACE * Math.min(1.35, 0.5 + ahead * 1.2)) : 0;
  speed += Math.max(-DECEL * dt, Math.min(ACCEL * dt, target - speed));
  if (speed < 0) speed = 0;
  const ds = Math.min(speed * dt, Math.max(0, ahead));
  if (ahead <= 0) speed = Math.max(0, speed - DECEL * dt);
  yokeS += ds;
  P.wheel += ds / (WHEEL_R * K);
  if (ds > 0 || dirty) placeOnWay(ctx);
  wayTrim(yokeS - REACH_M - 2);
  // Sounds: the wheels and a hub's knock (his), the bells and the creak go with the map's calls (`frame`).
  const go = Math.min(1, speed / OX_PACE);
  if (go > 0.02 || rolling) {
    SFX.level('cartRoll', go * 0.8);
    rolling = go > 0.02;
  }
  if ((knockRolled += ds) >= 1.6) {
    knockRolled -= 1.6;
    SFX.play('cartKnock', 0.3 + 0.5 * go);
  }
  // Too far from the oxen: the rope slips from his hand.
  hand(_h);
  nose(_n);
  if (_h.distanceTo(_n) > ROPE_MAX) {
    letGo(blocked ? 'haulStuck' : 'haulLetGoToast');
    return;
  }
  if ((saveWait -= dt) <= 0) {
    saveWait = SAVE_EVERY;
    saveCartAt();
  }
}

// ── Loading and unloading ──────────────────────────────────────────────────

/** The next piece to move (null: none: his bag is empty or nothing more fits; the cart is empty). */
function nextPiece(kind: 'load' | 'unload'): MaterialId | null {
  if (kind === 'load') {
    for (const m of LOAD_ORDER) if (BAG.count(m) > 0 && CART_LOAD.room(m) >= 1) return m;
    return null;
  }
  for (const m of UNLOAD_ORDER) if (CART_LOAD.count(m) > 0 && STORE.count(m) < STORE_MOST) return m;
  return null;
}

/** Something of his bag fits in the cart. */
const canLoad = (): boolean => nextPiece('load') !== null;

function setPose(on: boolean): void {
  const ex = env?.explorer;
  if (!ex) return;
  if (on) {
    ex.animator.posture = posture;
    ex.animator.postureFeet = true;
  } else if (ex.animator.posture === posture) {
    ex.animator.posture = null;
    ex.animator.postureFeet = true;
  }
}

function startWork(ctx: RoamCtx, kind: 'load' | 'unload', frozen = false, u = 0.5): Work {
  tailSpot(_a);
  const w: Work = { kind, phase: 'step', t: 0, u: -1, piece: null, done: false, moved: {}, frozen, push: 0, stand: new Vector3(_a.x, ctx.world.field.heightAt(_a.x, _a.z), _a.z) };
  W = w;
  framed = 0;
  pose.reach = 0;
  pose.bow = 0;
  pose.crouch = 0;
  pose.gap = 1.7;
  pose.low = 0;
  pose.lookDown = 0.3;
  pose.lookYaw = 0;
  ctx.body.vel.set(0, 0, 0);
  if (!touchOn) {
    touchJump('hide');
    touchOn = true;
  }
  if (frozen) {
    const b = ctx.body;
    b.pos.copy(w.stand);
    b.yaw = P.yaw;
    w.phase = 'work';
    w.piece = nextPiece(kind);
    w.u = w.piece ? Math.max(0, Math.min(0.99, u)) : -1;
    gate = 1;
    dirty = true;
    shapeWork(w);
    setPose(true);
    const ex = b.explorer;
    ex.object.position.copy(b.pos);
    ex.object.rotation.set(0, b.yaw, 0);
    for (let i = 0; i < 40; i++) ex.update(1 / 30);
  }
  console.info(`[haul] ${kind} at the tail: bag ${JSON.stringify(BAG.all())}, cart ${JSON.stringify(CART_LOAD.all())} (${CART_LOAD.load()}/${CART_LIMIT})${frozen ? ` (held at ${u})` : ''}`);
  return w;
}

/** The body's shape for the piece under way (`w.u`). */
function shapeWork(w: Work): void {
  const u = w.u;
  if (u < 0) {
    pose.reach = 0.35;
    pose.crouch = 0;
    pose.bow = 0.1;
    return;
  }
  if (w.kind === 'load') {
    // (up from beside him, held out, pushed in over the tail, the arms back)
    pose.crouch = 0.45 * (1 - smooth(u / 0.35));
    pose.reach = u < 0.62 ? 0.35 + 0.65 * smooth(u / 0.62) : 1 - 0.55 * smooth((u - 0.62) / 0.38);
    pose.bow = 0.15 + 0.25 * smooth((u - 0.3) / 0.4) * (1 - smooth((u - 0.8) / 0.2));
    pose.low = 1.6 * (1 - smooth(u / 0.35)) - 0.4 * smooth((u - 0.35) / 0.3);
  } else {
    // (reached in over the tail, taken, lowered beside him and put down)
    pose.reach = u < 0.45 ? 0.4 + 0.6 * smooth(u / 0.25) : 1 - 0.4 * smooth((u - 0.45) / 0.35);
    pose.crouch = 0.6 * smooth((u - 0.45) / 0.3) * (1 - smooth((u - 0.85) / 0.15));
    pose.bow = 0.2 + 0.2 * smooth((u - 0.1) / 0.3);
    pose.low = -0.4 * (1 - smooth((u - 0.45) / 0.15)) + 2.2 * smooth((u - 0.45) / 0.3);
  }
}

/** The piece of `m` in his hands (map): long ones by their near end, pushed ahead of him; the others across his chest, between his fists. */
function handFrame(m: MaterialId, out: Matrix4): Matrix4 {
  hand(_a, 'L');
  hand(_b, 'R');
  const b = env!.body;
  const h = HOLD[m];
  const ahead = 0.12 * b.scale + h.reach * K;
  _c.addVectors(_a, _b).multiplyScalar(0.5);
  _c.x += Math.sin(b.yaw) * ahead;
  _c.z += Math.cos(b.yaw) * ahead;
  _c.y -= 0.12 * b.scale;
  return out.compose(_c, _q1.setFromAxisAngle(_s1.set(0, 1, 0), b.yaw + (h.along ? 0 : Math.PI / 2)), _s2.set(K, K, K));
}

/** Between two frames (`k` 0 → `a`, 1 → `b`), into `out`. */
function blend(a: Matrix4, b: Matrix4, k: number, out: Matrix4): Matrix4 {
  a.decompose(_a, _q1, _s1);
  b.decompose(_b, _q2, _s2);
  _a.lerp(_b, k);
  _q1.slerp(_q2, k);
  return out.compose(_a, _q1, _s1.lerp(_s2, k));
}

/** What is on the cart now (one object, made again only when the load changes: read every frame of the work). */
const counts: Record<MaterialId, number> = { log: 0, bamboo: 0, thatch: 0, clay: 0 };
let countsVer = -1;
function loadNow(): Materials {
  if (countsVer !== CART_LOAD.version) {
    countsVer = CART_LOAD.version;
    for (const m of MATERIAL_IDS) counts[m] = CART_LOAD.count(m);
  }
  return counts;
}

/** Counts with one more of `m` (where the piece being loaded will lie): one object, refilled. */
const plus: Record<MaterialId, number> = { log: 0, bamboo: 0, thatch: 0, clay: 0 };
function plusOne(m: MaterialId): Materials {
  Object.assign(plus, loadNow());
  plus[m]++;
  return plus;
}

/** The piece under way drawn where it is now (in his hands, on its way in or out), after the cart and his body. */
function drawPiece(w: Work | null): void {
  if (!view) return;
  if (!w || w.phase !== 'work' || w.u < 0 || !w.piece || w.done) {
    view.handItem(null, null);
    return;
  }
  const m = w.piece;
  const u = w.u;
  handFrame(m, _m1);
  if (w.kind === 'load') {
    if (u < 0.62) view.handItem(m, _m1);
    else {
      const next = plusOne(m);
      const i = Math.min(CAP[m], next[m]!) - 1;
      if (!view.spotOf(next, m, i, _m2)) _m2.copy(_m1);
      view.handItem(m, blend(_m1, _m2, smooth((u - 0.62) / 0.23), _m1));
    }
  } else {
    const now = loadNow();
    const i = Math.min(CAP[m], now[m] ?? 0) - 1;
    if (!view.spotOf(now, m, Math.max(0, i), _m2)) _m2.copy(_m1);
    view.handItem(m, u < 0.45 ? blend(_m2, _m1, smooth((u - 0.1) / 0.3), _m1) : _m1);
  }
}

/** The piece goes over (into the cart, or out into his store). */
function moveOver(w: Work): void {
  const m = w.piece!;
  w.done = true;
  if (w.kind === 'load') {
    if (CART_LOAD.room(m) < 1 || BAG.take(m, 1) < 1) return;
    CART_LOAD.add(m, 1);
  } else {
    if (CART_LOAD.take(m, 1) < 1) return;
    STORE.add(m, 1);
  }
  w.moved[m] = (w.moved[m] ?? 0) + 1;
  SFX.play(`haulPut:${m}`, 0.9);
  pad.rumble('tick', 0.4);
  dirty = true;
}

/** Stop the work: the posture off, the tailboard up, the toast of what was moved. */
function endWork(ctx: RoamCtx | null, say: boolean): void {
  const w = W;
  if (!w) return;
  W = null;
  setPose(false);
  view?.handItem(null, null);
  if (touchOn) {
    touchJump(null);
    touchOn = false;
  }
  if (ctx) ctx.body.explorer.setMotion(0, true, 0);
  dirty = true;
  if (!say || !ctx) return;
  const what = materialsText(w.moved);
  if (!what) return;
  if (w.kind === 'load') {
    ctx.hud.toast(t(!BAG.empty && !canLoad() ? 'haulLoadedFull' : 'haulLoaded', { what, n: num(CART_LOAD.load()), max: num(CART_LIMIT) }));
  } else ctx.hud.toast(t('haulUnloaded', { what }));
  console.info(`[haul] ${w.kind}ed ${JSON.stringify(w.moved)} (weight ${weightOf(w.moved)}); cart ${JSON.stringify(CART_LOAD.all())} ${CART_LOAD.load()}/${CART_LIMIT}, bag ${JSON.stringify(BAG.all())}, store ${JSON.stringify(STORE.all())}`);
}

/** A few steps to `goal` (m), turning to the way; footsteps. True once there. */
let lastStep = 0;
function walkTo(ctx: RoamCtx, goal: Vector3, dt: number): boolean {
  const b = ctx.body;
  const p = b.pos;
  const dx = goal.x - p.x;
  const dz = goal.z - p.z;
  const d = Math.hypot(dx, dz);
  const v = d > 0.04 ? Math.min(WALK_SPEED * b.scale * 0.9, 0.4 + d * 3) : 0;
  if (d > 0.04) {
    const k = Math.min(d, v * dt) / d;
    p.x += dx * k;
    p.z += dz * k;
    b.yaw += angleDiff(Math.atan2(dx, dz), b.yaw) * damp(10, dt);
  }
  p.y += (ctx.world.groundAt(p.x, p.z) - p.y) * damp(14, dt);
  b.explorer.setMotion(v / b.scale, true, 0);
  const phase = b.explorer.animator.phase;
  if (v > 0.25) {
    const crossed = (q: number) => (lastStep < q && phase >= q) || (phase < lastStep && (lastStep < q || phase >= q));
    if (crossed(0.25) || crossed(0.75)) ctx.sound(stepSound(ctx.world, p.x, p.y, p.z), 0.45 + v * 0.1);
  }
  lastStep = phase;
  return d <= 0.04;
}

/** The camera at the work: over his right shoulder, the tail and the load before him (eased a while; the player's after). */
function frameCam(ctx: RoamCtx, dt: number): void {
  const { cam, body: b, input } = ctx;
  if (input.lookYaw || input.lookPitch || input.zoom) framed = FRAME.for;
  const k = damp(5, dt);
  cam.focus.x += (b.pos.x + Math.sin(b.yaw) * 0.8 - cam.focus.x) * k;
  cam.focus.z += (b.pos.z + Math.cos(b.yaw) * 0.8 - cam.focus.z) * k;
  cam.focus.y += (b.pos.y + 1.7 * b.scale * 0.6 - cam.focus.y) * k;
  cam.behindYaw = b.yaw;
  cam.follow = 0;
  if (framed >= FRAME.for) return;
  framed += dt;
  const e = damp(FRAME.rate, dt);
  cam.yaw += angleDiff(b.yaw + FRAME.side, cam.yaw) * e;
  cam.pitch += (FRAME.pitch - cam.pitch) * e;
  cam.distance += (Math.min(Math.max(FRAME.distance, cam.minDistance), cam.maxDistance) - cam.distance) * e;
}

const KEYS: readonly AddonKey[] = [
  ['W A S D', 'gatherKeyStop', 'lstick'],
  ['Q R', 'rLook', 'rstick'],
];

function hold(ctx: RoamCtx, dt: number): AddonHold {
  const w = W;
  if (!w || !env) return { prompt: null };
  const { body: b, input } = ctx;
  ctx.cam.turn(input.lookYaw, input.lookPitch, input.zoom);
  b.vel.set(0, 0, 0);
  // The stick held away: he stops (on his way to the tail: at once).
  const away = Math.hypot(input.move.x, input.move.y) > 0.5;
  w.push = away ? w.push + dt : 0;
  if (away && (w.frozen || w.phase !== 'work' || w.push > PUSH)) {
    endWork(ctx, true);
    return { prompt: null };
  }
  w.t += dt;
  switch (w.phase) {
    case 'step':
      if (walkTo(ctx, w.stand, dt) || w.t > 3) {
        w.phase = 'turn';
        w.t = 0;
      }
      break;
    case 'turn':
      b.explorer.setMotion(0, true, 0);
      b.yaw += angleDiff(P.yaw, b.yaw) * damp(10, dt);
      if (Math.abs(angleDiff(P.yaw, b.yaw)) < 0.08 || w.t > 1) {
        b.yaw = P.yaw;
        w.phase = 'work';
        w.t = 0;
        setPose(true);
      }
      break;
    case 'work': {
      b.explorer.setMotion(0, true, 0);
      b.yaw += angleDiff(P.yaw, b.yaw) * damp(10, dt);
      if (w.frozen) break;
      if (w.u < 0) {
        w.piece = nextPiece(w.kind);
        if (!w.piece) {
          w.phase = 'done';
          w.t = 0;
          break;
        }
        w.u = 0;
        w.done = false;
      }
      // (the tailboard down first)
      if (gate < 0.95) break;
      w.u += dt / PIECE;
      if (!w.done && w.u >= (w.kind === 'load' ? 0.85 : 0.8)) moveOver(w);
      if (w.u >= 1) w.u = -1;
      break;
    }
    case 'done':
      b.explorer.setMotion(0, true, 0);
      pose.reach += (0 - pose.reach) * damp(6, dt);
      if (w.t > 0.4) {
        endWork(ctx, true);
        return { prompt: null };
      }
      break;
  }
  if (w.phase === 'work') shapeWork(w);
  if (W) frameCam(ctx, dt);
  return { prompt: null };
}

// ── URL (checks) ───────────────────────────────────────────────────────────

/** `cartload=log:4,bamboo:6` into the cart (emptied first). */
function fillFrom(q: string): void {
  CART_LOAD.clear();
  if (q === '0') return;
  for (const part of q.split(',')) {
    const [m, n] = part.split(':');
    if (!(m in MATERIALS)) {
      console.warn(`[haul] cartload=: no material "${m}" (${MATERIAL_IDS.join(', ')})`);
      continue;
    }
    const want = Math.max(0, Math.floor(Number(n ?? 1) || 0));
    const got = CART_LOAD.add(m as MaterialId, want);
    if (got < want) console.warn(`[haul] cartload=: only ${got} of ${want} ${m} fit (the cart's limit, ${CART_LIMIT})`);
  }
}

// ── The add-on ─────────────────────────────────────────────────────────────

registerAddon({
  id: 'haul',
  order: 58,

  get holding() {
    return W !== null;
  },
  get handsBusy() {
    return W !== null || leading;
  },

  keys() {
    return W ? KEYS : null;
  },

  init(e) {
    env = e;
    view = new HaulView();
    e.scene.add(view.things.mesh, view.oxen.mesh);
    // (nothing drawn until it is near the camera: `frame`; their shaders are the people's things' and the oxen's, compiled with those)
    view.things.mesh.visible = false;
    view.oxen.mesh.visible = false;
    const dev = e.shot || import.meta.env.DEV;
    const ql = e.params.get('cartload');
    if (dev && ql !== null) fillFrom(ql);
    // (a saved place the cart cannot stand on any more: back by the house)
    placeAt(e);
    const f = e.world.field;
    const bad = (x: number, z: number) => {
      const w = e.world.waterAt(x, z);
      return !e.world.inBounds(x, z) || (w !== null && w - f.heightAt(x, z) > WET);
    };
    if (bad(P.ax, P.az) || bad(P.yx, P.yz)) {
      console.warn(`[haul] the cart's saved place (${CART_AT.x.toFixed(1)}, ${CART_AT.z.toFixed(1)}) is no good: back by the house`);
      cartHome();
      placeAt(e);
    }
    loadVer = -1;
    console.info(`[haul] his ox cart at (${CART_AT.x.toFixed(1)}, ${CART_AT.z.toFixed(1)})${Math.hypot(CART_AT.x - CART_HOME.x, CART_AT.z - CART_HOME.z) < 0.05 ? ' (by his house)' : ''}, load ${JSON.stringify(CART_LOAD.all())} ${CART_LOAD.load()}/${CART_LIMIT}${progress.saving ? '' : ' (not saved: a shot or progress=0)'}`);
    if (dev)
      Object.assign(window, {
        __haul: {
          state: () => ({
            at: [+CART_AT.x.toFixed(2), +CART_AT.z.toFixed(2), +((CART_AT.yaw * 180) / Math.PI).toFixed(1)],
            home: [+CART_HOME.x.toFixed(2), +CART_HOME.z.toFixed(2)],
            load: CART_LOAD.all(),
            weight: CART_LOAD.load(),
            limit: CART_LIMIT,
            bag: BAG.all(),
            store: STORE.all(),
            owned: HOME.owned,
            shown,
            leading,
            blocked,
            speed: +speed.toFixed(2),
            way: way.s.length,
            gap: leading ? +(wayEnd() - yokeS).toFixed(2) : null,
            yoke: [+P.yx.toFixed(2), +P.yz.toFixed(2)],
            tail: tailSpot(new Vector3()).toArray().map((v) => +v.toFixed(2)),
            head: headSpot(new Vector3()).toArray().map((v) => +v.toFixed(2)),
            atHome: atHome(),
            work: W ? { kind: W.kind, phase: W.phase, u: +W.u.toFixed(2), piece: W.piece, moved: W.moved } : null,
            saving: progress.saving,
            boxes: view?.things.capacity ?? 0,
          }),
          /** Could the cart stand at (x, z) going `yaw` degrees (from ground `y`, default the land there)? Its ground, or NaN. */
          passable: (x: number, z: number, yaw = 0, y?: number) => {
            const r = (yaw * Math.PI) / 180;
            return passable(e, x, z, Math.sin(r), Math.cos(r), y ?? e.world.field.heightAt(x, z));
          },
        },
      });
  },

  input(ctx, mode) {
    // While he leads, he walks at the oxen's pace (no running).
    if (mode !== 'walk' || !leading) return false;
    const k = OX_PACE / (WALK_SPEED * ctx.body.scale * WALK_PACE);
    ctx.input.move.x *= k;
    ctx.input.move.y *= k;
    ctx.input.run = false;
    return false;
  },

  offer(ctx, mode) {
    if (mode !== 'walk' || !env || W || !shown || !HOME.owned) return null;
    if (leading) return words('letgo', () => `E  ${t('haulLetGo')}`);
    if (env.busy() || !ctx.body.grounded) return null;
    if (nearTail(ctx)) {
      if (atHome() && !CART_LOAD.empty) return counted('haulUnload', true);
      if (!BAG.empty) return canLoad() ? counted('haulLoad', true) : counted('haulFull', false);
      if (!CART_LOAD.empty) return counted('haulGoHome', false);
      return null;
    }
    if (nearHead(ctx)) return words('lead', () => `E  ${t('haulLead')}`);
    return null;
  },

  use(ctx) {
    if (!env || W) return;
    if (leading) {
      letGo('haulLetGoToast');
      return;
    }
    if (nearTail(ctx)) {
      if (atHome() && !CART_LOAD.empty) startWork(ctx, 'unload');
      else if (!BAG.empty && canLoad()) startWork(ctx, 'load');
      else SFX.play('gatherFull', 0.6);
      return;
    }
    if (nearHead(ctx)) takeRope(ctx);
  },

  hold(ctx, dt) {
    return hold(ctx, dt);
  },

  after(ctx, mode, dt) {
    if (mode !== 'walk' || !env) return;
    if (leading) {
      lead(ctx, dt);
      // (the camera far enough out behind him to see the oxen and the cart)
      if (leading && !ctx.input.zoom && ctx.cam.distance < LEAD_DIST) ctx.cam.distance += (LEAD_DIST - ctx.cam.distance) * damp(1.5, dt);
    }
    // On foot, he keeps out of the cart and the oxen (they are not on the walk map): eased out to the nearest side.
    if (W || !shown || !ctx.body.grounded || ctx.body.explorer.animator.posture) return;
    const p = ctx.body.pos;
    if (Math.abs(p.y - P.ay) > 2.5 || outside(p.x, p.z, BODY_R) > 0) return;
    const w = ctx.world;
    const d = push.d + 0.02;
    const x = p.x + push.x * d;
    const z = p.z + push.z * d;
    const g = w.standAt ? w.standAt(x, z, p.y, 0.6, 1.7 * ctx.body.scale * 0.95) : w.groundAt(x, z);
    if (!Number.isFinite(g) || !w.inBounds(x, z)) return;
    p.x = x;
    p.z = z;
    const v = ctx.body.vel;
    const vin = v.x * push.x + v.z * push.z;
    if (vin < 0) {
      v.x -= push.x * vin;
      v.z -= push.z * vin;
    }
    p.y = Math.max(p.y, g);
  },

  frame(f: MapFrame, mode) {
    const v = view;
    if (!v || !env) return;
    const cam = f.camera.position;
    const far = Math.hypot(P.ax - cam.x, P.az - cam.z) > HIDE;
    if (far) {
      if (shown) {
        v.hide();
        shown = false;
        dirty = true;
        v.things.flush(f.night);
        v.oxen.flush(f.t);
        // (no draw at all far off: the things' mesh is never culled by itself)
        v.things.mesh.visible = false;
      }
      return;
    }
    shown = true;
    v.things.mesh.visible = true;
    // The tailboard: down while he works at the tail, and under logs or poles (they lie out over it).
    const gw = (W && W.phase !== 'step') || CART_LOAD.count('log') > 0 || CART_LOAD.count('bamboo') > 0 ? 1 : 0;
    if (gate !== gw) {
      gate = W?.frozen ? gw : gate + Math.max(-f.dt / 0.5, Math.min(f.dt / 0.5, gw - gate));
      if (f.dt === 0) gate = gw;
      dirty = true;
    }
    if (CART_LOAD.version !== loadVer) {
      loadVer = CART_LOAD.version;
      dirty = true;
    }
    const unloading = W && W.kind === 'unload' && W.phase === 'work' && W.piece && !W.done && W.u >= 0 ? W.piece : null;
    if (dirty || unloading) {
      v.place(P.ax, P.ay, P.az, P.yaw, P.pitch, P.roll, K);
      v.cart.turn(v.wheels[0], P.wheel).turn(v.wheels[1], P.wheel);
      v.cart.turn(v.gate, GATE_DOWN * smooth(gate));
      v.cart.write();
      v.writeLoad(loadNow(), unloading);
      dirty = false;
    }
    // The oxen: side by side under the yoke, walking with the cart, else looking about (dozing at night).
    const walking = speed > 0.05;
    const g = walking ? oxGait(speed, K, 1.3, 2.3) : 0;
    const hz = walking ? oxHz(g, speed, K) : 0.5;
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? OX_SIDE : -OX_SIDE;
      const x = P.yx + Math.cos(P.oxYaw) * s * K - Math.sin(P.oxYaw) * OX_BACK * K;
      const z = P.yz - Math.sin(P.oxYaw) * s * K - Math.cos(P.oxYaw) * OX_BACK * K;
      v.oxen.place(i, x, P.oy, z, P.oxYaw, K);
      v.oxen.gait(i, g, hz, f.t);
      v.oxen.set(i, CH.head, walking ? 0.35 : f.night > 0.6 ? 1 : Math.round(10 * 0.12 * Math.sin(f.t * 0.2 + i * 2)) / 10, f.t);
      v.oxen.set(i, CH.turn, walking ? 0 : Math.round(10 * 0.4 * Math.sin(f.t * 0.13 + i * 2.1)) / 10, f.t);
    }
    // The rope from his hand to the right ox's nose while he leads; the piece in his hands while he works.
    if (leading && mode === 'walk') v.rope(hand(_h), nose(_n), 0.25);
    else v.rope(null);
    drawPiece(W);
    v.things.flush(f.night);
    v.oxen.flush(f.t);
    // The oxen's bells with their steps and the axle's creak now and then (the map's calls: not in shots).
    if (walking && f.dt > 0) {
      bellAt -= f.dt * hz * 2;
      if (bellAt <= 0) {
        bellAt = 1 + ((Math.floor(f.t * 3) * 7) % 2);
        f.calls.push({ kind: 'oxBell', x: P.yx, y: P.yy + 1.2, z: P.yz, gain: 0.55 });
      }
      creakAt -= f.dt;
      if (creakAt <= 0) {
        creakAt = 2.4 + ((Math.floor(f.t) * 13) % 5) * 0.5;
        f.calls.push({ kind: 'cartCreak', x: P.ax, y: P.ay + 0.8, z: P.az, gain: 0.6 });
      }
    }
  },

  setMode(next, _prev, ctx) {
    if (next === 'walk') return;
    // (another mode, back to the map: he lets go at once, the work stops; the cart stays where it is)
    endWork(ctx, false);
    letGo(next === 'overview' ? null : 'haulLetGoToast');
  },

  fromUrl(q, ctx) {
    // (checks only: in a shot or on the dev server; on the live site a link never moves his cart nor fills it)
    if (!env || !(env.shot || import.meta.env.DEV)) return;
    const at = q.get('cartat')?.split(',').map(Number);
    if (at && at.length >= 2 && at.every(Number.isFinite)) {
      CART_AT.x = at[0];
      CART_AT.z = at[1];
      CART_AT.yaw = ((at[2] ?? 0) * Math.PI) / 180;
      placeAt(ctx);
    }
    if (q.get('cartlead') === '1') {
      // (it stands behind him, the way he faces: the yoke `GAP` behind his feet)
      const b = ctx.body;
      CART_AT.yaw = b.yaw;
      CART_AT.x = b.pos.x - Math.sin(b.yaw) * (GAP + REACH_M);
      CART_AT.z = b.pos.z - Math.cos(b.yaw) * (GAP + REACH_M);
      placeAt(ctx);
      takeRope(ctx, true);
      placeOnWay(ctx);
    }
    const wk = q.get('cartwork');
    if (wk) {
      const [kind, u] = wk.split(':');
      if (kind === 'load' || kind === 'unload') {
        startWork(ctx, kind, true, u !== undefined && u !== '' ? Number(u) || 0 : 0.5);
        const cam = ctx.cam;
        const rc = q.get('rcam')?.split(',').map(Number);
        cam.yaw = ctx.body.yaw + (rc && Number.isFinite(rc[0]) ? (rc[0] * Math.PI) / 180 : FRAME.side);
        cam.pitch = rc && Number.isFinite(rc[1]) ? (rc[1] * Math.PI) / 180 : FRAME.pitch;
        cam.distance = rc && rc[2] ? rc[2] : FRAME.distance;
        framed = FRAME.for;
        const b = ctx.body;
        cam.focus.set(b.pos.x + Math.sin(b.yaw) * 0.8, b.pos.y + 1.7 * b.scale * 0.6, b.pos.z + Math.cos(b.yaw) * 0.8);
      }
    }
  },

  report() {
    const out: Record<string, string> = {};
    if (!CART_LOAD.empty)
      out.cartload = Object.entries(CART_LOAD.all())
        .map(([m, n]) => `${m}:${n}`)
        .join(',');
    if (Math.hypot(CART_AT.x - CART_HOME.x, CART_AT.z - CART_HOME.z) > 0.05) out.cartat = [CART_AT.x.toFixed(1), CART_AT.z.toFixed(1), ((CART_AT.yaw * 180) / Math.PI).toFixed(0)].join(',');
    if (leading) out.cartlead = '1';
    if (W) out.cartwork = `${W.kind}:${Math.max(0, W.u).toFixed(2)}`;
    return Object.keys(out).length ? out : null;
  },
});
