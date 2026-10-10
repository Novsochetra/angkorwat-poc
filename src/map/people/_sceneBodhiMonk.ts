import { BODHI, BODHI_FLICKS, BODHI_PLAN, BODHI_TREE, bodhiToWorld, bodhiYaw, type BodhiCue } from '../roam/_bodhiHooks';
import type { MapFrame } from '../types';
import type { WordKey } from '../ui/lang';
import { Actor, wrap } from './_actor';
import { Bubble } from './_bubble';
import { dress } from './_kinds';
import { CARRY, FEAT, POSE, SLOT, type Look } from './_personModel';
import type { Obstacle, Point, Traffic } from './_routes';
import { Pace, viewDist, type PeopleEnv, type PeopleScene } from './_scene';

/**
 * The village pagoda's head monk (ព្រះចៅអធិការ), who gives the explorer the bodhi
 * sapling and blesses the tree when it is planted (roam/_bodhi*.ts; the link
 * `BODHI.monk`: roam/_bodhiHooks.ts). An elder in a saffron robe.
 *
 * His day (`idle`): by day he sweeps the grass on the pagoda's rise west of the
 * terrace, between the hall and where the bodhi stands (a monk's morning work, the
 * long Khmer broom); at night he sits there in meditation by the tree's ring of
 * stones, facing out; at dawn, once the tree is grown, he sits under it.
 * Roaming gives him cues:
 *
 * - `notice`: the sapling is ready for him and he has come near: the monk stops,
 *   turns to him and nods (a monk does not wave nor call out);
 * - `talk`: he speaks first ("សុខសប្បាយទេ ញោម? …"), standing before him;
 * - `give`: he holds the sapling out in both hands (`POSE.give`: the black nursery
 *   bag, the parcel), "អាត្មាមានកូនពោធិ៍មួយដើម…";
 * - `taken`: his hands empty, he nods to the explorer's sampeah;
 * - `show`: he points to the ring of stones: "សូមដាំវានៅត្រង់រង្វង់ថ្មនោះ…";
 * - `come`: he walks to his place beside the tree (`BODHI_PLAN.monk`) as the
 *   explorer plants it, and waits there, the sprig in his hand;
 * - `chant`: palms together, he chants the blessing over the tree and the one
 *   kneeling before it (the sound is roaming's: audio/_bless.ts `blessChant`);
 * - `sprinkle`: he raises the sprig and flicks the lustral water over them;
 * - `words`: the blessing in Khmer ("សូមឲ្យដើមពោធិ៍នេះលូតលាស់…");
 * - `done`: a nod, and back to his day.
 *
 * He writes where he is into `BODHI.monk` each step (`ready` once built). One
 * person, stepped only while the camera is within 300 m. Shots: as the cues set
 * by the URL (`bodhi=talk`, `bodhi=plant:<s>`), his words over him.
 */

const NEAR = 90;
const HIDE = 300;
/** His pace walking (m/s: an old monk's unhurried walk). */
const WALK = 0.7;
/** Where the bubble sits over him (m over his feet at the drawn scale 1.4). */
const HEAD = 2.75;
/** He looks back at the explorer while this near (m, after `notice`). */
const WATCH = 22;
/** The nod (`POSE.nod`) lasts this long before he stands easy (s). */
const NOD = 1.6;
/** The drops of a flick: how many, how long they fly (s), their size (m), gravity; their colour. */
const DROPS = 8;
const DROP_FLY = 0.45;
const DROP_W = 0.034;
const G = 9.8;
const DROP_C = 0xe8f6ff;
/**
 * The sapling he holds out (`give`): its black nursery bag in his hands, the earth on top, the stem and a few leaves
 * (the people's things: the person model's own parcel is too small to read). Where his hands are in `POSE.give`
 * (m, his frame at the drawn scale 1.4: ahead, up), the bag's size (m).
 */
