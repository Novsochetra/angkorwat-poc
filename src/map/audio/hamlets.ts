import type { HeightField } from '../heightfield';
import { BACK_HAMLET, EAST_VILLAGE, KULEN_PICNIC, MARKET } from '../layout';
import { biquad, glide, range, type Rng } from './dsp';
import type { SoundEngine } from './engine';
import { clink, hammer, laugh, pump } from './life';
import { chatter, clip, crowd, talkReady, type ClipKind } from './speech';
import { Voice } from './voice';
import type { Ears } from './water';

/**
 * The lasting sound of the places where people live (the ambience bus),
 * each from where it is and faded with distance like the temples'
 * (temple.ts), by the time of day (`SoundEngine.clock`):
 *
 * - the morning market (`MARKET`): a crowd's murmur — many voices talking
 *   at once, near and farther off (speech.ts `crowd`, `chatter`) — sellers
 *   calling out now and then, bowls and spoons clinking, a laugh; busy from
 *   before dawn to late morning (clock ≈ 0.7‥0.95), thin in the afternoon,
 *   at night only one lit stall's quiet talk;
 * - the sugar-palm village (`EAST_VILLAGE`): voices from the houses, a dog
 *   barking now and then, the hand pump squeaking and gushing (mostly in
 *   the morning), a carpenter's hammer, children laughing; families talking
 *   on the verandas at dusk; at night only a dog now and then;
 * - the picnic below Kulen's falls (`KULEN_PICNIC`): families talking and
 *   laughing on their mats by day;
 * - the little hamlet behind Angkor Wat (`BACK_HAMLET`): quiet voices by
 *   day, a dog.
 *
 * Nothing runs far off: a bed's loops start when the ears come within its
 * reach and stop a while after they leave, its one-off sounds (a call, a
 * bark, the pump) are made only while it is heard. The beds go quiet in
 * rain and hushed in snow (people stay in). ~6 looping sources at most,
 * one or two one-off sounds at a time.
 */

type BedId = 'market' | 'village' | 'picnic' | 'hamlet';
/** A one-off sound of a bed: how often (a minute, at full `when`), its level, and when (clock → 0‥1). */
interface Extra {
  make: (v: Voice, t: number) => number;
  perMin: number;
  level: number;
  when: (c: number) => number;
}
/** A looping layer of a bed: its buffer, speed, a low-pass (Hz, far voices), its level by the clock. */
interface Layer {
  buf: () => AudioBuffer;
  rate: number;
  lp: number;
  level: (c: number) => number;
}
interface BedDef {
  id: BedId;
  x: number;
  z: number;
  /** Its size (m): inside it, it is all round. */
  r: number;
  layers: Layer[];
  extras: Extra[];
}

/**
 * 1 inside the clock window [a, b] (wrapping past 1), easing to 0 over
 * `fade` outside it.
 */
function win(c: number, a: number, b: number, fade: number): number {
  const len = (b - a + 1) % 1;
  const u = (c - a + 1) % 1;
  if (u <= len) return 1;
  const after = u - len;
  const before = 1 - u;
  const k = Math.min(after, before) / fade;
  return k >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * k);
}
/** The market: busy from before dawn to late morning, thin through the afternoon, one stall at night. */
const busy = (c: number): number => Math.max(win(c, 0.72, 0.93, 0.04), 0.3 * win(c, 0.93, 0.22, 0.03));
/** Daylight (dawn to dusk). */
const day = (c: number): number => win(c, 0.77, 0.21, 0.04);
/** The evening on the verandas. */
const dusk = (c: number): number => win(c, 0.2, 0.31, 0.03);
/** The village's morning chores (water fetched, breakfast). */
const morning = (c: number): number => win(c, 0.72, 0.86, 0.03);

const said = (kind: ClipKind) => (v: Voice, t: number) => {
  const buf = clip(kind, v.r);
  const rate = range(v.r, 0.95, 1.05);
  v.buffer(buf, t, t + buf.duration / rate + 0.02, 0, false, rate).connect(v.out);
  return t + buf.duration / rate;
};

