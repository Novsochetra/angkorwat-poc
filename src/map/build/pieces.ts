import type { VoxelBuilder } from '../../voxel/VoxelBuilder';

/**
 * What he can build at home (ផ្ទះរបស់គាត់: his stilt house, hamlet/_homePlan.ts
 * `HOME_AT`), round 1: the pieces, their sizes, prices and the spots the game
 * uses on them, with no three.js, so the models (build/models/<id>.ts), the
 * build add-on (roam/_build*.ts, build/state.ts, build/view.ts) and his cattle
 * (roam/_cattle*.ts) read the same numbers.
 *
 * **A piece's frame**: local metres, real size on the map's scale (the explorer
 * is 2.4 m tall on the map, roam/types.ts `ROAM_SCALE` 1.4: doors, seats and rails
 * are made for him, as the village's own: the sugar-palm village's cattle pen
 * `EV_PEN` is 7 × 5.5 m), the piece's middle on the ground at (0, 0, 0), y up,
 * +z its front (the way it faces: the add-on turns it by `yaw` and sets it on
 * the land). `w` across (x), `d` deep (z), `h` its top.
 *
 * Every spot below is in that frame. The model draws the piece to match them;
 * the add-on uses them (where he sits, where the hammock hangs, where the lamp
 * glows, where cows sleep).
 */

export type PieceId = 'pen' | 'shelter' | 'kre' | 'fence' | 'spirit' | 'jar' | 'hammock' | 'lamp' | 'haystack';

export interface PieceSpec {
  readonly id: PieceId;
  /** Its name and a line for the build card (lang.ts keys: the build add-on adds them). */
  readonly name: string;
  readonly line: string;
  /** What it costs (riel: the materials and the help; 4 000 ៛ ≈ 1 US$). */
  readonly price: number;
  /** Seconds he works on it (hammering, tying, setting it down) before it stands. */
  readonly secs: number;
  /** Its footprint across, deep, its height (m). */
  readonly w: number;
  readonly d: number;
  readonly h: number;
  /** He can walk through it (a lamp post is still solid at its post: `solids`). */
  readonly walkThrough?: boolean;
  /** At most this many of it at home. */
  readonly max: number;
  /** Solid parts for the walk map (boxes: middle x, z, size w, d, top over the ground). Posts, rails, walls, a jar. */
  readonly solids: readonly (readonly [x: number, z: number, w: number, d: number, top: number])[];
  /** Where he sits on it (a seat's middle and the way he faces), if he may. */
  readonly seat?: { readonly x: number; readonly y: number; readonly z: number; readonly yaw: number; readonly lie?: boolean };
  /** The hammock's tie points (roam/_hammockSpots.ts `addHammock`: the cloth hangs between them). */
  readonly ties?: readonly [readonly [number, number, number], readonly [number, number, number]];
  /** Where a light glows at night (the lamp's flame, the spirit house's candle). */
  readonly light?: readonly [number, number, number];
  /** Where he kneels to pray before it (and the way he faces). */
  readonly kneel?: { readonly x: number; readonly z: number; readonly yaw: number };
  /** The pen: the room inside its rails for cows (a box: x, z, w, d) and its gate (the gap's middle on the rail, local). */
  readonly pen?: { readonly x: number; readonly z: number; readonly w: number; readonly d: number; readonly gate: readonly [number, number] };
  /** The trough (cows eat there: its middle). */
  readonly trough?: readonly [number, number, number];
}

/** Within this far of the house's middle he may build (m), not on the house, its stair, the garden's plants. */
export const BUILD_NEAR = 46;

