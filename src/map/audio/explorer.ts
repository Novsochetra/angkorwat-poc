import type { RoamSound } from '../types';
import { biquad, glide, mtof, noise, range, source, strike, type NoiseKind, type Rng } from './dsp';
import type { SoundEngine } from './engine';

/**
 * The roaming explorer's sounds, on the effects bus: footsteps, the jump
 * and the landing, the parachute snapping open and folding away, splashes,
 * the paddle, stepping into and out of the boat, and a soft temple bell on
 * entering a place. Lasting: rushing air while falling or gliding, and the
 * water along the boat's hull.
 *
 * Roaming puts the ears at the explorer's head, so his sounds sit in the
 * middle, a little to either side. Every one varies a little each time.
 */

/** Peak levels (before the effects volume). */
const LEVEL = {
  step: 1.5,
  jump: 1,
  land: 1.2,
  chute: 1.6,
  splash: 1.1,
  paddle: 1,
  knock: 0.45,
  bell: 0.15,
  wind: 0.85,
  wake: 0.24,
};
/** Steps closer together than this are one step (s). */
const STEP_GAP = 0.09;
/** A lasting sound silent this long stops its sources (s). */
const IDLE = 4;

interface Burst {
  kind?: NoiseKind;
  type: BiquadFilterType;
  /** Filter frequency, sliding from `f0` to `f1` over `dur`. */
  f0: number;
  f1?: number;
  q?: number;
  attack: number;
  /** Decay time constant after the attack (s). */
  tau: number;
  /** Length of the slide (default: the whole sound). */
  dur?: number;
  level: number;
  pan?: number;
  wet?: number;
}

interface Tone {
  f0: number;
  f1?: number;
  /** Time of the pitch slide (s). */
  glide?: number;
  attack: number;
  tau: number;
  level: number;
  type?: OscillatorType;
  pan?: number;
  wet?: number;
}

/** A lasting sound: nodes made when first wanted, sources stopped when silent a while. */
interface Lasting {
  env: GainNode;
  tone: BiquadFilterNode;
  low: GainNode;
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  level: number;
  quietSince: number;
}

export class Explorer {
  private readonly e: SoundEngine;
  private readonly ctx: BaseAudioContext;
  private readonly rnd: Rng;
  private lastStep = -1;
  /** Which foot / which side of the boat (±1). */
  private foot = 1;
  private stroke = 1;
  private wind: Lasting | null = null;
  private wake: Lasting | null = null;

  constructor(e: SoundEngine) {
    this.e = e;
    this.ctx = e.ctx;
    this.rnd = e.rnd;
  }

