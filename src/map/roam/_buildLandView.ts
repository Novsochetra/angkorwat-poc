import { BoxGeometry, Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial, type Object3D } from 'three';
import { LAND_CELL, type LandKind, type LandMap } from './_buildLand';
import type { RoamWorld } from './types';

/**
 * The red squares on his land while he builds (_buildLand.ts `blockedRuns`): where the kind he places cannot stand
 * for good — the margins round the trail and the water, the stream's bank stones, a rock, his house — a faint red
 * film on the ground, so he sees it before he tries. One instanced draw (rows of squares, at most 2 m each, on the
 * ground's height at their middle), the ghosts' program (a basic material with a colour per box), made again only
 * when the kind changes; it fades in and out.
 */

const RED = new Color(0xff4a3a);
const OPACITY = 0.3;
/** Over the ground (m), and how thick (m). */
const LIFT = { y: 0.05, t: 0.03 };
const MAX = 12000;

export class LandView {
  private readonly mesh: InstancedMesh;
  private readonly mat: MeshBasicMaterial;
  private kind: LandKind | null = null;
  private want = false;
  private k = 0;

  constructor(
    parent: Object3D,
    private readonly world: RoamWorld,
    private readonly land: LandMap,
  ) {
    this.mat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: true });
    this.mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), this.mat, MAX);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX * 3).fill(1), 3);
    this.mesh.name = 'build:landRed';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.castShadow = this.mesh.receiveShadow = false;
    // (one tiny box far under the land: its program compiled before Start)
    this.mesh.setMatrixAt(0, new Matrix4().makeScale(0.001, 0.001, 0.001).setPosition(0, -500, 0));
    this.mesh.count = 1;
    this.mesh.visible = false;
    parent.add(this.mesh);
  }

  /** Show the red squares of `kind` (null: none). */
  show(kind: LandKind | null): void {
    this.want = kind !== null;
    if (!kind || kind === this.kind || !this.land.ready) return;
    this.kind = kind;
    const runs = this.land.blockedRuns(kind);
    const m = new Matrix4();
    const f = this.world.field;
    let n = 0;
    for (const r of runs) {
      if (n >= MAX) break;
      const x = (r.x0 + r.x1) / 2;
      m.makeScale(r.x1 - r.x0 - 0.02, LIFT.t, LAND_CELL - 0.02).setPosition(x, f.heightAt(x, r.z) + LIFT.y, r.z);
      this.mesh.setMatrixAt(n, m);
      this.mesh.setColorAt(n, RED);
      n++;
    }
    this.mesh.count = Math.max(1, n);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  get shown(): boolean {
    return this.want;
  }

  /** How many rows it draws now (checks). */
  get rows(): number {
    return this.kind ? this.mesh.count : 0;
  }

  frame(dt: number): void {
    const to = this.want ? 1 : 0;
    this.k = dt > 0 ? (to > this.k ? Math.min(1, this.k + dt * 4) : Math.max(0, this.k - dt * 4)) : to;
    this.mesh.visible = this.k > 0.01;
    this.mat.opacity = OPACITY * this.k;
  }
}
