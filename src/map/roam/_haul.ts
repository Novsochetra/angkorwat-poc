import { Matrix4, Quaternion, Vector3 } from 'three';
import { newShareState, sharePose } from '../../character/share';
import { WALK_SPEED } from '../../world/scale';
import { SFX } from '../audio/addonSfx';
import '../audio/_cart';
import '../audio/_haul';
import { inPlot } from '../build/plot';
import { cartAway, CART_AT, CART_BOX, CART_HOME, CART_LIMIT, CART_LOAD, CART_STATE, CART_YOKE, OXEN_BOX, saveCartAt, wrapYaw } from '../build/haul';
import { BAG, MATERIALS, MATERIAL_IDS, STORE, materialsText, type MaterialId, type Materials } from '../build/materials';
import { CH } from '../fauna/_kit';
import { HOME, HOME_AT } from '../hamlet/_homePlan';
import { padName } from '../pad/glyphs';
import { pad } from '../pad/pad';
import { OX_NOSE, oxGait, oxHz, oxPoint, type OxPose } from '../people/_oxRide';
import { PEOPLE_SCALE } from '../people/_personModel';
import { GATE_DOWN, REACH, WHEEL_R } from '../people/_sceneCart';
import { progress } from '../progress';
import type { MapFrame } from '../types';
import { lang, num, t, type WordKey } from '../ui/lang';
import { MAP_SPOTS } from '../ui/_minimapSpots';
import { ADDONS, registerAddon, touchJump, type AddonEnv, type AddonHold, type AddonKey } from './_addons';
import { CAP, HOLD, HaulView, OX_BACK, OX_SIDE } from './_haulModel';
import { blocksInBox, boxClear, boxMeetsCircle, builtInBox, cowInBox, stakeInBox, worldInBox, type CartBox } from './_haulFit';
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
if (Math.abs(REACH_M - CART_YOKE) > 1e-6) console.warn('[haul] build/haul.ts CART_YOKE is not the cart\'s reach');
/** The oxen's walk while he leads them, and his (m/s); the most they go catching up with him. */
const OX_PACE = 2.0;
const CATCH = 2.7;
/** How quickly they get going and stop (m/s²). */
const ACCEL = 1.4;
const DECEL = 3.0;
/** His feet to the yoke along the way while he leads (m): the oxen's heads a long step behind him. */
const GAP = 2.7;
/**
 * The way's end this near his feet (m), blocked or not, and the cart is at his heels: it waits there (he stands by a
 * log pile, a fence, the oxen's own noses: the way cannot reach his feet, nor need it).
 */
const HEEL = GAP + 0.5;
/**
 * At his heels means in front of the oxen too: his feet within this angle (rad) of the cart's heading, seen from the
 * yoke. Beside or behind them (he turned to go back the way he came) the oxen bring it round toward him.
 */
const FRONT = 0.9;
/**
 * The cart standing this long (s), blocked or not, with the rope taut or him beside or behind the oxen: they look for a
 * way round (never a silent wait).
 */
const TAUT_AFTER = 1.2;
/**
 * Getting nowhere, judged over a window (s), not frame by frame: he has pushed on all of it (keys, stick, touch — a
 * player re-aims all the time) and moved under `NOWHERE_HIM` m net, the cart under `NOWHERE_CART` m. The first time the
 * oxen look for a way round (toward where he heads, `INTO_AHEAD` m on the way he faces, when he walks into them from in
 * front; toward him else); again, the rope slips and says why.
 */
const NOWHERE_WINDOW = 2.5;
const NOWHERE_HIM = 0.5;
const NOWHERE_CART = 0.3;
const INTO_AHEAD = 6;
/** No way round found: tried again after this long (s) while the rope is taut or he stands beside the oxen. */
const RETRY_AFTER = 3;
/** A way round made near him ends with him well in front (rad): one plan brings the oxen round, not a nudge at a time. */
const FRONT_GOAL = 0.45;
/** His hand farther than this from the ox's nose (m): he lets go. */
const ROPE_MAX = 6.5;
/** He is held this near the oxen's noses (m, on the ground) while he leads: the rope is this long. */
const ROPE_HOLD = 4.2;
/** Blocked and getting nowhere this long (s) while he pulls at the rope: it slips. */
const STUCK_AFTER = 6;
/** The way is kept as points this far apart (m). */
const STEP = 0.5;
/**
 * Where a new way starts (taking the rope, a step of a way round): its points behind the yoke (m), `STEP` apart, the
 * last right at the yoke — so the cart stands on it where it stood (tested), never a part of a step behind (untested).
 */
const BEHIND = Array.from({ length: Math.ceil((REACH_M + 2) / STEP) + 1 }, (_, i) => (Math.ceil((REACH_M + 2) / STEP) - i) * STEP);
/** Across the way, where the cart needs room (m from its middle: the wheels' hubs and the oxen side by side). */
const ACROSS = [-1.15, -0.6, 0, 0.6, 1.15];
/** The land before the yoke under the oxen's fronts (m on from it; their box reaches `OXEN_BOX.front`). */
const OX_FRONT = [0.65, OXEN_BOX.front - 0.2];
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
/** (the cart's and the oxen's boxes he keeps out of on foot: build/haul.ts `CART_BOX`, `OXEN_BOX`, shared with the build ghost and planting) */
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
/** The farthest the yoke has been tested to fit along the way (m), and how far apart those tests are. */
let fitS = 0;
const FIT_STEP = 0.2;
/** Where those tests began (m along the way): every place at `fitOrigin` + k × `FIT_STEP` up to `fitS` was tested. */
let fitOrigin = 0;
/**
 * Stuck before something: the oxen bring the cart round in a few moves (`getRound`: a turn on the spot round its
 * axle at `PIVOT_RATE` rad/s, a roll back or on at `BACK_PACE` m/s), every placement tested first.
 */
const PIVOT_RATE = 0.7;
const BACK_PACE = 0.6;
let turning = 0;
/** Where he stands (his feet), for the moving cart to keep clear of; and how long it has stood blocked, getting nowhere (s). */
const himAt = { x: Number.NaN, z: Number.NaN };
let stuckFor = 0;
/** How long (s) the rope has been taut with the cart standing (`TAUT_AFTER`). */
let taut = 0;
/** His feet from the oxen's noses (m), last frame he led (for the state). */
let ropeFar = 0;
/** His and the cart's places, a sample every 0.25 s over `NOWHERE_WINDOW` (and was he pushing on); tries so far. */
const track: { t: number; x: number; z: number; cx: number; cz: number; cyaw: number; push: boolean }[] = [];
let trackT = 0;
let trackNext = 0;
let nowhereTries = 0;
/** Does he push on (keys, stick, touch) this step, as he pressed it (before the oxen's pace scales it)? */
let pushing = false;
/** The rope let out (m): `ROPE_HOLD`, more while there is no way round for where he stands. */
let slack = ROPE_HOLD;
/** Lead tries in a row from (about) this place that moved it under 0.5 m, and where the cart stood as the last began. */
let stuckTries = 0;
/**
 * How far (m) it has backed while it comes round (`BACK_MOST`): every way round's rolls back and moves back the way it
 * came, counted from when he took the rope or it last followed him on `BACK_RESET` m (`onRun`) — not given back by
 * rolling on within a way round, nor reset by a new one.
 */
let backed = 0;
let onRun = 0;
/** The oxen are walking it round toward him (`pivotPlan`): they go on doing so, without waiting, while he is not in front. */
let pivoting = false;
/**
 * He walked into the oxen from in front, back past them: they walk the cart right round (to `want`, the way `sgn`),
 * plan after plan without waiting, brushing past him (`BODY_R`), until it is round or cannot turn on.
 */
let turnRound: { want: number; sgn: number } | null = null;
const tryFrom = { x: Number.NaN, z: Number.NaN };
/** Sending it home (the fade): nothing else meanwhile. */
let sending = false;
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
  // (blocked, and nothing has moved since it was tried — he, the way's end: not tried again every frame)
  if (blocked && Math.hypot(p.x - wayTried.x, p.z - wayTried.z) < 0.08 && way.s.length === wayTried.n && way.x[n] === wayTried.ex && way.z[n] === wayTried.ez) return;
  wayTried.x = p.x;
  wayTried.z = p.z;
  wayTried.n = way.s.length;
  wayTried.ex = way.x[n];
  wayTried.ez = way.z[n];
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
    wayPush(x, h, z);
    // (the cart and its oxen as they would stand with the yoke here: their whole boxes clear, `_haulFit.ts`)
    fitTag = 'way';
    if (!fitsOnWay(ctx)) {
      wayPop();
      blocked = true;
      return;
    }
    blocked = false;
    n++;
  }
}

/** Where he stood, and the way's length and end, when the way was last tried on (`wayOn`). */
const wayTried = { x: Number.NaN, z: Number.NaN, n: -1, ex: Number.NaN, ez: Number.NaN };
/** The way's last point taken back (it would not fit). */
function wayPop(): void {
  way.x.pop();
  way.y.pop();
  way.z.pop();
  way.s.pop();
}

const _cartBox: CartBox = { x: 0, z: 0, yaw: 0, back: CART_BOX.back, front: CART_BOX.front, half: CART_BOX.half };
const _oxBox: CartBox = { x: 0, z: 0, yaw: 0, back: OXEN_BOX.back, front: OXEN_BOX.front, half: OXEN_BOX.half };
/** Checks: the boxes' tests made and the time they took (ms). */
const FIT = { n: 0, ms: 0, worst: 0, by: {} as Record<string, number> };
/** Checks: what the fit tests are for (counted by it in `FIT.by`). */
let fitTag = 'other';

