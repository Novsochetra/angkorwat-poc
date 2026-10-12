import { EAST_DIR, EAST_N, MK } from '../hamlet/_mkPlan';
import { BIKE_SHOP_ID, SHOP_MECHANIC, SHOP_STOOL, shopOpen, shopToWorld, shopYaw } from '../roam/_bikeShopPlan';
import { BROWSE, SALE } from '../shop';
import type { MapFrame } from '../types';
import { Actor } from './_actor';
import { Bubble } from './_bubble';
import { dress } from './_kinds';
import { POSE, SLOT, type Look } from './_personModel';
import type { Obstacle, Point, Traffic } from './_routes';
import { Pace, viewDist, type PeopleEnv, type PeopleScene } from './_scene';

/**
 * The bicycle mechanic (ជាងកង់) at the morning market's bicycle shop
 * (roam/_bikeShopStall.ts, where: roam/_bikeShopPlan.ts): a village man of
 * middle age, a krama wound round his head, an old blue work shirt with its
 * sleeves pushed up, dark trousers, rubber sandals.
 *
 * By day he sits on his low stool behind the old green bicycle he is mending
 * (upside down on its saddle and bars), looking out at the street — at him
 * when he comes near; now and then he calls out to him, "កង់ថ្មីៗ ជិះស្រួល!"
 * (a bubble and a seller's voice). He sells there (roam/_bikeShop.ts): the
 * people's seller (people/_saleBack.ts, through shop.ts `BROWSE` and `SALE`)
 * has him look up and ask, turn to him and hand it over. Out of the shop's
 * hours (`SHOP_HOURS`: after sunrise to the late afternoon) he walks home
 * along the village street, east; in the morning he comes back the same way.
 *
 * One person, stepped only while the camera is within 260 m (nearer than
 * 60 m every frame). URL (checks): `bikeshopopen=all|none` (the plan's).
 */

const NEAR = 60;
const HIDE = 260;
/** His pace walking (m/s). */
const WALK = 0.85;
/** He calls out to him this near (m), at most once in this long (s). */
const CALL_NEAR = 7;
const CALL_EVERY = 80;
/** His head over his feet (m at the drawn scale 1.4), seated on the low stool. */
const HEAD_SIT = 1.95;

/** A point beside the market's east leg (as _mkPlan.ts: `s` m along it from the bend, `off` m to the south). */
const besideEast = (s: number, off: number): [number, number] => [MK.x + EAST_DIR.x * s + EAST_N.x * off, MK.z + EAST_DIR.z * s + EAST_N.z * off];

/**
 * His way home from the stool (map points): out past the workbench's west end, round the stall's west pole, up to
 * the street between the market's drinks cart and the parked motos, then east along the village street.
 */
const WAY_HOME: readonly (readonly [number, number])[] = [
  shopToWorld(2.25, -0.25),
  shopToWorld(3.4, 0.2),
  shopToWorld(3.4, 2.6),
  besideEast(8.6, 1.6),
  besideEast(16, 0.8),
  besideEast(30, 0.3),
];

type Job = 'away' | 'arrive' | 'sit' | 'leave';

export class BikeMechanic implements PeopleScene {
  readonly name = 'bikeshop';
  readonly actors: Actor[] = [];
  private readonly a: Actor;
  private readonly look: Look;
  private readonly pace = new Pace(NEAR, HIDE);
  private readonly bubble = new Bubble();
  private readonly env: PeopleEnv;
  private job: Job = 'away';
  /** Walking: the point of `WAY_HOME` he heads for. */
  private leg = 0;
  private dt = 0;
  private lastCall = -1e9;
  private started = false;
  private saleN = 0;
  private saleSeen = -1e9;
  private readonly stool: [number, number];
  private readonly head: Point = { x: 0, y: 0, z: 0 };
  private readonly exHead: Point = { x: 0, y: 0, z: 0 };

  constructor(env: PeopleEnv) {
    this.env = env;
    this.look = dress('vendor', 7313, { sex: 'm', hat: 'krama' });
    // (an old blue work shirt, its sleeves pushed up; dark trousers; a red-checked krama round his head)
    const c = this.look.colors;
    c[SLOT.top] = c[SLOT.sleeveL] = c[SLOT.sleeveR] = 0x56789a;
    c[SLOT.foreL] = c[SLOT.foreR] = c[SLOT.skin];
    c[SLOT.hips] = c[SLOT.thigh] = c[SLOT.shin] = 0x2c3240;
    c[SLOT.accent] = 0xb8322c;
    c[SLOT.accent2] = 0xf0ece0;
    c[SLOT.sole] = 0x3a3a3a;
    this.a = new Actor(env.crowd, this.look, env.ground);
    this.actors.push(this.a);
    this.stool = shopToWorld(SHOP_STOOL.x, SHOP_STOOL.z);
    SHOP_MECHANIC.ready = true;
  }

  private floor(x: number, z: number): number {
    const f = this.env.ground.field;
    const y = this.env.ground.at(x, z, f.heightAt(x, z) + 1);
    return Number.isFinite(y) ? y : f.heightAt(x, z);
  }

