import { isMade, mulberry32, obtain, range, warm, weighted, type Job, type Rng } from './dsp';

/**
 * The people's voices, synthesized (no recordings): a small formant speech
 * synthesizer — a glottal pulse with its natural wobble (jitter, shimmer)
 * and breath, five resonances of the vocal tract (a Klatt-style cascade),
 * a hiss for s and the bursts of the stops — says Khmer-like syllables along
 * a pitch line, into buffers made once and reused (in idle time after the
 * footsteps, `warmSpeech`; at once if wanted before):
 *
 * - `hello`: an adult's soft "ជម្រាបសួរ" (chum-reap suor) with the
 *   sampeah, falling at its end; four voices, women and men;
 * - `kidHello`: a child's bright "សួស្ដី!" (suo-sdey), high and quick;
 *   three voices;
 * - `vendor`: a seller calling out at the market, sing-song, the last
 *   syllable drawn out: "ទិញអីបង?" (what will you buy?), "ថោកៗ!"
 *   (cheap!), "ញ៉ាំអីបង?" (what will you eat?), "ចូលមើលសិន" (come and
 *   look), "ត្រីស្រស់!" (fresh fish!), "នំបញ្ចុក!" (rice noodles!);
 * - `chatter`: three people talking together (turns, a "បាទ" or "ចាស"
 *   between, now and then a laugh), 10 s, mono: the market's close voices
 *   and the hamlets' beds;
 * - `crowd`: a market crowd, six talkers each on their own, 9 s, stereo;
 * - `bark`: a village dog barking, two to four rough "wau"s (the same
 *   synthesizer with a dog's rough, breathy voice), three dogs.
 *
 * The talk's syllables are made up (Khmer-like onsets, vowels and
 * diphthongs, final nasals and unreleased stops): heard as talk, never as
 * words; the greetings and the calls are said.
 */

/** Rate of the greetings and calls (their top: 16 kHz), and of the talk loops (12 kHz: heard from some way off). */
const SR = 32000;
const LOOP_SR = 24000;
/** The voice's settings are eased every this many samples. */
const BLOCK = 16;

/** Who speaks. */
interface Talker {
  /** Speaking pitch (Hz). */
  f0: number;
  /** Vocal tract: every resonance × this (1 a man, ≈ 1.17 a woman, ≈ 1.3 a child). */
  tract: number;
  /** Breath in the voice (0‥0.4). */
  breath: number;
  /** How soft the voice is: its top (over 1.5 kHz) this much down (0.8 hushed … 0 plain); under 0 brighter (−0.5: calling out). */
  soft: number;
  /** Cycle-to-cycle wobble of the pitch (≈ 0.01) and of the loudness (≈ 0.05). */
  jitter: number;
  shimmer: number;
}

/** A syllable: onset (consonants joined by `+`), vowel (or diphthong), coda, length (s), pitch at its start and end (semitones over the talker's), loudness, extra breath. */
interface Syl {
  on: string;
  v: string;
  co: string;
  d: number;
  p: readonly [number, number];
  a?: number;
  b?: number;
}

// ── Sounds of speech ───────────────────────────────────────────────────────

type F3 = readonly [number, number, number];
/** Vowels: the first three resonances (Hz) of a man's voice. */
const VOWEL: Record<string, F3> = {
  a: [750, 1300, 2500],
  aa: [790, 1240, 2550],
  oa: [660, 1020, 2450],
  i: [290, 2250, 2950],
  e: [430, 2000, 2600],
  ae: [600, 1800, 2550],
  er: [500, 1400, 2450],
  eu: [330, 1450, 2350],
  u: [320, 820, 2300],
  o: [440, 860, 2400],
  aw: [600, 950, 2450],
};
/** Diphthongs: from one vowel to another. */
const GLIDE: Record<string, readonly [string, string]> = {
  ie: ['i', 'er'],
  ue: ['u', 'er'],
  ei: ['er', 'i'],
  ao: ['aa', 'o'],
  ai: ['a', 'i'],
  ou: ['o', 'u'],
  eua: ['eu', 'er'],
};

