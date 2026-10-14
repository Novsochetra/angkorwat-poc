import type { MapContext } from '../types';
import { fillDemo } from './demo';
import { BLOCKS, blockOf, rawOf } from './store';
import { buildBlocksView, type BlocksPart } from './view';

/**
 * The player's block layer (the part `blocks`, main.ts): the store
 * (store.ts `BLOCKS`), drawn by view.ts. Shots and the dev server only
 * (never on the live site, where a link's values would put blocks into a
 * player's map, and soon into his save; as roam/_build.ts's `build=`):
 * `pblocks=demo|full[@x,z]` fills it with a test build (demo.ts; nothing is
 * saved), and `window.__blocks` (`store`, `stats()`, `bench(runs)`,
 * `flush()`, `rawOf`, `blockOf`) is there for checks.
 */
export function buildBlocks(ctx: MapContext): BlocksPart {
  const checks = ctx.shot || import.meta.env.DEV;
  const spec = checks ? new URLSearchParams(location.search).get('pblocks') : null;
  if (spec) {
    const t0 = performance.now();
    const n = fillDemo(spec, ctx.field);
    console.info(`[blocks] pblocks=${spec}: ${n} blocks in ${BLOCKS.chunkList().length} chunks (${(performance.now() - t0).toFixed(1)} ms)`);
  }
  const part = buildBlocksView(ctx);
  if (checks) (window as unknown as { __blocks: unknown }).__blocks = { store: BLOCKS, stats: part.stats, bench: part.bench, flush: part.flush, rawOf, blockOf };
  return part;
}
