import typewriterUrl from '../../../assets/sound/typewriter-fast-typing-gfx-sounds-5-5-00-02.mp3?url';
import { decode, highShelf, highpass, loudest } from './footsteps';

/**
 * The story's typewriter strikes are a recording (`assets/sound/`: fast
 * typing on an old typewriter), cut into single strikes when it loads;
 * `typing.ts` plays one per word (synthesized strikes until then, or if it
 * fails).
 *
 * Cutting: the level in 5 ms frames; a strike is where the level jumps
 * (9 dB over the last 30 ms) close to the loudest ones (within 8 dB), at
 * least 50 ms after the one before. The softer click just before a strike
 * (the key going down, within 70 ms) is kept with it: `lead` is how far
 * into the cut the strike itself comes, so it can land on time. Each cut
 * runs to just before the next one (at most 0.25 s after its strike), its
 * silent tail trimmed, with short fades, levelled on its loudest 50 ms as
 * the ear hears it.
 *
 * Loading: the bytes are fetched as soon as the map's sound is made
 * (`prefetchTypewriter`), then decoded and cut once (`loadTypewriter`): in
 * idle time, or on the live context if it starts first. A failed load is
 * tried again on the next `loadTypewriter`.
 */

export interface Strike {
  /** Mono, at the recording's rate: any context plays it. */
  buf: AudioBuffer;
  /** Where the strike itself begins in `buf` (s), after the key's click. */
  lead: number;
}
/** `typewriterState`: not asked for yet, loading, cut, failed. */
export type TypewriterState = 'idle' | 'loading' | 'ready' | 'failed';

/** Level frames (s). */
const FRAME = 0.005;
/** An onset: the level this much (dB) over the lowest of the last `LOOK` frames. */
const RISE = 9;
const LOOK = 6;
/** Strikes: onsets this close (dB) to the loud ones (the 90th percentile); softer ones are the keys' clicks. */
const STRIKE = 8;
/** Strikes closer than this are one (s). */
const MIN_GAP = 0.05;
/** A key's click this long (s) before its strike goes with it. */
const CLICK_BEFORE = 0.07;
/** Longest cut after its strike (s). */
const MAX_TAIL = 0.25;
/** Every strike's loudest 50 ms RMS, weighted. */
const TARGET = 0.1;

let bytes: Promise<ArrayBuffer | null> | null = null;
let loading: Promise<Strike[] | null> | null = null;
let strikes: Strike[] | null = null;
let failed = false;
let warned = false;

function warn(what: string, e: unknown): void {
  failed = true;
  if (warned) return;
  warned = true;
  console.warn(`[map] typewriter: ${what} (synthesized strikes meanwhile):`, e);
}

/** Start fetching the recording (no decoding: that needs a context). */
export function prefetchTypewriter(): void {
  bytes ??= fetch(typewriterUrl)
    .then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return r.arrayBuffer();
    })
    .catch((e: unknown) => {
      warn('could not fetch the recording', e);
      // (the next load fetches again)
      bytes = null;
      return null;
    });
}

/** The cut strikes (`null`: not loaded, it failed). Decodes on `ctx`, or an offline context of our own. Never rejects. */
export function loadTypewriter(ctx?: BaseAudioContext): Promise<Strike[] | null> {
  if (strikes) return Promise.resolve(strikes);
  prefetchTypewriter();
  loading ??= (async () => {
    const b = await bytes;
    if (!b) return null;
    try {
      const t0 = performance.now();
      strikes = cutStrikes(await decode(b, ctx));
      failed = !strikes.length;
      console.info(`[map] typewriter: ${strikes.length} strikes (${Math.round(performance.now() - t0)} ms)`);
      return strikes.length ? strikes : null;
    } catch (e) {
      warn('could not decode the recording', e);
      return null;
    }
  })().finally(() => {
    loading = null;
  });
  return loading;
}

/** Where the recording is, and how many strikes it gave. */
export function typewriterState(): { state: TypewriterState; strikes: number } {
  const state = strikes?.length ? 'ready' : loading ? 'loading' : failed ? 'failed' : 'idle';
  return { state, strikes: strikes?.length ?? 0 };
}

