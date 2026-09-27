import { traceSource, type SourceTrace } from '../../feedback/sourceTrace';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { Frame } from '../landmarks/_prasatKit';
import { bougainvillea, DECK, gableEnd, gableRoof, jar, Local, POST, RIDGE, ROOFS, shadeTree, tone, type Roof } from '../village/_kit';
import { gableFan, type BuildEnv } from './_bhHouses';
import { signWord } from './_bhSign';
import { CART, NEAK_TA, SALA, TAMARIND } from './_bhSpots';
import { baySei } from './_bhYard';

/**
 * Down by the back trail, where the lane to the hamlet leaves it: the sala
 * (a rest pavilion for anyone passing, as Khmer villages build by their
 * roads: a plank platform under a plain tiled gable with a fan of boards in
 * each gable end, open all round, jars of drinking water and a dipper for
 * travellers), the coconut and sugarcane juice seller's cart under an old
 * tamarind (green coconuts heaped on the counter, the cane press and its
 * wheel, a bundle of sugarcane, the ice box, a machete in the chopping
 * stump, a striped umbrella, the painted sign "ទឹកដូង" in Khmer letters;
 * plastic stools and a low table in front, the seller's stool behind), and
 * at the tamarind's foot the humble wooden shrine of the place's guardian
 * spirit (neak ta) — little statues, bay sei, incense — with coloured cloth
 * tied round the sacred tree's trunk; its candle glows at night.
 *
 * Built in the sala's frame (local +z toward the trail, +x along it toward
 * the lane; y the world height).
 */

/** Roof tiles: fired clay, some darker with age and lichen. */
const TILE = [0xa85a3a, 0xb8663f, 0x9a5234, 0xc07048, 0x8e5a40];

export function buildSala(env: BuildEnv): void {
  const src = traceSource();
  const fr = new Frame(SALA.x, 0, SALA.z, SALA.facing);
  const lb = new VoxelBuilder();
  const L = new Local(lb, src, 811);
  const G = env.field.heightAt(SALA.x, SALA.z);
  const glow = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, halo?: number) => env.glow(fr.wx(x, z), y, fr.wz(x, z), sx, sy, sz, fr.theta, color, halo);
  pavilion(L, G, env.world, fr, src);
  cart(L, env, fr, G);
  // The tamarind, cloth tied round its trunk; the neak ta shrine at its foot.
  const [tx, tz] = TAMARIND;
  const ty = env.field.heightAt(fr.wx(tx, tz), fr.wz(tx, tz));
  shadeTree(L, tx, ty, tz, 813);
  for (const [k, c] of [0xc8302a, 0xf0c030, 0xe86aa0].entries()) L.box(tx, ty + 1.05 + k * 0.22, tz, 0.98, 0.12, 0.98, c, 'petal');
  neakTa(L, G, glow);
  bougainvillea(L, -3.1, G, 1.2, 815);
  fr.place(lb, env.world);
}

