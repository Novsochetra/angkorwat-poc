import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { solveArm } from './Animator';
import type { PackStyle } from './parts/gear';
import type { JointPose, Pose } from './pose';
import { JOINTS, type JointName } from './skeleton';

/**
 * Lying in a hammock (អង្រឹង): he sits back onto its edge, swings his legs up
 * and lies back in it, the cloth rising under his back toward his head and
 * under his legs toward his feet, his hands behind his head (on his belly
 * once he dozes), the left knee up, rocking a little; the way back up is the
 * same backwards. A posture for `Animator.posture` with `postureFeet = false`
 * (it places the body itself): the map's E at a hammock (roam/_hammock.ts).
 *
 * One number says where he is (`u`): 0 standing beside it ‥ 1 sitting on its
 * edge (his feet on the ground where he stood, his hands on the cloth beside
 * him) ‥ 2 lying in it. The caller moves his feet's spot (`body.pos`) under
 * his hips as he goes and turns him a quarter round from facing out to
 * lying along it, so this only says how the body bends: the hips how high
 * (`seatY`, `lieY`), how far the cloth rises (`torso`, `legs`), where his
 * feet stand while they are down (`feetZ`), the swing (`roll` about the line
 * of the ties, `axisY` over his feet's spot). Going down he puts his pack on
 * the ground beside the hammock (`packX`, `packZ`, `packYaw`).
 *
 * Units: body units (BU) in the explorer's space (+z the way he faces — lying,
 * toward his feet —, +x his left, y up from the ground under him).
 */

/** Where he is along the way (`HammockPoseState.u`). */
export const HAMMOCK_U = { stand: 0, sit: 1, lie: 2 } as const;

/** Seconds for each step along the way: standing ↔ sitting on its edge, sitting ↔ lying (getting up a little quicker). */
export const HAMMOCK_TIME = { sit: { down: 0.95, up: 0.75 }, lie: { down: 1.25, up: 1.0 } } as const;

/** Seconds to go from `from` to `to` along the way (standing to lying: through sitting). */
export function hammockDuration(from: number, to: number): number {
  const way = to > from ? 'down' : 'up';
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const part = (a: number, b: number) => Math.max(0, Math.min(hi, b) - Math.max(lo, a));
  return part(0, 1) * HAMMOCK_TIME.sit[way] + part(1, 2) * HAMMOCK_TIME.lie[way];
}

export interface HammockPoseState {
  /** 0 standing beside it ‥ 1 sitting on its edge ‥ 2 lying in it. */
  u: number;
  /** Asleep, 0‥1 (slow deep breaths, the head rolled aside, the hands on his belly). */
  sleep: number;
  /** Seconds (breathing, the slow look round). */
  t: number;
  /** Sitting: the hips joint over the ground (BU). */
  seatY: number;
  /** Standing and sitting: how far ahead of where they stand under his hips his feet are (BU, on the ground). */
  feetZ: number;
  /** Lying: the hips joint over the ground (BU). */
  lieY: number;
  /** Lying: how steeply the cloth rises under his back toward his head, and under his legs toward his feet (radians). */
  torso: number;
  legs: number;
  /** The swing: about the line along him at `axisY` (BU) over his feet's spot (radians, + = he swings out to his left). */
  roll: number;
  axisY: number;
  /** −1‥1: he leans into a push (+ to his left). */
  push: number;
  /** His backpack (put down beside the hammock while he lies), or none. */
  pack: PackStyle | 'none';
  /** Where it stands on the ground (BU, his space: the ground there `packY` over his feet's) and its turn there (radians: its straps toward (sin, cos)). */
  packX: number;
  packY: number;
  packZ: number;
  packYaw: number;
}

export function hammockState(): HammockPoseState {
  return { u: 0, sleep: 0, t: 0, seatY: 9, feetZ: 0, lieY: 10, torso: 0.4, legs: 0.35, roll: 0, axisY: 20, push: 0, pack: 'none', packX: -9, packY: 0, packZ: 0, packYaw: 0 };
}

// ── The shapes along `u` ───────────────────────────────────────────────────

/** Bends of the body at the keys of `u` (radians; weights 0‥1). */
interface Shape {
  /** Lean of the pelvis (+ forward), the chest, neck and head over it. Lying, the pelvis's comes from the cloth. */
  tilt: number;
  chest: number;
  neck: number;
  head: number;
  /** The legs to the ground by IK (1), as they hang from the pelvis (0). */
  plant: number;
  /** The legs lying along the cloth (1). */
  lie: number;
  /** The arms by IK (1) or hanging free (0); their hands on the cloth beside him (1) or behind his head (0). */
  reach: number;
  cloth: number;
  /** His pack: on his back (0) ‥ on the ground (1). */
  pack: number;
}
type Field = keyof Shape;

