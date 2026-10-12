import { Euler, Quaternion, Vector3 } from 'three';
import { traceSource, type SourceTrace } from '../../../feedback/sourceTrace';
import type { VoxelMaterialKey } from '../../../voxel/materials';
import { hash3 } from '../../../voxel/random';
import { PIECES, registerPieceModel } from '../pieces';

/**
 * His spirit house (ខ្ទមព្រះភូមិ, build/pieces.ts `PIECES.spirit`): the Khmer
 * one, as every village of the map has (village/_kit.ts `spiritHouse`,
 * hamlet/_bhYard.ts): a tiny Angkor tower (prasat) on a whitewashed post,
 * never the Thai san phra phum's gables with horns or a spire of rings.
 *
 * Put up as a builder does: the stepped footing and the post, the struts and the
 * tray (red lacquer, a gold rim); then the shrine on it, its front (+z) open: the
 * redented plinth (the square plan stepped in at the corners), the sanctum (its
 * doorway in a gold frame, false doors on the other sides), the cornice, the
 * tower of four tiers drawing in with leaf antefixes at their corners, the lotus
 * bud on top. Last the spirit (a little gilt figure seated in the doorway) and
 * the offerings on the tray before it: two bay sei, the pot of incense, the
 * candle (its flame at `PIECES.spirit.light`), a bottle of water, fruit on a
 * plate, a cup, and a marigold and jasmine garland along the tray's front.
 *
 * Seeded (`look.seed`): the paint (white and ochre as the village's, sandstone,
 * or pale yellow and saffron), the tray's red, the fruit (bananas, oranges or a coconut), the water
 * (a plastic bottle or a glass one), the garland's flowers, the incense.
 * About 130 blocks.
 */

/** The paints: post, walls, the second tone (alternate tiers, plinth), gilt. */
const PAINTS: readonly { post: number; wall: number; alt: number; gold: number; dark: number }[] = [
  // the village's: whitewash, ochre, gilt
  { post: 0xece4d2, wall: 0xece4d2, alt: 0xd8a85a, gold: 0xe0b040, dark: 0x3a2418 },
  // a sandstone tower (grey-tan, as the temples), a pale post
  { post: 0xe2dccc, wall: 0xc8b896, alt: 0xb4a07c, gold: 0xd8a83a, dark: 0x34261c },
  // pale yellow walls, saffron tiers (as many a Khmer home's)
  { post: 0xf0e8d4, wall: 0xf2e2a8, alt: 0xe0a040, gold: 0xe4b444, dark: 0x3a2014 },
];
/** Which paint (the village's twice as often). */
const PAINT_PICK = [0, 0, 1, 2] as const;
const TRAY_RED = [0xa8322a, 0x962a26, 0xb03a2c] as const;
const BAYSEI = [0x4e8a30, 0x5a9a38, 0x437a2a, 0x62a040] as const;
/** The tray's top (m over the ground): the candle stands on it (its flame at `light`). */
const T = 1.58;
/** The shrine's middle (z) on the tray: set back, the offerings before it. */
const C = -0.1;

/** The four corners (x, z signs). */
const CORNERS: readonly [number, number][] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

const _q = new Quaternion();
const _e = new Euler();
const _v = new Vector3();
const UP = new Vector3(0, 1, 0);

