import { Euler, Matrix4, Quaternion, Vector3, type Object3D } from 'three';
import { VoxelBuilder } from '../voxel/VoxelBuilder';
import { BODY_UNIT_M } from '../world/scale';
import { solveArm } from './Animator';
import { ACTIONS } from './clips';
import type { JointPose, Pose } from './pose';
import { JOINTS, SOLE_POINTS, type JointName } from './skeleton';

/**
 * The lotus he picks from the boat and offers at a shrine (the map's
 * roam/_lotus.ts): the bud in his hand, and his two postures for it.
 *
 * - `buildLotus()`: a pink lotus bud closed on its long green stem, held in
 *   a fist (a prop joint: the stem along the grip axis, +z, the bud ahead).
 *   The same size as the buds of the lake's lotus bed, so the one he snaps
 *   off is the one in his hand.
 * - `lotusPickPose(base, s, paddle)`: over the boat's own posture (he sits
 *   on the thwart, roam/_boatPoses.ts `ridePose`): the paddle goes down
 *   across his lap, the other hand on it; he leans out over the side
 *   (`s.side`), the hull dipping with him, and his hand goes down to the
 *   stem (`s.fist`, the grip turned along `s.stem`), snaps it, brings the
 *   lotus up before his chest, looks at it and puts it away.
 * - `lotusLayPose(s)`: kneeling upright before a shrine (the prayer's own
 *   kneel, clips.ts `pray` at `LAY_KNEEL`: the Animator holds the prayer
 *   there meanwhile), he bows forward from the hips and lays the lotus on the
 *   floor before him with his right hand, the bud toward the shrine, his
 *   left hand on his right forearm (the respectful way to give, in Cambodia),
 *   then sits up again: the prayer goes on from there (the sampeah, the three
 *   bows).
 *
 * Both are written into one pose object each call (the Animator reads it at
 * once). Arms by IK (`solveArm`), the wrists turned so the stem lies where
 * it should, the arm solved again for the turned hand (the fist stays on its
 * mark). Units: body units (BU), his own space (+z forward, +x his left).
 */

// ── The lotus ──────────────────────────────────────────────────────────────

/** The stem from the fist to the bud's foot, and past the fist (BU); the bud's length and width. */
export const LOTUS_STEM = 4.5;
export const LOTUS_TAIL = 1.4;
export const LOTUS_BUD = 2.6;
export const LOTUS_WIDE = 1.36;
/** Its colours (sRGB): the stem, the green cup under the bud, the pale foot of the petals, pink, deeper pink, the tip. */
export const LOTUS_COLORS = { stem: 0x5d8f3c, cup: 0x6f9a3c, foot: 0xf6c4d2, body: 0xf08ab0, upper: 0xe8729c, tip: 0xc8406c } as const;

/**
 * The lotus bud on its stem, in the fist's frame: the fist's middle at the
 * origin, the stem along +z (the grip axis) from `−LOTUS_TAIL` to
 * `LOTUS_STEM`, the closed bud beyond it (its petals overlap: two crossed
 * boxes round its belly, narrower toward the deep pink tip).
 */
export function buildLotus(): VoxelBuilder {
  const b = new VoxelBuilder();
  const c = LOTUS_COLORS;
  const z0 = LOTUS_STEM;
  b.box(0, 0, (LOTUS_STEM - LOTUS_TAIL) / 2, 0.42, 0.42, LOTUS_STEM + LOTUS_TAIL, c.stem, 'foliage');
  b.box(0, 0, z0 + 0.15, 0.66, 0.66, 0.34, c.cup, 'foliage');
  b.box(0, 0, z0 + 0.48, 1.0, 1.0, 0.46, c.foot, 'petal');
  b.box(0, 0, z0 + 1.08, 1.2, 1.2, 0.86, c.body, 'petal');
  b.box(0, 0, z0 + 1.08, 1.2, 1.2, 0.86, c.body, 'petal', { rz: Math.PI / 4, shade: 0.96 });
  b.box(0, 0, z0 + 1.8, 0.86, 0.86, 0.62, c.upper, 'petal', { rz: Math.PI / 8 });
  b.box(0, 0, z0 + 2.32, 0.46, 0.46, 0.5, c.tip, 'petal', { rz: Math.PI / 8 });
  return b;
}

