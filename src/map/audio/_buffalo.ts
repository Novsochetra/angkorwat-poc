import { registerSfx, type SfxOut } from './addonSfx';
import { biquad, noise, range, source, strike, type NoiseKind } from './dsp';

/**
 * The water buffalo he rides (roam/_buffaloRide.ts), all synthesized: its
 * hooves (heavy, soft: a low thud under the body's weight, and what the hoof
 * meets: grass brushing, earth, the wet suck of mud, the road's stone),
 * wading (a slow slosh round the legs, deeper with the water), the splash as
 * it plunges in off a bank, a low soft contented "mmmh" (lower and gentler
 * than the herd's calls: audio/animals.ts), the grunt as it heaves itself up,
 * and a snort now and then.
 *
 * Levels (measured offline, the loudest 100 ms): a hoof on grass or earth is
 * some 4 dB under one of his own footsteps (audio/explorer.ts), in mud 2 dB
 * under (it steps four times a cycle, slower than he walks); wading as loud as
 * his step in the water, the splash going in 4 dB louder; the voice, the
 * grunt and the snort as soft as the herd's calls close by (audio/animals.ts).
 * The steps and the water are on the Steps slider, the voice on Animals.
 */

/** The hooves' thud (pink noise in a low band, as his steps' `thud`), and the deep pulse under it. */
const HOOF = 2.6;
/** The low "mmmh" and the grunt, at the animals' levels close by (animals.ts: `buffalo` 0.518, envelope peak 0.4). */
const VOICE = 0.16;

/** Filtered noise, struck (as audio/explorer.ts's `burst`). */
function burst(
  o: SfxOut,
  t: number,
  b: { kind?: NoiseKind; buf?: AudioBuffer; type: BiquadFilterType; f0: number; f1?: number; q?: number; attack: number; tau: number; dur?: number; hp?: number; level: number; pan?: number; wet?: number },
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
  const hp = b.hp ? biquad(ctx, 'highpass', b.hp, 0.7) : null;
  src.connect(f).connect(hp ?? env);
  hp?.connect(env);
  const made = send(o, env, b.pan ?? 0, b.wet ?? 0);
  src.start(t, o.rnd() * Math.max(0, buf.duration - end - 0.1));
  src.stop(t + end);
  src.onended = () => {
    for (const n of [src, f, env, ...made]) n.disconnect();
    hp?.disconnect();
  };
}

/** A struck tone sliding from `f0` to `f1`. */
function tone(o: SfxOut, t: number, s: { f0: number; f1?: number; glide?: number; attack: number; tau: number; level: number; type?: OscillatorType; pan?: number; wet?: number }): void {
  const ctx = o.ctx;
  const osc = ctx.createOscillator();
  osc.type = s.type ?? 'sine';
  osc.frequency.setValueAtTime(s.f0, t);
  if (s.f1 && s.f1 !== s.f0) osc.frequency.exponentialRampToValueAtTime(s.f1, t + (s.glide ?? s.tau * 3));
  const env = ctx.createGain();
  strike(env.gain, t, s.level, s.attack, s.tau);
  osc.connect(env);
  const made = send(o, env, s.pan ?? 0, s.wet ?? 0);
  osc.start(t);
  osc.stop(t + s.attack + s.tau * 7);
  osc.onended = () => {
    for (const n of [osc, env, ...made]) n.disconnect();
  };
}

/** To the bus: dry, and a little reverb, through a pan. */
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

/** Drops falling back into the water after a splash. */
function drops(o: SfxOut, t: number, n: number, spread: number, level: number): void {
  const r = o.rnd;
  for (let i = 0; i < n; i++) {
    const f0 = 600 * 4 ** (r() ** 1.2);
    const tau = range(r, 0.008, 0.02);
    tone(o, t + spread * r() ** 1.5, { f0, f1: f0 * range(r, 1.3, 1.8), glide: tau * 3, attack: 0.0015, tau, level: level * (0.4 + 0.6 * r()), pan: range(r, -0.3, 0.3), wet: 0.12 });
  }
}

