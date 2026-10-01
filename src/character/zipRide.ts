import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { VoxelBuilder } from '../voxel/VoxelBuilder';
import { solveArm } from './Animator';
import type { JointPose, Pose } from './pose';
import { JOINTS, LEG_CENTER_X, LEG_CENTER_Z } from './skeleton';

/**
 * On the zip line (the map's roam/_zipRide.ts): standing clipped in on a
 * platform, then sitting in his harness under the trolley, his fists on the
 * lanyard in front of his chest, legs swinging; tucked up (knees high, chest
 * forward) to go faster; standing again as he touches down. A posture for
 * `Animator.posture` with `postureFeet = false`: the ride places his feet
 * (the root) so the harness's front ring hangs at the lanyard's end.
 *
 * The whole body turns about the hips joint (`tilt`: + forward, `lean`: +
 * his up toward his left), as it hangs from the ring; the lanyard runs up from
 * the ring `strap` radians in front of his up, past his face (his head is
 * big and his arms are short: the trolley stays up and a little ahead).
 *
 * The harness: a red webbing waist belt with its steel front ring
 * (`ZIP_RING`), and a loop round each thigh (`buildZipHarness`,
 * `buildZipLegLoop`: slots on the hips and the thighs, put on as he clips in).
 *
 * Units: body units (BU) in the explorer's space (+z forward, +x his left).
 */

/** The harness's front ring (BU, his space as he stands). */
export const ZIP_RING = new Vector3(0, 10.8, 3.55);

export interface ZipPoseState {
  /** 0 standing on the deck ‥ 1 sitting in the harness. */
  sit: number;
  /** The whole body's turn about the hips (radians): + forward; + his up toward his left. */
  tilt: number;
  lean: number;
  /** The lanyard's angle from his up (radians, + in front of him). */
  strap: number;
  /** 0 his arms free ‥ 1 both fists on the lanyard. */
  grip: number;
  /** 0 still ‥ 1 legs swinging; 0‥1 knees tucked up (Shift: faster). */
  kick: number;
  tuck: number;
  /** Where he looks (radians, + to his left), and seconds (the swing of the legs, breathing). */
  look: number;
  t: number;
}

export function zipPoseState(): ZipPoseState {
  return { sit: 0, tilt: 0, lean: 0, strap: 0.15, grip: 0, kick: 0, tuck: 0, look: 0, t: 0 };
}

const REST_HIPS = new Vector3(...JOINTS.hips.pivot);
const CHEST_REST = new Vector3(...JOINTS.chest.pivot).sub(REST_HIPS);
/** Elbows out and down (chest space); the shoulders come forward a little to reach the lanyard. */
const POLE = { L: new Vector3(0.85, -0.5, -0.15).normalize(), R: new Vector3(-0.85, -0.5, -0.15).normalize() };
const SHRUG = { L: new Vector3(-0.2, 0.25, 0.9), R: new Vector3(0.2, 0.3, 1.0) };
/** The fists on the lanyard: how far up it from the ring (BU), and to each side of it. */
const GRIP_UP = { L: 7.4, R: 9.6 };
const GRIP_X = 0.8;

