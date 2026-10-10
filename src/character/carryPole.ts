import { Matrix4, Quaternion, Vector3, type Object3D } from 'three';
import { chestArm } from './gardenWork';
import type { Rig } from './Rig';

/**
 * The shoulder pole (ដងរែក, carrying water: រែកទឹក) on his body: the API the carry add-on
 * (roam/_carryPole*.ts) uses. The props (the pole, its two buckets, the coconut-shell dipper) and the
 * `Yoke` that hangs them on him are roam/_carryPoleProps.ts; the pole's five actions (poleUp, poleDown,
 * poleFill, poleJar, poleScoop) are postures of character/gardenWork.ts (`gardenBody(action)` +
 * `gardenPose(body)`, as the garden's work: `GardenBody.action` takes a `PoleAction` too).
 *
 * ```ts
 * // walking (or standing) with it: after the Animator's update each frame, over his walk
 * applyCarryWalk(explorer.rig, walk);          // walk: CarryWalk (weight, load, speed, run, phase, t)
 * yoke.frame(dt, walk.run, walk.jump);          // the buckets swing (YokeRig); yoke.rig.sway / slosh / spill
 * ```
 *
 * Units: body units (BU) in his space or his chest's (+z forward, +x his left, y up), as the other poses. The pole lies
 * on his right shoulder along his front-back line, a bucket hanging before him and one behind; his right hand holds
 * it before his shoulder, his left arm swings free (his walk's own swing, a little out for balance). Full buckets
 * bow the pole a little, bend him forward a little and lean him off the loaded shoulder; the walker keeps his legs
 * (walk him a little slower when full: `CARRY_PACE`, the shorter heavier step).
 */

export { HOOK_END, LEAN, SHOULDER_PAD, YOKE, YOKE_SWING, poleRest, yokePlace, type PoleRest, type YokePlace } from './_yoke';
import { YOKE_SWING } from './_yoke';
/** Walk him this much slower (× his speed) with full buckets (a shorter, heavier step); none with empty ones. */
export const CARRY_PACE = 0.82;

/** His walk with the pole, each frame (the carry add-on fills it). */
export interface CarryWalk {
  /** 0 not carrying ‥ 1 carrying (eases the pose in and out). */
  w: number;
  /** How full the buckets are together (0 empty ‥ 1 both full): his lean and the pole's bow. */
  load: number;
  /** His speed (m/s) and how much he runs (0‥1, Shift). */
  speed: number;
  run: number;
  /** The walk cycle's phase (0‥1: `explorer.animator.phase`) and the time (s). */
  phase: number;
  t: number;
  /** The pole's bob on his shoulder as the buckets pull (BU, YokeRig `bounce`; 0 standing). */
  bounce: number;
}

export function carryWalk(): CarryWalk {
  return { w: 0, load: 0, speed: 0, run: 0, phase: 0, t: 0, bounce: 0 };
}

// ── The walk with the pole ─────────────────────────────────────────────────

/** The right fist on the pole, before the shoulder pad (chest space, BU), and its elbow's way (down, out, a little forward). */
const FIST_ON_POLE = new Vector3(-4.6, 5.6, 4.6);
const ELBOW_R = new Vector3(-0.7, -1, 0.15).normalize();
/** The left arm a little out from his side for balance (added to the walk's swing, rad). */
const LEFT_OUT = 0.14;

const _q = new Quaternion();
const _m = new Matrix4();
const _v = new Vector3();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();

/** The pose over his walk with the pole (chest, neck, head as offsets; the right arm whole): the same objects every call. */
export interface CarryPose {
  chest: { rx: number; ry: number; rz: number };
  neck: { rx: number; rz: number };
  head: { ry: number; rz: number };
  /** The right arm's joints (shoulder, elbow, wrist: rx, ry, rz) and the shoulder's shift (BU). */
  arm: { shoulder: Vector3; shift: Vector3; elbow: number; wrist: Vector3 };
  leftOut: number;
}
const OUT: CarryPose = {
  chest: { rx: 0, ry: 0, rz: 0 },
  neck: { rx: 0, rz: 0 },
  head: { ry: 0, rz: 0 },
  arm: { shoulder: new Vector3(), shift: new Vector3(), elbow: 0, wrist: new Vector3() },
  leftOut: 0,
};

