import { Vector3 } from 'three';
import { VoxelBuilder } from '../voxel/VoxelBuilder';
import { BODY_UNIT_M } from '../world/scale';
import { solveArm } from './Animator';
import { gait } from './clips';
import type { Pose } from './pose';
import { JOINTS } from './skeleton';

/**
 * Walking round the pagoda's hall at its festivals (roam/_visak.ts,
 * roam/_pchumBen.ts): a posture for `Animator.posture` (with
 * `postureFeet = true`: the walk's feet are planted on the floor as usual).
 *
 * - `candle` (Visak Bochea): a slow walk, the head a little bowed, both hands
 *   together before the chest holding a lit candle, three incense sticks
 *   and a lotus bud (`buildOffering`, on the chest joint between the fists).
 * - `basket` (Pchum Ben): the right hand holds a small basket of sticky-rice
 *   balls before the belly (`buildBasket`); the left arm swings with the
 *   walk, and to throw (`throwT` from 0) it takes a ball from the basket,
 *   draws back by the ear and casts it out to the left — away from the hall,
 *   into the dark — the chest and the head turning with it.
 *
 * The legs are the walk cycle's own (character/clips.ts `gait`) at the
 * line's slow pace: `phase` advanced by the caller (`stepPhase`), `walk`
 * 0 standing ‥ 1 walking. Units: body units (BU), chest space for the hands
 * (+x his left, +z forward).
 */

export interface ProcessionPose {
  mode: 'candle' | 'basket';
  /** 0 standing ‥ 1 walking (eased by the caller). */
  walk: number;
  /** The walk cycle (cycles, 0‥1). */
  phase: number;
  /** How far the hands are on what they hold (0 down at his sides ‥ 1 holding): the moment he takes it. */
  hold: number;
  /** Seconds since the throw began (basket), or < 0: none. */
  throwT: number;
  /** Seconds (breathing). */
  t: number;
}

/** Ground one walk cycle covers here (true metres): a short, calm step. */
export const PROCESSION_STRIDE = 0.86;
/** Seconds of a throw, and when in it the ball leaves the hand. */
export const THROW = { length: 1.15, release: 0.6, take: 0.2 } as const;

/** BU per true metre. */
const BU = 1 / BODY_UNIT_M;
/** The chest joint's rest pivot (character space): props on the chest joint are authored relative to it. */
const CHEST = new Vector3(...JOINTS.chest.pivot);

/** The fists on the candle (chest space). */
const CANDLE_HANDS = { L: new Vector3(0.8, 3.3, 5.3), R: new Vector3(-0.8, 3.3, 5.3) };
/** Where the candle's flame is (chest space): its glow. */
export const CANDLE_FLAME = new Vector3(0, 6.15, 5.45);
/** The right fist under the basket, the basket's middle (chest space). */
const BASKET_HAND = new Vector3(-1.5, 2.5, 4.7);
export const BASKET_AT = new Vector3(-1.1, 3.0, 5.0);
/** The left fist through the throw: (time s, x, y, z) in chest space; then back into the walk's swing. */
const THROW_KEYS: readonly [number, number, number, number][] = [
  [0.2, 0.4, 3.4, 5.2],
  [0.45, 4.6, 6.9, 1.8],
  [0.6, 9.4, 5.6, 4.6],
  [0.85, 7.4, 1.8, 4.2],
];
const POLE = { L: new Vector3(0.8, -0.5, -0.3).normalize(), R: new Vector3(-0.8, -0.5, -0.3).normalize(), throwL: new Vector3(0.5, -0.4, -0.75).normalize() };
const _t = new Vector3();

/** Advance the walk cycle for `speed` true m/s over `dt` s. */
export function stepPhase(s: ProcessionPose, speed: number, dt: number): void {
  s.phase = (s.phase + (speed * dt) / PROCESSION_STRIDE) % 1;
}

const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const mixPose = (a: { rx?: number; ry?: number; rz?: number } | undefined, b: { rx?: number; ry?: number; rz?: number } | undefined, k: number) => ({
  rx: (a?.rx ?? 0) + ((b?.rx ?? 0) - (a?.rx ?? 0)) * k,
  ry: (a?.ry ?? 0) + ((b?.ry ?? 0) - (a?.ry ?? 0)) * k,
  rz: (a?.rz ?? 0) + ((b?.rz ?? 0) - (a?.rz ?? 0)) * k,
});

