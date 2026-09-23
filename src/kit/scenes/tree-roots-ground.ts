import { hash3, valueNoise3 } from '../../voxel/random';
import { onTop } from '../assets/18.2/_tiles';
import { BlockSet } from '../BlockSet';
import { DryMasonry, FACE, finish, finishLook, galleryFacade, type Box6 } from '../lib/gallery';
import { LITTER_MIX, scatterLeaves } from '../lib/leaves';
import { commitRoots, mossOver, root, type RootLook } from '../lib/roots';
import { fromSheet } from '../palette';
import { placePiece } from '../place';
import { defineKitScene } from '../scene';
import { rng, TEXEL } from '../shapes';
import { soilSurf, stoneSurf } from '../surface';
import type { KitCollider } from '../types';
import { GroundPlan, Greenery, jointMoss, layGround, NONE, PAVE, pave, soil, spots, tile, type Cell } from './_scenes182';

/**
 * §18.2 "In-game usage examples" — Natural ground detail near trees: the foot
 * of a giant strangler fig, its roots snaking out over the forest floor and
 * onto the broken edge of an old paved terrace; dark soil, moss, root and
 * leaf-litter tiles strewn with fallen leaves, small rocks, ferns and grass;
 * mossy terraces and a ruined gallery behind.
 */
/** The giant tree's trunk (its axis on the ground). */
const TREE = { x: 6, z: -2, h: 18 };
/** The terraces behind: tier fronts (z) and heights; a gallery stands on the upper one. */
const TIERS: [number, number][] = [
  [-6.5, 1],
  [-8, 2],
];
/** The gallery's front and extent (x), a plain wall behind the tree beyond it. */
const GALLERY = { z: -8.5, x0: -10, x1: 2 };
/** The old paved floor in front of the terraces, broken off towards the tree; a flight up the lower terrace. */
const FLOOR = { x0: -9, x1: -1, z0: -6.5, z1: -2.5 };
const STEPS = { x0: -7, x1: -5, run: 0.375 };

/** Dark forest humus between the tiles (between the leaf tiles' dry and wet soils), and the terraces' earth. */
const EARTH = 0x5e4a3c;
const HUMUS = { color: EARTH, surf: soilSurf({ moss: 0.25, wet: 0.35 }) };
/** Weathered grey paving: the panel's slabs in the shade of the tree. */
const SLAB = [0xb8a591, 0xa89582, 0xc2af9a, 0x9d8b79, 0xb09c86].map(onTop);
/** Terrace masonry: grey, mossy. */
const WALL_STONE = [0x7d7268, 0x72675e, 0x877b70, 0x695f57, 0x908375, 0x61584f];
/** Surface roots: the tree's pale strangler-fig bark (its ROOT tones), a dark rim underneath. */
const ROOTS: RootLook = {
  bark: [0xc0915f, 0xb08356, 0xa67a50, 0xc89b69].map(fromSheet),
  under: [0x5c4a3e, 0x514238],
  rings: [0x4d403a, 0xbe9d76, 0x9d8262, 0xd1c1ab],
  moss: 0.45,
};

