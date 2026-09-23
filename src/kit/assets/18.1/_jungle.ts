import { hash3 } from '../../../voxel/random';
import type { VoxelBox, VoxelGrid } from '../../../voxel/VoxelBuilder';
import { BlockSet, masonry } from '../../BlockSet';
import { commitGrass, grassTuft, type GrassTones } from '../../lib/grass';
import { fromSheet, SOIL } from '../../palette';
import { placePiece } from '../../place';
import { PieceBuilder } from '../../PieceBuilder';
import { rng, snap, TEXEL, tone, type Rng } from '../../shapes';
import { barkSurf, soilSurf, stoneSurf } from '../../surface';
import type { KitCollider, KitPiece } from '../../types';
import { broadleafTree } from './_broadleaf';
import { buildPalm, type PalmKind } from './_palm';
import bush from './bush';

/**
 * §18.1 ⑥ Dense jungle cluster — a 16 × 16 m patch of Angkor jungle as the
 * sheet draws it: a few tall trunks of different heights under a canopy of
 * distinct crowns (the "cluster layout" top view), vines hanging from them,
 * an understorey of shrubs, ferns and grass, and mossy sandstone blocks
 * fallen among the roots, on a patch of mossy ground.
 *
 * The trees are the kit's broadleaf trees (the medium / small tree builder)
 * drawn tall, their crowns high on long trunks the way trees grow when they
 * compete for light, each tinted its own green; the palm and the bush are the
 * §18.1 ④ / ⑤ assets. Layouts are plans placed by hand after the sheet (seed
 * 1), jittered, mirrored and re-sized by the seed; `plantJungle` also plants
 * the dioramas' own plans.
 */
export type JungleKind = 'dense' | 'ruins' | 'edge';

export interface JungleOptions {
  kind: JungleKind;
  seed: number;
  /** The tallest tree (m); the rest scale with it. Default 19 m (17–21 m by seed). */
  height?: number;
}

/** Height of the tallest tree of the seed-1 cluster (m): the plans' shares are of this. */
export const JUNGLE_H = 19;

/** A tree of a plan: where its trunk stands, its height as a share of the tallest, its shape (see BroadleafOptions). */
export interface TreeSpot {
  x: number;
  z: number;
  h: number;
  /** Canopy width over height. */
  w: number;
  base: number;
  /** Trunk thickness (m) at the plan's height. */
  trunk: number;
  clumps: number;
  roots: number;
  reach: number;
  vines: number;
  stones: number;
  /** Voxel size (m): half a metre for the tall trees, a little finer for the small ones. */
  cell: number;
  /** Its greens (see TINTS): the sheet's crowns each have their own. */
  tint: Tint;
}

export interface PalmSpot {
  x: number;
  z: number;
  h: number;
  kind: PalmKind;
}

/** An understorey shrub (a broadleaf crown on the ground, no trunk showing). */
export interface ShrubSpot {
  x: number;
  z: number;
  h: number;
  w: number;
}

/** A §18.1 ⑤ bush. */
export interface BushSpot {
  x: number;
  z: number;
  h: number;
  variant: 'bush' | 'shrub';
  turn: number;
}

/** [x0, y0, z0, x1, y1, z1] (metres). */
export type Box6 = readonly [number, number, number, number, number, number];

/** A heap of fallen blocks around (x, z). */
export interface HeapSpot {
  x: number;
  z: number;
  blocks: readonly Box6[];
}

/**
 * The broken wall of the ruins variant: along x at z, stepping down from
 * `tall` at x0 to `low` at x1, with a doorway centred at `door` (all on the
 * stones' 1/8 m carve grid, z ± 0.5 included).
 */
export interface WallSpot {
  x0: number;
  x1: number;
  z: number;
  tall: number;
  low: number;
  door: number;
}

/** A layout: what stands where on a w × d patch (seed 1; front = +z). */
export interface JunglePlan {
  /** Size of the patch (m), centred on the origin: the floor plants cover it. */
  w: number;
  d: number;
  trees: TreeSpot[];
  palms: PalmSpot[];
  shrubs: ShrubSpot[];
  bushes: BushSpot[];
  heaps: HeapSpot[];
  wall?: WallSpot;
  /** How many ferns and grass tufts the floor gets… */
  ferns: number;
  tufts: number;
  /** …thicker towards the patch's edges (1, default) or spread evenly (0). */
  edges?: number;
}

