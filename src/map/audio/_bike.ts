import { registerLoop, registerSfx, type SfxOut } from './addonSfx';
import { biquad, noise, range, source } from './dsp';
import { Voice } from './voice';

/**
 * The bicycle's sounds (roam/_bike.ts), made here with the Web Audio API as
 * the explorer's own are (audio/explorer.ts), each a little different every
 * time:
 *
 * - `bikeBell`: the thumb bell, "kring-kring": its striker flicked across
 *   the brass dome twice, a quick run of strikes each, the dome ringing on;
 * - `bikeStand`: the side stand flipped up or kicked down, a steel clack and
 *   the bicycle settling;
 * - `bikeBump`: over a step or a root: a dull thud of the tyres, the basket,
 *   the rack and the mudguards rattling, the bell's striker touching the dome;
 * - `bikeBrake`: an old rim brake squealing a little when he stops hard;
 * - `bikeFree` (lasting): the back hub's freewheel ticking as he coasts,
 *   faster as it rolls faster (the add-on sets the level from the speed);
 * - `bikeChain` (lasting): the chain running over the sprockets as he
 *   pedals, a soft clack each push of a pedal (the level is the cadence);
 * - `bikeDirt`, `bikeGrass`, `bikeStone` (lasting, on the footsteps' bus):
 *   the tyres rolling on earth and gravel, swishing through grass, humming
 *   on stone, paving and planks (the add-on crossfades them by the ground,
 *   each level the speed).
 *
 * Levels sit under his footsteps: the tyres about as loud as walking, the
 * chain and the freewheel under them, the bell a clear ring over the rest.
 */

/** Peak levels (before the bus's volume). */
const LEVEL = {
  bell: 0.14,
  stand: 0.6,
  bump: 0.75,
  brake: 0.055,
  free: 6.2,
  chain: 0.3,
  dirt: 0.2,
  grass: 0.28,
  stone: 0.2,
};
/** Fastest freewheel ticks (a second) and turns of the pedals a second at the lasting sounds' level 1. */
const TICKS = 46;
const CADENCE = 2.4;
/** A lasting sound silent this long stops its sources (ms); the next sound makes them again. */
const IDLE = 4000;

/** A sound's voice into the bus (dry, and `wet` of it to the reverb). */
function voice(o: SfxOut, level: number, wet: number): Voice {
  const v = new Voice(o.ctx, o.rnd);
  v.out.gain.value = level;
  v.out.connect(o.dry);
  if (wet > 0) v.out.connect(v.gain(wet)).connect(o.wet);
  return v;
}

/** A struck level: up to `peak` in `a` s, then dying with time constant `tau`. */
function hit(p: AudioParam, t: number, peak: number, a: number, tau: number): void {
  p.setTargetAtTime(peak, t, Math.max(0.0003, a / 3));
  p.setTargetAtTime(0, t + a, tau);
}

// ── The bell ───────────────────────────────────────────────────────────────

/** The dome's modes: (ratio, level, decay s): a pair a hair apart (the beat), and the brighter, quicker ones over them. */
const DOME: readonly (readonly [number, number, number])[] = [
  [1, 1, 0.55],
  [1.0031, 0.75, 0.6],
  [1.6, 0.45, 0.32],
  [2.43, 0.32, 0.18],
  [3.32, 0.14, 0.1],
];

registerSfx('bikeBell', (o, gain, t) => {
  const r = o.rnd;
  const end = t + 2.2;
  const v = voice(o, LEVEL.bell * (0.6 + 0.4 * gain), 0.12);
  const f = range(r, 2950, 3150);
  const modes = DOME.map(([ratio, amp, tau]) => {
    const osc = v.osc('sine', t, end, f * ratio);
    const g = v.gain();
    osc.connect(g).connect(v.out);
    return { g, amp, tau };
  });
  // (the striker's tick on each flick: a little noise in a high band)
  const click = v.gain();
  v.noise('white', t, end).connect(v.filter('bandpass', 5600, 1.6)).connect(click).connect(v.out);
  // "Kring-kring": two flicks of the thumb, each a quick run of strikes (louder at first).
  let s = t;
  for (let ring = 0; ring < 2; ring++) {
    const rate = range(r, 19, 24);
    const hits = 5 + Math.floor(r() * 3);
    for (let i = 0; i < hits; i++) {
      const at = s + i / rate + range(r, -0.003, 0.003);
      const k = (0.55 + 0.3 * r()) * (1 - (0.35 * i) / hits) * (ring ? 0.88 : 1);
      for (const m of modes) hit(m.g.gain, at, m.amp * k, 0.0015, m.tau * (i < hits - 1 ? 0.35 : 1));
      hit(click.gain, at, 0.4 * k, 0.0008, 0.004);
    }
    s += hits / rate + range(r, 0.09, 0.14);
  }
  v.play();
});

