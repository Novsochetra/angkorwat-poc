import { hash3 } from '../../voxel/random';
import { eventsNow } from '../events';
import type { RoadStall } from '../hamlet/_knSite';
import { REST_STOOLS, SELLER_SEAT } from '../hamlet/_knStall';
import { RECLINING } from '../landmarks/_kulenBuddha';
import { PATHS } from '../layout';
import { WORSHIP, type WorshipSpot } from '../roam/_worship';
import type { MapFrame } from '../types';
import { Actor } from './_actor';
import { dress } from './_kinds';
import { CARRY, FEAT, POSE, SLOT, type Look, type Pose } from './_personModel';
import { Route, type LaneChoice, type Obstacle, type Point } from './_routes';
import { BACK_OFF, GONE, Pace, STANDOFF, STANDOFF_LONG, viewDist, type PeopleEnv } from './_scene';
import { drinkGoodsRig, onStool, pilgrimLook } from './_sceneKulenKit';
import { Rig } from './_things';

/**
 * The pilgrims of Phnom Kulen (part of the `kulen` scene, `_sceneKulen.ts`).
 * Cambodians climb the holy mountain on weekends and holy days to pray at
 * the shrine at the foot of its temple's stair and at the reclining Buddha
 * (Preah Ang Thom):
 *
 * - three groups walk the mountain road's long stair, each on its own loop:
 *   a family (a grandmother in white with her sash, the parents in their
 *   best, a child), three yeay chi (old lay nuns: shaved heads, all in
 *   white), a monk and a novice under their saffron umbrellas. Up the stair
 *   slowly, keeping to the right; at the top they kneel in a row before the
 *   stair-foot shrine (roam/_worship.ts `kulen-stair-foot`), lotus buds and
 *   incense raised between their palms (`FEAT.offering`), bowing the head
 *   low over their hands now and then; then down the grand stair and along the paved way to the
 *   reclining Buddha (`landmarks/_kulenBuddha.ts` `RECLINING.way`), up the
 *   rock's stair, to kneel before him (`kulen-buddha`); back along the way
 *   and down the road; they rest on low stools at the drinks stall by the
 *   road's foot, then go home (and come again). They kneel in rows (shared
 *   by the groups: `KneelRow`), the explorer's own place in the middle left
 *   free, the monks nearest it;
 * - at the summit by day: an old woman in white kneeling and bowing, an old
 *   man lighting incense at the altar, a young woman sitting on the pad's
 *   parapet looking out over the land in the afternoon and golden hour;
 * - at the drinks stall (the hamlet part's `buildDrinkStall`): the seller on
 *   her stool, an old man resting, the cane-juice cups and bottles laid out
 *   while it is open.
 *
 * They let the explorer pass on the stair as the monks do (they stop at the
 * side), open umbrellas in the rain, and are home by night. Nature book:
 * `pilgrim` by kind (the monks are monks). Far off they step less often;
 * beyond `Pace`'s range they hide. Shots: `pilgrims=<phase>` (up, shrine,
 * toBuddha, buddha, fromBuddha, down, rest) puts every group in that part
 * of its loop.
 */

/** Walking up and down the stair (m/s), the gap between two in a group (m). */
const UP = 0.5;
const DOWN = 0.62;
const GAP = 1.9;
/** Seconds at the shrine, at the Buddha, resting at the stall, at home between visits. */
const AT_SHRINE = 55;
const AT_BUDDHA = 50;
const REST = 45;
const HOME = 110;
/** Pilgrims keep this far from the explorer's own kneeling place before the Buddha (m): the lotus mark and his view stay clear. */
const KEEP_OFF = 2.2;
/** The people's clock when a page's (or a still's) life begins (s: a still simulates a few seconds before it). */
const START = 4;
/** A bow's cycle at a shrine: kneeling, then bowing down (s). */
const BOW_EVERY = 7;
const BOW_FOR = 2.2;
/** Out by day: not setting out once `night` is past this, home by `GONE`. */
const DUSK = 0.45;
/** The mountain road's top (layout.ts `PATHS`), and its foot if there is no stall. */
const ROAD = PATHS.find((p) => p.name === 'garden and mountain road')?.points ?? [];
const TOP: [number, number] = ROAD.length ? ROAD[ROAD.length - 1] : [370, -424];
const FOOT: [number, number] = [310, -282];

type Phase = 'home' | 'up' | 'shrine' | 'toBuddha' | 'buddha' | 'fromBuddha' | 'down' | 'rest';
const ORDER: Phase[] = ['up', 'shrine', 'toBuddha', 'buddha', 'fromBuddha', 'down', 'rest', 'home'];

interface Pilgrim {
  a: Actor;
  /** Along the route (m), lane (m to the left of the way). */
  s: number;
  lane: number;
  /** Their own clock for the bows. */
  seed: number;
  /** Their look walking, in the rain, and kneeling at a shrine (a monk's umbrella is put down there). */
  dry: Look;
  wet: Look;
  pray: Look;
  /** Where they sit to rest at the stall (worked out when they first sit). */
  restAt?: { x: number; z: number };
}

