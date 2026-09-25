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
import { PHONE_LENS, STICK_JOINT } from './parts/props';
import { PoseBuffer, clamp, lerp, type JointPose, type Pose } from './pose';
import type { Rig } from './Rig';
import { JOINTS, JOINT_NAMES, SOLE_POINTS, type JointName } from './skeleton';

/** Distance covered by one full walk / run cycle (two steps), metres. */
const WALK_CYCLE_M = 1.05;
const RUN_CYCLE_M = 1.85;

export type HoldKind = 'none' | 'lantern' | 'torch' | 'flashlight';
/** What the free (left) hand does in a selfie. */
export type SelfieGesture = 'peace' | 'wave' | 'thumbsUp' | 'none';

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

// ── Selfie: the phone held out round the head ─────────────────────────────
/** Head space (BU): the point the phone circles, the middle of the head at eye height. */
export const SELFIE_CENTER = new Vector3(0, 3.2, 0.3);
/** Nearest the lens comes to that point: the phone stays clear of the face. */
const SELFIE_NEAR = 7.4;
/** Reaching out brings the shoulder forward and up (chest space, BU). */
const SHRUG = { R: new Vector3(0.4, 0.6, 1.5), L: new Vector3(-0.25, 0.45, 0.9) };
/** The phone elbow points down and out. */
const SELFIE_POLE = new Vector3(-0.8, -1, -0.25).normalize();
/** How far the phone can go round the head (radians); the arm limits it further. */
const SELFIE_YAW = [-1.35, 0.35] as const;
const SELFIE_PITCH = [-0.45, 0.75] as const;
/** The chest turns a little to his left, bringing the phone shoulder forward. */
const selfieChestYaw = (yaw: number) => 0.18 + 0.1 * yaw;
/**
 * The selfie stick: the lens goes this far from the head's middle (BU, from
 * no reach to full reach: about 0.95‥1.9 m at true size), and round the head
 * much further than the arm alone lets it (radians): high over him (short of
 * straight up, where the pole would pass his hat), low, and round to his
 * right side; to his left less far (the right hand holds it: the pole
 * would cross his chest).
 */
export const STICK_REACH = [18, 36] as const;
const STICK_YAW = [-2.0, 0.7] as const;
const STICK_PITCH = [-0.7, 1.35] as const;
/**
 * With the stick the arm reaches this share of its length out, this far
 * (radians) below the line from the shoulder to the phone: the pole leaves
 * the top of the fist at an easy angle to the forearm (the wrist bent a
 * little), as a stick is held, not straight on from the arm.
 */
const STICK_ARM = 0.84;
const STICK_DIP = 0.6;
const STICK_RAISE = 0.45;
const STICK_LOWER = -0.9;
/** On the stick the shoulder comes forward less (the pole does the reaching), and hardly up (clear of his jaw). */
const SHRUG_STICK = new Vector3(0.3, 0.15, 0.9);

interface GestureDef {
  /**
   * Fist position from the head's middle in the phone's view (BU): x to the
   * right of the picture (his left), y up, z toward the phone — so the phone
   * always sees the hand beside his big head.
   */
  fist: Vector3;
  /** Which way the elbow points, in the same frame. */
  pole: Vector3;
  /**
   * `palm`: the hand stands up from the wrist, fingers up, palm to the phone;
   * `thumb`: a fist with the thumb up and the knuckles to the phone.
   */
  hand: 'palm' | 'thumb';
}
const GESTURES: Record<Exclude<SelfieGesture, 'none'>, GestureDef> = {
  // Two fingers up beside the face.
  peace: { fist: new Vector3(9.4, -3.3, 3.0), pole: new Vector3(0.6, -1, -0.5).normalize(), hand: 'palm' },
  // Open hand up beside the head, waving.
  wave: { fist: new Vector3(7.4, 0.0, 1.4), pole: new Vector3(0.7, -1, -0.5).normalize(), hand: 'palm' },
  // Fist below the chin, thumb up.
  thumbsUp: { fist: new Vector3(4.6, -6.0, 3.4), pole: new Vector3(0.5, -0.6, -1).normalize(), hand: 'thumb' },
};
/** On the stick, the free hand's gesture goes down as the phone goes round to his right side, between these aims (radians). */
const STICK_GESTURE_YAW = [-1.4, -1.2] as const;
/** A far point along the phone's view (BU): the palm turns to the picture, not just the lens. */
const VIEW_FAR = 20;

