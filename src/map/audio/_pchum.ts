import { chantLoop } from './_visak';
import { registerLoop, registerSfx } from './addonSfx';
import { biquad, noise, strike } from './dsp';

/**
 * Pchum Ben's sounds (roam/_pchumBen.ts, festival/_pchumBen.ts):
 *
 * - **the chant** (`pchumChant`, ambience bus): the monks' chant for the
 *   dead, the verses of impermanence chanted at Pchum Ben for the ancestors
 *   (Aniccā vata saṅkhārā…), from inside the lit hall while people walk round
 *   it before dawn, and from the porch in the morning as families bring food
 *   (made as Visak Bochea's: _visak.ts `chantLoop`, placed each frame);
 * - `pchumGive`: the rice balls handed over (banana leaf rustling);
 * - `pchumToss`: a ball thrown (a soft swish of the arm) and, as it lands
 *   out in the dark, the faintest pat (`gain` carries how far it flies).
 */

const PCHUM_TEXT =
  'a-nic-cā va-ta saṅ-khā-rā / up-pā-da-va-ya-dham-mi-no / up-paj-ji-tvā ni-ruj-jhan-ti / te-saṃ vū-pa-sa-mo su-kho / sab-be sat-tā ma-ran-ti ca / ma-riṃ-su ca ma-ris-sa-re / ta-the-vā-haṃ ma-ris-sā-mi / nat-thi me et-tha saṃ-sa-yo';

export const PCHUM_CHANT = chantLoop(PCHUM_TEXT, 11, 0.8);
registerLoop('pchumChant', PCHUM_CHANT.make, 'ambience');

/** Banana leaves rustling as the rice balls change hands. */
registerSfx(
  'pchumGive',
  (o, gain, t) => {
    const { ctx } = o;
    const src = ctx.createBufferSource();
    src.buffer = noise('pink');
    const bp = biquad(ctx, 'bandpass', 1700, 0.8);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.1 * gain, t + 0.06);
    g.gain.setTargetAtTime(0.03 * gain, t + 0.12, 0.05);
    g.gain.linearRampToValueAtTime(0.08 * gain, t + 0.3);
    g.gain.setTargetAtTime(0, t + 0.36, 0.08);
    src.connect(bp).connect(g).connect(o.dry);
    src.start(t, o.rnd() * 4);
    src.stop(t + 1);
    src.onended = () => [src, bp, g].forEach((n) => n.disconnect());
  },
  'moves',
);

/** The throw: a soft swish; the pat as it lands, `land` s later (the gain: 1 near, less far). */
registerSfx(
  'pchumToss',
  (o, gain, t) => {
    const { ctx } = o;
    const src = ctx.createBufferSource();
    src.buffer = noise('white');
    const bp = biquad(ctx, 'bandpass', 900, 0.7);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07 * gain, t + 0.09);
    g.gain.setTargetAtTime(0, t + 0.12, 0.05);
    bp.frequency.setValueAtTime(700, t);
    bp.frequency.exponentialRampToValueAtTime(1600, t + 0.15);
    src.connect(bp).connect(g).connect(o.dry);
    src.start(t, o.rnd() * 4);
    src.stop(t + 0.5);
    // (and the pat where it falls, soft and far)
    const pat = ctx.createBufferSource();
    pat.buffer = noise('brown');
    const lp = biquad(ctx, 'lowpass', 700, 0.7);
    const pg = ctx.createGain();
    const land = t + 0.75;
    strike(pg.gain, land, 0.05 * gain, 0.003, 0.04);
    pat.connect(lp).connect(pg).connect(o.wet);
    pg.connect(o.dry);
    pat.start(land, o.rnd() * 4);
    pat.stop(land + 0.3);
    pat.onended = () => [src, bp, g, pat, lp, pg].forEach((n) => n.disconnect());
  },
  'moves',
);