  play(s: RoamSound, g: number, t: number): void {
    const r = this.rnd;
    switch (s) {
      case 'step': {
        if (t - this.lastStep < STEP_GAP) return;
        this.lastStep = t;
        const pan = (this.foot = -this.foot) * range(r, 0.04, 0.12);
        const k = range(r, 0.82, 1.2);
        const v = g * range(r, 0.75, 1);
        // Heel: a soft low thump; sole: a short scuff on earth, and a little grit crunching.
        this.tone(t, { f0: 115 * k, f1: 62 * k, glide: 0.05, attack: 0.002, tau: 0.028, level: LEVEL.step * 0.1 * v, pan, wet: 0.03 });
        this.burst(t + 0.004, { kind: 'pink', type: 'bandpass', f0: 900 * k, f1: 520 * k, q: 0.8, attack: 0.004, tau: 0.035, level: LEVEL.step * v, pan, wet: 0.04 });
        this.grit(t + 0.01, 1 + Math.floor(r() * 3), 0.05, LEVEL.step * 0.25 * v, pan);
        return;
      }
      case 'jump':
        // Push-off, then air past the body as it rises.
        this.burst(t, { kind: 'pink', type: 'bandpass', f0: 1100, f1: 700, q: 0.8, attack: 0.003, tau: 0.04, level: LEVEL.jump * g, wet: 0.05 });
        this.burst(t + 0.02, { kind: 'pink', type: 'bandpass', f0: 380, f1: 1200, q: 1.1, attack: 0.09, tau: 0.09, dur: 0.3, level: LEVEL.jump * 0.6 * g, pan: range(r, -0.1, 0.1), wet: 0.1 });
        return;
      case 'land': {
        // A thud as heavy as the fall: the body's weight, the feet, grit thrown about.
        const s = 0.35 + 0.65 * g;
        this.tone(t, { f0: 90, f1: 48, glide: 0.1, attack: 0.003, tau: 0.035 + 0.035 * g, level: LEVEL.land * 0.3 * s, wet: 0.06 });
        this.burst(t, { kind: 'pink', type: 'lowpass', f0: 1400, f1: 300, q: 0.6, attack: 0.002, tau: 0.04 + 0.06 * g, dur: 0.2, level: LEVEL.land * 1.6 * s, wet: 0.05 });
        this.burst(t + 0.01, { kind: 'pink', type: 'bandpass', f0: 1000, f1: 600, q: 0.8, attack: 0.004, tau: 0.06, level: LEVEL.land * 2 * s });
        if (g > 0.35) this.grit(t + 0.02, 3 + Math.floor(6 * g), 0.25, LEVEL.land * 0.4 * s, 0);
        return;
      }
      case 'chuteOpen':
        // The canopy catches the air with a deep "whump"…
        this.burst(t, { kind: 'pink', type: 'bandpass', f0: 520, f1: 300, q: 0.8, attack: 0.012, tau: 0.09, level: LEVEL.chute * 1.6, wet: 0.12 });
        this.tone(t + 0.01, { f0: 95, f1: 58, glide: 0.1, attack: 0.006, tau: 0.08, level: LEVEL.chute * 0.12, wet: 0.05 });
        // …snaps taut: two cracks of cloth…
        this.burst(t + 0.045, { kind: 'white', type: 'bandpass', f0: 1700, q: 1.3, attack: 0.001, tau: 0.018, level: LEVEL.chute * 0.5, pan: -0.12, wet: 0.1 });
        this.burst(t + 0.085, { kind: 'white', type: 'bandpass', f0: 2300, q: 1.5, attack: 0.001, tau: 0.012, level: LEVEL.chute * 0.3, pan: 0.15, wet: 0.1 });
        // …and flutters as it settles.
        this.flutter(t + 0.07, 800, 600, 16, 9, 0.8, LEVEL.chute * 0.8);
        return;
      case 'chuteClose':
        // The canopy spills its air and folds down, flapping slower and slower.
        this.flutter(t, 650, 380, 11, 4, 0.9, LEVEL.chute * 0.85);
        this.burst(t + 0.55, { kind: 'pink', type: 'lowpass', f0: 700, q: 0.5, attack: 0.03, tau: 0.12, level: LEVEL.chute * 0.4, wet: 0.08 });
        return;
      case 'splash': {
        const s = 0.3 + 0.7 * g;
        // The hit (duller as the water closes), a low "bloop", spray falling back, bubbles.
        this.burst(t, { kind: 'white', type: 'lowpass', f0: 5000, f1: 700, q: 0.7, attack: 0.003, tau: 0.13, dur: 0.35, level: LEVEL.splash * s, wet: 0.15 });
        this.tone(t + 0.01, { f0: 240, f1: 95, glide: 0.1, attack: 0.004, tau: 0.05, level: LEVEL.splash * 0.15 * s, wet: 0.05 });
        this.burst(t + 0.06, { kind: 'white', type: 'highpass', f0: 2500, q: 0.6, attack: 0.05, tau: 0.18, level: LEVEL.splash * 0.3 * s, pan: range(r, -0.2, 0.2), wet: 0.2 });
        this.drops(t + 0.08, 4 + Math.floor(8 * g), 0.9, LEVEL.splash * 0.08 * s, 0);
        return;
      }
      case 'paddle': {
        // One stroke, on alternate sides: the blade goes in with a soft "chunk"
        // and a bubble, pulls with a long swish, and drips as it comes out.
        const s = 0.4 + 0.6 * g;
        const pan = (this.stroke = -this.stroke) * range(r, 0.25, 0.4);
        this.burst(t, { kind: 'pink', type: 'bandpass', f0: 1000, f1: 650, q: 1, attack: 0.012, tau: 0.06, level: LEVEL.paddle * s, pan, wet: 0.1 });
        this.tone(t + 0.008, { f0: 220, f1: 380, glide: 0.06, attack: 0.004, tau: 0.03, level: LEVEL.paddle * 0.1 * s, pan, wet: 0.05 });
        this.burst(t + 0.05, { kind: 'pink', type: 'bandpass', f0: 520, f1: 330, q: 0.9, attack: 0.12, tau: 0.12, dur: 0.4, level: LEVEL.paddle * 0.45 * s, pan, wet: 0.1 });
        this.drops(t + range(r, 0.35, 0.5), 2 + Math.floor(r() * 3), 0.6, LEVEL.paddle * 0.05 * s, pan);
        return;
      }
      case 'boatIn':
        // A foot on the hollow hull, the other one after, the boat rocking in the water.
        this.knock(t, range(r, 150, 175), LEVEL.knock * (0.6 + 0.4 * g), -0.08);
        this.knock(t + range(r, 0.09, 0.13), range(r, 190, 220), LEVEL.knock * 0.5, 0.1);
        this.play('splash', 0.2, t + 0.04);
        this.slosh(t + 0.1, 0.6);
        return;
      case 'boatOut':
        this.knock(t, range(r, 180, 210), LEVEL.knock * 0.7 * (0.6 + 0.4 * g), 0.08);
        this.slosh(t + 0.05, 0.4);
        this.lastStep = -1;
        this.play('step', 1, t + 0.18);
        return;
      case 'enter':
        // A small bronze temple bell, struck twice (it rings over the gong of "begin").
        this.bell(t, mtof(81), LEVEL.bell * (0.5 + 0.5 * g), -0.15);
        this.bell(t + 0.32, mtof(86), LEVEL.bell * 0.8 * (0.5 + 0.5 * g), 0.15);
        return;
    }
  }

