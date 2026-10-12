import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { solveArm } from './Animator';
import type { JointPose, Pose } from './pose';
import { JOINTS, type JointName } from './skeleton';

/**
 * Giving something with both hands (the map's roam/_shareFruit.ts: a fruit of
 * his garden to a neighbour, an elder, a child): the Khmer way, both hands
 * held out together in front of him, the fruit between them, a small bow from
 * the chest (deeper to an elder), and, for a child or someone sitting, down on
 * his haunches to their height. A posture for `Animator.posture` with
 * `postureFeet` left on (the Animator plants his soles; the legs bend by IK so
 * the feet stay flat where they stood).
 *
 * The caller eases the numbers (`ShareState`); this only shapes the body. The
 * arms by IK (`solveArm`) to the two fists, `gap` either side of the middle
 * (`shareMiddle`: where the fruit goes, in his chest's space), the elbows down
 * and out.
 *
 * Units: body units (BU), his space (+z forward, +x his left); chest space for
 * the hands (the Animator's arm IK).
 */
export interface ShareState {
  /** The arms: 0 hanging ‥ 1 held out. */
  reach: number;
  /** The bow (0 ‥ 1: `BOW` radians at the chest, a little at the hips). */
  bow: number;
  /** 0 standing ‥ 1 down on his haunches (to a child, to someone sitting). */
  crouch: number;
  /** Half the room between his fists (BU): the fruit's half width and a little. */
  gap: number;
  /** The hands this much lower (BU, chest space: held down to a child). */
  low: number;
  /** His head: turned (radians, + to his left) and tipped down (radians). */
  lookYaw: number;
  lookDown: number;
  /** Seconds (his breathing). */
  t: number;
}

export const newShareState = (): ShareState => ({ reach: 0, bow: 0, crouch: 0, gap: 1.6, low: 0, lookYaw: 0, lookDown: 0, t: 0 });

/** The bow (radians): at the chest, at the hips (a share of it), the neck after it. */
const BOW = { chest: 0.32, hips: 0.12, neck: 0.1 };
/** Where the hands are held (chest space, BU): this high over the chest's pivot (lower chest), this far out in front. */
const HANDS = { y: 3.0, z: 6.0 };
/** Down on his haunches: the hips this low and this far back (BU), the pelvis tipped forward, the knees out a little. */
const SQUAT = { height: 6.6, back: -1.3, hips: 0.2, chest: 0.08, splay: 0.2, turn: 0.16 };
/** The elbows: down, out and a little back. */
const POLE = { L: new Vector3(0.8, -1, -0.35).normalize(), R: new Vector3(-0.8, -1, -0.35).normalize() };
/** Reaching out brings the shoulders forward a little (chest space, BU). */
const SHRUG = { L: new Vector3(-0.15, 0.1, 0.7), R: new Vector3(0.15, 0.1, 0.7) };

const REST_HIPS = JOINTS.hips.pivot;
const THIGH = JOINTS.hipL.pivot[1] - JOINTS.kneeL.pivot[1];
const SHIN = Math.hypot(JOINTS.kneeL.pivot[1] - JOINTS.ankleL.pivot[1], JOINTS.kneeL.pivot[2] - JOINTS.ankleL.pivot[2]);
const SHIN_LEAN = Math.atan2(JOINTS.kneeL.pivot[2] - JOINTS.ankleL.pivot[2], JOINTS.kneeL.pivot[1] - JOINTS.ankleL.pivot[1]);
const ANKLE = JOINTS.ankleL.pivot;
const HIP_L = new Vector3(JOINTS.hipL.pivot[0] - REST_HIPS[0], JOINTS.hipL.pivot[1] - REST_HIPS[1], JOINTS.hipL.pivot[2] - REST_HIPS[2]);

const JOINTS_SET: readonly JointName[] = ['hips', 'chest', 'neck', 'head', 'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR', 'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR'];
/** The pose returned (written in place each call: the Animator reads it at once). */
const OUT: Pose = Object.fromEntries(JOINTS_SET.map((n) => [n, { rx: 0, ry: 0, rz: 0, px: 0, py: 0, pz: 0 }])) as Pose;

const ONE = new Vector3(1, 1, 1);
const _e = new Euler();
const _q = new Quaternion();
const _v = new Vector3();
const _a = new Vector3();
const _t = new Vector3();
const _mh = new Matrix4();

