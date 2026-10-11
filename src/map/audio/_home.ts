import { registerSfx, type SfxOut } from './addonSfx';
import { biquad, cleanup, mtof, noise, range, strike } from './dsp';

/**
 * His stilt house's sounds (roam/_home*.ts), made with dsp.ts's helpers:
 *
 * - `homeKey` (moves): the grandmother's key put in his hand — a small brass
 *   key knocking on its ring, two or three light metallic pings.
 * - `homeDoor` (moves): the padlock's hasp lifted with a clack, then the old
 *   double doors swinging in on their wooden pins (as `homeDoorOpen`).
 * - `homeDoorOpen` (moves): the doors swung open (half a second): a short low
 *   creak rising, each leaf knocking softly against the wall inside.
 * - `homeDoorShut` (moves): the doors swung to: a short creak falling, the two
 *   leaves meeting with a wooden clap, the wooden latch dropping a moment later.
 * - `homeMat` (moves): the reed mat (kantel) as he lies down on it or gets up:
 *   a dry crackling swish.
 * - `homeNet` (moves): the mosquito net let down or rolled up: a soft swish.
 * - `homeSleep` (ui): as the view goes dark, three soft bell notes falling.
 * - `homeWake` (ui): as he wakes, two soft notes rising.
 *
 * Gentle: as loud as the hammock's rustle at most, the bells under the
 * calendar's.
 */

const LEVEL = { key: 0.16, clack: 0.3, creak: 0.11, shut: 0.32, mat: 0.34, net: 0.2, bell: 0.085 };

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

/**
 * The old leaves turning on their wooden pins: a sawtooth through a narrow band, chopped into a stick-slip rasp,
 * its pitch sliding from `f` × `from` to × `to` (by way of × `mid`) over `len` s from `t`.
 */
function creak(o: SfxOut, t: number, len: number, level: number, slide: readonly [from: number, mid: number, to: number]): void {
  const r = o.rnd;
  const ctx = o.ctx;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  const f0 = range(r, 95, 120);
  osc.frequency.setValueAtTime(f0 * slide[0], t);
  osc.frequency.linearRampToValueAtTime(f0 * slide[1], t + len * 0.5);
  osc.frequency.linearRampToValueAtTime(f0 * slide[2], t + len);
  const chop = ctx.createOscillator();
  chop.type = 'square';
  chop.frequency.setValueAtTime(18, t);
  chop.frequency.linearRampToValueAtTime(11, t + len);
  const depth = ctx.createGain();
  depth.gain.value = 0.4;
  const stick = ctx.createGain();
  stick.gain.value = 0.6;
  chop.connect(depth).connect(stick.gain);
  const band = biquad(ctx, 'bandpass', range(r, 700, 900), 2.2);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(level, t + Math.min(0.2, len * 0.3));
  env.gain.linearRampToValueAtTime(level * 0.6, t + len * 0.8);
  env.gain.linearRampToValueAtTime(0, t + len);
  const wet = ctx.createGain();
  wet.gain.value = 0.15;
  osc.connect(band).connect(stick).connect(env);
  env.connect(o.dry);
  env.connect(wet).connect(o.wet);
  osc.start(t);
  chop.start(t);
  osc.stop(t + len + 0.05);
  chop.stop(t + len + 0.05);
  cleanup(osc, [osc, chop, depth, stick, band, env, wet]);
}

/** The doors swinging in (half a second from `t`: `HOME_LEAF.swing`), each leaf knocking softly against the wall inside. */
function swingIn(o: SfxOut, g: number, t: number): void {
  creak(o, t, 0.5, LEVEL.creak * g, [1, 1.45, 1.25]);
  for (const k of [0.5, 0.6]) burst(o, t + k, { type: 'bandpass', f0: 300, q: 2.5, attack: 0.003, tau: 0.04, level: LEVEL.clack * 0.4 * g, kind: 'pink' });
}

registerSfx(
  'homeDoor',
  (o, g, t) => {
    // The hasp lifted: a dry wooden-metal clack; then the doors swing in.
    burst(o, t, { type: 'bandpass', f0: 1900, q: 2, attack: 0.002, tau: 0.018, level: LEVEL.clack * g, kind: 'white' });
    burst(o, t + 0.01, { type: 'bandpass', f0: 420, q: 1.5, attack: 0.003, tau: 0.04, level: LEVEL.clack * 0.6 * g, kind: 'pink' });
    swingIn(o, g, t + 0.35);
  },
  'moves',
);

registerSfx('homeDoorOpen', (o, g, t) => swingIn(o, g, t), 'moves');

registerSfx(
  'homeDoorShut',
  (o, g, t) => {
    // A shorter creak falling as they come round, then the two leaves meet: a hollow wooden clap (the second a hair
    // after the first), and the latch dropping into its keeper.
    creak(o, t, 0.4, LEVEL.creak * 0.85 * g, [1.3, 1.15, 0.95]);
    const m = t + 0.47;
    burst(o, m, { type: 'bandpass', f0: 240, q: 1.8, attack: 0.002, tau: 0.05, level: LEVEL.shut * g, kind: 'pink', wet: 0.12 });
    burst(o, m + 0.004, { type: 'bandpass', f0: 1100, q: 1.4, attack: 0.001, tau: 0.012, level: LEVEL.shut * 0.45 * g });
    burst(o, m + 0.035, { type: 'bandpass', f0: 300, q: 2.2, attack: 0.002, tau: 0.035, level: LEVEL.shut * 0.5 * g, kind: 'pink' });
    burst(o, m + 0.2, { type: 'bandpass', f0: 1500, q: 2.5, attack: 0.001, tau: 0.01, level: LEVEL.clack * 0.4 * g });
    burst(o, m + 0.205, { type: 'bandpass', f0: 520, q: 1.8, attack: 0.002, tau: 0.025, level: LEVEL.clack * 0.35 * g, kind: 'pink' });
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
