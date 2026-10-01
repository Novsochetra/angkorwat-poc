import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { solveArm } from './Animator';
import type { JointPose, Pose } from './pose';
import { JOINTS } from './skeleton';

/**
 * Working in the rice with the farmers (the map's roam/_farmWork.ts): a
 * posture for `Animator.posture` with `postureFeet = false` (it places the
 * body itself: the feet stay on the ground where they stand, by leg IK).
 *
 * - **planting** (ស្ទូង): bent right over from the hips, the knees bent, the
 *   feet apart in the mud; the left fist holds the bundle of seedlings low by
 *   the knee, the right takes a few from it, reaches out to the spot in front
 *   and pushes them into the mud, then comes back to the bundle;
 * - **reaping** (ច្រូត): bent as low, a wider stance; the left hand reaches
 *   into the clump and grips the stalks, the right draws the sickle through
 *   them under the fist toward him, and the cut fistful comes back to the
 *   sheaf he holds;
 * - a **shuffle step** to the next place (back while planting, on while
 *   reaping, aside between two clumps): one foot, then the other, the body
 *   carried with them;
 * - **holding out** a hand or both (taking the bundle or the sickle from the
 *   farmer, giving it back, taking her parcel), standing;
 * - **laying** the sheaf down: bending deep to put it on the ground in front.
 *
 * His arms are short for his big head (parts/food.ts), so he bends right
 * over and his chest turns a little toward the clump he works. One number
 * says how far he is bent (`bend`, 0 standing ‥ 1 at work); the hands go
 * where the caller's spot is (his own space), by arm IK through the chest's
 * frame as this posture leaves it, so a hand meets the mud or the clump
 * wherever it is. Units: body units (BU) in the explorer's space (+z forward,
 * +x his left, y up from his soles).
 */

export type FarmKind = 'plant' | 'reap';

export interface FarmBody {
  kind: FarmKind;
  /** 0 standing ‥ 1 bent at the work. */
  bend: number;
  /** Seconds (breathing, a slow sway). */
  t: number;
  /** The clump being planted or cut: where its foot is (BU, his space; the caller eases it from clump to clump). */
  readonly spot: Vector3;
  /** How far the hands are through planting or cutting it (0‥1), or −1: none (they rest). */
  act: number;
  /** A shuffle step (0‥1 through it, −1 none) and where it carries him (BU, his space: + forward, + to his left). */
  step: number;
  readonly stride: Vector3;
  /** Holding out a hand (0 at his side ‥ 1 out in front) and which: the left, the right, or both. */
  offer: number;
  offerHand: 'L' | 'R' | 'both';
  /** Laying the sheaf down in front of him (0‥1: down, then up again). */
  lay: number;
}

export function farmBody(kind: FarmKind): FarmBody {
  return { kind, bend: 0, t: 0, spot: new Vector3(0, 0, 7), act: -1, step: -1, stride: new Vector3(), offer: 0, offerHand: 'L', lay: 0 };
}

// ── The shapes (at full bend) ──────────────────────────────────────────────

interface Shape {
  /** Tilts (+ forward / down). */
  hips: number;
  chest: number;
  neck: number;
  head: number;
  /** The hips joint lowered and pushed back (BU). */
  drop: number;
  back: number;
  /** The feet: set out to the side, the left one forward and the right back (BU). */
  footX: number;
  footZ: number;
}

const SHAPES: Record<FarmKind, Shape> = {
  // (as the farmers do: right over, the head up to see the spot; the knees bent, the seat back)
  plant: { hips: 0.92, chest: 0.48, neck: -0.5, head: -0.72, drop: 2.4, back: 2.4, footX: 3.0, footZ: 0.6 },
  // (over the stalks, a wider stance)
  reap: { hips: 0.9, chest: 0.45, neck: -0.48, head: -0.68, drop: 2.6, back: 2.4, footX: 3.4, footZ: 1.0 },
};
/** Bending down to lay the sheaf on the ground: the knees bent deep. */
const LAY: Shape = { hips: 0.95, chest: 0.5, neck: -0.32, head: -0.4, drop: 3.4, back: 2.8, footX: 3.0, footZ: 0.8 };
const SHAPE_KEYS = Object.keys(LAY) as (keyof Shape)[];

// ── The hands (BU, his space) ──────────────────────────────────────────────

