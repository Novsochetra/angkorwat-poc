import { NYE_TIMES, nyeSeconds, showSoon } from '../nye/clock';
import { RING, GROUND } from '../nye/plan';
import { burstAt, CROSS_POP, rocketsBetween, showScript, type BurstKind, type Rocket } from '../nye/show';
import { biquad, cleanup, glide, mulberry32, noise, range } from './dsp';
import type { SoundEngine } from './engine';
import { shout, warmShouts } from './speech';
import type { Ears } from './water';

/**
 * New Year's Eve's fireworks, heard (AWP-35): played from the show's script (nye/show.ts `showScript`) on the real
 * clock (nye/clock.ts `nyeSeconds`), so what is heard matches what is seen on every device — on its own bus,
 * `fireworks` (the Sound settings' Fireworks slider, under "Around you"). Synthesized like the rest (no files):
 *
 * - **the launch**: each rocket's whoosh as it climbs (a band of noise sweeping up), some a whistle (a sine gliding
 *   up, a little vibrato), from where it leaves the slope;
 * - **the burst**: a boom where it bursts, *heard late by its distance* (343 m/s: the flash first, the boom after),
 *   deeper and longer for big, high bursts (a falling thump, the crack of the charge, the valley's echo: more of
 *   the reverb far away), darker far off (the air takes the top);
 * - **crackles** for the crackle bursts (dozens of tiny snaps over a second) and for a crossette's stars popping
 *   late in their life, the **sizzle** of the gold willows', palms' and the signature's long trails (a short one for
 *   the chrysanthemums), a comet's hiss as it climbs with its glittering tail (its pop at the top a small boom);
 * - **the crowd** on the festival square (at the ring, plan.ts `RING`): a murmur rising through the last ten seconds,
 *   the count shouted in Khmer (ដប់ … មួយ: speech.ts `shout`), "សួស្តីឆ្នាំថ្មី!" and a roar at midnight, a cheer
 *   again as the finale ends.
 *
 * Every sound is placed (panned by where it is from the ears: audio.ts's, the explorer's head while roaming, else
 * the camera) and quieter far away; too quiet is not made. Nothing runs far from the show: a look at the clock once
 * a second; from 10 minutes before midnight the shouts are made ahead in idle slices (`warmShouts`).
 *
 * `planSounds` is the scheduling alone (no Web Audio): what is heard when, for a span of show time; checks can call
 * it in node (see the bottom of this file).
 */

/** The speed of sound (m/s). */
export const SOUND_SPEED = 343;
/** The sound's span begins (s before midnight: the crowd's murmur, then the count's first shout). */
const FROM = -10.6;
/** After the show's end, the last booms and the cheer (s). */
const TAIL = 14;
/** A rocket's longest rise plus the longest delay over the map (s): how far back to look for what is still to be heard. */
const LOOK_BACK = 12;
/** Peak levels close by (before the bus volume). */
const LEVEL = { boom: 0.62, crack: 0.3, launch: 0.07, whistle: 0.045, crackle: 0.16, sizzle: 0.05, shout: 0.34, murmur: 0.08, roar: 0.14 };
/** Full within `near`, −4.8 dB a doubling, silent at `reach` (m). */
const REACH = { boom: [90, 3200], launch: [30, 900], crackle: [60, 1700], sizzle: [50, 1000], crowd: [25, 800] } as const;
/** A sound this late (s: the page hitched past the look ahead) is still played, at once. */
const LATE = 0.4;
/** Quieter than this: not made. */
const QUIET = 0.012;
/** At most this many voices in one look ahead (the finale: the quietest wait out). */
const MAX_VOICES = 28;

function carry(d: number, near: number, reach: number): number {
  const k = Math.min(1, Math.max(0, 2 * (d / reach) - 1));
  return Math.min(1, (near / Math.max(d, 1e-3)) ** 0.8) * (1 - k * k * (3 - 2 * k));
}
/** The air's top over a distance (Hz). */
const air = (d: number): number => Math.min(16000, Math.max(500, 16000 / (1 + d / 60) ** 0.95));
/** The echo off the land: more of it far away. */
const wet = (d: number): number => 0.1 + (0.6 * d) / (d + 250);

