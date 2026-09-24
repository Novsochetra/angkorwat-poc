import { traceSource } from '../../feedback/sourceTrace';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import type { PlaceDef } from '../layout';
import type { MapPart } from '../types';

/** A plain stone platform and tower on the place's pad, until its landmark is built. */
export function placeholderLandmark(place: PlaceDef): MapPart {
  const b = new VoxelBuilder();
  const src = traceSource();
  const [hx, hz] = place.pad;
  b.span(place.x - hx * 0.6, place.y, place.z - hz * 0.6, place.x + hx * 0.6, place.y + 4, place.z + hz * 0.6, 0xa08a6c, 'mapStone', { src });
  b.span(place.x - 3, place.y + 4, place.z - 3, place.x + 3, place.y + 20, place.z + 3, 0xb0987a, 'mapStone', { src });
  return { name: `landmark:${place.id}`, object: buildVoxelMesh(b, { quality: 'medium', name: `landmark:${place.id}` }), blocks: b.boxes.length };
}
