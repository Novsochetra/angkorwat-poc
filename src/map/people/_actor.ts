import type { Crowd, Look, Pose } from './_personModel';
import { POSE } from './_personModel';
import { len, type Ground, type Point, type Traffic } from './_routes';

/**
 * Walking in the rain (index.ts sets it once a frame from the event clock's
 * `hurry`, events.ts: 1 dry … 1.5 a downpour): every walk (`goTo` at 0.5 m/s
 * or more) is that much quicker; slow steps (working, shuffling) are not.
 */
export const RAIN_PACE = { hurry: 1 };

/**
 * One person on the map, driving their instance of the crowd: where they
 * are and face, walking to a point (turning first, easing in and out of
 * the step), standing and facing somewhere, their pose, the prop held up,
 * where they look. Scenes set goals every frame; `step` moves and writes
 * (only what changed reaches the GPU).
 *
 *   const a = new Actor(crowd, dress('visitor', seed), ground); // adds them to the crowd
 *   a.avoid(traffic, 'my group');          // step out of the elephants' way on their own
 *   a.warp(x, y, z, yaw); a.show();       // put them somewhere at once
 *   a.goTo(x, z, 0.9);                     // walk there (m/s; slows and stops on arrival)
 *   a.face(yaw);                           // the way to face once standing
 *   a.pose(POSE.photo, now);               // a whole-body pose (eased)
 *   a.carry(1, now);                       // hold the prop up the carry way
 *   a.lookAt(point, now + 2);              // turn the head to a point for 2 s
 *   a.step(dt, now);                       // once a frame: moves, turns, writes
 *
 * After everyone has stepped, `keepApart` keeps bodies from overlapping.
 */
export class Actor {
  readonly i: number;
  x = 0;
  y = 0;
  z = 0;
  yaw = 0;
  /** Speed now (m/s). */
  speed = 0;
  /** Shown on the map (else folded away: inside a temple, gone home). */
  shown = false;
  /** Riding something (a boat, a cart): `ride` puts them, `step` leaves the floor alone. */
  riding = false;
  private gx = 0;
  private gz = 0;
  private want = 0;
  private faceYaw: number | null = null;
  private lookPt: Point | null = null;
  /** (the point looked at, copied: no new object a call) */
  private readonly lookBuf: Point = { x: 0, y: 0, z: 0 };
  private lookYaw = 0;
  private lookPitch = 0;
  private lookUntil = -1;
  private traffic: Traffic | null = null;
  private group = '';
  private readonly goal = { x: 0, z: 0 };

  constructor(
    readonly crowd: Crowd,
    public look: Look,
    readonly ground: Ground,
  ) {
    this.i = crowd.add(look);
  }

  /**
   * Keep out of the way of animals (the elephants) and give the explorer a
   * little room, on their own: every goal is moved aside first (`group`:
   * the group's own people are not in the way).
   */
  avoid(traffic: Traffic, group: string): this {
    this.traffic = traffic;
    this.group = group;
    return this;
  }

  /** Put them at a point at once (and stop). */
  warp(x: number, y: number, z: number, yaw: number): void {
    this.x = this.gx = x;
    this.y = y;
    this.z = this.gz = z;
    this.yaw = yaw;
    this.speed = this.want = 0;
    this.faceYaw = null;
    this.riding = false;
  }

  /**
   * On a boat or a cart: stand (or sit) exactly at (x, y, z) facing `yaw`,
   * whatever the floor there (`step` then only poses, looks and writes).
   * `riding = false` (or `warp`) puts them back on their feet.
   */
  ride(x: number, y: number, z: number, yaw: number): void {
    this.x = this.gx = x;
    this.y = y;
    this.z = this.gz = z;
    this.yaw = yaw;
    this.speed = this.want = 0;
    this.faceYaw = null;
    this.riding = true;
  }

  /** Walk towards (x, z) at up to `speed` m/s (slowing on arrival, then standing; a walk quickens in the rain: `RAIN_PACE`). */
  goTo(x: number, z: number, speed: number): void {
    this.gx = x;
    this.gz = z;
    this.want = speed >= 0.5 ? speed * RAIN_PACE.hurry : speed;
  }

