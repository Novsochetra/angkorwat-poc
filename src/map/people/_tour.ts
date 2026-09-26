import { hash3 } from '../../voxel/random';
import type { MapFrame, PlaceId } from '../types';
import { eventsNow } from '../events';
import { Actor, RAIN_PACE, wrap } from './_actor';
import { dress } from './_kinds';
import { CARRY, FEAT, POSE, SLOT, type Look, type Pose } from './_personModel';
import { Route, type Beacon, type LaneChoice, type Obstacle, type Point, type Traffic } from './_routes';
import { BACK_OFF, GONE, isEvening, STANDOFF, STANDOFF_LONG, type PeopleEnv, type PeopleScene } from './_scene';

/**
 * A group of visitors with their guide.
 *
 * The guide walks ahead holding up a small flag of Cambodia; seven
 * visitors (all sorts, from everywhere) follow in pairs. They go round the
 * temples on the roads: the River Gate, Preah Khan, Angkor Wat, and back to
 * the River Gate. At each temple's beacon they stop for a while: the guide
 * turns to the group, lowers the flag and talks, now and then turning to
 * point at the temple; the visitors listen, look up, point and take photos;
 * then there is a little time for photos, the flag goes up again and they
 * walk on. At dusk they walk home (off the road's south end, towards the
 * village) and come back in the morning.
 *
 * When the explorer comes near, the guide greets him ("ជម្រាបសួរ" /
 * "Hello!" in a small bubble, with a sampeah) and a visitor waves; not
 * again for two minutes. On the road they let him pass like everyone else.
 *
 * Shots: `tour=<place>` starts them at that temple's stop (`tour=<place>:<s>`
 * that many seconds into it: 0‥5 gathering, ‥46 the talk, ‥64 photos, ‥70
 * setting off).
 */

/** Walking speed (m/s); seconds at each temple; where the guide stops before the beacon (m, clear of its disc). */
const SPEED = 0.85;
const STOP = 70;
const STOP_BEFORE = 3.8;
/** The temples they visit, in order (a loop). */
const LOOP: PlaceId[] = ['rivergate', 'shrine', 'sanctuary'];
/** Height over each temple's pad the visitors look up to (m). */
const LOOK_UP: Partial<Record<PlaceId, number>> = { sanctuary: 32, shrine: 7, rivergate: 9, overlook: 14, terrace: 10, kulen: 12 };
/** Where an elephant will be (s ahead) when the standing group gives way. */
const GIVE_WAY_AHEAD = [0, 1.5, 3];
/** Evening dark enough to go home; light enough to come back (`night`). */
const HOME_AT = 0.3;
/** The explorer this near: the guide greets him (m); not again for this long (s). */
const GREET_AT = 7;
const GREET_EVERY = 120;
/** Someone this far behind their place in the group (m): the group waits. */
const LAG = 3.5;
/** Where they stand at a stop: behind the guide (m) and across the road (m). */
const SPOTS: [number, number][] = [
  [2.2, -1.6],
  [2.6, -0.55],
  [2.6, 0.55],
  [2.2, 1.6],
  [3.9, -1.1],
  [4.0, 0],
  [3.9, 1.1],
];

type Seg = { kind: 'walk'; route: Route; to: Beacon } | { kind: 'stop'; b: Beacon; route: Route };

interface Visitor {
  a: Actor;
  s: number;
  lane: number;
}

