import { registerLoop, registerSfx, type LoopMaker, type SfxMaker, type SfxOut } from './addonSfx';
import { biquad, noise, range, strike } from './dsp';
import { clip } from './speech';

/**
 * The dog's sounds (roam/_dog.ts), gentle, a little different every time:
 *
 * - `dogBark` (animals): one or two soft "wau"s, the village dogs' own voice
 *   (speech.ts's `bark`, the same synthesized throat), its top softened — a
 *   friendly bark at the monkeys and the hens, or as it runs to him;
 * - `dogWhine` (animals): a happy whine, high through the nose, sliding up and
 *   down (petted, called, as he comes back to it);
 * - `dogYawn` (animals): waking from its nap, a squeaky yawn falling away;
 * - `dogSniff` (animals): three to five quick sniffs at the ground;
 * - `dogPant` (lasting, animals): panting after a run, "hah-hah-hah", the
 *   level how hard (the add-on sets it);
 * - `dogPat` (moves): his hand patting its head, soft on short fur;
 * - `dogThump` (steps): the hind leg thumping the ground while he scratches
 *   behind its ears.
 *
 * `gain` (0‥1) is the caller's: softer the further the dog is (the add-on
 * fades it with the distance from him). Levels sit under his own sounds: the
 * bark about as loud as a greeting from across the yard (audio/people.ts
 * `hello`), the whine, the yawn and the panting softer than his footsteps.
 */
const LEVEL = { bark: 0.3, whine: 0.05, yawn: 0.05, sniff: 0.44, pant: 0.2, pat: 0.5, thump: 0.55 };

/** Into the bus: dry, and a little reverb. */
function send(o: SfxOut, from: AudioNode, wet: number): AudioNode[] {
  from.connect(o.dry);
  if (wet <= 0) return [];
  const g = o.ctx.createGain();
  g.gain.value = wet;
  from.connect(g).connect(o.wet);
  return [g];
}

/** Filtered noise, struck. */
function puff(o: SfxOut, t: number, f: number, q: number, attack: number, tau: number, level: number, type: BiquadFilterType = 'bandpass', kind: 'white' | 'pink' | 'brown' = 'white'): void {
  const ctx = o.ctx;
  const src = ctx.createBufferSource();
  src.buffer = noise(kind);
  const band = biquad(ctx, type, f, q);
  const env = ctx.createGain();
  strike(env.gain, t, level, attack, tau);
  src.connect(band).connect(env);
  const made = send(o, env, 0.06);
  const end = attack + tau * 6;
  src.start(t, o.rnd() * Math.max(0, src.buffer.duration - end - 0.1));
  src.stop(t + end);
  src.onended = () => {
    for (const n of [src, band, env, ...made]) n.disconnect();
  };
}

/** One or two barks: the first "wau"s of a village dog's clip (`gain` over 0.75: two), a shade higher or lower. */
const bark: SfxMaker = (o, gain, t) => {
  const ctx = o.ctx;
  const r = o.rnd;
  const buf = clip('bark', r, [0]);
  const rate = range(r, 0.94, 1.06);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const soft = biquad(ctx, 'lowpass', 3400, 0.6);
  const env = ctx.createGain();
  const len = Math.min(buf.duration, gain > 0.75 ? 0.62 : 0.3) / rate;
  env.gain.setValueAtTime(LEVEL.bark * Math.min(1, gain), t);
  env.gain.setValueAtTime(LEVEL.bark * Math.min(1, gain), t + len - 0.04);
  env.gain.linearRampToValueAtTime(0, t + len);
  src.connect(soft).connect(env);
  const made = send(o, env, 0.12);
  src.start(t, 0, len * rate + 0.01);
  src.onended = () => {
    for (const n of [src, soft, env, ...made]) n.disconnect();
  };
};

/** A voice through the nose: a thin tone (a triangle) and its breath, along a pitch line (Hz at 0‥1 of `dur`). */
function nasal(o: SfxOut, t: number, dur: number, pitch: readonly (readonly [number, number])[], level: number, breath: number): void {
  const ctx = o.ctx;
  const r = o.rnd;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(pitch[0][1], t);
  for (let i = 1; i < pitch.length; i++) osc.frequency.linearRampToValueAtTime(pitch[i][1], t + pitch[i][0] * dur);
  // (a quick wobble: a dog's whine is never steady)
  const lfo = ctx.createOscillator();
  lfo.frequency.value = range(r, 7, 10);
  const lg = ctx.createGain();
  lg.gain.value = pitch[0][1] * 0.025;
  lfo.connect(lg).connect(osc.frequency);
  const nose = biquad(ctx, 'bandpass', 1500, 1.2);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(level, t + Math.min(0.06, dur * 0.2));
  env.gain.setValueAtTime(level * 0.85, t + dur * 0.7);
  env.gain.linearRampToValueAtTime(0, t + dur);
  const air = ctx.createBufferSource();
  air.buffer = noise('pink');
  const ab = biquad(ctx, 'bandpass', 2600, 0.9);
  const ag = ctx.createGain();
  ag.gain.value = breath;
  osc.connect(nose).connect(env);
  air.connect(ab).connect(ag).connect(env);
  const made = send(o, env, 0.1);
  osc.start(t);
  lfo.start(t);
  air.start(t, r() * 2);
  for (const s of [osc, lfo, air]) s.stop(t + dur + 0.05);
  osc.onended = () => {
    for (const n of [osc, lfo, lg, nose, env, air, ab, ag, ...made]) n.disconnect();
  };
}

