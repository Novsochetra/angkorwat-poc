import { Euler, Group, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import type { AngkorExplorer } from '../../character/AngkorExplorer';
import {
  BASKET,
  CAN,
  CAN_ROSE,
  FRUIT,
  HOE,
  KNIFE,
  POLE,
  SEED,
  SEEDLING,
  STICK,
  WAITING,
  bigFruit,
  defaultGardenSpot,
  gardenBeat,
  gardenBody,
  gardenGrip,
  gardenGroundBasket,
  gardenStickHeap,
  gardenHeld,
  gardenItemNow,
  gardenPoleLength,
  gardenPose,
  gardenRelease,
  groundBasket,
  type GardenBody,
  type Grip,
} from '../../character/gardenWork';
import type { HandPose } from '../../character/parts/limbs';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { VoxelMaterialKey } from '../../voxel/materials';
import { buildVoxelMesh, disposeVoxelMesh } from '../../voxel/VoxelMesh';
import { ACTIONS, type GardenAction, type GardenProp } from '../garden/actions';
import { KINDS, type PlantKindId } from '../garden/kinds';

/**
 * What he holds in his garden (roam/_gardenWork.ts puts them in his hands by
 * map/garden/actions.ts `ACTIONS[…].right / left`, through `GardenHands`), in his
 * blocks, body units, each in its own frame (character/gardenWork.ts says where:
 * the poses put his fists on them by `gardenGrip`, so a prop sits in the fist
 * exactly as the pose holds it):
 *
 * - the Khmer hoe (ចបកាប់): a wide iron blade at a sharp angle under the eye
 *   of a long wooden handle, its edge worn bright;
 * - the watering can (ធុងស្រោចទឹក): galvanized tin, an oval body with its
 *   seams, a top handle, a back handle, the long spout with its rose;
 * - his farm knife (កាំបិត): a dark wooden handle, a long iron blade;
 * - the bamboo picking pole (ដងបេះ): a long dry bamboo with its nodes, a
 *   little woven basket at the top with the hook's prongs over it;
 * - the seed (a pinch of seeds), the sugarcane cutting, the banana pup, the
 *   seedling in its black nursery bag (and its root ball when the bag is torn
 *   off: the torn bag drops to the ground);
 * - the harvest of each kind at true size (gardenWork.ts `FRUIT`): a long
 *   purple eggplant, an ear of corn in its husk, a ribbed pumpkin, sugarcane
 *   canes, a banana bunch with its purple heart, a papaya, a guava, a mango,
 *   a jackfruit, a spiky durian, a coconut, a sugar palm fruit with its cap;
 * - a dead plant's stick with its roots and earth, tossed on the heap;
 * - his woven bamboo basket (on his hip, or on the ground beside him when his
 *   hands are full), the harvest in it once he has put it there.
 *
 * Colours: the plants' own (garden/kinds.ts `eat.colors` where it has them, the
 * models'), the map's families for what grows (`petal` fruit, `mapLeaf` leaves,
 * `mapBark` stems, `mapRock` earth: compiled for the garden already), his own
 * for his tools (`wood`, `metal`, `hat` for the woven bamboo, `lens` for wet
 * and glossy things: the water, the black bag).
 */

const pick = (xs: readonly number[], r: number) => xs[Math.min(xs.length - 1, Math.floor(r * xs.length))];
const r3 = (i: number, j: number, s: number) => hash3(i, j, 7, s);

const _v = new Vector3();
const _q = new Quaternion();
const _e = new Euler();
const Z = new Vector3(0, 0, 1);

/** A box from `a` to `b` (its long side along the line), `w` × `h` across. */
function rod(b: VoxelBuilder, a: Vector3, c: Vector3, w: number, h: number, color: number, mat: VoxelMaterialKey, shade = 1): void {
  _v.subVectors(c, a);
  const len = _v.length();
  if (len < 1e-4) return;
  _q.setFromUnitVectors(Z, _v.divideScalar(len));
  _e.setFromQuaternion(_q, 'XYZ');
  b.box((a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2, w, h, len, color, mat, { rx: _e.x, ry: _e.y, rz: _e.z, shade });
}
const V = (x: number, y: number, z: number) => new Vector3(x, y, z);

/**
 * A rounded lump (a fruit, a root ball) of three crossed boxes: `w` wide, `h` tall, `d` deep, its middle at x, y, z;
 * `colors` the skin's tones (the first most), `seed` its own.
 */
function lump(b: VoxelBuilder, x: number, y: number, z: number, w: number, h: number, d: number, colors: readonly number[], mat: VoxelMaterialKey, seed: number): void {
  const c = (k: number) => pick(colors, r3(k, 1, seed) * 0.9 + (k === 0 ? 0 : 0.1));
  b.box(x, y, z, w * 0.72, h, d * 0.72, colors[0], mat, { shade: 1.02 });
  b.box(x, y, z, w, h * 0.7, d * 0.72, c(1), mat, { shade: 0.99 });
  b.box(x, y, z, w * 0.72, h * 0.7, d, c(2), mat, { shade: 0.97 });
  b.box(x, y, z, w * 0.88, h * 0.86, d * 0.88, c(3), mat, { shade: 1.0 });
}

// ── Tools ───────────────────────────────────────────────────────────────────

/** Weathered handle wood, the iron and its bright worn edge (as the farm's sickle, _farmProps.ts). */
const HANDLE = [0xa98455, 0x9a7548, 0xb39060];
const HANDLE_END = 0x6e4f30;
const IRON = [0x4f4c48, 0x5a5650, 0x46433f];
const EDGE = 0xc4c0b6;
const RUST = 0x7a5a42;

/** The hoe (gardenWork.ts `HOE`): the butt at the origin, the handle up +z, the blade down −y and back toward him. */
export function hoeBuilder(): VoxelBuilder {
  const b = new VoxelBuilder();
  const L = HOE.handle;
  const r = HOE.r;
  const n = 7;
  for (let i = 0; i < n; i++) {
    const z0 = (i * L) / n;
    const z1 = ((i + 1) * L) / n;
    b.span(-r, -r, z0, r, r, z1 + 0.02, pick(HANDLE, r3(i, 2, 4101)), 'wood', { shade: 0.97 + r3(i, 3, 4101) * 0.06 });
  }
  b.span(-r - 0.05, -r - 0.05, -0.05, r + 0.05, r + 0.05, 0.45, HANDLE_END, 'wood');
  // (the iron's eye round the handle's end, the wedge of the handle through it)
  b.span(-0.78, -0.82, L - 1.2, 0.78, 0.7, L + 0.2, IRON[0], 'metal');
  b.span(-0.85, -0.9, L - 0.95, 0.85, 0.78, L - 0.65, IRON[2], 'metal');
  b.span(-r + 0.06, -r + 0.06, L + 0.2, r - 0.06, r - 0.06, L + 0.62, HANDLE[1], 'wood');
  // (the blade: from under the eye, down and back toward him, widening to the edge)
  const [, dy, dz] = HOE.dir;
  const rx = Math.atan2(-dz, -dy);
  const rows = 6;
  const from = 0.75;
  const seg = (HOE.blade - from) / rows;
  for (let i = 0; i < rows; i++) {
    const s = (i + 0.5) / rows;
    const along = from + (i + 0.5) * seg;
    const w = 1.5 + (HOE.width - 1.5) * Math.min(1, s * 1.5);
    const col = i === rows - 1 ? IRON[1] : pick(IRON, r3(i, 5, 4103));
    b.box(0, dy * along, L - 0.45 + dz * along, w, seg + 0.06, 0.34, col, 'metal', { rx, shade: 0.98 + 0.03 * s });
  }
  // (a little rust at its shoulders, the bright edge)
  b.box(0, dy * 1.4, L - 0.45 + dz * 1.4, 2.0, 0.6, 0.38, RUST, 'metal', { rx, shade: 0.95 });
  const e = HOE.blade - 0.12;
  b.box(0, dy * e, L - 0.45 + dz * e, HOE.width + 0.05, 0.3, 0.36, EDGE, 'metal', { rx });
  return b;
}

/** Damp earth stuck on the hoe's blade after a stroke (hoe frame, as `hoeBuilder`). */
export function hoeSoilBuilder(): VoxelBuilder {
  const b = new VoxelBuilder();
  const L = HOE.handle;
  const [, dy, dz] = HOE.dir;
  const rx = Math.atan2(-dz, -dy);
  for (let i = 0; i < 5; i++) {
    const along = 2.4 + r3(i, 1, 4105) * 1.6;
    const across = (r3(i, 2, 4105) - 0.5) * (HOE.width - 0.8);
    const face = r3(i, 3, 4105) < 0.5 ? -1 : 1;
    // (on either face of the blade: out along its normal)
    b.box(across, dy * along - face * 0.24 * Math.sin(rx), L - 0.45 + dz * along + face * 0.24 * Math.cos(rx), 0.6 + r3(i, 4, 4105) * 0.5, 0.5, 0.3, pick([0x5e4430, 0x6a4e36, 0x4e3826], r3(i, 5, 4105)), 'mapRock', { rx });
  }
  return b;
}

/** Galvanized tin: the sheet's greys, its seams, the dark inside. */
const TIN = [0xaab0b3, 0xa0a7ab, 0xb6bbbe];
const SEAM = 0x80888d;
const TIN_DARK = 0x3f474b;

/** The watering can (gardenWork.ts `CAN`): its bottom's middle at the origin, the spout toward +z. */
export function canBuilder(): VoxelBuilder {
  const b = new VoxelBuilder();
  const { w, d, h } = CAN;
  // (an oval body: two crossed boxes, the sheet's panels a little apart in tone)
  b.box(0, h / 2, 0, w, h, d - 1.1, TIN[0], 'metal');
  b.box(0, h / 2, 0, w - 1.1, h, d, TIN[1], 'metal', { shade: 1.01 });
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) b.box(x * (w / 2 - 0.55), h / 2, z * (d / 2 - 0.55), 0.9, h, 0.9, TIN[2], 'metal', { ry: Math.PI / 4, shade: 0.98 });
  // (its rolled seams round it: the bottom, two bands, the top)
  for (const [y, t] of [[0.18, 0.36], [1.9, 0.18], [3.6, 0.18], [h - 0.12, 0.3]] as const) {
    b.box(0, y, 0, w + 0.12, t, d - 1.0, SEAM, 'metal');
    b.box(0, y, 0, w - 1.0, t, d + 0.12, SEAM, 'metal');
  }
  // (the top: the back closed, the round mouth at the front, dark inside)
  b.box(0, h + 0.05, -0.7, w - 0.6, 0.12, d - 1.8, TIN[2], 'metal');
  b.box(0, h + 0.06, 1.05, 2.6, 0.08, 1.6, TIN_DARK, 'metal');
  b.box(0, h + 0.14, 1.05, 3.0, 0.22, 0.3, SEAM, 'metal');
  // (the top handle from back to front over it; the fist on its middle)
  const top = h + CAN.handleUp - 0.55;
  b.span(-0.26, h, -2.0, 0.26, top + 0.28, -1.5, TIN[1], 'metal');
  b.span(-0.26, h, 1.25, 0.26, top + 0.28, 1.75, TIN[1], 'metal');
  b.span(-0.3, top - 0.28, -2.05, 0.3, top + 0.28, 1.8, TIN[0], 'metal');
  // (the back handle, to tip it by)
  b.span(-0.26, 1.2, -d / 2 - 1.3, 0.26, h - 0.7, -d / 2 - 0.8, TIN[1], 'metal');
  b.span(-0.26, h - 1.2, -d / 2 - 0.9, 0.26, h - 0.7, -d / 2 + 0.1, TIN[1], 'metal');
  b.span(-0.26, 1.2, -d / 2 - 0.9, 0.26, 1.7, -d / 2 + 0.1, TIN[1], 'metal');
  // (the spout: from low on its front, up and out, narrowing; a strut to the body; the rose)
  const foot = V(...CAN.spoutAt);
  const dir = V(0, Math.sin(CAN.spoutUp), Math.cos(CAN.spoutUp));
  const parts = 4;
  for (let i = 0; i < parts; i++) {
    const a = foot.clone().addScaledVector(dir, (i * CAN.spout) / parts);
    const c = foot.clone().addScaledVector(dir, ((i + 1) * CAN.spout) / parts + 0.05);
    const t = 0.98 - i * 0.1;
    rod(b, a, c, t, t, pick(TIN, r3(i, 1, 4111)), 'metal');
  }
  rod(b, V(0, h - 0.9, d / 2 - 0.2), foot.clone().addScaledVector(dir, CAN.spout * 0.5), 0.3, 0.3, SEAM, 'metal');
  const tip = foot.clone().addScaledVector(dir, CAN.spout);
  rod(b, tip, tip.clone().addScaledVector(dir, 0.45), 1.35, 1.35, TIN[1], 'metal');
  rod(b, CAN_ROSE.clone().addScaledVector(dir, -0.2), CAN_ROSE, CAN.rose * 2, CAN.rose * 2, TIN[2], 'metal');
  // (the rose's holes)
  const side = V(1, 0, 0);
  const upr = V(0, 0, 0).crossVectors(dir, side);
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++) {
      if (i && j) continue;
      const p = CAN_ROSE.clone().addScaledVector(side, i * 0.5).addScaledVector(upr, j * 0.5).addScaledVector(dir, 0.02);
      rod(b, p, p.clone().addScaledVector(dir, 0.04), 0.22, 0.22, TIN_DARK, 'metal');
    }
  return b;
}

