import type { Object3D } from 'three';
import { hash3 } from '../../voxel/random';
import { CH, Flock } from '../fauna/_kit';
import { EV_BUILT, EV_HERD_WAY, EV_KIOSK, EV_MEADOW, EV_PEN, EV_PLAY, EV_SALA, EV_SPOTS, EV_TAMARIND, EV_WASH_AT, evDeck, evToWorld, type EvHomeSpots } from '../hamlet/_evSpots';
import type { HeightField } from '../heightfield';
import { WalkMap } from '../roam/walkmap';
import type { MapFrame, MapPart, Subject } from '../types';
import type { WordKey } from '../ui/lang';
import { Actor } from './_actor';
import { Bicycle, BIKE_WHEEL } from './_bicycle';
import { dress } from './_kinds';
import { OX } from './_ox';
import { CARRY, FEAT, FIT, PEOPLE_SCALE, POSE, type Pose } from './_personModel';
import { Ground, len, type Obstacle, type Point, type Traffic } from './_routes';
import { Pace, viewDist, type PeopleEnv, type PeopleScene } from './_scene';

/**
 * Life in the sugar-palm village (hamlet/_eastVillage.ts; its spots
 * `EV_SPOTS`), through the day, busiest at dawn and at dusk:
 *
 * - the cooks: squatting at their kitchen huts' stoves at dawn and supper
 *   (the knife, the fire: `chop`, `crackle`), a woman weaving at her loom
 *   under the house by day, one sweeping her yard in the morning, one
 *   washing clothes at the landing at the foot of the stream steps;
 * - grandparents lying in the hammocks under the houses by day (rocking a
 *   little), out on the verandas under the lamps in the evening; the old
 *   man sitting at the sala in the early morning;
 * - a man squatting at his ox cart's wheel, another mending a net under
 *   his house;
 * - children: two playing tag in the south yard, who run down the steps to
 *   the stream to splash in the late afternoon (`splashPlay`; not in snow), two kicking
 *   a ball at the Kulen trail's corner under the tamarind; they call
 *   "hello!" to the explorer when he comes near (`kidHello`) and laugh
 *   (`laugh`);
 * - bicycles along the street all day (a woman with a basket, a boy) over
 *   the foot bridge, ringing their bells as they pass him (`bikeBell`); the
 *   shopkeeper on her stool behind her counter;
 * - the herd boy and three white cattle: out over the bridge to graze on
 *   the far bank in the morning, home along the street at dusk into the pen
 *   (their bells: `cowBell`), dozing in the pen at night;
 * - at night everyone is in (the lamps are lit); in heavy rain the
 *   children and the riders go in, the washing waits.
 *
 * They stand on the village's real floors (verandas, stairs, the steps: a
 * walk map of the village's blocks; riders and cattle cross on the bridge's
 * deck, `evDeck`). Far off they step less often, and hide (`Pace`);
 * whoever is settled (sitting, lying, squatting) is stepped only while the
 * camera is near. When he comes by, the grandmother asks him the Khmer way,
 * "ញ៉ាំបាយហើយឬនៅ ចៅ?" (have you eaten yet?), the shopkeeper what he needs,
 * the children call "សួស្ដី!" (bubbles: the `ev…` words; not in stills).
 * Checks: `people=eastvillage` with `clock=` for the hour; `evherd=<m>`
 * holds the herd that far along its way home from the meadow (≈ 0‥115).
 */

/** The village's middle (for the pace); how near the explorer comes before the children call to him (m). */
const MID = { x: 412, z: -63 };
const HELLO = 9;
/** Someone settled at their place (sitting, lying, squatting) is stepped only while the camera is this near (m): farther, their pose stands as written. */
const SETTLED_NEAR = 70;
/** Walking pace between their places (m/s). */
const WALK = 0.8;
/** Heavy rain: children and riders go in. */
const DOWNPOUR = 0.55;

/** A place and what someone does there, over a window of the clock. */
interface Act {
  /** The clock's window (it may wrap past 1). */
  from: number;
  to: number;
  x: number;
  z: number;
  /** Over the ground (m): on a floor (a veranda) the walk map finds it; with `ride`, placed exactly this high. */
  lift: number;
  yaw: number;
  pose: Pose;
  /** Placed exactly (a hammock, a bed platform), not stood on the floor. */
  ride?: boolean;
  /** Rocking a little (a hammock). */
  rock?: boolean;
  /** Wanders round the spot within this (m): sweeping a yard. */
  roam?: number;
  /** Holds the prop the carry way. */
  carry?: boolean;
  /** Ways in, walked in order (and out, backwards): the stair's foot and head, the stream steps. */
  via?: Way[];
  /** The work there makes sounds now and then (a cook: the knife, the fire). */
  cook?: boolean;
}

/** A point on the way (world x, z; over the ground). */
interface Way {
  x: number;
  z: number;
  lift: number;
}

interface Villager {
  a: Actor;
  acts: Act[];
  cur: Act | null;
  /** Walking to `cur` (or in, when `cur` is null): the points, and which one is next. */
  path: Way[];
  leg: number;
  /** A sweeper's heading round her yard, and when she turns next (s). */
  wander: number;
  next: number;
}

const inWindow = (c: number, a: { from: number; to: number }): boolean => (a.from <= a.to ? c >= a.from && c < a.to : c >= a.from || c < a.to);

/** The ground or the bridge's deck under (x, z). */
function deckOrGround(field: HeightField, x: number, z: number): number {
  const d = evDeck(x, z);
  return Number.isNaN(d) ? field.heightAt(x, z) : d;
}

/** Scratch point (no allocation a frame). */
const P: Point = { x: 0, y: 0, z: 0 };

