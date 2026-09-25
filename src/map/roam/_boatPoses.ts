import { Euler, Matrix4, Vector3, type Object3D } from 'three';
import type { Pose } from '../../character/pose';
import { JOINTS, type JointName } from '../../character/skeleton';
import { BODY_UNIT_M } from '../../world/scale';
import { SEAT } from './_boatModel';

/**
 * The explorer in the boat (a posture for `Animator.posture`): sitting on
 * the rear thwart, legs forward, a double-bladed paddle in both hands.
 * Strokes alternate sides while he paddles (or keep to the outside of a
 * turn); over a fall he holds the paddle up and braces.
 *
 * The paddle hangs from his chest joint and both fists reach it by arm IK,
 * so the hands stay on the shaft whatever the stroke does. The hips carry
 * the boat's pitch and roll, so he tilts with the hull.
 *
 * Units: body units (BU) in the explorer's own space (+z forward, +x his
 * left); the boat and the seat in metres.
 */

// ── The stroke ─────────────────────────────────────────────────────────────

/** Paddle tilt in a stroke (radians: the low end in the water). */
const DIP = 0.62;
/** Sweep of the paddle itself in a stroke (± radians; the chest turns the rest). */
const SWEEP = 0.32;
/** Seconds to swing to the next catch, and of the pull, at full effort. */
const T_SWITCH = 0.3;
const T_PULL = 0.62;
/** Middle of the shaft in chest space (BU): resting on the lap, and while paddling. */
const REST_C = new Vector3(0, 3.2, 5.4);
const PULL_C = new Vector3(0, 5.3, 4.6);
/** Held up overhead (going over a fall). */
const BRACE_C = new Vector3(0, 10.4, 3.4);
/** Laid across the lap, the hands off it (BU, chest space: on his thighs). */
const LAP_C = new Vector3(0, -1.2, 6.2);
/** How far the shaft shifts towards the side that pulls (BU). */
const SHIFT = 1.7;
/** Half the distance between the hands on the shaft (BU): the leather wraps. */
const HAND = 0.23 / BODY_UNIT_M;

const ease = (u: number) => {
  const c = Math.min(1, Math.max(0, u));
  return c * c * (3 - 2 * c);
};

/**
 * Stroke after stroke: `update` with the paddle input (forward −1‥1, turn
 * −1‥1, + = right) moves the paddle (`tilt`, `sweep`, `centre`) and says
 * when the blade goes in (a catch: splash and sound). `power` is how hard
 * the blade pulls right now (0‥1), for the boat's surge.
 */
export class PaddleStroke {
  tilt = 0;
  sweep = 0;
  readonly centre = REST_C.clone();
  power = 0;
  /** Side of the last catch (+1 = right blade, −1 = left) and where it went in (boat space, m, true size). */
  side: 1 | -1 = -1;
  readonly catchAt = new Vector3();
  private phase: 'rest' | 'swing' | 'pull' = 'rest';
  private u = 0;
  private dir = 1;
  private toRest = false;
  private lift = 0;
  private readonly from = { tilt: 0, sweep: 0 };
  private readonly to = { tilt: 0, sweep: 0 };
  private active = 0;

  update(dt: number, fwd: number, turn: number): boolean {
    const want = Math.abs(fwd) > 0.15 ? Math.sign(fwd) : Math.abs(turn) > 0.15 ? 1 : 0;
    const rate = 0.7 + 0.3 * Math.min(1, Math.max(Math.abs(fwd), Math.abs(turn)));
    let caught = false;
    if (this.phase === 'rest') {
      if (want) this.begin(want, fwd, turn);
    } else if (this.phase === 'swing') {
      this.u += (dt * rate) / T_SWITCH;
      if (this.u >= 1) {
        if (this.toRest) this.phase = 'rest';
        else {
          this.phase = 'pull';
          caught = true;
        }
        this.u = 0;
      }
    } else {
      this.u += (dt * rate) / T_PULL;
      if (this.u >= 1) {
        if (want) this.begin(want, fwd, turn);
        else this.rest();
      }
    }

    // Target pose of this moment.
    let tilt = 0;
    let sweep = 0;
    const k = this.side;
    if (this.phase === 'pull') {
      tilt = k * DIP;
      sweep = k * this.dir * SWEEP * (1 - 2 * ease(this.u));
    } else if (this.phase === 'swing') {
      const e = ease(this.u);
      tilt = this.from.tilt + (this.to.tilt - this.from.tilt) * e - this.lift * Math.sin(Math.PI * this.u);
      sweep = this.from.sweep + (this.to.sweep - this.from.sweep) * e;
    }
    // (eased once more, so a new input mid-stroke never snaps)
    const q = 1 - Math.exp(-dt * 22);
    this.tilt += (tilt - this.tilt) * q;
    this.sweep += (sweep - this.sweep) * q;
    this.active += ((this.phase === 'rest' || this.toRest ? 0 : 1) - this.active) * (1 - Math.exp(-dt * 6));
    this.centre.lerpVectors(REST_C, PULL_C, this.active);
    this.centre.x = -SHIFT * (this.tilt / DIP);
    this.power = this.phase === 'pull' ? Math.sin(Math.PI * this.u) : 0;
    if (caught) {
      // Where the blade goes in: out beside the hull, forward of the seat.
      this.catchAt.set(-k * 0.95, 0, SEAT.z + 0.25 + 0.2 * this.dir);
    }
    return caught;
  }

