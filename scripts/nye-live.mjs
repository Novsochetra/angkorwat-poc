// New Year's Eve (AWP-35): play the night LIVE, in real time, as a player's page does (not a still shot), and keep
// what it showed and what it sounded like.
//
//   node scripts/nye-live.mjs                      # midnight 150 s after the page opens, 60 s of the show after it
//   node scripts/nye-live.mjs lead=200 after=90    # midnight 200 s after opening, 90 s of show
//   node scripts/nye-live.mjs url="graphics=medium" cam=384,11,-248,410,40,-335,55
//
// The page opens with `nye=+<lead>s` (clock.ts: midnight comes that long after it opened), its Start button is
// pressed (the sound starts there, as for a player), and from then on frames are saved to
// screenshots/nye-live/<seconds-to-midnight>.png (every `every` s, every 2 s from 15 s before midnight to 30 s
// after), and everything the page plays is recorded (a tap on the sound's way out to the speakers) into
// screenshots/nye-live/night.wav (mono, 24 kHz). The console says when each overlay state, toast and the first
// bursts came. On a machine with no GPU (SwiftShader) the page draws a few frames a second and its sounds come
// late when a frame stalls; on a Mac (CHROMIUM= a GPU Chromium, or the default) it plays as for a player.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { chromiumPath } from './chromium.mjs';

const root = resolve(import.meta.dirname, '..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)]));
const lead = Number(argv.lead ?? 150);
const after = Number(argv.after ?? 60);
const every = Number(argv.every ?? 15);
const cam = argv.cam ?? '384,11,-248,410,40,-335,55';
const out = resolve(root, 'screenshots/nye-live');
mkdirSync(out, { recursive: true });

const server = await createServer({ root, logLevel: 'error', server: { port: 5207, strictPort: false, hmr: false } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const gpu = process.platform === 'darwin';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? chromiumPath(),
  args: [...(gpu ? ['--use-angle=metal', '--enable-gpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']), '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: Number(process.env.SHOT_W ?? 960), height: Number(process.env.SHOT_H ?? 540) } });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
page.on('console', (m) => {
  if (m.type() === 'error' || /\[nye\]|nye overlay|fireworks:/.test(m.text())) console.log(`[${m.type()}]`, m.text());
});
// The tap: whatever is connected to an audio context's speakers is also connected to a recorder (mono, kept in the page).
await page.addInitScript(() => {
  const rec = { chunks: [], rate: 0, on: false };
  window.__nyeRec = rec;
  const taps = new WeakMap();
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) {
    const r = connect.call(this, dest, ...rest);
    if (dest instanceof AudioDestinationNode) {
      const ctx = dest.context;
      let tap = taps.get(ctx);
      if (!tap) {
        tap = ctx.createScriptProcessor(4096, 1, 1);
        const mute = ctx.createGain();
        mute.gain.value = 0;
        connect.call(tap, mute);
        connect.call(mute, ctx.destination);
        rec.rate = ctx.sampleRate;
        tap.onaudioprocess = (e) => {
          if (rec.on) rec.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
        };
        taps.set(ctx, tap);
      }
      connect.call(this, tap);
    }
    return r;
  };
});

const url = `${base}/index.html?nye=%2B${lead}s&story=0&cam=${cam}&graphics=low${argv.url ? `&${argv.url}` : ''}`;
console.log('open', url);
const opened = Date.now();
await page.goto(url, { waitUntil: 'load', timeout: 600_000 });
await page.waitForSelector('.map-loading.is-built .ld-go', { timeout: 900_000 });
await page.evaluate(() => (window.__nyeRec.on = true));
await page.click('.ld-go');
const left = () => lead - (Date.now() - opened) / 1000;
console.log(`started: ${left().toFixed(0)} s to midnight`);
if (left() < 20) console.warn('the build took longer than the lead: give a larger lead=');

let last = '';
const states = async () =>
  page.evaluate(() => {
    const on = [...document.querySelectorAll('.nye-ov .is-on')].map((e) => `${e.className.split(' ')[0]}「${e.textContent?.trim().slice(0, 60)}」`);
    const chip = document.querySelector('.nye-chip-t')?.textContent ?? '';
    return `${on.join(' ')}${chip ? ` chip ${chip.length > 3 ? '(running)' : chip}` : ''}`;
  });
let next = left();
while (left() > -after) {
  const s = left();
  const fine = s < 15 && s > -30;
  if (s <= next) {
    const name = `${s >= 0 ? 'm' : 'p'}${Math.abs(Math.round(s)).toString().padStart(3, '0')}`;
    await page.screenshot({ path: resolve(out, `${name}.png`) });
    next = s - (fine ? 2 : every);
  }
  const st = await states().catch(() => '');
  if (st !== last) {
    console.log(`${s.toFixed(1).padStart(6)} s  ${st}`);
    last = st;
  }
  await page.waitForTimeout(250);
}
// The recording: mono, down to 24 kHz, 16-bit WAV.
const { rate, pcm } = await page.evaluate(() => {
  const r = window.__nyeRec;
  r.on = false;
  const n = r.chunks.reduce((a, c) => a + c.length, 0);
  const step = Math.max(1, Math.round(r.rate / 24000));
  const outN = Math.floor(n / step);
  const s16 = new Int16Array(outN);
  let i = 0;
  let k = 0;
  for (const c of r.chunks)
    for (let j = 0; j < c.length; j++, k++)
      if (k % step === 0 && i < outN) s16[i++] = Math.max(-32768, Math.min(32767, Math.round(c[j] * 32767)));
  const bytes = new Uint8Array(s16.buffer);
  let bin = '';
  for (let j = 0; j < bytes.length; j += 0x8000) bin += String.fromCharCode(...bytes.subarray(j, j + 0x8000));
  return { rate: r.rate / step, pcm: btoa(bin) };
});
const data = Buffer.from(pcm, 'base64');
const head = Buffer.alloc(44);
head.write('RIFF', 0);
head.writeUInt32LE(36 + data.length, 4);
head.write('WAVEfmt ', 8);
head.writeUInt32LE(16, 16);
head.writeUInt16LE(1, 20);
head.writeUInt16LE(1, 22);
head.writeUInt32LE(rate, 24);
head.writeUInt32LE(rate * 2, 28);
head.writeUInt16LE(2, 32);
head.writeUInt16LE(16, 34);
head.write('data', 36);
head.writeUInt32LE(data.length, 40);
writeFileSync(resolve(out, 'night.wav'), Buffer.concat([head, data]));
// (loudness a second, to see the bangs without listening: the second's peak in dBFS from the start of the recording)
const s16 = new Int16Array(data.buffer, data.byteOffset, data.length / 2);
const line = [];
for (let s = 0; s * rate < s16.length; s++) {
  let pk = 0;
  for (let j = s * rate; j < Math.min(s16.length, (s + 1) * rate); j++) pk = Math.max(pk, Math.abs(s16[j]));
  line.push(pk ? Math.round(20 * Math.log10(pk / 32768)) : -99);
}
console.log(`night.wav: ${(s16.length / rate).toFixed(0)} s at ${rate} Hz; peak dBFS a second: ${line.join(' ')}`);
await browser.close();
await server.close();
