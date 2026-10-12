import { Vector3 } from 'three';
import { PRAY } from '../../character/clips';
import { OFFER_HAT, OFFER_KNEEL, OFFER_RISE, offerPose, offerPoseState } from '../../character/offer';
import '../audio/_dakbat';
import { SFX } from '../audio/addonSfx';
import { TIME } from '../time';
import { num, t } from '../ui/lang';
import type { AddonHold } from './_addons';
import { BLESS, BLESS_SEATS, GIFT, seatBefore, seatFront, type BlessSeat } from './_blessingHooks';
import { DAK, DAK_NEAR, DAK_SIDE, type AlmsMonk } from './_dakBatHooks';
import { GIVING, takeGift } from './_giveFruit';
import { OFFER, OFFER_STAND } from './_offerFruitHooks';
import { FRUIT_SIZE, TRAY_R, type LaidPool, type OfferKind } from './_offerFruitModels';
import { asking, BU, countMerit, fruitWord, hatOff, hatOn, hideHand, offerKind, OFFER_ID, prompt, ramp, RIM, S, showHand, showHandAt, smooth, toBody, toMap } from './_offerFruitShared';
import { angleDiff } from './followCam';
import type { RoamCtx } from './types';

/**
 * Offering his garden's fruit to the monks (ប្រគេន), the offering add-on's
 * second half (roam/_offerFruit.ts holds the registration):
 *
 * - **A monk he meets** standing or walking (people/_offerBack.ts finds him:
 *   `OFFER.find`): "E  ប្រគេនចេកព្រះសង្ឃ / Offer bananas to the monk". The monk
 *   stops and turns to him; he steps before him, takes his hat off, bows a
 *   little and holds the fruit out in both hands; the monk takes it in both of
 *   his, raises his right hand in blessing and chants the thanks for a gift and
 *   the four blessings (bubbles) while he sampeahs, bowed. One gift a monk a day:
 *   again, the monk smiles and says so, nothing taken (`OFFER.given`).
 * - **The dawn alms round** (dak bat: roam/_dakBatHooks.ts `DAK`, as the rice in
 *   roam/_dakBat.ts): with fruit and no sticky rice in his bag, as a line of
 *   monks comes his way, "E  ដាក់ចេកក្នុងបាត្រព្រះសង្ឃ / Put bananas in the monk's
 *   bowl". He kneels by the way the prayer's way with the fruit on his lap; the
 *   first monk not past him steps over and lifts his bowl's lid; he rises on his
 *   knees and lays the fruit in with both hands, sits back, palms together, while
 *   the monks chant the blessing (`dakChant`), bows once to the ground and gets
 *   up; the monks walk on.
 * - **The blessing monk** on his dais (roam/_blessingHooks.ts `BLESS`: the
 *   village pagoda's hall, Kulen's reclining Buddha): "E  ប្រគេនចេកព្រះសង្ឃ ·
 *   J …". He walks to 1.5 m before him, kneels, lifts the fruit on its tray to
 *   his forehead and holds it out; the monk leans forward and takes it in both
 *   hands (`BLESS.ask` state `gift`: people/_sceneBlessing.ts), sets it on his
 *   dais beside him (it stays a few map hours) and chants the thanks for it while
 *   he sits back, palms together; he bows to the floor and gets up. Then "Ask for
 *   a blessing" as ever. Once a day each.
 *
 * E, Space or the stick leaves off (the fruit stays his unless the monk has it);
 * back to the map stops at once. Counted with the shrines' (`offer.count`) and
 * on its own (`offer.monks`).
 */

type Who = 'met' | 'bowl' | 'bless';
type Step = 'off' | 'go' | 'turn' | 'step' | 'down' | 'settle' | 'wait' | 'lift' | 'rise' | 'out' | 'take' | 'sit' | 'bless' | 'bow' | 'again' | 'leave' | 'up' | 'back';

/** Times (s). */
const TURN = 0.45;
const KNEEL_RATE = 1.15;
const SETTLE = 0.6;
const STEP_MAX = 0.9;
/** A monk met: holding it out, the take (the fruit is his at `TAKE_AT`), the blessing, a gift again. */
const OUT = 1.25;
const TAKE = 1.35;
const TAKE_AT = 0.6;
const BLESS_FOR = 5.9;
const AGAIN = 3.4;
const UP = 0.6;
/** Dak bat: rising on his knees, laying it in (let go at `IN_AT`), sitting back, the chant, the bow; waiting at most (s). */
const RISE = 0.55;
const IN = 1.55;
const IN_AT = 1.15;
const SIT = 0.75;
const CHANT = 6.6;
const BOW = 1.5;
const ANSWER = 5.5;
const WAIT_MAX = 90;
/** The blessing monk: the lift to his forehead (s), the gift's own clock (`GIFT`, roam/_blessingHooks.ts). */
const LIFT = 1.7;
/** Leaving off part way: the hands back (s). */
const LEAVE = 0.55;
/** The stick past this (or Space, E) leaves off. */
const STICK = 0.35;
/** He kneels this far before the blessing monk to give (m from the seat along his facing). */
const GIFT_KNEEL = 1.32;
/** At the alms round the monk comes this near for fruit (m, feet to feet: nearer than for the rice's spoon, his arms are short). */
const BOWL_STAND = 1.15;
/** Walking to a place (m/s), there within (m). */
const WALK = 1.15;
const THERE = 0.08;

/** The gift's place (BU, his space): standing before his chest; kneeling up before his chest, at his forehead; on his lap on his heels. */
const CHEST_STAND = new Vector3(0, 14.6, 5.6);
const CHEST_KNEEL = new Vector3(0, 10.2, 5.4);
const BROW_KNEEL = new Vector3(0, 15.6, 6.2);
const LAP = new Vector3(0, 7.2, 5.8);
/** His fists' half width round the fruit alone (BU: the fruit's own half, a little more), round a tray. */
const halfOf = (k: OfferKind) => Math.min(3.1, FRUIT_SIZE[k].half / BU + 0.25);
const TRAY_HALF = TRAY_R / BU + 0.3;

