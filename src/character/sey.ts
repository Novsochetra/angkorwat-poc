import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { JointPose, Pose } from './pose';
import { JOINTS } from './skeleton';

/**
 * The explorer kicking the sey with the village children (map/roam/_sey.ts):
 * a posture (Animator `posture`, the feet planted by the Animator) for the
 * whole game. He stands ready, knees soft, arms a little out, watching the
 * sey; as it comes down to him the kicking knee lifts and turns out; on the
 * press the foot snaps up to meet it — the inside of the foot (the instep
 * turned up, the knee out) — follows through and comes back down; a perfect
 * press is a flourish: a quick turn on the standing foot and the heel kicked
 * back up into it; a miss kicks the air. His foot meets the sey where it is
 * (leg IK to the point: `solveLeg`), not a canned kick.
 *
 * Units: body units (BU) in his own space (origin the ground between his
 * feet, +x his left, +z ahead, +y up), as `JOINTS`. Nothing is allocated a
 * frame: the pose object is reused.
 */

export interface SeyStance {
  /** Seconds (for breathing and sway). */
  t: number;
  /** 0‥1: ready, the knees soft and the arms out (eased by the game). */
  ready: number;
  /** 0‥1: the kicking knee lifting and turning out as the sey comes down to him. */
  lift: number;
  /** The kicking foot. */
  foot: 'L' | 'R';
  /** The kick under way: none, the inside of the foot, the heel (after a turn), the air (a miss). */
  kind: 'none' | 'inside' | 'heel' | 'whiff';
  /** Seconds since the kick began (the press), and when the foot meets the sey (s after it). */
  since: number;
  meet: number;
  /** Where the foot meets the sey (his space, BU). */
  target: Vector3;
  /** Where he looks (his space, BU): the sey. */
  look: Vector3;
  /** 0‥1: a happy fist up after a good kick. */
  joy: number;
}

/** How the kick goes after the touch (s): following through, then back down to the ground. */
const FOLLOW = 0.1;
const DOWN = 0.36;
/** The heel's turn on the standing foot (radians) and how long it takes to come back round (s). */
const SPIN = 2.1;
const UNSPIN = 0.48;
/** Knees soft when ready (the hips this much lower, BU), and in a kick. */
const CROUCH = 0.55;
const CROUCH_KICK = 0.9;
const CROUCH_HEEL = 1.5;
/** The heel's turn is a hop-step away from the sey (BU, the way he faces after it), so his leg kicks out behind him. */
const STEP = 2.8;

const v = (j: keyof typeof JOINTS) => new Vector3(...JOINTS[j].pivot);
const HIPS = v('hips');
/** The leg's bones (BU): hip joint from the hips' pivot, thigh, shin (knee → ankle). */
const THIGH = v('hipL').sub(v('kneeL')).length();
const SHIN_REST = v('ankleL').sub(v('kneeL'));
const SHIN = SHIN_REST.length();
/** The rest shin leans back a little from straight down (radians). */
const SHIN_TILT = Math.atan2(-SHIN_REST.z, -SHIN_REST.y);
const HIP_J = { L: v('hipL').sub(HIPS), R: v('hipR').sub(HIPS) };
const ANKLE_REST = { L: v('ankleL'), R: v('ankleR') };
/** The contact points on the foot (ankle space): the instep (the inner side, mid-foot), the back of the heel. */
const INSTEP = { L: new Vector3(-1.3, -1.1, 1.5), R: new Vector3(1.3, -1.1, 1.5) };
const HEEL = new Vector3(0, -1.5, -2.7);
const HEAD_Y = 21.5;

// (scratch: nothing allocated a frame)
const _hq = new Quaternion();
const _hm = new Matrix4();
const _hmT = new Matrix4();
const _e = new Euler();
const _off = new Vector3();
const _a = new Vector3();
const _a2 = new Vector3();
const _t = new Vector3();
const _pole = new Vector3();
const _look = new Vector3();
const _fq = new Quaternion();
const _fq2 = new Quaternion();
const _fm = new Matrix4();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _rest = { L: new Vector3(), R: new Vector3() };
const FLAT = new Quaternion();
const UP = new Vector3(0, 1, 0);

/** The pose, reused: every joint's turns written each call. */
const JOINT_LIST = ['hips', 'chest', 'neck', 'head', 'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR', 'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR'] as const;
const POSE: Pose = Object.fromEntries(JOINT_LIST.map((j) => [j, { rx: 0, ry: 0, rz: 0, px: 0, py: 0, pz: 0 }])) as Pose;
const J = (name: (typeof JOINT_LIST)[number]) => POSE[name] as Required<JointPose>;

