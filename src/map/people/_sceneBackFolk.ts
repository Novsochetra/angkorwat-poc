import { hash3 } from '../../voxel/random';
import { eventsNow } from '../events';
import { len2 } from '../fauna/_len';
import { bmX, bmYaw, bmZ, MONK_STOP } from '../hamlet/_bhMarketPlan';
import { ALMS, CART, hammockTies, HOMES, homeFront, homeToWorld, loomSpot, MONK_HUT, SALA, salaToWorld, stiltGrid, type BackSpots, type P2 } from '../hamlet/_bhSpots';
import { BROWSE } from '../shop';
import { TIME } from '../time';
import type { MapFrame } from '../types';
import { Actor, wrap } from './_actor';
import { Bicycle, BIKE_WHEEL } from './_bicycle';
import { dress } from './_kinds';
import { CARRY, FEAT, FIT, POSE, SLOT, type Look, type Pose } from './_personModel';
import type { Ground, Obstacle, Point } from './_routes';
import type { PeopleEnv } from './_scene';
import { hammockHidden, hammockTaken } from '../roam/_hammockSpots';
import { GRANDPA_HAMMOCK, hammockDef, since, Way, within, type WayPoint } from './_sceneBackKit';
import { Rig } from './_things';

/**
 * The grown-ups of the hamlet behind Angkor Wat (`_sceneBack.ts`):
 *
 * - **The forest monk** (`ForestMonk`) walks his alms round (បិណ្ឌបាត) from
 *   his hut in the jungle to the hamlet and back, barefoot, his bowl in his
 *   arms, the whole way on foot (monks never ride to their alms round: no
 *   bicycle, moto or cart). He comes down his ladder in the dark before
 *   dawn (`clock` 0.645), walks the back trail east and stops at the market
 *   by the lane's foot about sunrise (≈ 0.79), where the breakfast cook and
 *   the fruit seller kneel and give (`market`, read by
 *   `_sceneBackMarket.ts`); then up the lane to the middle of the yard
 *   (≈ 0.94), where the old house's woman and the weaver kneel before him
 *   and give rice wrapped in banana leaf (`give`), he blesses them (`nod`:
 *   monks do not sampeah lay people), they bow; he walks home the way he
 *   came and goes up into his hut (≈ 0.25; `MONK_AT`‥`MONK_END`).
 * - **The rider** on the back trail (`Riders`): a villager in a palm-leaf
 *   hat rides out east on her bicycle with her basket in the morning
 *   (0.8‥) and back in the afternoon (0.97‥) with it full, stopping at the
 *   juice cart for a coconut on the way. Bells (`bikeBell`) for the
 *   explorer in the way.
 * - **The juice seller** at his cart by the sala (0.8‥0.27): on his low
 *   stool in the shade, calling "ដូងខ្ចីត្រជាក់ៗ!" when the explorer comes
 *   up to the cart; when someone wants a coconut (the villager; the
 *   explorer at the buy menu of the shop `back-coconut`, shop.ts `BROWSE`)
 *   he gets up, takes the machete and chops the top off a green coconut
 *   (`chop` ×3), then hands it over (`give`: the explorer's when he pays,
 *   people/_saleBack.ts).
 * - **At home**: the grandfather dozing in his hammock under the old house
 *   through the hot hours (0.9‥0.22), swinging a little, on the veranda in
 *   the evening; the old house's woman sweeping the yard with a palm-rib
 *   broom in the morning and late afternoon, cooking at her stove at dusk
 *   (the smoke, `crackle`); the weaver at her loom under her house all day,
 *   the shuttle flying across the warp, the beater knocking (`knock`); the
 *   blue house's wife on her veranda in the evening.
 *
 * URL: `bhmonk=<s>`, `bhbike=<s>` in a still: the monk that many seconds
 * into his round (with a `clock` in it, `MONK_AT`‥`MONK_END`; a still lives
 * ≈ 10 s first: `bhmonk=20` on the trail, `46` the market's gifts, `52` its
 * blessing, `80` up the lane, `101` the yard's gifts, `110` its blessing,
 * `140` on his way home), the villager into her ride (out in the
 * morning's half of the day, back in the afternoon's).
 */

/** Riding pace (m/s), walking. */
const RIDE = 3.3;
const WALK = 0.9;
/**
 * The forest monk's alms round (clock): he sets out from his hut in the dark before dawn (a long way to walk to
 * the village) and is home again in the afternoon; the calendar of events asks them too (map/calendar.ts). Within
 * it, his times follow from his way and his pace (`ForestMonk`): about sunrise at the market, mid-morning in the yard.
 */
export const MONK_AT = 0.645;
export const MONK_END = 0.26;
/** His pace on his round (m/s: a steady walk; the hut is a long way off), and how far ahead on his way he walks to (m). */
const MONK_PACE = 1.2;
const MONK_LEAD = 1.2;
/** At his ladder's foot: come down, before he walks off; back, before he goes up (s). */
const AT_HUT = 3;
/** The villager rides out and back (clock). */
const BIKE_OUT = 0.8;
const BIKE_BACK = 0.97;
/** The alms: how long he stands in the yard (s); how long he stops at the market on his way in (s). */
const ALMS_S = 20;
const MARKET_S = 14;
/** The yard's women come out to wait for him this long before he is there (s: the weaver's walk from her loom takes ≈ 25). */
const ALMS_WAIT = 30;
/** At the cart (s). */
const CART_S = 16;


