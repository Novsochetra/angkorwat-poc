import { Euler, Matrix4, Vector3 } from 'three';
import { BODY_UNIT_M, RUN_SPEED, WALK_SPEED } from '../world/scale';
import { solveArm } from './Animator';
import { gait, idle } from './clips';
import type { JointPose, Pose } from './pose';
import { JOINTS, type JointName } from './skeleton';

/**
 * Flying his own kite (the map's roaming, roam/_kiteFly.ts): a posture for
 * `Animator.posture` (with `postureFeet = true`: the soles stay on the ground)
 * that walks and runs with the usual gait under the arms that work the line.
 *
 * The shapes (their weights eased by the caller, summing to 1):
 * - **fly**: the line runs from his right fist, held up and out towards the
 *   kite (the arm follows where the line goes, within what a shoulder does);
 *   the left fist holds the bamboo spool at his belly. Paying out line (W) the
 *   right hand gives and takes in little pulls; reeling in (S) the left fist
 *   winds round the spool; steering (A / D) the line hand pulls to that side
 *   and the chest turns with it. The head looks up along the line.
 * - **hold**: the launch — the kite held up by its spine at arm's length out
 *   past his right shoulder (clear of his big head) while he runs into the
 *   wind, looking back at it.
 * - **take**: both hands held out in front, taking it (from the grandfather's
 *   son, from the seller).
 * - **look**: holding it up in front of him by its spine, looking at it.
 * - **fold**: winding in the last of the line, the kite against his chest.
 * - what the weights leave of 1: the arms at rest, hanging.
 *
 * Arms by IK (Animator `solveArm`, chest space). Units: body units (BU) in the
 * explorer's space (+z ahead, +x his left, +y up).
 */

export interface KiteFlyState {
  /** Seconds (the hands' little movements, the breathing). */
  t: number;
  /** The walk cycle's phase (Animator `phase`) and his speed (true m/s: the walk or the run under the arms). */
  phase: number;
  speed: number;
  /** Where the line goes from his right fist: a unit direction in his own space (x his left, y up, z ahead). */
  readonly aim: Vector3;
  /** The line hand's work: + paying out line (W) … − reeling in (S), −1‥1. */
  work: number;
  /** Steering: + to his left … − to his right (−1‥1). */
  steer: number;
  /** The shapes (0‥1 each, summing to 1 at most: the rest, the arms hang): see the top. */
  fly: number;
  hold: number;
  take: number;
  look: number;
  fold: number;
}

export function kiteFlyState(): KiteFlyState {
  return { t: 0, phase: 0, speed: 0, aim: new Vector3(0, 0.6, 0.8).normalize(), work: 0, steer: 0, fly: 0, hold: 0, take: 0, look: 0, fold: 0 };
}

/** The walk and run cycles' length (m): as the Animator's. */
const WALK_CYCLE_M = 1.05;
const RUN_CYCLE_M = 1.85;

const SHOULDER = {
  L: new Vector3(...JOINTS.shoulderL.pivot).sub(new Vector3(...JOINTS.chest.pivot)),
  R: new Vector3(...JOINTS.shoulderR.pivot).sub(new Vector3(...JOINTS.chest.pivot)),
};
/** How far out the line fist goes from the shoulder (BU: the arm is ≈ 7.5 long; a little bent). */
const REACH = 6.3;
/** The line arm's reach: up to this high (sine of its elevation) and this far round from straight ahead (radians). */
const ARM_UP = 0.78;
const ARM_ROUND = 1.15;
/** Fists (chest space, BU): the spool at the belly; the kite held up over the right shoulder; taking it; holding it up; at the chest. */
const SPOOL = new Vector3(1.7, 0.9, 5.3);
const HOLD_R = new Vector3(-9.0, 10.5, -0.6);
const HOLD_L = new Vector3(1.9, 1.6, 5.0);
const TAKE_R = new Vector3(-2.0, 3.6, 7.0);
const TAKE_L = new Vector3(2.0, 3.6, 7.0);
const LOOK_R = new Vector3(-1.0, 6.4, 6.6);
const LOOK_L = new Vector3(2.3, 3.0, 6.2);
const FOLD_R = new Vector3(-1.6, 3.2, 5.0);
const FOLD_L = new Vector3(2.0, 1.2, 5.4);
const REST_R = new Vector3(-5.9, -1.3, 0.6);
const REST_L = new Vector3(5.9, -1.3, 0.6);
/** Elbows: down and out; up and out for the arm held high. */
const POLE_DOWN = { L: new Vector3(0.8, -0.6, -0.2).normalize(), R: new Vector3(-0.8, -0.6, -0.2).normalize() };
const POLE_UP_R = new Vector3(-0.9, 0.1, 0.45).normalize();

