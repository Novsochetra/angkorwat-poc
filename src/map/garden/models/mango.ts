import { traceSource } from '../../../feedback/sourceTrace';
import type { VoxelBuilder } from '../../../voxel/VoxelBuilder';
import { registerModel } from '../look';
import type { PlantLook } from '../state';
import { Crown, vnoise, type CellInfo } from './_treeCrown';
import { blade, deadTree, limb, mix, planting, rng, rosette, thirstyLeaf, tone, turned, type Rand } from './_treeKit';

/**
 * The mango ស្វាយ (garden/kinds.ts `KINDS.mango`; the contract garden/look.ts): a
 * grafted seedling from the nursery grows into a 7 m tree with a stout dark trunk
 * that divides low, and a dense dome of dark glossy leaves (crown radius 3.2 m),
 * new leaves coming in flushes of bronze-red at the tips. Mango leaves grow in
 * rosettes at the end of each shoot, so the young plants are tiers of rosettes,
 * their newest flush limp and copper. Fruit (March–May) hangs on long thin stalks
 * under the crown's rim, ones and twos: green, ripe yellow with an orange blush.
 */

/** The crown: dark glossy green, deep shade → the sun on top. */
const CROWN = [0x1b321f, 0x233f24, 0x2d4d28, 0x385b2c, 0x456b30, 0x587d36] as const;
/** New flush: wine-red to bronze (muted: bright orange would read as fruit). */
const FLUSH = [0x6e3428, 0x7e3e2e, 0x8a4a34, 0x6a3a30, 0x7a4636] as const;
/** Leaves of a young plant (single blades). */
const LEAF = [0x386626, 0x44722c, 0x3d6c2a, 0x4a7a32] as const;
/** Dark grey-brown bark, rough. */
const BARK = [0x4a4038, 0x544a40, 0x3e362e, 0x5a4e44] as const;
const STEM = [0x5a6a34, 0x4e5a30] as const;
const GREEN_FRUIT = [0x7e9e3a, 0x8aa842, 0x76963a] as const;
const RIPE_FRUIT = [0xf2c23a, 0xeab434, 0xf0c848] as const;
const BLUSH = [0xe0702e, 0xd8602c, 0xe8843a] as const;
const STALK = 0x5a5a2a;

registerModel('mango', (b, look) => {
  const r = rng(look, 11);
  if (look.dead) {
    const h = [0.48, 0.85, 1.6, 3.4, 3.6][look.stage];
    if (look.stage <= 1) planting(b, r, { stage: look.stage, stake: look.stage === 0 ? 0.55 : 0.8, stem: 0.03 });
    deadTree(b, r, { stage: look.stage, h, w: [0.032, 0.036, 0.05, 0.2, 0.22][look.stage], leafLen: 0.24, leafWid: 0.08, fork: 1.0 });
    return;
  }
  if (look.stage === 0) seedling(b, r, look);
  else if (look.stage === 1) small(b, r, look);
  else if (look.stage === 2) sapling(b, r, look);
  else if (look.stage === 3) young(b, r, look);
  else grown(b, r, look);
});

/** A shoot's rosette: grown leaves spreading, or (`flush`) the new ones, limp and bronze. */
function shootTip(b: VoxelBuilder, r: Rand, x: number, y: number, z: number, look: PlantLook, n: number, flush: boolean, len = 0.25): void {
  if (flush && look.droop === 0) rosette(b, r, x, y, z, { n: Math.max(3, n - 2), len: len * 0.85, wid: 0.07, pitch: -1.05, colors: FLUSH, droop: 0 });
  else rosette(b, r, x, y, z, { n, len, wid: 0.08, pitch: 0.3, colors: LEAF, droop: look.droop, bend: 0.7 });
}

/** Stage 0: the grafted seedling just set out of its bag: a thin stem, the graft's knee, one rosette. */
function seedling(b: VoxelBuilder, r: Rand, look: PlantLook): void {
  planting(b, r, { stage: 0, stake: 0.55, stem: 0.024 });
  limb(b, 0, 0, 0, 0.01, 0.13, 0, 0.034, 0.03, BARK, r);
  b.box(0.012, 0.14, 0.004, 0.044, 0.04, 0.04, 0x5a4a38, 'mapBark');
  limb(b, 0.012, 0.15, 0, -0.01, 0.46, 0.01, 0.022, 0.016, STEM, r);
  shootTip(b, r, -0.01, 0.46, 0.01, look, 5, false, 0.22);
  // an older leaf low on the stem
  blade(b, 0.004, 0.28, 0.005, r() * 6.28, 0.15 - look.droop * 0.5, 0.2, 0.055, thirstyLeaf(LEAF[1], look.droop, 0.4));
}

