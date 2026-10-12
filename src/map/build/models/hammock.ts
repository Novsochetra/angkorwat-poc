import { Euler, Quaternion, Vector3 } from 'three';
import { traceSource, type SourceTrace } from '../../../feedback/sourceTrace';
import type { VoxelMaterialKey } from '../../../voxel/materials';
import { hash3 } from '../../../voxel/random';
import { PIECES, registerPieceModel } from '../pieces';

/**
 * His hammock (អង្រឹង, build/pieces.ts `PIECES.hammock`) between two stout
 * wooden posts set in the ground, as the villages hang theirs under the houses
 * (hamlet/_evKit.ts `hammock`, hamlet/_psHome.ts, the Kulen hut).
 *
 * Put up as he does it: the two posts (round-ish: octagons of four boxes) and the
 * earth tamped round their feet, a peg through each over its tie, the rope
 * wound round each post at `PIECES.hammock.ties`, the ropes down to the cloth's
 * gathered ends, then the cloth hung between them: a striped cloth sagging
 * lowest in the middle (a parabola), narrow where it is gathered at the ends and
 * open in the middle, its two sides curled up a little. Last touches: maybe a
 * krama knotted round a post, a pair of flip-flops under it.
 *
 * The hammock add-on (roam/_hammock.ts, `addHammock` in roam/_hammockSpots.ts)
 * reads it off its `petal` blocks between the ties: the cloth (blocks wider than
 * 22 cm across, their middles on one parabola), the ropes (thin, on the middle
 * line) and the curled edges (thin, off it). So: the cloth, ropes and edges are
 * `petal`; the posts, the pegs and the earth are not; the knots, the krama and
 * the flip-flops are `petal` but outside what it reads (on the posts, beyond the
 * ties; on the ground).
 *
 * Seeded (`look.seed`): the cloth's stripes (the flag's blue, red and white;
 * green and yellow; teal and orange; purple and pink; red, gold and black), the rope's colour, the
 * posts' wood, the krama and the flip-flops.
 * About 70 blocks.
 */

/** The cloth's stripes (repeated along it), in Cambodian colours. */
const STRIPES: readonly (readonly number[])[] = [
  [0x2a4a9a, 0xc8302a, 0xf0ece0, 0xc8302a], // the flag's blue, red, white
  [0x3a8a4a, 0xe8c040, 0x3a8a4a, 0xf0ece0], // green and yellow
  [0x2f7a8c, 0xe8902a, 0x2f7a8c, 0xf0e6d0], // teal and orange
  [0x6a2a7a, 0xf0e6d0, 0xd84a7a, 0xf0e6d0], // purple, white and pink
  [0xc8302a, 0xe8c040, 0xc8302a, 0x2a2a2a], // red, gold and black
];
const ROPE = [0xd8d0c0, 0x3a6ab8, 0x3a8a5a, 0xd8c890] as const;
const WOOD = [
  [0x7a6048, 0x6e5640, 0x866a50],
  [0x8a7058, 0x7c644e, 0x947a60],
  [0x6e5a48, 0x645040, 0x786250],
] as const;
/** Krama checks: red and white, blue and white, green and white. */
const KRAMA: readonly (readonly [number, number])[] = [
  [0xb8322c, 0xf0ece0],
  [0x2c5a9a, 0xf0ece0],
  [0x3a7a4a, 0xf0ece0],
];
const SIDE = 0.4142;

/** The cloth: from −CLOTH to CLOTH (m, along x), its ends at `END` over the ground, its middle at `LOW`. */
const CLOTH = 1.22;
const END = 1.16;
const LOW = 0.74;
/** Its blocks along it. */
const SEGS = 12;

const _q = new Quaternion();
const _e = new Euler();
const _v = new Vector3();
const UP = new Vector3(0, 1, 0);