// ── The stand, a bump, the brake ───────────────────────────────────────────

/** A short burst of noise of `kind` through a `type` filter at `f`. */
function burst(v: Voice, t: number, kind: 'white' | 'pink' | 'brown', type: BiquadFilterType, f: number, q: number, peak: number, a: number, tau: number): void {
  const g = v.gain();
  v.noise(kind, t, t + a + tau * 6).connect(v.filter(type, f, q)).connect(g).connect(v.out);
  hit(g.gain, t, peak, a, tau);
}

/** A struck tone (a bit of steel ringing). */
function ping(v: Voice, t: number, f: number, peak: number, tau: number): void {
  const g = v.gain();
  v.osc('sine', t, t + tau * 7, f).connect(g).connect(v.out);
  hit(g.gain, t, peak, 0.001, tau);
}

registerSfx('bikeStand', (o, gain, t) => {
  const r = o.rnd;
  const v = voice(o, LEVEL.stand * (0.5 + 0.5 * gain), 0.05);
  // The steel leg against its stop: a clack and a short ring; the bicycle's weight settling on it.
  burst(v, t, 'white', 'bandpass', range(r, 2000, 2600), 1.4, 0.5, 0.001, 0.012);
  ping(v, t, range(r, 1350, 1550), 0.05, 0.03);
  ping(v, t + 0.002, range(r, 2900, 3300), 0.025, 0.018);
  burst(v, t + range(r, 0.05, 0.08), 'white', 'bandpass', range(r, 1700, 2100), 1.2, 0.18, 0.001, 0.01);
  burst(v, t + 0.01, 'brown', 'lowpass', 260, 0.7, 0.9, 0.006, 0.05);
  v.play();
});

registerSfx('bikeBump', (o, gain, t) => {
  const r = o.rnd;
  const v = voice(o, LEVEL.bump * (0.25 + 0.75 * gain), 0.04);
  // The tyres' thud.
  burst(v, t, 'brown', 'lowpass', range(r, 220, 300), 0.7, 1, 0.005, 0.06);
  // The basket, the rack and the mudguards rattling: a few quick ticks.
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) burst(v, t + 0.012 + i * range(r, 0.022, 0.04), 'white', 'bandpass', range(r, 1800, 3600), 2, (0.25 + 0.2 * r()) * (1 - i / (n + 1)), 0.001, 0.008);
  // Now and then the bell's striker touches the dome.
  if (gain > 0.5 && r() < 0.5) ping(v, t + 0.02, range(r, 2950, 3150), 0.012 * gain, 0.25);
  v.play();
});

registerSfx('bikeBrake', (o, gain, t) => {
  const r = o.rnd;
  const len = 0.25 + 0.35 * gain;
  const v = voice(o, LEVEL.brake * (0.5 + 0.5 * gain), 0.1);
  // The rubber pads on the steel rims: a thin squeal with a waver, and the pads' scrape under it.
  const f = range(r, 1900, 2350);
  const osc = v.osc('triangle', t, t + len + 0.2, f);
  v.lfo(osc.frequency, range(r, 7, 11), f * 0.012, t, t + len + 0.2);
  const g = v.gain();
  osc.connect(v.filter('bandpass', f, 3)).connect(g).connect(v.out);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(1, t + 0.06);
  g.gain.setTargetAtTime(0.6, t + 0.06, 0.15);
  g.gain.setTargetAtTime(0, t + len, 0.06);
  const sg = v.gain();
  v.noise('pink', t, t + len + 0.2).connect(v.filter('bandpass', 3200, 1.2)).connect(sg).connect(v.out);
  sg.gain.setValueAtTime(0, t);
  sg.gain.linearRampToValueAtTime(2.2, t + 0.04);
  sg.gain.setTargetAtTime(0, t + len * 0.7, 0.08);
  v.play();
});

// ── The lasting sounds ─────────────────────────────────────────────────────

