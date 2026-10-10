import { Group, type Object3D } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';

/**
 * The shoulder pole on the map when he does not carry it (roam/_carryPole.ts): his
 * bamboo pole (ដងរែក) with its two galvanized buckets hung on rope from its ends.
 *
 * - `lean`: at its place by his house, the pole leaning up against the front stilt,
 *   the two buckets standing empty at its foot, their ropes still looped over it;
 * - `down`: where he set it down: the buckets standing before and behind where he
 *   stood, the pole lying across their handles, the water in them as he left it
 *   (`setWater`: each bucket's level).
 *
 * Built once (map families: the bamboo `mapBark`, the tin `mapStone`, rope and water
 * `petal`), at the size of the pole and buckets on him (so taking it up or setting it
 * down shows the same things). Each a group in its own frame: origin on the ground at
 * the pole's foot (`lean`, +z toward the stilt) or where he stood (`down`, +z the way
 * he faced: the pole lies by his right side across its buckets' bails, as the set-down
 * pose leaves it: character/gardenWork.ts `YOKE_REST`).
 */

/** Drawn at the size the props on him are (roam/_carryPoleProps.ts: `YOKE` in his body units at his map size). */
export const POLE_SCALE = 1;
/** Sizes on the map (m: the props' `YOKE` × 0.0735 m a body unit): the pole's length, a bucket's height and radius. */
const POLE_LEN = 1.69;
const BUCKET_H = 0.31;
const BUCKET_R = 0.158;
const BAMBOO = [0xc8b27a, 0xbba36c, 0xd4bf88];
const NODE = 0xa8946a;
const TIN = [0xaab0b3, 0xa0a7ab, 0xb6bbbe];
const TIN_DARK = 0x80888d;
const ROPE = 0x8a6a44;
const WATER = 0x6f97a3;

type Box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c: number, mat: 'mapBark' | 'mapStone' | 'petal', rx?: number, ry?: number, rz?: number) => void;

function writer(b: VoxelBuilder): Box {
  const src = traceSource();
  return (x, y, z, sx, sy, sz, c, mat, rx = 0, ry = 0, rz = 0) => b.box(x, y, z, sx, sy, sz, c, mat, { src, rx, ry, rz });
}

/** A bamboo rod from a to b (true m), its nodes every 0.4 m. */
function rod(box: Box, ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number): void {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  const h = Math.hypot(dx, dz);
  const ry = h < 1e-5 ? 0 : Math.atan2(dx, dz);
  const rx = -Math.atan2(dy, h);
  box((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, w, w, len, BAMBOO[0], 'mapBark', rx, ry);
  for (let s = 0.2; s < len - 0.1; s += 0.4) {
    const u = s / len;
    box(ax + dx * u, ay + dy * u, az + dz * u, w * 1.25, w * 1.25, 0.03, NODE, 'mapBark', rx, ry);
  }
}

/** A galvanized bucket standing at (x, z) on the ground (y 0): its round body, the rim, a seam, the handle across. */
function bucket(box: Box, x: number, z: number, handle: number): void {
  const H = BUCKET_H;
  const R = BUCKET_R;
  box(x, H / 2, z, R * 2, H, R * 1.45, TIN[0], 'mapStone');
  box(x, H / 2, z, R * 1.45, H, R * 2, TIN[1], 'mapStone', 0, 0, 0);
  box(x, H / 2, z, R * 1.75, H, R * 1.75, TIN[2], 'mapStone', 0, Math.PI / 4);
  box(x, H - 0.012, z, R * 2.06, 0.025, R * 2.06, TIN_DARK, 'mapStone');
  box(x, 0.02, z, R * 2.02, 0.03, R * 2.02, TIN_DARK, 'mapStone');
  // (the wire handle, up over it)
  box(x, H + 0.11, z, 0.018, 0.018, R * 2.05, 0x6a7076, 'mapStone', 0, handle);
  for (const e of [-1, 1]) box(x + Math.sin(handle) * e * R, H + 0.055, z + Math.cos(handle) * e * R, 0.018, 0.12, 0.018, 0x6a7076, 'mapStone');
}

/** The pole leaning on the stilt (+z), its two buckets empty at its foot, their ropes over it. */
export function leanModel(): Group {
  const b = new VoxelBuilder();
  const box = writer(b);
  // (its foot on the ground, its top against the stilt's side, nearly upright)
  const top = { y: POLE_LEN * 0.94, z: 0.48 };
  rod(box, 0, 0.02, -0.06, 0, top.y, top.z, 0.05);
  // The buckets at its foot, either side; ropes from their handles up to a node low on the pole.
  for (const e of [-1, 1]) {
    const x = e * 0.27;
    const z = -0.22;
    bucket(box, x, z, Math.PI / 2);
    const hx = x;
    const hy = BUCKET_H + 0.12;
    const px = e * 0.03;
    const py = 0.62;
    const pz = 0.12;
    const len = Math.hypot(px - hx, py - hy, pz - z);
    const h = Math.hypot(px - hx, pz - z);
    box((hx + px) / 2, (hy + py) / 2, (z + pz) / 2, 0.014, 0.014, len, ROPE, 'petal', -Math.atan2(py - hy, h), Math.atan2(px - hx, pz - z));
  }
  return toGroup(b, 'roam:carryPole:lean');
}

export interface DownModel {
  readonly object: Group;
  /** Each bucket's water (0 empty ‥ 1 full): the level shown in it. */
  setWater(front: number, back: number): void;
}

/** The pole set down where he stood: the buckets before and behind, the pole across their handles at his right. */
export function downModel(): DownModel {
  const b = new VoxelBuilder();
  const box = writer(b);
  const x = -0.47;
  const zs = [0.77, -0.77];
  for (const z of zs) bucket(box, x, z, 0);
  rod(box, x, BUCKET_H + 0.13, -POLE_LEN / 2, x, BUCKET_H + 0.13, POLE_LEN / 2, 0.066);
  for (const z of zs) box(x, BUCKET_H + 0.12, z, 0.03, 0.06, 0.03, ROPE, 'petal');
  const object = toGroup(b, 'roam:carryPole:down');
  // The water in each: a unit box raised from the bucket's floor, scaled to its level.
  const levels: Object3D[] = [];
  for (const z of zs) {
    const wb = new VoxelBuilder();
    wb.box(0, 0.5, 0, BUCKET_R * 1.7, 1, BUCKET_R * 1.7, WATER, 'petal', { src: traceSource() });
    const g = buildVoxelMesh(wb, { quality: 'medium', name: 'roam:carryPole:water' });
    const holder = new Group();
    holder.position.set(x, 0.03, z);
    holder.add(g);
    noWalk(holder);
    object.add(holder);
    levels.push(holder);
  }
  return {
    object,
    setWater(front, back) {
      [front, back].forEach((v, i) => {
        const l = levels[i];
        const k = Math.max(0, Math.min(1, v));
        l.visible = k > 0.02;
        l.scale.set(1, Math.max(0.001, k * (BUCKET_H - 0.06)), 1);
      });
    },
  };
}

function noWalk(o: Object3D): void {
  o.traverse((c) => {
    c.castShadow = true;
    c.receiveShadow = true;
    c.userData.noWalk = true;
  });
}

function toGroup(b: VoxelBuilder, name: string): Group {
  const mesh = buildVoxelMesh(b, { quality: 'medium', name });
  const g = new Group();
  g.name = name;
  g.add(mesh);
  g.scale.setScalar(POLE_SCALE);
  noWalk(g);
  return g;
}