const _r = new Vector3();
const _l = new Vector3();
const _a = new Vector3();
const _pr = new Vector3();
const _pl = new Vector3();
const _m = new Matrix4();
const _m2 = new Matrix4();
const _e = new Euler();
const OUT: Pose = {};
/** The joints the posture sets (not `body`: the Animator's own gait bobs it). */
const JOINTS_SET: readonly JointName[] = ['hips', 'chest', 'neck', 'head', 'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR', 'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR'];
for (const j of JOINTS_SET) OUT[j] = {};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const CHANNELS = ['rx', 'ry', 'rz', 'px', 'py', 'pz'] as const;
const ARM: Record<'L' | 'R', readonly JointName[]> = { L: ['shoulderL', 'elbowL', 'wristL'], R: ['shoulderR', 'elbowR', 'wristR'] };

/** `out += w × p`, joint by joint (the channels set). */
function addInto(p: Pose, w: number): void {
  if (w === 0) return;
  for (const name in p) {
    const s = p[name as JointName]!;
    const o = OUT[name as JointName];
    if (!o) continue;
    for (const c of CHANNELS) if (s[c]) o[c] = (o[c] ?? 0) + s[c]! * w;
  }
}

/** Copy an arm's IK result into `OUT`. */
function setArm(p: Pose, side: 'L' | 'R'): void {
  for (const j of ARM[side]) {
    const s: JointPose = p[j] ?? {};
    const o = OUT[j]!;
    o.rx = s.rx ?? 0;
    o.ry = s.ry ?? 0;
    o.rz = s.rz ?? 0;
    o.px = s.px ?? 0;
    o.py = s.py ?? 0;
    o.pz = s.pz ?? 0;
  }
}

