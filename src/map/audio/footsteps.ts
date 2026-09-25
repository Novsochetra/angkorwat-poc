import grassUrl from '../../../assets/sound/footsteps-jogging-through-grass-smartsound-fx-feethmnrunning-on-dry-grass-05-1-0m05s.mp3?url';
import concreteUrl from '../../../assets/sound/footsteps-running-on-concrete-boots-gfx-sounds-1-00-05.mp3?url';
import woodUrl from '../../../assets/sound/footsteps-walking-on-wood-sneakers-gfx-sounds-2-2-00-14.mp3?url';
import waterUrl from '../../../assets/sound/footsteps-walking-through-water-mud-vadi-sound-1-1-00-16.mp3?url';

/**
 * The explorer's footsteps are recordings (`assets/sound/`): jogging on dry
 * grass, boots running on concrete, sneakers walking on wood, walking
 * through water and mud. Each recording is cut into single steps when it
 * loads, and `explorer.ts` plays one per footfall.
 *
 * Cutting: the level in 5 ms frames; a step starts where the level jumps
 * well over the last 40 ms and over the recording's running floor (at least
 * 0.18 s after the one before). The quiet ones (far under the loud steps)
 * are dropped, and so are those that barely rise over the tail of the step
 * before, and a lone click (a twig, the microphone knocked) with no step
 * after it. Each step runs from 5 ms before its onset to just before the
 * next one (or its recording's longest step), its silent tail trimmed, with
 * short fades so it never clicks. Repeats (a recording looping the same
 * steps) are kept once. Every step is levelled on how loud it sounds: its
 * loudest 100 ms, weighted as the ear hears (so every recording comes out
 * about as loud, whether it crunches, thuds or sloshes).
 *
 * Loading: the bytes are fetched as soon as the map's sound is made
 * (`prefetchFootsteps`, tried three times), then decoded and cut once
 * (`loadFootsteps`): in idle time before the sound starts, on an offline
 * context of our own, or on the live one if it starts first. A recording
 * that fails is tried again on the next `loadFootsteps` (`audio.ts` asks a
 * few times); only its grounds are synthesized meanwhile. The steps are
 * plain mono `AudioBuffer`s: any context plays them (the live one, or an
 * offline one for measuring).
 */

export type StepSet = 'grass' | 'concrete' | 'wood' | 'water';
export type StepSets = Readonly<Record<StepSet, readonly AudioBuffer[]>>;
/** `footstepsState`: not asked for yet, loading, every recording cut, some failed (their grounds are synthesized), all failed. */
export type FootstepsState = 'idle' | 'loading' | 'ready' | 'partial' | 'failed';

const FILES: Record<StepSet, { url: string; /** Longest step (s): the recording's pace. */ maxLen: number }> = {
  grass: { url: grassUrl, maxLen: 0.4 },
  concrete: { url: concreteUrl, maxLen: 0.4 },
  wood: { url: woodUrl, maxLen: 0.48 },
  water: { url: waterUrl, maxLen: 0.5 },
};
const SETS = Object.keys(FILES) as StepSet[];

/** Level frames (s). */
const FRAME = 0.005;
/** An onset: the level this much (dB) over the lowest of the last `LOOK` frames… */
const RISE = 9;
const LOOK = 8;
/** …and this much over the running floor (the 20th percentile over ±0.5 s). */
const OVER_FLOOR = 10;
/** Steps closer than this are one (s): a heel and its toe. */
const MIN_GAP = 0.18;
/** Dropped: steps this much (dB) under the loud ones (the 90th percentile)… */
const QUIET = 12;
/** …and steps rising less than this (dB) over what sounds just before them. */
const CLEAR = 10;
/** Shortest step kept (s). */
const MIN_LEN = 0.12;
/** A lone click, not a step: its peak this much (dB) over its loudest 20 ms RMS. */
const CLICK = 20;
/** Every step's loudest 100 ms RMS, weighted (−20 dBFS: the loud grains of a crunch peak near 0 dBFS). */
const TARGET = 0.1;

/** Each recording's bytes, fetching or fetched (dropped once it is cut, or when the fetch failed: the next load fetches again). */
const bytes = new Map<StepSet, Promise<ArrayBuffer | null>>();
/** Each recording being decoded and cut (dropped when it failed, so the next load tries again). */
const loads = new Map<StepSet, Promise<void>>();
/** Each recording's steps, once cut. */
const cut: Partial<Record<StepSet, AudioBuffer[]>> = {};
let busy = 0;
let tried = false;
let offline: OfflineAudioContext | null = null;
const warned = new Set<string>();

