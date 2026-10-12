import { traceSource, type SourceTrace } from '../../../feedback/sourceTrace';
import type { VoxelBuilder } from '../../../voxel/VoxelBuilder';
import { registerModel } from '../look';
import type { PlantLook } from '../state';
import { Crown, vnoise, type CellInfo } from './_treeCrown';
import { deadTree, leavesAlong, limb, mix, planting, rng, thirstyLeaf, tone, turned, type Rand } from './_treeKit';

/**
 * The durian ធូរេន (garden/kinds.ts `KINDS.durian`; the contract garden/look.ts),
 * Kampot's pride: a seedling whose narrow leaves are green above and coppery
 * bronze beneath grows into an 11 m tree with a tall straight trunk and branches
 * in layers, almost level, so the young tree stands like a tiered cone and the
 * grown one in shelves of leaves, bronze when seen from under them. The spiky
 * green-brown fruit hang from the branches on short thick stalks; ripe, they fall
 * (`fallen` 1‥3: lying round the foot, picked up from the ground), while a few
 * unripe ones still hang in the crown.
 */

/** Leaves seen from above: olive green, lighter than the mango's. */
const CROWN = [0x1e3a24, 0x2a4a2a, 0x36592e, 0x446a32, 0x557b38, 0x6a8c3e] as const;
/** ... and from below: coppery bronze, darker in the deep shade. */
const UNDER = [0x54442a, 0x645232, 0x76623a, 0x867042, 0x967e4a] as const;
/** The sun on the tops (kept green: the durian's leaves are not yellow). */
const SUN = 0x7a9a44;
const LEAF = [0x4a7a34, 0x56863a, 0x507e36, 0x5e8c40] as const;
const LEAF_UNDER = 0xa07a44;
/** Reddish grey-brown, flaking. */
const BARK = [0x6a5444, 0x5e4a3c, 0x765e4c, 0x58463a] as const;
const STEM = [0x7a6a44, 0x6a5c3c] as const;
const GREEN = { body: [0x6e7c2c, 0x76862e, 0x687628] as const, spike: 0x56622a };
const RIPE = { body: [0xae9a42, 0xb6a24a, 0xa4903c] as const, spike: 0x6a5a28 };
const STALK = 0x5a5030;

registerModel('durian', (b, look) => {
  const r = rng(look, 37);
  if (look.dead) {
    const h = [0.5, 1.0, 2.1, 4.6, 5][look.stage];
    if (look.stage <= 1) planting(b, r, { stage: look.stage, stake: look.stage === 0 ? 0.6 : 0.9, stem: 0.03 });
    deadTree(b, r, { stage: look.stage, h, w: [0.032, 0.036, 0.05, 0.19, 0.2][look.stage], leafLen: 0.2, leafWid: 0.065, fork: 1.4 });
    return;
  }
  if (look.stage === 0) seedling(b, r, look);
  else if (look.stage === 1) small(b, r, look);
  else if (look.stage === 2) sapling(b, r, look);
  else if (look.stage === 3) young(b, r, look);
  else grown(b, r, look);
  // (ripe durians lying round the foot: drawn smooth by the view where `fallenAt` says, garden/_viewFruit.ts)
});

/** Narrow leaves, two-coloured, in two rows along a twig (or turning up the stem). */
const leaves = (look: PlantLook, n: number, len: number, step = Math.PI) => ({ n, len, wid: len * 0.46, pitch: 0.2, colors: LEAF, droop: look.droop, under: LEAF_UNDER, step, tip: 0.7 });

/** Stage 0: the seedling out of its bag: a straight stem, a few narrow leaves turning up it, bronze beneath. */
function seedling(b: VoxelBuilder, r: Rand, look: PlantLook): void {
  planting(b, r, { stage: 0, stake: 0.42, stem: 0.022 });
  limb(b, 0, 0, 0, 0.005, 0.52, 0, 0.022, 0.014, STEM, r, 2, 'mapBark');
  leavesAlong(b, r, [0, 0.16, 0], [0.005, 0.5, 0], leaves(look, 7, 0.21, 2.4));
}

/** Stage 1: a metre of straight stem, the first short side twigs level in a tier, leaves in rows. */
function small(b: VoxelBuilder, r: Rand, look: PlantLook): void {
  planting(b, r, { stage: 1, stake: 0.7, stem: 0.03 });
  limb(b, 0, 0, 0, 0.005, 1.0, 0, 0.034, 0.016, STEM, r, 2, 'mapBark');
  leavesAlong(b, r, [0.005, 0.66, 0], [0.005, 0.98, 0], leaves(look, 6, 0.21, 2.4));
  leavesAlong(b, r, [0.005, 0.2, 0], [0.005, 0.34, 0], leaves(look, 2, 0.2, 2.4));
  const a0 = r() * 6.28;
  for (let q = 0; q < 4; q++) {
    const a = a0 + q * 2.3;
    const y = 0.4 + q * 0.07;
    twig(b, r, look, 0.003, y, 0, a, 0.27 - q * 0.03, 2);
  }
}