export const PIECES: Record<PieceId, PieceSpec> = {
  // The cattle pen (គ្រោលគោ): rails on posts, the gate in the front rail, a thatched lean-to at the back, a log trough, a hay rack.
  pen: {
    id: 'pen', name: 'buildPen', line: 'buildPenLine', price: 60_000, secs: 20, w: 7, d: 5.6, h: 3.6, max: 2,
    solids: [
      [0, -2.8, 7, 0.2, 1.4], // back rail
      [-3.5, 0, 0.2, 5.6, 1.4], // left rail
      [3.5, 0, 0.2, 5.6, 1.4], // right rail
      [-2.25, 2.8, 2.5, 0.2, 1.4], // front rail, left of the gate
      [2.25, 2.8, 2.5, 0.2, 1.4], // front rail, right of the gate
    ],
    pen: { x: 0, z: 0.3, w: 6.4, d: 4.6, gate: [0, 2.8] },
    trough: [-2.2, 0.35, -1.6],
  },
  // A thatched shelter on four posts (ខ្ទម), open on every side: shade, a bench along its back.
  shelter: {
    // (w, d: the roof's eaves, 0.55 m past the posts; h: its ridge; the posts to the tie beams, the bench under the seat)
    id: 'shelter', name: 'buildShelter', line: 'buildShelterLine', price: 40_000, secs: 16, w: 4.4, d: 4, h: 4.35, max: 3, walkThrough: true,
    solids: [
      [-1.6, -1.4, 0.2, 0.2, 2.85],
      [1.6, -1.4, 0.2, 0.2, 2.85],
      [-1.6, 1.4, 0.2, 0.2, 2.85],
      [1.6, 1.4, 0.2, 0.2, 2.85],
      [0, -1.05, 2.84, 0.5, 0.62],
    ],
    seat: { x: 0, y: 0.62, z: -1.05, yaw: 0 },
  },
  // A bamboo bed on legs (គ្រែឫស្សី), knee high: to sit on and to lie on under the sky.
  kre: {
    id: 'kre', name: 'buildKre', line: 'buildKreLine', price: 15_000, secs: 8, w: 2.6, d: 1.6, h: 0.65, max: 3,
    solids: [[0, 0, 2.6, 1.6, 0.6]],
    seat: { x: 0, y: 0.6, z: 0, yaw: 0, lie: true },
  },
  // A run of bamboo fence (របងឫស្សី), three metres: posts and woven split bamboo, chest high to him.
  fence: {
    // (h: chest high to him, 2.4 m tall)
    id: 'fence', name: 'buildFence', line: 'buildFenceLine', price: 4_000, secs: 4, w: 3, d: 0.25, h: 1.6, max: 40,
    solids: [[0, 0, 3, 0.25, 1.6]],
  },
  // The spirit house (ខ្ទមព្រះភូមិ): a little Angkor tower on its post, a tray for offerings, incense. He kneels before it to pray.
  spirit: {
    id: 'spirit', name: 'buildSpirit', line: 'buildSpiritLine', price: 25_000, secs: 8, w: 1, d: 1, h: 2.4, max: 1,
    solids: [[0, 0, 0.3, 0.3, 1.6]],
    light: [0, 1.75, 0.18],
    kneel: { x: 0, z: 1.25, yaw: Math.PI },
  },
  // A big glazed water jar (ពាង) with its lid and a dipper, on a low stand.
  jar: {
    id: 'jar', name: 'buildJar', line: 'buildJarLine', price: 12_000, secs: 4, w: 1.1, d: 1.1, h: 1.3, max: 4,
    solids: [[0, 0, 1, 1, 1.3]],
  },
  // A hammock (អង្រឹង) between two posts, striped cloth.
  hammock: {
    id: 'hammock', name: 'buildHammock', line: 'buildHammockLine', price: 20_000, secs: 8, w: 3.8, d: 0.5, h: 1.8, max: 2, walkThrough: true,
    solids: [
      [-1.8, 0, 0.2, 0.2, 1.8],
      [1.8, 0, 0.2, 0.2, 1.8],
    ],
    ties: [
      [-1.7, 1.45, 0],
      [1.7, 1.45, 0],
    ],
  },
  // A lantern on a post (ចង្កៀង): it lights by itself at dusk.
  lamp: {
    id: 'lamp', name: 'buildLamp', line: 'buildLampLine', price: 8_000, secs: 4, w: 0.5, d: 0.5, h: 2.4, max: 8,
    solids: [[0, 0, 0.18, 0.18, 2.2]],
    light: [0, 2.05, 0.2],
  },
  // A rice-straw stack round a pole (គំនរចំបើង): his cattle's hay, pulled from it a bundle at a time.
  haystack: {
    // (h: its pole's top, standing out of the cap)
    id: 'haystack', name: 'buildHaystack', line: 'buildHaystackLine', price: 10_000, secs: 8, w: 2.4, d: 2.4, h: 3.2, max: 2,
    solids: [[0, 0, 2.2, 2.2, 2.6]],
  },
};