/** The camera while he gives: from his side, a little above and near (eased for `FOR` s after each change, then the player's). */
const FRAME = { side: Math.PI / 2 + 0.5, pitch: 0.24, distance: 5.4, rate: 1.8, back: 2.2, for: 3.2 };

let step: Step = 'off';
let who: Who = 'met';
let st = 0;
let kind: OfferKind = 'banana';
const ps = offerPoseState();
const spot = new Vector3();
let facing = 0;
let turnFrom = 0;
let hatTaken = false;
/** The fruit is the monk's (taken from the basket), counted; let go of his hands now. */
let given = false;
let counted = false;
let released = false;
/** Where he walks to (go, step), from where. */
const goTo = new Vector3();
const goFrom = new Vector3();
/** Where the fruit was in his hands as the monk took it (the map), for the handover. */
const from = new Vector3();
let goLen = 0;
/** Dak bat: the monks' way, the line's last answer time. */
let way = 0;
let askedAt = 0;
let gaveLine = '';
let gaveUntil = -1e9;
/** The blessing monk's seat, and the seats given to today (seat id → game day). */
let seat: BlessSeat = BLESS_SEATS[0];
const seatsGiven = new Map<string, number>();
/** The camera: the way it looks from, the player's before, framed for how long. */
let camYaw = 0;
let before: { pitch: number; distance: number } | null = null;
let framed = 0;
let camFree = false;
/** Where the fruit lies in the bowl (the map), the tray on the dais. */
const inBowl = new Vector3();
const onDais = new Vector3();
let laidPool: LaidPool | null = null;

const posture = () => offerPose(ps);
const day = () => Math.floor(TIME.days());
const hasRice = () => !!S.env?.purse.kept.some((k) => k.id === 'dakRice');

/** Monk flows hold him (the add-on's `holding`). */
export const monkHolding = (): boolean => step !== 'off';
export const monkStep = (): string => (step === 'off' ? 'off' : `${who}:${step}`);

export function monkInit(pool: LaidPool): void {
  laidPool = pool;
}

function go(s: Step): void {
  step = s;
  st = 0;
  framed = 0;
}

// ── Who is there ───────────────────────────────────────────────────────────

/** The alms monk coming along his way (dak bat: fresh, on his round, ahead of him and not far off it), or null. */
const NEAREST = { m: null as unknown as AlmsMonk, d: 0 };
function coming(ctx: RoamCtx): { m: AlmsMonk; d: number } | null {
  const p = ctx.body.pos;
  let best: AlmsMonk | null = null;
  let bd = DAK_NEAR;
  for (const m of DAK.monks) {
    if (!m.on || m.t < DAK.now - 0.6 || Math.abs(m.y - p.y) > 2.5) continue;
    const dx = p.x - m.x;
    const dz = p.z - m.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d >= bd) continue;
    const fx = Math.sin(m.yaw);
    const fz = Math.cos(m.yaw);
    if (dx * fx + dz * fz < 0.6 || Math.abs(dx * fz - dz * fx) > DAK_SIDE) continue;
    best = m;
    bd = d;
  }
  if (!best) return null;
  NEAREST.m = best;
  NEAREST.d = bd;
  return NEAREST;
}

/** The blessing seat he stands before with its monk there and free (not given to today), or null. */
function blessSeat(ctx: RoamCtx): BlessSeat | null {
  const s = seatBefore(ctx.body.pos);
  if (!s) return null;
  const m = BLESS.monks[s.id];
  if (BLESS.now - m.t > 1.5 || !m.there || BLESS.ask.state !== 'none' || seatsGiven.get(s.id) === day()) return null;
  return s;
}

/** E's prompt here (on foot): the alms round first, then the blessing monk, then a monk he meets; null: none. */
export function monkOffer(ctx: RoamCtx): string | null {
  const e = S.env;
  if (!e || step !== 'off') return null;
  const k = offerKind();
  if (!k) return null;
  // (with sticky rice in his bag the rice is what he gives at the alms round: roam/_dakBat.ts)
  const c = !hasRice() && coming(ctx);
  if (c && !(c.m.line === gaveLine && DAK.now < gaveUntil)) return prompt('offerBowl', k);
  if (blessSeat(ctx)) return prompt('offerMonk', k, `  ·  J  ${t('listenMonk')}`);
  const b = ctx.body;
  if (seatBefore(b.pos)) return null;
  if (OFFER.find(b.pos.x, b.pos.y, b.pos.z, b.yaw) >= 0) return prompt('offerMonk', k);
  return null;
}

/** E pressed with the prompt: start (the same order as `monkOffer`). */
export function monkUse(ctx: RoamCtx): boolean {
  const k = offerKind();
  if (!k || step !== 'off') return false;
  const c = !hasRice() && coming(ctx);
  if (c && !(c.m.line === gaveLine && DAK.now < gaveUntil)) {
    beginBowl(ctx, c.m, k);
    return true;
  }
  const s = blessSeat(ctx);
  if (s) {
    beginBless(ctx, s, k);
    return true;
  }
  const b = ctx.body;
  if (!seatBefore(b.pos) && OFFER.find(b.pos.x, b.pos.y, b.pos.z, b.yaw) >= 0) {
    beginMet(ctx, k);
    return true;
  }
  return false;
}

function common(ctx: RoamCtx, w: Who, k: OfferKind): void {
  who = w;
  kind = k;
  given = counted = released = false;
  hatTaken = false;
  spot.copy(ctx.body.pos);
  turnFrom = ctx.body.yaw;
  camFree = ctx.shot && ctx.start.has('rcam');
  GIVING.by = OFFER_ID;
  GIVING.t = 0;
  Object.assign(ps, { pray: NaN, stand: w === 'met', rise: 1, lean: 0, side: 0, hold: 0, palms: 0, bow: 0, lookW: 0, half: w === 'bless' ? TRAY_HALF : halfOf(k), t: 0 });
}

function beginMet(ctx: RoamCtx, k: OfferKind): void {
  common(ctx, 'met', k);
  const a = OFFER.ask;
  const b = ctx.body;
  a.n++;
  a.state = 'ask';
  a.t = 0;
  a.x = b.pos.x;
  a.y = b.pos.y;
  a.z = b.pos.z;
  a.yaw = b.yaw;
  a.kind = k;
  a.i = -1;
  facing = b.yaw;
  go('turn');
}