/** Where a rider is (feet), heading, and how far the wheels have rolled. */
export interface Ride {
  a: Actor;
  bike: Bicycle;
  rolled: number;
  y: number;
  bellAt: number;
  parked: { x: number; y: number; z: number; yaw: number } | null;
}

/** A rider on a way at `s` (m): the rider in the ride pose pedalling, the bicycle under them. */
export function rideAt(r: Ride, way: Way, s: number, dir: 1 | -1, speed: number, dt: number, now: number, ground: Ground, wp: WayPoint): void {
  way.at(s, wp);
  const yaw = dir > 0 ? wp.yaw : wp.yaw + Math.PI;
  const g = ground.at(wp.x, wp.z, r.y + 0.8);
  const gy = Number.isFinite(g) ? g : ground.field.heightAt(wp.x, wp.z);
  r.y = r.a.shown ? r.y + (gy - r.y) * Math.min(1, dt * 6) : gy;
  const a = r.a;
  const sc = a.crowd.scale(a.i);
  a.ride(wp.x, r.y, wp.z, yaw);
  a.show();
  a.pose(POSE.ride, now);
  a.step(dt, now);
  a.crowd.gait(a.i, 1, speed / (FIT.bike.gear * sc), now);
  r.rolled += speed * dt;
  r.bike.put(wp.x, r.y, wp.z, yaw, sc, a.crowd.phaseOf(a.i, now), r.rolled / (BIKE_WHEEL * sc));
  r.parked = null;
}

/** Lean a bicycle, riderless, at a spot. */
function park(r: Ride, x: number, y: number, z: number, yaw: number): void {
  if (r.parked && r.parked.x === x && r.parked.z === z) return;
  const sc = r.a.crowd.scale(r.a.i);
  r.bike.rig.place(x, y, z, yaw, 0, 0.14, sc);
  r.bike.rig.write();
  r.parked = { x, y, z, yaw };
}

/**
 * The forest monk's alms round, all on foot (the file's head): his round in seconds from `MONK_AT`, where he
 * is on it from his way (`routes.monk`: his hut's ladder to the middle of the yard) and his pace. On the way he
 * walks after a point a little ahead of him on it, so he steps round whoever is in it and catches up after.
 */
export class ForestMonk {
  readonly a: Actor;
  private readonly way: Way;
  private readonly back: Way;
  private readonly wp: WayPoint = { x: 0, z: 0, yaw: 0 };
  /** Seconds into his round (−1: not on one); the round (days since `MONK_AT`) and the time's skips it was set at. */
  private t = -1;
  private round = NaN;
  private skips = NaN;
  /** The alms in the yard: on, and the seconds into it (for the women: HomeFolk); `coming`: they come out to wait. */
  readonly alms = { on: false, t: 0, coming: false };
  /**
   * The alms at the market on his way in (for the sellers: `_sceneBackMarket.ts`): on (from a few seconds
   * before he gets there: they come out to wait, kneeling), the seconds into his stop (negative: still coming),
   * where he stands on the trail and the way he faces (the breakfast stall's side).
   */
  readonly market = { on: false, t: 0, x: 0, z: 0, yaw: 0 };
  /** Where along his way in he stops at the market (m). */
  private readonly marketAt: number;

  constructor(
    private readonly env: PeopleEnv,
    spots: BackSpots,
    private readonly ground: Ground,
    add: (a: Actor) => Actor,
  ) {
    const look = dress('monk', 2301, { carry: CARRY.bowl });
    // (barefoot, as monks walk their alms round: the sugar-palm village's too, _sceneAlms.ts)
    look.colors[SLOT.sole] = look.colors[SLOT.skin];
    this.a = add(new Actor(env.crowd, look, ground));
    this.way = new Way(spots.routes.monk);
    this.back = this.way.reversed();
    // (the market's stop: the point of his way nearest the spot on the trail before the breakfast stall)
    const mx = bmX(MONK_STOP.s, MONK_STOP.t);
    const mz = bmZ(MONK_STOP.s, MONK_STOP.t);
    let best = Infinity;
    let at = 0;
    const w = this.way;
    for (let i = 0; i < w.xs.length; i++) {
      const d = len2(w.xs[i] - mx, w.zs[i] - mz);
      if (d < best) [best, at] = [d, i * 0.5];
    }
    this.marketAt = at;
    const m = w.at(at, { x: 0, z: 0, yaw: 0 });
    Object.assign(this.market, { x: m.x, z: m.z, yaw: bmYaw(MONK_STOP.face) });
  }

