import { MathUtils, Quaternion, Vector3, type PerspectiveCamera } from 'three';
import type { FollowCam, RoamWorld } from './types';

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** Angle a − b wrapped to −π‥π. */
export const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
/** Frame-rate independent easing factor for a rate (1/s). */
const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

/** Pitch range (radians): a little from below ‥ nearly straight down (`pitchMin` lets a mode look up further). */
const PITCH_MIN = -0.35;
const PITCH_MAX = 1.35;
/** Room kept between the camera and a solid block (m): the near plane is 0.5 m. */
const MARGIN = 0.7;
/** How far to each side of the camera walls are looked for too (m). */
const SIDE = 0.6;
/** Closest the camera comes to the focus when a wall pushes it in (m). */
const CLOSEST = 1.6;
/** How fast it comes in out of a tree (1/s): gently, the near fade sees through it. */
const SOFT_IN = 2.5;
/** A tree in this part of the way from its spot towards him counts as the camera being in it (nearer it than him: it fills the view). */
const TREE_NEAR = 0.5;
/** Seconds the auto-follow waits after the player turned the camera, and then takes to come back in full (no sudden swing). */
const HANDS_OFF = 1.6;
const HANDS_BACK = 1.2;

/**
 * An orbit camera round the explorer: behind him at `yaw`, tilted down by
 * `pitch`, `distance` away.
 *
 * - It follows the focus softly (a little slower up and down, so stairs and
 *   hops don't shake the view) and looks a little ahead of where he goes.
 * - Nothing solid comes between it and him: when a wall or the land is in
 *   the way it pulls in at once (and rises to look over a wall close behind
 *   him), then eases back out. Out of a tree (leaves, a trunk) it comes in
 *   softly: what is still close in front dissolves (_nearFade.ts).
 * - It never goes into the ground or the water.
 * - While he moves it swings round behind his heading by itself (`follow`),
 *   easing in a moment after the player last turned it (a drag, Q / R),
 *   and not while he walks towards it.
 * - It can blend in from wherever the camera was (the overview), so the
 *   switch is one smooth move.
 */
export class OrbitFollowCam implements FollowCam {
  readonly focus = new Vector3();
  yaw = 0;
  pitch = 0.3;
  distance = 9;
  minDistance = 3;
  maxDistance = 40;
  follow = 0;
  behindYaw = 0;
  fov = 50;
  pitchMin = PITCH_MIN;
  /** Seconds since the player last turned the camera. */
  private idle = 10;
  private blend = 1;
  private blendTime = 1;
  private readonly fromPos = new Vector3();
  private readonly fromQuat = new Quaternion();
  private fovNow = 50;
  /** The followed point (eased), the look-ahead and the focus's speed. */
  private readonly look = new Vector3();
  private readonly lead = new Vector3();
  private readonly last = new Vector3();
  private speed = 0;
  private fresh = true;
  /** Distance after walls pulled it in (eased out), and the extra tilt to see over a wall. */
  private reach = 9;
  private lift = 0;
  /** Hemmed in: a turn still to make towards more room (radians), and when to look again (s). */
  private roomTurn = 0;
  private roomWait = 0;
  private readonly _pos = new Vector3();
  private readonly _aim = new Vector3();
  private readonly _q = new Quaternion();

  constructor(readonly camera: PerspectiveCamera) {}

  blendFrom(seconds: number): void {
    this.fromPos.copy(this.camera.position);
    this.fromQuat.copy(this.camera.quaternion);
    this.fovNow = this.camera.fov;
    this.blend = seconds > 0 ? 0 : 1;
    this.blendTime = Math.max(0.01, seconds);
    this.fresh = true;
  }

  /** The player turned or zoomed the camera (orbit input, radians / wheel steps). */
  turn(dYaw: number, dPitch: number, zoom: number): void {
    if (dYaw || dPitch) this.idle = 0;
    this.yaw += dYaw;
    this.pitch = MathUtils.clamp(this.pitch + dPitch, this.pitchMin, PITCH_MAX);
    if (zoom) this.distance = MathUtils.clamp(this.distance * Math.pow(1.15, zoom), this.minDistance, this.maxDistance);
  }