/**
 * His farm knife (gardenWork.ts `KNIFE`): a Khmer chopping knife for cane and banana stalks, a round wooden
 * handle with an iron ferrule, a broad blade widening to its squared, slightly hooked tip; the handle in the fist,
 * the blade along +z, its edge down (−y), the spine straight on top.
 */
export function knifeBuilder(): VoxelBuilder {
  const b = new VoxelBuilder();
  const hl = KNIFE.handle;
  b.span(-0.42, -0.5, -hl / 2, 0.42, 0.5, hl / 2, 0x5c3a24, 'wood');
  b.span(-0.46, -0.56, -hl / 2 - 0.3, 0.46, 0.56, -hl / 2 + 0.2, 0x4a2e1c, 'wood');
  b.span(-0.46, -0.56, hl / 2 - 0.05, 0.46, 0.56, hl / 2 + 0.4, 0x8a8478, 'metal');
  // (the blade in slices along it: the spine level, the edge dropping as it widens; the bright edge under)
  const z0 = hl / 2 + 0.4;
  const L = KNIFE.blade;
  const top = 0.42;
  const n = 6;
  for (let i = 0; i < n; i++) {
    const u0 = i / n;
    const u1 = (i + 1) / n;
    const w = 1.05 + (KNIFE.width - 1.05) * Math.pow((u0 + u1) / 2, 0.8);
    b.span(-0.1, top - w + 0.24, z0 + u0 * L, 0.1, top, z0 + u1 * L + 0.02, pick(IRON, r3(i, 1, 4113)), 'metal');
    b.span(-0.085, top - w, z0 + u0 * L + (i === 0 ? 0.3 : 0), 0.085, top - w + 0.26, z0 + u1 * L + 0.02, EDGE, 'metal');
  }
  // (the squared tip, its corner hooked a little forward at the edge)
  b.span(-0.1, top - KNIFE.width - 0.1, z0 + L - 0.02, 0.1, top - 0.3, z0 + L + 0.32, IRON[0], 'metal');
  b.box(0, top - KNIFE.width - 0.12, z0 + L + 0.32, 0.17, 0.32, 0.5, EDGE, 'metal', { rx: -0.5 });
  b.span(-0.13, top - 0.24, z0, 0.13, top + 0.02, z0 + L, IRON[2], 'metal');
  return b;
}

/** Dry bamboo: its tones and its nodes. */
const BAMBOO = [0xc9b46a, 0xbea95e, 0xd2bf7a];
const NODE = 0x9c864a;
/** The pole's shaft is built this long (BU) and stretched to the work's length. */
export const POLE_BUILT = 60;

/** The picking pole's shaft (its butt at the origin, up +z, `POLE_BUILT` long). */
export function poleShaftBuilder(): VoxelBuilder {
  const b = new VoxelBuilder();
  const r = POLE.r;
  const n = 11;
  const seg = POLE_BUILT / n;
  for (let i = 0; i < n; i++) {
    const z0 = i * seg;
    // (a little thinner toward the top)
    const t = r * (1 - 0.18 * (i / n));
    b.span(-t, -t, z0, t, t, z0 + seg + 0.01, pick(BAMBOO, r3(i, 1, 4121)), 'wood', { shade: 0.97 + r3(i, 2, 4121) * 0.06 });
    if (i > 0) b.span(-t - 0.1, -t - 0.1, z0 - 0.2, t + 0.1, t + 0.1, z0 + 0.2, NODE, 'wood');
  }
  return b;
}

/** Woven bamboo strips (the basket, the pole's basket): their tones, the rim's. */
const WEAVE = [0xc8a868, 0xb39352, 0xd4b878];
const WEAVE_DARK = 0x957638;
const RIM = 0x86682f;

