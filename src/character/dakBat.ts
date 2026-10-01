import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { VoxelBuilder } from '../voxel/VoxelBuilder';
import { solveArm } from './Animator';
import { ACTIONS, FACE_ARMS, PRAY } from './clips';
import type { JointPose, Pose } from './pose';
import { JOINTS, SOLE_POINTS, type JointName } from './skeleton';

/**
 * Dak bat (ដាក់បាត្រ): the explorer gives rice to a monk on his alms round
 * (the map's roam/_dakBat.ts). A posture (`Animator.posture`, with
 * `postureFeet = false`: it places the body itself) that kneels the way
 * the prayer does (the prayer's own keys, clips.ts `pray`: the hat off, the
 * right foot back, both knees down), then kneels sitting back on his heels
 * with a silver bowl of rice (ផ្តិល) in his left hand on his lap and a
 * spoon in his right; rises on his knees and reaches up with the spoon over
 * the monk's open bowl, tips the rice in (never touching the monk), twice;
 * sits back, palms together at his face (sampeah) while the monks chant the
 * blessing, bows once to the ground, and gets up the prayer's way (the hat
 * back on). The caller eases the state's numbers (`DakPoseState`); this
 * only shapes the body.
 *
 * The body is planted as the Animator plants the prayer's: the lowest of
 * the soles, the knees, the fronts of the shins and the tops of the feet
 * on the ground (y = 0). The arms by IK (`solveArm`), the wrists turned so
 * the bowl stays level and the spoon points where it goes.
 *
 * Units: body units (BU) in the explorer's space (+z forward, +x his left).
 */

/** How he is now (the caller eases each; see the notes on each). */
export interface DakPoseState {
  /** Going down or up: the time in the prayer's keys (0 standing ‥ `DAK_KNEEL` kneeling up; `DAK_RISE` ‥ `PRAY.duration` getting up); NaN: kneeling (the rest below). */
  pray: number;
  /** Kneeling: 0 sitting back on his heels ‥ 1 up on his knees. */
  rise: number;
  /** The chest leaning forward (radians), reaching. */
  lean: number;
  /** The arms on the bowl of rice and the spoon (0: hands resting ‥ 1). */
  hold: number;
  /** The spoon: 0 in his bowl ‥ 1 at `reach` (its tip there); `tip` 0 level ‥ 1 tipped over (the rice falls). */
  spoon: number;
  tip: number;
  /** Where the spoon's tip goes (BU, his space): over the monk's bowl. */
  readonly reach: Vector3;
  /** Palms together at his face (0 ‥ 1). */
  palms: number;
  /** The bow, hands flat on the ground before his knees (0 ‥ 1). */
  bow: number;
  /** Where he looks (BU, his space), and how much (0 ‥ 1). */
  readonly look: Vector3;
  lookW: number;
  /** Seconds (breathing). */
  t: number;
}

/** Times in the prayer's keys (clips.ts `PRAY_KEYS`): both knees down, upright; sitting back on the heels on the way up; standing. */
export const DAK_KNEEL = 2.15;
export const DAK_RISE = 7.15;
/** The hat: off at, back on at (prayer time). */
export const DAK_HAT = { off: PRAY.hatOff, on: PRAY.hatOn } as const;

export function dakState(): DakPoseState {
  return { pray: 0, rise: 1, lean: 0, hold: 0, spoon: 0, tip: 0, reach: new Vector3(0, 14, 9), palms: 0, bow: 0, look: new Vector3(0, 16, 12), lookW: 0, t: 0 };
}

// ── The prayer's shapes, kneeling ──────────────────────────────────────────

const pray = ACTIONS.pray.pose;
/** (made the first time: clips.ts is loaded by then) */
let SHAPES: { knees: Pose; rest: Pose; bow: Pose } | null = null;
function shapes(): { knees: Pose; rest: Pose; bow: Pose } {
  return (SHAPES ??= { knees: copy(pray(DAK_KNEEL)), rest: copy(pray(DAK_RISE)), bow: copy(pray(PRAY.bows[0])) });
}
const copy = (p: Pose): Pose => JSON.parse(JSON.stringify(p)) as Pose;

