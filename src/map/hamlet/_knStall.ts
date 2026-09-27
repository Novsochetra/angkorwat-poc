import { hash3 } from '../../voxel/random';
import { BAMBOO, pickTone, PLANK, POST, Site, THATCH } from '../jungle/_campKit';

/**
 * The stalls of Phnom Kulen, what stays when they close (their goods and the
 * grill's fire come out with the sellers: the people part's things, see
 * `people/_sceneKulenKit.ts`):
 *
 * - `buildFoodStall`: at the picnic place, a bamboo stand under a faded blue
 *   tarp: its counter (fruit, drinks and grilled things are laid on it by
 *   day), a long charcoal grill on legs beside it, the red cooler, crates of
 *   drinks, a sack of charcoal, a water jar, bananas and snacks hanging from
 *   the front beam, a chalk board of prices; in front a low table and
 *   bright plastic stools for those who eat there.
 * - `buildDrinkStall`: at the mountain road's foot, the pilgrims' stop: a
 *   sugarcane-juice cart (the green press, stalks of cane leaning on it), a
 *   table with crates of water and the cooler under a big striped parasol,
 *   a long bamboo bench facing the road to rest on.
 *
 * Stall space (m): +z its front (the customers' side), +x its left, y up
 * from its ground; sizes × 1.4 like the people. Families: `mapBark`,
 * `mapStone`, `petal` (cloth, tarp, food), `mapLeaf` (leaves).
 */

/**
 * Where the grill's fire is (stall space): a long trough low on its legs by
 * the stall's left side, the cook standing between the posts working over
 * it (`POSE.stir`: its hands reach `FIT.wok` ahead); the people part lays
 * the embers and the food on it; the smoke rises from it.
 */
export const GRILL = { x: 2.9, z: 0.3, top: 0.52, len: 1.3, w: 0.52 };
/** The counter's top (stall space): its middle, size and height. */
export const COUNTER = { x: 0, z: 0.85, w: 3.0, d: 0.62, top: 0.92 };
/** A low Khmer stool's seat (m: the people's `FIT.stool` for an adult on the map). */
export const STOOL_TOP = 0.24;
/** The low table in front and its stools (stall space: x, z), for those eating there. */
export const TABLE = { x: -0.4, z: 2.75, top: 0.44 };
export const STOOLS: readonly [number, number][] = [
  [-1.2, 2.75],
  [0.4, 2.75],
  [-0.4, 3.5],
  [-0.4, 2.0],
];
/** The drinks stall's low stools facing the road (stall space), for pilgrims resting, and the seller's. */
export const REST_STOOLS: readonly [number, number][] = [
  [-0.9, 1.9],
  [0.1, 2.05],
  [1.1, 1.9],
  [0.6, 2.9],
];
export const SELLER_SEAT: readonly [number, number] = [-1.35, -0.55];

const TARP = [0x3f6f9a, 0x4a7aa2, 0x36648e];
const STOOL_COLORS = [0xd8352a, 0x2f6fc0, 0x2e9a5a, 0xe8c02a];

