// Measure the world map while nobody plays it: how many frames it draws and
// how busy the machine is, on the production build, in Chromium on the GPU.
//
//   npm run idle                              # build this checkout, serve it, measure the four cases
//   npm run idle -- base=<dir>                # another checkout instead (e.g. a git worktree of HEAD)
//   npm run idle -- url="graphics=high"       # added to the page's URL (after `story=0`)
//   npm run idle -- out=idle.json             # everything as JSON (relative to the repo, or absolute)
//   npm run idle -- vs=idle-before.json       # the table with the change against an earlier JSON
//   npm run idle -- secs=10 settle=3          # seconds measured per case; seconds after Start before the overview
//   npm run idle -- build=0                   # serve the last build of that checkout again (no new build)
//
// Env: W, H, DPR the viewport (1440 × 900 at 2; also `w=`, `h=`, `dpr=`); IDLE_DIR where the builds go
// (os.tmpdir()/angkor-idle, outside the repo); CHROMIUM a Chromium with a GPU.
//
// It builds the checkout with `vite build` (all its pages, its own vite.config.ts and .env) into IDLE_DIR,
// serves that with `vite preview` on 127.0.0.1, and opens `index.html?story=0` in Playwright's full
// Chromium on the GPU (Metal, as scripts/perf.mjs), in a fresh profile (a first visit: graphics auto).
// The cases, one after the other in the same page:
//  - wait: the build is done and the loading screen's "Start" button shows (`#loading .ld-go`);
//    nobody clicks it for `secs`;
//  - overview: Start clicked, `settle` s later, `secs` hands off;
//  - input: `secs` of the mouse moving over the canvas every 100 ms;
//  - blurred: the page loses focus (focus emulation off, a second tab brought to the front: the page
//    stays visible, `document.hasFocus()` false, `blur` fires), `secs` more.
// Per case:
//  - frames/s: calls of `window.post.render` (the map drawn), and `last 5 s` the same over the case's
//    last 5 s (a throttle that starts a few seconds in); rAF/s: animation frames the page was given;
//  - busy %: the main thread's tasks (CDP Performance.getMetrics `TaskDuration` delta ÷ its `Timestamp`
//    delta); script %: the part of it in JS (`ScriptDuration`; the rest is style, layout, paint: CSS
//    animations run there too, `stylePct`, `layoutPct`, `otherPct` in the JSON, with `mainCpuPct` the main
//    thread's CPU time, `ThreadTime`); renderer %: the page's process CPU
//    (`ProcessTime`, all its threads); GPU proc %: Chromium's GPU process CPU (CDP SystemInfo); these are
//    what Chrome's Task Manager shows. GPU util %: macOS's whole-machine GPU "Device Utilization %"
//    (ioreg, sampled 4 times a second: other apps count too; `idle GPU` is the machine before the browser);
//  - render / update ms a frame: JS time in `post.render` (three's draw calls: the GPU draws after)
//    and in all the parts' `update` (window.parts, each wrapped), and their share of the main thread.
// Other work on the machine (a dev browser, builds, shots) makes the numbers noisy: run twice. A case
// marked * had another Playwright browser (shots, perf, a video) running at its start or end.
// Requests to other hosts than the preview and Google Fonts are not resolved (the analytics never leave).
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { build, preview } from 'vite';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const argv = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const i = a.indexOf('=');
    return i < 0 ? [a, '1'] : [a.slice(0, i), a.slice(i + 1)];
  }),
);
const file = (p) => (isAbsolute(p) ? p : resolve(root, p));
const W = Number(argv.w ?? process.env.W ?? 1440);
const H = Number(argv.h ?? process.env.H ?? 900);
const DPR = Number(argv.dpr ?? process.env.DPR ?? 2);
const SECS = Number(argv.secs ?? 10);
const SETTLE = Number(argv.settle ?? 3);
const dir = resolve(argv.base ?? root);
if (!existsSync(join(dir, 'vite.config.ts'))) throw new Error(`idle: no vite.config.ts in ${dir}`);
const vs = argv.vs ? JSON.parse(readFileSync(file(argv.vs), 'utf8')) : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Playwright's full Chromium (it draws with the GPU headless; the headless shell does not): as perf.mjs. */
function gpuChromium() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), process.platform === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright');
  const app = process.platform === 'darwin' ? 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' : 'chrome-linux/chrome';
  for (const d of existsSync(cache) ? readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : []) {
    const exe = join(cache, d, app);
    if (existsSync(exe)) return exe;
  }
  return undefined;
}