export default defineKitScene({
  name: 'Ground near trees',
  caption: 'A giant fig’s roots over the forest floor and a broken terrace edge — the §18.2 soil, moss, root, leaf and rock tiles with fallen leaves, ferns and stones.',
  source: '18.2 Ground · In-game usage examples · Natural ground detail near trees',
  size: [20, 20],
  camera: { az: -8, el: 15, dist: 11, target: [-0.5, 0.8, 1.5] },
  spawn: { x: -3, z: 9, yaw: 165 },
  async build(ctx, p) {
    const target = { voxels: p.voxels, collider: (c: KitCollider) => p.colliders.push(c) };
    const r = rng(1822);
    const noise = (x: number, z: number, s: number) => valueNoise3(x * 0.5, 0.5, z * 0.5, s);
    const nearTree = (x: number, z: number, d: number) => Math.hypot(x - TREE.x, z - TREE.z) < d;

    // ── The floor plan ───────────────────────────────────────────────────────
    const plan = new GroundPlan(-10, -10, 20, 20, soil(HUMUS));
    plan.rect(-10, -10, 10, TIERS[0][0], NONE);
    plan.rect(FLOOR.x0, FLOOR.z0, FLOOR.x1, FLOOR.z1, PAVE);
    plan.rect(STEPS.x0, FLOOR.z0, STEPS.x1, FLOOR.z0 + 4 * STEPS.run, NONE);
    // The floor's broken front edge: broken path tiles, mossy stone, lichen.
    plan.rect(FLOOR.x0, FLOOR.z1 - 1, FLOOR.x1 + 1, FLOOR.z1 + 1, (i, k): Cell => {
      const n = noise(i, k, 3);
      const turn = r.int(0, 3);
      const x = plan.x0 + i + 0.5;
      if (k === FLOOR.z1 - 1 - plan.z0 && n < 0.45 && x < FLOOR.x1) return PAVE;
      return n < 0.3 ? tile('18.2/sandstone-path', 'broken', 1, turn) : n < 0.5 ? tile('18.2/moss', 'stone', 1, turn) : n < 0.7 ? tile('18.2/lichen', 'stone', 1, turn) : tile('18.2/moss', 'light', 1, turn);
    });
    // The forest floor in front, where the camera looks down on it: every cell
    // a tile — leaf litter, dark soil, roots towards the tree, moss towards the
    // ruins — in patches of one kind blending into the next. Further back, bare
    // humus strewn with leaves reads the same at a glance.
    plan.rect(-6, 2, 3, 8, (i, k): Cell => {
      const x = plan.x0 + i + 0.5;
      const z = plan.z0 + k + 0.5;
      const n = valueNoise3(x * 0.3, 0.5, z * 0.3, 7) * 0.8 + hash3(i, 1, k, 7) * 0.2;
      const turn = r.int(0, 3);
      if (x > 0 && z < 5) return n < 0.5 ? tile('18.2/roots', 'thin', 1, turn) : tile('18.2/roots', 'cluster', 1, turn);
      if (x < -4) return n < 0.4 ? tile('18.2/moss', 'light', 1, turn) : n < 0.6 ? tile('18.2/dirt', 'wet', 1, turn) : tile('18.2/fallen-leaves', 'wet', 1, turn);
      // Nearest the viewer the bright dry litter, as in the panel's foreground.
      const u = z > 5 ? n - 0.25 : n;
      return u < 0.4 ? tile('18.2/fallen-leaves', 'dry', 1, turn) : u < 0.55 ? tile('18.2/fallen-leaves', 'wet', 1, turn) : u < 0.7 ? tile('18.2/dirt', 'wet', 1, turn) : u < 0.8 ? tile('18.2/small-rocks', 'pebbles', 1, turn) : tile('18.2/fallen-leaves', 'dry', 1, turn);
    });
    await layGround(ctx, p, plan);

    // ── The old paved floor, lifted and broken where the roots reach it ─────
    const slabs = pave(p, plan, {
      length: [0.75, 1.25],
      palette: SLAB,
      seed: 12,
      tilt: 0.22,
      split: 0.1,
      missing: 0.07,
      surf: (x, z) => stoneSurf({ moss: 0.25 + noise(x, z, 5) * 0.3, lichen: 0.25, stain: 0.35 }),
    });
    jointMoss(p, slabs, (x, z) => 0.55 + noise(x, z, 9) * 0.5, 31);

    // ── Terraces behind, grey and mossy, a ruined gallery on top ────────────
    const dry = new DryMasonry(51);
    const look = finishLook({ palette: WALL_STONE, surf: stoneSurf({ moss: 0.45, stain: 0.3, lichen: 0.2 }), wear: 0 }, 51, { moss: 0.2 });
    const lay = (b: Box6, closed: number) => dry.wall(b, new Array<number>(Math.round((b[4] - b[1]) / 0.5)).fill(0.5), { axis: 'x', face: FACE.pz, closed, length: [0.5, 1.25], look });
    TIERS.forEach(([z, h], t) => {
      const y0 = t === 0 ? 0 : TIERS[t - 1][1];
      lay([-10, y0, z - 0.5, 10, h, z], FACE.ny | FACE.nz);
      p.voxels.span(-9.5, y0, -9.5, 9.5, h, z - 0.5, EARTH, 'soil', { surf: soilSurf({ grass: 0.7, moss: 0.5 }) });
      p.collider(-10, 0, -10, 10, h, z);
    });
    // The terraces' ends and back, where the level shows them.
    const [z1, z2] = [TIERS[0][0] - 0.5, TIERS[1][0] - 0.5];
    for (const [x0, face] of [
      [-10, FACE.nx],
      [9.5, FACE.px],
    ] as const) {
      dry.wall([x0, 0, z2, x0 + 0.5, TIERS[0][1], z1], [0.5, 0.5], { axis: 'z', face, closed: FACE.ny | (face === FACE.nx ? FACE.px : FACE.nx), length: [0.75, 1.5], look });
      dry.wall([x0, 0, -10, x0 + 0.5, TIERS[1][1], z2], [0.5, 0.5, 0.5, 0.5], { axis: 'z', face, closed: FACE.ny | (face === FACE.nx ? FACE.px : FACE.nx), length: [0.75, 1.5], look });
    }
    dry.wall([-9.5, 0, -10, 9.5, TIERS[1][1], -9.5], [0.5, 0.5, 0.5, 0.5], { axis: 'x', face: FACE.nz, closed: FACE.ny | FACE.pz, length: [0.75, 1.75], look });
    const top = TIERS[1][1];
    // Behind the tree, the enclosure wall the gallery abuts, as high as its roof.
    const wall = lay([GALLERY.x1, top, GALLERY.z - 1, 10, top + 5.5, GALLERY.z], FACE.ny | FACE.nz | FACE.nx);
    for (const st of wall) if (hash3(Math.round(st.box[0] * 4), Math.round(st.box[1] * 4), 5, 51) < 0.08) dry.knockOut(st, 0.35);
    dry.course([GALLERY.x1, top + 5.5, GALLERY.z - 1, 10, top + 6, GALLERY.z + 0.25], { length: [0.75, 1.5], closed: FACE.ny | FACE.nz | FACE.nx, look });
    p.collider(GALLERY.x1, top, GALLERY.z - 1, 10, top + 6, GALLERY.z);
    // A flight of four steps up the lower terrace, out of the paved floor.
    for (let n = 0; n < 4; n++) {
      const z = TIERS[0][0] + (4 - n) * STEPS.run;
      dry.course([STEPS.x0, n * 0.25, TIERS[0][0], STEPS.x1, (n + 1) * 0.25, z], { length: [0.5, 1], row: n, closed: FACE.ny | FACE.nz, look });
      p.collider(STEPS.x0, 0, z - STEPS.run, STEPS.x1, (n + 1) * 0.25, z);
    }
    dry.emit(p.voxels);
    const gallery = galleryFacade({ length: GALLERY.x1 - GALLERY.x0, bay: 3, finish: finish('mossy'), seed: 61, gallery: 0.5, weather: { moss: 0.9, grass: 0.7, streaks: 0.4, missing: 2 } });
    placePiece(target, gallery, { x: (GALLERY.x0 + GALLERY.x1) / 2, y: top, z: GALLERY.z });

    // ── The giant tree ───────────────────────────────────────────────────────
    const tree = await ctx.get('18.1/large-tree', { seed: 1, height: TREE.h });
    if (tree) placePiece(target, tree, { x: TREE.x, y: 0, z: TREE.z });
    // Its surface roots reach on across the floor: over the leaf litter towards
    // the viewer, and onto the broken paving, gripping its slabs.
    const g = p.voxels.grid({ cell: 0.125, origin: [0, 0, 0], mat: 'trunk', jitter: 0.05, ao: 0.35, seed: 3 });
    for (let i = -56; i <= 64; i++) for (let k = -48; k <= 72; k++) g.ghost(i, -1, k);
    const ground = { height: () => 0, soft: (x: number, z: number) => plan.cellAt(x, z)?.kind !== 'pave' };
    const style = { look: ROOTS, ground, forks: 0.35, wiggle: 1.1, sink: 0.1, flat: 0.95, taper: 2 };
    // Where they leave the buttresses (angle round the trunk, height), heading, length, radius.
    const mains: [number, number, number, number, number][] = [
      [0.8, 0.8, 0.82, 10, 0.52],
      [0.62, 0.7, 0.64, 8.5, 0.46],
      [1.0, 0.8, 1.02, 9, 0.46],
      [0.45, 0.6, 0.47, 7, 0.4],
    ];
    const axis = mains.flatMap(([at, h, a, len, rad], n) => {
      const from: [number, number, number] = [TREE.x + Math.cos(at * Math.PI) * 3.2, h, TREE.z + Math.sin(at * Math.PI) * 3.2];
      return root(g, { from, heading: a * Math.PI + r.range(-0.06, 0.06), length: len, radius: rad, drop: 2.2 }, { ...style, seed: 5 + n });
    });
    mossOver(g, { amount: 0.28, seed: 8 });
    commitRoots(g, p.voxels);
    // Walkable humps over the thick roots.
    for (let n = 0; n < axis.length; n += 5) {
      const k = axis[n];
      if (k.r < 0.16 || nearTree(k.x, k.z, 3.5)) continue;
      p.collider(k.x - k.r * 0.8, 0, k.z - k.r * 0.8, k.x + k.r * 0.8, Math.max(0.1, k.y + k.r * 0.6), k.z + k.r * 0.8);
    }

    // ── Leaves, rocks, ferns and grass ───────────────────────────────────────
    // Fallen leaves over the bare humus (the tiles have their own), and a few
    // across the tiles' edges so the litter runs on from one to the next.
    for (const [x, z] of spots(r, 18, -8, -1.5, 3, 2.2, 1.1, (x, z) => plan.cellAt(x, z)?.kind === 'soil' && !nearTree(x, z, 3)))
      scatterLeaves(p, { x, z, w: 1.2, d: 1.2, count: r.int(3, 5), palette: r.chance(0.3) ? LITTER_MIX.autumn : LITTER_MIX.dry, size: [0.14, 0.24], torn: 0.2, seed: r.int(1, 1e6) });
    for (const [x, z] of spots(r, 14, -5.5, 2, 2.5, 8, 1.3)) scatterLeaves(p, { x, z, w: 0.4, d: 0.4, count: 2, palette: LITTER_MIX.dry, size: [0.16, 0.24], seed: r.int(1, 1e6) });
    const props: [string, string, number, number, number][] = [
      ['18.1/ground-foliage', 'fern', 1.4, 3.2, 0],
      ['18.1/ground-foliage', 'fern', 6.6, 3.4, 1],
      ['18.1/ground-foliage', 'fern', 1.2, -3.6, 2],
      ['18.1/ground-foliage', 'mossy-rock', -3.4, 2.4, 1],
      ['20/stone-fragments', 'small', -5.2, 5.2, 1],
      ['20/fallen-leaves', 'cluster', -1.6, 6.2, 0],
    ];
    for (const [id, variant, x, z, turn] of props) {
      const piece = await ctx.get(id, { variant, seed: 2 });
      if (piece) placePiece(target, piece, { x, y: 0, z, turn });
    }
    // Fallen blocks in the litter (the panel's grey blocks).
    const loose = new BlockSet(0.125);
    for (const [x, z, w, h, d, c] of [
      [0.75, 5.5, 0.75, 0.5, 0.625, 2],
      [-2.75, 4.25, 0.5, 0.375, 0.5, 4],
      [-3.75, -1.75, 0.625, 0.375, 0.5, 0],
    ] as const) {
      loose.add(x, 0, z, x + w, h, z + d, WALL_STONE[c], { surf: stoneSurf({ moss: 0.4, lichen: 0.3, stain: 0.3 }) });
      p.collider(x, 0, z, x + w, h - 0.05, z + d);
    }
    loose.erode(0.35, 9);
    loose.emit(p.voxels, { seed: 4 });
    // Small plants and grass round the roots and along the terrace foot.
    const green = new Greenery(p, 11);
    for (const [x, z] of spots(r, 30, -2, -3, 10, 10, 0.8, (x, z) => nearTree(x, z, 7) && !nearTree(x, z, 3.4)))
      if (r.chance(0.55)) green.plant(x, 0, z, { height: r.int(4, 7), seed: r.int(1, 1e6) });
      else green.tuft(x, 0, z, { height: r.int(5, 9), radius: 2, lean: 0.9, nub: 0.7, arms: 0.6, seed: r.int(1, 1e6) });
    for (const [x, z] of spots(r, 22, -9.8, TIERS[0][0] + 0.2, 9.8, TIERS[0][0] + 1.2, 0.75, (x, z) => plan.cellAt(x, z)?.kind !== 'pave' && !nearTree(x, z, 3.4))) green.tuft(x, 0, z, { height: r.int(4, 8), radius: 1.8, lean: 0.9, nub: 0.7, arms: 0.6, seed: r.int(1, 1e6) });
    for (const [x, z] of spots(r, 14, -9.8, TIERS[0][0] - 1.3, 9.8, TIERS[0][0] - 0.6, 1.1)) green.tuft(x, TIERS[0][1], z, { height: r.int(4, 8), radius: 1.8, lean: 0.9, nub: 0.7, arms: 0.6, seed: r.int(1, 1e6) });
    // Grass where a slab is gone, and in a few joints.
    for (const s of slabs) {
      const o = { height: r.int(3, 6), radius: 1.5, lean: 0.7, arms: 0.4, seed: r.int(1, 1e6) };
      if (s.gone) green.tuft((s.x0 + s.x1) / 2, -TEXEL, (s.z0 + s.z1) / 2, o);
      else if (!s.tilted && r.chance(0.08)) green.tuft(s.x1 + 0.03, 0, s.z1 + 0.03, o);
    }
    green.commit();
  },
});
