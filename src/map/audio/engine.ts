import type { HeightField } from '../heightfield';
import { VOLUME_KEYS, type AnimalCall, type RoamSound, type UISound, type VolumeKey } from '../types';
import { Ambience } from './ambience';
import { Animals } from './animals';
import { clamp01, impulse, mulberry32, softClipCurve, type Rng } from './dsp';
import { Explorer, roamBus } from './explorer';
import type { StepSets } from './footsteps';
import { Music } from './music';
import { Sfx } from './sfx';
import { Water, type Ears } from './water';

/**
 * The sound graph of the map, on any `BaseAudioContext` (live or offline).
 *
 *   music    ─┐              ┌─ dry ─────────────────────────┐
 *   ambience ─┤              │                               │
 *   water    ─┤              │                               │
 *   animals  ─┼─ Bus: volume ┤                               ├─ sum ─ compressor ─ trim ─ soft clip ─ master ─ out ─ speakers
 *   steps    ─┤              │                               │
 *   moves    ─┤              └─ wet ─ reverb (convolver) ────┘
 *   ui       ─┘
 *
 * One bus per volume slider (`MapSettings`, `VOLUME_KEYS`), and every sound
 * on exactly one: `music`; `ambience` (wind, birds, insects, frogs:
 * ambience.ts); `water` (falls and rivers: water.ts); `animals` (their
 * calls, placed on the map: animals.ts); `steps` (the explorer's footsteps)
 * and `moves` (his other sounds, the lasting wind, sail and wake too:
 * explorer.ts `roamBus`); `ui` (the interface and the camera's flights:
 * sfx.ts; the bell on entering a place). A new kind of sound picks one.
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
export type Volumes = Record<VolumeKey, number>;
/** The buses: one per slider but Master. */
export type BusName = Exclude<VolumeKey, 'master'>;
export const BUSES: readonly BusName[] = VOLUME_KEYS.filter((k): k is BusName => k !== 'master');
/** Buses that swell in on start (the lasting background); the explorer's sounds and the interface never wait. */
const FADED: ReadonlySet<BusName> = new Set<BusName>(['music', 'ambience', 'water', 'animals']);

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
  /** One bus per slider (see the top of this file for what plays on each). */
  readonly bus: Readonly<Record<BusName, Bus>>;
  /** Current time of day (voices read it when they are scheduled). */
  night = 0;
  private readonly ambience: Ambience;
  private readonly music: Music;
  private readonly water: Water;
  private readonly sfx: Sfx;
  private readonly explorer: Explorer;
  private readonly animals: Animals;
  private applied: Mix = { night: -1 };
  private volumes = Object.fromEntries(VOLUME_KEYS.map((k) => [k, 1])) as Volumes;

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

    this.bus = Object.fromEntries(BUSES.map((b) => [b, new Bus(ctx, this.sum, reverbIn, FADED.has(b))])) as Record<BusName, Bus>;

    this.ambience = new Ambience(this);
    this.music = new Music(this);
    this.water = new Water(this);
    this.sfx = new Sfx(this);
    this.explorer = new Explorer(this);
    this.animals = new Animals(this);
  }

  /** Every slider; a moved one glides there (no clicks), `immediate` jumps. */
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
    for (const b of BUSES) this.bus[b].volume(v[b], t, tc);
  }

  /** A bus is heard: its slider and Master both up (a muted bus's sounds are not even made). */
  heard(b: BusName): boolean {
    return this.volumes.master > 0 && this.volumes[b] > 0;
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

  /** Music, ambience, water and the animals swell in from silence (the explorer and the interface are never faded). */
  fadeIn(seconds: number): void {
    const t = this.ctx.currentTime;
    for (const b of FADED) this.bus[b].fadeIn(t, seconds);
  }

  /** Quiet everything (tab hidden) or bring it back. */
  hush(on: boolean): void {
    this.out.gain.setTargetAtTime(on ? 0 : 1, this.ctx.currentTime, on ? 0.05 : 0.35);
  }

  /** Schedule every voice up to `until` (audio clock, s). A muted bus schedules nothing. */
  schedule(until: number): void {
    const now = this.ctx.currentTime;
    if (this.heard('ambience')) this.ambience.schedule(now, until);
    if (this.heard('music')) this.music.schedule(now, until);
    if (this.heard('water')) this.water.schedule(now, until);
  }

  /** An interface sound (on the `ui` bus). */
  play(s: UISound, when = 0): void {
    if (!this.heard('ui')) return;
    this.sfx.play(s, Math.max(when, this.ctx.currentTime));
  }

  /** A camera flight of `seconds` begins (on the `ui` bus). */
  flight(seconds: number, when = 0): void {
    if (!this.heard('ui')) return;
    this.sfx.flight(seconds, Math.max(when, this.ctx.currentTime));
  }

  /** A sound of the roaming explorer (gain 0‥1), on its bus: the steps, his moves, or the interface (`roamBus`). */
  roam(s: RoamSound, gain = 1, when = 0): void {
    if (!this.heard(roamBus(s))) return;
    this.explorer.play(s, clamp01(gain), Math.max(when, this.ctx.currentTime));
  }

  /** The recorded footsteps, once loaded (`footsteps.ts`); until then (or `null`) the steps are synthesized. */
  setFootsteps(steps: StepSets | null): void {
    this.explorer.steps = steps;
  }

  /** Footsteps played so far on each ground: [recorded, synthesized] (for checks). */
  get stepsPlayed(): Explorer['played'] {
    return this.explorer.played;
  }

  /** An animal call where the animal is (on the `animals` bus: muted, it is not even made). */
  call(c: AnimalCall, when = 0): void {
    if (!this.heard('animals')) return;
    this.animals.call(c, Math.max(when, this.ctx.currentTime));
  }

  /** The explorer's lasting sounds (on the `moves` bus): rushing air (falling, gliding), the boat's wake, the hang glider's sail, 0‥1 each. */
  roamLevels(wind: number, wake: number, sail = 0): void {
    // (muted: the lasting sounds are not even made)
    const on = this.heard('moves') ? 1 : 0;
    this.explorer.levels(clamp01(wind) * on, clamp01(wake) * on, this.ctx.currentTime, clamp01(sail) * on);
  }
}
