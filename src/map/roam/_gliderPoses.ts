import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { gait } from '../../character/clips';
import { clamp, lerp, mixPose, type Pose } from '../../character/pose';
import { JOINTS } from '../../character/skeleton';
import { BODY_UNIT_M } from '../../world/scale';
import { solveArm } from './_boatPoses';

/**
 * Poses of the hang glider ride, for the explorer's `posture` hook
 * (Animator: a whole-body pose over everything else).
 *
 * - Upright (`prone` 0): the glider on his shoulders, fists on its down
 *   tubes; standing, or running down the ramp (the walk cycle's legs).
 * - Prone (`prone` 1): lying face down in the harness, legs straight back,
 *   head up to look ahead, fists on the control bar. He hangs from the
 *   strap at the middle of his back (`HANG`) and turns round it: face down,
 *   and rolled with the wing in a turn.
 * - The flare (`flare`): upright again for the landing, legs forward.
 *
 * The arms reach by IK for fist targets the ride gives in character space
 * (the bar or the tubes, wherever the wing is), so the hands stay on the
 * frame. Signs as in character/clips.ts: lean forward / look down +rx,
 * hip forward −rx, knee bend +rx; his left is +x.
 */

/** Where the hang strap holds him (BU, character space): the middle of his back. */
export const HANG: readonly [number, number, number] = [0, 13.4, -3.3];
/** Face down in the harness: the body tilts forward this much (rad). */
const PRONE = 1.4;
/** Which way the elbows point (chest space): down when upright, out and back toward his feet when prone. */
const POLE_UP = { L: new Vector3(0.55, -1, -0.25).normalize(), R: new Vector3(-0.55, -1, -0.25).normalize() };
const POLE_PRONE = { L: new Vector3(0.85, -0.45, 0.3).normalize(), R: new Vector3(-0.85, -0.45, 0.3).normalize() };

/** What the ride sets every frame. */
export interface GliderPoseState {
  /** 0 = upright (carrying it, running, landing) ‥ 1 = lying face down in the harness. */
  prone: number;
  /** Running with it (the walk cycle's legs, 0‥1), and the cycle's phase (the animator's). */
  run: number;
  phase: number;
  /** Extra tilt of the whole body round `HANG` (rad): + = face down; and roll, + = his left side down. */
  pitch: number;
  roll: number;
  /** The landing flare: legs forward and down (0‥1). */
  flare: number;
  /** Where each fist goes (character space, BU). */
  readonly fistL: Vector3;
  readonly fistR: Vector3;
  /** A clock (s) for small movements. */
  t: number;
}

const _q = new Quaternion();
const _q2 = new Quaternion();
const _e = new Euler();
const _d = new Vector3();
const _r = new Vector3();
const _m = new Matrix4();
const _m2 = new Matrix4();
const _t = new Vector3();
const _pole = new Vector3();
const X = new Vector3(1, 0, 0);
const Z = new Vector3(0, 0, 1);
const HIPS = new Vector3(...JOINTS.hips.pivot);
const CHEST_REST = new Vector3(...JOINTS.chest.pivot).sub(HIPS);
const HANG_V = new Vector3(...HANG);

/** Standing with the glider on his shoulders: leaning into it a little. */
function upright(s: GliderPoseState): Pose {
  const base: Pose = {
    chest: { rx: 0.1 + 0.12 * s.run },
    neck: { rx: -0.05 },
    head: { rx: -0.12 - 0.1 * s.run },
    hipL: { rx: -0.05, rz: 0.03 },
    hipR: { rx: -0.05, rz: -0.03 },
    kneeL: { rx: 0.1 },
    kneeR: { rx: 0.1 },
  };
  if (s.run <= 0.01) return base;
  // Running: the walk cycle's legs and body (the arms stay on the frame).
  const g = gait(s.phase, clamp(s.run * 1.4 - 0.4, 0, 1), 1, lerp(1.05, 1.85, s.run) / BODY_UNIT_M).pose;
  const legs: Pose = { hips: g.hips, hipL: g.hipL, hipR: g.hipR, kneeL: g.kneeL, kneeR: g.kneeR, ankleL: g.ankleL, ankleR: g.ankleR, chest: { ...g.chest, rx: (g.chest?.rx ?? 0) + base.chest!.rx! } };
  return mixPose(base, { ...base, ...legs }, s.run);
}

