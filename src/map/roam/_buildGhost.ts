import { BoxGeometry, Color, DynamicDrawUsage, Euler, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3, type Object3D } from 'three';
import { PIECES, type PieceId } from '../build/pieces';
import { pieceLook } from '../build/view';
import type { RoamWorld } from './types';

/**
 * Build mode's preview (roam/_build.ts): the piece he is about to build, where
 * it would stand, see-through, as a placement preview is in a building game.
 *
 * - **It can stand there**: the piece's own blocks (its model, build/view.ts
 *   `pieceLook`) tinted a soft green, and its footprint outlined on the ground
 *   in pale green.
 * - **It cannot**: the same in red, drawn over whatever stands there (never
 *   invisible: a wall, the house); the reason is the prompt's line.
 *
 * It sits before him and follows him as he walks and turns (the piece's front
 * to him, turned more with `,` / `.`); it breathes slowly. One instanced draw of
 * blocks in a plain colour each (a basic material: no lights; the garden
 * ghost's program), made with roaming so its shader is compiled before Start;
 * no allocation per frame.
 */

/** Most blocks a ghost has (the pen's ≤ 600, the outline). */
const MAX = 760;
/** Tints: the share toward green (it can stand) or red (not), the outline's colours. */
const OK = new Color(0x9cff8a);
const NO = new Color(0xff5a48);
const TINT = { ok: 0.55, no: 0.7 };
const EDGE_OK = new Color(0xd8ffc8);
const EDGE_NO = new Color(0xffb0a4);
/** Opacity where it can stand and where not; its breath (rad/s, swell). */
const ALPHA = { ok: 0.5, no: 0.6 };
const PULSE = 1.6;
const SWELL = 0.1;
/** The outline: its width, height over the ground (m), the most a side is split into (it follows the ground). */
const EDGE_W = 0.09;
const EDGE_UP = 0.04;
const EDGE_STEP = 0.8;

interface GhostBox {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  q: Quaternion;
  ok: Color;
  no: Color;
  /** On the ground under it (the outline), else on the piece's ground (its middle's). */
  flat: boolean;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _qy = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _up = new Vector3(0, 1, 0);
const _e = new Euler();

export class BuildGhost {
  readonly mesh: InstancedMesh;
  private readonly mat: MeshBasicMaterial;
  private boxes: GhostBox[] = [];
  private id: PieceId | null = null;
  private want = false;
  private x = 0;
  private z = 0;
  private yaw = 0;
  private ok = true;
  private shownOk: boolean | null = null;
  private on = 0;
  private clock = 0;

  constructor(parent: Object3D, private readonly world: RoamWorld) {
    this.mat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: true });
    this.mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), this.mat, MAX);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX * 3).fill(1), 3);
    this.mesh.name = 'build:ghost';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.castShadow = this.mesh.receiveShadow = false;
    // (one tiny block far under the land on the first frames: its shader is compiled with the map's)
    this.mesh.setMatrixAt(0, _m.makeScale(0.001, 0.001, 0.001).setPosition(0, -500, 0));
    this.mesh.count = 1;
    parent.add(this.mesh);
  }

  /** The piece it shows (its blocks made once per piece). */
  setPiece(id: PieceId): void {
    if (id === this.id) return;
    this.id = id;
    this.shownOk = null;
    const out: GhostBox[] = [];
    const look = pieceLook(id, 0.37);
    for (const b of look.boxes) {
      if (out.length >= MAX - 48) break;
      const c = new Color(b.color);
      out.push({
        x: b.x,
        y: b.y,
        z: b.z,
        sx: b.sx,
        sy: b.sy,
        sz: b.sz,
        q: new Quaternion().setFromEuler(_e.set(b.rx ?? 0, b.ry ?? 0, b.rz ?? 0)),
        ok: c.clone().lerp(OK, TINT.ok),
        no: c.clone().lerp(NO, TINT.no),
        flat: false,
      });
    }
    // The footprint's outline on the ground, each side in short lengths (they follow the ground).
    const p = PIECES[id];
    const hw = p.w / 2 + 0.05;
    const hd = p.d / 2 + 0.05;
    for (const [len, along, at] of [
      [p.w, 'x', -hd],
      [p.w, 'x', hd],
      [p.d, 'z', -hw],
      [p.d, 'z', hw],
    ] as const) {
      const n = Math.max(1, Math.ceil((len + 0.1) / EDGE_STEP));
      const seg = (len + 0.1) / n;
      for (let i = 0; i < n; i++) {
        const u = -(len + 0.1) / 2 + (i + 0.5) * seg;
        const x = along === 'x' ? u : at;
        const z = along === 'x' ? at : u;
        out.push({
          x,
          y: EDGE_UP,
          z,
          sx: along === 'x' ? seg * 0.96 : EDGE_W,
          sy: 0.04,
          sz: along === 'x' ? EDGE_W : seg * 0.96,
          q: new Quaternion(),
          ok: EDGE_OK,
          no: EDGE_NO,
          flat: true,
        });
      }
    }
    this.boxes = out;
  }

  /** Show it with its middle at (x, z) turned `yaw`, where it can stand (`ok`) or not; or hide it (null). */
  show(x: number | null, z = 0, yaw = 0, ok = true): void {
    if (x === null || !this.id) {
      this.want = false;
      return;
    }
    this.want = true;
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.ok = ok;
  }

  get shown(): boolean {
    return this.want;
  }

  /** Each frame: fade, breath, its blocks on the land. */
  frame(dt: number): void {
    this.clock += dt;
    const k = dt > 0 ? Math.min(1, dt * 8) : 1;
    this.on += ((this.want ? 1 : 0) - this.on) * k;
    if (this.on < 0.02 && !this.want) {
      this.on = 0;
      if (this.mesh.count !== 1 || this.mat.opacity !== 0) {
        this.mesh.count = 1;
        this.mesh.setMatrixAt(0, _m.makeScale(0.001, 0.001, 0.001).setPosition(0, -500, 0));
        this.mesh.instanceMatrix.needsUpdate = true;
        this.mat.opacity = 0;
      }
      return;
    }
    const breath = 1 + SWELL * Math.sin(this.clock * PULSE);
    this.mat.opacity = this.on * (this.ok ? ALPHA.ok : ALPHA.no) * breath;
    // (where it cannot stand it is drawn over what stands there: never invisible)
    if (this.mat.depthTest !== this.ok) this.mat.depthTest = this.ok;
    const recolour = this.shownOk !== this.ok;
    this.shownOk = this.ok;
    const f = this.world.field;
    const y0 = f.heightAt(this.x, this.z);
    _qy.setFromAxisAngle(_up, this.yaw);
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    const boxes = this.boxes;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      _p.set(this.x + b.x * c + b.z * s, 0, this.z - b.x * s + b.z * c);
      _p.y = (b.flat ? f.heightAt(_p.x, _p.z) : y0) + b.y;
      _q.copy(_qy).multiply(b.q);
      this.mesh.setMatrixAt(i, _m.compose(_p, _q, _s.set(b.sx, b.sy, b.sz)));
      if (recolour) this.mesh.setColorAt(i, this.ok ? b.ok : b.no);
    }
    if (recolour && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.count = boxes.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
