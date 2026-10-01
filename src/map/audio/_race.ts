import { registerSfx, SFX, type SfxOut } from './addonSfx';
import { biquad, cleanup, noise, range } from './dsp';

/**
 * The boat race's sounds (roam/_raceRow.ts: paddling in a ngo at the Water
 * Festival), synthesized, on the add-ons' buses (addonSfx.ts):
 *
 * - `raceDrum` (moves): his crew's drum, the beat he paddles to: a deep barrel
 *   drum (a thump falling in pitch and the skin's slap), the first of each
 *   four a little stronger; `raceRival` (ambience): the other boat's drum,
 *   farther and to one side.
 * - `raceWhistle` (moves): the officials' whistle, at the start and the finish.
 * - `raceShout` (moves): his crew's shout on a good stroke ("hou!" / "hei!", a
 *   few men's voices); `raceCall` (moves): the caller's long cry as the beat
 *   quickens; `raceChhing` (moves): a pair of chhing, the small Khmer
 *   cymbals, when his boat wins.
 * - `raceCheer` (ambience): the landing's people and the beach cheering the
 *   boats in.
 *
 * Timing: a sound for a moment of the race (a beat) is put on the audio clock,
 * not played when the frame gets to it: `raceAudio.clock(raceT, perf)` (each
 * step) pairs the race's clock with the page's (`performance.now()`), and the
 * audio clock's own pairing with the page's (`getOutputTimestamp`: when what
 * it plays comes out of the speakers) places the drum where its beat falls, so
 * the drum heard and the ring seen hit together at any frame rate. The add-on
 * schedules each beat a little ahead (`LEAD` s), never a whole beat, so a
 * hitch moves at most the next one.
 */

/** How far ahead of its moment a beat is scheduled (s). */
export const LEAD = 0.12;

/** The race's clock paired with the page's, last step. */
const map = { race: 0, perf: 0 };
/** The next sound's moment (race seconds; NaN: now), its pan (−1 left ‥ 1 right) and its kind. */
let when = Number.NaN;
let pan = 0;
let flavour = 0;
/** The next sound is a drum's beat (checks count those put on the clock too late). */
let beat = false;

/** The audio time when the race's clock reads `t` (as the speakers play it), or `now` if that has passed. */
function audioAt(o: SfxOut, now: number, t: number): number {
  if (!Number.isFinite(t)) return now;
  const ctx = o.ctx as AudioContext;
  const wall = map.perf + (t - map.race) * 1000;
  let at: number;
  const ts = typeof ctx.getOutputTimestamp === 'function' ? ctx.getOutputTimestamp() : null;
  if (ts && ts.contextTime !== undefined && ts.performanceTime !== undefined && ts.performanceTime > 0) at = ts.contextTime + (wall - ts.performanceTime) / 1000;
  else {
    const lat = Number.isFinite(ctx.outputLatency) ? ctx.outputLatency : Number.isFinite(ctx.baseLatency) ? ctx.baseLatency : 0;
    at = now + (wall - performance.now()) / 1000 - Math.min(0.2, lat);
  }
  // (checks: how far ahead of the audio clock the drums go on it; a beat that missed its moment plays at once. The
  // whistle at the line and the caller's cry go at their moment or, a frame late, at once: not counted)
  if (beat) {
    check.n++;
    check.ahead = Math.min(check.ahead, at - now);
    if (at < now) check.late++;
  }
  return Math.max(now, at);
}

/** Checks (a test reads it): sounds put on the audio clock, the least time ahead they went (s), how many came too late. */
export const RACE_AUDIO_CHECK = { n: 0, ahead: Infinity, late: 0 };
const check = RACE_AUDIO_CHECK;

/** A voice's way out: level, a lowpass, pan, the reverb send (returns its input). */
function voice(o: SfxOut, level: number, lp: number, side: number, wet: number, nodes: AudioNode[]): GainNode {
  const ctx = o.ctx;
  const g = ctx.createGain();
  g.gain.value = level;
  const f = biquad(ctx, 'lowpass', lp, 0.5);
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-0.9, Math.min(0.9, side));
  const send = ctx.createGain();
  send.gain.value = wet;
  g.connect(f).connect(p).connect(o.dry);
  p.connect(send).connect(o.wet);
  nodes.push(g, f, p, send);
  return g;
}

