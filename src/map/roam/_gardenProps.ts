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

/**
 * His hands while he works in the garden (roam/_gardenWork.ts and roam/_bodhi*.ts use it): puts the props of
 * map/garden/actions.ts `ACTIONS[action].right / left` in his hands at their moments (`explorer.rig.setSlot`), moves
 * what moves (the water running from the can's rose while it pours, the earth on the hoe…), and takes them away.
 *
 * STUB (the core's): does nothing yet; the props' owner fills it. The API stays.
 */
export class GardenHands {
  constructor(readonly explorer: import('../../character/AngkorExplorer').AngkorExplorer) {}
  /** Each step while he works: the action (null: none), seconds into it, the plant's kind (its seed, its fruit). */
  update(action: import('../garden/actions').GardenAction | null, t: number, kind: PlantKindId | null): void {
    void action;
    void t;
    void kind;
  }
  /** Take everything out of his hands (the work stopped). */
  clear(): void {}
}