/** His pose for the kite (see the top). The pose returned is reused: read it at once (as the Animator does). */
export function kiteFlyPose(s: KiteFlyState): Pose {
  for (const j of JOINTS_SET) {
    const o = OUT[j]!;
    o.rx = o.ry = o.rz = o.px = o.py = o.pz = 0;
  }
  // ── Legs and body: standing, walking or running, as the Animator would ──
  const walkW = clamp(s.speed / (WALK_SPEED * 0.9), 0, 1);
  const runW = clamp((s.speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED), 0, 1);
  const cycle = lerp(WALK_CYCLE_M, RUN_CYCLE_M, runW) * Math.max(0.3, walkW);
  addInto(idle(s.t), 1 - walkW);
  addInto(gait(s.phase, runW, walkW, cycle / BODY_UNIT_M).pose, 1);

  // ── Where the line goes (his space), and the look along it ──
  const aim = s.aim;
  const aimYaw = Math.atan2(aim.x, Math.max(-0.2, aim.z));
  const aimUp = Math.asin(clamp(aim.y, -1, 1));
  const fly = s.fly;
  const chest = OUT.chest!;
  const neck = OUT.neck!;
  const head = OUT.head!;
  // Flying: leaning back a little against the line, the chest turned towards it and the steer; looking up along it.
  const turn = clamp(0.3 * aimYaw + 0.22 * s.steer, -0.5, 0.5);
  chest.rx = (chest.rx ?? 0) - 0.06 * fly - 0.05 * s.hold;
  chest.ry = (chest.ry ?? 0) + turn * fly;
  const lookUp = clamp(aimUp, -0.2, 1.2);
  neck.rx = (neck.rx ?? 0) - 0.22 * lookUp * fly;
  neck.ry = (neck.ry ?? 0) + 0.2 * clamp(aimYaw - turn, -1, 1) * fly;
  head.rx = (head.rx ?? 0) - 0.42 * lookUp * fly;
  head.ry = (head.ry ?? 0) + 0.35 * clamp(aimYaw - turn, -1, 1) * fly;
  // Holding it up for the launch: looking back over the right shoulder at it now and then; taking it: at the hands;
  // looking at it held up; folding: down at the hands.
  head.ry = (head.ry ?? 0) - 0.55 * s.hold;
  neck.ry = (neck.ry ?? 0) - 0.2 * s.hold;
  head.rx = (head.rx ?? 0) + 0.18 * s.take - 0.28 * s.look + 0.3 * s.fold;
  neck.rx = (neck.rx ?? 0) + 0.06 * s.take - 0.1 * s.look + 0.12 * s.fold;

  // ── The arms, by IK in chest space ──
  // (his space → chest space: undo the hips' and the chest's turns)
  const hp = OUT.hips!;
  _m.makeRotationFromEuler(_e.set(hp.rx ?? 0, hp.ry ?? 0, hp.rz ?? 0));
  _m2.makeRotationFromEuler(_e.set(chest.rx ?? 0, chest.ry ?? 0, chest.rz ?? 0));
  _m.multiply(_m2).transpose();
  _a.copy(aim).applyMatrix4(_m);
  // (within what a shoulder does: not overhead, not behind him)
  let ay = clamp(_a.y, -0.25, ARM_UP);
  let round = Math.atan2(_a.x, _a.z);
  if (_a.z < -0.2) round = Math.sign(_a.x || -1) * ARM_ROUND;
  round = clamp(round, -ARM_ROUND, ARM_ROUND * 0.7);
  const flat = Math.sqrt(1 - ay * ay);
  _a.set(Math.sin(round) * flat, ay, Math.cos(round) * flat);
  // The line fist: out along the line; paying out, little gives and takes; steering, pulled to the side.
  const give = Math.max(0, s.work);
  const wind = Math.max(0, -s.work);
  const reach = REACH + 0.7 * give * Math.sin(s.t * 7.5) - 0.5 * wind;
  _r.copy(SHOULDER.R).addScaledVector(_a, reach);
  _r.x += 1.4 * s.steer;
  _r.y -= 0.6 * Math.abs(s.steer);
  // The spool fist: still at the belly; reeling in, it winds round.
  _l.copy(SPOOL);
  _l.y += 0.9 * wind * Math.sin(s.t * 10);
  _l.z += 0.9 * wind * Math.cos(s.t * 10);
  // Blend the shapes' fists and elbows (what they leave of 1: the arms hang at rest).
  const sum = fly + s.hold + s.take + s.look + s.fold;
  const w = Math.max(1, sum);
  const k = (v: number) => v / w;
  const rest = Math.max(0, 1 - sum);
  _r.multiplyScalar(k(fly)).addScaledVector(HOLD_R, k(s.hold)).addScaledVector(TAKE_R, k(s.take)).addScaledVector(LOOK_R, k(s.look));
  _r.addScaledVector(FOLD_R, k(s.fold)).addScaledVector(REST_R, rest);
  _l.multiplyScalar(k(fly)).addScaledVector(HOLD_L, k(s.hold)).addScaledVector(TAKE_L, k(s.take)).addScaledVector(LOOK_L, k(s.look));
  _l.addScaledVector(REST_L, rest);
  // (folding: the left fist winds the last of the line round the spool)
  _l.addScaledVector(FOLD_L, k(s.fold));
  _l.y += 0.8 * k(s.fold) * Math.sin(s.t * 9);
  _l.z += 0.8 * k(s.fold) * Math.cos(s.t * 9);
  // (a little breathing in the held hands)
  const breathe = 0.12 * Math.sin(s.t * 1.8);
  _r.y += breathe;
  _l.y += breathe * 0.6;
  // (the line arm held up: the elbow out and up; else down and out)
  const up = clamp((_r.y - SHOULDER.R.y + 1) / 5, 0, 1) * (k(fly) + k(s.hold));
  _pr.copy(POLE_DOWN.R).lerp(POLE_UP_R, up).normalize();
  _pl.copy(POLE_DOWN.L);
  setArm(solveArm('R', _r, _pr), 'R');
  setArm(solveArm('L', _l, _pl), 'L');
  return OUT;
}