export class EastVillageLife implements PeopleScene {
  readonly name = 'eastvillage';
  readonly actors: Actor[] = [];
  readonly object?: Object3D;
  private readonly ground: Ground;
  private readonly pace = new Pace(110, 380);
  private readonly folk: Villager[] = [];
  private readonly tag: Actor[] = [];
  private readonly ballers: Actor[] = [];
  private readonly riders: Rider[] = [];
  private readonly herd: Herd | null = null;
  private readonly ball: number = -1;
  private shown = false;
  private laughAt = 0;
  private soundAt = 0;
  private splashAt = 0;
  /** The children's "hello!": whether each group has called to him on this visit, and when (s). */
  private readonly hello = { tag: { said: false, at: -1e9 }, ball: { said: false, at: -1e9 } };
  /** Grown-ups who say something to him when he comes near (once, until he has gone away again). */
  private readonly callouts: { a: Actor; key: WordKey; near: number; said: boolean }[] = [];
  /** The speaker's head for the bubble (reused). */
  private readonly head: Point = { x: 0, y: 0, z: 0 };

  constructor(private readonly env: PeopleEnv, scene: Object3D) {
    const village = scene.getObjectByName('eastVillage');
    this.ground = env.ground;
    // (no village built, no village life)
    if (!village || !EV_BUILT.size) return;
    const parts: MapPart[] = [{ name: 'hamlet', object: village }];
    for (const o of scene.children) if (o.name === 'path') parts.push({ name: 'path', object: o });
    this.ground = new Ground(env.ground.field, new WalkMap(env.ground.field, parts));
    const homes = new Map<string, EvHomeSpots>();
    for (const h of EV_SPOTS.homes) if (EV_BUILT.has(h.id)) homes.set(h.id, h);
    const H = (id: string) => homes.get(id);
    const actor = (look: ReturnType<typeof dress>, dodge = true) => {
      const a = new Actor(env.crowd, look, this.ground);
      if (dodge) a.avoid(env.traffic, this.name);
      this.actors.push(a);
      return a;
    };
    const person = (look: ReturnType<typeof dress>, acts: Act[], say?: WordKey): Actor | null => {
      if (!acts.length) return null;
      const a = actor(look);
      this.folk.push({ a, acts, cur: null, path: [], leg: 0, wander: 0, next: 0 });
      if (say) this.callouts.push({ a, key: say, near: 4.5, said: false });
      return a;
    };
    const up = (h: EvHomeSpots): Way[] => [
      { x: h.stairFoot.x, z: h.stairFoot.z, lift: 0 },
      { x: h.stairTop.x, z: h.stairTop.z, lift: h.stairTop.lift },
    ];
    const seat = (h: EvHomeSpots, k: number, from: number, to: number): Act => ({ from, to, x: h.seats[k].x, z: h.seats[k].z, lift: h.seats[k].lift, yaw: h.seats[k].yaw, pose: POSE.sit, via: up(h) });
    const stove = (h: EvHomeSpots, from: number, to: number, pose: Pose = POSE.squat): Act[] => (h.stove ? [{ from, to, x: h.stove.x, z: h.stove.z, lift: 0, yaw: h.stove.yaw, pose, cook: true }] : []);
    const hammock = (h: EvHomeSpots, from: number, to: number): Act[] => {
      const m = h.hammock;
      if (!m) return [];
      // (lying along the hammock, the head to the back: the lowest point, the body's origin, a little toward the feet)
      const k = -FIT.hammock.head * 0.2;
      return [{ from, to, x: m.x + Math.sin(m.yaw) * k, z: m.z + Math.cos(m.yaw) * k, lift: m.lift + 0.12, yaw: m.yaw, pose: POSE.hammock, ride: true, rock: true }];
    };
    const W = EV_WASH_AT;

    // ── The grandparents ──
    const n2 = H('n2');
    // (the grandmother asks him the Khmer way, "have you eaten yet?", when he comes by)
    if (n2) person(dress('villager', 3101, { sex: 'f', age: 'old', hat: 'krama', carry: CARRY.broom }), [...hammock(n2, 0.86, 0.26), seat(n2, 0, 0.26, 0.42), { from: 0.74, to: 0.86, x: n2.yard.x, z: n2.yard.z, lift: 0, yaw: n2.facing, pose: POSE.sweep, carry: true, roam: 2.2 }], 'evEaten');
    const s4 = H('s4');
    if (s4) {
      const [sx, sz] = evToWorld(EV_SALA, -1.1, 0.4);
      person(dress('villager', 3103, { sex: 'm', age: 'old', hat: 'none' }), [...hammock(s4, 0.9, 0.2), seat(s4, 1, 0.2, 0.4), { from: 0.74, to: 0.9, x: sx, z: sz, lift: 0.6, yaw: EV_SALA.facing, pose: POSE.sit }]);
    }
    // ── The cooks ──
    const n3 = H('n3');
    // (rice at dawn in the pot, squatting by the fire; supper stirred in the wok)
    if (n3) person(dress('villager', 3111, { sex: 'f', hat: 'krama', props: [FEAT.paddle] }), [...stove(n3, 0.72, 0.84), ...(n3.loom ? [{ from: 0.84, to: 0.1, x: n3.loom.x, z: n3.loom.z, lift: 0, yaw: n3.loom.yaw, pose: POSE.stool }] : []), ...stove(n3, 0.1, 0.28, POSE.stir), seat(n3, 1, 0.28, 0.4)]);
    const s1 = H('s1');
    if (s1) {
      const acts: Act[] = [...stove(s1, 0.72, 0.84), { from: 0.84, to: 0.94, x: s1.yard.x, z: s1.yard.z, lift: 0, yaw: s1.facing, pose: POSE.sweep, carry: true, roam: 2.4 }, ...stove(s1, 0.1, 0.28, POSE.stir), seat(s1, 0, 0.28, 0.38)];
      if (s1.kre) acts.push({ from: 0.94, to: 0.1, x: s1.kre.x, z: s1.kre.z, lift: s1.kre.lift, yaw: s1.kre.yaw, pose: POSE.sit, ride: true });
      person(dress('villager', 3113, { sex: 'f', hat: 'none', carry: CARRY.broom, props: [FEAT.paddle] }), acts);
    }
    const n5 = H('n5');
    if (n5) {
      // (down to the water: along the bank top, onto the steps' head, down the steps)
      const toWater: Way[] = [
        { x: W.top.x - 1.5, z: W.top.z + 1.5, lift: 0 },
        { x: W.top.x + 1.5, z: W.top.z - 0.3, lift: 0 },
        { x: W.foot.x, z: W.foot.z, lift: 0 },
      ];
      person(dress('villager', 3115, { sex: 'f', hat: 'palm' }), [
        { from: 0.78, to: 0.93, x: W.landing.x, z: W.landing.z, lift: 0, yaw: W.landing.yaw, pose: POSE.squat, via: toWater },
        seat(n5, 0, 0.93, 0.1),
        ...stove(n5, 0.1, 0.28),
        seat(n5, 1, 0.28, 0.4),
      ]);
      // Her husband mends a net under the house by day.
      person(dress('fisherman', 3117, {}), [{ from: 0.9, to: 0.22, x: n5.under.x, z: n5.under.z, lift: 0, yaw: n5.under.yaw, pose: POSE.sit, carry: true }]);
    }
    const n4 = H('n4');
    if (n4?.cart) person(dress('villager', 3119, { sex: 'm', hat: 'palm' }), [{ from: 0.8, to: 0.2, x: n4.cart.x, z: n4.cart.z, lift: 0, yaw: n4.cart.yaw, pose: POSE.squat }, seat(n4, 0, 0.2, 0.34)]);
    // The shopkeeper on her stool behind the counter.
    {
      const [kx, kz] = evToWorld(EV_KIOSK, 0.3, -0.05);
      person(dress('vendor', 3121, { sex: 'f', hat: 'none' }), [{ from: 0.78, to: 0.36, x: kx, z: kz, lift: 0, yaw: EV_KIOSK.facing, pose: POSE.stool }], 'evShop');
    }
    // ── The children, and their ball ──
    for (let k = 0; k < 2; k++) this.tag.push(actor(dress('kid', 3131 + k * 2, { young: k === 1 })));
    for (let k = 0; k < 2; k++) this.ballers.push(actor(dress('kid', 3141 + k * 2)));
    this.ball = env.things.alloc(1);
    env.things.paint(this.ball, 0xe8452a);
    // ── Bicycles along the street ──
    const street = env.ground.field.trails.find((t) => t.name === 'east village road');
    // (from inside the market square at its west end, where they come and go among the stalls, to the far bank's end)
    const pts = street ? street.samples.filter((p) => p.x > 339) : [];
    if (pts.length > 20) {
      const xs = pts.map((p) => p.x);
      const zs = pts.map((p) => p.z);
      this.riders.push(new Rider(actor(dress('villager', 3151, { sex: 'f', hat: 'krama' }), false), new Bicycle(env.things, 3151, { load: 'basket' }), xs, zs, 71, 3.1, 0));
      this.riders.push(new Rider(actor(dress('kid', 3153), false), new Bicycle(env.things, 3153, { load: 'none' }), xs, zs, 93, 3.6, 40));
    }
    // ── The herd boy and his cattle ──
    const hold = env.params.get('evherd');
    this.herd = new Herd(actor(dress('kid', 3161)), env.ground.field, hold !== null ? Number(hold) || 0 : null);
    this.object = this.herd.flock.mesh;
  }

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    if (!this.herd) return;
    const step = this.pace.step(dt, viewDist(f, MID.x, MID.z));
    if (step < 0) {
      this.hideAll();
      this.herd.flock.flush(now);
      return;
    }
    if (step === 0 && this.shown) {
      this.herd.flock.flush(now);
      return;
    }
    dt = step;
    const first = !this.shown;
    this.shown = true;
    const rain = f.weather.rain > DOWNPOUR;
    for (const v of this.folk) this.live(v, dt, now, f, ex, first);
    this.play(dt, now, f, ex, first, rain);
    for (const r of this.riders) r.ride(dt, now, f, ex, rain, this.env.traffic.list);
    this.herd.update(dt, now, f, ex, first);
    for (const c of this.callouts) {
      if (!ex || !c.a.shown) continue;
      const d = c.a.dist(ex.x, ex.z);
      if (d > 15) c.said = false;
      else if (d < c.near && !c.said && Math.abs(ex.y - c.a.y) < 4) {
        c.said = true;
        this.say(c.key, c.a);
      }
    }
    // A cook's knife and fire, now and then, when the ears are near.
    if (f.dt > 0 && now > this.soundAt) {
      this.soundAt = now + 4 + 5 * hash3(Math.floor(now), 3, 31);
      for (const v of this.folk)
        if (v.cur?.cook && v.a.shown && !v.path.length && len(v.a.x - f.listener.x, v.a.z - f.listener.z) < 40) {
          f.calls.push({ kind: hash3(Math.floor(now), 5, 33) < 0.5 ? 'chop' : 'crackle', x: v.a.x, y: v.a.y + 0.5, z: v.a.z, gain: 0.6 });
          break;
        }
    }
  }

  /** One villager: their act for the hour, walking between places (in and out by their ways), then at it. */
  private live(v: Villager, dt: number, now: number, f: MapFrame, ex: Obstacle | null, first: boolean): void {
    const a = v.a;
    const c = f.clock;
    let act: Act | null = null;
    for (const s of v.acts) if (inWindow(c, s)) act = s;
    // (heavy rain: the washing waits, she sits on her veranda)
    if (act?.via && act.lift === 0 && f.weather.rain > DOWNPOUR) act = v.acts.find((s) => s.lift > 1) ?? act;
    if (act !== v.cur) {
      const from = v.cur;
      v.cur = act;
      v.path = [];
      v.leg = 0;
      if (!act) {
        // In for the night: up the stair and in if seen (from the ground); else gone at once.
        const home = v.acts.find((s) => s.via && s.lift > 1);
        if (a.shown && !first && from && from.lift === 0 && !from.ride && home?.via) v.path = [...home.via, { x: home.x, z: home.z, lift: home.lift }];
        else {
          if (a.shown) a.hide();
          return;
        }
      } else if (!a.shown || first) {
        this.put(a, act, now);
        return;
      } else {
        // Out of the last place the way it came, into the new one the way in.
        v.path = [...(from?.via ? [...from.via].reverse() : []), ...(act.via ?? []), { x: act.x, z: act.z, lift: act.lift }];
        a.riding = false;
      }
    }
    if (v.path.length) {
      const goal = v.path[v.leg];
      a.goTo(goal.x, goal.z, WALK);
      a.face(null);
      a.pose(POSE.stand, now);
      a.carry(0, now);
      a.lookAt(null);
      a.step(dt, now);
      if (a.dist(goal.x, goal.z) < 0.35 && ++v.leg >= v.path.length) {
        v.path = [];
        if (!v.cur) a.hide();
        else this.put(a, v.cur, now);
      }
      return;
    }
    if (!act) return;
    // (settled and far from the camera: nothing to do, the pose stands)
    if (!act.roam && !first && a.shown && viewDist(f, a.x, a.z) > SETTLED_NEAR) return;
    // At it: sitting, squatting, lying in the hammock (rocking), sweeping round the yard.
    if (act.ride) {
      const rock = act.rock ? Math.sin(now * 1.3 + a.i) * 0.05 : 0;
      a.ride(act.x + Math.cos(act.yaw) * rock, this.floor(act, act.x, act.z), act.z - Math.sin(act.yaw) * rock, act.yaw);
    } else if (act.roam) {
      if (now > v.next) {
        v.wander = hash3(Math.floor(now / 7), a.i, 35) * Math.PI * 2;
        v.next = now + 5 + 4 * hash3(Math.floor(now), a.i, 36);
      }
      const r = act.roam * (0.4 + 0.6 * hash3(Math.floor(now / 7), a.i, 37));
      a.goTo(act.x + Math.sin(v.wander) * r, act.z + Math.cos(v.wander) * r, 0.25);
      a.face(null);
    } else {
      a.goTo(act.x, act.z, 0.4);
      a.face(act.yaw);
    }
    a.pose(act.pose, now);
    a.carry(act.carry ? 1 : 0, now);
    // (a look at the explorer when he is close)
    if (ex && a.dist(ex.x, ex.z) < 5) {
      P.x = ex.x;
      P.y = ex.y + 2;
      P.z = ex.z;
      a.lookAt(P, now + 1);
    } else a.lookAt(null);
    a.step(dt, now);
  }

  /** Put someone at their place at once, shown. */
  private put(a: Actor, act: Act, now: number): void {
    const y = this.floor(act, act.x, act.z);
    if (act.ride) a.ride(act.x, y, act.z, act.yaw);
    else a.warp(act.x, y, act.z, act.yaw);
    if (!a.shown) a.show();
    a.pose(act.pose, now);
    a.carry(act.carry ? 1 : 0, now);
    a.face(act.yaw);
    a.step(0, now);
  }

  /** The floor at a place (a veranda, a landing, the ground), or exactly `lift` over the ground (riding). */
  private floor(act: { lift: number; ride?: boolean }, x: number, z: number): number {
    const g = this.ground.field.heightAt(x, z);
    if (act.ride) return g + act.lift;
    const y = this.ground.at(x, z, g + act.lift + 0.4);
    return Number.isFinite(y) ? y : g + act.lift;
  }

  /**
   * The children: tag in the south yard (in the late afternoon down the
   * steps to the stream, splashing on the sand at the water), a ball kicked
   * about at the corner under the tamarind; a wave and "hello!" when the
   * explorer comes near.
   */
  private play(dt: number, now: number, f: MapFrame, ex: Obstacle | null, first: boolean, rain: boolean): void {
    const c = f.clock;
    const W = EV_WASH_AT;
    const tagOut = !rain && (c > 0.9 || c < 0.24);
    // (not into the water while snow falls or lies: the Weather setting's dream)
    const stream = tagOut && c >= 0.1 && c < 0.22 && f.weather.snow < 0.3 && f.weather.snowCover < 0.3;
    const ballOut = !rain && (c > 0.92 || c < 0.2);
    this.hi('tag', this.tag, now, f, ex, tagOut);
    this.hi('ball', this.ballers, now, f, ex, ballOut);
    // ── Tag, or the stream ──
    this.tag.forEach((a, k) => {
      if (!tagOut) {
        if (a.shown) a.hide();
        return;
      }
      let x: number;
      let z: number;
      let run: boolean;
      if (stream) {
        const u = now * 0.9 + k * 2.1;
        x = W.sand.x + 0.4 + Math.sin(u) * 0.5;
        z = W.sand.z + Math.cos(u * 0.7) * 1.6 + k * 1.2;
        run = Math.sin(now * 0.5 + k) > -0.3;
      } else {
        const dir = Math.sin(now * 0.05) > 0 ? 1 : -1;
        const u = now * 0.28 * dir - k * 0.9;
        x = EV_PLAY.x + Math.sin(u) * EV_PLAY.r;
        z = EV_PLAY.z + Math.cos(u) * EV_PLAY.r * 0.7;
        run = Math.sin(now * 0.31) > -0.5;
      }
      if (!a.shown || first || a.dist(x, z) > 12) {
        a.warp(x, stream ? W.sand.y : this.ground.field.heightAt(x, z), z, 0);
        a.show();
      }
      const waving = k === 0 && now - this.hello.tag.at < 2.4;
      if (run && !waving) a.goTo(x, z, 2.2);
      else a.stop();
      a.face(waving && ex ? a.yawTo(ex.x, ex.z) : null);
      a.pose(waving || (!run && k === 0) ? POSE.wave : POSE.stand, now);
      a.step(dt, now);
    });
    if (stream && f.dt > 0 && now > this.splashAt && this.tag[0].shown) {
      this.splashAt = now + 2.5 + 4 * hash3(Math.floor(now), 7, 41);
      f.calls.push({ kind: 'splashPlay', x: W.sand.x + 1, y: W.sand.y, z: W.sand.z, gain: 0.6 });
    }
    // ── The ball at the corner ──
    const bx = EV_TAMARIND.x - 1.5;
    const bz = EV_TAMARIND.z + 8.5;
    const T = 3.2;
    const ph = now / T;
    const kick = Math.floor(ph);
    const t = ph - kick;
    this.ballers.forEach((a, k) => {
      if (!ballOut) {
        if (a.shown) a.hide();
        return;
      }
      const side = k === 0 ? -1 : 1;
      const x = bx + side * 2.5 + (hash3(kick, k, 43) - 0.5) * 0.8;
      const z = bz + (hash3(kick, k, 44) - 0.5) * 1.2;
      const facing = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      if (!a.shown || first) {
        a.warp(x, this.ground.field.heightAt(x, z), z, facing);
        a.show();
      }
      const waving = k === 0 && now - this.hello.ball.at < 2.4;
      a.goTo(x, z, 1.2);
      a.face(waving && ex ? a.yawTo(ex.x, ex.z) : facing);
      // (the kicker: a quick step at the ball, an arm out)
      const kicking = (kick + k) % 2 === 0 && t < 0.2;
      a.pose(waving ? POSE.wave : kicking ? POSE.point : POSE.stand, now);
      a.step(dt, now);
    });
    if (this.ball >= 0) {
      if (ballOut && this.ballers[0].shown) {
        const from = this.ballers[kick % 2];
        const to = this.ballers[(kick + 1) % 2];
        const x = from.x + (to.x - from.x) * t;
        const z = from.z + (to.z - from.z) * t;
        this.env.things.put(this.ball, x, this.ground.field.heightAt(x, z) + 0.16 + Math.sin(t * Math.PI) * 0.7, z, 0.3, 0.3, 0.3, now * 3);
      } else this.env.things.hide(this.ball);
    }
    // Laughing now and then.
    if (f.dt > 0 && (tagOut || ballOut) && now > this.laughAt) {
      this.laughAt = now + 10 + 14 * hash3(Math.floor(now), 9, 45);
      const a = tagOut ? this.tag[0] : this.ballers[0];
      if (a.shown) f.calls.push({ kind: 'laugh', x: a.x, y: a.y + 1, z: a.z, gain: 0.7 });
    }
  }

  /** Children see the explorer come near: the first of them waves and calls "hello!" (once, until he has gone away again). */
  private hi(group: 'tag' | 'ball', kids: Actor[], now: number, f: MapFrame, ex: Obstacle | null, out: boolean): void {
    const h = this.hello[group];
    const a = kids[0];
    if (!ex || !out || !a.shown) return;
    const d = a.dist(ex.x, ex.z);
    if (d > 20) h.said = false;
    if (d > HELLO || h.said || f.dt <= 0) return;
    h.said = true;
    h.at = now;
    P.x = ex.x;
    P.y = ex.y + 2;
    P.z = ex.z;
    a.lookAt(P, now + 2.5);
    f.calls.push({ kind: 'kidHello', x: a.x, y: a.y + 1.2, z: a.z, gain: 0.8 });
    this.say('evKids', a);
  }

  /** A few words in a bubble over someone's head (roaming only; never in a still). */
  private say(key: WordKey, a: Actor): void {
    if (this.env.shot) return;
    const h = this.head;
    this.env.bubble.say(
      key,
      () => {
        h.x = a.x;
        h.y = a.y + a.crowd.scale(a.i) * 1.75 + 0.35;
        h.z = a.z;
        return h;
      },
      3,
    );
  }

  private hideAll(): void {
    if (!this.shown) return;
    this.shown = false;
    for (const a of this.actors) if (a.shown) a.hide();
    for (const v of this.folk) {
      v.cur = null;
      v.path = [];
    }
    for (const r of this.riders) r.hide();
    this.herd?.hide();
    if (this.ball >= 0) this.env.things.hide(this.ball);
  }

  report(traffic: Traffic): void {
    for (const a of this.actors) if (a.shown) traffic.add(this.name, a.x, a.y, a.z);
    this.herd?.report(traffic);
  }

  // (the nature book: the cattle where they are drawn; the people come from `actors`)
  subjects(out: Subject[]): void {
    this.herd?.subjects(out);
  }
}

