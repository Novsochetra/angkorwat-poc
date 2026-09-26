import { eventsNow } from '../events';
import type { MapFrame } from '../types';
import { Actor } from './_actor';
import { dress } from './_kinds';
import { CARRY, POSE, type Look } from './_personModel';
import { Route, ROAD_HALF, type Obstacle, type Point, type Traffic } from './_routes';
import { BACK_OFF, GONE, isEvening, isMorning, STANDOFF, STANDOFF_LONG, type PeopleEnv, type PeopleScene } from './_scene';

/**
 * The monks of Angkor Wat.
 *
 * - **The procession**: five monks (an elder in front, two monks, two
 *   novices) walk single file, slowly, up the valley road to Angkor Wat's
 *   gate and in; after a while they come out and walk back down to the
 *   village at the road's south end, and so on through the day. In the
 *   morning (dawn to mid-morning) they only walk up, carrying their alms
 *   bowls; later in the day they carry saffron umbrellas against the sun.
 *   At night they are inside. They keep to the right of the road, go round
 *   the beacons and whoever stands in the way, and stop at the roadside to
 *   let the explorer pass when he walks up towards them; as he passes a
 *   monk nods to him, or greets him with a sampeah when they have stopped.
 * - **The sweeper**: a monk sweeping the stone landing below the gate's
 *   beacon, across the road and back, straightening up now and then; he
 *   greets the explorer with a sampeah. He goes in at dusk and comes out
 *   at dawn.
 *
 * Shots: `monks=<m>` puts the procession's leader that many metres below
 * the gate, walking up.
 */

/** Walking speed (m/s), the gap between monks (m), how many. */
const SPEED = 0.55;
const GAP = 2.3;
const FILE = 5;
/** Dark enough to go in / light enough to come out (`night`). */
const DARK = 0.62;
const LIGHT = 0.55;
/** In the evening they do not set out once `night` is past this. */
const EVENING = 0.12;
/** Seconds inside the temple, and at the village, between walks. */
const IN_TEMPLE = 80;
const IN_VILLAGE = 45;
/** The explorer this near: a nod (m); not again for this long (s). */
const NOD_AT = 3.6;
const NOD_EVERY = 45;
/** The gate's glowing door (sanctuary.ts: the passage floor at 58, the door at z −169). */
const DOOR: Point = { x: 0, y: 58, z: -170.4 };

interface Member {
  a: Actor;
  s: number;
  /** Lane (m to the left of the way they walk) and where it is going. */
  lane: number;
  looks: [Look, Look];
  nodAt: number;
  /** Standing aside for the explorer. */
  hold: boolean;
}

export class Monks implements PeopleScene {
  readonly name = 'monks';
  readonly actors: Actor[] = [];
  private readonly route: Route;
  private readonly members: Member[] = [];
  private mode: 'out' | 'in' = 'in';
  private dir: 1 | -1 = 1;
  private door: 'temple' | 'village' = 'village';
  private timer = 0;
  /** How long they have waited for other people (a stand-off ends after a few seconds). */
  private stuck = 0;
  private started = false;
  /** Out in the morning (alms bowls), and the rain on (umbrellas up, whatever the hour: `EVENTS.umbrellas`). */
  private morning = false;
  private wet = false;
  private readonly sweeper: Sweeper;
  private readonly tmp: Point & { yaw?: number } = { x: 0, y: 0, z: 0 };

  constructor(private readonly env: PeopleEnv) {
    const { crowd, graph, ground } = env;
    const road = graph.road(0);
    this.route = road.extend(DOOR);
    for (let k = 0; k < FILE; k++) {
      const young = k >= 3;
      const seed = 101 + k;
      const looks: [Look, Look] = [dress('monk', seed, { carry: CARRY.bowl, young }), dress('monk', seed, { carry: CARRY.umbrella, young })];
      const a = new Actor(crowd, looks[0], ground).avoid(env.traffic, this.name);
      this.members.push({ a, s: 0, lane: -0.9, looks, nodAt: -1e9, hold: false });
      this.actors.push(a);
    }
    this.sweeper = new Sweeper(env, this.route, road.len);
    this.actors.push(this.sweeper.a);
  }

