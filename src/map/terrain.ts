import { Group } from 'three';
import { VoxelBuilder } from '../voxel/VoxelBuilder';
import { buildVoxelMesh, type CoverGround } from '../voxel/VoxelMesh';
import { CELL, type HeightField } from './heightfield';
import { ColumnMaker } from './terrain/columns';
import { ChunkGrid, ChunkLods } from './terrain/lod';
import { placeRocks } from './terrain/rocks';
import type { MapContext, MapPart } from './types';

/**
 * The land as blocks (see terrain/columns.ts): 2 m columns wherever the
 * roaming explorer can go and near the fixed cameras, 4 m and 8 m ones far
 * away or out of sight (heightfield.ts picks them, the `lod` of each cell),
 * layered sandstone cliffs, and rocks at their feet (terrain/rocks.ts).
 *
 * The blocks are split into 150 m chunks (terrain/lod.ts), each with its
 * own meshes, so a camera low among the hills only draws the chunks in front
 * of it. Far blocks are plain boxes (quality 'low'), and so are the 2 m
 * blocks of chunks far from the camera. A block draws only the sides that
 * can be seen (`hideCovered`, with the hollow under the land): 3 in 4 are
 * tops that show only their top face, the rest lies against the columns
 * around.
 */

const GRID = new ChunkGrid(150);

/** The land's blocks per chunk: [near (2 m blocks), far (4 and 8 m)], no meshes yet; and the hollow under them. */
export function layTerrain(f: HeightField): { chunks: [VoxelBuilder, VoxelBuilder][]; ground: CoverGround } {
  const chunks: [VoxelBuilder, VoxelBuilder][] = [];
  for (let n = 0; n < GRID.count; n++) chunks.push([new VoxelBuilder(), new VoxelBuilder()]);
  const sink = (x: number, z: number, lod: number) => chunks[GRID.at(x, z)][lod === 0 ? 0 : 1];

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
  return { chunks, ground: { x0: f.x0, z0: f.z0, cell: CELL, nx, nz, floor: maker.floor } };
}

export function buildTerrain(ctx: MapContext): MapPart {
  const object = new Group();
  object.name = 'terrain';
  let blocks = 0;
  const lowOnly = ctx.quality === 'low';
  const lods = new ChunkLods();
  const { chunks, ground } = layTerrain(ctx.field);
  chunks.forEach(([near, far], n) => {
    if (near.boxes.length) {
      blocks += near.boxes.length;
      const mesh = buildVoxelMesh(near, { quality: lowOnly ? 'low' : 'medium', name: `terrain:${n}:near`, hideCovered: { ground } });
      if (lowOnly) object.add(mesh);
      else lods.add(object, GRID.box(n), mesh);
    }
    if (far.boxes.length) {
      blocks += far.boxes.length;
      object.add(buildVoxelMesh(far, { quality: 'low', name: `terrain:${n}:far`, hideCovered: { ground } }));
    }
  });
  return { name: 'terrain', object, blocks, update: (f) => lods.update(f.camera, f.roam !== 'overview') };
}