/** One sound to be heard: when (show s), what, where from, how loud (its distance's carry: 0‥1). */
export interface PlannedSound {
  at: number;
  kind: 'launch' | 'whistle' | 'boom' | 'crackle' | 'sizzle' | 'shout' | 'roar' | 'murmur';
  /** The rocket (an index into `showScript()`), or the shout's number (10‥1; 0 the greeting), or −1. */
  i: number;
  x: number;
  y: number;
  z: number;
  /** Distance from the ears (m). */
  d: number;
  /** Its carry (before its kind's level). */
  g: number;
}

/** How long a burst's trails sizzle (s; none for the rest). */
const SIZZLE: Partial<Record<BurstKind, number>> = { willow: 3.2, palm: 2.4, angkor: 3.6, chrysanthemum: 1.1 };
/** A sizzle's loudness by kind (a willow's 1). */
const SIZZLE_LEVEL: Partial<Record<BurstKind, number>> = { willow: 1, palm: 1, angkor: 1.1, chrysanthemum: 0.6, comet: 0.7 };

const pool: PlannedSound[] = [];
const idx: number[] = [];

/**
 * What is heard in the show time [t0, t1) (s after midnight) at the ears: each rocket's launch and burst (heard late by
 * their distances), crackles and sizzles, the crowd's count, greeting and cheers. Into `out` (its objects reused), in
 * no set order.
 */
export function planSounds(t0: number, t1: number, ears: Pick<Ears, 'x' | 'y' | 'z'>, out: PlannedSound[]): PlannedSound[] {
  out.length = 0;
  const add = (at: number, kind: PlannedSound['kind'], i: number, x: number, y: number, z: number, d: number, g: number) => {
    if (g < QUIET || at < t0 || at >= t1) return;
    const p = (pool[out.length] ??= { at: 0, kind: 'boom', i: 0, x: 0, y: 0, z: 0, d: 0, g: 0 });
    p.at = at;
    p.kind = kind;
    p.i = i;
    p.x = x;
    p.y = y;
    p.z = z;
    p.d = d;
    p.g = g;
    out.push(p);
  };
  const dist = (x: number, y: number, z: number) => Math.hypot(x - ears.x, y - ears.y, z - ears.z);
  // The crowd on the square: the count, midnight's greeting and roar, the cheer as the finale ends.
  const cy = GROUND + 1.6;
  const dc = dist(RING.x, cy, RING.z);
  const gc = carry(dc, REACH.crowd[0], REACH.crowd[1]);
  const late = dc / SOUND_SPEED;
  add(-10.6 + late, 'murmur', -1, RING.x, cy, RING.z, dc, gc);
  for (let n = 10; n >= 1; n--) add(-n + late, 'shout', n, RING.x, cy, RING.z, dc, gc);
  add(0.15 + late, 'shout', 0, RING.x, cy, RING.z, dc, gc);
  add(0 + late, 'roar', 0, RING.x, cy, RING.z, dc, gc);
  add(NYE_TIMES.show - 6 + late, 'roar', 1, RING.x, cy, RING.z, dc, gc);
  // The rockets: launched in [t0 − LOOK_BACK, t1), heard in [t0, t1).
  const s = showScript();
  rocketsBetween(t0 - LOOK_BACK, t1, idx);
  for (const i of idx) {
    const r = s[i];
    const dl = dist(r.x, r.y, r.z);
    const gl = carry(dl, REACH.launch[0], REACH.launch[1]);
    add(r.t + dl / SOUND_SPEED, (r.seed & 3) === 0 ? 'whistle' : 'launch', i, r.x, r.y, r.z, dl, gl);
    const db = dist(r.bx, r.by, r.bz);
    const at = burstAt(r) + db / SOUND_SPEED;
    add(at, 'boom', i, r.bx, r.by, r.bz, db, carry(db, REACH.boom[0], REACH.boom[1]) * Math.min(1.4, (r.size / 30) ** 0.6));
    if (r.kind === 'crackle') add(at + 0.35, 'crackle', i, r.bx, r.by, r.bz, db, carry(db, REACH.crackle[0], REACH.crackle[1]));
    else if (SIZZLE[r.kind]) add(at + 0.2, 'sizzle', i, r.bx, r.by, r.bz, db, carry(db, REACH.sizzle[0], REACH.sizzle[1]));
    // (a crossette: its stars crackle as they pop; a comet hisses all the way up, from the middle of its climb)
    if (r.cross) add(at + (CROSS_POP[r.kind] ?? 1.5), 'crackle', i, r.bx, r.by, r.bz, db, carry(db, REACH.crackle[0], REACH.crackle[1]) * 0.8);
    if (r.kind === 'comet') {
      const mx = (r.x + r.bx) / 2;
      const my = (r.y + r.by) / 2;
      const mz = (r.z + r.bz) / 2;
      const dm = dist(mx, my, mz);
      add(r.t + 0.1 + dm / SOUND_SPEED, 'sizzle', i, mx, my, mz, dm, carry(dm, REACH.sizzle[0], REACH.sizzle[1]));
    }
  }
  return out;
}