/**
 * Someone on a bicycle along the street by day, over the foot bridge,
 * keeping to the right: a trip east, a rest, a trip west, and so on (a trip
 * every `every` s, where the people's clock has them in a still). They slow
 * for the explorer in their lane, ring their bell as they come by him.
 */
class Rider {
  /** Metres along the street (west to east), the way they ride (1 east, −1 west), their speed now (m/s). */
  private s = 0;
  private dir = 1;
  private v = 0;
  /** Resting between trips until (people's clock, s); the trip under way (−1: none yet). */
  private restUntil = 0;
  private trip = -1;
  private rolled = 0;
  private rang = false;
  private readonly lens: number[] = [];
  private readonly total: number;

  constructor(
    readonly a: Actor,
    readonly bike: Bicycle,
    readonly xs: number[],
    readonly zs: number[],
    readonly every: number,
    readonly speed: number,
    readonly offset: number,
  ) {
    let d = 0;
    for (let i = 0; i < xs.length; i++) {
      if (i) d += Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
      this.lens.push(d);
    }
    this.total = d;
  }

  ride(dt: number, now: number, f: MapFrame, ex: Obstacle | null, rain: boolean, traffic: readonly Obstacle[]): void {
    const a = this.a;
    const c = f.clock;
    if (rain || !(c > 0.76 || c < 0.3)) {
      this.hide();
      this.trip = -1;
      return;
    }
    const k = Math.floor((now + this.offset) / this.every);
    if (this.trip < 0) {
      // (first seen: where the clock has this trip, or resting between two)
      this.trip = k;
      const along = ((now + this.offset) % this.every) * this.speed;
      this.dir = k % 2 === 0 ? 1 : -1;
      this.s = this.dir > 0 ? along : this.total - along;
      this.v = this.speed;
      if (along > this.total) this.restUntil = (k + 1) * this.every - this.offset;
    }
    if (now < this.restUntil) {
      this.hide();
      return;
    }
    if (this.s < 0 || this.s > this.total) {
      // A trip done: rest, then back the other way.
      this.dir = -this.dir;
      this.s = this.dir > 0 ? 0 : this.total;
      this.restUntil = now + Math.max(4, this.every - this.total / this.speed);
      this.rang = false;
      this.hide();
      return;
    }
    // (a trip does not begin under the eyes: out of nothing at the street's end)
    if (!a.shown && (this.s < 1 || this.s > this.total - 1)) {
      const e = this.point(this.s);
      if (len(e.x - f.camera.position.x, e.z - f.camera.position.z) < 30) {
        this.restUntil = now + 2;
        return;
      }
    }
    // Where they are, the way, and the explorer in the lane ahead (slow and stop for him).
    const p = this.point(this.s);
    const hx = Math.sin(p.yaw);
    const hz = Math.cos(p.yaw);
    let want = this.speed;
    // (the cattle on the street: wait behind them)
    for (const o of traffic) {
      if (o.who !== 'animal') continue;
      const dx = o.x - p.x;
      const dz = o.z - p.z;
      const ahead = dx * hx + dz * hz;
      if (ahead > 0 && ahead < 6 && Math.abs(dx * hz - dz * hx) < 1.6 && Math.abs(o.y - p.y) < 2) want = ahead < 3.5 ? 0 : Math.min(want, this.speed * 0.3);
    }
    if (ex) {
      const dx = ex.x - p.x;
      const dz = ex.z - p.z;
      const ahead = dx * hx + dz * hz;
      const across = Math.abs(dx * hz - dz * hx);
      if (ahead > -0.5 && ahead < 5 && across < 1.4 && Math.abs(ex.y - p.y) < 2) want = ahead < 2 ? 0 : Math.min(want, this.speed * 0.3);
      if (!this.rang && f.dt > 0 && ahead > -1 && ahead < 9 && across < 4) {
        this.rang = true;
        f.calls.push({ kind: 'bikeBell', x: p.x, y: p.y + 1.2, z: p.z, gain: 0.8 });
      }
    }
    this.v += Math.max(-4 * dt, Math.min(1.5 * dt, want - this.v));
    this.s += this.dir * this.v * dt;
    this.rolled += this.v * dt;
    p.y = this.easeY(p.y, a.shown ? dt : 0);
    a.ride(p.x, p.y, p.z, p.yaw);
    if (!a.shown) a.show();
    a.pose(POSE.ride, now);
    a.lookAt(null);
    a.step(dt, now);
    const sc = a.crowd.scale(a.i);
    a.crowd.gait(a.i, this.v > 0.2 ? 1 : 0, this.v / (FIT.bike.gear * sc), now);
    this.bike.put(p.x, p.y, p.z, p.yaw, sc, a.crowd.phaseOf(a.i, now), this.rolled / (BIKE_WHEEL * sc));
  }

