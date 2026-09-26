import type { MapWeather } from '../types';
import { biquad, cleanup, glide, noise, range, source, type Rng } from './dsp';
import type { SoundEngine } from './engine';
import type { Ears } from './water';

/**
 * The weather's sound (sky/weather.ts sets `f.weather`), on the ambience bus:
 *  - rain: a hiss that thickens and brightens with `rain`, a patter of
 *    drops in it, and in heavy rain a low roar on the land;
 *  - drops on the big leaves near the explorer while he walks under them in
 *    rain (on foot, leaves over him: `LEAVES`; not in the balloon, the boat
 *    or on the glider): soft taps and now and then a plink of a drop
 *    falling off a leaf;
 *  - wind: gusts rising and falling with `wind` (on top of the ambience's
 *    own breeze in the trees), deeper and louder in a storm's gust front;
 *  - thunder after each lightning flash (`flashAt`, `flashX`, `flashZ`):
 *    later the farther it struck (sound: 340 m/s), a crack first when it is
 *    close, then a low rolling rumble, longer, lower and softer far off,
 *    from the side it struck on;
 *  - birds and cicadas keep quiet in the rain (Ambience.setRain).
 * The loops run only while they are heard (nothing is made while it is dry
 * and calm, nor while the ambience is muted: `idle`).
 */

/** Base levels (before the ambience volume). */
const LEVEL = {
  hiss: 0.2,
  patter: 0.13,
  roar: 0.16,
  wind: 0.24,
  tap: 0.09,
  thunder: 0.9,
};
/** Speed of sound (m/s). */
const SOUND = 340;
/** Thunder farther than this is not heard (m). */
const THUNDER_MAX = 4000;
/** Leaves over him (`MapFrame.canopy`, on foot) from which the drops tap on them round him. */
const LEAVES = 0.2;

/** A looping buffer that runs only while its level is up (then stops a while after it falls silent). */
class Loop {
  private src: AudioBufferSourceNode | null = null;
  private idleSince = -1;
  private readonly ctx: BaseAudioContext;
  private readonly make: () => AudioBuffer;
  private readonly dest: AudioNode;
  private readonly rnd: Rng;
  private readonly rate: number;

  constructor(ctx: BaseAudioContext, make: () => AudioBuffer, dest: AudioNode, rnd: Rng, rate = 1) {
    this.ctx = ctx;
    this.make = make;
    this.dest = dest;
    this.rnd = rnd;
    this.rate = rate;
  }

  want(on: boolean, now: number): void {
    if (on) {
      this.idleSince = -1;
      if (this.src) return;
      const buf = this.make();
      const s = this.ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.playbackRate.value = this.rate;
      s.connect(this.dest);
      s.start(now, this.rnd() * buf.duration);
      s.onended = () => s.disconnect();
      this.src = s;
    } else if (this.src) {
      if (this.idleSince < 0) this.idleSince = now;
      else if (now - this.idleSince > 8) {
        this.src.stop(now);
        this.src = null;
        this.idleSince = -1;
      }
    }
  }
}

export class WeatherSound {
  private readonly e: SoundEngine;
  private readonly ctx: BaseAudioContext;
  private readonly rnd: Rng;
  private readonly hiss: GainNode;
  private readonly hissTone: BiquadFilterNode;
  private readonly patter: GainNode;
  private readonly roar: GainNode;
  private readonly wind: GainNode;
  private readonly gust: GainNode;
  private readonly windTone: BiquadFilterNode;
  private readonly loops: { loop: Loop; on: () => boolean }[];
  /** The weather now (levels the voices read when they are scheduled). */
  private rain = 0;
  private blow = 0;
  private storm = 0;
  /** Leaves over him on foot (0‥1): the drops tap on them round him. */
  private leaves = 0;
  private readonly applied = { rain: -1, blow: -1, storm: -1, roaming: false };
  private lastFlash = -1e9;
  private nextGust = -1;
  private nextTap = -1;

