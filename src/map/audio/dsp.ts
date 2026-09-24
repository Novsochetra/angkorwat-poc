/**
 * Small signal helpers for the map's sound: seeded random numbers, noise /
 * reverb / insect loop buffers (made once, then reused), envelopes.
 *
 * Everything takes a `BaseAudioContext`, so the same code runs live
 * (`AudioContext`) and offline (`OfflineAudioContext`, for measuring levels).
 */

export type Rng = () => number;

/** Seeded random numbers in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const range = (rnd: Rng, a: number, b: number): number => a + (b - a) * rnd();
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : Number.isFinite(v) ? v : 0);
export function pick<T>(rnd: Rng, xs: readonly T[]): T {
  return xs[Math.min(xs.length - 1, Math.floor(rnd() * xs.length))];
}
/** Index picked with the given weights. */
export function weighted(rnd: Rng, weights: readonly number[]): number {
  let sum = 0;
  for (const w of weights) sum += w;
  let r = rnd() * sum;
  for (let i = 0; i < weights.length; i++) if ((r -= weights[i]) < 0) return i;
  return weights.length - 1;
}
/** MIDI note → Hz. */
export const mtof = (m: number): number => 440 * 2 ** ((m - 69) / 12);

// ── Parameter moves ─────────────────────────────────────────────────────────

/** Move a parameter towards `v` (time constant `tc` s; 0 = jump now). */
export function glide(p: AudioParam, v: number, t: number, tc: number): void {
  if (tc > 0) p.setTargetAtTime(v, t, tc);
  else {
    p.cancelScheduledValues(t);
    p.setValueAtTime(v, t);
  }
}

/** A soft note on a gain: rise in `a` s to `peak`, hold, fall to 0 in `r` s, all within `dur`. */
export function note(p: AudioParam, t: number, dur: number, peak: number, a = 0.01, r = 0.03): void {
  a = Math.min(a, dur * 0.4);
  r = Math.min(r, dur * 0.5);
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.setValueAtTime(peak, t + dur - r);
  p.linearRampToValueAtTime(0, t + dur);
}

/** A struck gain: rise in `a` s to `peak`, then decay with time constant `tau`. */
export function strike(p: AudioParam, t: number, peak: number, a: number, tau: number): void {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.setTargetAtTime(0, t + a, tau);
}

/**
 * A biquad whose settings are read once per 128-sample block (k-rate): its
 * slow sweeps sound the same, and it costs far less than per-sample updates.
 */
export function biquad(ctx: BaseAudioContext, type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  for (const p of [b.frequency, b.Q, b.detune, b.gain]) {
    try {
      p.automationRate = 'k-rate';
    } catch {
      /* older browsers: stays a-rate */
    }
  }
  return b;
}

/** Disconnect `nodes` once `src` has stopped (keeps the graph small). */
export function cleanup(src: AudioScheduledSourceNode, nodes: AudioNode[]): void {
  src.onended = () => {
    for (const n of nodes) n.disconnect();
  };
}

// ── Buffers (made once, reused by every voice) ─────────────────────────────
//
// Source buffers are made at a fixed 48 kHz without a context (a buffer source
// plays any rate at the right speed), in small slices during idle time before
// the sound starts (`warmUp`), or all at once when first needed. Only the
// reverb's impulse must match the context's rate.

const RATE = 48000;
/** Samples made per slice (~1 ms of work). */
const SLICE = 16384;

type Job = Generator<void, AudioBuffer, void>;
const ready = new Map<string, AudioBuffer>();
const jobs = new Map<string, Job>();

function obtain(key: string, make: () => Job): AudioBuffer {
  let b = ready.get(key);
  if (b) return b;
  const job = jobs.get(key) ?? make();
  jobs.delete(key);
  let r = job.next();
  while (!r.done) r = job.next();
  ready.set(key, (b = r.value));
  return b;
}

const newBuffer = (channels: number, seconds: number, rate = RATE): AudioBuffer =>
  new AudioBuffer({ numberOfChannels: channels, length: Math.round(seconds * rate), sampleRate: rate });

