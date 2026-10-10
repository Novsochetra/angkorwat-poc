import { Euler, Quaternion, Vector3 } from 'three';
import { traceSource, type SourceTrace } from '../../../feedback/sourceTrace';
import type { VoxelBuilder } from '../../../voxel/VoxelBuilder';
import { hash3 } from '../../../voxel/random';
import type { PlantLook } from '../state';

/**
 * Shared pieces of the garden's big fruit trees (mango, jackfruit, durian:
 * garden/models/{mango,jackfruit,durian}.ts; the contract garden/look.ts): seeded
 * randomness, turned boxes (limbs, single leaves), the seedling's planting (root
 * ball, the torn nursery bag, the bamboo stake), drooping and dead colours.
 * The crowns are garden/models/_treeCrown.ts.
 */

export type Rand = () => number;

/** A seeded stream for one look (the same plant draws the same every time): `salt` keeps parts apart. */
export function rng(look: PlantLook, salt: number): Rand {
  const s = Math.round(look.seed * 997);
  let n = 0;
  return () => hash3(n++, s, salt, 811);
}

/** Two sRGB colours mixed (t 0 → a, 1 → b). */
export function mix(a: number, b: number, t: number): number {
  const u = 1 - t;
  const r = Math.round(((a >> 16) & 255) * u + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * u + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * u + (b & 255) * t);
  return (r << 16) | (g << 8) | bl;
}

/** One of a few tones by a random value. */
export const tone = (list: readonly number[], r: number): number => list[Math.min(list.length - 1, Math.floor(r * list.length))];

/** Pale and yellowing (droop 1), limp yellow-brown (droop 2): a leaf's colour for want of water. */
export function thirstyLeaf(c: number, droop: 0 | 1 | 2, r = 0.5): number {
  if (droop === 0) return c;
  if (droop === 1) return mix(c, 0x8e9a4e, 0.32 + r * 0.14);
  return mix(c, r < 0.4 ? 0x7a5c34 : 0x928248, 0.55 + r * 0.15);
}

/** Dry dead leaves (brown, a few curled grey-brown) and the dead wood's grey. */
export const DEAD_LEAF = [0x8a6a42, 0x7a5c3a, 0x9a7a4c, 0x6e5436] as const;
export const DEAD_WOOD = [0x948c80, 0x868076, 0x9e968a] as const;

/** A bamboo stake's culm and its tie (banana fibre). */
const STAKE = 0xc4ac6a;
const STAKE_NODE = 0xa08a52;
const TIE = 0x9a8456;

const _q = new Quaternion();
const _q2 = new Quaternion();
const _e = new Euler();
const _v = new Vector3();
const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);

/**
 * A box turned: `yaw` about y, then `pitch` (its +z end up, radians; negative hangs it down), then `roll` about
 * its own length (z). The box's centre is at (x, y, z).
 */
export function turned(b: VoxelBuilder, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number, pitch: number, roll: number, color: number, mat: 'mapLeaf' | 'mapBark' | 'petal' | 'mapStone' | 'mapRock', shade = 1, src?: SourceTrace): void {
  _q.setFromAxisAngle(Y, yaw);
  _q2.setFromAxisAngle(X, -pitch);
  _q.multiply(_q2);
  if (roll) {
    _q2.setFromAxisAngle(Z, roll);
    _q.multiply(_q2);
  }
  _e.setFromQuaternion(_q, 'XYZ');
  b.box(x, y, z, sx, sy, sz, color, mat, { shade, rx: _e.x, ry: _e.y, rz: _e.z, src: src ?? traceSource() });
}

/** Where a blade of `len` from (x, y, z) at (yaw, pitch) ends. */
export function tipOf(x: number, y: number, z: number, yaw: number, pitch: number, len: number): [number, number, number] {
  const c = Math.cos(pitch) * len;
  return [x + Math.sin(yaw) * c, y + Math.sin(pitch) * len, z + Math.cos(yaw) * c];
}

