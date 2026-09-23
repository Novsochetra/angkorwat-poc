import { Group, Matrix4, Object3D, Vector3 } from 'three';
import type { VoxelBuilder } from '../voxel/VoxelBuilder';
import { buildVoxelMesh, disposeVoxelMesh, type VoxelQuality } from '../voxel/VoxelMesh';
import { JOINTS, JOINT_NAMES, type JointName } from './skeleton';

/**
 * Joint hierarchy (THREE.Group per joint, positioned in body units) plus named
 * "slots" holding the voxel meshes hanging off each joint. Parts are authored in
 * character space; the slot offsets them by the joint's rest pivot.
 */
export class Rig {
  readonly joints = {} as Record<JointName, Group>;
  /** Local rest position of each joint (relative to its parent). */
  readonly rest = {} as Record<JointName, Vector3>;
  private readonly slots = new Map<string, { joint: JointName; group: Group; owned: boolean }>();

  constructor(
    parent: Object3D,
    public quality: VoxelQuality,
  ) {
    for (const name of JOINT_NAMES) {
      const def = JOINTS[name];
      const pp = def.parent ? JOINTS[def.parent].pivot : [0, 0, 0];
      const g = new Group();
      g.name = `joint:${name}`;
      const local = new Vector3(def.pivot[0] - pp[0], def.pivot[1] - pp[1], def.pivot[2] - pp[2]);
      g.position.copy(local);
      this.rest[name] = local;
      this.joints[name] = g;
    }
    for (const name of JOINT_NAMES) {
      const p = JOINTS[name].parent;
      (p ? this.joints[p] : parent).add(this.joints[name]);
    }
  }

  /** Mesh a builder onto a joint, replacing whatever the slot held. */
  setSlot(slot: string, joint: JointName, builder: VoxelBuilder | null): Group | null {
    this.clearSlot(slot);
    if (!builder || builder.boxes.length === 0) return null;
    const pivot = JOINTS[joint].pivot;
    const group = buildVoxelMesh(builder, { quality: this.quality, offset: new Vector3(pivot[0], pivot[1], pivot[2]), name: slot });
    this.joints[joint].add(group);
    this.slots.set(slot, { joint, group, owned: true });
    return group;
  }

  /** Attach an existing object (not disposed when the slot is cleared). */
  setSlotObject(slot: string, joint: JointName, group: Group): void {
    this.clearSlot(slot);
    this.joints[joint].add(group);
    this.slots.set(slot, { joint, group, owned: false });
  }

  getSlot(slot: string): Group | undefined {
    return this.slots.get(slot)?.group;
  }

  clearSlot(slot: string): void {
    const s = this.slots.get(slot);
    if (!s) return;
    s.group.removeFromParent();
    if (s.owned) disposeVoxelMesh(s.group);
    this.slots.delete(slot);
  }

  /** Reset every joint to its rest transform. */
  resetPose(): void {
    for (const name of JOINT_NAMES) {
      this.joints[name].position.copy(this.rest[name]);
      this.joints[name].rotation.set(0, 0, 0);
    }
  }

  /** Transform of `joint` relative to the rig root (product of local matrices). */
  chainMatrix(joint: JointName, out: Matrix4): Matrix4 {
    out.identity();
    const chain: Group[] = [];
    let n: JointName | null = joint;
    while (n) {
      chain.push(this.joints[n]);
      n = JOINTS[n].parent;
    }
    for (let i = chain.length - 1; i >= 0; i--) {
      chain[i].updateMatrix();
      out.multiply(chain[i].matrix);
    }
    return out;
  }

  dispose(): void {
    for (const slot of [...this.slots.keys()]) this.clearSlot(slot);
  }
}