interface Group {
  name: string;
  members: Pilgrim[];
  phase: Phase;
  /** Seconds into a stop (shrine, Buddha, rest, home). */
  t: number;
  /** The way they walk now (the road, or the Buddha's way), which way along it, and where it ends (m along it). */
  route: Route;
  dir: 1 | -1;
  end: number;
  stuck: number;
  /** Monks kneel in the front row, the laity behind. */
  row: number;
  /** Where this group is on its loop when the page opens (a part of it, how far into it): the groups are spread along it. */
  start: [Phase, number];
  /** Home for the night (in the morning they start where their loop has them). */
  slept: boolean;
  /** Its own pace by its distance from the camera. */
  pace: Pace;
}

interface SummitOne {
  a: Actor;
  role: 'kneel' | 'incense' | 'rim';
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export class KulenPilgrims {
  /** Up the road from its foot to the shrine's kneeling row on the pad. */
  private readonly route: Route | null;
  /**
   * From the shrine's row back down the grand stair to its foot (`foot` m
   * along the road), then along the paved way (`RECLINING.way`) to the
   * Buddha's kneeling place; the way starts `wayStart` m along it.
   */
  private readonly toBuddha: Route | null = null;
  private readonly foot: number = 0;
  private readonly wayStart: number = 0;
  private readonly shrine: WorshipSpot | null;
  private readonly buddha: WorshipSpot | null;
  private readonly groups: Group[] = [];
  private readonly summit: SummitOne[] = [];
  private readonly seller: Actor | null = null;
  private readonly rester: Actor | null = null;
  private readonly goods: Rig | null = null;
  private readonly summitPace = new Pace(100, 360);
  private readonly stallPace = new Pace(90, 300);
  private started = false;
  private stallShown = false;
  private readonly tmp: Point & { yaw?: number } = { x: 0, y: 0, z: 0 };
  private readonly look = { x: 0, y: 0, z: 0 };
  /** The kneeling rows before the shrine and the Buddha. */
  private readonly rows = new Map<WorshipSpot, KneelRow>();
  /** (the leader's lane, asked for every frame: written here, no new object) */
  private readonly choice: LaneChoice = { side: 0, wait: false, explorer: null, onlyPeople: false, backOff: false, obstacle: false };

  constructor(
    private readonly env: PeopleEnv,
    private readonly stall: RoadStall | null,
    actors: Actor[],
  ) {
    const { crowd, graph, things } = env;
    this.shrine = WORSHIP.find((w) => w.id === 'kulen-stair-foot') ?? null;
    this.buddha = WORSHIP.find((w) => w.id === 'kulen-buddha') ?? null;
    const foot: [number, number] = stall ? [stall.road.x, stall.road.z] : FOOT;
    // Up the road from its foot to its top, then onto the pad to the shrine's kneeling row.
    let route: Route | null = null;
    try {
      route = graph.route(foot, TOP);
      if (this.shrine) route = route.extend({ x: this.shrine.x, y: this.shrine.y, z: this.shrine.z + 1.1 });
    } catch {
      route = null;
    }
    this.route = route && route.len > 20 ? route : null;
    if (this.route && this.buddha && RECLINING.way.length > 1) {
      const leg = buddhaLeg(this.route, RECLINING.way);
      this.toBuddha = leg.route;
      this.foot = leg.foot;
      this.wayStart = leg.wayStart;
    }
    const room = () => crowd.capacity - crowd.count;
    const actor = (look: Look) => {
      const a = new Actor(crowd, look, env.ground);
      actors.push(a);
      return a;
    };
    const member = (look: Look, seed: number, umbrella: number, pray = look): Pilgrim => ({ a: actor(look).avoid(env.traffic, 'pilgrims'), s: 0, lane: -0.9, seed, dry: look, wet: withUmbrella(look, umbrella), pray });
    if (this.route) {
      const specs: { name: string; row: number; start: [Phase, number]; who: { look: Look; seed: number; pray?: Look }[] }[] = [
        {
          name: 'family',
          row: 1,
          // (a page opens, or a still is taken, on them kneeling at the shrine)
          start: ['shrine', 0.45],
          who: [
            { look: pilgrimLook(5101, 'elder', { sex: 'f', age: 'old' }), seed: 5101 },
            { look: pilgrimLook(5102, 'best', { sex: 'm', age: 'young' }), seed: 5102 },
            { look: pilgrimLook(5103, 'best', { sex: 'f', age: 'young' }), seed: 5103 },
            { look: dress('kid', 5104, {}), seed: 5104 },
          ],
        },
        {
          name: 'yeaychi',
          row: 1,
          // (…the yeay chi halfway up the stair)
          start: ['up', 0.5],
          who: [5111, 5112, 5113].map((seed) => ({ look: pilgrimLook(seed, 'yeaychi', { age: 'old' }), seed })),
        },
        {
          name: 'monks',
          row: 0,
          // (…and the monks before the reclining Buddha)
          start: ['buddha', 0.4],
          who: [
            { look: dress('monk', 5121, { carry: CARRY.umbrella }), seed: 5121, pray: dress('monk', 5121) },
            { look: dress('monk', 5122, { carry: CARRY.umbrella, young: true }), seed: 5122, pray: dress('monk', 5122, { young: true }) },
          ],
        },
      ];
      for (const sp of specs) {
        // (room in the crowd: the others' scenes come first; a group fewer if need be)
        if (room() < sp.who.length + 5) continue;
        const members = sp.who.map((w, k) => member(w.look, w.seed, UMBRELLAS[(k + sp.row) % UMBRELLAS.length], w.pray));
        this.groups.push({ name: sp.name, members, phase: 'home', t: 0, route: this.route, dir: 1, end: this.route.len, stuck: 0, row: sp.row, start: sp.start, slept: false, pace: new Pace(90, 360) });
      }
    }
    // The summit's own: kneeling, lighting incense, sitting on the rim.
    const sh = this.shrine;
    if (sh && room() >= 5) {
      const l = Math.hypot(sh.fx - sh.x, sh.fz - sh.z) || 1;
      const ux = (sh.fx - sh.x) / l;
      const uz = (sh.fz - sh.z) / l;
      const yaw = Math.atan2(ux, uz);
      const spots: [Look, SummitOne['role'], number, number, number][] = [
        [pilgrimLook(5131, 'elder', { sex: 'f', age: 'old' }), 'kneel', 4.8, 0, yaw],
        [pilgrimLook(5132, 'elder', { sex: 'm', age: 'old' }), 'incense', -1.9, 1.25, yaw],
        // (on the pad's parapet by the stair, looking out over the land to the south-west)
        [pilgrimLook(5133, 'best', { sex: 'f', age: 'young' }), 'rim', -6.5, -0.2, yaw + Math.PI - 0.6],
      ];
      for (const [look, role, across, ahead, y] of spots) {
        const x = sh.x - uz * across + ux * ahead;
        const z = sh.z + ux * across + uz * ahead;
        const g = env.ground.at(x, z, sh.y + 1.4);
        this.summit.push({ a: actor(look), role, x, y: Number.isFinite(g) ? g : sh.y, z, yaw: y });
      }
    }
    // The drinks stall's seller and an old man resting by it.
    if (stall && room() >= 2) {
      this.seller = actor(dress('vendor', 5141, { sex: 'f', hat: 'palm', goods: 'fruit' }));
      this.rester = actor(pilgrimLook(5142, 'elder', { sex: 'm', age: 'old' }));
      if (things.used + 12 <= things.capacity) {
        this.goods = new Rig(things, drinkGoodsRig());
        this.goods.place(stall.x, stall.ground, stall.z, stall.yaw);
      }
    }
  }

  // ── Where each group is on its loop ────────────────────────────────────────

  /** Seconds of each phase (the Buddha's only if its spot exists). */
  private duration(p: Phase): number {
    const L = this.route!.len;
    const B = this.toBuddha;
    switch (p) {
      case 'up':
        return L / UP;
      case 'shrine':
        return this.shrine ? AT_SHRINE : 0;
      case 'toBuddha':
        return B ? B.len / UP : 0;
      case 'buddha':
        return B ? AT_BUDDHA : 0;
      case 'fromBuddha':
        return B ? (B.len - this.wayStart) / DOWN : 0;
      case 'down':
        return (B ? this.foot : L) / DOWN;
      case 'rest':
        return this.stall ? REST : 0;
      default:
        return HOME;
    }
  }

  /** Put a group where its loop has it at time `now` (the start of a live page, or a still). */
  private begin(g: Group, now: number, f: MapFrame): void {
    const total = ORDER.reduce((t, p) => t + this.duration(p), 0);
    // (the page's clock starts near 0, a still's a few seconds in: `START` s in, each group is where its `start` says)
    const [p0, k0] = g.start;
    const u0 = ORDER.slice(0, ORDER.indexOf(p0)).reduce((t, p) => t + this.duration(p), 0) + this.duration(p0) * k0;
    let u = (((now - START + u0) % total) + total) % total;
    const q = this.env.params.get('pilgrims') as Phase | null;
    if (q && ORDER.includes(q)) {
      // (every group in that part of its loop, each a little into it)
      u = ORDER.slice(0, ORDER.indexOf(q)).reduce((t, p) => t + this.duration(p), 0) + this.duration(q) * (0.2 + 0.25 * this.groups.indexOf(g));
    }
    let phase: Phase = 'home';
    for (const p of ORDER) {
      if (u < this.duration(p)) {
        phase = p;
        break;
      }
      u -= this.duration(p);
    }
    // (none set out in the dark: those not yet up are home till morning)
    if (f.night > DUSK && (phase === 'up' || phase === 'home')) {
      g.slept = true;
      return this.setPhase(g, 'home', 0);
    }
    this.setPhase(g, phase, u);
    // (a walk that far along: the leader there, the others behind; only on the road up do they come into sight one by one)
    const speed = g.dir > 0 ? UP : DOWN;
    const start = g.dir > 0 ? 0 : g.members[0].s;
    const lead = g.dir > 0 ? Math.min(g.end, start + u * speed) : Math.max(g.end, start - u * speed);
    const walking = phase === 'up' || phase === 'down' || phase === 'toBuddha' || phase === 'fromBuddha';
    g.members.forEach((m, k) => {
      if (walking) m.s = phase === 'up' ? lead - k * GAP : Math.max(Math.min(start, g.end), Math.min(Math.max(start, g.end), lead - g.dir * k * GAP));
      m.lane = -0.9;
      this.placeNow(g, m, now);
    });
  }

  private setPhase(g: Group, phase: Phase, t: number): void {
    g.phase = phase;
    g.t = t;
    const L = this.route!.len;
    const B = this.toBuddha;
    // The walks: the road up (from its foot: they come into sight one by one), to the Buddha and back, the road down.
    const walk = (route: Route, dir: 1 | -1, from: number, end: number, stagger: boolean) => {
      g.route = route;
      g.dir = dir;
      g.end = end;
      g.members.forEach((m, k) => (m.s = stagger ? from - dir * k * GAP : from));
    };
    if (phase === 'up') walk(this.route!, 1, 0, L, true);
    else if (phase === 'toBuddha' && B) walk(B, 1, 0, B.len, false);
    else if (phase === 'fromBuddha' && B) walk(B, -1, B.len, this.wayStart, false);
    else if (phase === 'down') walk(this.route!, -1, g.route === B ? this.foot : L, 0, false);
    if (phase === 'home') for (const m of g.members) this.hideMember(m);
  }

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    if (this.route && this.groups.length) {
      if (!this.started) {
        this.started = true;
        for (const g of this.groups) this.begin(g, now, f);
      }
      // (each group as far as it is from the camera: out of sight far off, a step every few frames at a distance)
      const wet = eventsNow(f).umbrellas;
      for (const g of this.groups) {
        const step = g.pace.step(dt, this.distance(g, f));
        if (step < 0) for (const m of g.members) this.hideMember(m);
        else if (step > 0) this.group(g, step, now, f, ex, wet);
      }
    }
    if (this.summit.length) {
      const step = this.summitPace.step(dt, viewDist(f, TOP[0], TOP[1] - 6));
      if (step < 0) for (const q of this.summit) this.hideMember(q);
      else if (step > 0) this.summitLife(step, now, f);
    }
    this.stallLife(dt, now, f);
  }