  /** Next stroke: alternate sides going ahead or astern, the outside of the turn when only turning. */
  private begin(want: number, fwd: number, turn: number): void {
    const next: 1 | -1 = Math.abs(fwd) > 0.15 ? (this.side === 1 ? -1 : 1) : turn > 0 ? -1 : 1;
    this.dir = want;
    this.from.tilt = this.tilt;
    this.from.sweep = this.sweep;
    this.to.tilt = next * DIP;
    this.to.sweep = next * this.dir * SWEEP;
    // Same side again: lift the blade out of the water on the way forward.
    this.lift = Math.sign(this.tilt) === next && Math.abs(this.tilt) > 0.3 ? next * 0.45 : 0;
    this.side = next;
    this.toRest = false;
    this.phase = 'swing';
    this.u = 0;
  }

  private rest(): void {
    this.from.tilt = this.tilt;
    this.from.sweep = this.sweep;
    this.to.tilt = 0;
    this.to.sweep = 0;
    this.lift = 0;
    this.toRest = true;
    this.phase = 'swing';
    this.u = 0;
  }
}

// ── The seated body ────────────────────────────────────────────────────────

/** What the posture reads every frame (the boat writes it). */
export interface RideState {
  /** Boat tilt (radians): pitch + = bow down, roll + = left side up. */
  pitch: number;
  roll: number;
  stroke: PaddleStroke;
  /** Holding the paddle up and bracing (going over a fall), 0‥1. */
  brace: number;
  /** Head turn (radians, + = to his left): he looks into turns. */
  look: number;
  /** The paddle laid across his lap, the hands free (the camera or the phone is up), 0‥1. */
  rest?: number;
}

/** Hips joint over the seat (m, true size): sitting on the pelvis, a little back. */
const HIP_UP = 2.5 * BODY_UNIT_M;
const HIP_BACK = 0.02;
const REST_HIPS = new Vector3(...JOINTS.hips.pivot);

const _v = new Vector3();
const _c = new Vector3();
const _a = new Vector3();
const _t = new Vector3();
const _e = new Euler();

/**
 * The posture: `paddle` (the paddle's object, hung from the chest joint) is
 * placed here too.
 */