type Kind = 'stop' | 'asp' | 'imp' | 'nas' | 's' | 'l' | 'r' | 'y' | 'w' | 'h' | 'q';
interface Cons {
  k: Kind;
  /** Where the resonances point at the consonant (a man's; `null`: the vowel's own). */
  locus: F3 | null;
  /** The release: centre (Hz), level, length (s). */
  burst?: readonly [number, number, number];
}
const LAB: F3 = [250, 850, 2250];
const ALV: F3 = [260, 1750, 2650];
const PAL: F3 = [260, 2150, 2850];
const VEL: F3 = [260, 1650, 2250];
const CONS: Record<string, Cons> = {
  p: { k: 'stop', locus: LAB, burst: [1300, 0.25, 0.008] },
  ph: { k: 'asp', locus: LAB, burst: [1300, 0.25, 0.008] },
  b: { k: 'imp', locus: LAB },
  m: { k: 'nas', locus: LAB },
  t: { k: 'stop', locus: ALV, burst: [4000, 0.45, 0.01] },
  th: { k: 'asp', locus: ALV, burst: [4000, 0.45, 0.01] },
  d: { k: 'imp', locus: ALV },
  n: { k: 'nas', locus: ALV },
  l: { k: 'l', locus: [350, 1100, 2750] },
  r: { k: 'r', locus: [380, 1350, 2250] },
  s: { k: 's', locus: null, burst: [5600, 0.55, 0.085] },
  c: { k: 'stop', locus: PAL, burst: [3300, 0.5, 0.022] },
  ch: { k: 'asp', locus: PAL, burst: [3100, 0.5, 0.035] },
  ny: { k: 'nas', locus: PAL },
  y: { k: 'y', locus: [290, 2200, 2950] },
  k: { k: 'stop', locus: VEL, burst: [2300, 0.5, 0.012] },
  kh: { k: 'asp', locus: VEL, burst: [2300, 0.5, 0.012] },
  ng: { k: 'nas', locus: VEL },
  w: { k: 'w', locus: [320, 700, 2250] },
  h: { k: 'h', locus: null },
  q: { k: 'q', locus: null },
};

/** From `t` (s) the voice heads for: resonances (Hz), voicing, breath noise, hiss (and its centre), nasal murmur; how fast the levels (`ta`) and the resonances (`tf`) get there (s). */
interface Step {
  t: number;
  f: F3;
  av: number;
  ah: number;
  af: number;
  ff: number;
  nas: number;
  ta: number;
  tf: number;
}
interface Score {
  steps: Step[];
  /** The pitch line: [t (s), semitones over the talker's pitch]. */
  pitch: [number, number][];
  end: number;
}

const scale = (f: F3, k: number): F3 => [f[0] * k, f[1] * k, f[2] * k];

