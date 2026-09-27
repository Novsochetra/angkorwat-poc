import { glide, pick, range, type Rng } from './dsp';
import type { Placing } from './life';
import { Voice } from './voice';

/**
 * The khleng ek's song (`kiteHum`): the ek, a bamboo bow strung with a thin
 * ribbon of rattan (or palm leaf) across the kite's top, buzzes in the wind
 * like a reed — a reedy drone with a rattle in it. It sings in notes: every
 * 0.6–1.2 s it steps to another of a few (1, 9/8, 5/4, 3/2, 5/3 of its own
 * note, mostly the next one up or down), entering each with a quick rise
 * (~0.2 s) and sagging slower after it (~0.5 s) — the "miaow" the Khmer
 * hear in it — deeper in a gust, a dive now and then. The bigger the kite
 * (its bow), the lower it sings (`size`, m: ~440 Hz for a 1 m kite, 150 Hz
 * for a big one of 3.5 m) and the steadier it drones; a small or a female
 * kite (a smaller bow's `size`) glides more.
 *
 * Each kite is one lasting voice (`KiteVoice`): its calls (one every 3–5 s
 * while it flies near: people/_sceneKites.ts) keep it singing 6 s past the
 * last; then it fades out. Several kites make a chorus (people.ts lets five
 * sing at once). Carries 250 m.
 *
 * Its voice: two reedy oscillators a little apart (the ribbon's beat), a
 * quick flutter on the pitch, a rattle on the level (the ribbon slapping
 * the bow), the bow's resonance, the wind's hiss over the ribbon; placed
 * like the moto (people.ts), moved ~15 times a second; ~25 nodes a kite.
 */

/** A kite's size (m) when the call does not say (the children's khleng ek). */
export const KITE_SIZE = 1.7;
/** The notes an ek steps through, of its own note (a major pentatonic). */
const STEPS = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];
/** A kite sings on this long after its last call (s); its notes are set this far ahead (s). */
const SING_ON = 6;
const AHEAD = 1.5;

/** The ribbon's tone: a reed's harmonics (1/n^1.1, the odd a little stronger), shared by every kite. */
const reeds = new WeakMap<BaseAudioContext, PeriodicWave>();
function reed(ctx: BaseAudioContext): PeriodicWave {
  let w = reeds.get(ctx);
  if (!w) {
    const H = 28;
    const real = new Float32Array(H + 1);
    const imag = new Float32Array(H + 1);
    for (let h = 1; h <= H; h++) imag[h] = (h % 2 ? 1 : 0.7) / h ** 1.1;
    reeds.set(ctx, (w = ctx.createPeriodicWave(real, imag)));
  }
  return w;
}

/** The note (Hz) of a khleng ek of `size` m. */
export const kiteNote = (size: number): number => Math.min(450, Math.max(150, 440 / Math.max(0.3, size) ** 0.9));

/** One flying khleng ek's song: a lasting voice that follows its calls. */
export class KiteVoice {
  readonly size: number;
  x: number;
  y: number;
  z: number;
  /** How hard it sings (the call's `gain`: the wind aloft, its size). */
  gain: number;
  /** Stopped (its sources end at `end`). */
  done = false;
  private end = Infinity;
  /** It sings until then (s): `SING_ON` past its last call. */
  private until: number;
  private nextNote: number;
  /** Where it is on `STEPS`, the wind in its last note (0‥1), and whether it has begun (its first note swells in). */
  private idx = 0;
  private gust = 0.6;
  private begun = false;
  private readonly r: Rng;
  private readonly v: Voice;
  private readonly f0: number;
  /** How far its notes glide (a big kite steadier, a small or female one more). */
  private readonly glides: number;
  private readonly a: OscillatorNode;
  private readonly b: OscillatorNode;
  private readonly env: GainNode;
  private readonly level: GainNode;
  private readonly air: BiquadFilterNode;
  private readonly pan: StereoPannerNode;
  private readonly send: GainNode;

