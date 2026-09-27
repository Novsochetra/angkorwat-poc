import { glide, range, source, type Rng } from './dsp';
import { line, Voice } from './voice';

/**
 * The village's everyday sounds (people.ts places them; each is one `Voice`
 * made fresh from oscillators and noise, a little different each time):
 *
 * - `chop`: a knife on a chopping board, a quick run of cuts (the board's
 *   dull thump, the blade's tick) — or, one time in three, a machete split
 *   into a coconut's husk, two or three heavy, fibrous whacks;
 * - `sizzle`: a wok: the hiss as the food goes in, then a steady sizzle of
 *   spitting oil, a spatula scraping and clinking on the iron;
 * - `bubble`: thick palm syrup boiling down in the wide pan: slow, low,
 *   viscous blips, a soft roil under them;
 * - `crackle`: a cooking fire of wood: crackles and pops over the flames'
 *   soft breathing;
 * - `knock`: hollow bamboo: the palm tapper's tubes clonking together on his
 *   belt, or his foot on a rung of the bamboo ladder with its lashings'
 *   creak;
 * - `bikeBell`: a bicycle's thumb bell, "brring-brring";
 * - `moto`: a small 110 cc moto (`MotoVoice`: a lasting voice that follows
 *   its calls): its putt-putting single cylinder and tyres, swelling as it
 *   comes, the note dropping as it passes (Doppler), fading as it goes;
 * - `cowBell`: the Khmer wooden cattle bell, a hollow "klok-klok" (a call a
 *   step);
 * - `splashPlay`: children jumping into the water and splashing each other,
 *   with a laugh or a shriek;
 * - for the hamlets' beds (hamlets.ts): bowls and spoons clinking at the
 *   market (`clink`), a carpenter's hammer (`hammer`), the village's hand
 *   pump squeaking and gushing into a basin (`pump`), children laughing
 *   (`laugh`, also the people's `laugh` call).
 *
 * Each makes a dozen to two dozen nodes whatever its length: repeated hits
 * strike the same few voices again (`Struck`), as the pinpeat does.
 */

/** A struck level: up to `peak` in about `attack` s (from wherever it is: a hit on a ringing thing adds to it), then dying with time constant `tau`. */
export function bump(p: AudioParam, t: number, peak: number, attack: number, tau: number): void {
  p.setTargetAtTime(peak, t, Math.max(0.0003, attack / 3));
  p.setTargetAtTime(0, t + attack, tau);
}

/**
 * A few sine partials (a wooden or metal body's modes) struck again and
 * again: `hit` sets the note (`f` × each ratio) and strikes every partial
 * with its own level and decay. A click of noise in a band marks the hit.
 */
class Struck {
  private readonly parts: { o: OscillatorNode; g: GainNode; ratio: number; amp: number; tau: number }[];
  private readonly click: GainNode | null;
  private clickLevel = 0;

  constructor(
    v: Voice,
    from: number,
    to: number,
    modes: readonly (readonly [number, number, number])[],
    out: AudioNode,
    click?: { f: number; q: number; level: number },
  ) {
    this.parts = modes.map(([ratio, amp, tau]) => {
      const o = v.osc('sine', from, to, 440 * ratio);
      const g = v.gain();
      o.connect(g).connect(out);
      return { o, g, ratio, amp, tau };
    });
    if (click) {
      this.click = v.gain();
      v.noise('white', from, to).connect(v.filter('bandpass', click.f, click.q)).connect(this.click).connect(out);
      this.clickLevel = click.level;
    } else this.click = null;
  }

  /** Strike at `t`, the note `f`, `level` 0‥1; `damp` shortens every decay (a muffled hit). */
  hit(t: number, f: number, level: number, damp = 1): void {
    for (const p of this.parts) {
      p.o.frequency.setValueAtTime(f * p.ratio, t);
      bump(p.g.gain, t, p.amp * level, 0.0015, p.tau * damp);
    }
    if (this.click) bump(this.click.gain, t, this.clickLevel * level, 0.0008, 0.004);
  }
}

// ── The kitchen ────────────────────────────────────────────────────────────

/**
 * A knife chopping on a board (a run of cuts), or a machete splitting a
 * coconut (a few heavy whacks); `high` (up a sugar palm, over the ears):
 * the tapper's knife slicing into the flower stalk.
 */
