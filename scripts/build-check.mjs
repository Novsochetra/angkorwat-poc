// Is the world map built the same way two ways? Hashes every part the map builds (each object's
// geometry, every attribute and index, instance matrices and colours, bounds, names, flags, the
// voxel meshes' user data and, in dev, the code line that made each block), the height field, the
// block counts and the objects' creation order (their three.js ids), for several variants, and
// prints where they differ.
//
//   node scripts/build-check.mjs work=".|" main=".|work=0" before="../wt|"     # name="<checkout>|<url params>[|<init script>]"
//   node scripts/build-check.mjs … url="quality=low"   # added to every variant's URL
//   node scripts/build-check.mjs … live=1              # the live page (not a shot): hashed right after the
//                                                      # build, before its first frame (no frame runs)
//   node scripts/build-check.mjs … prod=1              # production builds (vite build + preview), not dev
//   node scripts/build-check.mjs … runs=2              # each variant twice (is it deterministic?)
//   node scripts/build-check.mjs … out=file.json       # every hash as JSON
//
// A shot (`shot=1&ui=0`, the default) steps the scene 31 times before it is ready (people, animals and
// water move, the same way on every run), and waits for the sculpted statues; the live page is hashed
// as its build ends (`__mapStats` set), with every animation frame after that held back. Parts that
// differ are listed with what differs: `data` (geometry, instances, bounds), `meta` (names, flags,
// transforms, user data), `src` (the code line of each block, dev only), `ids` (creation order).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { build, createServer, preview } from 'vite';
import { chromium } from 'playwright';
import { chromiumPath } from './chromium.mjs';

const root = resolve(import.meta.dirname, '..');
const OPTS = new Set(['url', 'live', 'prod', 'runs', 'out', 'w', 'h', 'dump']);
const argv = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return i < 0 ? [a, '1'] : [a.slice(0, i), a.slice(i + 1)]; }));
const variants = Object.entries(argv).filter(([k]) => !OPTS.has(k)).map(([name, spec]) => {
  const [dir, query = '', init = ''] = spec.split('|');
  return { name, dir: resolve(root, dir || '.'), query, init: init && resolve(root, init) };
});
if (!variants.length) throw new Error('build-check: name at least one variant, e.g. work=".|" main=".|work=0"');
const live = argv.live === '1';
const prod = argv.prod === '1';
const RUNS = Number(argv.runs ?? 1);
const common = argv.url ?? '';

// ── One server per checkout ────────────────────────────────────────────────
const servers = new Map();
async function serverFor(dir) {
  if (servers.has(dir)) return servers.get(dir);
  const configFile = join(dir, 'vite.config.ts');
  let server;
  let base;
  if (prod) {
    const outDir = join(tmpdir(), 'angkor-build-check', dir.replace(/[^a-z0-9]+/gi, '_').slice(-60));
    mkdirSync(outDir, { recursive: true });
    await build({ root: dir, configFile, logLevel: 'warn', build: { outDir, emptyOutDir: true } });
    server = await preview({ root: dir, configFile, logLevel: 'error', build: { outDir }, preview: { host: '127.0.0.1', port: 4700 + servers.size, strictPort: false, open: false } });
    base = new URL(server.resolvedUrls.local[0]).origin;
  } else {
    server = await createServer({ root: dir, configFile, logLevel: 'error', server: { port: 5260 + servers.size, strictPort: false, hmr: false } });
    await server.listen();
    base = new URL(server.resolvedUrls.local[0]).origin;
  }
  const s = { server, base };
  servers.set(dir, s);
  return s;
}

/** In the page: hold back every animation frame once the build is done (live runs: no frame changes the parts). */
function holdFrames() {
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => (window.__mapStats ? 0 : raf(cb));
}

