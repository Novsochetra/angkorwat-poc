import { registerSfx, type SfxOut } from './addonSfx';
import { biquad, noise, range, source, strike, type NoiseKind } from './dsp';

/**
 * The white ox he rides (roam/_cowRide.ts), all synthesized: its hooves
 * (lighter and sharper than the water buffalo's, audio/_buffalo.ts: a lean
 * ox on long legs, its cloven hooves knocking: a low thud under its weight
 * and what the hoof meets: grass brushing, dry earth's grit, the wet suck of
 * mud, the road's stone), wading in the shallows, the splash stepping in, a
 * soft low "mmmoo" (higher than the buffalo's "mmmh", gentle: a content cow
 * close by), the short grunt as it heaves itself up, a soft blow through the
 * nose. Its wooden bell is the village cattle's own (`cowBell`, audio/life.ts),
 * rung through the map's calls with its steps.
 *
 * Levels (as the buffalo's, measured the same way): a hoof on grass or earth
 * some 5 dB under one of his own footsteps (audio/explorer.ts), on stone a
 * short knock as loud; wading as loud as his step in the water; the voice as
 * soft as the herd's calls close by (audio/animals.ts). The steps and the
 * water are on the Steps slider, the voice on Animals.
 */

/** The hooves' thud (pink noise in a low band) and the pulse under it: lighter than the buffalo's 2.6. */
const HOOF = 2.2;
/** The low and the grunt, at the animals' levels close by (as the buffalo's). */
const VOICE = 0.15;

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
    const f0 = 650 * 4 ** (r() ** 1.2);
    const tau = range(r, 0.008, 0.02);
    tone(o, t + spread * r() ** 1.5, { f0, f1: f0 * range(r, 1.3, 1.8), glide: tau * 3, attack: 0.0015, tau, level: level * (0.4 + 0.6 * r()), pan: range(r, -0.3, 0.3), wet: 0.12 });
  }
}

/** The weight coming down on a hoof: a thud and the pulse under it (`g` 0‥1: how hard; `pan` the leg's side). Lighter and a little higher than the buffalo's. */
function thud(o: SfxOut, t: number, g: number, k: number, pan: number): void {
  const L = HOOF * g;
  burst(o, t, { kind: 'pink', type: 'bandpass', f0: 280 * k, f1: 160 * k, q: 1, hp: 110, attack: 0.005, tau: 0.035, dur: 0.07, level: L, pan, wet: 0.03 });
  tone(o, t, { f0: 120 * k, f1: 60 * k, glide: 0.05, attack: 0.003, tau: 0.04, level: L * 0.1, pan, wet: 0.02 });
}

type Hoof = 'grass' | 'earth' | 'mud' | 'hard';

function hoof(kind: Hoof) {
  return (o: SfxOut, gain: number, t: number) => {
    const r = o.rnd;
    const k = range(r, 0.92, 1.1);
    const g = gain * range(r, 0.8, 1);
    const pan = range(r, -0.25, 0.25);
    thud(o, t, g, k, pan);
    const L = HOOF * g;
    switch (kind) {
      case 'grass':
        // The blades brushing round the hoof as it comes down, and again as it lifts.
        burst(o, t, { kind: 'pink', type: 'bandpass', f0: 2100 * k, f1: 1200 * k, q: 0.7, attack: 0.015, tau: 0.04, level: L * 0.2, pan, wet: 0.03 });
        burst(o, t + range(r, 0.14, 0.2), { kind: 'pink', type: 'bandpass', f0: 2500 * k, q: 0.8, attack: 0.025, tau: 0.035, level: L * 0.09, pan, wet: 0.03 });
        break;
      case 'earth':
        // Dry earth: the hoof's edge knocks, and the grit crunches under it.
        burst(o, t, { kind: 'pink', type: 'bandpass', f0: 1300 * k, f1: 900 * k, q: 1.2, attack: 0.002, tau: 0.012, level: L * 0.22, pan, wet: 0.04 });
        burst(o, t + 0.004, { buf: source('crunch'), type: 'lowpass', f0: 1800 * k, f1: 1000 * k, q: 0.5, attack: 0.01, tau: 0.035, dur: 0.09, level: L * 0.28, pan, wet: 0.03 });
        break;
      case 'mud':
        // Mud (the water's edge, a wet paddy): the hoof sinks in with a squelch, then sucks out of it.
        burst(o, t, { kind: 'brown', type: 'lowpass', f0: 800 * k, f1: 300 * k, q: 0.8, attack: 0.01, tau: 0.05, dur: 0.1, level: L * 0.36, pan, wet: 0.04 });
        burst(o, t + range(r, 0.16, 0.22), { kind: 'pink', type: 'bandpass', f0: 700 * k, f1: 1600 * k, q: 2.2, attack: 0.025, tau: 0.035, dur: 0.08, level: L * 0.2, pan, wet: 0.04 });
        break;
      case 'hard':
        // The road's stone or a hard path: a clop, the two halves of the hoof knocking.
        burst(o, t, { kind: 'pink', type: 'bandpass', f0: 1150 * k, f1: 800 * k, q: 1.1, attack: 0.0015, tau: 0.012, level: L * 0.5, pan, wet: 0.08 });
        burst(o, t + range(r, 0.012, 0.022), { kind: 'pink', type: 'bandpass', f0: 1500 * k, q: 1.4, attack: 0.001, tau: 0.008, level: L * 0.22, pan, wet: 0.08 });
        break;
    }
  };
}

