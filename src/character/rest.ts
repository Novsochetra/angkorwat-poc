import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { solveArm } from './Animator';
import type { PackStyle } from './parts/gear';
import type { JointPose, Pose } from './pose';
import { JOINTS, SOLE_POINTS, type JointName } from './skeleton';

/**
 * Resting on the ground, watching the sky: sitting down (upright, his legs
 * out in front, his hands resting on them, looking ahead) and lying on his back
 * (hands behind his head), with the way down and back up, breathing, a slow look
 * round, and sleep. A posture for `Animator.posture` with
 * `postureFeet = false`: it places the body itself (the seat, the thighs,
 * the soles on the ground, y = 0). The map's J / L (roam/_rest.ts) and the
 * viewer's `anim=sit|lie|sleep`.
 *
 * One number says where he is (`u`): 0 standing ‥ 1 sitting ‥ 2 lying. The
 * shapes along it (stand, crouch, seat, sit, half way back, lie) flow into
 * each other (a monotone cubic per value, as the prayer's keys), so a
 * caller only eases `u` from where he is to where he goes: sitting down is
 * 0 → 1, lying down from standing 0 → 2 (through the sit), getting up the
 * same way back.
 *
 * The hips are placed by the shapes (how high, how far back; once down, as
 * low as the seat lets them, the sit bones staying put while he leans
 * back); the legs reach the ground by IK (the feet stay where they stood
 * while he goes down, then slide out: sitting both legs out on their heels;
 * lying the left knee up, the right leg out); the arms by IK too: the hands
 * on his legs, on the ground behind him (on the way back), or behind his head.
 * Sitting his pack stays on; lying back he puts it on the ground beside him
 * (on his right; it goes back on as he sits up).
 *
 * Units: body units (BU) in the explorer's space (+z forward, +x his left).
 */

/** Where he is along the way (`RestState.u`). */
export const REST_U = { stand: 0, sit: 1, lie: 2 } as const;

/** Seconds for each step along the way, down and up: standing ↔ sitting, sitting ↔ lying (getting up is a little quicker). */
export const REST_TIME = { sit: { down: 1.0, up: 0.8 }, lie: { down: 0.75, up: 0.6 } } as const;

export interface RestState {
  /** Where he is: 0 standing ‥ 1 sitting (upright, his hands on his legs) ‥ 2 lying on his back (hands behind his head). */
  u: number;
  /** Asleep, 0‥1 (lying: slow deep breaths, the head rolled aside). */
  sleep: number;
  /** Seconds (the breathing and the slow look round). */
  t: number;
  /** His backpack (it goes down beside him), or none. */
  pack: PackStyle | 'none';
  /** The knife's long sheath on his right hip (the shorts' belt): he sits a little higher on it. */
  knife: boolean;
}

/** Seconds to go from `from` to `to` along the way (standing to lying: through sitting). */
export function restDuration(from: number, to: number): number {
  const way = to > from ? 'down' : 'up';
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const part = (a: number, b: number) => Math.max(0, Math.min(hi, b) - Math.max(lo, a));
  return part(0, 1) * REST_TIME.sit[way] + part(1, 2) * REST_TIME.lie[way];
}

// ── The shapes ─────────────────────────────────────────────────────────────

