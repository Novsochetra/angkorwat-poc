// Capture viewer / game states with headless Chromium.
//
//   node scripts/screenshots.mjs                      # default set
//   node scripts/screenshots.mjs front="view=0&zoom=full" game="@game.html?shot=1"
//
// Each arg is name=query (viewer.html) or name=@page?query for another page.
// Output: screenshots/<name>.png
//
// Env: SHOT_W / SHOT_H viewport (1280×800), SHOT_FULL=1 capture the whole page,
// SHOT_OUT=dir output folder, SHOT_BASE=http://localhost:5173 use a running dev
// server instead of starting one (faster when taking many shots).
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { chromiumPath } from './chromium.mjs';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, process.env.SHOT_OUT ?? 'screenshots');
mkdirSync(out, { recursive: true });

const defaults = {
  turnaround: 'turnaround=1',
  front: 'view=0',
  side: 'view=90',
  back: 'view=180',
  face: 'view=0&zoom=head',
};
const args = process.argv.slice(2);
const width = Number(process.env.SHOT_W ?? 1280);
const height = Number(process.env.SHOT_H ?? 800);
const shots = args.length
  ? Object.fromEntries(
      args.map((a) => {
        const i = a.indexOf('=');
        return [a.slice(0, i), a.slice(i + 1)];
      }),
    )
  : defaults;

// (no live reload: files may change while shooting)
const server = process.env.SHOT_BASE ? null : await createServer({ root, logLevel: 'error', server: { port: 5199, strictPort: false, hmr: false } });
await server?.listen();
const base = process.env.SHOT_BASE ?? `http://localhost:${server.resolvedUrls?.local?.[0] ? new URL(server.resolvedUrls.local[0]).port : (server.config.server.port ?? 5199)}`;

const executablePath = chromiumPath();
const browser = await chromium.launch({
  executablePath,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width, height } });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning' || /^\[(angkor|kit|map)\]/.test(m.text())) console.log(`[${m.type()}]`, m.text());
});

for (const [name, spec] of Object.entries(shots)) {
  const url = spec.startsWith('@') ? `${base}/${spec.slice(1)}` : `${base}/viewer.html?shot=1&${spec}`;
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 300_000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180_000 });
  await page.screenshot({ path: resolve(out, `${name}.png`), timeout: 240_000, fullPage: process.env.SHOT_FULL === '1' });
  console.log(`${name}: ${url} (${Date.now() - t0} ms)`);
}

await browser.close();
await server?.close();