  update(dt: number, now: number, f: MapFrame, first: boolean): void {
    const a = this.a;
    const inWin = within(f.clock, MONK_AT, MONK_END);
    // (one round a day from `MONK_AT`, counted from it: the date turning while he walks home is the same round; set
    // again when the scene is first seen and when the time is moved on: sleeping, "Wait for it". Past `MONK_END`
    // he still walks on home: nobody vanishes on the trail)
    const round = Math.floor(f.day + f.clock - MONK_AT);
    const skips = TIME.skipped();
    if (first || round !== this.round || skips !== this.skips) {
      this.round = round;
      this.skips = skips;
      const q = this.env.params.get('bhmonk');
      this.t = !inWin ? -1 : q !== null && first ? Number(q) || 0 : since(f.clock, MONK_AT);
      // (put where his round has him now, not walked there)
      if (a.shown) a.hide();
    }
    const len = this.way.len;
    const at = this.marketAt;
    // His round: down his ladder, the trail to the market, the stop, on up the lane to the yard, the alms, home.
    const t0 = AT_HUT;
    const tm = t0 + at / MONK_PACE;
    const t1 = tm + MARKET_S;
    const t2 = t1 + (len - at) / MONK_PACE;
    const t3 = t2 + ALMS_S;
    const t4 = t3 + len / MONK_PACE;
    const end = t4 + AT_HUT;
    const T = this.t;
    this.alms.on = T >= t2 && T < t3;
    this.alms.coming = T >= t2 - ALMS_WAIT && T < t2;
    this.alms.t = T - t2;
    this.market.t = T - tm;
    this.market.on = T >= 0 && this.market.t > -9 && this.market.t < MARKET_S;
    const [fx, fz] = MONK_HUT.foot;
    if (T < 0 || (T >= end && (!a.shown || a.dist(fx, fz) < 0.6))) {
      // (up in his hut, or not yet down; held up on his way home, he goes up once he is there)
      if (a.shown) a.hide();
      return;
    }
    this.t += dt;
    if (T < t0) {
      // Down his ladder, at its foot: turning to his way.
      this.stand(fx, fz, POSE.stand, this.way.at(0, this.wp).yaw, 0, dt, now);
    } else if (T < tm) {
      this.walk(this.way, (T - t0) * MONK_PACE, at, dt, now);
    } else if (T < t1) {
      // At the market: standing with his bowl before the breakfast stall; the sellers kneel and give, he blesses them.
      const u = this.market.t;
      const mk = this.market;
      const bless = u > 7.5 && u < 11.5;
      this.stand(mk.x, mk.z, bless ? POSE.nod : POSE.stand, mk.yaw, bless ? 0.35 : 0.15, dt, now);
    } else if (T < t2) {
      this.walk(this.way, at + (T - t1) * MONK_PACE, len, dt, now);
    } else if (T < t3) {
      // In the middle of the yard, facing the women kneeling before him; then the blessing.
      const [ax, az] = ALMS.monk;
      const u = T - t2;
      const bless = u > 9 && u < 17;
      this.stand(ax, az, bless ? POSE.nod : POSE.stand, Math.PI, bless ? 0.35 : 0.15, dt, now);
    } else if (T < t4) {
      this.walk(this.back, (T - t3) * MONK_PACE, len, dt, now);
    } else {
      // Back at his ladder's foot, about to go up.
      this.stand(fx, fz, POSE.stand, null, 0, dt, now);
    }
  }

  /** On his way: `s` m along it by his round's clock (up to `end`, m), walking after a point a little ahead of him. */
  private walk(way: Way, s: number, end: number, dt: number, now: number): void {
    const a = this.a;
    const wp = this.wp;
    if (!a.shown) {
      // (seen part way: where his round has him)
      way.at(Math.min(s, end), wp);
      a.warp(wp.x, this.ground.field.heightAt(wp.x, wp.z), wp.z, wp.yaw);
      a.show();
    }
    way.at(Math.min(end, s + MONK_LEAD), wp);
    // (held up — someone in his way, the explorer —: he catches up, a little quicker)
    const pace = a.dist(wp.x, wp.z) > MONK_LEAD + 1.5 ? MONK_PACE * 1.25 : MONK_PACE;
    this.step(wp.x, wp.z, POSE.stand, null, 0, pace, dt, now);
  }

  /** At a spot (walked to if he is not there yet), in a pose, turning to `face` once there, the head tilted. */
  private stand(x: number, z: number, pose: Pose, face: number | null, tilt: number, dt: number, now: number): void {
    const a = this.a;
    if (!a.shown) {
      a.warp(x, this.ground.field.heightAt(x, z), z, face ?? 0);
      a.show();
    }
    this.step(x, z, pose, face, tilt, MONK_PACE, dt, now);
  }

  private step(x: number, z: number, pose: Pose, face: number | null, tilt: number, pace: number, dt: number, now: number): void {
    const a = this.a;
    a.goTo(x, z, pace);
    a.face(face);
    a.pose(pose, now);
    a.carry(1, now);
    a.lookAt(null);
    a.tilt(tilt);
    a.step(dt, now);
  }

  hide(): void {
    if (this.a.shown) this.a.hide();
    this.t = -1;
    this.round = NaN;
    this.alms.on = this.alms.coming = false;
    this.market.on = false;
  }
}

/** The villager on her bicycle (see the file's head). */
export class Riders {
  readonly actors: Actor[] = [];
  private readonly rider: Ride;
  private readonly out: Way;
  private readonly leg1: Way;
  private readonly leg2: Way;
  private readonly wp: WayPoint = { x: 0, z: 0, yaw: 0 };
  private bikeT = -1;
  private bikeTrip: 'out' | 'back' | null = null;
  /** The villager stopping at the cart (for the seller). */
  atCart = false;
  private readonly bikeHome: { x: number; y: number; z: number; yaw: number };
  private readonly foot: P2;
  /** The villager's stool and her place at the cart. */
  private readonly stool: P2;
  private readonly cartStand: P2;

