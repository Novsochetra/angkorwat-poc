import { mulberry32 } from '../../voxel/random';
import { eventsNow } from '../events';
import { aisleRoute, inWindow, MK, NODES, STALL_NODE, STALLS, frontOf, stallPoint, STOOL_AT, TABLES, type Goods, type Stall } from '../hamlet/_mkPlan';
import type { MapFrame, Subject } from '../types';
import type { WordKey } from '../ui/lang';
import { Actor } from './_actor';
import { Bicycle, BIKE_WHEEL } from './_bicycle';
import { dress } from './_kinds';
import { CARRY, FEAT, FIT, POSE, SLOT, type Feature, type Look, type Pose } from './_personModel';
import { len, type Obstacle, type Point, type Traffic } from './_routes';
import { Pace, viewDist, type PeopleEnv, type PeopleScene } from './_scene';
import { Rig, RigDef } from './_things';

/**
 * The morning market's people (the market itself: hamlet/_market.ts; where
 * everything stands: hamlet/_mkPlan.ts), following the day (`f.clock`):
 *
 * - **sellers** (kind `vendor`, one a stall): each comes when her stall
 *   opens (walking in with her basket on her head while the explorer is
 *   near, else she is simply there), squats behind her goods, sits on her
 *   stool or her platform, or stands at her table; looks up at buyers and at
 *   the explorer, calls out now and then ("ត្រីស្រស់ៗ!", "ថោកៗ!",
 *   "ទិញអីដែរបង?": a bubble when he is close, a `vendorCall`), bargains,
 *   weighs and hands the goods over (`give`); the noodle cook stirs her pot,
 *   the grill man turns his skewers, the butcher chops. When the stall
 *   closes she packs up and walks off with her basket;
 * - **buyers** walking the aisles (busiest in the morning, a few in the
 *   afternoon, one or two at dusk): stop at a stall, look over the goods,
 *   ask the price and bargain (`talk`: "ប៉ុន្មាន?"), pay (`give`) and walk
 *   on with a basket on the head (`CARRY.head`) or a bag (lotus buds and
 *   incense for the pagoda in the hand: `FEAT.offering`), to another stall,
 *   home, or to the noodle stall's stools to eat (`eat`); at night they
 *   come only to eat under the bare bulb; in the rain they walk between the
 *   stalls under umbrellas;
 * - at dawn a **monk** on his alms round: the sellers he stops at hand rice
 *   and fruit into his bowl (`give`) and kneel while he blesses them (`nod`:
 *   monks do not sampeah lay people);
 * - a little **girl** squatting by her mother's basket stall in the morning
 *   (she waves when the explorer comes close);
 * - a **child on a bicycle** riding through, ringing the bell at people in
 *   the way (`bikeBell`); a **moto** passing along the road now and then
 *   (people step round it, it waits for the explorer; `moto`).
 *
 * Sound (`f.calls`, only while the ears are near): the crowd's murmur
 * (`market`, louder the more people there are), sellers' calls, the noodle
 * cook's and the butcher's knives (`chop`), the grill (`sizzle`).
 * Nature book: the sellers are `vendor`s (by kind); while the market is
 * busy its buyers are the `market` crowd.
 *
 * Shots: `mkmonk=0|1|2` puts the monk at that alms stop, `mkmoto=<m>` the
 * moto that far along its pass (from the north), `mkbike=<m>` the child's
 * bicycle; `mkopen=all|none` (as the build) opens or shuts every stall.
 */

/**
 * Pace: every frame within `NEAR` m of the camera, every third or sixth frame
 * farther (the seated sellers then only come and go: no head turns), none
 * beyond `HIDE` (from a glider that high they are a pixel or two).
 */
const NEAR = 60;
const HIDE = 260;
/** Walking paces (m/s): buyers, sellers, the monk; the child's bicycle and the moto in the market. */
const WALK = 0.78;
const SELLER_WALK = 0.9;
const MONK_WALK = 0.72;
const BIKE_SPEED = 2.1;
const MOTO_SPEED = 3.2;
/** The ears within this (m): the murmur; the calls, knives and grill within `CALLS`; a seller's bubble within `SAY` of the explorer. */
const HEAR = 120;
const CALLS = 50;
const SAY = 11;
/** Sellers walk in and out (instead of simply being there, or not) when the ears are this near (m). */
const SEEN = 85;

/** A point on the map from the square's local metres. */
const at = (lx: number, lz: number): Point => ({ x: MK.x + lx, y: 0, z: MK.z + lz });
const NODE: Record<string, Point> = Object.fromEntries(Object.entries(NODES).map(([k, [x, z]]) => [k, at(x, z)]));

/** How the goods on a stall look carried away (a basket's load: `prop`, `prop2`) and the vendor's goods for her dress. */
const LOAD: Record<Goods, [number, number]> = {
  flowers: [0xf08ab0, 0x4a7a3a],
  fruit: [0xf0b030, 0x6aa03a],
  cloth: [0xb8322c, 0xf0ece0],
  greens: [0x4f9a3a, 0x8ac050],
  baskets: [0xc8a868, 0x8a6a40],
  noodles: [0xf2eee4, 0x4a8a34],
  grill: [0x8a4a2a, 0xc8b27a],
  drinks: [0x6a8a3a, 0xf0ece0],
  fish: [0xb8c0c4, 0x6a7880],
  dried: [0xb88a4a, 0x5a3a24],
  sugar: [0xb87a3a, 0xc8b070],
  meat: [0xd88a80, 0xf0dcd0],
  veg: [0x5a2e5e, 0xd88a2a],
  fishG: [0xb8c0c4, 0x6a7880],
  fruitG: [0xf0b030, 0xe8d040],
  cakes: [0x4a8a34, 0xf08aa8],
  greensG: [0x4f9a3a, 0xb86a9a],
};
const VENDOR_GOODS: Partial<Record<Goods, 'fruit' | 'greens' | 'fish' | 'sweets'>> = {
  fruit: 'fruit',
  fruitG: 'fruit',
  greens: 'greens',
  greensG: 'greens',
  veg: 'greens',
  fish: 'fish',
  fishG: 'fish',
  dried: 'fish',
  sugar: 'sweets',
  cakes: 'sweets',
};
/** What a seller calls out (the first is her own, the rest anyone's). */
const CALL: Partial<Record<Goods, WordKey>> = {
  fish: 'mkFreshFish',
  fishG: 'mkFreshFish',
  greens: 'mkGreens',
  greensG: 'mkGreens',
  veg: 'mkGreens',
  fruit: 'mkFruit',
  fruitG: 'mkFruit',
  noodles: 'mkNoodles',
  sugar: 'mkSugar',
  cakes: 'mkCakes',
  drinks: 'mkCane',
  grill: 'mkGrill',
  cloth: 'mkKrama',
  flowers: 'mkFlowers',
};
const ANY_CALL: WordKey[] = ['mkCheap', 'mkWhatBuy', 'mkLook'];
/** The selling poses. */
const SEATED: Record<Stall['seat']['pose'], Pose> = { squat: POSE.squat, stool: POSE.stool, stand: POSE.stand, sit: POSE.sit };

