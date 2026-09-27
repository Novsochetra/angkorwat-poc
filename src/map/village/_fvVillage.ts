import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { evHouse } from '../hamlet/_evHouse';
import { papaya, vegBed, type EvEnv } from '../hamlet/_evKit';
import { BAMBOO, type MkBuild, tone } from '../hamlet/_mkKit';
import { signLetters, wordSize } from '../hamlet/_mkSign';
import { SURFACE, type HeightField } from '../heightfield';
import { Palms } from '../veg/palms';
import { AISLE, FV_GATE, FV_HOMES, FV_RACKS, FV_TREE, LANE } from './_fvPlan';
import { VILLAGE_WORD } from './_fvSign';
import { banana, Local } from './_kit';
import type { VillageLights } from './_lights';
import type { SmokeSource } from './_smoke';
import { PAGODA, STILT_HOMES, VILLAGE_SPOTS } from './_spots';

/**
 * The floating village's heart round its market (where things stand:
 * `_fvPlan.ts`), what gives the village an arrival and a middle:
 *
 * - the village gate where the village trail comes down off the dike: two
 *   whitewashed pillars under stepped capitals and lotus-bud tops, a lintel
 *   and the name board over it, "ភូមិបណ្ដែតទឹក" in raised cream letters on
 *   blue (facing whoever comes over the paddies), a small stepped crest;
 * - the village tree (a tamarind) on the open ground where the trails meet
 *   (the ox cart turns round it: nothing solid in its ring): a fluted trunk
 *   forking into limbs, a wide low crown of dark leaves with gaps, and at
 *   its foot the neak ta (អ្នកតា) in his humble wooden shrine, bands of
 *   cloth tied round the trunk, candles lit at night, a bench;
 * - the north street: a second row of houses on the land side of the east
 *   shore trail (the sugar-palm village's Khmer forms, hamlet/_evHouse.ts:
 *   kantaing, pet, rông daol), their fronts to the stilt houses across it;
 *   papayas, bananas and kitchen beds round them; fish drying on bamboo
 *   racks in front, small fish on a mat in the sun;
 * - trodden earth where people walk: the market's floor, the path from the
 *   square to the pagoda's naga stair, the lane along the stilt houses'
 *   stair feet (thin slabs on the land's cells, a little inset).
 */

export interface FvEnv {
  field: HeightField;
  /** The village's still blocks (the houses build into it). */
  world: VoxelBuilder;
  /** The market's builder (its boxes are tagged: these are always there, tag 0). */
  mk: MkBuild;
  lights: VillageLights;
  smoke: SmokeSource[];
}

export function buildFvVillage(env: FvEnv): { houses: number } {
  env.mk.tag = 0;
  gate(env);
  const houses = northStreet(env);
  villageTree(env);
  trodden(env);
  return { houses };
}

// ── The gate ─────────────────────────────────────────────────────────────────

/** Whitewash, its shade, the capitals' ochre and red, the lotus buds' pale gold; the board's blue, its gold border, the letters' cream. */
const WHITE = [0xe8e2d4, 0xe2dccd, 0xece6d8];
const OCHRE = 0xc8963a;
const RED = 0xa8402a;
const LOTUS = 0xe0b450;
const BOARD = 0x24508a;
const BORDER = 0xd8a840;
const LETTERS = 0xf6ecc8;

/**
 * The village gate (ខ្លោងទ្វារភូមិ): its frame's +z runs through it into the
 * village, the name on the face toward the dike (−z); wide and tall enough
 * for the ox cart. Solid (the walk map keeps the pillars).
 */
