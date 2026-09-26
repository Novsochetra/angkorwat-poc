import type { AnimalCall, AnimalCallKind, PeopleCallKind } from '../types';
import { biquad, clamp01, noise, note, range, softWave, strike, type NoiseKind, type Rng } from './dsp';
import type { SoundEngine } from './engine';
import type { Ears } from './water';

/**
 * Animal calls, each from where the animal is on the map (the animals push
 * them into the frame; `audio.call` hands them here). Every call is made
 * fresh from oscillators and noise, a little different each time, and
 * played once:
 *
 *   oscillators, noise ─ envelopes, formants ─ level ─ air ─ pan ─ animals bus (+ reverb, more when far)
 *
 * Placed like the water (water.ts): louder and brighter close by, panned
 * left or right of the ears, more of the valley's echo far off, silent
 * beyond its reach (60–200 m; a trumpeting elephant carries further), and a
 * little late far off (sound takes 0.3 s to cross 100 m). They play on their
 * own bus: the Animals slider sets them (the birds and insects all around
 * are the ambience's).
 *
 * At most six at once (and two of a kind): more are dropped. Every node is
 * let go once its call has ended.
 */

/** A call's voice: the elephant has two. */
type Voiced = Exclude<AnimalCallKind, PeopleCallKind> | 'trumpet';
/** The people's sounds come through the same calls, but audio/people.ts makes them (the engine hands them there). */
const PEOPLE: ReadonlySet<AnimalCallKind> = new Set<PeopleCallKind>(['oxBell', 'cartCreak', 'netSplash', 'laugh', 'pinpeat']);

/**
 * Each call: its peak `level` close by (before the animals volume), full
 * within `near` m, then some −5 dB each time the distance doubles, fading
 * out over the second half of `reach` m (silent beyond). Loud callers carry.
 * Close by, the loud callers are a little over the explorer's steps, the
 * trumpet more (the animals should be heard).
 */
const CALLS: Record<Voiced, { level: number; near: number; reach: number }> = {
  elephant: { level: 0.185, near: 15, reach: 200 },
  trumpet: { level: 0.27, near: 20, reach: 260 },
  monkey: { level: 0.756, near: 10, reach: 170 },
  rooster: { level: 0.35, near: 15, reach: 200 },
  hen: { level: 0.322, near: 5, reach: 100 },
  deer: { level: 0.518, near: 15, reach: 200 },
  buffalo: { level: 0.518, near: 10, reach: 170 },
  duck: { level: 1.638, near: 8, reach: 150 },
  egret: { level: 0.77, near: 8, reach: 150 },
  wings: { level: 0.539, near: 4, reach: 70 },
  fish: { level: 0.252, near: 5, reach: 90 },
  bat: { level: 0.074, near: 3, reach: 60 },
  frog: { level: 0.742, near: 5, reach: 110 },
  // The jungle's (fauna/jungle.ts). The gibbons' song and the hornbill carry across the forest.
  boar: { level: 0.62, near: 6, reach: 110 },
  piglet: { level: 0.4, near: 4, reach: 80 },
  peafowl: { level: 0.45, near: 10, reach: 240 },
  hornbill: { level: 0.5, near: 12, reach: 280 },
  whoosh: { level: 0.5, near: 6, reach: 110 },
  ibis: { level: 0.55, near: 10, reach: 220 },
  gibbon: { level: 0.26, near: 25, reach: 420 },
  gibbonHoot: { level: 0.26, near: 20, reach: 360 },
  squirrel: { level: 0.3, near: 4, reach: 70 },
};
/** One elephant call in this many is a trumpet. */
const TRUMPET = 0.25;
/** Calls at once, and of one kind; more are dropped. */
const MAX_CALLS = 6;
const MAX_KIND = 2;
/** Loss with distance past `near` (0.8: −4.8 dB each time the distance doubles). */
const FALLOFF = 0.8;
/** A call this much quieter than close by (−34 dB) is not made. */
const QUIET = 0.02;
/** Speed of sound (m/s). */
const SOUND = 343;
/** A call starts this long after it is asked for (s): room for its attack on the audio clock. */
const LEAD = 0.04;

/** Loudness with distance (0‥1): full close by, softer farther, fading out to silence at `reach`. */
function carry(d: number, near: number, reach: number): number {
  const k = Math.min(1, Math.max(0, 2 * (d / reach) - 1));
  return Math.min(1, (near / Math.max(d, 1e-3)) ** FALLOFF) * (1 - k * k * (3 - 2 * k));
}
/** Brighter close by: a low-pass that closes with distance (as for the water). */
const air = (d: number): number => Math.min(18000, Math.max(1200, 18000 / (1 + d / 50) ** 0.85));
/** Reverb send: a far call is partly the valley's echo. */
const wet = (d: number): number => 0.04 + (0.5 * d) / (d + 110);

/** Direction of a point from the ears: left/right (−1‥1), front/back, and distance. */
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

/** Move `p` through `pts` ([s after `t`, value]) in straight lines. */
function line(p: AudioParam, t: number, pts: readonly (readonly [number, number])[]): void {
  p.setValueAtTime(pts[0][1], t + pts[0][0]);
  for (let i = 1; i < pts.length; i++) p.linearRampToValueAtTime(pts[i][1], t + pts[i][0]);
}

/** A rolled sound ("krrr"): `rate` pulses a second on a gain for `len` s, fading a little. */
function pulses(p: AudioParam, t: number, len: number, rate: number, peak: number): void {
  const n = Math.max(1, Math.round(len * rate));
  const w = len / n;
  p.setValueAtTime(0, t);
  for (let i = 0; i < n; i++) {
    const s = t + i * w;
    p.linearRampToValueAtTime(peak * (1 - (0.35 * i) / n), s + w * 0.3);
    p.linearRampToValueAtTime(0, s + w * 0.95);
  }
}

/** One call: makes its nodes, starts its sources, and lets every node go once the last source has ended. */
class Voice {
  readonly ctx: BaseAudioContext;
  readonly r: Rng;
  /** Everything the call makes sums here (then its place: level, air, pan). */
  readonly out: GainNode;
  /** When the last source stops (s). */
  end = 0;
  private readonly nodes: AudioNode[] = [];
  /** Sources with their start, stop and buffer offset (−1: an oscillator). */
  private readonly srcs: [AudioScheduledSourceNode, number, number, number][] = [];