const _q = new Quaternion();
const _e = new Euler();
const _m = new Matrix4();
const _m2 = new Matrix4();
const _t = new Vector3();
const _s = new Vector3(1, 1, 1);
const _v = new Vector3();

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Where the ring is now (BU, his space: the root's frame) for the body's `tilt` and `lean`. */
export function zipRingAt(s: ZipPoseState, out: Vector3): Vector3 {
  _q.setFromEuler(_e.set(s.tilt, 0, -s.lean, 'XYZ'));
  return out.copy(ZIP_RING).sub(REST_HIPS).applyQuaternion(_q).add(REST_HIPS);
}

/** The pose: standing or sitting in the harness, the fists on the lanyard (arm IK), the legs swinging. */
export function zipPose(s: ZipPoseState): Pose {
  const sit = s.sit;
  const tuck = s.tuck * sit;
  const kick = s.kick * sit;
  const t = s.t;
  const breathe = 0.02 * Math.sin(t * 1.7);
  // (each leg on its own swing, out of step; quicker tucked)
  const w = 2.3 + 0.8 * tuck;
  const kl = Math.sin(t * w) * kick;
  const kr = Math.sin(t * w * 0.93 + 2.4) * kick;
  const hips: JointPose = { rx: s.tilt, rz: -s.lean };
  const pose: Pose = {
    hips,
    // Sitting he sits up a little against the lean back (his chest over the ring), tucked he curls forward.
    chest: { rx: sit * 0.1 + tuck * 0.22 + breathe },
    neck: { rx: sit * 0.06 + tuck * 0.05 },
    // (his head keeps looking ahead down the line, whatever the body does)
    head: { rx: -s.tilt * 0.55 - sit * 0.1 + tuck * 0.08, ry: s.look },
    // Thighs forward in the leg loops (more tucked), the shins hanging and swinging.
    hipL: { rx: -sit * (1.3 + 0.5 * tuck) - 0.12 * kl, rz: 0.05 * sit, ry: 0.06 * sit },
    hipR: { rx: -sit * (1.3 + 0.5 * tuck) - 0.12 * kr, rz: -0.05 * sit, ry: -0.06 * sit },
    kneeL: { rx: sit * (1.05 + 0.75 * tuck) + 0.32 * kl },
    kneeR: { rx: sit * (1.1 + 0.75 * tuck) + 0.32 * kr },
    ankleL: { rx: -0.15 * sit + 0.1 * kl },
    ankleR: { rx: -0.15 * sit + 0.1 * kr },
  };

  // Arms: free (hanging a little out), or the fists on the lanyard in front of his chest.
  const free: Pose = {
    shoulderL: { rz: 0.12, rx: 0.05 },
    shoulderR: { rz: -0.12, rx: 0.05 },
    elbowL: { rx: -0.25 },
    elbowR: { rx: -0.25 },
    wristL: {},
    wristR: {},
  };
  if (s.grip <= 0.001) return Object.assign(pose, free);
  // The lanyard in the hips' frame: up from the ring at `strap` in front of his up; into chest space for the IK.
  _q.setFromEuler(_e.set(s.tilt, 0, -s.lean, 'XYZ'));
  _m.compose(REST_HIPS, _q, _s);
  _m2.compose(CHEST_REST, _q.setFromEuler(_e.set(pose.chest!.rx ?? 0, 0, 0, 'XYZ')), _s);
  _m.multiply(_m2).invert();
  const up = (k: number, x: number, out: Vector3) => {
    // (hips-local: the ring, then along the lanyard; then into the root's frame through the hips' turn)
    out.set(x, Math.cos(s.strap) * k, Math.sin(s.strap) * k).add(_t.copy(ZIP_RING).sub(REST_HIPS));
    out.applyQuaternion(_q.setFromEuler(_e.set(s.tilt, 0, -s.lean, 'XYZ'))).add(REST_HIPS);
    return out.applyMatrix4(_m);
  };
  const arms = { ...solveArm('L', up(GRIP_UP.L, GRIP_X, _v), POLE.L, SHRUG.L), ...solveArm('R', up(GRIP_UP.R, -GRIP_X, _v), POLE.R, SHRUG.R) };
  const g = s.grip;
  for (const j of ['shoulderL', 'shoulderR', 'elbowL', 'elbowR'] as const) {
    const a = free[j] ?? {};
    const b = (arms as Pose)[j] ?? {};
    pose[j] = {
      rx: lerp(a.rx ?? 0, b.rx ?? 0, g),
      ry: lerp(a.ry ?? 0, b.ry ?? 0, g),
      rz: lerp(a.rz ?? 0, b.rz ?? 0, g),
      px: lerp(a.px ?? 0, b.px ?? 0, g),
      py: lerp(a.py ?? 0, b.py ?? 0, g),
      pz: lerp(a.pz ?? 0, b.pz ?? 0, g),
    };
  }
  pose.wristL = {};
  pose.wristR = {};
  return pose;
}

// ── The harness ─────────────────────────────────────────────────────────────

/** Webbing (red-orange, its edges darker), the steel buckle and the front ring. */
const WEB = [0xd2552a, 0xc24b24, 0xdc6230];
const STEEL = 0xc9ced2;

/** The waist belt with its front ring and the belay loop (hips joint, character space). */
export function buildZipHarness(): VoxelBuilder {
  const b = new VoxelBuilder();
  const y = 10.62;
  const h = 0.78;
  // Round the shorts' waist, just under his leather belt.
  b.box(0, y, 2.92, 9.9, h, 0.36, WEB[0], 'leather');
  b.box(0, y, -3.2, 9.9, h, 0.36, WEB[1], 'leather');
  for (const sx of [1, -1]) b.box(sx * 4.82, y, -0.14, 0.36, h, 6.5, WEB[2], 'leather');
  // The buckle on his left front, the belay loop down the front to the leg loops, the steel ring on it.
  b.box(2.6, y, 3.14, 1.2, 0.9, 0.16, STEEL, 'metal');
  b.box(2.6, y, 3.24, 0.6, 0.4, 0.08, 0x8e9398, 'metal');
  b.box(0, 9.95, 3.0, 0.9, 1.5, 0.3, WEB[1], 'leather');
  const r = ZIP_RING;
  b.box(r.x, r.y + 0.42, r.z, 1.0, 0.18, 0.22, STEEL, 'metal');
  b.box(r.x, r.y - 0.42, r.z, 1.0, 0.18, 0.22, STEEL, 'metal');
  b.box(r.x - 0.46, r.y, r.z, 0.18, 0.9, 0.22, STEEL, 'metal');
  b.box(r.x + 0.46, r.y, r.z, 0.18, 0.9, 0.22, 0xb0b5b9, 'metal');
  return b;
}

/** A leg loop round the thigh (hip joint `side`, character space). */
export function buildZipLegLoop(side: 'L' | 'R'): VoxelBuilder {
  const b = new VoxelBuilder();
  const x = side === 'L' ? LEG_CENTER_X : -LEG_CENTER_X;
  const z = LEG_CENTER_Z;
  const y = 9.0;
  const h = 0.62;
  b.box(x, y, z + 2.95, 4.5, h, 0.3, WEB[0], 'leather');
  b.box(x, y, z - 2.55, 4.5, h, 0.3, WEB[1], 'leather');
  for (const sx of [2.28, -2.28]) b.box(x + sx, y, z + 0.2, 0.3, h, 5.8, WEB[2], 'leather');
  return b;
}
