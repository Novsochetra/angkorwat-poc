import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { solveArm } from './Animator';
import { ACTIONS, FACE_ARMS, PRAY } from './clips';
import type { JointPose, Pose } from './pose';
import { JOINTS, SOLE_POINTS, type JointName } from './skeleton';

/**
 * A monk's blessing (the map's roam/_blessing.ts): the explorer kneels before a
 * seated monk the way the prayer kneels (its own keys, clips.ts `pray`: the hat
 * off, the right foot back, both knees down), sits back on his heels, palms
 * together at his face (sampeah) while the monk chants and sprinkles the
 * lustral water over him; comes in closer on his knees (a few small steps on
 * them, as one comes to a monk) and holds out his right hand, palm up, for the
 * red string, his left hand under its forearm (giving and taking with respect),
 * then looks at the string on his wrist; back on
 * his heels, palms together again; then the prayer's own three bows to the
 * floor, and he gets up the prayer's way (the hat back on). A posture
 * (`Animator.posture`, `postureFeet = false`: it places the body itself); the
 * caller eases the state's numbers (`BlessPoseState`), this only shapes the body.
 *
 * Planted as the Animator plants the prayer: the lowest of the soles, the knees,
 * the fronts of the shins and the tops of the feet on the ground (y = 0). Arms by
 * IK (`solveArm`), the wrists turned so the hands show what they do.
 *
 * Units: body units (BU) in the explorer's space (+z forward, +x his left).
 */

export interface BlessPoseState {
  /** The prayer's keys (0 standing ‥ `BLESS_KNEEL` kneeling up; the bows; `BLESS_RISE` ‥ `PRAY.duration` getting up), worn by `prayW`; NaN: none. */
  pray: number;
  /** How much of the prayer's own shape (0‥1) over the kneeling one below (easing into the bows). */
  prayW: number;
  /** Kneeling: 0 sitting back on his heels ‥ 1 up on his knees. */
  rise: number;
  /** Palms together at his face (0‥1). */
  palms: number;
  /** The right hand held out, palm up, its wrist at `reach`; the left under its forearm (0‥1). */
  offer: number;
  /** Where his right hand goes (BU, his space): into the monk's hands, who tie the string round the wrist behind it. */
  readonly reach: Vector3;
  /** He looks at the string on his wrist: the hand up before him, the palm to his face (0‥1). */
  admire: number;
  /** His head bowed and his body leaning forward from the waist (0‥1): under the chant and the water, as the string is tied. */
  bowHead: number;
  /** A step on his knees: its phase (radians: a step each π) and how much (0‥1). */
  step: number;
  stepW: number;
  /** Where he looks (BU, his space), and how much (0‥1). */
  readonly look: Vector3;
  lookW: number;
  /** Seconds (breathing). */
  t: number;
}

/** Times in the prayer's keys (clips.ts `PRAY_KEYS`): both knees down, upright; the bows begin (palms together); back on the heels after them. */
export const BLESS_KNEEL = 2.15;
export const BLESS_BOWS = 3.0;
export const BLESS_RISE = 7.15;
/** The hat: off at, back on at (prayer time). */
export const BLESS_HAT = { off: PRAY.hatOff, on: PRAY.hatOn } as const;

export function blessState(): BlessPoseState {
  return { pray: 0, prayW: 1, rise: 1, palms: 0, offer: 0, reach: new Vector3(-2, 11, 10), admire: 0, bowHead: 0, step: 0, stepW: 0, look: new Vector3(0, 16, 12), lookW: 0, t: 0 };
}

// ── The prayer's shapes, kneeling ──────────────────────────────────────────

const pray = ACTIONS.pray.pose;
/** (made the first time: clips.ts is loaded by then) */
let SHAPES: { knees: Pose; rest: Pose } | null = null;
function shapes(): { knees: Pose; rest: Pose } {
  return (SHAPES ??= { knees: copy(pray(BLESS_KNEEL)), rest: copy(pray(BLESS_RISE)) });
}
const copy = (p: Pose): Pose => JSON.parse(JSON.stringify(p)) as Pose;

