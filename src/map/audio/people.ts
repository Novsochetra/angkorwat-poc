import type { AnimalCall, AnimalCallKind, PeopleCallKind } from '../types';
import { clamp01, mtof, pick, range, strike } from './dsp';
import type { BusName, SoundEngine } from './engine';
import { KITE_SIZE, KiteVoice } from './kite';
import { bikeBell, bubble, chop, cowBell, crackle, knock, laugh, MotoVoice, sizzle, splashPlay, type Placing } from './life';
import { chatter, clip, talkReady, type ClipKind } from './speech';
import { line, Voice } from './voice';
import type { Ears } from './water';

/**
 * The people's sounds on the map (people/ and hamlet/: they push them into
 * `f.calls` like the animals; the engine hands the `PeopleCallKind`s here),
 * each made fresh and placed where it happens, like the animal calls
 * (audio/animals.ts: softer and duller far off, panned, a little late, more
 * of the valley's echo):
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
 *   is a few voices struck again and again (~40 nodes), not one a note;
 * - `kiteHum`: a khleng ek's song (kite.ts `KiteVoice`: a lasting voice
 *   per kite, stepping through its notes with the "miaow" rise and sag;
 *   `size` the kite's, m: bigger is lower and steadier); push one per kite
 *   every 3–5 s while it flies and is near: each keeps it singing 6 s more.
 *   Five kites at once, a chorus; carries some 250 m;
 * - `market`: a knot of people talking (at the market, at a picnic),
 *   2.5–4 s of speech.ts's `chatter`; `gain` how busy (the market's crowd
 *   all round is its bed's: hamlets.ts);
 * - `vendorCall`: a seller calling out her goods, sing-song (speech.ts);
 * - `chop`, `sizzle`, `bubble`, `crackle`, `knock`, `bikeBell`, `moto`,
 *   `cowBell`, `splashPlay`: the village's work and play (life.ts: a knife
 *   or a machete — high over the ears, the tapper's knife in a palm's
 *   flower stalk —, a wok, palm syrup boiling, a wood fire, bamboo tubes and
 *   the ladder, a bicycle's bell, a moto — a lasting voice that follows its
 *   calls: push one every ~2–3 s as it rides (its speed and Doppler come
 *   from how far it went), it dies away 3.5 s after the last —, the wooden
 *   cattle bell, children splashing and laughing in the water: `gain` ≥ 0.7
 *   a jump landing, less a splash fight). The wok, the syrup and the fire
 *   are phrases of 3–5 s that fade in and out: push one every ~3 s while it
 *   goes on, they overlap into one sound;
 * - `hello`: an adult's soft "ជម្រាបសួរ" with the sampeah, `kidHello`: a
 *   child's bright "សួស្ដី!" (speech.ts), when they greet the explorer back
 *   (`size`, if sent, the speaker's height in m: a woman's voice under
 *   1.63 m, a man's over; the smallest child's under 1.2 m).
 *
 * The pinpeat is on the Music bus (its slider), the rest on Ambience.
 * Levels are gentle: under the animals' calls close by, the laughter
 * carries less than a hornbill, a greeting is heard across a yard. At most
 * eight at once, two of a kind; and five kites and two motos.
 */

