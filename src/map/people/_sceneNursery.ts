import { Vector3 } from 'three';
import { NURSERY_AISLES, NURSERY_AWAY, NURSERY_BEDS, NURSERY_CAN, NURSERY_SELLER, NURSERY_SHOP, NURSERY_STOOL, nurseryOpen, nurseryToWorld, nurseryYaw } from '../hamlet/_nurseryPlan';
import { BROWSE, SALE } from '../shop';
import type { MapFrame } from '../types';
import { Actor, wrap } from './_actor';
import { Bubble } from './_bubble';
import { dress } from './_kinds';
import { FEAT, POSE, SLOT, type Look } from './_personModel';
import type { Obstacle, Point, Traffic } from './_routes';
import { Pace, viewDist, type PeopleEnv, type PeopleScene } from './_scene';
import { Rig, RigDef } from './_things';

/**
 * The woman who keeps the seedling nursery by the Kulen foot trail
 * (hamlet/_nursery.ts, where: hamlet/_nurseryPlan.ts): a village woman of
 * middle age in her palm-leaf hat, a krama round her neck, a work blouse
 * and a dark sarong.
 *
 * By day she sits on her low stool behind her table, looking out at the
 * trail (at him when he comes near: now and then she calls out to him,
 * "ទិញកូនឈើទេ បង?", a bubble and a seller's voice). Every minute or so she
 * gets up, takes her green watering can from beside the stool and waters the
 * beds: slowly along one aisle, the can tipped from her right hand over the
 * bed beside her (a thin stream to the bags), round the back and down the
 * next aisle, then the can back by her stool and she sits again (one round
 * the outer beds, the next the middle one from both sides).
 *
 * He buys or sells there (roam/_gardenShop.ts): the people's seller
 * (people/_saleBack.ts, through shop.ts `BROWSE` and `SALE`) has her look up
 * and ask, turn to him and hand it over; while he is at her table she leaves
 * off watering (the can set down at her feet) and goes on after. Outside her
 * hours (`NURSERY_HOURS`: sunrise to the evening) she walks home down the
 * trail to the village street, and back in the morning; her can stays by the
 * stool.
 *
 * One person and her can (the people's things: a rig, and three boxes for
 * the stream), stepped only while the camera is within 260 m. URL (checks):
 * `nursery=water` she is watering (the stream on), `nursery=water:<0‥1>`
 * that far along her round; otherwise a still has her on her stool.
 */

const NEAR = 60;
const HIDE = 260;
/** Her pace: walking (m/s), along an aisle while she waters, how long she bends to the can. */
const WALK = 0.8;
/** Hurrying back to her table when someone waits at it (m/s). */
const HURRY = 1.25;
const POUR_PACE = 0.28;
const PICK = 0.7;
/** Seconds between rounds of watering (from, plus up to). */
const ROUND_EVERY = [55, 40] as const;
/** She calls out to him this near (m), at most once in this long (s). */
const CALL_NEAR = 7;
const CALL_EVERY = 75;
/** Her head over her feet (m at the drawn scale 1.4), seated. */
const HEAD_STAND = 2.7;
const HEAD_SIT = 1.95;
/** The can, its handle's bar at the origin (where her fist holds it), real size (m; drawn at her scale). */
const GRIP = { y: 0.29, z: -0.02 };
/** The tip of its rose (rig space) and the tilt (radians, front down) while she pours. */
const ROSE: [number, number, number] = [0, 0.31 - GRIP.y, 0.4 - GRIP.z];
const POUR_TILT = 0.85;
const WATER = 0xcfe6ee;

type Job = 'away' | 'arrive' | 'sit' | 'water' | 'leave';

/** A green plastic watering can (rig space: its handle's bar at the origin, the spout to +z). */
function canDef(): RigDef {
  const d = new RigDef();
  const G = 0x2f8a4a;
  const D = 0x27773e;
  const o = (x: number, y: number, z: number): [number, number, number] => [x, y - GRIP.y, z - GRIP.z];
  d.box(o(0, 0.12, 0), [0.17, 0.24, 0.27], G);
  d.box(o(0, 0.245, 0), [0.14, 0.02, 0.2], D);
  d.box(o(0, 0.29, -0.02), [0.035, 0.035, 0.22], D);
  d.box(o(0, 0.26, -0.11), [0.035, 0.07, 0.035], D);
  d.box(o(0, 0.26, 0.07), [0.035, 0.07, 0.035], D);
  d.box(o(0, 0.185, 0.25), [0.03, 0.03, 0.34], G, { rot: [-0.76, 0, 0] });
  d.box(o(0, 0.31, 0.39), [0.075, 0.075, 0.045], D);
  return d;
}