  /** How far a group is from the camera (m): where its leader is, or its stop. */
  private distance(g: Group, f: MapFrame): number {
    const lead = g.members[0];
    if (lead.a.shown) return viewDist(f, lead.a.x, lead.a.z);
    const p = g.route.at(Math.max(0, Math.min(g.route.len, lead.s)), 0, this.tmp);
    return viewDist(f, p.x, p.z);
  }

  // ── A group on its loop ──────────────────────────────────────────────────

  private group(g: Group, dt: number, now: number, f: MapFrame, ex: Obstacle | null, wet: number): void {
    // Rain: umbrellas up (down again when it has passed); kneeling at a shrine, the monks' umbrellas are put down.
    const kneeling = g.phase === 'shrine' || g.phase === 'buddha';
    for (const m of g.members) {
      const look = kneeling ? m.pray : wet > 0.5 ? m.wet : wet < 0.3 ? m.dry : m.a.look === m.pray ? m.dry : m.a.look;
      if (m.a.look !== look) {
        m.a.look = look;
        this.env.crowd.dress(m.a.i, look);
        m.a.carry(look.carry === CARRY.umbrella ? 1 : 0, now);
      }
    }
    if (g.phase !== 'home' && f.night > GONE) {
      g.slept = true;
      return this.setPhase(g, 'home', 0);
    }
    switch (g.phase) {
      case 'home':
        g.t += dt;
        if (f.night >= DUSK) g.slept = true;
        else if (g.slept) {
          // (morning after a night at home: each group back where its own loop has it, so they are not all at the foot together)
          g.slept = false;
          this.begin(g, now, f);
        } else if (g.t >= HOME) this.setPhase(g, 'up', 0);
        return;
      case 'up':
      case 'down':
      case 'toBuddha':
      case 'fromBuddha':
        return this.walk(g, dt, now, ex);
      case 'shrine':
      case 'buddha': {
        g.t += dt;
        const spot = g.phase === 'shrine' ? this.shrine : this.buddha;
        for (const m of g.members) this.pray(g, m, spot, dt, now);
        if (g.t >= this.duration(g.phase)) {
          if (spot) for (const m of g.members) this.rows.get(spot)?.release(m);
          // (from the shrine on to the Buddha if there is one, else down; in the evening straight down)
          if (g.phase === 'buddha') this.setPhase(g, 'fromBuddha', 0);
          else this.setPhase(g, this.toBuddha && f.night < 0.3 ? 'toBuddha' : 'down', 0);
        }
        return;
      }
      case 'rest':
        g.t += dt;
        g.members.forEach((m, k) => this.rest(m, k, dt, now));
        if (g.t >= REST) this.setPhase(g, 'home', 0);
        return;
    }
  }

