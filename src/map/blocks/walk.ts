import type { WalkBlocks } from '../roam/walkmap';
import { FORMS, MAT_BY_ID } from './kinds';
import { BLOCKS, BLOCK_M, CHUNK_N, cellOf, chunkPlace, rawMat, type BlockStore } from './store';

/**
 * The player's blocks in the walk map (AWP-17): a source the walk map reads
 * when it builds one of its 16 m chunks (roam/walkmap.ts `WalkBlocks`), and
 * the hook that has it build again only the chunks a change touched. No
 * three.js.
 *
 * A store chunk's (cx, cz) is the walk map's chunk, and a cell's column is the
 * walk map's column (store.ts: the same grid), so a chunk's columns are read
 * straight from its cells: each run of solid cells up a column (kinds.ts
 * `solid`) is one span, from its lowest cell's bottom to its highest cell's
 * top (a shape's boxes, turned: a slab's top is half a cell, 0.25 m, up). A
 * stair (AWP-24: kinds.ts `stair`, `stairOuter`, `stairInner`) is solid to its
 * top in the column, and its tread is told with the span (`low`: the quarters
 * of the column half a cell lower): the walk map stands feet there 0.25 m
 * lower (roam/walkmap.ts `standAt`), so he walks up a stair of them a rise of
 * 0.25 m at a time, as up slab steps, and is stopped by a stair's back
 * (0.5 m, a jump).
 */

/**
 * The highest rise of the player's blocks the feet step up without a jump
 * (m): a slab's (0.25 m) is a stair's rise, a full block's (0.5 m) is not:
 * Space jumps onto it. (Under the explorer's step, scale.ts
 * `CHARACTER_STEP_M` 0.42, as a block must stay a wall to the walker's
 * search for a free spot too, which looks 0.1 m over his feet: walker.ts
 * `freeSpot`.)
 */
export const BLOCK_STEP_M = 0.35;

/** Per form (shape id · 4 + turn): its boxes' lowest bottom and highest top in the cell (0‥1), and its tread's quarters (kinds.ts `FormSpec.low`). */
const FORM_SPAN: readonly (readonly [number, number, number] | undefined)[] = FORMS.map((f) => (f ? ([f.bottom, f.top, f.low] as const) : undefined));

/** A raw block's form (shape id · 4 + turn). */
const rawForm = (raw: number): number => Math.floor(raw / 2 ** 32) & 255;

/** Per material id: solid (1) or not (0). */
const SOLID = Uint8Array.from({ length: 256 }, (_, id) => (MAT_BY_ID[id]?.solid ? 1 : 0));

/** The walk map's source of the store's blocks. */
export function walkBlocks(store: BlockStore = BLOCKS): WalkBlocks {
  // (each column's run so far: its bottom (NaN: none) and top, m)
  const from = new Float64Array(CHUNK_N * CHUNK_N);
  const to = new Float64Array(CHUNK_N * CHUNK_N);
  // (the run's top cell's tread quarters)
  const low = new Uint8Array(CHUNK_N * CHUNK_N);
  const layer = CHUNK_N * CHUNK_N;
  return {
    spans(a, b, put) {
      // (the chunks of this column of chunks, lowest first: chunkList is sorted by key, cy first; in each, the
      // cells in the order they are kept, a layer at a time, so a column's runs come bottom to top)
      for (const c of store.chunkList()) {
        if (c.cx !== a || c.cz !== b) continue;
        const { cells, form } = c;
        from.fill(NaN);
        for (let ly = 0, at = 0; ly < CHUNK_N; ly++) {
          const j = c.j0 + ly;
          for (let col = 0; col < layer; col++, at++) {
            const v = cells[at];
            const span = v && SOLID[v >>> 24] ? FORM_SPAN[form[at]] : undefined;
            if (span) {
              if (Number.isNaN(from[col])) from[col] = (j + span[0]) * BLOCK_M;
              to[col] = (j + span[1]) * BLOCK_M;
              low[col] = span[2];
            } else if (!Number.isNaN(from[col])) {
              put(col, from[col], to[col], low[col]);
              from[col] = NaN;
            }
          }
        }
        for (let col = 0; col < layer; col++) if (!Number.isNaN(from[col])) put(col, from[col], to[col], low[col]);
      }
    },
  };
}

/**
 * Part of the segment a → b (0‥1) free of the player's solid blocks, from a
 * (1: none in the way), sampled every quarter metre as the walk map's
 * `clearance` (a slab fills the lower half of its cell). For the follow
 * camera (world.ownClearance): a built wall nearer than it otherwise comes.
 */
export function blockClearance(ax: number, ay: number, az: number, bx: number, by: number, bz: number, store: BlockStore = BLOCKS): number {
  if (!store.count) return 1;
  const len = Math.hypot(bx - ax, by - ay, bz - az);
  const n = Math.max(1, Math.ceil(len / (BLOCK_M * 0.5)));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const y = ay + (by - ay) * t;
    const j = cellOf(y);
    const raw = store.raw(cellOf(ax + (bx - ax) * t), j, cellOf(az + (bz - az) * t));
    if (!raw || !SOLID[rawMat(raw)]) continue;
    const span = FORM_SPAN[rawForm(raw)];
    if (span && y >= (j + span[0]) * BLOCK_M && y < (j + span[1]) * BLOCK_M) return (i - 1) / n;
  }
  return 1;
}

/** The walk maps told of the changes (checks: `__blocks.walk`, index.ts). */
export const WATCHED: unknown[] = [];

/**
 * Tell walk maps of every change of the store: each builds again the chunks
 * whose cells changed (`BlockChange.changed`), when it is next asked about
 * them. Returns a function that stops it.
 */
export function watchBlocks(maps: readonly { changed(a: number, b: number): void }[], store: BlockStore = BLOCKS): () => void {
  WATCHED.push(...maps);
  return store.onChange((c) => {
    for (const key of c.changed) {
      const { cx, cz } = chunkPlace(key);
      for (const m of maps) m.changed(cx, cz);
    }
  });
}

/** Feet at `y` on (x, z) stand on a timber or bamboo block's top (his steps sound of wood: world.woodAt). */
export function woodBlockAt(x: number, z: number, y: number, store: BlockStore = BLOCKS): boolean {
  if (!store.count) return false;
  const j = cellOf(y - 0.05);
  const raw = store.raw(cellOf(x), j, cellOf(z));
  if (!raw || MAT_BY_ID[rawMat(raw)]?.family !== 'mapBark') return false;
  const span = FORM_SPAN[rawForm(raw)];
  // (on its top, or on a stair's tread half a cell under it)
  return !!span && (Math.abs(y - (j + span[1]) * BLOCK_M) < 0.12 || (span[2] !== 0 && Math.abs(y - (j + span[1] - 0.5) * BLOCK_M) < 0.12));
}
