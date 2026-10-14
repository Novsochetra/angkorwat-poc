import { progress } from '../progress';
import { MAT_BY_ID, SHAPE_BY_ID } from './kinds';
import { BLOCKS, CHUNK_CELLS, chunkI0, chunkJ0, chunkK0, chunkKey, rawMat, rawShape, type BlockStore } from './store';

/**
 * The player's blocks kept between visits (AWP-18): the store (store.ts
 * `BLOCKS`) as a run-length list in progress.ts (`angkor-map-progress-v1`,
 * key {@link SAVE_KEY}). No three.js.
 *
 * **The format** (version {@link SAVE_VERSION}; a later format reads the old
 * one by its `v`):
 *
 *     { v: 1, n: <blocks>, pal: [<raw>, …], chunks: [[cx, cy, cz, "<runs>"], …] }
 *
 * - `pal`: the different blocks in the build, each as one number (store.ts
 *   `rawOf`: colour + material · 2²⁴ + (shape · 4 + turn) · 2³²). Material and
 *   shape ids are only ever added (kinds.ts), so an old save always reads.
 * - `chunks`: the store's chunks (store.ts: cx, cz the walk map's chunk, cy
 *   the 16 m slice from y = 0), in the store's fixed order (`chunkList`).
 * - `runs`: the chunk's cells in the store's fixed order (`forEach`: rows
 *   along x, then z, then y: cell `lx + lz · 32 + ly · 1024`) as runs of one
 *   block: for each run three numbers, the empty cells skipped since the last
 *   run (from cell 0), its length − 1 and its block (an index into `pal`).
 *   Each number is written in 5-bit groups, low first, one letter each
 *   (`A‥Z a‥z 0‥9 - _`: 0‥31 a group and the last one, 32‥63 a group with
 *   more to come): a run is 3 to 7 letters; nothing in it needs escaping in
 *   JSON.
 * - `n`: the blocks in all the runs (a save cut short does not add up).
 *
 * **Reading** ({@link decodeBlocks}) checks everything before a block is
 * put: a broken, cut or edited save, one from a newer format, or one over the
 * limits ({@link SAVE_LIMITS}) leaves the plot empty and the console says
 * why (the save itself stays as it was until he builds again). A block of a
 * material or shape this build does not know (a save from a newer build) is
 * left out, and the console says how many.
 *
 * **Writing** ({@link startBlockSave}): after a change, once the blocks have
 * been still for {@link SAVE_AFTER_MS} (a footprint, a run of building: one
 * write; building on without a pause, every {@link SAVE_AT_MOST_MS}), and at
 * once when the page is hidden or closed. Shots and
 * `progress=0` read and write nothing (progress.ts `saving`), nor does a
 * test build (`pblocks=`: index.ts).
 */

/** The progress key. */
export const SAVE_KEY = 'blocks.plot';
/** The format written (and the newest read). */
export const SAVE_VERSION = 1;
/** After the last change, the save waits this long (ms) for more… */
export const SAVE_AFTER_MS = 1000;
/** …but no longer than this after the first change not saved (ms). */
export const SAVE_AT_MOST_MS = 10_000;
/**
 * More than this is a broken save (and is never written: the store's own
 * build would not load back). A full plot (`pblocks=full`) is 9,925 blocks in
 * 8 chunks and 11 kinds of block.
 */
export const SAVE_LIMITS = {
  blocks: 200_000,
  chunks: 128,
  kinds: 4096,
} as const;

/** The value kept under {@link SAVE_KEY}. */
export interface SavedBlocks {
  v: number;
  n: number;
  pal: number[];
  chunks: [number, number, number, string][];
}

const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const DIGIT = new Int8Array(128).fill(-1);
for (let d = 0; d < 64; d++) DIGIT[ABC.charCodeAt(d)] = d;
const P32 = 2 ** 32;

function put(out: string[], v: number): void {
  do {
    const d = v & 31;
    v >>>= 5;
    out.push(ABC[v ? d | 32 : d]);
  } while (v);
}

