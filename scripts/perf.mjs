// Measure the world map's frame on the GPU: how long a frame takes, draw
// calls, triangles and shader programs, for a set of views × graphics levels.
//
//   npm run perf                               # every view × low, medium, phone
//   npm run perf -- only=overview,village      # only these views
//   npm run perf -- levels=low,phone           # only these setups (low, medium, high, max, phone, phone-medium)
//   npm run perf -- frames=120 warm=40         # frames measured one by one per case, after warm-up frames
//   npm run perf -- out=perf.json              # everything as JSON (relative to the repo, or absolute)
//   npm run perf -- base=perf-before.json      # the table with the change against an earlier JSON
//   npm run perf -- parts=1                    # each part's draws, triangles (picture and shadow) and CPU
//   npm run perf -- meshes=40                  # the 40 costliest meshes (part › object path)
//   npm run perf -- ablate=hamlet,people       # each named part's ms a frame (the frames again with it hidden)
//   npm run perf -- ablate=paddies:rice        # (a name with ':') the meshes whose name starts so, hidden together
//   npm run perf -- url="parts=terrain,water"  # added to every page's URL
//
// It opens `index.html?shot=1&video=1` (the video's frame-by-frame page,
// main.ts `__videoFrame`) in Playwright's full Chromium on the GPU (Metal),
// lets the view settle, then measures:
//  - frame: frames drawn back to back as a live page draws them (the CPU
//    runs ahead while the GPU draws), in batches of 20; ms a frame, the
//    median batch. The live page's cost: the larger of CPU and GPU;
//  - cpu: one by one, the JS of a frame (the parts' updates, three's draw
//    calls); wall: the same frame until the GPU is done (the GPU idles
//    between such frames and runs slower: only for the shadow frames' extra);
//  - draws and triangles (renderer.info, the shadow pass apart), shader
//    programs, and with `parts=1` a frame with the shadow map drawn, counted
//    per part (who each drawn object belongs to).
// The shadow map is drawn when the live page would draw it (a still draws it
// every frame): every `shadowEvery` frames, never while still shadows stand
// (low and medium) but the first. The M1 Max's GPU is about 5–8 times an
// iPhone's (15–30 a mid Android's), its CPU about the same as an iPhone's:
// a phone is GPU-bound where this machine is CPU-bound (the walks on low).
// (GPU timer queries on ANGLE/Metal measure about twice the frame: only in
// the JSON, as `gpu`.)
//
// Views: the overview, the night, a walk in the floating village, the rice
// paddies, the east village and market, the Kulen picnic, a hang glider high
// over the map, the overview and the market walk in snow, a walk by the east
// paddies, the overview and the village walk at dusk with the day turning
// (`dusk`, `duskwalk`: `TURNING`; with `shadows=live` the page draws the
// shadow map as the live page does, the still map (low, medium) again each
// time the light has turned: `max` is the worst frame, `shadow +` the extra
// of the frames that draw some of it) (`only=` picks; the default is all but
// the snow, the dusk and the east paddies). Env: PERF_W / PERF_H the desktop viewport (1280×720);
// CHROMIUM=path a Chromium with a GPU. Other work on the machine (shots, a
// video, builds) makes the times noisy (compare runs made one after the
// other); draws and triangles are exact. A page whose part failed to load
// (a dev server busy re-bundling) is loaded once more.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const argv = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const i = a.indexOf('=');
    return i < 0 ? [a, '1'] : [a.slice(0, i), a.slice(i + 1)];
  }),
);

/** The views (index.html's URL values). */
const VIEWS = {
  overview: '',
  night: 'night=1',
  village: 'roam=walk&at=-304,63&yaw=225&sim=w:1&rcam=0,16,9',
  paddies: 'roam=walk&at=-196,83&yaw=270&sim=_:0.2',
  east: 'roam=walk&at=336,-110&yaw=0&sim=_:0.2&rcam=180,18,12',
  kulen: 'roam=walk&at=410,-290&yaw=90&sim=_:0.2',
  hang: 'roam=hang&at=0,160,60&yaw=180&sim=_:0.3',
  snow: 'weather=snow',
  snowwalk: 'weather=snow&roam=walk&at=336,-110&yaw=0&sim=_:0.2&rcam=180,18,12',
  eastpaddies: 'roam=walk&at=396,10&yaw=0&sim=_:0.2',
  // (walking into the market's stalls: `east` stands by it facing away)
  market: 'roam=walk&at=330,-100&yaw=160&sim=_:0.2&rcam=180,14,9',
  // (the day turning at dusk, the shadow map drawn when the live page draws it: `TURNING`)
  dusk: 'shadows=live',
  duskwalk: 'shadows=live&roam=walk&at=-304,63&yaw=225&sim=w:1&rcam=0,16,9',
};
/**
 * Views where the day turns: the clock at the start, and how many times as
 * fast as the live day (360 s): from dusk into the night the key light turns
 * fastest, and the still shadow map (low, medium) is drawn again each time it
 * has turned `STILL_TURN` (graphics.ts).
 */
