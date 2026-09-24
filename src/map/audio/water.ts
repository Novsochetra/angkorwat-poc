import type { RiverSample, Waterfall } from '../heightfield';
import { biquad, glide, noise, range, source, type Rng } from './dsp';
import type { SoundEngine } from './engine';

/**
 * The water on the map, each where it is: every waterfall roars and every
 * river babbles from its own place, louder and brighter the closer the ears
 * are, and panned left or right of the camera.
 *
 * Only a handful of voices: the four falls loudest at the ears each get one
 * (a voice fades out and over to another fall when the ears move on), the
 * other falls share one soft "bed"; the two nearest rivers each get a
 * babbling voice, and the nearest one scatters bubbly droplets.
 *
 *   fall:  roar loop ─────────────────┬─ air ─ level ─ pan ─ water bus (+ reverb, more when far)
 *          splash crackle (close up) ─┘   (air: a low-pass, darker far off)
 *   river: babble loop + pink wash + droplets ─ air ─ level ─ pan ─ water bus
 *
 * The roar is a low rumble and a broad body of mid-band noise: a laptop's
 * small speakers play little below ~200 Hz, and a rumble alone is not heard
 * there. A voice that cannot be heard (a river far off, the crackle of a
 * distant fall) sleeps: its sources are cut off, so the audio thread skips it.
 */

/** Where the ears are and which way they face (m; `right` and `forward` are unit vectors). */
export interface Ears {
  x: number;
  y: number;
  z: number;
  right: readonly [number, number, number];
  forward: readonly [number, number, number];
}

const FALL_VOICES = 4;
const RIVER_VOICES = 2;
/**
 * A fall's loudness with distance: [m, dB] points, straight lines between
 * them on a log scale. The overview (260–330 m from the falls) hears them as
 * one soft roar; a close-up on a place (130–230 m) is some 5–8 dB louder;
 * roaming next to a big fall, it fills the ears (but leaves room for steps).
 */
const FALL_DB: readonly [number, number][] = [
  [8, 0],
  [30, -2],
  [80, -4],
  [150, -7],
  [300, -15],
  [600, -22],
];
/** Rivers spread along their length: they fade more slowly, from closer. */
const RIVER_R = 8;
const RIVER_P = 0.85;
/** Levels (before the water volume). */
const LEVEL = {
  fall: 0.3,
  splash: 0.3,
  bed: 0.8,
  river: 0.4,
  babble: 1,
  wash: 0.35,
  drop: 0.9,
};
/** How often the voices follow the ears (s), and how long a voice takes to fade over to another fall (s). */
const EVERY = 1 / 15;
const SWAP = 0.45;
/** River points are taken every this many samples (1 m apart). */
const RIVER_STEP = 2;
/** A voice quieter than this (gain) sleeps after a second; the crackle sleeps under `SPLASH_QUIET` (beyond ~80 m). */
const QUIET = 0.03;
const SPLASH_QUIET = 0.05;

/** A source feeding a voice, cut off while the voice cannot be heard (a cut-off source costs nothing). */
class Feed {
  private on = true;
  private readonly src: AudioNode;
  private readonly to: AudioNode;

  constructor(src: AudioNode, to: AudioNode) {
    this.src = src;
    this.to = to;
    src.connect(to);
  }

  set(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    if (on) this.src.connect(this.to);
    else this.src.disconnect();
  }
}

/** A fall, ready for the ears: its face runs from the lip down to the pool. */
interface Fall {
  x: number;
  z: number;
  top: number;
  bottom: number;
  /** Foot of the fall (the pool, a little downstream of the lip). */
  fx: number;
  fz: number;
  width: number;
  /** Size of the fall (height and width): big ones are louder. */
  strength: number;
}

interface River {
  pts: { x: number; y: number; z: number }[];
  width: number;
  strength: number;
}

