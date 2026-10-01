import { registerLoop, registerSfx, type SfxOut } from './addonSfx';
import { biquad, glide, mtof, noise, softWave, strike } from './dsp';

/**
 * Visak Bochea's sounds (roam/_visak.ts), and the monks' chant at the
 * pagoda's two festivals (Pchum Ben's is in _pchum.ts, made the same way):
 *
 * - **the chant** (`visakChant`, a lasting sound on the ambience bus): the
 *   monks leading the candle procession chant softly in Pali as they walk —
 *   the homage to the Buddha (Namo tassa…, three times) and the three
 *   refuges — low voices in near-unison on a reciting tone, a rise on the
 *   long syllables, a fall at each line's end, a breath between lines (as
 *   the dawn chant, audio/temple.ts). Rendered once, off the main thread
 *   (an OfflineAudioContext), into a loop that plays from where the monks
 *   are: `placeChant` each frame (distance, side), `SFX.level` how loud;
 * - `visakGive`: a candle, incense and a lotus taken into his hands (a soft
 *   rustle of the stems, a tiny bell-like tick);
 * - `visakPlace`: the candle set in the tray's sand (a soft tap).
 *
 * Gentle levels: the chant sits under the footsteps close by, the rest are
 * quieter than the paddle.
 */

// ── The chant, rendered once ─────────────────────────────────────────────────

type Onset = 'none' | 'nasal' | 'stop' | 'asp' | 'sib' | 'liquid' | 'h';
type Vowel = 'a' | 'i' | 'u' | 'e' | 'o';
interface Syl {
  onset: Onset;
  vowel: Vowel;
  coda: 'none' | 'nasal' | 'stop';
  heavy: boolean;
}

/** Vowel formants (Hz, a low male voice) and the nasal murmur. */
const FORMANTS: Record<Vowel | 'hum', [number, number, number]> = {
  a: [700, 1100, 2450],
  i: [290, 2200, 2900],
  u: [320, 850, 2250],
  e: [460, 1850, 2550],
  o: [480, 820, 2400],
  hum: [260, 1050, 2300],
};

function parseSyl(s: string): Syl {
  const m = /^([^aāiīuūeo]*)([aāiīuūeo])(.*)$/.exec(s);
  const on = m?.[1] ?? '';
  const v = m?.[2] ?? 'a';
  const co = m?.[3] ?? '';
  const onset: Onset = !on ? 'none' : /^[mnṇṅñ]/.test(on) ? 'nasal' : /^s/.test(on) ? 'sib' : /^h/.test(on) ? 'h' : /^[rlvy]/.test(on) ? 'liquid' : /h/.test(on) ? 'asp' : 'stop';
  const vowel = ({ ā: 'a', ī: 'i', ū: 'u' } as Record<string, Vowel>)[v] ?? (v as Vowel);
  const coda = !co ? 'none' : /^[mṃnṅṇ]/.test(co) ? 'nasal' : 'stop';
  return { onset, vowel, coda, heavy: /[āīūeo]/.test(v) || !!co };
}

/** Lines of syllables (syllables split with `-`, lines with `/`). */
const parse = (text: string): Syl[][] =>
  text
    .split('/')
    .map((line) => line.trim().split(/[\s-]+/).filter(Boolean).map(parseSyl))
    .filter((l) => l.length);

/** Voices: detune (cents) and octave (0 or −12). */
const VOICES: [number, number][] = [
  [-12, 0],
  [-4, 0],
  [3, 0],
  [10, 0],
  [-2, -12],
];
/** The reciting tone's root: D2 (MIDI): the map's music's key. */
const ROOT = 38;
/** The render's sample rate (low voices: enough). */
const RATE = 22050;

/**
 * The chant's lines rendered into a buffer that loops (it begins and ends in a
 * breath): `beat` s a light syllable, `gap` s between lines, `rest` s at the end.
 */
