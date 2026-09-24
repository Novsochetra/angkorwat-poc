import { Euler, Group, Quaternion, Vector3 } from 'three';
import type { AngkorExplorer } from '../../character/AngkorExplorer';
import { clamp, lerp, mixPose, smoothstep, type Pose } from '../../character/pose';
import { JOINTS } from '../../character/skeleton';
import { OVERVIEW, placeById } from '../layout';
import { Canopy, OPEN_TIME, type CanopyPose } from './_canopy';
import { HARNESS, hangPose, leapPose, readyPose, tilt, type HangParams } from './_chutePoses';
import { angleDiff } from './followCam';
import { ROAM_SCALE, type FollowCam, type RoamCtx, type RoamMode, type RoamModeHandler, type RoamWorld } from './types';

/**
 * The leap off the ledge and the parachute glide.
 *
 * - `leap`: on the ledge by the camera the explorer turns to the map, crouches,
 *   runs three steps to the edge and jumps: arms flung wide, then over into a
 *   dive, growing from his true size to the roaming size while the view
 *   swings round behind him.
 * - `glide`: the canopy comes out of his pack and opens (about 0.9 s), the
 *   harness catches him and he swings under it. A / D pull a toggle and turn
 *   (the canopy banks, the trailing edge on that side comes down), W dives
 *   (faster, sinks faster, wider view), S brakes (slower, sinks less); the
 *   wind turns him back softly at the roaming area's edge. Near the ground he
 *   flares by himself and lands running; on deep water he comes down into a
 *   boat. Space high up lets the canopy go (the walker opens a new one with
 *   Space in a long fall).
 *
 * The canopy (_canopy.ts) is posed when the scene is drawn, after the
 * explorer has moved for the frame, so the lines meet his hands exactly, and
 * it keeps collapsing and fading after the glide has handed over to walking.
 */

// ── The leap ────────────────────────────────────────────────────────────────
/**
 * Take-off point from his feet on the ledge (m, forward and to his right):
 * the ledge's flat top reaches about 2.5 m out towards the map (foreground.ts),
 * and a little to the right keeps his feet off a dip in it.
 */
const TAKEOFF = { ahead: 2.3, right: 0.8 };
/** Turning to the map and crouching (s). */
const READY = 0.45;
/** The run: first push, speed-up, top speed (m/s, m/s², m/s, true size). */
const RUN_FROM = 1.6;
const RUN_ACCEL = 8;
const RUN_TOP = 5.2;
/** The jump: up speed (m/s) and gravity (a little over the real one: snappier). */
const JUMP_UP = 4.6;
const GRAVITY = 13;
/** Free fall before the canopy comes out, and growing to the roaming size (s). */
const FALL = 1.0;
const GROW = 0.9;
/** Middle of the body over the feet at true size (m): he grows round it. */
const MIDDLE_Y = 0.6;

// ── The glide ───────────────────────────────────────────────────────────────
/** Forward speed (m/s): steady, diving, braking, flaring. */
const SPEED = 9;
const SPEED_DIVE = 12.5;
const SPEED_BRAKE = 6.2;
const SPEED_FLARE = 3.6;
/** Sink (m/s): steady, diving, braking, flaring, and extra in a full turn. */
const SINK = 3;
const SINK_DIVE = 5.4;
const SINK_BRAKE = 2.1;
const SINK_FLARE = 1.6;
const SINK_TURN = 1.3;
/** Turn rate at a full toggle (rad/s). */
const TURN = 0.8;
/** He flares this high over the ground or water under and ahead of him (m). */
const FLARE_AT = 3.2;
/** Running out the landing (s). */
const RUNOUT = 0.55;
/** Letting the canopy go (Space): only this high over the ground (m), and the fold back into the pack (s). */
const LET_GO_ABOVE = 16;
const STOW = 0.45;
/** Follow camera: distance, tilt, and how high over his feet it looks (m). */
const CAM_DIST = 18;
const CAM_PITCH = 0.42;
const FOCUS_UP = 4.6;
/**
 * The ledge's rock round his feet there (m, from the feet; foreground.ts,
 * with a margin): it is not in the walk map the camera keeps out of.
 */