/** The pavilion: a plank platform on posts, a plain tiled gable roof with a fan of boards in its gables, jars of drinking water. */
function pavilion(L: Local, G: number, world: VoxelBuilder, fr: Frame, src: SourceTrace | undefined): void {
  const hw = SALA.w / 2;
  const hd = SALA.d / 2;
  const F = G + SALA.lift;
  const eave = F + 2.4;
  for (const x of [-hw + 0.15, 0, hw - 0.15])
    for (const z of [-hd + 0.15, hd - 0.15]) L.span(x - 0.1, G - 0.3, z - 0.1, x + 0.1, eave + 0.1, z + 0.1, tone(POST, L.r(x, z, 1)), 'mapBark');
  // Bearers, the planks, a step up in front: in the middle of the east bay, between the posts (toward the lane and
  // the cart; the middle post stands at the front's middle).
  for (const z of [-hd + 0.3, 0, hd - 0.3]) L.span(-hw, F - 0.28, z - 0.08, hw, F - 0.12, z + 0.08, tone(POST, L.r(z, 2)), 'mapBark', 0.9);
  for (let x = -hw, i = 0; x < hw - 0.05; x += 0.4, i++) L.span(x, F - 0.12, -hd, Math.min(hw, x + 0.4) - 0.03, F, hd, tone(DECK, L.r(i, 3)), 'mapBark', 0.94 + L.r(i, 4) * 0.1);
  const bay = (hw - 0.15) / 2;
  L.span(bay - 0.7, G, hd, bay + 0.7, G + 0.28, hd + 0.42, tone(DECK, 0.7), 'mapBark');
  // Plates on the posts, tie beams across.
  for (const z of [-hd + 0.15, hd - 0.15]) L.span(-hw - 0.1, eave, z - 0.1, hw + 0.1, eave + 0.16, z + 0.1, tone(POST, L.r(z, 5)), 'mapBark');
  for (const x of [-hw + 0.15, hw - 0.15]) L.span(x - 0.08, eave, -hd, x + 0.08, eave + 0.14, hd, tone(POST, L.r(x, 6)), 'mapBark', 0.95);
  // The roof: tiles, the ridge along the trail, gable boards with a fan of rays (no horns: Khmer).
  const r: Roof = { x0: -hw - 0.55, x1: hw + 0.55, z0: -hd - 0.75, z1: hd + 0.75, eave: eave + 0.16, run: 0.42, rise: 0.3 };
  gableRoof(L, r, TILE, 0x7a3e28, 'mapStone', 1.1);
  for (const x of [-hw + 0.02, hw - 0.14]) gableEnd(L, r, x, 0.12, -hd, hd, eave + 0.16, [0x8a6a48, 0x7d5f40, 0x947354]);
  for (const side of [-1, 1]) gableFan(world, fr, side * (hw + 0.02), eave + 0.16, -hd, hd, r, 0x5a4230, src);
  // Two big jars of drinking water at the west end, lids on, a dipper.
  jar(L, -hw + 0.55, F, -0.45, 0.85);
  jar(L, -hw + 0.55, F, 0.45, 0.85);
  for (const z of [-0.45, 0.45]) L.box(-hw + 0.55, F + 0.8, z, 0.46, 0.05, 0.46, 0x6a4a30, 'mapBark');
  L.box(-hw + 0.95, F + 0.85, 0.1, 0.12, 0.08, 0.12, 0x4a3424, 'mapBark');
  L.box(-hw + 1.2, F + 0.87, 0.1, 0.4, 0.03, 0.03, 0x7a5a3a, 'mapBark');
}

