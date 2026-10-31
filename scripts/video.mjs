// Record a video of the world map with headless Chromium, frame by frame (the
// map's `__videoFrame`, video=1), then join the shots with ffmpeg.
//
//   node scripts/video.mjs                    # the promo (scripts/promo-cut.mjs) → screenshots/promo.mp4
//   node scripts/video.mjs preview            # 3 stills a shot (first, middle, last) → screenshots/video-preview/
//   node scripts/video.mjs only=glide,night   # only these shots (their clips are kept for the rest)
//   node scripts/video.mjs jobs=2             # shots drawn in two browsers side by side
//   node scripts/video.mjs join               # no drawing: join the clips there are, the sound made again
//   VIDEO_CUT=scripts/promo-village-cut.mjs node scripts/video.mjs    # another cut
//
// Env: VIDEO_W / VIDEO_H (1920×1080), VIDEO_FPS (the cut's `fps`, else 30),
// VIDEO_SCALE=0.5 (drawn at half that, laid out at full: a quick look),
// VIDEO_GRAPHICS=<level> (instead of the cut's),
// VIDEO_CUT=path a different cut, CHROMIUM=path a Chromium with a GPU (else
// Playwright's full Chromium; the headless shell draws with no GPU and is far
// slower), VIDEO_GL=swiftshader to draw on the CPU (the default on Linux with
// no CHROMIUM: a cloud machine has no GPU; about 5–30 s a frame).
//
// A cut is a list of shots: { name, query (index.html's URL values), seconds,
// t0 (the scene's time at the start), speed (scene seconds a video second: a
// time-lapse), cam(u) → [x, y, z, tx, ty, tz] or null (the rig's, or the
// roaming explorer's camera), clock(u) → 0‥1 or null, input (keys pressed
// while it plays: [[s, 'down'|'up'|'press', code], …], s seconds into the
// shot), setup / each(u, s) (functions run in the page: once when it is ready,
// and before each frame; written on their own, they see only the page's
// globals: `roam`, `__garden`, …), overlay: { html, css, show(u) → 0‥1 },
// caption: { km, en, at: [in, out] (s) } (the cut's `captionCss`),
// transition: { type, seconds } (into it: an ffmpeg xfade, else `fade`),
// sound: { gain } (its own sounds) }, u going 0 → 1 over the shot.
//
// The sound: `audio` (the map's own music and ambience, rendered offline, the
// 15-second promo's), or `music` (a score, src/map/video/score.ts) with the
// sounds each shot's map made (src/map/video/soundtrack.ts: noted while it is
// drawn, played back on the map's sound engine after; `volumes` the buses).
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const preview = args.includes('preview');
const joinOnly = args.includes('join');
// (`only=` in a preview: just those shots' stills)
const only = args.find((a) => a.startsWith('only='))?.slice(5).split(',');
const jobs = Math.max(1, Number(args.find((a) => a.startsWith('jobs='))?.slice(5) ?? 1));
const W = Number(process.env.VIDEO_W ?? 1920);
const H = Number(process.env.VIDEO_H ?? 1080);
const cut = (await import(resolve(root, process.env.VIDEO_CUT ?? 'scripts/promo-cut.mjs'))).default;
const FPS = Number(process.env.VIDEO_FPS ?? cut.fps ?? 30);
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
const software = (process.env.VIDEO_GL ?? (process.platform === 'linux' && !process.env.CHROMIUM ? 'swiftshader' : '')) === 'swiftshader';
const launch = () =>
  chromium.launch(
    software
      ? { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }
      : { executablePath: gpuChromium(), args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] },
  );

const ffmpeg = (a) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a], { stdio: 'inherit' });

// ── The timeline: each shot's start, its transition in, where it is heard ──
const fadeOf = (i) => (i === 0 ? 0 : (cut.shots[i].transition?.seconds ?? cut.fade));
const offsets = [];
cut.shots.forEach((s, i) => offsets.push(i === 0 ? 0 : offsets[i - 1] + cut.shots[i - 1].seconds - fadeOf(i)));
const total = offsets.at(-1) + cut.shots.at(-1).seconds;

const server = await createServer({ root, logLevel: 'error', server: { port: 5198, strictPort: false, hmr: false } });
await server.listen();
const base = new URL(server.resolvedUrls.local[0]).origin;

