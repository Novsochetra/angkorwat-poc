import { hash3, valueNoise3 } from '../../voxel/random';
import { DryMasonry, FACE, finish, finishLook, galleryFacade, overgrow, type Box6, type StoneLook } from '../lib/gallery';
import { fromSheet, SANDSTONE, SOIL } from '../palette';
import { defineKitScene } from '../scene';
import { here, rng } from '../shapes';
import { soilSurf, stoneSurf, type StoneFinish } from '../surface';
import { flight, footMoss, PAVE, paving, place, tower, tuftsAt } from './_gallery-scenes';

/**
 * §19.2 "In-game usage examples · Weathered gallery wall": a long Angkor
 * gallery seen along its length — a colonnade of stout turned columns between
 * massive square piers, standing on a raised, stepped plinth, under a
 * cornice and corbelled roof — after centuries of monsoon: dark run-off
 * streaks, moss on every ledge and hanging over the steps, grass in the
 * joints, stones missing and split, and the jungle rising behind the roof.
 * Worn paving in front, moss creeping out from the foot of the steps.
 */

/** Front face of the colonnade. */
const FW = -1.5;
/** The stepped plinth: six risers of 0.25 m, 0.3125 m treads, a walk along the top. */
const STEPS = 6;
const RISE = 0.25;
const RUN = 0.3125;
const TOP = STEPS * RISE;
const FOOT = FW + 0.75 + (STEPS - 1) * RUN;
/** Depth of the gallery behind the colonnade. */
const G = 2.5;
const BACK = FW - 1 - G;
const X0 = -15;
const X1 = 15;

/**
 * The panel's stone: the weathered finish's grime, moss and wear on the
 * greyer brown the sheet paints it (lit faces #75665b–#a48a70), not the
 * warmer brown of the §19.1 weathered sample.
 */
const STONE: StoneFinish = { ...finish('weathered'), palette: [0x75665b, 0x83715f, 0x6b5d52, 0x8f7a66, 0x9c8670].map(fromSheet) };

