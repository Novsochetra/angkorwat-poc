import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { kitBoxes } from '../veg/kitBoxes';
import type { RigDef } from './_things';

/**
 * The plant kit's shapes (veg/plantKit.ts, veg/produce.ts) in a rig of the
 * people's things (`_things.ts`): goods that come and go with their seller
 * (the Kulen stall's fruit, a family's picnic, the floating market's fruit
 * boat). `draw` lays the shapes into a builder in rig space (feet on y = 0, +z
 * its front, as the rig); each of their blocks becomes one of the rig's boxes,
 * turned as the block was (veg/kitBoxes.ts) and its shade folded into its
 * colour. The things are one instanced mesh with no material families, so the
 * kit's `mat` is dropped. Returns how many boxes it added (they count against
 * the things' capacity, `THINGS` in people/index.ts, and are drawn wherever
 * the things are: keep them few).
 */
export function kitInRig(d: RigDef, draw: (b: VoxelBuilder) => void, part = 0): number {
  const boxes = kitBoxes(draw);
  for (const k of boxes) d.box(k.c, k.s, k.color, { part, rot: k.rot });
  return boxes.length;
}
