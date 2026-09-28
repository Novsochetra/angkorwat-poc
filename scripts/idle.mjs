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
//    and in all the parts' `update` (window.parts, each wrapped), and their share of the main thread;
//  - mem (after the case, outside its seconds): heap MB, the JS heap at the case's end (`JSHeapUsedSize`;
//    typed arrays' contents are not in it), and live MB, the same after a garbage collection; scene MB,
//    what the GPU holds for `window.scene` by its sizes and types: every geometry's attributes and index
//    under shown objects (the instances' matrices, colours and per-instance attributes apart), the
//    textures its materials use that three has uploaded (also the uniforms `onBeforeCompile` added), and
//    the render targets in use (the shadow maps, the post effects' targets, their multisampled buffers:
//    every target three has drawn into); GL MB,
//    what WebGL was asked to allocate (buffers, textures, renderbuffers, counted as three calls
//    `bufferData`, `texStorage2D`, … on the page's context; the canvas's own buffers not counted);
//    tab MB and GPU proc MB, macOS's `phys_footprint` of the page's renderer and of Chromium's GPU
//    process (`footprint`: what Activity Monitor shows); geo/tex, `renderer.info.memory`. The JSON has
//    the parts of each (geometry hidden: under an object not shown now), the render targets one by
//    one, and the build: each part's ms from the page's `[map] built in …` line, and the shaders'.
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
  const S = { renders: 0, renderMs: 0, renderAt: [], updateMs: 0, steps: 0, parts: {}, ticks: 0, rafCalls: 0, rafMs: 0, lastTs: -1, post: false, targets: new Set() };
  window.__idle = S;
  // (what WebGL allocates, per context, as asked for: each buffer's, texture's and renderbuffer's bytes, until
  // deleted; only the calls that allocate are wrapped, not the ones a frame makes to fill them)
  const K = globalThis.WebGL2RenderingContext;
  if (K) {
    const table = (o) => new Map(Object.entries(o).filter(([k]) => K[k] !== undefined).map(([k, v]) => [K[k], v]));
    const SIZED = table({ R8: 1, R8_SNORM: 1, R8I: 1, R8UI: 1, STENCIL_INDEX8: 1, RG8: 2, RG8_SNORM: 2, RG8I: 2, RG8UI: 2, R16F: 2, R16I: 2, R16UI: 2, RGB565: 2, RGBA4: 2, RGB5_A1: 2, DEPTH_COMPONENT16: 2, RGB8: 3, SRGB8: 3, RGB8_SNORM: 3, RGB8I: 3, RGB8UI: 3, RGBA8: 4, SRGB8_ALPHA8: 4, RGBA8_SNORM: 4, RGBA8I: 4, RGBA8UI: 4, RGB10_A2: 4, RGB10_A2UI: 4, RG16F: 4, RG16I: 4, RG16UI: 4, R32F: 4, R32I: 4, R32UI: 4, R11F_G11F_B10F: 4, RGB9_E5: 4, DEPTH_COMPONENT24: 4, DEPTH_COMPONENT32F: 4, DEPTH24_STENCIL8: 4, RGB16F: 6, RGB16I: 6, RGB16UI: 6, RGBA16F: 8, RGBA16I: 8, RGBA16UI: 8, RG32F: 8, RG32I: 8, RG32UI: 8, DEPTH32F_STENCIL8: 8, RGB32F: 12, RGB32I: 12, RGB32UI: 12, RGBA32F: 16, RGBA32I: 16, RGBA32UI: 16 });
    const CHANNELS = table({ RED: 1, RED_INTEGER: 1, ALPHA: 1, LUMINANCE: 1, DEPTH_COMPONENT: 1, RG: 2, RG_INTEGER: 2, LUMINANCE_ALPHA: 2, RGB: 3, RGB_INTEGER: 3, RGBA: 4, RGBA_INTEGER: 4 });
    const TYPE = table({ BYTE: 1, UNSIGNED_BYTE: 1, SHORT: 2, UNSIGNED_SHORT: 2, HALF_FLOAT: 2, INT: 4, UNSIGNED_INT: 4, FLOAT: 4 });
    const PACKED = table({ UNSIGNED_SHORT_4_4_4_4: 2, UNSIGNED_SHORT_5_5_5_1: 2, UNSIGNED_SHORT_5_6_5: 2, UNSIGNED_INT_24_8: 4, UNSIGNED_INT_2_10_10_10_REV: 4, UNSIGNED_INT_10F_11F_11F_REV: 4, UNSIGNED_INT_5_9_9_9_REV: 4, FLOAT_32_UNSIGNED_INT_24_8_REV: 8 });
    /** Bytes a texel: a sized internal format's, or an unsized one's channels × its type's bytes. */
    const texel = (ifmt, format, type) => SIZED.get(ifmt) ?? PACKED.get(type) ?? (CHANNELS.get(format ?? ifmt) ?? 4) * (TYPE.get(type) ?? 1);
    S.texel = texel;
    const BUF = table({ ARRAY_BUFFER: K.ARRAY_BUFFER_BINDING, ELEMENT_ARRAY_BUFFER: K.ELEMENT_ARRAY_BUFFER_BINDING, UNIFORM_BUFFER: K.UNIFORM_BUFFER_BINDING, COPY_READ_BUFFER: K.COPY_READ_BUFFER_BINDING, COPY_WRITE_BUFFER: K.COPY_WRITE_BUFFER_BINDING, PIXEL_PACK_BUFFER: K.PIXEL_PACK_BUFFER_BINDING, PIXEL_UNPACK_BUFFER: K.PIXEL_UNPACK_BUFFER_BINDING, TRANSFORM_FEEDBACK_BUFFER: K.TRANSFORM_FEEDBACK_BUFFER_BINDING });
    const isFace = (t) => t >= K.TEXTURE_CUBE_MAP_POSITIVE_X && t <= K.TEXTURE_CUBE_MAP_NEGATIVE_Z;
    const TEX = table({ TEXTURE_2D: K.TEXTURE_BINDING_2D, TEXTURE_CUBE_MAP: K.TEXTURE_BINDING_CUBE_MAP, TEXTURE_3D: K.TEXTURE_BINDING_3D, TEXTURE_2D_ARRAY: K.TEXTURE_BINDING_2D_ARRAY });
    const bound = (gl, target) => gl.getParameter(isFace(target) ? K.TEXTURE_BINDING_CUBE_MAP : TEX.get(target));
    const mem = (gl) => (gl.__idleMem ??= { buffers: new Map(), textures: new Map(), renderbuffers: new Map() });
    /** A texture's bytes: by (face, level) as `texImage*` fills them, or all at once (`texStorage*`). */
    const setTex = (gl, t, key, bytes) => {
      if (!t) return;
      const m = mem(gl).textures;
      const e = key === 'storage' ? {} : (m.get(t) ?? {});
      e[key] = bytes;
      m.set(t, e);
    };
    const levels = (n, w, h, d = 1) => {
      let s = 0;
      for (let l = 0; l < n; l++) s += Math.max(1, w >> l) * Math.max(1, h >> l) * Math.max(1, d >> l);
      return s;
    };
    const P = K.prototype;
    const after = (name, fn) => {
      const f = P[name];
      if (typeof f !== 'function') return;
      P[name] = function (...a) {
        const out = f.apply(this, a);
        try {
          fn(this, a);
        } catch {
          /* (a count missed, never the call) */
        }
        return out;
      };
    };
    after('bufferData', (gl, [target, src, , off = 0, len = 0]) => {
      const b = gl.getParameter(BUF.get(target));
      if (!b) return;
      const n = typeof src === 'number' ? src : ArrayBuffer.isView(src) && src.BYTES_PER_ELEMENT ? (len || src.length - off) * src.BYTES_PER_ELEMENT : (src?.byteLength ?? 0);
      mem(gl).buffers.set(b, n);
    });
    after('deleteBuffer', (gl, [b]) => mem(gl).buffers.delete(b));
    after('texStorage2D', (gl, [target, n, ifmt, w, h]) => setTex(gl, bound(gl, target), 'storage', levels(n, w, h) * texel(ifmt) * (target === K.TEXTURE_CUBE_MAP ? 6 : 1)));
    after('texStorage3D', (gl, [target, n, ifmt, w, h, d]) => setTex(gl, bound(gl, target), 'storage', (target === K.TEXTURE_3D ? levels(n, w, h, d) : levels(n, w, h) * d) * texel(ifmt)));
    after('texImage2D', (gl, a) => {
      // (target, level, internalformat, width, height, border, format, type, …) or (target, level, internalformat, format, type, source)
      const [target, level, ifmt] = a;
      const s = a[5];
      const [w, h, format, type] = a.length >= 9 ? [a[3], a[4], a[6], a[7]] : [s?.naturalWidth ?? s?.videoWidth ?? s?.displayWidth ?? s?.width ?? 0, s?.naturalHeight ?? s?.videoHeight ?? s?.displayHeight ?? s?.height ?? 0, a[3], a[4]];
      setTex(gl, bound(gl, target), `${target}:${level}`, w * h * texel(ifmt, format, type));
    });
    after('texImage3D', (gl, [target, level, ifmt, w, h, d, , format, type]) => setTex(gl, bound(gl, target), `${target}:${level}`, w * h * d * texel(ifmt, format, type)));
    after('copyTexImage2D', (gl, [target, level, ifmt, , , w, h]) => setTex(gl, bound(gl, target), `${target}:${level}`, w * h * texel(ifmt)));
    after('compressedTexImage2D', (gl, [target, level, , , , , src]) => setTex(gl, bound(gl, target), `${target}:${level}`, typeof src === 'number' ? src : (src?.byteLength ?? 0)));
    after('deleteTexture', (gl, [t]) => mem(gl).textures.delete(t));
    after('renderbufferStorage', (gl, [, ifmt, w, h]) => {
      const rb = gl.getParameter(K.RENDERBUFFER_BINDING);
      if (rb) mem(gl).renderbuffers.set(rb, w * h * texel(ifmt));
    });
    after('renderbufferStorageMultisample', (gl, [, samples, ifmt, w, h]) => {
      const rb = gl.getParameter(K.RENDERBUFFER_BINDING);
      if (rb) mem(gl).renderbuffers.set(rb, Math.max(1, samples) * w * h * texel(ifmt));
    });
    after('deleteRenderbuffer', (gl, [rb]) => mem(gl).renderbuffers.delete(rb));
  }
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
  // (the render targets drawn into — the post effects', the shadow maps', the people's bones —: counted after each case)
  const wrapRenderer = (r) => {
    const set = r?.setRenderTarget;
    if (typeof set !== 'function' || set.__idle) return;
    const w = function (target, face, level) {
      if (target) S.targets.add(target);
      return set.call(this, target, face, level);
    };
    w.__idle = true;
    r.setRenderTarget = w;
  };
  // (main.ts hands them to the window with Object.assign: caught as they are set, before the first frame)
  let post;
  let parts;
  let renderer;
  Object.defineProperty(window, 'renderer', {
    configurable: true,
    enumerable: true,
    get: () => renderer,
    set: (v) => {
      renderer = v;
      wrapRenderer(v);
    },
  });
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