  constructor(
    private readonly env: PeopleEnv,
    spots: BackSpots,
    private readonly ground: Ground,
    add: (a: Actor) => Actor,
  ) {
    const rider = add(new Actor(env.crowd, dress('villager', 2311, { sex: 'f', hat: 'palm' }), ground));
    this.rider = { a: rider, bike: new Bicycle(env.things, 2311, { load: 'basket' }), rolled: 0, y: 0, bellAt: 0, parked: null };
    this.actors.push(rider);
    const r = spots.routes;
    // The villager: out from the weaver's house to the far end of the trail; back to the cart, then home.
    this.out = new Way(r.bike);
    const cartFront = salaToWorld(CART.lx + 0.6, CART.lz + 1.9);
    const junction = r.bike.find((p) => Math.abs(p[0] - 128) < 0.5) ?? [128, -306];
    const j = r.bike.indexOf(junction as P2);
    this.leg1 = new Way([...r.bike.slice(j).reverse(), cartFront]);
    this.leg2 = new Way([cartFront, ...r.bike.slice(0, j + 1).reverse()]);
    const east = HOMES[2];
    const { zs } = stiltGrid(east);
    const [bx, bz] = homeToWorld(east, east.stair + 1.7, zs[zs.length - 1] - 0.2);
    this.bikeHome = { x: bx, y: ground.field.heightAt(bx, bz), z: bz, yaw: east.facing + Math.PI / 2 };
    this.foot = r.bike[0];
    this.stool = salaToWorld(CART.stools[1][0], CART.stools[1][1]);
    this.cartStand = salaToWorld(CART.lx + 0.3, CART.lz + 1.0);
  }

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null, first: boolean): void {
    this.villager(dt, now, f, ex, first);
  }

  // ── The villager's ride out and back ──────────────────────────────────────

  private villager(dt: number, now: number, f: MapFrame, ex: Obstacle | null, first: boolean): void {
    const r = this.rider;
    const a = r.a;
    const trip = within(f.clock, BIKE_OUT, BIKE_BACK) ? 'out' : 'back';
    if (trip !== this.bikeTrip || first) {
      const q = this.env.params.get('bhbike');
      this.bikeT = q !== null && first ? Number(q) || 0 : since(f.clock, trip === 'out' ? BIKE_OUT : BIKE_BACK);
      this.bikeTrip = trip;
    } else this.bikeT += dt;
    const T = this.bikeT;
    const home = this.bikeHome;
    this.atCart = false;
    const stormy = eventsNow(f).shelter > 0.5;
    if (trip === 'out') {
      const W = 4;
      const R = this.out.len / RIDE;
      if (T < W) {
        park(r, home.x, home.y, home.z, home.yaw);
        const [fx, fz] = this.foot;
        if (!a.shown) {
          a.warp(fx, this.ground.field.heightAt(fx, fz), fz, 0);
          a.show();
        }
        a.goTo(home.x + 0.4, home.z + 0.4, WALK);
        a.face(null);
        a.pose(POSE.stand, now);
        a.step(dt, now);
      } else if (T < W + R) {
        rideAt(r, this.out, (T - W) * RIDE, 1, RIDE, dt, now, this.ground, this.wp);
        this.bell(r, f, ex, now);
      } else {
        if (a.shown) a.hide();
        r.bike.hide();
        r.parked = null;
      }
      return;
    }
    const R1 = this.leg1.len / RIDE;
    const R2 = this.leg2.len / RIDE;
    const stop = stormy ? 0 : CART_S;
    if (T < R1) {
      rideAt(r, this.leg1, T * RIDE, 1, RIDE, dt, now, this.ground, this.wp);
      this.bell(r, f, ex, now);
    } else if (T < R1 + stop) {
      // At the cart: off the bicycle, a coconut, sitting on a stool with it.
      this.leg1.at(this.leg1.len, this.wp);
      park(r, this.wp.x - Math.cos(this.wp.yaw) * 0.9, this.ground.field.heightAt(this.wp.x, this.wp.z), this.wp.z + Math.sin(this.wp.yaw) * 0.9, this.wp.yaw);
      const [sx, sz] = this.stool;
      const u = T - R1;
      if (!a.shown || a.riding) {
        a.warp(this.wp.x, r.y, this.wp.z, this.wp.yaw);
        a.show();
      }
      this.atCart = u < 7;
      if (u < 7) {
        // (standing at the cart while he cuts it)
        a.goTo(this.cartStand[0], this.cartStand[1], WALK);
        a.face(SALA.facing + Math.PI);
        a.pose(POSE.stand, now);
      } else {
        a.goTo(sx, sz, WALK);
        a.face(SALA.facing);
        a.pose(a.dist(sx, sz) < 0.3 ? POSE.stool : POSE.stand, now);
      }
      a.step(dt, now);
    } else if (T < R1 + stop + R2) {
      rideAt(r, this.leg2, (T - R1 - stop) * RIDE, 1, RIDE, dt, now, this.ground, this.wp);
      this.bell(r, f, ex, now);
    } else if (T < R1 + stop + R2 + 5) {
      park(r, home.x, home.y, home.z, home.yaw);
      const [fx, fz] = this.foot;
      if (a.riding) a.warp(a.x, home.y, a.z, a.yaw);
      a.goTo(fx, fz, WALK);
      a.face(null);
      a.pose(POSE.stand, now);
      a.step(dt, now);
    } else {
      if (a.shown) a.hide();
      park(r, home.x, home.y, home.z, home.yaw);
    }
  }

  /** A ring of the bell for the explorer in the way ahead. */
  private bell(r: Ride, f: MapFrame, ex: Obstacle | null, now: number): void {
    if (!ex || f.dt <= 0 || now < r.bellAt) return;
    const a = r.a;
    const dx = ex.x - a.x;
    const dz = ex.z - a.z;
    const d = len2(dx, dz);
    if (d > 11 || Math.abs(wrap(Math.atan2(dx, dz) - a.yaw)) > 0.6) return;
    r.bellAt = now + 6;
    f.calls.push({ kind: 'bikeBell', x: a.x, y: a.y + 1.2, z: a.z, gain: 0.7 });
  }

  hide(): void {
    const r = this.rider;
    if (r.a.shown) r.a.hide();
    r.bike.hide();
    r.parked = null;
    this.bikeTrip = null;
  }
}

