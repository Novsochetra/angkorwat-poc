import { ACTIONS } from '../garden/actions';
import { registerLoop, registerSfx, type SfxOut } from './addonSfx';
import { biquad, mtof, noise, range, source, strike, type NoiseKind, type SourceName } from './dsp';
import { footstepsState, loadFootsteps, type StepSet, type StepSets } from './footsteps';

/**
 * His home garden's sounds (map/garden/actions.ts `GardenSfx`: the beat that
 * plays each, and the two lasting ones' spans), made here with dsp.ts's
 * helpers as the explorer's own are (audio/explorer.ts), a little different
 * every time (the engine's seeded `o.rnd`). The work on his `moves` bus, the
 * four notes about his plants on the interface's (`ui`):
 *
 * - `gardenHoe`: the hoe (ចប) biting into earth — a dull chop, the clod
 *   breaking, crumbs scattering round it; now and then the blade rings on a
 *   small stone. Under it, when the recorded footsteps are loaded
 *   (footsteps.ts), the earth step's own thud slowed down: the same earth he
 *   walks on.
 * - `gardenSeed`: a seed, a cutting or a root ball set in the hole: a soft
 *   drop, a little earth trickling in after it.
 * - `gardenPat`: his palm patting the earth flat: a soft dull pat.
 * - `gardenTear`: the black nursery bag torn off: thin plastic ripping in
 *   quick crackles, a crinkle as it comes away.
 * - `gardenPour` (lasting): the water from the can's rose falling on leaves
 *   and earth — a patter of drops (on leaves), the streams' hiss, the earth
 *   drinking it (dark); `SFX.level(v)`: 1 over a leafy plant, about 0.6 on
 *   bare earth (a seed just set: darker, no leaves' patter), 0 stops it (a
 *   smooth fade, the last drops off the rose).
 * - `gardenFill` (lasting): the can under water, filling: gulps of air
 *   bubbling out, a hollow note rising as the air inside shrinks (over the
 *   `fill` action's loop span); 0 lifts it out: water running off it, drips.
 * - `gardenDip`: the can pushed into the jar or the stream: a splash and a
 *   bloop.
 * - `gardenSnap`: a fruit twisted off its stalk: a fibrous snap, the branch
 *   springing back.
 * - `gardenRustle`: leaves shaken as he reaches in among them.
 * - `gardenChop`: the knife through a cane or a bunch's stalk: a swish, a
 *   juicy woody crack.
 * - `gardenPole`: the bamboo picking pole knocking up in the crown (a hollow
 *   tok), the fruit dropping into its little basket.
 * - `gardenThud`: ripe fruit falling on the earth (a durian, a coconut):
 *   heavy and short.
 * - `gardenPull`: roots tearing out of the earth as he tugs.
 * - `gardenToss`: the dead plant thrown on the heap: a swish, dry twigs
 *   landing.
 * - `gardenBasket`: fruit laid in his woven bamboo basket: a soft thunk, the
 *   weave creaking.
 * - `gardenSprout` (ui): a soft rising chime (a first sprout, a plant grown).
 * - `gardenRipe` (ui): two bright notes (ripe to pick).
 * - `gardenThirst` (ui): a dry low note (a plant wants water).
 * - `gardenDied` (ui): a soft falling note (a plant has died).
 *
 * Levels (measured offline, as heard at the default sliders): the hoe, the
 * chop, the dip and the thud about as loud as a walking step on earth; the
 * pat, the seed, the rustle, the basket and the snap softer, like the farm
 * work's (audio/_farm.ts); the pour a little under a step; the four notes
 * about as soft as the calendar's bell (audio/_calendar.ts).
 */

/** Peak levels before the bus's volume (each sound's parts are shares of its own). */
const LEVEL = {
  hoe: 1.05,
  seed: 0.5,
  pat: 0.62,
  tear: 0.6,
  pour: 0.165,
  fill: 0.12,
  dip: 0.66,
  snap: 1.45,
  rustle: 0.36,
  chop: 0.92,
  pole: 0.24,
  thud: 0.68,
  pull: 0.58,
  toss: 0.42,
  basket: 0.8,
  /** The interface's notes (on the ui bus, whose slider is full by default: the calendar's bell is 0.11). */
  note: 0.085,
};
/** A lasting sound silent this long stops its sources (ms); the next level over 0 makes them again. */
const IDLE = 3000;
/** The can fills over the `fill` action's loop: the hollow note rises over this long (s). */
const FILL_LEN = ACTIONS.fill.loop ? ACTIONS.fill.loop.to - ACTIONS.fill.loop.from : 1.35;

// ── The recorded footsteps (footsteps.ts), for the earth's own thud ─────────

let steps: StepSets | null = null;
let asked = false;

/** The recorded footsteps once cut (null until then: the sounds are all synthesized meanwhile). */
function recorded(): StepSets | null {
  if (!steps && !asked && footstepsState().state !== 'idle') void warmGardenSounds();
  return steps;
}