/** In the page: the hashes. */
async function hashAll(dump) {
  const te = new TextEncoder();
  const hex = (buf) => [...new Uint8Array(buf)].slice(0, 10).map((x) => x.toString(16).padStart(2, '0')).join('');
  const digest = async (list) => {
    let n = 0;
    for (const b of list) n += b.byteLength;
    const all = new Uint8Array(n);
    let o = 0;
    for (const b of list) {
      all.set(new Uint8Array(b.buffer ?? b, b.byteOffset ?? 0, b.byteLength), o);
      o += b.byteLength;
    }
    return hex(await crypto.subtle.digest('SHA-256', all));
  };
  const json = (v) => te.encode(JSON.stringify(v, (k, x) => (typeof x === 'number' && !Number.isFinite(x) ? String(x) : x)));
  const round = (v) => v;
  /** The first project frame of a block's trace (as served: file:line:col), skipping the plumbing. */
  const srcFrame = (e) => {
    if (!e) return null;
    for (const line of (e.stack ?? '').split('\n')) {
      const m = /((?:https?|file):\/\/\S+?):(\d+):(\d+)\)?\s*$/.exec(line);
      if (!m) continue;
      const file = decodeURIComponent(new URL(m[1]).pathname).replace(/^\/+/, '');
      if (!file.startsWith('src/') || /^src\/(feedback|voxel)\//.test(file)) continue;
      return `${file}:${m[2]}:${m[3]}`;
    }
    return '?';
  };
  // (a hook's name: a production build's are minified, and differ from build to build)
  const hookName = (f) => (!f ? null : f.name.length > 3 ? f.name : '(minified)');
  const userData = (u) => {
    const out = {};
    for (const [k, v] of Object.entries(u ?? {})) {
      if (k === 'voxelSources') continue;
      if (v === null || ['number', 'string', 'boolean'].includes(typeof v)) out[k] = v;
      else if (v?.isVector3) out[k] = v.toArray();
      else if (Array.isArray(v) && v.every((x) => typeof x === 'number')) out[k] = v;
      else if (typeof v === 'object' && Object.values(v).every((x) => ['number', 'string', 'boolean'].includes(typeof x))) out[k] = v;
      else out[k] = `(${typeof v})`;
    }
    return out;
  };
  // The order three sorts by (object, material ids; geometry ids key its caches): each id's rank among all of its
  // kind in the scene. Built another way, ids may all shift by the same amount (e.g. objects made in a worker, not
  // here): the ranks, and so the order of every draw, stay the same.
  const all = { o: new Set(), g: new Set(), m: new Set() };
  window.scene.traverse((o) => {
    all.o.add(o.id);
    if (o.geometry) all.g.add(o.geometry.id);
    for (const m of [].concat(o.material ?? [])) all.m.add(m.id);
  });
  const rank = {};
  for (const [k, set] of Object.entries(all)) rank[k] = new Map([...set].sort((a, b) => a - b).map((id, r) => [id, r]));
  // (the same among the voxel meshes alone: made in the parts' builds, where statues sculpted in workers, joining when
  // they are done, cannot come between them)
  const isVox = (o) => o.isInstancedMesh && !!o.userData.voxelShape;
  const vall = { o: new Set(), g: new Set(), m: new Set() };
  window.scene.traverse((o) => {
    if (!isVox(o)) return;
    vall.o.add(o.id);
    vall.g.add(o.geometry.id);
    for (const m of [].concat(o.material ?? [])) vall.m.add(m.id);
  });
  const vrank = {};
  for (const [k, set] of Object.entries(vall)) vrank[k] = new Map([...set].sort((a, b) => a - b).map((id, r) => [id, r]));
  const part = async (root) => {
    const data = [];
    const meta = [];
    const src = [];
    const ids = [];
    const ranks = [];
    const vranks = [];
    let objects = 0;
    let instances = 0;
    root.traverse((o) => {
      objects++;
      ids.push(o.id);
      ranks.push(rank.o.get(o.id) ?? -1);
      if (isVox(o)) vranks.push(vrank.o.get(o.id), vrank.g.get(o.geometry.id), ...[].concat(o.material).map((m) => vrank.m.get(m.id)));
      meta.push([o.type, o.name, o.visible, o.position.toArray(), o.quaternion.toArray(), o.scale.toArray(), o.layers.mask, o.castShadow, o.receiveShadow, o.renderOrder, o.frustumCulled, o.children.length, o.matrixAutoUpdate, userData(o.userData), hookName(o.onBeforeRender), !!o.customDepthMaterial]);
      const g = o.geometry;
      if (g) {
        ids.push(g.id);
        ranks.push(rank.g.get(g.id) ?? -1);
        meta.push(['geo', g.type, Object.keys(g.attributes), g.index ? [g.index.count, g.index.array.constructor.name] : null, g.drawRange, g.groups, g.boundingSphere && [...g.boundingSphere.center.toArray(), g.boundingSphere.radius], g.boundingBox && [...g.boundingBox.min.toArray(), ...g.boundingBox.max.toArray()], g.instanceCount ?? null]);
        for (const [k, a] of Object.entries(g.attributes)) {
          meta.push([k, a.itemSize, a.count, a.normalized, a.array.constructor.name, a.meshPerAttribute ?? null, a.isInterleavedBufferAttribute ?? false]);
          if (a.array) data.push(a.array);
        }
        if (g.index) data.push(g.index.array);
      }
      for (const m of [].concat(o.material ?? [])) {
        ids.push(m.id);
        ranks.push(rank.m.get(m.id) ?? -1);
        meta.push(['mat', m.type, m.name, m.transparent, m.side, m.visible, m.defines ? Object.keys(m.defines) : null]);
      }
      if (o.isInstancedMesh) {
        instances += o.count;
        data.push(o.instanceMatrix.array);
        if (o.instanceColor) data.push(o.instanceColor.array);
        meta.push(['inst', o.count, o.instanceMatrix.count, o.boundingSphere && [...o.boundingSphere.center.toArray(), o.boundingSphere.radius], o.boundingBox && [...o.boundingBox.min.toArray(), ...o.boundingBox.max.toArray()]]);
        const s = o.userData.voxelSources;
        if (s) src.push(s.length, ...s.map(srcFrame));
      }
    });
    return { objects, instances, data: await digest([json(meta), ...data]), dataOnly: await digest(data.length ? data : [new Uint8Array(0)]), meta: await digest([json(meta)]), src: await digest([json(src)]), ids: await digest([json(ids)]), ranks: await digest([json(ranks)]), vranks: await digest([json(vranks)]), ...(dump === root.name ? { dump: { ids, ranks, meta } } : {}) };
  };
  const out = { parts: {}, order: window.parts.map((p) => p.name) };
  for (const p of window.parts) out.parts[p.name] = await part(p.object);
  const f = window.field;
  out.field = await digest([f.height, f.water, f.surface, f.occupied, f.lod, f.trail, json([f.falls, f.rivers, f.paths, f.trails, f.nx, f.nz, f.x0, f.z0, f.row0])]);
  out.fieldParts = {};
  for (const k of ['height', 'water', 'surface', 'occupied', 'lod', 'trail']) out.fieldParts[k] = await digest([f[k]]);
  out.fieldParts.lists = await digest([json([f.falls, f.rivers, f.paths, f.trails])]);
  out.blocks = window.__mapStats?.blocks ?? null;
  out.failed = window.__mapStats?.failed ?? null;
  out.scene = await digest([json(window.scene.children.map((c) => [c.type, c.name, c.id]))]);
  out.sceneNames = await digest([json(window.scene.children.map((c) => [c.type, c.name]))]);
  return out;
}

