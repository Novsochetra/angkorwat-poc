import { BoxGeometry, Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3, type Object3D } from 'three';
import { SHAPE_BY_ID } from '../blocks/kinds';
import { BLOCK_M, cellMid, cellMin, rawColor, rawShape } from '../blocks/store';
import type { FootPlan, FootRect } from '../build/footPlan';
import type { RoamWorld } from './types';

/**
 * Footprint mode's preview (AWP-20, roam/_buildFoot.ts): the building he is
 * drawing, see-through, as build mode's ghost (_buildGhost.ts: the same look
 * and the same program, a basic material with a colour per block, no lights).
 *
 * - **Its blocks**: every block of its plan (build/footPlan.ts) where it
 *   would stand, its own colour tinted green (it can stand there) or red (not:
 *   drawn over whatever is there, never hidden; the reason is the prompt's).
 * - **The footprint**: its outline on the ground (pale green or red, along
 *   the ground), and the two corners: the first one marked (a stake with a red
 *   krama strip, as his land's corner posts), the one he is drawing to (a gold
 *   square of the cell and a stake: the cursor; before the first corner it is
 *   all that shows).
 *
 * One instanced draw; the blocks are placed when the plan changes (a step of
 * the cursor, a turn of the door), not every frame: a frame only fades it in
 * and out and lets it breathe. Made with roaming (its program compiled before
 * Start: one tiny block far under the land).
 */

/** Most boxes (a house of 8 × 8 m is ≈ 1 500 blocks; a fence round 24 × 24 m ≈ 600 and its outline). */
const MAX = 4096;
const OK = new Color(0x9cff8a);
const NO = new Color(0xff5a48);
const TINT = { ok: 0.5, no: 0.7 };
const EDGE_OK = new Color(0xd8ffc8);
const EDGE_NO = new Color(0xffb0a4);
const GOLD = new Color(0xffd27a);
const STAKE = new Color(0x6a4a2a);
const KRAMA = new Color(0xc8402e);
const ALPHA = { ok: 0.36, no: 0.5 };
const PULSE = 1.6;
const SWELL = 0.1;
/** The outline: its width, height over the ground (m), a length of it at most (it follows the ground). */
const EDGE = { w: 0.09, up: 0.04, step: 1 };

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();

interface Box {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  ok: Color;
  no: Color;
}

export class FootGhost {
  readonly mesh: InstancedMesh;
  private readonly mat: MeshBasicMaterial;
  private readonly boxes: Box[] = [];
  private want = false;
  private ok = true;
  private shownOk: boolean | null = null;
  private dirty = false;
  private on = 0;
  private clock = 0;

