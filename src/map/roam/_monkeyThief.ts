import { Vector3 } from 'three';
import type { AngkorExplorer } from '../../character/AngkorExplorer';
import { isMeal, MEAL, mealStage, type MealAction } from '../../character/meals';
import { FOOD_STAGES, isFoodKind, type FoodKind } from '../../character/parts/food';
import '../audio/_monkey';
import { SFX } from '../audio/addonSfx';
import { EVENTS } from '../events';
import type { Activity, Agent } from '../fauna/_landBrain';
import { borrow, giveBack, THIEF, thiefHand, type ThiefFood } from '../fauna/_landMacaque';
import { GREET } from '../greet';
import { pad } from '../pad/pad';
import { SHOPS } from '../shop';
import type { Lang, MapFrame, RoamMode } from '../types';
import { lang, t } from '../ui/lang';
import { addonBusy, registerAddon, type AddonEnv } from './_addons';
import { meals } from './_shop';
import { nameOf } from './_shopPurse';
import { angleDiff } from './followCam';
import type { RoamCtx } from './types';

/**
 * Monkeys steal his snack. The long-tailed macaques of the temple troops
 * (fauna/land.ts, _landMacaque.ts) know a snack when they see one: when he
 * eats or drinks near a troop (from a stall, or from his bag: key 6), one
 * bold macaque may come for it — fruit, sweets and skewers most of all, a
 * drink now and then, never what is in his bag, only what is in his hands.
 *
 * 1. It **watches** him (up on its feet, head high), **creeps** closer, low,
 *    then **dashes** in, leaps up and **snatches** it from his hands: his
 *    meal stops there (_shop.ts `meals.snatch`, as the stick stops it), the
 *    snack is in the monkey's hands (the same thing, as far eaten as it was),
 *    and he jumps back a little with a surprised face and a "hey!"; a toast
 *    says what it took ("ស្វាឆក់យកចេកណាំវ៉ារបស់អ្នកបាត់ហើយ!" / "A monkey stole
 *    your bananas!").
 * 2. It **runs off** on three legs, the snack under its chin, to a wall or a
 *    ledge near its troop, **leaps up** on it, sits and **eats** it there,
 *    looking back at him, chattering now and then (if he comes up after it,
 *    it scampers off a little further). Then it hops down and ambles back to
 *    its troop. No ledge near: it sits and eats a little way off.
 * 3. If his snack is gone before it gets there (he ate it up, or stopped
 *    eating), it gives up; walking straight at it, it **backs off**.
 * 4. **F** (greet) at a macaque: it chatters back, up on its feet with a hop.
 *
 * Not every time: each meal near a troop it may come (`TEMPT` by what it
 * is), the more likely the longer he has eaten near them (`nearEat`); at
 * most once every few minutes (`COOLDOWN`). Never at night (they sleep) or in
 * a storm (they huddle), never in the boat, on a ride or up where they do
 * not go (he must stand on their ground: the temples' floors and paving).
 * It keeps to the troop's own way of moving: on their ground, steps no
 * higher than they climb (never through a wall: round it by a turning point),
 * clear of him; up a wall only with a leap.
 *
 * The add-on drives the macaque (every roaming step: shots replay it with
 * `sim=`); the fauna part puts it on the map with the snack in its hands
 * (_landMacaque.ts `THIEF`). The camera comes round to the side of the line
 * between him and the monkey, looking between them, so both show while it
 * comes, snatches and runs off (not with the URL's `rcam`); it eases back to
 * him once the monkey has eaten a while, or he moves, or the player turns it.
 *
 * URL (checks): `monkey=steal` the nearest troop's boldest macaque comes for
 * what he eats now (with `bought=<item>`, _shop.ts, or `act=eat&food=<kind>`)
 * at `at=` (`sim=_:<s>` that far in; at Angkor Wat from `at=3,-153&yaw=180`:
 * watching to 0.7, creeping to 2.1, the dash, the snatch at 3.5, running off
 * to 7.1, up on the moat's wall at 7.7, eating there till 20) ·
 * `monkey=feast:<item>` a macaque up on the wall
 * nearest him eating that (a shop item, `shop:item`, or a food kind; a bug
 * report gives this) · `monkey=always` comes at every meal near a troop (no
 * chance, no wait) · `monkey=0` never. `window.__monkeys.state` (checks).
 */

// ── Tuning ──────────────────────────────────────────────────────────────────

/** How tempting each kind is (a share of the chance): fruit, sweets and skewers most, a drink sometimes. */
const TEMPT: Record<FoodKind, number> = { fruit: 1, sweet: 0.95, skewer: 0.9, riceBowl: 0.6, noodles: 0.5, coconut: 0.35, cupDrink: 0.3, bagDrink: 0.3, bottle: 0.2 };
/** The chance a meal near them: `TEMPT` × (BASE + GROW × seconds he has eaten near them), at most `MAX_CHANCE`. */
const BASE = 0.3;
const GROW = 0.045;
const MAX_CHANCE = 0.85;
/** A troop within this of him (m) counts as near; the thief comes from no further (m, its way in). */
const NEAR = 16;
const REACH = 13;
/** At most one theft in this long (s); after one that came to nothing, this long. */
const COOLDOWN = 180;
const COOLDOWN_MISS = 40;
/** Nights and storms: they sleep or huddle. */
const NIGHT = 0.5;
const STORM = 0.4;
/**
 * It means to have the snack this far into his meal (s), while some of it is left (a portion, a piece, a sip or two:
 * parts/food.ts's stages; a skewer before his second bite, which leaves the bare stick); at the latest (it came late)
 * `LATE` s before the meal's things go. A bare stick (`EMPTY`) it does not take.
 */
const GRAB_BY: Record<MealAction, number> = { eat: 3.5, bite: 2.2, drink: 3.1 };
const LATE = 0.25;
const EMPTY: Partial<Record<FoodKind, number>> = { skewer: 2 };
/** Speeds (m/s): creeping, a dash (from, to), its walk and gallop (the troops'), the steps a second at each. */
const CREEP = 0.7;
const DASH = [3.4, 5.6] as const;
const WALK = 0.9;
const RUN = 3.8;
const WALK_HZ = 1.8;
const RUN_HZ = 3.4;
/** The leap at his hands: up to them (s), and down again. */
const LEAP_UP = 0.24;
const LEAP_DOWN = 0.28;
/** Where it leaps from: this far from his middle (m, at his roaming size), in front of him (radians either side of his facing). */
const TAKEOFF = 0.95;
const FRONT = 1.35;
/** Eating up on its wall (s), and what is left at the end shrinks away over this share. */
const FEAST = 12;
const GONE = 0.15;
/** He comes this near (m) while it eats: it scolds him; nearer still, it moves off. */
const SCOLD = 3.2;
const SHOO = 1.9;
/** His reaction: the surprised face (s), his turn to watch it go (s), the hop back (m/s up and back). */
const FACE_FOR = 1.8;
const WATCH_IT = 1.6;
const HOP_UP = 3.3;
const HOP_BACK = 2.1;
/**
 * The camera while it comes and goes: from the side of the line between him and the monkey (both in view, his face
 * in profile), looking at a point `share` of the way from him to it, as far off as they are apart (`near` + `per`
 * × m, within `min`‥`max`), a little from above. Once it climbs up to eat, on the monkey (`up`: from his way,
 * `side` radians off the line, near it and a little zoomed in: `fov`°), as he sees it. Easing there at `rate` (1/s),
 * and back to him at `back` (1/s) once it has eaten a while (`holdFeast` s), or he moves, or the player turns it.
 */