const BODY: readonly JointName[] = ['hips', 'chest', 'neck', 'head', 'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR'];
const ARMS: readonly JointName[] = ['shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR'];
const ALL: readonly JointName[] = [...BODY, ...ARMS];
const CH = ['rx', 'ry', 'rz', 'px', 'py', 'pz'] as const;

/** The pose returned (written in place each call: the Animator reads it at once). */
const OUT: Pose = Object.fromEntries(ALL.map((n) => [n, { rx: 0, ry: 0, rz: 0, px: 0, py: 0, pz: 0 }])) as Pose;
/** The prayer's shape at its time, planted (for the blend into it). */
const PRAYED: Pose = Object.fromEntries(ALL.map((n) => [n, { rx: 0, ry: 0, rz: 0, px: 0, py: 0, pz: 0 }])) as Pose;
const ARM_TMP: Pose = Object.fromEntries(ARMS.map((n) => [n, { rx: 0, ry: 0, rz: 0, px: 0, py: 0, pz: 0 }])) as Pose;
/** The arms resting (the kneeling shape's own), and looking at the string. */
const ARM_REST: Pose = Object.fromEntries(ARMS.map((n) => [n, { rx: 0, ry: 0, rz: 0, px: 0, py: 0, pz: 0 }])) as Pose;
const ARM_LOOK: Pose = Object.fromEntries(ARMS.map((n) => [n, { rx: 0, ry: 0, rz: 0, px: 0, py: 0, pz: 0 }])) as Pose;

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
const KNEE_PTS: readonly (readonly [number, number, number])[] = [[0, 0.5, 1.52], [0, -1.5, 1.52], [0, -2.5, 1.68], [0, -3.5, 1.68], [0, -4.4, 1.62]];
const FOOT_PTS: readonly (readonly [number, number, number])[] = [[0, -0.4, 5.05], [0, 0.6, 3.0], [0, 0.6, -2.0], [0, -0.4, -3.05]];

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
const _w = new Matrix4();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _t = new Vector3();
const _d = new Vector3();

/** A joint's transform against its parent, from the pose. */
function local(n: JointName, p: JointPose | undefined, out: Matrix4): Matrix4 {
  const r = REST_LOCAL[n];
  _v.set(r.x + (p?.px ?? 0), r.y + (p?.py ?? 0), r.z + (p?.pz ?? 0));
  _q.setFromEuler(_e.set(p?.rx ?? 0, p?.ry ?? 0, p?.rz ?? 0, 'XYZ'));
  return out.compose(_v, _q, ONE);
}

const LEGS = [
  { hip: 'hipL', knee: 'kneeL', ankle: 'ankleL' },
  { hip: 'hipR', knee: 'kneeR', ankle: 'ankleR' },
] as const;
/** The lowest point of the soles, knees, shins and feet of pose `p` (BU over the ground, the hips as posed). */
function lowest(p: Pose): number {
  let min = Infinity;
  local('hips', p.hips, _hips);
  for (const l of LEGS) {
    _a.multiplyMatrices(_hips, local(l.hip, p[l.hip], _b));
    _a.multiply(local(l.knee, p[l.knee], _b));
    for (const q of KNEE_PTS) min = Math.min(min, _v.set(q[0], q[1], q[2]).applyMatrix4(_a).y);
    _a.multiply(local(l.ankle, p[l.ankle], _b));
    for (const q of SOLE_POINTS) min = Math.min(min, _v.set(q[0], q[1], q[2]).applyMatrix4(_a).y);
    for (const q of FOOT_PTS) min = Math.min(min, _v.set(q[0], q[1], q[2]).applyMatrix4(_a).y);
  }
  return min;
}

// ── The arms ───────────────────────────────────────────────────────────────

