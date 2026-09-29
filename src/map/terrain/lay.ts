import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { CoverGround, VoxelMeshOptions } from '../../voxel/VoxelMesh';
import { CELL, tileRow, type HeightField } from '../heightfield';
import { ColumnMaker } from './columns';
import { ChunkGrid } from './grid';
import { placeRocks } from './rocks';
import { overviewSeen } from './seen';
import { pastLand } from './views';

/**
 * The land's blocks as data (no meshes, no three.js objects): laid on the
 * main thread (terrain.ts) or, a share of the chunks each, in the build
 * workers (map/work/), which pack them into the same meshes' arrays.
 */

/** The land's chunks (terrain/lod.ts: each has its own meshes). */
export const TERRAIN_GRID = new ChunkGrid(150);
/** Land this far past its end (m, views.ts `pastLand`: sunk into the mist all the way) has no blocks. */
const GONE = 40;

/**
 * Every column of the land in the order they are laid: (i, k) its first
 * cell, `g` its cells across (1: a 2 m column; 2 or 4: a coarse one, 4 m or
 * 8 m, heightfield.ts `lod`). Land sunk all the way past its end has none.
 */
export function eachColumn(f: HeightField, fn: (i: number, k: number, g: number) => void): void {
  const { nx, nz, lod } = f;
  // (the coarse tiles' rows: heightfield.ts `tileRow`)
  const k0 = tileRow(f);
  for (let k = 0; k < nz; k++)
    for (let i = 0; i < nx; i++) {
      const l = lod[i + k * nx];
      // Past the end of the land, sunk into the sea of mist all the way: no blocks (as off the map).
      if (f.height[i + k * nx] < 0 && pastLand(f.x0 + (i + 0.5) * CELL, f.z0 + (k + 0.5) * CELL) > GONE) continue;
      if (l === 0) fn(i, k, 1);
      else {
        // Coarse columns start on the corner of their 2 × 2 or 4 × 4 cells.
        const g = l === 1 ? 2 : 4;
        if (i % g === 0 && (k - k0) % g === 0) fn(i, k, g);
      }
    }
}

/** The chunk a column's blocks go to (the chunk of its middle, as columns.ts hands them to the sink). */
export function columnChunk(f: HeightField, i: number, k: number, g: number): number {
  if (g === 1) {
    const [x, z] = f.cellCenter(i, k);
    return TERRAIN_GRID.at(x, z);
  }
  const size = g * CELL;
  return TERRAIN_GRID.at(f.x0 + i * CELL + size / 2, f.z0 + k * CELL + size / 2);
}

/** A builder that keeps nothing (the blocks of another worker's chunks). */
class DropBuilder extends VoxelBuilder {
  override box(): this {
    return this;
  }
}
const DROP = new DropBuilder();

/** The land's blocks per chunk, laid (terrain.ts `layTerrain`). */
export interface LaidTerrain {
  /** Per chunk: [near (2 m blocks), far (4 and 8 m)], no meshes yet, those the overview camera sees first. */
  chunks: [VoxelBuilder, VoxelBuilder][];
  /** The hollow under them (VoxelMesh.ts `hideCovered`). */
  ground: CoverGround;
  /** Whether the overview camera sees a map point (terrain/seen.ts). */
  seen: Uint8Array;
  seenAt: (x: number, z: number) => boolean;
}

/**
 * The land's blocks per chunk: [near (2 m blocks), far (4 and 8 m)], no
 * meshes yet, those the overview camera sees first; the hollow under them;
 * and whether the overview camera sees a map point.
 *
 * `mine`: only these chunks' blocks (a build worker's share). The floor
 * under every column is still set (the sides of these blocks are tested
 * against their neighbours' columns), and all the rocks are placed (they
 * mark the cells they take one after another), the others' blocks dropped:
 * each chunk gets exactly the blocks, in the order, it gets with all laid.
 */