const CAM = {
  share: 0.45,
  near: 3.2,
  per: 0.75,
  min: 5.2,
  max: 11.5,
  pitch: 0.2,
  up: { side: 0.3, share: 0.82, near: 4.2, per: 0.08, min: 4.5, max: 6, pitch: 0.06, fov: 42 },
  rate: 2.2,
  back: 2.5,
  holdFeast: 3,
};
/** The way in and out must stay this clear of his middle (m). */
const CLEAR = 0.65;

type Phase = 'off' | 'watch' | 'creep' | 'dash' | 'leap' | 'escape' | 'climb' | 'settle' | 'feast' | 'finish' | 'down' | 'home' | 'backoff' | 'sulk' | 'answer';
/** Before the grab: his snack is still his. */
const BEFORE: ReadonlySet<Phase> = new Set<Phase>(['watch', 'creep', 'dash']);

// ── State ───────────────────────────────────────────────────────────────────

let env: AddonEnv | null = null;
let explorer: AngkorExplorer | null = null;
/** Off by the URL (`monkey=0`), or at every meal (`monkey=always`). */
let off = false;
let always = false;
/** The add-on's own clock (s of roaming steps: shots step it too). */
let clock = 0;
/** Seconds he has eaten with a troop near; when the last theft (or try) was; the meal last looked at. */
let nearEat = 0;
let nextAt = 0;
let mealSeen: object | null = null;
let mealWas = false;
let night = 0;
/** The greeting last answered (greet.ts `GREET.n`); the URL's theft waits for his meal until then (s, `clock`; −1: none). */
let greetSeen = 0;
let forceAt = -1;

let phase: Phase = 'off';
/** Seconds in this phase, and since the scene began. */
let pt = 0;
let st = 0;
let ag: Agent | null = null;
/** What it took (or will take): the food, its name for the toast, the URL id for a report. */
let food: ThiefFood | null = null;
let foodId = '';
let foodName = '';
let stage0 = 0;
/** The way in: watching (s), how far it creeps (m), its dash (m/s). */
let watchFor = 0.6;
let creepFor = 0;
let dashSpeed = 4;
/** Where it leaps from and lands, and the root at the grab (m); on the way down, with the snack or not. */
const takeoff = new Vector3();
const land = new Vector3();
const apex = new Vector3();
let leapDown = false;
let got = false;
/** The way out: the foot of its wall, the seat up on it (or a spot on the ground), climbed or not; a turning point on the way there. */
const foot = new Vector3();
const seat = new Vector3();
let climbs = false;
const via = new Vector3();
let hasVia = false;
const _via = new Vector3();
/** A leap (arc) between two points, and how high over the straight line. */
const arcA = new Vector3();
const arcB = new Vector3();
let arcFor = 0.5;
let arcUp = 0.4;
/** Running somewhere on the ground: the target, then what next. */
const goal = new Vector3();
/** Home: where it goes back to its troop. */
const home = new Vector3();
/** His reaction: until when the surprised face holds, he turns to watch it, his "hey!"; the face is ours to let go. */
let faceUntil = -1;
let faceOurs = false;
let watchUntil = -1;
let heyAt = -1;
/** The camera: steering it now (the URL's `rcam` holds it: never), letting go, its side, our eased orbit and focus share. */
let steer = false;
let camOut = false;
let keepView = false;
let camSide = 1;
let camYaw = 0;
let camPitch = 0;
let camDist = 0;
let camK = 0;
let lookAt = 0;
/** Chatters: when next while it eats, the last scold. */
let chatterAt = 0;
let scoldAt = -1e9;
/** Glancing aside while it eats: the head's turn and when it changes; when it answered his greeting (s into the feast). */
let glance = 0;
let glanceAt = 0;
let answeredAt = -9;

const _v = new Vector3();
const _w = new Vector3();
const _hand = new Vector3();

// ── Small helpers ───────────────────────────────────────────────────────────

/** Where it may stand (sit, leap from, land), and the top underfoot on its way (_landMacaque.ts `THIEF`). */
const G = (x: number, z: number): number => THIEF.ground?.(x, z) ?? Number.NaN;
const W = (x: number, z: number): number => THIEF.path?.(x, z) ?? Number.NaN;
const len = (x: number, z: number): number => Math.sqrt(x * x + z * z);
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v: number): number => {
  const c = clamp01(v);
  return c * c * (3 - 2 * c);
};
/** Random in live play; in shots always the middle (the same picture every time). */
const rand = (): number => (env?.shot ? 0.5 : Math.random());

/** Straight from (ax, az) at feet height `ay` to (bx, bz) on their way, no step higher than they climb (as the troops walk: _landBrain.ts `walkable`). */
function walkable(ax: number, az: number, ay: number, bx: number, bz: number): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const n = Math.max(1, Math.ceil(len(dx, dz) / 0.35));
  // (sampled finely, so no wall slips between two samples; no more than `climb` over two of them either)
  let last = ay;
  let before = ay;
  for (let k = 1; k <= n; k++) {
    const g = W(ax + (dx * k) / n, az + (dz * k) / n);
    if (!(Math.abs(g - last) <= THIEF.climb && Math.abs(g - before) <= THIEF.climb)) return false;
    before = last;
    last = g;
  }
  return true;
}

/** The way a → b keeps clear of him at (px, pz): never nearer than `CLEAR` (`more` m more), or than it starts (it may start by him, going away). */
function clearOf(ax: number, az: number, bx: number, bz: number, px: number, pz: number, more = 0): boolean {
  return segDist(ax, az, bx, bz, px, pz) >= Math.min(CLEAR + more, len(ax - px, az - pz) - 0.05);
}

/**
 * A way from (ax, az) at feet height `ay` to (bx, bz) clear of him at (px, pz): straight (1), or round something
 * by a turning point (2: into `via`, a few metres to one side of the straight way), or none (0).
 */
function wayTo(ax: number, az: number, ay: number, bx: number, bz: number, px: number, pz: number, via: Vector3): 0 | 1 | 2 {
  if (clearOf(ax, az, bx, bz, px, pz, 0.2) && walkable(ax, az, ay, bx, bz)) return 1;
  const dx = bx - ax;
  const dz = bz - az;
  const d = len(dx, dz) || 1;
  for (const off of [2, -2, 3.5, -3.5, 5, -5])
    for (const at of [0.5, 0.3, 0.7]) {
      const mx = ax + dx * at + (-dz / d) * off;
      const mz = az + dz * at + (dx / d) * off;
      const my = G(mx, mz);
      if (Number.isNaN(my) || !clearOf(ax, az, mx, mz, px, pz, 0.2) || !clearOf(mx, mz, bx, bz, px, pz, 0.2)) continue;
      if (!walkable(ax, az, ay, mx, mz) || !walkable(mx, mz, my, bx, bz)) continue;
      via.set(mx, my, mz);
      return 2;
    }
  return 0;
}

/** Nearest the segment a → b comes to (px, pz) (m). */
function segDist(ax: number, az: number, bx: number, bz: number, px: number, pz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const u = l2 > 1e-9 ? clamp01(((px - ax) * dx + (pz - az) * dz) / l2) : 0;
  return len(ax + dx * u - px, az + dz * u - pz);
}