/** A resting body (radians, BU). */
interface Shape {
  /** Tilts (+ forward / down). */
  hips: number;
  chest: number;
  neck: number;
  head: number;
  /** The hips joint: how high over the ground and how far forward of where it stands (BU); `seated` 1: as low as the seat lets it, the sit bones at `SEAT_Z`. */
  height: number;
  back: number;
  seated: number;
  /** 0 the legs as they stand ‥ 1 by IK to the ground. */
  plant: number;
  /** Where the ankles go once the feet leave their spot (`feet` 0): this far ahead of the hips joint (BU). */
  stepL: number;
  stepR: number;
  /** A foot flat on the ground (1), or on its heel at `foot` from the shin (0; + toes forward). */
  flatL: number;
  flatR: number;
  footL: number;
  footR: number;
  /** 1 the feet stay where they stood ‥ 0 they go to `step`. */
  feet: number;
  /** Knees out (hip rz) and the feet turned out (hip ry). */
  splay: number;
  turn: number;
  /** The arms hanging free (standing, crouching): shoulder swing and spread, elbow. */
  armRx: number;
  armRz: number;
  elbow: number;
  /** 0 free arms ‥ 1 by IK; the IK fists 0 flat on the ground behind him ‥ 1 behind his head, or (`knee` 1) on his legs. */
  reach: number;
  nape: number;
  knee: number;
  /** His backpack: 0 on his back ‥ 1 on the ground beside him. */
  pack: number;
}
type ShapeKey = keyof Shape;

const REST_HIPS = JOINTS.hips.pivot;
const STAND: Shape = {
  hips: 0, chest: 0, neck: 0, head: 0,
  height: REST_HIPS[1], back: REST_HIPS[2], seated: 0,
  plant: 0, stepL: 0, stepR: 0, flatL: 1, flatR: 1, footL: 0, footR: 0, feet: 1,
  splay: 0.03, turn: 0.14,
  armRx: 0.02, armRz: 0.06, elbow: -0.12, reach: 0, nape: 0, knee: 0, pack: 0,
};
/** Squatting, the seat going back, the hands going to his legs. */
const CROUCH: Shape = {
  hips: 0.32, chest: 0.3, neck: 0, head: -0.1,
  height: 6.3, back: -2.2, seated: 0,
  plant: 1, stepL: 4.5, stepR: 4.5, flatL: 1, flatR: 1, footL: 0, footR: 0, feet: 1,
  splay: 0.14, turn: 0.1,
  armRx: 0.5, armRz: 0.25, elbow: -0.3, reach: 0.35, nape: 0, knee: 1, pack: 0,
};
/**
 * Sitting up, his legs out in front on their heels, his hands resting on
 * them, looking ahead (the pack stays on). (His legs are short and his
 * belly round: knees drawn up would hide under it, and hands on his lap
 * would be on his belly.)
 */
const SIT: Shape = {
  hips: -0.1, chest: 0.14, neck: -0.04, head: -0.04,
  height: 3, back: -5, seated: 1,
  plant: 1, stepL: 7.3, stepR: 7.6, flatL: 0, flatR: 0, footL: 0.2, footR: 0.25, feet: 0,
  splay: 0.12, turn: 0.12,
  armRx: 0.4, armRz: 0.2, elbow: -0.2, reach: 1, nape: 0, knee: 1, pack: 0,
};
/** Leaning back on his hands, the left knee up, the right leg out (the way back to lying; the pack off beside him). */
const RECLINE: Shape = {
  hips: -0.65, chest: -0.4, neck: -0.05, head: -0.05,
  height: 3, back: -5, seated: 1,
  plant: 1, stepL: 5.4, stepR: 7.2, flatL: 1, flatR: 0, footL: 0, footR: 0.25, feet: 0,
  splay: 0.1, turn: 0.08,
  armRx: 0.4, armRz: 0.2, elbow: -0.2, reach: 1, nape: 0, knee: 0, pack: 1,
};
/** Half way back: the hands off the ground, going up behind his head. */
const BACK: Shape = { ...RECLINE, hips: -0.9, chest: -0.12, neck: -0.05, head: -0.3, nape: 0.5 };
/** Lying on his back (the pelvis tilt: `lieHips`), the left knee up, the hands behind his head, looking straight up. */
const LIE: Shape = { ...RECLINE, hips: -1.2, chest: -0.04, neck: -0.04, head: -0.28, stepL: 5.2, stepR: 7.3, nape: 1 };

const FIELDS = Object.keys(STAND) as ShapeKey[];

