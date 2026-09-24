import { Object3D, Quaternion, Vector3 } from 'three';

export interface PendulumOptions {
  /** Distance from pivot to the simulated mass (metres, world). */
  length: number;
  /** Velocity kept per 1/120 s (0‥1). */
  damping?: number;
  /** Pull toward the animated rest direction per 1/120 s (0‥1). */
  stiffness?: number;
  /** Hang toward world-down instead of the parent's local −Y (lanterns). */
  worldDown?: boolean;
  /** Maximum swing from the rest direction (radians). */
  maxAngle?: number;
  /**
   * Keep the swing in front of a body surface: minimum local Z of the swing
   * direction, expressed in the frame of `limitFrame` (e.g. the chest).
   */
  minForward?: number;
  limitFrame?: Object3D;
}

const DOWN = new Vector3(0, -1, 0);
const STEP = 1 / 120;
const _p = new Vector3();
const _rest = new Vector3();
const _d = new Vector3();
const _v = new Vector3();
const _x0 = new Vector3();
const _q = new Quaternion();
const _qi = new Quaternion();
const _lq = new Quaternion();
const _local = new Vector3();

/**
 * Point-mass hanging from a joint. Each frame the joint is rotated so its −Y
 * axis points at the mass — gives the krama tail, camera and lantern a natural
 * lag and swing when the explorer walks, turns or stops. The frame is split
 * into equal steps of at most 1/120 s (not a fixed 1/120 s with the remainder
 * carried over, which runs 0 steps one frame and 2 the next and makes the
 * swing judder at 120 Hz and on uneven frames).
 */
export class Pendulum {
  private readonly x = new Vector3();
  /** Velocity of the mass (m/s). */
  private readonly vel = new Vector3();
  private ready = false;

  constructor(
    readonly joint: Object3D,
    readonly opts: PendulumOptions,
  ) {}

  reset(): void {
    this.ready = false;
  }

  update(dt: number): void {
    const parent = this.joint.parent;
    if (!parent) return;
    const { length, damping = 0.94, stiffness = 0.02, worldDown = false, maxAngle = 1.2 } = this.opts;
    this.joint.quaternion.identity();
    this.joint.updateWorldMatrix(true, false);
    this.joint.getWorldPosition(_p);
    parent.getWorldQuaternion(_q);
    if (worldDown) _rest.copy(DOWN);
    else _rest.copy(DOWN).applyQuaternion(_q);
    if (!this.ready) {
      this.x.copy(_p).addScaledVector(_rest, length);
      this.vel.set(0, 0, 0);
      this.ready = true;
    }
    dt = Math.min(dt, 0.1);
    const n = dt > 0 ? Math.ceil(dt / STEP - 1e-6) : 0;
    const h = dt / Math.max(1, n);
    // Damping and spring are tuned per 1/120 s; scale them to the step length.
    const keep = damping ** (h / STEP);
    const pull = 1 - (1 - stiffness) ** (h / STEP);
    for (let i = 0; i < n; i++) {
      _x0.copy(this.x);
      this.vel.multiplyScalar(keep);
      this.vel.y -= 9.81 * h;
      this.x.addScaledVector(this.vel, h);
      // spring toward the animated direction
      _d.copy(_p).addScaledVector(_rest, length);
      this.x.lerp(_d, pull);
      // length constraint + swing limits
      _d.subVectors(this.x, _p);
      if (_d.lengthSq() < 1e-10) _d.copy(_rest);
      _d.normalize();
      const ang = _d.angleTo(_rest);
      if (ang > maxAngle) {
        _v.crossVectors(_rest, _d).normalize();
        if (_v.lengthSq() > 0) _d.copy(_rest).applyQuaternion(_lq.setFromAxisAngle(_v, maxAngle));
      }
      if (this.opts.minForward !== undefined && this.opts.limitFrame) {
        this.opts.limitFrame.getWorldQuaternion(_lq);
        _local.copy(_d).applyQuaternion(_qi.copy(_lq).invert());
        if (_local.z < this.opts.minForward) {
          _local.z = this.opts.minForward;
          _local.normalize();
          _d.copy(_local).applyQuaternion(_lq);
        }
      }
      this.x.copy(_p).addScaledVector(_d, length);
      this.vel.subVectors(this.x, _x0).divideScalar(h);
    }
    // Rotate the joint so local −Y points along the swing direction.
    _d.subVectors(this.x, _p).normalize();
    _qi.copy(_q).invert();
    _local.copy(_d).applyQuaternion(_qi);
    this.joint.quaternion.setFromUnitVectors(DOWN, _local);
  }
}