function gate(env: FvEnv): void {
  const mk = env.mk;
  mk.src = traceSource();
  const g = FV_GATE;
  mk.at(g.x, env.field.heightAt(g.x, g.z), g.z, g.yaw, 5601);
  // The name board between the pillars over the lintel (its size sets the pillars' height).
  const px = 0.042;
  const [cols, rows] = wordSize(VILLAGE_WORD);
  const bw = cols * px + 0.5;
  const bh = rows * px + 0.34;
  const L0 = 3.5;
  const by = L0 + 0.05 + bh / 2;
  const H = by + bh / 2 + 0.25;
  for (const sx of [-1, 1]) {
    const x = sx * g.half;
    // Plinth, shaft, painted bands, stepped capital, lotus bud.
    mk.box(x, 0.2, 0, 0.9, 0.4, 0.9, 0xd4ccbc, 'mapStone', 0.95);
    mk.box(x, 0.45, 0, 0.78, 0.1, 0.78, OCHRE, 'mapStone');
    mk.box(x, 0.5 + (H - 0.5) / 2, 0, 0.62, H - 0.5, 0.62, tone(WHITE, mk.r(sx, 1)), 'mapStone');
    mk.box(x, L0 - 0.6, 0, 0.68, 0.12, 0.68, OCHRE, 'mapStone');
    mk.box(x, H - 0.35, 0, 0.68, 0.1, 0.68, RED, 'mapStone');
    mk.box(x, H + 0.06, 0, 0.84, 0.12, 0.84, OCHRE, 'mapStone');
    mk.box(x, H + 0.18, 0, 0.72, 0.12, 0.72, RED, 'mapStone');
    mk.box(x, H + 0.3, 0, 0.58, 0.12, 0.58, OCHRE, 'mapStone', 1.05);
    mk.box(x, H + 0.54, 0, 0.4, 0.36, 0.4, LOTUS, 'mapStone', 1.08);
    mk.box(x, H + 0.82, 0, 0.26, 0.22, 0.26, LOTUS, 'mapStone', 1.12);
    mk.box(x, H + 1.0, 0, 0.11, 0.18, 0.11, LOTUS, 'mapStone', 1.15);
  }
  // The lintel between the shafts, a red band under it.
  mk.span(-g.half, L0 - 0.3, -0.24, g.half, L0, 0.24, tone(WHITE, 0.5), 'mapStone');
  mk.span(-g.half + 0.31, L0 - 0.4, -0.2, g.half - 0.31, L0 - 0.3, 0.2, RED, 'mapStone', 0.95);
  // The board: blue, a gold border, the letters raised on the face toward the dike.
  mk.span(-bw / 2, by - bh / 2, -0.07, bw / 2, by + bh / 2, 0.07, BOARD, 'mapStone', 1);
  mk.span(-bw / 2 - 0.08, by + bh / 2, -0.09, bw / 2 + 0.08, by + bh / 2 + 0.1, 0.09, BORDER, 'mapStone');
  mk.span(-bw / 2 - 0.08, by - bh / 2 - 0.02, -0.09, bw / 2 + 0.08, by - bh / 2 + 0.06, 0.09, BORDER, 'mapStone');
  for (const sx of [-1, 1]) mk.span(sx * (bw / 2) - 0.06, by - bh / 2, -0.09, sx * (bw / 2) + 0.06, by + bh / 2, 0.09, BORDER, 'mapStone');
  signLetters(mk, VILLAGE_WORD, 0, by, -0.07, px, -1, LETTERS);
  // The crest: a small stepped pediment over the board's middle, a lotus bud on it.
  const cy = by + bh / 2 + 0.1;
  for (let k = 0; k < 3; k++) mk.box(0, cy + 0.09 + k * 0.18, 0, 1.6 - k * 0.48, 0.18, 0.2, k === 1 ? RED : OCHRE, 'mapStone', 1 + k * 0.03);
  mk.box(0, cy + 0.72, 0, 0.22, 0.26, 0.22, LOTUS, 'mapStone', 1.1);
  mk.box(0, cy + 0.9, 0, 0.1, 0.14, 0.1, LOTUS, 'mapStone', 1.14);
}

// ── The north street ─────────────────────────────────────────────────────────

/** The houses on the land side of the east shore trail, their gardens and the fish drying in front. Returns how many stand. */
function northStreet(env: FvEnv): number {
  const src = traceSource();
  // (evHouse plants no palms: its palms are the east village's own)
  const ev: EvEnv = { field: env.field, world: env.world, lights: env.lights, smoke: env.smoke, palms: new Palms() };
  let n = 0;
  for (const h of FV_HOMES) if (evHouse(h, ev)) n++;
  // Round them: papayas and bananas at the backs and sides, kitchen beds.
  const L = new Local(env.world, src, 9101);
  const g = (x: number, z: number) => env.field.heightAt(x, z);
  for (const [x, z] of [
    [-265.8, 25.2],
    [-266.4, 36.5],
    [-266.9, 46.6],
  ])
    papaya(L, x, g(x, z), z, 3.2 + hash3(Math.round(x), Math.round(z), 1, 9102) * 0.8);
  for (const [x, z] of [
    [-265.6, 33.0],
    [-267.2, 39.8],
    [-269.0, 55.0],
    [-274.8, 22.6],
  ])
    banana(L, x, g(x, z), z);
  vegBed(L, -267.6, 45.2, -265.4, 49.4, g(-266.5, 47.3));
  vegBed(L, -268.4, 21.8, -265.2, 24.0, g(-266.8, 22.9));
  racks(env);
  return n;
}

