import { hash3, valueNoise3 } from '../../voxel/random';
import { FLOWER_TONES, GRASS_TONES } from '../lib/grass';
import { LITTER_MIX } from '../lib/leaves';
import { SOIL } from '../palette';
import { defineKitScene } from '../scene';
import { rng } from '../shapes';
import { soilSurf, stoneSurf } from '../surface';
import { complement, Greenery, Heights, litter, outside, PAVE, paving, pillarStub, put, ruinWall, soilGround, spots, WALL, type Box, type Rect } from './_scenes20';

/**
 * §20 "Fragments and vegetation": a corner of a ruined temple court taken
 * back by the forest, as in the sheet's first environment panel. A mossy
 * wall with pilasters closes the back and the left, broken down towards the
 * right where it has collapsed into a heap of blocks; a strangler fig rises
 * behind the rubble and pours its buttress roots over it and the broken
 * paving, a root cluster among them; a rotted stump holds a stone. Fallen blocks
 * lie heaped in the middle, lintels, drums and fragments between them, pillar
 * stubs before the wall — grass, ferns and moss in every gap, fallen leaves
 * everywhere.
 */
const AREA: Rect = { x0: -8, z0: -7, x1: 8, z1: 7 };
/** Front face of the back wall; its plinth stands 0.25 m proud. */
const WALL_Z = -5;
/** Front face of the left wall (it looks +X). */
const SIDE_X = -7;
/** What is left of the court's paving. */
const COURT: Rect = { x0: SIDE_X + 0.25, z0: WALL_Z + 0.25, x1: 1.5, z1: 3.5 };

const wallSurf = (y: number) => stoneSurf({ moss: Math.min(0.7, 0.22 + y * 0.1), lichen: 0.12, stain: 0.45, crack: 0.08 });