/** The barrel drum (sampho-like, as the festival's): a thump falling in pitch, the skin's slap; `low` deepens it. */
function drum(o: SfxOut, t: number, level: number, side: number, lp: number, wet: number, low: number): void {
  const ctx = o.ctx;
  const nodes: AudioNode[] = [];
  const out = voice(o, level, lp, side, wet, nodes);
  const osc = ctx.createOscillator();
  const f0 = 124 - 14 * low;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(f0 * 0.5, t + 0.17);
  const env = ctx.createGain();
  env.gain.value = 0;
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(1, t + 0.004);
  env.gain.setTargetAtTime(0, t + 0.012, 0.15 + 0.04 * low);
  osc.connect(env).connect(out);
  // (a second, rounder body under it)
  const sub = ctx.createOscillator();
  sub.type = 'triangle';
  sub.frequency.setValueAtTime(f0 * 0.62, t);
  sub.frequency.exponentialRampToValueAtTime(f0 * 0.36, t + 0.22);
  const subEnv = ctx.createGain();
  subEnv.gain.value = 0;
  subEnv.gain.setValueAtTime(0, t);
  subEnv.gain.linearRampToValueAtTime(0.55, t + 0.006);
  subEnv.gain.setTargetAtTime(0, t + 0.02, 0.18);
  sub.connect(subEnv).connect(out);
  osc.start(t);
  sub.start(t);
  osc.stop(t + 0.9);
  sub.stop(t + 0.9);
  const src = ctx.createBufferSource();
  src.buffer = noise('white');
  const bp = biquad(ctx, 'bandpass', 950, 1.1);
  const se = ctx.createGain();
  se.gain.value = 0;
  se.gain.setValueAtTime(0.32 + 0.1 * low, t);
  se.gain.setTargetAtTime(0, t + 0.002, 0.02);
  src.connect(bp).connect(se).connect(out);
  src.start(t, o.rnd() * 4);
  src.stop(t + 0.12);
  nodes.push(env, sub, subEnv, bp, se, src);
  cleanup(osc, [osc, ...nodes]);
}

registerSfx(
  'raceDrum',
  (o, gain, now) => drum(o, audioAt(o, now, when), 0.5 * gain, -0.12, 9000, 0.1, flavour),
  'moves',
);

registerSfx(
  'raceRival',
  (o, gain, now) => drum(o, audioAt(o, now, when), 0.3 * gain, pan, 2600, 0.22, 0),
  'ambience',
);

/** The officials' whistle: a pea whistle (a high tone warbling fast), with breath; `flavour` 1: a long blast. */
registerSfx(
  'raceWhistle',
  (o, gain, now) => {
    const ctx = o.ctx;
    const t = audioAt(o, now, when);
    const long = flavour >= 1;
    const len = long ? 0.85 : 0.32;
    const nodes: AudioNode[] = [];
    const out = voice(o, 0.11 * gain, 9000, 0.15, 0.18, nodes);
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(2850, t);
    osc.frequency.linearRampToValueAtTime(3050, t + 0.05);
    osc.frequency.setValueAtTime(3050, t + len - 0.08);
    osc.frequency.linearRampToValueAtTime(2700, t + len);
    // (the pea's warble: the tone's level beating fast)
    const am = ctx.createGain();
    am.gain.value = 0.65;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = range(o.rnd, 26, 34);
    const depth = ctx.createGain();
    depth.gain.value = 0.35;
    lfo.connect(depth).connect(am.gain);
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + 0.02);
    env.gain.setValueAtTime(1, t + len - 0.05);
    env.gain.linearRampToValueAtTime(0, t + len);
    osc.connect(am).connect(env).connect(out);
    const br = ctx.createBufferSource();
    br.buffer = noise('white');
    const bp = biquad(ctx, 'bandpass', 3000, 2);
    const be = ctx.createGain();
    be.gain.value = 0.25;
    br.connect(bp).connect(be).connect(env);
    osc.start(t);
    lfo.start(t);
    br.start(t, o.rnd() * 4);
    osc.stop(t + len + 0.02);
    lfo.stop(t + len + 0.02);
    br.stop(t + len + 0.02);
    nodes.push(am, lfo, depth, env, br, bp, be);
    cleanup(osc, [osc, ...nodes]);
  },
  'moves',
);

