import { waterBody, pondFlora } from '../assets/20/_pond';
import { BlockSet, masonry, type BlockStyle } from '../BlockSet';
import { galleryFacade } from '../lib/gallery';
import { GRASS_TONES, grassPatch } from '../lib/grass';
import { fromSheet, SANDSTONE } from '../palette';
import { rng } from '../shapes';
import { defineKitScene } from '../scene';
import { stoneSurf, type StoneFinish } from '../surface';
import { flight, prasat, put, shell, soilGround } from './_scenes18';

/**
 * §18.1 environment example "Palm trees along causeway", as on the sheet: a
 * raised sandstone causeway crosses the moat to a temple entrance — a gopura
 * with its tower between gallery wings, more lotus-bud towers behind. Its deck
 * is flagged with worn slabs between low balustrades (the naga balustrade's
 * stand-in: a rail on short posts, rearing up into a stepped hood at the
 * stairs). On the right it stands over the water on piers, sugar palms rising
 * from stepped pedestals beside it, lily pads and lotus in the moat; on the
 * left a lawn with a second row of palms, a broadleaf tree, bushes and a stair
 * down from the deck.
 *
 * Real Angkor Wat: the inner causeway is ≈ 9.5 m wide and ≈ 1.5 m above the
 * ground (the western one over the moat ≈ 200 m long); here 35 m of it.
 */

// Layout (scene space: x to the right, z towards the viewer, y up; metres).
const CX = -1; // causeway centre line
const HALF = 4.75; // half its width
const X0 = CX - HALF; // lawn side
const X1 = CX + HALF; // moat side
const DECK = 1.5; // deck height
const Z_FRONT = 22.5; // front end (the stairs go on to 24.6)
const Z_BACK = -12.5; // the temple platform's front face
const WATER_TOP = -0.375;
const BED = -1;
/** The moat's front bank (a stone rim runs along it). */
const W0 = 20;
/** Palms on pedestals along the moat side, and where the pedestals stand. */
const PALM_Z = [16, 8, 0, -8];
const PED_X = X1 + 1.75;
const SIDE_STAIR_Z = 4;
/** East end of the temple platform: the moat goes on past it. */
const PLAT_X1 = 5.5;
/** The grassy bank in the moat's far corner (x > BANK_X, z < BANK_Z). */
const BANK_X = 11;
const BANK_Z = -17;

/** Deck: the sheet's lit warm tan slabs, some greyer and mossy. */
const DECK_TONES = [...SANDSTONE.cracked, SANDSTONE.clean[3], SANDSTONE.weathered[4], SANDSTONE.mossy[2], SANDSTONE.warm[4]];
/** Sides and pedestals: warm orange-brown, weathered. */
const SIDE: StoneFinish = { palette: [...SANDSTONE.warm, SANDSTONE.weathered[2], SANDSTONE.weathered[4]], surf: stoneSurf({ moss: 0.3, stain: 0.4, lichen: 0.1 }), wear: 0 };
/** The balustrade: grey-brown, lichen-spotted (the naga's body). */
const RAIL = [SANDSTONE.weathered[2], SANDSTONE.weathered[4], SANDSTONE.mossy[2]];
/** Moat water: the sheet's murky olive green. */
const MOAT = 0x587a5e;
/** The temple: grey-brown stone, lichen-spotted, as the sheet's towers in the haze. */
const TEMPLE: StoneFinish = {
  palette: [0x9a8a70, 0x8e7d66, 0xa39276, 0x857562, 0xab9a7e].map(fromSheet),
  surf: stoneSurf({ moss: 0.2, stain: 0.4, lichen: 0.3 }),
  wear: 0.04,
};

