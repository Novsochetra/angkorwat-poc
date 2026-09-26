import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { Pose } from '../../character/pose';
import { JOINTS } from '../../character/skeleton';
import { BODY_UNIT_M } from '../../world/scale';
import { swingSpot, type SwingSpot } from '../jungle/_swing';
import { t } from '../ui/lang';
import { solveArm } from './_boatPoses';
import { angleDiff } from './followCam';
import { ROAM_SCALE, type RoamCtx } from './types';

/**
 * Riding the rope swing on the Bayon's rim (the camps part's, jungle/_swing.ts):
 * on foot at the spot behind the seat, E sits him on it; he swings out over
 * the view and back, slowly higher, pumping with his legs (legs out and
 * leaning back on the way out, tucked on the way back); E or a move key
 * brakes it (his feet drag) and he steps off where he got on. Part of the
 * walk (walker.ts asks `near` and hands its steps here while `riding`): no
 * mode of its own, so the tools, the camera and the phone work as on foot.
 *
 * The posture (Animator `posture`, like the boat's) sits him on the plank
 * with his fists round the ropes (arm IK), the whole body tilted with the
 * ropes about the seat. Units: body units (BU) in the explorer's space.
 */

/** How far out it swings with him on it (radians from hanging straight), how fast it builds and brakes (1/s). */
const AMP = 0.5;
const BUILD = 0.28;
const BRAKE = 1.8;
/** Getting on and off (s). */
const ON = 0.7;
const OFF = 0.5;
/** Near enough to take the seat (m, across from the line between the stand spot and the seat; and up or down). */
const REACH = 1.5;
const RISE = 1.4;
/** Hips joint over the plank (BU) and back from its middle. */
const HIP_UP = 2.1;
const HIP_BACK = 0.3;
/** Where the fists hold the ropes: height over the plank (BU). */
const GRIP = 12.5;

const REST_HIPS = new Vector3(...JOINTS.hips.pivot);
const CHEST_REST = new Vector3(...JOINTS.chest.pivot).sub(REST_HIPS);
/** Elbows out and down (chest space). */
const POLE = { L: new Vector3(0.8, -0.55, -0.2).normalize(), R: new Vector3(-0.8, -0.55, -0.2).normalize() };

export interface SwingRide {
  /** He is on the swing (getting on, swinging, braking, getting off). */
  readonly riding: boolean;
  /** For bug reports: while riding, the stand spot he got on from and how long he has been on it (s); else null. */
  readonly ride: { stand: Vector3; seconds: number } | null;
  /** On foot at (x, z) with feet at y: close enough to take the seat. */
  near(x: number, z: number, y: number): boolean;
  /** Sit him on it. */
  start(ctx: RoamCtx): void;
  /** One step while riding; returns the prompt to show (or null). */
  update(ctx: RoamCtx, dt: number): string | null;
  /** Off at once (the walk ends: Esc, the map). */
  stop(ctx: RoamCtx): void;
}