const whine: SfxMaker = (o, gain, t) => {
  const r = o.rnd;
  const f = range(r, 820, 980);
  // One or two whines: up, then down a little (a happy "mmh-mmh").
  const n = r() < 0.5 ? 1 : 2;
  for (let i = 0; i < n; i++) {
    const d = range(r, 0.32, 0.5);
    nasal(o, t + i * (d + 0.08), d, [[0, f * 0.92], [0.45, f * range(r, 1.25, 1.4)], [1, f * 1.05]], LEVEL.whine * gain, 0.4);
  }
};

const yawn: SfxMaker = (o, gain, t) => {
  const r = o.rnd;
  const f = range(r, 700, 820);
  // The jaw wide open: a squeak rising, then a long fall, breathy at the end.
  nasal(o, t, range(r, 0.85, 1.1), [[0, f], [0.18, f * 1.45], [0.7, f * 0.8], [1, f * 0.55]], LEVEL.yawn * gain, 0.9);
};

const sniff: SfxMaker = (o, gain, t) => {
  const r = o.rnd;
  const n = 3 + Math.floor(r() * 3);
  let s = t;
  for (let i = 0; i < n; i++) {
    puff(o, s, range(r, 2600, 3400), 1.4, 0.006, range(r, 0.018, 0.028), LEVEL.sniff * gain * range(r, 0.7, 1));
    s += range(r, 0.07, 0.11);
  }
};

const pat: SfxMaker = (o, gain, t) => {
  const r = o.rnd;
  // A soft palm on short fur: a low dull pat and the brush of the hair.
  puff(o, t, range(r, 380, 520), 0.9, 0.003, 0.03, LEVEL.pat * gain, 'lowpass', 'pink');
  puff(o, t + 0.005, range(r, 2200, 3000), 0.8, 0.01, 0.025, LEVEL.pat * 0.18 * gain);
};

const thump: SfxMaker = (o, gain, t) => {
  const r = o.rnd;
  // The hind paw on the earth: a soft low knock.
  puff(o, t, range(r, 160, 220), 1.1, 0.004, 0.04, LEVEL.thump * gain, 'lowpass', 'brown');
};

/** Panting: breaths out and in at three a second, the level how hard (0‥1); its nodes go a few seconds after it stops. */
const pant: LoopMaker = (o) => {
  let made: { env: GainNode; band: BiquadFilterNode; stop(): void } | null = null;
  let timer = 0;
  const make = () => {
    const ctx = o.ctx;
    const src = ctx.createBufferSource();
    src.buffer = noise('pink');
    src.loop = true;
    const band = biquad(ctx, 'bandpass', 1700, 0.9);
    // (the breaths: a sine at 3.2 Hz opening and closing the noise)
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 3.2;
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    const breaths = ctx.createGain();
    breaths.gain.value = 0.5;
    lfo.connect(depth).connect(breaths.gain);
    const env = ctx.createGain();
    env.gain.value = 0;
    src.connect(band).connect(breaths).connect(env);
    const sends = send(o, env, 0.05);
    src.start();
    lfo.start();
    return {
      env,
      band,
      stop() {
        src.stop();
        lfo.stop();
        for (const n of [src, lfo, depth, breaths, band, env, ...sends]) n.disconnect();
      },
    };
  };
  return {
    level(v, t) {
      clearTimeout(timer);
      if (v > 0 && !made) made = make();
      if (!made) return;
      made.env.gain.setTargetAtTime(LEVEL.pant * v, t, 0.25);
      made.band.frequency.setTargetAtTime(1500 + 500 * v, t, 0.3);
      if (v <= 0) {
        const was = made;
        timer = window.setTimeout(() => {
          if (made !== was) return;
          was.stop();
          made = null;
        }, 3000);
      }
    },
  };
};

/** The makers, by name (registered below; checks may measure them offline). */
export const DOG_SOUNDS = { dogBark: bark, dogWhine: whine, dogYawn: yawn, dogSniff: sniff, dogPat: pat, dogThump: thump } as const;
export const DOG_LOOPS = { dogPant: pant } as const;

registerSfx('dogBark', bark, 'animals');
registerSfx('dogWhine', whine, 'animals');
registerSfx('dogYawn', yawn, 'animals');
registerSfx('dogSniff', sniff, 'animals');
registerSfx('dogPat', pat, 'moves');
registerSfx('dogThump', thump, 'steps');
registerLoop('dogPant', pant, 'animals');