/**
 * His upper body with the pole at a moment (`s`): bent forward a little more when full and when he runs, the loaded
 * shoulder down a little and his head away from the pole, the shoulder bobbing with the bucket's pull; the right fist on
 * the pole, its grip along it. Not blended (see `applyCarryWalk`).
 */
export function carryWalkPose(s: CarryWalk): Readonly<CarryPose> {
  const moving = Math.min(1, s.speed / 1.5);
  const ph = s.phase * Math.PI * 2;
  const o = OUT;
  o.chest.rx = 0.05 + 0.07 * s.load + 0.1 * s.run + 0.012 * Math.sin(ph * 2) * moving;
  o.chest.ry = -0.06 - 0.03 * Math.sin(ph) * moving;
  o.chest.rz = 0.035 + 0.025 * s.load;
  o.neck.rx = -0.04 - 0.04 * s.load;
  o.neck.rz = -0.06;
  o.head.ry = 0.08;
  o.head.rz = -0.05;
  // The right fist on the pole (chest space), bobbing with it; its grip along the pole (+z), the forearm under it.
  _v.copy(FIST_ON_POLE);
  _v.y += s.bounce * 0.6;
  _z.set(0, 0, 1);
  _y.set(0, -0.35, -1).normalize();
  _x.crossVectors(_y, _z);
  _q.setFromRotationMatrix(_m.makeBasis(_x, _y.crossVectors(_z, _x), _z));
  const p = chestArm('R', _v, _q, ELBOW_R);
  const sh = p.shoulderR!;
  o.arm.shoulder.set(sh.rx ?? 0, sh.ry ?? 0, sh.rz ?? 0);
  o.arm.shift.set(sh.px ?? 0, sh.py ?? 0, sh.pz ?? 0);
  o.arm.elbow = p.elbowR?.rx ?? 0;
  const wr = p.wristR!;
  o.arm.wrist.set(wr.rx ?? 0, wr.ry ?? 0, wr.rz ?? 0);
  o.leftOut = LEFT_OUT * (1 + 0.5 * s.load);
  return o;
}

/**
 * Put the walk-with-the-pole pose on his rig over what the Animator set this frame (call it after the explorer's update,
 * as the umbrella does: roam/_umbrella.ts `after`): the chest, neck and head turns added, the right arm replaced, the
 * left arm a little out; all by `s.w` (0: untouched). No allocation.
 */
export function applyCarryWalk(rig: Rig, s: CarryWalk): void {
  const w = s.w;
  if (w <= 0.001) return;
  const p = carryWalkPose(s);
  const J = rig.joints;
  add(J.chest, p.chest.rx * w, p.chest.ry * w, p.chest.rz * w);
  add(J.neck, p.neck.rx * w, 0, p.neck.rz * w);
  add(J.head, 0, p.head.ry * w, p.head.rz * w);
  const a = p.arm;
  blend(J.shoulderR, a.shoulder.x, a.shoulder.y, a.shoulder.z, w);
  J.shoulderR.position.copy(rig.rest.shoulderR).addScaledVector(a.shift, w);
  blend(J.elbowR, a.elbow, 0, 0, w);
  blend(J.wristR, a.wrist.x, a.wrist.y, a.wrist.z, w);
  add(J.shoulderL, 0, 0, p.leftOut * w);
}

const add = (g: Object3D, x: number, y: number, z: number) => g.rotation.set(g.rotation.x + x, g.rotation.y + y, g.rotation.z + z);
function blend(g: Object3D, x: number, y: number, z: number, w: number): void {
  const r = g.rotation;
  r.set(r.x + (x - r.x) * w, r.y + (y - r.y) * w, r.z + (z - r.z) * w);
}

// ── The buckets swinging ───────────────────────────────────────────────────

/** One bucket's swing (its hook to its middle, as a share of the rope: x, z in the world) and its water's slop. */
export interface BucketSwing {
  /** The bucket out from under its hook (world x, z; share of `YOKE_SWING`) and how fast. */
  px: number;
  pz: number;
  vx: number;
  vz: number;
  /** The water's surface tilted in the bucket (world x, z: its slope) and how fast. */
  sx: number;
  sz: number;
  svx: number;
  svz: number;
  /** The hook last frame (world, m) and its speed (m/s), for its acceleration. */
  hx: number;
  hy: number;
  hz: number;
  hvx: number;
  hvy: number;
  hvz: number;
  /** A first frame (no history yet); a second (its speed, no acceleration yet). */
  fresh: boolean;
  primed: boolean;
}

