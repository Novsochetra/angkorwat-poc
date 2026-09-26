import type { InstancedMesh, Object3D } from 'three';
import type { HeightField } from '../heightfield';
import { PLACES } from '../layout';
import { buildRoadNetwork, KIND, LIFT, ROAD_W, type RoadNetwork } from '../road/line';
import { ROAM_HEIGHT } from '../roam/types';
import { WalkMap } from '../roam/walkmap';
import type { MapFrame, MapPart, PlaceId } from '../types';

/**
 * Where people walk: along the stone roads (layout.ts `PATHS`, as the road
 * pass builds them: stations every 0.5 m, stairs, bridges and beacon
 * landings), on the real floor under them (the walk map of the road and the
 * temples: beacon discs, steps, the River Gate's bridge), and round whoever
 * is in the way.
 *
 * - `RoadGraph`: the roads joined where one starts on another; `route(a, b)`
 *   is the shortest way along them between two points (a `Route`);
 *   `beacon(id)` is a place's beacon on the road.
 * - `Route`: a walkable line (a point every 0.5 m, with the paving's
 *   height); `at(s, side)` is the point `s` m along it, `side` m to the left
 *   of its way; `extend` adds a last stretch off the road (into a gate).
 * - `Ground`: the floor at a point for feet at about some height (NaN-safe),
 *   and whether a person may stand there (no wall, no water, no drop).
 * - `Traffic`: what is in people's way this frame (the roaming explorer,
 *   the elephants as two discs each, the beacons' pedestals, the other
 *   groups) and `lane`, which picks a lane on the road past them: the usual
 *   one if it is clear, else the clearest (the verges where there is open
 *   ground); wait at the side when none is, or when the explorer walks up
 *   the road towards them (they let him pass); `backOff` when an elephant
 *   comes down the lane at them. `dodge` moves one person's goal out of an
 *   elephant's way (the actors call it themselves: `Actor.avoid`).
 *
 * A new group: make its route(s) with `graph.route([x, z], [x, z])` (or
 * `graph.road(i)` and `extend` into a door), keep an `s` along it and a
 * lane, ask `traffic.lane(...)` each frame, and `traffic.add` its people
 * after they move (the scene's `report`).
 */

export interface Point {
  x: number;
  y: number;
  z: number;
}

/** A walkable line: a point every `STEP` m, with the floor height and the way (unit tangent). */
export class Route {
  static readonly STEP = 0.5;
  readonly len: number;

  constructor(
    readonly xs: Float32Array,
    readonly ys: Float32Array,
    readonly zs: Float32Array,
    readonly txs: Float32Array,
    readonly tzs: Float32Array,
  ) {
    this.len = (xs.length - 1) * Route.STEP;
  }