/** Build the score of an utterance: its syllables one after the other from `t0` (s). */
function score(syls: readonly Syl[], k: number, t0 = 0.03): Score {
  const steps: Step[] = [];
  const pitch: [number, number][] = [];
  const step = (s: Partial<Step> & { t: number; f: F3 }) => steps.push({ av: 0, ah: 0, af: 0, ff: 3000, nas: 0, ta: 0.008, tf: 0.018, ...s });
  let t = t0;
  syls.forEach((y, i) => {
    const a = y.a ?? 1;
    const g = GLIDE[y.v];
    const v0 = VOWEL[g ? g[0] : y.v] ?? VOWEL.a;
    const v1 = VOWEL[g ? g[1] : y.v] ?? v0;
    const end = t + y.d;
    const breath = y.b ?? 0;
    // ── the onset ──
    let fast = false;
    for (const tok of y.on ? y.on.split('+') : []) {
      const c = CONS[tok];
      if (!c) continue;
      const loc = scale(c.locus ?? v0, k);
      switch (c.k) {
        case 'stop':
          step({ t, f: loc, ta: 0.003, tf: 0.01 });
          t += 0.035;
          step({ t, f: loc, af: c.burst![1], ff: c.burst![0] * k ** 0.5, ta: 0.001 });
          t += c.burst![2];
          fast = true;
          break;
        case 'asp':
          step({ t, f: loc, ta: 0.003, tf: 0.01 });
          t += 0.03;
          step({ t, f: loc, af: c.burst![1], ff: c.burst![0] * k ** 0.5, ta: 0.001 });
          t += c.burst![2];
          step({ t, f: scale(v0, k), ah: 0.5, af: 0.08, ff: c.burst![0] * k ** 0.5, ta: 0.004, tf: 0.02 });
          t += 0.05;
          fast = true;
          break;
        case 'imp':
          step({ t, f: [200 * k, loc[1], loc[2]], av: 0.25 * a, ta: 0.006, tf: 0.012 });
          t += 0.045;
          fast = true;
          break;
        case 'nas':
          step({ t, f: [250 * k, loc[1], loc[2]], av: 0.5 * a, nas: 1, ta: 0.01, tf: 0.012 });
          t += 0.065;
          break;
        case 's':
          step({ t, f: scale(v0, k), af: c.burst![1], ff: c.burst![0] * k ** 0.7, ta: 0.008 });
          t += i === 0 ? 0.1 : c.burst![2];
          fast = true;
          break;
        case 'l':
          step({ t, f: loc, av: 0.7 * a, ta: 0.012 });
          t += 0.05;
          break;
        case 'r':
          // (the Khmer r: a quick trill, two taps)
          for (let j = 0; j < 4; j++) step({ t: t + j * 0.012, f: loc, av: (j % 2 ? 0.8 : 0.3) * a, ta: 0.003, tf: 0.012 });
          t += 0.05;
          break;
        case 'y':
        case 'w':
          step({ t, f: loc, av: 0.75 * a, ta: 0.01, tf: 0.015 });
          t += 0.04;
          break;
        case 'h':
          step({ t, f: scale(v0, k), av: 0.04, ah: 0.55, ta: 0.008 });
          t += 0.055;
          break;
        case 'q':
          step({ t, f: scale(v0, k), ta: 0.002 });
          t += 0.035;
          fast = true;
          break;
      }
    }
    // ── the vowel ──
    const co = y.co ? CONS[y.co] : null;
    const coLen = !co ? 0 : co.k === 'stop' ? 0.05 : co.k === 'nas' || co.k === 'h' ? 0.07 : 0.06;
    const vEnd = Math.max(t + 0.04, end - coLen);
    step({ t, f: scale(v0, k), av: a, ah: breath, ta: fast ? 0.005 : 0.012, tf: 0.02 });
    if (v1 !== v0) step({ t: t + (vEnd - t) * 0.45, f: scale(v1, k), av: a, ah: breath, ta: 0.02, tf: 0.045 });
    pitch.push([t, y.p[0]], [Math.max(t + 0.01, vEnd - 0.02), y.p[1]]);
    // ── the coda ──
    if (co) {
      const loc = scale(co.locus ?? v1, k);
      if (co.k === 'nas') step({ t: vEnd, f: [250 * k, loc[1], loc[2]], av: 0.5 * a, nas: 1, ta: 0.015, tf: 0.015 });
      else if (co.k === 'stop' || co.k === 'asp' || co.k === 'imp') step({ t: vEnd, f: loc, ta: 0.008, tf: 0.012 });
      else if (co.k === 'h') step({ t: vEnd, f: scale(v1, k), av: 0.08, ah: 0.35, ta: 0.02 });
      else if (co.k === 's') step({ t: vEnd, f: scale(v1, k), af: 0.4, ff: 5600 * k ** 0.7, ta: 0.01 });
      else step({ t: vEnd, f: loc, av: 0.8 * a, ah: breath, ta: 0.02, tf: 0.03 });
    }
    t = Math.max(end, vEnd + coLen);
    // (the last syllable: the voice dies away)
    if (i === syls.length - 1) step({ t, f: scale(v1, k), ta: 0.03 });
  });
  return { steps, pitch, end: t };
}

// ── The synthesizer ────────────────────────────────────────────────────────

/** One glottal cycle's flow slope (Rosenberg: opening 50 % of the cycle, closing 10 %, closed the rest), peak 1. */
const PN = 1024;
const OPEN = 0.6;
const PULSE = (() => {
  const tp = 0.5;
  const tn = OPEN - tp;
  const p = new Float32Array(PN + 1);
  let top = 0;
  for (let i = 0; i <= PN; i++) {
    const x = i / PN;
    const v = x < tp ? (Math.PI / (2 * tp)) * Math.sin((Math.PI * x) / tp) : x < OPEN ? -(Math.PI / (2 * tn)) * Math.sin((Math.PI * (x - tp)) / (2 * tn)) : 0;
    p[i] = v;
    top = Math.max(top, Math.abs(v));
  }
  for (let i = 0; i <= PN; i++) p[i] /= top;
  return p;
})();

/**
 * Say `sc` in `who`'s voice, adding it into `out` (and `out2`, for stereo,
 * `gains` left and right) from sample `at`, wrapping round the end (a loop
 * without a seam). Yields every few thousand samples (for idle time).
 */