/** The show is within its sound's span at show time `s` (s after midnight). */
export const heardSpan = (s: number): boolean => s >= FROM - 3 && s < NYE_TIMES.show + TAIL;

export class FireworksSound {
  private readonly e: SoundEngine;
  private readonly ctx: BaseAudioContext;
  private ears: Ears = { x: 0, y: 0, z: 0, right: [1, 0, 0], forward: [0, 0, -1] };
  /** Audio clock minus show time (s), followed softly; null: not following (no show near). */
  private offset: number | null = null;
  /** Show time up to which sounds are scheduled. */
  private done = -Infinity;
  /** The once-a-second look (page time, ms) and what it found. */
  private lookedAt = -Infinity;
  private active = false;
  private warm = false;
  private readonly planned: PlannedSound[] = [];
  /** Sounds made so far by kind, and dropped in a busy look ahead (checks: `audio.debug().fireworks`). */
  readonly played: Record<string, number> = {};
  private readonly rnd = mulberry32(0x2027);
  // The crowd's lasting roar: two bands of noise under one gain, placed at the square.
  private crowd: { out: GainNode; pan: StereoPannerNode; lp: BiquadFilterNode; send: GainNode; loops: AudioBufferSourceNode[] } | null = null;

  constructor(e: SoundEngine) {
    this.e = e;
    this.ctx = e.ctx;
  }

  /** Every frame: where the ears are; the clock followed (once a second far from the show: nothing else). */
  update(ears: Ears): void {
    this.ears = ears;
    const now = performance.now();
    if (now - this.lookedAt > 1000) {
      this.lookedAt = now;
      const s = nyeSeconds();
      this.active = heardSpan(s);
      // (the shouts made ahead, in slices, from 10 minutes before)
      this.warm = !this.active && showSoon(600) && s < 0;
      if (!this.active) {
        this.offset = null;
        this.stopCrowd();
      }
    }
    if (this.warm) {
      const end = performance.now() + 3;
      if (warmShouts(() => end - performance.now())) this.warm = false;
    }
    if (!this.active) return;
    const off = this.ctx.currentTime - nyeSeconds();
    // (the page's clock and the audio clock drift apart: follow softly, jump when far off — joining, a hidden tab)
    // (what is scheduled already stays: `done` is show time, so a jump never plays a sound twice)
    if (this.offset === null || Math.abs(off - this.offset) > 0.25) {
      if (this.offset === null) this.done = nyeSeconds();
      this.offset = off;
    } else this.offset += (off - this.offset) * 0.02;
  }

