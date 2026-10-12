import { traceSource } from '../../../feedback/sourceTrace';
import type { VoxelBuilder } from '../../../voxel/VoxelBuilder';
import { PIECES, registerPieceModel } from '../pieces';
import { BAMBOO, CUT, mix, OLD_BAMBOO, OLD_STRAW, post, PATH, POST, RAIL, rng, stick, STRAW, thatchCap, thatchCourse, TIE, tone, turned, type Rand, type Src } from './_yardKit';

/**
 * His cattle pen (គ្រោលគោ, build/pieces.ts `PIECES.pen`), as the sugar-palm
 * village's own (hamlet/_evYard.ts `pen`): a fence of three rough rails on
 * hardwood posts dug into the earth, lashed with rattan; the gate in the front
 * rail (by the seed a plank gate swung back inside against the fence, or the
 * three slip poles pulled from their rope loops and leant in the corner); a
 * shed along the back, palm-leaf thatch on bamboo rafters, its gable ends
 * open; under it a trough hollowed from a log,
 * water in it (`PIECES.pen.trough`), and a hay rack on the back fence full of
 * rice straw; straw bedding under the roof, the earth trodden bare at the gate,
 * round the trough and under the roof. Last touches by the seed: a coil of
 * rope on the gate post, a bucket by the trough, a sheaf of cut grass, the
 * ash of a smudge fire (lit at dusk against the mosquitoes, as Khmer farmers
 * do for their cattle).
 *
 * The rails and posts are `PIECES.pen.solids`; the cows' room inside them
 * (`PIECES.pen.pen`) is clear but for the trough.
 */

const P = PIECES.pen;
const X1 = P.w / 2;
const ZB = -P.d / 2;
const ZF = P.d / 2;
/** Half the gate's gap in the front rail (its middle `P.pen.gate`). */
const GATE = 1.0;
const GX = P.pen!.gate[0];
/** The shed's front posts stand on the side fences at this depth (its back ones on the back fence). */
const LF = -0.75;
/** The shed's ridge (along x, over the middle between its posts), its plates' top, the roof's pitch and its thatch. */
const ZM = (ZB + LF) / 2;
const PLATE = 2.62;
const RAFTER = 0.085;
const PITCH = (26 * Math.PI) / 180;
const SLOPE = Math.tan(PITCH);
const THICK = 0.17;
/** The thatch's underside at depth z (on the rafters), its eaves' overhang front and back. */
const underAt = (z: number) => PLATE + RAFTER + (Math.abs(LF - ZM) - Math.abs(z - ZM)) * SLOPE;
const OVER_F = 0.32;
const OVER_B = 0.16;
/** The fence's posts and its rails' heights (the sides' a hand higher: where they cross at the corners). */
const FENCE_TOP = 1.45;
const RAILS = [0.45, 0.85, 1.25];
const SIDE_RAILS = [0.5, 0.9, 1.3];
const TROUGH = P.trough!;

registerPieceModel('pen', (b, look) => {
  const r = rng(look.seed, 83);
  const src = traceSource();

  // ── Posts: the fence's, the shed's (taller: the back fence's and two on the sides), the gate's (stouter) ──
  const back = [-X1, -X1 / 2, 0, X1 / 2, X1];
  const side = [ZB, LF, 1.0, ZF];
  const frontL = [-X1, (-X1 - GATE) / 2 + GX, GX - GATE];
  const frontR = [GX + GATE, (X1 + GATE) / 2 + GX, X1];
  const lean = () => (r() - 0.5) * 0.035;
  for (const x of back) post(b, x, ZB, -0.3, PLATE, Math.abs(x) === X1 ? 0.18 : 0.16, tone(POST, r()), 'mapBark', 0.94 + r() * 0.08, src, 0, lean() * 0.4);
  for (const s of [-1, 1])
    for (const z of side.slice(1)) {
      const top = z === LF ? PLATE : FENCE_TOP - r() * 0.06;
      post(b, s * X1, z, -0.3, top, z === LF ? 0.18 : 0.16, tone(POST, r()), 'mapBark', 0.94 + r() * 0.08, src, lean(), z === LF ? 0 : lean());
    }
  for (const x of [-2.25 + GX, 2.25 + GX]) post(b, x, ZF, -0.3, FENCE_TOP - r() * 0.06, 0.16, tone(POST, r()), 'mapBark', 0.94 + r() * 0.08, src, lean(), lean());
  for (const x of [GX - GATE, GX + GATE]) post(b, x, ZF, -0.35, FENCE_TOP + 0.2, 0.2, tone(POST, r()), 'mapBark', 0.9 + r() * 0.06, src);

  // ── Rails on the inside of the posts, lashed with rattan where they cross ──
  const railSrc = traceSource();
  run(b, r, 'x', ZB + 0.11, back, RAILS, railSrc);
  run(b, r, 'x', ZF - 0.11, frontL, RAILS, railSrc);
  run(b, r, 'x', ZF - 0.11, frontR, RAILS, railSrc);
  run(b, r, 'z', -X1 + 0.11, side, SIDE_RAILS, railSrc);
  run(b, r, 'z', X1 - 0.11, side, SIDE_RAILS, railSrc);

  // ── The gate ──
  if (r() < 0.55) swingGate(b, r, traceSource());
  else slipPoles(b, r, traceSource());

  floor(b, r, traceSource());
  trough(b, r, traceSource());
  shed(b, r, traceSource());
  hayRack(b, r, traceSource());
  touches(b, r, traceSource());
});