/**
 * In the page, after a case: the bytes the GPU holds for the map, by walking `window.scene` (geometry and
 * instances: their arrays; textures and render targets: their sizes and types), next to what WebGL was
 * asked to allocate (instrument's count) and three's own counts.
 */
function sceneMemory() {
  const r = window.renderer;
  const scene = window.scene;
  const S = window.__idle;
  if (!r || !scene || !S) return null;
  const gl = r.getContext();
  const props = r.properties;
  // (three's formats and types: channels, bytes a channel, packed types' bytes a texel)
  const CH = { 1021: 1, 1022: 3, 1023: 4, 1026: 1, 1027: 1, 1028: 1, 1029: 1, 1030: 2, 1031: 2, 1032: 3, 1033: 4 };
  const TY = { 1009: 1, 1010: 1, 1011: 2, 1012: 2, 1013: 4, 1014: 4, 1015: 4, 1016: 2 };
  const PK = { 1017: 2, 1018: 2, 1020: 4, 35899: 4, 35902: 4 };
  const texel = (t) => (typeof t.internalFormat === 'string' && S.texel ? S.texel(gl[t.internalFormat]) : (PK[t.type] ?? (CH[t.format] ?? 4) * (TY[t.type] ?? 1)));
  // (a mipmap chain as three makes one: generateMipmaps and a mipmap filter, or mipmaps given)
  const mipped = (t) => t.generateMipmaps && t.minFilter !== 1003 && t.minFilter !== 1006;
  const area = (w, h, mips) => {
    if (!mips) return w * h;
    let s = 0;
    for (let x = w, y = h; ; x = Math.max(1, x >> 1), y = Math.max(1, y >> 1)) {
      s += x * y;
      if (x === 1 && y === 1) break;
    }
    return s;
  };
  const MB = 1048576;
  const mark = (map, k, shown) => {
    if (k) map.set(k, map.get(k) || shown);
  };

  // The scene, shown or not (an object is shown when it and all above it are visible).
  const geoms = new Map();
  const mats = new Map();
  const texs = new Map();
  const targets = new Set(S.targets);
  const count = { objects: 0, meshes: 0, instanced: 0, instances: 0 };
  const walk = (o, shown) => {
    shown = shown && o.visible;
    count.objects++;
    if (o.isMesh || o.isPoints || o.isLine) count.meshes++;
    if (o.geometry?.isBufferGeometry) mark(geoms, o.geometry, shown);
    if (o.isInstancedMesh) {
      count.instanced++;
      count.instances += o.count;
      mark(geoms, { attributes: { m: o.instanceMatrix, c: o.instanceColor } }, shown);
      mark(texs, o.morphTexture, shown);
    }
    if (o.isBatchedMesh) for (const t of [o._matricesTexture, o._indirectTexture, o._colorsTexture]) mark(texs, t, shown);
    if (o.isSkinnedMesh) mark(texs, o.skeleton?.boneTexture, shown);
    for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) mark(mats, m, shown);
    if (o.shadow?.map) targets.add(o.shadow.map);
    if (o.shadow?.mapPass) targets.add(o.shadow.mapPass);
    for (const c of o.children) walk(c, shown);
  };
  walk(scene, true);
  for (const t of [scene.background, scene.environment]) if (t?.isTexture) mark(texs, t, true);
  // Textures: the materials' own, and their uniforms' (also those onBeforeCompile added: in three's properties).
  const fromValue = (v, shown) => {
    if (v?.isTexture) mark(texs, v, shown);
    else if (Array.isArray(v)) for (const x of v) if (x?.isTexture) mark(texs, x, shown);
  };
  for (const [m, shown] of mats) {
    for (const k in m) fromValue(m[k], shown);
    for (const u of Object.values(m.uniforms ?? {})) fromValue(u?.value, shown);
    if (props.has(m)) for (const u of Object.values(props.get(m).uniforms ?? {})) fromValue(u?.value, shown);
  }

  // Geometry: each attribute's array once (an interleaved buffer once); per-instance data apart.
  const bufs = new Map();
  for (const [g, shown] of geoms) {
    const all = [...Object.values(g.attributes ?? {}), g.index, ...Object.values(g.morphAttributes ?? {}).flat()];
    for (const a of all) if (a) mark(bufs, a.isInterleavedBufferAttribute ? a.data : a, shown);
  }
  const geometry = { shown: 0, hidden: 0 };
  const instances = { shown: 0, hidden: 0 };
  for (const [a, shown] of bufs) {
    const into = a.isInstancedBufferAttribute || a.isInstancedInterleavedBuffer ? instances : geometry;
    into[shown ? 'shown' : 'hidden'] += a.array?.byteLength ?? 0;
  }

  // Textures by their sizes and types (a render target's texture: counted with its target); on the GPU once
  // three has uploaded them (a texture of something not drawn yet waits: `waiting`). Textures with one source
  // (an image, a canvas) share one GPU texture in three: counted once.
  const textures = { uploaded: 0, waiting: 0, hidden: 0, count: 0, uploadedCount: 0 };
  const texList = [];
  const sources = new Map();
  for (const [t, shown] of texs) {
    if (t.renderTarget || t.isRenderTargetTexture) {
      if (t.renderTarget) targets.add(t.renderTarget);
      continue;
    }
    const up = props.has(t) && props.get(t).__webglTexture !== undefined;
    const e = sources.get(t.source ?? t);
    if (e) {
      e.up ||= up;
      e.shown ||= shown;
    } else sources.set(t.source ?? t, { t, up, shown });
  }
  for (const { t, up, shown } of sources.values()) {
    let bytes = 0;
    if (t.isCompressedTexture) for (const m of t.mipmaps ?? []) bytes += m.data?.byteLength ?? 0;
    else
      for (const img of Array.isArray(t.image) ? t.image : [t.image]) {
        if (!img) continue;
        const w = img.naturalWidth ?? img.videoWidth ?? img.width ?? 0;
        const h = img.naturalHeight ?? img.videoHeight ?? img.height ?? 0;
        bytes += (t.mipmaps?.length > 1 ? area(w, h, true) : area(w, h, mipped(t))) * (img.depth ?? 1) * texel(t);
      }
    textures[up ? 'uploaded' : shown ? 'waiting' : 'hidden'] += bytes;
    textures.count++;
    if (up) textures.uploadedCount++;
    const img = Array.isArray(t.image) ? t.image[0] : t.image;
    texList.push({ name: t.name || t.constructor?.name || '', size: `${img?.naturalWidth ?? img?.videoWidth ?? img?.width ?? 0}×${img?.naturalHeight ?? img?.videoHeight ?? img?.height ?? 0}${img?.depth > 1 ? `×${img.depth}` : ''}`, format: t.format, type: t.type, mips: mipped(t), uploaded: up, shown, mb: +(bytes / MB).toFixed(2) });
  }
  texList.sort((a, b) => b.mb - a.mb);

  // Render targets in use (three has a framebuffer for them): colour, depth, and the multisampled copies.
  const list = [];
  let targetBytes = 0;
  for (const rt of targets) {
    if (!props.has(rt) || props.get(rt).__webglFramebuffer === undefined) continue;
    const { width: w, height: h } = rt;
    const d = rt.depth ?? 1;
    const faces = rt.isWebGLCubeRenderTarget ? 6 : 1;
    let color = 0;
    let perSample = 0;
    for (const t of rt.textures ?? [rt.texture]) {
      color += area(w, h, mipped(t)) * d * faces * texel(t);
      perSample += texel(t);
    }
    const depthTexel = rt.depthTexture ? texel(rt.depthTexture) : rt.depthBuffer ? 4 : 0;
    const depth = w * h * faces * depthTexel;
    // (multisampled: three draws into renderbuffers with `samples` per pixel, colour and depth, then resolves)
    const samples = Math.min(rt.samples ?? 0, r.capabilities.maxSamples ?? 4);
    const msaa = props.get(rt).__webglMultisampledFramebuffer ? samples * w * h * (perSample + (rt.depthBuffer ? depthTexel || 4 : 0)) : 0;
    const bytes = color + depth + msaa;
    targetBytes += bytes;
    const t = rt.texture;
    list.push({ name: t?.name || rt.depthTexture?.name || '', size: `${w}×${h}${d > 1 ? `×${d}` : ''}`, format: t?.format, type: t?.type, samples, depthTexture: !!rt.depthTexture, mb: +(bytes / MB).toFixed(2), colorMB: +(color / MB).toFixed(2), depthMB: +(depth / MB).toFixed(2), msaaMB: +(msaa / MB).toFixed(2) });
  }
  list.sort((a, b) => b.mb - a.mb);

  // What WebGL was asked to allocate on this context.
  const m = gl.__idleMem;
  const sum = (map) => {
    let n = 0;
    for (const v of map?.values() ?? []) for (const b of Object.values(typeof v === 'number' ? { v } : v)) n += b;
    return n;
  };
  const glMem = m ? { buffers: sum(m.buffers) / MB, bufferCount: m.buffers.size, textures: sum(m.textures) / MB, textureCount: m.textures.size, renderbuffers: sum(m.renderbuffers) / MB, renderbufferCount: m.renderbuffers.size } : null;
  if (glMem) glMem.total = glMem.buffers + glMem.textures + glMem.renderbuffers;

  const mb = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, k.endsWith('ount') ? v : v / MB]));
  const shownMB = (geometry.shown + instances.shown + textures.uploaded + targetBytes) / MB;
  const attrs = gl.getContextAttributes();
  return {
    sceneMB: shownMB,
    sceneAllMB: shownMB + (geometry.hidden + instances.hidden + textures.waiting + textures.hidden) / MB,
    geometry: mb(geometry),
    instances: mb(instances),
    textures: mb(textures),
    texturesTop: texList.slice(0, 12),
    targetsMB: targetBytes / MB,
    targets: list,
    gl: glMem,
    three: { geometries: r.info.memory.geometries, textures: r.info.memory.textures, programs: r.info.programs?.length ?? 0 },
    counts: { ...count, geometries: geoms.size - count.instanced, materials: mats.size },
    canvas: [r.domElement.width, r.domElement.height],
    antialias: !!attrs?.antialias,
  };
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
const MB = 1048576;
/**
 * macOS's count of a process's memory (`phys_footprint`, what Activity Monitor shows), and the part of it
 * that is graphics memory (the IOAccelerator and IOSurface regions): `footprint`, about 0.3 s a process.
 */