/** The pose this step (the fauna part puts it on the map: _landMacaque.ts `THIEF.pose`). */
function pose(x: number, y: number, z: number, yaw: number, gait: number, rest: number, head: number, turn: number, act: number): void {
  const p = THIEF.pose;
  const k = 1 / Math.sqrt(ag?.scale ?? 1);
  p.x = x;
  p.y = y;
  p.z = z;
  p.yaw = yaw;
  p.gait = gait;
  p.hz = (gait === 2 ? RUN_HZ : WALK_HZ) * k;
  p.rest = rest;
  p.head = head;
  p.turn = turn;
  p.act = act;
}

/** Turn `from` towards `to` by at most `k` (radians; the result in −π‥π). */
function turnTo(from: number, to: number, k: number): number {
  const d = angleDiff(to, from);
  const a = from + Math.max(-k, Math.min(k, d));
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Run or walk towards (tx, tz) along a straight way checked beforehand; false once there. */
function go(tx: number, tz: number, speed: number, dt: number): boolean {
  const p = THIEF.pose;
  const dx = tx - p.x;
  const dz = tz - p.z;
  const d = len(dx, dz);
  if (d < 0.06) return false;
  const want = Math.atan2(dx, dz);
  p.yaw = turnTo(p.yaw, want, 9 * dt);
  // (turning round first: slower until it faces the way)
  const step = Math.min(d, speed * dt * Math.max(0.25, Math.cos(angleDiff(want, p.yaw))));
  p.x += (dx / d) * step;
  p.z += (dz / d) * step;
  const g = W(p.x, p.z);
  if (!Number.isNaN(g)) p.y += (g - p.y) * Math.min(1, dt * 12);
  return true;
}

/**
 * Along the leap (arc) at share `u` (0‥1): into the pose's place. Up a wall (`up`) it rises first and goes over the
 * edge after (clear of the wall's face); down one (`down`) it goes out first and drops after.
 */
function along(u: number, how: 'flat' | 'up' | 'down' = 'flat'): void {
  const p = THIEF.pose;
  const h = how === 'up' ? u * u : how === 'down' ? 1 - (1 - u) * (1 - u) : u;
  const v = how === 'up' ? 1 - (1 - u) * (1 - u) : how === 'down' ? u * u : u;
  p.x = arcA.x + (arcB.x - arcA.x) * h;
  p.z = arcA.z + (arcB.z - arcA.z) * h;
  p.y = arcA.y + (arcB.y - arcA.y) * v + Math.sin(Math.PI * u) * arcUp;
}

/** Start a leap from where it is to `to`, `up` m over the straight line, taking `seconds`. */
function leapTo(to: Vector3, up: number, seconds: number): void {
  const p = THIEF.pose;
  arcA.set(p.x, p.y, p.z);
  arcB.copy(to);
  arcUp = up;
  arcFor = seconds;
}

function setPhase(next: Phase): void {
  phase = next;
  pt = 0;
}

/** His feet, and how loud a sound of the monkey is from his ears (0.15‥1). */
function heard(): number {
  if (!env) return 0;
  const p = THIEF.pose;
  const b = env.body.pos;
  const d = Math.sqrt((p.x - b.x) ** 2 + (p.y - b.y - 2) ** 2 + (p.z - b.z) ** 2);
  return Math.max(0.15, Math.min(1, 1.25 - d / 16));
}

/** What he eats now (one object, filled again each call: `eatingNow`). */
interface Eating {
  kind: FoodKind;
  colors?: readonly number[];
  action: MealAction;
  t: number;
  /** The stall's thing (its id and name), or null (a check's meal: act=eat…). */
  what: { readonly shop: string; readonly id: string; readonly name: Readonly<Record<Lang, string>> } | null;
}
const eating: Eating = { kind: 'fruit', action: 'eat', t: 0, what: null };

/** What he eats now: its kind, colours, how far in, the stall's thing; null when his hands are empty. */
function eatingNow(): Eating | null {
  const ex = explorer;
  if (!ex) return null;
  const kind = ex.foodHeld;
  // (the action itself: the Animator's meal record follows it a step later)
  const action = ex.currentAction;
  if (!kind || !isMeal(action)) return null;
  const shop = meals.now();
  eating.kind = kind;
  eating.action = action;
  eating.t = ex.animator.actionTime;
  eating.what = shop?.what ?? null;
  eating.colors = shop?.what.colors;
  return eating;
}
/** Its id for a report (`shop:item`, or the food kind) and its name in the language in use. */
const idOf = (e: Eating): string => (e.what ? `${e.what.shop}:${e.what.id}` : e.kind);
const nameOfEating = (e: Eating): string => (e.what ? nameOf(e.what) : t('monkeySnack'));

/**
 * The toast's name: as the stall writes it; in English, as running text: lower case, without what is in brackets or
 * after a comma, without a leading "One" ("Num banh chok, green fish gravy" → "num banh chok").
 */
function toastName(name: string): string {
  if (lang() !== 'en') return name;
  const s = name
    .replace(/\s*\(.*\)\s*$/, '')
    .replace(/,.*$/, '')
    .replace(/^One /, '');
  return /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
}

/** Where the thing he holds is (world): the bowl, box or bag on his left palm while he eats; else in his right hand. */
function handOf(action: MealAction, out: Vector3): Vector3 {
  const j = explorer!.rig.joints[action === 'eat' ? 'propL' : 'propR'];
  j.updateWorldMatrix(true, false);
  return j.getWorldPosition(out);
}

/** The stage of the item it takes (parts/food.ts: the bowl, box or bag for eating; the stick, cup, bag or bottle else) when he has eaten to `t`. */
function stageAt(kind: FoodKind, action: MealAction, mt: number): number {
  const s = { left: 0, right: 0, size: 1 };
  mealStage(action, mt, s);
  const n = FOOD_STAGES[kind];
  return n.left > 0 ? Math.min(s.left, n.left - 1) : Math.min(s.right, Math.max(0, n.right - 1));
}
const stagesOf = (kind: FoodKind): number => {
  const n = FOOD_STAGES[kind];
  return Math.max(1, n.left > 0 ? n.left : n.right);
};

// ── Choosing the thief and its ways ─────────────────────────────────────────

/** Whether he stands where the troops go (their ground under his feet: not up on a roof, a ride, a tree). */
function onTheirGround(): boolean {
  const b = env!.body.pos;
  const g = G(b.x, b.z);
  return !Number.isNaN(g) && Math.abs(g - b.y) < 0.6;
}

/**
 * The best macaque to come for his snack (`force`: any near enough, whatever
 * the meal has left), its takeoff spot and its timing; null when none can.
 */
function pickThief(force: boolean, left: number): Agent | null {
  const b = env!.body;
  const r0 = TAKEOFF * (b.scale / 1.4);
  let best: Agent | null = null;
  let bestScore = -Infinity;
  const bx = b.pos.x;
  const bz = b.pos.z;
  for (const a of THIEF.members) {
    if (a.asleep || a.partner || (a.mode !== 'idle' && a.mode !== 'alert') || Math.abs(a.y - b.pos.y) > 1.6) continue;
    const d0 = len(a.x - bx, a.z - bz);
    if (d0 > (force ? 32 : REACH) || d0 < 1.2) continue;
    // Its takeoff: round him towards it, but in front of him (his hands are there).
    const toward = Math.atan2(a.x - bx, a.z - bz);
    const off = angleDiff(toward, b.yaw);
    const ang = b.yaw + Math.max(-FRONT, Math.min(FRONT, off));
    const tx = bx + Math.sin(ang) * r0;
    const tz = bz + Math.cos(ang) * r0;
    const tg = G(tx, tz);
    if (Number.isNaN(tg) || Math.abs(tg - b.pos.y) > 0.7) continue;
    if (segDist(a.x, a.z, tx, tz, bx, bz) < CLEAR || !walkable(a.x, a.z, a.gy, tx, tz)) continue;
    const d = len(tx - a.x, tz - a.z);
    if (!plan(d, left) && !force) continue;
    const score = -d + (a.scale > 1.05 ? 2.5 : 0) + (a.mode === 'alert' ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = a;
      takeoff.set(tx, tg, tz);
    }
  }
  if (best) plan(len(takeoff.x - best.x, takeoff.z - best.z), left, force);
  return best;
}

/**
 * Its timing for `d` m to the takeoff with `left` s of the meal to go: a
 * moment's watching, a little creeping, a dash, the leap; false when it
 * cannot be there in time (`force`: it comes anyway, as fast as it can).
 */
function plan(d: number, left: number, force = false): boolean {
  const room = left - LEAP_UP - 0.05;
  for (const [w, creepMax] of [
    [0.6, 1],
    [0.35, 0.4],
    [0.25, 0],
  ] as const) {
    const c = Math.min(creepMax, Math.max(0, d - 2.5));
    const rest = room - w - c / CREEP;
    if (rest <= 0) continue;
    const v = (d - c) / rest;
    if (v > DASH[1]) continue;
    watchFor = w;
    creepFor = c;
    dashSpeed = Math.max(DASH[0], v);
    // (time to spare: it watches longer, up to a second and a half)
    if (v < DASH[0]) watchFor = Math.min(1.5, w + (room - w - c / CREEP - (d - c) / DASH[0]));
    return true;
  }
  if (force) {
    watchFor = 0.4;
    creepFor = Math.min(0.6, Math.max(0, d - 2.5));
    dashSpeed = DASH[1];
  }
  return false;
}

/**
 * The search for its wall (see `findPerch`): a grid of spots round where it will run from (`PERCH_R` m, every
 * `PERCH_STEP` m), a few rows a step while it comes in (it is known from the start: the takeoff), the rest at once
 * when it has the snack. `stats` for checks: wall tops seen, roomy ones, those it could not reach.
 */
const PERCH_R = 16;
const PERCH_STEP = 0.75;
const PERCH_N = Math.round((2 * PERCH_R) / PERCH_STEP) + 1;
const PERCH_PER_STEP = 60;
const perch = { on: false, i: 0, x: 0, y: 0, z: 0, best: -Infinity, stats: { tops: 0, roomy: 0, blocked: 0 } };

/** Start looking for its wall from (x, y, z). */
function perchFrom(x: number, y: number, z: number): void {
  Object.assign(perch, { on: true, i: 0, x, y, z, best: -Infinity });
  perch.stats.tops = perch.stats.roomy = perch.stats.blocked = 0;
  climbs = false;
  hasVia = false;
}

/** Look at `n` more spots of the grid (Infinity: all the rest); true once it is all looked at. */
function perchStep(n: number): boolean {
  if (!perch.on) return true;
  const b = env!.body.pos;
  const { x: fromX, y: fromY, z: fromZ } = perch;
  const end = Math.min(PERCH_N * PERCH_N, perch.i + n);
  for (; perch.i < end; perch.i++) {
    const ax = fromX - PERCH_R + (perch.i % PERCH_N) * PERCH_STEP;
    const az = fromZ - PERCH_R + Math.floor(perch.i / PERCH_N) * PERCH_STEP;
    const r = len(ax - fromX, az - fromZ);
    if (r < 3.5 || r > PERCH_R) continue;
    const ga = G(ax, az);
    if (Number.isNaN(ga) || Math.abs(ga - fromY) > 3) continue;
    // A wall beside it: any of eight ways, a leap's reach off (the first top each way).
    for (let j = 0; j < 8; j++) {
      const da = (j / 8) * Math.PI * 2;
      for (const rr of [0.7, 1, 1.3]) {
        const sx = ax + Math.sin(da) * rr;
        const sz = az + Math.cos(da) * rr;
        const gb = G(sx, sz);
        const up = gb - ga;
        if (!(up > 1.25 && up < 3.6)) continue;
        // (sat a little in from the edge, if the top goes on)
        const ix = sx + Math.sin(da) * 0.35;
        const iz = sz + Math.cos(da) * 0.35;
        const gi = G(ix, iz);
        const inner = !Number.isNaN(gi) && Math.abs(gi - gb) < 0.3;
        const px = inner ? ix : sx;
        const pz = inner ? iz : sz;
        perch.stats.tops++;
        if (len(px - b.x, pz - b.z) < 4.5) break;
        // (a wall's top that goes on, not a post's: the same top a metre off at least one way, better two or more; about
        // 2 m up; on the way home, away from him)
        let room = 0;
        for (let q = 0; q < 8; q++) if (Math.abs(W(px + Math.sin(q * 0.785), pz + Math.cos(q * 0.785)) - gb) < 0.3) room++;
        if (room < 1) break;
        perch.stats.roomy++;
        const score = -Math.abs(r - 8) * 0.4 - Math.abs(up - 2) * 0.6 + Math.min(room, 4) * 0.5 + (inner ? 0.5 : 0) + (len(ax - home.x, az - home.z) < len(fromX - home.x, fromZ - home.z) ? 2 : 0) + (len(ax - b.x, az - b.z) > len(fromX - b.x, fromZ - b.z) ? 1.5 : 0);
        if (score <= perch.best) break;
        // (a way round something costs a little)
        const way = wayTo(fromX, fromZ, fromY, ax, az, b.x, b.z, _via);
        if (!way) perch.stats.blocked++;
        if (!way || (way === 2 && score - 0.6 <= perch.best)) break;
        perch.best = way === 2 ? score - 0.6 : score;
        climbs = true;
        hasVia = way === 2;
        if (hasVia) via.copy(_via);
        foot.set(ax, ga, az);
        seat.set(px, inner ? gi : gb, pz);
        break;
      }
    }
  }
  return perch.i >= PERCH_N * PERCH_N;
}

/**
 * Where it runs with the snack: the foot of a wall (or a ledge, a terrace's
 * edge) near where it runs from that it can leap up (`foot` → `seat`), away
 * from him, the way there on its ground and clear of him; else a spot on the
 * ground a little way off. Prefers the way home (to its troop). (The search
 * began with `perchFrom`; what is left of it is done now.)
 */
function findPerch(): void {
  perchStep(Infinity);
  perch.on = false;
  if (climbs) return;
  const b = env!.body.pos;
  const { x: fromX, y: fromY, z: fromZ } = perch;
  let best = -Infinity;
  // No wall to leap up: a spot on the ground a little way off, towards home and away from him.
  for (let r = 9; r >= 4; r -= 1)
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const x = fromX + Math.sin(a) * r;
      const z = fromZ + Math.cos(a) * r;
      const g = G(x, z);
      if (Number.isNaN(g)) continue;
      const score = len(x - b.x, z - b.z) - len(x - home.x, z - home.z) * 0.5;
      if (score <= best || !clearOf(fromX, fromZ, x, z, b.x, b.z, 0.2) || !walkable(fromX, fromZ, fromY, x, z)) continue;
      best = score;
      foot.set(x, g, z);
      seat.copy(foot);
    }
  if (best === -Infinity) {
    // (nowhere: it eats where it landed)
    foot.set(fromX, fromY, fromZ);
    seat.copy(foot);
  }
}

