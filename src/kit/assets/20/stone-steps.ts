import { VoxelBuilder } from '../../../voxel/VoxelBuilder';
import { BlockSet, masonry } from '../../BlockSet';
import { PieceBuilder } from '../../PieceBuilder';
import { rng, TEXEL } from '../../shapes';
import { defineKitAsset, type KitPiece } from '../../types';
import { joints, MossLayer, mossOnTop, placeTilted, poreMarks, pores, PROP_BROKEN, PROP_STONE, PROP_STONE_LOW, PROP_SURF, restOnGround, tiltedColliders, tufts, type TuftSpot } from './_masonry-props';

/**
 * ⑥ Stone steps — short flights of sandstone steps, as on the §20 sheet: every
 * step one course of chunky half-metre blocks (three across a narrow flight,
 * four across a wide one), the courses stepping back one tread at a time with
 * crisp nosings, so the flight reads as steps from any side; moss in the
 * corner at the back of each tread and down the joints, a tuft at the foot.
 * Real Khmer stairs are steep: 0.25 m risers on 0.31 m treads (4 and 5
 * texels) — within the explorer's 0.42 m step-up, and every step has its own
 * collider. The flight rises towards −Z; its risers face the front (+Z).
 */
const RISE = 0.25;
const TREAD = 0.3125;
/** Pores per m² of face. */
const PORES = 8;

interface Flight {
  steps: number;
  width: number;
  /** Cheek walls (width, metres) flanking the flight, their tops stepping up with it. */
  cheek?: number;
  /** The bottom step runs this much wider on each side. */
  flare?: number;
  /** Worn and overgrown: chipped deeper, blocks missing, one fallen out. */
  broken?: boolean;
}

// The sheet's four flights: 4 × 3 blocks, 4 × 4, 5 × 3 between cheek walls, 5 × 4 overgrown.
const FLIGHTS: Record<string, Flight> = {
  narrow: { steps: 4, width: 1.5 },
  wide: { steps: 4, width: 2, flare: 0.25 },
  walled: { steps: 5, width: 1.5, cheek: 0.375 },
  broken: { steps: 5, width: 1.75, broken: true },
};

