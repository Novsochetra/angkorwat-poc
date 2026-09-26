import type { EventState } from '../events';
import { PLACES } from '../layout';
import { PAGODA } from '../village/_spots';
import { biquad, glide, mtof, noise, range, softWave, type Rng } from './dsp';
import type { SoundEngine } from './engine';
import type { Ears } from './water';

/**
 * Sounds of the temples through the day (the event clock, `src/map/events.ts`,
 * says when), each from where it is on the map, on the ambience bus:
 *
 * - dawn (`dawnChant`): the monks' morning chanting in Pali — the homage
 *   (Namo tassa…), the three refuges, the praise of the Buddha (Itipi so…)
 *   — in low voices in near-unison, a reciting tone with a gentle rise on
 *   the long syllables and a fall at the end of each line, a breath between
 *   lines; from the village pagoda and from Angkor Wat's monastery.
 *   Synthesized: a few detuned voices through one set of vowel formants
 *   that follows the syllables (all voices sing the same syllable), a hiss
 *   for s and the breathy consonants, a very soft hum under it;
 * - dusk (`duskDrum`): the pagoda's skor drum — slow deep strokes that
 *   speed up into a roll and stop, twice — then the bronze bell, struck
 *   slowly; faintly the same from Angkor Wat a few seconds later;
 * - before noon (`noonBell`): three strokes of the bell.
 *
 *   one-shots (drum, bell) ─┐
 *   chant: voices ─ formants ─ syllable envelope ─ fade ─┼─ site: air ─ level ─ pan ─ ambience bus (+ reverb, more when far)
 *
 * Every site fades with distance like the water (loud within some 20 m,
 * faint over the map from the overview) and is panned from the ears. The
 * chant's voices run only while it is on. Tuned to the music's scale
 * (D pentatonic: the reciting tone A, the phrase ends on D; the bell's
 * prime B).
 */

const aw = PLACES.find((p) => p.id === 'sanctuary')!;

export interface TempleSite {
  id: 'pagoda' | 'angkorWat';
  /** Where the sound comes from (m). */
  x: number;
  y: number;
  z: number;
  /** Loudness of the site (1 = the village pagoda), its lag after the pagoda (s), a shade of pitch (semitones). */
  gain: number;
  delay: number;
  tune: number;
}

/** The village pagoda's hall (village/_spots.ts) and Angkor Wat's monastery, in its front court. */
export const TEMPLE_SITES: readonly TempleSite[] = [
  { id: 'pagoda', x: PAGODA.x, y: PAGODA.floor + 2, z: PAGODA.z, gain: 1, delay: 0, tune: 0 },
  { id: 'angkorWat', x: aw.x, y: aw.y + 3, z: aw.z + 30, gain: 0.85, delay: 4.5, tune: -0.35 },
];

/**
 * Base levels (before the ambience volume and the distance). The drum and
 * the bell sit with the rest of the mix close by (their loudest moments at
 * 10–40 m about as loud as the jungle's), so the compressor never pulls
 * everything else down under them.
 */
const LEVEL = { chant: 1.6, hum: 0.012, hiss: 0.25, drum: 0.18, bell: 0.12 };
/** A stroke is not made when its site's distance gain is under this (too far off to be heard). */
const FAINT = 0.05;
/** Loudness with distance: [m, dB], straight lines on a log scale between them. */
const DB: readonly [number, number][] = [
  [10, 0],
  [40, -6],
  [100, -12],
  [200, -17],
  [400, -22],
  [800, -30],
];
/** How often the sites follow the ears (s). */
const EVERY = 1 / 15;
/** The chant's fade in and out (time constants, s). */
const CHANT_IN = 2.2;
const CHANT_OUT = 2.6;
/** The reciting tone's root: D2 (MIDI). */
const ROOT = 38;