const TURNING = { dusk: [0.26, 4], duskwalk: [0.26, 4] };
const W = Number(process.env.PERF_W ?? 1280);
const H = Number(process.env.PERF_H ?? 720);
/** Graphics levels and screens: a phone is 844 × 390 CSS px on its side (the low level draws 1 pixel per CSS px). */
const SETUPS = {
  low: { query: 'graphics=low', w: W, h: H },
  medium: { query: 'graphics=medium', w: W, h: H },
  high: { query: 'graphics=high', w: W, h: H },
  max: { query: 'graphics=max', w: W, h: H },
  phone: { query: 'graphics=low&phone=1', w: 844, h: 390 },
  'phone-medium': { query: 'graphics=medium&phone=1', w: 844, h: 390 },
};
const views = argv.only ? argv.only.split(',') : Object.keys(VIEWS).filter((v) => !v.startsWith('snow') && !v.startsWith('dusk') && v !== 'eastpaddies' && v !== 'market');
const setups = (argv.levels ?? 'low,medium,phone').split(',');
for (const v of views) if (!(v in VIEWS)) throw new Error(`perf: no view "${v}" (${Object.keys(VIEWS).join(', ')})`);
for (const s of setups) if (!(s in SETUPS)) throw new Error(`perf: no setup "${s}" (${Object.keys(SETUPS).join(', ')})`);
const FRAMES = Number(argv.frames ?? 120);
const WARM = Number(argv.warm ?? 40);
const BATCHES = Number(argv.batches ?? 6);
const ABLATE = argv.ablate ? argv.ablate.split(',') : [];
const MESHES = argv.meshes ? Number(argv.meshes) || 1 : 0;
const PARTS = argv.parts === '1' || ABLATE.length > 0;
const file = (p) => (isAbsolute(p) ? p : resolve(root, p));
const base = argv.base ? JSON.parse(readFileSync(file(argv.base), 'utf8')) : null;

/** Playwright's full Chromium (it draws with the GPU headless; the headless shell does not). */
function gpuChromium() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), process.platform === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright');
  const app = process.platform === 'darwin' ? 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' : 'chrome-linux/chrome';
  for (const dir of existsSync(cache) ? readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : []) {
    const exe = join(cache, dir, app);
    if (existsSync(exe)) return exe;
  }
  return undefined;
}

/**
 * In the page: instrument the renderer, run `warm` frames, then measure
 * `frames` frames one by one; with `parts`, one more frame counts each
 * part's draws and triangles; `ablate` draws the frames again with each of
 * those parts hidden.
 */
