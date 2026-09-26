import { Frustum, Group, Matrix4, Sphere, Vector3, type PerspectiveCamera } from 'three';
import { clamp, smoothstep } from '../../character/pose';
import { BODY_UNIT_M } from '../../world/scale';
import { SURFACE, type HeightField } from '../heightfield';
import { OVERVIEW } from '../layout';
import { CALM_WEATHER, type MapFrame, type MapWeather } from '../types';
import { t } from '../ui/lang';
import { BALLOON, Balloon, buildBalloonHome } from './_balloonModel';
import { balloonPose, type BalloonPoseState } from './_balloonPoses';
import { installNearFade } from './_nearFade';
import { angleDiff } from './followCam';
import { ROAM_SCALE, type RoamCtx, type RoamMode, type RoamModeHandler, type RoamWorld } from './types';

/**
 * The hot air balloon (mode `balloon`).
 *
 * Its home is a small grass field in the valley below Angkor Wat, west of
 * the road's stairs up the cliff (`BALLOON_HOME`; `reserveBalloonHome` keeps
 * the trees off it and off a lane to the valley road, before the jungle is
 * planted). It stands there inflated and tethered to two stakes, its pilot
 * light burning, a small wooden sign by the lane; now and then the burner
 * fires a short breath to keep it warm (a glow in the night).
 *
 * - Walk up to the basket, E: he climbs in and stands at the burner line.
 * - W or Space: the burner roars and heats the air in the envelope; it
 *   lifts off (the tether lets go) and climbs, slowly, the longer the burn
 *   the faster (Shift: both burners). S opens the vent at the top: it
 *   sinks. Hands off, the air cools a little at a time and it sinks slowly.
 *   A / D turn the basket (the turning vents). Up to `CEILING` over the land.
 * - The wind carries it, slow and calm: a light breeze (low down along the
 *   valley to the east, higher up to the north over Angkor Wat) plus the
 *   day's wind (`MapWeather.wind`, `windDir`), stronger higher up and
 *   turning with height as the breeze does (the pilot steers by picking his
 *   height). The mist at the roaming area's edge holds it back.
 * - E low over the ground lands it, if the ground is fairly flat and open
 *   (no water, no temple, no trees in the envelope's way); on the ground E
 *   again and he climbs out. Touching down anywhere else just bumps: the
 *   burner lifts it off again. Left away from home it stands where it
 *   landed until he leaves roaming; then it is back home.
 * - The camera and the selfie phone work in the basket (tools.ts); the
 *   balloon floats on meanwhile (hardly cooling).
 *
 * The explorer's feet are the basket floor's middle (`body.pos`), he faces
 * the balloon's heading; the posture (_balloonPoses.ts) stands him at the
 * burner line.
 */

/** The balloon's field (m): west of the valley road, at the foot of the summit's cliff. */
export const BALLOON_HOME = { x: -32, z: -64 };
/** Half the field kept clear of trees (m), and the lane's half width to the road. */
const FIELD = 13;
const LANE = 2;
/** At home it turns its front (Angkor Wat on the flag) to the overview's camera. */
const HOME_YAW = Math.atan2(OVERVIEW.pos[0] - BALLOON_HOME.x, OVERVIEW.pos[2] - BALLOON_HOME.z);

// ── Heat and lift ──────────────────────────────────────────────────────────
/** Heat of the air in the envelope (0‥1): it floats level at `EQ`; standing on the ground it keeps `REST`. */
const EQ = 0.55;
const REST = 0.5;
/** The burner heats it at this rate × (1 − heat) (1/s); Shift: both burners. */
const BURN = 0.5;
const BURN_BOTH = 1.8;
/** It cools towards the outside air (`AMBIENT`) at this rate (1/s): quickly while hotter than level, slowly under it. */
const COOL_HIGH = 0.16;
const COOL_LOW = 0.028;
const AMBIENT = 0.2;
/** The vent open (S) lets the heat out this fast (1/s); the camera up: the cooling this slow. */
const VENT = 0.13;
const COOL_PHOTO = 0.25;
/** Climb or sink per unit of heat over level (m/s), and at most (m/s); how quickly it follows (s). */
const LIFT = 12;
const CLIMB_MAX = 4;
const SINK_MAX = 3;
const TAU_V = 1.2;
/** Higher up it climbs faster, so the land far below seems to move as much: once more for every this many metres over the ground (sinking: `RATE_DOWN`). */
const RATE_UP = 200;
const RATE_DOWN = 500;
/** Highest it climbs over the land (m): the burner lifts it no more over the last `THIN` m. */
const CEILING = 420;
const THIN = 90;
/** Coming down without the vent it rounds out near the ground: at most this sink at the touch (m/s). */
const SOFT_SINK = 0.8;
/** Landing (E): the sink from high to low (m/s); E lands from this high over the ground (m). */
const LAND_SINK = [0.7, 2] as const;
const LAND_AT = 12;

