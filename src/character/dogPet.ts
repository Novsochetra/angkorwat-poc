import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { solveArm } from './Animator';
import type { JointPose, Pose } from './pose';
import { JOINTS, type JointName } from './skeleton';

/**
 * Petting the dog (the map's roam/_dog.ts): he squats down in front of it,
 * knees out (his belly is round), leaning in, and his right hand pats its
 * head (or scratches behind an ear in small circles) while his left rests
 * on his knee; he looks at it. A posture for `Animator.posture` with
 * `postureFeet` left on: the Animator plants his soles, the legs bend by IK
 * so the feet stay where they stood and lie flat.
 *
 * One number says how far down he is (`crouch`, 0 standing ‥ 1 squatting);
 * the hand's target and where he looks come from the dog's head each frame
 * (the add-on: his space, body units, +z ahead, +x his left, from the
 * ground between his feet), the pat's lift and the scratch's circles from
 * the add-on's clock.
 */
export interface DogPetState {
  /** 0 standing ‥ 1 squatting by the dog. */
  crouch: number;
  /** The dog's head where his right fist goes (his space, BU), and how far the hand is there (0: hanging ‥ 1: on it). */
  hand: Vector3;
  reach: number;
  /** The hand lifted off the head for the next pat (0 on it ‥ 1 up). */
  lift: number;
  /** Scratching behind its ear (0 ‥ 1: small circles), the circles' phase (radians). */
  rub: number;
  rubPhase: number;
  /** Where he looks (his space, BU). */
  look: Vector3;
  /** Seconds (his breathing). */
  t: number;
}

export const newDogPet = (): DogPetState => ({ crouch: 0, hand: new Vector3(0, 9, 9), reach: 0, lift: 0, rub: 0, rubPhase: 0, look: new Vector3(0, 8, 10), t: 0 });

/** The squat (BU, radians): the hips joint this high and this far back, the pelvis and the chest tipped forward, knees out, the feet turned out. */
const SQUAT = { height: 6.4, back: -1.5, hips: 0.24, chest: 0.12, splay: 0.24, turn: 0.2 };
/** The pat's lift (BU up off the head), the scratch's circle (BU), the fist's middle over the head's top (BU: the hand's thickness). */
const LIFT = 2.4;
const RUB = 0.7;
const OVER = 1.0;
/** The most his neck and head tip down past the body's lean (radians). */
const LOOK_DOWN = 0.12;
/** Elbows: the right out and down (chest space), the left out over the knee. */
const POLE_R = new Vector3(-0.75, -0.35, -0.55).normalize();
const POLE_L = new Vector3(0.9, -0.1, -0.4).normalize();
/** The right shoulder coming forward and up as he reaches out (chest space, BU). */
const SHRUG = new Vector3(0.3, 0.35, 1.5);
/** The left fist on the left knee: this far up the thigh from the knee (share), this high over it (BU). */
const KNEE_HAND = { along: 0.18, up: 1.7 };

const REST_HIPS = JOINTS.hips.pivot;
const THIGH = JOINTS.hipL.pivot[1] - JOINTS.kneeL.pivot[1];
const SHIN = Math.hypot(JOINTS.kneeL.pivot[1] - JOINTS.ankleL.pivot[1], JOINTS.kneeL.pivot[2] - JOINTS.ankleL.pivot[2]);
const SHIN_LEAN = Math.atan2(JOINTS.kneeL.pivot[2] - JOINTS.ankleL.pivot[2], JOINTS.kneeL.pivot[1] - JOINTS.ankleL.pivot[1]);
const ANKLE = JOINTS.ankleL.pivot;

const REST_LOCAL = Object.fromEntries(
  (Object.keys(JOINTS) as JointName[]).map((n) => {
    const p = JOINTS[n].parent;
    const pv = JOINTS[n].pivot;
    const pp = p ? JOINTS[p].pivot : [0, 0, 0];
    return [n, new Vector3(pv[0] - pp[0], pv[1] - pp[1], pv[2] - pp[2])];
  }),
) as Record<JointName, Vector3>;

const ONE = new Vector3(1, 1, 1);
const _e = new Euler();
const _q = new Quaternion();
const _v = new Vector3();
const _t = new Vector3();
const _k = new Vector3();
const _sh = new Vector3();
const _a = new Vector3();
const _mh = new Matrix4();
const _mc = new Matrix4();
const _ml = new Matrix4();
const _mk = new Matrix4();
const _m = new Matrix4();
const _inv = new Matrix4();

/** A joint's transform from its parent under `jp` (as the Animator applies a pose). */
function local(name: JointName, jp: JointPose | undefined, out: Matrix4): Matrix4 {
  _v.copy(REST_LOCAL[name]);
  if (jp) _v.set(_v.x + (jp.px ?? 0), _v.y + (jp.py ?? 0), _v.z + (jp.pz ?? 0));
  _q.setFromEuler(_e.set(jp?.rx ?? 0, jp?.ry ?? 0, jp?.rz ?? 0));
  return out.compose(_v, _q, ONE);
}

/** Two-bone leg IK in the side plane: the thigh's angle in the world and the knee's bend that put the ankle `dy`, `dz` from the hip joint. */
function legIK(dy: number, dz: number): [number, number] {
  const d = Math.min(THIGH + SHIN - 1e-3, Math.max(Math.abs(THIGH - SHIN) + 1e-3, Math.hypot(dy, dz)));
  const bend = Math.acos(clamp((d * d - THIGH * THIGH - SHIN * SHIN) / (2 * THIGH * SHIN), -1, 1));
  const aim = Math.atan2(-dz, -dy);
  return [aim - Math.atan2(SHIN * Math.sin(bend), THIGH + SHIN * Math.cos(bend)), bend - SHIN_LEAN];
}

