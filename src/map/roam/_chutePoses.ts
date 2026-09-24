import { Euler, Vector3 } from 'three';
import { clamp, lerp, sampleKeys, smoothstep, type Pose } from '../../character/pose';
import { JOINTS } from '../../character/skeleton';

/**
 * Poses of the leap off the ledge and the parachute ride, for the
 * explorer's `posture` hook (Animator: a whole-body pose over everything).
 *
 * Joint-local Euler angles in radians, offsets in body units (BU, 1/32.4 of
 * the explorer's height). Signs as in character/clips.ts: hip / shoulder
 * swing forward −rx, knee bend +rx, elbow bend −rx, lean forward / look
 * down +rx, arm out to the side: left +rz, right −rz, turn left +ry. The
 * character's left is +x.
 */

/** Where the risers pull (BU, character space): between the shoulders, just above them. He hangs, swings and banks round it. */
export const HARNESS: readonly [number, number, number] = [0, 18.6, -0.4];
/** Middle of the body (BU): he turns round it in the air. */
export const MIDDLE: readonly [number, number, number] = [0, 11.5, -0.3];

const _e = new Euler();
const _d = new Vector3();
const _r = new Vector3();

/**
 * Turn the whole body (at the hips, which carry everything) by `pitch`
 * (+ = forward, face down) and `roll` (+ = head to the right, − = to his
 * left) round `pivot`, which stays where it is. Changes `pose` and returns it.
 */
export function tilt(pose: Pose, pitch: number, roll: number, pivot: readonly [number, number, number]): Pose {
  const h = pose.hips ?? {};
  const rx = (h.rx ?? 0) + pitch;
  const ry = h.ry ?? 0;
  const rz = (h.rz ?? 0) + roll;
  const [hx, hy, hz] = JOINTS.hips.pivot;
  _d.set(pivot[0] - hx, pivot[1] - hy, pivot[2] - hz);
  _r.copy(_d).applyEuler(_e.set(rx, ry, rz));
  pose.hips = { rx, ry, rz, px: (h.px ?? 0) + _d.x - _r.x, py: (h.py ?? 0) + _d.y - _r.y, pz: (h.pz ?? 0) + _d.z - _r.z };
  return pose;
}

/** Getting ready on the ledge (k 0‥1): knees bent, leaning in, arms drawn back. */
export function readyPose(k: number): Pose {
  return {
    chest: { rx: 0.38 * k },
    neck: { rx: -0.05 * k },
    head: { rx: -0.3 * k },
    shoulderL: { rx: 0.9 * k, rz: 0.05 + 0.15 * k },
    shoulderR: { rx: 0.9 * k, rz: -0.05 - 0.15 * k },
    elbowL: { rx: -0.12 - 0.3 * k },
    elbowR: { rx: -0.12 - 0.3 * k },
    hipL: { rx: -0.85 * k, rz: 0.03, ry: 0.14 },
    hipR: { rx: -0.6 * k, rz: -0.03, ry: -0.14 },
    kneeL: { rx: 1.35 * k },
    kneeR: { rx: 1.05 * k },
    ankleL: { rx: -0.5 * k },
    ankleR: { rx: -0.45 * k },
  };
}

// The leap, from the push off the edge (t = 0, seconds).
const PUSH: Pose = {
  chest: { rx: -0.08 },
  head: { rx: -0.2 },
  shoulderL: { rx: -1.9, rz: 0.35 },
  shoulderR: { rx: -1.7, rz: -0.35 },
  elbowL: { rx: -0.45 },
  elbowR: { rx: -0.45 },
  hipL: { rx: -1.05 },
  kneeL: { rx: 1.3 },
  ankleL: { rx: 0.2 },
  hipR: { rx: 0.3 },
  kneeR: { rx: 0.35 },
  ankleR: { rx: 0.45 },
};
/** Arms flung wide and up, legs apart: the joyful star at the top of the jump. */
const STAR: Pose = {
  chest: { rx: -0.28 },
  neck: { rx: -0.1 },
  head: { rx: -0.3 },
  shoulderL: { rx: -0.2, rz: 2.55 },
  shoulderR: { rx: -0.2, rz: -2.55 },
  elbowL: { rx: -0.2 },
  elbowR: { rx: -0.2 },
  hipL: { rx: -0.2, rz: 0.45 },
  hipR: { rx: -0.1, rz: -0.45 },
  kneeL: { rx: 0.45 },
  kneeR: { rx: 0.3 },
  ankleL: { rx: 0.35 },
  ankleR: { rx: 0.35 },
};
/** Diving: arched, arms spread like wings, knees bent, looking ahead at the land. */
const DIVE: Pose = {
  chest: { rx: -0.3 },
  neck: { rx: -0.25 },
  head: { rx: -0.45 },
  shoulderL: { rx: -0.45, rz: 1.45 },
  shoulderR: { rx: -0.45, rz: -1.45 },
  elbowL: { rx: -0.55 },
  elbowR: { rx: -0.55 },
  hipL: { rx: 0.22, rz: 0.3 },
  hipR: { rx: 0.22, rz: -0.3 },
  kneeL: { rx: 0.8 },
  kneeR: { rx: 0.7 },
  ankleL: { rx: 0.45 },
  ankleR: { rx: 0.45 },
};
const LEAP_KEYS: readonly (readonly [number, Pose])[] = [
  [0, PUSH],
  [0.3, STAR],
  [0.85, DIVE],
];