const LEDGE = { x0: -8.5, x1: 4.5, z0: -4, z1: 5.5, top: 3 };
/** Where the wind turns him at the edges: Angkor Wat. */
const HOME = placeById('sanctuary');

const UP = new Vector3(0, 1, 0);
/** The harness point in the chest's own space (BU). */
const HARNESS_IN_CHEST = new Vector3(...HARNESS).sub(new Vector3(...JOINTS.chest.pivot));
/** The back of his pack, and a lamp at its upper left corner (BU, the pack joint's space; parts/gear.ts). */
const PACK_BACK = new Vector3(0, 16, -8.4).sub(new Vector3(...JOINTS.backpack.pivot));
const PACK_LAMP = new Vector3(2.2, 17.6, -8.7).sub(new Vector3(...JOINTS.backpack.pivot));
const _q = new Quaternion();
const _e = new Euler();

/** Which half of the stride he is in (it changes as a foot lands). */
const footHalf = (ex: AngkorExplorer) => Math.floor((((ex.animator.phase - 0.25) % 1) + 1) % 1 * 2);
/** Ground or water under (x, z), whichever is higher. */
const floorAt = (w: RoamWorld, x: number, z: number) => Math.max(w.groundAt(x, z), w.waterAt(x, z) ?? -Infinity);

/**
 * Lowest camera tilt from `pitch` up that keeps the follow camera out of the
 * ledge's rock (just after the leap it would be right in it).
 */
function overLedge(ctx: RoamCtx, pitch: number): number {
  const { cam } = ctx;
  const f = ctx.ledge.feet;
  for (let p = pitch; p < 1.3; p += 0.04) {
    const c = Math.cos(p) * cam.distance;
    const x = cam.focus.x - Math.sin(cam.yaw) * c - f.x;
    const y = cam.focus.y + Math.sin(p) * cam.distance - f.y;
    const z = cam.focus.z - Math.cos(cam.yaw) * c - f.z;
    if (x < LEDGE.x0 || x > LEDGE.x1 || z < LEDGE.z0 || z > LEDGE.z1 || y > LEDGE.top) return p;
  }
  return 1.3;
}

/** A group that poses its contents whenever the scene is drawn. */
class PosedGroup extends Group {
  constructor(private readonly pose: () => void) {
    super();
  }

  override updateMatrixWorld(force?: boolean): void {
    this.pose();
    super.updateMatrixWorld(force);
  }
}

