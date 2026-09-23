import { hash3, valueNoise3 } from '../../voxel/random';
import { onTop } from '../assets/18.2/_tiles';
import { BlockSet } from '../BlockSet';
import { DryMasonry, FACE, finish, finishLook, galleryFacade, type Box6 } from '../lib/gallery';
import { GRASS_TONES } from '../lib/grass';
import { FLOWER, SANDSTONE } from '../palette';
import { placePiece } from '../place';
import { defineKitScene } from '../scene';
import { rng, TEXEL } from '../shapes';
import { soilSurf, stoneSurf } from '../surface';
import type { KitCollider } from '../types';
import { GroundPlan, Greenery, jointMoss, layGround, NONE, PAVE, pave, soil, spots, tile, type Cell } from './_scenes182';

/**
 * §18.2 "In-game usage examples" — Temple path with moss and grass: worn
 * sandstone paving running away between the terraces of a temple, moss and
 * grass in its joints, its edges going back to grass through the §18.2 tiles
 * (broken and worn path tiles, moss, grass), a gallery with a dark doorway and a
 * stepped platform at the far end, a mossy terrace wall along the right.
 */
const PATH = { x0: -4, x1: 4, z0: -9, z1: 15 };
/** The part of the path the studio camera sees: tiles there, plain ground towards the viewer. */
const SEEN_Z = 7;
/** Terrace wall along the right of the path (its face at x = WALL), its height, the upper tier's face and top. */
const WALL = 5;
const WALL_H = 3;
const UPPER = 8;
const UPPER_H = 5.5;
/** The stepped platform at the far end: tier fronts and heights, a back wall on top. */
const TIERS: [number, number][] = [
  [-9, 1],
  [-11, 2],
  [-13, 3],
];
const BACK_H = 6.5;
/** The flight up the platform, on the path's axis. */
const STAIR = { x0: -1.25, x1: 1.25 };

/** Slab tones: the sandstone-path tile's (sheet tops) and the panel's sunlit slabs, a shade warmer. */
const SLAB = [0xe2b584, 0xd6a878, 0xcf9f72, 0xe1ac76, 0xe7b077, 0xd49b67, 0xecb77f].map(onTop);
/** Old terrace masonry: the panel's grey-brown blocks (its sunlit ones), a few warmer and one mossy. */
const WALL_STONE = [0x7b6d61, 0x70635a, 0x857669, 0x675b52, 0x8e7f70, 0x5f544c, SANDSTONE.weathered[2], SANDSTONE.mossy[1]];
/** Earth of the terrace fills and the lawn: dark brown under grass. */
const EARTH = 0x6e5a44;
const LAWN = { color: EARTH, surf: soilSurf({ grass: 1, moss: 0.25 }) };

