import { traceSource } from '../../feedback/sourceTrace';
import type { VoxelBox, VoxelBuilder } from '../../voxel/VoxelBuilder';
import { HAMMOCK, HOME, HOME_LAMP, DOOR, STAIR, VERANDA, YARD } from './_psPlan';
import type { PsGlowFn } from './_psHut';
import { BAMBOO, basket, bigJar, PsFrame, pick, POST, STRAW, thatchSlope, WEAVE, type Rgb } from './_psKit';

/**
 * The palm sugar family's own house (ផ្ទះស្លឹក), a humble one beside the
 * cooking shed (`_psPlan.ts` `HOME`, its front and veranda to the east, the
 * yard): rough hardwood posts that run from stones on the ground up to the
 * roof, the floor 2.6 m up on its joists, walls of woven sugar-palm leaf
 * between bamboo battens, a steep gabled roof of palm thatch like the shed's
 * (the gables woven too, a plain bamboo barge board along each: no horns),
 * the door open with its lamp hung by it on the open veranda (រានហាល) and
 * a steep wooden stair down from the veranda's south end; shutters propped
 * open on dark rooms. Under the house, in the shade where the day is lived:
 * a striped nylon hammock between two posts, the bamboo bed platform (kre)
 * with its mat and pillow, the hens' round basket; the water jars in a row
 * under the south eave, a krama drying over the veranda's rail. At night
 * the lamp and the window glow (`lamp`: the lamps' glow mesh).
 */

/** Woven leaf a little greyer than the shed's (older), and the door's and shutters' planks. */
const PLANK: readonly Rgb[] = [0x6e5440, 0x7a5e46, 0x634a38];
const DARK = 0x221a14;
/** The hammock's nylon stripes, the kre's mat, the pillow. */
const HAMMOCK_C: readonly Rgb[] = [0x2f7a8c, 0xd8c24a, 0x2f7a8c, 0xc0392b, 0x2f7a8c];

export function buildHome(b: VoxelBuilder, y: number, lamp: PsGlowFn, small: Set<VoxelBox>): void {
  const H = new PsFrame(b, HOME.x, y, HOME.z, undefined, small, false, 9181);
  stilts(H);
  floors(H);
  walls(H, lamp);
  roof(H);
  veranda(H, lamp);
  stair(H);
  under(H);
}

/** The posts: rooms' corners and middles up to the roof, the middle one only to the floor, the veranda's to its deck; stones under them. */
function stilts(H: PsFrame): void {
  H = H.at(traceSource());
  const xs = [-1.95, 0, 1.95];
  const zs = [-2.65, 0, 2.65];
  let i = 0;
  for (const x of xs)
    for (const z of zs) {
      const top = x === 0 && z === 0 ? HOME.floor : HOME.wall;
      H.fine.box(x, 0.05, z, 0.32, 0.1, 0.32, 0x8a8478, 'mapStone', 0.9);
      H.box(x, top / 2, z, 0.2, top, 0.2, pick(POST, H.r(i++, 1)), 'mapBark', 0.95, (H.r(i, 2) - 0.5) * 0.15);
    }
  for (const z of [-2.65, 0.3]) {
    H.fine.box(VERANDA.x1 - 0.15, 0.05, z, 0.3, 0.1, 0.3, 0x8a8478, 'mapStone', 0.9);
    H.box(VERANDA.x1 - 0.15, HOME.floor / 2, z, 0.18, HOME.floor, 0.18, pick(POST, H.r(z, 3)), 'mapBark');
  }
}

/** Joists under the floor, the rooms' plank floor, the veranda's split bamboo. */
function floors(H: PsFrame): void {
  H = H.at(traceSource());
  const f = HOME.floor;
  for (const z of [-2.65, 0, 2.65]) H.span(HOME.x0 - 0.1, f - 0.3, z - 0.09, VERANDA.x1, f - 0.12, z + 0.09, pick(POST, H.r(z, 4)), 'mapBark', 0.85);
  for (let k = 0; k < 4; k++) {
    const z0 = HOME.z0 + (k * (HOME.z1 - HOME.z0)) / 4;
    H.span(HOME.x0, f - 0.12, z0, HOME.x1, f, z0 + (HOME.z1 - HOME.z0) / 4, pick(PLANK, H.r(k, 5)), 'mapBark', 0.9 + 0.08 * H.r(k, 6));
  }
  for (let k = 0; k < 3; k++) {
    const x0 = VERANDA.x0 + (k * (VERANDA.x1 - VERANDA.x0)) / 3;
    H.span(x0, f - 0.1, VERANDA.z0, x0 + (VERANDA.x1 - VERANDA.x0) / 3 - 0.03, f - 0.02, VERANDA.z1, pick(BAMBOO, H.r(k, 7)), 'mapBark', 0.95);
  }
}

