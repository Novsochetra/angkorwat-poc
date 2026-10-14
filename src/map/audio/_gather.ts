import { registerSfx, type SfxOut } from './addonSfx';
import { biquad, cleanup, noise, range, strike } from './dsp';

/**
 * Gathering's sounds (roam/_gather.ts), made with dsp.ts's helpers, a little
 * different every time (the engine's seeded `o.rnd`). One for each hit by its
 * material, so a cut sounds like what is cut:
 *
 * - `gatherSwish` (moves): the tool through the air as it comes down, soft.
 * - `gatherHit:bamboo` (moves): the knife into a bamboo cane — a hollow, ringing
 *   tok and the crack of its fibres.
 * - `gatherHit:log`: the knife into wood — a duller, lower knock, a chip splitting off.
 * - `gatherHit:thatch`: a palm frond's stem cut — a crisp snick and the leaves' rustle.
 * - `gatherHit:clay`: the hoe into a clay bank — a soft heavy thud, earth crumbling.
 * - `gatherGot` (moves): the piece comes off and he takes it (a cane falling
 *   against the others, two soft knocks; earth patted in his basket for clay).
 * - `gatherFull` (ui): no room for it: two low soft notes, falling.
 * - `gatherUnload` (moves): his load put down at home, a few poles and bundles laid down.
 *
 * Gentle: a hit about as loud as the build's hammer knock (audio/_build.ts).
 */

const LEVEL = { swish: 0.05, hit: 0.26, got: 0.2, full: 0.06, unload: 0.18 };

/** Struck filtered noise into the bus (dry, a touch of reverb). */
function burst(o: SfxOut, t: number, b: { type: BiquadFilterType; f0: number; q?: number; attack: number; tau: number; level: number; kind?: 'white' | 'pink' | 'brown'; wet?: number; f1?: number }): void {
  const ctx = o.ctx;
  const buf = noise(b.kind ?? 'white');
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const end = b.attack + b.tau * 6;
  const f = biquad(ctx, b.type, b.f0, b.q ?? 0.8);
  if (b.f1) f.frequency.exponentialRampToValueAtTime(b.f1, t + end);
  const env = ctx.createGain();
  strike(env.gain, t, b.level, b.attack, b.tau);
  const wet = ctx.createGain();
  wet.gain.value = b.wet ?? 0.08;
  src.connect(f).connect(env);
  env.connect(o.dry);
  env.connect(wet).connect(o.wet);
  src.start(t, o.rnd() * (buf.duration - end - 0.1));
  src.stop(t + end);
  cleanup(src, [src, f, env, wet]);
}

/** A short tone with a fast drop in pitch (the body answering the blow). */
function tok(o: SfxOut, t: number, f: number, level: number, tau: number, wetLevel = 0.1, type: OscillatorType = 'triangle'): void {
  const ctx = o.ctx;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f * 1.3, t);
  osc.frequency.exponentialRampToValueAtTime(f, t + 0.014);
  const env = ctx.createGain();
  strike(env.gain, t, level, 0.0015, tau);
  const wet = ctx.createGain();
  wet.gain.value = wetLevel;
  osc.connect(env);
  env.connect(o.dry);
  env.connect(wet).connect(o.wet);
  osc.start(t);
  osc.stop(t + tau * 7);
  cleanup(osc, [osc, env, wet]);
}

registerSfx(
  'gatherSwish',
  (o, g, t) => {
    const r = o.rnd;
    burst(o, t, { type: 'bandpass', f0: range(r, 700, 900), f1: range(r, 1800, 2400), q: 1.4, attack: 0.05, tau: 0.035, level: LEVEL.swish * (0.5 + 0.5 * g), kind: 'pink', wet: 0.04 });
  },
  'moves',
);