/**
 * A single leaf (a thin blade) from its stalk's end at (x, y, z), pointing along (yaw, pitch); `under` gives it a
 * second colour on its underside (the durian's bronze), as a thin layer under it.
 */
export function blade(b: VoxelBuilder, x: number, y: number, z: number, yaw: number, pitch: number, len: number, wid: number, color: number, shade = 1, under?: number, src?: SourceTrace): void {
  const s = src ?? traceSource();
  const [cx, cy, cz] = tipOf(x, y, z, yaw, pitch, len / 2);
  if (under === undefined) {
    turned(b, cx, cy, cz, wid, 0.03, len, yaw, pitch, 0, color, 'mapLeaf', shade, s);
    return;
  }
  // (the two layers a hair apart along the blade's own up)
  const ny = Math.cos(pitch) * 0.011;
  const nh = -Math.sin(pitch) * 0.011;
  turned(b, cx + Math.sin(yaw) * nh, cy + ny, cz + Math.cos(yaw) * nh, wid, 0.018, len, yaw, pitch, 0, color, 'mapLeaf', shade, s);
  turned(b, cx - Math.sin(yaw) * nh, cy - ny, cz - Math.cos(yaw) * nh, wid * 0.94, 0.016, len * 0.96, yaw, pitch, 0, under, 'mapLeaf', shade * 0.95, s);
}

/**
 * A leaf that arches: its base half rising, its tip half bending down (two blades, end to end); `bend` how much
 * (radians between them).
 */
export function archedBlade(b: VoxelBuilder, x: number, y: number, z: number, yaw: number, pitch: number, len: number, wid: number, color: number, shade = 1, under?: number, bend = 0.6, src?: SourceTrace): void {
  const s = src ?? traceSource();
  const p0 = pitch + bend * 0.45;
  const p1 = pitch - bend * 0.55;
  const h = len * 0.52;
  blade(b, x, y, z, yaw, p0, h, wid * 0.92, color, shade, under, s);
  const [tx, ty, tz] = tipOf(x, y, z, yaw, p0, h * 0.94);
  blade(b, tx, ty, tz, yaw, p1, h, wid, color, shade * 1.04, under, s);
}

/**
 * A limb or stem from a to b (m), `w0` thick at a tapering to `w1`, in `segs` turned boxes that overlap a little at
 * the joints (no gaps where it bends).
 */
export function limb(b: VoxelBuilder, ax: number, ay: number, az: number, bx: number, by: number, bz: number, w0: number, w1: number, colors: readonly number[], r: Rand, segs = 1, mat: 'mapBark' | 'mapLeaf' = 'mapBark', shade = 1): void {
  const src = traceSource();
  for (let s = 0; s < segs; s++) {
    const t0 = s / segs;
    const t1 = (s + 1) / segs;
    const x0 = ax + (bx - ax) * t0;
    const y0 = ay + (by - ay) * t0;
    const z0 = az + (bz - az) * t0;
    const x1 = ax + (bx - ax) * t1;
    const y1 = ay + (by - ay) * t1;
    const z1 = az + (bz - az) * t1;
    const w = w0 + (w1 - w0) * (t0 + t1) * 0.5;
    _v.set(x1 - x0, y1 - y0, z1 - z0);
    const len = _v.length();
    if (len < 1e-4) continue;
    _v.multiplyScalar(1 / len);
    _q.setFromUnitVectors(Y, _v);
    _e.setFromQuaternion(_q, 'XYZ');
    b.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, w, len + w * 0.55, w, tone(colors, r()), mat, { shade: shade * (0.94 + r() * 0.1), rx: _e.x, ry: _e.y, rz: _e.z, src });
  }
}

/**
 * The planting of a seedling (stage 0‥1): the root ball of dark nursery earth just set in the bed, the black
 * nursery bag it came in lying torn open beside it (stage 0 only), and a bamboo stake tied to the stem.
 */
