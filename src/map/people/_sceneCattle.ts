import { CATTLE_OBSTACLES, TRADER, TRADER_AWAY, TRADER_BUY, TRADER_STOOL, traderOpen, traderToWorld, traderYaw } from '../cattle/plan';
import type { MapFrame } from '../types';
import { Actor } from './_actor';
import { Bubble } from './_bubble';
import { dress } from './_kinds';
import { FEAT, POSE, SLOT, type Look } from './_personModel';
import type { Obstacle, Point, Traffic } from './_routes';
import { Pace, viewDist, type PeopleEnv, type PeopleScene } from './_scene';

/**
 * The cattle trader (ឈ្មួញគោ) on the Kulen foot meadow (his place:
 * roam/_cattlePlace.ts, where: cattle/plan.ts; what he sells and buys:
 * roam/_cattle.ts): a lean village man of fifty, a red-and-white krama wound
 * round his head (never a conical hat), a faded work shirt with the sleeves
 * rolled, dark trousers, flip-flops.
 *
 * By day (`TRADER_HOURS`) he sits on his low stool under the tamarind,
 * looking out at the trail and his animals, at him when he comes near; now
 * and then he calls to him ("គោល្អៗ បង! ចង់មើលទេ?", a bubble and a seller's
 * voice). At his stool with the card open (`TRADER.visit`) he talks with him;
 * a cow bought, he gets up, holds out both hands (the rope handed over: `give`)
 * and thanks him ("អរគុណបង! ថែវាឲ្យល្អណា"), then sits again; a cow sold, he
 * holds out the money the same way. Outside his hours he walks home down the
 * trail to the village street (`TRADER_AWAY`), and back after dawn; someone
 * waiting at his stool in his hours (`TRADER.wanted`) brings him back to it.
 *
 * He also puts the cattle (his and the explorer's: `CATTLE_OBSTACLES`) into the
 * people's traffic, so walkers go round them.
 */

const NEAR = 60;
const HIDE = 280;
const WALK = 0.85;
const HURRY = 1.25;
/** He calls out this near (m), at most once in this long (s). */
const CALL_NEAR = 8;
const CALL_EVERY = 80;
/** Standing up to hand something over (s). */
const GIVE_S = 2.2;
/** His head over his feet (m at the drawn scale), seated and standing. */
const HEAD_SIT = 1.95;
const HEAD_STAND = 2.7;

type Job = 'away' | 'arrive' | 'sit' | 'give' | 'leave';

export class CattleTrader implements PeopleScene {
  readonly name = 'cattle';
  readonly actors: Actor[] = [];
  private readonly a: Actor;
  private readonly look: Look;
  private readonly pace = new Pace(NEAR, HIDE);
  private readonly bubble = new Bubble();
  private job: Job = 'away';
  private leg = 0;
  private started = false;
  private lastCall = -1e9;
  private cueN = 0;
  private giveAt = -1e9;
  private readonly stool: [number, number];
  private readonly buy: [number, number];
  private readonly head: Point = { x: 0, y: 0, z: 0 };
  private readonly exHead: Point = { x: 0, y: 0, z: 0 };
  private readonly cattle: Obstacle[] = [];