  update(dt: number, world: RoamWorld): void {
    this.idle += dt;
    const f = this.focus;

    // ── Follow the focus ────────────────────────────────────────────────────
    if (this.fresh) {
      this.look.copy(f);
      this.last.copy(f);
      this.lead.set(0, 0, 0);
      this.speed = 0;
      this.reach = this.distance;
      this.fresh = false;
    } else if (dt > 0) {
      const vx = (f.x - this.last.x) / dt;
      const vz = (f.z - this.last.z) / dt;
      this.last.copy(f);
      // (a jump of many metres in one step is a teleport, not a speed)
      const v = Math.hypot(vx, vz);
      this.speed = v > 80 ? 0 : v;
      // Look ahead: where he will be in a quarter of a second (at most 2 m).
      const ahead = this.speed > 0.3 ? Math.min(0.25, 2 / this.speed) : 0;
      const k = damp(1.5, dt);
      this.lead.x += ((this.speed > 80 ? 0 : vx) * ahead - this.lead.x) * k;
      this.lead.z += ((this.speed > 80 ? 0 : vz) * ahead - this.lead.z) * k;
      const h = damp(12, dt);
      this.look.x += (f.x - this.look.x) * h;
      this.look.z += (f.z - this.look.z) * h;
      this.look.y += (f.y - this.look.y) * damp(7, dt);
      // Never trail far behind (a fall, a fast glide).
      this.look.y = MathUtils.clamp(this.look.y, f.y - 1.5, f.y + 1.5);
      const lag = Math.hypot(f.x - this.look.x, f.z - this.look.z);
      if (lag > 2) {
        this.look.x = f.x + ((this.look.x - f.x) * 2) / lag;
        this.look.z = f.z + ((this.look.z - f.z) * 2) / lag;
      }
    }

    // ── Swing round behind the heading while he moves ─────────────────────
    if (this.follow > 0 && this.idle > HANDS_OFF && this.speed > 0.5) {
      const diff = angleDiff(this.behindYaw, this.yaw);
      // Not when he walks towards the camera (that would spin the view round).
      const facing = MathUtils.clamp((2.6 - Math.abs(diff)) / 0.8, 0, 1);
      const back = MathUtils.smoothstep(this.idle, HANDS_OFF, HANDS_OFF + HANDS_BACK);
      const k = damp(this.follow * 2.5 * Math.min(1, this.speed / 4) * facing * back, dt);
      this.yaw += diff * k;
    }
    this.distance = MathUtils.clamp(this.distance, this.minDistance, this.maxDistance);

    // ── Where it wants to be, and what is in the way ──────────────────────
    // (it orbits the followed point, and looks a little ahead of it)
    const aim = this._aim.copy(this.look).add(this.lead);
    const clear = world.clearance ? (p: number, d: number, yaw = this.yaw) => this.free(world, yaw, p, d) : () => 1;
    let pitch = MathUtils.clamp(this.pitch + this.lift, this.pitchMin, PITCH_MAX);
    const span = this.distance + MARGIN;
    let free = clear(pitch, this.distance);
    // A wall close behind him: rise to look over it, if that sees him better.
    let liftGoal = 0;
    if (free * span < this.distance * 0.5) {
      for (const up of [0.3, 0.6, 0.9]) {
        const p = Math.min(PITCH_MAX, this.pitch + up);
        if (clear(p, this.distance) > 0.8) {
          liftGoal = p - this.pitch;
          break;
        }
      }
    }
    this.lift += (liftGoal - this.lift) * damp(liftGoal > this.lift ? 4 : 1.5, dt);
    pitch = MathUtils.clamp(this.pitch + this.lift, this.pitchMin, PITCH_MAX);
    free = clear(pitch, this.distance);
    // Hemmed in all round the back (a gallery, a gate): turn slowly to where
    // there is more room, the nearest way round, unless the player steers.
    if ((this.roomWait -= dt) <= 0) {
      this.roomWait = 0.3;
      this.roomTurn = 0;
      if (world.clearance && this.idle > HANDS_OFF && free * span < this.distance * 0.6) {
        let best = free + 0.2;
        for (const a of [0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 2, -2]) {
          const f = clear(pitch, this.distance, this.yaw + a);
          if (f > best) {
            best = f;
            this.roomTurn = a;
            if (f > 0.9) break;
          }
        }
      }
    }
    if (this.roomTurn) {
      const step = this.roomTurn * damp(1.2, dt);
      this.yaw += step;
      this.roomTurn -= step;
    }
    const room = Math.max(Math.min(CLOSEST, this.distance), free * span - MARGIN);
    // In a tree out there (a crown, a bush, a trunk): come in to this side of
    // it, softly (meanwhile the near fade, _nearFade.ts, sees through it).
    const trees = world.softClearance ? this.treeRoom(world, pitch, this.distance) : Infinity;
    const goal = Math.min(room, Math.max(Math.min(CLOSEST, this.distance), trees));
    // Pull in at once for a wall (never show the inside of it), ease in for a tree, ease back out.
    this.reach = room < this.reach ? room : this.reach + (goal - this.reach) * damp(goal < this.reach ? SOFT_IN : 2.2, dt);
    const pos = this.at(this.look, this.yaw, pitch, this.reach, this._pos);

    // Keep above the ground and the water under the camera.
    const floor = this.floorUnder(world, pos);
    if (pos.y < floor) pos.y = floor;

    const cam = this.camera;
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / this.blendTime);
      const e = ease(this.blend);
      cam.position.copy(pos);
      cam.lookAt(aim);
      this._q.copy(cam.quaternion);
      cam.position.lerpVectors(this.fromPos, pos, e);
      cam.quaternion.slerpQuaternions(this.fromQuat, this._q, e);
    } else {
      cam.position.copy(pos);
      cam.lookAt(aim);
    }
    // (a phone held upright: a wider view, or he fills the narrow screen)
    const fov = this.fov * (cam.aspect < 0.8 ? 1.25 : 1);
    this.fovNow += (fov - this.fovNow) * damp(3, dt);
    if (Math.abs(cam.fov - this.fovNow) > 0.01) {
      cam.fov = this.fovNow;
      cam.updateProjectionMatrix();
    }
  }

  /** Camera position on the orbit round `centre`. */
  private at(centre: Vector3, yaw: number, pitch: number, dist: number, out: Vector3): Vector3 {
    const cp = Math.cos(pitch);
    return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp).multiplyScalar(dist).add(centre);
  }

  /**
   * Free part (0‥1) of the way out to the orbit at this pitch and distance
   * (and a little past it: the near plane), from the followed point, of
   * what the camera cannot see through (trees aside: `treeRoom`).
   */
  private free(world: RoamWorld, yaw: number, pitch: number, dist: number): number {
    const clearance = (world.hardClearance ?? world.clearance)!;
    const o = this.look;
    const p = this.at(o, yaw, pitch, dist + MARGIN, this._pos);
    let t = clearance(o.x, o.y, o.z, p.x, p.y, p.z);
    // And a little to each side (the view is wide: a pillar just beside the
    // camera would fill half of it).
    const sx = Math.cos(yaw) * SIDE;
    const sz = -Math.sin(yaw) * SIDE;
    for (const k of [1, -1]) t = Math.min(t, clearance(o.x, o.y, o.z, p.x + sx * k, p.y, p.z + sz * k));
    return t;
  }

  /**
   * How far out it may go for trees (m): to this side of the first tree
   * (leaves, a trunk; not the bush he stands in) on the way out, when its
   * spot out there is in a tree or nearer one than him. Otherwise as far as
   * it likes: the near fade shows him through a tree close to him.
   */
  private treeRoom(world: RoamWorld, pitch: number, dist: number): number {
    const o = this.look;
    const p = this.at(o, this.yaw, pitch, dist + MARGIN, this._pos);
    const len = dist + MARGIN;
    // (the open part of the way from that spot, looking back at him)
    if (world.softClearance!(p.x, p.y, p.z, o.x, o.y, o.z) > TREE_NEAR) return Infinity;
    return world.softClearance!(o.x, o.y, o.z, p.x, p.y, p.z, true) * len - MARGIN;
  }

  /** Lowest the camera may be at its spot: over the ground (or the floor under a roof; not a tree it passes) and the water. */
  private floorUnder(world: RoamWorld, pos: Vector3): number {
    const water = world.waterAt(pos.x, pos.z) ?? -Infinity;
    // (right under something solid: the wall test has placed it already)
    const stand = world.hardStandAt ?? world.standAt;
    const ground = stand ? stand(pos.x, pos.z, pos.y, 0.9, 0) : world.groundAt(pos.x, pos.z);
    return Math.max(Number.isNaN(ground) ? -Infinity : ground + 0.9, water + 0.7);
  }
}
