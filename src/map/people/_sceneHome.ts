import { HOME, HOME_GRAN, homeToWorld, type GranCue } from '../hamlet/_homePlan';
import type { MapFrame } from '../types';
import type { WordKey } from '../ui/lang';
import { Actor, wrap } from './_actor';
import { Bubble } from './_bubble';
import { dress } from './_kinds';
import { CARRY, FEAT, POSE, SLOT, type Look } from './_personModel';
import type { Obstacle, Point, Traffic } from './_routes';
import { Pace, viewDist, type PeopleEnv, type PeopleScene } from './_scene';

/**
 * The grandmother who keeps the key to the empty stilt house at the
 * sugar-palm village's north-east edge (hamlet/_home.ts; his once she gives
 * him the key: roam/_home*.ts). An old woman of the village, grey hair in a
 * bun, a krama round her head, a plain blouse and a dark sarong.
 *
 * While the house is nobody's, she looks after it: by day she sweeps its
 * yard west of the stair with her broom (the village grandmothers' `sweep`,
 * wandering a little); after dark she sits on her mat by the stair's foot
 * beside her little oil lamp (the house draws the lamp, lit while she waits).
 * The roaming add-on gives her cues (`HOME.gran`, hamlet/_homePlan.ts):
 *
 * - `call`: he came near the first time — she stops, turns to him, waves and
 *   calls (a bubble: "ចៅ! មកនេះបន្តិចមក!", a voice), then keeps an eye on him;
 * - `talk`: she turns to him: "ផ្ទះនេះនៅទំនេរយូរហើយ…";
 * - `give`: she holds the key out to him in both hands (`POSE.give`, a little
 *   brass key on a red cord: the `parcel` in brass): "ផ្ទះនេះជារបស់ចៅហើយ…";
 * - `taken`: her hands empty, she bows back to his sampeah;
 * - `leave`: "ទៅ ចូលមើលផ្ទះទៅចៅ!", and she walks home along the trail
 *   (`HOME_GRAN.away`) and is gone (`gone`): the house is his.
 *
 * She writes where she is into `HOME.gran` each step (`ready` once built).
 * One person, stepped only while the camera is within 300 m. Shots: as the
 * cues set by the URL (`home=key`, `home=call`), her words over her.
 */

const NEAR = 90;
const HIDE = 300;
/** Her pace walking (m/s), turning to him (s it takes to settle), how long the wave lasts (s), how near he must stay for her to keep an eye on him (m). */
const WALK = 0.75;
const WAVE = 1.8;
const WATCH = 25;
/** Where the bubble sits over her (m over her feet at the drawn scale 1.4). */
const HEAD = 2.75;
/** A woman's voice for the greeting call (audio/people.ts `hello`: the greeter's height). */
const VOICE = 1.55;

const EX: Point = { x: 0, y: 0, z: 0 };

export class HomeGran implements PeopleScene {
  readonly name = 'home';
  readonly actors: Actor[] = [];
  private readonly a: Actor;
  private readonly look: Look;
  private readonly keyLook: Look;
  private readonly pace = new Pace(NEAR, HIDE);
  private readonly bubble = new Bubble();
  private readonly env: PeopleEnv;
  /** The cue last seen (its number) and since when (the people's clock). */
  private seen = -1;
  private since = 0;
  private cue: GranCue = 'idle';
  /** Sweeping: where she heads round the yard, and when she turns next. */
  private wander = 0;
  private next = 0;
  private leg = 0;
  private wearing: 'base' | 'key' = 'base';
  private started = false;
  private sweepAt: [number, number];
  private sitAt: [number, number];