const smooth = (u: number) => {
  const k = Math.min(1, Math.max(0, u));
  return k * k * (3 - 2 * k);
};
const easeOut = (u: number) => {
  const k = Math.min(1, Math.max(0, u));
  return 1 - (1 - k) * (1 - k);
};

/** The posture for the game, now (see `SeyStance`). */
export function seyPose(s: SeyStance): Pose {
  for (const j of JOINT_LIST) {
    const p = J(j);
    p.rx = p.ry = p.rz = p.px = p.py = p.pz = 0;
  }
  // (the heel: he turns on the foot it came to, toward that side, his back to the sey, and kicks back with the other)
  const heel = s.kind === 'heel';
  const kick = heel === (s.foot === 'R') ? 'L' : 'R';
  const stand = kick === 'R' ? 'L' : 'R';
  const ks = kick === 'L' ? 1 : -1;
  const breathe = Math.sin(s.t * 2.1);
  const sway = Math.sin(s.t * 1.3);

  // ── The kick's moments ──
  const kicking = s.kind !== 'none';
  const m = s.meet;
  const sc = s.since;
  /** 0 → 1 up to the touch, the follow-through, then 1 → 0 back down. */
  const up = !kicking ? 0 : sc < m ? easeOut(sc / m) : sc < m + FOLLOW ? 1 : 1 - smooth((sc - m - FOLLOW) / DOWN);
  const spin = heel ? ks * -1 * SPIN * (sc < m ? smooth(sc / m) : 1 - smooth((sc - m - FOLLOW * 0.6) / UNSPIN)) : 0;

  // ── The hips: lower when ready, lower still in a kick; turned on the standing foot for the heel ──
  const hips = J('hips');
  const crouch = CROUCH * s.ready + (heel ? CROUCH_HEEL : CROUCH_KICK - CROUCH) * up * s.ready;
  hips.py = -crouch + 0.06 * breathe;
  hips.ry = spin;
  // (leaning off the kicking side; forward over the standing leg for the heel)
  hips.rz = ks * (0.05 * s.lift + 0.07 * up) * (heel ? 0 : 1);
  _hq.setFromEuler(_e.set(hips.rx, hips.ry, hips.rz, 'XYZ'));
  // (turning on the standing foot: the hips go round its hip joint, not their own middle)
  const step = heel ? STEP * up : 0;
  if (spin !== 0) {
    _a.copy(HIP_J[stand]).applyQuaternion(_hq);
    hips.px = HIP_J[stand].x - _a.x + Math.sin(spin) * step;
    hips.pz = HIP_J[stand].z - _a.z + Math.cos(spin) * step;
  }
  _off.set(hips.px, hips.py, hips.pz);
  _hm.makeRotationFromQuaternion(_hq);
  _hmT.copy(_hm).transpose();

  // ── The standing leg: its foot planted where it stands (turning with him on the heel's spin) ──
  _rest[stand].copy(ANKLE_REST[stand]);
  // (for the heel it is the foot that was lifting toward the sey: down as he turns)
  if (heel && sc < m) {
    const k = s.lift * (1 - easeOut(sc / m));
    _rest[stand].add(_x.set(ks * 0.7 * k, 1.7 * k, 1.5 * k));
  }
  // (and the hop-step)
  if (step) _rest[stand].add(_x.set(Math.sin(spin) * step, 0, Math.cos(spin) * step));
  toHips(_rest[stand], _t);
  _fq.setFromAxisAngle(UP, spin);
  _fm.makeRotationFromQuaternion(_fq).premultiply(_hmT);
  solveLeg(stand, _t, _pole.set(0, 0, 1), _fm, J(stand === 'L' ? 'hipL' : 'hipR'), J(stand === 'L' ? 'kneeL' : 'kneeR'), J(stand === 'L' ? 'ankleL' : 'ankleR'));

  // ── The kicking leg ──
  // Its ankle (in the hips' space): on the ground; lifting as the sey comes (knee up and out, the foot in toward
  // it); up to where the foot's contact point (the instep, the heel) is on the sey; through; back down.
  const hipK = J(kick === 'L' ? 'hipL' : 'hipR');
  const kneeK = J(kick === 'L' ? 'kneeL' : 'kneeR');
  const ankleK = J(kick === 'L' ? 'ankleL' : 'ankleR');
  const restH = toHips(_rest[kick].copy(ANKLE_REST[kick]), _a);
  const liftH = toHips(_t.copy(ANKLE_REST[kick]).add(_x.set(-ks * 0.7 * s.lift, 1.7 * s.lift, 1.5 * s.lift)), _a2);
  /** The foot's turn at the touch (his space for the inside, the hips' for the heel), and how far it is turned now. */
  const touchTurn = kickFrame(kick, heel, _fq2);
  const turned = kicking ? up : 0.3 * s.lift;
  if (!kicking) {
    _fq.slerpQuaternions(FLAT, touchTurn, turned);
    _fm.makeRotationFromQuaternion(_fq).premultiply(_hmT);
    solveLeg(kick, liftH, _pole.set(ks * 0.6 * s.lift, 0.1, 1).applyMatrix4(_hmT).normalize(), _fm, hipK, kneeK, ankleK);
  } else {
    const go = sc < m ? easeOut(sc / m) : 1;
    const fol = sc > m ? smooth((sc - m) / FOLLOW) : 0;
    const back = sc < m + FOLLOW ? 0 : smooth((sc - m - FOLLOW) / DOWN);
    // Where the ankle is at the touch (the hips' space as they are then).
    const touch = _z;
    if (heel) {
      // (the hips at the touch: turned all the way on the standing foot, crouched)
      _fq.setFromEuler(_e.set(0, -ks * SPIN, 0, 'XYZ'));
      _y.copy(HIP_J[stand]).applyQuaternion(_fq);
      touch
        .copy(s.target)
        .sub(HIPS)
        .sub(_x.set(HIP_J[stand].x - _y.x - Math.sin(ks * SPIN) * STEP, -(CROUCH + CROUCH_HEEL) * s.ready, HIP_J[stand].z - _y.z + Math.cos(ks * SPIN) * STEP))
        .applyQuaternion(_fq.invert())
        .sub(_y.copy(HEEL).applyQuaternion(touchTurn));
      _fq.slerpQuaternions(FLAT, touchTurn, turned);
      _fm.makeRotationFromQuaternion(_fq);
    } else {
      toHips(_x.copy(s.target).sub(_y.copy(INSTEP[kick]).applyQuaternion(touchTurn)), touch);
      _fq.slerpQuaternions(FLAT, touchTurn, turned);
      _fm.makeRotationFromQuaternion(_fq).premultiply(_hmT);
    }
    // (the follow-through: on up and across for the inside, up and back for the heel)
    _x.copy(touch).add(heel ? _y.set(0, 1.4, -1.1) : _y.set(-ks * 0.6, 1.1, 0.7).applyMatrix4(_hmT));
    _t.copy(liftH).lerp(touch, go).lerp(_x, fol * (1 - back)).lerp(restH, back);
    // (the knee: out to the side for the inside of the foot; down and ahead for the heel)
    _pole.set(heel ? 0 : ks * 1.0, heel ? -0.55 : -0.2, heel ? 0.85 : 0.35);
    if (!heel) _pole.applyMatrix4(_hmT);
    solveLeg(kick, _t, _pole.normalize(), _fm, hipK, kneeK, ankleK);
  }

  // ── The body: a little forward when ready, back as the foot comes up; forward over the standing leg for the heel ──
  const chest = J('chest');
  chest.rx = 0.08 * s.ready + 0.012 * breathe - (heel ? -0.16 : 0.14) * up;
  chest.rz = -ks * 0.05 * up;
  chest.ry = 0.04 * sway * (1 - up);

  // ── The head: on the sey ──
  _look.copy(s.look).sub(_t.set(0, HEAD_Y - crouch, 0.3));
  if (spin !== 0) _look.applyAxisAngle(UP, -spin);
  const yaw = Math.max(-1.5, Math.min(1.5, Math.atan2(_look.x, _look.z) - chest.ry));
  // (his big head nods only so far: past that the eyes do the rest)
  const pitch = Math.max(-0.45, Math.min(0.42, 0.6 * Math.atan2(-_look.y, Math.hypot(_look.x, _look.z)) - chest.rx));
  const neck = J('neck');
  const head = J('head');
  neck.rx = 0.4 * pitch;
  neck.ry = 0.4 * yaw;
  head.rx = 0.6 * pitch;
  head.ry = 0.6 * yaw;

  // ── The arms: out a little, wider for balance in a kick (the kicking side's back, the other forward); a fist up for joy ──
  const out = 0.32 * s.ready + 0.5 * up;
  const shK = J(kick === 'L' ? 'shoulderL' : 'shoulderR');
  const shS = J(kick === 'L' ? 'shoulderR' : 'shoulderL');
  const elK = J(kick === 'L' ? 'elbowL' : 'elbowR');
  const elS = J(kick === 'L' ? 'elbowR' : 'elbowL');
  shK.rz = ks * (0.12 + out + 0.25 * up);
  shK.rx = -0.15 * s.ready + 0.35 * up;
  shS.rz = -ks * (0.12 + out);
  shS.rx = -0.25 * s.ready - 0.45 * up;
  elK.rx = -0.45 * s.ready - 0.2 * up;
  elS.rx = -0.55 * s.ready - 0.35 * up;
  if (s.joy > 0) {
    // (the right hand up, a fist by his head: yes!)
    const j = smooth(s.joy);
    const sh = J('shoulderR');
    const el = J('elbowR');
    sh.rx += (-2.5 - sh.rx) * j;
    sh.rz += (-0.35 - sh.rz) * j;
    el.rx += (-1.35 - el.rx) * j;
  }
  return POSE;
}