  /** From points about `STEP` apart (heights given); the way is taken over a few metres. */
  static from(pts: Point[]): Route {
    const n = pts.length;
    const xs = new Float32Array(n);
    const ys = new Float32Array(n);
    const zs = new Float32Array(n);
    const txs = new Float32Array(n);
    const tzs = new Float32Array(n);
    pts.forEach((p, i) => {
      xs[i] = p.x;
      ys[i] = p.y;
      zs[i] = p.z;
    });
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 3);
      const b = Math.min(n - 1, i + 3);
      const l = Math.hypot(xs[b] - xs[a], zs[b] - zs[a]) || 1;
      txs[i] = (xs[b] - xs[a]) / l;
      tzs[i] = (zs[b] - zs[a]) / l;
    }
    return new Route(xs, ys, zs, txs, tzs);
  }

  /** The same line walked the other way. */
  reversed(): Route {
    const r = (a: Float32Array, k = 1) => Float32Array.from(a, (_, i) => a[a.length - 1 - i] * k);
    return new Route(r(this.xs), r(this.ys), r(this.zs), r(this.txs, -1), r(this.tzs, -1));
  }

  /** This route, then a straight stretch to `p` (into a door, off the road's end). */
  extend(p: Point): Route {
    const n = this.xs.length;
    const last = { x: this.xs[n - 1], y: this.ys[n - 1], z: this.zs[n - 1] };
    const d = Math.hypot(p.x - last.x, p.z - last.z);
    const k = Math.max(1, Math.round(d / Route.STEP));
    const pts: Point[] = [];
    for (let i = 0; i < n; i++) pts.push({ x: this.xs[i], y: this.ys[i], z: this.zs[i] });
    for (let j = 1; j <= k; j++) pts.push({ x: last.x + ((p.x - last.x) * j) / k, y: last.y + ((p.y - last.y) * j) / k, z: last.z + ((p.z - last.z) * j) / k });
    return Route.from(pts);
  }

  /** Where `s` m along falls among the points: an index and its fraction to the next (clamped). */
  private index(s: number): number {
    return Math.max(0, Math.min(this.xs.length - 1.0001, s / Route.STEP));
  }

  /** The point `s` m along, `side` m to the left of the route's way; `out.yaw` is the way's heading (0 = +z). */
  at(s: number, side: number, out: Point & { yaw?: number }): Point & { yaw?: number } {
    const f = this.index(s);
    const i = Math.floor(f);
    const k = f - i;
    const j = Math.min(i + 1, this.xs.length - 1);
    const tx = this.txs[i] + (this.txs[j] - this.txs[i]) * k;
    const tz = this.tzs[i] + (this.tzs[j] - this.tzs[i]) * k;
    // (left of the way: +x is to the left of +z)
    out.x = this.xs[i] + (this.xs[j] - this.xs[i]) * k + tz * side;
    out.z = this.zs[i] + (this.zs[j] - this.zs[i]) * k - tx * side;
    out.y = this.ys[i] + (this.ys[j] - this.ys[i]) * k;
    out.yaw = Math.atan2(tx, tz);
    return out;
  }

  /** Heading of the way at `s` (dir −1: walking it backwards). */
  yawAt(s: number, dir = 1): number {
    const i = Math.floor(this.index(s));
    return Math.atan2(this.txs[i] * dir, this.tzs[i] * dir);
  }

  /** Where (x, z) is against the route near `s` (within `span` m): distance along, and to the left of the way. */
  project(x: number, z: number, s: number, span = 12): { s: number; side: number; d: number } {
    let bs = s;
    let bside = 0;
    let bd = Infinity;
    const a = Math.max(0, Math.floor((s - span) / Route.STEP));
    const b = Math.min(this.xs.length - 1, Math.ceil((s + span) / Route.STEP));
    for (let i = a; i <= b; i++) {
      const dx = x - this.xs[i];
      const dz = z - this.zs[i];
      const d = dx * dx + dz * dz;
      if (d < bd) {
        bs = i * Route.STEP + dx * this.txs[i] + dz * this.tzs[i];
        bside = dx * this.tzs[i] - dz * this.txs[i];
        bd = d;
      }
    }
    return { s: bs, side: bside, d: Math.sqrt(bd) };
  }

  /** Nearest point of the whole route to (x, z) (m along). */
  nearest(x: number, z: number): number {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < this.xs.length; i++) {
      const d = (x - this.xs[i]) ** 2 + (z - this.zs[i]) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best * Route.STEP;
  }
}

/** A place's beacon on the road: which road and station, where, and the place's middle (the temple). */
export interface Beacon extends Point {
  id: PlaceId;
  road: number;
  station: number;
  /** The temple's middle (for people to look at). */
  temple: Point;
}

/** The roads as a graph: stations joined along each road, and where a road starts or ends on another. */
export class RoadGraph {
  readonly net: RoadNetwork;
  /** Station index offsets: node = start[road] + station. */
  private readonly start: number[] = [];
  private readonly links = new Map<number, [number, number][]>();
  private readonly nodes: number;