registerPieceModel('hammock', (b, look) => {
  const s = Math.round(look.seed * 997) | 0;
  let n = 0;
  const r = () => hash3(n++, s, 71, 457);
  const pick = <T>(list: readonly T[]) => list[Math.floor(r() * list.length) % list.length];
  let src: SourceTrace | undefined = traceSource();
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, mat: VoxelMaterialKey, shade = 1, ry = 0) =>
    b.box(x, y, z, sx, sy, sz, color, mat, { shade, src, ry: ry || undefined });
  const stick = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, t: number, color: number, mat: VoxelMaterialKey, shade = 1) => {
    _v.set(bx - ax, by - ay, bz - az);
    const len = _v.length();
    _q.setFromUnitVectors(UP, _v.multiplyScalar(1 / len));
    _e.setFromQuaternion(_q, 'XYZ');
    b.box((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, t, len, t, color, mat, { shade, rx: _e.x, ry: _e.y, rz: _e.z, src });
  };
  const oct = (x: number, z: number, w: number, y0: number, y1: number, color: number, mat: VoxelMaterialKey, shade = 1, a = 0) => {
    for (let k = 0; k < 4; k++) box(x, (y0 + y1) / 2, z, w, y1 - y0, w * SIDE, color, mat, shade * (k % 2 ? 1.03 : 0.98), a + (k * Math.PI) / 4);
  };

  const spec = PIECES.hammock;
  const [ta, tb] = spec.ties!;
  const wood = pick(WOOD);
  const rope = pick(ROPE);
  const stripes = pick(STRIPES);
  const postX = [spec.solids[0][0], spec.solids[1][0]];
  const postTop = spec.solids[0][4];

  // ── The posts, set in the ground (a little crooked, as cut), the earth tamped round their feet ──
  for (const px of postX) {
    const a = r() * 0.4;
    oct(px, 0, 0.2, -0.1, postTop - 0.04, wood[Math.floor(r() * 3) % 3], 'mapBark', 0.96 + r() * 0.08, a);
    box(px, postTop - 0.025, 0, 0.15, 0.05, 0.15, wood[2], 'mapBark', 1.06, a);
  }
  src = traceSource();
  for (const px of postX) {
    oct(px, 0, 0.3, -0.02, 0.06, 0x6a5440, 'mapRock', 0.92, r());
    box(px - Math.sign(px) * 0.08, 0.06, 0.04, 0.18, 0.04, 0.16, 0x7a6248, 'mapRock', 0.96, r());
  }
  // A peg through each post, over where the rope is wound (it keeps it from sliding down).
  src = traceSource();
  for (const [x, y] of [
    [postX[0], ta[1] + 0.13],
    [postX[1], tb[1] + 0.13],
  ])
    box(x, y, 0, 0.34, 0.04, 0.04, 0x8a6a48, 'mapBark', 1.04);

  // ── The ropes: wound round the posts at the ties, down to the cloth's gathered ends ──
  src = traceSource();
  for (const [x, y] of [
    [postX[0], ta[1]],
    [postX[1], tb[1]],
  ]) {
    box(x, y, 0, 0.24, 0.07, 0.24, rope, 'petal', 0.95);
    box(x, y - 0.05, 0, 0.23, 0.04, 0.23, rope, 'petal', 0.9, Math.PI / 4);
  }
  for (const [tx, ty, sx] of [
    [ta[0], ta[1], -1],
    [tb[0], tb[1], 1],
  ]) {
    const ex = sx * (CLOTH + 0.04);
    stick(tx, ty, 0, ex, END + 0.01, 0, 0.035, rope, 'petal');
    // (the whipping where the cloth is gathered into the rope's loop)
    box(sx * CLOTH, END, 0, 0.09, 0.07, 0.09, rope, 'petal', 0.92);
  }

  // ── The cloth: stripes from end to end, sagging, gathered narrow at the ends; its sides curl up ──
  src = traceSource();
  const yAt = (x: number) => LOW + (END - LOW) * (x / CLOTH) ** 2;
  const seg = (2 * CLOTH) / SEGS;
  for (let i = 0; i < SEGS; i++) {
    const u = (i + 0.5) / SEGS;
    const x = -CLOTH + seg * (i + 0.5);
    const slope = (2 * (END - LOW) * x) / (CLOTH * CLOTH);
    const tilt = Math.atan(slope);
    const len = seg / Math.cos(tilt) + 0.012;
    const w = 0.3 + 0.5 * Math.sin(Math.PI * u) ** 0.8;
    const c = stripes[i % stripes.length];
    const y = yAt(x);
    b.box(x, y, 0, len, 0.05, w, c, 'petal', { src, rz: tilt, shade: i % 2 ? 1 : 0.95 });
    // (the sides, curled up: a thin lip along each edge)
    for (const sz of [-1, 1]) b.box(x, y + 0.04, sz * (w / 2 - 0.015), len, 0.08, 0.035, c, 'petal', { src, rz: tilt, shade: 1.06 });
  }

  // ── Last touches: a krama knotted round a post, a pair of flip-flops under it ──
  src = traceSource();
  if (r() < 0.45) {
    const [k0, k1] = pick(KRAMA);
    const px = postX[r() < 0.5 ? 0 : 1];
    const ky = 1.0 + r() * 0.2;
    box(px, ky, 0, 0.25, 0.06, 0.25, k0, 'petal');
    box(px, ky - 0.055, 0, 0.25, 0.05, 0.25, k1, 'petal', 1.04);
    // (its two ends hang down the post's outer side)
    const ox = px + Math.sign(px) * 0.135;
    for (let q = 0; q < 3; q++) box(ox, ky - 0.13 - q * 0.1, 0.03 - q * 0.01, 0.03, 0.1, 0.2, q % 2 ? k1 : k0, 'petal', 1, 0.08);
  }
  if (r() < 0.6) {
    const sole = pick([0x2a2a2a, 0x2a5a9a, 0xb8322c, 0x3a3a3a] as const);
    const strap = pick([0x2a6ab8, 0xd8507a, 0xe0b030, 0x3a9a5a] as const);
    const fx = (r() - 0.5) * 0.6;
    const fz = 0.1 + r() * 0.08;
    const a = (r() - 0.5) * 0.8;
    for (const q of [-1, 1]) {
      const x = fx + Math.cos(a) * q * 0.08;
      const z = fz - Math.sin(a) * q * 0.08 + q * 0.03;
      box(x, 0.012, z, 0.11, 0.024, 0.28, sole, 'petal', 1, a + q * 0.08);
      box(x, 0.035, z - Math.cos(a) * 0.04, 0.1, 0.02, 0.03, strap, 'petal', 1.05, a + q * 0.08);
    }
  }
});
