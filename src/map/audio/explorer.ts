import type { RoamSound } from '../types';
import { biquad, glide, mtof, noise, range, source, strike, type NoiseKind, type Rng } from './dsp';
import type { Bus, BusName, SoundEngine } from './engine';
import type { StepSet, StepSets } from './footsteps';

/**
 * The roaming explorer's sounds: footsteps, the jump and the landing, the
 * parachute snapping open and folding away, splashes, the paddle, stepping
 * into and out of the boat, and a soft temple bell on entering a place, the
 * hang glider unfolding and put away; fishing from the boat (the cast's
 * swish and the line running out, the reel's clicking, a bite on the
 * float, a fish landed flapping, one let go); his sampeah (a soft rustle of
 * his sleeves and his palms meeting); footsteps in snow (the Weather
 * setting's dream); buying at a stall (riel notes counted out, a small
 * chime), a sip through a straw, a bite chewed, a satisfied "ahh" after a
 * drink. Lasting: rushing air while falling or
 * gliding, the water along the boat's hull, the hang glider's sail
 * thrumming in the airflow, and the hot air balloon's burner roaring (a
 * low thump as it lights).
 *
 * Each has its slider (`roamBus`): the footsteps are on the `steps` bus,
 * everything else on `moves`, but the bell, which rings with the "begin"
 * gong of the interface, on `ui`.
 *
 * The footsteps are recordings (`assets/sound/`, cut into single steps by
 * `footsteps.ts`): one step per footfall from the ground's recording, never
 * the same one twice in a row. Until they are loaded (or if they fail) the
 * steps are synthesized (`footstep`). Everything else is made with the Web
 * Audio API.
 *
 * Roaming puts the ears at the explorer's head, so his sounds sit in the
 * middle, a little to either side. Every one varies a little each time.
 */

/** Ground under a footstep (RoamSound `step*`). */
type Ground = 'earth' | 'grass' | 'stone' | 'sand' | 'water' | 'wood' | 'snow';
const GROUND: Partial<Record<RoamSound, Ground>> = { step: 'earth', stepGrass: 'grass', stepStone: 'stone', stepSand: 'sand', stepWater: 'water', stepWood: 'wood', stepSnow: 'snow' };

/** The bus (slider) a sound of the explorer plays on: his steps, the bell on entering a place (with the interface's gong), or his moves (anything else). */
export function roamBus(s: RoamSound): BusName {
  return GROUND[s] ? 'steps' : s === 'enter' || s === 'gold' ? 'ui' : 'moves';
}

/** Each ground's level, so every synthesized step sounds about as loud (stone's tap is short and sand's thud soft: they need more; the water's long slosh less). */
const GROUND_GAIN: Record<Ground, number> = { earth: 1.11, grass: 1, stone: 1.44, sand: 1.07, water: 0.36, wood: 1.27, snow: 0.6 };

/**
 * One recorded step in a footfall: a step from `set` (`same`: the one the
 * layer before picked), at `level`, played at `rate`, through a lowpass
 * `lp` / highpass `hp` (Hz).
 */
interface Layer {
  set: StepSet;
  level: number;
  same?: boolean;
  rate?: number;
  lp?: number;
  hp?: number;
}
/**
 * The recordings on each ground (the layers of a footfall start together);
 * `level` evens the grounds out (walking, each is as loud to within
 * 0.5 dB), `wet` is the reverb send, `run` the longest step when running
 * (s), `attack` a slower start (s: the snow packing down under the sole).
 */
const RECORDED: Record<Ground, { layers: readonly Layer[]; level: number; wet: number; run: number; attack?: number }> = {
  // Dry grass crunching (its hiss taken off) over a soft low thump of the body's weight (the boots on concrete, only their lows).
  grass: { level: 1, wet: 0.04, run: 0.26, layers: [{ set: 'grass', level: 1, lp: 6500 }, { set: 'concrete', level: 0.42, lp: 450, rate: 0.88 }] },
  // Packed earth: the boots on concrete softened (dull, a little deeper), a trace of grit from the grass.
  earth: { level: 0.955, wet: 0.05, run: 0.26, layers: [{ set: 'concrete', level: 1, lp: 1200, rate: 0.92 }, { set: 'grass', level: 0.38, lp: 3500 }] },
  // Sandstone: the road, temple floors, bare rock.
  stone: { level: 1.07, wet: 0.1, run: 0.26, layers: [{ set: 'concrete', level: 1 }] },
  // River banks: the grass crunch hushed and slower (grains), the foot sinking in with a muffled thump.
  sand: { level: 1.9, wet: 0.03, run: 0.28, layers: [{ set: 'grass', level: 0.9, lp: 2200, rate: 0.9 }, { set: 'concrete', level: 0.32, lp: 350, rate: 0.85 }] },
  // Wading: the slosh, and the same slosh deeper under it (the water the leg pushes).
  water: { level: 0.87, wet: 0.08, run: 0.32, layers: [{ set: 'water', level: 1 }, { set: 'water', same: true, level: 0.5, rate: 0.6, lp: 800 }] },
  // Planks: the take-off ramp, stepping off the boat (no boom under 70 Hz: an open deck, not a hollow floor).
  wood: { level: 1.02, wet: 0.07, run: 0.26, layers: [{ set: 'wood', level: 1, hp: 70 }] },
  // Snow: the grass crunch slowed (the sole packing the snow down, grain by grain), its crisp top a little quicker
  // over it, the body's weight muffled under it; a hushed place, little echo.
  snow: {
    level: 1.05,
    wet: 0.02,
    run: 0.3,
    attack: 0.05,
    layers: [
      { set: 'grass', level: 1, rate: 0.76, lp: 4200, hp: 300 },
      { set: 'grass', same: true, level: 0.3, rate: 1.12, lp: 7500, hp: 1800 },
      { set: 'concrete', level: 0.25, lp: 300, rate: 0.85 },
    ],
  },
};

/** Peak levels (before the volume of their bus). */
const LEVEL = {
  // Walking, the steps sit some 4.5 dB under the music and the day's ambience together (6 under the night's), running
  // 3–4 dB louder (at the default Steps slider; K-weighted, measured offline): heard, never over the rest, and too
  // soft to make the compressor duck the rest. The synthesized steps are as loud as the recorded ones.
  step: 3.6,
  /** The recorded steps (each levelled to a loudest weighted 100 ms of −20 dBFS: `footsteps.ts`). */
  recorded: 2.7,
  jump: 1,
  land: 1.2,
  chute: 1.6,
  splash: 1.1,
  paddle: 1,
  knock: 0.45,
  bell: 0.15,
  /** Fishing (from the boat) and his sampeah. */
  cast: 0.8,
  reel: 0.18,
  bite: 0.3,
  fish: 0.9,
  greet: 0.35,
  /** Buying (roam/_shop.ts): paying, a sip, a bite chewed. */
  coin: 0.5,
  sip: 0.4,
  munch: 0.55,
  ahh: 0.5,
  wind: 0.85,
  wake: 0.24,
  sail: 0.3,
  burner: 0.5,
  fan: 0.22,
};
/** Steps closer together than this are one step (s). */
const STEP_GAP = 0.09;
/** A step's level grows with its gain `g` as `g` ** EFFORT (running also packs the steps closer: that alone adds some 2.5 dB). */
const EFFORT = 0.3;
/** How much a footfall of gain `g` is a run (0 walking … 1 running): the walker's steps come at ~0.7 walking, 1 running. */
const running = (g: number): number => Math.min(1, Math.max(0, (g - 0.8) / 0.2));
/** A lasting sound silent this long stops its sources (s). */
const IDLE = 4;