const BODY: readonly JointName[] = ['hips', 'chest', 'neck', 'head', 'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR'];
const ARMS: readonly JointName[] = ['shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR'];
const ALL: readonly JointName[] = [...BODY, ...ARMS];
const CH = ['rx', 'ry', 'rz', 'px', 'py', 'pz'] as const;

/** The pose returned (written in place each call: the Animator reads it at once). */
const OUT: Pose = Object.fromEntries(ALL.map((n) => [n, { rx: 0, ry: 0, rz: 0, px: 0, py: 0, pz: 0 }])) as Pose;
const ARM_TMP: Pose = Object.fromEntries(ARMS.map((n) => [n, { rx: 0, ry: 0, rz: 0, px: 0, py: 0, pz: 0 }])) as Pose;

/** `out[j] = a[j] + (b[j] − a[j]) · k` for the joints `js`. */
function mix(out: Pose, a: Pose, b: Pose, k: number, js: readonly JointName[]): void {
  for (const j of js) {
    const o = out[j]!;
    const pa = a[j];
    const pb = b[j];
    for (const c of CH) {
      const va = pa?.[c] ?? 0;
      o[c] = va + ((pb?.[c] ?? 0) - va) * k;
    }
  }
}
/** `out[j] → p[j]` by `k`. */
function toward(out: Pose, p: Pose, k: number, js: readonly JointName[]): void {
  if (k <= 0) return;
  for (const j of js) {
    const o = out[j]!;
    const pj = p[j];
    for (const c of CH) o[c] = (o[c] ?? 0) + ((pj?.[c] ?? 0) - (o[c] ?? 0)) * k;
  }
}

// ── Planting: what rests on the ground ─────────────────────────────────────

/** The fronts of the knees and shins and the tops of the feet (BU from the joint): Animator.ts `KNEEL_POINTS`. */
const KNEEL_POINTS: readonly (readonly [JointName, readonly (readonly [number, number, number])[]])[] = [
  ['kneeL', [[0, 0.5, 1.52], [0, -1.5, 1.52], [0, -2.5, 1.68], [0, -3.5, 1.68], [0, -4.4, 1.62]]],
  ['kneeR', [[0, 0.5, 1.52], [0, -1.5, 1.52], [0, -2.5, 1.68], [0, -3.5, 1.68], [0, -4.4, 1.62]]],
  ['ankleL', [[0, -0.4, 5.05], [0, 0.6, 3.0], [0, 0.6, -2.0], [0, -0.4, -3.05]]],
  ['ankleR', [[0, -0.4, 5.05], [0, 0.6, 3.0], [0, 0.6, -2.0], [0, -0.4, -3.05]]],
];

const REST_LOCAL = Object.fromEntries(
  (Object.keys(JOINTS) as JointName[]).map((n) => {
    const d = JOINTS[n];
    const pp = d.parent ? JOINTS[d.parent].pivot : [0, 0, 0];
    return [n, new Vector3(d.pivot[0] - pp[0], d.pivot[1] - pp[1], d.pivot[2] - pp[2])];
  }),
) as Record<JointName, Vector3>;

const _v = new Vector3();
const _q = new Quaternion();
const _e = new Euler();
const ONE = new Vector3(1, 1, 1);
const _hips = new Matrix4();
const _chest = new Matrix4();
const _inv = new Matrix4();
const _a = new Matrix4();
const _b = new Matrix4();
const _c = new Matrix4();
const _d = new Vector3();
const _x = new Vector3();
const _y = new Vector3();

/** A joint's transform against its parent, from the pose. */
function local(n: JointName, p: JointPose | undefined, out: Matrix4): Matrix4 {
  const r = REST_LOCAL[n];
  _v.set(r.x + (p?.px ?? 0), r.y + (p?.py ?? 0), r.z + (p?.pz ?? 0));
  _q.setFromEuler(_e.set(p?.rx ?? 0, p?.ry ?? 0, p?.rz ?? 0, 'XYZ'));
  return out.compose(_v, _q, ONE);
}