/** A spot on its ground `r0`‥`r1` m from (x, z), away from him, reachable straight; into `out` (false: none). */
function awaySpot(x: number, y: number, z: number, r0: number, r1: number, out: Vector3): boolean {
  const b = env!.body.pos;
  const away = Math.atan2(x - b.x, z - b.z);
  for (const turn of [0, 0.5, -0.5, 1, -1, 1.6, -1.6])
    for (let r = r1; r >= r0; r -= 1) {
      const a = away + turn;
      const tx = x + Math.sin(a) * r;
      const tz = z + Math.cos(a) * r;
      const g = G(tx, tz);
      if (Number.isNaN(g) || !clearOf(x, z, tx, tz, b.x, b.z) || !walkable(x, z, y, tx, tz)) continue;
      out.set(tx, g, tz);
      return true;
    }
  return false;
}

// ── The scene ───────────────────────────────────────────────────────────────

/** A macaque comes for what he eats now (`force`: the URL's, whatever the odds and the meal's time). */
function steal(force: boolean): boolean {
  const now = eatingNow();
  if (!now || !THIEF.ground || !THIEF.members.length) return false;
  const a = pickThief(false, GRAB_BY[now.action] - now.t) ?? (force ? pickThief(true, MEAL[now.action].gone[0] - LATE - now.t) : null);
  if (!a) return false;
  begin(a);
  // (its wall, looked for while it comes: it runs from where it leaps)
  perchFrom(takeoff.x, takeoff.y, takeoff.z);
  food = { kind: now.kind, colors: now.colors, stage: 0, size: 1 };
  foodId = idOf(now);
  foodName = nameOfEating(now);
  setPhase('watch');
  steer = !keepView;
  camOut = false;
  const c = env!.cam;
  camYaw = c.yaw;
  camPitch = c.pitch;
  camDist = c.distance;
  camK = 0;
  lookAt = Math.atan2(a.x - env!.body.pos.x, a.z - env!.body.pos.z);
  // (the side of the line between them the camera is on now: the least swing)
  camSide = angleDiff(c.yaw, lookAt) >= 0 ? 1 : -1;
  return true;
}