/** The keys along `u` (made once: the lying tilt is solved against his outline). */
let KEYS: readonly (readonly [number, Shape])[] | null = null;
function keys(): readonly (readonly [number, Shape])[] {
  if (KEYS) return KEYS;
  const lie = { ...LIE, hips: lieHips() };
  const back = { ...BACK, hips: (SIT.hips + lie.hips) / 2 };
  return (KEYS = [[0, STAND], [0.45, CROUCH], [1, SIT], [1.45, back], [2, lie]]);
}

/** The shape at `u`: a monotone cubic through the keys per value (it flows through them, never past one; at rest at the ends). */
function shapeAt(u: number, ks: readonly (readonly [number, Shape])[], out: Shape): Shape {
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

// ── His outline ────────────────────────────────────────────────────────────

type Pts = readonly (readonly [number, number, number])[];
type Outline = readonly (readonly [JointName, Pts])[];
/**
 * Points of his outline (BU, from the joint), measured off the blocks: the
 * seat and the back of the belt, the backs of the thighs, the shins, the
 * soles; the back of the shirt and the collar, the back of his big hair.
 */
/** The corners of a box's side faces (x at both sides and the middle). */
const box = (x: number, ys: readonly number[], zs: readonly number[]): Pts => [-x, 0, x].flatMap((a) => ys.flatMap((y) => zs.map((z) => [a, y, z] as const)));
const THIGH_BOX = box(1.8, [0, -1.5, -3.1], [-2.5, 2.8]);
const SHIN_BOX = box(1.6, [0.3, -2, -4.3], [-2.3, 1.5]);
const SEAT_OUTLINE: Outline = [
  ['hips', [...box(3.2, [-0.95, 0.9], [-2.6, 2.8]), [0, 2, -3.0]]],
  ['hipL', THIGH_BOX],
  ['hipR', THIGH_BOX],
];
/** The knife's sheath (hips space, on his right hip): its tip may go a little into the ground (it would swing up), no more. */
const KNIFE_OUTLINE: Outline = [['hips', [[-5.1, -3.1, -1.1], [-5.1, -3.1, 0.1]]]];
const LEG_OUTLINE: Outline = [
  ['kneeL', SHIN_BOX],
  ['kneeR', SHIN_BOX],
  ['ankleL', SOLE_POINTS],
  ['ankleR', SOLE_POINTS],
];
const BACK_OUTLINE: Outline = [
  ['chest', [[0, 1, -3.1], [0, 4, -3.1], [0, 6.5, -3.1], [0, 7.5, -3.4], [3.5, 3.5, -3.1], [-3.5, 3.5, -3.1]]],
  ['head', [[0, 1, -5.4], [0, 2.5, -7.4], [0, 4, -8.4], [0, 6.5, -8.4], [0, 9, -8.4], [0, 10, -7.4], [0, 11.5, -5.4], [5, 6.5, -7], [-5, 6.5, -7]]],
];
const ALL_OUTLINE: Outline = [...SEAT_OUTLINE, ...LEG_OUTLINE, ...BACK_OUTLINE];

/** The sit bones (hips space), and where they stay once he is down (z, BU: behind where his feet stood). */
const SEAT_POINT = new Vector3(0, -1, -2.7);
const SEAT_Z = -7.6;
/** Where the feet stand (z, BU). */
const FEET_Z = JOINTS.ankleL.pivot[2];
/**
 * A hand on the ground, its fingers down and a little back (his arms are
 * short: a palm laid flat would not reach): the fist's middle this high
 * (BU, the fingertips on the ground), this far out and back from the sit bones.
 */
const HAND = { up: 1.5, out: 6.4, back: -3.0 };
/** Fists behind his head (head space), and which way the elbows point (chest space; + out). */
const NAPE = new Vector3(4.4, 3.8, -5.2);
const POLE_GROUND = new Vector3(0.45, 0, -1).normalize();
const POLE_NAPE = new Vector3(1, 0.35, 0.35).normalize();
/** Fists resting on his legs sitting: this far from the knee to the ankle, this high over the shin's middle (BU); the elbows out and back. */
const ON_SHIN = { along: 0.3, up: 2.7 };
const POLE_KNEE = new Vector3(1, -0.2, -0.5).normalize();
/** Fingers of a hand on the ground: down, a little back and out. */
const FINGERS = new Vector3(0.15, -1, -0.3).normalize();
/**
 * The backpack put down: standing on the ground beside him on his right,
 * its straps toward him (BU: how far out its strap side is, how far forward
 * of the sit bones its middle is), and how high its bottom is from its
 * joint for each pack (gear.ts).
 */
const PACK_DOWN = { x: -8.7, z: 2.2 };
const PACK_BOTTOM: Record<PackStyle, number> = { explorer: -6.8, default: -5.5 };
/** Leg bones (BU): thigh, shin (rest shin leans back a little). */
const THIGH = JOINTS.hipL.pivot[1] - JOINTS.kneeL.pivot[1];
const SHIN = Math.hypot(JOINTS.kneeL.pivot[1] - JOINTS.ankleL.pivot[1], JOINTS.kneeL.pivot[2] - JOINTS.ankleL.pivot[2]);
const SHIN_LEAN = Math.atan2(JOINTS.kneeL.pivot[2] - JOINTS.ankleL.pivot[2], JOINTS.kneeL.pivot[1] - JOINTS.ankleL.pivot[1]);

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
const _p2 = new Vector3();
const _pole = new Vector3();
const _lm = new Matrix4();
const _lm2 = new Matrix4();

/** A joint's transform from its parent under `jp` (as the Animator applies a pose). */
function local(name: JointName, jp: JointPose | undefined, out: Matrix4): Matrix4 {
  _v.copy(REST_LOCAL[name]);
  if (jp) _v.set(_v.x + (jp.px ?? 0), _v.y + (jp.py ?? 0), _v.z + (jp.pz ?? 0));
  _q.setFromEuler(_e.set(jp?.rx ?? 0, jp?.ry ?? 0, jp?.rz ?? 0));
  return out.compose(_v, _q, ONE);
}

/** The joints' transforms in his space (the hips down). */
const M = Object.fromEntries((Object.keys(JOINTS) as JointName[]).map((n) => [n, new Matrix4()])) as Record<JointName, Matrix4>;
const BODY_CHAIN: readonly JointName[] = ['hips', 'chest', 'neck', 'head', 'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR'];

function frameBody(pose: Pose): void {
  for (const n of BODY_CHAIN) {
    const p = JOINTS[n].parent!;
    M[n].multiplyMatrices(p === 'body' ? _lm.identity() : M[p], local(n, pose[n], _lm2));
  }
}

/** Lowest point (y) of an outline under the frames. */
function lowest(sets: Outline): number {
  let y = Infinity;
  for (const [j, pts] of sets) {
    const m = M[j].elements;
    for (const p of pts) y = Math.min(y, m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]);
  }
  return y;
}