/** Stage 1: a second flush on top of the first (two tiers of rosettes), still staked. */
function small(b: VoxelBuilder, r: Rand, look: PlantLook): void {
  planting(b, r, { stage: 1, stake: 0.8, stem: 0.03 });
  limb(b, 0, 0, 0, 0.01, 0.16, 0, 0.042, 0.036, BARK, r);
  b.box(0.012, 0.17, 0.004, 0.05, 0.045, 0.046, 0x5a4a38, 'mapBark');
  limb(b, 0.012, 0.18, 0, 0, 0.55, 0.01, 0.032, 0.026, BARK, r);
  shootTip(b, r, 0, 0.55, 0.01, look, 6, false);
  // a side shoot at the first tier
  const a = r() * 6.28;
  const sx = Math.cos(a) * 0.14;
  const sz = Math.sin(a) * 0.14;
  limb(b, 0, 0.52, 0.01, sx, 0.66, sz, 0.018, 0.014, STEM, r);
  shootTip(b, r, sx, 0.66, sz, look, 5, false, 0.22);
  limb(b, 0, 0.55, 0.01, -0.01, 0.88, 0, 0.022, 0.016, STEM, r);
  shootTip(b, r, -0.01, 0.88, 0, look, 6, r() < 0.6);
}

/**
 * Stage 2: a sapling of about 1.8 m: a woody stem, two whorls of three shoots (a mango branches where each
 * flush ended), every shoot ending in its rosette, the leader's newest flush bronze and limp.
 */
function sapling(b: VoxelBuilder, r: Rand, look: PlantLook): void {
  // (the stake stays a while yet; the root ball is gone into the bed)
  turned(b, 0.07, 0.6, -0.04, 0.026, 1.2, 0.026, 0, 0, 0, 0xc4ac6a, 'mapBark');
  b.box(0.035, 0.95, -0.02, 0.1, 0.026, 0.08, 0x9a8456, 'mapBark');
  const lean = (r() - 0.5) * 0.08;
  limb(b, 0, 0, 0, lean, 0.85, 0, 0.06, 0.045, BARK, r, 2);
  limb(b, lean, 0.85, 0, lean * 1.5, 1.42, 0.02, 0.042, 0.03, BARK, r);
  limb(b, lean * 1.5, 1.42, 0.02, lean * 1.6, 1.74, 0.02, 0.026, 0.018, STEM, r);
  for (const [y0, len, n] of [
    [0.85, 0.42, 3],
    [1.42, 0.32, 3],
  ] as const) {
    const a0 = r() * 6.28;
    for (let q = 0; q < n; q++) {
      const a = a0 + (q / n) * 6.28 + (r() - 0.5) * 0.5;
      const k = y0 / 0.85;
      const bx = lean * Math.min(1.5, k);
      const ex = bx + Math.cos(a) * len;
      const ez = Math.sin(a) * len;
      const ey = y0 + len * (0.55 + r() * 0.2) - look.droop * 0.05;
      limb(b, bx, y0, 0, ex, ey, ez, 0.03, 0.018, y0 < 1 ? BARK : STEM, r);
      shootTip(b, r, ex, ey, ez, look, 6, y0 > 1 && r() < 0.35, 0.26);
    }
  }
  shootTip(b, r, lean * 1.6, 1.74, 0.02, look, 6, true, 0.27);
  // a few old leaves low on the stem
  for (let q = 0; q < 3; q++) blade(b, lean * 0.4, 0.4 + q * 0.13, 0, r() * 6.28, 0.1 - look.droop * 0.5, 0.22, 0.06, thirstyLeaf(tone(LEAF, r()), look.droop, r()));
}

/**
 * The crown's colours: the ramp; a new flush (bronze-red, wine) on the tufts at the tips in patches on the sunny
 * upper crown; paler and yellow-brown when thirsty (the flush browns first).
 */