export function createSwingRide(): SwingRide {
  let riding = false;
  let spot: SwingSpot | null = null;
  /** 0‥1 getting on, 1 on; `off` 0‥1 getting off. */
  let on = 0;
  let off = -1;
  let braking = false;
  let amp = 0;
  let phase = 0;
  let clock = 0;
  /** Seconds since he took the seat. */
  let onFor = 0;
  const from = new Vector3();
  const seat = new Vector3();
  const rest = new Vector3();
  const ps = { tilt: 0, pump: 0, t: 0 };
  const posture = () => swingPose(ps, spot?.half ?? 0.5);

  /** The seat's top now (m) for an angle. */
  const seatAt = (s: SwingSpot, a: number, out: Vector3) => out.set(Math.sin(s.yaw) * s.length * Math.sin(a), -s.length * Math.cos(a), Math.cos(s.yaw) * s.length * Math.sin(a)).add(s.pivot);

  const finish = (ctx: RoamCtx) => {
    riding = false;
    off = -1;
    if (spot) {
      spot.ridden = false;
      spot.angle = 0;
    }
    ctx.body.explorer.animator.posture = null;
    ctx.body.explorer.animator.postureFeet = true;
    ctx.body.grounded = true;
    ctx.body.vel.set(0, 0, 0);
  };

  return {
    get riding() {
      return riding;
    },

    get ride() {
      return riding && spot ? { stand: spot.stand, seconds: onFor } : null;
    },

    near(x, z, y) {
      const s = swingSpot();
      if (!s || s.ridden) return false;
      // (the line from the stand spot to under the seat)
      const ax = s.stand.x;
      const az = s.stand.z;
      const dx = s.seat.x - ax;
      const dz = s.seat.z - az;
      const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(x - (ax + dx * u), z - (az + dz * u)) < REACH && Math.abs(y - s.stand.y) < RISE;
    },

    start(ctx) {
      spot = swingSpot();
      if (!spot) return;
      riding = true;
      spot.ridden = true;
      on = 0;
      onFor = 0;
      off = -1;
      braking = false;
      // (it may still be stirring in the breeze: pick up from there)
      amp = Math.abs(spot.angle);
      phase = spot.angle >= 0 ? Math.PI / 2 : -Math.PI / 2;
      from.copy(ctx.body.pos);
      rest.copy(spot.seat);
      ctx.body.vel.set(0, 0, 0);
      ctx.body.explorer.animator.posture = posture;
      ctx.body.explorer.animator.postureFeet = false;
      ctx.sound('stepWood', 0.5);
    },

    update(ctx, dt) {
      const s = spot;
      if (!s) {
        finish(ctx);
        return null;
      }
      const { body, input, cam } = ctx;
      cam.turn(input.lookYaw, input.lookPitch, input.zoom);
      clock += dt;
      onFor += dt;
      // E or a move key: brake, then off.
      if (!braking && on >= 1 && (input.use || Math.hypot(input.move.x, input.move.y) > 0.3 || input.jump)) braking = true;
      amp += ((braking ? 0 : AMP) - amp) * (1 - Math.exp(-dt * (braking ? BRAKE : on < 1 ? 0 : BUILD)));
      const w = Math.sqrt(9.8 / s.length);
      phase += w * dt;
      const a = amp * Math.sin(phase);
      s.angle = a;
      seatAt(s, a, seat);
      // Facing out over the view.
      body.yaw += angleDiff(s.yaw, body.yaw) * (1 - Math.exp(-dt * 8));
      if (on < 1) {
        // Onto the seat: a short hop back onto the plank.
        on = Math.min(1, on + dt / ON);
        const e = on * on * (3 - 2 * on);
        body.pos.lerpVectors(from, seat, e);
        body.pos.y += Math.sin(Math.PI * on) * 0.35;
      } else if (off >= 0) {
        off = Math.min(1, off + dt / OFF);
        const e = off * off * (3 - 2 * off);
        body.pos.lerpVectors(seat, s.stand, e);
        body.pos.y += Math.sin(Math.PI * off) * 0.3;
        if (off >= 1) {
          body.pos.copy(s.stand);
          finish(ctx);
          body.explorer.setMotion(0, true, 0);
          return null;
        }
      } else {
        body.pos.copy(seat);
        if (braking && amp < 0.06) {
          // Stopped: stand up and step back off.
          off = 0;
          body.explorer.animator.posture = null;
          body.explorer.animator.postureFeet = true;
          ctx.sound('stepWood', 0.4);
        }
      }
      // The posture: tilted with the ropes, pumping (legs out and leaning back going out, tucked coming back).
      ps.tilt = a;
      ps.pump = amp > 0.02 ? Math.cos(phase) * Math.min(1, amp / (AMP * 0.6)) : 0;
      ps.t = clock;
      body.explorer.setMotion(0, true, 0);
      // The camera: behind him, looking out over the view; it follows the seat only part of the way (no sea-sickness).
      const k = 0.35;
      cam.focus.set(rest.x + (seat.x - rest.x) * k, rest.y + (seat.y - rest.y) * k + 1.0 * body.scale, rest.z + (seat.z - rest.z) * k);
      cam.behindYaw = s.yaw;
      return off >= 0 || braking ? null : `E  ${t('rSwingOff')}`;
    },

    stop(ctx) {
      if (!riding) return;
      if (spot) ctx.body.pos.copy(spot.stand);
      finish(ctx);
    },
  };
}