function ampAt(d: number): number {
  const p = DB;
  let i = 0;
  while (i < p.length - 2 && d > p[i + 1][0]) i++;
  const k = Math.min(1.5, Math.max(-0.5, Math.log(Math.max(1, d) / p[i][0]) / Math.log(p[i + 1][0] / p[i][0])));
  return 10 ** ((p[i][1] + (p[i + 1][1] - p[i][1]) * k) / 20);
}
/** Brighter close by (air and trees take the top off far sounds). */
const airAt = (d: number): number => Math.min(16000, Math.max(700, 16000 / (1 + d / 60) ** 0.9));
/** Reverb send: far off it is mostly the valley's echo. */
const wetAt = (d: number): number => 0.14 + (0.45 * d) / (d + 150);

/** A site's output: air filter, level, pan, reverb send, following the ears. */
class Site {
  readonly input: GainNode;
  private readonly air: BiquadFilterNode;
  private readonly level: GainNode;
  private readonly pan: StereoPannerNode;
  private readonly send: GainNode;
  private readonly last = [-1, -1, -9, -1];
  /** The distance's gain now (0‥1). */
  amp = 0;

  constructor(
    e: SoundEngine,
    readonly def: TempleSite,
  ) {
    const ctx = e.ctx;
    this.input = ctx.createGain();
    this.air = biquad(ctx, 'lowpass', 4000, 0.5);
    this.level = ctx.createGain();
    this.level.gain.value = 0;
    this.pan = ctx.createStereoPanner();
    this.send = ctx.createGain();
    this.input.connect(this.air).connect(this.level).connect(this.pan).connect(e.bus.ambience.dry);
    this.pan.connect(this.send).connect(e.bus.ambience.wet);
  }

  place(e: Ears, t: number, tc: number): void {
    const s = this.def;
    const dx = s.x - e.x;
    const dy = s.y - e.y;
    const dz = s.z - e.z;
    const d = Math.hypot(dx, dy, dz) || 1e-3;
    const side = (dx * e.right[0] + dy * e.right[1] + dz * e.right[2]) / d;
    const behind = Math.max(0, -(dx * e.forward[0] + dy * e.forward[1] + dz * e.forward[2]) / d);
    this.amp = ampAt(d) * s.gain;
    const level = this.amp * (1 - 0.2 * behind);
    const cutoff = airAt(d) * (1 - 0.35 * behind);
    const pan = Math.max(-0.85, Math.min(0.85, 0.85 * side * (d / (d + 15))));
    const send = wetAt(d);
    const l = this.last;
    if (tc > 0 && Math.abs(level - l[0]) <= 0.02 * l[0] && Math.abs(cutoff / l[1] - 1) < 0.03 && Math.abs(pan - l[2]) < 0.01 && Math.abs(send - l[3]) < 0.01) return;
    l[0] = level;
    l[1] = cutoff;
    l[2] = pan;
    l[3] = send;
    glide(this.level.gain, level, t, tc && tc * 1.5);
    glide(this.air.frequency, cutoff, t, tc);
    glide(this.pan.pan, pan, t, tc);
    glide(this.send.gain, send, t, tc);
  }
}

// ── The chant ─────────────────────────────────────────────────────────────────

type Onset = 'none' | 'nasal' | 'stop' | 'asp' | 'sib' | 'liquid' | 'h';
type Vowel = 'a' | 'i' | 'u' | 'e' | 'o';
interface Syl {
  onset: Onset;
  vowel: Vowel;
  coda: 'none' | 'nasal' | 'stop';
  heavy: boolean;
}

/**
 * Daily Pali chants (syllables split with `-`, lines with `/`): the homage
 * to the Buddha (three times), the three refuges, the praise of the Buddha.
 */
const TEXTS = [
  'na-mo tas-sa bha-ga-va-to a-ra-ha-to sam-mā-sam-bud-dhas-sa / na-mo tas-sa bha-ga-va-to a-ra-ha-to sam-mā-sam-bud-dhas-sa / na-mo tas-sa bha-ga-va-to a-ra-ha-to sam-mā-sam-bud-dhas-sa',
  'bud-dhaṃ sa-ra-ṇaṃ gac-chā-mi / dham-maṃ sa-ra-ṇaṃ gac-chā-mi / saṅ-ghaṃ sa-ra-ṇaṃ gac-chā-mi',
  'i-ti-pi so bha-ga-vā a-ra-haṃ sam-mā-sam-bud-dho / vij-jā-ca-ra-ṇa-sam-pan-no su-ga-to lo-ka-vi-dū / a-nut-ta-ro pu-ri-sa-dam-ma-sā-ra-thi / sat-thā de-va-ma-nus-sā-naṃ bud-dho bha-ga-vā ti',
];

