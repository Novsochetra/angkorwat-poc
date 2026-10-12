import { traceSource } from '../../../feedback/sourceTrace';
import type { VoxelBuilder } from '../../../voxel/VoxelBuilder';
import { PIECES, registerPieceModel } from '../pieces';
import { mix, OLD_BAMBOO, OLD_STRAW, POST, rng, STRAW, TIE, tone, turned, type Rand, type Src } from './_yardKit';

/**
 * A rice straw stack round a pole (គំនរចំបើង, build/pieces.ts `PIECES.haystack`):
 * after the harvest the straw is the cattle's fodder for the dry season, so
 * every Khmer farm stacks it round a tall pole by the pen: a low bed of old
 * bamboo to keep it off the wet earth, then the straw trodden down in rings
 * round the pole, bulging over the middle and drawn in to a dome; a cap of
 * old grey straw twisted and tied round the pole's top, the pole standing out
 * of it. The cows pull at its foot, so it stands on an eaten-in waist with
 * straw hanging from the overhang; bundles pulled from it lie at its foot
 * with loose straw. Seeded: its lean and bulge, the straw's tones, which side
 * is eaten more, the bundles, sometimes a bamboo fork left leaning on it.
 *
 * Its body (to its shoulders) is `PIECES.haystack.solids`: 2.2 m across, 2.6 m high.
 */

const H = PIECES.haystack.h;
/** Outer radius (m) of a straw ring at height y (0‥1 of the body), before the seed's bulge: the eaten waist, the belly, the dome. */
const PROFILE: readonly [number, number][] = [
  [0.0, 0.76],
  [0.1, 0.85],
  [0.2, 0.97],
  [0.3, 1.03],
  [0.42, 1.05],
  [0.54, 1.01],
  [0.65, 0.93],
  [0.75, 0.81],
  [0.84, 0.65],
  [0.92, 0.46],
  [1.0, 0.26],
];
/** A ring is two crosses of two boxes (the second turned 45°): its outline lies between 0.93 and 1 of this over the arms' half length. */
const CROSS = 1.2;
const ARM = 0.72;
/** The straw body from the bed's top to its crown (m). */
const BODY0 = 0.2;
const BODY1 = 2.48;

function radiusAt(t: number): number {
  for (let i = 1; i < PROFILE.length; i++) {
    const [t1, r1] = PROFILE[i];
    if (t <= t1) {
      const [t0, r0] = PROFILE[i - 1];
      return r0 + ((r1 - r0) * (t - t0)) / (t1 - t0);
    }
  }
  return PROFILE[PROFILE.length - 1][1];
}

registerPieceModel('haystack', (b, look) => {
  const r = rng(look.seed, 59);
  const src = traceSource();

  // ── The pole first, then the bed of old bamboo round its foot ──
  const lean = (r() - 0.5) * 0.04;
  b.box(Math.sin(lean) * -H * 0.5, H / 2 - 0.15, 0, 0.11, H + 0.3, 0.11, tone(POST, r()), 'mapBark', { src, rz: lean });
  for (let k = 0; k < 2; k++)
    for (const d of [-0.55, 0, 0.55]) {
      const c = tone(OLD_BAMBOO, r());
      if (k === 0) b.box(0, 0.045, d, 1.75, 0.09, 0.09, c, 'mapBark', { src, shade: 0.85 });
      else b.box(d, 0.135, 0, 0.09, 0.09, 1.75, c, 'mapBark', { src, shade: 0.85 });
    }

  // ── The straw, ring on ring round the pole: two crosses a ring, each ring turned its own way, so it reads round ──
  const rings = 14;
  const dh = (BODY1 - BODY0) / rings;
  const bulge = 0.96 + r() * 0.1;
  // (the side the cows eat most: its rings drawn in there)
  const eatA = r() * Math.PI * 2;
  const ex = Math.cos(eatA);
  const ez = Math.sin(eatA);
  let turn = r() * 1.5;
  const tufts: [number, number, number][] = [];
  for (let k = 0; k < rings; k++) {
    const t = (k + 0.5) / rings;
    const y = BODY0 + (k + 0.5) * dh;
    const rad = radiusAt(t) * (t > 0.2 && t < 0.7 ? bulge : 1) * (0.97 + r() * 0.06);
    // (the lower rings pulled at on one side; each ring a hand off true)
    const eat = t < 0.3 ? 0.1 * (1 - t / 0.3) : 0;
    const ox = -ex * eat + (r() - 0.5) * 0.05;
    const oz = -ez * eat + (r() - 0.5) * 0.05;
    // (the crown greys in the weather; the rest stays gold)
    const weathered = t > 0.8 ? 0.2 + (t - 0.8) * 1.5 : 0;
    const arm = rad / CROSS;
    for (let q = 0; q < 2; q++) {
      const c = mix(tone(STRAW, r()), tone(OLD_STRAW, r()), Math.min(1, weathered + r() * 0.2));
      const ry = turn + q * (Math.PI / 4);
      const sh = 0.9 + t * 0.12 + (q ? 0.03 : 0);
      b.box(ox, y, oz, arm * 2, dh + 0.04, arm * 2 * ARM, c, 'mapBark', { src, ry, shade: sh });
      b.box(ox, y, oz, arm * 2 * ARM, dh + 0.04, arm * 2, c, 'mapBark', { src, ry, shade: sh * 0.98 });
    }
    turn = r() * (Math.PI / 2);
    tufts.push([y, rad, t]);
  }

  // ── Straw ends hanging down its sides, longer under the eaten waist's overhang ──
  const tuftSrc = traceSource();
  for (const [y, rad, t] of tufts) {
    if (t > 0.92) continue;
    const n = 4;
    const a0 = r() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * Math.PI * 2 + (r() - 0.5) * 0.9;
      // (on the ring's face, out to toward its corners)
      const d = rad * (0.9 + r() * 0.08);
      const under = t > 0.12 && t < 0.3;
      const len = under ? 0.38 + r() * 0.15 : 0.24 + r() * 0.14;
      const droop = under ? -1.45 : -1.15 - r() * 0.25;
      const c = mix(tone(STRAW, r()), tone(OLD_STRAW, r()), t > 0.8 ? 0.5 : r() * 0.3);
      turned(b, Math.cos(a) * d, y - len * 0.35, Math.sin(a) * d, 0.05 + r() * 0.035, 0.022, len, Math.atan2(Math.cos(a), Math.sin(a)), droop, (r() - 0.5) * 0.4, c, 'mapLeaf', 0.95 + r() * 0.1, tuftSrc);
    }
  }

  // ── The cap: old grey straw twisted round the pole's top, a straw rope tying it ──
  const capSrc = traceSource();
  const capY = BODY1;
  for (const [w, h, dy] of [
    [0.5, 0.14, 0.05],
    [0.32, 0.12, 0.16],
    [0.18, 0.1, 0.25],
  ] as const) {
    b.box(0, capY + dy, 0, w, h, w, tone(OLD_STRAW, r()), 'mapBark', { src: capSrc, ry: r() * 1.5, shade: 0.85 });
  }
  b.box(0, capY + 0.21, 0, 0.36, 0.045, 0.36, tone(TIE, r()), 'mapBark', { src: capSrc, ry: 0.4 });
  // (the cap's ragged ends falling down the dome)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + r() * 0.5;
    turned(b, Math.cos(a) * 0.3, capY - 0.02, Math.sin(a) * 0.3, 0.1, 0.03, 0.34, Math.atan2(Math.cos(a), Math.sin(a)), -0.75, 0, tone(OLD_STRAW, r()), 'mapLeaf', 0.85, capSrc);
  }

  // ── At its foot: loose straw, a bundle or two pulled from it, sometimes the fork ──
  loose(b, r, ex, ez, traceSource());
  if (r() < 0.4) fork(b, r, traceSource());
});

