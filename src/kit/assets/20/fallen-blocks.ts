import { VoxelBuilder, type Surf } from '../../../voxel/VoxelBuilder';
import { BlockSet } from '../../BlockSet';
import { PieceBuilder } from '../../PieceBuilder';
import { rng, TEXEL, type Rng } from '../../shapes';
import { defineKitAsset, type KitPiece } from '../../types';
import {
  joints,
  MossLayer,
  mossOnTop,
  placeTilted,
  poreMarks,
  pores,
  PROP_BROKEN,
  PROP_RECESS,
  PROP_STONE,
  PROP_STONE_LOW,
  PROP_STONE_OLD,
  PROP_SURF,
  restOnGround,
  setColliders,
  tiltedColliders,
  tufts,
  type Tilt,
  type TuftSpot,
} from './_masonry-props';

/**
 * ② Fallen architectural blocks — what is left where a wall, a lintel or a
 * column came down, as on the §20 sheet: dressed blocks lying in stacks and
 * heaps (some tilted against the others), long lintel beams with their carved
 * mouldings, a wall fragment with a relief niche, column drums rolled apart;
 * chipped edges, moss on every top and tufts at their feet.
 *
 * Real sizes: wall blocks 0.5 × 0.5 × 1.0 m, lintels 1.2–2 m, drums ⌀ 0.5 m.
 * Carving is done on the 1/16 m texel grid, so a relief shows its pixels.
 */
const T = TEXEL;
/** Pores per m² of face, like the sheet's pocked blocks. */
const PORES = 8;

interface Ctx {
  p: PieceBuilder;
  /** Dressed blocks (axis-aligned). */
  set: BlockSet;
  /** Round stones (drums), apart so their carved-away corners don't mark the blocks next to them. */
  round: BlockSet;
  r: Rng;
  seed: number;
  spots: TuftSpot[];
}

type V3 = [number, number, number];

/** A dressed block from min/max corners; blocks on the ground are darker and grimier, and one in eight is an older, greyer stone. */
function block(ctx: Ctx, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, o: { surf?: Surf; broken?: readonly number[] | null } = {}): number {
  const low = y0 < 0.01;
  return ctx.set.add(x0, y0, z0, x1, y1, z1, ctx.r.pick(ctx.r.chance(0.12) ? PROP_STONE_OLD : low ? PROP_STONE_LOW : PROP_STONE), {
    surf: o.surf ?? (low ? PROP_SURF.low : PROP_SURF.top),
    broken: o.broken === undefined ? PROP_BROKEN : o.broken,
  });
}

/**
 * Centre x of a block (length `len`, height `h`) tipped by `angle` about Z so
 * that its raised end rests against the face at x = `face`: angle > 0 raises
 * its +X end (the face to its right), angle < 0 its −X end (the face to its left).
 */
function leanX(face: number, len: number, h: number, angle: number): number {
  const reach = (len / 2) * Math.cos(angle) + (h / 2) * Math.sin(Math.abs(angle));
  return angle > 0 ? face - reach : face + reach;
}

/** Keep erosion off the faces that will be carved (boxes: [x0, y0, z0, x1, y1, z1]). */
function spare(...boxes: [number, number, number, number, number, number][]): (x: number, y: number, z: number) => boolean {
  return (x, y, z) => !boxes.some(([x0, y0, z0, x1, y1, z1]) => x > x0 && x < x1 && y > y0 && y < y1 && z > z0 && z < z1);
}

/** The small stones (chips, wedges, under 0.35 m): erosion and bites would crumble them into odd shapes. */
const isSmall = ({ min, max }: { min: number[]; max: number[] }) => Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) < 0.35;

/** `where`, and never inside a small stone. */
function spareSmall(ctx: Ctx, where: (x: number, y: number, z: number) => boolean = () => true): (x: number, y: number, z: number) => boolean {
  const small = ctx.set.find(() => true).map((id) => ctx.set.boxOf(id)).filter(isSmall);
  return (x, y, z) => where(x, y, z) && !small.some(({ min, max }) => x > min[0] && x < max[0] && y > min[1] && y < max[1] && z > min[2] && z < max[2]);
}

