import { mulberry32 } from '../../voxel/random';
import { len2 } from '../fauna/_len';
import { BM, BM_STALLS, BUSY, bmS, bmT, bmX, bmZ, breakfastStool, frontXZ, inWin, stallFrame, stallOpen, stallXZ, type BmStall } from '../hamlet/_bhMarketPlan';
import { TRAILS } from '../layout';
import type { MapFrame } from '../types';
import type { WordKey } from '../ui/lang';
import { Actor } from './_actor';
import { dress } from './_kinds';
import { CARRY, FEAT, POSE, SLOT, type Look, type Pose } from './_personModel';
import type { Ground, Obstacle, Point } from './_routes';
import type { PeopleEnv } from './_scene';
import { raining, UMBRELLAS, withUmbrella } from './_sceneBackKit';

/**
 * The people of the little morning market behind Angkor Wat (the market:
 * hamlet/_bhMarket.ts; where everything stands: hamlet/_bhMarketPlan.ts),
 * part of the hamlet's life (`_sceneBack.ts`), following the day
 * (`f.clock`):
 *
 * - **sellers** (kind `vendor`, one a stall): each comes when her stall
 *   opens in the blue hour — down the lane from the hamlet or along the
 *   trail, her basket on her head, while the explorer is near (else she is
 *   simply there) — goes round to her place and squats behind her goods,
 *   sits on her stool or stands at her table; looks up at buyers and at the
 *   explorer, calls out now and then ("នំបញ្ចុក បបរក្ដៅៗ!", "ផ្លែឈើផ្អែមៗ!":
 *   a bubble when he is close, a `vendorCall`), talks the price, hands the
 *   goods over (`give`); the breakfast cook turns to her pots and stirs
 *   (`stir`), the num krok seller bends over her griddle (it `sizzle`s).
 *   When the stall closes toward noon she packs up and walks off with her
 *   basket; the num krok seller comes back from the golden hour into the
 *   evening;
 * - **buyers** (up to four in the busy morning, one at other times, one at
 *   dusk for num krok): come down the lane or along the trail, stop at one
 *   to three stalls, ask the price (`talk`: "ប៉ុន្មាន?"), pay (`give`,
 *   "អរគុណ!") and go home with a basket on the head;
 * - **breakfast**: an old man and a boy on the plastic stools at the low
 *   table eating (`eat`), from dawn to mid-morning.
 *
 * The monk's alms at the market (at dawn, on his way to the hamlet's): the
 * `alms` the riders publish (`_sceneBackFolk.ts` `Riders.market`): the
 * breakfast cook and the fruit seller come out and kneel before him, give
 * (`give`), he blesses them (`nod`), they bow; buyers walking near stop and
 * wait, facing him, until he rides on (no new ones come meanwhile).
 *
 * Sounds (only while the ears are near): the murmur (`market`, soft: a
 * village market), the sellers' calls, the griddle's `sizzle`. Nature book:
 * the sellers are `vendor`s. The explorer buys at the stalls' shops
 * (hamlet/_bhMarket.ts `registerBackShops`); the seller nearest hands it
 * over (people/_saleBack.ts, the roaming side's).
 *
 * URL: `bhopen=all|none` (as the build: every stall open or shut, whatever
 * the clock; the sellers follow it).
 */

/** Walking paces (m/s): buyers, sellers. */
const WALK = 0.8;
const SELLER_WALK = 0.85;
/** The camera within this (m): sellers and eaters walk in and out (else they are simply there or gone). */
const SEEN = 70;
/** The ears within this (m): the murmur; the calls and the griddle within `CALLS`; a bubble with the explorer within `SAY`. */
const HEAR = 90;
const CALLS = 40;
const SAY = 10;

/** What a seller calls out (her own, else anyone's). */
const CALL: Record<string, WordKey> = { breakfast: 'bhBreakfast', produce: 'mkSugar', fruit: 'mkFruit', veg: 'mkGreens', fish: 'mkFreshFish', krok: 'bhKrok' };
const ANY_CALL: WordKey[] = ['mkCheap', 'mkWhatBuy', 'mkLook'];
/** A basket's load going home (sRGB): greens and fish, fruit, sweets. */
const LOADS: [number, number][] = [
  [0x4f9a3a, 0xb8c0c4],
  [0xf0b030, 0x6aa03a],
  [0x5aa040, 0xe8d040],
  [0x4a8a34, 0xf4f0e6],
];