/**
 * The walls: woven leaf panels in bands (checkered tones), battens across;
 * the front with the door (open, dark inside, the leaf of planks swung in)
 * and a window, a window in the back and the south walls, shutters propped
 * out; the front window and the doorway glow at night.
 */
function walls(H: PsFrame, lamp: PsGlowFn): void {
  H = H.at(traceSource());
  const f = HOME.floor;
  const top = HOME.wall;
  const band = (top - f) / 4;
  type Hole = [number, number, number, number];
  const door: Hole = [DOOR.z - DOOR.w / 2, DOOR.z + DOOR.w / 2, f, f + 1.95];
  const win = (a: number, c: number): Hole => [a, c, f + 0.85, f + 1.55];
  // A wall along z at x (front/back) or along x at z (the ends): panels of each band, leaving the holes open.
  const along = (fixed: number, a0: number, a1: number, alongZ: boolean, holes: Hole[], seed: number) => {
    for (let j = 0; j < 4; j++) {
      const y0 = f + j * band;
      const y1 = y0 + band;
      // (the band's runs between the holes that cut it)
      const cuts = holes.filter((h) => h[2] < y1 - 0.01 && h[3] > y0 + 0.01).sort((p, q) => p[0] - q[0]);
      let a = a0;
      let i = 0;
      for (const h of [...cuts, [a1, a1, 0, 0] as Hole]) {
        for (let s = a; s < h[0] - 0.05; i++) {
          const e = Math.min(h[0], s + 1.4);
          const c = pick(WEAVE, H.r(i, j, seed));
          const shade = (i + j) % 2 ? 0.86 : 0.98;
          if (alongZ) H.span(fixed - 0.03, y0, s, fixed + 0.03, y1, e, c, 'mapBark', shade);
          else H.span(s, y0, fixed - 0.03, e, y1, fixed + 0.03, c, 'mapBark', shade);
          s = e;
        }
        a = Math.max(a, h[1]);
      }
    }
    // Battens across, and the wall plate under the eaves; battens up at the panels' joints (not across a door or window).
    for (const by of [f + 0.05, f + band * 2, top - 0.08]) {
      if (alongZ) H.fine.span(fixed - 0.07, by - 0.04, a0, fixed + 0.07, by + 0.04, a1, pick(BAMBOO, H.r(by, seed, 9)), 'mapBark');
      else H.fine.span(a0, by - 0.04, fixed - 0.07, a1, by + 0.04, fixed + 0.07, pick(BAMBOO, H.r(by, seed, 9)), 'mapBark');
    }
    for (let v = a0 + 1.4; v < a1 - 0.3; v += 1.4) {
      if (holes.some((h) => v > h[0] - 0.1 && v < h[1] + 0.1)) continue;
      if (alongZ) H.fine.span(fixed - 0.06, f, v - 0.04, fixed + 0.06, top, v + 0.04, pick(BAMBOO, H.r(v, seed, 10)), 'mapBark', 0.95);
      else H.fine.span(v - 0.04, f, fixed - 0.06, v + 0.04, top, fixed + 0.06, pick(BAMBOO, H.r(v, seed, 10)), 'mapBark', 0.95);
    }
  };
  const frontWin = win(0.9, 1.85);
  along(HOME.x1, HOME.z0, HOME.z1, true, [door, frontWin], 11);
  along(HOME.x0, HOME.z0, HOME.z1, true, [win(-0.6, 0.4)], 12);
  along(HOME.z0, HOME.x0, HOME.x1, false, [], 13);
  along(HOME.z1, HOME.x0, HOME.x1, false, [win(-0.5, 0.5)], 14);
  // The dark rooms seen through the holes (a dark back set in), the door's plank leaf swung in, shutters propped out.
  H.span(HOME.x1 - 0.5, f, door[0], HOME.x1 - 0.42, door[3], door[1], DARK, 'mapBark');
  H.fine.box(HOME.x1 - 0.3, f + 0.97, door[0] + 0.06, 0.5, 1.9, 0.05, pick(PLANK, H.r(15)), 'mapBark', 0.9, -0.9);
  for (const [x, z0, z1, out] of [
    [HOME.x1, frontWin[0], frontWin[1], 1],
    [HOME.x0, -0.6, 0.4, -1],
  ]) {
    H.span(x - out * 0.5, frontWin[2], z0, x - out * 0.42, frontWin[3], z1, DARK, 'mapBark');
    H.fine.box(x + out * 0.22, frontWin[3] + 0.05, (z0 + z1) / 2, 0.45, 0.05, z1 - z0 + 0.1, pick(PLANK, H.r(x, 16)), 'mapBark', 0.95, 0, 0, out * 0.5);
  }
  H.span(-0.5, frontWin[2], HOME.z1 - 0.5, 0.5, frontWin[3], HOME.z1 - 0.42, DARK, 'mapBark');
  H.fine.box(0, frontWin[3] + 0.05, HOME.z1 + 0.22, 1.1, 0.05, 0.45, pick(PLANK, H.r(17)), 'mapBark', 0.95, 0, -0.5);
  // (lamplight in the front window and the doorway, at night)
  lamp(HOME.x1 - 0.4, (frontWin[2] + frontWin[3]) / 2, (frontWin[0] + frontWin[1]) / 2, 0.04, frontWin[3] - frontWin[2] - 0.06, frontWin[1] - frontWin[0] - 0.08, 0xd88a3c, 0.3);
  lamp(HOME.x1 - 0.38, f + 0.95, DOOR.z, 0.04, 1.8, DOOR.w - 0.1, 0xb86a2c, 1.3);
}

