import { traceSource } from '../../../feedback/sourceTrace';
import type { VoxelBuilder } from '../../../voxel/VoxelBuilder';
import { PIECES, registerPieceModel } from '../pieces';
import { BAMBOO, EARTH, KRAMA, mix, post, POST, rng, stick, THATCH_DARK, THATCH_GREY, THATCH_MAT, THATCH_ROOF, thatchCap, thatchCourse, tone, turned, type Rand, type Src } from './_yardKit';

/**
 * A thatched shelter (ខ្ទម, build/pieces.ts `PIECES.shelter`): the shade hut of
 * Khmer fields and yards, open on every side: four hardwood posts dug into
 * the earth, plates and tie beams on them, a hip roof of bamboo rafters under
 * dried palm-leaf thatch laid in courses from the eaves up (its ragged cut
 * ends hanging at the eaves, bundles of thatch along the hips and the short
 * ridge, tied down with split bamboo; a plain Khmer roof: no horns, no
 * finials), and a plank bench along its back (`PIECES.shelter.seat`). Last
 * touches by the seed: a clay water pot with its coconut-shell dipper on a
 * bamboo stand, a krama knotted round a post, a woven basket hung from a
 * rafter, flip-flops by the bench.
 *
 * Made for him (2.4 m tall): the eaves' ragged ends at 2.45 m, the ridge a
 * man and a half over him, as the Kulen falls' picnic huts (hamlet/_knHut.ts).
 */

/** The posts' middles (m): half across, half deep (`PIECES.shelter.solids`). */
const PX = 1.6;
const PZ = 1.4;
/** The posts' tops; the tie beams sit on them (m). */
export const SHELTER_POST_TOP = 2.85;
const BEAM = 0.12;
/** The roof: its overhang past the posts, its pitch (rad), the thatch's thickness (m). */
const OVER = 0.55;
const PITCH = (30 * Math.PI) / 180;
const SLOPE = Math.tan(PITCH);
const THICK = 0.18;
/** Half the roof's extent at the eaves (m: `PIECES.shelter.w / 2`, `d / 2`). */
const EX = PX + OVER;
const EZ = PZ + OVER;
/** The thatch's underside at the posts' line (on the tie beams and rafters), and at the eaves (m). */
const UNDER_AT_POSTS = SHELTER_POST_TOP + BEAM + 0.08;
const Y0 = UNDER_AT_POSTS - OVER * SLOPE;
/** The thatch's underside `u` m in from the eaves (horizontally). */
const under = (u: number) => Y0 + u * SLOPE;
/** Half the ridge's length (the hip roof: the long sides' slopes meet along it). */
const RIDGE = EX - EZ;
/** The ridge cap's top (m): the piece's height (`PIECES.shelter.h`). */
export const SHELTER_TOP = under(EZ) + THICK + 0.3;

/** The bench along the back: its seat's top, its middle's depth (the seat: `PIECES.shelter.seat`). */
const SEAT_Y = PIECES.shelter.seat!.y;
const SEAT_Z = PIECES.shelter.seat!.z;
const PLANK = [0x8a6f55, 0x7d644c, 0x947a5e, 0x735c46];

registerPieceModel('shelter', (b, look) => {
  const r = rng(look.seed, 71);
  const src = traceSource();
  const corners: [number, number][] = [
    [-PX, -PZ],
    [PX, -PZ],
    [-PX, PZ],
    [PX, PZ],
  ];

  // ── Posts, dug in, the fresh earth round each foot ──
  for (const [x, z] of corners) post(b, x, z, -0.3, SHELTER_POST_TOP, 0.17, tone(POST, r()), 'mapBark', 0.94 + r() * 0.08, src, (r() - 0.5) * 0.02, (r() - 0.5) * 0.02);
  for (const [x, z] of corners) turned(b, x, 0.015, z, 0.42 + r() * 0.1, 0.05, 0.38 + r() * 0.1, r() * 1.5, 0, 0, tone(EARTH, r()), 'mapRock', 0.95, src);

  // ── Plates along the long sides, tie beams across on them ──
  for (const z of [-PZ, PZ]) b.box(0, SHELTER_POST_TOP - 0.06, z, 2 * PX + 0.36, BEAM, 0.14, tone(POST, r()), 'mapBark', { src, shade: 0.95 });
  for (const x of [-PX, PX]) b.box(x, SHELTER_POST_TOP + BEAM / 2 - 0.01, 0, 0.14, BEAM, 2 * PZ + 0.36, tone(POST, r()), 'mapBark', { src, shade: 0.98 });

  bench(b, r, traceSource());
  frame(b, r, traceSource());
  // (the thatch its own stream: its leaves never change the last touches)
  thatch(b, rng(look.seed, 72), traceSource());
  touches(b, r, traceSource());
});

