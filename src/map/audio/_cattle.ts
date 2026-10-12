import { registerSfx, type SfxOut } from './addonSfx';
import { biquad, noise, range, source, strike, type NoiseKind } from './dsp';

/**
 * His cattle and the cattle trader (roam/_cattle*.ts), all synthesized, soft:
 *
 * - `cattleMoo` (animals): a cow's low "mmmooo", long and mellow, through the
 *   nose (a sawtooth through a band that opens from "mm" to "oo", its breath
 *   with it), lower and longer than the buffalo's content "mmmh"
 *   (audio/_buffalo.ts); `cattleMooCalf` a calf's higher, shorter "maa";
 * - `cattleMunch` (animals): a mouthful of straw or grass pulled and chewed — a
 *   dry rip, then three or four soft crunches;
 * - `cattleCut` (moves): the sickle drawn through a fistful of grass — a quick
 *   swish and the blades' rip;
 * - `cattleBundle` (moves): the cut grass gathered and twisted into a bundle,
 *   or a straw bundle taken up — a rustle and a pat;
 * - `cattleLay` (moves): the bundle laid on the ground before a cow — a soft
 *   rustling thump.
 *
 * Levels: the voices as soft as the buffalo's close by (its `VOICE`), the
 * munching and the work under his footsteps (audio/explorer.ts), as the garden's
 * work is (audio/_garden.ts). The bells are the people's (`cowBell`, a call).
 */

/** The voice's level close by (the buffalo's `VOICE`). */
const VOICE = 0.15;

function burst(
  o: SfxOut,
  t: number,
  b: { kind?: NoiseKind; buf?: AudioBuffer; type: BiquadFilterType; f0: number; f1?: number; q?: number; attack: number; tau: number; dur?: number; level: number; pan?: number; wet?: number },
): void {
  const ctx = o.ctx;
  const buf = b.buf ?? noise(b.kind ?? 'white');
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
  const made = send(o, env, b.pan ?? 0, b.wet ?? 0);
  src.start(t, o.rnd() * Math.max(0, buf.duration - end - 0.1));
  src.stop(t + end);
  src.onended = () => {
    for (const n of [src, f, env, ...made]) n.disconnect();
  };
}

function send(o: SfxOut, node: AudioNode, pan: number, wet: number): AudioNode[] {
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

/**
 * The voice: a sawtooth through the nose (a band from `nose0` opening by `open` and closing again), its breath
 * through the same envelope; it rises a little and falls away at the end (`dur` s, around `f` Hz).
 */
function voice(o: SfxOut, t: number, dur: number, f: number, level: number, open: number, nose0: number): void {
  const ctx = o.ctx;
  const r = o.rnd;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(f * 0.92, t);
  osc.frequency.linearRampToValueAtTime(f * 1.06, t + dur * 0.3);
  osc.frequency.linearRampToValueAtTime(f, t + dur * 0.7);
  osc.frequency.linearRampToValueAtTime(f * 0.84, t + dur);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(level * 0.55, t + Math.min(0.25, dur * 0.2));
  env.gain.linearRampToValueAtTime(level, t + dur * 0.4);
  env.gain.linearRampToValueAtTime(level * 0.75, t + dur * 0.8);
  env.gain.linearRampToValueAtTime(0, t + dur);
  const nose = biquad(ctx, 'bandpass', nose0, 1.5);
  nose.frequency.setValueAtTime(nose0, t);
  nose.frequency.linearRampToValueAtTime(nose0 + nose0 * open, t + dur * 0.45);
  nose.frequency.linearRampToValueAtTime(nose0 * 1.15, t + dur);
  const low = biquad(ctx, 'lowpass', 900, 0.7);
  const lowGain = ctx.createGain();
  lowGain.gain.value = 0.45;
  const breath = ctx.createBufferSource();
  breath.buffer = noise('pink');
  const bf = biquad(ctx, 'lowpass', 600, 0.7);
  const bg = ctx.createGain();
  bg.gain.value = 0.45;
  osc.connect(env);
  breath.connect(bf).connect(bg).connect(env);
  env.connect(nose);
  env.connect(low).connect(lowGain);
  const made = [...send(o, nose, 0, 0.16), ...send(o, lowGain, 0, 0.16)];
  osc.start(t);
  osc.stop(t + dur + 0.05);
  breath.start(t, r() * 2);
  breath.stop(t + dur + 0.05);
  osc.onended = () => {
    for (const n of [osc, env, nose, low, lowGain, breath, bf, bg, ...made]) n.disconnect();
  };
}

// A cow lowing: a long mellow "mmmooo" (`gain`: 0‥1, by how near it is).
registerSfx(
  'cattleMoo',
  (o, gain, t) => {
    const r = o.rnd;
    voice(o, t, range(r, 1.5, 2.2), range(r, 96, 118), VOICE * gain, range(r, 0.8, 1.2), 280);
  },
  'animals',
);

// A calf: higher, shorter, a little plaintive "maa".
registerSfx(
  'cattleMooCalf',
  (o, gain, t) => {
    const r = o.rnd;
    voice(o, t, range(r, 0.7, 1.0), range(r, 200, 240), VOICE * 0.8 * gain, range(r, 1.2, 1.6), 420);
  },
  'animals',
);

// A mouthful of straw or grass: pulled from the heap (a dry rip), then chewed (soft crunches).
registerSfx(
  'cattleMunch',
  (o, gain, t) => {
    const r = o.rnd;
    const L = 0.55 * gain;
    burst(o, t, { kind: 'pink', type: 'bandpass', f0: range(r, 2600, 3200), f1: 1500, q: 0.8, attack: 0.015, tau: 0.06, dur: 0.12, level: L * 0.5, wet: 0.03 });
    const n = 3 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const at = t + 0.22 + i * range(r, 0.24, 0.3);
      burst(o, at, { buf: source('crunch'), type: 'lowpass', f0: range(r, 1300, 1800), f1: 800, q: 0.6, attack: 0.008, tau: 0.035, dur: 0.08, level: L * range(r, 0.5, 0.8), wet: 0.03 });
    }
  },
  'animals',
);