function warn(what: string, e: unknown): void {
  if (warned.has(what)) return;
  warned.add(what);
  console.warn(`[map] footsteps: ${what} (synthesized steps on its grounds meanwhile):`, e);
}

const wait = (ms: number) => new Promise((next) => setTimeout(next, ms));

/** Start fetching the recordings that are not fetched or cut yet. No decoding: that needs a context. */
export function prefetchFootsteps(): void {
  for (const k of SETS) if (!cut[k] && !bytes.has(k)) bytes.set(k, fetchBytes(k));
}

/** A recording's bytes: three tries, a second and then two apart (`null`: it failed). */
async function fetchBytes(k: StepSet): Promise<ArrayBuffer | null> {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(FILES[k].url);
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return await r.arrayBuffer();
    } catch (e) {
      if (i < 3) await wait(1000 * i);
      else {
        warn(`could not fetch the ${k} recording`, e);
        bytes.delete(k);
        return null;
      }
    }
  }
}

/**
 * The cut steps of every recording loaded so far, `null` if none. Decodes
 * and cuts what is not yet (on `ctx`, or without one on an offline context
 * of our own: no need to wait for the sound to start); a recording that
 * failed before is tried again. Never rejects.
 */
export async function loadFootsteps(ctx?: BaseAudioContext): Promise<StepSets | null> {
  prefetchFootsteps();
  const t0 = performance.now();
  const fresh = SETS.filter((k) => !cut[k] && !loads.has(k));
  for (const k of fresh) {
    const p = loadOne(k, ctx).finally(() => {
      busy--;
      if (!cut[k]) loads.delete(k);
    });
    busy++;
    loads.set(k, p);
  }
  tried = true;
  await Promise.all(SETS.map((k) => loads.get(k)));
  if (fresh.length) {
    const counts = SETS.map((k) => `${k} ${cut[k]?.length ?? 'failed'}`).join(', ');
    console.info(`[map] footsteps: ${counts} (${Math.round(performance.now() - t0)} ms)`);
  }
  return SETS.some((k) => cut[k]?.length) ? (Object.fromEntries(SETS.map((k) => [k, cut[k] ?? []])) as Record<StepSet, AudioBuffer[]>) : null;
}

/** Where the recorded footsteps are, and how many steps each recording gave. */
export function footstepsState(): { state: FootstepsState; counts: Partial<Record<StepSet, number>> } {
  const counts: Partial<Record<StepSet, number>> = {};
  for (const k of SETS) if (cut[k]) counts[k] = cut[k].length;
  const n = SETS.filter((k) => cut[k]?.length).length;
  const state = busy ? 'loading' : !tried ? 'idle' : n === SETS.length ? 'ready' : n ? 'partial' : 'failed';
  return { state, counts };
}

/** Fetch (if not yet), decode and cut one recording into `cut`. */
async function loadOne(k: StepSet, ctx?: BaseAudioContext): Promise<void> {
  const b = await (bytes.get(k) ?? fetchBytes(k));
  if (!b) return;
  try {
    const buf = await decode(b, ctx);
    // Cut in slices of a few milliseconds, one task each, so it never holds up a frame.
    const job = cutJob(buf, FILES[k].maxLen);
    for (let r = job.next(); ; r = job.next()) {
      if (r.done) {
        cut[k] = r.value;
        break;
      }
      await wait(0);
    }
    bytes.delete(k);
  } catch (e) {
    warn(`could not decode the ${k} recording`, e);
  }
}

/** Decode on `ctx`; without one, or if it refuses, on an offline context of our own (the typewriter's recording too). */
export async function decode(b: ArrayBuffer, ctx?: BaseAudioContext): Promise<AudioBuffer> {
  // (copies: decoding takes the bytes away)
  if (ctx) {
    try {
      return await ctx.decodeAudioData(b.slice(0));
    } catch {
      /* an offline context may still decode it */
    }
  }
  offline ??= new OfflineAudioContext(1, 1, 48000);
  return offline.decodeAudioData(b.slice(0));
}

interface Onset {
  /** Frame of the onset. */
  f: number;
  /** Loudest frame in the 60 ms after it (dB). */
  peak: number;
}

/** Cut a recording into single steps (mono buffers at its rate), each no longer than `maxLen` s. */
export function cutSteps(buf: AudioBuffer, maxLen: number): AudioBuffer[] {
  const job = cutJob(buf, maxLen);
  let r = job.next();
  while (!r.done) r = job.next();
  return r.value;
}

