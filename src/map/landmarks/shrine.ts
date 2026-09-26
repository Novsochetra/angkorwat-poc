import { Group } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { hash3, valueNoise3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import type { PlaceDef } from '../layout';
import { SacredSet } from '../sacred/set';
import type { MapContext, MapFrame, MapPart } from '../types';
import { bondTone, courseShade, fillBox, tone } from './_faces';
import { CANOPY, chip, drapeRoot, FIG_BARK, growTree, LATERITE, limb, overgrow, pickOf, RUIN_STONE } from './_ruin';
import { AltarGlow, hiddenSolid, peoplesShrine, stepCloth, type ShrineSpec } from './_sanctuaryShrine';

/**
 * Preah Khan — "The Silent Ruins": a ruined temple complex the jungle has
 * taken back. A long rectangular gallery of dark grey-brown stone runs round
 * a court, its corbelled roofs fallen in stretches, dark windows in its
 * walls, a small tower on each corner (the south-west one fallen) and a
 * smaller shrine tower in the court. Stairs
 * climb to a gate pavilion in the middle of the south gallery. In the court
 * stands the central tower, its east side come down in a heap, a strangler
 * fig sitting on its top with pale roots gripping the walls down to the
 * ground; another fig grows out of the south gallery's roof. Moss on every
 * ledge. In the gate's passage the people keep a small sandstone Buddha on a
 * stone pedestal, candles and incense before him (`gateShrine`), the way
 * through open either side of him; the explorer kneels before it
 * (roam/_worship.ts). At night its candles glow.
 *
 * The road crosses the pad diagonally (south-east corner to the west side),
 * so the complex keeps north of it, reaching onto the flat mesa beyond the
 * pad (north and east). Built on a 1 m grid whose cell (0, 0, 0) is the pad centre at pad
 * height: i = east, j = up, k = south.
 */

const R = RUIN_STONE;
/** Darker stone of the corbelled roofs. */
const ROOF = [0x58524b, 0x514c45, 0x5f5850, 0x4c4741];

/** The gallery's outer rectangle (cells). It is three cells deep: outer wall, corridor, inner wall. */
const GA = { i0: -11, i1: 27, k0: -32, k1: -8 };
/** The central tower: centre column, half sizes of platform and cella, rows of the cella's walls. */
const TW = { ci: 8, ck: -20, platform: 5, cella: 4, base: 3, top: 12 };
/** A smaller tower in the court, east of the central one. */
const SMALL = { ci: 20, ck: -20 };
/** The gate pavilion in the south gallery: centre column. */
const GATE = 8;
/** Keep this far (m) from the road's centre line. */
const CLEAR = 4;
/** The gate Buddha's pedestal: foot, block, slab (sandstone). */
const PEDESTAL = [0x8c7c68, 0x9b8a73, 0xa6947c];

export function buildShrine(ctx: MapContext, place: PlaceDef): MapPart {
  const b = new VoxelBuilder();
  const g = b.grid({ cell: 1, origin: [place.x, place.y, place.z], mat: 'mapStone', jitter: 0.04, ao: 0.32, seed: 91 });
  const src = traceSource();

  // Distance to the road (m) from a cell centre.
  const road = ctx.field.paths.flatMap((p) => p.samples).filter((s) => Math.abs(s.x - place.x) < 60 && Math.abs(s.z - place.z) < 60);
  const roadDist = (i: number, k: number) => {
    const [x, z] = [place.x + i + 0.5, place.z + k + 0.5];
    let d = Infinity;
    for (const s of road) d = Math.min(d, Math.hypot(s.x - x, s.z - z));
    return d;
  };

  // The ground (not drawn), for AO and culling under the bottom blocks.
  for (let i = GA.i0 - 8; i <= GA.i1 + 8; i++) for (let k = GA.k0 - 6; k <= GA.k1 + 10; k++) g.ghost(i, -1, k);

  const wall = (i: number, j: number, k: number) => bondTone(R.wall, i, j, k, 3);
  const ledge = (i: number, j: number, k: number) => tone(R.ledge, i, j, k, 4);
  const deep = (i: number, j: number, k: number) => tone(R.deep, i, j, k, 5);
  const put = (i: number, j: number, k: number, color: number, shade = 1) => g.put(i, j, k, { color, mat: 'mapStone', shade });

  // ── Gallery: plinth, two walls with windows, a corbelled roof, fallen in stretches ─
  // Ruin: a smooth field along the walls; low = roof gone, lower = walls down too.
  // The south-west corner, nearest the road, is the most ruined.
  const ruinAt = (i: number, k: number) => valueNoise3(i / 5, 0.5, k / 5, 29) + 0.012 * (i - GA.i0) - 0.01 * (k - GA.k1) - 0.05;
  const { i0, i1, k0, k1 } = GA;
  for (let i = i0 - 1; i <= i1 + 1; i++)
    for (let k = k0 - 1; k <= k1 + 1; k++) {
      const d = Math.min(i - i0, i1 - i, k - k0, k1 - k);
      if (d < -1 || d > 3 || roadDist(i, k) < CLEAR - 0.5) continue;
      const along = d === i - i0 || d === i1 - i ? k : i;
      put(i, 0, k, tone(LATERITE, i >> 1, 0, k >> 1, 6), 0.95);
      // (kept whole where the second fig sits on the south gallery)
      const r = Math.abs(i - (i0 + 6)) <= 3 && k > k1 - 4 ? 1 : ruinAt(i, k);
      const wallTop = r < 0.3 ? 2 : 5;
      if (d === 0 || d === 2)
        for (let j = 1; j <= wallTop; j++) {
          const window = j >= 2 && j <= 4 && along % 3 === 1;
          put(i, j, k, window ? deep(i, j, k) : wall(i, j, k), window ? 0.8 : courseShade(j));
        }
      if (r < 0.42 || wallTop < 5) continue;
      // Corbelled roof: 5 wide over the eaves, 3, then the ridge.
      put(i, 6, k, ledge(i, 6, k));
      if (d >= 0 && d <= 2) put(i, 7, k, tone(ROOF, i, 7, k, 7));
      if (d === 1) put(i, 8, k, tone(ROOF, i, 8, k, 8), 1.05);
    }

  // ── Corner towers: a 5 × 5 pavilion, a tier and a bud; the south-west one has fallen ─
  for (const [ci, ck, fallen] of [
    [i0 + 2, k0 + 2, false],
    [i1 - 2, k0 + 2, false],
    [i1 - 2, k1 - 2, false],
    [i0 + 2, k1 - 2, true],
  ] as const) {
    const top = fallen ? 3 : 9;
    fillBox(g, ci - 2, ci + 2, 1, top, ck - 2, ck + 2, (i, j, k) => (Math.abs(i - ci) === 2 && Math.abs(k - ck) === 2 ? tone(R.dark, i, j, k, 9) : j === top ? ledge(i, j, k) : wall(i, j, k)), 'mapStone', (_i, j) => courseShade(j));
    if (fallen) continue;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      for (let j = 1; j <= 5; j++) put(ci + dx * 2, j, ck + dz * 2, deep(ci, j, ck), 0.8);
    fillBox(g, ci - 1, ci + 1, top + 1, top + 2, ck - 1, ck + 1, (i, j, k) => (j === top + 2 ? ledge(i, j, k) : wall(i, j, k)));
    put(ci, top + 3, ck, tone(R.light, ci, top + 3, ck, 10));
    put(ci, top + 4, ck, tone(R.bright, ci, top + 4, ck, 11));
  }

  // ── Gate pavilion in the south gallery, with stairs down to the road ────
  {
    const [ga, gb] = [k1 - 4, k1 + 2];
    fillBox(g, GATE - 5, GATE + 5, 0, 0, ga, gb, (i, j, k) => tone(LATERITE, i >> 1, j, k >> 1, 6));
    fillBox(g, GATE - 5, GATE + 5, 1, 7, ga, gb, (i, j, k) => (Math.abs(i - GATE) === 5 ? ledge(i, j, k) : wall(i, j, k)), 'mapStone', (_i, j) => courseShade(j));
    // Roof: eaves, a stepped crest, and a small lotus.
    fillBox(g, GATE - 6, GATE + 6, 8, 8, ga - 1, gb + 1, (i, j, k) => (Math.abs(i - GATE) === 6 && (k === ga - 1 || k === gb + 1) ? null : ledge(i, j, k)));
    fillBox(g, GATE - 4, GATE + 4, 9, 9, ga, gb, (i, j, k) => tone(ROOF, i, j, k, 12));
    fillBox(g, GATE - 2, GATE + 2, 10, 11, ga + 1, gb - 1, (i, j, k) => (j === 11 ? ledge(i, j, k) : wall(i, j, k)));
    fillBox(g, GATE - 1, GATE + 1, 12, 12, ga + 2, gb - 2, (i, j, k) => tone(R.light, i, j, k, 13));
    put(GATE, 13, ga + 3, tone(R.bright, GATE, 13, ga + 3, 14));
    // Pediment over the doorway, front and back.
    for (const k of [ga - 1, gb + 1]) {
      fillBox(g, GATE - 2, GATE + 2, 6, 7, k, k, (i, j, kk) => tone(R.light, i, j, kk, 15));
      put(GATE, 8, k, tone(R.light, GATE, 8, k, 16));
    }
    // Passage through, 3 wide and 4 high.
    for (let j = 1; j <= 5; j++) for (let i = GATE - 1; i <= GATE + 1; i++) for (let k = ga - 1; k <= gb + 1; k++) g.delete(i, j, k);
    // Stairs: two steps between low cheek walls.
    for (let i = GATE - 2; i <= GATE + 2; i++) put(i, 0, gb + 1, ledge(i, 0, gb + 1));
    for (const i of [GATE - 3, GATE + 3]) for (let k = gb + 1; k <= gb + 2; k++) put(i, 0, k, wall(i, 0, k));
    for (const i of [GATE - 3, GATE + 3]) put(i, 1, gb + 1, ledge(i, 1, gb + 1));
  }

  // ── Central tower ───────────────────────────────────────────────────────
  const { ci, ck } = TW;
  const P = TW.platform;
  const C = TW.cella;
  const base = TW.base;
  const top = TW.top;
  const sq = (h: number, i: number, k: number) => Math.max(Math.abs(i - ci), Math.abs(k - ck)) === h && Math.abs(i - ci) === Math.abs(k - ck);
  // Platform (laterite), longer to the south for the porch, and its stairs.
  fillBox(g, ci - P, ci + P, 0, base - 1, ck - P, ck + P + 1, (i, j, k) => (j === base - 1 && (Math.abs(i - ci) === P || k === ck - P || k === ck + P + 1) ? ledge(i, j, k) : tone(LATERITE, i >> 1, j, k >> 1, 17)), 'mapStone', (_i, j) => courseShade(j));
  for (let s = 0; s < base - 1; s++) for (let i = ci - 1; i <= ci + 1; i++) for (let jj = 0; jj <= base - 2 - s; jj++) put(i, jj, ck + P + 2 + s, jj === base - 2 - s ? ledge(i, jj, ck) : tone(LATERITE, i, jj, s, 17));
  // Cella: hollow, redented corners, a porch and doorway to the south, false doors elsewhere.
  fillBox(g, ci - C, ci + C, base, top, ck - C, ck + C, (i, j, k) => (Math.abs(i - ci) < C && Math.abs(k - ck) < C && j < top ? null : sq(C, i, k) ? null : j === base + 3 ? ledge(i, j, k) : wall(i, j, k)), 'mapStone', (_i, j) => courseShade(j));
  const pk = ck + C + 1;
  fillBox(g, ci - 2, ci + 2, base, top - 1, pk, pk + 1, (i, j, k) => (Math.abs(i - ci) === 2 ? ledge(i, j, k) : wall(i, j, k)));
  fillBox(g, ci - 2, ci + 2, top, top, pk, pk + 1, (i, j, k) => ledge(i, j, k));
  fillBox(g, ci - 1, ci + 1, top + 1, top + 1, pk + 1, pk + 1, (i, j, k) => wall(i, j, k));
  put(ci, top + 2, pk + 1, tone(R.light, ci, top + 2, pk + 1, 18));
  for (let j = base; j <= base + 3; j++) for (let i = ci - 1; i <= ci + 1; i++) for (let k = ck + C; k <= pk + 1; k++) g.delete(i, j, k);
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, -1],
  ]) {
    const along: [number, number] = [dz === 0 ? 0 : 1, dz === 0 ? 1 : 0];
    for (let a = -2; a <= 2; a++)
      for (let j = base; j <= base + 5; j++) {
        const i = ci + dx * C + along[0] * a;
        const k = ck + dz * C + along[1] * a;
        if (Math.abs(a) <= 1 && j <= base + 4) put(i, j, k, deep(i, j, k), 0.85);
        else put(i + dx, j, k + dz, tone(R.light, i, j, k, 19));
      }
  }
  // Cornice, four tiers with antefixes and a niche per side, a lotus bud.
  fillBox(g, ci - C - 1, ci + C + 1, top + 1, top + 1, ck - C - 1, ck + C + 1, (i, j, k) => (sq(C + 1, i, k) ? null : ledge(i, j, k)));
  let j = top + 2;
  for (const h of [C, C - 1, C - 2, C - 3]) {
    fillBox(g, ci - h, ci + h, j, j + 1, ck - h, ck + h, (i, jj, k) => {
      if (sq(h, i, k)) return null;
      const mid = (i === ci || k === ck) && (Math.abs(i - ci) === h || Math.abs(k - ck) === h);
      return mid && jj === j ? deep(i, jj, k) : jj === j + 1 ? ledge(i, jj, k) : wall(i, jj, k);
    });
    for (const [sx, sz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      put(ci + sx * (h - 1), j + 2, ck + sz * h, tone(R.light, sx, j + 2, sz, 20));
      put(ci + sx * h, j + 2, ck + sz * (h - 1), tone(R.light, sx, j + 2, sz, 21));
    }
    j += 2;
  }
  put(ci, j, ck, tone(R.light, ci, j, ck, 22));
  put(ci, j + 1, ck, tone(R.bright, ci, j + 1, ck, 23));

  // The smaller tower: a laterite platform, a 5 × 5 cella with a dark door, two tiers and a bud.
  {
    const { ci: si, ck: sk } = SMALL;
    fillBox(g, si - 3, si + 3, 0, 1, sk - 3, sk + 3, (i, jj, k) => (jj === 1 ? ledge(i, jj, k) : tone(LATERITE, i, jj, k, 30)));
    fillBox(g, si - 2, si + 2, 2, 7, sk - 2, sk + 2, (i, jj, k) => (Math.abs(i - si) === 2 && Math.abs(k - sk) === 2 ? null : jj === 7 ? ledge(i, jj, k) : wall(i, jj, k)), 'mapStone', (_i, jj) => courseShade(jj));
    for (let jj = 2; jj <= 4; jj++) put(si, jj, sk + 2, deep(si, jj, sk), 0.8);
    for (let jj = 2; jj <= 4; jj++) put(si - 2, jj, sk, deep(si, jj, sk), 0.8);
    fillBox(g, si - 1, si + 1, 8, 9, sk - 1, sk + 1, (i, jj, k) => (jj === 9 ? ledge(i, jj, k) : wall(i, jj, k)));
    put(si, 10, sk, tone(R.light, si, 10, sk, 31));
    put(si, 11, sk, tone(R.bright, si, 11, sk, 32));
  }

  // Collapse: the east side of the tower has come down, ragged.
  const cut = (i: number, k: number) => top + 10.5 - 1.7 * Math.max(0, i - ci) - 0.3 * Math.max(0, k - ck) + (valueNoise3(i / 2, 0, k / 2, 24) - 0.5) * 2.5;
  const gone: [number, number, number][] = [];
  g.forEach((i, jj, k, c) => {
    if (!c.ghost && Math.abs(i - ci) <= C + 2 && Math.abs(k - ck) <= C + 3 && jj >= top - 1 && jj > cut(i, k)) gone.push([i, jj, k]);
  });
  for (const [i, jj, k] of gone) g.delete(i, jj, k);
  // The fallen stones heaped against its east wall, spilling off the platform.
  for (let i = ci + C + 1; i <= ci + P + 3; i++)
    for (let k = ck - C; k <= ck + C; k++) {
      const d = Math.hypot((i - (ci + C)) / 4.5, (k - ck) / 5.5);
      const b0 = Math.abs(i - ci) <= P ? base : 0;
      const h = Math.floor((1 - d) * (base + 4 - b0) + (valueNoise3(i / 2, 1, k / 2, 25) - 0.5) * 2);
      for (let jj = b0; jj < b0 + h; jj++) if (!g.has(i, jj, k)) put(i, jj, k, tone(hash3(i, jj, k, 26) < 0.7 ? R.wall : R.dark, i, jj, k, 27), 0.88 + 0.12 * hash3(i, jj, k, 28));
    }

  // ── Weathering and moss ─────────────────────────────────────────────────
  chip(g, { seed: 31, corner: 0.22, edge: 0.05 });
  overgrow(g, {
    seed: 33,
    top: (_i, jj) => (jj < 1 ? 0.4 : jj < 5 ? 0.6 : 0.42),
    side: (_i, jj) => (jj < 3 ? 0.3 : 0.14),
    vines: 0.05,
    vineLen: [2, 6],
    cushion: 0.2,
    moss: R.moss,
  });

  // ── Strangler fig on the central tower's north-west top ─────────────────
  const fig = { i: ci - C + 1, k: ck - C + 1, j: top + 4 };
  for (let jj = fig.j - 2; jj <= fig.j + 6; jj++) {
    const lean = Math.max(0, Math.floor((jj - fig.j) / 3));
    const r = jj <= fig.j ? 1 : 0;
    for (let di = -r; di <= 1 + r; di++)
      for (let dk = -r; dk <= 1 + r; dk++) {
        const [i, k] = [fig.i + di - lean, fig.k + dk - lean];
        g.put(i, jj, k, { color: pickOf(FIG_BARK, i, jj, k, 35), mat: 'mapBark', shade: 0.9 + 0.1 * hash3(i, jj, k, 36) });
      }
  }
  const roots: [[number, number], [number, number], number][] = [
    [[fig.i - 2, fig.k], [-1, 0], 4],
    [[fig.i, fig.k - 2], [0, -1], 4],
    [[fig.i - 2, fig.k + 2], [-1, 0], 3],
    [[fig.i + 2, fig.k - 2], [0, -1], 3],
    [[fig.i - 2, fig.k + 3], [0, 1], 3],
    [[fig.i + 3, fig.k - 2], [1, 0], 2],
    [[fig.i - 2, fig.k - 2], [-1, 0], 2],
    [[fig.i - 1, fig.k + 3], [0, 1], 2],
  ];
  roots.forEach(([[i, k], dir, thick], n) => drapeRoot(g, [i, fig.j - 1, k], dir, { floor: 0, seed: 40 + n, thick, crawl: 2 + (n % 4) }));
  const crown: [number, number, number] = [fig.i - 3, fig.j + 7, fig.k - 3];
  const tt: [number, number, number] = [fig.i - 2, fig.j + 6, fig.k - 2];
  limb(g, tt, [crown[0] - 6, crown[1] + 1, crown[2] + 1], { seed: 38, thick: 2 });
  limb(g, tt, [crown[0] + 2, crown[1] + 2, crown[2] - 6], { seed: 39, thick: 2 });
  limb(g, tt, [ci + 3, crown[1], ck + 1], { seed: 41 });
  growTree(g, crown[0], crown[1] - 1, crown[2], { trunk: 1, radius: 7, squash: 0.45, seed: 37, bark: FIG_BARK, leaf: CANOPY });

  // ── A second fig on the south gallery's roof, roots down both its faces ─
  {
    const f2 = { i: i0 + 6, k: k1 - 2, j: 8 };
    for (let jj = f2.j; jj <= f2.j + 6; jj++)
      for (let di = 0; di <= 1; di++)
        for (let dk = 0; dk <= 1; dk++) g.put(f2.i + di - (jj > f2.j + 3 ? 1 : 0), jj, f2.k + dk, { color: pickOf(FIG_BARK, f2.i + di, jj, f2.k + dk, 45), mat: 'mapBark', shade: 0.92 });
    const r2: [[number, number], [number, number], number][] = [
      [[f2.i, f2.k + 2], [0, 1], 3],
      [[f2.i + 1, f2.k + 2], [0, 1], 2],
      [[f2.i - 1, f2.k + 1], [0, 1], 2],
      [[f2.i, f2.k - 1], [0, -1], 3],
      [[f2.i + 2, f2.k], [1, 0], 2],
      [[f2.i - 1, f2.k], [-1, 0], 2],
    ];
    r2.forEach(([[i, k], dir, thick], n) => drapeRoot(g, [i, f2.j, k], dir, { floor: 0, seed: 60 + n, thick, crawl: 2 + (n % 3) }));
    growTree(g, f2.i - 1, f2.j + 7, f2.k - 1, { trunk: 1, radius: 4.2, squash: 0.55, seed: 47, bark: FIG_BARK, leaf: CANOPY, lean: [-1, -2] });
  }

  // Young trees and bushes in the court and round the outside (north and west, clear of the view).
  growTree(g, i0 + 5, 0, k0 + 5, { trunk: 4, radius: 2.5, seed: 51 });
  growTree(g, i1 - 5, 0, k0 + 6, { trunk: 5, radius: 3, seed: 52 });
  growTree(g, i0 - 4, 0, k0 + 10, { trunk: 7, radius: 3.5, seed: 53, lean: [-1, 0] });
  growTree(g, i1 + 5, 0, k0 + 4, { trunk: 8, radius: 4, seed: 54, lean: [1, -1] });
  for (const [i, k, r, s] of [
    [i0 + 5, k1 - 5, 1.6, 55],
    [i1 - 5, k1 - 6, 1.5, 56],
    [i1 + 3, k1 - 2, 2, 57],
    [i0 - 3, k1 - 4, 1.8, 58],
    [ci - 7, ck - 2, 1.4, 59],
  ] as const)
    if (roadDist(i, k) > CLEAR) growTree(g, i, 0, k, { trunk: 1, radius: r, seed: s, squash: 0.8 });

  // The way from the gate to the tower's door kept by the people: no moss cushions or vines where
  // the explorer walks and kneels by the Buddha, the tower's steps behind him swept to bare stone
  // (the floor: the passage's row 0, the platform's first step, its top).
  for (let k = ck + C; k <= k1 + 3; k++) {
    const floor = k <= ck + P + 1 ? base - 1 : k === ck + P + 2 ? base - 2 : 0;
    for (let i = GATE - 1; i <= GATE + 1; i++)
      for (let j = 0; j <= 6; j++) {
        const c = g.get(i, j, k);
        if (!c || (c.mat !== 'mapGrass' && c.mat !== 'mapLeaf')) continue;
        if (j > floor) g.delete(i, j, k);
        else if (k <= k1 - 5) put(i, j, k, j === floor ? ledge(i, j, k) : tone(LATERITE, i, j, k, 17));
      }
  }

  g.commit();

  // Tumbled blocks, turned every which way, off the heap and the fallen corner.
  const toss = (x: number, z: number, n: number, spread: number, seed: number) => {
    for (let t = 0; t < n; t++) {
      const [bi, bk] = [x + (hash3(t, 1, seed, 60) - 0.5) * spread * 2, z + (hash3(t, 2, seed, 60) - 0.5) * spread * 2];
      const [ii, kk] = [Math.floor(bi), Math.floor(bk)];
      if (roadDist(ii, kk) < CLEAR) continue;
      let ground = 0;
      while (ground < 10 && g.has(ii, ground, kk)) ground++;
      const [sx, sy, sz] = [0.8 + hash3(t, 3, seed, 60) * 0.7, 0.6 + hash3(t, 4, seed, 60) * 0.4, 0.8 + hash3(t, 5, seed, 60) * 0.9];
      b.box(place.x + bi, place.y + ground + sy * 0.4, place.z + bk, sx, sy, sz, pickOf(R.wall, t, seed, 0, 61), 'mapStone', {
        src,
        shade: 0.85 + hash3(t, 6, seed, 60) * 0.15,
        rx: (hash3(t, 7, seed, 60) - 0.5) * 0.5,
        ry: hash3(t, 8, seed, 60) * Math.PI,
        rz: (hash3(t, 9, seed, 60) - 0.5) * 0.5,
      });
    }
  };
  toss(ci + P + 2, ck, 10, 2.5, 1);
  toss(i0 + 1, k1 + 1, 10, 3.5, 2);
  toss(i1 + 2, k1 - 8, 5, 2, 3);
  toss(GATE + 5, k1 + 4, 4, 2, 4);

  // (a few metres of clearing round it, so the jungle does not swallow the galleries)
  ctx.field.occupy(place.x + i0 - 3, place.z + k0 - 4, place.x + i1 + 6, place.z + k1 + 6);

  // ── The Buddha in the gate's passage; its candles glow at night ─────────
  const sacred = new SacredSet('shrine');
  const hidden = new VoxelBuilder();
  const glow = new AltarGlow({ seed: 7, scale: 1.3, halo: { off: [0, 0.3, 0.5], size: 2.4 } });
  gateShrine(b, hidden, sacred, glow, place);

  const object = new Group();
  object.name = `landmark:${place.id}`;
  object.add(buildVoxelMesh(b, { quality: 'medium', name: `landmark:${place.id}` }), glow.object, sacred.object, hiddenSolid(hidden, `landmark:${place.id}-solid`));
  return {
    name: `landmark:${place.id}`,
    object,
    blocks: b.boxes.length,
    update: (f: MapFrame) => {
      glow.update(f);
      sacred.update(f);
    },
  };
}