  /** The point `s` m along the street, 0.6 m to the right of its middle for the way they ride, the deck or the ground under it, the heading. */
  private readonly pt = { x: 0, y: 0, z: 0, yaw: 0 };
  private seg = 1;
  private point(s: number): { x: number; y: number; z: number; yaw: number } {
    // (from the last segment: a step or two along, not a search from the start)
    let i = Math.min(Math.max(1, this.seg), this.lens.length - 1);
    while (i > 1 && this.lens[i - 1] > s) i--;
    while (i < this.lens.length - 1 && this.lens[i] < s) i++;
    this.seg = i;
    const k = (s - this.lens[i - 1]) / Math.max(1e-3, this.lens[i] - this.lens[i - 1]);
    const x = this.xs[i - 1] + (this.xs[i] - this.xs[i - 1]) * k;
    const z = this.zs[i - 1] + (this.zs[i] - this.zs[i - 1]) * k;
    const yaw = Math.atan2((this.xs[i] - this.xs[i - 1]) * this.dir, (this.zs[i] - this.zs[i - 1]) * this.dir);
    const o = this.pt;
    o.x = x - Math.cos(yaw) * 0.6;
    o.z = z + Math.sin(yaw) * 0.6;
    o.y = deckOrGround(this.a.ground.field, o.x, o.z);
    o.yaw = yaw;
    return o;
  }

