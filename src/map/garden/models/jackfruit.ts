import { traceSource, type SourceTrace } from '../../../feedback/sourceTrace';
import type { VoxelBuilder } from '../../../voxel/VoxelBuilder';
import { registerModel } from '../look';
import type { PlantLook } from '../state';
import { Crown, vnoise, type CellInfo } from './_treeCrown';
import { deadTree, leavesAlong, limb, mix, planting, rng, thirstyLeaf, tone, turned, type Rand } from './_treeKit';

/**
 * The jackfruit ខ្នុរ (garden/kinds.ts `KINDS.jackfruit`; the contract
 * garden/look.ts): a seedling with big glossy leaves one by one up its stem grows
 * into an 8 m tree with a straight grey-brown trunk, thick low branches and a
 * dense crown of dark, glossy, leathery leaves. The fruit, the biggest of any
 * tree, hang straight from the trunk and the thick low branches on short stalks,
 * knobbly all over: green, ripe yellow-green going brown. He picks them by hand,
 * so some hang at 1–2.5 m on the trunk.
 */

/** The crown: deep, a little bluer than the mango's, glossy where the sun is. */
const CROWN = [0x152c1d, 0x1d3822, 0x264628, 0x30542c, 0x3c6230, 0x4f7438] as const;
/** A young plant's leaves (single blades), and the paler new ones at the tip. */
const LEAF = [0x2c5824, 0x346228, 0x2a5022, 0x3a6a2c] as const;
const NEW_LEAF = [0x5a8a34, 0x6a9a3a] as const;
/** Grey-brown, smoother than the mango's. */
const BARK = [0x6a5e50, 0x5e5446, 0x746656, 0x625848] as const;
const STEM = [0x6a7a40, 0x5e6e3a] as const;
const GREEN = { body: [0x7a9a36, 0x86a63c, 0x72923a] as const, knob: 0x5e7a28 };
const RIPE = { body: [0xa8a04a, 0x9e9644, 0xb0a650] as const, knob: 0x7e7432 };
const BROWN = 0x8a6e3a;
const STALK = 0x5a5a30;

registerModel('jackfruit', (b, look) => {
  const r = rng(look, 23);
  if (look.dead) {
    const h = [0.45, 0.95, 1.9, 3.8, 4][look.stage];
    if (look.stage <= 1) planting(b, r, { stage: look.stage, stake: look.stage === 0 ? 0.55 : 0.85, stem: 0.03 });
    deadTree(b, r, { stage: look.stage, h, w: [0.032, 0.036, 0.05, 0.2, 0.22][look.stage], leafLen: 0.24, leafWid: 0.11, fork: 1.5 });
    return;
  }
  if (look.stage === 0) seedling(b, r, look);
  else if (look.stage === 1) small(b, r, look);
  else if (look.stage === 2) sapling(b, r, look);
  else if (look.stage === 3) young(b, r, look);
  else grown(b, r, look);
});

const leaves = (look: PlantLook, n: number, len: number, wid: number, pitch: number, colors: readonly number[] = LEAF) => ({ n, len, wid, pitch, colors, droop: look.droop, bend: 0.45, tip: 0.55 });

/** The shoot's tip: two pale new leaves folded up round the bud's green sheath. */
function bud(b: VoxelBuilder, r: Rand, x: number, y: number, z: number, look: PlantLook): void {
  b.box(x, y + 0.035, z, 0.022, 0.07, 0.022, thirstyLeaf(0x8ab04a, look.droop, 0.5), 'mapLeaf');
  leavesAlong(b, r, [x, y - 0.02, z], [x, y + 0.01, z], { n: 2, len: 0.12, wid: 0.06, pitch: 0.9 - look.droop * 0.4, colors: NEW_LEAF, droop: look.droop, step: Math.PI, tip: 1 });
}

/** Stage 0: the seedling out of its bag: a green stem, four or five big glossy leaves turning up it. */
function seedling(b: VoxelBuilder, r: Rand, look: PlantLook): void {
  planting(b, r, { stage: 0, stake: 0.55, stem: 0.022 });
  limb(b, 0, 0, 0, 0.01, 0.42, 0, 0.024, 0.016, STEM, r, 2, 'mapBark');
  leavesAlong(b, r, [0, 0.16, 0], [0.01, 0.38, 0], leaves(look, 5, 0.23, 0.11, 0.25));
  bud(b, r, 0.01, 0.42, 0, look);
}