/** Brighter close by: a low-pass that closes with distance (air, trees, the lie of the land). */
const air = (d: number): number => Math.min(18000, Math.max(900, 18000 / (1 + d / 50) ** 0.85));
/** Reverb send: far water is mostly the valley's echo. */
const wet = (d: number): number => 0.05 + (0.4 * d) / (d + 120);
function fallAmp(d: number): number {
  const p = FALL_DB;
  let i = 0;
  while (i < p.length - 2 && d > p[i + 1][0]) i++;
  const k = Math.min(1.5, Math.max(0, Math.log(d / p[i][0]) / Math.log(p[i + 1][0] / p[i][0])));
  return 10 ** ((p[i][1] + (p[i + 1][1] - p[i][1]) * k) / 20);
}
const riverAmp = (d: number): number => (RIVER_R / (RIVER_R + d)) ** RIVER_P;

/** Direction of a point from the ears: left/right (−1‥1) and front/back. */
function aim(e: Ears, x: number, y: number, z: number): { side: number; front: number; d: number } {
  const dx = x - e.x;
  const dy = y - e.y;
  const dz = z - e.z;
  const d = Math.hypot(dx, dy, dz) || 1e-3;
  return {
    side: (dx * e.right[0] + dy * e.right[1] + dz * e.right[2]) / d,
    front: (dx * e.forward[0] + dy * e.forward[1] + dz * e.forward[2]) / d,
    d,
  };
}

/**
 * A voice that plays one fall or river (`id`) and should play `want`. When
 * they differ, it fades out, then takes the new one (`swapAt`: when).
 */
interface Slot {
  id: number;
  want: number;
  swapAt: number;
}

/** Hand the wanted ids to the slots: each keeps what is still wanted, a freed slot takes a new one. */
function assign(slots: Slot[], wanted: number[]): void {
  for (const s of slots) if (s.want >= 0 && !wanted.includes(s.want)) s.want = -1;
  for (const w of wanted) {
    if (slots.some((s) => s.want === w)) continue;
    const free = slots.find((s) => s.want < 0);
    if (free) free.want = w;
  }
}

/** Move a slot on: true when it now plays its wanted id (snap its pan and tone to the new place). */
function advance(s: Slot, t: number): boolean {
  if (s.id === s.want) return false;
  if (s.id < 0 || (s.swapAt > 0 && t >= s.swapAt)) {
    s.id = s.want;
    s.swapAt = 0;
    return true;
  }
  if (s.swapAt === 0) s.swapAt = t + SWAP;
  return false;
}

/** Output of a placed voice: air filter, level, pan, reverb send; its sources sleep while it is silent. */
class Placed {
  readonly input: GainNode;
  readonly air: BiquadFilterNode;
  readonly level: GainNode;
  readonly pan: StereoPannerNode;
  readonly send: GainNode;
  private readonly feeds: Feed[] = [];
  private quietSince = -1;
  /** Last targets [level, cutoff, pan, send] (moves too small to hear are skipped). */
  private last = [-1, -1, -9, -1];

  constructor(e: SoundEngine) {
    const ctx = e.ctx;
    this.input = ctx.createGain();
    this.air = biquad(ctx, 'lowpass', 4000, 0.5);
    this.level = ctx.createGain();
    this.level.gain.value = 0;
    this.pan = ctx.createStereoPanner();
    this.send = ctx.createGain();
    this.input.connect(this.air).connect(this.level).connect(this.pan).connect(e.waterBus.dry);
    this.pan.connect(this.send).connect(e.waterBus.wet);
  }

  /** Plug a source in (cut off while the voice sleeps). */
  feed(src: AudioNode, to: AudioNode = this.input): void {
    this.feeds.push(new Feed(src, to));
  }

  /** Wake at once when heard; sleep once silent a second (the level has faded by then). */
  private rest(level: number, t: number): void {
    if (level >= QUIET) {
      this.quietSince = -1;
      for (const f of this.feeds) f.set(true);
    } else if (this.quietSince < 0) this.quietSince = t;
    else if (t - this.quietSince > 1) for (const f of this.feeds) f.set(false);
  }