/** The juice seller's cart and everything round it (see the file's comment). */
function cart(L: Local, env: BuildEnv, fr: Frame, G0: number): void {
  const cx = CART.lx;
  const cz = CART.lz;
  const G = env.field.heightAt(fr.wx(cx, cz), fr.wz(cx, cz)) || G0;
  const paint = 0x4a8ac0;
  // The body on two bicycle wheels and two legs, a white counter.
  L.span(cx - 0.8, G + 0.38, cz - 0.38, cx + 0.8, G + 0.98, cz + 0.38, paint, 'mapBark');
  L.span(cx - 0.78, G + 0.5, cz + 0.381, cx + 0.78, G + 0.62, cz + 0.39, 0xe8e0c8, 'mapBark');
  L.span(cx - 0.9, G + 0.98, cz - 0.46, cx + 0.9, G + 1.04, cz + 0.46, 0xf0ece4, 'mapStone');
  for (const z of [cz - 0.46, cz + 0.46]) {
    L.b.box(cx - 0.4, G + 0.31, z, 0.62, 0.62, 0.05, 0x2a2a2a, 'mapStone', { src: L.src, rz: Math.PI / 4 });
    L.box(cx - 0.4, G + 0.31, z, 0.62, 0.62, 0.05, 0x2a2a2a, 'mapStone');
    L.box(cx - 0.4, G + 0.31, z + Math.sign(z - cz) * 0.03, 0.12, 0.12, 0.06, 0x9a9a96, 'mapStone');
  }
  for (const z of [cz - 0.3, cz + 0.3]) L.span(cx + 0.66, G, z - 0.03, cx + 0.72, G + 0.4, z + 0.03, 0x3a3a3a, 'mapStone');
  // Green coconuts heaped at one end of the counter; one cut open, a straw in it.
  const nuts = [0x7aa040, 0x88aa48, 0x6a9438, 0x94b050];
  let k = 0;
  for (let row = 0; row < 3; row++)
    for (let i = 0; i < 3 - row; i++)
      for (let j = 0; j < 2 - (row > 1 ? 1 : 0); j++, k++) L.box(cx - 0.65 + i * 0.26 + row * 0.13, G + 1.17 + row * 0.22, cz - 0.14 + j * 0.28 + (row % 2) * 0.07, 0.25, 0.23, 0.25, nuts[k % nuts.length], 'mapLeaf', 0.95 + 0.1 * L.r(k, 7));
  L.box(cx + 0.05, G + 1.15, cz + 0.2, 0.24, 0.2, 0.24, nuts[1], 'mapLeaf');
  L.box(cx + 0.05, G + 1.26, cz + 0.2, 0.16, 0.04, 0.16, 0xf0ecd8, 'mapStone');
  L.box(cx + 0.08, G + 1.36, cz + 0.2, 0.02, 0.2, 0.02, 0xe84a8a, 'petal');
  // The cane press: a steel box, its flywheel on the side, a jug under the spout.
  L.box(cx + 0.55, G + 1.24, cz - 0.05, 0.36, 0.4, 0.36, 0x8e969a, 'mapStone');
  L.box(cx + 0.55, G + 1.47, cz - 0.05, 0.3, 0.08, 0.3, 0x6a7276, 'mapStone');
  L.b.box(cx + 0.55, G + 1.3, cz - 0.28, 0.52, 0.52, 0.05, 0xa83a2a, 'mapStone', { src: L.src, rz: Math.PI / 4 });
  L.box(cx + 0.55, G + 1.3, cz - 0.28, 0.52, 0.52, 0.05, 0xa83a2a, 'mapStone');
  L.box(cx + 0.55, G + 1.3, cz - 0.31, 0.1, 0.1, 0.05, 0x3a3a3a, 'mapStone');
  L.box(cx + 0.55, G + 1.12, cz + 0.2, 0.14, 0.16, 0.14, 0xcfe4a8, 'petal');
  // A bundle of cane leaning on the far end, green tops.
  for (let i = 0; i < 7; i++) {
    const z = cz - 0.28 + i * 0.09;
    const c = i % 3 === 0 ? 0xb8b060 : 0x6a3a4a;
    L.b.box(cx + 1.02 + (i % 2) * 0.05, G + 0.95, z, 0.06, 1.95, 0.06, c, 'mapBark', { src: L.src, rz: 0.2 });
    if (i % 2 === 0) L.box(cx + 0.83, G + 1.95, z, 0.2, 0.2, 0.14, 0x6a9a3a, 'mapLeaf');
  }
  // The ice box, the chopping stump with the machete in it, a heap of coconuts on a sack.
  L.span(cx - 1.35, G, cz - 0.25, cx - 0.95, G + 0.42, cz + 0.3, 0xd03a2a, 'mapStone');
  L.span(cx - 1.37, G + 0.42, cz - 0.27, cx - 0.93, G + 0.48, cz + 0.32, 0xf2f0ea, 'mapStone');
  L.box(cx - 0.3, G + 0.24, cz - 0.85, 0.44, 0.48, 0.44, 0x6a4a30, 'mapBark');
  L.box(cx - 0.3, G + 0.49, cz - 0.85, 0.4, 0.02, 0.4, 0xc8a070, 'mapBark');
  L.box(cx - 0.25, G + 0.62, cz - 0.85, 0.04, 0.26, 0.28, 0xb8bcc0, 'mapStone');
  L.box(cx - 0.25, G + 0.62, cz - 1.1, 0.05, 0.06, 0.24, 0x1e1a18, 'mapStone');
  L.box(cx + 0.3, G + 0.03, cz - 0.95, 0.9, 0.06, 0.7, 0xc8b88a, 'petal');
  for (let i = 0; i < 5; i++) L.box(cx + 0.05 + (i % 3) * 0.26, G + 0.17 + Math.floor(i / 3) * 0.2, cz - 1.05 + (i % 2) * 0.24, 0.25, 0.23, 0.25, nuts[i % nuts.length], 'mapLeaf');
  // The umbrella: a pole at the cart's back corner, blue and white panels; the painted sign hung under its front: "ទឹកដូង".
  L.span(cx - 0.9, G, cz - 0.52, cx - 0.84, G + 2.55, cz - 0.46, 0xd8d0c0, 'mapStone');
  for (let i = 0; i < 4; i++) L.box(cx - 0.4, G + 2.5 - i * 0.05, cz - 0.1, 2.3 - i * 0.5, 0.05, 2.3 - i * 0.5, i % 2 ? 0xf2f0e8 : 0x2a6ab8, 'petal');
  const sz = cz + 0.72;
  L.box(cx - 0.4, G + 2.02, sz, 0.74, 0.46, 0.03, 0xf2eee4, 'mapStone');
  L.box(cx - 0.4, G + 2.02, sz - 0.02, 0.78, 0.5, 0.02, 0xc8302a, 'mapStone');
  for (const dx of [-0.3, 0.3]) L.box(cx - 0.4 + dx, G + 2.33, sz, 0.015, 0.2, 0.015, 0x3a3a3a, 'mapStone');
  signWord(L, cx - 0.4, G + 2.02, sz, 0.0125, 0xc8302a);
  // Plastic stools and the low table in front, the seller's stool behind.
  const stool = (x: number, z: number, c: number) => {
    L.box(x, G + 0.19, z, 0.3, 0.38, 0.3, c, 'petal');
    L.box(x, G + 0.39, z, 0.34, 0.03, 0.34, c, 'petal', 1.12);
  };
  stool(CART.stools[0][0], CART.stools[0][1], 0xc8302a);
  stool(CART.stools[1][0], CART.stools[1][1], 0x2a6ac8);
  // (the seller's own: a low wooden stool)
  L.box(CART.seat[0], G + 0.1, CART.seat[1], 0.3, 0.2, 0.26, 0x7a5a3a, 'mapBark');
  L.box(CART.seat[0], G + 0.215, CART.seat[1], 0.34, 0.03, 0.3, 0x8a6a48, 'mapBark');
  const [tx, tz] = CART.table;
  L.box(tx, G + 0.44, tz, 0.62, 0.04, 0.62, 0xf0f0ea, 'petal');
  for (const [dx, dz] of [
    [-0.26, -0.26],
    [0.26, -0.26],
    [-0.26, 0.26],
    [0.26, 0.26],
  ])
    L.box(tx + dx, G + 0.22, tz + dz, 0.04, 0.44, 0.04, 0xe8e8e0, 'petal');
}

