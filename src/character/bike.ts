import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { BODY_UNIT_M } from '../world/scale';
import type { JointPose, Pose } from './pose';
import { JOINTS, type JointName } from './skeleton';

/**
 * Riding a bicycle (the map's roam/_bike.ts): the explorer on the saddle of a
 * black Khmer town bicycle, his fists on the grips (arm IK, the bars turning
 * with the steering), his feet on the pedals (leg IK: the balls of his boots
 * on them, the ankles working through the stroke), so his legs pedal in time
 * with the cranks; he leans with the bicycle into a turn, rocks his shoulders
 * when he pedals hard, sinks a little over a bump. Stopped, he slides to the
 * saddle's nose and puts his left foot down on the ground, the bicycle
 * leaning to that side (the ride leans it: `STOP_LEAN`), the right pedal
 * parked up and forward to push off from; walking it back, his left foot
 * steps it backwards (his legs are too short for both feet at once).
 *
 * The bicycle is sized for him (`BIKE`, body units in his own space): his
 * legs are short (the saddle is low, the cranks short) and his belly round
 * (the grips stand well forward of it). The map's model (roam/_bikeModel.ts)
 * is built from the same numbers, so the hands, the feet and the seat meet it.
 *
 * A posture for `Animator.posture` with `postureFeet = false` (it places the
 * body itself). Units: body units (BU) in the explorer's space, which is the
 * bicycle's: the origin on the ground under the saddle's middle, +z ahead,
 * +x his left.
 */

/** Metres at his roaming size (1.4 × his true 1.7 m: the map's) → body units. */
const m = (v: number) => v / (BODY_UNIT_M * 1.4);

/** The bicycle (BU): wheels, hubs, the crank's axle, the saddle, the steering axis, the grips. */
export const BIKE = {
  /** Tyre's outer radius. */
  wheel: m(0.34),
  /** Hubs (z). */
  rear: m(-0.4),
  front: m(0.74),
  /** The crank's axle (the bottom bracket), the crank arms' length, how far out the pedals' middles are. */
  bbY: m(0.29),
  bbZ: m(0.1),
  crank: m(0.15),
  pedalX: m(0.15),
  /** The saddle's top. */
  saddle: m(0.8),
  /** The steering axis: through the head tube's top, tilted back this far from upright (rad). */
  headY: m(0.86),
  headZ: m(0.555),
  rake: 0.36,
  /** The grips' middles with the bars straight (x out to each side). */
  gripX: m(0.3),
  gripY: m(1.02),
  gripZ: m(0.56),
  /** How far a turn of the pedals carries it (the gear). */
  gear: m(4.4),
} as const;

/** From hub to hub. */
export const WHEELBASE = BIKE.front - BIKE.rear;

/**
 * The pedals' turn (rad): 0 the left pedal at the top, then forward, down,
 * back (pedalling forward makes it grow); the right pedal half a turn on.
 * Where the middle of a pedal's top is (BU).
 */
export function pedalAt(side: 'L' | 'R', crank: number, out: Vector3): Vector3 {
  const c = side === 'L' ? crank : crank + Math.PI;
  return out.set((side === 'L' ? 1 : -1) * BIKE.pedalX, BIKE.bbY + BIKE.crank * Math.cos(c), BIKE.bbZ + BIKE.crank * Math.sin(c));
}

/**
 * A pedal's tilt with the foot on it (rad, + toes down) at the crank's turn
 * for that pedal: the heel drops pushing over the front, the toes point down
 * pulling through the bottom and back (ankling).
 */
export function pedalPitch(c: number): number {
  return 0.14 - 0.2 * Math.cos(c - Math.PI / 4);
}

const STEER_AXIS = new Vector3(0, Math.cos(BIKE.rake), -Math.sin(BIKE.rake));
const STEER_AT = new Vector3(0, BIKE.headY, BIKE.headZ);
const _qs = new Quaternion();

/** A point of the bars or the fork (BU, bars straight) turned with the steering (rad, + to his left). */
export function steered(p: Vector3, steer: number): Vector3 {
  return p.sub(STEER_AT).applyQuaternion(_qs.setFromAxisAngle(STEER_AXIS, steer)).add(STEER_AT);
}

