import type { BlockMatKey } from '../blocks/kinds';
import { BLOCK_M, cellMid, cellOf, rawOf, type Block } from '../blocks/store';
import type { MaterialId, Materials } from './materials';

/**
 * Footprint buildings (AWP-20, build plan step 3: Townscaper-style): he draws a
 * rectangle on his land and the building fits itself to it — posts, floor,
 * walls, roof and stair — written into the player's block layer
 * (blocks/store.ts `BLOCKS`). This file makes the plan, with no three.js and
 * no game state (the saved list: build/footState.ts; drawing it, the ghost,
 * the work: roam/_buildFoot*.ts, roam/_build.ts).
 *
 * **A footprint** (`FootRect`): cells of the block grid (0.5 m, store.ts
 * `cellOf`), `i` along x, `k` along z, both ends in, along the map's axes
 * (his land, `PLOT_CORNERS`, and his house's frame are on them). Its **door
 * side** (`FootSide`): 0 the −z side (north), 1 +x (east), 2 +z (south),
 * 3 −x (west): the house's door and stair, the shed's open front, the
 * fence's gate.
 *
 * **The kinds** (`FOOT_KINDS`; sizes in cells, why below):
 * - **Stilt house** (ផ្ទះឈើ): timber posts on laterite footings, the floor
 *   (timber planks) high enough that he walks under it (its underside at least
 *   `CLEAR` 2.5 m over the highest ground under it: to the walk map he is
 *   2.26 m tall, AWP-17), woven bamboo walls in a timber frame (a post at each
 *   corner and every 2 m at most, a wall plate along their tops), the door
 *   2.5 m high and 1.5–2 m wide (3 or 4 cells: he is 0.84 m across to the
 *   walker), windows in every other bay, a steep gable roof of palm-leaf
 *   thatch with a timber ridge and timber gable boards (Khmer: no horns at
 *   the gable's ends or peak, CLAUDE.md "Khmer, not Thai"; the boards in
 *   light and dark rays as the village houses' gables), and a stair from
 *   the door down to the ground (`stairStep`; its lowest tread a stair's
 *   rise or less over the ground) with timber rails along its sides (a
 *   block beside each tread and one over it: he does not step off it).
 * - **Shed** (រោង): on the ground, timber posts and wall plate, woven bamboo
 *   half walls 1 m high on three sides, the door side open, the same roof;
 *   its eaves at least 2.5 m over the ground (he and the follow camera go
 *   under).
 * - **Fence** (របង): the footprint's edge as a fence line (or one straight
 *   run: a footprint one cell wide), chest high to him as the fence piece
 *   (build/models/fence.ts: 1.6 m): a panel 1.5 m high, whole-bamboo rails
 *   along its foot and top and upright split-bamboo slats between them with a
 *   gap after each (a wall to his feet all the same), posts of old whole bamboo every 2 m at most,
 *   half a block over the panel (1.75 m), a gate 1.5–2 m wide in the middle
 *   of the door side (a side shorter than 3.5 m has none).
 *
 * **Sizes** (`min`, `max`, cells a side): a house at least 5 × 5 m (its room
 * inside the walls 4 m: the follow camera reads a room of 4 m or more, AWP-17)
 * and at most 8 × 8 m (its roof is then 4.5 m of stepped thatch over 9 × 9 m,
 * ≈ 1 500 blocks: 15 % of his land's budget, `PLOT_BUDGET`); a shed 3 × 3
 * m to 8 × 8 m (room for him and the camera under its plate; the same roof);
 * a fence 2 m to 24 m a side (his yard is ≈ 22 m across), one cell wide (a
 * straight run) or 2 m or more (an enclosure).
 *
 * **The roof** (`roofRows`): a gable along the footprint's longer side,
 * rows of thatch stepping in one cell and up one cell (45°), each row two
 * cells deep so it sits on the one under it (a row one cell deep meets the
 * next only along an edge: blocks/mesh.ts `diagonalJoints`), eaves one cell
 * past the walls on every side. **Full blocks for now; the one place to smooth
 * the steps is `roofStep`** (AWP-24's blocks/roof.ts `stepBlock`: a stair in
 * each step, a slab on the ridge; put into the plan, so counted and built).
 * The stair's treads are the same: **`stairStep`** gives each tread's block
 * (a slab's 0.25 m rise today, the walk map's stair rise; AWP-24's stair
 * block, two rises a cell, would halve its run).
 *
 * **The plan** (`planFoot`): every block in the order a builder puts them up
 * (`stages`: posts, floor, walls, roof, stair; the view and the work write
 * them in that order), the blocks of each material, what it costs (`cost`,
 * the owner's rule: materials; gathered ones are free, missing ones bought:
 * build/materials.ts; it grows with the footprint: `MAT_RATE` blocks of a
 * material for one of the gathered materials, rounded up), and the land it
 * takes (`parts`: boxes for the placing rules, the eaves and the stair in).
 * The same footprint and ground always make the same plan.
 */