  /** Where the procession is at time `t` if nothing got in its way (the start of a live page or a shot). */
  private begin(now: number, f: MapFrame): void {
    const L = this.route.len;
    const walk = L / SPEED;
    const q = this.env.params.get('monks');
    if (f.night > DARK) {
      this.goIn('village', 1);
      return;
    }
    const morning = isMorning(f.clock);
    // (so a page opens on them climbing the summit's long stair)
    let u = now + (L - 110) / SPEED;
    if (q !== null) u = (L - Math.max(0, Number(q) || 0)) / SPEED;
    const cycle = morning ? walk + IN_TEMPLE : 2 * walk + IN_TEMPLE + IN_VILLAGE;
    u = ((u % cycle) + cycle) % cycle;
    if (u < walk) this.goOut(1, u * SPEED, morning);
    else if (u < walk + IN_TEMPLE) this.goIn('temple', walk + IN_TEMPLE - u);
    else if (u < 2 * walk + IN_TEMPLE) this.goOut(-1, L - (u - walk - IN_TEMPLE) * SPEED, morning);
    else this.goIn('village', cycle - u);
  }

  private goIn(door: 'temple' | 'village', wait: number): void {
    this.mode = 'in';
    this.door = door;
    this.timer = wait;
    for (const m of this.members) m.a.hide();
  }

  /** Out of a door (dir 1: up from the village; −1: down from the temple), the leader at `s`. */
  private goOut(dir: 1 | -1, s: number, morning: boolean): void {
    this.mode = 'out';
    this.dir = dir;
    this.morning = morning;
    this.members.forEach((m, k) => {
      m.s = s - dir * k * GAP;
      m.lane = -0.9;
      m.a.hide();
    });
    this.dressAll();
  }