/** Vowel formants (Hz, a low male voice) and the nasal murmur (m, n). */
const FORMANTS: Record<Vowel | 'hum', [number, number, number]> = {
  a: [700, 1100, 2450],
  i: [290, 2200, 2900],
  u: [320, 850, 2250],
  e: [460, 1850, 2550],
  o: [480, 820, 2400],
  hum: [260, 1050, 2300],
};

const LONG = /[āīūeo]/;
function parseSyl(s: string): Syl {
  const m = /^([^aāiīuūeo]*)([aāiīuūeo])(.*)$/.exec(s);
  const on = m?.[1] ?? '';
  const v = m?.[2] ?? 'a';
  const co = m?.[3] ?? '';
  const onset: Onset = !on ? 'none' : /^[mnṇṅñ]/.test(on) ? 'nasal' : /^s/.test(on) ? 'sib' : /^h/.test(on) ? 'h' : /^[rlvy]/.test(on) ? 'liquid' : /h/.test(on) ? 'asp' : 'stop';
  const vowel = ({ ā: 'a', ī: 'i', ū: 'u' } as Record<string, Vowel>)[v] ?? (v as Vowel);
  const coda = !co ? 'none' : /^[mṃnṅṇ]/.test(co) ? 'nasal' : 'stop';
  return { onset, vowel, coda, heavy: LONG.test(v) || !!co };
}
/** Each text: its lines, each line its syllables. */
const PARSED: Syl[][][] = TEXTS.map((t) => t.split('/').map((line) => line.trim().split(/[\s-]+/).filter(Boolean).map(parseSyl)));

/** Voices: detune (cents) and octave (0 or −12 for the low one). */
const VOICES: [number, number][] = [
  [-13, 0],
  [-5, 0],
  [2, 0],
  [8, 0],
  [15, 0],
  [-3, -12],
];

class Chant {
  private readonly ctx: BaseAudioContext;
  private readonly rnd: Rng;
  private readonly tune: number;
  private readonly fade: GainNode;
  private readonly amp: GainNode;
  private readonly hiss: GainNode;
  private readonly sum: GainNode;
  private readonly form: BiquadFilterNode[];
  private readonly humOut: GainNode;
  private oscs: OscillatorNode[] = [];
  private hissSrc: AudioBufferSourceNode | null = null;
  private running = false;
  private stopAt = -1;
  private next = -1;
  private text = 0;
  private line = 0;

  constructor(e: SoundEngine, site: Site, textFrom: number) {
    const ctx = (this.ctx = e.ctx);
    this.rnd = e.rnd;
    this.tune = site.def.tune;
    this.text = textFrom % PARSED.length;
    const gain = (v: number) => {
      const g = ctx.createGain();
      g.gain.value = v;
      return g;
    };
    this.fade = gain(0);
    this.fade.connect(site.input);
    this.amp = gain(0);
    this.amp.connect(this.fade);
    this.sum = gain(1);
    // The vowel: three formant bands and a little of the low body.
    this.form = FORMANTS.a.map((f, k) => {
      const b = biquad(ctx, 'bandpass', f, [5, 8, 10][k]);
      this.sum.connect(b).connect(gain([1, 0.8, 0.5][k])).connect(this.amp);
      return b;
    });
    this.sum.connect(biquad(ctx, 'lowpass', 420, 0.5)).connect(gain(0.12)).connect(this.amp);
    // Breath and s: high noise.
    this.hiss = gain(0);
    this.hiss.connect(gain(LEVEL.hiss)).connect(this.fade);
    // The hum under it (root and fifth), very soft.
    this.humOut = gain(0);
    this.humOut.connect(biquad(ctx, 'lowpass', 380, 0.5)).connect(this.fade);
  }

