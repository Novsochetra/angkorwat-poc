import type { UISound } from '../types';
import { biquad, cleanup, mtof, noise, range, strike, type Rng } from './dsp';
import type { SoundEngine } from './engine';

/**
 * Interface sounds: short, quiet, soft-edged. Wooden ticks and clicks,
 * a warm two-note chime, a soft falling tone, a deep gong with a shimmer,
 * breathy whooshes; and the airy whoosh of a camera flight.
 */

/** Peak levels (before the sfx volume). */
const LEVEL = {
  hover: 0.16,
  tick: 0.12,
  toggle: 0.14,
  select: 0.34,
  back: 0.3,
  begin: 0.27,
  whoosh: 0.28,
  flight: 0.26,
};

/** [frequency ratio, amplitude, decay time constant (s)] */
type Partial = [number, number, number];

export class Sfx {
  private readonly e: SoundEngine;
  private readonly ctx: BaseAudioContext;
  private readonly rnd: Rng;
  private lastHover = -1;
  private lastTick = -1;
  private flightKill: GainNode | null = null;

  constructor(e: SoundEngine) {
    this.e = e;
    this.ctx = e.ctx;
    this.rnd = e.rnd;
  }

  play(s: UISound, t: number): void {
    const r = this.rnd;
    switch (s) {
      case 'hover': {
        // Tiny wooden tick; skipped when the pointer sweeps over many cards at once.
        if (t - this.lastHover < 0.045) return;
        this.lastHover = t;
        const f = range(r, 1450, 1700);
        this.bank(t, f, [[1, 1, 0.02], [2.71, 0.4, 0.008]], 0.0015, LEVEL.hover, range(r, -0.2, 0.2), 0.04);
        this.breath(t, 0.014, 'bandpass', 3000, 3000, 1.4, LEVEL.hover * 0.35, 0.001, 0);
        return;
      }
      case 'tick':
        if (t - this.lastTick < 0.03) return;
        this.lastTick = t;
        this.bank(t, range(r, 2000, 2200), [[1, 1, 0.009], [2.3, 0.3, 0.004]], 0.001, LEVEL.tick, 0, 0.03);
        return;
      case 'toggle':
        this.bank(t, 1250, [[1, 1, 0.014], [2.6, 0.3, 0.006]], 0.0015, LEVEL.toggle, -0.1, 0.05);
        this.bank(t + 0.055, 1700, [[1, 1, 0.014], [2.6, 0.3, 0.006]], 0.0015, LEVEL.toggle * 0.85, 0.1, 0.05);
        return;
      case 'select': {
        // Warm chime: E5 then B5, soft hum an octave below.
        const bell: Partial[] = [
          [0.5, 0.1, 0.9],
          [1, 1, 0.8],
          [2.0, 0.26, 0.4],
          [3.0, 0.07, 0.2],
          [4.16, 0.04, 0.09],
        ];
        this.bank(t, mtof(76), bell, 0.004, LEVEL.select, -0.12, 0.35);
        this.bank(t + 0.11, mtof(83), bell, 0.004, LEVEL.select * 0.8, 0.12, 0.35);
        return;
      }
      case 'back': {
        // A soft tone falling a fifth.
        const ctx = this.ctx;
        const o = ctx.createOscillator();
        const o2 = ctx.createOscillator();
        o2.type = 'triangle';
        o.frequency.setValueAtTime(620, t);
        o.frequency.exponentialRampToValueAtTime(410, t + 0.24);
        o2.frequency.setValueAtTime(310, t);
        o2.frequency.exponentialRampToValueAtTime(205, t + 0.24);
        const g2 = ctx.createGain();
        g2.gain.value = 0.3;
        const lp = biquad(ctx, 'lowpass', 2200);
        const env = ctx.createGain();
        strike(env.gain, t, LEVEL.back, 0.015, 0.09);
        o.connect(lp);
        o2.connect(g2).connect(lp);
        lp.connect(env);
        this.out(env, 0, 0.15);
        for (const x of [o, o2]) {
          x.start(t);
          x.stop(t + 0.7);
        }
        cleanup(o, [o, o2, g2, lp, env]);
        return;
      }
      case 'begin':
        this.gong(t);
        return;
      case 'open':
        this.breath(t, 0.26, 'bandpass', 600, 2400, 1.1, LEVEL.whoosh, 0.1, 0.1);
        this.bank(t, 1150, [[1, 1, 0.012], [2.5, 0.3, 0.005]], 0.0015, LEVEL.tick, 0, 0.05);
        return;
      case 'close':
        this.breath(t, 0.24, 'bandpass', 2200, 520, 1.1, LEVEL.whoosh, 0.06, -0.1);
        this.bank(t + 0.17, 900, [[1, 1, 0.012], [2.5, 0.3, 0.005]], 0.0015, LEVEL.tick, 0, 0.05);
        return;
    }
  }