export function planting(b: VoxelBuilder, r: Rand, o: { stage: number; stake: number; stem: number }): void {
  const src = traceSource();
  // Root ball: dark potting earth, a little proud of the basin's floor (the view's basin: inner radius ≈ 0.3 m).
  b.box(0, 0.02, 0, 0.22, 0.04, 0.2, 0x4a3a2c, 'mapRock', { src });
  b.box(0.01, 0.04, -0.01, 0.14, 0.03, 0.13, 0x40322a, 'mapRock', { src });
  if (o.stage === 0) {
    // The bag, slit and peeled off: a crumpled black sheet in the basin by the stem, a fold standing up, earth on it.
    const a = r() * Math.PI * 2;
    const d = 0.19;
    const bx = Math.cos(a) * d;
    const bz = Math.sin(a) * d;
    turned(b, bx, 0.02, bz, 0.17, 0.024, 0.12, Math.PI / 2 - a, 0.05, 0.08, 0x1c1c1e, 'mapStone', 1, src);
    turned(b, bx + Math.cos(a) * 0.06, 0.05, bz + Math.sin(a) * 0.06, 0.13, 0.05, 0.04, Math.PI / 2 - a, 0.5, 0.2, 0x2a2a2c, 'mapStone', 1, src);
    b.box(bx - Math.cos(a) * 0.03, 0.036, bz - Math.sin(a) * 0.03, 0.06, 0.016, 0.05, 0x4a3a2c, 'mapRock', { src });
  }
  if (o.stake > 0) {
    // The stake beside the stem, leaning in a hair; its nodes; the ties round both.
    const sx = 0.06;
    const sz = -0.035;
    turned(b, sx, o.stake / 2 - 0.03, sz, 0.024, o.stake + 0.06, 0.024, 0, 0, 0, STAKE, 'mapBark', 1, src);
    for (let y = 0.28; y < o.stake - 0.1; y += 0.3) b.box(sx, y, sz, 0.032, 0.02, 0.032, STAKE_NODE, 'mapBark', { src });
    for (const ty of [o.stake * 0.42, o.stake * 0.84]) b.box(sx * 0.5, ty, sz * 0.5, 0.11, 0.026, 0.06 + o.stem, TIE, 'mapBark', { src });
  }
}

/**
 * A spray of leaves from one point (a mango's rosette at a shoot's tip, a few leaves at a node): `n` blades
 * round it, spreading at `pitch` (up +), each its own length, turned by the seed; `droop` hangs them and pales
 * them; `hang` hangs them anyway (a new flush, limp and bronze).
 */
export function rosette(
  b: VoxelBuilder,
  r: Rand,
  x: number,
  y: number,
  z: number,
  o: { n: number; len: number; wid: number; pitch: number; colors: readonly number[]; droop: 0 | 1 | 2; a0?: number; under?: number; bend?: number },
): void {
  const src = traceSource();
  const a0 = o.a0 ?? r() * Math.PI * 2;
  for (let q = 0; q < o.n; q++) {
    const yaw = a0 + (q / o.n) * Math.PI * 2 + (r() - 0.5) * 0.7;
    const len = o.len * (0.78 + r() * 0.3) * (o.droop === 2 ? 0.86 : 1);
    let pitch = o.pitch + (r() - 0.5) * 0.35;
    if (o.droop === 1) pitch -= 0.55;
    else if (o.droop === 2) pitch -= 1.05;
    pitch = Math.max(-1.45, pitch);
    const col = thirstyLeaf(tone(o.colors, r()), o.droop, r());
    const wid = o.wid * (o.droop === 2 ? 0.75 : 1);
    const under = o.under === undefined ? undefined : thirstyLeaf(o.under, o.droop, 0.5);
    if (o.bend) archedBlade(b, x, y, z, yaw, pitch, len, wid, col, 0.95 + r() * 0.1, under, o.bend * (o.droop ? 1.4 : 1), src);
    else blade(b, x, y, z, yaw, pitch, len, wid, col, 0.95 + r() * 0.1, under, src);
  }
}