export type FootKind = 'house' | 'shed' | 'fence';
export const FOOT_KIND_IDS: readonly FootKind[] = ['house', 'shed', 'fence'];

/** Cells, both ends in: `i` along x, `k` along z. */
export interface FootRect {
  readonly i0: number;
  readonly k0: number;
  readonly i1: number;
  readonly k1: number;
}

/** The door side: 0 −z (north), 1 +x (east), 2 +z (south), 3 −x (west). */
export type FootSide = 0 | 1 | 2 | 3;

export type FootStage = 'posts' | 'floor' | 'walls' | 'roof' | 'stair';

export interface FootKindSpec {
  readonly id: FootKind;
  /** Its name and a line for the build card (lang.ts keys). */
  readonly name: string;
  readonly line: string;
  /** The shorter side at least, either side at most (cells). A fence's shorter side may also be 1 (a straight run). */
  readonly min: number;
  readonly max: number;
  /** The longer side at least (cells). */
  readonly minLong: number;
  /** The land under it may step this much (m): a house's posts and a fence take a slope, a shed's half walls less. */
  readonly level: number;
  /** At most this many of it on his land. */
  readonly most: number;
  /** A roof (its eaves reach a cell past the footprint: the placing rules count them). */
  readonly roofed: boolean;
}

export const FOOT_KINDS: Record<FootKind, FootKindSpec> = {
  house: { id: 'house', name: 'footHouse', line: 'footHouseLine', min: 10, max: 16, minLong: 10, level: 1.5, most: 3, roofed: true },
  shed: { id: 'shed', name: 'footShed', line: 'footShedLine', min: 6, max: 16, minLong: 6, level: 0.6, most: 4, roofed: true },
  fence: { id: 'fence', name: 'footFence', line: 'footFenceLine', min: 4, max: 48, minLong: 4, level: 99, most: 12, roofed: false },
};

/** A stilt floor's underside is this far over the highest ground under it at least (m: he walks under it). */
export const CLEAR = 2.5;
/** A house's walls: cells over the floor (the door's opening 5 cells, 2.5 m, and the wall plate over it: its lintel). */
const WALL = 6;
/** Posts stand this many cells apart at most (2 m). */
const BAY = 4;
/** A fence's panel and its posts (cells high), the posts' cap a slab over them. */
const FENCE_H = 3;

/**
 * Blocks of a material for one of the gathered materials (rounded up per building): timber posts, planks and
 * boards from logs; woven bamboo from poles; palm-leaf thatch from bundles; laterite footings from clay (both are
 * dug: laterite is the iron-red clay of the land, hardened in the air).
 */
export const MAT_RATE: Partial<Record<BlockMatKey, { m: MaterialId; per: number }>> = {
  timber: { m: 'log', per: 24 },
  bamboo: { m: 'bamboo', per: 10 },
  thatch: { m: 'thatch', per: 20 },
  laterite: { m: 'clay', per: 4 },
};

