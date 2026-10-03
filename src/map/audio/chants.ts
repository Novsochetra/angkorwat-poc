import farUrl from '../../../assets/sound/monks-chanting-far-siem-reap-gazzaruddin-freesound-192264.mp3?url';
import nearUrl from '../../../assets/sound/monks-chanting-temple-cambodia-cryany-freesound-719878.mp3?url';
import type { SfxOut } from './addonSfx';
import { glide } from './dsp';
import { decode } from './footsteps';

/**
 * The monks' chanting (សូត្រមន្ត) is recorded in Cambodia (`assets/sound/`):
 *
 * - `near`: monks chanting in a temple hall, close by, with its echo
 *   ("Monks Chanting in Temple, Cambodia 2024", cryany, Freesound 719878,
 *   CC BY-NC 4.0; 22 s);
 * - `far`: monks chanting in Siem Reap, heard across the town from a hotel
 *   room ("Cambodian Buddhist Chanting", gazzaruddin, Freesound 192264, CC0;
 *   3 min).
 *
 * Cleaned when they were added (ffmpeg): mono, the far one's traffic rumble
 * cut under 300 Hz and its hiss lowered, both levelled to about −20 LUFS.
 *
 * Played as endless chanting (`ChantStream`: the temples' dawn chant,
 * temple.ts; Visak Bochea's procession and Pchum Ben's hall, _visak.ts) or
 * as one piece (`chantPiece`: the monk's blessing, _bless.ts; dak bat's,
 * _dakbat.ts). A stream strings pieces of a recording end to end, each from
 * a breath (a quiet moment between phrases, found when it loads) to a later
 * one, picked at random, the next cross-fading in over the breath: it never
 * plays the same way twice, even from the short recording. Close by the near
 * recording is heard, far off the far one (`chantBlend`).
 *
 * Loading as the typewriter's (typewriter.ts): the bytes are fetched as soon
 * as the map's sound is made (`prefetchChants`), decoded once (`loadChants`)
 * in idle time or on the live context. Until then, or if it fails, the
 * chants are synthesized as before.
 */

export type ChantKind = 'near' | 'far';
/** `chantsState`: not asked for yet, loading, both decoded, failed. */
export type ChantsState = 'idle' | 'loading' | 'ready' | 'failed';

interface Rec {
  /** Mono: any context plays it. */
  buf: AudioBuffer;
  /** The breaths (s), in order. */
  breaths: number[];
}

const FILES: Record<ChantKind, string> = { near: nearUrl, far: farUrl };
const KINDS: readonly ChantKind[] = ['near', 'far'];

/** A stream's pieces: shortest and longest (s, breath to breath), the cross-fade over the breath (s). */
const PIECE: Record<ChantKind, { min: number; max: number; fade: number }> = {
  near: { min: 4, max: 9, fade: 1.2 },
  far: { min: 10, max: 24, fade: 1.6 },
};
/** Level frames (s), the smoothing (frames each side), a breath's reach (frames each side: the quietest within it). */
const FRAME = 0.05;
const SMOOTH = 2;
const REACH = 12;
/** A breath is at most this quiet among the frames (a share: the 30th percentile). */
const QUIET = 0.3;

const bytes = new Map<ChantKind, Promise<ArrayBuffer | null>>();
const recs: Partial<Record<ChantKind, Rec>> = {};
let loading: Promise<boolean> | null = null;
let failed = false;
let warned = false;

function warn(what: string, e: unknown): void {
  failed = true;
  if (warned) return;
  warned = true;
  console.warn(`[map] chants: ${what} (synthesized chanting meanwhile):`, e);
}

/** Start fetching the recordings not decoded yet (no decoding: that needs a context). */
export function prefetchChants(): void {
  for (const k of KINDS) {
    if (recs[k] || bytes.has(k)) continue;
    bytes.set(
      k,
      fetch(FILES[k])
        .then((r) => {
          if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
          return r.arrayBuffer();
        })
        .catch((e: unknown) => {
          warn(`could not fetch the ${k} recording`, e);
          // (the next load fetches again)
          bytes.delete(k);
          return null;
        }),
    );
  }
}

