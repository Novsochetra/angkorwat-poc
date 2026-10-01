import { registerSfx, type SfxOut } from './addonSfx';
import { cleanup, strike } from './dsp';

/**
 * The name card's sound (roam/_nameCard.ts, roam/_name.ts), made here with
 * dsp.ts's helpers:
 *
 * - `nameSaved` (ui): his name is written: a small bronze bell, struck once
 *   softly (two notes a fifth apart, each with the bell's own high partial),
 *   ringing out into the room. Quieter than the interface's clicks are loud:
 *   a moment, not a fanfare.
 */

/** Peak level (before the bus's volume) and how long it rings (s, time constant). */
const LEVEL = 0.16;
const RING = 0.55;

/** One struck partial: a sine at `f`, `peak` loud, ringing `tau` s, `delay` s after `t`. */
function partial(o: SfxOut, f: number, peak: number, tau: number, t: number, wet: number): void {
  const { ctx } = o;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = f;
  const g = ctx.createGain();
  strike(g.gain, t, peak, 0.004, tau);
  const send = ctx.createGain();
  send.gain.value = wet;
  osc.connect(g);
  g.connect(o.dry);
  g.connect(send);
  send.connect(o.wet);
  osc.start(t);
  osc.stop(t + tau * 7 + 0.05);
  cleanup(osc, [osc, g, send]);
}

registerSfx(
  'nameSaved',
  (o, gain, t) => {
    const p = LEVEL * gain;
    // (C6 then G6 a breath later; each with the bell's minor-third hum and its bright 2.76× partial)
    for (const [f, at, k] of [
      [1046.5, 0, 1],
      [1568, 0.11, 0.8],
    ] as const) {
      partial(o, f, p * k, RING, t + at, 0.35);
      partial(o, f * 1.19, p * k * 0.18, RING * 0.6, t + at, 0.35);
      partial(o, f * 2.76, p * k * 0.12, RING * 0.25, t + at, 0.2);
    }
  },
  'ui',
);