/** A point of his space into the hips' (as posed now: `_hmT`, `_off`). */
function toHips(p: Vector3, out: Vector3): Vector3 {
  return out.copy(p).sub(HIPS).sub(_off).applyMatrix4(_hmT);
}

/**
 * The foot's turn for the kick (his space): the inside of the foot — the toes out and a little up, the inner side
 * turned up to the sey — or, for the heel, the toes down and the sole back.
 */
function kickFrame(foot: 'L' | 'R', heel: boolean, out: Quaternion): Quaternion {
  const ks = foot === 'L' ? 1 : -1;
  if (heel) {
    _z.set(0, -0.95, 0.3).normalize();
    _y.set(0, 0.3, 0.95).normalize();
    _x.crossVectors(_y, _z);
  } else {
    _z.set(ks * 0.6, 0.18, 0.78).normalize();
    // (the inner side: +x for the right foot, −x for the left; turned to point up)
    _x.copy(UP).addScaledVector(_z, -_z.y).normalize().multiplyScalar(-ks);
    _y.crossVectors(_z, _x);
  }
  _fm.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_fm);
}

// ── Leg IK ──────────────────────────────────────────────────────────────────

const _d = new Vector3();
const _u = new Vector3();
const _w = new Vector3();
const _hip = new Vector3();
const _knee = new Vector3();
const _f = new Vector3();
const _m1 = new Matrix4();
const _m2 = new Matrix4();
const _mk = new Matrix4();
const _b1 = new Vector3();
const _b2 = new Vector3();
const _b3 = new Vector3();
const U0 = new Vector3(0, -1, 0);
const W0 = new Vector3(0, 0, 1);