/** Where a grip's middle is, the bars turned `steer` (BU). */
export function gripAt(side: 'L' | 'R', steer: number, out: Vector3): Vector3 {
  return steered(out.set((side === 'L' ? 1 : -1) * BIKE.gripX, BIKE.gripY, BIKE.gripZ), steer);
}

/** What the ride sets every frame. */
export interface BikeRideState {
  /** The pedals' turn (rad, `pedalAt`). */
  crank: number;
  /** The bars' turn (rad, + to his left). */
  steer: number;
  /** The bicycle's lean (rad, + to his left: its left side down) and pitch (rad, + its front down). */
  lean: number;
  pitch: number;
  /** 0 riding ‥ 1 stopped, his left foot down on the ground (the ride leans the bicycle `STOP_LEAN` to that side). */
  down: number;
  /** 0 ‥ 1 walking it back (stopped, his left foot stepping it backwards), and its steps' phase (rad). */
  back: number;
  walk: number;
  /** 0 easy ‥ 1 pedalling hard: lower over the bars, the shoulders rocking. */
  effort: number;
  /** A jolt (0‥1, dying away): he sinks a little and nods. */
  bump: number;
  /** Where he looks (rad, + to his left): into a turn. */
  look: number;
  /** Seconds (breathing). */
  t: number;
}

export function bikeState(): BikeRideState {
  return { crank: 0, steer: 0, lean: 0, pitch: 0, down: 0, back: 0, walk: 0, effort: 0, bump: 0, look: 0, t: 0 };
}

// ── His body ────────────────────────────────────────────────────────────────

const P = (n: JointName) => new Vector3(...JOINTS[n].pivot);
const REST_HIPS = P('hips');
/** The leg pivots and the chest from the hips joint (hips space, at rest). */
const HIP_OFF = { L: P('hipL').sub(REST_HIPS), R: P('hipR').sub(REST_HIPS) };
const CHEST_OFF = P('chest').sub(REST_HIPS);
/** The sit bones (hips space, from rest.ts): they rest on the saddle. */
const SEAT = new Vector3(0, -1.0, -2.7);
/** Leg bones (BU): the thigh, the shin (the rest shin leans back a little). */
const THIGH = JOINTS.hipL.pivot[1] - JOINTS.kneeL.pivot[1];
const SHIN = Math.hypot(JOINTS.kneeL.pivot[1] - JOINTS.ankleL.pivot[1], JOINTS.kneeL.pivot[2] - JOINTS.ankleL.pivot[2]);
const SHIN_LEAN = Math.atan2(JOINTS.kneeL.pivot[2] - JOINTS.ankleL.pivot[2], JOINTS.kneeL.pivot[1] - JOINTS.ankleL.pivot[1]);
/** The ball of a boot from its ankle (ankle space: down to the sole, ahead): it rests on the pedal. */
const BALL = new Vector3(0, -2.0, 2.2);
/** A pedal's half thickness (its top over its middle). */
const PEDAL_TOP = m(0.012);
/** Where the sit bones touch the saddle (z, BU: on its wide back). */
const SIT_Z = m(-0.05);
/** Stopped: he slides this far forward (BU) onto the saddle's nose and down, and the left foot goes down out here (x, ahead of the hips joint). */
const NOSE = 1.3;
const SINK = 0.6;
const FOOT_OUT = 4.6;
const FOOT_AHEAD = 0.6;
/** Stopped, the ride leans the bicycle this far to his left (rad): his short left leg reaches the ground. */
export const STOP_LEAN = 0.23;
/** Walking it back: how far the left boot steps back and forth (BU), and how high it lifts. */
const STEP = 1.4;
const STEP_LIFT = 0.8;