  constructor(e: SoundEngine) {
    this.e = e;
    const ctx = (this.ctx = e.ctx);
    this.rnd = e.rnd;
    const dry = e.bus.ambience.dry;
    const wet = e.bus.ambience.wet;
    const gain = (v: number) => {
      const g = ctx.createGain();
      g.gain.value = v;
      return g;
    };
    // Rain: bright hiss (pink noise, high-passed), its top opening up as it gets heavier.
    this.hissTone = biquad(ctx, 'lowpass', 4000, 0.5);
    this.hiss = gain(0);
    const hissIn = biquad(ctx, 'highpass', 700, 0.6);
    hissIn.connect(this.hissTone).connect(this.hiss).connect(dry);
    this.hiss.connect(gain(0.15)).connect(wet);
    // The patter of drops: the leaves' rustle grains, faster, in a band.
    this.patter = gain(0);
    const patterIn = biquad(ctx, 'bandpass', 2600, 0.7);
    patterIn.connect(this.patter).connect(dry);
    // Heavy rain's low roar on the land.
    this.roar = gain(0);
    const roarIn = biquad(ctx, 'lowpass', 520, 0.5);
    roarIn.connect(this.roar).connect(dry);
    this.roar.connect(gain(0.3)).connect(wet);
    // Wind: pink noise in a band that climbs with the gusts.
    this.windTone = biquad(ctx, 'bandpass', 380, 0.6);
    this.gust = gain(0.5);
    this.wind = gain(0);
    const windIn = biquad(ctx, 'highpass', 90, 0.5);
    windIn.connect(this.windTone).connect(this.gust).connect(this.wind).connect(dry);
    this.wind.connect(gain(0.2)).connect(wet);
    this.loops = [
      { loop: new Loop(ctx, () => noise('pink'), hissIn, this.rnd), on: () => this.rain > 0.002 },
      { loop: new Loop(ctx, () => source('rustle'), patterIn, this.rnd, 1.7), on: () => this.rain > 0.002 },
      { loop: new Loop(ctx, () => noise('brown'), roarIn, this.rnd), on: () => this.rain > 0.4 },
      { loop: new Loop(ctx, () => noise('pink'), windIn, this.rnd, 0.93), on: () => this.blow > 0.12 },
    ];
  }

  /**
   * Every frame: the weather, where the ears are, whether he roams (the rain
   * is nearer), the page time (s, `f.t`), the leaves over him on foot
   * (drops on them round him). Levels glide; a new lightning flash sends
   * its thunder on its way.
   */
  set(w: MapWeather, ears: Ears, roaming: boolean, t: number, leaves = 0): void {
    this.rain = w.rain;
    this.blow = Math.max(0, (w.wind - 0.2) / 0.8);
    this.storm = w.storm;
    this.leaves = leaves;
    const now = this.ctx.currentTime;
    const a = this.applied;
    if (Math.abs(a.rain - this.rain) > 0.01 || Math.abs(a.blow - this.blow) > 0.01 || Math.abs(a.storm - this.storm) > 0.01 || a.roaming !== roaming) {
      a.rain = this.rain;
      a.blow = this.blow;
      a.storm = this.storm;
      a.roaming = roaming;
      const r = this.rain;
      // (in the overview, high over the land, the rain is a little farther off)
      const near = roaming ? 1 : 0.7;
      glide(this.hiss.gain, LEVEL.hiss * r ** 0.8 * near, now, 0.6);
      glide(this.hissTone.frequency, 2800 + 6200 * r, now, 0.6);
      glide(this.patter.gain, LEVEL.patter * r * (roaming ? 1 : 0.45), now, 0.6);
      glide(this.roar.gain, LEVEL.roar * Math.max(0, (r - 0.4) / 0.6) * (0.7 + 0.3 * this.storm), now, 0.8);
      glide(this.wind.gain, LEVEL.wind * this.blow ** 1.3 * (0.8 + 0.4 * this.storm), now, 0.8);
    }
    // Thunder after each new flash, later the farther it struck.
    if (w.flashAt !== this.lastFlash) {
      const first = this.lastFlash === -1e9 && t - w.flashAt > 2;
      this.lastFlash = w.flashAt;
      if (!first && t - w.flashAt < 2) {
        const dx = w.flashX - ears.x;
        const dz = w.flashZ - ears.z;
        // (the nearest part of the bolt: a few hundred metres up)
        const d = Math.hypot(dx, dz, 300);
        if (d < THUNDER_MAX && this.e.heard('ambience')) {
          const side = (dx * ears.right[0] + dz * ears.right[2]) / Math.max(1, Math.hypot(dx, dz));
          this.thunder(d, side, now + Math.max(0, d / SOUND - (t - w.flashAt)));
        }
      }
    }
  }