export function chop(v: Voice, t: number, high = false): number {
  const r = v.r;
  if (high) return stalk(v, t);
  if (r() < 0.34) return machete(v, t);
  const n = 2 + Math.floor(r() * 5);
  const gap = range(r, 0.15, 0.24);
  const end = t + n * gap + 0.4;
  // The board: a thick slab's low modes, and its hollow "tock" (a band of the same noise as the blade's tick).
  const board = new Struck(v, t, end, [
    [1, 1, 0.035],
    [2.31, 0.45, 0.02],
    [4.2, 0.18, 0.01],
  ], v.out, { f: range(r, 2600, 3600), q: 1.4, level: 0.9 });
  const tock = v.gain();
  v.noise('pink', t, end).connect(v.filter('bandpass', range(r, 950, 1300), 3)).connect(tock).connect(v.out);
  const f = range(r, 170, 240);
  let s = t;
  for (let i = 0; i < n; i++) {
    const hard = range(r, 0.75, 1) * (i === n - 1 ? 0.8 : 1);
    board.hit(s, f * range(r, 0.96, 1.04), hard);
    bump(tock.gain, s, 0.55 * hard, 0.001, 0.018);
    s += gap * range(r, 0.85, 1.15);
  }
  return end;
}

/** The tapper's knife into a palm's flower stalk: a firm "chok" into the pith, the fibres slicing, once or twice. */
function stalk(v: Voice, t: number): number {
  const r = v.r;
  const n = r() < 0.6 ? 1 : 2;
  const end = t + n * 0.45 + 0.4;
  const pith = new Struck(v, t, end, [
    [1, 1, 0.03],
    [2.2, 0.35, 0.015],
  ], v.out);
  const slice = v.gain();
  const band = v.filter('bandpass', 3000, 1.4);
  v.noise('white', t, end).connect(band).connect(slice).connect(v.out);
  let s = t;
  for (let i = 0; i < n; i++) {
    pith.hit(s, range(r, 260, 340), range(r, 0.6, 0.9));
    band.frequency.setValueAtTime(range(r, 2400, 3000), s);
    band.frequency.linearRampToValueAtTime(range(r, 3600, 4400), s + 0.09);
    line(slice.gain, s, [
      [0, 0],
      [0.006, 0.45],
      [0.05, 0.25],
      [0.11, 0],
    ]);
    s += range(r, 0.3, 0.45);
  }
  return end;
}

/** A machete into a coconut: the blade's thwack into the husk, the fibres tearing, the hollow nut under it. */
function machete(v: Voice, t: number): number {
  const r = v.r;
  const n = 1 + Math.floor(r() * 3);
  const end = t + n * 0.95 + 0.5;
  const nut = new Struck(v, t, end, [
    [1, 1, 0.06],
    [1.93, 0.35, 0.03],
    [3.1, 0.15, 0.015],
  ], v.out);
  const whack = v.gain();
  v.noise('pink', t, end).connect(v.filter('lowpass', 1700, 0.8)).connect(whack).connect(v.out);
  const fibre = v.gain();
  v.noise('white', t, end).connect(v.filter('bandpass', 3200, 1)).connect(fibre).connect(v.out);
  const f = range(r, 260, 360);
  let s = t;
  for (let i = 0; i < n; i++) {
    const hard = range(r, 0.8, 1);
    nut.hit(s + 0.004, f * range(r, 0.95, 1.05), 0.8 * hard);
    bump(whack.gain, s, 1.3 * hard, 0.002, 0.03);
    bump(fibre.gain, s + 0.01, 0.35 * hard, 0.004, 0.05);
    s += range(r, 0.75, 1.1);
  }
  return end;
}