export class Tour implements PeopleScene {
  readonly name = 'tour';
  readonly actors: Actor[] = [];
  private readonly guide: Actor;
  private readonly visitors: Visitor[] = [];
  private readonly loop: Seg[] = [];
  private mode: 'loop' | 'home' | 'in' | 'out' = 'in';
  private seg = 0;
  /** Along the walk (m), or into the stop (s). */
  private s = 0;
  private u = 0;
  private lane = -0.5;
  private route: Route | null = null;
  /** At a stop: which way the next leg sets off, and whether that is back the way they came. */
  private onward = 0;
  private turn = false;
  private started = false;
  /** Umbrellas up (`EVENTS.umbrellas`): everyone's look for the rain and for dry weather (as `actors`). */
  private wet = false;
  private readonly rainLooks: Look[];
  private readonly dryLooks: Look[];
  private greetAt = -1e9;
  private stuck = 0;
  /** At a stop: how far the group has moved along the road to let an elephant by (m). */
  private shift = 0;
  private waver = -1;
  private readonly home: [number, number];
  private readonly tmp: Point & { yaw?: number } = { x: 0, y: 0, z: 0 };
  // (per-frame scratch: lane choices, look points; `lookAt` copies its point)
  private readonly choiceBuf: LaneChoice = { side: 0, wait: false, explorer: null, onlyPeople: false, backOff: false, obstacle: false };
  private readonly ownBuf: LaneChoice = { side: 0, wait: false, explorer: null, onlyPeople: false, backOff: false, obstacle: false };
  private readonly lookBuf: Point = { x: 0, y: 0, z: 0 };
  private readonly headBuf: Point = { x: 0, y: 0, z: 0 };

  constructor(private readonly env: PeopleEnv) {
    const { crowd, graph, ground } = env;
    this.guide = new Actor(crowd, dress('guide', 301), ground).avoid(env.traffic, this.name);
    const who: ['f' | 'm', 'young' | 'old' | undefined][] = [
      ['f', undefined],
      ['m', undefined],
      ['f', 'old'],
      ['m', 'old'],
      ['f', 'young'],
      ['m', 'young'],
      ['f', undefined],
    ];
    who.forEach(([sex, age], k) => this.visitors.push({ a: new Actor(crowd, dress('visitor', 311 + k * 3, { sex, age }), ground).avoid(env.traffic, this.name), s: 0, lane: 0 }));
    this.actors.push(this.guide, ...this.visitors.map((v) => v.a));
    // (in the rain the guide's flag gives way to an umbrella, and most visitors open one; two just walk quicker)
    this.dryLooks = this.actors.map((a) => a.look);
    this.rainLooks = this.actors.map((a, k) =>
      k === 0 ? dress('guide', 301, { carry: CARRY.umbrella }) : k % 4 === 3 ? a.look : withUmbrella(a.look, RAIN_UMBRELLAS[k % RAIN_UMBRELLAS.length]),
    );
    const beacons = LOOP.map((id) => graph.beacon(id)).filter((b): b is Beacon => !!b);
    beacons.forEach((b, k) => {
      const next = beacons[(k + 1) % beacons.length];
      const prev = beacons[(k + beacons.length - 1) % beacons.length];
      const leg = graph.route([b.x, b.z], [next.x, next.z]);
      // (the stop is on the way in: the last leg's line)
      this.loop.push({ kind: 'stop', b, route: graph.route([prev.x, prev.z], [b.x, b.z]) });
      this.loop.push({ kind: 'walk', route: leg, to: next });
    });
    const st = graph.net.roads[0].stations[0];
    this.home = [st.x, st.z];
  }

  private get people(): Actor[] {
    return [this.guide, ...this.visitors.map((v) => v.a)];
  }

  private duration(seg: Seg): number {
    return seg.kind === 'stop' ? STOP : seg.route.len / SPEED;
  }

  /** Where the tour is at time `now` if nothing got in its way. */
  private begin(now: number, f: MapFrame): void {
    if (f.night > HOME_AT && isEvening(f.clock)) return this.goIn();
    if (f.night > 0.6) return this.goIn();
    const q = this.env.params.get('tour');
    const total = this.loop.reduce((t, g) => t + this.duration(g), 0);
    let u = (((now + 150) % total) + total) % total;
    if (q) {
      const [id, at] = q.split(':');
      const k = this.loop.findIndex((g) => g.kind === 'stop' && g.b.id === id);
      if (k >= 0) u = this.loop.slice(0, k).reduce((t, g) => t + this.duration(g), 0) + (at !== undefined ? Number(at) || 0 : 20);
    }
    this.mode = 'loop';
    this.seg = 0;
    while (u >= this.duration(this.loop[this.seg])) {
      u -= this.duration(this.loop[this.seg]);
      this.seg = (this.seg + 1) % this.loop.length;
    }
    this.enter(this.seg, u, true);
  }