/** A level twig with its two rows of leaves (the durian's flat sprays). */
function twig(b: VoxelBuilder, r: Rand, look: PlantLook, x: number, y: number, z: number, a: number, len: number, n: number): [number, number, number] {
  const ex = x + Math.cos(a) * len;
  const ez = z + Math.sin(a) * len;
  const ey = y + len * 0.12 - look.droop * 0.03;
  limb(b, x, y, z, ex, ey, ez, 0.018, 0.01, STEM, r);
  // (two rows, left and right of the twig: the leaves start a third of the way out)
  leavesAlong(b, r, [x + (ex - x) * 0.3, y + (ey - y) * 0.3, z + (ez - z) * 0.3], [ex, ey, ez], { ...leaves(look, n * 2, 0.19), axis: Math.PI / 2 - a, spread: 1.05 });
  return [ex, ey, ez];
}

/** Stage 2: a sapling of about 2.2 m: tiers of level twigs all up a straight stem, a little cone already. */
function sapling(b: VoxelBuilder, r: Rand, look: PlantLook): void {
  turned(b, 0.075, 0.6, -0.04, 0.026, 1.2, 0.026, 0, 0, 0, 0xc4ac6a, 'mapBark');
  b.box(0.04, 0.95, -0.02, 0.1, 0.026, 0.08, 0x9a8456, 'mapBark');
  limb(b, 0, 0, 0, 0.005, 1.2, 0, 0.06, 0.04, BARK, r, 2);
  limb(b, 0.005, 1.2, 0, 0.005, 2.2, 0, 0.04, 0.014, STEM, r, 2);
  leavesAlong(b, r, [0.005, 1.95, 0], [0.005, 2.18, 0], leaves(look, 4, 0.18, 2.4));
  let a = r() * 6.28;
  for (let q = 0; q < 6; q++) {
    const y = 0.7 + q * 0.22;
    const len = 0.6 - q * 0.075;
    for (let s = 0; s < 2; s++) {
      twig(b, r, look, 0.005, y + s * 0.05, 0, a + s * Math.PI + (r() - 0.5) * 0.4, len * (0.85 + r() * 0.2), q < 3 ? 3 : 2);
    }
    a += 2.0 + (r() - 0.5) * 0.4;
  }
}

/** The crown's colours: green on top, coppery bronze on the undersides of the shelves; paler when thirsty. */
function crownPaint(look: PlantLook, seed: number) {
  return (c: CellInfo): number | null => {
    let col: number | null = null;
    if (c.under && c.t < 0.85) {
      const n = vnoise(c.x * 1.7, c.y * 1.7, c.z * 1.7, seed + 11);
      col = UNDER[Math.max(0, Math.min(UNDER.length - 1, Math.floor(1 + c.exposure * 3 + (n - 0.5) * 2.2)))];
    } else if (!c.top && !c.tuft && c.exposure > 0.36 && vnoise(c.x * 2.3, c.y * 2.3, c.z * 2.3, seed + 13) > 0.7) {
      // (leaves turned by the wind show their bronze on the sides too)
      col = mix(c.color, UNDER[3], 0.55);
    }
    if (look.droop) return thirstyLeaf(col ?? c.color, look.droop, vnoise(c.x * 3, c.y * 3, c.z * 3, seed + 3));
    return col;
  };
}

/**
 * A shelf of leaves on a level branch from the trunk at height y toward a (radians), `len` long: a flat lump over
 * its outer part (cells of the crown), the branch under it.
 */
function shelf(b: VoxelBuilder, r: Rand, crown: Crown, y: number, a: number, len: number, w0: number, thick: number, wide = 1, rough = 0.3): [number, number, number] {
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const rise = len * (0.1 + r() * 0.08);
  const ex = ca * len;
  const ez = sa * len;
  limb(b, ca * w0 * 0.4, y, sa * w0 * 0.4, ex * 0.6, y + rise * 0.75, ez * 0.6, w0, w0 * 0.6, BARK, r);
  limb(b, ex * 0.6, y + rise * 0.75, ez * 0.6, ex, y + rise, ez, w0 * 0.6, w0 * 0.35, BARK, r);
  const m = 0.62;
  crown.blob(ex * m, y + rise * 0.8 + thick * 0.55, ez * m, len * 0.48 + 0.25, thick, (len * 0.3 + 0.35) * wide, rough);
  return [ex, y + rise, ez];
}