registerSfx(
  'gatherHit:bamboo',
  (o, g, t) => {
    const r = o.rnd;
    const L = LEVEL.hit * (0.5 + 0.5 * g);
    // (the cane's hollow ring, its overtone, the fibres cracking)
    tok(o, t, range(r, 480, 620), L, 0.045, 0.16);
    tok(o, t + 0.001, range(r, 1250, 1500), L * 0.3, 0.03, 0.12, 'sine');
    burst(o, t, { type: 'bandpass', f0: range(r, 2200, 3200), q: 1.2, attack: 0.001, tau: 0.014, level: L * 0.8 });
    burst(o, t + range(r, 0.02, 0.04), { type: 'highpass', f0: 2500, attack: 0.004, tau: 0.03, level: L * 0.25, kind: 'pink' });
  },
  'moves',
);

registerSfx(
  'gatherHit:log',
  (o, g, t) => {
    const r = o.rnd;
    const L = LEVEL.hit * (0.5 + 0.5 * g);
    tok(o, t, range(r, 170, 230), L, 0.04, 0.12);
    burst(o, t, { type: 'bandpass', f0: range(r, 700, 1100), q: 1, attack: 0.001, tau: 0.018, level: L * 0.9, kind: 'pink' });
    burst(o, t + range(r, 0.03, 0.06), { type: 'bandpass', f0: range(r, 1500, 2200), q: 2, attack: 0.002, tau: 0.02, level: L * 0.3 });
  },
  'moves',
);

registerSfx(
  'gatherHit:thatch',
  (o, g, t) => {
    const r = o.rnd;
    const L = LEVEL.hit * (0.5 + 0.5 * g);
    tok(o, t, range(r, 700, 900), L * 0.5, 0.02, 0.1);
    burst(o, t, { type: 'highpass', f0: range(r, 3000, 4200), attack: 0.001, tau: 0.01, level: L * 0.7 });
    burst(o, t + 0.01, { type: 'bandpass', f0: range(r, 2400, 3400), q: 0.7, attack: 0.02, tau: 0.07, level: L * 0.35, kind: 'pink' });
  },
  'moves',
);

registerSfx(
  'gatherHit:clay',
  (o, g, t) => {
    const r = o.rnd;
    const L = LEVEL.hit * (0.5 + 0.5 * g);
    tok(o, t, range(r, 70, 95), L * 0.9, 0.05, 0.06, 'sine');
    burst(o, t, { type: 'lowpass', f0: range(r, 320, 480), attack: 0.002, tau: 0.04, level: L * 1.1, kind: 'brown' });
    burst(o, t + range(r, 0.04, 0.08), { type: 'bandpass', f0: range(r, 1200, 1800), q: 0.8, attack: 0.01, tau: 0.06, level: L * 0.22, kind: 'pink' });
  },
  'moves',
);

registerSfx(
  'gatherGot',
  (o, g, t) => {
    const r = o.rnd;
    const L = LEVEL.got * (0.5 + 0.5 * g);
    tok(o, t, range(r, 260, 340), L, 0.05, 0.14);
    tok(o, t + range(r, 0.12, 0.17), range(r, 200, 260), L * 0.7, 0.05, 0.14);
    burst(o, t, { type: 'bandpass', f0: range(r, 1800, 2600), q: 0.6, attack: 0.03, tau: 0.08, level: L * 0.3, kind: 'pink' });
  },
  'moves',
);

registerSfx(
  'gatherFull',
  (o, _g, t) => {
    tok(o, t, 330, LEVEL.full, 0.09, 0.2, 'sine');
    tok(o, t + 0.13, 262, LEVEL.full, 0.12, 0.2, 'sine');
  },
  'ui',
);

registerSfx(
  'gatherUnload',
  (o, g, t) => {
    const r = o.rnd;
    const L = LEVEL.unload * (0.5 + 0.5 * g);
    let s = t;
    for (let i = 0; i < 4; i++) {
      tok(o, s, range(r, 180, 300) * (1 - i * 0.06), L * (1 - i * 0.12), range(r, 0.04, 0.06), 0.12);
      burst(o, s, { type: 'bandpass', f0: range(r, 500, 1000), q: 0.9, attack: 0.003, tau: 0.025, level: L * 0.35, kind: 'pink' });
      s += range(r, 0.1, 0.18);
    }
  },
  'moves',
);
