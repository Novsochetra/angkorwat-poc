import { WALK_GRID } from '../roam/walkmap';
import { BLOCK_MATS, BLOCK_SHAPES, MAT_BY_ID, SHAPE_BY_ID, type BlockMatKey, type BlockShapeKey } from './kinds';

/**
 * The player's block layer: the blocks he builds with, apart from the baked
 * world (whose meshes are made once in the build workers and never change:
 * map/work/build.ts). A sparse store cut into chunks (this file, no three.js:
 * the walk map, the save, the build add-ons read it), drawn by view.ts (a
 * mesh per chunk and block family, made again only when a block in or next
 * to that chunk changes, only the sides that can be seen).
 *
 * **The grid.** A block is a cell of {@link BLOCK_M} = 0.5 m: the walk map's
 * column (roam/walkmap.ts `WALK_GRID`: one block, one column, so his feet
 * and the camera see exactly the blocks), the temple kit's block
 * (scale.ts `TEMPLE_BLOCK_M`), a third of the explorer's height; a full block
 * (0.5 m) is a step too high to walk up (`CHARACTER_STEP_M` 0.42), a slab
 * (0.25 m, kinds.ts) a stair's rise. Cell (i, j, k) is the box from
 * (i, j, k) · 0.5 m to (i + 1, j + 1, k + 1) · 0.5 m in world metres
 * ({@link cellOf}, {@link cellMin}).
 *
 * **Chunks** are 32 cells a side: 16 m, the walk map's chunks exactly (the
 * same corner, `WALK_GRID`: a chunk's (cx, cz) is the walk map's chunk), so
 * a change rebuilds one walk-map chunk (AWP-17), and a home plot (about
 * 20 m) spans a few chunks: a few draws a family. Smaller chunks would cost
 * a draw each per family; bigger ones a slower rebuild (it is linear in the
 * chunk's cells and blocks: on an M1 Max ≈ 0.4 ms for a chunk of 3,000
 * blocks after one change, 1.1–1.5 ms for a chunk filled whole or every other
 * cell; view.ts `bench`).
 * Vertically too (cy: 16 m slices from y = 0). A chunk holds its cells
 * densely (32 768: 4 bytes + 1 a cell, 160 kB), made at its first block,
 * dropped at its last.
 *
 * **A block** ({@link Block}): its material (kinds.ts `BLOCK_MATS`: timber,
 * bamboo, thatch, laterite, sandstone, brick; drawn with the map's own
 * families), its colour (sRGB hex: paint, AWP-22), its shape (`BLOCK_SHAPES`:
 * cube, slab; stairs AWP-24) and a quarter turn (0‥3, for the shapes that
 * turn). As one number ({@link rawOf}, {@link blockOf}): colour + material ·
 * 2²⁴ + (shape · 4 + turn) · 2³²; 0 is no block. Equal blocks are equal
 * numbers: a save's runs (AWP-18).
 *
 * **Changes.** {@link BlockStore.set} / {@link BlockStore.setRaw} /
 * {@link BlockStore.fill} change cells; {@link BlockStore.batch} groups many
 * (a footprint, a loaded save: AWP-20, AWP-18) into one change. Each change
 * tells the listeners ({@link BlockStore.onChange}) once, after it is done:
 * the chunks whose cells changed (`changed`: the walk map rebuilds those),
 * the chunks that see a changed cell (`touched`: those and their neighbours
 * when a cell on their edge changed; the view draws those again, each once),
 * the box of the changed cells, and the store's `version`.
 *
 * **Reading**: {@link BlockStore.get}, `raw`, `solid` (the walk map),
 * `count` and `countIn` (a plot's budget, AWP-19), `forEach` (every block in
 * a fixed order: chunk by chunk, each by rows along x, then z, then y: what a
 * run-length save walks), `chunkList`, `chunkAt`.
 *
 * `BLOCKS` is the map's store (one for the map, as `BUILD` and `GARDEN`).
 */

/** A block's size (m): the walk map's column. */
export const BLOCK_M = WALK_GRID.res;
/** Cells a chunk side. */
export const CHUNK_N = 32;
/** A chunk's side (m): the walk map's chunk. */
export const CHUNK_M = CHUNK_N * BLOCK_M;
/** Cells a chunk. */
export const CHUNK_CELLS = CHUNK_N * CHUNK_N * CHUNK_N;
/** The cell at chunk (0, 0, 0)'s corner (the walk map's grid corner; y from 0). */
const I0 = Math.round(WALK_GRID.x0 / BLOCK_M);
const K0 = Math.round(WALK_GRID.z0 / BLOCK_M);
if (WALK_GRID.chunk !== CHUNK_M || I0 * BLOCK_M !== WALK_GRID.x0 || K0 * BLOCK_M !== WALK_GRID.z0) throw new Error('[blocks] the walk map grid changed: keep the blocks on it');