function build(variant: string, seed: number): KitPiece {
  const f = FLIGHTS[variant] ?? FLIGHTS.narrow;
  const r = rng(seed * 13 + 5);
  const p = new PieceBuilder();
  const set = new BlockSet(TEXEL);
  const depth = f.steps * TREAD;
  const back = -depth / 2;
  const front = (c: number) => depth / 2 - c * TREAD;
  const hw = f.width / 2;
  const sw = hw + (f.flare ?? 0) + (f.cheek ?? 0);

  // The steps: course c spans from the back to its riser; each tread is the top of a skin one tread deep.
  for (let c = 0; c < f.steps; c++) {
    const w = hw + (c === 0 ? (f.flare ?? 0) : 0);
    masonry(set, -w, c * RISE, back, w, (c + 1) * RISE, front(c), {
      length: [0.4375, 0.5625],
      course: RISE,
      depth: TREAD,
      axis: 'x',
      palette: c === 0 ? PROP_STONE_LOW : PROP_STONE,
      style: { surf: f.broken ? PROP_SURF.mossy : c === 0 ? PROP_SURF.low : PROP_SURF.top, broken: PROP_BROKEN },
      seed: seed * 31 + c * 7,
    });
    p.collider(-w, c * RISE, back, w, (c + 1) * RISE, front(c));
  }

  // Cheek walls: a course above each tread, level with the top step behind it, and
  // ending in front of the flight in a pedestal block (where a lion would sit).
  if (f.cheek) {
    for (let k = 0; k < f.steps; k++) {
      const end = k < 2 ? front(0) + TREAD : front(k - 1);
      for (const side of [-1, 1]) {
        const [x0, x1] = side < 0 ? [-hw - f.cheek, -hw] : [hw, hw + f.cheek];
        masonry(set, x0, k * RISE, back, x1, (k + 1) * RISE, end, {
          length: [0.375, 0.6875],
          course: RISE,
          axis: 'z',
          palette: k === 0 ? PROP_STONE_LOW : PROP_STONE,
          style: { surf: k === 0 ? PROP_SURF.low : PROP_SURF.top, broken: PROP_BROKEN },
          seed: seed * 53 + k * 3 + side,
        });
        p.collider(x0, k * RISE, back, x1, (k + 1) * RISE, end);
      }
    }
  }

  const spots: TuftSpot[] = [];
  if (f.broken) {
    // Stones gone from a nosing and the top step; one lies in front of the flight.
    const gone = (x: number, y: number, z: number) => set.find((cx, cy, cz) => Math.abs(cx - x) < 0.25 && Math.abs(cy - y) < 0.1 && Math.abs(cz - z) < 0.15)[0];
    const holes = [
      [-hw + 0.25, RISE * 1.5, front(1) - TREAD / 2],
      [hw - 0.25, RISE * (f.steps - 0.5), front(f.steps - 1) - TREAD / 2],
    ];
    for (const [x, y, z] of holes) {
      const id = gone(x, y, z);
      if (id !== undefined) set.remove(id);
      spots.push({ x, y: y - RISE / 2, z, size: 0.7 });
    }
    set.erode(0.22, seed + 7, { passes: 2 });
    // (whole: a chipped block's cells would shear its texels once turned)
    const local = new VoxelBuilder().box(0, 0, 0, 0.4375, RISE, TREAD, r.pick(PROP_STONE), 'sandstone', { surf: PROP_SURF.mossy });
    const lo: [number, number, number] = [-0.21875, -RISE / 2, -TREAD / 2];
    const hi: [number, number, number] = [0.21875, RISE / 2, TREAD / 2];
    poreMarks(local, lo, hi, r, PORES, () => true);
    mossOnTop(local, lo, hi, 0.35, seed);
    const tilt = restOnGround({ at: [-hw * 0.45 + r.range(-0.1, 0.1), 0, depth / 2 + 0.36], rot: [0.1, r.range(0.35, 0.6), -0.16] }, lo, hi);
    placeTilted(p, local, tilt);
    tiltedColliders(p, tilt, lo, hi, 2);
    spots.push({ x: tilt.at[0] + 0.3, z: tilt.at[2] + 0.12, size: 0.9 }, { x: -sw, z: back + 0.3, size: 1 }, { x: sw, z: 0, size: 0.8 });
  } else {
    // Only the flight's outer ends are chipped: the nosings stay crisp, so the steps read.
    set.erode(0.12, seed + 7, { where: (x) => Math.abs(x) > sw - 2 * TEXEL });
    spots.push({ x: sw, z: depth / 2 + (f.cheek ? TREAD : 0) - 0.12, size: 0.8 }, { x: -sw, z: back + r.range(0.2, 0.6), size: 0.7 });
  }
  set.emit(p.voxels, { seed });
  pores(p, set, seed, PORES);
  joints(p, set, seed);

  // Moss in the corner at the back of each tread (thickest at its ends), a
  // little lying on the treads, and down the joints of the risers.
  const moss = new MossLayer(p, seed, (x, y, z) => set.solidAt(x, y, z));
  const cover = f.broken ? 0.6 : 0.45;
  for (let c = 1; c < f.steps; c++) {
    moss.corner('x', -hw, hw, c * RISE, front(c), 1, cover);
    for (const side of [-1, 1]) moss.corner('x', side * hw - (side > 0 ? 0.25 : 0), side * hw + (side < 0 ? 0.25 : 0), c * RISE, front(c), 1, 0.8);
  }
  moss.cover(set, f.broken ? 0.32 : 0.16);
  for (let c = 0; c < f.steps; c++) {
    const w = hw + (c === 0 ? (f.flare ?? 0) : 0);
    const joints = set
      .find((_x, y, z) => Math.abs(y - (c + 0.5) * RISE) < 0.01 && Math.abs(z - (front(c) - TREAD / 2)) < 0.01)
      .map((id) => set.boxOf(id).max[0])
      .filter((x) => x < w - 0.01);
    for (const x of joints) if (r.chance(f.broken ? 0.55 : 0.3)) moss.drip('x', x - TEXEL / 2 + (r.chance(0.5) ? TEXEL : 0), (c + 1) * RISE, front(c), 1, 2);
  }
  moss.corner('x', hw * 0.2, sw, 0, depth / 2, 1, f.broken ? 0.5 : 0.3);
  moss.commit();
  tufts(p, spots, seed, (x, y, z) => set.solidAt(x, y, z));
  return p.done();
}

export default defineKitAsset({
  section: '20',
  order: 6,
  name: 'Stone steps',
  caption: 'Steps and stair segments.',
  size: {
    real: 'risers 0.25 m, treads 0.31 m; flights 1.5–2 m wide (2.25 m with cheek walls), 4–5 steps, 1–1.25 m high',
    sheet: 'not given (drawn as cube blocks, riser = tread)',
    note: 'Khmer stairs are steep but still stairs: 0.2–0.25 m risers and 0.3–0.35 m treads. The sheet draws each step as a row of cube blocks; built to real risers so the 1.70 m explorer climbs them (0.42 m step-up), with half-metre blocks three or four to a step like the sheet’s.',
  },
  variants: [
    { id: 'narrow', name: 'Narrow flight' },
    { id: 'wide', name: 'Wide flight' },
    { id: 'walled', name: 'With cheek walls' },
    { id: 'broken', name: 'Broken, overgrown' },
  ],
  ref: { sheet: 'section 20/6706F03E-0DFA-4AFA-80F0-5C031D4F49D5.PNG', box: [16, 408, 302, 692] },
  build: ({ variant, seed }) => build(variant, seed),
});
