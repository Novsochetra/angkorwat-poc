import { type BufferAttribute, type InstancedBufferAttribute, type InstancedMesh, type Object3D, type Points } from 'three';
import type { VoxelBox } from '../../voxel/VoxelBuilder';

/**
 * What comes and goes behind Angkor Wat with the time of day, without
 * building anything again (the market's goods, sheets, spread tarps and open
 * parasols, its rolled tarps and folded parasols, the bicycles parked while
 * it is busy: `_bhMarket.ts`): the east market's toggles (`_mkToggles.ts`)
 * for a builder whose boxes are tagged only in part — the hamlet's own blocks
 * (tag 0: always there) and the market's appended after them. Every box
 * with a tag is an instance of the hamlet's voxel meshes (one per family, in
 * the builder's order); a toggle hides its instances by folding their
 * matrices to nothing and shows them by putting the saved ones back. Only
 * the runs of instances that changed go up to the GPU, and only when a
 * toggle flips (a few times a day). The toggled boxes are all soft (goods,
 * cloth: `petal`): the walk maps, made once, never hold one that has gone.
 */
interface Run {
  attr: InstancedBufferAttribute;
  saved: Float32Array;
  start: number;
  count: number;
}

export class BackToggles {
  private readonly runs = new Map<number, Run[]>();
  private readonly state = new Map<number, boolean>();

  /** `tags[i]`: box `i`'s toggle (missing: 0, always there). */
  constructor(root: Object3D, boxes: readonly VoxelBox[], tags: readonly number[]) {
    const byMat = new Map<string, number[]>();
    boxes.forEach((b, i) => {
      let list = byMat.get(b.mat);
      if (!list) byMat.set(b.mat, (list = []));
      list.push(i);
    });
    const tagOf = (i: number) => tags[i] ?? 0;
    root.traverse((o) => {
      const mesh = o as InstancedMesh;
      if (!mesh.isInstancedMesh) return;
      const list = byMat.get(mesh.name.slice(mesh.name.lastIndexOf(':') + 1));
      if (!list || list.length !== mesh.count) return;
      const attr = mesh.instanceMatrix;
      let saved: Float32Array | null = null;
      for (let i = 0; i < list.length; ) {
        const tag = tagOf(list[i]);
        let j = i;
        while (j + 1 < list.length && tagOf(list[j + 1]) === tag) j++;
        if (tag !== 0) {
          saved ??= (attr.array as Float32Array).slice();
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

/**
 * The market's lamps among the hamlet's glows (village/_lights.ts: one
 * mesh of glowing blocks, one cloud of halos): a lamp that is off is folded
 * away (its block's matrix nothing: the lamp's housing, the stove's mouth are
 * blocks of their own) with no halo (its size nothing), written only when
 * one switches.
 */
export class LampSwitch {
  private readonly mesh: InstancedMesh | null;
  private readonly sizes: BufferAttribute | null;
  private readonly on: boolean[];
  private readonly saved: Float32Array | null;

  /** `lamps[k]`: its glowing block's index in the glow mesh, its halo's in the halos, its halo's size. */
  constructor(
    root: Object3D,
    private readonly lamps: readonly { glowAt: number; haloAt: number; halo: number }[],
  ) {
    this.mesh = (root.getObjectByName('village:glow') as InstancedMesh | undefined) ?? null;
    const halos = root.getObjectByName('village:halos') as Points | undefined;
    this.sizes = (halos?.geometry.getAttribute('aSize') as BufferAttribute | undefined) ?? null;
    this.on = lamps.map(() => true);
    this.saved = this.mesh ? (this.mesh.instanceMatrix.array as Float32Array).slice() : null;
  }

  /** Light lamp `k` (or put it out). */
  set(k: number, on: boolean): void {
    if (this.on[k] === on) return;
    this.on[k] = on;
    const l = this.lamps[k];
    if (this.mesh && this.saved) {
      const attr = this.mesh.instanceMatrix;
      const a = attr.array as Float32Array;
      const i0 = l.glowAt * 16;
      if (on) a.set(this.saved.subarray(i0, i0 + 16), i0);
      else a.fill(0, i0, i0 + 16);
      attr.addUpdateRange(i0, 16);
      attr.needsUpdate = true;
    }
    if (this.sizes) {
      (this.sizes.array as Float32Array)[l.haloAt] = on ? l.halo : 0;
      this.sizes.needsUpdate = true;
    }
  }
}