/** A wok: the hiss as the food goes in, a steady sizzle of spitting oil, a spatula scraping and clinking. */
export function sizzle(v: Voice, t: number): number {
  const r = v.r;
  const dur = range(r, 2.6, 4);
  const end = t + dur;
  // The hiss, loud as the food goes in, settling to a steady fry that breathes a little.
  const hiss = v.gain();
  v.noise('white', t, end).connect(v.filter('highpass', 3200, 0.6)).connect(v.filter('lowpass', 9000, 0.5)).connect(hiss).connect(v.out);
  const drop = r() < 0.6;
  line(hiss.gain, t, [
    [0, 0],
    [drop ? 0.03 : 0.3, drop ? 0.55 : 0.2],
    [drop ? 0.7 : 0.6, 0.22],
    [dur - 0.5, 0.2],
    [dur, 0],
  ]);
  // The spitting: tiny pops (the water-drops loop, its bubbles taken off), in slow waves.
  const spit = v.gain();
  const breathe = v.gain(1);
  v.lfo(breathe.gain, range(r, 0.4, 0.9), 0.3, t, end);
  v.buffer(source('splash'), t, end, r() * 3, true, range(r, 0.9, 1.15)).connect(v.filter('highpass', 1800, 0.7)).connect(spit).connect(breathe).connect(v.out);
  line(spit.gain, t, [
    [0, 0],
    [0.15, drop ? 1.1 : 0.6],
    [0.9, 0.7],
    [dur - 0.4, 0.6],
    [dur, 0],
  ]);
  // The spatula on the iron: a scrape, a clink or two.
  const pan = new Struck(v, t, end, [
    [1, 1, 0.22],
    [1.52, 0.6, 0.15],
    [2.46, 0.35, 0.08],
  ], v.out, { f: 4200, q: 1.5, level: 0.6 });
  const scrape = v.gain();
  const band = v.filter('bandpass', 2400, 2.5);
  v.noise('white', t, end).connect(band).connect(scrape).connect(v.out);
  const f = range(r, 1900, 2500);
  for (let i = 0, n = 1 + Math.floor(r() * 3); i < n; i++) {
    const s = t + range(r, 0.5, dur - 0.5);
    line(band.frequency, s, [
      [0, 1800],
      [0.14, 2900],
    ]);
    line(scrape.gain, s, [
      [0, 0],
      [0.03, 0.18],
      [0.14, 0.12],
      [0.2, 0],
    ]);
    pan.hit(s + 0.2, f * range(r, 0.98, 1.02), range(r, 0.05, 0.1));
  }
  return end;
}

/** Thick palm syrup boiling down: slow, low blips (each bubble swells, then bursts upward), a soft roil under them. */
export function bubble(v: Voice, t: number): number {
  const r = v.r;
  const dur = range(r, 3, 4.5);
  const end = t + dur;
  const roil = v.gain();
  v.noise('brown', t, end).connect(v.filter('lowpass', 380, 0.7)).connect(roil).connect(v.out);
  line(roil.gain, t, [
    [0, 0],
    [0.6, 0.2],
    [dur - 0.6, 0.2],
    [dur, 0],
  ]);
  // Three bubble voices in turn.
  const pops = [0, 1, 2].map(() => {
    const o = v.osc('sine', t, end, 150);
    const g = v.gain();
    o.connect(g).connect(v.out);
    return { o, g };
  });
  const click = v.gain();
  v.noise('white', t, end).connect(v.filter('bandpass', 1100, 1)).connect(click).connect(v.out);
  let s = t + range(r, 0.05, 0.3);
  let k = 0;
  while (s < end - 0.25) {
    const p = pops[k++ % pops.length];
    const f0 = range(r, 140, 300);
    const grow = range(r, 0.05, 0.1);
    const big = range(r, 0.5, 1);
    // The bubble rising and swelling (a low note), then its skin bursting (the note jumps up and dies).
    p.o.frequency.setValueAtTime(f0, s);
    p.o.frequency.exponentialRampToValueAtTime(f0 * range(r, 1.15, 1.35), s + grow);
    p.o.frequency.exponentialRampToValueAtTime(f0 * range(r, 2, 2.8), s + grow + 0.035);
    line(p.g.gain, s, [
      [0, 0],
      [grow, big],
      [grow + 0.03, big * 0.6],
      [grow + 0.09, 0],
    ]);
    // (the thick skin splitting: a soft wet splat)
    bump(click.gain, s + grow + 0.01, 0.3 * big, 0.002, 0.012);
    // Thick: one or two a second, now and then two close together.
    s += r() < 0.25 ? range(r, 0.08, 0.16) : range(r, 0.35, 0.9);
  }
  return end;
}

