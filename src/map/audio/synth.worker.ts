/**
 * The synth worker (offThread.ts): makes the sound's source buffers (noise, insects, water, the reverb's impulse, the
 * people's voices, New Year's shouts: dsp.ts and speech.ts jobs) on a thread of its own, so the page's frames never
 * wait for them. A worker has no `AudioBuffer`: the jobs write into this stand-in, and its samples go back to the
 * page (moved, not copied), which puts them in real buffers.
 */

class WorkerAudioBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  readonly channels: Float32Array<ArrayBuffer>[];
  constructor(o: { numberOfChannels?: number; length: number; sampleRate: number }) {
    this.numberOfChannels = o.numberOfChannels ?? 1;
    this.length = o.length;
    this.sampleRate = o.sampleRate;
    this.channels = Array.from({ length: this.numberOfChannels }, () => new Float32Array(o.length));
  }
  get duration(): number {
    return this.length / this.sampleRate;
  }
  getChannelData(c: number): Float32Array {
    return this.channels[c];
  }
  copyToChannel(src: Float32Array, c: number, start = 0): void {
    this.channels[c].set(start ? src.subarray(0, Math.max(0, this.length - start)) : src.subarray(0, this.length), start);
  }
  copyFromChannel(dst: Float32Array, c: number, start = 0): void {
    dst.set(this.channels[c].subarray(start, start + dst.length));
  }
}
(globalThis as unknown as { AudioBuffer: unknown }).AudioBuffer = WorkerAudioBuffer;

/** A request: the buffers to make, in order. The answer: one message a buffer (or its error), then `done`. */
export interface SynthRequest {
  keys: string[];
}
export type SynthAnswer =
  | { key: string; rate: number; channels: Float32Array<ArrayBuffer>[]; ms: number }
  | { key: string; error: string }
  | { done: true };

// (the job tables register themselves as their modules load: after the stand-in above)
const ready = Promise.all([import('./dsp'), import('./speech')]);

/** The worker's own `postMessage` (with what it moves). */
const post = (m: SynthAnswer, move: Transferable[] = []): void => (self as unknown as { postMessage(m: unknown, move: Transferable[]): void }).postMessage(m, move);

const queue: string[] = [];
let running = false;

async function run(): Promise<void> {
  if (running) return;
  running = true;
  const [dsp] = await ready;
  while (queue.length) {
    const key = queue.shift()!;
    const make = dsp.makerOf(key);
    if (!make) {
      post({ key, error: 'no such buffer' });
      continue;
    }
    try {
      const t0 = performance.now();
      const job = make();
      let r = job.next();
      while (!r.done) r = job.next();
      const b = r.value as unknown as WorkerAudioBuffer;
      post({ key, rate: b.sampleRate, channels: b.channels, ms: performance.now() - t0 }, b.channels.map((c) => c.buffer));
    } catch (e) {
      post({ key, error: String(e) });
    }
  }
  running = false;
  post({ done: true });
}

onmessage = (e: MessageEvent<SynthRequest>) => {
  for (const k of e.data.keys) if (!queue.includes(k)) queue.push(k);
  void run();
};