/** Fetch the cut footsteps for the earth's thud (the map's sound loads them anyway; checks await it). */
export async function warmGardenSounds(): Promise<void> {
  asked = true;
  const s = await loadFootsteps();
  if (s) steps = s;
  else asked = false;
}

// (once the map's sound has cut its footsteps, take them, so the first chop has them too: a few light looks, never in a still)
if (typeof window !== 'undefined' && new URLSearchParams(location.search).get('shot') !== '1') {
  let looks = 0;
  const look = () => {
    const st = footstepsState().state;
    if (st === 'ready' || st === 'partial') void warmGardenSounds();
    else if (st !== 'failed' && ++looks < 60) window.setTimeout(look, 3000);
  };
  window.setTimeout(look, 3000);
}

// ── Building blocks ─────────────────────────────────────────────────────────

interface Burst {
  kind?: NoiseKind;
  /** A named loop of dsp.ts instead of noise (leaves, grit, splashes). */
  src?: SourceName;
  type: BiquadFilterType;
  f0: number;
  f1?: number;
  q?: number;
  attack: number;
  tau: number;
  level: number;
  pan?: number;
  wet?: number;
  /** Played faster (higher) or slower. */
  rate?: number;
}

/** Filtered noise, struck: it rises in `attack`, dies away with `tau`; its filter slides from `f0` to `f1`. */
function burst(o: SfxOut, t: number, b: Burst): void {
  const { ctx } = o;
  const buf = b.src ? source(b.src) : noise(b.kind ?? 'white');
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  if (b.rate) src.playbackRate.value = b.rate;
  const end = b.attack + b.tau * 7;
  const f = biquad(ctx, b.type, b.f0, b.q ?? 0.7);
  if (b.f1 && b.f1 !== b.f0) {
    f.frequency.setValueAtTime(b.f0, t);
    f.frequency.exponentialRampToValueAtTime(b.f1, t + b.attack + b.tau * 3);
  }
  const env = ctx.createGain();
  strike(env.gain, t, b.level, b.attack, b.tau);
  const nodes: AudioNode[] = [src, f, env];
  let last: AudioNode = src.connect(f).connect(env);
  if (b.pan) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, b.pan));
    last = last.connect(p);
    nodes.push(p);
  }
  last.connect(o.dry);
  if (b.wet) {
    const w = ctx.createGain();
    w.gain.value = b.wet;
    last.connect(w).connect(o.wet);
    nodes.push(w);
  }
  src.start(t, o.rnd() * buf.duration);
  src.stop(t + end);
  src.onended = () => {
    for (const n of nodes) n.disconnect();
  };
}

/** A struck sine (or `wave`) sliding from `f0` to `f1` over `glide` s. */
function tone(o: SfxOut, t: number, f0: number, f1: number, attack: number, tau: number, level: number, wet = 0, glide = tau * 3, wave: OscillatorType = 'sine'): void {
  const { ctx } = o;
  const osc = ctx.createOscillator();
  osc.type = wave;
  osc.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + attack + glide);
  const env = ctx.createGain();
  strike(env.gain, t, level, attack, tau);
  osc.connect(env).connect(o.dry);
  const nodes: AudioNode[] = [osc, env];
  if (wet) {
    const w = ctx.createGain();
    w.gain.value = wet;
    env.connect(w).connect(o.wet);
    nodes.push(w);
  }
  osc.start(t);
  osc.stop(t + attack + tau * 8);
  osc.onended = () => {
    for (const n of nodes) n.disconnect();
  };
}

/** Earth crumbs, clods or grit landing round him: `n` tiny ticks over `spread` s, thinning out. */
function crumbs(o: SfxOut, t: number, n: number, spread: number, level: number, lo = 1400, hi = 4200): void {
  const r = o.rnd;
  for (let i = 0; i < n; i++) {
    const at = t + spread * r() ** 1.6;
    const f = lo * (hi / lo) ** r();
    burst(o, at, { type: 'bandpass', f0: f, q: 1.4, attack: 0.0008, tau: range(r, 0.0025, 0.007), level: level * range(r, 0.25, 1) * (1 - 0.5 * ((at - t) / spread)), pan: range(r, -0.35, 0.35), wet: 0.04 });
  }
}

/** Leaves brushing: a steady soft brush (pink noise) with the leaves' crackle over it (dsp.ts' rustle loop), so every one is about as loud. */
function leaves(o: SfxOut, t: number, f0: number, f1: number, attack: number, tau: number, level: number, pan = 0, wet = 0.05): void {
  burst(o, t, { kind: 'pink', type: 'bandpass', f0, f1, q: 0.7, attack, tau, level: level * 0.7, pan, wet });
  burst(o, t, { src: 'rustle', type: 'bandpass', f0: f0 * 1.1, f1: f1 * 1.1, q: 0.6, attack, tau, level: level * 0.4, pan, wet });
}