/**
 * One run of fence: rails between the posts at `at` along `axis` (x: a run along x at depth `at`; z: along z at x
 * `at`), the posts at `posts` along it, rails at `heights`; each rail a pole from post to post, past each a little,
 * a hand off level; a lashing at every post and rail.
 */
function run(b: VoxelBuilder, r: Rand, axis: 'x' | 'z', at: number, posts: readonly number[], heights: readonly number[], src: Src): void {
  for (let i = 0; i < posts.length - 1; i++) {
    const p = posts[i];
    const q = posts[i + 1];
    for (const h of heights) {
      const y0 = h + (r() - 0.5) * 0.05;
      const y1 = h + (r() - 0.5) * 0.05;
      const c = r() < 0.15 ? tone(OLD_BAMBOO, r()) : tone(RAIL, r());
      if (axis === 'x') stick(b, p, y0, at, q, y1, at, 0.08, 0.1, c, 'mapBark', 0.94 + r() * 0.08, src, 0.1);
      else stick(b, at, y0, p, at, y1, q, 0.08, 0.1, c, 'mapBark', 0.94 + r() * 0.08, src, 0.1);
    }
  }
  // (round the post, on the fence's line, and the rail on its inside)
  const line = at > 0 ? at + 0.11 : at - 0.11;
  const mid = (line + at) / 2;
  for (const p of posts)
    for (const h of heights) {
      const c = tone(TIE, r());
      if (axis === 'x') b.box(p, h, mid, 0.21, 0.09, 0.3, c, 'mapBark', { src, shade: 0.88 });
      else b.box(mid, h, p, 0.3, 0.09, 0.21, c, 'mapBark', { src, shade: 0.88 });
    }
}

/** A plank gate (three rails, two stiles, a brace) hung on the left gate post, swung back inside against the fence. */
function swingGate(b: VoxelBuilder, r: Rand, src: Src): void {
  const hinge = GX - GATE - 0.12;
  const w = 1.9;
  const z = ZF - 0.27;
  const wood = [0x9a7a54, 0x8a6a48, 0xa2805a];
  for (const x of [hinge, hinge - w]) b.box(x, 0.82, z, 0.09, 1.2, 0.07, tone(wood, r()), 'mapBark', { src });
  for (const y of [0.42, 0.82, 1.22]) b.box(hinge - w / 2, y + (r() - 0.5) * 0.02, z, w + 0.06, 0.11, 0.06, tone(wood, r()), 'mapBark', { src, shade: 0.95 + r() * 0.08 });
  // (the brace: from the bottom by the hinge up to the top at the far end)
  stick(b, hinge, 0.42, z - 0.035, hinge - w, 1.22, z - 0.035, 0.05, 0.08, tone(wood, r()), 'mapBark', 0.92, src);
  // Rope hinges round the gate post.
  for (const y of [0.5, 1.15]) b.box(GX - GATE - 0.04, y, ZF - 0.16, 0.28, 0.07, 0.22, tone(TIE, r()), 'mapBark', { src, shade: 0.85 });
}

/** The three slip poles out of their rope loops on the gate posts, leant in the corner inside the fence. */
function slipPoles(b: VoxelBuilder, r: Rand, src: Src): void {
  for (const x of [GX - GATE, GX + GATE])
    for (const y of RAILS) b.box(x, y, ZF - 0.02, 0.27, 0.07, 0.27, tone(TIE, r()), 'mapBark', { src, shade: 0.85 });
  for (let k = 0; k < 3; k++) {
    const fx = GX + 2.95 - k * 0.14;
    const fz = ZF - 0.32 - k * 0.07;
    const tx = GX + GATE + 0.35 + k * 0.08;
    // (their tops against the inside of the top rail)
    stick(b, fx, 0.04, fz, tx, RAILS[2] + 0.04 + k * 0.03, ZF - 0.2, 0.085, 0.085, tone(BAMBOO, r()), 'mapBark', 0.95 + r() * 0.06, src, 0.15);
  }
}

