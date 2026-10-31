/**
 * The music of a promo video (scripts/video.mjs, a cut's `music`): a short
 * piece in the colours of the pin peat, written to the cut's sections and
 * rendered offline with the rest of the sound (video/soundtrack.ts).
 *
 * D major pentatonic (D E F# A B) like the map's own music (audio/music.ts),
 * at a steady tempo so the cut's shots change on its bars:
 *
 * - roneat ឯក (xylophone): bright struck bars, the running eighths;
 * - khloy ខ្លុយ (bamboo flute): the tune, breathy, with a late vibrato;
 * - chhing ឈិង (small cymbals): the timekeeper, open "chhing" and closed "chhep";
 * - skor ស្គរ (drums): a low "dum" and a slap;
 * - pads and a bass under them, a kong (gong) for the title, and a soft
 *   swell into each new section.
 *
 * A section names how full the band is (`level` 0‥3) and which tune the
 * flute plays; `night` sections take the minor chords, lower and sparser.
 * Nothing here is random but the small human timing, from a seeded stream.
 */
import { mulberry32, type Rng } from '../audio/dsp';

export interface ScoreSection {
  /** Start and end (s on the video's timeline). */
  from: number;
  to: number;
  /** 0 pads and the flute alone · 1 the roneat and the chhing · 2 the drums · 3 everything, the roneat in sixteenths. */
  level: number;
  /** The flute's tune here (`TUNES`), or none. */
  tune?: keyof typeof TUNES | null;
  /** The minor chords of the night. */
  night?: boolean;
  /** A swell of breath and cymbal into the section's first beat. */
  swell?: boolean;
}

export interface ScorePlan {
  bpm: number;
  sections: readonly ScoreSection[];
  /** A gong at these times (s). */
  gongs?: readonly number[];
  /** The last chord rings out from here (s) to the end. */
  endAt?: number;
  /** Length (s). */
  total: number;
  seed?: number;
}

const mtof = (m: number): number => 440 * 2 ** ((m - 69) / 12);

/** Chords a bar each, four to a line: [bass, …voicing] (MIDI). */
const DAY_CHORDS = [
  [38, 50, 57, 64, 66], // D add9
  [35, 47, 54, 62, 69], // Bm7
  [31, 43, 50, 59, 66], // G maj7
  [33, 45, 52, 59, 64], // A sus2
];
const NIGHT_CHORDS = [
  [35, 47, 54, 62, 64], // Bm add11
  [31, 43, 50, 59, 62], // G
  [38, 50, 57, 62, 66], // D
  [33, 45, 52, 57, 64], // A
];
/** The roneat's running eighths over each chord (MIDI, the pentatonic's notes in its range). */
const DAY_RUNS = [
  [74, 78, 81, 78, 86, 81, 78, 81],
  [71, 74, 78, 74, 83, 78, 74, 78],
  [71, 74, 78, 74, 83, 78, 76, 78],
  [69, 76, 81, 76, 83, 81, 76, 81],
];
const NIGHT_RUNS = [
  [71, 74, 78, 74, 76, 74, 71, 74],
  [71, 74, 79, 74, 78, 74, 71, 74],
  [69, 74, 78, 74, 81, 78, 74, 78],
  [69, 73, 76, 73, 76, 73, 69, 73],
];

/** The flute's tunes: four bars each, [eighth, MIDI, eighths long]. */
export const TUNES = {
  call: [
    [0, 78, 3], [3, 76, 1], [4, 74, 4],
    [8, 71, 2], [10, 74, 2], [12, 76, 4],
    [16, 78, 2], [18, 81, 2], [20, 78, 2], [22, 76, 2],
    [24, 76, 6], [30, 74, 1], [31, 76, 1],
  ],
  answer: [
    [0, 81, 3], [3, 83, 1], [4, 81, 2], [6, 78, 2],
    [8, 76, 2], [10, 78, 2], [12, 74, 4],
    [16, 71, 2], [18, 74, 2], [20, 76, 3], [23, 78, 1],
    [24, 74, 8],
  ],
  rise: [
    [0, 86, 4], [4, 83, 2], [6, 81, 2],
    [8, 83, 4], [12, 81, 2], [14, 78, 2],
    [16, 81, 3], [19, 83, 1], [20, 86, 4],
    [24, 88, 6], [30, 86, 2],
  ],
  home: [
    [0, 74, 4], [4, 76, 2], [6, 78, 2],
    [8, 74, 6], [14, 71, 2],
    [16, 69, 4], [20, 71, 2], [22, 74, 2],
    [24, 74, 8],
  ],
  night: [
    [0, 71, 4], [4, 74, 2], [6, 76, 2],
    [8, 74, 8],
    [16, 71, 3], [19, 69, 1], [20, 66, 4],
    [24, 69, 8],
  ],
} as const satisfies Record<string, readonly (readonly [number, number, number])[]>;