/**
 * Leaves one by one along a stem from a to b (alternate, turning round it like a real shoot's, `step` radians
 * from one to the next; or in two rows left and right of a twig heading `axis`, `spread` radians off it), each
 * on its short stalk, smaller toward the tip, spreading at `pitch`.
 */
export function leavesAlong(
  b: VoxelBuilder,
  r: Rand,
  a: readonly [number, number, number],
  e: readonly [number, number, number],
  o: { n: number; len: number; wid: number; pitch: number; colors: readonly number[]; droop: 0 | 1 | 2; step?: number; a0?: number; under?: number; bend?: number; tip?: number; axis?: number; spread?: number },
): void {
  const src = traceSource();
  const step = o.step ?? 2.4;
  let yaw = o.a0 ?? r() * Math.PI * 2;
  for (let q = 0; q < o.n; q++) {
    // (two rows along a twig: left and right of its heading `axis`, leaning forward)
    if (o.axis !== undefined) yaw = o.axis + (q % 2 ? 1 : -1) * (o.spread ?? 1);
    const t = o.n === 1 ? 1 : 0.15 + (0.85 * q) / (o.n - 1);
    const x = a[0] + (e[0] - a[0]) * t;
    const y = a[1] + (e[1] - a[1]) * t;
    const z = a[2] + (e[2] - a[2]) * t;
    const k = 1 - (1 - (o.tip ?? 0.6)) * t;
    const len = o.len * k * (0.88 + r() * 0.24) * (o.droop === 2 ? 0.86 : 1);
    let pitch = o.pitch + (r() - 0.5) * 0.3 - (o.droop === 1 ? 0.55 : o.droop === 2 ? 1.05 : 0);
    pitch = Math.max(-1.45, pitch);
    // (a short stalk: the blade starts a little out from the stem)
    const px = x + Math.sin(yaw) * 0.025;
    const pz = z + Math.cos(yaw) * 0.025;
    const col = thirstyLeaf(tone(o.colors, r()), o.droop, r());
    const wid = o.wid * k * (o.droop === 2 ? 0.75 : 1);
    const under = o.under === undefined ? undefined : thirstyLeaf(o.under, o.droop, 0.5);
    if (o.bend) archedBlade(b, px, y, pz, yaw, pitch, len, wid, col, 0.95 + r() * 0.1, under, o.bend * (o.droop ? 1.4 : 1), src);
    else blade(b, px, y, pz, yaw, pitch, len, wid, col, 0.95 + r() * 0.1, under, src);
    yaw += step + (r() - 0.5) * 0.3;
  }
}

/**
 * A young tree that died of thirst (only young ones die: garden/state.ts): a dry grey stick (stage 0‥2) or a
 * bare grey young tree (stage 3‥4), its last few leaves brown and hanging, more lying round its foot.
 * `h` its height, `w` the stem's width at the foot, `fork` where a young tree's limbs part (m).
 */
