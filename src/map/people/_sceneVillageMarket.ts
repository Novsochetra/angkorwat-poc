import type { Object3D } from 'three';
import { inWindow } from '../hamlet/_mkPlan';
import type { MapFrame, Subject } from '../types';
import type { WordKey } from '../ui/lang';
import { FV_BOATS, FV_GROCERY, FV_STALLS, boatBuyer, type FvBoat, type FvStall } from '../village/_fvPlan';
import { GROUND, JETTY, LAKE_LEVEL, SHOP_HOME, VILLAGE_SPOTS, homeToWorld } from '../village/_spots';
import { Actor } from './_actor';
import { dress } from './_kinds';
import { CARRY, FEAT, PEOPLE_SCALE, POSE, SLOT, type Feature, type Look, type Pose } from './_personModel';
import { len, type Ground, type Obstacle, type Point, type Traffic } from './_routes';
import { Pace, viewDist, type PeopleEnv, type PeopleScene } from './_scene';
import { ALMS, villageGround } from './_sceneVillage';
import { Rig, RigDef } from './_things';

/**
 * The floating village market's people (the market: village/_fvMarket.ts;
 * where everything stands: village/_fvPlan.ts), following the day:
 *
 * - a **seller** (kind `vendor`) at each stall while it is open: squatting
 *   behind the fish at the landing, sitting on her platform among the prahok
 *   jars, on her stool behind the greens, the fruit, the sweets; the noodle
 *   cook standing at her cart and stirring the pot of gravy now and then,
 *   the grill man turning his fish, the drinks man at his cart; they look up
 *   at buyers and at the explorer and call out (a bubble when he is close:
 *   the market's `mk…` words, the village's `fv…`); the fruit seller kneels
 *   and gives when the monk comes on his alms round (people/_sceneVillage.ts
 *   `ALMS`); the grocer behind the shop's counter;
 * - **women selling from boats**: at dawn each paddles in over the lake to
 *   her place along the jetty (fruit, greens, fish, and the noodle boat with
 *   its pot steaming), sits among her goods facing the planks while buyers
 *   stand on the jetty, and paddles off again at mid-morning;
 * - **buyers**: a neighbour with a basket on her head going from stall to
 *   stall, a woman from the north street who buys fruit from a boat at the
 *   jetty, a man who gets an iced coffee and sits down to eat noodles (in
 *   the morning; the afternoon is quieter); people eating num banh chok on
 *   the stools by the cart for breakfast and under the bulbs in the
 *   evening.
 *
 * The boats are rigs of the people's things (`_things.ts`: a teak dugout,
 * its goods), rocking a little at their moorings. Sounds (only while the
 * ears are near): the murmur (`market`, by how many are there), sellers'
 * calls (`vendorCall`), the grill (`sizzle`). Nature book: the sellers are
 * `vendor`s; the buyers and eaters the `market` crowd while it is busy.
 * Shots: `fvopen=all|none` (as the build: every stall open or shut; the
 * boats follow the clock).
 */

/** Pace: every frame within `NEAR` m of the camera, every third or sixth farther, none beyond `HIDE`. */
const NEAR = 70;
const HIDE = 300;
/** The ears within this (m): the murmur; a seller's bubble within `SAY` of the explorer. */
const HEAR = 110;
const SAY = 10;
/** Walking pace (m/s). */
const WALK = 0.75;
/** A boat's paddle in and out (clock), and how high it rides over the water (m). */
const PADDLE = 0.045;
const RIDE = 0.1;
/** The market's middle (the murmur comes from there). */
const MID = { x: -298, z: 66 };

