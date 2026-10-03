import { registerSfx, type SfxOut } from './addonSfx';
import { chantShot } from './chants';
import { biquad, mtof, noise, range, softWave, strike } from './dsp';

/**
 * The sounds of a monk's blessing with the red string (roam/_blessing.ts,
 * people/_sceneBlessing.ts):
 *
 * - `blessChant` (ambience bus): the monk chants the blessing in Pali, as
 *   Cambodian monks bless one who kneels before them (សព្វីតិយោ): "sabbītiyo
 *   vivajjantu, sabbarogo vinassatu, mā te bhavatvantarāyo, sukhī dīghāyuko
 *   bhava" (may every misfortune pass you by, every illness end, no harm come
 *   to you; be happy and live long). One elder's low voice on a reciting tone,
 *   a step up on some long syllables, each line falling at its end, a breath
 *   between the two; about 7 s. The recorded monks (chants.ts: a piece of
 *   the temple hall's chanting); until it is loaded, synthesized the way
 *   audio/temple.ts makes the dawn chant (a voice through vowel formants
 *   that follow the syllables, a hiss for the consonants), alone and close by;
 * - `blessMurmur` (ambience): softer, as he ties the string: "āyu vaṇṇo sukhaṃ
 *   balaṃ" (long life, beauty, happiness, strength);
 * - `blessDip` (moves): the sprig dipped in the bowl of water;
 * - `blessDrops` (moves): the drops landing on him, a light patter;
 * - `blessTie` (moves): the cotton string wound round his wrist;
 * - `blessKnot` (moves): the knot pulled snug;
 * - `blessCloth` (moves): his clothes as he kneels, steps on his knees, gets up.
 *
 * The chant and the murmur clearly heard (him kneeling two metres from the
 * monk: as loud as the dawn chant behind the monks' row, on a laptop's
 * speakers too), the map's music stepping back while the monk chants; the
 * rest under the paddle's splash.
 */

type Vowel = 'a' | 'i' | 'u' | 'e' | 'o';
interface Syl {
  onset: 'none' | 'nasal' | 'stop' | 'asp' | 'sib' | 'liquid' | 'h';
  vowel: Vowel;
  coda: 'none' | 'nasal' | 'stop';
  heavy: boolean;
}

function parse(s: string): Syl {
  const m = /^([^aāiīuūeo]*)([aāiīuūeo])(.*)$/.exec(s);
  const on = m?.[1] ?? '';
  const v = m?.[2] ?? 'a';
  const co = m?.[3] ?? '';
  const onset: Syl['onset'] = !on ? 'none' : /^[mnṇṅñ]/.test(on) ? 'nasal' : /^s/.test(on) ? 'sib' : /^h/.test(on) ? 'h' : /^[rlvy]/.test(on) ? 'liquid' : /h/.test(on) ? 'asp' : 'stop';
  const vowel = ({ ā: 'a', ī: 'i', ū: 'u' } as Record<string, Vowel>)[v] ?? (v as Vowel);
  const coda = !co ? 'none' : /^[mṃnṅṇ]/.test(co) ? 'nasal' : 'stop';
  return { onset, vowel, coda, heavy: /[āīūeo]/.test(v) || !!co };
}
const lines = (ls: readonly string[]): Syl[][] => ls.map((l) => l.split(/[\s-]+/).filter(Boolean).map(parse));

/** The blessing's two lines, and the four blessings murmured over the string (syllables split with `-`). */
const CHANT = lines(['sab-bī-ti-yo vi-vaj-jan-tu sab-ba-ro-go vi-nas-sa-tu', 'mā te bha-vat-van-ta-rā-yo su-khī dī-ghā-yu-ko bha-va']);
const MURMUR = lines(['ā-yu vaṇ-ṇo su-khaṃ ba-laṃ']);

