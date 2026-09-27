import type { InstancedBufferAttribute, InstancedMesh, Object3D } from 'three';
import type { MkBuild } from './_mkKit';

/**
 * What comes and goes at the market with the time of day, without building
 * anything again: every box the build tagged (`MkBuild.tags`: a stall's
 * goods and spread tarp, its rolled tarp, the motos parked while it is
 * busy) is an instance of the market's voxel meshes (one per family, in the
 * builder's order); a toggle hides its instances by folding their matrices
 * to nothing and shows them by putting the saved ones back. Only the runs of
 * instances that changed go up to the GPU, and only when a toggle flips (a
 * few times a day). The toggled boxes are all soft families (goods, cloth):
 * the walk map, made once, never holds one that has gone.
 */
interface Run {
  attr: InstancedBufferAttribute;
  saved: Float32Array;
  start: number;
  count: number;
}

export class Toggles {
  private readonly runs = new Map<number, Run[]>();
  private readonly state = new Map<number, boolean>();

  constructor(root: Object3D, mk: MkBuild) {
    // (each family's boxes in the builder's order: instance i of the family's mesh is its i-th box)
    const byMat = new Map<string, number[]>();
    mk.b.boxes.forEach((b, i) => {
      let list = byMat.get(b.mat);
      if (!list) byMat.set(b.mat, (list = []));
      list.push(i);
    });
    root.traverse((o) => {
      const mesh = o as InstancedMesh;
      if (!mesh.isInstancedMesh) return;
      const list = byMat.get(mesh.name.slice(mesh.name.lastIndexOf(':') + 1));
      if (!list || list.length !== mesh.count) return;
      const attr = mesh.instanceMatrix;
      const saved = (attr.array as Float32Array).slice();
      for (let i = 0; i < list.length; ) {
        const tag = mk.tags[list[i]];
        let j = i;
        while (j + 1 < list.length && mk.tags[list[j + 1]] === tag) j++;
        if (tag !== 0) {
          let runs = this.runs.get(tag);
          if (!runs) this.runs.set(tag, (runs = []));
          runs.push({ attr, saved, start: i, count: j - i + 1 });
        }
        i = j + 1;
      }
    });
  }

  /** Toggles that have boxes. */
  get tags(): number[] {
    return [...this.runs.keys()];
  }

  /** Show (or hide) toggle `tag`'s boxes; nothing to do if it is that way already. */
  set(tag: number, on: boolean): void {
    if (this.state.get(tag) === on) return;
    this.state.set(tag, on);
    for (const r of this.runs.get(tag) ?? []) {
      const a = r.attr.array as Float32Array;
      const i0 = r.start * 16;
      const i1 = (r.start + r.count) * 16;
      if (on) a.set(r.saved.subarray(i0, i1), i0);
      else a.fill(0, i0, i1);
      r.attr.addUpdateRange(i0, i1 - i0);
      r.attr.needsUpdate = true;
    }
  }
}
