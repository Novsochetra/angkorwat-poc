import { PointLight } from 'three';
import { valueNoise3 } from '../../voxel/random';
import { BlockSet, masonry } from '../BlockSet';
import { galleryFacade } from '../lib/gallery';
import { FLOWER_TONES, GRASS_TONES } from '../lib/grass';
import { LITTER_MIX } from '../lib/leaves';
import { FLOWER, OFFERING, SANDSTONE, SOIL } from '../palette';
import type { PieceBuilder } from '../PieceBuilder';
import { defineKitScene } from '../scene';
import { rng, type Rng } from '../shapes';
import { soilSurf, stoneSurf, type StoneFinish } from '../surface';
import type { KitPiece } from '../types';
import { complement, Greenery, Heights, litter, PAVE, paving, put, soilGround, spots, type Box, type Rect } from './_scenes20';

/**
 * §20 "Small shrine with offerings", the sheet's second environment panel: a
 * small prasat shrine stands against a temple gallery on a flagstone court,
 * an altar in front of it laid with joss sticks, candles, marigolds and lotus
 * buds; a broken seated Buddha beside it keeps its own candle altar, and
 * small oil lamps flicker on the flagstones. A doorway in the gallery with
 * its steps, grass in the joints, moss, a few fragments and fallen leaves —
 * a quiet, devotional corner in warm light.
 */
const AREA: Rect = { x0: -7, z0: -6, x1: 7, z1: 6 };
/** Front face of the gallery wall; its plinth moulding stands 0.25 m proud. */
const WALL_Z = -3.5;
/** Front face of the wing closing the court on the left (it looks +X). */
const WING_X = -6.25;
const COURT: Rect = { x0: WING_X + 0.25, z0: WALL_Z + 0.25, x1: 7, z1: 6 };
/** The corner pier where the wing meets the gallery. */
const PIER: Box = [WING_X - 1.25, 0, WALL_Z - 1.0, WING_X + 0.5, 6.25, WALL_Z + 0.5];
/** Height of the gallery's plinth: the door sill the steps climb to. */
const SILL = 1;
/** Where the shrine and the Buddha stand along the wall. */
const SHRINE_X = -2;
const BUDDHA_X = 1.3;

/** The gallery: the kit's warm sandstone gone mossy and streaked, like the sheet's wall. */
const GALLERY: StoneFinish = {
  palette: [...SANDSTONE.mossy, SANDSTONE.warm[1], SANDSTONE.warm[3], SANDSTONE.weathered[2]],
  surf: stoneSurf({ moss: 0.34, stain: 0.4, lichen: 0.1, crack: 0.05 }),
  wear: 0.22,
};

/** Clay oil lamps and marigolds on the flagstones: a dish, a wick, a flame. */
function lamps(p: PieceBuilder, r: Rng, at: readonly [number, number][]): void {
  for (const [x, z] of at) {
    p.voxels.box(x, 0.015, z, 0.075, 0.03, 0.075, 0x7c512e, 'wood');
    p.voxels.box(x, 0.032, z, 0.05, 0.006, 0.05, 0x3a2a1c, 'wood');
    p.voxels.box(x, 0.048, z, 0.022, 0.024, 0.022, OFFERING.ember, 'glow');
    p.voxels.box(x, 0.066, z, 0.012, 0.016, 0.012, OFFERING.flame, 'glow');
    // A marigold head or two beside it.
    for (let n = r.int(1, 2); n > 0; n--) {
      const a = r.range(0, Math.PI * 2);
      const s = r.range(0.042, 0.052);
      const tone = r.pick([...OFFERING.marigold, ...FLOWER.yellow]);
      const [mx, mz] = [x + Math.cos(a) * 0.09, z + Math.sin(a) * 0.09];
      p.voxels.box(mx, s * 0.3, mz, s, s * 0.6, s, tone, 'petal', { ry: a });
      p.voxels.box(mx, s * 0.68, mz, s * 0.7, s * 0.3, s * 0.7, tone, 'petal', { ry: a + Math.PI / 4 });
    }
  }
}

/** Top of a piece's highest collider (a flight's top tread). */
const topOf = (piece: KitPiece) => Math.max(...piece.colliders.map((c) => c.max[1]));

/** Footprint of a piece's solid parts (its colliders), to set pieces a given gap apart. */
function extent(piece: KitPiece): { x0: number; z0: number; x1: number; z1: number } {
  const cs = piece.colliders;
  return { x0: Math.min(...cs.map((c) => c.min[0])), z0: Math.min(...cs.map((c) => c.min[2])), x1: Math.max(...cs.map((c) => c.max[0])), z1: Math.max(...cs.map((c) => c.max[2])) };
}