/** The cart's and the oxen's boxes clear, the cart at axle (ax, az) heading `yaw`, the oxen at the yoke (yx, yz) heading `oxYaw`. */
function boxesClear(ctx: Pick<RoamCtx, 'world'>, ax: number, az: number, yaw: number, yx: number, yz: number, oxYaw: number, moving = false, clearOfHim = false): boolean {
  const t0 = performance.now();
  _cartBox.x = ax;
  _cartBox.z = az;
  _cartBox.yaw = yaw;
  _oxBox.x = yx;
  _oxBox.z = yz;
  _oxBox.yaw = oxYaw;
  // (moving, it stops for his cattle too, and for him: they walk, it waits; it never swings its oxen into him)
  const ok =
    boxClear(ctx.world, _oxBox) &&
    boxClear(ctx.world, _cartBox) &&
    !(moving && (cowInBox(_oxBox) || cowInBox(_cartBox))) &&
    !(clearOfHim && (boxMeetsCircle(_oxBox, himAt.x, himAt.z, BODY_R) || boxMeetsCircle(_cartBox, himAt.x, himAt.z, BODY_R)));
  const ms = performance.now() - t0;
  FIT.n++;
  FIT.by[fitTag] = (FIT.by[fitTag] ?? 0) + 1;
  FIT.ms += ms;
  FIT.worst = Math.max(FIT.worst, ms);
  return ok;
}

/**
 * **The one rule** for where the cart may stand (axle at (ax, az), heading `yaw`, its oxen straight before it): the
 * land at its tail, axle, oxen and yoke (`passable`, each from its own ground: water, a step across it, a roof, the
 * roaming area) and under the oxen's fronts (on from the yoke's ground: never their heads out over a drop), and its and its oxen's whole boxes clear (`_haulFit.ts` `boxClear`). As it moves (`moving`), and
 * as a saved place is checked (`standsAt`): it never stops where it would be refused. Moving, it stops for his
 * cattle too.
 */
function placeFits(ctx: Pick<RoamCtx, 'world'>, ax: number, az: number, yaw: number, moving: boolean, clearOfHim = false): boolean {
  const f = ctx.world.field;
  const dx = Math.sin(yaw);
  const dz = Math.cos(yaw);
  for (const d of [CART_BOX.back, 0, CART_YOKE - OX_BACK * K, CART_YOKE]) {
    const x = ax + dx * d;
    const z = az + dz * d;
    if (Number.isNaN(passable(ctx, x, z, dx, dz, f.heightAt(x, z)))) return false;
  }
  // (the oxen's fronts too, on from the yoke's ground — never their heads out over a drop)
  let y = f.heightAt(ax + dx * CART_YOKE, az + dz * CART_YOKE);
  for (const d of OX_FRONT) {
    y = passable(ctx, ax + dx * (CART_YOKE + d), az + dz * (CART_YOKE + d), dx, dz, y);
    if (Number.isNaN(y)) return false;
  }
  return boxesClear(ctx, ax, az, yaw, ax + dx * CART_YOKE, az + dz * CART_YOKE, yaw, moving, clearOfHim);
}

/** With the yoke at `s` along the way: the cart a pole's reach back along it (a chord), its oxen straight before it (as `placeOnWay`). */
function fitsAt(ctx: Pick<RoamCtx, 'world'>, s: number): boolean {
  wayAt(s, _a);
  wayAt(s - REACH_M, _b);
  const yaw = Math.atan2(_a.x - _b.x, _a.z - _b.z);
  _fit.x = _a.x - Math.sin(yaw) * REACH_M;
  _fit.z = _a.z - Math.cos(yaw) * REACH_M;
  _fit.yaw = yaw;
  fitCtx = ctx;
  return placeFits(ctx, _fit.x, _fit.z, yaw, true);
}
/** The place `fitsAt` tested last (for `canMoveOn`). */
const _fit = { x: 0, z: 0, yaw: 0 };
let fitCtx: Pick<RoamCtx, 'world'> | null = null;

/**
 * From the place `fitsAt` just tested: is there a way round's move on from it — a roll on (`ROLL_MOVE`) or a whole turn
 * either way (`TURN_MOVE`), every sub-step fitting? A place from which it could only back up it does not roll into
 * (wedged against something): it stands one place short of it, where the oxen can still bring it round.
 */
function canMoveOn(): boolean {
  const c = fitCtx;
  if (!c) return true;
  const fx = Math.sin(_fit.yaw);
  const fz = Math.cos(_fit.yaw);
  let ok = true;
  for (let d = FIT_STEP; d <= ROLL_MOVE + 1e-6 && ok; d += FIT_STEP) ok = placeFits(c, _fit.x + fx * d, _fit.z + fz * d, _fit.yaw, true);
  if (ok) return true;
  for (const sgn of [1, -1]) {
    ok = true;
    for (let k = 1; k * TURN_SUB <= TURN_MOVE + 1e-6 && ok; k++) ok = placeFits(c, _fit.x, _fit.z, _fit.yaw + sgn * k * TURN_SUB, true);
    if (ok) return true;
  }
  return false;
}

/** With the yoke at the way's last point (a new one: the way goes on only where the cart will fit). */
const fitsOnWay = (ctx: RoamCtx): boolean => fitsAt(ctx, wayEnd());

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
function placeOnWay(ctx: Pick<RoamCtx, 'world'>): void {
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
  // (the oxen straight before the cart, as its boxes are tested and kept: `_haulFit.ts`)
  P.oxYaw = P.yaw;
  tilt(ctx);
  CART_AT.x = P.ax;
  CART_AT.z = P.az;
  CART_AT.yaw = P.yaw;
  dirty = true;
  histNote();
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
  const fx = Math.sin(P.oxYaw);
  const fz = Math.cos(P.oxYaw);
  out.set(P.yx + fx * HEAD_AHEAD, P.yy, P.yz + fz * HEAD_AHEAD);
  ropeSide = 0;
  const w = env?.world;
  if (!w || ropeSpotOk(w, out.x, out.z)) return out;
  // (before them the stream, or off a bank: he takes the rope from beside the oxen, on the dry side nearest him)
  let best = Infinity;
  for (const sd of [1, -1]) {
    const x = P.yx + fx * ROPE_SIDE_ON + fz * sd * ROPE_SIDE;
    const z = P.yz + fz * ROPE_SIDE_ON - fx * sd * ROPE_SIDE;
    const d = Math.hypot(x - seenAt.x, z - seenAt.z);
    if (d < best && ropeSpotOk(w, x, z)) {
      best = d;
      ropeSide = sd;
      _side.set(x, P.yy, z);
    }
  }
  return ropeSide ? out.copy(_side) : out;
}
/** Where he takes the rope: before the oxen (0), or beside them (±1: that side), when before them is water or a drop. */
let ropeSide = 0;
const _side = new Vector3();
/** Where he stood last step (on foot): the rope's side spot is the one nearer him. */
const seenAt = { x: 0, z: 0 };
/** Beside the oxen: this far out from their middle line (m), this far on from the yoke. */
const ROPE_SIDE = 1.9;
const ROPE_SIDE_ON = 0.8;
/** Can he stand at (x, z) to take the rope: land near the oxen's own ground, not in water? */
function ropeSpotOk(w: RoamCtx['world'], x: number, z: number): boolean {
  const g = w.field.heightAt(x, z);
  if (!Number.isFinite(g) || Math.abs(g - P.yy) > 1.2) return false;
  const water = w.waterAt(x, z);
  return water === null || water - g < WET;
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
/** The cart at home: on his land (build/plot.ts: the yard, the meadow before the house, the terrace), or by the house. */
const atHome = (): boolean => inPlot(P.ax, P.az) || Math.hypot(P.ax - HOME_AT.x, P.az - HOME_AT.z) < HOME_NEAR;

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

// ── Its place checked ──────────────────────────────────────────────────────

/** Could the cart stand at `at`: its tail, its axle, its oxen and its yoke where a cart can go (`passable`, each from its own ground)? */
const standsAt = (ctx: Pick<RoamCtx, 'world'>, at: { x: number; z: number; yaw: number }): boolean => placeFits(ctx, at.x, at.z, at.yaw, false);

/**
 * A place near his house the cart can stand on: its own place by the house, else the nearest round it (rings out to
 * 16 m, its heading turned each quarter) — a piece he built there, an old save; null: none.
 */
function parkNearHome(ctx: Pick<RoamCtx, 'world'>): { x: number; z: number; yaw: number } | null {
  if (standsAt(ctx, CART_HOME)) return { ...CART_HOME };
  for (let r = 2; r <= 16; r += 2)
    for (let a = 0; a < 12; a++)
      for (let q = 0; q < 4; q++) {
        const at = { x: CART_HOME.x + Math.cos((a * Math.PI) / 6) * r, z: CART_HOME.z + Math.sin((a * Math.PI) / 6) * r, yaw: wrapYaw(CART_HOME.yaw + (q * Math.PI) / 2) };
        if (standsAt(ctx, at)) return at;
      }
  return null;
}

let placeChecked = false;
/**
 * Once he first walks (the walk map whole: houses, stalls, what he built): the saved place must be one the cart could
 * stand on, as in play (`standsAt`); else it goes by the house (`parkNearHome`). A saved place inside a house or the
 * market's stalls, or one a piece of his has been built over since, is not kept.
 */
function checkPlace(ctx: RoamCtx): void {
  placeChecked = true;
  if (leading || W || standsAt(ctx, CART_AT)) return;
  const was = `(${CART_AT.x.toFixed(1)}, ${CART_AT.z.toFixed(1)})`;
  // (the nearest place it fits round where it was, out to 8 m, its heading kept or turned a quarter; else by the house)
  let at: { x: number; z: number; yaw: number } | null = null;
  for (let r = 1; r <= 8 && !at; r++)
    for (let a = 0; a < 12 && !at; a++)
      for (let q = 0; q < 4 && !at; q++) {
        const c = { x: CART_AT.x + Math.cos((a * Math.PI) / 6) * r, z: CART_AT.z + Math.sin((a * Math.PI) / 6) * r, yaw: wrapYaw(CART_AT.yaw + (q * Math.PI) / 2) };
        if (standsAt(ctx, c)) at = c;
      }
  at ??= parkNearHome(ctx);
  if (!at) {
    console.info(`[haul] the cart's place ${was} is no good, and none near it or by the house is free: it stays`);
    return;
  }
  CART_AT.x = at.x;
  CART_AT.z = at.z;
  CART_AT.yaw = at.yaw;
  saveCartAt();
  placeAt(ctx);
  console.info(`[haul] the cart's place ${was} is no good: moved to (${at.x.toFixed(1)}, ${at.z.toFixed(1)})`);
}

// ── Leading ────────────────────────────────────────────────────────────────

/** He takes the rope: the way starts behind the cart, through it, to his feet. */
function takeRope(ctx: RoamCtx, quiet = false): void {
  wayClear();
  slack = ROPE_HOLD;
  taut = 0;
  stuckFor = 0;
  track.length = 0;
  nowhereTries = 0;
  backed = 0;
  onRun = 0;
  pivoting = false;
  turnRound = null;
  const f = ctx.world.field;
  const bx = -Math.sin(P.yaw);
  const bz = -Math.cos(P.yaw);
  // (from 2 m behind the axle up to the yoke, every STEP m)
  for (const d of BEHIND) {
    const x = P.yx + bx * d;
    const z = P.yz + bz * d;
    wayPush(x, f.heightAt(x, z), z);
  }
  yokeS = wayEnd();
  fitS = yokeS;
  fitOrigin = yokeS;
  tryFrom.x = P.ax;
  tryFrom.z = P.az;
  speed = 0;
  blocked = false;
  leading = true;
  planClear();
  CART_STATE.leading = true;
  saveWait = SAVE_EVERY;
  wayOn(ctx);
  // (the camera over the oxen behind him)
  pitchBefore ??= ctx.cam.pitchMin;
  pitchLead = Math.max(pitchBefore, LEAD_PITCH);
  ctx.cam.pitchMin = pitchLead;
  if (!quiet) {
    SFX.play('haulRope', 0.9);
    pad.rumble('tick', 0.35);
    // (the key that lets go: E, the pad's □, or on a touch screen the button that says so)
    const touch = typeof document !== 'undefined' && document.body.classList.contains('roam-touch');
    ctx.hud.toast(pad.active ? t('haulLeadHint', { key: pad.kind === 'ps' ? '□' : padName('west', pad.kind) }) : touch ? t('haulLeadHintTouch') : t('haulLeadHint', { key: 'E' }));
  }
  console.info(`[haul] he leads the cart from (${P.ax.toFixed(1)}, ${P.az.toFixed(1)}), load ${JSON.stringify(CART_LOAD.all())}`);
}

/** He lets go: the cart stands where it is (kept). `why`: the toast's words (null: none). */
function letGo(why: WordKey | null): void {
  if (!leading) return;
  // (it stands where it was last tested to fit: the places tested are `FIT_STEP` apart, it may be between two)
  if (env) {
    const s = snapS();
    if (s < yokeS - 1e-6) {
      yokeS = s;
      placeOnWay(env);
    }
  }
  stuckTries = Math.hypot(P.ax - tryFrom.x, P.az - tryFrom.z) < 0.5 ? stuckTries + 1 : 0;
  planClear();
  turning = 0;
  leading = false;
  CART_STATE.leading = false;
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
    // (stuck here twice in a row: say that the oxen can take it home)
    env?.hud.toast(t(why === 'haulStuck' && stuckTries >= 2 && env && !canGetOut(env) ? 'haulStuckHome' : why));
    SFX.play('haulRope', 0.6);
  }
  dirty = true;
  console.info(`[haul] he lets go (${why ?? 'quietly'}): the cart stands at (${CART_AT.x.toFixed(1)}, ${CART_AT.z.toFixed(1)}) facing ${((CART_AT.yaw * 180) / Math.PI).toFixed(0)}°`);
}