const clips = cut.shots.map((shot) => ({ shot, clip: join(work, `${shot.name}.mp4`), sound: join(work, `${shot.name}.sound.json`) }));
const todo = joinOnly ? [] : clips.filter(({ shot, clip }) => !(only && !only.includes(shot.name) && (preview || existsSync(clip))));

/** Draw one shot into its clip (or its preview stills). */
async function drawShot(page, { shot, clip, sound }) {
  const t0 = shot.t0 ?? 12;
  const speed = shot.speed ?? 1;
  const url = `${base}/index.html?shot=1&video=1&ui=0&graphics=${process.env.VIDEO_GRAPHICS ?? shot.graphics ?? cut.graphics ?? 'max'}&t=${t0}&story=0&progress=0${shot.query ? `&${shot.query}` : ''}`;
  const started = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 600_000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 600_000 });
  // (what the map asks of its sound, noted frame by frame: src/map/video/soundtrack.ts)
  if (cut.music && !preview)
    await page.evaluate(async () => {
      const m = await import('/src/map/video/soundtrack.ts');
      window.__soundCap = m.captureSound(window.audio);
    });
  if (shot.setup) await page.evaluate(`(${shot.setup.toString()})()`);
  const layers = [];
  if (shot.overlay) layers.push({ id: 'video-overlay', html: shot.overlay.html, css: shot.overlay.css });
  if (shot.caption) layers.push({ id: 'video-caption', html: `<div class="km">${shot.caption.km}</div><div class="rule"></div><div class="en">${shot.caption.en}</div>`, css: cut.captionCss ?? '' });
  for (const l of layers)
    await page.evaluate(({ id, html, css }) => {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.append(style);
      const el = document.createElement('div');
      el.id = id;
      el.innerHTML = html;
      document.body.append(el);
      return document.fonts.ready;
    }, l);
  const n = Math.round(shot.seconds * FPS);
  const frames = preview ? [0, Math.floor((n - 1) / 2), n - 1] : [...Array(n).keys()];
  const dir = join(work, shot.name);
  rmSync(dir, { recursive: true, force: true });
  if (!preview) mkdirSync(dir, { recursive: true });
  const input = [...(shot.input ?? [])].sort((a, b) => a[0] - b[0]);
  let next = 0;
  const each = shot.each ? shot.each.toString() : null;
  const step = async (j, draw = true) => {
    const uj = n > 1 ? j / (n - 1) : 0;
    const s = j / FPS;
    // (the keys of this second: Playwright's are the page's own, trusted)
    while (next < input.length && input[next][0] <= s + 1e-6) {
      const [, how, code] = input[next++];
      if (how === 'down') await page.keyboard.down(code);
      else if (how === 'up') await page.keyboard.up(code);
      else await page.keyboard.press(code);
    }
    await page.evaluate(
      ([t, dt, cam, clock, src, u, sec, draw]) => {
        window.__soundCap?.at(sec);
        if (src) (0, eval)(`(${src})`)(u, sec);
        window.__videoFrame(t, dt, cam, clock, draw);
      },
      [t0 + (j * speed) / FPS, speed / FPS, shot.cam?.(uj) ?? null, shot.clock?.(uj) ?? null, each, uj, s, draw],
    );
  };
  // (a few frames before the first: the camera's follow and the eased parts come to rest)
  for (let k = cut.preroll ?? 10; k > 0; k--) {
    await page.evaluate(
      ([t, dt, cam, clock, sec]) => {
        window.__soundCap?.at(sec);
        window.__videoFrame(t, dt, cam, clock, false);
      },
      [t0 - (k * speed) / FPS, speed / FPS, shot.cam?.(0) ?? null, shot.clock?.(0) ?? null, -k / FPS],
    );
  }
  let last = -1;
  for (const i of frames) {
    const u = n > 1 ? i / (n - 1) : 0;
    // (a preview jumps: the frames between run too, so the explorer is where he would be)
    for (let j = last + 1; j <= i; j++) await step(j, j === i);
    last = i;
    const s = i / FPS;
    await page.evaluate(
      ({ o, c }) => {
        const ov = document.getElementById('video-overlay');
        if (ov && o !== null) ov.style.opacity = String(o);
        const cap = document.getElementById('video-caption');
        if (cap && c !== null) {
          cap.style.opacity = String(c);
          cap.style.transform = `translateY(${((1 - c) * 14).toFixed(1)}px)`;
        }
      },
      { o: shot.overlay ? shot.overlay.show(u) : null, c: shot.caption ? captionAt(shot.caption, s, shot.seconds) : null },
    );
    const path = preview ? join(work, `${shot.name}-${String(i).padStart(3, '0')}.jpg`) : join(dir, `${String(i).padStart(4, '0')}.jpg`);
    await page.screenshot({ path, type: 'jpeg', quality: 94, timeout: 600_000 });
  }
  for (const [, how, code] of input) if (how === 'down') await page.keyboard.up(code).catch(() => {});
  console.log(`${shot.name}: ${frames.length} frames in ${((Date.now() - started) / 1000).toFixed(0)} s`);
  if (preview) return;
  if (cut.music) writeFileSync(sound, JSON.stringify(await page.evaluate(() => window.__soundCap.take())));
  ffmpeg(['-framerate', String(FPS), '-i', join(dir, '%04d.jpg'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', clip]);
  rmSync(dir, { recursive: true, force: true });
}

/** A caption's level at `s` s into its shot: in over 0.5 s from `at[0]`, out over 0.4 s to `at[1]`. */
function captionAt(c, s, len) {
  const [a, b] = c.at ?? [0.5, len - 0.4];
  const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  return Math.min(ease((s - a) / 0.5), ease((b - s) / 0.4));
}

// ── Draw the shots (in `jobs` browsers side by side) ─────────────────────────
const browsers = [];
const queue = [...todo];
await Promise.all(
  [...Array(Math.min(jobs, Math.max(1, queue.length))).keys()].map(async () => {
    if (!queue.length) return;
    const browser = await launch();
    browsers.push(browser);
    // (VIDEO_SCALE=0.5: drawn at half the size, laid out as at full: a quicker look at a cut)
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: Number(process.env.VIDEO_SCALE ?? 1) });
    page.on('pageerror', (e) => console.error('[pageerror]', e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/ERR_UNSAFE_PORT|ERR_CONNECTION_REFUSED/.test(m.text())) console.log('[error]', m.text().slice(0, 300));
      else if (/^\[(video|build|garden|cow|cattle)\]/.test(m.text()) && m.type() === 'warning') console.log('[warn]', m.text().slice(0, 300));
    });
    while (queue.length) {
      const c = queue.shift();
      try {
        await drawShot(page, c);
      } catch (e) {
        console.error(`${c.shot.name}: FAILED`, e.message);
      }
    }
  }),
);