/** The weight coming down on a hoof: a low thud and the pulse under it (`g` 0‥1: how hard; `pan` the leg's side). */
function thud(o: SfxOut, t: number, g: number, k: number, pan: number): void {
  const L = HOOF * g;
  burst(o, t, { kind: 'pink', type: 'bandpass', f0: 210 * k, f1: 120 * k, q: 1, hp: 90, attack: 0.008, tau: 0.045, dur: 0.08, level: L, pan, wet: 0.03 });
  tone(o, t, { f0: 95 * k, f1: 48 * k, glide: 0.06, attack: 0.004, tau: 0.05, level: L * 0.12, pan, wet: 0.02 });
}

type Hoof = 'grass' | 'earth' | 'mud' | 'hard';

function hoof(kind: Hoof) {
  return (o: SfxOut, gain: number, t: number) => {
    const r = o.rnd;
    const k = range(r, 0.9, 1.1);
    const g = gain * range(r, 0.8, 1);
    const pan = range(r, -0.25, 0.25);
    thud(o, t, g, k, pan);
    const L = HOOF * g;
    switch (kind) {
      case 'grass':
        // The blades brushing round the hoof as it comes down, and again as it lifts.
        burst(o, t, { kind: 'pink', type: 'bandpass', f0: 1900 * k, f1: 1100 * k, q: 0.7, attack: 0.02, tau: 0.05, level: L * 0.22, pan, wet: 0.03 });
        burst(o, t + range(r, 0.18, 0.26), { kind: 'pink', type: 'bandpass', f0: 2300 * k, q: 0.8, attack: 0.03, tau: 0.04, level: L * 0.1, pan, wet: 0.03 });
        break;
      case 'earth':
        // Dry earth: a dull crunch of grit under the hoof.
        burst(o, t + 0.004, { buf: source('crunch'), type: 'lowpass', f0: 1600 * k, f1: 900 * k, q: 0.5, attack: 0.01, tau: 0.04, dur: 0.1, level: L * 0.3, pan, wet: 0.03 });
        break;
      case 'mud':
        // Mud (the river's edge, a wet paddy): the hoof sinks in with a squelch, then sucks out of it.
        burst(o, t, { kind: 'brown', type: 'lowpass', f0: 700 * k, f1: 260 * k, q: 0.8, attack: 0.012, tau: 0.06, dur: 0.12, level: L * 0.38, pan, wet: 0.04 });
        burst(o, t + range(r, 0.2, 0.28), { kind: 'pink', type: 'bandpass', f0: 650 * k, f1: 1500 * k, q: 2.2, attack: 0.03, tau: 0.04, dur: 0.09, level: L * 0.22, pan, wet: 0.04 });
        break;
      case 'hard':
        // The road's stone: a short dull knock.
        burst(o, t, { kind: 'pink', type: 'bandpass', f0: 900 * k, f1: 650 * k, q: 0.9, attack: 0.0015, tau: 0.016, level: L * 0.45, pan, wet: 0.08 });
        break;
    }
  };
}

registerSfx('bufHoofGrass', hoof('grass'), 'steps');
registerSfx('bufHoofEarth', hoof('earth'), 'steps');
registerSfx('bufHoofMud', hoof('mud'), 'steps');
registerSfx('bufHoofHard', hoof('hard'), 'steps');

// Wading (`gain`: how deep, 0‥1): the leg pushing through the water, a slow slosh, the drip as it lifts.
registerSfx(
  'bufWade',
  (o, gain, t) => {
    const r = o.rnd;
    const k = range(r, 0.85, 1.1);
    const L = 1.05 * (0.35 + 0.65 * gain);
    burst(o, t, { kind: 'brown', type: 'lowpass', f0: 800 * k, f1: 260 * k, q: 0.7, hp: 90, attack: 0.05, tau: 0.12, dur: 0.3, level: L, pan: range(r, -0.3, 0.3), wet: 0.1 });
    burst(o, t + 0.04, { kind: 'pink', type: 'bandpass', f0: 1400 * k, f1: 700 * k, q: 0.8, attack: 0.04, tau: 0.08, level: L * 0.25, wet: 0.1 });
    tone(o, t + 0.02, { f0: 170 * k, f1: 90 * k, glide: 0.1, attack: 0.01, tau: 0.06, level: L * 0.05, wet: 0.05 });
    drops(o, t + range(r, 0.25, 0.4), 1 + Math.floor(r() * 3), 0.3, L * 0.02);
  },
  'steps',
);

