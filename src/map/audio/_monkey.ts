import { registerSfx, type SfxOut } from './addonSfx';
import { biquad, noise, range } from './dsp';

/**
 * The sounds of the monkey that steals the explorer's snack (roam/_monkeyThief.ts),
 * made fresh each time from oscillators and noise (dsp.ts), a little different
 * every time; light and cartoon, never a scream:
 *
 * - `monkeyChatter` (animals): a quick excited "ke-ke-krrk" — short chirps of a
 *   buzzy voice through a bright band, a rolled one now and then — as it eyes the
 *   snack, eats it up on its wall, or answers his greeting;
 * - `monkeyScamper` (animals): a patter of small hands and feet on stone, a soft
 *   scrabble under it, as it dashes in and runs off;
 * - `monkeySnatch` (moves): the quick swish of the snack leaving his hands;
 * - `monkeyHey` (moves): his short, surprised "hey!" — a breath, then a gentle
 *   voiced "ey" that rises and falls, as soft as his "ahh" after a drink.
 *
 * `gain` (0‥1) is the caller's: softer the further the monkey is.
 */

/**
 * Peak levels (before the bus's volume), measured offline against his own (the loudest 100 ms): the chatter about as
 * loud as his munch (−27 dBFS), the "hey!" between the munch and the soft "ahh" (−27), the patter and the swish under them.
 */
const LEVEL = { chatter: 0.42, scamper: 0.85, snatch: 0.48, hey: 0.12 };

/** Nodes into the bus: dry, and a little of the reverb. */
function send(o: SfxOut, from: AudioNode, wet: number): GainNode[] {
  const w = o.ctx.createGain();
  w.gain.value = wet;
  from.connect(o.dry);
  from.connect(w).connect(o.wet);
  return [w];
}

/** Disconnect everything once `last` has ended. */
function done(last: AudioScheduledSourceNode, nodes: AudioNode[]): void {
  last.onended = () => {
    for (const n of nodes) n.disconnect();
  };
}

registerSfx(
  'monkeyChatter',
  (o, gain, t) => {
    const ctx = o.ctx;
    const r = o.rnd;
    // A buzzy little voice (a sawtooth through a bright band) and a click of breath on each chirp.
    const n = 3 + Math.floor(r() * 4);
    let s = t;
    const end = t + n * 0.16 + 0.3;
    const vo = ctx.createOscillator();
    vo.type = 'sawtooth';
    const band = biquad(ctx, 'bandpass', 2300, 1.6);
    const ve = ctx.createGain();
    ve.gain.setValueAtTime(0, t);
    const src = ctx.createBufferSource();
    src.buffer = noise('white');
    const nb = biquad(ctx, 'bandpass', 3200, 2.5);
    const ne = ctx.createGain();
    ne.gain.setValueAtTime(0, t);
    const out = ctx.createGain();
    out.gain.value = LEVEL.chatter * gain;
    vo.connect(band).connect(ve).connect(out);
    src.connect(nb).connect(ne).connect(out);
    const sends = send(o, out, 0.12);
    for (let i = 0; i < n; i++) {
      // ("ke": a quick chirp up; now and then "krrk": a short roll down)
      const roll = r() < 0.25;
      const len = roll ? range(r, 0.09, 0.13) : range(r, 0.035, 0.06);
      const f0 = range(r, 820, 1100) * (i === n - 1 ? 1.12 : 1);
      vo.frequency.setValueAtTime(roll ? f0 * 1.1 : f0, s);
      vo.frequency.linearRampToValueAtTime(roll ? f0 * 0.82 : f0 * 1.35, s + len);
      band.frequency.setValueAtTime(range(r, 1900, 2800), s);
      if (roll) {
        // (a roll: the voice flutters ~45 times a second)
        const rate = range(r, 40, 50);
        for (let k = 0; k * (1 / rate) < len; k++) {
          const a = s + k / rate;
          ve.gain.setValueAtTime(0, a);
          ve.gain.linearRampToValueAtTime(1, a + 0.004);
          ve.gain.linearRampToValueAtTime(0.15, a + 0.6 / rate);
        }
        ve.gain.setValueAtTime(0, s + len);
      } else {
        ve.gain.setValueAtTime(0, s);
        ve.gain.linearRampToValueAtTime(1, s + 0.004);
        ve.gain.setTargetAtTime(0, s + 0.008, len * 0.45);
      }
      ne.gain.setValueAtTime(0, s);
      ne.gain.linearRampToValueAtTime(0.35, s + 0.002);
      ne.gain.setTargetAtTime(0, s + 0.003, 0.012);
      s += len + range(r, 0.05, 0.11);
    }
    vo.start(t);
    vo.stop(end);
    src.start(t, r() * 3);
    src.stop(end);
    done(vo, [vo, band, ve, src, nb, ne, out, ...sends]);
  },
  'animals',
);