  /** Start segment `k`, `u` seconds into it (`warp`: put everyone in place at once). */
  private enter(k: number, u: number, warp: boolean): void {
    this.seg = k;
    const seg = this.loop[k];
    const p = this.tmp;
    if (seg.kind === 'stop') {
      this.u = u;
      // (the group stands on the road they came by: the loop's leg in, or the way out of the village)
      if (warp || !this.route) {
        this.route = seg.route;
        this.s = seg.route.len - STOP_BEFORE;
      }
      const next = this.loop[(k + 1) % this.loop.length].route;
      const at = this.route.at(this.s, 0, p);
      this.onward = next.yawAt(Math.min(next.len, next.nearest(at.x, at.z) + 3));
      this.turn = Math.abs(wrap(this.onward - this.route.yawAt(this.s))) > Math.PI / 2;
      if (warp) {
        this.place(this.guide, p, seg.route.yawAt(this.s, -1));
        this.visitors.forEach((v, j) => {
          const [back, side] = SPOTS[j];
          v.s = this.s - back;
          v.lane = side;
          seg.route.at(v.s, side, p);
          this.place(v.a, p, v.a.yawTo(this.guide.x, this.guide.z));
        });
      }
    } else {
      this.route = seg.route;
      this.s = Math.min(seg.route.len, u * SPEED);
      if (warp) {
        seg.route.at(this.s, this.lane, p);
        this.place(this.guide, p, seg.route.yawAt(this.s));
        this.visitors.forEach((v, j) => {
          v.s = Math.max(0, this.s - this.behind(j));
          v.lane = this.lane + this.across(j);
          seg.route.at(v.s, v.lane, p);
          this.place(v.a, p, seg.route.yawAt(v.s));
        });
      } else {
        // (setting off from the stop: from where the guide stands)
        this.s = seg.route.nearest(this.guide.x, this.guide.z);
        for (const v of this.visitors) v.s = seg.route.nearest(v.a.x, v.a.z);
      }
    }
  }

  private place(a: Actor, p: Point, yaw: number): void {
    a.warp(p.x, p.y, p.z, yaw);
    a.show();
  }

  /** Walking: visitor `j` this far behind the guide (m), and to the side of his lane. */
  private behind(j: number): number {
    return 2.0 + 1.25 * Math.floor(j / 2);
  }
  private across(j: number): number {
    return j === 6 ? 0 : j % 2 ? 0.55 : -0.55;
  }

