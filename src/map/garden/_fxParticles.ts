import { BufferGeometry, Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Sphere, Vector3 } from 'three';
import { getVoxelMaterial, VOXEL_MATERIALS } from '../../voxel/materials';
import { openSidesIndex, unitVoxelGeometry } from '../../voxel/VoxelMesh';

/**
 * The garden work's little blocks (garden/_fx.ts): earth and grass flying from
 * the hoe, crumbs, dust, water drops and splashes, leaves shaken down, the bag's
 * scraps, and the few that stay a while (the hole being dug, its heap, the jar's
 * water). One instanced mesh of plain boxes in the map's `mapRock` family (no new
 * shader program; their colours are their own), a fixed pool of `CAP` blocks
 * (no allocation), written each frame only while any is alive (nothing drawn when
 * idle). No shadows: they are small and quick.
 *
 * Kinds of motion (`mode`): `FLY` thrown, falls with gravity, bounces once (a
 * third as high), slides to rest, then shrinks away at the end of its life;
 * `DROP` a water drop: falls, gone as it lands (its splash is its owner's);
 * `DUST` rises a little and slows, swells then shrinks; `LEAF` drifts down
 * swaying, lands, lies, shrinks; `STAY` holds where it is put, its size easing
 * to `target` (the hole, the heap, the jar's water), until let go.
 */

export const FLY = 1;
export const DROP = 2;
export const DUST = 3;
export const LEAF = 4;
export const STAY = 5;

const CAP = 640;
const G = 9.8;
/** A block shrinks away over this end of its life (s). */
const FADE = 0.35;

const _c = new Color();

export class Particles {
  readonly mesh: InstancedMesh;
  private readonly m: Float32Array;
  private readonly col: Float32Array;
  // Per block (structure of arrays).
  private readonly mode = new Uint8Array(CAP);
  private readonly px = new Float32Array(CAP);
  private readonly py = new Float32Array(CAP);
  private readonly pz = new Float32Array(CAP);
  private readonly vx = new Float32Array(CAP);
  private readonly vy = new Float32Array(CAP);
  private readonly vz = new Float32Array(CAP);
  private readonly sx = new Float32Array(CAP);
  private readonly sy = new Float32Array(CAP);
  private readonly sz = new Float32Array(CAP);
  /** Its size now (0‥1 of its own) and the size it eases to (`STAY`). */
  private readonly k = new Float32Array(CAP);
  private readonly kt = new Float32Array(CAP);
  private readonly age = new Float32Array(CAP);
  private readonly life = new Float32Array(CAP);
  private readonly floor = new Float32Array(CAP);
  private readonly yaw = new Float32Array(CAP);
  private readonly tilt = new Float32Array(CAP);
  private readonly spin = new Float32Array(CAP);
  private readonly bounced = new Uint8Array(CAP);
  private readonly r = new Float32Array(CAP);
  private readonly g = new Float32Array(CAP);
  private readonly b = new Float32Array(CAP);
  /** Free slots (a stack), and how many are alive. */
  private readonly free = new Int32Array(CAP);
  private nFree = CAP;
  alive = 0;
  /** Blocks alive that move (all but `STAY`), and something changed since the last write (a `STAY` placed or easing). */
  private movers = 0;
  private dirty = false;
  /** Blocks spawned in all (stats). */
  spawned = 0;
  /** A seeded stream (the same picture every time). */
  private seed = 1;

  constructor() {
    for (let i = 0; i < CAP; i++) this.free[i] = CAP - 1 - i;
    const spec = VOXEL_MATERIALS.mapRock;
    const unit = unitVoxelGeometry(spec.bevel, 0);
    const geo = new BufferGeometry();
    geo.setIndex(openSidesIndex(unit, 63));
    geo.setAttribute('position', unit.getAttribute('position'));
    geo.setAttribute('normal', unit.getAttribute('normal'));
    this.m = new Float32Array(CAP * 16);
    this.col = new Float32Array(CAP * 3);
    geo.setAttribute('voxOpen', new InstancedBufferAttribute(new Float32Array(CAP).fill(63), 1));
    geo.setAttribute('voxRadius', new InstancedBufferAttribute(new Float32Array(CAP), 1));
    const mesh = new InstancedMesh(geo, getVoxelMaterial('mapRock'), 0);
    mesh.instanceMatrix = new InstancedBufferAttribute(this.m, 16).setUsage(DynamicDrawUsage);
    mesh.instanceColor = new InstancedBufferAttribute(this.col, 3).setUsage(DynamicDrawUsage);
    mesh.name = 'garden:fx:mapRock';
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.count = 0;
    mesh.visible = false;
    // (bounds kept round what is alive: `step`)
    mesh.boundingSphere = new Sphere(new Vector3(), 0);
    mesh.frustumCulled = true;
    this.mesh = mesh;
  }

