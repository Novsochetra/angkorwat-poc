import { registerSfx, type SfxOut } from './addonSfx';
import { mtof, range, strike } from './dsp';

/**
 * The calendar of events' sounds (roam/_calendar.ts), on the interface's bus:
 *
 * - `whenChime`: an event begins (the toast): two soft notes of a small bronze
 *   bell, a fourth apart and rising (G5, C6), the second a little quieter;
 *   gentler than the golden figure's four-note chime (audio/explorer.ts `gold`).
 * - `whenWait`: "Wait for it" (the view fades out): one low, slow bell note
 *   that rings on under the fade.
 */

/** A small bell's note at `f`: a clear partial and a few softer, quicker ones above it (as explorer.ts `bell`), dry and a little reverb. */
function bell(o: SfxOut, t: number, f: number, level: number, ring: number): void {
  const ctx = o.ctx;
  const parts: [number, number, number][] = [
    [1, 1, 1.5 * ring],
    [2.0, 0.28, 0.9 * ring],
    [2.74, 0.16, 0.55 * ring],
    [5.4, 0.04, 0.22 * ring],
  ];
  for (const [ratio, amp, tau] of parts) {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(f * ratio * range(o.rnd, 0.999, 1.001), t);
    const env = ctx.createGain();
    strike(env.gain, t, level * amp, 0.004, tau);
    const wet = ctx.createGain();
    wet.gain.value = 0.45;
    osc.connect(env);
    env.connect(o.dry);
    env.connect(wet);
    wet.connect(o.wet);
    osc.start(t);
    osc.stop(t + 0.004 + tau * 7);
    osc.onended = () => {
      for (const n of [osc, env, wet]) n.disconnect();
    };
  }
}

registerSfx(
  'whenChime',
  (o, gain, t) => {
    const g = 0.5 + 0.5 * gain;
    bell(o, t, mtof(79), 0.11 * g, 1);
    bell(o, t + 0.17, mtof(84), 0.085 * g, 1.1);
  },
  'ui',
);

registerSfx(
  'whenWait',
  (o, gain, t) => {
    bell(o, t, mtof(67), 0.09 * (0.5 + 0.5 * gain), 1.6);
  },
  'ui',
);
