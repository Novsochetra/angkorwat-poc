import { FESTIVAL_SCENE } from '../festival/_schedule';
import { biquad, cleanup, glide, mtof, noise, range, type Rng } from './dsp';
import type { SoundEngine } from './engine';
import type { Ears } from './water';

/**
 * The festivals' sound (festival/, which writes `FESTIVAL_SCENE` every
 * frame), placed where it happens and faded with distance, gentle:
 *
 * - Water Festival, by day: each rowing dragon boat's drum on every stroke
 *   (a deep barrel drum), and while it races its crew's shout on the pull
 *   ("hou!" / "hei!" in turn, a group of voices); the crowd on the beach, a
 *   murmur that swells into cheering as a heat comes in. At night, only the
 *   crowd's soft murmur.
 * - Khmer New Year: the musicians by the play field, a roneat (wooden
 *   xylophone: quick phrases on D E F♯ A B, the key of the map's own music,
 *   with the tremolo rolls it is known for) over the skor drums' slow
 *   pattern; the children's laughter now and then while they splash.
 *
 * Drums, shouts, crowd and laughter are on the ambience bus, the New Year
 * music on the music bus. Nothing is made far from them (the overview is
 * well out of reach) or while their bus is muted. The strokes are the
 * rowers' own clock (`FESTIVAL_SCENE.boats[].stroke`), mapped from the
 * page's time to the audio clock, so the drum falls on the catch.
 */

/** Peak levels close by (before the bus volume). */
const LEVEL = { drum: 0.42, shout: 0.13, murmur: 0.1, cheer: 0.085, roneat: 0.2, skor: 0.28, laugh: 0.06 };
/** Full within `near`, −4.8 dB a doubling, silent at `reach` (m). */
const REACH = { drum: [15, 480], shout: [10, 260], crowd: [20, 360], music: [8, 170], laugh: [6, 95] } as const;
/** Quieter than this: not made. */
const QUIET = 0.015;
/** Roneat: eighth notes (s), the scale (MIDI, D major pentatonic round D5). */
const EIGHTH = 0.29;
const SCALE = [69, 71, 74, 76, 78, 81, 83, 86, 88];
/** Skor: 16 eighths — (1) low "dum", (2) slap "tak". */
const SKOR = [1, 0, 0, 1, 0, 2, 0, 0, 1, 0, 1, 0, 0, 2, 0, 2];

function carry(d: number, near: number, reach: number): number {
  const k = Math.min(1, Math.max(0, 2 * (d / reach) - 1));
  return Math.min(1, (near / Math.max(d, 1e-3)) ** 0.8) * (1 - k * k * (3 - 2 * k));
}
const air = (d: number): number => Math.min(16000, Math.max(900, 16000 / (1 + d / 45) ** 0.9));
const wet = (d: number): number => 0.06 + (0.5 * d) / (d + 100);

export class FestivalSound {
  private readonly e: SoundEngine;
  private readonly ctx: BaseAudioContext;
  private readonly rnd: Rng;
  private ears: Ears = { x: 0, y: 0, z: 0, right: [1, 0, 0], forward: [0, 0, -1] };
  /** Audio clock minus the festival's page clock (s). */
  private offset = 0;
  private synced = false;
  /** Page time up to which each boat's strokes are scheduled. */
  private readonly done = [0, 0, 0, 0];
  private musicNext = -1;
  private musicStep = 0;
  private note = 4;
  private nextLaugh = -1;
  private nextSwell = -1;
  // The crowd: a murmur and a brighter cheer layer, each looping noise through a band.
  private readonly crowdOut: StereoPannerNode;
  private readonly crowdAir: BiquadFilterNode;
  private readonly murmur: GainNode;
  private readonly cheer: GainNode;
  private readonly murmurAm: GainNode;
  private readonly cheerAm: GainNode;
  private readonly crowdSend: GainNode;
  private loops: AudioBufferSourceNode[] = [];
  private idleSince = -1;
  /** The crowd's levels and place as last set (set again only when they change: no automation every frame). */
  private readonly applied = { m: -1, ch: -1, side: 9, d: -1 };

