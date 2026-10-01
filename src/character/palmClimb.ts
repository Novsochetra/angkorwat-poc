import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { JointPose, Pose } from './pose';
import { JOINTS, type JointName } from './skeleton';

/**
 * The explorer up a sugar palm's bamboo ladder (the map's roaming add-on,
 * map/roam/_palmClimb.ts, sets `Animator.posture` to these): facing the
 * trunk, the soles on the stubs lashed to the pole, the fists round the
 * stubs higher up, all four placed by IK on points the ladder gives (the
 * add-on moves them stub by stub as he climbs: `PalmClimbPose`), the body
 * leaning in to the pole, the head up to where he goes (down to his feet
 * coming down), out over his shoulder at the top. And standing at the
 * palm's foot holding the full tube out in both hands to the cook
 * (`palmGivePose`).
 *
 * Units: body units (BU) in his own space (origin between his feet, +z the
 * way he faces, +x his left), as skeleton.ts. Nothing here allocates per
 * frame: the poses are kept and filled again.
 */

const piv = (n: JointName): Vector3 => new Vector3(...JOINTS[n].pivot);
const REST_HIPS = piv('hips');
const CHEST_REL = piv('chest').sub(REST_HIPS);
type Side = 'L' | 'R';
const LEG = {
  L: { hip: piv('hipL').sub(REST_HIPS), upper: piv('kneeL').sub(piv('hipL')), lower: piv('ankleL').sub(piv('kneeL')) },
  R: { hip: piv('hipR').sub(REST_HIPS), upper: piv('kneeR').sub(piv('hipR')), lower: piv('ankleR').sub(piv('kneeR')) },
};
const ARM = {
  L: { shoulder: piv('shoulderL').sub(piv('chest')), upper: piv('elbowL').sub(piv('shoulderL')), lower: piv('propL').sub(piv('elbowL')) },
  R: { shoulder: piv('shoulderR').sub(piv('chest')), upper: piv('elbowR').sub(piv('shoulderR')), lower: piv('propR').sub(piv('elbowR')) },
};
/** The sole is this far under the ankle (BU), and the stub goes under the ball of the foot this far in front of it. */
const SOLE_DROP = 2.0;
const BALL = 2.2;

/**
 * The belt (hips space, BU, from the hips joint): where the clean tube hangs
 * at his back on the right, and where he hooks the full one at his right
 * side: each the top of the tube (it hangs from the belt by its rim; the
 * fist takes it there).
 */
export const BELT_EMPTY = new Vector3(-3.7, 1.7, -2.9);
export const BELT_FULL = new Vector3(-5.3, 1.7, -0.2);

/**
 * How he hangs on the ladder (BU, radians): his hips in to the pole and a
 * little low, the chest leaning back from them (his big head stays clear of
 * the pole, his feet reach the stubs in front of him), the neck taking some
 * of it back.
 */
const HIPS_IN = 2.4;
const HIPS_DOWN = 0.3;
const CHEST_BACK = 0.28;
const NECK_FWD = 0.2;

/** What the ladder's add-on sets every step (body space, BU). */
export interface PalmClimbPose {
  /** Where each sole stands on its stub (the contact under the ball of the foot). */
  readonly footL: Vector3;
  readonly footR: Vector3;
  /** Where each fist holds. */
  readonly handL: Vector3;
  readonly handR: Vector3;
  /** How far round the toes turn out from straight at the trunk (radians). */
  turnOut: number;
  /** Each foot in the air between stubs (0 planted ‥ 1 halfway): the toes point down a little. */
  liftL: number;
  liftR: number;
  /** Going up (1), down (−1) or still (0), eased: where he looks. */
  dir: number;
  /** Over that: the head's turn (radians, + to his left) and tilt (+ down). */
  lookYaw: number;
  lookPitch: number;
  /** How close he hugs the ladder (1 climbing; less at the top, standing tall). */
  lean: number;
  /** Seconds (breathing). */
  t: number;
}