export default defineKitScene({
  name: 'Small shrine with offerings',
  caption: 'A small prasat shrine against a temple gallery, an altar of incense, candles and flowers before it, a broken Buddha with its own candles, oil lamps on the flagstones.',
  source: '20 Small props · Environment examples · Small shrine with offerings',
  size: [14, 12],
  camera: { az: 18, el: 22, dist: 9.6, target: [-0.9, 1.1, -1.6] },
  spawn: { x: 0, z: 4.6, yaw: 180 },
  async build(ctx, p) {
    const r = rng(40);

    // ── The court: big flagstones, a few cracked, heaved or gone, grass in the gaps.
    const court = paving(p, {
      area: COURT,
      rows: [0.625, 1.0],
      lengths: [0.75, 1.5],
      palette: PAVE,
      surf: (_x, z, q) => stoneSurf({ moss: 0.08 + q() * 0.18 + (z < -1.5 ? 0.15 : 0), lichen: 0.12, stain: 0.3, crack: q.chance(0.2) ? 0.35 : 0.04 }),
      seed: 41,
      missing: (x, z) => 0.03 + 0.12 * Math.max(0, valueNoise3(x * 0.5, 2, z * 0.5, 7) - 0.45) * 4,
      heave: () => 0.12,
      broken: 0.1,
      soil: soilSurf({ grass: 0.75, moss: 0.4 }),
    });
    soilGround(p, complement(AREA, [COURT]), { color: SOIL.dirt[0], surf: soilSurf({ grass: 0.6, moss: 0.3 }) });

    // ── The gallery behind: a windowed wall on the left, a doorway on the right with its steps; a wing
    // closing the court on the left, a pier at the corner.
    put(p, galleryFacade({ length: 8, finish: GALLERY, seed: 42, openEnds: true, gallery: 2.5 }), { x: -3, y: 0, z: WALL_Z }, [PIER]);
    put(p, galleryFacade({ length: 6, bay: 6, door: true, finish: GALLERY, seed: 43, openEnds: true, gallery: 2.5 }), { x: 4, y: 0, z: WALL_Z });
    put(p, galleryFacade({ length: 4.75, bay: 4.75, finish: GALLERY, seed: 49, openEnds: true }), { x: WING_X, y: 0, z: WALL_Z + 2.375, turn: 1 }, [PIER]);
    const pier = new BlockSet(0.125);
    masonry(pier, PIER[0], PIER[1], PIER[2], PIER[3], PIER[4], PIER[5], { length: [0.5, 0.75], course: 0.5, palette: GALLERY.palette, style: { surf: GALLERY.surf }, seed: 50 });
    pier.erode(GALLERY.wear, 51);
    pier.emit(p.voxels, { seed: 52 });
    p.collider(PIER[0], PIER[1], PIER[2], PIER[3], PIER[4], PIER[5]);
    const steps = await ctx.get('20/stone-steps', { variant: 'narrow', seed: 3 });
    if (steps) {
      // Back against the plinth, the top tread at the sill (a taller flight sinks its bottom step into the court).
      const back = Math.min(...steps.colliders.map((c) => c.min[2]));
      put(p, steps, { x: 4, y: SILL - topOf(steps), z: WALL_Z + 0.25 - back });
    }

    // ── The shrine and its altar, the Buddha and its candles: each altar a hand in front of what it serves.
    const shrine = await ctx.get('20/small-shrine', { variant: 'prasat', seed: 2 });
    const shrineZ = WALL_Z + 0.35 - (shrine ? extent(shrine).z0 : -0.64);
    put(p, shrine, { x: SHRINE_X, y: 0, z: shrineZ });
    // (a size up, broad as the shrine's plinth like the sheet's; its offerings stay life-size)
    const altar = await ctx.get('20/offering-platform', { variant: 'full', seed: 1, height: 0.7 });
    const altarZ = shrineZ + (shrine ? extent(shrine).z1 : 0.88) + 0.18 - (altar ? extent(altar).z0 : -0.47);
    put(p, altar, { x: SHRINE_X, y: 0, z: altarZ });
    const buddha = await ctx.get('20/broken-statue', { variant: 'buddha', seed: 1 });
    const buddhaZ = WALL_Z + 0.4 - (buddha ? extent(buddha).z0 : -0.38);
    put(p, buddha, { x: BUDDHA_X, y: 0, z: buddhaZ });
    const candles = await ctx.get('20/offering-platform', { variant: 'candles', seed: 2 });
    put(p, candles, { x: BUDDHA_X, y: 0, z: buddhaZ + (buddha ? extent(buddha).z1 : 0.75) + 0.15 - (candles ? extent(candles).z0 : -0.38) });
    // Oil lamps on the flagstones either side of the altar and before it, one each side of the candle altar.
    const a = altar ? extent(altar) : { x0: -0.78, x1: 0.78, z0: -0.47, z1: 0.47 };
    lamps(p, r, [
      [SHRINE_X + a.x0 - 0.3, altarZ - 0.1],
      [SHRINE_X + a.x1 + 0.3, altarZ - 0.12],
      [SHRINE_X + a.x0 + 0.25, altarZ + a.z1 + 0.28],
      [SHRINE_X + a.x1 - 0.25, altarZ + a.z1 + 0.3],
      [BUDDHA_X - 0.85, buddhaZ + 1.3],
      [BUDDHA_X + 0.85, buddhaZ + 1.35],
    ]);
    const glow = new PointLight(0xffa24a, 1.1, 4.5, 2);
    glow.position.set(SHRINE_X, 0.45, altarZ + 0.35);
    glow.name = 'shrine-lamps';
    p.extras.push(glow);
    // (the offerings and lamps are kept clear of grass and leaves)
    const clearOfAltars = (x: number, z: number, m: number) => Math.hypot(x - SHRINE_X, z - altarZ) > 1.2 + m && Math.hypot(x - BUDDHA_X, z - buddhaZ - 1.1) > 0.9 + m;

    // ── Ruin and nature: a fallen head by the wall, a broken pedestal, fragments, grass clumps.
    put(p, await ctx.get('20/broken-statue', { variant: 'head', seed: 2 }), { x: -5.3, y: 0, z: -1.5, turn: 1 });
    put(p, await ctx.get('20/broken-statue', { variant: 'rubble', seed: 3 }), { x: 5.6, y: 0, z: 2.0, turn: 3 });
    put(p, await ctx.get('20/stone-fragments', { variant: 'small', seed: 6 }), { x: -4.4, y: 0, z: 0.9 });
    put(p, await ctx.get('20/stone-fragments', { variant: 'mossy', seed: 7 }), { x: 2.9, y: 0, z: 2.8 });
    put(p, await ctx.get('20/grass-patches', { variant: 'flowering', seed: 3 }), { x: -5.1, y: 0, z: -2.75 });
    put(p, await ctx.get('20/grass-patches', { variant: 'bushy', seed: 5 }), { x: 5.9, y: 0, z: -2.7 });
    put(p, await ctx.get('20/grass-patches', { variant: 'tall', seed: 6 }), { x: -0.35, y: 0, z: -2.85 });
    put(p, await ctx.get('20/grass-patches', { variant: 'wild', seed: 2 }), { x: -5.8, y: 0, z: 3.6 });

    // ── Grass in the gaps and the joints, thicker along the wall's foot, small plants by the stones.
    const heights = new Heights(AREA).add(p.colliders);
    const green = new Greenery(p, heights, 44);
    for (const q of court.gaps) green.tuft((q.x0 + q.x1) / 2, (q.z0 + q.z1) / 2, { height: r.int(3, 5), radius: r.range(1.4, 2.2), lean: 0.6, tones: GRASS_TONES.lawn });
    // Along the joints: a tuft where a row's joint meets the next.
    for (const q of court.slabs) {
      if (!r.chance(0.3)) continue;
      const x = r.chance(0.5) ? q.x0 : q.x1;
      const z = r.range(q.z0, q.z1);
      if (!heights.clear(x, z, 0.06) || !clearOfAltars(x, z, 0)) continue;
      if (r.chance(0.6)) green.plus(x, z, { height: r.int(2, 3), tones: GRASS_TONES.lawn });
      else green.tuft(x, z, { height: r.int(2, 4), radius: 1, lean: 0.8, tones: GRASS_TONES.meadow });
    }
    for (const [x, z] of spots(45, { x0: -7, z0: WALL_Z + 0.25, x1: 7, z1: WALL_Z + 0.8 }, 40, 0.3, (x, z) => heights.clear(x, z, 0.06))) {
      if (r.chance(0.6)) green.tuft(x, z, { height: r.int(3, 6), radius: r.range(1.3, 2.2), lean: 0.7, tones: r.chance(0.5) ? GRASS_TONES.meadow : GRASS_TONES.lawn });
      else if (r.chance(0.5)) green.fern(x, z, r.int(3, 4));
      else green.flower(x, z, r.chance(0.5) ? FLOWER_TONES.yellow : FLOWER_TONES.cream, r.int(1, 2));
    }
    for (const [x, z] of spots(46, AREA, 60, 0.5, (x, z) => heights.clear(x, z, 0.08) && heights.near(x, z, 0.7) < 0.6 && clearOfAltars(x, z, 0))) {
      if (r.chance(0.55)) green.tuft(x, z, { height: r.int(2, 5), radius: r.range(1, 1.8), lean: 0.8, tones: GRASS_TONES.meadow });
      else green.plant(x, z, { tones: GRASS_TONES.lawn });
    }
    green.commit();

    // ── A few leaves blown in against the wall and round the stones.
    const clusters = spots(47, { x0: -7, z0: WALL_Z + 0.3, x1: 7, z1: 5.5 }, 10, 1.5, (x, z) => heights.clear(x, z, 0.25) && clearOfAltars(x, z, 0.3)).map(([x, z]) => [x, z, r.int(4, 8)] as [number, number, number]);
    litter(p, heights, { area: COURT, clusters, singles: 45, palette: LITTER_MIX.fallen, seed: 48, keep: (x, z) => clearOfAltars(x, z, 0) });
  },
});
