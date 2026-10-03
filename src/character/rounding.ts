import type { BufferAttribute, InstancedMesh, Object3D } from 'three';
import { VOXEL_MATERIALS, type VoxelMaterialKey, type VoxelMaterialSpec } from '../voxel/materials';
import { openSidesIndex, unitVoxelGeometry } from '../voxel/VoxelMesh';

/** A unit block's buffers (a mesh's own: as graphics.ts `reshape` keeps them, the same key, so either can put them back). */
type Shape = { index: BufferAttribute; position: BufferAttribute; normal: BufferAttribute };

/** What {@link roundBlocks} keeps on a mesh: its rounding radius, and its shape with fewer steps (for `steps`; null: its own). */
interface Rounded {
  radius: number;
  steps: number | null;
  fewer: Shape | null;
}

/**
 * The explorer's blocks rounded in at most `steps` steps (1: one chamfer with
 * smooth normals, 44 triangles a block, not 92), or as they were built
 * (`steps` null): the same instances, only each mesh's shared unit block
 * changes, as graphics.ts `reshape` does for the map's blocks (it keeps the
 * mesh's own shape in the same place, `voxelOwnShape`, so either puts it
 * back). Meshes built after the last call (an outfit, a tool, a face) are
 * set by the next one: call it every frame (a walk over his ≈ 150 objects).
 * A mesh whose unit block something else changed to a shape of its own (the
 * block look panel's edges) is left as it is.
 *
 * Returns the largest rounding radius of the blocks (body units, as the
 * shader rounds them: a block's own `radius`, at most 0.45 of its smallest
 * side, else its smallest side × the family's `bevel`), measured once a mesh.
 * `each` is called with every voxel mesh on the way.
 */
export function roundBlocks(root: Object3D, steps: number | null, each?: (mesh: InstancedMesh) => void): number {
  let radius = 0;
  root.traverse((o) => {
    const mesh = o as InstancedMesh;
    const shape = mesh.userData.voxelShape as { segments: number; flat: boolean } | undefined;
    if (!mesh.isInstancedMesh || !shape) return;
    each?.(mesh);
    const ud = mesh.userData as { heroRound?: Rounded | null; voxelSides?: number };
    if (ud.heroRound === undefined) ud.heroRound = measure(mesh);
    const r = ud.heroRound;
    if (!r) return;
    radius = Math.max(radius, r.radius);
    const want = steps !== null && shape.segments > steps ? steps : null;
    const geo = mesh.geometry;
    const own = (geo.userData.voxelOwnShape ??= { index: geo.index!, position: geo.getAttribute('position'), normal: geo.getAttribute('normal') }) as Shape;
    // (only from one of the shapes set here, its own or the last fewer steps: a shape of something else's stays)
    if (geo.index !== own.index && geo.index !== r.fewer?.index) return;
    if (want !== r.steps) {
      const unit = want === null ? null : unitVoxelGeometry((VOXEL_MATERIALS[familyOf(mesh)] as VoxelMaterialSpec).bevel, want, shape.flat);
      r.steps = want;
      r.fewer = unit && { index: openSidesIndex(unit, ud.voxelSides ?? 63), position: unit.getAttribute('position') as BufferAttribute, normal: unit.getAttribute('normal') as BufferAttribute };
    }
    const to = r.fewer ?? own;
    if (geo.index === to.index) return;
    geo.setIndex(to.index);
    geo.setAttribute('position', to.position);
    geo.setAttribute('normal', to.normal);
  });
  return radius;
}

/** A voxel mesh's family (its material is `voxel:<family>`, or with a variant after it). */
const familyOf = (mesh: InstancedMesh) => ((Array.isArray(mesh.material) ? '' : mesh.material.name).split(':')[1] ?? '') as VoxelMaterialKey;

/** The largest rounding radius of a voxel mesh's blocks (its own space), as the shader rounds them (materials.ts `injectVoxelVertex`); null: not a family's mesh. */
function measure(mesh: InstancedMesh): Rounded | null {
  const spec = VOXEL_MATERIALS[familyOf(mesh)] as VoxelMaterialSpec | undefined;
  if (!spec) return null;
  const e = mesh.instanceMatrix.array;
  const own = mesh.geometry.getAttribute('voxRadius')?.array;
  let r = 0;
  for (let i = 0; i < mesh.count; i++) {
    const k = i * 16;
    const side = Math.min(Math.hypot(e[k], e[k + 1], e[k + 2]), Math.hypot(e[k + 4], e[k + 5], e[k + 6]), Math.hypot(e[k + 8], e[k + 9], e[k + 10]));
    r = Math.max(r, own && own[i] > 0 ? Math.min(own[i], side * 0.45) : side * spec.bevel);
  }
  return { radius: r, steps: null, fewer: null };
}