  constructor(env: PeopleEnv) {
    this.env = env;
    this.look = dress('villager', 3203, { sex: 'f', age: 'old', hat: 'krama', carry: CARRY.broom });
    // (her blouse plain and pale, her sarong dark: an old woman's)
    const c = this.look.colors;
    c[SLOT.top] = c[SLOT.sleeveL] = c[SLOT.sleeveR] = 0xe8e0d0;
    c[SLOT.hips] = c[SLOT.thigh] = c[SLOT.shin] = 0x2a2430;
    // (holding the key out: the parcel, small and brass, on a red cord; no broom)
    const kc = [...c];
    kc[SLOT.prop2] = 0xd8b04a;
    kc[SLOT.accent2] = 0xc0302a;
    this.keyLook = { ...this.look, colors: kc, carry: CARRY.none, feats: [...this.look.feats.filter((f) => f !== FEAT.broom), FEAT.parcel] };
    this.a = new Actor(env.crowd, this.look, env.ground).avoid(env.traffic, this.name);
    this.actors.push(this.a);
    this.sweepAt = homeToWorld(HOME_GRAN.sweep.x, HOME_GRAN.sweep.z);
    this.sitAt = homeToWorld(HOME_GRAN.sit.x, HOME_GRAN.sit.z);
    HOME.gran.ready = true;
  }

  private wear(which: 'base' | 'key'): void {
    if (this.wearing === which) return;
    this.wearing = which;
    const l = which === 'key' ? this.keyLook : this.look;
    this.a.look = l;
    this.env.crowd.dress(this.a.i, l);
  }

  private say(key: WordKey, seconds = 3.4): void {
    const a = this.a;
    const k = this.env.crowd.scale(a.i) / 1.4;
    this.bubble.say(key, () => ({ x: a.x, y: a.y + HEAD * k, z: a.z }), seconds);
  }