/** Stage 1: a metre of stem, woody at the foot, ten leaves up it, staked. */
function small(b: VoxelBuilder, r: Rand, look: PlantLook): void {
  planting(b, r, { stage: 1, stake: 0.85, stem: 0.03 });
  limb(b, 0, 0, 0, 0.01, 0.45, 0, 0.038, 0.03, BARK, r);
  limb(b, 0.01, 0.45, 0, 0, 0.92, 0.01, 0.03, 0.018, STEM, r, 2);
  leavesAlong(b, r, [0.01, 0.3, 0], [0, 0.88, 0.01], leaves(look, 10, 0.27, 0.13, 0.2));
  bud(b, r, 0, 0.92, 0.01, look);
}

/** Stage 2: a sapling of about 2 m: a straight stem, a few side shoots, big leaves along all of them. */
function sapling(b: VoxelBuilder, r: Rand, look: PlantLook): void {
  turned(b, 0.075, 0.6, -0.04, 0.026, 1.2, 0.026, 0, 0, 0, 0xc4ac6a, 'mapBark');
  b.box(0.04, 0.95, -0.02, 0.1, 0.026, 0.08, 0x9a8456, 'mapBark');
  limb(b, 0, 0, 0, 0.01, 1.1, 0, 0.065, 0.05, BARK, r, 2);
  limb(b, 0.01, 1.1, 0, 0, 1.92, 0.01, 0.05, 0.026, STEM, r, 2);
  leavesAlong(b, r, [0.01, 1.15, 0], [0, 1.86, 0.01], leaves(look, 8, 0.3, 0.14, 0.25));
  bud(b, r, 0, 1.92, 0.01, look);
  const a0 = r() * 6.28;
  for (let q = 0; q < 4; q++) {
    const a = a0 + q * 2.4;
    const y0 = 0.75 + q * 0.26;
    const len = 0.55 - q * 0.08;
    const ex = Math.cos(a) * len;
    const ez = Math.sin(a) * len;
    const ey = y0 + len * 0.55 - look.droop * 0.04;
    limb(b, 0.005, y0, 0, ex, ey, ez, 0.03, 0.016, STEM, r);
    leavesAlong(b, r, [ex * 0.3, y0 + (ey - y0) * 0.3, ez * 0.3], [ex, ey, ez], leaves(look, 5, 0.27, 0.13, 0.15));
  }
}

/** The crown's colours: the ramp, glossy tops a touch lighter and cooler; paler and yellow-brown when thirsty. */
function crownPaint(look: PlantLook, seed: number) {
  return (c: CellInfo): number | null => {
    if (look.droop) return thirstyLeaf(c.color, look.droop, vnoise(c.x * 3, c.y * 3, c.z * 3, seed + 3));
    if (c.top && c.tuft) return mix(c.color, 0x7a9a5a, 0.18);
    return null;
  };
}

/** Stage 3: a young tree of about 4 m: a straight trunk, branches turning up it, an upright oval crown. */
function young(b: VoxelBuilder, r: Rand, look: PlantLook): void {
  const seed = Math.round(look.seed * 997);
  limb(b, 0, 0, 0, 0.01, 1.6, 0, 0.2, 0.17, BARK, r, 2);
  limb(b, 0.01, 1.6, 0, 0, 3.6, 0.01, 0.17, 0.08, BARK, r, 2);
  const crown = new Crown(0.4, 2.0, 1.2, 4.6, seed);
  const a0 = r() * 6.28;
  for (let q = 0; q < 5; q++) {
    const a = a0 + q * 2.4;
    const y0 = 1.45 + q * 0.42;
    const len = 1.15 - q * 0.13;
    const ex = Math.cos(a) * len;
    const ez = Math.sin(a) * len;
    const ey = y0 + len * 0.7;
    limb(b, 0, y0, 0, ex, ey, ez, 0.09 - q * 0.008, 0.04, BARK, r);
    crown.blob(ex * 0.85, ey + 0.1, ez * 0.85, 0.7, 0.55, 0.7, 0.62);
  }
  crown.blob(0, 2.85 - look.droop * 0.08, 0, 1.3, 1.35, 1.3, 0.5);
  crown.blob(0, 4.0, 0, 0.75, 0.55, 0.75, 0.58);
  crown.carve(0, 1.3, 0, 1.1, 0.65, 1.1);
  crown.thin(0.15 + look.droop * 0.1, seed);
  crown.emit(b, { ramp: CROWN, seed, tufts: 0.34, tuft: 0.6, paint: crownPaint(look, seed) });
}