  /** Bowls in the morning, else umbrellas (against the sun, or the rain). */
  private dressAll(): void {
    for (const m of this.members) {
      const look = m.looks[this.morning && !this.wet ? 0 : 1];
      if (m.a.look !== look) {
        m.a.look = look;
        this.env.crowd.dress(m.a.i, look);
      }
    }
  }

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    if (!this.started) {
      this.started = true;
      this.begin(now, f);
    }
    this.sweeper.update(dt, now, f, ex);
    const L = this.route.len;
    // (rain: umbrellas up, down again when it has passed)
    const u = eventsNow(f).umbrellas;
    if (this.wet ? u < 0.3 : u > 0.5) {
      this.wet = !this.wet;
      this.dressAll();
    }
    if (this.mode === 'in') {
      this.timer -= dt;
      // (no setting out with the evening coming: they stay in for the night)
      if (f.night > LIGHT || (isEvening(f.clock) && f.night > EVENING)) this.timer = Math.max(this.timer, 1);
      if (this.timer <= 0) {
        const morning = isMorning(f.clock);
        const dir = morning || this.door === 'village' ? 1 : -1;
        this.goOut(dir, dir === 1 ? 0 : L, morning);
      }
      return;
    }
    // (deep in the night, whoever is still out has got home: this happens only with the fast day cycle)
    if (f.night > GONE) return this.goIn(this.dir === 1 ? 'temple' : 'village', 1);
    const { traffic, ground } = this.env;
    const dir = this.dir;
    // ── The leader picks the lane (round the beacons, the explorer, other groups), or waits. ──
    const lead = this.members[0];
    const choice = traffic.lane(this.route, clamp(lead.s, 0, L), dir, -0.9, 7, this.name, ground);
    this.stuck = choice.wait && !choice.explorer ? this.stuck + dt : 0;
    // (and for anyone left behind)
    const lag = this.members.some((m) => m.a.shown && m.a.behind > 2.5);
    const waiting = ((choice.wait && this.stuck < (choice.onlyPeople ? STANDOFF : STANDOFF_LONG)) || lag) && lead.s > 0 && lead.s < L;
    if (!waiting) lead.s += dir * SPEED * dt;
    // (an elephant coming down the road at them, and no way past: back off before it)
    else if (choice.backOff) lead.s -= dir * BACK_OFF * dt;
    lead.lane = ease(lead.lane, taper(choice.side, lead.s, L), dt, waiting || choice.obstacle);
    lead.hold = waiting && !!choice.explorer;
    for (let k = 1; k < FILE; k++) {
      const m = this.members[k];
      const ahead = this.members[k - 1];
      // Each keeps out of the way on their own too: the lane the monk ahead took, unless it is not clear
      // here, and a step aside (and a pause) when the explorer walks up to them.
      const own = m.s > 0 && m.s < L ? traffic.lane(this.route, m.s, dir, ahead.lane, 7, this.name, ground) : null;
      m.hold = !!own && own.wait && !!own.explorer;
      const gap = (ahead.s - dir * GAP - m.s) * dir;
      if (gap > 0 && !m.hold) m.s += dir * Math.min(gap, SPEED * 1.25 * dt);
      if (own?.wait && own.backOff) m.s -= dir * BACK_OFF * dt;
      // (never onto the monk ahead: backing off pushes the ones behind back too)
      if ((ahead.s - m.s) * dir < GAP * 0.6) m.s = ahead.s - dir * GAP * 0.6;
      // (quick round what is in the way)
      m.lane = ease(m.lane, taper(own && (!own.wait || own.explorer) ? own.side : ahead.lane, m.s, L), dt, m.hold || waiting || !!own?.obstacle);
    }
    // ── Place them; in and out of the doors ──
    const p = this.tmp;
    let allIn = true;
    for (const m of this.members) {
      const inside = m.s < 0 || m.s > L - 0.3;
      const passed = dir === 1 ? m.s > L - 0.3 : m.s < 0;
      if (!passed) allIn = false;
      if (inside) {
        if (m.a.shown) m.a.hide();
        continue;
      }
      this.route.at(m.s, m.lane * dir, p);
      if (!m.a.shown) {
        m.a.warp(p.x, p.y, p.z, this.route.yawAt(m.s, dir));
        m.a.show();
        m.a.pose(POSE.stand, now);
        m.a.carry(1, now);
      }
      // (quick when stepping aside or backing off before an elephant)
      m.a.goTo(p.x, p.z, m.hold || waiting ? 1.5 : SPEED * 1.4);
      m.a.face(m.hold && ex ? m.a.yawTo(ex.x, ex.z) : null);
      this.greet(m, now, f, ex, m.hold);
      m.a.step(dt, now);
    }
    // (night falling on the road: they carry on to the door at the same pace)
    if (allIn) this.goIn(dir === 1 ? 'temple' : 'village', dir === 1 ? IN_TEMPLE : IN_VILLAGE);
  }

  /** A nod as the explorer passes, a sampeah while they stand aside for him. */
  private greet(m: Member, now: number, f: MapFrame, ex: Obstacle | null, waiting: boolean): void {
    const a = m.a;
    if (!ex || f.night > 0.7) {
      if (a.currentPose === POSE.sampeah && now > m.nodAt + 2.2) a.pose(POSE.stand, now);
      return;
    }
    const d = a.dist(ex.x, ex.z);
    if (d < NOD_AT && now - m.nodAt > NOD_EVERY && Math.abs(ex.y - a.y) < 2.5) {
      m.nodAt = now;
      a.lookAt({ x: ex.x, y: ex.y + 2, z: ex.z }, now + 2.4);
      if (waiting) {
        a.pose(POSE.sampeah, now);
        a.carry(0, now);
      }
    }
    // The nod: head down for a moment while looking at him.
    const since = now - m.nodAt;
    a.tilt(since > 0.4 && since < 1.2 && !waiting ? 0.7 : 0);
    if (since > 2.2 && a.currentPose === POSE.sampeah) {
      a.pose(POSE.stand, now);
      a.carry(1, now);
    }
  }

  report(traffic: Traffic): void {
    for (const m of this.members) if (m.a.shown) traffic.add(this.name, m.a.x, m.a.y, m.a.z);
    this.sweeper.report(traffic);
  }
}

/** Eases a lane towards `to` (lateral steps of 0.9 m/s; `quick`: stepping aside, 1.6 m/s). */
function ease(from: number, to: number, dt: number, quick = false): number {
  const k = (quick ? 1.6 : 0.9) * dt;
  return from + Math.max(-k, Math.min(k, to - from));
}

/** Lanes narrow to the middle over the last metres into a door. */
function taper(lane: number, s: number, len: number): number {
  return lane * Math.max(0, Math.min(1, (len - s) / 3.5));
}

function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

// ── The sweeper ─────────────────────────────────────────────────────────────

/** Where he sweeps: this far below the road's end (m, along it), rows this far apart. */
const SWEEP_FROM = 12.5;
const SWEEP_ROW = 0.9;
/** Half a cycle: across the road (s), then a pause (s). */
const ACROSS = 24;
const PAUSE = 5;

