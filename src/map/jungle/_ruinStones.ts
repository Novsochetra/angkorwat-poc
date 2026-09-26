import { traceSource } from '../../feedback/sourceTrace';
import { hash3, valueNoise3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { BAYON_STONE, bondTone, carveFace, courseShade, FACE_SMALL, FACE_TINY, fillBox, tone, type FaceTemplate, type StoneTones } from '../landmarks/_faces';
import { CANOPY, chip, drapeRoot, FIG_BARK, growTree, LATERITE, limb, overgrow, pickOf, RUIN_STONE, TREE_BARK } from '../landmarks/_ruin';
import { mossOn, plantsAround, toss } from './_ruinBits';
import { fallenTurn, placePiece, type SiteFrame } from './_ruinFrame';

/**
 * The jungle's lost stones (site space: +z toward the trail, see _ruinFrame.ts):
 *
 * - the fallen face: a Bayon tower's face that came down and lies tipped
 *   back in the ferns, gazing at the sky, moss on its brow and cheeks, a fig
 *   root over its shoulder; a second, broken head on its side beside it;
 * - the root gate: a small laterite gopura on the back trail, its roof held
 *   in the pale roots of a silk-cotton tree (Ta Prohm); the trail runs
 *   through its passage;
 * - the carved lintel: a stretch of enclosure wall, half fallen, round a
 *   doorway whose sandstone lintel still shows its naga garland and Kala
 *   face, apsaras dancing in panels either side.
 */

/** Fallen stone lies in the damp: darker, greener than the Bayon's towers. */
const FALLEN: StoneTones = {
  ...BAYON_STONE,
  wall: [0x625e57, 0x5b5751, 0x69645c, 0x57534d],
  mid: [0x77726a, 0x6f6a62, 0x7e7970],
  moss: [0x4c6a2a, 0x587a31, 0x436026, 0x62843a],
};

/**
 * A head from a face tower (0.5 m cells, head space: i across, j up, k out
 * of the face): the face carved on a slab `depth` cells thick, the stub of
 * the crown's first tier on top, broken off ragged at the back and top.
 * `keepRows` cuts it across below that template row (a broken head).
 */
function headSlab(face: FaceTemplate, o: { depth: number; seed: number; keepRows?: number; root?: boolean }): VoxelBuilder {
  const b = new VoxelBuilder();
  const g = b.grid({ cell: 0.5, origin: [-0.25, 0, -0.25], mat: 'mapStone', jitter: 0.05, ao: 0.34, seed: o.seed });
  const T = FALLEN;
  const half = (face.width - 1) / 2;
  const back = half - o.depth;
  const keep = new Set<string>();
  const top = face.height + 2;
  // The slab and the first tier's stub over it.
  fillBox(g, -half, half, 0, face.height, back, half, (i, j, k) => bondTone(T.wall, i, j, k, o.seed), 'mapStone', (_i, j) => courseShade(j));
  fillBox(g, -half, half, face.height + 1, face.height + 1, back, half, (i, j, k) => tone(T.ledge, i, j, k, o.seed + 1));
  fillBox(g, -half + 1, half - 1, top, top + 1, back + 1, half - 1, (i, j, k) => bondTone(T.wall, i, j, k, o.seed + 2));
  carveFace(g, { ci: 0, ck: 0, half, j0: 0, side: 'S', face, tones: T, seed: o.seed + 3, keep });
  // Broken: the back and the crown ragged, the corners knocked off.
  const gone: [number, number, number][] = [];
  g.forEach((i, j, k) => {
    const n = valueNoise3(i / 2.2, j / 2.2, k / 2, o.seed + 4);
    if (k <= back + 1 && n < 0.45 - (k - back) * 0.2) gone.push([i, j, k]);
    else if (j >= top - 1 && n + 0.2 * Math.abs(i) / half < 0.62) gone.push([i, j, k]);
    else if (o.keepRows !== undefined && j > o.keepRows + (valueNoise3(i / 1.5, 0, k / 1.5, o.seed + 5) - 0.5) * 3) gone.push([i, j, k]);
  });
  for (const [i, j, k] of gone) g.delete(i, j, k);
  chip(g, { seed: o.seed + 6, corner: 0.3, edge: 0.08, keep });
  // Moss on what faces the sky once it lies tipped back: the face, the crown.
  mossOn(g, { seed: o.seed + 7, amount: 0.12, dirs: [[0, 0, 1]], moss: T.moss, scale: 3.5 });
  mossOn(g, { seed: o.seed + 8, amount: 0.7, dirs: [[0, 1, 0]], moss: T.moss, scale: 3 });
  // A fig root over its left shoulder and down the side.
  if (o.root) {
    const edge = -half - 1;
    limb(g, [edge + 2, top + 1, back + 1], [edge, top - 2, half - 1], { seed: o.seed + 9, thick: 2 });
    limb(g, [edge, top - 2, half - 1], [edge, 2, half - 2], { seed: o.seed + 10, thick: 2 });
    limb(g, [edge, top - 3, half - 1], [edge + 3, face.height - 1, half + 1], { seed: o.seed + 11 });
  }
  g.commit();
  return b;
}

/**
 * The fallen face (a clearing on the Bayon rim trail, where it turns). The
 * big head lies tipped back against a heap of its own tower's stones, chin
 * toward the trail; the broken one lies on its side to its right.
 */
export function fallenFace(fr: SiteFrame): void {
  const src = traceSource();
  // The big head: FACE_SMALL at 0.5 m (5.5 m across, 8 m tall), tipped back ≈ 45°, its chin sunk in the ground.
  placePiece(headSlab(FACE_SMALL, { depth: 3, seed: 301, root: true }), fr.b, [-0.6, -1.5, 0.4], fallenTurn(0.78, 0.12, 0.2));
  // The broken one: its lower face (up to the eyes), face up, half sunk.
  placePiece(headSlab(FACE_TINY, { depth: 3, seed: 331, keepRows: 7 }), fr.b, [5.4, -1.1, -1.5], fallenTurn(1.3, 0.28, -0.6));

  // Stones of the tower heaped behind the big head, and strewn about.
  const T = FALLEN;
  toss(fr, -0.5, -6.5, 12, 2.6, 1, T.wall, 1.1);
  toss(fr, 3.5, -4.5, 6, 2, 2, T.wall, 0.9);
  toss(fr, -5, 1.5, 5, 2.2, 3, T.wall, 0.8);
  toss(fr, 2.5, 3.5, 3, 1.4, 4, T.wall, 0.7);
  // A carved block among them: a piece of the diadem.
  fr.b.box(-4.2, 0.35, -2.8, 1.6, 0.8, 0.9, T.ledge[0], 'mapStone', { src, ry: 0.5, rz: 0.12 });
  fr.b.box(-4.1, 0.85, -2.7, 0.5, 0.4, 0.5, T.bright[1], 'mapStone', { src, ry: 0.5, rz: 0.12 });

  // The old fig behind, whose roots have reached the head, and the ferns.
  const tg = fr.grid(1, { seed: 311, mat: 'mapBark', at: [0, 0, 0] });
  fr.ghostLand(tg, 1, -9, 9, -10, 8);
  growTree(tg, -6, fr.landRow(-6, -7, 1), -7, { trunk: 9, radius: 6.5, seed: 312, thick: true, bark: FIG_BARK, leaf: CANOPY, lean: [1, 1], squash: 0.5 });
  growTree(tg, 7, fr.landRow(7, -6, 1), -6, { trunk: 7, radius: 4.5, seed: 313, bark: TREE_BARK, lean: [0, -1] });
  tg.commit();

  const sg = fr.grid(0.5, { seed: 321, mat: 'mapLeaf' });
  const row = (i: number, k: number) => fr.landRow(i * 0.5, k * 0.5, 0.5);
  // Roots from the fig over the ground to the head and the heap.
  for (const [a, b, s] of [
    [[-11, -14], [-5, -8], 0],
    [[-11, -13], [-13, -3], 1],
    [[-12, -15], [-5, -19], 2],
    [[-13, -13], [-18, -8], 3],
  ] as [[number, number], [number, number], number][]) {
    limb(sg, [a[0], row(a[0], a[1]), a[1]], [b[0], row(b[0], b[1]), b[1]], { seed: 322 + s, thick: 2 });
  }
  sg.commit();
  // Ferns and elephant ears round the stones.
  plantsAround(fr, { n: 46, r0: 2.5, r1: 10.5, seed: 323 });
}

// ── The root gate ────────────────────────────────────────────────────────

/** The silk-cotton tree's bark: pale silver grey, its roots pour over the stone like wax (Ta Prohm). */
const SILK = [0xc6c2b6, 0xbcb8ac, 0xcfcbbf, 0xb3afa3];

/** Sandstone of the gate's door frames and pediments: warmer, lighter than the laterite. */
const SAND = [0x9a8a72, 0x928269, 0xa3937a, 0x8a7b64];
const SAND_DARK = [0x5e5446, 0x574e41, 0x655a4b];

/**
 * The root gate on the back trail: a gopura of laterite with sandstone door
 * frames, a passage 3 m wide and 4 m high through it (the trail), a
 * pavilion roof of corbelled tiers, half fallen, and low wings with
 * balustered windows either side (the left one's end come down). A
 * silk-cotton tree sits on the roof, its pale roots poured down the walls
 * to the ground; a smaller fig grips the right wing. 1 m cells, i across the
 * trail, k along it (+k the facing), j up.
 */
export function rootGate(fr: SiteFrame): void {
  const g = fr.grid(1, { seed: 401, ao: 0.34 });
  const src = traceSource();
  const R = RUIN_STONE;
  const wall = (i: number, j: number, k: number) => (j < 2 ? bondTone(LATERITE, i, j, k, 3) : bondTone(R.wall, i, j, k, 3));
  const ledge = (i: number, j: number, k: number) => tone(R.ledge, i, j, k, 4);
  const deep = (i: number, j: number, k: number) => tone(R.deep, i, j, k, 5);
  const sand = (i: number, j: number, k: number) => tone(SAND, i, j, k, 6);
  const put = (i: number, j: number, k: number, color: number, shade = 1) => g.put(i, j, k, { color, mat: 'mapStone', shade });
  fr.ghostLand(g, 1, -9, 9, -7, 7);
  /** The passage: |i| ≤ 1, rows 0‥3, all along. */
  const passage = (i: number, j: number) => Math.abs(i) <= 1 && j <= 3;

  // Plinth, one row, all round (not in the passage).
  fillBox(g, -7, 7, 0, 0, -4, 4, (i, j, k) => (passage(i, j) || (Math.abs(i) > 4 && Math.abs(k) > 3) ? null : tone(LATERITE, i >> 1, j, k >> 1, 7)), 'mapStone', () => 0.94);
  // Pavilion: a block 7 × 7, 6 rows, the passage through it.
  fillBox(g, -3, 3, 1, 6, -3, 3, (i, j, k) => (passage(i, j) ? null : j === 6 ? ledge(i, j, k) : wall(i, j, k)), 'mapStone', (_i, j) => courseShade(j));
  // Door frames front and back: sandstone jambs, lintel and a stepped pediment.
  for (const k of [-4, 4]) {
    for (let j = 1; j <= 4; j++) for (const i of [-2, 2]) put(i, j, k, sand(i, j, k));
    for (let i = -2; i <= 2; i++) put(i, 4, k, sand(i, 4, k), 1.05);
    fillBox(g, -3, 3, 5, 5, k, k, (i, j, kk) => (Math.abs(i) === 3 ? null : sand(i, j, kk)));
    fillBox(g, -2, 2, 6, 6, k, k, (i, j, kk) => (i === 0 ? tone(SAND_DARK, i, j, kk, 8) : sand(i, j, kk)));
    fillBox(g, -1, 1, 7, 7, k, k, (i, j, kk) => sand(i, j, kk));
    put(0, 8, k, tone(R.bright, 0, 8, k, 9));
    // The passage's corbelled ceiling shows as dark in the doorway.
    for (let i = -1; i <= 1; i++) put(i, 4, k + Math.sign(-k) * 1, deep(i, 4, k), 0.8);
  }
  // Roof: corbelled tiers, a lotus bud; the back left of it has fallen in.
  fillBox(g, -4, 4, 7, 7, -4, 4, (i, j, k) => (Math.abs(i) === 4 && Math.abs(k) === 4 ? null : ledge(i, j, k)));
  fillBox(g, -3, 3, 8, 9, -3, 3, (i, j, k) => (Math.abs(i) === 3 && Math.abs(k) === 3 ? null : j === 9 ? ledge(i, j, k) : wall(i, j, k)));
  fillBox(g, -2, 2, 10, 11, -2, 2, (i, j, k) => (Math.abs(i) === 2 && Math.abs(k) === 2 ? null : j === 11 ? ledge(i, j, k) : tone(R.wall, i, j, k, 10)));
  fillBox(g, -1, 1, 12, 13, -1, 1, (i, j, k) => (j === 13 && Math.abs(i) + Math.abs(k) === 2 ? null : tone(R.light, i, j, k, 11)));
  put(0, 14, 0, tone(R.bright, 0, 14, 0, 12));
  // Wings: 3 wide, 4 rows, a balustered window on each face; the left end fallen.
  for (const s of [-1, 1]) {
    const [a, b] = [Math.min(s * 4, s * 7), Math.max(s * 4, s * 7)];
    fillBox(g, a, b, 1, 4, -2, 2, (i, j, k) => (j === 4 ? ledge(i, j, k) : wall(i, j, k)), 'mapStone', (_i, j) => courseShade(j));
    fillBox(g, a, b, 5, 5, -1, 1, (i, j, k) => tone(R.wall, i, j, k, 13));
    for (const k of [-2, 2]) for (let j = 2; j <= 3; j++) for (const i of [s * 5, s * 6]) put(i, j, k, (i + j) & 1 ? sand(i, j, k) : deep(i, j, k), (i + j) & 1 ? 1 : 0.8);
  }
  // Collapse: the left wing's end and the pavilion roof's back-left corner.
  const cut = (i: number, j: number, k: number) => {
    const n = valueNoise3(i / 2, j / 2, k / 2, 14);
    if (i <= -5 && j > 1 + (i + 7) * 0.8 + n * 1.5) return true;
    if (j >= 9 && i < 0 && k < 0 && n < 0.55) return true;
    return false;
  };
  const gone: [number, number, number][] = [];
  g.forEach((i, j, k, c) => {
    if (!c.ghost && cut(i, j, k)) gone.push([i, j, k]);
  });
  for (const [i, j, k] of gone) g.delete(i, j, k);
  chip(g, { seed: 15, corner: 0.25, edge: 0.06, from: 1 });

  // ── The silk-cotton tree on the roof: its trunk over the back left, roots poured down ─
  const t0: [number, number, number] = [-2, 8, -2];
  const bark = (i: number, j: number, k: number, shade = 1) => g.put(i, j, k, { color: pickOf(SILK, i, j, k, 16), mat: 'mapBark', shade: shade * (0.9 + 0.1 * hash3(i, j, k, 17)) });
  for (let j = t0[1]; j <= t0[1] + 15; j++) {
    const lean = Math.floor(Math.max(0, j - t0[1] - 5) / 5);
    const w = j < t0[1] + 8 ? 3 : 2;
    for (let di = 0; di < w; di++) for (let dk = 0; dk < w; dk++) bark(t0[0] + di - lean, j, t0[2] + dk - lean);
  }
  // Buttresses flaring from its foot.
  for (const [di, dk, h] of [
    [-1, 1, 3],
    [3, 1, 2],
    [1, -1, 3],
    [1, 3, 2],
    [-1, -1, 1],
    [3, 3, 1],
  ])
    for (let j = t0[1]; j < t0[1] + h; j++) bark(t0[0] + di, j, t0[2] + dk, 0.95);
  // Buttress roots: from the trunk's foot out over the roof and down every face.
  const roots: [[number, number], [number, number], number][] = [
    [[-3, -3], [-1, 0], 3],
    [[-2, -3], [0, -1], 3],
    [[-3, 0], [-1, 0], 2],
    [[0, -3], [0, -1], 2],
    [[1, -2], [1, 0], 2],
    [[-2, 1], [0, 1], 2],
    [[1, 0], [1, 0], 2],
    [[-3, 1], [-1, 0], 2],
    [[0, 1], [0, 1], 1],
    [[2, -3], [0, -1], 2],
  ];
  roots.forEach(([[i, k], dir, thick], n) => drapeRoot(g, [i, t0[1], k], dir, { floor: 0, seed: 20 + n, thick: Math.min(3, thick + 1), crawl: 2 + (n % 3), bark: SILK }));
  // A smaller fig on the right wing, its roots down the front and the end.
  for (let j = 6; j <= 11; j++) for (let di = 0; di <= 1; di++) bark(6 + di - (j > 9 ? 1 : 0), j, -1 + di, 0.95);
  for (const [[i, k], dir, thick] of [
    [[6, 1], [0, 1], 2],
    [[8, -1], [1, 0], 2],
    [[6, -2], [0, -1], 1],
  ] as [[number, number], [number, number], number][])
    drapeRoot(g, [i, 5, k], dir, { floor: 0, seed: 32 + i + k, thick, crawl: 2, bark: SILK });
  // The passage (the trail) stays clear, and the lane either side of it.
  const clear: [number, number, number][] = [];
  g.forEach((i, j, k, c) => {
    if (!c.ghost && passage(i, j) && Math.abs(k) <= 8) clear.push([i, j, k]);
  });
  for (const [i, j, k] of clear) g.delete(i, j, k);

  overgrow(g, {
    seed: 35,
    top: (_i, j) => (j < 2 ? 0.35 : 0.36),
    side: (_i, j) => (j < 3 ? 0.22 : 0.08),
    vines: 0.06,
    vineLen: [2, 5],
    cushion: 0.2,
    moss: R.moss,
  });
  // (vines hang in the doorways: out of the passage)
  const vines: [number, number, number][] = [];
  g.forEach((i, j, k, c) => {
    if (c.mat === 'mapLeaf' && passage(i, j)) vines.push([i, j, k]);
  });
  for (const [i, j, k] of vines) g.delete(i, j, k);

  // Crowns: the silk-cotton's high and wide over it all, the fig's small.
  const [ci, ck] = [t0[0] - 3, t0[2] - 3];
  limb(g, [ci + 1, t0[1] + 15, ck + 1], [ci - 5, t0[1] + 18, ck + 2], { seed: 36, thick: 2, bark: SILK });
  limb(g, [ci + 1, t0[1] + 15, ck + 1], [ci + 4, t0[1] + 18, ck - 4], { seed: 37, thick: 2, bark: SILK });
  limb(g, [ci + 1, t0[1] + 14, ck + 1], [ci + 5, t0[1] + 17, ck + 5], { seed: 38, bark: SILK });
  growTree(g, ci, t0[1] + 16, ck, { trunk: 1, radius: 7.5, squash: 0.42, seed: 39, bark: SILK, leaf: CANOPY });
  growTree(g, 5, 11, -2, { trunk: 1, radius: 3.2, squash: 0.6, seed: 40, bark: SILK, leaf: CANOPY, lean: [1, 0] });
  g.commit();

  // Stones of the fallen wing and roof.
  const lane = (x: number, _z: number) => Math.abs(x) < 2.5;
  toss(fr, -8.5, 0.5, 9, 2.2, 41, LATERITE, 1, lane);
  toss(fr, -4.5, -6, 5, 2, 42, R.wall, 0.9, lane);
  toss(fr, 5, 6, 3, 1.5, 43, LATERITE, 0.8, lane);
  fr.b.box(-6.5, 0.4, 5.2, 2.2, 0.8, 1, SAND[0], 'mapStone', { src, ry: 0.3, rx: 0.08 });
  // Ferns along its foot, off the trail.
  plantsAround(fr, { n: 40, r0: 3, r1: 10, seed: 44, keepOut: (x, z) => Math.abs(x) < 2.6 || (Math.abs(x) < 8 && Math.abs(z) < 5) });
}

// ── The carved lintel ────────────────────────────────────────────────────

/**
 * A lintel's carving (0.25 m cells, 18 × 4, seen from the front, top row
 * first): '.' the ground of the lintel, 'o' the naga garland in relief,
 * 'K' the Kala face in relief, 'e' its eyes and mouth (deep), 'p' the
 * pendant leaves under the garland, 'n' the naga heads rising at the ends.
 */
const LINTEL = [
  'nn..o.......o..nn', //
  'nno..oo.K..oo..onn',
  'nn.p...oeKeo..p.nn',
  'n..p.p.oKeK.p.p..n',
].map((r) => r.padEnd(18, '.').slice(0, 18));

/**
 * An apsara in relief (0.25 m cells, 5 × 10, top row first): 'h' her
 * three-pointed crown, 'a' the dancer — hands raised to her shoulders
 * holding flowers, a narrow waist, the flared sampot, feet turned out.
 */
const APSARA = [
  'h.h.h', //
  '.hhh.',
  '..a..',
  'a.a.a',
  'aaaaa',
  '..a..',
  '.aaa.',
  'aaaaa',
  '.a.a.',
  'aa.aa',
];

/**
 * A stretch of enclosure wall on the trail round the back of Angkor Wat:
 * laterite, a sandstone doorway in the middle with colonnettes and its
 * carved lintel, an apsara panel either side, the coping gone. The right
 * part has come down in a heap; a fig sits on the left part, its roots
 * over both faces. A fallen pediment lies face up in front. 0.5 m cells, i
 * along the wall, k out of it (+k the trail), j up.
 */
export function ruinWall(fr: SiteFrame): void {
  const src = traceSource();
  const g = fr.grid(0.5, { seed: 501, ao: 0.34 });
  const R = RUIN_STONE;
  const wall = (i: number, j: number, k: number) => bondTone(LATERITE, i, j, k, 3);
  const sand = (i: number, j: number, k: number) => tone(SAND, i, j, k, 4);
  fr.ghostLand(g, 0.5, -20, 20, -8, 8);
  const floor = (i: number, k: number) => fr.landRow(i * 0.5, k * 0.5, 0.5);
  /** The doorway: |i| ≤ 2, up to row 5 (2.5 m × 3 m). */
  const door = (i: number, j: number) => Math.abs(i) <= 2 && j <= 5;
  // Standing height along the wall: whole near the door, low and ragged to the right.
  const height = (i: number) => {
    const n = valueNoise3(i / 3, 0, 0, 6);
    if (Math.abs(i) <= 5) return 9;
    if (i > 0) return Math.max(1, Math.round(7 - (i - 5) * 0.5 + (n - 0.5) * 3));
    return Math.max(3, Math.round(8 + (n - 0.5) * 3 - Math.max(0, -i - 14) * 0.8));
  };
  for (let i = -18; i <= 18; i++) {
    const h = height(i);
    for (let k = -2; k <= -1; k++) {
      const j0 = floor(i, k);
      for (let j = Math.min(0, j0); j < h; j++) if (!door(i, j)) g.put(i, j, k, { color: wall(i, j, k), mat: 'mapStone', shade: courseShade(j) });
    }
    // Footing course, one cell out on both faces.
    for (const k of [-3, 0]) if (!door(i, 0)) g.put(i, floor(i, k), k, { color: tone(LATERITE, i >> 1, 0, k, 7), mat: 'mapStone', shade: 0.93 });
  }
  // Door frame: sandstone jambs, colonnettes out front, the threshold.
  for (let j = 0; j <= 5; j++)
    for (const s of [-1, 1]) {
      for (let k = -2; k <= -1; k++) g.put(s * 3, j, k, { color: sand(s * 3, j, k), mat: 'mapStone' });
      // Colonnettes: rings every other row.
      g.put(s * 3, j, 0, { color: j % 2 ? tone(R.light, s, j, 0, 8) : sand(s * 3, j, 0), mat: 'mapStone', shade: j % 2 ? 1.05 : 0.95 });
    }
  for (let i = -2; i <= 2; i++) for (let k = -2; k <= 0; k++) g.put(i, 0, k, { color: sand(i, 0, k), mat: 'mapStone', shade: 0.92 });
  // Over the door: sandstone lintel block (rows 6‥7) across the jambs, carved below.
  for (let i = -4; i <= 4; i++) for (let j = 6; j <= 7; j++) for (let k = -2; k <= -1; k++) g.put(i, j, k, { color: sand(i, j, k), mat: 'mapStone' });
  // Apsara panels either side: a recessed dark panel (the figure is carved at 0.25 m).
  for (const s of [-1, 1]) for (let i = s * 5; Math.abs(i) <= 7; i += s) for (let j = 1; j <= 5; j++) g.put(i, j, -1, { color: tone(SAND_DARK, i, j, 0, 9), mat: 'mapStone', shade: 0.92 });

  // Collapse and weathering.
  chip(g, { seed: 10, corner: 0.28, edge: 0.07, from: 2 });

  // ── The fig on the left part, roots down both faces ─
  const f0: [number, number, number] = [-11, height(-11), -2];
  for (let j = f0[1]; j <= f0[1] + 11; j++) {
    const lean = Math.floor(Math.max(0, j - f0[1] - 3) / 4);
    for (let di = 0; di < 3; di++) for (let dk = 0; dk < 2; dk++) g.put(f0[0] + di - lean, j, f0[2] + dk + (lean >> 1), { color: pickOf(FIG_BARK, di, j, dk, 11), mat: 'mapBark', shade: 0.9 + 0.1 * hash3(di, j, dk, 12) });
  }
  const roots: [[number, number], [number, number], number][] = [
    [[-11, 0], [0, 1], 3],
    [[-9, 0], [0, 1], 2],
    [[-12, 0], [0, 1], 2],
    [[-11, -3], [0, -1], 3],
    [[-9, -3], [0, -1], 2],
    [[-13, -2], [-1, 0], 2],
    [[-8, -1], [1, 0], 2],
  ];
  roots.forEach(([[i, k], dir, thick], n) => drapeRoot(g, [i, f0[1], k], dir, { floor: floor(i, k), seed: 13 + n, thick, crawl: 3 + (n % 3) }));
  // (the door stays open)
  const inDoor: [number, number, number][] = [];
  g.forEach((i, j, k, c) => {
    if (!c.ghost && c.mat === 'mapBark' && Math.abs(i) <= 3) inDoor.push([i, j, k]);
  });
  for (const [i, j, k] of inDoor) g.delete(i, j, k);
  overgrow(g, {
    seed: 21,
    keep: undefined,
    top: () => 0.62,
    side: (_i, j) => (j < 4 ? 0.3 : 0.12),
    vines: 0.07,
    vineLen: [2, 6],
    cushion: 0.25,
    moss: R.moss,
  });
  growTree(g, f0[0] - 3, f0[1] + 12, f0[2] + 1, { trunk: 1, radius: 5, squash: 0.5, seed: 22, bark: FIG_BARK, leaf: CANOPY });
  g.commit();

  // ── The carving (0.25 m cells on the wall's front face, z −0.25: relief in row k 1, the boldest also in k 2) ─
  const cg = fr.grid(0.25, { seed: 523, at: [0.125, 0, -0.375] });
  // The lintel: rows 6‥7 (0.5 m) = rows 12‥15 here; 18 columns over x −2.25‥2.25.
  LINTEL.forEach((line, r) => {
    const j = 15 - r;
    for (let c = 0; c < 18; c++) {
      const ch = line[c];
      if (ch === '.') continue;
      const i = c - 9;
      const color = ch === 'e' ? tone(R.deep, i, j, 0, 24) : ch === 'K' ? tone(R.bright, i, j, 0, 25) : ch === 'p' ? tone(SAND_DARK, i, j, 0, 26) : tone(R.light, i, j, 0, 27);
      cg.put(i, j, 1, { color, mat: 'mapStone', shade: ch === 'e' ? 0.8 : 1 });
      if (ch === 'n' || ch === 'K') cg.put(i, j, 2, { color: tone(R.bright, i, j, 1, 28), mat: 'mapStone' });
    }
  });
  // Apsaras on the dark panels (0.5 m columns ±5‥±7: centred on x ±3), rows 2‥11 (y 0.5‥3).
  for (const s of [-1, 1])
    APSARA.forEach((line, r) => {
      const j = 11 - r;
      for (let c = 0; c < 5; c++) {
        if (line[c] === '.') continue;
        const i = (s > 0 ? 12 : -13) + (c - 2);
        cg.put(i, j, 1, { color: line[c] === 'h' ? tone(R.bright, i, j, 0, 29) : tone(SAND, i, j, 0, 30), mat: 'mapStone', shade: 1.05 });
      }
    });
  cg.commit();

  // A fallen pediment, face up in front, and the wall's stones in a heap.
  const ped = new VoxelBuilder();
  const pg = ped.grid({ cell: 0.5, origin: [-0.25, 0, -0.25], mat: 'mapStone', jitter: 0.05, ao: 0.3, seed: 531 });
  for (let r = 0; r < 5; r++)
    for (let i = -6 + r; i <= 6 - r; i++)
      for (let k = 0; k <= 1; k++) {
        const edge = Math.abs(i) === 6 - r || r === 4;
        // (its carving: a dark niche in the middle, a light frame round the edge)
        const niche = k === 1 && Math.abs(i) <= 1 && r >= 1 && r <= 2;
        pg.put(i, r, k, { color: niche ? tone(SAND_DARK, i, r, k, 32) : edge ? tone(R.light, i, r, k, 33) : sand(i, r, k), mat: 'mapStone' });
      }
  chip(pg, { seed: 34, corner: 0.35, edge: 0.1 });
  mossOn(pg, { seed: 35, amount: 0.45, dirs: [[0, 0, 1]], moss: R.moss, scale: 2 });
  pg.commit();
  placePiece(ped, fr.b, [3.2, -0.25, 3.6], fallenTurn(1.35, 0.1, 0.5));
  toss(fr, 9.5, 1, 14, 3, 36, LATERITE, 1);
  toss(fr, 12, -2.5, 8, 2.5, 37, LATERITE, 0.9);
  toss(fr, -1, 3.5, 3, 1.5, 38, SAND, 0.7, (x) => Math.abs(x) < 1.4);
  fr.b.box(6.2, 0.3, 2.4, 1.8, 0.6, 0.8, SAND[1], 'mapStone', { src, ry: -0.4 });

  // Ferns along both faces.
  plantsAround(fr, { n: 44, r0: 1.5, r1: 11, seed: 541, keepOut: (x, z) => (Math.abs(x) < 3 && z > -2.2) || (z > -2.2 && z < 0.6) });
}

