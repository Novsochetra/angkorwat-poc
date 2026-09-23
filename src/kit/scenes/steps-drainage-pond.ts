import { valueNoise3 } from '../../voxel/random';
import { MossLayer, PROP_BROKEN, PROP_STONE, PROP_STONE_LOW, PROP_SURF, PROP_WET } from '../assets/20/_masonry-props';
import { POND, pondFlora, waterBody } from '../assets/20/_pond';
import { BlockSet, masonry } from '../BlockSet';
import { galleryFacade } from '../lib/gallery';
import { FLOWER_TONES, GRASS_TONES } from '../lib/grass';
import { LITTER_MIX } from '../lib/leaves';
import { SOIL, WATER } from '../palette';
import type { PieceBuilder } from '../PieceBuilder';
import { defineKitScene } from '../scene';
import { rng, TEXEL } from '../shapes';
import { soilSurf, stoneSurf, type StoneFinish } from '../surface';
import type { KitCollider } from '../types';
import { dress, Greenery, Heights, litter, PAVE, paving, put, ruinWall, spots, type Rect } from './_scenes20';

/**
 * §20 "Steps, drainage and pond", the sheet's third environment panel: a
 * terrace at the back — a gallery with baluster windows on it, stepped tiers
 * rising behind on the right — and broad steps running the width of the court
 * down from it, the kit's flight among them, on the right going on down into
 * a pond sunk in the court: lined with steps on three sides, lily pads and
 * lotus on the water. A stone drain, sunk in the court along the foot of the
 * steps, spills into the pond at its corner. Moss on the stones, grass in the
 * joints and along the walls, fallen leaves.
 */
const AREA: Rect = { x0: -10, z0: -8, x1: 10, z1: 8 };
/** Front face of the terrace's retaining wall (the back of the steps). */
const FRONT = -3;
/** Where the kit's flight comes down; the broad steps run from STEPS_X0 to the right edge of the court. */
const STAIR_X = -5;
const STEPS_X0 = -8.5;
const STEPS_X1 = 9.5;
/**
 * The pond (x; it reaches from the foot of the steps to POND_Z1), sunk in the
 * court: its rim flush with the paving, the water 0.31 m below it over a dark
 * silt bed, two steps going down to the water and a third under it.
 */
const POND_X0 = 2;
const POND_Z1 = 3.5;
const WATER_TOP = -0.3125;
const BED = -0.75;
/** The pond's steps: 0.375 m treads, 0.25 m risers (the explorer climbs them). */
const TREAD = 0.375;
const RISE = 0.25;
/** The drain is sunk into the court, its lips a texel proud of the flagstones. */
const DRAIN_Y = -0.3125;

/** The gallery on the terrace: the §20 props' tan sandstone, like the kit steps and drain. */
const FINISH: StoneFinish = { palette: PROP_STONE, surf: PROP_SURF.top, wear: 0.2 };

/** One collider per stone of a block set. */
function colliders(p: PieceBuilder, set: BlockSet): void {
  for (const id of set.find(() => true)) {
    const { min, max } = set.boxOf(id);
    p.collider(min[0], min[1], min[2], max[0], max[1], max[2]);
  }
}

