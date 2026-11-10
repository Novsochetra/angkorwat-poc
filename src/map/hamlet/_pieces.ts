import { Group } from 'three';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh, type VoxelMeshOptions } from '../../voxel/VoxelMesh';
import { cutIntoPieces } from '../road/pieces';

/**
 * A place's blocks in pieces: each family cut into compact pieces by where
 * its blocks stand (road/pieces.ts `cutIntoPieces`), a mesh each, so three
 * leaves out the pieces out of view, and the back sides of a small piece
 * can be left out too (voxel/backFacets.ts: tested against the box round a
 * mesh's blocks, which for a whole village takes in every side).
 *
 * The sugar-palm village was one mesh a family (4,830 blocks of wood, 2,602
 * of stone …), ≈ 160 m across: standing in its market an iPhone drew all of
 * it, the half behind the camera and the sides facing away included, ≈ a
 * sixth of the frame. Only for places whose meshes nothing else holds by
 * their instance index (the market's toggles, the floating village's bobbing
 * rafts do).
 *
 * `per`: blocks a piece, about; at most `most` pieces a family.
 */
export function buildVoxelPieces(world: VoxelBuilder, options: VoxelMeshOptions, per = 700, most = 8): Group {
  const families = new Map<string, VoxelBuilder['boxes']>();
  for (const box of world.boxes) {
    let list = families.get(box.mat);
    if (!list) families.set(box.mat, (list = []));
    list.push(box);
  }
  const out = new Group();
  out.name = options.name ?? '';
  for (const list of families.values()) {
    const k = Math.min(most, Math.max(1, Math.round(list.length / per)));
    for (const cut of cutIntoPieces(list, k, (b) => b.x, (b) => b.z)) {
      const piece = new VoxelBuilder();
      for (const box of cut) piece.boxes.push(box);
      out.add(buildVoxelMesh(piece, options));
    }
  }
  return out;
}