/** Borrow it from its troop (the fauna part leaves it to us from now). */
function begin(a: Agent): void {
  ag = a;
  home.set(a.homeX, a.gy, a.homeZ);
  borrow(a);
  THIEF.snap = env!.shot;
  st = 0;
  chatterAt = 0;
  scoldAt = -1e9;
  glance = 0;
  glanceAt = 2.5;
  answeredAt = -9;
}

/** Back to its troop, as it is now (`act`: what it goes on doing there). */
function end(act: Activity, seconds: number, miss = false): void {
  if (ag) giveBack(act, seconds);
  ag = null;
  food = null;
  phase = 'off';
  camOut = true;
  nextAt = Math.max(nextAt, clock + (miss ? COOLDOWN_MISS : 0));
}

/** It got there: the snack goes from his hands to its own (false: his hands were empty just then). */
function snatch(ctx: RoamCtx): boolean {
  const ex = explorer!;
  const now = eatingNow();
  if (!now) return false;
  stage0 = stageAt(now.kind, now.action, now.t);
  if (stage0 >= (EMPTY[now.kind] ?? Infinity)) return false;
  food = { kind: now.kind, colors: now.colors, stage: stage0, size: 1 };
  THIEF.food = food;
  foodId = idOf(now);
  foodName = nameOfEating(now);
  // His meal stops there (as the stick stops it: _shop.ts), or a check's own meal (act=eat…).
  const shop = meals.now();
  if (shop) meals.snatch();
  else {
    const a = ex.currentAction;
    if (isMeal(a)) ex.stop(a);
    ex.holdFood(null);
  }
  // He jumps back a little, surprised, and turns to watch it go; "hey!"
  ex.showFace('surprised');
  faceOurs = true;
  faceUntil = clock + FACE_FOR;
  watchUntil = clock + WATCH_IT;
  heyAt = clock + 0.16;
  const b = ctx.body;
  if (!ex.animator.posture && b.grounded) {
    const dx = b.pos.x - THIEF.pose.x;
    const dz = b.pos.z - THIEF.pose.z;
    const d = len(dx, dz) || 1;
    b.vel.x = (dx / d) * HOP_BACK;
    b.vel.z = (dz / d) * HOP_BACK;
    b.vel.y = HOP_UP;
    b.grounded = false;
    ctx.sound('jump', 0.3);
  }
  ctx.hud.toast(t('monkeyStole', { name: toastName(foodName) }));
  SFX.play('monkeySnatch', 1);
  pad.rumble('bump');
  nearEat = 0;
  nextAt = clock + COOLDOWN;
  return true;
}

