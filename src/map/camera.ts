import { MathUtils, Vector3, type PerspectiveCamera } from 'three';
import { OVERVIEW, placeById } from './layout';
import type { PlaceId } from './types';

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * The map camera. At rest it breathes: a very slow sway (periods of 30–50 s),
 * and it leans a little towards the mouse (parallax). Picking a place flies
 * it there in a soft arc; picking none flies it back to the overview.
 */
export class MapCameraRig {
  /** No sway and shorter flights (the "reduce motion" setting). */
  calm = false;
  /** The place the camera is at or flying to (null = overview). */
  focused: PlaceId | null = null;

  private readonly pos = new Vector3(...OVERVIEW.pos);
  private readonly target = new Vector3(...OVERVIEW.target);
  private readonly fromPos = new Vector3();
  private readonly fromTarget = new Vector3();
  private readonly toPos = new Vector3(...OVERVIEW.pos);
  private readonly toTarget = new Vector3(...OVERVIEW.target);
  private flight = 1;
  private flightTime = 2.6;
  private readonly lean = { x: 0, y: 0 };
  private readonly pointer = { x: 0, y: 0 };
  private readonly _v = new Vector3();
  private readonly _side = new Vector3();

  constructor(private readonly camera: PerspectiveCamera) {
    this.fit();
  }

  /**
   * Field of view for the window's shape: the layout is framed for 16:9 at
   * `OVERVIEW.fov`; narrower windows (a laptop at 16:10, a tablet, a phone
   * held upright) open the view up to keep the same width, up to 80°.
   */
  fit(): void {
    const half = Math.tan(MathUtils.degToRad(OVERVIEW.fov / 2));
    const wide = (half * 16) / 9;
    const need = Math.min(Math.tan(MathUtils.degToRad(40)), Math.max(half, wide / this.camera.aspect));
    this.camera.fov = MathUtils.radToDeg(2 * Math.atan(need));
    this.camera.updateProjectionMatrix();
  }

  /** Fly to a place, or back to the overview (null). */
  focus(id: PlaceId | null, instant = false): void {
    this.focused = id;
    this.fromPos.copy(this.pos);
    this.fromTarget.copy(this.target);
    if (id) {
      const f = placeById(id).focus;
      this.toPos.set(...f.pos);
      this.toTarget.set(...f.target);
    } else {
      this.toPos.set(...OVERVIEW.pos);
      this.toTarget.set(...OVERVIEW.target);
    }
    this.flightTime = this.calm ? 1.2 : 2.6;
    this.flight = instant ? 1 : 0;
    if (instant) {
      this.pos.copy(this.toPos);
      this.target.copy(this.toTarget);
    }
  }

  /** True while flying between views. */
  get flying(): boolean {
    return this.flight < 1;
  }

  /** Mouse position over the view, −1‥1 (x right, y down). */
  setPointer(x: number, y: number): void {
    this.pointer.x = MathUtils.clamp(x, -1, 1);
    this.pointer.y = MathUtils.clamp(y, -1, 1);
  }

  update(dt: number, t: number): void {
    if (this.flight < 1) {
      this.flight = Math.min(1, this.flight + dt / this.flightTime);
      const e = ease(this.flight);
      this.pos.lerpVectors(this.fromPos, this.toPos, e);
      this.target.lerpVectors(this.fromTarget, this.toTarget, e);
      // A soft arc: rise a little mid-flight, so the view floats over the land.
      this.pos.y += Math.sin(Math.PI * e) * Math.min(30, this.fromPos.distanceTo(this.toPos) * 0.12);
    }
    // Lean towards the mouse (eased), and breathe.
    const k = 1 - Math.exp(-dt * 1.6);
    this.lean.x += (this.pointer.x - this.lean.x) * k;
    this.lean.y += (this.pointer.y - this.lean.y) * k;
    // The camera itself moves a few decimetres (the explorer's ledge is only 9 m
    // away, so that is enough for a soft parallax); the view turns a little more.
    const sway = this.calm ? 0 : 1;
    const dist = this.pos.distanceTo(this.target);
    this._side.subVectors(this.target, this.pos).cross(this.camera.up).normalize();
    const w = (period: number) => Math.sin((t * Math.PI * 2) / period);
    const side = sway * (w(47) * 0.14 + w(83) * 0.08) + this.lean.x * 0.35;
    const up = sway * w(31) * 0.1 - this.lean.y * 0.18;
    this.camera.position.copy(this.pos).addScaledVector(this._side, side);
    this.camera.position.y += up;
    const turn = dist * (sway * (w(59) * 0.0035 + w(97) * 0.002) + this.lean.x * 0.004);
    this._v.copy(this.target).addScaledVector(this._side, turn);
    this._v.y += dist * (sway * w(41) * 0.0015 - this.lean.y * 0.002);
    this.camera.lookAt(this._v);
  }
}