export default defineKitScene({
  name: 'Palm trees along causeway',
  caption: 'Sugar palms in rows beside a raised sandstone causeway over the moat, leading to the temple entrance.',
  source: '18.1 Trees · Environment examples · Palm trees along causeway',
  size: [40, 50],
  camera: { az: 54, el: 4, dist: 47, target: [-1.5, 8, -4.5] },
  spawn: { x: CX, z: 25.2, yaw: 180 },
  async build(ctx, p) {
    const r = rng(181);

    // ── Ground: a bank in front, the lawn on the left; the moat on the right ──
    soilGround(p, [
      { x0: -20, z0: W0 + 1.5, x1: 20, z1: 25, grass: 0.95 },
      { x0: -20, z0: Z_BACK, x1: X0, z1: W0 + 1.5, grass: 0.92 },
      { x0: BANK_X + 0.5, z0: -25, x1: 20, z1: BANK_Z - 0.5, grass: 0.95 },
    ]);
    // One body of water for the whole moat: the pedestals, the temple platform and the far bank stand in it.
    const open = (x: number, z: number) => !pedestalAt(x, z, 0.3) && !(z < Z_BACK + 0.8 && x < PLAT_X1 + 1.3) && !(x > BANK_X - 0.3 && z < BANK_Z + 0.3);
    waterBody(p, { x0: X1, z0: -25, x1: 20, z1: W0, top: WATER_TOP, bed: BED, seed: 5, stones: 0.15, color: MOAT, inside: open });
    pondFlora(p, { top: WATER_TOP, x0: X1 + 0.5, z0: -24, x1: 19, z1: W0 - 0.5, seed: 6, clusters: 22, pads: 16, flowers: 5, buds: 3, leaves: 12, inside: open });
    const rim = new BlockSet(0.125);
    const rimStyle: BlockStyle = { surf: stoneSurf({ moss: 0.45, stain: 0.5 }) };
    masonry(rim, X1, BED, W0 + 0.5, 20, 0, W0 + 1.5, { length: [0.75, 1.5], course: 0.5, depth: 0.5, axis: 'x', palette: SIDE.palette, style: rimStyle, seed: 7 });
    masonry(rim, X1, BED, W0, 20, WATER_TOP - 0.125, W0 + 0.5, { length: [0.75, 1.5], course: 0.625, axis: 'x', palette: SIDE.palette, style: rimStyle, seed: 8 });
    masonry(rim, BANK_X, BED, -25, BANK_X + 0.5, 0, BANK_Z, { length: [0.75, 1.5], course: 0.5, depth: 0.5, axis: 'z', palette: SIDE.palette, style: rimStyle, seed: 60 });
    masonry(rim, BANK_X + 0.5, BED, BANK_Z - 0.5, 20, 0, BANK_Z, { length: [0.75, 1.5], course: 0.5, depth: 0.5, axis: 'x', palette: SIDE.palette, style: rimStyle, seed: 61 });
    // …and along the moat's far sides, where the scene ends.
    masonry(rim, 19.5, BED, BANK_Z, 20, 0, W0 + 0.5, { length: [0.75, 1.5], course: 0.5, depth: 0.5, axis: 'z', palette: SIDE.palette, style: rimStyle, seed: 62 });
    masonry(rim, PLAT_X1 + 0.5, BED, -25, BANK_X, 0, -24.5, { length: [0.75, 1.5], course: 0.5, depth: 0.5, axis: 'x', palette: SIDE.palette, style: rimStyle, seed: 63 });
    rim.emit(p.voxels, { seed: 9 });
    p.collider(BANK_X, BED, -25, BANK_X + 0.5, 0, BANK_Z);
    p.collider(BANK_X + 0.5, BED, BANK_Z - 0.5, 20, 0, BANK_Z);
    p.collider(19.5, BED, BANK_Z, 20, 0, W0 + 0.5);
    p.collider(PLAT_X1 + 0.5, BED, -25, BANK_X, 0, -24.5);
    p.collider(X1, BED, W0 + 0.5, 20, 0, W0 + 1.5);
    // The water lies below the banks, so it's walled off above its surface too (blocks, never stood on).
    p.collider(X1 + 1, WATER_TOP, Z_BACK + 0.5, 19.5, 1, W0 + 0.5, true);
    p.collider(PLAT_X1 + 0.5, WATER_TOP, -24.5, BANK_X, 1, Z_BACK + 0.5, true);
    p.collider(BANK_X, WATER_TOP, BANK_Z, 19.5, 1, Z_BACK + 0.5, true);

    // ── The causeway ──────────────────────────────────────────────────────
    const cw = new BlockSet(0.25);
    const sideStyle: BlockStyle = { surf: SIDE.surf };
    const deckStyle: BlockStyle = { surf: stoneSurf({ lichen: 0.14, moss: 0.1, stain: 0.18 }) };
    const railStyle: BlockStyle = { surf: stoneSurf({ lichen: 0.3, moss: 0.25, stain: 0.3 }) };
    const along = (x0: number, y0: number, x1: number, y1: number, length: [number, number], course: number, seed: number, palette: readonly number[] = SIDE.palette, style = sideStyle) =>
      masonry(cw, x0, y0, Z_BACK, x1, y1, Z_FRONT, { length, course, depth: 0.5, axis: 'z', palette, style, seed });
    // Deck: rows of slabs across it, joints staggered.
    for (let z = Z_BACK; z < Z_FRONT - 1e-6; z += 0.75)
      masonry(cw, X0 + 0.5, DECK - 0.25, z, X1 - 0.5, DECK, Math.min(Z_FRONT, z + 0.75), { length: [0.75, 1.75], course: 0.25, axis: 'x', palette: DECK_TONES, style: deckStyle, seed: Math.round(z * 4) + 100 });
    // Lawn side: a wall on a base course, a coping along the top.
    along(X0, 0, X0 + 0.5, DECK - 0.25, [0.75, 1.5], 0.625, 11);
    along(X0 - 0.25, DECK - 0.25, X0 + 0.5, DECK, [1, 2], 0.25, 12);
    along(X0 - 0.25, 0, X0, 0.5, [1, 2], 0.5, 13);
    // Moat side: piers standing in the water under a beam, the shadowed wall recessed behind them.
    along(X1 - 0.5, BED, X1, DECK - 0.75, [1, 2], 0.5, 14, SANDSTONE.dark, { surf: stoneSurf({ moss: 0.4, stain: 0.6 }) });
    for (let n = 0, z = Z_BACK + 1.25; z < Z_FRONT - 0.5; n++, z += 2.5) {
      if (pedestalAt(X1 + 1, z, 1.2)) continue;
      masonry(cw, X1, BED, z - 0.375, X1 + 0.75, DECK - 0.75, z + 0.375, { length: [0.75, 0.75], course: 0.5, axis: 'z', palette: SIDE.palette, style: sideStyle, seed: 70 + n });
    }
    along(X1 - 0.5, DECK - 0.75, X1 + 0.75, DECK - 0.25, [1.25, 2.5], 0.5, 16);
    along(X1 - 0.5, DECK - 0.25, X1 + 1.0, DECK, [1, 2], 0.25, 17);
    p.collider(X0 - 0.25, BED, Z_BACK, X1 + 1.0, DECK, Z_FRONT);

    // Balustrades: a rail on short posts along both edges; a gap for the side stair.
    const rails: [number, number][] = [
      [X0, X0 + 0.5],
      [X1 + 0.25, X1 + 0.75],
    ];
    for (const [x0, x1] of rails) {
      const runs: [number, number][] = x0 < CX ? [[Z_BACK, SIDE_STAIR_Z - 1.75], [SIDE_STAIR_Z + 1.75, Z_FRONT]] : [[Z_BACK, Z_FRONT]];
      runs.forEach(([z0, z1], n) => {
        for (let z = z0 + 0.5; z < z1 - 0.4; z += 2) cw.add(x0, DECK, z, x1, DECK + 0.5, z + 0.5, RAIL[Math.floor(r() * RAIL.length)], railStyle);
        masonry(cw, x0, DECK + 0.5, z0, x1, DECK + 1.0, z1, { length: [2, 4], course: 0.5, axis: 'z', palette: RAIL, style: railStyle, seed: x0 < CX ? 20 + n : 22 });
        p.collider(x0, DECK, z0, x1, DECK + 1.0, z1);
      });
    }
    // Front stairs down to the bank between two cheek walls; on each, the balustrade ends in the
    // naga's raised head — the body rearing up, then the fanned hood of its seven heads, stepped.
    const cheek = rails.map(([a, b]) => (a + b) / 2);
    flight(cw, p, { foot: [(cheek[0] + cheek[1]) / 2, 0, Z_FRONT + 6 * 0.35], dir: '-z', width: cheek[1] - cheek[0] - 1, n: 6, palette: DECK_TONES, style: deckStyle, seed: 30 });
    for (const [n, c] of cheek.entries()) {
      masonry(cw, c - 0.5, 0, Z_FRONT, c + 0.5, DECK, Z_FRONT + 2.25, { length: [0.75, 1.25], course: 0.5, axis: 'z', palette: SIDE.palette, style: sideStyle, seed: 31 + n });
      masonry(cw, c - 0.25, DECK + 0.5, Z_FRONT, c + 0.25, DECK + 1.0, Z_FRONT + 1.25, { length: [1.25, 1.25], course: 0.5, axis: 'z', palette: RAIL, style: railStyle, seed: 34 });
      cw.add(c - 0.25, DECK, Z_FRONT + 0.5, c + 0.25, DECK + 0.5, Z_FRONT + 1.0, RAIL[0], railStyle);
      cw.add(c - 0.375, DECK, Z_FRONT + 1.25, c + 0.375, DECK + 1.5, Z_FRONT + 2.0, RAIL[1], railStyle);
      [1.0, 0.75, 0.5, 0.25].forEach((hw, t) => cw.add(c - hw, DECK + 1.5 + t * 0.375, Z_FRONT + 1.5, c + hw, DECK + 1.875 + t * 0.375, Z_FRONT + 2.0, RAIL[t % 2], railStyle));
      p.collider(c - 0.5, 0, Z_FRONT, c + 0.5, DECK + 1.0, Z_FRONT + 2.25);
      p.collider(c - 1.0, DECK, Z_FRONT + 1.25, c + 1.0, DECK + 3.0, Z_FRONT + 2.0);
    }
    // Side stair down to the lawn.
    flight(cw, p, { foot: [X0 - 0.25 - 6 * 0.35, 0, SIDE_STAIR_Z], dir: '+x', width: 3, n: 6, palette: DECK_TONES, style: deckStyle, seed: 32 });
    // Stepped pedestals in the moat, one under each palm of the moat row.
    for (const z of PALM_Z) {
      masonry(cw, PED_X - 1.75, BED, z - 1.75, PED_X + 1.75, 0.5, z + 1.75, { length: [0.75, 1.25], course: 0.5, depth: 0.5, axis: 'z', palette: SIDE.palette, style: sideStyle, seed: 40 + z });
      masonry(cw, PED_X - 1.25, 0.5, z - 1.25, PED_X + 1.25, 1.0, z + 1.25, { length: [0.75, 1.25], course: 0.5, depth: 0.5, axis: 'x', palette: SIDE.palette, style: sideStyle, seed: 41 + z });
      masonry(cw, PED_X - 0.75, 1.0, z - 0.75, PED_X + 0.75, DECK, z + 0.75, { length: [0.75, 1.5], course: 0.5, depth: 0.5, axis: 'z', palette: SIDE.palette, style: sideStyle, seed: 42 + z });
      p.collider(PED_X - 1.75, BED, z - 1.75, PED_X + 1.75, 0.5, z + 1.75);
      p.collider(PED_X - 1.25, 0.5, z - 1.25, PED_X + 1.25, 1.0, z + 1.25);
      p.collider(PED_X - 0.75, 1.0, z - 0.75, PED_X + 0.75, DECK, z + 0.75);
    }
    cw.emit(p.voxels, { seed: 33 });

    // ── The temple at the far end: a gopura between gallery wings, towers behind ──
    const plat = new BlockSet(0.5);
    const templeStyle: BlockStyle = { surf: TEMPLE.surf };
    shell(plat, [-20, BED, -25, PLAT_X1, DECK - 0.5, Z_BACK], { length: [0.5, 1.5], course: 0.5, axis: 'x', palette: TEMPLE.palette, style: templeStyle, seed: 50 });
    // A coping course projecting over the moat and the lawn.
    shell(plat, [-20, DECK - 0.5, -25, PLAT_X1 + 0.5, DECK, Z_BACK + 0.5], { length: [1, 2], course: 0.5, axis: 'x', palette: TEMPLE.palette, style: templeStyle, seed: 49 });
    plat.emit(p.voxels, { seed: 51 });
    p.collider(-20, BED, -25, PLAT_X1 + 0.5, DECK, Z_BACK + 0.5);
    const towers = new BlockSet(0.25);
    p.collider(...prasat(towers, { x: CX, y: DECK, z: -21.5, base: 6.5, height: 17, finish: TEMPLE, seed: 52 }));
    p.collider(...prasat(towers, { x: -12.5, y: DECK, z: -21.5, base: 5, height: 14, finish: TEMPLE, seed: 53 }));
    towers.emit(p.voxels, { seed: 55 });
    put(p, galleryFacade({ length: 10, bay: 10 / 3, door: true, height: 6.5, gallery: 1.5, finish: TEMPLE, seed: 56 }), { x: CX, y: DECK, z: -15 });
    put(p, galleryFacade({ length: 12, bay: 4, gallery: 1.5, finish: TEMPLE, seed: 58 }), { x: CX - 11, y: DECK, z: -16.5 });
    // Across the moat, a tower of another shrine rises over the trees of the far bank.
    const far = new BlockSet(0.25);
    p.collider(...prasat(far, { x: 14.5, y: 0, z: -21, base: 4.5, height: 12, finish: TEMPLE, seed: 54 }));
    far.emit(p.voxels, { seed: 57 });

    // ── Palms: a row on the pedestals in the moat, a row on the lawn ──────
    // Four palms, each standing in both rows (turned, in another order): builds are cached per seed.
    const palm = (n: number) => ctx.get('18.1/palm-tree', { variant: 'sugar', seed: 11 + n, height: 14 + ((n * 7) % 5) });
    for (const [n, z] of PALM_Z.entries()) {
      put(p, await palm(n), { x: PED_X, y: DECK, z, turn: n % 4 });
      put(p, await palm((n + 2) % 4), { x: X0 - 3, y: 0, z: z + 0.5, turn: (n + 1) % 4 });
    }
    put(p, await ctx.get('18.1/palm-tree', { variant: 'sugar', seed: 31, height: 16 }), { x: X0 - 3.5, y: 0, z: 23.25, turn: 1 });

    // ── The lawn and the far bank: broadleaf trees, bushes, grass ─────────
    // (one broadleaf build, turned: builds are cached per seed)
    const broadleaf = await ctx.get('18.1/medium-tree', { seed: 2, height: 11.5 });
    put(p, broadleaf, { x: -14.5, y: 0, z: -7.5 });
    put(p, broadleaf, { x: 12.5, y: 0, z: -24, turn: 2 });
    const props: [string, string, number, number, number, number][] = [
      ['18.1/bush', 'bush', -14, 14, 7, 0],
      ['18.1/bush', 'bush', -17.5, -3, 7, 2],
      ['18.1/bush', 'shrub', -18.5, -10.5, 9, 2],
      ['18.1/bush', 'shrub', 18, -19, 9, 1],
      ['20/stone-fragments', 'large', X0 - 1.5, 12, 3, 0],
      ['20/fallen-blocks', 'lintel', -14.5, 1.5, 5, 1],
    ];
    for (const [id, variant, x, z, seed, turn] of props) put(p, await ctx.get(id, { variant, seed }), { x, y: 0, z, turn });
    for (let n = 0; n < 20; n++) {
      const x = r.range(-19.5, X0 - 0.8);
      const z = r.range(Z_BACK + 1, Z_FRONT + 2);
      if (Math.abs(z - SIDE_STAIR_Z) < 2 && x > X0 - 3) continue;
      grassPatch(p, { at: [x, 0, z], w: r.range(0.4, 1.2), d: r.range(0.3, 0.8), height: r.int(4, 7), gap: 2.5, flowers: r.chance(0.3) ? 1 : 0, seed: r.int(1, 1e6), tones: GRASS_TONES.meadow });
    }
    // Long grass along the foot of the causeway's lawn side, and along the moat's banks.
    for (let z = Z_BACK + 0.8; z < Z_FRONT; z += r.range(1.0, 2.2)) {
      if (Math.abs(z - SIDE_STAIR_Z) < 2) continue;
      grassPatch(p, { at: [X0 - 0.6 - r.range(0, 0.3), 0, z], w: r.range(0.4, 0.8), d: r.range(0.6, 1.2), height: r.int(5, 8), gap: 2.5, flowers: r.chance(0.2) ? 1 : 0, seed: r.int(1, 1e6), tones: GRASS_TONES.meadow });
    }
    for (let x = X1 + 1.5; x < 19.5; x += r.range(0.9, 1.8)) grassPatch(p, { at: [x, 0, W0 + 1.75], w: r.range(0.5, 1.1), d: 0.4, height: r.int(4, 7), gap: 2.5, seed: r.int(1, 1e6), tones: GRASS_TONES.meadow });
    for (let z = -24.5; z < BANK_Z - 1; z += r.range(0.9, 1.8)) grassPatch(p, { at: [BANK_X + 0.9, 0, z], w: 0.4, d: r.range(0.5, 1.1), height: r.int(4, 7), gap: 2.5, seed: r.int(1, 1e6), tones: GRASS_TONES.meadow });
  },
});

/** Is (x, z) on one of the palm pedestals in the moat (grown by `pad`)? */
function pedestalAt(x: number, z: number, pad: number): boolean {
  return PALM_Z.some((pz) => Math.abs(x - PED_X) < 1.75 + pad && Math.abs(z - pz) < 1.75 + pad);
}
