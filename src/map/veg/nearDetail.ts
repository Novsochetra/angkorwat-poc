import type { InstancedMesh, Object3D } from 'three';
import type { VoxelBox, VoxelBuilder } from '../../voxel/VoxelBuilder';

/**
 * Small plant things drawn only near (as the palm sugar yard's small blocks,
 * hamlet/_palmSugar.ts `NEAR_DETAIL`): a garden's leaves and vines, the fruit
 * on the trees, the market's produce. From further off they are under a
 * pixel, but their triangles still cost (a walk on the far side of the map
 * sees the whole place). The builder's `fine` blocks go last in each family
 * (`fineLast`, before the meshes are built); far off, each family's mesh
 * draws only the blocks before them (`NearDetail.set(false)`). One voxel mesh
 * per family (no `hideCovered`), its instances in the builder's order.
 */

/** Put the `fine` blocks last in the builder (each family keeps its order); `tags` (one per box) follow them. Returns the tags in the new order. */
export function fineLast(b: VoxelBuilder, fine: ReadonlySet<VoxelBox>, tags?: readonly number[]): number[] {
  const order: number[] = [];
  b.boxes.forEach((x, i) => {
    if (!fine.has(x)) order.push(i);
  });
  b.boxes.forEach((x, i) => {
    if (fine.has(x)) order.push(i);
  });
  const boxes = order.map((i) => b.boxes[i]);
  b.boxes.length = 0;
  b.boxes.push(...boxes);
  return order.map((i) => tags?.[i] ?? 0);
}

/** Each family mesh of `root` (built from `boxes`, the fine ones last): all its instances near, only the coarse ones far. */
export class NearDetail {
  private readonly meshes: { mesh: InstancedMesh; all: number; coarse: number }[] = [];
  private near = true;
  /** The fine blocks (drawn only near). */
  readonly fine: number;

  constructor(root: Object3D, boxes: readonly VoxelBox[], fine: ReadonlySet<VoxelBox>) {
    const coarse = new Map<string, number>();
    const all = new Map<string, number>();
    for (const x of boxes) {
      all.set(x.mat, (all.get(x.mat) ?? 0) + 1);
      if (!fine.has(x)) coarse.set(x.mat, (coarse.get(x.mat) ?? 0) + 1);
    }
    root.traverse((o) => {
      const mesh = o as InstancedMesh;
      if (!mesh.isInstancedMesh) return;
      const mat = mesh.name.slice(mesh.name.lastIndexOf(':') + 1);
      // (only a family's own mesh, all its blocks in it)
      if (all.get(mat) !== mesh.count) return;
      this.meshes.push({ mesh, all: mesh.count, coarse: coarse.get(mat) ?? 0 });
    });
    this.fine = boxes.filter((x) => fine.has(x)).length;
  }

  /** Draw the fine blocks (near) or not (far); nothing to do if it is that way already. */
  set(near: boolean): void {
    if (near === this.near) return;
    this.near = near;
    for (const m of this.meshes) m.mesh.count = near ? m.all : m.coarse;
  }
}