// ── Shared: matrices of the pose, arms that aim what they hold ─────────────

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
const _rot = new Matrix4();
const _a = new Matrix4();
const _b = new Matrix4();
const _w = new Matrix4();
const _t = new Vector3();
const _d = new Vector3();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _p = new Vector3();
const _o = new Vector3();

/** A joint's transform against its parent, from the pose. */
function local(n: JointName, p: JointPose | undefined, out: Matrix4): Matrix4 {
  const r = REST_LOCAL[n];
  _v.set(r.x + (p?.px ?? 0), r.y + (p?.py ?? 0), r.z + (p?.pz ?? 0));
  _q.setFromEuler(_e.set(p?.rx ?? 0, p?.ry ?? 0, p?.rz ?? 0, 'XYZ'));
  return out.compose(_v, _q, ONE);
}

/** The chest's frame in his space for pose `p` (into `_chest`), its inverse (`_inv`) and the inverse's turn alone (`_rot`). */
function chestFrame(p: Pose): void {
  local('hips', p.hips, _hips);
  _chest.multiplyMatrices(_hips, local('chest', p.chest, _a));
  _inv.copy(_chest).invert();
  _rot.extractRotation(_inv);
}

/** The prop point under the wrist (BU, wrist space): the fist's middle. */
const FIST_DROP = JOINTS.propR.pivot[1] - JOINTS.wristR.pivot[1];
const SHOULDER = {
  L: new Vector3(...JOINTS.shoulderL.pivot).sub(new Vector3(...JOINTS.chest.pivot)),
  R: new Vector3(...JOINTS.shoulderR.pivot).sub(new Vector3(...JOINTS.chest.pivot)),
};
const ELBOW = {
  L: new Vector3(...JOINTS.elbowL.pivot).sub(new Vector3(...JOINTS.shoulderL.pivot)),
  R: new Vector3(...JOINTS.elbowR.pivot).sub(new Vector3(...JOINTS.shoulderR.pivot)),
};

/** The forearm's turn (chest space) of an arm posed by `solveArm`: shoulder · elbow, into `out`. */
function forearm(arm: Pose, side: 'L' | 'R', out: Matrix4): Matrix4 {
  const s = arm[`shoulder${side}`]!;
  out.makeRotationFromEuler(_e.set(s.rx ?? 0, s.ry ?? 0, s.rz ?? 0, 'XYZ'));
  return out.multiply(_b.makeRotationX(arm[`elbow${side}`]!.rx ?? 0));
}

/**
 * The wrist turn (into `out`) that points the fist's grip axis (+z) along
 * `dir` (chest space, unit), the back of the hand toward the forearm as far
 * as it goes (the least bend), for an arm posed by `solveArm`.
 */
function aimWrist(arm: Pose, side: 'L' | 'R', dir: Vector3, out: JointPose): void {
  forearm(arm, side, _a);
  // (up the forearm, toward the elbow: the hand's own +y at rest)
  _y.set(0, 1, 0).applyMatrix4(_b.extractRotation(_a));
  _z.copy(dir);
  _y.addScaledVector(_z, -_y.dot(_z));
  if (_y.lengthSq() < 1e-6) _y.set(0, 1, 0).addScaledVector(_z, -_z.y);
  _y.normalize();
  _x.crossVectors(_y, _z);
  _w.makeBasis(_x, _y, _z);
  _a.transpose().multiply(_w);
  _e.setFromRotationMatrix(_a, 'XYZ');
  out.rx = _e.x;
  out.ry = _e.y;
  out.rz = _e.z;
}

/**
 * An arm whose fist's middle is on `target` (chest space) with the lotus
 * along `dir` (chest space, unit): solved, the wrist aimed, then solved again
 * for where the turned hand puts the fist (so it stays on its mark).
 */