/** Fish drying in the sun: split fish in rows on bamboo racks, small fish on a blue sheet on the ground. */
function racks(env: FvEnv): void {
  const mk = env.mk;
  mk.src = traceSource();
  const FISH = [0xb89a6a, 0xa8885a, 0xc8aa78, 0x9a7a4e];
  const SILVER = [0xb8c0c4, 0xa8b2b8, 0xcfd6d8];
  FV_RACKS.forEach((r, n) => {
    mk.at(r.x, env.field.heightAt(r.x, r.z), r.z, r.yaw, 9201 + n);
    if (r.mat) {
      // A blue sheet weighted with stones, small fish in rows on it.
      mk.span(-1.5, 0, -0.9, 1.5, 0.03, 0.9, 0x3a6aa8, 'petal', 0.95);
      for (const [sx, sz] of [
        [-1.5, -0.9],
        [1.5, 0.9],
        [1.5, -0.9],
      ])
        mk.box(sx, 0.08, sz, 0.2, 0.14, 0.18, 0x8a8478, 'mapStone');
      for (let k = 0; k < 24; k++) mk.box(-1.25 + (k % 8) * 0.34, 0.05, -0.6 + Math.floor(k / 8) * 0.55, 0.1, 0.03, 0.3, tone(SILVER, mk.r(k, 2)), 'petal');
      return;
    }
    // Four legs, a frame, split bamboo slats; the fish laid out in three rows.
    const h = 1.05;
    for (const [sx, sz] of [
      [-1.35, -0.55],
      [1.35, -0.55],
      [-1.35, 0.55],
      [1.35, 0.55],
    ])
      mk.box(sx, h / 2, sz, 0.08, h, 0.08, tone(BAMBOO, mk.r(sx, sz)), 'mapBark');
    for (const sz of [-0.6, 0.6]) mk.box(0, h - 0.04, sz, 2.9, 0.07, 0.07, tone(BAMBOO, mk.r(sz, 3)), 'mapBark');
    mk.span(-1.45, h - 0.06, -0.6, 1.45, h - 0.02, 0.6, 0xbba36c, 'mapBark', 0.95);
    for (let k = 0; k < 21; k++) mk.box(-1.2 + (k % 7) * 0.4, h + 0.01, -0.38 + Math.floor(k / 7) * 0.38, 0.18, 0.03, 0.3, tone(FISH, mk.r(k, 4)), 'petal');
  });
}

// ── The village tree ─────────────────────────────────────────────────────────

/**
 * The tamarind where the trails meet: a fluted trunk forking at 3.6 m into
 * limbs that reach out level, a wide low crown of dark feathery leaves (1 m
 * cells, clusters at the limbs' ends, ragged, with gaps the light comes
 * through), high enough over the ground for the ox cart that turns round
 * it. At its foot the neak ta's shrine facing the square, bands of cloth
 * round the trunk, a bench.
 */