  /** 0‥1, seeded. */
  rnd(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }
  reseed(s: number): void {
    this.seed = Math.max(1, Math.floor(Math.abs(s) * 2147483) % 2147483646) + 1;
  }

  /** A new block (-1 when the pool is full): its motion, place, speed, size (m), colour (sRGB), life (s), the ground under it. */
  spawn(mode: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, sx: number, sy: number, sz: number, color: number, life: number, floor: number): number {
    if (!this.nFree) return -1;
    const i = this.free[--this.nFree];
    this.alive++;
    this.spawned++;
    if (mode !== STAY) this.movers++;
    this.dirty = true;
    this.mode[i] = mode;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.sx[i] = sx;
    this.sy[i] = sy;
    this.sz[i] = sz;
    this.k[i] = mode === DUST ? 0.4 : mode === STAY ? 0 : 1;
    this.kt[i] = 1;
    this.age[i] = 0;
    this.life[i] = life;
    this.floor[i] = floor;
    this.yaw[i] = this.rnd() * Math.PI * 2;
    this.tilt[i] = mode === FLY || mode === LEAF ? (this.rnd() - 0.5) * 1.2 : 0;
    this.spin[i] = mode === FLY ? (this.rnd() - 0.5) * 14 : mode === LEAF ? (this.rnd() - 0.5) * 4 : 0;
    this.bounced[i] = 0;
    _c.setHex(color);
    this.r[i] = _c.r;
    this.g[i] = _c.g;
    this.b[i] = _c.b;
    return i;
  }

  /** A `STAY` block's size to ease to (0: shrinks away; let go once gone, `release`), and its place. */
  target(i: number, k: number): void {
    if (i < 0 || this.kt[i] === k) return;
    this.kt[i] = k;
    this.dirty = true;
  }
  place(i: number, x: number, y: number, z: number, sx?: number, sy?: number, sz?: number): void {
    if (i < 0) return;
    this.dirty = true;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    if (sx !== undefined) this.sx[i] = sx;
    if (sy !== undefined) this.sy[i] = sy;
    if (sz !== undefined) this.sz[i] = sz;
  }
  /** Its size now (0‥1). */
  sizeOf(i: number): number {
    return i >= 0 ? this.k[i] : 0;
  }
  /** Set its colour (sRGB). */
  color(i: number, color: number): void {
    if (i < 0) return;
    this.dirty = true;
    _c.setHex(color);
    this.r[i] = _c.r;
    this.g[i] = _c.g;
    this.b[i] = _c.b;
  }
  /** Let a `STAY` block shrink away and go once it is gone. */
  release(i: number): void {
    if (i < 0 || !this.mode[i]) return;
    this.kt[i] = 0;
    this.life[i] = -1;
    this.dirty = true;
  }

  private kill(i: number): void {
    if (this.mode[i] !== STAY) this.movers--;
    this.mode[i] = 0;
    this.free[this.nFree++] = i;
    this.alive--;
  }