  /** Rushing air (falling, gliding) and the water along the boat, 0‥1 each; called every frame. */
  levels(wind: number, wake: number, t: number): void {
    this.wind = this.lasting(this.wind, wind, t, () => this.makeWind(), (l, v) => {
      // More air, higher and brighter.
      glide(l.env.gain, LEVEL.wind * v ** 1.2, t, 0.12);
      glide(l.tone.frequency, 300 + 1300 * v, t, 0.2);
      glide(l.low.gain, 0.5 + 0.5 * v, t, 0.2);
    });
    this.wake = this.lasting(this.wake, wake, t, () => this.makeWake(), (l, v) => {
      glide(l.env.gain, LEVEL.wake * v ** 0.7, t, 0.15);
      glide(l.tone.frequency, 800 + 900 * v, t, 0.2);
      glide(l.low.gain, 0.4 + 0.6 * v, t, 0.2);
    });
  }

  // ── Lasting sounds ────────────────────────────────────────────────────────

  private lasting(l: Lasting | null, v: number, t: number, make: () => Lasting, set: (l: Lasting, v: number) => void): Lasting | null {
    if (!l) {
      if (v < 0.002) return null;
      l = make();
    }
    if (v >= 0.002) l.quietSince = -1;
    else if (l.quietSince < 0) l.quietSince = t;
    else if (t - l.quietSince > IDLE) {
      for (const s of l.sources) s.stop(t);
      for (const n of l.nodes) n.disconnect();
      return null;
    }
    // (every frame calls this: move the params only when the level moves)
    if (Math.abs(v - l.level) > 0.004 || (v === 0 && l.level !== 0)) {
      l.level = v;
      set(l, v);
    }
    return l;
  }

