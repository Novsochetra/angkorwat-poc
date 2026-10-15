import { BoxGeometry, Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3, type Object3D } from 'three';
import { BLOCK_M, cellMin } from '../blocks/store';

/**
 * Paint mode's marks (AWP-22, roam/_paint.ts): what he aims at and what E
 * will paint, drawn as build mode's ghosts are (_buildFootGhost.ts: the same
 * look and the same program, a basic material with a colour per box, no
 * lights; no program of its own).
 *
 * - **The block he aims at**: a thin light frame round it (its twelve edges,
 *   a little out from it), and the side he aims at covered with the colour he
 *   holds (a swatch's colour, or the block's own): what one press of E makes
 *   it.
 * - **A part** (E held: roam/_paint.ts): every block of it covered with that
 *   colour, more and more as the press goes on (`part(cells, colour, 0‥1)`),
 *   so he sees what will be painted before it is.
 * - **Painted**: a short flash on what was painted (`flash()`).
 *
 * Two instanced draws (the frame and side, the part), placed when the aim
 * changes, not every frame. Made with roaming (its program compiled before
 * Start: one tiny box far under the land).
 */

/** Most boxes of a part (blocks/paint.ts `PART_MOST`; a house's thatch ≈ 1 000). */
const MAX = 4200;
const EDGE_COLOR = new Color(0xfff4d6);
/** The frame's bars (m) and how far out from the block they run. */
const BAR = 0.035;
const OUT = 0.025;
/** The side's cover: how far off the side (m), how thick. */
const SKIN = { off: 0.012, thick: 0.01 };
/** Opacity: the frame and side; a part from its start to full. */
const ALPHA = { aim: 0.92, part0: 0.18, part1: 0.62 };
const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _c = new Color();

function makeMesh(name: string, max: number, order: number): { mesh: InstancedMesh; mat: MeshBasicMaterial } {
  // (the parameters of build mode's ghosts: the same program)
  const mat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: true });
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), mat, max);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.renderOrder = order;
  mesh.castShadow = mesh.receiveShadow = false;
  mesh.setMatrixAt(0, _m.makeScale(0.001, 0.001, 0.001).setPosition(0, -500, 0));
  mesh.count = 1;
  mesh.visible = false;
  return { mesh, mat };
}

export class PaintCursor {
  private readonly aimMesh: InstancedMesh;
  private readonly aimMat: MeshBasicMaterial;
  private readonly partMesh: InstancedMesh;
  private readonly partMat: MeshBasicMaterial;
  private aimKey = '';
  private partKey = '';
  private aimOn = false;
  private partOn = 0;
  private flashT = 0;
  private clock = 0;

  constructor(parent: Object3D) {
    const a = makeMesh('paint:aim', 16, 4);
    this.aimMesh = a.mesh;
    this.aimMat = a.mat;
    const p = makeMesh('paint:part', MAX, 3);
    this.partMesh = p.mesh;
    this.partMat = p.mat;
    // (drawn once, too small to see, so its program is compiled before Start)
    this.aimMesh.visible = true;
    parent.add(this.aimMesh, this.partMesh);
  }

