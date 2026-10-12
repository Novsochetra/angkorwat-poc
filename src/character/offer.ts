import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { solveArm } from './Animator';
import { ACTIONS, FACE_ARMS, PRAY } from './clips';
import type { JointPose, Pose } from './pose';
import { JOINTS, SOLE_POINTS, type JointName } from './skeleton';

/**
 * Offering his garden's fruit (the map's roam/_offerFruit*.ts): at a shrine
 * (ថ្វាយ) and to the monks (ប្រគេន). One posture (`Animator.posture`, with
 * `postureFeet = false`: it places the body itself, planted as the Animator
 * plants the prayer: the lowest of the soles, knees, shins and the tops of
 * the feet on the ground), kneeling the prayer's way or standing:
 *
 * - **going down / getting up** (`pray`): the prayer's own keys (clips.ts
 *   `pray`: the right foot back, both knees down; the way up again);
 * - **kneeling** (`pray` NaN): upright on his knees (`rise` 1) or back on his
 *   heels (0), bowing forward from the hips (`lean`, the thighs kept as they
 *   kneel), both hands on the gift (`hold`: the fists at its two sides, `half`
 *   apart from its middle `gift`): out of his bag before his chest, lifted to
 *   his forehead with the head bowed to it (the Khmer way of offering,
 *   លើកថ្វាយ), held out to the monk or set down before the shrine; then the
 *   palms together at his face (`palms`, the sampeah) and the prayer's bow to
 *   the ground (`bow`);
 * - **standing** (`stand`): before a monk he meets on the way, bowing a little
 *   from the hips as he holds the gift out in both hands, then a sampeah with
 *   a bow over it (`palms`, `bow`).
 *
 * The caller eases the numbers (`OfferPoseState`); this only shapes the body,
 * into one pose object each call (the Animator reads it at once). Arms by IK
 * (`solveArm`). Units: body units (BU) in his space (his feet at the origin on
 * his floor, +z ahead, +x his left).
 */

export interface OfferPoseState {
  /** Going down or up: the time in the prayer's keys (0 standing ‥ `OFFER_KNEEL`; `OFFER_RISE` ‥ `PRAY.duration` up); NaN: kneeling (or standing: `stand`). */
  pray: number;
  /** Standing before a monk (no kneel). */
  stand: boolean;
  /** Kneeling: 0 back on his heels ‥ 1 up on his knees. */
  rise: number;
  /** Bowing forward from the hips (0 upright ‥ 1: down toward the floor before him). */
  lean: number;
  /** Over to his left (+) or right (−) as he bows: the chest leans and turns that way (0 ‥ ±1). */
  side: number;
  /** Both hands on the gift (0: resting ‥ 1). */
  hold: number;
  /** The gift's middle (BU, his space), and half the width between his fists (BU). */
  readonly gift: Vector3;
  half: number;
  /** Palms together at his face (0 ‥ 1). */
  palms: number;
  /** The bow: kneeling, the prayer's bow to the ground (hands flat before his knees); standing, over his palms (0 ‥ 1). */
  bow: number;
  /** Where he looks (BU, his space), and how much (0 ‥ 1). */
  readonly look: Vector3;
  lookW: number;
  /** Seconds (breathing). */
  t: number;
}

/** Times in the prayer's keys (clips.ts `PRAY_KEYS`): both knees down, upright; back on the heels on the way up. */
export const OFFER_KNEEL = 2.15;
export const OFFER_RISE = 7.15;
/** The hat off and back on in the prayer's keys. */
export const OFFER_HAT = { off: PRAY.hatOff, on: PRAY.hatOn } as const;

export function offerPoseState(): OfferPoseState {
  return { pray: 0, stand: false, rise: 1, lean: 0, side: 0, hold: 0, gift: new Vector3(0, 9, 5), half: 1.4, palms: 0, bow: 0, look: new Vector3(0, 12, 14), lookW: 0, t: 0 };
}

// ── The prayer's shapes ────────────────────────────────────────────────────

const pray = ACTIONS.pray.pose;
let SHAPES: { knees: Pose; heels: Pose; bow: Pose } | null = null;
const copy = (p: Pose): Pose => JSON.parse(JSON.stringify(p)) as Pose;
/** (made the first time: clips.ts is loaded by then) */
const shapes = () => (SHAPES ??= { knees: copy(pray(OFFER_KNEEL)), heels: copy(pray(OFFER_RISE)), bow: copy(pray(PRAY.bows[0])) });