interface Burst {
  kind?: NoiseKind;
  /** Another source buffer instead of noise (e.g. the crunch of grit). */
  buf?: AudioBuffer;
  type: BiquadFilterType;
  /** Filter frequency, sliding from `f0` to `f1` over `dur`. */
  f0: number;
  f1?: number;
  q?: number;
  attack: number;
  /** Decay time constant after the attack (s). */
  tau: number;
  /** Length of the slide (default: the whole sound). */
  dur?: number;
  /** A highpass after the filter (Hz): thins out what lies under the band. */
  hp?: number;
  level: number;
  pan?: number;
  wet?: number;
}

interface Tone {
  f0: number;
  f1?: number;
  /** Time of the pitch slide (s). */
  glide?: number;
  attack: number;
  tau: number;
  level: number;
  type?: OscillatorType;
  pan?: number;
  wet?: number;
}

/** A lasting sound: nodes made when first wanted, sources stopped when silent a while. */
interface Lasting {
  env: GainNode;
  tone: BiquadFilterNode;
  low: GainNode;
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  level: number;
  quietSince: number;
}

export class Explorer {
  private readonly e: SoundEngine;
  private readonly ctx: BaseAudioContext;
  private readonly rnd: Rng;
  /** The recorded steps, once loaded (`footsteps.ts`); until then the steps are synthesized. */
  steps: StepSets | null = null;
  /** Footsteps played so far on each ground: [recorded, synthesized] (for checks: `audio.debug()`). */
  readonly played: Record<Ground, [number, number]> = { earth: [0, 0], grass: [0, 0], stone: [0, 0], sand: [0, 0], water: [0, 0], wood: [0, 0], snow: [0, 0] };
  /** The bus the sound being made goes to (`roamBus`; the lasting sounds are on `moves`). */
  private to: Bus;
  private lastStep = -1;
  /** The step last played from each recording (never the same twice in a row). */
  private readonly lastPick: Partial<Record<StepSet, number>> = {};
  /** Which foot / which side of the boat (±1). */
  private foot = 1;
  private stroke = 1;
  private wind: Lasting | null = null;
  private wake: Lasting | null = null;
  private sail: Lasting | null = null;
  private burner: Lasting | null = null;
  private fan: Lasting | null = null;
  /** The burner's level last frame (it lights with a thump). */
  private burnerWas = 0;

  constructor(e: SoundEngine) {
    this.e = e;
    this.ctx = e.ctx;
    this.rnd = e.rnd;
    this.to = e.bus.moves;
  }

  /** One sound at `t`, `g` 0‥1, on its bus (a sound made inside another, the step off the boat, on its own). */
  play(s: RoamSound, g: number, t: number): void {
    const was = this.to;
    this.to = this.e.bus[roamBus(s)];
    try {
      this.make(s, g, t);
    } finally {
      this.to = was;
    }
  }