  constructor(private readonly env: PeopleEnv) {
    this.look = dress('villager', 7311, { sex: 'm', age: 'old', hat: 'krama' });
    const c = this.look.colors;
    c[SLOT.top] = c[SLOT.sleeveL] = c[SLOT.sleeveR] = 0x8a7a5a;
    c[SLOT.hips] = c[SLOT.thigh] = 0x34302c;
    c[SLOT.accent] = 0xb8322c;
    c[SLOT.accent2] = 0xf0ece0;
    if (!this.look.feats.includes(FEAT.kramaHead)) this.look.feats.push(FEAT.kramaHead);
    this.a = new Actor(env.crowd, this.look, env.ground);
    this.actors.push(this.a);
    this.stool = traderToWorld(TRADER_STOOL.x, TRADER_STOOL.z);
    this.buy = traderToWorld(TRADER_BUY.x, TRADER_BUY.z);
    for (let i = 0; i < 16; i++) this.cattle.push({ x: 0, y: 0, z: 0, r: 1, vx: 0, vz: 0, who: 'animal' });
    TRADER.ready = true;
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

  private hideAll(): void {
    TRADER.here = TRADER.atStool = false;
    if (this.a.shown) this.a.hide();
  }

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    const a = this.a;
    this.bubble.update(dt, f.camera, f.roam !== 'overview');
    const step = this.pace.step(dt, viewDist(f, this.stool[0], this.stool[1]));
    if (step < 0) {
      this.hideAll();
      return;
    }
    if (step === 0 && a.shown) return;
    dt = step;
    const open = traderOpen(f.clock);
    if (!this.started) {
      this.started = true;
      if (open) {
        a.warp(this.stool[0], this.floor(this.stool[0], this.stool[1]), this.stool[1], traderYaw(TRADER_STOOL.face));
        a.show();
        this.job = 'sit';
      }
    }
    if (open && this.job === 'away') {
      // (morning: up the trail from the village street)
      const [x, z] = TRADER_AWAY[TRADER_AWAY.length - 1];
      a.warp(x, this.floor(x, z), z, Math.PI);
      a.show();
      this.job = 'arrive';
      this.leg = TRADER_AWAY.length - 2;
    } else if (!open && (this.job === 'sit' || this.job === 'give')) {
      this.job = 'leave';
      this.leg = 0;
    }
    if (ex) {
      this.exHead.x = ex.x;
      this.exHead.y = ex.y + 1.9;
      this.exHead.z = ex.z;
    }
    const exNear = !!ex && Math.hypot(ex.x - a.x, ex.z - a.z) < CALL_NEAR;
    // The add-on's cues: a cow bought or sold, he gets up and hands it over (the rope, the money) and thanks him.
    if (TRADER.cueN !== this.cueN) {
      this.cueN = TRADER.cueN;
      if ((TRADER.cue === 'bought' || TRADER.cue === 'sold') && this.job === 'sit') {
        this.job = 'give';
        this.giveAt = now;
        if (!this.env.shot) this.bubble.say(TRADER.cue === 'bought' ? 'cattleThanks' : 'cattleSoldSay', this.headAt, 2.6);
      }
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
        const toStool = this.job === 'arrive' && this.leg < 0;
        const tx = toStool ? this.stool[0] : TRADER_AWAY[this.leg][0];
        const tz = toStool ? this.stool[1] : TRADER_AWAY[this.leg][1];
        a.goTo(tx, tz, this.job === 'arrive' && TRADER.wanted ? HURRY : WALK);
        a.face(null);
        if (a.dist(tx, tz) < 0.4) {
          if (this.job === 'arrive') {
            if (this.leg < 0) this.job = 'sit';
            else this.leg--;
          } else if (this.leg < TRADER_AWAY.length - 1) this.leg++;
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
      case 'give': {
        // (up off his stool, turned to him at his stool, both hands held out with a little bow)
        a.avoid(null);
        a.stop(a.yawTo(this.buy[0], this.buy[1]));
        a.pose(POSE.give, now);
        a.lookAt(ex ? this.exHead : null, now + 0.5);
        if (now - this.giveAt > GIVE_S) this.job = 'sit';
        break;
      }
    }
    if (this.job !== 'away' && a.shown) a.step(dt, now);
    TRADER.here = a.shown && open;
    TRADER.atStool = a.shown && open && (this.job === 'sit' || this.job === 'give') && a.dist(this.stool[0], this.stool[1]) < 0.6;
  }

  /** On his stool: looking out, at him when near or talking with him; now and then a call. */
  private sit(now: number, f: MapFrame, exNear: boolean): void {
    const a = this.a;
    const [sx, sz] = this.stool;
    a.avoid(null);
    const d = a.dist(sx, sz);
    if (d > 0.7) {
      a.pose(POSE.stand, now);
      a.goTo(sx, sz, TRADER.wanted ? HURRY : WALK);
      a.face(traderYaw(TRADER_STOOL.face));
      return;
    }
    if (d > 0.04) {
      a.pose(POSE.stand, now);
      a.shuffle(sx, sz, 0.03);
      a.stop(traderYaw(TRADER_STOOL.face));
      return;
    }
    a.stop(traderYaw(TRADER_STOOL.face));
    a.pose(POSE.stool, now);
    a.carry(0, now);
    a.lookAt(exNear || TRADER.visit ? this.exHead : null, now + 0.5);
    if (this.env.shot) return;
    if (exNear && !TRADER.visit && now - this.lastCall > CALL_EVERY && f.roam !== 'overview') {
      this.lastCall = now;
      this.bubble.say('cattleCall', this.headAt, 2.8);
      if (f.dt > 0) f.calls.push({ kind: 'vendorCall', x: a.x, y: a.y + 1.2, z: a.z, gain: 0.7, size: 1.8 });
    }
  }

  report(traffic: Traffic): void {
    if (this.a.shown) traffic.add(this.name, this.a.x, this.a.y, this.a.z);
    // (the cattle, his and the explorer's: animals in everyone's way)
    const O = CATTLE_OBSTACLES;
    for (let i = 0; i < O.n && i < this.cattle.length; i++) {
      const o = this.cattle[i];
      o.x = O.x[i];
      o.y = O.y[i];
      o.z = O.z[i];
      o.r = O.r[i];
      traffic.list.push(o);
    }
  }
}