/** The cell a world coordinate (m) is in, along one axis. */
export const cellOf = (m: number): number => Math.floor(m / BLOCK_M);
/** A cell's low edge (m), along one axis. */
export const cellMin = (i: number): number => i * BLOCK_M;
/** A cell's middle (m), along one axis. */
export const cellMid = (i: number): number => (i + 0.5) * BLOCK_M;

/** One block, as read and written (`color` defaults to its material's; `shape` cube; `turn` 0). */
export interface Block {
  mat: BlockMatKey;
  /** sRGB hex. */
  color?: number;
  shape?: BlockShapeKey;
  /** Quarter turns about y (0‥3). */
  turn?: number;
}

const P24 = 2 ** 24;
const P32 = 2 ** 32;

/** A block as one number (0: no block). */
export function rawOf(b: Block | null): number {
  if (!b) return 0;
  const m = BLOCK_MATS[b.mat];
  if (!m) throw new Error(`[blocks] no material "${b.mat}"`);
  const s = BLOCK_SHAPES[b.shape ?? 'cube'];
  if (!s) throw new Error(`[blocks] no shape "${b.shape}"`);
  const color = (b.color ?? m.color) & 0xffffff;
  return color + m.id * P24 + (s.id * 4 + ((b.turn ?? 0) & 3)) * P32;
}

/** A number of {@link rawOf} as a block (null: none, or a material or shape this build does not know). */
export function blockOf(raw: number): Block | null {
  if (!raw) return null;
  const mat = MAT_BY_ID[Math.floor(raw / P24) % 256];
  const form = Math.floor(raw / P32);
  const shape = SHAPE_BY_ID[form >> 2];
  if (!mat || !shape) return null;
  return { mat: mat.key, color: raw % P24, shape: shape.key, turn: form & 3 };
}

/** A raw block's parts (no object made): material id, colour, shape id, turn. */
export const rawMat = (raw: number): number => Math.floor(raw / P24) % 256;
export const rawColor = (raw: number): number => raw % P24;
export const rawShape = (raw: number): number => Math.floor(raw / P32) >> 2;
export const rawTurn = (raw: number): number => Math.floor(raw / P32) & 3;

/** A chunk of the store. Read only outside the store. */
export interface BlockChunk {
  /** {@link chunkKey}. */
  readonly key: number;
  /** Its place in chunks: (cx, cz) the walk map's chunk; cy the 16 m slice from y = 0. */
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  /** Its first cell (its low corner). */
  readonly i0: number;
  readonly j0: number;
  readonly k0: number;
  /** Blocks in it. */
  count: number;
  /** Per cell (`lx + lz · 32 + ly · 1024`): colour (bits 0‥23) and material id (24‥31); 0 empty. */
  readonly cells: Uint32Array;
  /** Per cell: shape id · 4 + turn. */
  readonly form: Uint8Array;
  /** Bumped at every change of a cell in it. */
  version: number;
}

/** A chunk's place as one number (cx, cz from −2048, cy from −1024). */
export const chunkKey = (cx: number, cy: number, cz: number): number => ((cy + 1024) * 4096 + (cz + 2048)) * 4096 + (cx + 2048);
/** A chunk's place from its key. */
export function chunkPlace(key: number): { cx: number; cy: number; cz: number } {
  return { cx: (key % 4096) - 2048, cz: (Math.floor(key / 4096) % 4096) - 2048, cy: Math.floor(key / 4096 / 4096) - 1024 };
}
/** The chunk a cell is in, along x / y / z. */
export const chunkX = (i: number): number => Math.floor((i - I0) / CHUNK_N);
export const chunkY = (j: number): number => Math.floor(j / CHUNK_N);
export const chunkZ = (k: number): number => Math.floor((k - K0) / CHUNK_N);
/** A chunk's first cell along x / y / z. */
export const chunkI0 = (cx: number): number => I0 + cx * CHUNK_N;
export const chunkJ0 = (cy: number): number => cy * CHUNK_N;
export const chunkK0 = (cz: number): number => K0 + cz * CHUNK_N;
/** A cell's index in its chunk (local x, y, z: 0‥31). */
export const cellIndex = (lx: number, ly: number, lz: number): number => lx + lz * CHUNK_N + ly * CHUNK_N * CHUNK_N;

/** A box of cells, both ends in. */
export interface CellBounds {
  i0: number;
  j0: number;
  k0: number;
  i1: number;
  j1: number;
  k1: number;
}