  constructor(readonly field: HeightField) {
    this.net = buildRoadNetwork(field);
    let n = 0;
    for (const r of this.net.roads) {
      this.start.push(n);
      n += r.stations.length;
    }
    this.nodes = n;
    // A road's end within 6 m of another road's station joins it there.
    this.net.roads.forEach((road, r) => {
      for (const end of [0, road.stations.length - 1]) {
        const e = road.stations[end];
        let bq = -1;
        let bi = 0;
        let bd = 6;
        this.net.roads.forEach((other, q) => {
          if (q === r) return;
          other.stations.forEach((st, i) => {
            const d = Math.hypot(st.x - e.x, st.z - e.z);
            if (d < bd) [bq, bi, bd] = [q, i, d];
          });
        });
        if (bq >= 0) this.link(this.start[r] + end, this.start[bq] + bi, bd);
      }
    });
  }

  private link(a: number, b: number, d: number): void {
    for (const [x, y] of [[a, b], [b, a]]) {
      if (!this.links.has(x)) this.links.set(x, []);
      this.links.get(x)!.push([y, d]);
    }
  }

  private station(node: number): { road: number; i: number } {
    let r = this.start.length - 1;
    while (r > 0 && this.start[r] > node) r--;
    return { road: r, i: node - this.start[r] };
  }

  /** The station nearest to (x, z) (not on the River Gate's own bridge unless `gate`). */
  nearest(x: number, z: number): { road: number; i: number; d: number } {
    let best = { road: 0, i: 0, d: Infinity };
    this.net.roads.forEach((road, r) =>
      road.stations.forEach((st, i) => {
        const d = Math.hypot(st.x - x, st.z - z);
        if (d < best.d) best = { road: r, i, d };
      }),
    );
    return best;
  }

  /** The shortest way along the roads from the station nearest `a` to the one nearest `b`. */
  route(a: [number, number], b: [number, number]): Route {
    const from = this.nearest(a[0], a[1]);
    const to = this.nearest(b[0], b[1]);
    const src = this.start[from.road] + from.i;
    const dst = this.start[to.road] + to.i;
    // Dijkstra over stations (a few thousand: once per route, at build time).
    const dist = new Float32Array(this.nodes).fill(Infinity);
    const prev = new Int32Array(this.nodes).fill(-1);
    const done = new Uint8Array(this.nodes);
    dist[src] = 0;
    const heap: [number, number][] = [[0, src]];
    const push = (d: number, v: number) => {
      heap.push([d, v]);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heap[p][0] <= heap[k][0]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        k = p;
      }
    };
    const pop = (): [number, number] => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = k * 2 + 1;
          const r = l + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    while (heap.length) {
      const [d, v] = pop();
      if (done[v]) continue;
      done[v] = 1;
      if (v === dst) break;
      const { road, i } = this.station(v);
      const st = this.net.roads[road].stations;
      const next: [number, number][] = [];
      if (i > 0) next.push([v - 1, Route.STEP]);
      if (i < st.length - 1) next.push([v + 1, Route.STEP]);
      for (const l of this.links.get(v) ?? []) next.push(l);
      for (const [w, c] of next)
        if (d + c < dist[w]) {
          dist[w] = d + c;
          prev[w] = v;
          push(d + c, w);
        }
    }
    const path: number[] = [];
    for (let v = dst; v >= 0; v = prev[v]) {
      path.push(v);
      if (v === src) break;
    }
    path.reverse();
    const pts: Point[] = [];
    for (const v of path) {
      const { road, i } = this.station(v);
      const st = this.net.roads[road].stations[i];
      const p = { x: st.x, y: st.h + LIFT, z: st.z };
      const last = pts[pts.length - 1];
      // (across a junction: fill the gap every half metre)
      if (last) {
        const d = Math.hypot(p.x - last.x, p.z - last.z);
        const k = Math.round(d / Route.STEP);
        for (let j = 1; j < k; j++) pts.push({ x: last.x + ((p.x - last.x) * j) / k, y: last.y + ((p.y - last.y) * j) / k, z: last.z + ((p.z - last.z) * j) / k });
        if (d < Route.STEP * 0.3) continue;
      }
      pts.push(p);
    }
    return Route.from(pts);
  }

  /** A whole road as a route (from its first station; `from`/`to` in stations). */
  road(r: number, from = 0, to = Infinity): Route {
    const st = this.net.roads[r].stations;
    const pts: Point[] = [];
    for (let i = Math.max(0, from); i <= Math.min(st.length - 1, to); i++) pts.push({ x: st[i].x, y: st[i].h + LIFT, z: st[i].z });
    return Route.from(pts);
  }

  /** A place's beacon on the road (null if the place has none). */
  beacon(id: PlaceId): Beacon | null {
    const b = this.net.beacons.find((q) => q.place.id === id);
    if (!b) return null;
    const st = this.net.roads[b.road].stations[b.station];
    const p = PLACES.find((q) => q.id === id)!;
    return { id, road: b.road, station: b.station, x: st.x, y: st.h + LIFT, z: st.z, temple: { x: p.x, y: p.y, z: p.z } };
  }

  /** Is station `i` of road `r` on the River Gate's own bridge? */
  onGate(r: number, i: number): boolean {
    return this.net.roads[r].stations[i]?.kind === KIND.gate;
  }
}