/** How a seller sits or stands. */
const SEATED: Record<FvStall['seat']['pose'], Pose> = { squat: POSE.squat, stool: POSE.stool, stand: POSE.stand, sit: POSE.sit };
/** What a seller calls out (her own, then anyone's). */
const CALL: Record<string, WordKey> = {
  fish: 'mkFreshFish',
  dried: 'fvPrahok',
  greens: 'mkGreens',
  fruit: 'mkFruit',
  sweets: 'mkCakes',
  grill: 'fvGrill',
  noodles: 'mkNoodles',
  drinks: 'fvCoffee',
  'boat-fruit': 'fvBoatFruit',
  'boat-greens': 'fvBoatGreens',
  'boat-fish': 'fvBoatFish',
  'boat-noodles': 'fvBoatNoodles',
};
const ANY_CALL: WordKey[] = ['mkCheap', 'mkWhatBuy', 'mkLook'];
/** The vendor's goods (her dress: `prop`, `prop2`). */
const VENDOR: Record<string, 'fruit' | 'greens' | 'fish' | 'sweets'> = {
  fish: 'fish',
  dried: 'fish',
  greens: 'greens',
  fruit: 'fruit',
  sweets: 'sweets',
  'boat-fruit': 'fruit',
  'boat-greens': 'greens',
  'boat-fish': 'fish',
  'boat-noodles': 'sweets',
};

interface Seller {
  a: Actor;
  id: string;
  open: [number, number];
  /** Where she sells (y: her seat) and faces; where a buyer stands. */
  seat: Point & { yaw: number };
  front: Point;
  pose: Pose;
  /** The noodle cook: where she stands to stir the pot, and until when (the people's clock). */
  pot: (Point & { yaw: number }) | null;
  stir: number;
  on: boolean;
}

interface Boat {
  b: FvBoat;
  rig: Rig;
  a: Actor;
  /** Its way in: from, via, the mooring (x, z). */
  way: [number, number][];
  /** The jetty's middle beside the mooring (she faces it). */
  dock: [number, number];
}

/** One stop of an errand: where, how long, how (and what she looks at). */
interface Stop {
  x: number;
  z: number;
  /** On the jetty (its deck's height) or the ground. */
  y: number;
  wait: number;
  pose: Pose;
  yaw: number;
  look?: Point;
}

interface Errand {
  a: Actor;
  /** When they go (the clock window), and their round's stops (the first is home). */
  open: [number, number];
  stops: Stop[];
  leg: number;
  until: number;
  mode: 'home' | 'walk' | 'stop';
  /** They set out again this long after coming home (s). */
  rest: number;
}

interface Eater {
  a: Actor;
  at: Point & { yaw: number };
  windows: [number, number][];
}

export class VillageMarket implements PeopleScene {
  readonly name = 'villagemarket';
  readonly actors: Actor[] = [];
  private readonly ground: Ground;
  private readonly pace = new Pace(NEAR, HIDE);
  private readonly force: string | null;
  private readonly sellers: Seller[] = [];
  private readonly boats: Boat[] = [];
  private readonly errands: Errand[] = [];
  private readonly eaters: Eater[] = [];
  private readonly grocer: Actor;
  private readonly grocerAt: Point & { yaw: number };
  private shown = false;
  private callAt = 0;
  private murmurAt = 0;
  private sizzleAt = 0;
  private readonly tmp: Point = { x: 0, y: 0, z: 0 };