/** His body squatting by the dog, as far down as `s.crouch`, the right hand on its head. */
export function dogPetPose(s: DogPetState): Pose {
  const k = smooth(s.crouch);
  const breath = Math.sin(s.t * 1.6) * 0.015 * k;
  const pose: Pose = {};
  // The hips down and back, the body tipped forward over his knees.
  const tilt = SQUAT.hips * k;
  pose.hips = { rx: tilt, py: (SQUAT.height - REST_HIPS[1]) * k, pz: (SQUAT.back - REST_HIPS[2]) * k };
  pose.chest = { rx: SQUAT.chest * k + breath };
  _mh.compose(_v.set(REST_HIPS[0], REST_HIPS[1] + pose.hips.py!, REST_HIPS[2] + pose.hips.pz!), _q.setFromEuler(_e.set(tilt, 0, 0)), ONE);
  // The legs: the feet stay where they stood, flat; the knees out.
  for (const side of ['L', 'R'] as const) {
    const out = side === 'L' ? 1 : -1;
    _a.copy(REST_LOCAL[`hip${side}`]).applyMatrix4(_mh);
    const [thigh, knee] = legIK(ANKLE[1] - _a.y, ANKLE[2] - _a.z);
    pose[`hip${side}`] = { rx: mix(0, thigh, k) - tilt, rz: out * SQUAT.splay * k, ry: out * SQUAT.turn * k };
    pose[`knee${side}`] = { rx: mix(0, knee, k) };
    pose[`ankle${side}`] = { rx: -(mix(0, thigh, k) + mix(0, knee, k)), rz: -out * SQUAT.splay * k };
  }
  // Looking at the dog: the neck and head turn and tip toward where he looks (his space).
  _mc.multiplyMatrices(_mh, local('chest', pose.chest, _m));
  // (his eyes are about 4.5 BU over the neck joint)
  const ex = _v.copy(REST_LOCAL.neck).applyMatrix4(_mc);
  const dx = s.look.x - ex.x;
  const dy = s.look.y - (ex.y + 4.5);
  const dz = s.look.z - ex.z;
  const yaw = clamp(Math.atan2(dx, Math.max(0.5, dz)), -0.9, 0.9);
  // (his head is big and his hat's brim wide: he looks down with his eyes more than his head, so his face shows)
  const pitch = clamp(clamp(Math.atan2(-dy, Math.hypot(dx, dz)), -0.4, 1.1) * 0.45 - SQUAT.hips * k - SQUAT.chest * k, -0.3, LOOK_DOWN);
  pose.neck = { rx: 0.35 * pitch * k, ry: 0.3 * yaw * k };
  pose.head = { rx: 0.65 * pitch * k + 0.04 * Math.sin(s.t * 0.9) * k, ry: 0.7 * yaw * k, rz: -0.1 * k };

  // Arms in the chest's space.
  _inv.copy(_mc).invert();
  // The left fist resting on the left knee.
  _ml.multiplyMatrices(_mh, local('hipL', pose.hipL, _m));
  _mk.multiplyMatrices(_ml, local('kneeL', pose.kneeL, _m));
  _k.setFromMatrixPosition(_mk).lerp(_a.setFromMatrixPosition(_ml), KNEE_HAND.along);
  _k.y += KNEE_HAND.up;
  const restL: Pose = { shoulderL: { rx: 0.02, rz: 0.06 }, elbowL: { rx: -0.12 }, wristL: {} };
  blendArm(restL, solveArm('L', _k.applyMatrix4(_inv), POLE_L), k, 'L', pose);
  // The right fist on its head: lifted between pats, round in small circles behind the ear.
  _t.copy(s.hand);
  _t.y += OVER + LIFT * s.lift;
  _t.x += Math.cos(s.rubPhase) * RUB * s.rub;
  _t.z += Math.sin(s.rubPhase) * RUB * s.rub;
  const restR: Pose = { shoulderR: { rx: 0.02, rz: -0.06 }, elbowR: { rx: -0.12 }, wristR: {} };
  // (reaching out, the shoulder comes forward)
  const arm = solveArm('R', _t.applyMatrix4(_inv), POLE_R, _sh.copy(SHRUG).multiplyScalar(clamp(s.reach, 0, 1)));
  // (the palm turned down onto its head)
  arm.wristR = { rx: 0.35, rz: 1.1 };
  blendArm(restR, arm, k * clamp(s.reach, 0, 1), 'R', pose);
  return pose;
}

/** Arms between hanging free and the IK (`k` of the way), into `pose`. */
function blendArm(free: Pose, ik: Pose, k: number, side: 'L' | 'R', pose: Pose): void {
  for (const j of [`shoulder${side}`, `elbow${side}`, `wrist${side}`] as JointName[]) {
    const a = free[j] ?? {};
    const b = ik[j] ?? {};
    pose[j] = {
      rx: mix(a.rx ?? 0, b.rx ?? 0, k),
      ry: mix(a.ry ?? 0, b.ry ?? 0, k),
      rz: mix(a.rz ?? 0, b.rz ?? 0, k),
    };
  }
}

const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (v: number) => {
  const c = Math.min(1, Math.max(0, v));
  return c * c * (3 - 2 * c);
};