/** Colours (sRGB): the map's own build pieces' (build/models/_yardKit.ts) and the block layer's materials. */
const COL = {
  post: [0x5a4636, 0x4e3d30, 0x55432f],
  beam: [0x7a5a3a, 0x846446],
  plank: [0x8a6a48, 0x9a7a54, 0x846446],
  board: [0x6e4a30, 0x76503a],
  rays: [0xa8865a],
  ridge: [0x4e3a2a],
  wall: [0xc8b27a, 0xbba36c, 0xd4bf88],
  weave: [0xcdc47e, 0xc1b970, 0xd6cc8c],
  rail: [0x9a8458, 0xa48c5e],
  pole: [0x8e7a4e, 0x937c50, 0x86724a],
  thatch: [0xae9a6e, 0xa6936a, 0xb4a276, 0x9e8f6c],
  footing: [0xa8583a, 0x9a5034],
  tread: [0x7a5a3a, 0x8a6a48],
} as const;

/** A box of cells on the land (both ends in), what it takes for the placing rules: its top over the ground (m). */
export interface FootPart {
  readonly i0: number;
  readonly k0: number;
  readonly i1: number;
  readonly k1: number;
  readonly h: number;
  /** The land under it may step this much (m). */
  readonly level: number;
}

export interface FootPlan {
  readonly kind: FootKind;
  readonly rect: FootRect;
  readonly door: FootSide;
  /** Blocks in the order put up. */
  readonly n: number;
  /** Per block: its cell (i, j, k). */
  readonly cells: Int32Array;
  /** Per block: the block as one number (store.ts `rawOf`). */
  readonly raws: Float64Array;
  /** Where each stage begins (an index into the blocks), in order. */
  readonly stages: readonly { readonly stage: FootStage; readonly from: number }[];
  /** Blocks of each material. */
  readonly mats: Partial<Record<BlockMatKey, number>>;
  /** What it costs (build/materials.ts). */
  readonly cost: Materials;
  /** The land it takes (the footprint, the eaves, the stair; a fence its lines). */
  readonly parts: readonly FootPart[];
  /** Its lowest block's bottom and its highest block's top (m). */
  readonly bottom: number;
  readonly top: number;
  /** The house's floor top (m), or NaN. */
  readonly floor: number;
  /** Cells round all its blocks (both ends in). */
  readonly box: FootRect;
}

/** Sizes of a footprint (cells): across x, deep along z. */
export const rectW = (r: FootRect): number => r.i1 - r.i0 + 1;
export const rectD = (r: FootRect): number => r.k1 - r.k0 + 1;

/** A rectangle from two corner cells (any order). */
export function rectOf(ia: number, ka: number, ib: number, kb: number): FootRect {
  return { i0: Math.min(ia, ib), k0: Math.min(ka, kb), i1: Math.max(ia, ib), k1: Math.max(ka, kb) };
}

/** Why a footprint's size will not do for its kind ('small'), or null. Too big is clamped while drawn (`clampCorner`). */
export function sizeFault(kind: FootKind, r: FootRect): 'small' | 'big' | null {
  const s = FOOT_KINDS[kind];
  const a = Math.min(rectW(r), rectD(r));
  const b = Math.max(rectW(r), rectD(r));
  if (b > s.max) return 'big';
  if (b < s.minLong) return 'small';
  if (kind === 'fence' && a === 1) return null;
  return a < s.min ? 'small' : null;
}

/** The far corner `(i, k)` drawn from the corner `(ia, ka)` brought within the kind's largest size. */
export function clampCorner(kind: FootKind, ia: number, ka: number, i: number, k: number): [number, number] {
  const m = FOOT_KINDS[kind].max - 1;
  return [ia + Math.max(-m, Math.min(m, i - ia)), ka + Math.max(-m, Math.min(m, k - ka))];
}