/** Two-bone leg IK in the side plane: the thigh's angle and the knee's bend that put the ankle `dy`, `dz` from the hip joint. */
function legIK(dy: number, dz: number): [number, number] {
  const d = Math.min(THIGH + SHIN - 1e-3, Math.max(Math.abs(THIGH - SHIN) + 1e-3, Math.sqrt(dy * dy + dz * dz)));
  const bend = Math.acos(clamp((d * d - THIGH * THIGH - SHIN * SHIN) / (2 * THIGH * SHIN), -1, 1));
  const aim = Math.atan2(-dz, -dy);
  return [aim - Math.atan2(SHIN * Math.sin(bend), THIGH + SHIN * Math.cos(bend)), bend - SHIN_LEAN];
}

function set(j: JointName, rx = 0, ry = 0, rz = 0, px = 0, py = 0, pz = 0): JointPose {
  const o = OUT[j]!;
  o.rx = rx;
  o.ry = ry;
  o.rz = rz;
  o.px = px;
  o.py = py;
  o.pz = pz;
  return o;
}

/** The middle between his fists (chest space, BU): where the fruit he holds out goes. */
export function shareMiddle(s: ShareState, out: Vector3): Vector3 {
  return out.set(0, HANDS.y - s.low, HANDS.z);
}

/** His body giving with both hands, as `s` says (written into one pose object, returned). */
export function sharePose(s: ShareState): Pose {
  const k = smooth(s.crouch);
  const bow = smooth(s.bow);
  const reach = smooth(s.reach);
  const breath = Math.sin(s.t * 1.6) * 0.012;
  // The hips: down and back on his haunches, tipped forward; a little of the bow.
  const tilt = SQUAT.hips * k + BOW.hips * bow;
  set('hips', tilt, 0, 0, 0, (SQUAT.height - REST_HIPS[1]) * k, (SQUAT.back - REST_HIPS[2]) * k);
  set('chest', SQUAT.chest * k + BOW.chest * bow + breath);
  // The legs: the feet stay where they stood, flat (the hips' turn taken back out of the thighs).
  _mh.compose(_v.set(REST_HIPS[0], REST_HIPS[1] + (SQUAT.height - REST_HIPS[1]) * k, REST_HIPS[2] + (SQUAT.back - REST_HIPS[2]) * k), _q.setFromEuler(_e.set(tilt, 0, 0)), ONE);
  for (const side of ['L', 'R'] as const) {
    const out = side === 'L' ? 1 : -1;
    _a.copy(HIP_L).applyMatrix4(_mh);
    const [thigh, knee] = legIK(ANKLE[1] - _a.y, ANKLE[2] - _a.z);
    const th = mix(0, thigh, k);
    const kn = mix(0, knee, k);
    set(`hip${side}`, th - tilt, out * SQUAT.turn * k, out * SQUAT.splay * k);
    set(`knee${side}`, kn);
    set(`ankle${side}`, -(th + kn), 0, -out * SQUAT.splay * k);
  }
  // The head: to them, tipped down (less of it while bowing: the bow tips it already).
  set('neck', BOW.neck * bow + 0.3 * s.lookDown, 0.3 * s.lookYaw);
  set('head', 0.7 * s.lookDown + 0.03 * Math.sin(s.t * 0.9), 0.7 * s.lookYaw);
  // The arms: from hanging to the fists either side of the middle.
  shareMiddle(s, _t);
  for (const side of ['L', 'R'] as const) {
    const x = side === 'L' ? s.gap : -s.gap;
    _v.set(_t.x + x, _t.y, _t.z);
    const ik = solveArm(side, _v, POLE[side], _a.copy(SHRUG[side]).multiplyScalar(reach));
    const sh = ik[`shoulder${side}`]!;
    const el = ik[`elbow${side}`]!;
    const free = side === 'L' ? 1 : -1;
    set(`shoulder${side}`, mix(0.02, sh.rx ?? 0, reach), mix(0, sh.ry ?? 0, reach), mix(0.05 * free, sh.rz ?? 0, reach), (sh.px ?? 0) * reach, (sh.py ?? 0) * reach, (sh.pz ?? 0) * reach);
    set(`elbow${side}`, mix(-0.1, el.rx ?? 0, reach));
    // (the fists turned in a little, knuckles out: holding it from either side)
    set(`wrist${side}`, 0, 0, -free * 0.35 * reach);
  }
  return OUT;
}

const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (v: number) => {
  const c = Math.min(1, Math.max(0, v));
  return c * c * (3 - 2 * c);
};
