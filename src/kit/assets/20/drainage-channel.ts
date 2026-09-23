import { BlockSet, masonry } from '../../BlockSet';
import { WATER } from '../../palette';
import { PieceBuilder } from '../../PieceBuilder';
import { here, rng, TEXEL } from '../../shapes';
import { stoneSurf } from '../../surface';
import { defineKitAsset, type KitPiece } from '../../types';
import { joints, MossLayer, pores, PROP_BROKEN, PROP_RECESS, PROP_STONE, PROP_STONE_LOW, PROP_SURF, PROP_WET, tufts, type TuftSpot } from './_masonry-props';

/**
 * ⑦ Drainage channel — U-section stone gutters as on the §20 sheet: two
 * courses of small blocks for each side wall, a floor slab between them, open
 * ends showing the U, moss on the lips and down the joints. Real temple drains
 * are about half a metre across and 0.35 m deep: walls 0.19 m thick around a
 * 0.25 m water way, the lip 0.375 m above the ground — low enough for the
 * explorer to step onto (0.42 m) and walk along or across. A film of water
 * lies on the silted bed of the runs (drying out towards their open ends) and
 * the basin stands full; the stone is dark and damp for a texel above both.
 */
const WALL = 0.1875;
const INNER = 0.25;
const COURSE = 0.1875;
const COURSES = 2;
const FLOOR = 0.0625;
const HI = INNER / 2;
const HO = HI + WALL;
/** Depth of the water: a film on the bed of the runs, the basin a hand below the lip. */
const FILM = TEXEL / 2;
const BASIN = 0.1875;
/** Pores per m² of face (half-texel marks: the stones are small). */
const PORES = 14;

/** [x0, z0, x1, z1] in metres. */
type Rect = [number, number, number, number];

/** A face (for moss): running along `axis` from `a` to `b`, at `at`, looking towards `dir`. */
interface Face {
  axis: 'x' | 'z';
  a: number;
  b: number;
  at: number;
  dir: 1 | -1;
}

interface Layout {
  /** Wall blocks per course, bottom course first (corners lap alternately). */
  walls: Rect[][];
  floor: Rect[];
  /** Standing water on the floor. */
  water?: Rect[];
  /** Outside faces of the walls (moss at their foot, drips down their joints). */
  outer: Face[];
  /** Inside faces of the walls (the damp water line runs along them). */
  inner: Face[];
}

/** Both courses the same. */
const same = (...r: Rect[]): Rect[][] => Array.from({ length: COURSES }, () => r);

function straight(len: number): Layout {
  const z = len / 2;
  return {
    walls: same([-HO, -z, -HI, z], [HI, -z, HO, z]),
    floor: [[-HI, -z, HI, z]],
    outer: [
      { axis: 'z', a: -z, b: z, at: -HO, dir: -1 },
      { axis: 'z', a: -z, b: z, at: HO, dir: 1 },
    ],
    inner: [
      { axis: 'z', a: -z, b: z, at: -HI, dir: 1 },
      { axis: 'z', a: -z, b: z, at: HI, dir: -1 },
    ],
  };
}

