import { registerLoop, registerSfx, type SfxOut } from './addonSfx';
import { biquad, noise, range } from './dsp';
import { Voice } from './voice';

/**
 * The zip line's sounds (roam/_zipRide.ts), made with the Web Audio API as
 * the explorer's own are, a little different every time, on the explorer's
 * bus ("moves"):
 *
 * - `zipClip`: the carabiner snapping onto his harness's ring (or off it):
 *   the gate's sharp click, the steel ringing a moment, the gate shutting;
 * - `zipBrake`: the trolley hitting the brake block at the end of a line:
 *   a dull thud of the rubber, a clank of steel, the spring's short boing,
 *   the cable's low twang running away along it (louder the faster he came);
 * - `zipWhirr` (lasting): the trolley's two pulleys rolling on the steel
 *   cable, a rough hum that rises in pitch and loudness with his speed, the
 *   cable's hiss over it, a slow waver as the cable shakes (the level is his
 *   speed; the wind's rush past his ears is the roaming wind sound, set by
 *   the ride).
 *
 * Levels sit with the footsteps and the paddle: the whirr at full speed about
 * as loud as running, the clip a small sharp click, the brake a firm bump.
 */

const LEVEL = { clip: 0.45, brake: 0.7, whirr: 0.32 };
/** A lasting sound silent this long stops its sources (ms); the next level over 0 makes them again. */
const IDLE = 3000;

function voice(o: SfxOut, level: number, wet: number): Voice {
  const v = new Voice(o.ctx, o.rnd);
  v.out.gain.value = level;
  v.out.connect(o.dry);
  if (wet > 0) v.out.connect(v.gain(wet)).connect(o.wet);
  return v;
}

/** Up to `peak` in `a` s, then dying with time constant `tau`. */
function hit(p: AudioParam, t: number, peak: number, a: number, tau: number): void {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + Math.max(0.0005, a));
  p.setTargetAtTime(0, t + a, tau);
}

/** A short burst of noise through a filter. */
function burst(v: Voice, t: number, kind: 'white' | 'pink' | 'brown', type: BiquadFilterType, f: number, q: number, peak: number, a: number, tau: number): void {
  const g = v.gain();
  v.noise(kind, t, t + a + tau * 7).connect(v.filter(type, f, q)).connect(g).connect(v.out);
  hit(g.gain, t, peak, a, tau);
}

/** A struck tone (steel ringing). */
function ping(v: Voice, t: number, f: number, peak: number, tau: number, wave: OscillatorType = 'sine'): void {
  const g = v.gain();
  v.osc(wave, t, t + tau * 7, f).connect(g).connect(v.out);
  hit(g.gain, t, peak, 0.001, tau);
}

registerSfx('zipClip', (o, gain, t) => {
  const r = o.rnd;
  const v = voice(o, LEVEL.clip * (0.6 + 0.4 * gain), 0.06);
  // The gate opened on the ring: a sharp tick; then it snaps shut: the click, the steel ringing a little.
  burst(v, t, 'white', 'bandpass', range(r, 3800, 4600), 2.2, 0.35, 0.0008, 0.006);
  const shut = t + range(r, 0.05, 0.08);
  burst(v, shut, 'white', 'bandpass', range(r, 4400, 5400), 1.8, 0.9, 0.0006, 0.008);
  burst(v, shut, 'white', 'highpass', 7000, 0.7, 0.3, 0.0005, 0.004);
  ping(v, shut, range(r, 2700, 3000), 0.06, 0.05);
  ping(v, shut + 0.001, range(r, 5100, 5600), 0.035, 0.03);
  // (the lanyard's webbing tugged taut)
  burst(v, shut + 0.02, 'pink', 'bandpass', 900, 0.9, 0.12, 0.01, 0.04);
  v.play();
});