/**
 * Stage 4: the grown tree: a straight trunk (8 m), two or three thick branches low and nearly level, the crown
 * dense and dark above them; in season the big fruit on the trunk and those branches.
 */
function grown(b: VoxelBuilder, r: Rand, look: PlantLook): void {
  const seed = Math.round(look.seed * 997);
  const src = traceSource();
  // The trunk, tapering in straight steps; its root flare.
  const segs: [number, number, number][] = [
    [0, 1.4, 0.64],
    [1.4, 2.8, 0.58],
    [2.8, 4.2, 0.48],
    [4.2, 5.8, 0.38],
  ];
  let ox = 0;
  for (const [y0, y1, w] of segs) {
    b.box(ox, (y0 + y1) / 2, 0, w, y1 - y0 + 0.04, w, tone(BARK, r()), 'mapBark', { shade: 1.02 - y0 * 0.03, src });
    ox += (r() - 0.5) * 0.04;
  }
  for (let q = 0; q < 4; q++) {
    if (r() < 0.25) continue;
    const a = (q / 4) * 6.28 + r() * 0.5;
    const h = 0.25 + r() * 0.2;
    turned(b, Math.cos(a) * 0.38, h / 2 - 0.02, Math.sin(a) * 0.38, 0.26, h, 0.36, Math.PI / 2 - a, 0, 0, tone(BARK, r()), 'mapBark', 0.94, src);
  }
  // Thick low branches, nearly level, then turning up; higher ones inside the crown.
  const crown = new Crown(0.5, 3.8, 2.4, 8.3, seed);
  const low: [number, number, number, number][] = [];
  const a0 = r() * 6.28;
  const nLow = 2 + (r() < 0.5 ? 1 : 0);
  for (let q = 0; q < nLow; q++) {
    const a = a0 + (q / nLow) * 6.28 + (r() - 0.5) * 0.5;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const y0 = 2.4 + q * 0.32 + r() * 0.15;
    const len = 1.7 + r() * 0.3;
    const ey = y0 + 0.45;
    limb(b, ca * 0.2, y0, sa * 0.2, ca * len, ey, sa * len, 0.3, 0.2, BARK, r, 2);
    limb(b, ca * len, ey, sa * len, ca * (len + 0.6), ey + 1.0, sa * (len + 0.6), 0.2, 0.12, BARK, r);
    low.push([a, y0, len, ey]);
    crown.blob(ca * (len + 0.45), ey + 1.15, sa * (len + 0.45), 1.35, 1.0, 1.35, 0.62);
  }
  for (let q = 0; q < 3; q++) {
    const a = a0 + 1.0 + q * 2.1;
    const y0 = 3.6 + q * 0.6;
    limb(b, 0, y0, 0, Math.cos(a) * 1.5, y0 + 0.9, Math.sin(a) * 1.5, 0.2, 0.1, BARK, r);
  }
  // The crown: upright, dense, lumpy; the ceiling high over the trunk (he stands by it to pick).
  crown.blob(0, 5.55, 0, 2.9, 2.5, 2.9, 0.62);
  for (let q = 0; q < 3; q++) {
    const a = a0 + 0.6 + q * 2.1 + (r() - 0.5) * 0.5;
    crown.blob(Math.cos(a) * 2.0, 5.2 + r() * 0.7, Math.sin(a) * 2.0, 1.3, 1.25, 1.3, 0.62);
  }
  crown.blob((r() - 0.5) * 0.6, 7.3, (r() - 0.5) * 0.6, 1.5, 0.9, 1.5, 0.58);
  crown.carve(0, 3.1, 0, 2.0, 1.0, 2.0, 0.25);
  crown.emit(b, { ramp: CROWN, seed, tufts: 0.55, paint: crownPaint(look, seed) });
  if (look.fruit) fruit(b, r, low, look.fruit === 2, src);
}

/**
 * The fruit: on the trunk at 1‥2.6 m (he reaches them), more on the low branches, hanging on short stalks; big
 * (0.5 m), lumpy and knobbly; ripe, yellow-green with a brown patch.
 */