export function buildFoodStall(s: Site): void {
  const seed = s.seed;
  const tone = (list: readonly number[], a: number, b: number, c: number) => pickTone(list, a, b, c, seed);
  const r = (a: number, b = 0) => hash3(a, b, 5, seed + 23);

  // ── Frame: four bamboo posts, beams, a tarp roof sloping to the back ──
  const px = 1.75;
  const pz = 1.15;
  const hFront = 2.75;
  const hBack = 2.4;
  for (const [x, z, h] of [
    [-px, pz, hFront],
    [px, pz, hFront],
    [-px, -pz, hBack],
    [px, -pz, hBack],
  ]) {
    const g = s.ground(x, z);
    s.box(x, (g + h) / 2, z, 0.15, h - g, 0.15, tone(BAMBOO, x * 10, z * 10, 1), 'mapBark');
  }
  s.box(0, hFront - 0.05, pz, 2 * px + 0.3, 0.1, 0.12, tone(POST, 1, 2, 2), 'mapBark');
  s.box(0, hBack - 0.05, -pz, 2 * px + 0.3, 0.1, 0.12, tone(POST, 2, 3, 3), 'mapBark');
  for (const x of [-px, px]) s.beam([x, hBack, -pz - 0.3], [x, hFront, pz + 0.3], 0.1, 0.1, tone(POST, x, 4, 4), 'mapBark');
  const tilt = Math.atan2(hFront - hBack, 2 * pz + 0.6);
  for (let k = 0; k < 3; k++) {
    const z = -pz - 0.4 + ((k + 0.5) * (2 * pz + 0.8)) / 3;
    const y = hBack + 0.06 + ((z + pz + 0.4) / (2 * pz + 0.8)) * (hFront - hBack);
    s.box(0, y, z, 2 * px + 0.7, 0.05, (2 * pz + 0.8) / 3 + 0.04, tone(TARP, k, 5, 5), 'petal', { rx: -tilt, shade: 0.92 + 0.12 * r(k) });
  }
  // (a lighter band where the tarp folds over the front beam)
  s.box(0, hFront + 0.02, pz + 0.42, 2 * px + 0.72, 0.18, 0.06, 0x6d97bc, 'petal');

  // ── The counter: a bamboo top on legs, a woven panel below ──
  const C = COUNTER;
  for (const sx of [1, -1])
    for (const dz of [-1, 1]) s.box(sx * (C.w / 2 - 0.08), C.top / 2, C.z + dz * (C.d / 2 - 0.06), 0.08, C.top, 0.08, tone(BAMBOO, sx, dz, 6), 'mapBark');
  for (let k = 0; k < 4; k++) s.box(0, C.top - 0.03, C.z - C.d / 2 + ((k + 0.5) * C.d) / 4, C.w, 0.05, C.d / 4 - 0.02, tone(BAMBOO, k, 7, 7), 'mapBark', { shade: 0.95 + 0.08 * r(k, 1) });
  for (let k = 0; k < 6; k++) s.box(-C.w / 2 + ((k + 0.5) * C.w) / 6, C.top * 0.5, C.z + C.d / 2 - 0.02, C.w / 6 - 0.02, C.top * 0.7, 0.05, k % 2 ? tone(BAMBOO, k, 8, 8) : tone(THATCH, k, 9, 9), 'mapBark');

  // ── The grill beside it: a long iron trough of charcoal, low on its legs, outside the posts ──
  const G = GRILL;
  for (const sx of [1, -1])
    for (const dz of [-1, 1]) s.box(G.x + sx * (G.w / 2 - 0.04), (G.top - 0.18) / 2, G.z + dz * (G.len / 2 - 0.05), 0.06, G.top - 0.18, 0.06, 0x2c2a28, 'mapStone');
  s.box(G.x, G.top - 0.11, G.z, G.w, 0.18, G.len, 0x3a3634, 'mapStone');
  s.box(G.x, G.top - 0.04, G.z, G.w - 0.1, 0.06, G.len - 0.1, 0x1e1c1a, 'mapStone');
  // (the wire grate over it)
  for (let k = 0; k < 5; k++) s.box(G.x, G.top + 0.01, G.z - G.len / 2 + 0.12 + (k * (G.len - 0.24)) / 4, G.w + 0.04, 0.015, 0.02, 0x5a5a58, 'mapStone');
  // A sack of charcoal at its back end, a palm-leaf fan on the sack.
  s.box(G.x + 0.05, 0.3, G.z - G.len / 2 - 0.45, 0.5, 0.6, 0.42, 0xe4ddc8, 'petal', { ry: 0.3 });
  s.box(G.x + 0.05, 0.62, G.z - G.len / 2 - 0.45, 0.4, 0.06, 0.34, 0x2a2622, 'mapStone', { ry: 0.3 });
  s.box(G.x - 0.05, 0.66, G.z - G.len / 2 - 0.4, 0.34, 0.02, 0.3, 0xc8b070, 'mapBark', { ry: 0.9 });

  // ── Behind the counter: the cooler, crates of drinks, the water jar, a stool ──
  s.box(-1.1, 0.26, -0.55, 0.9, 0.5, 0.55, 0xc8342a, 'mapStone');
  s.box(-1.1, 0.54, -0.55, 0.92, 0.08, 0.57, 0xf2efe6, 'mapStone');
  s.box(-1.1, 0.6, -0.55, 0.3, 0.05, 0.1, 0xf2efe6, 'mapStone');
  for (let k = 0; k < 2; k++) {
    s.box(0.25, 0.18 + k * 0.34, -0.7, 0.62, 0.32, 0.44, k ? 0x2f5fb0 : 0xd83a2e, 'mapStone', { ry: k * 0.15 });
    // (bottle caps in rows)
    for (let q = 0; q < 3; q++) s.box(0.1 + q * 0.15, 0.36 + k * 0.34, -0.7, 0.07, 0.04, 0.3, 0xe8e2c8, 'mapStone', { ry: k * 0.15 });
  }
  const jarC = [0x5a3b26, 0x4e3322, 0x66442c];
  s.box(1.2, 0.22, -0.7, 0.5, 0.44, 0.5, tone(jarC, 1, 10, 10), 'mapStone');
  s.box(1.2, 0.22, -0.7, 0.44, 0.44, 0.44, tone(jarC, 2, 11, 11), 'mapStone', { ry: Math.PI / 4 });
  s.box(1.2, 0.47, -0.7, 0.36, 0.06, 0.36, tone(PLANK, 3, 12, 12), 'mapBark');
  stool(s, 0.2, 0.2, STOOL_COLORS[1]);

  // ── Hanging from the front beam: bananas, snacks in bags ──
  for (const [x, n] of [
    [-1.2, 5],
    [0.9, 4],
  ]) {
    s.box(x, hFront - 0.35, pz + 0.05, 0.03, 0.5, 0.03, 0x8a7448, 'mapBark');
    for (let k = 0; k < n; k++) s.box(x + (k - (n - 1) / 2) * 0.1, hFront - 0.68 - Math.abs(k - (n - 1) / 2) * 0.05, pz + 0.05, 0.1, 0.3, 0.12, k % 2 ? 0xe8c83a : 0xd8c040, 'petal', { rz: (k - (n - 1) / 2) * 0.15 });
  }
  for (let k = 0; k < 5; k++) s.box(-0.3 + k * 0.2, hFront - 0.42, pz + 0.07, 0.15, 0.22, 0.04, [0xe83a3a, 0xf0c030, 0x2a8ad0, 0xe86aa0, 0x5ab04a][k], 'petal');

  // ── The chalk board of prices on the front-right post ──
  s.box(-px - 0.12, 1.55, pz, 0.04, 0.6, 0.5, 0x243028, 'mapStone');
  for (let k = 0; k < 4; k++) s.box(-px - 0.15, 1.72 - k * 0.12, pz + 0.02 - (k % 2) * 0.05, 0.02, 0.03, 0.3 - (k % 2) * 0.1, 0xe8e6de, 'petal');

  // ── In front: a low table and plastic stools ──
  const T = TABLE;
  s.box(T.x, T.top - 0.03, T.z, 1.3, 0.05, 0.8, 0xe8e4da, 'mapStone');
  for (const sx of [1, -1]) for (const dz of [1, -1]) s.box(T.x + sx * 0.55, (T.top - 0.05) / 2, T.z + dz * 0.3, 0.05, T.top - 0.05, 0.05, 0xd8d4ca, 'mapStone');
  STOOLS.forEach(([x, z], k) => stool(s, x, z, STOOL_COLORS[(k + Math.floor(r(k, 2) * 4)) % STOOL_COLORS.length]));
}