export default defineKitScene({
  name: 'Temple path',
  caption: 'Worn sandstone paving between temple terraces, moss and grass in the joints, the edges going back to grass through the §18.2 tiles.',
  source: '18.2 Ground · In-game usage examples · Temple path with moss and grass',
  size: [20, 30],
  camera: { az: -28, el: 17, dist: 16, target: [0.5, 0.6, -2] },
  spawn: { x: 0, z: 13, yaw: 180 },
  async build(ctx, p) {
    const target = { voxels: p.voxels, collider: (c: KitCollider) => p.colliders.push(c) };
    const r = rng(182);
    const noise = (x: number, z: number, s: number) => valueNoise3(x * 0.45, 0.5, z * 0.45, s);

    // ── The floor plan ───────────────────────────────────────────────────────
    const plan = new GroundPlan(-10, -15, 20, 30, soil(LAWN));
    plan.rect(PATH.x0, PATH.z0, PATH.x1, PATH.z1, PAVE);
    plan.rect(WALL, -15, 10, 15, NONE);
    plan.rect(-3, -15, WALL, PATH.z0, NONE);
    plan.rect(-10, -15, -3, -11, NONE);
    // Edges going back to grass: broken and worn path tiles next to the slabs,
    // then moss, then grass — ragged, so the paving frays rather than stops.
    plan.rect(-6, PATH.z0, PATH.x0, SEEN_Z, (i, k): Cell => {
      const n = noise(i, k, 5);
      const turn = r.int(0, 3);
      if (plan.x0 + i === PATH.x0 - 1) return n < 0.3 ? PAVE : n < 0.55 ? tile('18.2/sandstone-path', 'worn', 1, turn) : n < 0.75 ? tile('18.2/sandstone-path', 'broken', 1, turn) : tile('18.2/moss', 'stone', 1, turn);
      return n < 0.3 ? tile('18.2/moss', 'light', 1, turn) : n < 0.45 ? tile('18.2/moss', 'dense', 1, turn) : n < 0.8 ? tile('18.2/grass', 'patchy', 1, turn) : tile('18.2/grass', 'tall', 1, turn);
    });
    // At the wall foot: moss, rubble and tall grass.
    plan.rect(PATH.x1, PATH.z0, WALL, SEEN_Z, (i, k) => {
      const n = noise(i, k, 9);
      const turn = r.int(0, 3);
      return n < 0.3 ? tile('18.2/moss', 'dense', 1, turn) : n < 0.45 ? tile('18.2/sandstone-path', 'broken', 1, turn) : n < 0.6 ? tile('18.2/small-rocks', 'cluster', 1, turn) : n < 0.8 ? tile('18.2/grass', 'tall', 1, turn) : tile('18.2/moss', 'stone', 1, turn);
    });
    plan.rect(PATH.x1, SEEN_Z, WALL, PATH.z1, soil(LAWN));
    // Slabs gone, the tiles showing through: moss, a broken patch, grass.
    const holes: [number, number, Cell][] = [
      [-2.5, 2.5, tile('18.2/moss', 'light', 1, 1)],
      [1.5, -1.5, tile('18.2/sandstone-path', 'broken', 1, 2)],
      [-1.5, -5.5, tile('18.2/grass', 'patchy', 1, 3)],
      [3.5, -6.5, tile('18.2/moss', 'dense', 1, 0)],
      [2.5, 4.5, tile('18.2/sandstone-path', 'worn', 1, 1)],
    ];
    for (const [x, z, c] of holes) plan.rect(x - 0.5, z - 0.5, x + 0.5, z + 0.5, c);
    await layGround(ctx, p, plan);

    // ── The paving ───────────────────────────────────────────────────────────
    // Moss gathers towards the edges and the far end, where fewer feet go.
    const edge = (x: number) => Math.max(0, Math.abs(x - (PATH.x0 + PATH.x1) / 2) - 2) / 2;
    const mossy = (x: number, z: number) => Math.min(1, 0.22 + edge(x) * 0.5 + Math.max(0, -z) * 0.025 + (noise(x, z, 11) - 0.5) * 0.7);
    const slabs = pave(p, plan, {
      length: [0.75, 1.25],
      palette: SLAB,
      seed: 7,
      surf: (x, z) => stoneSurf({ moss: Math.max(0, mossy(x, z) - 0.3) * 0.6, lichen: 0.06, stain: 0.1 + edge(x) * 0.15 }),
    });
    jointMoss(p, slabs, (x, z) => mossy(x, z) * 1.25, 21);

    // ── The terrace along the right: a mossy retaining wall, an upper tier ──
    // (the full depth of the scene; the platform's tiers meet its face at the far end)
    // Laid dry like the gallery: every joint a dark line, as on the panel's walls.
    const dry = new DryMasonry(41);
    const look = finishLook({ palette: WALL_STONE, surf: stoneSurf({ moss: 0.3, stain: 0.25, lichen: 0.16 }), wear: 0 }, 41, { moss: 0.12 });
    const courses = (h: number) => new Array<number>(Math.round(h / 0.5)).fill(0.5);
    const lay = (b: Box6, axis: 'x' | 'z', face: number, closed: number, length: [number, number] = [0.5, 1.25]) => dry.wall(b, courses(b[4] - b[1]), { axis, face, closed, length, look });
    const face = lay([WALL, 0, PATH.z0, WALL + 0.5, WALL_H, PATH.z1], 'z', FACE.nx, FACE.ny | FACE.px);
    TIERS.forEach(([z, h], t) => lay([WALL, h, t < 2 ? TIERS[t + 1][0] : -15, WALL + 0.5, WALL_H, z], 'z', FACE.nx, FACE.ny | FACE.px));
    lay([UPPER, WALL_H, -14.5, UPPER + 0.5, UPPER_H, PATH.z1], 'z', FACE.nx, FACE.ny | FACE.px);
    lay([WALL, 0, PATH.z1 - 0.5, 10, WALL_H, PATH.z1], 'x', FACE.pz, FACE.ny | FACE.nz);
    lay([UPPER, WALL_H, PATH.z1 - 0.5, 10, UPPER_H, PATH.z1], 'x', FACE.pz, FACE.ny | FACE.nz);
    // Its back and the far end of terrace and platform, where the level shows them.
    lay([9.5, 0, -14.5, 10, UPPER_H, PATH.z1 - 0.5], 'z', FACE.px, FACE.ny | FACE.nx, [0.75, 1.75]);
    lay([-2.5, 0, -15, UPPER, TIERS[2][1], -14.5], 'x', FACE.nz, FACE.ny | FACE.pz, [0.75, 1.75]);
    lay([UPPER, 0, -15, 10, UPPER_H, -14.5], 'x', FACE.nz, FACE.ny | FACE.pz, [0.75, 1.75]);
    // Old damage: a few stones knocked out, some cracked, many chipped.
    for (const st of face) {
      const [x, y, z] = [st.box[0], (st.box[1] + st.box[4]) / 2, (st.box[2] + st.box[5]) / 2];
      const u = hash3(Math.round(y * 4), Math.round(z * 4), 7, 41);
      if ((Math.abs(z - 1.2) < 0.45 && y > 0.5 && y < 2) || (Math.abs(z + 4.6) < 0.4 && y > 2) || (u < 0.025 && y > 1)) dry.knockOut(st, 0.4);
      else if (u > 0.95) dry.crack(st, Math.round(z * 16));
      else if (u > 0.7 && x < WALL + 0.1) dry.chip(st, Math.round(z * 16) + 3);
    }
    // Terrace fills: earth grown over with grass.
    p.voxels.span(WALL + 0.5, 0, -14.5, 9.5, WALL_H, PATH.z1 - 0.5, EARTH, 'soil', { surf: soilSurf({ grass: 0.95, moss: 0.3 }) });
    p.voxels.span(UPPER + 0.5, WALL_H, -14.5, 9.5, UPPER_H, PATH.z1 - 0.5, EARTH, 'soil', { surf: soilSurf({ grass: 0.95, moss: 0.3 }) });
    p.collider(WALL, 0, -15, 10, WALL_H, PATH.z1);
    p.collider(UPPER, WALL_H, -15, 10, UPPER_H, PATH.z1);

    // ── The stepped platform at the far end, a flight up its middle ─────────
    const flight = new BlockSet(0.125);
    const steps = 12;
    const run = (PATH.z0 - TIERS[2][0]) / steps;
    for (let n = 0; n < steps; n++) {
      const z = PATH.z0 - n * run;
      flight.add(STAIR.x0, n * 0.25, TIERS[2][0] - 1, STAIR.x1, (n + 1) * 0.25, z, WALL_STONE[n % 6], { surf: stoneSurf({ moss: 0.22, stain: 0.2, lichen: 0.14 }) });
      p.collider(STAIR.x0, 0, z - run, STAIR.x1, (n + 1) * 0.25, z);
    }
    flight.emit(p.voxels, { seed: 6 });
    TIERS.forEach(([z, h], t) => {
      const y0 = t === 0 ? 0 : TIERS[t - 1][1];
      lay([-3, y0, z - 0.5, STAIR.x0, h, z], 'x', FACE.pz, FACE.ny | FACE.nz | FACE.px);
      lay([STAIR.x1, y0, z - 0.5, WALL, h, z], 'x', FACE.pz, FACE.ny | FACE.nz | FACE.nx | FACE.px);
      lay([-3, y0, -15, -2.5, h, z - 0.5], 'z', FACE.nx, FACE.ny | FACE.px | FACE.pz);
      p.voxels.span(-2.5, y0, -14.5, WALL, h, z - 0.5, EARTH, 'soil', { surf: soilSurf({ grass: 0.9, moss: 0.35 }) });
      p.collider(-3, 0, -15, STAIR.x0, h, z);
      p.collider(STAIR.x1, 0, -15, WALL, h, z);
    });
    // The enclosure wall on the top tier — a plinth course, plain courses, a
    // lintel course and a cornice — with a dark doorway at the head of the flight.
    const DOOR = { x0: -0.75, x1: 0.75, y1: 5.5 };
    lay([-3, 3, -15, UPPER, 3.5, -14.25], 'x', FACE.pz, FACE.ny | FACE.nz, [0.75, 1.5]);
    lay([-3, 3.5, -15, DOOR.x0 - 0.25, DOOR.y1, -14.5], 'x', FACE.pz, FACE.ny | FACE.nz | FACE.px);
    lay([DOOR.x1 + 0.25, 3.5, -15, UPPER, DOOR.y1, -14.5], 'x', FACE.pz, FACE.ny | FACE.nz | FACE.nx);
    for (const x0 of [DOOR.x0 - 0.25, DOOR.x1]) dry.course([x0, 3.5, -15, x0 + 0.25, DOOR.y1, -14.375], { length: [2, 2], closed: FACE.ny | FACE.nz, look });
    dry.course([-3, DOOR.y1, -15, UPPER, BACK_H - 0.5, -14.5], { length: [0.75, 1.5], closed: FACE.ny | FACE.nz | FACE.py, fixed: [{ a: DOOR.x0 - 0.5, b: DOOR.x1 + 0.5 }], openBelow: [[DOOR.x0, DOOR.x1]], look });
    dry.course([-3, BACK_H - 0.5, -15, UPPER, BACK_H, -14.25], { length: [0.75, 1.5], closed: FACE.ny | FACE.nz, look });
    p.voxels.span(DOOR.x0, 3.5, -15, DOOR.x1, DOOR.y1, -14.94, SANDSTONE.cavity[0], 'sandstone');
    p.collider(-3, 3, -15, UPPER, BACK_H, -14.25);
    dry.emit(p.voxels);

    // ── The gallery, its dark doorway looking down the path ────────────────
    placePiece(target, galleryFacade({ length: 7, door: true, finish: finish('dark'), seed: 71, gallery: 3 }), { x: -6.5, y: 0, z: -11 });

    // ── Grass, plants and flowers ────────────────────────────────────────────
    const green = new Greenery(p, 5);
    const onPath = (x: number, z: number) => plan.cellAt(x, z)?.kind === 'pave';
    // Tufts in the joints, most towards the edges; grass where a slab is gone.
    for (const s of slabs) {
      if (s.gone) green.tuft((s.x0 + s.x1) / 2, -TEXEL, (s.z0 + s.z1) / 2, { height: r.int(4, 7), radius: 2, lean: 0.7, arms: 0.5, tones: GRASS_TONES.lawn, seed: r.int(1, 1e6) });
      const f = mossy(s.x1, s.z1);
      if (s.z1 > SEEN_Z + 4 || r() > f * 0.4) continue;
      if (r.chance(0.6)) green.plus(s.x1 + 0.03, 0, s.z1 + 0.03, { height: r.int(2, 4), seed: r.int(1, 1e6) });
      else green.tuft(s.x1 + 0.03, 0, s.z1 + 0.03, { height: r.int(4, 7), radius: 1, lean: 0.5, arms: 0.2, tones: GRASS_TONES.lawn, seed: r.int(1, 1e6) });
    }
    // Tall grass and small plants on the verge, thickest along the paving and
    // where the camera looks; sparse towards the viewer.
    for (const [x, z] of spots(r, 84, -9.5, PATH.z0 + 0.5, PATH.x0 + 0.4, PATH.z1 - 0.5, 0.58, (x, z) => !onPath(x, z) || x < PATH.x0 + 0.4)) {
      const near = x > -6.5 && z < SEEN_Z + 1;
      if (z > SEEN_Z + 1 && r.chance(0.6)) continue;
      if (r.chance(0.22)) green.plant(x, 0, z, { height: r.int(4, 6), seed: r.int(1, 1e6) });
      else green.tuft(x, 0, z, { height: r.int(near ? 7 : 5, near ? 11 : 8), radius: r.range(1.6, 2.6), spacing: 1.15, lean: 0.9, nub: 0.8, arms: 0.7, seed: r.int(1, 1e6) });
    }
    // The lawn between: the grass tile's little "+" tufts, so it reads like the tiles beside it.
    for (const [x, z] of spots(r, 160, -10, PATH.z0, PATH.x0, SEEN_Z + 2, 0.45, (x, z) => plan.cellAt(x, z)?.kind === 'soil')) green.plus(x, 0, z, { height: r.int(2, 3), seed: r.int(1, 1e6) });
    // At the wall foot: tall tufts, plants and a few yellow flowers.
    for (const [x, z] of spots(r, 24, PATH.x1 + 0.15, PATH.z0 + 0.3, WALL - 0.15, PATH.z1 - 0.5, 0.8)) {
      const u = r();
      if (u < 0.35) green.plant(x, 0, z, { height: r.int(4, 7), seed: r.int(1, 1e6) });
      else if (u < 0.5) green.flower(x, 0, z, { h: r.int(2, 4), petals: FLOWER.yellow, seed: r.int(1, 1e6) });
      else green.tuft(x, 0, z, { height: r.int(6, 10), radius: 2, lean: 0.8, nub: 0.7, arms: 0.6, seed: r.int(1, 1e6) });
    }
    // A fringe along the terrace edges, plants on the tops.
    for (const [x, z] of spots(r, 26, WALL + 0.6, -14, WALL + 1.6, PATH.z1 - 0.8, 0.8)) green.tuft(x, WALL_H, z, { height: r.int(5, 9), radius: 2, lean: 1, nub: 0.8, arms: 0.8, seed: r.int(1, 1e6) });
    for (const [x, z] of spots(r, 10, WALL + 1.8, -14, UPPER - 0.3, PATH.z1 - 0.8, 1.2)) green.plant(x, WALL_H, z, { height: r.int(5, 7), seed: r.int(1, 1e6) });
    for (const [x, z] of spots(r, 14, UPPER + 0.6, -14, UPPER + 1.6, PATH.z1 - 0.8, 1.0)) green.tuft(x, UPPER_H, z, { height: r.int(5, 9), radius: 2, lean: 0.9, nub: 0.8, arms: 0.7, seed: r.int(1, 1e6) });
    TIERS.forEach(([z, h]) => {
      for (const [x, zz] of spots(r, 5, -2.3, z - 1.3, WALL - 0.3, z - 0.6, 1.1, (x) => x < STAIR.x0 - 0.5 || x > STAIR.x1 + 0.5)) green.tuft(x, h, zz, { height: r.int(4, 8), radius: 1.8, lean: 0.9, nub: 0.7, arms: 0.6, seed: r.int(1, 1e6) });
    });
    green.commit();

    // ── Stones and bushes ───────────────────────────────────────────────────
    const fragments: [string, number, number, number][] = [
      ['mossy', 4.4, 1.5, 0],
      ['small', -4.6, 4.5, 1],
      ['large', 4.3, -5.5, 3],
      ['small', 2.0, -8.2, 2],
    ];
    for (const [variant, x, z, turn] of fragments) {
      const piece = await ctx.get('20/stone-fragments', { variant, seed: 3 });
      if (piece) placePiece(target, piece, { x, y: 0, z, turn });
    }
    // Blocks fallen from the wall, and the grey block in the grass on the left.
    const loose = new BlockSet(0.125);
    const blockStyle = { surf: stoneSurf({ moss: 0.5, stain: 0.2, lichen: 0.3 }) };
    const fallen: [number, number, number, number, number][] = [
      [-5.25, 1.5, 0.75, 0.625, WALL_STONE[2]],
      [4.25, 1.0, 0.625, 0.75, WALL_STONE[0]],
      [4.0, -3.75, 0.75, 0.5, WALL_STONE[4]],
    ];
    for (const [x, z, w, d, color] of fallen) {
      loose.add(x, 0, z, x + w, 0.5, z + d, color, blockStyle);
      p.collider(x, 0, z, x + w, 0.45, z + d);
    }
    loose.erode(0.35, 81);
    loose.emit(p.voxels, { seed: 8 });
    // A bush of leafy clumps on the terrace, over the wall's edge.
    const bush = await ctx.get('18.1/bush', { variant: 'bush', seed: 2 });
    if (bush) placePiece(target, bush, { x: 6.6, y: WALL_H, z: -2.5, turn: 1 });
  },
});
