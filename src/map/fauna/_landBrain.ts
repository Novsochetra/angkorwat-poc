import { mulberry32 } from '../../voxel/random';
import { CH, type Flock } from './_kit';
import { len2 } from './_len';

/**
 * What a land animal does: a small state machine per animal, shared by all
 * species (their `Habits` tune it).
 *
 *   idle  — an activity (graze, look round, sit, groom, peck, lie, sleep…)
 *           for a while, then another, or a walk to a new spot near home;
 *   walk  — to that spot, turning on the way;
 *   alert — the explorer is near: stand up, head high, face him;
 *   flee  — he came closer (or the herd bolted): run off away from him,
 *           then settle there, watching him, and make it the new home.
 *
 * At night most of them sleep (lying, sitting hunched) and stop wandering.
 * The poses are written to the flock's eased channels only when they change.
 */

export type Activity = 'stand' | 'graze' | 'look' | 'sit' | 'lie' | 'groom' | 'groomed' | 'scratch' | 'eat' | 'peck' | 'rake' | 'sleep';

/** Channel values of an activity. */
export interface Look {
  rest: number;
  head: number;
  act: number;
}

export interface Habits {
  /** Walking and running speed (m/s), and steps a second at those speeds. */
  walk: number;
  run: number;
  walkHz: number;
  runHz: number;
  /** Turning speed (rad/s). */
  turn: number;
  /** Explorer distances (m): look up, run off. */
  alertAt: number;
  fleeAt: number;
  /** How far they run off (m, min and max). */
  fleeTo: [number, number];
  /** Wander radius round home (m); home drifts at most `leash` m from where the animal started. */
  wander: number;
  leash: number;
  /** Chance of walking somewhere after an activity (0‥1). */
  moves: number;
  /** Idle activities: [activity, weight, shortest s, longest s]. */
  idle: [Activity, number, number, number][];
  looks: Partial<Record<Activity, Look>>;
  /** Share of the animals that sleep at night. */
  night: number;
  /** Largest step up or down between two points a metre apart (m). */
  climb: number;
}

/** Where an animal may stand: the height there, or NaN. */
export type Ground = (x: number, z: number) => number;

/** The explorer's feet, while roaming. */
export interface Walker {
  x: number;
  y: number;
  z: number;
}

/** Things an animal does that make a sound (land.ts turns them into calls). */
export type AnimalEvent = 'flee' | 'alert';

const STILL: Look = { rest: 0, head: 0, act: 0 };
const ALERT: Look = { rest: 0, head: -1, act: 0 };
const TAU = Math.PI * 2;
/** Ways out when fleeing: turns off straight away (rad), and shares of the distance. */
const FLEE_TURNS = [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35];
const FLEE_REACH = [1, 0.55];

function wrap(a: number): number {
  a %= TAU;
  return a > Math.PI ? a - TAU : a < -Math.PI ? a + TAU : a;
}

/** Animals that keep together: they bolt together, and groom each other. */
export class Herd {
  readonly members: Agent[] = [];
  /** Last alarm: when, and where the danger was. */
  alarmAt = -1e9;
  alarmX = 0;
  alarmZ = 0;
  /** Timer for the herd's calls (land.ts). */
  callIn = 0;
  constructor(readonly name: string) {}
}

export class Agent {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Ground height under the feet (y eases to it: a hop up a step). */
  gy: number;
  homeX: number;
  homeZ: number;
  readonly originX: number;
  readonly originZ: number;
  mode: 'idle' | 'walk' | 'alert' | 'flee' = 'idle';
  act: Activity = 'stand';
  /** Seconds left of the activity (idle, alert), or of trying to reach the target (walk, flee). */
  timer = 0;
  tx = 0;
  tz = 0;
  /** Activity to take up on arrival, and the neighbour it concerns (grooming). */
  private then: Activity | null = null;
  partner: Agent | null = null;
  /** Head turn target and when to pick the next one. */
  private turnTo = 0;
  private turnIn = 0;
  /** Seconds the explorer has been out of reach (alert → calm). */
  private calm = 0;
  /** Sleeps at night. */
  readonly sleepy: boolean;
  asleep = false;
  /** Frozen far from every camera (no updates). */
  frozen = false;
  readonly rnd: () => number;
  /** Something to call out (read and cleared by land.ts). */
  event: AnimalEvent | null = null;

