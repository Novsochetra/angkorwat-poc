import { registerModel } from '../look';
import type { PlantLook } from '../state';
import {
  BOOTS,
  DEAD,
  FAN,
  FAN_OLD,
  FAN_YOUNG,
  FLOWER,
  FRUIT_CAP,
  HEART,
  PALM_FRUIT,
  PalmKit,
  palmR,
  SHEATH,
  STALK,
  SUGAR_TRUNK,
  SUGAR_TRUNK_LOW,
  fallenSpot,
  fan,
  mixHex,
  pick,
  strap,
  witherOf,
  type Wither,
} from './_palmKit';

/**
 * The sugar palm ត្នោត (Borassus flabellifer, Cambodia's national tree; garden/kinds.ts
 * `KINDS.sugarPalm`; the contract: garden/look.ts), stage by stage, as the map's own
 * sugar palms (veg/palms.ts `sugarPalm`) in the garden's blocks. It grows as it
 * really does: for years a trunkless rosette of fans at the ground, then the trunk.
 *
 * - 0: the seedling: the dark seed's husk at the foot, a first folded strap of a leaf
 *   and a small folded fan;
 * - 1: a little rosette of young fans on their stalks;
 * - 2: a bigger rosette (≈ 2 m) of stiff fans on long spiny stalks, the clump of
 *   leaf bases at the foot, an old fan dying;
 * - 3: a young palm: a short trunk with its swollen foot, the leaf bases, a crown
 *   of fans and the first dead ones under it;
 * - 4: grown (≈ 13 m): the straight dark trunk swollen at the foot, the split leaf
 *   bases under the crown, the round crown of stiff fans (young ones up, old ones
 *   out and yellowing), a skirt of dead brown fans under it; in its months bunches
 *   of round purple-black fruit (ripe ones fall: `fallen` round the foot, drawn
 *   smooth by the view, garden/_viewFruit.ts), out of them the flower stalks.
 *
 * Thirsty (`droop`), the fans hang, fold and pale (1) or go limp and yellow-brown
 * (2); dead, a dry brown rosette, nothing green.
 */

/** The sugar palm's seeded numbers' salt; its fallen fruit lie this far round from its `turn` (rad), up to this far out (m). */
const SALT = 17;
const FALL_TURN = 3.4;
const FALL_REACH = 1.9;

/**
 * Where fallen fruit `i` lies (local m: x, z), as the model lays it (its `turn` is `K.r(1)`; _palmKit.ts
 * `fallenSpot`). roam/_gardenWork.ts goes there to pick it up.
 */
export function fallenAt(look: PlantLook, i: number): [number, number] {
  const r = palmR(look.seed, SALT);
  return fallenSpot(r, look.fallen, r(1) * Math.PI * 2 + FALL_TURN, FALL_REACH, i);
}

registerModel('sugarPalm', (b, look) => {
  const K = new PalmKit(b, look.seed, SALT);
  const W = witherOf(look);
  if (look.stage === 0) seedling(K, W);
  else if (look.stage <= 2) rosette(K, look, W);
  else palm(K, look, W);
});

/** The fans' tones by their age in the crown (0 the youngest ‥ 1 the oldest). */
const tones = (u: number) => (u < 0.18 ? FAN_YOUNG : u > 0.8 ? FAN_OLD : FAN);

/** Stage 0: the seed's husk, a strap of a first leaf and a small folded fan. */
function seedling(K: PalmKit, W: Wither): void {
  const turn = K.r(1) * Math.PI * 2;
  // The seed (dark, fibrous), half in the earth beside the shoot.
  K.block(0.11 * Math.sin(turn + 2), 0.0, 0.11 * Math.cos(turn + 2), 0.15, 0.12, 0.13, turn, 0x3a2e28, 'petal', 0.95);
  K.block(0, 0.06, 0, 0.07, 0.14, 0.07, turn, W.dead ? 0x6f573a : pick(SHEATH, K.r(3)), 'mapLeaf', 0.9);
  strap(K, 0, 0.12, 0, turn, 1.38 - W.sag, 0, 0.4 * (W.dead ? 0.8 : 1), 0.09, 0.6 * W.bend, W.tint(FAN_YOUNG[0], K.r(4)), 1, 3, 0.8);
  fan(K, 0, 0.12, 0, turn + 2.6, 1.15 - W.sag, 0.5, 0.17, 0.25, 0.4 * W.bend, W.tint(FAN_YOUNG[1], K.r(5)), 1, { segs: 5, spread: 1.5 * W.fold, stalk: W.tint(STALK[0], K.r(6)), stalkW: 0.04 });
}

