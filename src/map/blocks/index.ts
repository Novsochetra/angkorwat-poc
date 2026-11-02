import type { MapContext } from '../types';
import { fillDemo } from './demo';
import { decodeBlocks, encodeBlocks, startBlockSave } from './save';
import { WATCHED } from './walk';
import { BLOCKS, blockOf, rawOf } from './store';
import { buildBlocksView, type BlocksPart } from './view';

/**
 * The player's block layer (the part `blocks`, main.ts): the store
 * (store.ts `BLOCKS`), drawn by view.ts. Shots and the dev server only
 * (never on the live site, where a link's values would put blocks into a
 * player's map, and into his save; as roam/_build.ts's `build=`):
 * `pblocks=demo|full[@x,z]` fills it with a test build (demo.ts; then the
 * saved build is neither read nor written), and `window.__blocks` (`store`,
 * `stats()`, `bench(runs)`, `flush()`, `rawOf`, `blockOf`, `save`: its
 * `status`, `flush()`, `encode()`, `decode(value)`; `walk`: the walk maps
 * that read the blocks, walk.ts) is there for checks.
 *
 * The build is kept between visits (save.ts: read here, before the view is
 * made, then written after each change; shots and `progress=0` keep nothing).
 */
export function buildBlocks(ctx: MapContext): BlocksPart {
  const checks = ctx.shot || import.meta.env.DEV;
  const spec = checks ? new URLSearchParams(location.search).get('pblocks') : null;
  // (a test build is never saved, nor mixed with the saved one)
  const save = startBlockSave(BLOCKS, spec ? `pblocks=${spec} is a test build` : null);
  if (spec) {
    const t0 = performance.now();
    const n = fillDemo(spec, ctx.field);
    console.info(`[blocks] pblocks=${spec}: ${n} blocks in ${BLOCKS.chunkList().length} chunks (${(performance.now() - t0).toFixed(1)} ms)`);
  }
  const part = buildBlocksView(ctx);
  if (checks)
    (window as unknown as { __blocks: unknown }).__blocks = {
      store: BLOCKS,
      stats: part.stats,
      bench: part.bench,
      flush: part.flush,
      rawOf,
      blockOf,
      save: { status: save.status, flush: save.flush, encode: encodeBlocks, decode: decodeBlocks },
      // (the walk maps that read the blocks, once roaming is built: [walk, hard], roam/world.ts)
      walk: WATCHED,
    };
  return part;
}