  private headAt = (): Point => {
    const a = this.a;
    const k = this.env.crowd.scale(a.i) / 1.4;
    this.head.x = a.x;
    this.head.y = a.y + HEAD_SIT * k;
    this.head.z = a.z;
    return this.head;
  };

  /** He is at the shop's card, or has just sold him a bicycle. */
  private serving(now: number): boolean {
    return SHOP_MECHANIC.wanted || BROWSE.shop === BIKE_SHOP_ID || (SALE.shop === BIKE_SHOP_ID && now - this.saleSeen < 3);
  }

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    const a = this.a;
    this.bubble.update(dt, f.camera, f.roam !== 'overview');
    const step = this.pace.step(dt, viewDist(f, this.stool[0], this.stool[1]));
    if (step < 0) {
      SHOP_MECHANIC.here = SHOP_MECHANIC.atStall = false;
      if (a.shown) a.hide();
      return;
    }
    if (SALE.n !== this.saleN) {
      this.saleN = SALE.n;
      if (SALE.shop === BIKE_SHOP_ID) this.saleSeen = now;
    }
    if (step === 0 && a.shown) return;
    dt = step;
    this.dt = dt;
    const open = shopOpen(f.clock);
    // ── First out: on his stool in the shop's hours, else away ──
    if (!this.started) {
      this.started = true;
      if (open) {
        a.warp(this.stool[0], this.floor(this.stool[0], this.stool[1]), this.stool[1], shopYaw(SHOP_STOOL.face));
        a.show();
        this.job = 'sit';
      }
    }
    if (open && this.job === 'away') {
      // (morning: in along the village street from the east)
      const [x, z] = WAY_HOME[WAY_HOME.length - 1];
      a.warp(x, this.floor(x, z), z, 0);
      a.show();
      this.job = 'arrive';
      this.leg = WAY_HOME.length - 2;
    } else if (!open && this.job === 'sit' && !this.serving(now)) {
      this.job = 'leave';
      this.leg = 0;
    }
    if (ex) {
      this.exHead.x = ex.x;
      this.exHead.y = ex.y + 1.9;
      this.exHead.z = ex.z;
    }
    const exNear = !!ex && Math.hypot(ex.x - a.x, ex.z - a.z) < CALL_NEAR;
    switch (this.job) {
      case 'away':
        if (a.shown) a.hide();
        break;
      case 'arrive':
      case 'leave': {
        a.pose(POSE.stand, now);
        a.carry(0, now);
        a.lookAt(null);
        a.avoid(this.env.traffic, this.name);
        const home = this.job === 'arrive' && this.leg < 0;
        const tx = home ? this.stool[0] : WAY_HOME[this.leg][0];
        const tz = home ? this.stool[1] : WAY_HOME[this.leg][1];
        a.goTo(tx, tz, WALK);
        a.face(null);
        if (a.dist(tx, tz) < 0.4) {
          if (this.job === 'arrive') {
            if (home) this.job = 'sit';
            else this.leg--;
          } else if (this.leg < WAY_HOME.length - 1) this.leg++;
          else {
            this.job = 'away';
            a.hide();
          }
        }
        break;
      }
      case 'sit':
        this.sit(now, f, exNear);
        break;
    }
    if (this.job !== 'away' && a.shown) a.step(dt, now);
    SHOP_MECHANIC.here = a.shown && open;
    SHOP_MECHANIC.atStall = a.shown && this.job === 'sit' && a.dist(this.stool[0], this.stool[1]) < 0.05;
  }

  /** On his stool: looking out at the street, at him when he is near; now and then a call. */
  private sit(now: number, f: MapFrame, exNear: boolean): void {
    const a = this.a;
    const [sx, sz] = this.stool;
    const face = shopYaw(SHOP_STOOL.face);
    a.avoid(null);
    const d = a.dist(sx, sz);
    if (d > 0.7) {
      a.pose(POSE.stand, now);
      a.goTo(sx, sz, WALK);
      a.face(face);
      return;
    }
    // (the last steps onto his stool: a shuffle, turning to the street)
    if (d > 0.04) {
      a.pose(POSE.stand, now);
      a.shuffle(sx, sz, Math.max(0.02, this.dt * 0.9));
      a.stop(face);
      return;
    }
    a.stop(face);
    a.pose(POSE.stool, now);
    a.carry(0, now);
    a.lookAt(exNear ? this.exHead : null, now + 0.5);
    if (this.env.shot) return;
    if (exNear && !this.serving(now) && now - this.lastCall > CALL_EVERY) {
      this.lastCall = now;
      this.bubble.say('bikeShopCall', this.headAt, 2.6);
      if (f.dt > 0) f.calls.push({ kind: 'vendorCall', x: a.x, y: a.y + 1.2, z: a.z, gain: 0.7, size: 1.6 });
    }
  }

  report(traffic: Traffic): void {
    if (this.a.shown) traffic.add(this.name, this.a.x, this.a.y, this.a.z);
  }
}