// ── Heaps: the sheet's fallen blocks, drawn big beside the trees (blocks 0.5–0.625 m high, 0.75–1.25 m long) ──
/** Three blocks side by side, one fallen across their tops: the sheet's front-left group. */
export const ROW: Box6[] = [
  [-1.75, 0, -0.3125, -0.625, 0.5, 0.3125],
  [-0.625, 0, -0.375, 0.375, 0.625, 0.3125],
  [0.375, 0, -0.3125, 1.5, 0.5, 0.375],
  [-1.25, 0.5, -0.25, 0.0, 1.0, 0.3125],
];
/** Two blocks and one on top, a little back: the group in front of the middle tree. */
export const STACK: Box6[] = [
  [-1.0, 0, -0.3125, 0.125, 0.625, 0.3125],
  [0.125, 0, -0.25, 1.0, 0.5, 0.375],
  [-0.625, 0.625, -0.375, 0.5, 1.125, 0.1875],
];
/** A stack of two on a wider base: the right-hand group. */
export const PILLAR: Box6[] = [
  [-0.625, 0, -0.4375, 0.625, 0.625, 0.4375],
  [-0.4375, 0.625, -0.3125, 0.4375, 1.125, 0.3125],
  [0.625, 0, -0.125, 1.125, 0.4375, 0.375],
];
/** One block on its own. */
export const SINGLE: Box6[] = [[-0.5625, 0, -0.3125, 0.5625, 0.5, 0.3125]];
/** A fallen lintel. */
export const LINTEL: Box6[] = [[-0.875, 0, -0.3125, 0.875, 0.5, 0.3125]];

// ── Plans (seed 1; front = +z) ────────────────────────────────────────────────
const DENSE: JunglePlan = {
  w: 16,
  d: 16,
  trees: [
    // The tallest at the back right: a long trunk, vines down it, its crown over the rest.
    { x: 4.6, z: -4.5, h: 1, w: 0.5, base: 0.6, trunk: 1.4, clumps: 14, roots: 4, reach: 1.6, vines: 8, stones: 0, cell: 0.5, tint: 'deep' },
    // Tall at the back left.
    { x: -4.5, z: -4.7, h: 0.88, w: 0.52, base: 0.56, trunk: 1.3, clumps: 13, roots: 4, reach: 1.5, vines: 6, stones: 0, cell: 0.5, tint: 'olive' },
    // The big one in the middle: the thickest trunk, its roots over a few stones.
    { x: -0.5, z: 1.2, h: 0.76, w: 0.62, base: 0.5, trunk: 1.8, clumps: 15, roots: 5, reach: 2.1, vines: 7, stones: 2, cell: 0.5, tint: 'sun' },
    // Front left, vines down its trunk.
    { x: -5.7, z: 4.8, h: 0.6, w: 0.62, base: 0.46, trunk: 1.2, clumps: 12, roots: 4, reach: 1.4, vines: 6, stones: 0, cell: 0.4375, tint: 'bright' },
    // Front right: the low crown.
    { x: 5.4, z: 4.8, h: 0.5, w: 0.68, base: 0.44, trunk: 1.1, clumps: 11, roots: 4, reach: 1.3, vines: 4, stones: 0, cell: 0.4375, tint: 'teal' },
    // Young trees filling the back between the trunks: the dark behind them.
    { x: 0.3, z: -6.4, h: 0.4, w: 0.66, base: 0.26, trunk: 0.6, clumps: 9, roots: 3, reach: 0.9, vines: 1, stones: 0, cell: 0.375, tint: 'deep' },
    { x: -6.6, z: -6.4, h: 0.34, w: 0.7, base: 0.22, trunk: 0.5, clumps: 8, roots: 3, reach: 0.8, vines: 0, stones: 0, cell: 0.4375, tint: 'teal' },
  ],
  // A sugar palm at the left, its ball of fans above the lower crowns.
  palms: [{ x: -7.0, z: -0.4, h: 0.8, kind: 'sugar' }],
  shrubs: [
    // Undergrowth along the front between the trunks, two more under the back crowns.
    { x: -2.0, z: 5.0, h: 3.0, w: 3.8 },
    { x: 2.6, z: 6.2, h: 2.0, w: 2.6 },
    { x: -7.0, z: 6.2, h: 1.8, w: 2.4 },
    { x: 3.9, z: -0.9, h: 2.4, w: 3.0 },
    { x: -2.8, z: -2.0, h: 2.2, w: 2.8 },
    { x: 6.2, z: 6.8, h: 1.5, w: 2.4 },
  ],
  bushes: [],
  heaps: [
    { x: -3.4, z: 6.6, blocks: ROW },
    { x: 0.6, z: 7.0, blocks: STACK },
    { x: 6.8, z: 2.7, blocks: PILLAR },
    { x: 3.9, z: 7.1, blocks: SINGLE },
    { x: -1.2, z: 7.5, blocks: SINGLE },
  ],
  ferns: 14,
  tufts: 24,
};

/** Dense, with a broken wall stub standing among the trees and its blocks fallen in front. */
const RUINS: JunglePlan = {
  ...DENSE,
  shrubs: [DENSE.shrubs[2], DENSE.shrubs[3], DENSE.shrubs[4], DENSE.shrubs[5], { x: 3.2, z: 6.8, h: 1.6, w: 2.2 }],
  heaps: [
    { x: 2.9, z: 5.2, blocks: ROW },
    { x: 6.8, z: 2.7, blocks: PILLAR },
    { x: -0.6, z: 6.3, blocks: LINTEL },
    { x: -3.9, z: 6.6, blocks: SINGLE },
  ],
  wall: { x0: -4.5, x1: 2.0, z: 3.375, tall: 4.0, low: 0.5, door: -2.125 },
  ferns: 12,
  tufts: 18,
};