function villageTree(env: FvEnv): void {
  const mk = env.mk;
  mk.src = traceSource();
  const T = FV_TREE;
  const y0 = env.field.heightAt(T.x, T.z);
  mk.at(T.x, y0, T.z, 0, 9301);
  const bark = [0x5a4636, 0x4e3c2e, 0x645040, 0x574332];
  for (let j = 0; j < 4; j++) {
    const ox = Math.sin(j * 0.9) * 0.12;
    const oz = Math.cos(j * 1.3) * 0.1;
    const wd = 1.2 - j * 0.07;
    mk.box(ox, j * 0.95 + 0.47, oz, wd, 0.96, wd, tone(bark, mk.r(j, 1)), 'mapBark');
    mk.box(ox + wd * 0.5, j * 0.95 + 0.47, oz + 0.1, 0.24, 0.94, wd * 0.5, tone(bark, mk.r(j, 5)), 'mapBark', 0.9);
    mk.box(ox - 0.1, j * 0.95 + 0.47, oz - wd * 0.5, wd * 0.55, 0.94, 0.24, tone(bark, mk.r(j, 6)), 'mapBark', 0.92);
  }
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3;
    mk.box(Math.sin(a) * 0.8, 0.14, Math.cos(a) * 0.8, 0.55, 0.28, 0.5, tone(bark, mk.r(k, 2)), 'mapBark', 0.9, 0, a);
  }
  // Limbs: out and up from the fork, then level; a leaf cluster at each end.
  const limbs: [number, number, number, number][] = [
    [1, 0.35, 5.2, 3.6],
    [-0.95, 0.5, 5.5, 3.4],
    [0.25, -1, 5.8, 3.8],
    [-0.5, -0.8, 5.0, 3.2],
    [0.7, 0.9, 5.6, 3.0],
  ];
  const clusters: [number, number, number, number][] = [[0, 7.0, 0, 3.4]];
  for (const [dx, dz, h, reach] of limbs) {
    const l = Math.hypot(dx, dz);
    const ux = dx / l;
    const uz = dz / l;
    mk.rod(0, 3.6, 0, ux * reach * 0.55, h, uz * reach * 0.55, 0.5, 0.5, tone(bark, mk.r(dx, dz, 3)), 'mapBark');
    mk.rod(ux * reach * 0.55, h, uz * reach * 0.55, ux * reach, h + 0.5, uz * reach, 0.36, 0.36, tone(bark, mk.r(dz, dx, 4)), 'mapBark');
    clusters.push([ux * reach, h + 1.2, uz * reach, 2.1 + mk.r(dx, 7) * 0.6]);
  }
  // The crown: the union of flattened spheres (the middle and the clusters). Its skin is clumps of leaf blocks of
  // different sizes, each a little off the lattice (no grid shows), a few more hanging under; gaps here and there.
  const leaf = [0x3a5e26, 0x456b2c, 0x33541f, 0x4e7432, 0x2e4d1c, 0x547a36];
  const shape = (x: number, y: number, z: number): number => {
    let best = 9;
    for (const [cx, cy, cz, r] of clusters) best = Math.min(best, Math.hypot((x - cx) / r, (y - cy) / (r * 0.62), (z - cz) / r));
    return best;
  };
  const S = 1.05;
  for (let i = -7; i <= 7; i++)
    for (let j = 0; j <= 7; j++)
      for (let k = -7; k <= 7; k++) {
        const x = i * S + (mk.r(i, j, k + 1) - 0.5) * 0.5;
        const y = 4.8 + j * 0.78 + (mk.r(k, i, j + 2) - 0.5) * 0.3;
        const z = k * S + (mk.r(j, k, i + 4) - 0.5) * 0.5;
        const d = shape(x, y, z) + (mk.r(i, j, k) - 0.5) * 0.22;
        // (the skin only: a cell whose neighbours all lie inside is hidden)
        if (d > 1 || d < 0.7) continue;
        if (mk.r(k, i, j + 9) < 0.08) continue;
        const sz = 0.8 + mk.r(i, k, j + 5) * 0.4;
        mk.box(x, y, z, sz, sz * (0.72 + mk.r(j, i, k + 6) * 0.2), sz * (0.9 + mk.r(k, j, i + 7) * 0.2), tone(leaf, mk.r(k, i, j + 3)), 'mapLeaf', 0.76 + 0.36 * (j / 7), 0, mk.r(i, j, k + 8) * 0.8);
      }
  // Cloth tied round the trunk: bands of red, yellow, white, blue; a strip hanging.
  const bands = [0xc8342c, 0xe8b830, 0xf2eee4, 0x3a7ac0];
  for (let k = 0; k < 4; k++) mk.box(Math.sin(k * 0.9) * 0.12, 1.25 + k * 0.16, Math.cos(k * 1.3) * 0.1, 1.3 - k * 0.02, 0.12, 1.3 - k * 0.02, bands[k], 'petal', 1);
  mk.box(0.7, 1.05, 0.12, 0.05, 0.5, 0.14, 0xc8342c, 'petal');
  neakTa(env, mk, y0);
}