/** `cutSteps` in slices: it yields between them. */
function* cutJob(buf: AudioBuffer, maxLen: number): Generator<void, AudioBuffer[], void> {
  const sr = buf.sampleRate;
  const n = buf.length;
  // Mono, the rumble under 45 Hz taken out (no speaker plays it; it only eats headroom).
  const x = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) x[i] += d[i] / buf.numberOfChannels;
  }
  highpass(x, 45, sr);
  yield;

  // Level in frames (dB).
  const F = Math.round(sr * FRAME);
  const nf = Math.floor(n / F);
  const L = new Float32Array(nf);
  for (let f = 0; f < nf; f++) {
    let s = 0;
    for (let i = f * F; i < (f + 1) * F; i++) s += x[i] * x[i];
    L[f] = 10 * Math.log10(s / F + 1e-12);
  }
  // Running floor: the 20th percentile over ±0.5 s (worked out every 10 frames).
  const floor = new Float32Array(nf);
  const W = Math.round(0.5 / FRAME);
  for (let f0 = 0; f0 < nf; f0 += 10) {
    const win = L.slice(Math.max(0, f0 - W), Math.min(nf, f0 + W)).sort();
    floor.fill(win[Math.floor(0.2 * (win.length - 1))], f0, Math.min(nf, f0 + 10));
  }
  yield;

  // Onsets: where the level jumps (the first frame of each jump).
  const PEAK = Math.round(0.06 / FRAME);
  let found: Onset[] = [];
  let was = false;
  for (let f = LOOK; f < nf - PEAK; f++) {
    let lo = Infinity;
    for (let j = f - LOOK; j < f; j++) lo = Math.min(lo, L[j]);
    const is = L[f] - lo >= RISE && L[f] >= floor[f] + OVER_FLOOR;
    if (is && !was) {
      let peak = -Infinity;
      for (let j = f; j < f + PEAK; j++) peak = Math.max(peak, L[j]);
      found.push({ f, peak });
    }
    was = is;
  }
  if (!found.length) return [];
  found = oneEvery(found);
  const loud = found.map((o) => o.peak).sort((a, b) => a - b)[Math.floor(0.9 * (found.length - 1))];
  // Only the steps that are loud enough delimit steps (a small scuff stays in the step before).
  const on = oneEvery(found.filter((o) => o.peak >= loud - QUIET));

  interface Cut {
    start: number;
    end: number;
  }
  const cuts: Cut[] = [];
  for (let k = 0; k < on.length; k++) {
    const o = on[k];
    // What sounds just before (the tail of the step before): the step must stand out of it.
    let pre = 0;
    for (let j = Math.max(0, o.f - LOOK); j < o.f - 1; j++) pre += 10 ** (L[j] / 10);
    const clear = o.peak - 10 * Math.log10(pre / Math.max(1, Math.min(o.f, LOOK) - 1) + 1e-12);
    const start = Math.max(0, (o.f - 1) * F);
    let end = Math.min(k + 1 < on.length ? (on[k + 1].f - 1) * F : n, start + Math.round(maxLen * sr));
    // The tail ends where it has died into the floor (or 50 dB under the step), plus 20 ms.
    const quiet = Math.max(floor[o.f] + 4, o.peak - 50);
    let last = o.f;
    for (let f = o.f; f < Math.floor(end / F); f++) if (L[f] > quiet) last = f;
    end = Math.min(end, (last + 4) * F);
    if (clear < CLEAR || (end - start) / sr < MIN_LEN || crest(x, start, end, sr) > CLICK) continue;
    cuts.push({ start, end });
  }

  // Repeats: the same level shape (1 ms frames, first 150 ms, within ±6 ms) is the same step.
  yield;
  const shapes = cuts.map((c) => shape(x, c.start, sr));
  const keep = cuts.filter((_, i) => !shapes.slice(0, i).some((s) => s && shapes[i] && sameShape(s, shapes[i]!)));
  yield;
  // Weighted as the ear hears, to level by: BS.1770's K-weighting, a +4 dB shelf over 1.5 kHz (its lows are cut above).
  const heard = x.slice();
  highShelf(heard, 1500, 4, sr);
  yield;

  const steps: AudioBuffer[] = [];
  for (const { start, end } of keep) {
    if (steps.length % 8 === 7) yield;
    const len = end - start;
    const out = new AudioBuffer({ numberOfChannels: 1, length: len, sampleRate: sr });
    const d = x.slice(start, end);
    // Fades: 3 ms in, out over the last ~quarter (15–60 ms), both half cosines.
    const fin = Math.round(0.003 * sr);
    const fout = Math.round(Math.min(0.06, Math.max(0.015, 0.25 * (len / sr))) * sr);
    for (let i = 0; i < fin; i++) d[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fin);
    for (let i = 0; i < fout; i++) d[len - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fout);
    // Level: the loudest 100 ms, weighted → TARGET.
    const top = loudest(heard, start, end, Math.round(0.1 * sr));
    const k = top > 0 ? TARGET / Math.sqrt(top) : 1;
    for (let i = 0; i < len; i++) d[i] *= k;
    out.copyToChannel(d, 0);
    steps.push(out);
  }
  return steps;
}