const BODY: readonly JointName[] = ['hips', 'chest', 'neck', 'head', 'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR'];
const ARMS: readonly JointName[] = ['shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR'];
const ALL: readonly JointName[] = [...BODY, ...ARMS];
const CH = ['rx', 'ry', 'rz', 'px', 'py', 'pz'] as const;
const zero = () => ({ rx: 0, ry: 0, rz: 0, px: 0, py: 0, pz: 0 });
/** The pose returned (written in place each call). */
const OUT: Pose = Object.fromEntries(ALL.map((n) => [n, zero()])) as Pose;
const HOLD: Pose = Object.fromEntries(ARMS.map((n) => [n, zero()])) as Pose;
const STAND: Pose = {};

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
function toward(out: Pose, p: Pose, k: number, js: readonly JointName[]): void {
  if (k <= 0) return;
  for (const j of js) {
    const o = out[j]!;
    const pj = p[j];
    for (const c of CH) o[c] = (o[c] ?? 0) + ((pj?.[c] ?? 0) - (o[c] ?? 0)) * k;
  }
}

// ── Planting ───────────────────────────────────────────────────────────────

/** The fronts of the knees and shins and the tops of the feet (BU from the joint): Animator.ts `KNEEL_POINTS`. */
const KNEE_PTS: readonly (readonly [number, number, number])[] = [[0, 0.5, 1.52], [0, -1.5, 1.52], [0, -2.5, 1.68], [0, -3.5, 1.68], [0, -4.4, 1.62]];
const FOOT_PTS: readonly (readonly [number, number, number])[] = [[0, -0.4, 5.05], [0, 0.6, 3.0], [0, 0.6, -2.0], [0, -0.4, -3.05]];
const LEGS = [
  { hip: 'hipL', knee: 'kneeL', ankle: 'ankleL' },
  { hip: 'hipR', knee: 'kneeR', ankle: 'ankleR' },
] as const;

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
const _t = new Vector3();
const _d = new Vector3();

function local(n: JointName, p: JointPose | undefined, out: Matrix4): Matrix4 {
  const r = REST_LOCAL[n];
  _v.set(r.x + (p?.px ?? 0), r.y + (p?.py ?? 0), r.z + (p?.pz ?? 0));
  _q.setFromEuler(_e.set(p?.rx ?? 0, p?.ry ?? 0, p?.rz ?? 0, 'XYZ'));
  return out.compose(_v, _q, ONE);
}

/** The lowest of the soles, knees, shins and feet of pose `p` (BU over the ground, the hips as posed). */
function lowest(p: Pose, kneeling: boolean): number {
  let min = Infinity;
  local('hips', p.hips, _hips);
  for (const l of LEGS) {
    _a.multiplyMatrices(_hips, local(l.hip, p[l.hip], _b));
    _a.multiply(local(l.knee, p[l.knee], _b));
    if (kneeling) for (const q of KNEE_PTS) min = Math.min(min, _v.set(q[0], q[1], q[2]).applyMatrix4(_a).y);
    _a.multiply(local(l.ankle, p[l.ankle], _b));
    for (const q of SOLE_POINTS) min = Math.min(min, _v.set(q[0], q[1], q[2]).applyMatrix4(_a).y);
    if (kneeling) for (const q of FOOT_PTS) min = Math.min(min, _v.set(q[0], q[1], q[2]).applyMatrix4(_a).y);
  }
  return min;
}

// ── The arms ───────────────────────────────────────────────────────────────

/** Elbows out and down (chest space). */
const POLE_L = new Vector3(0.85, -0.5, -0.15).normalize();
const POLE_R = new Vector3(-0.85, -0.5, -0.15).normalize();
/** The fists hold the gift at its sides a little below its middle and behind it (BU). */
const GRIP_DOWN = 0.5;
const GRIP_BACK = 0.3;
/** Bowing (radians at 1): kneeling, the hips (the thighs kept) and the chest; standing, the hips and the chest. */
const LEAN_HIPS = 0.62;
const LEAN_CHEST = 0.32;
const STAND_HIPS = 0.22;
const STAND_CHEST = 0.16;
const STAND_BOW = { hips: 0.2, chest: 0.3, head: 0.2 };
/** Over to a side as he bows (radians at `side` 1): the chest's lean and turn. */
const SIDE_LEAN = 0.38;
const SIDE_TURN = 0.2;

function setArm(side: 'L' | 'R', solved: Pose): void {
  for (const j of side === 'L' ? (['shoulderL', 'elbowL', 'wristL'] as const) : (['shoulderR', 'elbowR', 'wristR'] as const)) {
    const o = HOLD[j]!;
    const p = solved[j];
    for (const c of CH) o[c] = p?.[c] ?? 0;
  }
}