/** The last place along the way tested to fit, at or behind the yoke (m along the way). */
const snapS = (): number => Math.min(yokeS, fitOrigin + Math.floor((yokeS - fitOrigin) / FIT_STEP + 1e-6) * FIT_STEP);

/** Stand it at axle (ax, az) heading `yaw` (it turned or backed on the spot), and start the way again from there. */
function standAt(ctx: RoamCtx, ax: number, az: number, yaw: number): void {
  CART_AT.x = ax;
  CART_AT.z = az;
  CART_AT.yaw = wrapYaw(yaw);
  placeAt(ctx);
  wayClear();
  const f = ctx.world.field;
  const bx = -Math.sin(P.yaw);
  const bz = -Math.cos(P.yaw);
  for (const d of BEHIND) wayPush(P.yx + bx * d, f.heightAt(P.yx + bx * d, P.yz + bz * d), P.yz + bz * d);
  yokeS = fitS = fitOrigin = wayEnd();
}

// ── Getting round: a small turn of a few moves (the oxen walk it) ──────────

/** A place of the cart (axle, heading) and how it is reached. */
interface Pose {
  x: number;
  z: number;
  yaw: number;
}
/** A sub-step of a move; `hi`: a place it stood at before (`hist`), walked back to. */
interface Step extends Pose {
  hi?: number;
}
interface PlanNode extends Pose {
  g: number;
  f: number;
  parent: PlanNode | null;
  /** The tested places from the parent's to this one (each a sub-step: `TURN_SUB` rad, `FIT_STEP` m). */
  subs: Step[];
  /** What the sub-steps are: a turn on the spot, or a roll on or back (their time each). */
  kind: 'turn' | 'roll';
  /** Where it is in `hist` (reached by going back the way it came), if it is. */
  hi?: number;
  /** How far it has backed in a row by here (m: `backed`, then this plan's rolls back less its rolls on). */
  back: number;
}

/**
 * The places it last stood at as he led it, oldest first (one each `FIT_STEP` m or `TURN_SUB` rad it moved; `HIST_MAX`
 * of them, about 8 m): a way round may go back along them — undo the curve it followed, which straight rolls and turns
 * on the spot cannot always do. Kept while it stands (he lets go, takes the rope again); a jump (taken home, a saved
 * place moved) starts it again.
 */
const HIST_MAX = 40;
const hist: Pose[] = [];
function histNote(): void {
  const l = hist[hist.length - 1];
  if (l && Math.hypot(CART_AT.x - l.x, CART_AT.z - l.z) > 1) hist.length = 0;
  else if (l && Math.hypot(CART_AT.x - l.x, CART_AT.z - l.z) < FIT_STEP - 1e-3 && Math.abs(angleDiff(CART_AT.yaw, l.yaw)) < TURN_SUB - 1e-4) return;
  hist.push({ x: CART_AT.x, z: CART_AT.z, yaw: CART_AT.yaw });
  if (hist.length > HIST_MAX) hist.shift();
}
/** Where the cart stands now as a search's first place: its place in `hist` (the last, or just past it). */
function rootNode(): PlanNode {
  const l = hist[hist.length - 1];
  const at = l && Math.hypot(CART_AT.x - l.x, CART_AT.z - l.z) < 0.05 && Math.abs(angleDiff(CART_AT.yaw, l.yaw)) < 0.01;
  return { x: CART_AT.x, z: CART_AT.z, yaw: CART_AT.yaw, g: 0, f: 0, parent: null, subs: [], kind: 'turn', hi: at ? hist.length - 1 : hist.length, back: backed };
}

/** A move's turn (rad) and roll (m); the sub-steps tested in each (the oxen's far end moves under 0.2 m a sub-step). */
const TURN_MOVE = 0.15;
const TURN_SUB = 0.03;
const ROLL_MOVE = 0.4;
/** A move costs (a turn on the spot, a roll back, a roll on): the search likes few moves, little backing. */
const COST = { turn: 1, back: 1.3, on: 1 };
/**
 * A cart backs up only a little (m): the ways round in a row may roll it back, or back the way it came, this far in
 * all (`backed`, less what it has rolled on since); past it they turn it (a U-turn) — never back it along before him
 * as he walks back past the oxen (it backed 15 m through the woodcutters' camp, never turning round).
 */
const BACK_MOST = 3;
/** Following him on this far (m) ends a turning round: a new one may back up again. */
const BACK_RESET = 2;
/**
 * The oxen walk the cart round toward him, the cart turning on its wheels (`pivotPlan`): this far a plan at most (rad),
 * these sub-steps at least, done once he is within this of its heading seen from its axle; the oxen's and the cart's
 * boxes keep this far (m) clear of his feet's middle (under `BODY_R`: they nudge him aside as they come round).
 */
const PIVOT_MOST = 1.2;
const PIVOT_MIN = 3;
const PIVOT_DONE = 0.35;
const PIVOT_CLEAR = 0.3;
/** Turning right round (he walked into their noses): the oxen brush past him, nudging him aside (his feet this clear, m). */
const ROUND_CLEAR = 0.15;
/** How near his way a heading must be (rad) for a place to be tried, and how far past where the yoke stops behind him the trial way must go on from it (m). */
const AIM = 0.8;
const AHEAD = 3;
/** The search's reach (places looked at), and its time a frame (ms): it goes on over frames while he waits. */
const PLAN_NODES = 1600;
const PLAN_MS = 5;
/**
 * The search weighs the way to go this much over the way come (it makes for coming round first, then for few moves);
 * a part of a way round, when it finds no whole one within its reach, is walked if it comes round this much more
 * (in the search's guess: about 0.3 rad, or 0.4 m nearer) — the oxen then look on from there.
 */
const W_GUESS = 3;
const PART_GAIN = 1;
/** One search's fit tests, each place tested once (the turns' sub-steps meet again from the next place). */
const memo = new Map<string, boolean>();
function fitsMemo(ctx: Pick<RoamCtx, 'world'>, x: number, z: number, yaw: number, moving: boolean): boolean {
  const key = `${Math.round(x * 1000)},${Math.round(z * 1000)},${Math.round(wrapYaw(yaw) * 10000)},${moving ? 1 : 0}`;
  let ok = memo.get(key);
  if (ok === undefined) memo.set(key, (ok = placeFits(ctx, x, z, yaw, moving)));
  return ok;
}
/** The open places as a heap, the least `f` on top. */
function heapPush(h: PlanNode[], n: PlanNode): void {
  h.push(n);
  let i = h.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (h[p].f <= h[i].f) break;
    [h[p], h[i]] = [h[i], h[p]];
    i = p;
  }
}
function heapPop(h: PlanNode[]): PlanNode | undefined {
  const top = h[0];
  const last = h.pop();
  if (h.length && last) {
    h[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < h.length && h[l].f < h[m].f) m = l;
      if (r < h.length && h[r].f < h[m].f) m = r;
      if (m === i) break;
      [h[m], h[i]] = [h[i], h[m]];
      i = m;
    }
  }
  return top;
}
/** Seconds a sub-step takes as the oxen walk it: a turn's, a roll's. */
const SUB_TIME = { turn: TURN_SUB / PIVOT_RATE, roll: FIT_STEP / BACK_PACE };