/** The plank bench along the back: two trestles, two planks; its top at the seat. */
function bench(b: VoxelBuilder, r: Rand, src: Src): void {
  const z0 = SEAT_Z - 0.25;
  const z1 = SEAT_Z + 0.25;
  const top = SEAT_Y;
  for (const x of [-1.12, 1.12]) {
    for (const z of [z0 + 0.07, z1 - 0.07]) post(b, x, z, -0.1, top - 0.11, 0.08, tone(POST, r()), 'mapBark', 0.95, src);
    b.box(x, top - 0.08, SEAT_Z, 0.09, 0.07, 0.52, tone(POST, r()), 'mapBark', { src });
  }
  for (const [a, c] of [
    [z0, SEAT_Z - 0.01],
    [SEAT_Z + 0.01, z1],
  ]) {
    b.box((r() - 0.5) * 0.04, top - 0.03, (a + c) / 2, 2.8, 0.06, c - a, tone(PLANK, r()), 'mapBark', { src, shade: 0.95 + r() * 0.08 });
  }
}

/** The roof's frame: the hip rafters from the eaves' corners to the ridge's ends, the jack rafters, the ridge pole, battens. */
function frame(b: VoxelBuilder, r: Rand, src: Src): void {
  const w = 0.085;
  const sink = 0.05;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) stick(b, sx * EX, under(0) - sink, sz * EZ, sx * RIDGE, under(EZ) - sink, 0, w, w, tone(BAMBOO, r()), 'mapBark', 0.95, src, 0.06);
  // Front and back: rafters up to the ridge (the middle) or to a hip (jacks).
  for (const sz of [-1, 1])
    for (const x of [-1.15, -0.55, 0, 0.55, 1.15]) {
      const u1 = Math.min(EZ, EX - Math.abs(x));
      stick(b, x, under(0) - sink, sz * EZ, x, under(u1) - sink, sz * (EZ - u1), w, w, tone(BAMBOO, r()), 'mapBark', 0.95, src);
    }
  // The gable-less ends: jacks up to the hips.
  for (const sx of [-1, 1])
    for (const z of [-0.75, 0, 0.75]) {
      const u1 = EZ - Math.abs(z);
      stick(b, sx * EX, under(0) - sink, z, sx * (EX - u1), under(u1) - sink, z, w, w, tone(BAMBOO, r()), 'mapBark', 0.95, src);
    }
  b.box(0, under(EZ) - sink, 0, 2 * RIDGE + 0.5, 0.1, 0.1, tone(BAMBOO, r()), 'mapBark', { src });
  // Battens round the roof (the thatch is tied to them).
  for (const u of [0.25, 0.95, 1.55]) {
    const y = under(u) - 0.03;
    for (const sz of [-1, 1]) b.box(0, y, sz * (EZ - u), 2 * (EX - u), 0.045, 0.05, tone(BAMBOO, r()), 'mapBark', { src, shade: 0.9 });
    for (const sx of [-1, 1]) b.box(sx * (EX - u), y, 0, 0.05, 0.045, 2 * (EZ - u), tone(BAMBOO, r()), 'mapBark', { src, shade: 0.9 });
  }
}

/**
 * The thatch: courses of dried palm leaf from the eaves up, all four slopes a course at a time (as it is laid), each
 * course one band of its own tone over the one below, its leaves down the slope over it, their ends ragged past its
 * lower edge; the eave's course thicker, its leaf tips hanging (`thatchCourse`). Then the bundles along the hips and
 * the cap over the short ridge, tied down with split bamboo.
 */