/** Make `x` (length n + fade) loop without a seam: its tail is crossfaded into its head. */
function seamless(x: Float32Array, n: number, fade: number, out: Float32Array): void {
  for (let i = 0; i < n; i++) {
    if (i < fade) {
      const a = (i / fade) * (Math.PI / 2);
      out[i] = x[i] * Math.sin(a) + x[n + i] * Math.cos(a);
    } else out[i] = x[i];
  }
}

function normaliseRms(d: Float32Array, rms: number): void {
  let s = 0;
  for (let i = 0; i < d.length; i++) s += d[i] * d[i];
  const k = rms / Math.sqrt(s / d.length || 1);
  for (let i = 0; i < d.length; i++) d[i] *= k;
}

export type NoiseKind = 'white' | 'pink' | 'brown';

/** 5 s of looping stereo noise (channels independent), RMS 0.25. */
function* noiseJob(kind: NoiseKind): Job {
  const buf = newBuffer(2, 5);
  const n = buf.length;
  const fade = Math.round(0.1 * RATE);
  for (let c = 0; c < 2; c++) {
    const rnd = mulberry32(1013 + c * 7919 + kind.length * 131);
    const x = new Float32Array(n + fade);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0, dc = 0;
    for (let i0 = 0; i0 < x.length; i0 += SLICE) {
      for (let i = i0, i1 = Math.min(x.length, i0 + SLICE); i < i1; i++) {
        const w = rnd() * 2 - 1;
        if (kind === 'white') x[i] = w;
        else if (kind === 'pink') {
          // Paul Kellet's pink filter.
          b0 = 0.99886 * b0 + w * 0.0555179;
          b1 = 0.99332 * b1 + w * 0.0750759;
          b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856;
          b4 = 0.55 * b4 + w * 0.5329522;
          b5 = -0.7616 * b5 - w * 0.016898;
          x[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
          b6 = w * 0.115926;
        } else {
          // Leaky integrator, with the slow drift taken out.
          br = (br + 0.02 * w) / 1.02;
          dc += 0.0006 * (br - dc);
          x[i] = br - dc;
        }
      }
      yield;
    }
    const out = buf.getChannelData(c);
    seamless(x, n, fade, out);
    normaliseRms(out, 0.25);
    yield;
  }
  return buf;
}

/**
 * Reverb impulse response: 20 ms pre-delay, a few early reflections, then a
 * stereo noise tail (T60 ≈ 3.4 s) whose top end dies faster than its body —
 * a big stone hall / open valley.
 */
function* impulseJob(sr: number): Job {
  const buf = newBuffer(2, 4.2, sr);
  const n = buf.length;
  const pre = Math.round(0.02 * sr);
  const decay = Math.exp(-6.91 / (3.4 * sr));
  const tail = Math.round(0.4 * sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    const rnd = mulberry32(77 + c * 911);
    let env = 1, y1 = 0, y2 = 0, a = 1;
    for (let i0 = pre; i0 < n; i0 += SLICE) {
      for (let i = i0, i1 = Math.min(n, i0 + SLICE); i < i1; i++) {
        const t = (i - pre) / sr;
        if ((i & 63) === 0) a = 1 - Math.exp((-2 * Math.PI * (650 + 7500 * Math.exp(-t * 1.5))) / sr);
        y1 += a * (rnd() * 2 - 1 - y1);
        y2 += a * (y1 - y2);
        d[i] = y2 * env * Math.min(1, t / 0.008) * (i > n - tail ? (n - i) / tail : 1);
        env *= decay;
      }
      yield;
    }
    for (let k = 0; k < 12; k++) {
      const i = pre + Math.round((0.003 + rnd() * 0.075) * sr);
      d[i] += (rnd() < 0.5 ? -1 : 1) * 0.12 * (1 - k / 14);
    }
  }
  return buf;
}

/**
 * Leaves rustling: a stereo loop of short noise grains (4–50 ms) in drifting
 * clusters, high-passed — crackle and patter rather than a steady hiss.
 */
function* rustleJob(): Job {
  const seconds = 6.3;
  const buf = newBuffer(2, seconds);
  const n = buf.length;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    const rnd = mulberry32(4242 + c * 97);
    const ph = rnd() * 6.28;
    let t = 0;
    let made = 0;
    while (t < seconds) {
      const len = Math.round((0.004 + rnd() ** 2 * 0.045) * RATE);
      const i0 = Math.round(t * RATE);
      const amp = 0.2 + rnd() ** 2;
      for (let i = 0; i < len && i0 + i < n; i++) d[i0 + i] += amp * Math.sin((Math.PI * i) / len) ** 2 * (rnd() * 2 - 1);
      if ((made += len) > SLICE) {
        made = 0;
        yield;
      }
      // Denser in clusters that come and go (whole cycles over the loop).
      const dense = 0.5 + 0.5 * Math.sin((2 * Math.PI * 3 * t) / seconds + ph);
      t += -Math.log(1 - rnd() * 0.999) * (0.012 + 0.05 * (1 - dense));
    }
    // One-pole high-pass (~1.2 kHz) and low-pass (~7 kHz).
    const ah = Math.exp((-2 * Math.PI * 1200) / RATE);
    const al = 1 - Math.exp((-2 * Math.PI * 7000) / RATE);
    let lp = 0, hp = 0, prev = 0;
    for (let i = 0; i < n; i++) {
      hp = ah * (hp + d[i] - prev);
      prev = d[i];
      lp += al * (hp - lp);
      d[i] = lp;
    }
    normaliseRms(d, 0.25);
    yield;
  }
  return buf;
}