// ── The body ───────────────────────────────────────────────────────────────

/** The joints of a shape, the legs as they stand (the IK comes after), the hips at `y`, `z`. */
function bodyPose(s: Shape, y: number, z: number, out: Pose): Pose {
  out.hips = { rx: s.hips, py: y - REST_HIPS[1], pz: z - REST_HIPS[2] };
  out.chest = { rx: s.chest };
  out.neck = { rx: s.neck };
  out.head = { rx: s.head };
  out.hipL = { rx: -s.hips, rz: s.splay, ry: s.turn };
  out.kneeL = {};
  out.ankleL = { rz: -s.splay };
  out.hipR = { rx: -s.hips, rz: -s.splay, ry: -s.turn };
  out.kneeR = {};
  out.ankleR = { rz: s.splay };
  return out;
}

/** The hips joint's z once he is down: the sit bones stay at `SEAT_Z` whatever the tilt. */
const seatedZ = (tilt: number) => SEAT_Z - (SEAT_POINT.y * Math.sin(tilt) + SEAT_POINT.z * Math.cos(tilt));

/**
 * How deep the lowest point of a foot is under its ankle (BU), the foot at
 * `a` in the world (0 level; − toes up).
 */
function footDepth(a: number): number {
  const c = Math.cos(a);
  const s = Math.sin(a);
  let d = 0;
  for (const p of SOLE_POINTS) d = Math.max(d, -(p[1] * c - p[2] * s));
  return d;
}