  private make(s: RoamSound, g: number, t: number): void {
    const r = this.rnd;
    const ground = GROUND[s];
    if (ground) {
      if (t - this.lastStep < STEP_GAP) return;
      this.lastStep = t;
      const recorded = this.recorded(t, g, ground);
      if (!recorded) this.footstep(t, g, ground);
      this.played[ground][recorded ? 0 : 1]++;
      return;
    }
    switch (s) {
      case 'gliderOpen':
        // The folded sail shakes out and snaps taut on its frame: a rustle, two cracks, a hollow tick of the tubes.
        this.flutter(t, 1100, 700, 20, 12, 0.45, LEVEL.chute * 0.55);
        this.burst(t + 0.28, { kind: 'white', type: 'bandpass', f0: 1900, q: 1.2, attack: 0.001, tau: 0.02, level: LEVEL.chute * 0.45, pan: -0.1, wet: 0.1 });
        this.burst(t + 0.34, { kind: 'white', type: 'bandpass', f0: 2500, q: 1.4, attack: 0.001, tau: 0.014, level: LEVEL.chute * 0.3, pan: 0.12, wet: 0.1 });
        this.knock(t + 0.3, range(r, 520, 580), LEVEL.knock * 0.35, 0);
        return;
      case 'gliderStow':
        // Laid down: the sail sighs and folds, the tubes click together.
        this.flutter(t, 700, 420, 10, 4, 0.7, LEVEL.chute * 0.5);
        this.knock(t + 0.45, range(r, 480, 540), LEVEL.knock * 0.3, 0.05);
        this.knock(t + 0.62, range(r, 600, 660), LEVEL.knock * 0.2, -0.05);
        return;
      case 'jump':
        // Push-off, then air past the body as it rises.
        this.burst(t, { kind: 'pink', type: 'bandpass', f0: 1100, f1: 700, q: 0.8, attack: 0.003, tau: 0.04, level: LEVEL.jump * g, wet: 0.05 });
        this.burst(t + 0.02, { kind: 'pink', type: 'bandpass', f0: 380, f1: 1200, q: 1.1, attack: 0.09, tau: 0.09, dur: 0.3, level: LEVEL.jump * 0.6 * g, pan: range(r, -0.1, 0.1), wet: 0.1 });
        return;
      case 'land': {
        // A thud as heavy as the fall: the body's weight, the feet, grit thrown about.
        const s = 0.35 + 0.65 * g;
        this.tone(t, { f0: 90, f1: 48, glide: 0.1, attack: 0.003, tau: 0.035 + 0.035 * g, level: LEVEL.land * 0.3 * s, wet: 0.06 });
        this.burst(t, { kind: 'pink', type: 'lowpass', f0: 1400, f1: 300, q: 0.6, attack: 0.002, tau: 0.04 + 0.06 * g, dur: 0.2, level: LEVEL.land * 1.6 * s, wet: 0.05 });
        this.burst(t + 0.01, { kind: 'pink', type: 'bandpass', f0: 1000, f1: 600, q: 0.8, attack: 0.004, tau: 0.06, level: LEVEL.land * 2 * s });
        if (g > 0.35) this.grit(t + 0.02, 3 + Math.floor(6 * g), 0.25, LEVEL.land * 0.4 * s, 0);
        return;
      }
      case 'chuteOpen':
        // The canopy catches the air with a deep "whump"…
        this.burst(t, { kind: 'pink', type: 'bandpass', f0: 520, f1: 300, q: 0.8, attack: 0.012, tau: 0.09, level: LEVEL.chute * 1.6, wet: 0.12 });
        this.tone(t + 0.01, { f0: 95, f1: 58, glide: 0.1, attack: 0.006, tau: 0.08, level: LEVEL.chute * 0.12, wet: 0.05 });
        // …snaps taut: two cracks of cloth…
        this.burst(t + 0.045, { kind: 'white', type: 'bandpass', f0: 1700, q: 1.3, attack: 0.001, tau: 0.018, level: LEVEL.chute * 0.5, pan: -0.12, wet: 0.1 });
        this.burst(t + 0.085, { kind: 'white', type: 'bandpass', f0: 2300, q: 1.5, attack: 0.001, tau: 0.012, level: LEVEL.chute * 0.3, pan: 0.15, wet: 0.1 });
        // …and flutters as it settles.
        this.flutter(t + 0.07, 800, 600, 16, 9, 0.8, LEVEL.chute * 0.8);
        return;
      case 'chuteClose':
        // The canopy spills its air and folds down, flapping slower and slower.
        this.flutter(t, 650, 380, 11, 4, 0.9, LEVEL.chute * 0.85);
        this.burst(t + 0.55, { kind: 'pink', type: 'lowpass', f0: 700, q: 0.5, attack: 0.03, tau: 0.12, level: LEVEL.chute * 0.4, wet: 0.08 });
        return;
      case 'splash': {
        const s = 0.3 + 0.7 * g;
        // The hit (duller as the water closes), a low "bloop", spray falling back, bubbles.
        this.burst(t, { kind: 'white', type: 'lowpass', f0: 5000, f1: 700, q: 0.7, attack: 0.003, tau: 0.13, dur: 0.35, level: LEVEL.splash * s, wet: 0.15 });
        this.tone(t + 0.01, { f0: 240, f1: 95, glide: 0.1, attack: 0.004, tau: 0.05, level: LEVEL.splash * 0.15 * s, wet: 0.05 });
        this.burst(t + 0.06, { kind: 'white', type: 'highpass', f0: 2500, q: 0.6, attack: 0.05, tau: 0.18, level: LEVEL.splash * 0.3 * s, pan: range(r, -0.2, 0.2), wet: 0.2 });
        this.drops(t + 0.08, 4 + Math.floor(8 * g), 0.9, LEVEL.splash * 0.08 * s, 0);
        return;
      }
      case 'paddle': {
        // One stroke, on alternate sides: the blade goes in with a soft "chunk"
        // and a bubble, pulls with a long swish, and drips as it comes out.
        const s = 0.4 + 0.6 * g;
        const pan = (this.stroke = -this.stroke) * range(r, 0.25, 0.4);
        this.burst(t, { kind: 'pink', type: 'bandpass', f0: 1000, f1: 650, q: 1, attack: 0.012, tau: 0.06, level: LEVEL.paddle * s, pan, wet: 0.1 });
        this.tone(t + 0.008, { f0: 220, f1: 380, glide: 0.06, attack: 0.004, tau: 0.03, level: LEVEL.paddle * 0.1 * s, pan, wet: 0.05 });
        this.burst(t + 0.05, { kind: 'pink', type: 'bandpass', f0: 520, f1: 330, q: 0.9, attack: 0.12, tau: 0.12, dur: 0.4, level: LEVEL.paddle * 0.45 * s, pan, wet: 0.1 });
        this.drops(t + range(r, 0.35, 0.5), 2 + Math.floor(r() * 3), 0.6, LEVEL.paddle * 0.05 * s, pan);
        return;
      }
      case 'boatIn':
        // A foot on the hollow hull, the other one after, the boat rocking in the water.
        this.knock(t, range(r, 150, 175), LEVEL.knock * (0.6 + 0.4 * g), -0.08);
        this.knock(t + range(r, 0.09, 0.13), range(r, 190, 220), LEVEL.knock * 0.5, 0.1);
        this.play('splash', 0.2, t + 0.04);
        this.slosh(t + 0.1, 0.6);
        return;
      case 'boatOut':
        this.knock(t, range(r, 180, 210), LEVEL.knock * 0.7 * (0.6 + 0.4 * g), 0.08);
        this.slosh(t + 0.05, 0.4);
        this.lastStep = -1;
        this.play('stepWood', 1, t + 0.18);
        return;
      case 'enter':
        // A small bronze temple bell, struck twice (it rings over the gong of "begin").
        this.bell(t, mtof(81), LEVEL.bell * (0.5 + 0.5 * g), -0.15);
        this.bell(t + 0.32, mtof(86), LEVEL.bell * 0.8 * (0.5 + 0.5 * g), 0.15);
        return;
      case 'gold':
        // A golden figure into his bag (treasure/): a small rising run of glassy chimes, a high one to end.
        [88, 91, 93, 100].forEach((m, i) => this.chime(t + i * 0.085 + (i === 3 ? 0.08 : 0), mtof(m), LEVEL.bell * (i === 3 ? 0.55 : 0.8) * (0.5 + 0.5 * g), -0.2 + i * 0.13));
        return;
      case 'cast': {
        // The rod whips through the air (a swish, the tip's thin whistle) and the line runs off the reel while the float
        // flies (its plop as it lands is the fishing's own: roam/_fishing.ts).
        const k = 0.5 + 0.5 * g;
        this.burst(t, { kind: 'pink', type: 'bandpass', f0: 450, f1: 2200, q: 1.6, attack: 0.09, tau: 0.05, dur: 0.14, level: LEVEL.cast * 1.1 * k, pan: range(r, 0.15, 0.3), wet: 0.06 });
        this.tone(t + 0.05, { f0: 1700, f1: 2900, glide: 0.1, attack: 0.03, tau: 0.03, level: LEVEL.cast * 0.02 * k, pan: 0.2, wet: 0.05 });
        this.ratchet(t + 0.12, range(r, 0.6, 0.85), 70, 18, 3800, LEVEL.cast * 0.11 * k, 0.1, 'line');
        return;
      }
      case 'reel':
        // The reel wound in: its pawl clicking over the gear, quicker as the handle turns, a little burst.
        this.ratchet(t, range(r, 0.5, 0.9), range(r, 14, 18), range(r, 22, 30), range(r, 2700, 3400), LEVEL.reel * (0.6 + 0.4 * g), 0.18, 'pawl');
        return;
      case 'bite': {
        // A bite: the float bobs — a tiny plip, another, and the ring spreading (a soft low dip of the float).
        this.drops(t, 1, 0.01, LEVEL.bite * 0.5, 0);
        this.drops(t + range(r, 0.09, 0.16), 1, 0.01, LEVEL.bite * 0.35, 0);
        this.tone(t + 0.02, { f0: 320, f1: 190, glide: 0.06, attack: 0.004, tau: 0.03, level: LEVEL.bite * 0.12 * (0.6 + 0.4 * g), wet: 0.2 });
        return;
      }
      case 'catch': {
        // A fish pulled out: it breaks the surface (a splash, spray), then flaps and flops, water dripping off it.
        const k = 0.5 + 0.5 * g;
        this.burst(t, { kind: 'white', type: 'lowpass', f0: 4200, f1: 900, q: 0.7, attack: 0.003, tau: 0.07, dur: 0.2, level: LEVEL.fish * 0.8 * k, wet: 0.12 });
        this.burst(t + 0.03, { kind: 'white', type: 'highpass', f0: 2800, q: 0.6, attack: 0.03, tau: 0.12, level: LEVEL.fish * 0.2 * k, pan: range(r, -0.2, 0.2), wet: 0.15 });
        let s = t + range(r, 0.25, 0.35);
        for (let i = 0, n = 4 + Math.floor(r() * 4); i < n; i++) {
          const h = (1 - (0.5 * i) / n) * range(r, 0.7, 1) * k;
          this.burst(s, { kind: 'white', type: 'bandpass', f0: range(r, 900, 1600), q: 1.2, attack: 0.0015, tau: 0.018, level: LEVEL.fish * 0.55 * h, pan: range(r, -0.15, 0.15), wet: 0.06 });
          this.tone(s, { f0: range(r, 150, 190), f1: 90, glide: 0.03, attack: 0.002, tau: 0.02, level: LEVEL.fish * 0.12 * h, wet: 0.04 });
          s += r() < 0.3 ? range(r, 0.06, 0.09) : range(r, 0.1, 0.18);
        }
        this.drops(t + 0.2, 5, 1.2, LEVEL.fish * 0.03 * k, 0);
        return;
      }
      case 'release': {
        // Let go: it slips back in with a soft "shloop" and a bubble, a drip or two.
        const k = 0.5 + 0.5 * g;
        this.burst(t, { kind: 'pink', type: 'lowpass', f0: 2400, f1: 500, q: 0.8, attack: 0.012, tau: 0.08, dur: 0.25, level: LEVEL.fish * 0.55 * k, wet: 0.12 });
        this.tone(t + 0.03, { f0: 260, f1: 120, glide: 0.08, attack: 0.005, tau: 0.04, level: LEVEL.fish * 0.1 * k, wet: 0.08 });
        this.drops(t + 0.12, 3, 0.5, LEVEL.fish * 0.025 * k, 0);
        return;
      }
      case 'greet':
        // His sampeah: the sleeves rustle as his hands come up, and his palms meet with a soft pat; subtle.
        this.burst(t, { kind: 'pink', type: 'bandpass', f0: 2200, f1: 3600, q: 0.9, attack: 0.09, tau: 0.08, dur: 0.25, level: LEVEL.greet * 0.8 * (0.6 + 0.4 * g), pan: -0.08, wet: 0.03 });
        this.burst(t + 0.05, { kind: 'pink', type: 'bandpass', f0: 1800, f1: 3000, q: 0.9, attack: 0.08, tau: 0.07, dur: 0.22, level: LEVEL.greet * 0.6 * (0.6 + 0.4 * g), pan: 0.08, wet: 0.03 });
        this.burst(t + range(r, 0.26, 0.32), { kind: 'pink', type: 'lowpass', f0: 900, q: 0.7, attack: 0.001, tau: 0.012, level: LEVEL.greet * 0.9 * (0.6 + 0.4 * g), wet: 0.04 });
        return;
      case 'coin': {
        // Paying at a stall (roam/_shop.ts): riel notes counted out of the purse — two or three crisp flicks of paper over
        // a soft slide — and a small warm two-note chime as the seller takes them.
        const k = 0.5 + 0.5 * g;
        this.burst(t, { kind: 'pink', type: 'bandpass', f0: 1900, f1: 3200, q: 1.1, attack: 0.03, tau: 0.05, dur: 0.16, level: LEVEL.coin * 1.1 * k, pan: 0.1, wet: 0.03 });
        let s = t + range(r, 0.05, 0.08);
        for (let i = 0, n = 2 + Math.floor(r() * 2); i < n; i++) {
          this.burst(s, { kind: 'white', type: 'bandpass', f0: range(r, 3000, 4600), q: 1.1, attack: 0.002, tau: range(r, 0.016, 0.026), level: LEVEL.coin * (1.9 - 0.3 * i) * k, pan: range(r, -0.05, 0.2), wet: 0.04 });
          s += range(r, 0.07, 0.11);
        }
        this.chime(s + 0.06, mtof(84), LEVEL.coin * 0.08 * k, -0.1);
        this.chime(s + 0.16, mtof(91), LEVEL.coin * 0.06 * k, 0.1);
        return;
      }
      case 'sip': {
        // A sip through a straw: the drink bubbling up it in quick little gurgles, then a soft swallow.
        const k = 0.5 + 0.5 * g;
        const n = 4 + Math.floor(r() * 3);
        let s = t;
        for (let i = 0; i < n; i++) {
          const f = range(r, 520, 880) * (1 + 0.06 * i);
          this.burst(s, { kind: 'pink', type: 'bandpass', f0: f, f1: f * 1.35, q: 3, attack: 0.004, tau: range(r, 0.016, 0.026), dur: 0.04, level: LEVEL.sip * range(r, 1.6, 2.6) * k, pan: range(r, -0.05, 0.05), wet: 0.03 });
          s += range(r, 0.035, 0.06);
        }
        this.tone(s + range(r, 0.12, 0.2), { f0: 190, f1: 115, glide: 0.05, attack: 0.006, tau: 0.03, level: LEVEL.sip * 0.12 * k, wet: 0.02 });
        return;
      }
      case 'ahh': {
        // After a drink: a soft, satisfied breath out, "ahh" (breath through an open vowel, falling away).
        const k = 0.5 + 0.5 * g;
        this.burst(t, { kind: 'pink', type: 'bandpass', f0: 820, f1: 620, q: 2.2, attack: 0.07, tau: 0.16, dur: 0.45, level: LEVEL.ahh * k, wet: 0.04 });
        this.burst(t + 0.01, { kind: 'pink', type: 'bandpass', f0: 1350, f1: 1150, q: 3, attack: 0.07, tau: 0.14, dur: 0.4, level: LEVEL.ahh * 0.45 * k, wet: 0.04 });
        this.burst(t, { kind: 'pink', type: 'bandpass', f0: 3000, q: 0.8, attack: 0.06, tau: 0.12, level: LEVEL.ahh * 0.1 * k, wet: 0.03 });
        return;
      }
      case 'munch': {
        // A bite chewed: two or three soft, muffled crunches, each a little quieter.
        const k = 0.5 + 0.5 * g;
        let s = t;
        for (let i = 0, n = 2 + Math.floor(r() * 2); i < n; i++) {
          const h = (1 - 0.25 * i) * k;
          this.burst(s, { kind: 'pink', type: 'lowpass', f0: range(r, 1300, 1800), f1: 700, q: 0.8, attack: 0.012, tau: range(r, 0.04, 0.06), dur: 0.12, level: LEVEL.munch * h, pan: range(r, -0.04, 0.04), wet: 0.02 });
          this.burst(s + 0.005, { buf: source('crunch'), type: 'bandpass', f0: range(r, 1800, 2600), q: 0.9, attack: 0.006, tau: 0.03, level: LEVEL.munch * 0.35 * h, wet: 0.02 });
          s += range(r, 0.2, 0.26);
        }
        return;
      }
    }
  }