/** A drop of water: off a leaf onto earth (`soft`), or into water: a tiny plip rising like a bubble's. */
function drop(o: SfxOut, t: number, level: number, intoWater: boolean): void {
  const r = o.rnd;
  if (intoWater) {
    const f = range(r, 900, 1600);
    tone(o, t, f, f * range(r, 1.4, 1.8), 0.001, range(r, 0.01, 0.018), level, 0.12);
    burst(o, t, { type: 'bandpass', f0: range(r, 2500, 3400), q: 2, attack: 0.0005, tau: 0.003, level: level * 0.4, wet: 0.1 });
  } else {
    burst(o, t, { kind: 'pink', type: 'bandpass', f0: range(r, 1300, 2600), q: 1.6, attack: 0.0008, tau: range(r, 0.004, 0.008), level, pan: range(r, -0.2, 0.2), wet: 0.05 });
  }
}

/** A recorded earth step (footsteps.ts' `set`), slowed and darkened into the thud of something on the earth; false if not loaded. */
function earth(o: SfxOut, t: number, set: StepSet, level: number, rate: number, lp: number, len: number): boolean {
  const s = recorded()?.[set];
  if (!s?.length) return false;
  const { ctx } = o;
  const buf = s[Math.floor(o.rnd() * s.length)];
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const f = biquad(ctx, 'lowpass', lp, 0.6);
  const env = ctx.createGain();
  // (only its first moment: the heel's thud, not the roll of the foot; faded out over the last third)
  const dur = Math.min(len, buf.duration / rate);
  env.gain.setValueAtTime(level, t);
  env.gain.setValueAtTime(level, t + dur * 0.6);
  env.gain.linearRampToValueAtTime(0, t + dur);
  src.connect(f).connect(env).connect(o.dry);
  src.start(t);
  src.stop(t + dur + 0.01);
  src.onended = () => {
    for (const n of [src, f, env]) n.disconnect();
  };
  return true;
}

/** A soft bell or chime note (the interface's): a clear partial, a quiet octave and a quicker high one; `fall` slides it down. */
function chime(o: SfxOut, t: number, f: number, level: number, ring: number, wet = 0.4, fall = 1): void {
  const parts: [number, number, number][] = [
    [1, 1, 1],
    [2.0, 0.22, 0.6],
    [3.0, 0.07, 0.35],
    [4.16, 0.03, 0.2],
  ];
  for (const [k, a, d] of parts) tone(o, t, f * k * range(o.rnd, 0.999, 1.001), f * k * fall, 0.005, ring * d, level * a, wet, ring * 1.5);
}

/** A struck bamboo or wooden bar (a hollow tok): a few partials of a tube, quick. */
function tok(o: SfxOut, t: number, f: number, level: number, tau: number, wet = 0.08): void {
  for (const [k, a, d] of [
    [1, 1, 1],
    [2.63, 0.35, 0.55],
    [4.4, 0.12, 0.3],
  ] as const)
    tone(o, t, f * k, f * k * 0.985, 0.0015, tau * d, level * a, wet);
  burst(o, t, { type: 'bandpass', f0: f * 3.2, q: 1.5, attack: 0.0005, tau: 0.004, level: level * 0.5, wet });
}

// ── Planting ────────────────────────────────────────────────────────────────

registerSfx('gardenHoe', (o, g, t) => {
  const r = o.rnd;
  const L = LEVEL.hoe * (0.55 + 0.45 * g) * range(r, 0.85, 1.1);
  const pan = range(r, -0.12, 0.12);
  // (the clod's give: some chops bite hard earth, some loose)
  const hard = r();
  // The blade's bite: a dull chop of earth, a low thump of the hoe's weight behind it.
  const rec = earth(o, t, 'concrete', L * 0.5, range(r, 0.62, 0.74), 650 + 400 * hard, 0.16);
  burst(o, t, { kind: 'brown', type: 'lowpass', f0: range(r, 800, 1100), f1: range(r, 220, 300), attack: 0.0015, tau: range(r, 0.028, 0.04), level: L * (rec ? 0.5 : 0.85), pan, wet: 0.05 });
  tone(o, t + 0.002, range(r, 95, 125), range(r, 55, 70), 0.002, 0.035, L * (rec ? 0.1 : 0.16), 0.03);
  // The clod breaking: grit crunching, brighter in hard earth.
  burst(o, t + 0.004, { src: 'crunch', type: 'bandpass', f0: range(r, 900, 1300) * (0.85 + 0.4 * hard), q: 0.9, attack: 0.002, tau: range(r, 0.03, 0.05), level: L * 0.55, pan, wet: 0.04 });
  burst(o, t + 0.01, { kind: 'pink', type: 'bandpass', f0: range(r, 450, 650), q: 1.1, attack: 0.003, tau: 0.035, level: L * 0.3, pan });
  // (now and then the blade meets a pebble: a short dull ring)
  if (r() < 0.22) tone(o, t + 0.003, range(r, 2300, 3200), range(r, 2200, 3000), 0.001, range(r, 0.012, 0.02), L * 0.035, 0.08, 0.04, 'triangle');
  // The crumbs: thrown up by the blade, pattering down round it.
  crumbs(o, t + range(r, 0.05, 0.09), 6 + Math.floor(r() * 7), range(r, 0.22, 0.34), L * 0.16, 1300, 4200);
  // (a soft sprinkle: loose earth sliding back)
  burst(o, t + range(r, 0.08, 0.12), { src: 'crunch', type: 'bandpass', f0: range(r, 2000, 2800), q: 0.8, attack: 0.04, tau: 0.06, level: L * 0.12, pan: -pan, wet: 0.03 });
});