/** Forward lean of the whole body in the leap: a little back in the star, then over into the dive. */
const leapPitch = (t: number) => -0.18 * Math.sin(Math.PI * clamp(t / 0.55, 0, 1)) + 0.85 * smoothstep(0.3, 0.95, t);

/** The jump off the ledge and the dive, `t` seconds after the push (turned round the middle of the body). */
export function leapPose(t: number): Pose {
  // A little life in the dive: the arms ride the air.
  const p = sampleKeys(t, LEAP_KEYS);
  const w = smoothstep(0.6, 1, t) * Math.sin(t * 5.3) * 0.06;
  const out: Pose = { ...p, shoulderL: { ...p.shoulderL, rz: (p.shoulderL?.rz ?? 0) + w }, shoulderR: { ...p.shoulderR, rz: (p.shoulderR?.rz ?? 0) - w } };
  return tilt(out, leapPitch(t), 0, MIDDLE);
}

/** How the explorer hangs under the canopy (all 0‥1 unless noted). */
export interface HangParams {
  /** Toggle pulled by each hand: 0 = hands high (full flight), 1 = at the chest, 1.5 = down at the hips (flare). */
  pullL: number;
  pullR: number;
  /** Turning: + = to his left, − = to his right (−1‥1). */
  turn: number;
  /** Diving (W). */
  dive: number;
  /** Flaring for the landing: legs forward. */
  flare: number;
}

/** One arm on its brake toggle, from high and out to the side (0) to the chest (1) to the hips (1.5). */
function arm(pull: number, side: 1 | -1): Pick<Pose, 'shoulderL' | 'elbowL' | 'wristL'> {
  const a = clamp(pull, 0, 1);
  const b = clamp(pull - 1, 0, 0.5) * 2;
  const rx = lerp(lerp(-2.9, -1.0, a), -0.3, b);
  const rz = lerp(lerp(0.7, 0.45, a), 0.28, b) * side;
  const elbow = lerp(lerp(-0.4, -1.35, a), -0.45, b);
  return { shoulderL: { rx, rz }, elbowL: { rx: elbow }, wristL: { rx: 0.15 * a } };
}

/** Hanging in the harness: hands up on the toggles, legs dangling, turned by `p`. `t` is a clock (s) for the dangling. */
export function hangPose(t: number, p: HangParams): Pose {
  const L = arm(p.pullL, 1);
  const R = arm(p.pullR, -1);
  const f = p.flare;
  // Legs dangle, swing out of a turn, come forward to land.
  const dangle = (1 - f) * 0.07;
  const legOut = -0.14 * p.turn * (1 - f);
  const hip = (side: number) => lerp(-0.28 + 0.1 * p.dive, -0.95, f) + dangle * Math.sin(t * 1.9 + side);
  const knee = (side: number) => lerp(0.5, 0.4, f) + dangle * 0.8 * Math.sin(t * 1.9 + side + 0.7);
  return {
    chest: { rx: -0.06 + 0.14 * p.dive + 0.12 * f, ry: 0.1 * p.turn },
    neck: { rx: 0.04, ry: 0.12 * p.turn },
    head: { rx: 0.1 - 0.1 * p.dive + 0.22 * f, ry: 0.35 * p.turn },
    shoulderL: L.shoulderL,
    elbowL: L.elbowL,
    wristL: L.wristL,
    shoulderR: R.shoulderL,
    elbowR: R.elbowL,
    wristR: R.wristL,
    hipL: { rx: hip(0), rz: 0.07 + legOut },
    hipR: { rx: hip(1.3), rz: -0.07 + legOut },
    kneeL: { rx: knee(0) },
    kneeR: { rx: knee(1.3) },
    // Toes point down while he hangs, come up to meet the ground.
    ankleL: { rx: lerp(0.4, -0.1, f) },
    ankleR: { rx: lerp(0.35, -0.1, f) },
  };
}