/** Which way the elbows point (chest space): out, down and back. */
const POLE = { L: new Vector3(0.75, -0.55, -0.35).normalize(), R: new Vector3(-0.75, -0.55, -0.35).normalize() };
const ARMS = {
  L: { shoulder: P('shoulderL').sub(P('chest')), upper: P('elbowL').sub(P('shoulderL')), fore: P('propL').sub(P('elbowL')) },
  R: { shoulder: P('shoulderR').sub(P('chest')), upper: P('elbowR').sub(P('shoulderR')), fore: P('propR').sub(P('elbowR')) },
};

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const smooth = (u: number) => {
  const c = clamp(u, 0, 1);
  return c * c * (3 - 2 * c);
};

// (one pose, written in place every frame: no garbage)
const J = (): JointPose => ({ rx: 0, ry: 0, rz: 0, px: 0, py: 0, pz: 0 });
const POSE = {
  hips: J(), chest: J(), neck: J(), head: J(),
  shoulderL: J(), elbowL: J(), wristL: J(), shoulderR: J(), elbowR: J(), wristR: J(),
  hipL: J(), kneeL: J(), ankleL: J(), hipR: J(), kneeR: J(), ankleR: J(),
} satisfies Pose;

const _e = new Euler();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _m = new Matrix4();
const _m2 = new Matrix4();
const _roll = new Matrix4();
const _one = new Vector3(1, 1, 1);
const _h = new Vector3();
const _v = new Vector3();
const _t = new Vector3();
const _p = new Vector3();
const _seat = new Vector3();
const X_AXIS = new Vector3(1, 0, 0);
const SIDES = ['L', 'R'] as const;

/**
 * The posture for this frame. The ride's numbers are read as they are (the
 * ride eases them); the pose is the same object every time.
 */
export function bikePose(s: BikeRideState): Pose {
  const back = smooth(s.back);
  const down = Math.max(smooth(s.down), back);
  const effort = clamp(s.effort, 0, 1);
  const breath = Math.sin(s.t * 1.7) * 0.012;
  // Rocking over the pedals when he pushes hard (one push a pedal: twice a turn of the cranks, side to side).
  const rock = Math.sin(s.crank) * effort * (1 - down) * (1 - back);

  // ── The hips: the sit bones on the saddle (on its nose, a little lower, when stopped) ──
  const tilt = mix(0.22 + 0.1 * effort, 0.14, down);
  _seat.set(0, BIKE.saddle + 0.15, SIT_Z + NOSE * down);
  _v.copy(SEAT).applyAxisAngle(X_AXIS, tilt);
  _h.copy(_seat).sub(_v);
  _h.y -= SINK * down + 0.55 * clamp(s.bump, 0, 1);
  // (unrolled: the bicycle's lean and pitch go on top at the end)
  _m.compose(_h, _q.setFromEuler(_e.set(tilt, 0, -0.035 * rock, 'XYZ')), _one);

  // ── The legs: the balls of the boots on the pedals; stopped, the left one on the ground ──
  for (const side of SIDES) {
    const c = side === 'L' ? s.crank : s.crank + Math.PI;
    pedalAt(side, s.crank, _p);
    _p.y += PEDAL_TOP;
    let a = pedalPitch(c);
    // (the ankle that puts the ball of the boot on the pedal, tipped `a`)
    _t.copy(_p).sub(_v.copy(BALL).applyAxisAngle(X_AXIS, a));
    let roll = 0;
    // Stopped: the left boot down on the ground, out and a little ahead (lifted on the way there and back);
    // walking it back, it steps (lifted as it goes back for the next push).
    const foot = side === 'L' ? down : 0;
    if (foot > 0) {
      const gz = _h.z + FOOT_AHEAD + back * STEP * Math.sin(s.walk);
      const lift = Math.sin(Math.PI * foot) * 1.2 + back * Math.max(0, -Math.cos(s.walk)) * STEP_LIFT;
      // (the bicycle leans to that foot: in its frame the ground out there is this high; flat on it, the sole
      // 2 BU under the ankle, the ankle over the middle of the boot)
      _v.set(FOOT_OUT, FOOT_OUT * Math.tan(s.lean) + 2.0 + lift, gz - 0.9);
      _t.lerp(_v, foot);
      a *= 1 - foot;
      roll = -s.lean * foot;
    }
    legTo(side, _m, _t, a, roll, (side === 'L' ? 0.06 : -0.06) * (1 - foot));
  }

  // ── The chest and the head: leaning to the bars, breathing, looking where he goes ──
  const lean = mix(0.12 + 0.12 * effort, 0.05, down);
  const ch = POSE.chest;
  ch.rx = lean + breath + 0.1 * clamp(s.bump, 0, 1);
  ch.ry = 0.04 * rock + 0.15 * s.look;
  ch.rz = 0.07 * rock;
  ch.px = ch.py = ch.pz = 0;
  const nk = POSE.neck;
  nk.rx = -0.35 * (tilt + lean);
  nk.ry = 0.3 * s.look;
  nk.rz = -0.05 * rock;
  nk.px = nk.py = nk.pz = 0;
  const hd = POSE.head;
  // (eyes on the way ahead whatever the lean; walking it back he looks over his shoulder)
  hd.rx = -0.5 * (tilt + lean) + 0.06 - 0.06 * clamp(s.bump, 0, 1);
  hd.ry = 0.55 * s.look + back * 0.6 + 0.08 * Math.sin(s.t * 0.37) * (1 - effort);
  hd.rz = -0.4 * s.lean - 0.04 * rock;
  hd.px = hd.py = hd.pz = 0;

  // ── The arms: the fists on the grips (chest space), the bars turned with the steering ──
  _m2.compose(CHEST_OFF, _q2.setFromEuler(_e.set(ch.rx!, ch.ry!, ch.rz!, 'XYZ')), _one);
  _m2.premultiply(_m).invert();
  for (const side of SIDES) {
    gripAt(side, s.steer, _t).applyMatrix4(_m2);
    armTo(side, _t, POLE[side]);
  }

  // ── The bicycle's lean and pitch carry the whole of him (about its ground line) ──
  _roll.makeRotationFromEuler(_e.set(s.pitch, 0, -s.lean, 'ZXY'));
  _m.premultiply(_roll);
  _m.decompose(_h, _q, _v);
  _e.setFromQuaternion(_q, 'XYZ');
  const hp = POSE.hips;
  hp.px = _h.x - REST_HIPS.x;
  hp.py = _h.y - REST_HIPS.y;
  hp.pz = _h.z - REST_HIPS.z;
  hp.rx = _e.x;
  hp.ry = _e.y;
  hp.rz = _e.z;
  return POSE;
}

