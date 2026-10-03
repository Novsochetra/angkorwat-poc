import { registerSfx } from '../audio/addonSfx';
import { mtof, range, strike } from '../audio/dsp';

/**
 * The treasure's own sound (on the interface's bus, as the figure's chime
 * when it goes into his bag): `tgShimmer`, a soft glassy shimmer now and
 * then while he is near a figure not found yet (index.ts: within
 * `SHIMMER_FAR`, louder and more often nearer), from the side it is on
 * (panned by where it is from the camera). Three or four tiny high notes
 * of a pentatonic run, quick and airy, mostly reverb: a hint, never a
 * signal.
 */

/** The next shimmer's pan (−1 left ‥ 1 right): set by `shimmer` just before it plays (the maker runs at once). */
let panNext = 0;

/** High notes of a pentatonic run (MIDI): C7, D7, E7, G7, A7, C8. */
const NOTES = [96, 98, 100, 103, 105, 108];

registerSfx(
  'tgShimmer',
  (o, gain, t) => {
    const ctx = o.ctx;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, panNext));
    const dry = ctx.createGain();
    dry.gain.value = 0.55;
    const wet = ctx.createGain();
    wet.gain.value = 0.9;
    pan.connect(dry);
    pan.connect(wet);
    dry.connect(o.dry);
    wet.connect(o.wet);
    const n = 3 + (o.rnd() < 0.5 ? 1 : 0);
    let at = Math.floor(o.rnd() * 3);
    const level = 0.035 * gain;
    let end = t;
    for (let i = 0; i < n; i++) {
      const s = t + i * range(o.rnd, 0.06, 0.09);
      const f = mtof(NOTES[Math.min(NOTES.length - 1, at)]) * range(o.rnd, 0.998, 1.002);
      at += 1 + (o.rnd() < 0.3 ? 1 : 0);
      // (a glassy note: the tone and a faint, quicker partial a twelfth up)
      for (const [ratio, amp, tau] of [
        [1, 1, 0.22],
        [3.01, 0.18, 0.08],
      ] as const) {
        const osc = ctx.createOscillator();
        osc.frequency.setValueAtTime(f * ratio, s);
        const env = ctx.createGain();
        strike(env.gain, s, level * amp * (i === n - 1 ? 0.8 : 1), 0.006, tau);
        osc.connect(env);
        env.connect(pan);
        osc.start(s);
        osc.stop(s + 0.006 + tau * 7);
        osc.onended = () => {
          osc.disconnect();
          env.disconnect();
        };
        end = Math.max(end, s + 0.006 + tau * 7);
      }
    }
    // (the panner and sends go once the last note has rung out)
    const stop = ctx.createConstantSource();
    stop.offset.value = 0;
    stop.start(t);
    stop.stop(end + 0.05);
    stop.onended = () => {
      for (const x of [pan, dry, wet, stop]) x.disconnect();
    };
  },
  'ui',
);

/** Set the next shimmer's pan (index.ts calls it just before `SFX.play('tgShimmer', gain)`). */
export function shimmerPan(p: number): void {
  panNext = p;
}