// ── Sound ─────────────────────────────────────────────────────────────────────
let wav = null;
if (!preview && (cut.audio || cut.music)) {
  const browser = browsers[0] ?? (await launch());
  if (!browsers.length) browsers.push(browser);
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  page.on('console', (m) => {
    if (/^\[video\]/.test(m.text())) console.log(m.text());
  });
  wav = join(work, 'sound.wav');
  const samples = cut.music ? await musicTrack(page) : await mapTrack(page);
  if (typeof samples === 'string') writeFileSync(wav, pcmWav(Buffer.from(samples, 'base64'), 48000));
  else if (samples) writeFileSync(wav, toWav(samples, 48000));
  else wav = null;
}

for (const b of browsers) await b.close();
await server.close();
if (preview) {
  console.log(`preview stills: ${work}`);
  process.exit(0);
}

// ── Join: transitions between the shots, the sound under them ────────────────
const inputs = clips.flatMap(({ clip }) => ['-i', clip]);
let chain = '';
let prev = '0:v';
clips.forEach(({ shot }, i) => {
  if (i === 0) return;
  const outLabel = i === clips.length - 1 ? 'vj' : `v${i}`;
  const type = shot.transition?.type ?? 'fade';
  const d = fadeOf(i);
  chain += `[${prev}][${i}:v]xfade=transition=${type}:duration=${d.toFixed(3)}:offset=${offsets[i].toFixed(3)}[${outLabel}];`;
  prev = outLabel;
});
chain += `[${clips.length > 1 ? 'vj' : '0:v'}]fade=t=in:st=0:d=${cut.fadeIn ?? 0.4},fade=t=out:st=${(total - (cut.fadeOut ?? 0.6)).toFixed(3)}:d=${cut.fadeOut ?? 0.6},format=yuv420p[v]`;
const file = join(out, `${cut.name}.mp4`);
const audioIn = wav ? ['-i', wav] : [];
// (a cut's `loudness`: the sound brought to that many LUFS, as online video plays it)
const loud = cut.loudness ? `,loudnorm=I=${cut.loudness}:TP=-1.5:LRA=11:linear=true` : '';
const audioMap = wav ? ['-map', `${clips.length}:a`, '-af', `afade=t=out:st=${(total - 1).toFixed(3)}:d=1${loud},aresample=48000`, '-c:a', 'aac', '-b:a', '256k'] : [];
ffmpeg([...inputs, ...audioIn, '-filter_complex', chain, '-map', '[v]', ...audioMap, '-t', total.toFixed(3), '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file]);
console.log(`${file} (${total.toFixed(2)} s, ${W}×${H} at ${FPS} fps${wav ? ', with sound' : ''})`);

/** The 15-second promo's sound: the map's own (music, ambience), rendered offline in the page. */
async function mapTrack(page) {
  await page.goto(`${base}/index.html?shot=1&ui=0&loading=0.5`, { waitUntil: 'load', timeout: 300_000 });
  return page
    .evaluate(
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
        // (the monks' chanting from the recordings, as in the game: audio/chants.ts; else it is synthesized)
        if (audio.volumes.ambience > 0) {
          const { loadChants } = await import('/src/map/audio/chants.ts');
          await loadChants();
        }
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
    )
    .catch((e) => (console.error('[audio]', e.message), null));
}

/** A cut with `music`: the score, and each shot's own sounds played back where it is on the timeline. */
async function musicTrack(page) {
  // (the land for the water's sound: where the falls and rivers are)
  await page.goto(`${base}/index.html?shot=1&ui=0&graphics=low&story=0&progress=0&parts=terrain,water`, { waitUntil: 'load', timeout: 600_000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 600_000 });
  const segments = clips.map(({ shot, sound }, i) => ({
    offset: offsets[i],
    hear: i === 0 ? 0 : offsets[i] + fadeOf(i) / 2,
    until: i === clips.length - 1 ? total : offsets[i + 1] + fadeOf(i + 1) / 2,
    gain: shot.sound?.gain ?? 1,
    sound: existsSync(sound) ? JSON.parse(readFileSync(sound, 'utf8')) : { frames: [], events: [] },
  }));
  for (const [i, s] of segments.entries()) if (!s.sound.frames.length) console.log(`[video] ${clips[i].shot.name}: no sound noted (draw it again)`);
  const t = Date.now();
  const samples = await page
    .evaluate(
      async (plan) => {
        const m = await import('/src/map/video/soundtrack.ts');
        const [l, r] = await m.renderSoundtrack(plan, window.field ?? null);
        // (16-bit, both channels interleaved, as base64: a plain array of 10 M numbers is too much to hand over)
        const pcm = new Int16Array(l.length * 2);
        for (let i = 0; i < l.length; i++) {
          pcm[2 * i] = Math.round(Math.max(-1, Math.min(1, l[i])) * 32767);
          pcm[2 * i + 1] = Math.round(Math.max(-1, Math.min(1, r[i])) * 32767);
        }
        const bytes = new Uint8Array(pcm.buffer);
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(bin);
      },
      { total, segments, volumes: cut.volumes, music: { ...cut.music, total }, musicLevel: cut.musicLevel, seed: 7, fadeIn: cut.fadeIn ?? 0.4, fadeOut: 1.5 },
    )
    .catch((e) => (console.error('[audio]', e.message), null));
  console.log(`sound: ${((Date.now() - t) / 1000).toFixed(0)} s`);
  return samples;
}

/** A WAV around 16-bit stereo samples, interleaved. */
function pcmWav(pcm, rate) {
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + pcm.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(2, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 4, 28);
  head.writeUInt16LE(4, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([head, pcm]);
}

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