/** Stages 1 and 2: a trunkless rosette of fans at the ground. */
function rosette(K: PalmKit, look: PlantLook, W: Wither): void {
  const big = look.stage === 2;
  const turn = K.r(1) * Math.PI * 2;
  // The foot: the young leaves' sheaths (stage 1), the clump of old leaf bases (2).
  if (big) {
    K.block(0, 0.14, 0, 0.44, 0.38, 0.44, turn, W.dead ? DEAD[1] : pick(BOOTS, K.r(2)), 'mapBark', 0.92);
    K.block(0, 0.16, 0, 0.4, 0.36, 0.4, turn + Math.PI / 4, W.dead ? DEAD[3] : pick(BOOTS, K.r(3)), 'mapBark', 0.86);
    K.block(0, 0.4, 0, 0.26, 0.24, 0.26, turn + 0.3, W.dead ? DEAD[0] : HEART, 'mapLeaf', 0.9);
  } else K.block(0, 0.1, 0, 0.13, 0.24, 0.13, turn, W.dead ? DEAD[1] : pick(SHEATH, K.r(2)), 'mapLeaf', 0.9);
  K.mark();
  // (held up in a vase on stiff stalks, the oldest leaning out)
  const N = big ? 9 : 5;
  const y0 = big ? 0.4 : 0.18;
  for (let k = 0; k < N; k++) {
    const u = (k + 0.5) / N;
    const el = Math.asin(Math.max(-1, Math.min(1, (big ? 0.98 - 1.05 * u : 0.98 - 0.75 * u) + (K.r(200 + k) - 0.5) * 0.1))) - W.sag * (0.5 + u);
    const az = turn + k * 2.39996 + (K.r(210 + k) - 0.5) * 0.3;
    const stalk = big ? 0.6 + 0.3 * u + (K.r(220 + k) - 0.5) * 0.12 : 0.24 + 0.12 * u + (K.r(220 + k) - 0.5) * 0.06;
    const blade = big ? 0.7 + 0.12 * Math.sin(Math.PI * u) + (K.r(230 + k) - 0.5) * 0.08 : 0.34 + 0.06 * Math.sin(Math.PI * u);
    const bend = (0.08 + 0.3 * u * u) * W.bend;
    const roll = (K.r(240 + k) < 0.5 ? -1 : 1) * (0.25 + 0.6 * K.r(245 + k));
    const c = W.tint(pick(tones(u), K.r(250 + k)), K.r(255 + k));
    const sc = W.tint(pick(STALK, K.r(256 + k)), K.r(257 + k));
    fan(K, 0, y0, 0, az, el, roll, stalk, blade, bend, c, 0.92 + K.r(260 + k) * 0.16, { segs: big ? 9 : 7, spread: (big ? 3.3 : 2.7) * W.fold, stalk: sc, stalkW: big ? 0.07 : 0.045, spines: big, tip: W.dead ? 0.6 : 1 });
  }
  // An old fan dying, lying out low (stage 2).
  if (big) {
    const az = turn + 1.1 + K.r(300) * 0.6;
    fan(K, 0, 0.3, 0, az, -0.15, 0.6, 0.75, 0.48, 0.25, pick(DEAD, K.r(301)), 0.95, { segs: 7, spread: 2.4, stalk: pick(DEAD, K.r(302)), stalkW: 0.06, tip: 0.6 });
  }
}

