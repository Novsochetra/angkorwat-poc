/**
 * The live server's clock (src/net/client.ts): NTP-like. Each `ping` carries the page's `performance.now()`, the
 * `pong` the server's time; the offset (server − device, ms) of the round trip with the lowest delay is the truest
 * (the reply's time sits in the middle of the shortest trip). The last `KEEP` samples are kept and the best one wins,
 * so a slow 4G moment does not move the show; nye/clock.ts `setServerOffset` gets it.
 */

const KEEP = 8;

export class ServerClock {
  private rtt = new Float64Array(KEEP).fill(Infinity);
  private off = new Float64Array(KEEP);
  private next = 0;
  /** Server − device (ms), from the best sample (or the welcome's rough one); NaN before any. */
  offset = NaN;
  /** The best sample's round trip (ms). */
  best = Infinity;

  /** The welcome's time: a rough offset (half an unknown trip off) until pings come back. */
  rough(serverNow: number): void {
    if (this.best === Infinity) this.offset = serverNow - Date.now();
  }

  /** A pong: `sentAt` the page's `performance.now()` it echoed, `serverNow` the server's ms. */
  sample(sentAt: number, serverNow: number): void {
    const back = performance.now();
    const rtt = back - sentAt;
    if (!(rtt >= 0) || rtt > 30_000) return;
    // (the device's ms-since-1970 at the trip's middle: now, less half the trip)
    const mid = Date.now() - rtt / 2;
    this.rtt[this.next] = rtt;
    this.off[this.next] = serverNow - mid;
    this.next = (this.next + 1) % KEEP;
    let b = 0;
    for (let i = 1; i < KEEP; i++) if (this.rtt[i] < this.rtt[b]) b = i;
    this.best = this.rtt[b];
    this.offset = this.off[b];
  }

  reset(): void {
    this.rtt.fill(Infinity);
    this.next = 0;
    this.offset = NaN;
    this.best = Infinity;
  }
}
