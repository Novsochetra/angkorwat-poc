import type { PieceSpec } from './pieces';

/**
 * Furniture and lanterns he places in and round what he built (AWP-23, build
 * plan step 4 "decorating"): build pieces like the others (build/pieces.ts
 * merges these into `PIECES`: saved, drawn, walked round, taken down and paid
 * for the same way), each one a model the map already draws (build/models/
 * furniture.ts calls the village's own kit functions: nothing new in src/kit).
 * No three.js.
 *
 * - **The list** (each with where its model comes from):
 *   - `teamat` កន្ទេល: a sitting mat with a teapot and cups (village/_kit.ts
 *     `mat`: his veranda's and his room's);
 *   - `bedmat` កន្ទេលដេក: a sleeping mat, pillow and krama (his room's,
 *     hamlet/_home.ts `inside`): L lies him down on it, as the bamboo bed;
 *   - `bench` កៅអីវែង: a bamboo bench with a clay jug and cups (the palm sugar
 *     shed's, hamlet/_psHut.ts `bench`, raised to 0.5 m: he sits on it, J);
 *   - `loom` កីត្បាញ: a Khmer loom with its silk warp (hamlet/_evKit.ts `loom`);
 *   - `baskets` កញ្ជើ: a woven basket of rice and one of palm sugar cakes
 *     (hamlet/_psKit.ts `basket`, `cakeTray`): no storage chest is drawn
 *     anywhere on the map, so the baskets take its place;
 *   - `pot` ផើងផ្កា: a potted plant (village/_kit.ts `potPlant`);
 *   - `mortar` ត្បាល់: a rice mortar and its pestle (hamlet/_evKit.ts `mortar`);
 *   - `oillamp` ចង្កៀងប្រេងកាត: a kerosene lamp, a glass on a tin base (his window
 *     sill's, hamlet/_home.ts); lit at dusk;
 *   - `hanglamp` ចង្កៀងព្យួរ: a tin lantern hung on a cord under a roof (the palm
 *     sugar shed's, hamlet/_psHut.ts `hanging`); lit at dusk.
 * - **Where** (roam/_buildFurnSpots.ts): on his land's ground, on a floor of the
 *   blocks he built (the top of the solid under it at his feet's level), inside
 *   his stilt house (its floor and veranda, round its own things); on a
 *   0.25 m grid (`FURN_GRID`) and the land's lines (AWP-30's 15° and 5° turns).
 *   A hanging lantern needs a roof over it at least `HANG.min` m over the floor
 *   (his blocks, his house's roof, a shelter he built) and at most `HANG.max`:
 *   its cord runs from its hook (`HANG.hook`) up to it.
 * - **Height** (`band`): the part of the room over the floor a piece fills (m),
 *   so a mat goes under a hanging lantern and a lantern over a bench.
 */

export type FurnitureId = 'teamat' | 'bedmat' | 'bench' | 'loom' | 'baskets' | 'pot' | 'mortar' | 'oillamp' | 'hanglamp';

/** The card's order (its "Furniture" tab). */
export const FURNITURE_IDS: readonly FurnitureId[] = ['teamat', 'bedmat', 'bench', 'loom', 'baskets', 'pot', 'mortar', 'oillamp', 'hanglamp'];

/** A furniture piece's middle steps on this grid (m: from his land's corner). */
export const FURN_GRID = 0.25;

/**
 * The hanging lantern: its glass's middle (m over the floor: over his head, 2.26 m tall to the walk map, so he walks
 * under it), its hook (the cord goes up from there), the roof over the floor it may hang from (m: at least, at most).
 */
export const HANG = { glass: 2.5, hook: 2.78, min: 2.85, max: 6.5 } as const;

/** What furniture adds to a piece's spec (build/pieces.ts `PieceSpec`). */
export interface FurnSpec {
  /** The part of the room over its floor it fills (m: from, to): pieces overlap only where these meet. */
  readonly band: readonly [number, number];
  /** It hangs from a roof (the hanging lantern). */
  readonly hang?: boolean;
}

export const FURN: Record<FurnitureId, FurnSpec> = {
  teamat: { band: [0, 0.3] },
  bedmat: { band: [0, 0.25] },
  bench: { band: [0, 0.9] },
  loom: { band: [0, 1.4] },
  baskets: { band: [0, 0.7] },
  pot: { band: [0, 1.3] },
  mortar: { band: [0, 1.6] },
  oillamp: { band: [0, 0.3] },
  hanglamp: { band: [2.25, HANG.hook + 0.05], hang: true },
};

export const isFurniture = (id: string): id is FurnitureId => id in FURN;

