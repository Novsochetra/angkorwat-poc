import { Vector3 } from 'three';
import { CROUCH_U, cartLift, cartSeatPose, type CartSeatState } from '../../character/cartRide';
import '../audio/_cart';
import { SFX } from '../audio/addonSfx';
import { CART, RIDER, type CartPoint } from '../people/_cartHook';
import { pad } from '../pad/pad';
import { lang, t } from '../ui/lang';
import { addonBusy, registerAddon, type AddonEnv, type AddonHold } from './_addons';
import { angleDiff } from './followCam';
import type { RoamCtx } from './types';
import { stepSound } from './walker';

/**
 * Riding the ox cart (the people's, people/_sceneCart.ts: two white oxen, the
 * farmer driving, round its loop on the village trail between the village
 * and the valley road's end, half a minute and more at each end's stop).
 *
 * On foot just behind its tail, while it stands or rolls at its slow walking
 * pace, E ("E  Ride the ox cart"): he turns his back to it, crouches and
 * springs up onto its back; the farmer has let the tailboard down flat and he
 * sits on it, legs hanging over the end, fists on the edge, facing back down
 * the trail, swaying with the cart (character/cartRide.ts). The farmer turns
 * round on his seat and welcomes him aboard (a bubble: his words in
 * ui/lang.ts), says "on we go" when the cart leaves a stop with him, and
 * "the oxen need their rest" if it stands for the night. The cart goes on
 * round its loop at its own pace; he only rides. The camera follows the cart
 * from behind it (the drag looks round; it rises over the cart and the oxen
 * rather than ever going into them). E (or Space): a small hop off the end
 * onto the ground, at any speed — only where there is land to come down on (no
 * water, no wall): the prompt waits for it. Back to the map (Esc): he is off
 * at once, and the cart goes on.
 *
 * A walk-mode add-on that holds him (`holding`, as the rope swing). It also
 * keeps him out of the cart and the oxen on foot (they are not on the walk
 * map): walking into them, or with the cart swinging round at a turn, he is
 * eased out to their side. The cart and the ride share `people/_cartHook.ts`.
 *
 * Sounds: the cart's creak and the oxen's bells are the people's (close by on
 * its back); the wheels rolling and a hub's knock are his (audio/_cart.ts).
 *
 * URL: `cartride=1` puts him on the cart's back at once (with `cart=<m>`, its
 * place on its loop, and `at=` near it, so the cart is drawn: within ~400 m);
 * `cartride=on` stands him behind its tail and climbs on as E would (the
 * farmer's welcome follows). `rcam=` with it turns from behind the cart
 * (0: behind it, looking the way it goes). `sim=_:1,e:0.1,_:0.3` hops off.
 */

/** Seconds to climb on (turn, crouch, spring up and sit) and to hop off (to the ground and up straight). */
const CLIMB = 1.05;
const HOP = 0.62;
/** The hop's rise over the straight line (m). */
const ARC_ON = 0.35;
const ARC_OFF = 0.25;
/** Fastest the cart may go to be climbed on (m/s: its walking pace is 0.75). */
const BOARD_SPEED = 0.8;
/** The seat (cart space, true m): on the let-down tailboard, at the end of the bed. */
const SEAT: [number, number, number] = [0, 0.915, -1.17];
/** Where he stands to climb on (cart space, true m: on the ground behind the tail), and how near it his feet must be (m) and how level with it. */
const BOARD: [number, number, number] = [0, 0, -1.75];
const BOARD_REACH = 1.35;
const BOARD_RISE = 1.2;
/** The camera's focus over his feet standing, and over the seat sitting (m). */
const FOCUS_STAND = 1.94;
const FOCUS_SIT = 0.85;
/**
 * The cart and the oxen as boxes (m on the map from the cart's axle and the yoke:
 * along, across): what he keeps out of on foot. And how high what stands on them
 * reaches (m over the ground), along the cart: his own seat on the tailboard
 * (nothing: the camera may look at him from there), the load, the farmer with his
 * hat, the pole; the oxen's humps and horns.
 */