/** The pole's head (at the shaft's top, up +z): a little woven basket round the tip, the hook's two prongs over its rim. */
export function poleHeadBuilder(): VoxelBuilder {
  const b = new VoxelBuilder();
  const R = 1.45;
  const H = 2.4;
  const n = 10;
  // (the tip of the bamboo into its bottom; the bottom)
  b.span(-0.36, -0.36, -0.2, 0.36, 0.36, 0.6, BAMBOO[1], 'wood');
  b.box(0, 0, 0.35, R * 1.7, R * 1.7, 0.3, WEAVE[1], 'hat');
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * R;
    const y = Math.sin(a) * R;
    b.box(x, y, 0.3 + H / 2, 0.34, (2 * Math.PI * R) / n + 0.08, H, pick(WEAVE, r3(i, 3, 4123)), 'hat', { rz: a });
    b.box(x * 1.04, y * 1.04, 0.3 + H * 0.45, 0.4, (2 * Math.PI * R) / n + 0.1, 0.3, WEAVE_DARK, 'hat', { rz: a });
    b.box(x * 1.05, y * 1.05, 0.3 + H, 0.46, (2 * Math.PI * R) / n + 0.12, 0.4, RIM, 'hat', { rz: a });
  }
  // (the hook: two prongs up from the rim on one side, leaning in, a V to catch the fruit's stalk)
  for (const s of [-1, 1]) {
    rod(b, V(R * 0.9, s * 0.45, 0.3 + H), V(R * 0.9, s * 0.42, 0.3 + H + 1.1), 0.24, 0.24, BAMBOO[0], 'wood');
    rod(b, V(R * 0.9, s * 0.42, 0.3 + H + 1.1), V(R * 0.3, s * 0.25, 0.3 + H + 1.6), 0.2, 0.2, BAMBOO[2], 'wood');
  }
  return b;
}

/** His basket (gardenWork.ts `BASKET`): woven bamboo strips round a round base, a thick rim; its bottom's middle at the origin. */
export function basketBuilder(): VoxelBuilder {
  const b = new VoxelBuilder();
  const { r, h } = BASKET;
  const n = 14;
  b.box(0, 0.18, 0, r * 1.5, 0.36, r * 1.5, WEAVE[1], 'hat');
  b.box(0, 0.18, 0, r * 1.5, 0.36, r * 1.5, WEAVE[1], 'hat', { ry: Math.PI / 4 });
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a);
    const z = Math.sin(a);
    const wide = (2 * Math.PI * r) / n + 0.1;
    // (the wall flares a little to the rim)
    b.box(x * (r - 0.15), h / 2, z * (r - 0.15), 0.34, h, wide, pick(WEAVE, r3(i, 1, 4131)), 'hat', { ry: -a, rz: -0.06 });
    for (const [y, k] of [[1.1, 0], [2.3, 1]] as const) b.box(x * (r - 0.05), y, z * (r - 0.05), 0.38, 0.32, wide + 0.02, k ? WEAVE_DARK : WEAVE[2], 'hat', { ry: -a });
    b.box(x * r, h + 0.1, z * r, 0.62, 0.48, wide + 0.06, RIM, 'hat', { ry: -a });
  }
  return b;
}

// ── What he plants ──────────────────────────────────────────────────────────

const SOIL = [0x5e4430, 0x6a4e36, 0x543c2a];
const BAG = [0x1f2022, 0x2a2b2e];
const SAP_STEM = 0x6f5a3c;
const SAP_LEAF = [0x4f8a32, 0x5c9a3a, 0x467e2c];
const PALM_LEAF = [0x6a9a3a, 0x5a8a32];

/** A pinch of seeds (origin: the seeds; the fingers above them). */
export function seedBuilder(kind: PlantKindId | null): VoxelBuilder {
  const b = new VoxelBuilder();
  const col = kind === 'corn' ? [0xe8c24a, 0xd8b03e] : kind === 'pumpkin' ? [0xeae0c0, 0xddd2ae] : [0xd8c890, 0xc8b47a];
  for (let i = 0; i < 4; i++) b.box((r3(i, 1, 4141) - 0.5) * 0.6, (r3(i, 2, 4141) - 0.5) * 0.4, (r3(i, 3, 4141) - 0.5) * 0.6, 0.42, 0.3, 0.5, pick(col, r3(i, 4, 4141)), 'petal', { ry: r3(i, 5, 4141) * 3 });
  return b;
}

/** The sugarcane cutting: a short cane with two nodes and their buds (its foot at the origin, up +y). */
export function cuttingBuilder(): VoxelBuilder {
  const b = new VoxelBuilder();
  const H = SEED.cutting;
  b.span(-0.36, 0, -0.36, 0.36, H, 0.36, 0x8a5a7a, 'mapBark');
  for (const y of [1.3, 3.0]) {
    b.span(-0.42, y - 0.14, -0.42, 0.42, y + 0.14, 0.42, 0xc8b878, 'mapBark');
    b.box(0, y + 0.35, 0.45, 0.3, 0.4, 0.25, 0x9aa848, 'mapLeaf');
  }
  b.span(-0.3, H - 0.05, -0.3, 0.3, H + 0.06, 0.3, 0xd8c8a0, 'mapBark');
  return b;
}

/** The banana pup: its corm with roots, the young pseudostem, a few sword leaves (foot at the origin, up +y). */
export function pupBuilder(): VoxelBuilder {
  const b = new VoxelBuilder();
  const H = SEED.pup;
  b.box(0, 0.7, 0, 1.7, 1.4, 1.6, 0x8a7a4e, 'mapBark');
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3;
    rod(b, V(Math.cos(a) * 0.6, 0.3, Math.sin(a) * 0.6), V(Math.cos(a) * 1.4, -0.4, Math.sin(a) * 1.4), 0.18, 0.18, 0x6a5638, 'mapBark');
  }
  b.span(-0.5, 1.2, -0.5, 0.5, H * 0.55, 0.5, 0x7a9a48, 'mapLeaf');
  b.span(-0.36, H * 0.55, -0.36, 0.36, H * 0.62, 0.36, 0x6a8e40, 'mapLeaf');
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7 + 0.4;
    const lean = 0.25 + 0.15 * i;
    const from = V(0, H * 0.5 + i * 0.3, 0);
    const to = V(Math.cos(a) * lean * 4, H + 0.2 - i * 0.6, Math.sin(a) * lean * 4);
    rod(b, from, to, 0.9, 0.12, pick(SAP_LEAF, r3(i, 1, 4151)), 'mapLeaf');
  }
  return b;
}

/** The seedling in its black nursery bag (bottom's middle at the origin): the sapling as its kind grows (a palm's fronds, else leaves). */
export function seedlingBuilder(kind: PlantKindId | null, bag: boolean): VoxelBuilder {
  const b = new VoxelBuilder();
  const R = SEEDLING.r;
  const H = SEEDLING.h;
  if (bag) {
    // (the bag: black plastic, a fold at its top, a little soil over it)
    b.box(0, H / 2, 0, R * 2, H, R * 2 - 0.4, BAG[0], 'lens');
    b.box(0, H / 2, 0, R * 2 - 0.4, H, R * 2, BAG[1], 'lens');
    b.box(0, H - 0.1, 0, R * 2 + 0.12, 0.35, R * 2 - 0.3, BAG[1], 'lens');
    b.box(0, H + 0.04, 0, R * 2 - 0.5, 0.2, R * 2 - 0.5, SOIL[0], 'mapRock');
  } else {
    // (the root ball: the bag's shape in earth, a few roots out of it)
    lump(b, 0, H / 2, 0, R * 2 - 0.2, H, R * 2 - 0.2, SOIL, 'mapRock', 4161);
    for (let i = 0; i < 4; i++) {
      const a = i * 1.6 + 0.3;
      rod(b, V(Math.cos(a) * R * 0.8, 0.6 + i * 0.3, Math.sin(a) * R * 0.8), V(Math.cos(a) * (R + 0.5), 0.1 + i * 0.25, Math.sin(a) * (R + 0.5)), 0.16, 0.16, 0xb09a72, 'mapBark');
    }
  }
  const top = H + 0.1;
  const palm = kind === 'coconut' || kind === 'sugarPalm';
  if (palm) {
    // (a palm's first fronds: a few stiff blades from the earth)
    for (let i = 0; i < 5; i++) {
      const a = i * 1.25;
      const lean = kind === 'coconut' ? 0.5 : 0.3;
      rod(b, V(0, top, 0), V(Math.cos(a) * lean * 3.2, top + SEEDLING.tree * (0.75 - i * 0.05), Math.sin(a) * lean * 3.2), 0.85, 0.12, pick(PALM_LEAF, r3(i, 1, 4163)), 'mapLeaf');
    }
    if (kind === 'coconut') lump(b, 0.3, top + 0.4, 0, 2.2, 1.6, 2.0, [0x8a6a3a, 0x7a5c32], 'petal', 4164);
    return b;
  }
  // (a sapling: a thin stem, a few side twigs and their leaves)
  const T = SEEDLING.tree;
  b.span(-0.2, top - 0.2, -0.2, 0.2, top + T * 0.8, 0.2, SAP_STEM, 'mapBark');
  for (let i = 0; i < 6; i++) {
    const y = top + T * (0.35 + 0.1 * i);
    const a = i * 2.4 + (kind === 'mango' ? 0.3 : 0);
    const len = 1.6 - i * 0.12;
    const tip = V(Math.cos(a) * len, y + 0.6, Math.sin(a) * len);
    rod(b, V(0, y, 0), tip, 0.16, 0.16, SAP_STEM, 'mapBark');
    b.box(tip.x, tip.y + 0.1, tip.z, 1.3, 0.22, 0.8, pick(SAP_LEAF, r3(i, 2, 4165)), 'mapLeaf', { ry: -a, rz: 0.3 });
  }
  b.box(0, top + T * 0.85, 0, 1.0, 0.7, 1.0, SAP_LEAF[1], 'mapLeaf');
  return b;
}