const KEYS: readonly (readonly [number, Shape])[] = [
  [0, { tilt: 0, chest: 0, neck: 0, head: 0, plant: 0, lie: 0, reach: 0, cloth: 1, pack: 0 }],
  // (lowering himself back onto it: leaning forward over his feet, the hands reaching back for its edge)
  [0.5, { tilt: 0.3, chest: 0.18, neck: 0, head: -0.12, plant: 1, lie: 0, reach: 0.65, cloth: 1, pack: 0 }],
  // (sitting on its edge, his hands on the cloth beside him)
  [1, { tilt: -0.04, chest: 0.08, neck: 0.02, head: -0.04, plant: 1, lie: 0, reach: 1, cloth: 1, pack: 0 }],
  // (swinging his legs up, leaning back, his hands going up behind his head; the pack slides off)
  [1.5, { tilt: -0.75, chest: 0.12, neck: 0.04, head: 0.02, plant: 0.25, lie: 0.62, reach: 1, cloth: 0.35, pack: 0.7 }],
  // (lying: the pelvis's tilt is the cloth's, `lieTilt` (this one is a typical one, for the curve), the upper back curling up its rise)
  [2, { tilt: -1.15, chest: 0.26, neck: 0.1, head: 0.16, plant: 0, lie: 1, reach: 1, cloth: 0, pack: 1 }],
];
const FIELDS = Object.keys(KEYS[0][1]) as Field[];

/** The shape at `u`: a monotone cubic through the keys per value (it flows through them, never past one). */
function shapeAt(u: number, out: Shape): Shape {
  const ks = KEYS;
  const n = ks.length;
  if (u <= ks[0][0]) return Object.assign(out, ks[0][1]);
  if (u >= ks[n - 1][0]) return Object.assign(out, ks[n - 1][1]);
  let i = 0;
  while (ks[i + 1][0] < u) i++;
  const [t1, p1] = ks[i];
  const [t2, p2] = ks[i + 1];
  const p0 = i > 0 ? ks[i - 1] : null;
  const p3 = i + 2 < n ? ks[i + 2] : null;
  const h = t2 - t1;
  const a = (u - t1) / h;
  const a2 = a * a;
  const a3 = a2 * a;
  const slope = (x: number, y: number) => (x * y > 0 ? (2 * x * y) / (x + y) : 0);
  for (const f of FIELDS) {
    const v1 = p1[f];
    const v2 = p2[f];
    const d = (v2 - v1) / h;
    const m1 = p0 ? slope((v1 - p0[1][f]) / (t1 - p0[0]), d) : 0;
    const m2 = p3 ? slope(d, (p3[1][f] - v2) / (p3[0] - t2)) : 0;
    out[f] = (2 * a3 - 3 * a2 + 1) * v1 + (a3 - 2 * a2 + a) * h * m1 + (-2 * a3 + 3 * a2) * v2 + (a3 - a2) * h * m2;
  }
  return out;
}

// ── Measures (BU) ──────────────────────────────────────────────────────────

const REST_HIPS = new Vector3(...JOINTS.hips.pivot);
/** The ankle's height over the ground on a flat foot, and where it stands (z) under his feet's spot. */
const ANKLE_UP = JOINTS.ankleL.pivot[1];
const ANKLE_Z = JOINTS.ankleL.pivot[2];
/** Leg bones: thigh, shin (the rest shin leans back a little). */
const THIGH = JOINTS.hipL.pivot[1] - JOINTS.kneeL.pivot[1];
const SHIN = Math.hypot(JOINTS.kneeL.pivot[1] - JOINTS.ankleL.pivot[1], JOINTS.kneeL.pivot[2] - JOINTS.ankleL.pivot[2]);
const SHIN_LEAN = Math.atan2(JOINTS.kneeL.pivot[2] - JOINTS.ankleL.pivot[2], JOINTS.kneeL.pivot[1] - JOINTS.ankleL.pivot[1]);
/**
 * Lying: the left knee up (the thigh this much steeper than the cloth, the knee bent so the foot rests on it),
 * the right leg out along it, a little bent; asleep the raised knee sinks and falls out.
 */