/** Each sound: its peak level close by, full within `near` m, silent past `reach` m; its bus; how many may play at once (2). */
const SOUNDS: Record<PeopleCallKind, { level: number; near: number; reach: number; bus: BusName; max?: number }> = {
  oxBell: { level: 0.09, near: 6, reach: 70, bus: 'ambience' },
  cartCreak: { level: 0.35, near: 5, reach: 45, bus: 'ambience' },
  netSplash: { level: 0.3, near: 8, reach: 110, bus: 'ambience' },
  laugh: { level: 0.14, near: 10, reach: 150, bus: 'ambience' },
  pinpeat: { level: 0.55, near: 16, reach: 190, bus: 'music' },
  kiteHum: { level: 0.055, near: 20, reach: 250, bus: 'ambience' },
  market: { level: 0.14, near: 12, reach: 120, bus: 'ambience' },
  vendorCall: { level: 0.2, near: 8, reach: 100, bus: 'ambience' },
  chop: { level: 0.11, near: 4, reach: 50, bus: 'ambience' },
  sizzle: { level: 0.045, near: 4, reach: 40, bus: 'ambience' },
  bubble: { level: 0.05, near: 3, reach: 30, bus: 'ambience' },
  crackle: { level: 0.07, near: 4, reach: 45, bus: 'ambience' },
  knock: { level: 0.07, near: 5, reach: 70, bus: 'ambience' },
  bikeBell: { level: 0.03, near: 6, reach: 80, bus: 'ambience', max: 1 },
  moto: { level: 0.12, near: 10, reach: 140, bus: 'ambience' },
  hello: { level: 0.125, near: 5, reach: 40, bus: 'ambience' },
  kidHello: { level: 0.2, near: 6, reach: 60, bus: 'ambience' },
  cowBell: { level: 0.1, near: 6, reach: 70, bus: 'ambience' },
  splashPlay: { level: 0.2, near: 8, reach: 90, bus: 'ambience' },
};
/** Seconds of one pinpeat phrase (12 beats of 0.6 s); the map's music stays back this long after one begins, and a little more (the next comes as it ends). */
const PHRASE = 7.2;
const PHRASE_HOLD = 2;
const KINDS = new Set<AnimalCallKind>(Object.keys(SOUNDS) as PeopleCallKind[]);

/** Is this call one of the people's (made here, not by the animals' voices)? */
export function isPeopleCall(k: AnimalCallKind): k is PeopleCallKind {
  return KINDS.has(k);
}

const MAX = 8;
const MAX_KIND = 2;
/** The synthesized voices (speech.ts). */
const VOICES: ReadonlySet<PeopleCallKind> = new Set<PeopleCallKind>(['vendorCall', 'hello', 'kidHello', 'market']);
/** Motos at once; a moto call within this far (m) of where one is now is that one; with no call this long (s) it dies away. */
const MOTOS = 2;
const MOTO_SAME = 40;
const MOTO_QUIET = 3.5;
/** Kites singing at once; a kite call of the same `size` within this far (m) of one is that one. */
const KITES = 5;
const KITE_SAME = 30;
/** How often the lasting voices (motos, kites) follow the ears (s). */
const LASTING_EVERY = 1 / 15;
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

/** Pentatonic notes of the map's music (D E F# A B), as MIDI numbers in a range. */
function penta(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if ([2, 4, 6, 9, 11].includes(m % 12)) out.push(m);
  return out;
}

export class PeopleSound {
  private ears: Ears | null = null;
  /** The lasting voices: the motos on the move (`MotoVoice`), the kites singing (`KiteVoice`), and when they last followed the ears. */
  private motos: MotoVoice[] = [];
  private kites: KiteVoice[] = [];
  private lastingAt = -1;
  private readonly playing: { kind: PeopleCallKind; end: number }[] = [];
  private bar: PeriodicWave | null = null;
  private reed: PeriodicWave | null = null;
  /** Where the pinpeat's melody is (it carries on from phrase to phrase). */
  private tune = 4;

  constructor(private readonly e: SoundEngine) {}

  listen(ears: Ears): void {
    this.ears = ears;
    if (!this.motos.length && !this.kites.length) return;
    const now = this.e.ctx.currentTime;
    if (now - this.lastingAt < LASTING_EVERY) return;
    this.lastingAt = now;
    if (!this.e.heard('ambience')) {
      for (const m of this.motos) m.stop(now);
      for (const k of this.kites) k.stop(now);
      this.motos = [];
      this.kites = [];
      return;
    }
    for (const m of this.motos) m.update(now, this.placeMoto, MOTO_QUIET);
    for (const k of this.kites) k.update(now, this.placeKite);
    this.motos = this.motos.filter((m) => !m.done);
    this.kites = this.kites.filter((k) => !k.done);
  }

