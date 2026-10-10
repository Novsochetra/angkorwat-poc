import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { PlantKindId } from './kinds';
import type { PlantLook } from './state';

/**
 * How the garden's plants are drawn: one model per kind (garden/models/<kind>.ts),
 * each a function that builds the plant as it looks (`PlantLook`: its stage, fruit,
 * drooping, dead) in voxel blocks. The view (garden/view.ts) caches each look's
 * blocks and merges every plant into a few draws.
 *
 * **The model contract**:
 * - Local metres, real size (1 unit = 1 m; the explorer on the map is 2.4 m tall,
 *   roam/types.ts `ROAM_SCALE`): the plant's foot at (0, 0, 0) on the ground, y up,
 *   +z its front (the view turns it by the plant's `yaw` and sets it on the land).
 *   Grown sizes as `KINDS[kind].height` / `spread` (garden/kinds.ts).
 * - Only the map's own block families, so no new shader is compiled: `mapLeaf`
 *   (leaves, green stems, vines; they sway), `mapBark` (wood, trunks, canes, dead
 *   sticks), `petal` (fruit, flowers, seeds), `mapStone` (a stone, a pot), `mapGrass`
 *   / `mapRock` (earth; the dug bed itself is the view's, not the model's).
 * - Stage 0 is the seed, cutting, pup or bagged seedling just set in the earth
 *   (small but readable from 6 m: a twist of seed husk, the cutting's stub, the
 *   pup's first leaves); stages 1‥3 grow toward stage 4, grown. `fruit` 1 green,
 *   2 ripe (a crop's harvest, a tree's fruit); `fallen` ripe fruit lying round the
 *   foot (durian, coconut, sugar palm); `droop` 1 leaves hanging and paler, 2
 *   limp, yellow-brown, curling; `dead` a dry grey-brown stick or stump with a few
 *   brown leaves (nothing green).
 * - Block budget (grown, ripe): a crop ≤ 160 blocks, a small tree ≤ 450, a big
 *   tree or palm ≤ 900 (the whole garden: 40 crops and 12 trees). Fewer for the
 *   early stages. Seeded variety from `look.seed` (never Math.random: shots and
 *   bug reports must draw the same plant).
 * - Khmer, not Thai: the plants of a Cambodian home garden, as they really grow
 *   there (CLAUDE.md, docs/map-work/addons.md "His home garden").
 * - `build` must be quick (≤ 2 ms for a big tree): the view calls it once per look.
 */
export type PlantModel = (b: VoxelBuilder, look: PlantLook) => void;

const MODELS: Partial<Record<PlantKindId, PlantModel>> = {};

/** A kind's model module registers it (garden/models/index.ts imports them all). */
export function registerModel(kind: PlantKindId, m: PlantModel): void {
  MODELS[kind] = m;
}

/** Until its model is done: a green stick as tall as the stage, a ball of leaves, a red fruit. */
const placeholder: PlantModel = (b, l) => {
  const h = [0.15, 0.4, 0.9, 1.6, 2.2][l.stage];
  const leaf = l.dead ? 0x8a7458 : l.droop ? 0x9aa850 : 0x4e8a30;
  b.box(0, h / 2, 0, 0.1, h, 0.1, l.dead ? 0x6a5a48 : 0x5a7a3a, 'mapBark');
  if (l.stage > 0) b.box(0, h, 0, h * 0.6, h * 0.4, h * 0.6, leaf, 'mapLeaf');
  if (l.fruit) b.box(0.2, h * 0.8, 0.2, 0.18, 0.18, 0.18, l.fruit === 2 ? 0xd83a2a : 0x7aa040, 'petal');
};

/** Build a plant's look into `b` (its own model, or the placeholder). */
export function buildPlant(b: VoxelBuilder, look: PlantLook): void {
  (MODELS[look.kind] ?? placeholder)(b, look);
}

/** A plant's blocks on their own (local metres, foot at the origin). */
export function plantBlocks(look: PlantLook): VoxelBuilder {
  const b = new VoxelBuilder();
  buildPlant(b, look);
  return b;
}
