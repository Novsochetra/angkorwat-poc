// New Year's Eve (AWP-35): render the fireworks' sound OFFLINE into WAV files, as heard from the square (plan.ts
// `VIEW`), with the map's own sound engine and the show's own schedule (audio/fireworks.ts `FireworksSound`, its
// `planSounds`): the crowd's count and cheer, the whooshes, whistles, booms (late by their distance), crackles and
// sizzles, on the Fireworks bus alone (no ambience). For listening without playing the night live, and on a machine
// whose live page is too slow to keep the sound in time (no GPU: sounds over 0.4 s late are let go).
//
//   node scripts/nye-sound.mjs                       # screenshots/nye-sound/midnight.wav (−12‥+45 s) and finale.wav (430‥480 s)
//   node scripts/nye-sound.mjs spans=-12:45,200:240  # others (show seconds, from:to)
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)]));
const spans = (argv.spans ?? '-12:45,430:480').split(',').map((s) => s.split(':').map(Number));
const names = argv.spans ? spans.map(([a, b]) => `show${a}_${b}`) : ['midnight', 'finale'];
const out = resolve(root, 'screenshots/nye-sound');
mkdirSync(out, { recursive: true });

const server = await createServer({ root, logLevel: 'error', server: { port: 5211, strictPort: false, hmr: false } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('[error]', m.text()));
await page.goto(`${base}/favicon.svg`);
for (const [i, [from, to]] of spans.entries()) {
  const res = await page.evaluate(
    async ({ from, to }) => {
      const { SoundEngine } = await import('/src/map/audio/engine.ts');
      const { FireworksSound } = await import('/src/map/audio/fireworks.ts');
      const { warmShouts } = await import('/src/map/audio/speech.ts');
      const { VIEW } = await import('/src/map/nye/plan.ts');
      const { VOLUME_KEYS } = await import('/src/map/types.ts');
      const rate = 44100;
      const dur = to - from;
      const ctx = new OfflineAudioContext(2, Math.ceil(rate * dur), rate);
      const e = new SoundEngine(ctx, { seed: 2027 });
      e.setVolumes(Object.fromEntries(VOLUME_KEYS.map((k) => [k, 1])), true);
      while (!warmShouts(() => 1e9));
      const fw = new FireworksSound(e);
      // (by hand what `update` does on the live page: the ears at the crowd's view, facing the stage; the audio clock 0 = show second `from`)
      const [x, y, z] = VIEW.cam;
      Object.assign(fw, { ears: { x, y, z, right: [1, 0, 0], forward: [0, 0, -1] }, active: true, offset: -from, done: from });
      for (let t = 0; t < dur; t += 0.5) fw.schedule(t, Math.min(dur, t + 0.5));
      const buf = await ctx.startRendering();
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);
      const s16 = new Int16Array(L.length * 2);
      let peak = 0;
      for (let j = 0; j < L.length; j++) {
        peak = Math.max(peak, Math.abs(L[j]), Math.abs(R[j]));
        s16[2 * j] = Math.max(-32768, Math.min(32767, Math.round(L[j] * 32767)));
        s16[2 * j + 1] = Math.max(-32768, Math.min(32767, Math.round(R[j] * 32767)));
      }
      // (loudness every second, dBFS RMS)
      const line = [];
      for (let s = 0; s < dur; s++) {
        let a = 0;
        const n0 = s * rate;
        const n1 = Math.min(L.length, n0 + rate);
        for (let j = n0; j < n1; j++) a += L[j] * L[j] + R[j] * R[j];
        line.push(Math.round(10 * Math.log10(a / (2 * Math.max(1, n1 - n0)) + 1e-12)));
      }
      const bytes = new Uint8Array(s16.buffer);
      let bin = '';
      for (let j = 0; j < bytes.length; j += 0x8000) bin += String.fromCharCode(...bytes.subarray(j, j + 0x8000));
      return { rate, pcm: btoa(bin), played: { ...fw.played }, peak, line };
    },
    { from, to },
  );
  const data = Buffer.from(res.pcm, 'base64');
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(2, 22);
  head.writeUInt32LE(res.rate, 24);
  head.writeUInt32LE(res.rate * 4, 28);
  head.writeUInt16LE(4, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  writeFileSync(resolve(out, `${names[i]}.wav`), Buffer.concat([head, data]));
  console.log(`${names[i]}.wav (show ${from}‥${to} s): sounds ${JSON.stringify(res.played)}, peak ${(20 * Math.log10(res.peak)).toFixed(1)} dBFS`);
  console.log(`  dB RMS a second: ${res.line.join(' ')}`);
}
await browser.close();
await server.close();
