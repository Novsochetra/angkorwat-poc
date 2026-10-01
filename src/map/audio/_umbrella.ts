import { registerLoop, registerSfx, type SfxOut } from './addonSfx';
import { biquad, cleanup, mulberry32, noise, range, strike } from './dsp';

/**
 * The umbrella's sounds (roam/_umbrella.ts), made here with dsp.ts's helpers:
 *
 * - `umbOpen` (moves): the runner slides up the shaft with a short zip, the
 *   canopy fills with a soft "whup" and snaps taut, the latch clicks home.
 * - `umbClose` (moves): the latch clicks, the runner slides down, the cloth
 *   folds with a rustle.
 * - `umbPatter` (ambience, lasting): rain on the cloth over his head — quick
 *   light taps on the stretched canopy, each with a little of the drum's low
 *   thud, and the fine hiss of the small drops between them. One looped
 *   buffer, made the first time it is heard; levelled with the rain by the
 *   umbrella (0 when it is closed, dry, or under a roof). On the ambience bus,
 *   with the weather's rain: the Ambience slider turns both.
 */

/** Peak levels (before the bus's volume): the opening a little under the parachute's, the patter as the weather's own. */
const LEVEL = { open: 0.9, close: 0.7, patter: 0.13 };

/** The patter's loop (s) and the taps a second in each ear at full rain (dense: heavy rain on a taut cloth). */
const LOOP_S = 4;
const DROPS = 170;

let patterBuf: AudioBuffer | null = null;

/** Rain on a taut umbrella: taps (a damped ring of the cloth, high) and a soft thud (the dome, low), over a hiss; seamless. */
function makePatter(ctx: BaseAudioContext): AudioBuffer {
  if (patterBuf && patterBuf.sampleRate === ctx.sampleRate) return patterBuf;
  const rate = ctx.sampleRate;
  const n = Math.round(LOOP_S * rate);
  const buf = ctx.createBuffer(2, n, rate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    const rnd = mulberry32(8803 + c * 131);
    // The fine hiss: small drops too many to hear one by one (white noise, softened).
    let lp = 0;
    for (let i = 0; i < n; i++) {
      lp += 0.35 * (rnd() * 2 - 1 - lp);
      d[i] = lp * 0.05;
    }
    // The taps: a few a channel, at random times, wrapped round the loop's end (seamless).
    const count = Math.round(DROPS * LOOP_S);
    for (let k = 0; k < count; k++) {
      const at = Math.floor(rnd() * n);
      // (most drops are small; now and then a big one off a leaf or the rim)
      const big = rnd() < 0.05;
      const amp = (big ? range(rnd, 0.4, 0.65) : range(rnd, 0.1, 0.35)) * (0.6 + 0.4 * rnd());
      const f = range(rnd, 1700, 3600);
      const tau = range(rnd, 0.0012, 0.0032) * (big ? 1.6 : 1);
      const fl = range(rnd, 170, 300);
      const taul = range(rnd, 0.006, 0.012);
      const len = Math.min(n, Math.round(rate * Math.max(tau, taul) * 6));
      const w = (2 * Math.PI * f) / rate;
      const wl = (2 * Math.PI * fl) / rate;
      const ph = rnd() * Math.PI * 2;
      for (let i = 0; i < len; i++) {
        const t = i / rate;
        const s = amp * (Math.exp(-t / tau) * Math.sin(w * i + ph) * 0.8 + Math.exp(-t / taul) * Math.sin(wl * i) * 0.45 * (big ? 1.3 : 1));
        d[(at + i) % n] += s;
      }
    }
    // RMS 0.25, as dsp.ts's noise buffers.
    let sum = 0;
    for (let i = 0; i < n; i++) sum += d[i] * d[i];
    const g = 0.25 / Math.sqrt(sum / n || 1);
    for (let i = 0; i < n; i++) d[i] *= g;
  }
  return (patterBuf = buf);
}