/**
 * A block that came to rest at an angle: `size` (metres) turned and placed by
 * `tilt` (then dropped onto the ground), with its pores and the moss on its top.
 * It stays whole: the pattern is laid out per box, so the cells of a chipped
 * block would shear its texels once turned.
 */
function tiltedBlock(ctx: Ctx, size: V3, tilt: Tilt, surf: Surf = PROP_SURF.top): void {
  const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2];
  const local = new VoxelBuilder().box(0, 0, 0, size[0], size[1], size[2], ctx.r.pick(PROP_STONE), 'sandstone', { surf });
  const lo: V3 = [-hx, -hy, -hz];
  const hi: V3 = [hx, hy, hz];
  poreMarks(local, lo, hi, ctx.r, PORES, () => true);
  mossOnTop(local, lo, hi, 0.3, ctx.seed + ctx.r.int(0, 99));
  const t = restOnGround(tilt, lo, hi);
  placeTilted(ctx.p, local, t);
  tiltedColliders(ctx.p, t, lo, hi, size[0] > 1 ? 3 : 2);
}

/**
 * Cut a relief into the front (+Z) face at z = `face` (metres): `motif` rows
 * top first, from the top-left corner (x0, y1). `#` is left standing, `+`
 * cut one texel back, `.` is the niche ground, `depth` texels deep and dark
 * (a thin plate of shadowed stone); spaces leave the face alone. The motif
 * stays part of its block, so it reads as one carved stone. Carve after
 * eroding (erosion would nibble the motif away).
 */
function relief(ctx: Ctx, motif: readonly string[], x0: number, y1: number, face: number, depth = 2): void {
  const i0 = Math.round(x0 / T);
  const j1 = Math.round(y1 / T) - 1;
  const box = { min: [x0, y1 - motif.length * T, face - (depth + 1) * T] as V3, max: [x0 + motif[0].length * T, y1, face] as V3 };
  ctx.set.carve((x, y, z) => {
    const c = motif[j1 - Math.floor(y / T)]?.[Math.floor(x / T) - i0];
    return (c === '.' && z > face - (depth + 1) * T) || (c === '+' && z > face - T);
  }, box);
  // The niche ground: laid into the deepest cut layer (stone laid earlier keeps its cells).
  ctx.set.add(box.min[0], box.min[1], face - (depth + 1) * T, box.max[0], box.max[1], face - depth * T, ctx.r.pick(PROP_RECESS), { surf: PROP_SURF.clean, broken: null, shade: 0.8 });
}

/** A devata in her niche (10 × 14 texels): tiara, face, arms reaching out, a flaring pleated skirt. */
const DEVATA = [
  '..........',
  '....##....',
  '...####...',
  '...####...',
  '....##....',
  '..######..',
  '.+.####.+.',
  '.+.####.+.',
  '...####...',
  '..######..',
  '..#+##+#..',
  '.########.',
  '..##..##..',
  '..........',
];

/** A frieze of rosettes standing out of a sunk band (4 texels high, `n` long). */
function frieze(n: number): string[] {
  const rows = ['..#..', '.###.', '.###.', '..#..'];
  return rows.map((row) => Array.from({ length: n }, (_, i) => (i % 6 === 5 ? '.' : row[i % 6])).join(''));
}

/** A small lotus rosette (5 × 5). */
const ROSETTE = ['..#..', '.###.', '##+##', '.###.', '..#..'];

/** A window fragment: three lathe-turned balusters with their rings (10 × 8). */
const BALUSTERS = ['..........', '.##.##.##.', '.++.++.++.', '.##.##.##.', '.##.##.##.', '.++.++.++.', '.##.##.##.', '..........'];

/**
 * A column drum or shaft: an upright or lying cylinder of radius `rad` (metres),
 * `len` long, cut from the round set; `rings` (metres along the axis from its
 * start) stand one texel proud like the turned mouldings of Khmer colonnettes;
 * `top` breaks an upright drum off at a height that varies across it.
 */