/**
 * A lasting sound whose sources stop after `IDLE` ms of silence and are made
 * again by the next level over 0: `make` builds the sources and nodes into
 * `env` (its level gain) and returns `set` (how it sounds at a level) and
 * the sources to stop.
 */
function lasting(make: (o: SfxOut, env: GainNode) => { set(v: number, t: number): void; sources: AudioScheduledSourceNode[]; nodes: AudioNode[] }) {
  return (o: SfxOut) => {
    let made: ReturnType<typeof make> | null = null;
    let env: GainNode | null = null;
    let timer = 0;
    return {
      level(v: number, t: number) {
        clearTimeout(timer);
        if (v > 0 && !made) {
          env = o.ctx.createGain();
          env.gain.value = 0;
          env.connect(o.dry);
          made = make(o, env);
        }
        if (!made || !env) return;
        made.set(v, t);
        if (v <= 0) {
          const was = made;
          const e = env;
          timer = window.setTimeout(() => {
            if (made !== was) return;
            for (const s of was.sources) s.stop();
            for (const n of was.nodes) n.disconnect();
            e.disconnect();
            made = null;
            env = null;
          }, IDLE);
        }
      },
    };
  };
}

/** A looping buffer source started now, at a random point of it. */
function loop(o: SfxOut, buf: AudioBuffer, rate = 1): AudioBufferSourceNode {
  const s = o.ctx.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  s.playbackRate.value = rate;
  s.start(o.ctx.currentTime, o.rnd() * buf.duration);
  return s;
}

/** A periodic wave of narrow clicks (the freewheel's pawls, the chain's links): many harmonics, all equal. */
const clicks = new WeakMap<BaseAudioContext, PeriodicWave>();
function clickWave(ctx: BaseAudioContext): PeriodicWave {
  let w = clicks.get(ctx);
  if (!w) {
    // (enough harmonics that the slowest ticks, a few a second, still reach the steel's ring at 4–7 kHz)
    const n = 4096;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) real[k] = 1;
    w = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    clicks.set(ctx, w);
  }
  return w;
}

registerLoop(
  'bikeFree',
  lasting((o, env) => {
    // The pawls ticking over the ratchet: a train of clicks ringing a small steel body (two bands).
    const ctx = o.ctx;
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(clickWave(ctx));
    osc.frequency.value = 10;
    const hp = biquad(ctx, 'highpass', 1800, 0.7);
    const band = biquad(ctx, 'bandpass', range(o.rnd, 3800, 4400), 7);
    const ring = biquad(ctx, 'bandpass', range(o.rnd, 6800, 7600), 9);
    const mix = ctx.createGain();
    mix.gain.value = 0.6;
    osc.connect(hp);
    hp.connect(band).connect(env);
    hp.connect(ring).connect(mix).connect(env);
    osc.start();
    return {
      set(v, t) {
        // (faster as it rolls faster, and a little louder; very slow it stops: the level is 0. The wave's clicks
        // carry less the more of them there are a second: the gain makes up for it, each tick as loud.)
        const rate = 3 + TICKS * v;
        osc.frequency.setTargetAtTime(rate, t, 0.05);
        env.gain.setTargetAtTime(v > 0 ? LEVEL.free * (rate / 20) * (0.55 + 0.45 * v) : 0, t, v > 0 ? 0.03 : 0.08);
      },
      sources: [osc],
      nodes: [osc, hp, band, ring, mix],
    };
  }),
);

registerLoop(
  'bikeChain',
  lasting((o, env) => {
    // The chain over the teeth: a soft, grainy whirr (the links), beating with each push of a pedal.
    const ctx = o.ctx;
    const links = ctx.createOscillator();
    links.setPeriodicWave(clickWave(ctx));
    links.frequency.value = 40;
    const lb = biquad(ctx, 'bandpass', 2600, 1.3);
    const lg = ctx.createGain();
    lg.gain.value = 0.35;
    const hiss = loop(o, noise('pink'));
    const hb = biquad(ctx, 'bandpass', 1500, 0.9);
    const beat = ctx.createGain();
    beat.gain.value = 0.7;
    const push = ctx.createOscillator();
    push.frequency.value = 2;
    const depth = ctx.createGain();
    depth.gain.value = 0.3;
    push.connect(depth).connect(beat.gain);
    links.connect(lb).connect(lg).connect(beat);
    hiss.connect(hb).connect(beat);
    beat.connect(env);
    links.start();
    push.start();
    return {
      set(v, t) {
        const cad = CADENCE * v;
        // (44 teeth on the big sprocket: the links pass that many a turn of the pedals; two pushes a turn)
        links.frequency.setTargetAtTime(Math.max(4, 44 * cad), t, 0.08);
        push.frequency.setTargetAtTime(Math.max(0.5, 2 * cad), t, 0.08);
        hb.frequency.setTargetAtTime(1100 + 900 * v, t, 0.1);
        env.gain.setTargetAtTime(v > 0 ? LEVEL.chain * Math.min(1, 0.4 + 0.8 * v) : 0, t, v > 0 ? 0.06 : 0.1);
      },
      sources: [links, hiss, push],
      nodes: [links, lb, lg, hiss, hb, beat, push, depth],
    };
  }),
);