  /** Fill in gusts and drops up to `until` (audio clock, s). */
  schedule(now: number, until: number): void {
    for (const l of this.loops) l.loop.want(l.on(), now);
    const r = this.rnd;
    if (this.nextGust < now) this.nextGust = now;
    while (this.nextGust < until) this.nextGust = this.gustAt(this.nextGust);
    if (this.nextTap < now) this.nextTap = now + range(r, 0.05, 0.4);
    while (this.nextTap < until) this.nextTap = this.tapAt(this.nextTap);
  }

  /** The ambience is muted (nothing is scheduled): the rain and wind loops stop once silent. */
  idle(now: number): void {
    for (const l of this.loops) l.loop.want(false, now);
  }

  // ── Wind ──────────────────────────────────────────────────────────────────

  private gustAt(t: number): number {
    const r = this.rnd;
    const b = this.blow;
    if (b <= 0.01) return t + 1;
    // Stronger gusts the harder it blows; a lull now and then.
    const g = r() < 0.2 ? range(r, 0.2, 0.4) : range(r, 0.55, 1);
    const tc = range(r, 0.6, 1.8) / (0.6 + 0.6 * b);
    this.gust.gain.setTargetAtTime(g, t, tc);
    this.windTone.frequency.setTargetAtTime(240 + 700 * g * (0.5 + 0.5 * b), t, tc * 1.2);
    return t + range(r, 1.5, 5) / (0.7 + 0.5 * b);
  }

  // ── Drops on the leaves round him ─────────────────────────────────────────