/** The store as a save (null: too big to save; the console says so). */
export function encodeBlocks(store: BlockStore = BLOCKS): SavedBlocks | null {
  const list = store.chunkList();
  if (store.count > SAVE_LIMITS.blocks || list.length > SAVE_LIMITS.chunks) {
    console.warn(`[blocks] too big to save: ${store.count} blocks in ${list.length} chunks (at most ${SAVE_LIMITS.blocks} in ${SAVE_LIMITS.chunks}); the last save is kept`);
    return null;
  }
  const pal: number[] = [];
  const palAt = new Map<number, number>();
  const chunks: SavedBlocks['chunks'] = [];
  let n = 0;
  for (const c of list) {
    const out: string[] = [];
    let end = 0;
    let at = 0;
    while (at < CHUNK_CELLS) {
      const v = c.cells[at];
      if (!v) {
        at++;
        continue;
      }
      const raw = v + c.form[at] * P32;
      const form = c.form[at];
      let len = 1;
      while (at + len < CHUNK_CELLS && c.cells[at + len] === v && c.form[at + len] === form) len++;
      let p = palAt.get(raw);
      if (p === undefined) {
        p = pal.length;
        pal.push(raw);
        palAt.set(raw, p);
      }
      put(out, at - end);
      put(out, len - 1);
      put(out, p);
      n += len;
      at += len;
      end = at;
    }
    chunks.push([c.cx, c.cy, c.cz, out.join('')]);
  }
  if (pal.length > SAVE_LIMITS.kinds) {
    console.warn(`[blocks] too many kinds of block to save (${pal.length}); the last save is kept`);
    return null;
  }
  return { v: SAVE_VERSION, n, pal, chunks };
}

/** A save read back: runs to put (`[chunk's first cell i, j, k, cell, length, raw]`), or why it cannot be read. */
export type DecodedBlocks = { ok: true; runs: number[][]; blocks: number; dropped: number } | { ok: false; why: string };

const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

/** Read a saved value (anything: it is checked whole before anything is put). */
export function decodeBlocks(value: unknown): DecodedBlocks {
  const no = (why: string): DecodedBlocks => ({ ok: false, why });
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return no('not a saved build');
  const s = value as Partial<SavedBlocks>;
  if (typeof s.v !== 'number' || !Number.isFinite(s.v)) return no('no format version');
  if (s.v > SAVE_VERSION) return no(`saved by a newer version of the game (format ${s.v}; this one reads up to ${SAVE_VERSION})`);
  if (s.v !== SAVE_VERSION) return no(`unknown format ${s.v}`);
  if (!isInt(s.n, 0, SAVE_LIMITS.blocks)) return no(`block count ${String(s.n).slice(0, 20)} is not 0‥${SAVE_LIMITS.blocks}`);
  if (!Array.isArray(s.pal) || s.pal.length > SAVE_LIMITS.kinds) return no('no list of blocks (or too long)');
  if (!Array.isArray(s.chunks) || s.chunks.length > SAVE_LIMITS.chunks) return no(`no list of chunks (or more than ${SAVE_LIMITS.chunks})`);
  // The kinds of block: a number each; an unknown material or shape (a newer build's) is left out (-1).
  const pal: number[] = [];
  for (const raw of s.pal as unknown[]) {
    if (!isInt(raw, 1, 2 ** 40 - 1) || raw % P32 < 2 ** 24) return no(`a block that is not one (${String(raw).slice(0, 20)})`);
    pal.push(MAT_BY_ID[rawMat(raw)] && SHAPE_BY_ID[rawShape(raw)] ? raw : -1);
  }
  const runs: number[][] = [];
  const seen = new Set<number>();
  let blocks = 0;
  let dropped = 0;
  for (const c of s.chunks as unknown[]) {
    if (!Array.isArray(c) || c.length !== 4) return no('a chunk that is not [cx, cy, cz, runs]');
    const [cx, cy, cz, text] = c as unknown[];
    if (!isInt(cx, -2048, 2047) || !isInt(cy, -1024, 1023) || !isInt(cz, -2048, 2047) || typeof text !== 'string') return no("a chunk out of the store's range");
    const key = chunkKey(cx, cy, cz);
    if (seen.has(key)) return no(`chunk ${cx},${cy},${cz} twice`);
    seen.add(key);
    const i0 = chunkI0(cx);
    const j0 = chunkJ0(cy);
    const k0 = chunkK0(cz);
    let pos = 0;
    let at = 0;
    const next = (): number => {
      let v = 0;
      for (let shift = 0; shift <= 10; shift += 5) {
        if (pos >= text.length) return -1;
        const ch = text.charCodeAt(pos++);
        const d = ch < 128 ? DIGIT[ch] : -1;
        if (d < 0) return -2;
        v |= (d & 31) << shift;
        if (d < 32) return v;
      }
      return -3;
    };
    while (pos < text.length) {
      const gap = next();
      const len = next() + 1;
      const p = next();
      if (gap < 0 || len < 1 || p < 0) return no(`chunk ${cx},${cy},${cz}: its runs are cut short or not runs`);
      at += gap;
      if (at + len > CHUNK_CELLS) return no(`chunk ${cx},${cy},${cz}: a run past its end (${at + len} cells)`);
      if (p >= pal.length) return no(`chunk ${cx},${cy},${cz}: a block not in the list (${p})`);
      blocks += len;
      if (blocks > SAVE_LIMITS.blocks) return no(`more than ${SAVE_LIMITS.blocks} blocks`);
      if (pal[p] < 0) dropped += len;
      else runs.push([i0, j0, k0, at, len, pal[p]]);
      at += len;
    }
  }
  if (blocks !== s.n) return no(`${blocks} blocks in the runs, ${s.n} written (cut short?)`);
  return { ok: true, runs, blocks: blocks - dropped, dropped };
}