  constructor(
    private readonly env: PeopleEnv,
    scene: Object3D,
  ) {
    const { crowd, traffic, things } = env;
    this.ground = villageGround(env, scene);
    this.force = env.params.get('fvopen');
    const field = env.ground.field;
    const actor = (look: Look) => {
      const a = new Actor(crowd, look, this.ground).avoid(traffic, this.name);
      this.actors.push(a);
      return a;
    };
    // ── The sellers ──
    for (const s of FV_STALLS) {
      const c = Math.cos(s.yaw);
      const n = Math.sin(s.yaw);
      const at = (sx: number, sz: number): [number, number] => [s.x + sx * c + sz * n, s.z - sx * n + sz * c];
      const [x, z] = at(s.seat.x, s.seat.z);
      const [fx, fz] = at(0, s.d / 2 + 0.9);
      const props: Feature[] = [FEAT.parcel];
      if (s.goods === 'noodles') props.push(FEAT.paddle);
      const look = dress('vendor', s.who.seed, { sex: s.who.sex, hat: s.who.hat, goods: VENDOR[s.id], props });
      const y = field.heightAt(s.x, s.z) + s.seat.y;
      const pot = s.kind === 'noodle' ? at(1.55, -0.95) : null;
      this.sellers.push({
        a: actor(look),
        id: s.id,
        open: s.open,
        seat: { x, y, z, yaw: s.yaw },
        front: { x: fx, y: GROUND, z: fz },
        pose: SEATED[s.seat.pose],
        pot: pot ? { x: pot[0], y: field.heightAt(pot[0], pot[1]), z: pot[1], yaw: s.yaw } : null,
        stir: 0,
        on: false,
      });
    }
    // The grocer behind the shop's counter, looking out over it.
    {
      const h = SHOP_HOME;
      const zw = -(h.d + h.v) / 2 + h.d;
      const [gx, gz] = homeToWorld(h, 0.6, zw - 0.45);
      this.grocerAt = { x: gx, y: h.floor, z: gz, yaw: h.facing };
      this.grocer = actor(dress('vendor', 3151, { sex: 'f', hat: 'none', goods: 'sweets', props: [FEAT.parcel] }));
    }
    // ── The boats and the women selling from them ──
    for (const b of FV_BOATS) {
      const look = dress('vendor', b.who.seed, { sex: 'f', hat: b.who.hat, goods: VENDOR[b.id], props: [FEAT.parcel] });
      const q = boatBuyer(b);
      this.boats.push({ b, rig: new Rig(things, boatDef(b)), a: actor(look), way: [b.from, b.via, [b.x, b.z]], dock: [q.x, q.z] });
    }
    // ── Buyers ──
    const foot = (id: string): [number, number] => {
      const h = VILLAGE_SPOTS.homes.find((o) => o.id === id);
      return h ? [h.stairFoot[0], h.stairFoot[2]] : [-296, 70];
    };
    const at = (id: string): FvStall => FV_STALLS.find((s) => s.id === id)!;
    const stop = (id: string, wait: number, pose: Pose = POSE.talk): Stop => {
      const s = at(id);
      const fx = s.x + Math.sin(s.yaw) * (s.d / 2 + 0.75);
      const fz = s.z + Math.cos(s.yaw) * (s.d / 2 + 0.75);
      return { x: fx, z: fz, y: GROUND, wait, pose, yaw: s.yaw + Math.PI, look: { x: s.x, y: GROUND + 1.2, z: s.z } };
    };
    const home = (id: string): Stop => {
      const [x, z] = foot(id);
      return { x, z, y: GROUND, wait: 0, pose: POSE.stand, yaw: 0 };
    };
    const boatStop = (id: string, wait: number): Stop => {
      const b = FV_BOATS.find((o) => o.id === id)!;
      const q = boatBuyer(b);
      return { x: q.x, z: q.z, y: JETTY.y, wait, pose: POSE.talk, yaw: q.yaw, look: { x: b.x, y: LAKE_LEVEL + 0.6, z: b.z } };
    };
    const [jx, jz] = JETTY.from;
    const onto: Stop = { x: jx + JETTY.dir[0] * 0.6, z: jz + JETTY.dir[1] * 0.6, y: JETTY.y, wait: 0, pose: POSE.stand, yaw: 0 };
    const errand = (look: Look, open: [number, number], stops: Stop[], rest: number) => this.errands.push({ a: actor(look), open, stops, leg: 0, until: 0, mode: 'home', rest });
    const villager = (seed: number, sex: 'f' | 'm', hat: 'palm' | 'krama' | 'none') => dress('villager', seed, { sex, hat });
    // (a neighbour from the house by the jetty, her basket on her head: fish, greens, home)
    errand(withBasket(villager(3161, 'f', 'krama'), 0xb8c0c4, 0x4f9a3a), [0.72, 0.93], [home('stilt-4'), stop('fish', 16), stop('greens', 14), stop('dried', 10), home('stilt-4')], 18);
    // (from the north street: fruit at the stall, then down the jetty to the fruit boat)
    errand(villager(3163, 'f', 'palm'), [0.74, 0.92], [home('stilt-2'), stop('fruit', 14), onto, boatStop('boat-fruit', 16), onto, stop('sweets', 10), home('stilt-2')], 24);
    // (a man from the south houses: an iced coffee at the cart, the grill in the afternoon)
    errand(villager(3165, 'm', 'none'), [0.73, 0.2], [home('stilt-6'), stop('drinks', 14, POSE.stand), stop('grill', 12, POSE.stand), home('stilt-6')], 40);
    // ── Eating on the stools by the noodle cart (breakfast; supper under the bulbs), and at the shop's table ──
    const noodles = at('noodles');
    const nc = Math.cos(noodles.yaw);
    const nn = Math.sin(noodles.yaw);
    const stoolAt = (sx: number, sz: number, face: number) => {
      const x = noodles.x + sx * nc + sz * nn;
      const z = noodles.z - sx * nn + sz * nc;
      return { x, y: field.heightAt(x, z), z, yaw: noodles.yaw + face };
    };
    const eater = (look: Look, where: Point & { yaw: number }, windows: [number, number][]) => this.eaters.push({ a: actor(withBowl(look)), at: where, windows });
    eater(villager(3171, 'm', 'krama'), stoolAt(-1.7, 1.2, Math.PI - 0.5), [
      [0.74, 0.9],
      [0.2, 0.4],
    ]);
    eater(villager(3173, 'f', 'none'), stoolAt(0.6, 1.55, Math.PI + 0.3), [
      [0.76, 0.92],
      [0.22, 0.36],
    ]);
    {
      // (the shop's table nearer the square: a stool at its end)
      const h = SHOP_HOME;
      const zf = (h.d + h.v) / 2;
      const [tx, tz] = homeToWorld(h, -h.w / 2 - 1.2 - 0.75, zf + 0.9);
      eater(dress('kid', 3175), { x: tx, y: field.heightAt(tx, tz), z: tz, yaw: h.facing - Math.PI / 2 }, [[0.26, 0.4]]);
    }
  }

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    const step = this.pace.step(dt, viewDist(f, MID.x, MID.z));
    if (step < 0) {
      this.hideAll();
      return;
    }
    if (step === 0 && this.shown) return;
    dt = step;
    this.shown = true;
    const c = f.clock;
    const exNear = ex && f.roam !== 'overview' ? ex : null;
    for (const s of this.sellers) this.sell(s, dt, now, c, exNear);
    this.keepShop(dt, now, c, exNear);
    for (const b of this.boats) this.boat(b, dt, now, c, exNear);
    for (const e of this.errands) this.walk(e, dt, now, c);
    for (const e of this.eaters) this.eat(e, dt, now, c);
    this.sounds(f, now, exNear);
  }

  /** A stall is open (as the build shows it: `fvopen` forces all or none). */
  private isOpen(w: [number, number], c: number): boolean {
    return this.force === 'all' ? true : this.force === 'none' ? false : inWindow(c, w);
  }

  /** A seller at her stall while it is open: her seat, her pose, looking up at buyers and the explorer, the noodle cook stirring. */
  private sell(s: Seller, dt: number, now: number, c: number, ex: Obstacle | null): void {
    const a = s.a;
    const open = this.isOpen(s.open, c);
    if (!open) {
      if (a.shown) a.hide();
      s.on = false;
      return;
    }
    let pose = s.pose;
    let at = s.seat;
    // The noodle cook goes to her pot now and then to stir the gravy.
    if (s.pot) {
      if (now > s.stir + 26) s.stir = now + 8 * frac(now * 0.071);
      if (now > s.stir && now < s.stir + 9) {
        at = s.pot;
        pose = POSE.stir;
      }
    }
    // The fruit seller kneels and gives when the monk stands at her stall on his alms round.
    if (s.id === 'fruit' && now < ALMS.until && len(ALMS.x - s.front.x, ALMS.z - s.front.z) < 2) pose = now < ALMS.until - 6 ? POSE.give : POSE.kneel;
    if (!a.shown || !s.on) {
      // (a seller who stands on the ground, the noodle cook, walks between her cart and her pot; the others sit where they sell)
      if (s.pot) a.warp(at.x, at.y, at.z, at.yaw);
      else a.ride(at.x, at.y, at.z, at.yaw);
      a.show();
      a.carry(0, now);
      s.on = true;
    }
    if (s.pot) {
      a.goTo(at.x, at.z, 0.6);
      a.face(at.yaw);
      if (a.dist(at.x, at.z) > 0.3) pose = POSE.stand;
    }
    a.pose(pose, now);
    // (her eyes: on the explorer when he is at her stall, else on the goods or the square now and then)
    const near = ex && len(ex.x - s.front.x, ex.z - s.front.z) < 4 ? ex : null;
    a.lookAt(near ? this.pt(near.x, near.y + 2, near.z) : null, now + 1);
    a.step(dt, now);
  }

  /** The grocer behind her counter (from dawn to late evening). */
  private keepShop(dt: number, now: number, c: number, ex: Obstacle | null): void {
    const a = this.grocer;
    const g = this.grocerAt;
    if (!inWindow(c, FV_GROCERY.open) || this.force === 'none') {
      if (a.shown) a.hide();
      return;
    }
    if (!a.shown) {
      a.ride(g.x, g.y, g.z, g.yaw);
      a.show();
    }
    a.pose(POSE.stand, now);
    a.lookAt(ex && len(ex.x - a.x, ex.z - a.z) < 6 ? this.pt(ex.x, ex.y + 2, ex.z) : null, now + 1);
    a.step(dt, now);
  }

  /** A boat: paddled in over the lake at dawn, tied at the jetty while the market is on, paddled off. */
  private boat(bt: Boat, dt: number, now: number, c: number, ex: Obstacle | null): void {
    const { b, rig, a } = bt;
    const [o0, o1] = b.open;
    const phase = (x: number) => ((x % 1) + 1) % 1;
    const inn = phase(c - (o0 - PADDLE)) / PADDLE;
    const out = phase(c - o1) / PADDLE;
    const moored = inWindow(c, b.open);
    let x = b.x;
    let z = b.z;
    let yaw = b.yaw;
    let moving = false;
    if (!moored && inn < 1) {
      [x, z, yaw] = along(bt.way, easeInOut(inn));
      moving = true;
    } else if (!moored && out < 1) {
      // (backing off the jetty, then round and away the way she came)
      [x, z, yaw] = along(bt.way, 1 - easeInOut(out));
      yaw += Math.PI * Math.min(1, out * 3);
      moving = true;
    } else if (!moored) {
      if (a.shown) a.hide();
      rig.hide();
      return;
    }
    const t = now + b.who.seed;
    const bob = 0.02 * Math.sin(t * 1.1);
    const roll = (moving ? 0.035 : 0.02) * Math.sin(t * 0.8);
    const pitch = 0.012 * Math.sin(t * 0.9 + 1);
    const y = LAKE_LEVEL + RIDE + bob;
    rig.place(x, y, z, yaw, pitch, roll, PEOPLE_SCALE).write();
    // She sits at the stern paddling; tied up, amidships among her goods, facing the jetty.
    const back = (moving ? -1.25 : -0.55) * PEOPLE_SCALE;
    const px = x + Math.sin(yaw) * back;
    const pz = z + Math.cos(yaw) * back;
    const face = moving ? yaw : Math.atan2(bt.dock[0] - px, bt.dock[1] - pz);
    a.ride(px, y - 0.06, pz, face);
    if (!a.shown) {
      a.show();
      a.carry(0, now);
    }
    a.pose(moving ? POSE.row : POSE.sit, now);
    if (moving) a.crowd.gait(a.i, 0.55, 0, now);
    a.lookAt(!moving && ex && len(ex.x - a.x, ex.z - a.z) < 5 ? this.pt(ex.x, ex.y + 2, ex.z) : null, now + 1);
    a.step(dt, now);
  }

  /** Someone on their round of the stalls (and the jetty): walk, stop and talk, on to the next, home; again after a rest. */
  private walk(e: Errand, dt: number, now: number, c: number): void {
    const a = e.a;
    const out = inWindow(c, e.open) && this.force !== 'none';
    if (e.mode === 'home') {
      if (a.shown) a.hide();
      if (!out || now < e.until) return;
      const h = e.stops[0];
      a.warp(h.x, this.floor(h), h.z, 0);
      a.show();
      e.leg = 1;
      e.mode = 'walk';
    }
    const s = e.stops[e.leg];
    if (e.mode === 'walk') {
      a.pose(POSE.stand, now);
      a.lookAt(null);
      a.face(null);
      a.goTo(s.x, s.z, WALK);
      if (a.dist(s.x, s.z) < 0.35) {
        if (e.leg === e.stops.length - 1) {
          a.hide();
          e.mode = 'home';
          e.until = now + e.rest * (0.7 + 0.6 * frac(now * 0.137 + e.rest));
          return;
        }
        if (s.wait > 0) {
          e.mode = 'stop';
          e.until = now + s.wait;
        } else e.leg++;
      }
    } else if (e.mode === 'stop') {
      a.stop(s.yaw);
      a.pose(Math.sin(now * 0.5 + e.rest) > -0.2 ? s.pose : POSE.stand, now);
      a.lookAt(s.look ?? null, now + 1);
      if (now > e.until) {
        e.leg++;
        e.mode = 'walk';
      }
    }
    a.step(dt, now);
  }

  /** Eating on a stool (the bowl in the left hand, a bite now and then) over their windows. */
  private eat(e: Eater, dt: number, now: number, c: number): void {
    const a = e.a;
    const on = this.force !== 'none' && e.windows.some((w) => inWindow(c, w));
    if (!on) {
      if (a.shown) a.hide();
      return;
    }
    if (!a.shown) {
      a.ride(e.at.x, e.at.y, e.at.z, e.at.yaw);
      a.show();
      a.carry(1, now);
    }
    a.pose(POSE.eat, now);
    a.step(dt, now);
  }

  /** The market's murmur, a seller's call (a bubble when the explorer is close), the grill. */
  private sounds(f: MapFrame, now: number, ex: Obstacle | null): void {
    if (f.dt <= 0 || this.env.shot) return;
    const l = f.listener;
    const d = len(l.x - MID.x, l.z - MID.z);
    if (d > HEAR) return;
    let n = 0;
    for (const a of this.actors) if (a.shown) n++;
    if (now > this.murmurAt) {
      this.murmurAt = now + 5 + 3 * frac(now * 0.31);
      if (n >= 4) f.calls.push({ kind: 'market', x: MID.x, y: GROUND + 1.5, z: MID.z, gain: Math.min(0.8, 0.2 + n / 20) });
    }
    if (now > this.callAt) {
      this.callAt = now + 7 + 9 * frac(now * 0.173);
      // (the seller nearest the ears)
      let best: { a: Actor; id: string } | null = null;
      let bd = 40;
      for (const s of this.sellers) if (s.a.shown && len(s.a.x - l.x, s.a.z - l.z) < bd) ((bd = len(s.a.x - l.x, s.a.z - l.z)), (best = { a: s.a, id: s.id }));
      for (const b of this.boats) if (b.a.shown && len(b.a.x - l.x, b.a.z - l.z) < bd) ((bd = len(b.a.x - l.x, b.a.z - l.z)), (best = { a: b.a, id: b.b.id }));
      if (best) {
        const a = best.a;
        f.calls.push({ kind: 'vendorCall', x: a.x, y: a.y + 1.6, z: a.z, gain: 0.7 });
        const key = frac(now * 0.37) < 0.65 ? CALL[best.id] ?? ANY_CALL[0] : ANY_CALL[Math.floor(frac(now * 0.53) * ANY_CALL.length)];
        if (ex && len(ex.x - a.x, ex.z - a.z) < SAY && !this.env.bubble.showing) this.env.bubble.say(key, () => this.head(a), 2.8);
      }
    }
    const grill = this.sellers.find((s) => s.id === 'grill');
    if (grill?.a.shown && now > this.sizzleAt && len(grill.a.x - l.x, grill.a.z - l.z) < 40) {
      this.sizzleAt = now + 4 + 3 * frac(now * 0.29);
      f.calls.push({ kind: 'sizzle', x: grill.a.x, y: grill.a.y + 1, z: grill.a.z, gain: 0.5 });
    }
  }

  private floor(s: Stop): number {
    const g = this.ground.at(s.x, s.z, s.y + 0.3);
    return Number.isFinite(g) ? g : s.y;
  }

  private pt(x: number, y: number, z: number): Point {
    this.tmp.x = x;
    this.tmp.y = y;
    this.tmp.z = z;
    return this.tmp;
  }

  private readonly headPt: Point = { x: 0, y: 0, z: 0 };
  private head(a: Actor): Point {
    this.headPt.x = a.x;
    this.headPt.y = a.y + 2.9 * (a.crowd.scale(a.i) / 1.4);
    this.headPt.z = a.z;
    return this.headPt;
  }

  private hideAll(): void {
    if (!this.shown) return;
    this.shown = false;
    for (const a of this.actors) if (a.shown) a.hide();
    for (const b of this.boats) b.rig.hide();
    for (const s of this.sellers) s.on = false;
    for (const e of this.errands) e.mode = 'home';
  }

  report(traffic: Traffic): void {
    for (const a of this.actors) if (a.shown) traffic.add(this.name, a.x, a.y, a.z);
  }

  /** While the market is busy, its buyers and eaters are the book's `market` crowd (the sellers count as `vendor`s). */
  subjects(out: Subject[]): void {
    for (const e of [...this.errands.map((o) => o.a), ...this.eaters.map((o) => o.a)]) {
      if (!e.shown) continue;
      const r = 0.85 * PEOPLE_SCALE * e.look.height;
      out.push({ kind: 'market', x: e.x, y: e.y + r, z: e.z, r });
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function frac(x: number): number {
  return x - Math.floor(x);
}

function easeInOut(t: number): number {
  return t * t * (3 - 2 * t);
}

/** A point `t` (0‥1) along a way of points, and the heading there. */
function along(way: [number, number][], t: number): [number, number, number] {
  let total = 0;
  const lens: number[] = [];
  for (let i = 0; i < way.length - 1; i++) {
    const l = Math.hypot(way[i + 1][0] - way[i][0], way[i + 1][1] - way[i][1]);
    lens.push(l);
    total += l;
  }
  let d = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const k = lens[i] > 0 ? Math.min(1, d / lens[i]) : 1;
      const [ax, az] = way[i];
      const [bx, bz] = way[i + 1];
      return [ax + (bx - ax) * k, az + (bz - az) * k, Math.atan2(bx - ax, bz - az)];
    }
    d -= lens[i];
  }
  const [x, z] = way[way.length - 1];
  return [x, z, 0];
}

