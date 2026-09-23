import type { JointName } from './skeleton';
import { sampleKeys, type Pose } from './pose';

/**
 * Procedural animation clips (sheet 3.6 "Action Poses").
 *
 * Sign conventions (joint-local Euler, radians):
 *  - hip / shoulder swing forward: −rx        - knee bend: +rx
 *  - elbow bend (forearm up/forward): −rx     - chest lean forward / look down: +rx
 *  - arm out to the side: left +rz, right −rz - turn toward the character's left: +ry
 */
const TAU = Math.PI * 2;
const pos = (v: number) => Math.max(0, v);

export const ARM_JOINTS_L: readonly JointName[] = ['shoulderL', 'elbowL', 'wristL'];
export const ARM_JOINTS_R: readonly JointName[] = ['shoulderR', 'elbowR', 'wristR'];
export const UPPER_BODY: readonly JointName[] = ['chest', 'neck', 'head', ...ARM_JOINTS_L, ...ARM_JOINTS_R];
export const FULL_BODY: readonly JointName[] = [
  'hips',
  'chest',
  'neck',
  'head',
  ...ARM_JOINTS_L,
  ...ARM_JOINTS_R,
  'hipL',
  'kneeL',
  'ankleL',
  'hipR',
  'kneeR',
  'ankleR',
];

/** Relaxed stance with breathing and idle glances. */
export function idle(t: number): Pose {
  const breath = Math.sin((t * TAU) / 3.4);
  const glance = Math.sin((t * TAU) / 9.7) * 0.7 + Math.sin((t * TAU) / 4.1) * 0.3;
  return {
    hips: { rz: 0.012 * Math.sin((t * TAU) / 6.2) },
    chest: { rx: -0.02 + 0.014 * breath, ry: 0.02 * Math.sin((t * TAU) / 7.3) },
    neck: { rx: 0.01 },
    head: { rx: -0.03 + 0.02 * Math.sin((t * TAU) / 5.1), ry: 0.09 * glance, rz: 0.02 * Math.sin((t * TAU) / 6.7) },
    shoulderL: { rx: 0.02, rz: 0.055 + 0.01 * breath },
    shoulderR: { rx: 0.02, rz: -0.055 - 0.01 * breath },
    elbowL: { rx: -0.12 },
    elbowR: { rx: -0.12 },
    // Feet slightly apart and turned out, like the reference stance.
    hipL: { rz: 0.03, ry: 0.14 },
    hipR: { rz: -0.03, ry: -0.14 },
    ankleL: { rz: -0.03 },
    ankleR: { rz: 0.03 },
  };
}

/** Keep a planted foot flat: counter the hip + knee pitch during stance. */
function footPitch(hip: number, knee: number, stance: number, swingToeUp: number): number {
  return -(hip + knee) * stance + swingToeUp * (1 - stance);
}

/** Walk cycle; `phase` in cycles (one cycle = two steps). */
export function walk(phase: number): Pose {
  const t = phase * TAU;
  const s = Math.sin(t);
  const c = Math.cos(t);
  const hipL = -0.5 * s;
  const hipR = 0.5 * s;
  const kneeL = 0.06 + 0.95 * pos(c) ** 1.4;
  const kneeR = 0.06 + 0.95 * pos(-c) ** 1.4;
  const stL = Math.min(1, pos(-c) * 3.5);
  const stR = Math.min(1, pos(c) * 3.5);
  return {
    hips: { ry: -0.09 * s, rz: 0.03 * Math.sin(2 * t) },
    chest: { rx: 0.06, ry: 0.13 * s },
    head: { rx: -0.03, ry: -0.05 * s },
    shoulderL: { rx: 0.5 * s, rz: 0.07 },
    shoulderR: { rx: -0.5 * s, rz: -0.07 },
    elbowL: { rx: -0.25 - 0.3 * pos(-s) },
    elbowR: { rx: -0.25 - 0.3 * pos(s) },
    hipL: { rx: hipL, rz: 0.02, ry: 0.06 },
    hipR: { rx: hipR, rz: -0.02, ry: -0.06 },
    kneeL: { rx: kneeL },
    kneeR: { rx: kneeR },
    ankleL: { rx: footPitch(hipL, kneeL, stL, -0.28 * pos(c)) },
    ankleR: { rx: footPitch(hipR, kneeR, stR, -0.28 * pos(-c)) },
  };
}