/** Stages 3 and 4: the trunk, its leaf bases, the crown, dead fans and (grown) fruit. */
function palm(K: PalmKit, look: PlantLook, W: Wither): void {
  const grown = look.stage === 4;
  const turn = K.r(1) * Math.PI * 2;
  // The heart of the crown (veg/palms.ts `h`), the crown's base under it.
  const h = grown ? 10.6 + K.r(2) * 0.5 : 2.3;
  const base = h - (grown ? 1.6 : 1.05);
  const dry = (c: number) => (W.dead ? mixHex(c, 0x6a5e50, 0.3) : c);
  K.mark();
  // The swollen foot: an octagon of two turned blocks, and a narrower step over it.
  const foot = grown ? 1 : 0.85;
  K.block(0, 0.08, 0, 0.86 * foot, 0.66, 0.86 * foot, turn, dry(SUGAR_TRUNK_LOW), 'mapBark', 0.95);
  K.block(0, 0.06, 0, 0.8 * foot, 0.62, 0.8 * foot, turn + Math.PI / 4, dry(SUGAR_TRUNK_LOW), 'mapBark', 0.9);
  K.block(0, 0.56, 0, 0.7 * foot, 0.44, 0.7 * foot, turn + 0.4, dry(SUGAR_TRUNK_LOW), 'mapBark', 0.97);
  K.block(0, 0.56, 0, 0.66 * foot, 0.44, 0.66 * foot, turn + 0.4 + Math.PI / 4, dry(SUGAR_TRUNK_LOW), 'mapBark', 0.93);
  // The trunk: straight, tapering, in lengths a little turned from each other (it reads round), each an
  // octagon; its fine rings in the lengths' shades.
  const t0 = 0.75;
  const t1 = base - 0.05;
  const n = Math.max(1, Math.round((t1 - t0) / 0.85));
  for (let i = 0; i < n; i++) {
    const a = t0 + ((t1 - t0) * i) / n;
    const b = t0 + ((t1 - t0) * (i + 1)) / n;
    const f = (i + 0.5) / n;
    const wd = 0.6 + (0.45 - 0.6) * f;
    const yaw = turn + (K.r(40 + i) - 0.5) * 0.5;
    const tone = dry(pick(SUGAR_TRUNK, K.r(50 + i)));
    const ring = i % 2 ? 0.94 : 1;
    K.block(0, (a + b) / 2, 0, wd, b - a + 0.04, wd, yaw, tone, 'mapBark', ring * (1 - 0.05 * f));
    K.block(0, (a + b) / 2, 0, wd * 0.97, b - a + 0.04, wd * 0.97, yaw + Math.PI / 4, tone, 'mapBark', ring * (0.95 - 0.05 * f));
  }
  // The old leaf bases (boots) from the crown's base up to the heart, and their split stubs spiralling up and out.
  const bootsH = h - 0.15 - (base - 0.1);
  const bw = grown ? 0.61 : 0.55;
  K.block(0, base - 0.1 + bootsH / 2, 0, bw, bootsH, bw, turn + 0.2, dry(pick(BOOTS, K.r(3))), 'mapBark', 0.9);
  K.block(0, base - 0.1 + bootsH / 2, 0, bw * 0.97, bootsH, bw * 0.97, turn + 0.2 + Math.PI / 4, dry(pick(BOOTS, K.r(4))), 'mapBark', 0.84);
  const stubs = grown ? 9 : 6;
  for (let i = 0; i < stubs; i++) {
    const az = turn + i * 2.39996;
    const u = (i + 0.5) / stubs;
    const yy = base + 0.05 + u * (bootsH - 0.35);
    const lean = 0.5 + K.r(60 + i) * 0.25;
    const dx = Math.sin(az) * Math.sin(lean);
    const dz = Math.cos(az) * Math.sin(lean);
    const dy = Math.cos(lean);
    const len = (0.5 + K.r(70 + i) * 0.2) * (grown ? 1 : 0.75);
    const x0 = Math.sin(az) * 0.2;
    const z0 = Math.cos(az) * 0.2;
    K.beam(x0, yy, z0, x0 + dx * len, yy + dy * len, z0 + dz * len, 0.2, 0.09, Math.cos(az), 0, -Math.sin(az), dry(pick(BOOTS, K.r(80 + i))), 'mapBark', 0.95 + K.r(90 + i) * 0.15);
  }
  // The heart: the bases of the young leaves, and the spear (the next leaf, folded) standing up.
  K.block(0, h - 0.1, 0, grown ? 0.62 : 0.5, 0.8, grown ? 0.62 : 0.5, turn, W.dead ? DEAD[1] : HEART, 'mapLeaf', 0.9);
  if (!W.dead) K.beam(0.05, h + 0.2, -0.04, 0.05 + 0.08, h + 0.2 + (grown ? 1.4 : 0.9) + K.r(5) * 0.3, -0.04 + 0.03, 0.12, 0.1, 1, 0, 0, W.tint(FAN_YOUNG[1], K.r(6)), 'mapLeaf', 1.05);

  // Grown and alive: bunches of fruit in its months, or the flower stalks.
  const fruiting = grown && !W.dead && (look.fruit > 0 || look.fallen > 0);
  if (grown && !W.dead) {
    if (fruiting) fruitBunches(K, look, base, turn);
    else flowers(K, base, turn);
  }

  // The crown: fans spiralling round the heart (the golden angle), the young ones pointing up, the old ones
  // out and drooping (even in the sine of their lift: even over the ball).
  K.mark();
  const N = grown ? 30 + Math.floor(K.r(8) * 4) : 17;
  const grow = grown ? Math.min(1.15, Math.max(0.9, 0.55 + h / 28)) : 0.95;
  for (let k = 0; k < N; k++) {
    const u = (k + 0.5) / N;
    const el = Math.asin(Math.max(-1, Math.min(1, 0.97 - 1.8 * u + (K.r(200 + k) - 0.5) * 0.12))) - W.sag * (0.4 + u);
    const az = turn + k * 2.39996 + (K.r(210 + k) - 0.5) * 0.3;
    const stalk = (1.0 + 0.45 * u + (K.r(220 + k) - 0.5) * 0.24) * grow;
    const blade = (0.78 + 0.18 * Math.sin(Math.PI * u) + (K.r(230 + k) - 0.5) * 0.12) * grow;
    const bend = (0.05 + 0.3 * u * u) * W.bend;
    // (tipped from lying flat, one way or the other: seen from the side as from above, most show their face)
    const roll = (K.r(240 + k) < 0.5 ? -1 : 1) * (0.35 + 0.85 * K.r(245 + k));
    const c = W.tint(pick(tones(u), K.r(250 + k)), K.r(255 + k));
    const ox = Math.sin(az) * Math.cos(el) * 0.14;
    const oz = Math.cos(az) * Math.cos(el) * 0.14;
    fan(K, ox, h - 0.05 + Math.sin(el) * 0.14, oz, az, el, roll, stalk, blade, bend, c, 0.92 + K.r(260 + k) * 0.16, { segs: 9, spread: 3.5 * W.fold, stalk: W.tint(pick(STALK, K.r(265 + k)), K.r(266 + k)), tip: W.dead ? 0.6 : 1 });
  }
  // The skirt: dead fans hanging under the crown.
  K.mark();
  const nd = grown ? 5 + Math.floor(K.r(9) * 3) : 3;
  const bunches = fruiting ? bunchAz(K, turn) : [];
  for (let k = 0; k < nd; k++) {
    const az = turn + 0.6 + k * 2.39996 + K.r(300 + k) * 0.5;
    // (none hangs right over a bunch of fruit: it shows)
    if (bunches.some((b) => Math.cos(az - b) > 0.9)) continue;
    const el = -1.28 - K.r(310 + k) * 0.22;
    const s = grown ? 1 : 0.75;
    fan(K, Math.sin(az) * 0.3, base + (0.55 + K.r(320 + k) * 0.35) * s, Math.cos(az) * 0.3, az, el, (K.r(330 + k) - 0.5) * 2, (0.7 + K.r(340 + k) * 0.3) * s, (0.55 + K.r(350 + k) * 0.12) * s, 0.05, pick(DEAD, K.r(360 + k)), 0.9 + K.r(370 + k) * 0.2, { segs: 7, spread: 2.6, stalk: pick(DEAD, K.r(380 + k)), tip: 0.6 });
  }
  // (ripe fruit fallen round the foot: drawn smooth by the view where `fallenAt` says, garden/_viewFruit.ts)
}

