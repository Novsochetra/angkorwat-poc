import { registerSfx, type SfxOut } from './addonSfx';
import { biquad, cleanup, noise, range, strike } from './dsp';

/**
 * The clothes' sounds (roam/_wardrobe.ts), made here with dsp.ts's helpers,
 * on his own bus (`moves`), as soft as cloth is (under the umbrella's opening):
 *
 * - `wearShake`: a folded krama or shirt shaken out as the seller hands it
 *   over — a quick soft swish of cotton, then the cloth's light flap as it
 *   falls open.
 * - `wearOn`: putting it on — two brushes of cloth (over the head and
 *   shoulders, the arms through), a soft pat as it settles.
 * - `wearOff`: taking it off (or back to his own clothes) — one longer brush,
 *   falling away a little lower.
 *
 * Paying is the buy menu's rustle of notes (RoamSound `coin`).
 */

/** Peak levels (before the bus's volume): the umbrella opens at 0.9, a footstep on earth a little under. */
const LEVEL = { shake: 0.55, on: 0.5, off: 0.42 };

/** Struck filtered noise into the bus (dry, a touch of reverb): a brush or a flap of cloth. */
function brush(o: SfxOut, t: number, b: { type: BiquadFilterType; f0: number; f1?: number; q?: number; attack: number; tau: number; level: number; kind?: 'white' | 'pink' }): void {
  const ctx = o.ctx;
  const buf = noise(b.kind ?? 'pink');
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
  wet.gain.value = 0.07;
  src.connect(f).connect(env);
  env.connect(o.dry);
  env.connect(wet).connect(o.wet);
  src.start(t, o.rnd() * (buf.duration - end - 0.1));
  src.stop(t + end);
  cleanup(src, [src, f, env, wet]);
}

registerSfx(
  'wearShake',
  (o, g, t) => {
    const L = LEVEL.shake * g;
    // The swish as it is shaken out (rising a little), the cloth's flap as it falls open, a soft settle.
    brush(o, t, { type: 'bandpass', f0: range(o.rnd, 1100, 1400), f1: 2300, q: 0.9, attack: 0.05, tau: 0.05, level: L * 0.55 });
    brush(o, t + 0.12, { type: 'bandpass', f0: range(o.rnd, 420, 520), f1: 300, q: 0.9, attack: 0.008, tau: 0.045, level: L });
    brush(o, t + 0.2, { type: 'highpass', f0: 2600, q: 0.6, attack: 0.03, tau: 0.05, level: L * 0.2, kind: 'white' });
  },
  'moves',
);

registerSfx(
  'wearOn',
  (o, g, t) => {
    const L = LEVEL.on * g;
    // Over the head and shoulders, the arms through, a soft pat as it settles.
    brush(o, t, { type: 'bandpass', f0: range(o.rnd, 1700, 2100), f1: 1100, q: 1.0, attack: 0.06, tau: 0.06, level: L * 0.6 });
    brush(o, t + 0.24, { type: 'bandpass', f0: range(o.rnd, 1300, 1600), f1: 900, q: 1.0, attack: 0.05, tau: 0.05, level: L * 0.5 });
    brush(o, t + 0.42, { type: 'lowpass', f0: 520, q: 0.7, attack: 0.004, tau: 0.03, level: L * 0.8 });
  },
  'moves',
);

registerSfx(
  'wearOff',
  (o, g, t) => {
    const L = LEVEL.off * g;
    brush(o, t, { type: 'bandpass', f0: range(o.rnd, 1500, 1800), f1: 700, q: 0.9, attack: 0.08, tau: 0.08, level: L * 0.7 });
    brush(o, t + 0.3, { type: 'lowpass', f0: 460, q: 0.7, attack: 0.006, tau: 0.035, level: L * 0.6 });
  },
  'moves',
);