function crownPaint(look: PlantLook, seed: number, share = 0.3) {
  return (c: CellInfo): number | null => {
    if (c.tuft && !c.under && c.t > 0.3) {
      const n = vnoise(c.x * 0.45, c.y * 0.45, c.z * 0.45, seed + 5);
      if (n > 1 - share) {
        if (look.droop === 2) return mix(FLUSH[3], 0x7a5a3a, 0.6);
        const f = FLUSH[Math.floor(vnoise(c.x * 3.1, c.y * 3.1, c.z * 3.1, seed + 9) * FLUSH.length) % FLUSH.length];
        return look.droop === 1 ? mix(f, 0x9a8a5a, 0.35) : f;
      }
    }
    if (look.droop) return thirstyLeaf(c.color, look.droop, vnoise(c.x * 3, c.y * 3, c.z * 3, seed + 3));
    return null;
  };
}

/** Stage 3: a young tree of about 3.6 m: the trunk parts at a metre into three limbs, a thin dome on them. */
function young(b: VoxelBuilder, r: Rand, look: PlantLook): void {
  const seed = Math.round(look.seed * 997);
  const fork = 0.95 + r() * 0.15;
  limb(b, 0, 0, 0, 0.02, fork, 0, 0.2, 0.16, BARK, r, 2);
  const crown = new Crown(0.4, 2.1, 1.1, 4.0, seed);
  const cy = 2.55 - look.droop * 0.08;
  const a0 = r() * 6.28;
  for (let q = 0; q < 3; q++) {
    const a = a0 + (q / 3) * 6.28 + (r() - 0.5) * 0.5;
    const ex = Math.cos(a) * 0.75;
    const ez = Math.sin(a) * 0.75;
    limb(b, 0.02, fork - 0.05, 0, ex, 2.0, ez, 0.12, 0.07, BARK, r, 2);
    limb(b, ex, 2.0, ez, ex * 1.5, 2.55, ez * 1.5, 0.07, 0.045, BARK, r);
    crown.blob(Math.cos(a) * 0.95, cy - 0.05 + r() * 0.2, Math.sin(a) * 0.95, 0.9, 0.72, 0.9, 0.5);
  }
  crown.blob(0, cy + 0.1, 0, 1.5, 0.95, 1.5, 0.55);
  crown.blob((r() - 0.5) * 0.4, cy + 0.85, (r() - 0.5) * 0.4, 0.85, 0.6, 0.85, 0.58);
  crown.carve(0, cy - 1.05, 0, 0.95, 0.55, 0.95);
  crown.thin(0.16 + look.droop * 0.1, seed);
  crown.emit(b, { ramp: CROWN, seed, tufts: 0.32, tuft: 0.6, paint: crownPaint(look, seed, 0.42) });
}

/**
 * Stage 4: the grown tree: a stout, dark, rough trunk dividing low into three or four thick limbs that hold up a
 * dense dome (7 m, radius 3.2), its underside a bowl he stands in by the trunk; fruit under the rim in season.
 */
