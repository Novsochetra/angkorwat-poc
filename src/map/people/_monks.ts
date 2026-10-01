import { eventsNow } from '../events';
import { DAK, type AlmsMonk } from '../roam/_dakBatHooks';
import type { MapFrame } from '../types';
import { Actor, wrap } from './_actor';
import { dress } from './_kinds';
import { CARRY, POSE, type Look } from './_personModel';
import { Route, ROAD_HALF, type Obstacle, type Point, type Traffic } from './_routes';
import { BACK_OFF, GONE, isEvening, isMorning, STANDOFF, STANDOFF_LONG, type PeopleEnv, type PeopleScene } from './_scene';
import { AlmsBowl, OpenBowl, Receiving } from './_sceneAlms';

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
 *   monk nods to him; stopped, he turns to him with a nod and a hand raised
 *   in blessing (monks do not sampeah lay people).
 * - **The sweeper**: a monk sweeping the stone landing below the gate's
 *   beacon, across the road and back, straightening up now and then; he
 *   greets the explorer with a nod and a blessing. He goes in at dusk and comes out
 *   at dawn.
 *
 * - **Dak bat**: in the morning, carrying their bowls up the road, they
 *   take the explorer's rice (roam/_dakBat.ts, `DAK`, line `aw`): kneeling by
 *   the road ahead of them, the first monk not past him yet steps over to
 *   stand before him (the others wait), holds his bowl out and lifts its lid
 *   (people/_sceneAlms.ts `Receiving`), the monks bless him, and he steps
 *   back into the file.
 *
 * Shots: `monks=<m>` puts the procession's leader that many metres below
 * the gate, walking up; with `dakbat=1` (and `at=` by the road, in the
 * morning) they come up to him, about 7 m off.
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
/** The procession's name in `DAK` (dak bat); a monk steps over to the explorer from this near (m). */
const DAK_LINE = 'aw';
const DAK_ASIDE = 9;

interface Member {
  a: Actor;
  s: number;
  /** Lane (m to the left of the way they walk) and where it is going. */
  lane: number;
  looks: [Look, Look];
  nodAt: number;
  /** Standing aside for the explorer. */
  hold: boolean;
  /** His bowl, open for alms (dak bat), and his slot in `DAK`. */
  ob: OpenBowl;
  r: Receiving;
  slot: AlmsMonk;
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
  /** The explorer's offering (dak bat): which monk, its step and time (s), whether he stands aside before him; the ask answered last. */
  private claim: { k: number; n: number; step: 'go' | 'settle' | 'open' | 'there' | 'close' | 'bless' | 'back'; t: number; aside: boolean } | null = null;
  private taken = -1;

