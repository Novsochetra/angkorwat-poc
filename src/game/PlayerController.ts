import { PerspectiveCamera, Vector3 } from 'three';
import type { AngkorExplorer } from '../character/AngkorExplorer';
import { CHARACTER_HEIGHT_M, CHARACTER_RADIUS_M, CHARACTER_STEP_M, RUN_SPEED, WALK_SPEED } from '../world/scale';
import type { ColliderWorld } from './world/Colliders';
import type { Input } from './Input';

const GRAVITY = 22; // snappier than 9.81 for a chibi platformer feel
const JUMP_SPEED = 5.6; // ≈ 0.7 m hop
const ACCEL = 14;
const TURN_RATE = 12;
const EYE = CHARACTER_HEIGHT_M * 0.78;

/**
 * Third-person controller in metres: camera-relative movement, walk / run, jump,
 * step-up onto stairs, gravity, capsule-vs-box collision and a follow camera
 * that pulls in when a wall is behind the explorer.
 */
export class PlayerController {
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  yaw = 0;
  grounded = true;
  /** Orbit camera state. */
  camYaw = Math.PI;
  camPitch = 0.28;
  camDist = 5.5;
  overview = false;
  private camDistSmooth = 5.5;
  private readonly camTarget = new Vector3();
  private readonly tmp = new Vector3();
  private floor = 0;

  constructor(
    private readonly explorer: AngkorExplorer,
    private readonly colliders: ColliderWorld,
    private readonly camera: PerspectiveCamera,
    private readonly input: Input,
  ) {}

  teleport(x: number, y: number, z: number, yaw: number): void {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.camYaw = yaw + Math.PI;
    this.grounded = true;
    this.camTarget.set(x, y + EYE, z);
    this.sync(0);
  }

  update(dt: number): void {
    const inp = this.input;
    this.orbit(dt);

    // ── Desired horizontal velocity (camera-relative) ───────────────────
    const m = inp.move();
    const busy = this.explorer.busy;
    const speed = inp.running ? RUN_SPEED : WALK_SPEED;
    // Camera forward on the ground plane (camera looks from camYaw toward the player).
    const fx = -Math.sin(this.camYaw);
    const fz = -Math.cos(this.camYaw);
    let dx = (fx * m.y - fz * m.x) * speed;
    let dz = (fz * m.y + fx * m.x) * speed;
    if (busy) dx = dz = 0;
    const k = Math.min(1, ACCEL * dt * (this.grounded ? 1 : 0.35));
    this.velocity.x += (dx - this.velocity.x) * k;
    this.velocity.z += (dz - this.velocity.z) * k;
    const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (hSpeed > 0.15 && Math.hypot(dx, dz) > 0.01) {
      const target = Math.atan2(this.velocity.x, this.velocity.z);
      let d = target - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, TURN_RATE * dt);
    }

    // ── Jump + gravity ──────────────────────────────────────────────────
    if (this.grounded && !busy && inp.hit('Space')) {
      this.velocity.y = JUMP_SPEED;
      this.grounded = false;
    }
    if (!this.grounded) this.velocity.y -= GRAVITY * dt;

    // ── Integrate + collide (sub-stepped so fast falls can't tunnel) ───
    const steps = Math.max(1, Math.ceil((hSpeed * dt) / 0.2));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) this.step(h);

    this.sync(dt);
  }

  /** Camera only — orbit, zoom, follow — while the game is paused (e.g. for a bug report). */
  look(dt: number): void {
    this.orbit(dt);
    this.sync(dt);
  }

  private orbit(dt: number): void {
    const inp = this.input;
    this.camYaw -= inp.dragX * 0.005;
    this.camPitch = Math.min(1.25, Math.max(-0.35, this.camPitch + inp.dragY * 0.004));
    this.camDist = Math.min(this.overview ? 120 : 18, Math.max(1.6, this.camDist * (1 + inp.wheel * 0.12)));
    if (inp.down('KeyQ')) this.camYaw += dt * 1.8;
    if (inp.down('KeyR')) this.camYaw -= dt * 1.8;
  }

  private step(dt: number): void {
    const p = this.position;
    const r = CHARACTER_RADIUS_M;
    const next = { x: p.x + this.velocity.x * dt, z: p.z + this.velocity.z * dt };
    this.colliders.resolveHorizontal(next, p.y, CHARACTER_HEIGHT_M, r, CHARACTER_STEP_M);
    p.x = next.x;
    p.z = next.z;

    const ground = this.colliders.groundHeight(p.x, p.z, r, p.y + CHARACTER_STEP_M, this.floor);
    if (this.grounded) {
      if (ground >= p.y - CHARACTER_STEP_M) {
        // Glide up/down steps instead of popping.
        p.y += (ground - p.y) * Math.min(1, dt * 18);
        if (Math.abs(ground - p.y) < 0.01) p.y = ground;
        this.velocity.y = 0;
      } else {
        this.grounded = false; // walked off a ledge
      }
    } else {
      const ny = p.y + this.velocity.y * dt;
      const ceil = this.colliders.ceiling(p.x, p.z, r * 0.8, p.y + 0.05);
      if (this.velocity.y > 0 && ny + CHARACTER_HEIGHT_M > ceil) {
        this.velocity.y = 0;
      } else if (ny <= ground) {
        p.y = ground;
        this.grounded = true;
      } else p.y = ny;
    }
  }

  private sync(dt: number): void {
    const e = this.explorer;
    e.object.position.copy(this.position);
    e.object.rotation.y = this.yaw;
    e.setMotion(Math.hypot(this.velocity.x, this.velocity.z), this.grounded, this.velocity.y);

    // ── Follow camera ───────────────────────────────────────────────────
    const eye = this.tmp.set(this.position.x, this.position.y + EYE, this.position.z);
    this.camTarget.lerp(eye, dt > 0 ? Math.min(1, dt * 10) : 1);
    const pitch = this.overview ? Math.max(this.camPitch, 0.35) : this.camPitch;
    const dir = new Vector3(Math.sin(this.camYaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(this.camYaw) * Math.cos(pitch));
    let want = this.overview ? Math.max(this.camDist, 45) : this.camDist;
    if (!this.overview) {
      const hit = this.colliders.raycast(this.camTarget.x, this.camTarget.y, this.camTarget.z, dir.x, dir.y, dir.z, want);
      want = Math.max(0.8, Math.min(want, hit - 0.25));
    }
    // Pull in fast, ease out slowly.
    const rate = want < this.camDistSmooth ? 20 : 3;
    this.camDistSmooth += (want - this.camDistSmooth) * (dt > 0 ? Math.min(1, dt * rate) : 1);
    this.camera.position.copy(this.camTarget).addScaledVector(dir, this.camDistSmooth);
    this.camera.lookAt(this.camTarget);
  }
}
