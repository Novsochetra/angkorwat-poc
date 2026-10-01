import { registerSfx, type SfxOut } from './addonSfx';
import { biquad, mtof, noise, range, strike, type NoiseKind } from './dsp';

/**
 * Selling his fish (roam/_fishSell.ts): its sounds, synthesized as the
 * explorer's own are (audio/explorer.ts), soft — under the paddle and the
 * footsteps:
 *
 * - `sellBasket` (moves): a fish slipped into his basket hung in the water —
 *   a wet slosh, a low thump of the fish, the bamboo creaking a little;
 * - `sellHand` (moves): he hands a fish over — a soft wet slap into her hand;
 * - `sellScale` (ambience: the seller's): her hanging dial scale takes the
 *   fish — the hook's tick and the spring's small wobble;
 * - `sellCoin` (moves): he is paid — riel notes counted into his hand (crisp
 *   flicks of paper), a coin or two, and a small rising three-note chime,
 *   gentler and brighter than paying at a stall.
 */

interface Burst {
  kind?: NoiseKind;
  type: BiquadFilterType;
  f0: number;
  f1?: number;
  q?: number;
  attack: number;
  tau: number;
  dur?: number;
  level: number;
  pan?: number;
  wet?: number;
}

interface Tone {
  f0: number;
  f1?: number;
  glide?: number;
  type?: OscillatorType;
  attack: number;
  tau: number;
  level: number;
  pan?: number;
  wet?: number;
}

/** Into the bus: panned, and some of it to the reverb. */
function out(o: SfxOut, node: AudioNode, pan: number, wet: number): AudioNode[] {
  const made: AudioNode[] = [];
  let last = node;
  if (pan) {
    const p = o.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    last = last.connect(p);
    made.push(p);
  }
  last.connect(o.dry);
  if (wet > 0) {
    const g = o.ctx.createGain();
    g.gain.value = wet;
    last.connect(g).connect(o.wet);
    made.push(g);
  }
  return made;
}

/** Filtered noise, struck: it rises in `attack`, then dies away; its filter slides from `f0` to `f1`. */
function burst(o: SfxOut, t: number, b: Burst): void {
  const ctx = o.ctx;
  const buf = noise(b.kind ?? 'white');
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const end = b.attack + b.tau * 6;
  const f = biquad(ctx, b.type, b.f0, b.q ?? 0.7);
  if (b.f1 && b.f1 !== b.f0) {
    f.frequency.setValueAtTime(b.f0, t);
    f.frequency.exponentialRampToValueAtTime(b.f1, t + (b.dur ?? end));
  }
  const env = ctx.createGain();
  strike(env.gain, t, b.level, b.attack, b.tau);
  src.connect(f).connect(env);
  const made = out(o, env, b.pan ?? 0, b.wet ?? 0);
  src.start(t, o.rnd() * Math.max(0, buf.duration - end - 0.1));
  src.stop(t + end);
  src.onended = () => {
    for (const n of [src, f, env, ...made]) n.disconnect();
  };
}

/** A struck tone whose pitch slides from `f0` to `f1`. */
function tone(o: SfxOut, t: number, s: Tone): void {
  const ctx = o.ctx;
  const osc = ctx.createOscillator();
  osc.type = s.type ?? 'sine';
  osc.frequency.setValueAtTime(s.f0, t);
  if (s.f1 && s.f1 !== s.f0) osc.frequency.exponentialRampToValueAtTime(s.f1, t + (s.glide ?? s.tau * 3));
  const env = ctx.createGain();
  strike(env.gain, t, s.level, s.attack, s.tau);
  osc.connect(env);
  const made = out(o, env, s.pan ?? 0, s.wet ?? 0);
  osc.start(t);
  osc.stop(t + s.attack + s.tau * 7);
  osc.onended = () => {
    for (const n of [osc, env, ...made]) n.disconnect();
  };
}

/** A small clear chime (a few partials of a struck bar). */
function chime(o: SfxOut, t: number, f: number, level: number, pan: number): void {
  for (const [ratio, amp, tau] of [
    [1, 1, 0.8],
    [2.76, 0.16, 0.3],
    [5.4, 0.04, 0.12],
  ] as const)
    tone(o, t, { f0: f * ratio * range(o.rnd, 0.999, 1.001), attack: 0.004, tau, level: level * amp, pan, wet: 0.5 });
}

/** A small coin's clink: a bright ring of a few inharmonic partials, quick to fade. */
function clink(o: SfxOut, t: number, level: number, pan: number): void {
  const f = range(o.rnd, 2900, 3600);
  for (const [ratio, amp, tau] of [
    [1, 1, 0.09],
    [1.47, 0.6, 0.07],
    [2.32, 0.35, 0.05],
  ] as const)
    tone(o, t, { f0: f * ratio, attack: 0.001, tau, level: level * amp, pan, wet: 0.12 });
}