const KNEE_UP = { thigh: 0.62, knee: 1.35, sleepThigh: 0.3, sleepKnee: 0.8, out: 0.16, sleepOut: 0.42 };
const LEG_OUT = { knee: 0.22, splay: 0.06 };
/** The feet lying: how far the toes point up from along the leg (radians), the raised one flat on the cloth. */
const TOES_UP = 0.55;
/** Sitting: his hands on the cloth beside his seat (his space, from the hips joint: out, down, back). */
const ON_CLOTH = { out: 6.3, down: 1.6, back: -1.4 };
/** Fists behind his head (head space), on his belly (chest space); which way the elbows point (chest space; + out). */
const NAPE = new Vector3(4.4, 3.8, -5.2);
const BELLY = new Vector3(2.3, 0.6, 4.8);
const POLE_NAPE = new Vector3(1, 0.35, 0.35).normalize();
const POLE_CLOTH = new Vector3(1, -0.1, -0.7).normalize();
const POLE_BELLY = new Vector3(1, -0.4, -0.3).normalize();
/** The pack's joint over its bottom (gear.ts: as rest.ts puts it down). */
const PACK_BOTTOM: Record<PackStyle, number> = { explorer: -6.8, default: -5.5 };

// ── Forward kinematics (a few joints) ──────────────────────────────────────

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
const _q2 = new Quaternion();
const _v = new Vector3();
const _w = new Vector3();
const _t = new Vector3();
const _p1 = new Vector3();
const _pole = new Vector3();
const _lm = new Matrix4();
const _lm2 = new Matrix4();
const _chestInv = new Matrix4();
const Z_AXIS = new Vector3(0, 0, 1);
const Y_AXIS = new Vector3(0, 1, 0);

/** A joint's transform from its parent under `jp` (as the Animator applies a pose). */
function local(name: JointName, jp: JointPose | undefined, out: Matrix4): Matrix4 {
  _v.copy(REST_LOCAL[name]);
  if (jp) _v.set(_v.x + (jp.px ?? 0), _v.y + (jp.py ?? 0), _v.z + (jp.pz ?? 0));
  _q.setFromEuler(_e.set(jp?.rx ?? 0, jp?.ry ?? 0, jp?.rz ?? 0));
  return out.compose(_v, _q, ONE);
}

const M = Object.fromEntries((Object.keys(JOINTS) as JointName[]).map((n) => [n, new Matrix4()])) as Record<JointName, Matrix4>;
const BODY_CHAIN: readonly JointName[] = ['hips', 'chest', 'neck', 'head', 'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR'];

function frameBody(pose: Pose): void {
  for (const n of BODY_CHAIN) {
    const p = JOINTS[n].parent!;
    M[n].multiplyMatrices(p === 'body' ? _lm.identity() : M[p], local(n, pose[n], _lm2));
  }
}

/**
 * Two-bone leg IK in the side plane: the thigh's angle in his space and the knee's bend that put the
 * ankle `dy`, `dz` from the hip joint (as far as it reaches: short of it, the leg points there).
 */
function legIK(dy: number, dz: number): [number, number] {
  const d = Math.min(THIGH + SHIN - 1e-3, Math.max(Math.abs(THIGH - SHIN) + 1e-3, Math.hypot(dy, dz)));
  const bend = Math.acos(clamp((d * d - THIGH * THIGH - SHIN * SHIN) / (2 * THIGH * SHIN), -1, 1));
  const aim = Math.atan2(-dz, -dy);
  return [aim - Math.atan2(SHIN * Math.sin(bend), THIGH + SHIN * Math.cos(bend)), bend - SHIN_LEAN];
}

// ── The body ───────────────────────────────────────────────────────────────

const _s: Shape = { ...KEYS[0][1] };
/** The pose, made once and filled each frame (no allocation but the arms' IK). */
const POSE = {
  hips: {},
  chest: {},
  neck: {},
  head: {},
  hipL: {},
  kneeL: {},
  ankleL: {},
  hipR: {},
  kneeR: {},
  ankleR: {},
  shoulderL: {},
  elbowL: {},
  wristL: {},
  shoulderR: {},
  elbowR: {},
  wristR: {},
  backpack: {},
} as Required<Pick<Pose, 'hips' | 'chest' | 'neck' | 'head' | 'hipL' | 'kneeL' | 'ankleL' | 'hipR' | 'kneeR' | 'ankleR' | 'shoulderL' | 'elbowL' | 'wristL' | 'shoulderR' | 'elbowR' | 'wristR' | 'backpack'>>;

function set(j: JointPose, rx = 0, ry = 0, rz = 0, px = 0, py = 0, pz = 0): JointPose {
  j.rx = rx;
  j.ry = ry;
  j.rz = rz;
  j.px = px;
  j.py = py;
  j.pz = pz;
  return j;
}