function beginBowl(ctx: RoamCtx, m: AlmsMonk, k: OfferKind): void {
  common(ctx, 'bowl', k);
  const p = ctx.body.pos;
  way = m.yaw;
  // Facing the monks' way across it (at its side), or the monk coming (in it): as roam/_dakBat.ts.
  const lx = Math.cos(way);
  const lz = -Math.sin(way);
  const side = (p.x - m.x) * lx + (p.z - m.z) * lz;
  facing = Math.abs(side) > 1.3 ? Math.atan2(-Math.sign(side) * lx, -Math.sign(side) * lz) : way + Math.PI;
  const a = DAK.ask;
  a.n++;
  a.state = 'ask';
  a.line = m.line;
  a.k = -1;
  a.x = p.x;
  a.y = p.y;
  a.z = p.z;
  a.yaw = facing;
  a.mx = p.x + Math.sin(facing) * BOWL_STAND;
  a.mz = p.z + Math.cos(facing) * BOWL_STAND;
  a.myaw = facing + Math.PI;
  a.rice = 0;
  a.snap = false;
  askedAt = DAK.now;
  camYaw = facing + FRAME.side;
  go('turn');
}

function beginBless(ctx: RoamCtx, s: BlessSeat, k: OfferKind): void {
  common(ctx, 'bless', k);
  seat = s;
  const f = seatFront(s, GIFT_KNEEL, { x: 0, z: 0 });
  facing = s.yaw + Math.PI;
  walkTo(ctx, f.x, s.floor, f.z);
  go('go');
  // (from his left, low: the monk and the Buddha's hall behind)
  camYaw = facing - FRAME.side;
  BLESS.ask.n++;
}

function walkTo(ctx: RoamCtx, x: number, y: number, z: number): void {
  goFrom.copy(ctx.body.pos);
  goTo.set(x, y, z);
  goLen = Math.hypot(x - goFrom.x, z - goFrom.z);
}

// ── Each step while it holds him ───────────────────────────────────────────

/** The input while it holds him: E, Space or the stick leaves off (true: his input is the offering's). */
export function monkInput(ctx: RoamCtx): boolean {
  if (step === 'off') return false;
  const i = ctx.input;
  if (Math.hypot(i.move.x, i.move.y) > STICK || i.jump || i.use) leaveOff();
  ctx.cam.turn(i.lookYaw, i.lookPitch, i.zoom);
  if (i.lookYaw || i.lookPitch) camFree = true;
  return true;
}

/** Leave off now: back on his feet; the fruit stays his unless the monk has it. */
function leaveOff(): void {
  if (step === 'up' || step === 'back' || step === 'leave' || step === 'off') return;
  if (who === 'met') {
    OFFER.ask.state = given ? 'done' : 'none';
    if (given) tell();
    go('leave');
    return;
  }
  if (who === 'bowl') {
    if (step === 'turn') return end();
    if (step === 'down') return go('back');
    DAK.ask.state = given ? 'done' : 'none';
    if (given) tell();
    go('leave');
    return;
  }
  // (the blessing monk: on his way there or turning, simply stop)
  if (step === 'go' || step === 'turn') return end();
  if (step === 'down') return go('back');
  if (given && released) laySetDown();
  BLESS.ask.state = 'none';
  if (given) tell();
  go('leave');
}

/** One step (the walker's step is ours meanwhile). */
export function monkHold(ctx: RoamCtx, dt: number): AddonHold {
  const e = S.env!;
  const { body } = ctx;
  if (asking()) {
    body.vel.set(0, 0, 0);
    return { prompt: null };
  }
  st += dt;
  ps.t += dt;
  GIVING.t += dt;
  body.vel.set(0, 0, 0);
  body.grounded = true;
  let p: string | null = null;
  if (who === 'met') stepMet(ctx, dt);
  else if (who === 'bowl') p = stepBowl(ctx, dt);
  else stepBless(ctx, dt);
  if (step !== 'off') {
    // (walking there: the walk's own legs; else still)
    if (step !== 'go' && step !== 'step') e.explorer.setMotion(0, true, 0);
    frame(ctx, dt);
  }
  return { prompt: p };
}

/** Turning toward `yaw` over `TURN` s from `turnFrom` (true: there). */
function turning(ctx: RoamCtx, yaw: number): boolean {
  const k = smooth(Math.min(1, st / TURN));
  ctx.body.yaw = turnFrom + angleDiff(yaw, turnFrom) * k;
  return k >= 1;
}

/** Walking toward `goTo` (the walk's legs; true: there). */
function walking(ctx: RoamCtx, dt: number): boolean {
  const b = ctx.body;
  const dx = goTo.x - b.pos.x;
  const dz = goTo.z - b.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < THERE) {
    S.env!.explorer.setMotion(0, true, 0);
    return true;
  }
  const v = Math.min(WALK, d * 3);
  const k = Math.min(1, (v * dt) / d);
  b.pos.x += dx * k;
  b.pos.z += dz * k;
  b.pos.y = ctx.world.groundAt(b.pos.x, b.pos.z);
  if (Math.abs(b.pos.y - goTo.y) > 0.6) b.pos.y = goTo.y;
  b.yaw += angleDiff(Math.atan2(dx, dz), b.yaw) * Math.min(1, dt * 8);
  S.env!.explorer.setMotion(v, true, 0);
  return false;
}

/** Into the posture (it places him itself). */
function pose(on: boolean): void {
  const ex = S.env!.explorer;
  if (on) {
    ex.animator.posture = posture;
    ex.animator.postureFeet = false;
  } else if (ex.animator.posture === posture) {
    ex.animator.posture = null;
    ex.animator.postureFeet = true;
  }
}

const _g = new Vector3();
const _h = new Vector3();

// ── A monk met on the way ─────────────────────────────────────────────────