/** Decode what is not yet (on `ctx`, or an offline context of our own); true once both are. Never rejects. */
export function loadChants(ctx?: BaseAudioContext): Promise<boolean> {
  if (recs.near && recs.far) return Promise.resolve(true);
  prefetchChants();
  loading ??= (async () => {
    const t0 = performance.now();
    for (const k of KINDS) {
      if (recs[k]) continue;
      const b = await bytes.get(k);
      bytes.delete(k);
      if (!b) continue;
      try {
        const buf = await decode(b, ctx);
        recs[k] = { buf, breaths: findBreaths(buf) };
      } catch (e) {
        warn(`could not decode the ${k} recording`, e);
      }
    }
    const done = !!(recs.near && recs.far);
    failed = !done;
    if (done) console.info(`[map] chants: ${KINDS.map((k) => `${k} ${Math.round(recs[k]!.buf.duration)} s, ${recs[k]!.breaths.length} breaths`).join(' · ')} (${Math.round(performance.now() - t0)} ms)`);
    return done;
  })().finally(() => {
    loading = null;
  });
  return loading;
}

/** Where the recordings are. */
export function chantsState(): ChantsState {
  return recs.near && recs.far ? 'ready' : loading ? 'loading' : failed ? 'failed' : 'idle';
}

/** Whether chanting can be played from the recordings (else it is synthesized). */
export const chantsReady = (): boolean => !!(recs.near && recs.far);

/** The quiet moments between phrases: the smoothed level's lowest points within ±`REACH` frames, among the quietest frames. */
function findBreaths(buf: AudioBuffer): number[] {
  const x = buf.getChannelData(0);
  const F = Math.round(buf.sampleRate * FRAME);
  const nf = Math.floor(x.length / F);
  const L = new Float32Array(nf);
  for (let f = 0; f < nf; f++) {
    let s = 0;
    for (let i = f * F; i < (f + 1) * F; i++) s += x[i] * x[i];
    L[f] = 10 * Math.log10(s / F + 1e-12);
  }
  const S = new Float32Array(nf);
  for (let f = 0; f < nf; f++) {
    let s = 0;
    let n = 0;
    for (let j = Math.max(0, f - SMOOTH); j <= Math.min(nf - 1, f + SMOOTH); j++, n++) s += L[j];
    S[f] = s / n;
  }
  const lo = S.slice().sort()[Math.floor(QUIET * (nf - 1))];
  const out: number[] = [];
  for (let f = REACH; f < nf - REACH; f++) {
    if (S[f] > lo) continue;
    let least = true;
    // (ties: the first frame of a flat stretch is the breath)
    for (let j = f - REACH; j <= f + REACH && least; j++) if (S[j] < S[f] || (j < f && S[j] === S[f])) least = false;
    if (least) out.push((f + 0.5) * FRAME);
  }
  // (a recording with no clear breaths: every 2 s)
  if (out.length < 4) for (let t = 1; t < buf.duration - 1; t += 2) out.push(t);
  return out.sort((a, b) => a - b);
}

/** A piece of `rec` breath to breath, `min`‥`max` s long, `edge` s clear of its ends; `not`: a start not to pick again. */
function pick(rec: Rec, rnd: () => number, min: number, max: number, edge: number, not = -1): [number, number] {
  const lo = edge;
  const hi = rec.buf.duration - edge;
  const any = (xs: number[]) => xs[Math.floor(rnd() * xs.length)];
  const starts = rec.breaths.filter((b) => b >= lo && b + min <= hi);
  if (!starts.length) {
    const a = lo + rnd() * Math.max(0, hi - lo - min);
    return [a, Math.min(hi, a + min + rnd() * (max - min))];
  }
  let a = any(starts);
  if (a === not && starts.length > 1) a = any(starts.filter((s) => s !== not));
  const ends = rec.breaths.filter((b) => b >= a + min && b <= Math.min(a + max, hi));
  return [a, ends.length ? any(ends) : Math.min(hi, a + min + rnd() * (max - min))];
}

/** Equal-power fades (the pieces are not alike: their powers add). */
const CURVE = 64;
const FADE_IN = Float32Array.from({ length: CURVE }, (_, i) => Math.sin((Math.PI / 2) * (i / (CURVE - 1))));
const FADE_OUT = FADE_IN.slice().reverse();

/** One piece of `rec` into `dest`: from `t`, `from`‥`to` s of the recording, fading in over `fin` and out over `fout` (s). */
function play(ctx: BaseAudioContext, dest: AudioNode, rec: Rec, t: number, from: number, to: number, fin: number, fout: number, ended?: () => void): AudioBufferSourceNode {
  const len = to - from;
  const src = ctx.createBufferSource();
  src.buffer = rec.buf;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueCurveAtTime(FADE_IN, t, fin);
  g.gain.setValueCurveAtTime(FADE_OUT, t + Math.max(fin, len - fout), fout);
  src.connect(g).connect(dest);
  src.start(t, from, len);
  src.onended = () => {
    src.disconnect();
    g.disconnect();
    ended?.();
  };
  return src;
}