function drum(ctx: Ctx, c: V3, rad: number, len: number, axis: 'x' | 'y' | 'z', o: { low?: boolean; rings?: [number, number][]; top?: (x: number, z: number) => number } = {}): void {
  const R = rad + (o.rings ? T : 0);
  const half = (a: 'x' | 'y' | 'z') => (a === axis ? len / 2 : R);
  const min: V3 = [c[0] - half('x'), axis === 'y' ? c[1] : c[1] - R, c[2] - half('z')];
  const max: V3 = [c[0] + half('x'), axis === 'y' ? c[1] + len : c[1] + R, c[2] + half('z')];
  const low = o.low ?? min[1] < 0.01;
  ctx.round.add(min[0], min[1], min[2], max[0], max[1], max[2], ctx.r.pick(low ? PROP_STONE_LOW : PROP_STONE), { surf: low ? PROP_SURF.low : PROP_SURF.top, broken: null });
  const start = axis === 'x' ? min[0] : axis === 'y' ? min[1] : min[2];
  ctx.round.carve(
    (x, y, z) => {
      const d = axis === 'x' ? Math.hypot(y - c[1], z - c[2]) : axis === 'y' ? Math.hypot(x - c[0], z - c[2]) : Math.hypot(x - c[0], y - c[1]);
      const t = (axis === 'x' ? x : axis === 'y' ? y : z) - start;
      const ring = o.rings?.some(([a, b]) => t > a && t < b) ?? false;
      if (d > (ring ? R : rad) - T * 0.1) return true;
      return o.top ? y > o.top(x, z) : false;
    },
    { min, max },
  );
  ctx.p.collider(min[0] + T, min[1], min[2] + T, max[0] - T, o.top ? min[1] + len * 0.75 : max[1], max[2] - T);
}

/** Knock `n` corners off the stones (bites of broken stone, as where a block hit the ground). */
function breakCorners(ctx: Ctx, n: number): void {
  const ids = ctx.set.find(() => true).filter((id) => !isSmall(ctx.set.boxOf(id)));
  for (let i = 0; i < n && ids.length; i++) {
    const { min, max } = ctx.set.boxOf(ids.splice(ctx.r.int(0, ids.length - 1), 1)[0]);
    const x = ctx.r.chance(0.5) ? min[0] : max[0];
    const z = ctx.r.chance(0.7) ? max[2] : min[2];
    ctx.set.carveSphere(x, max[1], z, ctx.r.range(0.14, 0.2), ctx.seed + i);
  }
}

/**
 * Moss lying on the tops (the sheet's yellow-olive felt), in the ledges where
 * a stone sits on another (its darkest greens), drips down the fronts below
 * them, tufts at the stones' feet. (Relief grounds, one texel thin, stay bare.)
 */
function overgrow(ctx: Ctx, solid: (x: number, y: number, z: number) => boolean): void {
  const moss = new MossLayer(ctx.p, ctx.seed, solid);
  moss.cover(ctx.set, 0.3);
  const stones = ctx.set.find(() => true).map((id) => ctx.set.boxOf(id)).filter(({ min, max }) => max[2] - min[2] > T * 1.5);
  for (const { min, max } of stones) {
    if (min[1] < 0.1) continue;
    moss.corner('x', min[0], max[0], min[1], max[2], 1, 0.45);
    moss.corner('z', min[2], max[2], min[1], max[0], 1, 0.45);
    moss.corner('x', min[0], max[0], min[1], min[2], -1, 0.45);
    moss.corner('z', min[2], max[2], min[1], min[0], -1, 0.45);
  }
  for (const { min, max } of stones) {
    for (let x = min[0] + 0.1; x < max[0] - 0.05; x += ctx.r.range(0.15, 0.4)) if (ctx.r.chance(0.35)) moss.drip('x', x, max[1], max[2], 1, 3);
    for (let z = min[2] + 0.1; z < max[2] - 0.05; z += ctx.r.range(0.15, 0.4)) if (ctx.r.chance(0.25)) moss.drip('z', z, max[1], max[0], 1, 2);
  }
  moss.commit();
  tufts(ctx.p, ctx.spots, ctx.seed, solid);
}