  /** Rushing air (falling, gliding), the water along the boat, the glider's sail, the balloon's burner and its inflation fan, 0‥1 each; called every frame. */
  levels(wind: number, wake: number, t: number, sail = 0, burner = 0, fan = 0): void {
    this.fan = this.lasting(this.fan, fan, t, () => this.makeFan(), (l, v) => {
      // The engine winds up: louder, its hum and the air higher.
      glide(l.env.gain, LEVEL.fan * v ** 0.7, t, 0.4);
      glide(l.tone.frequency, 380 + 420 * v, t, 0.5);
      glide(l.low.gain, 0.5 + 0.5 * v, t, 0.5);
    });
    // The burner lights: a soft low "whump" as the flame catches.
    if (burner > 0.15 && this.burnerWas <= 0.15) {
      this.burst(t, { kind: 'brown', type: 'lowpass', f0: 700, f1: 180, q: 0.7, attack: 0.012, tau: 0.09, dur: 0.25, level: LEVEL.burner * 1.6, wet: 0.08 });
      this.tone(t + 0.005, { f0: 80, f1: 52, glide: 0.12, attack: 0.008, tau: 0.08, level: LEVEL.burner * 0.18, wet: 0.04 });
    }
    this.burnerWas = burner;
    this.burner = this.lasting(this.burner, burner, t, () => this.makeBurner(), (l, v) => {
      // Quick to roar, a little slower to die away; fuller and brighter the harder it burns.
      glide(l.env.gain, LEVEL.burner * v ** 0.8, t, v > 0.5 ? 0.05 : 0.12);
      glide(l.tone.frequency, 900 + 900 * v, t, 0.1);
      glide(l.low.gain, 0.6 + 0.4 * v, t, 0.1);
    });
    this.sail = this.lasting(this.sail, sail, t, () => this.makeSail(), (l, v) => {
      // Faster: louder, the sail's hum higher, its trailing edge flapping quicker.
      glide(l.env.gain, LEVEL.sail * v ** 1.3, t, 0.2);
      glide(l.tone.frequency, 180 + 160 * v, t, 0.3);
      glide(l.low.gain, 0.3 + 0.7 * v, t, 0.3);
    });
    this.wind = this.lasting(this.wind, wind, t, () => this.makeWind(), (l, v) => {
      // More air, higher and brighter.
      glide(l.env.gain, LEVEL.wind * v ** 1.2, t, 0.12);
      glide(l.tone.frequency, 300 + 1300 * v, t, 0.2);
      glide(l.low.gain, 0.5 + 0.5 * v, t, 0.2);
    });
    this.wake = this.lasting(this.wake, wake, t, () => this.makeWake(), (l, v) => {
      glide(l.env.gain, LEVEL.wake * v ** 0.7, t, 0.15);
      glide(l.tone.frequency, 800 + 900 * v, t, 0.2);
      glide(l.low.gain, 0.4 + 0.6 * v, t, 0.2);
    });
  }

