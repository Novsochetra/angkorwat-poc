import { biquad, glide, mtof, pick, range, softWave, weighted, type Rng } from './dsp';
import type { SoundEngine } from './engine';

/**
 * Calm generative music in D major pentatonic (D E F# A B) — by night the
 * same notes centred on B minor, lower, slower and sparser.
 *
 * - Pads: slow four-note chords (two detuned voices per note, one per ear),
 *   long attack and release, a slow filter swell, a gentle chorus.
 * - Plucks: short phrases like a roneat (Khmer xylophone) or khim (hammered
 *   dulcimer): a decaying tone with a soft octave and a slightly inharmonic
 *   partial near 4×; now and then an octave double or a quick tremolo roll.
 * - Drone: a very soft low root and fifth, swelling slowly.
 * - Long reverb (the engine's convolver) and a ping-pong delay on the plucks.
 *
 * Nothing repeats on a loop: chords follow weighted random steps, phrases
 * random-walk the scale, and silences come and go.
 */

interface Mode {
  chords: number[][];
  weights: number[];
  /** Pluck range (MIDI). */
  lo: number;
  hi: number;
  /** Pad filter peak (Hz). */
  bright: number;
}

const DAY: Mode = {
  chords: [
    [50, 57, 64, 66], // D add9
    [47, 54, 62, 69], // Bm7
    [52, 59, 62, 66], // E sus (E B D F#)
    [45, 57, 59, 64], // A sus2
    [54, 59, 64, 69], // F# B E A (fourths)
  ],
  weights: [3, 2.2, 1.8, 1.5, 1.2],
  lo: 69,
  hi: 88,
  bright: 1500,
};

const NIGHT: Mode = {
  chords: [
    [47, 54, 62, 64], // Bm add11
    [40, 47, 57, 62], // E sus7 (E B A D)
    [42, 47, 52, 57], // F# B E A (fourths), low
    [45, 52, 59, 62], // A sus (A E B D)
    [38, 45, 54, 64], // D add9, low
  ],
  weights: [3, 2, 1.4, 1.4, 1],
  lo: 62,
  hi: 79,
  bright: 850,
};

const PENTA = new Set([2, 4, 6, 9, 11]);
const scale = (lo: number, hi: number): number[] => {
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (PENTA.has(m % 12)) out.push(m);
  return out;
};

/** Per-oscillator pad level, pluck level, drone level. */
const PAD = 0.07;
const PLUCK = 0.32;
const DRONE = 0.045;
/** At most this many pluck notes ringing. */
const MAX_PLUCKS = 12;

export class Music {
  private readonly e: SoundEngine;
  private readonly ctx: BaseAudioContext;
  private readonly rnd: Rng;
  private readonly wave: PeriodicWave;
  private readonly pads: GainNode;
  private readonly plucks: GainNode;
  private readonly dayDrone: GainNode;
  private readonly nightDrone: GainNode;
  private nextChord = -1;
  private nextPhrase = -1;
  private chord = DAY.chords[0];
  private resting = false;
  /** End times of the pluck notes scheduled so far (to cap how many ring at once). */
  private ends: number[] = [];