/** Planting: the bundle in the left fist, low by the left knee; the right fist resting by it, taking seedlings. */
const BUNDLE = new Vector3(1.6, 5.0, 6.0);
const PINCH = new Vector3(-0.6, 5.6, 6.2);
/** The right hand takes a few seedlings off the bundle here (from the bundle's fist). */
const TAKE_AT = new Vector3(-1.2, 0.6, 0.4);
/** It pushes them in this far over the clump's foot (BU): under the water's skin (1.5 over the floor), into the mud. */
const PUSH_TO = 1.0;
/** Reaping: the sheaf held at the left side, the sickle low on the right, ready. */
const SHEAF = new Vector3(4.2, 6.4, 4.6);
const SICKLE = new Vector3(-4.4, 5.6, 6.0);
/** The fist's way through the stalks (from the clump's foot): out to the right and back, then drawn in and to the left under the grip. */
const CUT_FROM = new Vector3(-5.0, 4.8, 0.8);
const CUT_TO = new Vector3(-2.6, 4.4, -1.2);
/** The left hand grips the clump this high up its stalks (BU). */
const GRIP_UP = 5.2;
/** Standing, a hand held out (a little in, at the chest's height); both: a little wider. */
const OUT_L = new Vector3(1.6, 13.0, 6.4);
const OUT_R = new Vector3(-1.6, 13.0, 6.4);
const OUT_BOTH = 1.3;
/** Laying the sheaf down: the left fist low in front, the right steadying it. */
const LAY_L = new Vector3(1.6, 2.8, 7.6);
const LAY_R = new Vector3(-1.6, 3.2, 7.2);
/** Where the elbows point (chest space): out and back; held out, down and out. */
const POLE_L = new Vector3(0.8, -0.3, -0.5).normalize();
const POLE_R = new Vector3(-0.8, -0.3, -0.5).normalize();
const POLE_OUT_L = new Vector3(0.7, -0.7, -0.1).normalize();
const POLE_OUT_R = new Vector3(-0.7, -0.7, -0.1).normalize();
/** The chest turns toward the clump: this much a BU it is off to the side (radians), at most `TWIST_MAX`. */
const TWIST = 0.035;
const TWIST_MAX = 0.26;
/** The sickle in the fist (his space): its grip axis forward and to the left, a little down; its blade curling flat to the left. */
const SICKLE_GRIP = new Vector3(0.55, -0.3, 0.8).normalize();
const SICKLE_SIDE = new Vector3(1, 0, -0.45).normalize();

// ── The legs ───────────────────────────────────────────────────────────────

const HIPS = JOINTS.hips.pivot;
const CHEST_LOCAL = new Vector3(JOINTS.chest.pivot[0] - HIPS[0], JOINTS.chest.pivot[1] - HIPS[1], JOINTS.chest.pivot[2] - HIPS[2]);
const HIP_LOCAL = { y: JOINTS.hipL.pivot[1] - HIPS[1], z: JOINTS.hipL.pivot[2] - HIPS[2] };
/** Ankle over the sole (BU): a flat foot stands with its ankle this high; and where it stands at rest. */
const ANKLE_UP = JOINTS.ankleL.pivot[1];
const ANKLE_Z = JOINTS.ankleL.pivot[2];
const ANKLE_X = JOINTS.ankleL.pivot[0];
const THIGH = JOINTS.hipL.pivot[1] - JOINTS.kneeL.pivot[1];
const SHIN = Math.hypot(JOINTS.kneeL.pivot[1] - JOINTS.ankleL.pivot[1], JOINTS.kneeL.pivot[2] - JOINTS.ankleL.pivot[2]);
const SHIN_LEAN = Math.atan2(JOINTS.kneeL.pivot[2] - JOINTS.ankleL.pivot[2], JOINTS.kneeL.pivot[1] - JOINTS.ankleL.pivot[1]);
/** A leg's length (BU, hip joint to ankle): a foot set out sideways turns the hip by its offset over this. */
const LEG = THIGH + SHIN;
/** A lifted foot in a shuffle step comes this high (BU). */
const LIFT = 1.3;

