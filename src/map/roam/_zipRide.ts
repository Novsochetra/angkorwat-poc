import { Quaternion, Vector3 } from 'three';
import { buildZipHarness, buildZipLegLoop, zipPose, zipPoseState, zipRingAt } from '../../character/zipRide';
import { BODY_UNIT_M } from '../../world/scale';
import { SFX } from '../audio/addonSfx';
import { hangerQuat, trolleyPin, type ZipLineMeshes } from '../jungle/_zipLine';
import { pad } from '../pad/pad';
import { num, t } from '../ui/lang';
import { touchJump, type AddonEnv } from './_addons';
import { angleDiff } from './followCam';
import { BRAKE, cableSlope, STRAP, ZIP_LINES, type ZipLineDef, type ZipPlan } from './_zipPlan';
import type { RoamCtx } from './types';

/**
 * Riding the zip line (the add-on: _zip.ts; the line: _zipPlan.ts; the
 * meshes: jungle/_zipLine.ts; his pose: character/zipRide.ts). It holds him
 * in walk mode, as the rope swing does (_swingRide.ts).
 *
 * - Clipping in (`CLIP` s): from where he pressed E he steps to the spot
 *   under the trolley and turns down the line, the harness goes on, he takes
 *   the lanyard in both fists and draws it to his harness's ring (a click),
 *   then sits back in the harness, his feet leave the deck.
 * - Riding: his speed comes from the cable's slope (steeper at first, as it
 *   sags, a little uphill at the end), less the air and the pulleys; Shift
 *   tucks his knees up (less air: faster). He swings on the lanyard as it
 *   speeds up and slows (a pendulum), sways softly from side to side (more in
 *   the wind), his legs swinging. The trolley whirrs (louder and higher with
 *   speed), the wind rushes. He cannot let go mid-air.
 * - Braking: in the last `BRAKE` m he slows, the trolley hits the brake
 *   block on its spring (a thud, the spring, the cable's twang; the pad
 *   shakes) and he swings forward; it comes to rest over the next platform.
 * - Landing (`LAND` s): his feet come down on the deck, he stands, unclips
 *   (a click), lets the lanyard go (it swings back under the trolley) and
 *   takes a step: the walk goes on (to the next line's start, or down the
 *   last tree's stair).
 *
 * The camera follows behind him and a little below while he rides (looking
 * up at him and the cable against the sky), from above on the platforms; a
 * drag or Q / R turns it as on foot.
 */

/** Clipping in, and landing (s). */
const CLIP = 1.6;
const LAND = 1.4;
/** Physics: the slope's pull (gravity × this, a game's lively ride), the air (1/m; tucked less), the pulleys (m/s²), the least speed he rolls on at before the brake (m/s), how hard the brake slows (m/s²), how fast he comes to the stop (m/s). */
const GAIN = 4;
const AIR = 0.008;
const TUCK_AIR = 0.55;
const ROLL = 0.12;
const V_MIN = 6;
const BRAKE_DECEL = 6.5;
const V_STOP = 0.5;
/** The fastest he goes (m/s): the whirr's full level. */
const V_TOP = 15;
/** The lanyard and his body as a pendulum: length (m), damping of the swing and the sway (1/s). */
const PEND = 2.4;
const SWING_DAMP = 0.9;
const SWAY_DAMP = 0.7;
/** The lanyard in front of his up: standing clipped in, and sitting in the harness (radians). */
const STRAP_STAND = 0.145;
const STRAP_SIT = 0.3;
/** He pushes off with this (m/s). */
const PUSH = 1.4;
/** The brake block is met this far before the stop (m): the spring takes him the rest. */
const BLOCK_AT = 2.4;
/** The camera: behind him and a little below while riding (radians), how far (m). */
const RIDE_PITCH = -0.05;
const RIDE_DIST = 8;
const RIDE_SIDE = 0.22;
/** A trolley left at a line's end goes back to its start once he is this far from it (m). */
const RETURN = 70;

export type ZipPhase = 'idle' | 'clip' | 'ride' | 'land';