registerSfx(
  'monkeyScamper',
  (o, gain, t) => {
    const ctx = o.ctx;
    const r = o.rnd;
    // Small hands and feet on stone: quick taps in pairs (a gallop), and a soft scrabble under them.
    const src = ctx.createBufferSource();
    src.buffer = noise('pink');
    const band = biquad(ctx, 'bandpass', 2200, 1.4);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    const out = ctx.createGain();
    out.gain.value = LEVEL.scamper * gain;
    src.connect(band).connect(env).connect(out);
    const sends = send(o, out, 0.06);
    const n = 7 + Math.floor(r() * 4);
    let s = t;
    for (let i = 0; i < n; i++) {
      const peak = range(r, 0.55, 1) * (1 - 0.35 * (i / n));
      env.gain.setValueAtTime(0, s);
      env.gain.linearRampToValueAtTime(peak, s + 0.002);
      env.gain.setTargetAtTime(0.04, s + 0.003, 0.01);
      band.frequency.setValueAtTime(range(r, 1600, 3000), s);
      // (a gallop: two quick, then a gap)
      s += i % 2 ? range(r, 0.07, 0.1) : range(r, 0.025, 0.04);
    }
    env.gain.setTargetAtTime(0, s, 0.03);
    src.start(t, r() * 3);
    src.stop(s + 0.2);
    done(src, [src, band, env, out, ...sends]);
  },
  'animals',
);

registerSfx('monkeySnatch', (o, gain, t) => {
  const ctx = o.ctx;
  const r = o.rnd;
  // A quick swish (a band of noise sweeping up), and the rustle of what it took.
  const src = ctx.createBufferSource();
  src.buffer = noise('white');
  const band = biquad(ctx, 'bandpass', 900, 1.2);
  band.frequency.setValueAtTime(700, t);
  band.frequency.exponentialRampToValueAtTime(range(r, 3200, 4200), t + 0.13);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(LEVEL.snatch * gain, t + 0.045);
  env.gain.setTargetAtTime(0, t + 0.07, 0.04);
  src.connect(band).connect(env);
  const sends = send(o, env, 0.05);
  src.start(t, r() * 3);
  src.stop(t + 0.4);
  done(src, [src, band, env, ...sends]);
});

registerSfx('monkeyHey', (o, gain, t) => {
  const ctx = o.ctx;
  const r = o.rnd;
  const k = LEVEL.hey * gain;
  // "h": a short breath through an open mouth.
  const br = ctx.createBufferSource();
  br.buffer = noise('pink');
  const bf = biquad(ctx, 'bandpass', 1500, 1.1);
  const be = ctx.createGain();
  be.gain.setValueAtTime(0, t);
  be.gain.linearRampToValueAtTime(0.35 * k, t + 0.025);
  be.gain.setTargetAtTime(0, t + 0.05, 0.03);
  br.connect(bf).connect(be);
  // "ey": a gentle voice (a soft sawtooth) through the vowel's formants, gliding from "e" to "i", the pitch up then down.
  const v0 = t + 0.05;
  const dur = range(r, 0.2, 0.25);
  const f0 = range(r, 190, 215);
  const vo = ctx.createOscillator();
  vo.type = 'sawtooth';
  vo.frequency.setValueAtTime(f0, v0);
  vo.frequency.linearRampToValueAtTime(f0 * 1.42, v0 + dur * 0.35);
  vo.frequency.linearRampToValueAtTime(f0 * 1.12, v0 + dur);
  const soft = biquad(ctx, 'lowpass', 3200, 0.5);
  const ve = ctx.createGain();
  ve.gain.setValueAtTime(0, v0);
  ve.gain.linearRampToValueAtTime(k, v0 + 0.03);
  ve.gain.setValueAtTime(k, v0 + dur - 0.06);
  ve.gain.linearRampToValueAtTime(0, v0 + dur);
  vo.connect(soft);
  const sum = ctx.createGain();
  const formants: AudioNode[] = [];
  for (const [fa, fb, q, a] of [
    [560, 400, 6, 1],
    [1850, 2150, 9, 0.55],
    [2600, 2750, 10, 0.25],
  ] as const) {
    const f = biquad(ctx, 'bandpass', fa, q);
    f.frequency.setValueAtTime(fa, v0);
    f.frequency.linearRampToValueAtTime(fb, v0 + dur);
    const g = ctx.createGain();
    g.gain.value = a * 2.4;
    soft.connect(f).connect(g).connect(sum);
    formants.push(f, g);
  }
  sum.connect(ve);
  const out = ctx.createGain();
  be.connect(out);
  ve.connect(out);
  const sends = send(o, out, 0.04);
  br.start(t, r() * 3);
  br.stop(t + 0.2);
  vo.start(v0);
  vo.stop(v0 + dur + 0.02);
  done(vo, [br, bf, be, vo, soft, sum, ve, out, ...formants, ...sends]);
});