  private tapAt(t: number): number {
    const r = this.rnd;
    const rain = this.rain;
    if (this.leaves < LEAVES || rain < 0.05) return t + 0.5;
    const ctx = this.ctx;
    const pan = ctx.createStereoPanner();
    pan.pan.value = range(r, -0.9, 0.9);
    const env = ctx.createGain();
    env.gain.value = 0;
    const level = LEVEL.tap * range(r, 0.3, 1);
    pan.connect(this.e.bus.ambience.dry);
    if (r() < 0.8) {
      // A drop on a big leaf: a soft tap (a click of noise in a woody band).
      const src = ctx.createBufferSource();
      src.buffer = noise('white');
      const bp = biquad(ctx, 'bandpass', range(r, 650, 1700), range(r, 1.5, 3));
      src.connect(bp).connect(env).connect(pan);
      env.gain.setValueAtTime(level, t);
      env.gain.setTargetAtTime(0, t + 0.004, range(r, 0.01, 0.025));
      src.start(t, r() * 4);
      src.stop(t + 0.15);
      cleanup(src, [src, bp, env, pan]);
    } else {
      // A drop off a leaf into a puddle: a short rising plink.
      const osc = ctx.createOscillator();
      const f = range(r, 900, 1500);
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * range(r, 1.6, 2.4), t + 0.05);
      osc.connect(env).connect(pan);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(level * 0.6, t + 0.004);
      env.gain.setTargetAtTime(0, t + 0.01, 0.025);
      osc.start(t);
      osc.stop(t + 0.15);
      cleanup(osc, [osc, env, pan]);
    }
    // (a few a second in light rain, a dozen in heavy)
    return t + (-Math.log(1 - r() * 0.99) / (2 + 10 * rain)) + 0.01;
  }

  // ── Thunder ───────────────────────────────────────────────────────────────

  /** Thunder from `d` m away, on the `side` (−1 left … 1 right), heard from `when` (audio clock, s). */
  private thunder(d: number, side: number, when: number): void {
    const ctx = this.ctx;
    const r = this.rnd;
    const near = 1 - Math.min(1, Math.max(0, (d - 300) / 1500));
    const level = LEVEL.thunder * (0.25 + 0.75 * near * near) * (0.8 + 0.2 * r());
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-0.8, Math.min(0.8, side * 0.8));
    pan.connect(this.e.bus.ambience.dry);
    const send = ctx.createGain();
    send.gain.value = 0.35 + 0.35 * (1 - near);
    pan.connect(send).connect(this.e.bus.ambience.wet);
    const nodes: AudioNode[] = [pan, send];

    // Close by: a sharp crack first, and a tearing crackle after it.
    if (near > 0.45) {
      const src = ctx.createBufferSource();
      src.buffer = noise('white');
      const hp = biquad(ctx, 'highpass', 1200, 0.6);
      const env = ctx.createGain();
      env.gain.value = 0;
      src.connect(hp).connect(env).connect(pan);
      const k = level * (near - 0.45) * 1.6;
      let s = when;
      for (let i = 0, n = 3 + Math.floor(r() * 4); i < n; i++) {
        env.gain.setValueAtTime(k * (i === 0 ? 1 : range(r, 0.2, 0.55)), s);
        env.gain.setTargetAtTime(0, s + 0.003, i === 0 ? 0.06 : range(r, 0.015, 0.04));
        s += i === 0 ? range(r, 0.08, 0.14) : range(r, 0.03, 0.09);
      }
      src.start(when, r() * 3);
      src.stop(s + 0.4);
      cleanup(src, [src, hp, env]);
    }

    // The rumble: low noise rolling in a few swells, longer and lower the farther it is.
    const dur = 3 + 4 * (1 - near) + r() * 2;
    const src = ctx.createBufferSource();
    src.buffer = noise('brown');
    src.loop = true;
    const lp = biquad(ctx, 'lowpass', 120 + 480 * near, 0.7);
    const env = ctx.createGain();
    env.gain.value = 0;
    src.connect(lp).connect(env).connect(pan);
    const N = 160;
    const curve = new Float32Array(N);
    const swells: [number, number, number][] = [];
    for (let i = 0, n = 2 + Math.floor(r() * 4); i < n; i++) swells.push([i === 0 ? 0 : range(r, 0.05, 0.7) * dur, i === 0 ? 1 : range(r, 0.35, 0.85), range(r, 0.5, 1.6)]);
    const attack = 0.04 + 0.35 * (1 - near);
    for (let j = 0; j < N; j++) {
      const x = (j / (N - 1)) * dur;
      let v = 0;
      for (const [at, amp, tau] of swells) {
        const u = x - at;
        if (u > 0) v += amp * Math.min(1, u / attack) * Math.exp(-u / tau);
      }
      curve[j] = Math.min(1.4, v) * level * (1 - (j / (N - 1)) ** 4);
    }
    env.gain.setValueCurveAtTime(curve, when, dur);
    // (it darkens as it rolls away)
    lp.frequency.setValueAtTime(lp.frequency.value * 1.6, when);
    lp.frequency.exponentialRampToValueAtTime(Math.max(70, lp.frequency.value * 0.6), when + dur);
    src.start(when, r() * 4);
    src.stop(when + dur + 0.1);
    cleanup(src, [src, lp, env, ...nodes]);
  }
}