/** A wood fire: crackles and pops (the fire loop), the flames' soft breathing, a bigger pop or two. */
export function crackle(v: Voice, t: number): number {
  const r = v.r;
  const dur = range(r, 3.5, 5);
  const end = t + dur;
  const snaps = v.gain();
  v.buffer(source('fire'), t, end, r() * 4, true, range(r, 0.85, 1.1)).connect(v.filter('highpass', 350, 0.7)).connect(snaps).connect(v.out);
  line(snaps.gain, t, [
    [0, 0],
    [0.4, 1],
    [dur - 0.5, 1],
    [dur, 0],
  ]);
  // The flames: a soft low roar, fluttering.
  const flame = v.gain();
  const flutter = v.gain(1);
  v.lfo(flutter.gain, range(r, 0.8, 1.6), 0.35, t, end);
  v.noise('pink', t, end).connect(v.filter('lowpass', 650, 0.7)).connect(flame).connect(flutter).connect(v.out);
  line(flame.gain, t, [
    [0, 0],
    [0.8, 0.07],
    [dur - 0.8, 0.07],
    [dur, 0],
  ]);
  // A knot bursting: a sharp pop with a little thump.
  const pop = v.gain();
  v.noise('white', t, end).connect(v.filter('bandpass', range(r, 1500, 2600), 0.9)).connect(pop).connect(v.out);
  const thump = new Struck(v, t, end, [[1, 1, 0.03]], v.out);
  for (let i = 0, n = r() < 0.6 ? 1 : 2; i < n; i++) {
    const s = t + range(r, 0.4, dur - 0.6);
    bump(pop.gain, s, range(r, 0.5, 0.9), 0.0008, 0.007);
    bump(pop.gain, s + 0.012, range(r, 0.2, 0.4), 0.0008, 0.005);
    thump.hit(s, range(r, 110, 150), 0.25);
  }
  return end;
}

// ── Bamboo, bells and wheels ──────────────────────────────────────────────

/** Hollow bamboo: the tapper's tubes clonking together, or his foot on a rung of the ladder (its lashings creak). */
export function knock(v: Voice, t: number): number {
  const r = v.r;
  if (r() < 0.6) {
    // Tubes: two or three quick clonks, two pitches (a tube's wall rings, its air column booms softly under it).
    const end = t + 0.9;
    const wall = new Struck(v, t, end, [
      [1, 1, 0.055],
      [2.13, 0.4, 0.03],
      [3.9, 0.15, 0.014],
    ], v.out, { f: 2400, q: 1.2, level: 0.5 });
    const air = new Struck(v, t, end, [[1, 0.5, 0.07]], v.out);
    const f = range(r, 520, 760);
    const lo = range(r, 170, 240);
    let s = t;
    for (let i = 0, n = 2 + Math.floor(r() * 2); i < n; i++) {
      const k = i % 2 ? range(r, 1.12, 1.25) : 1;
      wall.hit(s, f * k, range(r, 0.6, 1));
      air.hit(s, lo * k, 1);
      s += range(r, 0.07, 0.2);
    }
    return end;
  }
  // The ladder: a foot on a rung (a duller knock), the rattan lashings creaking; now and then a second.
  const n = r() < 0.7 ? 1 : 2;
  const end = t + n * 0.7 + 0.4;
  const rung = new Struck(v, t, end, [
    [1, 1, 0.05],
    [2.4, 0.35, 0.025],
    [4.3, 0.12, 0.012],
  ], v.out, { f: 1600, q: 1, level: 0.4 });
  const creak = v.osc('sawtooth', t, end, 180);
  const cg = v.gain();
  const stick = v.gain(0.6);
  v.lfo(stick.gain, range(r, 26, 38), 0.4, t, end, 'square');
  creak.connect(v.filter('bandpass', range(r, 900, 1300), 3)).connect(cg).connect(stick).connect(v.out);
  let s = t;
  for (let i = 0; i < n; i++) {
    rung.hit(s, range(r, 240, 330), range(r, 0.8, 1));
    const c0 = s + range(r, 0.05, 0.12);
    const len = range(r, 0.15, 0.3);
    creak.frequency.setValueAtTime(range(r, 150, 200), c0);
    creak.frequency.linearRampToValueAtTime(range(r, 220, 280), c0 + len);
    line(cg.gain, c0, [
      [0, 0],
      [len * 0.3, 0.12],
      [len, 0],
    ]);
    s += range(r, 0.55, 0.8);
  }
  return end;
}

/** A bicycle's thumb bell: two rings, each a burst of quick clapper strikes on the dome, then its ring. */
export function bikeBell(v: Voice, t: number): number {
  const r = v.r;
  const end = t + 3.6;
  const f = range(r, 2500, 2950);
  const dome = new Struck(v, t, end, [
    [1, 1, 0.5],
    [1.0026, 0.7, 0.55],
    [1.59, 0.45, 0.3],
    [2.42, 0.3, 0.18],
    [3.3, 0.12, 0.1],
  ], v.out, { f: 5200, q: 1.5, level: 0.25 });
  let s = t;
  for (let ring = 0, rings = r() < 0.75 ? 2 : 1; ring < rings; ring++) {
    const rate = range(r, 17, 24);
    const hits = 5 + Math.floor(r() * 4);
    for (let i = 0; i < hits; i++) dome.hit(s + i / rate, f, (0.45 + 0.25 * r()) * (1 - (0.3 * i) / hits));
    s += hits / rate + range(r, 0.12, 0.2);
  }
  return end;
}

