import { traceSource } from '../../../feedback/sourceTrace';
import type { VoxelBuilder } from '../../../voxel/VoxelBuilder';
import { PIECES, registerPieceModel } from '../pieces';
import { KRAMA, mix, NEW_BAMBOO, NODE, OLD_BAMBOO, post, rng, TIE, tone, turned, type Rand } from './_yardKit';

/**
 * A bamboo bed (គ្រែឫស្សី, build/pieces.ts `PIECES.kre`), knee high to him, the
 * kind every Khmer yard has under a tree or a house: six legs of whole
 * bamboo, a long pole lashed along each side, cross bearers on those, and on
 * them the bed of new split bamboo slats laid the long way (pale green-gold:
 * the frame is older, darker bamboo), held down along both edges by a pole
 * lashed through to the bearers with rattan. On it, by the seed: a folded
 * krama, a rolled sleeping mat (kantel) or a Khmer triangle pillow; a pair
 * of flip-flops left under its front.
 *
 * The slats' top is the seat (`PIECES.kre.seat.y`): he sits on the middle of
 * the long side, and lies the long way.
 */

const W = PIECES.kre.w;
const D = PIECES.kre.d;
/** The slats' top (where he sits and lies), the edge poles' top. */
const BED = PIECES.kre.seat!.y;
const TOP = PIECES.kre.h;

registerPieceModel('kre', (b, look) => {
  const r = rng(look.seed, 47);
  const src = traceSource();
  const legX = [-(W / 2 - 0.14), 0, W / 2 - 0.14];
  const legZ = D / 2 - 0.13;
  const slatT = 0.04;
  const bearTop = BED - slatT;
  const bearH = 0.065;
  const sideTop = bearTop - bearH;
  const sideH = 0.085;

  // ── Legs: whole bamboo, set in the earth, a node ring on each ──
  for (const x of legX)
    for (const s of [-1, 1]) {
      const z = s * legZ;
      post(b, x, z, -0.08, sideTop, 0.1, tone(OLD_BAMBOO, r()), 'mapBark', 0.92 + r() * 0.08, src, (r() - 0.5) * 0.03, (r() - 0.5) * 0.03);
      b.box(x, 0.18 + r() * 0.1, z, 0.125, 0.03, 0.125, tone(NODE, r()), 'mapBark', { src, shade: 0.85 });
    }

  // ── The side poles along the legs, the cross bearers on them ──
  for (const s of [-1, 1]) b.box(0, sideTop - sideH / 2, s * (legZ + 0.02), W - 0.04, sideH, sideH, tone(OLD_BAMBOO, r()), 'mapBark', { src, shade: 0.95 + r() * 0.06 });
  const bearX = [-(W / 2 - 0.14), -(W / 4 - 0.04), 0, W / 4 - 0.04, W / 2 - 0.14];
  for (const x of bearX) b.box(x, bearTop - bearH / 2, 0, 0.075, bearH, D - 0.04, tone(OLD_BAMBOO, r()), 'mapBark', { src, shade: 0.9 + r() * 0.08 });

  // ── The bed: split bamboo slats the long way, new and pale, each its own ──
  const n = 21;
  const pitch = (D - 0.06) / n;
  for (let i = 0; i < n; i++) {
    const z = -(D - 0.06) / 2 + (i + 0.5) * pitch;
    const len = W - 0.12 - r() * 0.05;
    const c = r() < 0.12 ? mix(tone(NEW_BAMBOO, r()), 0xa89a5a, 0.35) : tone(NEW_BAMBOO, r());
    b.box((r() - 0.5) * 0.04, bearTop + slatT / 2 + (r() - 0.5) * 0.006, z, len, slatT, pitch - 0.012, c, 'mapBark', { src, shade: 0.94 + r() * 0.1 });
  }

  // ── Edge poles holding the slats down, lashed through to every bearer ──
  const edgeH = TOP - BED;
  const edgeZ = (D - 0.06) / 2 - pitch / 2;
  for (const s of [-1, 1]) b.box(0, BED + edgeH / 2, s * edgeZ, W - 0.1, edgeH, 0.065, tone(OLD_BAMBOO, r()), 'mapBark', { src, shade: 1 + r() * 0.05 });
  for (const x of bearX) for (const s of [-1, 1]) b.box(x, BED - 0.02, s * (edgeZ + 0.005), 0.06, edgeH + 0.07, 0.09, tone(TIE, r()), 'mapBark', { src, shade: 0.9 });

  // ── What lies on it (along the back edge: he sits on the front's middle and lies the long way down the middle), and under it ──
  const end = r() < 0.5 ? 1 : -1;
  const t = r();
  if (t < 0.4) foldedKrama(b, r, end * (W / 2 - 0.45), src);
  else if (t < 0.75) {
    rolledMat(b, r, end, src);
    foldedKrama(b, r, -end * (W / 2 - 0.5), src);
  } else {
    pillow(b, r, end * (W / 2 - 0.5), src);
    foldedKrama(b, r, -end * (W / 2 - 0.55), src);
  }
  if (r() < 0.6) flipFlops(b, r, (r() - 0.5) * 0.9, D / 2 + 0.12, src);
});