  private makeWind(): Lasting {
    const ctx = this.ctx;
    const r = this.rnd;
    const env = this.gain(0);
    // Air roaring past: pink noise in a band that rises with the speed, and a low buffeting.
    const src = this.loop(noise('pink'));
    const tone = biquad(ctx, 'bandpass', 400, 0.7);
    const buffet = this.loop(noise('brown'));
    const lp = biquad(ctx, 'lowpass', 160, 0.7);
    const low = this.gain(0.5);
    // Slow swells, as the body turns in the air.
    const sway = this.gain(1);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = range(r, 0.35, 0.5);
    const depth = this.gain(0.15);
    lfo.connect(depth).connect(sway.gain);
    lfo.start(ctx.currentTime);
    src.connect(tone).connect(sway);
    buffet.connect(lp).connect(low).connect(sway);
    sway.connect(env);
    this.out(env, 0, 0.05);
    return { env, tone, low, sources: [src, buffet, lfo], nodes: [src, tone, buffet, lp, low, sway, lfo, depth, env], level: 0, quietSince: -1 };
  }

  private makeWake(): Lasting {
    const ctx = this.ctx;
    // Water hissing along the hull, and gurgling behind it.
    const src = this.loop(noise('pink'));
    const tone = biquad(ctx, 'bandpass', 1200, 0.8);
    const gurgle = this.loop(source('babble'));
    gurgle.playbackRate.value = 1.3;
    const hp = biquad(ctx, 'highpass', 300, 0.7);
    const low = this.gain(0.6);
    const env = this.gain(0);
    src.connect(tone).connect(env);
    gurgle.connect(hp).connect(low).connect(env);
    this.out(env, 0, 0.1);
    return { env, tone, low, sources: [src, gurgle], nodes: [src, tone, gurgle, hp, low, env], level: 0, quietSince: -1 };
  }

  // ── Building blocks ───────────────────────────────────────────────────────

  private gain(v: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  private loop(buf: AudioBuffer): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.start(this.ctx.currentTime, this.rnd() * buf.duration);
    return s;
  }