/** A small single's exhaust: the firing's harmonics, strongest round the 5th–7th (the pipe's note), a second bump round the 20th (the muffler's shell), a thin floor of the rest. */
const pipes = new WeakMap<BaseAudioContext, PeriodicWave>();
function pipe(ctx: BaseAudioContext): PeriodicWave {
  let w = pipes.get(ctx);
  if (!w) {
    const H = 48;
    const real = new Float32Array(H + 1);
    const imag = new Float32Array(H + 1);
    for (let h = 1; h <= H; h++) imag[h] = Math.exp(-(((h - 6) / 3.5) ** 2)) + 0.4 * Math.exp(-(((h - 20) / 6) ** 2)) + 0.3 / h ** 0.6;
    pipes.set(ctx, (w = ctx.createPeriodicWave(real, imag)));
  }
  return w;
}

/** Where a sound is from the ears: its level, air (low-pass, Hz), pan and reverb send (people.ts places the moto with its own rules). */
export type Placing = (x: number, y: number, z: number, gain: number) => { level: number; air: number; pan: number; wet: number; d: number; rx: number; ry: number; rz: number };

/**
 * A small 110 cc moto on the move. It is a lasting voice, not a one-off:
 * its engine runs while its calls keep coming (a call every few seconds as
 * it rides: `call`), placed where it is now — carried on at its speed
 * between calls — louder and brighter close by, its note shifted as it
 * comes and goes (Doppler), the engine idling when it stands and revving
 * with its speed (a four-stroke single: a putt-putt at the kerb, a buzz on
 * the road). With no call for a few seconds it dies away and stops. ~20
 * nodes, five sources, moved ~15 times a second.
 */
export class MotoVoice {
  x: number;
  y: number;
  z: number;
  vx = 0;
  vz = 0;
  gain: number;
  /** When its last call came (audio clock), and whether its speed is known yet. */
  last: number;
  private moving = false;
  /** Stopped (its sources end at `end`). */
  done = false;
  private end = Infinity;
  private readonly v: Voice;
  private readonly exhaust: OscillatorNode;
  private readonly beat: OscillatorNode;
  private readonly tyres: GainNode;
  private readonly tone: BiquadFilterNode;
  private readonly env: GainNode;
  private readonly level: GainNode;
  private readonly air: BiquadFilterNode;
  private readonly pan: StereoPannerNode;
  private readonly send: GainNode;
  private readonly base: number;

  constructor(ctx: BaseAudioContext, r: Rng, c: { x: number; y: number; z: number; gain: number }, now: number, dry: AudioNode, wet: AudioNode) {
    this.x = c.x;
    this.y = c.y;
    this.z = c.z;
    this.gain = c.gain;
    this.last = now;
    const v = (this.v = new Voice(ctx, r));
    this.base = range(r, 0.92, 1.08);
    const far = now + 3600;
    this.exhaust = v.osc(pipe(ctx), now, far, 30 * this.base);
    v.lfo(this.exhaust.detune, range(r, 5, 8), 10, now, far);
    // (no two firings alike: the exhaust's level jitters)
    const jitter = v.gain(1);
    v.noise('brown', now, far).connect(v.filter('lowpass', 40, 0.7)).connect(v.gain(1.4)).connect(jitter.gain);
    const mix = v.gain(1);
    this.exhaust.connect(jitter).connect(mix);
    // The valves and the chain: a rasp of noise on each firing.
    const rasp = v.gain(0.05);
    v.noise('white', now, far).connect(v.filter('bandpass', 1300, 1)).connect(rasp).connect(mix);
    this.beat = v.osc('square', now, far, 30 * this.base);
    this.beat.connect(v.gain(0.05)).connect(rasp.gain);
    // The tyres on the road (only when it rolls).
    this.tyres = v.gain(0);
    v.noise('pink', now, far).connect(v.filter('bandpass', 650, 0.6)).connect(this.tyres).connect(mix);
    this.tone = v.filter('lowpass', 2500, 0.7);
    this.env = v.gain(0);
    this.env.gain.setTargetAtTime(1, now, 0.25);
    this.level = v.gain(0);
    this.air = v.filter('lowpass', 8000, 0.5);
    this.pan = v.keep(ctx.createStereoPanner());
    this.send = v.gain(0);
    mix.connect(v.filter('highpass', 85, 0.7)).connect(this.tone).connect(this.env).connect(this.level).connect(this.air).connect(this.pan).connect(dry);
    this.pan.connect(this.send).connect(wet);
    v.play();
  }

