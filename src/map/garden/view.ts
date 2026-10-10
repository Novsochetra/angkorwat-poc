import { Euler, Group, Quaternion, type Camera } from 'three';
import { VoxelBuilder, type VoxelBox } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh, disposeVoxelMesh } from '../../voxel/VoxelMesh';
import type { HeightField } from '../heightfield';
import { KINDS } from './kinds';
import { plantBlocks } from './look';
import './models';
import { lookKey, lookOf, soilOf, type Plant, type SoilLook } from './state';

/**
 * The garden on the map (roam/_garden.ts adds `object` to roaming's scene and
 * calls `sync` each frame): every plant's model (garden/look.ts) set on the land
 * at its place and turn, over its dug bed (a crop) or its watering ring (a tree),
 * the earth darker while wet.
 *
 * FIRST VERSION (the core's): one mesh for everything, rebuilt whenever a look
 * changes. The view's owner replaces it (cached looks, few draws, the far view,
 * the leaves' sway): see the `GardenView` contract below, which stays.
 */
export interface GardenView {
  readonly object: Group;
  /** The plants now (each frame; cheap when nothing changed). */
  sync(plants: readonly Plant[]): void;
  /** Every frame: what is far is hidden, the leaves sway (the camera, seconds). */
  frame(camera: Camera, t: number): void;
  dispose(): void;
}

const SOIL: Record<SoilLook, number> = { 0: 0x8c6c4a, 1: 0x6f5338, 2: 0x523c28 };

const _q = new Quaternion();
const _q2 = new Quaternion();
const _e = new Euler();

/** A box of a plant's own (local) put on the map: turned by `yaw` about y and moved to (x, y, z). */
function place(out: VoxelBuilder, b: VoxelBox, x: number, y: number, z: number, yaw: number): void {
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  _q.setFromEuler(_e.set(0, yaw, 0));
  _q2.setFromEuler(_e.set(b.rx ?? 0, b.ry ?? 0, b.rz ?? 0));
  _q.multiply(_q2);
  _e.setFromQuaternion(_q);
  out.boxes.push({ ...b, x: x + b.x * c + b.z * s, y: y + b.y, z: z - b.x * s + b.z * c, rx: _e.x, ry: _e.y, rz: _e.z });
}

export function createGardenView(field: HeightField): GardenView {
  const object = new Group();
  object.name = 'garden';
  let mesh: Group | null = null;
  let key = '';
  const cache = new Map<string, VoxelBox[]>();

  function rebuild(plants: readonly Plant[]): void {
    const b = new VoxelBuilder();
    for (const p of plants) {
      const look = lookOf(p);
      const k = lookKey(look);
      let boxes = cache.get(k);
      if (!boxes) {
        boxes = plantBlocks(look).boxes;
        cache.set(k, boxes);
      }
      const y = field.heightAt(p.x, p.z);
      const kind = KINDS[p.kind];
      const soil = SOIL[soilOf(p)];
      if (kind.size === 'crop') b.box(p.x, y + 0.04, p.z, kind.room * 1.3, 0.16, kind.room * 1.3, soil, 'mapRock');
      else b.box(p.x, y + 0.03, p.z, 1.1, 0.12, 1.1, soil, 'mapRock');
      for (const box of boxes) place(b, box, p.x, y + 0.08, p.z, p.yaw);
    }
    if (mesh) {
      object.remove(mesh);
      disposeVoxelMesh(mesh);
    }
    mesh = b.boxes.length ? buildVoxelMesh(b, { castShadow: true, receiveShadow: true, name: 'garden' }) : null;
    if (mesh) object.add(mesh);
  }

  return {
    object,
    sync(plants) {
      let k = '';
      for (const p of plants) k += `${p.id}:${lookKey(lookOf(p))}:${soilOf(p)};`;
      if (k === key) return;
      key = k;
      rebuild(plants);
    },
    frame() {},
    dispose() {
      if (mesh) disposeVoxelMesh(mesh);
      mesh = null;
    },
  };
}