  /** Send `node` to the effects bus (dry, and some reverb), through a pan. */
  private out(node: AudioNode, pan: number, wet: number): AudioNode[] {
    const made: AudioNode[] = [];
    let last = node;
    if (pan) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      last = last.connect(p);
      made.push(p);
    }
    last.connect(this.e.sfxBus.dry);
    if (wet > 0) {
      const g = this.gain(wet);
      last.connect(g).connect(this.e.sfxBus.wet);
      made.push(g);
    }
    return made;
  }

  /** Filtered noise, struck: rises in `attack`, then dies away; its filter slides from `f0` to `f1`. */
  private burst(t: number, b: Burst): void {
    const ctx = this.ctx;
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
    const made = this.out(env, b.pan ?? 0, b.wet ?? 0);
    src.start(t, this.rnd() * (buf.duration - end - 0.1));
    src.stop(t + end);
    src.onended = () => {
      for (const n of [src, f, env, ...made]) n.disconnect();
    };
  }

  /** A struck tone whose pitch slides from `f0` to `f1`. */
  private tone(t: number, s: Tone): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = s.type ?? 'sine';
    o.frequency.setValueAtTime(s.f0, t);
    if (s.f1 && s.f1 !== s.f0) o.frequency.exponentialRampToValueAtTime(s.f1, t + (s.glide ?? s.tau * 3));
    const env = ctx.createGain();
    strike(env.gain, t, s.level, s.attack, s.tau);
    o.connect(env);
    const made = this.out(env, s.pan ?? 0, s.wet ?? 0);
    o.start(t);
    o.stop(t + s.attack + s.tau * 7);
    o.onended = () => {
      for (const n of [o, env, ...made]) n.disconnect();
    };
  }

  /** Tiny ticks of grit and small stones, scattered over `spread` s. */
  private grit(t: number, n: number, spread: number, level: number, pan: number): void {
    const r = this.rnd;
    for (let i = 0; i < n; i++)
      this.burst(t + r() * spread, { type: 'highpass', f0: range(r, 2500, 4200), attack: 0.0008, tau: range(r, 0.002, 0.005), level: level * (0.3 + 0.7 * r()), pan: pan + range(r, -0.15, 0.15) });
  }

  /** Water drops and bubbles: short sines that rise as they pop, over `spread` s. */
  private drops(t: number, n: number, spread: number, level: number, pan: number): void {
    const r = this.rnd;
    for (let i = 0; i < n; i++) {
      const f0 = 600 * 4 ** (r() ** 1.2);
      const tau = range(r, 0.008, 0.02);
      this.tone(t + spread * r() ** 1.5, { f0, f1: f0 * range(r, 1.3, 1.8), glide: tau * 3, attack: 0.0015, tau, level: level * (0.4 + 0.6 * r()), pan: pan + range(r, -0.2, 0.2), wet: 0.12 });
    }
  }

  /** Cloth flapping in the air: noise in a band, beating at `rate0` → `rate1` Hz, over `dur` s. */
  private flutter(t: number, f0: number, f1: number, rate0: number, rate1: number, dur: number, level: number): void {
    const ctx = this.ctx;
    const buf = noise('pink');
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = biquad(ctx, 'bandpass', f0, 0.9);
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const env = ctx.createGain();
    strike(env.gain, t, level * 0.5, 0.02, dur / 4);
    // The flaps: an oscillator adds to the envelope, as deep as the envelope itself.
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(rate0, t);
    lfo.frequency.exponentialRampToValueAtTime(rate1, t + dur);
    const depth = ctx.createGain();
    strike(depth.gain, t, level * 0.5, 0.02, dur / 4);
    lfo.connect(depth).connect(env.gain);
    src.connect(f).connect(env);
    const made = this.out(env, 0, 0.1);
    const end = t + dur * 1.6;
    src.start(t, this.rnd() * (buf.duration - dur * 2));
    src.stop(end);
    lfo.start(t);
    lfo.stop(end);
    src.onended = () => {
      for (const n of [src, f, env, lfo, depth, ...made]) n.disconnect();
    };
  }

  /** The boat rocking: a low slosh of water against the hull. */
  private slosh(t: number, g: number): void {
    this.burst(t, { kind: 'pink', type: 'lowpass', f0: 650, f1: 300, q: 0.7, attack: 0.1, tau: 0.18, dur: 0.6, level: LEVEL.splash * 0.3 * g, wet: 0.1 });
  }

  /** A knock on the hollow wooden hull: a few inharmonic partials that die fast, and a click. */
  private knock(t: number, f: number, level: number, pan: number): void {
    const parts: [number, number, number][] = [
      [1, 1, 0.09],
      [2.32, 0.5, 0.05],
      [3.7, 0.28, 0.03],
      [5.9, 0.12, 0.015],
    ];
    for (const [ratio, amp, tau] of parts) this.tone(t, { f0: f * ratio, attack: 0.001, tau, level: level * amp, pan, wet: 0.08 });
    this.burst(t, { type: 'highpass', f0: 2000, attack: 0.0005, tau: 0.004, level: level * 0.4, pan });
  }

  /** A small bronze bell: a clear note with a few softer, quicker partials above. */
  private bell(t: number, f: number, level: number, pan: number): void {
    const parts: [number, number, number][] = [
      [1, 1, 1.6],
      [2.0, 0.35, 1],
      [2.74, 0.22, 0.7],
      [4.07, 0.1, 0.4],
      [5.4, 0.05, 0.25],
    ];
    for (const [ratio, amp, tau] of parts) this.tone(t, { f0: f * ratio * range(this.rnd, 0.999, 1.001), attack: 0.003, tau, level: level * amp, pan, wet: 0.5 });
  }
}
