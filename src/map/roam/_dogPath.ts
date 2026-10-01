import { len2 } from '../fauna/_len';
import { PAGODA } from '../village/_spots';
import type { RoamWorld } from './types';

/**
 * Where the dog (roam/_dog.ts) may go, and how it finds its way to him: on
 * the walk map (world.standAt) as the explorer does, a dog's size.
 *
 * - **A step** (`stepTo`): onto ground no more than `STEP_UP` higher or
 *   lower (stairs, slopes, a temple's steps), up a step a little higher (a
 *   hop, up to `HOP_BUILT`: a terrace's edge he steps up) or a land step of
 *   the hills (the land's own 2 m blocks), only where it goes on past the
 *   edge (never onto a jar, a railing, a stall's table or a bench), over a
 *   low wall (`overWall`: a kerb along the moat), down one (a jump, up to
 *   `HOP_DOWN`). Never into a wall, under a roof lower than it, out of the
 *   roaming area, or into water deeper than it wades (`WADE`): it waits at
 *   the bank rather than swim.
 * - **Halls** (`HALLS`): out of respect it never steps into a temple's or a
 *   pagoda's hall (the village pagoda's vihara on its plinth, Angkor Wat's
 *   upper levels); one it is in already it may walk out of. It waits at the
 *   door (roam/_dog.ts).
 * - **Columns**: a step's checks look from the middle of the column it steps
 *   into (`goesOn`, a hop's landing), so a step the search took between two
 *   columns is the one the dog takes walking it, from wherever in the column
 *   it stands.
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
/** A step up more than this (m) must be onto a floor that goes on (`goesOn`), and it may not drop back more than `BACK` (m). */
export const KERB = 0.3;
const BACK = 0.25;
/** A hop is up onto the land itself (the height field, give or take this, m): not onto anything built. */
const LAND = 0.35;

export type StepKind = 'walk' | 'hop' | 'drop';

/** A hall a dog does not go into: a box (m) over floors from `y0` up, and where it waits for him (`door`: on the ground outside, facing in). */
export interface Hall {
  id: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y0: number;
  door: { x: number; z: number; yaw: number } | null;
}

export const HALLS: readonly Hall[] = [
  // The village pagoda's vihara (village/_pagoda.ts): its plinth (top 10) — the porch, the hall, the colonnade round
  // it — from the porch's front step to the back. It waits on the terrace before the porch, east of the way in,
  // between two front seima: clear of the way the processions walk round (festival/_circuit.ts `WAY`).
  {
    id: 'village-pagoda',
    x0: PAGODA.x - 6.2,
    x1: PAGODA.x + 6.2,
    z0: 94.6,
    z1: 114.6,
    y0: PAGODA.floor - 0.4,
    door: { x: PAGODA.x + 5.05, z: 92.75, yaw: 0 },
  },
  // Angkor Wat's upper levels (landmarks/sanctuary.ts): the middle terrace (−35‥35, −236‥−181, top 64) with its gallery,
  // and the Bakan and the central sanctuary on it. It waits where he went up.
  { id: 'angkor-wat-upper', x0: -35.5, x1: 35.5, z0: -236.5, z1: -180.5, y0: 59, door: null },
];

/** The hall whose floor (x, y, z) is in, or null. */
export function hallAt(x: number, y: number, z: number): Hall | null {
  for (const h of HALLS) if (x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1 && y >= h.y0) return h;
  return null;
}

/** A floor on the land itself (give or take a kerb over the height field), not on anything built up. */
export function onLand(w: RoamWorld, x: number, y: number, z: number): boolean {
  return y - w.field.heightAt(x, z) <= LAND_FLOOR;
}
const LAND_FLOOR = 0.6;

/** The middle of the half-metre column that x is in (the walk map's columns). */
const mid = (x: number) => Math.floor(x / 0.5) * 0.5 + 0.25;

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
  const g = stepOnto(w, y0, x, z, dx, dz);
  if (Number.isNaN(g)) return g;
  // (into a hall: no — but out of one it is in, or along inside it, yes)
  const h = hallAt(x, g, z);
  if (h === null) return g;
  const l = len2(dx, dz) || 1;
  return hallAt(x - (dx / l) * 0.4, y0, z - (dz / l) * 0.4) === h ? g : NaN;
}