  constructor(ctx: BaseAudioContext, r: Rng) {
    this.ctx = ctx;
    this.r = r;
    this.out = this.gain(1);
  }

  keep<T extends AudioNode>(n: T): T {
    this.nodes.push(n);
    return n;
  }

  gain(v = 0): GainNode {
    const g = this.keep(this.ctx.createGain());
    g.gain.value = v;
    return g;
  }

  filter(type: BiquadFilterType, f: number, q = 0.7, db = 0): BiquadFilterNode {
    const b = this.keep(biquad(this.ctx, type, f, q));
    if (db) b.gain.value = db;
    return b;
  }

  osc(wave: OscillatorType | PeriodicWave, from: number, to: number, f = 440): OscillatorNode {
    const o = this.keep(this.ctx.createOscillator());
    if (wave instanceof PeriodicWave) o.setPeriodicWave(wave);
    else o.type = wave;
    o.frequency.value = f;
    this.srcs.push([o, from, to, -1]);
    return o;
  }

  noise(kind: NoiseKind, from: number, to: number): AudioBufferSourceNode {
    const s = this.keep(this.ctx.createBufferSource());
    const buf = noise(kind);
    s.buffer = buf;
    s.loop = true;
    this.srcs.push([s, from, to, this.r() * buf.duration]);
    return s;
  }

  /** A wobble of ±`depth` on `p` at `rate` Hz. */
  lfo(p: AudioParam, rate: number, depth: number, from: number, to: number): void {
    this.osc('sine', from, to, rate).connect(this.gain(depth)).connect(p);
  }

  /** Start every source; free every node once they have all ended. */
  play(): void {
    let left = this.srcs.length;
    if (!left) return this.drop();
    const done = () => {
      if (--left === 0) for (const n of this.nodes) n.disconnect();
    };
    for (const [s, from, to, offset] of this.srcs) {
      const stop = Math.max(to, from + 0.01);
      this.end = Math.max(this.end, stop);
      s.onended = done;
      if (offset >= 0) (s as AudioBufferSourceNode).start(from, offset);
      else s.start(from);
      s.stop(stop);
    }
  }

  /** Let go of a call that failed to be made. */
  drop(): void {
    for (const n of this.nodes) n.disconnect();
  }
}

export class Animals {
  private readonly e: SoundEngine;
  private readonly ctx: BaseAudioContext;
  private readonly rnd: Rng;
  /** Where the ears are (the engine's; none until first placed). */
  private ears: Ears | null = null;
  /** Calls playing now: their kind and when they end. */
  private readonly playing: { kind: AnimalCallKind; end: number }[] = [];

  constructor(e: SoundEngine) {
    this.e = e;
    this.ctx = e.ctx;
    this.rnd = e.rnd;
  }

  /** The ears to place calls by (kept, read when a call comes). */
  listen(ears: Ears): void {
    this.ears = ears;
  }

  /** A call at its place, from `now` (audio clock); dropped when too many play or it would not be heard. */
  call(c: AnimalCall, now: number): void {
    const ears = this.ears;
    if (!ears || PEOPLE.has(c.kind)) return;
    const kind = c.kind as Exclude<AnimalCallKind, PeopleCallKind>;
    const playing = this.playing;
    for (let i = playing.length - 1; i >= 0; i--) if (playing[i].end <= now) playing.splice(i, 1);
    if (playing.length >= MAX_CALLS) return;
    let same = 0;
    for (const p of playing) if (p.kind === c.kind) same++;
    if (same >= MAX_KIND) return;
    const r = this.rnd;
    const key: Voiced = kind === 'elephant' && r() < TRUMPET ? 'trumpet' : kind;
    const a = aim(ears, c.x, c.y, c.z);
    const behind = Math.max(0, -a.front);
    const call = CALLS[key];
    if (!call) return;
    const k = clamp01(c.gain) * carry(a.d, call.near, call.reach) * (1 - 0.3 * behind);
    // (also drops a call at a point that is not a number)
    if (!(k >= QUIET)) return;
    const t = now + LEAD + a.d / SOUND + r() * 0.03;
    const v = new Voice(this.ctx, r);
    try {
      this.make(key, v, t);
      const lv = v.gain(call.level * k);
      const lp = v.filter('lowpass', air(a.d) * (1 - 0.4 * behind), 0.5);
      const pan = v.keep(this.ctx.createStereoPanner());
      pan.pan.value = Math.max(-0.85, Math.min(0.85, 0.85 * a.side));
      v.out.connect(lv).connect(lp).connect(pan).connect(this.e.bus.animals.dry);
      pan.connect(v.gain(wet(a.d))).connect(this.e.bus.animals.wet);
      v.play();
    } catch (err) {
      v.drop();
      throw err;
    }
    playing.push({ kind: c.kind, end: v.end });
  }

  private make(key: Voiced, v: Voice, t: number): void {
    switch (key) {
      case 'elephant':
        return this.rumble(v, t);
      case 'trumpet':
        return this.trumpet(v, t);
      case 'monkey':
        return this.monkey(v, t);
      case 'rooster':
        return this.rooster(v, t);
      case 'hen':
        return this.hen(v, t);
      case 'deer':
        return this.deer(v, t);
      case 'buffalo':
        return this.buffalo(v, t);
      case 'duck':
        return this.duck(v, t);
      case 'egret':
        return this.egret(v, t);
      case 'wings':
        return this.wings(v, t);
      case 'fish':
        return this.fish(v, t);
      case 'bat':
        return this.bat(v, t);
      case 'frog':
        return this.frog(v, t);
      case 'boar':
        return this.boar(v, t);
      case 'piglet':
        return this.piglet(v, t);
      case 'peafowl':
        return this.peafowl(v, t);
      case 'hornbill':
        return this.hornbill(v, t);
      case 'whoosh':
        return this.whoosh(v, t);
      case 'ibis':
        return this.ibis(v, t);
      case 'gibbon':
        return this.gibbon(v, t);
      case 'gibbonHoot':
        return this.gibbonHoot(v, t);
      case 'squirrel':
        return this.squirrel(v, t);
    }
  }