/** The checkout's commit, and whether its tree has changes. */
function gitState(cwd) {
  try {
    const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd }).toString().trim();
    const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd }).toString().trim().length > 0;
    return { commit, dirty };
  } catch {
    return { commit: '', dirty: false };
  }
}

/** Playwright browsers running now (shots, perf, a video: they make the numbers noisy): their main processes. */
function browsersRunning() {
  try {
    return execFileSync('ps', ['-Ao', 'pid,command'], { encoding: 'utf8' })
      .split('\n')
      .filter((l) => /chrome-headless-shell|Google Chrome for Testing/.test(l) && !l.includes('--type='))
      .map((l) => Number(l.trim().split(/\s+/)[0]));
  } catch {
    return [];
  }
}

/**
 * The whole machine's GPU use on macOS (ioreg's "Device Utilization %"), sampled every 250 ms in the
 * background: `mean(from, to)` over a stretch of `Date.now()`.
 */
function gpuSampler() {
  const samples = [];
  let on = process.platform === 'darwin';
  const read = () =>
    new Promise((res) =>
      execFile('ioreg', ['-r', '-d', '1', '-w', '0', '-c', 'IOAccelerator'], { timeout: 2000 }, (err, out) => {
        const m = !err && /"Device Utilization %"=(\d+)/.exec(out);
        res(m ? Number(m[1]) : null);
      }),
    );
  (async () => {
    while (on) {
      const t = Date.now();
      const v = await read();
      if (v === null) {
        on = false;
        break;
      }
      samples.push([t, v]);
      await sleep(Math.max(0, 250 - (Date.now() - t)));
    }
  })();
  return {
    mean(from, to) {
      const xs = samples.filter(([t]) => t >= from && t <= to).map(([, v]) => v);
      return xs.length ? { pct: xs.reduce((a, b) => a + b, 0) / xs.length, samples: xs.length } : null;
    },
    stop() {
      on = false;
    },
  };
}

/** In the page, before its scripts: count and time `post.render`, each part's `update` and the animation frames. */
function instrument() {
  const S = { renders: 0, renderMs: 0, renderAt: [], updateMs: 0, steps: 0, parts: {}, ticks: 0, rafCalls: 0, rafMs: 0, lastTs: -1, post: false };
  window.__idle = S;
  // (rAF: the animation frames the page gets, and the JS they run: the map's tick and the rest)
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function (cb) {
    return raf((ts) => {
      if (ts !== S.lastTs) {
        S.lastTs = ts;
        S.ticks++;
      }
      S.rafCalls++;
      const t0 = performance.now();
      try {
        return cb(ts);
      } finally {
        S.rafMs += performance.now() - t0;
      }
    });
  };
  // (each part's update, timed; parts added later are wrapped at the next render; the first part's calls count the steps)
  const wrapParts = () => {
    const parts = window.parts;
    if (!Array.isArray(parts)) return;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p || typeof p.update !== 'function' || p.update.__idle) continue;
      const u = p.update;
      const name = p.name ?? String(i);
      const first = i === 0;
      const w = function (...a) {
        if (first) S.steps++;
        const t0 = performance.now();
        try {
          return u.apply(this, a);
        } finally {
          const d = performance.now() - t0;
          S.updateMs += d;
          S.parts[name] = (S.parts[name] ?? 0) + d;
        }
      };
      w.__idle = true;
      p.update = w;
    }
  };
  const wrapPost = (v) => {
    if (!v || typeof v.render !== 'function' || v.render.__idle) return;
    const r = v.render;
    const w = function (...a) {
      wrapParts();
      S.renders++;
      const t0 = performance.now();
      S.renderAt.push(t0);
      try {
        return r.apply(this, a);
      } finally {
        S.renderMs += performance.now() - t0;
      }
    };
    w.__idle = true;
    v.render = w;
    S.post = true;
  };
  // (main.ts hands them to the window with Object.assign: caught as they are set, before the first frame)
  let post;
  let parts;
  Object.defineProperty(window, 'post', {
    configurable: true,
    enumerable: true,
    get: () => post,
    set: (v) => {
      post = v;
      wrapPost(v);
    },
  });
  Object.defineProperty(window, 'parts', {
    configurable: true,
    enumerable: true,
    get: () => parts,
    set: (v) => {
      parts = v;
      wrapParts();
    },
  });
}