/** Two-bone leg IK in the side plane: the thigh's angle (world, + back) and the knee's bend that put the ankle `dy`, `dz` from the hip joint. */
function legIK(dy: number, dz: number, out: { thigh: number; knee: number }): void {
  const d = Math.min(THIGH + SHIN - 1e-3, Math.max(Math.abs(THIGH - SHIN) + 1e-3, Math.hypot(dy, dz)));
  const bend = Math.acos(clamp((d * d - THIGH * THIGH - SHIN * SHIN) / (2 * THIGH * SHIN), -1, 1));
  const aim = Math.atan2(-dz, -dy);
  out.thigh = aim - Math.atan2(SHIN * Math.sin(bend), THIGH + SHIN * Math.cos(bend));
  out.knee = bend - SHIN_LEAN;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (u: number) => {
  const c = clamp(u, 0, 1);
  return c * c * (3 - 2 * c);
};
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
/** 0 outside [a, b], rising and falling smoothly to 1 in its middle. */
const bump = (u: number, a: number, b: number) => (u <= a || u >= b ? 0 : Math.sin(((u - a) / (b - a)) * Math.PI));

// (scratch: used at once)
const _q = new Quaternion();
const _q2 = new Quaternion();
const _e = new Euler();
const _m = new Matrix4();
const _m2 = new Matrix4();
const _rot = new Matrix4();
const _one = new Vector3(1, 1, 1);
const _p = new Vector3();
const _l = new Vector3();
const _r = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _leg = { thigh: 0, knee: 0 };
const _shape: Shape = { ...SHAPES.plant };

/** A point on the way from `a` to `b` (0‥1), lifted `up` BU in the middle of the way. */
function arc(a: Vector3, b: Vector3, k: number, up: number, out: Vector3): Vector3 {
  const e = smooth(k);
  return out.lerpVectors(a, b, e).setY(mix(a.y, b.y, e) + up * Math.sin(Math.PI * clamp(k, 0, 1)));
}

/** The posture now (see `FarmBody`). */
export function farmPose(s: FarmBody): Pose {
  // The body's shape: standing → the work's bend (or the lay's).
  const work = SHAPES[s.kind];
  const lay = smooth(bump(s.lay, 0, 1) * 1.6);
  const b = smooth(s.bend);
  const deep = Math.max(b, lay);
  for (const k of SHAPE_KEYS) _shape[k] = mix(work[k], LAY[k], lay) * deep;
  const sh = _shape;
  const sp = s.spot;
  // (breathing, a slow sway; a little dip as a hand goes down to the mud or into the clump; the chest turned to the clump)
  const breath = Math.sin(s.t * 1.9) * 0.018;
  const reach = s.act >= 0 ? bump(s.act, 0.15, 0.85) : 0;
  const tilt = sh.hips + 0.04 * reach * b;
  const chest = sh.chest + breath + 0.05 * reach * b;
  const sway = Math.sin(s.t * 0.45) * 0.03 * b;
  const twist = clamp(sp.x * TWIST, -TWIST_MAX, TWIST_MAX) * b * (1 - lay);
  const pose: Pose = {
    hips: { rx: tilt, ry: sway + twist * 0.35, py: -sh.drop, pz: -sh.back },
    chest: { rx: chest, ry: twist * 0.65 - sway * 0.6 },
    neck: { rx: sh.neck },
    head: { rx: sh.head - 0.06 * reach, ry: 0.05 * Math.sin(s.t * 0.31) * b - twist * 0.3 },
  };

  // ── The legs: each foot on the ground where it stands (a shuffle step: one, then the other) ──
  const hy = HIPS[1] - sh.drop;
  const hz = HIPS[2] - sh.back;
  const c = Math.cos(tilt);
  const n = Math.sin(tilt);
  const jy = hy + HIP_LOCAL.y * c - HIP_LOCAL.z * n;
  const jz = hz + HIP_LOCAL.y * n + HIP_LOCAL.z * c;
  const stepping = s.step >= 0;
  const st = s.stride;
  // (the body is carried smoothly over the step; each foot moves in its half, from where it stood to where it goes:
  // stepping back the right foot first, on or aside the left)
  const carried = stepping ? smooth(s.step) : 0;
  for (const side of ['L', 'R'] as const) {
    const sg = side === 'L' ? 1 : -1;
    const first = (st.z < -0.01) === (side === 'R');
    const part = stepping ? clamp((s.step - (first ? 0 : 0.5)) * 2, 0, 1) : 0;
    const moved = stepping ? smooth(part) : 0;
    const fz = ANKLE_Z + sg * sh.footZ * 0.5 + (moved - carried) * st.z;
    const fx = sg * (ANKLE_X + Math.max(0, sh.footX - ANKLE_X)) + (moved - carried) * st.x;
    const lift = stepping ? LIFT * Math.sin(Math.PI * part) : 0;
    legIK(ANKLE_UP + lift - jy, fz - jz, _leg);
    // (a foot set out sideways: the hip turned out by it, the ankle back so the sole stays flat)
    const out = (fx - sg * ANKLE_X) / LEG;
    pose[`hip${side}`] = { rx: _leg.thigh - tilt, rz: 0.03 * sg + out, ry: sg * 0.1 * deep };
    pose[`knee${side}`] = { rx: _leg.knee };
    pose[`ankle${side}`] = { rx: -(_leg.thigh + _leg.knee), rz: -0.03 * sg - out };
  }

  // ── The arms: by IK through the chest's frame as posed ──
  const hips = pose.hips!;
  const ch = pose.chest!;
  _m.compose(_p.set(HIPS[0], hy, hz), _q.setFromEuler(_e.set(tilt, hips.ry ?? 0, 0)), _one);
  _m2.compose(CHEST_LOCAL, _q2.setFromEuler(_e.set(chest, ch.ry ?? 0, 0)), _one);
  _m.multiply(_m2);
  // (the chest's turn in his space, for the sickle's grip below)
  _rot.extractRotation(_m);
  _m.invert();
  const u = s.act;
  if (s.kind === 'plant') {
    // The bundle low by the knee; the right hand pinches seedlings off it, out to the spot, down into the mud, back.
    _l.copy(BUNDLE);
    _a.copy(BUNDLE).add(TAKE_AT);
    if (u < 0) _r.copy(PINCH);
    else if (u < 0.2) arc(PINCH, _a, u / 0.2, 0, _r);
    else if (u < 0.55) arc(_a, _b.copy(sp).setY(sp.y + 1.8 + PUSH_TO), (u - 0.2) / 0.35, 1.4, _r);
    else if (u < 0.7) _r.copy(sp).setY(sp.y + mix(1.8 + PUSH_TO, PUSH_TO, smooth((u - 0.55) / 0.15)));
    else arc(_a.copy(sp).setY(sp.y + PUSH_TO), PINCH, (u - 0.7) / 0.3, 1.2, _r);
  } else {
    // The left hand reaches into the clump and grips it; the sickle comes through under the fist; the fistful comes back.
    _a.copy(sp).setY(sp.y + GRIP_UP);
    if (u < 0) _l.copy(SHEAF);
    else if (u < 0.3) arc(SHEAF, _a, u / 0.3, 0.6, _l);
    else if (u < 0.6) _l.copy(_a).setZ(_a.z - 0.8 * smooth((u - 0.3) / 0.3));
    else arc(_b.copy(_a).setZ(_a.z - 0.8), SHEAF, (u - 0.6) / 0.4, 0.8, _l);
    // (the sickle: out to the right and back, then drawn through the stalks low down, toward him and under the fist)
    const from = _a.copy(sp).add(CUT_FROM);
    const to = _b.copy(sp).add(CUT_TO);
    if (u < 0) _r.copy(SICKLE);
    else if (u < 0.3) arc(SICKLE, from, u / 0.3, 0.6, _r);
    else if (u < 0.52) _r.lerpVectors(from, to, smooth((u - 0.3) / 0.22));
    else arc(to, SICKLE, (u - 0.52) / 0.48, 0.8, _r);
  }
  // (laying the sheaf down, and holding a hand out: over the work's)
  if (lay > 0) {
    _l.lerp(LAY_L, lay);
    _r.lerp(LAY_R, lay * 0.8);
  }
  const off = smooth(s.offer);
  if (off > 0) {
    const both = s.offerHand === 'both';
    if (s.offerHand === 'L' || both) _l.lerp(_a.copy(OUT_L).setX(OUT_L.x * (both ? OUT_BOTH : 1)), off);
    if (s.offerHand === 'R' || both) _r.lerp(_a.copy(OUT_R).setX(OUT_R.x * (both ? OUT_BOTH : 1)), off);
  }
  Object.assign(pose, solveArm('L', _l.applyMatrix4(_m), off > 0.5 ? POLE_OUT_L : POLE_L), solveArm('R', _r.applyMatrix4(_m), off > 0.5 ? POLE_OUT_R : POLE_R));
  // (the wrists: the bundle's fist turned in a little; the sickle's grip forward and its blade flat to the left)
  if (s.kind === 'plant') (pose.wristL as JointPose).rx = 0.3 * b;
  else aimSickle(pose, b * (1 - off));
  return pose;
}

/**
 * Turn the right wrist so the sickle's grip runs forward and to the left and its blade lies flat (his space, by
 * `k` 0‥1): the fist's frame wanted, through the chest's turn and the arm's, gives the wrist's own turn.
 */
function aimSickle(pose: Pose, k: number): void {
  if (k <= 0.001) return;
  // The fist wanted (his space): +z the grip, +x the blade's side, +y over both.
  _z.copy(SICKLE_GRIP);
  _x.copy(SICKLE_SIDE).addScaledVector(_z, -SICKLE_SIDE.dot(_z)).normalize();
  _y.crossVectors(_z, _x);
  _m2.makeBasis(_x, _y, _z);
  // …in the chest's frame, then in the forearm's (shoulder, then elbow).
  _m2.premultiply(_m.copy(_rot).transpose());
  const sh = pose.shoulderR!;
  const el = pose.elbowR!;
  _m.makeRotationFromEuler(_e.set(sh.rx ?? 0, sh.ry ?? 0, sh.rz ?? 0, 'XYZ')).multiply(_rot.makeRotationX(el.rx ?? 0));
  _m2.premultiply(_m.transpose());
  _q.setFromRotationMatrix(_m2);
  _q.slerp(_q2.identity(), 1 - k);
  _e.setFromQuaternion(_q, 'XYZ');
  pose.wristR = { rx: _e.x, ry: _e.y, rz: _e.z };
}
