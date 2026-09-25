import type { TypeKey } from '../types';
import { biquad, cleanup, noise, range, strike, type Rng } from './dsp';
import type { SoundEngine } from './engine';
import type { Strike } from './typewriter';

/**
 * The story's typing (story/story.ts): an old typewriter, one strike as each
 * word shows, on the interface bus.
 *
 * The strikes are cut from a recording (`typewriter.ts`), a different one
 * each time, a little faster or slower (higher or lower), harder or softer.
 * Until it is loaded, or if it fails, they are synthesized: the typebar
 * hitting the paper on the roller, a hard, short "tack" (filtered noise), a
 * little metal ringing in the typebar and the frame (a few off-key tones
 * that die fast), the thud of the rubber roller (a low tone falling), then
 * the carriage stepping on by one letter (a small click). Each synthesized
 * strike picks one of a few typebars (they ring a little differently).
 *
 * The title is one heavy strike (a capital, struck hard).
 *
 * The pan follows where the word is on the screen (story.ts works it out).
 */

/** Peak levels (before the interface volume). */
const LEVEL: Record<TypeKey, number> = { key: 0.34, title: 0.42 };
/** A recorded strike's gain at level 1 (they are levelled on −20 dBFS: typewriter.ts). */
const RECORDED = 2.8;
/** Strikes closer than this (s) are skipped: a quick run of words never buzzes. */
const GAP = 0.035;
/** Reverb send: close and dry, the typewriter on the desk in front of you. */
const WET = 0.06;
/** Typebars: the ringing tones of each one ([frequency, amplitude, decay time constant (s)]). */
const TYPEBARS = 7;

type Tone = [number, number, number];

export class Typing {
  private readonly e: SoundEngine;
  private readonly ctx: BaseAudioContext;
  private readonly rnd: Rng;
  private readonly bars: Tone[][];
  private last = -1;
  /** The recorded strikes, once cut (`null`: synthesized). */
  strikes: readonly Strike[] | null = null;
  private lastStrike = -1;

  constructor(e: SoundEngine) {
    this.e = e;
    this.ctx = e.ctx;
    this.rnd = e.rnd;
    const r = this.rnd;
    this.bars = Array.from({ length: TYPEBARS }, () => {
      const f = range(r, 1900, 2700);
      return [
        [f, 1, range(r, 0.02, 0.032)],
        [f * range(r, 1.52, 1.78), 0.6, range(r, 0.014, 0.022)],
        [f * range(r, 2.4, 2.9), 0.35, range(r, 0.008, 0.012)],
      ];
    });
  }

  /** A word typed at `t`, panned −1‥1. */
  play(k: TypeKey, pan: number, t: number): void {
    const r = this.rnd;
    if (k !== 'title' && t - this.last < GAP) return;
    // (a hand never types exactly on the beat)
    if (k !== 'title') t += r() * 0.012;
    this.last = t;
    const level = LEVEL[k] * (k === 'title' ? 1 : range(r, 0.75, 1));
    if (this.strikes?.length) this.recorded(this.strikes, t, level, pan, k === 'title');
    else this.strike(t, level, pan, k === 'title');
  }

  /** A recorded strike landing at `t` (its key's click just before); `heavy`: a capital struck hard, with the roller's thud under it. */
  private recorded(strikes: readonly Strike[], t: number, level: number, pan: number, heavy: boolean): void {
    const r = this.rnd;
    // (never the same one twice running)
    let i = Math.floor(r() * strikes.length);
    if (i === this.lastStrike && strikes.length > 1) i = (i + 1) % strikes.length;
    this.lastStrike = i;
    const s = strikes[i];
    const v = this.voice(pan, 14000, heavy ? 0.14 : WET);
    const src = this.ctx.createBufferSource();
    src.buffer = s.buf;
    const rate = heavy ? 0.9 : range(r, 0.95, 1.06);
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = level * RECORDED;
    src.connect(g).connect(v.in);
    // (started early by its lead, so the strike itself lands at `t`; if that has passed, from part way in)
    const at = t - s.lead / rate;
    const now = this.ctx.currentTime;
    const skip = Math.max(0, now - at) * rate;
    src.start(Math.max(at, now), skip);
    const end = Math.max(at, now) + (s.buf.duration - skip) / rate;
    v.add(src, end, g);
    if (heavy) {
      const f0 = range(r, 120, 140);
      this.tone(v, t, f0, f0 * 0.6, level * 0.5, 0.001, 0.035);
    }
    v.done();
  }