/** An orthonormal frame from a direction and a second vector toward its plane (as matrix columns). */
function frame(a: Vector3, b: Vector3, out: Matrix4): Matrix4 {
  _b1.copy(a).normalize();
  _b2.copy(b).addScaledVector(_b1, -b.dot(_b1)).normalize();
  _b3.crossVectors(_b1, _b2);
  return out.makeBasis(_b1, _b2, _b3);
}

/**
 * Two-bone leg IK in the hips' space: the hip's turn and the knee's bend that put the ankle on `target`, the knee
 * toward `pole`; with `foot` (a turn in the hips' space), the ankle's turn that gives the foot that turn.
 */
export function solveLeg(side: 'L' | 'R', target: Vector3, pole: Vector3, foot: Matrix4 | null, hip: JointPose, knee: JointPose, ankle: JointPose): void {
  const a = THIGH;
  const b = SHIN;
  _hip.copy(HIP_J[side]);
  _d.subVectors(target, _hip);
  const len = Math.min(a + b - 0.02, Math.max(Math.abs(a - b) + 0.02, _d.length()));
  _d.normalize();
  const cosA = (a * a + len * len - b * b) / (2 * a * len);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  // (the knee's way: the pole across the line to the ankle)
  _w.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_w.lengthSq() < 1e-6) _w.set(0, 0, 1).addScaledVector(_d, -_d.z);
  _w.normalize();
  _u.copy(_d).multiplyScalar(cosA).addScaledVector(_w, sinA);
  _knee.copy(_hip).addScaledVector(_u, a);
  _f.copy(_hip).addScaledVector(_d, len).sub(_knee).normalize();
  const bend = Math.max(0, Math.acos(Math.min(1, Math.max(-1, _u.dot(_f)))) - SHIN_TILT);
  // The hip: the rest thigh (down) and knee (ahead) onto the solved ones.
  frame(_u, _w, _m1);
  frame(U0, W0, _m2).transpose();
  _m1.multiply(_m2);
  _e.setFromRotationMatrix(_m1, 'XYZ');
  hip.rx = _e.x;
  hip.ry = _e.y;
  hip.rz = _e.z;
  knee.rx = bend;
  knee.ry = knee.rz = 0;
  if (foot) {
    // The ankle: the shin's frame (hip · knee) onto the foot's.
    _mk.makeRotationX(bend);
    _m1.multiply(_mk).transpose().multiply(foot);
    _e.setFromRotationMatrix(_m1, 'XYZ');
    ankle.rx = _e.x;
    ankle.ry = _e.y;
    ankle.rz = _e.z;
  }
}