  constructor(parent: Object3D, private readonly world: RoamWorld) {
    this.mat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: true });
    this.mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), this.mat, MAX);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX * 3).fill(1), 3);
    this.mesh.name = 'build:footGhost';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.castShadow = this.mesh.receiveShadow = false;
    this.mesh.setMatrixAt(0, _m.makeScale(0.001, 0.001, 0.001).setPosition(0, -500, 0));
    this.mesh.count = 1;
    this.mesh.visible = false;
    parent.add(this.mesh);
  }

  /**
   * What it shows: the plan (null: none yet), the footprint (null: none yet), the first corner (cells, or null) and
   * the cursor's cell. Placed now (once a change).
   */
  set(plan: FootPlan | null, rect: FootRect | null, anchor: readonly [number, number] | null, cursor: readonly [number, number]): void {
    const out = this.boxes;
    out.length = 0;
    const f = this.world.field;
    if (plan)
      for (let b = 0; b < plan.n && out.length < MAX - 400; b++) {
        const raw = plan.raws[b];
        const shape = SHAPE_BY_ID[rawShape(raw)];
        const box = shape?.boxes[0] ?? [0, 0, 0, 1, 1, 1];
        const c = new Color(rawColor(raw));
        const i = plan.cells[b * 3];
        const j = plan.cells[b * 3 + 1];
        const k = plan.cells[b * 3 + 2];
        out.push({
          x: cellMin(i) + ((box[0] + box[3]) / 2) * BLOCK_M,
          y: cellMin(j) + ((box[1] + box[4]) / 2) * BLOCK_M,
          z: cellMin(k) + ((box[2] + box[5]) / 2) * BLOCK_M,
          sx: (box[3] - box[0]) * BLOCK_M,
          sy: (box[4] - box[1]) * BLOCK_M,
          sz: (box[5] - box[2]) * BLOCK_M,
          ok: c.clone().lerp(OK, TINT.ok),
          no: c.lerp(NO, TINT.no),
        });
      }
    // The footprint's outline on the ground, each side in lengths of at most a metre.
    if (rect) {
      const x0 = cellMin(rect.i0) - 0.03;
      const x1 = cellMin(rect.i1 + 1) + 0.03;
      const z0 = cellMin(rect.k0) - 0.03;
      const z1 = cellMin(rect.k1 + 1) + 0.03;
      for (const [ax, az, bx, bz] of [
        [x0, z0, x1, z0],
        [x1, z0, x1, z1],
        [x1, z1, x0, z1],
        [x0, z1, x0, z0],
      ] as const) {
        const len = Math.hypot(bx - ax, bz - az);
        const n = Math.max(1, Math.ceil(len / EDGE.step));
        for (let s = 0; s < n && out.length < MAX - 16; s++) {
          const u = (s + 0.5) / n;
          const x = ax + (bx - ax) * u;
          const z = az + (bz - az) * u;
          const along = (len / n) * 0.98;
          out.push({ x, y: f.heightAt(x, z) + EDGE.up, z, sx: ax === bx ? EDGE.w : along, sy: 0.04, sz: ax === bx ? along : EDGE.w, ok: EDGE_OK, no: EDGE_NO });
        }
      }
    }
    // The cursor: a gold square round its cell and a stake; the first corner: a stake with a red strip.
    const [ci, ck] = cursor;
    const cx = cellMid(ci);
    const cz = cellMid(ck);
    const cy = f.heightAt(cx, cz);
    const h = BLOCK_M / 2;
    for (const [dx, dz, sx, sz] of [
      [0, -h, BLOCK_M + 0.08, 0.08],
      [0, h, BLOCK_M + 0.08, 0.08],
      [-h, 0, 0.08, BLOCK_M + 0.08],
      [h, 0, 0.08, BLOCK_M + 0.08],
    ] as const)
      out.push({ x: cx + dx, y: cy + 0.06, z: cz + dz, sx, sy: 0.06, sz, ok: GOLD, no: GOLD });
    out.push({ x: cx, y: cy + 0.45, z: cz, sx: 0.07, sy: 0.9, sz: 0.07, ok: GOLD, no: GOLD });
    if (anchor) {
      const ax = cellMid(anchor[0]);
      const az = cellMid(anchor[1]);
      const ay = f.heightAt(ax, az);
      out.push({ x: ax, y: ay + 0.6, z: az, sx: 0.09, sy: 1.2, sz: 0.09, ok: STAKE, no: STAKE });
      out.push({ x: ax + 0.12, y: ay + 1.02, z: az, sx: 0.18, sy: 0.22, sz: 0.03, ok: KRAMA, no: KRAMA });
    }
    this.dirty = true;
    this.shownOk = null;
  }

  /** Show it where it can stand (`ok`) or not, or hide it. */
  show(on: boolean, ok = true): void {
    this.want = on;
    this.ok = ok;
  }

  get shown(): boolean {
    return this.want;
  }

  /** Each frame: fade, breath; its boxes placed again only after a change, recoloured only when `ok` changes. */
  frame(dt: number): void {
    this.clock += dt;
    const k = dt > 0 ? Math.min(1, dt * 8) : 1;
    this.on += ((this.want ? 1 : 0) - this.on) * k;
    if (this.on < 0.02 && !this.want) {
      this.on = 0;
      if (this.mesh.visible) {
        this.mesh.visible = false;
        this.mesh.count = 1;
        this.mesh.setMatrixAt(0, _m.makeScale(0.001, 0.001, 0.001).setPosition(0, -500, 0));
        this.mesh.instanceMatrix.needsUpdate = true;
        this.mat.opacity = 0;
        this.dirty = true;
      }
      return;
    }
    this.mesh.visible = true;
    const breath = 1 + SWELL * Math.sin(this.clock * PULSE);
    this.mat.opacity = this.on * (this.ok ? ALPHA.ok : ALPHA.no) * breath;
    if (this.mat.depthTest !== this.ok) this.mat.depthTest = this.ok;
    const boxes = this.boxes;
    if (this.dirty) {
      this.dirty = false;
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        this.mesh.setMatrixAt(i, _m.compose(_p.set(b.x, b.y, b.z), _q, _s.set(b.sx, b.sy, b.sz)));
      }
      this.mesh.count = boxes.length;
      this.mesh.instanceMatrix.needsUpdate = true;
    }
    if (this.shownOk !== this.ok) {
      this.shownOk = this.ok;
      for (let i = 0; i < boxes.length; i++) this.mesh.setColorAt(i, this.ok ? boxes[i].ok : boxes[i].no);
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
  }
}