  /** Its calls have stopped: it is dying away. */
  get fading(): boolean {
    return this.end !== Infinity;
  }

  /** Another call from it: where it is now (its speed from how far it went since the last). */
  call(c: { x: number; y: number; z: number; gain: number }, now: number): void {
    const dt = now - this.last;
    if (dt > 0.3) {
      const vx = (c.x - this.x) / dt;
      const vz = (c.z - this.z) / dt;
      const k = this.moving ? 0.5 : 1;
      this.vx += (vx - this.vx) * k;
      this.vz += (vz - this.vz) * k;
      const sp = Math.hypot(this.vx, this.vz);
      if (sp > 20) {
        this.vx *= 20 / sp;
        this.vz *= 20 / sp;
      }
      this.moving = true;
    }
    this.x = c.x;
    this.y = c.y;
    this.z = c.z;
    this.gain = c.gain;
    this.last = now;
  }

  /** Where it is now (carried on at its speed, at most 4 s past its last call). */
  at(now: number): [number, number, number] {
    const u = Math.min(4, Math.max(0, now - this.last));
    return [this.x + this.vx * u, this.y, this.z + this.vz * u];
  }

  /** Move it (every ~1/15 s): its place from the ears (`place`), its speed's note; dies away once its calls stop (`quiet` s). */
  update(now: number, place: Placing, quiet: number): void {
    if (this.done) return;
    if (now > this.end) {
      this.done = true;
      return;
    }
    const [x, y, z] = this.at(now);
    const p = place(x, y, z, this.gain);
    // (its speed is known from its second call on; till then it is taken to be riding at a steady 7 m/s)
    const speed = this.moving ? Math.hypot(this.vx, this.vz) : 7;
    // Receding (radial speed > 0): the note drops; coming: it is up.
    const radial = (p.rx * this.vx + p.rz * this.vz) / Math.max(1, p.d);
    const doppler = 343 / (343 + radial);
    const fire = (12 + 2.6 * Math.min(10, speed)) * this.base * doppler;
    const tc = 0.12;
    glide(this.exhaust.frequency, fire, now, tc);
    glide(this.beat.frequency, fire, now, tc);
    glide(this.tyres.gain, 0.22 * Math.min(1, speed / 6), now, 0.3);
    glide(this.tone.frequency, 900 + 3100 * Math.min(1, 12 / Math.max(1, p.d)), now, 0.2);
    glide(this.level.gain, p.level, now, tc);
    glide(this.air.frequency, p.air, now, tc);
    glide(this.pan.pan, p.pan, now, tc);
    glide(this.send.gain, p.wet, now, 0.3);
    if (now - this.last > quiet && this.end === Infinity) {
      // No more calls: it rides off (or stops) and dies away.
      glide(this.env.gain, 0, now, 0.4);
      this.end = now + 2.5;
      this.v.stop(this.end);
    }
  }

  /** Stop at once (the bus muted). */
  stop(now: number): void {
    if (this.done) return;
    this.done = true;
    this.v.stop(now);
  }
}

/** The Khmer wooden cattle bell, one swing of it (a call a step): a hollow "klok", mostly its second clapper after ("klok-klok"), two notes. */
export function cowBell(v: Voice, t: number): number {
  const r = v.r;
  const end = t + 1.2;
  const box = new Struck(v, t, end, [
    [1, 1, 0.08],
    [1.72, 0.4, 0.045],
    [2.95, 0.18, 0.022],
  ], v.out, { f: 1900, q: 1.1, level: 0.45 });
  const cavity = new Struck(v, t, end, [[1, 0.35, 0.06]], v.out);
  const f = range(r, 360, 480);
  // "klok-klok": the swing throws both clappers, one after the other.
  for (const [k, dt] of [
    [1, 0],
    [range(r, 1.06, 1.12), range(r, 0.1, 0.18)],
  ] as const) {
    if (dt && r() < 0.25) continue;
    const hard = range(r, 0.6, 1);
    box.hit(t + dt, f * k, hard);
    cavity.hit(t + dt, f * 0.55 * k, hard);
  }
  return end;
}

/**
 * Children playing in the water, from the call's moment: a jump landing
 * (`big`: a deep plunge, spray thrown up, drops falling back, then a slap
 * or two as they come up) or a splash fight (hands slapping the water back
 * and forth); one of them laughs now and then (`laugh`).
 */
