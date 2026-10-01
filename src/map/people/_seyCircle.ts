import { hash3 } from '../../voxel/random';
import { aim, flightAt, flightDown, ME, newPoint, SEY, SEY_HEEL, SEY_R, SEY_SNAP, SEY_SPOT, seyEvent, seyHours, type SeyFlight, type SeyPoint } from '../sey';
import type { MapFrame } from '../types';
import type { WordKey } from '../ui/lang';
import { TAU, type Actor } from './_actor';
import { POSE, type Pose } from './_personModel';
import type { Ground, Point } from './_routes';
import { viewDist } from './_scene';
import { Rig, RigDef, type Things } from './_things';

/**
 * The children of the sugar-palm village kicking the sey (ទាត់សី) in the
 * yard north of the sala, by day (`seyHours`; not in a downpour): four of
 * them in a circle (`SEY_SPOT`, `SEY_R`), the sey arcing from one to the
 * next, each meeting it with a swing of the leg as it comes down (the step
 * cycle driven to peak at the touch: `kickStep`); now and then one misses,
 * the others laugh, the nearest runs for it, bends to pick it up, walks back
 * and tosses it up to start again. In the morning they come out from their
 * houses, at dusk (or in heavy rain) they walk home.
 *
 * The explorer joins in (roam/_sey.ts, through `SEY`, sey.ts): the circle
 * opens a place for him (the sey caught, the children stepping round to five
 * places), then the sey comes to him about every other kick; his kicks go on
 * to a child, his misses fall at his feet. When he leaves they close the
 * circle again (four places, his spot between two of them).
 *
 * The sey is the people's things (`Things`): a rig of a dozen boxes (a base
 * of rubber discs and a washer, four feathers fanned out, white with pink and
 * green tips), turned base first along its way and spinning slowly; one draw
 * with the rest. A shot with `sey=` holds a still moment (`tableau`).
 */

const KIDS = 4;
/** A child's leg starts its swing this long before it meets the sey (s), at this stride (the gait's walk share), and holds it this long after. */
const KID_LEAD = 0.3;
const KID_KICK_W = 1.45;
const KID_FOLLOW = 0.12;
/** Where a child meets the sey: this high (m), this far in front of the feet. */
const KID_KICK_H = 0.42;
const KID_REACH = 0.42;
/** Paces (m/s): to a new place in the circle, running for the dropped sey, and home. */
const WALK = 1.3;
const FETCH = 1.9;
const HOMEWARD = 1.1;
/** Bending down to pick it up (s); the sey comes up into the hand halfway. */
const PICK = 0.8;
/** It fell: the laugh at once, then a child goes for it after this (s). */
const MISS_WAIT = 0.7;
/** Everyone in place with the sey in a hand: the holder waits this long (s), holding it out, then tosses it up. */
const START_WAIT = 0.8;
const TOSS_T = 0.62;
/** The children miss one in this many while they play by themselves (none while he plays). */
const KID_MISS = 0.07;
/** Landing, the sey hops on this far toward the circle's middle (m), over this long (s), this high. */
const HOP = 0.45;
const HOP_T = 0.3;
const HOP_H = 0.08;
/** The sey's base sits this high over the ground when it lies there (m: half its height, at the drawn scale). */
const REST_Y = 0.04;
/** The sey is drawn this much over its true size (≈ 17 cm: a little over the people's scale, so it reads at a kick's distance). */
const SEY_SIZE = 1.75;
/** How quickly the sey turns base first along its way (1/s), and spins about itself at speed (rad/s). */
const TURN = 14;
const SPIN = 7;

/** With him in the circle, the children stand this far round from his place (radians; + is his right): the gap on his right wider, where his camera looks from. */
const WITH_ME = [100, 165, 230, 295].map((d) => (d * Math.PI) / 180);
/** The children's words are said only with the camera this near the child (m), and him this near when he only watches. */
const HEARD = 35;
const WATCH = 22;
/** What a child calls out after his good kick now and then. */
const CHEERS: readonly WordKey[] = ['seyNice', 'seyGood', 'seyAgain'];

/** One child of the circle. */
interface Kid {
  a: Actor;
  /** Their place: the angle round the middle, the spot (m). */
  th: number;
  x: number;
  y: number;
  z: number;
  /** At their place, walking to it, running for the sey, picking it up, going home, gone home (hidden). */
  state: 'slot' | 'walk' | 'fetch' | 'pick' | 'home' | 'gone';
  /** When the state began (the game's clock). */
  since: number;
  /** Cheering until (the game's clock). */
  cheer: number;
  /** Their house (where they go home to and come out from). */
  hx: number;
  hz: number;
}