  /**
   * One recorded footfall on `ground` (false: the recordings are not there,
   * synthesize it). `g` 0‥1 from a slow walk to a full run: running is
   * louder, a little quicker and brighter, each step cut shorter (its tail
   * faded) so the quick steps never pile up. Every step varies in speed
   * (±5 %) and level (±15 %) and sits a little to the side of its foot.
   */
  private recorded(t: number, g: number, ground: Ground): boolean {
    const sets = this.steps;
    const kind = RECORDED[ground];
    if (!sets || kind.layers.some((l) => !sets[l.set].length)) return false;
    const ctx = this.ctx;
    const r = this.rnd;
    const run = running(g);
    const pan = (this.foot = -this.foot) * range(r, 0.04, 0.12);
    const level = LEVEL.recorded * kind.level * g ** EFFORT * range(r, 0.85, 1.15);
    const env = this.gain(level);
    if (kind.attack) {
      env.gain.setValueAtTime(level * 0.3, t);
      env.gain.linearRampToValueAtTime(level, t + kind.attack);
    }
    const nodes: AudioNode[] = [env, ...this.out(env, pan, kind.wet)];
    // (one foot: the layers share the speed)
    const speed = range(r, 0.95, 1.05) * (0.98 + 0.05 * run);
    const longest = run > 0 ? kind.run + (0.45 - kind.run) * (1 - run) : Infinity;
    let end = 0;
    const sources: AudioBufferSourceNode[] = [];
    let buf: AudioBuffer | null = null;
    for (const l of kind.layers) {
      buf = l.same && buf ? buf : this.pickStep(sets[l.set], l.set);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const rate = (l.rate ?? 1) * speed;
      src.playbackRate.value = rate;
      let last: AudioNode = src;
      // (running: the lowpassed layers open up a little)
      if (l.lp) nodes.push((last = last.connect(biquad(ctx, 'lowpass', l.lp * (1 + 0.25 * run), 0.6))));
      if (l.hp) nodes.push((last = last.connect(biquad(ctx, 'highpass', l.hp, 0.7))));
      const lg = this.gain(l.level);
      last.connect(lg).connect(env);
      nodes.push(src, lg);
      const dur = Math.min(buf.duration / rate, longest);
      src.start(t);
      src.stop(t + dur);
      end = Math.max(end, dur);
      sources.push(src);
    }
    if (end >= longest) {
      // Cut short: the tail fades out over the last 50 ms.
      env.gain.setValueAtTime(level, t + longest - 0.05);
      env.gain.linearRampToValueAtTime(0, t + longest);
    }
    let left = sources.length;
    for (const src of sources)
      src.onended = () => {
        if (--left === 0) for (const n of nodes) n.disconnect();
      };
    return true;
  }

  /** A step from `list` (of recording `set`), not the one it gave last time. */
  private pickStep(list: readonly AudioBuffer[], set: StepSet): AudioBuffer {
    const n = list.length;
    let i = Math.floor(this.rnd() * n);
    const last = this.lastPick[set];
    if (n > 1 && i === last) i = (i + 1 + Math.floor(this.rnd() * (n - 1))) % n;
    this.lastPick[set] = i;
    return list[i];
  }