  /**
   * Glide to a place (`tc` 0: jump there). `rise`: the voice was silent and
   * now plays a new fall or river: jump to its place, then swell up.
   */
  place(level: number, cutoff: number, pan: number, send: number, t: number, tc: number, rise = false): void {
    this.rest(level, t);
    const l = this.last;
    if (!rise && tc > 0 && Math.abs(level - l[0]) <= 0.02 * l[0] && Math.abs(cutoff / l[1] - 1) < 0.03 && Math.abs(pan - l[2]) < 0.01 && Math.abs(send - l[3]) < 0.01) return;
    this.last = [level, cutoff, pan, send];
    if (rise) {
      glide(this.level.gain, 0, t, 0);
      this.level.gain.setTargetAtTime(level, t, 0.2);
      tc = 0;
    } else glide(this.level.gain, level, t, tc && tc * 1.5);
    glide(this.air.frequency, cutoff, t, tc);
    glide(this.pan.pan, pan, t, tc);
    glide(this.send.gain, send, t, tc);
  }

  fadeOut(t: number): void {
    this.rest(0, t);
    if (this.last[0] === 0) return;
    this.last[0] = 0;
    glide(this.level.gain, 0, t, SWAP / 4);
  }
}

/** A looping buffer, started at a random point and speed (so voices sharing a buffer never line up). */
function loop(ctx: BaseAudioContext, buf: AudioBuffer, rnd: Rng, spread = 0.08): AudioBufferSourceNode {
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  s.playbackRate.value = range(rnd, 1 - spread, 1 + spread);
  s.start(ctx.currentTime, rnd() * buf.duration);
  return s;
}

const gainOf = (ctx: BaseAudioContext, v: number): GainNode => {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
};

class FallVoice implements Slot {
  id = -1;
  want = -1;
  swapAt = 0;
  readonly out: Placed;
  private readonly splash: GainNode;
  /** The crackle sleeps on its own: it is only heard within some 150 m. */
  private readonly splashFeed: Feed;

  constructor(e: SoundEngine) {
    const ctx = e.ctx;
    this.out = new Placed(e);
    this.splash = gainOf(ctx, 0);
    this.splash.connect(this.out.input);
    this.out.feed(loop(ctx, source('roar'), e.rnd));
    this.splashFeed = new Feed(loop(ctx, source('splash'), e.rnd), this.splash);
  }

  private lastSplash = -1;

  /** The crackle is only heard close up. */
  tone(d: number, t: number, tc: number): void {
    const g = LEVEL.splash / (1 + (d / 35) ** 1.6);
    this.splashFeed.set(g >= SPLASH_QUIET);
    if (tc > 0 && Math.abs(g - this.lastSplash) <= 0.02 * this.lastSplash) return;
    this.lastSplash = g;
    glide(this.splash.gain, g, t, tc);
  }
}

class RiverVoice implements Slot {
  id = -1;
  want = -1;
  swapAt = 0;
  readonly out: Placed;
  /** Droplets go in here (they take the voice's place and distance). */
  readonly drops: GainNode;
  private readonly babble: GainNode;

  constructor(e: SoundEngine) {
    const ctx = e.ctx;
    this.out = new Placed(e);
    this.babble = gainOf(ctx, LEVEL.babble);
    this.babble.connect(this.out.input);
    this.out.feed(loop(ctx, source('babble'), e.rnd, 0.1), this.babble);
    const wash = biquad(ctx, 'bandpass', 900, 0.6);
    wash.connect(gainOf(ctx, LEVEL.wash)).connect(this.out.input);
    this.out.feed(loop(ctx, noise('pink'), e.rnd), wash);
    this.drops = gainOf(ctx, LEVEL.drop);
    this.drops.connect(this.out.input);
  }

  private lastBabble = -1;

  /** The babble is detail: it fades before the wash does. */
  tone(d: number, t: number, tc: number): void {
    const g = LEVEL.babble / (1 + d / 60);
    if (tc > 0 && Math.abs(g - this.lastBabble) <= 0.02 * this.lastBabble) return;
    this.lastBabble = g;
    glide(this.babble.gain, g, t, tc);
  }
}

export class Water {
  private readonly e: SoundEngine;
  private readonly ctx: BaseAudioContext;
  private readonly rnd: Rng;
  private falls: Fall[] = [];
  private rivers: River[] = [];
  private fallVoices: FallVoice[] = [];
  private riverVoices: RiverVoice[] = [];
  /** The falls without a voice, as one soft wide roar. */
  private bed: Placed | null = null;
  private last = -1;
  /** Droplets a second from the nearest river (0: too far to hear them). */
  private dropRate = 0;
  private dropVoice: RiverVoice | null = null;
  private nextDrop = -1;
  // (scratch, per update)
  private amp: number[] = [];
  private dist: number[] = [];

