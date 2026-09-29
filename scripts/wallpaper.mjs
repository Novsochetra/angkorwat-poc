// Draw the free camera's saved views and flights (src/map/dev/freecam.ts: ` on
// the dev server, then V to save a view and R to record a flight) with headless
// Chromium on the GPU, at full quality: a picture each view, a video each flight.
//
//   node scripts/wallpaper.mjs                 # every saved view → wallpapers/out/<name>.png
//   node scripts/wallpaper.mjs flights         # and every flight → wallpapers/out/<name>.mp4
//   node scripts/wallpaper.mjs only=a,b        # only these (views or flights)
//   node scripts/wallpaper.mjs list            # what is saved
//
// Options (name=value): graphics=max|high|medium|low (max) · fmt=png|jpg (png: a view's file) ·
// out=<folder> (wallpapers/out) · w= h= (a size for every view, over its own) ·
// base=http://127.0.0.1:5173 (a dev server that is running; else this starts its own).
// For a flight's video: codec=hevc|h264 (hevc: small, 10-bit, plays on a Mac and modern PCs; h264 plays
// everywhere) · crf= (its quality: hevc 22, h264 14; lower is finer) · frames=jpg|png (jpg: about nine times
// faster at 4K, and as good once the video is made; png keeps every pixel) · seam=0 (a loop without the
// cross-fade that hides its seam, to see what it does).
// Env: CHROMIUM=path a Chromium with a GPU (else Playwright's full Chromium; the
// headless shell draws with no GPU and is far slower). A flight needs ffmpeg.
//
// A flight that is a loop (`loop: true`: the frame after its last is its first) is made to repeat with no
// jump. The camera is already continuous; the world is not (its clouds and water have moved on), so the
// clip is drawn a little longer and the seam is a cross-fade of the same view at two times: the start of
// the clip, and what the world looks like just after its end.
//
// A view is `index.html?shot=1&cam=x,y,z,tx,ty,tz,fov&…` at its size (the moment:
// its `t`, time of day, moon, season and weather come with it); a flight moves the
// camera frame by frame (`__videoFrame`, as scripts/video.mjs does).
// The picture looks the way the free camera's frame did on the screen: `pxscale=` (its
// height over the frame's, `screenH`) draws the glow and the fireflies as big for it, and
// the explorer is where he was (`lead=`: a video's warm-up frames move him on first).
// Lines that begin with `@@` are for the free camera's panel (start, progress, done, fail).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { chromium } from 'playwright';
import { chromiumPath } from './chromium.mjs';

const root = resolve(import.meta.dirname, '..');
const dir = join(root, 'wallpapers');
const args = process.argv.slice(2);
const opt = (key, fallback) => args.find((a) => a.startsWith(`${key}=`))?.slice(key.length + 1) ?? fallback;
const graphics = opt('graphics', 'max');
const jpg = opt('fmt', 'png') === 'jpg';
const out = resolve(root, opt('out', 'wallpapers/out'));
const only = opt('only', '').split(',').filter(Boolean);
const sizeW = Number(opt('w', 0));
const sizeH = Number(opt('h', 0));
const codec = opt('codec', 'hevc') === 'h264' ? 'h264' : 'hevc';
const crf = opt('crf', codec === 'h264' ? '14' : '22');
const png = opt('frames', 'jpg') === 'png';
const withSeam = opt('seam', '1') !== '0';

/** A line for the free camera's panel. */
const say = (tag, ...rest) => console.log(['@@' + tag, ...rest].join(' '));
const readJson = (file, fallback) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};

const views = readJson(join(dir, 'views.json'), []);
const flightNames = existsSync(join(dir, 'paths')) ? readdirSync(join(dir, 'paths')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : [];

if (args.includes('list')) {
  console.log(`views (${views.length}):`);
  for (const v of views) console.log(`  ${v.name}  ${v.w}×${v.h}  ${v.shape}  saved ${v.saved}`);
  console.log(`flights (${flightNames.length}):`);
  for (const n of flightNames) {
    const f = readJson(join(dir, 'paths', `${n}.json`), null);
    if (f) console.log(`  ${n}  ${f.w}×${f.h}  ${(f.samples.length / f.fps).toFixed(1)} s at ${f.fps} fps`);
  }
  process.exit(0);
}

// What to draw: the saved views (all, or the ones named), the flights when asked for or named.
const jobs = [];
for (const v of views) if (!only.length || only.includes(v.name)) jobs.push({ kind: 'view', name: v.name, data: v });
for (const n of flightNames) if (only.length ? only.includes(n) : args.includes('flights')) jobs.push({ kind: 'flight', name: n, data: readJson(join(dir, 'paths', `${n}.json`), null) });
for (const n of only) if (!jobs.some((j) => j.name === n)) console.warn(`[wallpaper] no view or flight called "${n}"`);
if (!jobs.length) {
  if (only.length) process.exit(1);
  console.log('[wallpaper] nothing to draw. On the dev server (npm run dev) press ` on the map, fly, and press V to save a view.');
  process.exit(0);
}
mkdirSync(out, { recursive: true });

/** Playwright's full Chromium (it draws with the GPU headless; the headless shell does not). */
function gpuChromium() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), process.platform === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright');
  const app = process.platform === 'darwin' ? 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' : 'chrome-linux/chrome';
  const found = existsSync(cache) ? readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9))) : [];
  for (const d of found) {
    const exe = join(cache, d, app);
    if (existsSync(exe)) return exe;
  }
  return undefined;
}