export function buildDrinkStall(s: Site): void {
  const seed = s.seed;
  const tone = (list: readonly number[], a: number, b: number, c: number) => pickTone(list, a, b, c, seed);

  // ── The sugarcane-juice cart: a wooden box on two bicycle wheels, the green press on it ──
  const cx = 1.2;
  const cz = -0.2;
  s.box(cx, 0.75, cz, 1.5, 0.5, 0.85, tone(PLANK, 1, 1, 1), 'mapBark');
  s.box(cx, 1.02, cz, 1.6, 0.05, 0.95, tone(PLANK, 2, 2, 2), 'mapBark', { shade: 1.08 });
  for (const dz of [1, -1]) {
    s.box(cx, 0.36, cz + dz * 0.5, 0.64, 0.64, 0.06, 0x2a2826, 'mapStone');
    s.box(cx, 0.36, cz + dz * 0.5, 0.64, 0.64, 0.06, 0x2a2826, 'mapStone', { rz: Math.PI / 4 });
    s.box(cx, 0.36, cz + dz * 0.53, 0.14, 0.14, 0.06, 0xb8b6b0, 'mapStone');
  }
  s.box(cx + 0.95, 0.9, cz, 0.5, 0.05, 0.05, 0x5a4a3a, 'mapBark');
  // (the press: a green housing with its rollers' wheel, a glass for the juice)
  s.box(cx - 0.25, 1.32, cz, 0.62, 0.55, 0.5, 0x2f8a5a, 'mapStone');
  s.box(cx - 0.25, 1.62, cz, 0.66, 0.08, 0.54, 0x3a9a66, 'mapStone');
  s.box(cx - 0.25, 1.35, cz + 0.3, 0.5, 0.5, 0.05, 0x9a9a96, 'mapStone');
  s.box(cx + 0.35, 1.13, cz + 0.2, 0.12, 0.18, 0.12, 0xd8e0a0, 'petal');
  // Stalks of cane leaning on the cart, green-gold with dark rings.
  for (let k = 0; k < 6; k++) {
    const z = cz - 0.35 + k * 0.14;
    const lean = 0.35 + 0.1 * hash3(k, 3, 4, seed);
    s.beam([cx + 1.05, 0.02, z], [cx + 0.72 - lean, 2.2 + 0.2 * hash3(k, 5, 6, seed), z + 0.05], 0.07, 0.07, k % 2 ? 0xa8a84a : 0x98a040, 'mapBark');
  }

  // ── The table: crates of water, the cooler; under a big striped parasol ──
  const tx = -1.0;
  const tz = -0.1;
  for (const sx of [1, -1]) for (const dz of [1, -1]) s.box(tx + sx * 0.6, 0.42, tz + dz * 0.35, 0.07, 0.84, 0.07, tone(BAMBOO, sx, dz, 3), 'mapBark');
  s.box(tx, 0.86, tz, 1.4, 0.06, 0.85, tone(PLANK, 4, 4, 4), 'mapBark');
  for (let k = 0; k < 2; k++) {
    s.box(tx - 0.3 + k * 0.62, 1.05, tz, 0.55, 0.32, 0.42, k ? 0x2f5fb0 : 0xd83a2e, 'mapStone');
    for (let q = 0; q < 3; q++) s.box(tx - 0.42 + k * 0.62 + q * 0.13, 1.26, tz, 0.08, 0.12, 0.3, 0xcfe6f0, 'petal');
  }
  s.box(tx + 0.1, 0.26, tz - 0.9, 0.9, 0.5, 0.55, 0xc8342a, 'mapStone');
  s.box(tx + 0.1, 0.54, tz - 0.9, 0.92, 0.08, 0.57, 0xf2efe6, 'mapStone');
  const pole: [number, number] = [tx - 0.1, tz - 0.55];
  s.box(pole[0], 1.4, pole[1], 0.06, 2.8, 0.06, 0xd8d0c0, 'mapStone');
  for (let k = 0; k < 4; k++) s.box(pole[0], 2.78 - k * 0.05, pole[1], 2.6 - k * 0.6, 0.06, 2.6 - k * 0.6, k % 2 ? 0xf2ecd8 : 0xc83a2a, 'petal');
  // (the seller's low stool by her table)
  const [sx0, sz0] = SELLER_SEAT;
  stool(s, sx0, sz0, 0x2f6fc0);

  // ── Low stools for those resting, facing the road, a low table between them ──
  REST_STOOLS.forEach(([x, z], k) => stool(s, x, z, STOOL_COLORS[(k + 1) % STOOL_COLORS.length]));
  s.box(0.1, 0.4, 2.55, 0.9, 0.05, 0.55, 0xe8e4da, 'mapStone');
  for (const sx of [1, -1]) for (const dz of [1, -1]) s.box(0.1 + sx * 0.38, 0.19, 2.55 + dz * 0.2, 0.05, 0.38, 0.05, 0xd8d4ca, 'mapStone');
}

/** A low plastic stool (its seat `STOOL_TOP` high), in its colour. */
function stool(s: Site, x: number, z: number, color: number): void {
  s.box(x, STOOL_TOP - 0.02, z, 0.34, 0.04, 0.34, color, 'mapStone');
  s.box(x, (STOOL_TOP - 0.04) / 2, z, 0.28, STOOL_TOP - 0.04, 0.28, color, 'mapStone', { shade: 0.85 });
}