/** Add `v` at sample `i` of a loop of `n` samples (grains past the end wrap to the start: no seam). */
const addWrapped = (d: Float32Array, n: number, i: number, v: number): void => {
  d[i % n] += v;
};

/** One-pole high-pass (~`hz`) in place. */
function highpass1(d: Float32Array, hz: number): void {
  const a = Math.exp((-2 * Math.PI * hz) / RATE);
  let hp = 0, prev = 0;
  for (let i = 0; i < d.length; i++) {
    hp = a * (hp + d[i] - prev);
    prev = d[i];
    d[i] = hp;
  }
}

/** One-pole low-pass (~`hz`) in place. */
function lowpass1(d: Float32Array, hz: number): void {
  const a = 1 - Math.exp((-2 * Math.PI * hz) / RATE);
  let lp = 0;
  for (let i = 0; i < d.length; i++) d[i] = lp += a * (d[i] - lp);
}

/**
 * A waterfall's roar, far or near: a low rumble (brown noise under ~350 Hz)
 * and a broad body of pink noise above ~250 Hz, mixed once so a fall's
 * voice plays one loop. Stereo, channels independent.
 */
function* roarJob(): Job {
  const buf = newBuffer(2, 5.3);
  const n = buf.length;
  const fade = Math.round(0.1 * RATE);
  for (let c = 0; c < 2; c++) {
    const rnd = mulberry32(6060 + c * 1231);
    const low = new Float32Array(n + fade);
    const body = new Float32Array(n + fade);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0, dc = 0;
    for (let i0 = 0; i0 < low.length; i0 += SLICE) {
      for (let i = i0, i1 = Math.min(low.length, i0 + SLICE); i < i1; i++) {
        const w = rnd() * 2 - 1;
        br = (br + 0.02 * w) / 1.02;
        dc += 0.0006 * (br - dc);
        low[i] = br - dc;
        const v = rnd() * 2 - 1;
        b0 = 0.99886 * b0 + v * 0.0555179;
        b1 = 0.99332 * b1 + v * 0.0750759;
        b2 = 0.969 * b2 + v * 0.153852;
        b3 = 0.8665 * b3 + v * 0.3104856;
        b4 = 0.55 * b4 + v * 0.5329522;
        b5 = -0.7616 * b5 - v * 0.016898;
        body[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + v * 0.5362;
        b6 = v * 0.115926;
      }
      yield;
    }
    lowpass1(low, 350);
    lowpass1(low, 350);
    highpass1(body, 250);
    highpass1(body, 250);
    normaliseRms(low, 0.55);
    normaliseRms(body, 0.7);
    for (let i = 0; i < low.length; i++) low[i] += body[i];
    const out = buf.getChannelData(c);
    seamless(low, n, fade, out);
    normaliseRms(out, 0.25);
    yield;
  }
  return buf;
}

/**
 * Falling water up close: a dense crackle of tiny splashes (1–6 ms noise
 * grains) and bursting bubbles (short sine chirps that rise, as a bubble's
 * note does when it pops at the surface). Stereo loop, channels independent.
 */
function* splashJob(): Job {
  const seconds = 4.3;
  const buf = newBuffer(2, seconds);
  const n = buf.length;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    const rnd = mulberry32(5150 + c * 313);
    let t = 0;
    let made = 0;
    while (t < seconds) {
      const i0 = Math.round(t * RATE);
      if (rnd() < 0.8) {
        // A splash grain: a click of noise, brighter when short.
        const len = Math.round((0.001 + rnd() ** 2 * 0.005) * RATE);
        const amp = 0.08 + rnd() ** 3;
        for (let i = 0; i < len; i++) addWrapped(d, n, i0 + i, amp * Math.sin((Math.PI * i) / len) ** 2 * (rnd() * 2 - 1));
        made += len;
      } else {
        // A bubble: 6–30 ms, 0.5–4 kHz, rising by half.
        const len = Math.round((0.006 + rnd() * 0.024) * RATE);
        const f0 = 500 * 8 ** (rnd() ** 1.5);
        const amp = 0.25 * (0.15 + rnd() ** 2);
        let ph = 0;
        for (let i = 0; i < len; i++) {
          const x = i / len;
          ph += (2 * Math.PI * f0 * (1 + 0.5 * x)) / RATE;
          addWrapped(d, n, i0 + i, amp * Math.min(1, i / 48) * Math.exp(-4 * x) * Math.sin(ph));
        }
        made += len;
      }
      if (made > SLICE) {
        made = 0;
        yield;
      }
      // ~420 events a second, in loose clumps.
      t += -Math.log(1 - rnd() * 0.999) / 420;
    }
    highpass1(d, 600);
    lowpass1(d, 9000);
    normaliseRms(d, 0.25);
    yield;
  }
  return buf;
}

