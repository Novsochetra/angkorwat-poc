import type { AnimalCall, AnimalCallKind, PeopleCallKind } from '../types';
import { biquad, clamp01, mtof, noise, pick, range, strike, type NoiseKind, type Rng } from './dsp';
import type { BusName, SoundEngine } from './engine';
import type { Ears } from './water';

/**
 * The people's sounds on the map (people/: they push them into `f.calls`
 * like the animals; the engine hands the `PeopleCallKind`s here), each made
 * fresh from oscillators and noise and placed where it happens, like the
 * animal calls (audio/animals.ts: softer and duller far off, panned, a
 * little late, more of the valley's echo):
 *
 * - `oxBell`: the bronze bell under an ox's neck, a soft clonk with each
 *   few steps (two oxen, two notes);
 * - `cartCreak`: the ox cart's wooden axle, a short dry creak;
 * - `netSplash`: a cast net slapping flat on the water, spray, drops;
 * - `laugh`: children laughing, far off (soft, dull);
 * - `pinpeat`: one phrase (≈ 7 s) of the pinpeat ensemble playing for the
 *   apsara dancers at night: the roneat ek (xylophone) running in eighths,
 *   the sralai (quadruple-reed oboe) singing a slow ornamented line over it,
 *   the chhing (small cymbals) keeping time, open and closed, a gong now and
 *   then, the skor thom drums at the phrase's ends. The notes are the map
 *   music's pentatonic (D E F# A B), so the two sit together. Near the
 *   dancers it leads: the map's own music steps back while it plays
 *   (`SoundEngine.yieldMusic`, by how loud the pinpeat is there). A phrase
 *   is a few voices struck again and again (~40 nodes), not one a note.
 *
 * The music is on the Music bus (its slider), the rest on Ambience. Levels
 * are gentle: under the animals' calls close by, and the laughter carries
 * less than a hornbill. At most six at once, two of a kind.
 */

/** Each sound: its peak level close by, full within `near` m, silent past `reach` m; its bus. */
const SOUNDS: Record<PeopleCallKind, { level: number; near: number; reach: number; bus: BusName }> = {
  oxBell: { level: 0.09, near: 6, reach: 70, bus: 'ambience' },
  cartCreak: { level: 0.35, near: 5, reach: 45, bus: 'ambience' },
  netSplash: { level: 0.3, near: 8, reach: 110, bus: 'ambience' },
  laugh: { level: 0.14, near: 10, reach: 150, bus: 'ambience' },
  pinpeat: { level: 0.55, near: 16, reach: 190, bus: 'music' },
};
/** Seconds of one pinpeat phrase (12 beats of 0.6 s); the map's music stays back this long after one begins, and a little more (the next comes as it ends). */
const PHRASE = 7.2;
const PHRASE_HOLD = 2;
const KINDS = new Set<AnimalCallKind>(Object.keys(SOUNDS) as PeopleCallKind[]);

/** Is this call one of the people's (made here, not by the animals' voices)? */
export function isPeopleCall(k: AnimalCallKind): k is PeopleCallKind {
  return KINDS.has(k);
}

const MAX = 6;
const MAX_KIND = 2;
const FALLOFF = 0.8;
const QUIET = 0.02;
const SOUND_SPEED = 343;
const LEAD = 0.05;

function carry(d: number, near: number, reach: number): number {
  const k = Math.min(1, Math.max(0, 2 * (d / reach) - 1));
  return Math.min(1, (near / Math.max(d, 1e-3)) ** FALLOFF) * (1 - k * k * (3 - 2 * k));
}
const air = (d: number): number => Math.min(18000, Math.max(1100, 18000 / (1 + d / 45) ** 0.85));
const wetOf = (d: number): number => 0.06 + (0.5 * d) / (d + 100);

/** One sound's nodes: made, started, and all let go when its last source ends. */
class Voice {
  readonly out: GainNode;
  end = 0;
  private readonly nodes: AudioNode[] = [];
  private readonly srcs: [AudioScheduledSourceNode, number, number, number][] = [];