/** The edge of the jungle: one row of trees, a palm, shrubs and ferns along the front — a strip to line a path. */
const EDGE: JunglePlan = {
  w: 16,
  d: 7,
  trees: [
    { x: -4.6, z: -1.3, h: 1, w: 0.56, base: 0.56, trunk: 1.4, clumps: 13, roots: 4, reach: 1.6, vines: 7, stones: 0, cell: 0.5, tint: 'olive' },
    { x: 2.4, z: -1.6, h: 0.66, w: 0.64, base: 0.48, trunk: 1.2, clumps: 12, roots: 4, reach: 1.4, vines: 5, stones: 1, cell: 0.4375, tint: 'sun' },
    { x: 6.4, z: 0.9, h: 0.42, w: 0.72, base: 0.42, trunk: 0.9, clumps: 10, roots: 4, reach: 1.1, vines: 2, stones: 0, cell: 0.375, tint: 'teal' },
  ],
  palms: [{ x: -0.9, z: -2.1, h: 0.78, kind: 'feather' }],
  shrubs: [
    { x: -1.2, z: 1.9, h: 2.4, w: 2.8 },
    { x: -7.0, z: 1.8, h: 2.0, w: 2.4 },
    { x: 3.4, z: 2.1, h: 1.8, w: 2.2 },
  ],
  bushes: [{ x: -3.9, z: 1.9, h: 1.4, variant: 'bush', turn: 0 }],
  heaps: [{ x: 1.3, z: 2.4, blocks: STACK }],
  ferns: 9,
  tufts: 16,
};

const PLANS: Record<JungleKind, JunglePlan> = { dense: DENSE, ruins: RUINS, edge: EDGE };

// ── Colours (sampled off the sheet's card, see fromSheet) ─────────────────────
/** Fallen blocks: the card's pale tan lit faces, moss capping their tops (the sides stay stone, so each block reads). */
const BLOCK = [0xd2aa78, 0xc6a27a, 0xceae88, 0xbe9870].map(fromSheet);
const BLOCK_SURF = stoneSurf({ moss: 0.4, lichen: 0.12, stain: 0.22 });
/** The wall stub: the same stone, darker and mossier low down. */
const WALL = [0xb89a78, 0xa98c6c, 0xc0a07c, 0x9c8266].map(fromSheet);
const WALL_SURF = stoneSurf({ moss: 0.45, lichen: 0.15, stain: 0.4, crack: 0.1 });
/** Ferns: dark near the crown, yellow-green towards the tips. */
const FERN = {
  rib: [0x3f6a35, 0x46703a].map(fromSheet),
  deep: [0x2d5031, 0x335733].map(fromSheet),
  mid: [0x4d7a36, 0x578238, 0x497334].map(fromSheet),
  tip: [0x7e9e3b, 0x8aa840, 0x76963a].map(fromSheet),
};
/** Grass of the jungle floor: deep blue-green at the root, lime tips like the card's tufts. */
const FLOOR_GRASS: GrassTones = { base: [0x28463a, 0x2e4d3c], mid: [0x4a7236, 0x537a38], tip: [0x8aa83a, 0x96b03e] };

/**
 * Leaf tints (sRGB channel gains) over the broadleaf greens: the sheet's
 * crowns each have their own — sunlit yellow-green, olive, deep and teal —
 * which is what keeps a dozen of them distinct in the top view.
 */
export type Tint = 'sun' | 'bright' | 'olive' | 'deep' | 'teal' | 'shade';
const TINTS: Record<Tint, readonly [number, number, number]> = {
  sun: [1.08, 1.05, 0.84],
  bright: [1.0, 1.04, 0.92],
  olive: [1.04, 0.97, 0.78],
  deep: [0.8, 0.88, 0.9],
  teal: [0.84, 0.96, 1.06],
  /** Background trees in a diorama, deep in the forest's shade. */
  shade: [0.6, 0.7, 0.74],
};
/** The tints the seed deals out (the lit ones). */
const TINT_IDS: Tint[] = ['sun', 'bright', 'olive', 'deep', 'teal'];

/** Bark at the foot of a trunk: damp and mossy under the canopy. */
const FOOT_SURF = barkSurf({ moss: 0.55, lichen: 0.1, stain: 0.3 });

/**
 * Recolour a tree built since box `first`: its leaves tinted, its bark a
 * shade darker (the sheet's jungle trunks are deep red-brown in the canopy's
 * shade) and darker still and mossy towards the ground, so the root flare
 * reads as the trunk's foot rather than a heap of pale blocks.
 */