/** Render the piece into `out` (an offline context's node). */
export function playScore(ctx: BaseAudioContext, out: AudioNode, plan: ScorePlan): void {
  const rnd = mulberry32(plan.seed ?? 11);
  const beat = 60 / plan.bpm;
  const eighth = beat / 2;
  const bar = beat * 4;
  const v = new Voices(ctx, out, rnd, eighth);

  for (const s of plan.sections) {
    const night = !!s.night;
    const chords = night ? NIGHT_CHORDS : DAY_CHORDS;
    const runs = night ? NIGHT_RUNS : DAY_RUNS;
    const bars = Math.max(1, Math.round((s.to - s.from) / bar));
    if (s.swell) v.swell(s.from, Math.min(1.6, bar * 0.6));
    for (let b = 0; b < bars; b++) {
      const t0 = s.from + b * bar;
      const ci = b % 4;
      const [bass, ...voicing] = chords[ci];
      const last = b === bars - 1 && s === plan.sections[plan.sections.length - 1];
      // Pads: always; held into the next bar a little.
      v.pad(t0, voicing, bar * (last ? 2.6 : 1.12), s.level === 0 ? 0.9 : 0.7, night);
      // Bass: from level 1, the root on 1, the fifth on 3 (a long root at night).
      if (s.level >= 1) {
        if (night) v.bass(t0, bass, bar * 0.95, 0.75);
        else {
          v.bass(t0, bass, beat * 1.8, 0.9);
          v.bass(t0 + beat * 2, bass + 7, beat * 1.6, 0.7);
          if (s.level >= 3) v.bass(t0 + beat * 3.5, bass + 12, beat * 0.45, 0.45);
        }
      }
      // Roneat: eighths from level 1 (every other one at night), sixteenth rolls at level 3.
      if (s.level >= 1) {
        const run = runs[ci];
        for (let i = 0; i < 8; i++) {
          if (night && i % 2) continue;
          const t = t0 + i * eighth;
          const vel = (i % 2 ? 0.55 : 0.8) * (s.level >= 2 ? 1 : 0.8);
          v.roneat(t, run[i], vel, i % 2 ? 0.3 : -0.25);
          if (s.level >= 3 && (i === 3 || i === 7)) v.roneat(t + eighth / 2, run[(i + 1) % 8], 0.4, 0.4);
        }
      } else if (b % 2 === 0) {
        // (the intro: a few notes rung on their own)
        const run = runs[ci];
        v.roneat(t0, run[0], 0.5, -0.2);
        v.roneat(t0 + beat * 1.5, run[2], 0.4, 0.25);
        v.roneat(t0 + beat * 3, run[4], 0.35, 0);
      }
      // Chhing: closed on 1 and 3, open on 2 and 4 (level 1 up); the intro, one open stroke a bar.
      if (s.level >= 1) {
        for (let k = 0; k < 4; k++) v.chhing(t0 + k * beat, k % 2 === 1, k % 2 === 1 ? 0.75 : 0.55);
      } else if (!night) v.chhing(t0 + beat, true, 0.4);
      // Skor: from level 2.
      if (s.level >= 2 && !night) {
        v.skor(t0, 'dum', 1);
        v.skor(t0 + eighth * 2, 'tak', 0.7);
        v.skor(t0 + eighth * 5, 'dum', 0.8);
        v.skor(t0 + eighth * 6, 'tak', 0.8);
        if (s.level >= 3) {
          v.skor(t0 + eighth * 3, 'dum', 0.55);
          v.skor(t0 + eighth * 7, 'tak', 0.45);
        }
        if (b === bars - 1 && bars > 1) for (let k = 0; k < 4; k++) v.skor(t0 + beat * 3 + (k * eighth) / 2, 'tak', 0.45 + k * 0.12);
      } else if (s.level >= 2 && night && b % 2 === 0) v.skor(t0, 'dum', 0.55);
      // The flute's tune, four bars at a time.
      const tune = s.tune ? TUNES[s.tune] : null;
      if (tune && b % 4 === 0) {
        for (const [e, m, len] of tune) {
          const t = t0 + e * eighth;
          if (t >= s.to - 0.05) continue;
          v.khloy(t, m, Math.min(len * eighth * 0.96, s.to - t + bar * 0.3), 0.8);
        }
      }
    }
  }
  for (const g of plan.gongs ?? []) v.gong(g, 1);
  if (plan.endAt !== undefined) {
    const [, ...voicing] = DAY_CHORDS[0];
    v.pad(plan.endAt, voicing, plan.total - plan.endAt, 0.8, false);
    v.roneat(plan.endAt, 86, 0.6, 0);
    v.roneat(plan.endAt + 0.02, 74, 0.5, 0);
  }
}