  /** Fill in what is heard up to `until` (audio clock, s). */
  schedule(now: number, until: number): void {
    if (!this.active || this.offset === null || !this.e.heard('fireworks')) return;
    // (a hitch longer than the look ahead: what fell in it is played now if only just late, else let go)
    const t0 = Math.max(this.done, now - this.offset - LATE);
    const t1 = until - this.offset;
    if (t1 <= t0) return;
    this.done = t1;
    // (the roar follows the ears, a few times a second)
    if (this.crowd) this.placeCrowd();
    const list = planSounds(t0, t1, this.ears, this.planned);
    // (the finale: the loudest first, the quietest wait out past `MAX_VOICES`)
    if (list.length > MAX_VOICES) {
      this.played.dropped = (this.played.dropped ?? 0) + list.length - MAX_VOICES;
      list.sort((a, b) => b.g - a.g).length = MAX_VOICES;
    }
    const s = showScript();
    for (const p of list) {
      const at = Math.max(now, p.at + this.offset);
      const { side } = this.aim(p.x, p.y, p.z);
      this.played[p.kind] = (this.played[p.kind] ?? 0) + 1;
      try {
        this.play(p, p.i >= 0 && p.kind !== 'shout' && p.kind !== 'roar' ? s[p.i] : null, at, side);
      } catch (e) {
        console.warn('[map] fireworks sound failed:', e);
      }
    }
  }

  private play(p: PlannedSound, r: Rocket | null, at: number, side: number): void {
    switch (p.kind) {
      case 'launch':
        if (r) this.whoosh(at, r.rise, LEVEL.launch * p.g, side, p.d);
        return;
      case 'whistle':
        if (r) this.whistle(at, r.rise, LEVEL.whistle * p.g, side, p.d, r.seed);
        return;
      case 'boom':
        if (r) this.boom(at, LEVEL.boom * p.g, side, p.d, r);
        return;
      case 'crackle':
        if (r) this.crackle(at, LEVEL.crackle * p.g, side, p.d, r.seed);
        return;
      case 'sizzle':
        // (a comet's: its climb; a burst's: its trails)
        if (r) this.sizzle(at, LEVEL.sizzle * p.g * (SIZZLE_LEVEL[r.kind] ?? 0.6), side, p.d, r.kind === 'comet' ? r.rise * 0.45 : (SIZZLE[r.kind] ?? 1.1));
        return;
      case 'shout':
        this.shoutAt(at, p.i, LEVEL.shout * p.g * (p.i === 0 ? 1.15 : 0.75 + 0.025 * (10 - p.i)), side, p.d);
        return;
      case 'murmur':
        this.crowdLevel(at, LEVEL.murmur * p.g, 10.6, 1.5);
        return;
      case 'roar':
        // (midnight: up at once, falling over half a minute; the finale's end: a shorter cheer)
        this.crowdLevel(at, LEVEL.roar * p.g, p.i === 0 ? 0.12 : 0.6, p.i === 0 ? 9 : 4);
        return;
    }
  }

  // ── Voices ────────────────────────────────────────────────────────────────

