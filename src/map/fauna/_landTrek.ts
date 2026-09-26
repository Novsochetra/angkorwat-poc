import { mulberry32 } from '../../voxel/random';
import { LIFT, type Station } from '../road/line';
import { CH, type Flock } from './_kit';
import { Bath, type BathEvent, type BathSite, type P3 } from './_landBath';
import type { Walker } from './_landBrain';
import type { Splash } from './_landSplash';
import { len2 } from './_len';

/**
 * A cow elephant and her calf walking the valley road: slowly up and down a
 * flat stretch of it, stopping now and then to fan the ears and swing or
 * feed with the trunk, turning round at the ends. The calf keeps a few
 * metres behind her on the other side of the road, and trots to catch up.
 *
 * They don't walk through the explorer: while he is on the road in front of
 * them (or right beside them) they stop and wait; the cow trumpets once when
 * he first comes close. People on the road (the people part steps aside for
 * them) are waited for too, when they are in her way or right by her; if
 * they stay in the way a long while, she turns back. At night they stop and
 * doze standing; in a storm they stand still, heads low, and wait it out.
 *
 * In the afternoon (the `elephantBath` event) she walks to the bath site's
 * point on the road (turning if it is behind her) and they go down to the
 * river to bathe (_landBath.ts), then walk on.
 */

/** Walking speed (m/s), the cow's steps a second, turning speed (rad/s). */
const SPEED = 1.1;
const COW_HZ = 0.55;
const TURN = 0.3;
/** Across the road (m, left of the road's way): the cow keeps to one side, the calf to the other. */
export const COW_SIDE = 0.55;
const CALF_SIDE = -1.1;
/** The calf's distance behind the cow (m), and its size. */
const CALF_GAP = 4.8;
export const CALF_SCALE = 0.44;
/** The explorer is in the way: this far ahead on the road (m), this far across it, or this near anyway. */
const BLOCK_AHEAD = 11;
const BLOCK_ACROSS = 3.5;
const BLOCK_NEAR = 6;
/** A person is in the way: ahead within this (m), across her line within this, or this near (they walk round the rest). */
const PEOPLE_AHEAD = 8;
const PEOPLE_ACROSS = 1.9;
const PEOPLE_NEAR = 3;
/** Waiting for people longer than this, she turns back (s). */
const PEOPLE_PATIENCE = 18;

export type TrekEvent = 'trumpet' | BathEvent;

/** Someone on the road (the people part's traffic): where, and how fast they go. */
export interface Passer {
  x: number;
  y: number;
  z: number;
}

/** What the trek hears of the world each step. */
export interface TrekWorld {
  /** People on the road near them. */
  people: readonly Passer[];
  /** The bath's event: open now, and its number (a new number: a new bath). */
  bath: boolean;
  bathCount: number;
  /** A storm (0‥1, the event clock's `shelter`). */
  storm: number;
}

export class Trek {
  /** Along the stretch (m from its start) and which way the cow faces (+1 on, −1 back). */
  private s: number;
  private dir: 1 | -1;
  private mode: 'walk' | 'stop' | 'turn' | 'wait' | 'sleep' | 'bath' = 'walk';
  private timer: number;
  private cowYaw = 0;
  private calfS: number;
  private calfYaw = 0;
  /** The calf's side of the road (m): eases back to its own side after the bath. */
  private calfSide = CALF_SIDE;
  private turnGoal = 0;
  private trumpetAt = -1e9;
  private trumpetEnd = -1;
  private readonly len: number;
  private readonly rnd: () => number;
  /** Walking to the bath site's point on the road (m along), or null. */
  private goal: number | null = null;
  private bathServed = 0;
  private bath: Bath | null = null;
  /** Seconds waited for people in the way. */
  private waited = 0;
  /** Where the cow is (for sounds and distances). */
  readonly cow = { x: 0, y: 0, z: 0 };
  event: TrekEvent = null;
  /** The last baths' phases with their times (checks). */
  readonly bathLog: string[] = [];