  /** A synthesized strike: the typebar hits the paper, then the carriage steps on one letter; `heavy`: a capital struck hard. */
  private strike(t: number, level: number, pan: number, heavy: boolean): void {
    const r = this.rnd;
    const v = this.voice(pan, heavy ? 7500 : range(r, 8000, 10000), heavy ? 0.14 : WET);
    // The tack, and the crack of the typebar through the ribbon.
    this.hit(v, t, 'highpass', 1400, 0.7, level * 1.5, 0.0003, heavy ? 0.006 : 0.004);
    this.hit(v, t, 'bandpass', range(r, 2900, 3500), 1.2, level * 1.3, 0.0003, 0.006);
    // Metal ringing: this typebar's tones.
    const bar = this.bars[Math.floor(r() * this.bars.length)];
    for (const [f, amp, tau] of bar) this.tone(v, t, f * range(r, 0.99, 1.01), f, level * 0.13 * amp, 0.0005, tau);
    // The roller's thud.
    const f0 = range(r, 150, 185) * (heavy ? 0.8 : 1);
    this.tone(v, t, f0, f0 * 0.6, level * 0.6, 0.001, heavy ? 0.035 : 0.022);
    this.hit(v, t, 'bandpass', 420, 1, level * 0.9, 0.0008, heavy ? 0.02 : 0.012);
    // The carriage steps on: a click and the rack's smaller one.
    const s = t + range(r, 0.028, 0.04);
    this.hit(v, s, 'bandpass', range(r, 3000, 3800), 3, level * 0.5, 0.0003, 0.0025);
    this.hit(v, s + range(r, 0.006, 0.009), 'bandpass', range(r, 2200, 2600), 3, level * 0.25, 0.0003, 0.002);
    v.done();
  }

  // ── Building blocks ───────────────────────────────────────────────────────

  /** A burst of white noise through a filter: rise in `a` s, decay with time constant `tau`. */
  private hit(v: Voice, t: number, type: BiquadFilterType, f: number, q: number, level: number, a: number, tau: number): void {
    const src = this.ctx.createBufferSource();
    const buf = noise('white');
    src.buffer = buf;
    const flt = biquad(this.ctx, type, f, q);
    const g = this.ctx.createGain();
    strike(g.gain, t, level, a, tau);
    src.connect(flt).connect(g).connect(v.in);
    const end = t + a + tau * 8;
    src.start(t, this.rnd() * (buf.duration - 0.2));
    src.stop(end);
    v.add(src, end, flt, g);
  }

  /** A struck sine gliding from `f0` to `f1` in 40 ms (the same: a steady ring). */
  private tone(v: Voice, t: number, f0: number, f1: number, level: number, a: number, tau: number): void {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + 0.04);
    const g = this.ctx.createGain();
    strike(g.gain, t, level, a, tau);
    o.connect(g).connect(v.in);
    const end = t + a + tau * 8;
    o.start(t);
    o.stop(end);
    v.add(o, end, g);
  }

  /**
   * One sound's sum: mono (it comes from one point), softened, panned, to
   * the interface bus with `wet` reverb; its nodes are let go when its last
   * part has ended.
   */
  private voice(pan: number, lowpass: number, wet: number): Voice {
    const ctx = this.ctx;
    const sum = ctx.createGain();
    sum.channelCount = 1;
    sum.channelCountMode = 'explicit';
    const lp = biquad(ctx, 'lowpass', lowpass);
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    const send = ctx.createGain();
    send.gain.value = wet;
    sum.connect(lp).connect(p);
    p.connect(this.e.bus.ui.dry);
    p.connect(send).connect(this.e.bus.ui.wet);
    const nodes: AudioNode[] = [sum, lp, p, send];
    let lastSrc: AudioScheduledSourceNode | null = null;
    let lastEnd = 0;
    return {
      in: sum,
      add(src, end, ...more) {
        nodes.push(src, ...more);
        if (end > lastEnd) {
          lastEnd = end;
          lastSrc = src;
        }
      },
      done() {
        if (lastSrc) cleanup(lastSrc, nodes);
      },
    };
  }
}

interface Voice {
  in: AudioNode;
  /** A part of the sound, ending at `end`, with its nodes. */
  add(src: AudioScheduledSourceNode, end: number, ...nodes: AudioNode[]): void;
  done(): void;
}