  /** Along the way (up or down the stair, to the Buddha and back): the leader picks the lane (round the explorer and others), the rest follow in pairs. */
  private walk(g: Group, dt: number, now: number, ex: Obstacle | null): void {
    const route = g.route;
    const L = route.len;
    const { traffic, ground } = this.env;
    const dir = g.dir;
    const speed = dir > 0 ? UP : DOWN;
    const lead = g.members[0];
    // (the Buddha's way and the rock's stair are narrow: single file there, in the middle)
    const file = g.phase === 'toBuddha' || g.phase === 'fromBuddha';
    const choice = traffic.lane(route, Math.max(0, Math.min(L, lead.s)), dir, file ? 0 : -0.9, 6, 'pilgrims', ground, true, this.choice);
    g.stuck = choice.wait && !choice.explorer ? g.stuck + dt : 0;
    let lag = false;
    for (const m of g.members) if (m.a.shown && m.a.behind > 2.5) lag = true;
    const waiting = ((choice.wait && g.stuck < (choice.onlyPeople ? STANDOFF : STANDOFF_LONG)) || lag) && lead.s > 0 && lead.s < L;
    if (!waiting) lead.s += dir * speed * dt;
    else if (choice.backOff) lead.s -= dir * BACK_OFF * dt;
    const side0 = file ? Math.max(-0.3, Math.min(0.3, choice.side)) : choice.side;
    lead.lane += Math.max(-0.9 * dt, Math.min(0.9 * dt, side0 - lead.lane));
    for (let k = 1; k < g.members.length; k++) {
      const m = g.members[k];
      const ahead = g.members[k - 1];
      // (in pairs on the wide road: every other one beside the one ahead; single file on the narrow way)
      const pair = !file && k % 2 === 1;
      const want = ahead.s - dir * (pair ? GAP * 0.35 : GAP);
      const gap = (want - m.s) * dir;
      if (gap > 0) m.s += dir * Math.min(gap, speed * 1.3 * dt);
      if ((ahead.s - m.s) * dir < GAP * (pair ? 0.3 : 0.6)) m.s = ahead.s - dir * GAP * (pair ? 0.3 : 0.6);
      const side = pair ? ahead.lane + (ahead.lane < 0 ? 0.8 : -0.8) : ahead.lane;
      m.lane += Math.max(-0.9 * dt, Math.min(0.9 * dt, side - m.lane));
    }
    const p = this.tmp;
    // (the leg is walked when the leader is at its end and the others have closed up behind)
    let allDone = true;
    for (let k = 0; k < g.members.length; k++) {
      const m = g.members[k];
      // (past the leg's end they stop there; before its start, still out of sight at the road's foot)
      if (dir > 0 ? m.s > g.end : m.s < g.end) m.s = g.end;
      if ((g.end - m.s) * dir > k * GAP * (file ? 1 : 0.7) + 0.3) allDone = false;
      const off = dir > 0 ? m.s < 0 : m.s > L;
      if (off) {
        if (m.a.shown) this.hideMember(m);
        continue;
      }
      route.at(Math.max(0, Math.min(L, m.s)), m.lane * dir, p);
      if (!m.a.shown) {
        m.a.warp(p.x, p.y, p.z, route.yawAt(m.s, dir));
        m.a.show();
        m.a.carry(m.a.look.carry === CARRY.umbrella ? 1 : 0, now);
      }
      m.a.goTo(p.x, p.z, waiting ? 1.2 : speed * 1.35);
      m.a.face(waiting && ex ? m.a.yawTo(ex.x, ex.z) : null);
      m.a.pose(POSE.stand, now);
      m.a.tilt(0);
      // (near the top they look up at the temple)
      if (g.phase === 'up' && m.s > L - 25 && this.shrine) {
        const q = this.look;
        q.x = this.shrine.fx;
        q.y = this.shrine.y + 12;
        q.z = this.shrine.fz;
        m.a.lookAt(q, now + 1);
      } else m.a.lookAt(null);
      m.a.step(dt, now);
    }
    if (!allDone) return;
    if (g.phase === 'up') this.setPhase(g, this.shrine ? 'shrine' : 'down', 0);
    else if (g.phase === 'toBuddha') this.setPhase(g, 'buddha', 0);
    else if (g.phase === 'fromBuddha') this.setPhase(g, 'down', 0);
    else this.setPhase(g, this.stall ? 'rest' : 'home', 0);
  }

