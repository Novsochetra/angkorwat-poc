import type { VoxelBuilder } from '../../../voxel/VoxelBuilder';
import { registerModel } from '../look';
import type { PlantLook } from '../state';
import { DEAD_LEAF, DEAD_STEM, marker, mix, mound, pt, rng, seg, step, thirsty, tone, type P, type Packet, type Rand } from './_crop';

/**
 * The eggplant ត្រប់ (garden/kinds.ts `KINDS.eggplant`; the contract garden/look.ts): a bush about 0.9 m high
 * with soft, broad, grey-green leaves, its stems and veins tinged purple, purple star flowers with yellow hearts.
 * Its fruit, as Cambodian gardens grow it: on most plants the small round green-and-white striped eggplant
 * (ត្រប់ស្រួយ, eaten raw with prahok or in samlor), on some (by `look.seed`) the long purple one (ត្រប់វែង,
 * grilled). Green fruit (`fruit` 1) is small; ripe (2) full size and glossy.
 *
 * Stages: 0 the sown seed's mound and the marker stick with the empty packet; 1 the seed leaves and the
 * first true leaves; 2 a small leafy plant; 3 branching, the first flowers; 4 the grown bush.
 */

/** Grey-green, a little dull (the leaves are downy). */
const LEAF = [0x62844e, 0x6a8e5a, 0x5c7c4a, 0x72925e] as const;
/** Young leaves at the tips, brighter. */
const LEAF_YOUNG = 0x7a9a5c;
/** Stems: green tinged purple (the long purple kind, more purple). */
const STEM = 0x5a6248;
const STEM_PURPLE = 0x5a4458;
const FLOWER = [0x9a74c4, 0xa47ec8, 0x8e6ab8] as const;
const HEART = 0xf2d036;
const CALYX = 0x4e6e3c;
/** The round striped kind: white-green with dark green stripes. */
const ROUND_PALE = 0xeef6d4;
const ROUND_STRIPE = 0x4f8a3a;
const ROUND_YOUNG = 0x7aa858;
/** The long purple kind: deep, glossy. */
const LONG = 0x52205a;
const LONG_SHINE = 0xa476b4;
const LONG_YOUNG = 0x6a3a72;

const PACKET: Packet = { paper: 0xf0ead6, band: 0x6a3a7a, art: 0x5a2a68 };

const TAU = Math.PI * 2;
const GOLDEN = 2.39996;

interface Ctx {
  b: VoxelBuilder;
  look: PlantLook;
  r: Rand;
  long: boolean;
  dead: boolean;
  droop: 0 | 1 | 2;
}

/**
 * A leaf from `p` out toward `yaw`, drooping with thirst: one soft blade (the many small leaves of the bush), or
 * with `two` a broad blade and its narrower tip (the big low leaves, a young plant's).
 */
function leaf(c: Ctx, p: P, yaw: number, tilt: number, len: number, wide: number, i: number, young = false, two = false): void {
  const { b, r, droop, dead } = c;
  const q = pt(p.x, p.y, p.z);
  const sag = dead ? 0.9 : droop * 0.42;
  const curl = dead ? 0.55 : droop === 2 ? 0.75 : 1;
  const base = dead ? tone(DEAD_LEAF, r(i, 3)) : thirsty(young ? LEAF_YOUNG : tone(LEAF, r(i, 4)), droop, r(i, 5));
  const mat = dead ? 'mapBark' : 'mapLeaf';
  if (!two) {
    seg(b, q, len * curl, wide * curl, 0.032, yaw, tilt + sag + 0.1, base, mat, (r(i, 6) - 0.5) * 1.1);
    return;
  }
  seg(b, q, len * 0.58 * curl, wide * curl, 0.04, yaw, tilt + sag, base, mat, (r(i, 6) - 0.5) * 1.1);
  seg(b, q, len * 0.42 * curl, wide * 0.64 * curl, 0.034, yaw, tilt + sag + 0.3 + droop * 0.25, dead ? base : mix(base, 0x4e6e3e, 0.2), mat, (r(i, 7) - 0.5) * 1.1);
}