const BEDS: readonly BedDef[] = [
  {
    id: 'market',
    ...MARKET,
    layers: [
      { buf: crowd, rate: 1, lp: 5000, level: (c) => busy(c) },
      { buf: crowd, rate: 0.93, lp: 1800, level: (c) => 0.8 * busy(c) },
      { buf: chatter, rate: 1.03, lp: 6000, level: (c) => 0.3 + 0.3 * busy(c) },
    ],
    extras: [
      { make: said('vendor'), perMin: 7, level: 0.55, when: busy },
      { make: clink, perMin: 9, level: 0.12, when: (c) => Math.max(0.15, busy(c)) },
      { make: laugh, perMin: 1.5, level: 0.5, when: (c) => 0.2 + 0.8 * busy(c) },
    ],
  },
  {
    id: 'village',
    ...EAST_VILLAGE,
    layers: [{ buf: chatter, rate: 0.97, lp: 2600, level: (c) => 0.05 + 0.3 * day(c) + 0.5 * dusk(c) }],
    extras: [
      { make: said('bark'), perMin: 1.6, level: 0.6, when: (c) => 0.5 + 0.5 * day(c) },
      { make: pump, perMin: 1, level: 0.45, when: (c) => 0.4 * day(c) + 0.8 * morning(c) },
      { make: hammer, perMin: 0.6, level: 0.45, when: day },
      { make: laugh, perMin: 1.5, level: 0.45, when: (c) => day(c) + 0.5 * dusk(c) },
    ],
  },
  {
    id: 'picnic',
    ...KULEN_PICNIC,
    layers: [
      { buf: chatter, rate: 1.04, lp: 6000, level: (c) => 1.25 * day(c) },
      { buf: chatter, rate: 0.95, lp: 3500, level: (c) => 0.9 * day(c) },
    ],
    extras: [{ make: laugh, perMin: 3, level: 0.55, when: day }],
  },
  {
    id: 'hamlet',
    ...BACK_HAMLET,
    layers: [{ buf: chatter, rate: 1.01, lp: 2400, level: (c) => 0.3 * day(c) + 0.35 * dusk(c) }],
    extras: [
      { make: said('bark'), perMin: 1, level: 0.5, when: (c) => 0.5 + 0.5 * day(c) },
      { make: laugh, perMin: 0.8, level: 0.4, when: day },
    ],
  },
];

/** Levels (before the ambience volume and the distance): the loops, the one-off sounds. */
const LEVEL = { talk: 0.18, extra: 0.45 };
/** Loudness with distance from a bed's edge: [m, dB], straight lines on a log scale between them (never over 0 dB: inside it, it is all round at its full level). */
const DB: readonly [number, number][] = [
  [8, 0],
  [25, -6],
  [70, -13],
  [150, -21],
  [260, -30],
];
/** A bed quieter than this (its distance gain) makes nothing; its loops stop a while after. */
const FAINT = 0.04;
/** How often the beds follow the ears (s); how long a silent bed keeps its loops (s). */
const EVERY = 1 / 10;
const LINGER = 8;
/** One-off sounds of one bed at once. */
const MAX_EXTRAS = 2;

function ampAt(d: number): number {
  const p = DB;
  let i = 0;
  while (i < p.length - 2 && d > p[i + 1][0]) i++;
  const k = Math.min(1.6, Math.max(0, Math.log(Math.max(1, d) / p[i][0]) / Math.log(p[i + 1][0] / p[i][0])));
  return 10 ** ((p[i][1] + (p[i + 1][1] - p[i][1]) * k) / 20);
}
const airAt = (d: number): number => Math.min(16000, Math.max(800, 16000 / (1 + d / 50) ** 0.9));
const wetAt = (d: number): number => 0.1 + (0.45 * d) / (d + 120);

