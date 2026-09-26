import { hash3, mulberry32 } from '../../voxel/random';
import { PLACES } from '../layout';
import { KIND, LIFT } from '../road/line';
import { CH, type Flock } from './_kit';
import type { Walker } from './_landBrain';
import type { Survey } from './_landPlaces';

/**
 * A troop of long-tailed macaques that lives on both sides of the valley
 * road, where the forest comes close on each side (`findCrossSite`). They
 * rest at the forest's edge — sitting, grooming, eating, scratching — and a
 * few times a day (the `monkeyCrossing` event, events.ts) they cross: they
 * gather in a line at the roadside, the big male looks both ways, and they
 * run across one behind the other — a mother with her baby clinging to her
 * back in the middle, a youngster hurrying last — chattering, then settle at
 * the other side's edge. The explorer coming up to them makes them cross too
 * (away from him). At night and in a storm they huddle, heads down.
 *
 * Instances `first`… of the macaque flock (the baby last).
 */

export interface CrossSite {
  /** The road's middle where they cross (m). */
  x: number;
  y: number;
  z: number;
  /** Across the road, from side A (+) to side B (−) (unit), and along it. */
  nx: number;
  nz: number;
  tx: number;
  tz: number;
  /** From the road's middle to each side's forest edge (m): side + and side −. */
  edge: [number, number];
  /** Where a monkey stands at (x, z): the paving on the road, else the land. */
  ground(x: number, z: number): number;
}

/**
 * The spot on the valley road where the forest is close on both sides (5–14 m
 * from the road's middle), the ground open and fairly flat in between, away
 * from the places, the temples' troops and the elephants (`avoid`).
 */
export function findCrossSite(sv: Survey, avoid: { x: number; z: number; r: number }[]): CrossSite | null {
  const f = sv.field;
  const road = sv.road.roads[0];
  if (!road) return null;
  const st = road.stations;
  const ground = (x: number, z: number) => {
    const c = f.index(x, z);
    if (c < 0) return Number.NaN;
    return Number.isNaN(sv.paving[c]) ? f.height[c] : sv.paving[c];
  };
  let best: { score: number; site: CrossSite } | null = null;
  for (let i = 16; i < st.length - 16; i += 4) {
    const a = st[i];
    let flat = true;
    for (let j = -8; j <= 8; j += 2) {
      const b = st[i + j];
      if (b.kind !== KIND.ground || b.stair || b.landing || Math.abs(b.h - a.h) > 0.01) flat = false;
    }
    if (!flat || avoid.some((o) => Math.hypot(o.x - a.x, o.z - a.z) < o.r)) continue;
    if (PLACES.some((p) => Math.hypot(p.x - a.x, p.z - a.z) < Math.max(p.pad[0], p.pad[1]) + 20)) continue;
    const edge: number[] = [];
    for (const s of [1, -1]) {
      const nx = a.tz * s;
      const nz = -a.tx * s;
      let last = a.h + LIFT;
      let at = -1;
      for (let d = 2.5; d <= 15; d += 0.5) {
        const x = a.x + nx * d;
        const z = a.z + nz * d;
        const c = f.index(x, z);
        if (c < 0 || f.water[c] > f.height[c] || sv.cover[c] & 4) break;
        if (sv.cover[c] & 3) {
          at = d;
          break;
        }
        const g = ground(x, z);
        if (!(Math.abs(g - last) <= 1.05)) break;
        last = g;
      }
      if (at < 5) break;
      edge.push(at);
    }
    if (edge.length < 2) continue;
    const score = -Math.abs(edge[0] - 8) - Math.abs(edge[1] - 8) - (a.h > 20 ? 1.5 : 0) + hash3(i, 3, 17) * 0.2;
    if (!best || score > best.score)
      best = { score, site: { x: a.x, y: a.h + LIFT, z: a.z, nx: a.tz, nz: -a.tx, tx: a.tx, tz: a.tz, edge: [edge[0], edge[1]], ground } };
  }
  return best?.site ?? null;
}

type Does = 'sit' | 'groom' | 'eat' | 'scratch' | 'look';
const LOOKS: Record<Does, { rest: number; head: number; act: number }> = {
  sit: { rest: 1, head: 0.2, act: 0 },
  groom: { rest: 1, head: 0.3, act: 1 },
  eat: { rest: 1, head: 0, act: 3 },
  scratch: { rest: 1, head: 0, act: 2 },
  look: { rest: 1, head: 0, act: 0 },
};
const DOES: Does[] = ['sit', 'sit', 'groom', 'groom', 'eat', 'scratch', 'look', 'look'];
/** Looks while huddling, watching the explorer, lined up / running, and the leader looking both ways. */
const HUDDLE = { rest: 1, head: 1, act: 0 };
const WATCH = { rest: 0, head: -1, act: 0 };
const UP = { rest: 0, head: 0, act: 0 };
const LEADER = { rest: 0, head: -0.4, act: 0 };