function stepOnto(w: RoamWorld, y0: number, x: number, z: number, dx: number, dz: number): number {
  const g = ground(w, x, z, y0, STEP_UP);
  if (!Number.isNaN(g)) {
    const dy = g - y0;
    if (dy >= -STEP_UP) {
      // (up more than a kerb: only onto a floor that goes on — a stair, a terrace —, not a stall's table or a bench)
      if (dy > KERB && !goesOn(w, x, z, g, dx, dz)) return NaN;
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
  const l = len2(dx, dz) || 1;
  const fx = mid(x) + (dx / l) * 0.5;
  const fz = mid(z) + (dz / l) * 0.5;
  const on = ground(w, fx, fz, h, STEP_UP);
  if (Number.isNaN(on) || Math.abs(on - h) > STEP_UP) return NaN;
  if (h - y0 <= HOP_BUILT && !goesOn(w, x, z, h, dx, dz) && !overWall(w, x, z, y0, h, dx, dz)) return NaN;
  stepKind = 'hop';
  return h;
}

/**
 * A low wall it hops over (a moat's kerb, a garden wall): its top (`h`) at least `WALL` over the floor it comes from
 * (`y0`; a stall's table or a bench is lower: never onto those), at most a metre thick, the floor past it back at its
 * level (not a railing over a drop, not water). From the column's middle, as `goesOn`.
 */
function overWall(w: RoamWorld, x: number, z: number, y0: number, h: number, dx: number, dz: number): boolean {
  if (h - y0 < WALL) return false;
  const l = len2(dx, dz);
  if (l < 1e-6) return false;
  const ux = dx / l;
  const uz = dz / l;
  x = mid(x);
  z = mid(z);
  for (let k = 0.5; k <= 1; k += 0.5) {
    const g = ground(w, x + ux * k, z + uz * k, h, STEP_UP);
    if (Number.isNaN(g)) return false;
    if (Math.abs(g - y0) <= KERB) return true;
    if (Math.abs(g - h) > KERB) return false;
  }
  return false;
}
/** The lowest wall it hops over (m over its floor). */
const WALL = 0.85;

/**
 * Does the floor it steps up onto at (x, z), height `g`, go on the way it goes ((dx, dz))? Half a metre on it is there
 * (or higher: the next tread of a stair), a metre on it has not dropped back (or a wall stands there, if the half
 * metre was a stair's next tread), and it is a stair (rising on) or a wide floor (on ahead and to a side). A stall's
 * table, a bench drop back within the metre, or to both sides along their length: it keeps to the floors people walk.
 * Looked at from the column's middle: the same for the search and the dog walking.
 */
function goesOn(w: RoamWorld, x: number, z: number, g: number, dx: number, dz: number): boolean {
  const l = len2(dx, dz);
  if (l < 1e-6) return true;
  const ux = dx / l;
  const uz = dz / l;
  x = mid(x);
  z = mid(z);
  const g1 = ground(w, x + ux * 0.5, z + uz * 0.5, g, STEP_UP);
  if (Number.isNaN(g1) || g1 < g - BACK) return false;
  const g2 = ground(w, x + ux, z + uz, g1, STEP_UP);
  if (Number.isNaN(g2)) return g1 > g + BACK;
  if (g2 < g - BACK) return false;
  // (a stair: it rises on ahead; else a floor as wide as a terrace or a veranda — on ahead and to one side at least —,
  // not a stall's table or a bench along its length)
  if (g1 > g + RISE || g2 > g + RISE) return true;
  let wide = 0;
  for (let k = 0; k < 3; k++) {
    const sx = k === 0 ? ux : k === 1 ? -uz : uz;
    const sz = k === 0 ? uz : k === 1 ? ux : -ux;
    const h = ground(w, x + sx * WIDE, z + sz * WIDE, g, STEP_UP);
    if (!Number.isNaN(h) && h >= g - KERB) wide++;
  }
  return wide >= 2 && !island(w, x, z, g);
}

/**
 * A raised floor just over the land, all of it smaller than `ISLAND` columns, with no stair up from it: a thing
 * standing on the ground (a stall's platform with the goods on it, a table, a bed), not a floor it walks onto.
 * Remembered by column and height (the walk map does not change).
 */
function island(w: RoamWorld, x: number, z: number, g: number): boolean {
  if (g - w.field.heightAt(x, z) > NEAR_LAND) return false;
  const ix = Math.floor(x / 0.5);
  const iz = Math.floor(z / 0.5);
  const key = (ix + 4096) * 8192 + (iz + 4096) + Math.round(g * 4) * 67108864;
  const known = ISLANDS.get(key);
  if (known !== undefined) return known;
  if (ISLANDS.size > 4096) ISLANDS.clear();
  // (a fill over the floor's columns, within a kerb of its height; a stair up out of it, or more than `ISLAND`: a floor)
  let n = 1;
  let head = 0;
  QX[0] = ix;
  QZ[0] = iz;
  let out = true;
  while (head < n && out) {
    const cx = QX[head];
    const cz = QZ[head];
    head++;
    for (let d = 0; d < 4 && out; d++) {
      const nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0);
      const nz = cz + (d === 2 ? 1 : d === 3 ? -1 : 0);
      let seen = false;
      for (let i = 0; i < n && !seen; i++) seen = QX[i] === nx && QZ[i] === nz;
      if (seen) continue;
      const h = ground(w, nx * 0.5 + 0.25, nz * 0.5 + 0.25, g, STEP_UP);
      if (Number.isNaN(h) || h < g - KERB) continue;
      if (h > g + KERB || n >= ISLAND) out = false;
      else {
        QX[n] = nx;
        QZ[n] = nz;
        n++;
      }
    }
  }
  ISLANDS.set(key, out);
  return out;
}
/** Islands are this near the land (m over the height field) and smaller than this (columns: 16 m²). */
const NEAR_LAND = 1.3;
const ISLAND = 64;
const QX = new Int32Array(ISLAND + 1);
const QZ = new Int32Array(ISLAND + 1);
const ISLANDS = new Map<number, boolean>();
/** A stair's next tread is this much higher (m); a floor is wide when it goes on this far (m). */
const RISE = 0.2;
const WIDE = 1.25;

/**
 * A straight way from (ax, ay, az) to (bx, bz) that it walks without a hop or a jump (a step every 0.25 m): the height
 * it ends at, or NaN.
 */
export function lineWalk(w: RoamWorld, ax: number, ay: number, az: number, bx: number, bz: number, hops = false): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len = len2(dx, dz);
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
      const d = len2(x - this.p[o], z - this.p[o + 2]);
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
/** No way to him: it goes to the nearest place it reaches only when that is this near him across (m: below his deck, at the bank). */
const FOOT = 12;
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

/** `found`: a way to him; `near`: none, but a way to the nearest place below or beside him it reaches (the foot of a deck's stair, a bank); `none`. */
export type SearchState = 'idle' | 'busy' | 'found' | 'near' | 'none';

/**
 * A* over the walk map's columns, run a slice at a time (`step`), from where
 * the dog is to within `NEAR` of the goal. Each column is a node at its floor's
 * height (keyed by column and height: the bridge's deck and the river bank
 * under it are two). Gives up past `NODES` columns or `limit` m of way.
 * `toLand`: to the nearest floor on the land instead (a dog could come up from
 * the ground to where he stands: a terrace, a deck by its stair; not a roof).
 */
export class PathSearch {
  state: SearchState = 'idle';
  /** Columns looked at in the last search (checks). */
  looked = 0;
  /** The last search ran out of room (it does not know there is no way). */
  full = false;
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
  private toLand = false;
  private w: RoamWorld | null = null;
  /** The node nearest him across (m) so far. */
  private best = -1;
  private bestD = Infinity;

  /** Start looking for a way from (x, y, z) to (tx, ty, tz), at most `limit` m long. */
  start(w: RoamWorld, x: number, y: number, z: number, tx: number, ty: number, tz: number, limit: number, toLand = false): void {
    this.w = w;
    this.toLand = toLand;
    this.full = false;
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
    this.best = -1;
    this.bestD = Infinity;
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
      // (the nearest it has come to him across, if it cannot get to him)
      const across = len2(this.nx[c] - this.tx, this.nz[c] - this.tz);
      if (across < this.bestD) {
        this.bestD = across;
        this.best = c;
      }
      const cx = this.nx[c];
      const cy = this.ny[c];
      const cz = this.nz[c];
      if (this.toLand ? onLand(w, cx, cy, cz) : len2(cx - this.tx, cz - this.tz) < NEAR && Math.abs(cy - this.ty) < LEVEL) return this.end(c);
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
        if (n < 0) {
          this.full = true;
          return this.end(-1);
        }
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
    if (this.toLand) return 0;
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
    let near = false;
    if (n < 0) {
      // No way to him: the way to the nearest place it got to under or beside him, if that is close across.
      if (this.toLand || this.best < 0 || this.bestD > FOOT) {
        this.state = 'none';
        return this.state;
      }
      n = this.best;
      near = true;
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
    this.state = near ? 'near' : 'found';
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
