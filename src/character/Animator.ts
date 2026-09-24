import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { BODY_UNIT_M, RUN_SPEED, WALK_SPEED } from '../world/scale';
import {
  ACTIONS,
  ARM_JOINTS_L,
  ARM_JOINTS_R,
  FULL_BODY,
  airborne,
  gait,
  holdFlashlight,
  holdLantern,
  holdTorch,
  idle,
  landing,
  lookAlong,
  type ActionName,
} from './clips';
import { CAMERA_BODY_CENTER } from './parts/gear';
import { PoseBuffer, clamp, lerp, type Pose } from './pose';
import type { Rig } from './Rig';
import { JOINTS, JOINT_NAMES, SOLE_POINTS, type JointName } from './skeleton';

/** Distance covered by one full walk / run cycle (two steps), metres. */
const WALK_CYCLE_M = 1.05;
const RUN_CYCLE_M = 1.85;

export type HoldKind = 'none' | 'lantern' | 'torch' | 'flashlight';

interface ActiveAction {
  name: ActionName;
  t: number;
  weight: number;
  stopping: boolean;
}

const _m = new Matrix4();
const _m2 = new Matrix4();
const _v = new Vector3();
const _v2 = new Vector3();
const _q = new Quaternion();
const _e = new Euler();
const ONE = new Vector3(1, 1, 1);

// ── Photo: the camera held up to the eye ──────────────────────────────────
// Head space (BU): the camera body sits in front of the eyes, a fist on each side.
const PHOTO_CAMERA = new Vector3(0, 3.2, 5.35);
const PHOTO_FIST = { L: new Vector3(2.6, 2.7, 5.2), R: new Vector3(-2.6, 2.7, 5.2) };
/** Which way the elbows point: down and out. */
const PHOTO_POLE = { L: new Vector3(0.75, -1, -0.1).normalize(), R: new Vector3(-0.75, -1, -0.1).normalize() };
/** Camera joint origin in head space that puts the camera body at PHOTO_CAMERA. */
const PHOTO_CAMERA_JOINT = PHOTO_CAMERA.clone().sub(new Vector3(...CAMERA_BODY_CENTER).sub(new Vector3(...JOINTS.camera.pivot)));

const sub = (a: JointName, b: JointName) => new Vector3(...JOINTS[a].pivot).sub(new Vector3(...JOINTS[b].pivot));
/** Arm bones in chest space (BU): shoulder position, upper arm and forearm (elbow → fist) at rest. */
const ARMS = {
  L: { shoulder: sub('shoulderL', 'chest'), upper: sub('elbowL', 'shoulderL'), fore: sub('propL', 'elbowL') },
  R: { shoulder: sub('shoulderR', 'chest'), upper: sub('elbowR', 'shoulderR'), fore: sub('propR', 'elbowR') },
};

const _d = new Vector3();
const _p = new Vector3();
const _u = new Vector3();
const _f = new Vector3();
const _b1 = new Vector3();
const _b2 = new Vector3();
const _b3 = new Vector3();
const _rest = new Matrix4();

/** Orthonormal frame from a direction and a second vector in its plane (as matrix columns). */
function frame(a: Vector3, b: Vector3, out: Matrix4): Matrix4 {
  _b1.copy(a).normalize();
  _b2.copy(b).addScaledVector(_b1, -b.dot(_b1)).normalize();
  _b3.crossVectors(_b1, _b2);
  return out.makeBasis(_b1, _b2, _b3);
}

/**
 * Two-bone arm IK in chest space: shoulder rotation and elbow bend that put
 * the fist on `target`, the elbow bent toward `pole`.
 */
function solveArm(side: 'L' | 'R', target: Vector3, pole: Vector3): Pose {
  const arm = ARMS[side];
  const a = arm.upper.length();
  const b = arm.fore.length();
  _d.subVectors(target, arm.shoulder);
  const len = clamp(_d.length(), Math.abs(a - b) + 0.01, a + b - 0.01);
  _d.normalize();
  const cosA = (a * a + len * len - b * b) / (2 * a * len);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d)).normalize();
  _u.copy(_d).multiplyScalar(cosA).addScaledVector(_p, sinA); // upper arm direction
  _f.copy(_d).multiplyScalar(len).addScaledVector(_u, -a).normalize(); // forearm direction
  // The rest arm has a small kink (upper arm splayed out, forearm straight down);
  // bend the elbow (− = forward) so the angle between the bones matches.
  const u0 = _v.copy(arm.upper).normalize();
  const elbow = -Math.acos(clamp(_u.dot(_f) / -u0.y, -1, 1));
  _v2.set(0, -Math.cos(elbow), -Math.sin(elbow));
  // Shoulder rotation: the rest (upper arm, bent forearm) pair onto the solved pair.
  frame(u0, _v2, _rest).transpose();
  frame(_u, _f, _m2).multiply(_rest);
  _e.setFromRotationMatrix(_m2, 'XYZ');
  return {
    [`shoulder${side}`]: { rx: _e.x, ry: _e.y, rz: _e.z },
    [`elbow${side}`]: { rx: elbow },
    [`wrist${side}`]: {},
  };
}

/**
 * Drives the rig every frame: blends idle / walk / run by speed (phase-locked to
 * distance travelled, with IK legs, so feet don't skate), layers jumps,
 * landings, actions and the prop-holding arm, then plants the lowest sole on the
 * ground.
 */