registerPieceModel('spirit', (b, look) => {
  const s = Math.round(look.seed * 997) | 0;
  let n = 0;
  const r = () => hash3(n++, s, 61, 409);
  const P = PAINTS[PAINT_PICK[Math.floor(r() * PAINT_PICK.length) % PAINT_PICK.length]];
  const red = TRAY_RED[Math.floor(r() * TRAY_RED.length) % TRAY_RED.length];
  let src: SourceTrace | undefined = traceSource();
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, mat: VoxelMaterialKey = 'mapStone', shade = 1) =>
    b.box(x, y, z, sx, sy, sz, color, mat, { shade, src });
  /** A redented square (the Angkorian plan: a cross of two boxes) round the shrine's middle, `w` across, y0‥y1. */
  const cross = (w: number, y0: number, y1: number, color: number, shade = 1) => {
    box(0, (y0 + y1) / 2, C, w, y1 - y0, w * 0.72, color, 'mapStone', shade);
    box(0, (y0 + y1) / 2, C, w * 0.72, y1 - y0, w, color, 'mapStone', shade);
  };
  /** A stick from a to b, `t` thick. */
  const stick = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, t: number, color: number, mat: VoxelMaterialKey, shade = 1) => {
    _v.set(bx - ax, by - ay, bz - az);
    const len = _v.length();
    _q.setFromUnitVectors(UP, _v.multiplyScalar(1 / len));
    _e.setFromQuaternion(_q, 'XYZ');
    b.box((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, t, len, t, color, mat, { shade, rx: _e.x, ry: _e.y, rz: _e.z, src });
  };

  // ── The footing and the post (set in the ground, whitewashed) ──
  box(0, 0.05, 0, 0.44, 0.1, 0.44, P.post, 'mapStone', 0.9);
  box(0, 0.14, 0, 0.32, 0.08, 0.32, P.post, 'mapStone', 0.95);
  box(0, 0.8, 0, 0.18, 1.24, 0.18, P.post);
  // (a gilt collar under the head, the head that takes the struts)
  box(0, 1.3, 0, 0.21, 0.05, 0.21, P.gold, 'mapStone', 1.04);
  box(0, 1.39, 0, 0.24, 0.12, 0.24, P.post, 'mapStone', 1.02);

  // ── The struts and the tray ──
  src = traceSource();
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ])
    stick(dx * 0.09, 1.16, dz * 0.09, dx * 0.34, 1.47, dz * 0.34 + 0.02, 0.05, P.post, 'mapStone', 0.94);
  box(0, 1.485, 0.02, 0.8, 0.05, 0.78, P.post, 'mapStone', 0.9);
  box(0, 1.535, 0.02, 0.92, 0.05, 0.9, P.gold, 'mapStone', 1.02);
  box(0, 1.56, 0.02, 0.86, 0.04, 0.84, red);

  // ── The shrine: plinth, the sanctum open to the front, its false doors ──
  src = traceSource();
  cross(0.5, T, T + 0.08, P.alt);
  cross(0.44, T + 0.08, T + 0.11, P.wall, 1.03);
  const y0 = T + 0.11;
  const y1 = T + 0.45;
  const lin = T + 0.38;
  // (the sanctum's body, the dark room seen through the doorway, the back's projection)
  box(0, (y0 + y1) / 2, C, 0.38, y1 - y0, 0.27, P.wall);
  box(0, (y0 + lin) / 2, C + 0.137, 0.13, lin - y0, 0.006, P.dark, 'mapStone', 0.7);
  box(0, (y0 + y1) / 2, C - 0.165, 0.27, y1 - y0, 0.06, P.wall, 'mapStone', 0.97);
  // (the doorway's gilt frame: its jambs and lintel stand out of the front, the projection of the cross)
  for (const sx of [-1, 1]) box(sx * 0.1, (y0 + y1) / 2, C + 0.168, 0.07, y1 - y0, 0.065, P.alt, 'mapStone', 1.02);
  box(0, (lin + y1) / 2, C + 0.168, 0.27, y1 - lin, 0.065, P.gold, 'mapStone', 1.04);
  box(0, y0 + 0.012, C + 0.17, 0.13, 0.024, 0.06, P.alt, 'mapStone', 0.95);
  // (false doors on the sides and the back)
  for (const sx of [-1, 1]) box(sx * 0.195, y0 + 0.13, C, 0.02, 0.22, 0.1, P.alt, 'mapStone', 0.96);
  box(0, y0 + 0.13, C - 0.197, 0.1, 0.22, 0.02, P.alt, 'mapStone', 0.96);

  // ── The cornice and the tower: tiers drawing in, leaf antefixes at their corners, the lotus bud ──
  src = traceSource();
  cross(0.47, y1, y1 + 0.045, P.gold, 1.04);
  let ty = y1 + 0.045;
  const tiers: readonly [w: number, h: number][] = [
    [0.37, 0.11],
    [0.3, 0.1],
    [0.235, 0.09],
    [0.175, 0.08],
  ];
  // (the corners of the cornice first: the big leaves)
  for (const [ax, az] of CORNERS) box(ax * 0.2, ty + 0.04, C + az * 0.2, 0.05, 0.08, 0.05, P.gold, 'mapStone', 1.06);
  tiers.forEach(([w, h], k) => {
    cross(w, ty, ty + h, k % 2 ? P.alt : P.wall, 1 + k * 0.03);
    if (k < 3) for (const [ax, az] of CORNERS) box(ax * w * 0.4, ty + h + 0.03, C + az * w * 0.4, 0.04, 0.06, 0.04, P.gold, 'mapStone', 1.05);
    // (a little gilt door on the front of each tier: the Angkor towers' storeys)
    box(0, ty + h * 0.48, C + w * 0.5 + 0.006, w * 0.26, h * 0.62, 0.014, P.gold, 'mapStone', 0.98);
    ty += h;
  });
  box(0, ty + 0.06, C, 0.12, 0.12, 0.12, P.gold, 'mapStone', 1.04);
  box(0, ty + 0.06, C, 0.09, 0.15, 0.09, P.gold, 'mapStone', 1.06);
  box(0, ty + 0.17, C, 0.065, 0.08, 0.065, P.gold, 'mapStone', 1.08);
  box(0, ty + 0.24, C, 0.025, 0.07, 0.025, P.gold, 'mapStone', 1.1);

  // ── The spirit in its doorway: a little gilt figure seated on a dais, its crown's spike ──
  src = traceSource();
  // (the dais, the crossed legs, the body, the head, the crown's spike)
  const fz = C + 0.17;
  box(0, y0 + 0.013, fz - 0.01, 0.1, 0.026, 0.06, P.alt, 'mapStone', 0.9);
  box(0, y0 + 0.04, fz, 0.08, 0.03, 0.05, P.gold, 'mapStone', 0.95);
  box(0, y0 + 0.085, fz - 0.006, 0.054, 0.062, 0.038, P.gold, 'mapStone', 1.02);
  box(0, y0 + 0.133, fz - 0.006, 0.036, 0.036, 0.034, P.gold, 'mapStone', 1.06);
  box(0, y0 + 0.162, fz - 0.006, 0.014, 0.026, 0.014, P.gold, 'mapStone', 1.1);

  // ── The offerings (the last touches) ──
  // Two bay sei (banana-leaf cones in tiers, an egg on the tip, flowers tucked in) at the tray's front corners.
  src = traceSource();
  for (const sx of [-1, 1]) {
    const x = sx * 0.3;
    const z = 0.3;
    for (let k = 0; k < 4; k++) {
      const w = 0.12 - k * 0.024;
      box(x, T + 0.028 + k * 0.054, z, w, 0.054, w, BAYSEI[k], 'mapLeaf', 1 + k * 0.04);
    }
    box(x, T + 0.24, z, 0.036, 0.044, 0.036, 0xf4f0e6, 'petal');
    box(x + 0.044, T + 0.08, z + 0.044, 0.026, 0.026, 0.026, 0xe8508a, 'petal');
    box(x - 0.04, T + 0.135, z + 0.036, 0.024, 0.024, 0.024, 0xf0c030, 'petal');
  }
  // The pot of incense (a little bowl of sand), its sticks fanned, their glowing tips.
  src = traceSource();
  const ix = -0.14;
  const iz = 0.3;
  box(ix, T + 0.03, iz, 0.1, 0.06, 0.1, r() < 0.5 ? 0x8a5a3a : 0xb08a3a, 'mapStone', 0.95);
  box(ix, T + 0.062, iz, 0.08, 0.01, 0.08, 0xd8cca8, 'mapRock');
  const sticks = 3 + Math.floor(r() * 3);
  for (let k = 0; k < sticks; k++) {
    const a = ((k - (sticks - 1) / 2) / sticks) * 0.6 + (r() - 0.5) * 0.12;
    const len = 0.17 + r() * 0.06;
    const tx = ix + Math.sin(a) * len * 0.35;
    const tz = iz + (r() - 0.5) * 0.04;
    stick(ix + (r() - 0.5) * 0.02, T + 0.066, iz + (tz - iz) * 0.3, tx, T + 0.066 + len, tz, 0.01, 0x7a3a2a, 'petal');
    box(tx, T + 0.07 + len, tz, 0.014, 0.014, 0.014, 0xe8602a, 'petal', 1.2);
  }
  // The candle on its saucer before the door (the flame at `light`).
  src = traceSource();
  const [lx, ly, lz] = PIECES.spirit.light!;
  box(lx, T + 0.008, lz, 0.08, 0.016, 0.08, 0xe0d8c8, 'mapStone');
  box(lx, (T + 0.016 + ly - 0.03) / 2, lz, 0.04, ly - 0.03 - T - 0.016, 0.04, r() < 0.5 ? 0xf4ecd8 : 0xf2d860, 'petal');
  box(lx, ly - 0.022, lz, 0.008, 0.016, 0.008, 0x2a2420, 'petal');
  box(lx, ly, lz, 0.022, 0.044, 0.022, 0xffc860, 'petal', 1.3);
  // A bottle of water (plastic with a blue cap, or glass) behind, on the left.
  src = traceSource();
  const glass = r() < 0.35;
  const bx = -0.35;
  const bz = -0.2;
  box(bx, T + 0.085, bz, 0.075, 0.17, 0.075, glass ? 0xb8d0b4 : 0xd8e8ee, 'petal', 0.95);
  box(bx, T + 0.19, bz, 0.05, 0.04, 0.05, glass ? 0xb8d0b4 : 0xd8e8ee, 'petal', 1.02);
  box(bx, T + 0.225, bz, 0.03, 0.03, 0.03, glass ? 0xb8d0b4 : 0xd8e8ee, 'petal', 1.05);
  box(bx, T + 0.247, bz, 0.034, 0.016, 0.034, glass ? 0xc8b890 : 0x2a6ab8, 'petal');
  // A cup of water (or tea) beside it.
  box(-0.24, T + 0.03, 0.12, 0.06, 0.06, 0.06, 0xf0f0ea, 'mapStone');
  box(-0.24, T + 0.058, 0.12, 0.045, 0.006, 0.045, r() < 0.5 ? 0x8a5a2a : 0xa8c0c4, 'petal');
  // Fruit on a plate, on the right: bananas, oranges or a green coconut.
  src = traceSource();
  const fx = 0.33;
  const fzz = -0.12;
  box(fx, T + 0.008, fzz, 0.2, 0.016, 0.2, 0xf2eee6, 'mapStone');
  const fruit = r();
  if (fruit < 0.45) {
    // a hand of bananas: fingers side by side, curving up at the tips, the crown
    for (let k = 0; k < 4; k++) {
      const z = fzz - 0.06 + k * 0.04;
      b.box(fx - 0.02, T + 0.035, z, 0.15, 0.036, 0.034, k % 2 ? 0xecc840 : 0xf2d24a, 'petal', { src, rz: 0.18 });
      b.box(fx + 0.07, T + 0.06, z, 0.05, 0.03, 0.03, 0xe0be3a, 'petal', { src, rz: 0.6 });
    }
    box(fx - 0.1, T + 0.04, fzz, 0.03, 0.05, 0.12, 0x6a7a2a, 'petal');
  } else if (fruit < 0.8) {
    // three oranges (green-skinned, as the market's), one on top
    for (const [dx, dz, dy] of [
      [-0.045, -0.04, 0],
      [0.05, -0.03, 0],
      [0, 0.05, 0],
      [0, 0, 0.07],
    ] as const)
      box(fx + dx, T + 0.05 + dy, fzz + dz, 0.075, 0.07, 0.075, dy ? 0xe89a2a : r() < 0.5 ? 0x9aa83a : 0xd8a032, 'petal');
  } else {
    // a green coconut, its top cut for the straw
    box(fx, T + 0.08, fzz, 0.15, 0.14, 0.15, 0x6a9a3a, 'petal');
    box(fx, T + 0.08, fzz, 0.12, 0.17, 0.12, 0x72a23e, 'petal', 1.03);
    box(fx, T + 0.17, fzz, 0.06, 0.012, 0.06, 0xf0ead0, 'petal');
    stick(fx, T + 0.17, fzz, fx + 0.03, T + 0.26, fzz + 0.02, 0.012, 0xe84a6a, 'petal');
  }
  // The garland along the tray's front (marigolds and jasmine strung, sagging; a red tassel at its low point).
  src = traceSource();
  const beads = 15;
  const mari = r() < 0.6;
  for (let k = 0; k < beads; k++) {
    const u = k / (beads - 1);
    const x = -0.38 + 0.76 * u;
    const y = 1.53 - 0.11 * (1 - (2 * u - 1) ** 2);
    // (marigolds, a jasmine bud between every two)
    const c = k % 3 === 1 ? (mari ? 0xf4f2e6 : 0xf2a020) : mari ? (k % 2 ? 0xf2a020 : 0xf08a1a) : 0xf2f2e6;
    box(x, y, 0.475, 0.058, 0.055, 0.045, c, 'petal', 1.05);
  }
  box(0, 1.385, 0.48, 0.03, 0.08, 0.02, 0xc8302a, 'petal');
  box(0, 1.33, 0.48, 0.045, 0.04, 0.03, mari ? 0xf08a1a : 0xf2f2e6, 'petal');
});
