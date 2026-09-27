import { biquad, noise, type NoiseKind, type Rng } from './dsp';

/**
 * One placed sound's nodes (the people's sounds: people.ts and the files it
 * calls): made, started together by `play()`, and every node let go once
 * its last source has ended. The sound sums into `out`; the caller places
 * it (level, air, pan, reverb send).
 */
export class Voice {
  readonly out: GainNode;
  /** When the last source stops (audio clock, s). */
  end = 0;
  private readonly nodes: AudioNode[] = [];
  /** Sources with their start, stop and buffer offset (−1: an oscillator). */
  private readonly srcs: [AudioScheduledSourceNode, number, number, number][] = [];

  constructor(
    readonly ctx: BaseAudioContext,
    readonly r: Rng,
  ) {
    this.out = this.gain(1);
  }

  keep<T extends AudioNode>(n: T): T {
    this.nodes.push(n);
    return n;
  }

  gain(v = 0): GainNode {
    const g = this.keep(this.ctx.createGain());
    g.gain.value = v;
    return g;
  }

  /** A biquad (k-rate: `dsp.biquad`); `db` for the peaking and shelf kinds. */
  filter(type: BiquadFilterType, f: number, q = 0.7, db = 0): BiquadFilterNode {
    const b = this.keep(biquad(this.ctx, type, f, q));
    if (db) b.gain.value = db;
    return b;
  }

  osc(wave: OscillatorType | PeriodicWave, from: number, to: number, f: number): OscillatorNode {
    const o = this.keep(this.ctx.createOscillator());
    if (wave instanceof PeriodicWave) o.setPeriodicWave(wave);
    else o.type = wave;
    o.frequency.value = f;
    this.srcs.push([o, from, to, -1]);
    return o;
  }

  /** Looping noise from `from` to `to`, started at a random point of the loop. */
  noise(kind: NoiseKind, from: number, to: number): AudioBufferSourceNode {
    return this.buffer(noise(kind), from, to, this.r() * noise(kind).duration, true);
  }

  /** A buffer played from `from` to `to` (s), starting `offset` s into it (looping if `loop`). */
  buffer(buf: AudioBuffer, from: number, to: number, offset = 0, loop = false, rate = 1): AudioBufferSourceNode {
    const s = this.keep(this.ctx.createBufferSource());
    s.buffer = buf;
    s.loop = loop;
    s.playbackRate.value = rate;
    this.srcs.push([s, from, to, Math.max(0, offset)]);
    return s;
  }

  /** A wobble of ±`depth` on `p` at `rate` Hz, from `from` to `to`. */
  lfo(p: AudioParam, rate: number, depth: number, from: number, to: number, wave: OscillatorType = 'sine'): OscillatorNode {
    const o = this.osc(wave, from, to, rate);
    o.connect(this.gain(depth)).connect(p);
    return o;
  }

  /** Start every source; free every node once they have all ended. */
  play(): void {
    let left = this.srcs.length;
    if (!left) return this.drop();
    const done = () => {
      if (--left === 0) for (const n of this.nodes) n.disconnect();
    };
    for (const [s, from, to, offset] of this.srcs) {
      const stop = Math.max(to, from + 0.01);
      this.end = Math.max(this.end, stop);
      s.onended = done;
      if (offset >= 0) (s as AudioBufferSourceNode).start(from, offset);
      else s.start(from);
      s.stop(stop);
    }
  }

  /** Stop every source at `t` (a lasting sound let go: its nodes are freed when they have ended). */
  stop(t: number): void {
    for (const [s] of this.srcs) s.stop(t);
    this.end = t;
  }

  /** Let go of a sound that failed to be made. */
  drop(): void {
    for (const n of this.nodes) n.disconnect();
  }
}

/** Move `p` through `pts` ([s after `t`, value]) in straight lines. */
export function line(p: AudioParam, t: number, pts: readonly (readonly [number, number])[]): void {
  p.setValueAtTime(pts[0][1], t + pts[0][0]);
  for (let i = 1; i < pts.length; i++) p.linearRampToValueAtTime(pts[i][1], t + pts[i][0]);
}