export class NurserySeller implements PeopleScene {
  readonly name = 'nursery';
  readonly actors: Actor[] = [];
  private readonly a: Actor;
  private readonly look: Look;
  private readonly pace = new Pace(NEAR, HIDE);
  private readonly bubble = new Bubble();
  private readonly env: PeopleEnv;
  private readonly can: Rig;
  /** The stream: its two lines (out of the rose, down to the bags) and its splash (slots of the people's things). */
  private readonly stream: number;
  private job: Job = 'away';
  /** Watering: the way (map points, and whether she pours along each leg), the leg she is on, holding the can. */
  private way: { x: number; z: number; pour: boolean }[] = [];
  private leg = 0;
  private holding = false;
  /** This step's length (s). */
  private dt = 0;
  /** Called back to her table in the middle of a round (someone waits there). */
  private back = false;
  private bend = 0;
  private round = 0;
  private nextRound = 0;
  private lastCall = -1e9;
  private started = false;
  private readonly stool: [number, number];
  private readonly canAt: [number, number];
  private readonly hand = { x: 0, y: 0, z: 0 };
  private readonly rose = new Vector3();
  private readonly head: Point = { x: 0, y: 0, z: 0 };
  private readonly exHead: Point = { x: 0, y: 0, z: 0 };
  /** The URL's watering (`nursery=water[:u]`): how far along her round (0‥1), or −1. */
  private readonly shotWater: number;

  constructor(env: PeopleEnv) {
    this.env = env;
    this.look = dress('vendor', 4411, { sex: 'f', hat: 'palm', props: [FEAT.kramaNeck] });
    // (a faded work blouse, a dark sarong: dressed for the earth, not the market)
    const c = this.look.colors;
    c[SLOT.top] = c[SLOT.sleeveL] = c[SLOT.sleeveR] = 0x6a8aa8;
    c[SLOT.hips] = c[SLOT.thigh] = c[SLOT.shin] = 0x2e2a36;
    c[SLOT.accent] = 0xb8322c;
    c[SLOT.accent2] = 0xf0ece0;
    this.a = new Actor(env.crowd, this.look, env.ground);
    this.actors.push(this.a);
    this.can = new Rig(env.things, canDef());
    this.stream = env.things.alloc(3);
    env.things.paint(this.stream, WATER);
    env.things.paint(this.stream + 1, WATER);
    env.things.paint(this.stream + 2, 0xe8f2f4);
    this.stool = nurseryToWorld(NURSERY_STOOL.x, NURSERY_STOOL.z);
    this.canAt = nurseryToWorld(NURSERY_CAN.x, NURSERY_CAN.z);
    NURSERY_SELLER.ready = true;
    const w = env.params.get('nursery');
    this.shotWater = w?.startsWith('water') ? Math.max(0, Math.min(1, Number(w.split(':')[1] ?? 0.3) || 0)) : -1;
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
    this.head.y = a.y + (this.job === 'sit' && a.dist(this.stool[0], this.stool[1]) < 0.3 ? HEAD_SIT : HEAD_STAND) * k;
    this.head.z = a.z;
    return this.head;
  };

  /** He is at her table (the buy card open), or she has just served him. */
  private serving(now: number): boolean {
    return NURSERY_SELLER.wanted || BROWSE.shop === NURSERY_SHOP || (SALE.shop === NURSERY_SHOP && now - this.saleSeen < 3);
  }
  private saleN = 0;
  private saleSeen = -1e9;

  /** The round of watering: from the stool to the can, along the aisles (pouring), round the back, the can back. */
  private planRound(): void {
    const B = NURSERY_BEDS;
    const front = B.z1 + 0.25;
    const back = B.z0 - 0.3;
    const [a1, a2] = NURSERY_AISLES;
    const p = (lx: number, lz: number, pour: boolean) => {
      const [x, z] = nurseryToWorld(lx, lz);
      return { x, z, pour };
    };
    // (round A: down the north aisle, pouring on the north bed at her right, back up the south one onto the south bed;
    // round B the other way: the middle bed from both sides)
    const A = this.round % 2 === 0;
    const first = A ? a2 : a1;
    const second = A ? a1 : a2;
    this.way = [
      { x: this.canAt[0], z: this.canAt[1], pour: false },
      p(first, front, false),
      p(first, back, true),
      p(second, back, false),
      p(second, front, true),
      { x: this.canAt[0], z: this.canAt[1], pour: false },
      { x: this.stool[0], z: this.stool[1], pour: false },
    ];
    this.leg = 0;
    this.back = false;
  }