/** One bed: its place (air, level, pan, reverb send), its loops and one-off sounds. */
class Bed {
  readonly input: GainNode;
  private readonly air: BiquadFilterNode;
  private readonly level: GainNode;
  private readonly pan: StereoPannerNode;
  private readonly send: GainNode;
  private readonly last = [-1, -1, -9, -1];
  /** The loops: level, low-pass, source (null: stopped), the level last set, since when it has been silent (−1: it is not). */
  private readonly loops: { g: GainNode; lp: BiquadFilterNode; src: AudioBufferSourceNode | null; was: number; zero: number }[];
  private readonly next: number[];
  private readonly busyUntil: number[] = [];
  /** The distance gain now (0‥1). */
  amp = 0;
  y = 0;
  private quietSince = -1;

  constructor(
    private readonly e: SoundEngine,
    readonly def: BedDef,
  ) {
    const ctx = e.ctx;
    this.input = ctx.createGain();
    this.air = biquad(ctx, 'lowpass', 4000, 0.5);
    this.level = ctx.createGain();
    this.level.gain.value = 0;
    this.pan = ctx.createStereoPanner();
    this.send = ctx.createGain();
    this.input.connect(this.air).connect(this.level).connect(this.pan).connect(e.bus.ambience.dry);
    this.pan.connect(this.send).connect(e.bus.ambience.wet);
    this.loops = def.layers.map((L) => {
      const g = ctx.createGain();
      g.gain.value = 0;
      const lp = biquad(ctx, 'lowpass', L.lp, 0.6);
      lp.connect(g).connect(this.input);
      return { g, lp, src: null, was: -1, zero: -1 };
    });
    this.next = def.extras.map(() => -1);
  }

  place(ears: Ears, t: number, tc: number): void {
    const s = this.def;
    const dx = s.x - ears.x;
    const dy = this.y - ears.y;
    const dz = s.z - ears.z;
    const d = Math.hypot(dx, dy, dz) || 1e-3;
    // (inside the place it is all round: measured from its edge, panned to the middle)
    const edge = Math.max(1, d - 0.6 * s.r);
    const side = (dx * ears.right[0] + dy * ears.right[1] + dz * ears.right[2]) / d;
    const behind = Math.max(0, -(dx * ears.forward[0] + dy * ears.forward[1] + dz * ears.forward[2]) / d);
    this.amp = ampAt(edge);
    const level = this.amp * (1 - 0.2 * behind);
    const cutoff = airAt(edge) * (1 - 0.3 * behind);
    const pan = Math.max(-0.8, Math.min(0.8, 0.8 * side * (d / (d + s.r))));
    const send = wetAt(edge);
    const l = this.last;
    if (tc > 0 && Math.abs(level - l[0]) <= 0.02 * l[0] && Math.abs(cutoff / l[1] - 1) < 0.03 && Math.abs(pan - l[2]) < 0.01 && Math.abs(send - l[3]) < 0.01) return;
    l[0] = level;
    l[1] = cutoff;
    l[2] = pan;
    l[3] = send;
    glide(this.level.gain, level, t, tc && tc * 1.5);
    glide(this.air.frequency, cutoff, t, tc);
    glide(this.pan.pan, pan, t, tc);
    glide(this.send.gain, send, t, tc);
  }