const _d = new Vector3();
const _p = new Vector3();
const _u = new Vector3();
const _f = new Vector3();
const _b1 = new Vector3();
const _b2 = new Vector3();
const _b3 = new Vector3();
const _rest = new Matrix4();
const _c = new Vector3();
const _c2 = new Vector3();
const _dir = new Vector3();
const _sh = new Vector3();
const _up = new Vector3();
const _g = new Vector3();
const _right = new Vector3();
const _qw = new Quaternion();

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
function solveArm(side: 'L' | 'R', target: Vector3, pole: Vector3, shrug?: Vector3): Pose {
  const arm = ARMS[side];
  const a = arm.upper.length();
  const b = arm.fore.length();
  _d.subVectors(target, arm.shoulder);
  if (shrug) _d.sub(shrug);
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
    [`shoulder${side}`]: { rx: _e.x, ry: _e.y, rz: _e.z, px: shrug?.x, py: shrug?.y, pz: shrug?.z },
    [`elbow${side}`]: { rx: elbow },
    [`wrist${side}`]: {},
  };
}

/** Forearm rotation (chest space) of an arm posed by `solveArm`. */
function forearmRotation(pose: Pose, side: 'L' | 'R', out: Matrix4): Matrix4 {
  const s = pose[`shoulder${side}`]!;
  out.makeRotationFromEuler(_e.set(s.rx ?? 0, s.ry ?? 0, s.rz ?? 0, 'XYZ'));
  return out.multiply(_rest.makeRotationX(pose[`elbow${side}`]!.rx ?? 0));
}

/**
 * Wrist rotation that turns the left hand of an arm posed by `solveArm` to face
 * `view` (chest space): `palm` stands the fingers along `up` with the palm to
 * the view; else the thumb goes up and the curled fingers face the view.
 * (Hand frame: fingers along −Y, palm toward −X, thumb toward +Z.)
 */
function wristAim(pose: Pose, palm: boolean, up: Vector3, view: Vector3, out: Quaternion): Quaternion {
  const fore = forearmRotation(pose, 'L', _m2);
  if (palm) {
    _u.copy(up).negate(); // +Y
    _p.copy(view).addScaledVector(up, -view.dot(up)).normalize().negate(); // +X
    _f.crossVectors(_p, _u); // +Z
  } else {
    _f.copy(up); // +Z
    _u.copy(view).addScaledVector(up, -view.dot(up)).normalize().negate(); // +Y
    _p.crossVectors(_u, _f); // +X
  }
  _rest.makeBasis(_p, _u, _f);
  return out.setFromRotationMatrix(fore.transpose().multiply(_rest));
}

/**
 * The fist on the stick (chest space): out from the shoulder the way the
 * phone is round him (`dir`), dipped below the line to the lens, between
 * `STICK_LOWER` and `STICK_RAISE` (a phone high over him: the fist stays by
 * his chin, the pole goes up steeply, clear of his head; a phone low down:
 * the fist stays out in front, the pole clear of his belt).
 */
function stickFist(lens: Vector3, shoulder: Vector3, dir: Vector3, length: number, out: Vector3): Vector3 {
  out.subVectors(lens, shoulder);
  const el = clamp(Math.atan2(out.y, Math.hypot(out.x, out.z)) - STICK_DIP, STICK_LOWER, STICK_RAISE);
  // (straight overhead there is no way round him: out in front)
  const flat = Math.hypot(dir.x, dir.z);
  const hx = flat > 1e-4 ? dir.x / flat : 0;
  const hz = flat > 1e-4 ? dir.z / flat : 1;
  return out.set(hx * Math.cos(el), Math.sin(el), hz * Math.cos(el)).multiplyScalar(length).add(shoulder);
}

