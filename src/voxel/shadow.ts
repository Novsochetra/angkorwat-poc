import { MeshDepthMaterial } from 'three';
import { injectVoxelVertex, VOXEL_MATERIALS, voxelPatternOf, type VoxelMaterialKey, type VoxelMaterialSpec } from './materials';

const cache = new Map<VoxelMaterialKey, MeshDepthMaterial>();

/**
 * Shadow caster of a voxel family (`mesh.customDepthMaterial`). Three's own
 * depth material draws every instance as the plain unit box scaled by its
 * matrix; this one runs the same vertex re-bevel as the drawn block, so a
 * shadow has the block's chamfers, squared joints and merged sides. Without it
 * a stone's square box shades the lit chamfer strips of its neighbours, and
 * the shadow lines don't follow the cuts you see.
 */
export function getVoxelDepthMaterial(key: VoxelMaterialKey): MeshDepthMaterial {
  const hit = cache.get(key);
  if (hit) return hit;
  const spec: VoxelMaterialSpec = VOXEL_MATERIALS[key];
  const pattern = voxelPatternOf(key) !== undefined;
  const m = new MeshDepthMaterial();
  // (the vertex code only asks whether a family is patterned: it then reads the merge mask)
  if (pattern) m.defines = { VOX_PAT: '' };
  m.onBeforeCompile = (shader) => injectVoxelVertex(shader, spec);
  m.customProgramCacheKey = () => `voxel-depth-v1${pattern ? ':pat' : ''}`;
  m.name = `voxel-depth:${key}`;
  cache.set(key, m);
  return m;
}
