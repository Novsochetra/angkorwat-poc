import { biquad, cleanup, glide, noise, note, range, source, weighted, type Rng } from './dsp';
import type { SoundEngine } from './engine';

/**
 * Highland jungle ambience.
 *
 * Always: wind in the trees (pink noise, band-passed, slow gusts; leaves
 * rustle on the strong ones). (The waterfalls and rivers are placed on the
 * map, on their own bus: water.ts.)
 * Day: sparse birds — whistles, chirp runs, trills, a distant cuckoo, a dove;
 * the cicadas' shimmering chorus in waves, loud under the jungle's canopy
 * while roaming (`Cicadas`), fading at dusk; birds and cicadas hush in rain.
 * Night: crickets and a katydid (looping buffers, started only at night),
 * frogs now and then, an owl, softer wind.
 * Muted (`idle`), the loops stop once silent.
 */

/** Base levels (before the ambience volume). */
const LEVEL = {
  wind: 0.19,
  leaves: 0.16,
  insects: 0.36,
  bird: 0.17,
  frog: 0.13,
  owl: 0.17,
  /** The day's cicadas, under the canopy (Cicadas). */
  cicada: 0.7,
};

/** A looping buffer that plays only while wanted (lets night layers cost nothing by day). */
class LoopLayer {
  private src: AudioBufferSourceNode | null = null;
  private idleSince = -1;
  private readonly ctx: BaseAudioContext;
  private readonly make: () => AudioBuffer;
  private readonly dest: AudioNode;
  private readonly rnd: Rng;
  private readonly rate: number;

  constructor(ctx: BaseAudioContext, make: () => AudioBuffer, dest: AudioNode, rnd: Rng, rate = 1) {
    this.ctx = ctx;
    this.make = make;
    this.dest = dest;
    this.rnd = rnd;
    this.rate = rate;
  }

  want(on: boolean, now: number): void {
    if (on) {
      this.idleSince = -1;
      if (this.src) return;
      const buf = this.make();
      const s = this.ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.playbackRate.value = this.rate;
      s.connect(this.dest);
      s.start(now, this.rnd() * buf.duration);
      s.onended = () => s.disconnect();
      this.src = s;
    } else if (this.src) {
      // The layer's gain is already fading; stop it once it has been silent a while.
      if (this.idleSince < 0) this.idleSince = now;
      else if (now - this.idleSince > 6) {
        this.src.stop(now);
        this.src = null;
        this.idleSince = -1;
      }
    }
  }
}

/**
 * The jungle's cicadas by day: a shimmering high drone that swells and
 * fades in slow waves. A few layers, each a narrow band of noise at its own
 * pitch, pulsed at its own rate (the buzz) and placed left or right, each
 * swelling on its own; now and then one cicada nearer by winds up in a
 * rising whine and dies away. `level` (Ambience.mix) follows the day and
 * the leaves over the explorer (`MapFrame.canopy`): soft over the map,
 * loud in the forest, gone at dusk. Its sources run only while heard.
 */
class Cicadas {
  readonly level: GainNode;
  private readonly ctx: BaseAudioContext;
  private readonly rnd: Rng;
  private readonly wet: AudioNode;
  private readonly layers: { f: number; q: number; pulse: number; pan: number; gain: number; swell: GainNode | null; stop: (() => void) | null; next: number }[] = [
    { f: 4800, q: 7, pulse: 112, pan: -0.5, gain: 1, swell: null, stop: null, next: 0 },
    { f: 6100, q: 8, pulse: 151, pan: 0.45, gain: 0.8, swell: null, stop: null, next: 0 },
    { f: 3900, q: 5, pulse: 86, pan: 0.05, gain: 0.6, swell: null, stop: null, next: 0 },
  ];
  private on = false;
  private idleSince = -1;
  private nextWhine = -1;
  /** The level's target (its last glide), to know when the chorus is heard. */
  heard = 0;

  constructor(ctx: BaseAudioContext, dry: AudioNode, wet: AudioNode, rnd: Rng) {
    this.ctx = ctx;
    this.rnd = rnd;
    this.wet = wet;
    this.level = ctx.createGain();
    this.level.gain.value = 0;
    const soft = biquad(ctx, 'lowpass', 9000, 0.5);
    this.level.connect(soft).connect(dry);
    const send = ctx.createGain();
    send.gain.value = 0.2;
    soft.connect(send).connect(wet);
  }