// ── Wind ───────────────────────────────────────────────────────────────────
/**
 * The breeze on a calm day (m/s at the ground) and where it blows to
 * (radians, 0 = +z): low down along the valley to the east-south-east (away
 * from the summit's cliff), turning as it climbs to the north-north-east
 * (over Angkor Wat) by `VEER_H` m over the ground: the pilot steers by
 * picking his height.
 */
const BREEZE = 1.3;
const BREEZE_LOW = 1.2;
const BREEZE_HIGH = 2.85;
const VEER_H = 300;
/** The day's wind at full strength (m/s at the ground); it turns with height as the breeze does. */
const WIND = 5;
/** Aloft the wind blows harder: × 2 at this height over the ground (m). */
const ALOFT = 400;
/** The drift follows the wind this quickly (s), stops this quickly on the ground (1/s). */
const TAU_H = 3.5;
const DRAG_GROUND = 3;
/** The mist at the roaming area's edge holds it back from this far in (m). */
const EDGE = 30;
/** Turning the basket (rad/s), and its own slow turn in the air. */
const SPIN = 0.35;

// ── Getting in and out, the camera ─────────────────────────────────────────
/** E at the basket from this near (m from its middle), the climb in or out (s), how high over the floor he hops (m, true size). */
const REACH = 3.4;
const HOP = 0.7;
const HOP_UP = 0.85;
/** Where he steps out to (m from the basket's middle, true size). */
const OUT = 1.3;
/** Follow camera: distance, tilt, focus over the basket floor (× size); up high it looks down more. */
const CAM_DIST = 17;
const CAM_PITCH = 0.3;
const FOCUS_UP = 1.5;
const TILT_HIGH = 0.5;
/** At home the burner breathes now and then (s between, s long). */
const BREATH_EVERY = 29;
const BREATH_LONG = 1.3;
/**
 * Parked, it is posed every frame only this near the camera (m) or while its
 * burner breathes; farther (its sway a pixel at most) a few times a second
 * (s between), not at all out of view, and at once when it moved.
 */
const POSE_NEAR = 150;
const POSE_EVERY = 0.25;

const _v = new Vector3();
const _wind = { x: 0, z: 0 };
const _frustum = new Frustum();
const _viewProj = new Matrix4();
const _sphere = new Sphere();

/** What the maps need (minimap.ts). */
export interface BalloonInfo {
  /** The basket floor's middle (world). */
  readonly pos: Vector3;
  /** At its home field (tethered). */
  readonly home: boolean;
  /** He is in it. */
  readonly riding: boolean;
}

export interface BalloonMode extends RoamModeHandler {
  readonly object: Group;
  readonly info: BalloonInfo;
  readonly blocks: number;
  /** The walker: the basket is within reach of feet at (x, z, y): E climbs in. */
  near(x: number, z: number, y: number): boolean;
  /** The standing basket is at (x, z) for feet at height `y` (the walker goes round it). */
  solid(x: number, z: number, y: number): boolean;
  /** Every frame in every mode: poses it, sends it home when roaming ends. */
  frame(f: MapFrame, mode: RoamMode): void;
}

/**
 * Keep the trees off the balloon's field and a lane from it to the valley
 * road (cells marked built on, as the landmarks and the road do). Call it
 * before the vegetation is planted (main.ts).
 */
