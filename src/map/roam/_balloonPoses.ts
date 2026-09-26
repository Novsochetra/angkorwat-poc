import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { idle } from '../../character/clips';
import { clamp, type Pose } from '../../character/pose';
import { JOINTS } from '../../character/skeleton';
import { solveArm } from './_boatPoses';

/**
 * The explorer in the hot air balloon's basket (a posture for
 * `Animator.posture`: a whole-body pose over everything else): standing,
 * his right hand up on the burner line's handle, his left resting on the
 * rim. When he pulls the line the burner roars: his fist comes down, he
 * leans into it a little and looks up at the flame. He shifts his weight
 * now and then and looks round at the view.
 *
 * The arms reach by IK for fist targets the ride gives in character space
 * (body units), so the hands stay on the line and the rim. Signs as in
 * character/clips.ts: lean forward / look down +rx, his left is +x.
 */

/** What the ride sets every frame. */
export interface BalloonPoseState {
  /** The burner line pulled (0‥1): the fist down, the head up to the flame. */
  burn: number;
  /** Where each fist goes (character space, BU). */
  readonly fistL: Vector3;
  readonly fistR: Vector3;
  /** Looking round (radians, + = to his left): the view, a turn of the basket. */
  look: number;
  /** A clock (s) for small movements. */
  t: number;
}

/** Which way the elbows point (chest space): the right one out and down under the raised hand, the left one out and back. */
const POLE = { L: new Vector3(0.8, -0.5, -0.35).normalize(), R: new Vector3(-0.85, -0.5, 0.1).normalize() };
const HIPS = new Vector3(...JOINTS.hips.pivot);
const CHEST_REST = new Vector3(...JOINTS.chest.pivot).sub(HIPS);

const _q = new Quaternion();
const _q2 = new Quaternion();
const _e = new Euler();
const _m = new Matrix4();
const _m2 = new Matrix4();
const _t = new Vector3();
const _s = new Vector3(1, 1, 1);

/** The posture for this frame. */
export function balloonPose(s: BalloonPoseState): Pose {
  const burn = clamp(s.burn, 0, 1);
  const pose = idle(s.t);
  // Weight on one foot, then the other, every quarter minute or so.
  const shift = 0.5 + 0.5 * Math.sin((s.t * Math.PI * 2) / 17);
  const hip = pose.hips ?? {};
  pose.hips = { ...hip, rz: (hip.rz ?? 0) + 0.03 * (shift - 0.5), px: 0.25 * (shift - 0.5) };
  // Leaning into the pull, turned a little to the line (it hangs at his right); looking up at the flame while it roars.
  const chest = pose.chest ?? {};
  pose.chest = { ...chest, rx: (chest.rx ?? 0) + 0.04 + 0.06 * burn, ry: (chest.ry ?? 0) - 0.08 + 0.35 * s.look };
  const head = pose.head ?? {};
  pose.head = { ...head, rx: (head.rx ?? 0) - 0.45 * burn, ry: (head.ry ?? 0) * (1 - burn) + 0.5 * s.look * (1 - burn) };
  pose.neck = { rx: -0.2 * burn, ry: 0.2 * s.look * (1 - burn) };
  pose.kneeL = { rx: 0.05 + 0.04 * (1 - shift) };
  pose.kneeR = { rx: 0.05 + 0.04 * shift };

  // The fists: targets into chest space through this pose's hips and chest.
  const hp = pose.hips;
  _q.setFromEuler(_e.set(hp.rx ?? 0, hp.ry ?? 0, hp.rz ?? 0));
  _m.compose(_t.set(HIPS.x + (hp.px ?? 0), HIPS.y + (hp.py ?? 0), HIPS.z + (hp.pz ?? 0)), _q, _s);
  const c = pose.chest;
  _m2.compose(CHEST_REST, _q2.setFromEuler(_e.set(c.rx ?? 0, c.ry ?? 0, c.rz ?? 0)), _s);
  _m.multiply(_m2).invert();
  Object.assign(pose, solveArm('L', _t.copy(s.fistL).applyMatrix4(_m), POLE.L));
  Object.assign(pose, solveArm('R', _t.copy(s.fistR).applyMatrix4(_m), POLE.R));
  return pose;
}