let server = null;
let base = opt('base', '');
if (!base) {
  const { createServer } = await import('vite');
  server = await createServer({ root, logLevel: 'error', server: { port: 5196, strictPort: false, hmr: false } });
  await server.listen();
  base = new URL(server.resolvedUrls.local[0]).origin;
}
const exe = gpuChromium();
if (!exe) console.warn('[wallpaper] no Chromium with a graphics card found: drawing in software, very slowly (npx playwright install chromium)');
const browser = await chromium.launch({
  executablePath: exe ?? chromiumPath(),
  args: exe ? ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

/** Frames drawn before a video's first (s): the parts that ease in come to rest. */
const WARMUP = 1.5;

/** How much bigger than the free camera's frame on the screen the picture is (a view saved before `screenH`: a screen 1800 pixels high). */
const pxScale = (item, h) => (item.screenH > 0 ? h / item.screenH : Math.max(1, h / 1800)).toFixed(3);

/** The map's page for a view or a flight: a shot of its moment (`extra`: more values). */
function pageUrl(item, extra) {
  const q = new URLSearchParams(item.query);
  q.set('shot', '1');
  q.set('ui', '0');
  q.set('story', '0');
  q.set('graphics', graphics);
  if (item.noExplorer) q.set('explorer', '0');
  for (const [k, v] of Object.entries(extra)) q.set(k, String(v));
  return `${base}/index.html?${q}`;
}

/** Open the page at a size, and wait until the map has drawn its first frame. */
async function openMap(item, w, h, extra) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  try {
    page.on('pageerror', (e) => console.error('[pageerror]', e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') console.log('[error]', m.text().slice(0, 300));
    });
    await page.goto(pageUrl(item, extra), { waitUntil: 'load', timeout: 300_000 });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 300_000 });
    return page;
  } catch (err) {
    // (a page that did not load must not stay open, holding the graphics card's memory, while the next one draws)
    await page.close().catch(() => undefined);
    throw err;
  }
}

async function drawView(v) {
  const [w, h] = [sizeW || v.w, sizeH || v.h];
  const page = await openMap(v, w, h, { cam: v.cam.join(','), pxscale: pxScale(v, h) });
  try {
    const file = join(out, `${v.name}.${jpg ? 'jpg' : 'png'}`);
    await page.screenshot({ path: file, type: jpg ? 'jpeg' : 'png', ...(jpg ? { quality: 95 } : {}), timeout: 240_000 });
    say('done', v.name, relative(dir, file));
    return `${w}×${h} → ${relative(root, file)}`;
  } finally {
    await page.close();
  }
}

