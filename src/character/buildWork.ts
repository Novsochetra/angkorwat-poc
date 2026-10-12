import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { VoxelBuilder } from '../voxel/VoxelBuilder';
import { solveArm } from './Animator';
import type { JointPose, Pose } from './pose';
import { JOINTS, type JointName } from './skeleton';

/**
 * Building at home (the map's roam/_build*.ts): he hammers at the piece he is
 * putting up — the right fist swings a carpenter's hammer up over his shoulder
 * and down onto the work, his left hand steadies it beside the blow, he looks
 * at it; for low work (a bed's frame, a fence's foot, a jar's stand) he squats,
 * for high work (a shelter's beams, a lamp's post) he stands and reaches. As
 * the piece rises the work rises with it (`work.y`).
 *
 * A posture for `Animator.posture` with `postureFeet` left on (as dogPet.ts):
 * the Animator plants his soles, the legs bend by IK so the feet stay where
 * they stood. Arms by IK (`solveArm`), the hammer's handle aimed by the wrist
 * (it points back over his shoulder raised, forward with its face down at the
 * blow).
 *
 * The blow comes once a `STROKE` s, at `HIT` of the way through it (the add-on
 * plays the knock then). Units: body units (BU) in his space (+z ahead, +x his
 * left, y up from his soles).
 */
export interface BuildPoseState {
  /** 0 standing as he walks ‥ 1 at his work (eased in and out by the caller). */
  k: number;
  /** Seconds into the work (the strokes). */
  t: number;
  /** Where the hammer's head lands (his space, BU). */
  work: Vector3;
  /** 0: he hammers (strokes); 1: he holds still, looking (a pause: the blows stop where they are). */
  still: number;
}

export const newBuildPose = (): BuildPoseState => ({ k: 0, t: 0, work: new Vector3(-1, 10, 9), still: 0 });

/** One stroke (s) and where in it the head lands (0‥1). */
export const STROKE = 0.62;
export const HIT = 0.74;
/** The hammer: its handle's length to the middle of its head (BU, his size), from the fist's middle. */
export const HAMMER_REACH = 5.2;

/** The squat for low work (as dogPet.ts: BU, radians). */
const SQUAT = { height: 6.6, back: -1.4, hips: 0.26, chest: 0.16, splay: 0.22, turn: 0.18 };
/** Standing, bent a little at the hips over his work (radians). */
const STAND = { hips: 0.08, chest: 0.1 };
/** Work this low (BU over his soles) has him squatting; from this high he stands. */
const LOW = 5;
const HIGH = 12;
/** The raised fist (his space, BU, over his right shoulder: −x), standing and squatting. */
const RAISED = { stand: new Vector3(-6.2, 23.5, 1.8), squat: new Vector3(-6, 16, 3) };
/** The handle's way, raised (back over his shoulder) and at the blow (forward, the face down), his space. */
const AIM_UP = new Vector3(0, 0.55, -1).normalize();
const AIM_HIT = new Vector3(0.05, -0.2, 1).normalize();
/** The left hand steadies the work: this far left of the blow, nearer him, a little over it (BU). */
const STEADY = new Vector3(2.6, 1.2, -1.2);
/** Elbows: the right out and down (chest space), the left out. */
const POLE_R = new Vector3(-0.8, -0.45, -0.4).normalize();
const POLE_L = new Vector3(0.85, -0.3, -0.45).normalize();

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
const _a = new Vector3();
const _t = new Vector3();
const _l = new Vector3();
const _d = new Vector3();
const _mh = new Matrix4();
const _mc = new Matrix4();
const _m = new Matrix4();
const _m2 = new Matrix4();
const _inv = new Matrix4();
const _rot = new Matrix4();

/** A joint's transform from its parent under `jp` (as the Animator applies a pose). */
function local(name: JointName, jp: JointPose | undefined, out: Matrix4): Matrix4 {
  _v.copy(REST_LOCAL[name]);
  if (jp) _v.set(_v.x + (jp.px ?? 0), _v.y + (jp.py ?? 0), _v.z + (jp.pz ?? 0));
  _q.setFromEuler(_e.set(jp?.rx ?? 0, jp?.ry ?? 0, jp?.rz ?? 0));
  return out.compose(_v, _q, ONE);
}