async function measure({ warm, frames, batches, parts: perPart, meshes, ablate, t0, turn, live }) {
  const r = window.renderer;
  const gl = r.getContext();
  const info = r.info;
  const g = window.graphicsNow;
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const dt = 1 / 60;
  let t = t0;
  let n = 0;

  // The live page's shadow cadence (a still redraws the shadow map every frame: atmosphere.ts).
  const sm = r.shadowMap;
  let want = sm.needsUpdate;
  let allow = true;
  Object.defineProperty(sm, 'needsUpdate', { configurable: true, get: () => want && allow, set: (v) => void (want = v) });

  // The frame's draws: the shadow pass apart, and per part (which part an object is under) or per mesh.
  const shadow = { calls: 0, triangles: 0 };
  let inShadow = false;
  const origShadow = sm.render;
  sm.render = function (...a) {
    const c = info.render.calls;
    const tr = info.render.triangles;
    inShadow = true;
    origShadow.apply(this, a);
    inShadow = false;
    shadow.calls += info.render.calls - c;
    shadow.triangles += info.render.triangles - tr;
  };
  const roots = new Map(window.parts.filter((p) => p.object).map((p) => [p.object, p.name]));
  const owner = new WeakMap();
  const partOf = (o) => {
    let name = owner.get(o);
    if (name) return name;
    for (let x = o; x; x = x.parent)
      if (roots.has(x)) {
        name = roots.get(x);
        break;
      }
    name ??= o.parent ? '(scene)' : 'post';
    owner.set(o, name);
    return name;
  };
  let byPart = null;
  let byMesh = null;
  const origDraw = r.renderBufferDirect;
  r.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    if (!byPart) return origDraw.call(this, camera, scene, geometry, material, object, group);
    const c = info.render.calls;
    const tr = info.render.triangles;
    origDraw.call(this, camera, scene, geometry, material, object, group);
    const name = partOf(object);
    const add = (map, key, extra) => {
      const e = (map[key] ??= { calls: 0, triangles: 0, shadowCalls: 0, shadowTriangles: 0, ...extra });
      if (inShadow) {
        e.shadowCalls += info.render.calls - c;
        e.shadowTriangles += info.render.triangles - tr;
      } else {
        e.calls += info.render.calls - c;
        e.triangles += info.render.triangles - tr;
      }
    };
    add(byPart, name);
    if (byMesh) {
      const path = [];
      for (let x = object; x && !roots.has(x) && path.length < 4; x = x.parent) path.unshift(x.name || x.type);
      add(byMesh, `${name} › ${path.join(' › ')}`, { instances: object.count ?? 1, material: material.name || material.type });
    }
  };
  // CPU time of each part's update.
  const cpuParts = {};
  for (const p of window.parts) {
    if (!p.update) continue;
    const u = p.update;
    p.update = function (...a) {
      const s = performance.now();
      const out = u.apply(this, a);
      cpuParts[p.name] = (cpuParts[p.name] ?? 0) + performance.now() - s;
      return out;
    };
  }

  const px = new Uint8Array(4);
  const sync = () => {
    r.setRenderTarget(null);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  };
  info.autoReset = false;
  const pending = [];
  /** One frame (and, with `serial`, wait for the GPU): its CPU ms, wall ms, GPU ms (timer query) and the renderer's counts. */
  const frame = (serial) => {
    // (live: the shadow map is drawn every `shadowEvery` frames, never while still shadows stand but the first)
    // (`shadows=live`: the page draws it when the live page would, still shadows too: atmosphere.ts)
    allow = live || n === 0 || (!g.stillShadows && n % g.shadowEvery === 0);
    n++;
    info.reset();
    shadow.calls = shadow.triangles = 0;
    const s = performance.now();
    const tq = serial && ext ? gl.createQuery() : null;
    if (tq) gl.beginQuery(ext.TIME_ELAPSED_EXT, tq);
    window.__videoFrame(t, dt, null, turn ? turn[0] + ((t - t0) * turn[1]) / 360 : null);
    if (tq) gl.endQuery(ext.TIME_ELAPSED_EXT);
    const cpu = performance.now() - s;
    if (serial) sync();
    const wall = performance.now() - s;
    t += dt;
    const out = { cpu, wall, gpu: NaN, calls: info.render.calls, triangles: info.render.triangles, shadowCalls: shadow.calls, shadowTriangles: shadow.triangles };
    if (tq) pending.push({ tq, out });
    return out;
  };
  const collect = () => {
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i];
      if (!gl.getQueryParameter(p.tq, gl.QUERY_RESULT_AVAILABLE)) continue;
      p.out.gpu = gl.getQueryParameter(p.tq, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(p.tq);
      pending.splice(i, 1);
    }
  };
  const sleep = () => new Promise((res) => setTimeout(res, 0));
  /** Frames one by one, each waiting for the GPU. */
  const serial = async (count) => {
    const out = [];
    for (let i = 0; i < count; i++) {
      out.push(frame(true));
      collect();
      // (let the page breathe: timers, workers sculpting statues)
      if (i % 20 === 19) await sleep();
    }
    for (let k = 0; k < 20 && pending.length; k++) {
      await sleep();
      collect();
    }
    return out;
  };
  /** Frames back to back as a live page draws them (the CPU runs ahead while the GPU draws): ms per frame of each batch. */
  const pipelined = async (count, size) => {
    const out = [];
    for (let b = 0; b < count; b++) {
      sync();
      const s = performance.now();
      for (let i = 0; i < size; i++) frame(false);
      sync();
      out.push((performance.now() - s) / size);
      await sleep();
    }
    return out;
  };

  await serial(warm);
  for (const k of Object.keys(cpuParts)) delete cpuParts[k];
  const list = await serial(frames);
  const partsCpu = Object.fromEntries(Object.entries(cpuParts).map(([k, v]) => [k, v / frames]));
  const pipe = await pipelined(batches, 20);

  let draws = null;
  let meshList = null;
  if (perPart || meshes) {
    // (a frame with the shadow map drawn too: what each part casts)
    byPart = {};
    if (meshes) byMesh = {};
    n = 0;
    frame(true);
    draws = byPart;
    meshList = byMesh;
    byPart = byMesh = null;
  }
  const ablated = {};
  for (const name of ablate) {
    if (name.includes(':')) {
      // (meshes by name: hidden by their layers, which the parts' updates leave alone)
      const hide = [];
      window.scene.traverse((o) => {
        if (o.name.startsWith(name)) hide.push([o, o.layers.mask]);
      });
      if (!hide.length) continue;
      for (const [o] of hide) o.layers.disableAll();
      ablated[name] = await pipelined(batches, 20);
      for (const [o, mask] of hide) o.layers.mask = mask;
      continue;
    }
    const part = window.parts.find((p) => p.name === name);
    if (!part?.object) continue;
    const was = part.object.visible;
    part.object.visible = false;
    ablated[name] = await pipelined(batches, 20);
    part.object.visible = was;
  }
  const stats = window.__mapStats;
  return {
    frames: list,
    pipe,
    ablated,
    draws,
    meshes: meshList,
    partsCpu,
    timer: !!ext,
    programs: info.programs?.length ?? 0,
    memory: { ...info.memory },
    build: Object.values(stats.timings).reduce((a, b) => a + b, 0),
    timings: stats.timings,
    blocks: stats.blocks,
    failed: stats.failed,
    level: g.level,
    ratio: r.getPixelRatio(),
    size: [r.domElement.width, r.domElement.height],
  };
}