interface Seller {
  a: Actor;
  s: Stall;
  /** Where she sells (on her seat: y its top) and where a buyer stands. */
  seat: Point & { yaw: number };
  front: Point & { yaw: number };
  pose: Pose;
  exit: string;
  mode: 'away' | 'in' | 'sell' | 'out';
  path: Point[];
  leg: number;
  serving: Buyer | null;
  /** A spell of work (stirring, turning skewers) until this time, and when the next one starts. */
  work: number;
  nextWork: number;
  /** The monk at her stall: giving until `alms`, kneeling for his blessing until `bless`. */
  alms: number;
  bless: number;
  base: Look;
  laden: Look;
  /** The noodle cook's place at her big pot (she steps over to stir it, and back to her cart), and where she is. */
  pot: (Point & { yaw: number }) | null;
  at: 'seat' | 'pot' | 'going';
}

interface Buyer {
  a: Actor;
  k: number;
  mode: 'off' | 'walk' | 'look' | 'talk' | 'pay' | 'eat';
  path: Point[];
  leg: number;
  /** Stalls still to visit ('eat': the noodle stall's stools); where they are in the aisles. */
  plan: string[];
  node: string;
  target: string;
  seller: Seller | null;
  until: number;
  stool: number;
  base: Look;
  eating: Look;
  said: boolean;
  /** The look under the umbrella in the rain (made from `dry`, the look it covers, when first needed). */
  dry: Look;
  wet: Look | null;
}

/** A moto (a step-through, a Honda Dream) in the rider's model metres, like the bicycle (`_bicycle.ts`): the rider in `POSE.ride` fits it. */
function motoDef(color: number, load: number): { def: RigDef; front: number; back: number } {
  const d = new RigDef();
  const R = 0.22;
  const back = d.part([0, R, -0.46]);
  const front = d.part([0, R, 0.56]);
  for (const [p, z] of [
    [back, -0.46],
    [front, 0.56],
  ] as const) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      d.box([0, R + Math.sin(a) * (R - 0.03), z + Math.cos(a) * (R - 0.03)], [0.08, 0.06, 0.19], 0x1a1818, { part: p, rot: [-a + Math.PI / 2, 0, 0] });
    }
    d.box([0, R, z], [0.1, 0.12, 0.12], 0xa8a8a8, { part: p });
  }
  const [bx, by, bz] = FIT.bike.bars;
  d.box([0, 0.42, -0.26], [0.26, 0.26, 0.6], color)
    .box([0, FIT.bike.saddle - 0.035, -0.2], [0.22, 0.07, 0.6], 0x2a2420)
    .box([0, 0.2, 0.12], [0.22, 0.05, 0.36], 0x3a3a3a)
    .box([0, 0.2, -0.1], [0.2, 0.15, 0.28], 0x2a2a2a)
    .box([0, 0.46, 0.34], [0.3, 0.5, 0.08], color)
    .box([0, 0.62, 0.4], [0.06, 0.5, 0.06], 0x3a3a3a, { rot: [-0.35, 0, 0] })
    .box([0, by, bz], [bx * 2 + 0.08, 0.03, 0.03], 0xa8a8a8)
    .box([0, by - 0.05, bz + 0.07], [0.14, 0.1, 0.06], 0xf4f0e0, { glow: 0.6 })
    .box([-0.14, 0.2, -0.38], [0.06, 0.06, 0.46], 0xb0b0b0)
    .box([0, 0.57, -0.64], [0.28, 0.03, 0.3], 0x3a3a3a)
    .box([0, 0.7, -0.64], [0.32, 0.24, 0.3], 0xc83a32)
    .box([0, 0.83, -0.64], [0.28, 0.04, 0.26], load)
    .box([0, 0.5, -0.58], [0.16, 0.05, 0.05], 0xd83020, { glow: 0.3 })
    .box([0, R * 2 + 0.03, 0.56], [0.1, 0.02, 0.26], color);
  return { def: d, front, back };
}

/** A way along the road's middle through the market (a point every metre, smoothed round the bend), for the moto and the bicycle. */
class Way {
  readonly xs: number[] = [];
  readonly ys: number[] = [];
  readonly zs: number[] = [];
  readonly len: number;

  constructor(pts: Point[]) {
    for (const p of pts) {
      this.xs.push(p.x);
      this.ys.push(p.y);
      this.zs.push(p.z);
    }
    for (const a of [this.xs, this.zs]) {
      const src = a.slice();
      for (let i = 0; i < src.length; i++) {
        let sum = 0;
        let n = 0;
        for (let j = -3; j <= 3; j++) {
          const k = i + j;
          if (k < 0 || k >= src.length) continue;
          sum += src[k];
          n++;
        }
        a[i] = sum / n;
      }
    }
    this.len = Math.max(0, pts.length - 1);
  }

  /** The point `s` m along, and the heading there. */
  at(s: number, out: Point & { yaw: number }): Point & { yaw: number } {
    const f = Math.max(0, Math.min(this.len - 1e-3, s));
    const i = Math.floor(f);
    const k = f - i;
    const j = Math.min(this.xs.length - 1, i + 1);
    out.x = this.xs[i] + (this.xs[j] - this.xs[i]) * k;
    out.y = this.ys[i] + (this.ys[j] - this.ys[i]) * k;
    out.z = this.zs[i] + (this.zs[j] - this.zs[i]) * k;
    out.yaw = Math.atan2(this.xs[j] - this.xs[i], this.zs[j] - this.zs[i]);
    return out;
  }
}

export class MarketLife implements PeopleScene {
  readonly name = 'market';
  readonly actors: Actor[] = [];
  private readonly pace = new Pace(NEAR, HIDE);
  private readonly sellers: Seller[] = [];
  private readonly buyers: Buyer[] = [];
  private readonly stools: (Point & { yaw: number; near: Point; taken: Buyer | null })[] = [];
  private readonly rnd = mulberry32(0x3a7c1);
  private readonly y0: number;
  private readonly force: string | null;
  /** Checks (URL): the monk at an alms stop, the moto and the bicycle that far along the road (null: as the day goes). */
  private readonly pins: { monk: string | null; moto: string | null; bike: string | null };
  private shown = false;
  /** The camera is not near (the Pace steps every few frames): the seated sellers only come and go. */
  private far = false;
  private spawnAt = 0;
  /** Rain: the buyers' umbrellas are up (eased by the day's events, with a margin so they do not flicker). */
  private rain = false;
  private readonly next = { murmur: 0, call: 4, chop: 2, sizzle: 1 };
  // The monk's alms round.
  private readonly monk: { a: Actor; stops: string[]; path: Point[]; leg: number; stopAt: Seller[]; wait: number; done: boolean; on: boolean };
  // A little girl squatting by her mother's basket stall in the morning (she waves at the explorer when he comes close).
  private readonly girl: { a: Actor; mum: Seller; at: Point & { yaw: number }; waved: number; wave: number };
  // The child's bicycle.
  private readonly kid: { a: Actor; bike: Bicycle; s: number; dir: 1 | -1; speed: number; wait: number; rolled: number; bell: number; on: boolean };
  // The moto passing through.
  private readonly moto: { a: Actor; rig: Rig; front: number; back: number; s: number; dir: 1 | -1; speed: number; wait: number; rolled: number; sound: number; on: boolean; discs: Obstacle[] };
  private readonly way: Way | null;
  /** The noodle cook (the night's buyers come to her stools). */
  private readonly noodles: Seller;
  private readonly p = { x: 0, y: 0, z: 0, yaw: 0 };
  private readonly look: Point = { x: 0, y: 0, z: 0 };

