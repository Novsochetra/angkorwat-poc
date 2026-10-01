import { biquad, noise, range, strike } from './dsp';
import { registerLoop, registerSfx, type SfxOut } from './addonSfx';

/**
 * Riding the ox cart (roam/_cartRide.ts), the sounds of his own (addonSfx.ts,
 * on the explorer's bus): the cart's own creak and the oxen's bells are the
 * people's (audio/people.ts), heard close by as he sits over the axle.
 *
 * - `cartRoll` (lasting): the tall wooden wheels rolling on the dirt of the
 *   dike under him: a low rumble swelling a little with each turn of the
 *   wheels, and some grit; `SFX.level` with how fast the cart goes (0
 *   standing ‥ 1 its pace). Gentle: under his footsteps.
 * - `cartKnock`: a hub knocking on the axle, a dull wooden tok (the ride plays
 *   one every metre and a half the cart goes; `gain` 0‥1).
 * - `cartClimb`: sitting down on the let-down tailboard: a dull knock of the
 *   planks and the straw of the load rustling behind his back (`gain` 0‥1).
 */

/** Levels (the explorer's bus: his paddle is 1, the boat's wake 0.24). */
const ROLL = 0.2;
const KNOCK = 0.45;
const RUSTLE = 0.16;

registerLoop(
  'cartRoll',
  (o: SfxOut) => {
    const { ctx, rnd } = o;
    /** The sound while it plays (made when it is first heard again, let go a moment after it goes quiet). */
    let live: { env: GainNode; stop(t: number): void } | null = null;
    const make = () => {
      const t0 = ctx.currentTime;
      const loop = (b: AudioBuffer) => {
        const s = ctx.createBufferSource();
        s.buffer = b;
        s.loop = true;
        s.start(t0, rnd() * b.duration);
        return s;
      };
      const env = ctx.createGain();
      env.gain.value = 0;
      // The rumble of the rims on the packed earth (brown noise, low), swelling a little with each turn of the wheels.
      const rumble = loop(noise('brown'));
      const low = biquad(ctx, 'lowpass', 260, 0.7);
      const lowGain = ctx.createGain();
      lowGain.gain.value = 0.9;
      // Grit and small stones under the rims (pink noise, a band in the middle), softer.
      const grit = loop(noise('pink'));
      const band = biquad(ctx, 'bandpass', range(rnd, 850, 1050), 0.9);
      const gritGain = ctx.createGain();
      gritGain.gain.value = 0.12;
      // The swell with the turn of the wheels (each wheel a little out of round).
      const sway = ctx.createOscillator();
      sway.frequency.value = range(rnd, 0.11, 0.15);
      const swayDepth = ctx.createGain();
      swayDepth.gain.value = 0.18;
      const swell = ctx.createGain();
      swell.gain.value = 1;
      sway.connect(swayDepth).connect(swell.gain);
      sway.start(t0);
      rumble.connect(low).connect(lowGain).connect(swell);
      grit.connect(band).connect(gritGain).connect(swell);
      swell.connect(env);
      env.connect(o.dry);
      const wet = ctx.createGain();
      wet.gain.value = 0.05;
      env.connect(wet).connect(o.wet);
      const nodes: AudioNode[] = [rumble, low, lowGain, grit, band, gritGain, sway, swayDepth, swell, env, wet];
      rumble.onended = () => {
        for (const n of nodes) n.disconnect();
      };
      return {
        env,
        stop(t: number) {
          for (const s of [rumble, grit, sway]) s.stop(t);
        },
      };
    };
    return {
      level(v: number, t: number) {
        if (v > 0) {
          live ??= make();
          live.env.gain.setTargetAtTime(ROLL * v, t, 0.35);
        } else if (live) {
          // (quiet: it fades, then its sources stop and its nodes go)
          live.env.gain.setTargetAtTime(0, t, 0.35);
          live.stop(t + 2.5);
          live = null;
        }
      },
    };
  },
  'moves',
);

registerSfx(
  'cartKnock',
  (o: SfxOut, gain: number, t: number) => {
    const { ctx, rnd } = o;
    const src = ctx.createBufferSource();
    src.buffer = noise('pink');
    const wood = biquad(ctx, 'bandpass', range(rnd, 280, 360), 3);
    const g = ctx.createGain();
    strike(g.gain, t, KNOCK * 0.55 * gain, 0.003, range(rnd, 0.025, 0.04));
    const pan = ctx.createStereoPanner();
    pan.pan.value = range(rnd, -0.35, 0.35);
    src.connect(wood).connect(g).connect(pan).connect(o.dry);
    src.start(t, rnd() * 2);
    src.stop(t + 0.25);
    src.onended = () => {
      for (const n of [src, wood, g, pan]) n.disconnect();
    };
  },
  'moves',
);

registerSfx(
  'cartClimb',
  (o: SfxOut, gain: number, t: number) => {
    const { ctx, rnd } = o;
    const out = ctx.createGain();
    out.gain.value = gain;
    out.connect(o.dry);
    const wet = ctx.createGain();
    wet.gain.value = 0.06;
    out.connect(wet).connect(o.wet);
    // The knock of the planks as he sits down on them.
    const thud = ctx.createBufferSource();
    thud.buffer = noise('brown');
    const tone = biquad(ctx, 'bandpass', range(rnd, 170, 220), 1.4);
    const tg = ctx.createGain();
    strike(tg.gain, t, KNOCK, 0.004, 0.07);
    thud.connect(tone).connect(tg).connect(out);
    thud.start(t, rnd() * 2);
    thud.stop(t + 0.5);
    // The straw rustling behind his back.
    const straw = ctx.createBufferSource();
    straw.buffer = noise('white');
    const hp = biquad(ctx, 'highpass', range(rnd, 2400, 3200), 0.7);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0, t);
    sg.gain.linearRampToValueAtTime(RUSTLE, t + 0.06);
    sg.gain.setTargetAtTime(0, t + 0.12, 0.12);
    straw.connect(hp).connect(sg).connect(out);
    straw.start(t, rnd() * 2);
    straw.stop(t + 0.9);
    straw.onended = () => {
      for (const n of [thud, tone, tg, straw, hp, sg, out, wet]) n.disconnect();
    };
  },
  'moves',
);