  constructor(
    readonly flock: Flock,
    readonly i: number,
    readonly habits: Habits,
    readonly ground: Ground,
    readonly herd: Herd,
    x: number,
    z: number,
    yaw: number,
    readonly scale: number,
    seed: number,
  ) {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.gy = this.y = ground(x, z);
    this.homeX = this.originX = x;
    this.homeZ = this.originZ = z;
    this.rnd = mulberry32(seed);
    this.sleepy = this.rnd() < habits.night;
    herd.members.push(this);
    // Start in the middle of some activity.
    this.pick(0);
    this.timer *= this.rnd();
    this.pose(0, true);
  }

  /** Step rate for a speed: the species' steps scaled between walk and run, slower for big ones. */
  private hz(speed: number): number {
    const h = this.habits;
    const k = Math.min(1, Math.max(0, (speed - h.walk) / (h.run - h.walk)));
    return (h.walkHz + (h.runHz - h.walkHz) * k) / Math.sqrt(this.scale);
  }

  /**
   * One update: `ex` is the explorer's feet (null in the overview), `big` an
   * elephant (they get out of its way too, at closer range), `night` 0‥1.
   */
  step(dt: number, now: number, ex: Walker | null, big: Walker | null, night: number): void {
    const h = this.habits;
    this.frozen = false;
    // ── The explorer (or an elephant coming by) ──
    let d = Infinity;
    if (ex && Math.abs(ex.y - this.y) < 6) d = len2(this.x - ex.x, this.z - ex.z) / Math.sqrt(this.scale);
    if (big && Math.abs(big.y - this.y) < 4) {
      const db = (len2(this.x - big.x, this.z - big.z) - 2) * 2.2;
      if (db < d) {
        d = db;
        ex = big;
      }
    }
    const herd = this.herd;
    if (this.mode !== 'flee') {
      if (d < h.fleeAt || (this.mode === 'alert' && this.timer <= 0 && d < h.alertAt * 0.8)) this.flee(now, ex!.x, ex!.z);
      else if (now - herd.alarmAt < 1.2 && len2(this.x - herd.alarmX, this.z - herd.alarmZ) < h.alertAt * 1.6 && this.rnd() < dt * 4) this.flee(now, herd.alarmX, herd.alarmZ);
      else if (d < h.alertAt && this.mode !== 'alert') {
        this.mode = 'alert';
        this.timer = 0.6 + this.rnd() * 1.4;
        this.calm = 0;
        this.asleep = false;
        this.release();
        this.event = 'alert';
      }
    }
    // ── Modes ──
    if (this.mode === 'alert') {
      this.timer -= dt;
      if (ex) this.face(dt, Math.atan2(ex.x - this.x, ex.z - this.z), 0.5);
      this.calm = d < h.alertAt * 1.3 ? 0 : this.calm + dt;
      if (this.calm > 2.5) this.pick(now);
    } else if (this.mode === 'walk' || this.mode === 'flee') {
      const speed = this.mode === 'flee' ? h.run : h.walk;
      this.timer -= dt;
      if (this.move(dt, speed) || this.timer <= 0) this.arrive(now, ex);
    } else {
      this.timer -= dt;
      if (this.partner && (this.partner.mode !== 'idle' || this.partner.partner !== this)) this.release();
      // Night: the sleepy ones lie down and stay; morning: they wake.
      const wantSleep = this.sleepy && night > 0.55 + 0.2 * ((this.i * 0.618) % 1);
      if (wantSleep !== this.asleep && this.act !== 'groomed') {
        this.asleep = wantSleep;
        this.timer = 0;
      }
      if (this.timer <= 0) this.pick(now);
      if (this.act === 'look' || this.act === 'stand') {
        this.turnIn -= dt;
        if (this.turnIn <= 0) {
          this.turnTo = this.rnd() < 0.3 ? 0 : (this.rnd() * 2 - 1) * 0.9;
          this.turnIn = 1.5 + this.rnd() * 3;
        }
      } else this.turnTo = 0;
    }
    // Feet on the ground: a quick ease (a hop up or down a step).
    this.y += (this.gy - this.y) * Math.min(1, dt * 9);
    this.pose(now, false);
  }