/** The way out of the footprint through a side (cells): x and z steps. */
const OUT: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** A door's (a gate's) width in a wall `len` cells long: 4 cells (2 m) on an even wall, 3 (1.5 m) on an odd one, centred. */
const doorWidth = (len: number): number => (len % 2 ? 3 : 4);

/** A seeded number 0‥1 for a cell (the same block, the same tone, every time). */
function hash(i: number, j: number, k: number, salt: number): number {
  let h = (Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ Math.imul(k, 83492791) ^ Math.imul(salt, 2654435761)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const pick = (list: readonly number[], i: number, j: number, k: number, salt: number): number => list[Math.floor(hash(i, j, k, salt) * list.length)];

/** Posts along a side from `a` to `b` (cells, both in), at most `BAY` apart, evenly; `must` cells are posts too (a door's jambs). */
function postsAlong(a: number, b: number, must: readonly number[] = []): number[] {
  const fixed = [...new Set([a, b, ...must])].sort((x, y) => x - y);
  const out: number[] = [];
  for (let n = 0; n < fixed.length; n++) {
    out.push(fixed[n]);
    if (n + 1 >= fixed.length) break;
    const span = fixed[n + 1] - fixed[n];
    const parts = Math.ceil(span / BAY);
    for (let p = 1; p < parts; p++) out.push(fixed[n] + Math.round((span * p) / parts));
  }
  return [...new Set(out)].sort((x, y) => x - y);
}

/**
 * The block over a roof cell that smooths its step (THE place for the roof's step shape, AWP-24), or null (none:
 * the roof stays in stepped full blocks, as today). `roof(i, j, k)`: is that cell one of the roof's (its rows of full
 * blocks, the ridge); `under` the roof cell's block. Called for every roof cell with nothing over it in the plan; what
 * it returns goes into the plan over it (so it is built, counted in the cost and the budget, and taken down with
 * the roof). With AWP-24 merged this is one line: `return stepBlock(roof, i, j, k, under);` (blocks/roof.ts: a
 * stair climbing to the next row up, a slab on the ridge).
 */
export function roofStep(_roof: (i: number, j: number, k: number) => boolean, _i: number, _j: number, _k: number, _under: Block): Block | null {
  return null;
}

/**
 * A stair tread whose top is `q` quarter metres up (THE place for the stair's step shape, AWP-24): a slab in the
 * lower half of its cell for an odd `q` (0.25 m a rise: he walks up it, blocks/walk.ts `BLOCK_STEP_M`), a full block
 * for an even one. Returns its cell's height (j) and the block. With AWP-24's stair block (two rises in a cell) a
 * tread every half cell: the stair's run halves.
 */
export function stairStep(q: number, color: number): { j: number; block: Block } {
  return q % 2 ? { j: (q - 1) / 2, block: { mat: 'timber', color, shape: 'slab' } } : { j: q / 2 - 1, block: { mat: 'timber', color } };
}

/** Make the plan of a footprint building (see above). `ground(x, z)`: the land's height (m). */
export function planFoot(kind: FootKind, rect: FootRect, door: FootSide, ground: (x: number, z: number) => number): FootPlan {
  const cells: number[] = [];
  const raws: number[] = [];
  const at = new Map<number, number>();
  const stages: { stage: FootStage; from: number }[] = [];
  const mats: Partial<Record<BlockMatKey, number>> = {};
  let jLo = Infinity;
  let jHi = -Infinity;
  let bi0 = rect.i0;
  let bk0 = rect.k0;
  let bi1 = rect.i1;
  let bk1 = rect.k1;
  const key = (i: number, j: number, k: number) => ((i + 8192) * 16384 + (k + 8192)) * 2048 + (j + 1024);
  /** Put a block in a cell, unless one is there already (the first wins: a post through the floor and the wall). */
  const put = (i: number, j: number, k: number, b: Block): void => {
    const kk = key(i, j, k);
    if (at.has(kk)) return;
    at.set(kk, raws.length);
    cells.push(i, j, k);
    raws.push(rawOf(b));
    mats[b.mat] = (mats[b.mat] ?? 0) + 1;
    jLo = Math.min(jLo, j);
    jHi = Math.max(jHi, j);
    bi0 = Math.min(bi0, i);
    bi1 = Math.max(bi1, i);
    bk0 = Math.min(bk0, k);
    bk1 = Math.max(bk1, k);
  };
  const stage = (s: FootStage) => stages.push({ stage: s, from: raws.length });
  const groundOf = (i: number, k: number) => ground(cellMid(i), cellMid(k));
  /** The cell the ground's surface is in. */
  const jg = (i: number, k: number) => cellOf(groundOf(i, k));
  const { i0, k0, i1, k1 } = rect;
  let gMax = -Infinity;
  for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) gMax = Math.max(gMax, groundOf(i, k));
  const parts: FootPart[] = [];
  let floor = NaN;

  // The perimeter, side by side (each side's cells from one corner to the next), and the door side's cells.
  const sideCells = (s: FootSide): [number, number][] => {
    const out: [number, number][] = [];
    if (s === 0) for (let i = i0; i <= i1; i++) out.push([i, k0]);
    else if (s === 2) for (let i = i0; i <= i1; i++) out.push([i, k1]);
    else if (s === 1) for (let k = k0; k <= k1; k++) out.push([i1, k]);
    else for (let k = k0; k <= k1; k++) out.push([i0, k]);
    return out;
  };
  /** Along-side coordinate of a side's cell (i for the −z / +z sides, k for the others). */
  const along = (s: FootSide, c: readonly [number, number]) => (s % 2 ? c[1] : c[0]);
  /** The door's (gate's) cells along side `s` (the along-side coordinates), or none. */
  const doorSpan = (s: FootSide): [number, number] | null => {
    const len = s % 2 ? k1 - k0 + 1 : i1 - i0 + 1;
    const w = doorWidth(len);
    if (len < w + 4) return null;
    const a0 = (s % 2 ? k0 : i0) + Math.floor((len - w) / 2);
    return [a0, a0 + w - 1];
  };
  /** Posts round the perimeter: the corners, the door's jambs, every `BAY` at most between. Keys `i,k`. */
  const perimeterPosts = (gate: FootSide | null): Set<string> => {
    const posts = new Set<string>();
    for (const s of [0, 1, 2, 3] as FootSide[]) {
      const span = s === gate ? doorSpan(s) : null;
      const lo = s % 2 ? k0 : i0;
      const hi = s % 2 ? k1 : i1;
      const list = postsAlong(lo, hi, span ? [span[0] - 1, span[1] + 1] : []);
      for (const a of list) {
        if (span && a >= span[0] && a <= span[1]) continue;
        const [i, k] = s === 0 ? [a, k0] : s === 2 ? [a, k1] : s === 1 ? [i1, a] : [i0, a];
        posts.add(`${i},${k}`);
      }
    }
    return posts;
  };
  const isPost = (posts: Set<string>, i: number, k: number) => posts.has(`${i},${k}`);

  if (kind === 'fence') {
    const line = rectW(rect) === 1 || rectD(rect) === 1;
    const sides: FootSide[] = line ? [rectW(rect) === 1 ? 1 : 0] : [0, 1, 2, 3];
    const gate = line ? null : door;
    const posts = line ? new Set<string>() : perimeterPosts(gate);
    if (line) {
      const s = sides[0];
      const list = postsAlong(s % 2 ? k0 : i0, s % 2 ? k1 : i1);
      for (const a of list) posts.add(s % 2 ? `${i0},${a}` : `${a},${k0}`);
    }
    const span = gate !== null ? doorSpan(gate) : null;
    const inGate = (s: FootSide, c: readonly [number, number]) => s === gate && !!span && along(s, c) >= span[0] && along(s, c) <= span[1];
    stage('posts');
    for (const s of sides)
      for (const c of sideCells(s)) {
        if (!isPost(posts, c[0], c[1])) continue;
        const g = jg(c[0], c[1]);
        // (whole old bamboo, as the fence piece's posts)
        const color = pick(COL.pole, c[0], 0, c[1], 1);
        for (let j = g; j < g + FENCE_H; j++) put(c[0], j, c[1], { mat: 'bamboo', color });
        put(c[0], g + FENCE_H, c[1], { mat: 'bamboo', color, shape: 'slab' });
      }
    stage('walls');
    for (const s of sides)
      for (const c of sideCells(s)) {
        if (isPost(posts, c[0], c[1]) || inGate(s, c)) continue;
        const g = jg(c[0], c[1]);
        for (let j = g; j < g + FENCE_H; j++) {
          // (whole-bamboo rails along its foot and top; between them upright split-bamboo slats with gaps, every other
          // cell: it reads as a fence, not a wall; still a wall to his feet, the gaps half a metre high)
          const rail = j === g || j === g + FENCE_H - 1;
          if (!rail && (c[0] + c[1]) % 2) continue;
          const color = rail ? pick(COL.rail, c[0], j, c[1], 2) : pick(COL.weave, c[0], j, c[1], 3);
          put(c[0], j, c[1], { mat: 'bamboo', color });
        }
      }
    // (its lines, each a part: an enclosure's inside stays his to use)
    for (const s of sides) {
      const sc = sideCells(s);
      const a = sc[0];
      const b = sc[sc.length - 1];
      parts.push({ i0: Math.min(a[0], b[0]), k0: Math.min(a[1], b[1]), i1: Math.max(a[0], b[0]), k1: Math.max(a[1], b[1]), h: (FENCE_H + 0.5) * BLOCK_M, level: FOOT_KINDS.fence.level });
    }
  } else {
    // ── A house or a shed: posts, (the floor), walls, roof (, the stair) ──
    const house = kind === 'house';
    const jF = house ? Math.ceil((gMax + CLEAR) / BLOCK_M - 1e-6) : -Infinity;
    // (the wall plate: a house's over its walls; a shed's so that its underside is 2.5 m over the highest ground)
    const jP = house ? jF + WALL : cellOf(gMax) + WALL;
    if (house) floor = (jF + 1) * BLOCK_M;
    // (a shed's door side is all open: no jambs)
    const posts = perimeterPosts(house ? door : null);
    const span = doorSpan(door);
    const inDoor = (s: FootSide, c: readonly [number, number]) => s === door && !!span && along(s, c) >= span[0] && along(s, c) <= span[1];

    stage('posts');
    // (under a house's floor, posts on the grid of the side across from the door and the sides' own: none in the room)
    const under = new Set<string>();
    if (house) {
      const xs = postsAlong(i0, i1);
      const zs = postsAlong(k0, k1);
      for (const i of xs) for (const k of zs) if (i > i0 && i < i1 && k > k0 && k < k1) under.add(`${i},${k}`);
    }
    for (const p of [...posts, ...under]) {
      const [i, k] = p.split(',').map(Number);
      const g = jg(i, k);
      const color = pick(COL.post, i, 0, k, 1);
      put(i, g, k, { mat: 'laterite', color: pick(COL.footing, i, g, k, 5) });
      const top = under.has(p) ? jF - 1 : jP - 1;
      for (let j = g + 1; j <= top; j++) put(i, j, k, { mat: 'timber', color });
    }

    if (house) {
      stage('floor');
      for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) put(i, jF, k, { mat: 'timber', color: pick(COL.plank, i, jF, k, 6) });
    }

    stage('walls');
    const wallLo = (i: number, k: number) => (house ? jF + 1 : jg(i, k));
    const wallHi = (i: number, k: number) => (house ? jP - 1 : jg(i, k) + 1);
    for (const s of [0, 1, 2, 3] as FootSide[]) {
      if (!house && s === door) continue;
      const sc = sideCells(s);
      // (the bays between posts, in order along the side: windows in every other one; none on the door's)
      const postIdx = sc.map((c, n) => (isPost(posts, c[0], c[1]) ? n : -1)).filter((n) => n >= 0);
      for (let b = 0; b + 1 < postIdx.length; b++) {
        const from = postIdx[b] + 1;
        const to = postIdx[b + 1] - 1;
        const wide = to - from + 1;
        const doorBay = sc.slice(from, to + 1).some((c) => inDoor(s, c));
        const win = house && !doorBay && b % 2 === 1 && wide >= 2;
        const w0 = from + Math.floor((wide - 2) / 2);
        for (let n = from; n <= to; n++) {
          const [i, k] = sc[n];
          if (inDoor(s, sc[n])) continue;
          for (let j = wallLo(i, k); j <= wallHi(i, k); j++) {
            // (a window: two cells wide, 1‥2 m over the floor)
            if (win && n >= w0 && n <= w0 + 1 && j >= jF + 3 && j <= jF + 4) continue;
            const color = (along(s, sc[n]) + j) % 2 ? pick(COL.weave, i, j, k, 3) : pick(COL.wall, i, j, k, 4);
            put(i, j, k, { mat: 'bamboo', color });
          }
        }
      }
    }
    // The wall plate (a house's lintel over its door): timber round the top.
    for (const s of [0, 1, 2, 3] as FootSide[]) for (const [i, k] of sideCells(s)) put(i, jP, k, { mat: 'timber', color: pick(COL.beam, i, jP, k, 7) });

    stage('roof');
    roofRows(rect, jP + 1, house ? 'timber' : 'bamboo', put);

    let stair: FootPart | null = null;
    if (house && span) {
      stage('stair');
      // From the door's threshold (the floor's top) down and out, a tread a cell, 0.25 m lower each, until the ground.
      const [ox, oz] = OUT[door];
      // (the cell `n` out from the door's wall, at `a` along it)
      const stairCell = (a: number, n: number): [number, number] => (door % 2 ? [(door === 1 ? i1 : i0) + ox * n, a] : [a, (door === 0 ? k0 : k1) + oz * n]);
      const q0 = Math.round(floor / 0.25);
      let n = 1;
      for (; n <= 24; n++) {
        const q = q0 - n;
        let g = -Infinity;
        for (let a = span[0]; a <= span[1]; a++) g = Math.max(g, groundOf(...stairCell(a, n)));
        // (down to the ground: the lowest tread a stair's rise or less over it, so he steps up onto it from there)
        if (q * 0.25 <= g + 0.05) break;
        const color = pick(COL.post, n, q, door, 11);
        for (let a = span[0] - 1; a <= span[1] + 1; a++) {
          const [i, k] = stairCell(a, n);
          const { j, block } = stairStep(q, pick(COL.tread, a, q, n, 8));
          // (its sides: a timber rail beside each tread and one over it, so he does not step off the stair)
          if (a < span[0] || a > span[1]) {
            put(i, j, k, { mat: 'timber', color });
            put(i, j + 1, k, { mat: 'timber', color });
          } else put(i, j, k, block);
        }
      }
      const run = n - 1;
      if (run > 0) {
        const lo = door % 2 ? (door === 1 ? i1 + 1 : i0 - run) : span[0] - 1;
        const hi = door % 2 ? (door === 1 ? i1 + run : i0 - 1) : span[1] + 1;
        const klo = door % 2 ? span[0] - 1 : door === 0 ? k0 - run : k1 + 1;
        const khi = door % 2 ? span[1] + 1 : door === 0 ? k0 - 1 : k1 + run;
        stair = { i0: lo, k0: klo, i1: hi, k1: khi, h: floor - gMax + 0.5, level: 1.5 };
      }
    }
    // (the land it takes: the footprint and its eaves, its top over the ground; the stair)
    parts.push({ i0: i0 - 1, k0: k0 - 1, i1: i1 + 1, k1: k1 + 1, h: (jHi + 1) * BLOCK_M - gMax, level: FOOT_KINDS[kind].level });
    if (stair) parts.push(stair);
  }

  const cost: Materials = {};
  for (const [mat, n] of Object.entries(mats) as [BlockMatKey, number][]) {
    const r = MAT_RATE[mat];
    if (r && n > 0) cost[r.m] = (cost[r.m] ?? 0) + Math.ceil(n / r.per);
  }
  return {
    kind,
    rect,
    door,
    n: raws.length,
    cells: Int32Array.from(cells),
    raws: Float64Array.from(raws),
    stages,
    mats,
    cost,
    parts,
    bottom: jLo * BLOCK_M,
    top: (jHi + 1) * BLOCK_M,
    floor,
    box: { i0: bi0, k0: bk0, i1: bi1, k1: bk1 },
  };
}