/** The left fist during the throw at `t` s (chest space, into `out`); null outside it. */
function throwFist(t: number, out: Vector3): Vector3 | null {
  if (t < 0 || t > THROW.length) return null;
  const k = THROW_KEYS;
  if (t <= k[0][0]) {
    const u = ease(t / k[0][0]);
    return out.set(6.2 + (k[0][1] - 6.2) * u, 0.6 + (k[0][2] - 0.6) * u, 1.2 + (k[0][3] - 1.2) * u);
  }
  for (let i = 1; i < k.length; i++)
    if (t <= k[i][0]) {
      const u = ease((t - k[i - 1][0]) / (k[i][0] - k[i - 1][0]));
      return out.set(k[i - 1][1] + (k[i][1] - k[i - 1][1]) * u, k[i - 1][2] + (k[i][2] - k[i - 1][2]) * u, k[i - 1][3] + (k[i][3] - k[i - 1][3]) * u);
    }
  return out.set(k[k.length - 1][1], k[k.length - 1][2], k[k.length - 1][3]);
}

/** The left fist's place in chest space while throwing (for the ball in it), or null. */
export function throwHand(t: number, out: Vector3): Vector3 | null {
  return throwFist(t, out);
}

/** The posture: the walk's legs and body, the hands on what they hold. */
export function processionPose(s: ProcessionPose): Pose {
  const cycle = PROCESSION_STRIDE * BU;
  const g = gait(s.phase, 0, s.walk, cycle).pose;
  const breathe = 0.015 * Math.sin(s.t * 1.6);
  const pose: Pose = { ...g };
  const swingL = { shoulderL: g.shoulderL, elbowL: g.elbowL };
  if (s.mode === 'candle') {
    // A little bowed, the eyes on the flame now and then.
    pose.chest = { rx: (g.chest?.rx ?? 0) + 0.06 + breathe, ry: (g.chest?.ry ?? 0) * 0.5 };
    pose.neck = { rx: 0.08 };
    pose.head = { rx: 0.14 + 0.04 * Math.sin(s.t * 0.37), ry: (g.head?.ry ?? 0) * 0.5 };
    const h = ease(s.hold);
    for (const side of ['L', 'R'] as const) {
      const ik = solveArm(side, CANDLE_HANDS[side], POLE[side]);
      const sh = `shoulder${side}` as const;
      const el = `elbow${side}` as const;
      pose[sh] = mixPose(g[sh], ik[sh], h);
      pose[el] = mixPose(g[el], ik[el], h);
      pose[`wrist${side}`] = {};
    }
    return pose;
  }
  // The basket: the right hand under it before the belly; the left free (or throwing).
  pose.chest = { rx: (g.chest?.rx ?? 0) + 0.03 + breathe, ry: g.chest?.ry ?? 0 };
  const h = ease(s.hold);
  const ikR = solveArm('R', BASKET_HAND, POLE.R);
  pose.shoulderR = mixPose(g.shoulderR, ikR.shoulderR, h);
  pose.elbowR = mixPose(g.elbowR, ikR.elbowR, h);
  pose.wristR = { rx: -0.25 * h };
  const fist = throwFist(s.throwT, _t);
  if (fist) {
    // In and out of the throw over its first and last fifth of a second; the chest and the head turn out to the left with it.
    const w = ease(Math.min(s.throwT / 0.2, (THROW.length - s.throwT) / 0.25, 1));
    const ik = solveArm('L', fist, POLE.throwL);
    pose.shoulderL = mixPose(swingL.shoulderL, ik.shoulderL, w);
    pose.elbowL = mixPose(swingL.elbowL, ik.elbowL, w);
    pose.wristL = {};
    const turn = 0.32 * Math.sin(Math.PI * Math.min(1, s.throwT / THROW.length));
    pose.chest = { rx: pose.chest.rx, ry: (pose.chest.ry ?? 0) + turn };
    pose.head = { rx: (g.head?.rx ?? 0) - 0.05, ry: (g.head?.ry ?? 0) + turn * 1.3 };
  }
  return pose;
}