/** Vowel formants (Hz, an old man's low voice) and the nasal hum. */
const FORMANTS: Record<Vowel | 'hum', [number, number, number]> = {
  a: [680, 1080, 2400],
  i: [285, 2150, 2850],
  u: [315, 830, 2220],
  e: [450, 1800, 2500],
  o: [470, 800, 2350],
  hum: [255, 1030, 2250],
};
/** His voice: detune (cents), octave (semitones), level. */
const VOICE: readonly [number, number, number][] = [
  [-4, 0, 1],
  [5, 0, 0.75],
  [0, -12, 0.4],
];
/** The reciting tone's root (D2, MIDI: the music's scale, as the temple chant), the levels. */
const ROOT = 38;
const LEVEL = { chant: 2.1, murmur: 1.15 };
/** The recording's levels (chants.ts), to sit as the synthesized voice does. */
const REC = { chant: 0.85, murmur: 0.58 };
/** How long the chant and the murmur last (s); the music comes back this long after (s). */
const LEN = { chant: 7, murmur: 2.2 };
const HUSH_AFTER = 1;

/** One voice chanting `text`, from `t0`: its beat (s a light syllable), its level, how breathy (the hiss's share). */
function chant(o: SfxOut, gain: number, t0: number, text: Syl[][], beat: number, level: number, breath: number): void {
  const { ctx, rnd } = o;
  const out = ctx.createGain();
  out.gain.value = level * gain;
  out.connect(o.dry);
  const send = ctx.createGain();
  send.gain.value = 0.35;
  out.connect(send).connect(o.wet);
  const amp = ctx.createGain();
  amp.gain.value = 0;
  amp.connect(out);
  const sum = ctx.createGain();
  const form = FORMANTS.a.map((f, k) => {
    const b = biquad(ctx, 'bandpass', f, [5, 8, 10][k]);
    const g = ctx.createGain();
    g.gain.value = [1, 0.75, 0.42][k];
    sum.connect(b).connect(g).connect(amp);
    return { b, g };
  });
  const body = biquad(ctx, 'lowpass', 400, 0.5);
  const bodyG = ctx.createGain();
  bodyG.gain.value = 0.14;
  sum.connect(body).connect(bodyG).connect(amp);
  const hiss = ctx.createGain();
  hiss.gain.value = 0;
  const hissHp = biquad(ctx, 'highpass', 2600, 0.6);
  const hissSrc = ctx.createBufferSource();
  hissSrc.buffer = noise('white');
  hissSrc.loop = true;
  hissSrc.connect(hissHp).connect(hiss);
  const hissLevel = ctx.createGain();
  hissLevel.gain.value = 0.2 + breath;
  hiss.connect(hissLevel).connect(out);
  // (a breathy voice: some of the breath under the vowels too)
  const air = ctx.createGain();
  air.gain.value = 0;
  hissHp.connect(air).connect(out);
  const tune = range(rnd, -0.25, 0.25);
  const wave = softWave(ctx, 1.1, 32);
  const oscs = VOICE.map(([cents, oct, lv]) => {
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(wave);
    osc.frequency.value = mtof(ROOT + 7 + oct + tune);
    osc.detune.value = cents;
    const g = ctx.createGain();
    g.gain.value = (lv * (1 - breath)) / VOICE.length;
    osc.connect(g).connect(sum);
    return { osc, oct, g };
  });
  const setForm = (v: Vowel | 'hum', at: number, tc: number) => FORMANTS[v].forEach((f, k) => form[k].b.frequency.setTargetAtTime(f, at, tc));
  let s = t0 + 0.12;
  for (const syls of text) {
    const n = syls.length;
    syls.forEach((sy, k) => {
      const last = k === n - 1;
      const dur = beat * (sy.heavy ? 1.6 : 1) * range(rnd, 0.94, 1.06) * (last ? 2.6 : 1);
      // The tune: the reciting tone (A), up a step on some long syllables, the line's end down to D.
      const deg = last ? 2 : k === n - 2 ? 4 : sy.heavy && rnd() < 0.3 ? 9 : 7;
      for (const v of oscs) {
        v.osc.frequency.setTargetAtTime(mtof(ROOT + deg + v.oct + tune + range(rnd, -0.05, 0.05)), s, 0.03);
        if (last) v.osc.frequency.setTargetAtTime(mtof(ROOT + v.oct + tune), s + dur * 0.35, dur * 0.25);
      }
      let open = 0.03;
      const a = amp.gain;
      const h = hiss.gain;
      switch (sy.onset) {
        case 'stop':
        case 'asp':
          a.setTargetAtTime(0.04, s, 0.008);
          h.setTargetAtTime(sy.onset === 'asp' ? 0.35 : 0.5, s + 0.035, 0.004);
          h.setTargetAtTime(0, s + (sy.onset === 'asp' ? 0.08 : 0.048), 0.012);
          open = sy.onset === 'asp' ? 0.075 : 0.048;
          break;
        case 'sib':
          a.setTargetAtTime(0.05, s, 0.01);
          h.setTargetAtTime(0.6, s, 0.01);
          h.setTargetAtTime(0, s + 0.065, 0.015);
          open = 0.07;
          break;
        case 'h':
          a.setTargetAtTime(0.3, s, 0.01);
          h.setTargetAtTime(0.25, s, 0.01);
          h.setTargetAtTime(0, s + 0.05, 0.015);
          open = 0.05;
          break;
        case 'nasal':
          setForm('hum', s, 0.012);
          a.setTargetAtTime(0.5, s, 0.015);
          open = 0.048;
          break;
        case 'liquid':
          a.setTargetAtTime(0.62, s, 0.01);
          open = 0.038;
          break;
        default:
          a.setTargetAtTime(0.7, s, 0.01);
      }
      setForm(sy.vowel, s + open, 0.02);
      a.setTargetAtTime(1, s + open, 0.025);
      a.setTargetAtTime(0.82, s + open + 0.05, dur);
      air.gain.setTargetAtTime(breath * 0.5, s + open, 0.03);
      if (sy.coda === 'nasal') {
        setForm('hum', s + dur * 0.62, 0.02);
        a.setTargetAtTime(0.55, s + dur * 0.62, 0.03);
      } else if (sy.coda === 'stop' && !last) a.setTargetAtTime(0.08, s + dur * 0.82, 0.01);
      if (last) {
        a.setTargetAtTime(0, s + dur * 0.45, dur * 0.18);
        air.gain.setTargetAtTime(0, s + dur * 0.45, dur * 0.18);
      }
      s += dur;
    });
    // (a breath between the lines)
    s += range(rnd, 0.45, 0.6);
  }
  const end = s + 0.6;
  amp.gain.setTargetAtTime(0, s, 0.12);
  air.gain.setTargetAtTime(0, s, 0.12);
  for (const v of oscs) {
    v.osc.start(t0);
    v.osc.stop(end);
  }
  hissSrc.start(t0, rnd() * 3);
  hissSrc.stop(end);
  hissSrc.onended = () => {
    for (const v of oscs) {
      v.osc.disconnect();
      v.g.disconnect();
    }
    for (const f of form) {
      f.b.disconnect();
      f.g.disconnect();
    }
    for (const nd of [hissSrc, hissHp, hiss, hissLevel, air, sum, body, bodyG, amp, out, send]) nd.disconnect();
  };
}