function footprint(pid) {
  return new Promise((res) =>
    execFile('footprint', ['-f', 'bytes', String(pid)], { timeout: 20_000, maxBuffer: 16 << 20 }, (err, out) => {
      const phys = !err && /phys_footprint:\s*(\d+) B/.exec(out);
      if (!phys) return res(null);
      let accel = 0;
      let surface = 0;
      const top = [];
      for (const l of out.split('\n')) {
        const m = /^\s*(\d+) B\s+\d+ B\s+\d+ B\s+\d+\s+(.*\S)\s*$/.exec(l);
        if (!m) continue;
        if (/IOAccelerator/.test(m[2])) accel += Number(m[1]);
        if (/IOSurface/.test(m[2])) surface += Number(m[1]);
        top.push([m[2], +(Number(m[1]) / MB).toFixed(1)]);
      }
      // (the biggest regions by kind, dirty MB: where the footprint is)
      top.sort((a, b) => b[1] - a[1]);
      res({ pid, mb: Number(phys[1]) / MB, graphicsMB: accel / MB, surfaceMB: surface / MB, top: Object.fromEntries(top.slice(0, 8)) });
    }),
  );
}
/** The browser's processes now: the GPU process's footprint and the biggest renderer's (the map's page). */
async function footprints() {
  if (process.platform !== 'darwin') return null;
  const { processInfo } = await bcdp.send('SystemInfo.getProcessInfo').catch(() => ({ processInfo: [] }));
  const of = async (type) => (await Promise.all(processInfo.filter((p) => p.type === type).map((p) => footprint(p.id)))).filter(Boolean).sort((a, b) => b.mb - a.mb);
  const [gpuProc, renderers, browserProc] = await Promise.all([of('GPU'), of('renderer'), of('browser')]);
  return { gpu: gpuProc[0] ?? null, renderer: renderers[0] ?? null, renderers: renderers.length, browser: browserProc[0] ?? null };
}
/**
 * After a case (outside its seconds): the scene's and WebGL's bytes (sceneMemory), the JS heap after a
 * garbage collection, and the processes' footprints.
 */
