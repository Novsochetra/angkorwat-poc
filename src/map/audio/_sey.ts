import { registerSfx, type SfxOut } from './addonSfx';
import { biquad, noise, range, strike } from './dsp';

/**
 * Kicking the sey with the village children (roam/_sey.ts): its sounds, made
 * here (as audio/explorer.ts makes his) and played by name through
 * `SFX.play`, their gain set by how near the ears are (the add-on).
 *
 * - `seyThock`: a foot meeting the sey — the dull, soft knock of its rubber
 *   base on a bare instep (a low thump under a short muffled knock);
 * - `seyFlutter`: its feathers whirring as it leaves the foot, fading;
 * - `seyTap`: it lands on the packed earth (a small dull tap, a little grit);
 * - `seySwish`: his foot through the air (a miss);
 * - `seyClap`: a few small hand claps (the children, after a fine kick).
 *
 * Gentle: under his footsteps (the knock is about a soft step's loudness).
 */

/** A burst of noise through a filter, struck (rise `a`, decay `tau`), into the bus. */
function burst(o: SfxOut, t: number, kind: 'white' | 'pink', type: BiquadFilterType, f0: number, f1: number, q: number, a: number, tau: number, level: number, wet = 0.04): void {
  const ctx = o.ctx;
  const buf = noise(kind);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const end = a + tau * 6;
  const f = biquad(ctx, type, f0, q);
  if (f1 !== f0) {
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + end);
  }
  const env = ctx.createGain();
  strike(env.gain, t, level, a, tau);
  src.connect(f).connect(env);
  env.connect(o.dry);
  const w = ctx.createGain();
  w.gain.value = wet;
  env.connect(w).connect(o.wet);
  src.start(t, o.rnd() * Math.max(0, buf.duration - end - 0.1));
  src.stop(t + end);
  src.onended = () => {
    for (const n of [src, f, env, w]) n.disconnect();
  };
}

/** A struck sine sliding from `f0` to `f1`. */
function thump(o: SfxOut, t: number, f0: number, f1: number, a: number, tau: number, level: number): void {
  const ctx = o.ctx;
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(f1, t + tau * 3);
  const env = ctx.createGain();
  strike(env.gain, t, level, a, tau);
  osc.connect(env).connect(o.dry);
  osc.start(t);
  osc.stop(t + a + tau * 7);
  osc.onended = () => {
    osc.disconnect();
    env.disconnect();
  };
}

registerSfx('seyThock', (o, g, t) => {
  const r = o.rnd;
  const k = 0.55 + 0.45 * g;
  thump(o, t, range(r, 150, 175), 85, 0.002, 0.03, 0.55 * g * k);
  burst(o, t, 'pink', 'bandpass', range(r, 820, 980), 420, 1.1, 0.0015, 0.022, 1.3 * g * k);
  burst(o, t + 0.004, 'white', 'bandpass', range(r, 2300, 2700), 1800, 1.6, 0.001, 0.008, 0.25 * g);
});

registerSfx('seyFlutter', (o, g, t) => {
  // (the feathers: a soft whirr that flickers, rising a little as it goes up, fading)
  const ctx = o.ctx;
  const src = ctx.createBufferSource();
  src.buffer = noise('white');
  const dur = 0.42;
  const f = biquad(ctx, 'bandpass', 1900, 1.4);
  f.frequency.setValueAtTime(1700, t);
  f.frequency.linearRampToValueAtTime(2600, t + dur);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(1.4 * g, t + 0.04);
  env.gain.setTargetAtTime(0, t + 0.08, 0.1);
  const flick = ctx.createGain();
  flick.gain.value = 0.55;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = range(o.rnd, 24, 32);
  const depth = ctx.createGain();
  depth.gain.value = 0.45;
  lfo.connect(depth).connect(flick.gain);
  src.connect(f).connect(flick).connect(env).connect(o.dry);
  src.start(t, o.rnd() * 2);
  src.stop(t + dur + 0.1);
  lfo.start(t);
  lfo.stop(t + dur + 0.1);
  src.onended = () => {
    for (const n of [src, f, flick, lfo, depth, env]) n.disconnect();
  };
});

registerSfx('seyTap', (o, g, t) => {
  thump(o, t, 120, 70, 0.002, 0.02, 0.3 * g);
  burst(o, t, 'pink', 'lowpass', 900, 300, 0.7, 0.001, 0.018, 0.9 * g);
  for (let i = 0; i < 3; i++) burst(o, t + 0.01 + o.rnd() * 0.05, 'white', 'highpass', range(o.rnd, 2600, 4000), 2600, 0.7, 0.0008, 0.003, 0.18 * g * o.rnd());
});

registerSfx('seySwish', (o, g, t) => {
  burst(o, t, 'pink', 'bandpass', 500, 1700, 0.9, 0.05, 0.07, 1.0 * g, 0.06);
});

registerSfx(
  'seyClap',
  (o, g, t) => {
    // (two or three children, a few quick claps each, not quite together)
    const r = o.rnd;
    for (let c = 0; c < 3; c++) {
      const start = t + c * 0.03 + r() * 0.04;
      const n = 3 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) burst(o, start + i * range(r, 0.15, 0.19), 'white', 'bandpass', range(r, 1100, 1700), 1000, 1.2, 0.001, 0.012, 1.35 * g, 0.12);
    }
  },
  'ambience',
);