/** One step of the scene (every roaming mode). */
function step(ctx: RoamCtx, mode: RoamMode, dt: number): void {
  if (phase === 'off' || !ag) return;
  pt += dt;
  st += dt;
  const p = THIEF.pose;
  const b = ctx.body.pos;
  const toHim = Math.atan2(b.x - p.x, b.z - p.z);
  const dHim = len(b.x - p.x, b.z - p.z);
  // His snack gone before it got there (eaten up, stopped, off his feet): it gives up; walking at it, it backs off.
  if (BEFORE.has(phase) && (!eatingNow() || mode !== 'walk')) {
    if (pressing(ctx, dHim)) backOff(toHim);
    else setPhase('sulk');
    return;
  }
  // (the search for its wall, a little each step while it comes)
  if (perch.on && BEFORE.has(phase)) perchStep(PERCH_PER_STEP);
  switch (phase) {
    case 'watch': {
      // Up on its feet, head high, eyes on the snack.
      p.yaw = turnTo(p.yaw, toHim, 6 * dt);
      pose(p.x, p.y, p.z, p.yaw, 0, 0, -0.8, 0, 0);
      if (pt >= watchFor) setPhase(creepFor > 0.05 ? 'creep' : 'dash');
      break;
    }
    case 'creep': {
      // Low and slow, a step at a time.
      const dx = takeoff.x - p.x;
      const dz = takeoff.z - p.z;
      const d = len(dx, dz);
      const moving = go(takeoff.x, takeoff.z, CREEP, dt);
      pose(p.x, p.y, p.z, p.yaw, moving ? 1 : 0, 0, 0.45, 0, 0);
      if (pt >= creepFor / CREEP || d < 2) {
        setPhase('dash');
        SFX.play('monkeyScamper', heard());
      }
      break;
    }
    case 'dash': {
      // Its run in; the last moment before the leap it reaches up already (the shader eases into it).
      const moving = go(takeoff.x, takeoff.z, dashSpeed, dt);
      const d = len(takeoff.x - p.x, takeoff.z - p.z);
      const reach = d < dashSpeed * 0.28;
      pose(p.x, p.y, p.z, p.yaw, moving ? 2 : 0, 0, -0.3, 0, reach ? 4 : 0);
      if (!moving) {
        // The leap: up to his hands (where the thing he holds is now), the snatch at the top, then down.
        const a = explorer!.currentAction;
        if (isMeal(a)) handOf(a, _hand);
        p.yaw = Math.atan2(_hand.x - p.x, _hand.z - p.z);
        apexOf(_hand, p.yaw, apex);
        leapTo(apex, 0.12, LEAP_UP);
        leapDown = got = false;
        setPhase('leap');
      }
      break;
    }
    case 'leap': {
      const u = Math.min(1, pt / arcFor);
      if (!leapDown) {
        // Up: aiming at his hands as they are now.
        const a = explorer!.currentAction;
        if (isMeal(a)) {
          handOf(a, _hand);
          apexOf(_hand, p.yaw, arcB);
        }
        along(1 - (1 - u) * (1 - u));
        pose(p.x, p.y, p.z, p.yaw, 2, 0, -0.6, 0, 4);
        if (u >= 1) {
          // The snatch at the top (his hands empty just then: it misses), and down where it leapt from, out of his reach.
          got = snatch(ctx);
          leapDown = true;
          land.copy(takeoff);
          leapTo(land, 0.05, LEAP_DOWN);
          pt = 0;
          if (got) findPerch();
        }
      } else {
        along(u * u);
        pose(p.x, p.y, p.z, p.yaw, 2, 0, -0.2, 0, got ? 5 : 0);
        if (u >= 1) {
          if (got) {
            setPhase('escape');
            SFX.play('monkeyScamper', heard());
          } else setPhase('sulk');
        }
      }
      break;
    }
    case 'escape': {
      // On three legs, the snack under its chin, to the foot of its wall (round what is in the way).
      if (hasVia && !go(via.x, via.z, RUN, dt)) hasVia = false;
      const moving = hasVia || go(foot.x, foot.z, RUN, dt);
      pose(p.x, p.y, p.z, p.yaw, 2, 0, 0, 0, 5);
      if (pt > 0.5 && pt - dt <= 0.5) SFX.play('monkeyChatter', heard() * 0.9);
      if (!moving) {
        if (climbs) {
          p.yaw = Math.atan2(seat.x - p.x, seat.z - p.z);
          leapTo(seat, 0.3, 0.45 + 0.1 * Math.max(0, seat.y - p.y));
          setPhase('climb');
          SFX.play('monkeyScamper', heard() * 0.8);
        } else setPhase('settle');
      } else if (pt > 12) {
        // (not there after all this while: it eats where it is)
        climbs = false;
        const g = G(p.x, p.z);
        seat.set(p.x, Number.isNaN(g) ? p.y : g, p.z);
        foot.copy(seat);
        setPhase('settle');
      }
      break;
    }
    case 'climb': {
      const u = Math.min(1, pt / arcFor);
      along(u, 'up');
      pose(p.x, p.y, p.z, p.yaw, 2, 0, -0.2, 0, 5);
      if (u >= 1) setPhase('settle');
      break;
    }
    case 'settle': {
      // Turns round to face him, sits, and looks back at him.
      p.yaw = turnTo(p.yaw, toHim, 5 * dt);
      pose(p.x, p.y, p.z, p.yaw, 0, pt > 0.25 ? 1 : 0, 0, 0, 5);
      if (pt > 0.6) {
        setPhase('feast');
        chatterAt = 0.4;
      }
      break;
    }
    case 'feast': {
      p.yaw = turnTo(p.yaw, toHim, 2.5 * dt);
      // (now and then a glance aside, then back at him)
      if (pt >= glanceAt) {
        glance = glance ? 0 : (rand() < 0.5 ? -1 : 1) * (0.4 + 0.3 * rand());
        glanceAt = pt + (glance ? 0.9 + rand() * 0.6 : 2.5 + rand() * 2.5);
      }
      // (answering his greeting: a bounce where it sits, head up)
      const bounce = hop(pt, answeredAt + 0.15) + hop(pt, answeredAt + 0.55);
      const answering = pt - answeredAt < 1.1;
      pose(p.x, seat.y + bounce, p.z, p.yaw, 0, 1, answering ? -0.6 : 0.15, answering ? 0 : glance, 5);
      if (food) {
        const k = pt / FEAST;
        const n = stagesOf(food.kind);
        food.stage = Math.min(n - 1, stage0 + Math.floor((n - stage0) * k));
        food.size = 1 - smooth((k - (1 - GONE)) / GONE);
        THIEF.food = food;
      }
      // Chatter (pleased with itself); scolding him when he comes near; he climbs up to it: it moves off.
      const dy = Math.abs(b.y - p.y);
      if (pt >= chatterAt) {
        SFX.play('monkeyChatter', heard() * 0.7);
        chatterAt = pt + 5 + rand() * 4;
      }
      if (dHim < SCOLD && dy < 2.5 && clock - scoldAt > 2.2) {
        scoldAt = clock;
        SFX.play('monkeyChatter', heard());
      }
      if (dHim < SHOO && dy < 1.5 && awaySpot(p.x, p.y, p.z, 3, 7, goal)) {
        foot.copy(goal);
        seat.copy(goal);
        climbs = false;
        hasVia = false;
        setPhase('escape');
        SFX.play('monkeyScamper', heard());
        pt = 0.6;
        break;
      }
      if (pt >= FEAST) {
        THIEF.food = food = null;
        setPhase('finish');
      }
      break;
    }
    case 'finish': {
      // The last of it: fingers licked (eating, sitting), then up on its feet.
      pose(p.x, p.y, p.z, p.yaw, 0, pt < 0.8 ? 1 : 0, 0.2, 0, pt < 0.8 ? 3 : 0);
      if (pt > 1.15) {
        if (climbs) {
          p.yaw = Math.atan2(foot.x - p.x, foot.z - p.z);
          leapTo(foot, 0.25, 0.5);
          setPhase('down');
        } else setPhase('home');
      }
      break;
    }
    case 'down': {
      const u = Math.min(1, pt / arcFor);
      along(u, 'down');
      pose(p.x, p.y, p.z, p.yaw, 2, 0, 0.1, 0, 0);
      if (u >= 1) {
        setPhase('home');
        if (!walkable(p.x, p.z, p.y, home.x, home.z)) home.set(p.x, p.y, p.z);
      }
      break;
    }
    case 'home': {
      // Back to its troop at a walk; there (or after a while) it is theirs again.
      const moving = len(home.x - p.x, home.z - p.z) > 2.5 && go(home.x, home.z, WALK, dt);
      pose(p.x, p.y, p.z, p.yaw, moving ? 1 : 0, 0, 0, 0, 0);
      if (!moving || pt > 10) end('sit', 3 + rand() * 4);
      break;
    }
    case 'backoff': {
      // A startled hop back, then off a few steps, and it stands watching him.
      if (pt < 0.3) {
        along(smooth(pt / 0.3));
        p.yaw = turnTo(p.yaw, toHim, 8 * dt);
        pose(p.x, p.y, p.z, p.yaw, 2, 0, -1, 0, 0);
        break;
      }
      const moving = go(goal.x, goal.z, RUN, dt);
      if (!moving) p.yaw = turnTo(p.yaw, toHim, 5 * dt);
      pose(p.x, p.y, p.z, p.yaw, moving ? 2 : 0, 0, moving ? 0 : -1, 0, 0);
      if (!moving && pt > 2.2) end('look', 2, true);
      break;
    }
    case 'sulk': {
      // It sits a moment, looking at him (no snack, then), and goes back to its troop's life; he comes at it: off it goes.
      if (pressing(ctx, dHim)) {
        backOff(toHim);
        break;
      }
      p.yaw = turnTo(p.yaw, toHim, 3 * dt);
      pose(p.x, p.y, p.z, p.yaw, 0, 1, 0.1, 0.3, 0);
      if (pt > 1.8) end('sit', 3, true);
      break;
    }
    case 'answer': {
      // His greeting: up on its feet facing him, two little hops, chattering.
      p.yaw = turnTo(p.yaw, toHim, 7 * dt);
      const g = G(p.x, p.z);
      const base = Number.isNaN(g) ? p.y : g;
      pose(p.x, base + hop(pt, 0.35) + hop(pt, 0.75), p.z, p.yaw, 0, 0, -0.9, 0, 0);
      if (pt - dt < 0.25 && pt >= 0.25) SFX.play('monkeyChatter', heard());
      if (pt > 1.6) end('look', 2.5);
      break;
    }
  }
}

