import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { hash3 } from '../../voxel/random';
import { PALETTE } from '../palette';
import { ARM_CENTER_X, LEG_CENTER_X, LEG_CENTER_Z } from '../skeleton';

/**
 * Arms and legs. Everything is authored for the character's LEFT side (+X) and
 * mirrored for the right, like the reference turnaround.
 */
export type Side = 'L' | 'R';
export type HandPose = 'relaxed' | 'holding' | 'pointing';
export type LegStyle = 'shorts' | 'sampot';

const AX = ARM_CENTER_X;
const LX = LEG_CENTER_X;
const LZ = LEG_CENTER_Z;
const seedOf = (side: Side, n: number) => (side === 'L' ? n : n + 500);
const finish = (b: VoxelBuilder, side: Side) => (side === 'R' ? b.mirrorX() : b);

// ─── Arms ──────────────────────────────────────────────────────────────────

/** Short puffy sleeve with a rolled cuff (sheet 3.3.4). Shoulder joint. */
export function buildUpperArm(side: Side): VoxelBuilder {
  const b = new VoxelBuilder();
  const S = PALETTE.shirt;
  const tone = (i: number, j: number, k: number) => {
    const r = hash3(i, j, k, seedOf(side, 41));
    return r < 0.55 ? S.base : r < 0.85 ? S.light : S.mid;
  };
  // i 0 → x AX−2.0‥AX−1.2 (shoulder cap, joins the torso), i 1‥3 → sleeve tube.
  const g = b.grid({ cell: 0.8, origin: [AX - 2.0, 15.0, -1.2], mat: 'shirt', jitter: 0.035, ao: 0.26, seed: seedOf(side, 41) });
  g.fill(1, 3, 0, 3, 0, 2, tone);
  g.fill(0, 0, 3, 3, 0, 2, tone);
  g.fill(0, 2, 4, 4, 0, 2, tone);
  g.delete(2, 4, 0);
  g.delete(2, 4, 2);
  g.paint((i, j, _k, c) => (i === 1 && j <= 1 ? S.mid : c.color)); // shaded underside toward the body
  g.commit();

  // Rolled cuff: one block proud of the sleeve all round, lighter fold on the bottom row.
  const c = b.grid({ cell: 0.8, origin: [AX - 1.6, 13.4, -1.6], mat: 'shirt', jitter: 0.03, ao: 0.18, seed: seedOf(side, 43) });
  c.fill(0, 3, 0, 1, 0, 3, (i, j, k) => (j === 0 ? (hash3(i, j, k, 7) < 0.6 ? S.light : S.cuff) : S.cuff));
  c.commit();
  return finish(b, side);
}

/** Short forearm between cuff and fist. Elbow joint. */
export function buildForearm(side: Side): VoxelBuilder {
  const b = new VoxelBuilder();
  const g = b.grid({ cell: 1, origin: [AX - 1, 12.0, -1], mat: 'skin', jitter: 0.02, ao: 0.12, seed: seedOf(side, 45) });
  g.fill(0, 1, 0, 1, 0, 1, PALETTE.skin.base);
  g.commit();
  return finish(b, side);
}

/**
 * Chunky voxel fist (sheet 3.3.11: relaxed / holding / pointing). Wrist joint.
 * Palm faces the body (−X for the left hand), thumb forward, fingers down; the
 * grip channel runs along local Z so a held torch points up when the forearm is
 * raised.
 */