  /** At a shrine: to their place in the row, kneel, the offering raised; three bows every little while. */
  private pray(g: Group, m: Pilgrim, spot: WorshipSpot | null, dt: number, now: number): void {
    const a = m.a;
    if (!spot) return;
    const at = this.kneelSpot(spot, g, m);
    if (!a.shown) {
      a.warp(at.x, at.y, at.z, at.yaw);
      a.show();
    }
    a.carry(0, now);
    if (a.dist(at.x, at.z) > 0.25) {
      a.goTo(at.x, at.z, 0.55);
      a.face(null);
      a.pose(POSE.stand, now);
    } else {
      a.stop(at.yaw);
      // (each on their own time: kneeling, palms together, and every little while a bow, the head down low over the hands)
      const u = (now + m.seed * 0.37) % BOW_EVERY;
      a.pose(POSE.kneel, now);
      a.tilt(u < BOW_FOR ? 1 : 0.15);
    }
    a.lookAt(null);
    a.step(dt, now);
    if (a.dist(at.x, at.z) > 0.25) a.tilt(0);
  }

  /** Their place kneeling before a worship spot (a row shared by every group: see `KneelRow`). */
  private kneelSpot(spot: WorshipSpot, g: Group, m: Pilgrim): { x: number; y: number; z: number; yaw: number } {
    let row = this.rows.get(spot);
    if (!row) this.rows.set(spot, (row = new KneelRow(spot, this.env.ground, spot === this.buddha ? 2.6 : 3.7)));
    return row.place(m, g.row === 0);
  }