function recolor(p: PieceBuilder, first: number, tint: Tint): void {
  const [kr, kg, kb] = TINTS[tint];
  const ch = (c: number, s: number, k: number) => Math.min(255, Math.round(((c >> s) & 255) * k)) << s;
  const scale = (c: number, r: number, g: number, b: number) => ch(c, 16, r) | ch(c, 8, g) | ch(c, 0, b);
  for (let n = first; n < p.voxels.boxes.length; n++) {
    const b = p.voxels.boxes[n];
    if (b.mat === 'leaves') b.color = scale(b.color, kr, kg, kb);
    else if (b.mat === 'trunk') {
      const k = 0.74 + 0.14 * Math.min(1, b.y / 3);
      b.color = scale(b.color, k * 1.02, k * 0.97, k * 0.94);
      if (b.y < 1.5) b.surf = FOOT_SURF;
    }
  }
}

/** Undergrowth cell: two texels, chunky enough to read next to the trees. */
const FLOOR_CELL = 2 * TEXEL;

export interface PlantOptions {
  seed: number;
  /** The tallest tree (m): the plan's heights are shares of it. Default JUNGLE_H. */
  height?: number;
  /** Jitter, mirror and re-size the layout and re-deal its tints by the seed (default: every seed but 1). */
  vary?: boolean;
  /** Discs the caller has already filled (walls, trunks) that the floor plants keep out of. */
  busy?: Busy;
  /**
   * The ground the plan stands on (a card's patch): whatever would stand off
   * it is moved in towards the middle until it stands on it.
   */
  inside?: (x: number, z: number) => boolean;
}

/** Footprint points of a disc (for fitting it onto the ground). */
const disc = (r: number): [number, number][] => [0, 1, 2, 3, 4, 5, 6, 7].map((a) => [r * Math.cos((a * Math.PI) / 4), r * Math.sin((a * Math.PI) / 4)]);

/**
 * Plant a plan into a piece (ground at y = 0): fallen blocks, trees, palms,
 * shrubs and bushes, the crowns' shading, then ferns and grass over the plan's
 * w × d wherever there is room. Colliders: the trunks and the stones.
 */
export function plantJungle(p: PieceBuilder, plan: JunglePlan, o: PlantOptions): void {
  const r = rng(o.seed * 131 + 7);
  const vary = o.vary ?? o.seed !== 1;
  const H = o.height ?? JUNGLE_H;
  const mx = vary && hash3(o.seed, 3, 7, 11) < 0.5 ? -1 : 1;
  const jit = (v: number, a = 0.4) => (vary ? v + r.range(-a, a) : v);
  const size = (a: number, b: number) => (vary ? r.range(a, b) : 1);
  const X = (x: number) => snap(mx * jit(x));
  const Z = (z: number) => snap(jit(z));
  const busy: Busy = [...(o.busy ?? [])];
  /** A spot moved in towards the middle, a step at a time, until its footprint stands on the ground. */
  const fit = (x: number, z: number, pts: readonly (readonly [number, number])[]): [number, number] => {
    for (let n = 0; o.inside && n < 32 && !pts.every(([dx, dz]) => o.inside!(x + dx, z + dz)); n++) {
      const d = Math.hypot(x, z) || 1;
      x = snap(x - (x / d) * 0.125);
      z = snap(z - (z / d) * 0.125);
    }
    return [x, z];
  };

  // Fallen blocks: one set, weathered together, a collider per block; then the wall.
  const set = new BlockSet(0.125);
  for (const heap of plan.heaps) {
    const blocks = heap.blocks.map((b): Box6 => (mx > 0 ? b : [-b[3], b[1], b[2], -b[0], b[4], b[5]]));
    const [hx, hz] = fit(X(heap.x), Z(heap.z), blocks.flatMap((b) => [[b[0], b[2]], [b[3], b[2]], [b[0], b[5]], [b[3], b[5]]] as [number, number][]));
    let reach = 0;
    blocks.forEach((b, n) => {
      set.add(hx + b[0], b[1], hz + b[2], hx + b[3], b[4], hz + b[5], tone(BLOCK, n, heap.x * 7, heap.z * 3, o.seed), { surf: BLOCK_SURF });
      reach = Math.max(reach, Math.abs(b[0]), Math.abs(b[3]));
    });
    // (Keep the ferns off the whole heap: a disc every half metre along it.)
    for (let t = -reach; t <= reach; t += 0.5) busy.push([hx + t, hz, 0.7]);
  }
  set.erode(0.22, o.seed + 5);
  set.emit(p.voxels, { seed: o.seed });
  for (const id of set.find(() => true)) {
    const { min, max } = set.boxOf(id);
    p.collider(min[0], min[1], min[2], max[0], max[1], max[2]);
  }
  if (plan.wall) wallStub(p, plan.wall, mx, o.seed, busy);

  // Trees, tallest first: their heights and crowns vary with the seed.
  const crowns: [number, number][] = [];
  plan.trees.forEach((t, n) => {
    // The plan's tallest stands at H; the others vary a tenth either way (never above it).
    const h = t.h >= 1 ? H : Math.min(H, H * t.h * size(0.9, 1.1));
    const k = h / (JUNGLE_H * t.h);
    const [x, z] = fit(X(t.x), Z(t.z), disc(t.trunk * k * 0.7 + 0.25));
    const first = p.voxels.boxes.length;
    broadleafTree(p, {
      height: h,
      width: h * t.w * size(0.92, 1.08),
      seed: o.seed * 17 + n,
      x,
      z,
      cell: t.cell,
      base: t.base,
      trunk: t.trunk * k,
      clumps: t.clumps,
      roots: t.roots,
      rootReach: t.reach * k,
      vines: t.vines,
      stones: t.stones,
    });
    recolor(p, first, vary ? r.pick(TINT_IDS) : t.tint);
    crowns.push([first, p.voxels.boxes.length]);
    // (broadleafTree gives the trunk its colliders; the stones at its foot get theirs here.)
    stoneColliders(p.voxels.boxes.slice(first), (c) => p.colliders.push(c));
    // (The floor plants keep clear of its roots and of the grass tufts the tree grows among them.)
    busy.push([x, z, t.reach * k + 1.0]);
  });
  plan.palms.forEach((pl, n) => {
    const palm = buildPalm({ kind: pl.kind, seed: o.seed * 5 + 3 + n, height: H * pl.h * size(0.94, 1.06) });
    const [x, z] = fit(X(pl.x), Z(pl.z), disc(1.0));
    placePiece({ voxels: p.voxels, collider: (c) => p.colliders.push(c) }, palm, { x, y: 0, z });
    busy.push([x, z, 1.2]);
  });
  plan.shrubs.forEach((s, n) => {
    const [x, z] = fit(X(s.x), Z(s.z), disc(s.w * 0.3));
    const h = s.h * size(0.85, 1.15);
    const first = p.voxels.boxes.length;
    shrub(p, x, z, h, s.w * (h / s.h), o.seed * 23 + n);
    recolor(p, first, TINT_IDS[(n * 3 + o.seed) % TINT_IDS.length]);
    crowns.push([first, p.voxels.boxes.length]);
    busy.push([x, z, s.w * 0.45]);
  });
  plan.bushes.forEach((b, n) => {
    const piece = bush.build({ variant: b.variant, seed: o.seed * 29 + n, height: b.h });
    const [x, z] = fit(X(b.x), Z(b.z), disc(1.4 * (b.h / 1.6)));
    // Its stones keep a collider each; the leaves none.
    const first = p.voxels.boxes.length;
    placePiece({ voxels: p.voxels }, piece, { x, y: 0, z, turn: b.turn });
    stoneColliders(p.voxels.boxes.slice(first), (c) => p.colliders.push(c));
    busy.push([x, z, 1.4]);
  });

  creases(p, crowns);
  jungleFloor(p, { w: plan.w, d: plan.d, ferns: plan.ferns, tufts: plan.tufts, seed: o.seed, busy, edges: plan.edges });
}