export function reserveBalloonHome(field: HeightField): void {
  const { x, z } = BALLOON_HOME;
  field.occupy(x - FIELD, z - FIELD, x + FIELD, z + FIELD);
  const road = nearestRoad(field, x, z);
  if (!road) return;
  const d = Math.hypot(road.x - x, road.z - z);
  for (let s = FIELD - 2; s < d; s += 1) {
    const px = x + ((road.x - x) * s) / d;
    const pz = z + ((road.z - z) * s) / d;
    field.occupy(px - LANE, pz - LANE, px + LANE, pz + LANE);
  }
}

/** The valley road's nearest point to (x, z). */
function nearestRoad(field: HeightField, x: number, z: number): { x: number; z: number } | null {
  let best: { x: number; z: number } | null = null;
  let bd = Infinity;
  for (const p of field.paths) {
    if (p.name !== 'valley road') continue;
    for (const s of p.samples) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bd) [bd, best] = [d, { x: s.x, z: s.z }];
    }
  }
  return best;
}

export function createBalloon(field: HeightField, world: RoamWorld): BalloonMode {
  const model = new Balloon();
  // (what stands between the follow camera and him dissolves: the envelope over his head)
  installNearFade(model.envelope);
  const size = ROAM_SCALE;
  const home = { x: BALLOON_HOME.x, y: world.groundAt(BALLOON_HOME.x, BALLOON_HOME.z), z: BALLOON_HOME.z, yaw: HOME_YAW };
  // The sign by the lane in (facing the road), and the stakes the tether ropes go to.
  const road = nearestRoad(field, home.x, home.z) ?? { x: home.x + 30, z: home.z };
  const rd = Math.hypot(road.x - home.x, road.z - home.z) || 1;
  const sx = home.x + ((road.x - home.x) / rd) * (FIELD - 3.5) + ((road.z - home.z) / rd) * 2.2;
  const sz = home.z + ((road.z - home.z) / rd) * (FIELD - 3.5) - ((road.x - home.x) / rd) * 2.2;
  const sign = { x: sx, y: world.groundAt(sx, sz), z: sz, yaw: Math.atan2(road.x - sx, road.z - sz) };
  const stakes = BALLOON.tether.map((r) => {
    _v.set(r.x, 0, r.z).normalize().multiplyScalar(3.6 * size).applyAxisAngle(new Vector3(0, 1, 0), home.yaw);
    const x = home.x + _v.x;
    const z = home.z + _v.z;
    return new Vector3(x, world.groundAt(x, z) + 0.05 * size, z);
  });
  const deco = buildBalloonHome(home, sign, stakes, size);
  const object = new Group();
  object.name = 'roam:balloon';
  object.add(model.object, deco.object);

  // ── State ──────────────────────────────────────────────────────────────
  /** The basket floor's middle (world), heading, drift and climb. */
  const pos = new Vector3(home.x, home.y, home.z);
  let yaw = home.yaw;
  const vel = new Vector3();
  let yawV = 0;
  let heat = REST;
  /** The burner's flame now (0‥1), eased: the look and the roar. */
  let flame = 0;
  let atHome = true;
  let riding = false;
  let phase: 'board' | 'ground' | 'fly' | 'land' | 'out' = 'ground';
  let pt = 0;
  let clock = 0;
  const hopFrom = new Vector3();
  const hopTo = new Vector3();
  let hopYaw = 0;
  let prompt: string | null = null;
  let hinted = false;
  let edgeTold = -99;
  let thinTold = false;
  let settle: number | null = null;
  /** The camera or the phone is up. */
  let device = false;
  const ps: BalloonPoseState = { burn: 0, fistL: new Vector3(), fistR: new Vector3(), look: 0, t: 0 };
  const posture = () => balloonPose(ps);
  const handle = new Vector3().copy(BALLOON.handle);

  const info: BalloonInfo = {
    pos,
    get home() {
      return atHome;
    },
    get riding() {
      return riding;
    },
  };

  // ── Helpers ────────────────────────────────────────────────────────────

  /** Ground or water under (x, z), whichever is higher. */
  const floorAt = (x: number, z: number) => Math.max(world.groundAt(x, z), world.waterAt(x, z) ?? -Infinity);
  /** The highest ground or water under the basket at (x, z) turned `a`: its middle and its corners. */
  function floorUnder(x: number, z: number, a = yaw): number {
    const { hx, hz } = BALLOON.basket;
    const c = Math.cos(a);
    const s = Math.sin(a);
    let top = floorAt(x, z);
    for (const [u, v] of [
      [hx, hz],
      [-hx, hz],
      [hx, -hz],
      [-hx, -hz],
    ]) {
      const px = x + (u * c + v * s) * size * 0.9;
      const pz = z + (-u * s + v * c) * size * 0.9;
      top = Math.max(top, floorAt(px, pz));
    }
    return top;
  }

  /** The balloon at (x, z) with its basket floor at `y` would hit something: the basket a wall or a bank, the envelope a cliff or a tower. */
  function blocked(x: number, z: number, y: number): boolean {
    if (!world.inBounds(x, z)) return true;
    if (floorUnder(x, z) > y + 0.35) return true;
    const rr = BALLOON.radius * size * 0.92;
    const low = y + (BALLOON.throat + 2) * size;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (world.groundAt(x + Math.sin(a) * rr, z + Math.cos(a) * rr) > low) return true;
      if (world.groundAt(x + Math.sin(a) * rr * 0.5, z + Math.cos(a) * rr * 0.5) > y + BALLOON.throat * size) return true;
    }
    return false;
  }

  /** The wind at (height `over` the ground) with the day's weather, m/s into `_wind`. */
  function windAt(over: number, w: Readonly<MapWeather> | undefined): typeof _wind {
    const turn = (BREEZE_HIGH - BREEZE_LOW) * smoothstep(20, VEER_H, over);
    // (near the ground the trees and the land slow it)
    const k = (0.6 + 0.4 * smoothstep(0, 30, over)) * (1 + Math.min(1, Math.max(0, over) / ALOFT));
    const d = BREEZE_LOW + turn;
    _wind.x = Math.sin(d) * BREEZE * k;
    _wind.z = Math.cos(d) * BREEZE * k;
    if (w && w.wind > 0) {
      const wd = w.windDir + turn;
      _wind.x += Math.sin(wd) * WIND * w.wind * k;
      _wind.z += Math.cos(wd) * WIND * w.wind * k;
    }
    return _wind;
  }

  /**
   * Why the balloon cannot come down at (x, z) (a word key), or null: the
   * land under and round the basket fairly flat (one land step at most:
   * the land is built in 2 m steps), dry and open (nothing built, no tree
   * trunk), not a temple's pad, and no tree crowns where the envelope
   * comes down.
   */
  function whyNot(x: number, z: number): 'rNoLand' | 'rNoLandWater' | 'rNoLandTemple' | 'rNoLandTrees' | null {
    let lo = Infinity;
    let hi = -Infinity;
    let built = false;
    for (const [r, n] of [
      [0, 1],
      [1.0, 8],
      [2.4, 12],
    ] as const)
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const px = x + Math.sin(a) * r * size;
        const pz = z + Math.cos(a) * r * size;
        if (world.waterAt(px, pz) !== null) return 'rNoLandWater';
        const s = field.surfaceAt(px, pz);
        if (s === SURFACE.pad || s === SURFACE.bed) return 'rNoLandTemple';
        const g = world.groundAt(px, pz);
        if (g - field.heightAt(px, pz) > 0.6) built = true;
        [lo, hi] = [Math.min(lo, g), Math.max(hi, g)];
      }
    // Tree crowns where the envelope would stand (a trunk in the way is a tree too).
    if (world.softClearance) {
      const y = floorAt(x, z);
      const rr = BALLOON.radius * size * 0.75;
      for (let i = 0; i < 5; i++) {
        const a = (i / 4) * Math.PI * 2;
        const px = x + (i ? Math.sin(a) * rr : 0);
        const pz = z + (i ? Math.cos(a) * rr : 0);
        if (world.softClearance(px, y + (BALLOON.throat + 0.5) * size, pz, px, y + BALLOON.crown * size, pz) < 0.999) return 'rNoLandTrees';
      }
    }
    return built || hi - lo > 2.1 ? 'rNoLand' : null;
  }

  /** Where he can step out of the basket to (world), or null: level ground beside it, the side he faces first. */
  function outSpot(out: Vector3): Vector3 | null {
    const h = 1.7 * size * 0.95;
    for (const off of [0, 0.8, -0.8, Math.PI / 2, -Math.PI / 2, 2.3, -2.3, Math.PI]) {
      const a = yaw + off;
      const x = pos.x + Math.sin(a) * OUT * size;
      const z = pos.z + Math.cos(a) * OUT * size;
      if (!world.inBounds(x, z) || world.waterAt(x, z) !== null) continue;
      const g = world.standAt ? world.standAt(x, z, pos.y + 0.6, 1.2, h) : world.groundAt(x, z);
      if (Number.isNaN(g) || Math.abs(g - pos.y) > 1.2) continue;
      return out.set(x, g, z);
    }
    return null;
  }

  function setPrompt(ctx: RoamCtx, text: string | null): void {
    if (text === prompt) return;
    prompt = text;
    ctx.hud.prompt(text);
  }

  /** Back at home: tethered on its field (the explorer left roaming, or it was left there). */
  function goHome(): void {
    pos.set(home.x, home.y, home.z);
    yaw = home.yaw;
    vel.set(0, 0, 0);
    yawV = 0;
    heat = REST;
    atHome = true;
    phase = 'ground';
  }

  /** The keys, on the first ride of the visit. */
  function hint(ctx: RoamCtx): void {
    if (hinted || ctx.shot) return;
    hinted = true;
    ctx.hud.toast(t(document.body.classList.contains('roam-touch') ? 'rBalloonTouch' : 'rBalloonKeys'));
  }

  /** The follow camera: behind him, over the basket; up high it looks down more. */
  function setCam(ctx: RoamCtx, dt: number, over: number): void {
    const { cam, input } = ctx;
    cam.focus.set(pos.x, pos.y + FOCUS_UP * size, pos.z);
    cam.behindYaw = yaw;
    if (settle !== null) {
      cam.distance += (settle - cam.distance) * (1 - Math.exp(-dt * 1.2));
      if (input.zoom || Math.abs(settle - cam.distance) < 0.05) settle = null;
    }
    if (!input.lookPitch && cam.follow > 0) cam.pitch += (CAM_PITCH + TILT_HIGH * smoothstep(40, 350, over) - cam.pitch) * (1 - Math.exp(-dt * 0.4));
  }

  /** The hop over the rim, in or out: an arc from `hopFrom` to `hopTo`. */
  function hop(ctx: RoamCtx, dt: number): boolean {
    const { body } = ctx;
    pt += dt;
    const u = Math.min(1, pt / HOP);
    body.pos.lerpVectors(hopFrom, hopTo, u);
    body.pos.y += Math.sin(Math.PI * u) * (HOP_UP + BALLOON.basket.rim * 0.5) * size;
    body.yaw += angleDiff(hopYaw, body.yaw) * (1 - Math.exp(-dt * 8));
    body.explorer.setMotion(0, u >= 1, u < 0.5 ? 3 : -3);
    return u >= 1;
  }

  // ── The mode ───────────────────────────────────────────────────────────

  const mode: BalloonMode = {
    object,
    info,
    blocks: model.blocks + deco.blocks,

    near(x, z, y) {
      return !riding && Math.hypot(x - pos.x, z - pos.z) < REACH && Math.abs(y - pos.y) < 2;
    },

    solid(x, z, y) {
      if (riding || y > pos.y + BALLOON.basket.rim * size || y < pos.y - 2) return false;
      const dx = x - pos.x;
      const dz = z - pos.z;
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      return Math.abs(dx * c - dz * s) < BALLOON.basket.hx * size + 0.05 && Math.abs(dx * s + dz * c) < BALLOON.basket.hz * size + 0.05;
    },

    enter(ctx, from) {
      const { body, cam } = ctx;
      const ex = body.explorer;
      riding = true;
      prompt = null;
      thinTold = false;
      device = false;
      vel.set(0, 0, 0);
      yawV = 0;
      flame = 0;
      cam.minDistance = 7;
      cam.maxDistance = 60;
      cam.follow = 0.3;
      cam.fov = 50;
      ex.animator.postureFeet = true;
      if (from === 'overview') {
        // (a URL start: where `at` says, on the ground or in the air; else at home)
        if (new URLSearchParams(location.search).has('at')) {
          pos.copy(body.pos);
          yaw = body.yaw;
          atHome = Math.hypot(pos.x - home.x, pos.z - home.z) < 3;
        } else {
          goHome();
          if (new URLSearchParams(location.search).has('yaw')) yaw = body.yaw;
        }
        const fl = floorUnder(pos.x, pos.z);
        if (pos.y > fl + 2) {
          phase = 'fly';
          heat = EQ;
          atHome = false;
        } else {
          pos.y = fl;
          phase = 'ground';
          heat = REST;
        }
        body.pos.copy(pos);
        body.yaw = yaw;
        ex.animator.posture = posture;
        cam.distance = CAM_DIST;
        cam.pitch = CAM_PITCH;
        settle = null;
      } else {
        // Climb in over the rim.
        phase = 'board';
        pt = 0;
        hopFrom.copy(body.pos);
        hopTo.copy(pos);
        hopYaw = yaw;
        ex.animator.posture = null;
        body.vel.set(0, 0, 0);
        settle = CAM_DIST;
      }
      hint(ctx);
    },

    update(ctx, dt): RoamMode | null {
      const { body, input, cam } = ctx;
      const ex = body.explorer;
      clock += dt;
      ps.t = clock;
      cam.turn(input.lookYaw, input.lookPitch, input.zoom);
      const a = ex.currentAction;
      device = a === 'photo' || a === 'selfie';

      // ── Climbing in and out ────────────────────────────────────────────
      if (phase === 'board') {
        cam.focus.set(body.pos.x, body.pos.y + 1.2 * size, body.pos.z);
        cam.behindYaw = yaw;
        if (hop(ctx, dt)) {
          phase = 'ground';
          body.pos.copy(pos);
          body.yaw = yaw;
          ex.animator.posture = posture;
          ctx.sound('stepWood', 0.8);
        }
        return null;
      }
      if (phase === 'out') {
        cam.focus.set(body.pos.x, body.pos.y + 1.2 * size, body.pos.z);
        if (hop(ctx, dt)) {
          ctx.sound(world.field.surfaceAt(body.pos.x, body.pos.z) === SURFACE.grass ? 'stepGrass' : 'step', 0.8);
          return 'walk';
        }
        return null;
      }

      // ── The burner, the vent, the turning vents ────────────────────────
      const burn = phase !== 'land' && (input.jumpHeld || input.move.y > 0.3);
      const vent = phase === 'land' || input.move.y < -0.3;
      const turn = phase === 'ground' ? 0 : -input.move.x;
      flame += ((burn ? 1 : 0) - flame) * (1 - Math.exp(-dt * (burn ? 12 : 5)));
      if (burn) heat += BURN * (input.run ? BURN_BOTH : 1) * (1 - heat) * dt;
      const cool = (heat > EQ ? COOL_HIGH : COOL_LOW) * (heat - AMBIENT) * (device && !burn ? COOL_PHOTO : 1);
      heat -= cool * dt;
      if (vent) heat -= VENT * dt;
      if (phase === 'ground') heat = Math.max(heat, REST - 0.05);
      heat = clamp(heat, AMBIENT, 1);
      yawV += (turn * SPIN - yawV) * (1 - Math.exp(-dt * 1.5));
      yaw += (yawV + (phase === 'fly' ? 0.012 * Math.sin(clock * 0.07) : 0)) * dt;

      // ── Up and down ────────────────────────────────────────────────────
      const floor = floorUnder(pos.x, pos.z);
      const over = pos.y - floor;
      const thin = smoothstep(CEILING - THIN, CEILING, over);
      let vyT = clamp((heat - EQ) * LIFT, -SINK_MAX, CLIMB_MAX);
      vyT *= 1 + Math.max(0, over) / (vyT > 0 ? RATE_UP : RATE_DOWN);
      if (vyT > 0) vyT *= 1 - thin;
      if (thin > 0.5 && burn && !thinTold) {
        thinTold = true;
        ctx.hud.toast(t('rThinAir'));
      }
      // (rounding out near the ground unless the vent is open; landing: down gently)
      if (!vent && vyT < 0) vyT = Math.max(vyT, -(SOFT_SINK + (SINK_MAX - SOFT_SINK) * smoothstep(2, 20, over)));
      if (phase === 'land') vyT = -(LAND_SINK[0] + (LAND_SINK[1] - LAND_SINK[0]) * smoothstep(2, LAND_AT, over));
      if (phase === 'ground') {
        if (vyT > 0.25) {
          // Lift off: the tether lets go at home.
          phase = 'fly';
          atHome = false;
        } else vel.y = 0;
      }
      if (phase !== 'ground') vel.y += (vyT - vel.y) * (1 - Math.exp(-dt / TAU_V));

      // ── The drift ──────────────────────────────────────────────────────
      if (phase === 'ground') {
        vel.x *= Math.exp(-dt * DRAG_GROUND);
        vel.z *= Math.exp(-dt * DRAG_GROUND);
      } else {
        const w = windAt(over, ctx.weather);
        const k = 1 - Math.exp(-dt / TAU_H);
        vel.x += (w.x - vel.x) * k;
        vel.z += (w.z - vel.z) * k;
        // The mist at the edge holds it back (the part of the drift going out).
        if (world.edgeDistance) {
          const e = world.edgeDistance(pos.x + vel.x * 4, pos.z + vel.z * 4);
          if (e < EDGE) {
            const g = 1;
            const ex0 = world.edgeDistance(pos.x + g, pos.z) - world.edgeDistance(pos.x - g, pos.z);
            const ez0 = world.edgeDistance(pos.x, pos.z + g) - world.edgeDistance(pos.x, pos.z - g);
            const l = Math.hypot(ex0, ez0) || 1;
            const nx = ex0 / l;
            const nz = ez0 / l;
            const outward = -(vel.x * nx + vel.z * nz);
            if (outward > 0) {
              const hold = smoothstep(EDGE, EDGE * 0.3, e);
              vel.x += nx * outward * hold;
              vel.z += nz * outward * hold;
              if (hold > 0.5 && clock - edgeTold > 12) {
                edgeTold = clock;
                ctx.hud.toast(t('rBalloonEdge'));
              }
            }
          }
        }
      }
      // Move, sliding along what is in the way.
      const nx = pos.x + vel.x * dt;
      const nz = pos.z + vel.z * dt;
      if (nx !== pos.x || nz !== pos.z) {
        if (!blocked(nx, nz, pos.y)) {
          pos.x = nx;
          pos.z = nz;
        } else if (!blocked(nx, pos.z, pos.y)) {
          pos.x = nx;
          vel.z = 0;
        } else if (!blocked(pos.x, nz, pos.y)) {
          pos.z = nz;
          vel.x = 0;
        } else {
          vel.x *= 0.5;
          vel.z *= 0.5;
        }
      }
      pos.y += vel.y * dt;
      // Touching down: a bump, then it stands on the ground (the burner lifts it off again).
      const fl = floorUnder(pos.x, pos.z);
      if (pos.y <= fl) {
        if (phase === 'fly' || phase === 'land') {
          if (vel.y < -0.4) ctx.sound('land', clamp(-vel.y / 3, 0.2, 0.8));
          phase = 'ground';
          heat = Math.min(heat, REST);
        }
        pos.y = fl;
        vel.y = 0;
      }

      // ── What E does: land, step out ────────────────────────────────────
      const overNow = pos.y - fl;
      if (phase === 'ground') {
        setPrompt(ctx, `E  ${t('rStepOut')}`);
        if (input.use) {
          const why = whyNot(pos.x, pos.z);
          const at = why ? null : outSpot(hopTo);
          if (why || !at) ctx.hud.toast(t(why ?? 'rNoLand'));
          else {
            setPrompt(ctx, null);
            phase = 'out';
            pt = 0;
            hopFrom.copy(body.pos);
            hopYaw = Math.atan2(hopTo.x - pos.x, hopTo.z - pos.z);
            ex.animator.posture = null;
            atHome = Math.hypot(pos.x - home.x, pos.z - home.z) < 3;
            flame = 0;
            return null;
          }
        }
      } else if (phase === 'fly' && overNow < LAND_AT) {
        setPrompt(ctx, `E  ${t('rLand')}`);
        if (input.use) {
          const why = whyNot(pos.x, pos.z);
          if (why) ctx.hud.toast(t(why));
          else {
            phase = 'land';
            setPrompt(ctx, null);
          }
        }
      } else setPrompt(ctx, null);

      // ── Him, the camera, the roar ──────────────────────────────────────
      body.pos.copy(pos);
      body.yaw = yaw;
      body.vel.copy(vel);
      body.grounded = true;
      ex.setMotion(0, true, 0);
      ps.burn = device ? 0 : flame;
      ps.look += ((clamp(yawV * 1.5, -0.4, 0.4) + 0.25 * Math.sin(clock * 0.21) * Math.sin(clock * 0.047)) - ps.look) * (1 - Math.exp(-dt * 1.5));
      handle.copy(BALLOON.handle).y -= 0.07 * ps.burn;
      ps.fistR.copy(handle).divideScalar(BODY_UNIT_M);
      ps.fistL.copy(BALLOON.rimHand).divideScalar(BODY_UNIT_M);
      setCam(ctx, dt, overNow);
      ctx.levels.burner = flame;
      return null;
    },

    exit(ctx, to) {
      const { body } = ctx;
      riding = false;
      body.explorer.animator.posture = null;
      body.explorer.animator.postureFeet = true;
      setPrompt(ctx, null);
      ctx.levels.burner = 0;
      flame = 0;
      // Back to the map: the balloon is back home. Out of the basket: it stands where it is.
      if (to === 'overview') goHome();
      else if (phase !== 'out') {
        // (switched away some other way, in the air: it comes down where it is)
        phase = 'ground';
        pos.y = floorUnder(pos.x, pos.z);
      }
    },

    frame(f, mode) {
      clock += riding ? 0 : f.dt;
      if (mode === 'overview' && !atHome) goHome();
      const distance = f.camera.position.distanceTo(pos);
      if (!riding && !parkedPose(f.t, f.camera, distance)) return;
      place(f.t, f.night, f.weather, distance);
    },
  };

  // (what the parked balloon was last posed with)
  const posed = { at: Number.NEGATIVE_INFINITY, pos: new Vector3(Number.NaN, 0, 0), yaw: 0, home: true, flame: 0 };
  /** Parked: whether to pose it this frame (see `POSE_NEAR`). */
  function parkedPose(time: number, camera: PerspectiveCamera, distance: number): boolean {
    if (!posed.pos.equals(pos) || posed.yaw !== yaw || posed.home !== atHome || time < posed.at) return true;
    _sphere.center.copy(pos).y += 9 * size;
    _sphere.radius = 11 * size;
    _frustum.setFromProjectionMatrix(_viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    if (!_frustum.intersectsSphere(_sphere)) return false;
    const breathing = atHome && (time % BREATH_EVERY) / BREATH_LONG < 1;
    return distance < POSE_NEAR || breathing || posed.flame > 0 || time - posed.at >= POSE_EVERY;
  }

  /**
   * Pose the balloon: the burner (at home it breathes now and then, a glow
   * in the night; else the pilot light), the envelope's sway (less aloft:
   * it drifts with the air), the tether at home.
   */
  function place(time: number, night: number, w: Readonly<MapWeather>, distance: number): void {
    let fl = flame;
    if (!riding) {
      const b = (time % BREATH_EVERY) / BREATH_LONG;
      fl = atHome && b < 1 ? 0.75 * Math.sin(Math.PI * b) ** 0.5 : 0;
      handle.copy(BALLOON.handle).y -= 0.04;
    } else if (device) handle.copy(BALLOON.handle).y -= 0.04;
    posed.at = time;
    posed.pos.copy(pos);
    posed.yaw = yaw;
    posed.home = atHome;
    posed.flame = fl;
    const sway = riding && phase !== 'ground' ? 0.3 : 1;
    const lean = 0.03 * w.wind * sway;
    model.pose({
      position: pos,
      yaw,
      swayX: (0.012 * Math.sin(time * 0.43) + 0.006 * Math.sin(time * 1.1 + 1)) * sway + lean * Math.cos(w.windDir - yaw),
      swayZ: (0.01 * Math.sin(time * 0.37 + 2) + 0.005 * Math.sin(time * 0.9)) * sway - lean * Math.sin(w.windDir - yaw),
      size,
      flame: fl,
      night,
      t: time,
      handle,
      tether: atHome && (!riding || phase === 'ground' || phase === 'board' || phase === 'out') ? stakes : null,
      distance,
    });
  }
  place(0, 0, CALM_WEATHER, 200);
  return mode;
}
