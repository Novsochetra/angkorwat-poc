import type { HeightField } from '../heightfield';
import type { AnimalCall, RoamSound, UISound } from '../types';
import { Ambience } from './ambience';
import { Animals } from './animals';
import { clamp01, impulse, mulberry32, softClipCurve, type Rng } from './dsp';
import { Explorer } from './explorer';
import { Music } from './music';
import { Sfx } from './sfx';
import { Water, type Ears } from './water';

/**
 * The sound graph of the map, on any `BaseAudioContext` (live or offline).
 *
 *   music   ─┐              ┌─ dry ──────────────────────────┐
 *   ambience ┤              │                                │
 *   water   ─┼─ Bus: volume ┤                                ├─ sum ─ compressor ─ trim ─ soft clip ─ master ─ out ─ speakers
 *   sfx     ─┘              └─ wet ─ reverb (convolver) ─────┘
 *   (ambience: also the animals' calls, placed on the map; sfx: the interface and the roaming explorer)
 *
 * `master` (the Master slider) comes after the compressor, so turning it
 * down makes everything quieter without changing the mix. `out` fades
 * everything while the tab is hidden.
 *
 * Voices are scheduled ahead on the audio clock: `schedule(until)` fills in
 * every note and call up to `until` (live: every 250 ms, ~1 s ahead;
 * offline: once, for the whole render).
 */

/** Slider values 0‥1 (see `MapSettings`). */
export interface Volumes {
  master: number;
  music: number;
  ambience: number;
  water: number;
  sfx: number;
}
export interface Mix {
  /** 0 day … 1 night. */
  night: number;
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
  readonly sum: GainNode;
  /** The Master slider, after the limiter. */
  readonly master: GainNode;
  /** Last: fades everything out when the tab is hidden. */
  readonly out: GainNode;
  readonly musicBus: Bus;
  readonly ambBus: Bus;
  /** Waterfalls and rivers. */
  readonly waterBus: Bus;
  /** Interface sounds and the explorer's own ("Effects"). */
  readonly sfxBus: Bus;
  /** Current time of day (voices read it when they are scheduled). */
  night = 0;
  private readonly ambience: Ambience;
  private readonly music: Music;
  private readonly water: Water;
  private readonly sfx: Sfx;
  private readonly explorer: Explorer;
  private readonly animals: Animals;
  private applied: Mix = { night: -1 };
  private volumes: Volumes = { master: 1, music: 1, ambience: 1, water: 1, sfx: 1 };

  constructor(ctx: BaseAudioContext, opts: { seed?: number } = {}) {
    this.ctx = ctx;
    this.rnd = mulberry32(opts.seed ?? Math.floor(Math.random() * 2 ** 32));

    this.sum = ctx.createGain();
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
    this.master = ctx.createGain();
    this.out = ctx.createGain();
    this.sum.connect(comp).connect(trim).connect(clip).connect(this.master).connect(this.out).connect(ctx.destination);

    const reverbIn = ctx.createGain();
    const conv = ctx.createConvolver();
    conv.buffer = impulse(ctx);
    const ret = ctx.createGain();
    ret.gain.value = REVERB;
    reverbIn.connect(conv).connect(ret).connect(this.sum);

    this.musicBus = new Bus(ctx, this.sum, reverbIn, true);
    this.ambBus = new Bus(ctx, this.sum, reverbIn, true);
    this.waterBus = new Bus(ctx, this.sum, reverbIn, true);
    this.sfxBus = new Bus(ctx, this.sum, reverbIn, false);

    this.ambience = new Ambience(this);
    this.music = new Music(this);
    this.water = new Water(this);
    this.sfx = new Sfx(this);
    this.explorer = new Explorer(this);
    this.animals = new Animals(this);
  }

  setVolumes(v: Volumes, immediate = false): void {
    this.volumes = { ...v };
    const t = this.ctx.currentTime;
    const tc = immediate ? 0 : 0.12;
    const g = clamp01(v.master) ** 2;
    if (tc > 0) this.master.gain.setTargetAtTime(g, t, tc);
    else {
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(g, t);
    }
    this.musicBus.volume(v.music, t, tc);
    this.ambBus.volume(v.ambience, t, tc);
    this.waterBus.volume(v.water, t, tc);
    this.sfxBus.volume(v.sfx, t, tc);
  }

  /** Time of day; small changes are skipped (called every frame). */
  setMix(m: Mix, immediate = false): void {
    const night = clamp01(m.night);
    this.night = night;
    if (!immediate && Math.abs(night - this.applied.night) < 0.01) return;
    this.applied = { night };
    const t = this.ctx.currentTime;
    this.ambience.mix(night, t, immediate ? 0 : 0.5);
    this.music.mix(night, t, immediate ? 0 : 0.8);
  }

  /** Where the waterfalls and rivers are (once, when the land is built). */
  setWorld(field: Pick<HeightField, 'falls' | 'rivers'>): void {
    this.water.setWorld(field.falls, field.rivers);
  }

  /** Where the ears are (every frame; the water voices follow at ~15 Hz, animal calls read them when they come). `immediate`: no glide. */
  listen(ears: Ears, immediate = false): void {
    this.water.listen(ears, immediate);
    this.animals.listen(ears);
  }

  /** Music, ambience and water swell in from silence (effects are never faded). */
  fadeIn(seconds: number): void {
    const t = this.ctx.currentTime;
    this.musicBus.fadeIn(t, seconds);
    this.ambBus.fadeIn(t, seconds);
    this.waterBus.fadeIn(t, seconds);
  }

  /** Quiet everything (tab hidden) or bring it back. */
  hush(on: boolean): void {
    this.out.gain.setTargetAtTime(on ? 0 : 1, this.ctx.currentTime, on ? 0.05 : 0.35);
  }

  /** Schedule every voice up to `until` (audio clock, s). A muted bus schedules nothing. */
  schedule(until: number): void {
    const now = this.ctx.currentTime;
    const v = this.volumes;
    if (v.master <= 0) return;
    if (v.ambience > 0) this.ambience.schedule(now, until);
    if (v.music > 0) this.music.schedule(now, until);
    if (v.water > 0) this.water.schedule(now, until);
  }

  play(s: UISound, when = 0): void {
    this.sfx.play(s, Math.max(when, this.ctx.currentTime));
  }

  flight(seconds: number, when = 0): void {
    this.sfx.flight(seconds, Math.max(when, this.ctx.currentTime));
  }

  /** A sound of the roaming explorer (gain 0‥1). */
  roam(s: RoamSound, gain = 1, when = 0): void {
    if (this.volumes.sfx <= 0 || this.volumes.master <= 0) return;
    this.explorer.play(s, clamp01(gain), Math.max(when, this.ctx.currentTime));
  }

  /** An animal call where the animal is (on the ambience bus: muted, it is not even made). */
  call(c: AnimalCall, when = 0): void {
    if (this.volumes.ambience <= 0 || this.volumes.master <= 0) return;
    this.animals.call(c, Math.max(when, this.ctx.currentTime));
  }

  /** The explorer's lasting sounds: rushing air (falling, gliding) and the boat's wake, 0‥1 each. */
  roamLevels(wind: number, wake: number): void {
    // (muted: the lasting sounds are not even made)
    const on = this.volumes.sfx > 0 && this.volumes.master > 0 ? 1 : 0;
    this.explorer.levels(clamp01(wind) * on, clamp01(wake) * on, this.ctx.currentTime);
  }
}