  // ── Land ──────────────────────────────────────────────────────────────────

  /** An elephant's rumble: a deep hum (its note below hearing, its harmonics carry it) that rises a little and sinks. */
  private rumble(v: Voice, t: number): void {
    const r = v.r;
    const dur = range(r, 1.4, 2.6);
    const f = range(r, 24, 32);
    const o = v.osc(softWave(v.ctx, 1, 40), t, t + dur + 0.05);
    line(o.frequency, t, [
      [0, f * 0.94],
      [dur * 0.35, f * 1.08],
      [dur, f * 0.9],
    ]);
    const env = v.gain();
    line(env.gain, t, [
      [0, 0],
      [dur * 0.3, 1],
      [dur * 0.6, 0.85],
      [dur, 0],
    ]);
    // A slow throb in the throat, and the chest's resonance.
    const throb = v.gain(0.8);
    v.lfo(throb.gain, range(r, 5, 8), 0.2, t, t + dur);
    o.connect(env).connect(throb).connect(v.filter('peaking', range(r, 200, 260), 1.2, 9)).connect(v.filter('lowpass', 560, 0.8)).connect(v.out);
    // Breath under it.
    const n = v.noise('brown', t, t + dur);
    const ne = v.gain();
    line(ne.gain, t, [
      [0, 0],
      [dur * 0.3, 0.5],
      [dur, 0],
    ]);
    n.connect(v.filter('lowpass', 420, 0.7)).connect(ne).connect(v.out);
  }

  /** An elephant trumpeting: a brassy blare that rises, holds and falls, rough with breath. */
  private trumpet(v: Voice, t: number): void {
    const r = v.r;
    const dur = range(r, 0.8, 1.4);
    const f = range(r, 380, 520);
    const end = t + dur;
    const pitch: [number, number][] = [
      [0, f * 0.72],
      [dur * 0.25, f * 1.2],
      [dur * 0.65, f * 1.1],
      [dur, f * 0.68],
    ];
    const env = v.gain();
    for (const k of [1, 1.013]) {
      const o = v.osc('sawtooth', t, end + 0.02);
      line(
        o.frequency,
        t,
        pitch.map(([s, x]) => [s, x * k]),
      );
      o.connect(env);
    }
    line(env.gain, t, [
      [0, 0],
      [0.06, 0.4],
      [dur * 0.3, 0.5],
      [dur * 0.8, 0.4],
      [dur, 0],
    ]);
    // The trunk flutters (a rasp), and its bore brightens as the blare swells.
    const rasp = v.gain(0.7);
    v.lfo(rasp.gain, range(r, 55, 75), 0.3, t, end);
    const bore = v.filter('lowpass', 1200, 1.5);
    line(bore.frequency, t, [
      [0, 1200],
      [dur * 0.3, 4500],
      [dur, 1500],
    ]);
    env.connect(rasp).connect(v.filter('highpass', 280, 0.7)).connect(bore).connect(v.out);
    const n = v.noise('white', t, end);
    const ne = v.gain();
    line(ne.gain, t, [
      [0, 0],
      [0.05, 0.3],
      [dur * 0.4, 0.2],
      [dur, 0],
    ]);
    n.connect(v.filter('bandpass', 2600, 1)).connect(ne).connect(v.out);
  }

  /** A long-tailed macaque: quick "krra" and "chk" chatter, now and then a squeal. */
  private monkey(v: Voice, t: number): void {
    const r = v.r;
    // [start, length, rolled ("krra") or a click ("chk")]
    const bursts: [number, number, boolean][] = [];
    let s = t;
    for (let i = 0, n = 2 + Math.floor(r() * 5); i < n; i++) {
      const krra = r() < 0.55;
      const len = krra ? range(r, 0.08, 0.14) : range(r, 0.025, 0.045);
      bursts.push([s, len, krra]);
      s += len + range(r, 0.05, 0.13);
    }
    const last = bursts[bursts.length - 1];
    const chatterEnd = last[0] + last[1];
    // One noise through a band that jumps each burst; a buzzy voice under the "krra"s.
    const band = v.filter('bandpass', 2400, 2.2);
    const ne = v.gain();
    v.noise('white', t, chatterEnd).connect(band).connect(ne).connect(v.out);
    const vo = v.osc('sawtooth', t, chatterEnd, 800);
    const vband = v.filter('bandpass', 1400, 2);
    const ve = v.gain();
    vo.connect(vband).connect(ve).connect(v.out);
    ve.gain.setValueAtTime(0, t);
    for (const [s0, len, krra] of bursts) {
      const fc = range(r, 1700, 3200);
      band.frequency.setValueAtTime(fc, s0);
      if (krra) {
        const rate = range(r, 38, 52);
        const f0 = range(r, 650, 950);
        vo.frequency.setValueAtTime(f0, s0);
        vo.frequency.linearRampToValueAtTime(f0 * 0.85, s0 + len);
        vband.frequency.setValueAtTime(fc * 0.6, s0);
        pulses(ne.gain, s0, len, rate, 1);
        pulses(ve.gain, s0, len, rate, 0.35);
      } else note(ne.gain, s0, len, 1.2, 0.002, 0.02);
    }
    if (r() < 0.35) {
      // A squeal: a thin, harsh cry that rises and falls.
      const q0 = chatterEnd + range(r, 0.04, 0.14);
      const dur = range(r, 0.18, 0.4);
      const f = range(r, 1200, 1900);
      const o = v.osc('sawtooth', q0, q0 + dur + 0.02);
      line(o.frequency, q0, [
        [0, f * 0.85],
        [dur * 0.35, f * 1.25],
        [dur, f * 0.9],
      ]);
      v.lfo(o.frequency, range(r, 9, 14), f * 0.04, q0, q0 + dur);
      const e = v.gain();
      line(e.gain, q0, [
        [0, 0],
        [0.02, 0.18],
        [dur * 0.4, 0.25],
        [dur, 0],
      ]);
      o.connect(v.filter('bandpass', 2600, 1.2)).connect(e).connect(v.out);
    }
  }

