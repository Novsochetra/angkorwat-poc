import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { BODY_UNIT_M } from '../../world/scale';
import { FISH, fishModel, shade, type FishKind } from './_fishKinds';
import type { BasketFish } from './_fishSellBasket';

/**
 * His fish basket and a fish in his hand, as voxels (selling his fish:
 * _fishSell.ts), in body units (BU: the explorer's own, 1.7 m = 32.4 BU).
 *
 * The basket is the Khmer fisherman's: woven of thin bamboo strips, a round
 * belly, a narrow neck bound with a cord, a flared mouth; tied at the back
 * of his left hip (`'hip'`: character space, for the rig's `hips` slot) or
 * standing in the boat by his left knee (`'boat'`: its bottom's middle at
 * the origin; _fishing.ts places it). The tails of the fish in it stick out
 * of its mouth. A small one (it holds five fish of a rod's size): its
 * strips are a little coarser than real, so they read from the follow
 * camera.
 *
 * The fish in his hand: the catch's own model (_fishKinds.ts `fishModel`)
 * at its true length, hanging from his right fist by the lip (the `propR`
 * slot), as he hands it to a fish seller.
 */

/** The basket's height and its widest radius (BU). */
export const BASKET_H = 6.6;
const R_BELLY = 2.25;
/** Cells of the weave (BU). */
const CELL = 0.55;
/** At the hip (character space): the basket's bottom middle, behind his left hip, under the belt. */
const HIP = { x: 6.25, y: 4.9, z: -4.1 };
/** Straw (bamboo strips): light, mid, the darker ones crossing, the neck's cord, the rim's split bamboo. */
const STRAW = [0xd9bb7c, 0xcfae6c, 0xe0c58a];
const STRAW_DARK = [0xa8834a, 0x9c7840];
const CORD = 0x5a3a22;
const RIM = [0xb89050, 0xc49a58];

/** The basket's radius at height y (BU from its bottom): a round belly, the shoulder, the neck, the flared mouth. */
function radiusAt(y: number): number {
  const u = y / BASKET_H;
  if (u < 0.08) return 1.55 + (u / 0.08) * 0.35;
  if (u < 0.62) return 1.9 + (R_BELLY - 1.9) * Math.sin(((u - 0.08) / 0.54) * Math.PI) + (u > 0.35 ? -((u - 0.35) / 0.27) * 0.35 : 0);
  if (u < 0.74) return 1.55 - ((u - 0.62) / 0.12) * 0.35;
  if (u < 0.86) return 1.2;
  return 1.2 + ((u - 0.86) / 0.14) * 0.55;
}

/**
 * The basket with these fish in it: at the hip (character space, with its
 * cord up to the belt) or for the boat (bottom middle at the origin).
 */
export function basketBuilder(fish: readonly BasketFish[], at: 'hip' | 'boat'): VoxelBuilder {
  const b = new VoxelBuilder();
  const o = at === 'hip' ? HIP : { x: 0, y: 0, z: 0 };
  const n = Math.ceil((R_BELLY + 0.6) / CELL);
  const rows = Math.round(BASKET_H / CELL);
  const g = b.grid({ cell: CELL, origin: [o.x - n * CELL - CELL / 2, o.y, o.z - n * CELL - CELL / 2], mat: 'hat', jitter: 0.05, ao: 0.16, seed: 71 });
  for (let j = 0; j < rows; j++) {
    const y = (j + 0.5) * CELL;
    const r = radiusAt(y);
    const top = j === rows - 1;
    const neck = y / BASKET_H > 0.72 && y / BASKET_H < 0.8;
    for (let i = -n; i <= n; i++)
      for (let k = -n; k <= n; k++) {
        const d = Math.hypot(i * CELL, k * CELL);
        // (a shell one strip thick; the bottom a full disc)
        if (d > r + CELL * 0.3 || (j > 0 && d < r - CELL * 0.75)) continue;
        // The weave: strips running round, crossed by darker ones going up (every other column, shifting each row); the neck bound with cord.
        const a = Math.floor(((Math.atan2(k, i) + Math.PI) / (2 * Math.PI)) * 22);
        let c: number;
        if (neck) c = CORD;
        else if (top) c = RIM[(a + j) % 2];
        else if ((a + j) % 2 === 0 && j % 3 !== 2) c = STRAW_DARK[a % 2];
        else c = STRAW[Math.floor(hash3(a, j, k, 72) * STRAW.length)];
        g.set(i + n, j, k + n, c, neck ? 'leather' : top ? 'wood' : 'hat');
      }
  }
  g.commit();
  // The fish in it: a tail (or two) out of the mouth, leaning out, the last one kept the highest.
  const mouth = o.y + rows * CELL;
  const shown = fish.slice(-2);
  shown.forEach((f, q) => {
    const col = FISH[f.kind].shape.tail.color;
    const edge = FISH[f.kind].shape.tail.edge ?? shade(col, 0.8);
    const side = q === 0 ? -1 : 1;
    const x = o.x + side * 0.35;
    const z = o.z + (q === 0 ? 0.25 : -0.3);
    const h = 0.9 + (q === shown.length - 1 ? 0.45 : 0);
    // (the narrow root of the tail, then the fin spreading in a fork)
    b.box(x, mouth + h * 0.35, z, 0.36, h * 0.7, 0.28, shade(col, 1.08), 'metal', { rz: side * 0.25 });
    b.box(x + side * 0.22, mouth + h * 0.85, z, 0.62, 0.26, 0.14, col, 'leather', { rz: side * 0.25 });
    b.box(x + side * 0.05, mouth + h * 1.02, z, 0.24, 0.42, 0.12, edge, 'leather', { rz: side * 0.6 });
    b.box(x + side * 0.5, mouth + h * 0.98, z, 0.24, 0.42, 0.12, edge, 'leather', { rz: -side * 0.2 });
  });
  if (at === 'hip') {
    // The cord: from the neck up to his belt, over its back.
    const cy = o.y + BASKET_H * 0.76;
    b.span(o.x - 1.45, cy, o.z + 0.35, o.x - 0.95, 12.3, o.z + 0.95, CORD, 'leather');
    b.span(o.x - 1.7, 11.85, o.z + 0.6, o.x - 0.7, 12.55, o.z + 1.4, CORD, 'leather');
  }
  return b;
}

/** Where the right fist is (character space, BU: the `propR` joint's rest place). */
const FIST_R = { x: -5.65, y: 10.6, z: 0 };

/**
 * A fish in his right fist (character space, for the `propR` slot): its
 * own model at its true length (`cm`), hanging by the lip, its snout in his
 * fist, its back to the front (its flank to the side), as he holds it out.
 */
export function heldFishBuilder(kind: FishKind, cm: number): VoxelBuilder {
  const b = new VoxelBuilder();
  const m = fishModel(kind);
  const L = cm / 100 / BODY_UNIT_M;
  const c = L / m.n;
  for (const cl of m.cells) {
    // (its length down from the fist, its back forward, its left flank to his left)
    const x = FIST_R.x + cl.k * c;
    const y = FIST_R.y - 0.45 - (cl.i + 0.5) * c;
    const z = FIST_R.z + cl.j * c;
    b.box(x, y, z, c * 1.02, c * 1.02, c * 1.02, cl.color, cl.shine > 0.8 ? 'metal' : 'leather');
  }
  return b;
}
