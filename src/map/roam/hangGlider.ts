import { Group, Quaternion, Vector3 } from 'three';
import { clamp, lerp, smoothstep } from '../../character/pose';
import { BODY_UNIT_M } from '../../world/scale';
import { placeById } from '../layout';
import type { MapFrame } from '../types';
import { t } from '../ui/lang';
import { GLIDER, Glider } from './_gliderModel';
import { gliderPose, HANG, hangPoint, type GliderPoseState } from './_gliderPoses';
import { RAMP } from './_launchRamp';
import { Lift } from './_lift';
import { angleDiff } from './followCam';
import type { LaunchSpot, LaunchSpots } from './launchSpots';
import { keepOverLedge, outOfLeap } from './parachute';
import { roamPrefs } from './prefs';
import type { RoamCtx, RoamMode, RoamModeHandler, RoamWorld } from './types';
import { stepSound } from './walker';

/**
 * The hang glider (mode `hang`).
 *
 * - From a take-off spot (launchSpots.ts, E on its ramp): he lifts the
 *   glider onto his shoulders, runs down the ramp and off the edge, then
 *   swings up into the harness and lies face down under the wing.
 * - In a long fall (the walker: E instead of Space's parachute) the wing
 *   unfolds over him and catches him.
 * - Flying: A / D shift his weight and bank the wing into a turn, Shift
 *   flies fast.
 * - Easy flying (the settings, `roamPrefs.easyFly`; on by default):
 *   hands-off he holds his height, for as long as you like; S climbs (nose
 *   up, a little slower), W dives (nose down, faster), both easing in and
 *   out, and he levels off when they are let go. He can climb to
 *   `CEILING_EASY` over the land, the whole map under him (the camera looks
 *   down more up there).
 * - The real glider (easy flying off): W pulls the bar in (faster, sinks
 *   faster), S pushes it out (slower; speed turns back into height). It
 *   sinks about a metre in twelve.
 * - Rising air (_lift.ts) along cliffs and in the warm columns marked by
 *   golden seed fluff lifts him (the real glider needs it to cross the whole
 *   map). The wind turns him back at the roaming area's edge. Space high up
 *   lets go (Space again opens the parachute).
 * - Walls (cliffs, river banks, temple walls): he looks ahead as he flies.
 *   Easy flying goes over a low one, the real glider zooms over one its
 *   speed can lift it over; from a taller one he banks away to the side
 *   with more room. Low down he flares at its foot, and met head-on there
 *   the wing stalls and he drops to it. He never stops in the air.
 * - Near the ground (easy flying: dive to come down; the dive eases off low
 *   down) he stands up in the harness and flares, touches down and runs it
 *   out; the glider is laid down, folds and is put away. On deep water he
 *   comes down into a boat.
 * - The camera and the selfie phone work in flight (tools.ts): the glider
 *   flies on straight meanwhile.
 *
 * Positions: `hang` (the strap's end on his back, world) is where he is;
 * the wing hangs over it from the strap, his body round it (_gliderPoses.ts).
 */

// ── Flight (m/s at the roaming size, rad) ──────────────────────────────────
/** Airspeed: trimmed hands-off, bar pushed out, pulled in, fast (Shift), in the flare. */
const V_TRIM = 13;
const V_SLOW = 9.5;
const V_FAST = 19;
const V_MAX = 24;
const V_FLARE = 5;
/** The sink at each speed: least at `V_BEST`, more either side (a glide of about 1 in 12 trimmed). */
const SINK_MIN = 1.0;
const SINK_K = 0.012;
const V_BEST = 11.5;
/** Steepest bank (rad), and how fast the bank and the speed follow the bar (1/s). */
const BANK_MAX = 0.62;
const BANK_RATE = 1.7;
const SPEED_RATE = 0.7;
const G = 9.8;
/** Highest the real glider climbs over the ground under him (m): the air gets thin and cold. */
const CEILING = 200;
/** He flares with his feet this high over the ground or water under him or just ahead (m). */
const FLARE_AT = 2.0;
/** His feet (the explorer's own point) are this far ahead of the strap's end, and a margin (m at his true size). */
const FEET_AHEAD = -HANG[2] * BODY_UNIT_M + 0.15;
/** Letting go (Space): only this high over the ground (m). */
const LET_GO_ABOVE = 20;
/** Wing hands-off pitch: nose down this much per m/s over trim (rad). */
const PITCH_PER_V = 0.014;
/** Circling in a thermal he edges his circle towards its core at this rate (1/s, at full bank). */
const CENTRE = 0.12;

// ── Easy flying (roamPrefs.easyFly) ────────────────────────────────────────
/** Climbing (S) and diving (W) (m/s; Shift: × `EASY_FAST`), and how softly they start and stop (1/s: nearly all the way in two seconds). */
const CLIMB = 5;
const DIVE = 7;
const EASY_FAST = 1.5;
const EASE = 2;
/** Higher up both go faster, so the land far below seems to move as much: once more their speed for every this many metres over the ground. */
const RATE_UP = 250;
/** Airspeed climbing: a little slower (m/s). */
const V_CLIMB = 11;
/** Wing nose up per m/s of climb, down per m/s of dive (rad). */
const PITCH_PER_CLIMB = 0.03;
/** Rising air lifts him this share of what it lifts the real glider: nice, no longer needed. */
const AIR_EASY = 0.6;
/** Highest he climbs over the ground under him (m): the whole land in view. The climb fades out over the last `THIN_EASY` m. */
const CEILING_EASY = 700;
const THIN_EASY = 150;
/** Low down the dive eases off, to this share of it at the flare (from `DIVE_EASE_AT` m up): he comes in as gently as the real glider. */
const DIVE_LOW = 0.3;
const DIVE_EASE_AT = 24;
/** Up high the follow camera looks down more, the land in view: this much more at the ceiling (rad), from `TILT_FROM` m up. */
const TILT_HIGH = 0.66;
const TILT_FROM = 60;