export function ridePose(r: RideState, paddle: Object3D | null): Pose {
  const s = r.stroke;
  const brace = ease(r.brace);
  // Hips: on the seat, carried round the boat's middle by its pitch and roll.
  _v.set(0, SEAT.y + HIP_UP, SEAT.z - HIP_BACK);
  _v.applyEuler(_e.set(r.pitch, 0, r.roll, 'XYZ')).divideScalar(BODY_UNIT_M).sub(REST_HIPS);
  // Chest: leans into the pull and turns with the sweep (the paddle rides with it).
  const twist = 0.26 * (s.sweep / SWEEP) * (1 - brace);
  const lean = 0.2 + 0.08 * s.power - 0.25 * brace;
  const pose: Pose = {
    hips: { px: _v.x, py: _v.y, pz: _v.z, rx: r.pitch - 0.12, rz: r.roll },
    chest: { rx: lean, ry: twist, rz: -0.05 * (s.tilt / DIP) },
    neck: { rx: -0.08, ry: -0.35 * twist + 0.3 * r.look },
    head: { rx: -0.12 + 0.2 * brace, ry: -0.3 * twist + 0.5 * r.look },
    // Legs forward along the floor, knees a little up and apart, heels down.
    hipL: { rx: -1.42, ry: 0.1, rz: 0.12 },
    hipR: { rx: -1.42, ry: -0.1, rz: -0.12 },
    kneeL: { rx: 0.55 },
    kneeR: { rx: 0.55 },
    ankleL: { rx: 0.6 },
    ankleR: { rx: 0.6 },
  };

  // Paddle in chest space, then the fists on its leather wraps (laid down: level across the lap).
  const rest = ease(r.rest ?? 0);
  const tilt = s.tilt * (1 - brace) * (1 - rest);
  const sweep = s.sweep * (1 - brace) * (1 - rest);
  _c.copy(s.centre).lerp(BRACE_C, brace).lerp(LAP_C, rest);
  _a.set(Math.cos(tilt) * Math.cos(sweep), Math.sin(tilt), -Math.cos(tilt) * Math.sin(sweep));
  if (paddle) {
    paddle.position.copy(_c);
    paddle.rotation.set(0, sweep, tilt, 'YZX');
    paddle.scale.setScalar(1 / BODY_UNIT_M);
  }
  Object.assign(pose, solveArm('L', _t.copy(_c).addScaledVector(_a, HAND), POLE.L));
  Object.assign(pose, solveArm('R', _t.copy(_c).addScaledVector(_a, -HAND), POLE.R));
  return pose;
}

// ── Arm IK (as the Animator's own, which is private) ──────────────────────

const sub = (a: JointName, b: JointName) => new Vector3(...JOINTS[a].pivot).sub(new Vector3(...JOINTS[b].pivot));
/** Arm bones in chest space (BU): shoulder position, upper arm and forearm (elbow → fist) at rest. */
const ARMS = {
  L: { shoulder: sub('shoulderL', 'chest'), upper: sub('elbowL', 'shoulderL'), fore: sub('propL', 'elbowL') },
  R: { shoulder: sub('shoulderR', 'chest'), upper: sub('elbowR', 'shoulderR'), fore: sub('propR', 'elbowR') },
};
/** Elbows point down, out and a little back. */
const POLE = { L: new Vector3(0.7, -1, -0.3).normalize(), R: new Vector3(-0.7, -1, -0.3).normalize() };

const _d = new Vector3();
const _p = new Vector3();
const _u = new Vector3();
const _f = new Vector3();
const _w = new Vector3();
const _w2 = new Vector3();
const _b1 = new Vector3();
const _b2 = new Vector3();
const _b3 = new Vector3();
const _rest = new Matrix4();
const _m2 = new Matrix4();
const _ea = new Euler();

/** Orthonormal frame from a direction and a second vector in its plane (as matrix columns). */
function frame(a: Vector3, b: Vector3, out: Matrix4): Matrix4 {
  _b1.copy(a).normalize();
  _b2.copy(b).addScaledVector(_b1, -b.dot(_b1)).normalize();
  _b3.crossVectors(_b1, _b2);
  return out.makeBasis(_b1, _b2, _b3);
}

/** Shoulder rotation and elbow bend that put the fist on `target` (chest space), the elbow towards `pole` (the hang glider's poses use it too). */
export function solveArm(side: 'L' | 'R', target: Vector3, pole: Vector3): Pose {
  const arm = ARMS[side];
  const a = arm.upper.length();
  const b = arm.fore.length();
  _d.subVectors(target, arm.shoulder);
  const len = Math.min(a + b - 0.01, Math.max(Math.abs(a - b) + 0.01, _d.length()));
  _d.normalize();
  const cosA = (a * a + len * len - b * b) / (2 * a * len);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d)).normalize();
  _u.copy(_d).multiplyScalar(cosA).addScaledVector(_p, sinA);
  _f.copy(_d).multiplyScalar(len).addScaledVector(_u, -a).normalize();
  const u0 = _w.copy(arm.upper).normalize();
  const elbow = -Math.acos(Math.min(1, Math.max(-1, _u.dot(_f) / -u0.y)));
  _w2.set(0, -Math.cos(elbow), -Math.sin(elbow));
  frame(u0, _w2, _rest).transpose();
  frame(_u, _f, _m2).multiply(_rest);
  _ea.setFromRotationMatrix(_m2, 'XYZ');
  return {
    [`shoulder${side}`]: { rx: _ea.x, ry: _ea.y, rz: _ea.z },
    [`elbow${side}`]: { rx: elbow },
    [`wrist${side}`]: {},
  };
}
