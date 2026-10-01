import { registerSfx, type SfxOut } from './addonSfx';
import { range } from './dsp';
import { line, Voice } from './voice';

/**
 * The equinox sunrise's sounds (roam/_equinox.ts plays them, levelled by how
 * near the crowd in front of Angkor Wat is), made here:
 *
 * - `equiOoh` (ambience): the crowd's soft, wondering "ooh" as the sun reaches
 *   the central tower — a dozen voices, men's and women's, each a warm buzz
 *   through the "oo" vowel's two formants (with a breath of air), rising a
 *   little then falling away, started a moment apart, in the valley's echo.
 * - `equiShutters` (ambience): phones' and cameras' shutters round the crowd —
 *   quiet double clicks scattered over a few seconds.
 *
 * Gentle: rendered alone the "ooh" peaks at ≈ 0.09 and the shutters at ≈ 0.03
 * before the bus's volume (the umbrella's opening, a sound of his own: ≈ 0.2).
 */

/** Peak levels (before the bus's volume). */
const LEVEL = { ooh: 0.24, shutter: 0.14 };

/** One voice's "ooh" from `t0`: a buzz at `f0` Hz through the vowel's formants, up `rise` then down, `len` s. */
function ooh(o: SfxOut, v: Voice, t0: number, f0: number, len: number, rise: number, peak: number): void {
  const src = v.osc('sawtooth', t0, t0 + len + 0.1, f0);
  // (the pitch: up a little as the voice opens, then sinking away; a slow waver)
  line(src.frequency, t0, [
    [0, f0 * 0.97],
    [len * 0.3, f0 * (1 + rise)],
    [len, f0 * (1 - rise * 0.6)],
  ]);
  v.lfo(src.frequency, range(o.rnd, 4.5, 6), f0 * 0.008, t0, t0 + len);
  // "oo": F1 ≈ 320 Hz, F2 ≈ 870 Hz (a woman's a little higher), the top softened away.
  const hi = f0 > 170 ? 1.12 : 1;
  const amp = v.gain(0);
  const f1 = v.filter('bandpass', 320 * hi, 5);
  const f2 = v.filter('bandpass', 870 * hi, 7);
  const f2g = v.gain(0.35);
  const soft = v.filter('lowpass', 1400, 0.6);
  src.connect(f1).connect(amp);
  src.connect(f2).connect(f2g).connect(amp);
  // (the breath in it)
  const air = v.noise('pink', t0, t0 + len + 0.1);
  const airBand = v.filter('bandpass', 420 * hi, 2.2);
  air.connect(airBand).connect(v.gain(0.05)).connect(amp);
  amp.connect(soft).connect(v.out);
  line(amp.gain, t0, [
    [0, 0],
    [len * 0.28, peak],
    [len * 0.55, peak * 0.8],
    [len, 0],
  ]);
}

registerSfx(
  'equiOoh',
  (o, gain, t) => {
    const v = new Voice(o.ctx, o.rnd);
    v.out.gain.value = LEVEL.ooh * gain;
    v.out.connect(o.dry);
    v.out.connect(v.gain(0.55)).connect(o.wet);
    // A dozen voices, men's and women's (and a child's), a moment apart.
    for (let k = 0; k < 12; k++) {
      const voice = k % 3;
      const f0 = voice === 0 ? range(o.rnd, 105, 140) : voice === 1 ? range(o.rnd, 195, 245) : range(o.rnd, 260, 300);
      ooh(o, v, t + range(o.rnd, 0, 0.7), f0, range(o.rnd, 1.6, 2.3), range(o.rnd, 0.04, 0.09), range(o.rnd, 0.5, 1) / 12 ** 0.5);
    }
    v.play();
  },
  'ambience',
);

registerSfx(
  'equiShutters',
  (o, gain, t) => {
    const v = new Voice(o.ctx, o.rnd);
    v.out.gain.value = LEVEL.shutter * gain;
    v.out.connect(o.dry);
    v.out.connect(v.gain(0.3)).connect(o.wet);
    // A shutter: two quick clicks (the curtain going and coming back), a phone's a little softer.
    const click = (at: number, level: number) => {
      const n = v.noise('white', at, at + 0.03);
      const band = v.filter('bandpass', range(o.rnd, 2600, 4200), 1.4);
      const g = v.gain(0);
      n.connect(band).connect(g).connect(v.out);
      line(g.gain, at, [
        [0, 0],
        [0.002, level],
        [0.012, 0],
      ]);
    };
    for (let k = 0; k < 9; k++) {
      const at = t + range(o.rnd, 0, 3.2);
      const level = range(o.rnd, 0.35, 1);
      click(at, level);
      click(at + range(o.rnd, 0.05, 0.09), level * 0.7);
    }
    v.play();
  },
  'ambience',
);