  constructor(
    private readonly flock: Flock,
    private readonly st: Station[],
    seed: number,
    /** Where they go down to bathe (none: no bath). */
    readonly site: BathSite | null = null,
    private readonly splash: Splash | null = null,
  ) {
    this.len = (st.length - 1) * 0.5;
    this.rnd = mulberry32(seed);
    this.s = this.len * (0.2 + 0.6 * this.rnd());
    this.dir = this.rnd() < 0.5 ? 1 : -1;
    this.calfS = this.s - this.dir * CALF_GAP;
    this.timer = 20 + this.rnd() * 30;
    flock.setup(0, 0, this.rnd(), 1);
    flock.setup(1, 1, this.rnd(), 1.02);
    this.cowYaw = this.roadYaw(this.s, this.dir);
    this.calfYaw = this.cowYaw;
  }

  /** Bathing now (or walking to the bath). */
  get bathing(): boolean {
    return this.mode === 'bath' || this.goal !== null;
  }

  /** Point on the road `s` m along, `side` m to the left of the way `dir`. */
  private at(s: number, side: number, out: { x: number; y: number; z: number }): void {
    const f = Math.max(0, Math.min(this.st.length - 1.001, s / 0.5));
    const i = Math.floor(f);
    const k = f - i;
    const a = this.st[i];
    const b = this.st[i + 1];
    const tx = a.tx + (b.tx - a.tx) * k;
    const tz = a.tz + (b.tz - a.tz) * k;
    // (left of the road's own direction: +x turns to the left of +z)
    out.x = a.x + (b.x - a.x) * k + tz * side;
    out.z = a.z + (b.z - a.z) * k - tx * side;
    out.y = a.h + LIFT;
  }

  private roadYaw(s: number, dir: number): number {
    const i = Math.max(0, Math.min(this.st.length - 1, Math.round(s / 0.5)));
    return Math.atan2(this.st[i].tx * dir, this.st[i].tz * dir);
  }