  /** Height eased toward the ground under them (the land steps a block at a time: no jump). */
  private eased = NaN;
  private easeY(y: number, dt: number): number {
    this.eased = Number.isNaN(this.eased) || dt <= 0 ? y : this.eased + (y - this.eased) * Math.min(1, dt * 7);
    return this.eased;
  }

  hide(): void {
    if (this.a.shown) this.a.hide();
    this.bike.hide();
    this.eased = NaN;
  }
}

/** The herd's day on the clock: walking out (to the meadow), walking home (to the pen); grazing between, in the pen the rest. */
const HERD = { out: [0.76, 0.98], home: [0.1, 0.32] } as const;
/** Their pace along the way (m/s), the spacing between them and to the boy behind (m), their pace settling in the pen or the meadow (m/s). */
const HERD_SPEED = 1.4;
const HERD_GAP = 3.4;
const BOY_GAP = 3.2;
const AMBLE = 0.45;

/**
 * The herd boy and three white cattle (the ox of the cart, people/_ox.ts):
 * along `EV_HERD_WAY` between the pen and the meadow on the far bank, over
 * the foot bridge, in the morning and at dusk (where the clock has them: a
 * still shows them there); grazing by day, heads down, wandering a little,
 * the boy sitting by the meadow; dozing in the pen at night. They stop for
 * the explorer in their way; their bells clonk as they go.
 */