/**
 * The roof: two thatched slopes from the eaves over the walls to the ridge
 * (the eaves low and deep), the ridge cap; the gables filled with woven
 * leaf; a plain bamboo barge board along each gable's slopes.
 */
function roof(H: PsFrame): void {
  H = H.at(traceSource());
  const edge = HOME.x1 + HOME.over;
  const eave = HOME.wall - 0.12;
  const z0 = HOME.z0 - 0.6;
  const z1 = HOME.z1 + 0.6;
  for (const s of [-1, 1]) thatchSlope(H, { x0: s * edge, y0: eave, x1: s * 0.02, y1: HOME.ridge, z0, z1, rows: 7, seed: 40 + s });
  H.span(-0.32, HOME.ridge - 0.02, z0 - 0.05, 0.32, HOME.ridge + 0.26, z1 + 0.05, 0x5e5040, 'mapBark', 0.95);
  // The gables: woven leaf in steps under the roof.
  for (const z of [HOME.z0 - 0.03, HOME.z1 + 0.03]) {
    for (let y = HOME.wall - 0.1, j = 0; y < HOME.ridge - 0.2; y += 0.32, j++) {
      const w = Math.max(0.15, edge * ((HOME.ridge - (y + 0.32)) / (HOME.ridge - eave)) - 0.14);
      H.span(-w, y, z - 0.03, 0, y + 0.32, z + 0.03, pick(WEAVE, H.r(j, z, 18)), 'mapBark', j % 2 ? 0.86 : 0.98);
      H.span(0, y, z - 0.03, w, y + 0.32, z + 0.03, pick(WEAVE, H.r(j, z, 19)), 'mapBark', j % 2 ? 0.98 : 0.86);
    }
    // (battens up the gable: one in the middle, one each side under the slopes)
    for (const bx of [-1.2, 0, 1.2]) {
      const h = HOME.ridge - 0.25 - (Math.abs(bx) / edge) * (HOME.ridge - eave);
      H.fine.span(bx - 0.04, HOME.wall - 0.1, z + (z < 0 ? -0.07 : 0.03), bx + 0.04, h, z + (z < 0 ? -0.03 : 0.07), pick(BAMBOO, H.r(bx, z, 21)), 'mapBark', 0.95);
    }
    // (the barge boards: bamboo along the slopes' ends, meeting at the ridge)
    const out = z < 0 ? z0 - 0.02 : z1 + 0.02;
    for (const s of [-1, 1]) H.fine.stick(s * (edge + 0.05), eave - 0.05, out, 0, HOME.ridge + 0.22, out, 0.1, pick(BAMBOO, H.r(s, z, 20)), 'mapBark', 0.9);
  }
}

/** The veranda: a bamboo rail on its open sides (the stair's gap at the south end), a krama drying over it, the lamp hung by the door. */
function veranda(H: PsFrame, lamp: PsGlowFn): void {
  H = H.at(traceSource());
  const f = HOME.floor;
  const { x0, x1, z0, z1 } = VERANDA;
  for (const z of [z0 + 0.05, z0 + 1.1, z0 + 2.2]) H.fine.box(x1 - 0.05, f + 0.45, z, 0.08, 0.9, 0.08, pick(BAMBOO, H.r(z, 21)), 'mapBark');
  for (const hy of [0.45, 0.88]) {
    H.span(x1 - 0.1, f + hy - 0.04, z0, x1, f + hy + 0.04, z1 - STAIR.w - 0.1, pick(BAMBOO, H.r(hy, 22)), 'mapBark');
    H.span(x0, f + hy - 0.04, z0, x1, f + hy + 0.04, z0 + 0.1, pick(BAMBOO, H.r(hy, 23)), 'mapBark');
  }
  // A red-and-white krama over the front rail.
  H.fine.box(x1 + 0.02, f + 0.66, z0 + 0.8, 0.04, 0.46, 0.55, 0xb8342c, 'petal');
  H.fine.box(x1 + 0.04, f + 0.7, z0 + 0.8, 0.02, 0.07, 0.55, 0xf0e8dc, 'petal');
  // The lamp: a glass kerosene lamp on a wire from the eave, lit in the evening and before dawn.
  const L = HOME_LAMP;
  const F = H.fine;
  F.box(L.x, L.y + 0.28, L.z, 0.02, 0.3, 0.02, 0x2e2a28, 'mapStone');
  F.box(L.x, L.y + 0.12, L.z, 0.16, 0.05, 0.16, 0x4a4238, 'mapStone');
  F.box(L.x, L.y - 0.14, L.z, 0.2, 0.06, 0.2, 0x4a4238, 'mapStone');
  lamp(L.x, L.y, L.z, 0.12, 0.2, 0.12, 0xffb45a, 2.1);
}