interface Monkey {
  i: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  /** Place in the line (0 the leader), and where it rests on each side (along, out: m). */
  k: number;
  along: number;
  out: number;
  does: Does;
  until: number;
  turn: number;
  /** Crossing: the time it starts to run; then 0 running across, 1 walking to its new place, 2 there. */
  go: number;
  leg: number;
}

/** Walking and running speeds (m/s), steps a second at each (for a 1 m animal). */
const WALK = 0.9;
const RUN = 2.8;
const WALK_HZ = 1.8;
const RUN_HZ = 3.2;
/** Gap in the line (m), and the queue's first place from the road's middle (m). */
const GAP = 1.05;
const QUEUE = 3.4;
/** Hidden past this distance from the camera (m). */
const FAR = 190;
/** The troop lives (steps, crossings) only this near the camera or the explorer (m; as land.ts's `ACTIVE`): farther it is hidden anyway (`FAR`) and stays as it was. */
const ACTIVE = 250;

export type CrossEvent = 'chatter' | 'call' | null;

export class Crossing {
  /** The side they are on: +1 or −1 (across the road: `site.n` times this). */
  side: 1 | -1;
  mode: 'rest' | 'line' | 'cross' = 'rest';
  /** Something to hear this step, and where (land.ts makes it a call). */
  event: CrossEvent = null;
  readonly at = { x: 0, y: 0, z: 0 };
  /** Crossings so far (checks), and the last one's start. */
  crossings = 0;
  startedAt = -1e9;
  private readonly members: Monkey[] = [];
  private readonly baby: { i: number; x: number; y: number; z: number; yaw: number };
  private readonly mother: Monkey;
  private readonly rnd: () => number;
  private served = 0;
  /** A crossing asked for waits this long for the way to clear (the time it gives up). */
  private pendingUntil = -1e9;
  private phaseT = 0;
  private lookSide = 1;
  private lookAt = 0;
  private midCalled = false;
  /** Out of reach (far from the camera and the explorer): hidden, not stepping. */
  private idle = false;
  /** (scratch: a monkey's resting place on the far side) */
  private readonly homeAt = { x: 0, z: 0 };

  constructor(
    private readonly flock: Flock,
    first: number,
    private readonly site: CrossSite,
    seed: number,
  ) {
    this.rnd = mulberry32(seed);
    this.side = this.rnd() < 0.5 ? 1 : -1;
    // The big male leads, a mother with her baby in the middle, a youngster last.
    const sizes = [1.1, 0.92, 0.88, 0.9, 0.95, 0.86, 0.7];
    sizes.forEach((scale, k) => {
      const i = first + k;
      flock.setup(i, k === 0 ? 2 : 0, hash3(i, k, 21), 0.92 + 0.16 * hash3(i, k, 22));
      const m: Monkey = { i, x: 0, y: 0, z: 0, yaw: 0, scale, k, along: (k - 3) * 1.1 + (hash3(k, 5, 23) - 0.5) * 0.6, out: -0.4 - 1.4 * hash3(k, 6, 24), does: 'sit', until: 0, turn: 0, go: 0, leg: 2 };
      this.members.push(m);
      const home = this.home(m, this.side, this.homeAt);
      m.x = home.x;
      m.z = home.z;
      m.y = site.ground(m.x, m.z);
      m.yaw = Math.atan2(-site.nx * this.side, -site.nz * this.side) + (hash3(k, 7, 25) - 0.5) * 2;
      m.until = 3 + 10 * hash3(k, 8, 26);
      m.does = DOES[Math.floor(hash3(k, 9, 27) * DOES.length)];
    });
    this.mother = this.members[3];
    const bi = first + sizes.length;
    flock.setup(bi, 1, hash3(bi, 1, 28), 1);
    this.baby = { i: bi, x: this.mother.x, y: this.mother.y, z: this.mother.z, yaw: this.mother.yaw };
    Object.assign(this.at, { x: site.x, y: site.y, z: site.z });
  }

  /** Macaques in the troop (with the baby). */
  static readonly SIZE = 8;

  /** Where a monkey rests on a side: at the forest's edge, spread along the road (into `out`). */
  private home(m: Monkey, side: 1 | -1, out: { x: number; z: number }): { x: number; z: number } {
    const s = this.site;
    const d = s.edge[side === 1 ? 0 : 1] + m.out;
    out.x = s.x + s.nx * side * d + s.tx * m.along;
    out.z = s.z + s.nz * side * d + s.tz * m.along;
    return out;
  }