/** A look with a round basket on the head (`CARRY.head`), its load in the goods' colours. */
function withBasket(base: Look, load: number, load2: number): Look {
  const colors = base.colors.slice();
  colors[SLOT.prop] = load;
  colors[SLOT.prop2] = load2;
  colors[SLOT.wood] = 0xc8a868;
  return { ...base, colors, feats: [...base.feats, FEAT.headBasket], carry: CARRY.head };
}

/** A look with a small bowl and chopsticks (eating). */
function withBowl(base: Look): Look {
  return { ...base, feats: [...base.feats, FEAT.smallBowl] };
}

// ── The boats ────────────────────────────────────────────────────────────────

const TEAK = 0x8f532b;
const TEAK_DARK = 0x6e3f20;
const CAP = 0xc08652;
const PLANK = 0x5c3419;
const WICKER = 0xa8864a;

/**
 * A market boat (at true size: the rig is placed at the people's scale): a
 * teak dugout a little broader than the fishermen's, a blue band under the
 * gunwale, a thwart, and its goods in baskets and basins amidships and
 * forward: fruit (mangoes, bananas, rambutans, a pomelo), greens (bundles
 * of morning glory, water lily stems), fish (aluminium basins of silver
 * fish, a tub), or the noodle boat's charcoal stove, pot and bowls.
 */
