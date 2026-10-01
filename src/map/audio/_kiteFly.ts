import { registerLoop, registerSfx, type SfxOut } from './addonSfx';
import { biquad, cleanup, noise, range, strike } from './dsp';

/**
 * The sounds of flying his own kite (roam/_kiteFly.ts), made here with
 * dsp.ts's helpers (its bow's hum is the khleng ek's own song, audio/kite.ts,
 * called like the people's kites'):
 *
 * - `kiteWhoosh` (moves): let go into the wind, the sail fills with a soft
 *   rising swish and the paper snaps taut.
 * - `kitePaper` (moves): the paper and the bamboo handled (taken, folded and
 *   put away): a few dry crinkles.
 * - `kiteTug` (moves): a sharp tug on the line frees it from a tree: the line
 *   thrums, the leaves rustle.
 * - `kiteLine` (moves, lasting): the line running out through his fingers or
 *   wound onto the spool: a soft thin zip with the spool's tick in it, levelled
 *   (and pitched) by how fast the line goes.
 * - `kiteFlutter` (moves, lasting): the sail and the tails rattling in the
 *   wind while the kite is close (in his hand, just launched, brought in).
 *
 * Gentle: the line and the flutter sit well under the footsteps.
 */

/** Peak levels (before the bus's volume). */
const LEVEL = { whoosh: 0.32, paper: 0.26, tug: 0.36, line: 0.07, flutter: 0.1 };

/** Struck filtered noise into the bus (dry, a touch of reverb). */
function burst(o: SfxOut, t: number, b: { type: BiquadFilterType; f0: number; f1?: number; q?: number; attack: number; tau: number; level: number; kind?: 'white' | 'pink' | 'brown' }): void {
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
  wet.gain.value = 0.1;
  src.connect(f).connect(env);
  env.connect(o.dry);
  env.connect(wet).connect(o.wet);
  src.start(t, o.rnd() * Math.max(0, buf.duration - end - 0.1));
  src.stop(t + end);
  cleanup(src, [src, f, env, wet]);
}

registerSfx(
  'kiteWhoosh',
  (o, g, t) => {
    const L = LEVEL.whoosh * g;
    // The sail fills: an airy swish rising…
    burst(o, t, { type: 'bandpass', f0: 420, f1: 1500, q: 0.9, attack: 0.14, tau: 0.16, level: L, kind: 'pink' });
    // …and the paper snaps taut.
    burst(o, t + 0.16, { type: 'bandpass', f0: 2300, q: 1.6, attack: 0.002, tau: 0.018, level: L * 0.45 });
  },
  'moves',
);

registerSfx(
  'kitePaper',
  (o, g, t) => {
    const L = LEVEL.paper * g;
    // Dry crinkles of the paper, a knock of the bamboo spine.
    for (let i = 0; i < 4; i++) burst(o, t + i * range(o.rnd, 0.06, 0.13), { type: 'highpass', f0: range(o.rnd, 2200, 3400), q: 0.7, attack: 0.004, tau: range(o.rnd, 0.015, 0.03), level: L * range(o.rnd, 0.4, 0.8) });
    burst(o, t + 0.05, { type: 'bandpass', f0: range(o.rnd, 650, 900), q: 3, attack: 0.001, tau: 0.02, level: L * 0.4 });
  },
  'moves',
);

registerSfx(
  'kiteTug',
  (o, g, t) => {
    const L = LEVEL.tug * g;
    // The line thrums as it is pulled hard…
    const ctx = o.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.25);
    const env = ctx.createGain();
    strike(env.gain, t, L * 0.35, 0.004, 0.07);
    osc.connect(env).connect(o.dry);
    osc.start(t);
    osc.stop(t + 0.5);
    cleanup(osc, [osc, env]);
    // …and the leaves let it go with a rustle.
    burst(o, t + 0.05, { type: 'bandpass', f0: 3200, f1: 2200, q: 0.8, attack: 0.03, tau: 0.12, level: L * 0.7, kind: 'pink' });
    burst(o, t + 0.22, { type: 'bandpass', f0: 2600, q: 0.8, attack: 0.02, tau: 0.08, level: L * 0.4, kind: 'pink' });
  },
  'moves',
);

registerLoop(
  'kiteLine',
  (o) => {
    const ctx = o.ctx;
    const src = ctx.createBufferSource();
    src.buffer = noise('white');
    src.loop = true;
    // A thin zip of the line over his fingers and the spool's rim…
    const band = biquad(ctx, 'bandpass', 2600, 2.2);
    // …ticking as the spool turns.
    const tick = ctx.createGain();
    tick.gain.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.type = 'triangle';
    lfo.frequency.value = 14;
    const depth = ctx.createGain();
    depth.gain.value = 0.4;
    lfo.connect(depth).connect(tick.gain);
    const env = ctx.createGain();
    env.gain.value = 0;
    src.connect(band).connect(tick).connect(env).connect(o.dry);
    src.start(ctx.currentTime, o.rnd() * 2);
    lfo.start(ctx.currentTime);
    return {
      level(v, t) {
        env.gain.setTargetAtTime(LEVEL.line * v, t, 0.08);
        band.frequency.setTargetAtTime(2000 + 1400 * v, t, 0.15);
        lfo.frequency.setTargetAtTime(8 + 14 * v, t, 0.15);
      },
    };
  },
  'moves',
);

registerLoop(
  'kiteFlutter',
  (o) => {
    const ctx = o.ctx;
    const src = ctx.createBufferSource();
    src.buffer = noise('pink');
    src.loop = true;
    // The sail's paper rattling: a papery band, shaken fast and unevenly.
    const band = biquad(ctx, 'bandpass', 900, 1.1);
    const shake = ctx.createGain();
    shake.gain.value = 0.55;
    const a = ctx.createOscillator();
    a.frequency.value = 17;
    const b = ctx.createOscillator();
    b.frequency.value = 23.5;
    const da = ctx.createGain();
    da.gain.value = 0.3;
    const db = ctx.createGain();
    db.gain.value = 0.2;
    a.connect(da).connect(shake.gain);
    b.connect(db).connect(shake.gain);
    const env = ctx.createGain();
    env.gain.value = 0;
    const wet = ctx.createGain();
    wet.gain.value = 0.08;
    src.connect(band).connect(shake).connect(env);
    env.connect(o.dry);
    env.connect(wet).connect(o.wet);
    const now = ctx.currentTime;
    src.start(now, o.rnd() * 2);
    a.start(now);
    b.start(now);
    return {
      level(v, t) {
        env.gain.setTargetAtTime(LEVEL.flutter * v, t, 0.2);
        band.frequency.setTargetAtTime(750 + 500 * v, t, 0.3);
      },
    };
  },
  'moves',
);