/** The torn nursery bag, crumpled (lying on the ground: its middle at the origin). */
export function tornBagBuilder(): VoxelBuilder {
  const b = new VoxelBuilder();
  for (let i = 0; i < 4; i++) b.box((r3(i, 1, 4171) - 0.5) * 1.6, 0.2 + i * 0.08, (r3(i, 2, 4171) - 0.5) * 1.6, 1.4, 0.18, 1.0, pick(BAG, r3(i, 3, 4171)), 'lens', { ry: r3(i, 4, 4171) * 3, rz: (r3(i, 5, 4171) - 0.5) * 0.6 });
  return b;
}

/** A dead plant pulled out: a dry grey-brown stem, a few twigs and curled brown leaves, the roots and a clump of earth (its root collar at the origin, up +y). */
export function stickBuilder(tree: boolean): VoxelBuilder {
  const b = new VoxelBuilder();
  const H = tree ? STICK.tree : STICK.crop;
  const DRY = [0x8a7a62, 0x7a6c56, 0x948670];
  const LEAF = [0x8a6a3a, 0x7a5a30, 0x9a7a48];
  const t = tree ? 0.34 : 0.26;
  b.span(-t, -0.2, -t, t, H * 0.55, t, DRY[0], 'mapBark');
  rod(b, V(0, H * 0.55 - 0.1, 0), V(0.4, H, 0.2), t * 1.6, t * 1.6, DRY[1], 'mapBark');
  for (let i = 0; i < (tree ? 4 : 3); i++) {
    const y = H * (0.3 + 0.18 * i);
    const a = i * 2.2 + 0.5;
    const tip = V(Math.cos(a) * 1.4, y + 1.0, Math.sin(a) * 1.4);
    rod(b, V(0, y, 0), tip, 0.16, 0.16, pick(DRY, r3(i, 1, 4181)), 'mapBark');
    b.box(tip.x, tip.y - 0.5, tip.z, 0.9, 1.0, 0.25, pick(LEAF, r3(i, 2, 4181)), 'mapBark', { ry: -a, rx: 0.4 });
  }
  // (the roots and the earth still on them)
  lump(b, 0, -0.9, 0, 1.8, 1.4, 1.7, SOIL, 'mapRock', 4183);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26 + 0.2;
    rod(b, V(0, -0.8, 0), V(Math.cos(a) * 1.6, -2.0 - r3(i, 3, 4183) * 0.8, Math.sin(a) * 1.6), 0.18, 0.18, 0xa08a66, 'mapBark');
  }
  return b;
}

// ── The harvest ─────────────────────────────────────────────────────────────

/** A stalk on top of a fruit (from y up `len`). */
function stalk(b: VoxelBuilder, y: number, len: number, thick: number, color: number): void {
  b.span(-thick / 2, y - 0.1, -thick / 2, thick / 2, y + len, thick / 2, color, 'mapBark');
}

/**
 * A plant's harvest (gardenWork.ts `FRUIT`: its size), its middle at the origin, +y up (the stalk on top); the
 * hanging kinds (canes, a banana bunch) from the fist on the stalk at the origin, along +z (up the plant), the bunch
 * below along −z.
 */