/** Run cycle with forward lean and pumping arms. */
export function run(phase: number): Pose {
  const t = phase * TAU;
  const s = Math.sin(t);
  const c = Math.cos(t);
  const hipL = -0.82 * s - 0.08;
  const hipR = 0.82 * s - 0.08;
  const kneeL = 0.22 + 1.5 * pos(c) ** 1.2;
  const kneeR = 0.22 + 1.5 * pos(-c) ** 1.2;
  const stL = Math.min(1, pos(-c) * 3);
  const stR = Math.min(1, pos(c) * 3);
  return {
    hips: { rx: 0.06, ry: -0.15 * s },
    chest: { rx: 0.2, ry: 0.2 * s },
    neck: { rx: -0.06 },
    head: { rx: -0.12, ry: -0.08 * s },
    shoulderL: { rx: 0.78 * s - 0.1, rz: 0.16 },
    shoulderR: { rx: -0.78 * s - 0.1, rz: -0.16 },
    elbowL: { rx: -1.35 + 0.22 * s },
    elbowR: { rx: -1.35 - 0.22 * s },
    hipL: { rx: hipL },
    hipR: { rx: hipR },
    kneeL: { rx: kneeL },
    kneeR: { rx: kneeR },
    ankleL: { rx: footPitch(hipL, kneeL, stL, -0.2 * pos(c)) + 0.25 * pos(-s) * stL },
    ankleR: { rx: footPitch(hipR, kneeR, stR, -0.2 * pos(-c)) + 0.25 * pos(s) * stR },
  };
}

/** Body lift (BU) of the run's flight phase. */
export function runFlight(phase: number): number {
  return 0.8 * pos(-Math.cos(phase * TAU * 2)) ** 1.5;
}

/** Airborne: tucked legs, arms up for balance. `rise` > 0 going up, < 0 falling. */
export function airborne(rise: number): Pose {
  const up = Math.max(0, Math.min(1, rise));
  const down = Math.max(0, Math.min(1, -rise));
  return {
    chest: { rx: 0.05 - 0.08 * down },
    head: { rx: -0.08 },
    shoulderL: { rx: -0.35 - 0.25 * up, rz: 0.45 + 0.25 * down },
    shoulderR: { rx: -0.2 - 0.2 * up, rz: -0.45 - 0.25 * down },
    elbowL: { rx: -0.6 },
    elbowR: { rx: -0.6 },
    hipL: { rx: -0.75 * up - 0.25 },
    hipR: { rx: -0.1 + 0.2 * down },
    kneeL: { rx: 1.25 * up + 0.35 },
    kneeR: { rx: 0.5 + 0.3 * up },
    ankleL: { rx: -0.1 },
    ankleR: { rx: 0.2 },
  };
}

/** Short squash when landing (0 → 1 over the landing). */
export function landing(k: number): Pose {
  const w = Math.sin(Math.min(1, k) * Math.PI);
  return {
    chest: { rx: 0.18 * w },
    hipL: { rx: -0.45 * w },
    hipR: { rx: -0.45 * w },
    kneeL: { rx: 0.85 * w },
    kneeR: { rx: 0.85 * w },
    ankleL: { rx: -0.4 * w },
    ankleR: { rx: -0.4 * w },
    shoulderL: { rz: 0.25 * w },
    shoulderR: { rz: -0.25 * w },
  };
}

// ─── One-shot / looping actions ─────────────────────────────────────────────

export type ActionName = 'openDoor' | 'interact' | 'lookUp' | 'peek' | 'wave' | 'cheer';