// ── The juice seller ─────────────────────────────────────────────────────────

/** The seller's round when someone comes: get up, cut (s), hand it over (s), sit again. */
const UP = 0.7;
const CUT = 2.4;
const HAND = 3.2;

export class Seller {
  readonly a: Actor;
  private readonly idle: Look;
  private readonly cutting: Look;
  private readonly giving: Look;
  /** Serving since (s), or −1; not again until (s). */
  private serveAt = -1;
  private again = 0;
  private chopped = 0;
  /** Serving the explorer (at his menu) rather than the villager. */
  private forExplorer = false;
  private customer: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  private readonly look: Point = { x: 0, y: 0, z: 0 };
  private readonly seat: [number, number];
  private readonly stump: [number, number];
  private readonly front: [number, number];
  private spoke = -1e9;

  constructor(
    private readonly env: PeopleEnv,
    private readonly ground: Ground,
    add: (a: Actor) => Actor,
  ) {
    this.idle = dress('vendor', 2401, { sex: 'm', hat: 'none', goods: 'fruit' });
    // (the machete in his hand while he cuts; the coconut held out: the parcel, green)
    this.cutting = { ...this.idle, feats: [...this.idle.feats, FEAT.knife] };
    const colors = this.idle.colors.slice();
    colors[SLOT.prop2] = 0x7aa040;
    colors[SLOT.accent2] = 0xe8e4d8;
    this.giving = { ...this.idle, colors, feats: [...this.idle.feats, FEAT.parcel] };
    this.a = add(new Actor(env.crowd, this.idle, ground));
    this.seat = salaToWorld(CART.seat[0], CART.seat[1]);
    this.stump = salaToWorld(CART.lx - 0.3, CART.lz - 0.35);
    this.front = salaToWorld(CART.lx, CART.lz + 1.3);
  }

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null, first: boolean, riders: Riders): void {
    const a = this.a;
    const open = within(f.clock, 0.8, 0.27) && eventsNow(f).shelter < 0.5;
    if (!open) {
      if (a.shown) a.hide();
      this.serveAt = -1;
      return;
    }
    const [sx, sz] = this.seat;
    if (!a.shown || first) {
      a.warp(sx, this.ground.field.heightAt(sx, sz), sz, SALA.facing);
      a.show();
    }
    // The explorer in front of the cart: he calls to him (now and then).
    const [fx, fz] = this.front;
    const exNear = !!ex && len2(ex.x - fx, ex.z - fz) < 3.2 && Math.abs(ex.y - a.y) < 2;
    if (exNear && ex && this.serveAt < 0 && now - this.spoke > 40) {
      this.spoke = now;
      if (!this.env.shot) this.env.bubble.say('bhCoconut', () => ({ x: a.x, y: a.y + 3, z: a.z }), 3.4);
      if (f.dt > 0) f.calls.push({ kind: 'vendorCall', x: a.x, y: a.y + 1.6, z: a.z, gain: 0.6 });
    }
    // Someone to serve: the villager at the cart, or the explorer at his menu (the shop `back-coconut`, shop.ts `BROWSE`):
    // he gets up and chops a coconut; the explorer's is handed over when he pays (people/_saleBack.ts).
    const browsing = BROWSE.shop === 'back-coconut' && !!ex;
    if (this.serveAt < 0 && (browsing || (now > this.again && riders.atCart))) {
      this.serveAt = now;
      this.chopped = 0;
      this.forExplorer = browsing;
      this.customer = browsing && ex ? { x: ex.x, y: ex.y, z: ex.z } : { x: fx, y: a.y, z: fz };
    }
    const u = this.serveAt >= 0 ? now - this.serveAt : -1;
    let pose: Pose = POSE.stool;
    let lookAt: Point | null = null;
    if (u < 0) {
      a.goTo(sx, sz, WALK);
      a.face(SALA.facing);
      pose = a.dist(sx, sz) < 0.25 ? POSE.stool : POSE.stand;
      if (ex && len2(ex.x - a.x, ex.z - a.z) < 12) lookAt = this.at(ex.x, ex.y + 2, ex.z);
      this.dressAs(this.idle);
    } else if (u < UP + CUT) {
      // Up, to the stump, three cuts.
      const [tx, tz] = this.stump;
      a.goTo(tx + 0.45, tz + 0.1, WALK);
      a.face(Math.atan2(tx - a.x, tz - a.z));
      this.dressAs(this.cutting);
      const c = u - UP;
      const cut = c > 0 ? Math.floor(c / 0.8) : -1;
      pose = c > 0 && c % 0.8 < 0.45 ? POSE.point : POSE.stand;
      if (cut >= 0 && cut < 3 && c % 0.8 >= 0.45 && this.chopped <= cut) {
        this.chopped = cut + 1;
        if (f.dt > 0) f.calls.push({ kind: 'chop', x: tx, y: a.y + 0.6, z: tz, gain: 0.8 });
      }
      lookAt = this.at(tx, a.y + 0.5, tz);
    } else if (this.forExplorer && browsing) {
      // (the coconut cut, waiting at the counter while the explorer chooses)
      this.dressAs(this.idle);
      a.goTo(fx, fz, WALK);
      a.stop(Math.atan2(this.customer.x - a.x, this.customer.z - a.z));
      pose = POSE.stand;
      if (ex) lookAt = this.at(ex.x, ex.y + 1.8, ex.z);
    } else if (!this.forExplorer && u < UP + CUT + HAND) {
      this.dressAs(this.giving);
      a.stop(Math.atan2(this.customer.x - a.x, this.customer.z - a.z));
      pose = POSE.give;
      lookAt = this.at(this.customer.x, this.customer.y + 1.8, this.customer.z);
    } else {
      this.dressAs(this.idle);
      this.serveAt = -1;
      this.again = now + 25;
    }
    a.pose(pose, now);
    a.lookAt(lookAt, now + 0.5);
    a.step(dt, now);
  }

  private at(x: number, y: number, z: number): Point {
    this.look.x = x;
    this.look.y = y;
    this.look.z = z;
    return this.look;
  }

  private dressAs(l: Look): void {
    if (this.a.look === l) return;
    this.a.look = l;
    this.a.crowd.dress(this.a.i, l);
  }

  hide(): void {
    if (this.a.shown) this.a.hide();
    this.serveAt = -1;
  }
}