const browser = await chromium.launch({ executablePath: chromiumPath(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = [];
for (let run = 0; run < RUNS; run++)
  for (const v of variants) {
    const { base } = await serverFor(v.dir);
    const q = [live ? 'story=0' : 'shot=1&ui=0&story=0', common, v.query].filter(Boolean).join('&');
    const url = `${base}/index.html?${q}`;
    const page = await browser.newPage({ viewport: { width: Number(argv.w ?? 1280), height: Number(argv.h ?? 720) } });
    if (live) await page.addInitScript(holdFrames);
    // (a script of the variant's own run first: e.g. one that breaks the build workers, to check the page builds alone)
    if (v.init) await page.addInitScript({ path: v.init });
    const log = [];
    page.on('console', (m) => {
      const t = m.text();
      if (/^\[(map|work)\] (built in|\d+ build workers|built on the page|the build workers)|FAILED|failed/.test(t) || m.type() === 'error') log.push(t.slice(0, 600));
    });
    page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));
    const t0 = Date.now();
    await page.goto(url, { waitUntil: 'load', timeout: 300_000 });
    if (live) await page.waitForFunction(() => !!window.__mapStats, null, { timeout: 300_000 });
    else await page.waitForFunction(() => window.__ready === true, null, { timeout: 300_000 });
    const ms = Date.now() - t0;
    const h = await page.evaluate(hashAll, argv.dump ?? null);
    await page.close();
    results.push({ variant: v.name, run, url: url.replace(base, ''), ms, ...h, log });
    console.log(`build-check: ${v.name}${RUNS > 1 ? ` run ${run}` : ''} ${url.replace(base, '')} · ${ms} ms · ${Object.keys(h.parts).length} parts · field ${h.field}`);
    for (const l of log) console.log(`   ${l}`);
  }
await browser.close();
for (const { server } of servers.values()) await server.close();

// ── Compare ────────────────────────────────────────────────────────────────
const ref = results[0];
const label = (r) => `${r.variant}${RUNS > 1 ? `#${r.run}` : ''}`;
let same = true;
const say = (s) => console.log(s);
say(`\nbuild-check: against ${label(ref)} (${ref.url})`);
for (const r of results.slice(1)) {
  const diffs = [];
  const notes = [];
  if (JSON.stringify(r.order) !== JSON.stringify(ref.order)) diffs.push(`parts in another order: ${r.order.join(',')}`);
  for (const name of new Set([...Object.keys(ref.parts), ...Object.keys(r.parts)])) {
    const a = ref.parts[name];
    const b = r.parts[name];
    if (!a || !b) {
      diffs.push(`${name}: only in ${a ? label(ref) : label(r)}`);
      continue;
    }
    const what = ['dataOnly', 'meta', 'src', 'ranks'].filter((k) => a[k] !== b[k]).map((k) => (k === 'dataOnly' ? 'data' : k === 'ranks' ? 'draw order (id ranks)' : k));
    if (a.ids !== b.ids && a.ranks === b.ranks) notes.push(`${name}: ids shifted, same order`);
    if (a.vranks !== b.vranks) what.push('draw order of its voxel meshes');
    if (a.objects !== b.objects || a.instances !== b.instances) what.push(`objects ${a.objects}→${b.objects}, instances ${a.instances}→${b.instances}`);
    if (what.length) diffs.push(`${name}: ${what.join(', ')}`);
  }
  if (r.field !== ref.field) diffs.push(`field: ${Object.keys(r.fieldParts).filter((k) => r.fieldParts[k] !== ref.fieldParts[k]).join(', ')}`);
  if (JSON.stringify(r.blocks) !== JSON.stringify(ref.blocks)) diffs.push(`blocks ${JSON.stringify(r.blocks)}`);
  if (r.sceneNames !== ref.sceneNames) diffs.push('scene: other children');
  if (diffs.length) same = false;
  say(`  ${label(r)}: ${diffs.length ? `DIFFERS\n    ${diffs.join('\n    ')}` : 'identical (every part: data, names and flags, code lines, draw order; the field, blocks)'}${notes.length ? `\n    (${notes.join('; ')})` : ''}`);
}
say(`\nparts: ${Object.entries(ref.parts).map(([k, v]) => `${k} ${v.instances}`).join(' · ')}`);
if (argv.out) writeFileSync(resolve(root, argv.out), JSON.stringify(results, null, 1));
process.exitCode = same ? 0 : 1;
