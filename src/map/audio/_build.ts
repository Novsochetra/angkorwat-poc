import { registerSfx, type SfxOut } from './addonSfx';
import { biquad, cleanup, mtof, noise, range, strike } from './dsp';

/**
 * Building at home's sounds (roam/_build*.ts), made with dsp.ts's helpers, a
 * little different every time (the engine's seeded `o.rnd`):
 *
 * - `buildKnock` (moves): his hammer on wood — a short woody knock, the
 *   hammer's iron head ringing faintly over it; `gain` < 0.6 a lighter tap.
 * - `buildWood` (moves): a piece of wood or bamboo set in place: a hollow
 *   bamboo tok and a low thump, a little creak of the binding.
 * - `buildTake` (moves): taking a piece down: boards and poles knocking as
 *   they come apart and are laid down (a few soft knocks falling in pitch).
 * - `buildDone` (ui): it stands — three soft bell notes rising.
 *
 * Gentle: the knock about as loud as a footstep on earth, the bells as soft
 * as the home's (audio/_home.ts).
 */

const LEVEL = { knock: 0.26, ring: 0.03, wood: 0.22, take: 0.2, bell: 0.08 };

/** Struck filtered noise into the bus (dry, a touch of reverb). */
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

/** A short tone with a fast drop in pitch (the wood's body answering the blow). */
function tok(o: SfxOut, t: number, f: number, level: number, tau: number, wetLevel = 0.1): void {
  const ctx = o.ctx;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(f * 1.25, t);
  osc.frequency.exponentialRampToValueAtTime(f, t + 0.012);
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

/** A soft bell note (as the home's): a sine with a quiet octave and fifth, long and low in the mix. */
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
  'buildKnock',
  (o, g, t) => {
    const r = o.rnd;
    const L = LEVEL.knock * (0.45 + 0.55 * g);
    // (the wood's knock: its body, its crack)
    tok(o, t, range(r, 330, 520), L, range(r, 0.022, 0.034));
    burst(o, t, { type: 'bandpass', f0: range(r, 900, 1700), q: 1.1, attack: 0.001, tau: 0.012, level: L * 0.9 });
    // (the iron head, faintly)
    tok(o, t + 0.002, range(r, 2300, 2900), LEVEL.ring * (0.5 + 0.5 * g), 0.05, 0.15);
  },
  'moves',
);

registerSfx(
  'buildWood',
  (o, g, t) => {
    const r = o.rnd;
    const L = LEVEL.wood * (0.5 + 0.5 * g);
    // (a hollow bamboo tok, a low thump under it, the binding's creak a moment later)
    tok(o, t, range(r, 240, 330), L, 0.05, 0.14);
    tok(o, t + 0.004, range(r, 95, 130), L * 0.7, 0.06);
    burst(o, t + range(r, 0.09, 0.14), { type: 'bandpass', f0: range(r, 600, 900), q: 3, attack: 0.02, tau: 0.05, level: L * 0.25 });
  },
  'moves',
);

registerSfx(
  'buildTake',
  (o, g, t) => {
    const r = o.rnd;
    const L = LEVEL.take * (0.5 + 0.5 * g);
    let s = t;
    for (let i = 0; i < 4; i++) {
      tok(o, s, range(r, 200, 340) * (1 - i * 0.08), L * (1 - i * 0.15), range(r, 0.03, 0.05));
      burst(o, s, { type: 'bandpass', f0: range(r, 500, 1100), q: 1, attack: 0.002, tau: 0.02, level: L * 0.4, kind: 'pink' });
      s += range(r, 0.08, 0.16);
    }
  },
  'moves',
);

registerSfx(
  'buildDone',
  (o, _g, t) => {
    // (three soft notes rising: G, B, D)
    bell(o, t, 79, LEVEL.bell, 1.4);
    bell(o, t + 0.16, 83, LEVEL.bell * 0.9, 1.4);
    bell(o, t + 0.32, 86, LEVEL.bell * 0.85, 1.8);
  },
  'ui',
);