// ── Build and serve ─────────────────────────────────────────────────────────
const git = gitState(dir);
const idleDir = process.env.IDLE_DIR ?? join(tmpdir(), 'angkor-idle');
const outDir = join(idleDir, `${basename(dir)}-${createHash('sha1').update(dir).digest('hex').slice(0, 8)}`);
const configFile = join(dir, 'vite.config.ts');
let buildMs = null;
if (argv.build === '0' && existsSync(join(outDir, 'index.html'))) console.log(`idle: the last build of ${dir} (${outDir})`);
else {
  console.log(`idle: building ${dir} (${git.commit}${git.dirty ? ' + changes' : ''}) into ${outDir}`);
  const t = Date.now();
  await build({ root: dir, configFile, logLevel: 'warn', build: { outDir, emptyOutDir: true } });
  buildMs = Date.now() - t;
}
const server = await preview({ root: dir, configFile, logLevel: 'error', build: { outDir }, preview: { host: '127.0.0.1', port: 4319, strictPort: false, open: false } });
const origin = new URL(server.resolvedUrls.local[0]).origin;
const url = `${origin}/index.html?story=0${argv.url ? `&${argv.url}` : ''}`;

// ── The machine at rest, then the browser ──────────────────────────────────
const othersBefore = browsersRunning();
if (othersBefore.length) console.warn(`idle: ${othersBefore.length} other headless browser(s) running (pid ${othersBefore.join(', ')}): the numbers will be noisy`);
const gpu = gpuSampler();
const rest0 = Date.now();
await sleep(3000);
const idleGpu = gpu.mean(rest0, Date.now());
// (another app drawing — a browser with the map open, a video — takes the GPU from the page: its frames/s drop)
if (idleGpu && idleGpu.pct > 30) console.warn(`idle: the GPU is already ${idleGpu.pct.toFixed(0)} % busy before the browser starts (another app drawing?): frames/s will be low`);

const browser = await chromium.launch({
  executablePath: gpuChromium(),
  // (only the preview and the fonts resolve: the analytics' requests fail in the browser, nothing leaves)
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost, EXCLUDE fonts.googleapis.com, EXCLUDE fonts.gstatic.com'],
});
const bcdp = await browser.newBrowserCDPSession();
/** Other Playwright browsers now (not ours): checked at each case's start and end. */
const ours = new Set(browsersRunning().filter((pid) => !othersBefore.includes(pid)));
const others = () => browsersRunning().filter((pid) => !ours.has(pid));
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
await context.addInitScript(instrument);
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Performance.enable');
const mapLog = [];
const failedHosts = {};
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
page.on('console', (m) => {
  const text = m.text();
  if (text.startsWith('[map]')) mapLog.push(text);
  if (m.type() === 'error' && !/ERR_NAME_NOT_RESOLVED|Failed to load resource/.test(text)) console.log('[error]', text.slice(0, 300));
});
page.on('requestfailed', (r) => {
  const host = new URL(r.url()).host;
  failedHosts[host] = (failedHosts[host] ?? 0) + 1;
});

/** Everything counted at one moment: the page's own counters, the main thread's metrics, the processes' CPU. */
async function snap() {
  const [p, m, procs] = await Promise.all([
    page.evaluate(() => {
      const S = window.__idle;
      const r = window.renderer;
      return {
        now: performance.now(),
        renders: S.renders,
        renderMs: S.renderMs,
        updateMs: S.updateMs,
        steps: S.steps,
        ticks: S.ticks,
        rafMs: S.rafMs,
        parts: { ...S.parts },
        post: S.post,
        level: window.graphicsNow?.level ?? null,
        ratio: r?.getPixelRatio?.() ?? null,
        canvas: r ? [r.domElement.width, r.domElement.height] : null,
        focus: document.hasFocus(),
        visibility: document.visibilityState,
        loading: !!document.getElementById('loading'),
      };
    }),
    cdp.send('Performance.getMetrics'),
    bcdp.send('SystemInfo.getProcessInfo').catch(() => ({ processInfo: [] })),
  ]);
  const metric = Object.fromEntries(m.metrics.map((x) => [x.name, x.value]));
  const cpu = {};
  for (const x of procs.processInfo) cpu[x.type] = (cpu[x.type] ?? 0) + x.cpuTime;
  return { at: Date.now(), hr: performance.now(), page: p, metric, cpu, others: others() };
}

