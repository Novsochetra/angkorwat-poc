import { Group, Vector3 } from 'three';
import { buildVoxelMesh } from '../voxel/VoxelMesh';
import { OVERVIEW } from './layout';
import { layTerrain, TERRAIN_GRID, terrainMeshOptions } from './terrain/lay';
import { ChunkLods } from './terrain/lod';
import { countSeen, showSeen } from './terrain/seen';
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
 *
 * The blocks are laid and packed into the meshes' arrays in the build
 * workers (map/work/, a share of the chunks each; terrain/lay.ts), and here
 * only made into meshes; or all here (`work=0`, or no workers).
 */

const GRID = TERRAIN_GRID;

/** The overview camera, where the land draws only what it sees (within this distance, m: it sways a few decimetres). */
const OVERVIEW_POS = new Vector3(...OVERVIEW.pos);
const AT_OVERVIEW = 3;
/** `landcull=0` in the URL: the overview draws all the land (to compare). */
const CULL = typeof location === 'undefined' || new URLSearchParams(location.search).get('landcull') !== '0';

/**
 * The land's meshes made elsewhere (map/work/: the build workers): each
 * chunk's near and far meshes (null: no blocks), and whether the overview
 * camera sees a map point (terrain/seen.ts).
 */
export interface TerrainMeshes {
  mesh: (n: number, lod: 0 | 1) => { group: Group; blocks: number } | null;
  seenAt: (x: number, z: number) => boolean;
}

/** The land's meshes laid and made here, chunk by chunk as asked. */
function meshesHere(ctx: MapContext): TerrainMeshes {
  const { chunks, ground, seenAt } = layTerrain(ctx.field);
  const low = ctx.quality === 'low';
  return {
    mesh: (n, lod) => {
      const b = chunks[n][lod];
      return b.boxes.length ? { group: buildVoxelMesh(b, terrainMeshOptions(n, lod, low, ground)), blocks: b.boxes.length } : null;
    },
    seenAt,
  };
}

export function buildTerrain(ctx: MapContext, made?: TerrainMeshes | null): MapPart {
  const object = new Group();
  object.name = 'terrain';
  let blocks = 0;
  const lowOnly = ctx.quality === 'low';
  const lods = new ChunkLods();
  const { mesh, seenAt } = made ?? meshesHere(ctx);
  for (let n = 0; n < GRID.count; n++) {
    const near = mesh(n, 0);
    if (near) {
      blocks += near.blocks;
      if (lowOnly) object.add(near.group);
      else lods.add(object, GRID.box(n), near.group);
    }
    const far = mesh(n, 1);
    if (far) {
      blocks += far.blocks;
      object.add(far.group);
    }
  }
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