registerSfx('gardenSeed', (o, g, t) => {
  const r = o.rnd;
  const L = LEVEL.seed * (0.55 + 0.45 * g) * range(r, 0.9, 1.1);
  // Set down in the soft earth of the hole: a soft low drop, a little earth trickling in after it.
  burst(o, t, { kind: 'brown', type: 'lowpass', f0: range(r, 600, 800), f1: 250, attack: 0.003, tau: 0.03, level: L, wet: 0.03 });
  burst(o, t + 0.002, { kind: 'pink', type: 'bandpass', f0: range(r, 900, 1300), q: 1.2, attack: 0.002, tau: 0.012, level: L * 0.35 });
  crumbs(o, t + 0.04, 3 + Math.floor(r() * 3), 0.2, L * 0.12, 1500, 3800);
  burst(o, t + 0.05, { src: 'crunch', type: 'bandpass', f0: 2400, q: 0.8, attack: 0.03, tau: 0.05, level: L * 0.12 });
});

registerSfx('gardenPat', (o, g, t) => {
  const r = o.rnd;
  const L = LEVEL.pat * (0.55 + 0.45 * g) * range(r, 0.85, 1.1);
  // The flat palm on soft earth: a dull pat (no slap: the earth is loose), a little grit under it.
  burst(o, t, { kind: 'pink', type: 'lowpass', f0: range(r, 1100, 1400), f1: range(r, 450, 550), attack: 0.003, tau: range(r, 0.018, 0.026), level: L, pan: range(r, -0.1, 0.1), wet: 0.03 });
  tone(o, t + 0.002, range(r, 150, 180), range(r, 95, 110), 0.002, 0.018, L * 0.12);
  burst(o, t + 0.003, { src: 'crunch', type: 'bandpass', f0: range(r, 1400, 2000), q: 0.9, attack: 0.002, tau: 0.02, level: L * 0.35 });
});

registerSfx('gardenTear', (o, g, t) => {
  const r = o.rnd;
  const L = LEVEL.tear * (0.55 + 0.45 * g);
  // Thin black plastic ripping: quick crackles (the film sticking and giving), a dry hiss under them, rising and gone.
  const len = range(r, 0.24, 0.34);
  burst(o, t, { kind: 'white', type: 'bandpass', f0: 3200, f1: 4600, q: 0.8, attack: len * 0.5, tau: len * 0.12, level: L * 0.35, wet: 0.04 });
  let s = t;
  while (s < t + len) {
    const x = (s - t) / len;
    burst(o, s, { kind: 'white', type: 'bandpass', f0: range(r, 2200, 6000), q: range(r, 1.2, 2.5), attack: 0.0005, tau: range(r, 0.0015, 0.004), level: L * range(r, 0.4, 1) * Math.sin(Math.PI * Math.min(1, x * 1.15)) ** 0.5, pan: range(r, -0.15, 0.15) });
    s += range(r, 0.004, 0.016);
  }
  // (the bag coming away: a soft crinkle)
  for (let i = 0; i < 4; i++) burst(o, t + len + 0.03 + i * range(r, 0.025, 0.05), { kind: 'white', type: 'highpass', f0: range(r, 3000, 5000), attack: 0.001, tau: range(r, 0.003, 0.008), level: L * range(r, 0.15, 0.35), pan: range(r, -0.2, 0.2) });
});

// ── Water ───────────────────────────────────────────────────────────────────

/** A lasting sound's sources, made when it is first heard and stopped a while after it falls silent. */
interface Running {
  stop(): void;
  set(v: number, t: number, from: number): void;
}

/** The pattern every lasting sound here follows: make on the first level over 0, stop `IDLE` ms after it falls to 0. */
function lasting(make: () => Running): { level(v: number, t: number): void } {
  let made: Running | null = null;
  let timer = 0;
  let was = 0;
  return {
    level(v, t) {
      clearTimeout(timer);
      if (v > 0 && !made) made = make();
      if (!made) return;
      made.set(v, t, was);
      was = v;
      if (v <= 0) {
        const it = made;
        timer = window.setTimeout(() => {
          if (made !== it) return;
          it.stop();
          made = null;
        }, IDLE);
      }
    },
  };
}

/** A looping buffer from a random point, through `filter`, into `out` at `level`. */
function bed(o: SfxOut, buf: AudioBuffer, type: BiquadFilterType, f: number, q: number, level: number, out: AudioNode, nodes: AudioNode[], srcs: AudioScheduledSourceNode[]): { gain: GainNode; filter: BiquadFilterNode } {
  const { ctx } = o;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const filter = biquad(ctx, type, f, q);
  const gain = ctx.createGain();
  gain.gain.value = level;
  src.connect(filter).connect(gain).connect(out);
  src.start(ctx.currentTime, o.rnd() * buf.duration);
  nodes.push(src, filter, gain);
  srcs.push(src);
  return { gain, filter };
}