/** Character-space box from chest-space corners. */
function chestBox(b: VoxelBuilder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, mat: Parameters<VoxelBuilder['span']>[7]): void {
  b.span(x0 + CHEST.x, y0 + CHEST.y, z0 + CHEST.z, x1 + CHEST.x, y1 + CHEST.y, z1 + CHEST.z, color, mat);
}

/** A lit candle, three incense sticks and a lotus bud held together between the fists (for the chest joint). */
export function buildOffering(): VoxelBuilder {
  const b = new VoxelBuilder();
  const c = CANDLE_FLAME;
  // The candle: white wax, a little cup of flame on it (the glow and its halo: the add-on).
  chestBox(b, -0.32, 2.7, c.z - 0.32, 0.32, c.y - 0.55, c.z + 0.32, 0xf6efd8, 'wax');
  chestBox(b, -0.06, c.y - 0.55, c.z - 0.06, 0.06, c.y - 0.35, c.z + 0.06, 0x2a2420, 'wood');
  chestBox(b, -0.2, c.y - 0.4, c.z - 0.2, 0.2, c.y + 0.2, c.z + 0.2, 0xffb24a, 'glow');
  chestBox(b, -0.1, c.y - 0.25, c.z - 0.1, 0.1, c.y + 0.45, c.z + 0.1, 0xfff0b0, 'glow');
  // Incense: three thin red sticks, glowing tips.
  for (const dx of [-0.75, -0.95, -1.15]) {
    chestBox(b, dx - 0.07, 2.9, c.z - 0.07 + 0.15, dx + 0.07, 7.6, c.z + 0.07 + 0.15, 0xa8322a, 'wood');
    chestBox(b, dx - 0.1, 7.6, c.z - 0.1 + 0.15, dx + 0.1, 7.85, c.z + 0.1 + 0.15, 0xff8a3a, 'glow');
  }
  // The lotus bud on its green stem, in front of the left fist.
  const lx = 0.85;
  const lz = c.z + 0.35;
  chestBox(b, lx - 0.1, 2.8, lz - 0.1, lx + 0.1, 5.0, lz + 0.1, 0x4a8a3a, 'foliage');
  chestBox(b, lx - 0.45, 5.0, lz - 0.45, lx + 0.45, 5.9, lz + 0.45, 0xf2a8c0, 'petal');
  chestBox(b, lx - 0.32, 5.9, lz - 0.32, lx + 0.32, 6.6, lz + 0.32, 0xec98b4, 'petal');
  chestBox(b, lx - 0.15, 6.6, lz - 0.15, lx + 0.15, 7.1, lz + 0.15, 0xe888a8, 'petal');
  return b;
}

/** The small basket of sticky-rice balls (bay ben) held before the belly, `balls` left in it (for the chest joint). */
export function buildBasket(balls: number): VoxelBuilder {
  const b = new VoxelBuilder();
  const a = BASKET_AT;
  // A shallow woven basket lined with banana leaf.
  chestBox(b, a.x - 1.35, a.y - 0.6, a.z - 1.35, a.x + 1.35, a.y - 0.25, a.z + 1.35, 0xb8945a, 'hat');
  for (const [x0, z0, x1, z1] of [
    [-1.45, -1.45, 1.45, -1.15],
    [-1.45, 1.15, 1.45, 1.45],
    [-1.45, -1.15, -1.15, 1.15],
    [1.15, -1.15, 1.45, 1.15],
  ])
    chestBox(b, a.x + x0, a.y - 0.55, a.z + z0, a.x + x1, a.y + 0.35, a.z + z1, 0xa8844a, 'hat');
  chestBox(b, a.x - 1.15, a.y - 0.25, a.z - 1.15, a.x + 1.15, a.y - 0.12, a.z + 1.15, 0x4f9a3a, 'foliage');
  const spots: [number, number][] = [
    [-0.55, -0.5],
    [0.5, -0.45],
    [-0.5, 0.5],
    [0.55, 0.5],
    [0, 0],
    [0, -0.85],
    [-0.85, 0],
  ];
  for (let i = 0; i < Math.min(balls, spots.length); i++) {
    const [x, z] = spots[i];
    const y = i === 4 ? 0.35 : 0;
    chestBox(b, a.x + x - 0.5, a.y - 0.12 + y, a.z + z - 0.5, a.x + x + 0.5, a.y + 0.75 + y, a.z + z + 0.5, 0xf6f2e6, 'shirt');
  }
  return b;
}
