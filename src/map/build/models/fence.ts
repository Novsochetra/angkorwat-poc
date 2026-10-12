import { traceSource } from '../../../feedback/sourceTrace';
import type { VoxelBuilder } from '../../../voxel/VoxelBuilder';
import { PIECES, registerPieceModel } from '../pieces';
import { BAMBOO, KRAMA, NEW_BAMBOO, NODE, OLD_BAMBOO, post, rng, TIE, tone, type Rand } from './_yardKit';

/**
 * A run of bamboo fence (របងឫស្សី, build/pieces.ts `PIECES.fence`): three metres
 * of a Khmer garden fence, chest high to him (2.4 m tall): three bamboo posts
 * (one at each end, one in the middle), pairs of whole-bamboo rails at the top,
 * the middle and the foot, and between them a
 * lattice of new split bamboo woven on the slant (the criss-cross ក្រឡា of
 * village gardens), lashed to the posts with rattan.
 *
 * Runs join end to end: the end posts stand flush with the run's ends (two
 * runs side by side meet as a pair of posts, as fences do where two lengths
 * are tied together), the rails run to the ends, and the lattice's slant
 * repeats every 0.2 m, so it carries on unbroken into the next run.
 * Seeded: the posts' tones and lean, a strip or two of a darker cut, now and
 * then a creeper of morning glory up a post, a krama drying over the top rail
 * or a clay pot turned upside down on a post.
 */

/** Its length (m: `PIECES.fence.w`), the posts' height, the lattice between its rails (m over the ground). */
const LEN = PIECES.fence.w;
const TOP = PIECES.fence.h;
const LAT0 = 0.17;
const LAT1 = TOP - 0.17;
/** The lattice's slant repeats every `PITCH` m along the run (3 m holds it 15 times: runs join without a seam). */
const PITCH = 0.2;
const POST_W = 0.11;

registerPieceModel('fence', (b, look) => {
  const r = rng(look.seed, 31);
  const src = traceSource();
  const half = LEN / 2;
  const xs = [-half + POST_W / 2, 0, half - POST_W / 2];

  // ── Posts: whole bamboo, sunk in, a node ring low and one under the cut top ──
  const tops: number[] = [];
  xs.forEach((x, i) => {
    const top = TOP - 0.06 * r() - (i === 1 ? 0.02 : 0);
    tops.push(top);
    const c = tone(OLD_BAMBOO, r());
    post(b, x, 0, -0.15, top, POST_W, c, 'mapBark', 0.94 + r() * 0.08, src, (r() - 0.5) * 0.03, (r() - 0.5) * 0.02);
    b.box(x, 0.42 + r() * 0.12, 0, POST_W + 0.025, 0.035, POST_W + 0.025, tone(NODE, r()), 'mapBark', { src, shade: 0.9 });
    b.box(x, top - 0.07, 0, POST_W + 0.025, 0.035, POST_W + 0.025, tone(NODE, r()), 'mapBark', { src, shade: 0.9 });
  });

  // ── Rails: a pair top and bottom (one each side of the lattice), the length of the run ──
  // (top and bottom, and one pair across the middle: the lattice is a man's height and more)
  const railY = [LAT0 + 0.03, (LAT0 + LAT1) / 2, LAT1 - 0.03];
  for (const y of railY)
    for (const s of [-1, 1]) {
      const c = tone(BAMBOO, r());
      b.box(0, y + (r() - 0.5) * 0.012, s * 0.052, LEN, 0.062, 0.062, c, 'mapBark', { src, shade: 0.95 + r() * 0.08 });
    }

  // ── The lattice: split bamboo on the slant both ways (one way behind, one in front: woven) ──
  lattice(b, r, 1, 0.012, src);
  lattice(b, r, -1, -0.012, src);

  // ── Rattan lashings where the rails cross the posts ──
  for (const x of xs)
    for (const y of railY) b.box(x, y, 0, POST_W + 0.05, 0.07, 0.17, tone(TIE, r()), 'mapBark', { src, shade: 0.9 });

  // ── Now and then a last touch ──
  const t = r();
  if (t < 0.3) creeper(b, r, xs[r() < 0.5 ? 0 : 2], src);
  else if (t < 0.42) krama(b, r, src);
  else if (t < 0.5) {
    // A clay pot turned upside down on the middle post (to dry, or to keep the rain out of the bamboo).
    // (its neck down over the post, the round belly up)
    const c = tone([0xb8633a, 0xa9582f, 0x9a5a3a], r());
    b.box(0, tops[1] + 0.03, 0, 0.16, 0.06, 0.16, c, 'mapStone', { src, shade: 0.9 });
    b.box(0, tops[1] + 0.16, 0, 0.28, 0.2, 0.28, c, 'mapStone', { src });
    b.box(0, tops[1] + 0.285, 0, 0.18, 0.05, 0.18, c, 'mapStone', { src, shade: 1.05 });
  }
});

