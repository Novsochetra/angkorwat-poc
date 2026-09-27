import { traceSource } from '../../feedback/sourceTrace';
import type { VoxelBox, VoxelBuilder } from '../../voxel/VoxelBuilder';
import { SELL_SEAT, STALL, STALL_TABLE } from './_psPlan';
import { BAMBOO, basket, CAKE, cakeTray, FROND, PsFrame, pick, POST, STRAW, thatchSlope } from './_psKit';

/**
 * The family's stall at the palm lane's edge (`_psPlan.ts` `STALL`, its
 * front to the lane, +x): four bamboo posts under a little roof of palm
 * thatch sloping back over the seller, a table of bamboo slats with the
 * day's sugar — round woven baskets heaped with golden cakes, a tray of
 * single cakes to sell one by one, the cakes wrapped in dry palm leaf in
 * long tied rolls (ស្ករត្នោតខ្ចប់, the old way to sell them) stacked
 * crosswise — a shelf of more baskets under it; fresh palm juice in bamboo
 * tubes standing in a blue ice box on the ground by the table's south end,
 * small bags of juice tied to the front beam; the seller's low stool
 * behind the table, a palm-leaf fan and her krama on the table's corner.
 * The painted sign stands by its north end (`_psSign.ts`).
 */

/** Palm juice (cloudy, pale gold) in the bags; the ice box's blue and white. */
const JUICE = 0xeee2b8;
const BOX_BLUE = 0x2e6aa8;

export function buildStall(b: VoxelBuilder, y: number, small: Set<VoxelBox>): void {
  const S = new PsFrame(b, STALL.x, y, STALL.z, undefined, small, false, 9201);
  frame(S);
  table(S);
  goods(S);
  juice(S);
  seat(S);
}

/** The posts (the front ones taller), the beams, the thatch sloping back. */
function frame(S: PsFrame): void {
  S = S.at(traceSource());
  const posts: [number, number][] = [
    [-1.05, 2.5],
    [0.95, 2.88],
  ];
  for (const [x, h] of posts) {
    for (const z of [-1.45, 1.45]) S.box(x, h / 2, z, 0.1, h, 0.1, pick(BAMBOO, S.r(x, z, 1)), 'mapBark', 0.92);
    S.span(x - 0.06, h - 0.1, -1.6, x + 0.06, h + 0.02, 1.6, pick(POST, S.r(x, 2)), 'mapBark', 0.9);
  }
  thatchSlope(S, { x0: -1.4, y0: 2.4, x1: 1.3, y1: 2.9, z0: -1.8, z1: 1.8, rows: 4, seed: 60, thick: 0.1 });
}

/** The table: legs, a shelf low down, the slatted top. */
function table(S: PsFrame): void {
  S = S.at(traceSource());
  const { x0, x1, z0, z1, h } = STALL_TABLE;
  for (const x of [x0 + 0.06, x1 - 0.06]) for (const z of [z0 + 0.06, z1 - 0.06]) S.box(x, h / 2, z, 0.07, h, 0.07, pick(POST, S.r(x, z, 3)), 'mapBark');
  S.span(x0, 0.28, z0, x1, 0.32, z1, pick(BAMBOO, S.r(4)), 'mapBark', 0.9);
  for (let k = 0; k < 4; k++) S.span(x0 + (k * (x1 - x0)) / 4, h - 0.04, z0 - 0.04, x0 + ((k + 1) * (x1 - x0)) / 4 - 0.02, h + 0.02, z1 + 0.04, pick(BAMBOO, S.r(k, 5)), 'mapBark', 0.95 + 0.06 * S.r(k, 6));
}

