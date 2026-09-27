import { Group, Vector3 } from 'three';
import { VoxelBuilder } from '../voxel/VoxelBuilder';
import { buildVoxelMesh, type CoverGround } from '../voxel/VoxelMesh';
import { CELL, tileRow, type HeightField } from './heightfield';
import { OVERVIEW } from './layout';
import { ColumnMaker } from './terrain/columns';
import { ChunkGrid, ChunkLods } from './terrain/lod';
import { placeRocks } from './terrain/rocks';
import { countSeen, overviewSeen, showSeen } from './terrain/seen';
import { pastLand } from './terrain/views';
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
 * around. While the camera rests on the overview, only the blocks it can see
 * are drawn (terrain/seen.ts: a quarter of those in its frame are hidden
 * behind the mountain, the summit and the hills): they come first in every
 * mesh, and the mesh draws that many.
 */

const GRID = new ChunkGrid(150);

/** The overview camera, where the land draws only what it sees (within this distance, m: it sways a few decimetres). */
const OVERVIEW_POS = new Vector3(...OVERVIEW.pos);
const AT_OVERVIEW = 3;
/** Land this far past its end (m, views.ts `pastLand`: sunk into the mist all the way) has no blocks. */
const GONE = 40;
/** `landcull=0` in the URL: the overview draws all the land (to compare). */
const CULL = typeof location === 'undefined' || new URLSearchParams(location.search).get('landcull') !== '0';

/**
 * The land's blocks per chunk: [near (2 m blocks), far (4 and 8 m)], no
 * meshes yet, those the overview camera sees first; the hollow under them;
 * and whether the overview camera sees a map point.
 */
export function layTerrain(f: HeightField): { chunks: [VoxelBuilder, VoxelBuilder][]; ground: CoverGround; seenAt: (x: number, z: number) => boolean } {
  const seen = overviewSeen(f);
  // (off the grid: the front edge's wall, seen)
  const seenAt = (x: number, z: number) => {
    const c = f.index(x, z);
    return c < 0 || seen[c] === 1;
  };
  // Per chunk and level of detail, the blocks the overview camera sees and the rest (put after them at the end).
  const chunks: [VoxelBuilder, VoxelBuilder][] = [];
  const hidden: [VoxelBuilder, VoxelBuilder][] = [];
  for (let n = 0; n < GRID.count; n++) {
    chunks.push([new VoxelBuilder(), new VoxelBuilder()]);
    hidden.push([new VoxelBuilder(), new VoxelBuilder()]);
  }
  const sink = (x: number, z: number, lod: number) => (seenAt(x, z) ? chunks : hidden)[GRID.at(x, z)][lod === 0 ? 0 : 1];

  const maker = new ColumnMaker(f, sink);
  const { nx, nz, lod } = f;
  // (the coarse tiles' rows: heightfield.ts `tileRow`)
  const k0 = tileRow(f);
  for (let k = 0; k < nz; k++)
    for (let i = 0; i < nx; i++) {
      const l = lod[i + k * nx];
      // Past the end of the land, sunk into the sea of mist all the way: no blocks (as off the map).
      if (f.height[i + k * nx] < 0 && pastLand(f.x0 + (i + 0.5) * CELL, f.z0 + (k + 0.5) * CELL) > GONE) continue;
      if (l === 0) maker.fine(i, k);
      else {
        // Coarse columns start on the corner of their 2 × 2 or 4 × 4 cells.
        const g = l === 1 ? 2 : 4;
        if (i % g === 0 && (k - k0) % g === 0) maker.coarse(i, k, g);
      }
    }
  placeRocks(f, sink, maker.wet);
  chunks.forEach((pair, n) => pair.forEach((b, l) => {
    for (const box of hidden[n][l].boxes) b.boxes.push(box);
  }));
  return { chunks, ground: { x0: f.x0, z0: f.z0, cell: CELL, nx, nz, floor: maker.floor }, seenAt };
}

export function buildTerrain(ctx: MapContext): MapPart {
  const object = new Group();
  object.name = 'terrain';
  let blocks = 0;
  const lowOnly = ctx.quality === 'low';
  const lods = new ChunkLods();
  const { chunks, ground, seenAt } = layTerrain(ctx.field);
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
  countSeen(object, seenAt);
  let culled = false;
  return {
    name: 'terrain',
    object,
    blocks,
    update(f) {
      lods.update(f.camera, f.roam !== 'overview');
      // Resting on the overview: only what it sees (a plain twin made later takes its mesh's count).
      const cull = CULL && f.roam === 'overview' && f.camera.position.distanceTo(OVERVIEW_POS) < AT_OVERVIEW;
      if (cull === culled) return;
      culled = cull;
      showSeen(object, cull);
      // (the shadows of what is left out, or brought back: drawn again)
      ctx.renderer.shadowMap.needsUpdate = true;
    },
  };
}
