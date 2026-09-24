import type { UISound } from '../types';
import { Ambience } from './ambience';
import { clamp01, impulse, mulberry32, softClipCurve, type Rng } from './dsp';
import { Music } from './music';
import { Sfx } from './sfx';

/**
 * The sound graph of the map, on any `BaseAudioContext` (live or offline).
 *
 *   music  ─┐              ┌─ dry ─────────────────────────┐
 *   ambience┼─ Bus: volume ┤                               ├─ master ─ compressor ─ trim ─ soft clip ─ out ─ speakers
 *   ui     ─┘              └─ wet ─ reverb (convolver) ────┘
 *
 * Voices are scheduled ahead on the audio clock: `schedule(until)` fills in
 * every note and call up to `until` (live: every 250 ms, ~1 s ahead;
 * offline: once, for the whole render).
 */

export interface Volumes {
  music: number;
  ambience: number;
  sfx: number;
}
export interface Mix {
  /** 0 day … 1 night. */
  night: number;
  /** 0‥1: louder water (the camera is on a place with waterfalls). */
  water: number;
}

/** Reverb return level. */
const REVERB = 0.5;
/** Level after the compressor (it adds make-up gain; this takes it back). */
const TRIM = 0.62;

/** A mixer channel: `dry` and `wet` (reverb send) inputs under one volume, with a fade-in. */
export class Bus {
  readonly dry: GainNode;
  readonly wet: GainNode;
  private readonly fades: GainNode[];

  constructor(ctx: BaseAudioContext, out: AudioNode, reverb: AudioNode, faded: boolean) {
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    const fd = ctx.createGain();
    const fw = ctx.createGain();
    this.dry.connect(fd).connect(out);
    this.wet.connect(fw).connect(reverb);
    this.fades = [fd, fw];
    if (faded) for (const f of this.fades) f.gain.value = 0;
  }

  /** Slider 0‥1 → gain (squared: closer to how loud it feels). */
  volume(v: number, t: number, tc: number): void {
    const g = clamp01(v) ** 2;
    for (const p of [this.dry.gain, this.wet.gain]) {
      if (tc > 0) p.setTargetAtTime(g, t, tc);
      else {
        p.cancelScheduledValues(t);
        p.setValueAtTime(g, t);
      }
    }
  }

  /** Fade in from silence over `seconds` (slow at first, like a swell). */
  fadeIn(t: number, seconds: number): void {
    for (const f of this.fades) {
      f.gain.cancelScheduledValues(t);
      if (seconds <= 0) f.gain.setValueAtTime(1, t);
      else {
        const curve = new Float32Array(32);
        for (let i = 0; i < curve.length; i++) curve[i] = (i / (curve.length - 1)) ** 2;
        f.gain.setValueCurveAtTime(curve, t, seconds);
      }
    }
  }
}

export class SoundEngine {
  readonly ctx: BaseAudioContext;
  readonly rnd: Rng;
  /** Everything sums here, before the compressor. */
  readonly master: GainNode;
  /** After the limiter: fades everything out when the tab is hidden. */
  readonly out: GainNode;
  readonly musicBus: Bus;
  readonly ambBus: Bus;
  readonly uiBus: Bus;
  /** Current time of day and water boost (voices read them when they are scheduled). */
  night = 0;
  water = 0;
  private readonly ambience: Ambience;
  private readonly music: Music;
  private readonly sfx: Sfx;
  private applied: Mix = { night: -1, water: -1 };
  private volumes: Volumes = { music: 1, ambience: 1, sfx: 1 };

  constructor(ctx: BaseAudioContext, opts: { seed?: number } = {}) {
    this.ctx = ctx;
    this.rnd = mulberry32(opts.seed ?? Math.floor(Math.random() * 2 ** 32));

    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 10;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.008;
    comp.release.value = 0.3;
    const trim = ctx.createGain();
    trim.gain.value = TRIM;
    // Safety: the soft clip never lets a sample past −3.3 dBFS.
    const clip = ctx.createWaveShaper();
    clip.curve = softClipCurve(0.5, 0.68);
    this.out = ctx.createGain();
    this.master.connect(comp).connect(trim).connect(clip).connect(this.out).connect(ctx.destination);

    const reverbIn = ctx.createGain();
    const conv = ctx.createConvolver();
    conv.buffer = impulse(ctx);
    const ret = ctx.createGain();
    ret.gain.value = REVERB;
    reverbIn.connect(conv).connect(ret).connect(this.master);

    this.musicBus = new Bus(ctx, this.master, reverbIn, true);
    this.ambBus = new Bus(ctx, this.master, reverbIn, true);
    this.uiBus = new Bus(ctx, this.master, reverbIn, false);

    this.ambience = new Ambience(this);
    this.music = new Music(this);
    this.sfx = new Sfx(this);
  }

  setVolumes(v: Volumes, immediate = false): void {
    this.volumes = { ...v };
    const t = this.ctx.currentTime;
    const tc = immediate ? 0 : 0.12;
    this.musicBus.volume(v.music, t, tc);
    this.ambBus.volume(v.ambience, t, tc);
    this.uiBus.volume(v.sfx, t, tc);
  }

  /** Time of day and water; small changes are skipped (called every frame). */
  setMix(m: Mix, immediate = false): void {
    const night = clamp01(m.night);
    const water = clamp01(m.water);
    this.night = night;
    this.water = water;
    if (!immediate && Math.abs(night - this.applied.night) < 0.01 && Math.abs(water - this.applied.water) < 0.01) return;
    this.applied = { night, water };
    const t = this.ctx.currentTime;
    this.ambience.mix(night, water, t, immediate ? 0 : 0.5);
    this.music.mix(night, t, immediate ? 0 : 0.8);
  }

  /** Music and ambience swell in from silence (interface sounds are never faded). */
  fadeIn(seconds: number): void {
    const t = this.ctx.currentTime;
    this.musicBus.fadeIn(t, seconds);
    this.ambBus.fadeIn(t, seconds);
  }

  /** Quiet everything (tab hidden) or bring it back. */
  hush(on: boolean): void {
    this.out.gain.setTargetAtTime(on ? 0 : 1, this.ctx.currentTime, on ? 0.05 : 0.35);
  }

  /** Schedule every voice up to `until` (audio clock, s). A muted bus schedules nothing. */
  schedule(until: number): void {
    const now = this.ctx.currentTime;
    if (this.volumes.ambience > 0) this.ambience.schedule(now, until);
    if (this.volumes.music > 0) this.music.schedule(now, until);
  }

  play(s: UISound, when = 0): void {
    this.sfx.play(s, Math.max(when, this.ctx.currentTime));
  }

  flight(seconds: number, when = 0): void {
    this.sfx.flight(seconds, Math.max(when, this.ctx.currentTime));
  }
}