  /** A red junglefowl's crow: "cock-a-doodle-" cut short, a hoarse bright voice. */
  private rooster(v: Voice, t: number): void {
    const r = v.r;
    const f = range(r, 470, 600);
    // Syllables: [length, pitch from, pitch to, gap after]
    const syl: [number, number, number, number][] = [
      [range(r, 0.07, 0.1), 0.9, 1.05, range(r, 0.025, 0.04)],
      [range(r, 0.09, 0.13), 1, 1.15, range(r, 0.03, 0.045)],
      [range(r, 0.34, 0.48), 1.2, 1.35, range(r, 0.025, 0.04)],
      [range(r, 0.1, 0.18), 1.28, 0.95, 0],
    ];
    const end = t + syl.reduce((a, [len, , , gap]) => a + len + gap, 0);
    const o = v.osc('sawtooth', t, end + 0.02);
    const env = v.gain();
    let s = t;
    syl.forEach(([len, a, b, gap], i) => {
      o.frequency.setValueAtTime(f * a, s);
      if (i === 2) o.frequency.linearRampToValueAtTime(f * b * 1.05, s + len * 0.4);
      o.frequency.linearRampToValueAtTime(f * b, s + len);
      // The last syllable is cut off short.
      note(env.gain, s, len, i === 2 ? 0.5 : 0.4, 0.012, i === 3 ? 0.008 : 0.025);
      s += len + gap;
    });
    const rasp = v.gain(0.75);
    v.lfo(rasp.gain, range(r, 85, 110), 0.25, t, end);
    o.connect(env).connect(rasp);
    // Hoarse air, shaped by the same envelope.
    v.noise('pink', t, end).connect(v.filter('bandpass', 2800, 1.4)).connect(v.gain(0.5)).connect(env);
    rasp.connect(v.filter('bandpass', range(r, 1400, 1800), 1.1)).connect(v.out);
    rasp.connect(v.filter('lowpass', 3000, 0.7)).connect(v.gain(0.3)).connect(v.out);
  }

  /** A hen's soft clucks: "buk … buk-buk". */
  private hen(v: Voice, t: number): void {
    const r = v.r;
    const f = range(r, 280, 380);
    const clucks: [number, number][] = [];
    let s = t;
    for (let i = 0, n = 2 + Math.floor(r() * 4); i < n; i++) {
      const len = range(r, 0.045, 0.08);
      clucks.push([s, len]);
      s += len + range(r, 0.1, 0.28);
    }
    const last = clucks[clucks.length - 1];
    const o = v.osc('sawtooth', t, last[0] + last[1] + 0.01);
    const env = v.gain();
    for (const [s0, len] of clucks) {
      o.frequency.setValueAtTime(f * range(r, 1.1, 1.2), s0);
      o.frequency.exponentialRampToValueAtTime(f * range(r, 0.85, 0.95), s0 + len);
      note(env.gain, s0, len, range(r, 0.6, 1), 0.005, 0.03);
    }
    o.connect(env).connect(v.filter('bandpass', range(r, 750, 950), 2)).connect(v.filter('lowpass', 2500, 0.7)).connect(v.out);
  }