  constructor(
    readonly ctx: BaseAudioContext,
    readonly r: Rng,
  ) {
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

  filter(type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode {
    return this.keep(biquad(this.ctx, type, f, q));
  }

  osc(wave: OscillatorType | PeriodicWave, from: number, to: number, f: number): OscillatorNode {
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

  drop(): void {
    for (const n of this.nodes) n.disconnect();
  }
}

/** Pentatonic notes of the map's music (D E F# A B), as MIDI numbers in a range. */
function penta(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if ([2, 4, 6, 9, 11].includes(m % 12)) out.push(m);
  return out;
}

export class PeopleSound {
  private ears: Ears | null = null;
  private readonly playing: { kind: PeopleCallKind; end: number }[] = [];
  private bar: PeriodicWave | null = null;
  private reed: PeriodicWave | null = null;
  /** Where the pinpeat's melody is (it carries on from phrase to phrase). */
  private tune = 4;

  constructor(private readonly e: SoundEngine) {}

  listen(ears: Ears): void {
    this.ears = ears;
  }

  /** A sound at its place, from `now` (audio clock); dropped when too many play, its bus is muted, or it would not be heard. */
  call(c: AnimalCall, now: number): void {
    const ears = this.ears;
    if (!ears || !isPeopleCall(c.kind)) return;
    const kind = c.kind;
    const spec = SOUNDS[kind];
    if (!this.e.heard(spec.bus)) return;
    const playing = this.playing;
    for (let i = playing.length - 1; i >= 0; i--) if (playing[i].end <= now) playing.splice(i, 1);
    if (playing.length >= MAX || playing.filter((p) => p.kind === kind).length >= MAX_KIND) return;
    const dx = c.x - ears.x;
    const dy = c.y - ears.y;
    const dz = c.z - ears.z;
    const d = Math.hypot(dx, dy, dz) || 1e-3;
    const side = (dx * ears.right[0] + dy * ears.right[1] + dz * ears.right[2]) / d;
    const behind = Math.max(0, -(dx * ears.forward[0] + dy * ears.forward[1] + dz * ears.forward[2]) / d);
    const k = clamp01(c.gain) * carry(d, spec.near, spec.reach) * (1 - 0.3 * behind);
    if (!(k >= QUIET)) return;
    const ctx = this.e.ctx;
    const r = this.e.rnd;
    const t = now + LEAD + d / SOUND_SPEED + r() * 0.02;
    const v = new Voice(ctx, r);
    try {
      if (kind === 'oxBell') this.bell(v, t, c.gain);
      else if (kind === 'cartCreak') this.creak(v, t);
      else if (kind === 'netSplash') this.splash(v, t);
      else if (kind === 'laugh') this.laugh(v, t);
      else this.pinpeat(v, t);
      const bus = this.e.bus[spec.bus];
      const lv = v.gain(spec.level * k);
      const lp = v.filter('lowpass', air(d) * (1 - 0.4 * behind), 0.5);
      const pan = v.keep(ctx.createStereoPanner());
      pan.pan.value = Math.max(-0.8, Math.min(0.8, 0.8 * side));
      v.out.connect(lv).connect(lp).connect(pan).connect(bus.dry);
      pan.connect(v.gain(wetOf(d) * (kind === 'pinpeat' ? 1.4 : 1))).connect(bus.wet);
      v.play();
    } catch (err) {
      v.drop();
      throw err;
    }
    playing.push({ kind, end: v.end });
    // By the dancers the pinpeat leads: the map's music steps back by how loud the pinpeat is here (nothing far off).
    if (kind === 'pinpeat') this.e.yieldMusic(k, now, t + PHRASE + PHRASE_HOLD);
  }

  // ── The sounds ──

  /** The ox's bronze bell: a soft clonk (two inharmonic partials and a wooden knock of the clapper). */
  private bell(v: Voice, t: number, gain: number): void {
    const r = v.r;
    // (two oxen, two bells: the gain the cart sends picks one)
    const f = (gain > 0.8 ? 610 : 520) * range(r, 0.99, 1.01);
    const hit = range(r, 0.6, 1);
    for (const [ratio, amp, tau] of [
      [1, 1, 0.22],
      [2.72, 0.45, 0.1],
      [5.1, 0.18, 0.05],
    ]) {
      const o = v.osc('sine', t, t + tau * 7, f * ratio);
      const g = v.gain();
      strike(g.gain, t, amp * hit, 0.003, tau);
      o.connect(g).connect(v.out);
    }
    const n = v.noise('white', t, t + 0.05);
    const ng = v.gain();
    strike(ng.gain, t, 0.35 * hit, 0.002, 0.012);
    n.connect(v.filter('bandpass', 1100, 2)).connect(ng).connect(v.out);
  }

  /** The cart's axle: stick-slip creak, a wooden groan that rises and falls. */
  private creak(v: Voice, t: number): void {
    const r = v.r;
    const dur = range(r, 0.35, 0.7);
    const o = v.osc('sawtooth', t, t + dur + 0.02, range(r, 90, 120));
    o.frequency.setValueAtTime(o.frequency.value, t);
    o.frequency.linearRampToValueAtTime(o.frequency.value * range(r, 1.3, 1.7), t + dur * 0.6);
    o.frequency.linearRampToValueAtTime(o.frequency.value * 1.1, t + dur);
    const g = v.gain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + dur * 0.2);
    g.gain.linearRampToValueAtTime(0.35, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0, t + dur);
    // (the stick-slip: the gain pulsing fast)
    const flutter = v.gain(0.6);
    const lfo = v.osc('square', t, t + dur, range(r, 22, 34));
    lfo.connect(v.gain(0.4)).connect(flutter.gain);
    o.connect(v.filter('bandpass', range(r, 900, 1400), 3.5)).connect(g).connect(flutter).connect(v.out);
  }

  /** A cast net landing flat on the water: a slap, spray, drops falling back. */
  private splash(v: Voice, t: number): void {
    const r = v.r;
    const slap = v.noise('white', t, t + 0.5);
    const sg = v.gain();
    strike(sg.gain, t, 1, 0.004, 0.09);
    slap.connect(v.filter('bandpass', 1300, 0.9)).connect(v.filter('lowpass', 4000)).connect(sg).connect(v.out);
    const spray = v.noise('white', t + 0.02, t + 0.9);
    const pg = v.gain();
    strike(pg.gain, t + 0.02, 0.35, 0.05, 0.22);
    spray.connect(v.filter('highpass', 3500)).connect(pg).connect(v.out);
    for (let k = 0; k < 7; k++) {
      const s = t + 0.15 + r() * 0.7;
      const o = v.osc('sine', s, s + 0.05, range(r, 1100, 2600));
      o.frequency.setValueAtTime(o.frequency.value, s);
      o.frequency.exponentialRampToValueAtTime(o.frequency.value * 1.6, s + 0.03);
      const g = v.gain();
      strike(g.gain, s, range(r, 0.08, 0.18), 0.002, 0.012);
      o.connect(g).connect(v.out);
    }
  }

  /** Children laughing, far off: a run of short voiced "ha"s, falling a little, a second child now and then. */
  private laugh(v: Voice, t: number): void {
    const r = v.r;
    const kids = r() < 0.4 ? 2 : 1;
    for (let c = 0; c < kids; c++) {
      let s = t + c * range(r, 0.15, 0.4);
      const f0 = range(r, 360, 470) * (c ? 1.15 : 1);
      const n = 3 + Math.floor(r() * 5);
      const voice = v.osc('sawtooth', s, s + n * 0.22 + 0.2, f0);
      const env = v.gain();
      env.gain.setValueAtTime(0, s);
      const breath = v.noise('pink', s, s + n * 0.22 + 0.2);
      const benv = v.gain();
      benv.gain.setValueAtTime(0, s);
      for (let k = 0; k < n; k++) {
        const len = range(r, 0.08, 0.13);
        const f = f0 * (1.12 - (0.18 * k) / n) * range(r, 0.97, 1.03);
        voice.frequency.setValueAtTime(f * 1.05, s);
        voice.frequency.linearRampToValueAtTime(f * 0.92, s + len);
        env.gain.setValueAtTime(0, s);
        env.gain.linearRampToValueAtTime(0.5, s + 0.015);
        env.gain.linearRampToValueAtTime(0, s + len);
        benv.gain.setValueAtTime(0, s);
        benv.gain.linearRampToValueAtTime(0.25, s + 0.01);
        benv.gain.linearRampToValueAtTime(0, s + len * 0.7);
        s += len + range(r, 0.06, 0.1);
      }
      // (the vowel "a": two formants)
      const mix = v.gain(1);
      voice.connect(env);
      env.connect(v.filter('bandpass', range(r, 950, 1150), 4)).connect(mix);
      env.connect(v.filter('bandpass', range(r, 1500, 1800), 5)).connect(v.gain(0.4)).connect(mix);
      breath.connect(v.filter('bandpass', 1800, 1.5)).connect(benv).connect(mix);
      mix.connect(v.out);
    }
  }

  /**
   * One phrase of pinpeat: roneat, sralai, chhing, a gong and the skor thom
   * drums. Each instrument is a few voices struck again and again through
   * the phrase (a voice is struck again only once its last note has rung
   * out), so a phrase makes ~40 nodes, not one voice a note.
   */
  private pinpeat(v: Voice, t: number): void {
    const r = v.r;
    const ctx = v.ctx;
    const beat = 0.6;
    const beats = 12;
    const end = t + beats * beat;
    // A wooden bar (fundamental and its bright upper partials) and a reed (odd-heavy, nasal).
    this.bar ??= ctx.createPeriodicWave(Float32Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0]), Float32Array.from([0, 1, 0.05, 0, 0.38, 0, 0, 0, 0.09]));
    this.reed ??= ctx.createPeriodicWave(Float32Array.from([0, 0, 0, 0, 0, 0, 0, 0]), Float32Array.from([0, 1, 0.3, 0.6, 0.25, 0.4, 0.15, 0.2]));
    const notes = penta(62, 86);
    // ── Roneat ek: running eighths, a walk round the melody's note, a quick tremolo now and then (four bars' voices in turn) ──
    const ron = v.gain(0.42);
    ron.connect(v.out);
    const bars = [0, 1, 2, 3].map(() => {
      const o = v.osc(this.bar!, t, end + 0.9, mtof(notes[0]));
      const g = v.gain();
      o.connect(g).connect(ron);
      return { o, g };
    });
    let bar = 0;
    let idx = Math.max(2, Math.min(notes.length - 3, this.tune + 5));
    for (let k = 0; k < beats * 2; k++) {
      const s = t + k * beat * 0.5;
      idx = Math.max(0, Math.min(notes.length - 1, idx + pick(r, [-2, -1, -1, 1, 1, 2, 0])));
      const reps = r() < 0.08 ? 3 : 1;
      for (let j = 0; j < reps; j++) {
        const s2 = s + j * 0.09;
        const b = bars[bar++ % bars.length];
        b.o.frequency.setValueAtTime(mtof(notes[idx]), s2);
        strike(b.g.gain, s2, (k % 2 ? 0.6 : 0.9) * (1 - 0.2 * j), 0.002, 0.16);
      }
    }
    // ── Sralai: the melody, a note each two beats, sliding between them, a slow vibrato ──
    const reedOut = v.gain(0);
    reedOut.gain.setValueAtTime(0, t);
    reedOut.gain.linearRampToValueAtTime(0.13, t + 0.3);
    reedOut.gain.setValueAtTime(0.13, t + beats * beat - 0.3);
    reedOut.gain.linearRampToValueAtTime(0, t + beats * beat + 0.2);
    const melody = penta(62, 79);
    const reed = v.osc(this.reed, t, t + beats * beat + 0.25, mtof(melody[this.tune]));
    for (let k = 0; k < beats / 2; k++) {
      const s = t + k * beat * 2;
      this.tune = Math.max(0, Math.min(melody.length - 1, this.tune + pick(r, [-1, -1, 1, 1, 0, 2, -2])));
      const f = mtof(melody[this.tune]);
      reed.frequency.setTargetAtTime(f, s, 0.06);
      // (an ornament: a turn up to the next note and back)
      if (r() < 0.4) {
        const up = mtof(melody[Math.min(melody.length - 1, this.tune + 1)]);
        reed.frequency.setTargetAtTime(up, s + beat * 0.9, 0.03);
        reed.frequency.setTargetAtTime(f, s + beat * 1.2, 0.04);
      }
    }
    const vib = v.osc('sine', t, t + beats * beat + 0.25, 5.2);
    vib.connect(v.gain(8)).connect(reed.detune);
    reed.connect(v.filter('bandpass', 1100, 1.2)).connect(reedOut).connect(v.out);
    // ── Chhing: closed "chhap" on the strong beats, open "chhing" ringing on the weak (one noise, two bands; the ring's two partials) ──
    const hiss = v.noise('white', t, end + 0.9);
    const closed = v.gain();
    const opened = v.gain();
    hiss.connect(v.filter('bandpass', 4200, 2)).connect(closed).connect(v.out);
    hiss.connect(v.filter('bandpass', 6200, 6)).connect(opened).connect(v.out);
    const ring = [3180, 4730].map((f) => {
      const o = v.osc('sine', t, end + 1.2, f);
      const g = v.gain();
      o.connect(g).connect(v.out);
      return { o, g, f };
    });
    for (let k = 0; k < beats; k++) {
      const s = t + k * beat;
      const open = k % 2 === 1;
      strike((open ? opened : closed).gain, s, open ? 0.16 : 0.1, 0.002, open ? 0.2 : 0.018);
      if (open)
        for (const p of ring) {
          p.o.frequency.setValueAtTime(p.f * range(r, 0.995, 1.005), s);
          strike(p.g.gain, s, 0.035, 0.002, 0.3);
        }
    }
    // ── A gong of the kong vong on the phrase's first and seventh beats ──
    const gongF = mtof(melody[Math.max(0, this.tune - 2)] - 12);
    for (const [ratio, amp, tau] of [
      [1, 0.3, 0.9],
      [2.41, 0.12, 0.5],
      [4.1, 0.05, 0.25],
    ]) {
      const o = v.osc('sine', t, t + 6 * beat + tau * 6, gongF * ratio);
      const g = v.gain();
      o.connect(g).connect(v.out);
      for (const k of [0, 6]) strike(g.gain, t + k * beat, amp, 0.004, tau);
    }
    // ── Skor thom: two deep strokes at the phrase's end ──
    const s0 = t + (beats - 2) * beat;
    const skor = v.osc('sine', s0, s0 + beat + 0.8, 72);
    const sg = v.gain();
    skor.connect(sg).connect(v.out);
    const thud = v.noise('brown', s0, s0 + beat + 0.2);
    const tg = v.gain();
    thud.connect(v.filter('lowpass', 500)).connect(tg).connect(v.out);
    for (const s of [s0, s0 + beat]) {
      skor.frequency.setValueAtTime(95, s);
      skor.frequency.exponentialRampToValueAtTime(58, s + 0.25);
      strike(sg.gain, s, 0.55, 0.004, 0.18);
      strike(tg.gain, s, 0.3, 0.002, 0.04);
    }
  }
}