/** A few men's voices on one vowel, falling a little (`flavour` 0 "hou", 1 "hei"; 2 the caller's long cry, one voice, rising then falling). */
function voices(o: SfxOut, t: number, level: number, kind: number): void {
  const ctx = o.ctx;
  const r = o.rnd;
  const call = kind === 2;
  const nodes: AudioNode[] = [];
  const out = voice(o, level, 7000, 0.05, 0.16, nodes);
  const hou = kind === 0;
  const f1 = biquad(ctx, 'bandpass', call ? 640 : hou ? 430 : 560, call ? 2.4 : 3);
  const f2 = biquad(ctx, 'bandpass', call ? 1250 : hou ? 780 : 1750, call ? 3.2 : 4);
  const env = ctx.createGain();
  env.gain.value = 0;
  const len = call ? 0.75 : 0.36;
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(1, t + (call ? 0.06 : 0.03));
  if (call) {
    env.gain.setValueAtTime(1, t + len - 0.25);
    env.gain.linearRampToValueAtTime(0, t + len);
  } else env.gain.setTargetAtTime(0, t + 0.09, 0.07);
  env.connect(f1).connect(out);
  env.connect(f2).connect(out);
  nodes.push(f1, f2, env);
  const n = call ? 1 : 4;
  let last: OscillatorNode | null = null;
  for (let i = 0; i < n; i++) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const f = call ? 165 : range(r, 122, 172);
    if (call) {
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.linearRampToValueAtTime(f * 1.35, t + 0.22);
      osc.frequency.linearRampToValueAtTime(f * 1.12, t + len);
    } else {
      osc.frequency.setValueAtTime(f * 1.06, t);
      osc.frequency.exponentialRampToValueAtTime(f * 0.94, t + len);
    }
    osc.connect(env);
    osc.start(t + (call ? 0 : range(r, 0, 0.02)));
    osc.stop(t + len + 0.05);
    nodes.push(osc);
    last = osc;
  }
  if (last) cleanup(last, nodes);
}

registerSfx('raceShout', (o, gain, now) => voices(o, audioAt(o, now, when), 0.13 * gain, flavour >= 1 ? 1 : 0), 'moves');
registerSfx('raceCall', (o, gain, now) => voices(o, audioAt(o, now, when), 0.16 * gain, 2), 'moves');