// ── At home ──────────────────────────────────────────────────────────────────

export class HomeFolk {
  readonly actors: Actor[] = [];
  private readonly grandpa: Actor;
  private readonly sweeper: Actor;
  private readonly weaver: Actor;
  private readonly wife: Actor;
  private readonly sweeperGive: Look;
  private readonly sweeperBroom: Look;
  private readonly weaverLook: Look;
  private readonly weaverGive: Look;
  private readonly hammock: Rig;
  private readonly swing: number;
  private readonly tie: { x: number; y: number; z: number; yaw: number; half: number; sag: number };
  private readonly shuttle: number;
  private readonly sweepWay: Way;
  private readonly wp: WayPoint = { x: 0, z: 0, yaw: 0 };
  private readonly look: Point = { x: 0, y: 0, z: 0 };
  private sweepS = 0;
  private beatAt = 0;
  private crackleAt = 0;
  /** Seats on the verandas (home, left / right of the door: map x, z), the cook's spot at the old house's stove, the loom's seat and its frame. */
  private readonly seats: P2[][];
  private readonly cook: { x: number; z: number; sx: number; sz: number; yaw: number };
  private readonly loom: { x: number; z: number; G: number; c: number; s: number; ox: number; oz: number; x0: number; x1: number; lz: number; y: number };