/** Bunches of round purple-black fruit hanging among the leaf bases on their stalks. */
function fruitBunches(K: PalmKit, look: PlantLook, base: number, turn: number): void {
  K.mark();
  const azs = bunchAz(K, turn);
  azs.forEach((az, c) => {
    // (the bunch whose fruit fell is spent: two left, still small)
    if (look.fruit === 0 && c === 2) return;
    const dx = Math.sin(az);
    const dz = Math.cos(az);
    const cx = dx * 0.78;
    const cy = base + 0.1 + K.r(140 + c) * 0.2;
    const cz = dz * 0.78;
    K.beam(dx * 0.25, base + 0.85, dz * 0.25, dx * 0.72, cy + 0.14, dz * 0.72, 0.06, 0.06, -dz, 0, dx, STALK[0], 'mapLeaf', 0.9);
    const n = look.fruit > 0 ? 8 : 4;
    for (let k = 0; k < n; k++) {
      const a = k * 2.1 + c;
      const rr = k === 0 ? 0 : 0.16 + (k % 2) * 0.04;
      const x = cx + Math.sin(a) * rr;
      const y = cy - (k === 0 ? 0 : 0.08 + (k % 3) * 0.09);
      const z = cz + Math.cos(a) * rr;
      K.block(x, y, z, 0.19, 0.19, 0.19, a, pick(PALM_FRUIT, K.r(150 + k + c * 7)), 'petal', 0.95 + K.r(160 + k) * 0.1);
      // (the cap of sepals on the side toward the stalk)
      if (k % 2 === 0) K.block(x - Math.sin(a) * 0.02, y + 0.1, z - Math.cos(a) * 0.02, 0.1, 0.03, 0.1, a, pick(FRUIT_CAP, K.r(170 + k)), 'petal', 1);
    }
  });
}

