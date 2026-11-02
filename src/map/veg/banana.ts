import { Euler, Quaternion, Vector3 } from 'three';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { bananaModel } from '../garden/models/banana';
import { plantsLite } from './detail';

/**
 * Every banana plant on the map (AWP-8): the home garden's own banana
 * (garden/models/banana.ts `bananaModel`: a pseudostem of leaf sheaths with
 * brown streaks, paddle leaves on short stalks torn into strips by the wind,
 * the rolled young leaf, a dry leaf hanging, pups at its foot, and on some a
 * bunch of green ណាំវ៉ា with the purple banana flower under it), set on the
 * land wherever the hamlets, the villages and the jungle camps plant one. One
 * code path: the garden's model draws them all (the home garden's plants are
 * the model as it was; nothing here changes them).
 *
 * Into a builder on the map's axes (the part's world builder, a `Local` or
 * `PsFrame` that only moves its origin): its foot at (x, y, z), turned `yaw`
 * about its upright axis. Blocks: grown (stage 4) ≈ 180–205, with a bunch
 * ≈ 240–265; young (stage 3) ≈ 145–155. On the low graphics level (phones)
 * the map's bananas are the model's `lite` form (24 blocks, 38 with a bunch):
 * the parts that plant them say the build's level first (veg/detail.ts
 * `plantDetail(ctx.quality)`: hamlet/index.ts, village/index.ts,
 * jungle/camps.ts). The home garden's bananas are never lite. Each block keeps
 * its own trace (dev builds: the model's line, then the caller that planted
 * it).
 */

export interface BananaOpts {
  /** Its own variety (0‥1): leaf headings, lengths, tones, the pups (the garden model's `seed`). */
  seed: number;
  /** Turned about its upright axis (radians; 0: the model's +z front, its bunch out to +x). */
  yaw?: number;
  /** 4 (default): grown, ≈ 4.2 m to its leaf tips; 3: young, ≈ 3 m. */
  stage?: 3 | 4;
  /** A bunch of green fingers and the flower (grown only). */
  bunch?: boolean;
}

const _q = new Quaternion();
const _q2 = new Quaternion();
const _e = new Euler();
const _up = new Vector3(0, 1, 0);

/** A banana plant, its foot at (x, y, z) (map metres). */
export function bananaPlant(b: VoxelBuilder, x: number, y: number, z: number, o: BananaOpts): void {
  const m = new VoxelBuilder();
  const stage = o.stage ?? 4;
  bananaModel(m, { kind: 'banana', stage, fruit: stage === 4 && o.bunch ? 1 : 0, fallen: 0, droop: 0, dead: false, cut: false, seed: o.seed }, plantsLite());
  const yaw = o.yaw ?? 0;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  _q.setFromAxisAngle(_up, yaw);
  for (const k of m.boxes) {
    const lx = k.x;
    const lz = k.z;
    k.x = x + lx * c + lz * s;
    k.y += y;
    k.z = z - lx * s + lz * c;
    if (!yaw) continue;
    if (k.rx || k.rz) {
      // (the plant's turn, then the block's own)
      _q2.setFromEuler(_e.set(k.rx ?? 0, k.ry ?? 0, k.rz ?? 0, 'XYZ')).premultiply(_q);
      _e.setFromQuaternion(_q2, 'XYZ');
      k.rx = _e.x || undefined;
      k.ry = _e.y || undefined;
      k.rz = _e.z || undefined;
    } else k.ry = (k.ry ?? 0) + yaw;
  }
  b.append(m);
}