/** What one change did (told once it is done: one set, one fill, one batch). */
export interface BlockChange {
  /** The store's version after it. */
  readonly version: number;
  /** Cells that changed. */
  readonly cells: number;
  /** The chunks whose cells changed ({@link chunkKey}s; the walk map's chunks to build again). */
  readonly changed: readonly number[];
  /** The chunks that see a changed cell (`changed` and their neighbours across an edge a changed cell lies on): drawn again. */
  readonly touched: readonly number[];
  /** Round the changed cells. */
  readonly box: Readonly<CellBounds>;
}

export class BlockStore {
  private readonly chunks = new Map<number, BlockChunk>();
  private readonly listeners: ((c: BlockChange) => void)[] = [];
  private total = 0;
  private depth = 0;
  private readonly pendChanged = new Set<number>();
  private readonly pendTouched = new Set<number>();
  private pendCells = 0;
  private readonly box: CellBounds = { i0: 0, j0: 0, k0: 0, i1: 0, j1: 0, k1: 0 };
  /** Bumped once per change told. */
  version = 0;

  /** Blocks in the store. */
  get count(): number {
    return this.total;
  }

  /** The block in a cell (null: none). */
  get(i: number, j: number, k: number): Block | null {
    return blockOf(this.raw(i, j, k));
  }

  /** The block in a cell as one number (0: none). */
  raw(i: number, j: number, k: number): number {
    const c = this.chunks.get(chunkKey(chunkX(i), chunkY(j), chunkZ(k)));
    if (!c) return 0;
    const at = cellIndex(i - c.i0, j - c.j0, k - c.k0);
    const v = c.cells[at];
    return v ? v + c.form[at] * P32 : 0;
  }

  /** A block he stands on and is stopped by is in the cell (any shape: a slab fills its lower half). */
  solid(i: number, j: number, k: number): boolean {
    const c = this.chunks.get(chunkKey(chunkX(i), chunkY(j), chunkZ(k)));
    if (!c) return false;
    const id = c.cells[cellIndex(i - c.i0, j - c.j0, k - c.k0)] >>> 24;
    return id !== 0 && MAT_BY_ID[id]?.solid === true;
  }

  /** Put a block in a cell, or take it away (null). Returns whether the cell changed. */
  set(i: number, j: number, k: number, b: Block | null): boolean {
    return this.setRaw(i, j, k, rawOf(b));
  }

  /** {@link set} with a block as one number ({@link rawOf}). */
  setRaw(i: number, j: number, k: number, raw: number): boolean {
    if (raw && (!MAT_BY_ID[rawMat(raw)] || !SHAPE_BY_ID[rawShape(raw)])) throw new Error(`[blocks] not a block: ${raw}`);
    const cx = chunkX(i);
    const cy = chunkY(j);
    const cz = chunkZ(k);
    const key = chunkKey(cx, cy, cz);
    let c = this.chunks.get(key);
    if (!c) {
      if (!raw) return false;
      c = { key, cx, cy, cz, i0: chunkI0(cx), j0: chunkJ0(cy), k0: chunkK0(cz), count: 0, cells: new Uint32Array(CHUNK_CELLS), form: new Uint8Array(CHUNK_CELLS), version: 0 };
      this.chunks.set(key, c);
    }
    const lx = i - c.i0;
    const ly = j - c.j0;
    const lz = k - c.k0;
    const at = cellIndex(lx, ly, lz);
    const cell = raw ? (raw % P32) >>> 0 : 0;
    const form = raw ? Math.floor(raw / P32) & 255 : 0;
    const was = c.cells[at];
    if (was === cell && (c.form[at] === form || !cell)) return false;
    c.cells[at] = cell;
    c.form[at] = form;
    const d = (cell ? 1 : 0) - (was ? 1 : 0);
    c.count += d;
    this.total += d;
    c.version++;
    this.note(i, j, k, c, lx, ly, lz);
    if (!c.count) this.chunks.delete(key);
    if (!this.depth) this.tell();
    return true;
  }

  /** Fill a box of cells (both ends in) with a block, or empty it (null): one change. Returns the cells changed. */
  fill(i0: number, j0: number, k0: number, i1: number, j1: number, k1: number, b: Block | null): number {
    const raw = rawOf(b);
    let n = 0;
    this.batch(() => {
      for (let j = Math.min(j0, j1); j <= Math.max(j0, j1); j++)
        for (let k = Math.min(k0, k1); k <= Math.max(k0, k1); k++) for (let i = Math.min(i0, i1); i <= Math.max(i0, i1); i++) if (this.setRaw(i, j, k, raw)) n++;
    });
    return n;
  }

  /** Make many changes as one: the listeners are told once, at the end (batches may nest). */
  batch(fn: () => void): void {
    this.depth++;
    try {
      fn();
    } finally {
      this.depth--;
      if (!this.depth) this.tell();
    }
  }