export class Animator {
  time = 0;
  phase = 0;
  private speed = 0;
  private grounded = true;
  private vy = 0;
  private airW = 0;
  private groundW = 1;
  private landK = 1;
  private action: ActiveAction | null = null;
  private hold: HoldKind = 'none';
  private holdW = 0;
  /** Where the flashlight points, from the chest (radians; yaw + = left, pitch + = up). */
  private aimYaw = 0;
  private aimPitch = 0;
  private readonly buf = new PoseBuffer();
  /** Extra body height from the run's flight phase (BU). */
  private flight = 0;
  /**
   * The photo pose's camera-at-the-eye: how far it is raised (0‥1) and where
   * the camera joint goes then (chest space).
   */
  readonly photoHold = { weight: 0, matrix: new Matrix4() };
  onActionEnd?: (name: ActionName) => void;
  /**
   * A whole-body pose from outside, over everything else (hanging under a
   * parachute, sitting in a boat), as a function of time (s); null for none.
   * It eases in and out.
   */
  posture: ((t: number) => Pose) | null = null;
  /**
   * Plant the lowest sole on the ground under the posture (true), or let the
   * posture place the body itself (false: sitting, hanging).
   */
  postureFeet = true;
  private postureW = 0;
  private lastPosture: ((t: number) => Pose) | null = null;

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

  /** Beam direction for the flashlight arm (radians from the body's facing). */
  setAim(yaw: number, pitch: number): void {
    this.aimYaw = yaw;
    this.aimPitch = pitch;
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
    // Below walking speed the steps get shorter (not slower), so a planted foot
    // still keeps pace with the ground.
    const cycle = lerp(WALK_CYCLE_M, RUN_CYCLE_M, runW) * Math.max(0.3, walkW);
    this.phase = (this.phase + (this.speed * dt) / cycle) % 1;
    buf.add(idle(this.time), 1 - walkW);
    const step = gait(this.phase, runW, walkW, cycle / BODY_UNIT_M);
    buf.add(step.pose, 1);
    // The run's flight lifts the body by exactly how far both feet are off the
    // ground, so the planting below doesn't pull it back down.
    this.groundW = lerp(this.groundW, this.grounded ? 1 : 0, clamp(dt * 20, 0, 1));
    this.flight = step.lift * this.groundW;

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
      // The chest takes some of the flashlight's turn, the arm the rest.
      const armYaw = this.aimYaw * 0.7;
      const pose =
        this.hold === 'lantern' ? holdLantern(this.time) : this.hold === 'torch' ? holdTorch(this.time) : holdFlashlight(this.time, armYaw, this.aimPitch);
      // Keep a little of the locomotion arm swing so the held arm isn't frozen.
      const swing = buf.get('shoulderL', 0) * 0.18;
      buf.override(pose, this.holdW, ARM_JOINTS_L);
      buf.set('shoulderL', 0, buf.get('shoulderL', 0) + swing * this.holdW);
      if (this.hold === 'flashlight') buf.add(lookAlong(this.aimYaw, this.aimPitch), this.holdW);
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
      if (a.name === 'photo') this.holdCamera(a.weight);
      if (a.stopping && a.weight <= 0) {
        this.action = null;
        this.onActionEnd?.(a.name);
      }
    }
    if (this.action?.name !== 'photo') this.photoHold.weight = 0;

    // ── Posture (vehicles) ───────────────────────────────────────────────
    if (this.posture) this.lastPosture = this.posture;
    this.postureW = lerp(this.postureW, this.posture ? 1 : 0, clamp(dt * 7, 0, 1));
    if (this.postureW < 0.001) this.lastPosture = null;
    if (this.lastPosture) buf.override(this.lastPosture(this.time), this.postureW, FULL_BODY);

    this.apply();
  }

  /** Photo: look where the photo looks, and put the hands on the camera at the eye. */
  private holdCamera(w: number): void {
    const buf = this.buf;
    const yaw = this.aimYaw;
    const pitch = this.aimPitch;
    buf.add({ chest: { ry: 0.3 * yaw }, neck: { rx: -0.25 * pitch, ry: 0.25 * yaw }, head: { rx: -0.75 * pitch, ry: 0.45 * yaw } }, w);
    // Head in chest space, from this frame's pose.
    this.localMatrix('neck', _m).multiply(this.localMatrix('head', _m2));
    this.photoHold.weight = w;
    this.photoHold.matrix.copy(_m).multiply(_m2.makeTranslation(PHOTO_CAMERA_JOINT));
    const target = new Vector3();
    for (const side of this.hold === 'none' ? (['L', 'R'] as const) : (['R'] as const)) {
      target.copy(PHOTO_FIST[side]).applyMatrix4(_m);
      buf.override(solveArm(side, target, PHOTO_POLE[side]), w, side === 'L' ? ARM_JOINTS_L : ARM_JOINTS_R);
    }
  }

  /** A joint's transform relative to its parent, from the pose buffer. */
  private localMatrix(name: JointName, out: Matrix4): Matrix4 {
    const r = this.rig.rest[name];
    const buf = this.buf;
    _v.set(r.x + buf.get(name, 3), r.y + buf.get(name, 4), r.z + buf.get(name, 5));
    _q.setFromEuler(_e.set(buf.get(name, 0), buf.get(name, 1), buf.get(name, 2)));
    return out.compose(_v, _q, ONE);
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
    const plant = this.postureFeet || !this.lastPosture ? 1 : 1 - this.postureW;
    body.position.y += (-minY + this.flight * (1 - this.airW)) * plant;
  }
}