/** The search under way (for him at `him`), its open places and those seen; the plan found, being walked. */
const search = { t0: 0, failedAt: 0, from: { x: 0, z: 0 }, best: null as PlanNode | null, nearest: null as PlanNode | null, strict: false, on: false, him: { x: 0, z: 0 }, open: [] as PlanNode[], seen: new Set<string>(), n: 0, failedFor: { x: Number.NaN, z: Number.NaN } };
const walkPlan = { steps: [] as { pose: Step; time: number }[], i: 0, t: 0, from: { x: 0, z: 0, yaw: 0 }, clear: 0 };

const poseKey = (p: Pose): string => `${Math.round(p.x / 0.2)},${Math.round(p.z / 0.2)},${Math.round(wrapYaw(p.yaw) / TURN_MOVE)}`;

/** Heading from the yoke of the cart at `p` toward him. */
const towardHim = (p: Pose): number => Math.atan2(search.him.x - p.x - Math.sin(p.yaw) * REACH_M, search.him.z - p.z - Math.cos(p.yaw) * REACH_M);

/** A trial way (as `way`, for `wayWorksFrom`): points and how far along each is. */
const trial = { x: [] as number[], z: [] as number[], y: [] as number[], s: [] as number[] };
function trialAt(s: number, out: { x: number; z: number }): void {
  const n = trial.s.length;
  let i = n - 2;
  while (i > 0 && trial.s[i] > s) i--;
  const k = Math.max(0, Math.min(1, (s - trial.s[i]) / Math.max(1e-6, trial.s[i + 1] - trial.s[i])));
  out.x = trial.x[i] + (trial.x[i + 1] - trial.x[i]) * k;
  out.z = trial.z[i] + (trial.z[i + 1] - trial.z[i]) * k;
}
const _ta = { x: 0, z: 0 };
const _tb = { x: 0, z: 0 };

/**
 * From place `n`, would the way go on toward him as it does in play (`wayOn`, `fitsAt`): a point every `STEP` m from
 * the yoke toward him, each where a cart can go, the cart at each (a chord of the way behind) fitting — for `AHEAD`
 * m, or up to his heels?
 */
function wayWorksFrom(ctx: Pick<RoamCtx, 'world'>, n: Pose): boolean {
  fitTag = 'goal';
  const f = ctx.world.field;
  const fx = Math.sin(n.yaw);
  const fz = Math.cos(n.yaw);
  const yx = n.x + fx * REACH_M;
  const yz = n.z + fz * REACH_M;
  trial.x.length = trial.z.length = trial.y.length = trial.s.length = 0;
  const push = (x: number, z: number, y: number) => {
    const k = trial.s.length;
    trial.s.push(k ? trial.s[k - 1] + Math.hypot(x - trial.x[k - 1], z - trial.z[k - 1]) : 0);
    trial.x.push(x);
    trial.z.push(z);
    trial.y.push(y);
  };
  for (const d of BEHIND) push(yx - fx * d, yz - fz * d, f.heightAt(yx - fx * d, yz - fz * d));
  // (the way toward him, as `wayOn` lays it: a point every STEP m, each where a cart can go, up to his heels (`HEEL`:
  // where play is content too, so a way that works here does there, not blocked again a little on) or `AHEAD` m past
  // where the yoke stops behind him — one point at least, at his heels too: from where a way round ends the cart can
  // always step on after him, never left wedged as he walks on; and the cart at every `FIT_STEP` m along it, as `lead`
  // tests its rolling)
  const s0 = trial.s[trial.s.length - 1];
  const toGo = Math.max(STEP, Math.min(AHEAD + GAP, Math.hypot(search.him.x - yx, search.him.z - yz) - HEEL));
  for (let went = 0; went < toGo - 1e-6; went += STEP) {
    const k = trial.s.length - 1;
    const dx = search.him.x - trial.x[k];
    const dz = search.him.z - trial.z[k];
    const d = Math.hypot(dx, dz) || 1;
    const x = trial.x[k] + (dx / d) * STEP;
    const z = trial.z[k] + (dz / d) * STEP;
    const h = passable(ctx, x, z, dx / d, dz / d, trial.y[k]);
    if (Number.isNaN(h)) return false;
    push(x, z, h);
  }
  const end = trial.s[trial.s.length - 1];
  for (let s = s0 + FIT_STEP; s <= end + 1e-6; s += FIT_STEP) {
    trialAt(s, _ta);
    trialAt(s - REACH_M, _tb);
    const yaw = Math.atan2(_ta.x - _tb.x, _ta.z - _tb.z);
    if (!placeFits(ctx, _ta.x - Math.sin(yaw) * REACH_M, _ta.z - Math.cos(yaw) * REACH_M, yaw, true)) return false;
  }
  return true;
}

/** How far (m) the yoke at place `n` is from where it would follow him (`GAP` behind his feet). */
const short = (n: Pose): number => Math.max(0, Math.hypot(search.him.x - (n.x + Math.sin(n.yaw) * REACH_M), search.him.z - (n.z + Math.cos(n.yaw) * REACH_M)) - GAP);
/** The search's guess of the moves left from `n`: the way to his heels in rolls, and the turn toward him. */
const guess = (n: Pose): number => short(n) / ROLL_MOVE + (0.5 * Math.abs(angleDiff(towardHim(n), n.yaw))) / TURN_MOVE;
/**
 * Is he at the heels of the cart at `n` (its yoke within `HEEL` of his feet, and he in front of the oxen, within
 * `FRONT` of its heading)? Then it waits, in play (`lead`) as in a search's goal.
 */
function atHeels(n: Pose, hx: number, hz: number): boolean {
  return Math.hypot(hx - n.x - Math.sin(n.yaw) * REACH_M, hz - n.z - Math.cos(n.yaw) * REACH_M) <= HEEL && inFront(n, hx, hz);
}
/** Is he in front of the oxen of the cart at `n` (within `FRONT` of its heading, seen from the yoke)? */
function inFront(n: Pose, hx: number, hz: number): boolean {
  const fx = Math.sin(n.yaw);
  const fz = Math.cos(n.yaw);
  const vx = hx - (n.x + fx * REACH_M);
  const vz = hz - (n.z + fz * REACH_M);
  return vx * fx + vz * fz >= Math.hypot(vx, vz) * Math.cos(FRONT);
}
/**
 * A place to make for: one from which the way goes on toward him (tried as play would: `wayWorksFrom`), headed his way
 * as seen from the yoke — within `AIM`, or near him (yoke within `HEEL` + 1 m) within `FRONT_GOAL`: he well in front
 * of the oxen, where play waits (`atHeels`); after a plan that came to nothing, right at his heels.
 */
const planGoal = (ctx: Pick<RoamCtx, 'world'>, n: Pose): boolean =>
  (!search.strict || short(n) < 0.6) &&
  clearOfHimAt(n) &&
  Math.abs(angleDiff(towardHim(n), n.yaw)) <= (short(n) > HEEL - GAP + 1 ? AIM : FRONT_GOAL) &&
  wayWorksFrom(ctx, n);

/**
 * Are his feet well clear (`BODY_R` + 0.5 m) of the cart and its oxen at `n`? A way round never ends hugging him: he
 * would stand pinned in the corner between the cart's front and the oxen's flank, a log pile behind him.
 */
function clearOfHimAt(n: Pose): boolean {
  const fx = Math.sin(n.yaw);
  const fz = Math.cos(n.yaw);
  const r = BODY_R + 0.5;
  const cb: CartBox = { x: n.x, z: n.z, yaw: n.yaw, back: CART_BOX.back, front: CART_BOX.front, half: CART_BOX.half };
  const ob: CartBox = { x: n.x + fx * CART_YOKE, z: n.z + fz * CART_YOKE, yaw: n.yaw, back: OXEN_BOX.back, front: OXEN_BOX.front, half: OXEN_BOX.half };
  return !boxMeetsCircle(cb, search.him.x, search.him.z, r) && !boxMeetsCircle(ob, search.him.x, search.him.z, r);
}

/** The places one move from `n` (a turn either way, a roll on or back), each sub-step tested, none seen before. */
function children(ctx: Pick<RoamCtx, 'world'>, n: PlanNode, seen: Set<string>, moving: boolean): PlanNode[] {
  const out: PlanNode[] = [];
  const fx = Math.sin(n.yaw);
  const fz = Math.cos(n.yaw);
  // (each with how far it has backed in a row after it: a search that moves the cart keeps to `BACK_MOST`)
  const moves: [Step[], number, 'turn' | 'roll', number][] = [];
  for (const sgn of [1, -1]) {
    const subs: Pose[] = [];
    for (let k = 1; k * TURN_SUB <= TURN_MOVE + 1e-6; k++) subs.push({ x: n.x, z: n.z, yaw: n.yaw + sgn * k * TURN_SUB });
    moves.push([subs, COST.turn, 'turn', n.back]);
  }
  for (const dir of [1, -1]) {
    const subs: Pose[] = [];
    for (let d = FIT_STEP; d <= ROLL_MOVE + 1e-6; d += FIT_STEP) subs.push({ x: n.x + fx * d * dir, z: n.z + fz * d * dir, yaw: n.yaw });
    moves.push([subs, dir > 0 ? COST.on : COST.back, 'roll', dir > 0 ? n.back : n.back + ROLL_MOVE]);
  }
  // (back the way it came: the places it stood at before, in turn, two a move)
  if (n.hi !== undefined && n.hi > 0) {
    let i = n.hi - 1;
    // (the last place it stood at may be where it stands: from the one before)
    if (Math.hypot(hist[i].x - n.x, hist[i].z - n.z) < 0.05 && Math.abs(angleDiff(hist[i].yaw, n.yaw)) < 0.01) i--;
    const subs: Step[] = [];
    for (const end = i - 1; i >= Math.max(0, end); i--) subs.push({ ...hist[i], hi: i });
    if (subs.length) moves.push([subs, COST.back, 'roll', n.back + Math.hypot(subs[subs.length - 1].x - n.x, subs[subs.length - 1].z - n.z)]);
  }
  for (const [subs, cost, kind, back] of moves) {
    // (a move that backs it on past `BACK_MOST` is not made; turns and rolls on always are)
    if (moving && back > BACK_MOST + 1e-6 && back > n.back + 1e-6) continue;
    const end = subs[subs.length - 1] as Step;
    const key = poseKey(end);
    if (seen.has(key)) continue;
    seen.add(key);
    let ok = true;
    fitTag = moving ? 'search' : 'getOut';
    for (const sp of subs) if (!(ok = fitsMemo(ctx, sp.x, sp.z, sp.yaw, moving))) break;
    if (ok) out.push({ x: end.x, z: end.z, yaw: wrapYaw(end.yaw), g: n.g + cost, f: n.g + cost, parent: n, subs, kind, hi: end.hi, back });
  }
  return out;
}

