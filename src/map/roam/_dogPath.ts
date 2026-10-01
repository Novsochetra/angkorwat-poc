import type { RoamWorld } from './types';

/**
 * Where the dog (roam/_dog.ts) may go, and how it finds its way to him: on
 * the walk map (world.standAt) as the explorer does, a dog's size.
 *
 * - **A step** (`stepTo`): onto ground no more than `STEP_UP` higher or
 *   lower (stairs, slopes, a temple's steps), up a step a little higher (a
 *   hop, up to `HOP_BUILT`: a terrace's edge he steps up) or a land step of
 *   the hills (the land's own 2 m blocks), only where it goes on past the
 *   edge (never onto a wall, a jar or a railing), down one (a jump, up to
 *   `HOP_DOWN`). Never into a wall, under a roof lower than it, out of the
 *   roaming area, or into water deeper than it wades (`WADE`): it waits at
 *   the bank rather than swim.
 * - **A straight way** (`lineWalk`): every half column along it a step.
 * - **His trail** (`Trail`): where his feet went while he walked, a crumb
 *   every 0.6 m (a gap where he jumped, fell or rode). Following it, the dog
 *   goes where he went (round walls, over the bridges, up the stairs), and
 *   cuts corners where a straight way is free.
 * - **A search** (`PathSearch`): A* over the walk map's half-metre columns
 *   (a column's floor at its height: under a bridge and on it are two
 *   places), in slices of a few hundred columns a step (no frame waits on
 *   it), when the trail does not take it to him (he came back by boat, flew,
 *   rode off, or it is called). Typed arrays made once: nothing allocated
 *   while it searches or walks.
 */

/** Room it needs over the ground (m, drawn: its ears 0.9 m up at 1.2 × a real dog), steps it walks up or down (m). */
export const DOG_ROOM = 0.8;
export const STEP_UP = 0.7;
/** A land step it hops up (m: the land's 2 m blocks), a built one (a terrace's step: he walks up 1.1 m), the deepest it jumps down. */
export const HOP_UP = 2.3;
export const HOP_BUILT = 1.2;
export const HOP_DOWN = 2.7;
/** Water deeper than this over the ground (m) it does not go into. */
export const WADE = 0.32;
/** A hop is up onto the land itself (the height field, give or take this, m): not onto anything built. */
const LAND = 0.35;

export type StepKind = 'walk' | 'hop' | 'drop';

/** What the last `stepTo` that found ground was. */
export let stepKind: StepKind = 'walk';

/** The ground its feet stand on at (x, z) from height `y`, stepping up at most `up`; NaN: a wall, too low a roof, deep water, out of the area. */
export function ground(w: RoamWorld, x: number, z: number, y: number, up: number): number {
  if (!w.inBounds(x, z)) return NaN;
  const g = w.standAt ? w.standAt(x, z, y, up, DOG_ROOM) : w.groundAt(x, z) <= y + up ? w.groundAt(x, z) : NaN;
  if (Number.isNaN(g)) return NaN;
  const water = w.waterAt(x, z);
  if (water !== null && water - g > WADE) return NaN;
  return g;
}

/**
 * Where its feet land stepping from height `y0` onto (x, z) (`stepKind` says how: a walk, a hop up a land step, a
 * jump down), or NaN when it may not go there. (dx, dz): the way it goes (a hop needs the land to go on past).
 */