function holdAt(side: 'L' | 'R', target: Vector3, dir: Vector3, pole: Vector3): Pose {
  let arm = solveArm(side, target, pole);
  const wrist: JointPose = {};
  aimWrist(arm, side, dir, wrist);
  // (the fist moved by the turned hand: from (0, drop, 0) to the turned one, in chest space)
  _o.set(0, FIST_DROP, 0)
    .applyEuler(_e.set(wrist.rx ?? 0, wrist.ry ?? 0, wrist.rz ?? 0, 'XYZ'))
    .sub(_p.set(0, FIST_DROP, 0))
    .applyMatrix4(_b.extractRotation(forearm(arm, side, _a)));
  arm = solveArm(side, _t.copy(target).sub(_o), pole);
  aimWrist(arm, side, dir, wrist);
  arm[`wrist${side}`] = wrist;
  return arm;
}

const ARM_JOINTS = { L: ['shoulderL', 'elbowL', 'wristL'], R: ['shoulderR', 'elbowR', 'wristR'] } as const;
const CH = ['rx', 'ry', 'rz', 'px', 'py', 'pz'] as const;

/** `out`'s arm on `side` → `arm`'s by `k`. */
function armToward(out: Pose, arm: Pose, side: 'L' | 'R', k: number): void {
  if (k <= 0) return;
  for (const j of ARM_JOINTS[side]) {
    const o = (out[j] ??= {});
    const p = arm[j];
    for (const c of CH) o[c] = (o[c] ?? 0) + ((p?.[c] ?? 0) - (o[c] ?? 0)) * k;
  }
}

const smooth = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** His eyes (chest space, BU: rows 22.4‥24.4 of the face, at its front). */
const EYES = new Vector3(0, 23.4 - JOINTS.chest.pivot[1], 4.5 - JOINTS.chest.pivot[2]);
/** Turn the head (and a little the neck) toward `look` (his space) by `w` (the chest's frame worked out already). */
function lookAt(p: Pose, look: Vector3, w: number): void {
  if (w <= 0) return;
  _d.copy(look).applyMatrix4(_inv).sub(EYES);
  const yaw = Math.max(-1.1, Math.min(1.1, Math.atan2(_d.x, Math.max(0.5, _d.z))));
  const down = Math.max(-0.5, Math.min(1.0, Math.atan2(-_d.y, Math.max(0.5, Math.hypot(_d.x, _d.z)))));
  const neck = (p.neck ??= {});
  const head = (p.head ??= {});
  neck.ry = (neck.ry ?? 0) + yaw * 0.3 * w;
  head.ry = (head.ry ?? 0) + yaw * 0.6 * w;
  neck.rx = (neck.rx ?? 0) + down * 0.3 * w;
  head.rx = (head.rx ?? 0) + down * 0.55 * w;
}

// ── In the boat: leaning out over the side ─────────────────────────────────

/** How he is (the add-on eases each). */
export interface LotusPickState {
  /** The hand that reaches, and the side he leans over: +1 his left, −1 his right. */
  side: 1 | -1;
  /** Leaning out over the side (0 sitting ‥ 1). */
  lean: number;
  /** The reaching hand on `fist` (0: on the paddle ‥ 1). */
  arm: number;
  /** Where the reaching fist's middle is (BU, his space) and the way the lotus in it points (his space, unit). */
  readonly fist: Vector3;
  readonly stem: Vector3;
  /** The paddle laid across his lap, the other hand on it (0 ‥ 1). */
  lap: number;
  /** Where he looks (BU, his space), and how much. */
  readonly look: Vector3;
  lookW: number;
  /** The hull's dip toward him (radians, + left side up: the posture's hips go with it). */
  roll: number;
}

export function lotusPickState(): LotusPickState {
  return { side: 1, lean: 0, arm: 0, fist: new Vector3(0, 8, 6), stem: new Vector3(0, 1, 0), lap: 0, look: new Vector3(0, 12, 20), lookW: 0, roll: 0 };
}