  /** The camera flies for `seconds`: soft air rising and falling, drifting across. */
  flight(seconds: number, t: number): void {
    const ctx = this.ctx;
    const r = this.rnd;
    const d = Math.max(0.6, Math.min(5, seconds || 1));
    // A new flight takes over from one still going.
    if (this.flightKill) this.flightKill.gain.setTargetAtTime(0, t, 0.08);
    const buf = noise('pink');
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = biquad(ctx, 'bandpass', 260, 1.3);
    bp.frequency.setValueAtTime(260, t);
    bp.frequency.exponentialRampToValueAtTime(1250, t + d * 0.45);
    bp.frequency.exponentialRampToValueAtTime(380, t + d);
    const env = ctx.createGain();
    const curve = new Float32Array(64);
    for (let i = 0; i < curve.length; i++) curve[i] = LEVEL.flight * Math.sin((Math.PI * i) / (curve.length - 1)) ** 2;
    env.gain.value = 0;
    env.gain.setValueCurveAtTime(curve, t, d);
    const kill = ctx.createGain();
    this.flightKill = kill;
    const dir = r() < 0.5 ? -1 : 1;
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(-0.35 * dir, t);
    pan.pan.linearRampToValueAtTime(0.35 * dir, t + d);
    src.connect(bp).connect(env).connect(kill).connect(pan);
    this.out(pan, 0, 0.2, false);
    src.start(t, r() * buf.duration);
    src.stop(t + d + 0.05);
    const nodes = [src, bp, env, kill, pan];
    src.onended = () => {
      if (this.flightKill === kill) this.flightKill = null;
      for (const n of nodes) n.disconnect();
    };
  }

  // ── Building blocks ───────────────────────────────────────────────────────

  /** Send `node` to the effects bus (dry and a little reverb), optionally through a pan. */
  private out(node: AudioNode, pan: number, wet: number, panned = true): void {
    let last: AudioNode = node;
    if (panned && pan) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p);
      last = p;
    }
    last.connect(this.e.sfxBus.dry);
    if (wet > 0) {
      const g = this.ctx.createGain();
      g.gain.value = wet;
      last.connect(g).connect(this.e.sfxBus.wet);
    }
  }

  /** A struck tone: sine partials of `f`, each decaying on its own. */
  private bank(t: number, f: number, partials: Partial[], attack: number, level: number, pan: number, wet: number): void {
    const ctx = this.ctx;
    const sum = ctx.createGain();
    const nodes: AudioNode[] = [sum];
    let longest: OscillatorNode | null = null;
    let longestEnd = 0;
    for (const [ratio, amp, tau] of partials) {
      if (f * ratio > 18000) continue;
      const o = ctx.createOscillator();
      o.frequency.value = f * ratio;
      const g = ctx.createGain();
      strike(g.gain, t, level * amp, attack, tau);
      o.connect(g).connect(sum);
      const end = t + attack + tau * 8;
      o.start(t);
      o.stop(end);
      nodes.push(o, g);
      if (end > longestEnd) {
        longestEnd = end;
        longest = o;
      }
    }
    this.out(sum, pan, wet);
    if (longest) cleanup(longest, nodes);
  }

  /** A breath of filtered noise whose band slides from `f0` to `f1` over `dur`. */
  private breath(t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, level: number, attack: number, pan: number): void {
    const ctx = this.ctx;
    const buf = noise('white');
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = biquad(ctx, type, f0, q);
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(level, t + Math.max(0.001, attack));
    env.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(f).connect(env);
    this.out(env, pan, 0.08);
    src.start(t, this.rnd() * (buf.duration - dur - 0.1));
    src.stop(t + dur + 0.02);
    cleanup(src, [src, f, env]);
  }

  /** "Begin expedition": a deep, gentle gong (A2), and a shimmer of high notes around it. */
  private gong(t: number): void {
    const ctx = this.ctx;
    const r = this.rnd;
    const f = mtof(45);
    const partials: Partial[] = [
      [1, 0.65, 3],
      // A second mode a hair sharp: the slow "wah" beating of a big gong.
      [1.0035, 0.45, 2.6],
      [2.0, 0.5, 2],
      [2.98, 0.24, 1.3],
      [4.1, 0.16, 0.8],
      [5.43, 0.09, 0.5],
      [6.8, 0.05, 0.3],
    ];
    const sum = ctx.createGain();
    const lp = biquad(ctx, 'lowpass', 2600);
    sum.connect(lp);
    this.out(lp, 0, 0.3);
    const nodes: AudioNode[] = [sum, lp];
    let first: OscillatorNode | null = null;
    for (const [ratio, amp, tau] of partials) {
      const o = ctx.createOscillator();
      // The pitch sags a little after the strike, as a gong does.
      o.frequency.setValueAtTime(f * ratio * 1.012, t);
      o.frequency.setTargetAtTime(f * ratio, t, 0.4);
      const g = ctx.createGain();
      strike(g.gain, t, LEVEL.begin * amp, 0.018, tau);
      o.connect(g).connect(sum);
      o.start(t);
      o.stop(t + 0.02 + tau * 7);
      nodes.push(o, g);
      first ??= o;
    }
    if (first) cleanup(first, nodes);
    // The mallet's soft thump.
    this.breath(t, 0.14, 'lowpass', 220, 120, 0.7, LEVEL.begin * 0.35, 0.005, 0);
    // Shimmer: high notes of the scale drifting in around the gong.
    const shimmer = [86, 90, 93, 95, 98, 100];
    shimmer.forEach((m, i) => {
      const s = t + 0.08 + i * range(r, 0.06, 0.11);
      const o = ctx.createOscillator();
      o.frequency.value = mtof(m) * range(r, 0.998, 1.002);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(LEVEL.begin * 0.05 * (1 - i * 0.08), s + 0.25);
      g.gain.setTargetAtTime(0, s + 0.25, range(r, 0.6, 1.1));
      o.connect(g);
      this.out(g, (i % 2 ? 1 : -1) * (0.2 + i * 0.1), 0.9);
      o.start(s);
      o.stop(s + 0.25 + 8);
      cleanup(o, [o, g]);
    });
  }
}