// ── Walls (cliffs, river banks, temple walls) ──────────────────────────────
/** He looks for a wall as far ahead as he flies in this long (s), and this much more (m). */
const WALL_LOOK = 1.6;
const WALL_LOOK_M = 8;
/** Which ways he looks (rad from his heading): the wing is wide. */
const WALL_FAN = [0, 0.3, -0.3];
/** Turning away from one: at least this fast by the time he is near it (rad/s); met head-on, this fast (rad/s). */
const TURN_AWAY = 1.0;
const TURN_HARD = 3;
/** Only this high over the ground under him (m) and up does he turn away; lower down he comes in to land at its foot. */
const TURN_LOW = 4;
/** Easy flying goes over a wall up to this high over his feet (m), climbing at most this fast (m/s), starting this quickly (1/s), to this much over its top (m: more than `FLARE_AT`, he flies on). */
const HOP_EASY = 10;
const HOP_RATE = 10;
const HOP_EASE = 3;
const HOP_OVER = 3;
/** The real glider zooms over one its speed can lift it over: this share of the height slowing down gives (the sink takes the rest). */
const ZOOM = 0.6;
/** Turning away or zooming he slows this quickly (1/s: the bar pushed out hard). */
const BRAKE_RATE = 1.6;
/** Stopped by a wall low down the wing stalls: he drops to its foot at this speed (m/s). */
const DROP = 4.5;

// ── On the ground ──────────────────────────────────────────────────────────
/** Lifting it off the ramp (s, at the least: longer when he stands further from the ramp's back, at `PICKUP_PACE` m/s), the run (m/s start, m/s², top), the swing into the harness after take-off (s). */
const PICKUP = 0.6;
const PICKUP_PACE = 3;
const RUN_FROM = 2.5;
const RUN_ACCEL = 6;
const RUN_TOP = 8.5;
const PRONE_TIME = 1.2;
/** Unfolding in the air (s), and the run-out after the touch-down (s). */
const OPEN_AIR = 0.9;
const RUNOUT = 0.7;
/** Put away after landing: it folds, then its blocks go one by one (s). */
const FOLD = [0.5, 1.5] as const;
const GONE = [1.4, 2.3] as const;
/** Laying it down behind him (s), before it folds. */
const LAY = 0.45;
/** Follow camera: distance, tilt, focus over the strap (× size). */
const CAM_DIST = 17;
const CAM_PITCH = 0.3;
const FOCUS_UP = 0.55;
/** Where the wind turns him at the edges: Angkor Wat. */
const HOME = placeById('sanctuary');

const UP = new Vector3(0, 1, 0);
const X = new Vector3(1, 0, 0);
const Z = new Vector3(0, 0, 1);
const STRAP = GLIDER.strap.clone();
const _q = new Quaternion();
const _v = new Vector3();
const _w = new Vector3();
const _hp = new Vector3();
const _core = { x: 0, z: 0 };

/** Ground or water under (x, z), whichever is higher. */
const floorAt = (w: RoamWorld, x: number, z: number) => Math.max(w.groundAt(x, z), w.waterAt(x, z) ?? -Infinity);
/** Nothing solid at (x, z) up to `low` (m): he can fly on there. */
const clearAt = (w: RoamWorld, x: number, z: number, low: number) => w.groundAt(x, z) <= low + 0.4;
/** Extra sink (m/s) when he flies too slowly (pressed against a cliff): he comes down. */
const stallAt = (v: number) => Math.max(0, V_SLOW - 0.5 - v) * 1.2;
/** The glider's sink at airspeed `v` (m/s). */
const sinkAt = (v: number) => SINK_MIN + SINK_K * (v - V_BEST) ** 2 + stallAt(v);
/**
 * Two keys held together (A and S) come from input.ts at 0.7 each (the
 * stick's circle): this puts each back to what it is alone (easy flying: a
 * climbing turn climbs and turns in full).
 */
const fullKeys = (m: { x: number; y: number }) => {
  const most = Math.max(Math.abs(m.x), Math.abs(m.y));
  return most > 1e-3 ? Math.hypot(m.x, m.y) / most : 1;
};

export interface HangGliderMode extends RoamModeHandler {
  /** Every frame in every mode: the glider put away after a landing, the seed fluff, the ramps. */
  frame(f: MapFrame, mode: RoamMode, at: Vector3): void;
  readonly lift: Lift;
}