export function stepTo(w: RoamWorld, y0: number, x: number, z: number, dx: number, dz: number): number {
  const g = ground(w, x, z, y0, STEP_UP);
  if (!Number.isNaN(g)) {
    const dy = g - y0;
    if (dy >= -STEP_UP) {
      stepKind = 'walk';
      return g;
    }
    if (dy >= -HOP_DOWN) {
      stepKind = 'drop';
      return g;
    }
    return NaN;
  }
  // A step up: a hop — a low one (a terrace's step, a kerb: `HOP_BUILT`) onto anything, a land step of the hills onto
  // the land only — and only where it carries on past the edge (not onto a wall's top, a jar or a railing).
  const h = ground(w, x, z, y0, HOP_UP);
  if (Number.isNaN(h) || h - y0 <= STEP_UP || (h - y0 > HOP_BUILT && Math.abs(h - w.field.heightAt(x, z)) > LAND)) return NaN;
  const l = Math.hypot(dx, dz) || 1;
  const fx = x + (dx / l) * 0.5;
  const fz = z + (dz / l) * 0.5;
  const on = ground(w, fx, fz, h, STEP_UP);
  if (Number.isNaN(on) || Math.abs(on - h) > STEP_UP) return NaN;
  stepKind = 'hop';
  return h;
}

/**
 * A straight way from (ax, ay, az) to (bx, bz) that it walks without a hop or a jump (a step every 0.25 m): the height
 * it ends at, or NaN.
 */
export function lineWalk(w: RoamWorld, ax: number, ay: number, az: number, bx: number, bz: number, hops = false): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  const n = Math.max(1, Math.ceil(len / 0.25));
  let y = ay;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const g = stepTo(w, y, ax + dx * t, az + dz * t, dx, dz);
    if (Number.isNaN(g) || (!hops && stepKind !== 'walk')) return NaN;
    y = g;
  }
  return y;
}

// ── His trail ──────────────────────────────────────────────────────────────

/** Crumbs kept (a ring), how far apart (m), and a move between two that is not a walk (m: a jump, a fall, a ride). */
const TRAIL = 512;
const CRUMB = 0.6;
const GAP = 2.4;

/** Where his feet went while he walked: a ring of crumbs, numbered from the first (`n` counts them all). */
export class Trail {
  private readonly p = new Float32Array(TRAIL * 3);
  /** A gap before this crumb (he did not walk to it from the one before). */
  private readonly cut = new Uint8Array(TRAIL);
  /** Crumbs dropped so far (the newest is `n − 1`). */
  n = 0;

  clear(): void {
    this.n = 0;
  }

  /** The oldest crumb still kept. */
  get first(): number {
    return Math.max(0, this.n - TRAIL);
  }

  /** His feet now (on foot, free): a crumb if he has gone `CRUMB` from the last (a gap after a jump or a ride). */
  add(x: number, y: number, z: number, walked: boolean): void {
    if (this.n > 0) {
      const o = ((this.n - 1) % TRAIL) * 3;
      const d = Math.hypot(x - this.p[o], z - this.p[o + 2]);
      if (d < CRUMB && Math.abs(y - this.p[o + 1]) < STEP_UP) return;
      walked &&= d < GAP && Math.abs(y - this.p[o + 1]) < HOP_DOWN;
    }
    const i = this.n % TRAIL;
    this.p[i * 3] = x;
    this.p[i * 3 + 1] = y;
    this.p[i * 3 + 2] = z;
    this.cut[i] = this.n === 0 || !walked ? 1 : 0;
    this.n++;
  }

  x(i: number): number {
    return this.p[(i % TRAIL) * 3];
  }
  y(i: number): number {
    return this.p[(i % TRAIL) * 3 + 1];
  }
  z(i: number): number {
    return this.p[(i % TRAIL) * 3 + 2];
  }
  /** He did not walk to crumb `i` from the one before. */
  gap(i: number): boolean {
    return this.cut[i % TRAIL] === 1;
  }
  /** Is `i` still kept? */
  has(i: number): boolean {
    return i >= this.first && i < this.n;
  }
}

// ── The search ─────────────────────────────────────────────────────────────

/** Column size (m: the walk map's), the most columns a search looks at, and in one slice. */
const CELL = 0.5;
const NODES = 1 << 16;
const SLOT_BITS = 17;
const SLOTS = 1 << SLOT_BITS;
const SLICE = 260;
/** Arrived: this near the goal (m), and on about its level (m). */
const NEAR = 1.4;
const LEVEL = 1.2;
/** Extra cost of a hop up or a jump down (m of walking), and how greedy the search is (1 = shortest). */
const HOP_COST = 1.2;
const DROP_COST = 0.6;
const GREED = 1.25;
const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** A path found: its points (feet, m), `count` of them, from the dog to him. */
export interface FoundPath {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  count: number;
}

