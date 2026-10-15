import { Euler, Quaternion } from 'three';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { shade } from './_kinds';
import type { RigDef } from './_things';

/**
 * The plant kit's shapes (veg/plantKit.ts, veg/produce.ts) in a rig of the
 * people's things (`_things.ts`): goods that come and go with their seller
 * (the Kulen stall's fruit, a family's picnic). `draw` lays the shapes into a
 * builder in rig space (feet on y = 0, +z its front, as the rig); each of
 * their blocks becomes one of the rig's boxes, turned as the block was (the
 * kit's turns are XYZ, a rig box's YXZ) and its shade folded into its colour.
 * The things are one instanced mesh with no material families, so the kit's
 * `mat` is dropped. Returns how many boxes it added (they count against the
 * things' capacity, `THINGS` in people/index.ts).
 */
export function kitInRig(d: RigDef, draw: (b: VoxelBuilder) => void, part = 0): number {
  const b = new VoxelBuilder();
  draw(b);
  for (const k of b.boxes) {
    let rot: [number, number, number] | undefined;
    if (k.rx || k.ry || k.rz) {
      _q.setFromEuler(_e.set(k.rx ?? 0, k.ry ?? 0, k.rz ?? 0, 'XYZ'));
      _e.setFromQuaternion(_q, 'YXZ');
      rot = [_e.x, _e.y, _e.z];
    }
    d.box([k.x, k.y, k.z], [k.sx, k.sy, k.sz], k.shade !== 1 ? shade(k.color, k.shade) : k.color, { part, rot });
  }
  return b.boxes.length;
}

const _q = new Quaternion();
const _e = new Euler();