/** The lowest point of the soles, knees, shins and feet of pose `p` (BU over the ground, the hips as posed). */
const LEGS = [
  { hip: 'hipL', knee: 'kneeL', ankle: 'ankleL', kneePts: KNEEL_POINTS[0][1], footPts: KNEEL_POINTS[2][1] },
  { hip: 'hipR', knee: 'kneeR', ankle: 'ankleR', kneePts: KNEEL_POINTS[1][1], footPts: KNEEL_POINTS[3][1] },
] as const;
function lowest(p: Pose): number {
  let min = Infinity;
  local('hips', p.hips, _hips);
  for (const l of LEGS) {
    _a.multiplyMatrices(_hips, local(l.hip, p[l.hip], _b));
    _a.multiply(local(l.knee, p[l.knee], _b));
    for (const q of l.kneePts) min = Math.min(min, _v.set(q[0], q[1], q[2]).applyMatrix4(_a).y);
    _a.multiply(local(l.ankle, p[l.ankle], _b));
    for (const q of SOLE_POINTS) min = Math.min(min, _v.set(q[0], q[1], q[2]).applyMatrix4(_a).y);
    for (const q of l.footPts) min = Math.min(min, _v.set(q[0], q[1], q[2]).applyMatrix4(_a).y);
  }
  return min;
}

// ── The arms ───────────────────────────────────────────────────────────────

/** The left fist under the bowl of rice on his lap, raised a little toward him while he spoons (chest space, BU). */
const LAP_L = new Vector3(1.0, -2.2, 4.6);
const UP_L = new Vector3(1.4, -1.0, 5.3);
/** The bowl of rice sits this far over the left fist (BU, `buildPhtel`'s foot), its rice's top this far over its foot. */
export const PHTEL_UP = 0.8;
const RICE_TOP = 2.4;
/** The spoon from the fist to its tip (BU), and the way it lies in the bowl (chest space: toward the bowl, down into it). */
export const SPOON_LEN = 4.8;
const SPOON_IN = new Vector3(0.85, -0.42, 0.32).normalize();
/** His right shoulder (chest space). */
const SHOULDER_R = new Vector3(...JOINTS.shoulderR.pivot).sub(new Vector3(...JOINTS.chest.pivot));
/** Elbows out and down (chest space). */
const POLE_L = new Vector3(0.8, -0.6, -0.1).normalize();
const POLE_R = new Vector3(-0.8, -0.6, -0.1).normalize();
const _w = new Matrix4();
const _tip0 = new Vector3();
const _tip1 = new Vector3();
const _dir1 = new Vector3();
const _fist = new Vector3();
const _bowl = new Vector3();

/**
 * The wrist turn that puts a hand of an arm posed by `solveArm` into the
 * orientation `want` (a rotation in chest space): hand = shoulder · elbow · wrist.
 */
function wristFor(pose: Pose, side: 'L' | 'R', want: Matrix4, out: JointPose): void {
  const s = pose[`shoulder${side}`]!;
  _a.makeRotationFromEuler(_e.set(s.rx ?? 0, s.ry ?? 0, s.rz ?? 0, 'XYZ'));
  _a.multiply(_b.makeRotationX(pose[`elbow${side}`]!.rx ?? 0));
  _a.transpose().multiply(want);
  _e.setFromRotationMatrix(_a, 'XYZ');
  out.rx = _e.x;
  out.ry = _e.y;
  out.rz = _e.z;
}

const SIDE_JOINTS = { L: ['shoulderL', 'elbowL'], R: ['shoulderR', 'elbowR'] } as const;
function setArm(side: 'L' | 'R', solved: Pose): void {
  for (const j of SIDE_JOINTS[side]) {
    const o = ARM_TMP[j]!;
    const p = solved[j]!;
    o.rx = p.rx ?? 0;
    o.ry = p.ry ?? 0;
    o.rz = p.rz ?? 0;
    o.px = p.px ?? 0;
    o.py = p.py ?? 0;
    o.pz = p.pz ?? 0;
  }
}

