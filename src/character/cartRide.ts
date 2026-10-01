import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { solveArm } from './Animator';
import type { JointPose, Pose } from './pose';
import { JOINTS, type JointName } from './skeleton';

/**
 * Riding on the back of the ox cart (the map's roam/_cartRide.ts): sitting on
 * the end of the cart's bed (its tailboard let down flat), facing back down
 * the trail, the thighs out over the edge and the shins hanging, his fists on
 * the edge beside his thighs; swaying with the cart under him (its roll and
 * pitch, a bump with the oxen's steps), the legs swinging lazily (more while it
 * rolls), breathing, looking round slowly.
 *
 * One number says where he is (`u`): 0 standing on the ground (the origin is
 * under his feet) ‥ 1 sitting (the origin is the seat: the top of the board
 * under his sit bones). On the way between he crouches with his back to the
 * cart (`CROUCH_U`), then springs up backwards onto it; getting off is the same
 * way back (a crouch as he lands). The caller moves the origin from the ground
 * to the seat while `u` goes from `CROUCH_U` to 1 (`cartLift`).
 *
 * A posture for `Animator.posture` with `postureFeet = false` (it places the
 * body itself). Units: body units (BU) in the explorer's space (+z forward,
 * +x his left).
 */

export interface CartSeatState {
  /** 0 standing on the ground ‥ `CROUCH_U` crouched to spring ‥ 1 sitting on the cart. */
  u: number;
  /** The cart under him: its roll (rad, + its left side up) and pitch (rad, + its front down), as the cart has them (he faces its back). */
  roll: number;
  pitch: number;
  /** A small bounce now (BU, + up): the wheels on the ruts, the oxen's steps. */
  bump: number;
  /** How fast it goes (0 standing ‥ 1 its own pace): the legs swing more. */
  go: number;
  /** Seconds (the legs, the breathing, the look round). */
  t: number;
}

/** Where on the way up he crouches to spring (the origin leaves the ground after it). */
export const CROUCH_U = 0.35;

/** How far the origin has gone from the ground to the seat (0‥1) at `u`: none until the crouch, then up with an ease. */
export function cartLift(u: number): number {
  const k = Math.min(1, Math.max(0, (u - CROUCH_U) / (1 - CROUCH_U)));
  return k * k * (3 - 2 * k);
}

/** The hips joint over the seat (BU) and back from it (towards the cart): the backs of the thighs rest on the board. */
const HIP_UP = 3.0;
const HIP_BACK = 0.3;
/** His fists on the edge beside his thighs (BU, from the seat: out, up, ahead). */
const GRIP: [number, number, number] = [4.4, 0.7, 1.4];

const REST_HIPS = new Vector3(...JOINTS.hips.pivot);
const CHEST_REST = new Vector3(...JOINTS.chest.pivot).sub(REST_HIPS);
/** Elbows out and a little back (chest space). */
const POLE = { L: new Vector3(0.75, -0.2, -0.6).normalize(), R: new Vector3(-0.75, -0.2, -0.6).normalize() };