registerLoop(
  'bikeDirt',
  lasting((o, env) => {
    // Earth and gravel under the tyres: grit crunching (faster as it rolls faster) over a low rumble.
    const ctx = o.ctx;
    const grit = loop(o, source('crunch'), 0.7);
    const gb = biquad(ctx, 'bandpass', 1500, 0.8);
    const rum = loop(o, noise('brown'));
    const lp = biquad(ctx, 'lowpass', 220, 0.7);
    const low = ctx.createGain();
    low.gain.value = 1.2;
    grit.connect(gb).connect(env);
    rum.connect(lp).connect(low).connect(env);
    return {
      set(v, t) {
        grit.playbackRate.setTargetAtTime(0.45 + 0.9 * v, t, 0.1);
        gb.frequency.setTargetAtTime(1100 + 1300 * v, t, 0.1);
        env.gain.setTargetAtTime(LEVEL.dirt * v ** 0.8, t, 0.08);
      },
      sources: [grit, rum],
      nodes: [grit, gb, rum, lp, low],
    };
  }),
  'steps',
);

registerLoop(
  'bikeGrass',
  lasting((o, env) => {
    // Through grass: the blades swishing on the spokes and the tyres, a soft flutter.
    const ctx = o.ctx;
    const sw = loop(o, noise('pink'));
    const hp = biquad(ctx, 'highpass', 2200, 0.7);
    const lp = biquad(ctx, 'lowpass', 6500, 0.7);
    const flutter = ctx.createGain();
    flutter.gain.value = 0.75;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = range(o.rnd, 6, 9);
    const depth = ctx.createGain();
    depth.gain.value = 0.25;
    lfo.connect(depth).connect(flutter.gain);
    lfo.start();
    const rum = loop(o, noise('brown'));
    const rl = biquad(ctx, 'lowpass', 160, 0.7);
    const low = ctx.createGain();
    low.gain.value = 0.6;
    sw.connect(hp).connect(lp).connect(flutter).connect(env);
    rum.connect(rl).connect(low).connect(env);
    return {
      set(v, t) {
        lfo.frequency.setTargetAtTime(5 + 7 * v, t, 0.1);
        hp.frequency.setTargetAtTime(1800 + 1200 * v, t, 0.1);
        env.gain.setTargetAtTime(LEVEL.grass * v ** 0.9, t, 0.08);
      },
      sources: [sw, lfo, rum],
      nodes: [sw, hp, lp, flutter, lfo, depth, rum, rl, low],
    };
  }),
  'steps',
);

registerLoop(
  'bikeStone',
  lasting((o, env) => {
    // On stone, paving and planks: the tyres' low hum and a faint hiss.
    const ctx = o.ctx;
    const hum = loop(o, noise('brown'));
    const hl = biquad(ctx, 'lowpass', 380, 0.9);
    const hiss = loop(o, noise('white'));
    const hb = biquad(ctx, 'bandpass', 4200, 1.2);
    const hg = ctx.createGain();
    hg.gain.value = 0.07;
    hum.connect(hl).connect(env);
    hiss.connect(hb).connect(hg).connect(env);
    return {
      set(v, t) {
        hl.frequency.setTargetAtTime(260 + 320 * v, t, 0.1);
        env.gain.setTargetAtTime(LEVEL.stone * v ** 0.8, t, 0.08);
      },
      sources: [hum, hiss],
      nodes: [hum, hl, hiss, hb, hg],
    };
  }),
  'steps',
);
