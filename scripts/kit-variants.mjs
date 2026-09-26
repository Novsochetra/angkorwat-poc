// Builds every variant of every kit asset (two seeds each) in Node, without a
// browser: reports errors, block counts against the kit's budgets and build
// times. The studio's section pages (scripts/kit-check.mjs) only build the
// variants a card shows; this covers the rest.
//
//   node scripts/kit-variants.mjs            # all sections
//   node scripts/kit-variants.mjs 15 21.2    # some sections
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const root = resolve(import.meta.dirname, '..');
const all = ['15', '16', '17.1', '17.2', '18.1', '18.2', '19.1', '19.2', '20', '21.1', '21.2', '21.3'];
const sections = process.argv.slice(2).length ? process.argv.slice(2) : all;
/** Blocks per piece (the same table as scripts/kit-check.mjs). */
const BUDGET = { '18.1/large-tree': 22000, '18.1/medium-tree': 8000, '18.1/jungle-cluster': 60000, '18.1/ground-foliage': 8000, '18.2/combinations': 5000, '18.1/palm-tree': 4000, '18.1/small-tree': 3000, '18.2': 1500, '19.1': 2500, '19.2': 3000, '20/broken-statue': 6000, '20/small-shrine': 6000, '20/offering-platform': 6000, '20/small-pond': 4000, '15': 8000, '16': 10000, '17.1': 5000, '17.2': 5000, '21.1': 1500, '21.2': 6000, '21.2/naga': 10000, '21.2/tower-tier': 30000, '21.2/lion': 8000, '21.3': 40000, default: 2500 };
const budgetOf = (id) => BUDGET[id] ?? BUDGET[id.split('/')[0]] ?? BUDGET.default;
const SEEDS = [1, 2];

const server = await createServer({ root, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
let problems = 0;
try {
  for (const section of sections) {
    const dir = resolve(root, 'src/kit/assets', section);
    if (!existsSync(dir)) continue;
    console.log(`\n§${section}`);
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.startsWith('_')).sort()) {
      const id = `${section}/${f.replace(/\.ts$/, '')}`;
      let asset;
      try {
        asset = (await server.ssrLoadModule(`/src/kit/assets/${id}.ts`)).default;
      } catch (e) {
        problems++;
        console.log(`  !! ${id.padEnd(30)} failed to load: ${e.message}`);
        continue;
      }
      for (const v of asset.variants) {
        for (const seed of SEEDS) {
          const t = performance.now();
          try {
            const piece = asset.build({ variant: v.id, seed });
            const ms = performance.now() - t;
            const blocks = piece.voxels.boxes.length;
            const over = blocks > budgetOf(id);
            if (over) problems++;
            if (seed === SEEDS[0] || over) console.log(`  ${over ? '!!' : 'ok'} ${id.padEnd(30)} ${v.id.padEnd(18)} seed ${seed} ${String(blocks).padStart(6)} blocks ${ms.toFixed(0).padStart(5)} ms${over ? `  (budget ${budgetOf(id)})` : ''}`);
          } catch (e) {
            problems++;
            console.log(`  !! ${id.padEnd(30)} ${v.id.padEnd(18)} seed ${seed} threw: ${e.message}`);
          }
        }
      }
    }
  }
} finally {
  await server.close();
}
console.log(problems ? `\n${problems} problem(s)` : '\nall good');
process.exitCode = problems ? 1 : 0;