  /** Move every block on by `dt` (s) and write those alive into the mesh (none: nothing drawn). */
  step(dt: number): void {
    const mesh = this.mesh;
    if (!this.alive) {
      if (mesh.visible) {
        mesh.visible = false;
        mesh.count = 0;
      }
      return;
    }
    // (only still blocks, as written last: nothing to do)
    if (!this.movers && !this.dirty) return;
    let easing = false;
    const m = this.m;
    const col = this.col;
    let n = 0;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let i = 0; i < CAP; i++) {
      const mode = this.mode[i];
      if (!mode) continue;
      this.age[i] += dt;
      const a = this.age[i];
      let k = this.k[i];
      if (mode === STAY) {
        // (eases to its target; a released one goes once shrunk)
        k += (this.kt[i] - k) * (dt > 0 ? 1 - Math.exp(-dt * 7) : 1);
        if (Math.abs(this.kt[i] - k) < 0.01) k = this.kt[i];
        else easing = true;
        this.k[i] = k;
        if (this.life[i] < 0 && k <= 0.01) {
          this.kill(i);
          continue;
        }
      } else {
        if (a >= this.life[i]) {
          this.kill(i);
          continue;
        }
        const half = this.sy[i] * 0.5;
        if (mode === FLY || mode === DROP) {
          if (this.bounced[i] < 2) {
            this.vy[i] -= G * dt;
            this.px[i] += this.vx[i] * dt;
            this.py[i] += this.vy[i] * dt;
            this.pz[i] += this.vz[i] * dt;
            this.yaw[i] += this.spin[i] * dt;
            if (this.py[i] - half <= this.floor[i] && this.vy[i] < 0) {
              if (mode === DROP) {
                this.kill(i);
                continue;
              }
              this.py[i] = this.floor[i] + half;
              if (!this.bounced[i]) {
                // (once: a third as high, slowed along the ground)
                this.vy[i] *= -0.32;
                this.vx[i] *= 0.45;
                this.vz[i] *= 0.45;
                this.spin[i] *= 0.4;
                this.bounced[i] = 1;
              } else {
                this.bounced[i] = 2;
                this.tilt[i] = 0;
              }
            }
          }
          // (shrinks away at the end of its life)
          k = Math.min(1, (this.life[i] - a) / FADE);
        } else if (mode === DUST) {
          const drag = Math.exp(-dt * 3);
          this.vx[i] *= drag;
          this.vy[i] *= drag;
          this.vz[i] *= drag;
          this.px[i] += this.vx[i] * dt;
          this.py[i] += this.vy[i] * dt;
          this.pz[i] += this.vz[i] * dt;
          const u = a / this.life[i];
          k = u < 0.3 ? 0.4 + (u / 0.3) * 0.8 : 1.2 * (1 - (u - 0.3) / 0.7);
        } else if (mode === LEAF) {
          if (this.py[i] - half > this.floor[i]) {
            // (falls slowly, swaying side to side, turning)
            const sway = Math.sin(a * 3.1 + i) * 0.55;
            this.px[i] += (this.vx[i] + sway * Math.cos(this.yaw[i])) * dt;
            this.pz[i] += (this.vz[i] + sway * Math.sin(this.yaw[i])) * dt;
            this.py[i] -= 0.75 * dt;
            this.yaw[i] += this.spin[i] * dt;
            this.tilt[i] = Math.sin(a * 3.1 + i) * 0.5;
          } else {
            this.py[i] = this.floor[i] + half;
            this.tilt[i] = 0;
          }
          k = Math.min(1, (this.life[i] - a) / FADE);
        }
        this.k[i] = k;
      }
      if (k <= 0.001) continue;
      // Its matrix: turned about y (`yaw`), tipped about its own x (`tilt`), its size × k.
      const cy = Math.cos(this.yaw[i]);
      const sy = Math.sin(this.yaw[i]);
      const ct = Math.cos(this.tilt[i]);
      const st = Math.sin(this.tilt[i]);
      const ax = this.sx[i] * k;
      const ay = this.sy[i] * k;
      const az = this.sz[i] * k;
      const o = n * 16;
      // R = Ry · Rx: columns (x axis, y axis, z axis)
      m[o] = cy * ax;
      m[o + 1] = 0;
      m[o + 2] = -sy * ax;
      m[o + 3] = 0;
      m[o + 4] = sy * st * ay;
      m[o + 5] = ct * ay;
      m[o + 6] = cy * st * ay;
      m[o + 7] = 0;
      m[o + 8] = sy * ct * az;
      m[o + 9] = -st * az;
      m[o + 10] = cy * ct * az;
      m[o + 11] = 0;
      m[o + 12] = this.px[i];
      m[o + 13] = this.py[i];
      m[o + 14] = this.pz[i];
      m[o + 15] = 1;
      col[n * 3] = this.r[i];
      col[n * 3 + 1] = this.g[i];
      col[n * 3 + 2] = this.b[i];
      n++;
      if (this.px[i] < x0) x0 = this.px[i];
      if (this.px[i] > x1) x1 = this.px[i];
      if (this.py[i] < y0) y0 = this.py[i];
      if (this.py[i] > y1) y1 = this.py[i];
      if (this.pz[i] < z0) z0 = this.pz[i];
      if (this.pz[i] > z1) z1 = this.pz[i];
    }
    this.dirty = easing;
    mesh.count = n;
    mesh.visible = n > 0;
    if (!n) return;
    const s = mesh.boundingSphere!;
    s.center.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    s.radius = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + 0.5;
    const im = mesh.instanceMatrix;
    im.clearUpdateRanges();
    im.addUpdateRange(0, n * 16);
    im.needsUpdate = true;
    const ic = mesh.instanceColor!;
    ic.clearUpdateRanges();
    ic.addUpdateRange(0, n * 3);
    ic.needsUpdate = true;
  }

  dispose(): void {
    const geo = this.mesh.geometry;
    geo.setIndex(null);
    geo.deleteAttribute('position');
    geo.deleteAttribute('normal');
    geo.dispose();
    this.mesh.dispose();
  }
}