  constructor(
    private readonly env: PeopleEnv,
    private readonly spots: BackSpots,
    private readonly ground: Ground,
    add: (a: Actor) => Actor,
  ) {
    this.grandpa = add(new Actor(env.crowd, dress('villager', 2501, { sex: 'm', age: 'old', hat: 'none' }), ground));
    this.sweeperBroom = dress('villager', 2503, { sex: 'f', hat: 'krama', carry: CARRY.broom });
    this.sweeperGive = dress('villager', 2503, { sex: 'f', hat: 'krama', props: [FEAT.parcel] });
    this.sweeper = add(new Actor(env.crowd, this.sweeperBroom, ground));
    this.weaverLook = dress('villager', 2507, { sex: 'f', hat: 'none' });
    this.weaverGive = dress('villager', 2507, { sex: 'f', hat: 'none', props: [FEAT.parcel] });
    this.weaver = add(new Actor(env.crowd, this.weaverLook, ground));
    this.wife = add(new Actor(env.crowd, dress('villager', 2509, { sex: 'f', hat: 'none' }), ground));
    this.actors.push(this.grandpa, this.sweeper, this.weaver, this.wife);
    // The hammock under the old house, between two posts.
    const h = HOMES[0];
    const t = hammockTies(h);
    const [ax, az] = homeToWorld(h, t.a[0], t.a[1]);
    const [bx, bz] = homeToWorld(h, t.b[0], t.b[1]);
    const half = len2(bx - ax, bz - az) / 2;
    const g = ground.field.heightAt((ax + bx) / 2, (az + bz) / 2);
    this.tie = { x: (ax + bx) / 2, y: g + t.up, z: (az + bz) / 2, yaw: Math.atan2(-(bz - az), bx - ax), half, sag: GRANDPA_HAMMOCK.sag };
    const hd = hammockDef(half - GRANDPA_HAMMOCK.inset, this.tie.sag, GRANDPA_HAMMOCK.cloth, GRANDPA_HAMMOCK.stripe);
    this.hammock = new Rig(env.things, hd.def);
    this.swing = hd.swing;
    // The weaver's shuttle.
    this.shuttle = env.things.alloc(1);
    env.things.paint(this.shuttle, 0xb88a4a);
    // Veranda seats, the stove, the loom (map points, worked out once).
    this.seats = HOMES.map((home) => {
      const { zw, zf } = homeFront(home);
      return [-1, 1].map((side) => homeToWorld(home, side * home.w * 0.26, (zw + zf) / 2 + 0.2));
    });
    {
      const [fx, fz] = h.fire ?? [0, 4];
      const [x, z] = homeToWorld(h, fx + 0.75, fz + 0.2);
      const [sx, sz] = homeToWorld(h, fx, fz);
      this.cook = { x, z, sx, sz, yaw: Math.atan2(sx - x, sz - z) };
    }
    {
      const w = HOMES[2];
      const L = loomSpot(w);
      const [x, z] = homeToWorld(w, L.seat[0], L.seat[1]);
      this.loom = { x, z, G: ground.field.heightAt(w.x, w.z), c: Math.cos(w.facing), s: Math.sin(w.facing), ox: w.x, oz: w.z, x0: L.x0, x1: L.x1, lz: L.z, y: L.y };
    }
    // The sweeper's round of the yard.
    const y0 = 145.5;
    this.sweepWay = new Way([
      [y0 - 6, -348],
      [y0 - 2, -350],
      [y0 + 3, -349.5],
      [y0 + 7, -346.5],
      [y0 + 6, -341],
      [y0 + 2, -338.5],
      [y0 - 3, -339.5],
      [y0 - 6.5, -343],
      [y0 - 6, -348],
    ]);
  }

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null, monk: ForestMonk): void {
    this.grandpaStep(dt, now, f, ex);
    this.sweeperStep(dt, now, f, ex, monk);
    this.weaverStep(dt, now, f, ex, monk);
    this.wifeStep(dt, now, f, ex);
  }

  /** On a home's veranda, sitting (side: −1 left, +1 right of its door), looking out; the explorer when near. */
  private veranda(a: Actor, home: number, side: number, dt: number, now: number, ex: Obstacle | null, talk = false): void {
    const h = HOMES[home];
    const [x, z] = this.seats[home][side < 0 ? 0 : 1];
    const y = this.spots.floors[home];
    if (!a.shown || a.dist(x, z) > 0.6 || Math.abs(a.y - y) > 0.5) {
      a.warp(x, y, z, h.facing);
      a.show();
    }
    a.stop(h.facing);
    a.pose(talk && Math.sin(now * 0.37 + home) > 0.3 ? POSE.talk : POSE.sit, now);
    this.lookEx(a, ex, now, 9);
    a.step(dt, now);
  }

  private lookEx(a: Actor, ex: Obstacle | null, now: number, near: number): boolean {
    if (!ex || a.dist(ex.x, ex.z) > near) {
      a.lookAt(null);
      return false;
    }
    this.look.x = ex.x;
    this.look.y = ex.y + 2;
    this.look.z = ex.z;
    a.lookAt(this.look, now + 0.5);
    return true;
  }

  // ── The grandfather ───────────────────────────────────────────────────────

  private grandpaStep(dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    const a = this.grandpa;
    const t = this.tie;
    // (the explorer lying in it, or only just up from it: no nap meanwhile; while he is in it his own is drawn: roam/_hammock.ts)
    const napping = within(f.clock, 0.9, 0.22) && f.night < 0.6 && !hammockTaken(t.x, t.z);
    const swing = napping ? 0.13 * Math.sin(now * 1.4) : 0;
    if (hammockHidden(t.x, t.z)) this.hammock.hide();
    else {
      this.hammock.place(t.x, t.y, t.z, t.yaw).turn(this.swing, swing);
      this.hammock.write();
    }
    if (napping) {
      // (the hammock's low point, swung out: the seat of the sag)
      const s = Math.sin(swing);
      const c = Math.cos(swing);
      const ox = Math.sin(t.yaw) * t.sag * s;
      const oz = Math.cos(t.yaw) * t.sag * s;
      a.ride(t.x - ox, t.y - t.sag * c + 0.03, t.z - oz, t.yaw + Math.PI / 2);
      a.show();
      a.pose(POSE.hammock, now);
      // (awake enough to look at a visitor close by)
      this.lookEx(a, ex, now, 5);
      a.step(dt, now);
    } else if (within(f.clock, 0.22, 0.34)) this.veranda(a, 0, 1, dt, now, ex);
    else if (a.shown) a.hide();
  }

  // ── The old house's woman: sweeping, alms, cooking ───────────────────────

  private sweeperStep(dt: number, now: number, f: MapFrame, ex: Obstacle | null, monk: ForestMonk): void {
    const a = this.sweeper;
    const alms = monk.alms;
    if (alms.on || alms.coming) return this.giveAlms(a, 0, this.sweeperGive, dt, now, monk);
    // (nobody sweeps in the rain: she stays in)
    const ev = eventsNow(f);
    const sweeping = (within(f.clock, 0.78, 0.92) || within(f.clock, 0.08, 0.16)) && ev.shelter < 0.5 && ev.umbrellas < 0.5;
    const cooking = within(f.clock, 0.18, 0.3);
    if (sweeping) {
      this.dress(a, this.sweeperBroom);
      this.sweepS = (this.sweepS + 0.28 * dt) % this.sweepWay.len;
      this.sweepWay.at(this.sweepS, this.wp);
      if (!a.shown) {
        a.warp(this.wp.x, this.ground.field.heightAt(this.wp.x, this.wp.z), this.wp.z, this.wp.yaw);
        a.show();
      }
      a.carry(1, now);
      a.goTo(this.wp.x, this.wp.z, 0.3);
      a.face(null);
      a.pose(POSE.sweep, now);
      a.lookAt(null);
      a.step(dt, now);
    } else if (cooking) {
      // Squatting at her stove by the house, the fire going.
      const { x, z, sx, sz } = this.cook;
      if (!a.shown || a.dist(x, z) > 2) {
        a.warp(x, this.ground.field.heightAt(x, z), z, 0);
        a.show();
      }
      this.dress(a, this.sweeperGive);
      a.carry(0, now);
      a.goTo(x, z, WALK);
      a.face(this.cook.yaw);
      a.pose(POSE.squat, now);
      if (!this.lookEx(a, ex, now, 6)) a.lookAt(null);
      a.step(dt, now);
      if (f.dt > 0 && now > this.crackleAt) {
        this.crackleAt = now + 4 + 5 * hash3(Math.floor(now), 1, 2, 171);
        if (len2(f.camera.position.x - sx, f.camera.position.z - sz) < 40) f.calls.push({ kind: 'crackle', x: sx, y: a.y + 0.4, z: sz, gain: 0.35 });
      }
    } else if (a.shown) a.hide();
  }

  // ── The weaver ────────────────────────────────────────────────────────────

  private weaverStep(dt: number, now: number, f: MapFrame, ex: Obstacle | null, monk: ForestMonk): void {
    const a = this.weaver;
    const th = this.env.things;
    const alms = monk.alms;
    if (alms.on || alms.coming) {
      th.hide(this.shuttle);
      return this.giveAlms(a, 1, this.weaverGive, dt, now, monk);
    }
    const h = HOMES[2];
    if (within(f.clock, 0.84, 0.2)) {
      this.dress(a, this.weaverLook);
      const L = this.loom;
      if (!a.shown || a.dist(L.x, L.z) > 1.5) {
        a.warp(L.x, L.G, L.z, h.facing);
        a.show();
      }
      a.goTo(L.x, L.z, WALK);
      a.face(h.facing);
      a.pose(a.dist(L.x, L.z) < 0.3 ? POSE.stool : POSE.stand, now);
      // (her eyes on the cloth, now and then up at a visitor)
      a.tilt(this.lookEx(a, ex, now, 4) ? 0 : 0.45);
      a.step(dt, now);
      // The shuttle across the warp and back, the beater knocking at each end.
      const P = 2.6;
      const c = (now % P) / P;
      const u = c < 0.4 ? c / 0.4 : c < 0.5 ? 1 : c < 0.9 ? 1 - (c - 0.5) / 0.4 : 0;
      const lx = L.x0 + (L.x1 - L.x0) * u;
      const wx = L.ox + lx * L.c + L.lz * L.s;
      const wz = L.oz - lx * L.s + L.lz * L.c;
      th.put(this.shuttle, wx, L.G + L.y + 0.02, wz, 0.26, 0.05, 0.07, h.facing + Math.PI / 2);
      if (f.dt > 0 && now > this.beatAt && c > 0.45 && c < 0.5) {
        this.beatAt = now + P * 0.45;
        if (len2(f.camera.position.x - wx, f.camera.position.z - wz) < 28) f.calls.push({ kind: 'knock', x: wx, y: L.G + 0.9, z: wz, gain: 0.22 });
      }
      return;
    }
    th.hide(this.shuttle);
    if (within(f.clock, 0.2, 0.32)) this.veranda(a, 2, -1, dt, now, ex);
    else if (a.shown) a.hide();
  }

  // ── The blue house's wife ─────────────────────────────────────────────────

  private wifeStep(dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    const a = this.wife;
    if (within(f.clock, 0.2, 0.34)) this.veranda(a, 1, -1, dt, now, ex, true);
    else if (a.shown) a.hide();
  }

  // ── The alms ──────────────────────────────────────────────────────────────

  /** To her place before the monk, kneel, give him rice wrapped in banana leaf, kneel for the blessing, bow. */
  private giveAlms(a: Actor, k: number, give: Look, dt: number, now: number, monk: ForestMonk): void {
    const [x, z] = ALMS.women[k];
    this.dress(a, give);
    a.carry(0, now);
    if (!a.shown) {
      const home = HOMES[k === 0 ? 0 : 2];
      const [fx, fz] = homeToWorld(home, home.stair, homeFront(home).footZ);
      a.warp(fx, this.ground.field.heightAt(fx, fz), fz, 0);
      a.show();
    }
    a.goTo(x, z, WALK);
    a.face(0);
    a.lookAt(null);
    const t = monk.alms.t;
    const there = a.dist(x, z) < 0.3;
    let pose: Pose = POSE.stand;
    if (monk.alms.on && there) {
      const mine = t >= 3 + k * 3 && t < 6 + k * 3;
      pose = mine ? POSE.give : t > 17 && t < 19 ? POSE.bow : POSE.kneel;
    }
    a.pose(pose, now);
    a.tilt(pose === POSE.kneel && t > 9 ? 0.4 : 0);
    a.step(dt, now);
  }

  private dress(a: Actor, l: Look): void {
    if (a.look === l) return;
    a.look = l;
    a.crowd.dress(a.i, l);
  }

  hide(): void {
    for (const a of this.actors) if (a.shown) a.hide();
    this.hammock.hide();
    this.env.things.hide(this.shuttle);
  }
}