  /**
   * The block aimed at: its cell, its boxes' bounds in the cell (cell units), the side aimed at (0 +x, 1 −x, 2 +y,
   * 3 −y, 4 +z, 5 −z) and the colour that side shows (sRGB hex); null: none.
   */
  aim(at: { i: number; j: number; k: number; box: readonly number[]; side: number; colour: number } | null): void {
    this.aimOn = !!at;
    if (!at) return;
    const key = `${at.i},${at.j},${at.k},${at.box.join(',')},${at.side},${at.colour}`;
    if (key === this.aimKey) return;
    this.aimKey = key;
    const b = at.box;
    const x0 = cellMin(at.i) + b[0] * BLOCK_M - OUT;
    const y0 = cellMin(at.j) + b[1] * BLOCK_M - OUT;
    const z0 = cellMin(at.k) + b[2] * BLOCK_M - OUT;
    const x1 = cellMin(at.i) + b[3] * BLOCK_M + OUT;
    const y1 = cellMin(at.j) + b[4] * BLOCK_M + OUT;
    const z1 = cellMin(at.k) + b[5] * BLOCK_M + OUT;
    const lo = [x0, y0, z0];
    const hi = [x1, y1, z1];
    const mid = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
    const size = [x1 - x0, y1 - y0, z1 - z0];
    let n = 0;
    // The twelve edges: along each axis, at the four corners of the other two.
    for (let a = 0; a < 3; a++) {
      const u = (a + 1) % 3;
      const v = (a + 2) % 3;
      for (const cu of [lo[u], hi[u]])
        for (const cv of [lo[v], hi[v]]) {
          const pos = [0, 0, 0];
          const sc = [BAR, BAR, BAR];
          pos[a] = mid[a];
          sc[a] = size[a] + BAR;
          pos[u] = cu;
          pos[v] = cv;
          this.aimMesh.setMatrixAt(n, _m.compose(_p.set(pos[0], pos[1], pos[2]), _q, _s.set(sc[0], sc[1], sc[2])));
          this.aimMesh.setColorAt(n++, EDGE_COLOR);
        }
    }
    // The side: the colour it will be, just off it.
    const ax = at.side >> 1;
    const pos = [...mid];
    const sc = [...size];
    pos[ax] = (at.side & 1 ? lo[ax] + OUT : hi[ax] - OUT) + (at.side & 1 ? -SKIN.off : SKIN.off);
    sc[ax] = SKIN.thick;
    sc[(ax + 1) % 3] -= 2 * OUT + 0.01;
    sc[(ax + 2) % 3] -= 2 * OUT + 0.01;
    this.aimMesh.setMatrixAt(n, _m.compose(_p.set(pos[0], pos[1], pos[2]), _q, _s.set(sc[0], sc[1], sc[2])));
    this.aimMesh.setColorAt(n++, _c.setHex(at.colour));
    this.aimMesh.count = n;
    this.aimMesh.instanceMatrix.needsUpdate = true;
    if (this.aimMesh.instanceColor) this.aimMesh.instanceColor.needsUpdate = true;
  }

  /** A part's blocks (cells i, j, k … flat) covered with `colour` (sRGB hex), `amount` 0‥1 of the press; null: none. */
  part(cells: readonly number[] | null, colour = 0, amount = 0): void {
    this.partOn = cells && cells.length ? Math.max(0.001, amount) : 0;
    if (!cells || !cells.length) return;
    const key = `${cells.length}|${cells[0]},${cells[1]},${cells[2]}|${cells[cells.length - 3]}|${colour}`;
    if (key === this.partKey) return;
    this.partKey = key;
    _c.setHex(colour);
    const n = Math.min(MAX, cells.length / 3);
    const s = BLOCK_M + 0.03;
    for (let b = 0; b < n; b++) {
      _p.set(cellMin(cells[b * 3]) + BLOCK_M / 2, cellMin(cells[b * 3 + 1]) + BLOCK_M / 2, cellMin(cells[b * 3 + 2]) + BLOCK_M / 2);
      this.partMesh.setMatrixAt(b, _m.compose(_p, _q, _s.set(s, s, s)));
      this.partMesh.setColorAt(b, _c);
    }
    this.partMesh.count = n;
    this.partMesh.instanceMatrix.needsUpdate = true;
    if (this.partMesh.instanceColor) this.partMesh.instanceColor.needsUpdate = true;
  }

  /** Something was just painted: the marks flash. */
  flash(): void {
    this.flashT = 0.35;
  }

  get shown(): boolean {
    return this.aimOn;
  }

  /** Each frame: the opacity (a soft breath; a flash after painting). */
  frame(dt: number): void {
    this.clock += dt;
    this.flashT = Math.max(0, this.flashT - dt);
    const flash = this.flashT / 0.35;
    const on = this.aimOn;
    this.aimMesh.visible = on;
    this.aimMat.opacity = on ? ALPHA.aim * (0.88 + 0.12 * Math.sin(this.clock * 3)) * (1 - 0.5 * flash) : 0;
    const p = this.partOn;
    this.partMesh.visible = p > 0;
    this.partMat.opacity = p > 0 ? ALPHA.part0 + (ALPHA.part1 - ALPHA.part0) * Math.min(1, p) : 0;
    if (!on && !p) this.aimKey = '';
  }
}
