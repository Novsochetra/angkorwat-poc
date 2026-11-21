import { adopt, bringBack, sendAway, wanted } from './dsp';
import type { SynthAnswer, SynthRequest } from './synth.worker';

/**
 * The sound's buffers made off the page's thread (synth.worker.ts). The Web Audio graph already plays on the
 * browser's audio thread; what ran on the page was making the buffers it plays: noise and insect loops, the reverb's
 * impulse, the people's voices and New Year's shouts (on a Mac about 260 ms for the sources, 130 ms for the voices,
 * 5–16 ms a shout; a phone takes several times that). They were made in idle slices, but a busy page (a phone, the
 * fireworks) has little idle time, and a buffer wanted before its slices were done was made at once, in a frame (a
 * page opened just before midnight made its countdown's shouts that way, one a second).
 *
 * Now the worker makes them as soon as they are asked for (`makeOffThread`), and the page only wraps the samples in
 * an `AudioBuffer` (a copy: well under a millisecond a buffer). Until a buffer comes back, the idle warm-ups skip it;
 * if it is wanted sooner it is made here as before. A browser with no module workers, or a worker that fails, leaves
 * everything to the idle warm-ups (dsp.ts `bringBack`).
 */

let worker: Worker | null = null;
let failed = false;
/** Buffers made by the worker so far, and its own time for them (checks: `audio.debug().offThread`). */
export const offThreadStats = { made: 0, ms: 0, failed: false };

function start(): Worker | null {
  if (worker || failed) return worker;
  if (typeof Worker === 'undefined' || typeof AudioBuffer === 'undefined') {
    failed = true;
    return null;
  }
  try {
    worker = new Worker(new URL('./synth.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    failed = true;
    return null;
  }
  worker.onmessage = (e: MessageEvent<SynthAnswer>) => {
    const a = e.data;
    if ('done' in a) return;
    if ('error' in a) {
      console.warn(`[map] sound buffer ${a.key} failed off the page's thread (made here instead): ${a.error}`);
      bringBack([a.key]);
      return;
    }
    try {
      const b = new AudioBuffer({ numberOfChannels: a.channels.length, length: a.channels[0].length, sampleRate: a.rate });
      a.channels.forEach((c, i) => b.copyToChannel(c, i));
      adopt(a.key, b);
      offThreadStats.made++;
      offThreadStats.ms += a.ms;
    } catch (err) {
      console.warn(`[map] sound buffer ${a.key} could not be taken in:`, err);
      bringBack([a.key]);
    }
  };
  const fail = (why: unknown) => {
    console.warn('[map] sound worker failed: buffers are made in idle time instead', why);
    failed = offThreadStats.failed = true;
    worker?.terminate();
    worker = null;
    bringBack();
  };
  worker.onerror = (e) => {
    e.preventDefault();
    fail(e.message);
  };
  worker.onmessageerror = fail;
  return worker;
}

/** Make these buffers on the worker (those not made or on their way yet). False: no worker, the idle warm-ups do it. */
export function makeOffThread(keys: Iterable<string>): boolean {
  const w = start();
  if (!w) return false;
  const list = wanted(keys);
  if (!list.length) return true;
  sendAway(list);
  w.postMessage({ keys: list } satisfies SynthRequest);
  return true;
}