  /**
   * One footfall on `ground`, `g` 0‥1 from a slow walk to a full run. Soft
   * and deep: the body's weight lands as a dull thud (noise in a low band,
   * 120–400 Hz, which small speakers still play; a sub under it for
   * headphones), then what the sole meets, kept dark (no clicks, nothing
   * bright or ringing). Walking rolls heel then toe, the toe lighter;
   * running lands in one heavier, shorter blow.
   */
  private footstep(t: number, g: number, ground: Ground): void {
    const r = this.rnd;
    const pan = (this.foot = -this.foot) * range(r, 0.04, 0.12);
    const k = range(r, 0.9, 1.12);
    const v = g ** EFFORT * range(r, 0.8, 1);
    const run = running(g);
    const L = LEVEL.step * GROUND_GAIN[ground] * v;
    const heavy = 1 + 0.6 * run;
    const short = 1 - 0.3 * run;
    // The toe comes down 50–90 ms after the heel (later when slow); running, it is part of the one blow.
    const toeLevel = Math.max(0, 1 - 1.8 * run);
    const toe = t + range(r, 0.05, 0.08) + 0.03 * (1 - g);
    // The weight landing: pink noise in a low band sliding down from `f0` to `f1`, the deepest lows left to the sub.
    const thud = (at: number, f0: number, f1: number, attack: number, tau: number, level: number, wet: number) =>
      this.burst(at, { kind: 'pink', type: 'bandpass', f0: f0 * k, f1: f1 * k, q: 1, hp: 125, attack, tau: tau * short, dur: 0.07, level: L * level, pan, wet });
    // Under it, a smooth low pulse: its first cycles near `f` × 1.5 (a laptop still plays those), then down into the sub (headphones).
    const sub = (f: number, level: number) =>
      this.tone(t, { f0: f * 1.5 * k, f1: f * 0.65 * k, glide: 0.05, attack: 0.003, tau: 0.04 * short, level: L * level * heavy, pan, wet: 0.02 });
    // What the sole meets: grit crunching (or `kind` noise), under a lowpass, swelling in `attack`.
    const sole = (at: number, f0: number, f1: number, attack: number, tau: number, level: number, wet: number, kind?: NoiseKind) =>
      this.burst(at, { kind, buf: kind ? undefined : source('crunch'), type: 'lowpass', f0: f0 * k, f1: f1 * k, q: 0.5, attack, tau, dur: 0.1, level: L * level, pan, wet });
    switch (ground) {
      case 'earth':
        // Packed earth: a dull thud, a low crunch of grit under the sole.
        thud(t, 300, 170, 0.004, 0.034, heavy, 0.04);
        sub(85, 0.09);
        sole(t + 0.006, 2000, 1100, 0.012, 0.04, 0.33, 0.03);
        if (toeLevel) thud(toe, 340, 200, 0.006, 0.028, 0.5 * toeLevel, 0.03);
        break;
      case 'grass':
        // Soft: a cushioned thud, and the blades brushing under the sole (a low swish).
        thud(t, 260, 160, 0.006, 0.04, 0.9 * heavy, 0.03);
        sub(80, 0.08);
        sole(t, 2200, 1100, 0.02, 0.05, 0.36, 0.03, 'pink');
        if (toeLevel) thud(toe, 300, 180, 0.008, 0.03, 0.45 * toeLevel, 0.03);
        break;
      case 'stone':
        // Firm: the heel taps sandstone (a short dull knock), grit scuffs under the sole; the walls answer a little.
        thud(t, 380, 210, 0.002, 0.03, 1 + 0.3 * run, 0.1);
        sub(90, 0.06);
        this.burst(t, { kind: 'pink', type: 'bandpass', f0: 1000 * k, f1: 700 * k, q: 0.8, attack: 0.0015, tau: 0.014 * short, level: L * 0.6 * (1 - 0.35 * run), pan, wet: 0.12 });
        sole(t + 0.02, 2400, 1400, 0.01, 0.03, 0.18, 0.1);
        if (toeLevel) thud(toe, 420, 230, 0.003, 0.022, 0.4 * toeLevel, 0.08);
        break;
      case 'sand':
        // Soft: the sole sinks in (a slow, low thud) with a hushed crunch of grains, pushed back again by the toe.
        thud(t, 240, 150, 0.01, 0.05, 0.8 * heavy, 0.02);
        sub(75, 0.08);
        sole(t + 0.004, 1300, 650, 0.02, 0.06, 0.42, 0.02);
        if (toeLevel) {
          thud(toe, 270, 160, 0.01, 0.035, 0.3 * toeLevel, 0.02);
          sole(toe, 1200, 600, 0.015, 0.04, 0.25 * toeLevel, 0.02);
        }
        break;
      case 'wood':
        // Planks: a hollow thud, the boards knocking low under it.
        thud(t, 330, 190, 0.003, 0.03, heavy, 0.06);
        sub(95, 0.06);
        this.knock(t + 0.004, range(r, 140, 175) * k, L * 0.06, pan);
        if (toeLevel) thud(toe, 360, 210, 0.004, 0.024, 0.45 * toeLevel, 0.05);
        break;
      case 'snow':
        // Snow: the sole packs it down — a soft, muffled thud, a crunch that runs on a moment (the flakes crushed), the toe's lighter one.
        thud(t, 220, 140, 0.012, 0.045, 0.6 * heavy, 0.02);
        sub(70, 0.05);
        sole(t + 0.01, 3400, 1500, 0.035, 0.09, 0.45, 0.02);
        if (toeLevel) sole(toe + 0.03, 2800, 1300, 0.02, 0.06, 0.3 * toeLevel, 0.02);
        break;
      case 'water':
        // Wading: a low slosh round the shin, a "bloop", a dull splash, the foot pulled out, a drop or two.
        this.burst(t, { kind: 'brown', type: 'lowpass', f0: 900 * k, f1: 300 * k, q: 0.7, hp: 100, attack: 0.012, tau: 0.07 * short, dur: 0.15, level: L * (1 + 0.3 * run), pan, wet: 0.1 });
        this.tone(t + 0.008, { f0: 190 * k, f1: 95 * k, glide: 0.07, attack: 0.006, tau: 0.05, level: L * 0.12 * heavy, pan, wet: 0.05 });
        sole(t + 0.006, 3500, 1000, 0.004, 0.045, 0.75, 0.12, 'pink');
        sole(t + range(r, 0.12, 0.16), 700, 350, 0.04, 0.08, 0.4, 0.08, 'brown');
        this.drops(t + 0.08, 1 + Math.floor(r() * 2), 0.3, L * 0.025, pan);
        break;
    }
  }

  // ── Lasting sounds ────────────────────────────────────────────────────────

  private lasting(l: Lasting | null, v: number, t: number, make: () => Lasting, set: (l: Lasting, v: number) => void): Lasting | null {
    if (!l) {
      if (v < 0.002) return null;
      l = make();
    }
    if (v >= 0.002) l.quietSince = -1;
    else if (l.quietSince < 0) l.quietSince = t;
    else if (t - l.quietSince > IDLE) {
      for (const s of l.sources) s.stop(t);
      for (const n of l.nodes) n.disconnect();
      return null;
    }
    // (every frame calls this: move the params only when the level moves)
    if (Math.abs(v - l.level) > 0.004 || (v === 0 && l.level !== 0)) {
      l.level = v;
      set(l, v);
    }
    return l;
  }

  private makeWind(): Lasting {
    const ctx = this.ctx;
    const r = this.rnd;
    const env = this.gain(0);
    // Air roaring past: pink noise in a band that rises with the speed, and a low buffeting.
    const src = this.loop(noise('pink'));
    const tone = biquad(ctx, 'bandpass', 400, 0.7);
    const buffet = this.loop(noise('brown'));
    const lp = biquad(ctx, 'lowpass', 160, 0.7);
    const low = this.gain(0.5);
    // Slow swells, as the body turns in the air.
    const sway = this.gain(1);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = range(r, 0.35, 0.5);
    const depth = this.gain(0.15);
    lfo.connect(depth).connect(sway.gain);
    lfo.start(ctx.currentTime);
    src.connect(tone).connect(sway);
    buffet.connect(lp).connect(low).connect(sway);
    sway.connect(env);
    this.out(env, 0, 0.05);
    return { env, tone, low, sources: [src, buffet, lfo], nodes: [src, tone, buffet, lp, low, sway, lfo, depth, env], level: 0, quietSince: -1 };
  }