async function drawFlight(f) {
  // (a video's codec needs even sizes)
  const even = (n) => n + (n % 2);
  const [w, h] = [even(sizeW || f.w), even(sizeH || f.h)];
  const { fps, samples } = f;
  const n = samples.length;
  // A loop whose world moves has a seam to hide (see the top): the clip is drawn `fade` frames longer, and the first
  // `fade` frames are kept back until the end, where they are laid over the frames that follow the clip's last one.
  const seam = f.loop === true && !f.frozen && withSeam && n >= 6;
  const fade = seam ? Math.max(2, Math.min(Math.round(fps * 1.2), Math.floor(n / 3))) : 0;
  const total = n + fade;
  const file = join(out, `${f.name}.mp4`);
  // The video: the frames go to ffmpeg as they are drawn, none are kept. The picture's colours are sRGB, which a player
  // reads as BT.709 in a video: said outright (ffmpeg's own guess is BT.601: a shift in hue and saturation).
  const matrix = 'out_color_matrix=bt709:out_range=tv' + (png ? '' : ':in_color_matrix=bt601:in_range=pc');
  const encode =
    codec === 'h264'
      ? ['-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-pix_fmt', 'yuv420p']
      : ['-c:v', 'libx265', '-preset', 'medium', '-crf', crf, '-pix_fmt', 'yuv420p10le', '-tag:v', 'hvc1', '-x265-params', 'log-level=error:colorprim=bt709:transfer=bt709:colormatrix=bt709:range=limited'];
  const ffmpeg = spawn(
    'ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', png ? 'png' : 'mjpeg', '-i', '-', '-vf', `scale=${matrix}`, ...encode, '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', file],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  );
  const finished = new Promise((res, rej) => {
    ffmpeg.on('error', (e) => rej(new Error(`ffmpeg: ${e.message} (brew install ffmpeg)`)));
    ffmpeg.on('close', (code) => (code === 0 ? res() : rej(new Error(`ffmpeg stopped with ${code}`))));
  });
  finished.catch(() => undefined);
  ffmpeg.stdin.on('error', () => undefined);
  const put = async (buf) => {
    if (!ffmpeg.stdin.write(buf)) await Promise.race([new Promise((r) => ffmpeg.stdin.once('drain', r)), finished]);
  };
  let page = null;
  try {
    // (it is running before the map loads, which takes a while: a missing ffmpeg is found now, not at the first frame)
    await Promise.race([new Promise((res) => ffmpeg.once('spawn', res)), finished]);
    // (the warm-up frames step the explorer on too: he starts `lead` s back, so the first frame has him where he was)
    page = await openMap(f, w, h, { video: 1, t: f.t0.toFixed(1), cam: samples[0].slice(0, 7).join(','), pxscale: pxScale(f, h), lead: WARMUP });
    const draw = (s, t, dt) => page.evaluate(([t, dt, cam, clock]) => window.__videoFrame(t, dt, cam, clock), [t, dt, s.slice(0, 7), s[7]]);
    const grab = () => page.screenshot({ type: png ? 'png' : 'jpeg', ...(png ? {} : { quality: 97 }), timeout: 240_000 });
    if (seam) {
      // (a canvas over the picture, for the cross-fade: the frame now, and over it the kept one at some strength)
      await page.evaluate(() => {
        const gl = document.getElementById('scene');
        const c = document.createElement('canvas');
        c.width = gl.width;
        c.height = gl.height;
        Object.assign(c.style, { position: 'fixed', left: '0', top: '0', width: '100vw', height: '100vh', zIndex: '2147483647', display: 'none' });
        document.body.append(c);
        window.__seam = { gl, c, g: c.getContext('2d') };
      });
    }
    // (frames before the first: the parts that ease in come to rest, as in scripts/video.mjs, but for longer: the first
    // frames of a clip that repeats must be as steady as the rest, or its seam shows them)
    const before = Math.round(fps * WARMUP);
    for (let k = before; k > 0; k--) await draw(samples[0], f.frozen ? f.t0 : f.t0 - k / fps, 1 / fps);
    /** The first frames, kept for the seam. */
    const head = [];
    for (let i = 0; i < total; i++) {
      if (seam && i === total - 1) {
        // (the seam's last frame is all of the start's frame that was kept: nothing to blend, and no second JPEG)
        await put(head[fade - 1]);
        say('progress', f.name, total, total);
        break;
      }
      // (a loop's path repeats: what follows the last frame is the first again, at a later time)
      await draw(samples[i % n], f.frozen ? f.t0 : f.t0 + i / fps, f.frozen ? 0 : 1 / fps);
      if (i < fade) head.push(await grab());
      else if (i < n) await put(await grab());
      else {
        // (the clip's end: this view, a moment after the clip, turning into the same view at the clip's start)
        const k = i - n;
        await page.evaluate(
          async ([b64, strength, type]) => {
            const { gl, c, g } = window.__seam;
            g.globalAlpha = 1;
            g.drawImage(gl, 0, 0);
            const image = await createImageBitmap(await (await fetch(`data:image/${type};base64,${b64}`)).blob());
            g.globalAlpha = strength;
            g.drawImage(image, 0, 0);
            image.close();
            c.style.display = 'block';
          },
          [head[k].toString('base64'), k / (fade - 1), png ? 'png' : 'jpeg'],
        );
        await put(await grab());
        await page.evaluate(() => (window.__seam.c.style.display = 'none'));
      }
      say('progress', f.name, i + 1, total);
    }
    ffmpeg.stdin.end();
    await finished;
    say('done', f.name, relative(dir, file));
    return `${w}×${h}, ${(n / fps).toFixed(1)} s at ${fps} fps, ${codec === 'h264' ? 'H.264' : 'HEVC'}${f.loop ? (seam ? ', a loop (seam blended)' : ', a loop') : ''} → ${relative(root, file)}`;
  } finally {
    // (every way out lets ffmpeg go: no process is left waiting for frames)
    ffmpeg.stdin.end();
    await page?.close().catch(() => undefined);
  }
}

let failed = 0;
for (const job of jobs) {
  say('start', job.name, job.kind);
  const started = Date.now();
  try {
    if (!job.data) throw new Error('its file could not be read');
    const what = await (job.kind === 'view' ? drawView(job.data) : drawFlight(job.data));
    console.log(`[wallpaper] ${job.name}: ${what} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
  } catch (err) {
    failed++;
    const text = String(err?.message ?? err).split('\n')[0];
    console.error(`[wallpaper] ${job.name} failed: ${text}`);
    say('fail', job.name, text);
  }
}
await browser.close();
await server?.close();
process.exit(failed ? 1 : 0);