const P: Point = { x: 0, y: 0, z: 0 };

export class SeyCircle {
  readonly kids: Kid[] = [];
  private readonly rig: Rig;
  /** Where the sey is: flying (`SEY.flight`), lying on the ground, or in a child's hand. */
  private mode: 'fly' | 'ground' | 'hand' = 'hand';
  private holder = 0;
  /** Where it lies, and when it fell (the game's clock). */
  private gx = 0;
  private gy = 0;
  private gz = 0;
  private fellAt = 0;
  /** Where it touched down before its little hop (m). */
  private hx = 0;
  private hz = 0;
  /** The child running for it, or −1. */
  private fetcher = -1;
  /** When everyone was in place with the sey in a hand (−1: not yet). */
  private readyAt = -1;
  /** When the flight now comes down to the ground if nobody kicks it; it falls on (a miss) once past its kick. */
  private groundT = 0;
  private falling = false;
  /** The child it goes to will catch it (the places are changing), or −1. */
  private catching = -1;
  /** The child it goes to misses this one (the children's own game). */
  private whiff = false;
  /** His good kick: when his foot meets it (−1: none), and whether it was the heel; the last kick read. */
  private sendAt = -1;
  private heel = false;
  private kickRead = 0;
  /** The next flight goes to him (the first after the circle opened, the first after his miss). */
  private toMe = false;
  /** The circle as it was laid out: with him in it, and where he stood when it opened or closed. */
  private withMe = false;
  private base = 0.35;
  private out = false;
  private shown = false;
  private tabled = '';
  /** This step's frame and where he is (for who may hear the children: `talk`). */
  private frame: MapFrame | null = null;
  private ex: Point | null = null;
  private tabledAt = 0;
  /** The circle's ground (m). */
  private y = 0;
  /** The sey's axis (base → feathers, eased) and spin. */
  private ax = 0;
  private ay = 1;
  private az = 0;
  private spin = 0;
  private readonly p: SeyPoint = newPoint();
  private readonly look: Point = { x: 0, y: 0, z: 0 };

  constructor(
    kids: Actor[],
    things: Things,
    private readonly ground: Ground,
    homes: readonly { x: number; z: number }[],
    /** A child's words in a bubble over them (roaming only). */
    private readonly say: (key: WordKey, a: Actor) => void,
    /** Someone's words are showing now (the people's one bubble). */
    private readonly speaking: () => boolean,
  ) {
    kids.slice(0, KIDS).forEach((a, k) => {
      const h = homes[k % Math.max(1, homes.length)] ?? { x: SEY_SPOT.x, z: SEY_SPOT.z + 12 };
      this.kids.push({ a, th: 0, x: 0, y: 0, z: 0, state: 'gone', since: 0, cheer: -1, hx: h.x, hz: h.z });
    });
    this.rig = new Rig(things, seyRig());
  }