/** A purple star flower nodding out and down from `p`, its yellow heart. */
function flower(c: Ctx, p: P, yaw: number): void {
  const q = pt(p.x, p.y, p.z);
  seg(c.b, q, 0.04, 0.014, 0.014, yaw, 1.9, STEM, 'mapLeaf');
  seg(c.b, q, 0.022, 0.07, 0.07, yaw, 2.1, tone(FLOWER, c.r(p.x * 100, 9)), 'petal', 0.78);
  seg(c.b, q, 0.014, 0.028, 0.028, yaw, 2.1, HEART, 'petal');
}

/** A fruit hanging from `p` on its short stalk under the green star of its calyx (`fruit` 1 small green, 2 ripe). */
function fruit(c: Ctx, p: P, yaw: number, ripe: boolean, i: number): void {
  const { b, r } = c;
  const q = pt(p.x, p.y, p.z);
  seg(b, q, 0.03, 0.018, 0.018, yaw, 2.8, CALYX, 'mapLeaf');
  if (c.long) {
    // ត្រប់វែង: a long finger, a little curved, hanging.
    const len = ripe ? 0.25 + r(i, 20) * 0.04 : 0.11;
    const t = ripe ? 0.092 : 0.046;
    seg(b, q, 0.045, t * 1.3, t * 1.3, yaw, 2.6, CALYX, 'mapLeaf', 0.78);
    const lean = 2.3 + (r(i, 21) - 0.5) * 0.3;
    const top = pt(q.x, q.y, q.z);
    seg(b, q, len * 0.55, t, t, yaw, lean, ripe ? LONG : LONG_YOUNG, 'petal');
    seg(b, q, len * 0.45, t * 0.9, t * 0.9, yaw, lean + 0.35, ripe ? mix(LONG, 0x3a1640, 0.4) : LONG_YOUNG, 'petal');
    // its shine (the skin is glossy)
    if (ripe) seg(b, step(top, t * 0.32, yaw + Math.PI / 2, Math.PI / 2), len * 0.32, t * 0.4, t * 0.5, yaw, lean, LONG_SHINE, 'petal');
    return;
  }
  // ត្រប់ស្រួយ: small and round, white-green striped with dark green.
  const s = ripe ? 0.145 + r(i, 22) * 0.015 : 0.07;
  const cx = q.x;
  const cz = q.z;
  const cy = q.y - s * 0.42;
  const ry = r(i, 23) * TAU;
  b.box(cx, q.y + 0.006, cz, s * 0.72, 0.02, s * 0.72, CALYX, 'mapLeaf', { ry: ry + 0.4 });
  if (!ripe) {
    b.box(cx, cy, cz, s, s * 0.92, s, ROUND_YOUNG, 'petal', { ry });
    return;
  }
  b.box(cx, cy, cz, s, s * 0.9, s * 0.74, ROUND_PALE, 'petal', { ry });
  b.box(cx, cy - 0.003, cz, s * 0.74, s * 0.86, s, ROUND_STRIPE, 'petal', { ry });
  b.box(cx, cy - 0.004, cz, s * 0.9, s * 0.8, s * 0.9, mix(ROUND_PALE, ROUND_STRIPE, 0.35), 'petal', { ry: ry + Math.PI / 4 });
}

/** The seed in the earth (stage 0) and the marker that stays till the plant is up. */
function sown(c: Ctx, sprout: boolean): void {
  const { b, look, r } = c;
  mound(b, 0, 0, 0.17, r(1, 1));
  marker(b, 0.2, -0.14, 0.4 + r(1, 2) * 0.5, PACKET, r(1, 3), look.dead && !sprout);
}