function fruit(b: VoxelBuilder, r: Rand, low: readonly [number, number, number, number][], ripe: boolean, src: SourceTrace | undefined): void {
  const a0 = r() * 6.28;
  const onTrunk = 4;
  for (let q = 0; q < onTrunk; q++) {
    const a = a0 + q * 2.2 + (r() - 0.5) * 0.4;
    const y = 1.05 + q * 0.42 + r() * 0.2;
    const w = y < 1.4 ? 0.64 : 0.58;
    jack(b, r, Math.cos(a) * (w / 2 + 0.17), y, Math.sin(a) * (w / 2 + 0.17), Math.cos(a) * (w / 2), Math.sin(a) * (w / 2), ripe, src);
  }
  for (const [a, y0, len, ey] of low) {
    for (const t of [0.4, 0.75]) {
      if (r() < 0.25) continue;
      const x = Math.cos(a) * len * t;
      const z = Math.sin(a) * len * t;
      const y = y0 + (ey - y0) * t - 0.17;
      jack(b, r, x, y - 0.12, z, x, z, ripe, src, true);
    }
  }
}

/**
 * One jackfruit hanging with its top at y, its middle at (x, z); its stalk to (sx, sz) (the trunk's face; or
 * straight up to the branch over it: `under`).
 */
function jack(b: VoxelBuilder, r: Rand, x: number, y: number, z: number, sx: number, sz: number, ripe: boolean, src: SourceTrace | undefined, under = false): void {
  const L = 0.5 + r() * 0.16;
  const W = 0.32 + r() * 0.05;
  const cy = y - L / 2;
  const yaw = r() * 6.28;
  const tilt = 0; // (it hangs straight down: heavy)
  const pal = ripe ? RIPE : GREEN;
  const body = tone(pal.body, r());
  // Stalk: short and thick, out of the bark (or down from the branch).
  if (under) b.box(x, y + 0.08, z, 0.05, 0.2, 0.05, STALK, 'mapBark', { src });
  else turned(b, (x + sx) / 2, y + 0.04, (z + sz) / 2, 0.05, 0.05, Math.hypot(x - sx, z - sz) + 0.04, Math.atan2(x - sx, z - sz), 0.5, 0, STALK, 'mapBark', 1, src);
  // The body: a long core, two cross boxes to round it, a shoulder under the stalk.
  turned(b, x, cy, z, W * 0.82, L, W * 0.82, yaw, 0, tilt, body, 'petal', 1, src);
  turned(b, x, cy - L * 0.04, z, W, L * 0.78, W * 0.7, yaw, 0, tilt, mix(body, pal.knob, 0.12), 'petal', 1, src);
  turned(b, x, cy - L * 0.04, z, W * 0.7, L * 0.78, W, yaw, 0, tilt, mix(body, pal.knob, 0.06), 'petal', 1, src);
  b.box(x, y - 0.02, z, W * 0.5, 0.06, W * 0.5, mix(body, pal.knob, 0.25), 'petal', { ry: yaw, src });
  // Knobs: the rough skin, rows of small darker bumps standing out of the four faces, staggered.
  const ca = Math.cos(yaw);
  const sa = Math.sin(yaw);
  for (let f = 0; f < 4; f++) {
    // (face normal and its sideways, in the fruit's own turn: yaw about y)
    const nx = f === 0 ? 1 : f === 1 ? -1 : 0;
    const nz = f === 2 ? 1 : f === 3 ? -1 : 0;
    const half = (f < 2 ? W * 0.82 : W * 0.82) / 2 + 0.012;
    for (let k = 0; k < 4; k++) {
      const side = ((k % 2) - 0.5) * W * 0.42 + (f & 1 ? 0.03 : -0.03);
      const ky = cy + (k / 3 - 0.5) * L * 0.72;
      const lx = nx * half + (nz !== 0 ? side : 0);
      const lz = nz * half + (nx !== 0 ? side : 0);
      // (turn the local point by yaw: x' = x cos + z sin, z' = −x sin + z cos)
      const kc = ripe && f === 1 && k === 1 ? BROWN : mix(pal.knob, body, ((k + f) % 3) * 0.15);
      b.box(x + lx * ca + lz * sa, ky, z - lx * sa + lz * ca, 0.055, 0.055, 0.055, kc, 'petal', { ry: yaw, src });
    }
  }
  if (ripe) {
    // A brown patch where it has ripened most.
    const fa = yaw + 1.1;
    turned(b, x + Math.cos(fa) * (W * 0.38), cy + L * 0.12, z + Math.sin(fa) * (W * 0.38), W * 0.5, L * 0.35, 0.06, Math.PI / 2 - fa, 0, 0, BROWN, 'petal', 1, src);
  }
}