  /** Start the voices (fading in) or let them fade out and stop. */
  want(on: boolean, now: number): void {
    if (on && !this.running) this.start(now);
    else if (!on && this.running && this.stopAt < 0) {
      glide(this.fade.gain, 0, now, CHANT_OUT);
      this.stopAt = now + CHANT_OUT * 5;
    } else if (on && this.stopAt >= 0) {
      this.stopAt = -1;
      glide(this.fade.gain, LEVEL.chant, now, CHANT_IN);
    }
    if (this.running && this.stopAt >= 0 && now > this.stopAt) this.stop(now);
  }

  private start(now: number): void {
    const ctx = this.ctx;
    this.running = true;
    this.stopAt = -1;
    const wave = softWave(ctx, 1.05, 36);
    const hum = softWave(ctx, 1.8, 8);
    for (const [cents, oct] of VOICES) {
      const o = ctx.createOscillator();
      o.setPeriodicWave(wave);
      o.frequency.value = mtof(ROOT + 7 + oct + this.tune);
      o.detune.value = cents;
      const g = ctx.createGain();
      g.gain.value = (oct ? 0.55 : 1) / VOICES.length;
      o.connect(g).connect(this.sum);
      o.start(now);
      this.oscs.push(o);
    }
    for (const m of [ROOT, ROOT + 7]) {
      const o = ctx.createOscillator();
      o.setPeriodicWave(hum);
      o.frequency.value = mtof(m + this.tune);
      o.detune.value = range(this.rnd, -4, 4);
      o.connect(this.humOut);
      o.start(now);
      this.oscs.push(o);
    }
    const src = ctx.createBufferSource();
    src.buffer = noise('white');
    src.loop = true;
    src.connect(biquad(ctx, 'highpass', 2800, 0.6)).connect(this.hiss);
    src.start(now, this.rnd() * 4);
    this.hissSrc = src;
    glide(this.fade.gain, LEVEL.chant, now, CHANT_IN);
    glide(this.humOut.gain, LEVEL.hum, now, 3);
    this.next = now + range(this.rnd, 1.5, 3);
  }

  private stop(now: number): void {
    for (const o of this.oscs) {
      o.stop(now);
      o.onended = () => o.disconnect();
    }
    this.oscs = [];
    this.hissSrc?.stop(now);
    this.hissSrc = null;
    this.running = false;
    this.stopAt = -1;
    glide(this.amp.gain, 0, now, 0);
    glide(this.hiss.gain, 0, now, 0);
  }

  /** Lines of syllables up to `until`. */
  schedule(now: number, until: number): void {
    if (!this.running || this.stopAt >= 0) return;
    if (this.next < now) this.next = now + 0.1;
    while (this.next < until) this.next = this.lineAt(this.next);
  }