function stepMet(ctx: RoamCtx, dt: number): void {
  const a = OFFER.ask;
  const b = ctx.body;
  a.t = st;
  const answered = a.answered === a.n;
  switch (step) {
    case 'turn': {
      // (the people part answers: the monk who stops; nobody, or no answer for a moment: never mind)
      if (answered && a.i < 0) return end();
      if (!answered) {
        if (st > 1.5) return end();
        return;
      }
      facing = Math.atan2(a.mx - b.pos.x, a.mz - b.pos.z);
      if (turning(ctx, facing)) {
        // Before him, `OFFER_STAND` m off (if the floor there is his own).
        const d = Math.hypot(a.mx - b.pos.x, a.mz - b.pos.z);
        const k = (d - OFFER_STAND) / Math.max(0.01, d);
        const x = b.pos.x + (a.mx - b.pos.x) * k;
        const z = b.pos.z + (a.mz - b.pos.z) * k;
        const g = ctx.world.groundAt(x, z);
        walkTo(ctx, Math.abs(g - b.pos.y) < 0.4 ? x : b.pos.x, b.pos.y, Math.abs(g - b.pos.y) < 0.4 ? z : b.pos.z);
        camYaw = facing + FRAME.side;
        go('step');
      }
      return;
    }
    case 'step': {
      if (walking(ctx, dt) || st > STEP_MAX + goLen / WALK) {
        b.yaw = Math.atan2(a.mx - b.pos.x, a.mz - b.pos.z);
        facing = b.yaw;
        pose(true);
        hatTaken = hatOff();
        a.state = a.again ? 'again' : 'there';
        go(a.again ? 'again' : 'out');
      } else return;
      break;
    }
    case 'out': {
      // Out of his basket before his chest, then held out toward the monk's hands, bowing a little.
      ps.hold = ramp(st, [0, 0.35]);
      ps.lean = ramp(st, [0.3, OUT]);
      toBody(ctx, a.hx, a.hy, a.hz, _h);
      _g.copy(CHEST_STAND).lerp(_h, 0.72 * ramp(st, [0.35, OUT]));
      ps.gift.copy(_g);
      lookAt(_h, ramp(st, [0, 0.4]));
      showHand(kind, ctx, ps.gift, false, smooth(st / 0.3));
      if (st >= OUT) {
        a.state = 'take';
        go('take');
      }
      break;
    }
    case 'take': {
      toBody(ctx, a.hx, a.hy, a.hz, _h);
      // (both hands meet: the fruit at the monk's hands; his own come back once it is the monk's)
      ps.gift.copy(CHEST_STAND).lerp(_h, 0.72 + 0.28 * ramp(st, [0, TAKE_AT]));
      ps.hold = st < TAKE_AT ? 1 : 1 - ramp(st, [TAKE_AT, TAKE_AT + 0.5]);
      ps.lean = 1 - 0.5 * ramp(st, [TAKE_AT, TAKE]);
      lookAt(_h, 1);
      if (!given && st >= TAKE_AT) take();
      if (given) {
        const k = ramp(st, [TAKE_AT, TAKE_AT + 0.3]);
        showHandAt(kind, from.x + (a.hx - from.x) * k, from.y + (a.hy - from.y) * k, from.z + (a.hz - from.z) * k, a.myaw + Math.PI, false, b.scale);
      } else {
        showHand(kind, ctx, ps.gift, false);
        toMap(ctx, ps.gift, from);
      }
      if (st >= TAKE) {
        a.state = 'bless';
        go('bless');
      }
      break;
    }
    case 'bless': {
      // The monk's blessing: palms together at his face, bowed; the fruit goes into the monk's bag.
      showHandAt(kind, a.hx, a.hy, a.hz, a.myaw + Math.PI, false, b.scale, 1 - ramp(st, [0.45, 0.9]));
      ps.hold = 0;
      ps.palms = ramp(st, [0.1, 0.7]);
      ps.lean = 0.5 * (1 - ramp(st, [0, 0.6]));
      ps.bow = 0.9 * ramp(st, [0.5, 1.2]) * (1 - ramp(st, [BLESS_FOR - 0.8, BLESS_FOR]));
      toBody(ctx, a.mx, a.my + 2.4 * (b.scale / 1.4), a.mz, _h);
      lookAt(_h, 1 - ps.bow);
      if (st >= BLESS_FOR) {
        tell();
        a.state = 'done';
        go('up');
      }
      break;
    }
    case 'again': {
      // He had fruit from him today already: the monk smiles and says so; a sampeah, nothing taken.
      ps.palms = ramp(st, [0.2, 0.7]) * (1 - ramp(st, [AGAIN - 0.6, AGAIN]));
      ps.bow = 0.6 * ramp(st, [0.5, 1.1]) * (1 - ramp(st, [AGAIN - 0.9, AGAIN - 0.3]));
      toBody(ctx, a.mx, a.my + 2.4 * (b.scale / 1.4), a.mz, _h);
      lookAt(_h, 1 - ps.bow);
      if (st >= AGAIN) {
        a.state = 'done';
        go('up');
      }
      break;
    }
    case 'leave':
    case 'up':
      settleBack(dt, step === 'leave' ? LEAVE : UP);
      if (!given) showHand(kind, ctx, ps.gift, false, ps.hold);
      else hideHand();
      if (st >= (step === 'leave' ? LEAVE : UP)) end();
      break;
  }
}

/** The hands, the bow, the lean ease back to standing (or kneeling) at rest. */
function settleBack(dt: number, len: number): void {
  const k = Math.min(1, (dt / len) * 3);
  ps.hold += (0 - ps.hold) * k;
  ps.lean += (0 - ps.lean) * k;
  ps.palms += (0 - ps.palms) * k;
  ps.bow += (0 - ps.bow) * k;
  ps.side += (0 - ps.side) * k;
  ps.lookW += (0 - ps.lookW) * k;
}

function lookAt(p: Vector3, w: number): void {
  ps.look.copy(p);
  ps.lookW = w;
}

/** The fruit is the monk's: out of his basket, one gift for this monk today. */
function take(): void {
  given = true;
  takeGift(kind);
  if (who === 'met' && OFFER.ask.i >= 0) OFFER.given.set(OFFER.ask.i, day());
  if (who === 'bless') seatsGiven.set(seat.id, day());
}