/**
 * The posture for state `s` (see the module's notes): written into one pose
 * object, returned (the Animator reads it at once; do not keep it).
 */
export function dakBatPose(s: DakPoseState): Pose {
  const { knees, rest, bow } = shapes();
  const kneeling = Number.isNaN(s.pray);
  if (!kneeling) {
    // Going down or up: the prayer's own keys, whole.
    const p = pray(Math.max(0, Math.min(PRAY.duration, s.pray)));
    mix(OUT, p, p, 0, ALL);
  } else {
    // Kneeling: up on the knees ‥ back on the heels; the hands resting on the thighs (or by the knees, up).
    mix(OUT, rest, knees, s.rise, ALL);
    const br = 0.015 * Math.sin(s.t * 1.6);
    OUT.chest!.rx = (OUT.chest!.rx ?? 0) + s.lean + br;
    // The bow (the prayer's lowest bow: the hips, the chest, the head down, the hands flat before the knees).
    toward(OUT, bow, s.bow, BODY);
  }
  // Planted: the lowest point on the ground.
  OUT.hips!.py = (OUT.hips!.py ?? 0) - lowest(OUT);
  if (!kneeling) return OUT;
  // Looking at the monk (his bowl): the head and a little the neck (his eyes ≈ 22.4 BU over his feet standing).
  if (s.lookW > 0) {
    const yaw = Math.max(-0.9, Math.min(0.9, Math.atan2(s.look.x, Math.max(1, s.look.z))));
    const eye = 22.4 + (OUT.hips!.py ?? 0);
    const pitch = Math.max(-0.5, Math.min(0.45, -Math.atan2(s.look.y - eye, Math.max(2, Math.hypot(s.look.x, s.look.z)))));
    OUT.head!.ry = (OUT.head!.ry ?? 0) + yaw * 0.7 * s.lookW;
    OUT.neck!.ry = (OUT.neck!.ry ?? 0) + yaw * 0.3 * s.lookW;
    OUT.head!.rx = (OUT.head!.rx ?? 0) + pitch * 0.75 * s.lookW;
  }

  // The arms: resting, holding the bowl and the spoon (IK, in the chest's space), palms together, the bow.
  if (s.hold > 0) {
    local('hips', OUT.hips, _hips);
    _chest.multiplyMatrices(_hips, local('chest', OUT.chest, _a));
    _inv.copy(_chest).invert();
    // (the chest's turn alone, for the wrists)
    _c.extractRotation(_inv);
    // Left: the bowl on the lap, raised a little while he spoons; level.
    _bowl.lerpVectors(LAP_L, UP_L, Math.min(1, s.spoon * 2));
    setArm('L', solveArm('L', _bowl, POLE_L));
    wristFor(ARM_TMP, 'L', _c, ARM_TMP.wristL!);
    // Right: the spoon's tip in the rice ‥ at `reach` (pointing there from his shoulder), tipped to pour there.
    _tip0.copy(_bowl).setY(_bowl.y + PHTEL_UP + RICE_TOP + 0.1).addScaledVector(SPOON_IN, 0.4);
    _tip1.copy(s.reach).applyMatrix4(_inv);
    _dir1.subVectors(_tip1, SHOULDER_R).normalize();
    const k = s.spoon * s.spoon * (3 - 2 * s.spoon);
    _d.lerpVectors(SPOON_IN, _dir1, k).normalize();
    _fist.lerpVectors(_tip0, _tip1, k).addScaledVector(_d, -SPOON_LEN);
    setArm('R', solveArm('R', _fist, POLE_R));
    // (in the chest's space already: the tips and the way are)
    spoonFrame(_d, s.tip, _w);
    wristFor(ARM_TMP, 'R', _w, ARM_TMP.wristR!);
  }
  // From resting (the shape's own), to holding, to the palms at the face, to the bow's flat hands.
  toward(OUT, ARM_TMP, s.hold, ARMS);
  toward(OUT, FACE_ARMS, s.palms, ARMS);
  toward(OUT, bow, s.bow, ARMS);
  return OUT;
}