/**
 * Two-bone leg IK in the side plane: the thigh's angle in the world and the
 * knee's bend that put the ankle `dy`, `dz` from the hip joint (short of it
 * when out of reach).
 */
function legIK(dy: number, dz: number): [number, number] {
  const d = Math.min(THIGH + SHIN - 1e-3, Math.max(Math.abs(THIGH - SHIN) + 1e-3, Math.hypot(dy, dz)));
  const bend = Math.acos(clamp((d * d - THIGH * THIGH - SHIN * SHIN) / (2 * THIGH * SHIN), -1, 1));
  const aim = Math.atan2(-dz, -dy);
  return [aim - Math.atan2(SHIN * Math.sin(bend), THIGH + SHIN * Math.cos(bend)), bend - SHIN_LEAN];
}

/** One leg onto the ground by IK (`k` of the way from hanging), the foot flat or on its heel. */
function plantLeg(side: 'L' | 'R', s: Shape, k: number, hipsZ: number, pose: Pose): void {
  const hip = M[`hip${side}`].elements;
  const flat = side === 'L' ? s.flatL : s.flatR;
  const foot = side === 'L' ? s.footL : s.footR;
  const step = side === 'L' ? s.stepL : s.stepR;
  const tz = mix(hipsZ + step, FEET_Z, s.feet);
  // (on its heel the foot's angle comes with the shin: once more with the shin found)
  let thigh = 0;
  let knee = 0;
  let shin = -Math.PI / 2;
  for (let i = 0; i < 2; i++) {
    const up = mix(footDepth(shin + foot), footDepth(0), flat);
    [thigh, knee] = legIK(up - hip[13], tz - hip[14]);
    shin = thigh + knee;
  }
  const j = pose[`hip${side}`]!;
  j.rx = mix(0, thigh, k) - s.hips;
  pose[`knee${side}`] = { rx: mix(0, knee, k) };
  const t = mix(0, thigh, k) + mix(0, knee, k);
  pose[`ankle${side}`]!.rx = mix(foot, -t, flat) * k;
}

/**
 * The pelvis tilt that rests him on his back with both the seat and the
 * back of his shirt or his big hair on the ground: the torso leans on them
 * a little, as on a pillow.
 */
function lieHips(): number {
  const pose: Pose = {};
  let lo = -1.56;
  let hi = -0.5;
  for (let i = 0; i < 22; i++) {
    const tilt = (lo + hi) / 2;
    const s = { ...LIE, hips: tilt };
    frameBody(bodyPose(s, 0, seatedZ(tilt), pose));
    // (the thighs as they will lie: level forward)
    pose.hipL!.rx = pose.hipR!.rx = -Math.PI / 2 - tilt;
    frameBody(pose);
    // (higher up top than at the seat: lie back further)
    if (lowest(BACK_OUTLINE) > lowest(SEAT_OUTLINE)) hi = tilt;
    else lo = tilt;
  }
  return (lo + hi) / 2;
}

const _s: Shape = { ...STAND };
const _chestInv = new Matrix4();
const _fore = new Matrix4();
const _hand = new Matrix4();
const _arm = new Matrix4();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _prop = new Vector3();
const _aim = new Vector3();