export function createParachute(): { leap: RoamModeHandler; glide: RoamModeHandler } {
  const canopy = new Canopy();
  let explorer: AngkorExplorer | null = null;
  let night = 0;

  /** What the canopy is doing, and since when (the explorer's animation clock: it runs in every mode). */
  let chute: 'none' | 'fly' | 'collapse' | 'stow' = 'none';
  let since = 0;
  const clock = () => explorer?.animator.time ?? 0;

  // Leap state.
  let phase: 'ready' | 'run' | 'air' = 'ready';
  let lt = 0;
  let readyK = 0;
  let runSpeed = 0;
  let startYaw = 0;
  let runYaw = 0;
  let diveYaw = 0;
  let lastHalf = 0;
  const takeoff = new Vector3();

  // Glide state: time, forward speed and vertical speed (m/s), turn rate, bank and swing (springs),
  // the player's toggles (eased), the flare, the run-out after landing.
  let air: 'leap' | 'glide' = 'leap';
  let gt = 0;
  let hs = 0;
  let vy = 0;
  let omega = 0;
  let bank = 0;
  let bankV = 0;
  let pitch = 0;
  let pitchV = 0;
  let turnS = 0;
  let dive = 0;
  let brake = 0;
  let flare = 0;
  let brakeL = 0;
  let brakeR = 0;
  let landed = -1;
  let runV = 0;
  let focusUp = FOCUS_UP;
  let zoomBase = CAM_DIST;
  let fromLeap = false;
  let archPose: Pose = {};
  let turnedBack = false;
  let playerTilt = false;
  const hang: HangParams = { pullL: 0, pullR: 0, turn: 0, dive: 0, flare: 0 };

  /** The explorer's pose in the air: the leap; then hanging in the harness, blended in from the dive as the canopy opens. */
  function airPose(): Pose {
    if (air === 'leap') return leapPose(lt);
    const p = tilt(hangPose(clock(), hang), pitch, -bank, HARNESS);
    const arch = fromLeap ? 1 - smoothstep(0.1, 0.8, gt) : 0;
    return arch > 0 ? mixPose(p, archPose, arch) : p;
  }

  /** Let the explorer's body go (leaving the air modes). */
  function release(ex: AngkorExplorer): void {
    ex.animator.posture = null;
    ex.animator.postureFeet = true;
  }

  // ── The canopy, posed as the scene is drawn ─────────────────────────────
  const cp: CanopyPose = {
    harness: new Vector3(),
    quat: new Quaternion(),
    size: 1,
    open: 0,
    brakeL: 0,
    brakeR: 0,
    t: 0,
    flutter: 0,
    pack: new Vector3(),
    lamp: new Vector3(),
    shoulderL: new Vector3(),
    shoulderR: new Vector3(),
    handL: new Vector3(),
    handR: new Vector3(),
    lines: 1,
    night: 0,
  };

  /** Read where the explorer's harness, pack, shoulders and fists are now, and set the canopy's pose from the glide. */
  function readPose(ex: AngkorExplorer): CanopyPose {
    const j = ex.rig.joints;
    j.chest.updateWorldMatrix(true, false);
    cp.harness.copy(HARNESS_IN_CHEST).applyMatrix4(j.chest.matrixWorld);
    j.backpack.updateWorldMatrix(true, false);
    cp.pack.copy(PACK_BACK).applyMatrix4(j.backpack.matrixWorld);
    cp.lamp.copy(PACK_LAMP).applyMatrix4(j.backpack.matrixWorld);
    j.shoulderL.getWorldPosition(cp.shoulderL);
    j.shoulderR.getWorldPosition(cp.shoulderR);
    j.propL.getWorldPosition(cp.handL);
    j.propR.getWorldPosition(cp.handR);
    cp.size = ex.object.scale.x;
    cp.t = clock();
    cp.night = night;
    const yaw = ex.object.rotation.y;
    if (chute === 'fly') {
      cp.open = clock() - since;
      // (while it opens it trails behind, then swings up over him)
      const trail = 0.5 * (1 - smoothstep(0, OPEN_TIME, cp.open));
      cp.quat.setFromAxisAngle(UP, yaw).multiply(_q.setFromEuler(_e.set(pitch - trail, 0, -bank)));
      cp.brakeL = brakeL;
      cp.brakeR = brakeR;
      cp.flutter = 0.35 + 0.65 * dive;
      cp.lines = 1;
    } else {
      cp.quat.setFromAxisAngle(UP, yaw);
      cp.brakeL = cp.brakeR = 0;
      cp.flutter = 0.6;
    }
    return cp;
  }

  /** The heap's landing point (a heap far from him: he went back to the overview). */
  const landedAt = new Vector3();
  let drawn = '';

  function draw(): void {
    if (chute === 'none' || !explorer) return;
    // (the scene may be brought up to date several times a frame: pose once per step)
    const key = `${chute}|${since}|${clock()}`;
    if (key === drawn) return;
    drawn = key;
    if (chute === 'collapse' && explorer.object.position.distanceTo(landedAt) > 60) {
      chute = 'none';
      canopy.hide();
      return;
    }
    const p = readPose(explorer);
    const tau = clock() - since;
    if (chute === 'fly') canopy.fly(p);
    else if (chute === 'stow') {
      // Folding back into the pack.
      const k = tau / STOW;
      if (k >= 1) {
        chute = 'none';
        canopy.hide();
        return;
      }
      p.open = OPEN_TIME * (1 - k);
      p.lines = 1 - k;
      canopy.fly(p);
    } else if (!canopy.settle(tau, p)) chute = 'none';
  }

  const object = new PosedGroup(draw);
  object.name = 'parachute:posed';
  object.add(canopy.object);

  /** Keep the view where it is (the overview) while he gets ready and runs: an orbit that puts the camera exactly there. */
  function holdView(cam: FollowCam): void {
    const c = cam.camera;
    if (c.position.lengthSq() < 1) {
      // (a URL start: the overview camera has not been placed yet)
      c.position.set(...OVERVIEW.pos);
      c.lookAt(...OVERVIEW.target);
    }
    const fwd = new Vector3(0, 0, -1).applyQuaternion(c.quaternion);
    const reach = 30;
    cam.focus.copy(c.position).addScaledVector(fwd, reach);
    cam.yaw = Math.atan2(fwd.x, fwd.z);
    cam.pitch = Math.asin(-fwd.y);
    cam.minDistance = 4;
    cam.maxDistance = 60;
    cam.distance = reach;
    cam.follow = 0;
    cam.fov = c.fov;
    cam.blendFrom(0);
  }

  const leap: RoamModeHandler = {
    enter(ctx) {
      const { body, cam } = ctx;
      explorer = body.explorer;
      chute = 'none';
      canopy.hide();
      air = 'leap';
      phase = 'ready';
      lt = readyK = 0;
      body.pos.copy(ctx.ledge.feet);
      body.vel.set(0, 0, 0);
      body.grounded = true;
      body.scale = 1;
      startYaw = body.yaw = ctx.ledge.yaw;
      const f = ctx.ledge.feet;
      takeoff.set(f.x + Math.sin(startYaw) * TAKEOFF.ahead - Math.cos(startYaw) * TAKEOFF.right, f.y, f.z + Math.cos(startYaw) * TAKEOFF.ahead + Math.sin(startYaw) * TAKEOFF.right);
      runYaw = Math.atan2(takeoff.x - f.x, takeoff.z - f.z);
      diveYaw = Math.atan2(HOME.x - takeoff.x, HOME.z - takeoff.z);
      holdView(cam);
      explorer.animator.posture = () => readyPose(readyK);
      explorer.animator.postureFeet = true;
    },

    update(ctx, dt): RoamMode | null {
      const { body, cam } = ctx;
      const ex = body.explorer;
      night = ctx.night;
      lt += dt;

      if (phase === 'ready') {
        // Turn to the take-off and crouch, looking out over the land.
        body.yaw = startYaw + angleDiff(runYaw, startYaw) * smoothstep(0, READY, lt);
        readyK = smoothstep(0, 0.35, lt);
        ex.setMotion(0, true, 0);
        if (lt >= READY) {
          phase = 'run';
          lt = 0;
          runSpeed = RUN_FROM;
          lastHalf = footHalf(ex);
          // (the crouch eases out into the first steps)
          ex.animator.posture = null;
        }
        return null;
      }

      if (phase === 'run') {
        runSpeed = Math.min(RUN_TOP, runSpeed + RUN_ACCEL * dt);
        const dx = takeoff.x - body.pos.x;
        const dz = takeoff.z - body.pos.z;
        const left = Math.hypot(dx, dz);
        const step = runSpeed * dt;
        ctx.levels.wind = 0.08;
        if (step < left) {
          body.pos.x += (dx / left) * step;
          body.pos.z += (dz / left) * step;
          ex.setMotion(runSpeed, true, 0);
          // A footfall each time a foot lands (a quarter and three quarters into the stride).
          const half = footHalf(ex);
          if (half !== lastHalf) ctx.sound('step', 0.7);
          lastHalf = half;
          return null;
        }
        // Off the edge!
        body.pos.x = takeoff.x;
        body.pos.z = takeoff.z;
        phase = 'air';
        air = 'leap';
        lt = 0;
        const v = runSpeed + 0.6;
        body.vel.set(Math.sin(runYaw) * v, JUMP_UP, Math.cos(runYaw) * v);
        body.grounded = false;
        ctx.sound('jump');
        ex.animator.posture = airPose;
        ex.animator.postureFeet = false;
        // The view leaves the overview and swings round behind him.
        cam.focus.set(body.pos.x, body.pos.y + MIDDLE_Y, body.pos.z);
        cam.blendFrom(2.2);
        cam.yaw = runYaw;
        cam.pitch = 0.3;
        cam.distance = 8;
        cam.minDistance = 4;
        cam.maxDistance = 45;
        cam.fov = 50;
        return null;
      }

      // In the air: he turns to the temple, grows round his middle, and dives.
      body.vel.y -= GRAVITY * dt;
      const turn = angleDiff(diveYaw, body.yaw) * (1 - Math.exp(-dt * 2));
      body.yaw += turn;
      const c = Math.cos(turn);
      const s = Math.sin(turn);
      body.vel.set(body.vel.x * c + body.vel.z * s, body.vel.y, -body.vel.x * s + body.vel.z * c);
      const s0 = body.scale;
      const grow = smoothstep(0, GROW, lt);
      body.scale = 1 + (ROAM_SCALE - 1) * grow;
      body.pos.y -= (body.scale - s0) * MIDDLE_Y;
      body.pos.addScaledVector(body.vel, dt);
      ex.setMotion(0, false, body.vel.y / body.scale);
      ctx.levels.wind = clamp(body.vel.length() / 14, 0, 1);
      cam.focus.set(body.pos.x, body.pos.y + MIDDLE_Y * body.scale, body.pos.z);
      cam.yaw += angleDiff(body.yaw, cam.yaw) * (1 - Math.exp(-dt * 3));
      cam.distance = lerp(8, 12, grow);
      cam.pitch += (overLedge(ctx, lerp(0.3, CAM_PITCH, grow)) - cam.pitch) * (1 - Math.exp(-dt * 6));
      return lt >= FALL ? 'glide' : null;
    },

    exit(ctx, to) {
      if (to !== 'glide') release(ctx.body.explorer);
    },
  };

  /** Feet on the ground or in the water: the canopy falls in a heap behind him. */
  function touchDown(ctx: RoamCtx, water: boolean): void {
    const { body, world } = ctx;
    const ex = body.explorer;
    landed = 0;
    runV = water ? 0 : Math.min(hs, 5);
    vy = 0;
    body.grounded = true;
    release(ex);
    ctx.sound(water ? 'splash' : 'land', 0.6);
    // (its pose now, from the last step, then its way down)
    canopy.fly(readPose(ex));
    canopy.collapse(body.pos, body.yaw, body.scale, (x, z) => floorAt(world, x, z), water, bank < 0 ? -1 : 1);
    landedAt.copy(body.pos);
    chute = 'collapse';
    since = clock();
    ctx.sound('chuteClose', 0.7);
  }

  /** After the touch-down: a few running steps, slowing, then walking. */
  function runOut(ctx: RoamCtx, dt: number): RoamMode | null {
    const { body, world, cam } = ctx;
    landed += dt;
    const k = Math.min(1, landed / RUNOUT);
    const v = runV * (1 - k);
    const fx = Math.sin(body.yaw);
    const fz = Math.cos(body.yaw);
    const nx = body.pos.x + fx * v * dt;
    const nz = body.pos.z + fz * v * dt;
    const g = world.groundAt(nx, nz);
    const w = world.waterAt(nx, nz);
    if (world.inBounds(nx, nz) && g <= body.pos.y + 1 && g >= body.pos.y - 1 && (w === null || w < g + 0.5)) {
      body.pos.set(nx, g, nz);
      body.vel.set(fx * v, 0, fz * v);
    } else body.vel.set(0, 0, 0);
    body.explorer.setMotion(v / body.scale, true, 0);
    ctx.levels.wind = 0.12 * (1 - k);
    // The camera comes down to him (and near enough for the walker's).
    focusUp += (1.39 * body.scale - focusUp) * (1 - Math.exp(-dt * 5));
    cam.focus.set(body.pos.x, body.pos.y + focusUp, body.pos.z);
    cam.distance += (Math.min(cam.distance, 12.5) - cam.distance) * (1 - Math.exp(-dt * 5));
    return landed >= RUNOUT ? 'walk' : null;
  }

  const glide: RoamModeHandler = {
    object,

    enter(ctx, from) {
      const { body, cam } = ctx;
      const ex = body.explorer;
      explorer = ex;
      night = ctx.night;
      air = 'glide';
      gt = 0;
      landed = -1;
      turnedBack = playerTilt = false;
      const fx = Math.sin(body.yaw);
      const fz = Math.cos(body.yaw);
      hs = Math.max(0, body.vel.x * fx + body.vel.z * fz);
      vy = body.vel.y;
      bank = bankV = pitchV = omega = 0;
      turnS = dive = brake = flare = brakeL = brakeR = 0;
      zoomBase = CAM_DIST;
      focusUp = cam.focus.y - body.pos.y;
      fromLeap = from === 'leap';
      if (from === 'overview') {
        // (a URL start: already flying under a full canopy)
        since = clock() - OPEN_TIME - 1;
        gt = OPEN_TIME + 1;
        hs = SPEED;
        vy = -SINK;
        pitch = 0;
        focusUp = FOCUS_UP;
        cam.distance = CAM_DIST;
        cam.pitch = CAM_PITCH;
        cam.focus.set(body.pos.x, body.pos.y + FOCUS_UP, body.pos.z);
      } else {
        since = clock();
        // Out of the dive he swings under the canopy; from a fall, a smaller swing.
        pitch = fromLeap ? 0.35 : 0.15;
        archPose = fromLeap ? leapPose(lt) : {};
        ctx.sound('chuteOpen');
      }
      chute = 'fly';
      ex.animator.posture = airPose;
      ex.animator.postureFeet = false;
      cam.follow = 1.2;
      cam.minDistance = 8;
      cam.maxDistance = 45;
      cam.fov = 50;
    },

    update(ctx, dt): RoamMode | null {
      const { body, input, world, cam } = ctx;
      const ex = body.explorer;
      night = ctx.night;
      cam.turn(input.lookYaw, input.lookPitch, input.zoom);
      if (input.zoom) zoomBase = cam.distance;
      gt += dt;
      if (landed >= 0) return runOut(ctx, dt);
      // How much the canopy holds him (and answers the toggles) while it opens.
      const open = smoothstep(0.2, OPEN_TIME, gt);
      const fx = Math.sin(body.yaw);
      const fz = Math.cos(body.yaw);

      // Ground and water under him and just ahead (for the flare).
      const ahead = Math.max(3, hs * 0.7);
      const height = body.pos.y - Math.max(floorAt(world, body.pos.x, body.pos.z), floorAt(world, body.pos.x + fx * ahead, body.pos.z + fz * ahead));

      // Space high up: let the canopy go and fall (Space in the fall opens a new one).
      if (input.jump && open >= 1 && height > LET_GO_ABOVE) {
        chute = 'stow';
        since = clock();
        ctx.sound('chuteClose', 0.7);
        body.grounded = false;
        body.vel.set(fx * hs, vy, fz * hs);
        release(ex);
        // (within the walker's range, so its camera does not jump in)
        cam.distance = Math.min(cam.distance, 16);
        return 'walk';
      }

      // The player's toggles, eased (a canopy answers softly).
      const k = 1 - Math.exp(-dt * 3.5);
      turnS += (-input.move.x - turnS) * k;
      dive += (Math.max(0, input.move.y, input.run ? 1 : 0) - dive) * k;
      brake += (Math.max(0, -input.move.y) - brake) * k;
      flare += ((height < FLARE_AT && open >= 1 ? 1 : 0) - flare) * (1 - Math.exp(-dt * 3.5));

      // Turning; at the roaming area's edge the wind turns him back towards the temples.
      omega = turnS * TURN * open * (1 - flare);
      if (!world.inBounds(body.pos.x + fx * 45, body.pos.z + fz * 45)) {
        const home = Math.atan2(HOME.x - body.pos.x, HOME.z - body.pos.z);
        const back = clamp(angleDiff(home, body.yaw) * 1.5, -0.9, 0.9);
        omega = lerp(omega, back, 0.8);
        if (!turnedBack && Math.abs(back) > 0.3) {
          ctx.hud.toast('The wind turns you back towards the temples');
          turnedBack = true;
        }
      } else turnedBack = false;

      // Speed and sink: the canopy takes hold as it opens (from a fall: a firm tug upwards).
      let vT = SPEED + (SPEED_DIVE - SPEED) * dive - (SPEED - SPEED_BRAKE) * brake;
      let wT = SINK + (SINK_DIVE - SINK) * dive - (SINK - SINK_BRAKE) * brake + SINK_TURN * Math.abs(turnS) * open;
      // Gentle gusts (the same every run).
      wT += 0.5 * Math.sin(gt * 0.63 + 1.1) * Math.sin(gt * 0.23 + 0.4);
      vT += 0.4 * Math.sin(gt * 0.41);
      vT = lerp(vT, SPEED_FLARE, flare);
      wT = lerp(wT, SINK_FLARE, flare);
      hs += (vT - hs) * (1 - Math.exp(-dt * (0.4 + 1.8 * open)));
      vy -= 9.8 * (1 - open) * dt;
      vy += (-wT - vy) * (1 - Math.exp(-dt * 4.5 * open));
      body.yaw += omega * dt;
      const nfx = Math.sin(body.yaw);
      const nfz = Math.cos(body.yaw);
      // Into a cliff: no further forward (he can steer away); he still sinks.
      const nx = body.pos.x + nfx * hs * dt;
      const nz = body.pos.z + nfz * hs * dt;
      if (world.groundAt(nx, nz) > body.pos.y + 0.6) hs *= 0.3;
      else {
        body.pos.x = nx;
        body.pos.z = nz;
      }
      body.pos.y += vy * dt;
      body.vel.set(nfx * hs, vy, nfz * hs);

      // The pendulum under the canopy: bank into turns, swing with speed changes and the flare (springs).
      const bankT = clamp(Math.atan2(hs * omega, 9.8) * 0.9, -0.55, 0.55) + 0.03 * Math.sin(gt * 1.3) * (1 - flare);
      bankV += (16 * (bankT - bank) - 6 * bankV) * dt;
      bank += bankV * dt;
      const pitchT = clamp((vT - hs) * 0.05, -0.25, 0.25) - 0.3 * flare + 0.02 * Math.sin(gt * 0.9);
      pitchV += (10 * (pitchT - pitch) - 3.5 * pitchV) * dt;
      pitch += pitchV * dt;

      // Toggles in his hands, and the canopy's trailing edge they pull.
      const pullL = Math.max(brake, turnS, flare) * open;
      const pullR = Math.max(brake, -turnS, flare) * open;
      brakeL = pullL;
      brakeR = pullR;
      hang.pullL = pullL + 0.5 * flare;
      hang.pullR = pullR + 0.5 * flare;
      hang.turn = turnS * open;
      hang.dive = dive;
      hang.flare = flare;
      // (the air pose is under the posture; a landing squash comes when he touches down)
      ex.setMotion(0, false, -3);

      // Camera: behind and above, looking into the turn, wider when diving, down to him for the landing.
      cam.behindYaw = body.yaw + omega * 0.4;
      focusUp += (lerp(FOCUS_UP * (body.scale / ROAM_SCALE), 1.39 * body.scale, flare) - focusUp) * (1 - Math.exp(-dt * 1.6));
      cam.focus.set(body.pos.x, body.pos.y + focusUp, body.pos.z);
      if (!input.zoom) cam.distance += (lerp(zoomBase, Math.min(zoomBase, 12.5), flare) - cam.distance) * (1 - Math.exp(-dt * 1.2));
      // (its tilt is the player's once they drag it; until then it settles, and keeps over the ledge)
      if (input.lookPitch) playerTilt = true;
      const tiltTo = overLedge(ctx, playerTilt ? cam.pitch : CAM_PITCH);
      if (!playerTilt || tiltTo > cam.pitch) cam.pitch += (tiltTo - cam.pitch) * (1 - Math.exp(-dt * (tiltTo > cam.pitch ? 6 : 1.5)));
      cam.fov = 50 + 10 * dive - 3 * brake;
      ctx.levels.wind = clamp(0.15 + (Math.hypot(hs, vy) - 5) / 11, 0, 1);

      // Touching down: on deep water into a boat, on the ground running.
      const ground = world.groundAt(body.pos.x, body.pos.z);
      const water = world.waterAt(body.pos.x, body.pos.z);
      if (water !== null && water - ground > 0.9 && body.pos.y <= water) {
        body.pos.y = water;
        touchDown(ctx, true);
        body.vel.set(nfx * hs * 0.3, 0, nfz * hs * 0.3);
        return 'boat';
      }
      if (body.pos.y <= ground) {
        body.pos.y = ground;
        touchDown(ctx, false);
      }
      return null;
    },

    exit(ctx, to) {
      release(ctx.body.explorer);
      // Back to the overview: nothing left behind.
      if (to === 'overview') {
        chute = 'none';
        canopy.hide();
      }
    },
  };

  return { leap, glide };
}