  constructor(e: SoundEngine) {
    this.e = e;
    this.ctx = e.ctx;
    this.rnd = e.rnd;
    const ctx = this.ctx;
    const gain = (v: number) => {
      const g = ctx.createGain();
      g.gain.value = v;
      return g;
    };
    this.crowdOut = ctx.createStereoPanner();
    this.crowdAir = biquad(ctx, 'lowpass', 6000, 0.5);
    this.crowdSend = gain(0.2);
    this.crowdAir.connect(this.crowdOut).connect(e.bus.ambience.dry);
    this.crowdOut.connect(this.crowdSend).connect(e.bus.ambience.wet);
    this.murmur = gain(0);
    this.murmurAm = gain(0.8);
    this.cheer = gain(0);
    this.cheerAm = gain(0.6);
    this.murmurAm.connect(this.murmur).connect(this.crowdAir);
    this.cheerAm.connect(this.cheer).connect(this.crowdAir);
  }

  /** Every frame: where the ears are; the crowd's levels. */
  update(ears: Ears): void {
    this.ears = ears;
    const s = FESTIVAL_SCENE;
    const now = this.ctx.currentTime;
    if (s.kind) {
      const off = now - s.t;
      // (the page's clock and the audio clock drift apart over hitches: follow it softly, jump when far off)
      if (!this.synced || Math.abs(off - this.offset) > 0.3) {
        this.offset = off;
        this.synced = true;
        for (let k = 0; k < 4; k++) this.done[k] = s.t;
      } else this.offset += (off - this.offset) * 0.02;
    } else this.synced = false;
    // The crowd on the beach.
    const c = s.kind === 'water' ? s.crowd : null;
    let m = 0;
    let ch = 0;
    if (c && this.e.heard('ambience')) {
      const { side, d } = this.aim(c.x, c.y, c.z);
      const g = carry(d, REACH.crowd[0], REACH.crowd[1]);
      m = LEVEL.murmur * g * (s.night > 0.5 ? 0.45 : 0.6 + 0.4 * c.cheer);
      ch = LEVEL.cheer * g * c.cheer ** 1.6;
      const a = this.applied;
      if (Math.abs(side - a.side) > 0.05 || Math.abs(d - a.d) > Math.max(2, d * 0.05)) {
        a.side = side;
        a.d = d;
        glide(this.crowdOut.pan, side * 0.75, now, 0.2);
        glide(this.crowdAir.frequency, air(d), now, 0.3);
        glide(this.crowdSend.gain, wet(d), now, 0.3);
      }
    }
    const a = this.applied;
    if (Math.abs(m - a.m) > Math.max(2e-4, a.m * 0.03) || Math.abs(ch - a.ch) > Math.max(2e-4, a.ch * 0.03)) {
      a.m = m;
      a.ch = ch;
      glide(this.murmur.gain, m, now, 0.4);
      glide(this.cheer.gain, ch, now, 0.5);
    }
    this.crowdLoops(m > 1e-4, now);
  }

  /** The murmur and cheer loops run only while heard. */
  private crowdLoops(on: boolean, now: number): void {
    if (on) {
      this.idleSince = -1;
      if (this.loops.length) return;
      for (const [dest, f, q, rate] of [
        [this.murmurAm, 650, 0.7, 0.9],
        [this.cheerAm, 1500, 1.1, 1.07],
      ] as const) {
        const src = this.ctx.createBufferSource();
        src.buffer = noise('pink');
        src.loop = true;
        src.playbackRate.value = rate;
        const bp = biquad(this.ctx, 'bandpass', f, q);
        src.connect(bp).connect(dest);
        src.start(now, this.rnd() * 4);
        src.onended = () => {
          src.disconnect();
          bp.disconnect();
        };
        this.loops.push(src);
      }
    } else if (this.loops.length) {
      if (this.idleSince < 0) this.idleSince = now;
      else if (now - this.idleSince > 6) {
        for (const l of this.loops) l.stop(now);
        this.loops = [];
        this.idleSince = -1;
      }
    }
  }

