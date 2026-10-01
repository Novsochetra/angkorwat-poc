import { hash3 } from '../../voxel/random';
import { len2 } from '../fauna/_len';
import { PALM_CLIMB, poleOut } from '../hamlet/_psPalms';
import { hammockTaken } from '../roam/_hammockSpots';
import {
  BUY,
  DOOR,
  DRY_AT,
  FIRE_X,
  FORECOURT,
  GRANNY,
  HAMMOCK,
  HOME,
  HUT,
  hutWorld,
  KID_STOOL,
  MAT,
  PILE_AT,
  POUR,
  psPlan,
  psWorking,
  ROUNDS,
  SEAT,
  SELL_SEAT,
  STAIR,
  STALL,
  STOVE,
  WOKS,
  WORK_DROP,
  type Local,
  type PsPalm,
  type PsPlanned,
} from '../hamlet/_psPlan';
import type { Group } from 'three';
import type { MapFrame, Subject } from '../types';
import { palmBend, sugarPalmWork, type PalmSpec, type PalmWork } from '../veg/palms';
import { Actor, wrap } from './_actor';
import { dress } from './_kinds';
import { CARRY, FEAT, FIT, POSE, SLOT, type Feature, type Look, type Pose } from './_personModel';
import type { Obstacle, Point, Traffic } from './_routes';
import { Pace, viewDist, type PeopleEnv, type PeopleScene } from './_scene';
import { PsYardAnimals } from './_scenePalmSugarYard';
import { psRoute } from './_scenePalmSugarWays';
import { PsClimb } from './_scenePalmSugarClimb';

/**
 * The palm sugar family in their yard (layout.ts `PALM_GROVE`; the shed, the
 * house, the stall, the palms and their ladders: hamlet/_palmSugar.ts, where
 * things stand: hamlet/_psPlan.ts; their cows and hens:
 * `_scenePalmSugarYard.ts`). They work from before dawn to dusk
 * (`psWorking`: the fire is lit in the blue hour): in the morning they come
 * down the stair of their house one after another, at dusk they go up it
 * and in (the lamp by the door is lit); at night nobody is out, only the
 * embers glow in the shed.
 *
 * - **The tapper** (kind `tapper`: bamboo tubes at his hip, his knife) goes
 *   round his palms (`ROUNDS`: the yard's — by the lane, behind the house,
 *   behind the shed; south of the racks and down the wide dike; down the
 *   lane and along the north dike), two or three a round: walks to the
 *   ladder's foot, turns to the trunk and climbs (`POSE.climb` at
 *   `climbRate`: each cycle of the gait's phase, a step with each foot from
 *   stub to stub, lifts him `FIT.climb.rise`), works under the crown a while
 *   (the knife shaving the flower stalks: `chop`; the full tubes swapped for
 *   empty ones: `knock`), climbs down (the cycle backwards), goes on to the
 *   next. On the ladder he sways with the palm in the wind (`palmBend`).
 *   Then he carries the full tubes home on a shoulder pole (`CARRY.pole`),
 *   pours them through the cloth into the jars, and rests on the bench before
 *   the next round. At dawn his first round brings down the night's juice.
 * - **His wife** stirs the woks with a long paddle (`POSE.stir`, `FEAT.paddle`),
 *   wok to wok, and now and then ladles fresh juice from the jars into the
 *   first wok.
 * - **The grandmother** squats by the mat of palm-leaf rings, pouring the
 *   thick syrup into cakes (`POSE.squat`), and goes out to the drying racks
 *   in the sun to turn the cakes; she offers the explorer a taste when he
 *   comes close (a bubble: "សាកភ្លក់ស្ករត្នោតមើល!").
 * - **The grandfather** squats at the fire mouths feeding in palm fronds, and
 *   fetches more from the pile north of the shed; in the midday heat he naps
 *   in the hammock under the house (`POSE.hammock`, rocking a little).
 * - **Their daughter** keeps the stall by the lane (`POSE.stool` on her low
 *   stool behind the table, now and then up to set the goods straight); she
 *   calls to the explorer as he comes by ("ទិញស្ករត្នោតទេបង?"), and hands
 *   over what he buys (people/_saleBack.ts: the seller nearest the stall).
 * - **A child** helps the grandmother, tastes a piece of sugar on the bench
 *   (`POSE.eat`, `FEAT.smallBowl`), runs round the yard after the hens, and
 *   goes to watch when father climbs a palm near the yard (looking up at him).
 *
 * They greet the explorer back (index.ts `GreetBack`); the tapper on his
 * ladder only turns his head (busy). URL: `tap=<s>` or `tap=<round>:<s>`
 * (round 0 the yard, 1 south-west, 2 south-east): the tapper that far into
 * his round when the picture is taken (at 0 he leaves the bench; ≈ 30 s
 * up the first palm, ≈ 45 s at work there); `people=palmsugar` alone.
 */

/** Walking, running (the child), climbing up and down (m/s); on the house's stair. */
const WALK = 0.9;
const RUN = 1.7;
const CLIMB_UP = 0.62;
const CLIMB_DOWN = 0.85;
const STAIRS = 0.55;
/** Seconds at the crown (a palm's own, seeded), pouring at the jars, resting on the bench. */
const WORK = [10, 15] as const;
const POUR_S = 8;
const REST = [22, 34] as const;
/** A storm this strong (`f.weather.storm`) keeps the tapper off his palms (and the stall shut). */
const STORM = 0.4;
/** The listener hears the knife and the bamboo within this far (m). */
const HEAR = 60;
/** The seconds the people's warm-up (index.ts: 8 + 1.6) adds before a still: `tap` counts them in. */
const WARMUP = 9.6;
/** The midday nap (the clock's hottest hours: grandfather in the hammock). */
const NAP = [0.9, 0.965] as const;
/** The daughter calls to the explorer within this far of the stall, not more than once in so long (s). */
const CALL_NEAR = 5;
const CALL_EVERY = 150;