export const PIECE_IDS = Object.keys(PIECES) as PieceId[];

/** One piece he has put up (or is putting up): where, which way, how far along. */
export interface Built {
  /** Unique (`<id>-<n>`), kept with it. */
  readonly uid: string;
  readonly id: PieceId;
  /** Its middle on the ground (world m), the way it faces (rad, `atan2(dx, dz)`: 0 its front looks +z). */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  /** 0‥1 built: 1 it stands (only then is it used: seats, the hammock, the pen). */
  readonly done: number;
  /** Seeded variety (never Math.random). */
  readonly seed: number;
}

/**
 * The built pieces, for whoever needs them (his cattle sleep in a pen; the garden
 * plants nowhere on one). The build add-on keeps it up to date (`version` bumps on
 * every change) and fills `blocks`.
 */
export const BUILT = {
  list: [] as Built[],
  version: 0,
  /** A spot (world x, z) with this much room round it (m) is taken by a built piece or one being built. */
  blocks: (_x: number, _z: number, _r: number): boolean => false,
};

/** A point of a piece's frame in the world (into `out`: x, z). */
export function pieceToWorld(b: Pick<Built, 'x' | 'z' | 'yaw'>, lx: number, lz: number, out: [number, number]): [number, number] {
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  out[0] = b.x + lx * c + lz * s;
  out[1] = b.z - lx * s + lz * c;
  return out;
}

/** What one piece looks like when drawn: its seed, how far it is built (the view hides the blocks past it). */
export interface PieceLook {
  readonly id: PieceId;
  readonly seed: number;
}

/**
 * **The model contract** (build/models/<id>.ts calls `registerPieceModel`):
 * - The frame above; only the map's own block families (`mapBark` wood, bamboo,
 *   thatch's frame; `mapLeaf` thatch and green; `mapStone` stone, the jar's glaze;
 *   `petal` cloth, offerings, flowers, the lamp's glass; `mapRock` / `mapGrass`
 *   earth), so no new shader is compiled.
 * - **Blocks in the order a builder puts them up** (posts first, then the rails or
 *   beams, the floor, the roof's frame, the thatch, the last touches): the view
 *   shows a piece being built by drawing its first blocks only.
 * - Khmer, not Thai (CLAUDE.md): the spirit house a little Angkor tower, never a
 *   Thai gable; palm-leaf thatch; a krama, not a conical hat.
 * - Budget: ≤ 600 blocks (the pen, the shelter), ≤ 250 (the others). Quick to build
 *   (≤ 3 ms): the view calls it once per piece and seed.
 */
export type PieceModel = (b: VoxelBuilder, look: PieceLook) => void;

const MODELS: Partial<Record<PieceId, PieceModel>> = {};

export function registerPieceModel(id: PieceId, m: PieceModel): void {
  MODELS[id] = m;
}

/** Until its model is done: its footprint as a pale wooden box (a post at each corner and a frame). */
const placeholder: PieceModel = (b, l) => {
  const p = PIECES[l.id];
  for (const [x, z, w, d, top] of p.solids) b.box(x, top / 2, z, w, top, d, 0xb08a5a, 'mapBark');
  b.box(0, p.h - 0.05, 0, p.w, 0.1, p.d, 0xd8c08a, 'mapBark');
};

/** Draw a piece into `b` (its own model, or the placeholder). */
export function buildPiece(b: VoxelBuilder, look: PieceLook): void {
  (MODELS[look.id] ?? placeholder)(b, look);
}