class Herd {
  readonly flock = new Flock(OX, 3);
  private readonly way: [number, number][] = EV_HERD_WAY;
  private readonly lens: number[] = [];
  private readonly total: number;
  /** The leading cow along the way home (m), or −1 when not walking. */
  private s = -1;
  private bellAt = 0;
  /** Each cow: where it is, its heading, where it is heading for (pen, meadow), when it picks the next spot. */
  private readonly cows = [0, 1, 2].map(() => ({ x: 0, y: 0, z: 0, yaw: 0, tx: 0, tz: 0, next: 0, set: false }));
  private readonly obstacles: Obstacle[] = [0, 1, 2].map(() => ({ x: 0, y: 0, z: 0, r: 1.1, vx: 0, vz: 0, who: 'animal' }));
  private readonly pt = { x: 0, z: 0, yaw: 0 };

  constructor(
    readonly boy: Actor,
    readonly field: HeightField,
    /** Held that far along the way home (m, the `evherd=` check), walking, whatever the hour. */
    readonly hold: number | null = null,
  ) {
    let d = 0;
    this.way.forEach(([x, z], i) => {
      if (i) d += Math.hypot(x - this.way[i - 1][0], z - this.way[i - 1][1]);
      this.lens.push(d);
    });
    this.total = d;
    for (let i = 0; i < 3; i++) this.flock.setup(i, i === 2 ? 1 : 0, 0.17 + i * 0.29, 0.92 + i * 0.05);
  }