  /** Stand still (where they are), turning to `yaw` if given. */
  stop(yaw?: number): void {
    this.gx = this.x;
    this.gz = this.z;
    this.want = 0;
    if (yaw !== undefined) this.faceYaw = yaw;
  }

  /** Once standing, face `yaw` (null: keep the way they walked). */
  face(yaw: number | null): void {
    this.faceYaw = yaw;
  }

  /** Heading from them to (x, z). */
  yawTo(x: number, z: number): number {
    return Math.atan2(x - this.x, z - this.z);
  }

  /** Distance to (x, z). */
  dist(x: number, z: number): number {
    return len(x - this.x, z - this.z);
  }

  /** At their goal (within 15 cm)? */
  get arrived(): boolean {
    return len(this.gx - this.x, this.gz - this.z) < 0.15;
  }

  /** How far they are from their goal (m): a group waits for anyone left behind. */
  get behind(): number {
    return len(this.gx - this.x, this.gz - this.z);
  }

  pose(p: Pose, now: number): void {
    this.crowd.pose(this.i, p, now);
  }

  get currentPose(): Pose {
    return this.crowd.poseOf(this.i);
  }

  /** Hold the prop the carry way (1) or let the arm go (0). */
  carry(w: number, now: number): void {
    this.crowd.carry(this.i, w, now);
  }

  /** Look at a point (the head turns, and the chest a little) until `until` (s; forever if omitted); null: ahead. */
  lookAt(p: Point | null, until = Infinity): void {
    if (p) {
      const b = this.lookBuf;
      b.x = p.x;
      b.y = p.y;
      b.z = p.z;
      this.lookPt = b;
    } else this.lookPt = null;
    this.lookUntil = until;
  }

  /** Tilt the head: −1 up ‥ 1 down (added to looking at a point: a nod). */
  tilt(pitch: number): void {
    this.lookPitch = pitch;
  }

  show(): void {
    this.shown = true;
  }

  hide(): void {
    this.shown = false;
    this.crowd.hide(this.i);
  }

  /**
   * Shuffle towards (x, z) by at most `max` m, facing the way they face (a
   * row working its way along a paddy: no turning round to walk a step);
   * then they stand there (`step` turns them to `face`).
   */
  shuffle(x: number, z: number, max: number): void {
    const dx = x - this.x;
    const dz = z - this.z;
    const d = len(dx, dz);
    const k = d > max ? max / d : 1;
    this.x = this.gx = this.x + dx * k;
    this.z = this.gz = this.z + dz * k;
    this.want = 0;
  }

  /** Shift them a little (kept apart from others; onto open ground only). */
  nudge(dx: number, dz: number): void {
    const x = this.x + dx;
    const z = this.z + dz;
    // (not off a boat or a cart)
    if (this.riding || !this.ground.free(x, z, this.y)) return;
    this.x = x;
    this.z = z;
    if (this.shown) this.crowd.place(this.i, this.x, this.y, this.z, this.yaw);
  }