export function fruitBuilder(kind: PlantKindId, variety = 0): VoxelBuilder {
  const b = new VoxelBuilder();
  const { w, h } = FRUIT[kind];
  const eat = KINDS[kind].fruit.eat?.colors;
  switch (kind) {
    case 'eggplant': {
      if (variety === 1) {
        // (the long purple one, ត្រប់វែង: a glossy finger, a little curved, hanging from its green cap; its top where the round one's is)
        const LONG = 0x52205a;
        b.box(0, h / 2 - 0.15, 0, 1.25, 0.35, 1.25, 0x4e6e3c, 'mapLeaf', { ry: 0.4 });
        stalk(b, h / 2, 0.5, 0.26, 0x4e6e3c);
        rod(b, V(0, h / 2 - 0.1, 0), V(0, h / 2 - 2.2, 0.2), 1.25, 1.25, LONG, 'petal');
        rod(b, V(0, h / 2 - 2.1, 0.2), V(0, h / 2 - 3.7, 0.9), 1.12, 1.12, 0x461a4e, 'petal');
        rod(b, V(0.42, h / 2 - 0.6, 0.3), V(0.42, h / 2 - 1.9, 0.45), 0.35, 0.3, 0xa476b4, 'petal');
        return b;
      }
      // (the round green-and-white striped eggplant, ត្រប់ស្រួយ, as most of the garden's plants bear: models/eggplant.ts)
      const PALE = 0xeef6d4;
      const STRIPE = 0x4f8a3a;
      b.box(0, 0, 0, w, h * 0.9, w * 0.74, PALE, 'petal');
      b.box(0, -0.03, 0, w * 0.74, h * 0.86, w, STRIPE, 'petal');
      b.box(0, -0.04, 0, w * 0.9, h * 0.8, w * 0.9, 0xa6c690, 'petal', { ry: Math.PI / 4 });
      b.box(0, h * 0.45, 0, w * 0.72, 0.3, w * 0.72, 0x4e6e3c, 'mapLeaf', { ry: 0.4 });
      stalk(b, h * 0.5, 0.5, 0.26, 0x4e6e3c);
      return b;
    }
    case 'corn': {
      // (a ripe ear in its pale husk, its brown silk tuft, the yellow kernels at its tip: models/corn.ts)
      // (the kernels by its kind: white waxy, purple-and-white waxy, yellow; the purple one's husk tips purplish)
      const KERNEL = [[0xf2ecd4, 0xe8e2c4], [0x5e2a6c, 0xf0e8d6], [0xf2c43a, 0xe8b430]][Math.min(2, variety)];
      const HUSK = [0xc2c27a, 0xb2b66a, 0xa8b060];
      lump(b, 0, 0, 0, w, h - 0.4, w, HUSK, 'mapLeaf', 4211);
      for (let i = 0; i < 3; i++) b.box(Math.cos(i * 2.1) * w * 0.42, -0.2, Math.sin(i * 2.1) * w * 0.42, 0.3, h - 0.8, 0.5, variety === 1 && i === 1 ? 0xa48a84 : HUSK[2], 'mapLeaf', { ry: -i * 2.1, rz: 0.06 });
      b.box(0, h / 2 - 0.2, 0, w * 0.6, 0.5, w * 0.6, KERNEL[0], 'petal');
      b.box(0.15, h / 2 - 0.05, 0.12, w * 0.3, 0.3, w * 0.3, KERNEL[1], 'petal');
      b.box(0.1, h / 2 + 0.3, 0, 0.5, 0.7, 0.5, 0x6a4428, 'mapBark', { rz: 0.2 });
      stalk(b, -h / 2 - 0.5, 0.5, 0.55, 0x9a9a5a);
      return b;
    }
    case 'pumpkin': {
      // (a ribbed Khmer pumpkin: dull green blotched tan, a corky stalk: models/pumpkin.ts)
      const G = variety === 1 ? [0xd88e40, 0xe09c50] : [0x7a9458, 0x88985c];
      const BLOTCH = variety === 1 ? 0xecb868 : 0xdcaa5e;
      const n = 10;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        b.box(Math.cos(a) * w * 0.32, 0, Math.sin(a) * w * 0.32, w * 0.42, h * (i % 2 ? 0.9 : 0.96), w * 0.3, i % 3 === 0 ? BLOTCH : pick(G, r3(i, 1, 4221)), 'petal', { ry: -a });
      }
      b.box(0, 0, 0, w * 0.8, h, w * 0.8, G[0], 'petal');
      b.box(0, h * 0.46, 0, w * 0.42, h * 0.16, w * 0.42, 0xa8a05e, 'petal', { ry: 0.3 });
      stalk(b, h / 2 - 0.1, 0.9, 0.6, 0x8a7a52);
      return b;
    }
    case 'sugarcane': {
      // (two canes from below the fist up past it, purple with their waxy nodes, a few leaves left at the top)
      // (the purple chewing cane, or the yellow one: models/sugarcane.ts)
      const yellow = variety === 1;
      const C = [yellow ? 0xbcb65e : 0x7a3448, yellow ? 0x76603a : 0xc2b496, eat?.[2] ?? 0x6a9a3a];
      for (let i = 0; i < 2; i++) {
        const x = (i - 0.5) * 0.7;
        const y = (i - 0.5) * 0.3;
        b.span(x - 0.34, y - 0.34, -3, x + 0.34, y + 0.34, h - 3, i ? (yellow ? 0xc6bc66 : 0x86404e) : C[0], 'mapBark');
        for (let k = -2; k < h - 3; k += 2.6) b.span(x - 0.4, y - 0.4, k + i * 0.7 - 0.12, x + 0.4, y + 0.4, k + i * 0.7 + 0.12, C[1], 'mapBark');
        rod(b, V(x, y, h - 3), V(x + (i ? 1.5 : -1.2), y + 0.5, h - 0.5), 0.7, 0.12, C[2], 'mapLeaf');
      }
      return b;
    }
    case 'banana': {
      // (the bunch hangs from its stalk in his fist: hands of fingers round it curving up, the purple heart at its foot)
      const F = [0xe2c63e, 0xd8bf3a, 0xcabf46, 0xb8c040];
      b.span(-0.4, -0.4, -1.6, 0.4, 0.4, 1.4, 0x7a8a42, 'mapBark');
      b.span(-0.36, -0.36, -h - 1.4, 0.36, 0.36, -1.4, 0x6e7e3a, 'mapBark');
      const hands = 5;
      for (let k = 0; k < hands; k++) {
        const z = -2.0 - k * ((h - 1.2) / hands);
        const r = w / 2 - 0.3 - k * 0.12;
        const n = 7;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + k * 0.4;
          const from = V(Math.cos(a) * 0.5, Math.sin(a) * 0.5, z - 0.4);
          const to = V(Math.cos(a) * r, Math.sin(a) * r, z + 1.0);
          rod(b, from, to, 0.62, 0.62, pick(F, r3(i, k, 4231)), 'petal');
          b.box(to.x, to.y, to.z + 0.35, 0.3, 0.3, 0.3, 0x5a4a2a, 'mapBark');
        }
      }
      lump(b, 0, 0, -h - 1.9, 1.3, 1.3, 1.9, [0x7a2a40, 0x6a2236, 0x8a3448], 'petal', 4233);
      return b;
    }
    case 'papaya': {
      // (yellow-orange from the bottom, green at its shoulders: models/papaya.ts)
      const C = [0xe8a832, 0xeeb43a, 0x9aa83a];
      lump(b, 0, -0.2, 0, w, h - 0.4, w, [C[1], C[0], C[1]], 'petal', 4241);
      b.box(0, h / 2 - 0.55, 0, w * 0.75, 0.7, w * 0.75, 0xb8ac3a, 'petal');
      b.box(0.4, 0.2, w * 0.38, 0.8, 1.6, 0.3, C[2], 'petal', { shade: 0.95 });
      stalk(b, h / 2 - 0.25, 0.45, 0.4, 0x7a8a42);
      return b;
    }
    case 'guava': {
      // (pale yellow-green, its dark crown at the bottom: models/guava.ts)
      const C = [0xdedc7c, 0xe8e48a, 0xd2d472];
      lump(b, 0, 0, 0, w, h, w, [C[0], C[1], C[2]], 'petal', 4251);
      b.box(0, -h / 2 + 0.05, 0, 0.5, 0.2, 0.5, 0x4a4228, 'mapBark');
      stalk(b, h / 2 - 0.1, 0.4, 0.2, 0x6a7a3a);
      return b;
    }
    case 'mango': {
      // (a Khmer mango: kidney-shaped, gold with a green shoulder and a blush)
      const C = eat ?? [0xf2c23a, 0xe8a830, 0x9ab43a];
      lump(b, 0, -0.1, 0, w, h - 0.2, w * 0.86, [C[0], C[0], C[1]], 'petal', 4261);
      b.box(-0.2, -h / 2 + 0.35, 0, w * 0.6, 0.55, w * 0.6, C[0], 'petal', { rz: 0.3 });
      b.box(0.1, h / 2 - 0.4, 0, w * 0.7, 0.5, w * 0.62, C[2], 'petal');
      stalk(b, h / 2 - 0.2, 0.45, 0.22, 0x6a5a3a);
      return b;
    }
    case 'jackfruit': {
      // (a huge jackfruit: green-yellow, studded all over, its thick stalk)
      // (models/jackfruit.ts: its ripe body, the darker knobs)
      const C = [0xa8a04a, 0x9e9644, 0xb0a650];
      lump(b, 0, 0, 0, w, h, w * 0.95, C, 'petal', 4271);
      // (rounder: the corners cut by a turned lump; studded all over with its little bumps)
      b.box(0, 0, 0, w * 0.82, h * 0.9, w * 0.82, C[1], 'petal', { ry: Math.PI / 4 });
      b.box(0, 0, 0, w * 0.68, h * 1.02, w * 0.68, C[0], 'petal', { ry: Math.PI / 4 });
      const n = 96;
      for (let i = 0; i < n; i++) {
        const y = 1 - (2 * (i + 0.5)) / n;
        const rr = Math.sqrt(1 - y * y);
        const a = i * 2.39996;
        const p = V(Math.cos(a) * rr * w * 0.52, y * h * 0.5, Math.sin(a) * rr * w * 0.5);
        rod(b, p.clone().multiplyScalar(0.94), p.clone().multiplyScalar(1.05), 0.55, 0.55, pick([0x7e7432, 0x8c8438, 0x969040], r3(i, 1, 4272)), 'petal');
      }
      stalk(b, h / 2 - 0.2, 1.0, 0.7, 0x5a5a30);
      return b;
    }
    case 'durian': {
      // (olive green, spiky all over, a stout woody stalk)
      // (models/durian.ts: its ripe green-brown, the dark spikes)
      const C = [0xae9a42, 0xb6a24a, 0xa4903c];
      lump(b, 0, 0, 0, w, h, w * 0.96, C, 'petal', 4281);
      const n = 54;
      for (let i = 0; i < n; i++) {
        const y = 1 - (2 * (i + 0.5)) / n;
        const rr = Math.sqrt(1 - y * y);
        const a = i * 2.39996;
        const p = V(Math.cos(a) * rr * w * 0.52, y * h * 0.5, Math.sin(a) * rr * w * 0.5);
        rod(b, p.clone().multiplyScalar(0.95), p.clone().multiplyScalar(1.22), 0.6, 0.6, pick([0x7a6a30, 0x86763a, 0x6a5a28], r3(i, 1, 4282)), 'petal');
        rod(b, p.clone().multiplyScalar(1.18), p.clone().multiplyScalar(1.3), 0.3, 0.3, 0x5a4c22, 'petal');
      }
      stalk(b, h / 2 - 0.1, 1.0, 0.5, 0x6a5a3a);
      return b;
    }
    case 'coconut': {
      // (a fallen ripe coconut: its husk gone brown (models/_palmKit.ts NUT_RIPE), a turning patch, the cap of sepals on top)
      lump(b, 0, 0, 0, w, h, w * 0.86, [0x7b5b37, 0x86643c, 0x6f5232], 'petal', 4291);
      b.box(0.5, -0.4, w * 0.36, 1.4, 1.4, 0.4, 0xa8923a, 'petal', { ry: 0.4 });
      b.box(0, h / 2 - 0.1, 0, 1.3, 0.45, 1.3, 0x7a6a3a, 'mapBark');
      b.box(0, h / 2 - 0.05, 0, 1.3, 0.4, 1.3, 0x6a5a32, 'mapBark', { ry: Math.PI / 4 });
      return b;
    }
    case 'sugarPalm': {
      // (a sugar palm fruit: round, almost black, glossy; its cap of pale sepals)
      // (models/_palmKit.ts PALM_FRUIT, FRUIT_CAP)
      const C = [0x2c2228, 0x36282f, 0x3e2d33];
      lump(b, 0, 0, 0, w, h, w, C, 'petal', 4301);
      b.box(0, h / 2 - 0.1, 0, w * 0.48, 0.36, w * 0.48, 0x6e6a3a, 'petal');
      for (let i = 0; i < 3; i++) b.box(Math.cos(i * 2.1) * 0.6, h / 2 - 0.3, Math.sin(i * 2.1) * 0.6, 0.6, 0.3, 0.5, 0x7a7040, 'petal', { ry: -i * 2.1 });
      return b;
    }
    default:
      lump(b, 0, 0, 0, w, h, w, [0x6a9a3a], 'petal', 4311);
      return b;
  }
}

// ── Water ───────────────────────────────────────────────────────────────────

/** Drops in the air at most (the pour's streams, the drips): instances moved each frame. */
const DROPS = 24;
const WATER = [0xd8eef4, 0xc4e2ec];
function dropsBuilder(): VoxelBuilder {
  const b = new VoxelBuilder();
  for (let i = 0; i < DROPS; i++) b.box(0, -1000, 0, 0.3, 0.6, 0.3, pick(WATER, r3(i, 1, 4401)), 'lens');
  return b;
}
/** Gravity (BU / s²) on the map (1 BU = 7.35 cm). */
const G = 9.8 / 0.0735;

// ── In his hands ────────────────────────────────────────────────────────────

type Side = 'L' | 'R';

const _m = new Matrix4();
const _m2 = new Matrix4();
const _p = new Vector3();
const _s = new Vector3();
const _d = new Vector3();
const _rose = new Vector3();
const _q2 = new Quaternion();
const ONE = new Vector3(1, 1, 1);
const DROP_SIZE = new Vector3(0.3, 0.62, 0.3);
const _gb = new Vector3();

/** A release frame's number (with the hand: × 2, + 1 the left). */
const RELEASE_KEY: Record<GardenProp, number> = { hoe: 0, can: 1, knife: 2, pole: 3, seed: 4, cutting: 5, pup: 6, seedling: 7, fruit: 8, stick: 9, basket: 10 };