// ── The seated body ────────────────────────────────────────────────────────

/** What the ride sets every frame. */
interface SwingPoseState {
  /** The ropes' angle (radians, + = out over the view): the body tilts back with them. */
  tilt: number;
  /** −1‥1: + going out (legs out, lean back), − coming back (legs tucked, lean forward). */
  pump: number;
  t: number;
}

const _q = new Quaternion();
const _q2 = new Quaternion();
const _e = new Euler();
const _m = new Matrix4();
const _m2 = new Matrix4();
const _v = new Vector3();
const _t = new Vector3();
const _s = new Vector3(1, 1, 1);

/** Sitting on the plank (origin: the plank's top, his space), fists on the ropes `half` m out each side. */
function swingPose(s: SwingPoseState, half: number): Pose {
  // The body turns with the ropes about the plank: the rope's up (0, cos, −sin) in his frame.
  const tilt = -s.tilt;
  const c = Math.cos(tilt);
  const sn = Math.sin(tilt);
  const rot = (y: number, z: number, out: Vector3, x = 0) => out.set(x, y * c - z * sn, y * sn + z * c);
  rot(HIP_UP, -HIP_BACK, _v);
  const pump = s.pump;
  const breathe = 0.02 * Math.sin(s.t * 1.7);
  const pose: Pose = {
    hips: { px: _v.x - REST_HIPS.x, py: _v.y - REST_HIPS.y, pz: _v.z - REST_HIPS.z, rx: tilt - 0.06 },
    // Leaning back on the way out, forward on the way back; looking out at the view.
    chest: { rx: 0.08 - 0.2 * pump + breathe },
    neck: { rx: -0.05 + 0.08 * pump },
    head: { rx: -0.1 + 0.1 * pump, ry: 0.15 * Math.sin(s.t * 0.21) },
    // Thighs forward along the plank, shins hanging; out straight when going out, tucked under coming back.
    hipL: { rx: -1.45 - 0.18 * pump, rz: 0.06 },
    hipR: { rx: -1.45 - 0.18 * pump, rz: -0.06 },
    kneeL: { rx: 1.2 - 0.7 * pump },
    kneeR: { rx: 1.25 - 0.7 * pump },
    ankleL: { rx: -0.1 - 0.2 * pump },
    ankleR: { rx: -0.1 - 0.2 * pump },
  };

  // Fists on the ropes, a little above the shoulders, carried round with the tilt; into chest space for the IK.
  const x = half / (BODY_UNIT_M * ROAM_SCALE) - 0.6;
  const hp = pose.hips!;
  _q.setFromEuler(_e.set(hp.rx ?? 0, 0, 0));
  _m.compose(_t.set(REST_HIPS.x + (hp.px ?? 0), REST_HIPS.y + (hp.py ?? 0), REST_HIPS.z + (hp.pz ?? 0)), _q, _s);
  const ch = pose.chest!;
  _m2.compose(CHEST_REST, _q2.setFromEuler(_e.set(ch.rx ?? 0, 0, 0)), _s);
  _m.multiply(_m2).invert();
  Object.assign(pose, solveArm('L', rot(GRIP, 0.4, _t, x).applyMatrix4(_m), POLE.L));
  Object.assign(pose, solveArm('R', rot(GRIP, 0.4, _t, -x).applyMatrix4(_m), POLE.R));
  return pose;
}