class Sweeper {
  readonly a: Actor;
  private mode: 'sweep' | 'in' | 'toDoor' | 'fromDoor' = 'in';
  /** His own clock through the sweeping (it stops while he greets). */
  private sc = 0;
  private started = false;
  private greetAt = -1e9;
  private s = 0;
  private readonly tmp: Point & { yaw?: number } = { x: 0, y: 0, z: 0 };

  constructor(
    env: PeopleEnv,
    private readonly route: Route,
    /** Length of the road itself (the route goes on into the gate). */
    private readonly roadLen: number,
  ) {
    this.a = new Actor(env.crowd, dress('monk', 207, { carry: CARRY.broom }), env.ground).avoid(env.traffic, 'sweeper');
  }

  /** The spot and facing of the sweeping at his clock `sc`. */
  private spot(sc: number, out: Point & { yaw?: number }): { sweeping: boolean; yaw: number } {
    const half = ACROSS + PAUSE;
    const k = Math.floor(sc / half);
    const u = sc - k * half;
    const row = ((k >> 1) % 3) * SWEEP_ROW + (k & 1) * SWEEP_ROW * 0.5;
    const back = (k & 1) === 1;
    const w = ROAD_HALF - 0.45;
    const x = Math.min(1, u / ACROSS);
    const lane = back ? w - 2 * w * x : -w + 2 * w * x;
    const s = this.roadLen - SWEEP_FROM - row;
    this.route.at(s, lane, out);
    this.s = s;
    // (facing across the road, the way he sweeps; between rows, up the road to the gate)
    const sweeping = u < ACROSS;
    const yaw = sweeping ? out.yaw! + (back ? Math.PI / 2 : -Math.PI / 2) : out.yaw!;
    return { sweeping, yaw };
  }

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    const a = this.a;
    const p = this.tmp;
    if (!this.started) {
      this.started = true;
      this.sc = (now * 0.93 + 13) % 1e5;
      if (f.night <= DARK) {
        this.mode = 'sweep';
        this.spot(this.sc, p);
        a.warp(p.x, p.y, p.z, p.yaw!);
        a.show();
      }
    }
    if (this.mode === 'in') {
      if (f.night < LIGHT) {
        this.mode = 'fromDoor';
        this.route.at(this.route.len - 0.4, 0, p);
        a.warp(p.x, p.y, p.z, this.route.yawAt(this.route.len, -1));
        a.show();
        a.pose(POSE.stand, now);
        a.carry(1, now);
      } else return;
    }
    if (this.mode === 'sweep' && f.night > DARK) this.mode = 'toDoor';
    if (this.mode === 'toDoor') {
      this.route.at(this.route.len, 0, p);
      a.pose(POSE.stand, now);
      a.carry(1, now);
      a.goTo(p.x, p.z, 0.6);
      a.step(dt, now);
      if (a.dist(p.x, p.z) < 0.4) {
        this.mode = 'in';
        a.hide();
      }
      return;
    }
    const { sweeping, yaw } = this.spot(this.sc, p);
    if (this.mode === 'fromDoor') {
      a.goTo(p.x, p.z, 0.6);
      a.step(dt, now);
      if (a.dist(p.x, p.z) < 0.3) this.mode = 'sweep';
      return;
    }
    // Greets the explorer: straightens up, turns to him, sampeah, then back to work.
    if (ex && a.dist(ex.x, ex.z) < 4.2 && now - this.greetAt > 60 && Math.abs(ex.y - a.y) < 2.5) this.greetAt = now;
    const g = now - this.greetAt;
    if (ex && g < 3.2) {
      a.stop(a.yawTo(ex.x, ex.z));
      a.lookAt({ x: ex.x, y: ex.y + 2, z: ex.z }, now + 0.2);
      a.pose(g > 0.6 && g < 2.6 ? POSE.sampeah : POSE.stand, now);
      a.carry(g > 0.6 && g < 2.6 ? 0 : 1, now);
      a.step(dt, now);
      return;
    }
    this.sc += dt;
    a.lookAt(null);
    a.carry(1, now);
    a.pose(sweeping ? POSE.sweep : POSE.stand, now);
    a.goTo(p.x, p.z, sweeping ? 0.2 : 0.5);
    a.face(yaw);
    a.step(dt, now);
  }

  report(traffic: Traffic): void {
    if (this.a.shown) traffic.add('sweeper', this.a.x, this.a.y, this.a.z);
  }

  /** How far along the procession's road he is (m). */
  get along(): number {
    return this.s;
  }
}