  schedule(now: number, until: number): void {
    if (!this.keep(this.heard > 0.002, now)) return;
    const r = this.rnd;
    for (const L of this.layers) {
      if (!L.swell) continue;
      if (L.next < now) L.next = now;
      while (L.next < until) {
        // A wave: up over a few seconds, held, down, a rest.
        const t = L.next;
        const rise = range(r, 2.5, 5);
        const hold = range(r, 3, 9);
        const fall = range(r, 3, 6);
        const g = L.swell.gain;
        g.setTargetAtTime(L.gain * range(r, 0.6, 1), t, rise / 3);
        g.setTargetAtTime(L.gain * range(r, 0.04, 0.18), t + rise + hold, fall / 3);
        L.next = t + rise + hold + fall + range(r, 2, 8);
      }
    }
    if (this.nextWhine < now) this.nextWhine = now + range(r, 6, 20);
    while (this.nextWhine < until) this.nextWhine = this.whine(this.nextWhine);
  }

  /** The ambience is muted (nothing is scheduled): the chorus stops once it has been silent a while. */
  idle(now: number): void {
    this.keep(false, now);
  }

  /** Start the chorus when `want`ed; when not, stop it once it has been silent a while (its level is already fading). Whether it runs. */
  private keep(want: boolean, now: number): boolean {
    if (want && !this.on) this.start(now);
    if (!want && this.on) {
      if (this.idleSince < 0) this.idleSince = now;
      else if (now - this.idleSince > 6) this.stop(now);
    } else this.idleSince = -1;
    return this.on;
  }

  private start(now: number): void {
    const ctx = this.ctx;
    const r = this.rnd;
    this.on = true;
    for (const L of this.layers) {
      const src = ctx.createBufferSource();
      const buf = noise('white');
      src.buffer = buf;
      src.loop = true;
      const band = biquad(ctx, 'bandpass', L.f * range(r, 0.97, 1.03), L.q);
      // The buzz: the band pulsed a hundred-odd times a second.
      const am = ctx.createGain();
      am.gain.value = 0.55;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = L.pulse * range(r, 0.95, 1.05);
      const depth = ctx.createGain();
      depth.gain.value = 0.45;
      lfo.connect(depth).connect(am.gain);
      const swell = ctx.createGain();
      swell.gain.value = L.gain * 0.1;
      const pan = ctx.createStereoPanner();
      pan.pan.value = L.pan;
      src.connect(band).connect(am).connect(swell).connect(pan).connect(this.level);
      src.start(now, r() * buf.duration);
      lfo.start(now);
      L.swell = swell;
      L.next = now + range(r, 0, 3);
      L.stop = () => {
        src.stop();
        lfo.stop();
        for (const n of [src, band, am, lfo, depth, swell, pan]) n.disconnect();
      };
    }
  }

  private stop(now: number): void {
    this.on = false;
    this.idleSince = -1;
    for (const L of this.layers) {
      L.stop?.();
      L.stop = null;
      L.swell = null;
      L.next = now;
    }
  }

  /** One cicada close by: a pulsing whine that winds up in pitch, holds, and dies away. Returns when the next may come. */
  private whine(t: number): number {
    const r = this.rnd;
    const ctx = this.ctx;
    const dur = range(r, 3.5, 6);
    const o = ctx.createOscillator();
    const f = range(r, 3300, 3900);
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * range(r, 1.15, 1.25), t + dur * 0.55);
    o.frequency.linearRampToValueAtTime(f * range(r, 1.05, 1.12), t + dur);
    const am = ctx.createGain();
    am.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = range(r, 38, 55);
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth).connect(am.gain);
    const env = ctx.createGain();
    env.gain.value = 0;
    const peak = range(r, 0.05, 0.09);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak * 0.3, t + dur * 0.2);
    env.gain.linearRampToValueAtTime(peak, t + dur * 0.55);
    env.gain.linearRampToValueAtTime(peak * 0.8, t + dur * 0.8);
    env.gain.linearRampToValueAtTime(0, t + dur);
    const pan = ctx.createStereoPanner();
    pan.pan.value = range(r, -0.8, 0.8);
    o.connect(am).connect(env).connect(pan).connect(this.level);
    const send = ctx.createGain();
    send.gain.value = 0.3;
    pan.connect(send).connect(this.wet);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
    cleanup(o, [o, lfo, depth, am, env, pan, send]);
    return t + dur + range(r, 15, 45);
  }
}