const q = (xs, p) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))];
};
const cases = [];
/** One case: counters before, `during` (it waits `secs`), counters after. */
async function measure(name, during) {
  const a = await snap();
  await during();
  const b = await snap();
  const wall = (b.hr - a.hr) / 1000;
  const mt = b.metric.Timestamp - a.metric.Timestamp;
  const pageSecs = (b.page.now - a.page.now) / 1000;
  const pct = (k) => (100 * (b.metric[k] - a.metric[k])) / mt;
  const frames = b.page.renders - a.page.renders;
  const renderMs = b.page.renderMs - a.page.renderMs;
  const updateMs = b.page.updateMs - a.page.updateMs;
  const steps = b.page.steps - a.page.steps;
  // (the frames' times in the page: per whole second, and the gaps between them)
  const at = await page.evaluate(([from, to]) => window.__idle.renderAt.filter((t) => t >= from && t < to), [a.page.now, b.page.now]);
  const perSecond = Array.from({ length: Math.floor(pageSecs + 1e-6) }, (_, i) => at.filter((t) => t >= a.page.now + i * 1000 && t < a.page.now + (i + 1) * 1000).length);
  const last5From = b.page.now - 5000;
  const gaps = at.slice(1).map((t, i) => t - at[i]);
  const parts = Object.fromEntries(
    Object.entries(b.page.parts)
      .map(([k, v]) => [k, (v - (a.page.parts[k] ?? 0)) / Math.max(1, steps)])
      .sort((x, y) => y[1] - x[1])
      .slice(0, 8)
      .map(([k, v]) => [k, +v.toFixed(3)]),
  );
  const g = gpu.mean(a.at, b.at);
  const c = {
    name,
    secs: +wall.toFixed(2),
    post: b.page.post,
    frames,
    fps: frames / pageSecs,
    fpsLast5: at.filter((t) => t >= last5From).length / 5,
    rafPerSec: (b.page.ticks - a.page.ticks) / pageSecs,
    stepsPerSec: steps / pageSecs,
    perSecond,
    gapMs: { median: q(gaps, 0.5), p95: q(gaps, 0.95), max: gaps.length ? Math.max(...gaps) : NaN },
    busyPct: pct('TaskDuration'),
    scriptPct: pct('ScriptDuration'),
    stylePct: pct('RecalcStyleDuration'),
    layoutPct: pct('LayoutDuration'),
    otherPct: pct('TaskOtherDuration'),
    mainCpuPct: pct('ThreadTime'),
    rendererCpuPct: pct('ProcessTime'),
    gpuProcCpuPct: b.cpu.GPU !== undefined && a.cpu.GPU !== undefined ? (100 * (b.cpu.GPU - a.cpu.GPU)) / wall : null,
    browserCpuPct: b.cpu.browser !== undefined && a.cpu.browser !== undefined ? (100 * (b.cpu.browser - a.cpu.browser)) / wall : null,
    gpuUtilPct: g?.pct ?? null,
    gpuUtilSamples: g?.samples ?? 0,
    renderMsPerFrame: frames ? renderMs / frames : null,
    updateMsPerFrame: steps ? updateMs / steps : null,
    renderPct: renderMs / 10 / pageSecs,
    updatePct: updateMs / 10 / pageSecs,
    rafPct: (b.page.rafMs - a.page.rafMs) / 10 / pageSecs,
    heapMB: b.metric.JSHeapUsedSize / 1048576,
    parts,
    level: [a.page.level, b.page.level],
    ratio: [a.page.ratio, b.page.ratio],
    canvas: b.page.canvas,
    focus: [a.page.focus, b.page.focus],
    visibility: b.page.visibility,
    loadingScreen: [a.page.loading, b.page.loading],
    otherBrowsers: [...new Set([...a.others, ...b.others])],
  };
  cases.push(c);
  const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '–');
  console.log(`idle: ${name.padEnd(8)} ${f1(c.fps)} frames/s (last 5 s ${f1(c.fpsLast5)}) · rAF ${f1(c.rafPerSec)}/s · busy ${f1(c.busyPct)} % · per second ${perSecond.join(' ')}${c.otherBrowsers.length ? ` · NOISY: another headless browser ran (pid ${c.otherBrowsers.join(', ')})` : ''}`);
  return c;
}

// ── The cases ───────────────────────────────────────────────────────────────
const t0 = Date.now();
await page.goto(url, { waitUntil: 'load', timeout: 300_000 });
await page.locator('#loading .ld-go').waitFor({ state: 'visible', timeout: 300_000 });
const loadSecs = (Date.now() - t0) / 1000;
const gpuName = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
});
console.log(`idle: ${url} · ${W}×${H} at ${DPR} · Start shows after ${loadSecs.toFixed(1)} s · ${gpuName}`);