export const palmClimbState = (): PalmClimbPose => ({
  footL: new Vector3(2.4, 0, 3),
  footR: new Vector3(-2.4, 0, 3),
  handL: new Vector3(2.4, 18, 5),
  handR: new Vector3(-2.4, 18, 5),
  turnOut: 0.5,
  liftL: 0,
  liftR: 0,
  dir: 0,
  lookYaw: 0,
  lookPitch: 0,
  lean: 1,
  t: 0,
});

// ── The kept poses ──────────────────────────────────────────────────────────

const JOINTS_SET: readonly JointName[] = ['hips', 'chest', 'neck', 'head', 'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR', 'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR', 'backpack'];
function keptPose(): Record<JointName, JointPose> & Pose {
  const p = {} as Record<JointName, JointPose>;
  for (const n of JOINTS_SET) p[n] = { rx: 0, ry: 0, rz: 0, px: 0, py: 0, pz: 0 };
  return p;
}
const zero = (j: JointPose) => {
  j.rx = j.ry = j.rz = j.px = j.py = j.pz = 0;
};
const CLIMB = keptPose();
const GIVE = keptPose();

// ── Scratch ─────────────────────────────────────────────────────────────────

const _mh = new Matrix4();
const _mc = new Matrix4();
const _inv = new Matrix4();
const _m1 = new Matrix4();
const _m2 = new Matrix4();
const _qh = new Quaternion();
const _qc = new Quaternion();
const _q1 = new Quaternion();
const _q2 = new Quaternion();
const _q3 = new Quaternion();
const _e = new Euler();
const _one = new Vector3(1, 1, 1);
const _t = new Vector3();
const _v = new Vector3();
const _w = new Vector3();
const _f0 = new Vector3();
const _fn = new Vector3();
const _x0 = new Vector3();
const _x1 = new Vector3();
const _tn = new Vector3();
const _p = new Vector3();
const _pole = new Vector3();

/**
 * Two bones from a joint (the root: hip, shoulder) through a middle one
 * (knee, elbow: it turns about its own x only) to an end (ankle, fist):
 * `upper` and `lower` the bones at rest (the root's parent space), `target`
 * the end's place from the root's pivot (same space), `pole` the way the
 * middle joint should point. `bend` +1 bends the middle joint's x positive
 * (a knee: the shin back), −1 negative (an elbow: the forearm forward).
 * Writes the root's turn into `root` and the middle's into `mid`. Out of
 * reach, the end stops short along the way to the target.
 */
function twoBone(upper: Vector3, lower: Vector3, target: Vector3, pole: Vector3, bend: 1 | -1, root: JointPose, mid: JointPose): void {
  const a = upper.length();
  const b = lower.length();
  const d = Math.min(a + b - 1e-3, Math.max(Math.abs(a - b) + 1e-3, target.length()));
  // The middle joint's turn θ: upper · Rx(θ)·lower = (d² − a² − b²) / 2.
  const c0 = upper.x * lower.x;
  const A = upper.y * lower.y + upper.z * lower.z;
  const B = upper.z * lower.y - upper.y * lower.z;
  const R = Math.hypot(A, B) || 1e-6;
  const k = Math.min(1, Math.max(-1, ((d * d - a * a - b * b) / 2 - c0) / R));
  const th = Math.atan2(B, A) + bend * Math.acos(k);
  // The bones at rest with the middle turned: root → end (V), and which way the middle stands off that line.
  const c = Math.cos(th);
  const s = Math.sin(th);
  _v.set(upper.x + lower.x, upper.y + lower.y * c - lower.z * s, upper.z + lower.y * s + lower.z * c).normalize();
  _f0.copy(upper).addScaledVector(_v, -upper.dot(_v)).normalize();
  // Wanted: the end on the target, the middle towards the pole.
  _tn.copy(target).normalize();
  _fn.copy(pole).addScaledVector(_tn, -pole.dot(_tn));
  if (_fn.lengthSq() < 1e-8) _fn.copy(_f0).addScaledVector(_tn, -_f0.dot(_tn));
  _fn.normalize();
  _m1.makeBasis(_v, _f0, _x0.crossVectors(_v, _f0)).transpose();
  _m2.makeBasis(_tn, _fn, _x1.crossVectors(_tn, _fn)).multiply(_m1);
  _e.setFromRotationMatrix(_m2, 'XYZ');
  root.rx = _e.x;
  root.ry = _e.y;
  root.rz = _e.z;
  mid.rx = th;
  mid.ry = mid.rz = 0;
}