registerModel('eggplant', (b, look) => {
  const r = rng(look, 31);
  const c: Ctx = { b, look, r, long: r(0, 1) < 0.3, dead: look.dead, droop: look.droop };
  const { stage, dead, droop } = look;
  if (stage === 0) {
    sown(c, false);
    return;
  }
  const stemC = dead ? tone(DEAD_STEM, r(0, 2)) : thirsty(c.long ? STEM_PURPLE : STEM, droop);
  const stemMat = dead ? 'mapBark' : 'mapLeaf';
  const turn = r(0, 3) * TAU;
  const lean = (r(0, 4) - 0.5) * 0.14 + (dead ? 0.25 : droop * 0.08);

  if (stage === 1) {
    // The sprout: a pale stem, two oblong seed leaves, the first two true leaves above them.
    sown(c, true);
    const p = pt(0, 0.02, 0);
    seg(b, p, 0.1, 0.018, 0.018, turn, lean, stemC, stemMat);
    const h = pt(p.x, p.y - 0.035, p.z);
    for (const s of [0, Math.PI]) leaf(c, h, turn + s + Math.PI / 2, 1.35, 0.075, 0.034, 40 + s, true);
    for (const s of [0, Math.PI]) leaf(c, p, turn + s, 1.0, 0.1, 0.07, 42 + s, true, true);
    return;
  }

  const H = [0, 0.12, 0.32, 0.6, 0.76][stage] * (0.92 + r(0, 5) * 0.16);
  const big = stage === 2 ? 0.66 : stage === 3 ? 0.88 : 1;
  const L = 0.23 * big;
  const W = 0.17 * big;
  let li = 0;

  if (stage === 2) {
    // A young plant: one stem, leaves round it in a spiral, the lowest biggest.
    const p = pt(0, 0, 0);
    seg(b, p, H, 0.03, 0.03, turn, lean, stemC, stemMat);
    const n = dead ? 3 : 7;
    for (let k = 0; k < n; k++) {
      const t = 0.2 + (0.8 * k) / n;
      const at = pt(Math.sin(turn) * Math.sin(lean) * H * t, H * t, Math.cos(turn) * Math.sin(lean) * H * t);
      const s = 1.15 - 0.45 * (k / n);
      leaf(c, at, turn + k * GOLDEN, 1.15 - k * 0.07, L * s * 1.2, W * s * 1.15, li++, k === n - 1, true);
    }
    return;
  }

  // Stages 3 and 4: a short main stem forks into three or four branches, each bending up and out, many small
  // leaves along them (a fine, rounded bush), flowers and fruit at their joints.
  const fork = H * 0.34;
  const main = pt(0, 0, 0);
  seg(b, main, fork, 0.05, 0.05, turn, lean * 0.5, stemC, stemMat);
  const nb = stage === 3 ? 3 : 4;
  const tips: { p: P; yaw: number }[] = [];
  const joints: { p: P; yaw: number }[] = [];
  for (let i = 0; i < nb; i++) {
    const yaw = turn + (i * TAU) / nb + (r(i, 10) - 0.5) * 0.6;
    const p = pt(main.x, main.y, main.z);
    const reach = (H - fork) * (0.95 + r(i, 11) * 0.25);
    const out = (dead ? 0.85 : 0.72) + droop * 0.18 + r(i, 12) * 0.18;
    seg(b, p, reach * 0.55, 0.036, 0.036, yaw, out, stemC, stemMat);
    joints.push({ p: pt(p.x, p.y, p.z), yaw });
    seg(b, p, reach * 0.55, 0.026, 0.026, yaw + (r(i, 13) - 0.5) * 0.5, out * 0.55, stemC, stemMat);
    tips.push({ p: pt(p.x, p.y, p.z), yaw });
  }
  /** A point along branch `i` (0 the fork, 0.5 its joint, 1 its tip). */
  const along = (i: number, t: number): P => {
    const [a, z, u] = t <= 0.5 ? [main, joints[i].p, t * 2] : [joints[i].p, tips[i].p, t * 2 - 1];
    return pt(a.x + (z.x - a.x) * u, a.y + (z.y - a.y) * u, a.z + (z.z - a.z) * u);
  };
  if (dead) {
    // Dry: a few brown leaves hang from the grey-brown sticks.
    for (let i = 0; i < nb; i++) if (i % 2 === 0) leaf(c, tips[i].p, tips[i].yaw, 1.6, L * 1.1, W, li++, false, true);
    leaf(c, joints[1].p, joints[1].yaw + 1.2, 1.8, L, W * 0.9, li++, false, true);
    leaf(c, along(2 % nb, 0.3), joints[2 % nb].yaw - 1, 1.9, L * 0.9, W * 0.8, li++);
    return;
  }
  // Leaves: the big old ones low round the fork, then pairs all along each branch, a little cluster at its tip,
  // a few over the middle; they get smaller toward the tips.
  for (let k = 0; k < 6; k++) leaf(c, pt(main.x, main.y - 0.02 - (k % 3) * 0.035, main.z), turn + 0.6 + k * GOLDEN, 1.32 + (k % 2) * 0.08, L * 1.35, W * 1.3, li++, false, true);
  const per = stage === 3 ? 6 : 9;
  for (let i = 0; i < nb; i++) {
    const { yaw } = tips[i];
    // alternate leaves (one at each node, turning round the branch), each its own lean and size
    for (let k = 0; k < per; k++) {
      const t = 0.12 + (0.82 * k) / (per - 1);
      const s = (1.12 - 0.35 * t) * (0.85 + r(i * 11 + k, 18) * 0.3);
      const side = k % 2 ? 1 : -1;
      leaf(c, along(i, t), yaw + side * (0.6 + r(i * 11 + k, 14) * 1.1), 0.95 + r(i * 11 + k, 15) * 0.5, L * s, W * s, li++);
    }
    leaf(c, tips[i].p, yaw - 0.4, 1.0, L * 0.72, W * 0.72, li++);
    leaf(c, tips[i].p, yaw + 0.5, 0.8, L * 0.6, W * 0.6, li++, true);
    leaf(c, tips[i].p, yaw + 2.6, 0.55, L * 0.5, W * 0.5, li++, true);
  }
  if (stage === 4) for (let k = 0; k < 4; k++) leaf(c, pt(main.x, H * 0.82, main.z), turn + k * 1.57 + 0.3, 0.95, L * 0.8, W * 0.8, li++, k === 0);
  // Flowers: in bloom while it bears no fruit, fewer as the fruit swells.
  const fl = stage === 3 ? 2 : look.fruit === 0 ? 4 : look.fruit === 1 ? 2 : 1;
  for (let i = 0; i < fl; i++) {
    const j = joints[(i + 1) % nb];
    flower(c, step(pt(j.p.x, j.p.y - 0.03, j.p.z), 0.12, j.yaw + (i % 2 ? 0.7 : -0.7), 1.5), j.yaw + (i % 2 ? 0.7 : -0.7));
  }
  if (stage < 4 || look.fruit === 0) return;
  // Fruit: each on its own stalk bowing out from a joint or halfway along a branch, so it hangs at the bush's edge
  // under the leaves, where he sees (from across the garden) and picks it.
  const ripe = look.fruit === 2;
  const nf = ripe ? (c.long ? 5 : 7) : 4;
  for (let i = 0; i < nf; i++) {
    const bi = i % nb;
    const yaw = joints[bi].yaw + (i < nb ? (r(i, 30) - 0.5) * 0.5 : 0.8);
    const at = i < nb ? pt(joints[bi].p.x, joints[bi].p.y - 0.02, joints[bi].p.z) : along(bi, c.long ? 0.62 : 0.35);
    seg(b, at, c.long ? 0.17 : ripe ? 0.2 : 0.15, 0.022, 0.022, yaw, (c.long ? 1.3 : 1.65) + r(i, 31) * 0.25, stemC, 'mapLeaf');
    fruit(c, at, yaw, ripe, i);
  }
});