  step(dt: number, now: number, ex: Walker | null, night: number, world?: TrekWorld): void {
    const f = this.flock;
    const p = this.cow;
    this.event = null;
    // ── The bath: they are down at the river ──
    if (this.mode === 'bath' && this.bath) {
      const b = this.bath;
      b.step(dt, now, night);
      this.event = b.event;
      Object.assign(p, { x: b.cow.x, y: b.cow.y, z: b.cow.z });
      if (b.phase === 'done') this.endBath(now);
      return;
    }
    this.at(this.s, COW_SIDE, p);
    // ── Time to bathe: walk to the site's point on the road ──
    if (world && this.site && world.bath && world.bathCount !== this.bathServed && night < 0.5 && world.storm < 0.3 && this.mode !== 'sleep' && this.mode !== 'turn') {
      this.bathServed = world.bathCount;
      this.goal = this.site.s;
      this.bathLog.push(`bath ${now.toFixed(1)}: walk to ${this.goal.toFixed(1)} m from ${this.s.toFixed(1)}`);
      if (Math.sign(this.goal - this.s) === -this.dir && Math.abs(this.goal - this.s) > 0.3) {
        this.mode = 'turn';
        this.turnGoal = this.roadYaw(this.s, -this.dir);
      } else if (this.mode === 'stop') this.mode = 'walk';
    }
    // ── The explorer, or people, in the way ──
    let blocked = false;
    const fx = Math.sin(this.cowYaw);
    const fz = Math.cos(this.cowYaw);
    if (ex && Math.abs(ex.y - p.y) < 5) {
      const dx = ex.x - p.x;
      const dz = ex.z - p.z;
      const ahead = dx * fx + dz * fz;
      const across = Math.abs(dx * fz - dz * fx);
      const d = len2(dx, dz);
      blocked = d < BLOCK_NEAR || (ahead > 0 && ahead < BLOCK_AHEAD && across < BLOCK_ACROSS);
      if (d < 12 && now - this.trumpetAt > 90 && night < 0.6) {
        this.trumpetAt = now;
        this.trumpetEnd = now + 2.8;
        this.event = 'trumpet';
      }
    }
    let byPeople = false;
    for (const o of world?.people ?? []) {
      if (Math.abs(o.y - p.y) > 3) continue;
      const dx = o.x - p.x;
      const dz = o.z - p.z;
      const ahead = dx * fx + dz * fz;
      const across = Math.abs(dx * fz - dz * fx);
      if (len2(dx, dz) < PEOPLE_NEAR || (ahead > -0.5 && ahead < PEOPLE_AHEAD && across < PEOPLE_ACROSS)) {
        byPeople = true;
        break;
      }
    }
    this.waited = byPeople && (this.mode === 'wait' || this.mode === 'stop') ? this.waited + dt : 0;
    if (byPeople && this.waited > PEOPLE_PATIENCE) {
      // They stay in the way: turn back (and give up the bath this time).
      this.waited = 0;
      byPeople = false;
      this.goal = null;
      this.mode = 'turn';
      this.turnGoal = this.roadYaw(this.s, -this.dir);
    }
    blocked ||= byPeople;
    // ── Modes ──
    if (night > 0.6 && this.mode !== 'turn') this.mode = 'sleep';
    else if (this.mode === 'sleep') {
      this.mode = 'stop';
      this.timer = 5;
    }
    const storm = (world?.storm ?? 0) > 0.5;
    if ((blocked || storm) && (this.mode === 'walk' || this.mode === 'stop')) {
      this.mode = 'wait';
      this.timer = 2;
    }
    let moving = false;
    if (this.mode === 'walk') {
      this.timer -= dt;
      const next = this.s + this.dir * SPEED * dt;
      const g = this.goal;
      if (g !== null && (next - g) * this.dir >= 0) {
        // At the bath site's point: down to the river.
        this.s = g;
        this.startBath(now);
        return;
      }
      if (next < 0 || next > this.len) {
        this.mode = 'turn';
        this.turnGoal = this.roadYaw(this.s, -this.dir);
      } else {
        this.s = next;
        moving = true;
        if (this.timer <= 0 && g === null) {
          this.mode = 'stop';
          this.timer = 8 + this.rnd() * 14;
          f.set(0, CH.act, this.rnd() < 0.5 ? 1 : 0, now);
          f.set(0, CH.turn, (this.rnd() - 0.5) * 1.4, now);
        }
      }
      this.cowYaw = turnTowards(this.cowYaw, this.roadYaw(this.s, this.dir), TURN * dt);
    } else if (this.mode === 'turn') {
      moving = true;
      this.cowYaw = turnTowards(this.cowYaw, this.turnGoal, TURN * 1.2 * dt);
      if (Math.abs(wrap(this.turnGoal - this.cowYaw)) < 0.02) {
        this.dir = this.dir === 1 ? -1 : 1;
        if (this.goal !== null) this.mode = 'walk';
        else {
          this.mode = 'stop';
          this.timer = 4 + this.rnd() * 6;
        }
      }
    } else if (this.mode === 'stop' || this.mode === 'wait') {
      this.timer -= dt;
      if (this.mode === 'wait' && (blocked || storm)) this.timer = Math.max(this.timer, 1.5);
      if (this.timer <= 0 || (this.mode === 'stop' && this.goal !== null)) {
        this.mode = 'walk';
        this.timer = 25 + this.rnd() * 40;
        f.set(0, CH.act, 0, now);
        f.set(0, CH.turn, 0, now);
      }
    }
    // Cow: pose and place.
    const trumpet = now < this.trumpetEnd;
    f.gait(0, moving ? 1 : 0, COW_HZ, now);
    f.set(0, CH.rest, this.mode === 'sleep' ? 1 : 0, now);
    f.set(0, CH.head, trumpet ? -1 : storm && this.mode === 'wait' ? 0.6 : this.mode === 'wait' ? -0.5 : 0, now);
    if (trumpet) f.set(0, CH.act, 2, now);
    else if (f.target(0, CH.act) === 2) f.set(0, CH.act, 0, now);
    this.at(this.s, COW_SIDE, p);
    f.place(0, p.x, p.y, p.z, this.cowYaw, 1);

    // ── Calf: behind her, trotting to catch up; turns with her ──
    const want = this.s - this.dir * CALF_GAP;
    const gap = want - this.calfS;
    const hold = this.mode === 'wait' || this.mode === 'sleep';
    let calfMoving = false;
    this.calfSide += Math.max(-0.4 * dt, Math.min(0.4 * dt, CALF_SIDE - this.calfSide));
    if (!hold && Math.abs(gap) > 0.6) {
      const v = Math.min(Math.abs(gap) * 0.8, SPEED * 1.5);
      this.calfS += Math.sign(gap) * Math.min(Math.abs(gap), v * dt);
      this.calfYaw = turnTowards(this.calfYaw, this.roadYaw(this.calfS, Math.sign(gap)), TURN * 3 * dt);
      calfMoving = true;
      f.gait(1, v > SPEED * 1.2 ? 2 : 1, Math.round(((COW_HZ * v) / SPEED / Math.sqrt(CALF_SCALE)) * 20) / 20, now);
    } else {
      this.calfYaw = turnTowards(this.calfYaw, this.cowYaw, TURN * 2 * dt);
      f.gait(1, 0, COW_HZ / Math.sqrt(CALF_SCALE), now);
    }
    f.set(1, CH.rest, this.mode === 'sleep' ? 1 : 0, now);
    f.set(1, CH.head, calfMoving ? 0 : this.mode === 'wait' ? -0.6 : 0.3, now);
    f.set(1, CH.act, !calfMoving && this.mode === 'stop' ? 1 : 0, now);
    const c = CALF;
    this.at(this.calfS, this.calfSide, c);
    f.place(1, c.x, c.y, c.z, this.calfYaw, CALF_SCALE);
  }