const q = (xs, p) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))];
};
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
/** The numbers of a case: its frames one by one (`serial`) and back to back (`pipe`, ms a frame per batch). */
function summary(frames, pipe) {
  const of = (k) => frames.map((f) => f[k]).filter(Number.isFinite);
  const plain = frames.filter((f) => f.shadowCalls === 0);
  const shadowed = frames.filter((f) => f.shadowCalls > 0);
  return {
    /** A live frame (ms): back to back, the CPU running ahead while the GPU draws. */
    frame: { median: q(pipe, 0.5), min: Math.min(...pipe) },
    /** One by one: CPU (the parts' updates and three's draw calls), wall (CPU then the GPU done), GPU (timer query). */
    cpu: { median: q(of('cpu'), 0.5), p95: q(of('cpu'), 0.95) },
    wall: { median: q(of('wall'), 0.5), p95: q(of('wall'), 0.95), p99: q(of('wall'), 0.99), max: Math.max(...of('wall')), shadowMax: Math.max(0, ...shadowed.map((f) => f.wall)), plainMax: Math.max(0, ...plain.map((f) => f.wall)), shadow: shadowed.length && plain.length ? q(shadowed.map((f) => f.wall), 0.5) - q(plain.map((f) => f.wall), 0.5) : 0 },
    gpu: { median: q(of('gpu'), 0.5), p95: q(of('gpu'), 0.95) },
    calls: q(frames.map((f) => f.calls - f.shadowCalls), 0.5),
    triangles: q(frames.map((f) => f.triangles - f.shadowTriangles), 0.5),
    shadowCalls: Math.max(...frames.map((f) => f.shadowCalls)),
    shadowTriangles: Math.max(...frames.map((f) => f.shadowTriangles)),
    shadowFrames: shadowed.length,
  };
}

const commit = (() => {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root }).toString().trim();
  } catch {
    return '';
  }
})();

// (its own bundle of dependencies: another dev server re-bundling the shared one fails pages here midway)
const server = await createServer({ root, cacheDir: join(root, 'node_modules/.vite-perf'), logLevel: 'error', server: { port: 5197, strictPort: false, hmr: false } });
await server.listen();
const origin = new URL(server.resolvedUrls.local[0]).origin;
const browser = await chromium.launch({ executablePath: gpuChromium(), args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] });
const cases = [];
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '–');
const M = (v) => (v / 1e6).toFixed(2);