export function deadTree(b: VoxelBuilder, r: Rand, o: { stage: number; h: number; w: number; leafLen: number; leafWid: number; fork?: number }): void {
  const src = traceSource();
  const { stage, h, w } = o;
  if (stage <= 2) {
    // The stick, leaning a little, its top bent over; a twig or two.
    const lx = (r() - 0.5) * 0.06 * h;
    const lz = (r() - 0.5) * 0.06 * h;
    limb(b, 0, 0, 0, lx, h * 0.8, lz, w, w * 0.7, DEAD_WOOD, r, stage === 0 ? 1 : 2);
    const ta = r() * Math.PI * 2;
    const tx = lx + Math.cos(ta) * h * 0.08;
    const tz = lz + Math.sin(ta) * h * 0.08;
    limb(b, lx, h * 0.8, lz, tx, h * 0.97, tz, w * 0.7, w * 0.5, DEAD_WOOD, r, 1);
    const twigs = stage === 0 ? 0 : stage === 1 ? 1 : 3;
    const tips: [number, number, number][] = [[tx, h * 0.97, tz]];
    for (let q = 0; q < twigs; q++) {
      const a = r() * Math.PI * 2;
      const y = h * (0.45 + q * 0.14 + r() * 0.08);
      const k = y / (h * 0.8);
      const sx = lx * k;
      const sz = lz * k;
      const len = h * (0.16 + r() * 0.08);
      const ex = sx + Math.cos(a) * len;
      const ez = sz + Math.sin(a) * len;
      const ey = y + len * 0.5;
      limb(b, sx, y, sz, ex, ey, ez, w * 0.5, w * 0.3, DEAD_WOOD, r, 1);
      tips.push([ex, ey, ez]);
    }
    // Last leaves: shrivelled, hanging straight down from the tips.
    for (const [px, py, pz] of tips) {
      const n = 1 + Math.floor(r() * 2);
      for (let q = 0; q < n; q++) blade(b, px, py, pz, r() * Math.PI * 2, -1.25 - r() * 0.25, o.leafLen * (0.6 + r() * 0.2), o.leafWid * 0.6, tone(DEAD_LEAF, r()), 0.95, undefined, src);
    }
  } else {
    // A bare young tree: grey trunk, limbs parting at the fork, dry twigs.
    const fork = o.fork ?? h * 0.33;
    limb(b, 0, 0, 0, 0.03, fork, -0.02, w, w * 0.8, DEAD_WOOD, r, 2);
    const n = 3;
    const a0 = r() * Math.PI * 2;
    for (let q = 0; q < n; q++) {
      const a = a0 + (q / n) * Math.PI * 2 + (r() - 0.5) * 0.6;
      const ex = Math.cos(a) * h * 0.2;
      const ez = Math.sin(a) * h * 0.2;
      const ey = fork + h * (0.32 + r() * 0.12);
      limb(b, 0.03, fork, -0.02, ex, ey, ez, w * 0.6, w * 0.32, DEAD_WOOD, r, 2);
      for (let t = 0; t < 2; t++) {
        const ta = a + (t ? 0.7 : -0.7) + (r() - 0.5) * 0.4;
        const len = h * (0.1 + r() * 0.07);
        const fx = ex * (0.7 + t * 0.2);
        const fz = ez * (0.7 + t * 0.2);
        const fy = fork + (ey - fork) * (0.7 + t * 0.2);
        const gx = fx + Math.cos(ta) * len;
        const gz = fz + Math.sin(ta) * len;
        const gy = fy + len * 0.7;
        limb(b, fx, fy, fz, gx, gy, gz, w * 0.22, w * 0.14, DEAD_WOOD, r, 1);
        if (r() < 0.55) blade(b, gx, gy, gz, r() * Math.PI * 2, -1.3, o.leafLen * 0.7, o.leafWid * 0.6, tone(DEAD_LEAF, r()), 0.95, undefined, src);
      }
    }
  }
  // Fallen leaves round the foot, flat on the earth, curled at an edge.
  const fallen = stage === 0 ? 1 : stage <= 2 ? 3 : 6;
  for (let q = 0; q < fallen; q++) {
    const a = r() * Math.PI * 2;
    const d = 0.12 + r() * (stage <= 2 ? 0.35 : 1.1);
    turned(b, Math.cos(a) * d, 0.012, Math.sin(a) * d, o.leafWid * 0.7, 0.02, o.leafLen * 0.75, r() * Math.PI * 2, 0, (r() - 0.5) * 0.5, tone(DEAD_LEAF, r()), 'mapLeaf', 0.92, src);
  }
}