function thatch(b: VoxelBuilder, r: Rand, src: Src): void {
  const courses = 5;
  const cw = EZ / courses;
  const slab = (cw / Math.cos(PITCH)) * 1.45;
  const bare = cw / Math.cos(PITCH);
  for (let k = 0; k < courses; k++) {
    const u = (k + 0.5) * cw;
    const eave = k === 0;
    const th = eave ? THICK * 1.35 : THICK;
    // (each course a little over the one below; the eave's thicker course its underside on the battens still)
    const y = under(u) + th / 2 / Math.cos(PITCH) + 0.012 * k;
    const dark = k % 2 === 1 ? 0.92 : 1;
    const leaves = { every: 0.17, hang: eave ? ([0.05, 0.16] as const) : ([0.02, 0.09] as const), tips: eave ? 0.22 : 0, tipLen: [0.1, 0.26] as const };
    // (the leaves inside the hips' bundles: the hip line at this course's lower edge, less half a bundle)
    const inX = EX - k * cw - 0.14;
    const inZ = EZ - k * cw - 0.14;
    // Front and back (along x), then the two ends (along z).
    for (const sz of [-1, 1]) thatchCourse(b, r, 'x', -(EX - u + 0.1), EX - u + 0.1, sz * (EZ - u), y, slab, th, PITCH, sz, dark, bare, { ...leaves, from: -inX, to: inX }, src);
    for (const sx of [-1, 1]) thatchCourse(b, r, 'z', -(EZ - u + 0.1), EZ - u + 0.1, sx * (EX - u), y, slab, th, PITCH, sx, dark, bare, { ...leaves, from: -inZ, to: inZ }, src);
  }
  // Bundles rolled along the hips (turned on their edge: a round bundle, not a board), each length its own tone and
  // a hand off true. (over the courses: each stands a little proud of the roof's plane at its lower edge)
  const lift = THICK + 0.13;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const n = 4;
      for (let i = 0; i < n; i++) {
        const t0 = Math.max(0, i / n - 0.04);
        const t1 = Math.min(1, (i + 1) / n + 0.04);
        const p = (t: number) => [sx * (EX + (RIDGE - EX) * t), under(EZ * t) + lift + (r() - 0.5) * 0.03, sz * EZ * (1 - t)] as const;
        const [ax, ay, az] = p(t0);
        const [bx, by, bz] = p(t1);
        const c = r() < 0.35 ? tone(THATCH_GREY, r()) : tone(THATCH_ROOF, r());
        const d = 0.2 + r() * 0.04;
        stick(b, ax, ay, az, bx, by, bz, d, d, c, THATCH_MAT, 0.88 + r() * 0.1, src, 0.04, Math.PI / 4 + (r() - 0.5) * 0.2);
      }
      // (its leaves' ends at the eave's corner)
      const c = tone(THATCH_DARK, r());
      for (const o of [-0.09, 0.09]) turned(b, sx * (EX + 0.02) + o * sz, under(0) + 0.06, sz * (EZ + 0.02) - o * sx, 0.1, 0.05, 0.3, Math.atan2(sx, sz), -0.9, 0, c, THATCH_MAT, 0.9, src);
    }
  // Split bamboo ties over the hips' bundles.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      for (const t of [0.3, 0.65]) b.box(sx * (EX + (RIDGE - EX) * t), under(EZ * t) + lift + 0.06, sz * EZ * (1 - t), 0.3, 0.06, 0.3, tone(BAMBOO, r()), 'mapBark', { src, ry: sx * sz * (Math.PI / 4), shade: 0.9 });
  // The cap over the short ridge, last: folded over it, tied at both ends.
  thatchCap(b, r, -RIDGE - 0.2, RIDGE + 0.2, 0, SHELTER_TOP - 0.02, PITCH, 0.46, 0.14, 1, { tips: 0.2, ties: [-RIDGE - 0.08, RIDGE + 0.08] }, src);
}

