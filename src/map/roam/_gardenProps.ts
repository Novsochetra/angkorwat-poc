import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { GardenProp } from '../garden/actions';
import type { PlantKindId } from '../garden/kinds';

/**
 * What he holds in his garden (roam/_gardenWork.ts puts them in his hands by
 * map/garden/actions.ts `ACTIONS[…].right / left`): the hoe, the watering can,
 * his knife, the bamboo picking pole, the seed / cutting / pup / bagged
 * seedling, the fruit of a kind, a dead plant's stick, his basket.
 *
 * STUB (the core's): plain boxes. The props' owner fills it; the API stays.
 * Body units, the origin in the middle of the fist (as his lantern and torch,
 * character/parts/props.ts; roam/_farmProps.ts).
 */
export function gardenPropBuilder(p: GardenProp, kind: PlantKindId | null): VoxelBuilder {
  void kind;
  const b = new VoxelBuilder();
  b.box(0, 0, 0, 0.6, 0.6, 0.6, p === 'can' ? 0x9aa0a4 : p === 'fruit' ? 0xd8a030 : 0x7a5a3a, 'wood');
  return b;
}