/** His right shoulder (chest space); the elbows out and down (chest space). */
const SHOULDER_R = new Vector3(...JOINTS.shoulderR.pivot).sub(new Vector3(...JOINTS.chest.pivot));
const POLE_R = new Vector3(-0.8, -0.6, 0).normalize();
/** From the wrist to the middle of the fist (the IK's end: the prop joint), BU. */
const WRIST_FIST = JOINTS.wristR.pivot[1] - JOINTS.propR.pivot[1];
/** How far his chest turns to his left as he holds out his right hand (radians), and his right shoulder goes forward (BU). */
const OFFER_TURN = 0.6;
const REACH_SHOULDER = new Vector3(0, 0.3, 1.6);
/** Elbows out and down for the hand under the right forearm (chest space). */
const POLE_UNDER = new Vector3(0.6, -0.8, -0.2).normalize();
/** Looking at the string: the right wrist up before him (chest space), the forearm forward and up, the elbow out and down. */
const LOOK_WRIST = new Vector3(-1.2, 3.6, 5.0);
const LOOK_DIR = new Vector3(0.25, 0.55, 1.0).normalize();
const POLE_LOOK = new Vector3(-0.8, -0.6, -0.1).normalize();

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
function setArm(side: 'L' | 'R', solved: Pose, out: Pose = ARM_TMP): void {
  for (const j of SIDE_JOINTS[side]) {
    const o = out[j]!;
    const p = solved[j]!;
    o.rx = p.rx ?? 0;
    o.ry = p.ry ?? 0;
    o.rz = p.rz ?? 0;
    o.px = p.px ?? 0;
    o.py = p.py ?? 0;
    o.pz = p.pz ?? 0;
  }
}

/** The pose's arms (the shape's own: resting) into `out`. */
function armsFrom(p: Pose, out: Pose): void {
  for (const j of ARMS) {
    const o = out[j]!;
    const q = p[j];
    o.rx = q?.rx ?? 0;
    o.ry = q?.ry ?? 0;
    o.rz = q?.rz ?? 0;
    o.px = q?.px ?? 0;
    o.py = q?.py ?? 0;
    o.pz = q?.pz ?? 0;
  }
}

/**
 * A right hand's frame (chest space) with the fingers along `dir` and the palm (its +x) facing `palm` as near as it
 * can, into `out`. (Hand frame: fingers along −y, the right palm toward +x, the thumb toward +z.)
 */
function handFrame(dir: Vector3, palm: Vector3, out: Matrix4): Matrix4 {
  _y.copy(dir).negate();
  _hx.copy(palm).addScaledVector(dir, -palm.dot(dir)).normalize();
  _z.crossVectors(_hx, _y);
  return out.makeBasis(_hx, _y, _z);
}
const _hx = new Vector3();
const UP = new Vector3(0, 1, 0);
/** Looking at the string: the palm to his face (chest space: back toward him, a little to his left). */
const TO_FACE = new Vector3(0.3, 0.2, -1).normalize();
/** Turned over about the fingers (a left hand's palm where a right hand's is). */
const _flip = new Matrix4().makeRotationY(Math.PI);

/**
 * The posture for state `s` (see the module's notes): written into one pose
 * object, returned (the Animator reads it at once; do not keep it).
 */