/** The paddle laid across the lap (chest space, roam/_boatPoses.ts `LAP_C`) and the hands' places on it (m from its middle). */
const LAP = new Vector3(0, -1.2, 6.2);
const PADDLE_HAND = 0.23 / BODY_UNIT_M;
/** How far he leans: the chest over the side, forward; the hips with it (radians at lean 1). */
const LEAN_SIDE = 0.5;
const LEAN_FWD = 0.22;
const HIPS_SIDE = 0.12;
/** How much of the lean the neck and head take back (radians at lean 1). */
const HEAD_LEVEL = 0.42;
/** Elbows: the reaching one out and back, the one on the paddle down and out. */
const POLE = { L: new Vector3(0.75, -0.5, -0.45).normalize(), R: new Vector3(-0.75, -0.5, -0.45).normalize() };
const POLE_LAP = { L: new Vector3(0.7, -1, -0.3).normalize(), R: new Vector3(-0.7, -1, -0.3).normalize() };
const _grip = new Vector3();
const _axis = new Vector3();
/** A hand's place on the paddle (its left hand on the +x end), into `out`. */
const onPaddle = (sd: 'L' | 'R', out: Vector3) => out.copy(_grip).addScaledVector(_axis, sd === 'L' ? PADDLE_HAND : -PADDLE_HAND);
const _c0 = new Matrix4();
const _c1 = new Matrix4();
const _lapPos = new Vector3();
const _lapQ = new Quaternion();
const _stem = new Vector3();
const _reach = new Vector3();

/**
 * The boat's posture `base` (its pose for this moment, changed in place)
 * with him leaning out to pick the lotus; `paddle` (the paddle's object on
 * his chest joint) goes down across his lap.
 */
export function lotusPickPose(base: Pose, s: LotusPickState, paddle: Object3D | null): Pose {
  const p = base;
  const k = smooth(s.lean);
  const side = s.side;
  // The hips dip with the hull and lean a little; the chest goes out over the side and forward.
  const hips = (p.hips ??= {});
  hips.rz = (hips.rz ?? 0) + s.roll - side * HIPS_SIDE * k;
  const chest = (p.chest ??= {});
  // (the chest against the hips before it leans: the lap is the hips', not the chest's)
  local('chest', chest, _c0);
  chest.rz = (chest.rz ?? 0) - side * LEAN_SIDE * k;
  chest.rx = (chest.rx ?? 0) + LEAN_FWD * k;
  chest.ry = (chest.ry ?? 0) + side * 0.12 * k;
  // (his head kept nearer level as he leans, as one does: the hat's brim tips less)
  const neck = (p.neck ??= {});
  const head = (p.head ??= {});
  neck.rz = (neck.rz ?? 0) + side * HEAD_LEVEL * 0.4 * k;
  head.rz = (head.rz ?? 0) + side * HEAD_LEVEL * 0.6 * k;
  chestFrame(p);

  // The paddle down across his lap (level on his thighs, whatever the chest does), the other hand on it.
  const lap = smooth(s.lap);
  _c1.copy(local('chest', chest, _b)).invert().multiply(_c0);
  _lapPos.copy(LAP).applyMatrix4(_c1);
  _lapQ.setFromRotationMatrix(_b.extractRotation(_c1));
  if (paddle) {
    paddle.position.lerp(_lapPos, lap);
    paddle.quaternion.slerp(_lapQ, lap);
    _grip.copy(paddle.position);
    _axis.set(1, 0, 0).applyQuaternion(paddle.quaternion);
  } else {
    _grip.copy(_lapPos);
    _axis.set(1, 0, 0).applyQuaternion(_lapQ);
  }
  const other = side > 0 ? 'R' : 'L';
  const mine = side > 0 ? 'L' : 'R';
  armToward(p, solveArm(other, onPaddle(other, _t), POLE_LAP[other]), other, lap);

  // The reaching hand: from its place on the paddle to the stem, the lotus along `stem`.
  const a = smooth(s.arm);
  if (a > 0) {
    onPaddle(mine, _reach);
    _d.copy(s.fist).applyMatrix4(_inv);
    _reach.lerp(_d, a);
    _stem.copy(s.stem).applyMatrix4(_rot).normalize();
    armToward(p, holdAt(mine, _reach, _stem, POLE[mine]), mine, 1);
  } else armToward(p, solveArm(mine, onPaddle(mine, _t), POLE_LAP[mine]), mine, lap);

  lookAt(p, s.look, s.lookW);
  return p;
}