/**
 * The neak ta (អ្នកតា, the village's guardian spirit) at the tree's foot:
 * a humble wooden shrine on a plastered plinth, open to the square (a gable
 * of red tiles, a plain ridge: no horns), inside the spirits as stones
 * wrapped in cloth; in front incense in a bowl, two candles (lit at night),
 * bay sei and marigolds.
 */
function neakTa(env: FvEnv, mk: MkBuild, y0: number): void {
  const T = FV_TREE;
  // (on the square's side of the trunk, facing the trails' end)
  const yaw = Math.atan2(LANE.from[0] - T.x, LANE.from[1] - T.z);
  const sx = T.x + Math.sin(yaw) * 1.25;
  const sz = T.z + Math.cos(yaw) * 1.25;
  mk.at(sx, y0, sz, yaw, 9401);
  mk.span(-0.55, 0, -0.45, 0.55, 0.55, 0.4, 0xc8bca4, 'mapBark', 0.95);
  mk.span(-0.62, 0.55, -0.5, 0.62, 0.62, 0.46, 0xd8ccb4, 'mapBark', 1);
  const wood = 0x7a5a3a;
  mk.span(-0.4, 0.62, -0.36, 0.4, 1.3, -0.3, wood, 'mapBark', 0.9);
  for (const s of [-1, 1]) mk.span(s * 0.4 - 0.03, 0.62, -0.36, s * 0.4 + 0.03, 1.3, 0.22, wood, 'mapBark', 0.85);
  mk.span(-0.5, 1.3, -0.46, 0.5, 1.38, 0.32, 0x9a3a24, 'mapBark');
  mk.span(-0.42, 1.38, -0.38, 0.42, 1.48, 0.24, 0xb04a2c, 'mapBark');
  mk.span(-0.3, 1.48, -0.3, 0.3, 1.56, 0.16, 0xb85a34, 'mapBark');
  mk.span(-0.34, 1.56, -0.1, 0.34, 1.62, -0.04, 0x8a3a24, 'mapBark');
  const cloth = [0xf2eee4, 0xc8342c, 0xe8b830];
  for (let k = 0; k < 3; k++) {
    mk.box(-0.2 + k * 0.2, 0.74 + (k === 1 ? 0.04 : 0), -0.12, 0.14, 0.24 + (k === 1 ? 0.08 : 0), 0.12, 0x8a8478, 'mapBark');
    mk.box(-0.2 + k * 0.2, 0.72, -0.12, 0.16, 0.1, 0.14, cloth[k], 'petal');
  }
  mk.box(0, 1.25, 0.23, 0.78, 0.1, 0.03, 0xc8342c, 'petal');
  mk.box(0, 0.68, 0.28, 0.2, 0.12, 0.2, 0xb8a888, 'petal');
  for (let k = 0; k < 3; k++) mk.box(-0.05 + k * 0.05, 0.84, 0.28, 0.015, 0.26, 0.015, 0xc8302a, 'petal');
  for (const s of [-1, 1]) {
    mk.box(s * 0.3, 0.72, 0.3, 0.05, 0.16, 0.05, 0xf4ecd8, 'petal');
    env.lights.still.add(mk.wx(s * 0.3, 0.3), y0 + 0.83, mk.wz(s * 0.3, 0.3), 0.04, 0.06, 0.04, 0, 0xffb050, s * 1.7);
    mk.box(s * 0.46, 0.7, 0.05, 0.14, 0.16, 0.14, 0x4a8a34, 'petal');
    mk.box(s * 0.46, 0.84, 0.05, 0.09, 0.14, 0.09, 0x5a9a3a, 'petal');
    mk.box(s * 0.46, 0.94, 0.05, 0.05, 0.06, 0.05, 0xf4f0e6, 'petal');
  }
  env.lights.halo(mk.wx(0, 0.3), y0 + 0.9, mk.wz(0, 0.3), 1.4, 2.3);
  mk.box(0.18, 0.66, 0.12, 0.2, 0.08, 0.12, 0xf0a020, 'petal');
}

// ── Trodden earth ────────────────────────────────────────────────────────────

/** The open ground where the trails meet, round the village tree and before the shop: bare earth all over. */
const SQUARE = { x: -297.5, z: 77.5, r: 6.5 };