/**
 * Trodden earth: the room's floor in big flat tiles of their own tone a finger over the ground (as the palm sugar
 * yard's, hamlet/_psYard.ts), the outer corners left in grass, a tile or two more of it worn out through the gate.
 */
function floor(b: VoxelBuilder, r: Rand, src: Src): void {
  const room = P.pen!;
  const nx = 4;
  const nz = 3;
  const x0 = room.x - room.w / 2 + 0.05;
  const z0 = room.z - room.d / 2 + 0.05;
  const cx = (room.w - 0.1) / nx;
  const cz = (room.d - 0.1) / nz;
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      // (the front corners stay grassy: the cows keep to the shed, the trough and the gate)
      if (j === nz - 1 && (i === 0 || i === nx - 1) && r() < 0.75) continue;
      const xa = x0 + i * cx + (i ? (r() - 0.5) * 0.12 : 0);
      const za = z0 + j * cz + (j ? (r() - 0.5) * 0.12 : 0);
      b.span(xa, -0.005, za, xa + cx + 0.02, 0.022, za + cz + 0.02, tone(PATH, r()), 'mapRock', { src, shade: 0.93 + r() * 0.1 });
    }
  // (and out through the gate to the fence's line)
  b.span(GX - GATE + 0.1, -0.005, room.z + room.d / 2 - 0.05, GX + GATE - 0.1, 0.02, ZF - 0.02, tone(PATH, r()), 'mapRock', { src, shade: 0.95 });
}

/** The trough: a log hollowed out on two flat stones, water in it, its cut ends pale. */
function trough(b: VoxelBuilder, r: Rand, src: Src): void {
  const [x, , z] = TROUGH;
  const len = 1.7;
  const bark = mix(tone(POST, r()), 0x6a4a30, 0.5);
  for (const s of [-1, 1]) b.box(x + s * 0.6, 0.05, z, 0.32, 0.1, 0.52, tone([0x8a8378, 0x7d776d, 0x958d80], r()), 'mapStone', { src });
  b.box(x, 0.14, z, len - 0.08, 0.1, 0.34, bark, 'mapBark', { src, shade: 0.85 });
  b.box(x, 0.26, z, len, 0.2, 0.5, bark, 'mapBark', { src });
  // (the rim round the hollow, the water a hand down in it)
  for (const s of [-1, 1]) b.box(x, 0.43, z + s * 0.2, len, 0.16, 0.1, bark, 'mapBark', { src, shade: 1.04 });
  for (const s of [-1, 1]) b.box(x + s * (len / 2 - 0.05), 0.43, z, 0.1, 0.16, 0.32, bark, 'mapBark', { src, shade: 1.04 });
  b.box(x, 0.375, z, len - 0.2, 0.03, 0.3, 0x3a5a6a, 'petal', { src });
  for (const s of [-1, 1]) b.box(x + s * (len / 2 + 0.005), 0.3, z, 0.02, 0.26, 0.42, tone(CUT, r()), 'mapBark', { src, shade: 0.95 });
}

/**
 * The shed along the back: plates on its posts (the back fence's and two on the side fences at `LF`), tie beams
 * across the ends, king posts and the ridge pole, bamboo rafters in pairs; thatch in courses from both eaves up,
 * their leaves ragged at their lower edges and hanging at the eaves, a cap folded over the ridge, tied down. The ends
 * are open (the frame shows).
 */