  /** Move, turn, walk, look; write it all to the crowd. */
  step(dt: number, now: number): void {
    const c = this.crowd;
    // (out of an elephant's way first: quickly)
    const g0 = this.goal;
    g0.x = this.gx;
    g0.z = this.gz;
    const dodging = this.shown && !!this.traffic && this.traffic.dodge(g0, this.y, this.group, this.ground);
    const dx = g0.x - this.x;
    const dz = g0.z - this.z;
    const d = len(dx, dz);
    // Speed: towards the wanted one, slowing over the last metre; turn first.
    let target = d < 0.05 ? 0 : Math.min(dodging ? Math.max(this.want, 1.3) : this.want, d * 1.4 + 0.05);
    let err = 0;
    if (target > 0) {
      err = wrap(Math.atan2(dx, dz) - this.yaw);
      target *= Math.max(0, Math.cos(err)) ** 2;
      this.yaw = wrap(this.yaw + Math.max(-3 * dt, Math.min(3 * dt, err)));
    } else if (this.faceYaw !== null) {
      err = wrap(this.faceYaw - this.yaw);
      this.yaw = wrap(this.yaw + Math.max(-2.2 * dt, Math.min(2.2 * dt, err)));
    }
    this.speed += Math.max(-2.5 * dt, Math.min(1.5 * dt, target - this.speed));
    if (this.speed > 0 && d > 1e-4) {
      const k = Math.min(d, this.speed * dt) / d;
      // (goals are on the road, or checked for open ground: dodges, verges, nudges)
      this.x += dx * k;
      this.z += dz * k;
    }
    // (the floor under them: up and down steps, onto beacon discs and bridges; where a wall is, they keep their height)
    const g = this.riding ? NaN : this.ground.at(this.x, this.z, this.y);
    if (Number.isFinite(g)) this.y += (g - this.y) * (dt > 0 ? Math.min(1, dt * 10) : 1);
    // Gait: the stride follows the speed; turning on the spot shuffles.
    const walk = this.speed > 0.05 ? Math.min(1, 0.35 + this.speed * 0.7) : Math.abs(err) > 0.35 ? 0.3 : 0;
    const hz = this.speed > 0.05 ? c.stepRate(this.i, this.speed, walk) : 0.9;
    c.gait(this.i, walk, hz, now);
    // Head.
    if (this.lookPt && now < this.lookUntil) {
      const p = this.lookPt;
      const yaw = wrap(Math.atan2(p.x - this.x, p.z - this.z) - this.yaw);
      const h = len(p.x - this.x, p.z - this.z);
      const eye = this.y + 1.25 * c.scale(this.i);
      const pitch = -Math.atan2(p.y - eye, Math.max(0.5, h)) / 0.6 + this.lookPitch;
      this.lookYaw = Math.abs(yaw) < 1.6 ? yaw : 0;
      c.look(this.i, this.lookYaw, pitch, now);
    } else c.look(this.i, 0, this.lookPitch, now);
    if (this.shown) c.place(this.i, this.x, this.y, this.z, this.yaw);
  }
}

/**
 * People never stand inside each other or inside an animal: after everyone
 * has moved, any two closer than their bodies allow are pushed apart (each
 * half the way, only onto open ground), and anyone inside an animal or the
 * explorer is pushed out. `others`: the traffic's list (its animals and the
 * explorer count).
 */
export function keepApart(actors: readonly Actor[], others: readonly { x: number; y: number; z: number; r: number; who: string }[]): void {
  for (let i = 0; i < actors.length; i++) {
    const a = actors[i];
    if (!a.shown) continue;
    const ra = 0.22 * a.crowd.scale(a.i);
    for (let j = i + 1; j < actors.length; j++) {
      const b = actors[j];
      if (!b.shown || Math.abs(a.y - b.y) > 1.5) continue;
      const min = ra + 0.22 * b.crowd.scale(b.i);
      let dx = b.x - a.x;
      let dz = b.z - a.z;
      const d = len(dx, dz);
      if (d >= min) continue;
      if (d < 1e-3) {
        dx = Math.sin(a.i * 2.4);
        dz = Math.cos(a.i * 2.4);
      } else {
        dx /= d;
        dz /= d;
      }
      const push = (min - d) / 2;
      a.nudge(-dx * push, -dz * push);
      b.nudge(dx * push, dz * push);
    }
    for (const o of others) {
      if ((o.who !== 'animal' && o.who !== 'explorer') || Math.abs(o.y - a.y) > 2.5) continue;
      const min = o.r + ra;
      const dx = a.x - o.x;
      const dz = a.z - o.z;
      const d = len(dx, dz);
      if (d >= min || d < 1e-3) continue;
      a.nudge((dx / d) * (min - d), (dz / d) * (min - d));
    }
  }
}

export const TAU = Math.PI * 2;

export function wrap(a: number): number {
  a %= TAU;
  return a > Math.PI ? a - TAU : a < -Math.PI ? a + TAU : a;
}

export { POSE };