type BirdKind = 'whistle' | 'chirps' | 'trill' | 'cuckoo' | 'dove';

export class Ambience {
  private readonly e: SoundEngine;
  private readonly ctx: BaseAudioContext;
  private readonly rnd: Rng;
  private readonly windMix: GainNode;
  private readonly gust: GainNode;
  private readonly windTone: BiquadFilterNode;
  private readonly leaves: GainNode;
  private readonly insects: GainNode;
  private readonly insectLayers: LoopLayer[];
  private readonly cicadas: Cicadas;
  private dayW = 1;
  /** Rain now (0‥1, `setRain`): the birds and the cicadas keep quiet in it. */
  rain = 0;
  /** The rain and the leaves over him the cicadas' level was last set for. */
  private cicadaRain = 0;
  private canopy = 0;
  private nightW = 0;
  private nextGust = -1;
  private nextBird = -1;
  private nextFrog = -1;
  private nextOwl = -1;
  private lastCuckoo = -1e9;
  private lastDove = -1e9;

  constructor(e: SoundEngine) {
    this.e = e;
    const ctx = (this.ctx = e.ctx);
    this.rnd = e.rnd;
    const dry = e.bus.ambience.dry;
    const now = ctx.currentTime;
    const loop = (buf: AudioBuffer, rate = 1) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.playbackRate.value = rate;
      s.start(now, this.rnd() * buf.duration);
      return s;
    };
    const filter = (type: BiquadFilterType, f: number, q: number) => biquad(ctx, type, f, q);
    const gain = (v: number) => {
      const g = ctx.createGain();
      g.gain.value = v;
      return g;
    };

    // Wind: gusts move its level and pitch; the leaves follow the strong ones.
    this.windTone = filter('bandpass', 420, 0.5);
    this.gust = gain(0.6);
    this.windMix = gain(LEVEL.wind);
    loop(noise('pink')).connect(filter('highpass', 110, 0.5)).connect(this.windTone).connect(this.gust).connect(this.windMix).connect(dry);
    this.leaves = gain(LEVEL.leaves * 0.4);
    loop(source('rustle')).connect(this.leaves).connect(this.windMix);

    // Night insects: started only when it gets dark.
    this.insects = gain(0);
    const soft = filter('lowpass', 7000, 0.5);
    this.insects.connect(soft).connect(dry);
    soft.connect(gain(0.25)).connect(e.bus.ambience.wet);
    const layer = (make: () => AudioBuffer, pan: number, level: number, rate = 1) => {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      const g = gain(level);
      g.connect(p).connect(this.insects);
      return new LoopLayer(ctx, make, g, this.rnd, rate);
    };
    this.insectLayers = [
      layer(() => source('cricket-a'), -0.55, 0.8),
      layer(() => source('cricket-b'), 0.6, 0.6),
      layer(() => source('trill'), 0.15, 0.22),
      layer(() => source('buzz'), -0.25, 0.5),
    ];