/**
 * A river babbling over stones: dark noise through a very resonant filter
 * whose note wanders fast and at random (after James McCartney's "babbling
 * brook"): two layers, one low and one higher. Stereo loop.
 */
function* babbleJob(): Job {
  const seconds = 7.3;
  const buf = newBuffer(2, seconds);
  const n = buf.length;
  const fade = Math.round(0.15 * RATE);
  const m = n + fade;
  const layers = [
    { centre: 480, swing: 330, rate: 14, gain: 1 },
    { centre: 1050, swing: 700, rate: 20, gain: 0.55 },
  ];
  for (let c = 0; c < 2; c++) {
    const rnd = mulberry32(8080 + c * 211);
    const x = new Float32Array(m);
    for (const L of layers) {
      // The wandering note: white noise smoothed twice at `rate` Hz, scaled to about ±1.
      const mod = new Float32Array(m);
      const a = 1 - Math.exp((-2 * Math.PI * L.rate) / RATE);
      let s1 = 0, s2 = 0, sq = 0;
      for (let i = 0; i < m; i++) {
        s1 += a * (rnd() * 2 - 1 - s1);
        s2 += a * (s1 - s2);
        mod[i] = s2;
        sq += s2 * s2;
      }
      const k = 0.55 / Math.sqrt(sq / m || 1);
      yield;
      // Dark carrier (brown noise, low-passed again) through a resonant high-pass (Q ≈ 30).
      let br = 0, lp = 0, ic1 = 0, ic2 = 0, g = 0, a1 = 0, a2 = 0, a3 = 0;
      const q = 1 / 30;
      for (let i0 = 0; i0 < m; i0 += SLICE) {
        for (let i = i0, i1 = Math.min(m, i0 + SLICE); i < i1; i++) {
          if ((i & 15) === 0) {
            const f = Math.min(4000, Math.max(190, L.centre + L.swing * mod[i] * k));
            g = Math.tan((Math.PI * f) / RATE);
            a1 = 1 / (1 + g * (g + q));
            a2 = g * a1;
            a3 = g * a2;
          }
          br = (br + 0.02 * (rnd() * 2 - 1)) / 1.02;
          lp += 0.01 * (br - lp);
          const v3 = lp - ic2;
          const v1 = a1 * ic1 + a2 * v3;
          const v2 = ic2 + a2 * ic1 + a3 * v3;
          ic1 = 2 * v1 - ic1;
          ic2 = 2 * v2 - ic2;
          x[i] += L.gain * (lp - q * v1 - v2) * (L.centre / 480) ** 1.5;
        }
        yield;
      }
    }
    highpass1(x, 120);
    const out = buf.getChannelData(c);
    seamless(x, n, fade, out);
    normaliseRms(out, 0.25);
    yield;
  }
  return buf;
}