/** The leg joints of each side, written in place. */
const LEG = {
  L: { hip: POSE.hipL, knee: POSE.kneeL, ankle: POSE.ankleL },
  R: { hip: POSE.hipR, knee: POSE.kneeR, ankle: POSE.ankleR },
};
const ARM = {
  L: { shoulder: POSE.shoulderL, elbow: POSE.elbowL, wrist: POSE.wristL },
  R: { shoulder: POSE.shoulderR, elbow: POSE.elbowR, wrist: POSE.wristR },
};
const _lp = new Vector3();
const _lt = new Vector3();
const _lq = new Quaternion();
const _lq2 = new Quaternion();
const _lm = new Matrix4();
const _le = new Euler();
const _ls = new Vector3();

/**
 * A leg by IK: the ankle to `target` (the bicycle's frame, unrolled), the
 * boot's sole turned `pitch` (rad, + toes down), `roll` (rad, + its left side
 * down) and `turn` (rad, the toes to his left) in that frame. `hips`: the
 * hips joint's matrix (unrolled).
 */
function legTo(side: 'L' | 'R', hips: Matrix4, target: Vector3, pitch: number, roll: number, turn: number): void {
  // The target from the leg's pivot, in the hips' own frame.
  const pivot = _lp.copy(HIP_OFF[side]).applyMatrix4(hips);
  hips.decompose(_lt, _lq, _ls);
  _lq2.copy(_lq).invert();
  const A = _lt.subVectors(target, pivot).applyQuaternion(_lq2);
  // The knee's bend from the reach; the leg (thigh and shin) then lies in its own plane, (0, wy, wz).
  const d = clamp(A.length(), Math.abs(THIGH - SHIN) + 1e-3, THIGH + SHIN - 1e-3);
  const bend = Math.acos(clamp((d * d - THIGH * THIGH - SHIN * SHIN) / (2 * THIGH * SHIN), -1, 1));
  const knee = bend - SHIN_LEAN;
  const wy = -THIGH - SHIN * Math.cos(bend);
  const wz = -SHIN * Math.sin(bend);
  // Out to the side (the hip's z turn), then forward or back (its x turn): Rx(θ) · Rz(o) · w = A.
  const o = Math.asin(clamp(A.x / -wy, -0.9, 0.9));
  const theta = Math.atan2(A.z, A.y) - Math.atan2(wz, wy * Math.cos(o));
  const L = LEG[side];
  L.hip.rx = theta;
  L.hip.ry = 0;
  L.hip.rz = o;
  L.hip.px = L.hip.py = L.hip.pz = 0;
  L.knee.rx = knee;
  L.knee.ry = L.knee.rz = L.knee.px = L.knee.py = L.knee.pz = 0;
  // The ankle: whatever the leg's turn, the sole as asked (in the bicycle's frame).
  _lm.makeRotationFromQuaternion(_lq).multiply(_m3.makeRotationFromEuler(_le.set(theta, 0, o, 'XYZ'))).multiply(_rest.makeRotationX(knee)).invert();
  _lm.multiply(_m3.makeRotationFromEuler(_le.set(pitch, turn, -roll, 'ZYX')));
  _le.setFromRotationMatrix(_lm, 'XYZ');
  L.ankle.rx = _le.x;
  L.ankle.ry = _le.y;
  L.ankle.rz = _le.z;
  L.ankle.px = L.ankle.py = L.ankle.pz = 0;
}