async function memory() {
  const scene = await page.evaluate(sceneMemory).catch((e) => ({ error: String(e.message ?? e) }));
  await cdp.send('HeapProfiler.collectGarbage').catch(() => undefined);
  const metric = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
  return { heapLiveMB: metric.JSHeapUsedSize / MB, heapTotalMB: metric.JSHeapTotalSize / MB, ...scene, procs: await footprints() };
}

const cases = [];
/** One case: counters before, `during` (it waits `secs`), counters after; then its memory. */
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
  const mem = await memory();
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
    heapMB: b.metric.JSHeapUsedSize / MB,
    mem,
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
  console.log(`idle: ${name.padEnd(8)} ${f1(c.fps)} frames/s (last 5 s ${f1(c.fpsLast5)}) · rAF ${f1(c.rafPerSec)}/s · busy ${f1(c.busyPct)} % · per second ${perSecond.join(' ')} · heap ${f1(c.heapMB)} MB, GL ${f1(mem.gl?.total)} MB, GPU proc ${f1(mem.procs?.gpu?.mb)} MB${c.otherBrowsers.length ? ` · NOISY: another headless browser ran (pid ${c.otherBrowsers.join(', ')})` : ''}`);
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

// The build, from the page's lines: each part's ms (`[map] built in terrain 1234, …, covered 12 ms · blocks {…}`), the shaders'.
const mapBuild = (() => {
  const m = /^\[map\] built in (.*?) ms(?: · blocks (\{.*\}))?(?: · FAILED: .*)?$/.exec(mapLog.find((l) => l.startsWith('[map] built in ')) ?? '');
  if (!m) return null;
  const partsMs = Object.fromEntries(
    m[1].split(', ').map((x) => {
      const i = x.lastIndexOf(' ');
      return [x.slice(0, i), Number(x.slice(i + 1))];
    }),
  );
  let blocks = null;
  try {
    blocks = m[2] ? JSON.parse(m[2]) : null;
  } catch {
    /* (not JSON: left out) */
  }
  const shaders = /shaders compiled in (\d+) ms/.exec(mapLog.find((l) => l.startsWith('[map] shaders compiled')) ?? '');
  return {
    partsMs,
    sumMs: Object.values(partsMs).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0),
    blocks,
    blocksTotal: blocks ? Object.values(blocks).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0) : null,
    shadersMs: shaders ? Number(shaders[1]) : null,
  };
})();