export type SearchState = 'idle' | 'busy' | 'found' | 'none';

/**
 * A* over the walk map's columns, run a slice at a time (`step`), from where
 * the dog is to within `NEAR` of the goal. Each column is a node at its floor's
 * height (keyed by column and height: the bridge's deck and the river bank
 * under it are two). Gives up past `NODES` columns or `limit` m of way.
 */
export class PathSearch {
  state: SearchState = 'idle';
  /** Columns looked at in the last search (checks). */
  looked = 0;
  readonly path: FoundPath = { x: new Float32Array(1024), y: new Float32Array(1024), z: new Float32Array(1024), count: 0 };
  private readonly nx = new Float32Array(NODES);
  private readonly ny = new Float32Array(NODES);
  private readonly nz = new Float32Array(NODES);
  private readonly g = new Float32Array(NODES);
  private readonly f = new Float32Array(NODES);
  private readonly parent = new Int32Array(NODES);
  private readonly closed = new Uint8Array(NODES);
  private readonly heap = new Int32Array(NODES);
  private heapN = 0;
  private count = 0;
  private readonly keys = new Float64Array(SLOTS);
  private readonly vals = new Int32Array(SLOTS);
  private ox = 0;
  private oz = 0;
  private tx = 0;
  private ty = 0;
  private tz = 0;
  private limit = 0;
  private w: RoamWorld | null = null;

  /** Start looking for a way from (x, y, z) to (tx, ty, tz), at most `limit` m long. */
  start(w: RoamWorld, x: number, y: number, z: number, tx: number, ty: number, tz: number, limit: number): void {
    this.w = w;
    this.keys.fill(-1);
    this.heapN = 0;
    this.count = 0;
    this.looked = 0;
    this.path.count = 0;
    // (on the column grid: the dog's column's middle)
    this.ox = Math.floor(x / CELL) * CELL + CELL / 2;
    this.oz = Math.floor(z / CELL) * CELL + CELL / 2;
    this.tx = tx;
    this.ty = ty;
    this.tz = tz;
    this.limit = limit;
    this.state = 'busy';
    const gy = ground(w, this.ox, this.oz, y, STEP_UP);
    const n = this.node(0, 0, Number.isNaN(gy) ? y : gy);
    if (n < 0) {
      this.state = 'none';
      return;
    }
    this.g[n] = 0;
    this.f[n] = this.h(n);
    this.parent[n] = -1;
    this.push(n);
  }

  cancel(): void {
    this.state = 'idle';
    this.w = null;
  }

  /** Look further (a slice); the state says when it is done. */
  step(budget = SLICE): SearchState {
    if (this.state !== 'busy' || !this.w) return this.state;
    const w = this.w;
    for (let k = 0; k < budget; k++) {
      if (this.heapN === 0) return this.end(-1);
      const c = this.pop();
      if (this.closed[c]) continue;
      this.closed[c] = 1;
      this.looked++;
      const cx = this.nx[c];
      const cy = this.ny[c];
      const cz = this.nz[c];
      if (Math.hypot(cx - this.tx, cz - this.tz) < NEAR && Math.abs(cy - this.ty) < LEVEL) return this.end(c);
      if (this.g[c] > this.limit) continue;
      const ix = Math.round((cx - this.ox) / CELL);
      const iz = Math.round((cz - this.oz) / CELL);
      for (let d = 0; d < 8; d++) {
        const [ddx, ddz] = DIRS[d];
        const x = cx + ddx * CELL;
        const z = cz + ddz * CELL;
        const y = stepTo(w, cy, x, z, ddx, ddz);
        if (Number.isNaN(y)) continue;
        const kind = stepKind;
        // (a corner: both sides must be free too, so it never cuts through a wall's end)
        if (ddx !== 0 && ddz !== 0) {
          const a = stepTo(w, cy, cx + ddx * CELL, cz, ddx, 0);
          const b = stepTo(w, cy, cx, cz + ddz * CELL, 0, ddz);
          if (Number.isNaN(a) || Number.isNaN(b) || Math.abs(a - cy) > STEP_UP || Math.abs(b - cy) > STEP_UP) continue;
        }
        const n = this.node(ix + ddx, iz + ddz, y);
        if (n < 0) return this.end(-1);
        if (this.closed[n]) continue;
        const cost = this.g[c] + (ddx && ddz ? CELL * Math.SQRT2 : CELL) + (kind === 'hop' ? HOP_COST : kind === 'drop' ? DROP_COST : 0);
        if (cost >= this.g[n]) continue;
        this.g[n] = cost;
        this.parent[n] = c;
        this.f[n] = cost + this.h(n);
        this.push(n);
      }
    }
    return this.state;
  }