  private makeSail(): Lasting {
    const ctx = this.ctx;
    const r = this.rnd;
    // The sail taut on its frame: a low hum (the wires and the cloth), and the trailing edge fluttering in pink noise.
    const env = this.gain(0);
    const hum = ctx.createOscillator();
    hum.type = 'triangle';
    hum.frequency.value = range(r, 95, 110);
    const tone = biquad(ctx, 'bandpass', 250, 1.2);
    const humGain = this.gain(0.09);
    hum.connect(tone).connect(humGain).connect(env);
    hum.start(ctx.currentTime);
    const cloth = this.loop(noise('pink'));
    const band = biquad(ctx, 'bandpass', 1400, 0.9);
    const low = this.gain(0.5);
    // The flutter: noise beating at ~13 Hz, not quite steady.
    const beat = this.gain(0.6);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = range(r, 11, 14);
    const depth = this.gain(0.4);
    lfo.connect(depth).connect(beat.gain);
    lfo.start(ctx.currentTime);
    cloth.connect(band).connect(beat).connect(low).connect(env);
    this.out(env, 0, 0.06);
    return { env, tone, low, sources: [hum, cloth, lfo], nodes: [hum, tone, humGain, cloth, band, beat, lfo, depth, low, env], level: 0, quietSince: -1 };
  }

  private makeFan(): Lasting {
    const ctx = this.ctx;
    const r = this.rnd;
    // The balloon's inflation fan: a small petrol engine's low hum (a soft sawtooth, lowpassed, with its
    // firing flutter) and the cold air it blows (pink noise in a soft band).
    const env = this.gain(0);
    const hum = ctx.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = range(r, 48, 56);
    const lp = biquad(ctx, 'lowpass', 260, 0.7);
    const low = this.gain(0.5);
    const flutter = this.gain(1);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = range(r, 22, 26);
    const depth = this.gain(0.25);
    lfo.connect(depth).connect(flutter.gain);
    hum.connect(lp).connect(flutter).connect(low).connect(env);
    const air = this.loop(noise('pink'));
    const tone = biquad(ctx, 'bandpass', 600, 0.6);
    const airGain = this.gain(0.6);
    air.connect(tone).connect(airGain).connect(env);
    hum.start(ctx.currentTime);
    lfo.start(ctx.currentTime);
    this.out(env, 0, 0.06);
    return { env, tone, low, sources: [hum, lfo, air], nodes: [hum, lp, flutter, lfo, depth, low, air, tone, airGain, env], level: 0, quietSince: -1 };
  }

  private makeBurner(): Lasting {
    const ctx = this.ctx;
    const r = this.rnd;
    // A propane jet: a deep rumble (brown noise, low), the roar of the flame (pink, a wide band), the gas's hiss
    // (white, high), all beating a little with the flame's turbulence and surging slowly.
    const env = this.gain(0);
    const rumble = this.loop(noise('brown'));
    const lp = biquad(ctx, 'lowpass', 420, 0.6);
    const low = this.gain(0.8);
    const roar = this.loop(noise('pink'));
    const tone = biquad(ctx, 'bandpass', 1200, 0.55);
    const roarGain = this.gain(0.55);
    const hiss = this.loop(noise('white'));
    const hp = biquad(ctx, 'highpass', 3800, 0.7);
    const hissGain = this.gain(0.07);
    const beat = this.gain(1);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = range(r, 9, 13);
    const depth = this.gain(0.18);
    lfo.connect(depth).connect(beat.gain);
    const surge = ctx.createOscillator();
    surge.frequency.value = range(r, 0.5, 0.8);
    const surgeDepth = this.gain(0.08);
    surge.connect(surgeDepth).connect(beat.gain);
    lfo.start(ctx.currentTime);
    surge.start(ctx.currentTime);
    rumble.connect(lp).connect(low).connect(beat);
    roar.connect(tone).connect(roarGain).connect(beat);
    hiss.connect(hp).connect(hissGain).connect(beat);
    beat.connect(env);
    this.out(env, 0, 0.08);
    return { env, tone, low, sources: [rumble, roar, hiss, lfo, surge], nodes: [rumble, lp, low, roar, tone, roarGain, hiss, hp, hissGain, beat, lfo, depth, surge, surgeDepth, env], level: 0, quietSince: -1 };
  }

  private makeWake(): Lasting {
    const ctx = this.ctx;
    // Water hissing along the hull, and gurgling behind it.
    const src = this.loop(noise('pink'));
    const tone = biquad(ctx, 'bandpass', 1200, 0.8);
    const gurgle = this.loop(source('babble'));
    gurgle.playbackRate.value = 1.3;
    const hp = biquad(ctx, 'highpass', 300, 0.7);
    const low = this.gain(0.6);
    const env = this.gain(0);
    src.connect(tone).connect(env);
    gurgle.connect(hp).connect(low).connect(env);
    this.out(env, 0, 0.1);
    return { env, tone, low, sources: [src, gurgle], nodes: [src, tone, gurgle, hp, low, env], level: 0, quietSince: -1 };
  }

  // ── Building blocks ───────────────────────────────────────────────────────

  private gain(v: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  private loop(buf: AudioBuffer): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.start(this.ctx.currentTime, this.rnd() * buf.duration);
    return s;
  }