  constructor(private readonly env: PeopleEnv) {
    const { crowd, traffic, ground } = env;
    const field = ground.field;
    this.y0 = field.heightAt(MK.x, MK.z);
    this.force = env.params.get('mkopen');
    this.pins = { monk: env.params.get('mkmonk'), moto: env.params.get('mkmoto'), bike: env.params.get('mkbike') };
    // (sellers sit at their stalls: they do not dodge; the walkers do)
    const actor = (look: Look, dodge = true) => {
      const a = new Actor(crowd, look, ground);
      if (dodge) a.avoid(traffic, this.name);
      this.actors.push(a);
      return a;
    };
    // Sellers: one a stall.
    for (const s of STALLS) {
      const goods = VENDOR_GOODS[s.goods];
      const extra: Feature[] = [FEAT.parcel];
      if (s.goods === 'noodles') extra.push(FEAT.paddle);
      if (s.goods === 'meat') extra.push(FEAT.knife);
      const base = dress('vendor', s.who.seed, { sex: s.who.sex, hat: s.who.hat, goods, props: extra });
      const [p1, p2] = LOAD[s.goods];
      const laden = basket(base, p1, p2);
      const [sx, sz] = stallPoint(s, s.seat.x, s.seat.z);
      const gy = s.kind === 'hall' ? this.y0 : field.heightAt(MK.x + s.x, MK.z + s.z);
      const f = frontOf(s);
      const node = STALL_NODE[s.id];
      const toN = routeLength(aisleRoute(node, 'north'));
      const toE = routeLength(aisleRoute(node, 'east'));
      this.sellers.push({
        a: actor(base, false),
        s,
        seat: { x: MK.x + sx, y: gy + s.seat.y, z: MK.z + sz, yaw: s.yaw },
        front: { x: MK.x + f.x, y: gy, z: MK.z + f.z, yaw: f.yaw },
        pose: SEATED[s.seat.pose],
        exit: toN < toE ? 'north' : 'east',
        mode: 'away',
        path: [],
        leg: 0,
        serving: null,
        work: 0,
        nextWork: 3 + (s.who.seed % 7),
        alms: 0,
        bless: 0,
        base,
        laden,
        pot: s.goods === 'noodles' ? potSpot(s, gy) : null,
        at: 'seat',
      });
    }
    this.noodles = this.sellers.find((x) => x.s.id === 'noodles')!;
    // Buyers: villagers of the east village and round about.
    const who: ['f' | 'm', 'palm' | 'krama' | 'none'][] = [
      ['f', 'krama'],
      ['f', 'palm'],
      ['m', 'none'],
      ['f', 'none'],
      ['f', 'krama'],
      ['m', 'palm'],
      ['f', 'palm'],
    ];
    who.forEach(([sex, hat], k) => {
      const base = dress('villager', 2201 + k * 13, { sex, hat });
      const eating = { ...base, feats: [...base.feats, FEAT.smallBowl], colors: base.colors.slice(), carry: CARRY.none };
      eating.colors[SLOT.prop] = 0xf0ead8;
      this.buyers.push({ a: actor(base), k, mode: 'off', path: [], leg: 0, plan: [], node: 'north', target: '', seller: null, until: 0, stool: -1, base, eating, said: false, dry: base, wet: null });
    });
    // The noodle stall's stools: each faces its table; `near` is where the eater steps to it from.
    for (const t of TABLES) {
      const c = Math.cos(t.yaw);
      const n = Math.sin(t.yaw);
      for (const [ax, az] of STOOL_AT) {
        const lx = t.x + ax * c + az * n;
        const lz = t.z - ax * n + az * c;
        const p = at(lx, lz);
        p.y = field.heightAt(p.x, p.z);
        const r = Math.hypot(ax, az);
        const out = at(t.x + (ax * c + az * n) * (1 + 0.5 / r), t.z + (-ax * n + az * c) * (1 + 0.5 / r));
        this.stools.push({ ...p, yaw: Math.atan2(MK.x + t.x - p.x, MK.z + t.z - p.z), near: out, taken: null });
      }
    }
    // The monk, the child on her bicycle, the moto and its rider.
    this.monk = { a: actor(dress('monk', 2301, { carry: CARRY.bowl })), stops: [], path: [], leg: 0, stopAt: [], wait: 0, done: false, on: false };
    const mum = STALLS.find((x) => x.id === 'baskets')!;
    const [gx, gz] = stallPoint(mum, mum.w / 2 + 0.2, -0.5);
    this.girl = { a: actor(dress('kid', 2317, { young: true, sex: 'f' }), false), mum: this.sellers.find((x) => x.s.id === 'baskets')!, at: { x: MK.x + gx, y: field.heightAt(MK.x + gx, MK.z + gz), z: MK.z + gz, yaw: mum.yaw - 0.5 }, waved: -1e9, wave: 0 };
    this.kid = { a: actor(dress('kid', 2311)), bike: new Bicycle(env.things, 2311, { load: 'none' }), s: 0, dir: 1, speed: 0, wait: 0, rolled: 0, bell: 0, on: false };
    const m = motoDef(0x8a1e22, 0x4f9a3a);
    this.moto = {
      a: actor(dress('villager', 2321, { sex: 'm', hat: 'krama' })),
      rig: new Rig(env.things, m.def),
      front: m.front,
      back: m.back,
      s: 0,
      dir: 1,
      speed: 0,
      wait: 20,
      rolled: 0,
      sound: 0,
      on: false,
      discs: [0, 1].map(() => ({ x: 0, y: 0, z: 0, r: 0.6, vx: 0, vz: 0, who: 'animal' })),
    };
    // The road through the market: its samples within 45 m of the square's middle, north to east.
    const road = field.trails.find((t) => t.name === 'east village road');
    const pts: Point[] = [];
    if (road) {
      let from = -1;
      let to = -1;
      road.samples.forEach((s, i) => {
        const d = len(s.x - MK.x, s.z - MK.z);
        if (d < 45) {
          if (from < 0) from = i;
          to = i;
        }
      });
      for (let i = from; i >= 0 && i <= to; i++) pts.push({ x: road.samples[i].x, y: road.samples[i].y, z: road.samples[i].z });
    }
    this.way = pts.length > 20 ? new Way(pts) : null;
  }