/** Stage 3: a young tree of about 5 m: a straight trunk, level branches in tiers, longer below: a tall cone. */
function young(b: VoxelBuilder, r: Rand, look: PlantLook): void {
  const seed = Math.round(look.seed * 997);
  limb(b, 0, 0, 0, 0, 2.4, 0, 0.19, 0.14, BARK, r, 2);
  limb(b, 0, 2.4, 0, 0.01, 4.7, 0, 0.14, 0.05, BARK, r, 2);
  const crown = new Crown(0.38, 2.0, 0.8, 5.3, seed);
  // A rounded body of leaves round the trunk, its tiers standing out of it as round shelves, the longest in the
  // middle: an oval with a domed top (a young durian), not a fir's cone.
  crown.blob(0, 3.0, 0, 0.75, 1.55, 0.75, 0.5);
  let a = r() * 6.28;
  const tiers = 6;
  for (let q = 0; q < tiers; q++) {
    const t = q / (tiers - 1);
    const y = 1.15 + t * 3.0;
    const len = 0.6 + 1.0 * Math.sin(Math.PI * (0.22 + 0.68 * t));
    const n = q % 2 === 0 ? 2 : 3;
    for (let s = 0; s < n; s++) shelf(b, r, crown, y + s * 0.1, a + (s / n) * 6.28 + (r() - 0.5) * 0.5, len * (0.85 + r() * 0.2), 0.07 - t * 0.03, 0.3 - look.droop * 0.05, 1.3, 0.55);
    a += 2.1 + (r() - 0.5) * 0.4;
  }
  crown.blob(0, 4.55, 0, 0.95, 0.75, 0.95, 0.5);
  if (look.droop) crown.thin(0.1 * look.droop, seed);
  crown.emit(b, { ramp: CROWN, seed, tufts: 0.3, tuft: 0.6, sun: SUN, paint: crownPaint(look, seed) });
}

/**
 * Stage 4: the grown tree: a tall straight trunk (11 m), branches in layers almost level and shorter toward the
 * top, each with its shelf of leaves; the lowest shelves at 3 m (he walks under them), unripe fruit under the
 * branches in season.
 */
function grown(b: VoxelBuilder, r: Rand, look: PlantLook): void {
  const seed = Math.round(look.seed * 997);
  const src = traceSource();
  const segs: [number, number, number][] = [
    [0, 2.2, 0.72],
    [2.2, 4.4, 0.62],
    [4.4, 6.6, 0.52],
    [6.6, 8.6, 0.42],
    [8.6, 10.4, 0.3],
  ];
  let ox = 0;
  for (const [y0, y1, w] of segs) {
    b.box(ox, (y0 + y1) / 2, 0, w, y1 - y0 + 0.04, w, tone(BARK, r()), 'mapBark', { shade: 1.02 - y0 * 0.02, src });
    ox += (r() - 0.5) * 0.05;
  }
  // Small buttresses.
  for (let q = 0; q < 4; q++) {
    const a = (q / 4) * 6.28 + r() * 0.6;
    const h = 0.4 + r() * 0.35;
    turned(b, Math.cos(a) * 0.42, h / 2 - 0.02, Math.sin(a) * 0.42, 0.14, h, 0.42, Math.PI / 2 - a, 0, 0, tone(BARK, r()), 'mapBark', 0.94, src);
  }
  const crown = new Crown(0.5, 3.9, 2.6, 11.4, seed);
  const hang: [number, number, number, number, number, number][] = [];
  let a = r() * 6.28;
  const tiers = 7;
  for (let q = 0; q < tiers; q++) {
    const t = q / (tiers - 1);
    const y = 3.1 + t * 6.5;
    const len = 3.3 * (1 - 0.55 * Math.pow(t, 1.25));
    const n = 3;
    for (let s = 0; s < n; s++) {
      const ba = a + (s / n) * 6.28 + (r() - 0.5) * 0.5;
      const bl = len * (0.85 + r() * 0.2);
      const y1 = y + s * 0.18;
      const [ex, ey, ez] = shelf(b, r, crown, y1, ba, bl, 0.24 - t * 0.12, 0.55, 1.25);
      if (q < 4) hang.push([ex * 0.35, y1 + (ey - y1) * 0.35, ez * 0.35, ex * 0.6, y1 + (ey - y1) * 0.6, ez * 0.6]);
    }
    a += 2.3 + (r() - 0.5) * 0.5;
  }
  crown.blob(0, 10.4, 0, 1.0, 0.75, 1.0, 0.3);
  crown.emit(b, { ramp: CROWN, seed, tufts: 0.2, sun: SUN, paint: crownPaint(look, seed) });
  // The unripe fruit hanging under the branches (a few once the ripe ones have fallen).
  if (look.fruit) {
    const want = look.fallen > 0 ? 3 : 6;
    let made = 0;
    for (let q = 0; q < hang.length && made < want; q++) {
      const [x0, y0, z0, x1, y1, z1] = hang[(q * 3) % hang.length];
      const t = r();
      durian(b, r, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t - 0.1, z0 + (z1 - z0) * t, look.fruit === 2, src, true);
      made++;
    }
  }
}