export function splashPlay(v: Voice, t: number, big: boolean): number {
  const r = v.r;
  const end = t + 3.6;
  if (big) {
    // The plunge: a heavy hit that closes into a low "bloop", spray thrown up and falling back.
    const hit = v.gain();
    const band = v.filter('lowpass', 4500, 0.7);
    v.noise('white', t, t + 0.9).connect(band).connect(hit).connect(v.out);
    line(band.frequency, t, [
      [0, 4500],
      [0.3, 700],
    ]);
    bump(hit.gain, t, 1, 0.004, 0.14);
    const bloop = v.osc('sine', t, t + 0.5, 150);
    bloop.frequency.setValueAtTime(150, t + 0.01);
    bloop.frequency.exponentialRampToValueAtTime(70, t + 0.12);
    const bg = v.gain();
    bloop.connect(bg).connect(v.out);
    bump(bg.gain, t + 0.01, 0.35, 0.004, 0.05);
    const spray = v.gain();
    v.noise('white', t + 0.05, t + 1.4).connect(v.filter('highpass', 2600, 0.6)).connect(spray).connect(v.out);
    bump(spray.gain, t + 0.08, 0.35, 0.06, 0.25);
  }
  // Hands slapping the water: a wet slap each (one noise, its band moving), quick.
  const slap = v.gain();
  const band = v.filter('bandpass', 1300, 1.1);
  v.noise('white', t, end).connect(band).connect(slap).connect(v.out);
  let s = t + (big ? range(r, 0.7, 1.1) : 0);
  const n = big ? 1 + Math.floor(r() * 2) : 3 + Math.floor(r() * 4);
  for (let i = 0; i < n && s < end - 0.6; i++) {
    band.frequency.setValueAtTime(range(r, 900, 2000), s);
    bump(slap.gain, s, range(r, 0.35, 0.8) * (big ? 0.6 : 1), 0.002, range(r, 0.025, 0.05));
    s += r() < 0.4 ? range(r, 0.08, 0.14) : range(r, 0.16, 0.35);
  }
  // Drops falling back: short rising notes.
  const drops = [0, 1].map(() => {
    const o = v.osc('sine', t, end, 900);
    const g = v.gain();
    o.connect(g).connect(v.out);
    return { o, g };
  });
  for (let i = 0, m = big ? 8 : 4; i < m; i++) {
    const d = drops[i % 2];
    const at = t + range(r, 0.15, big ? 2.2 : 1.2);
    const f0 = 700 * 3 ** (r() ** 1.3);
    d.o.frequency.setValueAtTime(f0, at);
    d.o.frequency.exponentialRampToValueAtTime(f0 * range(r, 1.4, 1.8), at + 0.03);
    bump(d.g.gain, at, range(r, 0.04, 0.1), 0.0015, 0.012);
  }
  if (r() < (big ? 0.65 : 0.4)) laugh(v, t + range(r, 0.5, 1.5));
  return end;
}

/** Children laughing, far off: a run of short voiced "ha"s, falling a little, a second child now and then. */
export function laugh(v: Voice, t: number): number {
  const r = v.r;
  const kids = r() < 0.4 ? 2 : 1;
  let end = t;
  for (let c = 0; c < kids; c++) {
    let s = t + c * range(r, 0.15, 0.4);
    const f0 = range(r, 360, 470) * (c ? 1.15 : 1);
    const n = 3 + Math.floor(r() * 5);
    const voice = v.osc('sawtooth', s, s + n * 0.22 + 0.2, f0);
    const env = v.gain();
    env.gain.setValueAtTime(0, s);
    const breath = v.noise('pink', s, s + n * 0.22 + 0.2);
    const benv = v.gain();
    benv.gain.setValueAtTime(0, s);
    for (let k = 0; k < n; k++) {
      const len = range(r, 0.08, 0.13);
      const f = f0 * (1.12 - (0.18 * k) / n) * range(r, 0.97, 1.03);
      voice.frequency.setValueAtTime(f * 1.05, s);
      voice.frequency.linearRampToValueAtTime(f * 0.92, s + len);
      env.gain.setValueAtTime(0, s);
      env.gain.linearRampToValueAtTime(0.5, s + 0.015);
      env.gain.linearRampToValueAtTime(0, s + len);
      benv.gain.setValueAtTime(0, s);
      benv.gain.linearRampToValueAtTime(0.25, s + 0.01);
      benv.gain.linearRampToValueAtTime(0, s + len * 0.7);
      s += len + range(r, 0.06, 0.1);
    }
    end = Math.max(end, s);
    // (the vowel "a": two formants)
    const mix = v.gain(1);
    voice.connect(env);
    env.connect(v.filter('bandpass', range(r, 950, 1150), 4)).connect(mix);
    env.connect(v.filter('bandpass', range(r, 1500, 1800), 5)).connect(v.gain(0.4)).connect(mix);
    breath.connect(v.filter('bandpass', 1800, 1.5)).connect(benv).connect(mix);
    mix.connect(v.out);
  }
  return end;
}