/** Chhing: two small cymbals struck together, a bright ring (`flavour` 1: damped short, "chhap"). */
registerSfx(
  'raceChhing',
  (o, gain, now) => {
    const ctx = o.ctx;
    const t = audioAt(o, now, when);
    const damped = flavour >= 1;
    const nodes: AudioNode[] = [];
    const out = voice(o, 0.07 * gain, 14000, 0.2, 0.25, nodes);
    const ring = damped ? 0.05 : 0.45;
    let last: AudioScheduledSourceNode | null = null;
    for (const [f, a] of [
      [3120, 1],
      [4410, 0.7],
      [5830, 0.55],
      [7390, 0.4],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.frequency.value = f * range(o.rnd, 0.995, 1.005);
      const e = ctx.createGain();
      e.gain.value = 0;
      e.gain.setValueAtTime(0, t);
      e.gain.linearRampToValueAtTime(a, t + 0.002);
      e.gain.setTargetAtTime(0, t + 0.004, ring * (1.2 - a * 0.3));
      osc.connect(e).connect(out);
      osc.start(t);
      osc.stop(t + ring * 5 + 0.1);
      nodes.push(osc, e);
      last = osc;
    }
    const src = ctx.createBufferSource();
    src.buffer = noise('white');
    const hp = biquad(ctx, 'highpass', 5200, 0.7);
    const ne = ctx.createGain();
    ne.gain.value = 0;
    ne.gain.setValueAtTime(0.5, t);
    ne.gain.setTargetAtTime(0, t + 0.002, damped ? 0.02 : 0.06);
    src.connect(hp).connect(ne).connect(out);
    src.start(t, o.rnd() * 4);
    src.stop(t + 0.5);
    nodes.push(src, hp, ne);
    if (last) cleanup(last, nodes);
  },
  'moves',
);

/** The crowd cheering: a swell of many voices (pink noise in two bands) and clapping, fading over a few seconds. */
registerSfx(
  'raceCheer',
  (o, gain, now) => {
    const ctx = o.ctx;
    const t = audioAt(o, now, when);
    const nodes: AudioNode[] = [];
    const out = voice(o, 0.14 * gain, 6000, pan * 0.6, 0.3, nodes);
    const len = 4.2;
    let last: AudioScheduledSourceNode | null = null;
    for (const [f, q, a, rate] of [
      [700, 0.8, 0.8, 0.93],
      [1600, 1.2, 0.55, 1.08],
    ] as const) {
      const src = ctx.createBufferSource();
      src.buffer = noise('pink');
      src.playbackRate.value = rate;
      const bp = biquad(ctx, 'bandpass', f, q);
      const e = ctx.createGain();
      e.gain.value = 0;
      e.gain.setValueAtTime(0, t);
      e.gain.linearRampToValueAtTime(a, t + 0.35);
      e.gain.setTargetAtTime(a * 0.55, t + 0.6, 0.6);
      e.gain.setTargetAtTime(0, t + 2.2, 0.8);
      src.connect(bp).connect(e).connect(out);
      src.start(t, o.rnd() * 4);
      src.stop(t + len);
      nodes.push(src, bp, e);
      last = src;
    }
    // (hands clapping: short bright bursts, thinning out)
    const claps = ctx.createBufferSource();
    claps.buffer = noise('white');
    const cbp = biquad(ctx, 'bandpass', 1900, 1.4);
    const ce = ctx.createGain();
    ce.gain.value = 0;
    let s = t + 0.15;
    for (let i = 0; i < 26; i++) {
      const a = 0.5 * (1 - i / 26);
      ce.gain.setValueAtTime(a, s);
      ce.gain.setTargetAtTime(0, s + 0.003, 0.018);
      s += range(o.rnd, 0.06, 0.15);
    }
    claps.connect(cbp).connect(ce).connect(out);
    claps.start(t, o.rnd() * 4);
    claps.stop(s + 0.1);
    nodes.push(claps, cbp, ce);
    if (last) cleanup(last, nodes);
  },
  'ambience',
);

/** The race's sounds, for the add-on. */
export const raceAudio = {
  /** Each step: the race's clock (s) now, and the page's (`performance.now()`, ms). */
  clock(raceT: number, perf: number): void {
    map.race = raceT;
    map.perf = perf;
  },
  /** His crew's drum on the beat at race time `t` (a little ahead of it): `accent` the first of four. */
  drum(t: number, gain: number, accent: boolean): void {
    when = t;
    flavour = accent ? 1 : 0;
    beat = true;
    SFX.play('raceDrum', gain * (accent ? 1 : 0.82));
    beat = false;
  },
  /** The other boat's drum at `t`, as loud as `gain` (its distance), `side` −1 left ‥ 1 right. */
  rival(t: number, gain: number, side: number): void {
    when = t;
    pan = side;
    beat = true;
    SFX.play('raceRival', gain);
    beat = false;
  },
  whistle(t: number, long: boolean): void {
    when = t;
    flavour = long ? 1 : 0;
    SFX.play('raceWhistle', 1);
  },
  /** His crew's shout on the pull (`hou` or "hei", in turn). */
  shout(t: number, gain: number, hou: boolean): void {
    when = t;
    flavour = hou ? 0 : 1;
    SFX.play('raceShout', gain);
  },
  /** The caller's long cry (the beat quickens). */
  call(t: number): void {
    when = t;
    SFX.play('raceCall', 1);
  },
  /** The chhing (`damped`: the short "chhap"). */
  chhing(t: number, damped: boolean, gain = 1): void {
    when = t;
    flavour = damped ? 1 : 0;
    SFX.play('raceChhing', gain);
  },
  /** The crowd's cheer now, `side` where it is (−1 left ‥ 1 right). */
  cheer(gain: number, side: number): void {
    when = Number.NaN;
    pan = side;
    SFX.play('raceCheer', gain);
  },
};
