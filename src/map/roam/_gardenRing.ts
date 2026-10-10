import { BoxGeometry, CircleGeometry, Color, DynamicDrawUsage, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Object3D, Quaternion, Vector3 } from 'three';
import type { HeightField } from '../heightfield';
import { KINDS } from '../garden/kinds';
import { GARDEN } from '../garden/state';

/**
 * The ring on the ground where he would plant (roam/_garden.ts shows it while he
 * is in his garden with seeds in hand and nothing else busy): a circle of short
 * dashes the size of the plant's room (`KINDS[k].room`: nothing else is planted
 * inside it), a little cross where the plant's foot goes, soft green when it can
 * go there, red when not (the reason is the prompt's line). Each dash sits on the
 * land under it, so a ring across a land step shows the step.
 *
 * One instanced draw of small flat blocks in a plain colour (a basic material:
 * no lights, no new kind of shader), made when roaming is built so its shader is
 * compiled before Start; hidden (no instances) while it is not wanted. Its colour
 * glows a little after dark (over the bloom's threshold, as the farm's guide).
 * Fades in and out; no allocation per frame.
 */

/** Dashes: one per this many metres of the circle (at least / at most). */
const DASH_EVERY = 0.34;
const DASH_MIN = 14;
const DASH_MAX = 76;
/** A dash's size (m: along the circle, up, across), the cross's arms. */
const DASH = { len: 0.28, h: 0.05, w: 0.12 };
const CROSS = 0.34;
/** The soft disc inside the ring: how strong (of the ring's opacity), how much of the radius. */
const DISC = { alpha: 0.16, r: 0.97 };
/** Over the land (m). */
const UP = 0.06;
const GREEN = new Color(0x9cf06e);
const RED = new Color(0xff5a40);
/** Brighter at night (the bloom), the breath (rad/s, swell). */
const NIGHT_GAIN = 1.7;
const PULSE = 3.0;

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3(1, 1, 1);
const _up = new Vector3(0, 1, 0);
const _c = new Color();

/**
 * Over the earth the garden has dug there (garden/_viewEarth.ts): a crop's bed (square to the map, half its side
 * `room × 0.75` within 0.45‥0.85 m, 0.12 m high), a young tree's basin bank (≈ 1 m round, low): how high (m).
 */
function earthUp(x: number, z: number): number {
  let up = 0;
  for (const p of GARDEN.plants) {
    const k = KINDS[p.kind];
    const dx = Math.abs(x - p.x);
    const dz = Math.abs(z - p.z);
    if (k.size === 'crop') {
      const half = Math.min(0.85, Math.max(0.45, k.room * 0.75)) + 0.06;
      if (dx < half && dz < half) up = Math.max(up, 0.13);
    } else if (dx < 1.1 && dz < 1.1 && dx * dx + dz * dz < 1.2) up = Math.max(up, 0.1);
  }
  return up;
}

export class GardenRing {
  readonly mesh: InstancedMesh;
  private readonly mat: MeshBasicMaterial;
  /** A soft disc filling the ring (the room it needs reads at a glance, on a phone too). */
  private readonly disc: Mesh;
  private readonly discMat: MeshBasicMaterial;
  /** Wanted now: where (m), how big (room, m), ok or not. */
  private want = false;
  private x = 0;
  private z = 0;
  private r = 1;
  private ok = true;
  /** Shown (0‥1, eased), the colour's mix toward red (eased), the clock. */
  private on = 0;
  private red = 0;
  private clock = 0;