function* speak(out: Float32Array, out2: Float32Array | null, gains: readonly [number, number], at: number, sr: number, who: Talker, sc: Score, seed: number): Generator<void, void, void> {
  const len = out.length;
  const n = Math.ceil((sc.end + 0.12) * sr);
  const steps = sc.steps;
  const pl = sc.pitch;
  let si = 0;
  let pi = 0;
  // Targets and where each is now: f1 f2 f3, av ah af ff nas.
  const tg = new Float64Array(8);
  const cu = new Float64Array(8);
  cu[0] = tg[0] = 500 * who.tract;
  cu[1] = tg[1] = 1500 * who.tract;
  cu[2] = tg[2] = 2500 * who.tract;
  cu[6] = tg[6] = 3000;
  let ta = 0.01;
  let tf = 0.02;
  let f0 = who.f0 * 2 ** ((pl[0]?.[1] ?? 0) / 12);
  // Resonators: F1–F5 in cascade, each [a, b, c, y1, y2]; the hiss's band (its gain 1 at the peak, none at DC): [b0, a1, a2, x1, x2, y1, y2].
  const R = new Float64Array(5 * 5);
  const H = new Float64Array(7);
  const band = (f: number, bw: number) => {
    const w = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr;
    const al = Math.sin(w) / (2 * (f / bw));
    H[0] = al / (1 + al);
    H[1] = (-2 * Math.cos(w)) / (1 + al);
    H[2] = (1 - al) / (1 + al);
  };
  const set = (j: number, f: number, bw: number) => {
    const o = j * 5;
    const c = -Math.exp((-2 * Math.PI * bw) / sr);
    const b = 2 * Math.exp((-Math.PI * bw) / sr) * Math.cos((2 * Math.PI * Math.min(f, sr * 0.45)) / sr);
    R[o] = 1 - b - c;
    R[o + 1] = b;
    R[o + 2] = c;
  };
  set(3, 3450 * who.tract, 250);
  set(4, 4400 * who.tract, 350);
  let s = seed >>> 0 || 1;
  const noise = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 2147483648 - 1;
  };
  let ph = 0;
  let jit = 1;
  let shim = 1;
  let tilt = 0;
  const tk = 1 - Math.exp((-2 * Math.PI * 1500) / sr);
  const soft = who.soft;
  let hx = 0;
  let hy = 0;
  const hr = 1 - (2 * Math.PI * 70) / sr;
  // (a slow drift of the pitch: a voice never holds a note quite still)
  const driftRate = 0.7 + (seed % 7) * 0.13;
  const g0 = gains[0];
  const g1 = gains[1];
  for (let i0 = 0; i0 < n; i0 += BLOCK) {
    const time = i0 / sr;
    while (si < steps.length && steps[si].t <= time) {
      const st = steps[si++];
      tg[0] = st.f[0];
      tg[1] = st.f[1];
      tg[2] = st.f[2];
      tg[3] = st.av;
      tg[4] = st.ah;
      tg[5] = st.af;
      tg[6] = st.ff;
      tg[7] = st.nas;
      ta = st.ta;
      tf = st.tf;
    }
    const ka = 1 - Math.exp(-BLOCK / (ta * sr));
    const kf = 1 - Math.exp(-BLOCK / (tf * sr));
    for (let j = 0; j < 3; j++) cu[j] += (tg[j] - cu[j]) * kf;
    for (let j = 3; j < 6; j++) cu[j] += (tg[j] - cu[j]) * ka;
    cu[6] += (tg[6] - cu[6]) * kf;
    cu[7] += (tg[7] - cu[7]) * kf;
    // Silent (a pause, a closure): skip the samples (the resonators have rung out in a few ms).
    if (cu[3] < 1e-4 && cu[4] < 1e-4 && cu[5] < 1e-4 && tg[3] < 1e-4 && tg[4] < 1e-4 && tg[5] < 1e-4) {
      if ((i0 & 4095) === 0) yield;
      continue;
    }
    // The pitch: along its line, eased, drifting a little.
    while (pi < pl.length - 1 && pl[pi + 1][0] <= time) pi++;
    const [pa, pv] = pl[pi] ?? [0, 0];
    const [pb, pw] = pl[pi + 1] ?? [pa, pv];
    const semis = time <= pa ? pv : time >= pb ? pw : pv + ((pw - pv) * (time - pa)) / (pb - pa);
    const target = who.f0 * 2 ** ((semis + 0.25 * Math.sin(2 * Math.PI * driftRate * time)) / 12);
    f0 += (target - f0) * (1 - Math.exp(-BLOCK / (0.03 * sr)));
    const nas = cu[7];
    set(0, cu[0], 80 + 90 * nas);
    set(1, cu[1], 100 * (1 + 1.5 * nas));
    set(2, cu[2], 150 * (1 + 1.5 * nas));
    const ff = cu[6];
    band(ff, 0.45 * ff);
    const av = cu[3];
    const ah = cu[4] + who.breath * av * 0.3;
    const af = cu[5];
    const i1 = Math.min(n, i0 + BLOCK);
    for (let i = i0; i < i1; i++) {
      ph += (f0 * jit) / sr;
      if (ph >= 1) {
        ph -= 1;
        jit = 1 + who.jitter * (noise() + noise() + noise()) * 0.6;
        shim = 1 + who.shimmer * (noise() + noise() + noise()) * 0.6;
      }
      const nz = noise();
      const x0 = av * shim * PULSE[(ph * PN) | 0] + ah * nz * (ph < OPEN ? 1 : 0.35);
      tilt += tk * (x0 - tilt);
      let x = x0 - soft * (x0 - tilt);
      for (let j = 0; j < 5; j++) {
        const o = j * 5;
        const y = R[o] * x + R[o + 1] * R[o + 3] + R[o + 2] * R[o + 4];
        R[o + 4] = R[o + 3];
        R[o + 3] = y;
        x = y;
      }
      // The hiss: noise in its band.
      const hn = nz * af;
      const hs = H[0] * (hn - H[4]) - H[1] * H[5] - H[2] * H[6];
      H[4] = H[3];
      H[3] = hn;
      H[6] = H[5];
      H[5] = hs;
      const v = x * (1 - 0.45 * nas) + hs * 0.7;
      // (no rumble under 70 Hz)
      hy = v - hx + hr * hy;
      hx = v;
      const k = (at + i) % len;
      out[k] += g0 * hy;
      if (out2) out2[k] += g1 * hy;
    }
    if ((i0 & 4095) === 0) yield;
  }
}