/**
 * Wrist rotation that turns the right fist of an arm posed by `solveArm` (at
 * `fist`, chest space) so the pole runs through it along its grip axis (+Z,
 * out past the thumb) to `to`: the fingers' axis stays as near the forearm's
 * line as the pole lets it.
 */
function stickWrist(pose: Pose, fist: Vector3, to: Vector3): JointPose {
  const fore = forearmRotation(pose, 'R', _m2);
  // The pole in the forearm's frame.
  _f.subVectors(to, fist).normalize().applyMatrix4(_rest.copy(fore).transpose());
  _u.set(0, 1, 0).addScaledVector(_f, -_f.y).normalize();
  _p.crossVectors(_u, _f);
  _e.setFromRotationMatrix(_rest.makeBasis(_p, _u, _f), 'XYZ');
  return { rx: _e.x, ry: _e.y, rz: _e.z };
}

/** Rest arm geometry for the selfie reach (chest space, BU). */
const SELFIE_REST = {
  center: SELFIE_CENTER.clone().add(sub('head', 'chest')),
  shoulder: ARMS.R.shoulder.clone().add(SHRUG.R),
  arm: ARMS.R.upper.length() + ARMS.R.fore.length() - 0.02,
};

/**
 * How far from the head's middle the lens goes (BU) with the phone at `dir`
 * (chest space, unit) and the arm stretched to `length`: the grip, below and
 * behind the lens, lands on the sphere the fist can reach round the shoulder.
 * Also gives the phone's up (⊥ `dir`) in `up`.
 */
function selfieDistance(center: Vector3, shoulder: Vector3, dir: Vector3, length: number, up: Vector3): number {
  up.set(0, 1, 0).addScaledVector(dir, -dir.y).normalize();
  _b2.copy(center).addScaledVector(up, -PHONE_LENS[1]).sub(shoulder);
  const qd = _b2.dot(dir);
  const disc = qd * qd - _b2.lengthSq() + length * length;
  return -qd + Math.sqrt(Math.max(0, disc)) - PHONE_LENS[2];
}

/** A vector given in the phone's view frame (x right, y up, z toward the phone), in chest space. */
function inView(v: Vector3, right: Vector3, up: Vector3, dir: Vector3, out: Vector3): Vector3 {
  return out.copy(right).multiplyScalar(v.x).addScaledVector(up, v.y).addScaledVector(dir, v.z);
}

/** Phone direction round the head in chest space, from the aim in the body's frame. */
function selfieDir(yaw: number, pitch: number, out: Vector3): Vector3 {
  const y = yaw - selfieChestYaw(yaw);
  return out.set(Math.sin(y) * Math.cos(pitch), Math.sin(pitch), Math.cos(y) * Math.cos(pitch));
}

/**
 * Keep a selfie aim where the arm can hold the phone clear of the face: in
 * range, then down and round to his right until the full arm reaches.
 */