/** Loose straw on the earth round the foot (thickest on the eaten side) and one or two tied bundles pulled from it. */
function loose(b: VoxelBuilder, r: Rand, ex: number, ez: number, src: Src): void {
  for (let i = 0; i < 9; i++) {
    const a = Math.atan2(ez, ex) + (i < 5 ? (r() - 0.5) * 1.6 : r() * Math.PI * 2);
    const d = 0.85 + r() * 0.3;
    turned(b, Math.cos(a) * d, 0.02, Math.sin(a) * d, 0.32 + r() * 0.25, 0.035, 0.42 + r() * 0.3, r() * Math.PI, 0, (r() - 0.5) * 0.15, tone(STRAW, r()), 'mapLeaf', 0.9 + r() * 0.1, src);
  }
  const n = r() < 0.5 ? 1 : 2;
  for (let k = 0; k < n; k++) {
    const a = Math.atan2(ez, ex) + (k - 0.5) * 0.9 + (r() - 0.5) * 0.4;
    const d = 0.98 + r() * 0.12;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const yaw = a + Math.PI / 2 + (r() - 0.5) * 0.6;
    const c = tone(STRAW, r());
    // (a sheaf: tied round its middle, its ends flaring)
    turned(b, x, 0.1, z, 0.24, 0.19, 0.62, yaw, 0, 0, c, 'mapLeaf', 1, src);
    for (const s of [-1, 1]) turned(b, x + Math.sin(yaw) * s * 0.26, 0.11, z + Math.cos(yaw) * s * 0.26, 0.3, 0.22, 0.12, yaw, 0, 0, c, 'mapLeaf', 0.95, src);
    turned(b, x, 0.1, z, 0.255, 0.205, 0.06, yaw, 0, 0, tone(TIE, r()), 'mapBark', 0.9, src);
  }
}

/** A bamboo hay fork leaning on the stack: its long handle, the two tines at the top. */
function fork(b: VoxelBuilder, r: Rand, src: Src): void {
  const a = r() * Math.PI * 2;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  // (its foot on the earth out from the stack, leaning in to rest on the belly at about 1.95 m)
  const foot = 1.35;
  const len = 2.0;
  const lean = 0.236;
  const yaw = Math.atan2(-ca, -sa);
  const reach = Math.sin(lean) * len;
  const cx = ca * (foot - reach / 2);
  const cz = sa * (foot - reach / 2);
  turned(b, cx, (Math.cos(lean) * len) / 2, cz, 0.06, 0.06, len, yaw, Math.PI / 2 - lean, 0, tone(OLD_BAMBOO, r()), 'mapBark', 1, src);
  // (the two tines: on from the handle's top, a hand apart)
  const tx = ca * (foot - reach) - ca * Math.sin(lean) * 0.12;
  const tz = sa * (foot - reach) - sa * Math.sin(lean) * 0.12;
  const ty = Math.cos(lean) * (len + 0.12);
  for (const s of [-1, 1]) turned(b, tx - sa * s * 0.07, ty, tz + ca * s * 0.07, 0.035, 0.035, 0.3, yaw, Math.PI / 2 - lean, 0, tone(OLD_BAMBOO, r()), 'mapBark', 0.95, src);
}