  constructor(e: SoundEngine) {
    this.e = e;
    const ctx = (this.ctx = e.ctx);
    this.rnd = e.rnd;
    this.wave = softWave(ctx, 1.7, 12);
    const { dry, wet } = e.bus.music;
    const now = ctx.currentTime;
    const gain = (v: number) => {
      const g = ctx.createGain();
      g.gain.value = v;
      return g;
    };
    const lfo = (hz: number, depth: number, target: AudioParam) => {
      const o = ctx.createOscillator();
      o.frequency.value = hz;
      o.connect(gain(depth)).connect(target);
      o.start(now);
    };

    // Pads, with a slow stereo chorus beside the dry sound.
    this.pads = ctx.createGain();
    this.pads.connect(dry);
    this.pads.connect(gain(0.6)).connect(wet);
    const split = ctx.createChannelSplitter(2);
    const merge = ctx.createChannelMerger(2);
    this.pads.connect(split);
    for (const [ch, base, hz] of [
      [0, 0.017, 0.13],
      [1, 0.023, 0.087],
    ]) {
      const d = ctx.createDelay(0.05);
      d.delayTime.value = base;
      lfo(hz, 0.004, d.delayTime);
      split.connect(d, ch).connect(merge, 0, ch);
    }
    merge.connect(gain(0.55)).connect(dry);

    // Plucks: long reverb and a soft ping-pong delay.
    this.plucks = ctx.createGain();
    this.plucks.connect(dry);
    this.plucks.connect(gain(0.7)).connect(wet);
    const send = gain(0.2);
    this.plucks.connect(send);
    const dl = ctx.createDelay(2);
    const dr = ctx.createDelay(2);
    dl.delayTime.value = 0.54;
    dr.delayTime.value = 0.81;
    const tone = (d: DelayNode) => d.connect(biquad(ctx, 'lowpass', 2400));
    const toneL = tone(dl);
    const toneR = tone(dr);
    send.connect(dl);
    toneL.connect(gain(0.36)).connect(dr);
    toneR.connect(gain(0.36)).connect(dl);
    const echo = ctx.createChannelMerger(2);
    toneL.connect(echo, 0, 0);
    toneR.connect(echo, 0, 1);
    echo.connect(dry);
    echo.connect(gain(0.4)).connect(wet);

    // Drone: root and fifth, D by day, B by night, breathing slowly.
    const lp = biquad(ctx, 'lowpass', 420);
    const swell = gain(1);
    lfo(0.021, 0.35, swell.gain);
    lp.connect(swell).connect(dry);
    const drone = (notes: number[], level: number) => {
      const g = gain(level);
      g.connect(lp);
      for (const m of notes) {
        const o = ctx.createOscillator();
        o.setPeriodicWave(softWave(ctx, 2.2, 6));
        o.frequency.value = mtof(m);
        o.detune.value = range(this.rnd, -3, 3);
        o.connect(g);
        o.start(now);
      }
      return g;
    };
    this.dayDrone = drone([38, 45], DRONE);
    this.nightDrone = drone([35, 42], 0);
  }

  mix(night: number, t: number, tc: number): void {
    glide(this.dayDrone.gain, DRONE * Math.cos((night * Math.PI) / 2), t, tc && 3);
    glide(this.nightDrone.gain, DRONE * Math.sin((night * Math.PI) / 2), t, tc && 3);
  }

  schedule(now: number, until: number): void {
    const r = this.rnd;
    if (this.nextChord < now) this.nextChord = now + 0.05;
    while (this.nextChord < until) this.nextChord = this.chordAt(this.nextChord);
    if (this.nextPhrase < now) this.nextPhrase = now + range(r, 3, 6);
    while (this.nextPhrase < until) this.nextPhrase = this.phraseAt(this.nextPhrase);
  }

  // ── Pads ──────────────────────────────────────────────────────────────────

  private chordAt(t: number): number {
    const r = this.rnd;
    // A rest now and then: just the drone and the reverb tail.
    if (!this.resting && r() < 0.1) {
      this.resting = true;
      return t + range(r, 5, 9);
    }
    this.resting = false;
    const nightish = r() < this.e.night;
    const mode = nightish ? NIGHT : DAY;
    let chord = mode.chords[weighted(r, mode.weights)];
    for (let i = 0; i < 4 && chord === this.chord; i++) chord = mode.chords[weighted(r, mode.weights)];
    this.chord = chord;

    const ctx = this.ctx;
    const dur = range(r, 10, 15) * (nightish ? 1.3 : 1);
    const attack = range(r, 3.5, 5.5);
    const release = range(r, 5, 8);
    const end = t + dur + release * 1.4;

    const merge = ctx.createChannelMerger(2);
    const lp = biquad(ctx, 'lowpass', 400, 0.5);
    const peak = mode.bright * range(r, 0.85, 1.15);
    lp.frequency.setValueAtTime(peak * 0.3, t);
    lp.frequency.linearRampToValueAtTime(peak, t + attack);
    lp.frequency.linearRampToValueAtTime(peak * 0.55, t + dur + release);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + attack);
    env.gain.setValueAtTime(1, t + dur);
    env.gain.setTargetAtTime(0, t + dur, release / 4);
    merge.connect(lp).connect(env).connect(this.pads);