/** The stair: two stringers from the veranda's edge to the ground, treads between (wood: they sound and hold like the others). */
function stair(H: PsFrame): void {
  H = H.at(traceSource());
  const f = HOME.floor;
  const { x, z0, z1, w } = STAIR;
  const n = 7;
  for (const s of [-1, 1]) H.stick(x + (s * w) / 2, f, z0, x + (s * w) / 2, 0, z1, 0.1, pick(POST, H.r(s, 24)), 'mapBark');
  for (let k = 1; k < n; k++) {
    const t = k / n;
    H.box(x, f * (1 - t) - 0.03, z0 + (z1 - z0) * t, w - 0.06, 0.06, 0.3, pick(PLANK, H.r(k, 25)), 'mapBark', 0.95);
  }
}

/** Under the house: the hammock, the kre with its mat and pillow, the hens' basket, the jars under the south eave. */
function under(H: PsFrame): void {
  H = H.at(traceSource());
  // The hammock: ropes from the two posts, the striped cloth sagging between them.
  const { x, z0, z1, y } = HAMMOCK;
  const zm = (z0 + z1) / 2;
  const n = 5;
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const z = z0 + 0.45 + (z1 - z0 - 0.9) * t;
    const sag = y + 0.35 * ((z - zm) / ((z1 - z0) / 2 - 0.45)) ** 2;
    H.fine.box(x, sag, z, 0.5, 0.08, (z1 - z0 - 0.9) / n + 0.02, pick(HAMMOCK_C, k / n), 'petal', 0.95);
  }
  for (const s of [-1, 1]) H.fine.stick(x, 1.45, s < 0 ? z0 + 0.1 : z1 - 0.1, x, y + 0.36, s < 0 ? z0 + 0.45 : z1 - 0.45, 0.03, 0xd8d0b8, 'petal');
  // The kre: a bamboo slat platform on short legs, a mat and a pillow.
  const k0 = { x0: -1.8, x1: -0.35, z0: -2.35, z1: -0.85, h: 0.48 };
  for (const lx of [k0.x0 + 0.08, k0.x1 - 0.08]) for (const lz of [k0.z0 + 0.08, k0.z1 - 0.08]) H.box(lx, k0.h / 2, lz, 0.08, k0.h, 0.08, pick(POST, H.r(lx, lz, 26)), 'mapBark');
  for (let k = 0; k < 5; k++) H.span(k0.x0, k0.h - 0.05, k0.z0 + k * 0.3, k0.x1, k0.h, k0.z0 + k * 0.3 + 0.27, pick(BAMBOO, H.r(k, 27)), 'mapBark', 0.95);
  H.fine.span(k0.x0 + 0.1, k0.h, k0.z0 + 0.1, k0.x1 - 0.1, k0.h + 0.03, k0.z1 - 0.1, 0xb04a3a, 'petal', 0.95);
  H.fine.box(k0.x0 + 0.3, k0.h + 0.08, (k0.z0 + k0.z1) / 2, 0.3, 0.12, 0.5, 0xe8e0cc, 'petal');
  // The hens' round basket (upturned, a gap to go in) and a scatter of rice husk.
  const c = YARD.coop;
  basket(H.fine, c.x, 0, c.z, 0.7, 0.45, 28);
  H.fine.box(c.x, 0.52, c.z, 0.4, 0.1, 0.4, pick(STRAW, H.r(29)), 'mapBark', 0.9);
  // The water jars under the south eave, the first one with a dipper on its lid.
  YARD.jars.xs.forEach((jx, k) => bigJar(H, jx, 0, YARD.jars.z + (k % 2) * 0.12, 1.02 - 0.06 * (k % 3), 30 + k, k !== 2));
  H.fine.box(YARD.jars.xs[0] + 0.1, 1.08, YARD.jars.z, 0.14, 0.1, 0.14, 0x9a8a6a, 'mapBark');
  H.fine.stick(YARD.jars.xs[0] + 0.1, 1.1, YARD.jars.z, YARD.jars.xs[0] + 0.45, 1.15, YARD.jars.z - 0.2, 0.03, 0x7a5a3a, 'mapBark');
}