  /** The circle's step: `seen` the camera is near enough to see them walk. */
  update(dt: number, now: number, f: MapFrame, first: boolean, rain: boolean, ex: Point | null): void {
    const S = SEY;
    this.frame = f;
    this.ex = ex;
    const still = S.shot !== '';
    if (first || !this.shown) {
      this.y = this.groundY(SEY_SPOT.x, SEY_SPOT.z, this.ground.field.heightAt(SEY_SPOT.x, SEY_SPOT.z) + 1);
      S.y = this.y;
    }
    const out = still || (seyHours(f.clock) && !rain);
    const near = viewDist(f, SEY_SPOT.x, SEY_SPOT.z) < 70;
    if (!out) {
      if (this.out) this.goHome(near && !first);
      this.out = false;
      S.out = S.open = false;
      S.flight.on = false;
      this.rig.hide();
      for (const k of this.kids) this.homeStep(k, dt, now, near);
      this.shown = true;
      return;
    }
    if (!this.out || first || !this.shown) this.comeOut(near && !first && this.shown);
    this.out = true;
    this.shown = true;
    S.out = true;
    if (still) return this.tableau(now, f);
    this.tabled = '';
    if (!S.paused) S.t += dt;
    const t = S.t;
    // He joined or left: the sey is caught (or picked up) and the children step round to their new places.
    if (S.joined !== this.withMe) this.respace(t);
    S.open = this.withMe && this.allIn();

    // ── The sey ──
    const fl = S.flight;
    if (this.mode === 'fly') {
      // (his kick: a good one sends it on as his foot meets it; an early or late one lets it fall)
      if (fl.to === ME && S.kick.n !== this.kickRead) {
        this.kickRead = S.kick.n;
        if (S.kick.flight === fl.n && (S.kick.result === 'good' || S.kick.result === 'perfect')) {
          this.sendAt = Math.max(t, S.kick.at);
          this.heel = S.kick.result === 'perfect';
        }
      }
      if (this.sendAt >= 0 && t >= this.sendAt && fl.to === ME) {
        const at = this.sendAt;
        this.sendAt = -1;
        flightAt(fl, at, this.p);
        this.launch(at, ME, this.p.x, this.p.y, this.p.z, this.heel ? 'heel' : 'kick', f);
        this.cheers(t, this.heel, f);
      } else if (fl.to >= 0 && !this.falling && t >= fl.t1) {
        // A child's turn: kick it on (the leg has swung up to it), catch it while the places change, or miss it.
        const k = fl.to;
        const kid = this.kids[k];
        if (this.catching === k || kid.state !== 'slot') {
          this.catching = -1;
          this.mode = 'hand';
          this.holder = k;
          this.readyAt = -1;
          seyEvent('catch', fl.ex, fl.ey, fl.ez, 0.5);
        } else if (this.whiff) this.falling = true;
        else this.launch(fl.t1, k, fl.ex, fl.ey, fl.ez, 'kick', f);
      } else if (fl.to === ME && t > fl.t1 + 0.4) this.falling = true;
      if (this.mode === 'fly' && t >= this.groundT && (this.falling || fl.to === ME)) this.land(f, t);
    } else if (this.mode === 'ground') {
      if (this.fetcher < 0 && t - this.fellAt > MISS_WAIT) this.sendFetcher(t);
    } else if (this.mode === 'hand') {
      const h = this.kids[this.holder];
      const all = this.allIn();
      if (h.state === 'slot' && all && (!S.joined || S.ready)) {
        if (this.readyAt < 0) this.readyAt = t;
        if (t - this.readyAt > START_WAIT) this.toss(t, f);
      } else this.readyAt = -1;
    }

    // ── The children ──
    this.lookPoint();
    for (let k = 0; k < this.kids.length; k++) this.kidStep(k, dt, now, t);
    this.place(dt, t);
  }

  /** Lay the places out again (he joined or left): a flight to a child is caught, then they walk round. */
  private respace(t: number): void {
    const S = SEY;
    this.withMe = S.joined;
    if (!S.joined) this.base = S.angle + Math.PI / KIDS;
    this.layout();
    const fl = S.flight;
    if (this.mode === 'fly') {
      if (fl.to >= 0 && !this.falling) this.catching = fl.to;
      // (he left as it came to him: it falls, a child picks it up)
      if (fl.to === ME && this.sendAt < 0) this.falling = true;
    }
    for (const k of this.kids) if (k.state === 'slot' || k.state === 'walk') this.set(k, 'walk', t);
    this.toMe = S.joined;
    this.readyAt = -1;
    // (the child nearest his place says so: come and play, or bye-bye)
    this.talk(S.joined ? 'seyCome' : 'seyBye', this.kids[this.nearest(SEY_SPOT.x + Math.sin(S.angle) * SEY_R, SEY_SPOT.z + Math.cos(S.angle) * SEY_R)].a);
  }

  /**
   * The children's places round the middle: four spread round, or round him (his at `SEY.angle`), the gap on his
   * right wider (`WITH_ME`: the camera looks across him from there), in the order they stand.
   */
  private layout(): void {
    const n = this.withMe ? KIDS + 1 : KIDS;
    const from = this.withMe ? SEY.angle : this.base;
    // (in the order they stand round from his place: nobody crosses the circle)
    const order = this.kids.map((k, i) => ({ i, d: (((this.angleOf(k) - from) % TAU) + TAU) % TAU })).sort((p, q) => p.d - q.d);
    order.forEach((o, j) => {
      const k = this.kids[o.i];
      k.th = from + (this.withMe ? WITH_ME[j] : (j * TAU) / n);
      k.x = SEY_SPOT.x + Math.sin(k.th) * SEY_R;
      k.z = SEY_SPOT.z + Math.cos(k.th) * SEY_R;
      k.y = this.groundY(k.x, k.z, this.y + 0.5);
    });
  }

  private angleOf(k: Kid): number {
    return k.a.shown ? Math.atan2(k.a.x - SEY_SPOT.x, k.a.z - SEY_SPOT.z) : k.th;
  }