type P = { x: number; z: number };
/** The monk's stop at the market (`_sceneBackFolk.ts` `Riders.market`): on, the seconds into it (negative: coming), where he stands, the way he faces. */
type Alms = { readonly on: boolean; readonly t: number; readonly x: number; readonly z: number; readonly yaw: number };

interface Seller {
  s: BmStall;
  a: Actor;
  base: Look;
  laden: Look;
  /** The breakfast cook with her ladle (the long paddle) at the pots, and where they are. */
  stir: Look | null;
  pot: P | null;
  seat: { x: number; y: number; z: number; yaw: number };
  pose: Pose;
  /** Her way in from the hamlet or the trail (map points: the last is her seat). */
  way: P[];
  mode: 'away' | 'in' | 'sell' | 'out';
  path: P[];
  leg: number;
  serving: Buyer | null;
  /** Working (stirring, bent over the griddle) until; the next work. */
  work: number;
  nextWork: number;
  /** Kneeling for the monk's alms: her spot before him. */
  alms: { x: number; z: number } | null;
}

interface Buyer {
  a: Actor;
  base: Look;
  laden: Look;
  /** Walking in the rain: the umbrella up (going home with a basket on the head: none). */
  wet: Look;
  wetLaden: Look | null;
  k: number;
  mode: 'off' | 'walk' | 'talk' | 'pay' | 'leave';
  /** The stalls to visit (ids), which one now; the way home. */
  plan: string[];
  at: number;
  exit: P[];
  path: P[];
  leg: number;
  t: number;
  seller: Seller | null;
  /** Facing the stall there. */
  face: number;
  /** Hidden until (s: the next outing). */
  next: number;
  said: boolean;
}

interface Eater {
  a: Actor;
  look: Look;
  /** Walking in and out: the bowl left at the stall (in the rain: an umbrella up). */
  walking: Look;
  wet: Look;
  stool: { x: number; y: number; z: number; yaw: number };
  mode: 'away' | 'in' | 'eat' | 'out';
  path: P[];
  leg: number;
}

export class MarketFolk {
  readonly actors: Actor[] = [];
  private readonly sellers: Seller[] = [];
  private readonly buyers: Buyer[] = [];
  private readonly eaters: Eater[] = [];
  private readonly rnd = mulberry32(0xbacc);
  private readonly look: Point = { x: 0, y: 0, z: 0 };
  private readonly ways: { lane: P[]; west: P[]; east: P[] };
  private readonly force: string | null;
  private readonly next = { murmur: 0, call: 0, sizzle: 0 };
  /** Umbrellas up (rain). */
  private rain = false;
  private y0: number;