export default defineKitScene({
  name: 'Weathered gallery wall',
  caption: 'A long gallery wall after centuries of monsoon: dark streaks, moss on the ledges and at the foot, grass in the joints, stones missing and cracked, the jungle behind.',
  source: '19.2 Stone damage · In-game usage examples · Weathered gallery wall',
  size: [30, 14],
  camera: { az: -42, el: 3, dist: 19, target: [1.5, 4, FW] },
  spawn: { x: -6, z: 4.5, yaw: 150 },
  async build(ctx, p) {
    const f = STONE;
    const r = rng(192);

    // ── Worn paving in front: grey-tan slabs, moss and grass in the joints ──
    const slabs = [...SANDSTONE.clean, SANDSTONE.cracked[1], SANDSTONE.mossy[2]];
    paving(p, {
      x0: X0,
      z0: FOOT,
      x1: X1,
      z1: 7,
      row: 0.875,
      seed: 290,
      bed: SANDSTONE.weathered[1],
      look: (x, z): StoneLook => {
        const h = hash3(Math.round(x * 16), 2, Math.round(z * 16), 291);
        const n = valueNoise3(x / 2, 0.5, z / 2, 292);
        const near = Math.max(0, 1 - (z - FOOT) / 3);
        return {
          color: slabs[Math.floor(h * slabs.length)],
          shade: 0.92 + (hash3(Math.round(x * 16), 3, Math.round(z * 16), 293) - 0.5) * 0.14,
          surf: stoneSurf({ moss: 0.1 + 0.45 * n * n + 0.3 * near, lichen: 0.18, stain: 0.12 + 0.3 * n * near, crack: h > 0.82 ? 0.45 : 0 }),
        };
      },
      missing: (_x, z) => (z > FOOT + 1 ? 0.05 : 0),
      grass: (_x, z) => 0.25 + 0.4 * Math.max(0, 1 - (z - FOOT) / 2.5),
    });

    // ── The raised, stepped plinth: walkable steps running under the gallery ─
    const m = new DryMasonry(29);
    const plinthLook = finishLook(f, 301, { moss: 0.25 });
    const treads = flight(m, p, { x0: X0, x1: X1, zFoot: FOOT, zBack: BACK, n: STEPS, rise: RISE, run: RUN, look: plinthLook, length: [0.75, 1.75], closed: FACE.ny });
    // Age: stones knocked out of the risers, a few split, arrises chipped.
    const risers = m.stones.filter((s) => s.box[3] - s.box[0] >= 0.75 && s.box[0] > X0 + 3 && s.box[3] < X1 - 1);
    const take = () => risers.splice(r.int(0, risers.length - 1), 1)[0];
    for (let k = 0; k < 3 && risers.length; k++) m.knockOut(take(), 0.375);
    for (let k = 0; k < 4 && risers.length; k++) m.crack(take(), r.int(1, 1e6));
    for (const s of risers) if (r.chance(0.3)) m.chip(s, r.int(1, 1e6));
    m.emit(p.voxels);
    // Moss cushions hanging over the treads, grass in their joints.
    overgrow(p, treads, 0.85, 0.75, 303);

    // ── The colonnade: stout turned columns between massive square piers ────
    const facade = galleryFacade({
      length: X1 - X0,
      bay: 3.75,
      finish: f,
      seed: 305,
      gallery: G,
      plinth: 0.25,
      sill: 0.5,
      lintel: 3,
      height: 3.875,
      window: 2.25,
      balusters: 4,
      pilaster: { width: 1.25, depth: 0.5 },
      weather: { streaks: 0.85, moss: 0.75, grass: 0.6, missing: 3, cracked: 4 },
    });
    place(p, facade, { x: 0, y: TOP, z: FW });

    // ── Moss and grass at the foot of the steps, a few fallen fragments ─────
    footMoss(p, { x0: X0, x1: X1, y: PAVE, z: FOOT, amount: (x) => 0.55 + 0.35 * valueNoise3(x / 3, 0.5, 0.5, 307), seed: 307 });
    const foot: [number, number, number][] = [];
    for (let x = X0 + 0.3; x < X1 - 0.3; x += r.range(0.3, 0.9)) if (r.chance(0.55)) foot.push([x, 0, FOOT + r.range(0.16, 0.3)]);
    tuftsAt(p, foot, { seed: 309, height: [3, 6], full: 0.5 });
    for (const [variant, x, z, seed] of [['small', -4.2, FOOT + 1.2, 3], ['mossy', 6.8, FOOT + 0.9, 4]] as const) place(p, await ctx.get('20/stone-fragments', { variant, seed }), { x, y: 0, z });
    for (const [variant, x, z, seed] of [['tuft', -9.5, FOOT + 0.5, 5], ['tall', 1.8, FOOT + 0.4, 6], ['wild', 11.5, FOOT + 0.6, 7]] as const) place(p, await ctx.get('20/grass-patches', { variant, seed }), { x, y: 0, z });

    // ── Jungle behind the roof ───────────────────────────────────────────────
    p.voxels.span(X0, -0.5, -7, X1, 0, BACK, SOIL.dirt[0], 'soil', { surf: soilSurf({ grass: 0.85, moss: 0.35 }), open: 4 | 1 | 2 | 32, src: here() });
    p.collider(X0, -0.5, -7, X1, 0, BACK);
    // A tower rising behind the far end, as in the panel.
    const tm = new DryMasonry(311);
    const TX = 10.5;
    const TZ = BACK - 3.25;
    tower(tm, p, { x: TX, y: 0, z: TZ, w: 4.5, d: 4, height: 16.5, body: 9, look: finishLook(f, 312, { moss: 0.2, streaks: (x) => (Math.abs(x - TX + 0.6) < 0.3 ? 0.8 : 0.35) }) });
    tm.emit(p.voxels);
    // (the canopies stop at the gallery and the tower: their blocks inside them are dropped)
    const gallery: Box6 = [X0 - 1, 0, BACK - 0.01, X1 + 1, TOP + 7, FOOT];
    const towerBox: Box6 = [TX - 2.75, 0, TZ - 2.5, TX + 2.75, 17, TZ + 2.5];
    const trees: [string, number, number, number, number][] = [
      ['18.1/large-tree', -3, -9, 2, 19],
      ['18.1/palm-tree', 4.5, -6.3, 6, 15],
      ['18.1/medium-tree', 16, -5.8, 8, 12],
    ];
    for (const [id, x, z, seed, height] of trees) place(p, await ctx.get(id, { seed, height }), { x, y: 0, z }, [gallery, towerBox]);
  },
});