registerLoop('gardenPour', (o) =>
  lasting(() => {
    const { ctx } = o;
    const nodes: AudioNode[] = [];
    const srcs: AudioScheduledSourceNode[] = [];
    const env = ctx.createGain();
    env.gain.value = 0;
    const send = ctx.createGain();
    send.gain.value = 0.06;
    env.connect(o.dry);
    env.connect(send).connect(o.wet);
    nodes.push(env, send);
    // The drops on leaves: a dense patter of tiny splashes (bright), louder over leaves.
    const drops = bed(o, source('splash'), 'highpass', 1100, 0.6, 0, env, nodes, srcs);
    // The streams themselves falling: a soft hiss.
    const hiss = bed(o, noise('pink'), 'bandpass', 2000, 0.6, 0.6, env, nodes, srcs);
    // The earth drinking it: the splashes darkened, soaking in.
    const soak = bed(o, source('splash'), 'lowpass', 900, 0.6, 1.6, env, nodes, srcs);
    // (his hand sways a little: the patter comes and goes)
    const sway = ctx.createOscillator();
    sway.frequency.value = range(o.rnd, 0.9, 1.4);
    const depth = ctx.createGain();
    depth.gain.value = 0;
    sway.connect(depth).connect(drops.gain.gain);
    sway.start(ctx.currentTime);
    nodes.push(sway, depth);
    srcs.push(sway);
    return {
      stop() {
        for (const s of srcs) s.stop();
        for (const n of nodes) n.disconnect();
      },
      set(v, t, from) {
        // (v: 1 over leaves … 0.6 on bare earth; 0 stops: the stream thins out, then the last drops)
        const leafy = Math.max(0, Math.min(1, (v - 0.45) / 0.55));
        drops.gain.gain.setTargetAtTime(0.42 * leafy, t, 0.05);
        depth.gain.setTargetAtTime(0.08 * leafy, t, 0.05);
        soak.filter.frequency.setTargetAtTime(900 + 500 * (1 - leafy), t, 0.05);
        hiss.filter.frequency.setTargetAtTime(1700 + 600 * leafy, t, 0.05);
        const level = v > 0 ? LEVEL.pour * v ** 0.6 : 0;
        // (the water starts as the can tips: a quick swell; it stops more slowly, thinning)
        env.gain.setTargetAtTime(level, t, v > from ? 0.05 : 0.09);
        if (v <= 0 && from > 0) {
          const r = o.rnd;
          for (let i = 0, n = 3 + Math.floor(r() * 3); i < n; i++) drop(o, t + 0.12 + 0.5 * r() ** 1.3, LEVEL.pour * from * range(r, 0.25, 0.5), false);
        }
      },
    };
  }),
);

/** Gulps of air out of the can's mouth while it fills: bubbles rising in pitch as the air inside shrinks, from `t` for `len` s. */
function gulps(o: SfxOut, t: number, len: number, out: AudioNode, level: number): void {
  const r = o.rnd;
  let s = t + range(r, 0.02, 0.06);
  while (s < t + len) {
    const p = (s - t) / len;
    // (one gulp: a few bubbles close together)
    const n = 1 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const at = s + k * range(r, 0.012, 0.03);
      const f = (210 + 460 * p) * range(r, 0.8, 1.25);
      const osc = o.ctx.createOscillator();
      osc.frequency.setValueAtTime(f, at);
      osc.frequency.exponentialRampToValueAtTime(f * range(r, 1.35, 1.7), at + 0.03);
      const env = o.ctx.createGain();
      strike(env.gain, at, level * range(r, 0.45, 1) * (k ? 0.6 : 1), 0.002, range(r, 0.012, 0.025));
      osc.connect(env).connect(out);
      osc.start(at);
      osc.stop(at + 0.2);
      osc.onended = () => {
        osc.disconnect();
        env.disconnect();
      };
    }
    s += range(r, 0.085, 0.16) * (1 + 0.4 * p);
  }
}

