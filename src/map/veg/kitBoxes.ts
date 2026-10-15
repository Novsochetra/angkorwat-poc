import { Euler, Quaternion } from 'three';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';

/**
 * The plant kit's shapes (veg/plantKit.ts, veg/produce.ts) as plain boxes for
 * the instanced things that are not voxel builders: the people's things
 * (people/_kitRig.ts) and a festival's kit (festival/_kit.ts). `draw` lays the
 * shapes into a builder; each block comes back with its turn as YXZ Euler
 * angles (yaw about y, then pitch about x, then roll about z: how both pose a
 * box) and its shade folded into its colour.
 */
export interface KitBox {
  c: [number, number, number];
  s: [number, number, number];
  color: number;
  /** [pitch (x), yaw (y), roll (z)], YXZ; undefined when level and square to the axes. */
  rot?: [number, number, number];
}

const _q = new Quaternion();
const _e = new Euler();

export function kitBoxes(draw: (b: VoxelBuilder) => void): KitBox[] {
  const b = new VoxelBuilder();
  draw(b);
  return b.boxes.map((k) => {
    let rot: [number, number, number] | undefined;
    if (k.rx || k.ry || k.rz) {
      _q.setFromEuler(_e.set(k.rx ?? 0, k.ry ?? 0, k.rz ?? 0, 'XYZ'));
      _e.setFromQuaternion(_q, 'YXZ');
      rot = [_e.x, _e.y, _e.z];
    }
    return { c: [k.x, k.y, k.z], s: [k.sx, k.sy, k.sz], color: k.shade !== 1 ? shade(k.color, k.shade) : k.color, rot };
  });
}

/** A colour times `k` (each channel, clamped). */
function shade(hex: number, k: number): number {
  const c = (s: number) => Math.max(0, Math.min(255, Math.round(((hex >> s) & 255) * k)));
  return (c(16) << 16) | (c(8) << 8) | c(0);
}