const CART_BOX = { back: -1.85, front: 2.7, half: 1.3 };
const OXEN_BOX = { back: -2.45, front: 1.45, half: 1.05 };
const SEAT_END = -1.35;
const LOAD_END = 0.9;
const FARMER_END = 2.2;
const LOAD_TOP = 2.45;
const FARMER_TOP = 3.4;
const POLE_TOP = 1.95;
const OXEN_TOP = 2.25;
/** His head over the camera's focus (m): what the camera keeps in view over the cart. */
const HEAD_UP = 0.45;
/** His body's radius on foot (m: the walker's 0.3 × his size). */
const BODY_R = 0.42;
/** The camera's line to his head keeps this far over what stands on the cart and the oxen (m), and this far out round them, then less over this much more (m). */
const CAM_OVER = 0.15;
const CAM_MARGIN = 0.5;
const CAM_RAMP = 1.0;
/** Points along that line looked at (from his head out to the camera). */
const CAM_SAMPLES = 14;
/**
 * Turned round towards the front of the cart (from this far round from behind it,
 * rad, to this far), the camera rises to look down over the whole cart at him, up
 * to this tilt (rad): from low in front, the farmer and the load would fill the view.
 */
const FRONT_FROM = 1.75;
const FRONT_TO = 2.75;
const FRONT_PITCH = 0.72;
/** The camera rides behind the cart and this far round to its side (rad): him, the cart and the oxen in one view; and its tilt (rad) and distance (m) as he gets on. */
const VIEW_TURN = 0.55;
const VIEW_PITCH = 0.26;
const VIEW_DIST = 9;
/** After hopping off, no "ride" prompt for this long (s): it would come up as he lands. */
const AGAIN = 1.5;
/** A hub knocks every this far the cart goes (m). */
const KNOCK_EVERY = 1.6;

type Phase = 'none' | 'on' | 'ride' | 'off';

let env: AddonEnv | null = null;
let phase: Phase = 'none';
/** Where he is between standing (0) and sitting (1) (character/cartRide.ts). */
let u = 0;
let clock = 0;
/** From the URL: put him on it (`ride`) or climb on (`board`) once the cart is there; the camera's turn from behind it then. */
let pending: 'ride' | 'board' | null = null;
let urlCam: number[] | null = null;
/** The camera as it was (put back when he is off), and the lowest pitch now (eased). */
let before: { pitchMin: number; follow: number; minDistance: number; maxDistance: number } | null = null;
let floor = 0;
/** Where he stood to climb on, where he comes down (map, his feet), whether he is down yet. */
const from = new Vector3();
const land = new Vector3();
let landed = false;
/** The landing spot looked for every few steps while he rides (null: no land there now). */
let spot: Vector3 | null = null;
let spotWait = 0;
/** The cart's travel since the last hub knock, and where it was last step (m along its loop). */
let rolled = 0;
let lastS = Number.NaN;
/** Seconds until E may offer the ride again (after hopping off). */
let again = 0;
/** Which side of the cart the camera rides on (+1 / −1: the one with room, trees and walls aside), looked at again every so often. */
let side = 1;
let sideWait = 0;
const seat = new Vector3();
const _p = new Vector3();
const _cand = new Vector3();
const ps: CartSeatState = { u: 0, roll: 0, pitch: 0, bump: 0, go: 0, t: 0 };
/** What `hold` returns (one object, filled each step). */
const HELD: AddonHold = { prompt: null, mode: null };
const held = (prompt: string | null): AddonHold => {
  HELD.prompt = prompt;
  return HELD;
};
const posture = () => cartSeatPose(ps);