interface Onset {
  f: number;
  /** Loudest frame in the 30 ms after it (dB). */
  peak: number;
}

/** Cut a typing recording into single strikes. */
export function cutStrikes(buf: AudioBuffer): Strike[] {
  const sr = buf.sampleRate;
  const n = buf.length;
  const x = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) x[i] += d[i] / buf.numberOfChannels;
  }
  highpass(x, 45, sr);

  const F = Math.round(sr * FRAME);
  const nf = Math.floor(n / F);
  const L = new Float32Array(nf);
  for (let f = 0; f < nf; f++) {
    let s = 0;
    for (let i = f * F; i < (f + 1) * F; i++) s += x[i] * x[i];
    L[f] = 10 * Math.log10(s / F + 1e-12);
  }
  const floor = L.slice().sort()[Math.floor(0.2 * (nf - 1))];

  // Onsets: the first frame of each jump.
  const PEAK = Math.round(0.03 / FRAME);
  const found: Onset[] = [];
  let was = false;
  for (let f = LOOK; f < nf - PEAK; f++) {
    let lo = Infinity;
    for (let j = f - LOOK; j < f; j++) lo = Math.min(lo, L[j]);
    const is = L[f] - lo >= RISE && L[f] >= floor + 10;
    if (is && !was) {
      let peak = -Infinity;
      for (let j = f; j < f + PEAK; j++) peak = Math.max(peak, L[j]);
      found.push({ f, peak });
    }
    was = is;
  }
  if (!found.length) return [];
  const loud = found.map((o) => o.peak).sort((a, b) => a - b)[Math.floor(0.9 * (found.length - 1))];
  const hits: Onset[] = [];
  for (const o of found) {
    if (o.peak < loud - STRIKE) continue;
    const prev = hits[hits.length - 1];
    if (prev && (o.f - prev.f) * FRAME < MIN_GAP) {
      if (o.peak > prev.peak) hits[hits.length - 1] = o;
    } else hits.push(o);
  }

  // Where each cut starts: at the key's click before its strike, if there is one (after the strike before).
  const starts = hits.map((h, k) => {
    const after = k ? hits[k - 1].f + PEAK : 0;
    const click = found.find((o) => o.f < h.f && o.f >= after && (h.f - o.f) * FRAME <= CLICK_BEFORE);
    return Math.max(0, (click ?? h).f - 1);
  });
  const heard = x.slice();
  highShelf(heard, 1500, 4, sr);

  const out: Strike[] = [];
  hits.forEach((h, k) => {
    const start = starts[k] * F;
    let end = Math.min(k + 1 < hits.length ? starts[k + 1] * F : n, (h.f + Math.round(MAX_TAIL / FRAME)) * F, n);
    // The tail ends where it has died away (into the floor, or 45 dB under the strike), plus 15 ms.
    const quiet = Math.max(floor + 4, h.peak - 45);
    let last = h.f;
    for (let f = h.f; f < Math.floor(end / F); f++) if (L[f] > quiet) last = f;
    end = Math.min(end, (last + 3) * F);
    const len = end - start;
    if (len < 0.03 * sr) return;
    const d = x.slice(start, end);
    const fin = Math.round(0.002 * sr);
    const fout = Math.round(Math.min(0.03, 0.25 * (len / sr)) * sr);
    for (let i = 0; i < fin; i++) d[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fin);
    for (let i = 0; i < fout; i++) d[len - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fout);
    const top = loudest(heard, start, end, Math.round(0.05 * sr));
    const g = top > 0 ? TARGET / Math.sqrt(top) : 1;
    for (let i = 0; i < len; i++) d[i] *= g;
    const b = new AudioBuffer({ numberOfChannels: 1, length: len, sampleRate: sr });
    b.copyToChannel(d, 0);
    out.push({ buf: b, lead: (h.f * F - start) / sr });
  });
  return out;
}