/** A grip's inverse: the item's frame in the fist's (put the item in the hand by it). */
function itemInFist(g: Grip, out: Matrix4): Matrix4 {
  _p.set(...g.x);
  _s.set(...g.y);
  _d.crossVectors(_p, _s);
  out.makeBasis(_p, _s, _d).setPosition(g.at[0], g.at[1], g.at[2]);
  return out.invert();
}

/**
 * A plant's variety from its seed (`PlantLook.seed`, garden/state.ts), by the same rule as its model, so the fruit
 * in his hand is the plant's own: the eggplant round and striped or long and purple (models/eggplant.ts), the corn
 * white, purple-and-white or yellow (corn.ts), the pumpkin green or tan (pumpkin.ts), the cane purple or yellow
 * (sugarcane.ts). 0 for the rest (one look), and for no seed (the commonest look).
 */
export function fruitVariety(kind: PlantKindId | null, seed: number | null): number {
  if (seed === null || !kind) return 0;
  // (models/_crop.ts `rng(look, salt)(0, 1)`)
  const r = (salt: number) => hash3(0, 1, Math.round(seed * 99991), salt);
  switch (kind) {
    case 'eggplant':
      return r(31) < 0.3 ? 1 : 0;
    case 'corn': {
      const k = r(47);
      return k < 0.45 ? 0 : k < 0.7 ? 1 : 2;
    }
    case 'pumpkin':
      return r(59) < 0.45 ? 1 : 0;
    case 'sugarcane':
      return r(71) < 0.5 ? 0 : 1;
    default:
      return 0;
  }
}

type Keys = { fruit: string; bag: string; ball: string; seed: string; inBasket: string };
/** Each kind's (and variety's) keys of its things (made once: no string is made per frame). */
const KEYS_OF = new Map<string | null, Keys>();
const KEYS_BY: Partial<Record<PlantKindId | 'null', Keys[]>> = {};
function keysOf(kind: PlantKindId | null, v = 0): Keys {
  const list = (KEYS_BY[kind ?? 'null'] ??= []);
  let k = list[v];
  if (!k) {
    const f = kind ?? 'mango';
    k = { fruit: `fruit:${f}:${v}`, bag: `bag:${kind}`, ball: `ball:${kind}`, seed: `seed:${kind}`, inBasket: `fruit:${f}:${v}:in` };
    list[v] = k;
  }
  return k;
}
void KEYS_OF;
const TEAR = gardenBeat('plantTree', 'tear');

/** What a prop is built as (its kind's fruit, the bag or the root ball, a crop's or a tree's stick). */
function variant(p: GardenProp | 'tornBag' | 'basketGround', kind: PlantKindId | null, action: GardenAction, t: number, v = 0): string {
  switch (p) {
    case 'fruit':
      return keysOf(kind, v).fruit;
    case 'seedling':
      return action === 'plantTree' && t >= TEAR ? keysOf(kind).ball : keysOf(kind).bag;
    case 'stick':
      return kind && KINDS[kind].size === 'tree' ? 'stick:tree' : 'stick:crop';
    case 'seed':
      return keysOf(kind).seed;
    default:
      return p;
  }
}

/**
 * His hands while he works in the garden (roam/_gardenWork.ts and roam/_bodhi*.ts use it): puts the props of
 * map/garden/actions.ts `ACTIONS[action].right / left` in his hands at their moments (`explorer.rig.setSlotObject`;
 * a thing in both hands is one, on his right), moves what moves (the water running from the can's rose while it
 * pours, the drips as the can comes out of the jar, the pole sliding through his hands as he lowers it), sets
 * down what he puts down beside him (the hoe, the torn bag, the cut canes or bunch, the pole; the dead plant
 * thrown on the heap; the seedling, cutting or pup waiting until he takes it; the basket when his hands are
 * full, the harvest in it), shapes his hands (a fist on a handle, flat palms patting the earth), and takes it
 * all away (`clear`, or `update(null…)`). Everything is built the first time it is needed and kept.
 */
export class GardenHands {
  /** The work's place (BU, his space; as `GardenBody.spot`): set it before `update` (the pole's length, where things wait). */
  readonly spot = new Vector3();
  private spotSet = false;
  private readonly meshes = new Map<string, Group>();
  private readonly holder: Record<Side, Group> = { L: new Group(), R: new Group() };
  private readonly inHand: Record<Side, string> = { L: '', R: '' };
  /** Things on the ground (his root's space: BU, y = 0 the ground under him), by name. */
  private readonly ground = new Group();
  private readonly onGround = new Map<string, Group>();
  private readonly hand: Record<Side, HandPose | null> = { L: null, R: null };
  private drops: InstancedMesh | null = null;
  private dropsGroup: Group | null = null;
  private readonly body: GardenBody = gardenBody('plant');
  /** Release frames worked out from the pose (by action, kind, spot): where each thing was let go. */
  private readonly released = new Map<number, Matrix4>();
  /** What the release frames were worked out for (the action, the kind, the spot). */
  private readonly relFor = { action: '' as GardenAction | '', kind: null as PlantKindId | null, spot: new Vector3(Infinity, 0, 0) };
  private active = false;

  constructor(readonly explorer: AngkorExplorer) {
    this.holder.L.name = 'garden:handL';
    this.holder.R.name = 'garden:handR';
    this.ground.name = 'garden:ground';
  }

  /** The plant's variety (fruitVariety: from its seed), for the fruit in his hand. */
  private variety = 0;
  private seedOf: number | null = null;
  private kindOf: PlantKindId | null = null;
  /** The plant's own seed (`Plant.seed`, `PlantLook.seed`), or null (none: a new planting, filling): its fruit's look. */
  setSeed(seed: number | null, kind: PlantKindId | null): void {
    if (seed === this.seedOf && kind === this.kindOf) return;
    this.seedOf = seed;
    this.kindOf = kind;
    this.variety = fruitVariety(kind, seed);
  }

  /** The work's place for the next updates (BU, his space). */
  setSpot(spot: Vector3): void {
    this.spot.copy(spot);
    this.spotSet = true;
  }

  private mesh(key: string, kind: PlantKindId | null): Group {
    let g = this.meshes.get(key);
    if (g) return g;
    const [what, k, vv] = key.split(':') as [string, string | undefined, string | undefined];
    const kk = ((k && k !== 'null' && k in KINDS ? k : kind) ?? null) as PlantKindId | null;
    let b: VoxelBuilder;
    switch (what) {
      case 'hoe':
        b = hoeBuilder();
        break;
      case 'can':
        b = canBuilder();
        break;
      case 'knife':
        b = knifeBuilder();
        break;
      case 'basket':
      case 'basketGround':
        b = basketBuilder();
        break;
      case 'seed':
        b = seedBuilder(kk);
        break;
      case 'cutting':
        b = cuttingBuilder();
        break;
      case 'pup':
        b = pupBuilder();
        break;
      case 'bag':
        b = seedlingBuilder(kk, true);
        break;
      case 'ball':
        b = seedlingBuilder(kk, false);
        break;
      case 'tornBag':
        b = tornBagBuilder();
        break;
      case 'stick':
        b = stickBuilder(k === 'tree' as string);
        break;
      case 'fruit':
        b = fruitBuilder(kk ?? 'mango', Number(vv) || 0);
        break;
      case 'pole': {
        // (the shaft stretched to the work's length, the head at its top)
        g = new Group();
        g.name = 'garden:pole';
        const shaft = buildVoxelMesh(poleShaftBuilder(), { quality: this.explorer.rig.quality, name: 'garden:poleShaft', castShadow: true });
        shaft.name = 'shaft';
        const head = buildVoxelMesh(poleHeadBuilder(), { quality: this.explorer.rig.quality, name: 'garden:poleHead', castShadow: true });
        head.name = 'head';
        g.add(shaft, head);
        this.meshes.set(key, g);
        return g;
      }
      default:
        b = new VoxelBuilder();
    }
    g = buildVoxelMesh(b, { quality: this.explorer.rig.quality, name: `garden:${key}`, castShadow: true });
    g.matrixAutoUpdate = false;
    if (what === 'hoe') {
      // (the earth on its blade from the first stroke on)
      const soil = buildVoxelMesh(hoeSoilBuilder(), { quality: this.explorer.rig.quality, name: 'garden:hoeSoil', castShadow: false });
      soil.name = 'soil';
      soil.visible = false;
      g.add(soil);
    }
    this.meshes.set(key, g);
    return g;
  }