/** A little hop `at` s into it (m up, `t` s in). */
const hop = (t: number, at: number): number => (t > at && t < at + 0.26 ? Math.sin(((t - at) / 0.26) * Math.PI) * 0.12 : 0);

/** He walks at it (faster than a stroll, towards it), or stands right by it. */
function pressing(ctx: RoamCtx, dHim: number): boolean {
  const p = THIEF.pose;
  const b = ctx.body;
  const toward = dHim > 0.1 ? (b.vel.x * (p.x - b.pos.x) + b.vel.z * (p.z - b.pos.z)) / dHim : 0;
  return toward > 0.8 || dHim < 2.2;
}

/** It backs off: a startled hop back (away from him at `toHim`), then a few metres off, and stands watching him. */
function backOff(toHim: number): void {
  const p = THIEF.pose;
  leapTo(_v.set(p.x - Math.sin(toHim) * 0.6, p.y, p.z - Math.cos(toHim) * 0.6), 0.22, 0.3);
  const gy = G(arcB.x, arcB.z);
  if (Number.isNaN(gy) || !walkable(p.x, p.z, p.y, arcB.x, arcB.z)) arcB.set(p.x, p.y, p.z);
  else arcB.y = gy;
  if (!awaySpot(arcB.x, arcB.y, arcB.z, 3, 6, goal)) goal.copy(arcB);
  SFX.play('monkeyChatter', heard() * 0.8);
  setPhase('backoff');
}

/** The root of the macaque at the top of its leap, its reaching hands at `hand` (world), facing `yaw`. */
function apexOf(hand: Vector3, yaw: number, out: Vector3): Vector3 {
  const s = ag?.scale ?? 1;
  thiefHand(0, 4, _w).multiplyScalar(s);
  const c = Math.cos(yaw);
  const sn = Math.sin(yaw);
  return out.set(hand.x - (c * _w.x + sn * _w.z), hand.y - _w.y, hand.z - (-sn * _w.x + c * _w.z));
}

/** He greets (F): a macaque in front of him chatters back (the thief, or the nearest of a troop). */
function answer(ctx: RoamCtx): void {
  if (GREET.n === greetSeen) return;
  greetSeen = GREET.n;
  if (night > NIGHT || !env) return;
  const b = ctx.body.pos;
  const inFront = (x: number, z: number, r: number) => {
    const d = len(x - b.x, z - b.z);
    return d < r && Math.abs(angleDiff(Math.atan2(x - b.x, z - b.z), GREET.yaw)) < 1.3;
  };
  if (phase !== 'off') {
    // (the thief: it chatters back; up on its wall, with a bounce where it sits)
    const p = THIEF.pose;
    if (!inFront(p.x, p.z, 16)) return;
    SFX.play('monkeyChatter', heard());
    if (phase === 'feast') answeredAt = pt;
    return;
  }
  let best: Agent | null = null;
  let bd = Infinity;
  for (const a of THIEF.members) {
    if (a.asleep || a.partner || (a.mode !== 'idle' && a.mode !== 'alert') || Math.abs(a.y - b.y) > 2.5 || !inFront(a.x, a.z, 9)) continue;
    const d = len(a.x - b.x, a.z - b.z);
    if (d < bd) {
      bd = d;
      best = a;
    }
  }
  if (!best) return;
  begin(best);
  setPhase('answer');
}

/**
 * The camera while it comes and goes (see `CAM`): our own orbit, eased, and the focus drawn towards the monkey; then
 * back to him (the focus eased home first: no jump) and the follow camera's own again.
 */
function camera(ctx: RoamCtx, dt: number): void {
  if (!steer) return;
  const i = ctx.input;
  const c = ctx.cam;
  const b = ctx.body.pos;
  const p = THIEF.pose;
  // (the player turns the camera or walks off, or it has eaten a while: let go)
  if (i.lookYaw || i.lookPitch || i.zoom || Math.abs(i.move.x) + Math.abs(i.move.y) > 0.2) camOut = true;
  if (phase === 'off' || (phase === 'feast' && pt > CAM.holdFeast) || phase === 'finish' || phase === 'down' || phase === 'home' || phase === 'sulk' || phase === 'backoff' || phase === 'answer') camOut = true;
  const up = phase === 'climb' || phase === 'settle' || phase === 'feast';
  camK += ((camOut ? 0 : up ? CAM.up.share : CAM.share) - camK) * (1 - Math.exp(-(camOut ? CAM.back : CAM.rate) * dt));
  if (camOut && camK < 0.01) {
    steer = false;
    return;
  }
  // The focus: from his chest (the walker's) towards the monkey's middle.
  c.focus.x += (p.x - c.focus.x) * camK;
  c.focus.y += (p.y + 0.35 - c.focus.y) * camK;
  c.focus.z += (p.z - c.focus.z) * camK;
  if (camOut) return;
  // (the way to it from him, kept while it is right by him: no swinging round at the grab)
  const sep = Math.sqrt((p.x - b.x) ** 2 + (p.z - b.z) ** 2 + (p.y - b.y) ** 2);
  if (len(p.x - b.x, p.z - b.z) > 2.2) lookAt = Math.atan2(p.x - b.x, p.z - b.z);
  const k = 1 - Math.exp(-CAM.rate * dt);
  const v = up ? CAM.up : CAM;
  camYaw += angleDiff(lookAt + camSide * (up ? CAM.up.side : Math.PI / 2), camYaw) * k;
  camPitch += (v.pitch - camPitch) * k;
  camDist += (Math.max(v.min, Math.min(v.max, v.near + v.per * sep)) - camDist) * k;
  c.yaw = camYaw;
  c.behindYaw = camYaw;
  c.pitch = camPitch;
  c.distance = camDist;
  // (the follow camera eases its field of view: in a little on the monkey up there, back to the walk's after)
  if (up) c.fov = CAM.up.fov;
}

/** His side: the face, turning to watch it go, the "hey!". */
function reaction(ctx: RoamCtx, dt: number): void {
  const ex = explorer!;
  if (heyAt > 0 && clock >= heyAt) {
    heyAt = -1;
    SFX.play('monkeyHey', 1);
  }
  if (faceOurs && clock >= faceUntil) {
    faceOurs = false;
    ex.showFace(null);
  }
  if (clock < watchUntil && phase !== 'off' && !ex.animator.posture) {
    const m = ctx.input.move;
    if (Math.abs(m.x) + Math.abs(m.y) > 0.2) watchUntil = -1;
    else {
      const p = THIEF.pose;
      const b = ctx.body;
      if (len(p.x - b.pos.x, p.z - b.pos.z) > 1) b.yaw += angleDiff(Math.atan2(p.x - b.pos.x, p.z - b.pos.z), b.yaw) * (1 - Math.exp(-dt * 6));
    }
  }
}