export function createHangGlider(spots: LaunchSpots, world: RoamWorld): HangGliderMode {
  const glider = new Glider();
  const lift = new Lift(world.field, world);
  const object = new Group();
  object.name = 'roam:hangGlider';
  object.add(glider.object, lift.object);

  let phase: 'pickup' | 'run' | 'open' | 'fly' | 'flare' | 'runout' = 'fly';
  let pt = 0;
  let spot: LaunchSpot | null = null;
  /** The strap's end on his back (world): where he is. */
  const hang = new Vector3();
  let yaw = 0;
  let v = V_TRIM;
  let vy = 0;
  /** How fast `vy` is changing (m/s²): easy flying eases the climb in and out with it. */
  let vyA = 0;
  let bank = 0;
  let pitch = 0;
  let pitchV = 0;
  let omega = 0;
  let openK = 1;
  let runSpeed = 0;
  let along = 0;
  /** The wind is turning him back from the edge: which way round (+1 left, −1 right; 0 = not), and when it last said so. */
  let homing = 0;
  let toldAt = -99;
  /** The keys were shown for easy flying (true), the real glider (false), or not yet (null); and this flight's kind. */
  let hinted: boolean | null = null;
  let easyNow = true;
  /** "The air is thin up here" said this flight. */
  let thinTold = false;
  /** A wall ahead: the way he turns from it (+1 left, −1 right; 0 = not) and how long none has been seen (s); going over one (easy flying), up to this height (m; NaN = not). */
  let dodge = 0;
  let wallGone = 0;
  let hopTo = NaN;
  /** Stopped by a wall low down: the wing stalls and he drops to its foot. */
  let stalled = false;
  /** The wall `wallAlong` found: how far (m; Infinity = none), and its top (m). */
  const wall = { dist: Infinity, top: 0 };
  let zoomBase = CAM_DIST;
  /** Started from the URL (a shot): the camera distance it set (`rcam`) is the one to keep. */
  let urlStart = false;
  let lastHalf = 0;
  let clock = 0;
  /** The wing's place and turn (world), its size. */
  const at = new Vector3();
  const quat = new Quaternion();
  let size = 1.4;
  // Pickup: where the glider was on the ramp and where he stood.
  const fromAt = new Vector3();
  const fromQuat = new Quaternion();
  const fromFeet = new Vector3();
  let fromYaw = 0;
  let pickupTime = PICKUP;
  /** Where on the deck he takes the glider and starts his run (m from the ramp's back). */
  let startU = 0.6;
  // Put away after the flight: how, since when, and where it drifts.
  let stow: 'none' | 'ground' | 'air' | 'water' = 'none';
  let stowT = 0;
  const stowVel = new Vector3();
  /** Laid down on the ground: from where it was over him to where it rests behind him. */
  const layFrom = new Vector3();
  const layTo = new Vector3();
  const layFromQ = new Quaternion();
  const layToQ = new Quaternion();

  const ps: GliderPoseState = { prone: 0, run: 0, phase: 0, pitch: 0, roll: 0, flare: 0, fistL: new Vector3(), fistR: new Vector3(), t: 0 };
  const posture = () => gliderPose(ps);

  // ── Helpers ─────────────────────────────────────────────────────────────

  /** The wing's turn: heading, then its pitch (+ = nose down) and bank (+ = left wing down). */
  function wingQuat(out: Quaternion, heading: number, p: number, b: number): Quaternion {
    return out.setFromAxisAngle(UP, heading).multiply(_q.setFromAxisAngle(X, p)).multiply(_q.setFromAxisAngle(Z, -b));
  }

  /** Put the wing over the strap's end (`hang`), turned `quat`. */
  function wingOverHang(): void {
    at.copy(STRAP).multiplyScalar(-size).applyQuaternion(quat).add(hang);
  }

  /** His feet from the strap's end (the strap point is fixed in his own space, turned by his heading). */
  function feetFromHang(ctx: RoamCtx): void {
    const { body } = ctx;
    hangPoint(body.scale, _hp).applyAxisAngle(UP, yaw);
    body.pos.copy(hang).sub(_hp);
    body.yaw = yaw;
  }

  function hangFromFeet(ctx: RoamCtx): void {
    const { body } = ctx;
    hangPoint(body.scale, _hp).applyAxisAngle(UP, body.yaw);
    hang.copy(body.pos).add(_hp);
  }

  /** A point on the frame (glider space, m at true size) → the explorer's own space (BU), for his fists. */
  function toBody(ctx: RoamCtx, x: number, y: number, z: number, out: Vector3): Vector3 {
    const { body } = ctx;
    out.set(x, y, z).multiplyScalar(size).applyQuaternion(quat).add(at).sub(body.pos);
    return out.applyAxisAngle(UP, -body.yaw).divideScalar(body.scale * BODY_UNIT_M);
  }

  /** His fists: on the down tubes at his shoulders (upright), on the control bar (lying in the harness). */
  function fists(ctx: RoamCtx): void {
    const b = GLIDER.bar;
    const p = ps.prone;
    // Down tube a little over his shoulders (the strap's end is at the middle of his back).
    const f = (GLIDER.strap.y + 0.32) / b.y;
    for (const side of [1, -1]) {
      const out = side > 0 ? ps.fistL : ps.fistR;
      toBody(ctx, side * b.half * f, b.y * f, lerp(GLIDER.apex, b.z, f), _v);
      toBody(ctx, side * b.half * 0.5, b.y, b.z, _w);
      out.copy(_v).lerp(_w, smoothstep(0.2, 0.9, p));
    }
  }

  /** Lowest point of him (m): his feet upright, his front lying down (0.4 m under the strap's end at his true size). */
  function lowest(ctx: RoamCtx): number {
    return lerp(ctx.body.pos.y, hang.y - 0.4 * ctx.body.scale, ps.prone);
  }

  function setCam(ctx: RoamCtx, dt: number, focusUp: number): void {
    const { cam, input } = ctx;
    cam.behindYaw = yaw + omega * 0.5;
    cam.focus.set(hang.x, hang.y + focusUp * ctx.body.scale, hang.z);
    if (input.zoom || urlStart) zoomBase = cam.distance;
    else cam.distance += (zoomBase - cam.distance) * (1 - Math.exp(-dt * 1.2));
    urlStart = false;
    cam.fov = 52 + 9 * clamp((v - V_TRIM) / (V_MAX - V_TRIM), 0, 1) - 3 * clamp((V_TRIM - v) / (V_TRIM - V_SLOW), 0, 1);
  }

  /** The follow camera's own tilt (rad): easy flying up high, it looks down more (the land in view, not the haze). */
  function camTilt(): number {
    return CAM_PITCH + (easyNow ? TILT_HIGH * smoothstep(TILT_FROM, CEILING_EASY, hang.y - floorAt(world, hang.x, hang.z)) : 0);
  }

  /**
   * Along heading `a` (rad), from his feet out to `look` m: the first ground
   * that would stop him (over 0.4 m above his lowest point `low`, as
   * `clearAt`), and the highest top from there to a few metres past it.
   */
  function wallAlong(a: number, low: number, look: number): typeof wall {
    const sx = Math.sin(a);
    const sz = Math.cos(a);
    const x0 = hang.x + sx * FEET_AHEAD * size;
    const z0 = hang.z + sz * FEET_AHEAD * size;
    wall.dist = Infinity;
    wall.top = -Infinity;
    for (let d = 1; d <= (wall.dist === Infinity ? look : wall.dist + 8); d++) {
      const g = world.groundAt(x0 + sx * d, z0 + sz * d);
      if (wall.dist === Infinity && g > low + 0.4) wall.dist = d;
      if (wall.dist < Infinity) wall.top = Math.max(wall.top, g);
    }
    return wall;
  }

  /** Which way to turn from a wall ahead: to the side with more room (+1 left, −1 right), or `lean` when they are alike. */
  function openSide(low: number, look: number, lean: number): number {
    let room = 0;
    for (const a of [0.5, 1, 1.6]) room += Math.min(look, wallAlong(yaw + a, low, look).dist) - Math.min(look, wallAlong(yaw - a, low, look).dist);
    return Math.abs(room) > 3 ? Math.sign(room) : lean || 1;
  }

  /** The keys: the first flight, and again when the kind of flying (easy or the real glider) changed since. */
  function hint(ctx: RoamCtx): void {
    if (hinted === easyNow || ctx.shot) return;
    hinted = easyNow;
    // (on a touch screen the stick and the Jump button, not keys: touch.ts)
    const touch = document.body.classList.contains('roam-touch');
    ctx.hud.toast(t(easyNow ? (touch ? 'rGliderTouch' : 'rGliderKeys') : touch ? 'rGliderRealTouch' : 'rGliderReal'));
  }

  /** Lay the glider down (and away): where it is now. */
  function putAway(kind: 'ground' | 'air' | 'water', ctx: RoamCtx): void {
    stow = kind;
    stowT = 0;
    if (kind === 'ground') {
      // On its base bar, nose a little down, its nose a step behind him (it swings back and down there: `frame`).
      layFrom.copy(at);
      layFromQ.copy(quat);
      layTo.copy(at).addScaledVector(_v.set(Math.sin(yaw), 0, Math.cos(yaw)), -2.4 * size);
      layTo.y = floorAt(ctx.world, layTo.x, layTo.z) - GLIDER.bar.y * size;
      wingQuat(layToQ, yaw, 0.12, 0);
      ctx.sound('gliderStow', 0.8);
    } else if (kind === 'air') {
      stowVel.set(Math.sin(yaw) * v * 0.8, -1.5, Math.cos(yaw) * v * 0.8);
      ctx.sound('gliderStow', 0.5);
    }
  }

  function release(ctx: RoamCtx): void {
    const ex = ctx.body.explorer;
    ex.animator.posture = null;
    ex.animator.postureFeet = true;
  }

  /** After the touch-down: a few running steps, slowing, then walking. */
  function runOut(ctx: RoamCtx, dt: number): RoamMode | null {
    const { body, world, cam } = ctx;
    const ex = body.explorer;
    pt += dt;
    const k = Math.min(1, pt / RUNOUT);
    const sp = runSpeed * (1 - k);
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const nx = body.pos.x + fx * sp * dt;
    const nz = body.pos.z + fz * sp * dt;
    const g = world.groundAt(nx, nz);
    const w = world.waterAt(nx, nz);
    if (world.inBounds(nx, nz) && g <= body.pos.y + 1 && g >= body.pos.y - 1 && (w === null || w < g + 0.5)) body.pos.set(nx, g, nz);
    body.vel.set(fx * sp, 0, fz * sp);
    ex.setMotion(sp / body.scale, true, 0);
    ps.run = clamp(sp / RUN_TOP, 0, 1);
    ps.phase = ex.animator.phase;
    ps.flare = Math.max(0, ps.flare - dt * 3);
    ps.prone = 0;
    const half = footHalf(ex.animator.phase);
    if (half !== lastHalf && sp > 1) ctx.sound(stepSound(world, body.pos.x, body.pos.y, body.pos.z), 0.8);
    lastHalf = half;
    hangFromFeet(ctx);
    pitch += (-0.1 - pitch) * (1 - Math.exp(-dt * 6));
    bank *= 1 - Math.min(1, dt * 6);
    wingQuat(quat, yaw, pitch, bank);
    wingOverHang();
    fists(ctx);
    ctx.levels.wind = 0.1 * (1 - k);
    cam.focus.set(hang.x, hang.y + 0.5 * body.scale, hang.z);
    cam.distance += (Math.min(cam.distance, 12.5) - cam.distance) * (1 - Math.exp(-dt * 4));
    return k >= 1 ? 'walk' : null;
  }

  // ── The mode ────────────────────────────────────────────────────────────

  const mode: HangGliderMode = {
    object,
    lift,

    enter(ctx, from) {
      const { body, cam } = ctx;
      const ex = body.explorer;
      size = body.scale;
      stow = 'none';
      homing = 0;
      zoomBase = CAM_DIST;
      easyNow = roamPrefs.easyFly;
      thinTold = stalled = false;
      dodge = 0;
      hopTo = NaN;
      bank = pitch = pitchV = omega = vyA = 0;
      ps.flare = ps.run = ps.pitch = ps.roll = 0;
      // (off the ledge with the leap: out of his dive, parachute.ts)
      ex.animator.posture = from === 'leap' ? outOfLeap(ex, posture) : posture;
      cam.minDistance = 6;
      cam.maxDistance = 45;
      cam.follow = 1.2;
      const s = from === 'walk' && body.grounded ? spots.near(body.pos.x, body.pos.z, body.pos.y) : null;
      if (s) {
        // From a ramp: lift the glider off the deck, step to the ramp's back, face the edge.
        spot = s;
        phase = 'pickup';
        pt = 0;
        ps.prone = 0;
        openK = 1;
        yaw = body.yaw;
        fromYaw = body.yaw;
        fromFeet.copy(body.pos);
        // (where the parked glider sits)
        spots.parked(s, fromAt, fromQuat);
        spots.take(s);
        // (from the back of the deck, or from under the glider if he stands there already: a step back from in front of it)
        startU = clamp((body.pos.x - s.x) * Math.sin(s.yaw) + (body.pos.z - s.z) * Math.cos(s.yaw), 0.6, 2);
        spots.along(s, startU, 0, _v);
        pickupTime = Math.max(PICKUP, Math.hypot(_v.x - body.pos.x, _v.z - body.pos.z) / PICKUP_PACE);
        ex.animator.postureFeet = true;
        hangFromFeet(ctx);
        ctx.sound('gliderOpen', 0.5);
        body.vel.set(0, 0, 0);
        v = 0;
        vy = 0;
      } else if (from === 'overview') {
        // (a URL start: already flying)
        spot = null;
        phase = 'fly';
        pt = 10;
        ps.prone = 1;
        openK = 1;
        yaw = body.yaw;
        v = V_TRIM;
        vy = easyNow ? 0 : -SINK_MIN;
        hangFromFeet(ctx);
        ex.animator.postureFeet = false;
        cam.distance = zoomBase = CAM_DIST;
        cam.pitch = camTilt();
        cam.yaw = yaw;
      } else {
        // In a fall (or off a ledge): the wing unfolds over him and catches him.
        spot = null;
        phase = 'open';
        pt = 0;
        ps.prone = 0;
        openK = 0;
        yaw = body.yaw;
        const fx = Math.sin(yaw);
        const fz = Math.cos(yaw);
        v = clamp(body.vel.x * fx + body.vel.z * fz, 4, V_FAST);
        vy = body.vel.y;
        hangFromFeet(ctx);
        ex.animator.postureFeet = false;
        ctx.sound('gliderOpen', 1);
        zoomBase = Math.max(cam.distance, 12);
      }
      urlStart = from === 'overview';
      hint(ctx);
    },

    update(ctx, dt): RoamMode | null {
      const { body, input, world, cam } = ctx;
      const ex = body.explorer;
      clock += dt;
      ps.t = clock;
      if (phase !== 'runout') pt += dt;
      cam.turn(input.lookYaw, input.lookPitch, input.zoom);
      size = body.scale;
      // Easy flying switched in the settings mid-flight: the new keys (the help at the bottom left too).
      if (roamPrefs.easyFly !== easyNow) {
        easyNow = roamPrefs.easyFly;
        ctx.hud.setMode('hang');
        hint(ctx);
      }
      if (phase === 'runout') return runOut(ctx, dt);

      // ── Lifting it, running down the ramp ──────────────────────────────
      if (phase === 'pickup' || phase === 'run') {
        const s = spot!;
        if (phase === 'pickup') {
          const k = smoothstep(0, pickupTime, pt);
          spots.along(s, startU, 0, _v);
          const pace = k < 1 ? fromFeet.distanceTo(_v) / pickupTime : 0;
          body.pos.lerpVectors(fromFeet, _v, k);
          yaw = body.yaw = fromYaw + angleDiff(s.yaw, fromYaw) * k;
          ex.setMotion(k < 1 ? Math.max(1.2, pace / size) : 0, true, 0);
          // (a few small steps to the ramp's back)
          ps.run = 0.3 * (1 - k);
          ps.phase = ex.animator.phase;
          hangFromFeet(ctx);
          // From the deck up onto his shoulders.
          wingQuat(quat, yaw, -0.12, 0);
          wingOverHang();
          at.lerpVectors(fromAt, at, k);
          quat.slerpQuaternions(fromQuat, quat, k);
          if (pt >= pickupTime) {
            phase = 'run';
            pt = 0;
            along = startU;
            runSpeed = RUN_FROM;
            lastHalf = footHalf(ex.animator.phase);
          }
        } else {
          runSpeed = Math.min(RUN_TOP, runSpeed + RUN_ACCEL * dt);
          along += runSpeed * dt;
          spots.along(s, Math.min(along, RAMP.length), 0, body.pos);
          body.yaw = yaw = s.yaw;
          ex.setMotion(runSpeed / size, true, 0);
          ps.run = clamp(runSpeed / RUN_TOP, 0, 1);
          ps.phase = ex.animator.phase;
          const half = footHalf(ex.animator.phase);
          if (half !== lastHalf) ctx.sound('stepWood', 0.85);
          lastHalf = half;
          hangFromFeet(ctx);
          // The wing lifts as he runs: nose up, a little bounce; over the last metres the strap takes his
          // weight (the lift settles). The flight goes on from this pitch.
          const p0 = pitch;
          pitch = -0.12 - 0.08 * ps.run + 0.02 * Math.sin(clock * 11);
          pitchV = dt > 0 ? (pitch - p0) / dt : 0;
          wingQuat(quat, yaw, pitch, 0);
          wingOverHang();
          at.y += 0.12 * ps.run * size * (1 - smoothstep(RAMP.length - 3, RAMP.length, along));
          ctx.levels.wind = 0.1 * ps.run;
          if (along >= RAMP.length) {
            // Off the edge!
            phase = 'fly';
            pt = 0;
            v = runSpeed + 3;
            vy = 1.2;
            body.grounded = false;
            ex.animator.postureFeet = false;
            ctx.sound('jump', 0.7);
          }
        }
        fists(ctx);
        cam.behindYaw = yaw;
        cam.focus.set(hang.x, hang.y + FOCUS_UP * size, hang.z);
        cam.distance += (Math.max(9, Math.min(zoomBase, 13)) - cam.distance) * (1 - Math.exp(-dt * 1.5));
        return null;
      }

      // ── In the air ─────────────────────────────────────────────────────
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      if (phase === 'open') {
        openK = smoothstep(0, OPEN_AIR, pt);
        if (pt >= OPEN_AIR) {
          phase = 'fly';
          pt = PRONE_TIME * 0.4;
        }
      }
      // Stand up for the landing, else lie down in the harness (after the take-off, over a second).
      const flaring = phase === 'flare';
      const proneT = flaring ? 0 : phase === 'open' ? 0.35 * openK : smoothstep(0, PRONE_TIME, pt);
      ps.prone += (proneT - ps.prone) * (1 - Math.exp(-dt * (flaring ? 5 : 4)));
      ps.flare += ((flaring ? 1 : 0) - ps.flare) * (1 - Math.exp(-dt * 5));
      ps.run = Math.max(0, ps.run - dt * 2);

      // The ground and water under him and just ahead.
      const ahead = Math.max(3, v * 0.6);
      const under = floorAt(world, hang.x, hang.z);
      const floor = Math.max(under, floorAt(world, hang.x + fx * ahead, hang.z + fz * ahead));
      const low = lowest(ctx);
      const height = low - floor;

      // Space high up: let go (the walker falls; Space again opens the parachute).
      if (input.jump && phase === 'fly' && openK >= 1 && height > LET_GO_ABOVE) {
        putAway('air', ctx);
        body.grounded = false;
        body.vel.set(fx * v * 0.8, vy, fz * v * 0.8);
        release(ctx);
        cam.distance = Math.min(cam.distance, 16);
        return 'walk';
      }

      // The bar: A / D shift his weight (bank and turn), W / S pull it in / push it out (easy flying: dive / climb).
      const easy = easyNow;
      const keys = easy ? fullKeys(input.move) : 1;
      const turnIn = -input.move.x * keys * openK;
      const bar = input.move.y * keys;

      // A wall ahead (a cliff, a river bank, a temple wall), as far as he flies in a second and a half:
      // easy flying goes over a low one (not diving: W lands at its foot), the real glider pushes the bar
      // out to zoom over one its speed can lift it over. From a taller one he banks away to the side with
      // more room, harder as it nears; low down he comes in to land at its foot (the flare).
      const lowOver = low - under;
      const look = v * WALL_LOOK + WALL_LOOK_M;
      // (how hard he turns away, 0‥1; the real glider zooming; easy flying's climb over it, m/s)
      let near = 0;
      let zoom = false;
      let climbOver = 0;
      // (straight ahead and a little to each side: the wing is wide, and a wall curving in beside him is seen in time)
      let wallAt = Infinity;
      let wallTop = -Infinity;
      if (phase === 'fly' && openK >= 1 && pt > 0.4)
        for (const a of WALL_FAN) {
          wallAlong(yaw + a, low, look);
          wallAt = Math.min(wallAt, wall.dist);
          wallTop = Math.max(wallTop, wall.top);
        }
      if (wallAt < look) {
        wallGone = 0;
        const rise = wallTop + HOP_OVER - low;
        const need = rise / Math.max(wallAt / Math.max(v, 4) - 2 / HOP_EASE, 0.25);
        // (once going over, on over it even if it takes a little more; once turning away, on round: not over the next one halfway)
        const going = !Number.isNaN(hopTo);
        const goes = (going || !dodge) && (easy ? bar <= 0.2 && rise <= HOP_EASY && need <= HOP_RATE * (going ? 1.5 : 1) : rise <= ((v * v - V_SLOW * V_SLOW) / (2 * G)) * ZOOM);
        if (goes && easy) {
          hopTo = going ? Math.max(hopTo, wallTop + HOP_OVER) : wallTop + HOP_OVER;
          climbOver = need;
        } else if (goes) zoom = true;
        else {
          hopTo = NaN;
          if (lowOver > TURN_LOW) {
            dodge ||= openSide(low, look, Math.sign(turnIn) || Math.sign(bank));
            near = smoothstep(look, look * 0.4, wallAt);
          }
        }
      } else if ((wallGone += dt) > 0.6) dodge = 0;
      // (over it: up to its top and a little more, then on level; diving (W) lets it go)
      if (!Number.isNaN(hopTo) && (low >= hopTo - 0.2 || wallGone > 2 || bar > 0.2 || phase !== 'fly')) hopTo = NaN;
      const hopping = !Number.isNaN(hopTo);
      if (hopping) climbOver = Math.min(HOP_RATE * 1.5, Math.max(climbOver, (hopTo - low) * 1.5));

      // Near the ground he flares (turning from a wall or going over it: the ground under him, not its top).
      if (phase === 'fly' && pt > 0.8 && (near > 0 || hopping || zoom ? lowOver : height) < FLARE_AT) {
        phase = 'flare';
        pt = 0;
      } else if (phase === 'flare' && pt > 0.4 && height > FLARE_AT + 4 && !stalled) {
        // (flared over a bump or a cliff's lip and the ground fell away: lie down and fly on)
        phase = 'fly';
        pt = PRONE_TIME * 0.5;
      }

      // (low over the ground only gentle turns: a steep bank would put a wing tip into it)
      const bankT = (flaring ? 0 : turnIn * BANK_MAX * clamp((height - 1) / 8, 0.35, 1)) + 0.02 * Math.sin(clock * 0.9);
      bank += (bankT - bank) * (1 - Math.exp(-dt * BANK_RATE));
      let vT = input.run ? V_MAX : bar >= 0 ? V_TRIM + (V_FAST - V_TRIM) * bar : V_TRIM + (V_TRIM - (easy ? V_CLIMB : V_SLOW)) * bar;
      // (a wall ahead: slower, to turn tighter or to zoom over it)
      const brake = zoom ? 1 : near;
      if (brake > 0) vT = lerp(vT, Math.min(vT, easy ? V_CLIMB : V_SLOW), brake);
      if (flaring) vT = V_FLARE;
      const dv = (vT - v) * (1 - Math.exp(-dt * (flaring ? (stalled ? 4 : 2) : lerp(SPEED_RATE, BRAKE_RATE, brake))));
      v += dv;
      const accel = dt > 0 ? dv / dt : 0;

      // Turning; at the roaming area's edge the wind turns him back towards the temples.
      omega = (G * Math.tan(bank)) / Math.max(v, 6);
      // (once it starts it turns him all the way round, one way, so he doesn't fly on along the edge)
      const home = Math.atan2(HOME.x - hang.x, HOME.z - hang.z);
      const off = angleDiff(home, yaw);
      if (!homing && !world.inBounds(hang.x + fx * 45, hang.z + fz * 45) && Math.abs(off) > 0.6) {
        // (straight away from home: round the way he is already banking)
        homing = Math.abs(off) > 2.8 && Math.abs(bank) > 0.1 ? Math.sign(bank) : off >= 0 ? 1 : -1;
        if (clock - toldAt > 8) ctx.hud.toast(t('rWindBack'));
        toldAt = clock;
      } else if (homing && Math.abs(off) < 0.5) homing = 0;
      if (homing) {
        const back = homing * clamp(Math.abs(off) * 1.2, 0.35, 0.7);
        omega = lerp(omega, back, 0.8);
        bank += (clamp(back, -0.5, 0.5) - bank) * (1 - Math.exp(-dt * 2));
      }
      if (near > 0) {
        // (away from a wall ahead: over the wind at the edge, and over his own steering as it nears)
        bank += (dodge * BANK_MAX * clamp((lowOver - 1) / 6, 0.5, 1) - bank) * (1 - Math.exp(-dt * 4 * near));
        omega = lerp(omega, dodge * Math.max(TURN_AWAY, dodge * omega), near);
      }
      yaw += omega * dt;

      // Up and down: the wing's sink (more in a bank), the rising air, and speed traded for height.
      // Easy flying (not in the flare): he holds his height, S climbs and W dives (easing off low
      // down), rising air lifts him a little, and too slow (against a cliff) he comes down.
      const air = lift.liftAt(hang.x, hang.y, hang.z) * (1 - ps.flare);
      const over = hang.y - under;
      const thin = easy ? smoothstep(CEILING_EASY - THIN_EASY, CEILING_EASY, over) : smoothstep(CEILING - 30, CEILING, over);
      const glide = !easy || flaring;
      let vyT: number;
      if (glide) vyT = -sinkAt(v) / Math.cos(bank) + air * (1 - thin) - (v * accel) / G;
      else {
        const want = bar < 0 ? -bar * CLIMB * (1 - thin) : -bar * DIVE * lerp(DIVE_LOW, 1, smoothstep(FLARE_AT, DIVE_EASE_AT, height));
        vyT = want * (1 + Math.max(0, over) / RATE_UP) * (input.run ? EASY_FAST : 1) + air * AIR_EASY * (1 - thin) - stallAt(v);
        // (over a wall ahead)
        if (hopping) vyT = Math.max(vyT, climbOver);
      }
      // (the flare trades the speed for a moment's float, not a climb; stalled against a wall he drops)
      if (flaring) vyT = stalled ? -DROP : clamp(vyT, -1.8, 0.3);
      const vy0 = vy;
      if (phase === 'open') {
        // Falling until the wing takes hold.
        vy -= G * (1 - openK) * dt;
        vyT = lerp(vy, vyT, openK);
      }
      if (glide || phase === 'open') {
        vy += (vyT - vy) * (1 - Math.exp(-dt * (stalled ? 4 : 2.2)));
        vyA = dt > 0 ? (vy - vy0) / dt : 0;
      } else {
        // (a spring, critically damped: the climb and the dive start and stop softly, and never overshoot)
        const k = hopping ? HOP_EASE : EASE;
        vyA += (k * k * (vyT - vy) - 2 * k * vyA) * dt;
        vy += vyA * dt;
      }
      if (!easy && thin > 0 && vy > 0) vy *= 1 - thin;
      if (easy && thin > 0.5 && bar < 0 && !thinTold) {
        thinTold = true;
        ctx.hud.toast(t('rThinAir'));
      }

      // Forward. Into a slope or a wall: he glances off it along its face (turning that way, slowing).
      // Met head-on high up he banks hard to the side with more room and slides off along it; low down
      // the wing stalls and he drops to its foot. He never stops in the air.
      let nfx = Math.sin(yaw);
      let nfz = Math.cos(yaw);
      let nx = hang.x + nfx * v * dt;
      let nz = hang.z + nfz * v * dt;
      // (a wall is met at his feet, a little ahead of the strap's end: they never end up in it, so he lands at its foot, not on top)
      const reach = FEET_AHEAD * size;
      const clear = (x: number, z: number) => clearAt(world, x + nfx * reach, z + nfz * reach, low);
      // (not in the first moment off a ramp's end: a tuft of moss at the lip must not stop the take-off)
      if (!clear(nx, nz) && !(phase === 'fly' && pt < 0.4)) {
        const alongX = clear(nx, hang.z) ? Math.abs(nfx) : 0;
        const alongZ = clear(hang.x, nz) ? Math.abs(nfz) : 0;
        if (alongX > 0.15 || alongZ > 0.15) {
          if (alongX >= alongZ) nz = hang.z;
          else nx = hang.x;
          yaw += angleDiff(Math.atan2(nx - hang.x, nz - hang.z), yaw) * (1 - Math.exp(-dt * 5));
          v *= 1 - Math.min(1, dt * 1.5);
          nfx = Math.sin(yaw);
          nfz = Math.cos(yaw);
        } else {
          nx = hang.x;
          nz = hang.z;
          if (phase === 'fly' && lowOver > TURN_LOW) {
            dodge ||= openSide(low, look, Math.sign(turnIn) || Math.sign(bank));
            yaw += dodge * TURN_HARD * dt;
            bank += (dodge * BANK_MAX - bank) * (1 - Math.exp(-dt * 6));
            v *= 1 - Math.min(1, dt * 1.5);
            nfx = Math.sin(yaw);
            nfz = Math.cos(yaw);
          } else if (phase === 'open') {
            // (still unfolding he is falling anyway: the wing catches him after)
            v *= 0.3;
          } else {
            if (!stalled) {
              stalled = true;
              phase = 'flare';
              pt = 0;
            }
            v *= 1 - Math.min(1, dt * 4);
          }
        }
      }
      if (nx !== hang.x || nz !== hang.z) {
        hang.x = nx;
        hang.z = nz;
        // Circling in a thermal: the stronger side lifts his wing, he edges that way (easy climbing).
        const inside = Math.abs(bank) > 0.2 ? lift.toCore(hang.x, hang.y, hang.z, _core) : 0;
        if (inside > 0) {
          const k = CENTRE * inside * Math.min(1, Math.abs(bank) / BANK_MAX) * dt;
          if (world.groundAt(hang.x + _core.x * k, hang.z + _core.z * k) < low) {
            hang.x += _core.x * k;
            hang.z += _core.z * k;
          }
        }
      }
      hang.y += vy * dt;
      body.vel.set(nfx * v, vy, nfz * v);

      // The wing: nose down with speed, and at once as he pulls the bar in (up as he pushes it out); up in the flare; a little bob.
      // (easy flying: nose up climbing, down diving; no steeper for the quicker climb and dive high up)
      const climbing = easy && phase === 'fly' ? clamp(vy, -DIVE * EASY_FAST, CLIMB * EASY_FAST) * PITCH_PER_CLIMB : 0;
      const pitchT = (v - V_TRIM) * PITCH_PER_V + (vT - v) * 0.025 - climbing - 0.45 * ps.flare + 0.015 * Math.sin(clock * 1.3);
      pitchV += (12 * (clamp(pitchT, -0.5, 0.4) - pitch) - 4 * pitchV) * dt;
      pitch += pitchV * dt;
      wingQuat(quat, yaw, pitch, bank);
      wingOverHang();
      // He hangs under it: face down (a little of the wing's pitch), rolled with the bank, a little less
      // than the wing: his body swings to the inside of the turn (his weight shifted there).
      ps.pitch = 0.35 * pitch * ps.prone;
      ps.roll = (bank - 0.12 * turnIn) * ps.prone;
      feetFromHang(ctx);
      fists(ctx);
      ex.setMotion(0, false, -2);

      // Camera and wind.
      setCam(ctx, dt, lerp(FOCUS_UP, 1.3, ps.flare));
      // (back to its tilt by itself, unless the camera is held where it was put: a shot's `rcam`)
      if (!input.lookPitch && cam.follow > 0 && phase !== 'flare') cam.pitch += (camTilt() - cam.pitch) * (1 - Math.exp(-dt * 0.4));
      // (off the ledge with the leap: not into its rock, parachute.ts)
      keepOverLedge(ctx, dt);
      ctx.levels.wind = clamp(0.12 + (v - 7) / 17, 0, 1) * openK;
      ctx.levels.sail = clamp((v - 5) / 15, 0, 1) * openK;

      // Touching down: on deep water into a boat, on the ground running.
      const ground = world.groundAt(hang.x, hang.z);
      const water = world.waterAt(hang.x, hang.z);
      const feet = lowest(ctx);
      if (water !== null && water - ground > 0.9 && feet <= water) {
        putAway('water', ctx);
        body.pos.y = water;
        body.grounded = true;
        body.vel.set(nfx * v * 0.2, 0, nfz * v * 0.2);
        release(ctx);
        return 'boat';
      }
      // (not in the first moment off the ramp's end: his feet are still at the deck)
      if (feet <= ground && !(phase === 'fly' && pt < 0.3)) {
        body.pos.y = Math.max(body.pos.y, ground);
        body.grounded = true;
        const hard = phase !== 'flare' ? 1 : clamp(-vy / 4, 0.3, 0.8);
        ctx.sound('land', hard);
        phase = 'runout';
        pt = 0;
        runSpeed = Math.min(v, 6);
        ex.animator.postureFeet = true;
        ps.prone = 0;
        return null;
      }
      return null;
    },

    exit(ctx, to) {
      release(ctx);
      if (to === 'overview') {
        stow = 'none';
        glider.hide();
      } else if (stow === 'none') putAway('ground', ctx);
      ctx.levels.sail = 0;
    },

    frame(f, mode, pos) {
      // (the seed fluff while flying or standing on a ramp)
      lift.frame(f.t, f.dt, f.night, mode === 'hang');
      spots.frame(f.night, f.t, pos, mode === 'hang');
      if (mode === 'hang') {
        glider.pose({ position: at, quaternion: quat, size, open: openK, flutter: clamp((v - 4) / 18, 0, 1), t: clock, night: f.night });
        return;
      }
      if (stow === 'none') return;
      stowT += f.dt;
      if (stow === 'air') {
        at.addScaledVector(stowVel, f.dt);
        stowVel.y -= 2 * f.dt;
      } else if (stow === 'water') at.y -= 0.25 * f.dt * size;
      else {
        const k = smoothstep(0, LAY, stowT);
        at.lerpVectors(layFrom, layTo, k);
        quat.slerpQuaternions(layFromQ, layToQ, k);
      }
      const open = 1 - smoothstep(FOLD[0], FOLD[1], stowT);
      const shrink = smoothstep(GONE[0], GONE[1], stowT);
      glider.pose({ position: at, quaternion: quat, size, open, flutter: 0.05, t: clock, night: f.night, lines: 1 - smoothstep(0, FOLD[1], stowT), shrink });
      if (shrink >= 1) {
        stow = 'none';
        glider.hide();
      }
    },
  };

  return mode;
}

/** Which half of the stride he is in (it changes as a foot lands). */
const footHalf = (phase: number) => Math.floor(((((phase - 0.25) % 1) + 1) % 1) * 2);