// ── At a shrine: laying it on the floor before him ─────────────────────────

/** The prayer's time when both knees are down, upright (clips.ts `PRAY_KEYS`): held there while he lays the lotus. */
export const LAY_KNEEL = 2.15;

export interface LotusLayState {
  /** Bowing forward from the hips to reach the floor (0 upright ‥ 1; a little past 1 to set it down). */
  lean: number;
  /** The right hand on `fist` (0: on his thigh, the kneel's own ‥ 1). */
  arm: number;
  /** Where the right fist's middle is (BU, his space), the way the lotus in it points (his space, unit). */
  readonly fist: Vector3;
  readonly stem: Vector3;
  /** The left hand under the right forearm (0 ‥ 1). */
  support: number;
  readonly look: Vector3;
  lookW: number;
  /** Seconds (breathing). */
  t: number;
}

export function lotusLayState(): LotusLayState {
  return { lean: 0, arm: 0, fist: new Vector3(-1.5, 9, 5), stem: new Vector3(0, 0.6, 0.8).normalize(), support: 0, look: new Vector3(0, 0, 12), lookW: 0, t: 0 };
}

/** The bow toward the floor at lean 1 (radians): the hips (the thighs kept upright) and the chest… */
const LAY_HIPS = 0.7;
const LAY_CHEST = 0.5;
/** …a little over to his right and turned that way (radians at lean 1). */
const LAY_SIDE = 0.4;
const LAY_TURN = 0.12;
const POLE_LAY = { L: new Vector3(0.9, -0.4, -0.2).normalize(), R: new Vector3(-0.85, -0.45, -0.3).normalize() };
/** The left fingertips under the right forearm, toward its wrist (a share of elbow → fist), a little inside and below (chest space, BU). */
const SUPPORT_AT = 0.62;
const SUPPORT_OFF = new Vector3(0.55, -0.75, 0.1);
const _elbow = new Vector3();
const _fist = new Vector3();

/**
 * What rests on the ground kneeling (BU from the joint): the fronts of the knees and shins, the tops of the feet
 * (as the Animator plants the prayer: Animator.ts `KNEEL_POINTS`), and the soles.
 */
const KNEEL_POINTS: readonly (readonly [JointName, readonly (readonly [number, number, number])[]])[] = [
  ['kneeL', [[0, 0.5, 1.52], [0, -1.5, 1.52], [0, -2.5, 1.68], [0, -3.5, 1.68], [0, -4.4, 1.62]]],
  ['kneeR', [[0, 0.5, 1.52], [0, -1.5, 1.52], [0, -2.5, 1.68], [0, -3.5, 1.68], [0, -4.4, 1.62]]],
  ['ankleL', [[0, -0.4, 5.05], [0, 0.6, 3.0], [0, 0.6, -2.0], [0, -0.4, -3.05], ...SOLE_POINTS]],
  ['ankleR', [[0, -0.4, 5.05], [0, 0.6, 3.0], [0, 0.6, -2.0], [0, -0.4, -3.05], ...SOLE_POINTS]],
];
/** The lowest of those in pose `p` (BU over his feet's floor before the Animator plants him: how far it lowers him). */
function lowest(p: Pose): number {
  let min = Infinity;
  local('hips', p.hips, _hips);
  for (const side of ['L', 'R'] as const) {
    _a.multiplyMatrices(_hips, local(`hip${side}`, p[`hip${side}`], _b));
    _a.multiply(local(`knee${side}`, p[`knee${side}`], _b));
    for (const [j, pts] of KNEEL_POINTS) {
      if (j === `knee${side}`) for (const q of pts) min = Math.min(min, _v.set(q[0], q[1], q[2]).applyMatrix4(_a).y);
    }
    _a.multiply(local(`ankle${side}`, p[`ankle${side}`], _b));
    for (const [j, pts] of KNEEL_POINTS) {
      if (j === `ankle${side}`) for (const q of pts) min = Math.min(min, _v.set(q[0], q[1], q[2]).applyMatrix4(_a).y);
    }
  }
  return min;
}