/** The resting body at `s` (see `RestState`). */
export function restPose(s: RestState): Pose {
  const sh = shapeAt(s.u, keys(), _s);
  const t = s.t;
  // Life: breathing, a slow look round (sitting more, lying less); asleep slow deep breaths and the head rolled aside.
  const life = smooth((s.u - 0.75) / 0.25);
  const lying = smooth(s.u - 1);
  const sleep = s.sleep * lying;
  const awake = 1 - sleep;
  const tau = Math.PI * 2;
  const breath = Math.sin((t * tau) / (4.2 + 2.3 * sleep)) * (0.018 + 0.022 * sleep);
  // (sitting only a little, as he looks round standing)
  const look = (Math.sin((t * tau) / 13) * 0.34 + Math.sin((t * tau) / 5.3 + 1) * 0.1) * (0.35 + 0.3 * lying) * awake;
  const nod = Math.sin((t * tau) / 9.1 + 2) * 0.06 * awake;
  sh.chest += life * breath;
  sh.neck += life * 0.3 * breath;
  // (the raised knee rocks out and back)
  const rock = Math.sin((t * tau) / 7.7) * 0.07 * life * awake;

  // The hips where the shape says; down on the seat, as low as it goes.
  const z = mix(sh.back, seatedZ(sh.hips), sh.seated);
  let y = sh.height;
  const pose = bodyPose(sh, y, z, {});
  pose.head = { rx: sh.head + life * nod - 0.08 * sleep, ry: life * look + 0.42 * sleep, rz: -0.2 * sleep };
  pose.neck = { rx: sh.neck, ry: life * look * 0.3 + 0.12 * sleep };
  pose.hipL!.rz = (pose.hipL!.rz ?? 0) + rock;
  frameBody(pose);
  const seat = s.knife ? [...SEAT_OUTLINE, ...KNIFE_OUTLINE] : SEAT_OUTLINE;
  for (let i = 0; i < 5; i++) {
    if (sh.plant > 0) {
      plantLeg('L', sh, sh.plant, z, pose);
      plantLeg('R', sh, sh.plant, z, pose);
      frameBody(pose);
    }
    if (sh.seated <= 0 || i === 4) break;
    // (the seat on the ground, then the legs again from there)
    y = mix(sh.height, y - lowest(seat), sh.seated);
    pose.hips!.py = y - REST_HIPS[1];
    frameBody(pose);
  }
  // Nothing under the ground (the back and the hair lying, the heels).
  const lift = Math.max(0, -Math.min(lowest(ALL_OUTLINE), lowest(seat)));
  if (lift > 0) {
    pose.hips!.py! += lift;
    for (const n of BODY_CHAIN) M[n].premultiply(_lm.makeTranslation(0, lift, 0));
  }

  // Arms: hanging free, or by IK to the ground behind him or behind his head.
  _chestInv.copy(M.chest).invert();
  for (const side of ['L', 'R'] as const) {
    const out = side === 'L' ? 1 : -1;
    const free: Pose = {
      [`shoulder${side}`]: { rx: sh.armRx, rz: out * sh.armRz },
      [`elbow${side}`]: { rx: sh.elbow },
      [`wrist${side}`]: {},
    };
    if (sh.reach <= 0.001) {
      Object.assign(pose, free);
      continue;
    }
    // The targets, in chest space.
    const ground = _t.set(out * HAND.out, HAND.up, SEAT_Z + HAND.back);
    const nape = _w.set(out * NAPE.x, NAPE.y, NAPE.z).applyMatrix4(M.head);
    const knee = _p1.setFromMatrixPosition(M[`knee${side}`]).lerp(_p2.setFromMatrixPosition(M[`ankle${side}`]), ON_SHIN.along);
    knee.y += ON_SHIN.up;
    const target = ground.lerp(nape, sh.nape).lerp(knee, sh.knee).applyMatrix4(_chestInv);
    _pole.copy(POLE_GROUND).lerp(POLE_NAPE, sh.nape).lerp(POLE_KNEE, sh.knee);
    _pole.x *= out;
    // A hand on the ground: the wrist bends to put the fingers down, which moves the fist,
    // so solve again with the target shifted by what the bend moved it (twice is close enough).
    let arm = solveArm(side, target, _pole);
    const flat = (1 - sh.nape) * (1 - sh.knee);
    if (flat > 0.001) {
      _aim.copy(target);
      for (let i = 0; i < 2; i++) {
        arm[`wrist${side}`] = groundWrist(arm, side, out);
        armProp(arm, side, _prop);
        _aim.add(_v.subVectors(target, _prop));
        arm = solveArm(side, _aim, _pole);
      }
      const w = groundWrist(arm, side, out);
      arm[`wrist${side}`] = { rx: (w.rx ?? 0) * flat, ry: (w.ry ?? 0) * flat, rz: (w.rz ?? 0) * flat };
    }
    blendArm(free, arm, sh.reach, side, pose);
  }

  if (s.pack !== 'none' && sh.pack > 0.001) pose.backpack = packDown(s.pack, sh.pack);
  return pose;
}