  /** One line from `t`; returns when the next line starts. */
  private lineAt(t: number): number {
    const r = this.rnd;
    const text = PARSED[this.text];
    const syls = text[this.line];
    const beat = range(r, 0.2, 0.235);
    const n = syls.length;
    const amp = this.amp.gain;
    const hiss = this.hiss.gain;
    const setForm = (v: Vowel | 'hum', at: number, tc: number) => FORMANTS[v].forEach((f, k) => glide(this.form[k].frequency, f, at, tc));
    let s = t;
    syls.forEach((sy, k) => {
      const last = k === n - 1;
      const dur = beat * (sy.heavy ? 1.85 : 1) * range(r, 0.93, 1.07) * (last ? 2.8 : 1);
      // The tune: the reciting tone (A), up a step on some long syllables, down to F# then E → D at the line's end.
      const deg = last ? 2 : k === n - 2 ? 4 : sy.heavy && r() < 0.3 ? 9 : 7;
      this.oscs.forEach((o, v) => {
        if (v >= VOICES.length) return;
        const f = mtof(ROOT + deg + VOICES[v][1] + this.tune + range(r, -0.06, 0.06));
        o.frequency.setTargetAtTime(f, s, 0.03);
        if (last) o.frequency.setTargetAtTime(mtof(ROOT + VOICES[v][1] + this.tune), s + dur * 0.35, dur * 0.25);
      });
      // The consonant, then the vowel.
      let open = 0.03;
      switch (sy.onset) {
        case 'stop':
        case 'asp':
          amp.setTargetAtTime(0.04, s, 0.008);
          hiss.setTargetAtTime(sy.onset === 'asp' ? 0.35 : 0.5, s + 0.045, 0.004);
          hiss.setTargetAtTime(0, s + (sy.onset === 'asp' ? 0.09 : 0.055), 0.012);
          open = sy.onset === 'asp' ? 0.085 : 0.055;
          break;
        case 'sib':
          amp.setTargetAtTime(0.05, s, 0.01);
          hiss.setTargetAtTime(0.6, s, 0.01);
          hiss.setTargetAtTime(0, s + 0.075, 0.015);
          open = 0.08;
          break;
        case 'h':
          amp.setTargetAtTime(0.3, s, 0.01);
          hiss.setTargetAtTime(0.25, s, 0.01);
          hiss.setTargetAtTime(0, s + 0.055, 0.015);
          open = 0.06;
          break;
        case 'nasal':
          setForm('hum', s, 0.012);
          amp.setTargetAtTime(0.5, s, 0.015);
          open = 0.055;
          break;
        case 'liquid':
          amp.setTargetAtTime(0.62, s, 0.01);
          open = 0.04;
          break;
        default:
          amp.setTargetAtTime(0.7, s, 0.01);
      }
      setForm(sy.vowel, s + open, 0.02);
      amp.setTargetAtTime(1, s + open, 0.025);
      // A long syllable sinks a little as it is held.
      amp.setTargetAtTime(0.82, s + open + 0.05, dur);
      if (sy.coda === 'nasal') {
        setForm('hum', s + dur * 0.62, 0.02);
        amp.setTargetAtTime(0.55, s + dur * 0.62, 0.03);
      } else if (sy.coda === 'stop' && !last) amp.setTargetAtTime(0.08, s + dur * 0.82, 0.01);
      if (last) amp.setTargetAtTime(0, s + dur * 0.45, dur * 0.18);
      s += dur;
    });
    // A breath between lines, a longer rest between texts.
    this.line++;
    if (this.line >= text.length) {
      this.line = 0;
      this.text = (this.text + 1) % PARSED.length;
      return s + range(r, 3.5, 6);
    }
    return s + range(r, 0.9, 1.5);
  }
}

// ── The drum and the bell ───────────────────────────────────────────────────

interface Stroke {
  t: number;
  site: number;
  kind: 'drum' | 'bell';
  vel: number;
  /** A quick stroke (the roll, and the last of the speeding up): no upper modes (`drum`). */
  roll?: boolean;
}

/** The skor's membrane modes: ratio, level, decay (s). A roll's strokes play the first two (the upper ones blur under the next stroke). */
const MODES: readonly [number, number, number][] = [
  [1, 0.9, 0.55],
  [1.59, 0.5, 0.28],
  [2.14, 0.36, 0.16],
  [2.65, 0.22, 0.1],
  [3.16, 0.12, 0.07],
];
/** The stick's slap, the shell's knock and the body's thump. */
const HITS = [
  ['white', 'bandpass', 750, 0.9, 0.5, 0.022],
  ['pink', 'bandpass', 240, 1.2, 0.45, 0.09],
  ['brown', 'lowpass', 280, 0.6, 0.55, 0.11],
] as const;
/** Voices stop this many decay times after the stroke (e⁻⁵: −43 dB). */
const TAIL = 5;

export class TempleSound {
  private readonly ctx: BaseAudioContext;
  private readonly rnd: Rng;
  private readonly sites: Site[];
  private readonly chants: Chant[];
  private queue: Stroke[] = [];
  private lastPlace = -1;
  private chanting = false;
  /** Event counts already answered (−1: not yet cued). */
  private seen = { duskDrum: -1, noonBell: -1 };

  constructor(e: SoundEngine) {
    this.ctx = e.ctx;
    this.rnd = e.rnd;
    this.sites = TEMPLE_SITES.map((s) => new Site(e, s));
    this.chants = this.sites.map((s, i) => new Chant(e, s, i));
  }