/** A prompt made once a language (offer runs every step: no new string each time). */
function cached(make: () => string): () => string {
  let l = '';
  let s = '';
  return () => {
    if (l !== lang()) {
      l = lang();
      s = make();
    }
    return s;
  };
}
const ridePrompt = cached(() => `E  ${t('cartRide')}`);
const offPrompt = cached(() => `E  ${t('cartOff')}`);

const smooth = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

/** A point of the cart (its space, true m) on the map, into `out` (false: no cart). */
function cartPoint(x: number, y: number, z: number, out: CartPoint): boolean {
  if (!CART.point) return false;
  CART.point(x, y, z, out);
  return true;
}

/** The seat now, `ahead` s on (the cart moves after roaming each frame: where it will be when drawn). */
function seatNow(ahead: number): void {
  cartPoint(SEAT[0], SEAT[1], SEAT[2], seat);
  seat.x += CART.vx * ahead;
  seat.z += CART.vz * ahead;
}

/**
 * How far (m) the point (x, z) is outside the cart's box or the oxen's, grown
 * by `grow` (≤ 0: inside one; then `push` is the way out of it, the nearest
 * side: a unit x, z and how far).
 */
const push = { x: 0, z: 0, d: 0 };
function outside(x: number, z: number, grow: number): number {
  let best = Infinity;
  for (let k = 0; k < 2; k++) {
    const o = k === 0 ? CART.axle : CART.yoke;
    const yaw = k === 0 ? CART.yaw : CART.oxYaw;
    const b = k === 0 ? CART_BOX : OXEN_BOX;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const dx = x - o.x;
    const dz = z - o.z;
    const a = dx * fx + dz * fz;
    const c = dx * fz - dz * fx;
    const back = b.back - grow;
    const front = b.front + grow;
    const half = b.half + grow;
    // (outside: the distance to the box; inside: minus the way out)
    const oa = Math.max(back - a, a - front, 0);
    const oc = Math.max(Math.abs(c) - half, 0);
    const out = Math.sqrt(oa * oa + oc * oc);
    if (out > 0) {
      best = Math.min(best, out);
      continue;
    }
    // (the nearest side out: behind, ahead, its left (+ across), its right)
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

/** The floor (m) feet would come down on at (x, z) from the seat (`world.standAt` from over the bed), or NaN (a wall). */
function floorAt(ctx: RoamCtx, x: number, z: number): number {
  const w = ctx.world;
  return w.standAt ? w.standAt(x, z, seat.y + 0.3, 0.6, 1.7 * ctx.body.scale * 0.95) : w.groundAt(x, z);
}

/** Can he come down at (x, z) from the seat: land (no water over it), no wall, not far down, clear of the cart? Its floor in `_cand.y`. */
function landAt(ctx: RoamCtx, x: number, z: number): boolean {
  const w = ctx.world;
  if (!w.inBounds(x, z)) return false;
  if (outside(x, z, BODY_R + 0.15) <= 0) return false;
  const g = floorAt(ctx, x, z);
  if (!Number.isFinite(g) || seat.y - g > 2.6) return false;
  const water = w.waterAt(x, z);
  if (water !== null && water > g + 0.12) return false;
  // (his body's circle all on that floor: no wall, no ditch's edge under him)
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + 0.4;
    const gi = floorAt(ctx, x + Math.cos(a) * BODY_R, z + Math.sin(a) * BODY_R);
    if (!Number.isFinite(gi) || Math.abs(gi - g) > 0.6) return false;
  }
  _cand.set(x, g, z);
  return true;
}

/** Where he may come down, out from the seat (rad round from straight back, m): straight back, back and to the sides, off the sides. */
const LANDINGS: readonly (readonly [number, number])[] = [
  [0, 1.05],
  [0.55, 1.15],
  [-0.55, 1.15],
  [1.25, 1.7],
  [-1.25, 1.7],
];

/** Where he would come down off the end now, or null (no land there). */
function findLanding(ctx: RoamCtx): Vector3 | null {
  const yaw = CART.yaw + Math.PI;
  for (const [turn, d] of LANDINGS) {
    const a = yaw + turn;
    if (landAt(ctx, seat.x + Math.sin(a) * d, seat.z + Math.cos(a) * d)) return land.copy(_cand);
  }
  return null;
}

/** How high (m over the ground) what stands at (x, z) on the cart or the oxen reaches, with the room the camera keeps round it (0: nothing there). */
function topAt(x: number, z: number): number {
  let top = 0;
  for (let k = 0; k < 2; k++) {
    const o = k === 0 ? CART.axle : CART.yoke;
    const yaw = k === 0 ? CART.yaw : CART.oxYaw;
    const b = k === 0 ? CART_BOX : OXEN_BOX;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const dx = x - o.x;
    const dz = z - o.z;
    const a = dx * fx + dz * fz;
    const c = dx * fz - dz * fx;
    const h = k === 1 ? OXEN_TOP : a < SEAT_END ? 0 : a < LOAD_END ? LOAD_TOP : a < FARMER_END ? FARMER_TOP : POLE_TOP;
    if (h <= top) continue;
    const oa = Math.max(b.back - a, a - b.front, 0);
    const oc = Math.max(Math.abs(c) - b.half, 0);
    const out = Math.sqrt(oa * oa + oc * oc) - CAM_MARGIN;
    const k2 = out <= 0 ? 1 : 1 - smooth(out / CAM_RAMP);
    top = Math.max(top, (h + CAM_OVER) * k2);
  }
  return top;
}

/** At pitch `p` (the camera's yaw and distance in `view`), how far (m) its line to his head dips under what stands on the cart, at worst (≤ 0: clear). */
const view = { fx: 0, fy: 0, fz: 0, sy: 0, cy: 0, d: 0, ground: 0 };
function dip(p: number): number {
  const v = view;
  const h = v.d * Math.cos(p);
  const cx = v.fx - v.sy * h;
  const cyy = v.fy + v.d * Math.sin(p);
  const cz = v.fz - v.cy * h;
  const hx = v.fx;
  const hy = v.fy + HEAD_UP;
  const hz = v.fz;
  let worst = -Infinity;
  for (let j = 1; j <= CAM_SAMPLES; j++) {
    const t = j / CAM_SAMPLES;
    const x = hx + (cx - hx) * t;
    const z = hz + (cz - hz) * t;
    const top = topAt(x, z);
    if (top <= 0) continue;
    worst = Math.max(worst, top - (hy + (cyy - hy) * t - v.ground));
  }
  return worst;
}

/**
 * The lowest pitch at which the camera, at its yaw and distance now, stays out of
 * the cart and the oxen and keeps his head in view over them (looked at from
 * the front, it rises to look down over the load at him); `base` where nothing
 * is in the way.
 */
function cameraFloor(ctx: RoamCtx, base: number): number {
  const cam = ctx.cam;
  const v = view;
  v.fx = cam.focus.x;
  v.fy = cam.focus.y;
  v.fz = cam.focus.z;
  v.sy = Math.sin(cam.yaw);
  v.cy = Math.cos(cam.yaw);
  v.d = cam.distance;
  v.ground = Math.min(CART.axle.y, CART.yoke.y);
  // (from the front: up over the cart)
  const round = Math.abs(angleDiff(cam.yaw, CART.yaw));
  base += (Math.max(base, FRONT_PITCH) - base) * smooth((round - FRONT_FROM) / (FRONT_TO - FRONT_FROM));
  let prev = base;
  let miss = dip(base);
  if (miss <= 0) return base;
  for (let p = base + 0.03; p < 1.3; p += 0.03) {
    const m = dip(p);
    if (m <= 0) return prev + (p - prev) * (miss / (miss - m));
    prev = p;
    miss = m;
  }
  return 1.3;
}

/** How much of the way out to a camera at `yaw` (its tilt and distance now) is free of walls and trees (0‥1). */
function roomAt(w: RoamCtx['world'], cam: RoamCtx['cam'], yaw: number): number {
  const f = cam.focus;
  const p = Math.max(cam.pitch, 0.1);
  const h = cam.distance * Math.cos(p);
  const x = f.x - Math.sin(yaw) * h;
  const y = f.y + cam.distance * Math.sin(p);
  const z = f.z - Math.cos(yaw) * h;
  const hard = (w.hardClearance ?? w.clearance)?.(f.x, f.y, f.z, x, y, z) ?? 1;
  const soft = w.softClearance?.(f.x, f.y, f.z, x, y, z, true) ?? 1;
  return Math.min(hard, soft);
}

/** The camera's side of the cart: kept, unless the other has much more room. */
function pickSide(ctx: RoamCtx): void {
  const here = roomAt(ctx.world, ctx.cam, CART.yaw + side * VIEW_TURN);
  if (here > 0.85) return;
  if (roomAt(ctx.world, ctx.cam, CART.yaw - side * VIEW_TURN) > here + 0.2) side = -side;
}

/** He is off the cart: his own feet again, the camera as it was. `hard`: at once (back to the map), no landing. */
function finish(ctx: RoamCtx | null, hard: boolean): void {
  const e = env;
  phase = 'none';
  u = 0;
  spot = null;
  lastS = Number.NaN;
  CART.rider = RIDER.none;
  SFX.level('cartRoll', 0);
  if (!e) return;
  e.explorer.animator.posture = null;
  e.explorer.animator.postureFeet = true;
  if (before) {
    e.cam.pitchMin = before.pitchMin;
    e.cam.follow = before.follow;
    e.cam.minDistance = before.minDistance;
    e.cam.maxDistance = before.maxDistance;
    before = null;
  }
  const body = ctx?.body ?? e.body;
  body.grounded = true;
  body.vel.set(0, 0, 0);
  if (!hard) body.explorer.setMotion(0, true, 0);
}

/** Take him over: the posture on, the camera's settings kept to put back. */
function begin(ctx: RoamCtx, next: Phase): void {
  const { cam, body } = ctx;
  before ??= { pitchMin: cam.pitchMin, follow: cam.follow, minDistance: cam.minDistance, maxDistance: cam.maxDistance };
  floor = cam.pitchMin;
  phase = next;
  clock = 0;
  rolled = 0;
  lastS = CART.s;
  spot = null;
  spotWait = 0;
  sideWait = 0;
  landed = false;
  body.vel.set(0, 0, 0);
  body.explorer.animator.posture = posture;
  body.explorer.animator.postureFeet = false;
  cam.minDistance = 3.5;
  cam.maxDistance = 25;
}

/** Start climbing on from where he stands (E, or the URL's `cartride=on`). */
function climb(ctx: RoamCtx): void {
  begin(ctx, 'on');
  u = 0;
  from.copy(ctx.body.pos);
  CART.rider = RIDER.climbing;
  CART.hello++;
}

/** The URL's start, once the cart is on the map: on it at once, or standing behind it to climb on. */
function mount(ctx: RoamCtx): void {
  const how = pending;
  pending = null;
  if (!how || !CART.live || !CART.point) return;
  const { body, cam } = ctx;
  seatNow(0);
  if (how === 'ride') {
    begin(ctx, 'ride');
    u = 1;
    body.pos.copy(seat);
    body.yaw = CART.yaw + Math.PI;
    CART.rider = RIDER.riding;
    CART.snap = true;
  } else {
    cartPoint(BOARD[0], BOARD[1], BOARD[2], _p);
    const g = ctx.world.standAt?.(_p.x, _p.z, _p.y + 1, 1.5, 2.3) ?? ctx.world.groundAt(_p.x, _p.z);
    body.pos.set(_p.x, Number.isFinite(g) ? g : _p.y, _p.z);
    body.yaw = CART.yaw;
    climb(ctx);
  }
  // (the camera behind the cart on the side with room, or turned from there as `rcam` says)
  const rc = urlCam;
  cam.pitch = VIEW_PITCH;
  cam.distance = VIEW_DIST;
  cam.focus.set(seat.x, seat.y + FOCUS_SIT, seat.z);
  side = 1;
  pickSide(ctx);
  cam.yaw = CART.yaw + (rc ? (rc[0] * Math.PI) / 180 : side * VIEW_TURN);
  cam.pitch = rc ? (rc[1] * Math.PI) / 180 : VIEW_PITCH;
  cam.distance = rc?.[2] || VIEW_DIST;
  cam.blendFrom(0);
  place(ctx.body, 0);
}

/** A small bounce of the seat as the wheels roll (BU): two ruts' rhythms. */
function bounce(s: number, go: number): number {
  return go * 0.28 * (0.6 * Math.sin(s * 7.9) + 0.4 * Math.sin(s * 3.3 + 1.1));
}

/** Put him where the phase has him now (the seat `ahead` s on); returns how far up from standing to sitting he is (0‥1). */
function place(body: RoamCtx['body'], ahead: number): number {
  seatNow(ahead);
  const lift = cartLift(u);
  if (phase === 'on') {
    body.pos.lerpVectors(from, seat, lift);
    body.pos.y += Math.sin(Math.PI * lift) * ARC_ON;
  } else if (phase === 'off') {
    body.pos.lerpVectors(land, seat, lift);
    body.pos.y += Math.sin(Math.PI * lift) * ARC_OFF;
  } else if (phase === 'ride') {
    body.pos.copy(seat);
    body.yaw = CART.yaw + Math.PI;
  }
  ps.u = u;
  ps.roll = CART.roll;
  ps.pitch = CART.pitch;
  ps.go = Math.min(1, CART.speed / CART.pace);
  ps.bump = bounce(CART.s, ps.go);
  ps.t = clock;
  return lift;
}

registerAddon({
  id: 'cart',
  // (right after a golden figure, before a shrine or a stall: at the cart's tail he means to ride)
  order: 12,

  get holding() {
    return phase !== 'none';
  },
  get handsBusy() {
    return phase !== 'none';
  },

  init(e) {
    env = e;
  },

  offer(ctx, mode) {
    if (mode !== 'walk' || phase !== 'none' || again > 0 || !env || env.busy()) return null;
    if (!CART.live || CART.parked || CART.speed > BOARD_SPEED || !cartPoint(BOARD[0], BOARD[1], BOARD[2], _p)) return null;
    const p = ctx.body.pos;
    const dx = p.x - _p.x;
    const dz = p.z - _p.z;
    if (dx * dx + dz * dz > BOARD_REACH * BOARD_REACH || Math.abs(p.y - _p.y) > BOARD_RISE) return null;
    return ridePrompt();
  },

  use(ctx) {
    climb(ctx);
  },

  hold(ctx, dt) {
    const { body, input, cam } = ctx;
    // (the player's own pitch is kept: the floor over the cart only holds the camera up while it is over it)
    if (before) cam.pitchMin = before.pitchMin;
    cam.turn(input.lookYaw, input.lookPitch, input.zoom);
    body.vel.set(0, 0, 0);
    body.explorer.setMotion(0, true, 0);
    if (!CART.live || !CART.point) {
      // (the cart hidden far off, e.g. the free camera away: it stands still, and so does he)
      cam.focus.set(body.pos.x, body.pos.y + FOCUS_SIT, body.pos.z);
      return held(null);
    }
    clock += dt;
    let prompt: string | null = null;
    if (phase === 'on') {
      const was = u;
      u = Math.min(1, u + dt / CLIMB);
      // (his back to the cart first, then the spring up)
      body.yaw += angleDiff(CART.yaw + Math.PI, body.yaw) * (1 - Math.exp(-dt * 9));
      // (meanwhile the camera comes round behind the cart, to its riding view: unless the player turns it)
      if (!input.lookYaw) cam.yaw += angleDiff(CART.yaw + side * VIEW_TURN, cam.yaw) * (1 - Math.exp(-dt * 2.2));
      if (was < CROUCH_U && u >= CROUCH_U) ctx.sound('jump', 0.3);
      if (cartLift(was) < 0.97 && cartLift(u) >= 0.97) {
        SFX.play('cartClimb', 0.9);
        ctx.sound('stepWood', 0.35);
        pad.rumble('tick', 0.5);
      }
      if (u >= 1) {
        phase = 'ride';
        CART.rider = RIDER.riding;
      }
    } else if (phase === 'ride') {
      // Off at E (or Space): where there is land to come down on (looked for a few times a second).
      if ((spotWait -= dt) <= 0 || input.use || input.jump) {
        spotWait = 0.2;
        seatNow(0);
        spot = findLanding(ctx);
      }
      if (spot && (input.use || input.jump)) {
        phase = 'off';
        landed = false;
        CART.rider = RIDER.hopping;
        CART.bye++;
        ctx.sound('jump', 0.3);
      } else prompt = spot ? offPrompt() : null;
      // (a hub knocks on the axle every metre and a half the cart goes)
      const ds = Number.isNaN(lastS) ? 0 : Math.abs(CART.s - lastS);
      lastS = CART.s;
      if (ds < 5 && (rolled += ds) >= KNOCK_EVERY) {
        rolled -= KNOCK_EVERY;
        SFX.play('cartKnock', 0.4 + 0.6 * Math.min(1, CART.speed / CART.pace));
      }
    } else if (phase === 'off') {
      // (facing the way he hops, then down)
      body.yaw += angleDiff(Math.atan2(land.x - seat.x, land.z - seat.z), body.yaw) * (1 - Math.exp(-dt * 8));
      u = Math.max(0, u - dt / HOP);
      if (!landed && cartLift(u) <= 0.02) {
        landed = true;
        ctx.sound(stepSound(ctx.world, land.x, land.y, land.z), 0.9);
        ctx.sound('land', 0.25);
        pad.rumble('tick', 0.6);
      }
    }
    const lift = place(body, dt);
    if (phase === 'off' && u <= 0) {
      // Down on his feet: the walk again.
      body.pos.copy(land);
      finish(ctx, false);
      again = AGAIN;
      return held(null);
    }
    // Riding: the wheels under him.
    SFX.level('cartRoll', phase === 'ride' ? ps.go : phase === 'none' ? 0 : ps.go * lift);
    // The camera: behind the cart and a little to its side (his face to it, the cart and the oxen beyond him); never into them.
    cam.focus.set(body.pos.x, body.pos.y + FOCUS_STAND + (FOCUS_SIT - FOCUS_STAND) * lift, body.pos.z);
    if ((sideWait -= dt) <= 0) {
      sideWait = 0.8;
      pickSide(ctx);
    }
    cam.behindYaw = CART.yaw + side * VIEW_TURN;
    cam.follow = 1;
    cam.fov = 50;
    const base = before?.pitchMin ?? -0.35;
    const want = cameraFloor(ctx, base);
    // (up at once, down gently)
    floor = want > floor ? want : floor + (want - floor) * (1 - Math.exp(-dt * 3));
    cam.pitchMin = Math.max(base, floor);
    return held(prompt);
  },

  after(ctx, mode, dt) {
    again = Math.max(0, again - dt);
    if (mode !== 'walk') return;
    if (pending && phase === 'none' && CART.live) mount(ctx);
    // On foot, he keeps out of the cart and the oxen (not on the walk map): eased out to the nearest side.
    if (phase !== 'none' || !CART.live || addonBusy() || !ctx.body.grounded || ctx.body.explorer.animator.posture) return;
    const p = ctx.body.pos;
    if (Math.abs(p.y - CART.axle.y) > 2.5 || outside(p.x, p.z, BODY_R) > 0) return;
    const w = ctx.world;
    const h = 1.7 * ctx.body.scale * 0.95;
    const d = push.d + 0.02;
    const x = p.x + push.x * d;
    const z = p.z + push.z * d;
    const g = w.standAt ? w.standAt(x, z, p.y, 0.6, h) : w.groundAt(x, z);
    if (!Number.isFinite(g) || !w.inBounds(x, z)) return;
    p.x = x;
    p.z = z;
    // (and no more walking on into it: what of his speed goes in is taken off)
    const v = ctx.body.vel;
    const vin = v.x * push.x + v.z * push.z;
    if (vin < 0) {
      v.x -= push.x * vin;
      v.z -= push.z * vin;
    }
    p.y = Math.max(p.y, g);
  },

  frame(f) {
    const e = env;
    if (!e) return;
    // (a still: the people part moves the cart on after roaming has stepped; he goes with it)
    if (!e.shot) return;
    if (phase === 'none' || !CART.live) return;
    place(e.body, f.dt);
    if (phase === 'ride') e.body.yaw = CART.yaw + Math.PI;
    e.explorer.object.position.copy(e.body.pos);
    e.explorer.object.rotation.set(0, e.body.yaw, 0);
    const lift = cartLift(u);
    e.cam.focus.set(e.body.pos.x, e.body.pos.y + FOCUS_STAND + (FOCUS_SIT - FOCUS_STAND) * lift, e.body.pos.z);
  },

  setMode(next, _prev, ctx) {
    if (next === 'walk') return;
    // (back to the map, or anything else: off at once, quietly; the cart goes on)
    pending = null;
    if (phase !== 'none') finish(ctx, true);
  },

  fromUrl(q) {
    const v = q.get('cartride');
    if (!v || v === '0') return;
    pending = v === 'on' ? 'board' : 'ride';
    const rc = q.get('rcam')?.split(',').map(Number);
    urlCam = rc && rc.every(Number.isFinite) ? rc : null;
  },

  report() {
    if (phase === 'none' || !CART.live || !env) return null;
    const cam = env.cam;
    const deg = (r: number) => ((((r * 180) / Math.PI) % 360) + 360) % 360;
    return {
      cartride: '1',
      cart: CART.s.toFixed(1),
      rcam: [deg(cam.yaw - CART.yaw), (cam.pitch * 180) / Math.PI, cam.distance].map((v) => v.toFixed(0)).join(','),
    };
  },
});

// (checks, from the console or a test: the ride's state, where he would stand to climb on, the boxes he keeps out of)
Object.assign(globalThis, {
  __cartRide: {
    state: () => ({ phase, u, live: CART.live, s: CART.s, speed: CART.speed, rider: CART.rider, parked: CART.parked, yaw: CART.yaw, spot: spot ? [spot.x, spot.y, spot.z] : null }),
    board: () => (cartPoint(BOARD[0], BOARD[1], BOARD[2], _p) ? [_p.x, _p.y, _p.z] : null),
    seat: () => (cartPoint(SEAT[0], SEAT[1], SEAT[2], _p) ? [_p.x, _p.y, _p.z] : null),
    /** How far (m) (x, z) is outside the cart's box and the oxen's, grown by `grow` (< 0: inside). */
    outside: (x: number, z: number, grow = 0) => outside(x, z, grow),
    /** Room out to the camera on either side of the cart (0‥1), and the side it rides on. */
    room: () => (env ? { left: roomAt(env.world, env.cam, CART.yaw + VIEW_TURN), right: roomAt(env.world, env.cam, CART.yaw - VIEW_TURN), side } : null),
    /** How high (m) a point is over the cart's ground. */
    over: (y: number) => y - Math.min(CART.axle.y, CART.yoke.y),
  },
});
