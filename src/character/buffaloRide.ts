import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { solveArm } from './Animator';
import type { JointPose, Pose } from './pose';
import { JOINTS } from './skeleton';

/**
 * Riding a water buffalo, as Khmer village children do (the map's
 * roam/_buffaloRide.ts): sitting astride its broad back just behind the hump,
 * the thighs spread wide over it and the shins hanging down its flanks, both
 * fists together in front of him on the nose rope. His hips go with the back
 * under him (its pitch and roll: the walk's rocking, a bank going up or down,
 * the buffalo getting up); his chest takes some of it back and his head stays
 * level, a little behind it (`sway`), so he sways with the walk.
 *
 * Getting on and off is one number (`on`): 0 standing beside it (his rest pose:
 * the posture can come and go there unseen) ‥ 1 astride. On the way up the
 * knees tuck (a hop), the far leg swings over its back, the hands go to its
 * back and then to the rope.
 *
 * A posture for `Animator.posture` with `postureFeet = false`: the origin is
 * the top of its back under his seat (the ride puts `body.pos` there, or on
 * the ground beside it when `on` is 0). Units: body units (BU) in his space
 * (+z forward, +x his left).
 */

export interface BuffaloSeatState {
  /** 0 standing beside it ‥ 1 sitting astride (getting on and off). */
  on: number;
  /** The side he gets on from or off to (+1 his left, −1 his right): the other leg swings over. */
  side: number;
  /** The back under him (radians): pitch + its front down, roll + his left side up. */
  pitch: number;
  roll: number;
  /** His upper body's lag behind the back's rocking (radians, the same sense): `sway` springs it. */
  lagPitch: number;
  lagRoll: number;
  /** His own lean (+ forward): into a climb, as it gets up. */
  lean: number;
  /** He looks round (radians, + his left): into its turns, about him when it stands. */
  look: number;
  /** Half its barrel's width under him (BU): how wide his thighs spread. */
  half: number;
  /** Where his fists are on the rope (BU, his space from the seat), and how much they are there (0 hands on its back ‥ 1). */
  readonly grip: Vector3;
  rope: number;
  /** Seconds (breathing). */
  t: number;
}

export function buffaloSeatState(): BuffaloSeatState {
  return { on: 0, side: 1, pitch: 0, roll: 0, lagPitch: 0, lagRoll: 0, lean: 0, look: 0, half: 5, grip: new Vector3(0, 6, 4.6), rope: 1, t: 0 };
}

/** The hips joint over its back (BU): he sits on the seat of his shorts, his thighs over the top of the barrel. */
const HIP_UP = 2.15;
const HIP_BACK = -0.2;
const REST_HIPS = new Vector3(...JOINTS.hips.pivot);
const CHEST_REST = new Vector3(...JOINTS.chest.pivot).sub(REST_HIPS);
/** The hip joints' spread (BU), the thigh (hip to knee) and how far out of the barrel's side the knee rests (BU). */
const LEG_X = JOINTS.hipL.pivot[0];
const THIGH = JOINTS.hipL.pivot[1] - JOINTS.kneeL.pivot[1];
const KNEE_OUT = 1.0;
/** Hands on its back while climbing on (BU, his space from the seat: low, apart, ahead of him). */
const BACK_HANDS = new Vector3(3.2, 1.2, 4.2);
/** Elbows out and a little back (chest space). */
const POLE = { L: new Vector3(0.75, -0.6, -0.3).normalize(), R: new Vector3(-0.75, -0.6, -0.3).normalize() };

const smooth = (u: number) => {
  const c = Math.min(1, Math.max(0, u));
  return c * c * (3 - 2 * c);
};

/**
 * One step of his upper body's lag behind the back's rocking: a soft spring (it
 * follows a moment late and settles, so the rocking passes up through him).
 */
export function sway(s: BuffaloSeatState, dt: number, vel: { pitch: number; roll: number }): void {
  const k = 38;
  const d = 2 * Math.sqrt(k) * 0.55;
  vel.pitch += (k * (s.pitch - s.lagPitch) - d * vel.pitch) * dt;
  vel.roll += (k * (s.roll - s.lagRoll) - d * vel.roll) * dt;
  s.lagPitch += vel.pitch * dt;
  s.lagRoll += vel.roll * dt;
}

const _q = new Quaternion();
const _q2 = new Quaternion();
const _e = new Euler();
const _m = new Matrix4();
const _m2 = new Matrix4();
const _v = new Vector3();
const _t = new Vector3();
const _one = new Vector3(1, 1, 1);
const _hand = new Vector3();