  /** Where the ears are (every frame; the sites follow ~15 times a second). */
  listen(ears: Ears, immediate = false): void {
    const t = this.ctx.currentTime;
    if (!immediate && this.lastPlace >= 0 && t - this.lastPlace < EVERY) return;
    const tc = immediate || this.lastPlace < 0 ? 0 : 0.15;
    this.lastPlace = t;
    for (const s of this.sites) s.place(ears, t, tc);
  }

  /**
   * The event clock (every frame, `t` the page time): the chant while the
   * dawn's window is open, the drum and the bell when theirs begin (one that
   * began just before the sound started is still played).
   */
  cue(ev: Readonly<Pick<EventState, 'on' | 'count' | 'began'>>, t: number): void {
    this.chanting = ev.on.dawnChant;
    for (const name of ['duskDrum', 'noonBell'] as const) {
      const n = ev.count[name];
      if (n === this.seen[name]) continue;
      const fresh = this.seen[name] >= 0 || t - ev.began[name] < 20;
      this.seen[name] = n;
      if (n > 0 && fresh) {
        if (name === 'duskDrum') this.duskDrum();
        else this.noonBell();
      }
    }
  }

  /** Chant on or off (checks; `cue` does it from the events). */
  chant(on: boolean): void {
    this.chanting = on;
  }

  /** The dusk: two rounds of the skor drum speeding up to a roll, then the bell struck five times; Angkor Wat's a little later. */
  duskDrum(when = this.ctx.currentTime + 0.3): void {
    const r = this.rnd;
    this.sites.forEach((site, i) => {
      let t = when + site.def.delay + range(r, 0, 1);
      for (let round = 0; round < 2; round++) {
        let dt = range(r, 1.5, 1.8);
        while (dt > 0.12) {
          this.queue.push({ t, site: i, kind: 'drum', vel: 0.55 + 0.35 * (1 - dt / 1.8), roll: dt < 0.3 });
          t += dt;
          dt *= 0.87;
        }
        // The roll, then two strokes to stop it.
        for (let k = 0; k < 16; k++, t += 0.1) this.queue.push({ t, site: i, kind: 'drum', vel: 0.6 + 0.25 * Math.sin((k / 15) * Math.PI), roll: true });
        this.queue.push({ t: t + 0.45, site: i, kind: 'drum', vel: 1 });
        this.queue.push({ t: t + 1.35, site: i, kind: 'drum', vel: 0.9 });
        t += 1.35 + range(r, 3, 4);
      }
      for (let k = 0; k < 5; k++, t += range(r, 3.6, 4.4)) this.queue.push({ t, site: i, kind: 'bell', vel: k === 0 ? 1 : 0.85 });
    });
    this.queue.sort((a, b) => a.t - b.t);
  }

  /** Before noon: the bell three times (the pagoda, then Angkor Wat). */
  noonBell(when = this.ctx.currentTime + 0.3): void {
    this.sites.forEach((site, i) => {
      for (let k = 0; k < 3; k++) this.queue.push({ t: when + site.def.delay * 0.6 + k * 5, site: i, kind: 'bell', vel: 0.9 });
    });
    this.queue.sort((a, b) => a.t - b.t);
  }

  /** Fill in chant syllables and strokes up to `until` (audio clock, s). */
  schedule(now: number, until: number): void {
    for (const c of this.chants) {
      c.want(this.chanting, now);
      c.schedule(now, until);
    }
    while (this.queue.length && this.queue[0].t < until) {
      const s = this.queue.shift()!;
      // (late: the sound was held back, e.g. the tab was hidden)
      if (s.t < now - 0.1) continue;
      const site = this.sites[s.site];
      // (too far off to be heard: not made)
      if (site.amp < FAINT) continue;
      const t = Math.max(s.t, now);
      if (s.kind === 'drum') this.drum(site, t, s.vel, !!s.roll);
      else this.bell(site, t, s.vel);
    }
  }

  /** The ambience is muted (nothing is scheduled): the chant's voices fade and stop, the strokes due now are dropped. */
  idle(now: number): void {
    for (const c of this.chants) c.want(false, now);
    while (this.queue.length && this.queue[0].t < now) this.queue.shift();
  }