  /** Send `node` to the sound's bus (dry, and some reverb), through a pan. */
  private out(node: AudioNode, pan: number, wet: number): AudioNode[] {
    const made: AudioNode[] = [];
    let last = node;
    if (pan) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      last = last.connect(p);
      made.push(p);
    }
    last.connect(this.to.dry);
    if (wet > 0) {
      const g = this.gain(wet);
      last.connect(g).connect(this.to.wet);
      made.push(g);
    }
    return made;
  }

  /** Filtered noise, struck: rises in `attack`, then dies away; its filter slides from `f0` to `f1`. */
  private burst(t: number, b: Burst): void {
    const ctx = this.ctx;
    const buf = b.buf ?? noise(b.kind ?? 'white');
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const end = b.attack + b.tau * 6;
    const f = biquad(ctx, b.type, b.f0, b.q ?? 0.7);
    if (b.f1 && b.f1 !== b.f0) {
      f.frequency.setValueAtTime(b.f0, t);
      f.frequency.exponentialRampToValueAtTime(b.f1, t + (b.dur ?? end));
    }
    const env = ctx.createGain();
    strike(env.gain, t, b.level, b.attack, b.tau);
    const hp = b.hp ? biquad(ctx, 'highpass', b.hp, 0.7) : null;
    src.connect(f).connect(hp ?? env);
    hp?.connect(env);
    const made = this.out(env, b.pan ?? 0, b.wet ?? 0);
    src.start(t, this.rnd() * (buf.duration - end - 0.1));
    src.stop(t + end);
    src.onended = () => {
      for (const n of [src, f, env, ...made]) n.disconnect();
      hp?.disconnect();
    };
  }

  /** A struck tone whose pitch slides from `f0` to `f1`. */
  private tone(t: number, s: Tone): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = s.type ?? 'sine';
    o.frequency.setValueAtTime(s.f0, t);
    if (s.f1 && s.f1 !== s.f0) o.frequency.exponentialRampToValueAtTime(s.f1, t + (s.glide ?? s.tau * 3));
    const env = ctx.createGain();
    strike(env.gain, t, s.level, s.attack, s.tau);
    o.connect(env);
    const made = this.out(env, s.pan ?? 0, s.wet ?? 0);
    o.start(t);
    o.stop(t + s.attack + s.tau * 7);
    o.onended = () => {
      for (const n of [o, env, ...made]) n.disconnect();
    };
  }

  /** Tiny ticks of grit and small stones, scattered over `spread` s. */
  private grit(t: number, n: number, spread: number, level: number, pan: number): void {
    const r = this.rnd;
    for (let i = 0; i < n; i++)
      this.burst(t + r() * spread, { type: 'highpass', f0: range(r, 2500, 4200), attack: 0.0008, tau: range(r, 0.002, 0.005), level: level * (0.3 + 0.7 * r()), pan: pan + range(r, -0.15, 0.15) });
  }

  /**
   * Quick clicks over `dur` s, from `rate0` to `rate1` a second: a reel's pawl
   * on its gear (`pawl`: a tick with a small metal ping at `f`) or line
   * running off the spool (`line`: a soft brush of noise round `f`). One
   * noise and one note struck again and again, not one node a click.
   */
  private ratchet(t: number, dur: number, rate0: number, rate1: number, f: number, level: number, pan: number, kind: 'pawl' | 'line'): void {
    const ctx = this.ctx;
    const r = this.rnd;
    const end = t + dur + 0.1;
    const src = ctx.createBufferSource();
    src.buffer = noise('white');
    const band = biquad(ctx, kind === 'pawl' ? 'highpass' : 'bandpass', kind === 'pawl' ? 3000 : f, kind === 'pawl' ? 0.7 : 1.4);
    const tick = this.gain(0);
    src.connect(band).connect(tick);
    const ping = ctx.createOscillator();
    ping.frequency.value = f;
    const pg = this.gain(0);
    ping.connect(pg);
    const sum = this.gain(1);
    tick.connect(sum);
    pg.connect(sum);
    const made = this.out(sum, pan, 0.05);
    let s = t;
    while (s < t + dur) {
      const u = (s - t) / dur;
      // (the line: every click a little softer as the spool slows)
      const k = kind === 'line' ? 1 - 0.7 * u : range(r, 0.75, 1);
      tick.gain.setTargetAtTime(level * k, s, 0.0004);
      tick.gain.setTargetAtTime(0, s + 0.0015, kind === 'line' ? 0.006 : 0.002);
      if (kind === 'pawl') {
        pg.gain.setTargetAtTime(level * 0.35 * k, s, 0.0005);
        pg.gain.setTargetAtTime(0, s + 0.002, 0.005);
      }
      s += (1 / (rate0 + (rate1 - rate0) * u)) * range(r, 0.92, 1.08);
    }
    src.start(t, r() * 3);
    src.stop(end);
    ping.start(t);
    ping.stop(end);
    src.onended = () => {
      for (const n of [src, band, tick, ping, pg, sum, ...made]) n.disconnect();
    };
  }

  /** Water drops and bubbles: short sines that rise as they pop, over `spread` s. */
  private drops(t: number, n: number, spread: number, level: number, pan: number): void {
    const r = this.rnd;
    for (let i = 0; i < n; i++) {
      const f0 = 600 * 4 ** (r() ** 1.2);
      const tau = range(r, 0.008, 0.02);
      this.tone(t + spread * r() ** 1.5, { f0, f1: f0 * range(r, 1.3, 1.8), glide: tau * 3, attack: 0.0015, tau, level: level * (0.4 + 0.6 * r()), pan: pan + range(r, -0.2, 0.2), wet: 0.12 });
    }
  }

  /** Cloth flapping in the air: noise in a band, beating at `rate0` → `rate1` Hz, over `dur` s. */
  private flutter(t: number, f0: number, f1: number, rate0: number, rate1: number, dur: number, level: number): void {
    const ctx = this.ctx;
    const buf = noise('pink');
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = biquad(ctx, 'bandpass', f0, 0.9);
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const env = ctx.createGain();
    strike(env.gain, t, level * 0.5, 0.02, dur / 4);
    // The flaps: an oscillator adds to the envelope, as deep as the envelope itself.
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(rate0, t);
    lfo.frequency.exponentialRampToValueAtTime(rate1, t + dur);
    const depth = ctx.createGain();
    strike(depth.gain, t, level * 0.5, 0.02, dur / 4);
    lfo.connect(depth).connect(env.gain);
    src.connect(f).connect(env);
    const made = this.out(env, 0, 0.1);
    const end = t + dur * 1.6;
    src.start(t, this.rnd() * (buf.duration - dur * 2));
    src.stop(end);
    lfo.start(t);
    lfo.stop(end);
    src.onended = () => {
      for (const n of [src, f, env, lfo, depth, ...made]) n.disconnect();
    };
  }

  /** The boat rocking: a low slosh of water against the hull. */
  private slosh(t: number, g: number): void {
    this.burst(t, { kind: 'pink', type: 'lowpass', f0: 650, f1: 300, q: 0.7, attack: 0.1, tau: 0.18, dur: 0.6, level: LEVEL.splash * 0.3 * g, wet: 0.1 });
  }

  /** A knock on the hollow wooden hull: a few inharmonic partials that die fast, and a click. */
  private knock(t: number, f: number, level: number, pan: number): void {
    const parts: [number, number, number][] = [
      [1, 1, 0.09],
      [2.32, 0.5, 0.05],
      [3.7, 0.28, 0.03],
      [5.9, 0.12, 0.015],
    ];
    for (const [ratio, amp, tau] of parts) this.tone(t, { f0: f * ratio, attack: 0.001, tau, level: level * amp, pan, wet: 0.08 });
    this.burst(t, { type: 'highpass', f0: 2000, attack: 0.0005, tau: 0.004, level: level * 0.4, pan });
  }

  /** A small glassy chime (the treasure's): a pure note, a soft bright partial, a long ring. */
  private chime(t: number, f: number, level: number, pan: number): void {
    for (const [ratio, amp, tau] of [
      [1, 1, 0.9],
      [2.76, 0.18, 0.35],
      [5.4, 0.05, 0.15],
    ] as const)
      this.tone(t, { f0: f * ratio * range(this.rnd, 0.999, 1.001), attack: 0.004, tau, level: level * amp, pan, wet: 0.55 });
  }

  /** A small bronze bell: a clear note with a few softer, quicker partials above. */
  private bell(t: number, f: number, level: number, pan: number): void {
    const parts: [number, number, number][] = [
      [1, 1, 1.6],
      [2.0, 0.35, 1],
      [2.74, 0.22, 0.7],
      [4.07, 0.1, 0.4],
      [5.4, 0.05, 0.25],
    ];
    for (const [ratio, amp, tau] of parts) this.tone(t, { f0: f * ratio * range(this.rnd, 0.999, 1.001), attack: 0.003, tau, level: level * amp, pan, wet: 0.5 });
  }
}