/** (checks) A steady vowel. */
export function* __vowel(v: string, who: Talker, d: number): Job {
  const sc = score([{ on: '', v, co: '', d, p: [0, 0] }], who.tract);
  const n = Math.ceil((sc.end + 0.15) * SR);
  const buf = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const x = new Float32Array(n);
  yield* speak(x, null, [1, 1], 0, SR, who, sc, 99);
  yield* level(x, SR, 0.2);
  buf.copyToChannel(x, 0);
  return buf;
}

/** A mono clip of `syls` said by `who`, its loudest 50 ms at RMS 0.2. */
function* clipJob(who: Talker, syls: readonly Syl[], seed: number): Job {
  const sc = score(syls, who.tract);
  const n = Math.ceil((sc.end + 0.15) * SR);
  const buf = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const d = new Float32Array(n);
  yield* speak(d, null, [1, 1], 0, SR, who, sc, seed);
  yield* level(d, SR, 0.2);
  buf.copyToChannel(d, 0);
  return buf;
}

/** Scale `d` so its loudest 50 ms has RMS `rms` (yields every 32k samples). */
function* level(d: Float32Array, sr: number, rms: number): Generator<void, void, void> {
  const w = Math.round(0.05 * sr);
  let sum = 0;
  let top = 0;
  for (let i = 0; i < d.length; i++) {
    sum += d[i] * d[i];
    if (i >= w) sum -= d[i - w] * d[i - w];
    if (sum > top) top = sum;
    if ((i & 32767) === 32767) yield;
  }
  const k = top > 0 ? rms / Math.sqrt(top / w) : 1;
  for (let i = 0; i < d.length; i++) {
    d[i] *= k;
    if ((i & 32767) === 32767) yield;
  }
}

// ── Voices ─────────────────────────────────────────────────────────────────

const man = (f0: number, o: Partial<Talker> = {}): Talker => ({ f0, tract: 1, breath: 0.12, soft: 0.2, jitter: 0.012, shimmer: 0.05, ...o });
const woman = (f0: number, o: Partial<Talker> = {}): Talker => ({ f0, tract: 1.17, breath: 0.16, soft: 0.15, jitter: 0.01, shimmer: 0.045, ...o });
const child = (f0: number, o: Partial<Talker> = {}): Talker => ({ f0, tract: 1.32, breath: 0.1, soft: -0.15, jitter: 0.012, shimmer: 0.05, ...o });
const syl = (on: string, v: string, co: string, d: number, p0: number, p1: number, a = 1): Syl => ({ on, v, co, d, p: [p0, p1], a });
/** A dog: a rough, breathy voice (its pitch and loudness wobbling hard). */
const dog = (f0: number, o: Partial<Talker> = {}): Talker => ({ f0, tract: 1.12, breath: 0.35, soft: -0.2, jitter: 0.07, shimmer: 0.25, ...o });
/** `n` barks, `gap` s apart: each a short "wau", up and falling. */
const barks = (n: number, gap: number): Syl[] => {
  const out: Syl[] = [];
  for (let i = 0; i < n; i++) {
    if (i) out.push({ on: 'q', v: 'er', co: '', d: gap - 0.14, p: [0, 0], a: 0 });
    out.push({ on: 'q', v: 'aa', co: 'w', d: 0.14, p: [3 - 0.5 * i, -2 - 0.5 * i], a: 1 - 0.1 * i, b: 0.35 });
  }
  return out;
};