  /** Far from every camera: stop walking, keep the activity (the shader still animates it). */
  freeze(now: number): void {
    if (this.frozen) return;
    this.frozen = true;
    if (this.mode !== 'idle') this.pick(now);
    this.y = this.gy;
    this.pose(now, false);
  }

  /** Next idle activity, or a walk somewhere. */
  private pick(now: number): void {
    const h = this.habits;
    this.release();
    this.mode = 'idle';
    if (this.asleep) {
      this.act = 'sleep';
      this.timer = 30 + this.rnd() * 60;
      return;
    }
    if (now > 0 && this.rnd() < h.moves && this.wanderTarget()) return;
    let total = 0;
    for (const e of h.idle) total += e[1];
    let r = this.rnd() * total;
    let e = h.idle[0];
    for (const c of h.idle) {
      e = c;
      if ((r -= c[1]) <= 0) break;
    }
    this.act = e[0];
    this.timer = e[2] + (e[3] - e[2]) * this.rnd();
    if (this.act === 'groom' && !this.seekPartner()) this.act = 'sit';
  }

  /** A spot to walk to near home, with a walkable way there. */
  private wanderTarget(): boolean {
    const h = this.habits;
    for (let n = 0; n < 5; n++) {
      const a = this.rnd() * TAU;
      const r = h.wander * Math.sqrt(this.rnd());
      const x = this.homeX + Math.sin(a) * r;
      const z = this.homeZ + Math.cos(a) * r;
      if (Math.hypot(x - this.x, z - this.z) < 1 || !this.walkable(x, z)) continue;
      this.go('walk', x, z);
      return true;
    }
    return false;
  }

  /** Grooming: walk up behind a sitting neighbour. */
  private seekPartner(): boolean {
    for (const o of this.herd.members) {
      if (o === this || o.mode !== 'idle' || o.partner || o.asleep || (o.act !== 'sit' && o.act !== 'look' && o.act !== 'eat')) continue;
      if (Math.hypot(o.x - this.x, o.z - this.z) > 5) continue;
      const x = o.x - Math.sin(o.yaw) * 0.42 * o.scale;
      const z = o.z - Math.cos(o.yaw) * 0.42 * o.scale;
      if (!this.walkable(x, z)) continue;
      this.partner = o;
      o.partner = this;
      o.act = 'groomed';
      o.timer = 40;
      this.go('walk', x, z);
      this.then = 'groom';
      return true;
    }
    return false;
  }

  /** Let go of a grooming partner. */
  private release(): void {
    const p = this.partner;
    this.partner = null;
    this.then = null;
    if (p && p.partner === this) {
      p.partner = null;
      if (p.act === 'groomed' && p.mode === 'idle') p.timer = Math.min(p.timer, 1 + p.rnd() * 3);
    }
  }

  private go(mode: 'walk' | 'flee', x: number, z: number): void {
    this.mode = mode;
    this.tx = x;
    this.tz = z;
    // (give up if it takes far longer than it should)
    this.timer = (Math.hypot(x - this.x, z - this.z) / (mode === 'flee' ? this.habits.run : this.habits.walk)) * 2 + 3;
  }

  /** Run off, away from (fx, fz), and tell the herd. */
  private flee(now: number, fx: number, fz: number): void {
    const h = this.habits;
    this.release();
    this.asleep = false;
    const away = Math.atan2(this.x - fx, this.z - fz);
    const dist = h.fleeTo[0] + (h.fleeTo[1] - h.fleeTo[0]) * this.rnd();
    const jitter = (this.rnd() - 0.5) * 0.6;
    for (const k of FLEE_TURNS) {
      for (const s of FLEE_REACH) {
        const a = away + jitter + k;
        const x = this.x + Math.sin(a) * dist * s;
        const z = this.z + Math.cos(a) * dist * s;
        if (!this.walkable(x, z)) continue;
        this.go('flee', x, z);
        if (now - this.herd.alarmAt > 1.5) this.event = 'flee';
        this.herd.alarmAt = now;
        this.herd.alarmX = fx;
        this.herd.alarmZ = fz;
        return;
      }
    }
    // Nowhere to go: stand and watch.
    this.mode = 'alert';
    this.timer = 3;
  }