/** The highest step people walk up (m: a 1 m temple block, the road's stair steps). */
export const STEP_UP = 1.1;

/** Half the paved width, and how far off the paving people may step (m). */
export const ROAD_HALF = ROAD_W / 2;
export const VERGE = ROAD_HALF + 0.7;

/**
 * The floor people stand on: the walk map of the road and the temples
 * (steps, beacon discs, bridges), else the land.
 */
export class Ground {
  constructor(
    readonly field: HeightField,
    readonly walk: WalkMap | null,
  ) {}

  /** Made from the built road and temples in the scene (the parts named `path` and `landmark:*`). */
  static of(field: HeightField, scene: Object3D): Ground {
    const built: MapPart[] = [];
    for (const o of scene.children) if (o.name === 'path' || o.name.startsWith('landmark:')) built.push({ name: o.name, object: o });
    return new Ground(field, built.length ? new WalkMap(field, built) : null);
  }

  /** Floor under feet at about `y` at (x, z) (up a step of `STEP_UP`, down any drop); NaN where a wall is in the way. */
  at(x: number, z: number, y: number): number {
    if (!this.walk) return this.field.heightAt(x, z);
    return this.walk.standAt(x, z, y, STEP_UP, 1.2);
  }

  /** May a person stand at (x, z) with feet near `y` (no wall, no step up or down over 1.1 m, dry)? */
  free(x: number, z: number, y: number): boolean {
    const w = this.field.waterAt(x, z);
    if (w !== null && w > this.field.heightAt(x, z) - 0.05 && w > y - 0.3) return false;
    const g = this.walk ? this.walk.standAt(x, z, y, STEP_UP, 1.8) : this.field.heightAt(x, z);
    return Number.isFinite(g) && Math.abs(g - y) <= STEP_UP;
  }
}

/** Something in people's way: where it is (feet), its radius, its velocity, and who it belongs to. */
export interface Obstacle extends Point {
  r: number;
  vx: number;
  vz: number;
  /** 'explorer', 'animal', or a group's name (a group ignores its own members). */
  who: string;
}

/** Radius of a walking person (m, drawn size). */
export const PERSON_R = 0.4;

/** Length of (x, z): as `Math.hypot`, which allocates on every call in V8 (this runs for everyone, every frame). */
export function len(x: number, z: number): number {
  return Math.sqrt(x * x + z * z);
}
/** Where a dodge looks for what is in the way: an animal now and in 1.5 and 3 s; the explorer now (the first only) (s). */
const DODGE_AHEAD = new Float64Array([0, 1.5, 3]);