  /** Where a lasting voice of `kind` is from the ears: its level (`SOUNDS`), air, pan, reverb send. */
  private placing(kind: 'moto' | 'kiteHum'): Placing {
    const spec = SOUNDS[kind];
    return (x, y, z, gain) => {
      const ears = this.ears!;
      const rx = x - ears.x;
      const ry = y - ears.y;
      const rz = z - ears.z;
      const d = Math.hypot(rx, ry, rz) || 1e-3;
      const side = (rx * ears.right[0] + ry * ears.right[1] + rz * ears.right[2]) / d;
      const behind = Math.max(0, -(rx * ears.forward[0] + ry * ears.forward[1] + rz * ears.forward[2]) / d);
      return { level: spec.level * clamp01(gain) * carry(d, spec.near, spec.reach) * (1 - 0.3 * behind), air: air(d) * (1 - 0.4 * behind), pan: Math.max(-0.8, Math.min(0.8, 0.8 * side)), wet: wetOf(d), d, rx, ry, rz };
    };
  }
  private readonly placeMoto = this.placing('moto');
  private readonly placeKite = this.placing('kiteHum');

  /** A kite's call: the kite it comes from sings on (or one starts, if there is room and it would be heard). */
  private kite(c: AnimalCall, now: number, d: number): void {
    const size = c.size ?? KITE_SIZE;
    for (const k of this.kites) if (!k.fading && Math.abs(k.size - size) < 0.02 && Math.hypot(c.x - k.x, c.z - k.z) < KITE_SAME) return k.call(c, now);
    const spec = SOUNDS.kiteHum;
    if (this.kites.filter((k) => !k.fading).length >= KITES || clamp01(c.gain) * carry(d, spec.near, spec.reach) < QUIET) return;
    const bus = this.e.bus[spec.bus];
    const k = new KiteVoice(this.e.ctx, this.e.rnd, c, now + LEAD, bus.dry, bus.wet);
    k.update(now, this.placeKite);
    this.kites.push(k);
  }

  /** A moto's call: the moto it comes from goes on (or one starts, if there is room and it would be heard). */
  private moto(c: AnimalCall, now: number, d: number): void {
    for (const m of this.motos) {
      if (m.fading) continue;
      const [x, , z] = m.at(now);
      if (Math.hypot(c.x - x, c.z - z) < MOTO_SAME) return m.call(c, now);
    }
    const spec = SOUNDS.moto;
    if (this.motos.filter((m) => !m.fading).length >= MOTOS || clamp01(c.gain) * carry(d, spec.near, spec.reach) < QUIET) return;
    const bus = this.e.bus[spec.bus];
    const m = new MotoVoice(this.e.ctx, this.e.rnd, c, now, bus.dry, bus.wet);
    m.update(now, this.placeMoto, MOTO_QUIET);
    this.motos.push(m);
  }

