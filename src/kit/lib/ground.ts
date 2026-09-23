import type { Surf, VoxelGrid } from '../../voxel/VoxelBuilder';
import { SOIL } from '../palette';
import type { PieceBuilder } from '../PieceBuilder';
import { TEXEL } from '../shapes';
import { soilSurf } from '../surface';

/**
 * §18.2 ground tiles: a soil body whose walkable top is at y = 0, plus a grid
 * of texel-sized cells (1/16 m) standing on it for the raised detail — grass
 * tufts, leaves, pebbles, roots. The body is one block, so the `soil` pattern
 * draws its pixel texture (and the grass that hangs over the edges) without
 * any seams; only the raised detail costs extra blocks.
 */
export interface TileOptions {
  /** Footprint (metres), default 1 × 1. */
  w?: number;
  d?: number;
  /** Soil depth below the top, default 0.5 m. */
  depth?: number;
  /** Soil colour (one tone: the pattern adds the texel variation). */
  color?: number;
  /** Soil pattern amounts: grass cover, moss, dryness, wetness. */
  surf?: Surf;
}

export const TILE = 1;
export const TILE_DEPTH = 0.5;

/** The soil block of a tile, top at y = 0, centred on the origin; adds its collider. */
export function soilBody(p: PieceBuilder, o: TileOptions = {}): void {
  const w = o.w ?? TILE;
  const d = o.d ?? TILE;
  const depth = o.depth ?? TILE_DEPTH;
  p.voxels.box(0, -depth / 2, 0, w, depth, d, o.color ?? SOIL.dirt[0], 'soil', { surf: o.surf ?? soilSurf({ grass: 1 }) });
  p.collider(-w / 2, -depth, -d / 2, w / 2, 0, d / 2);
}

/**
 * A grid of texel cells on top of a tile: cell (i, 0, k) sits on the top face,
 * i from 0 to w·16 − 1 along +x, k likewise along +z. The soil under it is
 * ghosted, so ambient occlusion and rim highlights treat it as solid ground.
 * Call `commit()` when done.
 */
export function topGrid(p: PieceBuilder, o: { w?: number; d?: number; mat?: Parameters<PieceBuilder['voxels']['grid']>[0]['mat']; seed?: number; surf?: Surf } = {}): VoxelGrid {
  const w = o.w ?? TILE;
  const d = o.d ?? TILE;
  const g = p.voxels.grid({ cell: TEXEL, origin: [-w / 2, 0, -d / 2], mat: o.mat ?? 'soil', jitter: 0.06, ao: 0.3, seed: o.seed ?? 1, surf: o.surf });
  const ni = Math.round(w / TEXEL);
  const nk = Math.round(d / TEXEL);
  for (let i = -1; i <= ni; i++) for (let k = -1; k <= nk; k++) g.ghost(i, -1, k);
  return g;
}

/** Texel index of a coordinate on a tile of width w (for placing detail by metres). */
export function texelOf(x: number, w = TILE): number {
  return Math.floor((x + w / 2) / TEXEL);
}