/** A rotation (his space) whose +Z runs along `dir`, +Y up as far as it can, tipped forward about its +X by `tip` (0‥1: ≈ 100°). */
function spoonFrame(dir: Vector3, tip: number, out: Matrix4): Matrix4 {
  _x.set(0, 1, 0).cross(dir);
  if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0);
  _x.normalize();
  _y.crossVectors(dir, _x).normalize();
  out.makeBasis(_x, _y, dir);
  // (the spoon rolls over about its own length: the bowl of it turns down)
  return out.multiply(_roll.makeRotationZ(-1.75 * tip));
}
const _roll = new Matrix4();

// ── What he holds ───────────────────────────────────────────────────────────

/** Silver (an aluminium phtel), rice, the lotus. */
const SILVER = 0xc9ced6;
const SILVER_DARK = 0x9aa1ab;
const RICE = 0xf5f2ea;
const LOTUS = 0xe98aa8;
const LOTUS_TIP = 0xf6c4d2;
const STEM = 0x5d8f3c;

/**
 * The silver bowl of rice (ផ្តិល), the way it is held for the alms round: a
 * round bowl on a foot, heaped with rice, a lotus bud laid across its rim
 * (chibi-sized, as his other props). Its own frame: the foot on y = 0, +z
 * away from him; held on the left fist (the prop joint's middle) under it.
 * `heap` 1 full ‥ 0 the rice given (only a little left).
 */
export function buildPhtel(heap: number): VoxelBuilder {
  const b = new VoxelBuilder();
  // The foot, the bowl rounded by two crossed boxes and a rim, a band.
  b.box(0, 0.2, 0, 1.9, 0.4, 1.9, SILVER_DARK, 'metal');
  b.box(0, 1.15, 0, 3.4, 1.5, 2.6, SILVER, 'metal');
  b.box(0, 1.15, 0, 2.6, 1.5, 3.4, SILVER, 'metal');
  b.box(0, 0.75, 0, 3.0, 0.7, 3.0, SILVER, 'metal');
  b.box(0, 1.95, 0, 3.7, 0.22, 3.7, SILVER, 'metal');
  b.box(0, 1.45, 0, 3.45, 0.18, 3.45, SILVER_DARK, 'metal');
  // The rice, heaped (steamed rice, white).
  const h = 0.25 + 0.75 * heap;
  b.box(0, 2.0 + h / 2, 0, 3.1, h, 3.1, RICE, 'shirt');
  if (heap > 0.4) b.box(0.2, 2.0 + h + 0.3, -0.1, 1.8, 0.6, 1.8, RICE, 'shirt');
  // A lotus bud across the rim on his side (its stem toward him).
  b.box(1.0, 2.6 + h * 0.4, -1.3, 0.8, 0.8, 1.0, LOTUS, 'shirt');
  b.box(1.0, 2.6 + h * 0.4, -0.65, 0.45, 0.45, 0.4, LOTUS_TIP, 'shirt');
  b.box(1.0, 2.3 + h * 0.4, -2.4, 0.22, 0.22, 1.4, STEM, 'hat');
  return b;
}

/**
 * The spoon (silver), along +z from the fist's middle, its bowl at the far
 * end; `rice`: a spoonful on it.
 */
export function buildSpoon(rice: boolean): VoxelBuilder {
  const b = new VoxelBuilder();
  b.box(0, 0.05, 1.8, 0.42, 0.26, 3.2, SILVER, 'metal');
  b.box(0, 0.14, SPOON_LEN - 0.7, 1.3, 0.28, 1.5, SILVER, 'metal');
  if (rice) b.box(0, 0.5, SPOON_LEN - 0.7, 1.05, 0.55, 1.15, RICE, 'shirt');
  return b;
}