export interface ZipRide {
  readonly phase: ZipPhase;
  /** The line he is on (0‥), and how far along it (0‥1), while clipped in. */
  readonly line: number;
  readonly u: number;
  /** His hat is off for the ride (it goes back on after). */
  readonly hatTaken: boolean;
  /** Clip in on line `i` (he is on its platform, near its start). */
  start(ctx: RoamCtx, i: number): void;
  /** One step while clipped in: the prompt. */
  update(ctx: RoamCtx, dt: number): string | null;
  /** Put him on line `i` at once: `u` along it riding (0‥1), or `'clip'` clipping in, `'end'` touching down at its end. */
  place(ctx: RoamCtx, i: number, at: number | 'clip' | 'end', still: number): void;
  /** Off at once, nothing left behind (back to the map, the mode changed). */
  stop(ctx: RoamCtx): void;
  /** Every step, held or not: trolleys left at a line's end go home once he is far away. */
  tidy(at: Vector3): void;
}

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** His speed at `u` along line `l` (m/s), ridden from its start with no Shift (the URL's `zip=<n>:<u>`). */
export function rideSpeedAt(l: ZipLineDef, u: number): number {
  let s = 0;
  let v = PUSH;
  let time = 0;
  const end = Math.min(1, u) * l.length;
  const dt = 1 / 60;
  while (s < end && time < 120) {
    v = rideStep(l, s, v, 0, dt, time);
    s += v * dt;
    time += dt;
  }
  return v;
}

/** One step of the speed along the line (`tuck` 0‥1, `time` since the push). */
function rideStep(l: ZipLineDef, s: number, v: number, tuck: number, dt: number, time: number): number {
  const u = s / l.length;
  const slope = cableSlope(l, u);
  const a = (-9.8 * GAIN * (1 + 0.1 * tuck) * slope) / Math.sqrt(1 + slope * slope) - AIR * (1 - (1 - TUCK_AIR) * tuck) * v * v - ROLL;
  v += a * dt;
  const left = l.length - s;
  if (left > BRAKE && time > 1.2) v = Math.max(v, V_MIN);
  // (the brake: no faster than it lets him come to the stop)
  const cap = Math.sqrt(V_STOP * V_STOP + 2 * BRAKE_DECEL * Math.max(0, left));
  return Math.max(Math.min(v, cap), Math.min(cap, 1));
}

export function createZipRide(env: AddonEnv, plan: ZipPlan, meshes: () => ZipLineMeshes | null): ZipRide {
  const { explorer, cam } = env;
  let phase: ZipPhase = 'idle';
  let li = 0;
  let line: ZipLineDef = plan.lines[0];
  /** Time in the phase (s), seconds riding, the clock (legs, sway). */
  let tau = 0;
  let rideT = 0;
  let clock = 0;
  /** Along the span (m), speed (m/s). */
  let s = 0;
  let v = 0;
  /** The lanyard's swing (+ his end forward) and sway (+ to his left), and how fast they move. */
  let swing = 0;
  let swingV = 0;
  let roll = 0;
  let rollV = 0;
  let tuck = 0;
  let blocked = false;
  /** Where he was when E was pressed (feet), and his facing. */
  const from = new Vector3();
  let fromYaw = 0;
  /** A shot's still moment: the ride does not move on for this long (its poses and camera ease in). */
  let still = 0;
  /** The camera is the URL's (`rcam=`): left where it was put. */
  let camFixed = false;
  /** Seconds since the player last turned the camera. */
  let lookIdle = 10;
  let hatOff = false;
  const pose = zipPoseState();
  const posture = () => zipPose(pose);
  const ring = new Vector3();
  const pin = new Vector3();
  const _v = new Vector3();
  const _q = new Quaternion();

  const k = () => BODY_UNIT_M * env.body.scale;

  /** Where his feet go so the ring hangs at the lanyard's end (trolley at `u`, lanyard swung): into `out`. */
  function feetUnder(u: number, out: Vector3): Vector3 {
    trolleyPin(line, u, pin);
    hangerQuat(line.yaw, swing, roll, _q);
    ring.set(0, -STRAP, 0).applyQuaternion(_q).add(pin);
    zipRingAt(pose, _v).multiplyScalar(k());
    // (his frame turns with the line's heading)
    const c = Math.cos(line.yaw);
    const sn = Math.sin(line.yaw);
    return out.set(ring.x - (_v.x * c + _v.z * sn), ring.y - _v.y, ring.z - (-_v.x * sn + _v.z * c));
  }

  /** Which way on from the platform he landed on (heading from `at`): to the next line's start, or to the stair down. */
  function wayOn(at: Vector3): number {
    const next = plan.lines[li + 1];
    if (next) return Math.atan2(next.x0 - at.x, next.z0 - at.z);
    const st = line.to.stair;
    return st ? Math.atan2(st.x - at.x, st.z - at.z) : line.yaw;
  }

  function wear(on: boolean): void {
    const rig = explorer.rig;
    if (on) {
      rig.setSlot('zipHarness', 'hips', buildZipHarness());
      rig.setSlot('zipLegL', 'hipL', buildZipLegLoop('L'));
      rig.setSlot('zipLegR', 'hipR', buildZipLegLoop('R'));
    } else for (const n of ['zipHarness', 'zipLegL', 'zipLegR']) rig.clearSlot(n);
  }

  /** His hat off while clipped in (the lanyard runs up past his face: the brim is in its way), back on after. */
  function hat(off: boolean): void {
    if (off) {
      if (!explorer.currentOutfit.hat) return;
      hatOff = true;
      explorer.setOutfit({ hat: false });
    } else {
      if (!hatOff) return;
      hatOff = false;
      if (!explorer.currentOutfit.hat) explorer.setOutfit({ hat: true });
    }
    env.photo.refreshBody();
  }

  function begin(ctx: RoamCtx, i: number): void {
    li = i;
    line = plan.lines[i];
    phase = 'clip';
    tau = rideT = 0;
    s = 0;
    v = 0;
    swing = 0;
    swingV = 0;
    roll = 0;
    rollV = 0;
    tuck = 0;
    blocked = false;
    from.copy(ctx.body.pos);
    fromYaw = ctx.body.yaw;
    Object.assign(pose, zipPoseState());
    explorer.animator.posture = posture;
    explorer.animator.postureFeet = false;
    ctx.body.vel.set(0, 0, 0);
    wear(true);
    hat(true);
    meshes()?.park(i);
    // (on a touch screen the jump button is his speed-up while he is clipped in: hold it to tuck)
    touchJump('zipTouch');
  }

  function finish(ctx: RoamCtx): void {
    phase = 'idle';
    explorer.animator.posture = null;
    explorer.animator.postureFeet = true;
    wear(false);
    hat(false);
    touchJump(null);
    SFX.level('zipWhirr', 0);
    ctx.levels.wind = 0;
    ctx.body.grounded = true;
    ctx.body.vel.set(0, 0, 0);
    // (the walk's own camera again: walker.ts `enter`)
    cam.minDistance = 3.5;
    cam.maxDistance = 30;
    cam.follow = 0.6;
    cam.fov = 50;
    still = 0;
    camFixed = false;
  }

  /** The camera this step: following him (unless the URL placed it), eased toward a pitch and distance. */
  function camera(ctx: RoamCtx, dt: number, pitch: number, dist: number, fov: number): void {
    const { input } = ctx;
    cam.turn(input.lookYaw, input.lookPitch, input.zoom);
    lookIdle = input.lookYaw || input.lookPitch ? 0 : lookIdle + dt;
    // (his chest: the hips joint, a little up)
    const kk = k();
    zipRingAt(pose, _v);
    cam.focus.set(ctx.body.pos.x, ctx.body.pos.y + (_v.y + 6 + 4 * pose.sit) * kk, ctx.body.pos.z);
    // (a little to one side of straight behind: the cable runs past him into the view, not from behind the camera)
    cam.behindYaw = line.yaw + (phase === 'ride' ? RIDE_SIDE : 0);
    cam.fov = fov;
    if (camFixed) return;
    cam.follow = 1;
    cam.minDistance = 3.5;
    cam.maxDistance = 30;
    // (the player's tilt and zoom stay theirs a while after they last turned it)
    if (lookIdle > 1.6) {
      const e = 1 - Math.exp(-dt * 1.4);
      cam.pitch += (pitch - cam.pitch) * e;
      if (!input.zoom) cam.distance += (dist - cam.distance) * e;
    }
  }

  const api: ZipRide = {
    get phase() {
      return phase;
    },
    get line() {
      return li;
    },
    get u() {
      return phase === 'ride' ? Math.min(1, s / line.length) : phase === 'land' ? 1 : 0;
    },
    get hatTaken() {
      return hatOff;
    },
    start(ctx, i) {
      begin(ctx, i);
      ctx.hud.toast(t('zipLineOf', { n: num(i + 1), of: num(ZIP_LINES) }));
      ctx.sound('stepWood', 0.4);
    },
    update(ctx, dt) {
      const { body, input } = ctx;
      const m = meshes();
      clock += dt;
      pose.t = clock;
      const hold = still > 0;
      if (hold) still = Math.max(0, still - dt);
      const step = hold ? 0 : dt;
      tau += step;
      body.explorer.setMotion(0, true, 0);

      if (phase === 'clip') {
        // He steps to the spot under the trolley, turns down the line, takes the lanyard and clips in, sits back.
        const e = smooth(0, 0.55, tau);
        pose.sit = smooth(1.05, CLIP, tau);
        pose.strap = STRAP_STAND + (STRAP_SIT - STRAP_STAND) * pose.sit;
        pose.grip = smooth(0.3, 0.75, tau);
        // (the lanyard: hanging straight down, drawn back to his ring as he takes it; sitting back it swings under him)
        swing = -STRAP_STAND * smooth(0.45, 0.95, tau) * (1 - pose.sit);
        pose.tilt = -swing - pose.strap;
        pose.kick = pose.sit * 0.4;
        feetUnder(0, _v);
        if (pose.sit < 0.02) _v.y = line.from.deck;
        body.pos.lerpVectors(from, _v, e);
        if (pose.sit < 0.02) body.pos.y = from.y + (line.from.deck - from.y) * e;
        body.yaw = fromYaw + angleDiff(line.yaw, fromYaw) * smooth(0, 0.5, tau);
        if (tau >= 0.95 && tau - step < 0.95) {
          SFX.play('zipClip', 0.9);
          pad.rumble('tick', 0.5);
        }
        m?.setTrolley(li, 0, swing, 0);
        camera(ctx, dt, 0.18, 6.5, 50);
        if (tau >= CLIP) {
          phase = 'ride';
          tau = 0;
          rideT = 0;
          v = PUSH;
          ctx.sound('stepWood', 0.3);
        }
        return null;
      }

      if (phase === 'ride') {
        // Shift (a pad's R2), or the jump button held (Space, a pad's ✕, the touch button "Faster"): tucked up, faster.
        tuck += ((input.run || input.jumpHeld ? 1 : 0) - tuck) * (1 - Math.exp(-dt * 4));
        const v0 = v;
        if (step > 0) {
          rideT += step;
          v = rideStep(line, s, v, tuck, step, rideT);
          s = Math.min(line.length, s + v * step);
        }
        const a = step > 0 ? (v - v0) / step : 0;
        // The brake block: met near the end (a thud, the spring), then pushed home with the trolley.
        if (!blocked && s >= line.length - BLOCK_AT) {
          blocked = true;
          SFX.play('zipBrake', Math.min(1, v / 7 + 0.3));
          pad.rumble('land', 0.4 + Math.min(0.6, v / 10));
          swingV += 0.25 + v * 0.05;
        }
        if (blocked) m?.setBrake(li, s + 0.25);
        // The lanyard as a pendulum: speeding up leaves him behind, slowing swings him forward; a soft sway, more in the wind.
        const wind = ctx.weather?.wind ?? 0;
        const g = 9.8 / PEND;
        swingV += (-g * Math.sin(swing) - a / PEND - 0.0018 * v * v - SWING_DAMP * swingV) * step;
        swing = Math.max(-0.8, Math.min(0.8, swing + swingV * step));
        const push = (0.06 + 0.12 * wind) * (Math.sin(clock * 0.83) + 0.6 * Math.sin(clock * 1.91 + 1.3)) * Math.min(1, v / 6 + 0.3);
        rollV += (-g * Math.sin(roll) + push - SWAY_DAMP * rollV) * step;
        roll = Math.max(-0.35, Math.min(0.35, roll + rollV * step));
        const u = s / line.length;
        pose.sit = 1;
        pose.tuck = tuck;
        pose.strap = STRAP_SIT;
        pose.tilt = -swing - pose.strap + 0.02 * Math.sin(clock * 1.3);
        pose.lean = -roll;
        pose.kick = Math.min(1, 0.35 + v / 10);
        pose.grip = 1;
        pose.look = 0.12 * Math.sin(clock * 0.31) * (1 - tuck);
        feetUnder(u, body.pos);
        body.yaw = line.yaw;
        m?.setTrolley(li, u, swing, roll);
        // The trolley's whirr and the wind past his ears.
        SFX.level('zipWhirr', Math.min(1, v / V_TOP));
        ctx.levels.wind = Math.max(ctx.levels.wind, Math.min(1, Math.max(0, (v - 3) / 13)));
        camera(ctx, dt, RIDE_PITCH, RIDE_DIST, 50 + Math.min(8, v * 0.55));
        if (s >= line.length - 0.01 && v <= V_STOP + 0.05) {
          phase = 'land';
          tau = 0;
          SFX.level('zipWhirr', 0);
        }
        // (on touch the jump button says it: no Shift there)
        return v > 3 && !blocked && !document.body.classList.contains('roam-touch') ? `Shift  ${t('zipFaster')}` : null;
      }

      if (phase === 'land') {
        // Feet down onto the deck, standing; the click; he lets the lanyard go and steps on.
        const down = smooth(0, 0.6, tau);
        pose.sit = 1 - down;
        pose.tuck = 0;
        pose.kick = 0.3 * (1 - down);
        pose.strap = STRAP_SIT + (STRAP_STAND - STRAP_SIT) * down;
        // (the forward swing from the brake dies away; standing, the lanyard runs up and on to the trolley)
        swingV += (-(9.8 / PEND) * Math.sin(swing) - SWING_DAMP * 2 * swingV) * step;
        swing += swingV * step;
        const stand = -STRAP_STAND;
        swing += (stand - swing) * down * (1 - Math.exp(-step * 6));
        roll *= Math.exp(-step * 4);
        if (tau >= 0.75) {
          // (unclipped: the lanyard swings back under the trolley)
          const off = smooth(0.75, 1.25, tau);
          pose.grip = 1 - smooth(0.8, 1.15, tau);
          m?.setTrolley(li, 1, stand * (1 - off) + 0.12 * Math.sin((tau - 0.75) * 7) * (1 - off), 0);
        } else {
          pose.grip = 1;
          m?.setTrolley(li, 1, swing, roll);
        }
        pose.tilt = (-swing - pose.strap) * (1 - down);
        pose.lean = -roll * (1 - down);
        if (tau < 0.75) {
          feetUnder(1, body.pos);
          if (down > 0.5) body.pos.y += (line.to.deck - body.pos.y) * smooth(0.5, 1, down);
        }
        if (tau >= 0.45 && tau - step < 0.45) ctx.sound('stepWood', 0.6);
        if (tau >= 0.8 && tau - step < 0.8) {
          SFX.play('zipClip', 0.7);
          pad.rumble('tick', 0.3);
        }
        // (free: a step in toward the trunk, turning to the way on: the next line's start, or the stair down)
        if (tau >= 0.9) {
          const e = smooth(0.9, LAND, tau) - smooth(0.9, LAND, tau - step);
          body.pos.x += line.dx * 0.45 * e;
          body.pos.z += line.dz * 0.45 * e;
          body.pos.y = line.to.deck;
          body.yaw = line.yaw + angleDiff(wayOn(body.pos), line.yaw) * smooth(0.9, LAND, tau);
          if (e > 0 && tau < 1.0) ctx.sound('stepWood', 0.35);
        }
        camera(ctx, dt, 0.22, 7, 50);
        if (tau >= 0.9) cam.behindYaw = body.yaw;
        if (tau >= LAND) {
          body.pos.y = line.to.deck;
          finish(ctx);
          if (li === plan.lines.length - 1) ctx.hud.toast(t('zipDone'));
        }
        return null;
      }
      return null;
    },
    place(ctx, i, at, hold) {
      begin(ctx, i);
      still = hold;
      camFixed = ctx.start.has('rcam');
      if (at === 'clip') {
        tau = 0.9;
        feetUnder(0, from);
        from.y = line.from.deck;
        ctx.body.pos.copy(from);
        ctx.body.yaw = fromYaw = line.yaw;
      } else if (at === 'end') {
        phase = 'land';
        s = line.length;
        tau = 0.35;
        swing = 0.25;
        blocked = true;
        meshes()?.setBrake(i, s + 0.25);
      } else {
        phase = 'ride';
        tau = 0;
        rideT = 3;
        s = Math.min(1, Math.max(0, at)) * line.length;
        v = at <= 0 ? PUSH : rideSpeedAt(line, at);
        // (as it would hang at that speed: trailing a little)
        swing = -Math.min(0.25, 0.0018 * v * v * PEND);
        blocked = s >= line.length - BLOCK_AT;
        if (blocked) meshes()?.setBrake(i, s + 0.25);
      }
      pose.sit = phase === 'ride' ? 1 : pose.sit;
      pose.grip = 1;
      ctx.body.yaw = line.yaw;
      if (!camFixed) {
        cam.yaw = line.yaw;
        cam.pitch = phase === 'ride' ? RIDE_PITCH : 0.2;
        cam.distance = phase === 'ride' ? RIDE_DIST : 6.5;
      }
      // (one step now: he is where the ride puts him, the trolley over him)
      api.update(ctx, 0);
    },
    stop(ctx) {
      if (phase === 'idle') return;
      meshes()?.park(li);
      finish(ctx);
    },
    tidy(at) {
      const m = meshes();
      if (!m) return;
      for (let i = 0; i < plan.lines.length; i++) {
        if (phase !== 'idle' && i === li) continue;
        if (m.trolleyAt(i) <= 0.002) continue;
        const l = plan.lines[i];
        if (Math.hypot(at.x - l.x1, at.z - l.z1) > RETURN && Math.hypot(at.x - l.x0, at.z - l.z0) > RETURN) m.park(i);
      }
    },
  };
  return api;
}
