import { registerSfx, type SfxOut } from './addonSfx';
import { biquad, noise, range, strike } from './dsp';

/**
 * The lotus's sounds (roam/_lotus.ts), synthesized as the explorer's own
 * are (audio/explorer.ts), played with `SFX.play(name, gain)` on his moves
 * bus:
 *
 * - `lotusReach`: his hand going in among the leaves by the boat — the
 *   big leaves brushing (a soft swish), a few drops falling off them;
 * - `lotusSnap`: the stem snapped — a lotus stem is soft and full of air
 *   channels, so a muffled fibrous pop, a short tear, water dripping off
 *   the stub;
 * - `lotusKeep`: the lotus put away in his bag (cloth, the petals' brush);
 * - `lotusLay`: the lotus laid on the floor before a shrine — a soft tap of
 *   the stem on stone, the petals' faint brush.
 *
 * Gentle: under the paddle's splash, about a quiet footstep at most (`gain`
 * 0‥1 scales them).
 */

/** Peak levels before the bus's volume (compare audio/explorer.ts `LEVEL`: knock 0.45, sip 0.4; audio/_palm.ts grip 0.32). */
const LEVEL = { brush: 0.22, drip: 0.14, pop: 0.36, tear: 0.16, cloth: 0.18, tap: 0.26 };

/** A struck, decaying sine whose pitch slides from `f0` to `f1`. */
function tone(o: SfxOut, t: number, f0: number, f1: number, a: number, tau: number, level: number, wet = 0.08): void {
  const ctx = o.ctx;
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + tau * 3);
  const env = ctx.createGain();
  strike(env.gain, t, level, a, tau);
  osc.connect(env);
  env.connect(o.dry);
  const send = ctx.createGain();
  send.gain.value = wet;
  env.connect(send).connect(o.wet);
  osc.start(t);
  osc.stop(t + a + tau * 7);
  osc.onended = () => {
    for (const n of [osc, env, send]) n.disconnect();
  };
}

/** Filtered noise, struck: rises in `a`, dies with `tau`; the filter slides from `f0` to `f1`. */
function burst(o: SfxOut, t: number, type: BiquadFilterType, f0: number, f1: number, q: number, a: number, tau: number, level: number, wet = 0.05, kind: 'white' | 'pink' | 'brown' = 'white'): void {
  const ctx = o.ctx;
  const buf = noise(kind);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = biquad(ctx, type, f0, q);
  const dur = a + tau * 6;
  if (f1 !== f0) {
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  }
  const env = ctx.createGain();
  strike(env.gain, t, level, a, tau);
  src.connect(f).connect(env);
  env.connect(o.dry);
  const send = ctx.createGain();
  send.gain.value = wet;
  env.connect(send).connect(o.wet);
  src.start(t, o.rnd() * Math.max(0, buf.duration - dur - 0.1));
  src.stop(t + dur);
  src.onended = () => {
    for (const n of [src, f, env, send]) n.disconnect();
  };
}

/** A drop falling into still water: a tiny plip (a sine sliding up, as a bubble's) and its tick. */
function drip(o: SfxOut, t: number, level: number): void {
  const r = o.rnd;
  const f = range(r, 900, 1500);
  tone(o, t, f, f * range(r, 1.5, 1.9), 0.001, 0.014, level, 0.12);
  burst(o, t, 'bandpass', range(r, 2400, 3200), range(r, 2400, 3200), 2, 0.0005, 0.003, level * 0.4, 0.1);
}

registerSfx('lotusReach', (o, g, t) => {
  const r = o.rnd;
  const L = 0.5 + 0.5 * g;
  // The leaves brushing past his arm: a soft swish rising and falling, a second smaller one.
  burst(o, t, 'bandpass', range(r, 1800, 2300), range(r, 1100, 1400), 0.9, 0.06, 0.07, LEVEL.brush * L, 0.06, 'pink');
  burst(o, t + range(r, 0.12, 0.2), 'bandpass', range(r, 2200, 2600), range(r, 1500, 1800), 1.1, 0.04, 0.05, LEVEL.brush * 0.55 * L, 0.06, 'pink');
  // (drops running off a leaf)
  const n = 2 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) drip(o, t + range(r, 0.15, 0.55), LEVEL.drip * range(r, 0.5, 1) * L);
});

registerSfx('lotusSnap', (o, g, t) => {
  const r = o.rnd;
  const L = 0.55 + 0.45 * g;
  // The soft stem giving: a muffled pop, a short fibrous tear after it.
  burst(o, t, 'bandpass', range(r, 850, 1050), range(r, 600, 700), 1.6, 0.002, 0.022, LEVEL.pop * L, 0.06, 'pink');
  tone(o, t, range(r, 420, 480), range(r, 300, 340), 0.002, 0.02, LEVEL.pop * 0.35 * L, 0.05);
  burst(o, t + 0.012, 'bandpass', range(r, 2600, 3200), range(r, 1800, 2200), 2.2, 0.004, 0.03, LEVEL.tear * L, 0.05);
  // Water from the stub and the stem: a few drops into the lake.
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) drip(o, t + range(r, 0.08, 0.7), LEVEL.drip * range(r, 0.5, 1.1) * L);
});

registerSfx('lotusKeep', (o, g, t) => {
  const r = o.rnd;
  const L = 0.5 + 0.5 * g;
  // Into his bag: cloth rubbing (a low brush), the petals' faint swish.
  burst(o, t, 'bandpass', range(r, 700, 900), range(r, 450, 550), 0.8, 0.05, 0.06, LEVEL.cloth * L, 0.04, 'pink');
  burst(o, t + range(r, 0.08, 0.14), 'highpass', range(r, 3000, 3600), range(r, 2600, 3000), 0.7, 0.02, 0.03, LEVEL.cloth * 0.4 * L, 0.04);
});

registerSfx('lotusLay', (o, g, t) => {
  const r = o.rnd;
  const L = 0.5 + 0.5 * g;
  // The stem set down on stone: a soft low tap; then the bud, lighter; the petals' brush.
  burst(o, t, 'lowpass', range(r, 700, 900), range(r, 500, 600), 0.8, 0.002, 0.018, LEVEL.tap * L, 0.12, 'pink');
  tone(o, t, range(r, 260, 300), range(r, 220, 250), 0.002, 0.02, LEVEL.tap * 0.3 * L, 0.12);
  burst(o, t + range(r, 0.05, 0.08), 'lowpass', range(r, 1100, 1300), range(r, 800, 900), 0.8, 0.002, 0.012, LEVEL.tap * 0.45 * L, 0.12, 'pink');
  burst(o, t + 0.04, 'highpass', range(r, 3200, 3800), range(r, 2800, 3200), 0.7, 0.03, 0.04, LEVEL.cloth * 0.35 * L, 0.08);
});