/** Counted and told (once). */
function tell(): void {
  if (counted || !S.env) return;
  counted = true;
  const n = countMerit(true);
  S.env.hud.toast(t('offerDoneMonk', { fruit: fruitWord(kind), n: num(n) }));
}

// ── Dak bat: into a monk's bowl ───────────────────────────────────────────

function stepBowl(ctx: RoamCtx, dt: number): string | null {
  const e = S.env!;
  const a = DAK.ask;
  const b = ctx.body;
  b.pos.copy(spot);
  switch (step) {
    case 'turn':
      if (turning(ctx, facing)) {
        b.yaw = facing;
        ps.pray = 0;
        ps.stand = false;
        pose(true);
        SFX.play('dakCloth', 0.8);
        go('down');
      }
      break;
    case 'down':
      ps.pray = Math.min(OFFER_KNEEL, st * KNEEL_RATE);
      if (!hatTaken && ps.pray >= OFFER_HAT.off) hatTaken = hatOff();
      if (ps.pray >= OFFER_KNEEL) {
        ps.pray = NaN;
        go('settle');
      }
      break;
    case 'settle': {
      // Back on his heels, the fruit out of his basket onto his lap in both hands.
      const k = smooth(Math.min(1, st / SETTLE));
      ps.rise = 1 - k;
      ps.hold = smooth(Math.min(1, st / (SETTLE * 0.8)));
      ps.gift.copy(LAP);
      showHand(kind, ctx, ps.gift, false, smooth(st / 0.3));
      lookMonks(ctx);
      if (k >= 1) go('wait');
      break;
    }
    case 'wait': {
      showHand(kind, ctx, ps.gift, false);
      lookMonks(ctx);
      if (askedAt < 0) askedAt = DAK.now;
      if (a.state === 'none' || (a.state === 'ask' && DAK.now - askedAt > ANSWER) || DAK.now - askedAt > WAIT_MAX) {
        e.hud.toast(t('dakMissed'));
        a.state = 'none';
        go('leave');
        break;
      }
      if (a.state === 'there') {
        SFX.play('dakLid', 0.7);
        go('rise');
      }
      return `E  ${t('dakUp')}`;
    }
    case 'rise': {
      const k = smooth(Math.min(1, st / RISE));
      ps.rise = k;
      ps.lean = 0.28 * k;
      ps.gift.copy(LAP).lerp(CHEST_KNEEL, k);
      showHand(kind, ctx, ps.gift, false);
      lookBowl(ctx);
      if (k >= 1) go('out');
      break;
    }
    case 'out': {
      // Over the open bowl, then down into it with both hands; let go, the hands come back.
      const fh = FRUIT_SIZE[kind].high * b.scale;
      inBowl.set(a.bx, a.by + 0.03 * b.scale - fh * 0.15, a.bz);
      toBody(ctx, a.bx, a.by + fh * 0.5 + 0.06 * b.scale, a.bz, _h);
      ps.gift.copy(CHEST_KNEEL).lerp(_h, ramp(st, [0, 0.85]));
      toBody(ctx, inBowl.x, inBowl.y + fh * 0.5, inBowl.z, _g);
      ps.gift.lerp(_g, ramp(st, [0.85, IN_AT]));
      if (given) ps.gift.y += 1.2 * ramp(st, [IN_AT, IN]);
      ps.lean = 0.28 + 0.3 * ramp(st, [0.2, 0.9]);
      ps.hold = st < IN_AT ? 1 : 1 - 0.3 * ramp(st, [IN_AT, IN]);
      lookBowl(ctx);
      if (!given && st >= IN_AT) {
        take();
        SFX.play('dakSpoon', 0.6);
      }
      if (given) showHandAt(kind, inBowl.x, inBowl.y + fh * 0.5, inBowl.z, facing, false, b.scale);
      else showHand(kind, ctx, ps.gift, false);
      if (st >= IN) {
        a.state = 'given';
        go('sit');
      }
      break;
    }
    case 'sit': {
      // Back on his heels, palms together; the lid goes back on over the fruit.
      const k = smooth(Math.min(1, st / SIT));
      ps.rise = 1 - k;
      ps.lean = 0.58 * (1 - k);
      ps.hold = 0.7 * (1 - smooth(Math.min(1, st / (SIT * 0.6))));
      ps.palms = smooth(Math.min(1, Math.max(0, (st - SIT * 0.35) / (SIT * 0.65))));
      ps.lookW *= 1 - k;
      if (st < 0.3) showHandAt(kind, inBowl.x, inBowl.y + FRUIT_SIZE[kind].high * b.scale * 0.5, inBowl.z, facing, false, b.scale, 1 - smooth(st / 0.3));
      else hideHand();
      if (st > 0.15 && st - dt <= 0.15) SFX.play('dakLid', 0.6);
      if (k >= 1) {
        a.state = 'bless';
        SFX.play('dakChant', 0.6);
        go('bless');
      }
      break;
    }
    case 'bless':
      if (st >= CHANT) go('bow');
      break;
    case 'bow': {
      const k = st / BOW;
      ps.bow = k < 0.38 ? smooth(k / 0.38) : k < 0.6 ? 1 : 1 - smooth((k - 0.6) / 0.4);
      ps.palms = 1 - smooth(Math.min(1, k / 0.5));
      if (k >= 1) {
        ps.bow = ps.palms = 0;
        a.state = 'done';
        gaveLine = a.line;
        gaveUntil = DAK.now + 120;
        tell();
        ps.pray = OFFER_RISE;
        SFX.play('dakCloth', 0.8);
        go('up');
      }
      break;
    }
    case 'leave':
      settleBack(dt, LEAVE);
      ps.rise += (0 - ps.rise) * Math.min(1, (dt / LEAVE) * 3);
      if (!given) showHand(kind, ctx, ps.gift, false, ps.hold);
      else hideHand();
      if (st >= LEAVE) {
        hideHand();
        ps.pray = OFFER_RISE;
        go('up');
      }
      break;
    case 'up':
      ps.pray = Math.min(PRAY.duration, OFFER_RISE + st * KNEEL_RATE);
      if (hatTaken && ps.pray >= OFFER_HAT.on) {
        hatTaken = false;
        hatOn();
      }
      if (ps.pray >= PRAY.duration - 0.05) end();
      break;
    case 'back':
      ps.pray = Math.max(0, (Number.isNaN(ps.pray) ? OFFER_KNEEL : ps.pray) - dt * KNEEL_RATE * 1.3);
      if (hatTaken && ps.pray < OFFER_HAT.off) {
        hatTaken = false;
        hatOn();
      }
      if (ps.pray <= 0) end();
      break;
  }
  return null;
}