/** "ជម្រាបសួរ": chum (c-u-m), reap (r-iə-p), suor (s-uə), the last falling away. */
const HELLO: readonly Syl[] = [syl('c', 'u', 'm', 0.17, 1, 1.5, 0.9), syl('r', 'ie', 'p', 0.22, 2.5, 2), syl('s', 'ue', '', 0.44, 1.5, -3.5, 0.9)];
/** "សួស្ដី!": suo (s-uə), sdey (s-ɗ-əj) up high and falling. */
const KID_HELLO: readonly Syl[] = [syl('s', 'ue', '', 0.24, 3, 4.5), syl('s+d', 'ei', '', 0.36, 7, 1)];
/** The sellers' calls (sung out: the last syllable long). */
const CALLS: readonly (readonly Syl[])[] = [
  // ទិញអីបង? tinh ey bong?
  [syl('t', 'i', 'ny', 0.2, 2, 3), syl('q', 'ei', '', 0.2, 5, 5.5), syl('b', 'oa', 'ng', 0.56, 6, 1)],
  // ថោកៗ! thaok thaok!
  [syl('th', 'ao', 'k', 0.26, 4, 5), syl('th', 'ao', 'k', 0.36, 6.5, 2)],
  // ញ៉ាំអីបង? nham ey bong?
  [syl('ny', 'aa', 'm', 0.24, 3, 4), syl('q', 'ei', '', 0.18, 6, 6), syl('b', 'oa', 'ng', 0.5, 5, 0)],
  // ចូលមើលសិន chaul meul sen
  [syl('c', 'o', 'l', 0.22, 3, 3), syl('m', 'er', 'l', 0.22, 4, 5), syl('s', 'er', 'n', 0.42, 6, 2)],
  // ត្រីស្រស់! trei sros!
  [syl('t+r', 'ei', '', 0.26, 4, 5), syl('s+r', 'oa', 'h', 0.42, 6.5, 1)],
  // នំបញ្ចុក! num banh chok!
  [syl('n', 'u', 'm', 0.2, 3, 3), syl('b', 'a', 'ny', 0.2, 4, 5), syl('c', 'o', 'k', 0.38, 7.5, 2)],
];

/** Every clip: a voice and what it says (`hello`: women 0 and 2, men 1 and 3; `kidHello`: the smallest child 2). */
const CLIPS = {
  hello: [
    [woman(205, { breath: 0.2, soft: 0.35 }), HELLO],
    [man(118, { soft: 0.4 }), HELLO],
    [woman(186, { breath: 0.24, soft: 0.45, jitter: 0.015 }), HELLO],
    [man(136, { soft: 0.3 }), HELLO],
  ],
  kidHello: [
    [child(318), KID_HELLO],
    [child(296, { tract: 1.28 }), KID_HELLO],
    [child(352, { tract: 1.38, breath: 0.14 }), KID_HELLO],
  ],
  vendor: [
    [woman(262, { soft: -0.4, breath: 0.1 }), CALLS[0]],
    [woman(248, { soft: -0.3, breath: 0.12 }), CALLS[1]],
    [woman(276, { soft: -0.45, breath: 0.1 }), CALLS[2]],
    [man(168, { soft: -0.25 }), CALLS[3]],
    [woman(240, { soft: -0.3, breath: 0.14, jitter: 0.014 }), CALLS[4]],
    [woman(270, { soft: -0.45, breath: 0.1 }), CALLS[5]],
  ],
  bark: [
    [dog(430), barks(3, 0.3)],
    [dog(520, { tract: 1.25 }), barks(4, 0.26)],
    [dog(360, { tract: 1.05 }), barks(2, 0.38)],
  ],
} satisfies Record<string, readonly (readonly [Talker, readonly Syl[]])[]>;

export type ClipKind = keyof typeof CLIPS;

// ── Talk ───────────────────────────────────────────────────────────────────

