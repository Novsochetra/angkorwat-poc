// Record a video of the world map with headless Chromium on the GPU, frame by
// frame (the map's `__videoFrame`, video=1), then join the shots with ffmpeg.
//
//   node scripts/video.mjs                    # the promo (scripts/promo-cut.mjs) → screenshots/promo.mp4
//   node scripts/video.mjs preview            # 3 stills a shot (first, middle, last) → screenshots/video-preview/
//   node scripts/video.mjs only=glide,night   # only these shots (their clips are kept for the rest)
//
// Env: VIDEO_W / VIDEO_H (1920×1080), VIDEO_FPS (30), VIDEO_CUT=path a
// different cut, CHROMIUM=path a Chromium with a GPU (else Playwright's full
// Chromium; the headless shell draws with no GPU and is far slower).
//
// A cut is a list of shots: { name, query (index.html's URL values), seconds,
// t0 (the scene's time at the start), cam(u) → [x, y, z, tx, ty, tz] or null
// (the rig's, or the roaming explorer's camera), clock(u) → 0‥1 or null,
// overlay: { html, css, show(u) → 0‥1 } }, u going 0 → 1 over the shot;
// `fade` (s) is the cross-fade between shots, `audio` the sound (see below).
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const preview = args.includes('preview');
// (`only=` in a preview: just those shots' stills)
const only = args.find((a) => a.startsWith('only='))?.slice(5).split(',');
const W = Number(process.env.VIDEO_W ?? 1920);
const H = Number(process.env.VIDEO_H ?? 1080);
const FPS = Number(process.env.VIDEO_FPS ?? 30);
const cut = (await import(resolve(root, process.env.VIDEO_CUT ?? 'scripts/promo-cut.mjs'))).default;
const out = resolve(root, 'screenshots');
const work = join(out, preview ? 'video-preview' : `video-${cut.name}`);
mkdirSync(work, { recursive: true });

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

const server = await createServer({ root, logLevel: 'error', server: { port: 5198, strictPort: false, hmr: false } });
await server.listen();
const base = new URL(server.resolvedUrls.local[0]).origin;
const browser = await chromium.launch({ executablePath: gpuChromium(), args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[error]', m.text().slice(0, 300));
});

const ffmpeg = (a) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a], { stdio: 'inherit' });