export function buildHand(side: Side, pose: HandPose = 'relaxed'): VoxelBuilder {
  const b = new VoxelBuilder();
  const K = PALETTE.skin;
  const x0 = AX - 1.35; // palm side
  const x1 = AX + 1.35; // back of the hand
  // Back of hand / palm: 3 × 2 × 3 blocks.
  const g = b.grid({ cell: [0.9, 0.925, 0.9], origin: [x0, 10.45, -1.35], mat: 'skin', jitter: 0.02, ao: 0.18, seed: seedOf(side, 47) });
  g.fill(0, 2, 0, 1, 0, 2, K.base);
  g.commit();

  // Four curled fingers under the palm, tucked slightly toward the palm side.
  const fingerZ = [-1.0, -0.333, 0.333, 1.0];
  fingerZ.forEach((z, f) => {
    const knuckle = hash3(f, 1, 2, seedOf(side, 48)) * 0.06;
    if (pose === 'pointing' && f === 3) {
      // Index finger straight out along −Y.
      b.span(x0 + 0.95, 8.0, z - 0.3, x0 + 1.75, 10.5, z + 0.3, K.base, 'skin', { shade: 1.02 });
      b.span(x0 + 0.95, 7.7, z - 0.26, x0 + 1.72, 8.05, z + 0.26, K.light, 'skin', { shade: 0.96 });
      return;
    }
    const top = pose === 'holding' ? 10.5 : 10.47;
    b.span(x0 + 0.3, 9.5 + knuckle, z - 0.3, x1 - 0.12, top, z + 0.3, K.base, 'skin', { shade: 0.98 - f * 0.01 });
  });

  // Thumb along the index finger, on the palm side.
  if (pose === 'holding') {
    b.span(x0 - 0.08, 10.0, 0.45, x0 + 0.9, 10.9, 1.4, K.base, 'skin', { shade: 1.03 });
  } else {
    b.span(x0 - 0.06, 9.85, 0.62, x0 + 0.62, 11.2, 1.38, K.base, 'skin', { shade: 1.03 });
  }
  // Knuckle ridge on the back of the hand.
  b.span(x1 - 0.05, 10.2, -1.2, x1 + 0.12, 10.62, 1.2, K.base, 'skin', { shade: 0.97 });
  return finish(b, side);
}

// ─── Legs ──────────────────────────────────────────────────────────────────

/** Seat / waist of the shorts (or sampot). Hips joint. */
export function buildPelvis(style: LegStyle = 'shorts'): VoxelBuilder {
  const b = new VoxelBuilder();
  const C = style === 'shorts' ? PALETTE.shorts : null;
  const T = PALETTE.sampot;
  const g = b.grid({ cell: [1, 1, 0.933], origin: [-4.5, 9.6, -3.0], mat: 'shorts', jitter: 0.04, ao: 0.2, seed: 51 });
  g.fill(0, 8, 0, 1, 0, 5, (i, j, k) => {
    const r = hash3(i, j, k, 52);
    if (C) return r < 0.6 ? C.base : r < 0.85 ? C.dark : C.light;
    return r < 0.6 ? T.base : r < 0.85 ? T.dark : T.light;
  });
  for (let k = 0; k <= 5; k++) g.delete(4, 0, k); // crotch gap between the legs
  g.commit();
  return b;
}

/** Shorts leg with the outset hem. Hip joint. */
export function buildThigh(side: Side, style: LegStyle = 'shorts'): VoxelBuilder {
  const b = new VoxelBuilder();
  if (style === 'sampot') {
    const T = PALETTE.sampot;
    const g = b.grid({ cell: [1.1, 1, 1.12], origin: [LX - 2.2, 7.0, LZ - 2.8], mat: 'shorts', jitter: 0.05, ao: 0.22, seed: seedOf(side, 53) });
    g.fill(0, 3, 0, 3, 0, 4, (i, j, k) => (j === 1 && (i + k) % 2 === 0 ? T.gold : hash3(i, j, k, 3) < 0.6 ? T.base : T.light));
    g.commit();
    return finish(b, side);
  }
  const C = PALETTE.shorts;
  const g = b.grid({ cell: [1.06, 1, 1.04], origin: [LX - 2.12, 7.8, LZ - 2.4], mat: 'shorts', jitter: 0.045, ao: 0.22, seed: seedOf(side, 53) });
  g.fill(0, 3, 0, 2, 0, 4, (i, j, k) => {
    const r = hash3(i, j, k, 54);
    return r < 0.6 ? C.base : r < 0.85 ? C.dark : C.light;
  });
  g.commit();
  // Hem: one row proud of the leg (the flared cuff seen in every view).
  const h = b.grid({ cell: [1.17, 1, 1.12], origin: [LX - 2.34, 6.8, LZ - 2.6], mat: 'shorts', jitter: 0.04, ao: 0.16, seed: seedOf(side, 55) });
  h.fill(0, 3, 0, 0, 0, 4, (i, _j, k) => (hash3(i, 0, k, 56) < 0.7 ? C.hem : C.light));
  h.commit();
  return finish(b, side);
}

