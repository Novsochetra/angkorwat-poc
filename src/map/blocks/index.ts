import type { MapContext } from '../types';
import { fillDemo } from './demo';
import { BLOCKS } from './store';
import { buildBlocksView, type BlocksPart } from './view';

/**
 * The player's block layer (the part `blocks`, main.ts): the store
 * (store.ts `BLOCKS`), drawn by view.ts. `pblocks=demo|full[@x,z]` in the
 * URL fills it with a test build (demo.ts; nothing is saved). Shots and the
 * dev server: `window.__blocks` (`store`, `stats()`, `bench(runs)`,
 * `flush()`).
 */
export function buildBlocks(ctx: MapContext): BlocksPart {
  const spec = new URLSearchParams(location.search).get('pblocks');
  if (spec) {
    const t0 = performance.now();
    const n = fillDemo(spec, ctx.field);
    console.info(`[blocks] pblocks=${spec}: ${n} blocks in ${BLOCKS.chunkList().length} chunks (${(performance.now() - t0).toFixed(1)} ms)`);
  }
  const part = buildBlocksView(ctx);
  if (ctx.shot || import.meta.env.DEV) (window as unknown as { __blocks: unknown }).__blocks = { store: BLOCKS, stats: part.stats, bench: part.bench, flush: part.flush };
  return part;
}
