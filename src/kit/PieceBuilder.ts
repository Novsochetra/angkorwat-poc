import { VoxelBuilder } from '../voxel/VoxelBuilder';
import type { KitCollider, KitPiece } from './types';
import type { Object3D } from 'three';

/**
 * Collects one kit piece: its voxels (metres, piece space), its collision boxes
 * and any non-voxel extras. `done()` hands back the {@link KitPiece}.
 */
export class PieceBuilder {
  readonly voxels = new VoxelBuilder();
  readonly colliders: KitCollider[] = [];
  readonly extras: Object3D[] = [];

  /** Collision box from min/max corners (metres). */
  collider(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, noStand = false): this {
    this.colliders.push({
      min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)],
      max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)],
      ...(noStand ? { noStand } : {}),
    });
    return this;
  }

  /** One collider around everything built so far, shrunk by `inset` on the sides. */
  boundsCollider(inset = 0): this {
    const { min, max } = this.voxels.bounds();
    if (!Number.isFinite(min[0])) return this;
    return this.collider(min[0] + inset, min[1], min[2] + inset, max[0] - inset, max[1], max[2] - inset);
  }

  done(): KitPiece {
    return { voxels: this.voxels, colliders: this.colliders, extras: this.extras.length ? this.extras : undefined };
  }
}
