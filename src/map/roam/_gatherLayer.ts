import { Group, type InstancedMesh, type Object3D, type WebGLRenderer } from 'three';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { graphicsNow, markStill } from '../graphics';

/**
 * A gathering source's own blocks (roam/_gatherLogs.ts the felled trunks, _gatherThatch.ts the young sugar palms,
 * _gatherClay.ts the clay banks): one small voxel mesh in the roaming group, made again when what the spots have left
 * changes (`set`). As the map's own blocks: plain on the low level, casting the still shadows of low and medium (asked
 * again from the first drawing after a change). In the families the map draws already: no new shader.
 */
export class GatherLayer {
  readonly object = new Group();
  private mesh: Group | null = null;
  private ask = false;
  /** Blocks drawn now (checks). */
  blocks = 0;

  /** `shadows`: it casts (flat things on the ground do not). */
  constructor(
    parent: Object3D,
    name: string,
    private readonly shadows = true,
  ) {
    this.object.name = name;
    parent.add(this.object);
  }

  set(b: VoxelBuilder | null): void {
    if (this.mesh) {
      this.object.remove(this.mesh);
      this.mesh.traverse((o) => (o as InstancedMesh).isInstancedMesh && (o as InstancedMesh).geometry.dispose());
      this.mesh = null;
    }
    this.blocks = b?.boxes.length ?? 0;
    if (!b || !b.boxes.length) return;
    this.mesh = buildVoxelMesh(b, { quality: graphicsNow.plainBlocks ? 'low' : 'medium', name: this.object.name, castShadow: this.shadows });
    if (!this.shadows) {
      this.object.add(this.mesh);
      return;
    }
    markStill(this.mesh);
    this.ask = true;
    const askShadow = (renderer: WebGLRenderer) => {
      if (!this.ask) return;
      this.ask = false;
      if (graphicsNow.stillShadows) renderer.shadowMap.needsUpdate = true;
    };
    for (const o of this.mesh.children) (o as InstancedMesh).onBeforeRender = askShadow;
    this.object.add(this.mesh);
  }
}
