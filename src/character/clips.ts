import { JOINTS, SOLE_POINTS, type JointName } from './skeleton';
import { sampleKeys, type JointPose, type Pose } from './pose';

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

export type ActionName = 'openDoor' | 'interact' | 'lookUp' | 'peek' | 'wave' | 'cheer' | 'photo' | 'selfie' | 'pray';

/**
 * Times in the `pray` action (s from its start): the hat comes off and goes
 * back on (a hand at the brim), and the lowest point of each of the three
 * bows. Whoever plays it (the map's roaming, `roam/_pray.ts`) hides the hat
 * and rings the bell at these times.
 */
export const PRAY = { duration: 9.75, hatOff: 0.4, bows: [3.62, 4.87, 6.12], hatOn: 8.9 } as const;
/** When (s) in `pray` the hands open flat for the sampeah and the bows, and close again. */
export const PRAY_PALMS = [2.2, 6.95] as const;

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

// ─── Pray: kneel, sampeah and three bows (thvay bangkum) ────────────────────
// About 9.75 s: the right hand to the hat brim (the hat comes off at
// PRAY.hatOff) · kneel: the right foot steps back and its knee goes down, then
// the left leg follows · sit back on the heels, sampeah at the chest, then at
// the face · three bows, hands flat on the floor (lowest at PRAY.bows) · hands
// to the thighs, up the same way back (the left foot forward first) · the
// hand to the brim again (PRAY.hatOn) · standing, fading into idle.
// The arms were solved with arm IK (the palms meet and lie flat), the kneeling
// legs so the knees, shins and toes touch the ground (the Animator plants them
// while `pray` plays). He kneels with the feet turned back, soles up: his boots
// are as long as his shins, so with the toes tucked under the shins could not
// rest on the ground.
/** Standing (the idle stance). */
const PRAY_STAND: Pose = {
  hipL: { rz: 0.03, ry: 0.14 }, ankleL: { rz: -0.03 }, hipR: { rz: -0.03, ry: -0.14 }, ankleR: { rz: 0.03 },
  shoulderL: { rx: 0.02, rz: 0.06 }, elbowL: { rx: -0.12 },
  shoulderR: { rx: 0.02, rz: -0.06 }, elbowR: { rx: -0.12 },
};
/** The right hand up at the hat brim (as far as the arm goes), the head tipped toward it. */
const PRAY_HAT: Pose = {
  hipL: { rz: 0.03, ry: 0.14 }, ankleL: { rz: -0.03 }, hipR: { rz: -0.03, ry: -0.14 }, ankleR: { rz: 0.03 },
  chest: { rz: 0.04 }, neck: { rx: 0.06, rz: 0.04 }, head: { rx: 0.14, rz: 0.14 },
  shoulderL: { rx: 0.02, rz: 0.07 }, elbowL: { rx: -0.15 },
  shoulderR: { rx: -2.17, ry: -0.01, rz: -0.39, px: -0.4, py: 1.8, pz: 0.8 }, elbowR: { rx: -0.78 }, wristR: { rx: 0.15, ry: -0.26, rz: 0.44 },
};
/** Weight onto the left foot, the right foot lifts. */
const PRAY_LIFTR: Pose = {
  hipL: { rx: -0.25 }, kneeL: { rx: 0.45 }, ankleL: { rx: -0.2 }, hipR: { rx: -0.3 }, kneeR: { rx: 1.35 }, ankleR: { rx: -0.9 },
  chest: { rx: 0.05 }, head: { rx: 0.03 },
  shoulderL: { rx: -0.1, rz: 0.12 }, elbowL: { rx: -0.3 },
  shoulderR: { rx: -0.1, rz: -0.12 }, elbowR: { rx: -0.3 },
};
/** The right foot steps back, off the ground; the left knee bends. */
const PRAY_STEP: Pose = {
  hipL: { rx: -0.8 }, kneeL: { rx: 1.25 }, ankleL: { rx: -0.45 }, hipR: { rx: 0.25 }, kneeR: { rx: 1.55 }, ankleR: { rx: 0.2 },
  chest: { rx: 0.1 }, head: { rx: 0.04 },
  shoulderL: { rx: -0.3, rz: 0.16 }, elbowL: { rx: -0.45 },
  shoulderR: { rx: -0.15, rz: -0.16 }, elbowR: { rx: -0.35 },
};
/** The right knee down, the left foot flat, the left hand on the left knee. */
const PRAY_HALF: Pose = {
  hipL: { rx: -2.02 }, kneeL: { rx: 2.56 }, ankleL: { rx: -0.54 }, hipR: { rx: -0.15 }, kneeR: { rx: 1.6 }, ankleR: { rx: 1.21 },
  chest: { rx: 0.12 }, head: { rx: 0.06 },
  shoulderL: { rx: -0.39, ry: -0.44, rz: -0.56 }, elbowL: { rx: -1.83 }, wristL: { rx: 1.56, ry: 0.35, rz: 0.62 },
  shoulderR: { rx: -0.12, rz: -0.1 }, elbowR: { rx: -0.3 },
};
/** The left leg swings back to kneel, its toe drawn along the ground (DRAG1‥6: solved so the toe stays on the ground). */
const PRAY_DRAG1: Pose = {
  hipL: { rx: -1.75 }, kneeL: { rx: 2.88 }, ankleL: { rx: -0.78 }, hipR: { rx: -0.15 }, kneeR: { rx: 1.6 }, ankleR: { rx: 1.21 },
  chest: { rx: 0.11 }, head: { rx: 0.06 },
  shoulderL: { rx: -0.2, rz: 0.14 }, elbowL: { rx: -0.35 },
  shoulderR: { rx: -0.13, rz: -0.11 }, elbowR: { rx: -0.3 },
};
const PRAY_DRAG2: Pose = {
  hipL: { rx: -1.45 }, kneeL: { rx: 3.05 }, ankleL: { rx: -0.65 }, hipR: { rx: -0.15 }, kneeR: { rx: 1.6 }, ankleR: { rx: 1.21 },
  chest: { rx: 0.11 }, head: { rx: 0.06 },
  shoulderL: { rx: -0.2, rz: 0.14 }, elbowL: { rx: -0.35 },
  shoulderR: { rx: -0.13, rz: -0.11 }, elbowR: { rx: -0.3 },
};
const PRAY_DRAG3: Pose = {
  hipL: { rx: -1.15 }, kneeL: { rx: 2.96 }, ankleL: { rx: -0.46 }, hipR: { rx: -0.15 }, kneeR: { rx: 1.6 }, ankleR: { rx: 1.21 },
  chest: { rx: 0.1 }, head: { rx: 0.06 },
  shoulderL: { rx: -0.2, rz: 0.14 }, elbowL: { rx: -0.35 },
  shoulderR: { rx: -0.13, rz: -0.11 }, elbowR: { rx: -0.3 },
};
const PRAY_DRAG4: Pose = {
  hipL: { rx: -0.85 }, kneeL: { rx: 2.68 }, ankleL: { rx: -0.03 }, hipR: { rx: -0.15 }, kneeR: { rx: 1.6 }, ankleR: { rx: 1.21 },
  chest: { rx: 0.09 }, head: { rx: 0.05 },
  shoulderL: { rx: -0.2, rz: 0.14 }, elbowL: { rx: -0.35 },
  shoulderR: { rx: -0.13, rz: -0.11 }, elbowR: { rx: -0.3 },
};
const PRAY_DRAG5: Pose = {
  hipL: { rx: -0.55 }, kneeL: { rx: 2.26 }, ankleL: { rx: 0.54 }, hipR: { rx: -0.15 }, kneeR: { rx: 1.6 }, ankleR: { rx: 1.21 },
  chest: { rx: 0.09 }, head: { rx: 0.05 },
  shoulderL: { rx: -0.2, rz: 0.14 }, elbowL: { rx: -0.35 },
  shoulderR: { rx: -0.13, rz: -0.11 }, elbowR: { rx: -0.3 },
};
const PRAY_DRAG6: Pose = {
  hipL: { rx: -0.3 }, kneeL: { rx: 1.83 }, ankleL: { rx: 1.02 }, hipR: { rx: -0.15 }, kneeR: { rx: 1.6 }, ankleR: { rx: 1.21 },
  chest: { rx: 0.08 }, head: { rx: 0.05 },
  shoulderL: { rx: -0.2, rz: 0.14 }, elbowL: { rx: -0.35 },
  shoulderR: { rx: -0.13, rz: -0.11 }, elbowR: { rx: -0.3 },
};
/** Both knees down, upright. */
const PRAY_KNEES: Pose = {
  hipL: { rx: -0.15 }, kneeL: { rx: 1.6 }, ankleL: { rx: 1.21 }, hipR: { rx: -0.15 }, kneeR: { rx: 1.6 }, ankleR: { rx: 1.21 },
  chest: { rx: 0.06 }, head: { rx: 0.05 },
  shoulderL: { rx: -0.12, rz: 0.1 }, elbowL: { rx: -0.3 },
  shoulderR: { rx: -0.12, rz: -0.1 }, elbowR: { rx: -0.3 },
};
/** Sitting back on the heels, the hands on the thighs. */
const PRAY_REST: Pose = {
  hipL: { rx: -0.8 }, kneeL: { rx: 2.25 }, ankleL: { rx: 1.21 }, hipR: { rx: -0.8 }, kneeR: { rx: 2.25 }, ankleR: { rx: 1.21 },
  chest: { rx: 0.04 }, head: { rx: 0.1 },
  shoulderL: { rx: -0.55, ry: -1.11, rz: -0.5 }, elbowL: { rx: -0.96 }, wristL: { rx: 0.88, ry: -0.25, rz: 1.05 },
  shoulderR: { rx: -0.55, ry: 1.11, rz: 0.5 }, elbowR: { rx: -0.96 }, wristR: { rx: 0.88, ry: 0.25, rz: -1.05 },
};
/** Sampeah at the chest: palms together, fingertips up. */
const PRAY_CHEST: Pose = {
  hipL: { rx: -0.8 }, kneeL: { rx: 2.25 }, ankleL: { rx: 1.21 }, hipR: { rx: -0.8 }, kneeR: { rx: 2.25 }, ankleR: { rx: 1.21 },
  head: { rx: 0.08 },
  shoulderL: { rx: -1.08, ry: -0.46, rz: -0.68, px: -0.6, pz: 1.2 }, elbowL: { rx: -0.45 }, wristL: { rx: -1.56, ry: -0.78, rz: 0.17 },
  shoulderR: { rx: -1.08, ry: 0.46, rz: 0.68, px: 0.6, pz: 1.2 }, elbowR: { rx: -0.45 }, wristR: { rx: -1.56, ry: 0.78, rz: -0.17 },
};
/** Sampeah raised to the face, the head bowed onto the fingertips (his arms are too short for the forehead). */
const PRAY_FACE: Pose = {
  hipL: { rx: -0.8 }, kneeL: { rx: 2.25 }, ankleL: { rx: 1.21 }, hipR: { rx: -0.8 }, kneeR: { rx: 2.25 }, ankleR: { rx: 1.21 },
  neck: { rx: 0.1 }, head: { rx: 0.25 },
  shoulderL: { rx: -1.46, ry: -0.37, rz: -0.67, px: -0.6, py: 0.6, pz: 1.5 }, elbowL: { rx: -0.68 }, wristL: { rx: -0.58, ry: -0.54, rz: 0.55 },
  shoulderR: { rx: -1.46, ry: 0.37, rz: 0.67, px: 0.6, py: 0.6, pz: 1.5 }, elbowR: { rx: -0.68 }, wristR: { rx: -0.58, ry: 0.54, rz: -0.55 },
};
/** The bow: hands flat on the floor in front of the knees, the forehead (the fringe) down. */
const PRAY_BOW: Pose = {
  hips: { rx: 0.8 }, hipL: { rx: -1.15 }, kneeL: { rx: 1.8 }, ankleL: { rx: 1.21 }, hipR: { rx: -1.15 }, kneeR: { rx: 1.8 }, ankleR: { rx: 1.21 },
  chest: { rx: 0.55 }, neck: { rx: 0.12 }, head: { rx: 0.18 },
  shoulderL: { rx: -0.77, ry: -0.39, rz: -0.29, py: -0.5, pz: 1.5 }, elbowL: { rx: -1.43 }, wristL: { rx: 2.05, ry: -1.09, rz: 2.83 },
  shoulderR: { rx: -0.77, ry: 0.39, rz: 0.29, py: -0.5, pz: 1.5 }, elbowR: { rx: -1.43 }, wristR: { rx: 2.05, ry: 1.09, rz: -2.83 },
};
const PRAY_KEYS: readonly (readonly [number, Pose])[] = [
  [0, PRAY_STAND],
  [0.4, PRAY_HAT],
  [0.8, PRAY_STAND],
  [1.05, PRAY_LIFTR],
  [1.3, PRAY_STEP],
  [1.58, PRAY_HALF],
  [1.66, PRAY_DRAG1],
  [1.74, PRAY_DRAG2],
  [1.82, PRAY_DRAG3],
  [1.9, PRAY_DRAG4],
  [1.98, PRAY_DRAG5],
  [2.06, PRAY_DRAG6],
  [2.15, PRAY_KNEES],
  [2.55, PRAY_CHEST],
  [3.0, PRAY_FACE],
  [3.55, PRAY_BOW],
  [3.7, PRAY_BOW],
  [4.25, PRAY_FACE],
  [4.8, PRAY_BOW],
  [4.95, PRAY_BOW],
  [5.5, PRAY_FACE],
  [6.05, PRAY_BOW],
  [6.2, PRAY_BOW],
  [6.75, PRAY_FACE],
  [7.15, PRAY_REST],
  [7.45, PRAY_KNEES],
  [7.53, PRAY_DRAG6],
  [7.61, PRAY_DRAG5],
  [7.69, PRAY_DRAG4],
  [7.77, PRAY_DRAG3],
  [7.85, PRAY_DRAG2],
  [7.93, PRAY_DRAG1],
  [8.02, PRAY_HALF],
  [8.3, PRAY_STEP],
  [8.55, PRAY_LIFTR],
  [8.9, PRAY_HAT],
  [9.3, PRAY_STAND],
];