/** Looking at the monk coming (his head). */
function lookMonks(ctx: RoamCtx): void {
  const c = coming(ctx);
  if (c) {
    toBody(ctx, c.m.x, c.m.y + 2.6, c.m.z, _h);
    lookAt(_h, 1);
  }
}
/** Looking into the monk's open bowl. */
function lookBowl(ctx: RoamCtx): void {
  const a = DAK.ask;
  toBody(ctx, a.bx, a.by, a.bz, _h);
  lookAt(_h, 1);
}

// ── The blessing monk ─────────────────────────────────────────────────────

function stepBless(ctx: RoamCtx, dt: number): void {
  const b = ctx.body;
  const m = BLESS.monks[seat.id];
  if (step !== 'go') b.pos.copy(spot);
  // (the monk gone meanwhile — the hour, a festival —: he gets up)
  if (step !== 'up' && step !== 'leave' && step !== 'back' && (!m || BLESS.now - m.t > 1.5)) leaveOff();
  switch (step) {
    case 'go':
      if (walking(ctx, dt) || st > 1.2 + goLen / WALK) {
        spot.copy(b.pos);
        turnFrom = b.yaw;
        go('turn');
      }
      break;
    case 'turn':
      if (turning(ctx, facing)) {
        b.yaw = facing;
        ps.pray = 0;
        ps.stand = false;
        pose(true);
        tellBless('gift', 0, b);
        go('down');
      }
      break;
    case 'down':
      ps.pray = Math.min(OFFER_KNEEL, st * KNEEL_RATE);
      if (!hatTaken && ps.pray >= OFFER_HAT.off) hatTaken = hatOff();
      if (ps.pray >= OFFER_KNEEL) {
        ps.pray = NaN;
        ps.rise = 1;
        go('lift');
      }
      break;
    case 'lift': {
      // The tray out of his basket before his chest, up to his forehead, his head bowed, and down again.
      ps.hold = ramp(st, [0, 0.4]);
      const up = ramp(st, [0.4, 0.95]) * (1 - ramp(st, [1.25, LIFT]));
      ps.gift.copy(CHEST_KNEEL).lerp(BROW_KNEEL, up);
      if (up > 0.5) lookAt(_h.set(0, 2, 16), 0.8);
      else lookMonk(ctx, 0.9);
      showHand(kind, ctx, ps.gift, true, smooth(st / 0.3));
      if (st >= LIFT) go('out');
      break;
    }
    case 'out': {
      // Held out to the monk's hands; he leans forward and takes it in both of his (`GIFT`), sets it down beside him.
      tellBless('gift', st, b);
      toBody(ctx, m.hx, m.hy, m.hz, _h);
      const to = ramp(st, [0, GIFT.take]);
      ps.gift.copy(CHEST_KNEEL).lerp(_h, to);
      ps.lean = 0.45 * to * (1 - ramp(st, [GIFT.take + 0.2, GIFT.set]));
      ps.hold = st < GIFT.take ? 1 : 1 - ramp(st, [GIFT.take, GIFT.take + 0.5]);
      lookMonk(ctx, 0.9);
      if (!given && st >= GIFT.take) {
        take();
        released = true;
      }
      if (!released) {
        showHand(kind, ctx, ps.gift, true);
        toMap(ctx, ps.gift, from);
      } else {
        // (into the monk's hands, then down onto his dais beside him)
        daisSpot(onDais);
        const h = ramp(st, [GIFT.take, GIFT.take + 0.3]);
        const hx = from.x + (m.hx - from.x) * h;
        const hy = from.y + (m.hy - from.y) * h;
        const hz = from.z + (m.hz - from.z) * h;
        const k = ramp(st, [GIFT.set, GIFT.down]);
        const lift = Math.sin(k * Math.PI) * 0.12;
        showHandAt(kind, hx + (onDais.x - hx) * k, hy + (onDais.y + RIM * b.scale - hy) * k + lift, hz + (onDais.z - hz) * k, seat.yaw + Math.PI, true, b.scale);
        if (st >= GIFT.down) {
          laySetDown();
          go('bless');
        }
      }
      break;
    }
    case 'bless': {
      // Back on his heels, palms together, while the monk chants his thanks for it; one bow to the floor.
      tellBless('gift', GIFT.down + st, b);
      const k = smooth(Math.min(1, st / SIT));
      ps.rise = 1 - k;
      ps.lean *= 1 - k;
      ps.palms = smooth(Math.min(1, Math.max(0, (st - 0.2) / 0.5)));
      lookMonk(ctx, 0.9 * (1 - ps.bow));
      if (GIFT.down + st >= GIFT.end) go('bow');
      break;
    }
    case 'bow': {
      tellBless('gift', GIFT.end + st, b);
      const k = st / BOW;
      ps.bow = k < 0.38 ? smooth(k / 0.38) : k < 0.6 ? 1 : 1 - smooth((k - 0.6) / 0.4);
      ps.palms = 1 - smooth(Math.min(1, k / 0.5));
      if (k >= 1) {
        ps.bow = ps.palms = 0;
        tell();
        BLESS.ask.state = 'none';
        ps.pray = OFFER_RISE;
        go('up');
      }
      break;
    }
    case 'leave':
      settleBack(dt, LEAVE);
      ps.rise += (0 - ps.rise) * Math.min(1, (dt / LEAVE) * 3);
      if (!released) showHand(kind, ctx, ps.gift, true, ps.hold);
      else hideHand();
      if (st >= LEAVE) {
        hideHand();
        ps.pray = OFFER_RISE;
        go('up');
      }
      break;
    case 'up':
      ps.pray = Math.min(PRAY.duration, OFFER_RISE + st * KNEEL_RATE);
      // (his hat back on only out of the hall: in it, the blessing add-on keeps it off)
      if (hatTaken && ps.pray >= OFFER_HAT.on) {
        hatTaken = false;
        hatOn();
      }
      if (ps.pray >= PRAY.duration - 0.05) end();
      break;
    case 'back':
      ps.pray = Math.max(0, (Number.isNaN(ps.pray) ? OFFER_KNEEL : ps.pray) - dt * KNEEL_RATE * 1.3);
      if (ps.pray <= 0) end();
      break;
  }
}

