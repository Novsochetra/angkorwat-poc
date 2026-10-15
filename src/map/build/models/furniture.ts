import { traceSource, type SourceTrace } from '../../../feedback/sourceTrace';
import type { VoxelMaterialKey } from '../../../voxel/materials';
import { VoxelBuilder } from '../../../voxel/VoxelBuilder';
import { loom, mortar } from '../../hamlet/_evKit';
import { basket, cakeTray, PsFrame } from '../../hamlet/_psKit';
import { Local, mat, potPlant } from '../../village/_kit';
import { FURNITURE, HANG, type FurnitureId } from '../furniture';
import { registerPieceModel, type PieceModel } from '../pieces';
import { BAMBOO, OLD_BAMBOO, POST, rng, tone } from './_yardKit';

/**
 * Furniture and lanterns (AWP-23, build/furniture.ts): each the model the map
 * already draws, called from the village's own kit where it has one
 * (village/_kit.ts `mat`, `potPlant`; hamlet/_evKit.ts `loom`, `mortar`;
 * hamlet/_psKit.ts `basket`, `cakeTray`), the rest the same blocks as where
 * they stand on the map (his room's sleeping mat and window-sill lamp,
 * hamlet/_home.ts `inside`; the palm sugar shed's bench and lantern,
 * hamlet/_psHut.ts `bench`, `hanging`), set in a piece's frame (its middle on
 * the floor at (0, 0, 0), +z its front).
 *
 * The contract's block families only (build/pieces.ts): the kit's `metal` (the
 * teapot) is drawn `mapStone`, as the lamp post's tin and iron are, so no new
 * shader is compiled. Blocks in the order the kit puts them (the base first).
 */

/** Families the build view draws (build/pieces.ts "The model contract"): anything else of the kit's becomes `mapStone`. */
const OURS: ReadonlySet<VoxelMaterialKey> = new Set<VoxelMaterialKey>(['mapBark', 'mapLeaf', 'mapStone', 'petal', 'mapRock', 'mapGrass']);

/** The village kit's blocks drawn into `b` (its families made the contract's). */
function fromKit(b: VoxelBuilder, draw: (tmp: VoxelBuilder) => void): void {
  const tmp = new VoxelBuilder();
  draw(tmp);
  for (const x of tmp.boxes) b.boxes.push(OURS.has(x.mat) ? x : { ...x, mat: 'mapStone' });
}

/** A village kit frame for one piece (its seed: the kit's own random values). */
const local = (b: VoxelBuilder, seed: number, src: SourceTrace | undefined): Local => new Local(b, src, Math.round(seed * 9973) | 0);