registerSfx('sellBasket', (o, g, t) => {
  const r = o.rnd;
  const k = 0.5 + 0.5 * g;
  // The slosh of the water in the basket, the fish's soft thump, the strips creaking.
  burst(o, t, { kind: 'pink', type: 'lowpass', f0: 2000, f1: 450, q: 0.8, attack: 0.01, tau: 0.07, dur: 0.22, level: 0.42 * k, pan: -0.25, wet: 0.1 });
  tone(o, t + 0.02, { f0: 190, f1: 95, glide: 0.06, attack: 0.003, tau: 0.035, level: 0.09 * k, pan: -0.25, wet: 0.05 });
  let s = t + range(r, 0.08, 0.12);
  for (let i = 0; i < 3; i++) {
    burst(o, s, { kind: 'white', type: 'bandpass', f0: range(r, 1300, 2100), q: 2.2, attack: 0.002, tau: range(r, 0.008, 0.014), level: (0.32 - 0.07 * i) * k, pan: -0.3, wet: 0.04 });
    s += range(r, 0.05, 0.09);
  }
  // (a drip or two back into the water)
  tone(o, t + range(r, 0.3, 0.38), { f0: range(r, 900, 1200), f1: 1700, glide: 0.03, attack: 0.002, tau: 0.02, level: 0.025 * k, pan: -0.2, wet: 0.3 });
});

registerSfx('sellHand', (o, g, t) => {
  const k = 0.5 + 0.5 * g;
  // A wet fish into her hand: a soft slap, a little squelch.
  burst(o, t, { kind: 'pink', type: 'bandpass', f0: 1200, f1: 600, q: 0.9, attack: 0.003, tau: 0.03, dur: 0.1, level: 0.38 * k, pan: 0.1, wet: 0.05 });
  burst(o, t + 0.035, { kind: 'white', type: 'lowpass', f0: 1800, f1: 700, q: 0.7, attack: 0.01, tau: 0.04, dur: 0.12, level: 0.16 * k, pan: 0.1, wet: 0.05 });
}, 'moves');

registerSfx('sellScale', (o, g, t) => {
  const k = 0.5 + 0.5 * g;
  // The hook takes the fish (a light metal tick), and the spring settles with a small wobble.
  tone(o, t, { f0: 2400, attack: 0.001, tau: 0.02, level: 0.05 * k, pan: 0.15, wet: 0.1 });
  tone(o, t + 0.01, { f0: 3700, attack: 0.001, tau: 0.012, level: 0.025 * k, pan: 0.15, wet: 0.1 });
  const ctx = o.ctx;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(520, t + 0.03);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 11;
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(40, t + 0.03);
  depth.gain.setTargetAtTime(0, t + 0.03, 0.12);
  lfo.connect(depth).connect(osc.frequency);
  const env = ctx.createGain();
  strike(env.gain, t + 0.03, 0.022 * k, 0.004, 0.12);
  osc.connect(env);
  const made = out(o, env, 0.15, 0.15);
  osc.start(t + 0.03);
  lfo.start(t + 0.03);
  osc.stop(t + 0.95);
  lfo.stop(t + 0.95);
  osc.onended = () => {
    for (const n of [osc, lfo, depth, env, ...made]) n.disconnect();
  };
}, 'ambience');

registerSfx('sellCoin', (o, g, t) => {
  const r = o.rnd;
  const k = 0.5 + 0.5 * g;
  // Notes counted into his hand: a soft slide, then two or three crisp flicks of paper.
  burst(o, t, { kind: 'pink', type: 'bandpass', f0: 2100, f1: 3400, q: 1.1, attack: 0.03, tau: 0.05, dur: 0.16, level: 0.42 * k, pan: 0.08, wet: 0.03 });
  let s = t + range(r, 0.06, 0.09);
  for (let i = 0, n = 2 + Math.floor(r() * 2); i < n; i++) {
    burst(o, s, { kind: 'white', type: 'bandpass', f0: range(r, 3200, 4800), q: 1.1, attack: 0.002, tau: range(r, 0.014, 0.022), level: (0.7 - 0.12 * i) * k, pan: range(r, -0.05, 0.15), wet: 0.04 });
    s += range(r, 0.07, 0.1);
  }
  // (a coin or two)
  clink(o, s, 0.03 * k, 0.1);
  if (r() < 0.6) clink(o, s + range(r, 0.06, 0.1), 0.02 * k, -0.05);
  // A small, warm rising chime: the sale is made.
  chime(o, s + 0.12, mtof(84), 0.035 * k, -0.08);
  chime(o, s + 0.22, mtof(88), 0.03 * k, 0.02);
  chime(o, s + 0.32, mtof(91), 0.028 * k, 0.1);
});