/** The blessing monk's state for the people part (`BLESS.ask`: the gift's clock, where he kneels). */
function tellBless(state: 'gift', tt: number, b: { pos: Vector3 }): void {
  const a = BLESS.ask;
  a.state = state;
  a.t = tt;
  a.id = seat.id;
  a.x = b.pos.x;
  a.y = seat.floor;
  a.z = b.pos.z;
}

function lookMonk(ctx: RoamCtx, w: number): void {
  toBody(ctx, seat.x, seat.y + 1.5, seat.z, _h);
  lookAt(_h, w);
}

/** Where the tray goes on the dais beside the monk: before him at his left, by the plate (map m, on the dais top). */
function daisSpot(out: Vector3): Vector3 {
  const fx = Math.sin(seat.yaw);
  const fz = Math.cos(seat.yaw);
  // (his left: +x of his own frame)
  const lx = Math.cos(seat.yaw);
  const lz = -Math.sin(seat.yaw);
  return out.set(seat.x + fx * 0.36 + lx * 0.72, seat.dais.top, seat.z + fz * 0.36 + lz * 0.72);
}

/** The tray on the dais for a few map hours. */
function laySetDown(): void {
  if (!released) return;
  released = false;
  daisSpot(onDais);
  laidPool?.lay(kind, `bless-${seat.id}`, onDais.x, onDais.y, onDais.z, seat.yaw + Math.PI, S.env?.body.scale ?? 1.4, TIME.days());
  hideHand();
}

// ── The camera ─────────────────────────────────────────────────────────────

/** From his side, a little above, between him and the monk; eased after each change, then the player's. */
function frame(ctx: RoamCtx, dt: number): void {
  const { cam, body } = ctx;
  if (step === 'go') return;
  const s = body.scale / 1.4;
  let fx = body.pos.x;
  let fz = body.pos.z;
  if (who === 'met' && OFFER.ask.answered === OFFER.ask.n && OFFER.ask.i >= 0) {
    fx = (body.pos.x + OFFER.ask.mx) / 2;
    fz = (body.pos.z + OFFER.ask.mz) / 2;
  } else if (who === 'bowl' && (DAK.ask.state === 'there' || DAK.ask.state === 'given' || DAK.ask.state === 'bless')) {
    fx = (body.pos.x + DAK.ask.bx) / 2;
    fz = (body.pos.z + DAK.ask.bz) / 2;
  } else if (who === 'bless') {
    fx = body.pos.x + (seat.x - body.pos.x) * 0.45;
    fz = body.pos.z + (seat.z - body.pos.z) * 0.45;
  }
  cam.focus.set(fx, body.pos.y + (who === 'met' ? 1.5 : 1.2) * s, fz);
  if (camFree) return;
  before ??= { pitch: cam.pitch, distance: cam.distance };
  framed += dt;
  if (framed > FRAME.for) return;
  const k = 1 - Math.exp(-FRAME.rate * dt);
  cam.yaw += angleDiff(camYaw, cam.yaw) * k;
  cam.behindYaw = camYaw;
  cam.pitch += (FRAME.pitch - cam.pitch) * k;
  cam.distance += (FRAME.distance * s - cam.distance) * k;
}

/** Back to the player's own pitch and distance (eased; null: at once). */
export function monkFrame(dt: number | null): void {
  const e = S.env;
  if (!e || !before || step !== 'off') return;
  const cam = e.cam;
  const k = dt === null ? 1 : 1 - Math.exp(-FRAME.back * dt);
  cam.pitch += (before.pitch - cam.pitch) * k;
  cam.distance += (before.distance - cam.distance) * k;
  if (dt === null || (Math.abs(before.pitch - cam.pitch) < 0.005 && Math.abs(before.distance - cam.distance) < 0.05)) before = null;
}

// ── The end ────────────────────────────────────────────────────────────────

/** All done (or stopped at once: `now`): his pose, hands, hat back; the monk let go. */
export function end(now = false): void {
  if (step === 'off') return;
  pose(false);
  hideHand();
  if (hatTaken) {
    hatTaken = false;
    hatOn();
  }
  if (who === 'met') {
    if (OFFER.ask.state !== 'none') OFFER.ask.state = given ? 'done' : 'none';
  } else if (who === 'bowl') {
    if (DAK.ask.state !== 'none' && DAK.ask.state !== 'done') DAK.ask.state = given ? 'done' : 'none';
  } else {
    if (released) laySetDown();
    if (BLESS.ask.state === 'gift') BLESS.ask.state = 'none';
  }
  if (given && (now || who !== 'bowl')) tell();
  if (GIVING.by === OFFER_ID) GIVING.by = null;
  step = 'off';
  st = 0;
  if (now) monkFrame(null);
}

// ── Checks ─────────────────────────────────────────────────────────────────

/**
 * A check's start (`offer=monk|dakbat|bless[:<step>[:<s>]]`): `monk` asks the monk in front of him as E would
 * (`monk:take`, `monk:bless`, `monk:again` that far at once); `dakbat` kneels him by a line's way with the fruit
 * on his lap, the monks coming (`dakbat:give` the monk before him, his bowl open; `dakbat:bless` the chant);
 * `bless` starts the gift to the blessing monk before him (`bless:out[:<s>]` holding it out, s s in).
 */