  constructor(e: SoundEngine) {
    this.e = e;
    this.ctx = e.ctx;
    this.rnd = e.rnd;
  }

  setWorld(falls: readonly Waterfall[], rivers: readonly { samples: readonly RiverSample[] }[]): void {
    if (this.falls.length || this.rivers.length) return;
    this.falls = falls.map((f) => ({
      x: f.x,
      z: f.z,
      top: f.top,
      bottom: f.bottom,
      fx: f.x + f.dir[0] * 3,
      fz: f.z + f.dir[1] * 3,
      width: f.width,
      strength: Math.min(2, Math.max(0.35, Math.sqrt(((f.top - f.bottom) / 12) * (f.width / 8)))),
    }));
    this.rivers = rivers
      .filter((r) => r.samples.length > 1)
      .map((r) => ({
        pts: r.samples.filter((_, i) => i % RIVER_STEP === 0).map((s) => ({ x: s.x, y: s.level, z: s.z })),
        width: r.samples[0].w,
        strength: Math.sqrt(r.samples[0].w / 8),
      }));
    for (let i = 0; i < Math.min(FALL_VOICES, this.falls.length); i++) this.fallVoices.push(new FallVoice(this.e));
    for (let i = 0; i < Math.min(RIVER_VOICES, this.rivers.length); i++) this.riverVoices.push(new RiverVoice(this.e));
    if (this.falls.length > FALL_VOICES) {
      this.bed = new Placed(this.e);
      this.bed.feed(loop(this.ctx, source('roar'), this.rnd));
    }
  }

  /** Follow the ears (called every frame; works ~15 times a second). */
  listen(e: Ears, immediate = false): void {
    const t = this.ctx.currentTime;
    if (!immediate && this.last >= 0 && t - this.last < EVERY) return;
    const tc = immediate || this.last < 0 ? 0 : 0.12;
    this.last = t;
    if (this.falls.length) this.listenFalls(e, t, tc);
    if (this.rivers.length) this.listenRivers(e, t, tc);
  }

  private listenFalls(e: Ears, t: number, tc: number): void {
    const n = this.falls.length;
    const amp = this.amp;
    const dist = this.dist;
    amp.length = dist.length = n;
    for (let i = 0; i < n; i++) {
      const f = this.falls[i];
      // Nearest point of the falling sheet: on the line from the lip down to the pool, less half its width.
      const vx = f.fx - f.x;
      const vy = f.bottom - f.top;
      const vz = f.fz - f.z;
      const k = Math.min(1, Math.max(0, ((e.x - f.x) * vx + (e.y - f.top) * vy + (e.z - f.z) * vz) / (vx * vx + vy * vy + vz * vz)));
      const d = Math.max(1, Math.hypot(f.x + vx * k - e.x, f.top + vy * k - e.y, f.z + vz * k - e.z) - f.width / 2);
      dist[i] = d;
      amp[i] = f.strength * fallAmp(d);
    }
    const order = [...amp.keys()].sort((a, b) => amp[b] - amp[a]);
    assign(this.fallVoices, order.slice(0, this.fallVoices.length));
    const voiced = new Set<number>();
    for (const v of this.fallVoices) {
      const snap = advance(v, t);
      if (v.id < 0 || v.id !== v.want) {
        v.out.fadeOut(t);
        continue;
      }
      voiced.add(v.id);
      const f = this.falls[v.id];
      const d = dist[v.id];
      const a = aim(e, (f.x + f.fx) / 2, (f.top + f.bottom) / 2, (f.z + f.fz) / 2);
      const behind = Math.max(0, -a.front);
      // Close up, a wide fall fills the view: it sits in the middle.
      const pan = Math.max(-0.9, Math.min(0.9, 0.9 * a.side * (d / (d + f.width))));
      v.tone(d, t, snap ? 0 : tc);
      v.out.place(LEVEL.fall * amp[v.id] * (1 - 0.25 * behind), air(d) * (1 - 0.4 * behind), pan, wet(d), t, tc, snap && tc > 0);
    }
    // The bed: every other fall, summed by power; placed where most of them are.
    if (this.bed) {
      let p = 0, pan = 0, dm = 0;
      for (let i = 0; i < n; i++) {
        if (voiced.has(i)) continue;
        const w = amp[i] * amp[i];
        const f = this.falls[i];
        p += w;
        pan += w * aim(e, f.x, (f.top + f.bottom) / 2, f.z).side;
        dm += w * dist[i];
      }
      const d = p > 0 ? dm / p : 300;
      this.bed.place(LEVEL.fall * LEVEL.bed * Math.sqrt(p), air(d) * 0.8, p > 0 ? (0.6 * pan) / p : 0, wet(d), t, tc && 0.3);
    }
  }