/** Two-bone leg IK in the side plane (as dogPet.ts). */
function legIK(dy: number, dz: number): [number, number] {
  const d = Math.min(THIGH + SHIN - 1e-3, Math.max(Math.abs(THIGH - SHIN) + 1e-3, Math.sqrt(dy * dy + dz * dz)));
  const bend = Math.acos(clamp((d * d - THIGH * THIGH - SHIN * SHIN) / (2 * THIGH * SHIN), -1, 1));
  const aim = Math.atan2(-dz, -dy);
  return [aim - Math.atan2(SHIN * Math.sin(bend), THIGH + SHIN * Math.cos(bend)), bend - SHIN_LEAN];
}

/** Where the fist is in the stroke (0 at the blow ‥ 1 raised) at `u` (0‥1 of a stroke). */
export function strokeLift(u: number): number {
  // (from the blow: a small bounce off the work, up again, a moment at the top, then down fast onto it)
  const q = (((u - HIT) % 1) + 1) % 1;
  if (q < 0.08) return 0.06 * Math.sin((q / 0.08) * Math.PI);
  if (q < 0.7) return smooth((q - 0.08) / 0.62);
  if (q < 0.8) return 1;
  const k = (q - 0.8) / 0.2;
  return 1 - k * k;
}

/** His body at his work (`s`); the returned pose is new each call (the Animator blends it). */
export function buildPose(s: BuildPoseState): Pose {
  const k = smooth(s.k);
  const low = clamp((HIGH - s.work.y) / (HIGH - LOW), 0, 1);
  const c = smooth(low) * k;
  const pose: Pose = {};
  const breath = Math.sin(s.t * 1.7) * 0.015 * k;
  // The hips down and back (squatting for low work), the body tipped forward over the work.
  const tilt = (SQUAT.hips * c + STAND.hips * (1 - c)) * k;
  pose.hips = { rx: tilt, py: (SQUAT.height - REST_HIPS[1]) * c, pz: (SQUAT.back - REST_HIPS[2]) * c };
  pose.chest = { rx: (SQUAT.chest * c + STAND.chest * (1 - c)) * k + breath };
  _mh.compose(_v.set(REST_HIPS[0], REST_HIPS[1] + pose.hips.py!, REST_HIPS[2] + pose.hips.pz!), _q.setFromEuler(_e.set(tilt, 0, 0)), ONE);
  // The legs: the feet stay where they stood, flat; the knees out as he squats.
  for (const side of ['L', 'R'] as const) {
    const out = side === 'L' ? 1 : -1;
    _a.copy(REST_LOCAL[`hip${side}`]).applyMatrix4(_mh);
    const [thigh, knee] = legIK(ANKLE[1] - _a.y, ANKLE[2] - _a.z);
    pose[`hip${side}`] = { rx: thigh - tilt, rz: out * SQUAT.splay * c, ry: out * SQUAT.turn * c };
    pose[`knee${side}`] = { rx: knee };
    pose[`ankle${side}`] = { rx: -(thigh + knee), rz: -out * SQUAT.splay * c };
  }
  // He looks at the work.
  _mc.multiplyMatrices(_mh, local('chest', pose.chest, _m));
  const ex = _v.copy(REST_LOCAL.neck).applyMatrix4(_mc);
  const dx = s.work.x - ex.x;
  const dy = s.work.y - (ex.y + 4.5);
  const dz = s.work.z - ex.z;
  const yaw = clamp(Math.atan2(dx, Math.max(0.5, dz)), -0.8, 0.8);
  const pitch = clamp(clamp(Math.atan2(-dy, Math.sqrt(dx * dx + dz * dz)), -0.4, 1.1) * 0.5 - tilt - (pose.chest.rx ?? 0), -0.3, 0.3);
  pose.neck = { rx: 0.35 * pitch * k, ry: 0.3 * yaw * k };
  pose.head = { rx: 0.65 * pitch * k, ry: 0.6 * yaw * k };

  // Arms, in the chest's space.
  _inv.copy(_mc).invert();
  // The right fist: raised over his shoulder, down onto the work (the head lands there: the fist a handle back).
  const lift = strokeLift(s.t / STROKE) * (1 - s.still);
  _d.copy(AIM_UP).lerp(AIM_HIT, 1 - lift).normalize();
  _t.copy(s.work).addScaledVector(_d, -HAMMER_REACH);
  _l.copy(RAISED.stand).lerp(RAISED.squat, c);
  _t.lerp(_l, smooth(lift));
  const restR: Pose = { shoulderR: { rx: 0.02, rz: -0.06 }, elbowR: { rx: -0.12 }, wristR: {} };
  const armR = solveArm('R', _t.applyMatrix4(_inv), POLE_R);
  // (the wrist turns the handle the way it should go: about the forearm's own x)
  armR.wristR = { rx: wristToward('R', armR, _v.copy(_d).transformDirection(_inv)) };
  blendArm(restR, armR, k, 'R', pose);
  // The left hand steadying the work beside the blow.
  _t.copy(s.work).add(STEADY);
  _t.y = Math.max(_t.y, 2);
  const restL: Pose = { shoulderL: { rx: 0.02, rz: 0.06 }, elbowL: { rx: -0.12 }, wristL: {} };
  const armL = solveArm('L', _t.applyMatrix4(_inv), POLE_L);
  armL.wristL = { rx: 0.3, rz: -0.5 };
  blendArm(restL, armL, k, 'L', pose);
  return pose;
}

