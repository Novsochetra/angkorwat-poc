import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { solveArm } from '../../character/Animator';
import type { JointPose, Pose } from '../../character/pose';
import { JOINTS, type JointName } from '../../character/skeleton';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { GatherAction } from '../build/materials';

/**
 * Gathering's swing (roam/_gather.ts): one hit is one swing, as a villager cuts
 * bamboo or digs a clay bank.
 *
 * - **chop** (`phkak`): the Khmer long-handled chopping knife (កាំបិតផ្គាក់: a
 *   wooden handle, the blade bent forward at its end) in his right fist, raised
 *   up over his right shoulder and brought down at a slant onto the cane, the log
 *   or the frond; his left hand holds the cane above the cut (`STEADY`); bent at
 *   the hips, half crouched for a cut low down.
 * - **dig** (`hoe`): the hoe (ចប) in both hands, the right at the handle's end, the
 *   left further along; raised high over his head and swung down so its blade
 *   bites into the earth before his feet; he stands, feet apart, and bends into
 *   the blow.
 *
 * A posture for `Animator.posture` with `postureFeet` left on (as character/
 * buildWork.ts, which this follows): the Animator plants his soles; the legs bend
 * by IK. Arms by IK (`solveArm`), the tool's way set by the wrist (the handle up
 * behind his shoulder raised, pointing at the work at the blow). Between hits he
 * holds the tool low and ready (`READY`).
 *
 * Timing (`SWING`): a swing is `len` s; the blow lands at `hit` (the add-on plays
 * the sound, throws the chips and counts the hit then). Units: body units (BU,
 * 7.35 cm on the map) in his space (+z ahead, +x his left, y up from his soles).
 */

export interface GatherPoseState {
  action: GatherAction;
  /** 0 standing as he walks ‥ 1 at his work (eased by the caller). */
  k: number;
  /** Seconds into the swing under way, or −1 between swings (held ready). */
  s: number;
  /** Seconds at the work (breathing). */
  life: number;
  /** Where the blade lands (his space, BU). */
  work: Vector3;
}

export const newGatherPose = (): GatherPoseState => ({ action: 'chop', k: 0, s: -1, life: 0, work: new Vector3(-1, 6, 10) });

/** A swing: its length, when the tool is up (s), and when it lands (s). */
export const SWING: Record<GatherAction, { readonly len: number; readonly up: number; readonly hit: number }> = {
  chop: { len: 0.7, up: 0.3, hit: 0.44 },
  dig: { len: 0.86, up: 0.38, hit: 0.56 },
};

/**
 * Each action's tool and body (BU, radians): the fist's reach to the blade's middle along the handle; the blade
 * under the handle's line; the handle's slant at the blow (a share of the slant from the shoulder to the work); the
 * raised fist from the shoulder; the backswing; how low he crouches at most; how far he bends; the left hand.
 */
const TOOL = {
  chop: { reach: 10.4, face: 3.7, slant: 0.55, raised: new Vector3(-1.2, 5.6, 0.4), back: 2.0, crouch: 0.55, hips: 0.22, chest: 0.16, blowBend: 0.1 },
  dig: { reach: 13.6, face: 4.1, slant: 0.9, raised: new Vector3(-0.2, 7.4, 0.6), back: 2.25, crouch: 0, hips: 0.12, chest: 0.12, blowBend: 0.32 },
} as const;
/** The left fist on the hoe's handle: this far along it from the right (BU). */
const HOE_LEFT = 5.2;
/** Between swings the tool is held low before him: this much of the way up. */
const READY = 0.18;
/** The squat for a cut low down (as buildWork.ts: flat-footed, hips down and back, knees wide). */
const SQUAT = { height: 4.9, back: -1.75, splay: 0.42, turn: 0.22 };
/** A blade this low (BU over his soles) has him crouching as far as he does; from this high he stands. */
const LOW = 6;
const HIGH = 13;
/** The left hand holds the cane: this far left of the cut, nearer him, above it (BU). */
const STEADY = new Vector3(2.4, 4.2, -0.8);
const POLE_R = new Vector3(-0.35, -1, -0.15).normalize();
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
const UP = new Vector3(0, 1, 0);
const _e = new Euler();
const _q = new Quaternion();
const _v = new Vector3();
const _a = new Vector3();
const _t = new Vector3();
const _l = new Vector3();
const _d = new Vector3();
const _h = new Vector3();
const _x = new Vector3();
const _y = new Vector3();
const _mh = new Matrix4();
const _mc = new Matrix4();
const _m = new Matrix4();
const _m2 = new Matrix4();
const _inv = new Matrix4();
const _rot = new Matrix4();

function local(name: JointName, jp: JointPose | undefined, out: Matrix4): Matrix4 {
  _v.copy(REST_LOCAL[name]);
  if (jp) _v.set(_v.x + (jp.px ?? 0), _v.y + (jp.py ?? 0), _v.z + (jp.pz ?? 0));
  _q.setFromEuler(_e.set(jp?.rx ?? 0, jp?.ry ?? 0, jp?.rz ?? 0));
  return out.compose(_v, _q, ONE);
}