/** The hips' and the chest's matrices (body space) from a pose's hips and chest. */
function bodyMatrices(pose: Pose): void {
  const h = pose.hips!;
  const c = pose.chest!;
  _qh.setFromEuler(_e.set(h.rx ?? 0, h.ry ?? 0, h.rz ?? 0, 'XYZ'));
  _mh.compose(_t.set(REST_HIPS.x + (h.px ?? 0), REST_HIPS.y + (h.py ?? 0), REST_HIPS.z + (h.pz ?? 0)), _qh, _one);
  _qc.setFromEuler(_e.set(c.rx ?? 0, c.ry ?? 0, c.rz ?? 0, 'XYZ'));
  _mc.compose(_t.set(CHEST_REL.x + (c.px ?? 0), CHEST_REL.y + (c.py ?? 0), CHEST_REL.z + (c.pz ?? 0)), _qc, _one);
  _mc.premultiply(_mh);
}

/** A leg: the sole's contact `at` (body space), the toes turned `turn` from straight ahead (+ his left), tipped down `tip`. */
function leg(pose: Record<JointName, JointPose>, side: Side, at: Vector3, turn: number, tip: number): void {
  const L = LEG[side];
  // The ankle over and behind the contact (the foot flat, turned).
  const sn = Math.sin(turn);
  const cs = Math.cos(turn);
  _w.set(at.x - sn * BALL, at.y + SOLE_DROP + tip * 1.2, at.z - cs * BALL);
  // In hips space, from the hip joint.
  _p.copy(_w).applyMatrix4(_inv.copy(_mh).invert()).sub(L.hip);
  // The knee forward and out (frog-like up a pole), a little more out the higher the foot.
  _pole.set(side === 'L' ? 0.85 : -0.85, 0, 1).normalize();
  const hip = pose[side === 'L' ? 'hipL' : 'hipR'];
  const knee = pose[side === 'L' ? 'kneeL' : 'kneeR'];
  twoBone(L.upper, L.lower, _p, _pole, 1, hip, knee);
  // The foot flat in body space, turned out (a little toe-down while it swings): ankle = (hips · hip · knee)⁻¹ · foot.
  _q1.setFromEuler(_e.set(hip.rx!, hip.ry!, hip.rz!, 'XYZ'));
  _q2.setFromEuler(_e.set(knee.rx!, 0, 0, 'XYZ'));
  _q3.copy(_qh).multiply(_q1).multiply(_q2).invert();
  _q1.setFromEuler(_e.set(tip * 0.45, turn, 0, 'YXZ'));
  _q3.multiply(_q1);
  _e.setFromQuaternion(_q3, 'XYZ');
  const ankle = pose[side === 'L' ? 'ankleL' : 'ankleR'];
  ankle.rx = _e.x;
  ankle.ry = _e.y;
  ankle.rz = _e.z;
}

/** An arm: the fist on `at` (body space), the elbow out and down. */
function arm(pose: Record<JointName, JointPose>, side: Side, at: Vector3, elbow: Vector3): void {
  const A = ARM[side];
  _p.copy(at).applyMatrix4(_inv.copy(_mc).invert()).sub(A.shoulder);
  twoBone(A.upper, A.lower, _p, elbow, -1, pose[side === 'L' ? 'shoulderL' : 'shoulderR'], pose[side === 'L' ? 'elbowL' : 'elbowR']);
  zero(pose[side === 'L' ? 'wristL' : 'wristR']);
}

/** Elbows out to the sides and down, a little back (chest space). */
const ELBOW = { L: new Vector3(1, -0.55, -0.35).normalize(), R: new Vector3(-1, -0.55, -0.35).normalize() };