/** A person of the family, and the spots of their day. */
interface Member {
  a: Actor;
  /** What they are at, since when, until when (the people's clock). */
  job: string;
  since: number;
  until: number;
  /** A walk: its points and how far along. */
  path: Point[];
  leg: number;
  /** Which wok / fire mouth, which turn of their cycle. */
  k: number;
  turn: number;
  /** Gone home (hidden in the house) for the night. */
  home: boolean;
  lookAt: number;
  /** On the house's stair or veranda: the points still to walk there (on the floor's height), then in (`goingIn`) or on to the job. */
  stairs: Point[];
  goingIn: boolean;
  /** Not out yet in the morning: they come down one after another. */
  outAt: number;
}

interface Tapper extends Member {
  looks: { gear: Look; pole: Look; bare: Look };
  round: number;
  /** Which palm of the round; its plan and work places. */
  pk: number;
  /** Height of his feet over the palm's foot (on the ladder). */
  s: number;
  knockAt: number;
  chopAt: number;
}

const _bend = { x: 0, z: 0 };
const _look: Point = { x: 0, y: 0, z: 0 };
const _ex: Point = { x: 0, y: 0, z: 0 };

export class PalmSugarFamily implements PeopleScene {
  readonly name = 'palmsugar';
  readonly actors: Actor[] = [];
  readonly object: Group;
  private readonly pace = new Pace(130, 380);
  private readonly plan: PsPlanned;
  private readonly work: Record<string, PalmWork> = {};
  private readonly specs: Record<string, PalmSpec> = {};
  private readonly tapper: Tapper;
  private readonly wife: Member;
  private readonly granny: Member;
  private readonly grandpa: Member;
  private readonly seller: Member;
  private readonly child: Member;
  private readonly family: Member[];
  private readonly everyone: Member[];
  private readonly animals: PsYardAnimals;
  /** The explorer up the yard's ladders: the cook takes his tube, the tapper waits and calls, the child watches (_scenePalmSugarClimb.ts). */
  private readonly climb: PsClimb;
  private shown = false;
  private started = false;
  private working = false;
  private tapAt: { round: number; s: number } | null = null;
  private tasteAt = -1e9;
  private callAt = -1e9;
  /** The camera far from the yard (or a still): comings and goings happen at once. */
  private far = true;
  /** How far the tapper's feet stand out from the ladder's pole while he climbs (`FIT.climb.reach`, his size). */
  private readonly climbOut: number;
  /** The child with and without the bowl. */
  private readonly kidLooks: { play: Look; eat: Look };
  /** The house's floor over the map, the stair's top and foot (z), and its points: the foot on the ground, the stair's top, the doorway. */
  private readonly floorY: number;
  private readonly groundY: number;
  private readonly stairTopZ: number;
  private readonly stairFootZ: number;
  private readonly foot: Point;
  private readonly top: Point;
  private readonly door: Point;