function legIK(dy: number, dz: number): [number, number] {
  const d = Math.min(THIGH + SHIN - 1e-3, Math.max(Math.abs(THIGH - SHIN) + 1e-3, Math.sqrt(dy * dy + dz * dz)));
  const bend = Math.acos(clamp((d * d - THIGH * THIGH - SHIN * SHIN) / (2 * THIGH * SHIN), -1, 1));
  const aim = Math.atan2(-dz, -dy);
  return [aim - Math.atan2(SHIN * Math.sin(bend), THIGH + SHIN * Math.cos(bend)), bend - SHIN_LEAN];
}

/** How far up the tool is (0 at the blow ‥ 1 raised) `s` s into a swing of `a` (−1: held ready between swings). */
export function swingLift(a: GatherAction, s: number): number {
  const w = SWING[a];
  if (s < 0 || s >= w.len) return READY;
  if (s < w.up) return READY + (1 - READY) * smooth(s / w.up);
  // (a moment at the top, then down fast onto the work)
  const top = w.up + (w.hit - w.up) * 0.35;
  if (s < top) return 1;
  if (s < w.hit) {
    const k = (s - top) / (w.hit - top);
    return 1 - k * k;
  }
  // (a small bounce off it, then back to ready)
  const after = (s - w.hit) / (w.len - w.hit);
  if (after < 0.3) return 0.07 * Math.sin((after / 0.3) * Math.PI);
  return READY * smooth((after - 0.3) / 0.7);
}

/** His body at the work (`p`); a new pose each call (the Animator blends it). */
export function gatherPose(p: GatherPoseState): Pose {
  const k = smooth(p.k);
  const T = TOOL[p.action];
  const lift = smooth(swingLift(p.action, p.s));
  const blow = 1 - lift;
  const low = clamp((HIGH - p.work.y) / (HIGH - LOW), 0, 1);
  const c = smooth(low) * T.crouch * k;
  const pose: Pose = {};
  const breath = Math.sin(p.life * 1.7) * 0.015 * k;
  // The hips down and back as he crouches, the body bent over the work, more at the blow.
  const tilt = (T.hips + T.blowBend * blow * 0.6 + 0.2 * c) * k;
  pose.hips = { rx: tilt, py: (SQUAT.height - REST_HIPS[1]) * c, pz: (SQUAT.back - REST_HIPS[2]) * c };
  pose.chest = { rx: (T.chest + T.blowBend * blow * 0.4) * k + breath, ry: -0.18 * lift * k };
  _mh.compose(_v.set(REST_HIPS[0], REST_HIPS[1] + pose.hips.py!, REST_HIPS[2] + pose.hips.pz!), _q.setFromEuler(_e.set(tilt, 0, 0)), ONE);
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
  const dx = p.work.x - ex.x;
  const dy = p.work.y - (ex.y + 4.5);
  const dz = p.work.z - ex.z;
  const yaw = clamp(Math.atan2(dx, Math.max(0.5, dz)), -0.8, 0.8);
  const pitch = clamp(clamp(Math.atan2(-dy, Math.sqrt(dx * dx + dz * dz)), -0.4, 1.1) * 0.5 - tilt - (pose.chest.rx ?? 0), -0.3, 0.35);
  pose.neck = { rx: 0.35 * pitch * k, ry: 0.3 * yaw * k };
  pose.head = { rx: 0.65 * pitch * k, ry: 0.6 * yaw * k };

  _inv.copy(_mc).invert();
  // The right fist: the tool's handle at the blow points at the work from his shoulder, slanting down (a share of the
  // slant from the shoulder to the work), its blade down on it; raised, turned back about the line across his shoulders.
  const sh = _a.copy(REST_LOCAL.shoulderR).applyMatrix4(_mc);
  _h.set(p.work.x - sh.x, 0, p.work.z - sh.z);
  const flat = _h.length();
  if (flat < 1e-2) _h.set(0, 0, 1);
  _h.normalize();
  const tiltAt = clamp(Math.atan2(sh.y - p.work.y, Math.max(1, flat)) * T.slant, 0.1, 1.25);
  _d.copy(_h).multiplyScalar(Math.cos(tiltAt)).addScaledVector(UP, -Math.sin(tiltAt));
  _y.copy(_h).multiplyScalar(Math.sin(tiltAt)).addScaledVector(UP, Math.cos(tiltAt));
  _t.copy(p.work).addScaledVector(_d, -T.reach).addScaledVector(_y, T.face);
  _l.copy(sh).add(T.raised);
  _t.lerp(_l, lift);
  _x.crossVectors(_d, UP).normalize();
  _q.setFromAxisAngle(_x, T.back * lift);
  _d.applyQuaternion(_q);
  _y.applyQuaternion(_q);
  // (the left fist on the hoe's handle, along it from the right: before the frames go to the chest's space)
  const hoeL = _l.copy(_t).addScaledVector(_d, HOE_LEFT);
  const armR: Pose = solveArm('R', _a.copy(_t).applyMatrix4(_inv), POLE_R);
  _d.transformDirection(_inv);
  _y.transformDirection(_inv);
  _x.crossVectors(_y, _d).normalize();
  _y.crossVectors(_d, _x);
  _rot.makeBasis(_x, _y, _d);
  forearmOf(armR, _m2).transpose().multiply(_rot);
  _e.setFromRotationMatrix(_m2, 'XYZ');
  armR.wristR = { rx: _e.x, ry: _e.y, rz: _e.z };
  blendArm({ shoulderR: { rx: 0.02, rz: -0.06 }, elbowR: { rx: -0.12 }, wristR: {} }, armR, k, 'R', pose);
  // The left hand: on the hoe's handle, or holding the cane above the cut.
  if (p.action === 'dig') _t.copy(hoeL);
  else {
    _t.copy(p.work).add(STEADY);
    _t.y = Math.max(_t.y, 3);
  }
  const armL = solveArm('L', _t.applyMatrix4(_inv), POLE_L);
  armL.wristL = p.action === 'dig' ? { rx: 0.1, rz: -0.3 } : { rx: 0.3, rz: -0.5 };
  blendArm({ shoulderL: { rx: 0.02, rz: 0.06 }, elbowL: { rx: -0.12 }, wristL: {} }, armL, k, 'L', pose);
  return pose;
}