/** Lying in the harness: a little arched, head up to look ahead, legs straight back, toes pointed. */
function prone(s: GliderPoseState): Pose {
  const sway = 0.03 * Math.sin(s.t * 1.7);
  return {
    chest: { rx: -0.2 },
    neck: { rx: -0.38 },
    head: { rx: -0.72 },
    hipL: { rx: 0.1 + sway, rz: 0.04 },
    hipR: { rx: 0.1 - sway, rz: -0.04 },
    kneeL: { rx: 0.18 + sway },
    kneeR: { rx: 0.18 - sway },
    ankleL: { rx: 0.55 },
    ankleR: { rx: 0.55 },
  };
}

/** The flare: upright, legs forward, ready to run it out. */
const FLARE: Pose = {
  chest: { rx: 0.05 },
  head: { rx: -0.15 },
  hipL: { rx: -0.45, rz: 0.05 },
  hipR: { rx: -0.3, rz: -0.05 },
  kneeL: { rx: 0.45 },
  kneeR: { rx: 0.35 },
  ankleL: { rx: -0.1 },
  ankleR: { rx: -0.1 },
};

/** The posture for this frame. */
export function gliderPose(s: GliderPoseState): Pose {
  const p = clamp(s.prone, 0, 1);
  let pose = mixPose(upright(s), prone(s), p);
  if (s.flare > 0) pose = mixPose(pose, FLARE, clamp(s.flare, 0, 1) * (1 - p));

  // Turn the whole body round the strap: face down, then rolled round his (new) length.
  const pitch = PRONE * p + s.pitch;
  _q.setFromAxisAngle(Z, -s.roll).multiply(_q2.setFromAxisAngle(X, pitch));
  const h = pose.hips ?? {};
  _q.multiply(_q2.setFromEuler(_e.set(h.rx ?? 0, h.ry ?? 0, h.rz ?? 0)));
  _e.setFromQuaternion(_q, 'XYZ');
  // (the strap's point stays where it is)
  _d.copy(HANG_V).sub(HIPS);
  _r.copy(_d).applyQuaternion(_q);
  pose.hips = { rx: _e.x, ry: _e.y, rz: _e.z, px: (h.px ?? 0) + _d.x - _r.x, py: (h.py ?? 0) + _d.y - _r.y, pz: (h.pz ?? 0) + _d.z - _r.z };

  // The fists onto the frame: targets into chest space through this pose's hips and chest.
  const hp = pose.hips;
  _m.compose(_t.set(HIPS.x + (hp.px ?? 0), HIPS.y + (hp.py ?? 0), HIPS.z + (hp.pz ?? 0)), _q, _r.set(1, 1, 1));
  const c = pose.chest ?? {};
  _m2.compose(CHEST_REST, _q2.setFromEuler(_e.set(c.rx ?? 0, c.ry ?? 0, c.rz ?? 0)), _r.set(1, 1, 1));
  _m.multiply(_m2).invert();
  for (const side of ['L', 'R'] as const) {
    _pole.copy(POLE_UP[side]).lerp(POLE_PRONE[side], p).normalize();
    Object.assign(pose, solveArm(side, _t.copy(side === 'L' ? s.fistL : s.fistR).applyMatrix4(_m), _pole));
  }
  return pose;
}

/** `HANG` in the explorer object's space (m) at his size `scale` (before his heading). */
export function hangPoint(scale: number, out: Vector3): Vector3 {
  return out.copy(HANG_V).multiplyScalar(BODY_UNIT_M * scale);
}