export function clampSelfieAim(aim: { yaw: number; pitch: number; reach: number }, stick = false): void {
  if (stick) {
    // (the stick holds the phone well clear of the face everywhere in its range)
    aim.yaw = clamp(aim.yaw, STICK_YAW[0], STICK_YAW[1]);
    aim.pitch = clamp(aim.pitch, STICK_PITCH[0], STICK_PITCH[1]);
    aim.reach = clamp(aim.reach, 0, 1);
    return;
  }
  aim.yaw = clamp(aim.yaw, SELFIE_YAW[0], SELFIE_YAW[1]);
  aim.pitch = clamp(aim.pitch, SELFIE_PITCH[0], SELFIE_PITCH[1]);
  aim.reach = clamp(aim.reach, 0, 1);
  const r = SELFIE_REST;
  for (let i = 0; i < 40; i++) {
    if (selfieDistance(r.center, r.shoulder, selfieDir(aim.yaw, aim.pitch, _b3), r.arm, _v2) >= SELFIE_NEAR + 0.05) return;
    if (aim.pitch > -0.1) aim.pitch -= 0.025;
    else aim.yaw = Math.max(SELFIE_YAW[0], aim.yaw - 0.025);
  }
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
  /** How far the selfie phone is up (0‥1; the selfie's fade in and out). */
  selfieWeight = 0;
  /** Which gesture the free hand makes in a selfie. */
  selfieGesture: SelfieGesture = 'peace';
  private selfieYaw = -0.75;
  private selfiePitch = 0.1;
  private selfieReach = 1;
  /** The phone is on a selfie stick (the fist holds the stick; the phone goes far out). */
  selfieStick = false;
  /** With the stick: where the phone's lens goes (chest space, BU), for the explorer to put the phone and the stick there. */
  readonly stickLens = new Vector3();
  /** The gesture arm: how far it's up, and its eased target (chest space). */
  private gestureW = 0;
  private gestureKind: Exclude<SelfieGesture, 'none'> = 'peace';
  private readonly gestureFist = new Vector3();
  private readonly gesturePole = new Vector3();
  private readonly gestureWrist = new Quaternion();
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

  /** Where the selfie phone is round the head (see `AngkorExplorer.selfieAim`; already clamped). */
  setSelfie(yaw: number, pitch: number, reach: number): void {
    this.selfieYaw = yaw;
    this.selfiePitch = pitch;
    this.selfieReach = reach;
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

    // ── Posture (vehicles) ───────────────────────────────────────────────
    if (this.posture) this.lastPosture = this.posture;
    this.postureW = lerp(this.postureW, this.posture ? 1 : 0, clamp(dt * 7, 0, 1));
    if (this.postureW < 0.001) this.lastPosture = null;
    // The camera or the phone up in a vehicle (the boat, the hang glider): the
    // posture holds the body, the device's arms (and the selfie's turn of the
    // head) go on top of it. Else the posture is over everything.
    const device = !!this.lastPosture && !!this.action && (this.action.name === 'photo' || this.action.name === 'selfie');
    if (device) this.buf.override(this.lastPosture!(this.time), this.postureW, FULL_BODY);

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
      let joints = this.hold !== 'none' ? def.joints.filter((j) => !ARM_JOINTS_L.includes(j) || a.name === 'peek') : def.joints;
      // (in a vehicle only the arms: the posture keeps the body, the neck and the head)
      if (device) joints = joints.filter((j) => ARM_JOINTS_L.includes(j) || ARM_JOINTS_R.includes(j));
      buf.override(def.pose(t), a.weight, joints);
      if (a.name === 'photo') this.holdCamera(a.weight);
      if (a.name === 'selfie') this.holdPhone(a.weight, a.stopping, dt);
      if (a.stopping && a.weight <= 0) {
        this.action = null;
        this.onActionEnd?.(a.name);
      }
    }
    if (this.action?.name !== 'photo') this.photoHold.weight = 0;
    if (this.action?.name !== 'selfie') {
      this.selfieWeight = 0;
      this.gestureW = 0;
    }

    if (this.lastPosture && !device) buf.override(this.lastPosture(this.time), this.postureW, FULL_BODY);

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

  /**
   * Selfie: the right fist holds the phone out round the head where the aim
   * says (lens on the ray from the head's middle, arm stretched by `reach`),
   * chest and head turn to it, and the left hand makes the gesture.
   */
  private holdPhone(w: number, stopping: boolean, dt: number): void {
    const buf = this.buf;
    const yaw = this.selfieYaw;
    const pitch = this.selfiePitch;
    this.selfieWeight = w;
    const chestYaw = selfieChestYaw(yaw);
    // (a stick takes the phone further round than the neck turns: the head stops at a comfortable turn)
    const turn = clamp(0.8 * yaw - chestYaw, -1.25, 0.9);
    // (and he looks further up at a phone high on the stick)
    const lift = clamp(pitch, -0.6, this.selfieStick ? 1.25 : 1.0);
    buf.add(
      {
        chest: { ry: chestYaw, rx: -0.04 * pitch },
        neck: { ry: 0.3 * turn, rx: (this.selfieStick ? -0.2 : -0.12) * lift },
        head: { ry: 0.7 * turn, rx: -0.42 * lift, rz: clamp(-0.3 * yaw, -0.16, 0.16) },
      },
      w,
    );
    // Head in chest space, from this frame's pose.
    this.localMatrix('neck', _m).multiply(this.localMatrix('head', _m2));
    const center = _c.copy(SELFIE_CENTER).applyMatrix4(_m);
    const dir = selfieDir(yaw, pitch, _dir);
    const shoulder = _sh.copy(ARMS.R.shoulder).add(SHRUG.R);
    const full = SELFIE_REST.arm;
    const up = _up;
    if (this.selfieStick) {
      // The lens far out along the aim; the arm reaches out below the line to it, and the stick spans the rest.
      up.set(0, 1, 0).addScaledVector(dir, -dir.y).normalize();
      this.stickLens.copy(center).addScaledVector(dir, lerp(STICK_REACH[0], STICK_REACH[1], this.selfieReach));
      shoulder.copy(ARMS.R.shoulder).add(SHRUG_STICK);
      const pose = solveArm('R', stickFist(this.stickLens, shoulder, dir, full * STICK_ARM, _g), SELFIE_POLE, SHRUG_STICK);
      // (the pole ends on the clamp, below the lens and behind it)
      const clampAt = _c2.copy(this.stickLens).addScaledVector(up, STICK_JOINT[1] - PHONE_LENS[1]).addScaledVector(dir, PHONE_LENS[2] - STICK_JOINT[2]);
      pose.wristR = stickWrist(pose, _g, clampAt);
      buf.override(pose, w, ARM_JOINTS_R);
    } else {
      const t = Math.max(SELFIE_NEAR, selfieDistance(center, shoulder, dir, full * lerp(0.62, 1, this.selfieReach), up));
      const grip = _g.copy(center).addScaledVector(dir, t + PHONE_LENS[2]).addScaledVector(up, -PHONE_LENS[1]);
      buf.override(solveArm('R', grip, SELFIE_POLE, SHRUG.R), w, ARM_JOINTS_R);
    }
    const right = _right.crossVectors(up, dir); // the picture's right (his left)

    // Gesture: ease the arm between gestures (and down for none, or when the hand holds a prop).
    const g = this.selfieGesture;
    const def = GESTURES[g === 'none' ? this.gestureKind : g];
    const target = inView(def.fist, right, up, dir, _c2).add(center);
    // (on the stick the phone goes round to his right side, where the place beside his head is out of
    // the left arm's reach: stretched toward it the hand would cross his face, so it goes down)
    const fits = this.selfieStick ? clamp((yaw - STICK_GESTURE_YAW[0]) / (STICK_GESTURE_YAW[1] - STICK_GESTURE_YAW[0]), 0, 1) : 1;
    if ((g === 'none' ? this.gestureKind : g) === 'wave') target.addScaledVector(right, Math.sin(this.time * Math.PI * 2 * 1.6) * 0.9);
    const on = g !== 'none' && this.hold === 'none' && !stopping && fits > 0;
    const k = clamp(dt * 9, 0, 1);
    this.gestureW = lerp(this.gestureW, on ? fits : 0, k);
    if (on) this.gestureKind = g;
    const first = this.gestureW < 0.02;
    this.gestureFist.lerp(target, first ? 1 : k);
    this.gesturePole.lerp(inView(def.pole, right, up, dir, _v2), first ? 1 : k).normalize();
    const gw = w * this.gestureW;
    if (gw <= 0.001 || this.hold !== 'none') return;
    const pose = solveArm('L', this.gestureFist, this.gesturePole, SHRUG.L);
    const palm = def.hand === 'palm';
    // Fingers (or thumb) up, leaning out a little; the palm (or knuckles) to the picture.
    const upward = _g.set(0, 1, 0).addScaledVector(right, palm ? 0.4 : 0.15).normalize();
    const toView = _c.copy(center).addScaledVector(dir, VIEW_FAR).sub(this.gestureFist).normalize();
    wristAim(pose, palm, upward, toView, _qw);
    this.gestureWrist.slerp(_qw, first ? 1 : k);
    _e.setFromQuaternion(this.gestureWrist, 'XYZ');
    pose.wristL = { rx: _e.x, ry: _e.y, rz: _e.z };
    buf.override(pose, gw, ARM_JOINTS_L);
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