  /** A sambar's alarm: one sharp, ringing "honk". */
  private deer(v: Voice, t: number): void {
    const r = v.r;
    const f = range(r, 380, 480);
    const dur = range(r, 0.2, 0.3);
    const o = v.osc('sawtooth', t, t + dur + 0.02);
    o.frequency.setValueAtTime(f * 1.12, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
    o.frequency.exponentialRampToValueAtTime(f * 0.82, t + dur);
    const env = v.gain();
    line(env.gain, t, [
      [0, 0],
      [0.008, 0.5],
      [0.06, 0.3],
      [dur * 0.7, 0.15],
      [dur, 0],
    ]);
    o.connect(env);
    env.connect(v.filter('bandpass', range(r, 1050, 1250), 2.2)).connect(v.out);
    env.connect(v.filter('lowpass', 3000, 0.7)).connect(v.gain(0.35)).connect(v.out);
    // The breath of it, at the start.
    const ne = v.gain();
    strike(ne.gain, t, 0.5, 0.003, 0.025);
    v.noise('white', t, t + 0.15).connect(v.filter('bandpass', 1800, 0.9)).connect(ne).connect(v.out);
  }

  /** A water buffalo: a short low grunt, or a long nasal "mmmoo". */
  private buffalo(v: Voice, t: number): void {
    const r = v.r;
    const moo = r() < 0.45;
    const dur = moo ? range(r, 0.9, 1.5) : range(r, 0.3, 0.5);
    const f = moo ? range(r, 100, 130) : range(r, 80, 100);
    const o = v.osc('sawtooth', t, t + dur + 0.02);
    const env = v.gain();
    const nose = v.filter('bandpass', 420, moo ? 2 : 1.6);
    if (moo) {
      line(o.frequency, t, [
        [0, f * 0.9],
        [dur * 0.3, f * 1.06],
        [dur, f * 0.94],
      ]);
      line(env.gain, t, [
        [0, 0],
        [0.15, 0.3],
        [dur * 0.4, 0.4],
        [dur * 0.85, 0.28],
        [dur, 0],
      ]);
      // "mm" opening to "oo".
      line(nose.frequency, t, [
        [0, 320],
        [dur * 0.4, 650],
        [dur, 480],
      ]);
    } else {
      line(o.frequency, t, [
        [0, f * 1.05],
        [dur, f * 0.85],
      ]);
      line(env.gain, t, [
        [0, 0],
        [0.03, 0.4],
        [dur * 0.5, 0.28],
        [dur, 0],
      ]);
    }
    o.connect(env);
    // Breath through the same envelope.
    v.noise('pink', t, t + dur).connect(v.filter('lowpass', 600, 0.7)).connect(v.gain(0.6)).connect(env);
    env.connect(nose).connect(v.out);
    env.connect(v.filter('lowpass', moo ? 1400 : 1000, 0.7)).connect(v.gain(0.4)).connect(v.out);
  }

  // ── Water and air ─────────────────────────────────────────────────────────

  /** A duck: a few nasal quacks, the first loudest. */
  private duck(v: Voice, t: number): void {
    const r = v.r;
    const f = range(r, 200, 260);
    const quacks: [number, number][] = [];
    let s = t;
    for (let i = 0, n = 2 + Math.floor(r() * 4); i < n; i++) {
      const len = range(r, 0.1, 0.17);
      quacks.push([s, len]);
      s += len + range(r, 0.08, 0.2);
    }
    const last = quacks[quacks.length - 1];
    const end = last[0] + last[1];
    const o = v.osc('sawtooth', t, end + 0.01);
    const env = v.gain();
    quacks.forEach(([s0, len], i) => {
      const peak = 0.5 * 0.85 ** i * range(r, 0.85, 1);
      o.frequency.setValueAtTime(f * range(r, 1.1, 1.2), s0);
      o.frequency.linearRampToValueAtTime(f * range(r, 0.8, 0.9), s0 + len);
      line(env.gain, s0, [
        [0, 0],
        [0.01, peak],
        [len * 0.5, peak * 0.8],
        [len, 0],
      ]);
    });
    // A buzzy rasp, then the nose: two narrow bands, and a little body.
    const rasp = v.gain(0.7);
    v.lfo(rasp.gain, range(r, 30, 40), 0.3, t, end);
    o.connect(env).connect(rasp);
    rasp.connect(v.filter('bandpass', range(r, 1000, 1200), 3.5)).connect(v.out);
    rasp.connect(v.filter('bandpass', range(r, 2200, 2500), 3)).connect(v.gain(0.6)).connect(v.out);
    rasp.connect(v.filter('lowpass', 800, 0.7)).connect(v.gain(0.25)).connect(v.out);
  }

  /** An egret: a harsh, gravelly croak ("kraak"), once or twice. */
  private egret(v: Voice, t: number): void {
    const r = v.r;
    const f = range(r, 120, 170);
    const croaks: [number, number][] = [];
    let s = t;
    for (let i = 0, n = r() < 0.4 ? 2 : 1; i < n; i++) {
      const len = range(r, 0.25, 0.4) * (i ? 0.75 : 1);
      croaks.push([s, len]);
      s += len + range(r, 0.2, 0.4);
    }
    const last = croaks[croaks.length - 1];
    const end = last[0] + last[1];
    const o = v.osc('sawtooth', t, end + 0.01);
    const env = v.gain();
    for (const [s0, len] of croaks) {
      o.frequency.setValueAtTime(f * 1.1, s0);
      o.frequency.linearRampToValueAtTime(f * 0.9, s0 + len);
      line(env.gain, s0, [
        [0, 0],
        [0.02, 0.5],
        [len * 0.6, 0.4],
        [len, 0],
      ]);
    }
    o.connect(env);
    v.noise('pink', t, end).connect(v.filter('bandpass', 1600, 0.8)).connect(v.gain(0.8)).connect(env);
    // A rattle in the throat: the voice chopped at 25–38 Hz.
    const rattle = v.gain(0.55);
    v.lfo(rattle.gain, range(r, 25, 38), 0.45, t, end);
    env.connect(rattle).connect(v.filter('bandpass', range(r, 850, 1150), 1)).connect(v.filter('lowpass', 3500, 0.7)).connect(v.out);
  }

  /** Wings: a few soft flaps (a bird taking off or passing low), fading as it climbs away. */
  private wings(v: Voice, t: number): void {
    const r = v.r;
    const n = 3 + Math.floor(r() * 5);
    const band = v.filter('bandpass', 600, 0.9);
    const env = v.gain();
    let s = t;
    const rate = range(r, 5, 7);
    for (let i = 0; i < n; i++) {
      const len = 1 / (rate * (1 + 0.05 * i));
      const peak = (1 - (0.6 * i) / n) * range(r, 0.8, 1);
      const f = range(r, 800, 1000);
      band.frequency.setValueAtTime(500, s);
      band.frequency.linearRampToValueAtTime(f, s + 0.03);
      band.frequency.linearRampToValueAtTime(600, s + len * 0.7);
      line(env.gain, s, [
        [0, 0],
        [0.02, peak],
        [len * 0.7, 0],
      ]);
      s += len;
    }
    v.noise('pink', t, s).connect(band).connect(env).connect(v.out);
  }

  /** A fish jumping: a small "plop" and splash, a few drops falling back. */
  private fish(v: Voice, t: number): void {
    const r = v.r;
    const big = r() < 0.3;
    // The splash: a hiss of water that dulls as it closes.
    const sp = v.filter('lowpass', 4000, 0.7);
    sp.frequency.setValueAtTime(big ? 5000 : 3500, t);
    sp.frequency.exponentialRampToValueAtTime(900, t + 0.2);
    const se = v.gain();
    strike(se.gain, t, big ? 0.5 : 0.3, 0.003, big ? 0.07 : 0.045);
    v.noise('white', t, t + 0.4).connect(sp).connect(se).connect(v.out);
    // The plop: a bubble's note, rising as it closes; then the drops, on the same voice.
    const f = range(r, 180, 320) * (big ? 0.8 : 1);
    const o = v.osc('sine', t, t + 0.6);
    const oe = v.gain();
    o.frequency.setValueAtTime(f, t + 0.005);
    o.frequency.exponentialRampToValueAtTime(f * range(r, 1.6, 2), t + 0.05);
    strike(oe.gain, t + 0.005, 0.6, 0.002, 0.03);
    let s = t + range(r, 0.1, 0.16);
    for (let i = 0, n = 2 + Math.floor(r() * 3); i < n && s < t + 0.5; i++) {
      const fd = 700 * 3 ** r();
      const tau = range(r, 0.006, 0.014);
      o.frequency.setValueAtTime(fd, s);
      o.frequency.exponentialRampToValueAtTime(fd * range(r, 1.3, 1.7), s + tau * 3);
      strike(oe.gain, s, 0.25 * range(r, 0.4, 1), 0.0015, tau);
      s += range(r, 0.05, 0.12);
    }
    o.connect(oe).connect(v.out);
  }

  /** A bat: faint high squeaks, quick falling chirps (the part of its calls people hear). */
  private bat(v: Voice, t: number): void {
    const r = v.r;
    const squeaks: [number, number][] = [];
    let s = t;
    for (let i = 0, n = 2 + Math.floor(r() * 5); i < n; i++) {
      const len = range(r, 0.012, 0.025);
      squeaks.push([s, len]);
      // Now and then a quick pair ("tsk-tsk").
      s += len + (r() < 0.3 ? range(r, 0.02, 0.03) : range(r, 0.05, 0.14));
    }
    const last = squeaks[squeaks.length - 1];
    const o = v.osc('sine', t, last[0] + last[1] + 0.01);
    const env = v.gain();
    for (const [s0, len] of squeaks) {
      const f0 = range(r, 5000, 6200);
      o.frequency.setValueAtTime(f0, s0);
      o.frequency.exponentialRampToValueAtTime(f0 * range(r, 0.6, 0.7), s0 + len);
      note(env.gain, s0, len, range(r, 0.6, 1), 0.002, 0.008);
    }
    o.connect(env).connect(v.out);
  }

  /** A frog close by: one or two ratchety croaks ("rrrk"), unlike the chorus far off. */
  private frog(v: Voice, t: number): void {
    const r = v.r;
    const f = range(r, 170, 240);
    const rate = range(r, 16, 24);
    const croaks: [number, number][] = [];
    let s = t;
    for (let i = 0, n = r() < 0.5 ? 2 : 1; i < n; i++) {
      const len = i ? range(r, 0.12, 0.2) : range(r, 0.22, 0.35);
      croaks.push([s, len]);
      s += len + range(r, 0.15, 0.3);
    }
    const last = croaks[croaks.length - 1];
    const o = v.osc('sawtooth', t, last[0] + last[1] + 0.01);
    const env = v.gain();
    for (const [s0, len] of croaks) {
      line(o.frequency, s0, [
        [0, f * 0.95],
        [len * 0.4, f * 1.05],
        [len, f],
      ]);
      pulses(env.gain, s0, len, rate, 0.6);
    }
    o.connect(env);
    env.connect(v.filter('bandpass', range(r, 650, 1000), 3.5)).connect(v.out);
    // The wet body of it, from the vocal sac.
    env.connect(v.filter('lowpass', 400, 0.7)).connect(v.gain(0.4)).connect(v.out);
  }

  // ── The jungle (fauna/jungle.ts) ──────────────────────────────────────────

  /** A wild boar sow rooting: a few short, low, nasal grunts ("hunk … hunk-hunk"), breathy and rough. */
  private boar(v: Voice, t: number): void {
    const r = v.r;
    const f = range(r, 85, 120);
    const grunts: [number, number][] = [];
    let s = t;
    for (let i = 0, n = 2 + Math.floor(r() * 4); i < n; i++) {
      const len = range(r, 0.09, 0.2);
      grunts.push([s, len]);
      s += len + range(r, 0.12, 0.35);
    }
    const last = grunts[grunts.length - 1];
    const end = last[0] + last[1];
    const o = v.osc('sawtooth', t, end + 0.02);
    const env = v.gain();
    for (const [s0, len] of grunts) {
      o.frequency.setValueAtTime(f * range(r, 1.1, 1.25), s0);
      o.frequency.exponentialRampToValueAtTime(f * range(r, 0.75, 0.9), s0 + len);
      line(env.gain, s0, [
        [0, 0],
        [0.012, 0.55 * range(r, 0.7, 1)],
        [len * 0.45, 0.35],
        [len, 0],
      ]);
    }
    o.connect(env);
    // Breath through the snout, in the same envelope; the throat rough (chopped at 30–45 Hz).
    v.noise('pink', t, end).connect(v.filter('bandpass', 700, 0.8)).connect(v.gain(0.7)).connect(env);
    const rough = v.gain(0.7);
    v.lfo(rough.gain, range(r, 30, 45), 0.3, t, end);
    env.connect(rough);
    rough.connect(v.filter('bandpass', range(r, 380, 480), 1.4)).connect(v.out);
    rough.connect(v.filter('lowpass', 1400, 0.7)).connect(v.gain(0.35)).connect(v.out);
  }

  /** Piglets: thin squeals ("wee", "wii-ik"), two to four. */
  private piglet(v: Voice, t: number): void {
    const r = v.r;
    const squeals: [number, number][] = [];
    let s = t;
    for (let i = 0, n = 2 + Math.floor(r() * 3); i < n; i++) {
      const len = range(r, 0.06, 0.16);
      squeals.push([s, len]);
      s += len + range(r, 0.05, 0.2);
    }
    const last = squeals[squeals.length - 1];
    const o = v.osc('sawtooth', t, last[0] + last[1] + 0.02);
    const env = v.gain();
    for (const [s0, len] of squeals) {
      const f = range(r, 750, 1150);
      line(o.frequency, s0, [
        [0, f * 0.85],
        [len * 0.35, f * 1.15],
        [len, f * 0.8],
      ]);
      line(env.gain, s0, [
        [0, 0],
        [0.012, 0.45],
        [len * 0.6, 0.35],
        [len, 0],
      ]);
    }
    o.connect(env).connect(v.filter('bandpass', range(r, 1700, 2200), 1.6)).connect(v.filter('lowpass', 4000, 0.7)).connect(v.out);
  }

  /** A green peafowl: a loud, brassy two-note "ki-wao" ("may-awe"), once to three times. */
  private peafowl(v: Voice, t: number): void {
    const r = v.r;
    const f = range(r, 470, 550);
    const calls: [number, number, number][] = [];
    let s = t;
    for (let i = 0, n = 1 + Math.floor(r() * 3); i < n; i++) {
      const a = range(r, 0.12, 0.17);
      const b = range(r, 0.4, 0.58);
      calls.push([s, a, b]);
      s += a + 0.05 + b + range(r, 0.5, 0.9);
    }
    const last = calls[calls.length - 1];
    const end = last[0] + last[1] + 0.05 + last[2];
    const o = v.osc('sawtooth', t, end + 0.02);
    const env = v.gain();
    for (const [s0, a, b] of calls) {
      // "ki": short and rising; "wao": high, then falling away.
      line(o.frequency, s0, [
        [0, f * 0.95],
        [a, f * 1.25],
      ]);
      line(env.gain, s0, [
        [0, 0],
        [0.015, 0.32],
        [a, 0],
      ]);
      const s1 = s0 + a + 0.05;
      line(o.frequency, s1, [
        [0, f * 1.4],
        [b * 0.3, f * 1.55],
        [b, f * 1.02],
      ]);
      line(env.gain, s1, [
        [0, 0],
        [0.03, 0.42],
        [b * 0.5, 0.5],
        [b * 0.85, 0.3],
        [b, 0],
      ]);
    }
    v.lfo(o.frequency, range(r, 6, 8), f * 0.015, t, end);
    o.connect(env);
    env.connect(v.filter('bandpass', range(r, 1200, 1450), 1.3)).connect(v.out);
    env.connect(v.filter('bandpass', range(r, 2400, 2800), 2)).connect(v.gain(0.45)).connect(v.out);
    env.connect(v.filter('lowpass', 3000, 0.7)).connect(v.gain(0.18)).connect(v.out);
  }

  /** A great hornbill: deep, harsh barks ("gok … gok-gok-gok"), quickening, now and then ending in a roar. */
  private hornbill(v: Voice, t: number): void {
    const r = v.r;
    const f = range(r, 170, 230);
    const barks: [number, number][] = [];
    let s = t;
    let gap = range(r, 0.28, 0.4);
    for (let i = 0, n = 3 + Math.floor(r() * 5); i < n; i++) {
      const len = range(r, 0.09, 0.15);
      barks.push([s, len]);
      s += len + gap;
      gap *= range(r, 0.78, 0.9);
    }
    const roar = r() < 0.4;
    if (roar) barks.push([s, range(r, 0.35, 0.5)]);
    const last = barks[barks.length - 1];
    const end = last[0] + last[1];
    const o = v.osc('sawtooth', t, end + 0.02);
    const env = v.gain();
    barks.forEach(([s0, len], i) => {
      const long = roar && i === barks.length - 1;
      o.frequency.setValueAtTime(f * (long ? 1.1 : 1.25), s0);
      o.frequency.exponentialRampToValueAtTime(f * (long ? 0.8 : 0.9), s0 + len);
      line(env.gain, s0, [
        [0, 0],
        [0.008, 0.55],
        [len * 0.5, long ? 0.45 : 0.3],
        [len, 0],
      ]);
    });
    o.connect(env);
    v.noise('white', t, end).connect(v.filter('bandpass', 1200, 0.9)).connect(v.gain(0.35)).connect(env);
    // A harsh rasp, and the long bill's two resonances.
    const rasp = v.gain(0.65);
    v.lfo(rasp.gain, range(r, 45, 70), 0.35, t, end);
    env.connect(rasp);
    rasp.connect(v.filter('bandpass', range(r, 550, 700), 1.4)).connect(v.out);
    rasp.connect(v.filter('bandpass', range(r, 1050, 1300), 2)).connect(v.gain(0.6)).connect(v.out);
  }

  /**
   * A great hornbill's wings going over: heavy rushing beats ("whoosh …
   * whoosh"), like a steam train, one per downstroke at the model's 2.4
   * beats a second (fauna/_jungleBirds.ts), with a soft thump in each.
   */
  private whoosh(v: Voice, t: number): void {
    const r = v.r;
    const w = 1 / 2.4;
    const band = v.filter('bandpass', 420, 0.8);
    const env = v.gain();
    const thump = v.gain();
    let s = t;
    for (let i = 0, n = 4 + Math.floor(r() * 2); i < n; i++) {
      const peak = (1 - 0.12 * i) * range(r, 0.85, 1);
      line(band.frequency, s, [
        [0, 380],
        [w * 0.3, range(r, 850, 1050)],
        [w * 0.8, 420],
      ]);
      line(env.gain, s, [
        [0, 0],
        [w * 0.28, peak],
        [w * 0.95, 0],
      ]);
      line(thump.gain, s, [
        [0, 0],
        [w * 0.2, 0.5 * peak],
        [w * 0.55, 0],
      ]);
      s += w;
    }
    v.noise('pink', t, s).connect(band).connect(env).connect(v.out);
    v.noise('brown', t, s).connect(v.filter('lowpass', 220, 0.8)).connect(thump).connect(v.out);
  }

  /** A giant ibis: loud, low, nasal honks ("ow-aa"), two to four. */
  private ibis(v: Voice, t: number): void {
    const r = v.r;
    const f = range(r, 125, 165);
    const honks: [number, number][] = [];
    let s = t;
    for (let i = 0, n = 2 + Math.floor(r() * 3); i < n; i++) {
      const len = range(r, 0.28, 0.42);
      honks.push([s, len]);
      s += len + range(r, 0.18, 0.4);
    }
    const last = honks[honks.length - 1];
    const end = last[0] + last[1];
    const o = v.osc('sawtooth', t, end + 0.02);
    const env = v.gain();
    const mouth = v.filter('bandpass', 650, 2.2);
    for (const [s0, len] of honks) {
      line(o.frequency, s0, [
        [0, f],
        [len * 0.3, f * 1.12],
        [len, f * 0.88],
      ]);
      line(env.gain, s0, [
        [0, 0],
        [0.03, 0.5],
        [len * 0.7, 0.4],
        [len, 0],
      ]);
      // "ow" opening to "aa".
      line(mouth.frequency, s0, [
        [0, 560],
        [len * 0.5, 950],
        [len, 820],
      ]);
    }
    o.connect(env);
    v.noise('pink', t, end).connect(v.filter('bandpass', 1400, 1)).connect(v.gain(0.4)).connect(env);
    env.connect(mouth).connect(v.out);
    env.connect(v.filter('bandpass', 1600, 3)).connect(v.gain(0.35)).connect(v.out);
    env.connect(v.filter('lowpass', 700, 0.7)).connect(v.gain(0.25)).connect(v.out);
  }

  /**
   * A pair of pileated gibbons singing their morning duet (about 14 s, as
   * long as the song in fauna/_jungleGibbons.ts): the female's great call —
   * a few soft hoots, then whooping notes that rise and quicken into a
   * bubbling trill, and fall away — and the male's short "hoo-wa" phrases
   * before it and after. Clear, fluting tones.
   */
  private gibbon(v: Voice, t: number): void {
    const r = v.r;
    const tone = softWave(v.ctx, 2.2, 6);
    const out = v.filter('lowpass', 4000, 0.7);
    out.connect(v.out);
    // ── Female ──
    const fo = v.osc(tone, t, t + 15.5);
    const fe = v.gain();
    const vib = v.gain(0);
    v.osc('sine', t, t + 15.5, range(r, 8, 10)).connect(vib).connect(fo.frequency);
    fo.connect(fe).connect(out);
    const f0 = range(r, 560, 640);
    let s = t + 0.2;
    // Soft opening hoots.
    for (let i = 0; i < 3; i++) {
      const len = range(r, 0.28, 0.36);
      line(fo.frequency, s, [
        [0, f0 * 0.9],
        [len * 0.6, f0 * 1.08],
        [len, f0 * 0.95],
      ]);
      note(fe.gain, s, len, 0.24 + 0.04 * i, 0.06, 0.1);
      s += len + range(r, 0.4, 0.55);
    }
    // The great call: whoops rising and quickening.
    let gap = 0.42;
    for (let i = 0, n = 9 + Math.floor(r() * 3); i < n; i++) {
      const k = i / (n - 1);
      const len = 0.3 - 0.13 * k;
      const lo = f0 * (1 + 0.55 * k);
      line(fo.frequency, s, [
        [0, lo],
        [len * 0.7, lo * (1.45 + 0.2 * k)],
        [len, lo * 1.3],
      ]);
      note(fe.gain, s, len, 0.3 + 0.16 * k, 0.03, 0.06);
      s += len + gap;
      gap *= 0.8;
    }
    // The climax: a bubbling trill up high, then notes falling away.
    const top = f0 * 2.05;
    const trill = range(r, 1.2, 1.6);
    line(fo.frequency, s, [
      [0, top * 0.95],
      [trill * 0.3, top * 1.05],
      [trill, top * 0.9],
    ]);
    line(vib.gain, s, [
      [0, 0],
      [0.1, top * 0.07],
      [trill - 0.1, top * 0.06],
      [trill, 0],
    ]);
    note(fe.gain, s, trill, 0.46, 0.05, 0.15);
    s += trill + 0.15;
    for (let i = 0; i < 3; i++) {
      const hi = top * (0.85 - 0.12 * i);
      line(fo.frequency, s, [
        [0, hi],
        [0.35, hi * 0.7],
      ]);
      note(fe.gain, s, 0.35, 0.32 - 0.07 * i, 0.03, 0.12);
      s += 0.55;
    }
    const femaleEnd = s;
    // ── Male: phrases while she opens, and after her call ──
    const mo = v.osc(tone, t, t + 15.5);
    const me = v.gain();
    mo.connect(me).connect(out);
    const m0 = range(r, 470, 530);
    let q = gibbonPhrase(r, mo.frequency, me.gain, t + 1.4, m0, 2);
    q = gibbonPhrase(r, mo.frequency, me.gain, q + range(r, 0.6, 1), m0, 2);
    q = Math.max(q + 0.5, femaleEnd + 0.1);
    q = gibbonPhrase(r, mo.frequency, me.gain, q, m0 * 1.05, 3);
    if (q < t + 14.2) gibbonPhrase(r, mo.frequency, me.gain, q + 0.4, m0, 2);
  }

  /** A gibbon's short call now and then: a few "hoo-wa" notes, rising. */
  private gibbonHoot(v: Voice, t: number): void {
    const r = v.r;
    const o = v.osc(softWave(v.ctx, 2.2, 6), t, t + 4);
    const e = v.gain();
    o.connect(e).connect(v.filter('lowpass', 4000, 0.7)).connect(v.out);
    const m0 = range(r, 480, 600);
    const q = gibbonPhrase(r, o.frequency, e.gain, t + 0.05, m0, 2 + Math.floor(r() * 2));
    if (r() < 0.5 && q < t + 2.6) gibbonPhrase(r, o.frequency, e.gain, q + 0.3, m0 * 1.1, 2);
  }

  /** A variable squirrel scolding: quick, dry "chk-chk-chk" with a squeak in each, ending in a rattle. */
  private squirrel(v: Voice, t: number): void {
    const r = v.r;
    const n = 6 + Math.floor(r() * 8);
    const rate = range(r, 8, 12);
    const ne = v.gain();
    const o = v.osc('sine', t, t + (1.2 * n) / rate + 0.1);
    const oe = v.gain();
    let s = t;
    for (let i = 0; i < n; i++) {
      strike(ne.gain, s, 0.9, 0.002, 0.012);
      const f = range(r, 2600, 3400);
      o.frequency.setValueAtTime(f, s);
      o.frequency.exponentialRampToValueAtTime(f * 0.7, s + 0.035);
      strike(oe.gain, s, 0.3, 0.003, 0.015);
      s += (1 / rate) * range(r, 0.85, 1.15);
    }
    // The rattle at the end.
    const len = range(r, 0.2, 0.35);
    pulses(ne.gain, s, len, range(r, 35, 45), 0.6);
    v.noise('white', t, s + len).connect(v.filter('bandpass', range(r, 3400, 4200), 3)).connect(ne).connect(v.out);
    o.connect(oe).connect(v.filter('highpass', 1500, 0.7)).connect(v.out);
  }
}

/**
 * A gibbon's phrase on one voice: `n` pairs of a quick rising "hoo" and a
 * falling "wa" from base pitch `f` (Hz), from time `at`; returns its end.
 */
function gibbonPhrase(r: () => number, freq: AudioParam, gain: AudioParam, at: number, f: number, n: number): number {
  let q = at;
  for (let i = 0; i < n; i++) {
    const up = f * (1 + 0.06 * i);
    line(freq, q, [
      [0, up * 0.95],
      [0.1, up * 1.4],
      [0.12, up * 1.5],
    ]);
    note(gain, q, 0.12, 0.24, 0.02, 0.04);
    q += 0.16;
    line(freq, q, [
      [0, up * 1.55],
      [0.2, up],
    ]);
    note(gain, q, 0.2, 0.2, 0.02, 0.08);
    q += 0.2 + range(r, 0.12, 0.25);
  }
  return q;
}
