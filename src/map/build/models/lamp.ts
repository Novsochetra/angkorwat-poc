import { Euler, Quaternion, Vector3 } from 'three';
import { traceSource, type SourceTrace } from '../../../feedback/sourceTrace';
import type { VoxelMaterialKey } from '../../../voxel/materials';
import { hash3 } from '../../../voxel/random';
import { PIECES, registerPieceModel } from '../pieces';

/**
 * A lantern on a post (ចង្កៀង, build/pieces.ts `PIECES.lamp`): a wooden post
 * set in the ground with a short arm and its knee brace at the top, a hook,
 * and a hurricane lamp hanging from it by its wire bail (the kerosene lamps
 * of the villages' verandas and stalls: village/_kit.ts `lantern`, the Kulen
 * huts', the market's), its glass globe's middle at `PIECES.lamp.light` where
 * the add-on lights it at dusk.
 *
 * Put up as he does it: the post, the earth and stones packed round its foot, the arm and its
 * brace, the hook; then the lamp hung on it: its bail, the fount (the tin tank
 * with its wick knob), the glass globe (`petal`: the glow is drawn over it,
 * 0.18 m across, 0.22 m tall), the two side tubes, the top and its vent. A
 * bottle of kerosene at the foot, sometimes.
 *
 * Seeded (`look.seed`): the lamp's tin (red, green, blue or plain), the wood,
 * the stones, the bottle.
 * 43‥47 blocks.
 */

/** Painted tin: red, green, blue, plain. */
const TIN = [0xa8302a, 0x3a6a3a, 0x2a5a8a, 0x9a9c98] as const;
const WOOD = [
  [0x5a4636, 0x4e3d30],
  [0x6a5440, 0x5e4a38],
  [0x7a6a58, 0x6a5c4c],
] as const;
const STONE = [0x8a8478, 0x7a756a, 0x948e80] as const;
const GLASS = 0xf2ead0;
const IRON = 0x34302c;
const SIDE = 0.4142;

const _q = new Quaternion();
const _e = new Euler();
const _v = new Vector3();
const UP = new Vector3(0, 1, 0);

registerPieceModel('lamp', (b, look) => {
  const s = Math.round(look.seed * 997) | 0;
  let n = 0;
  const r = () => hash3(n++, s, 73, 461);
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

  const [lx, ly, lz] = PIECES.lamp.light!;
  const top = PIECES.lamp.h - 0.02;
  const [w0, w1] = pick(WOOD);
  const tin = pick(TIN);

  // ── The post, set in the ground; its top cut on a slant (the rain runs off) ──
  box(0, (top - 0.05 - 0.1) / 2, 0, 0.14, top - 0.05 + 0.1, 0.14, w0, 'mapBark', 0.97);
  b.box(0, top - 0.035, -0.005, 0.14, 0.06, 0.15, w1, 'mapBark', { src, rx: -0.3, shade: 1.04 });
  // The earth tamped round its foot, a few stones packed in it.
  src = traceSource();
  oct(0, 0, 0.36, -0.02, 0.05, 0x6a5440, 'mapRock', 0.92, r());
  const stones = 2 + Math.floor(r() * 2);
  for (let k = 0; k < stones; k++) {
    const a = (k / stones) * Math.PI * 2 + r() * 1.2;
    const sz = 0.08 + r() * 0.05;
    box(Math.cos(a) * 0.15, 0.04, Math.sin(a) * 0.15, sz * 1.2, sz * 0.6, sz, pick(STONE), 'mapRock', 0.92 + r() * 0.1, a);
  }

  // ── The arm out to the front, its knee brace, the hook ──
  src = traceSource();
  const armY = top - 0.08;
  const armZ = lz + 0.08;
  box(0, armY, (0.05 + armZ) / 2, 0.07, 0.07, armZ - 0.05 + 0.02, w1, 'mapBark', 1.02);
  stick(0, armY - 0.28, 0.06, 0, armY - 0.025, 0.13, 0.05, w0, 'mapBark', 0.98);
  // (a nail through the arm's end, the hook bent from wire under the arm at the lamp's middle)
  box(0, armY + 0.04, armZ - 0.03, 0.018, 0.02, 0.018, IRON, 'mapStone');
  box(lx, armY - 0.055, lz, 0.016, 0.05, 0.016, IRON, 'mapStone');
  box(lx, armY - 0.078, lz + 0.012, 0.016, 0.014, 0.03, IRON, 'mapStone');

  // ── The hurricane lamp (a third bigger than life, as the map's lanterns), hung from the hook by its wire bail ──
  src = traceSource();
  const S = 1.3;
  const gh = 0.17 * S; // the globe's height
  const g0 = ly - gh / 2;
  const g1 = ly + gh / 2;
  const hookY = armY - 0.075;
  // (the bail: two wires from the hook down to the top's sides)
  for (const sx of [-1, 1]) stick(lx, hookY, lz, lx + sx * 0.085 * S, g1 + 0.02 * S, lz, 0.012, IRON, 'mapStone');
  // The fount (the tank), its rim and the wick's knob.
  oct(lx, lz, 0.19 * S, g0 - 0.085 * S, g0 - 0.01 * S, tin, 'mapStone', 0.95);
  oct(lx, lz, 0.17 * S, g0 - 0.012 * S, g0 + 0.004 * S, IRON, 'mapStone', 1);
  box(lx + 0.06 * S, g0 - 0.03 * S, lz + 0.085 * S, 0.025 * S, 0.025 * S, 0.02 * S, 0xb8a060, 'mapStone', 1.1);
  // The glass globe (a little bellied: wider in the middle).
  oct(lx, lz, 0.12 * S, g0, g1, GLASS, 'petal', 1.05);
  oct(lx, lz, 0.14 * S, g0 + 0.035 * S, g1 - 0.035 * S, GLASS, 'petal', 1.08);
  // The side tubes from the tank up to the top.
  for (const sx of [-1, 1]) box(lx + sx * 0.098 * S, (g0 - 0.06 * S + g1 + 0.02 * S) / 2, lz, 0.022 * S, gh + 0.08 * S, 0.022 * S, tin, 'mapStone', 1.02);
  // The top: the cap over the globe, its dome and the vent.
  oct(lx, lz, 0.17 * S, g1, g1 + 0.03 * S, tin, 'mapStone', 1.04);
  oct(lx, lz, 0.11 * S, g1 + 0.03 * S, g1 + 0.055 * S, tin, 'mapStone', 1.08);
  box(lx, g1 + 0.065 * S, lz, 0.05 * S, 0.02 * S, 0.05 * S, IRON, 'mapStone', 1);

  // ── A bottle of kerosene by the foot, sometimes ──
  src = traceSource();
  if (r() < 0.5) {
    // (beside the post, under the lamp's side: inside its footprint)
    const a = 0.35 + r() * 2.4;
    const bx = Math.cos(a) * 0.19;
    const bz = Math.sin(a) * 0.19;
    box(bx, 0.1, bz, 0.08, 0.2, 0.08, r() < 0.5 ? 0x9ab890 : 0xc8d0c8, 'petal', 0.95);
    box(bx, 0.225, bz, 0.04, 0.05, 0.04, 0x9ab890, 'petal', 1);
    box(bx, 0.26, bz, 0.045, 0.02, 0.045, 0x8a6a48, 'mapBark', 1);
  }
});