/** The last touches, by the seed: the water pot on its stand, a krama round a post, a basket hung up, flip-flops. */
function touches(b: VoxelBuilder, r: Rand, src: Src): void {
  const side = r() < 0.5 ? 1 : -1;
  if (r() < 0.75) waterPot(b, r, side * (PX - 0.42), PZ - 0.3, src);
  if (r() < 0.55) {
    // A krama knotted round a front post at his shoulder, its ends hanging.
    const [c, w] = KRAMA[Math.floor(r() * KRAMA.length) % KRAMA.length];
    const x = -side * PX;
    const z = PZ;
    b.box(x, 1.95, z, 0.24, 0.1, 0.24, c, 'petal', { src });
    b.box(x + side * 0.06, 1.7, z + 0.13, 0.12, 0.42, 0.03, c, 'petal', { src, rz: side * 0.15 });
    b.box(x + side * 0.06, 1.62, z + 0.145, 0.12, 0.035, 0.01, w, 'petal', { src, rz: side * 0.15 });
    b.box(x + side * 0.06, 1.75, z + 0.145, 0.12, 0.035, 0.01, w, 'petal', { src, rz: side * 0.15 });
  }
  if (r() < 0.4) {
    // A woven bamboo basket hung from the ridge's rafter on a cord.
    // (its bottom over his head: he is 2.4 m tall)
    const by = 2.62;
    const bx = (r() - 0.5) * 0.5;
    const hook = under(EZ) - 0.1;
    b.box(bx, (hook + by + 0.17) / 2, 0, 0.02, hook - by - 0.17, 0.02, 0xc8bc98, 'petal', { src });
    b.box(bx, by, 0, 0.36, 0.26, 0.36, mix(tone(BAMBOO, r()), 0x8a7048, 0.3), 'mapBark', { src, ry: 0.3 });
    b.box(bx, by + 0.15, 0, 0.4, 0.05, 0.4, tone(BAMBOO, r()), 'mapBark', { src, ry: 0.3 });
  }
  if (r() < 0.45) {
    const c = tone([0x2a5aa0, 0x3a3a3a, 0xc8302a, 0x2e8a5a], r());
    const x = (r() - 0.5) * 1.2;
    for (const s of [-1, 1]) turned(b, x + s * 0.09, 0.012, SEAT_Z + 0.5, 0.1, 0.024, 0.27, s * 0.15 + (r() - 0.5) * 0.3, 0, 0, c, 'petal', 1, src);
  }
}

/** A clay water pot (ក្អម) with its lid and a coconut-shell dipper, on a little bamboo stand. */
function waterPot(b: VoxelBuilder, r: Rand, x: number, z: number, src: Src): void {
  const top = 0.55;
  for (const [dx, dz] of [
    [-0.2, -0.2],
    [0.2, -0.2],
    [-0.2, 0.2],
    [0.2, 0.2],
  ])
    post(b, x + dx, z + dz, -0.05, top, 0.06, tone(BAMBOO, r()), 'mapBark', 0.92, src);
  b.box(x, top + 0.02, z, 0.52, 0.04, 0.52, tone(BAMBOO, r()), 'mapBark', { src });
  const clay = tone([0x9a5a3a, 0x8a4e32, 0xa66242], r());
  b.box(x, top + 0.08, z, 0.3, 0.08, 0.3, clay, 'mapStone', { src, shade: 0.9 });
  b.box(x, top + 0.27, z, 0.44, 0.32, 0.44, clay, 'mapStone', { src });
  b.box(x, top + 0.46, z, 0.26, 0.08, 0.26, clay, 'mapStone', { src, shade: 1.05 });
  b.box(x, top + 0.52, z, 0.3, 0.035, 0.3, mix(clay, 0x5a3a28, 0.4), 'mapStone', { src });
  // (the dipper: half a coconut shell on a stick handle, laid on the lid)
  b.box(x + 0.05, top + 0.58, z, 0.14, 0.07, 0.14, 0x5a3a24, 'mapBark', { src });
  b.box(x - 0.12, top + 0.565, z + 0.04, 0.3, 0.025, 0.025, tone(BAMBOO, r()), 'mapBark', { src, ry: 0.3 });
}