/** The pose (a new object each call, as the Animator keeps it: the other postures' way). */
export function buffaloSeatPose(s: BuffaloSeatState): Pose {
  const on = smooth(s.on);
  // Half way up (or down): the hop. The knees tuck, the far leg swings over its back, he leans onto it.
  const hop = Math.sin(Math.PI * Math.min(1, Math.max(0, s.on))) * (1 - on * 0.4);
  const far = -s.side;
  const breathe = 0.018 * Math.sin(s.t * 1.6);

  // Hips: from standing (his rest, over his feet) to over the seat, turned with the back under him.
  const pitch = s.pitch * on;
  const roll = s.roll * on;
  _q.setFromEuler(_e.set(pitch, 0, roll));
  _v.set(0, HIP_UP, HIP_BACK).applyQuaternion(_q).sub(REST_HIPS).multiplyScalar(on);
  const hips: JointPose = { px: _v.x, py: _v.y, pz: _v.z, rx: pitch - 0.04 * on, rz: roll };

  // The chest takes back most of the rocking, late (the lag): he stays upright, swaying; he leans into a climb.
  const lagP = (s.lagPitch - s.pitch) * on;
  const lagR = (s.lagRoll - s.roll) * on;
  const chest: JointPose = {
    rx: on * (0.1 - 0.7 * s.pitch + s.lean) + 0.35 * hop + lagP * 0.8 + breathe,
    ry: 0.12 * s.look * on,
    rz: on * -0.75 * s.roll + lagR * 0.8,
  };
  // The head: level, looking where he looks.
  const neck: JointPose = { rx: -0.25 * (chest.rx ?? 0) + 0.04 * on, ry: 0.3 * s.look * on };
  const head: JointPose = { rx: -0.3 * (chest.rx ?? 0) - 0.3 * s.pitch * on - 0.05 * on, ry: 0.5 * s.look * on, rz: -0.4 * (chest.rz ?? 0) - 0.3 * roll };

  // Legs: the thighs spread flat over its broad back (his legs are short: a small boy on a big buffalo), the shins
  // down over its flanks from the knees, the toes down. (Narrower, the thighs come down a little and the shins hang.)
  const thigh = Math.min(1.5, Math.asin(Math.min(1, Math.max(0.2, (s.half + KNEE_OUT - LEG_X) / THIGH))));
  const shin = Math.min(0.95, Math.max(0.15, 0.25 + (s.half - LEG_X) * 0.13));
  const leg = (side: 1 | -1): [JointPose, JointPose, JointPose] => {
    const over = side === far ? hop : 0.35 * hop;
    return [
      // (a little forward, more on the way up: the knee comes up as the leg goes over)
      { rx: on * -0.22 - 1.1 * over, rz: side * (on * thigh + 0.5 * over) },
      { rx: on * 0.25 + 1.3 * over, rz: -side * on * (thigh - shin) },
      { rx: on * 0.45 + 0.2 * over },
    ];
  };
  const [hipL, kneeL, ankleL] = leg(1);
  const [hipR, kneeR, ankleR] = leg(-1);

  const pose: Pose = { hips, chest, neck, head, hipL, kneeL, ankleL, hipR, kneeR, ankleR };

  // Arms by IK into chest space: hands on its back while climbing on, then together on the rope in front of him.
  if (on > 0.02) {
    _m.compose(_t.set(REST_HIPS.x + (hips.px ?? 0), REST_HIPS.y + (hips.py ?? 0), REST_HIPS.z + (hips.pz ?? 0)), _q.setFromEuler(_e.set(hips.rx ?? 0, 0, hips.rz ?? 0)), _one);
    _m2.compose(CHEST_REST, _q2.setFromEuler(_e.set(chest.rx ?? 0, chest.ry ?? 0, chest.rz ?? 0)), _one);
    _m.multiply(_m2).invert();
    const rope = smooth((s.on - 0.55) / 0.45) * s.rope;
    for (const side of [1, -1] as const) {
      // (the seat's space: his hips' origin is the seat, at `body.pos`)
      _hand.set(BACK_HANDS.x * side, BACK_HANDS.y, BACK_HANDS.z).lerp(_t.set(s.grip.x + side * 0.9, s.grip.y, s.grip.z), rope);
      const arm = solveArm(side === 1 ? 'L' : 'R', _hand.applyMatrix4(_m), side === 1 ? POLE.L : POLE.R);
      // (blended in from his hanging arms: at `on` 0 the posture is his rest)
      const w = smooth(s.on / 0.35);
      for (const k in arm) {
        const j = arm[k as keyof Pose]!;
        if (j.rx) j.rx *= w;
        if (j.ry) j.ry *= w;
        if (j.rz) j.rz *= w;
      }
      Object.assign(pose, arm);
    }
  }
  return pose;
}