/**
 * One way of the lattice: strips of split bamboo at 45° (`dir` 1 rising toward +x, −1 falling), `PITCH` apart along
 * the run, cut at the run's ends and the rails, at depth `z`.
 */
function lattice(b: VoxelBuilder, r: Rand, dir: 1 | -1, z: number, src: ReturnType<typeof traceSource>): void {
  const half = LEN / 2;
  const h = LAT1 - LAT0;
  // (a strip is the line x = c + dir·(y − LAT0); c steps by PITCH from a phase that repeats every PITCH)
  for (let c = -half - h + PITCH / 2; c < half + h; c += PITCH) {
    // Where it is inside the panel: x within the run, y within the rails.
    let ya = LAT0;
    let yb = LAT1;
    const xAt = (y: number) => c + dir * (y - LAT0);
    const yAt = (x: number) => LAT0 + (x - c) * dir;
    if (dir > 0) {
      ya = Math.max(ya, yAt(-half));
      yb = Math.min(yb, yAt(half));
    } else {
      ya = Math.max(ya, yAt(half));
      yb = Math.min(yb, yAt(-half));
    }
    if (yb - ya < 0.04) continue;
    const x0 = xAt(ya);
    const x1 = xAt(yb);
    const len = Math.hypot(x1 - x0, yb - ya);
    // (now and then a strip from an older culm: darker)
    const c0 = r() < 0.08 ? tone(BAMBOO, r()) : tone(NEW_BAMBOO, r());
    b.box((x0 + x1) / 2, (ya + yb) / 2, z, len, 0.046, 0.014, c0, 'mapBark', { src, rz: dir * (Math.PI / 4), shade: 0.95 + r() * 0.1 });
  }
}

/** Morning glory climbing an end post: its twining stem, heart leaves, two purple-pink flowers. */
function creeper(b: VoxelBuilder, r: Rand, x: number, src: ReturnType<typeof traceSource>): void {
  const side = r() < 0.5 ? 1 : -1;
  const z = side * 0.09;
  const LEAF = [0x3f7a2e, 0x4a8a34, 0x356a28, 0x58963c];
  const h = 0.7 + r() * 0.45;
  b.box(x, h / 2, z, 0.025, h, 0.025, 0x5a7a34, 'mapLeaf', { src });
  for (let k = 0; k < 6; k++) {
    const y = 0.12 + (k / 5) * (h - 0.1);
    const a = k * 2.2 + r();
    b.box(x + Math.cos(a) * 0.09, y, z + side * Math.abs(Math.sin(a)) * 0.05, 0.13, 0.03, 0.11, tone(LEAF, r()), 'mapLeaf', { src, ry: a, rx: 0.4 });
  }
  for (let k = 0; k < 2; k++) {
    const y = h * (0.55 + k * 0.35);
    const fx = x + (k ? 0.07 : -0.08);
    b.box(fx, y, z + side * 0.05, 0.09, 0.09, 0.05, k ? 0xc0508a : 0xa04a9a, 'petal', { src });
    b.box(fx, y, z + side * 0.08, 0.035, 0.035, 0.02, 0xf4ecd8, 'petal', { src });
  }
}

/** A krama drying over the top rail: hung across it, its two ends down each side, checks of a colour and white. */
function krama(b: VoxelBuilder, r: Rand, src: ReturnType<typeof traceSource>): void {
  const [c, w] = KRAMA[Math.floor(r() * KRAMA.length) % KRAMA.length];
  const x = (r() - 0.5) * 1.6;
  // (over both top rails: they span 0.083 m each side of the middle)
  const y = LAT1 - 0.03 + 0.031;
  b.box(x, y + 0.015, 0, 0.5, 0.03, 0.25, c, 'petal', { src });
  for (const s of [-1, 1]) {
    const len = s > 0 ? 0.55 : 0.4;
    b.box(x, y + 0.02 - len / 2, s * 0.112, 0.5, len, 0.025, c, 'petal', { src });
    for (let k = 0; k < 3; k++) if (0.08 + k * 0.14 < len - 0.04) b.box(x, y - 0.08 - k * 0.14, s * 0.127, 0.5, 0.035, 0.01, w, 'petal', { src });
  }
}