  /** Resting at the drinks stall: on a low stool facing the road, a drink. */
  private rest(m: Pilgrim, k: number, dt: number, now: number): void {
    const st = this.stall;
    const a = m.a;
    if (!st) return this.hideMember(m);
    // (the old man keeps the last stool; one more squats on the ground by them)
    const extra = k >= REST_STOOLS.length - 1;
    const seat = (m.restAt ??= this.restSeat(st, a, k));
    if (!a.shown) {
      a.warp(seat.x, st.ground, seat.z, st.yaw);
      a.show();
    }
    a.carry(0, now);
    if (a.dist(seat.x, seat.z) > 0.3) {
      a.goTo(seat.x, seat.z, 0.6);
      a.face(null);
      a.pose(POSE.stand, now);
    } else {
      a.stop(st.yaw);
      a.pose(extra ? POSE.squat : k % 2 ? POSE.stool : POSE.eat, now);
    }
    a.step(dt, now);
  }

  /** Where pilgrim `k` of a group sits to rest at the stall (their feet by a low stool, map m). */
  private restSeat(st: RoadStall, a: Actor, k: number): { x: number; z: number } {
    const c = Math.cos(st.yaw);
    const s = Math.sin(st.yaw);
    const n = REST_STOOLS.length - 1;
    const [lx, lz] = REST_STOOLS[Math.min(k, n - 1)];
    const extra = k >= n;
    const sx = st.x + lx * c + lz * s + (extra ? c * 0.6 + s * 0.7 : 0);
    const sz = st.z - lx * s + lz * c + (extra ? -s * 0.6 + c * 0.7 : 0);
    return extra ? { x: sx, z: sz } : onStool(a.crowd.scale(a.i), sx, sz, st.yaw);
  }

  /** Straight to their place in the group's part of the loop (a still, or the page opening). */
  private placeNow(g: Group, m: Pilgrim, now: number): void {
    const route = g.route;
    const L = route.len;
    if (g.phase === 'up' || g.phase === 'down' || g.phase === 'toBuddha' || g.phase === 'fromBuddha') {
      if (m.s < 0 || m.s > L) return this.hideMember(m);
      const p = route.at(m.s, m.lane * g.dir, this.tmp);
      m.a.warp(p.x, p.y, p.z, route.yawAt(m.s, g.dir));
      m.a.show();
      m.a.carry(m.a.look.carry === CARRY.umbrella ? 1 : 0, now);
      return;
    }
    if (g.phase === 'shrine' || g.phase === 'buddha') {
      const spot = g.phase === 'shrine' ? this.shrine : this.buddha;
      if (!spot) return this.hideMember(m);
      const at = this.kneelSpot(spot, g, m);
      m.a.warp(at.x, at.y, at.z, at.yaw);
      m.a.show();
      m.a.pose(POSE.kneel, now);
      return;
    }
    // (home, or resting: `rest` seats them)
    this.hideMember(m);
  }

  private hideMember(m: { a: Actor }): void {
    if (m.a.shown) m.a.hide();
  }

  // ── The summit's own ───────────────────────────────────────────────────────