export default defineKitScene({
  name: 'Fragments and vegetation',
  caption: 'Fallen blocks, fragments and pillar stubs in a ruined court, a strangler fig’s roots pouring over the rubble, grass, ferns and leaves in every gap.',
  source: '20 Small props · Environment examples · Fragments and vegetation',
  size: [16, 14],
  camera: { az: 16, el: 24, dist: 11.5, target: [0.3, 0.9, -1.3] },
  spawn: { x: -0.5, z: 6.2, yaw: 180 },
  async build(ctx, p) {
    const r = rng(20);

    // ── Ground: sandy soil, the old court's paving breaking up towards the tree and the front.
    const court = paving(p, {
      area: COURT,
      palette: PAVE,
      surf: (_x, _z, q) => stoneSurf({ moss: 0.12 + q() * 0.25, lichen: 0.12, stain: 0.4, crack: q.chance(0.25) ? 0.4 : 0.05 }),
      seed: 21,
      missing: (x, z) => 0.22 + 0.5 * Math.max(0, Math.min(1, (x + 2.5) / 4)) + 0.4 * Math.max(0, (z - 0.5) / 3) + (valueNoise3(x * 0.6, 1, z * 0.6, 4) - 0.5) * 0.6,
      heave: (x) => (x > -3 ? 0.5 : 0.2),
      broken: 0.15,
      soil: soilSurf({ grass: 0.45, moss: 0.3, dry: 0.3 }),
    });
    soilGround(p, complement(AREA, [COURT]), { color: SOIL.dry[0], surf: soilSurf({ grass: 0.2, moss: 0.12, dry: 0.45 }) });

    // ── The walls: tall at the back left, broken down to the right where they fell; the left one lower towards the front.
    const c0 = p.colliders.length;
    const backTop = (x: number) => {
      const wx = x - 2.75;
      const n = valueNoise3(wx * 0.9, 3, 1, 8) - 0.5;
      if (wx < -3) return 4.4 + n * 1.1;
      if (wx < 0.3) return 4.2 - (wx + 3) * 0.75 + n;
      return Math.max(0.6, 1.5 - (wx - 0.3) * 0.4 + n * 0.8);
    };
    put(p, ruinWall({ length: 10.5, top: backTop, palette: WALL, surf: wallSurf, wear: 0.28, seed: 24, pilasters: [-2.75, -0.25, 2.25], plinth: true, holes: 0.05 }), { x: -2.75, y: 0, z: WALL_Z });
    // (local x runs from the front end, z = −0.5, to the corner)
    const sideTop = (x: number) => 1.1 + (x + 2.125) * 0.72 + (valueNoise3(x * 1.1, 5, 2, 9) - 0.5) * 0.9;
    put(p, ruinWall({ length: 4.25, top: sideTop, palette: WALL, surf: wallSurf, wear: 0.3, seed: 25, pilasters: [0.25], plinth: true, holes: 0.06 }), { x: SIDE_X, y: 0, z: -2.625, turn: 1 });
    const walls: Box[] = p.colliders.slice(c0).map((c) => [...c.min, ...c.max] as unknown as Box);

    // Pillar stubs of a colonnade that stood before the back wall.
    put(p, pillarStub({ size: 0.625, height: 2.6, palette: WALL, surf: wallSurf, wear: 0.3, seed: 31 }), { x: -5.5, y: 0, z: -3.3 });
    put(p, pillarStub({ size: 0.625, height: 1.3, palette: WALL, surf: wallSurf, wear: 0.35, seed: 32 }), { x: -3.0, y: 0, z: -3.3 });

    // ── The strangler fig behind the collapse, its roots trimmed at the diorama's edge; the
    // stones in its grip are the ruin's own (weathered, not the fresh blocks of the tree card).
    const fig = put(p, await ctx.get('18.1/large-tree', { seed: 3, height: 16 }), { x: 6, y: 0, z: -5.9 }, [...walls, ...outside(AREA, 7)]);
    for (const b of p.voxels.boxes.slice(fig)) if (b.mat === 'sandstone') b.color = WALL[Math.floor(hash3(Math.round(b.x * 4), Math.round(b.y * 4), Math.round(b.z * 4), 27) * WALL.length)];

    // ── Fallen architecture: the collapse at the wall's end, the big heap in the middle, a relief, lintels, drums.
    put(p, await ctx.get('20/fallen-blocks', { variant: 'pile', seed: 2 }), { x: 1.3, y: 0, z: -3.8, turn: 2 });
    put(p, await ctx.get('20/fallen-blocks', { variant: 'pile', seed: 1 }), { x: -1.3, y: 0, z: -1.2 });
    put(p, await ctx.get('20/fallen-blocks', { variant: 'pile', seed: 3 }), { x: -2.4, y: 0, z: 0.2, turn: 2 });
    put(p, await ctx.get('20/fallen-blocks', { variant: 'carved', seed: 2 }), { x: 0.9, y: 0, z: 0.1, turn: 3 });
    put(p, await ctx.get('20/fallen-blocks', { variant: 'lintel', seed: 3 }), { x: -5.3, y: 0, z: 0.9, turn: 1 });
    put(p, await ctx.get('20/fallen-blocks', { variant: 'column', seed: 1 }), { x: 3.3, y: 0, z: 1.8, turn: 3 });

    // ── More roots: a gnarled cluster among the fig's own; a rotted stump on the broken paving in front,
    // one of its roots bowed over a fallen stone.
    put(p, await ctx.get('20/roots', { variant: 'cluster', seed: 3 }), { x: 3.9, y: 0, z: -1.6 });
    put(p, await ctx.get('20/roots', { variant: 'stump', seed: 1 }), { x: -5.2, y: 0, z: 3.2 });
    put(p, await ctx.get('20/roots', { variant: 'over-stone', seed: 2 }), { x: -3.1, y: 0, z: 4.6, turn: 1 });

    // ── Fragments and debris over the front.
    put(p, await ctx.get('20/stone-fragments', { variant: 'scatter', seed: 1 }), { x: 1.9, y: 0, z: 4.5 });
    put(p, await ctx.get('20/stone-fragments', { variant: 'large', seed: 2 }), { x: 5.0, y: 0, z: 3.6 });
    put(p, await ctx.get('20/stone-fragments', { variant: 'mossy', seed: 3 }), { x: -0.8, y: 0, z: 2.5 });
    put(p, await ctx.get('20/stone-fragments', { variant: 'small', seed: 4 }), { x: -1.2, y: 0, z: 5.6 });
    put(p, await ctx.get('20/stone-fragments', { variant: 'small', seed: 5 }), { x: -6.6, y: 0, z: 5.7 });

    // ── Grass clumps from the kit.
    put(p, await ctx.get('20/grass-patches', { variant: 'bushy', seed: 2 }), { x: -3.9, y: 0, z: 1.7 });
    put(p, await ctx.get('20/grass-patches', { variant: 'tall', seed: 3 }), { x: 0.3, y: 0, z: -2.3 });
    put(p, await ctx.get('20/grass-patches', { variant: 'wild', seed: 1 }), { x: -6.2, y: 0, z: 1.2 });
    put(p, await ctx.get('20/grass-patches', { variant: 'tall', seed: 5 }), { x: 4.0, y: 0, z: 5.6 });
    put(p, await ctx.get('20/grass-patches', { variant: 'bushy', seed: 4 }), { x: 6.8, y: 0, z: 0.6 });

    // ── Grass, ferns and flowers: clumps at the foot of the stones and walls, a few out on the
    // open ground, seedlings on the rubble tops, tufts in the gaps of the paving.
    const heights = new Heights(AREA).add(p.colliders);
    const green = new Greenery(p, heights, 22);
    for (const q of court.gaps) if (r.chance(0.55)) green.tuft((q.x0 + q.x1) / 2 + r.range(-0.15, 0.15), (q.z0 + q.z1) / 2 + r.range(-0.1, 0.1), { height: r.int(3, 6), radius: r.range(1.2, 2.2), lean: 0.6, tones: r.chance(0.5) ? GRASS_TONES.lawn : GRASS_TONES.meadow });
    for (const [x, z] of spots(23, AREA, 240, 0.35, (x, z) => heights.clear(x, z, 0.1))) {
      const near = heights.near(x, z, 0.8);
      if (near > 0.45 && !r.chance(0.1)) continue;
      const pick = r();
      if (near <= 0.45 && pick < 0.3) green.clump(x, z, { rx: r.range(3, 6), rz: r.range(3, 5), height: r.int(5, 8), gap: 2.6, radius: 1.5, lean: 0.8, nub: 0.7, tones: r.chance(0.5) ? GRASS_TONES.meadow : GRASS_TONES.lawn });
      else if (pick < 0.55) green.fern(x, z, r.int(4, 6));
      else if (pick < 0.7) green.tuft(x, z, { height: r.int(3, 6), radius: r.range(1.2, 2), lean: 0.7, nub: 0.6, tones: GRASS_TONES.lawn });
      else if (pick < 0.8) green.plant(x, z, { tones: GRASS_TONES.lawn });
      else if (pick < 0.9) green.plus(x, z, { height: r.int(2, 4), tones: GRASS_TONES.lawn });
      else green.flower(x, z, FLOWER_TONES.yellow, r.int(1, 3));
    }
    for (const [x, z] of spots(24, AREA, 60, 0.45, (x, z) => heights.at(x, z) > 0.3 && heights.range(x, z, 0.1).lo > heights.at(x, z) - 0.02)) {
      if (r.chance(0.45)) green.tuft(x, z, { height: r.int(2, 4), radius: 1.2, lean: 0.8, tones: GRASS_TONES.lawn });
      else if (r.chance(0.6)) green.fern(x, z, r.int(3, 4));
      else green.sprout(x, z, GRASS_TONES.lawn);
    }
    green.commit();

    // ── Fallen leaves: rosettes by the stones, loose leaves everywhere.
    const clusters = spots(25, AREA, 28, 1.1, (x, z) => heights.clear(x, z, 0.2) && heights.near(x, z, 1.2) < 1.1).map(([x, z]) => [x, z, r.int(5, 9)] as [number, number, number]);
    litter(p, heights, { area: AREA, clusters, singles: 170, palette: LITTER_MIX.fallen, seed: 26 });
  },
});