export async function renderChant(sampleRate: number, text: string, seed: number, beat = 0.24, gap = 1.2, rest = 3.2): Promise<AudioBuffer | null> {
  if (typeof OfflineAudioContext === 'undefined') return null;
  const lines = parse(text);
  let r = seed >>> 0 || 1;
  const rnd = () => {
    r = (r + 0x6d2b79f5) | 0;
    let t = Math.imul(r ^ (r >>> 15), 1 | r);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const lens = lines.map((l) => l.reduce((s, sy, k) => s + beat * (sy.heavy ? 1.85 : 1) * (k === l.length - 1 ? 2.8 : 1), 0));
  const total = 0.6 + lens.reduce((a, b) => a + b + gap, 0) + rest;
  const rate = Math.min(sampleRate, RATE);
  const ctx = new OfflineAudioContext(1, Math.ceil(total * rate), rate);
  const out = ctx.createGain();
  out.gain.value = 0.9;
  out.connect(ctx.destination);
  const amp = ctx.createGain();
  amp.gain.value = 0;
  amp.connect(out);
  const sum = ctx.createGain();
  const form = FORMANTS.a.map((f, k) => {
    const b = biquad(ctx, 'bandpass', f, [5, 8, 10][k]);
    const g = ctx.createGain();
    g.gain.value = [1, 0.8, 0.5][k];
    sum.connect(b).connect(g).connect(amp);
    return b;
  });
  const body = ctx.createGain();
  body.gain.value = 0.12;
  sum.connect(biquad(ctx, 'lowpass', 420, 0.5)).connect(body).connect(amp);
  const hiss = ctx.createGain();
  hiss.gain.value = 0;
  const hissLevel = ctx.createGain();
  hissLevel.gain.value = 0.22;
  hiss.connect(hissLevel).connect(out);
  const src = ctx.createBufferSource();
  src.buffer = noise('white');
  src.loop = true;
  src.connect(biquad(ctx, 'highpass', 2800, 0.6)).connect(hiss);
  src.start(0);
  const wave = softWave(ctx, 1.05, 30);
  const oscs = VOICES.map(([cents, oct]) => {
    const o = ctx.createOscillator();
    o.setPeriodicWave(wave);
    o.frequency.value = mtof(ROOT + 7 + oct);
    o.detune.value = cents;
    const g = ctx.createGain();
    g.gain.value = (oct ? 0.55 : 1) / VOICES.length;
    o.connect(g).connect(sum);
    o.start(0);
    return { o, oct };
  });
  const setForm = (v: Vowel | 'hum', at: number, tc: number) => FORMANTS[v].forEach((f, k) => glide(form[k].frequency, f, at, tc));
  const A = amp.gain;
  const H = hiss.gain;
  let s = 0.6;
  for (const syls of lines) {
    const n = syls.length;
    syls.forEach((sy, k) => {
      const last = k === n - 1;
      const dur = beat * (sy.heavy ? 1.85 : 1) * (0.94 + 0.12 * rnd()) * (last ? 2.8 : 1);
      // The tune: the reciting tone (A), up a step now and then on a long syllable, down to F# and E → D at the line's end.
      const deg = last ? 2 : k === n - 2 ? 4 : sy.heavy && rnd() < 0.3 ? 9 : 7;
      for (const { o, oct } of oscs) {
        o.frequency.setTargetAtTime(mtof(ROOT + deg + oct + (rnd() - 0.5) * 0.12), s, 0.03);
        if (last) o.frequency.setTargetAtTime(mtof(ROOT + oct), s + dur * 0.35, dur * 0.25);
      }
      let open = 0.03;
      if (sy.onset === 'stop' || sy.onset === 'asp') {
        A.setTargetAtTime(0.04, s, 0.008);
        H.setTargetAtTime(sy.onset === 'asp' ? 0.35 : 0.5, s + 0.045, 0.004);
        H.setTargetAtTime(0, s + (sy.onset === 'asp' ? 0.09 : 0.055), 0.012);
        open = sy.onset === 'asp' ? 0.085 : 0.055;
      } else if (sy.onset === 'sib') {
        A.setTargetAtTime(0.05, s, 0.01);
        H.setTargetAtTime(0.6, s, 0.01);
        H.setTargetAtTime(0, s + 0.075, 0.015);
        open = 0.08;
      } else if (sy.onset === 'h') {
        A.setTargetAtTime(0.3, s, 0.01);
        H.setTargetAtTime(0.25, s, 0.01);
        H.setTargetAtTime(0, s + 0.055, 0.015);
        open = 0.06;
      } else if (sy.onset === 'nasal') {
        setForm('hum', s, 0.012);
        A.setTargetAtTime(0.5, s, 0.015);
        open = 0.055;
      } else if (sy.onset === 'liquid') {
        A.setTargetAtTime(0.62, s, 0.01);
        open = 0.04;
      } else A.setTargetAtTime(0.7, s, 0.01);
      setForm(sy.vowel, s + open, 0.02);
      A.setTargetAtTime(1, s + open, 0.025);
      A.setTargetAtTime(0.82, s + open + 0.05, dur);
      if (sy.coda === 'nasal') {
        setForm('hum', s + dur * 0.62, 0.02);
        A.setTargetAtTime(0.55, s + dur * 0.62, 0.03);
      } else if (sy.coda === 'stop' && !last) A.setTargetAtTime(0.08, s + dur * 0.82, 0.01);
      if (last) A.setTargetAtTime(0, s + dur * 0.45, dur * 0.18);
      s += dur;
    });
    s += gap * (0.85 + 0.3 * rnd());
  }
  try {
    return await ctx.startRendering();
  } catch {
    return null;
  }
}

/** Where a chant is heard from: the distance's gain, the air (low-pass, Hz), the side (−1‥1), the reverb send. */
export interface ChantPlace {
  pan: number;
  air: number;
  wet: number;
}

/** A chant as a lasting sound: rendered once, looped, placed (`place`) and levelled (`SFX.level`). */
export function chantLoop(text: string, seed: number, base: number): { make: (o: SfxOut) => { level(v: number, t: number): void }; place(p: ChantPlace): void } {
  let nodes: { ctx: BaseAudioContext; air: BiquadFilterNode; pan: StereoPannerNode; send: GainNode; level: GainNode; src: AudioBufferSourceNode | null } | null = null;
  return {
    make(o) {
      // (made again after the sound was restarted: the old loop stops)
      if (nodes) {
        try {
          nodes.src?.stop();
        } catch {
          /* not started yet */
        }
        for (const n of [nodes.air, nodes.level, nodes.pan, nodes.send]) n.disconnect();
      }
      const ctx = o.ctx;
      const air = biquad(ctx, 'lowpass', 3000, 0.5);
      const level = ctx.createGain();
      level.gain.value = 0;
      const pan = ctx.createStereoPanner();
      const send = ctx.createGain();
      send.gain.value = 0.3;
      air.connect(level).connect(pan).connect(o.dry);
      pan.connect(send).connect(o.wet);
      const mine = (nodes = { ctx, air, pan, send, level, src: null as AudioBufferSourceNode | null });
      void renderChant(ctx.sampleRate, text, seed).then((buf) => {
        if (!buf || ctx.state === 'closed' || nodes !== mine) return;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(air);
        // (from a point in the text of its own, not always the first line)
        src.start(ctx.currentTime + 0.05, (seed % 7) * 0.9);
        mine.src = src;
      });
      return {
        level(v, t) {
          glide(level.gain, v * base, t, 0.6);
        },
      };
    },
    place(p) {
      if (!nodes) return;
      const t = nodes.ctx.currentTime;
      glide(nodes.pan.pan, p.pan, t, 0.2);
      glide(nodes.air.frequency, p.air, t, 0.3);
      glide(nodes.send.gain, p.wet, t, 0.3);
    },
  };
}

/** Loudness with distance (as the dawn chant: audio/temple.ts): full within 10 m, −6 dB at 40, −12 at 100, −17 at 200. */
export function chantGain(d: number): number {
  const p: readonly [number, number][] = [
    [10, 0],
    [40, -6],
    [100, -12],
    [200, -17],
    [400, -24],
  ];
  let i = 0;
  while (i < p.length - 2 && d > p[i + 1][0]) i++;
  const k = Math.min(1.5, Math.max(-0.5, Math.log(Math.max(1, d) / p[i][0]) / Math.log(p[i + 1][0] / p[i][0])));
  return 10 ** ((p[i][1] + (p[i + 1][1] - p[i][1]) * k) / 20);
}
/** Brighter close by. */
export const chantAir = (d: number): number => Math.min(9000, Math.max(700, 9000 / (1 + d / 60) ** 0.9));
/** Mostly the echo far off. */
export const chantWet = (d: number): number => 0.18 + (0.45 * d) / (d + 120);

/** The homage (three times) and the three refuges. */
const VISAK_TEXT =
  'na-mo tas-sa bha-ga-va-to a-ra-ha-to sam-mā-sam-bud-dhas-sa / na-mo tas-sa bha-ga-va-to a-ra-ha-to sam-mā-sam-bud-dhas-sa / na-mo tas-sa bha-ga-va-to a-ra-ha-to sam-mā-sam-bud-dhas-sa / bud-dhaṃ sa-ra-ṇaṃ gac-chā-mi / dham-maṃ sa-ra-ṇaṃ gac-chā-mi / saṅ-ghaṃ sa-ra-ṇaṃ gac-chā-mi';

export const VISAK_CHANT = chantLoop(VISAK_TEXT, 7, 0.9);
registerLoop('visakChant', VISAK_CHANT.make, 'ambience');

// ── One-off sounds ────────────────────────────────────────────────────────────

/** A soft rustle (the stems, a sleeve) and a tiny bright tick, as the candle and the lotus come into his hands. */
registerSfx(
  'visakGive',
  (o, gain, t) => {
    const { ctx } = o;
    const src = ctx.createBufferSource();
    src.buffer = noise('pink');
    const bp = biquad(ctx, 'bandpass', 2400, 0.9);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09 * gain, t + 0.08);
    g.gain.setTargetAtTime(0, t + 0.2, 0.09);
    src.connect(bp).connect(g).connect(o.dry);
    src.start(t, o.rnd() * 4);
    src.stop(t + 0.8);
    const tick = ctx.createOscillator();
    tick.frequency.value = mtof(86);
    const tg = ctx.createGain();
    strike(tg.gain, t + 0.28, 0.022 * gain, 0.003, 0.25);
    tick.connect(tg).connect(o.dry);
    tg.connect(o.wet);
    tick.start(t + 0.27);
    tick.stop(t + 1.4);
    tick.onended = () => [src, bp, g, tick, tg].forEach((n) => n.disconnect());
  },
  'moves',
);

/** The candle pushed into the tray's sand, the lotus laid by it: a soft dull tap and a little rustle. */
registerSfx(
  'visakPlace',
  (o, gain, t) => {
    const { ctx } = o;
    const src = ctx.createBufferSource();
    src.buffer = noise('brown');
    const lp = biquad(ctx, 'lowpass', 900, 0.7);
    const g = ctx.createGain();
    strike(g.gain, t, 0.12 * gain, 0.004, 0.06);
    src.connect(lp).connect(g).connect(o.dry);
    src.start(t, o.rnd() * 4);
    src.stop(t + 0.5);
    src.onended = () => [src, lp, g].forEach((n) => n.disconnect());
  },
  'moves',
);
