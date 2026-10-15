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
 * A block shape: the boxes it is drawn with, in its cell, unturned (a
 * turned block turns them a quarter turn about y per `turn`: {@link FORMS}).
 * Boxes lie on the cell's halves (0, 0.5, 1): what a box's side fills of
 * the cell's side is counted in quarters of it (a neighbour's side is hidden
 * only where it lies against filled quarters: {@link FormSpec.covers}).
 */
export interface BlockShapeSpec {
  /** Saved (0‥63). */
  readonly id: number;
  readonly boxes: readonly CellBox[];
  /** Turning changes it (stairs, corners); a cube or a slab turned is the same block. */
  readonly turns: boolean;
}

/**
 * The shapes (AWP-24: roofs and stairs; ids saved, only ever added):
 *
 * - `cube`: the whole cell.
 * - `slab`: its lower half (0.25 m: a stair's rise, which he steps up without
 *   a jump: blocks/walk.ts `BLOCK_STEP_M`).
 * - `stair`: a slab and a quarter on its back half: two rises of 0.25 m in
 *   the cell. Unturned it climbs towards +z; each `turn` a quarter turn about
 *   y ({@link STAIR_UP}: turn 1 climbs towards +x, 2 towards −z, 3 towards −x).
 *   A row of them laid in the steps of a stepped roof makes its slope (roof.ts).
 * - `slabTop`: the upper half (a lintel, an eave's soffit, a ceiling).
 * - `stairOuter`: a slab and a quarter column on one quarter of it (unturned
 *   the +x +z quarter; turned as the stair): a hip roof's outer corner.
 * - `stairInner`: a slab and three quarter columns (all but the −x −z
 *   quarter unturned): a roof's inner corner (an L-shaped house).
 */
export const BLOCK_SHAPES = {
  cube: { id: 0, boxes: [[0, 0, 0, 1, 1, 1]], turns: false },
  slab: { id: 1, boxes: [[0, 0, 0, 1, 0.5, 1]], turns: false },
  stair: {
    id: 2,
    boxes: [
      [0, 0, 0, 1, 0.5, 1],
      [0, 0.5, 0.5, 1, 1, 1],
    ],
    turns: true,
  },
  slabTop: { id: 3, boxes: [[0, 0.5, 0, 1, 1, 1]], turns: false },
  stairOuter: {
    id: 4,
    boxes: [
      [0, 0, 0, 1, 0.5, 1],
      [0.5, 0.5, 0.5, 1, 1, 1],
    ],
    turns: true,
  },
  stairInner: {
    id: 5,
    boxes: [
      [0, 0, 0, 1, 0.5, 1],
      [0, 0.5, 0.5, 1, 1, 1],
      [0.5, 0.5, 0, 1, 1, 0.5],
    ],
    turns: true,
  },
} as const satisfies Record<string, BlockShapeSpec>;

export type BlockShapeKey = keyof typeof BLOCK_SHAPES;

/** Shapes by id. */
export const SHAPE_BY_ID: readonly (BlockShapeSpec & { key: BlockShapeKey })[] = (() => {
  const out: (BlockShapeSpec & { key: BlockShapeKey })[] = [];
  for (const [key, s] of Object.entries(BLOCK_SHAPES) as [BlockShapeKey, BlockShapeSpec][]) out[s.id] = { ...s, key };
  return out;
})();

/** Per turn (0‥3): the way a stair climbs (x, z); a turn is a quarter turn about +y (+z → +x → −z → −x). */
export const STAIR_UP: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];

/** The turn of a stair that climbs towards (dx, dz) (one of ±x, ±z; the larger of the two wins). */
export function turnToward(dx: number, dz: number): number {
  return Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 1 : 3) : dz < 0 ? 2 : 0;
}

/** A box turned `turn` quarter turns about +y round the cell's middle ((x, z) → (z, 1 − x) each). */
export function turnBox(b: CellBox, turn: number): CellBox {
  let [x0, y0, z0, x1, y1, z1] = b;
  for (let t = 0; t < (turn & 3); t++) [x0, z0, x1, z1] = [z0, 1 - x1, z1, 1 - x0];
  return [x0, y0, z0, x1, y1, z1];
}

/**
 * A shape at a turn (`form` = shape id · 4 + turn, as the store keeps it): its
 * boxes turned, and what the mesh and the walk map need of them.
 */