  /** Fill in the drums, shouts, music and laughter up to `until` (audio clock, s). */
  schedule(now: number, until: number): void {
    const s = FESTIVAL_SCENE;
    if (!s.kind || !this.synced) return;
    const r = this.rnd;
    if (s.kind === 'water' && this.e.heard('ambience')) {
      // The crowd breathes: its murmur and cheer rise and fall a little.
      if (this.nextSwell < now) this.nextSwell = now;
      while (this.nextSwell < until) {
        this.murmurAm.gain.setTargetAtTime(range(r, 0.6, 1), this.nextSwell, range(r, 0.2, 0.6));
        this.cheerAm.gain.setTargetAtTime(range(r, 0.3, 1), this.nextSwell, range(r, 0.15, 0.4));
        this.nextSwell += range(r, 0.25, 0.8);
      }
      const hz = s.strokeHz;
      s.boats.forEach((b, k) => {
        const to = until - this.offset;
        const from = Math.max(this.done[k], now - this.offset);
        this.done[k] = to;
        if (b.row < 0.08 || to <= from) return;
        const { side, d } = this.aim(b.x, b.y, b.z);
        const g = carry(d, REACH.drum[0], REACH.drum[1]) * (0.4 + 0.6 * b.row);
        if (g < QUIET) return;
        const seed = b.stroke - s.t * hz;
        for (let n = Math.ceil(from * hz + seed); n <= to * hz + seed; n++) {
          const at = (n - seed) / hz + this.offset;
          if (at < now) continue;
          this.drum(at, LEVEL.drum * g, side, d);
          if (b.racing) {
            const gs = carry(d, REACH.shout[0], REACH.shout[1]) * b.row;
            if (gs > QUIET) this.shout(at + 0.06, LEVEL.shout * gs, side, d, n % 2 === 0);
          }
        }
      });
    }
    if (s.kind === 'newyear') {
      const m = s.music;
      if (m && this.e.heard('music')) {
        const { side, d } = this.aim(m.x, m.y, m.z);
        const g = carry(d, REACH.music[0], REACH.music[1]);
        if (this.musicNext < now) this.musicNext = now + 0.05;
        while (this.musicNext < until) {
          if (g > QUIET) this.musicAt(this.musicNext, g, side, d);
          this.musicNext += EIGHTH * (1 + (this.musicStep % 2 ? -0.03 : 0.03));
          this.musicStep++;
        }
      }
      const p = s.play;
      if (p && this.e.heard('ambience')) {
        if (this.nextLaugh < now) this.nextLaugh = now + range(r, 1, 4);
        while (this.nextLaugh < until) {
          const { side, d } = this.aim(p.x + range(r, -5, 5), p.y + 1, p.z + range(r, -5, 5));
          const g = carry(d, REACH.laugh[0], REACH.laugh[1]);
          if (g > QUIET) this.laugh(this.nextLaugh, LEVEL.laugh * g, side, d);
          this.nextLaugh += range(r, 3, 8);
        }
      }
    }
  }

  // ── Voices ────────────────────────────────────────────────────────────────