export function monkFromUrl(ctx: RoamCtx, what: string, arg: string | undefined, sIn: number, k: OfferKind): void {
  if (what === 'monk') {
    beginMet(ctx, k);
    if (arg === 'again') OFFER.given.set(OFFER.find(ctx.body.pos.x, ctx.body.pos.y, ctx.body.pos.z, ctx.body.yaw), day());
    urlTo = arg && arg !== 'again' ? (arg as Step) : null;
    urlAt = sIn;
    return;
  }
  if (what === 'dakbat') {
    const c = coming(ctx);
    // (the monks' way: the line coming, else across before him)
    const p = ctx.body.pos;
    common(ctx, 'bowl', k);
    facing = ctx.body.yaw;
    way = c ? c.m.yaw : facing + Math.PI;
    DAK.pin = { x: p.x, z: p.z };
    const a = DAK.ask;
    a.n++;
    a.state = arg === 'give' ? 'there' : arg === 'bless' ? 'bless' : 'ask';
    a.line = c?.m.line ?? '';
    a.k = -1;
    a.x = p.x;
    a.y = p.y;
    a.z = p.z;
    a.yaw = facing;
    a.mx = p.x + Math.sin(facing) * BOWL_STAND;
    a.mz = p.z + Math.cos(facing) * BOWL_STAND;
    a.myaw = facing + Math.PI;
    a.rice = 0;
    a.snap = arg === 'give' || arg === 'bless';
    askedAt = -1;
    camYaw = facing + FRAME.side;
    ps.pray = NaN;
    ps.stand = false;
    ps.rise = arg === 'give' ? 1 : 0;
    ps.hold = arg === 'bless' ? 0 : 1;
    ps.palms = arg === 'bless' ? 1 : 0;
    ps.gift.copy(arg === 'give' ? CHEST_KNEEL : LAP);
    pose(true);
    hatTaken = hatOff();
    if (arg === 'bless') {
      given = true;
      takeGift(k);
    }
    go(arg === 'give' ? 'out' : arg === 'bless' ? 'bless' : 'wait');
    st = arg === 'give' ? sIn : 0;
    return;
  }
  if (what === 'bless') {
    const s = seatBefore(ctx.body.pos) ?? BLESS_SEATS.reduce((p, q) => (Math.hypot(q.x - ctx.body.pos.x, q.z - ctx.body.pos.z) < Math.hypot(p.x - ctx.body.pos.x, p.z - ctx.body.pos.z) ? q : p));
    common(ctx, 'bless', k);
    seat = s;
    facing = s.yaw + Math.PI;
    camYaw = facing - FRAME.side;
    BLESS.ask.n++;
    if (arg === 'out' || arg === 'lift' || arg === 'bless') {
      // (kneeling at his place already)
      const f = seatFront(s, GIFT_KNEEL, { x: 0, z: 0 });
      ctx.body.pos.set(f.x, s.floor, f.z);
      ctx.body.yaw = facing;
      spot.copy(ctx.body.pos);
      ps.pray = NaN;
      ps.stand = false;
      ps.rise = 1;
      pose(true);
      hatTaken = hatOff();
      tellBless('gift', 0, ctx.body);
      go(arg === 'bless' ? 'out' : (arg as Step));
      if (arg === 'bless') urlTo = 'bless';
      st = arg === 'out' ? sIn : 0;
      return;
    }
    const f = seatFront(s, GIFT_KNEEL, { x: 0, z: 0 });
    walkTo(ctx, f.x, s.floor, f.z);
    go('go');
  }
}
/** A check's step to go on to at once (the met monk: once he answers), `urlAt` s into it. */
let urlTo: Step | null = null;
let urlAt = 0;

/** A check's jump (each step, after the people part has answered): on to `urlTo`. */
export function monkUrlJump(ctx: RoamCtx): void {
  if (!urlTo || step === 'off') return;
  if (who === 'met') {
    const a = OFFER.ask;
    if (a.answered !== a.n) return;
    if (a.i < 0) {
      urlTo = null;
      return;
    }
    // (stood before him, the steps up to `urlTo` done at once)
    const b = ctx.body;
    const d = Math.hypot(a.mx - b.pos.x, a.mz - b.pos.z);
    const k = (d - OFFER_STAND) / Math.max(0.01, d);
    b.pos.x += (a.mx - b.pos.x) * k;
    b.pos.z += (a.mz - b.pos.z) * k;
    b.yaw = facing = Math.atan2(a.mx - b.pos.x, a.mz - b.pos.z);
    spot.copy(b.pos);
    pose(true);
    hatTaken = hatOff();
    if (urlTo === 'bless') {
      take();
      ps.hold = 0;
    } else ps.hold = 1;
    ps.lean = urlTo === 'take' ? 1 : 0.5;
    a.state = urlTo === 'take' ? 'take' : urlTo === 'bless' ? 'bless' : 'there';
    go(urlTo === 'take' || urlTo === 'bless' ? urlTo : 'out');
    st = urlAt;
    urlTo = null;
    return;
  }
  if (who === 'bless' && urlTo === 'bless') {
    // (the tray set on his dais already: the monk's thanks)
    take();
    released = true;
    laySetDown();
    go('bless');
    st = urlAt;
    urlTo = null;
  }
}

/** URL params that bring it back (bug reports), or null. */
export function monkReport(): Record<string, string> | null {
  if (step === 'off') return null;
  const at = (s: number) => Math.max(0, s - 0.6).toFixed(1);
  if (who === 'met') return { offer: step === 'again' ? 'monk:again' : step === 'take' || step === 'bless' ? `monk:${step}:${at(st)}` : 'monk', offerkind: kind, sim: '_:0.6' };
  if (who === 'bowl') return { offer: step === 'out' || step === 'rise' ? `dakbat:give:${at(st)}` : step === 'bless' || step === 'bow' ? 'dakbat:bless' : 'dakbat', offerkind: kind, sim: '_:0.6' };
  return { offer: step === 'out' ? `bless:out:${at(st)}` : step === 'bless' || step === 'bow' ? 'bless:bless' : 'bless', offerkind: kind, sim: '_:0.6' };
}

/** Back to the map or another mode: it stops at once. */
export function monkStop(): void {
  end(true);
}

/** Checks: the state from the console. */
export function monkNow(): Record<string, unknown> {
  return { step, who, st: +st.toFixed(2), kind, given, released, ask: { ...OFFER.ask }, dak: DAK.ask.state, bless: BLESS.ask.state, seatsGiven: [...seatsGiven] };
}