export interface LaneChoice {
  /** Lane to walk in (m to the left of the way). */
  side: number;
  /** Stop (step to `side` and wait). */
  wait: boolean;
  /** Only other people are in the way (no explorer, animal or beacon): a group may press on after a while (no stand-offs). */
  onlyPeople: boolean;
  /** An animal is coming at them down the lane: with no way past, they back off along the road. */
  backOff: boolean;
  /** Something is in the window ahead (so the lane may change quickly). */
  obstacle: boolean;
  /** The explorer is close ahead or alongside (for a nod or a greeting). */
  explorer: Obstacle | null;
}

/**
 * What is in the way this frame, and lanes past it. `update` reads the
 * roaming explorer (from the frame's listener) and the elephants (the
 * `fauna:elephant` mesh, if the land animals are built); groups add their
 * own people with `add` after they move.
 */
export class Traffic {
  readonly list: Obstacle[] = [];
  /** Things that never move (the beacons' pedestals in the road's middle): in everyone's way, always. */
  readonly fixed: Obstacle[] = [];
  explorer: Obstacle | null = null;
  private readonly ex: Obstacle = { x: 0, y: 0, z: 0, r: 0.55, vx: 0, vz: 0, who: 'explorer' };
  /** The cow and her calf, each as two discs (the body is long): front and back. */
  private readonly elephants: Obstacle[] = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0, r: 1, vx: 0, vz: 0, who: 'animal' }));
  private readonly elephantAt = [
    { x: 0, z: 0, ok: false },
    { x: 0, z: 0, ok: false },
  ];
  private elephantMesh: InstancedMesh | null = null;
  private people: Obstacle[] = [];
  private used = 0;
  private lastEx = { x: 0, z: 0, ok: false };

  constructor(scene: Object3D) {
    this.elephantMesh = (scene.getObjectByName('fauna:elephant') as InstancedMesh | undefined) ?? null;
  }

  /** Once a frame, before the groups move (`explorer` false: as if he were not there, for a shot's warm-up). */
  update(f: MapFrame, explorer = true): void {
    this.list.length = 0;
    this.used = 0;
    this.explorer = null;
    for (const o of this.fixed) this.list.push(o);
    if (f.roam !== 'overview') {
      const e = this.ex;
      e.x = f.listener.x;
      e.y = f.listener.y - ROAM_HEIGHT;
      e.z = f.listener.z;
      if (this.lastEx.ok && f.dt > 0) {
        const k = Math.min(1, f.dt * 6);
        e.vx += ((e.x - this.lastEx.x) / f.dt - e.vx) * k;
        e.vz += ((e.z - this.lastEx.z) / f.dt - e.vz) * k;
      } else e.vx = e.vz = 0;
      this.lastEx.x = e.x;
      this.lastEx.z = e.z;
      this.lastEx.ok = true;
      // (in a boat or high in the air he is in nobody's way)
      if (f.roam === 'walk' && explorer) {
        this.explorer = e;
        this.list.push(e);
      }
    } else this.lastEx.ok = false;
    const m = this.elephantMesh;
    if (m) {
      const a = m.instanceMatrix.array as Float32Array;
      for (let i = 0; i < 2 && i < m.count; i++) {
        const o = i * 16;
        const at = this.elephantAt[i];
        if (a[o + 5] === 0) {
          at.ok = false;
          continue;
        }
        // (heading and size from the instance matrix: cos·size, sin·size)
        const size = len(a[o], a[o + 8]);
        const hx = a[o + 8] / size;
        const hz = a[o] / size;
        const x = a[o + 12];
        const z = a[o + 14];
        const vx = at.ok && f.dt > 0 ? (x - at.x) / f.dt : 0;
        const vz = at.ok && f.dt > 0 ? (z - at.z) / f.dt : 0;
        at.x = x;
        at.z = z;
        at.ok = true;
        for (let k = -1; k <= 1; k += 2) {
          const el = this.elephants[i * 2 + (k + 1) / 2];
          el.x = x + hx * k * 0.95 * size;
          el.z = z + hz * k * 0.95 * size;
          el.y = a[o + 13];
          el.r = 1.05 * size + 0.1;
          el.vx = vx;
          el.vz = vz;
          this.list.push(el);
        }
      }
    }
  }

  /**
   * A goal (`out.x`, `out.z`) for someone of group `who`, moved out of the
   * way of the animals (the elephants: where they are and where they will
   * be in a moment, with room to spare) and of the explorer (a little room):
   * to the side of an animal's way that the goal is on, or straight away
   * from what stands still; the other side if that is not open ground.
   * Returns whether it moved.
   */
  dodge(out: { x: number; z: number }, y: number, who: string, ground: Ground | null): boolean {
    let moved = false;
    // (indexed loops: this runs for everyone every frame, and makes no garbage)
    const list = this.list;
    for (let n = 0; n < list.length; n++) {
      const o = list[n];
      if (o.who === who || (o.who !== 'animal' && o.who !== 'explorer') || Math.abs(o.y - y) > 3) continue;
      const room = o.r + PERSON_R + (o.who === 'animal' ? 1.0 : 0.3);
      const v = len(o.vx, o.vz);
      const looks = o.who === 'animal' ? DODGE_AHEAD.length : 1;
      for (let q = 0; q < looks; q++) {
        const ahead = DODGE_AHEAD[q];
        const px = o.x + o.vx * ahead;
        const pz = o.z + o.vz * ahead;
        let dx = out.x - px;
        let dz = out.z - pz;
        const d = len(dx, dz);
        if (d >= room) continue;
        if (v > 0.2) {
          // (sideways off its way, on the side the goal is on)
          const nx = -o.vz / v;
          const nz = o.vx / v;
          const side = dx * nx + dz * nz >= 0 ? 1 : -1;
          const along = dx * (o.vx / v) + dz * (o.vz / v);
          dx = nx * side * room + (o.vx / v) * along * 0.3;
          dz = nz * side * room + (o.vz / v) * along * 0.3;
          if (ground && !ground.free(px + dx, pz + dz, y)) {
            dx = -nx * side * room;
            dz = -nz * side * room;
            // (walls both sides, a bridge: on ahead of it along its way)
            if (!ground.free(px + dx, pz + dz, y)) {
              dx = (o.vx / v) * (room + 1.5);
              dz = (o.vz / v) * (room + 1.5);
            }
          }
        } else if (d > 1e-3) {
          dx = (dx / d) * room;
          dz = (dz / d) * room;
        } else dx = room;
        out.x = px + dx;
        out.z = pz + dz;
        moved = true;
      }
    }
    return moved;
  }

  /** The beacons' pedestals of the road `graph` (in the middle of the road at every place). */
  addBeacons(graph: RoadGraph): void {
    for (const b of graph.net.beacons) {
      const st = graph.net.roads[b.road].stations[b.station];
      this.fixed.push({ x: st.x, y: st.h + LIFT, z: st.z, r: 0.8, vx: 0, vz: 0, who: 'beacon' });
    }
  }

  /** A person of group `who` at (x, y, z) (walking at (vx, vz)): others keep out of their way. */
  add(who: string, x: number, y: number, z: number, vx = 0, vz = 0): void {
    let o = this.people[this.used];
    if (!o) this.people.push((o = { x: 0, y: 0, z: 0, r: PERSON_R, vx: 0, vz: 0, who }));
    this.used++;
    o.who = who;
    o.x = x;
    o.y = y;
    o.z = z;
    o.vx = vx;
    o.vz = vz;
    this.list.push(o);
  }

  /**
   * The lane for someone of group `who` at `s` on `route`, walking it
   * `dir` (±1), who likes lane `prefer` (m left of their way), looking
   * `look` m ahead. `polite`: stop at the side for the explorer walking up
   * towards them.
   */
  lane(route: Route, s: number, dir: 1 | -1, prefer: number, look: number, who: string, ground: Ground | null, polite = true): LaneChoice {
    const c = route.at(s, 0, P);
    const tx = Math.sin(c.yaw!) * dir;
    const tz = Math.cos(c.yaw!) * dir;
    let n = 0;
    let explorer: Obstacle | null = null;
    let yieldTo = false;
    let onlyPeople = true;
    let backOff = false;
    for (const o of this.list) {
      if (o.who === who || Math.abs(o.y - c.y) > 3) continue;
      const dx = o.x - c.x;
      const dz = o.z - c.z;
      const along = dx * tx + dz * tz;
      if (along < -(o.r + PERSON_R) || along > look + o.r) continue;
      const side = dx * tz - dz * tx;
      if (Math.abs(side) > VERGE + o.r + 1) continue;
      AHEAD[n * 3] = along;
      AHEAD[n * 3 + 1] = side;
      AHEAD[n * 3 + 2] = o.r;
      n++;
      if (o.who === 'explorer' || o.who === 'animal' || o.who === 'beacon') onlyPeople = false;
      if (o.who === 'animal' && along < look * 0.8 && -(o.vx * tx + o.vz * tz) > 0.2) backOff = true;
      if (o === this.explorer) {
        explorer = o;
        // Walking up the road towards us: stop at the side and let him pass (standing, he is walked round).
        const closing = -(o.vx * tx + o.vz * tz);
        if (polite && along > -0.5 && along < 9 && closing > 0.4) yieldTo = true;
      }
      if (n >= 16) break;
    }
    if (!n) return { side: prefer, wait: false, explorer: null, onlyPeople: false, backOff: false, obstacle: false };
    // Lanes to try: the usual one first, then the road's middle and edges, then the verges (where there is room).
    LANES[0] = prefer;
    let best = prefer;
    let bestCost = Infinity;
    let widest = prefer;
    let widestGap = -Infinity;
    for (let k = 0; k < LANES.length; k++) {
      const side = LANES[k];
      let gap = Infinity;
      for (let j = 0; j < n; j++) gap = Math.min(gap, Math.abs(side - AHEAD[j * 3 + 1]) - AHEAD[j * 3 + 2] - PERSON_R);
      if (Math.abs(side) > ROAD_HALF && ground) {
        const q = route.at(s + dir * 1.5, side * dir, Q);
        if (!ground.free(q.x, q.z, c.y)) continue;
      }
      if (gap > widestGap) {
        widestGap = gap;
        widest = side;
      }
      const cost = Math.abs(side - prefer) + (Math.abs(side) > ROAD_HALF ? 1.5 : 0);
      if (gap > 0.3 && cost < bestCost) {
        bestCost = cost;
        best = side;
      }
    }
    if (yieldTo) {
      // Step to the side away from him, and wait there.
      const ex = explorer!;
      const exSide = (ex.x - c.x) * tz - (ex.z - c.z) * tx;
      let side = exSide > 0 ? -1.55 : 1.55;
      if (Math.abs(exSide) < 0.6) side = prefer < 0 ? -1.55 : 1.55;
      return { side, wait: true, explorer, onlyPeople: false, backOff: false, obstacle: true };
    }
    if (bestCost === Infinity) return { side: widest, wait: true, explorer, onlyPeople, backOff, obstacle: true };
    return { side: best, wait: false, explorer, onlyPeople, backOff: false, obstacle: true };
  }
}

const P: Point & { yaw?: number } = { x: 0, y: 0, z: 0 };
const Q: Point & { yaw?: number } = { x: 0, y: 0, z: 0 };
const AHEAD = new Float32Array(48);
const LANES = [0, -0.9, 0.9, 0, -1.55, 1.55, -VERGE, VERGE];