/** Put decoded runs into the store (one change). */
function putRuns(store: BlockStore, runs: readonly number[][]): void {
  store.batch(() => {
    for (const [i0, j0, k0, at0, len, raw] of runs) for (let at = at0; at < at0 + len; at++) store.setRaw(i0 + (at & 31), j0 + (at >> 10), k0 + ((at >> 5) & 31), raw);
  });
}

/** What the save did (checks: `__blocks.save`). */
export interface BlockSaveStatus {
  /** Read and written (false: a shot, `progress=0`, a test build). */
  saving: boolean;
  /** What was read at the start: blocks put, left out (unknown kinds), why nothing was (if so), ms. */
  loaded: { blocks: number; dropped: number; why: string | null; ms: number };
  /** Writes so far, the last one's size (characters of JSON) and time (ms). */
  writes: number;
  size: number;
  ms: number;
}

/**
 * Read the saved build into the store (empty at the start), then keep it
 * saved as it changes. `off`: why nothing is read or written (a test build).
 */
export function startBlockSave(store: BlockStore = BLOCKS, off: string | null = null): { status: BlockSaveStatus; flush(): void } {
  const status: BlockSaveStatus = {
    saving: progress.saving && !off,
    loaded: { blocks: 0, dropped: 0, why: null, ms: 0 },
    writes: 0,
    size: 0,
    ms: 0,
  };
  const flush = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (!pending) return;
    pending = false;
    const t0 = performance.now();
    const saved = encodeBlocks(store);
    if (!saved) return;
    if (saved.n) {
      progress.set(SAVE_KEY, saved as unknown as Parameters<typeof progress.set>[1]);
      status.size = JSON.stringify(saved).length;
    } else {
      progress.set(SAVE_KEY, null);
      status.size = 0;
    }
    status.writes++;
    status.ms = performance.now() - t0;
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = false;
  if (!status.saving) {
    if (off) console.info(`[blocks] not saved: ${off}`);
    return { status, flush };
  }
  const t0 = performance.now();
  const value: unknown = progress.get(SAVE_KEY, null, (v): v is null => v !== undefined);
  if (value !== null) {
    const d = decodeBlocks(value);
    if (!d.ok) {
      status.loaded.why = d.why;
      console.warn(`[blocks] the saved build was not loaded (${d.why}): the plot starts empty`);
    } else {
      putRuns(store, d.runs);
      status.loaded.blocks = d.blocks;
      status.loaded.dropped = d.dropped;
      if (d.dropped) console.warn(`[blocks] ${d.dropped} saved blocks of a kind this version does not know were left out`);
    }
  }
  status.loaded.ms = performance.now() - t0;
  if (status.loaded.blocks) console.info(`[blocks] saved build loaded: ${status.loaded.blocks} blocks (${status.loaded.ms.toFixed(1)} ms)`);
  let since = 0;
  store.onChange(() => {
    const now = performance.now();
    if (!pending) since = now;
    pending = true;
    if (timer !== undefined) clearTimeout(timer);
    // (building on and on: saved at least every SAVE_AT_MOST_MS all the same)
    timer = setTimeout(flush, now - since >= SAVE_AT_MOST_MS ? 0 : SAVE_AFTER_MS);
  });
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  return { status, flush };
}