/** A cricket: chirps of `pulses` short tone pulses, one every `every` s (jittered). Mono loop. */
function* chirpJob(s: { freq: number; every: number; pulses: number; rate: number; seconds: number; seed: number }): Job {
  const buf = newBuffer(1, s.seconds);
  const n = buf.length;
  const d = buf.getChannelData(0);
  const rnd = mulberry32(s.seed);
  const len = Math.round((0.62 / s.rate) * RATE);
  const chirpLen = s.pulses / s.rate;
  let t = rnd() * s.every * 0.5;
  while (t + chirpLen < s.seconds - 0.02) {
    const amp = 0.55 + 0.45 * rnd();
    const f = s.freq * (1 + (rnd() - 0.5) * 0.01);
    for (let p = 0; p < s.pulses; p++) {
      const i0 = Math.round((t + p / s.rate) * RATE);
      const pa = amp * (p === s.pulses - 1 ? 0.7 : 1);
      for (let i = 0; i < len && i0 + i < n; i++) {
        const x = i / len;
        const ph = 2 * Math.PI * f * (1 - 0.015 * x) * (i / RATE);
        d[i0 + i] += pa * Math.sin(Math.PI * x) ** 2 * (Math.sin(ph) + 0.08 * Math.sin(2 * ph));
      }
    }
    t += s.every * (0.85 + 0.3 * rnd()) * (rnd() < 0.08 ? 2 : 1);
    yield;
  }
  normaliseRms(d, 0.1);
  return buf;
}

/** A tree cricket: an endless soft trill that swells and fades. Mono loop. */
function* trillJob(s: { freq: number; rate: number; seconds: number; seed: number }): Job {
  const buf = newBuffer(1, s.seconds);
  const n = buf.length;
  const d = buf.getChannelData(0);
  const rnd = mulberry32(s.seed);
  // Whole numbers of cycles over the loop, so it wraps without a seam.
  const cyc = Math.round(s.freq * s.seconds);
  const pul = Math.round(s.rate * s.seconds);
  const p1 = rnd() * 6.28, p2 = rnd() * 6.28;
  for (let i0 = 0; i0 < n; i0 += SLICE) {
    for (let i = i0, i1 = Math.min(n, i0 + SLICE); i < i1; i++) {
      const x = i / n;
      const pulse = Math.max(0, Math.sin(2 * Math.PI * pul * x)) ** 2;
      const swell = 0.08 + 0.92 * ((0.5 + 0.5 * Math.sin(2 * Math.PI * 2 * x + p1)) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 3 * x + p2))) ** 1.5;
      d[i] = pulse * swell * Math.sin(2 * Math.PI * cyc * x);
    }
    yield;
  }
  normaliseRms(d, 0.1);
  return buf;
}

/** A katydid / cicada: a buzzy high swell now and then, silence between. Mono loop. */
function* buzzJob(s: { freq: number; seconds: number; seed: number }): Job {
  const buf = newBuffer(1, s.seconds);
  const n = buf.length;
  const d = buf.getChannelData(0);
  const rnd = mulberry32(s.seed);
  const swells: [number, number][] = [
    [0.4 + rnd() * 1.5, 3 + rnd() * 2.5],
    [s.seconds * 0.55 + rnd(), 2 + rnd() * 2],
  ];
  let ph = 0;
  for (const [t0, len] of swells) {
    const i0 = Math.round(t0 * RATE);
    const m = Math.min(n - i0, Math.round(len * RATE));
    for (let j0 = 0; j0 < m; j0 += SLICE) {
      for (let i = j0, i1 = Math.min(m, j0 + SLICE); i < i1; i++) {
        const x = i / m;
        const env = Math.sin(Math.PI * x) ** 1.5 * (x < 0.15 ? x / 0.15 : 1);
        const tt = i / RATE;
        const am = Math.max(0, Math.sin(2 * Math.PI * 118 * tt)) ** 3;
        ph += (2 * Math.PI * s.freq * (1 + 0.004 * Math.sin(2 * Math.PI * 7 * tt))) / RATE;
        d[i0 + i] += env * am * (Math.sin(ph) + 0.15 * Math.sin(1.5 * ph));
      }
      yield;
    }
  }
  normaliseRms(d, 0.06);
  return buf;
}