  /**
   * One step. `want`: the crossing event is open (`count` its number);
   * `ex` the explorer's feet (null: none); `night` 0‥1 and `shelter` (a storm, 0‥1):
   * they huddle; `cam` the camera (far: hidden); `people` on the road (they wait for them to pass).
   */
  step(dt: number, now: number, ex: Walker | null, night: number, shelter: number, want: boolean, count: number, cam: { x: number; y: number; z: number }, people: readonly { x: number; z: number }[] = []): void {
    const s = this.site;
    const r = this.rnd;
    this.event = null;
    if (want && count !== this.served) {
      this.served = count;
      this.pendingUntil = now + 60;
    }
    // Far from the camera and the explorer: hidden (as `FAR` would), nothing to step.
    const dc = len3(s.x - cam.x, s.y - cam.y, s.z - cam.z);
    const de = ex ? len(s.x - ex.x, s.z - ex.z) : Infinity;
    if (Math.min(dc, de) > ACTIVE) {
      if (!this.idle) {
        this.idle = true;
        for (const m of this.members) this.flock.hide(m.i);
        this.flock.hide(this.baby.i);
      }
      return;
    }
    this.idle = false;
    const huddle = night > 0.55 || shelter > 0.4;
    // The explorer close to their side: they cross away from him.
    let near = Infinity;
    let exSide = 0;
    if (ex && Math.abs(ex.y - s.y) < 5) {
      // (from the middle of the troop's resting place on its side)
      const d = s.edge[this.side === 1 ? 0 : 1] - 1;
      near = len(ex.x - (s.x + s.nx * this.side * d), ex.z - (s.z + s.nz * this.side * d));
      exSide = Math.sign((ex.x - s.x) * s.nx + (ex.z - s.z) * s.nz);
    }
    // (they wait while someone is on the road where they cross)
    let onLine = ex ? len(ex.x - s.x, ex.z - s.z) < 4 : false;
    for (let k = 0; k < people.length && !onLine; k++) onLine = len(people[k].x - s.x, people[k].z - s.z) < 6;
    if (this.mode === 'rest') {
      const asked = now < this.pendingUntil && !huddle && !onLine;
      const chased = near < 5 && exSide === this.side && !onLine;
      if (asked || chased) {
        this.pendingUntil = -1e9;
        this.mode = 'line';
        this.phaseT = now + (chased ? 1 : 5);
        this.lookAt = now;
        this.crossings++;
        this.startedAt = now;
        this.event = 'chatter';
        Object.assign(this.at, this.members[0]);
      }
    } else if (this.mode === 'line' && now >= this.phaseT) {
      this.mode = 'cross';
      this.midCalled = false;
      this.members.forEach((m) => {
        m.go = now + m.k * 0.13;
        m.leg = 0;
      });
    } else if (this.mode === 'cross' && this.members.every((m) => m.leg === 2)) {
      this.mode = 'rest';
      this.side = this.side === 1 ? -1 : 1;
      this.event = 'call';
      Object.assign(this.at, this.members[3]);
      this.members.forEach((m) => (m.until = now + 2 + 8 * r()));
    }

    const fl = this.flock;
    const side = this.side;
    for (const m of this.members) {
      let gait = 0;
      let look = LOOKS[m.does];
      let turn = 0;
      if (this.mode === 'rest') {
        if (huddle) look = HUDDLE;
        else if (near < 8 && exSide === side) {
          // Up and watching him.
          look = WATCH;
          m.yaw = turnTo(m.yaw, Math.atan2(ex!.x - m.x, ex!.z - m.z), 4 * dt);
        } else if (now >= m.until) {
          m.does = DOES[Math.floor(r() * DOES.length)];
          m.until = now + 5 + 10 * r();
          m.turn = m.does === 'look' ? (r() - 0.5) * 1.6 : 0;
          look = LOOKS[m.does];
        }
        turn = m.turn;
      } else if (this.mode === 'line') {
        // To its place in the line at the roadside, facing across.
        const qd = QUEUE + m.k * GAP;
        const tx = s.x + s.nx * side * qd;
        const tz = s.z + s.nz * side * qd;
        gait = this.walk(m, tx, tz, WALK * 1.4, dt) ? 1 : 0;
        if (!gait) m.yaw = turnTo(m.yaw, Math.atan2(-s.nx * side, -s.nz * side), 4 * dt);
        look = UP;
        // The leader looks one way, then the other.
        if (m.k === 0 && !gait) {
          if (now > this.lookAt) {
            this.lookAt = now + 1.1;
            this.lookSide = -this.lookSide;
          }
          turn = this.lookSide * 0.9;
          look = LEADER;
        }
      } else if (m.leg === 0) {
        // Across in a line (running, one behind the other)…
        look = UP;
        if (now >= m.go) {
          const tx = s.x - s.nx * side * QUEUE;
          const tz = s.z - s.nz * side * QUEUE;
          if (this.walk(m, tx, tz, RUN, dt)) gait = 2;
          else m.leg = 1;
          if (m.k === 3 && !this.midCalled && (m.x - s.x) * s.nx * side + (m.z - s.z) * s.nz * side < 0) {
            this.midCalled = true;
            this.event = 'chatter';
            Object.assign(this.at, m);
          }
        }
      } else if (m.leg === 1) {
        // …then on to its resting place at the other side's edge.
        const h = this.home(m, side === 1 ? -1 : 1, this.homeAt);
        look = UP;
        if (this.walk(m, h.x, h.z, WALK * 1.3, dt)) gait = 1;
        else {
          m.leg = 2;
          m.does = r() < 0.5 ? 'look' : 'sit';
          m.turn = (r() - 0.5) * 1.2;
          m.until = now + 4 + 6 * r();
        }
      } else {
        look = LOOKS[m.does];
        turn = m.turn;
      }
      m.y += (s.ground(m.x, m.z) - m.y) * Math.min(1, dt * 9);
      const k = 1 / Math.sqrt(m.scale);
      fl.gait(m.i, gait, gait === 2 ? RUN_HZ * k : WALK_HZ * k, now);
      fl.set(m.i, CH.rest, look.rest, now);
      fl.set(m.i, CH.head, look.head, now);
      fl.set(m.i, CH.act, look.act, now);
      fl.set(m.i, CH.turn, Math.round(turn * 10) / 10, now);
      if (len3(m.x - cam.x, m.y - cam.y, m.z - cam.z) < FAR * Math.sqrt(m.scale)) fl.place(m.i, m.x, m.y, m.z, m.yaw, m.scale);
      else fl.hide(m.i);
    }
    this.ride(dt, now, cam);
  }