await measure('wait', () => sleep(SECS * 1000));

await page.click('#loading .ld-go');
await sleep(SETTLE * 1000);
await measure('overview', () => sleep(SECS * 1000));

await measure('input', async () => {
  // (a small ellipse round the middle of the screen, a move every 100 ms, on a fixed clock)
  const s = Date.now();
  for (let i = 0; i < SECS * 10; i++) {
    const a = i * 0.3;
    await page.mouse.move(W / 2 + 160 * Math.cos(a), H / 2 + 90 * Math.sin(a));
    await sleep(Math.max(0, s + (i + 1) * 100 - Date.now()));
  }
});

// (Playwright makes every page believe it has focus: off, then another tab in front; the page stays visible)
await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });
const other = await context.newPage();
await other.bringToFront();
await measure('blurred', () => sleep(SECS * 1000));
await other.close();

gpu.stop();
const chromiumVersion = browser.version();
await browser.close();
const noisy = cases.filter((c) => c.otherBrowsers.length).map((c) => c.name);
await server.close();

// ── The table ───────────────────────────────────────────────────────────────
const f1 = (v) => (v === null || !Number.isFinite(v) ? '–' : v.toFixed(1));
const f2 = (v) => (v === null || !Number.isFinite(v) ? '–' : v.toFixed(2));
const d = (a, b, fmt) => (b === undefined || b === null || !Number.isFinite(b) || !Number.isFinite(a) ? '' : ` (${a - b >= 0 ? '+' : ''}${fmt(a - b)})`);
console.log(`\nidle: ${dir} ${git.commit}${git.dirty ? ' + changes' : ''} · ${W}×${H} at ${DPR} · ${SECS} s a case · idle GPU ${f1(idleGpu?.pct ?? null)} %`);
const cols = ['case', 'frames/s', 'last 5 s', 'rAF/s', 'busy %', 'script %', 'renderer %', 'GPU proc %', 'GPU util %', 'render ms/fr', 'update ms/fr', 'render %', 'update %', 'level', 'ratio', 'canvas', 'focus'];
const rows = cases.map((c) => {
  const was = vs?.cases?.find((x) => x.name === c.name);
  return [
    c.name + (c.otherBrowsers.length ? ' *' : ''),
    f1(c.fps) + d(c.fps, was?.fps, f1),
    f1(c.fpsLast5),
    f1(c.rafPerSec),
    f1(c.busyPct) + d(c.busyPct, was?.busyPct, f1),
    f1(c.scriptPct),
    f1(c.rendererCpuPct) + d(c.rendererCpuPct, was?.rendererCpuPct, f1),
    f1(c.gpuProcCpuPct) + d(c.gpuProcCpuPct, was?.gpuProcCpuPct, f1),
    f1(c.gpuUtilPct) + d(c.gpuUtilPct, was?.gpuUtilPct, f1),
    f2(c.renderMsPerFrame),
    f2(c.updateMsPerFrame),
    f1(c.renderPct),
    f1(c.updatePct),
    c.level[0] === c.level[1] ? String(c.level[1]) : c.level.join('→'),
    c.ratio[0] === c.ratio[1] ? String(c.ratio[1]) : c.ratio.join('→'),
    c.canvas ? c.canvas.join('×') : '–',
    c.focus[1] ? 'yes' : 'no',
  ];
});
const widths = cols.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
const line = (r) => r.map((v, i) => (i === 0 ? v.padEnd(widths[i]) : v.padStart(widths[i]))).join('  ');
console.log(line(cols));
for (const r of rows) console.log(line(r));
if (noisy.length) console.warn(`idle: * another headless browser ran during ${noisy.join(', ')}: run again for clean numbers`);
if (Object.keys(failedHosts).length) console.log(`idle: requests not let out: ${Object.entries(failedHosts).map(([h, n]) => `${h} ${n}`).join(', ')}`);

if (argv.out) {
  const out = file(argv.out);
  writeFileSync(
    out,
    JSON.stringify({ date: new Date().toISOString(), dir, ...git, url: url.slice(origin.length), viewport: [W, H], dpr: DPR, secs: SECS, settle: SETTLE, chromium: chromiumVersion, gpu: gpuName, buildMs, loadSecs, idleGpuPct: idleGpu?.pct ?? null, otherBrowsersBefore: othersBefore, noisy, mapLog, failedHosts, cases }, null, 1),
  );
  console.log(`idle: ${out}`);
}
