import type { PackedVoxelGroup } from '../../voxel/VoxelMesh';
import type { FieldData } from '../heightfield';
import type { MapQuality } from '../types';
import type { PackedBoxes } from './transfer';

/**
 * What the page asks the build workers (build.worker.ts) and what they send
 * back: plain data only (see transfer.ts).
 */

export type Job =
  /** The land's first shape on rows `k0` ‥ `k1` − 1 (heightfield.ts `firstShape`: each worker a share). */
  | { job: 'shape'; k0: number; k1: number }
  /** Build the land (heightfield.ts `buildHeightField`; `first`: its first shape, from the shares), keep it, and send a copy. */
  | { job: 'land'; first?: Float32Array }
  /** Keep this land (a copy of the one another worker built). */
  | { job: 'field'; field: FieldData }
  /** Lay and pack the land's blocks of share `part` of `of` (terrain/lay.ts `shareChunks`); `report`: also what the page needs once (the cells the rocks took, what the overview sees). */
  | { job: 'terrain'; part: number; of: number; quality: MapQuality; report: boolean }
  /** Make the jungle's prototypes now (vegetation.ts `makeKits`), for the planting later. */
  | { job: 'kits' }
  /** Plant the jungle on the land as the page has it now (its surface and what is built on). */
  | { job: 'vegetation'; surface: Uint8Array; occupied: Uint8Array; density: number }
  /** The sides each block of these groups shows (cull.ts `cutCovered`: `shownSides` of `coverBoxes`, transfer.ts `packBoxes`). */
  | { job: 'covers'; groups: PackedBoxes[] };

export type Request = Job & { id: number };

export interface ShapeOut {
  rows: Float32Array;
}

export interface LandOut {
  field: FieldData;
  /** Its steps (ms: heightfield.ts). */
  steps: Record<string, number>;
}

export interface TerrainOut {
  /** The chunks of this share: each one's near and far meshes, packed (null: no blocks). */
  chunks: { n: number; near: PackedVoxelGroup | null; far: PackedVoxelGroup | null }[];
  /** The code lines their blocks' `src` indexes name (dev builds: their stacks). */
  traces: string[];
  /** (`report`) Cells the rocks took (terrain/rocks.ts marks them built on), and what the overview camera sees (terrain/seen.ts). */
  rocks?: Int32Array;
  seen?: Uint8Array;
  /** Work in the worker (ms): laying, packing. */
  lay: number;
  pack: number;
  /** The laying's steps (ms: terrain/lay.ts). */
  steps: Record<string, number>;
}

export interface VegetationOut {
  /** vegetation.ts `plantJungle`'s result, its builders packed (transfer.ts `encodeBuilders`). */
  planted: unknown;
  traces: string[];
}

/** `at`: when the job began (ms, `performance.timeOrigin` + `now()`: comparable across threads). */
export interface CoversOut {
  sides: Uint8Array[];
}

export type Reply = { id: number; ok: true; out: unknown; ms: number; at: number } | { id: number; ok: false; error: string };