/** The loudest mean square of `x[a‥b)` over `w` samples (a sliding sum). */
export function loudest(x: Float32Array, a: number, b: number, w: number): number {
  w = Math.max(1, Math.min(b - a, w));
  let sum = 0;
  let top = 0;
  for (let i = a; i < b; i++) {
    sum += x[i] * x[i];
    if (i - a >= w) sum -= x[i - w] * x[i - w];
    if (i - a >= w - 1) top = Math.max(top, sum / w);
  }
  return top;
}

/** How far (dB) the loudest sample of `x[a‥b)` stands over its loudest 20 ms RMS (a lone click stands far out). */
function crest(x: Float32Array, a: number, b: number, sr: number): number {
  let peak = 0;
  for (let i = a; i < b; i++) peak = Math.max(peak, Math.abs(x[i]));
  return 20 * Math.log10((peak + 1e-12) / Math.sqrt(loudest(x, a, b, Math.round(0.02 * sr)) + 1e-24));
}

/** One onset per `MIN_GAP`: the first, unless a later one within it is far louder (6 dB). */
function oneEvery(list: Onset[]): Onset[] {
  const out: Onset[] = [];
  for (const o of list) {
    const prev = out[out.length - 1];
    if (prev && (o.f - prev.f) * FRAME < MIN_GAP) {
      if (o.peak > prev.peak + 6) out[out.length - 1] = o;
      continue;
    }
    out.push(o);
  }
  return out;
}

/** Level shape of a step: 1 ms frames over its first 150 ms (dB under its loudest). */
function shape(x: Float32Array, start: number, sr: number): Float32Array | null {
  const F = Math.round(sr * 0.001);
  const nf = 150;
  if (start + nf * F > x.length) return null;
  const s = new Float32Array(nf);
  let top = -Infinity;
  for (let f = 0; f < nf; f++) {
    let e = 0;
    for (let i = start + f * F; i < start + (f + 1) * F; i++) e += x[i] * x[i];
    s[f] = 10 * Math.log10(e / F + 1e-12);
    top = Math.max(top, s[f]);
  }
  for (let f = 0; f < nf; f++) s[f] -= top;
  return s;
}

/** Two level shapes within 1.5 dB of each other on average, at the best lag (±6 ms). */
function sameShape(a: Float32Array, b: Float32Array): boolean {
  for (let lag = -6; lag <= 6; lag++) {
    let sum = 0;
    let n = 0;
    for (let i = Math.max(0, lag); i < a.length && i - lag < b.length; i++) {
      sum += Math.abs(a[i] - b[i - lag]);
      n++;
    }
    if (n > 100 && sum / n < 1.5) return true;
  }
  return false;
}

/** A 2nd-order highpass at `f` Hz, in place. */
export function highpass(x: Float32Array, f: number, sr: number): void {
  const w = (2 * Math.PI * f) / sr;
  const cs = Math.cos(w);
  const al = Math.sin(w) / (2 * Math.SQRT1_2);
  const a0 = 1 + al;
  biquadRun(x, (1 + cs) / 2 / a0, -(1 + cs) / a0, (1 + cs) / 2 / a0, (-2 * cs) / a0, (1 - al) / a0);
}

/** A high shelf: `db` over `f` Hz (Q 0.71), in place. */
export function highShelf(x: Float32Array, f: number, db: number, sr: number): void {
  const A = 10 ** (db / 40);
  const w = (2 * Math.PI * f) / sr;
  const cs = Math.cos(w);
  const s = 2 * Math.sqrt(A) * (Math.sin(w) / (2 * Math.SQRT1_2));
  const a0 = A + 1 - (A - 1) * cs + s;
  const b0 = (A * (A + 1 + (A - 1) * cs + s)) / a0;
  const b1 = (-2 * A * (A - 1 + (A + 1) * cs)) / a0;
  const b2 = (A * (A + 1 + (A - 1) * cs - s)) / a0;
  biquadRun(x, b0, b1, b2, (2 * (A - 1 - (A + 1) * cs)) / a0, (A + 1 - (A - 1) * cs - s) / a0);
}

/** A biquad (coefficients divided by a0) over `x`, in place. */
function biquadRun(x: Float32Array, b0: number, b1: number, b2: number, a1: number, a2: number): void {
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    const y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = v;
    y2 = y1;
    y1 = y;
    x[i] = y;
  }
}