/** A krama folded in a square: its colour, white checks across it. */
function foldedKrama(b: VoxelBuilder, r: Rand, x: number, src: ReturnType<typeof traceSource>): void {
  const [c, w] = KRAMA[Math.floor(r() * KRAMA.length) % KRAMA.length];
  const a = (r() - 0.5) * 0.3;
  const z = -D / 2 + 0.33;
  turned(b, x, BED + 0.025, z, 0.46, 0.05, 0.34, a, 0, 0, c, 'petal', 1, src);
  for (const d of [-0.1, 0.02, 0.13]) turned(b, x + Math.cos(a) * d, BED + 0.052, z - Math.sin(a) * d, 0.035, 0.01, 0.35, a, 0, 0, w, 'petal', 1, src);
}

/** A woven plastic mat (kantel) rolled up along the back edge from one end (`end` ±1), a coloured stripe round each end. */
function rolledMat(b: VoxelBuilder, r: Rand, end: number, src: ReturnType<typeof traceSource>): void {
  const MATS = [
    [0x2f6fb0, 0xe8d24a],
    [0xc8423a, 0x2e7a4e],
    [0x3a8a5a, 0xe86a8a],
    [0xe0a030, 0x2a4a8a],
  ];
  const [g, s] = MATS[Math.floor(r() * MATS.length) % MATS.length];
  const len = 1.15;
  const x = end * (W / 2 - 0.12 - len / 2);
  const z = -D / 2 + 0.27;
  b.box(x, BED + 0.085, z, len, 0.13, 0.17, g, 'petal', { src });
  b.box(x, BED + 0.085, z, len - 0.02, 0.17, 0.13, g, 'petal', { src, shade: 0.95 });
  for (const d of [-len / 2 + 0.1, len / 2 - 0.1]) b.box(x + d, BED + 0.085, z, 0.06, 0.175, 0.175, s, 'petal', { src });
}

/** A Khmer triangle pillow (ខ្នើយ) pushed to the back edge: a long wedge, its end panels in another colour. */
function pillow(b: VoxelBuilder, r: Rand, x: number, src: ReturnType<typeof traceSource>): void {
  const c = tone([0xc8302a, 0xe0b040, 0x2a5aa0, 0x2e8a5a], r());
  const e = tone([0xe0b040, 0xc8302a, 0xf0e6d0], r());
  const z = -D / 2 + 0.3;
  b.box(x, BED + 0.065, z, 0.62, 0.13, 0.3, c, 'petal', { src });
  b.box(x, BED + 0.16, z - 0.03, 0.6, 0.07, 0.18, c, 'petal', { src, shade: 1.06 });
  for (const s of [-1, 1]) b.box(x + s * 0.32, BED + 0.09, z, 0.03, 0.17, 0.26, e, 'petal', { src });
}

/** A pair of flip-flops on the ground, toes out. */
function flipFlops(b: VoxelBuilder, r: Rand, x: number, z: number, src: ReturnType<typeof traceSource>): void {
  const c = tone([0x2a5aa0, 0x3a3a3a, 0xc8302a, 0x2e8a5a], r());
  for (const s of [-1, 1]) {
    const a = s * 0.12 + (r() - 0.5) * 0.2;
    turned(b, x + s * 0.09, 0.012, z + (r() - 0.5) * 0.05, 0.1, 0.024, 0.27, a, 0, 0, c, 'petal', 1, src);
    turned(b, x + s * 0.09 + Math.sin(a) * 0.05, 0.035, z + 0.05, 0.08, 0.02, 0.015, a, 0, 0, 0xe8e4dc, 'petal', 1, src);
  }
}
