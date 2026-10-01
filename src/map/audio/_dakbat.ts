import { registerSfx, type SfxOut } from './addonSfx';
import { biquad, mtof, noise, range, softWave, strike } from './dsp';

/**
 * The sounds of dak bat, the alms round at dawn (roam/_dakBat.ts, people/_sceneAlms.ts):
 *
 * - `dakChant` (ambience bus): the monks' short blessing after the alms are
 *   given, in Pali, as Cambodian monks chant it to those who gave
 *   (សព្វីតិយោ): "sabbītiyo vivajjantu, sabbarogo vinassatu … sukhī
 *   dīghāyuko bhava" (may all troubles pass you by, may every illness
 *   end … be happy and live long): low voices in near-unison on a
 *   reciting tone, a step up on some long syllables, the line falling at
 *   its end, a breath between the lines; a novice's higher voice faintly
 *   over it. Synthesized the way audio/temple.ts makes the dawn chant (a
 *   few detuned voices through one set of vowel formants that follows the
 *   syllables, a hiss for the consonants), about 6.5 s;
 * - `dakLid` (ambience): the lid of an iron alms bowl lifted or put back, a
 *   soft dull knock with a faint ring;
 * - `dakSpoon` (moves): his spoon on the rim of the bowl, the rice dropping in;
 * - `dakCloth` (moves): his clothes as he kneels or gets up.
 *
 * Gentle levels: the chant at its loudest (him kneeling a metre from the
 * monks) about as loud as a footstep; the rest under the paddle's splash.
 */

/** The chant's two lines: syllables split with `-`, a long one marked by ā ī ū e o or a closing consonant. */
const LINES = ['sab-bī-ti-yo vi-vaj-jan-tu sab-ba-ro-go vi-nas-sa-tu', 'su-khī dī-ghā-yu-ko bha-va'];

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
const PARSED: Syl[][] = LINES.map((l) => l.split(/[\s-]+/).filter(Boolean).map(parse));

/** Vowel formants (Hz, low male voices) and the nasal hum. */
const FORMANTS: Record<Vowel | 'hum', [number, number, number]> = {
  a: [700, 1100, 2450],
  i: [290, 2200, 2900],
  u: [320, 850, 2250],
  e: [460, 1850, 2550],
  o: [480, 820, 2400],
  hum: [260, 1050, 2300],
};
/** Voices: detune (cents), octave (semitones), level (the novice's +12, soft). */
const VOICES: readonly [number, number, number][] = [
  [-9, 0, 1],
  [0, 0, 1],
  [7, 0, 1],
  [-4, -12, 0.5],
  [3, 12, 0.22],
];
/** The reciting tone's root (D2, MIDI) and the whole chant's level. */
const ROOT = 38;
const CHANT = 1.25;

registerSfx(
  'dakChant',
  (o: SfxOut, gain: number, t0: number) => {
    const { ctx, rnd } = o;
    const out = ctx.createGain();
    out.gain.value = CHANT * gain;
    out.connect(o.dry);
    const send = ctx.createGain();
    send.gain.value = 0.3;
    out.connect(send).connect(o.wet);
    const amp = ctx.createGain();
    amp.gain.value = 0;
    amp.connect(out);
    const sum = ctx.createGain();
    const form = FORMANTS.a.map((f, k) => {
      const b = biquad(ctx, 'bandpass', f, [5, 8, 10][k]);
      const g = ctx.createGain();
      g.gain.value = [1, 0.8, 0.5][k];
      sum.connect(b).connect(g).connect(amp);
      return { b, g };
    });
    const body = biquad(ctx, 'lowpass', 420, 0.5);
    const bodyG = ctx.createGain();
    bodyG.gain.value = 0.12;
    sum.connect(body).connect(bodyG).connect(amp);
    const hiss = ctx.createGain();
    hiss.gain.value = 0;
    const hissHp = biquad(ctx, 'highpass', 2800, 0.6);
    const hissSrc = ctx.createBufferSource();
    hissSrc.buffer = noise('white');
    hissSrc.loop = true;
    hissSrc.connect(hissHp).connect(hiss);
    const hissLevel = ctx.createGain();
    hissLevel.gain.value = 0.22;
    hiss.connect(hissLevel).connect(out);
    const tune = range(rnd, -0.3, 0.3);
    const wave = softWave(ctx, 1.05, 36);
    const oscs = VOICES.map(([cents, oct, level]) => {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(wave);
      osc.frequency.value = mtof(ROOT + 7 + oct + tune);
      osc.detune.value = cents;
      const g = ctx.createGain();
      g.gain.value = level / VOICES.length;
      osc.connect(g).connect(sum);
      return { osc, oct, g };
    });
    const setForm = (v: Vowel | 'hum', at: number, tc: number) => FORMANTS[v].forEach((f, k) => form[k].b.frequency.setTargetAtTime(f, at, tc));
    // The lines, syllable by syllable.
    let s = t0 + 0.15;
    for (const syls of PARSED) {
      const beat = range(rnd, 0.15, 0.165);
      const n = syls.length;
      syls.forEach((sy, k) => {
        const last = k === n - 1;
        const dur = beat * (sy.heavy ? 1.7 : 1) * range(rnd, 0.94, 1.06) * (last ? 2.6 : 1);
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
            h.setTargetAtTime(sy.onset === 'asp' ? 0.35 : 0.5, s + 0.04, 0.004);
            h.setTargetAtTime(0, s + (sy.onset === 'asp' ? 0.085 : 0.05), 0.012);
            open = sy.onset === 'asp' ? 0.08 : 0.05;
            break;
          case 'sib':
            a.setTargetAtTime(0.05, s, 0.01);
            h.setTargetAtTime(0.6, s, 0.01);
            h.setTargetAtTime(0, s + 0.07, 0.015);
            open = 0.075;
            break;
          case 'h':
            a.setTargetAtTime(0.3, s, 0.01);
            h.setTargetAtTime(0.25, s, 0.01);
            h.setTargetAtTime(0, s + 0.05, 0.015);
            open = 0.055;
            break;
          case 'nasal':
            setForm('hum', s, 0.012);
            a.setTargetAtTime(0.5, s, 0.015);
            open = 0.05;
            break;
          case 'liquid':
            a.setTargetAtTime(0.62, s, 0.01);
            open = 0.04;
            break;
          default:
            a.setTargetAtTime(0.7, s, 0.01);
        }
        setForm(sy.vowel, s + open, 0.02);
        a.setTargetAtTime(1, s + open, 0.025);
        a.setTargetAtTime(0.82, s + open + 0.05, dur);
        if (sy.coda === 'nasal') {
          setForm('hum', s + dur * 0.62, 0.02);
          a.setTargetAtTime(0.55, s + dur * 0.62, 0.03);
        } else if (sy.coda === 'stop' && !last) a.setTargetAtTime(0.08, s + dur * 0.82, 0.01);
        if (last) a.setTargetAtTime(0, s + dur * 0.45, dur * 0.18);
        s += dur;
      });
      // (a breath between the lines)
      s += range(rnd, 0.55, 0.8);
    }
    const end = s + 0.6;
    amp.gain.setTargetAtTime(0, s, 0.12);
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
      for (const nd of [hissSrc, hissHp, hiss, hissLevel, sum, body, bodyG, amp, out, send]) nd.disconnect();
    };
  },
  'ambience',
);

