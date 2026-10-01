import { registerSfx, type SfxOut } from './addonSfx';
import { biquad, noise, range, strike, type NoiseKind } from './dsp';

/**
 * The sounds of helping the farmers (roam/_farmWork.ts), made here with
 * dsp.ts's helpers as the explorer's own are (audio/explorer.ts), on his bus
 * (`moves`), as soft as his wading steps:
 *
 * - `farmPlant`: seedlings pushed into the mud: a wet squelch under the
 *   water, a dull plop, the fingers pulled out, a drop or two;
 * - `farmSwish`: the sickle drawn through a fistful of stalks: a short swish
 *   and the dry stalks snapping;
 * - `farmRustle`: the bundle, the sickle, the sheaf or the parcel changing
 *   hands: leaves and straw rustling;
 * - `farmLay`: the sheaf laid down on the bund: a soft thump of straw.
 */

interface Burst {
  kind?: NoiseKind;
  type: BiquadFilterType;
  f0: number;
  f1?: number;
  q?: number;
  attack: number;
  tau: number;
  level: number;
  pan?: number;
  wet?: number;
}

/** Filtered noise, struck: it rises in `attack`, dies away; its filter slides from `f0` to `f1`. */
function burst(o: SfxOut, t: number, b: Burst): void {
  const { ctx } = o;
  const buf = noise(b.kind ?? 'white');
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const end = b.attack + b.tau * 6;
  const f = biquad(ctx, b.type, b.f0, b.q ?? 0.7);
  if (b.f1 && b.f1 !== b.f0) {
    f.frequency.setValueAtTime(b.f0, t);
    f.frequency.exponentialRampToValueAtTime(b.f1, t + end);
  }
  const env = ctx.createGain();
  strike(env.gain, t, b.level, b.attack, b.tau);
  const nodes: AudioNode[] = [src, f, env];
  let last: AudioNode = src.connect(f).connect(env);
  if (b.pan) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, b.pan));
    last = last.connect(p);
    nodes.push(p);
  }
  last.connect(o.dry);
  if (b.wet) {
    const w = ctx.createGain();
    w.gain.value = b.wet;
    last.connect(w).connect(o.wet);
    nodes.push(w);
  }
  src.start(t, o.rnd() * Math.max(0, buf.duration - end - 0.1));
  src.stop(t + end);
  src.onended = () => {
    for (const n of nodes) n.disconnect();
  };
}

/** A struck tone sliding from `f0` to `f1`. */
function tone(o: SfxOut, t: number, f0: number, f1: number, attack: number, tau: number, level: number, wet = 0): void {
  const { ctx } = o;
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(f1, t + tau * 3);
  const env = ctx.createGain();
  strike(env.gain, t, level, attack, tau);
  osc.connect(env).connect(o.dry);
  const nodes: AudioNode[] = [osc, env];
  if (wet) {
    const w = ctx.createGain();
    w.gain.value = wet;
    env.connect(w).connect(o.wet);
    nodes.push(w);
  }
  osc.start(t);
  osc.stop(t + attack + tau * 7);
  osc.onended = () => {
    for (const n of nodes) n.disconnect();
  };
}

/** Drips back into the water, scattered over `spread` s. */
function drops(o: SfxOut, t: number, n: number, spread: number, level: number): void {
  const r = o.rnd;
  for (let i = 0; i < n; i++) {
    const f0 = 700 * 3 ** (r() ** 1.2);
    tone(o, t + spread * r() ** 1.4, f0, f0 * range(r, 1.3, 1.7), 0.0015, range(r, 0.008, 0.018), level * (0.4 + 0.6 * r()), 0.12);
  }
}

registerSfx('farmPlant', (o, g, t) => {
  const r = o.rnd;
  const L = 0.55 * g;
  // (the squelch: the seedlings' roots and the fingers going into soft mud under a hand of water)
  burst(o, t, { kind: 'brown', type: 'lowpass', f0: 700, f1: 260, attack: 0.012, tau: 0.06, level: L, wet: 0.06 });
  tone(o, t + 0.01, range(r, 170, 200), 100, 0.006, 0.045, L * 0.12, 0.04);
  // (the fingers pulled out: a little suck, then a drop or two)
  burst(o, t + range(r, 0.1, 0.14), { kind: 'pink', type: 'bandpass', f0: 1300, f1: 600, q: 1.2, attack: 0.02, tau: 0.04, level: L * 0.35, wet: 0.08 });
  drops(o, t + 0.16, 1 + Math.floor(r() * 2), 0.2, L * 0.05);
});

registerSfx('farmSwish', (o, g, t) => {
  const r = o.rnd;
  const L = 0.45 * g;
  // (the blade through the air and the stalks)
  burst(o, t, { kind: 'white', type: 'bandpass', f0: 2200, f1: 5200, q: 1.1, attack: 0.03, tau: 0.05, level: L * 0.7, pan: -0.1, wet: 0.05 });
  // (the dry stalks snapping: quick ticks of straw)
  for (let i = 0; i < 6; i++) burst(o, t + 0.035 + r() * 0.07, { kind: 'white', type: 'highpass', f0: range(r, 2400, 4200), attack: 0.001, tau: range(r, 0.003, 0.007), level: L * range(r, 0.3, 0.7), pan: range(r, -0.2, 0.1) });
  burst(o, t + 0.05, { kind: 'pink', type: 'bandpass', f0: 1500, f1: 900, q: 0.9, attack: 0.01, tau: 0.05, level: L * 0.4 });
});

registerSfx('farmRustle', (o, g, t) => {
  const r = o.rnd;
  const L = 0.3 * g;
  // (leaves and straw against each other: a few soft brushes)
  for (let i = 0; i < 3; i++) burst(o, t + i * range(r, 0.06, 0.1), { kind: 'pink', type: 'bandpass', f0: range(r, 2600, 4200), q: 0.8, attack: 0.025, tau: range(r, 0.03, 0.06), level: L * (1 - i * 0.2), pan: range(r, -0.15, 0.15), wet: 0.05 });
});

registerSfx('farmLay', (o, g, t) => {
  const r = o.rnd;
  const L = 0.45 * g;
  // (a sheaf of dry straw set down on the earth: a soft thump and the straw settling)
  burst(o, t, { kind: 'brown', type: 'lowpass', f0: 420, f1: 180, attack: 0.01, tau: 0.07, level: L, wet: 0.05 });
  burst(o, t + 0.03, { kind: 'pink', type: 'bandpass', f0: 3000, q: 0.8, attack: 0.02, tau: 0.08, level: L * 0.35 });
  for (let i = 0; i < 3; i++) burst(o, t + 0.08 + r() * 0.12, { kind: 'white', type: 'highpass', f0: range(r, 3000, 4500), attack: 0.001, tau: 0.004, level: L * 0.25 });
});