/**
 * The gable roof over a rectangle (see above): its eaves at height cell `j0`, a cell past the walls on every side,
 * along the longer side (a square one: along x), rows of thatch two cells deep stepping in and up, the gable ends
 * closed with boards under them (`gable`: their material), a timber ridge on top.
 */
function roofRows(r: FootRect, j0: number, gable: BlockMatKey, put: (i: number, j: number, k: number, b: Block) => void): void {
  const alongX = rectW(r) >= rectD(r);
  const lo = (alongX ? r.k0 : r.i0) - 1;
  const hi = (alongX ? r.k1 : r.i1) + 1;
  const a0 = (alongX ? r.i0 : r.k0) - 1;
  const a1 = (alongX ? r.i1 : r.k1) + 1;
  const g0 = a0 + 1;
  const g1 = a1 - 1;
  const cell = (a: number, c: number, j: number, b: Block) => (alongX ? put(a, j, c, b) : put(c, j, a, b));
  // (the roof's own cells, its rows and ridge: the steps over them are smoothed after, `roofStep`)
  const roof = new Map<string, Block>();
  const roofCell = (a: number, c: number, j: number, b: Block) => {
    roof.set(alongX ? `${a},${j},${c}` : `${c},${j},${a}`, b);
    cell(a, c, j, b);
  };
  for (let row = 0; ; row++) {
    const j = j0 + row;
    const L = lo + row;
    const H = hi - row;
    const top = L + 1 >= H - 1;
    // (the gables under this row: boards between its inner edges, over the end walls; a house's in the rays of the
    // village houses' gables, light and dark boards fanning out from the middle of its foot)
    for (const a of [g0, g1])
      for (let c = L + 2; c <= H - 2; c++) {
        const ray = Math.floor(Math.atan2(row + 0.5, c - (lo + hi) / 2) / (Math.PI / 9)) % 2;
        const b: Block = { mat: gable, color: gable === 'timber' ? (ray ? COL.rays[0] : pick(COL.board, a, j, c, 9)) : pick(COL.wall, a, j, c, 4) };
        cell(a, c, j, b);
      }
    for (let a = a0; a <= a1; a++) {
      if (top) {
        // The ridge: timber over the last row's inner cells.
        for (let c = L; c <= H; c++) roofCell(a, c, j, { mat: 'timber', color: COL.ridge[0] });
        continue;
      }
      for (const c of [L, L + 1, H - 1, H]) roofCell(a, c, j, { mat: 'thatch', color: pick(COL.thatch, a, j, c, 10) });
    }
    if (top) break;
  }
  // The steps smoothed (AWP-24), over every roof cell with nothing over it (`put` keeps a cell's first block).
  const isRoof = (i: number, j: number, k: number) => roof.has(`${i},${j},${k}`);
  for (const [at, under] of roof) {
    const [i, j, k] = at.split(',').map(Number);
    if (isRoof(i, j + 1, k)) continue;
    const b = roofStep(isRoof, i, j, k, under);
    if (b) put(i, j + 1, k, b);
  }
}