registerSfx(
  'dakLid',
  (o: SfxOut, gain: number, t: number) => {
    const { ctx, rnd } = o;
    const out = ctx.createGain();
    out.gain.value = gain;
    out.connect(o.dry);
    // The knock: a short dull thump of the lid on the bowl's rim.
    const src = ctx.createBufferSource();
    src.buffer = noise('pink');
    const bp = biquad(ctx, 'bandpass', range(rnd, 700, 900), 2.2);
    const g = ctx.createGain();
    strike(g.gain, t, 0.09, 0.003, 0.03);
    src.connect(bp).connect(g).connect(out);
    src.start(t, rnd() * 2);
    src.stop(t + 0.2);
    // The iron's faint ring.
    const ring = ctx.createOscillator();
    ring.frequency.value = range(rnd, 1250, 1450);
    const rg = ctx.createGain();
    strike(rg.gain, t, 0.012, 0.002, 0.12);
    ring.connect(rg).connect(out);
    ring.start(t);
    ring.stop(t + 0.7);
    ring.onended = () => {
      for (const n of [src, bp, g, ring, rg, out]) n.disconnect();
    };
  },
  'ambience',
);

registerSfx(
  'dakSpoon',
  (o: SfxOut, gain: number, t: number) => {
    const { ctx, rnd } = o;
    const out = ctx.createGain();
    out.gain.value = gain;
    out.connect(o.dry);
    // The spoon's tick on the rim: two thin partials.
    const parts = [range(rnd, 2500, 2800), range(rnd, 3900, 4300)].map((f, k) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = f;
      const g = ctx.createGain();
      strike(g.gain, t, k ? 0.006 : 0.01, 0.001, k ? 0.04 : 0.07);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + 0.4);
      return [osc, g] as const;
    });
    // The rice dropping in: a soft pat.
    const src = ctx.createBufferSource();
    src.buffer = noise('pink');
    const lp = biquad(ctx, 'lowpass', 900, 0.6);
    const g = ctx.createGain();
    strike(g.gain, t + 0.06, 0.05, 0.01, 0.05);
    src.connect(lp).connect(g).connect(out);
    src.start(t, rnd() * 2);
    src.stop(t + 0.4);
    src.onended = () => {
      for (const [osc, pg] of parts) {
        osc.disconnect();
        pg.disconnect();
      }
      for (const n of [src, lp, g, out]) n.disconnect();
    };
  },
  'moves',
);

registerSfx(
  'dakCloth',
  (o: SfxOut, gain: number, t: number) => {
    const { ctx, rnd } = o;
    const src = ctx.createBufferSource();
    src.buffer = noise('pink');
    const bp = biquad(ctx, 'bandpass', range(rnd, 1300, 1700), 0.8);
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
  },
  'moves',
);