/**
 * The oxen walk the cart round toward `want` (a heading), the cart turning on its wheels where it stands: sub-steps of
 * `TURN_SUB` (the oxen's far end moves under 0.2 m a sub-step), the near way round (or `sgn`), each where the cart fits
 * (`placeFits`) and its and the oxen's boxes keep `PIVOT_CLEAR` from his feet, up to `PIVOT_MOST`. Taken as a plan the
 * oxen walk (`planWalk`, every step tested again) when it turns `PIVOT_MIN` sub-steps at least: what it found, else
 * why not ('done' already headed so, 'him' he stands in its way, 'blocked' something else does).
 */
function pivotPlan(ctx: RoamCtx, want: number, sgn = 0, clear = PIVOT_CLEAR): 'turn' | 'done' | 'him' | 'blocked' {
  const d = angleDiff(want, CART_AT.yaw);
  if (Math.abs(d) < PIVOT_DONE) return 'done';
  const dir = sgn || Math.sign(d);
  const most = Math.min(PIVOT_MOST, dir === Math.sign(d) ? Math.abs(d) : 2 * Math.PI - Math.abs(d));
  // (its first sub-steps tested now; the rest as the oxen walk them, a sub-step a time — `planWalk`, which stops the
  // plan at the first that does not fit or comes too near him: no frame tests a whole turn at once)
  const yaws: number[] = [];
  for (let a = TURN_SUB; a <= most + 1e-6; a += TURN_SUB) yaws.push(CART_AT.yaw + dir * a);
  fitTag = 'pivot';
  for (let k = 0; k < PIVOT_MIN; k++) {
    if (k >= yaws.length) return 'blocked';
    if (!feetClear(CART_AT.x, CART_AT.z, yaws[k], himAt.x, himAt.z, clear)) return 'him';
    if (!placeFits(ctx, CART_AT.x, CART_AT.z, yaws[k], true)) return 'blocked';
  }
  search.on = false;
  walkPlan.steps.length = 0;
  for (const yaw of yaws) walkPlan.steps.push({ pose: { x: CART_AT.x, z: CART_AT.z, yaw }, time: SUB_TIME.turn });
  walkPlan.clear = clear;
  walkPlan.i = 0;
  walkPlan.t = 0;
  walkPlan.from.x = CART_AT.x;
  walkPlan.from.z = CART_AT.z;
  walkPlan.from.yaw = CART_AT.yaw;
  pivoting = true;
  console.info(`[haul] the oxen walk it round toward him: up to ${((yaws.length * TURN_SUB * 180) / Math.PI).toFixed(0)}° ${dir > 0 ? 'one way' : 'the other way'}`);
  return 'turn';
}
/**
 * About how far (rad, up to π) the cart could turn where it stands the way `sgn`: tested every `ROOM_STEP` only (to choose
 * the way round, a few tests in all; the turn itself is tested every sub-step as it is walked).
 */
const ROOM_STEP = 0.3;
function pivotRoom(ctx: RoamCtx, sgn: number): number {
  fitTag = 'room';
  let a = 0;
  while (a + ROOM_STEP <= Math.PI + 1e-6) {
    const yaw = CART_AT.yaw + sgn * (a + ROOM_STEP);
    if (!feetClear(CART_AT.x, CART_AT.z, yaw, himAt.x, himAt.z, ROUND_CLEAR) || !placeFits(ctx, CART_AT.x, CART_AT.z, yaw, true)) break;
    a += ROOM_STEP;
  }
  return a;
}
/** Are his feet (hx, hz) `r` clear of the cart's and the oxen's boxes, the cart at axle (ax, az) heading `yaw`? */
function feetClear(ax: number, az: number, yaw: number, hx: number, hz: number, r: number): boolean {
  if (!Number.isFinite(hx)) return true;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const cb: CartBox = { x: ax, z: az, yaw, back: CART_BOX.back, front: CART_BOX.front, half: CART_BOX.half };
  const ob: CartBox = { x: ax + fx * CART_YOKE, z: az + fz * CART_YOKE, yaw, back: OXEN_BOX.back, front: OXEN_BOX.front, half: OXEN_BOX.half };
  return !boxMeetsCircle(cb, hx, hz, r) && !boxMeetsCircle(ob, hx, hz, r);
}
/** The heading from the cart's axle toward (x, z). */
const fromAxle = (x: number, z: number): number => Math.atan2(x - CART_AT.x, z - CART_AT.z);

/** Start looking for a few moves that bring it round toward him (from where it stands). */
function planStart(ctx: RoamCtx, to?: { x: number; z: number }): void {
  search.on = true;
  memo.clear();
  search.him.x = to ? to.x : ctx.body.pos.x;
  search.him.z = to ? to.z : ctx.body.pos.z;
  search.from.x = ctx.body.pos.x;
  search.from.z = ctx.body.pos.z;
  search.open.length = 0;
  search.seen.clear();
  search.n = 0;
  search.t0 = performance.now();
  const root = rootNode();
  root.f = W_GUESS * guess(root);
  search.best = root;
  search.nearest = root;
  heapPush(search.open, root);
  search.seen.add(poseKey(root));
}

/** Look on (a few ms): a plan found (true), or still looking / none (false; `search.on` false once none). */
function planStep(ctx: RoamCtx): boolean {
  const t0 = performance.now();
  while (search.open.length && performance.now() - t0 < PLAN_MS) {
    // (the open place with the least cost and way to go, the way to go weighted: it makes for him first)
    const n = heapPop(search.open)!;
    if (n.parent && planGoal(ctx, n)) {
      planTake(n);
      return true;
    }
    if (++search.n > PLAN_NODES) break;
    for (const m of children(ctx, n, search.seen, true)) {
      m.f = m.g + W_GUESS * guess(m);
      if (guess(m) < guess(search.best!) && clearOfHimAt(m)) search.best = m;
      if (short(m) < short(search.nearest!)) search.nearest = m;
      heapPush(search.open, m);
    }
  }
  if (!search.open.length || search.n > PLAN_NODES) {
    const root = rootNode();
    // (no place to make for found within its reach — not that there is none: the place it reached that comes round
    // most toward him, if a good deal more, or the nearest to his heels, if a good way nearer (he may stand where a
    // cart cannot come); the oxen walk it, and look on from there. Never more backing than `BACK_MOST`.)
    const b = search.best;
    if (b && b.parent && guess(b) < guess(root) - PART_GAIN && clearOfHimAt(b)) {
      console.info(`[haul] a way round in part (${search.n} places looked at): it comes round ${((Math.abs(angleDiff(b.yaw, root.yaw)) * 180) / Math.PI).toFixed(0)}° and looks on from there`);
      planTake(b);
      return true;
    }
    const nb = search.nearest;
    if (nb && nb.parent && short(nb) < short(root) - 1.5) {
      planTake(nb);
      return true;
    }
    // (none: he walks round, or the oxen take it home: `stuckHere`)
    search.on = false;
    search.failedFor.x = search.him.x;
    search.failedFor.z = search.him.z;
    search.failedAt = performance.now();
    console.info(`[haul] no way round toward (${search.him.x.toFixed(1)}, ${search.him.z.toFixed(1)}): ${search.n} places looked at in ${((performance.now() - search.t0) / 1000).toFixed(1)} s`);
  }
  return false;
}

/** The plan found: its sub-steps, in order, to walk. */
function planTake(goal: PlanNode): void {
  search.on = false;
  const chain: PlanNode[] = [];
  for (let n: PlanNode | null = goal; n && n.parent; n = n.parent) chain.unshift(n);
  walkPlan.steps.length = 0;
  for (const n of chain) for (const sp of n.subs) walkPlan.steps.push({ pose: { x: sp.x, z: sp.z, yaw: sp.yaw, hi: sp.hi }, time: SUB_TIME[n.kind] });
  walkPlan.clear = 0;
  walkPlan.i = 0;
  walkPlan.t = 0;
  walkPlan.from.x = CART_AT.x;
  walkPlan.from.z = CART_AT.z;
  walkPlan.from.yaw = CART_AT.yaw;
  console.info(`[haul] a way round: ${chain.length} moves (${chain.filter((c) => c.kind === 'turn').length} turns), ${search.n} places looked at in ${((performance.now() - search.t0) / 1000).toFixed(1)} s`);
}

/**
 * The plan walked a step (the oxen turn or back the cart): its place moves only from one tested place to the next (a
 * cow come in the way since: it stops there). True while there is more of it.
 */
function planWalk(ctx: RoamCtx, dt: number): boolean {
  if (walkPlan.i >= walkPlan.steps.length) return false;
  walkPlan.t += dt;
  while (walkPlan.i < walkPlan.steps.length && walkPlan.t >= walkPlan.steps[walkPlan.i].time) {
    const st = walkPlan.steps[walkPlan.i];
    walkPlan.t -= st.time;
    fitTag = 'walk';
    if (!placeFits(ctx, st.pose.x, st.pose.z, st.pose.yaw, true) || (walkPlan.clear > 0 && !feetClear(st.pose.x, st.pose.z, st.pose.yaw, himAt.x, himAt.z, walkPlan.clear))) {
      walkPlan.steps.length = 0;
      walkPlan.i = 0;
      return false;
    }
    const was = { x: CART_AT.x, z: CART_AT.z, yaw: CART_AT.yaw };
    standAt(ctx, st.pose.x, st.pose.z, st.pose.yaw);
    // (backed while it comes round: `BACK_MOST`)
    const on = Math.sin(was.yaw) * (st.pose.x - was.x) + Math.cos(was.yaw) * (st.pose.z - was.z);
    if (on < -1e-6) {
      backed -= on;
      onRun = 0;
    }
    // (back where it stood before: what came after is undone; else a new place)
    if (st.pose.hi !== undefined) hist.length = st.pose.hi + 1;
    else histNote();
    P.wheel += (Math.hypot(st.pose.x - was.x, st.pose.z - was.z) * Math.sign(Math.sin(P.yaw) * (st.pose.x - was.x) + Math.cos(P.yaw) * (st.pose.z - was.z) || 1)) / (WHEEL_R * K) + Math.abs(angleDiff(st.pose.yaw, was.yaw)) * 2;
    walkPlan.i++;
  }
  if (walkPlan.i >= walkPlan.steps.length) {
    walkPlan.steps.length = 0;
    walkPlan.i = 0;
    blocked = false;
    // (a plan that took the cart a good way on — nearer him round something — is not one that came to nothing)
    const moved = Math.hypot(CART_AT.x - walkPlan.from.x, CART_AT.z - walkPlan.from.z) >= 1 || Math.abs(angleDiff(CART_AT.yaw, walkPlan.from.yaw)) >= 0.3;
    // (the cart got somewhere: getting nowhere again later is a new first time — the oxen look again, no slip yet)
    if (Math.hypot(CART_AT.x - walkPlan.from.x, CART_AT.z - walkPlan.from.z) >= 0.5 || Math.abs(angleDiff(CART_AT.yaw, walkPlan.from.yaw)) >= 0.3) nowhereTries = 0;
    planEnd.x = moved ? Number.NaN : CART_AT.x;
    planEnd.z = CART_AT.z;
    return false;
  }
  return true;
}
/** Where the last plan walked ended, and plans in a row that came to nothing (blocked again where they ended, the cart
 * not a metre on). */