const clips = [];
for (const shot of cut.shots) {
  const clip = join(work, `${shot.name}.mp4`);
  clips.push({ shot, clip });
  if (only && !only.includes(shot.name) && (preview || existsSync(clip))) continue;
  const t0 = shot.t0 ?? 12;
  const url = `${base}/index.html?shot=1&video=1&ui=0&graphics=${cut.graphics ?? 'max'}&t=${t0}&story=0${shot.query ? `&${shot.query}` : ''}`;
  const started = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 300_000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300_000 });
  if (shot.overlay) {
    await page.evaluate(({ html, css }) => {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.append(style);
      const el = document.createElement('div');
      el.id = 'video-overlay';
      el.innerHTML = html;
      document.body.append(el);
      return document.fonts.ready;
    }, { html: shot.overlay.html, css: shot.overlay.css });
  }
  const n = Math.round(shot.seconds * FPS);
  const frames = preview ? [0, Math.floor((n - 1) / 2), n - 1] : [...Array(n).keys()];
  const dir = join(work, shot.name);
  rmSync(dir, { recursive: true, force: true });
  if (!preview) mkdirSync(dir, { recursive: true });
  // (a few frames before the first: the camera's follow and the eased parts come to rest)
  for (let k = cut.preroll ?? 10; k > 0; k--) {
    await page.evaluate((a) => window.__videoFrame(...a), [t0 - k / FPS, 1 / FPS, shot.cam?.(0) ?? null, shot.clock?.(0) ?? null]);
  }
  let last = -1;
  for (const i of frames) {
    const u = n > 1 ? i / (n - 1) : 0;
    // (a preview jumps: the frames between run too, so the explorer is where he would be)
    for (let j = last + 1; j <= i; j++) {
      const uj = n > 1 ? j / (n - 1) : 0;
      await page.evaluate((a) => window.__videoFrame(...a), [t0 + j / FPS, 1 / FPS, shot.cam?.(uj) ?? null, shot.clock?.(uj) ?? null]);
    }
    last = i;
    if (shot.overlay) await page.evaluate((o) => (document.getElementById('video-overlay').style.opacity = String(o)), shot.overlay.show(u));
    await page.screenshot({ path: preview ? join(work, `${shot.name}-${String(i).padStart(3, '0')}.png`) : join(dir, `${String(i).padStart(4, '0')}.png`) });
  }
  console.log(`${shot.name}: ${frames.length} frames in ${((Date.now() - started) / 1000).toFixed(0)} s`);
  if (preview) continue;
  ffmpeg(['-framerate', String(FPS), '-i', join(dir, '%04d.png'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', clip]);
  rmSync(dir, { recursive: true, force: true });
}

// ── Sound: the map's own (music, ambience), rendered offline in the page ────
let wav = null;
if (!preview && cut.audio) {
  const total = cut.shots.reduce((s, x) => s + x.seconds, 0) - cut.fade * (cut.shots.length - 1);
  await page.goto(`${base}/index.html?shot=1&ui=0&loading=0.5`, { waitUntil: 'load', timeout: 300_000 });
  const samples = await page.evaluate(
    async ({ total, audio }) => {
      const { SoundEngine } = await import('/src/map/audio/engine.ts');
      // (the time of day along the video: straight lines between [u, night] stops)
      const night = (u) => {
        const s = audio.nights;
        for (let i = 1; i < s.length; i++) if (u <= s[i][0]) return s[i - 1][1] + ((u - s[i - 1][0]) / (s[i][0] - s[i - 1][0] || 1)) * (s[i][1] - s[i - 1][1]);
        return s[s.length - 1][1];
      };
      const rate = 48000;
      const ctx = new OfflineAudioContext(2, Math.ceil((total + 0.5) * rate), rate);
      const engine = new SoundEngine(ctx, { seed: audio.seed });
      engine.setVolumes(audio.volumes, true);
      engine.setMix({ night: night(0) }, true);
      engine.fadeIn(audio.fadeIn);
      engine.schedule(0.75);
      for (const c of audio.cues) engine.play(c.sound, c.at);
      // (stop every quarter second: the time of day, and the voices scheduled ahead)
      for (let t = 0.25; t < total; t += 0.25) {
        const at = t;
        ctx.suspend(at).then(() => {
          engine.setMix({ night: night(at / total) });
          engine.schedule(at + 0.75);
          ctx.resume();
        });
      }
      const buf = await ctx.startRendering();
      return [0, 1].map((c) => Array.from(buf.getChannelData(c)));
    },
    { total, audio: cut.audio },
  ).catch((e) => (console.error('[audio]', e.message), null));
  if (samples) {
    wav = join(work, 'sound.wav');
    writeFileSync(wav, toWav(samples, 48000));
  }
}

await browser.close();
await server.close();
if (preview) {
  console.log(`preview stills: ${work}`);
  process.exit(0);
}

// ── Join: cross-fades between the shots, the sound under them ─────────────
const inputs = clips.flatMap(({ clip }) => ['-i', clip]);
let chain = '';
let prev = '0:v';
let offset = 0;
clips.forEach(({ shot }, i) => {
  if (i === 0) return;
  offset += clips[i - 1].shot.seconds - cut.fade;
  const outLabel = i === clips.length - 1 ? 'vj' : `v${i}`;
  chain += `[${prev}][${i}:v]xfade=transition=fade:duration=${cut.fade}:offset=${offset.toFixed(3)}[${outLabel}];`;
  prev = outLabel;
});
const total = clips.reduce((s, c) => s + c.shot.seconds, 0) - cut.fade * (clips.length - 1);
chain += `[${clips.length > 1 ? 'vj' : '0:v'}]fade=t=in:st=0:d=0.4,fade=t=out:st=${(total - 0.6).toFixed(3)}:d=0.6,format=yuv420p[v]`;
const file = join(out, `${cut.name}.mp4`);
const audioIn = wav ? ['-i', wav] : [];
const audioMap = wav ? ['-map', `${clips.length}:a`, '-af', `afade=t=out:st=${(total - 1).toFixed(3)}:d=1`, '-c:a', 'aac', '-b:a', '192k'] : [];
ffmpeg([...inputs, ...audioIn, '-filter_complex', chain, '-map', '[v]', ...audioMap, '-t', total.toFixed(3), '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file]);
console.log(`${file} (${total.toFixed(2)} s, ${W}×${H} at ${FPS} fps${wav ? ', with sound' : ''})`);

/** 16-bit stereo WAV from two channels of samples. */
function toWav([l, r], rate) {
  const n = l.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, l[i])) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, r[i])) * 32767), 46 + i * 4);
  }
  return buf;
}