  constructor(
    private readonly env: PeopleEnv,
    private readonly ground: Ground,
    add: (a: Actor) => Actor,
  ) {
    const field = ground.field;
    this.force = env.params.get('bhopen');
    this.y0 = field.heightAt(BM.x, BM.z);
    // The ways in: down the lane from the hamlet's yard, along the trail from the west (the monk's hut) and the east.
    const lane = TRAILS.find((t) => t.name === 'hamlet lane')?.points ?? [
      [128, -306],
      [136, -322],
      [146, -336],
    ];
    const at = (s: number, t: number): P => ({ x: bmX(s, t), z: bmZ(s, t) });
    this.ways = {
      lane: [{ x: lane[2][0] - 2, z: lane[2][1] + 2 }, { x: lane[1][0], z: lane[1][1] }, { x: (lane[0][0] + lane[1][0]) / 2, z: (lane[0][1] + lane[1][1]) / 2 }, at(0, 0.6)],
      west: [at(-30, 0), at(-12, 0.2)],
      east: [at(30, 0), at(12, -0.2)],
    };
    // Sellers: one a stall.
    for (const s of BM_STALLS) {
      const base = dress('vendor', s.who.seed, { sex: s.who.sex, hat: s.who.hat, goods: s.who.goods });
      const load = LOADS[s.who.seed % LOADS.length];
      const a = add(new Actor(env.crowd, base, ground));
      const f = stallFrame(s);
      const [sx, sz] = stallXZ(s, s.seat.x, s.seat.z);
      const seat = { x: sx, y: field.heightAt(f.x, f.z) + (s.seat.y ?? 0), z: sz, yaw: f.yaw };
      // (in: along her way to the trail by her stall, round its side nearest the junction, to her seat)
      const way = s.id === 'fruit' ? this.ways.west : s.id === 'fish' ? this.ways.east : this.ways.lane;
      const sides = [1, -1].map((k) => ({ k, p: stallXZ(s, k * (s.w / 2 + 0.5), s.seat.z) }));
      sides.sort((p, q) => Math.abs(bmS(p.p[0], p.p[1])) - Math.abs(bmS(q.p[0], q.p[1])));
      const { k: sideK, p: side } = sides[0];
      const sideFront = stallXZ(s, sideK * (s.w / 2 + 0.5), s.d / 2 + 0.6);
      const inWay: P[] = [...way, at(s.s, Math.sign(s.t) * 0.9), { x: sideFront[0], z: sideFront[1] }, { x: side[0], z: side[1] }, { x: sx, z: sz }];
      const stir = s.kind === 'breakfast' ? { ...base, feats: [...base.feats, FEAT.paddle] } : null;
      const [px, pz] = stallXZ(s, -1.25, -0.1);
      this.sellers.push({
        s,
        a,
        base,
        laden: basket(base, load[0], load[1]),
        stir,
        pot: stir ? { x: px, z: pz } : null,
        seat,
        pose: s.seat.pose === 'squat' ? POSE.squat : s.seat.pose === 'stool' ? POSE.stool : s.seat.pose === 'sit' ? POSE.sit : POSE.stand,
        way: inWay,
        mode: 'away',
        path: [],
        leg: 0,
        serving: null,
        work: 0,
        nextWork: 0,
        alms: null,
      });
      this.actors.push(a);
    }
    // Buyers: women and men of the hamlet and passers-by on the trail.
    const who: { sex: 'f' | 'm'; hat: 'palm' | 'krama' | 'none'; age?: 'old' }[] = [
      { sex: 'f', hat: 'krama' },
      { sex: 'f', hat: 'palm' },
      { sex: 'm', hat: 'none' },
      { sex: 'f', hat: 'none', age: 'old' },
    ];
    who.forEach((w, k) => {
      const base = dress('villager', 2801 + k * 3, { sex: w.sex, hat: w.hat, age: w.age });
      const load = LOADS[k % LOADS.length];
      const a = add(new Actor(env.crowd, base, ground));
      const laden = w.sex === 'm' ? bag(base) : basket(base, load[0], load[1]);
      const cover = UMBRELLAS[k % UMBRELLAS.length];
      this.buyers.push({ a, base, laden, wet: withUmbrella(base, cover), wetLaden: laden.carry === CARRY.none ? withUmbrella(laden, cover) : null, k, mode: 'off', plan: [], at: 0, exit: [], path: [], leg: 0, t: 0, seller: null, face: 0, next: k * 4, said: false });
      this.actors.push(a);
    });
    // Breakfast: an old man and a boy on the stools.
    [dress('villager', 2831, { sex: 'm', age: 'old', hat: 'krama' }), dress('kid', 2833, { sex: 'm' })].forEach((base, k) => {
      const look = { ...base, feats: [...base.feats, FEAT.smallBowl] };
      const st = breakfastStool(k);
      const a = add(new Actor(env.crowd, base, ground));
      this.eaters.push({ a, look, walking: base, wet: withUmbrella(base, UMBRELLAS[(k + 1) % UMBRELLAS.length]), stool: { x: st.x, y: field.heightAt(st.x, st.z), z: st.z, yaw: st.yaw }, mode: 'away', path: [], leg: 0 });
      this.actors.push(a);
    });
  }

  /** Is a stall open now (the clock, or `bhopen`)? */
  private open(s: BmStall, clock: number): boolean {
    return this.force === 'all' ? true : this.force === 'none' ? false : stallOpen(s, clock);
  }