/** Closed at the back (−Z) by an end wall, open at the front. */
function capped(len: number, frontCap = false): Layout {
  const z0 = -len / 2;
  const z1 = len / 2;
  const walls: Rect[][] = [];
  for (let c = 0; c < COURSES; c++) {
    // Course 0: the end walls run across the full width; course 1: the side walls run through.
    const lap = c % 2 === 0;
    const course: Rect[] = [
      [-HO, lap ? z0 + WALL : z0, -HI, frontCap && lap ? z1 - WALL : z1],
      [HI, lap ? z0 + WALL : z0, HO, frontCap && lap ? z1 - WALL : z1],
      lap ? [-HO, z0, HO, z0 + WALL] : [-HI, z0, HI, z0 + WALL],
    ];
    if (frontCap) course.push(lap ? [-HO, z1 - WALL, HO, z1] : [-HI, z1 - WALL, HI, z1]);
    walls.push(course);
  }
  const zi0 = z0 + WALL;
  const zi1 = frontCap ? z1 - WALL : z1;
  const outer: Face[] = [
    { axis: 'z', a: z0, b: z1, at: -HO, dir: -1 },
    { axis: 'z', a: z0, b: z1, at: HO, dir: 1 },
    { axis: 'x', a: -HO, b: HO, at: z0, dir: -1 },
  ];
  const inner: Face[] = [
    { axis: 'z', a: zi0, b: zi1, at: -HI, dir: 1 },
    { axis: 'z', a: zi0, b: zi1, at: HI, dir: -1 },
    { axis: 'x', a: -HI, b: HI, at: zi0, dir: 1 },
  ];
  if (frontCap) {
    outer.push({ axis: 'x', a: -HO, b: HO, at: z1, dir: 1 });
    inner.push({ axis: 'x', a: -HI, b: HI, at: zi1, dir: -1 });
  }
  return { walls, floor: [[-HI, zi0, HI, zi1]], outer, inner };
}

/** An L: one arm towards the front (+Z), one to the right (+X), meeting at the back left. */
function corner(arm: number): Layout {
  const x0 = -arm / 2 + WALL;
  const z0 = -arm / 2 + WALL;
  const xe = arm / 2;
  const ze = arm / 2;
  const walls: Rect[][] = [];
  for (let c = 0; c < COURSES; c++) {
    const lap = c % 2 === 0;
    walls.push([
      // Outer walls (left, back) and inner walls (right of the front arm, front of the right arm).
      [x0 - WALL, lap ? z0 - WALL : z0, x0, ze],
      [lap ? x0 : x0 - WALL, z0 - WALL, xe, z0],
      [x0 + INNER, lap ? z0 + INNER : z0 + INNER + WALL, x0 + INNER + WALL, ze],
      [lap ? x0 + INNER + WALL : x0 + INNER, z0 + INNER, xe, z0 + INNER + WALL],
    ]);
  }
  return {
    walls,
    floor: [
      [x0, z0, x0 + INNER, ze],
      [x0 + INNER, z0, xe, z0 + INNER],
    ],
    outer: [
      { axis: 'z', a: z0 - WALL, b: ze, at: x0 - WALL, dir: -1 },
      { axis: 'x', a: x0 - WALL, b: xe, at: z0 - WALL, dir: -1 },
      { axis: 'z', a: z0 + INNER + WALL, b: ze, at: x0 + INNER + WALL, dir: 1 },
      { axis: 'x', a: x0 + INNER + WALL, b: xe, at: z0 + INNER + WALL, dir: 1 },
    ],
    inner: [
      { axis: 'z', a: z0, b: ze, at: x0, dir: 1 },
      { axis: 'x', a: x0, b: xe, at: z0, dir: 1 },
      { axis: 'z', a: z0 + INNER, b: ze, at: x0 + INNER, dir: -1 },
      { axis: 'x', a: x0 + INNER, b: xe, at: z0 + INNER, dir: -1 },
    ],
  };
}