  /** Reached the target (or gave up). */
  private arrive(now: number, ex: Walker | null): void {
    const h = this.habits;
    if (this.mode === 'flee') {
      // Settle here, watching; this is home now (not too far from the first one).
      let hx = this.x - this.originX;
      let hz = this.z - this.originZ;
      const l = Math.hypot(hx, hz);
      if (l > h.leash) {
        hx *= h.leash / l;
        hz *= h.leash / l;
      }
      this.homeX = this.originX + hx;
      this.homeZ = this.originZ + hz;
      this.mode = 'idle';
      this.act = 'look';
      this.timer = 3 + this.rnd() * 4;
      if (ex) this.turnTo = Math.max(-1, Math.min(1, wrap(Math.atan2(ex.x - this.x, ex.z - this.z) - this.yaw)));
      this.turnIn = 2;
      return;
    }
    const then = this.then;
    const p = this.partner;
    this.then = null;
    if (then === 'groom' && p && p.partner === this && p.mode === 'idle') {
      this.mode = 'idle';
      this.act = 'groom';
      this.yaw = p.yaw;
      this.timer = 12 + this.rnd() * 18;
      p.timer = this.timer + 1;
      return;
    }
    this.release();
    this.pick(now);
    if (this.mode === 'walk') {
      // (never two walks in a row: stop and do something first)
      this.mode = 'idle';
      this.act = h.idle[0][0];
      this.timer = h.idle[0][2];
    }
  }

  /** Walk towards the target; true on arrival. */
  private move(dt: number, speed: number): boolean {
    const dx = this.tx - this.x;
    const dz = this.tz - this.z;
    const dist = len2(dx, dz);
    if (dist < Math.max(0.15, speed * dt)) return true;
    const diff = this.face(dt, Math.atan2(dx, dz), this.mode === 'flee' ? 2.5 : 1);
    const go = Math.min(dist, speed * dt * Math.max(0, Math.cos(diff)));
    if (go <= 0) return false;
    const nx = this.x + Math.sin(this.yaw) * go;
    const nz = this.z + Math.cos(this.yaw) * go;
    const g = this.ground(nx, nz);
    if (!(Math.abs(g - this.gy) <= this.habits.climb)) {
      // Blocked (a wall, water, a cliff): give up on this target.
      this.timer = 0;
      return false;
    }
    this.x = nx;
    this.z = nz;
    this.gy = g;
    return false;
  }

  /** Turn towards a heading; returns what is left to turn. */
  private face(dt: number, want: number, fast: number): number {
    const diff = wrap(want - this.yaw);
    const k = this.habits.turn * fast * dt;
    this.yaw = wrap(this.yaw + Math.max(-k, Math.min(k, diff)));
    return wrap(want - this.yaw);
  }

  /** Can it walk straight from here to (x, z)? */
  walkable(x: number, z: number): boolean {
    const dx = x - this.x;
    const dz = z - this.z;
    const n = Math.ceil(Math.hypot(dx, dz) / 0.7);
    let last = this.gy;
    for (let k = 1; k <= n; k++) {
      const g = this.ground(this.x + (dx * k) / n, this.z + (dz * k) / n);
      if (!(Math.abs(g - last) <= this.habits.climb)) return false;
      last = g;
    }
    return true;
  }

  /** Write the pose channels (only what changed). */
  private pose(now: number, snap: boolean): void {
    const fl = this.flock;
    const i = this.i;
    const h = this.habits;
    const moving = this.mode === 'walk' || this.mode === 'flee';
    const speed = this.mode === 'flee' ? h.run : h.walk;
    fl.gait(i, moving ? (this.mode === 'flee' ? 2 : 1) : 0, moving ? this.hz(speed) : this.hz(h.walk), now);
    const look = moving ? STILL : this.mode === 'alert' ? ALERT : (h.looks[this.act] ?? STILL);
    fl.set(i, CH.rest, look.rest, now, snap);
    fl.set(i, CH.head, look.head, now, snap);
    fl.set(i, CH.act, look.act, now, snap);
    // (head turns in steps of 0.1: fewer writes)
    const turn = this.mode === 'alert' ? 0 : Math.round(this.turnTo * 10) / 10;
    fl.set(i, CH.turn, turn, now, snap);
  }
}