// ── Arm IK (Animator's `solveArm`, written into the pose in place) ─────────

const _d = new Vector3();
const _pp = new Vector3();
const _u = new Vector3();
const _f = new Vector3();
const _w = new Vector3();
const _w2 = new Vector3();
const _b1 = new Vector3();
const _b2 = new Vector3();
const _b3 = new Vector3();
const _rest = new Matrix4();
const _m3 = new Matrix4();

function frame(a: Vector3, b: Vector3, out: Matrix4): Matrix4 {
  _b1.copy(a).normalize();
  _b2.copy(b).addScaledVector(_b1, -b.dot(_b1)).normalize();
  _b3.crossVectors(_b1, _b2);
  return out.makeBasis(_b1, _b2, _b3);
}

/** The shoulder's turn and the elbow's bend that put the fist on `target` (chest space), the elbow toward `pole`. */
function armTo(side: 'L' | 'R', target: Vector3, pole: Vector3): void {
  const arm = ARMS[side];
  const a = arm.upper.length();
  const b = arm.fore.length();
  _d.subVectors(target, arm.shoulder);
  const len = clamp(_d.length(), Math.abs(a - b) + 0.01, a + b - 0.01);
  _d.normalize();
  const cosA = (a * a + len * len - b * b) / (2 * a * len);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _pp.copy(pole).addScaledVector(_d, -pole.dot(_d)).normalize();
  _u.copy(_d).multiplyScalar(cosA).addScaledVector(_pp, sinA);
  _f.copy(_d).multiplyScalar(len).addScaledVector(_u, -a).normalize();
  const u0 = _w.copy(arm.upper).normalize();
  const elbow = -Math.acos(clamp(_u.dot(_f) / -u0.y, -1, 1));
  _w2.set(0, -Math.cos(elbow), -Math.sin(elbow));
  frame(u0, _w2, _rest).transpose();
  frame(_u, _f, _m3).multiply(_rest);
  _e.setFromRotationMatrix(_m3, 'XYZ');
  const { shoulder: sh, elbow: el, wrist: wr } = ARM[side];
  sh.rx = _e.x;
  sh.ry = _e.y;
  sh.rz = _e.z;
  sh.px = sh.py = sh.pz = 0;
  el.rx = elbow;
  el.ry = el.rz = el.px = el.py = el.pz = 0;
  // (the fist round the grip: the knuckles forward and down a little)
  wr.rx = 0.25;
  wr.ry = wr.rz = wr.px = wr.py = wr.pz = 0;
}