  private summitLife(dt: number, now: number, f: MapFrame): void {
    const out = f.night < 0.55;
    for (const q of this.summit) {
      const a = q.a;
      // (the young woman on the rim only in the afternoon and the golden hour, watching the sun go down)
      const here = out && (q.role !== 'rim' || f.clock < 0.24 || f.clock > 0.9);
      if (!here) {
        this.hideMember(q);
        continue;
      }
      if (!a.shown) {
        a.warp(q.x, q.y, q.z, q.yaw);
        a.show();
        a.carry(0, now);
      }
      a.goTo(q.x, q.z, 0.4);
      a.face(q.yaw);
      let pose: Pose = POSE.kneel;
      a.tilt(0);
      if (q.role === 'kneel') a.tilt((now + 3.1) % BOW_EVERY < BOW_FOR ? 1 : 0.15);
      else if (q.role === 'incense') {
        // Lighting incense at the altar (hands held out to it), then palms together with the sticks, a bow.
        const u = (now + 11) % 30;
        pose = u < 10 ? POSE.give : u < 24 ? POSE.sampeah : POSE.bow;
      } else pose = POSE.sit;
      a.pose(pose, now);
      a.step(dt, now);
    }
  }

  // ── The drinks stall ─────────────────────────────────────────────────────

  private stallLife(dt: number, now: number, f: MapFrame): void {
    const st = this.stall;
    if (!st || !this.seller) return;
    const step = this.stallPace.step(dt, viewDist(f, st.x, st.z));
    // (open from early morning to dusk)
    const open = f.night < 0.5 && !(f.clock > 0.25 && f.clock < 0.72);
    if (step < 0 || !open) {
      if (this.stallShown) {
        this.stallShown = false;
        this.seller.hide();
        this.rester?.hide();
        this.goods?.hide();
      }
      return;
    }
    if (step === 0 && this.stallShown) return;
    this.stallShown = true;
    this.goods?.write();
    const seats = (this.seats ??= this.stallSeats(st));
    this.seat(this.seller, seats.seller.x, st.ground, seats.seller.z, st.yaw, POSE.stool, step, now);
    if (this.rester) {
      this.seat(this.rester, seats.rester.x, st.ground, seats.rester.z, st.yaw + 0.2, POSE.stool, step, now);
      // (watching the pilgrims on the stair now and then)
      const q = this.look;
      q.x = st.road.x + 6;
      q.y = st.ground + 8;
      q.z = st.road.z - 8;
      this.rester.lookAt(hash3(Math.floor(now / 9), 3, 3, 151) < 0.4 ? q : null, now + 1);
    }
  }

  /** The seller's and the old man's feet by their stools (map m), worked out once. */
  private seats: { seller: { x: number; z: number }; rester: { x: number; z: number } } | null = null;
  private stallSeats(st: RoadStall): { seller: { x: number; z: number }; rester: { x: number; z: number } } {
    const c = Math.cos(st.yaw);
    const s = Math.sin(st.yaw);
    const at = (lx: number, lz: number) => ({ x: st.x + lx * c + lz * s, z: st.z - lx * s + lz * c });
    const sp = at(SELLER_SEAT[0], SELLER_SEAT[1]);
    const [rx, rz] = REST_STOOLS[REST_STOOLS.length - 1];
    const rp = at(rx, rz);
    return {
      seller: onStool(this.seller!.crowd.scale(this.seller!.i), sp.x, sp.z, st.yaw),
      rester: this.rester ? onStool(this.rester.crowd.scale(this.rester.i), rp.x, rp.z, st.yaw + 0.2) : rp,
    };
  }

  private seat(a: Actor, x: number, y: number, z: number, yaw: number, pose: Pose, dt: number, now: number): void {
    if (!a.shown) {
      a.warp(x, y, z, yaw);
      a.show();
      a.carry(0, now);
    }
    a.stop(yaw);
    a.pose(pose, now);
    a.step(dt, now);
  }
}

/**
 * A row of kneeling places before a worship spot, across the way to it,
 * shared by every group there: the explorer's own place in its middle is
 * left free (nobody within 1.2 m of it, nobody right behind it: his view),
 * monks take the places nearest it, the laity those out to either side,
 * then a second row behind (or, where the floor steps down behind, as at
 * the head of Kulen's stair, beside the offerings ahead). A place is kept
 * until `release`.
 */
class KneelRow {
  /** Places: across (m, to the right of the way to the spot) and back (m). */
  private static readonly PLACES: readonly [number, number][] = [
    [-1.25, 0],
    [1.25, 0],
    [-2.45, 0],
    [2.45, 0],
    [-3.6, 0],
    [3.6, 0],
    [-2.0, 1.15],
    [2.0, 1.15],
    [-3.0, 1.15],
    [3.0, 1.15],
    [-2.5, 2.3],
    [2.5, 2.3],
    [-1.6, 3.4],
    [1.6, 3.4],
  ];
  private readonly taken = new Map<object, { x: number; y: number; z: number; yaw: number; k: number }>();