  /** A voice's way out: level, air, pan, reverb send (returns its input). */
  private out(level: number, side: number, d: number, bus: 'ambience' | 'music', nodes: AudioNode[]): GainNode {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = level;
    const lp = biquad(ctx, 'lowpass', air(d), 0.5);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-0.85, Math.min(0.85, side * 0.85));
    const send = ctx.createGain();
    send.gain.value = wet(d);
    g.connect(lp).connect(pan).connect(this.e.bus[bus].dry);
    pan.connect(send).connect(this.e.bus[bus].wet);
    nodes.push(g, lp, pan, send);
    return g;
  }

  /** A deep barrel drum: a thump falling in pitch, the skin's slap on top. */
  private drum(t: number, level: number, side: number, d: number): void {
    const ctx = this.ctx;
    const nodes: AudioNode[] = [];
    const out = this.out(level, side, d, 'ambience', nodes);
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(118, t);
    osc.frequency.exponentialRampToValueAtTime(62, t + 0.16);
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + 0.004);
    env.gain.setTargetAtTime(0, t + 0.01, 0.13);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + 0.8);
    const src = ctx.createBufferSource();
    src.buffer = noise('white');
    const bp = biquad(ctx, 'bandpass', 900, 1.2);
    const se = ctx.createGain();
    se.gain.value = 0;
    se.gain.setValueAtTime(0.35, t);
    se.gain.setTargetAtTime(0, t + 0.002, 0.018);
    src.connect(bp).connect(se).connect(out);
    src.start(t, this.rnd() * 4);
    src.stop(t + 0.12);
    nodes.push(env, bp, se, src);
    cleanup(osc, [osc, ...nodes]);
  }

  /** The crew's shout on the pull: a few men's voices on one vowel ("hou" or "hei"), falling a little. */
  private shout(t: number, level: number, side: number, d: number, hou: boolean): void {
    const ctx = this.ctx;
    const r = this.rnd;
    const nodes: AudioNode[] = [];
    const out = this.out(level, side, d, 'ambience', nodes);
    const f1 = biquad(ctx, 'bandpass', hou ? 430 : 560, 3);
    const f2 = biquad(ctx, 'bandpass', hou ? 780 : 1750, 4);
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + 0.035);
    env.gain.setTargetAtTime(0, t + 0.09, 0.07);
    env.connect(f1).connect(out);
    env.connect(f2).connect(out);
    nodes.push(f1, f2, env);
    const len = 0.4;
    let last: OscillatorNode | null = null;
    for (let i = 0; i < 4; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const f = range(r, 125, 175);
      osc.frequency.setValueAtTime(f * 1.06, t);
      osc.frequency.exponentialRampToValueAtTime(f * 0.94, t + len);
      osc.connect(env);
      osc.start(t + range(r, 0, 0.02));
      osc.stop(t + len);
      nodes.push(osc);
      last = osc;
    }
    if (last) cleanup(last, nodes);
  }

  /** One eighth of the New Year music: the skor's pattern, the roneat's phrase. */
  private musicAt(t: number, g: number, side: number, d: number): void {
    const r = this.rnd;
    const step = this.musicStep % 16;
    const hit = SKOR[step];
    if (hit) this.skor(t, LEVEL.skor * g * (hit === 1 ? 1 : 0.7), side, d, hit === 2);
    // The roneat: notes on most eighths, a rest now and then, a random walk on the scale; a tremolo roll on a long note.
    const phrase = Math.floor(this.musicStep / 32) % 4;
    if (phrase === 3 && step >= 8) return;
    if (r() < 0.18) return;
    this.note = Math.max(0, Math.min(SCALE.length - 1, this.note + Math.round(range(r, -2.4, 2.4))));
    const m = SCALE[this.note];
    if (step % 8 === 6 && r() < 0.5) {
      // A roll: quick strikes on the note and its octave below.
      for (let i = 0; i < 6; i++) this.bar(t + i * (EIGHTH / 3), mtof(i % 2 ? m - 12 : m), LEVEL.roneat * g * (0.55 + 0.05 * i), side, d);
    } else this.bar(t, mtof(m), LEVEL.roneat * g * range(r, 0.8, 1), side, d);
  }

  /** A roneat bar struck: a woody tone and its high partial, quick to die. */
  private bar(t: number, f: number, level: number, side: number, d: number): void {
    const ctx = this.ctx;
    const nodes: AudioNode[] = [];
    const out = this.out(level, side, d, 'music', nodes);
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + 0.003);
    env.gain.setTargetAtTime(0, t + 0.005, 0.2);
    env.connect(out);
    const a = ctx.createOscillator();
    a.frequency.value = f;
    const b = ctx.createOscillator();
    b.frequency.value = f * 3.93;
    const bg = ctx.createGain();
    bg.gain.value = 0.22;
    bg.gain.setValueAtTime(0.22, t);
    bg.gain.setTargetAtTime(0, t + 0.004, 0.04);
    a.connect(env);
    b.connect(bg).connect(env);
    a.start(t);
    b.start(t);
    a.stop(t + 1.1);
    b.stop(t + 0.4);
    nodes.push(env, a, b, bg);
    cleanup(a, nodes);
  }

  /** The skor: a low "dum" or a slap on the skin. */
  private skor(t: number, level: number, side: number, d: number, slap: boolean): void {
    const ctx = this.ctx;
    const nodes: AudioNode[] = [];
    const out = this.out(level, side, d, 'music', nodes);
    if (slap) {
      const src = ctx.createBufferSource();
      src.buffer = noise('white');
      const bp = biquad(ctx, 'bandpass', 1100, 1.5);
      const env = ctx.createGain();
      env.gain.value = 0;
      env.gain.setValueAtTime(0.8, t);
      env.gain.setTargetAtTime(0, t + 0.002, 0.03);
      src.connect(bp).connect(env).connect(out);
      src.start(t, this.rnd() * 4);
      src.stop(t + 0.2);
      nodes.push(src, bp, env);
      cleanup(src, nodes);
      return;
    }
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(85, t + 0.12);
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + 0.004);
    env.gain.setTargetAtTime(0, t + 0.01, 0.16);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + 0.9);
    nodes.push(osc, env);
    cleanup(osc, nodes);
  }

  /** Children laughing: a run of "ha"s, falling, sometimes a squeal first. */
  private laugh(t: number, level: number, side: number, d: number): void {
    const ctx = this.ctx;
    const r = this.rnd;
    const nodes: AudioNode[] = [];
    const out = this.out(level, side, d, 'ambience', nodes);
    const f1 = biquad(ctx, 'bandpass', 950, 3);
    const f2 = biquad(ctx, 'bandpass', 1500, 4);
    const env = ctx.createGain();
    env.gain.value = 0;
    env.connect(f1).connect(out);
    env.connect(f2).connect(out);
    nodes.push(f1, f2, env);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const n = 3 + Math.floor(r() * 4);
    const gap = range(r, 0.12, 0.16);
    let f = range(r, 330, 420);
    let s = t;
    if (r() < 0.35) {
      osc.frequency.setValueAtTime(f * 2.2, s);
      osc.frequency.linearRampToValueAtTime(f * 3, s + 0.18);
      env.gain.setValueAtTime(0, s);
      env.gain.linearRampToValueAtTime(0.6, s + 0.03);
      env.gain.linearRampToValueAtTime(0, s + 0.2);
      s += 0.26;
    }
    for (let i = 0; i < n; i++) {
      osc.frequency.setValueAtTime(f, s);
      osc.frequency.linearRampToValueAtTime(f * 0.92, s + gap * 0.7);
      env.gain.setValueAtTime(0, s);
      env.gain.linearRampToValueAtTime(1 - i * 0.1, s + 0.015);
      env.gain.setTargetAtTime(0, s + 0.04, 0.03);
      s += gap;
      f *= 0.96;
    }
    osc.connect(env);
    osc.start(t);
    osc.stop(s + 0.2);
    nodes.push(osc);
    cleanup(osc, nodes);
  }

  /** Where a point is from the ears: left / right (−1‥1) and distance. */
  private aim(x: number, y: number, z: number): { side: number; d: number } {
    const e = this.ears;
    const dx = x - e.x;
    const dy = y - e.y;
    const dz = z - e.z;
    const d = Math.hypot(dx, dy, dz) || 1e-3;
    return { side: (dx * e.right[0] + dy * e.right[1] + dz * e.right[2]) / d, d };
  }
}