/** Knee, cream sock, boot shaft and cuff. Knee joint. */
export function buildShin(side: Side, style: LegStyle = 'shorts'): VoxelBuilder {
  const b = new VoxelBuilder();
  const K = PALETTE.skin;
  const B = PALETTE.boot;
  if (style === 'sampot') {
    const T = PALETTE.sampot;
    const g = b.grid({ cell: [1.05, 1, 1.07], origin: [LX - 2.1, 4.4, LZ - 2.65], mat: 'shorts', jitter: 0.05, ao: 0.22, seed: seedOf(side, 57) });
    g.fill(0, 3, 0, 2, 0, 4, (i, j, k) => (j === 0 ? T.dark : hash3(i, j, k, 8) < 0.6 ? T.base : T.light));
    g.commit();
  } else {
    const kg = b.grid({ cell: 1, origin: [LX - 1.5, 5.6, LZ - 1.5], mat: 'skin', jitter: 0.02, ao: 0.1, seed: seedOf(side, 57) });
    kg.fill(0, 2, 0, 1, 0, 2, (_i, j) => (j === 1 ? K.warm : K.base));
    kg.commit();
    const sg = b.grid({ cell: [0.97, 1, 0.97], origin: [LX - 1.455, 4.6, LZ - 1.455], mat: 'sock', jitter: 0.03, ao: 0.1, seed: seedOf(side, 58) });
    sg.fill(0, 2, 0, 0, 0, 2, PALETTE.sock);
    sg.commit();
  }
  // Boot shaft (2.6–3.6, narrower than the foot) and folded cuff (3.6–4.6).
  const sh = b.grid({ cell: [0.86, 1, 0.9], origin: [LX - 1.72, 2.6, -2.7], mat: 'boot', jitter: 0.05, ao: 0.2, seed: seedOf(side, 59) });
  sh.fill(0, 3, 0, 0, 0, 3, (i, _j, k) => (hash3(i, 0, k, 9) < 0.6 ? B.base : B.upper));
  sh.commit();
  const cf = b.grid({ cell: [1.0, 1, 1.02], origin: [LX - 2.0, 3.6, -2.94], mat: 'boot', jitter: 0.05, ao: 0.14, seed: seedOf(side, 60) });
  cf.fill(0, 3, 0, 0, 0, 3, (i, _j, k) => (hash3(i, 0, k, 10) < 0.7 ? B.cuff : B.base));
  cf.commit();
  // Lighter tongue panel on the front of the shaft with a tiny buckle.
  b.span(LX - 0.75, 2.72, 0.9, LX + 0.75, 3.38, 1.1, B.toe, 'boot', { shade: 1.12 });
  b.span(LX + 0.12, 2.84, 1.06, LX + 0.5, 3.26, 1.18, PALETTE.brassDark, 'brass');
  return finish(b, side);
}

/** Foot: thin sole, toe box and instep. Ankle joint. */
export function buildFoot(side: Side): VoxelBuilder {
  const b = new VoxelBuilder();
  const B = PALETTE.boot;
  const toeCorner = (i: number, k: number) => k === 7 && (i === 0 || i === 3);
  const sole = b.grid({ cell: [1.1, 0.6, 1.02], origin: [LX - 2.2, 0, -3.95], mat: 'boot', jitter: 0.04, ao: 0.1, seed: seedOf(side, 62) });
  for (let i = 0; i <= 3; i++) for (let k = 0; k <= 7; k++) if (!toeCorner(i, k)) sole.set(i, 0, k, B.sole);
  sole.commit();
  const g = b.grid({ cell: [1.07, 1, 1], origin: [LX - 2.14, 0.6, -3.9], mat: 'boot', jitter: 0.05, ao: 0.24, seed: seedOf(side, 61) });
  for (let i = 0; i <= 3; i++)
    for (let k = 0; k <= 7; k++) {
      if (toeCorner(i, k)) continue;
      g.set(i, 0, k, k >= 5 ? B.toe : hash3(i, 1, k, 11) < 0.6 ? B.base : B.upper);
      if (k >= 1 && k <= 5) g.set(i, 1, k, k === 5 ? B.toe : hash3(i, 2, k, 12) < 0.6 ? B.upper : B.base);
    }
  g.commit();
  return finish(b, side);
}
