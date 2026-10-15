import { registerSfx, type SfxOut } from './addonSfx';
import { biquad, cleanup, noise, range, strike } from './dsp';

/**
 * Paint's sounds (roam/_paint.ts, AWP-22), made with dsp.ts's helpers, a
 * little different each time (the engine's seeded `o.rnd`):
 *
 * - `paintStroke` (moves): a brush drawn over wood: two quick soft swishes,
 *   bristles on the grain (down and back up).
 * - `paintWash` (moves): a whole part painted: a longer, fuller wash of strokes,
 *   then a soft drip-like tick as the brush goes back in the pot.
 *
 * Gentle: under the hammer's work, as the home's mat.
 */

const LEVEL = { stroke: 0.3, wash: 0.26, tick: 0.12 };

/** Struck filtered noise into the bus (dry, a touch of reverb), its filter sliding from `f0` to `f1`. */
function swish(o: SfxOut, t: number, f0: number, f1: number, attack: number, tau: number, level: number): void {
  const ctx = o.ctx;
  const buf = noise('pink');
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const end = attack + tau * 6;
  const f = biquad(ctx, 'bandpass', f0, 0.9);
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + end);
  const env = ctx.createGain();
  strike(env.gain, t, level, attack, tau);
  const wet = ctx.createGain();
  wet.gain.value = 0.05;
  src.connect(f).connect(env);
  env.connect(o.dry);
  env.connect(wet).connect(o.wet);
  src.start(t, o.rnd() * (buf.duration - end - 0.1));
  src.stop(t + end);
  cleanup(src, [src, f, env, wet]);
}

registerSfx('paintStroke', (o, g, t) => {
  const r = o.rnd;
  const L = LEVEL.stroke * (0.6 + 0.4 * g) * range(r, 0.85, 1.1);
  swish(o, t, range(r, 2600, 3200), range(r, 1500, 1900), 0.05, 0.05, L);
  swish(o, t + range(r, 0.14, 0.18), range(r, 1700, 2100), range(r, 2800, 3300), 0.04, 0.045, L * 0.75);
});

registerSfx('paintWash', (o, g, t) => {
  const r = o.rnd;
  const L = LEVEL.wash * (0.6 + 0.4 * g);
  let s = t;
  for (let n = 0; n < 4; n++) {
    swish(o, s, range(r, 2200, 3000), range(r, 1400, 2000), 0.06, range(r, 0.05, 0.08), L * range(r, 0.8, 1.05));
    s += range(r, 0.13, 0.19);
  }
  // (the brush back in the pot: a soft wet tick)
  swish(o, s + 0.08, 900, 600, 0.004, 0.02, LEVEL.tick * (0.6 + 0.4 * g));
});
