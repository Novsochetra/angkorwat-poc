/**
 * Sacred pieces still being sculpted off the main thread (sculptWorker.ts).
 * Shots wait for them (`sacredReady`) so a picture never misses a statue.
 */

const pending = new Set<Promise<unknown>>();

/** Keeps `p` in the list until it settles; returns it. */
export function trackSacred<T>(p: Promise<T>): Promise<T> {
  pending.add(p);
  const done = () => pending.delete(p);
  p.then(done, done);
  return p;
}

/** Resolves when every piece asked for so far is sculpted (or after `timeout` ms): how long it waited (ms) and how many were still being sculpted. */
export async function sacredReady(timeout = 30000): Promise<{ ms: number; left: number }> {
  const t0 = performance.now();
  const end = t0 + timeout;
  while (pending.size && performance.now() < end) {
    await Promise.race([Promise.allSettled([...pending]), new Promise((r) => setTimeout(r, Math.max(0, end - performance.now())))]);
  }
  return { ms: performance.now() - t0, left: pending.size };
}