function forearmOf(arm: Pose, out: Matrix4): Matrix4 {
  const sh = arm.shoulderR!;
  out.makeRotationFromEuler(_e.set(sh.rx ?? 0, sh.ry ?? 0, sh.rz ?? 0, 'XYZ'));
  return out.multiply(_m.makeRotationX(arm.elbowR!.rx ?? 0));
}

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
 * The tool for his right prop slot (`rig.setSlot(…, 'propR', …)`), made in his hand's frame (BU: the fist's middle at
 * the origin, the handle along +z out of it, the blade's edge down, −y, as the hammer's face in buildWork.ts), then
 * moved to the fist's grip (`JOINTS.propR.pivot`).
 * - chop: the phkak, a worn wooden handle and an iron blade bent forward off its end, its edge bright.
 * - dig: the hoe, a long handle and a broad iron blade across its end, curling back toward him.
 */
export function gatherToolBuilder(a: GatherAction): VoxelBuilder {
  const b = new VoxelBuilder();
  const wood = [0x9a6a3e, 0x8a5c34, 0xa8784a];
  if (a === 'chop') {
    // (big enough to read on the map, where he is 2.4 m tall: the handle 0.75 m, the blade a hand and a half deep)
    const L = TOOL.chop.reach;
    const r = 0.42;
    for (let i = 0; i < 6; i++) {
      const z0 = -1.8 + ((L - 0.8 + 1.8) * i) / 6;
      const z1 = -1.8 + ((L - 0.8 + 1.8) * (i + 1)) / 6;
      b.span(-r, -r, z0, r, r, z1 + 0.02, wood[i % 3], 'wood');
    }
    // (the iron: a ferrule, the blade down off the handle's end, bent forward into a hook; the edge bright)
    b.span(-0.56, -0.56, L - 1.7, 0.56, 0.56, L - 0.7, 0x50545a, 'metal');
    b.span(-0.2, -3.3, L - 1.3, 0.2, -0.1, L + 1.0, 0x7a7e84, 'metal');
    b.span(-0.2, -3.3, L + 1.0, 0.2, -1.6, L + 2.1, 0x7a7e84, 'metal');
    b.span(-0.16, -3.8, L - 1.3, 0.16, -3.2, L + 2.1, 0xd8dde2, 'metal');
  } else {
    const L = TOOL.dig.reach;
    const r = 0.46;
    for (let i = 0; i < 8; i++) {
      const z0 = -2 + ((L + 2) * i) / 8;
      const z1 = -2 + ((L + 2) * (i + 1)) / 8;
      b.span(-r, -r, z0, r, r, z1 + 0.02, wood[i % 3], 'wood');
    }
    // (the eye round the handle's end, the blade down and curling back toward him, its edge lighter)
    b.span(-0.7, -0.7, L - 0.8, 0.7, 0.7, L + 0.8, 0x50545a, 'metal');
    b.span(-2.2, -3.6, L - 0.4, 2.2, -0.5, L + 0.25, 0x6e7276, 'metal', { rx: -0.3 });
    b.span(-2.2, -4.2, L - 0.85, 2.2, -3.5, L - 0.15, 0xc8ccd0, 'metal', { rx: -0.3 });
  }
  const [gx, gy, gz] = JOINTS.propR.pivot;
  return b.translate(gx, gy, gz);
}