  /** A sound at its place, from `now` (audio clock); dropped when too many play, its bus is muted, or it would not be heard. */
  call(c: AnimalCall, now: number): void {
    const ears = this.ears;
    if (!ears || !isPeopleCall(c.kind)) return;
    const kind = c.kind;
    const spec = SOUNDS[kind];
    if (spec.level <= 0 || !this.e.heard(spec.bus)) return;
    // (a moto and a kite are lasting voices that follow their calls)
    if (kind === 'moto') return this.moto(c, now, Math.hypot(c.x - ears.x, c.y - ears.y, c.z - ears.z));
    if (kind === 'kiteHum') return this.kite(c, now, Math.hypot(c.x - ears.x, c.y - ears.y, c.z - ears.z));
    // (the talk is not made yet: skipped, not made in a frame)
    if (kind === 'market' && !talkReady()) return;
    const playing = this.playing;
    for (let i = playing.length - 1; i >= 0; i--) if (playing[i].end <= now) playing.splice(i, 1);
    let same = 0;
    for (const p of playing) if (p.kind === kind) same++;
    if (playing.length >= MAX || same >= (spec.max ?? MAX_KIND)) return;
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
      this.make(kind, v, t, c);
      const bus = this.e.bus[spec.bus];
      const lv = v.gain(spec.level * k);
      const lp = v.filter('lowpass', air(d) * (1 - 0.4 * behind), 0.5);
      const pan = v.keep(ctx.createStereoPanner());
      pan.pan.value = Math.max(-0.8, Math.min(0.8, 0.8 * side));
      v.out.connect(lv).connect(lp).connect(pan).connect(bus.dry);
      // (the pinpeat and the voices a little more in the valley's echo: a voice sits in its place, not at the ear)
      pan.connect(v.gain(wetOf(d) * (kind === 'pinpeat' ? 1.4 : 1) + (VOICES.has(kind) ? 0.12 : 0))).connect(bus.wet);
      v.play();
    } catch (err) {
      v.drop();
      throw err;
    }
    playing.push({ kind, end: v.end });
    // By the dancers the pinpeat leads: the map's music steps back by how loud the pinpeat is here (nothing far off).
    if (kind === 'pinpeat') this.e.yieldMusic(k, now, t + PHRASE + PHRASE_HOLD);
  }

  /** The sound of `kind` into `v` from `t`. */
  private make(kind: PeopleCallKind, v: Voice, t: number, c: AnimalCall): void {
    switch (kind) {
      case 'oxBell':
        return this.bell(v, t, c.gain);
      case 'cartCreak':
        return this.creak(v, t);
      case 'netSplash':
        return this.splash(v, t);
      case 'laugh':
        return void laugh(v, t);
      case 'pinpeat':
        return this.pinpeat(v, t);
      case 'market':
        return this.talk(v, t);
      case 'vendorCall':
        return this.say(v, t, 'vendor');
      case 'hello':
        // (the greeter's height, if sent: a woman's voice under 1.63 m, a man's over)
        return this.say(v, t, 'hello', c.size === undefined ? undefined : c.size < 1.63 ? [0, 2] : [1, 3]);
      case 'kidHello':
        return this.say(v, t, 'kidHello', c.size === undefined ? undefined : c.size < 1.2 ? [2] : [0, 1]);
      case 'chop':
        // (high over the ears: up a sugar palm, the tapper's knife in the flower stalk)
        return void chop(v, t, !!this.ears && c.y - this.ears.y > 3.5);
      case 'sizzle':
        return void sizzle(v, t);
      case 'bubble':
        return void bubble(v, t);
      case 'crackle':
        return void crackle(v, t);
      case 'knock':
        return void knock(v, t);
      case 'bikeBell':
        return void bikeBell(v, t);
      case 'cowBell':
        return void cowBell(v, t);
      case 'splashPlay':
        // (a strong call: a jump landing; a softer one: a splash fight)
        return void splashPlay(v, t, c.gain >= 0.7);
    }
  }

  // ── The sounds ──

  /** A voice saying its clip (a greeting, a seller's call): one of its voices (among `from`), a shade higher or lower each time. */
  private say(v: Voice, t: number, kind: ClipKind, from?: readonly number[]): void {
    const buf = clip(kind, v.r, from);
    const rate = range(v.r, 0.96, 1.04);
    // (its top softened: a voice from across the yard, not a synthesizer's edge)
    v.buffer(buf, t, t + buf.duration / rate + 0.02, 0, false, rate).connect(v.filter('lowpass', 5500, 0.6)).connect(v.out);
  }

  /** A knot of people talking (the market's, a picnic's): a stretch of the chatter, fading in and out (`gain`, how busy, sets its level; the market's crowd is its bed's, hamlets.ts). */
  private talk(v: Voice, t: number): void {
    const r = v.r;
    const dur = range(r, 2.5, 4);
    const env = v.gain(0);
    line(env.gain, t, [
      [0, 0],
      [0.5, 1],
      [dur - 0.7, 1],
      [dur, 0],
    ]);
    const near = chatter();
    v.buffer(near, t, t + dur, r() * near.duration, true, range(r, 0.95, 1.05)).connect(env);
    env.connect(v.out);
  }


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