/** The joints a shape sets (the arms come from the IK, or swing free on the way). */
const BODY: readonly JointName[] = ['hips', 'chest', 'neck', 'head', 'hipL', 'hipR', 'kneeL', 'kneeR', 'ankleL', 'ankleR', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR'];

/** Crouched with his back to the cart, the arms swung back: about to spring up onto it. */
const CROUCH: Pose = {
  hips: { py: -2.2, pz: -0.6, rx: 0.32 },
  chest: { rx: 0.3 },
  neck: { rx: -0.1 },
  head: { rx: -0.12 },
  hipL: { rx: -0.85, rz: 0.06 },
  hipR: { rx: -0.85, rz: -0.06 },
  kneeL: { rx: 1.05 },
  kneeR: { rx: 1.05 },
  ankleL: { rx: -0.3 },
  ankleR: { rx: -0.3 },
  shoulderL: { rx: 0.7, rz: 0.15 },
  shoulderR: { rx: 0.7, rz: -0.15 },
  elbowL: { rx: -0.3 },
  elbowR: { rx: -0.3 },
};

/** Sitting on the end of the bed (the arms by IK, not here). */
const SEAT: Pose = {
  hips: { px: 0, py: HIP_UP - REST_HIPS.y, pz: -HIP_BACK - REST_HIPS.z, rx: -0.04 },
  chest: { rx: 0.08 },
  neck: { rx: 0.02 },
  head: { rx: 0.06 },
  // Thighs out over the edge, the shins hanging straight down, the toes a little down.
  hipL: { rx: -1.42, rz: 0.1, ry: 0.06 },
  hipR: { rx: -1.42, rz: -0.1, ry: -0.06 },
  kneeL: { rx: 1.38 },
  kneeR: { rx: 1.38 },
  ankleL: { rx: -0.3 },
  ankleR: { rx: -0.3 },
};

const ease = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

/** (pose buffers: reused, the posture runs every frame) */
const OUT: Pose = {};
const _q = new Quaternion();
const _q2 = new Quaternion();
const _e = new Euler();
const _m = new Matrix4();
const _m2 = new Matrix4();
const _t = new Vector3();
const _s = new Vector3(1, 1, 1);

/** `a` + (`b` − `a`) · k, joint by joint (missing values are 0), into `out`. */
function mix(a: Pose, b: Pose, k: number, out: Pose): Pose {
  for (const name of BODY) {
    const p = a[name];
    const q = b[name];
    const o: JointPose = (out[name] ??= {});
    o.rx = (p?.rx ?? 0) + ((q?.rx ?? 0) - (p?.rx ?? 0)) * k;
    o.ry = (p?.ry ?? 0) + ((q?.ry ?? 0) - (p?.ry ?? 0)) * k;
    o.rz = (p?.rz ?? 0) + ((q?.rz ?? 0) - (p?.rz ?? 0)) * k;
    o.px = (p?.px ?? 0) + ((q?.px ?? 0) - (p?.px ?? 0)) * k;
    o.py = (p?.py ?? 0) + ((q?.py ?? 0) - (p?.py ?? 0)) * k;
    o.pz = (p?.pz ?? 0) + ((q?.pz ?? 0) - (p?.pz ?? 0)) * k;
  }
  return out;
}

const NONE: Pose = {};

/** The posture at `s` (see `CartSeatState`). The returned object is reused: read it before the next call. */
export function cartSeatPose(s: CartSeatState): Pose {
  const u = Math.min(1, Math.max(0, s.u));
  const pose = u <= CROUCH_U ? mix(NONE, CROUCH, ease(u / CROUCH_U), OUT) : mix(CROUCH, SEAT, ease((u - CROUCH_U) / (1 - CROUCH_U)), OUT);
  // How much of the seated life shows (riding), and of the grip on the edge.
  const sat = ease((u - 0.75) / 0.25);
  const grip = ease((u - 0.6) / 0.3);
  const t = s.t;
  if (sat > 0) {
    const hips = pose.hips!;
    // He faces the cart's back: its front going down tips his back up, its left side up is his right.
    hips.rx! += -s.pitch * sat;
    hips.rz! += -s.roll * sat;
    hips.py! += s.bump * sat;
    // Breathing; a slow look round (along the trail behind, out over the fields, back).
    const breathe = 0.02 * Math.sin(t * 1.6);
    pose.chest!.rx! += breathe * sat;
    pose.chest!.ry! += 0.05 * Math.sin(t * 0.17 + 1) * sat;
    pose.head!.ry! += (0.45 * Math.sin(t * 0.13) + 0.15 * Math.sin(t * 0.37 + 2)) * sat;
    pose.head!.rx! += 0.06 * Math.sin(t * 0.21 + 0.5) * sat;
    pose.neck!.ry! += 0.15 * Math.sin(t * 0.13) * sat;
    // The legs swing lazily, each its own way: more while the cart rolls.
    const amp = (0.1 + 0.16 * s.go) * sat;
    const w = 1.2 + 0.9 * s.go;
    pose.kneeL!.rx! += amp * Math.sin(t * w);
    pose.kneeR!.rx! += amp * Math.sin(t * w * 0.93 + 2.3);
    pose.hipL!.rx! += 0.25 * amp * Math.sin(t * w + 1.2);
    pose.hipR!.rx! += 0.25 * amp * Math.sin(t * w * 0.93 + 3.5);
    pose.ankleL!.rx! += 0.6 * amp * Math.sin(t * w - 0.6);
    pose.ankleR!.rx! += 0.6 * amp * Math.sin(t * w * 0.93 + 1.7);
  }

  // Fists on the edge beside his thighs (arm IK in chest space), blended in from the swung arms of the crouch.
  if (grip > 0) {
    const hp = pose.hips!;
    _q.setFromEuler(_e.set(hp.rx ?? 0, hp.ry ?? 0, hp.rz ?? 0));
    _m.compose(_t.set(REST_HIPS.x + (hp.px ?? 0), REST_HIPS.y + (hp.py ?? 0), REST_HIPS.z + (hp.pz ?? 0)), _q, _s);
    const ch = pose.chest!;
    _m2.compose(CHEST_REST, _q2.setFromEuler(_e.set(ch.rx ?? 0, ch.ry ?? 0, ch.rz ?? 0)), _s);
    _m.multiply(_m2).invert();
    // (the grip rides the bump: the fists stay on the board)
    const up = GRIP[1] + s.bump * sat;
    for (const side of ['L', 'R'] as const) {
      const x = side === 'L' ? GRIP[0] : -GRIP[0];
      const arm = solveArm(side, _t.set(x, up, GRIP[2]).applyMatrix4(_m), POLE[side]);
      for (const j of [`shoulder${side}`, `elbow${side}`] as const) {
        const o = pose[j]!;
        const a = arm[j] ?? {};
        o.rx! += ((a.rx ?? 0) - o.rx!) * grip;
        o.ry! += ((a.ry ?? 0) - o.ry!) * grip;
        o.rz! += ((a.rz ?? 0) - o.rz!) * grip;
      }
    }
  }
  return pose;
}