  /** A voice's way out on the fireworks bus: level, air, pan, the echo's send (returns its input). */
  private out(level: number, side: number, d: number, nodes: AudioNode[]): GainNode {
    const ctx = this.ctx;
    const bus = this.e.bus.fireworks;
    const g = ctx.createGain();
    g.gain.value = level;
    const lp = biquad(ctx, 'lowpass', air(d), 0.5);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-0.9, Math.min(0.9, side * 0.9));
    const send = ctx.createGain();
    send.gain.value = wet(d);
    g.connect(lp).connect(pan).connect(bus.dry);
    pan.connect(send).connect(bus.wet);
    nodes.push(g, lp, pan, send);
    return g;
  }

  /** The climb: a band of noise sweeping up as it goes, fading as it gets high. */
  private whoosh(t: number, rise: number, level: number, side: number, d: number): void {
    const ctx = this.ctx;
    const nodes: AudioNode[] = [];
    const out = this.out(level, side, d, nodes);
    const src = ctx.createBufferSource();
    src.buffer = noise('pink');
    const bp = biquad(ctx, 'bandpass', 500, 1.4);
    bp.frequency.setValueAtTime(420, t);
    bp.frequency.exponentialRampToValueAtTime(2200, t + rise * 0.7);
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + 0.06);
    env.gain.setTargetAtTime(0, t + 0.15, rise * 0.25);
    src.connect(bp).connect(env).connect(out);
    src.start(t, this.rnd() * 4);
    src.stop(t + rise + 0.3);
    nodes.push(src, bp, env);
    cleanup(src, nodes);
  }

  /** A whistling rocket: a tone gliding up as it climbs, with a little wobble. */
  private whistle(t: number, rise: number, level: number, side: number, d: number, seed: number): void {
    const ctx = this.ctx;
    const nodes: AudioNode[] = [];
    const out = this.out(level, side, d, nodes);
    const osc = ctx.createOscillator();
    const f0 = 900 + (seed % 400);
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f0 * 2.8, t + rise * 0.9);
    const vib = ctx.createOscillator();
    vib.frequency.value = 9 + (seed % 5);
    const vg = ctx.createGain();
    vg.gain.value = 18;
    vib.connect(vg).connect(osc.frequency);
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + 0.12);
    env.gain.setValueAtTime(1, t + rise * 0.75);
    env.gain.linearRampToValueAtTime(0, t + rise * 0.95);
    osc.connect(env).connect(out);
    osc.start(t);
    vib.start(t);
    osc.stop(t + rise);
    vib.stop(t + rise);
    nodes.push(osc, vib, vg, env);
    cleanup(osc, nodes);
  }

  /** The burst: a thump falling in pitch (deeper and longer for a big, high one), the crack of the charge on top. */
  private boom(t: number, level: number, side: number, d: number, r: Rocket): void {
    const ctx = this.ctx;
    const nodes: AudioNode[] = [];
    const out = this.out(level, side, d, nodes);
    const big = Math.min(1, Math.max(0, (r.size - 12) / 40)) * 0.6 + Math.min(1, Math.max(0, (r.by - 45) / 205)) * 0.4;
    const f = 78 - 40 * big;
    const tau = 0.22 + 0.7 * big;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(f * 1.9, t);
    osc.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    osc.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.05 + tau * 2);
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + 0.006);
    env.gain.setTargetAtTime(0, t + 0.02, tau);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + 0.1 + tau * 6);
    // (the crack: a short band of noise, its top taken by the air far off)
    const src = ctx.createBufferSource();
    src.buffer = noise('white');
    const bp = biquad(ctx, 'bandpass', 900 - 400 * big, 0.7);
    const ce = ctx.createGain();
    ce.gain.value = 0;
    ce.gain.setValueAtTime((LEVEL.crack / LEVEL.boom) * (1.2 - 0.5 * big), t);
    ce.gain.setTargetAtTime(0, t + 0.004, 0.05 + 0.1 * big);
    src.connect(bp).connect(ce).connect(out);
    src.start(t, this.rnd() * 4);
    src.stop(t + 0.8);
    // (the rumble rolling round the hills: low noise, slow)
    const rum = ctx.createBufferSource();
    rum.buffer = noise('brown');
    const rl = biquad(ctx, 'lowpass', 180, 0.6);
    const re = ctx.createGain();
    re.gain.value = 0;
    re.gain.setValueAtTime(0, t);
    re.gain.linearRampToValueAtTime(0.5 * big, t + 0.08);
    re.gain.setTargetAtTime(0, t + 0.1, 0.4 + 1.2 * big);
    rum.connect(rl).connect(re).connect(out);
    rum.start(t, this.rnd() * 4);
    rum.stop(t + 0.2 + 6 * big + 1);
    nodes.push(osc, env, src, bp, ce, rum, rl, re);
    cleanup(rum, nodes);
  }

  /** Crackles: dozens of tiny snaps over a second or so, thinning out. */
  private crackle(t: number, level: number, side: number, d: number, seed: number): void {
    const ctx = this.ctx;
    const r = mulberry32(seed);
    const nodes: AudioNode[] = [];
    const out = this.out(level, side, d, nodes);
    const src = ctx.createBufferSource();
    src.buffer = noise('white');
    const hp = biquad(ctx, 'highpass', 1800, 0.7);
    const env = ctx.createGain();
    env.gain.value = 0;
    const n = 26 + Math.floor(r() * 24);
    let s = t;
    for (let i = 0; i < n; i++) {
      s += range(r, 0.008, 0.07) * (1 + i / n);
      env.gain.setValueAtTime(range(r, 0.4, 1) * (1 - (0.6 * i) / n), s);
      env.gain.setTargetAtTime(0, s + 0.0015, range(r, 0.004, 0.012));
    }
    src.connect(hp).connect(env).connect(out);
    src.start(t, this.rnd() * 4);
    src.stop(s + 0.2);
    nodes.push(src, hp, env);
    cleanup(src, nodes);
  }

  /** The sizzle of falling trails (the willows' long, the chrysanthemums' short). */
  private sizzle(t: number, level: number, side: number, d: number, length: number): void {
    const ctx = this.ctx;
    const nodes: AudioNode[] = [];
    const out = this.out(level, side, d, nodes);
    const src = ctx.createBufferSource();
    src.buffer = noise('pink');
    src.loop = true;
    const hp = biquad(ctx, 'highpass', 3200, 0.6);
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + 0.25);
    env.gain.setTargetAtTime(0, t + 0.3, length * 0.4);
    src.connect(hp).connect(env).connect(out);
    src.start(t, this.rnd() * 4);
    src.stop(t + length * 2 + 0.4);
    nodes.push(src, hp, env);
    cleanup(src, nodes);
  }

  /** The crowd shouts the number `n` (or the greeting, 0). */
  private shoutAt(t: number, n: number, level: number, side: number, d: number): void {
    const ctx = this.ctx;
    const nodes: AudioNode[] = [];
    const out = this.out(level, side * 0.6, d, nodes);
    const src = ctx.createBufferSource();
    src.buffer = shout(n);
    src.playbackRate.value = 1 + (this.rnd() - 0.5) * 0.04;
    src.connect(out);
    src.start(t);
    nodes.push(src);
    cleanup(src, nodes);
  }

  /** The crowd's roar to `level` at `t` (rising over `up` s), then falling away (time constant `fall` s). */
  private crowdLevel(t: number, level: number, up: number, fall: number): void {
    const c = this.startCrowd();
    const g = c.out.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(level, t, up / 3);
    g.setTargetAtTime(0, t + up, fall);
  }

  /** The roar's loops (made when the crowd first sounds, stopped when the show is far). */
  private startCrowd(): NonNullable<FireworksSound['crowd']> {
    if (this.crowd) return this.crowd;
    const ctx = this.ctx;
    const bus = this.e.bus.fireworks;
    const out = ctx.createGain();
    out.gain.value = 0;
    const lp = biquad(ctx, 'lowpass', 6000, 0.5);
    const pan = ctx.createStereoPanner();
    const send = ctx.createGain();
    out.connect(lp).connect(pan).connect(bus.dry);
    pan.connect(send).connect(bus.wet);
    const loops: AudioBufferSourceNode[] = [];
    for (const [f, q, rate, gain] of [
      [600, 0.8, 0.92, 1],
      [1500, 1.1, 1.06, 0.7],
      [2900, 1.6, 1.12, 0.35],
    ] as const) {
      const src = ctx.createBufferSource();
      src.buffer = noise('pink');
      src.loop = true;
      src.playbackRate.value = rate;
      const bp = biquad(ctx, 'bandpass', f, q);
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(bp).connect(g).connect(out);
      src.start(ctx.currentTime, this.rnd() * 4);
      src.onended = () => {
        src.disconnect();
        bp.disconnect();
        g.disconnect();
      };
      loops.push(src);
    }
    this.crowd = { out, pan, lp, send, loops };
    this.placeCrowd();
    return this.crowd;
  }

  /** The roar where the square is from the ears (every frame while it sounds: glides). */
  private placeCrowd(): void {
    const c = this.crowd!;
    const e = this.ears;
    const dx = RING.x - e.x;
    const dy = GROUND + 1.6 - e.y;
    const dz = RING.z - e.z;
    const d = Math.hypot(dx, dy, dz) || 1e-3;
    const side = (dx * e.right[0] + dy * e.right[1] + dz * e.right[2]) / d;
    const now = this.ctx.currentTime;
    glide(c.pan.pan, side * 0.6, now, 0.2);
    glide(c.lp.frequency, air(d), now, 0.3);
    glide(c.send.gain, wet(d), now, 0.3);
  }

  private stopCrowd(): void {
    const c = this.crowd;
    if (!c) return;
    this.crowd = null;
    const now = this.ctx.currentTime;
    for (const l of c.loops) l.stop(now + 0.05);
    setTimeout(() => {
      for (const n of [c.out, c.lp, c.pan, c.send]) n.disconnect();
    }, 200);
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