export interface ActionDef {
  duration: number;
  loop: boolean;
  fadeIn: number;
  fadeOut: number;
  joints: readonly JointName[];
  /** Keep walking legs under the action (upper-body only actions). */
  allowLocomotion: boolean;
  pose(t: number): Pose;
}

const crouch: Pose = {
  hips: { rx: 0.1 },
  chest: { rx: 0.38 },
  head: { rx: 0.32 },
  hipL: { rx: -1.05, rz: 0.08 },
  hipR: { rx: -0.6, rz: -0.06 },
  kneeL: { rx: 1.75 },
  kneeR: { rx: 1.95 },
  ankleL: { rx: -0.7 },
  ankleR: { rx: -1.05 },
  shoulderR: { rx: -1.05, rz: -0.05 },
  elbowR: { rx: -0.35 },
  wristR: { rx: -0.2 },
  shoulderL: { rx: -0.25, rz: 0.35 },
  elbowL: { rx: -0.9 },
};

export const ACTIONS: Record<ActionName, ActionDef> = {
  openDoor: {
    duration: 2.0,
    loop: false,
    fadeIn: 0.2,
    fadeOut: 0.35,
    joints: FULL_BODY,
    allowLocomotion: false,
    pose: (t) =>
      sampleKeys(t, [
        [0, {}],
        [0.35, { chest: { rx: 0.1, ry: -0.12 }, head: { rx: -0.05 }, shoulderR: { rx: -1.2, rz: -0.12 }, elbowR: { rx: -0.9 }, wristR: { rz: 0.3 } }],
        [
          0.8,
          {
            chest: { rx: 0.22, ry: -0.18 },
            head: { rx: -0.08, ry: 0.1 },
            shoulderR: { rx: -1.5, rz: -0.05 },
            elbowR: { rx: -0.25 },
            wristR: { rz: 0.35, rx: -0.3 },
            shoulderL: { rx: 0.35, rz: 0.18 },
            elbowL: { rx: -0.5 },
            hipL: { rx: -0.45 },
            kneeL: { rx: 0.45 },
            ankleL: { rx: 0.0 },
            hipR: { rx: 0.3 },
            kneeR: { rx: 0.12 },
            ankleR: { rx: -0.42 },
          },
        ],
        [
          1.45,
          {
            chest: { rx: 0.26, ry: -0.2 },
            head: { rx: -0.1, ry: 0.12 },
            shoulderR: { rx: -1.55, rz: -0.02 },
            elbowR: { rx: -0.12 },
            wristR: { rz: 0.35, rx: -0.35 },
            shoulderL: { rx: 0.4, rz: 0.2 },
            elbowL: { rx: -0.55 },
            hipL: { rx: -0.5 },
            kneeL: { rx: 0.5 },
            hipR: { rx: 0.35 },
            kneeR: { rx: 0.15 },
            ankleR: { rx: -0.5 },
          },
        ],
        [2.0, {}],
      ]),
  },
  interact: {
    duration: 1.9,
    loop: false,
    fadeIn: 0.25,
    fadeOut: 0.35,
    joints: FULL_BODY,
    allowLocomotion: false,
    pose: (t) =>
      sampleKeys(t, [
        [0, {}],
        [0.45, crouch],
        [0.8, { ...crouch, wristR: { rx: -0.5, rz: 0.2 }, shoulderR: { rx: -1.15, rz: -0.1 } }],
        [1.2, { ...crouch, wristR: { rx: 0.1, rz: -0.2 } }],
        [1.9, {}],
      ]),
  },
  lookUp: {
    duration: 1.0,
    loop: true,
    fadeIn: 0.35,
    fadeOut: 0.35,
    joints: UPPER_BODY,
    allowLocomotion: true,
    pose: (t) => {
      const sway = Math.sin(t * TAU * 0.5);
      return {
        chest: { rx: -0.1, ry: 0.05 * sway },
        neck: { rx: -0.18 },
        head: { rx: -0.42, ry: 0.12 * sway },
        shoulderR: { rx: -2.35, rz: 0.55 },
        elbowR: { rx: -1.75 },
        wristR: { rx: -0.3, rz: -0.35 },
        shoulderL: { rx: 0.05, rz: 0.14 },
        elbowL: { rx: -0.2 },
      };
    },
  },
  peek: {
    duration: 3.0,
    loop: true,
    fadeIn: 0.4,
    fadeOut: 0.4,
    joints: FULL_BODY,
    allowLocomotion: false,
    pose: (t) => {
      const w = Math.sin((t / 3.0) * TAU) * 0.5 + 0.5;
      return {
        hips: { rz: -0.06 },
        chest: { rx: 0.28, rz: -0.14 - 0.04 * w, ry: 0.1 },
        neck: { rz: -0.08 },
        head: { rx: -0.05, rz: -0.2, ry: 0.15 * w },
        shoulderL: { rx: -1.05, rz: 0.12 },
        elbowL: { rx: -0.55 },
        shoulderR: { rx: 0.1, rz: -0.35 },
        elbowR: { rx: -0.35 },
        hipL: { rx: -0.3 },
        kneeL: { rx: 0.35 },
        hipR: { rx: 0.12, rz: -0.12 },
        kneeR: { rx: 0.1 },
        ankleL: { rx: -0.05 },
        ankleR: { rx: -0.22 },
      };
    },
  },
  wave: {
    duration: 2.2,
    loop: false,
    fadeIn: 0.25,
    fadeOut: 0.35,
    joints: UPPER_BODY,
    allowLocomotion: true,
    pose: (t) => {
      const wv = Math.sin(t * TAU * 1.6) * 0.45;
      return {
        chest: { rz: 0.04, ry: -0.06 },
        head: { rz: 0.08, rx: -0.05 },
        shoulderR: { rx: -0.25, rz: -2.55 },
        elbowR: { rx: -0.25, rz: wv },
        wristR: { rz: wv * 0.4 },
      };
    },
  },
  cheer: {
    duration: 1.6,
    loop: false,
    fadeIn: 0.15,
    fadeOut: 0.3,
    joints: FULL_BODY,
    allowLocomotion: false,
    pose: (t) => {
      const hop = Math.sin(Math.min(1, t / 0.8) * Math.PI);
      return {
        chest: { rx: -0.12 },
        head: { rx: -0.18 },
        shoulderL: { rx: -0.3, rz: 2.4 - 0.2 * hop },
        shoulderR: { rx: -0.3, rz: -2.4 + 0.2 * hop },
        elbowL: { rx: -0.35 },
        elbowR: { rx: -0.35 },
        hipL: { rx: -0.35 * hop },
        hipR: { rx: -0.35 * hop },
        kneeL: { rx: 0.7 * hop },
        kneeR: { rx: 0.7 * hop },
        ankleL: { rx: -0.35 * hop },
        ankleR: { rx: -0.35 * hop },
      };
    },
  },
};

// ─── Arm layers for held props ──────────────────────────────────────────────

/** Left arm raised holding the lantern in front ("Hold Lantern" pose). */
export function holdLantern(t: number): Pose {
  const bob = Math.sin(t * 1.7) * 0.03;
  return {
    shoulderL: { rx: -0.42 + bob, rz: 0.2 },
    elbowL: { rx: -1.25 },
    wristL: { ry: -1.35, rx: 0.1 },
  };
}

/**
 * Left arm holding the torch out in front, forearm raised so the torch stands
 * upright beside the face (hero shot). Shoulder + elbow pitch sum to ≈ −90°.
 */
export function holdTorch(t: number): Pose {
  const bob = Math.sin(t * 1.3) * 0.025;
  return {
    shoulderL: { rx: -0.98 + bob, rz: 0.5 },
    elbowL: { rx: -0.62 },
    // Roll the fist outward so the abducted arm doesn't tilt the torch into the face.
    wristL: { ry: 0.38 },
  };
}