export default defineKitScene({
  name: 'Steps, drainage and pond',
  caption: 'Broad stone steps down from a gallery terrace and on into a sunken lotus pond, a drain along their foot spilling into it, moss and grass in every joint.',
  source: '20 Small props · Environment examples · Steps, drainage and pond',
  size: [20, 16],
  camera: { az: 22, el: 37, dist: 14.5, target: [1, 0.1, -0.6] },
  spawn: { x: -5, z: 5, yaw: 180 },
  async build(ctx, p) {
    const r = rng(60);

    // ── The kit's flight: its courses (one collider each, bottom up) set the terrace's height and the steps' rhythm.
    const flight = await ctx.get('20/stone-steps', { variant: 'wide', seed: 2 });
    const kit: KitCollider[] = (flight?.colliders ?? []).filter((c) => c.max[1] - c.min[1] <= RISE + 1e-6).sort((a, b) => a.min[1] - b.min[1]);
    const n = kit.length || 4;
    const back = kit.length ? kit[0].min[2] : -0.625;
    const run = kit.length ? (kit[0].max[2] - back) / n : 0.3125;
    const TOP = n * RISE;
    // Course c: its front (a riser) and the part of it the kit's flight fills.
    const front = (c: number) => FRONT + (n - c) * run;
    const gap = (c: number): [number, number] => (kit[c] ? [STAIR_X + kit[c].min[0], STAIR_X + kit[c].max[0]] : [STAIR_X, STAIR_X]);
    if (flight) put(p, flight, { x: STAIR_X, y: 0, z: FRONT - back });
    /** The foot of the steps: the court (and the pond) begin here. */
    const FOOT = front(0);

    // ── The broad steps either side of it: the same risers and treads, chunky half-metre blocks, moss in the corners.
    const steps = new BlockSet(TEXEL);
    for (let c = 0; c < n; c++)
      for (const [a, b] of [
        [STEPS_X0, gap(c)[0]],
        [gap(c)[1], STEPS_X1],
      ]) {
        masonry(steps, a, c * RISE, FRONT, b, (c + 1) * RISE, front(c), { length: [0.4375, 0.5625], course: RISE, depth: run, axis: 'x', palette: c === 0 ? PROP_STONE_LOW : PROP_STONE, style: { surf: c === 0 ? PROP_SURF.low : PROP_SURF.top, broken: PROP_BROKEN }, seed: 90 + c * 7 + Math.round(a) });
        p.collider(a, c * RISE, FRONT, b, (c + 1) * RISE, front(c));
      }
    steps.erode(0.1, 91, { where: (x) => x < STEPS_X0 + 0.2 || x > STEPS_X1 - 0.2 });
    steps.emit(p.voxels, { seed: 9 });
    dress(p, steps, 92, 8);
    const moss = new MossLayer(p, 93, (x, y, z) => steps.solidAt(x, y, z));
    for (let c = 1; c < n; c++) {
      moss.corner('x', STEPS_X0, gap(c)[0], c * RISE, front(c), 1, 0.45);
      moss.corner('x', gap(c)[1], STEPS_X1, c * RISE, front(c), 1, 0.45);
    }
    moss.cover(steps, 0.12);
    moss.commit();

    // ── The terrace: retaining wall and a coping lip at the ends of the steps, side and back skins,
    // stepped tiers on the right, cheek walls, a paved top.
    const terrace = new BlockSet(0.125);
    const lay = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, seed: number, low = false, course = 0.375) =>
      masonry(terrace, x0, y0, z0, x1, y1, z1, { length: [0.5, 1.25], course, depth: 0.5, palette: low ? PROP_STONE_LOW : PROP_STONE, style: { surf: low ? PROP_SURF.low : PROP_SURF.top, broken: PROP_BROKEN }, seed });
    lay(-10, 0, FRONT - 0.75, 10, TOP - 0.25, FRONT, 61, true);
    lay(-10, TOP - 0.25, FRONT - 0.5, STEPS_X0, TOP, FRONT + 0.125, 63, false, 0.25);
    lay(STEPS_X0, TOP - 0.25, FRONT - 0.5, STEPS_X1, TOP, FRONT, 64, false, 0.25);
    lay(STEPS_X1, TOP - 0.25, FRONT - 0.5, 10, TOP, FRONT + 0.125, 65, false, 0.25);
    lay(-10, 0, -8, -9.5, TOP - 0.25, FRONT - 0.75, 66, true);
    lay(9.5, 0, -8, 10, TOP - 0.25, FRONT - 0.75, 67, true);
    lay(-9.5, 0, -8, 9.5, TOP - 0.25, -7.5, 68, true);
    [
      [-5, 0.375],
      [-6, 0.75],
      [-7, 1.125],
    ].forEach(([z1, h], t) => lay(1, TOP + h - 0.375, -8, 10, TOP + h, z1, 70 + t));
    // Cheek walls flanking the broad steps, level with the terrace.
    lay(-9.25, 0, FRONT, STEPS_X0, TOP, FOOT, 75, true, RISE);
    lay(STEPS_X1, 0, FRONT, 10, TOP, FOOT, 76, true, RISE);
    terrace.erode(0.14, 69, { where: (_x, y) => y > 0.1 });
    terrace.emit(p.voxels, { seed: 6 });
    dress(p, terrace, 69);
    colliders(p, terrace);
    paving(p, {
      area: { x0: -9.5, z0: -7.5, x1: 9.5, z1: FRONT - 0.5 },
      top: TOP,
      rows: [0.5, 0.875],
      palette: PAVE,
      surf: (_x, _z, q) => stoneSurf({ moss: 0.12 + q() * 0.2, lichen: 0.12, stain: 0.35, crack: q.chance(0.2) ? 0.3 : 0.04 }),
      seed: 71,
      missing: () => 0.06,
      heave: () => 0.1,
      broken: 0.08,
      soil: soilSurf({ grass: 0.75, moss: 0.4 }),
    });
    p.collider(-10, 0, -8, 10, TOP - 0.5, FRONT - 0.5);
    // The gallery on the terrace; a broken wall closing the court on the left.
    put(p, galleryFacade({ length: 10.5, bay: 3.5, finish: FINISH, seed: 72, gallery: 1.5 }), { x: -4.75, y: TOP, z: -5 });
    const leftTop = (x: number) => 1.2 + (x + 2.75) * 0.28 + (valueNoise3(x * 1.2, 7, 3, 11) - 0.5) * 0.9;
    put(p, ruinWall({ length: 5.5, depth: 0.5, top: leftTop, palette: [...PROP_STONE_LOW, ...PROP_STONE], surf: (y) => stoneSurf({ moss: Math.min(0.6, 0.2 + y * 0.12), lichen: 0.1, stain: 0.45 }), wear: 0.25, seed: 74, plinth: true, holes: 0.05 }), { x: -9.5, y: 0, z: FRONT + 0.25 + 2.75, turn: 1 });

    // ── The court, paved; left open for the pond and the drain sunk along the foot of the steps.
    const pond: Rect = { x0: POND_X0, z0: FOOT, x1: STEPS_X1, z1: POND_Z1 };
    const zc = FOOT + 0.3125;
    const drain: Rect = { x0: gap(0)[1], z0: FOOT, x1: POND_X0, z1: FOOT + 0.625 };
    const court = paving(p, {
      area: { x0: -9.25, z0: FOOT, x1: 10, z1: 8 },
      palette: PAVE,
      surf: (x, z, q) => stoneSurf({ moss: 0.1 + q() * 0.22 + (z < 0 || (x > 1 && z < 4.5) ? 0.15 : 0), lichen: 0.12, stain: 0.35, crack: q.chance(0.2) ? 0.35 : 0.05 }),
      seed: 73,
      missing: (x, z) => 0.04 + Math.max(0, valueNoise3(x * 0.45, 5, z * 0.45, 9) - 0.55) * 0.9,
      heave: () => 0.12,
      broken: 0.1,
      skip: [pond, drain],
      soil: soilSurf({ grass: 0.45, moss: 0.35, dry: 0.2 }),
    });
    p.voxels.span(-10, -0.5, FRONT, -9.25, 0, 8, SOIL.dirt[0], 'soil', { surf: soilSurf({ grass: 0.8, moss: 0.4 }), open: 4 | 2 | 16 });
    p.collider(-10, -0.5, FRONT, -9.25, 0, 8);

    // ── The drain, sunk in the court along the foot of the steps: straight runs from the pond back towards
    // the flight, a capped end; a stone footing under it.
    let x = POND_X0;
    for (let s = 1; x - 1.5 - 1.25 >= drain.x0 - 0.05; s++) {
      put(p, await ctx.get('20/drainage-channel', { variant: 'straight', seed: s }), { x: x - 0.75, y: DRAIN_Y, z: zc, turn: 1 });
      x -= 1.5;
    }
    put(p, await ctx.get('20/drainage-channel', { variant: 'end', seed: 1 }), { x: x - 0.625, y: DRAIN_Y, z: zc, turn: 1 });
    p.voxels.span(x - 1.25, -0.5, drain.z0, POND_X0, DRAIN_Y, drain.z1, PROP_STONE_LOW[2], 'sandstone', { surf: PROP_SURF.mossy });
    // (a flagstone where the runs stop short of the flight)
    if (x - 1.25 > drain.x0 + 0.01) {
      p.voxels.span(drain.x0, -0.5, drain.z0, x - 1.25, 0, drain.z1, PAVE[1], 'sandstone', { surf: stoneSurf({ moss: 0.3, stain: 0.5 }) });
      p.collider(drain.x0, -0.5, drain.z0, x - 1.25, 0, drain.z1);
    }
    // Water running in it, a hand below the lips, from the capped end to its mouth, and spilling into the pond.
    const flow = DRAIN_Y + 0.285;
    p.voxels.span(x - 1.25 + 0.1875, DRAIN_Y + 0.0645, zc - 0.124, POND_X0, flow, zc + 0.124, WATER.shallow[0], 'water', { open: 4 });
    p.voxels.span(POND_X0, WATER_TOP - 0.02, zc - 0.11, POND_X0 + 0.05, flow, zc + 0.11, WATER.shallow[1], 'water');

    // ── The pond: its rim flush with the court, then two steps down, the second a hand above the water and
    // a third under it, along the back (the broad steps going on down), the left and the front; a plain wall
    // on the right; the drain's mouth at the back-left corner, a sill under the water below it.
    const rim = new BlockSet(0.125);
    const course = (x0: number, z0: number, x1: number, z1: number, y1: number, seed: number) =>
      masonry(rim, x0, BED, z0, x1, y1, z1, { length: [0.5, 1.0], course: 0.25, palette: y1 >= 0 ? PROP_STONE : PROP_STONE_LOW, style: { surf: y1 >= 0 ? PROP_SURF.top : PROP_SURF.mossy, broken: PROP_BROKEN }, seed });
    const { x0: px0, z0: pz0, z1: pz1 } = pond;
    const wx = pond.x1 - 0.5;
    const mouth = drain.z1;
    [0, -RISE, -2 * RISE].forEach((y1, s) => {
      const i = s * TREAD;
      course(px0 + 3 * TREAD, pz0 + i, wx, pz0 + TREAD + i, y1, 80 + s);
      course(px0 + i, pz1 - TREAD - i, wx, pz1 - i, y1, 83 + s);
      course(px0 + i, mouth, px0 + i + TREAD, pz1 - TREAD - i, y1, 86 + s);
    });
    course(wx, pz0, pond.x1, pz1, 0, 89);
    rim.add(px0, BED, pz0, px0 + 0.25, WATER_TOP - 0.0625, mouth, PROP_STONE_LOW[1], { surf: PROP_SURF.mossy, broken: PROP_BROKEN });
    // The steps' foundation, closing the pond at the back where the drain comes in.
    masonry(rim, px0, BED, pz0 - 0.5, px0 + 3 * TREAD, 0, pz0, { length: [0.5, 0.75], course: 0.25, palette: PROP_STONE_LOW, style: { surf: PROP_SURF.mossy, broken: PROP_BROKEN }, seed: 79 });
    rim.erode(0.12, 88, { where: (_x, y) => y > WATER_TOP });
    rim.emit(p.voxels, { seed: 8 });
    dress(p, rim, 89);
    colliders(p, rim);
    // The damp line: dark wet stone on the risers from the water up to the second step.
    const damp = (x0: number, z0: number, x1: number, z1: number) => p.voxels.span(x0, WATER_TOP, z0, x1, -RISE, z1, PROP_WET[0], 'sandstone', { surf: stoneSurf({ moss: 0.5, stain: 0.6 }) });
    const t2 = TEXEL / 2;
    damp(px0 + 3 * TREAD, pz0 + 2 * TREAD, wx, pz0 + 2 * TREAD + t2);
    damp(px0 + 2 * TREAD, pz1 - 2 * TREAD - t2, wx, pz1 - 2 * TREAD);
    damp(px0 + 2 * TREAD, mouth, px0 + 2 * TREAD + t2, pz1 - 2 * TREAD - t2);
    // The water (its sides tucked into the stone), a silt bed with sunken stones and its floor collider;
    // blockers over the open water past the submerged step and over the drain's mouth. The explorer walks
    // down to the dry step a hand above the water and stops at its edge (with its foot circle overlapping
    // that step there, it never stands on the submerged one).
    const inner = (px: number, pz: number) => px > px0 + 3 * TREAD && px < wx && pz > pz0 + 3 * TREAD && pz < pz1 - 3 * TREAD;
    const open = (px: number, pz: number) => inner(px, pz) || (pz < mouth && px > px0 + 0.3 && px < px0 + 3 * TREAD);
    waterBody(p, { x0: px0 + TEXEL, z0: pz0 + TEXEL, x1: wx + TEXEL, z1: pz1 - TEXEL, top: WATER_TOP, bed: BED, bottom: BED - 0.25, inside: open, stones: 0.4, seed: 9 });
    p.voxels.span(px0, WATER_TOP - 0.0625, pz0 + TEXEL, px0 + TEXEL, WATER_TOP, mouth, POND.water, 'water', { open: 4 });
    p.collider(px0 + 3 * TREAD, BED, pz0 + 3 * TREAD, wx, 0.45, pz1 - 3 * TREAD, true);
    p.collider(px0 + 0.25, BED, pz0, px0 + 3 * TREAD, 0.45, mouth, true);
    pondFlora(p, { top: WATER_TOP, x0: px0 + 3 * TREAD, z0: pz0 + 3 * TREAD, x1: wx - 0.1, z1: pz1 - 3 * TREAD, inside: inner, seed: 10, clusters: 7, pads: 6, flowers: 4, buds: 2, leaves: 6 });

    // ── Grass and moss: along the terrace foot and the steps, round the pond, in the joints and gaps, on the tiers.
    const heights = new Heights(AREA).add(p.colliders);
    // (the drain's channel kept clean; the water keeps itself)
    const green = new Greenery(p, heights, 62, [{ x0: drain.x0 - 0.1, z0: zc - 0.35, x1: POND_X0, z1: zc + 0.35 }]);
    for (const q of court.gaps) green.tuft((q.x0 + q.x1) / 2, (q.z0 + q.z1) / 2, { height: r.int(3, 5), radius: r.range(1.4, 2.2), lean: 0.6, tones: GRASS_TONES.lawn });
    const foot = (gx: number, gz: number) => heights.clear(gx, gz, 0.06) && heights.near(gx, gz, 0.5) < 0.35;
    for (const [gx, gz] of spots(63, AREA, 150, 0.3, foot)) {
      const pick = r();
      if (pick < 0.45) green.tuft(gx, gz, { height: r.int(3, 6), radius: r.range(1.2, 2.2), lean: 0.7, nub: 0.6, tones: r.chance(0.5) ? GRASS_TONES.meadow : GRASS_TONES.lawn });
      else if (pick < 0.65) green.plus(gx, gz, { height: r.int(2, 4), tones: GRASS_TONES.lawn });
      else if (pick < 0.85) green.fern(gx, gz, r.int(3, 5));
      else green.flower(gx, gz, FLOWER_TONES.yellow, r.int(1, 2));
    }
    for (const q of court.slabs) {
      if (!r.chance(0.15)) continue;
      const gx = r.chance(0.5) ? q.x0 : q.x1;
      const gz = r.range(q.z0, q.z1);
      if (heights.clear(gx, gz, 0.06)) green.plus(gx, gz, { height: r.int(2, 3), tones: GRASS_TONES.lawn });
    }
    // On the steps, the terrace edge, the tiers and the pond's steps: tufts where a ledge meets the stone above it.
    for (const [gx, gz] of spots(64, AREA, 170, 0.35, (sx, sz) => heights.at(sx, sz) > 0.2 || (sx > px0 - 0.3 && sz > pz0 && sz < pz1 + 0.3))) {
      const y = heights.at(gx, gz);
      if (heights.clear(gx, gz, 0.06, y) && heights.near(gx, gz, 0.6, y, 0.2) < 0.5) green.tuft(gx, gz, { height: r.int(2, 5), radius: r.range(1, 1.8), lean: 0.8, tones: r.chance(0.5) ? GRASS_TONES.meadow : GRASS_TONES.lawn });
    }
    // A few small tufts in the joints of the pond's steps.
    for (const [gx, gz] of spots(67, pond, 26, 0.5, (sx, sz) => heights.at(sx, sz) < 0.01 && heights.at(sx, sz) > WATER_TOP && heights.clear(sx, sz, 0.06, heights.at(sx, sz))))
      if (r.chance(0.6)) green.plus(gx, gz, { height: r.int(2, 3), tones: GRASS_TONES.lawn });
      else green.tuft(gx, gz, { height: r.int(2, 4), radius: 1.1, lean: 0.9, tones: GRASS_TONES.meadow });
    green.commit();

    // ── Fallen leaves on the court, the steps and the terrace.
    const clusters = spots(65, AREA, 16, 1.4, (cx, cz) => heights.clear(cx, cz, 0.25, heights.at(cx, cz))).map(([cx, cz]) => [cx, cz, r.int(4, 8)] as [number, number, number]);
    litter(p, heights, { area: AREA, clusters, singles: 80, palette: LITTER_MIX.fallen, seed: 66 });
  },
});