/** Struck filtered noise into the bus (dry, a touch of reverb). */
function burst(o: SfxOut, t: number, b: { type: BiquadFilterType; f0: number; f1?: number; q?: number; attack: number; tau: number; level: number; kind?: 'white' | 'pink' }): void {
  const ctx = o.ctx;
  const buf = noise(b.kind ?? 'white');
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const end = b.attack + b.tau * 6;
  const f = biquad(ctx, b.type, b.f0, b.q ?? 0.8);
  if (b.f1 && b.f1 !== b.f0) {
    f.frequency.setValueAtTime(b.f0, t);
    f.frequency.exponentialRampToValueAtTime(b.f1, t + end);
  }
  const env = ctx.createGain();
  strike(env.gain, t, b.level, b.attack, b.tau);
  const wet = ctx.createGain();
  wet.gain.value = 0.08;
  src.connect(f).connect(env);
  env.connect(o.dry);
  env.connect(wet).connect(o.wet);
  src.start(t, o.rnd() * (buf.duration - end - 0.1));
  src.stop(t + end);
  cleanup(src, [src, f, env, wet]);
}

/** A small hard click (the latch, the runner's spring). */
function click(o: SfxOut, t: number, f: number, level: number): void {
  burst(o, t, { type: 'bandpass', f0: f, q: 2.2, attack: 0.0006, tau: 0.004, level });
}

registerSfx(
  'umbOpen',
  (o, g, t) => {
    const L = LEVEL.open * g;
    // The runner up the shaft: a short rising zip.
    burst(o, t, { type: 'bandpass', f0: 1400, f1: 2600, q: 1.4, attack: 0.03, tau: 0.035, level: L * 0.35 });
    // The cloth fills: a soft low whup…
    burst(o, t + 0.07, { type: 'bandpass', f0: 520, f1: 330, q: 0.8, attack: 0.012, tau: 0.06, level: L * 1.2, kind: 'pink' });
    // …snaps taut…
    burst(o, t + 0.11, { type: 'bandpass', f0: 1900, q: 1.3, attack: 0.001, tau: 0.014, level: L * 0.45 });
    // …and the latch clicks home.
    click(o, t + 0.13, range(o.rnd, 3200, 3800), L * 0.5);
  },
  'moves',
);

registerSfx(
  'umbClose',
  (o, g, t) => {
    const L = LEVEL.close * g;
    // The latch, the runner sliding down, the cloth folding in with a rustle.
    click(o, t, range(o.rnd, 2900, 3400), L * 0.45);
    burst(o, t + 0.02, { type: 'bandpass', f0: 2400, f1: 1300, q: 1.3, attack: 0.04, tau: 0.05, level: L * 0.3 });
    burst(o, t + 0.06, { type: 'bandpass', f0: 900, f1: 520, q: 0.8, attack: 0.05, tau: 0.09, level: L * 0.8, kind: 'pink' });
    burst(o, t + 0.2, { type: 'highpass', f0: 2000, q: 0.6, attack: 0.03, tau: 0.06, level: L * 0.25 });
  },
  'moves',
);

registerLoop(
  'umbPatter',
  (o) => {
    const ctx = o.ctx;
    const src = ctx.createBufferSource();
    src.buffer = makePatter(ctx);
    src.loop = true;
    // (the cloth: a gentle lift of its ring, the dull top cut a little)
    const tone = biquad(ctx, 'peaking', 2600, 0.9);
    tone.gain.value = 3;
    const low = biquad(ctx, 'highpass', 120, 0.7);
    const env = ctx.createGain();
    env.gain.value = 0;
    const wet = ctx.createGain();
    wet.gain.value = 0.12;
    src.connect(low).connect(tone).connect(env);
    env.connect(o.dry);
    env.connect(wet).connect(o.wet);
    src.start(ctx.currentTime, o.rnd() * LOOP_S);
    return {
      level(v, t) {
        // (heavier rain: louder, and a little brighter as the taps crowd together)
        env.gain.setTargetAtTime(LEVEL.patter * v, t, 0.25);
        tone.gain.setTargetAtTime(2 + 3 * v, t, 0.4);
      },
    };
  },
  'ambience',
);