/** On the ladder (see `PalmClimbPose`). */
export function palmClimbPose(s: PalmClimbPose): Pose {
  const p = CLIMB;
  const breathe = Math.sin(s.t * 1.6);
  const lean = s.lean;
  // The weight over the foot that stands lower: the hips sway a little that way.
  const sway = Math.max(-1, Math.min(1, (s.footR.y - s.footL.y) / 6));
  zero(p.hips);
  p.hips.pz = HIPS_IN * lean;
  p.hips.py = -HIPS_DOWN * lean;
  p.hips.rz = 0.045 * sway;
  zero(p.chest);
  p.chest.rx = -CHEST_BACK * lean + 0.015 * breathe;
  p.chest.rz = -0.03 * sway;
  p.chest.ry = 0.04 * sway;
  // The head: up the ladder going up, down at his feet going down; turned a little off the pole (his left).
  const up = Math.max(0, s.dir);
  const down = Math.max(0, -s.dir);
  zero(p.neck);
  zero(p.head);
  p.neck.rx = NECK_FWD * lean - 0.1 * up + 0.2 * down + 0.4 * s.lookPitch;
  p.neck.ry = 0.4 * s.lookYaw + 0.06;
  p.head.rx = -0.22 * up + 0.38 * down + 0.6 * s.lookPitch + 0.01 * breathe;
  p.head.ry = 0.6 * s.lookYaw + 0.1;
  zero(p.backpack);
  bodyMatrices(p);
  leg(p, 'L', s.footL, s.turnOut, s.liftL);
  leg(p, 'R', s.footR, -s.turnOut, s.liftR);
  arm(p, 'L', s.handL, ELBOW.L);
  arm(p, 'R', s.handR, ELBOW.R);
  return p;
}

/**
 * Where a point of his belt (hips space, BU: `BELT_FULL`, `BELT_EMPTY`) is in
 * his body space with the ladder pose's hips (for the hand going to it).
 */
export function palmBeltPoint(s: PalmClimbPose, local: Vector3, out: Vector3): Vector3 {
  const sway = Math.max(-1, Math.min(1, (s.footR.y - s.footL.y) / 6));
  _q1.setFromEuler(_e.set(0, 0, 0.045 * sway, 'XYZ'));
  _m1.compose(_t.set(REST_HIPS.x, REST_HIPS.y - HIPS_DOWN * s.lean, REST_HIPS.z + HIPS_IN * s.lean), _q1, _one);
  return out.copy(local).applyMatrix4(_m1);
}

// ── Handing the tube over ──────────────────────────────────────────────────

/** What the hand-over sets: how far the arms are out (0‥1, eased by the caller) and the clock. */
export interface PalmGivePose {
  k: number;
  t: number;
}

/** The fists holding the tube out in front of his chest (body space, BU), a little apart (both on it). */
export const GIVE_HANDS = { L: new Vector3(0.9, 14.6, 7.6), R: new Vector3(-0.9, 13.2, 7.6) };
const GIVE_ELBOW = { L: new Vector3(1, -0.8, -0.2).normalize(), R: new Vector3(-1, -0.8, -0.2).normalize() };
/** The arms hanging at rest (body space, BU): where the fists start from. */
const REST_HANDS = { L: piv('propL'), R: piv('propR') };
const _hl = new Vector3();
const _hr = new Vector3();

/** The joints the hand-over leaves at rest (the legs stand, the pack stays on). */
const STILL: readonly JointName[] = ['hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR', 'backpack'];

/** Standing at the palm's foot, holding the full tube out in both hands with a little bow (the feet planted by the animator). */
export function palmGivePose(s: PalmGivePose): Pose {
  const p = GIVE;
  const k = Math.max(0, Math.min(1, s.k));
  const e = k * k * (3 - 2 * k);
  zero(p.hips);
  zero(p.chest);
  p.chest.rx = 0.16 * e + 0.012 * Math.sin(s.t * 1.6);
  zero(p.neck);
  p.neck.rx = 0.08 * e;
  zero(p.head);
  p.head.rx = 0.06 * e;
  for (const n of STILL) zero(p[n]);
  bodyMatrices(p);
  _hl.copy(REST_HANDS.L).lerp(GIVE_HANDS.L, e);
  _hr.copy(REST_HANDS.R).lerp(GIVE_HANDS.R, e);
  arm(p, 'L', _hl, GIVE_ELBOW.L);
  arm(p, 'R', _hr, GIVE_ELBOW.R);
  return p;
}