  constructor(
    private readonly spot: WorshipSpot,
    private readonly ground: { at(x: number, z: number, y: number): number },
    /** How far across the row may go (m): the rock's floor before the Buddha is narrower than the stair's head. */
    private readonly wide = 3.7,
  ) {}

  /** Where `who` kneels (worked out when first asked, kept till `release`). */
  place(who: object, monk: boolean): { x: number; y: number; z: number; yaw: number } {
    const had = this.taken.get(who);
    if (had) return had;
    const used = new Set<number>();
    for (const t of this.taken.values()) used.add(t.k);
    // (only places as far across as the floor there allows: `wide`)
    const order = (monk ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] : [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 0, 1]).filter((q) => Math.abs(KneelRow.PLACES[q][0]) <= this.wide);
    const k = order.find((q) => !used.has(q)) ?? order[order.length - 1];
    const o = { x: 0, y: 0, z: 0, yaw: 0, k };
    this.taken.set(who, o);
    const sp = this.spot;
    const l = Math.hypot(sp.fx - sp.x, sp.fz - sp.z) || 1;
    const ux = (sp.fx - sp.x) / l;
    const uz = (sp.fz - sp.z) / l;
    const [across, back] = KneelRow.PLACES[k];
    // (the second row behind the first; where the floor steps down there, a stair's head, beside the offerings ahead instead)
    let b = back;
    for (let n = 0; n < 2; n++) {
      o.x = sp.x - uz * across - ux * b;
      o.z = sp.z + ux * across - uz * b;
      const g = this.ground.at(o.x, o.z, sp.y + 0.5);
      o.y = Number.isFinite(g) ? g : sp.y;
      if (!back || Math.abs(o.y - sp.y) < 0.3) break;
      b = -back;
    }
    o.yaw = Math.atan2(ux, uz);
    return o;
  }

  release(who: object): void {
    this.taken.delete(who);
  }
}

/**
 * The pilgrims' way from the shrine's row to the reclining Buddha: back down
 * the road's last metres (the temple's grand stair) to its foot, then along
 * `way` (map x, floor y, z: `RECLINING.way`) every half metre. Returns the
 * route, where the stair's foot is on the road (m along it), and where the
 * way begins on the route (m along it).
 */
function buddhaLeg(road: Route, way: readonly (readonly [number, number, number])[]): { route: Route; foot: number; wayStart: number } {
  const L = road.len;
  const p: Point & { yaw?: number } = { x: 0, y: 0, z: 0 };
  // (the stair's foot: back from the road's end, the first point down at the way's own height)
  let foot = Math.max(0, L - 12);
  for (let s = L; s > L - 40 && s > 0; s -= Route.STEP) {
    road.at(s, 0, p);
    if (p.y <= way[0][1] + 0.5) {
      foot = s;
      break;
    }
  }
  const pts: Point[] = [];
  for (let s = L; s > foot; s -= Route.STEP) {
    road.at(s, 0, p);
    pts.push({ x: p.x, y: p.y, z: p.z });
  }
  road.at(foot, 0, p);
  let last: Point = { x: p.x, y: p.y, z: p.z };
  pts.push(last);
  const wayStart = (pts.length - 1) * Route.STEP;
  // (the way's last point is the explorer's own kneeling place: the walk stops short of it, and they go to their places round it)
  const n = way.length;
  const [kx, ky, kz] = way[n - 1];
  const [hx, , hz] = way[n - 2];
  const kd = Math.hypot(kx - hx, kz - hz) || 1;
  const stop = Math.max(0, kd - KEEP_OFF) / kd;
  const ends: [number, number, number][] = [...way.slice(0, n - 1).map((p) => [p[0], p[1], p[2]] as [number, number, number]), [hx + (kx - hx) * stop, ky, hz + (kz - hz) * stop]];
  for (const [x, y, z] of ends) {
    const d = Math.hypot(x - last.x, z - last.z);
    const k = Math.max(1, Math.round(d / Route.STEP));
    for (let j = 1; j <= k; j++) pts.push({ x: last.x + ((x - last.x) * j) / k, y: last.y + ((y - last.y) * j) / k, z: last.z + ((z - last.z) * j) / k });
    last = { x, y, z };
  }
  return { route: Route.from(pts), foot, wayStart };
}

/** Rain umbrellas: black, dark blue, plum, and a flowered one. */
const UMBRELLAS = [0x2e2e32, 0x2a3a5a, 0x6a2a3a, 0xd86a8a];

/** A pilgrim's look with an umbrella up (a monk keeps his own saffron one). */
function withUmbrella(look: Look, cover: number): Look {
  if (look.carry === CARRY.umbrella) return look;
  const colors = look.colors.slice();
  colors[SLOT.prop] = cover;
  colors[SLOT.prop2] = cover + 0x181818;
  colors[SLOT.wood] = 0x3a3634;
  return { ...look, colors, feats: [...look.feats.filter((f) => f !== FEAT.phone && f !== FEAT.offering), FEAT.umbrella], carry: CARRY.umbrella };
}