/** Where the fruit bunches hang round the crown's base (radians; the same for the skirt, which leaves them in view). */
function bunchAz(K: PalmKit, turn: number): number[] {
  return [0, 1, 2].map((c) => turn + 3.4 + c * 2.1 + K.r(130 + c) * 0.6);
}

/** The flower stalks at the crown's base, their catkins hanging (out of the fruit's months, or just picked). */
function flowers(K: PalmKit, base: number, turn: number): void {
  K.mark();
  const n = 2 + Math.floor(K.r(11) * 2);
  for (let i = 0; i < n; i++) {
    const az = turn + 1.3 + i * 2.4 + K.r(10 + i);
    const dx = Math.sin(az);
    const dz = Math.cos(az);
    const y0 = base + 0.95 + K.r(20 + i) * 0.2;
    const reach = 0.52 + K.r(30 + i) * 0.12;
    const ty = base + 0.3 + K.r(40 + i) * 0.08;
    K.beam(dx * 0.3, y0, dz * 0.3, dx * reach, ty, dz * reach, 0.08, 0.08, -dz, 0, dx, pick(FLOWER, K.r(100 + i)), 'petal', 1);
    for (let k = 0; k < 2; k++) {
      const sx = (k - 0.5) * 0.3;
      K.beam(dx * reach, ty, dz * reach, dx * reach + sx * dz * 0.36, ty - 0.34, dz * reach - sx * dx * 0.36, 0.06, 0.06, -dz, 0, dx, pick(FLOWER, K.r(120 + i * 2 + k)), 'petal', 0.92);
    }
  }
}