  /** Loops and one-off sounds up to `until`: `clock` the time of day, `mute` 0‥1 how far rain and snow keep people in. */
  schedule(now: number, until: number, clock: number, mute: number, rnd: Rng): void {
    const heard = this.amp >= FAINT;
    if (heard) this.quietSince = -1;
    else if (this.quietSince < 0) this.quietSince = now;
    const keep = heard || now - this.quietSince < LINGER;
    const ctx = this.e.ctx;
    this.def.layers.forEach((L, i) => {
      const loop = this.loops[i];
      const want = keep ? LEVEL.talk * L.level(clock) * (1 - mute) : 0;
      if (want > 0.002) loop.zero = -1;
      else if (loop.zero < 0) loop.zero = now;
      if (want > 0.002 && !loop.src) {
        const src = ctx.createBufferSource();
        const buf = L.buf();
        src.buffer = buf;
        src.loop = true;
        src.playbackRate.value = L.rate;
        src.connect(loop.lp);
        src.start(now, rnd() * buf.duration);
        src.onended = () => src.disconnect();
        loop.src = src;
      } else if (loop.src && loop.zero >= 0 && now - loop.zero > 6) {
        // (silent a while: its level has faded out)
        loop.src.stop(now);
        loop.src = null;
      }
      if (Math.abs(want - loop.was) > 0.005) {
        loop.was = want;
        glide(loop.g.gain, want, now, 1.5);
      }
    });
    if (!heard) return;
    this.def.extras.forEach((x, i) => {
      if (this.next[i] < now) this.next[i] = now + range(rnd, 0.5, 60 / x.perMin);
      while (this.next[i] < until) {
        const t = this.next[i];
        const k = x.when(clock) * (1 - mute);
        // (a Poisson clock of `perMin` a minute, each kept as often as `when` says: fewer as it fades)
        this.next[i] = t + (-Math.log(1 - rnd() * 0.98) * 60) / x.perMin;
        if (k < 0.05 || rnd() > k) continue;
        for (let j = this.busyUntil.length - 1; j >= 0; j--) if (this.busyUntil[j] <= t) this.busyUntil.splice(j, 1);
        if (this.busyUntil.length >= MAX_EXTRAS) continue;
        const v = new Voice(ctx, rnd);
        try {
          x.make(v, t);
          v.out.gain.value = LEVEL.extra * x.level * range(rnd, 0.6, 1);
          v.out.connect(this.input);
          v.play();
          this.busyUntil.push(v.end);
        } catch (err) {
          v.drop();
          throw err;
        }
      }
    });
  }

  /** The ambience is muted: the loops stop (their level is already gone). */
  idle(now: number): void {
    for (const loop of this.loops) {
      loop.src?.stop(now);
      loop.src = null;
      loop.was = -1;
      loop.zero = -1;
      glide(loop.g.gain, 0, now, 0);
    }
  }
}

export class HamletSound {
  private readonly beds: Bed[];
  private lastPlace = -1;

  constructor(private readonly e: SoundEngine) {
    this.beds = BEDS.map((b) => new Bed(e, b));
  }

  /** The land, once built: each bed's height (1.5 m over its ground). */
  setWorld(field: Pick<HeightField, 'heightAt'>): void {
    for (const b of this.beds) b.y = field.heightAt(b.def.x, b.def.z) + 1.5;
  }

  /** Where the ears are (every frame; the beds follow 10 times a second). */
  listen(ears: Ears, immediate = false): void {
    const t = this.e.ctx.currentTime;
    if (!immediate && this.lastPlace >= 0 && t - this.lastPlace < EVERY) return;
    const tc = immediate || this.lastPlace < 0 ? 0 : 0.2;
    this.lastPlace = t;
    for (const b of this.beds) b.place(ears, t, tc);
  }

  /** Fill in up to `until` (audio clock, s): `clock` the time of day; `rain`, `snow` 0‥1. */
  schedule(now: number, until: number, clock: number, rain: number, snow: number): void {
    // (the talk loops not made yet: wait for the warm-up rather than make them in a frame)
    if (!talkReady()) return;
    const mute = Math.min(0.9, 0.5 * rain + 0.6 * snow);
    for (const b of this.beds) b.schedule(now, until, clock, mute, this.e.rnd);
  }

  /** The ambience is muted (nothing is scheduled): the loops stop. */
  idle(now: number): void {
    for (const b of this.beds) b.idle(now);
  }

  /** (checks) Each bed's distance gain now. */
  get amps(): Record<BedId, number> {
    return Object.fromEntries(this.beds.map((b) => [b.def.id, Math.round(b.amp * 1000) / 1000])) as Record<BedId, number>;
  }
}