/** The kneel's own pose (made the first time: clips.ts is loaded by then), and how far the Animator lowers it to the floor (BU). */
let KNEEL: Pose | null = null;
let DROP = 0;
/** The joints the posture writes (the rest are the Animator's rest: a posture leaves out none it holds). */
const BODY_JOINTS: readonly JointName[] = ['hips', 'chest', 'neck', 'head', 'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR', 'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR'];
const OUT: Pose = Object.fromEntries(BODY_JOINTS.map((n) => [n, {}])) as Pose;
/** `out` = `src` for `BODY_JOINTS` (no allocation: `out`'s own joint objects). */
function copyInto(out: Pose, src: Pose): Pose {
  for (const n of BODY_JOINTS) {
    const o = out[n]!;
    const q = src[n];
    for (const c of CH) o[c] = q?.[c] ?? 0;
  }
  return out;
}

/**
 * The posture at a shrine for state `s` (see the module's notes). Its targets are in his space on the floor he
 * kneels on (the Animator plants the kneel there: `postureFeet` stays true, the prayer playing under it).
 */
export function lotusLayPose(s: LotusLayState): Pose {
  if (!KNEEL) {
    KNEEL = JSON.parse(JSON.stringify(ACTIONS.pray.pose(LAY_KNEEL))) as Pose;
    DROP = lowest(KNEEL);
  }
  const p = copyInto(OUT, KNEEL);
  // (past 1: a little further down, setting it on the floor)
  const k = smooth(s.lean) + Math.max(0, s.lean - 1);
  const br = 0.012 * Math.sin(s.t * 1.6);
  // Bowing from the hips, the thighs kept as they kneel; the chest a little more.
  const hips = (p.hips ??= {});
  hips.rx = (hips.rx ?? 0) + LAY_HIPS * k;
  for (const j of ['hipL', 'hipR'] as const) {
    const h = (p[j] ??= {});
    h.rx = (h.rx ?? 0) - LAY_HIPS * k;
  }
  const chest = (p.chest ??= {});
  chest.rx = (chest.rx ?? 0) + LAY_CHEST * k + br;
  // (a little over to his right, turned that way: the hand that lays it)
  chest.rz = (chest.rz ?? 0) + LAY_SIDE * k;
  chest.ry = (chest.ry ?? 0) - LAY_TURN * k;
  chestFrame(p);

  // The right hand: from his thigh to `fist`, the lotus along `stem`.
  const a = smooth(s.arm);
  let right: Pose | null = null;
  if (a > 0) {
    // (his space on the floor → the pose's, before the Animator lowers it by `DROP`)
    _fist.copy(s.fist).setY(s.fist.y + DROP).applyMatrix4(_inv);
    _stem.copy(s.stem).applyMatrix4(_rot).normalize();
    right = holdAt('R', _fist, _stem, POLE_LAY.R);
    armToward(p, right, 'R', a);
  }
  // The left fingertips under the right forearm while he gives.
  const sp = smooth(s.support) * a;
  if (right && sp > 0) {
    const sh = right.shoulderR!;
    _a.makeRotationFromEuler(_e.set(sh.rx ?? 0, sh.ry ?? 0, sh.rz ?? 0, 'XYZ'));
    _elbow.copy(ELBOW.R).applyMatrix4(_a).add(SHOULDER.R);
    _t.lerpVectors(_elbow, _fist, SUPPORT_AT).add(SUPPORT_OFF);
    armToward(p, solveArm('L', _t, POLE_LAY.L), 'L', sp);
  }
  _look.copy(s.look).setY(s.look.y + DROP);
  lookAt(p, _look, s.lookW);
  return p;
}
const _look = new Vector3();

/** How far the Animator lowers him kneeling to lay the lotus (BU): his space on the floor is the pose's less this. */
export function layDrop(): number {
  if (!KNEEL) lotusLayPose(lotusLayState());
  return DROP;
}