export function layTerrain(f: HeightField, mine?: (chunk: number) => boolean, ms?: Record<string, number>): LaidTerrain {
  let t = performance.now();
  const lap = (step: string) => {
    const now = performance.now();
    if (ms) ms[step] = (ms[step] ?? 0) + now - t;
    t = now;
  };
  const seen = overviewSeen(f);
  lap('seen');
  // (off the grid: the front edge's wall, seen)
  const seenAt = (x: number, z: number) => {
    const c = f.index(x, z);
    return c < 0 || seen[c] === 1;
  };
  // Per chunk and level of detail, the blocks the overview camera sees and the rest (put after them at the end).
  const chunks: [VoxelBuilder, VoxelBuilder][] = [];
  const hidden: [VoxelBuilder, VoxelBuilder][] = [];
  for (let n = 0; n < TERRAIN_GRID.count; n++) {
    chunks.push([new VoxelBuilder(), new VoxelBuilder()]);
    hidden.push([new VoxelBuilder(), new VoxelBuilder()]);
  }
  const sink = (x: number, z: number, lod: number) => {
    const n = TERRAIN_GRID.at(x, z);
    return mine && !mine(n) ? DROP : (seenAt(x, z) ? chunks : hidden)[n][lod === 0 ? 0 : 1];
  };

  const maker = new ColumnMaker(f, sink);
  if (mine) eachColumn(f, (i, k, g) => (g === 1 ? maker.fineFloor(i, k) : maker.coarseFloor(i, k, g)));
  lap('floor');
  eachColumn(f, (i, k, g) => {
    if (mine && !mine(columnChunk(f, i, k, g))) return;
    if (g === 1) maker.fine(i, k);
    else maker.coarse(i, k, g);
  });
  lap('columns');
  placeRocks(f, sink, maker.wet);
  lap('rocks');
  chunks.forEach((pair, n) =>
    pair.forEach((b, l) => {
      for (const box of hidden[n][l].boxes) b.boxes.push(box);
    }),
  );
  return { chunks, ground: { x0: f.x0, z0: f.z0, cell: CELL, nx: f.nx, nz: f.nz, floor: maker.floor }, seen, seenAt };
}

/**
 * The land's chunks shared out among `of` build workers, about as much work
 * each (a 2 m column costs most: its wall, its sides' test), the biggest
 * first to the least loaded; share `part`'s chunks, in order. Every worker
 * works it out the same (from the same land).
 */
export function shareChunks(f: HeightField, part: number, of: number): number[] {
  const count = TERRAIN_GRID.count;
  const cost = new Float64Array(count);
  const { nx, nz, height: H } = f;
  eachColumn(f, (i, k, g) => {
    // (a block for its top, and about one for every 3 m of wall down to its lowest neighbour)
    const c = i + k * nx;
    const h = H[c];
    const low = Math.min(i > 0 ? H[c - 1] : h, i + g < nx ? H[c + g] : h, k > 0 ? H[c - nx] : h, k + g < nz ? H[c + g * nx] : h);
    cost[columnChunk(f, i, k, g)] += (g === 1 ? 1 : 0.6) + Math.max(0, h - low) / 3;
  });
  const order = Array.from({ length: count }, (_, n) => n).sort((a, b) => cost[b] - cost[a] || a - b);
  const load = new Float64Array(of);
  const mine: number[] = [];
  for (const n of order) {
    let w = 0;
    for (let q = 1; q < of; q++) if (load[q] < load[w]) w = q;
    load[w] += cost[n];
    if (w === part) mine.push(n);
  }
  return mine.sort((a, b) => a - b);
}

/** How a chunk's blocks become meshes (`lod` 0: its near blocks, 1: its far ones; `low`: the low level's build). */
export function terrainMeshOptions(n: number, lod: 0 | 1, low: boolean, ground: CoverGround): VoxelMeshOptions {
  return lod === 0 ? { quality: low ? 'low' : 'medium', name: `terrain:${n}:near`, hideCovered: { ground } } : { quality: 'low', name: `terrain:${n}:far`, hideCovered: { ground } };
}