  private goIn(): void {
    this.mode = 'in';
    for (const a of this.people) a.hide();
  }

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    if (!this.started) {
      this.started = true;
      this.begin(now, f);
    }
    // Rain: umbrellas up (down again once it has passed).
    const u = eventsNow(f).umbrellas;
    if (this.wet ? u < 0.3 : u > 0.5) {
      this.wet = !this.wet;
      const looks = this.wet ? this.rainLooks : this.dryLooks;
      this.actors.forEach((a, k) => {
        a.look = looks[k];
        this.env.crowd.dress(a.i, a.look);
        if (k > 0) a.carry(this.wet && a.look.carry === CARRY.umbrella ? 1 : 0, now);
      });
    }
    const evening = f.night > HOME_AT && isEvening(f.clock);
    if (this.mode !== 'in' && f.night > GONE) this.goIn();
    if (this.mode === 'in') {
      if (evening || f.night > HOME_AT) return;
      // Morning: out from the village, to the River Gate's stop, then round the loop.
      this.mode = 'out';
      const first = this.loop.findIndex((g) => g.kind === 'stop' && g.b.id === LOOP[0]);
      const b = (this.loop[first] as { b: Beacon }).b;
      this.route = this.env.graph.route(this.home, [b.x, b.z]);
      this.s = 0;
      this.visitors.forEach((v, j) => (v.s = -this.behind(j)));
    }
    if (evening && (this.mode === 'loop' || this.mode === 'out')) {
      this.mode = 'home';
      this.route = this.env.graph.route([this.guide.x, this.guide.z], this.home);
      this.s = 0;
      for (const v of this.visitors) v.s = this.route.nearest(v.a.x, v.a.z);
    }
    // The greeting (it holds the group for a moment).
    const greeting = this.greet(now, ex);
    const seg = this.mode === 'loop' ? this.loop[this.seg] : null;
    if (seg && seg.kind === 'stop') this.atStop(dt, now, seg, greeting);
    else this.walk(dt, now, greeting, ex);
  }

  /** Walking a leg (or home, or out of the village): the guide leads, the pairs follow. */
  private walk(dt: number, now: number, greeting: number, ex: Obstacle | null): void {
    const route = this.route!;
    const { traffic, ground } = this.env;
    const L = route.len;
    // (going home they walk on off the road's end, one after another)
    const home = this.mode === 'home';
    const end = home ? L + 8 : L - STOP_BEFORE;
    const choice = traffic.lane(route, Math.min(this.s, L), 1, -0.5, 7, this.name, ground, true, this.choiceBuf);
    this.stuck = choice.wait && !choice.explorer ? this.stuck + dt : 0;
    // (and for anyone left behind)
    let lag = false;
    for (const a of this.people) if (a.shown && a.behind > LAG) { lag = true; break; }
    const hold = (choice.wait && this.stuck < (choice.onlyPeople ? STANDOFF : STANDOFF_LONG)) || greeting >= 0 || lag;
    if (!hold) this.s = Math.min(end, this.s + SPEED * RAIN_PACE.hurry * dt);
    else if (choice.backOff) this.s = Math.max(0, this.s - BACK_OFF * dt);
    const k = 0.9 * dt;
    this.lane += Math.max(-k, Math.min(k, choice.side - this.lane));
    const p = this.tmp;
    const g = this.guide;
    if (home && this.s > L - 0.3) {
      if (g.shown) g.hide();
    } else if (greeting < 0) {
      route.at(this.s, this.lane, p);
      if (!g.shown) this.place(g, p, route.yawAt(this.s));
      g.goTo(p.x, p.z, hold ? 1.5 : SPEED * 1.4);
      g.face(hold && ex ? g.yawTo(ex.x, ex.z) : null);
      g.pose(POSE.stand, now);
      g.carry(1, now);
      g.lookAt(null);
    }
    if (g.shown) g.step(dt, now);
    // (plain loops, no closures: this runs every frame)
    const visitors = this.visitors;
    for (let j = 0; j < visitors.length; j++) {
      const v = visitors[j];
      const want = this.s - this.behind(j);
      if (want > v.s) v.s = Math.min(want, v.s + SPEED * 1.4 * RAIN_PACE.hurry * dt);
      // (backing off before an elephant: the pairs behind give way too)
      else if (want < v.s - 0.6) v.s = Math.max(want, v.s - BACK_OFF * 1.1 * dt);
      // (beside the guide's lane, on the paving; off it only where lane() found the verge clear)
      const pair = Math.max(-1.7, Math.min(1.7, this.lane + this.across(j)));
      const own = v.s > 0 ? traffic.lane(route, v.s, 1, pair, 3, this.name, ground, false, this.ownBuf) : null;
      const lane = own && !own.wait ? own.side : pair;
      v.lane += Math.max(-k, Math.min(k, lane - v.lane));
      const a = v.a;
      if (v.s < 0 || (home && v.s > L - 0.3)) {
        if (a.shown) a.hide();
        continue;
      }
      route.at(v.s, v.lane, p);
      if (!a.shown) this.place(a, p, route.yawAt(v.s));
      a.goTo(p.x, p.z, hold ? 1.5 : SPEED * 1.5);
      a.face(hold && ex ? a.yawTo(ex.x, ex.z) : null);
      if (j !== this.waver || greeting < 0) {
        a.pose(POSE.stand, now);
        // (near the next temple they look at it)
        const b = this.mode === 'loop' ? (this.loop[this.seg] as { to?: Beacon }).to : undefined;
        if (b && this.s > L - 40) a.lookAt(this.lookPoint(b), now + 1);
        else a.lookAt(null);
      }
      a.step(dt, now);
    }
    if (!(this.s >= end - 0.05)) return;
    for (let j = 0; j < visitors.length; j++) if (!(visitors[j].s >= this.s - this.behind(j) - 0.3)) return;
    this.arrive();
  }

  private arrive(): void {
    if (this.mode === 'home') return this.goIn();
    if (this.mode === 'out') {
      this.mode = 'loop';
      const first = this.loop.findIndex((g) => g.kind === 'stop' && g.b.id === LOOP[0]);
      this.enter(first, 0, false);
      return;
    }
    this.enter((this.seg + 1) % this.loop.length, 0, false);
  }

  /** The temple a visitor looks up at (a shared buffer: `lookAt` copies it). */
  private lookPoint(b: Beacon): Point {
    const q = this.lookBuf;
    q.x = b.temple.x;
    q.y = b.temple.y + (LOOK_UP[b.id] ?? 10);
    q.z = b.temple.z;
    return q;
  }

  /** At a temple: the talk, photos, setting off again. */
  private atStop(dt: number, now: number, seg: Seg & { kind: 'stop' }, greeting: number): void {
    if (greeting < 0) this.u += dt;
    const u = this.u;
    const route = this.route!;
    const p = this.tmp;
    const g = this.guide;
    const temple = this.lookPoint(seg.b);
    // Giving way: an elephant on the road coming through where they stand: the group moves along the road out of its way.
    const want = this.giveWay(route);
    this.shift += Math.max(-dt, Math.min(dt, want - this.shift));
    const s0 = this.s;
    this.s = s0 + this.shift;
    // ── The guide ──
    if (greeting < 0) {
      // (setting off back the way they came: he walks round the group along the road's edge, to lead again)
      if (this.turn && u >= 61) {
        route.at(this.s - (u < 65 ? 3.2 : 6.2), u < 65 ? 2.3 : 1.0, p);
        // (by the verge if there is room, else along the paving's edge)
        if (u < 65 && !this.env.ground.free(p.x, p.z, p.y)) route.at(this.s - 3.2, 1.85, p);
      } else route.at(this.s, 0, p);
      g.goTo(p.x, p.z, SPEED * 1.2);
      const toGroup = route.yawAt(this.s, -1);
      const toTemple = g.yawTo(temple.x, temple.z);
      let pose: Pose = POSE.stand;
      let yaw = toGroup;
      let carry = 0.35;
      if (u < 3) carry = 1;
      else if (u < 46) {
        const k = (u - 5) % 12;
        const pointing = u > 5 && k > 7 && k < 10.5;
        pose = u < 5 ? POSE.stand : pointing ? POSE.point : POSE.talk;
        if (pointing) yaw = toTemple;
        g.lookAt(pointing ? temple : null);
      } else if (u < 64) {
        g.lookAt(null);
      } else {
        carry = 1;
        yaw = this.onward;
        g.lookAt(null);
      }
      g.pose(pose, now);
      g.carry(carry, now);
      g.face(yaw);
    }
    g.step(dt, now);
    // ── The visitors ──
    const guideHead = this.headBuf;
    guideHead.x = g.x;
    guideHead.y = g.y + 2.2;
    guideHead.z = g.z;
    const visitors = this.visitors;
    for (let j = 0; j < visitors.length; j++) {
      const a = visitors[j].a;
      const spot = SPOTS[j];
      route.at(this.s - spot[0], spot[1], p);
      a.goTo(p.x, p.z, SPEED * 1.3);
      if (j === this.waver && greeting >= 0) {
        a.step(dt, now);
        continue;
      }
      // Each on their own clock: listen, look up, take a photo, point.
      const slot = 6 + 4 * hash3(j, 7, 1);
      const n = Math.floor((u + j * 1.7) / slot);
      const r = hash3(j, n, this.seg, 11);
      let act: 'listen' | 'look' | 'photo' | 'point' = 'listen';
      if (u < 5 || u >= 64) act = 'listen';
      else if (u < 46) act = r < 0.5 ? 'listen' : r < 0.7 ? 'look' : r < 0.93 ? 'photo' : 'point';
      else act = r < 0.45 ? 'photo' : r < 0.75 ? 'look' : r < 0.88 ? 'point' : 'listen';
      if (u >= 64) {
        a.pose(POSE.stand, now);
        a.face(this.onward);
        a.lookAt(guideHead, now + 0.5);
      } else if (act === 'listen') {
        a.pose(POSE.stand, now);
        a.face(a.yawTo(g.x, g.z));
        a.lookAt(guideHead);
      } else {
        a.face(a.yawTo(temple.x, temple.z));
        a.pose(act === 'look' ? POSE.look : act === 'photo' ? POSE.photo : POSE.point, now);
        a.lookAt(act === 'photo' ? null : temple);
      }
      a.step(dt, now);
    }
    this.s = s0;
    if (u >= STOP) {
      this.shift = 0;
      this.enter((this.seg + 1) % this.loop.length, 0, false);
    }
  }

  /** How far to move the standing group along `route` so no elephant (now, or in 3 s) is among them (m; 0: none near). */
  private giveWay(route: Route): number {
    const lo = this.s - 4.6;
    const hi = this.s + 0.8;
    let shift = 0;
    for (const o of this.env.traffic.list) {
      if (o.who !== 'animal') continue;
      for (const ahead of GIVE_WAY_AHEAD) {
        const q = route.project(o.x + o.vx * ahead, o.z + o.vz * ahead, this.s, 16);
        if (Math.abs(q.side) > 3.2 || q.d > 16) continue;
        const a0 = q.s - o.r - 1.4;
        const a1 = q.s + o.r + 1.4;
        if (a1 < lo || a0 > hi) continue;
        // (back along the road if it is at the guide's end, else on past it)
        const s = q.s >= this.s - 2 ? a0 - hi : a1 - lo;
        if (Math.abs(s) > Math.abs(shift)) shift = s;
      }
    }
    return Math.max(-12, Math.min(8, shift));
  }

  /** The guide greets the explorer: −1 if not now, else seconds into it. */
  private greet(now: number, ex: Obstacle | null): number {
    const g = this.guide;
    if (!ex || !g.shown) return -1;
    if (now - this.greetAt > GREET_EVERY && g.dist(ex.x, ex.z) < GREET_AT && Math.abs(ex.y - g.y) < 3) {
      this.greetAt = now;
      // The visitor nearest to him waves.
      let best = Infinity;
      this.waver = -1;
      this.visitors.forEach((v, j) => {
        const d = v.a.dist(ex.x, ex.z);
        if (v.a.shown && d < best) [best, this.waver] = [d, j];
      });
      this.env.bubble.say('pplHello', () => ({ x: g.x, y: g.y + 2.9 * (g.crowd.scale(g.i) / 1.4), z: g.z }), 3.4);
    }
    const u = now - this.greetAt;
    if (u > 2.6) {
      this.waver = -1;
      return -1;
    }
    g.stop(g.yawTo(ex.x, ex.z));
    g.lookAt({ x: ex.x, y: ex.y + 2, z: ex.z }, now + 0.3);
    g.pose(u > 0.25 && u < 2.2 ? POSE.sampeah : POSE.stand, now);
    g.carry(u > 0.25 && u < 2.2 ? 0 : 1, now);
    const w = this.visitors[this.waver];
    if (w) {
      w.a.stop(w.a.yawTo(ex.x, ex.z));
      w.a.lookAt({ x: ex.x, y: ex.y + 2, z: ex.z }, now + 0.3);
      w.a.pose(u > 0.6 && u < 2.5 ? POSE.wave : POSE.stand, now);
    }
    return u;
  }

  report(traffic: Traffic): void {
    for (const a of this.people) if (a.shown) traffic.add(this.name, a.x, a.y, a.z);
  }
}

/** Rain umbrellas: dark blue, black, plum, bottle green, one yellow. */
const RAIN_UMBRELLAS = [0x2a3a5a, 0x2e2e32, 0x6a2a3a, 0x2f5a4a, 0xd8b040];

/** A visitor's look with a rain umbrella held up (their phone and anything else in the right hand put away). */
function withUmbrella(look: Look, cover: number): Look {
  if (look.carry === CARRY.umbrella) return look;
  const colors = look.colors.slice();
  colors[SLOT.prop] = cover;
  colors[SLOT.prop2] = cover + 0x181818;
  colors[SLOT.wood] = 0x3a3634;
  const feats = look.feats.filter((f) => f !== FEAT.phone && f !== FEAT.flag);
  return { ...look, colors, feats: [...feats, FEAT.umbrella], carry: CARRY.umbrella };
}