  /** The market's alms (the monk stops on his way home): on, his spot and heading, how far into it (s). */
  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null, first: boolean, alms: Alms): void {
    const cam = f.camera.position;
    const seen = len2(cam.x - BM.x, cam.z - BM.z) < SEEN;
    this.rain = raining(f, this.rain);
    for (const sl of this.sellers) this.seller(sl, dt, now, f, ex, seen, first, alms);
    this.shop(dt, now, f, ex, first, alms);
    for (const e of this.eaters) this.eater(e, dt, now, f, seen, first);
    if (f.dt > 0) {
      const l = f.listener;
      const ears = len2(l.x - BM.x, l.z - BM.z);
      if (ears < HEAR) this.sounds(now, f, ex, ears);
    }
  }

  // ── Sellers ──────────────────────────────────────────────────────────────

  private seller(sl: Seller, dt: number, now: number, f: MapFrame, ex: Obstacle | null, seen: boolean, first: boolean, alms: Alms): void {
    const a = sl.a;
    const open = this.open(sl.s, f.clock);
    if (first && open) this.sit(sl, now);
    switch (sl.mode) {
      case 'away':
        if (!open) return;
        if (!seen) return this.sit(sl, now);
        // She comes with her basket on her head.
        sl.path = sl.way;
        sl.leg = 1;
        this.wear(a, sl.laden);
        a.warp(sl.path[0].x, this.ground.field.heightAt(sl.path[0].x, sl.path[0].z), sl.path[0].z, 0);
        a.show();
        a.carry(1, now);
        sl.mode = 'in';
        return;
      case 'in':
        if (!open) return this.gone(sl);
        if (this.walk(sl, SELLER_WALK, dt, now)) this.sit(sl, now);
        return;
      case 'out':
        if (this.walk(sl, SELLER_WALK, dt, now)) this.gone(sl);
        return;
      case 'sell':
        break;
    }
    if (!open) {
      if (sl.serving) this.letGo(sl.serving, now);
      if (!seen) return this.gone(sl);
      // Packed up: she stands, takes up her basket and goes off the way she came.
      a.riding = false;
      this.wear(a, sl.laden);
      a.carry(1, now);
      a.pose(POSE.stand, now);
      sl.path = sl.way.slice().reverse();
      sl.leg = 1;
      sl.mode = 'out';
      return;
    }
    // The monk's alms: the breakfast cook and the fruit seller go out to him, kneel and give.
    // (not while she is serving the explorer at her stall: people/_saleBack.ts holds her)
    const giver = sl.s.id === 'breakfast' ? 0 : sl.s.id === 'fruit' ? 1 : -1;
    if (giver >= 0 && alms.on && (sl.alms || !a.held)) return this.almsGiver(sl, giver, alms, dt, now);
    if (sl.alms) {
      // (back to her place)
      a.riding = false;
      a.goTo(sl.seat.x, sl.seat.z, SELLER_WALK);
      a.face(sl.seat.yaw);
      a.pose(POSE.stand, now);
      a.lookAt(null);
      a.tilt(0);
      a.step(dt, now);
      if (a.dist(sl.seat.x, sl.seat.z) < 0.15) {
        sl.alms = null;
        this.sit(sl, now);
      }
      return;
    }
    const b = sl.serving;
    let pose = sl.pose;
    let yaw = sl.seat.yaw;
    if (b && (b.mode === 'talk' || b.mode === 'pay')) pose = b.mode === 'pay' ? POSE.give : Math.sin(now * 2.1 + sl.s.who.seed) > 0.25 ? POSE.talk : sl.pose;
    else if (now < sl.work && sl.pot) {
      // The breakfast cook turns to her pots and stirs.
      pose = POSE.stir;
      yaw = Math.atan2(sl.pot.x - a.x, sl.pot.z - a.z);
    } else if (now > sl.nextWork) {
      sl.work = now + 3 + this.rnd() * 3;
      sl.nextWork = now + 8 + this.rnd() * 8;
    }
    this.wear(a, pose === POSE.stir && sl.stir ? sl.stir : sl.base);
    // (on her seat: `ride` keeps her there; she turns to `yaw`, eased)
    a.stop(yaw);
    a.pose(pose, now);
    // Looking: at her buyer, the explorer close by, else down at her goods (the num krok seller at her griddle).
    const lookAt = b ? head(b.a, this.look) : ex && len2(ex.x - a.x, ex.z - a.z) < 6 ? this.pt(ex.x, ex.y + 2, ex.z) : null;
    a.lookAt(lookAt, now + 0.5);
    a.tilt(lookAt ? 0 : sl.s.kind === 'krok' ? (now < sl.work ? 0.6 : 0.35) : pose === POSE.stand ? 0.3 : 0.15);
    a.step(dt, now);
  }

  /** Kneel before the monk at the market (her spot `k` of two before him), give when it is her turn, bow at the blessing. */
  private almsGiver(sl: Seller, k: number, alms: Alms, dt: number, now: number): void {
    const a = sl.a;
    if (!sl.alms) {
      // (two spots a metre and a half before him, side by side)
      const fx = Math.sin(alms.yaw);
      const fz = Math.cos(alms.yaw);
      const off = k === 0 ? -0.65 : 0.65;
      sl.alms = { x: alms.x + fx * 1.35 + fz * off, z: alms.z + fz * 1.35 - fx * off };
      a.riding = false;
      this.wear(a, { ...sl.base, feats: [...sl.base.feats, FEAT.parcel] });
    }
    const { x, z } = sl.alms;
    // (there once within a step of her spot: kept apart from the other giver, she may not reach it to the centimetre)
    const there = a.dist(x, z) < 0.6;
    if (there) a.stop(alms.yaw + Math.PI);
    else {
      a.goTo(x, z, SELLER_WALK);
      a.face(alms.yaw + Math.PI);
    }
    const t = alms.t;
    const pose: Pose = !there ? POSE.stand : t >= 2 + k * 2.5 && t < 4.5 + k * 2.5 ? POSE.give : t > 11 && t < 13 ? POSE.bow : POSE.kneel;
    a.pose(pose, now);
    a.lookAt(null);
    a.tilt(pose === POSE.kneel && t > 7 ? 0.4 : 0);
    a.step(dt, now);
  }

  /** At her place, selling. */
  private sit(sl: Seller, now: number): void {
    const a = sl.a;
    this.wear(a, sl.base);
    a.ride(sl.seat.x, sl.seat.y, sl.seat.z, sl.seat.yaw);
    a.show();
    a.carry(0, now);
    a.pose(sl.pose, now);
    sl.mode = 'sell';
    sl.serving = null;
    sl.alms = null;
  }

  private gone(sl: Seller): void {
    sl.a.hide();
    sl.mode = 'away';
    sl.serving = null;
    sl.alms = null;
  }

  // ── Buyers ───────────────────────────────────────────────────────────────

  /** How many buyers are about at this time of day. */
  private wanted(clock: number): number {
    if (this.force === 'none') return 0;
    if (inWin(clock, BUSY) || this.force === 'all') return 4;
    if (inWin(clock, [0.9, 0.93]) || inWin(clock, [0.08, 0.27])) return 1;
    return 0;
  }

  private shop(dt: number, now: number, f: MapFrame, ex: Obstacle | null, first: boolean, alms: Alms): void {
    const want = this.wanted(f.clock);
    let out = 0;
    for (const b of this.buyers) if (b.mode !== 'off') out++;
    for (const b of this.buyers) {
      if (b.mode === 'off') {
        // (at first, the market is already busy: they are in the middle of it; nobody new while the monk is there)
        if (out >= want || (!first && now < b.next) || (alms.on && !first)) continue;
        if (this.start(b, now, first, want > 1)) out++;
        continue;
      }
      this.buyer(b, dt, now, f, ex, alms);
    }
  }

  /** Plan an outing: in by a way, one to three open stalls (one in the quiet hours), home by a way. Mid-way in a still. */
  private start(b: Buyer, now: number, mid: boolean, busy: boolean): boolean {
    const open = this.sellers.filter((s) => s.mode === 'sell');
    if (!open.length) return false;
    const n = busy ? 1 + Math.floor(this.rnd() * Math.min(3, open.length)) : 1;
    const pick = open.slice().sort(() => this.rnd() - 0.5).slice(0, n);
    b.plan = pick.map((s) => s.s.id);
    b.at = 0;
    const r = this.rnd();
    const from = r < 0.5 ? this.ways.lane : r < 0.75 ? this.ways.west : this.ways.east;
    const r2 = this.rnd();
    b.exit = (r2 < 0.55 ? this.ways.lane : r2 < 0.8 ? this.ways.west : this.ways.east).slice().reverse();
    this.wear(b.a, b.base);
    b.a.carry(0, now);
    b.said = false;
    const free = pick.find((s) => !s.serving);
    if (mid && free) {
      // (a still: already at a stall, asking)
      b.plan = [free.s.id, ...b.plan.filter((id) => id !== free.s.id)];
      const fr = frontXZ(free.s, (this.rnd() - 0.5) * 0.8);
      b.a.warp(fr.x, this.ground.field.heightAt(fr.x, fr.z), fr.z, fr.yaw);
      b.a.show();
      return this.arrive(b, free, now - this.rnd() * 2);
    }
    b.path = [...from, ...this.toStall(pick[0].s)];
    b.leg = 1;
    b.a.warp(b.path[0].x, this.ground.field.heightAt(b.path[0].x, b.path[0].z), b.path[0].z, 0);
    b.a.show();
    b.mode = 'walk';
    return true;
  }

  /** From the trail by a stall to its front (map points). */
  private toStall(s: BmStall, off = (this.rnd() - 0.5) * 0.8): P[] {
    const fr = frontXZ(s, off);
    return [{ x: bmX(bmS(fr.x, fr.z), Math.sign(s.t) * 0.9), z: bmZ(bmS(fr.x, fr.z), Math.sign(s.t) * 0.9) }, { x: fr.x, z: fr.z }];
  }

  private buyer(b: Buyer, dt: number, now: number, f: MapFrame, ex: Obstacle | null, alms: Alms): void {
    const a = b.a;
    // The monk at the market: those walking near stop and wait, facing him, until he rides on.
    if ((b.mode === 'walk' || b.mode === 'leave') && alms.on && alms.t > -2 && len2(a.x - alms.x, a.z - alms.z) < 5) {
      a.stop(Math.atan2(alms.x - a.x, alms.z - a.z));
      a.pose(POSE.stand, now);
      a.lookAt(null);
      a.tilt(0.25);
      a.step(dt, now);
      return;
    }
    switch (b.mode) {
      case 'walk': {
        this.umbrella(a, this.rain ? b.wet : b.base, now);
        if (!this.walk(b, WALK, dt, now)) return;
        // (at the stall: the umbrella down)
        this.umbrella(a, b.base, now);
        const s = this.sellers.find((x) => x.s.id === b.plan[b.at]);
        if (!s || s.mode !== 'sell' || !this.arrive(b, s, now)) this.onward(b, now);
        return;
      }
      case 'leave':
        this.umbrella(a, this.rain && b.wetLaden ? b.wetLaden : b.laden, now);
        if (this.walk(b, WALK, dt, now)) {
          a.hide();
          b.mode = 'off';
          b.next = now + 6 + this.rnd() * 18;
        }
        return;
      case 'talk':
      case 'pay': {
        const s = b.seller;
        // (she has gone out to the monk, or packed up: on to the next)
        if (!s || s.mode !== 'sell' || s.alms) return this.onward(b, now);
        const u = now - b.t;
        if (b.mode === 'talk' && u > 3.2) {
          b.mode = 'pay';
          b.t = now;
          this.say(b, ex, 'mkThanks', f);
        } else if (b.mode === 'pay' && u > 1.8) return this.onward(b, now);
        if (b.mode === 'talk' && u > 0.6) this.say(b, ex, 'mkHowMuch', f);
        a.stop(b.face);
        a.pose(b.mode === 'pay' ? POSE.give : Math.sin(now * 2.4 + b.k) > 0 ? POSE.talk : POSE.stand, now);
        a.lookAt(head(s.a, this.look), now + 0.5);
        a.tilt(0.1);
        a.step(dt, now);
        return;
      }
      default:
        return;
    }
  }

  /** At a stall: the seller serves (unless she is serving someone else: then on). */
  private arrive(b: Buyer, s: Seller, now: number): boolean {
    if (s.serving && s.serving !== b) return false;
    s.serving = b;
    b.seller = s;
    b.face = frontXZ(s.s).yaw;
    b.mode = 'talk';
    b.t = now;
    return true;
  }

  /** On to the next stall on her list, or home with her shopping. */
  private onward(b: Buyer, now: number): void {
    if (b.seller?.serving === b) b.seller.serving = null;
    b.seller = null;
    b.at++;
    const a = b.a;
    const here: P = { x: a.x, z: a.z };
    if (b.at < b.plan.length) {
      const s = this.sellers.find((x) => x.s.id === b.plan[b.at])!;
      b.path = [here, ...this.toStall(s.s)];
      b.leg = 1;
      b.mode = 'walk';
      return;
    }
    // Home: the basket on the head (the men a bag at the hip).
    this.wear(a, b.laden);
    a.carry(b.laden.carry === CARRY.head ? 1 : 0, now);
    const back = bmT(a.x, a.z);
    b.path = [here, { x: bmX(bmS(a.x, a.z), Math.sign(back) * 0.9), z: bmZ(bmS(a.x, a.z), Math.sign(back) * 0.9) }, ...b.exit];
    b.leg = 1;
    b.mode = 'leave';
  }

  private letGo(b: Buyer, now: number): void {
    if (b.mode === 'talk' || b.mode === 'pay') this.onward(b, now);
  }

  // ── Breakfast eaters ─────────────────────────────────────────────────────

  private eater(e: Eater, dt: number, now: number, f: MapFrame, seen: boolean, first: boolean): void {
    const a = e.a;
    const breakfast = this.sellers[0];
    const on = breakfast.mode === 'sell' && (this.force === 'all' || inWin(f.clock, [0.72, 0.87]));
    if (first && on) e.mode = 'away';
    switch (e.mode) {
      case 'away':
        if (!on) return;
        if (!seen || first) return this.seat(e, now);
        e.path = [...this.ways.lane, { x: e.stool.x, z: e.stool.z }];
        e.leg = 1;
        this.wear(a, e.walking);
        a.warp(e.path[0].x, this.ground.field.heightAt(e.path[0].x, e.path[0].z), e.path[0].z, 0);
        a.show();
        e.mode = 'in';
        return;
      case 'in':
        if (!on) {
          a.hide();
          e.mode = 'away';
          return;
        }
        this.umbrella(a, this.rain ? e.wet : e.walking, now);
        if (this.walk(e, WALK, dt, now)) this.seat(e, now);
        return;
      case 'out':
        this.umbrella(a, this.rain ? e.wet : e.walking, now);
        if (this.walk(e, WALK, dt, now)) {
          a.hide();
          e.mode = 'away';
        }
        return;
      case 'eat':
        break;
    }
    if (!on) {
      if (!seen) {
        a.hide();
        e.mode = 'away';
        return;
      }
      a.riding = false;
      this.wear(a, e.walking);
      e.path = [{ x: e.stool.x, z: e.stool.z }, ...this.ways.lane.slice().reverse()];
      e.leg = 1;
      e.mode = 'out';
      return;
    }
    // Eating: now and then looking up at the explorer or the passers-by.
    a.stop(e.stool.yaw);
    a.pose(POSE.eat, now);
    a.step(dt, now);
  }

  private seat(e: Eater, now: number): void {
    const a = e.a;
    this.wear(a, e.look);
    a.ride(e.stool.x, e.stool.y, e.stool.z, e.stool.yaw);
    a.show();
    a.pose(POSE.eat, now);
    e.mode = 'eat';
  }

  // ── Sounds ───────────────────────────────────────────────────────────────

  private sounds(now: number, f: MapFrame, ex: Obstacle | null, ears: number): void {
    const calls = f.calls;
    if (now > this.next.murmur) {
      this.next.murmur = now + 3.6;
      let n = 0;
      for (const a of this.actors) if (a.shown) n++;
      if (n >= 5) calls.push({ kind: 'market', x: BM.x, y: this.y0 + 1.5, z: BM.z, gain: Math.min(0.55, 0.15 + n / 30) });
    }
    if (ears > CALLS) return;
    const l = f.listener;
    if (now > this.next.call) {
      this.next.call = now + 6 + this.rnd() * 7;
      // The seller nearest the ears calls out (a bubble if the explorer stands close).
      let best: Seller | null = null;
      let bd = CALLS;
      for (const s of this.sellers) {
        if (s.mode !== 'sell' || s.serving || s.alms) continue;
        const d = len2(s.a.x - l.x, s.a.z - l.z) + this.rnd() * 6;
        if (d < bd) [best, bd] = [s, d];
      }
      if (best) {
        const a = best.a;
        calls.push({ kind: 'vendorCall', x: a.x, y: a.y + 1.6, z: a.z, gain: 0.6 });
        const key = this.rnd() < 0.65 ? CALL[best.s.id] : ANY_CALL[Math.floor(this.rnd() * ANY_CALL.length)];
        if (ex && f.roam !== 'overview' && len2(ex.x - a.x, ex.z - a.z) < SAY && !this.env.shot && !this.env.bubble.showing) this.env.bubble.say(key, () => head(a), 2.8);
      }
    }
    if (now > this.next.sizzle) {
      this.next.sizzle = now + 4.5 + this.rnd() * 3;
      const s = this.sellers.find((x) => x.s.id === 'krok');
      if (s && s.mode === 'sell' && len2(s.a.x - l.x, s.a.z - l.z) < 22) calls.push({ kind: 'sizzle', x: s.a.x, y: s.a.y + 0.6, z: s.a.z, gain: 0.3 });
    }
  }

  /** A buyer's word in the bubble (only with the explorer close, once an outing, and "thank you"). */
  private say(b: Buyer, ex: Obstacle | null, key: WordKey, f: MapFrame): void {
    if (b.said && key !== 'mkThanks') return;
    const a = b.a;
    if (!ex || f.roam === 'overview' || this.env.shot || this.env.bubble.showing || len2(ex.x - a.x, ex.z - a.z) > SAY * 0.8) return;
    b.said = true;
    this.env.bubble.say(key, () => head(a), 2.2);
  }

  // ── Plumbing ─────────────────────────────────────────────────────────────

  /** Walk someone along their path (`leg`: the point they walk to); true when they have reached its end. */
  private walk(w: { a: Actor; path: P[]; leg: number }, speed: number, dt: number, now: number): boolean {
    const a = w.a;
    const goal = w.path[w.leg];
    if (!goal) return true;
    a.riding = false;
    a.goTo(goal.x, goal.z, speed);
    a.face(null);
    a.pose(POSE.stand, now);
    a.lookAt(null);
    a.tilt(0);
    a.step(dt, now);
    if (a.dist(goal.x, goal.z) < (w.leg === w.path.length - 1 ? 0.2 : 0.6)) {
      w.leg++;
      if (w.leg >= w.path.length) return true;
    }
    return false;
  }

  private wear(a: Actor, look: Look): void {
    if (a.look === look) return;
    a.look = look;
    a.crowd.dress(a.i, look);
  }

  /** Dressed in `look`, its prop held the carry way (an umbrella up, a basket on the head) or not. */
  private umbrella(a: Actor, look: Look, now: number): void {
    if (a.look === look) return;
    this.wear(a, look);
    a.carry(look.carry === CARRY.none ? 0 : 1, now);
  }

  private pt(x: number, y: number, z: number): Point {
    this.look.x = x;
    this.look.y = y;
    this.look.z = z;
    return this.look;
  }

  hide(): void {
    for (const a of this.actors) if (a.shown) a.hide();
    for (const s of this.sellers) {
      s.mode = 'away';
      s.serving = null;
      s.alms = null;
    }
    for (const b of this.buyers) {
      b.mode = 'off';
      b.seller = null;
    }
    for (const e of this.eaters) e.mode = 'away';
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Over someone's head (a bubble; with `out`, a look: no new object). */
function head(a: Actor, out: Point = { x: 0, y: 0, z: 0 }): Point {
  out.x = a.x;
  out.y = a.y + 2.9 * (a.crowd.scale(a.i) / 1.4);
  out.z = a.z;
  return out;
}

/** A look with a round basket on the head (`CARRY.head`), its load in the goods' colours. */
function basket(base: Look, load: number, load2: number): Look {
  const colors = base.colors.slice();
  colors[SLOT.prop] = load;
  colors[SLOT.prop2] = load2;
  colors[SLOT.wood] = 0xc8a868;
  return { ...base, colors, feats: [...base.feats.filter((f) => f !== FEAT.parcel), FEAT.headBasket], carry: CARRY.head };
}

/** A look with the shopping in a bag at the hip. */
function bag(base: Look): Look {
  const colors = base.colors.slice();
  colors[SLOT.bag] = 0x3a6aa8;
  return { ...base, colors, feats: [...base.feats, FEAT.bag] };
}