  /** Towards (tx, tz) at `speed`; false once there. */
  private walk(m: Monkey, tx: number, tz: number, speed: number, dt: number): boolean {
    const dx = tx - m.x;
    const dz = tz - m.z;
    const d = len(dx, dz);
    if (d < 0.08) return false;
    const want = Math.atan2(dx, dz);
    m.yaw = turnTo(m.yaw, want, 7 * dt);
    const go = Math.min(d, speed * dt * Math.max(0.2, Math.cos(wrap(want - m.yaw))));
    m.x += Math.sin(m.yaw) * go;
    m.z += Math.cos(m.yaw) * go;
    return true;
  }

  /** The baby on its mother's back (beside her while she sits). */
  private ride(dt: number, now: number, cam: { x: number; y: number; z: number }): void {
    const m = this.mother;
    const b = this.baby;
    const fl = this.flock;
    if (!fl.isShown(m.i)) return fl.hide(b.i);
    const sitting = fl.target(m.i, CH.rest) > 0.5;
    const s = m.scale;
    const side = sitting ? -0.24 * s : 0;
    const back = sitting ? 0.02 : -0.06 * s;
    const tx = m.x + Math.cos(m.yaw) * side + Math.sin(m.yaw) * back;
    const tz = m.z - Math.sin(m.yaw) * side + Math.cos(m.yaw) * back;
    const ty = m.y + (sitting ? 0 : 0.38 * s);
    const k = Math.min(1, dt * 10);
    b.x += (tx - b.x) * k;
    b.y += (ty - b.y) * k;
    b.z += (tz - b.z) * k;
    b.yaw = m.yaw + (sitting ? 0.5 : 0);
    fl.gait(b.i, 0, 2, now);
    fl.set(b.i, CH.rest, sitting ? 1 : 0, now);
    fl.set(b.i, CH.head, sitting ? fl.target(m.i, CH.head) : 0.2, now);
    if (len3(b.x - cam.x, b.z - cam.z, b.y - cam.y) < FAR * 0.6) fl.place(b.i, b.x, b.y, b.z, b.yaw, 0.42);
    else fl.hide(b.i);
  }
}

/** Lengths (as `Math.hypot`, which allocates on every call in V8: these run every frame). */
function len(x: number, z: number): number {
  return Math.sqrt(x * x + z * z);
}
function len3(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

const TAU = Math.PI * 2;
function wrap(a: number): number {
  a %= TAU;
  return a > Math.PI ? a - TAU : a < -Math.PI ? a + TAU : a;
}
function turnTo(yaw: number, want: number, k: number): number {
  const d = wrap(want - yaw);
  return wrap(yaw + Math.max(-k, Math.min(k, d)));
}