/** Each meal near a troop: may one come for it? */
function maybe(ctx: RoamCtx, mode: RoamMode, dt: number): void {
  const now = eatingNow();
  const meal = meals.now() ?? (now ? explorer!.animator.meal : null);
  const isNew = now !== null && (meal !== mealSeen || !mealWas);
  mealWas = now !== null;
  if (!now) return;
  // (a troop near: the time he has eaten near them adds up)
  const b = ctx.body.pos;
  let near = false;
  for (const a of THIEF.members)
    if (len(a.x - b.x, a.z - b.z) < NEAR && Math.abs(a.y - b.y) < 3) {
      near = true;
      break;
    }
  if (near) nearEat += dt;
  if (!isNew) return;
  mealSeen = meal;
  if (off || !near || ctx.shot || phase !== 'off' || mode !== 'walk' || night > NIGHT || EVENTS.shelter > STORM || addonBusy()) return;
  if (!always && clock < nextAt) return;
  if (!onTheirGround()) return;
  const chance = always ? 1 : Math.min(MAX_CHANCE, TEMPT[now.kind] * (BASE + GROW * nearEat));
  if (rand() >= chance) return;
  if (!steal(false)) nextAt = clock + 8;
}

/** The URL's `monkey=steal`: the nearest troop's boldest macaque comes for what he eats (as soon as he eats: a second at most). */
function forced(ctx: RoamCtx): void {
  if (!eatingNow()) {
    if (clock > forceAt) {
      forceAt = -1;
      console.warn('[map] monkey=steal: he is not eating (bought=<item>, _shop.ts; or act=eat&food=<kind>)');
    }
    return;
  }
  forceAt = -1;
  // (this meal is the URL's: no chance roll for it)
  mealSeen = meals.now() ?? explorer!.animator.meal;
  mealWas = true;
  const b = ctx.body.pos;
  if (!steal(true)) console.warn(`[map] monkey=steal: no macaque can reach him here (his feet ${b.x.toFixed(1)}, ${b.y.toFixed(1)}, ${b.z.toFixed(1)}; their ground there ${G(b.x, b.z).toFixed(1)})`);
  else console.info(`[map] monkey=steal: macaque ${ag!.i} comes ${len(ag!.x - b.x, ag!.z - b.z).toFixed(1)} m (watch ${watchFor.toFixed(2)} s, creep ${creepFor.toFixed(1)} m, dash ${dashSpeed.toFixed(1)} m/s)`);
}

/** A report's or the URL's `monkey=feast:<item>`: a macaque up on the wall nearest him, eating it. */
function feastFromUrl(id: string, ctx: RoamCtx): void {
  const [a, b] = id.includes(':') ? id.split(':') : ['', id];
  let kind: FoodKind | null = isFoodKind(b) && !a ? b : null;
  let colors: readonly number[] | undefined;
  let name = t('monkeySnack');
  for (const s of SHOPS) {
    if (kind || (a && s.id !== a)) continue;
    const it = s.items.find((i) => i.id === b);
    if (it) {
      kind = it.consume;
      colors = it.colors;
      name = nameOf(it);
    }
  }
  if (!kind) {
    console.warn(`[map] monkey=feast: no snack "${id}" (a shop item, shop:item, or a food kind)`);
    kind = 'fruit';
  }
  const p = ctx.body.pos;
  let pick: Agent | null = null;
  let bd = 40;
  for (const m of THIEF.members) {
    const d = len(m.x - p.x, m.z - p.z);
    if (!m.partner && d < bd) {
      bd = d;
      pick = m;
    }
  }
  if (!pick) return void console.warn('[map] monkey=feast: no troop near him');
  begin(pick);
  const g = G(p.x, p.z);
  perchFrom(p.x, Number.isNaN(g) ? p.y : g, p.z);
  findPerch();
  const q = THIEF.pose;
  q.x = seat.x;
  q.y = seat.y;
  q.z = seat.z;
  q.yaw = Math.atan2(p.x - seat.x, p.z - seat.z);
  pose(q.x, q.y, q.z, q.yaw, 0, 1, 0.15, 0, 5);
  food = { kind, colors, stage: 0, size: 1 };
  THIEF.food = food;
  foodId = id;
  foodName = name;
  stage0 = 0;
  setPhase('feast');
  pt = 2;
  chatterAt = 6;
}

registerAddon({
  id: 'monkeys',
  init(e) {
    env = e;
    explorer = e.explorer;
    const v = e.params.get('monkey');
    off = v === '0';
    always = v === 'always';
    keepView = e.params.has('rcam');
    greetSeen = GREET.n;
    // (checks: the scene as it is now)
    Object.assign(window, {
      __monkeys: {
        get state() {
          return { phase, pt, st, agent: ag?.i ?? null, pose: { ...THIEF.pose }, food: THIEF.food && { ...THIEF.food }, nearEat, nextAt, clock, climbs, foot: foot.toArray(), seat: seat.toArray(), takeoff: takeoff.toArray(), perch: { ...perch.stats } };
        },
        ground: (x: number, z: number) => [G(x, z), W(x, z)],
      },
    });
  },
  after(ctx, mode, dt) {
    clock += dt;
    night = ctx.night;
    if (forceAt >= 0) forced(ctx);
    maybe(ctx, mode, dt);
    answer(ctx);
    step(ctx, mode, dt);
    camera(ctx, dt);
    reaction(ctx, dt);
  },
  frame(f: MapFrame) {
    night = f.night;
  },
  setMode(next, _prev, ctx) {
    // Back to the map: it is the troop's again at once, back with them (not left up on a wall), his face his own.
    if (next === 'overview') {
      if (ag && phase !== 'answer') {
        const p = THIEF.pose;
        const g = G(home.x, home.z);
        p.x = home.x;
        p.z = home.z;
        p.y = Number.isNaN(g) ? home.y : g;
      }
      end('sit', 3);
      steer = false;
      if (faceOurs) explorer?.showFace(null);
      faceOurs = false;
      heyAt = watchUntil = -1;
      mealWas = false;
      return;
    }
    // (off his feet: the camera is the new mode's; before it got there, step() sees the snack is gone and gives up)
    if (next !== 'walk') camOut = true;
    if (next !== 'walk' && BEFORE.has(phase)) step(ctx, next, 0);
  },
  fromUrl(q, ctx) {
    keepView = q.has('rcam');
    const v = q.get('monkey');
    if (!v) return;
    if (!THIEF.ground) return void console.warn('[map] monkey=: no troops (the fauna part is not on the map)');
    if (v === 'steal') {
      night = ctx.night;
      if (night > NIGHT) console.info('[map] monkey=steal: night, the monkeys sleep (no theft)');
      // (now, or on the first step his meal is in his hands: `act=eat&food=…` starts it then)
      else forceAt = clock + 1;
    } else if (v.startsWith('feast')) feastFromUrl(v.slice(6) || 'fruit', ctx);
  },
  report() {
    if (phase === 'off' || phase === 'answer') return null;
    if (BEFORE.has(phase) || (phase === 'leap' && !got)) return { monkey: 'steal' };
    if (phase === 'sulk' || phase === 'backoff' || phase === 'home' || phase === 'down' || phase === 'finish') return null;
    return { monkey: `feast:${foodId}` };
  },
});
