import { ACTIONS, POLE_ACTIONS } from '../garden/actions';
import { registerLoop, registerSfx, type SfxOut } from './addonSfx';
import { biquad, mtof, mulberry32, noise, range, source, strike, type NoiseKind, type SourceName } from './dsp';
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
 * - `gardenCrumbs`: clods thrown by the hoe landing round him (the work's
 *   effects play it as their earth lands, `gain` by how much): a soft patter.
 *
 * The shoulder pole (ដងរែក: two buckets of water on a bamboo pole, roam/_carryPole*.ts):
 *
 * - `gardenYokeCreak` (lasting): the bamboo flexing on his shoulder at each
 *   step, the buckets' hooks ticking; `SFX.level(v)` by his speed (0 still …
 *   1 running: the creaks come faster and a little higher).
 * - `gardenSlosh` (lasting): water slopping in the two buckets; `SFX.level(v)`
 *   the sway times how full they are (set it as it swings: it follows within
 *   a few hundredths of a second).
 * - `gardenBucketFill` (lasting): the buckets pushed under at the water's edge,
 *   one after the other (the `poleFill` action's beats), each a dark rush and
 *   deep gulps as it fills, water streaming off as it comes up.
 * - `gardenJarPour`: a bucket tipped into the big clay jar: a deep hollow
 *   pour into water, glugs, the last drips.
 * - `gardenScoop`: the coconut-shell dipper knocking the bucket's rim and
 *   scooping (a bloop), then half a second later the water thrown on the
 *   plant's earth.
 * - `gardenSpill`: water slopping over a rim onto the ground.
 * - `gardenPoleUp`: the pole taken up: a hollow bamboo knock, the buckets'
 *   wire handles rattling, the water stirring.
 * - `gardenPoleDown`: the two buckets set down on the earth one after the
 *   other (dull thuds, a tinny ring), the handles, the water settling.
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
  crumbs: 0.26,
  /** The shoulder pole (lasting: at a level of 1). */
  creak: 0.2,
  slosh: 0.08,
  bucket: 0.12,
  jar: 0.2,
  scoop: 0.38,
  spill: 0.27,
  poleUp: 0.26,
  poleDown: 0.48,
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
function gulps(o: SfxOut, t: number, len: number, out: AudioNode, level: number, lo = 210, span = 460): void {
  const r = o.rnd;
  let s = t + range(r, 0.02, 0.06);
  while (s < t + len) {
    const p = (s - t) / len;
    // (one gulp: a few bubbles close together)
    const n = 1 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const at = s + k * range(r, 0.012, 0.03);
      const f = (lo + span * p) * range(r, 0.8, 1.25);
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

// ── The hoe's earth landing (the work's effects) ────────────────────────────

registerSfx('gardenCrumbs', (o, g, t) => {
  const r = o.rnd;
  const L = LEVEL.crumbs * (0.4 + 0.6 * g);
  // Clods and crumbs landing on the dug earth round him: a soft patter, a little grit sliding.
  crumbs(o, t, 4 + Math.floor(r() * 4 * (0.5 + g)), range(r, 0.12, 0.2), L, 1100, 3600);
  burst(o, t + 0.01, { kind: 'brown', type: 'lowpass', f0: 600, f1: 300, attack: 0.004, tau: 0.02, level: L * 0.9 });
  burst(o, t + 0.02, { src: 'crunch', type: 'bandpass', f0: range(r, 1800, 2600), q: 0.8, attack: 0.02, tau: 0.04, level: L * 0.6 });
});

// ── The shoulder pole and its buckets ───────────────────────────────────────

/** A sound of a few looping layers under one envelope: up in `attack`, held `hold`, then dying with `tau`; `add` a layer. */
function swell(o: SfxOut, t: number, attack: number, hold: number, tau: number, level: number, wet: number): { out: GainNode; add(buf: AudioBuffer, type: BiquadFilterType, f: number, q: number, g: number): BiquadFilterNode } {
  const { ctx } = o;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(level, t + attack);
  out.gain.setValueAtTime(level, t + attack + hold);
  out.gain.setTargetAtTime(0, t + attack + hold, tau);
  const send = ctx.createGain();
  send.gain.value = wet;
  out.connect(o.dry);
  out.connect(send).connect(o.wet);
  const end = t + attack + hold + tau * 8;
  const nodes: AudioNode[] = [out, send];
  let left = 0;
  return {
    out,
    add(buf, type, f, q, g) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const fl = biquad(ctx, type, f, q);
      const gn = ctx.createGain();
      gn.gain.value = g;
      src.connect(fl).connect(gn).connect(out);
      src.start(t, o.rnd() * buf.duration);
      src.stop(end);
      nodes.push(src, fl, gn);
      left++;
      src.onended = () => {
        if (--left === 0) for (const n of nodes) n.disconnect();
      };
      return fl;
    },
  };
}

/** A bucket's wire handle knocking its rim: a short tinny tick. */
function clink(o: SfxOut, t: number, level: number): void {
  const r = o.rnd;
  const f = range(r, 1900, 3100);
  tone(o, t, f, f * 0.995, 0.0008, range(r, 0.008, 0.016), level, 0.08, 0.02, 'triangle');
  tone(o, t, f * 2.7, f * 2.68, 0.0008, 0.006, level * 0.3, 0.08);
}

/** Water stirring in a bucket: a short gurgle (the babbling loop, darkened). */
function stir(o: SfxOut, t: number, level: number, tau = 0.12): void {
  burst(o, t, { src: 'babble', type: 'lowpass', f0: 1000, f1: 700, attack: 0.05, tau, level, wet: 0.05 });
}

/**
 * The pole's creaks, made once (a loop of eight steps, each different, `CREAK_STEP` s each at the walking pace): at each footfall the
 * bamboo flexes against his shoulder — a stick-slip creak (a train of tiny clicks, its rate gliding up and down,
 * through the bamboo's two resonances) — and on every other step a bucket's hook ticks on its ring.
 */
const CREAK_STEP = 0.55;
let creakLoop: AudioBuffer | null = null;
function creaks(): AudioBuffer {
  if (creakLoop) return creakLoop;
  const rate = 48000;
  const n = 8;
  const len = Math.round(CREAK_STEP * n * rate);
  const buf = new AudioBuffer({ numberOfChannels: 1, length: len, sampleRate: rate });
  const d = buf.getChannelData(0);
  const rnd = mulberry32(5521);
  const ring = (i0: number, f1: number, f2: number, decay: number, a: number) => {
    const m = Math.round(decay * 6 * rate);
    for (let j = 0; j < m; j++) {
      const e = Math.exp(-j / (decay * rate));
      d[(i0 + j) % len] += a * e * (Math.sin((2 * Math.PI * f1 * j) / rate) + 0.45 * Math.sin((2 * Math.PI * f2 * j) / rate));
    }
  };
  for (let k = 0; k < n; k++) {
    const t0 = k * CREAK_STEP + 0.03 + rnd() * 0.04;
    const dur = 0.11 + rnd() * 0.09;
    const f0 = 160 + rnd() * 90;
    const f1 = f0 * (1.2 + rnd() * 0.35);
    const fr = 850 + rnd() * 450;
    const loud = 0.6 + 0.4 * rnd();
    let ph = 0;
    const N = Math.round(dur * rate);
    for (let i = 0; i < N; i++) {
      const x = i / N;
      ph += (f0 + (f1 - f0) * Math.sin(Math.PI * x)) / rate;
      if (ph < 1) continue;
      ph -= 1;
      // (one slip: a click ringing in the bamboo, the creak swelling and fading)
      ring(Math.round(t0 * rate) + i, fr, fr * 2.3, 0.0014, loud * Math.sin(Math.PI * x) ** 1.5 * (0.6 + 0.4 * rnd()));
    }
    if (k % 2 === 1) ring(Math.round((t0 + dur * 0.7) * rate), 2500 + rnd() * 600, 3900 + rnd() * 500, 0.003, 0.5);
  }
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
  for (let i = 0; i < len; i++) d[i] *= 0.5 / (peak || 1);
  return (creakLoop = buf);
}

registerLoop('gardenYokeCreak', (o) =>
  lasting(() => {
    const { ctx } = o;
    const src = ctx.createBufferSource();
    src.buffer = creaks();
    src.loop = true;
    const hp = biquad(ctx, 'highpass', 300, 0.7);
    const env = ctx.createGain();
    env.gain.value = 0;
    const send = ctx.createGain();
    send.gain.value = 0.05;
    src.connect(hp).connect(env);
    env.connect(o.dry);
    env.connect(send).connect(o.wet);
    // (a slow drift of its pitch, so the loop never sounds the same twice)
    const drift = ctx.createOscillator();
    drift.frequency.value = range(o.rnd, 0.09, 0.15);
    const depth = ctx.createGain();
    depth.gain.value = 35;
    drift.connect(depth).connect(src.detune);
    src.start(ctx.currentTime, o.rnd() * src.buffer.duration);
    drift.start(ctx.currentTime);
    return {
      stop() {
        src.stop();
        drift.stop();
        for (const n of [src, hp, env, send, drift, depth]) n.disconnect();
      },
      set(v, t) {
        // (v: his speed, 0 still … 1 running: the steps come faster)
        src.playbackRate.setTargetAtTime(0.85 + 0.4 * v, t, 0.15);
        env.gain.setTargetAtTime(v > 0 ? LEVEL.creak * v ** 0.6 : 0, t, 0.08);
      },
    };
  }),
);

registerLoop('gardenSlosh', (o) =>
  lasting(() => {
    const { ctx } = o;
    const nodes: AudioNode[] = [];
    const srcs: AudioScheduledSourceNode[] = [];
    const env = ctx.createGain();
    env.gain.value = 0;
    const send = ctx.createGain();
    send.gain.value = 0.05;
    env.connect(o.dry);
    env.connect(send).connect(o.wet);
    nodes.push(env, send);
    // Water slopping against the buckets' walls: a dark wandering gurgle, the bucket's hollow, a few splashes at the top.
    bed(o, source('babble'), 'lowpass', 1100, 0.6, 1, env, nodes, srcs);
    bed(o, source('babble'), 'bandpass', 420, 3, 1.4, env, nodes, srcs);
    bed(o, source('splash'), 'bandpass', 1300, 0.8, 0.22, env, nodes, srcs);
    return {
      stop() {
        for (const s of srcs) s.stop();
        for (const n of nodes) n.disconnect();
      },
      set(v, t) {
        // (v: the sway × how full: it follows the swing quickly)
        env.gain.setTargetAtTime(v > 0 ? LEVEL.slosh * v ** 0.8 : 0, t, 0.03);
      },
    };
  }),
);

/** The `poleFill` action's two buckets: when each goes under and comes up full (s from the loop's start). */
const POLE_FILL = (() => {
  const a = POLE_ACTIONS.poleFill;
  const at = (name: string, fb: number) => a.beats.find((b) => b.name === name)?.at ?? fb;
  const from = a.loop?.from ?? 0.65;
  return [
    [Math.max(0, at('dip1', 0.6) - from), at('full1', 1.6) - from],
    [at('dip2', 1.9) - from, at('full2', 2.9) - from],
  ] as const;
})();

registerLoop('gardenBucketFill', (o) =>
  lasting(() => {
    const { ctx } = o;
    const nodes: AudioNode[] = [];
    const srcs: AudioScheduledSourceNode[] = [];
    const env = ctx.createGain();
    env.gain.value = 0;
    const send = ctx.createGain();
    send.gain.value = 0.07;
    env.connect(o.dry);
    env.connect(send).connect(o.wet);
    // (each bucket's own swell: under, filling, up)
    const each = ctx.createGain();
    each.gain.value = 0;
    each.connect(env);
    nodes.push(env, send, each);
    // The water rushing in over the rim (dark), the bucket's hollow rising as it fills, bubbles at the surface.
    const rush = bed(o, noise('pink'), 'lowpass', 900, 0.6, 0.7, each, nodes, srcs);
    const hollow = bed(o, noise('pink'), 'bandpass', 240, 5, 2.4, each, nodes, srcs);
    bed(o, source('splash'), 'bandpass', 1200, 0.8, 0.3, each, nodes, srcs);
    return {
      stop() {
        for (const s of srcs) s.stop();
        for (const n of nodes) n.disconnect();
      },
      set(v, t, from) {
        if (v > 0 && from <= 0) {
          const g = each.gain;
          const f = hollow.filter.frequency;
          g.cancelScheduledValues(t);
          f.cancelScheduledValues(t);
          rush.gain.gain.cancelScheduledValues(t);
          g.setValueAtTime(0, t);
          for (const [a, b] of POLE_FILL) {
            g.setValueAtTime(0, t + a);
            g.linearRampToValueAtTime(1, t + a + 0.06);
            g.setValueAtTime(1, t + b - 0.08);
            g.linearRampToValueAtTime(0, t + b);
            f.setValueAtTime(240, t + a);
            f.exponentialRampToValueAtTime(650, t + b);
            rush.gain.gain.setValueAtTime(0.7, t + a);
            rush.gain.gain.linearRampToValueAtTime(0.35, t + b);
            gulps(o, t + a, b - a - 0.05, each, 1.2, 140, 260);
            // (up full: water streaming off its sides back into the stream, then drips)
            burst(o, t + b, { src: 'splash', type: 'bandpass', f0: 1500, q: 0.7, attack: 0.04, tau: 0.08, level: LEVEL.bucket * 1.5, wet: 0.08 });
            const r = o.rnd;
            for (let i = 0; i < 3; i++) drop(o, t + b + 0.12 + 0.3 * r(), LEVEL.bucket * range(r, 0.4, 0.8), true);
          }
        }
        env.gain.setTargetAtTime(v > 0 ? LEVEL.bucket * v ** 0.6 : 0, t, v > from ? 0.03 : 0.06);
      },
    };
  }),
);

registerSfx('gardenJarPour', (o, g, t) => {
  const r = o.rnd;
  const L = LEVEL.jar * (0.5 + 0.5 * g) * range(r, 0.9, 1.08);
  // The bucket tipping: the water lurching to the rim.
  stir(o, t, L * 0.8, 0.06);
  // The pour into the big clay jar: water into water, the jar's deep hollow ringing under it, glugs.
  const s = swell(o, t + 0.07, 0.08, range(r, 0.5, 0.6), 0.09, L, 0.12);
  s.add(source('splash'), 'bandpass', range(r, 1000, 1300), 0.6, 1);
  s.add(noise('pink'), 'lowpass', 700, 0.6, 0.7);
  const boom = s.add(noise('pink'), 'bandpass', range(r, 180, 210), 5, 3.2);
  boom.frequency.setValueAtTime(boom.frequency.value, t + 0.07);
  boom.frequency.linearRampToValueAtTime(boom.frequency.value * 1.15, t + 0.8);
  gulps(o, t + 0.12, 0.55, s.out, 0.9, 90, 70);
  // (the bucket righted: the last of it dribbling in, drips)
  for (let i = 0, n = 3 + Math.floor(r() * 3); i < n; i++) drop(o, t + 0.75 + 0.45 * r() ** 1.3, L * range(r, 0.25, 0.5), true);
});

registerSfx('gardenScoop', (o, g, t) => {
  const r = o.rnd;
  const L = LEVEL.scoop * (0.5 + 0.5 * g) * range(r, 0.9, 1.1);
  // The coconut shell knocking the bucket's rim, then scooping: a hollow bloop, the water closing over it.
  tok(o, t, range(r, 650, 800), L * 0.25, 0.02, 0.05);
  tone(o, t + 0.04, range(r, 480, 560), range(r, 240, 280), 0.003, 0.03, L * 0.35, 0.06);
  burst(o, t + 0.04, { kind: 'pink', type: 'bandpass', f0: 1400, f1: 600, q: 2, attack: 0.004, tau: 0.04, level: L * 0.5, wet: 0.06 });
  burst(o, t + 0.05, { src: 'splash', type: 'bandpass', f0: 1600, q: 0.8, attack: 0.01, tau: 0.05, level: L * 0.5, wet: 0.06 });
  // Half a second later, thrown on the plant's earth: a short splash, the earth drinking it, drops off the leaves.
  const p = t + 0.5;
  const s = swell(o, p, 0.03, range(r, 0.14, 0.2), 0.07, L, 0.06);
  s.add(source('splash'), 'bandpass', range(r, 900, 1200), 0.7, 0.9);
  s.add(source('splash'), 'lowpass', 600, 0.6, 1.1);
  s.add(noise('pink'), 'bandpass', 2000, 0.7, 0.15);
  for (let i = 0, n = 3 + Math.floor(r() * 3); i < n; i++) drop(o, p + 0.2 + 0.4 * r() ** 1.3, L * range(r, 0.2, 0.45), false);
});

registerSfx('gardenSpill', (o, g, t) => {
  const r = o.rnd;
  const L = LEVEL.spill * (0.5 + 0.5 * g) * range(r, 0.9, 1.1);
  // A slop of water over the rim: it splashes on the ground beside his feet and soaks in.
  const s = swell(o, t, 0.02, range(r, 0.06, 0.12), 0.07, L, 0.05);
  s.add(source('splash'), 'bandpass', range(r, 1200, 1700), 0.7, 0.9);
  s.add(source('splash'), 'lowpass', 700, 0.6, 1);
  burst(o, t + 0.01, { kind: 'pink', type: 'lowpass', f0: 700, f1: 350, attack: 0.003, tau: 0.03, level: L * 0.6 });
  for (let i = 0, n = 2 + Math.floor(r() * 3); i < n; i++) drop(o, t + 0.15 + 0.3 * r(), L * range(r, 0.2, 0.4), false);
});

registerSfx('gardenPoleUp', (o, g, t) => {
  const r = o.rnd;
  const L = LEVEL.poleUp * (0.5 + 0.5 * g);
  // The pole taken onto his shoulder: a hollow bamboo knock, the ropes taking the weight with a short creak.
  tok(o, t, range(r, 380, 470), L * 0.6, 0.035, 0.06);
  burst(o, t + 0.05, { kind: 'pink', type: 'bandpass', f0: range(r, 1100, 1400), q: 4, attack: 0.02, tau: 0.035, level: L * 0.4 });
  // The buckets leaving the ground: their wire handles rattling on the rims, the water stirring.
  let s = t + range(r, 0.06, 0.1);
  for (let i = 0, n = 3 + Math.floor(r() * 3); i < n; i++) {
    clink(o, s, L * range(r, 0.15, 0.3) * (1 - i * 0.12));
    s += range(r, 0.04, 0.09);
  }
  stir(o, t + 0.1, L * 0.7);
});

registerSfx('gardenPoleDown', (o, g, t) => {
  const r = o.rnd;
  const L = LEVEL.poleDown * (0.5 + 0.5 * g);
  // The two buckets set down on the earth, one and then the other: a dull thud of the water's weight, a short tinny ring.
  for (const [k, at] of [
    [1, 0],
    [0.8, range(r, 0.09, 0.15)],
  ] as const) {
    const s = t + at;
    tone(o, s, range(r, 105, 125), range(r, 70, 85), 0.002, 0.04, L * 0.22 * k, 0.04);
    burst(o, s, { kind: 'brown', type: 'lowpass', f0: 700, f1: 220, attack: 0.002, tau: 0.035, level: L * 0.8 * k, wet: 0.04 });
    tone(o, s + 0.002, range(r, 600, 850), range(r, 590, 840), 0.001, 0.025, L * 0.05 * k, 0.05, 0.03, 'triangle');
    crumbs(o, s + 0.01, 2, 0.06, L * 0.1 * k, 1500, 3200);
  }
  // The handles falling against the rims, the water settling, the pole laid down across them.
  clink(o, t + range(r, 0.2, 0.26), L * 0.2);
  stir(o, t + 0.04, L * 0.6, 0.1);
  tok(o, t + range(r, 0.3, 0.38), range(r, 360, 420), L * 0.3, 0.03, 0.05);
});
