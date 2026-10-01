import { registerLoop, registerSfx, type SfxOut } from './addonSfx';
import { biquad, noise, range, strike } from './dsp';

/**
 * The binoculars' sounds (roam/_binoculars.ts), made with dsp.ts's helpers
 * as audio/explorer.ts makes his:
 *
 * - `binoUp`: raised to his eyes: a soft rustle of his sleeves, the rubber
 *   eyecups' dull tap against his brow, a small plastic click of the hinge.
 * - `binoDown`: lowered: the rustle again, softer, and a lighter tap.
 * - `binoFocus` (lasting): the focus wheel turning while he zooms: a tiny,
 *   fine whirr of its ribs under the finger (a thin band of noise ticking at
 *   the ribs' rate), as loud as the zoom is quick.
 * - `binoBook` (the `ui` bus): a new page of the nature book, seen through
 *   them: a pencil's short scratch and two soft wooden notes.
 *
 * Levels sit with his other small sounds (the reel's 0.18, the sampeah's
 * 0.35: explorer.ts `LEVEL`): heard close by, under the footsteps.
 */

/** Peak levels (before the bus's volume). */
const LEVEL = { rustle: 0.3, tap: 0.22, click: 0.14, focus: 0.07, scratch: 0.12, note: 0.1 };

/** Filtered noise, struck: rises in `attack`, dies away with `tau`; the band slides from `f0` to `f1`. */
function burst(o: SfxOut, t: number, b: { kind?: 'white' | 'pink' | 'brown'; type: BiquadFilterType; f0: number; f1?: number; q?: number; attack: number; tau: number; level: number; pan?: number; wet?: number }): void {
  const { ctx } = o;
  const buf = noise(b.kind ?? 'white');
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const end = b.attack + b.tau * 6;
  const f = biquad(ctx, b.type, b.f0, b.q ?? 0.7);
  if (b.f1 && b.f1 !== b.f0) {
    f.frequency.setValueAtTime(b.f0, t);
    f.frequency.exponentialRampToValueAtTime(b.f1, t + end);
  }
  const env = ctx.createGain();
  strike(env.gain, t, b.level, b.attack, b.tau);
  const pan = ctx.createStereoPanner();
  pan.pan.value = b.pan ?? 0;
  src.connect(f).connect(env).connect(pan).connect(o.dry);
  const wet = b.wet ? ctx.createGain() : null;
  if (wet) {
    wet.gain.value = b.wet!;
    pan.connect(wet).connect(o.wet);
  }
  src.start(t, o.rnd() * Math.max(0, buf.duration - end - 0.1));
  src.stop(t + end);
  src.onended = () => {
    for (const n of [src, f, env, pan]) n.disconnect();
    wet?.disconnect();
  };
}

/** A soft struck tone (a sine, its pitch a hair falling): the book's notes. */
function tone(o: SfxOut, t: number, freq: number, level: number, tau: number, pan = 0): void {
  const { ctx } = o;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.995, t + tau * 4);
  const lp = biquad(ctx, 'lowpass', freq * 3, 0.5);
  const env = ctx.createGain();
  strike(env.gain, t, level, 0.006, tau);
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  osc.connect(lp).connect(env).connect(p).connect(o.dry);
  const wet = ctx.createGain();
  wet.gain.value = 0.25;
  p.connect(wet).connect(o.wet);
  osc.start(t);
  osc.stop(t + 0.006 + tau * 7);
  osc.onended = () => {
    for (const n of [osc, lp, env, p, wet]) n.disconnect();
  };
}

registerSfx('binoUp', (o, g, t) => {
  const r = o.rnd;
  const k = 0.6 + 0.4 * g;
  // Sleeves: two soft brushes of cloth as both arms come up.
  burst(o, t, { kind: 'pink', type: 'bandpass', f0: 1500, f1: 2600, q: 0.8, attack: 0.08, tau: 0.07, level: LEVEL.rustle * k, pan: -0.12, wet: 0.02 });
  burst(o, t + 0.05, { kind: 'pink', type: 'bandpass', f0: 1300, f1: 2300, q: 0.8, attack: 0.07, tau: 0.06, level: LEVEL.rustle * 0.75 * k, pan: 0.12, wet: 0.02 });
  // The eyecups meet his brow (a dull rubber tap), then the hinge settles with a small click.
  const at = t + range(r, 0.3, 0.36);
  burst(o, at, { kind: 'brown', type: 'lowpass', f0: 520, q: 0.8, attack: 0.002, tau: 0.018, level: LEVEL.tap * k, wet: 0.01 });
  burst(o, at + 0.035, { type: 'bandpass', f0: range(r, 3200, 3800), q: 2.2, attack: 0.0008, tau: 0.006, level: LEVEL.click * k, pan: 0.05 });
});

registerSfx('binoDown', (o, g, t) => {
  const k = 0.6 + 0.4 * g;
  burst(o, t, { kind: 'pink', type: 'bandpass', f0: 2200, f1: 1400, q: 0.8, attack: 0.06, tau: 0.08, level: LEVEL.rustle * 0.7 * k, pan: 0.1, wet: 0.02 });
  burst(o, t + 0.2, { kind: 'brown', type: 'lowpass', f0: 420, q: 0.7, attack: 0.002, tau: 0.02, level: LEVEL.tap * 0.6 * k, wet: 0.01 });
});

registerSfx(
  'binoBook',
  (o, g, t) => {
    const k = 0.6 + 0.4 * g;
    // A pencil's quick scratch (three strokes), then two soft notes up a fifth.
    for (let i = 0; i < 3; i++)
      burst(o, t + i * 0.055, { type: 'bandpass', f0: 4200 + i * 300, q: 1.6, attack: 0.008, tau: 0.018, level: LEVEL.scratch * k * (1 - i * 0.2), pan: -0.05 });
    tone(o, t + 0.2, 784, LEVEL.note * k, 0.16, -0.05);
    tone(o, t + 0.33, 1175, LEVEL.note * 0.8 * k, 0.22, 0.05);
  },
  'ui',
);

/**
 * The focus wheel: a thin band of noise (its ribs under the finger) ticking
 * at the ribs' rate (an oscillator on its gain), made once; `level` is how
 * quick the zoom is (0 silent).
 */
registerLoop('binoFocus', (o) => {
  const { ctx } = o;
  const src = ctx.createBufferSource();
  src.buffer = noise('white');
  src.loop = true;
  const band = biquad(ctx, 'bandpass', 3400, 3.5);
  // (the ticking: the gain swung by a fast low wave, never quite to silence)
  const tick = ctx.createGain();
  tick.gain.value = 0.55;
  const rate = ctx.createOscillator();
  rate.type = 'square';
  rate.frequency.value = 34;
  const depth = ctx.createGain();
  depth.gain.value = 0.45;
  rate.connect(depth).connect(tick.gain);
  const env = ctx.createGain();
  env.gain.value = 0;
  src.connect(band).connect(tick).connect(env).connect(o.dry);
  src.start(ctx.currentTime, o.rnd() * 1.5);
  rate.start();
  return {
    level(v, t) {
      env.gain.setTargetAtTime(v * LEVEL.focus, t, v > 0 ? 0.02 : 0.06);
    },
  };
});