// (the recorded monks once loaded, chants.ts: a piece as long as the blessing, and a short soft one over the string;
// the music steps back meanwhile, as for the chant one kneels to listen to: audio/_listen.ts)
registerSfx(
  'blessChant',
  (o, gain, t) => {
    o.engine.yieldMusic(1, t, t + LEN.chant + HUSH_AFTER);
    return chantShot(o, gain, t, LEN.chant, REC.chant, 0.15) || chant(o, gain, t, CHANT, 0.135, LEVEL.chant, 0.08);
  },
  'ambience',
);
registerSfx(
  'blessMurmur',
  (o, gain, t) => {
    o.engine.yieldMusic(1, t, t + LEN.murmur + HUSH_AFTER);
    return chantShot(o, gain, t, LEN.murmur, REC.murmur, 0.15) || chant(o, gain, t, MURMUR, 0.15, LEVEL.murmur, 0.3);
  },
  'ambience',
);

registerSfx('blessDip', (o: SfxOut, gain: number, t: number) => {
  const { ctx, rnd } = o;
  const out = ctx.createGain();
  out.gain.value = gain;
  out.connect(o.dry);
  // The leaves into the water: a soft wash, then a small plop as they come out.
  const src = ctx.createBufferSource();
  src.buffer = noise('pink');
  const bp = biquad(ctx, 'bandpass', range(rnd, 520, 700), 1.1);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.07, t + 0.05);
  g.gain.setTargetAtTime(0, t + 0.12, 0.08);
  src.connect(bp).connect(g).connect(out);
  src.start(t, rnd() * 2);
  src.stop(t + 0.7);
  const plop = ctx.createOscillator();
  plop.frequency.setValueAtTime(range(rnd, 420, 480), t + 0.3);
  plop.frequency.exponentialRampToValueAtTime(220, t + 0.38);
  const pg = ctx.createGain();
  pg.gain.value = 0;
  strike(pg.gain, t + 0.3, 0.035, 0.004, 0.03);
  plop.connect(pg).connect(out);
  plop.start(t + 0.3);
  plop.stop(t + 0.6);
  plop.onended = () => {
    for (const n of [src, bp, g, plop, pg, out]) n.disconnect();
  };
}, 'moves');