/**
 * The pieces (build/pieces.ts's contract: the frame, solids, seat, light). Prices: what its materials cost (bamboo
 * 2,000 ៛, a log 6,000, thatch 2,500, clay 1,500: build/materials.ts) and what is always bought (`bought`).
 */
export const FURNITURE: Record<FurnitureId, PieceSpec> = {
  // A woven mat (1.2 × 1.8 m, red with green bands) with a teapot and two cups: someone sits here in the evening.
  teamat: {
    id: 'teamat', name: 'buildTeaMat', line: 'buildTeaMatLine', price: 9_000, cost: { thatch: 2 }, bought: 'buildBuyTea', secs: 3, w: 1.3, d: 1.9, h: 0.25, max: 4, walkThrough: true,
    solids: [],
  },
  // A sleeping mat (3 × 1.3 m, reed with red and green borders), the pillow at its −x end, a krama folded at its foot.
  bedmat: {
    id: 'bedmat', name: 'buildBedMat', line: 'buildBedMatLine', price: 12_000, cost: { thatch: 3 }, bought: 'buildBuyPillow', secs: 4, w: 3.05, d: 1.35, h: 0.2, max: 3, walkThrough: true,
    solids: [],
    seat: { x: 0, y: 0.04, z: 0, yaw: 0, lie: true },
  },
  // A bamboo bench (1.8 m long, its seat 0.5 m: his thighs level on it, as the shelter's), a clay jug and two cups at one end.
  bench: {
    id: 'bench', name: 'buildBench', line: 'buildBenchLine', price: 11_500, cost: { bamboo: 2, log: 1, clay: 1 }, secs: 6, w: 1.85, d: 0.55, h: 0.9, max: 4,
    solids: [[0, 0, 1.8, 0.5, 0.5]],
    seat: { x: -0.3, y: 0.5, z: 0, yaw: 0 },
  },
  // The loom: its frame (1.7 × 1.3 m, 1.35 m high), the silk warp, the cloth beam, the weaver's low bench before it (+z).
  loom: {
    id: 'loom', name: 'buildLoom', line: 'buildLoomLine', price: 30_000, cost: { log: 2, bamboo: 2 }, bought: 'buildBuySilk', secs: 12, w: 1.8, d: 2.05, h: 1.4, max: 1,
    solids: [
      [0, -0.33, 1.78, 1.34, 1.35],
      [0, 0.85, 1.0, 0.3, 0.23],
    ],
  },
  // Two woven baskets: rice heaped in one, a tray of palm sugar cakes on the other.
  baskets: {
    id: 'baskets', name: 'buildBaskets', line: 'buildBasketsLine', price: 10_000, cost: { bamboo: 3 }, bought: 'buildBuyRice', secs: 5, w: 1.4, d: 0.75, h: 0.7, max: 4,
    solids: [
      [-0.36, 0, 0.68, 0.68, 0.6],
      [0.38, 0, 0.58, 0.58, 0.5],
    ],
  },
  // A clay pot (its pot is in his way, the leaves are not) with a leafy plant, sometimes in flower.
  pot: {
    id: 'pot', name: 'buildPot', line: 'buildPotLine', price: 5_000, cost: { clay: 2 }, bought: 'buildBuyPlant', secs: 3, w: 0.9, d: 0.9, h: 1.3, max: 8,
    solids: [[0, 0, 0.56, 0.56, 0.48]],
  },
  // A wooden rice mortar (0.55 m) and its long pestle stood in it.
  mortar: {
    id: 'mortar', name: 'buildMortar', line: 'buildMortarLine', price: 6_000, cost: { log: 1 }, secs: 5, w: 0.75, d: 0.6, h: 1.6, max: 2,
    solids: [[-0.04, 0, 0.55, 0.55, 0.5]],
  },
  // A kerosene lamp: a tin base, a glass chimney; lit at dusk.
  oillamp: {
    id: 'oillamp', name: 'buildOilLamp', line: 'buildOilLampLine', price: 2_500, cost: {}, bought: 'buildBuyOilLamp', secs: 2, w: 0.3, d: 0.3, h: 0.3, max: 8,
    solids: [[0, 0, 0.22, 0.22, 0.28]],
    light: [0, 0.15, 0],
  },
  // A tin lantern on a cord from the roof (its glass over his head); lit at dusk.
  hanglamp: {
    id: 'hanglamp', name: 'buildHangLamp', line: 'buildHangLampLine', price: 2_000, cost: {}, bought: 'buildBuyGlass', secs: 3, w: 0.32, d: 0.32, h: HANG.hook, max: 8, walkThrough: true,
    solids: [],
    light: [0, HANG.glass, 0],
  },
};