  /** One stroke of the skor: a deep membrane falling in pitch, its upper modes (not in a `roll`), the stick's slap, the shell's knock and a thump. */
  private drum(site: Site, t: number, vel: number, roll: boolean): void {
    const ctx = this.ctx;
    const r = this.rnd;
    const out = ctx.createGain();
    out.gain.value = LEVEL.drum * vel;
    out.connect(site.input);
    const nodes: AudioNode[] = [out];
    const base = (site.def.id === 'pagoda' ? 74 : 66) * range(r, 0.98, 1.02);
    let longest: AudioScheduledSourceNode | null = null;
    for (const [ratio, amp, tau] of roll ? MODES.slice(0, 2) : MODES) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(base * ratio * 1.3, t);
      o.frequency.exponentialRampToValueAtTime(base * ratio, t + 0.09);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.004);
      g.gain.setTargetAtTime(0, t + 0.004, tau);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.004 + tau * TAIL);
      nodes.push(o, g);
      if (ratio === 1) longest = o;
    }
    // The stick on the skin, the shell's knock and the body's thump (what small speakers still play).
    for (const [kind, type, f, q, amp, tau] of HITS) {
      const src = ctx.createBufferSource();
      src.buffer = noise(kind);
      const fl = biquad(ctx, type, f, q);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.003);
      g.gain.setTargetAtTime(0, t + 0.003, tau);
      src.connect(fl).connect(g).connect(out);
      src.start(t, r() * 4);
      src.stop(t + 0.003 + tau * TAIL);
      nodes.push(src, fl, g);
    }
    if (longest) (longest as AudioScheduledSourceNode).onended = () => nodes.forEach((n) => n.disconnect());
  }

  /** The bronze bell struck with a wooden beam: its hum, prime, minor third, fifth and nominal, beating slowly, a knock at the strike. */
  private bell(site: Site, t: number, vel: number): void {
    const ctx = this.ctx;
    const r = this.rnd;
    const out = ctx.createGain();
    out.gain.value = LEVEL.bell * vel;
    out.connect(site.input);
    const nodes: AudioNode[] = [out];
    // (prime B3: the hum B2, the tierce D4, the nominal B4)
    const prime = mtof(59 + site.def.tune) * range(r, 0.997, 1.003);
    let longest: OscillatorNode | null = null;
    let longestEnd = 0;
    const partials: [number, number, number, number][] = [
      // ratio, level, decay (s), beating (Hz)
      [0.5, 0.34, 6.5, 0.4],
      [1, 0.5, 4.8, 0.7],
      [1.19, 0.3, 3.4, 0.9],
      [1.5, 0.16, 2.6, 0],
      [2, 0.4, 2.8, 1.1],
      [2.52, 0.14, 1.6, 0],
      [2.67, 0.11, 1.4, 0],
      [3.02, 0.1, 1.0, 0],
      [4.1, 0.06, 0.6, 0],
      [5.43, 0.04, 0.35, 0],
    ];
    for (const [ratio, amp, tau, beat] of partials) {
      for (const k of beat ? [-0.5, 0.5] : [0]) {
        const o = ctx.createOscillator();
        o.frequency.value = prime * ratio + beat * k;
        const g = ctx.createGain();
        const a = amp * (beat ? 0.6 : 1);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(a, t + 0.006);
        g.gain.setTargetAtTime(0, t + 0.006, tau);
        o.connect(g).connect(out);
        const end = t + tau * 4.5;
        o.start(t);
        o.stop(end);
        nodes.push(o, g);
        if (end > longestEnd) {
          longestEnd = end;
          longest = o;
        }
      }
    }
    // The knock of the wooden beam.
    const src = ctx.createBufferSource();
    src.buffer = noise('white');
    const bp = biquad(ctx, 'bandpass', 1500, 1.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.28, t + 0.002);
    g.gain.setTargetAtTime(0, t + 0.002, 0.014);
    src.connect(bp).connect(g).connect(out);
    src.start(t, r() * 4);
    src.stop(t + 0.15);
    nodes.push(src, bp, g);
    if (longest) (longest as OscillatorNode).onended = () => nodes.forEach((n) => n.disconnect());
  }
}