// ── The table ───────────────────────────────────────────────────────────────
const f0 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? '–' : v.toFixed(0));
const f1 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? '–' : v.toFixed(1));
const f2 = (v) => (v === null || !Number.isFinite(v) ? '–' : v.toFixed(2));
const d = (a, b, fmt) => (b === undefined || b === null || !Number.isFinite(b) || !Number.isFinite(a) ? '' : ` (${a - b >= 0 ? '+' : ''}${fmt(a - b)})`);
console.log(
  `\nidle: ${dir} ${git.commit}${git.dirty ? ' + changes' : ''} · ${W}×${H} at ${DPR} · ${SECS} s a case · idle GPU ${f1(idleGpu?.pct ?? null)} % · Start after ${loadSecs.toFixed(1)} s${d(loadSecs, vs?.loadSecs, f1)} · build ${mapBuild ? (mapBuild.sumMs / 1000).toFixed(1) : '–'} s of parts${d((mapBuild?.sumMs ?? NaN) / 1000, vs?.build?.sumMs / 1000, f1)}, shaders ${mapBuild?.shadersMs != null ? (mapBuild.shadersMs / 1000).toFixed(1) : '–'} s${mapBuild?.blocksTotal ? ` · ${(mapBuild.blocksTotal / 1000).toFixed(0)} k blocks` : ''}`,
);
const cols = ['case', 'frames/s', 'last 5 s', 'rAF/s', 'busy %', 'script %', 'renderer %', 'GPU proc %', 'GPU util %', 'render ms/fr', 'update ms/fr', 'render %', 'update %', 'level', 'ratio', 'canvas', 'focus', 'heap MB', 'live MB', 'scene MB', 'GL MB', 'tab MB', 'GPU proc MB', 'geo/tex'];
/** The first of the memory columns (their group, `mem`, is named above them). */
const MEM0 = cols.indexOf('heap MB');
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
    f0(c.heapMB) + d(c.heapMB, was?.heapMB, f0),
    f0(c.mem?.heapLiveMB) + d(c.mem?.heapLiveMB, was?.mem?.heapLiveMB, f0),
    f0(c.mem?.sceneMB) + d(c.mem?.sceneMB, was?.mem?.sceneMB, f0),
    f0(c.mem?.gl?.total) + d(c.mem?.gl?.total, was?.mem?.gl?.total, f0),
    f0(c.mem?.procs?.renderer?.mb) + d(c.mem?.procs?.renderer?.mb, was?.mem?.procs?.renderer?.mb, f0),
    f0(c.mem?.procs?.gpu?.mb) + d(c.mem?.procs?.gpu?.mb, was?.mem?.procs?.gpu?.mb, f0),
    c.mem?.three ? `${c.mem.three.geometries}/${c.mem.three.textures}` : '–',
  ];
});
const widths = cols.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
const line = (r) => r.map((v, i) => (i === 0 ? v.padEnd(widths[i]) : v.padStart(widths[i]))).join('  ');
const lead = widths.slice(0, MEM0).reduce((a, w) => a + w + 2, 0);
const span = widths.slice(MEM0).reduce((a, w) => a + w + 2, -2);
console.log(' '.repeat(lead) + `── mem ${'─'.repeat(Math.max(0, span - 7))}`);
console.log(line(cols));
for (const r of rows) console.log(line(r));
// (each case's memory in parts: MB)
for (const c of cases) {
  const m = c.mem;
  if (!m?.geometry) continue;
  const p = m.procs;
  console.log(
    `idle: mem ${c.name.padEnd(8)} scene ${f0(m.sceneMB)} = geometry ${f0(m.geometry.shown)} + instances ${f0(m.instances.shown)} + textures ${f0(m.textures.uploaded)} (${m.textures.uploadedCount} of ${m.textures.count}) + targets ${f0(m.targetsMB)} (${m.targets.length}); not on the GPU now: geometry and instances under hidden objects ${f0(m.geometry.hidden + m.instances.hidden)}, textures ${f0(m.textures.waiting + m.textures.hidden)} · GL ${f0(m.gl?.total)} = buffers ${f0(m.gl?.buffers)} (${m.gl?.bufferCount}) + textures ${f0(m.gl?.textures)} (${m.gl?.textureCount}) + renderbuffers ${f0(m.gl?.renderbuffers)} (${m.gl?.renderbufferCount}) · ${m.counts.objects} objects, ${m.counts.instanced} instanced (${(m.counts.instances / 1000).toFixed(0)} k), ${m.three.programs} programs · GPU proc ${f0(p?.gpu?.mb)} (IOAccelerator ${f0(p?.gpu?.graphicsMB)}, IOSurface ${f0(p?.gpu?.surfaceMB)}) · tab ${f0(p?.renderer?.mb)}`,
  );
}
const lastMem = cases.at(-1)?.mem;
if (lastMem?.targets?.length) console.log(`idle: render targets (${cases.at(-1).name}): ${lastMem.targets.map((t) => `${t.name || '?'} ${t.size}${t.samples ? ` ×${t.samples}` : ''} ${f1(t.mb)}`).join(', ')} MB`);
if (noisy.length) console.warn(`idle: * another headless browser ran during ${noisy.join(', ')}: run again for clean numbers`);
if (Object.keys(failedHosts).length) console.log(`idle: requests not let out: ${Object.entries(failedHosts).map(([h, n]) => `${h} ${n}`).join(', ')}`);

if (argv.out) {
  const out = file(argv.out);
  writeFileSync(
    out,
    JSON.stringify({ date: new Date().toISOString(), dir, ...git, url: url.slice(origin.length), viewport: [W, H], dpr: DPR, secs: SECS, settle: SETTLE, chromium: chromiumVersion, gpu: gpuName, buildMs, loadSecs, build: mapBuild, idleGpuPct: idleGpu?.pct ?? null, otherBrowsersBefore: othersBefore, noisy, mapLog, failedHosts, cases }, null, 1),
  );
  console.log(`idle: ${out}`);
}
