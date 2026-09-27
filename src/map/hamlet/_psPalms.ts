import { Euler, Quaternion, Vector3 } from 'three';
import { traceSource, type SourceTrace } from '../../feedback/sourceTrace';
import type { VoxelMaterialKey } from '../../voxel/materials';
import { hash3 } from '../../voxel/random';
import type { VoxelBox, VoxelBuilder } from '../../voxel/VoxelBuilder';
import { sugarPalmTrunkRadius } from '../veg/palms';
import { POLE_OUT, RUNG, WORK_DROP, type PsPalm } from './_psPlan';

/**
 * A tapped sugar palm's bamboo ladder, the way Khmer tappers rig a palm: one
 * long bamboo pole stood against the trunk from the ground to the crown (its
 * foot out round the palm's swollen base, then along the trunk), lashed to
 * it with cord about every metre, the stubs of its side branches left on
 * alternately left and right for the feet; a short crossbar lashed across
 * it under the crown to stand on while working. The palm itself, its flower
 * stalks and the juice tubes hanging on the ladder's side are veg/palms.ts's
 * (planted `tapped`, `ladder` its side). The ladder bends with the palm in
 * the wind (`_psBend.ts`). And two helpers for turned boxes (`stick`, `slab`).
 */

type Rgb = number;
const pick = (list: readonly Rgb[], r: number): Rgb => list[Math.min(list.length - 1, Math.floor(r * list.length))];

/** Old bamboo, weathered grey-gold; the rattan and cord lashings. */
const BAMBOO: readonly Rgb[] = [0xc8b07a, 0xbaa06c, 0xd4bc86, 0xb09664];
const CORD: readonly Rgb[] = [0x4e3a28, 0x5a4430, 0x44321f];

const _q = new Quaternion();
const _q2 = new Quaternion();
const _e = new Euler();
const _a = new Vector3();
const _b = new Vector3();
const UP = new Vector3(0, 1, 0);