/**
 * One durian: a round-oval green-brown fruit covered in sharp spikes (small turned blocks standing out of it),
 * hanging with its top at y from a short thick stalk (`hanging`), or lying on the ground on its side.
 */
function durian(b: VoxelBuilder, r: Rand, x: number, y: number, z: number, ripe: boolean, src: SourceTrace | undefined, hanging: boolean): void {
  // (one on the ground is played up a little, 0.36‥0.4 m with chunky spikes, so it reads from the path)
  const W = hanging ? 0.28 + r() * 0.05 : 0.36 + r() * 0.04;
  const H = W * (1.1 + r() * 0.1);
  const pal = ripe ? RIPE : GREEN;
  const body = tone(pal.body, r());
  const yaw = r() * 6.28;
  const cy = hanging ? y - 0.1 - H / 2 : y;
  if (hanging) b.box(x, y - 0.04, z, 0.045, 0.16, 0.045, STALK, 'mapBark', { src });
  // Body: a core and a cross box (round enough), a darker cap where the stalk joins.
  turned(b, x, cy, z, W * 0.86, H, W * 0.86, yaw, 0, 0, body, 'petal', 1, src);
  turned(b, x, cy, z, W, H * 0.72, W, yaw + 0.785, 0, 0, mix(body, pal.spike, 0.1), 'petal', 1, src);
  if (hanging) b.box(x, cy + H / 2 + 0.01, z, 0.08, 0.04, 0.08, STALK, 'petal', { ry: yaw, src });
  else b.box(x, cy + H / 2 + 0.02, z, 0.05, 0.06, 0.05, STALK, 'mapBark', { ry: yaw, src });
  // Spikes: diamonds (turned cubes) standing out of it in three rings, and one at the bottom.
  const s = W * 0.26;
  for (let k = 0; k < 13; k++) {
    let sx: number;
    let sy: number;
    let sz: number;
    if (k < 12) {
      const ring = Math.floor(k / 4) - 1;
      const fa = yaw + (k % 4) * 1.5708 + (ring === 0 ? 0.785 : 0);
      const rr = ring === 0 ? W * 0.56 : W * 0.44;
      sx = x + Math.cos(fa) * rr;
      sz = z + Math.sin(fa) * rr;
      sy = cy + ring * H * 0.3;
    } else {
      sx = x;
      sz = z;
      sy = cy - H / 2 - s * 0.1;
    }
    b.box(sx, sy, sz, s, s, s, k % 3 === 1 ? mix(pal.spike, body, 0.35) : pal.spike, 'petal', { rx: 0.615, ry: yaw + k * 0.7, rz: 0.785, src });
  }
}

/**
 * Where fallen durian `i` (0‥2) lies (local m: x, y of its middle, z), of `look.fallen` (≤ 3): in the basin's dish
 * between the buttresses (every second one), or out past its bank, a little lower (garden/_viewEarth.ts). Its own
 * seeded numbers (`rng(look, 38)`), so the picking (roam/_gardenWork.ts) finds the fruit where the model lays it.
 */
export function fallenAt(look: PlantLook, i: number): [number, number, number] {
  const n = Math.min(3, look.fallen);
  const r = rng(look, 38);
  const a0 = r() * 6.28;
  let out: [number, number, number] = [0, 0.19, 0];
  for (let q = 0; q <= i && q < n; q++) {
    const a = a0 + (q / n) * 6.28 + (r() - 0.5) * 1.2;
    const inside = q % 2 === 1;
    const d = inside ? 0.68 + r() * 0.14 : 1.5 + r() * 0.8;
    out = [Math.cos(a) * d, inside ? 0.21 : 0.19, Math.sin(a) * d];
  }
  return out;
}