  private hideAll(): void {
    if (this.a.shown) this.a.hide();
    HOME.gran.shown = false;
  }

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    const g = HOME.gran;
    const a = this.a;
    this.bubble.update(dt, f.camera, f.roam !== 'overview');
    // Gone: the house is his (kept from an earlier visit, or she has walked home).
    if ((HOME.owned && g.cue !== 'taken' && g.cue !== 'leave' && this.cue !== 'leave') || this.cue === 'gone') {
      this.hideAll();
      return;
    }
    const step = this.pace.step(dt, viewDist(f, this.sweepAt[0], this.sweepAt[1]));
    if (step < 0) {
      this.hideAll();
      return;
    }
    // A new cue from roaming.
    if (g.n !== this.seen) {
      this.seen = g.n;
      this.since = now;
      this.cue = g.cue;
      this.onCue(f);
    }
    if (step === 0 && a.shown) return;
    dt = step;
    const night = f.night > 0.55;
    if (!this.started || !a.shown) {
      // (first out: at her place now — the yard by day, her mat by night)
      this.started = true;
      const [x, z] = night && this.cue === 'idle' ? this.sitAt : this.sweepAt;
      a.warp(x, this.floor(x, z), z, night ? wrap(Math.atan2(this.sweepAt[0] - x, this.sweepAt[1] - z)) : 0);
      a.show();
    }
    EX.x = ex ? ex.x : g.exX;
    EX.y = (ex ? ex.y : g.exY) + 1.9;
    EX.z = ex ? ex.z : g.exZ;
    const t = now - this.since;
    const toHim = Math.atan2(EX.x - a.x, EX.z - a.z);
    switch (this.cue) {
      case 'idle':
        this.idle(now, night);
        break;
      case 'call': {
        // (stops, turns to him, waves; then keeps an eye on him while he is near)
        a.stop(toHim);
        this.wear('base');
        a.pose(t < WAVE ? POSE.wave : POSE.stand, now);
        a.carry(t < WAVE ? 0 : 1, now);
        a.lookAt(EX, now + 1);
        if (ex && Math.hypot(ex.x - a.x, ex.z - a.z) > WATCH && t > WAVE) {
          this.cue = 'idle';
          this.next = 0;
        }
        break;
      }
      case 'talk':
        a.stop(toHim);
        this.wear('base');
        a.pose(POSE.stand, now);
        a.carry(1, now);
        a.lookAt(EX, now + 1);
        break;
      case 'give':
        a.stop(toHim);
        this.wear('key');
        a.pose(POSE.give, now);
        a.lookAt(EX, now + 1);
        break;
      case 'taken':
        a.stop(toHim);
        this.wear('base');
        a.carry(0, now);
        // (a nod, then she bows back to his sampeah)
        a.pose(t > 0.5 && t < 2.6 ? POSE.sampeah : POSE.stand, now);
        a.lookAt(EX, now + 1);
        break;
      case 'leave': {
        this.wear('base');
        a.carry(1, now);
        a.pose(POSE.stand, now);
        // (a moment's smile at him, then home along the trail)
        if (t < 1.2) {
          a.stop(toHim);
          a.lookAt(EX, now + 1);
          break;
        }
        const way = HOME_GRAN.away[Math.min(this.leg, HOME_GRAN.away.length - 1)];
        const [wx, wz] = homeToWorld(way.x, way.z);
        a.goTo(wx, wz, WALK);
        a.face(null);
        a.lookAt(null);
        if (a.dist(wx, wz) < 0.5) {
          if (this.leg < HOME_GRAN.away.length - 1) this.leg++;
          else {
            this.cue = 'gone';
            this.hideAll();
            return;
          }
        }
        break;
      }
      default:
        break;
    }
    a.step(dt, now);
    g.shown = a.shown;
    g.x = a.x;
    g.y = a.y;
    g.z = a.z;
    g.yaw = a.yaw;
  }

  /** What a cue starts: her words, a voice. */
  private onCue(f: MapFrame): void {
    const a = this.a;
    switch (this.cue) {
      case 'call':
        this.say('homeCall', 3.2);
        if (!this.env.shot) f.calls.push({ kind: 'hello', x: a.x, y: a.y + 1.4, z: a.z, gain: 0.7, size: VOICE });
        break;
      case 'talk':
        this.say('homeEmpty', 2.8);
        break;
      case 'give':
        this.say('homeYours', 3.8);
        break;
      case 'leave':
        this.leg = 0;
        this.say('homeGoIn', 2.6);
        break;
      case 'idle':
        this.next = 0;
        break;
      default:
        break;
    }
  }

  /** Her own day: sweeping the yard by day, on her mat by her lamp at night. */
  private idle(now: number, night: boolean): void {
    const a = this.a;
    this.wear('base');
    a.lookAt(null);
    if (night) {
      const [x, z] = this.sitAt;
      if (a.dist(x, z) > 0.3) {
        a.pose(POSE.stand, now);
        a.carry(1, now);
        a.goTo(x, z, WALK);
        a.face(null);
      } else {
        a.stop(Math.atan2(this.sweepAt[0] - x, this.sweepAt[1] - z));
        a.pose(POSE.sit, now);
        a.carry(0, now);
      }
      return;
    }
    // (sweeping: she works her way round the yard, turning now and then; in a still she stays at its middle)
    const r = HOME_GRAN.sweep.r;
    const [cx, cz] = this.sweepAt;
    a.carry(1, now);
    a.pose(POSE.sweep, now);
    if (this.env.shot) {
      a.stop(0.6);
      return;
    }
    if (now >= this.next) {
      this.wander += 1.3 + ((now * 7.3) % 1) * 1.6;
      this.next = now + 4 + ((now * 3.1) % 1) * 3;
    }
    const tx = cx + Math.sin(this.wander) * r * 0.7;
    const tz = cz + Math.cos(this.wander) * r * 0.7;
    if (a.dist(tx, tz) > 0.25) a.goTo(tx, tz, 0.25);
    else a.stop();
    a.face(null);
  }

  private floor(x: number, z: number): number {
    const y = this.env.ground.at(x, z, this.env.ground.field.heightAt(x, z) + 1);
    return Number.isFinite(y) ? y : this.env.ground.field.heightAt(x, z);
  }

  report(traffic: Traffic): void {
    if (this.a.shown) traffic.add(this.name, this.a.x, this.a.y, this.a.z);
  }
}
