import { Matrix4, Vector3 } from 'three';
import { RUN_SPEED, WALK_SPEED } from '../world/scale';
import {
  ACTIONS,
  ARM_JOINTS_L,
  FULL_BODY,
  airborne,
  holdLantern,
  holdTorch,
  idle,
  landing,
  run,
  runFlight,
  walk,
  type ActionName,
} from './clips';
import { PoseBuffer, clamp, lerp } from './pose';
import type { Rig } from './Rig';
import { JOINT_NAMES, SOLE_POINTS, type JointName } from './skeleton';

/** Distance covered by one full walk / run cycle (two steps), metres. */
const WALK_CYCLE_M = 1.05;
const RUN_CYCLE_M = 1.85;

export type HoldKind = 'none' | 'lantern' | 'torch';

interface ActiveAction {
  name: ActionName;
  t: number;
  weight: number;
  stopping: boolean;
}

const _m = new Matrix4();
const _v = new Vector3();

/**
 * Drives the rig every frame: blends idle / walk / run by speed (phase-locked to
 * distance travelled so feet don't skate), layers jumps, landings, actions and
 * the prop-holding arm, then plants the lowest sole on the ground.
 */
export class Animator {
  time = 0;
  phase = 0;
  private speed = 0;
  private grounded = true;
  private vy = 0;
  private airW = 0;
  private landK = 1;
  private action: ActiveAction | null = null;
  private hold: HoldKind = 'none';
  private holdW = 0;
  private readonly buf = new PoseBuffer();
  /** Extra body height from the run's flight phase (BU). */
  private flight = 0;
  onActionEnd?: (name: ActionName) => void;

  constructor(private readonly rig: Rig) {}

  /** Feed controller state: horizontal speed (m/s), grounded flag, vertical speed (m/s). */
  setMotion(speed: number, grounded: boolean, verticalSpeed = 0): void {
    if (grounded && !this.grounded && this.vy < -2.5) this.landK = 0;
    this.speed = Math.max(0, speed);
    this.grounded = grounded;
    this.vy = verticalSpeed;
  }

  setHold(kind: HoldKind): void {
    this.hold = kind;
  }

  play(name: ActionName): void {
    if (this.action && this.action.name === name && !this.action.stopping) {
      if (!ACTIONS[name].loop) this.action.t = 0;
      return;
    }
    const w = this.action ? this.action.weight : 0;
    this.action = { name, t: 0, weight: w, stopping: false };
  }

  /** Stop the current (looping) action, fading out. */
  stop(name?: ActionName): void {
    if (this.action && (!name || this.action.name === name)) this.action.stopping = true;
  }

  get currentAction(): ActionName | null {
    return this.action && !this.action.stopping ? this.action.name : null;
  }

  /** Seconds since the current action started (0 when there is none). */
  get actionTime(): number {
    return this.action && !this.action.stopping ? this.action.t : 0;
  }

  /** True while a full-body action wants the character to stand still. */
  get isBusy(): boolean {
    return !!this.action && !this.action.stopping && !ACTIONS[this.action.name].allowLocomotion;
  }

  update(dt: number): void {
    this.time += dt;
    const buf = this.buf.clear();

    // ── Locomotion ───────────────────────────────────────────────────────
    const walkW = clamp(this.speed / (WALK_SPEED * 0.9), 0, 1);
    const runW = clamp((this.speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED), 0, 1);
    const cycle = lerp(WALK_CYCLE_M, RUN_CYCLE_M, runW);
    // Phase advances with distance; below walking speed the stride shrinks via walkW.
    this.phase = (this.phase + (this.speed * dt) / cycle) % 1;
    buf.add(idle(this.time), 1 - walkW);
    buf.add(walk(this.phase), walkW * (1 - runW));
    buf.add(run(this.phase), walkW * runW);
    const flightTarget = this.grounded ? runFlight(this.phase) * walkW * runW : 0;
    this.flight = lerp(this.flight, flightTarget, clamp(dt * 20, 0, 1));

    // ── Air / landing ────────────────────────────────────────────────────
    this.airW = lerp(this.airW, this.grounded ? 0 : 1, clamp(dt * (this.grounded ? 14 : 8), 0, 1));
    if (this.airW > 0.001) buf.override(airborne(this.vy / 4), this.airW, FULL_BODY);
    if (this.landK < 1) {
      this.landK = Math.min(1, this.landK + dt / 0.28);
      buf.add(landing(this.landK), 1);
    }

    // ── Held prop arm layer ──────────────────────────────────────────────
    this.holdW = lerp(this.holdW, this.hold === 'none' ? 0 : 1, clamp(dt * 8, 0, 1));
    if (this.holdW > 0.001 && this.hold !== 'none') {
      const pose = this.hold === 'lantern' ? holdLantern(this.time) : holdTorch(this.time);
      // Keep a little of the locomotion arm swing so the held arm isn't frozen.
      const swing = buf.get('shoulderL', 0) * 0.18;
      buf.override(pose, this.holdW, ARM_JOINTS_L);
      buf.set('shoulderL', 0, buf.get('shoulderL', 0) + swing * this.holdW);
    }

    // ── Actions ──────────────────────────────────────────────────────────
    const a = this.action;
    if (a) {
      const def = ACTIONS[a.name];
      a.t += dt;
      if (!def.loop && a.t >= def.duration - def.fadeOut) a.stopping = true;
      const target = a.stopping ? 0 : 1;
      const rate = a.stopping ? 1 / def.fadeOut : 1 / def.fadeIn;
      a.weight = clamp(a.weight + Math.sign(target - a.weight) * rate * dt, 0, 1);
      const t = def.loop ? a.t % def.duration : Math.min(a.t, def.duration);
      const joints = this.hold !== 'none' ? def.joints.filter((j) => !ARM_JOINTS_L.includes(j) || a.name === 'peek') : def.joints;
      buf.override(def.pose(t), a.weight, joints);
      if (a.stopping && a.weight <= 0) {
        this.action = null;
        this.onActionEnd?.(a.name);
      }
    }

    this.apply();
  }

  private apply(): void {
    const { rig, buf } = this;
    for (const name of JOINT_NAMES) {
      if (name === 'root') continue;
      const j = rig.joints[name];
      const r = rig.rest[name];
      j.rotation.set(buf.get(name, 0), buf.get(name, 1), buf.get(name, 2));
      j.position.set(r.x + buf.get(name, 3), r.y + buf.get(name, 4), r.z + buf.get(name, 5));
    }
    // Foot planting: drop / lift the body so the lowest sole point touches y = 0.
    const body = rig.joints.body;
    let minY = Infinity;
    for (const ankle of ['ankleL', 'ankleR'] as JointName[]) {
      rig.chainMatrix(ankle, _m);
      for (const p of SOLE_POINTS) {
        _v.set(p[0], p[1], p[2]).applyMatrix4(_m);
        minY = Math.min(minY, _v.y);
      }
    }
    body.position.y += -minY + this.flight * (1 - this.airW);
  }
}
