import { registerSfx, type SfxOut } from './addonSfx';
import { biquad, noise, range, strike } from './dsp';

/**
 * The sugar palm ladder's sounds (roam/_palmClimb.ts), synthesized as the
 * explorer's own are (audio/explorer.ts), played with `SFX.play(name, gain)`:
 *
 * - `palmStep` (the steps bus): a boot on a bamboo stub — a dry hollow knock
 *   of the culm, the soft thud of the weight under it, now and then the pole
 *   giving a little against its lashings;
 * - `palmGrip` (his moves): a palm closing round a stub — a short slap of
 *   skin on smooth bamboo, a faint hollow note;
 * - `palmCreak`: the old bamboo creaking in its cord lashings — a stick-slip
 *   grind of tiny clicks through a woody resonance that slides down;
 * - `palmSlosh`: the palm juice sloshing in its bamboo tube — a wet swirl
 *   and a few small glugs;
 * - `palmTube`: a bamboo tube knocked against the flower stalk or his belt —
 *   a bright hollow clack.
 *
 * Gentle: as loud as a footstep on planks at most (`gain` 0‥1 scales them).
 */

/** Peak levels before the bus's volume (compare audio/explorer.ts `LEVEL`: knock 0.45, sip 0.4). */
const LEVEL = { step: 0.5, grip: 0.32, creak: 0.16, slosh: 0.3, tube: 0.36 };

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

/** A hollow bamboo knock round `f` (Hz): a few quick inharmonic partials and a click. */
function knock(o: SfxOut, t: number, f: number, level: number): void {
  for (const [ratio, amp, tau] of [
    [1, 1, 0.045],
    [2.41, 0.45, 0.025],
    [3.9, 0.22, 0.015],
  ] as const)
    tone(o, t, f * ratio, f * ratio * 0.985, 0.0012, tau, level * amp, 0.1);
  burst(o, t, 'highpass', 2600, 2600, 0.7, 0.0005, 0.004, level * 0.35);
}

/** The pole working in its cord lashings: tiny clicks `rate` a second for `dur` s through a woody band sliding from `f0` down. */
function creak(o: SfxOut, t: number, dur: number, rate: number, f0: number, level: number): void {
  const r = o.rnd;
  const n = Math.max(4, Math.round(dur * rate));
  for (let i = 0; i < n; i++) {
    const u = i / n;
    // (stick-slip: the clicks bunch up and spread out, loudest in the middle)
    const at = t + dur * u + range(r, -0.3, 0.3) / rate;
    const k = Math.sin(Math.PI * Math.min(1, u * 1.15)) * range(r, 0.6, 1);
    const f = f0 * (1 - 0.28 * u) * range(r, 0.97, 1.03);
    burst(o, Math.max(t, at), 'bandpass', f, f, 9, 0.0008, 0.006, level * k, 0.12);
  }
}

registerSfx(
  'palmStep',
  (o, g, t) => {
    const r = o.rnd;
    const L = LEVEL.step * (0.55 + 0.45 * g);
    knock(o, t, range(r, 290, 360), L * 0.55);
    // The weight coming onto the stub: a soft low thud.
    burst(o, t, 'lowpass', 520, 240, 0.8, 0.003, 0.03, L * 0.6, 0.04, 'pink');
    // Now and then the pole gives a little against its lashings.
    if (r() < 0.35) creak(o, t + range(r, 0.05, 0.12), range(r, 0.18, 0.3), range(r, 40, 60), range(r, 900, 1300), LEVEL.creak * g);
  },
  'steps',
);

registerSfx('palmGrip', (o, g, t) => {
  const r = o.rnd;
  const L = LEVEL.grip * (0.5 + 0.5 * g);
  // Skin on smooth bamboo: a short bright slap, and the culm's faint hollow note.
  burst(o, t, 'bandpass', range(r, 1500, 2100), range(r, 900, 1200), 1.1, 0.001, 0.012, L, 0.04);
  knock(o, t + 0.003, range(r, 560, 660), L * 0.3);
});

registerSfx('palmCreak', (o, g, t) => {
  const r = o.rnd;
  creak(o, t, range(r, 0.35, 0.6), range(r, 28, 48), range(r, 650, 950), LEVEL.creak * (0.6 + 0.4 * g));
});

registerSfx('palmSlosh', (o, g, t) => {
  const r = o.rnd;
  const L = LEVEL.slosh * (0.5 + 0.5 * g);
  // The juice swirling in the tube (a wet band that swells and slides), then a few small glugs.
  burst(o, t, 'bandpass', range(r, 700, 900), range(r, 320, 420), 1.6, 0.04, 0.09, L, 0.06, 'pink');
  burst(o, t + range(r, 0.08, 0.14), 'bandpass', range(r, 500, 650), range(r, 280, 340), 2, 0.03, 0.07, L * 0.6, 0.06, 'pink');
  const n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const f = range(r, 170, 260);
    tone(o, t + 0.06 + i * range(r, 0.06, 0.11), f, f * range(r, 1.4, 1.8), 0.004, 0.022, L * range(r, 0.25, 0.45), 0.05);
  }
});

registerSfx('palmTube', (o, g, t) => {
  const r = o.rnd;
  const L = LEVEL.tube * (0.5 + 0.5 * g);
  // A tube knocked on the stalk or the belt: the bamboo's bright hollow clack, its short ring.
  knock(o, t, range(r, 640, 760), L);
  tone(o, t, range(r, 1450, 1650), range(r, 1400, 1600), 0.001, 0.03, L * 0.25, 0.1);
});
