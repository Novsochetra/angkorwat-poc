import { registerSfx, type SfxOut } from './addonSfx';
import { biquad, cleanup, mtof, noise, range, strike } from './dsp';

/**
 * His stilt house's sounds (roam/_home*.ts), made with dsp.ts's helpers:
 *
 * - `homeKey` (moves): the grandmother's key put in his hand — a small brass
 *   key knocking on its ring, two or three light metallic pings.
 * - `homeDoor` (moves): the padlock's hasp lifted with a clack, then the old
 *   double doors swinging in on their wooden pins, a slow low creak.
 * - `homeMat` (moves): the reed mat (kantel) as he lies down on it or gets up:
 *   a dry crackling swish.
 * - `homeNet` (moves): the mosquito net let down or rolled up: a soft swish.
 * - `homeSleep` (ui): as the view goes dark, three soft bell notes falling.
 * - `homeWake` (ui): as he wakes, two soft notes rising.
 *
 * Gentle: as loud as the hammock's rustle at most, the bells under the
 * calendar's.
 */

const LEVEL = { key: 0.16, clack: 0.3, creak: 0.11, mat: 0.34, net: 0.2, bell: 0.085 };

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

/** A small struck metal piece: a few inharmonic sine partials decaying fast. */
function ping(o: SfxOut, t: number, f: number, level: number, tau: number): void {
  const ctx = o.ctx;
  const out = ctx.createGain();
  out.gain.value = 1;
  const wet = ctx.createGain();
  wet.gain.value = 0.12;
  out.connect(o.dry);
  out.connect(wet).connect(o.wet);
  const nodes: AudioNode[] = [out, wet];
  let last: OscillatorNode | null = null;
  for (const [k, a, d] of [
    [1, 1, 1],
    [2.76, 0.45, 0.6],
    [5.4, 0.25, 0.35],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.frequency.value = f * k;
    const env = ctx.createGain();
    strike(env.gain, t, level * a, 0.002, tau * d);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + tau * d * 7);
    nodes.push(osc, env);
    last = osc;
  }
  if (last) cleanup(last, nodes);
}

/** A soft bell note (a sine with a quiet octave and fifth), long and low in the mix. */
function bell(o: SfxOut, t: number, midi: number, level: number, len: number): void {
  const ctx = o.ctx;
  const f = mtof(midi);
  const out = ctx.createGain();
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  out.connect(o.dry);
  out.connect(wet).connect(o.wet);
  const nodes: AudioNode[] = [out, wet];
  let last: OscillatorNode | null = null;
  for (const [k, a] of [
    [1, 1],
    [2, 0.22],
    [3.01, 0.08],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.frequency.value = f * k;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(level * a, t + 0.02);
    env.gain.exponentialRampToValueAtTime(level * a * 0.001 + 1e-5, t + len);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + len + 0.05);
    nodes.push(osc, env);
    last = osc;
  }
  if (last) cleanup(last, nodes);
}

registerSfx(
  'homeKey',
  (o, g, t) => {
    const r = o.rnd;
    const L = LEVEL.key * (0.5 + 0.5 * g);
    let s = t;
    for (let i = 0; i < 3; i++) {
      ping(o, s, range(r, 2300, 3100), L * (i === 0 ? 1 : 0.6), range(r, 0.035, 0.06));
      s += range(r, 0.06, 0.12);
    }
    burst(o, t, { type: 'highpass', f0: 4000, q: 0.7, attack: 0.002, tau: 0.02, level: L * 0.5 });
  },
  'moves',
);