/** The band: each voice made of a few nodes a note, through one reverb and the roneat's delay. */
class Voices {
  private readonly dry: GainNode;
  private readonly wet: GainNode;
  private readonly echo: GainNode;
  private readonly noiseBuf: AudioBuffer;

  constructor(
    private readonly ctx: BaseAudioContext,
    out: AudioNode,
    private readonly rnd: Rng,
    eighth: number,
  ) {
    this.dry = ctx.createGain();
    this.dry.connect(out);
    const verb = ctx.createConvolver();
    verb.buffer = hall(ctx, 3.2);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.9;
    this.wet.connect(verb).connect(out);
    // (a ping-pong echo on a dotted eighth)
    const dl = ctx.createDelay(2);
    const dr = ctx.createDelay(2);
    dl.delayTime.value = dr.delayTime.value = eighth * 1.5;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3200;
    const pl = ctx.createStereoPanner();
    const pr = ctx.createStereoPanner();
    pl.pan.value = -0.7;
    pr.pan.value = 0.7;
    this.echo = ctx.createGain();
    this.echo.gain.value = 0.22;
    this.echo.connect(tone).connect(dl);
    dl.connect(pl).connect(out);
    dl.connect(dr);
    dr.connect(pr).connect(out);
    dr.connect(fb).connect(dl);
    this.noiseBuf = whiteNoise(ctx, 2);
  }

  private pan(p: number, wet: number, echo = 0): StereoPannerNode {
    const n = this.ctx.createStereoPanner();
    n.pan.value = p;
    n.connect(this.dry);
    if (wet > 0) {
      const g = this.ctx.createGain();
      g.gain.value = wet;
      n.connect(g).connect(this.wet);
    }
    if (echo > 0) {
      const g = this.ctx.createGain();
      g.gain.value = echo;
      n.connect(g).connect(this.echo);
    }
    return n;
  }