/**
 * The backpack `k` of the way from his back to the ground beside him (its
 * joint from the chest's): it slides off behind him, then round to his
 * right side, turning its straps to him.
 */
function packDown(style: PackStyle, k: number): JointPose {
  // On his back and on the ground, in his space.
  _lm.multiplyMatrices(M.chest, _lm2.makeTranslation(REST_LOCAL.backpack));
  _p1.setFromMatrixPosition(_lm);
  _q.setFromRotationMatrix(_lm);
  _p2.set(PACK_DOWN.x, -PACK_BOTTOM[style], SEAT_Z + PACK_DOWN.z);
  _q2.setFromAxisAngle(_y.set(0, 1, 0), Math.PI / 2);
  const e = smooth(k);
  _p1.lerp(_p2, e);
  // (out behind him first, lifted clear of his arm)
  _p1.z -= Math.sin(Math.PI * e) * 3;
  _p1.y += Math.sin(Math.PI * e) * 1.5;
  _q.slerp(_q2, e);
  // Into the chest's space, from its rest place there.
  _lm.compose(_p1, _q, ONE).premultiply(_chestInv.copy(M.chest).invert());
  _p1.setFromMatrixPosition(_lm).sub(REST_LOCAL.backpack);
  _e.setFromRotationMatrix(_lm, 'XYZ');
  return { px: _p1.x, py: _p1.y, pz: _p1.z, rx: _e.x, ry: _e.y, rz: _e.z };
}

/** The fist's middle (chest space) for arm joints `arm`. */
function armProp(arm: Pose, side: 'L' | 'R', out: Vector3): Vector3 {
  _arm.copy(local(`shoulder${side}`, arm[`shoulder${side}`], _lm));
  _arm.multiply(local(`elbow${side}`, arm[`elbow${side}`], _lm));
  _arm.multiply(local(`wrist${side}`, arm[`wrist${side}`], _lm));
  return out.copy(REST_LOCAL[`prop${side}`]).applyMatrix4(_arm);
}

/** The wrist that puts the hand's fingers down on the ground (a little back and out), the palm to his side. */
function groundWrist(arm: Pose, side: 'L' | 'R', out: number): JointPose {
  // (the forearm's turn in his space)
  const sj = arm[`shoulder${side}`];
  _fore.extractRotation(M.chest);
  _fore.multiply(_lm.makeRotationFromEuler(_e.set(sj?.rx ?? 0, sj?.ry ?? 0, sj?.rz ?? 0)));
  _fore.multiply(_lm.makeRotationX(arm[`elbow${side}`]?.rx ?? 0));
  // Hand frame: fingers along −Y, the palm toward −X on the left hand (+X on the right), thumb +Z.
  _y.set(-out * FINGERS.x, -FINGERS.y, -FINGERS.z);
  _x.set(1, 0, 0).addScaledVector(_y, -_y.x).normalize();
  _z.crossVectors(_x, _y);
  _hand.makeBasis(_x, _y, _z);
  _hand.premultiply(_fore.transpose());
  _e.setFromRotationMatrix(_hand, 'XYZ');
  return { rx: _e.x, ry: _e.y, rz: _e.z };
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