/** ② main: a heap of wall blocks — two rows on the ground, one on top, one tipped against the heap's end. */
function pile(ctx: Ctx): void {
  const { r } = ctx;
  const s = () => r.int(-1, 1) * T * 2;
  // Back row: two long blocks end to end; front row: a long block and a half one, sunk a little.
  const bx = s();
  block(ctx, -1.25 + bx, 0, -0.5, -0.25 + bx, 0.5, 0);
  block(ctx, -0.25 + bx, 0, -0.5 - T * 2, 0.75 + bx, 0.5, -T * 2);
  const fx = s();
  block(ctx, -1 + fx, 0, 0, fx, 0.5, 0.5);
  block(ctx, fx + T, 0, T, 0.5 + fx + T, 0.4375, 0.5 + T);
  // On top: a long block across the joint of the back row, and a half block beside it.
  const tx = s();
  block(ctx, -0.875 + tx, 0.5, -0.5, 0.125 + tx, 1, 0);
  block(ctx, 0.1875 + tx, 0.5, -0.4375, 0.6875 + tx, 0.9375, -T);
  // One that slid off the top, resting against the right end of the back row.
  const tip = -(0.45 + r.range(-0.06, 0.06));
  tiltedBlock(ctx, [1, 0.5, 0.5], { at: [leanX(0.75 + bx, 1, 0.5, tip) + T, 0, -0.375], rot: [0, r.range(-0.1, 0.1), tip] });
  // Chips knocked off in the fall.
  block(ctx, 0.75 + fx, 0, 0.5, 0.9375 + fx, 0.1875, 0.6875);
  block(ctx, -1.375, 0, 0.25, -1.1875, 0.125, 0.4375);
  breakCorners(ctx, 2);
  ctx.set.erode(0.14, ctx.seed + 3, { passes: 2, where: spareSmall(ctx) });
  ctx.spots.push({ x: -1.1 + fx, z: 0.55, size: 0.9 }, { x: 0.55 + fx, z: 0.62, size: 0.7 }, { x: -1.3 + bx, z: -0.3, size: 0.8 });
}

/** Long lintels: one lying with its carved frieze to the front, a broken one tipped across it. */
function lintel(ctx: Ctx): void {
  const { r } = ctx;
  const L = 1.875;
  const n = Math.round(L / T) - 2;
  block(ctx, -L / 2, 0, -0.25, L / 2, 0.5, 0.25, { broken: null });
  // A second, broken lintel lying across behind it, one end in the soil.
  tiltedBlock(ctx, [1.25, 0.4375, 0.4375], { at: [0.25 + r.range(-0.1, 0.1), 0, -0.55], rot: [0, 0.5 + r.range(-0.1, 0.1), -0.24] });
  // The piece that snapped off, and a wedge that held it.
  block(ctx, 1.1875, 0, -0.9375, 1.5, 0.3125, -0.625);
  block(ctx, -1.25, 0, 0.125, -1, 0.25, 0.4375);
  ctx.set.erode(0.16, ctx.seed + 3, { passes: 2, where: spareSmall(ctx, spare([-L / 2 + T, 0.0625, 0.1, L / 2 - T, 0.4375, 0.3])) });
  // Mouldings: a groove above and below a frieze of rosettes.
  relief(ctx, ['.'.repeat(n)], -L / 2 + T, 0.4375, 0.25, 1);
  relief(ctx, frieze(n), -L / 2 + T, 0.375, 0.25, 1);
  relief(ctx, ['.'.repeat(n)], -L / 2 + T, 0.125, 0.25, 1);
  ctx.spots.push({ x: -0.3, z: 0.34, size: 0.8 }, { x: 1.3, z: -0.5, size: 1 }, { x: -1.1, z: -0.4, size: 0.9 });
}

/** A fallen wall fragment with a devata in her niche between two rosettes; a baluster window block lies in front. */
function carved(ctx: Ctx): void {
  const plain = { surf: PROP_SURF.clean, broken: null };
  block(ctx, -0.75, 0, -0.25, 0, 0.5, 0.25, plain);
  block(ctx, 0, 0, -0.25, 0.75, 0.5, 0.25, plain);
  block(ctx, -0.75, 0.5, -0.25, 0.25, 1, 0.25, { broken: null });
  block(ctx, 0.25, 0.5, -0.25, 0.75, 1, 0.25, { broken: null });
  block(ctx, 0.5, 0, 0.375, 1.25, 0.625, 0.8125, { broken: null });
  tiltedBlock(ctx, [1, 0.5, 0.5], { at: [-0.25, 0, -0.6], rot: [-0.3, 0.1, 0.05] });
  ctx.set.erode(0.14, ctx.seed + 3, { passes: 2, where: spareSmall(ctx, spare([-0.72, 0.03, 0.1, 0.72, 0.97, 0.3], [0.53, 0.03, 0.7, 1.22, 0.6, 0.85])) });
  relief(ctx, DEVATA, -0.3125, 0.9375, 0.25);
  relief(ctx, ROSETTE, -0.6875, 0.6875, 0.25);
  relief(ctx, ROSETTE, 0.375, 0.6875, 0.25);
  relief(ctx, BALUSTERS, 0.5 + T, 0.625 - T, 0.8125);
  ctx.spots.push({ x: -0.85, z: 0.3, size: 1 }, { x: 1.3, z: 0.5, size: 0.8 }, { x: 0.2, z: 0.35, size: 0.6 });
}

