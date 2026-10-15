import { turnToward } from './kinds';
import { BLOCKS, type Block, type BlockStore } from './store';

/**
 * Roofs of the player's blocks that read as roofs (AWP-24): a roof built as
 * steps of full blocks (a row a cell higher and a cell further in each time,
 * 45°) gets a stair in each step, so its slope is smooth (0.25 m treads and
 * rises), and a slab on its ridge. No three.js.
 *
 * - {@link smoothRoof}: the one call. Give it the roof's cells (the stepped
 *   full blocks, as built); each cell with nothing over it gets, in the cell
 *   over it (the step), the shape that fills that step, in the block's own
 *   material and colour: a `stair` climbing towards the roof cell beside the
 *   step one row up, a `stairInner` where two such cells meet at a right
 *   angle (an L-shaped roof's valley side), a `stairOuter` where one lies
 *   only across a corner (a hip roof's corner), a `slab` on the ridge (no roof
 *   cell higher round it) or between two higher ones. So the roof is two
 *   blocks deep at every step: no sky through it but the pinhole any layer of
 *   blocks shows where four corners meet, seen straight up (mesh.ts `diagonalJoints`:
 *   a roof one cell deep meets the next row only along an edge).
 * - {@link gableRoof}: a whole gable over a rectangle (the steep Khmer
 *   gable, 45°: rows of full blocks from the eaves on the two long sides up
 *   to the ridge), its gable ends filled under it if asked, then smoothed
 *   ({@link smoothRoof}) unless `stepped`.
 *
 * Every write goes through one `store.batch`: one change, each touched chunk
 * drawn and its walk map built again once.
 */

/** A cell (i, j, k). */
export type Cell = readonly [number, number, number];

/** The four ways along the ground (dx, dz) and the four corners. */
const SIDES: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const CORNERS: readonly (readonly [number, number])[] = [
  [1, 1],
  [1, -1],
  [-1, -1],
  [-1, 1],
];

const key = (i: number, j: number, k: number): string => `${i},${j},${k}`;

/** The turn of a corner shape (kinds.ts `stairOuter`, `stairInner`) whose high quarter (outer) or missing low quarter's opposite (inner) points to (sx, sz) (±1 each). */
const cornerTurn = (sx: number, sz: number): number => (sx > 0 ? (sz > 0 ? 0 : 1) : sz < 0 ? 2 : 3);

/**
 * The block for the step over roof cell (i, j, k): what lies round that step
 * one row up among the roof's cells decides the shape. `roof(i, j, k)`: is it
 * a roof cell. Null: nothing to put (no step there).
 */
export function stepBlock(roof: (i: number, j: number, k: number) => boolean, i: number, j: number, k: number, under: Block): Block | null {
  const up = j + 1;
  const sides: (readonly [number, number])[] = [];
  for (const d of SIDES) if (roof(i + d[0], up, k + d[1])) sides.push(d);
  const base = { mat: under.mat, color: under.color };
  if (sides.length === 1) return { ...base, shape: 'stair', turn: turnToward(sides[0][0], sides[0][1]) };
  if (sides.length === 2 && sides[0][0] !== -sides[1][0] && sides[0][1] !== -sides[1][1])
    return { ...base, shape: 'stairInner', turn: cornerTurn(sides[0][0] + sides[1][0], sides[0][1] + sides[1][1]) };
  if (sides.length === 0) {
    for (const c of CORNERS) if (roof(i + c[0], up, k + c[1])) return { ...base, shape: 'stairOuter', turn: cornerTurn(c[0], c[1]) };
  }
  // (the ridge: nothing higher round it; or between higher roof on opposite sides)
  return { ...base, shape: 'slab' };
}

/**
 * Smooth a stepped roof: each of its cells (`cells`: the roof's full blocks,
 * as built) with an empty cell over it gets the block that fills that step
 * ({@link stepBlock}, in its own material and colour). Cells already filled
 * (the next row of a roof two deep, a wall, a finial) are left as they are.
 * Returns the cells it put a block in (to take them down with the roof).
 */
export function smoothRoof(cells: Iterable<Cell>, store: BlockStore = BLOCKS): Cell[] {
  const set = new Set<string>();
  const list: Cell[] = [];
  for (const c of cells) {
    set.add(key(c[0], c[1], c[2]));
    list.push(c);
  }
  const roof = (i: number, j: number, k: number) => set.has(key(i, j, k));
  const put: Cell[] = [];
  store.batch(() => {
    for (const [i, j, k] of list) {
      if (store.raw(i, j + 1, k) || roof(i, j + 1, k)) continue;
      const under = store.get(i, j, k);
      if (!under) continue;
      const b = stepBlock(roof, i, j, k, under);
      if (b && store.set(i, j + 1, k, b)) put.push([i, j + 1, k]);
    }
  });
  return put;
}

/** A gable roof over a rectangle of cells (see {@link gableRoof}). */
export interface GableSpec {
  /** The roof's cells along the ground, both ends in (eaves and overhangs included). */
  i0: number;
  k0: number;
  i1: number;
  k1: number;
  /** The level (cell j) of its eave rows. */
  j: number;
  /** The ridge runs along x (the eaves on the ±z sides) or along z. */
  ridge: 'x' | 'z';
  /** Its blocks (thatch, timber, brick, painted…): the steps and their stairs alike. */
  block: Block;
  /** Leave the steps as full blocks (the old look: no stairs, no ridge slab). */
  stepped?: boolean;
  /** The gable ends: this block fills the triangle under the roof, `inset` cells in from each end (null: open). */
  ends?: { block: Block; inset: number } | null;
}

/**
 * A steep Khmer gable (45°): rows of full blocks from the two eaves, a cell
 * up and a cell in a row, to the ridge (two cells wide over an even width,
 * one over an odd), then the gable ends under it, then the steps smoothed
 * ({@link smoothRoof}) unless `stepped`. One change. Returns the roof's cells
 * (the stepped rows), the cells smoothing filled (`steps`) and the blocks put
 * in all (with the gable ends).
 */
export function gableRoof(spec: GableSpec, store: BlockStore = BLOCKS): { roof: Cell[]; steps: Cell[]; blocks: number } {
  const { j, block } = spec;
  const along = spec.ridge === 'x';
  // (a: along the ridge; b: across it, from eave to eave)
  const a0 = along ? spec.i0 : spec.k0;
  const a1 = along ? spec.i1 : spec.k1;
  const b0 = along ? spec.k0 : spec.i0;
  const b1 = along ? spec.k1 : spec.i1;
  const cell = (a: number, y: number, b: number): Cell => (along ? [a, y, b] : [b, y, a]);
  const roof: Cell[] = [];
  let steps: Cell[] = [];
  const before = store.count;
  store.batch(() => {
    for (let r = 0; b0 + r <= b1 - r; r++) {
      for (let a = a0; a <= a1; a++) {
        roof.push(cell(a, j + r, b0 + r));
        if (b1 - r !== b0 + r) roof.push(cell(a, j + r, b1 - r));
      }
      const e = spec.ends;
      if (e && r > 0)
        for (const a of [a0 + e.inset, a1 - e.inset]) for (let b = b0 + r + 1; b <= b1 - r - 1; b++) store.set(...cell(a, j + r, b), e.block);
    }
    for (const c of roof) store.set(c[0], c[1], c[2], block);
    if (!spec.stepped) steps = smoothRoof(roof, store);
  });
  return { roof, steps, blocks: store.count - before };
}