  /** The point `s` m along the way home (from the meadow to the pen), and the way's heading there (reused). */
  private at(s: number): { x: number; z: number; yaw: number } {
    const w = this.way;
    const t = Math.max(0, Math.min(this.total, s));
    let i = 1;
    while (i < this.lens.length - 1 && this.lens[i] < t) i++;
    const k = (t - this.lens[i - 1]) / Math.max(1e-3, this.lens[i] - this.lens[i - 1]);
    const o = this.pt;
    o.x = w[i - 1][0] + (w[i][0] - w[i - 1][0]) * k;
    o.z = w[i - 1][1] + (w[i][1] - w[i - 1][1]) * k;
    o.yaw = Math.atan2(w[i][0] - w[i - 1][0], w[i][1] - w[i - 1][1]);
    return o;
  }

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null, first: boolean): void {
    const c = f.clock;
    const out = this.hold === null && inWindow(c, { from: HERD.out[0], to: HERD.out[1] });
    const home = this.hold !== null || inWindow(c, { from: HERD.home[0], to: HERD.home[1] });
    const grazing = !out && !home && (c >= HERD.out[1] || c < HERD.home[0]);
    const boy = this.boy;
    if (out || home) {
      // Where the hour has the leading cow along the way home (m).
      const into = (((c - (out ? HERD.out[0] : HERD.home[0])) % 1) + 1) % 1;
      const want = this.hold !== null ? this.hold : out ? Math.max(0, this.total - into * 360 * HERD_SPEED) : Math.min(this.total + 2 * HERD_GAP, into * 360 * HERD_SPEED);
      if (this.s < 0 || first) this.s = want;
      const ahead = out ? -1 : 1;
      const lead = this.at(this.s);
      const blocked = !!ex && len(ex.x - (lead.x + Math.sin(lead.yaw) * ahead * 2.2), ex.z - (lead.z + Math.cos(lead.yaw) * ahead * 2.2)) < 2.4;
      const gap = want - this.s;
      if (!blocked && Math.abs(gap) > 0.01) this.s += Math.sign(gap) * Math.min(Math.abs(gap), HERD_SPEED * (Math.abs(gap) > 4 ? 1.3 : 1) * dt);
      const moving = !blocked && Math.abs(gap) > 0.05;
      for (let i = 0; i < 3; i++) {
        const p = this.at(this.s - i * HERD_GAP * ahead);
        const cow = this.cows[i];
        cow.x = p.x;
        cow.z = p.z;
        cow.yaw = out ? p.yaw + Math.PI : p.yaw;
        cow.set = true;
        this.show(i, moving ? 1 : 0, moving ? HERD_SPEED : 0, moving ? 0.25 : 0.5, now, first ? 0 : dt);
      }
      // The boy behind the last one, urging them on now and then.
      const b = this.at(this.s - (2 * HERD_GAP + BOY_GAP) * ahead);
      const by = deckOrGround(this.field, b.x, b.z);
      if (!boy.shown || first || boy.dist(b.x, b.z) > 8) {
        boy.warp(b.x, by, b.z, out ? b.yaw + Math.PI : b.yaw);
        boy.show();
      }
      boy.goTo(b.x, b.z, moving ? HERD_SPEED * 1.1 : 0.4);
      boy.face(null);
      boy.pose(Math.sin(now * 0.4) > 0.85 ? POSE.wave : POSE.stand, now);
      boy.step(dt, now);
      this.bells(now, f, moving, 1.2);
    } else {
      this.s = -1;
      // Grazing: each amble to a spot in the meadow, heads down; in the pen: to its place, dozing.
      this.cows.forEach((cow, i) => {
        if (!cow.set || first) {
          this.home(i, grazing, now, true);
          cow.x = cow.tx;
          cow.z = cow.tz;
          cow.set = true;
        } else if (now > cow.next) this.home(i, grazing, now, false);
        const dx = cow.tx - cow.x;
        const dz = cow.tz - cow.z;
        const d = len(dx, dz);
        const moving = d > 0.3;
        if (moving) {
          const st = Math.min(d, AMBLE * dt);
          cow.x += (dx / d) * st;
          cow.z += (dz / d) * st;
          cow.yaw = Math.atan2(dx, dz);
        }
        this.show(i, moving ? 0.5 : 0, moving ? AMBLE : 0, grazing ? (Math.sin(now * 0.07 + i * 2) > 0.8 ? 0 : 1) : 1, now, first ? 0 : dt);
      });
      if (grazing) this.bells(now, f, false, 6);
      // The boy sits by the meadow while they graze; at night he is home.
      if (grazing) {
        const x = EV_MEADOW.x + 5.2;
        const z = EV_MEADOW.z + 6.5;
        if (!boy.shown || first || boy.dist(x, z) > 10) {
          boy.warp(x, this.field.heightAt(x, z), z, -2.4);
          boy.show();
        }
        boy.goTo(x, z, 0.8);
        boy.face(-2.4);
        boy.pose(boy.dist(x, z) < 0.4 ? POSE.sit : POSE.stand, now);
        boy.step(dt, now);
      } else if (boy.shown) boy.hide();
    }
    this.flock.flush(now);
  }

  /** Cow `i`'s next spot: somewhere in the meadow (grazing), or its place in the pen. */
  private home(i: number, grazing: boolean, now: number, snap: boolean): void {
    const cow = this.cows[i];
    if (grazing) {
      const a = hash3(Math.floor(now / 9) + (snap ? 0 : 1), i, 51) * Math.PI * 2;
      const r = EV_MEADOW.r * Math.sqrt(hash3(Math.floor(now / 9), i, 52));
      cow.tx = EV_MEADOW.x + Math.cos(a) * r;
      cow.tz = EV_MEADOW.z + Math.sin(a) * r;
      cow.next = now + 12 + 10 * hash3(Math.floor(now), i, 53);
    } else {
      cow.tx = EV_PEN.x - 2 + i * 1.9;
      cow.tz = EV_PEN.z - 0.6 + (i % 2) * 1.2;
      cow.next = now + 1e6;
      if (snap) cow.yaw = 0.3 + i * 0.9;
    }
  }

  /** Put cow `i` where it is: walking (share, pace m/s), its head (0 up … 1 down to the grass). */
  private show(i: number, walk: number, speed: number, head: number, now: number, dt = 0): void {
    const cow = this.cows[i];
    const sc = PEOPLE_SCALE;
    // (eased over the land's steps and onto the bridge: no jump)
    const y = deckOrGround(this.field, cow.x, cow.z);
    cow.y = dt > 0 && cow.y !== 0 ? cow.y + (y - cow.y) * Math.min(1, dt * 6) : y;
    this.flock.place(i, cow.x, cow.y, cow.z, cow.yaw, sc);
    this.flock.gait(i, walk, walk > 0 ? speed / (1.55 * sc * 0.5) : 0.5, now);
    this.flock.set(i, CH.head, head, now);
    this.flock.set(i, CH.turn, 0, now);
    const o = this.obstacles[i];
    o.x = cow.x;
    o.y = cow.y;
    o.z = cow.z;
  }

  /** Their bells: with the steps while walking, now and then while grazing (when the ears are near). */
  private bells(now: number, f: MapFrame, walking: boolean, every: number): void {
    if (f.dt <= 0 || now < this.bellAt) return;
    this.bellAt = now + every * (0.6 + 0.8 * hash3(Math.floor(now * 3), 1, 55));
    const o = this.obstacles[Math.floor(hash3(Math.floor(now * 5), 2, 56) * 3)];
    if (len(o.x - f.listener.x, o.z - f.listener.z) > 70) return;
    f.calls.push({ kind: 'cowBell', x: o.x, y: o.y + 1, z: o.z, gain: walking ? 0.7 : 0.45 });
  }

  hide(): void {
    for (let i = 0; i < 3; i++) {
      this.flock.hide(i);
      this.cows[i].set = false;
      this.cows[i].y = 0;
    }
    if (this.boy.shown) this.boy.hide();
    this.s = -1;
  }

  report(traffic: Traffic): void {
    if (!this.flock.isShown(0)) return;
    for (const o of this.obstacles) traffic.list.push(o);
  }

  subjects(out: Subject[]): void {
    const m = this.flock.mesh.instanceMatrix.array;
    for (let i = 0; i < 3; i++) if (this.flock.isShown(i)) out.push({ kind: 'ox', x: m[i * 16 + 12], y: m[i * 16 + 13] + 1, z: m[i * 16 + 14], r: 1.05 });
  }
}