  /** Leave the road for the river: the cow from her point, the calf from where it is; the road ahead to walk on after. */
  private startBath(now: number): void {
    const site = this.site!;
    this.goal = null;
    const cow = { x: 0, y: 0, z: 0, yaw: this.cowYaw };
    this.at(this.s, COW_SIDE, cow);
    const calf = { x: 0, y: 0, z: 0, yaw: this.calfYaw };
    this.at(this.calfS, this.calfSide, calf);
    const after: P3[] = [];
    for (let k = 1; k <= 12; k++) {
      const q = { x: 0, y: 0, z: 0 };
      this.at(Math.max(0, Math.min(this.len, this.s + this.dir * k * 0.5)), COW_SIDE, q);
      after.push(q);
    }
    this.flock.set(0, CH.act, 0, now);
    this.flock.set(0, CH.turn, 0, now);
    this.bath = new Bath(this.flock, site, after, cow, calf, this.splash, Math.floor(now * 7) + 11);
    this.mode = 'bath';
  }

  /** Back on the road, a few metres on: the trek goes on from there (the calf eases back to its side). */
  private endBath(now: number): void {
    const b = this.bath!;
    this.bathLog.push(...b.log.map((l) => `bath ${l}`));
    this.s = Math.max(0, Math.min(this.len, this.s + this.dir * 6));
    this.cowYaw = b.cow.yaw;
    // The calf: its place along the road, on the cow's lane (it drifts back to its own side).
    const i = this.nearest(b.calf.x, b.calf.z);
    this.calfS = i * 0.5;
    this.calfSide = COW_SIDE;
    this.calfYaw = b.calf.yaw;
    this.bath = null;
    this.mode = 'stop';
    this.timer = 5 + this.rnd() * 5;
    this.flock.set(1, CH.rest, 0, now);
    this.flock.set(1, CH.act, 0, now);
  }

  /** The station nearest a point. */
  private nearest(x: number, z: number): number {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < this.st.length; i++) {
      const d = (this.st[i].x - x) ** 2 + (this.st[i].z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  hide(): void {
    this.flock.hide(0);
    this.flock.hide(1);
  }
}

const CALF = { x: 0, y: 0, z: 0 };
const TAU = Math.PI * 2;

function wrap(a: number): number {
  a %= TAU;
  return a > Math.PI ? a - TAU : a < -Math.PI ? a + TAU : a;
}

function turnTowards(yaw: number, want: number, k: number): number {
  const d = wrap(want - yaw);
  return wrap(yaw + Math.max(-k, Math.min(k, d)));
}
