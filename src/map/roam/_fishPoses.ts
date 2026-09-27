import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { JointPose, Pose } from '../../character/pose';
import { JOINTS, type JointName } from '../../character/skeleton';
import { BODY_UNIT_M } from '../../world/scale';
import { solveArm } from './_boatPoses';

/**
 * The explorer fishing from the boat: what `RideState.fish` adds over the
 * paddler's posture (_boatPoses.ts `ridePose`), eased in by `w`. The paddle
 * lies across his lap (the ride's `rest`); his right fist holds the bamboo
 * pole (one hand: his arms are short, and a light pole is held so), his left
 * rests on the paddle or holds the fish he caught; his chest leans back a
 * little, turns and tilts as the moment wants, his head turns to the float.
 *
 * The fists' targets are in boat space (m, true size: _boatModel.ts), where
 * _fishing.ts moves the pole, so the pole and the hands never part while the
 * hull rocks: they go through the boat's pitch and roll, the hips and the
 * chest as this very pose sets them, into chest space, and arm IK
 * (`solveArm`) puts the fists there.
 */

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

const REST_HIPS = new Vector3(...JOINTS.hips.pivot);
/** The chest joint's rest place over the hips (BU). */
const CHEST_LOCAL = new Vector3(...JOINTS.chest.pivot).sub(REST_HIPS);
const ARM: Record<'L' | 'R', readonly JointName[]> = { L: ['shoulderL', 'elbowL', 'wristL'], R: ['shoulderR', 'elbowR', 'wristR'] };

const _hips = new Matrix4();
const _chest = new Matrix4();
const _inv = new Matrix4();
const _e = new Euler();
const _eb = new Euler();
const _v = new Vector3();
const _t = new Vector3();
const _one = new Vector3(1, 1, 1);
const _q = new Quaternion();

/** What fishing asks of his body this frame (_fishing.ts writes it; the ride's posture reads it). */
export class FishHold {
  /** Fishing's share of the pose (0 paddling … 1 fishing), eased in and out. */
  w = 0;
  /** The right fist on the pole (boat space, m), and how much it holds it (0: on the paddle on his lap). */
  readonly right = new Vector3();
  rightW = 0;
  /** The left fist (boat space, m): holding the fish, or reaching; 0: it rests on the paddle on his lap. */
  readonly left = new Vector3();
  leftW = 0;
  /** Where each elbow points (chest space, unit). */
  readonly poleR = new Vector3(-0.7, -1, -0.3).normalize();
  readonly poleL = new Vector3(0.7, -1, -0.3).normalize();
  /** The chest: lean (+ forward), twist (+ to his left), tilt (+ his left side up), radians. */
  lean = -0.06;
  twist = 0;
  tilt = 0;
  /** Where he looks (radians from the boat's heading, + to his left; pitch + down). */
  lookYaw = 0;
  lookPitch = 0.05;

  /** Over the ride's pose (`pose`, the paddler's), for a boat pitched and rolled so. */
  apply(pose: Pose, pitch: number, roll: number): void {
    const w = clamp(this.w, 0, 1);
    if (w <= 0) return;
    const ch = (pose.chest ??= {});
    ch.rx = lerp(ch.rx ?? 0, this.lean, w);
    ch.ry = lerp(ch.ry ?? 0, this.twist, w);
    ch.rz = lerp(ch.rz ?? 0, this.tilt, w);
    // The head follows the float (the neck takes a little of the turn), within what a neck turns.
    const rel = clamp(this.lookYaw - this.twist, -1.3, 1.3);
    const neck = (pose.neck ??= {});
    const head = (pose.head ??= {});
    neck.ry = lerp(neck.ry ?? 0, 0.35 * rel, w);
    head.ry = lerp(head.ry ?? 0, 0.6 * rel, w);
    neck.rx = lerp(neck.rx ?? 0, 0.3 * this.lookPitch, w);
    head.rx = lerp(head.rx ?? 0, 0.7 * this.lookPitch, w);
    const kr = w * clamp(this.rightW, 0, 1);
    const kl = w * clamp(this.leftW, 0, 1);
    if (kr <= 0 && kl <= 0) return;
    // His chest in his own space (BU), as this pose places it: the hips (on the seat), then the chest over them.
    const hp = pose.hips ?? {};
    _v.set(REST_HIPS.x + (hp.px ?? 0), REST_HIPS.y + (hp.py ?? 0), REST_HIPS.z + (hp.pz ?? 0));
    _hips.compose(_v, _q.setFromEuler(_e.set(hp.rx ?? 0, hp.ry ?? 0, hp.rz ?? 0)), _one);
    _chest.compose(CHEST_LOCAL, _q.setFromEuler(_e.set(ch.rx ?? 0, ch.ry ?? 0, ch.rz ?? 0)), _one);
    _inv.multiplyMatrices(_hips, _chest).invert();
    _eb.set(pitch, 0, roll, 'XYZ');
    if (kr > 0) blendArm(pose, 'R', solveArm('R', toChest(this.right), this.poleR), kr);
    if (kl > 0) blendArm(pose, 'L', solveArm('L', toChest(this.left), this.poleL), kl);
  }
}

/** A boat-space point (m) in chest space (BU), through the boat's tilt and this pose's hips and chest. */
function toChest(p: Vector3): Vector3 {
  return _t.copy(p).applyEuler(_eb).divideScalar(BODY_UNIT_M).applyMatrix4(_inv);
}

/** Blend an arm of `pose` towards `to` by k. */
function blendArm(pose: Pose, side: 'L' | 'R', to: Pose, k: number): void {
  for (const j of ARM[side]) {
    const a: JointPose = (pose[j] ??= {});
    const b = to[j] ?? {};
    a.rx = lerp(a.rx ?? 0, b.rx ?? 0, k);
    a.ry = lerp(a.ry ?? 0, b.ry ?? 0, k);
    a.rz = lerp(a.rz ?? 0, b.rz ?? 0, k);
  }
}