/** The body in the hammock at `s` (see `HammockPoseState`). */
export function hammockPose(s: HammockPoseState): Pose {
  const sh = shapeAt(s.u, _s);
  const pose = POSE;
  const tau = Math.PI * 2;
  const lying = smooth(s.u - 1);
  const seated = smooth(s.u);
  const sleep = s.sleep * smooth((s.u - 1.7) / 0.3);
  const awake = 1 - sleep;
  const t = s.t;
  // (the pelvis lying: the torso rises toward his head (−z) as the cloth does under his back)
  const lieTilt = -(Math.PI / 2 - s.torso);
  // (between the half-way key and lying, the tilt goes on to the cloth's own instead of the typical one)
  const hipsTilt = sh.tilt + (lieTilt - KEYS[KEYS.length - 1][1].tilt) * smooth((s.u - 1.5) / 0.5);
  // Life: breathing (slow and deep asleep), a slow look round lying awake, a nod now and then.
  const breath = Math.sin((t * tau) / (4.0 + 2.6 * sleep)) * (0.018 + 0.024 * sleep);
  const look = (Math.sin((t * tau) / 12.5) * 0.28 + Math.sin((t * tau) / 4.9 + 1) * 0.08) * lying * awake;
  const rock = Math.sin((t * tau) / 7.7) * 0.07 * lying * awake;
  const lean = clamp(s.push, -1, 1) * lying;

  // The hips: up from standing to the seat, then to lying; under the origin (the caller keeps his feet's spot there).
  const hipsY = s.u <= 1 ? mix(REST_HIPS.y, s.seatY, seated) : mix(s.seatY, s.lieY, lying);
  set(pose.hips, hipsTilt, 0, 0, 0, hipsY - REST_HIPS.y, 0);
  set(pose.chest, sh.chest + breath * (0.6 + 0.4 * lying), 0, -0.06 * lean);
  set(pose.neck, sh.neck + 0.3 * breath, look * 0.3 + 0.1 * sleep);
  set(pose.head, sh.head - 0.1 * sleep, look + 0.36 * sleep - 0.12 * lean, -0.18 * sleep);
  // (the legs as they hang from the pelvis, for the IK)
  set(pose.hipL, -hipsTilt, 0.12, 0.04);
  set(pose.hipR, -hipsTilt, -0.12, -0.04);
  set(pose.kneeL);
  set(pose.kneeR);
  set(pose.ankleL);
  set(pose.ankleR);
  frameBody(pose);

  // Legs: on the ground by IK while he stands and sits (his feet where he stood), lying along the cloth.
  const plant = sh.plant;
  const legLie = sh.lie;
  for (const side of ['L', 'R'] as const) {
    const hip = pose[`hip${side}`];
    const knee = pose[`knee${side}`];
    const ankle = pose[`ankle${side}`];
    // (planted: the thigh's and the knee's angles that put the ankle over his foot on the ground)
    const hm = M[`hip${side}`].elements;
    const [thigh, kneeBend] = legIK(ANKLE_UP - hm[13], ANKLE_Z + s.feetZ - hm[14]);
    // (the thigh's angle in his space: 0 hanging straight down, − forward)
    const pThigh = thigh * plant;
    const pKnee = kneeBend * plant;
    // (lying: the thigh rises toward his feet as the cloth does, the left knee up)
    const up = side === 'L';
    const kUp = up ? mix(KNEE_UP.thigh, KNEE_UP.sleepThigh, sleep) : 0;
    const lThigh = -(Math.PI / 2 + s.legs + kUp);
    const lKnee = up ? mix(KNEE_UP.knee, KNEE_UP.sleepKnee, sleep) : LEG_OUT.knee;
    const worldThigh = mix(pThigh, lThigh, legLie);
    const kneeRx = mix(pKnee, lKnee, legLie);
    hip.rx = worldThigh - hipsTilt;
    const out = up ? mix(KNEE_UP.out, KNEE_UP.sleepOut, sleep) + rock : LEG_OUT.splay;
    hip.rz = (side === 'L' ? 1 : -1) * mix(0.04, out, legLie);
    hip.ry = (side === 'L' ? 1 : -1) * mix(0.12, 0.05, legLie);
    knee.rx = kneeRx;
    // The foot (its angle in his space: 0 toes forward on level ground, −π/2 toes straight up): flat on the
    // ground while he is down; lying, the raised one flat on the cloth's rise, the other's toes up and a little
    // away along the leg.
    const shin = worldThigh + kneeRx;
    const foot = up ? -s.legs * 0.7 : -(Math.PI / 2 - TOES_UP);
    ankle.rx = mix(-shin, foot - shin, legLie);
    ankle.rz = (side === 'L' ? -1 : 1) * 0.04;
  }

  // The swing: the whole body turns about the line of the ties (the hips carry the rest).
  if (s.roll !== 0) {
    _p1.set(REST_HIPS.x + (pose.hips.px ?? 0), REST_HIPS.y + (pose.hips.py ?? 0), REST_HIPS.z + (pose.hips.pz ?? 0));
    const c = Math.cos(s.roll);
    const sn = Math.sin(s.roll);
    const y = _p1.y - s.axisY;
    const x = _p1.x;
    _p1.set(x * c - y * sn, s.axisY + x * sn + y * c, _p1.z);
    _q.setFromEuler(_e.set(pose.hips.rx ?? 0, pose.hips.ry ?? 0, pose.hips.rz ?? 0));
    _q.premultiply(_q2.setFromAxisAngle(Z_AXIS, s.roll));
    _e.setFromQuaternion(_q, 'XYZ');
    set(pose.hips, _e.x, _e.y, _e.z, _p1.x - REST_HIPS.x, _p1.y - REST_HIPS.y, _p1.z - REST_HIPS.z);
  }
  frameBody(pose);

  // Arms: free standing; by IK onto the cloth beside him, then behind his head (on his belly asleep).
  _chestInv.copy(M.chest).invert();
  for (const side of ['L', 'R'] as const) {
    const out = side === 'L' ? 1 : -1;
    const sj = pose[`shoulder${side}`];
    const ej = pose[`elbow${side}`];
    const wj = pose[`wrist${side}`];
    const reach = sh.reach;
    if (reach <= 0.001) {
      set(sj, 0.02, 0, out * 0.06);
      set(ej, -0.12);
      set(wj);
      continue;
    }
    // The targets, in chest space: on the cloth beside his seat (his space), behind his head, on his belly.
    const cloth = _t.set(out * ON_CLOTH.out, hipsY - ON_CLOTH.down, ON_CLOTH.back).applyMatrix4(_chestInv);
    const nape = _w.set(out * NAPE.x, NAPE.y, NAPE.z).applyMatrix4(M.head).applyMatrix4(_chestInv);
    const belly = _v.set(out * BELLY.x, BELLY.y + breath * 6, BELLY.z);
    nape.lerp(belly, sleep);
    const target = nape.lerp(cloth, sh.cloth);
    _pole.copy(POLE_NAPE).lerp(POLE_BELLY, sleep).lerp(POLE_CLOTH, sh.cloth).normalize();
    _pole.x *= out;
    const arm = solveArm(side, target, _pole);
    const sa = arm[`shoulder${side}`] ?? {};
    const ea = arm[`elbow${side}`] ?? {};
    set(sj, mix(0.02, sa.rx ?? 0, reach), mix(0, sa.ry ?? 0, reach), mix(out * 0.06, sa.rz ?? 0, reach));
    set(ej, mix(-0.12, ea.rx ?? 0, reach));
    set(wj, 0, 0, 0);
  }

  // His pack: off his back, down onto the ground beside the hammock, its straps toward it.
  if (s.pack !== 'none' && sh.pack > 0.001) packDown(s, sh.pack, pose.backpack);
  else set(pose.backpack);
  return pose;
}