const planEnd = { x: Number.NaN, z: Number.NaN };
let fruitless = 0;

/** Blocked before something: look for a few moves round (searching over frames), then walk them. True: busy with it. */
function getRound(ctx: RoamCtx, dt: number): boolean {
  if (walkPlan.steps.length) return planWalk(ctx, dt) || true;
  const p = ctx.body.pos;
  // (turning right round, he walked into them from in front: on, or done, or it cannot turn on — a way round)
  if (turnRound && !search.on) {
    const got = pivotPlan(ctx, turnRound.want, turnRound.sgn, ROUND_CLEAR);
    if (got === 'turn') return true;
    console.info(`[haul] turning round ${got === 'done' ? 'done' : `stops (${got})`}`);
    turnRound = null;
  }
  // (he beside or behind the oxen — he turned back the way he came — : they walk it round toward him where it stands,
  // as far as it goes clear of him and of everything; only when it cannot turn so do they look for a way round)
  if (!search.on && !inFront(CART_AT, p.x, p.z)) {
    const got = pivotPlan(ctx, fromAxle(p.x, p.z));
    if (got === 'turn') return true;
    if (got === 'done') pivoting = false;
  } else if (!search.on) pivoting = false;
  // (turned to him and nothing in the way, the rope not pulling: the way goes on, no search)
  if (!search.on && !blocked && taut <= TAUT_AFTER) return false;
  // (no way round for where he stood: not again until he has moved on a little — or, the rope taut or he beside the
  // oxen, `RETRY_AFTER` s on: the oxen try again)
  if (!search.on && Math.hypot(p.x - search.failedFor.x, p.z - search.failedFor.z) < 1.5) {
    if (taut <= TAUT_AFTER || performance.now() - search.failedAt < RETRY_AFTER * 1000) return false;
    search.failedFor.x = Number.NaN;
  }
  if (!search.on) {
    // (blocked again where the last way round ended, twice: no way round for where he stands)
    fruitless = Math.hypot(CART_AT.x - planEnd.x, CART_AT.z - planEnd.z) < 0.5 ? fruitless + 1 : 0;
    // (after one that came to nothing — he moved on as the oxen turned, the way blocked again a little on — the next
    // plan takes the cart right up to his heels)
    if (fruitless >= 3) {
      console.info(`[haul] three ways round in a row came to nothing at (${CART_AT.x.toFixed(1)}, ${CART_AT.z.toFixed(1)})`);
      fruitless = 0;
      search.failedFor.x = p.x;
      search.failedFor.z = p.z;
      search.failedAt = performance.now();
      return false;
    }
    planStart(ctx);
    search.strict = fruitless > 0;
  } else if (Math.hypot(p.x - search.from.x, p.z - search.from.z) > 3) planStart(ctx);
  planStep(ctx);
  return search.on || walkPlan.steps.length > 0;
}

/**
 * Is he getting nowhere: over the last `NOWHERE_WINDOW` s he has pushed on all the time (keys, stick or touch, however
 * he re-aims) and moved under `NOWHERE_HIM` m net, the cart under `NOWHERE_CART` m (and 0.1 rad), with no way round
 * being looked for or walked? Sampled every 0.25 s; moving on again forgets the tries.
 */
function nowhere(ctx: RoamCtx, dt: number): boolean {
  trackT += dt;
  if (walkPlan.steps.length || search.on) {
    track.length = 0;
    return false;
  }
  if (trackT < trackNext) return false;
  trackNext = trackT + 0.25;
  const p = ctx.body.pos;
  track.push({ t: trackT, x: p.x, z: p.z, cx: CART_AT.x, cz: CART_AT.z, cyaw: CART_AT.yaw, push: pushing });
  while (track.length > 1 && trackT - track[1].t >= NOWHERE_WINDOW) track.shift();
  const o = track[0];
  const full = trackT - o.t >= NOWHERE_WINDOW - 1e-6;
  const moved = Math.hypot(p.x - o.x, p.z - o.z) >= NOWHERE_HIM || Math.hypot(CART_AT.x - o.cx, CART_AT.z - o.cz) >= NOWHERE_CART || Math.abs(angleDiff(CART_AT.yaw, o.cyaw)) >= 0.1;
  if (full && moved) nowhereTries = 0;
  return full && !moved && track.every((s) => s.push);
}

/** Forget any search and plan (he let go, the way goes on by itself). */
function planClear(): void {
  if (search.on && search.n > 50) console.info(`[haul] a way round given up (it goes on): ${search.n} places looked at`);
  search.on = false;
  search.open.length = 0;
  search.seen.clear();
  search.failedFor.x = Number.NaN;
  planEnd.x = Number.NaN;
  fruitless = 0;
  walkPlan.steps.length = 0;
  walkPlan.i = 0;
  pivoting = false;
  turnRound = null;
}

// ── Stuck for good: the oxen take it home ──────────────────────────────────

/**
 * Is the cart stuck for good where it stands: two tries in a row from here that moved it under 0.5 m (each the oxen
 * looked for a way round toward him and found none: `getRound`)? Only then "Send the cart home".
 */
const stuckHere = (ctx: Pick<RoamCtx, 'world'>): boolean => cartAway() && stuckTries >= 2 && !canGetOut(ctx);

/**
 * Can the cart get anywhere from where it stands: a place, a few moves off (turns, rolls back or on), from which it
 * rolls on 2 m? Looked for a little each frame while he stands by the oxen (`FREE_NODES` places at most); while not
 * yet known, it can (he may lead it).
 */
const FREE_NODES = 500;
const free = { key: '', open: [] as PlanNode[], seen: new Set<string>(), n: 0, out: true, done: true };
function canGetOut(ctx: Pick<RoamCtx, 'world'>): boolean {
  const key = `${CART_AT.x.toFixed(2)},${CART_AT.z.toFixed(2)},${CART_AT.yaw.toFixed(3)}`;
  if (key !== free.key) {
    free.key = key;
    memo.clear();
    free.open = [rootNode()];
    free.seen.clear();
    free.n = 0;
    free.out = false;
    free.done = false;
  }
  const t0 = performance.now();
  while (!free.done && performance.now() - t0 < PLAN_MS) {
    if (!free.open.length || free.n++ > FREE_NODES) {
      free.done = true;
      break;
    }
    let bi = 0;
    for (let i = 1; i < free.open.length; i++) if (free.open[i].g < free.open[bi].g) bi = i;
    const n = free.open[bi];
    free.open[bi] = free.open[free.open.length - 1];
    free.open.pop();
    let rolls = true;
    fitTag = 'getOut';
    for (let d = FIT_STEP; d <= 2 + 1e-6 && rolls; d += FIT_STEP) rolls = placeFits(ctx, n.x + Math.sin(n.yaw) * d, n.z + Math.cos(n.yaw) * d, n.yaw, false);
    if (rolls) {
      free.out = true;
      free.done = true;
      break;
    }
    free.open.push(...children(ctx, n, free.seen, false));
  }
  return free.done ? free.out : true;
}

/** E at the oxen when it is stuck: they walk it home (a fade: they go the long way round), and it waits by his house. */
async function sendHome(ctx: RoamCtx): Promise<void> {
  if (sending || !env) return;
  sending = true;
  SFX.play('haulRope', 0.9);
  pad.rumble('tick', 0.35);
  try {
    if (!env.shot) await env.hud.fade(1, 0.6);
    const at = parkNearHome(ctx);
    if (at) {
      CART_AT.x = at.x;
      CART_AT.z = at.z;
      CART_AT.yaw = at.yaw;
      saveCartAt();
      placeAt(ctx);
    }
    stuckTries = 0;
    console.info(`[haul] the oxen took the cart home: at (${CART_AT.x.toFixed(1)}, ${CART_AT.z.toFixed(1)}), load ${JSON.stringify(CART_LOAD.all())}`);
    if (!env.shot) await env.hud.fade(0, 0.8);
    env.hud.toast(t('haulSentHome'));
  } finally {
    sending = false;
  }
}

/** Someone else has him now (a ride, the gathering, praying…): not the cart's own work. */
const othersHave = (): boolean => ADDONS.some((a) => a.id !== 'haul' && a.holding);