registerSfx('zipBrake', (o, gain, t) => {
  const r = o.rnd;
  const v = voice(o, LEVEL.brake * (0.35 + 0.65 * gain), 0.14);
  // The rubber block's thud, a clank of the trolley's steel on it.
  burst(v, t, 'brown', 'lowpass', range(r, 200, 260), 0.8, 1, 0.004, 0.07);
  ping(v, t + 0.003, range(r, 880, 960), 0.16 * gain, 0.09, 'triangle');
  ping(v, t + 0.004, range(r, 1650, 1820), 0.08 * gain, 0.06);
  burst(v, t + 0.002, 'white', 'bandpass', range(r, 2600, 3200), 1.4, 0.25 * gain, 0.001, 0.02);
  // The spring squeezed and letting go: a short boing (a low tone falling, wavering).
  const f = range(r, 300, 340);
  const bo = v.osc('triangle', t + 0.02, t + 0.6, f);
  bo.frequency.setValueAtTime(f, t + 0.02);
  bo.frequency.exponentialRampToValueAtTime(f * 0.62, t + 0.45);
  v.lfo(bo.frequency, 16, f * 0.05, t + 0.02, t + 0.6);
  const bg = v.gain();
  bo.connect(v.filter('lowpass', 1200, 0.7)).connect(bg).connect(v.out);
  hit(bg.gain, t + 0.02, 0.09 * (0.4 + 0.6 * gain), 0.01, 0.13);
  // The cable's twang running away along it: a low pluck with its overtones, dying slowly.
  const c = range(r, 62, 74);
  for (const [k, amp, tau] of [
    [1, 0.22, 0.45],
    [2.01, 0.12, 0.3],
    [3.03, 0.07, 0.2],
  ] as const)
    ping(v, t + 0.006, c * k, amp * gain, tau, 'triangle');
  v.play();
});

registerLoop('zipWhirr', (o) => {
  let made: { stop(): void; set(v: number, t: number): void } | null = null;
  let timer = 0;
  const make = () => {
    const ctx = o.ctx;
    const env = ctx.createGain();
    env.gain.value = 0;
    env.connect(o.dry);
    // The pulleys: a rough hum (a buzzy wave) through two resonances, its pitch with the speed.
    const hum = ctx.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = 60;
    const hum2 = ctx.createOscillator();
    hum2.type = 'square';
    hum2.frequency.value = 61.3;
    const hb = biquad(ctx, 'bandpass', 700, 1.6);
    const hb2 = biquad(ctx, 'bandpass', 1900, 3);
    const hg = ctx.createGain();
    hg.gain.value = 0.22;
    const hg2 = ctx.createGain();
    hg2.gain.value = 0.05;
    hum.connect(hb).connect(hg).connect(env);
    hum2.connect(hb2).connect(hg2).connect(env);
    // The cable's hiss under the wheels.
    const hiss = ctx.createBufferSource();
    hiss.buffer = noise('pink');
    hiss.loop = true;
    const nb = biquad(ctx, 'bandpass', 2600, 0.9);
    const ng = ctx.createGain();
    ng.gain.value = 0.55;
    hiss.connect(nb).connect(ng).connect(env);
    // (a slow waver of the level: the cable shaking under him)
    const wob = ctx.createOscillator();
    wob.frequency.value = range(o.rnd, 5.5, 7.5);
    const wg = ctx.createGain();
    wg.gain.value = 0;
    wob.connect(wg).connect(env.gain);
    const t = ctx.currentTime;
    hum.start(t);
    hum2.start(t);
    hiss.start(t, o.rnd() * hiss.buffer.duration);
    wob.start(t);
    const nodes: AudioNode[] = [hum, hum2, hb, hb2, hg, hg2, hiss, nb, ng, wob, wg, env];
    return {
      stop() {
        for (const s of [hum, hum2, hiss, wob]) s.stop();
        for (const n of nodes) n.disconnect();
      },
      set(v: number, at: number) {
        // (v: the speed, 0‥1 of the fastest; the strands' rumble and the wheels' whine climb with it)
        const f = 38 + 120 * v;
        hum.frequency.setTargetAtTime(f, at, 0.08);
        hum2.frequency.setTargetAtTime(f * 2.02, at, 0.08);
        hb.frequency.setTargetAtTime(500 + 900 * v, at, 0.1);
        hb2.frequency.setTargetAtTime(1500 + 1600 * v, at, 0.1);
        nb.frequency.setTargetAtTime(1800 + 2200 * v, at, 0.1);
        const level = v > 0 ? LEVEL.whirr * Math.min(1, 0.25 + v) * Math.sqrt(v) : 0;
        env.gain.setTargetAtTime(level, at, v > 0 ? 0.05 : 0.12);
        wg.gain.setTargetAtTime(level * 0.18, at, 0.1);
      },
    };
  };
  return {
    level(v, t) {
      clearTimeout(timer);
      if (v > 0 && !made) made = make();
      if (!made) return;
      made.set(v, t);
      if (v <= 0) {
        const was = made;
        timer = window.setTimeout(() => {
          if (made !== was) return;
          was.stop();
          made = null;
        }, IDLE);
      }
    },
  };
});