export interface FormSpec {
  readonly boxes: readonly CellBox[];
  /**
   * The quarters of each side of the cell its boxes fill (4 bits a side, side
   * s at bits 4s‥4s + 3; sides +x −x +y −y +z −z as a block's `open` bits; on
   * each side the quarters over its two other axes in x y z order, low half
   * then high: bit u + 2v). A neighbour's box side that lies only on filled
   * quarters is covered (not drawn): a slab beside a slab, a stair beside a
   * stair of the same turn, a slab on a cube.
   */
  readonly covers: number;
  /** Per box: the quarters of each cell side its side lies on (the same bits; 0 where it is inside the cell). */
  readonly faces: readonly number[];
  /** Per box: its sides that lie whole against another box of the block (never seen). */
  readonly inner: readonly number[];
  /** Its lowest bottom and highest top (cell units). */
  readonly bottom: number;
  readonly top: number;
  /**
   * The quarters of the cell (seen from above: bit (x half) + 2 · (z half))
   * whose top is half a cell under `top` (a stair's tread): the walk map
   * stands feet there half a cell lower (roam/walkmap.ts).
   */
  readonly low: number;
}

/** The other two axes of a side's axis, in x y z order (a side's quarters: u, v). */
const UV: readonly (readonly [number, number])[] = [
  [1, 2],
  [0, 2],
  [0, 1],
];

/** The halves (bit 0 low, bit 1 high) a span [lo, hi] of a cell axis overlaps (`whole`: covers whole). */
function halves(lo: number, hi: number, whole: boolean): number {
  let m = 0;
  if (whole ? lo <= 0 && hi >= 0.5 : lo < 0.5 && hi > 0) m |= 1;
  if (whole ? lo <= 0.5 && hi >= 1 : lo < 1 && hi > 0.5) m |= 2;
  return m;
}

/** The quarters (bits u + 2v) of side `s`'s plane a box's side covers whole, or overlaps (`whole` false). */
function quarters(b: CellBox, s: number, whole: boolean): number {
  const [u, v] = UV[s >> 1];
  const hu = halves(b[u], b[u + 3], whole);
  const hv = halves(b[v], b[v + 3], whole);
  let q = 0;
  for (let a = 0; a < 2; a++) for (let c = 0; c < 2; c++) if (hu & (1 << a) && hv & (1 << c)) q |= 1 << (a + 2 * c);
  return q;
}

/** Does box `b`'s side `s` lie on its cell's side? */
const onCellSide = (b: CellBox, s: number): boolean => (s & 1 ? b[s >> 1] === 0 : b[(s >> 1) + 3] === 1);

function formOf(shape: BlockShapeSpec, turn: number): FormSpec {
  const boxes = shape.boxes.map((b) => turnBox(b, shape.turns ? turn : 0));
  let covers = 0;
  const faces: number[] = [];
  const inner: number[] = [];
  boxes.forEach((b, n) => {
    let f = 0;
    let closed = 0;
    for (let s = 0; s < 6; s++) {
      const axis = s >> 1;
      if (onCellSide(b, s)) {
        f |= quarters(b, s, false) << (4 * s);
        covers |= quarters(b, s, true) << (4 * s);
        continue;
      }
      // (inside the cell: hidden when another box of the block lies against all of it)
      const at = s & 1 ? b[axis] : b[axis + 3];
      const [u, v] = UV[axis];
      for (let m = 0; m < boxes.length; m++) {
        const o = boxes[m];
        if (m === n || (s & 1 ? o[axis + 3] : o[axis]) !== at) continue;
        if (o[u] <= b[u] && o[u + 3] >= b[u + 3] && o[v] <= b[v] && o[v + 3] >= b[v + 3]) closed |= 1 << s;
      }
    }
    faces.push(f);
    inner.push(closed);
  });
  const top = Math.max(...boxes.map((b) => b[4]));
  let low = 0;
  for (let q = 0; q < 4; q++) {
    const qx = (q & 1) * 0.5;
    const qz = (q >> 1) * 0.5;
    let t = 0;
    for (const b of boxes) if (b[0] <= qx && b[3] >= qx + 0.5 && b[2] <= qz && b[5] >= qz + 0.5) t = Math.max(t, b[4]);
    if (t === top - 0.5) low |= 1 << q;
  }
  return { boxes, covers, faces, inner, bottom: Math.min(...boxes.map((b) => b[1])), top, low };
}

/** Per form (shape id · 4 + turn: 0‥255; undefined where no shape has that id). */
export const FORMS: readonly (FormSpec | undefined)[] = Array.from({ length: 256 }, (_, f) => {
  const s = SHAPE_BY_ID[f >> 2];
  return s ? formOf(s, f & 3) : undefined;
});

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