/** Every source buffer, in the order they are warmed up (the day's first). */
const SOURCES = {
  'noise-pink': () => noiseJob('pink'),
  'noise-brown': () => noiseJob('brown'),
  rustle: rustleJob,
  roar: roarJob,
  splash: splashJob,
  babble: babbleJob,
  'noise-white': () => noiseJob('white'),
  [`impulse-${RATE}`]: () => impulseJob(RATE),
  'cricket-a': () => chirpJob({ freq: 4700, every: 0.64, pulses: 3, rate: 30, seconds: 5.3, seed: 11 }),
  'cricket-b': () => chirpJob({ freq: 4100, every: 0.93, pulses: 4, rate: 24, seconds: 6.7, seed: 23 }),
  trill: () => trillJob({ freq: 3000, rate: 42, seconds: 7.9, seed: 5 }),
  buzz: () => buzzJob({ freq: 5600, seconds: 12.7, seed: 9 }),
} satisfies Record<string, () => Job>;

export type SourceName = 'rustle' | 'roar' | 'splash' | 'babble' | 'cricket-a' | 'cricket-b' | 'trill' | 'buzz';
/** A named source loop (leaves, water, insects). */
export const source = (name: SourceName): AudioBuffer => obtain(name, SOURCES[name]);
/** Looping stereo noise. */
export const noise = (kind: NoiseKind): AudioBuffer => obtain(`noise-${kind}`, SOURCES[`noise-${kind}`]);
/** The reverb's impulse response, at the context's rate. */
export const impulse = (ctx: BaseAudioContext): AudioBuffer => obtain(`impulse-${ctx.sampleRate}`, () => impulseJob(ctx.sampleRate));

/**
 * Make the buffers ahead, a slice at a time, while `timeLeft()` (ms) allows.
 * Returns true once all are made. Call it from idle time before sound starts.
 */
export function warmUp(timeLeft: () => number): boolean {
  for (const [key, make] of Object.entries(SOURCES) as [string, () => Job][]) {
    if (ready.has(key)) continue;
    let job = jobs.get(key);
    if (!job) jobs.set(key, (job = make()));
    for (;;) {
      if (timeLeft() < 2) return false;
      const r = job.next();
      if (r.done) {
        ready.set(key, r.value);
        jobs.delete(key);
        break;
      }
    }
  }
  return true;
}

// ── Wave shapes ─────────────────────────────────────────────────────────────

const waves = new WeakMap<BaseAudioContext, Map<string, PeriodicWave>>();
/** A soft wave: harmonics falling off as 1/n^`slope` (pads and drone). */
export function softWave(ctx: BaseAudioContext, slope: number, harmonics: number): PeriodicWave {
  let m = waves.get(ctx);
  if (!m) waves.set(ctx, (m = new Map()));
  const key = `${slope}-${harmonics}`;
  let w = m.get(key);
  if (!w) {
    const real = new Float32Array(harmonics + 1);
    const imag = new Float32Array(harmonics + 1);
    for (let h = 1; h <= harmonics; h++) imag[h] = (h % 2 ? 1 : 0.7) / h ** slope;
    m.set(key, (w = ctx.createPeriodicWave(real, imag)));
  }
  return w;
}

/** Soft-clip curve: straight up to `knee`, then bends smoothly to never pass `ceil`. */
export function softClipCurve(knee: number, ceil: number, size = 4097): Float32Array<ArrayBuffer> {
  const c = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    const ax = Math.abs(x);
    const y = ax <= knee ? ax : knee + (ceil - knee) * Math.tanh((ax - knee) / (ceil - knee));
    c[i] = Math.sign(x) * y;
  }
  return c;
}