/**
 * The shrine of the place's guardian spirit (neak ta) at the tamarind's
 * foot: a humble little house of weathered planks on four short posts, an
 * old tin roof; two small statues inside, a red cloth; before them bay sei,
 * incense in a pot of sand, a candle, bananas, a cup of water.
 */
function neakTa(L: Local, G: number, glow: (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, halo?: number) => void): void {
  const [x, z] = NEAK_TA;
  const wood = [0x6a5642, 0x5e4c3a, 0x76604a];
  for (const [dx, dz] of [
    [-0.3, -0.25],
    [0.3, -0.25],
    [-0.3, 0.25],
    [0.3, 0.25],
  ])
    L.box(x + dx, G + 0.34, z + dz, 0.07, 0.72, 0.07, tone(wood, L.r(dx, dz, 70)), 'mapBark');
  L.box(x, G + 0.72, z, 0.76, 0.05, 0.64, tone(wood, 0.5), 'mapBark');
  // The little house: back and sides of planks, open at the front, an old tin gable.
  L.box(x, G + 0.97, z - 0.24, 0.6, 0.46, 0.04, tone(wood, 0.2), 'mapBark');
  for (const s of [-1, 1]) L.box(x + s * 0.28, G + 0.97, z - 0.04, 0.04, 0.46, 0.44, tone(wood, 0.8), 'mapBark', 0.95);
  gableRoof(L, { x0: x - 0.42, x1: x + 0.42, z0: z - 0.4, z1: z + 0.36, eave: G + 1.18, run: 0.13, rise: 0.08 }, ROOFS.rust, RIDGE.rust, 'mapStone', 0.45);
  // Two small statues inside on a red cloth.
  L.box(x, G + 0.76, z - 0.1, 0.44, 0.02, 0.26, 0xb8322c, 'petal');
  L.box(x - 0.09, G + 0.85, z - 0.12, 0.08, 0.16, 0.06, 0xece2c8, 'mapStone');
  L.box(x + 0.09, G + 0.85, z - 0.12, 0.08, 0.16, 0.06, 0xece2c8, 'mapStone');
  L.box(x - 0.09, G + 0.95, z - 0.12, 0.06, 0.05, 0.05, 0xd8a840, 'mapStone');
  L.box(x + 0.09, G + 0.95, z - 0.12, 0.06, 0.05, 0.05, 0xd8a840, 'mapStone');
  // Offerings on the floor before them: bay sei, incense in sand, a candle, bananas, a cup of water.
  baySei(L, x - 0.22, G + 0.745, z + 0.14, 0.62);
  baySei(L, x + 0.22, G + 0.745, z + 0.14, 0.62);
  L.box(x, G + 0.78, z + 0.18, 0.09, 0.08, 0.09, 0x8a5a3a, 'mapStone');
  for (const dx of [-0.02, 0.01, 0.03]) L.box(x + dx, G + 0.9, z + 0.18, 0.012, 0.2, 0.012, 0x6a3a2a, 'petal');
  glow(x + 0.01, G + 1.0, z + 0.18, 0.03, 0.03, 0.03, 0xff6a2a);
  L.box(x - 0.08, G + 0.79, z + 0.26, 0.04, 0.09, 0.04, 0xf4ecd8, 'mapStone');
  glow(x - 0.08, G + 0.87, z + 0.26, 0.035, 0.06, 0.035, 0xffb050, 0.8);
  L.box(x + 0.12, G + 0.77, z + 0.27, 0.16, 0.04, 0.08, 0xe8c840, 'petal');
  L.box(x - 0.2, G + 0.78, z - 0.02, 0.06, 0.07, 0.06, 0xe8eef2, 'mapStone');
}