/** On the table and its shelf: baskets heaped with cakes, the tray of single cakes, the leaf-wrapped rolls. */
function goods(S: PsFrame): void {
  S = S.at(traceSource()).fine;
  const { x0, x1, h } = STALL_TABLE;
  const mx = (x0 + x1) / 2;
  // Baskets of cakes: each a heap, a few cakes on its top.
  for (const [z, k] of [
    [-0.85, 0],
    [-0.3, 1],
  ]) {
    basket(S, mx, h + 0.02, z, 0.44, 0.14, 70 + k);
    S.box(mx, h + 0.2, z, 0.38, 0.06, 0.38, pick(CAKE, S.r(k, 7)), 'mapStone');
    S.box(mx, h + 0.26, z, 0.26, 0.06, 0.26, pick(CAKE, S.r(k, 8)), 'mapStone', 1.05);
    for (const [dx, dz] of [
      [-0.07, -0.07],
      [0.08, 0.02],
      [-0.02, 0.09],
    ])
      S.box(mx + dx, h + 0.31, z + dz, 0.1, 0.045, 0.1, pick(CAKE, S.r(k, dx, 9)), 'mapStone', 0.95);
  }
  // The tray of single cakes at the front, sold one by one.
  cakeTray(S, x1 - 0.2, h + 0.02, 0.28, 0.42, 3, 74);
  // Rolls of cakes wrapped in dry palm leaf, tied in three places, stacked crosswise.
  for (let l = 0; l < 2; l++)
    for (let k = 0; k < 4 - l; k++) {
      const z = 0.55 + (k + l * 0.5) * 0.14;
      const y = h + 0.08 + l * 0.12;
      S.box(mx, y, z, 0.62, 0.12, 0.12, pick(FROND, S.r(k, l, 10)), 'mapBark', 1.05);
      for (const t of [-0.22, 0, 0.22]) S.box(mx + t, y, z, 0.03, 0.13, 0.13, 0x6a5238, 'mapBark');
    }
  // Under the table: two more baskets of cakes and a bundle of rolls.
  basket(S, mx - 0.05, 0.32, -0.6, 0.42, 0.2, 75);
  S.box(mx - 0.05, 0.56, -0.6, 0.34, 0.06, 0.34, pick(CAKE, S.r(11)), 'mapStone');
  basket(S, mx, 0.32, 0.1, 0.4, 0.2, 76);
  for (let k = 0; k < 3; k++) S.box(mx, 0.4 + 0.1 * (k % 2), 0.65 + k * 0.13, 0.6, 0.11, 0.11, pick(FROND, S.r(k, 12)), 'mapBark');
  // A palm-leaf fan and the seller's krama on the back corner of the table.
  S.box(x0 + 0.2, h + 0.03, -1.05, 0.26, 0.02, 0.3, pick(STRAW, S.r(13)), 'mapBark', 1.05, 0.5);
  S.box(x0 + 0.18, h + 0.04, 1.02, 0.26, 0.04, 0.3, 0x2f5a9a, 'petal');
  S.box(x0 + 0.18, h + 0.065, 1.02, 0.26, 0.02, 0.06, 0xf0e8dc, 'petal');
}

/** Fresh palm juice: bamboo tubes standing in the ice box by the table's south end, its lid leaning on it; small bags tied to the front beam. */
function juice(S: PsFrame): void {
  S = S.at(traceSource()).fine;
  const x = 0.35;
  const z = 1.85;
  S.box(x, 0.2, z, 0.62, 0.4, 0.44, BOX_BLUE, 'mapStone');
  S.box(x, 0.4, z, 0.56, 0.02, 0.38, 0xdad6cc, 'mapStone', 0.95);
  S.box(x + 0.38, 0.28, z, 0.05, 0.5, 0.44, 0xe8e4da, 'mapStone', 1, 0, 0, -0.3);
  for (let k = 0; k < 5; k++) {
    const tx = x - 0.18 + (k % 3) * 0.18;
    const tz = z - 0.09 + Math.floor(k / 3) * 0.18;
    const th = 0.62 + 0.08 * S.r(k, 14);
    S.box(tx, 0.4 + th / 2 - 0.25, tz, 0.13, th, 0.13, pick([0x8a6a3c, 0x9a7a44, 0x7a5a32], S.r(k, 15)), 'mapBark');
    S.box(tx, 0.4 + th - 0.25, tz, 0.09, 0.02, 0.09, JUICE, 'mapStone', 0.95);
  }
  for (let k = 0; k < 2; k++) {
    const bz = -1.35 + k * 0.16;
    S.box(0.98, 2.64, bz, 0.02, 0.16, 0.02, 0xd8d0b8, 'petal');
    S.box(0.98, 2.49, bz, 0.09, 0.14, 0.08, 0xe6d49a, 'petal', 0.95);
  }
}

/** The seller's low wooden stool behind the table. */
function seat(S: PsFrame): void {
  S = S.at(traceSource());
  const { x, z } = SELL_SEAT;
  S.box(x, 0.1, z, 0.32, 0.2, 0.28, pick(POST, S.r(16)), 'mapBark', 0.95);
  S.box(x, 0.215, z, 0.36, 0.03, 0.32, pick(BAMBOO, S.r(17)), 'mapBark');
}