/** A column that came down: its plinth with the snapped drum still standing, a shaft and a drum rolled away, the capital upturned. */
function column(ctx: Ctx): void {
  const { r } = ctx;
  const rad = 0.25;
  const s = ctx.seed;
  block(ctx, -1.125, 0, -0.5, -0.375, 0.25, 0.25);
  drum(ctx, [-0.75, 0.25, -0.125], rad, 0.75, 'y', { rings: [[0, T * 2]], top: (x, z) => 0.84 + 0.1 * Math.sin(x * 7 + z * 5 + s) });
  drum(ctx, [0.3125, rad + T, 0.25], rad, 1.125, 'x', { low: true, rings: [[0, T * 2], [T * 4, T * 5]] });
  drum(ctx, [0.4375 + r.int(0, 2) * T, rad + T, -0.5], rad, 0.4375, 'z', { low: true, rings: [[T * 5, T * 7]] });
  // The capital: a square slab under a smaller one, lying upside down.
  block(ctx, 1, 0, -0.9375, 1.4375, 0.1875, -0.5);
  block(ctx, 1.0625, 0.1875, -0.875, 1.375, 0.3125, -0.5625);
  block(ctx, -1.25, 0, 0.375, -0.9375, 0.1875, 0.625);
  breakCorners(ctx, 1);
  ctx.set.erode(0.16, s + 3, { passes: 2, where: spareSmall(ctx) });
  ctx.round.erode(0.12, s + 5);
  ctx.spots.push({ x: -0.3, z: 0.55, size: 1 }, { x: 1.0, z: -0.4, size: 0.8 }, { x: -1.2, z: -0.4, size: 0.8 });
}

const LAYOUTS: Record<string, (ctx: Ctx) => void> = { pile, lintel, carved, column };

function build(variant: string, seed: number): KitPiece {
  const p = new PieceBuilder();
  const ctx: Ctx = { p, set: new BlockSet(T), round: new BlockSet(T), r: rng(seed * 23 + 11), seed, spots: [] };
  (LAYOUTS[variant] ?? pile)(ctx);
  ctx.set.emit(p.voxels, { seed });
  ctx.round.emit(p.voxels, { seed: seed + 1 });
  pores(p, ctx.set, seed, PORES);
  joints(p, ctx.set, seed);
  setColliders(p, ctx.set);
  overgrow(ctx, (x, y, z) => ctx.set.solidAt(x, y, z) || ctx.round.solidAt(x, y, z));
  return p.done();
}

export default defineKitAsset({
  section: '20',
  order: 2,
  name: 'Fallen architectural blocks',
  caption: 'Collapsed blocks from walls, columns and decorations.',
  size: {
    real: 'blocks 0.5 × 0.5 × 1.0 m, lintels 1.25–1.9 m, drums ⌀ 0.5 m; a heap about 3 × 1.4 m, 1 m high',
    sheet: 'not given',
    note: 'Sized from Angkor Wat’s masonry: 0.4–0.6 m courses, blocks up to about a metre long, lintels spanning 1.2–2 m doorways, colonnettes about half a metre across.',
  },
  variants: [
    { id: 'pile', name: 'Heap of wall blocks' },
    { id: 'lintel', name: 'Lintels' },
    { id: 'carved', name: 'Carved relief' },
    { id: 'column', name: 'Column drums' },
  ],
  ref: { sheet: 'section 20/6706F03E-0DFA-4AFA-80F0-5C031D4F49D5.PNG', box: [310, 88, 622, 398] },
  build: ({ variant, seed }) => build(variant, seed),
});