function grown(b: VoxelBuilder, r: Rand, look: PlantLook): void {
  const seed = Math.round(look.seed * 997);
  const src = traceSource();
  // Trunk and its root flare.
  b.box(0, 0.5, 0, 0.62, 1.04, 0.62, BARK[0], 'mapBark', { shade: 0.95, src });
  b.box(0.03, 1.32, -0.02, 0.54, 0.7, 0.54, BARK[1], 'mapBark', { shade: 0.98, src });
  b.box(-0.08, 0.9, 0.12, 0.2, 0.5, 0.42, BARK[2], 'mapBark', { shade: 0.9, src });
  for (let q = 0; q < 4; q++) {
    if (r() < 0.2) continue;
    const a = (q / 4) * 6.28 + r() * 0.5;
    const h = 0.22 + r() * 0.2;
    turned(b, Math.cos(a) * 0.36, h / 2 - 0.02, Math.sin(a) * 0.36, 0.26, h, 0.34, a + 1.57, 0, 0, tone(BARK, r()), 'mapBark', 0.92, src);
  }
  // Limbs: three or four from the fork, each splitting toward the crown's lumps.
  const crown = new Crown(0.5, 3.8, 1.5, 7.3, seed);
  const fork = 1.5 + r() * 0.15;
  const L = 3 + (r() < 0.5 ? 1 : 0);
  const a0 = r() * 6.28;
  for (let q = 0; q < L; q++) {
    const a = a0 + (q / L) * 6.28 + (r() - 0.5) * 0.5;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const d = 1.3 + r() * 0.4;
    const ey = 2.85 + r() * 0.35;
    limb(b, ca * 0.12, fork - 0.1, sa * 0.12, ca * d, ey, sa * d, 0.36, 0.22, BARK, r, 2);
    for (const s of [-1, 1]) {
      const b2 = a + s * (0.35 + r() * 0.25);
      const d2 = d + 0.75 + r() * 0.4;
      limb(b, ca * d, ey, sa * d, Math.cos(b2) * d2, ey + 0.6 + r() * 0.3, Math.sin(b2) * d2, 0.17, 0.1, BARK, r);
    }
    limb(b, ca * d, ey, sa * d, ca * d * 0.7, ey + 1.3, sa * d * 0.7, 0.16, 0.1, BARK, r);
    // A lump of leaves over each limb, low at the rim.
    crown.blob(ca * 2.15, 3.55 + r() * 0.4, sa * 2.15, 1.5 + r() * 0.2, 1.25 + r() * 0.15, 1.5 + r() * 0.2, 0.62);
  }
  // The dome itself (wider than tall), lumps between the limbs', a cap on top.
  crown.blob(0, 4.3, 0, 3.05, 2.55, 3.05, 0.58);
  for (let q = 0; q < L; q++) {
    const a = a0 + ((q + 0.5) / L) * 6.28 + (r() - 0.5) * 0.4;
    crown.blob(Math.cos(a) * 2.2, 4.4 + r() * 0.5, Math.sin(a) * 2.2, 1.35, 1.2, 1.35, 0.62);
  }
  crown.blob((r() - 0.5) * 0.8, 5.9, (r() - 0.5) * 0.8, 1.7, 0.95, 1.7, 0.58);
  // The bowl under it: headroom by the trunk, the rim sweeping low.
  // (he is 2.4 m: room for him to stand by the trunk, the leaves at 2.7 m 1.6 m out, 2.3 m at the rim)
  crown.carve(0, 2.2, 0, 2.2, 0.75, 2.2, 0.25);
  crown.carve(0, 2.6, 0, 1.3, 0.9, 1.3);
  crown.emit(b, { ramp: CROWN, seed, tufts: 0.55, paint: crownPaint(look, seed) });
  if (look.fruit) fruit(b, r, crown, look.fruit === 2, src);
}

/** Mangoes under the rim: long thin stalks, one to three fruit on each. */
function fruit(b: VoxelBuilder, r: Rand, crown: Crown, ripe: boolean, src: ReturnType<typeof traceSource>): void {
  const stalks = 12;
  const a0 = r() * 6.28;
  for (let q = 0; q < stalks; q++) {
    const a = a0 + (q / stalks) * 6.28 + (r() - 0.5) * 0.5;
    const d = 2.05 + r() * 0.75;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const top = crown.bottomAt(x, z);
    if (!Number.isFinite(top)) continue;
    const len = 0.32 + r() * 0.3;
    b.box(x, top - len / 2 + 0.05, z, 0.022, len + 0.1, 0.022, STALK, 'mapLeaf', { src });
    const n = 1 + (r() < 0.55 ? 1 : 0) + (r() < 0.2 ? 1 : 0);
    for (let f = 0; f < n; f++) {
      const fa = a + (f - (n - 1) / 2) * 1.6;
      const off = n > 1 ? 0.075 : 0;
      const fx = x + Math.cos(fa) * off;
      const fz = z + Math.sin(fa) * off;
      const fy = top - len - 0.085 - f * 0.06;
      if (n > 1) b.box((x + fx) / 2, fy + 0.1, (z + fz) / 2, 0.06, 0.016, 0.016, STALK, 'mapLeaf', { src, ry: -fa });
      // (a mango hangs a little crooked: its beak to one side; its cheek, +z, looks out)
      const tilt = (r() - 0.5) * 0.5;
      const yaw = Math.PI / 2 - a;
      const body = ripe ? (r() < 0.25 ? mix(tone(RIPE_FRUIT, r()), GREEN_FRUIT[1], 0.3) : tone(RIPE_FRUIT, r())) : tone(GREEN_FRUIT, r());
      turned(b, fx, fy, fz, 0.13, 0.19, 0.11, yaw, 0, tilt, body, 'petal', 1, src);
      if (ripe && r() < 0.8) {
        // The blush on the sun side (outward), over the shoulder.
        turned(b, fx + Math.cos(a) * 0.025, fy + 0.035, fz + Math.sin(a) * 0.025, 0.1, 0.1, 0.07, yaw, 0, tilt, tone(BLUSH, r()), 'petal', 1, src);
      }
    }
  }
}