  /** Out in the morning (or after the rain): at their places (`walk`: from their houses), the sey in a hand. */
  private comeOut(walk: boolean): void {
    this.withMe = SEY.joined;
    if (!this.out) {
      this.kids.forEach((k, i) => (k.th = this.base + (i * TAU) / KIDS));
    }
    this.layout();
    const t = SEY.t;
    for (const k of this.kids) {
      if (walk && (k.state === 'gone' || k.state === 'home')) {
        if (!k.a.shown) {
          k.a.warp(k.hx, this.groundY(k.hx, k.hz, this.y + 3), k.hz, 0);
          k.a.show();
        }
        this.set(k, 'walk', t);
      } else {
        k.a.warp(k.x, k.y, k.z, this.faceIn(k));
        k.a.show();
        k.a.pose(POSE.stand, 0);
        this.set(k, 'slot', t);
      }
    }
    this.mode = 'hand';
    this.holder = Math.floor(hash3(Math.floor(t), 3, 61) * KIDS) % KIDS;
    this.fetcher = -1;
    this.readyAt = -1;
    this.catching = -1;
    this.falling = false;
    this.sendAt = -1;
    this.kickRead = SEY.kick.n;
    SEY.flight.on = false;
  }

  /** Dusk, or rain: they say so (if he plays) and walk home (`walk`), or are gone at once. */
  private goHome(walk: boolean): void {
    const S = SEY;
    if (S.joined && walk) this.talk('seyHome', this.kids[0].a);
    for (const k of this.kids) {
      if (walk && k.a.shown) this.set(k, 'home', S.t);
      else {
        if (k.a.shown) k.a.hide();
        k.state = 'gone';
      }
    }
    this.mode = 'hand';
    S.flight.on = false;
  }

  private homeStep(k: Kid, dt: number, now: number, near: boolean): void {
    if (k.state !== 'home') return;
    const a = k.a;
    a.goTo(k.hx, k.hz, HOMEWARD);
    a.face(null);
    a.pose(POSE.stand, now);
    a.lookAt(null);
    a.step(dt, now);
    if (a.dist(k.hx, k.hz) < 0.6 || !near || a.dist(SEY_SPOT.x, SEY_SPOT.z) > 30) {
      a.hide();
      k.state = 'gone';
    }
  }

  // ── Flights ──────────────────────────────────────────────────────────────

  /** Kick the sey on from (x, y, z) at `t` by `from` (a child or him): to him (about every other kick) or another child. */
  private launch(t: number, from: number, x: number, y: number, z: number, kind: SeyFlight['kind'], f: MapFrame): void {
    const S = SEY;
    const fl = S.flight;
    const n = fl.n + 1;
    const h = hash3(n, 7, 63);
    let to: number;
    if (from !== ME && S.joined && S.open && S.ready && (this.toMe || hash3(n, 9, 65) < 0.55)) to = ME;
    else if (from === ME) to = Math.floor(h * KIDS) % KIDS;
    else to = (from + 1 + Math.floor(h * (KIDS - 1))) % KIDS;
    this.toMe = false;
    let ex: number;
    let ey: number;
    let ez: number;
    let T: number;
    if (to === ME) {
      fl.foot = hash3(n, 11, 67) < 0.7 ? 'R' : 'L';
      const s = fl.foot === 'R' ? S.footR : S.footL;
      ex = s.x;
      ey = s.y;
      ez = s.z;
      // (quicker as his run goes on)
      T = (1.45 + 0.2 * h) * (1 - 0.22 * Math.min(1, S.streak / 24));
    } else {
      const k = this.kids[to];
      const i = Math.sin(k.th);
      const j = Math.cos(k.th);
      const side = hash3(n, 13, 69) < 0.7 ? -1 : 1;
      ex = k.x - i * KID_REACH + j * side * 0.1;
      ey = k.y + KID_KICK_H;
      ez = k.z - j * KID_REACH - i * side * 0.1;
      T = kind === 'heel' ? 1.75 : from === ME ? 1.3 + 0.2 * h : 1.15 + 0.3 * h;
    }
    aim(fl, t, t + T, x, y, z, ex, ey, ez);
    fl.from = from;
    fl.to = to;
    fl.kind = kind;
    this.mode = 'fly';
    this.falling = false;
    this.catching = -1;
    this.whiff = to >= 0 && !S.joined && hash3(n, 15, 71) < KID_MISS;
    this.groundT = flightDown(fl, this.groundY(ex, ez, ey) + REST_Y);
    if (kind !== 'toss') seyEvent('thock', x, y, z, kind === 'heel' ? 1 : from === ME ? 0.85 : 0.6);
    seyEvent('flutter', x, y, z, kind === 'toss' ? 0.3 : 0.6);
    void f;
  }

