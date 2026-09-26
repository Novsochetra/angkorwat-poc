import type { HeightField } from '../heightfield';
import type { EventState } from '../events';
import { VOLUME_KEYS, type AnimalCall, type Duck, type MapWeather, type RoamSound, type TypeKey, type UISound, type VolumeKey } from '../types';
import { Ambience } from './ambience';
import { Animals } from './animals';
import { clamp01, glide, impulse, mulberry32, softClipCurve, type Rng } from './dsp';
import { Explorer, roamBus } from './explorer';
import type { StepSets } from './footsteps';
import type { Strike } from './typewriter';
import { Music } from './music';
import { Sfx } from './sfx';
import { Typing } from './typing';
import { Water, type Ears } from './water';
import { isPeopleCall, PeopleSound } from './people';
import { TempleSound } from './temple';
import { WeatherSound } from './weather';

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
 * ambience.ts; the temples' chant, drum and bells: temple.ts); `water` (falls and rivers: water.ts); `animals` (their
 * calls, placed on the map: animals.ts); `steps` (the explorer's footsteps)
 * and `moves` (his other sounds, the lasting wind, sail and wake too:
 * explorer.ts `roamBus`); `ui` (the interface and the camera's flights:
 * sfx.ts; the bell on entering a place; the story's typing: typing.ts). A
 * new kind of sound picks one.
 *
 * While the story is open every bus but `ui` (`DUCKED`) ducks — steps back
 * to a lower level — and ducks further while its words type in (`duck()`);
 * when it closes, they come back to where their sliders are.
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
/** Buses that duck for the story: all but the interface (the story's own sounds: its typing, its clicks, its camera flights). */
const DUCKED: readonly BusName[] = BUSES.filter((b) => b !== 'ui');
/** The level of every other sound while ducked (`DUCKED` buses), and how fast it goes down and comes back (time constants, s). */
const DUCK: Record<Duck, number> = { none: 1, story: 0.3, typing: 0.2 };
const DUCK_DOWN = 0.25;
const DUCK_UP = 0.9;

export interface Mix {
  /** 0 day … 1 night. */
  night: number;
  /** Leaves over the roaming explorer, 0‥1 (`MapFrame.canopy`): the day's cicadas are louder in the forest. */
  canopy?: number;
}

/** How far the map's music steps back for the pinpeat when it is at its loudest (`yieldMusic`). */
const MUSIC_YIELD = 0.85;
/** Reverb return level. */
const REVERB = 0.5;
/** Level after the compressor (it adds make-up gain; this takes it back). */
const TRIM = 0.62;

/** A mixer channel: `dry` and `wet` (reverb send) inputs under one volume, with a fade-in and a duck. */
export class Bus {
  readonly dry: GainNode;
  readonly wet: GainNode;
  private readonly fades: GainNode[];
  private readonly ducks: GainNode[];

  constructor(ctx: BaseAudioContext, out: AudioNode, reverb: AudioNode, faded: boolean) {
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    const fd = ctx.createGain();
    const fw = ctx.createGain();
    const dd = ctx.createGain();
    const dw = ctx.createGain();
    this.dry.connect(fd).connect(dd).connect(out);
    this.wet.connect(fw).connect(dw).connect(reverb);
    this.fades = [fd, fw];
    this.ducks = [dd, dw];
    if (faded) for (const f of this.fades) f.gain.value = 0;
  }

  /** Step back to `g` (0‥1) or come back up (1), gliding with time constant `tc` (0: jump). */
  duck(g: number, t: number, tc: number): void {
    for (const d of this.ducks) glide(d.gain, g, t, tc);
  }

  /** The duck's gain now (1: not ducked). */
  get duckLevel(): number {
    return this.ducks[0].gain.value;
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
  private readonly typing: Typing;
  private readonly explorer: Explorer;
  private readonly animals: Animals;
  private readonly weatherSound: WeatherSound;
  /** The temples' chant, drum and bells (temple.ts, on the ambience bus; public for checks). */
  readonly temple: TempleSound;
  /** The people's sounds (people.ts: ox bells, the cart, a net's splash, laughter on ambience; the pinpeat on music). */
  private readonly people: PeopleSound;
  private applied: Mix = { night: -1, canopy: -1 };
  /** The background's duck level now (`DUCK`). */
  private ducked = 1;
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
    this.typing = new Typing(this);
    this.explorer = new Explorer(this);
    this.animals = new Animals(this);
    this.weatherSound = new WeatherSound(this);
    this.temple = new TempleSound(this);
    this.people = new PeopleSound(this);
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
    const canopy = clamp01(m.canopy ?? 0);
    this.night = night;
    if (!immediate && Math.abs(night - this.applied.night) < 0.01 && Math.abs(canopy - (this.applied.canopy ?? 0)) < 0.03) return;
    this.applied = { night, canopy };
    const t = this.ctx.currentTime;
    this.ambience.mix(night, t, immediate ? 0 : 0.5, canopy);
    this.music.mix(night, t, immediate ? 0 : 0.8);
  }

  /**
   * The weather (every frame; `weather.ts`, on the ambience bus): rain, wind,
   * thunder after each flash (from where it struck, heard at `ears`), drops
   * on the leaves round him while he walks under them (`leaves`: the leaves
   * over him on foot, `MapFrame.canopy`; 0 in the overview, the balloon,
   * the boat and the glider); the birds and the cicadas keep quiet in rain.
   * `roaming`: he roams (the rain is nearer than over the overview).
   * `t`: the page time (s, `MapFrame.t`).
   */
  weather(w: MapWeather, ears: Ears, roaming: boolean, t: number, leaves = 0): void {
    this.ambience.setRain(w.rain, this.ctx.currentTime);
    this.weatherSound.set(w, ears, roaming, t, leaves);
  }

  /** The event clock (every frame; `events.ts`): the monks' dawn chant, the dusk drum and the bells (temple.ts). `t`: the page time (s). */
  events(ev: Readonly<Pick<EventState, 'on' | 'count' | 'began'>>, t: number): void {
    this.temple.cue(ev, t);
  }

  /** Where the waterfalls and rivers are (once, when the land is built). */
  setWorld(field: Pick<HeightField, 'falls' | 'rivers'>): void {
    this.water.setWorld(field.falls, field.rivers);
  }

  /** Where the ears are (every frame; the water voices follow at ~15 Hz, animal calls read them when they come). `immediate`: no glide. */
  listen(ears: Ears, immediate = false): void {
    this.water.listen(ears, immediate);
    this.animals.listen(ears);
    this.people.listen(ears);
    this.temple.listen(ears, immediate);
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

  /**
   * Schedule every voice up to `until` (audio clock, s). A muted bus
   * schedules nothing, and its lasting loops (the cicadas, the night
   * insects, the rain and wind, the chant) stop once silent (`idle`).
   */
  schedule(until: number): void {
    const now = this.ctx.currentTime;
    const ambience = this.heard('ambience');
    if (ambience) this.ambience.schedule(now, until);
    else this.ambience.idle(now);
    if (this.heard('music')) this.music.schedule(now, until);
    if (this.heard('water')) this.water.schedule(now, until);
    if (ambience) {
      this.weatherSound.schedule(now, until);
      this.temple.schedule(now, until);
    } else {
      this.weatherSound.idle(now);
      this.temple.idle(now);
    }
  }

  /**
   * The map's music steps back for other music near by (the pinpeat by the
   * apsara dancers: people.ts): `near` 0‥1 is how loud that is here; from
   * `t` until `until` (audio clock, s), then it comes back.
   */
  yieldMusic(near: number, t: number, until: number): void {
    this.music.yieldTo(1 - MUSIC_YIELD * clamp01(near), t, until);
  }

  /** An interface sound (on the `ui` bus). */
  play(s: UISound, when = 0): void {
    if (!this.heard('ui')) return;
    this.sfx.play(s, Math.max(when, this.ctx.currentTime));
  }

  /** A key of the story's typing, panned −1‥1 (on the `ui` bus). */
  type(k: TypeKey, pan = 0, when = 0): void {
    if (!this.heard('ui')) return;
    this.typing.play(k, pan, Math.max(when, this.ctx.currentTime));
  }

  /** Every other sound (`DUCKED` buses) steps back for the story, or comes back (`none`); `immediate`: no glide. */
  duck(d: Duck, immediate = false): void {
    const t = this.ctx.currentTime;
    const g = DUCK[d];
    const tc = immediate ? 0 : g < this.ducked ? DUCK_DOWN : DUCK_UP;
    this.ducked = g;
    for (const b of DUCKED) this.bus[b].duck(g, t, tc);
  }

  /** The ducked buses' level now (1: not ducked), for checks. */
  get duckLevel(): number {
    return this.bus.music.duckLevel;
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

  /** The recorded typewriter strikes, once cut (`typewriter.ts`); until then (or `null`) they are synthesized. */
  setTypewriter(strikes: readonly Strike[] | null): void {
    this.typing.strikes = strikes;
  }

  /** Footsteps played so far on each ground: [recorded, synthesized] (for checks). */
  get stepsPlayed(): Explorer['played'] {
    return this.explorer.played;
  }

  /** An animal call where the animal is (on the `animals` bus: muted, it is not even made). */
  call(c: AnimalCall, when = 0): void {
    // (the people's sounds pick their own bus: people.ts)
    if (isPeopleCall(c.kind)) return this.people.call(c, Math.max(when, this.ctx.currentTime));
    if (!this.heard('animals')) return;
    this.animals.call(c, Math.max(when, this.ctx.currentTime));
  }

  /** The explorer's lasting sounds (on the `moves` bus): rushing air (falling, gliding), the boat's wake, the hang glider's sail, the balloon's burner and fan, 0‥1 each. */
  roamLevels(wind: number, wake: number, sail = 0, burner = 0, fan = 0): void {
    // (muted: the lasting sounds are not even made)
    const on = this.heard('moves') ? 1 : 0;
    this.explorer.levels(clamp01(wind) * on, clamp01(wake) * on, this.ctx.currentTime, clamp01(sail) * on, clamp01(burner) * on, clamp01(fan) * on);
  }
}