/** The backpack `k` of the way from his back to the ground at (`packX`, `packZ`) (its joint from the chest's). */
function packDown(s: HammockPoseState, k: number, out: JointPose): void {
  const style = s.pack as PackStyle;
  // On his back and on the ground, in his space.
  _lm.multiplyMatrices(M.chest, _lm2.makeTranslation(REST_LOCAL.backpack));
  _v.setFromMatrixPosition(_lm);
  _q.setFromRotationMatrix(_lm);
  _w.set(s.packX, s.packY - PACK_BOTTOM[style], s.packZ);
  // (its straps, on his back toward +z of the chest, turned to face `packYaw`)
  _q2.setFromAxisAngle(Y_AXIS, s.packYaw);
  const e = smooth(k);
  _v.lerp(_w, e);
  // (out behind him first, lifted clear of the cloth)
  _v.y += Math.sin(Math.PI * e) * 2.5;
  _q.slerp(_q2, e);
  // Into the chest's space, from its rest place there.
  _lm.compose(_v, _q, ONE).premultiply(_chestInv.copy(M.chest).invert());
  _v.setFromMatrixPosition(_lm).sub(REST_LOCAL.backpack);
  _e.setFromRotationMatrix(_lm, 'XYZ');
  set(out, _e.x, _e.y, _e.z, _v.x, _v.y, _v.z);
}

const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (v: number) => {
  const c = Math.min(1, Math.max(0, v));
  return c * c * (3 - 2 * c);
};