/**
 * Build a cluster as its own piece: its patch of ground and its plan. Seed 1
 * is the sheet's layout; other seeds jitter it, mirror it half the time and
 * re-size the trees (the tallest 17–21 m).
 */
export function buildJungle(o: JungleOptions): KitPiece {
  const plan = PLANS[o.kind];
  const p = new PieceBuilder();
  const inside = groundPatch(p, plan.w, plan.d, o.seed);
  p.collider(-plan.w / 2, -GROUND_D, -plan.d / 2, plan.w / 2, 0, plan.d / 2);
  plantJungle(p, plan, { seed: o.seed, height: o.height ?? (o.seed === 1 ? JUNGLE_H : JUNGLE_H - 2 + 4 * hash3(o.seed, 5, 1, 3)), inside });
  return p.done();
}

/**
 * Shade the crowns' outlines: where two crowns meet, the lower one's leaves
 * along the seam lie in the other's shade, and every crown's rim, where its
 * top drops away, is a step darker than its sunlit middle. Each crown then
 * stays distinct from above — the sheet's cluster layout — and reads as a
 * rounded head in front. `crowns` are the box ranges of the trees and shrubs.
 */
function creases(p: PieceBuilder, crowns: [number, number][]): void {
  const S = 0.5;
  const boxes = p.voxels.boxes;
  // The highest leaf top of each 0.5 m column, and whose it is (a grid over the crowns' footprint).
  let [i0, k0, i1, k1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [a, b] of crowns)
    for (let n = a; n < b; n++) {
      const bx = boxes[n];
      i0 = Math.min(i0, Math.floor(bx.x / S));
      k0 = Math.min(k0, Math.floor(bx.z / S));
      i1 = Math.max(i1, Math.floor(bx.x / S));
      k1 = Math.max(k1, Math.floor(bx.z / S));
    }
  if (i1 < i0) return;
  const ni = i1 - i0 + 5;
  const nk = k1 - k0 + 5;
  const top = new Float32Array(ni * nk);
  const owner = new Int16Array(ni * nk).fill(-1);
  const at = (i: number, k: number) => (i - i0 + 2) * nk + (k - k0 + 2);
  crowns.forEach(([a, b], id) => {
    for (let n = a; n < b; n++) {
      const bx = boxes[n];
      if (bx.mat !== 'leaves') continue;
      const q = at(Math.floor(bx.x / S), Math.floor(bx.z / S));
      const y = bx.y + bx.sy / 2;
      if (owner[q] < 0 || y > top[q]) {
        top[q] = y;
        owner[q] = id;
      }
    }
  });
  crowns.forEach(([a, b], id) => {
    for (let n = a; n < b; n++) {
      const bx = boxes[n];
      if (bx.mat !== 'leaves' || (bx.open !== undefined && !(bx.open & 4))) continue;
      const q = at(Math.floor(bx.x / S), Math.floor(bx.z / S));
      const y = bx.y + bx.sy / 2;
      let seam = false;
      for (let di = -2; di <= 2 && !seam; di++)
        for (let dk = -2; dk <= 2 && !seam; dk++) {
          const m = q + di * nk + dk;
          seam = owner[m] >= 0 && owner[m] !== id && top[m] > y - 0.25;
        }
      const rim = [nk, -nk, 1, -1].some((d) => top[q + d] < y - 1.5);
      bx.shade *= seam ? 0.5 : rim ? 0.78 : 1;
    }
  });
}