/** Khmer-like syllables to talk in: onsets, vowels, codas (weights). */
const ONSETS: readonly [string, number][] = [
  ['', 8], ['k', 10], ['kh', 4], ['c', 6], ['ch', 3], ['t', 7], ['th', 3], ['p', 4], ['ph', 2], ['b', 6], ['d', 6], ['m', 7], ['n', 6], ['ny', 3], ['ng', 3],
  ['r', 5], ['l', 5], ['s', 6], ['h', 4], ['y', 2], ['w', 2], ['q', 4], ['s+r', 2], ['k+r', 2], ['t+r', 2], ['s+d', 1], ['p+r', 1], ['s+m', 1],
];
const VOWELS: readonly [string, number][] = [
  ['a', 14], ['aa', 12], ['oa', 8], ['i', 8], ['e', 6], ['ae', 5], ['er', 9], ['eu', 4], ['u', 7], ['o', 7], ['aw', 5], ['ie', 4], ['ue', 4], ['ei', 4], ['ao', 3],
];
const CODAS: readonly [string, number][] = [
  ['', 35], ['m', 9], ['n', 10], ['ng', 10], ['ny', 3], ['p', 5], ['t', 6], ['k', 8], ['h', 6], ['y', 4], ['w', 3],
];
const pickW = (r: Rng, list: readonly [string, number][]): string => list[weighted(r, list.map((x) => x[1]))][0];

/** An utterance of `n` syllables: a gentle fall over it, some syllables up (the stressed), the last falling (or rising: a question). */
function utterance(r: Rng, n: number, lively: number): Syl[] {
  const out: Syl[] = [];
  const top = range(r, 0, 2.5) + lively;
  const question = r() < 0.2;
  for (let i = 0; i < n; i++) {
    const last = i === n - 1;
    // (a minor syllable before a main one: short, a neutral vowel, no coda)
    const minor = !last && r() < 0.2;
    const decl = top - (3 * i) / Math.max(1, n - 1);
    const up = !minor && r() < 0.3 ? range(r, 1.5, 3.5) : 0;
    const p0 = decl + up;
    const p1 = last ? (question ? p0 + range(r, 3, 5) : p0 - range(r, 2.5, 4.5)) : p0 + range(r, -0.8, 0.8);
    out.push({
      on: pickW(r, ONSETS),
      v: minor ? 'er' : pickW(r, VOWELS),
      co: minor ? '' : pickW(r, CODAS),
      d: minor ? range(r, 0.08, 0.11) : range(r, 0.13, 0.24) * (last ? 1.5 : 1),
      p: [p0, p1],
      a: minor ? 0.6 : range(r, 0.75, 1),
    });
  }
  return out;
}

/** "បាទ" (a man's yes) or "ចាស" (a woman's), or a plain "អា". */
const yes = (w: Talker, r: Rng): Syl[] => [w.tract > 1.08 ? syl('c', 'aa', 'h', range(r, 0.2, 0.28), 1, -1.5, 0.7) : r() < 0.7 ? syl('b', 'aa', 't', range(r, 0.2, 0.26), 0.5, -1, 0.7) : syl('q', 'aa', '', 0.22, 0, 1.5, 0.6)];
/** A laugh: a run of breathy "ha"s, falling. */
const laughs = (r: Rng): Syl[] => Array.from({ length: 3 + Math.floor(r() * 3) }, (_, i) => ({ on: 'h', v: 'a', co: '', d: range(r, 0.11, 0.15), p: [5 - i, 4 - i] as const, a: 0.8 - 0.1 * i, b: 0.3 }));

/** Three people talking: turns, answers, a laugh now and then; a mono loop of `seconds`. */
function* chatterJob(seconds: number, seed: number): Job {
  const r = mulberry32(seed);
  const n = Math.round(seconds * LOOP_SR);
  const d = new Float32Array(n);
  const people = [man(range(r, 112, 128)), woman(range(r, 195, 215)), woman(range(r, 222, 240), { tract: 1.2 })];
  const loud = [0.9, 1, 0.8];
  let t = 0;
  let who = 0;
  let k = 0;
  while (t < seconds) {
    const w = people[who];
    const syls = r() < 0.08 ? laughs(r) : utterance(r, 3 + Math.floor(r() * 8), who === 0 ? 0 : 1);
    const sc = score(syls, w.tract);
    yield* speak(d, null, [loud[who], 0], Math.round(t * LOOP_SR), LOOP_SR, w, sc, seed + ++k * 7919);
    // Someone answers while this one talks.
    if (r() < 0.3) {
      const o = (who + 1 + Math.floor(r() * 2)) % 3;
      const a = r() < 0.2 ? laughs(r) : yes(people[o], r);
      yield* speak(d, null, [loud[o] * 0.8, 0], Math.round((t + sc.end * range(r, 0.4, 0.9)) * LOOP_SR), LOOP_SR, people[o], score(a, people[o].tract), seed + ++k * 7919);
    }
    t += sc.end + range(r, -0.2, 0.6);
    who = r() < 0.25 ? who : (who + 1 + Math.floor(r() * 2)) % 3;
  }
  yield* level(d, LOOP_SR, 0.25);
  const buf = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: LOOP_SR });
  buf.copyToChannel(d, 0);
  return buf;
}

