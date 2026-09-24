import { Group } from 'three';
import { VoxelBuilder } from '../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../voxel/VoxelMesh';
import { MAP_BOUNDS } from './layout';
import { ColumnMaker } from './terrain/columns';
import { placeRocks } from './terrain/rocks';
import type { MapContext, MapPart } from './types';

/**
 * The land as blocks (see terrain/columns.ts): 2 m columns near the cameras,
 * 4 m and 8 m ones far away or out of sight (heightfield.ts picks them, the
 * `lod` of each cell), layered sandstone cliffs, and rocks at their feet
 * (terrain/rocks.ts).
 *
 * The blocks are split into chunks (about 200 m square), each with its own
 * meshes, so a close-up camera or the sun's shadow map only draws the
 * chunks it covers. Far blocks are plain boxes (quality 'low').
 */

/** Chunk size (m). */
const CHUNK = 200;

export function buildTerrain(ctx: MapContext): MapPart {
  const f = ctx.field;
  const cx = Math.ceil((MAP_BOUNDS.x1 - MAP_BOUNDS.x0) / CHUNK);
  const cz = Math.ceil((MAP_BOUNDS.z1 - MAP_BOUNDS.z0) / CHUNK);
  // Per chunk: [near (2 m blocks), far (4 and 8 m)].
  const chunks: [VoxelBuilder, VoxelBuilder][] = [];
  for (let n = 0; n < cx * cz; n++) chunks.push([new VoxelBuilder(), new VoxelBuilder()]);
  const sink = (x: number, z: number, lod: number) => {
    const a = Math.min(cx - 1, Math.max(0, Math.floor((x - MAP_BOUNDS.x0) / CHUNK)));
    const b = Math.min(cz - 1, Math.max(0, Math.floor((z - MAP_BOUNDS.z0) / CHUNK)));
    return chunks[a + b * cx][lod === 0 ? 0 : 1];
  };

  const maker = new ColumnMaker(f, sink);
  const { nx, nz, lod } = f;
  for (let k = 0; k < nz; k++)
    for (let i = 0; i < nx; i++) {
      const l = lod[i + k * nx];
      if (l === 0) maker.fine(i, k);
      else {
        // Coarse columns start on the corner of their 2 × 2 or 4 × 4 cells.
        const g = l === 1 ? 2 : 4;
        if (i % g === 0 && k % g === 0) maker.coarse(i, k, g);
      }
    }
  placeRocks(f, sink, maker.wet);

  const object = new Group();
  object.name = 'terrain';
  let blocks = 0;
  const lowOnly = ctx.quality === 'low';
  chunks.forEach(([near, far], n) => {
    for (const [b, quality] of [
      [near, lowOnly ? 'low' : 'medium'],
      [far, 'low'],
    ] as const) {
      if (!b.boxes.length) continue;
      blocks += b.boxes.length;
      const g = buildVoxelMesh(b, { quality, name: `terrain:${n}:${quality}` });
      object.add(g);
    }
  });
  return { name: 'terrain', object, blocks };
}