const SAPLING = { ahead: 0.58, up: 1.2, bag: [0.24, 0.24, 0.24] as const, stem: 0.38 } as const;
const SAPLING_SLOTS = 7;
const SAPLING_C = { bag: 0x1e1e22, earth: 0x4a3626, stem: 0x7c7052, leaf: [0x58983a, 0x4c8c32, 0x63a443, 0x7e8c3c] } as const;
/** The sprig's tip at a flick (m, his frame at the drawn scale 1.4: ahead, to his right, up). */
const TIP = { ahead: 0.62, right: 0.28, up: 1.95 } as const;
/** Dawn (the map's clock): the monks sit in meditation under the grown tree. */
const DAWN = { from: 0.72, to: 0.86 } as const;
/** His things: the sprig (its stem, leaves, the lotus bud), the bag of the sapling. */
const SPRIG = { stem: 0x6f8f3a, leaf: 0x4f9a3c, bud: 0xec8fb0 } as const;
const BAG = 0x26262a;

const EX: Point = { x: 0, y: 0, z: 0 };
const KNEEL = { x: 0, z: 0 };
/** A fixed random number (0‥1) for drop `k`, part `u`. */
const hashf = (k: number, u: number): number => {
  const s = Math.sin(k * 127.1 + u * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const TREE: Point = { x: BODHI_TREE.x, y: 0, z: BODHI_TREE.z };

type Wear = 'broom' | 'plain' | 'give' | 'sprig';

export class BodhiMonk implements PeopleScene {
  readonly name = 'bodhi';
  readonly actors: Actor[] = [];
  private readonly a: Actor;
  private readonly looks: Record<Wear, Look>;
  private readonly pace = new Pace(NEAR, HIDE);
  private readonly bubble = new Bubble();
  private readonly env: PeopleEnv;
  /** The cue last seen (its number) and since when (the people's clock). */
  private seen = -1;
  private since = 0;
  private cue: BodhiCue = 'idle';
  private wearing: Wear = 'broom';
  /** Sweeping: where he heads round the grass, and when he turns next. */
  private wander = 0;
  private next = 0;
  private started = false;
  private readonly sweepAt: { x: number; z: number };
  private readonly sitAt: { x: number; z: number };
  private readonly blessAt: { x: number; z: number };
  private readonly faceAt: { x: number; z: number };
  private readonly ringAt = { x: BODHI_TREE.x, z: BODHI_TREE.z };
  /** The water drops (the people's things), and whether they show. */
  private readonly drops: number;
  private dropsOn = false;
  /** The sapling in his hands (the people's things), and whether it shows. */
  private readonly sapling: number;
  private saplingOn = false;

  constructor(env: PeopleEnv) {
    this.env = env;
    // An elder (the head monk), sweeping with the long broom; his other looks: hands free, the sapling in its bag
    // held out (the parcel, in black), the sprig for the lustral water.
    const broom = dress('monk', 1093, { carry: CARRY.broom });
    const plain: Look = { ...broom, carry: CARRY.none, feats: broom.feats.filter((f) => f !== FEAT.broom) };
    const gc = [...plain.colors];
    gc[SLOT.prop2] = BAG;
    const give: Look = { ...plain, colors: gc, feats: [...plain.feats, FEAT.parcel] };
    const sc = [...plain.colors];
    sc[SLOT.wood] = SPRIG.stem;
    sc[SLOT.prop2] = SPRIG.leaf;
    sc[SLOT.prop] = SPRIG.bud;
    const sprig: Look = { ...plain, colors: sc, carry: CARRY.torch, feats: [...plain.feats, FEAT.sprig] };
    this.looks = { broom, plain, give, sprig };
    this.a = new Actor(env.crowd, broom, env.ground).avoid(env.traffic, this.name);
    this.actors.push(this.a);
    this.sweepAt = bodhiToWorld(BODHI_PLAN.sweep.x, BODHI_PLAN.sweep.z);
    this.sitAt = bodhiToWorld(BODHI_PLAN.sit.x, BODHI_PLAN.sit.z);
    this.blessAt = bodhiToWorld(BODHI_PLAN.monk.x, BODHI_PLAN.monk.z);
    this.faceAt = bodhiToWorld(BODHI_PLAN.monk.faceX, BODHI_PLAN.monk.faceZ);
    this.drops = env.things.alloc(DROPS);
    for (let k = 0; k < DROPS; k++) env.things.paint(this.drops + k, DROP_C, 0.35);
    env.things.hide(this.drops, DROPS);
    this.sapling = env.things.alloc(SAPLING_SLOTS);
    env.things.paint(this.sapling, SAPLING_C.bag);
    env.things.paint(this.sapling + 1, SAPLING_C.earth);
    env.things.paint(this.sapling + 2, SAPLING_C.stem);
    for (let k = 3; k < SAPLING_SLOTS; k++) env.things.paint(this.sapling + k, SAPLING_C.leaf[k - 3]);
    env.things.hide(this.sapling, SAPLING_SLOTS);
    BODHI.monk.ready = true;
  }

  private wear(which: Wear): void {
    if (this.wearing === which) return;
    this.wearing = which;
    const l = this.looks[which];
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
    this.hideDrops();
    this.showSapling(false);
    BODHI.monk.shown = false;
  }

  /** He sits now (his own day): at night, and at dawn under the grown tree. */
  private sits(f: MapFrame): boolean {
    if (f.night > 0.55) return true;
    const c = f.clock - Math.floor(f.clock);
    return BODHI.grown && c >= DAWN.from && c < DAWN.to;
  }

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    const m = BODHI.monk;
    const a = this.a;
    this.bubble.update(dt, f.camera, f.roam !== 'overview');
    const step = this.pace.step(dt, viewDist(f, this.sweepAt.x, this.sweepAt.z));
    if (step < 0) {
      this.hideAll();
      return;
    }
    // A new cue from roaming.
    if (m.n !== this.seen) {
      this.seen = m.n;
      this.since = now;
      this.cue = m.cue;
      this.onCue(f);
    }
    if (step === 0 && a.shown) return;
    dt = step;
    if (!this.started || !a.shown) {
      // (first out: at his place now — the grass by day, by the tree at night or at dawn; a cue's own place in a still)
      this.started = true;
      const p = this.cue === 'come' || this.cue === 'chant' || this.cue === 'sprinkle' || this.cue === 'words' ? this.blessAt : this.cue === 'idle' && this.sits(f) ? this.sitAt : this.sweepAt;
      a.warp(p.x, this.floor(p.x, p.z), p.z, bodhiYaw(0));
      a.show();
    }
    EX.x = ex ? ex.x : m.exX;
    EX.y = (ex ? ex.y : m.exY) + 1.9;
    EX.z = ex ? ex.z : m.exZ;
    TREE.y = a.y + 0.6;
    const t = now - this.since;
    const toHim = Math.atan2(EX.x - a.x, EX.z - a.z);
    a.tilt(0);
    switch (this.cue) {
      case 'idle':
        this.idle(now, f);
        break;
      case 'notice':
        // (stops, turns to him, a nod; then keeps an eye on him while he is near)
        a.stop(toHim);
        this.wear('broom');
        a.carry(1, now);
        a.pose(t < NOD ? POSE.nod : POSE.stand, now);
        a.lookAt(EX, now + 1);
        if (ex && t > NOD && Math.hypot(ex.x - a.x, ex.z - a.z) > WATCH) this.cue = 'idle';
        break;
      case 'talk':
        a.stop(toHim);
        this.wear('plain');
        a.pose(POSE.stand, now);
        a.lookAt(EX, now + 1);
        break;
      case 'give':
        a.stop(toHim);
        this.wear('give');
        a.pose(POSE.give, now);
        a.lookAt(EX, now + 1);
        break;
      case 'taken':
        a.stop(toHim);
        this.wear('plain');
        a.pose(t < NOD + 0.4 ? POSE.nod : POSE.stand, now);
        a.lookAt(EX, now + 1);
        break;
      case 'show': {
        // (turned to the ring, his right arm out to it; his eyes go from it to him)
        this.wear('plain');
        a.stop(Math.atan2(this.ringAt.x - a.x, this.ringAt.z - a.z));
        a.pose(t < 3.2 ? POSE.point : POSE.stand, now);
        TREE.y = this.floor(this.ringAt.x, this.ringAt.z) + 0.2;
        a.lookAt(t < 2 ? TREE : EX, now + 1);
        break;
      }
      case 'come': {
        // To his place beside the tree, then turned to it and to the one before it; the sprig in his hand.
        this.wear('sprig');
        a.carry(0, now);
        a.pose(POSE.stand, now);
        if (a.dist(this.blessAt.x, this.blessAt.z) > 0.25) {
          a.goTo(this.blessAt.x, this.blessAt.z, WALK);
          a.face(null);
          a.lookAt(null);
        } else {
          a.stop(Math.atan2(this.faceAt.x - a.x, this.faceAt.z - a.z));
          a.lookAt(EX, now + 1);
        }
        break;
      }
      case 'chant':
        // Palms together, his eyes down, chanting (his voice is roaming's sound).
        this.atPlace(now);
        this.wear('plain');
        a.pose(POSE.sampeah, now);
        a.lookAt(null);
        a.tilt(0.25);
        break;
      case 'sprinkle': {
        // The sprig raised and flicked: water over the sapling and the one kneeling (a quick dip of the hand at each).
        this.atPlace(now);
        this.wear('sprig');
        a.pose(POSE.stand, now);
        a.lookAt(TREE, now + 1);
        let dip = false;
        for (const fl of BODHI_FLICKS) if (t >= fl - 0.22 && t < fl + 0.05) dip = true;
        a.carry(dip ? 0.55 : 1, now);
        this.drawDrops(t);
        break;
      }
      case 'words':
        this.atPlace(now);
        this.wear('plain');
        a.carry(0, now);
        a.pose(POSE.stand, now);
        a.tilt(0);
        a.lookAt(EX, now + 1);
        break;
      case 'done':
        this.wear('plain');
        a.stop(toHim);
        a.pose(t < NOD ? POSE.nod : POSE.stand, now);
        a.lookAt(EX, now + 1);
        if (t > NOD + 1.2) {
          this.cue = 'idle';
          this.next = 0;
        }
        break;
      default:
        break;
    }
    if (this.cue !== 'sprinkle') this.hideDrops();
    a.step(dt, now);
    this.showSapling(this.cue === 'give' && a.shown);
    m.shown = a.shown;
    m.x = a.x;
    m.y = a.y;
    m.z = a.z;
    m.yaw = a.yaw;
  }

  /** The bagged sapling held out in his hands (after his step: where he stands now), or put away. */
  private showSapling(on: boolean): void {
    const th = this.env.things;
    if (!on) {
      if (this.saplingOn) th.hide(this.sapling, SAPLING_SLOTS);
      this.saplingOn = false;
      return;
    }
    this.saplingOn = true;
    const a = this.a;
    const k = this.env.crowd.scale(a.i) / 1.4;
    const fx = Math.sin(a.yaw);
    const fz = Math.cos(a.yaw);
    const x = a.x + fx * SAPLING.ahead * k;
    const y = a.y + SAPLING.up * k;
    const z = a.z + fz * SAPLING.ahead * k;
    const [bw, bh, bd] = SAPLING.bag;
    th.put(this.sapling, x, y, z, bw, bh, bd, a.yaw + 0.4);
    th.put(this.sapling + 1, x, y + bh / 2 + 0.005, z, bw * 0.86, 0.03, bd * 0.86, a.yaw + 0.4);
    th.put(this.sapling + 2, x, y + bh / 2 + SAPLING.stem / 2, z, 0.025, SAPLING.stem, 0.025, 0);
    // (four small bunches of leaves round the stem's upper half, the last at its tip)
    for (let q = 0; q < 4; q++) {
      const ang = a.yaw + q * 1.7 + 0.3;
      const out = q === 3 ? 0 : 0.08;
      const ly = y + bh / 2 + SAPLING.stem * (0.45 + q * 0.18);
      const sz = q === 3 ? 0.16 : 0.13;
      th.put(this.sapling + 3 + q, x + Math.sin(ang) * out, ly, z + Math.cos(ang) * out, sz, sz * 0.8, sz, ang + 0.785);
    }
  }

  private hideDrops(): void {
    if (!this.dropsOn) return;
    this.dropsOn = false;
    this.env.things.hide(this.drops, DROPS);
  }

  /**
   * The drops of each flick (`t` s into the sprinkling), from the sprig's tip: half to the sapling, half to the face of
   * the one kneeling before it (worked out from the time since the flick: no state, a still shows its moment).
   */
  private drawDrops(t: number): void {
    const th = this.env.things;
    let tau = -1;
    for (const fl of BODHI_FLICKS) if (t >= fl && t < fl + DROP_FLY * 1.1) tau = t - fl;
    if (tau < 0) {
      this.hideDrops();
      return;
    }
    this.dropsOn = true;
    const a = this.a;
    const k = this.env.crowd.scale(a.i) / 1.4;
    const fx = Math.sin(a.yaw);
    const fz = Math.cos(a.yaw);
    // (his right: −x of his frame)
    const px = a.x + (fx * TIP.ahead - fz * TIP.right) * k;
    const py = a.y + TIP.up * k;
    const pz = a.z + (fz * TIP.ahead + fx * TIP.right) * k;
    const kneel = bodhiToWorld(BODHI_PLAN.kneel.x, BODHI_PLAN.kneel.z, KNEEL);
    for (let i = 0; i < DROPS; i++) {
      const h = (u: number) => hashf(i, u);
      // (the even ones to the sapling's leaves, the odd ones to his face and shoulders)
      const toTree = i % 2 === 0;
      const gx = toTree ? BODHI_TREE.x : kneel.x;
      const gz = toTree ? BODHI_TREE.z : kneel.z;
      const gy = a.y + (toTree ? 0.45 : 1.55) * k;
      const fly = DROP_FLY * (0.75 + 0.35 * h(4));
      const u = tau / fly;
      if (u >= 1) {
        th.hide(this.drops + i);
        continue;
      }
      const vx = (gx - px + (h(1) - 0.5) * 0.8) / fly;
      const vy = (gy - py + (h(2) - 0.5) * 0.5) / fly + 0.5 * G * fly;
      const vz = (gz - pz + (h(3) - 0.5) * 0.8) / fly;
      const x = px + vx * tau;
      const y = py + vy * tau - 0.5 * G * tau * tau;
      const z = pz + vz * tau;
      // (a short streak along its flight)
      const dy = vy - G * tau;
      const sp = Math.sqrt(vx * vx + dy * dy + vz * vz) || 1;
      const l = 0.12;
      th.segment(this.drops + i, x, y, z, x - (vx / sp) * l, y - (dy / sp) * l, z - (vz / sp) * l, DROP_W);
    }
  }

  /** At his place beside the tree for the blessing (there at once in a still), turned to the tree and to him. */
  private atPlace(now: number): void {
    const a = this.a;
    if (a.dist(this.blessAt.x, this.blessAt.z) > 0.4) {
      if (this.env.shot) a.warp(this.blessAt.x, this.floor(this.blessAt.x, this.blessAt.z), this.blessAt.z, 0);
      else {
        a.goTo(this.blessAt.x, this.blessAt.z, WALK);
        a.face(null);
        return;
      }
    }
    a.stop(Math.atan2(this.faceAt.x - a.x, this.faceAt.z - a.z));
    void now;
  }

  /** What a cue starts: his words. */
  private onCue(f: MapFrame): void {
    void f;
    switch (this.cue) {
      case 'talk':
        this.say('gardenBodhiMonkHello', 3.0);
        break;
      case 'give':
        this.say('gardenBodhiMonkGive', 4.2);
        break;
      case 'show':
        this.say('gardenBodhiMonkShow', 4.0);
        break;
      case 'chant':
        this.say('blessPali1', 4.0);
        break;
      case 'sprinkle':
        this.say('blessPali2', 3.2);
        break;
      case 'words':
        this.say('gardenBodhiMonkBless', 4.0);
        break;
      case 'idle':
        this.next = 0;
        this.a.tilt(0);
        break;
      default:
        break;
    }
  }

  /** His own day: sweeping the grass by day; sitting in meditation at night (and at dawn under the grown tree). */
  private idle(now: number, f: MapFrame): void {
    const a = this.a;
    a.tilt(0);
    if (this.sits(f)) {
      this.wear('plain');
      a.lookAt(null);
      const { x, z } = this.sitAt;
      if (a.dist(x, z) > 0.3) {
        a.pose(POSE.stand, now);
        a.goTo(x, z, WALK);
        a.face(null);
      } else {
        a.stop(bodhiYaw(0));
        a.pose(POSE.sit, now);
        // (eyes down: meditation)
        a.tilt(0.35);
      }
      return;
    }
    // (sweeping: he works his way round the grass, turning now and then; in a still he stays at its middle)
    const r = BODHI_PLAN.sweep.r;
    const { x: cx, z: cz } = this.sweepAt;
    this.wear('broom');
    a.lookAt(null);
    a.carry(1, now);
    a.pose(POSE.sweep, now);
    if (this.env.shot) {
      if (a.dist(cx, cz) > 0.3) a.goTo(cx, cz, WALK);
      else a.stop(wrap(bodhiYaw(Math.PI * 0.75)));
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
