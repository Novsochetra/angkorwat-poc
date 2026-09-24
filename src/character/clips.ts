import { JOINTS, SOLE_POINTS, type JointName } from './skeleton';
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

const smooth = (v: number) => {
  const c = Math.min(1, Math.max(0, v));
  return c * c * (3 - 2 * c);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
/** Cubic Hermite from p0 to p1 with end slopes m0, m1 (per unit of u). */
const hermite = (p0: number, p1: number, m0: number, m1: number, u: number) => {
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
};

// ─── Walk / run gait ────────────────────────────────────────────────────────

// Leg bones and sole (BU), for the leg IK.
const HIPS_Y = JOINTS.hips.pivot[1];
const HIP_OFFSET = JOINTS.hipL.pivot.map((v, i) => v - JOINTS.hips.pivot[i]);
const THIGH = JOINTS.kneeL.pivot.map((v, i) => v - JOINTS.hipL.pivot[i]);
const SHIN = JOINTS.ankleL.pivot.map((v, i) => v - JOINTS.kneeL.pivot[i]);
const THIGH_LEN = Math.hypot(THIGH[1], THIGH[2]);
const SHIN_LEN = Math.hypot(SHIN[1], SHIN[2]);
const ANKLE_Z = JOINTS.ankleL.pivot[2];
/** Ankle height over a flat sole, and the heel / toe ends of the sole. */
const SOLE_DEPTH = -SOLE_POINTS[0][1];
const HEEL = Math.min(...SOLE_POINTS.map((p) => p[2]));
const TOE = Math.max(...SOLE_POINTS.map((p) => p[2]));

/**
 * Foot pitch against the ground (+ = toe down) over one step: the heel lands
 * with the toe up, the foot rolls flat, the heel lifts onto the toe, and in the
 * swing it turns back toe-up for the next landing. Every piece eases in and out.
 */
function footRoll(p: number, stance: number, strike: number, push: number): number {
  if (p < stance) {
    const u = p / stance;
    if (u < 0.2) return strike * (1 - smooth(u / 0.2));
    if (u < 0.6) return 0;
    return push * smooth((u - 0.6) / 0.4);
  }
  return push + (strike - push) * smooth((p - stance) / (1 - stance) / 0.85);
}

/** How far the lowest sole point is below the ankle when the foot is pitched by `g`. */
const soleDepth = (g: number) => SOLE_DEPTH * Math.cos(g) + (g > 0 ? TOE : HEEL) * Math.sin(g);

/**
 * Ankle position (y, z) of a foot on the ground. `zFlat` is where the ankle
 * would be with the foot flat; a pitched foot pivots on its heel (toe up) or
 * toe (toe down), so the sole never sinks into the ground or slides.
 */
function plantedAnkle(zFlat: number, g: number): [number, number] {
  const pz = g > 0 ? TOE : HEEL;
  return [SOLE_DEPTH * Math.cos(g) + pz * Math.sin(g), zFlat + pz + SOLE_DEPTH * Math.sin(g) - pz * Math.cos(g)];
}

interface LegFrame {
  /** Hip joint position (character space, BU). */
  hip: readonly [number, number, number];
  lean: number;
  twist: number;
}

/**
 * Two-bone leg IK in the leg's side plane: hip and knee pitch that put the
 * ankle at (y, z) in character space. Returns [hip rx, knee rx, reached], where
 * `reached` < 1 when the target is out of reach and the straight leg stops
 * short of it (that share of the way).
 */
function legIK(f: LegFrame, y: number, z: number): [number, number, number] {
  // Target relative to the hip, turned into the hips' frame (undo the twist, then the lean).
  let dy = y - f.hip[1];
  let dz = z - f.hip[2];
  const cl = Math.cos(-f.lean);
  const sl = Math.sin(-f.lean);
  [dy, dz] = [dy * cl - dz * sl, dy * sl + dz * cl];
  dz *= Math.cos(f.twist);
  const reach = Math.hypot(dy, dz);
  // Knee: law of cosines on the (slightly bent) shin.
  const bias = Math.atan2(-SHIN[2], -SHIN[1]);
  const cosK = (reach * reach - THIGH_LEN * THIGH_LEN - SHIN_LEN * SHIN_LEN) / (2 * THIGH_LEN * SHIN_LEN);
  const knee = Math.max(0, Math.acos(Math.min(1, Math.max(-1, cosK))) - bias);
  // Hip: turn the bent leg's hip→ankle line onto the target.
  const ck = Math.cos(knee);
  const sk = Math.sin(knee);
  const vy = THIGH[1] + SHIN[1] * ck - SHIN[2] * sk;
  const vz = THIGH[2] + SHIN[1] * sk + SHIN[2] * ck;
  let hip = Math.atan2(dz, dy) - Math.atan2(vz, vy);
  hip = Math.atan2(Math.sin(hip), Math.cos(hip));
  return [hip, knee, Math.min(1, Math.hypot(vy, vz) / reach)];
}

export interface GaitPose {
  pose: Pose;
  /** How high both feet are off the ground (BU) — the run's flight. */
  lift: number;
}

/**
 * Walk / run cycle with planted feet. `phase` in cycles (one cycle = two
 * steps), `run` blends walk → run, `amount` (0‥1) eases from standing into the
 * full gait, and `cycle` is the ground covered per cycle (BU).
 *
 * The feet follow set paths — on the ground a foot moves back exactly as fast
 * as the ground goes by, rolling heel → toe, and in the air it swings forward on
 * a smooth arc — and leg IK bends hip and knee to reach them. The body rides a
 * smooth wave (low when a foot lands in the walk, low mid-stride in the run), so
 * nothing jumps from one frame to the next.
 */
export function gait(phase: number, run: number, amount: number, cycle: number): GaitPose {
  const t = phase * TAU;
  const s = Math.sin(t);
  const a = amount;
  const stance = mix(0.5, 0.22, run);
  const travel = stance * cycle;
  const lean = 0.06 * run * a;
  const twist = mix(-0.09, -0.15, run) * s * a;

  // Body height: q = 0 when a foot lands.
  const q = 2 * phase - 0.5 - Math.floor(2 * phase - 0.5);
  const bodyWalk = -0.2 - 0.3 * (1 + Math.cos(TAU * q));
  const bodyRun = -0.55 - 0.4 * (1 + Math.cos(TAU * (q - stance)));
  const body = mix(bodyWalk, bodyRun, run) * a;

  const strike = mix(-0.22, -0.08, run) * a;
  const push = mix(0.5, 0.75, run) * a;
  const arc = mix(1.5, 3.4, run) * a;
  // Ground speed at take-off; the run lands with the foot already slowing.
  const slope = (-travel / stance) * (1 - stance);
  const land = slope * mix(1, 0.35, run);

  const pose: Pose = {
    body: { py: body },
    hips: { rx: lean, ry: twist, rz: 0.03 * Math.sin(2 * t) * (1 - run) * a },
  };
  const clearance: number[] = [];
  for (const [side, off] of [['L', 0.25], ['R', -0.25]] as const) {
    const p = phase - off - Math.floor(phase - off); // 0 = this foot lands
    const g = footRoll(p, stance, strike, push);
    let y: number;
    let z: number;
    if (p < stance) {
      [y, z] = plantedAnkle(ANKLE_Z + travel / 2 - (travel * p) / stance, g);
    } else {
      // Swing: leave the ground at its speed and land again, lifted on an arc.
      const v = (p - stance) / (1 - stance);
      const [y0, z0] = plantedAnkle(ANKLE_Z - travel / 2, push);
      const [y1, z1] = plantedAnkle(ANKLE_Z + travel / 2, strike);
      z = hermite(z0, z1, slope, land, v);
      y = mix(y0, y1, smooth(v)) + arc * Math.sin(Math.PI * v) ** 2;
    }
    const sx = side === 'L' ? 1 : -1;
    const hx = sx * HIP_OFFSET[0];
    const frame: LegFrame = {
      hip: [
        hx,
        HIPS_Y + body + HIP_OFFSET[1] * Math.cos(lean) - HIP_OFFSET[2] * Math.sin(lean),
        JOINTS.hips.pivot[2] + HIP_OFFSET[1] * Math.sin(lean) + HIP_OFFSET[2] * Math.cos(lean) - hx * Math.sin(twist),
      ],
      lean,
      twist,
    };
    const [hip, knee, reached] = legIK(frame, y, z);
    // Sole height the leg actually reaches (a foot out of reach hangs short).
    clearance.push(frame.hip[1] + (y - frame.hip[1]) * reached - soleDepth(g));
    pose[`hip${side}`] = { rx: hip, rz: sx * 0.02 * (1 - run) * a, ry: sx * 0.06 * (1 - run) * a };
    pose[`knee${side}`] = { rx: knee };
    pose[`ankle${side}`] = { rx: g - lean - hip - knee };
  }

  // Upper body: arms swing against the legs, chest and head counter-turn.
  const k = (w: number, r: number) => mix(w, r, run) * a;
  Object.assign(pose, {
    chest: { rx: k(0.06, 0.2), ry: k(0.13, 0.2) * s },
    neck: { rx: k(0, -0.06) },
    head: { rx: k(-0.03, -0.12), ry: k(-0.05, -0.08) * s },
    shoulderL: { rx: k(0.5, 0.78) * s - k(0, 0.1), rz: k(0.07, 0.16) },
    shoulderR: { rx: -k(0.5, 0.78) * s - k(0, 0.1), rz: -k(0.07, 0.16) },
    elbowL: { rx: mix(-0.25 - 0.3 * pos(-s), -1.35 + 0.22 * s, run) * a },
    elbowR: { rx: mix(-0.25 - 0.3 * pos(s), -1.35 - 0.22 * s, run) * a },
  } satisfies Pose);

  return { pose, lift: Math.max(0, Math.min(...clearance)) };
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

export type ActionName = 'openDoor' | 'interact' | 'lookUp' | 'peek' | 'wave' | 'cheer' | 'photo';

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
  // Camera up to the eye (held until stopped). The Animator moves the hands
  // onto the camera with arm IK and turns the head to where the photo looks.
  photo: {
    duration: 1.0,
    loop: true,
    fadeIn: 0.45,
    fadeOut: 0.35,
    joints: UPPER_BODY,
    allowLocomotion: false,
    pose: () => ({
      chest: { rx: -0.04 },
      neck: { rx: 0.02 },
      shoulderL: { rx: -1.3, rz: 0.55 },
      shoulderR: { rx: -1.3, rz: -0.55 },
      elbowL: { rx: -1.9 },
      elbowR: { rx: -1.9 },
    }),
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

/**
 * Left arm carrying the flashlight low, the beam along the fist's grip axis:
 * the arm swings forward to raise the beam and twists to turn it. `yaw` (+ =
 * toward the character's left) and `pitch` (+ = up) are the beam's direction
 * from the chest; the explorer turns the flashlight in the fist by whatever is
 * left over, so the beam lands exactly where it should.
 */
export function holdFlashlight(t: number, yaw: number, pitch: number): Pose {
  const bob = Math.sin(t * 1.5) * 0.02;
  const elbow = -0.45 - 0.45 * smooth(pitch / 0.9);
  // Shoulder + elbow pitch that tips the grip axis up by `pitch` at this twist.
  const swing = -Math.asin(Math.max(-1, Math.min(1, Math.sin(pitch) / Math.max(0.35, Math.cos(yaw)))));
  // The fist cocks back a little, so the upper arm hangs forward, not behind.
  return {
    shoulderL: { rx: swing - 0.4 * elbow + bob, ry: yaw, rz: 0.16 + 0.1 * pos(-yaw) },
    elbowL: { rx: elbow },
    wristL: { rx: -0.6 * elbow },
  };
}

/** Chest and head turning toward where the flashlight shines (added on top). */
export function lookAlong(yaw: number, pitch: number): Pose {
  return {
    chest: { ry: 0.3 * yaw, rx: -0.08 * pitch },
    neck: { ry: 0.15 * yaw, rx: -0.12 * pitch },
    head: { ry: 0.3 * yaw, rx: -0.3 * pitch },
  };
}