/** A run along X with a branch joining it from the front (+Z). */
function tee(len: number, branch: number): Layout {
  const x = len / 2;
  // Centre the footprint: the main run lies behind the origin.
  const zc = -(branch - WALL) / 2;
  const zb = zc + HI;
  const zf = zc + HO;
  const ze = zc + HO + branch - WALL;
  const walls: Rect[][] = [];
  for (let c = 0; c < COURSES; c++) {
    const lap = c % 2 === 0;
    walls.push([
      [-x, zc - HO, x, zc - HI],
      [-x, zb, lap ? -HI : -HO, zf],
      [lap ? HI : HO, zb, x, zf],
      [-HO, lap ? zf : zb, -HI, ze],
      [HI, lap ? zf : zb, HO, ze],
    ]);
  }
  return {
    walls,
    floor: [
      [-x, zc - HI, x, zb],
      [-HI, zb, HI, ze],
    ],
    outer: [
      { axis: 'x', a: -x, b: x, at: zc - HO, dir: -1 },
      { axis: 'x', a: -x, b: -HO, at: zf, dir: 1 },
      { axis: 'x', a: HO, b: x, at: zf, dir: 1 },
      { axis: 'z', a: zf, b: ze, at: -HO, dir: -1 },
      { axis: 'z', a: zf, b: ze, at: HO, dir: 1 },
    ],
    inner: [
      { axis: 'x', a: -x, b: x, at: zc - HI, dir: 1 },
      { axis: 'x', a: -x, b: -HI, at: zb, dir: -1 },
      { axis: 'x', a: HI, b: x, at: zb, dir: -1 },
      { axis: 'z', a: zb, b: ze, at: -HI, dir: 1 },
      { axis: 'z', a: zb, b: ze, at: HI, dir: -1 },
    ],
  };
}

const LAYOUTS: Record<string, () => Layout> = {
  straight: () => straight(1.5),
  corner: () => corner(1.25),
  tee: () => tee(1.75, 0.8125),
  end: () => capped(1.25),
  basin: () => ({ ...capped(1, true), water: [[-HI, -0.5 + WALL, HI, 0.5 - WALL]] }),
};

function build(variant: string, seed: number): KitPiece {
  const lay = (LAYOUTS[variant] ?? LAYOUTS.straight)();
  const r = rng(seed * 17 + 3);
  const p = new PieceBuilder();
  const set = new BlockSet(TEXEL);
  lay.walls.forEach((course, c) => {
    for (const [x0, z0, x1, z1] of course) {
      masonry(set, x0, c * COURSE, z0, x1, (c + 1) * COURSE, z1, {
        length: [0.1875, 0.375],
        course: COURSE,
        axis: x1 - x0 >= z1 - z0 ? 'x' : 'z',
        palette: c === 0 ? PROP_STONE_LOW : PROP_STONE,
        style: { surf: c === 0 ? PROP_SURF.low : PROP_SURF.top, broken: PROP_BROKEN },
        seed: seed * 29 + c * 13 + Math.round(x0 * 16) * 3 + Math.round(z0 * 16),
      });
      p.collider(x0, c * COURSE, z0, x1, (c + 1) * COURSE, z1);
    }
  });
  // The bed: slabs dark with silt and damp, so the channel reads deep like the sheet's.
  for (const [x0, z0, x1, z1] of lay.floor) {
    masonry(set, x0, 0, z0, x1, FLOOR, z1, {
      length: [0.375, 0.625],
      course: FLOOR,
      axis: x1 - x0 >= z1 - z0 ? 'x' : 'z',
      palette: PROP_RECESS,
      style: { surf: PROP_SURF.low, broken: PROP_BROKEN, shade: 1.25 },
      seed: seed * 7 + 1,
      stagger: false,
    });
    p.collider(x0, 0, z0, x1, FLOOR, z1);
  }
  // Chipped lips; the walls stay whole below the water line, where the damp band lies on them.
  const wet = FLOOR + (lay.water ? BASIN : FILM);
  set.erode(0.08, seed + 5, { where: (_x, y) => y > wet + TEXEL });
  set.emit(p.voxels, { seed });
  pores(p, set, seed, PORES, (_x, y) => y > FLOOR, TEXEL / 2);
  joints(p, set, seed);

  // The water: the basin full; in the runs a film on the silt that stops short of the open ends.
  const { min, max } = set.bounds();
  const open = (v: number, i: number) => Math.abs(v - min[i]) < 1e-6 || Math.abs(v - max[i]) < 1e-6;
  const pools = (lay.water ?? lay.floor).map(([x0, z0, x1, z1]): Rect => {
    const dry = 3 * TEXEL;
    return x1 - x0 >= z1 - z0 ? [open(x0, 0) ? x0 + dry : x0, z0, open(x1, 0) ? x1 - dry : x1, z1] : [x0, open(z0, 2) ? z0 + dry : z0, x1, open(z1, 2) ? z1 - dry : z1];
  });
  for (const [x0, z0, x1, z1] of pools) p.voxels.span(x0, FLOOR, z0, x1, wet, z1, WATER.shallow[0], 'water', { open: 4 });
  // The water line: dark damp stone for a texel above the water, a plate on each inner wall.
  const src = here();
  for (const f of lay.inner) {
    const t = 0.006;
    const [c0, c1] = [f.at + (f.dir * t) / 2, (f.a + f.b) / 2];
    const band = { open: f.axis === 'z' ? (f.dir > 0 ? 1 : 2) : f.dir > 0 ? 16 : 32, surf: stoneSurf({ stain: 0.6, moss: 0.3 }), src };
    if (f.axis === 'z') p.voxels.box(c0, wet + TEXEL / 2, c1, t, TEXEL, f.b - f.a, r.pick(PROP_WET), 'sandstone', band);
    else p.voxels.box(c1, wet + TEXEL / 2, c0, f.b - f.a, TEXEL, t, r.pick(PROP_WET), 'sandstone', band);
  }

  // Moss lying on the lips and down the outer joints (in half-texel cells, in scale with
  // the small stones); tufts at the walls' feet.
  const moss = new MossLayer(p, seed, (x, y, z) => set.solidAt(x, y, z), TEXEL / 2);
  moss.cover(set, 0.2, (_x, y) => y > COURSE);
  for (const f of lay.outer) for (let t = f.a + 0.2; t < f.b - 0.1; t += r.range(0.25, 0.5)) if (r.chance(0.3)) moss.drip(f.axis, t, COURSES * COURSE, f.at, f.dir, 3);
  moss.commit();
  // Grass in the dry silt at an open end of the bed, a small tuft hugging the foot of an outer wall.
  const spots: TuftSpot[] = [];
  const bed = lay.floor[0];
  if (!lay.water && open(bed[3], 2)) spots.push({ x: (bed[0] + bed[2]) / 2, y: FLOOR, z: bed[3] - 0.1, size: 0.45 });
  const f = r.pick(lay.outer);
  const t = r.range(f.a + 0.15, f.b - 0.15);
  spots.push(f.axis === 'x' ? { x: t, z: f.at, size: 0.55 } : { x: f.at, z: t, size: 0.55 });
  tufts(p, spots, seed, (x, y, z) => set.solidAt(x, y, z));
  return p.done();
}