    // Day cicadas (started only while heard).
    this.cicadas = new Cicadas(ctx, dry, e.bus.ambience.wet, this.rnd);
  }

  /** Time of day, and `canopy` (0‥1): the leaves over the roaming explorer (the cicadas are louder in the forest). */
  mix(night: number, t: number, tc: number, canopy = 0): void {
    this.dayW = Math.cos((night * Math.PI) / 2);
    this.nightW = Math.sin((night * Math.PI) / 2);
    glide(this.windMix.gain, LEVEL.wind * (0.55 + 0.45 * this.dayW), t, tc);
    glide(this.insects.gain, LEVEL.insects * this.nightW ** 1.5, t, tc);
    this.canopy = Math.min(1, Math.max(0, canopy));
    this.cicadaLevel(t, tc * 3);
  }

  /** Rain now (0‥1, every frame from engine.weather): the birds and the cicadas keep quiet in it. */
  setRain(rain: number, t: number): void {
    this.rain = rain;
    if (Math.abs(rain - this.cicadaRain) < 0.02) return;
    this.cicadaRain = rain;
    this.cicadaLevel(t, 1.5);
  }

  /** Cicadas: soft over the map, loud under the trees; they fade with the light at dusk, and hush in heavy rain like the birds. */
  private cicadaLevel(t: number, tc: number): void {
    this.cicadas.heard = LEVEL.cicada * this.dayW ** 3 * (0.3 + 0.7 * this.canopy) * (1 - 0.9 * this.cicadaRain);
    glide(this.cicadas.level.gain, this.cicadas.heard, t, tc);
  }

  /** The ambience is muted (nothing is scheduled): the night insects and the cicadas stop once silent. */
  idle(now: number): void {
    for (const l of this.insectLayers) l.want(false, now);
    this.cicadas.idle(now);
  }

  schedule(now: number, until: number): void {
    const on = this.nightW > 0.003;
    for (const l of this.insectLayers) l.want(on, now);
    this.cicadas.schedule(now, until);
    const r = this.rnd;
    if (this.nextGust < now) this.nextGust = now;
    while (this.nextGust < until) this.nextGust = this.gustAt(this.nextGust);
    if (this.nextBird < now) this.nextBird = now + range(r, 0.8, 3);
    while (this.nextBird < until) this.nextBird = this.birdAt(this.nextBird);
    if (this.nextFrog < now) this.nextFrog = now + range(r, 1, 4);
    while (this.nextFrog < until) this.nextFrog = this.frogAt(this.nextFrog);
    if (this.nextOwl < now) this.nextOwl = now + range(r, 5, 15);
    while (this.nextOwl < until) this.nextOwl = this.owlAt(this.nextOwl);
  }

  // ── Wind ──────────────────────────────────────────────────────────────────

  private gustAt(t: number): number {
    const r = this.rnd;
    const g = r() < 0.2 ? range(r, 0.15, 0.3) : range(r, 0.4, 1);
    const tc = range(r, 1, 2.6);
    this.gust.gain.setTargetAtTime(g, t, tc);
    this.windTone.frequency.setTargetAtTime(260 + 520 * g, t, tc * 1.2);
    this.leaves.gain.setTargetAtTime(LEVEL.leaves * g ** 1.8, t + 0.4, tc);
    return t + range(r, 2.5, 7);
  }

  // ── Calls ─────────────────────────────────────────────────────────────────

  /** One calling creature: oscillator → envelope → filter (distance) → pan, with a reverb send. */
  private voice(dist: number, amp: number, type: OscillatorType = 'sine', filter?: [BiquadFilterType, number, number]) {
    const ctx = this.ctx;
    const r = this.rnd;
    const osc = ctx.createOscillator();
    osc.type = type;
    const env = ctx.createGain();
    env.gain.value = 0;
    const f = biquad(ctx, ...(filter ?? (['lowpass', 9500 - 6500 * dist, 0.4] as const)));
    const pan = ctx.createStereoPanner();
    pan.pan.value = range(r, -0.85, 0.85);
    const send = ctx.createGain();
    send.gain.value = 0.15 + 0.6 * dist;
    osc.connect(env).connect(f).connect(pan).connect(this.e.bus.ambience.dry);
    pan.connect(send).connect(this.e.bus.ambience.wet);
    cleanup(osc, [osc, env, f, pan, send]);
    return { osc, env: env.gain, freq: osc.frequency, level: amp * (1 - 0.7 * dist) };
  }

  private birdAt(t: number): number {
    const r = this.rnd;
    // Fewer birds as it gets dark; none at night.
    if (r() >= this.dayW ** 2 * (1 - 0.9 * this.rain)) return t + range(r, 3, 8);
    const kinds: BirdKind[] = ['whistle', 'chirps', 'trill', 'cuckoo', 'dove'];
    const w = [3, 3, 2, t - this.lastCuckoo > 25 ? 1.3 : 0, t - this.lastDove > 14 ? 1.2 : 0];
    const kind = kinds[weighted(r, w)];
    const end = this[kind](t);
    // Now and then another bird answers soon after.
    return r() < 0.25 ? end + range(r, 0.3, 1.2) : t + range(r, 3, 8);
  }

  private whistle(t: number): number {
    const r = this.rnd;
    const v = this.voice(range(r, 0.2, 0.9), LEVEL.bird);
    const base = range(r, 2200, 3600);
    let s = t;
    for (let i = 0, n = 2 + Math.floor(r() * 3); i < n; i++) {
      const dur = range(r, 0.08, 0.22);
      const f0 = base * range(r, 0.85, 1.2);
      v.freq.setValueAtTime(f0, s);
      v.freq.exponentialRampToValueAtTime(f0 * range(r, 0.75, 1.3), s + dur);
      note(v.env, s, dur, v.level * range(r, 0.6, 1), 0.015, 0.04);
      s += dur + range(r, 0.04, 0.16);
    }
    v.osc.start(t);
    v.osc.stop(s + 0.05);
    return s;
  }

  private chirps(t: number): number {
    const r = this.rnd;
    const v = this.voice(range(r, 0.3, 0.95), LEVEL.bird * 0.8);
    const f0 = range(r, 4200, 6000);
    let s = t;
    const n = 3 + Math.floor(r() * 5);
    for (let i = 0; i < n; i++) {
      const dur = range(r, 0.035, 0.06);
      const f = f0 * range(r, 0.95, 1.05);
      v.freq.setValueAtTime(f, s);
      v.freq.exponentialRampToValueAtTime(f * 0.55, s + dur);
      note(v.env, s, dur, v.level * (1 - (0.4 * i) / n), 0.004, 0.02);
      s += range(r, 0.07, 0.12);
    }
    v.osc.start(t);
    v.osc.stop(s + 0.05);
    return s;
  }

  private trill(t: number): number {
    const r = this.rnd;
    const v = this.voice(range(r, 0.4, 0.95), LEVEL.bird * 0.8);
    const dur = range(r, 0.5, 1.1);
    const base = range(r, 3000, 4500);
    const rate = range(r, 16, 26);
    const depth = range(r, 0.05, 0.12);
    const slide = range(r, -0.15, 0.1);
    const n = Math.ceil(dur * 300);
    const fc = new Float32Array(n);
    const gc = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1);
      const w = Math.sin(2 * Math.PI * rate * x * dur);
      fc[i] = base * (1 + slide * x) * (1 + depth * w);
      const env = Math.min(1, x / 0.08, (1 - x) / 0.15) * (0.7 + 0.3 * Math.sin(Math.PI * x));
      gc[i] = v.level * env * (0.5 + 0.5 * w) ** 2;
    }
    v.freq.setValueCurveAtTime(fc, t, dur);
    v.env.setValueCurveAtTime(gc, t, dur);
    v.osc.start(t);
    v.osc.stop(t + dur + 0.05);
    return t + dur;
  }

  /** A distant cuckoo: two notes a major third apart, two or three times. */
  private cuckoo(t: number): number {
    const r = this.rnd;
    this.lastCuckoo = t;
    const v = this.voice(range(r, 0.55, 0.9), LEVEL.bird * 2.2, 'sine', ['lowpass', 1800, 0.5]);
    const f1 = range(r, 640, 740);
    let s = t;
    for (let k = 0, n = 2 + Math.floor(r() * 2); k < n; k++) {
      v.freq.setValueAtTime(f1 * 1.02, s);
      v.freq.exponentialRampToValueAtTime(f1, s + 0.22);
      note(v.env, s, 0.24, v.level, 0.04, 0.09);
      s += 0.34;
      v.freq.setValueAtTime(f1 * 0.8 * 1.01, s);
      v.freq.exponentialRampToValueAtTime(f1 * 0.8 * 0.97, s + 0.3);
      note(v.env, s, 0.3, v.level * 0.9, 0.04, 0.12);
      s += 0.3 + range(r, 0.8, 1.1);
    }
    v.osc.start(t);
    v.osc.stop(s);
    return s;
  }

  /** A dove: a soft low "coo-COO-coo". */
  private dove(t: number): number {
    const r = this.rnd;
    this.lastDove = t;
    const v = this.voice(range(r, 0.35, 0.7), LEVEL.bird * 2.2, 'sine', ['lowpass', 1200, 0.5]);
    const f = range(r, 430, 520);
    const parts: [number, number, number][] = [
      [0.22, 1, 0.12],
      [0.42, 1.08, 0.2],
      [0.3, 0.98, 0],
    ];
    let s = t;
    for (const [dur, k, gap] of parts) {
      v.freq.setValueAtTime(f * k * 1.02, s);
      v.freq.exponentialRampToValueAtTime(f * k * 0.94, s + dur);
      note(v.env, s, dur, v.level * (k > 1 ? 1 : 0.75), 0.05, 0.12);
      s += dur + gap;
    }
    v.osc.start(t);
    v.osc.stop(s + 0.05);
    return s;
  }

  private frogAt(t: number): number {
    const r = this.rnd;
    if (r() >= this.nightW ** 1.5 * 0.9) return t + range(r, 2.5, 8);
    const kind = weighted(r, [3, 2, 1.2]);
    const dist = range(r, 0.3, 0.9);
    let s = t;
    if (kind === 0) {
      // Croaks: a buzzy low pulse through a nasal band.
      const v = this.voice(dist, LEVEL.frog, 'sawtooth', ['bandpass', range(r, 450, 800), 3]);
      const f0 = range(r, 95, 150);
      for (let i = 0, n = 2 + Math.floor(r() * 4); i < n; i++) {
        const dur = range(r, 0.08, 0.14);
        v.freq.setValueAtTime(f0 * (1 - 0.03 * i), s);
        v.freq.linearRampToValueAtTime(f0 * (0.9 - 0.03 * i), s + dur);
        note(v.env, s, dur, v.level, 0.01, 0.04);
        s += dur + range(r, 0.12, 0.25);
      }
      v.osc.start(t);
      v.osc.stop(s);
    } else if (kind === 1) {
      // A tree frog: quick wooden "tok" notes.
      const v = this.voice(dist, LEVEL.frog * 0.8);
      const f = range(r, 1300, 1900);
      for (let i = 0, n = 3 + Math.floor(r() * 6); i < n; i++) {
        v.freq.setValueAtTime(f * 1.06, s);
        v.freq.exponentialRampToValueAtTime(f, s + 0.03);
        note(v.env, s, 0.035, v.level * range(r, 0.7, 1), 0.003, 0.02);
        s += range(r, 0.11, 0.18);
      }
      v.osc.start(t);
      v.osc.stop(s);
    } else {
      // A bullfrog's soft low "wom".
      const v = this.voice(dist, LEVEL.frog * 1.6, 'triangle', ['lowpass', 900, 0.7]);
      const f = range(r, 220, 300);
      for (let i = 0, n = 1 + Math.floor(r() * 2); i < n; i++) {
        v.freq.setValueAtTime(f * 0.88, s);
        v.freq.linearRampToValueAtTime(f, s + 0.14);
        v.freq.linearRampToValueAtTime(f * 0.94, s + 0.35);
        note(v.env, s, 0.35, v.level, 0.06, 0.12);
        s += 0.35 + range(r, 0.4, 0.7);
      }
      v.osc.start(t);
      v.osc.stop(s);
    }
    return t + range(r, 2.5, 8);
  }

  /** An owl far off: "hoo … hoo-hoo". */
  private owlAt(t: number): number {
    const r = this.rnd;
    if (r() >= this.nightW ** 2) return t + range(r, 20, 45);
    const v = this.voice(range(r, 0.55, 0.9), LEVEL.owl, 'sine', ['lowpass', 1400, 0.5]);
    const f = range(r, 360, 420);
    const hoots: [number, number][] =
      r() < 0.5
        ? [
            [0.34, 0.5],
            [0.2, 0.09],
            [0.36, 0],
          ]
        : [
            [0.42, 0.6],
            [0.46, 0],
          ];
    let s = t;
    for (const [dur, gap] of hoots) {
      v.freq.setValueAtTime(f * 0.94, s);
      v.freq.linearRampToValueAtTime(f, s + dur * 0.4);
      v.freq.linearRampToValueAtTime(f * 0.92, s + dur);
      note(v.env, s, dur, v.level, 0.07, 0.15);
      s += dur + gap;
    }
    v.osc.start(t);
    v.osc.stop(s + 0.05);
    return t + range(r, 25, 55);
  }
}
