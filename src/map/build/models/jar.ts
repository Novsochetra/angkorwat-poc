import { Euler, Quaternion, Vector3 } from 'three';
import { traceSource, type SourceTrace } from '../../../feedback/sourceTrace';
import type { VoxelMaterialKey } from '../../../voxel/materials';
import { hash3 } from '../../../voxel/random';
import { registerPieceModel } from '../pieces';

/**
 * His big water jar (ពាងទឹក, build/pieces.ts `PIECES.jar`): the Khmer rain
 * jar that stands under every eave of the map (village/_kit.ts `jar`,
 * hamlet/_psKit.ts `bigJar`), here as he sets one up in his yard.
 *
 * Put up as he does it: two courses of fired bricks for its stand, then the jar
 * set on them, from its small foot up: the round belly (each course an octagon,
 * four boxes at 45°), the shoulder with its glaze bands, the short neck and the
 * rolled rim round its mouth, the water in it; the round wooden lid (planks, a
 * knob); last the dipper on the lid, a coconut shell on a wooden handle or a
 * plastic one.
 *
 * Plain dark-brown glaze, glossy where it ran thick on the shoulder, a band or
 * two incised round it (no dragons: those are the Ratchaburi jars). Seeded
 * (`look.seed`): its size and glaze, its bands, the lid set straight or pushed
 * aside (the water shows), the dipper's kind and colour.
 * About 80 blocks.
 */

/** Dark-brown glazes: the body, its gloss where the glaze ran thick (the shoulder), the bands. */
const GLAZE: readonly (readonly [body: number, gloss: number, band: number])[] = [
  [0x5a3420, 0x6e4228, 0x3e2416],
  [0x4e2e1c, 0x643c24, 0x8a6a40],
  [0x63391f, 0x7a4a2a, 0x42281a],
  [0x46291a, 0x5c3824, 0x2e1c12],
];
const BRICK = [0xb05a34, 0xa4522e, 0xbc6a3e, 0x98502e] as const;
const LID = [0x8a6a48, 0x7e6044, 0x96744e] as const;
/** The plastic dippers of the market: blue, pink, green, orange. */
const PLASTIC = [0x2a6ab8, 0xd8507a, 0x3a9a5a, 0xe0802a] as const;
const WATER = 0x2c3c40;
/** An octagon's side over its width (tan 22.5°): four boxes this wide, turned 45° apart, make it. */
const SIDE = 0.4142;

const _q = new Quaternion();
const _e = new Euler();
const _v = new Vector3();
const UP = new Vector3(0, 1, 0);