  constructor(ctx: BaseAudioContext, r: Rng, c: { x: number; y: number; z: number; gain: number; size?: number }, now: number, dry: AudioNode, wet: AudioNode) {
    this.size = c.size ?? KITE_SIZE;
    this.x = c.x;
    this.y = c.y;
    this.z = c.z;
    this.gain = c.gain;
    this.r = r;
    this.until = now + SING_ON;
    this.nextNote = now + range(r, 0.05, 0.3);
    this.f0 = kiteNote(this.size) * range(r, 0.97, 1.03);
    this.glides = Math.min(1.6, Math.max(0.6, 2.2 / Math.max(0.5, this.size)));
    const v = (this.v = new Voice(ctx, r));
    const far = now + 3600;
    const wave = reed(ctx);
    this.a = v.osc(wave, now, far, this.f0);
    this.b = v.osc(wave, now, far, this.f0);
    // (the second ribbon edge a little sharp: a slow beat)
    this.b.detune.value = range(r, 4, 9);
    // The flutter: a quick shiver of the pitch.
    const shiver = v.osc('sine', now, far, range(r, 5.5, 7.5));
    const depth = v.gain(range(r, 6, 11));
    shiver.connect(depth);
    depth.connect(this.a.detune);
    depth.connect(this.b.detune);
    const mix = v.gain(1);
    this.a.connect(mix);
    this.b.connect(v.gain(0.6)).connect(mix);
    // The rattle: the ribbon slapping the bow.
    const rattle = v.gain(0.8);
    v.lfo(rattle.gain, range(r, 12, 19), 0.13, now, far, 'triangle');
    v.lfo(rattle.gain, range(r, 23, 31), 0.07, now, far);
    // The bow and the sail sound with it: a lift round the third harmonic; the far top taken off; nothing under the note.
    const body = v.filter('peaking', this.f0 * range(r, 2.6, 3.4), 1.8, 5);
    const top = v.filter('lowpass', range(r, 2200, 2800), 0.7);
    const floor = v.filter('highpass', this.f0 * 0.75, 0.7);
    this.env = v.gain(0);
    mix.connect(rattle).connect(body).connect(top).connect(floor).connect(this.env);
    // The wind over the ribbon: a soft hiss, with the song.
    v.noise('pink', now, far).connect(v.filter('bandpass', range(r, 1600, 2400), 0.8)).connect(v.gain(0.05)).connect(this.env);
    this.level = v.gain(0);
    this.air = v.filter('lowpass', 8000, 0.5);
    this.pan = v.keep(ctx.createStereoPanner());
    this.send = v.gain(0);
    this.env.connect(this.level).connect(this.air).connect(this.pan).connect(dry);
    this.pan.connect(this.send).connect(wet);
    v.play();
  }

  /** Its calls have stopped: it is fading out. */
  get fading(): boolean {
    return this.end !== Infinity;
  }

  /** Another call from it: where it is, how hard it sings; it sings on `SING_ON` s more. */
  call(c: { x: number; y: number; z: number; gain: number }, now: number): void {
    this.x = c.x;
    this.y = c.y;
    this.z = c.z;
    this.gain = c.gain;
    this.until = now + SING_ON;
  }

  /** Move it and set its next notes (every ~1/15 s): its place from the ears (`place`); it fades out once it has sung on past its last call. */
  update(now: number, place: Placing): void {
    if (this.done) return;
    if (now > this.end) {
      this.done = true;
      return;
    }
    const p = place(this.x, this.y, this.z, this.gain);
    const tc = 0.15;
    glide(this.level.gain, p.level, now, tc);
    glide(this.air.frequency, p.air, now, tc);
    glide(this.pan.pan, p.pan, now, tc);
    glide(this.send.gain, p.wet, now, 0.3);
    if (this.fading) return;
    if (now > this.until) {
      // Out of reach, or brought in: the song fades.
      glide(this.env.gain, 0, now, 0.45);
      this.end = now + 2.5;
      this.v.stop(this.end);
      return;
    }
    if (this.nextNote < now) this.nextNote = now;
    while (this.nextNote < now + AHEAD && this.nextNote < this.until) this.nextNote = this.note(this.nextNote);
  }

  /** Stop at once (the bus muted). */
  stop(now: number): void {
    if (this.done) return;
    this.done = true;
    this.v.stop(now);
  }

  /** One note from `t`: up to it quickly, a slower sag after (deeper in a gust; now and then a dive). Returns when the next comes. */
  private note(t: number): number {
    const r = this.r;
    const first = !this.begun;
    this.begun = true;
    this.gust = Math.min(1, Math.max(0, this.gust + range(r, -0.35, 0.35)));
    const g = this.gust;
    // (mostly the next note up or down, now and then a leap; back home to its own note often)
    this.idx = Math.max(0, Math.min(STEPS.length - 1, this.idx + pick(r, [-1, -1, 1, 1, 2, -2, 0])));
    if (r() < 0.2) this.idx = 0;
    const dive = r() < 0.12;
    const f = this.f0 * STEPS[this.idx];
    const over = (0.012 + 0.02 * g) * this.glides;
    const sag = (0.03 + 0.05 * g) * this.glides * (dive ? 2.5 : 1);
    for (const o of [this.a, this.b]) {
      o.frequency.setTargetAtTime(f * (1 + over), t, 0.07);
      o.frequency.setTargetAtTime(f * (1 - sag), t + 0.2, 0.17);
    }
    // The level swells with the rise and eases with the sag (the first note swells in slowly).
    const loud = (0.75 + 0.25 * g) * (dive ? 0.8 : 1);
    this.env.gain.setTargetAtTime(loud, t, first ? 0.35 : 0.05);
    this.env.gain.setTargetAtTime(loud * (dive ? 0.55 : 0.72), t + (first ? 0.9 : 0.15), 0.25);
    return t + range(r, 0.6, 1.2);
  }
}