  private osc(type: OscillatorType, f: number, t: number, dur: number, to: AudioNode, detune = 0): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = detune;
    o.connect(to);
    o.start(t);
    o.stop(t + dur);
    return o;
  }

  private noise(t: number, dur: number, to: AudioNode): void {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.connect(to);
    s.start(t, this.rnd() * 1.5, dur);
  }

  private gain(to: AudioNode): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.connect(to);
    return g;
  }

  private filter(type: BiquadFilterType, f: number, q: number, to: AudioNode): BiquadFilterNode {
    const b = this.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    b.connect(to);
    return b;
  }

  /** A little human timing (s), never before the start. */
  private loose(t: number, by = 0.008): number {
    return Math.max(0, t + (this.rnd() - 0.5) * by);
  }

  roneat(t: number, m: number, vel: number, pan: number): void {
    t = this.loose(t);
    const f = mtof(m);
    const out = this.pan(pan, 0.28, 0.5);
    const body = this.gain(out);
    const L = 0.11 * vel;
    body.gain.setValueAtTime(0, t);
    body.gain.linearRampToValueAtTime(L, t + 0.003);
    body.gain.setTargetAtTime(0, t + 0.003, 0.32);
    this.osc('sine', f, t, 2, body);
    const oct = this.gain(out);
    oct.gain.setValueAtTime(0, t);
    oct.gain.linearRampToValueAtTime(L * 0.22, t + 0.003);
    oct.gain.setTargetAtTime(0, t + 0.003, 0.16);
    this.osc('sine', f * 2.01, t, 1, oct);
    // (the bar's bright, slightly sour partial)
    const part = this.gain(out);
    part.gain.setValueAtTime(0, t);
    part.gain.linearRampToValueAtTime(L * 0.3, t + 0.002);
    part.gain.setTargetAtTime(0, t + 0.002, 0.05);
    this.osc('sine', f * 3.93, t, 0.4, part);
    // (the mallet)
    const click = this.gain(this.filter('bandpass', 2600, 1.2, out));
    click.gain.setValueAtTime(0, t);
    click.gain.linearRampToValueAtTime(L * 0.6, t + 0.001);
    click.gain.setTargetAtTime(0, t + 0.001, 0.006);
    this.noise(t, 0.05, click);
  }

  khloy(t: number, m: number, dur: number, vel: number): void {
    t = this.loose(t, 0.012);
    const f = mtof(m);
    const out = this.pan(0.12, 0.55, 0.25);
    const g = this.gain(out);
    const L = 0.07 * vel;
    const a = Math.min(0.09, dur * 0.3);
    const r = Math.min(0.22, dur * 0.4);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(L, t + a);
    g.gain.setValueAtTime(L * 0.92, t + Math.max(a, dur - r));
    g.gain.linearRampToValueAtTime(0, t + dur + r);
    const o = this.osc('sine', f, t, dur + r + 0.05, g);
    const h = this.gain(out);
    h.gain.setValueAtTime(0, t);
    h.gain.linearRampToValueAtTime(L * 0.12, t + a);
    h.gain.setTargetAtTime(0, t + dur, r / 2);
    const o2 = this.osc('triangle', f * 2, t, dur + r + 0.05, h);
    // (it scoops up into the note, and the vibrato comes in late)
    for (const p of [o.frequency, o2.frequency]) {
      const target = p.value;
      p.setValueAtTime(target * 0.985, t);
      p.exponentialRampToValueAtTime(target, t + 0.06);
    }
    if (dur > 0.35) {
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 5.3;
      const depth = this.ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(0, t + 0.25);
      depth.gain.linearRampToValueAtTime(f * 0.007, t + Math.min(dur, 0.7));
      lfo.connect(depth);
      depth.connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + r + 0.05);
    }
    // (breath)
    const br = this.gain(this.filter('bandpass', f * 2, 2.5, out));
    br.gain.setValueAtTime(0, t);
    br.gain.linearRampToValueAtTime(L * 0.5, t + 0.03);
    br.gain.setTargetAtTime(L * 0.16, t + 0.05, 0.08);
    br.gain.setTargetAtTime(0, t + dur, r / 2);
    this.noise(t, dur + r, br);
  }

  pad(t: number, notes: readonly number[], dur: number, vel: number, night: boolean): void {
    const out = this.pan(0, 0.7);
    const lp = this.filter('lowpass', night ? 500 : 700, 0.4, out);
    const top = night ? 1100 : 1700;
    lp.frequency.setValueAtTime(night ? 500 : 700, t);
    lp.frequency.linearRampToValueAtTime(top, t + dur * 0.45);
    lp.frequency.linearRampToValueAtTime(night ? 600 : 900, t + dur);
    const g = this.gain(lp);
    const L = 0.022 * vel;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(L, t + Math.min(1.1, dur * 0.4));
    g.gain.setValueAtTime(L, t + dur * 0.75);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.6);
    for (const m of notes) {
      const f = mtof(m);
      this.osc('sawtooth', f, t, dur + 0.7, g, -7);
      this.osc('sawtooth', f, t, dur + 0.7, g, 7);
    }
  }

  bass(t: number, m: number, dur: number, vel: number): void {
    t = this.loose(t, 0.004);
    const f = mtof(m);
    const out = this.pan(0, 0.08);
    const lp = this.filter('lowpass', 420, 0.7, out);
    const g = this.gain(lp);
    const L = 0.16 * vel;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(L, t + 0.012);
    g.gain.setTargetAtTime(L * 0.55, t + 0.02, 0.18);
    g.gain.setTargetAtTime(0, t + dur, 0.06);
    this.osc('triangle', f, t, dur + 0.4, g);
    this.osc('sine', f / 2, t, dur + 0.4, g);
  }

  chhing(t: number, open: boolean, vel: number): void {
    t = this.loose(t, 0.006);
    const out = this.pan(0.35, open ? 0.3 : 0.12);
    const hp = this.filter('highpass', 2400, 0.7, out);
    const L = (open ? 0.016 : 0.012) * vel;
    const tau = open ? 0.42 : 0.035;
    for (const [f, k] of [[2960, 1], [4150, 0.8], [5320, 0.7], [6810, 0.55], [8460, 0.4], [10200, 0.3]] as const) {
      const g = this.gain(hp);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(L * k, t + 0.001);
      g.gain.setTargetAtTime(0, t + 0.001, tau * (1.2 - k * 0.4));
      this.osc('sine', f * (1 + (this.rnd() - 0.5) * 0.004), t, tau * 6 + 0.1, g);
    }
    const n = this.gain(this.filter('highpass', 6000, 0.7, out));
    n.gain.setValueAtTime(0, t);
    n.gain.linearRampToValueAtTime(L * 1.6, t + 0.001);
    n.gain.setTargetAtTime(0, t + 0.001, open ? 0.09 : 0.015);
    this.noise(t, open ? 0.6 : 0.1, n);
  }

  skor(t: number, kind: 'dum' | 'tak', vel: number): void {
    t = this.loose(t, 0.006);
    const out = this.pan(kind === 'dum' ? -0.1 : -0.3, 0.15);
    const g = this.gain(out);
    const dum = kind === 'dum';
    const L = (dum ? 0.42 : 0.16) * vel;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(L, t + 0.002);
    g.gain.setTargetAtTime(0, t + 0.002, dum ? 0.2 : 0.07);
    const o = this.osc('sine', dum ? 92 : 210, t, dum ? 1 : 0.4, g);
    o.frequency.setValueAtTime(dum ? 118 : 240, t);
    o.frequency.exponentialRampToValueAtTime(dum ? 58 : 185, t + (dum ? 0.14 : 0.05));
    const n = this.gain(this.filter(dum ? 'lowpass' : 'bandpass', dum ? 320 : 1400, dum ? 0.7 : 1.1, out));
    n.gain.setValueAtTime(0, t);
    n.gain.linearRampToValueAtTime(L * (dum ? 0.5 : 1.1), t + 0.001);
    n.gain.setTargetAtTime(0, t + 0.001, dum ? 0.03 : 0.02);
    this.noise(t, 0.2, n);
  }

  gong(t: number, vel: number): void {
    const out = this.pan(0, 0.6);
    const base = 98;
    for (const [k, a, tau] of [[1, 1, 5.5], [1.007, 0.6, 5], [1.52, 0.5, 3.5], [2.03, 0.45, 3], [2.71, 0.3, 2.2], [3.38, 0.22, 1.6], [4.2, 0.15, 1.1]] as const) {
      const g = this.gain(out);
      const L = 0.09 * vel * a;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(L, t + 0.006);
      g.gain.setTargetAtTime(0, t + 0.006, tau);
      const o = this.osc('sine', base * k, t, tau * 6, g);
      if (k === 1) {
        o.frequency.setValueAtTime(base * 0.995, t);
        o.frequency.linearRampToValueAtTime(base * 1.003, t + 1.2);
      }
    }
    const thud = this.gain(this.filter('lowpass', 500, 0.7, out));
    thud.gain.setValueAtTime(0, t);
    thud.gain.linearRampToValueAtTime(0.12 * vel, t + 0.002);
    thud.gain.setTargetAtTime(0, t + 0.002, 0.05);
    this.noise(t, 0.3, thud);
  }

  /** A breath of noise rising into a section, with a cymbal roll. */
  swell(at: number, len: number): void {
    len = Math.min(len, at);
    if (len < 0.2) return;
    const t = at - len;
    const out = this.pan(0, 0.6);
    const bp = this.filter('bandpass', 400, 1.4, out);
    bp.frequency.setValueAtTime(350, t);
    bp.frequency.exponentialRampToValueAtTime(4200, at);
    const g = this.gain(bp);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, at - 0.04);
    g.gain.linearRampToValueAtTime(0, at + 0.12);
    this.noise(t, len + 0.2, g);
    for (let k = 0; k < 6; k++) this.chhing(at - len * 0.5 + (k * len * 0.5) / 6, false, 0.25 + k * 0.08);
  }
}

/** A soft hall: stereo noise with a falling level and a darkening tone. */
function hall(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.round(seconds * sr);
  const buf = ctx.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    const rnd = mulberry32(301 + c * 17);
    let y = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const a = 1 - Math.exp((-2 * Math.PI * (500 + 6000 * Math.exp(-t * 1.8))) / sr);
      y += a * (rnd() * 2 - 1 - y);
      d[i] = y * Math.exp(-t * (6.9 / seconds)) * Math.min(1, t / 0.01) * 0.6;
    }
  }
  return buf;
}

function whiteNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const n = Math.round(seconds * ctx.sampleRate);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const rnd = mulberry32(5);
  for (let i = 0; i < n; i++) d[i] = rnd() * 2 - 1;
  return buf;
}