function shed(b: VoxelBuilder, r: Rand, src: Src): void {
  const span = 2 * X1 + 0.36;
  const ridgeY = underAt(ZM) - RAFTER / 2;
  for (const z of [ZB, LF]) b.box(0, PLATE - 0.065, z, span, 0.13, 0.14, tone(POST, r()), 'mapBark', { src });
  for (const s of [-1, 1]) {
    b.box(s * X1, PLATE + 0.06, (ZB + LF) / 2, 0.14, 0.12, LF - ZB + 0.3, tone(POST, r()), 'mapBark', { src });
    b.box(s * X1, (PLATE + 0.12 + ridgeY) / 2, ZM, 0.11, ridgeY - PLATE - 0.12, 0.11, tone(POST, r()), 'mapBark', { src });
  }
  b.box(0, ridgeY, ZM, span + 0.1, 0.12, 0.12, tone(POST, r()), 'mapBark', { src });
  const zB = ZB - OVER_B;
  const zF = LF + OVER_F;
  for (let i = 0; i < 7; i++) {
    const x = -X1 + 0.08 + (i * (2 * X1 - 0.16)) / 6;
    const c = tone(BAMBOO, r());
    stick(b, x, underAt(zB) - RAFTER / 2, zB, x, ridgeY + 0.02, ZM, RAFTER, RAFTER, c, 'mapBark', 0.94 + r() * 0.08, src, 0.04);
    stick(b, x, underAt(zF) - RAFTER / 2, zF, x, ridgeY + 0.02, ZM, RAFTER, RAFTER, tone(BAMBOO, r()), 'mapBark', 0.94 + r() * 0.08, src, 0.04);
  }
  for (const z of [ZB + 0.45, LF - 0.45]) b.box(0, underAt(z) - 0.03, z, span, 0.045, 0.05, tone(BAMBOO, r()), 'mapBark', { src, shade: 0.9 });

  // Thatch: both slopes a course at a time from the eaves up, each course one band, its leaves down the slope over it,
  // ragged past its lower edge; the eaves' courses thicker, their leaf tips hanging (`thatchCourse`).
  const courses = 4;
  for (let k = 0; k < courses; k++)
    for (const s of [-1, 1]) {
      const z0 = s > 0 ? zF : zB;
      const cw = Math.abs(ZM - z0) / courses;
      const slab = (cw / Math.cos(PITCH)) * 1.45;
      const z = z0 - s * (k + 0.5) * cw;
      const eave = k === 0;
      const th = eave ? THICK * 1.3 : THICK;
      const y = underAt(z) + th / 2 / Math.cos(PITCH) + 0.012 * k;
      // (short tips: he is 2.4 m tall, the front eave over the pen)
      const leaves = { every: 0.3, hang: eave ? ([0.04, 0.12] as const) : ([0.02, 0.08] as const), tips: eave ? 0.34 : 0, tipLen: [0.08, 0.2] as const };
      thatchCourse(b, r, 'x', -(span + 0.1) / 2, (span + 0.1) / 2, z, y, slab, th, PITCH, s, k % 2 === 1 ? 0.92 : 1, cw / Math.cos(PITCH), leaves, src);
    }
  // The cap over the ridge, last: folded over it, in three lengths, tied with split bamboo.
  thatchCap(b, r, -(span + 0.1) / 2, (span + 0.1) / 2, ZM, underAt(ZM) + 0.39, PITCH, 0.44, 0.13, 9, { tips: 0, tie: 1.45 }, src);
}

/** The hay rack on the back fence, right of the trough: slanted bars between two rails, full of rice straw, wisps poking through. */
function hayRack(b: VoxelBuilder, r: Rand, src: Src): void {
  const xa = 0.35;
  const xb = X1 - 0.55;
  const zIn = ZB + 0.55;
  const zOut = ZB + 0.16;
  for (const x of [xa, xb]) post(b, x, zIn, -0.2, 1.5, 0.1, tone(POST, r()), 'mapBark', 0.95, src);
  b.box((xa + xb) / 2, 1.42, zIn, xb - xa + 0.2, 0.08, 0.08, tone(RAIL, r()), 'mapBark', { src });
  b.box((xa + xb) / 2, 0.52, zOut, xb - xa + 0.2, 0.08, 0.08, tone(RAIL, r()), 'mapBark', { src });
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const x = xa + ((xb - xa) * i) / n;
    stick(b, x, 0.52, zOut, x, 1.42, zIn, 0.05, 0.05, tone(BAMBOO, r()), 'mapBark', 0.94, src, 0.05);
  }
  // The straw in it, heaped over the top, wisps through the bars and hanging over.
  const mid = (xa + xb) / 2;
  const L = xb - xa - 0.1;
  b.box(mid, 0.78, ZB + 0.27, L, 0.32, 0.2, tone(STRAW, r()), 'mapLeaf', { src, shade: 0.85 });
  b.box(mid, 1.08, ZB + 0.33, L, 0.32, 0.34, tone(STRAW, r()), 'mapLeaf', { src, shade: 0.9 });
  for (let k = 0; k < 3; k++) {
    const x = xa + 0.1 + ((k + 0.5) * (L - 0.1)) / 3;
    b.box(x + (r() - 0.5) * 0.15, 1.42 + r() * 0.06, ZB + 0.38, L / 3 + 0.1, 0.24 + r() * 0.1, 0.46, tone(STRAW, r()), 'mapLeaf', { src, ry: (r() - 0.5) * 0.2 });
  }
  for (let k = 0; k < 9; k++) {
    const x = xa + 0.15 + r() * (L - 0.2);
    const y = 0.75 + r() * 0.6;
    const zz = zOut + ((y - 0.52) / 0.9) * (zIn - zOut) + 0.05;
    turned(b, x, y - 0.06, zz, 0.07, 0.03, 0.3 + r() * 0.15, (r() - 0.5) * 0.8, -0.7 - r() * 0.5, 0, tone(STRAW, r()), 'mapLeaf', 0.95, src);
  }
}