export function blessPose(s: BlessPoseState): Pose {
  const { knees, rest } = shapes();
  // Kneeling: up on the knees ‥ back on the heels; breathing; a step on the knees; the head bowed a little more.
  mix(OUT, rest, knees, s.rise, ALL);
  const br = 0.015 * Math.sin(s.t * 1.6);
  // (bowed: leaning forward from the waist too, his head well below the monk's)
  OUT.chest!.rx = (OUT.chest!.rx ?? 0) + br + 0.3 * s.bowHead;
  OUT.head!.rx = (OUT.head!.rx ?? 0) + 0.22 * s.bowHead;
  OUT.neck!.rx = (OUT.neck!.rx ?? 0) + 0.08 * s.bowHead;
  if (s.stepW > 0) {
    // (a knee lifts and comes forward, the hips sway over the other)
    const sw = Math.sin(s.step);
    const up = Math.max(0, sw);
    const dn = Math.max(0, -sw);
    OUT.hips!.rz = (OUT.hips!.rz ?? 0) + 0.06 * sw * s.stepW;
    OUT.hipL!.rx = (OUT.hipL!.rx ?? 0) - 0.18 * up * s.stepW;
    OUT.hipR!.rx = (OUT.hipR!.rx ?? 0) - 0.18 * dn * s.stepW;
  }
  OUT.hips!.py = (OUT.hips!.py ?? 0) - lowest(OUT);
  // Holding out his right hand he turns his chest a little to his left (the right shoulder forward: it reaches), his
  // head back to the monk.
  const turn = OFFER_TURN * s.offer;
  OUT.chest!.ry = (OUT.chest!.ry ?? 0) + turn;
  OUT.neck!.ry = (OUT.neck!.ry ?? 0) - turn * 0.4;
  OUT.head!.ry = (OUT.head!.ry ?? 0) - turn * 0.6;
  // Looking at the monk: the head and a little the neck (his eyes ≈ 22.4 BU over his feet standing).
  if (s.lookW > 0) {
    const yaw = Math.max(-0.9, Math.min(0.9, Math.atan2(s.look.x, Math.max(1, s.look.z))));
    const eye = 22.4 + (OUT.hips!.py ?? 0);
    const pitch = Math.max(-0.5, Math.min(0.45, -Math.atan2(s.look.y - eye, Math.max(2, Math.hypot(s.look.x, s.look.z)))));
    OUT.head!.ry = (OUT.head!.ry ?? 0) + yaw * 0.7 * s.lookW;
    OUT.neck!.ry = (OUT.neck!.ry ?? 0) + yaw * 0.3 * s.lookW;
    OUT.head!.rx = (OUT.head!.rx ?? 0) + pitch * 0.75 * s.lookW;
  }

  // The arms: resting, palms together at the face, the right hand held out (the left under its forearm), looking at the string.
  armsFrom(OUT, ARM_REST);
  if (s.offer > 0 || s.admire > 0) {
    local('hips', OUT.hips, _hips);
    _chest.multiplyMatrices(_hips, local('chest', OUT.chest, _a));
    _inv.copy(_chest).invert();
  }
  if (s.offer > 0) {
    // Right: the hand at `reach` (the monk's hands hold it, the string goes round the wrist behind it), palm up, the
    // fingers out along the line from the shoulder; the shoulder forward too (he reaches: he kneels back from the monk).
    _t.copy(s.reach).applyMatrix4(_inv);
    _d.subVectors(_t, SHOULDER_R).normalize();
    armsFrom(OUT, ARM_TMP);
    setArm('R', solveArm('R', _t, POLE_R, REACH_SHOULDER));
    handFrame(_d, UP, _w);
    wristFor(ARM_TMP, 'R', _w, ARM_TMP.wristR!);
    // Left: under the right forearm, palm up, holding it (the Khmer way of giving and taking with respect).
    _x.copy(SHOULDER_R).add(REACH_SHOULDER).lerp(_t, 0.62);
    _x.y -= 1.2;
    _x.x += 0.6;
    setArm('L', solveArm('L', _x, POLE_UNDER));
    handFrame(_d, UP, _w);
    // (the left hand's palm is its −x: turned over to face up)
    _w.multiply(_flip);
    wristFor(ARM_TMP, 'L', _w, ARM_TMP.wristL!);
  }
  if (s.admire > 0) {
    // Right: the forearm across before his chest, the back of the wrist (the knot) up to his eyes; the left resting.
    armsFrom(ARM_REST, ARM_LOOK);
    setArm('R', solveArm('R', _x.copy(LOOK_WRIST).addScaledVector(LOOK_DIR, WRIST_FIST), POLE_LOOK), ARM_LOOK);
    handFrame(LOOK_DIR, TO_FACE, _w);
    wristFor(ARM_LOOK, 'R', _w, ARM_LOOK.wristR!);
  }
  toward(OUT, FACE_ARMS, s.palms, ARMS);
  toward(OUT, ARM_TMP, s.offer, ARMS);
  toward(OUT, ARM_LOOK, s.admire, ARMS);

  // Into the prayer's own shape (the bows, getting up): planted on its own, blended over.
  if (s.prayW > 0 && !Number.isNaN(s.pray)) {
    const p = pray(Math.max(0, Math.min(PRAY.duration, s.pray)));
    mix(PRAYED, p, p, 0, ALL);
    PRAYED.hips!.py = (PRAYED.hips!.py ?? 0) - lowest(PRAYED);
    toward(OUT, PRAYED, s.prayW, ALL);
  }
  return OUT;
}
