import type { VoxelMaterialKey } from '../../voxel/materials';

/**
 * What a player's block can be (map/blocks/: the player's block layer): its
 * material and its shape. No three.js: the store, the walk map and the save
 * read these too.
 *
 * **Ids are saved** (store.ts `rawOf`, the save's run-length list): never
 * change or reuse an id, only add new ones (an id up to 255 for a material,
 * 63 for a shape).
 */

/** A block material: the map's block family it is drawn with, its own colour, and whether he stands on it and is stopped by it. */
export interface BlockMatSpec {
  /** Saved (1‥255; 0 is "no block"). */
  readonly id: number;
  /** The map's own families only (map…: the map's shaders, no new program compiled). */
  readonly family: VoxelMaterialKey;
  /** Its colour unpainted (sRGB hex). A block can be painted any colour (`Block.color`). */
  readonly color: number;
  /** Solid to walk on and into (the walk map: AWP-17). */
  readonly solid: boolean;
}

/**
 * The materials (Khmer building materials, build plan "What can they build
 * with?"). Colours sampled from the map's own: timber as the village houses'
 * planks, bamboo as the fences', thatch as the shelters' palm-leaf roofs,
 * laterite (បាយក្រៀម) as Angkor's red-brown foundations, sandstone (ថ្មភក់) as
 * the temples', brick (ឥដ្ឋ) as Preah Ko's.
 */
export const BLOCK_MATS = {
  timber: { id: 1, family: 'mapBark', color: 0x8a5b3c, solid: true },
  bamboo: { id: 2, family: 'mapBark', color: 0xc4a764, solid: true },
  thatch: { id: 3, family: 'mapLeaf', color: 0xb79a5e, solid: true },
  laterite: { id: 4, family: 'mapStone', color: 0xa8583a, solid: true },
  sandstone: { id: 5, family: 'mapStone', color: 0xcdb68c, solid: true },
  brick: { id: 6, family: 'mapRock', color: 0xb4623f, solid: true },
} as const satisfies Record<string, BlockMatSpec>;

export type BlockMatKey = keyof typeof BLOCK_MATS;

/** Materials by id (index: the id; undefined: none). */
export const MAT_BY_ID: readonly (BlockMatSpec & { key: BlockMatKey })[] = (() => {
  const out: (BlockMatSpec & { key: BlockMatKey })[] = [];
  for (const [key, m] of Object.entries(BLOCK_MATS) as [BlockMatKey, BlockMatSpec][]) out[m.id] = { ...m, key };
  return out;
})();

/** A box of a shape in its cell, in cell units (0‥1): x0, y0, z0, x1, y1, z1. */
export type CellBox = readonly [number, number, number, number, number, number];

/**
 * A block shape: the boxes it is drawn with, in its cell (unturned), and the
 * sides of the cell it fills whole (bits as a block's `open`: +x 1, −x 2,
 * +y 4, −y 8, +z 16, −z 32): a neighbour's side against a filled one is
 * never seen (not drawn).
 */
export interface BlockShapeSpec {
  /** Saved (0‥63). */
  readonly id: number;
  readonly boxes: readonly CellBox[];
  readonly covers: number;
}

/**
 * The shapes. A cube; a slab (the lower half: 0.25 m, a stair's rise, which
 * he steps up without a jump: scale.ts `CHARACTER_STEP_M`). Stairs and the
 * upper slab come with AWP-24: a turned shape turns its boxes and `covers`
 * by its `turn` (store.ts: saved with every block already, 0 for now).
 */
export const BLOCK_SHAPES = {
  cube: { id: 0, boxes: [[0, 0, 0, 1, 1, 1]], covers: 63 },
  slab: { id: 1, boxes: [[0, 0, 0, 1, 0.5, 1]], covers: 8 },
} as const satisfies Record<string, BlockShapeSpec>;

export type BlockShapeKey = keyof typeof BLOCK_SHAPES;

/** Shapes by id. */
export const SHAPE_BY_ID: readonly (BlockShapeSpec & { key: BlockShapeKey })[] = (() => {
  const out: (BlockShapeSpec & { key: BlockShapeKey })[] = [];
  for (const [key, s] of Object.entries(BLOCK_SHAPES) as [BlockShapeKey, BlockShapeSpec][]) out[s.id] = { ...s, key };
  return out;
})();

/**
 * Six Khmer colours for paint (build plan "Colours?", AWP-22 picks and names
 * them in the game): lotus pink, saffron, indigo, temple gold, lacquer red,
 * coconut brown.
 */
export const KHMER_PAINT = {
  lotus: 0xe58aa8,
  saffron: 0xe8902a,
  indigo: 0x34477e,
  gold: 0xd9a93a,
  lacquer: 0xa8281e,
  coconut: 0x6b4428,
} as const;