registerLoop('gardenFill', (o) =>
  lasting(() => {
    const { ctx } = o;
    const nodes: AudioNode[] = [];
    const srcs: AudioScheduledSourceNode[] = [];
    const env = ctx.createGain();
    env.gain.value = 0;
    const send = ctx.createGain();
    send.gain.value = 0.08;
    env.connect(o.dry);
    env.connect(send).connect(o.wet);
    nodes.push(env, send);
    // The water rushing in: a dark rush that eases as it fills.
    const rush = bed(o, noise('pink'), 'lowpass', 1400, 0.6, 0.55, env, nodes, srcs);
    // The can's hollow: the air inside ringing, its note rising as the water comes up.
    const hollow = bed(o, noise('pink'), 'bandpass', 380, 7, 2.6, env, nodes, srcs);
    const hollow2 = bed(o, noise('pink'), 'bandpass', 380 * 2.3, 9, 1.0, env, nodes, srcs);
    // (bubbles at the surface, small)
    bed(o, source('splash'), 'bandpass', 1500, 0.8, 0.25, env, nodes, srcs);
    return {
      stop() {
        for (const s of srcs) s.stop();
        for (const n of nodes) n.disconnect();
      },
      set(v, t, from) {
        const level = v > 0 ? LEVEL.fill * v ** 0.6 : 0;
        if (v > 0 && from <= 0) {
          // In: the note climbs over the fill, the rush eases, the gulps come.
          const end = t + FILL_LEN;
          for (const [f, k] of [
            [hollow.filter.frequency, 1],
            [hollow2.filter.frequency, 2.3],
          ] as const) {
            f.cancelScheduledValues(t);
            f.setValueAtTime(380 * k, t);
            f.exponentialRampToValueAtTime(1150 * k, end);
          }
          rush.gain.gain.cancelScheduledValues(t);
          rush.gain.gain.setValueAtTime(0.55, t);
          rush.gain.gain.linearRampToValueAtTime(0.28, end);
          gulps(o, t, FILL_LEN + 0.15, env, 1.1);
        }
        env.gain.setTargetAtTime(level, t, v > from ? 0.04 : 0.06);
        if (v <= 0 && from > 0) {
          // Lifted out: the water off its sides back into the jar, then drips.
          const r = o.rnd;
          burst(o, t + 0.05, { src: 'splash', type: 'bandpass', f0: 1800, q: 0.7, attack: 0.03, tau: 0.09, level: LEVEL.fill * 1.4 * from, wet: 0.08 });
          for (let i = 0, n = 4 + Math.floor(r() * 3); i < n; i++) drop(o, t + 0.2 + 0.7 * r() ** 1.4, LEVEL.fill * from * range(r, 0.35, 0.7), true);
        }
      },
    };
  }),
);

registerSfx('gardenDip', (o, g, t) => {
  const r = o.rnd;
  const L = LEVEL.dip * (0.55 + 0.45 * g) * range(r, 0.9, 1.1);
  // The can's lip breaking the surface: a splash, the plunge's low bloop, a few bubbles.
  burst(o, t, { src: 'splash', type: 'bandpass', f0: range(r, 1400, 1900), q: 0.7, attack: 0.004, tau: 0.06, level: L * 0.9, wet: 0.08 });
  burst(o, t, { kind: 'white', type: 'bandpass', f0: range(r, 2400, 3200), f1: 1400, q: 0.9, attack: 0.002, tau: 0.025, level: L * 0.35, wet: 0.06 });
  tone(o, t + 0.01, range(r, 230, 280), range(r, 150, 180), 0.004, 0.05, L * 0.18, 0.06);
  for (let i = 0; i < 4; i++) {
    const f = range(r, 400, 900);
    tone(o, t + range(r, 0.03, 0.2), f, f * range(r, 1.4, 1.8), 0.002, range(r, 0.012, 0.025), L * range(r, 0.06, 0.12), 0.08);
  }
});

// ── Picking ─────────────────────────────────────────────────────────────────

registerSfx('gardenSnap', (o, g, t) => {
  const r = o.rnd;
  const L = LEVEL.snap * (0.55 + 0.45 * g) * range(r, 0.85, 1.1);
  // The stalk giving: a short fibrous crack, a muffled pop of the fruit coming free, the twig springing back among its leaves.
  burst(o, t, { kind: 'white', type: 'bandpass', f0: range(r, 2000, 2800), q: 2, attack: 0.0006, tau: range(r, 0.005, 0.009), level: L, wet: 0.05 });
  burst(o, t + 0.004, { kind: 'pink', type: 'bandpass', f0: range(r, 650, 900), q: 1.4, attack: 0.001, tau: 0.016, level: L * 0.55, wet: 0.04 });
  burst(o, t + range(r, 0.012, 0.02), { kind: 'white', type: 'bandpass', f0: range(r, 3200, 4200), q: 2.4, attack: 0.0005, tau: 0.004, level: L * 0.4 });
  const lf = range(r, 2600, 3400);
  leaves(o, t + range(r, 0.04, 0.07), lf, lf, 0.03, 0.05, L * 0.2, range(r, -0.2, 0.2));
});

registerSfx('gardenRustle', (o, g, t) => {
  const r = o.rnd;
  const L = LEVEL.rustle * (0.55 + 0.45 * g);
  // His hands going in among the leaves: two brushes of leaves against leaves, a twig ticking.
  leaves(o, t, range(r, 2400, 3200), range(r, 1800, 2400), 0.07, 0.07, L, range(r, -0.15, 0.15), 0.06);
  const lf = range(r, 2800, 3600);
  leaves(o, t + range(r, 0.16, 0.24), lf, lf, 0.05, 0.06, L * 0.65, range(r, -0.2, 0.2), 0.06);
  burst(o, t + 0.02, { kind: 'pink', type: 'bandpass', f0: range(r, 900, 1200), q: 0.8, attack: 0.06, tau: 0.06, level: L * 0.3 });
  if (r() < 0.6) burst(o, t + range(r, 0.05, 0.25), { kind: 'white', type: 'bandpass', f0: range(r, 2500, 3500), q: 2, attack: 0.0005, tau: 0.003, level: L * 0.4 });
});