/** Distance (m) from (x, z) to the polyline `pts`. */
function toLine(x: number, z: number, pts: readonly [number, number][]): number {
  let best = Infinity;
  for (let s = 0; s < pts.length - 1; s++) {
    const [ax, az] = pts[s];
    const [bx, bz] = pts[s + 1];
    const ex = bx - ax;
    const ez = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1)));
    const dx = x - ax - ex * t;
    const dz = z - az - ez * t;
    best = Math.min(best, Math.sqrt(dx * dx + dz * dz));
  }
  return best;
}

/** Inside the polygon `pts` (x, z)? */
function inside(x: number, z: number, pts: readonly [number, number][]): boolean {
  let n = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) n = !n;
  }
  return n;
}

/**
 * Worn earth where people walk: the market's floor (the wedge between the
 * aisle and the lane, both ways' width), the path from the square to the
 * pagoda's naga stair, the lane along the stilt houses' stair feet, the
 * cart's ring round the tree. A thin slab on each land cell (a little
 * inset, so the cells still show), packed earth with a dry tuft now and
 * then; not on sand, water or the paddies.
 */
function trodden(env: FvEnv): void {
  const mk = env.mk;
  mk.src = traceSource();
  mk.at(0, 0, 0, 0, 9501);
  const f = env.field;
  const earth = [0x8e6c48, 0x86653f, 0x957451, 0x7f6a48, 0x8b774f];
  const dry = [0x8ba445, 0x92aa4a];
  const wedge: [number, number][] = [LANE.from, LANE.to, [-302.6, 60.2], [-295.5, 59.6], AISLE.from];
  const pagoda: [number, number][] = [
    [-300.6, 75.2],
    [-303.4, 80.6],
    [PAGODA.x, PAGODA.stair.z0 - 0.6],
  ];
  // (in front of the stilt houses' stairs, from the lane's end past the pagoda square to the last house)
  const feet = STILT_HOMES.slice(4).map((h) => VILLAGE_SPOTS.homes.find((o) => o.id === h.id)!.stairFoot);
  const shore: [number, number][] = [[-303.2, 69.6], ...feet.map(([x, , z]) => [x + 0.6, z + 1.1] as [number, number])];
  // (the village trail's last leg, from the gate to the trails' end, and the ground before the shop)
  const way: [number, number][] = [[FV_GATE.x, FV_GATE.z], LANE.from];
  const shop: [number, number][] = [
    [-291.5, 70],
    [-294, 75.5],
  ];
  const c = f.cell;
  const seen = new Set<number>();
  for (let z = 54; z < 92; z += c)
    for (let x = -346; x < -284; x += c) {
      const cx = Math.floor(x / c) * c + c / 2;
      const cz = Math.floor(z / c) * c + c / 2;
      const key = Math.round(cx) * 1000 + Math.round(cz);
      if (seen.has(key)) continue;
      seen.add(key);
      const s = f.surfaceAt(cx, cz);
      if ((s !== SURFACE.dirt && s !== SURFACE.grass) || f.waterAt(cx, cz) !== null) continue;
      const ring = Math.abs(Math.hypot(cx - FV_TREE.x, cz - FV_TREE.z) - 4.2);
      const d = Math.min(inside(cx, cz, wedge) ? 0 : 9, toLine(cx, cz, [AISLE.from, AISLE.to]) - 1.6, toLine(cx, cz, [LANE.from, LANE.to]) - 1.3, toLine(cx, cz, pagoda) - 0.4, toLine(cx, cz, shore) - 0.3, toLine(cx, cz, way) - 1.3, toLine(cx, cz, shop) - 1.2, Math.hypot(cx - SQUARE.x, cz - SQUARE.z) - SQUARE.r, ring - 0.6);
      const r = hash3(Math.round(cx), Math.round(cz), 7, 9502);
      if (d > 0.9 || (d > 0 && r < d / 0.9)) continue;
      const bare = r > 0.14;
      mk.box(cx, f.heightAt(cx, cz) + 0.02, cz, c - 0.12, 0.05, c - 0.12, bare ? tone(earth, hash3(Math.round(cx), Math.round(cz), 8, 9503)) : tone(dry, r * 7), 'mapBark', 0.96 + r * 0.08);
    }
}