  private h(n: number): number {
    const dx = Math.abs(this.nx[n] - this.tx);
    const dz = Math.abs(this.nz[n] - this.tz);
    return GREED * (Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz));
  }

  /** The node of column (ix, iz) at floor height y (made on first look), or −1 when there is no room for more. */
  private node(ix: number, iz: number, y: number): number {
    if (ix < -2000 || ix > 2000 || iz < -2000 || iz > 2000) return -1;
    const key = ix + 2048 + (iz + 2048) * 4096 + (Math.floor(y) + 100) * 16777216;
    let s = (((ix * 73856093) ^ (iz * 19349663) ^ (Math.floor(y) * 83492791)) >>> 0) & (SLOTS - 1);
    for (;;) {
      const k = this.keys[s];
      if (k === key) return this.vals[s];
      if (k === -1) break;
      s = (s + 1) & (SLOTS - 1);
    }
    if (this.count >= NODES) return -1;
    const n = this.count++;
    this.keys[s] = key;
    this.vals[s] = n;
    this.nx[n] = this.ox + ix * CELL;
    this.nz[n] = this.oz + iz * CELL;
    this.ny[n] = y;
    this.g[n] = Infinity;
    this.closed[n] = 0;
    return n;
  }

  private end(n: number): SearchState {
    this.w = null;
    if (n < 0) {
      this.state = 'none';
      return this.state;
    }
    // Back from the goal, then turned round (the dog's end first).
    const p = this.path;
    let k = 0;
    for (let c = n; c >= 0 && k < p.x.length; c = this.parent[c]) {
      p.x[k] = this.nx[c];
      p.y[k] = this.ny[c];
      p.z[k] = this.nz[c];
      k++;
    }
    for (let i = 0, j = k - 1; i < j; i++, j--) {
      const ax = p.x[i];
      const ay = p.y[i];
      const az = p.z[i];
      p.x[i] = p.x[j];
      p.y[i] = p.y[j];
      p.z[i] = p.z[j];
      p.x[j] = ax;
      p.y[j] = ay;
      p.z[j] = az;
    }
    p.count = k;
    this.state = 'found';
    return this.state;
  }

  // (a binary heap of node ids by f)
  private push(n: number): void {
    if (this.heapN >= NODES) return;
    const hp = this.heap;
    const f = this.f;
    let i = this.heapN++;
    hp[i] = n;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (f[hp[up]] <= f[n]) break;
      hp[i] = hp[up];
      i = up;
    }
    hp[i] = n;
  }

  private pop(): number {
    const hp = this.heap;
    const f = this.f;
    const top = hp[0];
    const last = hp[--this.heapN];
    let i = 0;
    const len = this.heapN;
    for (;;) {
      const l = i * 2 + 1;
      if (l >= len) break;
      const r = l + 1;
      const c = r < len && f[hp[r]] < f[hp[l]] ? r : l;
      if (f[hp[c]] >= f[last]) break;
      hp[i] = hp[c];
      i = c;
    }
    if (len > 0) hp[i] = last;
    return top;
  }
}