const newSwing = (): BucketSwing => ({ px: 0, pz: 0, vx: 0, vz: 0, sx: 0, sz: 0, svx: 0, svz: 0, hx: 0, hy: 0, hz: 0, hvx: 0, hvy: 0, hvz: 0, fresh: true, primed: false });

/** The pendulum's and the water's numbers (the map's metres: a 0.75 m rope swings in about 1.7 s). */
const SWING = { g: 9.8, damp: 2.6, max: 0.6, waterK: 75, waterDamp: 4.5, spillAt: 0.2, smooth: 7, calmDrive: 0.5, calmRoom: 0.14, sloshFrom: 0.02 };

/**
 * The two buckets hanging from the pole's ends, swinging as he walks (allocation-free): each a pendulum from its hook
 * (the hook's own acceleration drives it: his starts and stops, the walk's bob, his turns), the water in it slopping
 * (its surface tilts against the swing's push and rings back), and water slopped over the rim when it tips too far
 * (sooner the fuller it is; big when he runs or jumps).
 *
 * Each frame: `update(dt, frontHook, backHook, fill, run)` with the hooks' world places (m: the pole's ends, as posed
 * this frame), how full each bucket is (0‥1) and how much he runs (0‥1). Then read `swing[0|1]` (the props pose the
 * buckets and their water by it), and `sway` (0‥1: how far they swing), `slosh` (0‥1: how much the water slops: the
 * `gardenSlosh` loop's level), `spill` (0‥1: how fast water goes over the rims now: lose `spill × dt × SPILL_RATE` of
 * a bucket's water; play `gardenSpill` and drop splashes while it is over ~0.1), `bounce` (BU: the pole's bob on the
 * shoulder: `CarryWalk.bounce`). `reset()` when it is picked up again (no memory of the last walk).
 */
export class YokeRig {
  readonly swing: [BucketSwing, BucketSwing] = [newSwing(), newSwing()];
  sway = 0;
  slosh = 0;
  spill = 0;
  /** How much each bucket spills now (0‥1). */
  readonly spills: [number, number] = [0, 0];
  bounce = 0;
  /** The pendulum's length (m: `YOKE_SWING` BU at his map size; set `scale` if he is drawn at another). */
  length = YOKE_SWING * 0.0735;

  reset(): void {
    for (const b of this.swing) Object.assign(b, newSwing());
    this.sway = this.slosh = this.spill = this.bounce = 0;
    this.spills[0] = this.spills[1] = 0;
  }