/** The wrist's turn (rx) that points the fist's grip axis (+z of the prop) along `dir` (chest space) as near as it can. */
function wristToward(side: 'L' | 'R', arm: Pose, dir: Vector3): number {
  const sh = arm[`shoulder${side}`]!;
  _m2.makeRotationFromEuler(_e.set(sh.rx ?? 0, sh.ry ?? 0, sh.rz ?? 0, 'XYZ'));
  _m2.multiply(_rot.makeRotationX(arm[`elbow${side}`]!.rx ?? 0));
  // (the way in the forearm's own frame: the wrist turns about its x)
  _a.copy(dir).applyMatrix4(_m2.transpose());
  return clamp(Math.atan2(-_a.y, _a.z), -1.5, 1.5);
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
      px: mix(a.px ?? 0, b.px ?? 0, k),
      py: mix(a.py ?? 0, b.py ?? 0, k),
      pz: mix(a.pz ?? 0, b.pz ?? 0, k),
    };
  }
}

const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (v: number) => {
  const c = Math.min(1, Math.max(0, v));
  return c * c * (3 - 2 * c);
};

/**
 * His hammer (ញញួរ), in his hand's frame (BU at his size: the fist's middle at the origin, the handle along +z out
 * of it, as the torch's, parts/props.ts): a worn wooden handle, an iron head across its end, its face down (−y)
 * and its claw up, as a carpenter's.
 */
export function hammerBuilder(): VoxelBuilder {
  const b = new VoxelBuilder();
  const L = HAMMER_REACH;
  const r = 0.36;
  const wood = [0x9a6a3e, 0x8a5c34, 0xa8784a];
  for (let i = 0; i < 6; i++) {
    const z0 = -1.4 + ((L + 1.4) * i) / 6;
    const z1 = -1.4 + ((L + 1.4) * (i + 1)) / 6;
    b.span(-r, -r, z0, r, r, z1 + 0.02, wood[i % 3], 'wood');
  }
  // (the head: an iron block across the handle's end, a darker face below, the claw above)
  b.span(-0.5, -1.7, L - 0.55, 0.5, 0.75, L + 0.55, 0x6e7276, 'metal');
  b.span(-0.56, -2.2, L - 0.6, 0.56, -1.6, L + 0.6, 0x50545a, 'metal');
  b.span(-0.4, 0.75, L - 0.4, 0.4, 1.7, L + 0.15, 0x7e8288, 'metal', { rx: 0.35 });
  b.span(-0.52, -1.0, L - 0.62, 0.52, -0.6, L + 0.62, 0x8a8e94, 'metal');
  return b;
}