  constructor(private readonly env: PeopleEnv) {
    const { crowd, ground } = env;
    this.plan = psPlan(ground.field);
    for (const p of this.plan.palms) {
      if (!p.tapped) continue;
      this.specs[p.id] = { kind: 'sugar', x: p.x, y: p.y, z: p.z, h: p.h, seed: p.seed, tapped: true, ladder: p.ladder };
      this.work[p.id] = sugarPalmWork(this.specs[p.id]);
    }
    // The house's stair and door (world).
    this.groundY = ground.field.heightAt(HOME.x, HOME.z);
    this.floorY = this.groundY + HOME.floor;
    this.stairTopZ = HOME.z + STAIR.z0;
    this.stairFootZ = HOME.z + STAIR.z1;
    const sx = HOME.x + STAIR.x;
    this.foot = { x: sx, y: ground.field.heightAt(sx, this.stairFootZ + 0.45), z: this.stairFootZ + 0.45 };
    this.top = { x: sx, y: this.floorY, z: this.stairTopZ - 0.35 };
    this.door = { x: HOME.x + HOME.x1 - 0.15, y: this.floorY, z: HOME.z + DOOR.z };
    const member = (look: Look): Member => {
      const a = new Actor(crowd, look, ground).avoid(env.traffic, this.name);
      this.actors.push(a);
      return { a, job: '', since: 0, until: 0, path: [], leg: 0, k: 0, turn: 0, home: false, lookAt: -1e9, stairs: [], goingIn: false, outAt: 0 };
    };
    // The tapper: a krama round his head, a faded work shirt; tubes at the hip and the knife, or the shoulder pole.
    const base = dress('tapper', 911, { sex: 'm', hat: 'krama' });
    const plain = base.feats.filter((ft) => ft !== FEAT.pole && ft !== FEAT.tubes && ft !== FEAT.knife);
    const colors = base.colors.slice();
    colors[SLOT.prop] = 0xb8a266;
    colors[SLOT.prop2] = 0x5a4430;
    colors[SLOT.wood] = 0xc8b07a;
    const lookOf = (feats: Feature[], carry: Look['carry']): Look => ({ ...base, colors, feats: [...plain, ...feats], carry });
    const looks = { gear: lookOf([FEAT.tubes, FEAT.knife], CARRY.none), pole: lookOf([FEAT.pole], CARRY.pole), bare: lookOf([], CARRY.none) };
    this.tapper = { ...member(looks.gear), looks, round: 0, pk: 0, s: 0, knockAt: 0, chopAt: 0 };
    this.climbOut = FIT.climb.reach * crowd.scale(this.tapper.a.i);
    this.wife = member(dress('villager', 912, { sex: 'f', hat: 'krama', props: [FEAT.paddle] }));
    this.granny = member(dress('villager', 913, { sex: 'f', age: 'old', hat: 'none' }));
    this.grandpa = member(dress('villager', 914, { sex: 'm', age: 'old', hat: 'krama' }));
    // The daughter at the stall: a palm-leaf hat against the sun.
    this.seller = member(dress('vendor', 916, { sex: 'f', hat: 'palm' }));
    // (the child's bowl and chopsticks only while eating: two looks)
    const kid = dress('kid', 915, { young: true });
    this.kidLooks = { play: kid, eat: { ...kid, feats: [...kid.feats, FEAT.smallBowl] } };
    this.child = member(kid);
    this.family = [this.wife, this.granny, this.grandpa, this.seller, this.child];
    this.everyone = [this.tapper, ...this.family];
    this.animals = new PsYardAnimals(ground);
    this.object = this.animals.object;
    this.climb = new PsClimb(env, (a, path) => this.way(a, path), (x, z) => this.pt(x, z));
    // `tap=<s>` or `tap=<round>:<s>` (a still: the tapper that far into his round).
    const tap = env.params.get('tap');
    if (tap !== null) {
      const [r, s] = tap.includes(':') ? tap.split(':').map(Number) : [0, Number(tap)];
      this.tapAt = { round: ((Math.floor(r) || 0) % ROUNDS.length + ROUNDS.length) % ROUNDS.length, s: Number.isFinite(s) ? s : 0 };
    }
  }

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    const step = this.pace.step(dt, viewDist(f, HUT.x, HUT.z));
    if (step < 0) {
      if (this.shown) {
        for (const a of this.actors) a.hide();
        this.animals.hide();
      }
      this.shown = false;
      return;
    }
    if (step === 0 && this.shown) return;
    dt = step;
    const working = psWorking(f.clock);
    const near = viewDist(f, HUT.x, HUT.z) < 110 && !this.env.shot;
    this.far = !near;
    if (!this.started || working !== this.working) {
      const first = !this.started;
      this.started = true;
      this.working = working;
      if (working) this.dawn(now, first || !near, f.day);
      else for (const m of this.everyone) if (m !== this.tapper || !this.finishing(this.tapper)) this.goHome(m, now, !near);
      if (first && this.tapAt) this.fastForward(now, f);
    }
    // (back in view after a while away: everyone who is out shows again)
    if (!this.shown) for (const m of this.everyone) if (!m.home && now >= m.outAt) m.a.show();
    this.shown = true;
    this.climb.begin(f);
    this.tap(this.tapper, dt, now, f, ex);
    // (the explorer up the yard's ladders: the palm that is the tapper's now, his calls across to him)
    const tp = this.tapper;
    const tpUp = this.isUp(tp);
    this.climb.tapper(!tp.home && (tpUp || tp.job === 'waitEx' || (tp.job === 'walk' && tp.leg >= tp.path.length - 1)) ? ROUNDS[tp.round].palms[tp.pk] : null, tpUp);
    this.climb.calls(tp.a, tpUp || tp.job === 'waitEx', now);
    this.cook(this.wife, dt, now);
    this.pour(this.granny, dt, now, ex);
    this.stoke(this.grandpa, dt, now, f);
    this.sell(this.seller, dt, now, f, ex);
    this.play(this.child, dt, now);
    for (const m of this.family) this.glance(m, now, ex);
    this.animals.update(dt, now, f, ex);
  }

  report(traffic: Traffic): void {
    for (const a of this.actors) if (a.shown && !a.riding) traffic.add(this.name, a.x, a.y, a.z);
    if (this.shown) this.animals.report(traffic);
  }

  subjects(out: Subject[]): void {
    if (this.shown) this.animals.subjects(out);
  }

  // ── The day ──────────────────────────────────────────────────────────────

  /** Work begins (the blue hour): everyone to their places, at once (`warp`: a still, the camera far) or down the house's stair one after another. */
  private dawn(now: number, warp: boolean, day: number): void {
    const t = this.tapper;
    this.everyone.forEach((m, k) => {
      m.home = false;
      m.job = '';
      m.path = [];
      m.leg = 0;
      m.turn = 0;
      m.stairs = [];
      m.goingIn = false;
      m.outAt = 0;
      if (!warp) {
        // (out of the door and down the stair, a few seconds apart; their walks planned from the stair's foot)
        m.outAt = now + k * 3.5;
        m.a.hide();
        m.a.warp(this.foot.x, this.foot.y, this.foot.z, 0);
      }
    });
    // The tapper's first round of the day brings down the night's juice (a different round each day: `day`).
    t.round = this.tapAt?.round ?? day % ROUNDS.length;
    this.startRound(t, now, warp ? this.seatPt() : null);
    this.setJob(this.wife, 'stir', now, 0, warp);
    this.setJob(this.granny, 'mould', now, 0, warp);
    this.setJob(this.grandpa, 'fire', now, 0, warp);
    this.setJob(this.seller, 'sell', now, 0, warp);
    this.setJob(this.child, 'help', now, 0, warp);
  }

  /** Out of the door in the morning (its time come): on the veranda, down the stair, then the job's walk. */
  private comeOut(m: Member, now: number): boolean {
    if (m.outAt <= 0) return true;
    if (now < m.outAt) return false;
    m.outAt = 0;
    const a = m.a;
    a.warp(this.door.x, this.door.y, this.door.z, Math.PI / 2);
    a.riding = true;
    a.show();
    m.stairs = [this.pt2(this.door.x + 0.6, this.door.z + 0.9), this.top, this.foot];
    m.goingIn = false;
    return true;
  }

  /** Dusk: to the house and up its stair and in (or in at once: far from the camera). */
  private goHome(m: Member, now: number, atOnce: boolean): void {
    if (atOnce || !m.a.shown) {
      m.home = true;
      m.stairs = [];
      m.a.hide();
      return;
    }
    m.job = 'home';
    m.since = now;
    m.path = this.way(m.a, [this.foot]);
    m.leg = 0;
  }

  /** A walk from where one is along `path`, round the shed, the house's stair and jars, the racks, the stall (`_scenePalmSugarWays.ts`). */
  private way(a: Actor, path: readonly Point[]): Point[] {
    return psRoute(a.x, a.z, path, (x, z) => this.pt(x, z));
  }

  /** On the house's stair or veranda: the floor's height there; the points walked, then in at the door (hidden) or down on the ground. Busy: true. */
  private onStairs(m: Member, dt: number, now: number): boolean {
    if (!m.stairs.length) return false;
    const a = m.a;
    const g = m.stairs[0];
    a.riding = true;
    a.y = this.stairY(a.z);
    a.goTo(g.x, g.z, STAIRS);
    a.face(null);
    a.pose(POSE.stand, now);
    a.carry(1, now);
    a.lookAt(null);
    a.step(dt, now);
    if (a.dist(g.x, g.z) < 0.12) {
      m.stairs.shift();
      if (!m.stairs.length) {
        if (m.goingIn) {
          m.home = true;
          a.hide();
        } else {
          // (on the ground: the rest of the walk to the job, round what is in the way)
          a.riding = false;
          m.path = this.way(a, m.path.slice(m.leg));
          m.leg = 0;
        }
      }
    }
    return true;
  }

  /** The floor's height at z on the stair (the veranda north of its top, the ground south of its foot). */
  private stairY(z: number): number {
    const t = Math.min(1, Math.max(0, (this.stairFootZ - z) / (this.stairFootZ - this.stairTopZ)));
    return this.groundY + (this.floorY - this.groundY) * t;
  }

  /** At the stair's foot on the way home: up it and in. */
  private upAndIn(m: Member): void {
    m.stairs = [this.top, this.pt2(this.door.x + 0.6, this.door.z + 0.9), this.door];
    m.goingIn = true;
  }

  /** The still's tapper that far into his round (`tap=`): his day run on, in steps, before the warm-up. */
  private fastForward(now: number, f: MapFrame): void {
    const target = Math.max(0, (this.tapAt?.s ?? 0) - WARMUP);
    const t = this.tapper;
    t.round = this.tapAt?.round ?? 0;
    this.startRound(t, now - target, this.seatPt());
    for (let k = 0, u = now - target; k < target * 10; k++, u += 0.1) this.tap(t, 0.1, u, f, null, true);
  }

  /** Is the tapper up a palm (climbing, working, coming down)? */
  private isUp(t: Tapper): boolean {
    return t.job === 'up' || t.job === 'work' || t.job === 'down';
  }

  /** At dusk he finishes what he is at before going home: down off the palm, the juice poured into the jars. */
  private finishing(t: Tapper): boolean {
    return this.isUp(t) || t.job === 'carry' || t.job === 'pour';
  }

  // ── The tapper ───────────────────────────────────────────────────────────

  private seatPt(): Point {
    const [x, z] = hutWorld(SEAT);
    return this.pt(x, z);
  }

  /** A new round from the bench (or `at`: put there; null and not resting: from where he is), the gear look, the way to the first palm. */
  private startRound(t: Tapper, now: number, at: Point | null): void {
    const fromBench = at !== null || t.job === 'rest';
    t.pk = 0;
    t.s = 0;
    this.dressAs(t, t.looks.gear);
    if (at) {
      t.a.warp(at.x, at.y, at.z, Math.PI / 2);
      t.a.show();
    }
    t.job = 'walk';
    t.since = now;
    // (out from the bench into the forecourt first)
    t.path = this.way(t.a, [...(fromBench ? [this.pt(HUT.x + 6.1, HUT.z - 1.2)] : []), ...this.wayTo(t, 0)]);
    t.leg = 0;
  }

  /** The way to palm `k` of his round: its points, then the ladder's foot. */
  private wayTo(t: Tapper, k: number): Point[] {
    const r = ROUNDS[t.round];
    const p = this.palm(r.palms[k]);
    const d = poleOut(p, 0) + this.climbOut + 0.08;
    return [...r.ways[k].map(([x, z]) => this.pt(x, z)), this.pt(p.x + p.lx * d, p.z + p.lz * d)];
  }

  private palm(id: string): PsPalm {
    return this.plan.byId[id];
  }

  /** One step of the tapper's round. `quick`: a fast-forward (no sounds). */
  private tap(t: Tapper, dt: number, now: number, f: MapFrame, ex: Obstacle | null, quick = false): void {
    const a = t.a;
    if (t.home) return;
    if (!quick && !this.comeOut(t, now)) return;
    if (this.onStairs(t, dt, now)) return;
    const r = ROUNDS[t.round];
    const p = this.palm(r.palms[Math.min(t.pk, r.palms.length - 1)]);
    const top = p.crown - p.y - WORK_DROP;
    const hear = !quick && f.dt > 0 && len2(f.listener.x - a.x, f.listener.z - a.z) < HEAR;
    // Going home at dusk (once off the palm and the juice poured: `finishing`).
    if (!this.working && t.job !== 'home' && !this.finishing(t)) {
      this.dressAs(t, t.looks.bare);
      this.goHome(t, now, this.far || !a.shown);
      if (t.home) return;
    }
    // A storm coming: nobody climbs a palm in the wind and lightning; back under the roof to wait it out.
    if ((t.job === 'walk' || t.job === 'waitEx') && f.weather.storm > STORM) {
      this.dressAs(t, t.looks.bare);
      this.toSeat(t, t.pk > 0);
    }
    switch (t.job) {
      case 'walk':
      case 'carry':
      case 'home':
      case 'toSeat': {
        if (this.walk(t, t.job === 'home' ? WALK * 1.05 : WALK, now)) {
          if (t.job === 'walk' && this.climb.blocks(p.id, a.x, a.z, ex)) {
            // The explorer is up this palm (or in the way at its foot): he waits a few steps off (_scenePalmSugarClimb.ts).
            t.job = 'waitEx';
            t.since = now;
            t.path = this.way(a, [this.climb.waitSpot(p.x, p.z, p.lx, p.lz)]);
            t.leg = 0;
          } else if (t.job === 'walk') {
            // At the ladder's foot: onto the ladder.
            t.job = 'up';
            t.since = now;
            t.s = 0;
            t.knockAt = now + 0.6;
          } else if (t.job === 'carry') {
            t.job = 'pour';
            t.since = now;
            t.until = now + POUR_S;
            a.stop(-Math.PI / 2 - 0.35);
          } else if (t.job === 'toSeat') {
            t.job = 'rest';
            t.until = now + REST[0] + (REST[1] - REST[0]) * hash3(t.round, Math.floor(now), 3, 9321);
            a.stop(Math.PI / 2);
          } else {
            t.job = 'in';
            this.upAndIn(t);
          }
        }
        a.pose(POSE.stand, now);
        a.carry(1, now);
        if (!t.home) {
          a.lookAt(null);
          a.step(dt, now);
        }
        return;
      }
      case 'waitEx': {
        // Waiting for the explorer to be off his palm, looking up at him; then back to its foot and up.
        const there = this.walk(t, WALK, now);
        const d = poleOut(p, 0) + this.climbOut + 0.08;
        const fx = p.x + p.lx * d;
        const fz = p.z + p.lz * d;
        a.pose(POSE.stand, now);
        a.carry(1, now);
        a.lookAt(there && PALM_CLIMB.palm === p.id ? this.climb.exHead() : null, now + 0.5);
        a.step(dt, now);
        if (there && now - t.since > 1.5 && !this.climb.blocks(p.id, fx, fz, ex)) {
          t.job = 'walk';
          t.path = this.way(a, [this.pt(fx, fz)]);
          t.leg = 0;
        }
        return;
      }
      case 'up': {
        t.s = Math.min(top, t.s + CLIMB_UP * dt);
        this.onLadder(t, p, now, 1, a.crowd.climbRate(a.i, CLIMB_UP), null);
        if (hear && now >= t.knockAt) {
          t.knockAt = now + 2 / Math.max(0.1, a.crowd.climbRate(a.i, CLIMB_UP));
          f.calls.push({ kind: 'knock', x: a.x, y: a.y + 0.2, z: a.z, gain: 0.3 });
        }
        if (t.s >= top) {
          t.job = 'work';
          t.since = now;
          t.until = now + WORK[0] + (WORK[1] - WORK[0]) * hash3(p.seed, t.round, 5, 9322);
          t.chopAt = now + 1.5;
          t.knockAt = now + (t.until - now) * 0.55;
        }
        return;
      }
      case 'work': {
        // The knife at the flower stalk over the tube on his right (the pose's hand is there), a glance at the
        // one on his left now and then; then down the ladder.
        const tubes = this.work[p.id]?.tubes ?? [];
        const tube = tubes.length > 1 ? tubes[(now - t.since) % 7 < 5.5 ? 1 : 0] : tubes[0];
        _look.x = tube ? tube.x : p.x;
        _look.y = tube ? tube.top : p.crown;
        _look.z = tube ? tube.z : p.z;
        this.onLadder(t, p, now, 0, 0, _look);
        if (hear && now >= t.chopAt) {
          t.chopAt = now + 1.4 + 2.2 * hash3(Math.floor(now * 3), 7, 5, 9323);
          f.calls.push({ kind: 'chop', x: _look.x, y: _look.y, z: _look.z, gain: 0.55 });
        }
        if (hear && now >= t.knockAt) {
          t.knockAt = now + 1e9;
          f.calls.push({ kind: 'knock', x: _look.x, y: _look.y - 0.3, z: _look.z, gain: 0.5 });
        }
        if (now >= t.until) {
          t.job = 'down';
          t.since = now;
          t.knockAt = now + 0.5;
        }
        return;
      }
      case 'down': {
        t.s = Math.max(0, t.s - CLIMB_DOWN * dt);
        this.onLadder(t, p, now, 1, a.crowd.climbRate(a.i, -CLIMB_DOWN), null);
        if (hear && now >= t.knockAt) {
          t.knockAt = now + 2 / Math.max(0.1, a.crowd.climbRate(a.i, CLIMB_DOWN));
          f.calls.push({ kind: 'knock', x: a.x, y: a.y + 0.2, z: a.z, gain: 0.25 });
        }
        if (t.s <= 0) {
          // Off the ladder, a step back from it.
          const d = poleOut(p, 0) + this.climbOut + 0.1;
          const x = p.x + p.lx * d;
          const z = p.z + p.lz * d;
          a.warp(x, this.env.ground.field.heightAt(x, z), z, Math.atan2(-p.lx, -p.lz));
          a.show();
          if (this.working && t.pk + 1 < r.palms.length) {
            t.pk++;
            t.job = 'walk';
            t.path = this.way(a, this.wayTo(t, t.pk));
            t.leg = 0;
          } else {
            // The round done (or dusk: done for the day): the full tubes on the shoulder pole, home to the jars —
            // from the round's last palm its own way back; from a palm before it round the shed's north end.
            this.dressAs(t, t.looks.pole);
            t.job = 'carry';
            const [px, pz] = hutWorld(POUR);
            const last = t.pk === r.palms.length - 1;
            const back = last ? r.ways[r.palms.length].map(([x, z]) => this.pt(x, z)) : this.carryBack(p);
            t.path = this.way(a, [...back, this.pt(FORECOURT.x, FORECOURT.z), this.pt(px + 1.0, pz + 0.4), this.pt(px, pz)]);
            t.leg = 0;
          }
        }
        return;
      }
      case 'pour': {
        // Pouring the tubes through the cloth into the jar.
        a.pose(POSE.give, now);
        a.carry(0, now);
        a.lookAt(null);
        a.step(dt, now);
        if (now >= t.until) {
          this.dressAs(t, t.looks.bare);
          if (this.working) this.toSeat(t);
          else this.goHome(t, now, this.far);
        }
        return;
      }
      case 'rest': {
        // On the bench, facing the lane; then the next round.
        a.pose(POSE.stool, now);
        a.lookAt(ex && len2(ex.x - a.x, ex.z - a.z) < 6 ? this.exHead(ex) : null, now + 0.5);
        a.step(dt, now);
        if (now >= t.until && this.working && f.weather.storm <= STORM) {
          t.round = (t.round + 1) % ROUNDS.length;
          this.startRound(t, now, null);
        }
        return;
      }
      default:
        return;
    }
  }

  /** From a yard palm before the round's last (dusk cut the round short): back to the forecourt round the house and the shed. */
  private carryBack(p: PsPalm): Point[] {
    if (p.id === 'g1') return [this.pt(370.6, -6.5), this.pt(371.4, -2.6), this.pt(376.5, 1.6), this.pt(382, 3.4)];
    if (p.id === 'g4') return [this.pt(393.3, -12.5), this.pt(393.3, -3)];
    return [this.pt(HUT.x + 7, Math.max(-8, Math.min(8, p.z)))];
  }

  /** To the bench, to rest: from the jars, or (`home`) from out on his round, back the round's own way (along the dikes). */
  private toSeat(t: Tapper, home = false): void {
    t.job = 'toSeat';
    const [sx, sz] = hutWorld(SEAT);
    const r = ROUNDS[t.round];
    const back = home ? r.ways[r.palms.length].map(([x, z]) => this.pt(x, z)) : [];
    t.path = this.way(t.a, [...back, this.pt(HUT.x + 4.1, HUT.z + 0.5), this.pt(sx + 0.8, sz), this.pt(sx, sz)]);
    t.leg = 0;
  }

  /** On the ladder: feet `t.s` m up the pole, facing the trunk, swaying with the palm; the climb's cycle at `hz` (backwards: down). */
  private onLadder(t: Tapper, p: PsPalm, now: number, walk: number, hz: number, look: Point | null): void {
    const a = t.a;
    const c = a.crowd;
    const d = poleOut(p, t.s) + this.climbOut;
    palmBend(this.specs[p.id], t.s + 1.2, _bend);
    const x = p.x + p.lx * d + _bend.x;
    const y = p.y + t.s;
    const z = p.z + p.lz * d + _bend.z;
    const yaw = Math.atan2(-p.lx, -p.lz);
    a.ride(x, y, z, yaw);
    if (!a.shown) a.show();
    c.place(a.i, x, y, z, yaw);
    c.gait(a.i, walk, hz, now);
    a.pose(POSE.climb, now);
    a.carry(0, now);
    // The head: at the explorer while greeting him (held), else at the work, else up the ladder.
    const h = a.held;
    const at = h ? h.at : look;
    if (at) {
      const yawTo = wrap(Math.atan2(at.x - x, at.z - z) - yaw);
      const eye = y + 1.25 * c.scale(a.i);
      const pitch = -Math.atan2(at.y - eye, Math.max(0.5, len2(at.x - x, at.z - z))) / 0.6 + (h ? h.nod : 0);
      c.look(a.i, Math.abs(yawTo) < 1.6 ? yawTo : 0, pitch, now);
    } else c.look(a.i, 0, walk > 0 && hz < 0 ? 0.35 : -0.45, now);
  }

  private dressAs(m: Member, look: Look): void {
    if (m.a.look === look) return;
    m.a.look = look;
    this.env.crowd.dress(m.a.i, look);
  }

  // ── The family in the yard ───────────────────────────────────────────────

  /** A spot in the shed's frame as a point on the ground. */
  private at(l: Local): Point {
    const [x, z] = hutWorld(l);
    return this.pt(x, z);
  }

  private pt(x: number, z: number): Point {
    return { x, y: this.env.ground.field.heightAt(x, z), z };
  }

  /** A point on the house's veranda (its floor's height). */
  private pt2(x: number, z: number): Point {
    return { x, y: this.floorY, z };
  }

  /** Start a job: where it is (a path there), for how long; `warp`: there at once. */
  private setJob(m: Member, job: string, now: number, k: number, warp: boolean): void {
    m.job = job;
    m.k = k;
    m.since = now;
    const r = hash3(m.a.i, m.turn, k, 9331);
    const spot = this.spotOf(m, job, k);
    m.until = now + this.lengthOf(job) * (0.75 + 0.5 * r);
    m.path = warp || !m.a.shown ? spot.path : this.way(m.a, spot.path);
    m.leg = 0;
    if (warp) {
      const end = spot.path[spot.path.length - 1];
      m.a.warp(end.x, end.y, end.z, spot.yaw);
      m.a.show();
      m.leg = spot.path.length;
    }
    m.a.face(spot.yaw);
  }

  /** How long a job lasts (s, before its seeded share). */
  private lengthOf(job: string): number {
    return ({ stir: 24, ladle: 6, fill: 4, mould: 46, dry: 12, fire: 22, fetch: 4, nap: 90, sell: 40, tidy: 6, help: 26, eat: 24, play: 20, watch: 60 } as Record<string, number>)[job] ?? 20;
  }

  /** Where a job is done (a path from where they are, the last point the place) and which way they face there. */
  private spotOf(m: Member, job: string, k: number): { path: Point[]; yaw: number } {
    // (the stirring side: where the paddle reaches the wok's middle, `FIT.wok`)
    const sx = STOVE.x - FIT.wok.z * m.a.crowd.scale(m.a.i);
    const stir = (w: number) => this.at({ x: sx, z: WOKS[w] });
    switch (job) {
      case 'stir':
        return { path: [stir(k)], yaw: Math.PI / 2 };
      case 'ladle':
        // (round the south end of the stove to the jars)
        return { path: [this.at({ x: sx, z: 1.95 }), this.at({ x: 0.5, z: 2.25 })], yaw: 2.1 };
      case 'fill':
        return { path: [this.at({ x: sx, z: 1.95 }), stir(0)], yaw: Math.PI / 2 };
      case 'mould':
        return { path: [this.at({ x: GRANNY.x + 0.1, z: 3.9 }), this.at(GRANNY)], yaw: Math.PI / 2 };
      case 'dry': {
        // (out of the shed's south side, into the aisle between the racks: turning the cakes on one or the other)
        const x = DRY_AT.xs[k % DRY_AT.xs.length];
        return { path: [this.at({ x: GRANNY.x + 0.1, z: 3.9 }), this.pt(384.0, DRY_AT.z), this.pt(x, DRY_AT.z)], yaw: k % 2 ? 0 : Math.PI };
      }
      case 'fire':
        return { path: [this.at({ x: FIRE_X, z: WOKS[k] })], yaw: -Math.PI / 2 };
      case 'fetch':
        return { path: [this.at({ x: FIRE_X - 0.1, z: -5.1 }), this.at(PILE_AT)], yaw: -2.4 };
      case 'nap': {
        // (round the shed's north end to the house, under it to the hammock's side)
        const hx = HOME.x + HAMMOCK.x;
        const hz = HOME.z + (HAMMOCK.z0 + HAMMOCK.z1) / 2;
        return { path: [this.pt(hx + 0.7, hz)], yaw: -Math.PI / 2 };
      }
      case 'sell':
      case 'tidy': {
        const x = STALL.x + SELL_SEAT.x + (job === 'tidy' ? 0.2 : 0);
        const z = STALL.z + SELL_SEAT.z + (job === 'tidy' ? (hash3(m.turn, 2, 1, 9332) - 0.5) * 1.2 : 0);
        return { path: [this.pt(STALL.x - 1.6, STALL.z + 2.2), this.pt(x, z)], yaw: Math.PI / 2 };
      }
      case 'help':
        return { path: [this.at({ x: (MAT.x0 + MAT.x1) / 2, z: MAT.z1 + 0.5 })], yaw: Math.PI };
      case 'eat': {
        // (on the little stool by the bench, facing the lane)
        const [x, z] = hutWorld(KID_STOOL);
        return { path: [this.pt(x + 1.0, z), this.pt(x, z)], yaw: Math.PI / 2 };
      }
      case 'play': {
        // A loop round the yard between the house and the shed, after the hens.
        const loop: [number, number][] = [
          [381.8, -3.2],
          [381.2, 2.5],
          [378.2, 4.2],
          [374.4, 1.8],
          [373.6, -2.4],
          [377.5, -2.6],
        ];
        const o = Math.floor(hash3(m.turn, 3, 1, 9333) * loop.length);
        return { path: [...loop.slice(o), ...loop.slice(0, o), loop[o]].map(([x, z]) => this.pt(x, z)), yaw: 0 };
      }
      case 'watch': {
        const p = this.plan.palms[k];
        if (!p) return { path: [this.at(GRANNY)], yaw: 0 };
        // (a few metres from the palm's foot on the yard's side, looking up at father)
        const dx = HUT.x - p.x;
        const dz = HUT.z - p.z;
        const l = len2(dx, dz) || 1;
        const x = p.x + (dx / l) * 3.2 - (dz / l) * 1.1;
        const z = p.z + (dz / l) * 3.2 + (dx / l) * 1.1;
        return { path: [this.pt(x, z)], yaw: Math.atan2(p.x - x, p.z - z) };
      }
      default:
        return { path: [this.at(GRANNY)], yaw: 0 };
    }
  }

  /** The yard palm father is climbing (or about to), if near: the child goes to watch (its index in the plan's palms). */
  private watchPalm(): number {
    const t = this.tapper;
    if (t.home || (!this.isUp(t) && !(t.job === 'walk' && t.leg >= t.path.length - 1))) return this.exPalm();
    const id = ROUNDS[t.round].palms[t.pk];
    return id.startsWith('g') ? this.plan.palms.findIndex((p) => p.id === id) : this.exPalm();
  }

  /** The yard palm the explorer is climbing (father is not up one near): the child goes to watch him (its index in the plan's palms), or −1. */
  private exPalm(): number {
    const id = PALM_CLIMB.palm;
    return id && id.startsWith('g') ? this.plan.palms.findIndex((p) => p.id === id) : -1;
  }

  /** Walk the member's path; true on arrival at its end. */
  private walk(m: Member, speed: number, now: number): boolean {
    const a = m.a;
    if (m.leg >= m.path.length) return true;
    const g = m.path[m.leg];
    a.goTo(g.x, g.z, speed);
    a.face(null);
    if (a.dist(g.x, g.z) < (m.leg === m.path.length - 1 ? 0.15 : 0.3)) m.leg++;
    return m.leg >= m.path.length && now >= 0;
  }

  /** The common step of a family member: out of the house, walk to the job's place, then the job's pose; home at dusk. */
  private member(m: Member, dt: number, now: number, pose: Pose, speed = WALK): boolean {
    const a = m.a;
    if (m.home) return false;
    if (!this.comeOut(m, now)) return false;
    if (this.onStairs(m, dt, now)) return false;
    if (m.job === 'home') {
      if (this.walk(m, speed, now)) {
        m.job = 'in';
        this.upAndIn(m);
        return false;
      }
      a.pose(POSE.stand, now);
      a.step(dt, now);
      return false;
    }
    if (!this.working) {
      this.goHome(m, now, !a.shown);
      return false;
    }
    const there = this.walk(m, speed, now);
    a.pose(there ? pose : POSE.stand, now);
    a.step(dt, now);
    return there;
  }

  /** The wife: stirring, wok to wok; now and then fresh juice from the jars into the first wok. */
  private cook(m: Member, dt: number, now: number): void {
    // The explorer's tube (he swapped one up a yard palm): she meets him at its foot, takes it and gives him a cup,
    // then pours his juice into the first wok (her `fill`; _scenePalmSugarClimb.ts).
    const c = this.climb.cook(m.a, dt, now, m.home || m.outAt > 0 || m.stairs.length > 0 || m.job === 'home' || m.job === 'in');
    if (c === 'busy') return;
    if (c) {
      m.turn++;
      this.setJob(m, c === 'fill' ? 'fill' : 'stir', now, c === 'fill' ? 0 : 1, false);
    }
    const pose = m.job === 'stir' ? POSE.stir : POSE.give;
    const there = this.member(m, dt, now, pose);
    // (pouring his juice in: she stays on the job until it is all in)
    if (this.climb.pouring(m.a, !m.home && (m.job === 'fill' || m.job === 'home' || m.job === 'in'), there && m.job === 'fill', now)) m.until = Math.max(m.until, now + 0.1);
    if (!this.idle(m, now)) return;
    m.turn++;
    if (m.job === 'ladle') this.setJob(m, 'fill', now, 0, false);
    else if (m.job === 'stir' && m.turn % 4 === 3) this.setJob(m, 'ladle', now, 0, false);
    else this.setJob(m, 'stir', now, [1, 2, 0, 1][m.turn % 4], false);
  }

  /** Done with the job at hand (out, at the place, its time up)? */
  private idle(m: Member, now: number): boolean {
    return !m.home && m.job !== 'home' && m.job !== 'in' && !m.stairs.length && m.outAt <= 0 && now >= m.until && m.leg >= m.path.length;
  }

  /** The grandmother: pouring syrup into the rings, and out to the racks to turn the cakes; a taste for the explorer. */
  private pour(m: Member, dt: number, now: number, ex: Obstacle | null): void {
    this.member(m, dt, now, m.job === 'mould' ? POSE.squat : POSE.give);
    if (!m.home && m.job === 'mould' && ex && !this.env.shot && now - this.tasteAt > 150 && len2(ex.x - m.a.x, ex.z - m.a.z) < 4 && m.a.shown) {
      this.tasteAt = now;
      const a = m.a;
      this.env.bubble.say('psTaste', () => ({ x: a.x, y: a.y + 2.3 * (a.crowd.scale(a.i) / 1.4), z: a.z }), 3.6);
    }
    if (!this.idle(m, now)) return;
    m.turn++;
    this.setJob(m, m.job === 'mould' ? 'dry' : 'mould', now, m.turn, false);
  }

  /** The grandfather: feeding the fires, mouth to mouth; fronds from the pile; a nap in the hammock in the midday heat. */
  private stoke(m: Member, dt: number, now: number, f: MapFrame): void {
    const napping = m.job === 'nap' && m.leg >= m.path.length && !m.home;
    if (napping) {
      // In the hammock, rocking a little: lying along it, the head to its north end.
      const a = m.a;
      const hz = HOME.z + (HAMMOCK.z0 + HAMMOCK.z1) / 2 + 0.35;
      const sway = 0.05 * Math.sin(now * 1.1);
      // (the explorer got into it while he came: no nap, back to the fire; roam/_hammock.ts)
      const taken = hammockTaken(HOME.x + HAMMOCK.x, HOME.z + (HAMMOCK.z0 + HAMMOCK.z1) / 2);
      if (!taken) {
        a.ride(HOME.x + HAMMOCK.x + sway, this.groundY + HAMMOCK.y + 0.02, hz, 0);
        a.pose(POSE.hammock, now);
        a.lookAt(null);
        a.step(dt, now);
      }
      const c = f.clock - Math.floor(f.clock);
      if (taken || ((c < NAP[0] || c > NAP[1] || !this.working) && now >= m.since + 20)) {
        // (up again: back to the fire)
        a.riding = false;
        const [x, z] = [HOME.x + HAMMOCK.x + 0.7, hz - 0.35];
        a.warp(x, this.pt(x, z).y, z, Math.PI / 2);
        m.turn++;
        if (this.working) this.setJob(m, 'fire', now, 1, false);
        else this.goHome(m, now, this.far);
      }
      return;
    }
    this.member(m, dt, now, m.job === 'fire' ? POSE.squat : POSE.give);
    if (!this.idle(m, now)) return;
    m.turn++;
    const c = f.clock - Math.floor(f.clock);
    if (c >= NAP[0] && c < NAP[1] && m.job === 'fire' && !hammockTaken(HOME.x + HAMMOCK.x, HOME.z + (HAMMOCK.z0 + HAMMOCK.z1) / 2)) this.setJob(m, 'nap', now, 0, false);
    else if (m.job === 'fire' && m.turn % 3 === 2) this.setJob(m, 'fetch', now, 0, false);
    else this.setJob(m, 'fire', now, [1, 2, 0][m.turn % 3], false);
  }

  /** The daughter at the stall: on her stool behind the table, up now and then to set the goods straight; a call to the explorer passing by. */
  private sell(m: Member, dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    const there = this.member(m, dt, now, m.job === 'sell' ? POSE.stool : POSE.give);
    if (there && m.job === 'sell') m.a.lookAt(ex && len2(ex.x - BUY.x, ex.z - BUY.z) < 9 ? this.exHead(ex) : null, now + 0.5);
    if (there && ex && !this.env.shot && m.a.shown && now - this.callAt > CALL_EVERY && f.weather.storm <= STORM && len2(ex.x - BUY.x, ex.z - BUY.z) < CALL_NEAR) {
      this.callAt = now;
      const a = m.a;
      this.env.bubble.say('psSell', () => ({ x: a.x, y: a.y + 2.3 * (a.crowd.scale(a.i) / 1.4), z: a.z }), 3.6);
    }
    if (!this.idle(m, now)) return;
    m.turn++;
    this.setJob(m, m.job === 'sell' && m.turn % 3 === 2 ? 'tidy' : 'sell', now, 0, false);
  }

  /** The child: helping, tasting, running round the yard, watching father climb. */
  private play(m: Member, dt: number, now: number): void {
    const p = this.watchPalm();
    // Father going up a palm near the yard: off to watch (to the next one when he moves on).
    if (p >= 0 && (m.job !== 'watch' || m.k !== p) && m.job !== 'home' && m.job !== 'in' && !m.home && !m.stairs.length && m.outAt <= 0 && this.working) this.setJob(m, 'watch', now, p, false);
    this.dressAs(m, m.job === 'eat' && m.leg >= m.path.length ? this.kidLooks.eat : this.kidLooks.play);
    const pose = m.job === 'help' ? POSE.squat : m.job === 'eat' ? POSE.eat : m.job === 'watch' ? POSE.look : POSE.stand;
    const there = this.member(m, dt, now, pose, m.job === 'play' || m.job === 'watch' ? RUN : WALK * 1.1);
    if (m.job === 'watch' && there) {
      // (at father, or at the explorer up the palm)
      const a = this.tapper.a;
      _look.x = a.x;
      _look.y = a.y + 1.6;
      _look.z = a.z;
      m.a.lookAt(PALM_CLIMB.palm && PALM_CLIMB.palm === this.plan.palms[m.k]?.id ? this.climb.exHead() : _look, now + 0.5);
    }
    if (m.home || m.job === 'home' || m.job === 'in' || m.stairs.length || m.outAt > 0) return;
    const done = m.job === 'play' ? m.leg >= m.path.length : m.job === 'watch' ? p < 0 : now >= m.until && m.leg >= m.path.length;
    if (!done) return;
    m.turn++;
    this.setJob(m, ['eat', 'play', 'help'][m.turn % 3], now, 0, false);
  }

  /** A look at the explorer when he comes close. */
  private glance(m: Member, now: number, ex: Obstacle | null): void {
    if (!ex || m.home || !m.a.shown || m.job === 'watch' || m.job === 'nap') return;
    if (len2(ex.x - m.a.x, ex.z - m.a.z) < 3.5 && now - m.lookAt > 12) m.lookAt = now;
    if (now - m.lookAt < 2.5) m.a.lookAt(this.exHead(ex), now + 0.3);
  }

  private exHead(ex: Obstacle): Point {
    _ex.x = ex.x;
    _ex.y = ex.y + 2;
    _ex.z = ex.z;
    return _ex;
  }
}
