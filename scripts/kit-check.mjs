// Headless QA for the world kit: loads every studio section page (which builds
// every asset's variants), checks for page errors and error cards, and prints
// block counts and build times per variant against the kit's budgets.
//
//   node scripts/kit-check.mjs            # all sections
//   node scripts/kit-check.mjs 18.1 20    # some sections
//
// Env: SHOT_BASE=http://localhost:5173 to use a running dev server.
import { availableParallelism, loadavg } from 'node:os';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { chromiumPath } from './chromium.mjs';

const root = resolve(import.meta.dirname, '..');
const sections = process.argv.slice(2).length ? process.argv.slice(2) : ['15', '16', '17.1', '17.2', '18.1', '18.2', '19.1', '19.2', '20', '21.1', '21.2', '21.3'];
/** Blocks per piece (see the kit brief in docs/world-kit.md). */
const BUDGET = { '18.1/large-tree': 22000, '18.1/medium-tree': 8000, '18.1/jungle-cluster': 60000, '18.1/ground-foliage': 8000, '18.2/combinations': 5000, '18.1/palm-tree': 4000, '18.1/small-tree': 3000, '18.2': 1500, '19.1': 2500, '19.2': 3000, '20/broken-statue': 6000, '20/small-shrine': 6000, '20/offering-platform': 6000, '20/small-pond': 4000, '15': 8000, '16': 10000, '17.1': 5000, '17.2': 5000, '21.1': 1500, '21.2': 6000, '21.2/naga': 10000, '21.2/tower-tier': 30000, '21.2/lion': 8000, '21.3': 40000, default: 2500 };
const budgetOf = (id) => BUDGET[id] ?? BUDGET[id.split('/')[0]] ?? BUDGET.default;
/**
 * Build times are wall time in the page, so a busy machine inflates them all:
 * the "slow" limit (300 ms on an idle machine) grows with the load per CPU.
 */
const busy = Math.max(1, loadavg()[0] / availableParallelism());
const SLOW_MS = Math.round(300 * busy);
if (busy > 1.5) console.log(`(load ${loadavg()[0].toFixed(1)} on ${availableParallelism()} CPUs: builds count as slow above ${SLOW_MS} ms)`);

const server = process.env.SHOT_BASE ? null : await createServer({ root, logLevel: 'error', server: { port: 5197, strictPort: false } });
await server?.listen();
const base = process.env.SHOT_BASE ?? server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({
  executablePath: chromiumPath(),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

let problems = 0;
for (const section of sections) {
  const lines = [];
  const errors = [];
  page.removeAllListeners('console');
  page.removeAllListeners('pageerror');
  page.on('console', (m) => {
    const t = m.text();
    if (t.startsWith('[kit]')) lines.push(t);
    else if (m.type() === 'error' && !t.includes('404')) errors.push(t);
  });
  page.on('pageerror', (e) => errors.push(e.message));
  const t0 = Date.now();
  await page.goto(`${base}/studio.html?section=${section}&shot=1`, { waitUntil: 'load', timeout: 300_000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300_000 });
  const cards = await page.$$eval('.st-card', (cs) => cs.map((c) => ({ title: c.querySelector('h2')?.textContent?.trim(), error: c.classList.contains('st-error') })));
  console.log(`\n§${section} — ${cards.length} cards, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  for (const l of lines) {
    const m = /^\[kit\] (\S+) · (\S+) · seed (\d+): (\d+) blocks in (\d+) ms/.exec(l);
    if (!m) {
      if (!l.includes('studio built')) console.log(`  ${l}`);
      continue;
    }
    const [, id, variant, , blocks, ms] = m;
    const over = Number(blocks) > budgetOf(id);
    const slow = Number(ms) > SLOW_MS;
    if (over || slow) problems++;
    console.log(`  ${over || slow ? '!!' : 'ok'} ${id.padEnd(30)} ${variant.padEnd(16)} ${blocks.padStart(6)} blocks ${ms.padStart(5)} ms${over ? `  (budget ${budgetOf(id)})` : ''}${slow ? '  (slow)' : ''}`);
  }
  for (const c of cards) if (c.error) {
    problems++;
    console.log(`  !! error card: ${c.title}`);
  }
  for (const e of errors) {
    problems++;
    console.log(`  !! ${e}`);
  }
}
await browser.close();
await server?.close();
console.log(problems ? `\n${problems} problem(s)` : '\nall good');
process.exit(problems ? 1 : 0);