  /** Take every block away (one change). */
  clear(): void {
    this.batch(() => {
      for (const c of [...this.chunks.values()])
        for (let at = 0; at < CHUNK_CELLS && c.count; at++) {
          if (!c.cells[at]) continue;
          const lx = at % CHUNK_N;
          const lz = Math.floor(at / CHUNK_N) % CHUNK_N;
          const ly = Math.floor(at / (CHUNK_N * CHUNK_N));
          this.setRaw(c.i0 + lx, c.j0 + ly, c.k0 + lz, 0);
        }
    });
  }

  /** Be told after each change; returns a function that stops it. */
  onChange(fn: (c: BlockChange) => void): () => void {
    this.listeners.push(fn);
    return () => {
      const at = this.listeners.indexOf(fn);
      if (at >= 0) this.listeners.splice(at, 1);
    };
  }

  /** Blocks in a box of cells (both ends in): a plot's budget. */
  countIn(b: CellBounds): number {
    let n = 0;
    for (const c of this.chunks.values()) {
      const x0 = Math.max(b.i0, c.i0) - c.i0;
      const x1 = Math.min(b.i1, c.i0 + CHUNK_N - 1) - c.i0;
      const y0 = Math.max(b.j0, c.j0) - c.j0;
      const y1 = Math.min(b.j1, c.j0 + CHUNK_N - 1) - c.j0;
      const z0 = Math.max(b.k0, c.k0) - c.k0;
      const z1 = Math.min(b.k1, c.k0 + CHUNK_N - 1) - c.k0;
      if (x0 > x1 || y0 > y1 || z0 > z1) continue;
      if (x0 === 0 && y0 === 0 && z0 === 0 && x1 === CHUNK_N - 1 && y1 === CHUNK_N - 1 && z1 === CHUNK_N - 1) {
        n += c.count;
        continue;
      }
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (c.cells[cellIndex(x, y, z)]) n++;
    }
    return n;
  }

  /** The chunk with this key (undefined: no block there). */
  chunkAt(key: number): BlockChunk | undefined {
    return this.chunks.get(key);
  }

  /** The chunks that hold blocks, by key (the order `forEach` walks). */
  chunkList(): BlockChunk[] {
    return [...this.chunks.values()].sort((a, b) => a.key - b.key);
  }

  /** Every block, in a fixed order (chunk by chunk by key; in each, rows along x, then z, then y), as one number. */
  forEach(fn: (i: number, j: number, k: number, raw: number) => void): void {
    for (const c of this.chunkList())
      for (let at = 0; at < CHUNK_CELLS; at++) {
        const v = c.cells[at];
        if (!v) continue;
        fn(c.i0 + (at % CHUNK_N), c.j0 + Math.floor(at / (CHUNK_N * CHUNK_N)), c.k0 + (Math.floor(at / CHUNK_N) % CHUNK_N), v + c.form[at] * P32);
      }
  }

  /** Note a changed cell for the next change told. */
  private note(i: number, j: number, k: number, c: BlockChunk, lx: number, ly: number, lz: number): void {
    const b = this.box;
    if (!this.pendCells) {
      b.i0 = b.i1 = i;
      b.j0 = b.j1 = j;
      b.k0 = b.k1 = k;
    } else {
      b.i0 = Math.min(b.i0, i);
      b.i1 = Math.max(b.i1, i);
      b.j0 = Math.min(b.j0, j);
      b.j1 = Math.max(b.j1, j);
      b.k0 = Math.min(b.k0, k);
      b.k1 = Math.max(b.k1, k);
    }
    this.pendCells++;
    this.pendChanged.add(c.key);
    // (the chunks across each edge it lies on see it: its sides, its shade)
    const x0 = lx === 0 ? -1 : 0;
    const x1 = lx === CHUNK_N - 1 ? 1 : 0;
    const y0 = ly === 0 ? -1 : 0;
    const y1 = ly === CHUNK_N - 1 ? 1 : 0;
    const z0 = lz === 0 ? -1 : 0;
    const z1 = lz === CHUNK_N - 1 ? 1 : 0;
    for (let dy = y0; dy <= y1; dy++) for (let dz = z0; dz <= z1; dz++) for (let dx = x0; dx <= x1; dx++) this.pendTouched.add(chunkKey(c.cx + dx, c.cy + dy, c.cz + dz));
  }

  /** Tell the listeners about the changes noted (none: nothing). */
  private tell(): void {
    if (!this.pendCells) return;
    this.version++;
    const change: BlockChange = { version: this.version, cells: this.pendCells, changed: [...this.pendChanged], touched: [...this.pendTouched], box: { ...this.box } };
    this.pendCells = 0;
    this.pendChanged.clear();
    this.pendTouched.clear();
    for (const fn of [...this.listeners]) fn(change);
  }
}

/** The map's player blocks. */
export const BLOCKS = new BlockStore();