function boatDef(b: FvBoat): RigDef {
  const d = new RigDef();
  d.box([0, -0.11, 0], [0.64, 0.12, 3.6], TEAK_DARK)
    .box([0, -0.07, 0], [0.72, 0.04, 3.2], PLANK)
    .box([0.41, 0.08, 0], [0.09, 0.32, 3.3], TEAK)
    .box([-0.41, 0.08, 0], [0.09, 0.32, 3.3], TEAK)
    .box([0.425, 0.255, 0], [0.13, 0.04, 3.3], CAP)
    .box([-0.425, 0.255, 0], [0.13, 0.04, 3.3], CAP)
    .box([0.462, 0.17, 0], [0.012, 0.06, 3.2], 0x3a6aa8)
    .box([-0.462, 0.17, 0], [0.012, 0.06, 3.2], 0x3a6aa8)
    .box([0, 0.12, 1.82], [0.46, 0.38, 0.36], TEAK)
    .box([0, 0.42, 2.06], [0.14, 0.34, 0.2], CAP)
    .box([0, 0.1, -1.82], [0.46, 0.32, 0.34], TEAK)
    .box([0, 0.3, -2.02], [0.12, 0.2, 0.16], CAP)
    .box([0, 0.14, -0.95], [0.78, 0.05, 0.2], CAP)
    // A paddle lying along the side.
    .box([0.26, 0.02, -0.2], [0.05, 0.05, 2.0], TEAK_DARK)
    .box([0.26, 0.02, 0.85], [0.16, 0.03, 0.4], TEAK_DARK);
  const basket = (x: number, z: number, top: number[]) => {
    d.box([x, 0.04, z], [0.44, 0.2, 0.44], WICKER);
    top.forEach((c, k) => d.box([x + ((k % 2) - 0.5) * 0.14, 0.17 + Math.floor(k / 2) * 0.06, z + ((k >> 1) % 2 ? 0.07 : -0.07)], [0.16, 0.1, 0.16], c));
  };
  switch (b.goods) {
    case 'fruit':
      basket(0, 0.45, [0xf0b030, 0xe8c040, 0xf2a428, 0xd8b83a]);
      basket(0, 1.05, [0xc8302a, 0xb82828, 0xd84030]);
      d.box([0, 0.12, 1.5], [0.36, 0.2, 0.28], 0xe8d040).box([0, 0.18, 0.05], [0.3, 0.26, 0.3], 0xb8c870);
      break;
    case 'greens':
      for (let k = 0; k < 6; k++) d.box([-0.2 + (k % 3) * 0.2, 0.06 + Math.floor(k / 3) * 0.1, 0.55], [0.14, 0.12, 0.7], [0x4f9a3a, 0x62aa44, 0x3f8a32][k % 3]);
      for (let k = 0; k < 3; k++) d.box([-0.15 + k * 0.15, 0.08, 1.3], [0.08, 0.08, 0.8], [0xb86a9a, 0xa85a8a, 0xc87aa8][k]);
      basket(0, 0.0, [0x5aa040, 0x4a9038]);
      break;
    case 'fish':
      for (const z of [0.35, 1.05]) {
        d.box([0, 0.06, z], [0.56, 0.2, 0.56], 0xb4b8ba).box([0, 0.06, z], [0.56, 0.2, 0.56], 0xb4b8ba, { rot: [0, Math.PI / 4, 0] });
        for (let k = 0; k < 5; k++) d.box([-0.16 + k * 0.08, 0.17, z + ((k % 2) - 0.5) * 0.18], [0.07, 0.03, 0.26], [0xb8c0c4, 0xa8b2b8, 0xcfd6d8][k % 3], { rot: [0, k * 0.5, 0] });
      }
      d.box([0, 0.1, 1.55], [0.4, 0.28, 0.34], 0x3a6aa8);
      break;
    case 'noodles':
      // The stove amidships with its pot, a board of bowls and a basket of noodles forward.
      d.box([0, 0.06, 0.35], [0.4, 0.26, 0.4], 0x8a5a3a).box([0, 0.3, 0.35], [0.46, 0.26, 0.46], 0xb4b8ba).box([0, 0.44, 0.35], [0.38, 0.02, 0.38], 0xb8b048);
      d.box([0, 0.14, 1.0], [0.6, 0.04, 0.5], 0x8a6f55);
      for (let k = 0; k < 4; k++) d.box([-0.18 + k * 0.12, 0.2, 1.0], [0.1, 0.07, 0.1], 0xf0f0ea);
      d.box([0, 0.08, 1.55], [0.36, 0.22, 0.3], WICKER).box([0, 0.2, 1.55], [0.28, 0.06, 0.24], 0xf2eee4);
      break;
  }
  return d;
}