/**
 * The people's Buddha in the gate's passage (3 m wide, at the pavilion's
 * middle): a small sandstone Buddha, a saffron cloth over his shoulder, on
 * an old sandstone block as wide as his throne, the way through open a
 * metre either side; candles and incense on the step before him (a
 * saffron cloth over it), lotus on the floor, a marigold garland. World
 * metres (the gate's axis x = `place.x + GATE + 0.5`); `glow` lights its
 * candles.
 */
function gateShrine(b: VoxelBuilder, hidden: VoxelBuilder, sacred: SacredSet, glow: AltarGlow, place: PlaceDef): void {
  const src = traceSource();
  const x = place.x + GATE + 0.5;
  const F = place.y + 1;
  const zb = place.z + GA.k1 - 2.45;
  const top = F + 0.75;
  const span = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, shade = 1) => b.span(x + x0, y0, zb + z0, x + x1, y1, zb + z1, color, 'mapStone', { src, shade });
  // (an old block of paler sandstone than the ruin's walls, so it shows in the passage's shade)
  span(-0.5, F, -0.48, 0.5, F + 0.12, 0.48, PEDESTAL[0], 0.92);
  span(-0.45, F + 0.12, -0.43, 0.45, top - 0.08, 0.43, PEDESTAL[1]);
  span(-0.49, top - 0.08, -0.47, 0.49, top, 0.47, PEDESTAL[2], 1.04);
  span(-0.45, F, 0.47, 0.45, F + 0.3, 0.87, PEDESTAL[0], 0.97);
  const stepTop = stepCloth(b, src, x, 0.42, zb + 0.49, zb + 0.87, F + 0.3, F, 0xc2701c);
  // Hidden: the statue, the step and the lotus before it (he walks round it, never climbs up).
  hidden.span(x - 0.5, F, zb - 0.5, x + 0.5, F + 3, zb + 1.2, 0x808080, 'mapStone', { src });

  const low = stepTop - top;
  const shrine: ShrineSpec = {
    at: [x, top, zb],
    buddha: { kind: 'shrine', look: 'sandstone', height: 1.15 },
    scale: 1.3,
    offerings: [
      { kind: 'candle', at: [-0.27, low, 0.72] },
      { kind: 'incense', at: [0, low, 0.66] },
      { kind: 'candle', at: [0.27, low, 0.72] },
      { kind: 'lotusVase', at: [-0.28, F - top, 1.05], turn: 0.8 },
      { kind: 'lotusVase', at: [0.28, F - top, 1.05], turn: -0.8 },
      { kind: 'marigold', at: [0, -0.02, 0.48], opts: { from: [-0.48, 0, 0], to: [0.48, 0, 0], sag: 0.1, seed: 2 } },
    ],
  };
  peoplesShrine(sacred, shrine, glow);
}
