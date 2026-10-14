import { Group, Sphere, type InstancedMesh, type Object3D, type Vector3, type WebGLRenderer } from 'three';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { graphicsNow, markStill } from '../graphics';

/**
 * A gathering source's own blocks (roam/_gatherLogs.ts the felled trunks, _gatherThatch.ts the young sugar palms,
 * _gatherClay.ts the clay banks): one small voxel mesh in the roaming group, made again when what the spots have left
 * changes (`set`). As the map's own blocks: plain on the low level, casting the still shadows of low and medium (asked
 * again from the first drawing after a change). In the families the map draws already: no new shader. Small things:
 * not drawn at all past `FAR` m from the camera (`GatherLayer.frame`; flat ones nearer: the overview draws none of them).
 */
const FAR = 220;
const LAYERS: GatherLayer[] = [];

export class GatherLayer {
  readonly object = new Group();
  private mesh: Group | null = null;
  private ask = false;
  private readonly sphere = new Sphere();
  /** Blocks drawn now (checks). */
  blocks = 0;

  /** `shadows`: it casts (flat things on the ground do not); `far`: drawn within this of the camera (m). */
  constructor(
    parent: Object3D,
    name: string,
    private readonly shadows = true,
    private readonly far = FAR,
  ) {
    this.object.name = name;
    parent.add(this.object);
    LAYERS.push(this);
  }

  /** Each frame (the gathering add-on's): each layer drawn only within its reach of the camera. */
  static frame(eye: Vector3): void {
    for (const l of LAYERS) {
      if (!l.mesh) continue;
      const near = l.sphere.distanceToPoint(eye) < l.far;
      if (near === l.object.visible) continue;
      l.object.visible = near;
      // (back in view: its still shadow drawn again, it cast none while away)
      if (near && l.shadows) l.ask = true;
    }
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
    this.sphere.makeEmpty();
    for (const o of this.mesh.children) {
      // (built for the level it is made on, made again often: graphics.ts `setGraphics` leaves it be, no far rim variant)
      delete o.userData.voxelShape;
      const s = (o as InstancedMesh).boundingSphere;
      if (s) this.sphere.union(s);
    }
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