// The sickle through a fistful of grass: a quick swish, the blades' rip.
registerSfx(
  'cattleCut',
  (o, gain, t) => {
    const r = o.rnd;
    const L = 0.7 * gain;
    burst(o, t, { kind: 'white', type: 'bandpass', f0: range(r, 2400, 2900), f1: 4200, q: 1.2, attack: 0.02, tau: 0.04, dur: 0.09, level: L * 0.35, pan: range(r, -0.1, 0.1), wet: 0.03 });
    burst(o, t + 0.07, { buf: source('rustle'), type: 'bandpass', f0: 1800, f1: 1100, q: 0.7, attack: 0.006, tau: 0.05, dur: 0.12, level: L * 0.6, wet: 0.03 });
    burst(o, t + 0.09, { kind: 'pink', type: 'highpass', f0: 3200, q: 0.7, attack: 0.004, tau: 0.02, level: L * 0.25, wet: 0.02 });
  },
  'moves',
);

// Gathering the cut grass into a bundle, twisting it round; or taking up a straw bundle: a rustle and a pat.
registerSfx(
  'cattleBundle',
  (o, gain, t) => {
    const r = o.rnd;
    const L = 0.6 * gain;
    burst(o, t, { buf: source('rustle'), type: 'bandpass', f0: 1400, f1: 2200, q: 0.6, attack: 0.05, tau: 0.12, dur: 0.3, level: L * 0.55, wet: 0.04 });
    burst(o, t + range(r, 0.28, 0.34), { kind: 'brown', type: 'lowpass', f0: 420, q: 0.8, attack: 0.004, tau: 0.03, level: L * 0.7, wet: 0.03 });
  },
  'moves',
);

// The bundle laid on the ground before a cow: a soft rustling thump.
registerSfx(
  'cattleLay',
  (o, gain, t) => {
    const L = 0.6 * gain;
    burst(o, t, { kind: 'brown', type: 'lowpass', f0: 360, q: 0.8, attack: 0.006, tau: 0.05, level: L * 0.8, wet: 0.03 });
    burst(o, t, { buf: source('rustle'), type: 'bandpass', f0: 1600, f1: 900, q: 0.6, attack: 0.01, tau: 0.09, dur: 0.2, level: L * 0.5, wet: 0.04 });
  },
  'moves',
);