  private hideAll(): void {
    NURSERY_SELLER.here = NURSERY_SELLER.atTable = false;
    if (this.a.shown) this.a.hide();
    this.env.things.hide(this.stream, 3);
  }

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    const a = this.a;
    this.bubble.update(dt, f.camera, f.roam !== 'overview');
    const step = this.pace.step(dt, viewDist(f, this.stool[0], this.stool[1]));
    if (step < 0) {
      this.hideAll();
      this.can.hide();
      return;
    }
    if (SALE.n !== this.saleN) {
      this.saleN = SALE.n;
      if (SALE.shop === NURSERY_SHOP) this.saleSeen = now;
    }
    if (step === 0 && a.shown) return;
    dt = step;
    this.dt = dt;
    const open = nurseryOpen(f.clock);
    // ── First out: on her stool (or watering, a check's), or away ──
    if (!this.started) {
      this.started = true;
      this.nextRound = now + 20 + ((now * 7.31) % 1) * 20;
      if (open) {
        a.warp(this.stool[0], this.floor(this.stool[0], this.stool[1]), this.stool[1], nurseryYaw(NURSERY_STOOL.face));
        a.show();
        this.job = 'sit';
        if (this.shotWater >= 0) this.startWaterAt(this.shotWater);
      }
    }
    if (open && this.job === 'away') {
      // (morning: in from the village street)
      const [x, z] = NURSERY_AWAY[NURSERY_AWAY.length - 1];
      a.warp(x, this.floor(x, z), z, 0);
      a.show();
      this.job = 'arrive';
      this.leg = NURSERY_AWAY.length - 2;
    } else if (!open && (this.job === 'sit' || this.job === 'water')) {
      this.holding = false;
      this.job = 'leave';
      this.leg = 0;
    }
    const exNear = !!ex && Math.hypot(ex.x - a.x, ex.z - a.z) < CALL_NEAR;
    if (ex) {
      this.exHead.x = ex.x;
      this.exHead.y = ex.y + 1.9;
      this.exHead.z = ex.z;
    }
    switch (this.job) {
      case 'away':
        this.hideAll();
        break;
      case 'arrive':
      case 'leave': {
        a.pose(POSE.stand, now);
        a.carry(0, now);
        a.lookAt(null);
        a.avoid(this.env.traffic, this.name);
        const tx = this.job === 'arrive' && this.leg < 0 ? this.stool[0] : NURSERY_AWAY[this.leg][0];
        const tz = this.job === 'arrive' && this.leg < 0 ? this.stool[1] : NURSERY_AWAY[this.leg][1];
        a.goTo(tx, tz, this.job === 'arrive' && NURSERY_SELLER.wanted ? HURRY : WALK);
        a.face(null);
        if (a.dist(tx, tz) < 0.4) {
          if (this.job === 'arrive') {
            if (this.leg < 0) this.job = 'sit';
            else this.leg--;
          } else if (this.leg < NURSERY_AWAY.length - 1) this.leg++;
          else {
            this.job = 'away';
            this.hideAll();
          }
        }
        break;
      }
      case 'sit':
        this.sit(now, f, exNear);
        break;
      case 'water':
        this.water(dt, now);
        break;
    }
    if (this.job !== 'away' && a.shown) a.step(dt, now);
    this.drawCan(now);
    NURSERY_SELLER.here = a.shown && open;
    NURSERY_SELLER.atTable = a.shown && open && this.job === 'sit' && a.dist(this.stool[0], this.stool[1]) < 0.05;
  }

  /** On her stool behind the table: looking out at the trail, at him when he is near; now and then a call; then the next round of watering. */
  private sit(now: number, f: MapFrame, exNear: boolean): void {
    const a = this.a;
    const [sx, sz] = this.stool;
    a.avoid(null);
    const d = a.dist(sx, sz);
    if (d > 0.7) {
      a.pose(POSE.stand, now);
      a.goTo(sx, sz, WALK);
      a.face(nurseryYaw(NURSERY_STOOL.face));
      return;
    }
    // (the last steps onto her stool: a shuffle, turning to the trail — a walk's own slowing stalls short of it)
    if (d > 0.04) {
      a.pose(POSE.stand, now);
      a.shuffle(sx, sz, Math.max(0.02, this.dt * 0.9));
      a.stop(nurseryYaw(NURSERY_STOOL.face));
      return;
    }
    a.stop(nurseryYaw(NURSERY_STOOL.face));
    a.pose(POSE.stool, now);
    a.carry(0, now);
    a.lookAt(exNear ? this.exHead : null, now + 0.5);
    if (this.env.shot) return;
    if (exNear && !this.serving(now) && now - this.lastCall > CALL_EVERY) {
      this.lastCall = now;
      this.bubble.say('gardenShopCall', this.headAt, 2.6);
      if (f.dt > 0) f.calls.push({ kind: 'vendorCall', x: a.x, y: a.y + 1.2, z: a.z, gain: 0.7, size: 1.6 });
    }
    if (now >= this.nextRound && !this.serving(now)) {
      this.job = 'water';
      this.planRound();
      this.holding = false;
      this.bend = 0;
    }
  }

  /** A check's still: watering, `u` (0‥1) of the way along her round's pouring legs. */
  private startWaterAt(u: number): void {
    this.planRound();
    this.job = 'water';
    this.holding = true;
    // (the pouring legs are 2 and 4: the first half of `u` along leg 2, the second along leg 4)
    const legI = u < 0.5 ? 2 : 4;
    const k = u < 0.5 ? u * 2 : (u - 0.5) * 2;
    const p0 = this.way[legI - 1];
    const p1 = this.way[legI];
    const x = p0.x + (p1.x - p0.x) * k;
    const z = p0.z + (p1.z - p0.z) * k;
    this.a.warp(x, this.floor(x, z), z, Math.atan2(p1.x - p0.x, p1.z - p0.z));
    this.leg = legI;
  }

  /** Along her round: to the can (she bends for it), the aisles (pouring as she goes), the can back, the stool. */
  private water(dt: number, now: number): void {
    const a = this.a;
    a.avoid(null);
    a.carry(0, now);
    a.lookAt(null);
    // (someone waits at her table: she leaves off — the can back by the stool if she has it — and hurries back to it)
    if (this.serving(now) && !this.env.shot && !this.back) {
      this.back = true;
      const stool = { x: this.stool[0], z: this.stool[1], pour: false };
      if (this.holding) this.way = [{ x: this.canAt[0], z: this.canAt[1], pour: false }, stool];
      else this.way = [stool];
      this.leg = 0;
      this.bend = 0;
    }
    const p = this.way[this.leg];
    if (!p) {
      this.job = 'sit';
      this.back = false;
      this.round++;
      this.nextRound = now + ROUND_EVERY[0] + ((now * 3.71) % 1) * ROUND_EVERY[1];
      return;
    }
    a.pose(POSE.stand, now);
    if (this.env.shot) {
      a.stop(a.yaw);
      return;
    }
    const pour = p.pour && this.holding;
    a.goTo(p.x, p.z, pour ? POUR_PACE : this.back ? HURRY : WALK);
    a.face(null);
    if (a.dist(p.x, p.z) > 0.2) return;
    // At the can's place (going, or coming back): she bends a moment, and picks it up or puts it down.
    if (p.x === this.canAt[0] && p.z === this.canAt[1]) {
      a.stop();
      this.bend += dt;
      if (this.bend < (this.back ? PICK * 0.6 : PICK)) return;
      this.bend = 0;
      this.holding = !this.holding;
    }
    this.leg++;
  }

  /** The can: in her right hand (tipped while she pours, the stream to the bags), or on the ground by her stool. */
  private drawCan(now: number): void {
    const a = this.a;
    const k = a.shown ? this.env.crowd.scale(a.i) : 1.4;
    const things = this.env.things;
    const inHand = a.shown && this.job === 'water' && this.holding && !(this.serving(now) && !this.env.shot);
    if (inHand) {
      this.env.crowd.handAt(a.i, this.hand);
      const p = this.way[this.leg];
      const pouring = !!p && p.pour;
      this.can.place(this.hand.x, this.hand.y, this.hand.z, a.yaw, pouring ? POUR_TILT : 0.12, 0, k);
      this.can.write();
      if (pouring) {
        // (the water arcs out of the rose and falls on the bags: a short spout forward, then down; a splash)
        const r = this.can.point(ROSE[0], ROSE[1], ROSE[2], this.rose);
        const fy = this.floor(r.x, r.z) + 0.22;
        const sx = Math.sin(a.yaw);
        const sz = Math.cos(a.yaw);
        const mx = r.x + sx * 0.12;
        const mz = r.z + sz * 0.12;
        const my = r.y - 0.08;
        things.segment(this.stream, r.x, r.y, r.z, mx, my, mz, 0.06);
        things.segment(this.stream + 1, mx, my, mz, mx + sx * 0.06, fy, mz + sz * 0.06, 0.05);
        things.put(this.stream + 2, mx + sx * 0.06, fy + 0.01, mz + sz * 0.06, 0.2, 0.025, 0.2, a.yaw);
      } else things.hide(this.stream, 3);
      return;
    }
    things.hide(this.stream, 3);
    // (on the ground: by her stool, or at her feet while she serves him)
    let x = this.canAt[0];
    let z = this.canAt[1];
    let yaw = nurseryYaw(-0.4);
    if (a.shown && this.job === 'water' && this.holding) {
      x = a.x + Math.cos(a.yaw) * -0.45;
      z = a.z - Math.sin(a.yaw) * -0.45;
      yaw = a.yaw;
    }
    this.can.place(x, this.floor(x, z) + GRIP.y * k, z, wrap(yaw), 0, 0, k);
    this.can.write();
  }

  report(traffic: Traffic): void {
    if (this.a.shown) traffic.add(this.name, this.a.x, this.a.y, this.a.z);
  }
}