registerSfx('gardenChop', (o, g, t) => {
  const r = o.rnd;
  const L = LEVEL.chop * (0.55 + 0.45 * g) * range(r, 0.88, 1.1);
  const pan = range(r, -0.1, 0.1);
  // The blade's swing: a short swish as it comes down…
  burst(o, t, { kind: 'white', type: 'bandpass', f0: 2400, f1: 4800, q: 1.2, attack: 0.03, tau: 0.01, level: L * 0.16, pan });
  // …and its bite: a crisp crack, the cane's (or the stalk's) woody knock, juicy fibres tearing.
  t += 0.035;
  burst(o, t, { kind: 'white', type: 'highpass', f0: range(r, 2800, 3600), attack: 0.0005, tau: 0.004, level: L * 0.55, pan, wet: 0.05 });
  tone(o, t + 0.001, range(r, 420, 560), range(r, 360, 470), 0.001, range(r, 0.018, 0.028), L * 0.22, 0.06);
  burst(o, t + 0.001, { kind: 'pink', type: 'bandpass', f0: range(r, 1000, 1400), q: 1.8, attack: 0.001, tau: 0.02, level: L * 0.8, pan, wet: 0.06 });
  burst(o, t + 0.012, { kind: 'white', type: 'bandpass', f0: range(r, 2600, 3400), f1: range(r, 1500, 1900), q: 1.6, attack: 0.004, tau: 0.02, level: L * 0.3, pan });
});

registerSfx('gardenPole', (o, g, t) => {
  const r = o.rnd;
  const L = LEVEL.pole * (0.55 + 0.45 * g);
  // The bamboo knocking a branch up in the crown (a hollow tok, far up), the leaves shaking.
  tok(o, t, range(r, 560, 720), L * 0.5, 0.045, 0.12);
  const lf = range(r, 2600, 3400);
  leaves(o, t + 0.02, lf, lf, 0.04, 0.08, L * 0.5, 0, 0.08);
  // The fruit dropping into the pole's little basket: a soft thunk, the weave creaking.
  const c = t + range(r, 0.12, 0.18);
  burst(o, c, { kind: 'pink', type: 'bandpass', f0: range(r, 380, 480), q: 1.2, attack: 0.002, tau: 0.03, level: L * 0.8, wet: 0.06 });
  tok(o, c + 0.002, range(r, 300, 360), L * 0.18, 0.03, 0.06);
  crumbs(o, c + 0.01, 4, 0.08, L * 0.25, 1500, 3200);
});

registerSfx('gardenThud', (o, g, t) => {
  const r = o.rnd;
  const L = LEVEL.thud * (0.45 + 0.55 * g) * range(r, 0.9, 1.08);
  // A heavy fruit hitting the earth: the deep thump of its weight, the earth's dull crunch, a few crumbs, a short roll.
  const rec = earth(o, t, 'concrete', L * 0.45, range(r, 0.5, 0.58), 420, 0.2);
  tone(o, t, range(r, 80, 95), range(r, 42, 50), 0.002, range(r, 0.05, 0.065), L * 0.32, 0.04, 0.08);
  burst(o, t, { kind: 'brown', type: 'lowpass', f0: range(r, 500, 650), f1: 160, attack: 0.002, tau: 0.045, level: L * (rec ? 0.55 : 0.85), wet: 0.05 });
  burst(o, t + 0.003, { kind: 'pink', type: 'bandpass', f0: range(r, 230, 300), q: 1, attack: 0.002, tau: 0.04, level: L * 0.4 });
  burst(o, t + 0.004, { src: 'crunch', type: 'bandpass', f0: 900, q: 0.9, attack: 0.002, tau: 0.03, level: L * 0.22 });
  crumbs(o, t + 0.03, 4 + Math.floor(r() * 3), 0.2, L * 0.07, 1200, 3200);
  // (it rocks once on the earth)
  burst(o, t + range(r, 0.13, 0.19), { kind: 'brown', type: 'lowpass', f0: 420, f1: 200, attack: 0.004, tau: 0.03, level: L * 0.22 });
});

registerSfx('gardenBasket', (o, g, t) => {
  const r = o.rnd;
  const L = LEVEL.basket * (0.55 + 0.45 * g) * range(r, 0.88, 1.1);
  // Laid in the woven bamboo basket on his hip: a soft thunk against the weave, the strips creaking.
  burst(o, t, { kind: 'pink', type: 'bandpass', f0: range(r, 380, 520), q: 1.1, attack: 0.004, tau: 0.03, level: L, wet: 0.04 });
  tok(o, t + 0.002, range(r, 230, 290), L * 0.12, 0.025, 0.03);
  let s = t + 0.01;
  for (let i = 0, n = 3 + Math.floor(r() * 3); i < n; i++) {
    burst(o, s, { kind: 'white', type: 'bandpass', f0: range(r, 1400, 2600), q: 2.5, attack: 0.001, tau: range(r, 0.003, 0.007), level: L * range(r, 0.15, 0.3), pan: range(r, -0.15, 0.15) });
    s += range(r, 0.015, 0.035);
  }
});