const MODELS: Record<FurnitureId, PieceModel> = {
  // The sitting mat with its teapot and cups (village/_kit.ts `mat`, as on his veranda).
  teamat(b, look) {
    const src = traceSource();
    fromKit(b, (t) => mat(local(t, look.seed, src), 0, 0, 0));
  },

  // His room's sleeping mat (hamlet/_home.ts `inside`): reed, a red border and green bands, the pillow at its −x end, a krama folded at its foot.
  bedmat(b, look) {
    const src = traceSource();
    const r = rng(look.seed, 83);
    const x0 = -1.5;
    const x1 = 1.5;
    const z0 = -0.645;
    const z1 = 0.645;
    const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c: number) => b.box(x, y, z, sx, sy, sz, c, 'petal', { src });
    const span = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, c: number) => b.span(ax, ay, az, bx, by, bz, c, 'petal', { src });
    span(x0, 0, z0, x1, 0.035, z1, 0xd8c08a);
    for (let x = x0 + 0.3; x < x1 - 0.1; x += 0.6) span(x, 0.01, z0 + 0.12, x + 0.04, 0.04, z1 - 0.12, 0xb8a06a);
    for (const z of [z0 + 0.06, z1 - 0.06]) span(x0, 0.01, z - 0.05, x1, 0.045, z + 0.05, 0xb83a2e);
    for (const z of [z0 + 0.16, z1 - 0.16]) span(x0 + 0.1, 0.01, z - 0.025, x1 - 0.1, 0.045, z + 0.025, 0x2f7a4a);
    box(x0 + 0.32, 0.1, 0, 0.36, 0.14, 0.62, 0xf2ece0);
    box(x0 + 0.32, 0.17, 0, 0.3, 0.02, 0.56, r() < 0.5 ? 0xc8d8e8 : 0xe8c8c0);
    // (the krama folded at the foot: red, blue or green checks and white)
    const krama = tone([0xb8322c, 0x2f5ea8, 0x2f7a4a], r());
    for (let k = 0; k < 4; k++) box(x1 - 0.28, 0.06 + k * 0.025, -0.2 + (k % 2) * 0.02, 0.4, 0.024, 0.5, k % 2 ? 0xf0ece0 : krama);
  },

  // The palm sugar shed's bench (hamlet/_psHut.ts `bench`): bamboo slats on hardwood legs, at a seat's height for him; a clay jug and two cups at its +x end.
  bench(b, look) {
    const src = traceSource();
    const r = rng(look.seed, 89);
    const H = 0.5;
    const L = 0.9;
    for (const x of [-(L - 0.12), L - 0.12]) for (const dz of [-0.16, 0.16]) b.box(x, H / 2, dz, 0.07, H, 0.07, tone(POST, r()), 'mapBark', { src });
    // (a rail between the legs at each end, low)
    for (const x of [-(L - 0.12), L - 0.12]) b.box(x, 0.14, 0, 0.05, 0.05, 0.36, tone(OLD_BAMBOO, r()), 'mapBark', { src });
    for (let k = 0; k < 4; k++) b.span(-L, H - 0.04, -0.22 + k * 0.11, L, H + 0.02, -0.13 + k * 0.11, tone(BAMBOO, r()), 'mapBark', { src, shade: 0.95 });
    b.box(0.6, H + 0.14, -0.02, 0.2, 0.24, 0.2, 0x8a5a38, 'mapStone', { src });
    b.box(0.6, H + 0.29, -0.02, 0.1, 0.06, 0.1, 0x7a4e30, 'mapStone', { src });
    for (const dx of [0.3, 0.38]) b.box(dx, H + 0.06, 0.1 - (dx - 0.3) * 1.5, 0.08, 0.08, 0.08, 0xd8d0c0, 'mapStone', { src });
  },

  // The village's loom (hamlet/_evKit.ts `loom`), the weaver's bench toward +z.
  loom(b, look) {
    const src = traceSource();
    fromKit(b, (t) => loom(local(t, look.seed, src), 0, 0, -0.25));
  },

  // Two woven baskets (hamlet/_psKit.ts `basket`): rice heaped in one, a tray of palm sugar cakes on the other (`cakeTray`).
  baskets(b, look) {
    const src = traceSource();
    fromKit(b, (t) => {
      const seed = Math.round(look.seed * 97) | 0;
      const F = new PsFrame(t, 0, 0, 0, src, new Set(), false, 9171 + seed);
      basket(F, -0.36, 0, 0, 0.62, 0.5, seed);
      // (the rice: a white heap in its mouth)
      F.box(-0.36, 0.53, 0, 0.56, 0.06, 0.56, 0xf2eee2, 'mapStone', 1.04);
      F.box(-0.36, 0.58, 0, 0.36, 0.05, 0.36, 0xf6f2e8, 'mapStone', 1.06);
      basket(F, 0.38, 0, 0, 0.52, 0.4, seed + 1);
      cakeTray(F, 0.38, 0.43, 0, 0.56, 3, seed + 2);
    });
  },

  // A potted plant (village/_kit.ts `potPlant`), big or small by the seed.
  pot(b, look) {
    const src = traceSource();
    fromKit(b, (t) => potPlant(local(t, look.seed, src), 0, 0, 0, rng(look.seed, 97)() < 0.6));
  },

  // The rice mortar and its pestle (hamlet/_evKit.ts `mortar`).
  mortar(b, look) {
    const src = traceSource();
    fromKit(b, (t) => mortar(local(t, look.seed, src), -0.04, 0, 0));
  },

  // His window sill's oil lamp (hamlet/_home.ts `inside`): a glass chimney on a little tin base; its glass glows at dusk (build/view.ts `LIGHT`).
  oillamp(b, look) {
    const src = traceSource();
    const tin = tone([0x4a3a2a, 0x3a4a5a, 0x5a3a2a], rng(look.seed, 101)());
    b.box(0, 0.025, 0, 0.18, 0.05, 0.18, tin, 'mapStone', { src });
    b.box(0, 0.06, 0, 0.12, 0.02, 0.12, 0x2a2420, 'mapStone', { src });
    b.box(0, 0.15, 0, 0.1, 0.2, 0.1, 0xd8e0dc, 'mapStone', { src, shade: 0.9 });
    b.box(0, 0.255, 0, 0.07, 0.015, 0.07, tin, 'mapStone', { src });
  },

  // The palm sugar shed's lantern (hamlet/_psHut.ts `hanging`): a tin frame, the glass, its wire up to the hook (its cord to the roof: roam/_buildFurnCords.ts).
  hanglamp(b) {
    const src = traceSource();
    const y = HANG.glass;
    b.box(0, y - 0.14, 0, 0.22, 0.05, 0.22, 0x3e3830, 'mapStone', { src });
    for (const [dx, dz] of [
      [-0.09, -0.09],
      [0.09, -0.09],
      [-0.09, 0.09],
      [0.09, 0.09],
    ])
      b.box(dx, y, dz, 0.02, 0.26, 0.02, 0x2e2a28, 'mapStone', { src });
    b.box(0, y, 0, 0.12, 0.19, 0.12, 0xf2ead0, 'petal', { src, shade: 1.05 });
    b.box(0, y + 0.14, 0, 0.2, 0.04, 0.2, 0x3e3830, 'mapStone', { src });
    b.box(0, (y + 0.16 + HANG.hook) / 2, 0, 0.02, HANG.hook - y - 0.16, 0.02, 0x2e2a28, 'mapStone', { src });
    b.box(0, HANG.hook - 0.01, 0, 0.05, 0.02, 0.05, 0x2e2a28, 'mapStone', { src });
  },
};

for (const id of Object.keys(FURNITURE) as FurnitureId[]) registerPieceModel(id, MODELS[id]);