  /** The holder tosses it up to their own foot, to start again. */
  private toss(t: number, f: MapFrame): void {
    const k = this.kids[this.holder];
    const s = k.a.crowd.scale(k.a.i);
    const i = Math.sin(k.th);
    const j = Math.cos(k.th);
    this.hold(k, s, P);
    const fl = SEY.flight;
    aim(fl, t, t + TOSS_T, P.x, P.y, P.z, k.x - i * KID_REACH, k.y + KID_KICK_H, k.z - j * KID_REACH);
    fl.from = fl.to = this.holder;
    fl.kind = 'toss';
    fl.foot = 'R';
    this.mode = 'fly';
    this.falling = false;
    this.catching = -1;
    this.whiff = false;
    this.groundT = flightDown(fl, k.y + REST_Y);
    this.readyAt = -1;
    seyEvent('flutter', P.x, P.y, P.z, 0.3);
    void f;
  }

  /** It came down on the ground: it lies there; a laugh (his miss, or a child's), then a child goes for it. */
  private land(f: MapFrame, t: number): void {
    const S = SEY;
    const fl = S.flight;
    flightAt(fl, this.groundT, this.p);
    // (it hops on a little toward the middle: off his feet, where a child can reach it)
    this.hx = this.p.x;
    this.hz = this.p.z;
    const dx = SEY_SPOT.x - this.hx;
    const dz = SEY_SPOT.z - this.hz;
    const d = Math.hypot(dx, dz) || 1;
    const hop = Math.min(HOP, d * 0.5);
    this.gx = this.hx + (dx / d) * hop;
    this.gz = this.hz + (dz / d) * hop;
    this.gy = this.groundY(this.gx, this.gz, this.p.y + 0.4) + REST_Y;
    this.fellAt = t;
    this.mode = 'ground';
    this.fetcher = -1;
    fl.on = false;
    seyEvent('tap', this.gx, this.gy, this.gz, 0.8);
    // (his miss: the child across laughs, "oops!"; a child's own: another one laughs)
    if (S.joined || this.whiff) {
      const who = this.kids[this.farthest(this.gx, this.gz)];
      this.talk('seyOops', who.a);
      who.cheer = t + 0.9;
      if (f.dt > 0) f.calls.push({ kind: 'laugh', x: who.a.x, y: who.a.y + 1.2, z: who.a.z, gain: 0.8 });
      seyEvent('laugh', who.a.x, who.a.y + 1.2, who.a.z, 0.8);
    }
    this.whiff = false;
    this.falling = false;
    this.toMe = S.joined;
  }

  /**
   * A child's words, only where they are heard: the camera near the child (`HEARD`) and he playing, or standing by
   * watching (`WATCH`); never over words showing already (the people share one bubble: a guide's or a seller's
   * nearer words stay). The laughter and the claps are sounds placed on the map, heard as near
   * as they are.
   */
  private talk(key: WordKey, a: Actor): void {
    const f = this.frame;
    if (!f || f.roam === 'overview') return;
    const c = f.camera.position;
    if (Math.hypot(a.x - c.x, a.z - c.z) > HEARD) return;
    const ex = this.ex;
    if (!SEY.joined && (!ex || Math.hypot(ex.x - a.x, ex.z - a.z) > WATCH)) return;
    if (this.speaking()) return;
    this.say(key, a);
  }