  /**
   * Each step while he works: the action (null: none), seconds into it, the plant's kind (its seed, its fruit), and
   * where the work is (BU, his space: the posture's `GardenBody.spot`; the pole's length, where things wait and lie),
   * and the plant's seed (`Plant.seed`: its variety, so the fruit in his hand is its own; null or left out: none).
   */
  update(action: GardenAction | null, t: number, kind: PlantKindId | null, spot?: Vector3, seed?: number | null): void {
    if (!action) {
      this.clear();
      return;
    }
    if (spot) this.setSpot(spot);
    if (seed !== undefined) this.setSeed(seed, kind);
    else if (kind !== this.kindOf) this.setSeed(null, kind);
    const rig = this.explorer.rig;
    if (!this.active) {
      this.active = true;
      rig.setSlotObject('gardenL', 'propL', this.holder.L);
      rig.setSlotObject('gardenR', 'propR', this.holder.R);
      rig.joints.root.add(this.ground);
    }
    const sp = this.spotSet ? this.spot : defaultGardenSpot(action);
    const body = this.body;
    body.action = action;
    body.t = t;
    body.kind = kind;
    body.spot.copy(sp);
    const rf = this.relFor;
    if (rf.action !== action || rf.kind !== kind || rf.spot.distanceToSquared(sp) > 1e-4) {
      rf.action = action;
      rf.kind = kind;
      rf.spot.copy(sp);
      this.released.clear();
    }
    // In his hands: one thing in both is on his right.
    const R = gardenHeld(action, t, kind, 'R');
    const L = gardenHeld(action, t, kind, 'L');
    this.put('R', R, kind, action, t, sp);
    this.put('L', L !== R ? L : null, kind, action, t, sp);
    this.placeGround(action, t, kind, sp);
    this.water(action, t);
    this.shapeHands(action, t, kind, R, L);
  }

  private put(side: Side, p: GardenProp | null, kind: PlantKindId | null, action: GardenAction, t: number, sp: Vector3): void {
    const h = this.holder[side];
    const key = p ? variant(p, kind, action, t, this.variety) : '';
    if (this.inHand[side] !== key) {
      h.clear();
      this.inHand[side] = key;
      if (p) h.add(this.mesh(key, kind));
    }
    if (!p) return;
    const g = h.children[0] as Group;
    if (p === 'hoe') g.getObjectByName('soil')!.visible = t >= gardenBeat(action, 'chop') + 0.05;
    const grip = gardenGrip(p, kind, side, action, t, sp);
    if (!grip) return;
    if (p === 'pole') {
      // (the shaft as long as the work needs; the fist where the pose has it on the pole)
      const len = gardenPoleLength(sp);
      g.position.set(-grip.at[0], -grip.at[1], -grip.at[2]);
      const shaft = g.getObjectByName('shaft')!;
      shaft.scale.set(1, 1, len / POLE_BUILT);
      g.getObjectByName('head')!.position.set(0, 0, len);
      // (the fruit in the pole's basket from the take until it goes in his basket)
      const take = gardenBeat('pickPole', 'take');
      const head = g.getObjectByName('head')!;
      const f = this.mesh(keysOf(kind, this.variety).fruit, kind);
      if (t >= take) {
        if (f.parent !== head) head.add(f);
        // (standing in the little basket, its stalk up the pole)
        f.matrix.makeRotationX(Math.PI / 2).setPosition(0, 0, 0.7 + FRUIT[kind ?? 'mango'].h / 2);
        f.matrixWorldNeedsUpdate = true;
      } else if (f.parent === head) head.remove(f);
      return;
    }
    itemInFist(grip, g.matrix);
    g.matrixWorldNeedsUpdate = true;
  }

  /** A thing on the ground (his root's space) at the frame `m`, shown (true) or put away. */
  private setGround(name: string, key: string, kind: PlantKindId | null, m: Matrix4 | null): void {
    let g = this.onGround.get(name);
    if (!m) {
      if (g) g.visible = false;
      return;
    }
    if (!g) {
      g = new Group();
      g.name = `garden:${name}`;
      g.matrixAutoUpdate = false;
      this.onGround.set(name, g);
      this.ground.add(g);
    }
    const mesh = this.mesh(key, kind);
    // (a mesh may be in a hand and on the ground at different times; one object, moved)
    if (mesh.parent !== g && !this.isHeld(key)) {
      g.clear();
      mesh.matrix.identity();
      g.add(mesh);
    }
    g.visible = !this.isHeld(key);
    g.matrix.copy(m);
    g.matrixWorldNeedsUpdate = true;
  }

  private isHeld(key: string): boolean {
    return this.inHand.L === key || this.inHand.R === key;
  }

  /** Where `prop` (in `side`) was let go at `at` s: the pose's frame of it then (his space), worked out once. */
  private releaseFrame(prop: GardenProp, side: Side, at: number): Matrix4 {
    const k = RELEASE_KEY[prop] * 2 + (side === 'L' ? 1 : 0);
    let m = this.released.get(k);
    if (m) return m;
    m = new Matrix4();
    const b = this.body;
    const t = b.t;
    b.t = at;
    gardenPose(b);
    gardenRelease(b, prop, side, m);
    b.t = t;
    this.released.set(k, m);
    return m;
  }

  private placeGround(action: GardenAction, t: number, kind: PlantKindId | null, sp: Vector3): void {
    const beat = (name: string) => gardenBeat(action, name);
    const len = ACTIONS[action].len;
    // The basket on the ground when his hands are full, the harvest in it once he has put it there.
    const basketGround = groundBasket(action, kind);
    const at = gardenGroundBasket(this.body, _gb);
    this.setGround('basketGround', 'basketGround', null, basketGround ? _m.makeRotationY(0.5).setPosition(at) : null);
    const into = beat('basket');
    const fk = keysOf(kind, this.variety).fruit;
    if (basketGround && t >= into && kind) {
      const k = Math.min(1, (t - into) / 0.18);
      // (from where it was let go, down into the basket: a big one sits up in its mouth)
      const big = bigFruit(kind) || action === 'pickGround';
      _p.copy(at).setY(big ? BASKET.h + FRUIT[kind].h * 0.12 : 1.0 + FRUIT[kind].h / 2);
      const from = action === 'pickPole' ? null : this.releaseFrame('fruit', 'R', into);
      if (from && k < 1) {
        _s.setFromMatrixPosition(from);
        _p.lerpVectors(_s, _p, k * k);
      }
      this.setGround('harvest', fk, kind, _m.makeRotationY(0.8).setPosition(_p));
    } else if (!basketGround && (action === 'pickLow' || action === 'pickReach') && t >= into && kind) {
      // (in the basket on his hip)
      this.setGround('harvest', fk, kind, null);
      this.inBasket(fk, kind, true);
    } else {
      this.setGround('harvest', fk, kind, null);
      if (kind) this.inBasket(fk, kind, false);
    }
    // Planting: what waits on the ground until he takes it; the hoe laid down; the torn bag.
    if (action === 'plant' || action === 'plantTree') {
      const form = kind ? KINDS[kind].form : action === 'plantTree' ? 'seedling' : 'seed';
      const takeAt = beat('kneel');
      if (form !== 'seed' && t < takeAt) {
        const key = form === 'seedling' ? keysOf(kind).bag : form;
        const at = _p.copy(sp).add(WAITING[form]);
        this.setGround('waiting', key, kind, _m.makeRotationY(0.3).setPosition(at.setY(0)));
      } else this.setGround('waiting', 'none', kind, null);
      const down = beat('hoeDown');
      if (t >= down) {
        _m2.identity();
        gardenItemNow(this.body, 'hoe', _m2);
        this.setGround('hoe', 'hoe', null, _m2);
      } else this.setGround('hoe', 'hoe', null, null);
      if (action === 'plantTree' && t >= beat('tear')) {
        // (dropped from his left hand as he tore it off; it falls to the ground there)
        const tear = beat('tear');
        const from = this.releaseFrame('seedling', 'L', tear + 0.12);
        _s.setFromMatrixPosition(from);
        const k = Math.min(1, (t - tear) / 0.3);
        _p.set(_s.x + 0.8, Math.max(0, _s.y - 1.5) * (1 - k * k), _s.z - 0.4);
        this.setGround('tornBag', 'tornBag', null, _m.makeRotationY(1.1).setPosition(_p));
      } else this.setGround('tornBag', 'tornBag', null, null);
    } else {
      this.setGround('waiting', 'none', kind, null);
      this.setGround('hoe', 'hoe', null, null);
      this.setGround('tornBag', 'tornBag', null, null);
    }
    // Cut canes or the bunch: laid down on his left (the pose lays them there).
    if (action === 'pickCut' && t >= into && kind) {
      this.setGround('cut', fk, kind, this.releaseFrame('fruit', 'L', into));
    } else this.setGround('cut', fk, kind, null);
    // The pole: let go low over the basket, it drops flat.
    if (action === 'pickPole' && t >= 3.4) {
      const from = this.releaseFrame('pole', 'R', 3.4);
      const k = Math.min(1, (t - 3.4) / 0.32);
      lieDown(from, k * k, POLE.r, _m);
      this.setGround('pole', 'pole', null, _m);
      const g = this.onGround.get('pole')!;
      const pole = g.children[0];
      if (pole) {
        const L = gardenPoleLength(sp);
        pole.position.set(0, 0, 0);
        pole.getObjectByName('shaft')!.scale.set(1, 1, L / POLE_BUILT);
        pole.getObjectByName('head')!.position.set(0, 0, L);
      }
    } else this.setGround('pole', 'pole', null, null);
    // The dead plant: thrown on the heap to his right.
    if (action === 'clear' && t >= beat('toss')) {
      const toss = beat('toss');
      const from = this.releaseFrame('stick', 'R', toss);
      const k = Math.min(1, (t - toss) / 0.45);
      const sk = variant('stick', kind, action, t, 0);
      // (an arc from his hands to the heap, turning over to lie on its side)
      _s.setFromMatrixPosition(from);
      _p.lerpVectors(_s, gardenStickHeap(this.body, _gb), k);
      _p.y = (1 - k) * _s.y + 4.0 * Math.sin(Math.PI * k) + k * 0.8;
      _q.setFromRotationMatrix(from);
      _q2.setFromEuler(_e.set(0.2, 2.2, Math.PI / 2 - 0.1));
      _q.slerp(_q2, k);
      this.setGround('stick', sk, kind, _m.compose(_p, _q, ONE));
    } else this.setGround('stick', 'stick:crop', kind, null);
    void len;
  }