  constructor(parent: Object3D, private readonly field: HeightField) {
    const geo = new BoxGeometry(1, 1, 1);
    // (drawn over everything: the follow camera looks at his chest, so the ground just before him is under his hat;
    // the ring shows through him, as a marker)
    this.mat = new MeshBasicMaterial({ color: GREEN, transparent: true, opacity: 0, depthWrite: false, depthTest: false, toneMapped: true });
    this.mesh = new InstancedMesh(geo, this.mat, DASH_MAX + 2);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.name = 'garden:ring';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    // (in the scene from the start, with nothing to draw: its shader is compiled with the map's)
    this.mesh.count = 0;
    parent.add(this.mesh);
    const dg = new CircleGeometry(1, 40);
    dg.rotateX(-Math.PI / 2);
    this.discMat = new MeshBasicMaterial({ color: GREEN, transparent: true, opacity: 0, depthWrite: false, depthTest: false, toneMapped: true });
    this.disc = new Mesh(dg, this.discMat);
    this.disc.name = 'garden:ringDisc';
    this.disc.renderOrder = 11;
    this.disc.frustumCulled = false;
    parent.add(this.disc);
  }

  /** Show it at (x, z) the size `room` (m), green when `ok`; or hide it (null). Each step. */
  show(x: number | null, z = 0, room = 1, ok = true): void {
    if (x === null) {
      this.want = false;
      return;
    }
    this.want = true;
    this.x = x;
    this.z = z;
    this.r = room;
    this.ok = ok;
  }

  get shown(): boolean {
    return this.want;
  }

  /** Each frame: fade, colour, the dashes on the land. */
  frame(dt: number, night: number): void {
    this.clock += dt;
    const k = dt > 0 ? Math.min(1, dt * 10) : 1;
    this.on += ((this.want ? 1 : 0) - this.on) * k;
    if (this.on < 0.02 && !this.want) {
      this.on = 0;
      this.mesh.count = 0;
      this.discMat.opacity = 0;
      this.disc.visible = false;
      return;
    }
    this.red += ((this.ok ? 0 : 1) - this.red) * (dt > 0 ? Math.min(1, dt * 14) : 1);
    const breath = 0.5 + 0.5 * Math.sin(this.clock * PULSE);
    _c.copy(GREEN).lerp(RED, this.red).multiplyScalar(1 + (NIGHT_GAIN - 1) * night);
    this.mat.color.copy(_c);
    this.mat.opacity = this.on * (0.78 + 0.2 * breath);
    const f = this.field;
    const cy = f.heightAt(this.x, this.z);
    this.discMat.color.copy(_c);
    this.discMat.opacity = this.on * DISC.alpha * (0.85 + 0.15 * breath);
    this.disc.visible = true;
    this.disc.position.set(this.x, cy + UP * 0.5 + earthUp(this.x, this.z), this.z);
    this.disc.scale.setScalar(this.r * DISC.r);
    const n = Math.max(DASH_MIN, Math.min(DASH_MAX, Math.round((Math.PI * 2 * this.r) / DASH_EVERY)));
    let i = 0;
    for (let d = 0; d < n; d++) {
      const a = (d / n) * Math.PI * 2;
      const px = this.x + Math.sin(a) * this.r;
      const pz = this.z + Math.cos(a) * this.r;
      // (along the circle: its tangent; a dash a little shorter on a small circle)
      _q.setFromAxisAngle(_up, a + Math.PI / 2);
      _p.set(px, f.heightAt(px, pz) + UP + earthUp(px, pz), pz);
      _s.set(DASH.w, DASH.h, Math.min(DASH.len, ((Math.PI * 2 * this.r) / n) * 0.6));
      this.mesh.setMatrixAt(i++, _m.compose(_p, _q, _s));
    }
    // The cross at the plant's foot.
    for (let j = 0; j < 2; j++) {
      _q.setFromAxisAngle(_up, (j * Math.PI) / 2 + Math.PI / 4);
      _p.set(this.x, cy + UP, this.z);
      _s.set(DASH.w, DASH.h, CROSS);
      this.mesh.setMatrixAt(i++, _m.compose(_p, _q, _s));
    }
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.disc.removeFromParent();
    this.disc.geometry.dispose();
    this.discMat.dispose();
  }
}