  /** The nearest child standing at their place to (x, z) (anyone, if nobody is). */
  private nearest(x: number, z: number): number {
    let best = 0;
    let bd = Infinity;
    for (let pass = 0; pass < 2 && bd === Infinity; pass++)
      for (let i = 0; i < this.kids.length; i++) {
        const k = this.kids[i];
        if (pass === 0 && k.state !== 'slot') continue;
        const d = (k.x - x) ** 2 + (k.z - z) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
    return best;
  }

  /** The child farthest from (x, z) (across the circle). */
  private farthest(x: number, z: number): number {
    let best = 0;
    let bd = -1;
    for (let i = 0; i < this.kids.length; i++) {
      const d = (this.kids[i].x - x) ** 2 + (this.kids[i].z - z) ** 2;
      if (d > bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  /** A child runs for the sey lying on the ground. */
  private sendFetcher(t: number): void {
    const i = this.nearest(this.gx, this.gz);
    this.fetcher = i;
    this.set(this.kids[i], 'fetch', t);
  }

  /** After his good kick: a cheer now and then (the heel's always), the children's arms up. */
  private cheers(t: number, heel: boolean, f: MapFrame): void {
    const S = SEY;
    const n = S.flight.n;
    const to = S.flight.to;
    // (not the one it goes to: they have to kick it)
    const pick = (salt: number) => (to + 1 + Math.floor(hash3(n, salt, 73) * (KIDS - 1))) % KIDS;
    if (heel) {
      for (let i = 0; i < KIDS; i++) if (i !== to) this.kids[i].cheer = t + 1.1;
      const k = this.kids[pick(1)];
      this.talk('seyWow', k.a);
      seyEvent('cheer', k.a.x, k.a.y + 1.2, k.a.z, 1);
      if (f.dt > 0) f.calls.push({ kind: 'laugh', x: k.a.x, y: k.a.y + 1.2, z: k.a.z, gain: 0.6 });
      return;
    }
    // (every good kick: a child's arms up and a few claps; words now and then, and at 5, 10, 20…)
    const streak = S.streak;
    const milestone = streak > 0 && (streak === 5 || streak === 10 || streak % 10 === 0);
    const k = this.kids[pick(2)];
    k.cheer = t + 0.9;
    seyEvent('cheer', k.a.x, k.a.y + 1.2, k.a.z, milestone ? 0.7 : 0.35);
    if (milestone || hash3(n, 3, 75) < 0.3) this.talk(milestone ? 'seyOn' : CHEERS[Math.floor(hash3(n, 5, 77) * CHEERS.length) % CHEERS.length], k.a);
  }

  // ── The children ─────────────────────────────────────────────────────────

  /** Everyone standing at their place. */
  private allIn(): boolean {
    for (const k of this.kids) if (k.state !== 'slot') return false;
    return true;
  }

  private set(k: Kid, state: Kid['state'], t: number): void {
    k.state = state;
    k.since = t;
  }

  /** The way a child at their place faces: in, to the middle. */
  private faceIn(k: Kid): number {
    return Math.atan2(SEY_SPOT.x - k.x, SEY_SPOT.z - k.z);
  }

  /** Where they watch: where the sey is going (where it is to be kicked), or where it lies. */
  private lookPoint(): void {
    const L = this.look;
    const fl = SEY.flight;
    if (this.mode === 'fly') {
      L.x = fl.ex;
      L.y = fl.ey + 0.2;
      L.z = fl.ez;
    } else if (this.mode === 'ground') {
      L.x = this.gx;
      L.y = this.gy;
      L.z = this.gz;
    } else {
      const h = this.kids[this.holder].a;
      L.x = h.x;
      L.y = h.y + 0.9;
      L.z = h.z;
    }
  }

  private kidStep(i: number, dt: number, now: number, t: number): void {
    const k = this.kids[i];
    const a = k.a;
    const fl = SEY.flight;
    switch (k.state) {
      case 'gone':
        return;
      case 'home':
        return this.homeStep(k, dt, now, true);
      case 'walk': {
        a.goTo(k.x, k.z, WALK);
        a.face(this.faceIn(k));
        a.pose(POSE.stand, now);
        a.lookAt(null);
        a.step(dt, now);
        if (a.dist(k.x, k.z) < 0.15) this.set(k, 'slot', t);
        return;
      }
      case 'fetch': {
        // (to the near side of it, facing it)
        const dx = this.gx - k.x;
        const dz = this.gz - k.z;
        const d = Math.hypot(dx, dz) || 1;
        const tx = this.gx - (dx / d) * 0.5;
        const tz = this.gz - (dz / d) * 0.5;
        a.goTo(tx, tz, FETCH);
        a.face(Math.atan2(dx, dz));
        a.pose(POSE.stand, now);
        a.lookAt(this.look);
        a.step(dt, now);
        if (a.dist(tx, tz) < 0.2 || t - k.since > 6) this.set(k, 'pick', t);
        return;
      }
      case 'pick': {
        a.stop();
        a.face(Math.atan2(this.gx - a.x, this.gz - a.z));
        a.pose(POSE.plant, now);
        a.lookAt(this.look);
        a.step(dt, now);
        if (this.mode === 'ground' && t - k.since > PICK * 0.55) {
          this.mode = 'hand';
          this.holder = i;
          this.fetcher = -1;
          this.readyAt = -1;
        }
        if (t - k.since > PICK) this.set(k, 'walk', t);
        return;
      }
    }
    // At their place: swinging the leg up to the sey as it comes down to them, else standing, watching, cheering,
    // holding it out before the toss.
    const kicking = this.mode === 'fly' && fl.to === i && !this.falling && this.catching !== i && t >= fl.t1 - KID_LEAD && t < fl.t1 + KID_FOLLOW;
    if (kicking && dt > 0) return this.kickStep(k, fl, now, t);
    const holding = this.mode === 'hand' && this.holder === i;
    const pose: Pose = t < k.cheer ? POSE.cheer : holding && this.readyAt >= 0 ? POSE.give : POSE.stand;
    a.goTo(k.x, k.z, 0.6);
    a.face(this.faceIn(k));
    a.pose(pose, now);
    a.lookAt(holding ? null : this.look);
    a.step(dt, now);
  }

  /**
   * A child meets the sey: their step cycle driven so the kicking leg (the right, or the left) swings up through
   * the front just as it arrives (the stride far over a walk's: `KID_KICK_W`), then left to ease back down.
   */
  private kickStep(k: Kid, fl: SeyFlight, now: number, t: number): void {
    const c = k.a.crowd;
    const i = k.a.i;
    const left = fl.t1 - t;
    // (the right thigh is furthest forward at a phase of −π/2, the left at π/2: the cycle's left leg leads by π)
    const target = hash3(fl.n, 13, 69) < 0.7 ? -Math.PI / 2 : Math.PI / 2;
    let hz = 1.6;
    if (left > 0.02) {
      const d = (((target - c.phaseOf(i, now)) % TAU) + TAU) % TAU;
      hz = d / (TAU * left);
      if (hz < 0.9) hz = (d + TAU) / (TAU * left);
      hz = Math.min(4.5, Math.round(hz * 100) / 100);
    }
    c.gait(i, KID_KICK_W, hz, now);
  }

  /** The sey drawn where it is: along its way (base first, spinning), on the ground, or in a hand. */
  private place(dt: number, t: number): void {
    const S = SEY;
    const p = this.p;
    let tx = 0;
    let ty = 1;
    let tz = 0;
    let speed = 0;
    if (this.mode === 'fly') {
      flightAt(S.flight, Math.min(t, this.groundT), p);
      speed = Math.hypot(p.vx, p.vy, p.vz);
      if (speed > 0.3) {
        tx = -p.vx / speed;
        ty = -p.vy / speed;
        tz = -p.vz / speed;
      }
    } else if (this.mode === 'ground') {
      const u = Math.min(1, Math.max(0, (t - this.fellAt) / HOP_T));
      p.x = this.hx + (this.gx - this.hx) * u;
      p.y = this.gy + 4 * HOP_H * u * (1 - u);
      p.z = this.hz + (this.gz - this.hz) * u;
      // (tipping over the hop, then upright on its base)
      tx = (this.gx - this.hx) * 2 * Math.sin(Math.PI * u);
      tz = (this.gz - this.hz) * 2 * Math.sin(Math.PI * u);
    } else {
      const k = this.kids[this.holder];
      this.hold(k, k.a.crowd.scale(k.a.i), p);
      tx = Math.sin(k.a.yaw) * 0.3;
      ty = 0.95;
    }
    const e = dt > 0 ? 1 - Math.exp(-TURN * dt) : 1;
    this.ax += (tx - this.ax) * e;
    this.ay += (ty - this.ay) * e;
    this.az += (tz - this.az) * e;
    const l = Math.hypot(this.ax, this.ay, this.az) || 1;
    this.ax /= l;
    this.ay /= l;
    this.az /= l;
    this.spin = (this.spin + dt * SPIN * Math.min(1, speed / 4)) % TAU;
    S.sx = p.x;
    S.sy = p.y;
    S.sz = p.z;
    const h = Math.hypot(this.ax, this.az);
    this.rig
      .place(p.x, p.y, p.z, h > 1e-4 ? Math.atan2(this.ax, this.az) : 0, Math.atan2(h, this.ay), 0, SEY_SIZE)
      .turn(1, 0, this.spin, 0)
      .write();
  }

  /** Where a child holds the sey: held out in front in both hands while waiting to toss it, else in the hanging right hand. */
  private hold(k: Kid, s: number, out: Point): Point {
    const a = k.a;
    if (k.state === 'slot' && this.readyAt >= 0) {
      out.x = a.x + Math.sin(a.yaw) * 0.36 * s;
      out.y = a.y + 0.74 * s;
      out.z = a.z + Math.cos(a.yaw) * 0.36 * s;
      return out;
    }
    a.crowd.handAt(a.i, out);
    out.y -= 0.06;
    return out;
  }

  private groundY(x: number, z: number, y: number): number {
    const g = this.ground.at(x, z, y);
    return Number.isFinite(g) ? g : this.ground.field.heightAt(x, z);
  }

  // ── A still moment for a shot (`sey=1|kick|heel|miss`) ──────────────────

  /**
   * Holds the moment a shot asks for, the same every time: him in his place (the add-on puts him there), the
   * children round him; the sey on its way down to him (`play`), at his foot (`kick`, `heel`: the add-on poses
   * the kick to it), or on the ground in front of him with the child next to him bending for it (`miss`).
   */
  private tableau(now: number, f: MapFrame): void {
    const S = SEY;
    const T = S.t;
    if (this.tabled !== S.shot || this.tabledAt !== S.angle) {
      this.tabled = S.shot;
      this.tabledAt = S.angle;
      this.withMe = S.joined;
      this.layout();
      for (const k of this.kids) {
        k.a.warp(k.x, k.y, k.z, this.faceIn(k));
        k.a.show();
        this.set(k, 'slot', T);
        k.cheer = -1;
      }
      const fl = S.flight;
      // (from the child across from him)
      const from = 2;
      const k = this.kids[from];
      const sx = k.x - Math.sin(k.th) * KID_REACH;
      const sz = k.z - Math.cos(k.th) * KID_REACH;
      fl.foot = 'R';
      const e = S.footR;
      const contact = S.shot === 'heel' ? SEY_HEEL : SEY_SNAP;
      const t1 = S.shot === 'play' ? T + 0.55 : S.shot === 'miss' ? T - 1.5 : T - contact;
      aim(fl, t1 - 1.45, t1, sx, k.y + KID_KICK_H, sz, e.x, e.y, e.z);
      fl.from = from;
      fl.to = ME;
      fl.kind = 'kick';
      this.groundT = flightDown(fl, this.y + REST_Y);
      this.mode = 'fly';
      this.falling = false;
      S.kick.flight = fl.n;
      if (S.shot === 'miss') {
        // (it fell just in front of his foot; the child next to him bends to it, the one across laughs)
        this.mode = 'ground';
        const i = Math.sin(S.angle);
        const j = Math.cos(S.angle);
        this.gx = this.hx = e.x - i * HOP + j * 0.15;
        this.gz = this.hz = e.z - j * HOP - i * 0.15;
        this.gy = this.groundY(this.gx, this.gz, e.y) + REST_Y;
        this.fellAt = T - 2;
        fl.on = false;
        const n = this.kids[this.nearest(this.gx, this.gz)];
        n.a.warp(this.gx - i * 0.55, n.y, this.gz - j * 0.55, Math.atan2(i, j));
        this.set(n, 'pick', T);
        this.fetcher = this.kids.indexOf(n);
        const far = this.kids[this.farthest(this.gx, this.gz)];
        far.cheer = T + 100;
        this.say('seyOops', far.a);
      }
      if (S.shot === 'heel') {
        for (let i = 0; i < KIDS; i++) this.kids[i].cheer = T + 100;
        this.say('seyWow', this.kids[2].a);
      }
    }
    this.lookPoint();
    for (let i = 0; i < this.kids.length; i++) {
      const k = this.kids[i];
      const a = k.a;
      if (k.state === 'pick') {
        a.stop();
        a.pose(POSE.plant, now);
        a.lookAt(this.look);
      } else {
        a.goTo(k.x, k.z, 0.6);
        a.face(this.faceIn(k));
        a.pose(T < k.cheer ? POSE.cheer : POSE.stand, now);
        a.lookAt(this.look);
      }
      a.step(0, now);
    }
    this.place(0, T);
    void f;
  }

  /** Off the map (the village far away): nothing shown; out again from scratch when it is near. */
  hide(): void {
    this.rig.hide();
    this.shown = false;
    this.out = false;
    SEY.out = SEY.open = false;
    SEY.flight.on = false;
    for (const k of this.kids) k.state = 'gone';
  }
}

/**
 * The sey (rig space, true metres; drawn at the people's scale): a base of two rubber discs with a steel washer
 * between them, and four feathers fanned up and out from it, white, their tips pink and green. Its origin is the
 * middle of the base (where it is kicked); part 1 spins about its axis (+y).
 */
function seyRig(): RigDef {
  const d = new RigDef();
  const body = d.part([0, 0, 0]);
  d.box([0, -0.014, 0], [0.068, 0.02, 0.068], 0xb8322a, { part: body });
  d.box([0, 0.0, 0], [0.058, 0.009, 0.058], 0xa8adb2, { part: body });
  d.box([0, 0.012, 0], [0.062, 0.016, 0.062], 0x8e2622, { part: body });
  const TIPS = [0xf0507e, 0x46b45a, 0xf0507e, 0x46b45a];
  for (let q = 0; q < 4; q++) {
    const yaw = (q * Math.PI) / 2 + Math.PI / 4;
    const lean = 0.32;
    // (a feather from the base's top: its lower white part, then the coloured tip, leaning out along `yaw`)
    for (const [y0, len, color, w] of [
      [0.02, 0.1, 0xf4f0e6, 0.034],
      [0.12, 0.07, TIPS[q], 0.042],
    ] as const) {
      const mid = y0 + len / 2;
      const out = Math.sin(lean) * mid;
      d.box([Math.sin(yaw) * out, Math.cos(lean) * mid, Math.cos(yaw) * out], [w, len, 0.006], color, { part: body, rot: [lean, yaw, 0] });
    }
  }
  return d;
}