/** Straw bedding under the roof; by the seed a coil of rope on the gate post, a bucket by the trough, cut grass, a smudge fire's ash. */
function touches(b: VoxelBuilder, r: Rand, src: Src): void {
  // Straw bedding under the shed: handfuls of strands crossing every way, old and trodden with a little fresh.
  for (let k = 0; k < 9; k++) {
    const x = -X1 + 0.5 + r() * (2 * X1 - 1);
    const z = ZB + 0.9 + r() * (LF - ZB - 0.6);
    // (not in the trough)
    if (Math.abs(x - TROUGH[0]) < 1.1 && Math.abs(z - TROUGH[2]) < 0.5) continue;
    const a = r() * Math.PI;
    for (let q = 0; q < 3; q++) {
      const c = r() < 0.6 ? tone(OLD_STRAW, r()) : tone(STRAW, r());
      turned(b, x + (r() - 0.5) * 0.25, 0.028 + q * 0.012, z + (r() - 0.5) * 0.25, 0.07 + r() * 0.05, 0.03, 0.55 + r() * 0.35, a + (q - 1) * 0.7 + (r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.2, c, 'mapLeaf', 0.88 + r() * 0.12, src);
    }
  }
  if (r() < 0.6) {
    // A coil of rope hung on the right gate post's outside.
    const x = GX + GATE;
    const c = tone([0xb8a47a, 0xa89468], r());
    for (const [dx, dy, sx, sy] of [
      [0, 0.16, 0.3, 0.05],
      [0, -0.16, 0.3, 0.05],
      [-0.13, 0, 0.05, 0.3],
      [0.13, 0, 0.05, 0.3],
    ])
      b.box(x + dx, 1.05 + dy, ZF + 0.13, sx, sy, 0.05, c, 'petal', { src });
  }
  if (r() < 0.6) {
    // A bucket by the trough: plastic, blue or red.
    const c = tone([0x2a6ac8, 0xc83a2a, 0x3a8a5a], r());
    const x = TROUGH[0] + 1.2;
    const z = TROUGH[2] + 0.35;
    b.box(x, 0.2, z, 0.34, 0.4, 0.34, c, 'petal', { src });
    b.box(x, 0.41, z, 0.38, 0.04, 0.38, c, 'petal', { src, shade: 1.08 });
    b.box(x, 0.39, z, 0.28, 0.02, 0.28, 0x3a5a6a, 'petal', { src });
  }
  if (r() < 0.55) {
    // A sheaf of fresh-cut grass, tied, by the hay rack.
    const x = X1 - 0.85 - r() * 0.6;
    const z = ZB + 1.15;
    const a = (r() - 0.5) * 0.6;
    turned(b, x, 0.12, z, 0.85, 0.22, 0.3, a, 0, 0, tone([0x4a8a34, 0x58963c, 0x3f7a2e], r()), 'mapLeaf', 1, src);
    turned(b, x, 0.12, z, 0.07, 0.24, 0.32, a, 0, 0, tone(TIE, r()), 'mapBark', 0.9, src);
    for (const s of [-1, 1]) turned(b, x + Math.cos(a) * s * 0.48, 0.14, z - Math.sin(a) * s * 0.48, 0.2, 0.26, 0.38, a, 0, 0, tone([0x58963c, 0x6aa040], r()), 'mapLeaf', 1.05, src);
  }
  if (r() < 0.5) {
    // The smudge fire's ash in the front corner, a few charred sticks across it.
    const x = (X1 - 0.75) * (r() < 0.5 ? 1 : -1);
    const z = ZF - 0.95;
    turned(b, x, 0.03, z, 0.62, 0.06, 0.5, r(), 0, 0, 0x8e8a84, 'mapRock', 1, src);
    turned(b, x, 0.07, z, 0.36, 0.05, 0.3, r(), 0, 0, 0x6e6a66, 'mapRock', 1, src);
    for (let k = 0; k < 3; k++) turned(b, x + (r() - 0.5) * 0.2, 0.1, z + (r() - 0.5) * 0.2, 0.05, 0.05, 0.55, r() * Math.PI, 0.08, 0, k ? 0x2a2420 : 0x3a2c22, 'mapBark', 1, src);
  }
}