  // ── Once a frame ─────────────────────────────────────────────────────────

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    const step = this.pace.step(dt, viewDist(f, MK.x, MK.z));
    if (step < 0) {
      this.hideAll();
      return;
    }
    if (step === 0 && this.shown) return;
    dt = step;
    const first = !this.shown;
    this.shown = true;
    const l = f.listener;
    const ears = len(l.x - MK.x, l.z - MK.z);
    const seen = ears < SEEN && !first && !this.env.shot;
    this.far = viewDist(f, MK.x, MK.z) > NEAR && !first;
    for (const s of this.sellers) this.seller(s, dt, now, f, ex, seen);
    this.shop(dt, now, f, ex, first);
    this.alms(dt, now, f, first);
    this.play(dt, now, f, ex);
    this.ride(dt, now, f, ex, first);
    this.passBy(dt, now, f, ex, first);
    if (f.dt > 0 && ears < HEAR) this.sounds(now, f, ex, ears);
  }

  private open(s: Stall, clock: number): boolean {
    return this.force === 'all' ? true : this.force === 'none' ? false : inWindow(clock, s.open);
  }

  // ── Sellers ──────────────────────────────────────────────────────────────

  private seller(sl: Seller, dt: number, now: number, f: MapFrame, ex: Obstacle | null, seen: boolean): void {
    const a = sl.a;
    const open = this.open(sl.s, f.clock);
    switch (sl.mode) {
      case 'away':
        if (!open) return;
        if (!seen) this.sit(sl, now);
        else {
          // She comes in with her basket on her head, from the way nearest her stall.
          sl.path = route(sl.exit, STALL_NODE[sl.s.id], sl.front);
          sl.leg = 1;
          this.wear(a, sl.laden);
          a.warp(sl.path[0].x, this.env.ground.field.heightAt(sl.path[0].x, sl.path[0].z), sl.path[0].z, 0);
          a.show();
          a.carry(1, now);
          sl.mode = 'in';
        }
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
      if (sl.serving) this.letGo(sl.serving);
      if (!seen) return this.gone(sl);
      // Packed up: she steps down in front of her stall and goes off with her basket.
      a.warp(sl.front.x, sl.front.y, sl.front.z, sl.front.yaw);
      this.wear(a, sl.laden);
      a.carry(1, now);
      a.pose(POSE.stand, now);
      sl.path = route(STALL_NODE[sl.s.id], sl.exit, null);
      sl.path.unshift({ x: sl.front.x, y: 0, z: sl.front.z });
      sl.leg = 1;
      sl.mode = 'out';
      return;
    }
    // Selling (from afar, sitting still: nothing to do but come and go).
    const b = sl.serving;
    if (this.far && !b && now > sl.bless && sl.at === 'seat') return;
    let pose = sl.pose;
    if (now < sl.alms) pose = POSE.give;
    else if (now < sl.bless) pose = POSE.kneel;
    else if (b && (b.mode === 'talk' || b.mode === 'pay')) pose = b.mode === 'pay' ? POSE.give : Math.sin(now * 2.2 + sl.s.who.seed) > 0.2 ? POSE.talk : sl.pose;
    else if (now < sl.work) pose = POSE.stir;
    else if (now > sl.nextWork) {
      // Work: the noodle cook stirs her pot, the grill man turns the skewers, the drinks man presses cane.
      const worker = sl.s.goods === 'noodles' || sl.s.goods === 'grill' || sl.s.goods === 'drinks';
      if (worker) sl.work = now + 3 + this.rnd() * 3;
      sl.nextWork = now + 7 + this.rnd() * 8;
    }
    // The noodle cook steps over to her big pot to stir it, then back to her cart.
    if (sl.pot && this.cook(sl, pose === POSE.stir, dt, now)) return;
    a.pose(pose, now);
    // Looking: at the buyer she is serving, the monk, the explorer close by, else round her goods.
    const lookAt = b ? head(b.a, this.look) : ex && len(ex.x - a.x, ex.z - a.z) < 6 ? this.pt(ex.x, ex.y + 2, ex.z) : now < sl.bless ? head(this.monk.a, this.look) : null;
    a.lookAt(lookAt, now + 0.5);
    a.tilt(lookAt ? 0 : sl.s.kind === 'hall' || sl.pose === POSE.stand ? 0.35 : 0.15);
    a.step(dt, now);
  }

  /** The noodle cook between her cart and her pot: true while she is on her way (this step taken). */
  private cook(sl: Seller, stir: boolean, dt: number, now: number): boolean {
    const a = sl.a;
    const to = stir ? sl.pot! : sl.seat;
    const there = stir ? 'pot' : 'seat';
    if (sl.at === there) return false;
    // (a step or two across: on her feet, walking)
    a.riding = false;
    sl.at = 'going';
    a.goTo(to.x, to.z, 0.6);
    a.face(to.yaw);
    a.pose(POSE.stand, now);
    a.lookAt(null);
    a.step(dt, now);
    if (a.dist(to.x, to.z) < 0.12) {
      a.ride(to.x, to.y, to.z, to.yaw);
      sl.at = there;
    }
    return true;
  }

  /** On her seat (or standing at her table), selling. */
  private sit(sl: Seller, now: number): void {
    const a = sl.a;
    this.wear(a, sl.base);
    sl.at = 'seat';
    a.ride(sl.seat.x, sl.seat.y, sl.seat.z, sl.seat.yaw);
    a.show();
    a.carry(0, now);
    a.pose(sl.pose, now);
    sl.mode = 'sell';
    sl.serving = null;
  }

  private gone(sl: Seller): void {
    sl.a.hide();
    sl.mode = 'away';
    sl.serving = null;
  }

  // ── Buyers ───────────────────────────────────────────────────────────────

  /** How many buyers are about at this time of day (at night they come to eat). */
  private wanted(clock: number): number {
    if (inWindow(clock, [0.72, 0.95])) return 7;
    if (inWindow(clock, [0.95, 0.05])) return 5;
    if (inWindow(clock, [0.05, 0.15])) return 3;
    if (inWindow(clock, [0.15, 0.3])) return 2;
    if (inWindow(clock, [0.3, 0.64])) return this.noodles.mode === 'sell' ? 3 : 0;
    if (inWindow(clock, [0.64, 0.72])) return 1;
    return 0;
  }


  private shop(dt: number, now: number, f: MapFrame, ex: Obstacle | null, first: boolean): void {
    const wet = eventsNow(f).umbrellas;
    this.rain = wet > 0.5 || (this.rain && wet > 0.3);
    const want = this.wanted(f.clock);
    let out = 0;
    for (const b of this.buyers) if (b.mode !== 'off') out++;
    // New buyers come in now and then (at first, the market is already busy: they are in the middle of it).
    for (const b of this.buyers) {
      if (out >= want || (!first && now < this.spawnAt)) break;
      if (b.mode !== 'off') continue;
      if (this.start(b, now, f, first)) {
        out++;
        this.spawnAt = now + 4 + this.rnd() * 7;
      }
    }
    for (const b of this.buyers) {
      if (b.mode === 'off') continue;
      const a = b.a;
      switch (b.mode) {
        case 'walk': {
          this.umbrella(b, this.rain, now);
          if (this.walk(b, WALK, dt, now)) {
            // (under the stalls' tarps, at the stools or home: the umbrella comes down)
            this.umbrella(b, false, now);
            this.arrive(b, now, f);
          }
          continue;
        }
        case 'look': {
          const s = b.seller!;
          a.stop(s.front.yaw);
          a.pose(POSE.stand, now);
          a.lookAt(this.pt(s.seat.x, s.seat.y + 0.6, s.seat.z), now + 0.5);
          a.tilt(0.3);
          if (now > b.until) {
            if (s.mode !== 'sell' || (s.serving && s.serving !== b)) {
              // (she is busy, or gone: on to the next)
              if (now > b.until + 6 || s.mode !== 'sell') this.onward(b, now, f);
            } else {
              s.serving = b;
              b.mode = 'talk';
              b.until = now + 3.5 + this.rnd() * 3;
              this.say(b, ex, this.rnd() < 0.5 ? 'mkHowMuch' : 'mkLower', f);
            }
          }
          break;
        }
        case 'talk': {
          const s = b.seller!;
          a.pose(Math.sin(now * 1.9 + b.k) > -0.2 ? POSE.talk : POSE.stand, now);
          a.lookAt(head(s.a, this.look), now + 0.5);
          a.tilt(0);
          if (s.mode !== 'sell') this.onward(b, now, f);
          else if (now > b.until) {
            b.mode = 'pay';
            b.until = now + 1.8;
          }
          break;
        }
        case 'pay': {
          const s = b.seller!;
          a.pose(POSE.give, now);
          a.lookAt(head(s.a, this.look), now + 0.5);
          if (now > b.until) {
            // Paid: the goods go into her basket (on the head) or his bag.
            const [p1, p2] = LOAD[s.s.goods];
            // (lotus buds and incense for the pagoda are carried in the hand; the rest in a basket on her head or his bag)
            this.wear(a, s.s.goods === 'flowers' ? offering(b.base) : b.base.feats.includes(FEAT.hairBun) ? basket(b.base, p1, p2) : bag(b.base));
            a.carry(1, now);
            if (s.serving === b) s.serving = null;
            this.say(b, ex, 'mkThanks', f);
            this.onward(b, now, f);
          }
          break;
        }
        case 'eat': {
          a.pose(POSE.eat, now);
          a.step(dt, now);
          if (now > b.until || this.noodles.mode !== 'sell') {
            // Up from the stool, and home.
            const st = this.stools[b.stool];
            st.taken = null;
            b.stool = -1;
            a.warp(st.near.x, st.y, st.near.z, st.yaw + Math.PI);
            this.wear(a, b.base);
            b.plan = [];
            b.node = 'tables';
            this.onward(b, now, f);
          }
          continue;
        }
      }
      // (`onward` may have just sent them home: `mode` is 'off' then)
      if ((b.mode as string) !== 'off') a.step(dt, now);
    }
  }

  /** A buyer sets out: what they will buy, from the way in (or, at first, already in the middle of it). */
  private start(b: Buyer, now: number, f: MapFrame, mid: boolean): boolean {
    const c = f.clock;
    const night = inWindow(c, [0.3, 0.64]);
    const open = this.sellers.filter((s) => s.mode === 'sell' || (mid && this.open(s.s, c)));
    const stalls = open.filter((s) => s.s.goods !== 'noodles');
    b.plan = [];
    if (!night) {
      const n = 1 + (this.rnd() < 0.45 ? 1 : 0);
      for (let i = 0; i < n && stalls.length; i++) {
        const s = stalls.splice(Math.floor(this.rnd() * stalls.length), 1)[0];
        b.plan.push(s.s.id);
      }
    }
    const noodles = this.noodles.mode === 'sell' || (mid && this.open(this.noodles.s, c));
    if (noodles && (night || this.rnd() < (inWindow(c, [0.72, 0.95]) ? 0.3 : 0.12))) b.plan.push('eat');
    if (!b.plan.length) return false;
    const a = b.a;
    this.wear(a, b.base);
    a.carry(0, now);
    a.show();
    b.said = false;
    if (mid) {
      // (in the middle of it: at the first stall already, looking, or on a stool)
      const id = b.plan[0];
      if (id === 'eat' && this.seat(b, now, true)) return true;
      const s = this.sellers.find((x) => x.s.id === id);
      if (s) {
        b.plan.shift();
        const off = (this.rnd() - 0.5) * 0.8;
        const fx = s.front.x + Math.cos(s.front.yaw) * off;
        const fz = s.front.z - Math.sin(s.front.yaw) * off;
        a.warp(fx, s.front.y, fz, s.front.yaw);
        b.seller = s;
        b.node = STALL_NODE[id];
        b.mode = 'look';
        b.until = now + this.rnd() * 5;
        return true;
      }
    }
    b.node = this.rnd() < 0.55 ? 'east' : 'north';
    const p = NODE[b.node];
    a.warp(p.x, this.env.ground.field.heightAt(p.x, p.z), p.z, 0);
    this.onward(b, now, f);
    return b.mode !== 'off';
  }

  /** On to the next thing in the plan (a stall, the stools) or home. */
  private onward(b: Buyer, now: number, f: MapFrame): void {
    b.seller = null;
    const a = b.a;
    a.pose(POSE.stand, now);
    a.lookAt(null);
    a.tilt(0);
    while (b.plan.length) {
      const id = b.plan.shift()!;
      if (id === 'eat') {
        if (this.noodles.mode !== 'sell' || !this.seat(b, now, false)) continue;
        return;
      }
      const s = this.sellers.find((x) => x.s.id === id);
      if (!s || s.mode !== 'sell') continue;
      const off = (this.rnd() - 0.5) * 0.9;
      const end = { x: s.front.x + Math.cos(s.front.yaw) * off, y: 0, z: s.front.z - Math.sin(s.front.yaw) * off };
      b.path = route(b.node, STALL_NODE[id], end);
      b.path.unshift({ x: a.x, y: 0, z: a.z });
      b.leg = 1;
      b.target = id;
      b.node = STALL_NODE[id];
      b.mode = 'walk';
      return;
    }
    // Home: out by the way nearer the village, or back up the road.
    const exit = f.clock > 0.3 && f.clock < 0.7 ? 'east' : this.rnd() < 0.55 ? 'east' : 'north';
    b.path = route(b.node, exit, null);
    b.path.unshift({ x: a.x, y: 0, z: a.z });
    b.leg = 1;
    b.target = 'home';
    b.node = exit;
    b.mode = 'walk';
  }

  /** A free stool at the noodle stall: walk to it (or, at first, sit there already). */
  private seat(b: Buyer, now: number, mid: boolean): boolean {
    const k0 = Math.floor(this.rnd() * this.stools.length);
    for (let i = 0; i < this.stools.length; i++) {
      const k = (k0 + i) % this.stools.length;
      const st = this.stools[k];
      if (st.taken) continue;
      st.taken = b;
      b.stool = k;
      if (mid) {
        this.sitDown(b, now, 20 + this.rnd() * 40);
        return true;
      }
      b.path = route(b.node, 'tables', st.near);
      b.path.unshift({ x: b.a.x, y: 0, z: b.a.z });
      b.leg = 1;
      b.target = 'eat';
      b.node = 'tables';
      b.mode = 'walk';
      return true;
    }
    return false;
  }

  private sitDown(b: Buyer, now: number, time: number): void {
    const st = this.stools[b.stool];
    const a = b.a;
    this.wear(a, b.eating);
    a.ride(st.x, st.y, st.z, st.yaw);
    a.show();
    a.pose(POSE.eat, now);
    b.mode = 'eat';
    b.until = now + time;
  }

  /** At the end of a walk: at a stall's front, at the stools, or home. */
  private arrive(b: Buyer, now: number, f: MapFrame): void {
    if (b.target === 'home') {
      b.a.hide();
      b.mode = 'off';
      return;
    }
    if (b.target === 'eat') {
      const night = f.clock > 0.3 && f.clock < 0.66;
      this.sitDown(b, now, night ? 45 + this.rnd() * 40 : 25 + this.rnd() * 30);
      return;
    }
    const s = this.sellers.find((x) => x.s.id === b.target);
    if (!s || s.mode !== 'sell') return this.onward(b, now, f);
    b.seller = s;
    b.mode = 'look';
    b.until = now + 2 + this.rnd() * 2.5;
  }

  private letGo(b: Buyer): void {
    if (b.mode === 'look' || b.mode === 'talk' || b.mode === 'pay') b.until = -1;
  }

  // ── The monk's alms round at dawn ────────────────────────────────────────

  private alms(dt: number, now: number, f: MapFrame, first: boolean): void {
    const m = this.monk;
    const a = m.a;
    const c = f.clock;
    const window = inWindow(c, [0.735, 0.9]);
    if (!inWindow(c, [0.72, 0.98])) m.done = false;
    const pin = this.pins.monk;
    if (!m.on) {
      if ((!window || m.done) && pin === null) return;
      if (pin !== null && m.done) return;
      // His way: in from the north, stopping at the fruit, the noodle and the rice sellers, out along the village street.
      const stops = ['fruit', 'noodles', 'sugar'].map((id) => this.sellers.find((s) => s.s.id === id)!).filter((s) => s.mode === 'sell');
      const path: Point[] = [];
      const at: Seller[] = [];
      let node = 'north';
      path.push(NODE.north);
      for (const s of stops) {
        const r = route(node, STALL_NODE[s.s.id], s.front);
        path.push(...r.slice(1));
        at[path.length - 1] = s;
        node = STALL_NODE[s.s.id];
        path.push(NODE[node]);
      }
      path.push(...route(node, 'east', null).slice(1));
      m.path = path;
      m.stopAt = at;
      m.leg = 1;
      m.wait = 0;
      m.on = true;
      m.done = true;
      let start = path[0];
      // (a still: at one of his stops, the seller giving)
      const k = pin === null ? -1 : Number(pin);
      if (k >= 0 || (first && this.env.shot && window)) {
        const want = Math.max(0, Math.min(stops.length - 1, k >= 0 ? k : Math.floor((c - 0.735) / 0.055)));
        const idx = at.findIndex((s) => s === stops[want]);
        if (idx > 0) {
          start = path[idx];
          m.leg = idx;
        }
      }
      a.warp(start.x, this.env.ground.field.heightAt(start.x, start.z), start.z, 0);
      a.show();
      a.carry(1, now);
    }
    const goal = m.path[m.leg];
    let pose: Pose = POSE.stand;
    if (m.wait > 0) {
      m.wait -= dt;
      const s = m.stopAt[m.leg];
      a.stop(s ? s.front.yaw : a.yaw);
      // The seller hands rice and fruit into his bowl, then kneels for his blessing.
      pose = m.wait < 4 ? POSE.nod : POSE.stand;
      if (s) a.lookAt(head(s.a, this.look), now + 0.5);
      if (m.wait <= 0) {
        m.leg++;
        a.lookAt(null);
      }
    } else {
      a.goTo(goal.x, goal.z, MONK_WALK);
      a.face(null);
      a.tilt(0.25);
      if (a.dist(goal.x, goal.z) < 0.3) {
        const s = m.stopAt[m.leg];
        if (s && s.mode === 'sell') {
          // (a still pinned at a stop holds it past the shot's run-up: the seller kneeling, the monk blessing)
          const hold = this.env.shot && pin !== null ? 12 : 8;
          m.wait = hold;
          s.alms = now + 3.2;
          s.bless = now + hold;
          if (s.serving) this.letGo(s.serving);
        } else if (m.leg >= m.path.length - 1) {
          a.hide();
          m.on = false;
          return;
        } else m.leg++;
      }
    }
    a.pose(pose, now);
    a.step(dt, now);
  }

  // ── The little girl by the basket stall ──────────────────────────────────

  private play(dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    const g = this.girl;
    const a = g.a;
    const mum = g.mum;
    if (mum.mode !== 'sell' || !inWindow(f.clock, [0.74, 0.98])) {
      if (a.shown) a.hide();
      return;
    }
    if (!a.shown) {
      a.ride(g.at.x, g.at.y, g.at.z, g.at.yaw);
      a.show();
    }
    // The explorer comes close: she waves (once, then not again for a while), else she squats and looks about.
    const near = ex && len(ex.x - a.x, ex.z - a.z) < 5;
    if (near && now > g.waved + 25) {
      g.waved = now;
      g.wave = now + 2.4;
    }
    a.pose(now < g.wave ? POSE.wave : POSE.squat, now);
    a.lookAt(near ? this.pt(ex.x, ex.y + 2, ex.z) : head(mum.a, this.look), now + 0.5);
    a.step(dt, now);
  }

  // ── The child's bicycle ──────────────────────────────────────────────────

  private ride(dt: number, now: number, f: MapFrame, ex: Obstacle | null, first: boolean): void {
    const k = this.kid;
    const way = this.way;
    const out = !way || !inWindow(f.clock, [0.74, 0.12]);
    if (out) {
      if (k.on) {
        k.a.hide();
        k.bike.hide();
        k.on = false;
      }
      return;
    }
    const pin = this.pins.bike;
    if (!k.on) {
      k.on = true;
      k.dir = 1;
      k.s = pin !== null ? Number(pin) : first ? way.len * (0.2 + 0.6 * this.rnd()) : 0;
      k.speed = BIKE_SPEED;
      k.wait = 0;
    }
    if (k.wait > 0) {
      // (out of the market between rides: hidden)
      k.wait -= dt;
      if (k.wait > 0) return;
      k.dir = k.dir > 0 ? -1 : 1;
    }
    const p = way.at(k.s, this.p);
    const yaw = k.dir > 0 ? p.yaw : p.yaw + Math.PI;
    keepRight(p, yaw, 0.7);
    // Someone in the way ahead: slow down and ring the bell.
    const block = this.inWay(p.x, p.z, yaw, 5, k.a, ex);
    const want = block ? 0.7 : BIKE_SPEED;
    k.speed += Math.max(-2 * dt, Math.min(1 * dt, want - k.speed));
    // (pinned in a still: she rides on the spot)
    if (pin !== null && this.env.shot) k.speed = 0.01;
    if (block && now > k.bell && f.dt > 0) {
      k.bell = now + 3.5;
      f.calls.push({ kind: 'bikeBell', x: p.x, y: p.y + 1.2, z: p.z, gain: 0.7 });
    }
    k.s += k.dir * k.speed * dt;
    k.rolled += k.speed * dt;
    if (k.s <= 0 || k.s >= way.len) {
      k.s = Math.max(0, Math.min(way.len, k.s));
      k.wait = 12 + this.rnd() * 16;
      k.a.hide();
      k.bike.hide();
      return;
    }
    const a = k.a;
    const sc = a.crowd.scale(a.i);
    a.ride(p.x, p.y, p.z, yaw);
    a.show();
    a.crowd.pose(a.i, POSE.ride, now);
    a.crowd.gait(a.i, 1, k.speed / (FIT.bike.gear * sc), now);
    a.crowd.look(a.i, 0, 0.1, now);
    a.crowd.place(a.i, p.x, p.y, p.z, yaw);
    k.bike.put(p.x, p.y, p.z, yaw, sc, a.crowd.phaseOf(a.i, now), k.rolled / (BIKE_WHEEL * sc));
  }

  // ── The moto passing through ─────────────────────────────────────────────

  private passBy(dt: number, now: number, f: MapFrame, ex: Obstacle | null, _first: boolean): void {
    const m = this.moto;
    const way = this.way;
    const day = inWindow(f.clock, [0.7, 0.24]);
    const pin = this.pins.moto;
    if (!way || (!day && !m.on && pin === null)) return;
    if (!m.on) {
      m.wait -= dt;
      if (m.wait > 0 && pin === null) return;
      m.on = true;
      m.dir = pin !== null ? 1 : m.dir > 0 ? -1 : 1;
      m.s = pin !== null ? Number(pin) : m.dir > 0 ? 0 : way.len;
      m.speed = MOTO_SPEED * 1.4;
    }
    const p = way.at(m.s, this.p);
    const yaw = m.dir > 0 ? p.yaw : p.yaw + Math.PI;
    keepRight(p, yaw, 0.8);
    // Slow through the market; stop for anyone in front (the explorer, a buyer crossing).
    const inMarket = len(p.x - MK.x, p.z - MK.z) < 24;
    const block = this.inWay(p.x, p.z, yaw, 4.5, m.a, ex);
    const want = block ? 0 : inMarket ? MOTO_SPEED : MOTO_SPEED * 1.6;
    m.speed += Math.max(-4 * dt, Math.min(1.5 * dt, want - m.speed));
    // (pinned in a still: it stands there, the engine running)
    if (pin !== null && this.env.shot) m.speed = 0;
    m.s += m.dir * m.speed * dt;
    m.rolled += m.speed * dt;
    if (m.s <= 0 || m.s >= way.len) {
      m.on = false;
      m.wait = 45 + this.rnd() * 60;
      m.a.hide();
      m.rig.hide();
      return;
    }
    const a = m.a;
    const sc = a.crowd.scale(a.i);
    a.ride(p.x, p.y, p.z, yaw);
    a.show();
    a.crowd.pose(a.i, POSE.ride, now);
    a.crowd.gait(a.i, 1, 0, now);
    a.crowd.look(a.i, 0, 0, now);
    a.crowd.place(a.i, p.x, p.y, p.z, yaw);
    const roll = m.rolled / (0.22 * sc);
    m.rig.place(p.x, p.y, p.z, yaw, 0, 0, sc).turn(m.front, roll).turn(m.back, roll);
    m.rig.write();
    // (two discs in everyone's way: people step round it)
    const sy = Math.sin(yaw);
    const cy = Math.cos(yaw);
    m.discs.forEach((d, i) => {
      const o = i === 0 ? 0.55 : -0.5;
      d.x = p.x + sy * o;
      d.y = p.y;
      d.z = p.z + cy * o;
      d.vx = sy * m.speed * m.dir;
      d.vz = cy * m.speed * m.dir;
    });
    if (f.dt > 0 && now > m.sound && len(f.listener.x - p.x, f.listener.z - p.z) < 100) {
      m.sound = now + 2.6;
      f.calls.push({ kind: 'moto', x: p.x, y: p.y + 0.6, z: p.z, gain: inMarket ? 0.6 : 0.85 });
    }
  }

  /** Anyone (a buyer, a seller walking, the monk, the explorer) within `ahead` m in front of (x, z) heading `yaw`, in a lane 1.2 m either side? */
  private inWay(x: number, z: number, yaw: number, ahead: number, self: Actor, ex: Obstacle | null): boolean {
    const tx = Math.sin(yaw);
    const tz = Math.cos(yaw);
    const hit = (ox: number, oz: number) => {
      const dx = ox - x;
      const dz = oz - z;
      const along = dx * tx + dz * tz;
      return along > 0.3 && along < ahead && Math.abs(dx * tz - dz * tx) < 1.2;
    };
    if (ex && hit(ex.x, ex.z)) return true;
    for (const a of this.actors) if (a !== self && a.shown && !a.riding && hit(a.x, a.z)) return true;
    return false;
  }

  // ── Sounds and words ─────────────────────────────────────────────────────

  private sounds(now: number, f: MapFrame, ex: Obstacle | null, ears: number): void {
    const calls = f.calls;
    if (now > this.next.murmur) {
      this.next.murmur = now + 3.2;
      let n = 0;
      for (const a of this.actors) if (a.shown) n++;
      if (n >= 3) calls.push({ kind: 'market', x: MK.x - 3, y: this.y0 + 1.5, z: MK.z - 2, gain: Math.min(1, 0.25 + n / 18) });
    }
    if (ears > CALLS + 25) return;
    const l = f.listener;
    if (now > this.next.call) {
      this.next.call = now + 5 + this.rnd() * 6;
      // The seller nearest the ears calls out (a bubble if the explorer stands close).
      let best: Seller | null = null;
      let bd = CALLS;
      for (const s of this.sellers) {
        if (s.mode !== 'sell' || s.serving || now < s.bless) continue;
        const d = len(s.a.x - l.x, s.a.z - l.z) + this.rnd() * 6;
        if (d < bd) [best, bd] = [s, d];
      }
      if (best) {
        const a = best.a;
        calls.push({ kind: 'vendorCall', x: a.x, y: a.y + 1.6, z: a.z, gain: 0.75 });
        const own = CALL[best.s.goods];
        const key = own && this.rnd() < 0.6 ? own : ANY_CALL[Math.floor(this.rnd() * ANY_CALL.length)];
        if (ex && f.roam !== 'overview' && len(ex.x - a.x, ex.z - a.z) < SAY && !this.env.shot && !this.env.bubble.showing) this.env.bubble.say(key, () => head(a), 2.8);
      }
    }
    if (now > this.next.chop) {
      this.next.chop = now + 4 + this.rnd() * 4;
      for (const id of ['noodles', 'meat']) {
        const s = this.sellers.find((x) => x.s.id === id)!;
        if (s.mode === 'sell' && len(s.a.x - l.x, s.a.z - l.z) < CALLS) calls.push({ kind: 'chop', x: s.a.x, y: s.a.y + 1, z: s.a.z, gain: 0.55 });
      }
    }
    if (now > this.next.sizzle) {
      this.next.sizzle = now + 3.5 + this.rnd() * 2.5;
      const s = this.sellers.find((x) => x.s.id === 'grill')!;
      if (s.mode === 'sell' && len(s.a.x - l.x, s.a.z - l.z) < CALLS) calls.push({ kind: 'sizzle', x: s.a.x, y: s.a.y + 1, z: s.a.z, gain: 0.6 });
    }
  }

  /** A buyer's word in the bubble (only with the explorer close, now and then). */
  private say(b: Buyer, ex: Obstacle | null, key: WordKey, f: MapFrame): void {
    if (b.said && key !== 'mkThanks') return;
    const a = b.a;
    if (!ex || f.roam === 'overview' || this.env.shot || this.env.bubble.showing || len(ex.x - a.x, ex.z - a.z) > SAY * 0.8) return;
    b.said = true;
    this.env.bubble.say(key, () => head(a), 2.2);
  }

  // ── Plumbing ─────────────────────────────────────────────────────────────

  /** Walk someone along their path (`w.leg`: the point they walk to); true when they have reached its end. */
  private walk(w: { a: Actor; path: Point[]; leg: number }, speed: number, dt: number, now: number): boolean {
    const a = w.a;
    const goal = w.path[w.leg];
    if (!goal) return true;
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

  /**
   * Rain: a buyer walking between the stalls holds an umbrella up (not with a
   * basket on the head, nor with lotus buds in the hand: those colours are
   * the umbrella's); down again under the tarps, and when the rain has passed.
   */
  private umbrella(b: Buyer, up: boolean, now: number): void {
    const a = b.a;
    const dry = a.look === b.wet ? b.dry : a.look;
    if (dry !== b.dry) {
      b.dry = dry;
      b.wet = null;
    }
    const can = up && dry.carry === CARRY.none && !dry.feats.includes(FEAT.offering);
    const look = can ? (b.wet ??= withUmbrella(dry, UMBRELLAS[b.k % UMBRELLAS.length])) : dry;
    if (a.look === look) return;
    this.wear(a, look);
    a.carry(can ? 1 : 0, now);
  }

  private wear(a: Actor, look: Look): void {
    if (a.look === look) return;
    a.look = look;
    a.crowd.dress(a.i, look);
  }

  private pt(x: number, y: number, z: number): Point {
    this.look.x = x;
    this.look.y = y;
    this.look.z = z;
    return this.look;
  }

  private hideAll(): void {
    if (!this.shown) return;
    this.shown = false;
    for (const a of this.actors) if (a.shown) a.hide();
    for (const s of this.sellers) {
      s.mode = 'away';
      s.serving = null;
    }
    for (const b of this.buyers) {
      b.mode = 'off';
      b.stool = -1;
    }
    for (const st of this.stools) st.taken = null;
    this.monk.on = false;
    this.girl.waved = -1e9;
    this.kid.on = false;
    this.kid.bike.hide();
    this.moto.on = false;
    this.moto.rig.hide();
  }

  report(traffic: Traffic): void {
    for (const a of this.actors) if (a.shown) traffic.add(this.name, a.x, a.y, a.z);
    if (this.moto.on && this.moto.a.shown) for (const d of this.moto.discs) traffic.list.push(d);
  }

  /** The nature book: while the market is busy, its buyers are the market crowd (the sellers are vendors by their kind). */
  subjects(out: Subject[]): void {
    let n = 0;
    for (const b of this.buyers) if (b.a.shown) n++;
    if (n < 4) return;
    for (const b of this.buyers) {
      const a = b.a;
      if (!a.shown || !a.crowd.isShown(a.i)) continue;
      const r = 0.85 * a.crowd.scale(a.i);
      out.push({ kind: 'market', x: a.x, y: a.y + r, z: a.z, r });
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Riding on the right-hand side of the road (Cambodia keeps right): `p` moved `off` m to the right of the heading `yaw`. */
function keepRight(p: Point, yaw: number, off: number): void {
  p.x -= Math.cos(yaw) * off;
  p.z += Math.sin(yaw) * off;
}

/** A walk along the aisles from one aisle point to another, then on to `end` (map points). */
function route(from: string, to: string, end: Point | null): Point[] {
  const pts = aisleRoute(from, to).map((n) => ({ x: NODE[n].x, y: 0, z: NODE[n].z }));
  if (end) pts.push({ x: end.x, y: 0, z: end.z });
  return pts;
}

function routeLength(nodes: string[]): number {
  let d = 0;
  for (let i = 1; i < nodes.length; i++) d += len(NODE[nodes[i]].x - NODE[nodes[i - 1]].x, NODE[nodes[i]].z - NODE[nodes[i - 1]].z);
  return d;
}

/** Where the noodle cook stands to stir her big pot (by her cart: `_mkStalls.ts` puts the pot at (−1.55, −0.2) of the stall), facing it. */
function potSpot(s: Stall, y: number): Point & { yaw: number } {
  const reach = FIT.wok.z * 1.3;
  const [x, z] = stallPoint(s, -1.55, -0.2 - reach);
  return { x: MK.x + x, y, z: MK.z + z, yaw: s.yaw };
}

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

/** A look with lotus buds and incense sticks in the hand (`FEAT.offering`: bought for the pagoda). */
function offering(base: Look): Look {
  const colors = base.colors.slice();
  colors[SLOT.prop] = 0xf08ab0;
  colors[SLOT.prop2] = 0x4a7a3a;
  colors[SLOT.wood] = 0xc8302a;
  colors[SLOT.flame] = 0xff7a3a;
  return { ...base, colors, feats: [...base.feats, FEAT.offering] };
}

/** Rain umbrellas (as the pilgrims'): black, dark blue, plum, a flowered one. */
const UMBRELLAS = [0x2e2e32, 0x2a3a5a, 0x6a2a3a, 0xd86a8a];

/** A look with an umbrella up in the right hand (the bag at the hip stays). */
function withUmbrella(base: Look, cover: number): Look {
  const colors = base.colors.slice();
  colors[SLOT.prop] = cover;
  colors[SLOT.prop2] = cover + 0x181818;
  colors[SLOT.wood] = 0x3a3634;
  return { ...base, colors, feats: [...base.feats.filter((f) => f !== FEAT.phone && f !== FEAT.parcel), FEAT.umbrella], carry: CARRY.umbrella };
}

/** A look with the shopping in a bag at the hip. */
function bag(base: Look): Look {
  const colors = base.colors.slice();
  colors[SLOT.bag] = 0x3a6aa8;
  return { ...base, colors, feats: [...base.feats, FEAT.bag] };
}