    const nodes: AudioNode[] = [merge, lp, env];
    let last: OscillatorNode | null = null;
    chord.forEach((m, k) => {
      // Lowest note fullest, upper notes a little softer.
      const level = PAD * (k === 0 ? 1 : 0.85 - 0.08 * k);
      for (let side = 0; side < 2; side++) {
        const o = ctx.createOscillator();
        o.setPeriodicWave(this.wave);
        o.frequency.value = mtof(m);
        o.detune.value = (side ? 1 : -1) * range(r, 3, 7);
        const g = ctx.createGain();
        g.gain.value = level;
        o.connect(g).connect(merge, 0, side);
        o.start(t + r() * 0.03);
        o.stop(end);
        nodes.push(o, g);
        last = o;
      }
    });
    if (last) {
      (last as OscillatorNode).onended = () => {
        for (const n of nodes) n.disconnect();
      };
    }
    // The next chord comes in as this one lets go.
    return t + dur;
  }

  // ── Plucks ────────────────────────────────────────────────────────────────

  private phraseAt(t: number): number {
    const r = this.rnd;
    const nightish = r() < this.e.night;
    if (r() < (nightish ? 0.45 : 0.25)) return t + range(r, 4, 9);
    const mode = nightish ? NIGHT : DAY;
    const notes = scale(mode.lo, mode.hi);
    // Start on a tone of the chord that is playing.
    const tones = new Set(this.chord.map((m) => m % 12));
    const starts = notes.map((m, i) => (tones.has(m % 12) ? i : -1)).filter((i) => i >= 0);
    let idx = starts.length ? pick(r, starts) : Math.floor(notes.length / 2);
    const n = nightish ? 1 + Math.floor(r() * 3) : 2 + Math.floor(r() * 5);
    const beat = range(r, 0.34, 0.52) * (nightish ? 1.3 : 1);
    const pan = range(r, -0.4, 0.4);
    let s = t;
    for (let k = 0; k < n; k++) {
      const contour = Math.sin((Math.PI * (k + 0.5)) / n);
      const vel = (0.55 + 0.45 * contour) * range(r, 0.8, 1);
      const m = notes[idx];
      const p = pan + range(r, -0.15, 0.15);
      if (!nightish && r() < 0.07) {
        // Roneat tremolo: a quick soft roll on one note.
        const reps = 4 + Math.floor(r() * 3);
        for (let j = 0; j < reps; j++) this.pluck(s + j * 0.075, m, vel * (0.9 - 0.1 * j), p);
        s += reps * 0.075;
      } else {
        this.pluck(s, m, vel, p);
        // Khim: the octave below, struck with it.
        if (r() < 0.12) this.pluck(s + 0.012, m - 12, vel * 0.5, -p);
      }
      idx = Math.max(0, Math.min(notes.length - 1, idx + pick(r, [-2, -1, -1, 0, 1, 1, 2])));
      s += beat * pick(r, [1, 1, 1, 1.5, 2, 0.5]);
    }
    return s + range(r, 3, 9) * (nightish ? 1.8 : 1);
  }

  /** One struck note: fundamental, a soft octave, a quick bright partial near 4×. */
  private pluck(t: number, midi: number, vel: number, pan: number): void {
    this.ends = this.ends.filter((e) => e > t);
    if (this.ends.length >= MAX_PLUCKS) return;
    const ctx = this.ctx;
    const f = mtof(midi);
    const k = Math.max(0.6, Math.min(1.4, (520 / f) ** 0.35));
    const partials: [number, number, number][] = [
      [1, 1, 0.8 * k],
      [2.004, 0.16, 0.4 * k],
      [3.95, 0.2, 0.08],
    ];
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(this.plucks);
    const nodes: AudioNode[] = [p];
    let longest: OscillatorNode | null = null;
    let longestEnd = 0;
    for (const [ratio, amp, tau] of partials) {
      if (f * ratio > 16000) continue;
      const o = ctx.createOscillator();
      o.frequency.value = f * ratio;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(PLUCK * vel * amp, t + 0.003);
      g.gain.setTargetAtTime(0, t + 0.003, tau);
      o.connect(g).connect(p);
      const end = t + 0.003 + tau * 7;
      o.start(t);
      o.stop(end);
      nodes.push(o, g);
      if (end > longestEnd) {
        longestEnd = end;
        longest = o;
      }
    }
    if (!longest) return;
    this.ends.push(longestEnd);
    (longest as OscillatorNode).onended = () => {
      for (const n of nodes) n.disconnect();
    };
  }
}