  constructor(private readonly env: PeopleEnv) {
    const { crowd, graph, ground } = env;
    const road = graph.road(0);
    this.route = road.extend(DOOR);
    for (let k = 0; k < FILE; k++) {
      const young = k >= 3;
      const seed = 101 + k;
      const looks: [Look, Look] = [dress('monk', seed, { carry: CARRY.bowl, young }), dress('monk', seed, { carry: CARRY.umbrella, young })];
      const a = new Actor(crowd, looks[0], ground).avoid(env.traffic, this.name);
      const ob = new OpenBowl(env.things, looks[0]);
      this.members.push({ a, s: 0, lane: -0.9, looks, nodAt: -1e9, hold: false, ob, r: new Receiving(ob), slot: DAK.slot(DAK_LINE, k) });
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
    // (dak bat's check: the morning's file coming up to him by the road, about 7 m off once a shot's run-up is walked)
    const pin = DAK.pin;
    if (pin && morning) {
      const sp = this.route.nearest(pin.x, pin.z);
      const p = this.route.at(sp, 0, this.tmp);
      if (Math.hypot(p.x - pin.x, p.z - pin.z) < 10) u = Math.max(0, sp - (this.env.shot ? 7 + 10.2 * SPEED : 9)) / SPEED;
    }
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
    for (const m of this.members) {
      m.r.stop(m.a);
      m.a.hide();
      m.slot.on = false;
    }
    if (this.claim && DAK.ask.line === DAK_LINE && DAK.ask.n === this.claim.n) DAK.ask.state = 'none';
    this.claim = null;
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
      // (one taking alms keeps his open bowl until it is put back)
      if (m.r.busy) continue;
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
      this.refuse();
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
    // (dak bat: a monk standing before the explorer, the file waits for him)
    const alms = this.alms(dt, now, f);
    const waiting = (((choice.wait && this.stuck < (choice.onlyPeople ? STANDOFF : STANDOFF_LONG)) || lag) && lead.s > 0 && lead.s < L) || alms;
    if (!waiting) lead.s += dir * SPEED * dt;
    // (an elephant coming down the road at them, and no way past: back off before it)
    else if (choice.backOff && !alms) lead.s -= dir * BACK_OFF * dt;
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
        m.slot.on = false;
        continue;
      }
      this.route.at(m.s, m.lane * dir, p);
      if (!m.a.shown) {
        m.a.warp(p.x, p.y, p.z, this.route.yawAt(m.s, dir));
        m.a.show();
        m.a.pose(POSE.stand, now);
        m.a.carry(1, now);
      }
      const c = this.claim;
      if (c && c.aside && this.members[c.k] === m) {
        // Standing before the explorer for his rice (dak bat): his bowl out, then back; heads bowed for the blessing.
        const ask = DAK.ask;
        m.a.goTo(ask.mx, ask.mz, 0.7);
        m.a.face(ask.myaw);
        m.a.lookAt(null);
        m.a.tilt(c.step === 'bless' ? 0.38 : 0.3);
        if (!m.r.busy) m.a.pose(POSE.stand, now);
      } else {
        // (quick when stepping aside or backing off before an elephant)
        m.a.goTo(p.x, p.z, m.hold || waiting ? 1.5 : SPEED * 1.4);
        m.a.face(m.hold && ex ? m.a.yawTo(ex.x, ex.z) : null);
        if (c && c.step === 'bless') {
          m.a.tilt(0.38);
          m.a.lookAt(null);
        } else this.greet(m, now, f, ex, m.hold);
      }
      m.a.step(dt, now);
      m.r.step(m.a, dt, now);
      // (on the morning's walk with his bowl: roaming may offer him rice)
      const sl = m.slot;
      sl.on = this.morning && !this.wet && dir === 1;
      sl.x = m.a.x;
      sl.y = m.a.y;
      sl.z = m.a.z;
      sl.yaw = this.route.yawAt(clamp(m.s, 0, L), dir);
      sl.t = f.t;
    }
    // (night falling on the road: they carry on to the door at the same pace)
    if (allIn) this.goIn(dir === 1 ? 'temple' : 'village', dir === 1 ? IN_TEMPLE : IN_VILLAGE);
  }

  /** Dak bat: no file out now (in the temple or the village): an ask to it is refused at once. */
  private refuse(): void {
    const ask = DAK.ask;
    if (ask.line === DAK_LINE && ask.state === 'ask' && ask.n !== this.taken) {
      this.taken = ask.n;
      ask.state = 'none';
    }
  }

  /**
   * Dak bat (roam/_dakBat.ts): his ask taken (the first monk with his bowl not past him yet), the monk walks on
   * with the file until near, steps over to stand before him (`DAK_STAND` off, facing him), holds his bowl out and
   * lifts the lid; the rice in, the lid back, the blessing; then back into the file. True while he stands aside
   * (the file waits for him).
   */
  private alms(dt: number, now: number, f: MapFrame): boolean {
    const ask = DAK.ask;
    const dir = this.dir;
    if (ask.line === DAK_LINE && ask.state === 'ask' && ask.n !== this.taken) {
      this.taken = ask.n;
      let pick = -1;
      if (this.morning && !this.wet && dir === 1)
        for (let k = 0; k < FILE; k++) {
          const m = this.members[k];
          if (!m.a.shown) continue;
          const yaw = this.route.yawAt(clamp(m.s, 0, this.route.len), dir);
          if ((ask.x - m.a.x) * Math.sin(yaw) + (ask.z - m.a.z) * Math.cos(yaw) > 0.4) {
            pick = k;
            break;
          }
        }
      if (pick < 0) ask.state = 'none';
      else {
        ask.k = pick;
        ask.state = 'coming';
        this.claim = { k: pick, n: ask.n, step: 'go', t: 0, aside: false };
      }
    }
    // (a check, `dakbat=give|bless`: the leader stands before him at once, by the road)
    if (ask.snap && ask.line === '' && ask.state !== 'none' && this.mode === 'out' && dir === 1 && this.morning) {
      const sp = this.route.nearest(ask.mx, ask.mz);
      const p = this.route.at(sp, 0, this.tmp);
      if (Math.hypot(p.x - ask.mx, p.z - ask.mz) < 8) {
        ask.snap = false;
        ask.line = DAK_LINE;
        ask.k = 0;
        this.taken = ask.n;
        const bless = ask.state === 'bless';
        this.claim = { k: 0, n: ask.n, step: bless ? 'bless' : 'there', t: 0, aside: true };
        this.members.forEach((m, k) => {
          m.s = sp + 0.5 - k * GAP;
          m.a.hide();
        });
        const m = this.members[0];
        m.a.warp(ask.mx, this.env.ground.at(ask.mx, ask.mz, p.y), ask.mz, ask.myaw);
        m.a.show();
        m.a.carry(1, now);
        m.ob.fill = 0.35;
        if (!bless) m.r.open(m.a, now, true);
        AlmsBowl.mouth(m.a, 1, this.tmp);
        ask.bx = this.tmp.x;
        ask.by = this.tmp.y;
        ask.bz = this.tmp.z;
      }
    }
    const c = this.claim;
    if (!c) return false;
    const m = this.members[c.k];
    c.t += dt;
    const gone = ask.n !== c.n || ask.state === 'none' || ask.state === 'done';
    if (gone && c.step !== 'back') {
      c.step = 'back';
      c.t = 0;
      m.r.close();
    }
    switch (c.step) {
      case 'go':
        // (with the file until near him, then over to him)
        if (!c.aside && m.a.shown && m.a.dist(ask.mx, ask.mz) < DAK_ASIDE) c.aside = true;
        if (c.aside && m.a.dist(ask.mx, ask.mz) < 0.12 && Math.abs(wrap(ask.myaw - m.a.yaw)) < 0.08 && m.a.speed < 0.02) {
          c.step = 'settle';
          c.t = 0;
        }
        break;
      case 'settle':
        if (c.t > 0.35) {
          c.step = 'open';
          m.r.open(m.a, now);
        }
        break;
      case 'open':
        if (m.r.phase === 'open') {
          c.step = 'there';
          AlmsBowl.mouth(m.a, 1, this.tmp);
          ask.bx = this.tmp.x;
          ask.by = this.tmp.y;
          ask.bz = this.tmp.z;
          ask.state = 'there';
        }
        break;
      case 'there':
        m.ob.fill = Math.min(1, 0.3 + 0.4 * ask.rice);
        if (ask.state === 'given' || ask.state === 'bless') {
          c.step = 'close';
          m.r.close();
        }
        break;
      case 'close':
        if (!m.r.busy) c.step = 'bless';
        break;
      case 'bless':
        break;
      case 'back':
        // (the bowl back, then into his place in the file, his head up)
        if (!m.r.busy) c.aside = false;
        if (!c.aside && (m.a.behind < 0.3 || c.t > 6)) {
          this.claim = null;
          for (const mm of this.members) mm.a.tilt(0);
        }
        break;
    }
    void f;
    return c.aside;
  }

  /** A nod as the explorer passes; standing aside for him, a nod with a hand raised in blessing (never a sampeah: monks do not sampeah lay people). */
  private greet(m: Member, now: number, f: MapFrame, ex: Obstacle | null, waiting: boolean): void {
    const a = m.a;
    if (!ex || f.night > 0.7) {
      if (a.currentPose === POSE.nod && now > m.nodAt + 2.2) a.pose(POSE.stand, now);
      return;
    }
    const d = a.dist(ex.x, ex.z);
    if (d < NOD_AT && now - m.nodAt > NOD_EVERY && Math.abs(ex.y - a.y) < 2.5) {
      m.nodAt = now;
      a.lookAt({ x: ex.x, y: ex.y + 2, z: ex.z }, now + 2.4);
      if (waiting) {
        a.pose(POSE.nod, now);
        a.carry(0, now);
      }
    }
    // The nod: head down for a moment while looking at him.
    const since = now - m.nodAt;
    a.tilt(since > 0.4 && since < 1.2 && !waiting ? 0.7 : 0);
    if (since > 2.2 && a.currentPose === POSE.nod) {
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
    // Greets the explorer: straightens up, turns to him, a nod and a blessing, then back to work.
    if (ex && a.dist(ex.x, ex.z) < 4.2 && now - this.greetAt > 60 && Math.abs(ex.y - a.y) < 2.5) this.greetAt = now;
    const g = now - this.greetAt;
    if (ex && g < 3.2) {
      a.stop(a.yawTo(ex.x, ex.z));
      a.lookAt({ x: ex.x, y: ex.y + 2, z: ex.z }, now + 0.2);
      a.pose(g > 0.6 && g < 2.6 ? POSE.nod : POSE.stand, now);
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