registerSfx('blessDrops', (o: SfxOut, gain: number, t: number) => {
  const { ctx, rnd } = o;
  const out = ctx.createGain();
  out.gain.value = gain;
  out.connect(o.dry);
  const bp = biquad(ctx, 'bandpass', 3200, 1.4);
  bp.connect(out);
  // A few light drops on him: tiny ticks over a quarter second.
  const src = ctx.createBufferSource();
  src.buffer = noise('white');
  const g = ctx.createGain();
  g.gain.value = 0;
  for (let k = 0; k < 6; k++) strike(g.gain, t + k * 0.04 + range(rnd, 0, 0.03), range(rnd, 0.12, 0.22), 0.001, 0.006);
  src.connect(g).connect(bp);
  src.start(t, rnd() * 2);
  src.stop(t + 0.45);
  src.onended = () => {
    for (const n of [src, g, bp, out]) n.disconnect();
  };
}, 'moves');

registerSfx('blessTie', (o: SfxOut, gain: number, t: number) => {
  const { ctx, rnd } = o;
  const out = ctx.createGain();
  out.gain.value = gain;
  out.connect(o.dry);
  // The cotton cord drawn round his wrist: three soft rustles.
  const src = ctx.createBufferSource();
  src.buffer = noise('pink');
  const bp = biquad(ctx, 'bandpass', 2400, 0.9);
  const g = ctx.createGain();
  g.gain.value = 0;
  for (let k = 0; k < 3; k++) {
    const at = t + k * 0.42 + range(rnd, 0, 0.06);
    g.gain.setTargetAtTime(0.085, at, 0.05);
    g.gain.setTargetAtTime(0, at + 0.18, 0.06);
  }
  src.connect(bp).connect(g).connect(out);
  src.start(t, rnd() * 2);
  src.stop(t + 1.6);
  src.onended = () => {
    for (const n of [src, bp, g, out]) n.disconnect();
  };
}, 'moves');

registerSfx('blessKnot', (o: SfxOut, gain: number, t: number) => {
  const { ctx, rnd } = o;
  const out = ctx.createGain();
  out.gain.value = gain;
  out.connect(o.dry);
  // Pulled snug: a quick rising zip of the cord, a soft tap.
  const src = ctx.createBufferSource();
  src.buffer = noise('pink');
  const bp = biquad(ctx, 'bandpass', 1400, 2.2);
  bp.frequency.setValueAtTime(1400, t);
  bp.frequency.linearRampToValueAtTime(3000, t + 0.09);
  const g = ctx.createGain();
  g.gain.value = 0;
  strike(g.gain, t, 0.18, 0.02, 0.04);
  src.connect(bp).connect(g).connect(out);
  src.start(t, rnd() * 2);
  src.stop(t + 0.4);
  src.onended = () => {
    for (const n of [src, bp, g, out]) n.disconnect();
  };
}, 'moves');

registerSfx('blessCloth', (o: SfxOut, gain: number, t: number) => {
  const { ctx, rnd } = o;
  const src = ctx.createBufferSource();
  src.buffer = noise('pink');
  const bp = biquad(ctx, 'bandpass', range(rnd, 1200, 1600), 0.8);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.05 * gain, t + 0.12);
  g.gain.setTargetAtTime(0, t + 0.18, 0.09);
  src.connect(bp).connect(g).connect(o.dry);
  src.start(t, rnd() * 2);
  src.stop(t + 0.8);
  src.onended = () => {
    for (const n of [src, bp, g]) n.disconnect();
  };
}, 'moves');

/** One synthesized voice chanting Pali lines (the kneeling listener's chant before the recordings load: _listen.ts). */
export { chant as chantVoice, lines as chantLines };