registerSfx(
  'homeDoor',
  (o, g, t) => {
    const r = o.rnd;
    const ctx = o.ctx;
    // The hasp lifted: a dry wooden-metal clack.
    burst(o, t, { type: 'bandpass', f0: 1900, q: 2, attack: 0.002, tau: 0.018, level: LEVEL.clack * g, kind: 'white' });
    burst(o, t + 0.01, { type: 'bandpass', f0: 420, q: 1.5, attack: 0.003, tau: 0.04, level: LEVEL.clack * 0.6 * g, kind: 'pink' });
    // The doors swing in on their wooden pins: a slow creak, sliding in pitch.
    const c0 = t + 0.35;
    const len = 1.1;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const f0 = range(r, 95, 120);
    osc.frequency.setValueAtTime(f0, c0);
    osc.frequency.linearRampToValueAtTime(f0 * 1.5, c0 + len * 0.5);
    osc.frequency.linearRampToValueAtTime(f0 * 1.2, c0 + len);
    const chop = ctx.createOscillator();
    chop.type = 'square';
    chop.frequency.setValueAtTime(18, c0);
    chop.frequency.linearRampToValueAtTime(11, c0 + len);
    const depth = ctx.createGain();
    depth.gain.value = 0.4;
    const stick = ctx.createGain();
    stick.gain.value = 0.6;
    chop.connect(depth).connect(stick.gain);
    const band = biquad(ctx, 'bandpass', range(r, 700, 900), 2.2);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, c0);
    env.gain.linearRampToValueAtTime(LEVEL.creak * g, c0 + 0.2);
    env.gain.linearRampToValueAtTime(LEVEL.creak * 0.6 * g, c0 + len * 0.8);
    env.gain.linearRampToValueAtTime(0, c0 + len);
    const wet = ctx.createGain();
    wet.gain.value = 0.15;
    osc.connect(band).connect(stick).connect(env);
    env.connect(o.dry);
    env.connect(wet).connect(o.wet);
    osc.start(c0);
    chop.start(c0);
    osc.stop(c0 + len + 0.05);
    chop.stop(c0 + len + 0.05);
    cleanup(osc, [osc, chop, depth, stick, band, env, wet]);
    // (each leaf comes to rest against the wall: two soft knocks)
    for (const k of [0, 0.12]) burst(o, c0 + len + k, { type: 'bandpass', f0: 300, q: 2.5, attack: 0.003, tau: 0.04, level: LEVEL.clack * 0.45 * g, kind: 'pink' });
  },
  'moves',
);

registerSfx(
  'homeMat',
  (o, g, t) => {
    const r = o.rnd;
    const L = LEVEL.mat * (0.5 + 0.5 * g);
    burst(o, t, { type: 'bandpass', f0: 2600, f1: 1800, q: 0.8, attack: 0.08, tau: 0.12, level: L * 0.55 });
    let s = t + 0.03;
    for (let i = 0, n = 5 + Math.floor(r() * 3); i < n; i++) {
      burst(o, s, { type: 'bandpass', f0: range(r, 3000, 5200), q: 2, attack: 0.002, tau: range(r, 0.008, 0.016), level: L * range(r, 0.3, 0.6) });
      s += range(r, 0.03, 0.08);
    }
    burst(o, t + 0.2, { type: 'lowpass', f0: 500, f1: 250, q: 0.7, attack: 0.02, tau: 0.07, level: L * 0.6, kind: 'pink', wet: 0.03 });
  },
  'moves',
);

registerSfx(
  'homeNet',
  (o, g, t) => {
    burst(o, t, { type: 'bandpass', f0: 3200, f1: 1800, q: 0.7, attack: 0.25, tau: 0.22, level: LEVEL.net * (0.5 + 0.5 * g), kind: 'pink' });
  },
  'moves',
);

registerSfx(
  'homeSleep',
  (o, g, t) => {
    // (falling: G, E, C, slow)
    [79, 76, 72].forEach((m, i) => bell(o, t + i * 0.55, m, LEVEL.bell * g * (1 - i * 0.15), 2.4));
  },
  'ui',
);

registerSfx(
  'homeWake',
  (o, g, t) => {
    // (rising: C, G)
    [72, 79].forEach((m, i) => bell(o, t + i * 0.4, m, LEVEL.bell * g, 2));
  },
  'ui',
);