/**
 * Like `sampleKeys`, but the motion flows through the keys instead of stopping
 * at each one: every channel follows a cubic whose slope at a key comes from
 * its neighbours (zero where the channel turns back, and never past a key, so
 * a pose never overshoots). The first and last keys, and every turning point
 * (the bottom of a bow), still come to rest.
 */
function flowKeys(t: number, keys: readonly (readonly [number, Pose])[]): Pose {
  if (t <= keys[0][0]) return keys[0][1];
  const n = keys.length;
  if (t >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0;
  while (keys[i + 1][0] < t) i++;
  const [t1, p1] = keys[i];
  const [t2, p2] = keys[i + 1];
  const p0 = i > 0 ? keys[i - 1] : null;
  const p3 = i + 2 < n ? keys[i + 2] : null;
  const h = t2 - t1;
  const u = (t - t1) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  // (monotone slope: the harmonic mean of the two secants, zero at a turn)
  const slope = (a: number, b: number) => (a * b > 0 ? (2 * a * b) / (a + b) : 0);
  const out: Pose = {};
  const names = new Set([...Object.keys(p1), ...Object.keys(p2)]) as Set<JointName>;
  for (const name of names) {
    const j: JointPose = {};
    for (const c of CHANNELS) {
      const v1 = p1[name]?.[c] ?? 0;
      const v2 = p2[name]?.[c] ?? 0;
      const d = (v2 - v1) / h;
      const m1 = p0 ? slope((v1 - (p0[1][name]?.[c] ?? 0)) / (t1 - p0[0]), d) : 0;
      const m2 = p3 ? slope(d, ((p3[1][name]?.[c] ?? 0) - v2) / (p3[0] - t2)) : 0;
      j[c] = (2 * u3 - 3 * u2 + 1) * v1 + (u3 - 2 * u2 + u) * h * m1 + (-2 * u3 + 3 * u2) * v2 + (u3 - u2) * h * m2;
    }
    out[name] = j;
  }
  return out;
}
const CHANNELS = ['rx', 'ry', 'rz', 'px', 'py', 'pz'] as const;

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
  // Phone held out for a selfie (held until stopped). The Animator puts the
  // right fist where the phone goes with arm IK, turns the head and chest to
  // it, and poses the left hand's gesture; this is the gentle sway on top.
  selfie: {
    duration: 4.0,
    loop: true,
    fadeIn: 0.45,
    fadeOut: 0.4,
    joints: ['chest', 'neck', 'head', ...ARM_JOINTS_R],
    allowLocomotion: false,
    pose: (t) => {
      const sway = Math.sin((t / 4.0) * TAU);
      return {
        chest: { rx: -0.05, rz: 0.015 * sway },
        head: { rz: 0.03 * sway, rx: 0.01 * Math.sin((t / 2.0) * TAU) },
        shoulderR: { rx: -1.6, rz: -0.4 },
        elbowR: { rx: -0.6 },
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
  pray: {
    duration: PRAY.duration,
    loop: false,
    fadeIn: 0.35,
    fadeOut: 0.45,
    joints: FULL_BODY,
    allowLocomotion: false,
    pose: (t) => flowKeys(t, PRAY_KEYS),
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