/** One step of leading: the way on to his feet, the cart along it, the rope's length. */
function lead(ctx: RoamCtx, dt: number): void {
  if (othersHave() || ctx.body.explorer.animator.posture || ctx.body.explorer.currentAction === 'pray') {
    letGo('haulLetGoToast');
    return;
  }
  himAt.x = ctx.body.pos.x;
  himAt.z = ctx.body.pos.z;
  wayOn(ctx);
  // (the way stopped short of him at something the cart cannot pass: it goes on up to its last point, then stands)
  const want = blocked ? wayEnd() : wayEnd() - GAP;
  const ahead = want - yokeS;
  const target = ahead > 0.02 ? Math.min(CATCH, OX_PACE * Math.min(1.35, 0.5 + ahead * 1.2)) : 0;
  speed += Math.max(-DECEL * dt, Math.min(ACCEL * dt, target - speed));
  if (speed < 0) speed = 0;
  let ds = Math.min(speed * dt, Math.max(0, ahead));
  if (ahead <= 0) speed = Math.max(0, speed - DECEL * dt);
  // (every placement it moves to is tested first, `FIT_STEP` m at a time: where it would not fit it stands; never past
  // the way's last point, where the way is not yet: there it waits for the way to go on)
  // (nor while the oxen walk a way round, or turn it right round: the way goes on after)
  if (walkPlan.steps.length || turnRound) ds = 0;
  while (fitS < yokeS + ds) {
    const next = fitS + FIT_STEP;
    if (next > wayEnd() + 1e-6) {
      ds = Math.max(0, fitS - yokeS);
      break;
    }
    fitTag = 'roll';
    let ok = fitsAt(ctx, next);
    if (ok) {
      fitTag = 'canMoveOn';
      ok = canMoveOn();
    }
    if (!ok) {
      ds = Math.max(0, fitS - yokeS);
      speed = 0;
      blocked = true;
      break;
    }
    fitS = next;
  }
  yokeS += ds;
  // (it has followed him on a good way: turning round is over, a new one may back again)
  if ((onRun += ds) >= BACK_RESET) backed = 0;
  P.wheel += ds / (WHEEL_R * K);
  if (ds > 0 || dirty) placeOnWay(ctx);
  // (stuck before something: a few moves round — a turn on the spot, backing up, a small three-point turn — found and
  // walked by the oxen, toward the free heading nearest his way, either way round; then the way goes on from there)
  turning = Math.max(0, turning - dt);
  // (blocked: the way stopped at something, or the cart cannot roll on along a way that goes on — a corner too tight)
  // (getting nowhere over `NOWHERE_WINDOW` s as he pushes on — `nowhere`: the first time the oxen look for a way round,
  // toward where he heads if he walks into them from in front; again, the rope slips, below)
  const b = ctx.body;
  const now = nowhere(ctx, dt);
  if (now && nowhereTries === 0) {
    nowhereTries = 1;
    track.length = 0;
    search.failedFor.x = Number.NaN;
    const into = inFront(CART_AT, b.pos.x, b.pos.z) && Math.cos(b.yaw - P.yaw) < -0.3;
    // (he walks into them from in front, back past them: they walk the cart round, to his side of their noses first,
    // else the other; else, as when he is beside them, a way round)
    // (the way round that turns it farther where it stands — his side first when both go right round)
    let side = Math.sin(P.yaw) * (b.pos.z - P.yz) - Math.cos(P.yaw) * (b.pos.x - P.yx) >= 0 ? -1 : 1;
    if (into && pivotRoom(ctx, -side) > pivotRoom(ctx, side) + TURN_SUB) side = -side;
    const w1 = into ? pivotPlan(ctx, CART_AT.yaw + Math.PI * side, side, ROUND_CLEAR) : 'done';
    const w2 = into && w1 !== 'turn' ? pivotPlan(ctx, CART_AT.yaw - Math.PI * side, -side, ROUND_CLEAR) : 'done';
    if (w1 === 'turn' || w2 === 'turn') {
      const sg = w1 === 'turn' ? side : -side;
      turnRound = { want: wrapYaw(CART_AT.yaw + Math.PI * sg), sgn: sg };
      console.info(`[haul] getting nowhere ${NOWHERE_WINDOW} s: he walks into the oxen, they walk the cart right round`);
    }
    else {
      if (into) console.info(`[haul] he walks into the oxen: they cannot walk the cart round where it stands (${w1}, ${w2})`);
      planStart(ctx, into ? { x: b.pos.x + Math.sin(b.yaw) * INTO_AHEAD, z: b.pos.z + Math.cos(b.yaw) * INTO_AHEAD } : undefined);
      search.strict = false;
      console.info(`[haul] getting nowhere ${NOWHERE_WINDOW} s: the oxen look for a way round toward (${search.him.x.toFixed(1)}, ${search.him.z.toFixed(1)})${into ? ', where he heads' : ''}`);
    }
  }
  // (blocked at his heels — the yoke within `HEEL` of his feet, he in front of the oxen — it waits; beside or behind
  // them (he turned back the way he came) the oxen bring it round; and the rope taut a while with the cart standing,
  // blocked or not, they look for a way round too: never a silent wait)
  if (walkPlan.steps.length || search.on || (blocked && ds <= 1e-4 && !atHeels(CART_AT, ctx.body.pos.x, ctx.body.pos.z)) || taut > TAUT_AFTER || (ds <= 1e-4 && (turnRound !== null || (pivoting && !inFront(CART_AT, ctx.body.pos.x, ctx.body.pos.z))))) {
    if (getRound(ctx, dt)) {
      turning = 0.3;
      speed = 0;
    }
  } else if (ds > 0.02) planClear();
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
  // The rope: he can walk no farther from the oxen's noses than `ROPE_HOLD` (held back, as by a rope: he waits while
  // they come round); where they cannot come round at all (no way round for where he stands) and he pulls, or should
  // something put him far off (a fall), it slips from his hand.
  hand(_h);
  nose(_n);
  const far = Math.hypot(ctx.body.pos.x - _n.x, ctx.body.pos.z - _n.z);
  // (he pulls at the rope and the cart stands: `taut`; getting nowhere for a while so, a way round or not: as no way;
  // and the cart standing with him beside or behind the oxen, the rope slack or not, as `taut` too: they turn to him)
  const pulling = ds <= 1e-4 && !walkPlan.steps.length && far > ROPE_HOLD - 0.3;
  ropeFar = far;
  taut = (pulling || (ds <= 1e-4 && !walkPlan.steps.length && !inFront(CART_AT, ctx.body.pos.x, ctx.body.pos.z))) && !search.on ? taut + dt : 0;
  stuckFor = pulling && !search.on ? stuckFor + dt : 0;
  const noWay = ((blocked || pulling) && !search.on && !walkPlan.steps.length && Math.hypot(ctx.body.pos.x - search.failedFor.x, ctx.body.pos.z - search.failedFor.z) < 1.5) || stuckFor > STUCK_AFTER;
  // (no way round for where he stands: the rope pays out as he walks on — round the thing, somewhere the oxen can come
  // (the search tries again once he is 1.5 m on) — and slips only at its length; a way found, it is taken in again as
  // he comes nearer, never pulling him back)
  slack = noWay ? Math.max(slack, far) : Math.max(ROPE_HOLD, Math.min(slack, far));
  // (getting nowhere again after the oxen looked for a way round — held in a corner, no way for them: never a silent
  // wait, the rope slips and says why)
  if (now && nowhereTries > 0 && !search.on && !walkPlan.steps.length) {
    console.info(`[haul] rope: getting nowhere ${NOWHERE_WINDOW} s again after a way round was looked for, him ${far.toFixed(1)} m off`);
    letGo('haulStuck');
    return;
  }
  if (_h.distanceTo(_n) > ROPE_MAX) {
    console.info(`[haul] rope: ${noWay ? (stuckFor > STUCK_AFTER ? `stuck ${stuckFor.toFixed(1)} s` : `no way round for (${search.failedFor.x.toFixed(1)}, ${search.failedFor.z.toFixed(1)})`) : 'too far'}, him ${far.toFixed(1)} m off`);
    letGo(noWay || blocked ? 'haulStuck' : 'haulLetGoToast');
    return;
  }
  if (far > slack) {
    const k = slack / far;
    const p = ctx.body.pos;
    p.x = _n.x + (p.x - _n.x) * k;
    p.z = _n.z + (p.z - _n.z) * k;
    // (and none of his speed away from them)
    const ux = (p.x - _n.x) / slack;
    const uz = (p.z - _n.z) / slack;
    const v = ctx.body.vel;
    const out = v.x * ux + v.z * uz;
    if (out > 0) {
      v.x -= ux * out;
      v.z -= uz * out;
    }
  }
  if ((saveWait -= dt) <= 0) {
    saveWait = SAVE_EVERY;
    // (kept where it was last tested to fit, the drawn place left as it is)
    const s = snapS();
    if (s < yokeS - 1e-6) {
      const was = yokeS;
      yokeS = s;
      placeOnWay(ctx);
      saveCartAt();
      yokeS = was;
      placeOnWay(ctx);
    } else saveCartAt();
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

// ── Its badge on the big map ("My ox cart") ────────────────────────────────

/** The two badges the big map's scale is read from (as his bicycle's: roam/_bikeShop.ts `placeBigBadge`). */
const REF_A = MAP_SPOTS.find((m) => m.id === 'back-hamlet');
const REF_B = MAP_SPOTS.find((m) => m.id === 'east-village');
/** Where the badge was last put (x, z, shown), NaN: not yet. */
const badge = { x: Number.NaN, z: Number.NaN, on: false };

/**
 * The big map's "My ox cart" badge (ui/_minimapSpots.ts `my-cart`: the mini-map reads its place each frame; the big map
 * placed its button once): moved to where the cart stands, hidden by the house, while he leads it, before the house
 * is his. Its name only while it is pointed at or the target (the market's and the village's names are near). False:
 * the big map is not made yet.
 */
function placeBigBadge(): boolean {
  if (typeof document === 'undefined') return true;
  const btn = document.querySelector<HTMLElement>(".mm-spot[data-id='my-cart']");
  if (!btn) return false;
  if (!document.getElementById('haul-bigmap-style')) {
    const st = document.createElement('style');
    st.id = 'haul-bigmap-style';
    st.textContent = `.mm-spot[data-id='my-cart']:not(:hover, :focus-visible, .is-target) .mm-place-label { display: none; }`;
    document.head.append(st);
  }
  btn.hidden = !(HOME.owned && cartAway());
  if (btn.hidden) return true;
  const a = document.querySelector<HTMLElement>(".mm-spot[data-id='back-hamlet']");
  const b = document.querySelector<HTMLElement>(".mm-spot[data-id='east-village']");
  if (!a || !b || !REF_A || !REF_B) return false;
  const ax = parseFloat(a.style.left);
  const az = parseFloat(a.style.top);
  const bx = parseFloat(b.style.left);
  const bz = parseFloat(b.style.top);
  if (![ax, az, bx, bz].every(Number.isFinite) || REF_A.bx === REF_B.bx || REF_A.bz === REF_B.bz) return false;
  btn.style.left = `${(ax + ((CART_AT.x - REF_A.bx) * (bx - ax)) / (REF_B.bx - REF_A.bx)).toFixed(3)}%`;
  btn.style.top = `${(az + ((CART_AT.z - REF_A.bz) * (bz - az)) / (REF_B.bz - REF_A.bz)).toFixed(3)}%`;
  return true;
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

/** At the oxen (`nearHead`): "Lead the ox cart" (from beside them, said so, when before them is water), or "Send it home". */
function headOffer(ctx: RoamCtx): string | null {
  if (!nearHead(ctx)) return null;
  if (stuckHere(ctx)) return words('sendHome', () => `E  ${t('haulSendHome')}`);
  return ropeSide ? words('leadSide', () => `E  ${t('haulLeadSide')}`) : words('lead', () => `E  ${t('haulLead')}`);
}
function headUse(ctx: RoamCtx): void {
  if (!nearHead(ctx) || sending) return;
  if (stuckHere(ctx)) void sendHome(ctx);
  else takeRope(ctx);
}
/** Does he face the oxen (within 60°, from where he stands to the yoke)? */
function facesOxen(ctx: RoamCtx): boolean {
  const b = ctx.body;
  const dx = P.yx - b.pos.x;
  const dz = P.yz - b.pos.z;
  return Math.sin(b.yaw) * dx + Math.cos(b.yaw) * dz >= Math.hypot(dx, dz) * 0.5;
}

/**
 * The rope, first in the E row (`order` 44, before a cow to ride or the garden): at the oxen's own spot, facing them,
 * E takes it; while he leads, E lets go — whatever else is near. Everything else of the cart is the add-on below.
 */
registerAddon({
  id: 'haulRope',
  order: 44,
  offer(ctx, mode) {
    if (mode !== 'walk' || !env || W || sending || !HOME.owned) return null;
    if (leading) return words('letgo', () => `E  ${t('haulLetGo')}`);
    if (env.busy() || !ctx.body.grounded || !facesOxen(ctx)) return null;
    return headOffer(ctx);
  },
  use(ctx) {
    if (!env || W) return;
    if (leading) letGo('haulLetGoToast');
    else headUse(ctx);
  },
});

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
    // (its saved place is checked once he walks, when the walk map is whole: `checkPlace`)
    placeAt(e);
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
            round: { searching: search.on, looked: search.n, open: search.open.length, failedFor: [search.failedFor.x, search.failedFor.z], plan: walkPlan.steps.length, at: walkPlan.i, fruitless, stuckFor: +stuckFor.toFixed(2), nowhere: { tries: nowhereTries, samples: track.length, push: pushing }, backed: +backed.toFixed(2), taut: +taut.toFixed(2), rope: +ropeFar.toFixed(2) },
            fit: { n: FIT.n, avgMs: FIT.n ? +(FIT.ms / FIT.n).toFixed(4) : 0, worstMs: +FIT.worst.toFixed(3), by: { ...FIT.by } },
          }),
          /** Could the cart stand where it is now, or at (x, z) heading `yaw` degrees (its whole boxes, as a saved place is checked)? */
          fits: (x?: number, z?: number, yaw?: number) => standsAt(e, x === undefined || z === undefined ? CART_AT : { x, z, yaw: ((yaw ?? 0) * Math.PI) / 180 }),
          /** Why the cart could not stand at (x, z) heading `yaw` degrees: the first part of the rule that fails, or null. */
          whyNot: (x: number, z: number, yaw = 0) => {
            const r = (yaw * Math.PI) / 180;
            const dx = Math.sin(r);
            const dz = Math.cos(r);
            for (const [nm, d] of [['tail', CART_BOX.back], ['axle', 0], ['oxen', CART_YOKE - OX_BACK * K], ['yoke', CART_YOKE]] as const) {
              const px = x + dx * d;
              const pz = z + dz * d;
              if (Number.isNaN(passable(e, px, pz, dx, dz, e.world.field.heightAt(px, pz)))) return `land at the ${nm} (${px.toFixed(1)}, ${pz.toFixed(1)})`;
            }
            let y = e.world.field.heightAt(x + dx * CART_YOKE, z + dz * CART_YOKE);
            for (const d of OX_FRONT) {
              y = passable(e, x + dx * (CART_YOKE + d), z + dz * (CART_YOKE + d), dx, dz, y);
              if (Number.isNaN(y)) return `land under the oxen's fronts (${(x + dx * (CART_YOKE + d)).toFixed(1)}, ${(z + dz * (CART_YOKE + d)).toFixed(1)})`;
            }
            const cb: CartBox = { x, z, yaw: r, back: CART_BOX.back, front: CART_BOX.front, half: CART_BOX.half };
            const ob: CartBox = { x: x + dx * CART_YOKE, z: z + dz * CART_YOKE, yaw: r, back: OXEN_BOX.back, front: OXEN_BOX.front, half: OXEN_BOX.half };
            for (const [nm, b] of [['cart', cb], ['oxen', ob]] as const) {
              if (builtInBox(b)) return `${nm}: a piece he built`;
              if (stakeInBox(b)) return `${nm}: a stake in use`;
              if (blocksInBox(e.world, b)) return `${nm}: his blocks`;
              if (worldInBox(e.world, b)) return `${nm}: the map (walk map) in the box`;
            }
            return null;
          },
          /**
           * Checks: the way round the oxen would find for the cart at (cx, cz) heading `cyaw`° with him at (hx, hz) (aimed
           * at `to` if given), searched to the end at once: found or not, places looked at, fit tests, time, its moves, how
           * far it backs at most (along the first heading) and how far it turns. Nothing of the live cart changes.
           */
          probe: (cx: number, cz: number, cyaw: number, hx: number, hz: number, opt: { backed?: number; to?: [number, number] } = {}) => {
            const keep = { x: CART_AT.x, z: CART_AT.z, yaw: CART_AT.yaw, backed, hist: hist.slice(), him: { ...himAt } };
            const fit0 = FIT.n;
            CART_AT.x = cx;
            CART_AT.z = cz;
            CART_AT.yaw = (cyaw * Math.PI) / 180;
            hist.length = 0;
            backed = opt.backed ?? 0;
            himAt.x = hx;
            himAt.z = hz;
            const pctx = { world: e.world, body: { pos: { x: hx, z: hz } } } as unknown as RoamCtx;
            const t0 = performance.now();
            planClear();
            planStart(pctx, opt.to ? { x: opt.to[0], z: opt.to[1] } : undefined);
            let guard = 0;
            while (search.on && !walkPlan.steps.length && guard++ < 10000) planStep(pctx);
            const ms = performance.now() - t0;
            const steps = walkPlan.steps.map((s) => s.pose);
            const y0 = CART_AT.yaw;
            let maxBack = 0;
            for (const st of steps) maxBack = Math.max(maxBack, -((st.x - cx) * Math.sin(y0) + (st.z - cz) * Math.cos(y0)));
            const end = steps[steps.length - 1];
            const out = {
              found: steps.length > 0,
              looked: search.n,
              fits: FIT.n - fit0,
              ms: +ms.toFixed(1),
              steps: steps.length,
              maxBack: +maxBack.toFixed(2),
              turned: end ? +((Math.abs(angleDiff(end.yaw, y0)) * 180) / Math.PI).toFixed(1) : 0,
              end: end ? [+end.x.toFixed(2), +end.z.toFixed(2), +((end.yaw * 180) / Math.PI).toFixed(1)] : null,
            };
            planClear();
            CART_AT.x = keep.x;
            CART_AT.z = keep.z;
            CART_AT.yaw = keep.yaw;
            backed = keep.backed;
            hist.length = 0;
            hist.push(...keep.hist);
            himAt.x = keep.him.x;
            himAt.z = keep.him.z;
            return out;
          },
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
    // (his own push, before it is brought to the oxen's pace: `nowhere`)
    pushing = Math.hypot(ctx.input.move.x, ctx.input.move.y) > 0.5;
    const k = OX_PACE / (WALK_SPEED * ctx.body.scale * WALK_PACE);
    ctx.input.move.x *= k;
    ctx.input.move.y *= k;
    ctx.input.run = false;
    return false;
  },

  offer(ctx, mode) {
    if (mode !== 'walk' || !env || W || sending || !HOME.owned) return null;
    if (leading) return words('letgo', () => `E  ${t('haulLetGo')}`);
    if (env.busy() || !ctx.body.grounded) return null;
    if (nearTail(ctx)) {
      if (atHome() && !CART_LOAD.empty) return counted('haulUnload', true);
      if (!BAG.empty) return canLoad() ? counted('haulLoad', true) : counted('haulFull', false);
      if (!CART_LOAD.empty) return counted('haulGoHome', false);
      return null;
    }
    return headOffer(ctx);
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
    headUse(ctx);
  },

  hold(ctx, dt) {
    return hold(ctx, dt);
  },

  after(ctx, mode, dt) {
    if (mode !== 'walk' || !env) return;
    seenAt.x = ctx.body.pos.x;
    seenAt.z = ctx.body.pos.z;
    if (!placeChecked) checkPlace(ctx);
    if (leading) {
      lead(ctx, dt);
      // (the camera far enough out behind him to see the oxen and the cart)
      if (leading && !ctx.input.zoom && ctx.cam.distance < LEAD_DIST) ctx.cam.distance += (LEAD_DIST - ctx.cam.distance) * damp(1.5, dt);
    }
    // On foot, he keeps out of the cart and the oxen (they are not on the walk map): eased out to the nearest side.
    if (W || !ctx.body.grounded || ctx.body.explorer.animator.posture) return;
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
    // (the big map's badge where the cart was left: only when that changed)
    const on = HOME.owned && cartAway();
    if ((on !== badge.on || (on && (CART_AT.x !== badge.x || CART_AT.z !== badge.z))) && placeBigBadge()) {
      badge.on = on;
      badge.x = CART_AT.x;
      badge.z = CART_AT.z;
    }
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
    const walking = speed > 0.05 || turning > 0;
    const gv = Math.max(speed, turning > 0 ? 0.7 : 0);
    const g = walking ? oxGait(gv, K, 1.3, 2.3) : 0;
    const hz = walking ? oxHz(g, gv, K) : 0.5;
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