/** Depth of the ground patch (m). */
const GROUND_D = 0.25;

/**
 * The patch of forest floor under the cluster, as the card draws it: moss and
 * grass over dark soil, its outline rounded and ragged. Rows 0.5 m deep, one
 * soil block each (the pattern draws the moss, grass and drips), merged where
 * they meet so the top reads as one surface. Returns a test for points on it.
 */
function groundPatch(p: PieceBuilder, w: number, d: number, seed: number): (x: number, z: number) => boolean {
  const rows = Math.round(d / 0.5);
  const ends: [number, number][] = [];
  for (let n = 0; n < rows; n++) {
    const u = Math.abs((n + 0.5) / rows - 0.5) * 2;
    // A squircle, each row's ends frayed in by up to three quarters of a metre.
    const hw = (w / 2) * (1 - u ** 3) ** (1 / 3);
    const fray = (s: number) => 0.25 * Math.floor(hash3(n, s, 3, seed) * 4);
    ends.push([snap(-hw + fray(1), 0.25), snap(hw - fray(2), 0.25)]);
  }
  const surf = soilSurf({ grass: 0.82, moss: 0.5, wet: 0.35 });
  ends.forEach(([x0, x1], n) => {
    const z0 = -d / 2 + n * 0.5;
    // Sides that continue into the next row: no bevel there (the pattern runs on).
    const next = ends[n + 1];
    const prev = ends[n - 1];
    const merge = (next ? 16 : 0) | (prev ? 32 : 0);
    const covered = (e?: [number, number]) => !!e && e[0] <= x0 && e[1] >= x1;
    const open = 63 & ~(covered(next) ? 16 : 0) & ~(covered(prev) ? 32 : 0);
    p.voxels.span(x0, -GROUND_D, z0, x1, 0, z0 + 0.5, SOIL.humus[n % SOIL.humus.length], 'soil', { surf, merge, open });
  });
  // Is (x, z) on the patch (a quarter metre in from its edge)?
  return (x, z) => {
    const e = ends[Math.floor((z + d / 2) / 0.5)];
    const e2 = ends[Math.floor((z + d / 2 + (z < 0 ? -0.25 : 0.25)) / 0.5)];
    return !!e && !!e2 && x > Math.max(e[0], e2[0]) + 0.25 && x < Math.min(e[1], e2[1]) - 0.25;
  };
}

/**
 * A shrub of the understorey: a broadleaf crown of a few clumps sitting on
 * the ground (its stem hidden in the leaves), in chunky 5–6 texel voxels
 * like the trees above it.
 */
function shrub(p: PieceBuilder, x: number, z: number, h: number, w: number, seed: number): void {
  const n = p.colliders.length;
  broadleafTree(p, { height: h, width: w, seed, x, z, cell: (h < 2 ? 5 : 6) * TEXEL, base: 0.06, trunk: 0.3, clumps: 7, roots: 0, rootReach: 0.5, vines: 0, stones: 0 });
  // (broadleafTree gives every tree its trunk colliders: a shrub is walked through.)
  p.colliders.length = n;
}

/**
 * The ruins variant's broken wall: a stretch of temple wall two blocks thick
 * with a doorway under a lintel, its courses stepping down where the top has
 * fallen — tall at one end, a stub at the other — a block or two missing
 * from its face; its fallen blocks are the plan's heaps in front of it.
 */
