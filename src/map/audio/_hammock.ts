import { registerSfx, type SfxOut } from './addonSfx';
import { biquad, cleanup, noise, range, strike } from './dsp';

/**
 * The hammock's sounds (roam/_hammock.ts), made here with dsp.ts's helpers,
 * on the `moves` bus (his own sounds):
 *
 * - `hamCreak`: its ropes creak on the posts as the swing turns at each end
 *   (the load shifts): a short stick-slip squeak of rope on wood, a little
 *   hollow knock of the post under it; with a hard swing longer and louder,
 *   and the other rope answers a moment later. `gain` 0‥1: how hard it swings.
 * - `hamRustle`: the cloth as he sits into it or lies back, or gets out: a
 *   soft swish with a few quick ruffles of the weave, and a low "flump" as it
 *   takes (or lets go of) his weight. `gain` 0‥1.
 *
 * Gentle: the rustle about as loud as his sampeah's sleeves, the creak well
 * under the footsteps.
 */

/** Peak levels (before the bus's volume). */
const LEVEL = { creak: 0.15, knock: 0.22, rustle: 0.42 };

/** Struck filtered noise into the bus (dry, a touch of reverb). */
function burst(o: SfxOut, t: number, b: { type: BiquadFilterType; f0: number; f1?: number; q?: number; attack: number; tau: number; level: number; kind?: 'white' | 'pink' | 'brown'; wet?: number }): void {
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
  wet.gain.value = b.wet ?? 0.06;
  src.connect(f).connect(env);
  env.connect(o.dry);
  env.connect(wet).connect(o.wet);
  src.start(t, o.rnd() * (buf.duration - end - 0.1));
  src.stop(t + end);
  cleanup(src, [src, f, env, wet]);
}

/**
 * One rope's creak: a sawtooth whose pitch slides as the rope turns on the post, chopped by a square wave
 * (stick, slip, stick…) and pressed through a narrow band (the rope's fibres), `len` s long.
 */
function creak(o: SfxOut, t: number, len: number, level: number): void {
  const ctx = o.ctx;
  const r = o.rnd;
  const end = t + len + 0.05;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  const f0 = range(r, 130, 175);
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.linearRampToValueAtTime(f0 * range(r, 1.25, 1.6), t + len * 0.7);
  osc.frequency.linearRampToValueAtTime(f0 * range(r, 1.05, 1.3), t + len);
  // (stick-slip: the rope grabs and lets go some thirty times a second, a little slower as it eases)
  const chop = ctx.createOscillator();
  chop.type = 'square';
  const rate = range(r, 24, 36);
  chop.frequency.setValueAtTime(rate, t);
  chop.frequency.linearRampToValueAtTime(rate * 0.75, t + len);
  const depth = ctx.createGain();
  depth.gain.value = 0.45;
  const stick = ctx.createGain();
  stick.gain.value = 0.55;
  chop.connect(depth).connect(stick.gain);
  const band = biquad(ctx, 'bandpass', range(r, 950, 1350), 2.6);
  const wood = biquad(ctx, 'peaking', range(r, 380, 480), 1.1);
  wood.gain.value = 5;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(level, t + len * 0.25);
  env.gain.linearRampToValueAtTime(level * 0.7, t + len * 0.75);
  env.gain.linearRampToValueAtTime(0, t + len);
  const wet = ctx.createGain();
  wet.gain.value = 0.1;
  osc.connect(band).connect(wood).connect(stick).connect(env);
  env.connect(o.dry);
  env.connect(wet).connect(o.wet);
  osc.start(t);
  chop.start(t);
  osc.stop(end);
  chop.stop(end);
  cleanup(osc, [osc, chop, depth, stick, band, wood, env, wet]);
}

registerSfx(
  'hamCreak',
  (o, g, t) => {
    const len = 0.16 + 0.26 * g;
    creak(o, t, len, LEVEL.creak * (0.35 + 0.65 * g));
    // (the post takes the pull: a soft hollow knock under it)
    burst(o, t + 0.01, { type: 'bandpass', f0: range(o.rnd, 260, 340), q: 3, attack: 0.002, tau: 0.03, level: LEVEL.knock * (0.25 + 0.5 * g), kind: 'pink' });
    // (a hard swing: the rope at the other end answers)
    if (g > 0.35) creak(o, t + range(o.rnd, 0.05, 0.12), len * 0.8, LEVEL.creak * 0.55 * g);
  },
  'moves',
);

registerSfx(
  'hamRustle',
  (o, g, t) => {
    const L = LEVEL.rustle * (0.5 + 0.5 * g);
    const r = o.rnd;
    // The cloth slides and gathers: a soft swish…
    burst(o, t, { type: 'bandpass', f0: 1500, f1: 2900, q: 0.9, attack: 0.12, tau: 0.13, level: L * 0.7, kind: 'pink' });
    // …a few quick ruffles of the weave…
    let s = t + range(r, 0.04, 0.08);
    for (let i = 0, n = 3 + Math.floor(r() * 2); i < n; i++) {
      burst(o, s, { type: 'bandpass', f0: range(r, 2200, 3800), q: 1.4, attack: 0.006, tau: range(r, 0.018, 0.035), level: L * range(r, 0.25, 0.5) });
      s += range(r, 0.06, 0.13);
    }
    // …and a low flump as it takes his weight (or lets it go).
    burst(o, t + range(r, 0.22, 0.3), { type: 'lowpass', f0: 650, f1: 280, q: 0.7, attack: 0.03, tau: 0.09, level: L * 0.85, kind: 'pink', wet: 0.04 });
  },
  'moves',
);