for (const setupName of setups) {
  const setup = SETUPS[setupName];
  const page = await browser.newPage({ viewport: { width: setup.w, height: setup.h } });
  // (no analytics: its session recorder costs CPU and the runs would send events; the local src/posthog.ts still loads)
  await page.route((u) => u.origin !== origin && /posthog/i.test(u.hostname), (r) => r.abort());
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('[error]', m.text().slice(0, 300));
  });
  for (const view of views) {
    const url = `${origin}/index.html?shot=1&video=1&ui=0&story=0&t=12&${setup.query}${VIEWS[view] ? `&${VIEWS[view]}` : ''}${argv.url ? `&${argv.url}` : ''}`;
    const started = Date.now();
    // (a part that failed to load while the dev server re-bundled its dependencies: once more)
    for (let tries = 0; tries < 2; tries++) {
      await page.goto(url, { waitUntil: 'load', timeout: 300_000 });
      await page.waitForFunction(() => window.__ready === true, null, { timeout: 240_000 });
      if (!(await page.evaluate(() => window.__mapStats.failed.length))) break;
    }
    const loaded = Date.now() - started;
    const live = /(^|&)shadows=live(&|$)/.test(`${VIEWS[view]}&${argv.url ?? ''}`);
    const res = await page.evaluate(measure, { warm: WARM, frames: FRAMES, batches: BATCHES, parts: PARTS, meshes: MESHES, ablate: ABLATE, t0: 12, turn: TURNING[view] ?? null, live });
    const sum = summary(res.frames, res.pipe);
    const ablated = Object.fromEntries(Object.entries(res.ablated).map(([k, pipe]) => [k, q(pipe, 0.5)]));
    const c = { view, setup: setupName, url: url.slice(origin.length), loadMs: loaded, ...sum, programs: res.programs, memory: res.memory, build: res.build, timings: res.timings, blocks: res.blocks, failed: res.failed, level: res.level, ratio: res.ratio, size: res.size, timer: res.timer, partsCpu: res.partsCpu, draws: res.draws, meshes: res.meshes, ablated };
    cases.push(c);
    const was = base?.cases?.find((b) => b.view === view && b.setup === setupName);
    const d = (a, b, fmt) => (b === undefined || !Number.isFinite(b) ? '' : ` (${a - b >= 0 ? '+' : ''}${fmt(a - b)})`);
    console.log(
      `${view.padEnd(9)} ${setupName.padEnd(7)} frame ${f1(sum.frame.median)}${d(sum.frame.median, was?.frame?.median, f1)} ms · cpu ${f1(sum.cpu.median)}${d(sum.cpu.median, was?.cpu?.median, f1)} · wall ${f1(sum.wall.median)} p95 ${f1(sum.wall.p95)} max ${f1(sum.wall.max)}${sum.shadowFrames ? ` (shadow +${f1(sum.wall.shadow)}${live ? ` in ${sum.shadowFrames} of ${res.frames.length}, worst ${f1(sum.wall.shadowMax)} vs ${f1(sum.wall.plainMax)}` : ''})` : ''} · draws ${sum.calls}${d(sum.calls, was?.calls, String)} + ${sum.shadowCalls} · tris ${M(sum.triangles)}${d(sum.triangles, was?.triangles, M)} + ${M(sum.shadowTriangles)} M · programs ${res.programs} · build ${res.build} ms${res.failed?.length ? ` · FAILED ${res.failed.join(',')}` : ''}`,
    );
    for (const [name, ms] of Object.entries(ablated)) if (name.includes(':')) console.log(`    ${name.padEnd(18)} ${f1(sum.frame.median - ms)} ms a frame (hidden: ${f1(ms)})`);
    if (res.draws) {
      const rows = Object.entries(res.draws).sort((a, b) => b[1].triangles + b[1].shadowTriangles - (a[1].triangles + a[1].shadowTriangles));
      for (const [name, e] of rows)
        console.log(`    ${name.padEnd(18)} draws ${String(e.calls).padStart(4)} tris ${M(e.triangles).padStart(5)} M · shadow ${String(e.shadowCalls).padStart(4)} ${M(e.shadowTriangles).padStart(5)} M · cpu ${(res.partsCpu[name] ?? 0).toFixed(3)} ms${name in ablated ? ` · ${f1(sum.frame.median - ablated[name])} ms a frame (hidden: ${f1(ablated[name])})` : ''}`);
    }
    if (res.meshes) {
      const rows = Object.entries(res.meshes).sort((a, b) => b[1].triangles + b[1].shadowTriangles - (a[1].triangles + a[1].shadowTriangles)).slice(0, Number(argv.meshes) > 1 ? Number(argv.meshes) : 30);
      for (const [name, e] of rows) console.log(`    ${name.slice(0, 70).padEnd(70)} ${String(e.calls).padStart(3)}× ${M(e.triangles).padStart(5)} M · shadow ${String(e.shadowCalls).padStart(3)}× ${M(e.shadowTriangles).padStart(5)} M · ${e.instances} inst · ${e.material}`);
    }
  }
  await page.close();
}
await browser.close();
await server.close();

if (argv.out) {
  const out = file(argv.out);
  writeFileSync(out, JSON.stringify({ date: new Date().toISOString(), commit, frames: FRAMES, warm: WARM, cases }, null, 1));
  console.log(`perf: ${out}`);
}