/** Bowls and spoons at the market: two or three small clinks of china and tin. */
export function clink(v: Voice, t: number): number {
  const r = v.r;
  const end = t + 1.2;
  const bowl = new Struck(v, t, end, [
    [1, 1, 0.09],
    [2.32, 0.45, 0.05],
    [4.25, 0.2, 0.025],
  ], v.out, { f: 6000, q: 1.2, level: 0.3 });
  const f = range(r, 2100, 3300);
  let s = t;
  for (let i = 0, n = 2 + Math.floor(r() * 2); i < n; i++) {
    bowl.hit(s, f * range(r, 0.92, 1.08), range(r, 0.4, 1));
    s += range(r, 0.07, 0.3);
  }
  return end;
}

/** A carpenter's hammer on a post, far off: a few even knocks, the last one or two harder. */
export function hammer(v: Voice, t: number): number {
  const r = v.r;
  const n = 3 + Math.floor(r() * 5);
  const gap = range(r, 0.45, 0.65);
  const end = t + n * gap + 0.5;
  const post = new Struck(v, t, end, [
    [1, 1, 0.045],
    [2.6, 0.4, 0.02],
    [4.4, 0.15, 0.01],
  ], v.out, { f: 2200, q: 1, level: 0.6 });
  const f = range(r, 330, 450);
  for (let i = 0; i < n; i++) post.hit(t + i * gap * range(r, 0.95, 1.05), f * range(r, 0.97, 1.03), i >= n - 2 ? 1 : range(r, 0.6, 0.8));
  return end;
}

/**
 * The village's hand pump: the iron lever worked up and down (a squeak on
 * the way up, a clank at the bottom), and each stroke's gush of water into
 * the basin; five to eight strokes.
 */
export function pump(v: Voice, t: number): number {
  const r = v.r;
  const n = 5 + Math.floor(r() * 4);
  const stroke = range(r, 0.85, 1.15);
  const end = t + n * stroke + 1;
  const iron = new Struck(v, t, end, [
    [1, 1, 0.05],
    [2.76, 0.5, 0.03],
    [5.4, 0.25, 0.015],
  ], v.out, { f: 3000, q: 1.3, level: 0.4 });
  const squeak = v.osc('sawtooth', t, end, 900);
  const sg = v.gain();
  squeak.connect(v.filter('bandpass', range(r, 1500, 2000), 4)).connect(sg).connect(v.out);
  // (the gush: water splashing into the basin — the drops' crackle and a gurgle)
  const gush = v.gain();
  const band = v.filter('bandpass', 900, 0.7);
  v.buffer(source('splash'), t, end, r() * 3, true, 0.8).connect(band).connect(gush).connect(v.out);
  v.buffer(source('babble'), t, end, r() * 6, true, 1.2).connect(v.filter('lowpass', 1600, 0.7)).connect(v.gain(0.6)).connect(gush);
  const f = range(r, 380, 460);
  const sq = range(r, 850, 1100);
  for (let i = 0; i < n; i++) {
    const s = t + i * stroke;
    // Up: the squeak (rising a little).
    squeak.frequency.setValueAtTime(sq, s);
    squeak.frequency.linearRampToValueAtTime(sq * range(r, 1.08, 1.18), s + 0.28);
    line(sg.gain, s, [
      [0, 0],
      [0.06, 0.1],
      [0.24, 0.06],
      [0.3, 0],
    ]);
    // Down: the clank, and the water comes.
    iron.hit(s + stroke * 0.55, f * range(r, 0.98, 1.02), range(r, 0.7, 1));
    band.frequency.setValueAtTime(range(r, 700, 900) + 40 * i, s + stroke * 0.6);
    line(gush.gain, s + stroke * 0.6, [
      [0, 0],
      [0.08, 0.5],
      [0.3, 0.35],
      [0.55, 0],
    ]);
  }
  return end;
}