export default defineKitAsset({
  section: '20',
  order: 7,
  name: 'Drainage channel',
  caption: 'Water drainage channels and stone gutters.',
  size: {
    real: '0.63 m wide, 0.31 m deep (lip 0.375 m); segments 1–2 m',
    sheet: 'not given (drawn with 0.5 m blocks)',
    note: 'Temple drains run about half a metre across and 0.35 m deep, so the walls are small 0.19 m blocks, not the 0.5 m wall blocks the sheet draws; the lip stays under the explorer’s 0.42 m step-up.',
  },
  variants: [
    { id: 'straight', name: 'Straight' },
    { id: 'corner', name: 'Corner' },
    { id: 'tee', name: 'T-junction' },
    { id: 'end', name: 'End (capped)' },
    { id: 'basin', name: 'Basin with water' },
  ],
  shots: [
    { view: 'iso', variant: 'corner', label: 'Corner' },
    { view: 'iso', variant: 'tee', label: 'T-junction' },
    { view: 'iso', variant: 'end', label: 'End (capped)' },
    { view: 'iso', variant: 'basin', label: 'Basin with water' },
  ],
  ref: { sheet: 'section 20/6706F03E-0DFA-4AFA-80F0-5C031D4F49D5.PNG', box: [310, 408, 622, 692] },
  build: ({ variant, seed }) => build(variant, seed),
});