  private listenRivers(e: Ears, t: number, tc: number): void {
    // Nearest point of each river.
    const near = this.rivers.map((r) => {
      let best = Infinity;
      let at = r.pts[0];
      for (const p of r.pts) {
        const d = (p.x - e.x) ** 2 + (p.y - e.y) ** 2 + (p.z - e.z) ** 2;
        if (d < best) {
          best = d;
          at = p;
        }
      }
      const d = Math.max(0.5, Math.sqrt(best) - r.width / 2);
      return { at, d, amp: r.strength * riverAmp(d) };
    });
    const order = [...near.keys()].sort((a, b) => near[b].amp - near[a].amp);
    assign(this.riverVoices, order.slice(0, this.riverVoices.length));
    this.dropVoice = null;
    this.dropRate = 0;
    for (const v of this.riverVoices) {
      const snap = advance(v, t);
      if (v.id < 0 || v.id !== v.want) {
        v.out.fadeOut(t);
        continue;
      }
      const { at, d, amp } = near[v.id];
      const a = aim(e, at.x, at.y, at.z);
      const behind = Math.max(0, -a.front);
      // Beside a river the water is all along it, in front and behind: near the middle.
      const pan = Math.max(-0.85, Math.min(0.85, 0.85 * a.side * (d / (d + 12))));
      v.tone(d, t, snap ? 0 : tc);
      v.out.place(LEVEL.river * amp * (1 - 0.2 * behind), air(d) * (1 - 0.4 * behind), pan, wet(d) * 0.8, t, tc, snap && tc > 0);
      if (v.id === order[0]) {
        // Droplets: heard within some 40 m, many when right by the water.
        const close = riverAmp(d);
        this.dropRate = close > 0.25 ? 14 * Math.min(1, (close - 0.25) / 0.55) : 0;
        this.dropVoice = v;
      }
    }
  }

  /** Droplets on the nearest river, scheduled ahead like the ambience's calls. */
  schedule(now: number, until: number): void {
    const r = this.rnd;
    if (this.nextDrop < now) this.nextDrop = now + 0.05;
    while (this.nextDrop < until) {
      const t = this.nextDrop;
      if (this.dropRate <= 0 || !this.dropVoice) {
        this.nextDrop = t + 0.5;
        continue;
      }
      this.drop(t, this.dropVoice.drops);
      this.nextDrop = t + -Math.log(1 - r() * 0.95) / this.dropRate;
    }
  }

  /** A bubbly droplet: a short sine that rises as it pops (now and then a bigger, lower "plop"). */
  private drop(t: number, out: AudioNode): void {
    const ctx = this.ctx;
    const r = this.rnd;
    const big = r() < 0.12;
    const f0 = big ? range(r, 220, 420) : 450 * 4.5 ** (r() ** 1.3);
    const dur = big ? range(r, 0.05, 0.09) : range(r, 0.018, 0.05);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * range(r, 1.3, 1.9), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime((big ? 0.8 : 0.35 + 0.65 * r() ** 2) * 0.5, t + 0.002);
    g.gain.setTargetAtTime(0, t + 0.002, dur / 3);
    const p = ctx.createStereoPanner();
    p.pan.value = range(r, -0.35, 0.35);
    o.connect(g).connect(p).connect(out);
    o.start(t);
    o.stop(t + dur * 1.6);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
      p.disconnect();
    };
  }
}