  /** The harvest shown in the basket on his hip (or not). */
  private inBasket(key: string, kind: PlantKindId, on: boolean): void {
    const basket = this.meshes.get('basket');
    if (!basket) return;
    let f = basket.getObjectByName('garden:inBasket') as Group | undefined;
    if (!on) {
      if (f) f.visible = false;
      return;
    }
    if (!f || f.userData.key !== key) {
      if (f) basket.remove(f);
      f = new Group();
      f.name = 'garden:inBasket';
      f.userData.key = key;
      // (a copy's worth: the fruit's own mesh may be in his hand at another moment; a second build, kept)
      const inside = this.mesh(keysOf(kind, this.variety).inBasket, kind);
      inside.matrix.makeTranslation(0.3, 0.6 + FRUIT[kind].h / 2, 0.2).multiply(_m2.makeRotationZ(1.2));
      inside.matrixWorldNeedsUpdate = true;
      f.add(inside);
      basket.add(f);
    }
    f.visible = true;
  }

  /** The water from the can's rose while it pours; drips as it comes out of the jar. */
  private water(action: GardenAction, t: number): void {
    const pour = action === 'water' ? ACTIONS.water : null;
    const lift = action === 'fill' ? gardenBeat('fill', 'lift') : 0;
    const flowing = pour ? t >= pour.loop!.from && t <= pour.loop!.to + 0.1 : false;
    const dripping = action === 'fill' && t >= lift - 0.1 && t <= ACTIONS.fill.len + 0.4;
    if (!flowing && !dripping) {
      if (this.drops) this.drops.count = 0;
      return;
    }
    const can = this.holder.R.children[0];
    if (!can) return;
    if (!this.drops) {
      this.dropsGroup = buildVoxelMesh(dropsBuilder(), { quality: this.explorer.rig.quality, name: 'garden:drops', castShadow: false });
      this.drops = this.dropsGroup.children.find((c) => (c as InstancedMesh).isInstancedMesh) as InstancedMesh;
      this.drops.frustumCulled = false;
      this.ground.add(this.dropsGroup);
    }
    // The rose's place and the spout's way, in his root's space.
    this.ground.updateWorldMatrix(true, false);
    can.updateWorldMatrix(true, false);
    _m.copy(this.ground.matrixWorld).invert().multiply(can.matrixWorld);
    const d = this.drops;
    let n = 0;
    if (flowing) {
      _rose.copy(CAN_ROSE).applyMatrix4(_m);
      _d.set(0, Math.sin(CAN.spoutUp), Math.cos(CAN.spoutUp)).transformDirection(_m);
      const on = Math.min(1, (t - pour!.loop!.from) / 0.12) * (1 - Math.max(0, Math.min(1, (t - pour!.loop!.to) / 0.1)));
      // (three thin streams out of the rose, each a run of drops falling to the earth)
      const speed = 12;
      const per = Math.floor(DROPS / 3);
      for (let s = 0; s < 3; s++)
        for (let i = 0; i < per; i++) {
          const u = (((t * 2.6 + i / per + s * 0.31) % 1) + 1) % 1;
          const tt = u * 0.34 * on;
          _p.copy(_rose).addScaledVector(_d, speed * tt);
          _p.x += (s - 1) * 0.45 * (1 + tt * 3) + (r3(i, s, 4411) - 0.5) * 0.3;
          _p.z += (r3(i, s, 4412) - 0.5) * 0.4 * (1 + tt * 3);
          _p.y -= 0.5 * G * tt * tt;
          if (_p.y < 0.1 || on <= 0) continue;
          _m2.compose(_p, _q2.identity(), DROP_SIZE);
          d.setMatrixAt(n++, _m2);
        }
    } else {
      // (drips off the can's bottom and spout as it comes up out of the water)
      const k = 1 - Math.max(0, Math.min(1, (t - lift - 0.3) / 0.8));
      for (let i = 0; i < 8; i++) {
        const u = (((t * 1.7 + i * 0.37) % 1) + 1) % 1;
        if (r3(i, 9, 4413) > k) continue;
        _p.set((r3(i, 1, 4414) - 0.5) * CAN.w * 0.8, 0.1, (r3(i, 2, 4414) - 0.5) * CAN.d * 0.8);
        if (i % 4 === 0) _p.copy(CAN_ROSE);
        _p.applyMatrix4(_m);
        _p.y -= 0.5 * G * (u * 0.3) * (u * 0.3);
        if (_p.y < 0) continue;
        _m2.compose(_p, _q2.identity(), DROP_SIZE);
        d.setMatrixAt(n++, _m2);
      }
    }
    d.count = n;
    d.instanceMatrix.needsUpdate = true;
  }

  /** His hands' shapes: a fist round what he holds or grips, flat palms on the earth and under the spout, else relaxed. */
  private shapeHands(action: GardenAction, t: number, kind: PlantKindId | null, R: GardenProp | null, L: GardenProp | null): void {
    const b = (name: string) => gardenBeat(action, name);
    const patting = (action === 'plant' || action === 'plantTree') && t >= b('set') + 0.1 && t < b('up');
    let r: HandPose = R ? 'holding' : 'relaxed';
    let l: HandPose = L ? 'holding' : 'relaxed';
    if (patting) r = l = 'open';
    if (action === 'water' && !L && t > b('tip') - 0.3 && t < b('stop') + 0.3) l = 'open';
    if ((action === 'pickLow' || action === 'pickReach') && t >= b('grip') - 0.1 && t < b('take')) r = 'holding';
    if (bigFruit(kind) && (action === 'pickLow' || action === 'pickReach' || action === 'pickGround') && R) r = l = 'open';
    if (action === 'pickGround' && R) r = l = 'open';
    if (action === 'pickCut' && t >= 0.3 && t < b('take')) l = 'holding';
    if (action === 'clear' && t >= b('grip') - 0.1 && t < b('toss')) r = l = 'holding';
    if (action === 'plantTree' && R === 'seedling') r = l = 'open';
    this.setHand('R', r);
    this.setHand('L', l);
  }

  private setHand(side: Side, pose: HandPose): void {
    if (this.hand[side] === pose) return;
    this.hand[side] = pose;
    this.explorer.setHandPose(side, pose);
  }

  /** Take everything out of his hands (the work stopped). */
  clear(): void {
    // (the next work's plant says its own seed)
    this.seedOf = this.kindOf = null;
    this.variety = 0;
    if (!this.active) return;
    this.active = false;
    const rig = this.explorer.rig;
    rig.clearSlot('gardenL');
    rig.clearSlot('gardenR');
    this.holder.L.clear();
    this.holder.R.clear();
    this.inHand.L = this.inHand.R = '';
    this.ground.removeFromParent();
    for (const g of this.onGround.values()) g.visible = false;
    if (this.drops) this.drops.count = 0;
    this.spotSet = false;
    // (his hands as they were: relaxed, the left round his light if he carries one)
    if (this.hand.R) this.explorer.setHandPose('R', 'relaxed');
    if (this.hand.L) this.explorer.setHandPose('L', this.explorer.currentOutfit.held === 'none' ? 'relaxed' : 'holding');
    this.hand.L = this.hand.R = null;
  }

  /** Free everything built (the add-on stops for good). */
  dispose(): void {
    this.clear();
    for (const g of this.meshes.values()) g.traverse((o) => (o as Group).isGroup && o.children.some((c) => (c as InstancedMesh).isInstancedMesh) && disposeVoxelMesh(o as Group));
    this.meshes.clear();
    if (this.dropsGroup) disposeVoxelMesh(this.dropsGroup);
    this.drops = null;
    this.dropsGroup = null;
  }
}

/** A frame let fall flat onto the ground (`k` 0 as it was ‥ 1 lying): its +z kept level on its way, `r` its half thickness. */
function lieDown(from: Matrix4, k: number, r: number, out: Matrix4): Matrix4 {
  _p.setFromMatrixPosition(from);
  _d.set(0, 0, 1).transformDirection(from);
  const yaw = Math.atan2(_d.x, _d.z);
  _q.setFromRotationMatrix(from);
  _q2.setFromEuler(_e.set(-0.02, yaw, 0, 'YXZ'));
  _q.slerp(_q2, k);
  _p.y = _p.y * (1 - k) + r * k;
  return out.compose(_p, _q, ONE);
}