registerSfx('cowHoofGrass', hoof('grass'), 'steps');
registerSfx('cowHoofEarth', hoof('earth'), 'steps');
registerSfx('cowHoofMud', hoof('mud'), 'steps');
registerSfx('cowHoofHard', hoof('hard'), 'steps');

// Wading (`gain`: how deep, 0‥1): the leg pushing through the water, a slosh, the drip as it lifts.
registerSfx(
  'cowWade',
  (o, gain, t) => {
    const r = o.rnd;
    const k = range(r, 0.9, 1.15);
    const L = 0.9 * (0.35 + 0.65 * gain);
    burst(o, t, { kind: 'brown', type: 'lowpass', f0: 900 * k, f1: 300 * k, q: 0.7, hp: 100, attack: 0.04, tau: 0.1, dur: 0.25, level: L, pan: range(r, -0.3, 0.3), wet: 0.1 });
    burst(o, t + 0.03, { kind: 'pink', type: 'bandpass', f0: 1600 * k, f1: 800 * k, q: 0.8, attack: 0.03, tau: 0.07, level: L * 0.25, wet: 0.1 });
    drops(o, t + range(r, 0.2, 0.35), 1 + Math.floor(r() * 3), 0.3, L * 0.02);
  },
  'steps',
);

// Stepping into the water off the bank (`gain`: how deep it goes): a splash, the water thrown up and falling back.
registerSfx(
  'cowSplash',
  (o, gain, t) => {
    const L = 0.7 * (0.4 + 0.6 * gain);
    burst(o, t, { kind: 'white', type: 'lowpass', f0: 4500, f1: 700, q: 0.7, attack: 0.004, tau: 0.13, dur: 0.35, level: L, wet: 0.15 });
    burst(o, t, { kind: 'brown', type: 'lowpass', f0: 550, f1: 220, q: 0.7, attack: 0.01, tau: 0.11, level: L * 1.2, wet: 0.08 });
    drops(o, t + 0.08, 5 + Math.floor(6 * gain), 0.8, L * 0.09);
  },
  'steps',
);

/** The voice: a sawtooth through the nose (a band that opens "mm" to "oo"), its breath through the same envelope. */
function voice(o: SfxOut, t: number, dur: number, f: number, level: number, open: number): void {
  const ctx = o.ctx;
  const r = o.rnd;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  // (a cow's low: up a little as it opens, then sliding down)
  osc.frequency.setValueAtTime(f * 0.92, t);
  osc.frequency.linearRampToValueAtTime(f * 1.06, t + dur * 0.3);
  osc.frequency.linearRampToValueAtTime(f * 0.86, t + dur);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(level * 0.7, t + Math.min(0.18, dur * 0.2));
  env.gain.linearRampToValueAtTime(level, t + dur * 0.4);
  env.gain.linearRampToValueAtTime(level * 0.75, t + dur * 0.8);
  env.gain.linearRampToValueAtTime(0, t + dur);
  const nose = biquad(ctx, 'bandpass', 320, 1.6);
  nose.frequency.setValueAtTime(300, t);
  nose.frequency.linearRampToValueAtTime(330 + 330 * open, t + dur * 0.4);
  nose.frequency.linearRampToValueAtTime(360, t + dur);
  // (soft: the lows and the nose only, no bright edge)
  const low = biquad(ctx, 'lowpass', 800, 0.7);
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
  const made = [...send(o, nose, 0, 0.12), ...send(o, lowGain, 0, 0.12)];
  osc.start(t);
  osc.stop(t + dur + 0.05);
  breath.start(t, r() * 2);
  breath.stop(t + dur + 0.05);
  osc.onended = () => {
    for (const n of [osc, env, nose, low, lowGain, breath, bf, bg, ...made]) n.disconnect();
  };
}

// The soft low of a content cow (`gain` 0‥1): "mmmoo".
registerSfx(
  'cowMoo',
  (o, gain, t) => {
    const r = o.rnd;
    voice(o, t, range(r, 1.0, 1.5), range(r, 98, 118), VOICE * gain, range(r, 0.7, 1));
  },
  'animals',
);

// Heaving itself up off the ground (with him on it): a short low grunt, the breath pushed out.
registerSfx(
  'cowGrunt',
  (o, gain, t) => {
    const r = o.rnd;
    voice(o, t, range(r, 0.28, 0.4), range(r, 80, 92), VOICE * 0.9 * gain, 0.3);
    burst(o, t + 0.02, { kind: 'pink', type: 'bandpass', f0: 650, f1: 380, q: 0.8, attack: 0.02, tau: 0.09, level: 0.22 * gain, wet: 0.05 });
  },
  'animals',
);

// A soft blow through the nose.
registerSfx(
  'cowSnort',
  (o, gain, t) => {
    const r = o.rnd;
    burst(o, t, { kind: 'pink', type: 'bandpass', f0: range(r, 800, 1000), f1: 480, q: 1.1, attack: 0.012, tau: 0.075, dur: 0.22, level: 0.42 * gain, wet: 0.06 });
    burst(o, t + 0.01, { kind: 'brown', type: 'lowpass', f0: 420, q: 0.7, attack: 0.02, tau: 0.07, level: 0.5 * gain, wet: 0.04 });
  },
  'animals',
);