function wallStub(p: PieceBuilder, w: WallSpot, mx: number, seed: number, busy: Busy): void {
  const set = new BlockSet(0.125);
  const [x0, x1] = mx > 0 ? [w.x0, w.x1] : [-w.x1, -w.x0];
  const door = mx * w.door;
  // The lintel first (stone already laid wins), then the courses around it; then the opening under it.
  set.add(door - 0.875, 2.5, w.z - 0.5, door + 0.875, 3.0, w.z + 0.5, WALL[2], { surf: WALL_SURF });
  masonry(set, x0, 0, w.z - 0.5, x1, w.tall, w.z + 0.5, { length: [0.5, 1.0], course: 0.5, depth: 0.5, axis: 'x', palette: WALL, style: { surf: WALL_SURF }, seed: seed + 41 });
  set.carve((x, y) => Math.abs(x - door) < 0.625 && y < 2.5, { min: [door - 0.75, 0, w.z - 0.6], max: [door + 0.75, 2.5, w.z + 0.6] });
  // The broken top: whole blocks gone above a line falling from the tall end to the low one, ragged by a block.
  const top = (x: number) => {
    const t = (x - x0) / (x1 - x0);
    const u = mx > 0 ? t : 1 - t;
    return w.tall + (w.low - w.tall) * u ** 1.4 + (hash3(Math.floor(x / 0.5), 1, 2, seed) - 0.5) * 0.9;
  };
  for (const id of set.find((x, y) => y > top(x) && Math.abs(x - door) > 0.9)) set.remove(id);
  // A couple of blocks missing from the face.
  const face = set.find((x, y, z) => z > w.z && y > 0.5 && y < top(x) - 0.6 && Math.abs(x - door) > 1.2);
  const r = rng(seed + 43);
  for (let n = 0; n < 2 && face.length; n++) set.remove(face.splice(r.int(0, face.length - 1), 1)[0]);
  set.erode(0.22, seed + 47);
  set.emit(p.voxels, { seed });
  // Colliders: a column every half metre up to the broken top; the doorway stays open under its lintel.
  for (let x = x0; x < x1 - 1e-6; x += 0.5) {
    let h = 0;
    for (let y = 0.125; y < w.tall; y += 0.25) if (set.solidAt(x + 0.25, y, w.z)) h = y + 0.125;
    const inDoor = Math.abs(x + 0.25 - door) < 0.625;
    if (h > (inDoor ? 2.5 : 0)) p.collider(x, inDoor ? 2.5 : 0, w.z - 0.5, x + 0.5, h, w.z + 0.5);
  }
  for (let x = x0 + 0.5; x <= x1; x += 1) busy.push([x, w.z, 0.9]);
}

/**
 * Merge the sandstone boxes that touch into stones, one collider each (the
 * stones at a tree's foot and round a placed bush: the leaves get none).
 */