// ── Clearing ────────────────────────────────────────────────────────────────

registerSfx('gardenPull', (o, g, t) => {
  const r = o.rnd;
  const L = LEVEL.pull * (0.55 + 0.45 * g) * range(r, 0.85, 1.1);
  // The tug: the earth giving way round the roots (a dark crunching heave), the roots snapping one by one.
  burst(o, t, { src: 'crunch', type: 'bandpass', f0: range(r, 700, 1000), q: 0.8, attack: range(r, 0.06, 0.1), tau: 0.06, level: L * 0.7, wet: 0.04 });
  burst(o, t + 0.02, { kind: 'brown', type: 'lowpass', f0: 450, f1: 220, attack: 0.07, tau: 0.07, level: L * 0.55 });
  for (let i = 0, n = 3 + Math.floor(r() * 4); i < n; i++)
    burst(o, t + range(r, 0.03, 0.22), { kind: 'white', type: 'bandpass', f0: range(r, 1600, 3600), q: 2, attack: 0.0006, tau: range(r, 0.002, 0.005), level: L * range(r, 0.3, 0.7), pan: range(r, -0.15, 0.15) });
  crumbs(o, t + 0.12, 4 + Math.floor(r() * 4), 0.3, L * 0.18, 1200, 3600);
});

registerSfx('gardenToss', (o, g, t) => {
  const r = o.rnd;
  const L = LEVEL.toss * (0.55 + 0.45 * g);
  // Thrown: a swish through the air; then the dry stick landing on the heap, its dead leaves crackling.
  burst(o, t, { kind: 'pink', type: 'bandpass', f0: 900, f1: 1700, q: 0.9, attack: 0.07, tau: 0.04, level: L * 0.3, pan: range(r, -0.2, 0.2) });
  const land = t + range(r, 0.3, 0.38);
  const pan = range(r, -0.4, 0.4);
  burst(o, land, { kind: 'pink', type: 'lowpass', f0: 700, f1: 350, attack: 0.002, tau: 0.025, level: L * 0.7, pan, wet: 0.05 });
  const lf = range(r, 2800, 3600);
  leaves(o, land + 0.005, lf, lf, 0.01, 0.07, L * 0.7, pan);
  for (let i = 0; i < 6; i++) burst(o, land + 0.06 * r() ** 1.5, { kind: 'white', type: 'highpass', f0: range(r, 2400, 4000), attack: 0.0005, tau: range(r, 0.002, 0.004), level: L * range(r, 0.25, 0.55), pan: pan + range(r, -0.1, 0.1) });
});

// ── The interface's notes about his plants ──────────────────────────────────

registerSfx(
  'gardenSprout',
  (o, g, t) => {
    // (rising: G5, C6, D6 — soft, close together, the last ringing on)
    const L = LEVEL.note * (0.5 + 0.5 * g);
    [79, 84, 86].forEach((m, i) => chime(o, t + i * 0.09, mtof(m), L * (i === 2 ? 0.9 : 0.75), i === 2 ? 0.9 : 0.5));
  },
  'ui',
);

registerSfx(
  'gardenRipe',
  (o, g, t) => {
    // (two bright notes, a fourth up: A6, D7 — shorter than the calendar's bell)
    const L = LEVEL.note * (0.5 + 0.5 * g);
    chime(o, t, mtof(81), L * 0.9, 0.45, 0.35);
    chime(o, t + 0.12, mtof(86), L * 0.8, 0.6, 0.35);
  },
  'ui',
);

registerSfx(
  'gardenThirst',
  (o, g, t) => {
    // (a dry low note: a muted wooden knock and its note, sagging a little; hardly any echo)
    const L = LEVEL.note * (0.5 + 0.5 * g);
    const f = mtof(57);
    tone(o, t, f, f * 0.94, 0.003, 0.11, L * 1.85, 0.05, 0.25, 'triangle');
    tone(o, t, f * 2, f * 2 * 0.94, 0.003, 0.05, L * 0.5, 0.03, 0.25);
    burst(o, t, { kind: 'pink', type: 'bandpass', f0: 900, q: 1.5, attack: 0.001, tau: 0.008, level: L });
  },
  'ui',
);

registerSfx(
  'gardenDied',
  (o, g, t) => {
    // (a soft falling note: E5 sliding down to C#5 as it fades, a quiet lower one after it)
    const L = LEVEL.note * (0.5 + 0.5 * g);
    chime(o, t, mtof(76), L, 0.9, 0.4, 2 ** (-3 / 12));
    chime(o, t + 0.28, mtof(69), L * 0.55, 1.1, 0.4, 2 ** (-1 / 12));
  },
  'ui',
);