/** The posture for state `s` (see the module's notes). */
export function offerPose(s: OfferPoseState): Pose {
  const { knees, heels, bow } = shapes();
  const going = !s.stand && !Number.isNaN(s.pray);
  const br = 0.012 * Math.sin(s.t * 1.6);
  if (going) {
    mix(OUT, pray(Math.max(0, Math.min(PRAY.duration, s.pray))), STAND, 0, ALL);
  } else if (s.stand) {
    mix(OUT, STAND, STAND, 0, ALL);
    // A little bow from the hips as he holds it out (the legs kept upright), more over the palms.
    const lean = STAND_HIPS * s.lean + STAND_BOW.hips * s.bow;
    OUT.hips!.rx = lean;
    OUT.hipL!.rx = -lean;
    OUT.hipR!.rx = -lean;
    OUT.chest!.rx = STAND_CHEST * s.lean + STAND_BOW.chest * s.bow + br;
    OUT.head!.rx = STAND_BOW.head * s.bow;
  } else {
    mix(OUT, heels, knees, s.rise, ALL);
    OUT.hips!.rx = (OUT.hips!.rx ?? 0) + LEAN_HIPS * s.lean;
    OUT.hipL!.rx = (OUT.hipL!.rx ?? 0) - LEAN_HIPS * s.lean;
    OUT.hipR!.rx = (OUT.hipR!.rx ?? 0) - LEAN_HIPS * s.lean;
    OUT.chest!.rx = (OUT.chest!.rx ?? 0) + LEAN_CHEST * s.lean + br;
    // (toward his left, +: the chest leans over (−rz) and turns (+ry) that way)
    OUT.chest!.rz = (OUT.chest!.rz ?? 0) - SIDE_LEAN * s.side;
    OUT.chest!.ry = (OUT.chest!.ry ?? 0) + SIDE_TURN * s.side;
    toward(OUT, bow, s.bow, BODY);
  }
  // Planted: the lowest point on the ground.
  OUT.hips!.py = (OUT.hips!.py ?? 0) - lowest(OUT, !s.stand);
  if (going) return OUT;

  // The chest's frame (his space → chest space).
  local('hips', OUT.hips, _hips);
  _chest.multiplyMatrices(_hips, local('chest', OUT.chest, _a));
  _inv.copy(_chest).invert();

  // Looking at the gift, the monk or the shrine: the head and a little the neck.
  if (s.lookW > 0) {
    // (his eyes: 23.4 BU over the chest's pivot frame's origin, at the face's front)
    _d.copy(s.look).applyMatrix4(_inv);
    const ex = 0;
    const ey = 23.4 - JOINTS.chest.pivot[1];
    const ez = 4.5 - JOINTS.chest.pivot[2];
    const dx = _d.x - ex;
    const dy = _d.y - ey;
    const dz = _d.z - ez;
    const yaw = Math.max(-1, Math.min(1, Math.atan2(dx, Math.max(0.5, dz))));
    const down = Math.max(-0.45, Math.min(0.95, Math.atan2(-dy, Math.max(0.5, Math.hypot(dx, dz)))));
    OUT.neck!.ry = (OUT.neck!.ry ?? 0) + yaw * 0.3 * s.lookW;
    OUT.head!.ry = (OUT.head!.ry ?? 0) + yaw * 0.6 * s.lookW;
    OUT.neck!.rx = (OUT.neck!.rx ?? 0) + down * 0.3 * s.lookW;
    OUT.head!.rx = (OUT.head!.rx ?? 0) + down * 0.55 * s.lookW;
  }

  // Both hands on the gift: the fists at its two sides (his space: +x his left), a little under and behind its middle.
  if (s.hold > 0) {
    _t.set(s.gift.x + s.half, s.gift.y - GRIP_DOWN, s.gift.z - GRIP_BACK).applyMatrix4(_inv);
    setArm('L', solveArm('L', _t, POLE_L));
    _t.set(s.gift.x - s.half, s.gift.y - GRIP_DOWN, s.gift.z - GRIP_BACK).applyMatrix4(_inv);
    setArm('R', solveArm('R', _t, POLE_R));
    // (the wrists turned in a little, toward the gift)
    HOLD.wristL!.ry = (HOLD.wristL!.ry ?? 0) - 0.35;
    HOLD.wristR!.ry = (HOLD.wristR!.ry ?? 0) + 0.35;
    toward(OUT, HOLD, s.hold, ARMS);
  }
  toward(OUT, FACE_ARMS, s.palms, ARMS);
  if (!s.stand) toward(OUT, bow, s.bow, ARMS);
  return OUT;
}