registerPieceModel('jar', (b, look) => {
  const s = Math.round(look.seed * 997) | 0;
  let n = 0;
  const r = () => hash3(n++, s, 67, 433);
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
  /** A round course: an octagon `w` across its flats, y0‥y1, at (x, z), turned `a`. */
  const oct = (x: number, z: number, w: number, y0: number, y1: number, color: number, mat: VoxelMaterialKey, shade = 1, a = 0) => {
    for (let k = 0; k < 4; k++) box(x, (y0 + y1) / 2, z, w, y1 - y0, w * SIDE, color, mat, shade * (k % 2 ? 1.02 : 1), a + (k * Math.PI) / 4);
  };

  const k = 0.95 + r() * 0.07;
  const [body, gloss, band] = pick(GLAZE);

  // ── The stand: two courses of fired bricks, the lower along x, the upper across ──
  const by = 0.075;
  for (let i = 0; i < 3; i++) box(0, by / 2, (i - 1) * 0.22, 0.62, by, 0.2, pick(BRICK), 'mapRock', 0.92 + r() * 0.1, (r() - 0.5) * 0.06);
  for (let i = 0; i < 3; i++) box((i - 1) * 0.22, by * 1.5, 0, 0.2, by, 0.64, pick(BRICK), 'mapRock', 0.95 + r() * 0.1, (r() - 0.5) * 0.06);
  const y = by * 2;

  // ── The jar, from its foot up ──
  src = traceSource();
  // (its profile: a small foot, the belly widest a little under half way, the shoulder rounding in to the neck)
  const courses: readonly [w: number, h: number, c: number, sh: number][] = [
    [0.54, 0.06, body, 0.8], // the foot
    [0.66, 0.07, body, 0.84],
    [0.78, 0.08, body, 0.88],
    [0.88, 0.08, body, 0.92],
    [0.95, 0.09, body, 0.96],
    [0.98, 0.1, body, 1], // the belly, widest
    [0.96, 0.09, body, 1.02],
    [0.91, 0.08, gloss, 1.04], // the shoulder: the glaze ran thick
    [0.83, 0.07, gloss, 1.06],
    [0.72, 0.06, gloss, 1.08],
    [0.6, 0.05, gloss, 1.1],
  ];
  let yy = y;
  for (const [w, h, c, sh] of courses) {
    oct(0, 0, w * k, yy, yy + h * k, c, 'mapStone', sh);
    yy += h * k;
  }
  // (the bands incised round the belly and the shoulder: one or two)
  oct(0, 0, 0.995 * k, y + 0.505 * k, y + 0.53 * k, band, 'mapStone', 0.95, Math.PI / 8);
  if (r() < 0.5) oct(0, 0, 0.85 * k, y + 0.67 * k, y + 0.685 * k, band, 'mapStone', 1, Math.PI / 8);
  // The neck, the water in the mouth, and the rolled rim round it (eight short bars).
  oct(0, 0, 0.46 * k, yy, yy + 0.04 * k, body, 'mapStone', 1.04);
  yy += 0.04 * k;
  const rw = 0.56 * k;
  const rt = 0.075 * k;
  const rh = 0.055 * k;
  oct(0, 0, rw - rt * 1.6, yy - 0.01, yy + rh * 0.4, WATER, 'mapStone', 0.85);
  for (let q = 0; q < 8; q++) {
    const a = (q * Math.PI) / 4;
    const d = (rw - rt) / 2;
    box(Math.cos(a) * d, yy + rh / 2, -Math.sin(a) * d, rt, rh, rw * SIDE + rt * 0.5, gloss, 'mapStone', 1.12, a);
  }
  yy += rh;

  // ── The lid: round, of planks, a knob; straight on, or pushed aside to dip (it still lies flat on the rim) ──
  src = traceSource();
  const ajar = r() < 0.4;
  const pa = r() * Math.PI * 2;
  const lx = ajar ? Math.cos(pa) * 0.13 * k : 0;
  const lz = ajar ? Math.sin(pa) * 0.13 * k : 0;
  const ly = yy + 0.02;
  const wood = pick(LID);
  const lyaw = r() * 1.5;
  oct(lx, lz, 0.62 * k, ly - 0.02, ly + 0.02, wood, 'mapBark', 1, lyaw);
  // (the planks' seams across it, and the knob)
  for (const o of [-0.1, 0.1]) box(lx + Math.cos(lyaw) * o * k, ly + 0.022, lz - Math.sin(lyaw) * o * k, 0.012, 0.006, 0.5 * k, 0x5a4430, 'mapBark', 1, lyaw);
  box(lx, ly + 0.045, lz, 0.09, 0.05, 0.09, 0x5a4430, 'mapBark', 1.02, lyaw);

  // ── The dipper: on the lid, its handle out over the rim ──
  src = traceSource();
  const da = r() * Math.PI * 2;
  const dx = lx + Math.cos(da) * 0.14 * k;
  const dz = lz + Math.sin(da) * 0.14 * k;
  const dy = ly + 0.02;
  const ha = da + 0.9 + r() * 0.6;
  // (its handle's end stays over the stand's footprint: shorter when it points out past it)
  let hl = 0.34;
  while (hl > 0.16 && Math.hypot(dx + Math.cos(ha) * hl, dz + Math.sin(ha) * hl) > 0.48) hl -= 0.02;
  const hx = dx + Math.cos(ha) * hl;
  const hz = dz + Math.sin(ha) * hl;
  if (r() < 0.55) {
    // a coconut shell (brown, the rim paler where it was cut) on a wooden handle
    oct(dx, dz, 0.16, dy + 0.02, dy + 0.1, 0x5a3a22, 'mapBark', 1, da);
    box(dx, dy + 0.012, dz, 0.1, 0.03, 0.1, 0x4a2e1a, 'mapBark', 0.95, da);
    oct(dx, dz, 0.13, dy + 0.098, dy + 0.108, 0x9a7a54, 'mapBark', 1.1, da);
    stick(dx, dy + 0.08, dz, hx, dy + 0.12, hz, 0.03, 0x9a7a54, 'mapBark');
  } else {
    // a plastic dipper with its straight handle
    const c = pick(PLASTIC);
    oct(dx, dz, 0.16, dy, dy + 0.09, c, 'petal', 1, da);
    oct(dx, dz, 0.17, dy + 0.088, dy + 0.1, c, 'petal', 1.08, da);
    stick(dx, dy + 0.08, dz, hx, dy + 0.12, hz, 0.035, c, 'petal', 1.04);
  }
});
