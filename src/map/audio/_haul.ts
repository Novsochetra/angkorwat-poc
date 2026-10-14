import { registerSfx, type SfxOut } from './addonSfx';
import { biquad, cleanup, noise, range, strike } from './dsp';

/**
 * His ox cart's sounds (roam/_haul.ts; addonSfx.ts, on the explorer's bus),
 * made with dsp.ts's helpers, a little different every time (`o.rnd`). The
 * wheels rolling and a hub's knock as he leads it are the ride's
 * (audio/_cart.ts `cartRoll`, `cartKnock`); the oxen's bells and the axle's
 * creak the people's (audio/people.ts, through the map's calls).
 *
 * - `haulPut:<material>`: a piece laid in the cart or put down at home — a log's
 *   heavy wooden thunk on the planks, bamboo poles' hollow clack, a bundle of
 *   thatch's soft rustling thump, a basket of clay set down (the weave creaks,
 *   the clay thuds).
 * - `haulRope`: he takes or lets go of the nose rope (a short rough swish).
 *
 * Gentle: a piece about as loud as gathering's (audio/_gather.ts `gatherGot`).
 */

const LEVEL = { put: 0.22, rope: 0.06 };

/** Struck filtered noise (dry, a touch of reverb). */
function burst(o: SfxOut, t: number, b: { type: BiquadFilterType; f0: number; q?: number; attack: number; tau: number; level: number; kind?: 'white' | 'pink' | 'brown'; wet?: number }): void {
  const ctx = o.ctx;
  const buf = noise(b.kind ?? 'white');
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const end = b.attack + b.tau * 6;
  const f = biquad(ctx, b.type, b.f0, b.q ?? 0.8);
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

/** A short tone dropping a little in pitch (the body of what is put down). */
function tok(o: SfxOut, t: number, f: number, level: number, tau: number, type: OscillatorType = 'triangle'): void {
  const ctx = o.ctx;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f * 1.25, t);
  osc.frequency.exponentialRampToValueAtTime(f, t + 0.016);
  const env = ctx.createGain();
  strike(env.gain, t, level, 0.002, tau);
  const wet = ctx.createGain();
  wet.gain.value = 0.1;
  osc.connect(env);
  env.connect(o.dry);
  env.connect(wet).connect(o.wet);
  osc.start(t);
  osc.stop(t + tau * 7);
  cleanup(osc, [osc, env, wet]);
}

registerSfx(
  'haulPut:log',
  (o, g, t) => {
    const r = o.rnd;
    const L = LEVEL.put * (0.5 + 0.5 * g);
    // (the log's weight on the planks, and its end settling a moment after)
    tok(o, t, range(r, 105, 135), L, 0.06, 'sine');
    burst(o, t, { type: 'bandpass', f0: range(r, 420, 650), q: 1.1, attack: 0.002, tau: 0.03, level: L * 0.9, kind: 'brown' });
    tok(o, t + range(r, 0.07, 0.11), range(r, 160, 200), L * 0.45, 0.035);
  },
  'moves',
);

registerSfx(
  'haulPut:bamboo',
  (o, g, t) => {
    const r = o.rnd;
    const L = LEVEL.put * (0.5 + 0.5 * g);
    // (the pole on the others: two hollow clacks, a ring)
    tok(o, t, range(r, 420, 520), L * 0.8, 0.04);
    burst(o, t, { type: 'bandpass', f0: range(r, 1800, 2600), q: 1.4, attack: 0.001, tau: 0.012, level: L * 0.5 });
    tok(o, t + range(r, 0.05, 0.08), range(r, 520, 640), L * 0.5, 0.035);
  },
  'moves',
);

registerSfx(
  'haulPut:thatch',
  (o, g, t) => {
    const r = o.rnd;
    const L = LEVEL.put * (0.5 + 0.5 * g);
    // (dry leaves pressed down: a soft thump and a long rustle)
    tok(o, t, range(r, 170, 220), L * 0.4, 0.04, 'sine');
    burst(o, t, { type: 'bandpass', f0: range(r, 2200, 3200), q: 0.6, attack: 0.02, tau: 0.08, level: L * 0.45, kind: 'pink' });
  },
  'moves',
);

registerSfx(
  'haulPut:clay',
  (o, g, t) => {
    const r = o.rnd;
    const L = LEVEL.put * (0.5 + 0.5 * g);
    // (the basket's weave creaks, the clay in it thuds)
    burst(o, t, { type: 'bandpass', f0: range(r, 1300, 1800), q: 2, attack: 0.004, tau: 0.02, level: L * 0.35 });
    tok(o, t + 0.01, range(r, 75, 95), L * 0.9, 0.05, 'sine');
    burst(o, t + 0.01, { type: 'lowpass', f0: range(r, 300, 420), attack: 0.003, tau: 0.04, level: L * 0.8, kind: 'brown' });
  },
  'moves',
);

registerSfx(
  'haulRope',
  (o, g, t) => {
    const r = o.rnd;
    burst(o, t, { type: 'bandpass', f0: range(r, 900, 1300), q: 0.9, attack: 0.03, tau: 0.05, level: LEVEL.rope * (0.5 + 0.5 * g), kind: 'pink', wet: 0.04 });
  },
  'moves',
);