function stoneColliders(boxes: VoxelBox[], add: (c: KitCollider) => void): void {
  const stones = boxes.filter((b) => b.mat === 'sandstone');
  const parent = stones.map((_, n) => n);
  const find = (n: number): number => (parent[n] === n ? n : (parent[n] = find(parent[n])));
  const lo = (b: VoxelBox, a: 'x' | 'y' | 'z', s: 'sx' | 'sy' | 'sz') => b[a] - b[s] / 2;
  const hi = (b: VoxelBox, a: 'x' | 'y' | 'z', s: 'sx' | 'sy' | 'sz') => b[a] + b[s] / 2;
  const touch = (a: VoxelBox, b: VoxelBox) =>
    lo(a, 'x', 'sx') <= hi(b, 'x', 'sx') + 0.01 && lo(b, 'x', 'sx') <= hi(a, 'x', 'sx') + 0.01 && lo(a, 'y', 'sy') <= hi(b, 'y', 'sy') + 0.01 && lo(b, 'y', 'sy') <= hi(a, 'y', 'sy') + 0.01 && lo(a, 'z', 'sz') <= hi(b, 'z', 'sz') + 0.01 && lo(b, 'z', 'sz') <= hi(a, 'z', 'sz') + 0.01;
  for (let a = 0; a < stones.length; a++) for (let b = a + 1; b < stones.length; b++) if (touch(stones[a], stones[b])) parent[find(a)] = find(b);
  const groups = new Map<number, [number, number, number, number, number, number]>();
  stones.forEach((b, n) => {
    const g = groups.get(find(n)) ?? [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    groups.set(find(n), [Math.min(g[0], lo(b, 'x', 'sx')), Math.min(g[1], lo(b, 'y', 'sy')), Math.min(g[2], lo(b, 'z', 'sz')), Math.max(g[3], hi(b, 'x', 'sx')), Math.max(g[4], hi(b, 'y', 'sy')), Math.max(g[5], hi(b, 'z', 'sz'))]);
  });
  for (const g of groups.values()) add({ min: [g[0], Math.max(0, g[1]), g[2]], max: [g[3], g[4], g[5]] });
}

/** Discs (x, z, radius in metres) the floor plants keep out of: trunks, stones, shrubs. */
export type Busy = [number, number, number][];

export interface FloorOptions {
  /** The area (metres, centred on x, z): a w × d rounded rectangle. */
  w: number;
  d: number;
  x?: number;
  z?: number;
  ferns: number;
  tufts: number;
  seed: number;
  busy: Busy;
  /** 0 = spread evenly; 1 = thicker towards the edges, where more light gets in (default). */
  edges?: number;
}

/**
 * The jungle floor: ferns and grass tufts wherever the trunks, stones and
 * shrubs leave room, all on one grid of two-texel cells (the ground at y = 0).
 */
export function jungleFloor(p: PieceBuilder, o: FloorOptions): void {
  const r = rng(o.seed * 61 + 5);
  const cx = o.x ?? 0;
  const cz = o.z ?? 0;
  const W = o.w / 2 - 0.4;
  const D = o.d / 2 - 0.4;
  const edges = o.edges ?? 1;
  const x0 = snap(cx - o.w / 2, FLOOR_CELL);
  const z0 = snap(cz - o.d / 2, FLOOR_CELL);
  const g = p.voxels.grid({ cell: FLOOR_CELL, origin: [x0, 0, z0], mat: 'leaves', jitter: 0.06, ao: 0.32, seed: o.seed });
  const spots: Busy = [];
  /** Is (x, z) at least (r + rad)·k from every disc of the list? */
  const clear = (list: Busy, x: number, z: number, rad: number, k: number) => {
    for (const [bx, bz, br] of list) {
      const m = (br + rad) * k;
      if ((x - bx) ** 2 + (z - bz) ** 2 <= m * m) return false;
    }
    return true;
  };
  const free = (x: number, z: number, rad: number) => clear(o.busy, x, z, rad, 1) && clear(spots, x, z, rad, 0.8);
  const place = (n: number, rad: number, draw: (i: number, k: number, size: number, s: number) => void) => {
    for (let t = 0, done = 0; done < n && t < n * 40; t++) {
      const u = r.range(-1, 1);
      const v = r.range(-1, 1);
      // Towards the edges: under the closed canopy the floor is darker and barer.
      if (Math.max(Math.abs(u), Math.abs(v)) < r.range(0.2, 0.75) * edges) continue;
      // Stay on the rounded patch.
      if (Math.abs(u) ** 3 + Math.abs(v) ** 3 > 1) continue;
      const x = cx + u * W;
      const z = cz + v * D;
      const size = rad * r.range(0.75, 1.2);
      if (!free(x, z, size)) continue;
      spots.push([x, z, size]);
      draw(Math.round((x - x0) / FLOOR_CELL), Math.round((z - z0) / FLOOR_CELL), size, o.seed * 97 + done);
      done++;
    }
  };
  place(o.ferns, 0.9, (i, k, size, s) => fern(g, i, k, size / FLOOR_CELL, s));
  place(o.tufts, 0.45, (i, k, size, s) => grassTuft(g, i, k, { height: Math.round(size / FLOOR_CELL) + r.int(2, 4), radius: 1.5, lean: 0.5, arms: 0.5, tones: FLOOR_GRASS, seed: s }));
  // The ground under the plants, for their ambient occlusion.
  const roots: [number, number][] = [];
  g.forEach((i, j, k) => {
    if (j === 0) roots.push([i, k]);
  });
  for (const [i, k] of roots) if (!g.has(i, -1, k)) g.ghost(i, -1, k);
  commitGrass(p, g, { sun: 0.25 });
}

/**
 * A fern: six to eight fronds rising from the crown and arching out,
 * drooping at the tips, a comb of leaflets along each rib — long near the
 * base, short at the tip (cell units; `len` = frond reach).
 */
function fern(g: VoxelGrid, i: number, k: number, len: number, seed: number): void {
  const r: Rng = rng(seed);
  const n = r.int(6, 8);
  const a0 = r.range(0, Math.PI * 2);
  const set = (x: number, y: number, z: number, c: number) => {
    if (y >= 0 && !g.has(x, y, z)) g.set(x, y, z, c);
  };
  set(i, 0, k, FERN.deep[0]);
  for (let f = 0; f < n; f++) {
    const a = a0 + ((f + r.range(-0.3, 0.3)) / n) * Math.PI * 2;
    const L = len * r.range(0.7, 1.05);
    const lift = r.range(0.6, 0.9);
    const [dx, dz] = [Math.cos(a), Math.sin(a)];
    const steps = Math.ceil(L * 1.5);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const d = t * L;
      const y = Math.round(L * lift * (1.9 * t - 1.7 * t * t) * 0.7);
      const ci = Math.round(i + dx * d);
      const ck = Math.round(k + dz * d);
      set(ci, y, ck, tone(FERN.rib, ci, y, ck, seed));
      if (t < 0.15 || s % 2) continue;
      // Leaflets on both sides, the far ones a cell lower (the frond's edge droops).
      const reach = t < 0.55 ? 2 : 1;
      const tones = t < 0.35 ? FERN.deep : t < 0.75 ? FERN.mid : FERN.tip;
      for (const side of [-1, 1])
        for (let q = 1; q <= reach; q++) {
          const li = Math.round(ci - dz * q * side);
          const lk = Math.round(ck + dx * q * side);
          set(li, y - (q === reach && t > 0.5 ? 1 : 0), lk, tone(tones, li, y, lk, seed + q));
        }
    }
  }
}