/** Close by the near recording, far off the far one (each a gain, equal power): all near within 15 m, all far past 60 m. */
export function chantBlend(d: number): [number, number] {
  const k = Math.min(1, Math.max(0, (60 - d) / 45));
  return [Math.sin((Math.PI / 2) * k), Math.cos((Math.PI / 2) * k)];
}

/**
 * Endless chanting from one recording into `dest`: `start` fades it in,
 * `stop` fades it out. Two pieces are always under way (the one heard, the
 * next one waiting to cross-fade in); each one that ends asks for another.
 */
export class ChantStream {
  private run: { fade: GainNode; live: Set<AudioBufferSourceNode>; next: number; last: number } | null = null;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly dest: AudioNode,
    private readonly kind: ChantKind,
    private readonly rnd: () => number,
  ) {}

  get running(): boolean {
    return !!this.run;
  }

  /** Begin at `t`, fading in (time constant `tc`, s). Nothing while the recordings are not loaded. */
  start(t: number, tc: number): void {
    if (this.run || !recs[this.kind]) return;
    const fade = this.ctx.createGain();
    fade.gain.value = 0;
    fade.connect(this.dest);
    glide(fade.gain, 1, t, tc);
    // (the first piece starts at `t`: its breath lands half a cross-fade later)
    this.run = { fade, live: new Set(), next: t + PIECE[this.kind].fade / 2, last: -1 };
    this.piece(this.run);
    this.piece(this.run);
  }

  /** Fade out from `t` (time constant `tc`, s) and stop. */
  stop(t: number, tc: number): void {
    const r = this.run;
    if (!r) return;
    this.run = null;
    glide(r.fade.gain, 0, t, tc);
    for (const s of r.live) s.stop(t + tc * 5);
    // (the last piece to end lets go of the fade)
    if (!r.live.size) r.fade.disconnect();
  }

  private piece(r: NonNullable<ChantStream['run']>): void {
    const rec = recs[this.kind]!;
    const { min, max, fade } = PIECE[this.kind];
    const [a, b] = pick(rec, this.rnd, min, max, fade / 2 + 0.05, r.last);
    r.last = a;
    // (late, the tab was hidden: it starts now, off the beat of the one before)
    const t = Math.max(r.next - fade / 2, this.ctx.currentTime);
    const src = play(this.ctx, r.fade, rec, t, a - fade / 2, b + fade / 2, fade, fade, () => {
      r.live.delete(src);
      if (this.run === r) this.piece(r);
      else if (!r.live.size) r.fade.disconnect();
    });
    r.live.add(src);
    r.next = t + fade / 2 + (b - a);
  }
}

/**
 * One piece of chanting of about `len` s into `dest` from `t` (breath to
 * breath, from the near recording unless `kind`), fading in over `fin` and
 * out over `fout` (s); `ended` once it has played. False when the recordings
 * are not loaded: synthesize it.
 */
export function chantPiece(ctx: BaseAudioContext, dest: AudioNode, t: number, len: number, rnd: () => number, o: { kind?: ChantKind; fin?: number; fout?: number; ended?: () => void } = {}): boolean {
  const rec = recs[o.kind ?? 'near'];
  if (!rec) return false;
  const fin = o.fin ?? 0.25;
  const fout = o.fout ?? 0.8;
  const [a, b] = pick(rec, rnd, len * 0.85, len * 1.15, Math.max(fin, fout) / 2 + 0.05);
  play(ctx, dest, rec, t, a - fin / 2, b + fout / 2, fin, fout, o.ended);
  return true;
}

/**
 * A chant played once on an add-on's bus (`SFX.play`: the blessing, dak
 * bat): a piece of about `len` s from the near recording at `level` × `gain`,
 * `wet` of it to the reverb (the hall's own echo is in the recording). False
 * when the recordings are not loaded: synthesize it.
 */
export function chantShot(o: SfxOut, gain: number, t: number, len: number, level: number, wet: number): boolean {
  if (!recs.near) return false;
  const out = o.ctx.createGain();
  out.gain.value = level * gain;
  const send = o.ctx.createGain();
  send.gain.value = wet;
  out.connect(o.dry);
  out.connect(send).connect(o.wet);
  return chantPiece(o.ctx, out, t, len, o.rnd, {
    ended: () => {
      out.disconnect();
      send.disconnect();
    },
  });
}