/** A market crowd: six talkers, each talking on and off where they stand (left to right); a stereo loop of `seconds`. */
function* crowdJob(seconds: number, seed: number): Job {
  const r = mulberry32(seed);
  const n = Math.round(seconds * LOOP_SR);
  const L = new Float32Array(n);
  const Rt = new Float32Array(n);
  const people = [man(range(r, 105, 125)), woman(range(r, 190, 210)), man(range(r, 125, 140), { tract: 1.03 }), woman(range(r, 210, 235)), child(range(r, 280, 320)), woman(range(r, 180, 200), { tract: 1.13 })];
  let k = 0;
  for (let p = 0; p < people.length; p++) {
    const w = people[p];
    const pan = -0.8 + (1.6 * p) / (people.length - 1) + range(r, -0.1, 0.1);
    const g = range(r, 0.45, 1);
    const gains = [g * Math.cos(((pan + 1) * Math.PI) / 4), g * Math.sin(((pan + 1) * Math.PI) / 4)] as const;
    let t = range(r, 0, 1.5);
    while (t < seconds) {
      const syls = r() < 0.05 ? laughs(r) : utterance(r, 2 + Math.floor(r() * 7), range(r, 0, 1.5));
      const sc = score(syls, w.tract);
      yield* speak(L, Rt, gains, Math.round(t * LOOP_SR), LOOP_SR, w, sc, seed + ++k * 6007);
      t += sc.end + range(r, 0.3, 1.8);
    }
  }
  // Both channels to one level: RMS 0.2, its peaks under 0.9.
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const a = L[i];
    const b = Rt[i];
    sum += a * a + b * b;
    peak = Math.max(peak, Math.abs(a), Math.abs(b));
    if ((i & 32767) === 32767) yield;
  }
  const k2 = Math.min(0.2 / Math.sqrt(sum / (2 * n) || 1), 0.9 / (peak || 1));
  for (let i = 0; i < n; i++) {
    L[i] *= k2;
    Rt[i] *= k2;
    if ((i & 32767) === 32767) yield;
  }
  const buf = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: LOOP_SR });
  buf.copyToChannel(L, 0);
  buf.copyToChannel(Rt, 1);
  return buf;
}

// ── Made once, reused ──────────────────────────────────────────────────────

/** Every buffer of speech, in the order they are warmed up. */
const SPEECH: Record<string, () => Job> = {};
for (const [kind, list] of Object.entries(CLIPS)) list.forEach(([who, syls], i) => (SPEECH[`speech-${kind}-${i}`] = () => clipJob(who, syls, 101 + i * 37 + kind.length * 1009)));
SPEECH['speech-chatter'] = () => chatterJob(10, 424242);
SPEECH['speech-crowd'] = () => crowdJob(9, 515151);

/** A clip of `kind`: one of its voices, picked with `r` (among `from`, the voices' indices, if given). */
export function clip(kind: ClipKind, r: Rng, from?: readonly number[]): AudioBuffer {
  const i = from?.length ? from[Math.floor(r() * from.length)] : Math.floor(r() * CLIPS[kind].length);
  const key = `speech-${kind}-${i}`;
  return obtain(key, SPEECH[key]);
}

/** The talk loops are made (they take tens of ms at once: until then the beds and the `market` calls wait for the warm-up). */
export const talkReady = (): boolean => isMade('speech-chatter') && isMade('speech-crowd');

/** Three people talking (mono, 10 s loop). */
export const chatter = (): AudioBuffer => obtain('speech-chatter', SPEECH['speech-chatter']);
/** A market crowd (stereo, 9 s loop). */
export const crowd = (): AudioBuffer => obtain('speech-crowd', SPEECH['speech-crowd']);

/** Make the voices ahead, a slice at a time, while `timeLeft()` (ms) allows; true once all are made. */
export function warmSpeech(timeLeft: () => number): boolean {
  return warm(SPEECH, timeLeft);
}

/** (for checks) Every clip kind and how many voices it has. */
export const CLIP_COUNTS: Readonly<Record<ClipKind, number>> = { hello: CLIPS.hello.length, kidHello: CLIPS.kidHello.length, vendor: CLIPS.vendor.length, bark: CLIPS.bark.length };