  update(dt: number, front: Vector3, back: Vector3, fill: readonly [number, number], run: number): void {
    if (dt <= 0) return;
    const h = Math.min(dt, 1 / 30);
    let sway = 0;
    let slosh = 0;
    let spill = 0;
    let bounce = 0;
    for (let i = 0; i < 2; i++) {
      const b = this.swing[i];
      const hook = i === 0 ? front : back;
      // The hook's speed and acceleration (world, m/s²), smoothed a little (the walk's steps are jerky).
      let ax = 0;
      let ay = 0;
      let az = 0;
      if (b.fresh) {
        b.fresh = false;
        b.primed = false;
        b.hvx = b.hvy = b.hvz = 0;
      } else if (!b.primed) {
        // (the second frame: its speed, no acceleration yet)
        b.primed = true;
        b.hvx = (hook.x - b.hx) / dt;
        b.hvy = (hook.y - b.hy) / dt;
        b.hvz = (hook.z - b.hz) / dt;
      } else {
        const vx = (hook.x - b.hx) / dt;
        const vy = (hook.y - b.hy) / dt;
        const vz = (hook.z - b.hz) / dt;
        // (smoothed: a walker's speed jumps between steps; a carrier's hand evens the pull out)
        const k = Math.min(1, dt * SWING.smooth);
        ax = ((vx - b.hvx) / dt) * k;
        ay = ((vy - b.hvy) / dt) * k;
        az = ((vz - b.hvz) / dt) * k;
        b.hvx += (vx - b.hvx) * k;
        b.hvy += (vy - b.hvy) * k;
        b.hvz += (vz - b.hvz) * k;
      }
      b.hx = hook.x;
      b.hy = hook.y;
      b.hz = hook.z;
      // (a teleport, a new place: no fling)
      const lim = 40;
      ax = clamp(ax, -lim, lim);
      ay = clamp(ay, -lim, lim);
      az = clamp(az, -lim, lim);
      // The pendulum (small angles, both ways at once): pulled back under the hook by gravity (and the hook's bob up or
      // down), pushed the other way by the hook's acceleration.
      // (walking calmly his hand steadies the pole: the buckets feel only part of his pushes; running, all of them)
      const drive = SWING.calmDrive + (1 - SWING.calmDrive) * run;
      const g = Math.max(2, SWING.g + ay * drive) / this.length;
      const fx = -g * b.px - (ax * drive) / this.length - SWING.damp * b.vx;
      const fz = -g * b.pz - (az * drive) / this.length - SWING.damp * b.vz;
      b.vx += fx * h;
      b.vz += fz * h;
      b.px += b.vx * h;
      b.pz += b.vz * h;
      const r = Math.hypot(b.px, b.pz);
      if (r > SWING.max) {
        b.px *= SWING.max / r;
        b.pz *= SWING.max / r;
        b.vx *= 0.5;
        b.vz *= 0.5;
      }
      // The water: its surface leans to where the bucket's push sends it (its slope toward the bucket's acceleration
      // over gravity: level with the rim as it swings steadily), and overshoots and rings when the push changes.
      const bax = fx * this.length + ax * drive;
      const baz = fz * this.length + az * drive;
      const wf = SWING.waterK * (-bax / SWING.g - b.sx) - SWING.waterDamp * b.svx;
      const wz = SWING.waterK * (-baz / SWING.g - b.sz) - SWING.waterDamp * b.svz;
      b.svx += wf * h;
      b.svz += wz * h;
      b.sx += b.svx * h;
      b.sz += b.svz * h;
      let ss = Math.hypot(b.sx, b.sz);
      if (ss > 0.9) {
        b.sx *= 0.9 / ss;
        b.sz *= 0.9 / ss;
      }
      // (against the bucket's own tilt: what slops toward a rim)
      ss = Math.hypot(b.sx - b.px, b.sz - b.pz);
      // Over the rim: the slope (and the jolt up or down) past what the rim's height over the water allows.
      const f = fill[i];
      const room = SWING.spillAt * (1.15 - f) + 0.02 + SWING.calmRoom * (1 - run);
      // (a jolt: a jump's landing, a stumble; the walk's own bob does not spill)
      const jolt = Math.max(0, Math.abs(ay) - 18) / 30;
      const over = f > 0.05 ? Math.max(0, (ss + jolt) - room) / 0.25 + 0.35 * run * f * Math.min(1, Math.hypot(b.hvx, b.hvz) / 2) : 0;
      this.spills[i] = Math.min(1, over);
      sway = Math.max(sway, r / SWING.max);
      slosh = Math.max(slosh, clamp((ss - SWING.sloshFrom) / 0.2, 0, 1) * Math.min(1, f * 3));
      spill = Math.max(spill, this.spills[i]);
      bounce += (ay / SWING.g) * 0.25 * (0.4 + f);
    }
    // (never NaN or Infinity: a bad frame's numbers are taken as calm)
    this.sway = Number.isFinite(sway) ? sway : 0;
    this.slosh = Number.isFinite(slosh) ? slosh : 0;
    this.spill = Number.isFinite(spill) ? spill : 0;
    for (let i = 0; i < 2; i++) if (!Number.isFinite(this.spills[i])) this.spills[i] = 0;
    if (!Number.isFinite(bounce)) bounce = 0;
    this.bounce += (clamp(-bounce, -1, 1) * 0.5 - this.bounce) * Math.min(1, dt * 10);
  }
}
/** Spilling at full rate (`spill` 1) loses this share of a full bucket a second. */
export const SPILL_RATE = 0.12;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