// Plunging in off a bank (`gain`: how hard): a heavy splash, the water thrown up and raining back.
registerSfx(
  'bufSplash',
  (o, gain, t) => {
    const L = 0.85 * (0.4 + 0.6 * gain);
    burst(o, t, { kind: 'white', type: 'lowpass', f0: 4200, f1: 600, q: 0.7, attack: 0.004, tau: 0.16, dur: 0.4, level: L, wet: 0.15 });
    burst(o, t, { kind: 'brown', type: 'lowpass', f0: 500, f1: 200, q: 0.7, attack: 0.01, tau: 0.14, level: L * 1.4, wet: 0.08 });
    tone(o, t + 0.01, { f0: 200, f1: 70, glide: 0.12, attack: 0.005, tau: 0.07, level: L * 0.15, wet: 0.05 });
    drops(o, t + 0.1, 6 + Math.floor(8 * gain), 0.9, L * 0.09);
  },
  'steps',
);

/** The voice: a sawtooth through the nose (a band that opens "mm" to "oo"), its breath through the same envelope. */
function voice(o: SfxOut, t: number, dur: number, f: number, level: number, open: number): void {
  const ctx = o.ctx;
  const r = o.rnd;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(f * 0.93, t);
  osc.frequency.linearRampToValueAtTime(f * 1.04, t + dur * 0.35);
  osc.frequency.linearRampToValueAtTime(f * 0.9, t + dur);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(level * 0.8, t + Math.min(0.2, dur * 0.25));
  env.gain.linearRampToValueAtTime(level, t + dur * 0.45);
  env.gain.linearRampToValueAtTime(level * 0.7, t + dur * 0.85);
  env.gain.linearRampToValueAtTime(0, t + dur);
  const nose = biquad(ctx, 'bandpass', 300, 1.6);
  nose.frequency.setValueAtTime(260, t);
  nose.frequency.linearRampToValueAtTime(260 + 260 * open, t + dur * 0.45);
  nose.frequency.linearRampToValueAtTime(320, t + dur);
  // (soft: the lows and the nose only, no bright edge)
  const low = biquad(ctx, 'lowpass', 700, 0.7);
  const lowGain = ctx.createGain();
  lowGain.gain.value = 0.5;
  const breath = ctx.createBufferSource();
  breath.buffer = noise('pink');
  const bf = biquad(ctx, 'lowpass', 500, 0.7);
  const bg = ctx.createGain();
  bg.gain.value = 0.5;
  osc.connect(env);
  breath.connect(bf).connect(bg).connect(env);
  env.connect(nose);
  env.connect(low).connect(lowGain);
  const made = [...send(o, nose, 0, 0.12), ...send(o, lowGain, 0, 0.12)];
  osc.start(t);
  osc.stop(t + dur + 0.05);
  breath.start(t, r() * 2);
  breath.stop(t + dur + 0.05);
  osc.onended = () => {
    for (const n of [osc, env, nose, low, lowGain, breath, bf, bg, ...made]) n.disconnect();
  };
}

// The low, soft "mmmh" of a content buffalo (`gain` 0‥1).
registerSfx(
  'bufMoo',
  (o, gain, t) => {
    const r = o.rnd;
    voice(o, t, range(r, 1.2, 1.7), range(r, 74, 88), VOICE * gain, range(r, 0.6, 1));
  },
  'animals',
);

// Heaving itself up off the ground (or up a bank): a short low grunt, the breath pushed out.
registerSfx(
  'bufGrunt',
  (o, gain, t) => {
    const r = o.rnd;
    voice(o, t, range(r, 0.32, 0.45), range(r, 66, 76), VOICE * 0.9 * gain, 0.3);
    burst(o, t + 0.02, { kind: 'pink', type: 'bandpass', f0: 600, f1: 350, q: 0.8, attack: 0.02, tau: 0.1, level: 0.25 * gain, wet: 0.05 });
  },
  'animals',
);

// A snort: air blown out through the nose.
registerSfx(
  'bufSnort',
  (o, gain, t) => {
    const r = o.rnd;
    burst(o, t, { kind: 'pink', type: 'bandpass', f0: range(r, 700, 900), f1: 420, q: 1.1, attack: 0.012, tau: 0.09, dur: 0.25, level: 0.5 * gain, wet: 0.06 });
    burst(o, t + 0.01, { kind: 'brown', type: 'lowpass', f0: 380, q: 0.7, attack: 0.02, tau: 0.08, level: 0.6 * gain, wet: 0.04 });
  },
  'animals',
);