/** A box from point A to point B (its long side along A→B), `t` thick. */
export function stick(b: VoxelBuilder, ax: number, ay: number, az: number, bx: number, by: number, bz: number, t: number, color: Rgb, mat: VoxelMaterialKey, src: SourceTrace | undefined, shade = 1): void {
  _a.set(bx - ax, by - ay, bz - az);
  const len = _a.length();
  if (len < 1e-4) return;
  _q.setFromUnitVectors(UP, _a.multiplyScalar(1 / len));
  _e.setFromQuaternion(_q, 'XYZ');
  b.box((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, t, len, t, color, mat, { src, shade, rx: _e.x, ry: _e.y, rz: _e.z });
}

/** A flat box (a frond, a fan) at a point, facing out along `az` (radians from +z toward +x), tipped out by `tilt` (0 upright). */
export function slab(b: VoxelBuilder, x: number, y: number, z: number, w: number, h: number, t: number, az: number, tilt: number, color: Rgb, mat: VoxelMaterialKey, src: SourceTrace | undefined, shade = 1): void {
  _q.setFromAxisAngle(UP, az).multiply(_q2.setFromAxisAngle(_b.set(1, 0, 0), tilt));
  _e.setFromQuaternion(_q, 'XYZ');
  b.box(x, y, z, w, h, t, color, mat, { src, shade, rx: _e.x, ry: _e.y, rz: _e.z });
}

/** Where the pole leans in from round the palm's swollen foot to the bark (m over the foot). */
const LEAN = 1.0;

/** The pole's middle out from the trunk's axis (m, along the ladder's side) at `s` m over the foot: round the swollen base low down, then on the bark. */
export function poleOut(p: PsPalm, s: number): number {
  if (s < LEAN) {
    const r0 = sugarPalmTrunkRadius(p.h, 0) + POLE_OUT;
    const r1 = sugarPalmTrunkRadius(p.h, LEAN) + POLE_OUT;
    return r0 + ((r1 - r0) * Math.max(0, s)) / LEAN;
  }
  return sugarPalmTrunkRadius(p.h, Math.min(s, p.crown - p.y - 0.01)) + POLE_OUT;
}

/**
 * Build the ladder of a tapped palm (`p.lx`, `p.lz`: its side) on the end of
 * `b` (the caller records the range: those blocks bend with this palm; the
 * small ones go into `small`, drawn only near): the
 * pole from a little into the ground to above the crown's base (the cut top
 * pale), its foot leaning in from round the swelling; stubs every `RUNG` m
 * alternately left and right; lashings round trunk and pole; the crossbar.
 */
export function psLadder(b: VoxelBuilder, p: PsPalm, small: Set<VoxelBox>): void {
  const src = traceSource();
  // (the stubs, lashings and crossbar are small things: drawn only near)
  const mark = () => small.add(b.boxes[b.boxes.length - 1]);
  const r = (q: number) => hash3(p.seed, q, 11, 9141);
  const top = p.crown - p.y;
  const tx = -p.lz;
  const tz = p.lx;
  const yaw = Math.atan2(p.lx, p.lz);
  const at = (s: number, out = 0): [number, number] => {
    const d = poleOut(p, s) + out;
    return [p.x + p.lx * d, p.z + p.lz * d];
  };
  // The foot, leaning in from round the swelling.
  const [fx0, fz0] = at(-0.15);
  const [fx1, fz1] = at(LEAN);
  stick(b, fx0, p.y - 0.15, fz0, fx1, p.y + LEAN + 0.02, fz1, 0.11, pick(BAMBOO, r(1)), 'mapBark', src, 0.92);
  // The pole up the trunk, in pieces of their own tone (two culms joined).
  const end = top + 0.8;
  for (let s = LEAN, i = 0; s < end - 0.01; i++) {
    const e = Math.min(end, s + 1.5 + r(i) * 1.1);
    const [x, z] = at((s + e) / 2);
    b.box(x, p.y + (s + e) / 2, z, 0.11, e - s + 0.01, 0.11, pick(BAMBOO, r(20 + i)), 'mapBark', { src, shade: 0.94 + 0.1 * r(40 + i), ry: yaw });
    s = e;
  }
  const [cx, cz] = at(end);
  b.box(cx, p.y + end + 0.02, cz, 0.11, 0.04, 0.11, 0xe0d2a4, 'mapBark', { src, ry: yaw });
  // Stubs: footholds out to one side then the other, tipped a little up.
  for (let k = 0, s = RUNG * 0.8; s < top - 0.3; k++, s += RUNG) {
    const side = k % 2 ? 1 : -1;
    const [x, z] = at(s, 0.01);
    const len = 0.26 + 0.06 * r(200 + k);
    b.box(x + tx * side * (0.05 + len / 2), p.y + s, z + tz * side * (0.05 + len / 2), len, 0.055, 0.06, pick(BAMBOO, r(220 + k)), 'mapBark', { src, shade: 0.9, ry: yaw + Math.PI / 2, rz: side * 0.3 });
    mark();
  }
  // Lashings: a band of cord round trunk and pole about every metre (a little proud of the bark all round).
  for (let k = 0, s = 1.2; s < top + 0.5; k++, s += 1.0 + 0.3 * r(300 + k)) {
    const w = 2 * (sugarPalmTrunkRadius(p.h, Math.min(s, top - 0.01)) * 1.12 + 0.03);
    const c = pick(CORD, r(320 + k));
    b.box(p.x, p.y + s, p.z, w, 0.07, w, c, 'mapBark', { src, ry: yaw });
    mark();
    const [x, z] = at(s);
    b.box(x, p.y + s, z, 0.16, 0.08, 0.16, c, 'mapBark', { src, ry: yaw });
    mark();
  }
  // The crossbar to stand on while working, lashed across the pole.
  const bar = top - WORK_DROP;
  const [bx, bz] = at(bar, 0.03);
  b.box(bx, p.y + bar - 0.04, bz, 1.0, 0.075, 0.085, pick(BAMBOO, r(400)), 'mapBark', { src, ry: yaw + Math.PI / 2 });
  mark();
  b.box(bx, p.y + bar - 0.04, bz, 0.17, 0.11, 0.17, pick(CORD, r(401)), 'mapBark', { src, ry: yaw });
  mark();
}
