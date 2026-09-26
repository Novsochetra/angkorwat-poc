import { Group } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { hash3, valueNoise3 } from '../../voxel/random';
import { VoxelBuilder, type VoxelGrid } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import type { PlaceDef } from '../layout';
import { SacredSet } from '../sacred/set';
import type { MapContext, MapFrame, MapPart } from '../types';
import { BAYON_STONE, bondTone, buildFaceTower, courseShade, FACE_LARGE, FACE_SMALL, FACE_TINY, fillBox, SIDE_AXES, tone, type FaceTower, type Side } from './_faces';
import { CandleGlow, chip, growTree, overgrow } from './_ruin';
import { AltarGlow, hiddenSolid, peoplesShrine, stepCloth, type ShrineSpec } from './_sanctuaryShrine';

/**
 * Bayon — "The Stone Faces", on the western cliffs: a tight cluster of face
 * towers of dark grey weathered stone on a raised terrace. A tall central
 * tower stands in the middle, smaller towers packed round it, every tower
 * with a calm face on each side and a lotus bud on top. The biggest faces
 * (the central tower's south and east ones) look at the overview camera
 * down a clear line: the smaller towers stand beside and behind it, not in
 * front. A low parapet runs along the terrace's front edges; moss sits on
 * the ledges, vines hang, and small trees have taken root on the towers.
 * Through the central tower's south door, in its sanctum, the people keep a
 * naga Buddha of sandstone (the Bayon's own Buddha was one), a saffron cloth
 * over his shoulder, candles, incense and lotus before him, two gold
 * parasols (`sanctum`); the explorer kneels in the doorway (roam/_worship.ts).
 *
 * Built on a 1 m grid whose cell (0, 0, 0) is the pad centre at pad height:
 * i = east, j = up, k = south (metres from the centre).
 */

const T = BAYON_STONE;
/** Terrace paving: 2 m slabs, a little lighter than the walls. */
const PAVING = [0x847c70, 0x7c756a, 0x8b8377, 0x797166];

/** Terrace: extent (cells) and height (rows 0‥TH-1; the towers stand on row TH). */
const TER = { i0: -28, i1: 28, k0: -28, k1: 20 };
const TH = 3;

const ALL: Side[] = ['S', 'E', 'N', 'W'];

/**
 * The towers. The central one's faces sit high (a tall body on a three-step
 * plinth), above the ring. Sides that face a close neighbour get no face
 * (it would run into the neighbour's).
 */
const TOWERS: (Omit<FaceTower, 'j0' | 'tones' | 'seed'> & { name: string })[] = [
  { name: 'central', ci: -2, ck: -6, half: 8, face: FACE_LARGE, faces: ALL, plinth: 3, plinthOut: 3, body: 9, tiers: 6, tierH: 2, porch: 'S' },
  { name: 'south-west', ci: -19, ck: 12, half: 5, face: FACE_SMALL, faces: ALL, plinth: 2, plinthOut: 2, body: 5, tiers: 3, tierH: 2, porch: 'S' },
  { name: 'west', ci: -22, ck: -6, half: 4, face: FACE_TINY, faces: ALL, plinth: 2, plinthOut: 2, body: 10, tiers: 2, tierH: 2 },
  { name: 'north-west', ci: -21, ck: -21, half: 4, face: FACE_TINY, faces: ALL, plinth: 2, plinthOut: 2, body: 13, tiers: 2, tierH: 2 },
  { name: 'north-east', ci: 14, ck: -21, half: 5, face: FACE_SMALL, faces: ['N', 'E'], plinth: 2, plinthOut: 2, body: 10, tiers: 3, tierH: 2 },
  { name: 'east', ci: 22, ck: -9, half: 4, face: FACE_TINY, faces: ['S', 'E', 'W'], plinth: 2, plinthOut: 2, body: 4, tiers: 2, tierH: 2, porch: 'S' },
];

export function buildOverlook(ctx: MapContext, place: PlaceDef): MapPart {
  const b = new VoxelBuilder();
  const g = b.grid({ cell: 1, origin: [place.x, place.y, place.z], mat: 'mapStone', jitter: 0.03, ao: 0.3, seed: 41 });
  const keep = new Set<string>();

  // The ground under everything (not drawn): bottom blocks get their AO and are culled underneath.
  for (let i = TER.i0 - 3; i <= TER.i1 + 3; i++) for (let k = TER.k0 - 3; k <= TER.k1 + 4; k++) g.ghost(i, -1, k);

  // ── Terrace ─────────────────────────────────────────────────────────────
  const { i0, i1, k0, k1 } = TER;
  // A 1 m step all round, then the terrace wall with a lighter coping.
  fillBox(g, i0 - 1, i1 + 1, 0, TH - 2, k0 - 1, k1 + 1, (i, j, k) => bondTone(T.wall, i, j, k, 3), 'mapStone', (_i, j) => courseShade(j) * 0.96);
  fillBox(
    g,
    i0,
    i1,
    0,
    TH - 1,
    k0,
    k1,
    (i, j, k) => {
      const edge = i === i0 || i === i1 || k === k0 || k === k1;
      if (j < TH - 1) return bondTone(T.wall, i, j, k, 4);
      if (edge) return tone(T.ledge, i, j, k, 5);
      return tone(PAVING, i >> 1, 0, k >> 1, 6);
    },
    'mapStone',
    (i, j, k) => (j === TH - 1 ? 0.96 + 0.08 * hash3(i >> 1, 7, k >> 1, 8) : courseShade(j)),
  );
  // Front stairs down to the road's end (south), with low cheek walls.
  for (let i = -3; i <= 3; i++) {
    g.put(i, 0, k1 + 2, { color: tone(T.ledge, i, 0, k1 + 2, 9), mat: 'mapStone' });
    g.put(i, TH - 2, k1 + 1, { color: tone(T.ledge, i, 1, k1 + 1, 9), mat: 'mapStone' });
  }
  for (const i of [-4, 4]) for (let k = k1 + 1; k <= k1 + 2; k++) for (let j = 0; j <= TH - 1; j++) g.put(i, j, k, { color: bondTone(T.wall, i, j, k, 10), mat: 'mapStone', shade: courseShade(j) });

  // ── Towers ──────────────────────────────────────────────────────────────
  const built = TOWERS.map((t, n) => buildFaceTower(g, { ...t, j0: TH, tones: T, seed: 11 + n * 12 }, keep));
  const [central, southWest, west, northWest, northEast, east] = built;

  // ── Weathering (before the parapet: it breaks in stretches, not block by block) ─
  chip(g, { seed: 57, corner: 0.22, edge: 0.04, keep, from: TH });
  chip(g, { seed: 58, corner: 0.12, edge: 0.02 });

  // ── Parapet along the terrace's south and east edges, broken here and there ─
  const fallen: [number, number][] = [];
  const parapet = (i: number, k: number, n: number, inward: [number, number]) => {
    if (g.has(i, TH, k) || (k === k1 && Math.abs(i) <= 4)) return;
    const gap = valueNoise3(n / 3.2, 0, 0, 51);
    if (gap < 0.3) {
      // A fallen stretch: now and then its stone lies on the terrace behind.
      if (hash3(i, 0, k, 52) < 0.3) fallen.push([i + inward[0] * (1 + (n % 2)), k + inward[1] * (1 + (n % 2))]);
      return;
    }
    g.put(i, TH, k, { color: bondTone(T.wall, i, TH, k, 12), mat: 'mapStone', shade: 0.97 });
    // Posts every 4 m, a coping on the ones still standing tall.
    if (n % 4 === 0) {
      g.put(i, TH + 1, k, { color: tone(T.ledge, i, TH + 1, k, 13), mat: 'mapStone' });
      if (gap > 0.42) g.put(i, TH + 2, k, { color: tone(T.light, i, TH + 2, k, 13), mat: 'mapStone' });
    }
  };
  for (let i = i0; i <= i1; i++) parapet(i, k1, i - i0, [0, -1]);
  for (let k = k0 + 4; k < k1; k++) parapet(i1, k, 200 + k, [-1, 0]);
  for (const [i, k] of fallen) if (!g.has(i, TH, k)) g.put(i, TH, k, { color: bondTone(T.wall, i, TH, k, 14), mat: 'mapStone', shade: 0.9 });

  // Gate pavilion over the stair head: a doorway through, a stepped
  // pediment, a small tier and a lotus bud (low enough to leave the central
  // tower's faces in view).
  {
    const [ga, gb] = [k1 - 4, k1];
    fillBox(g, -4, 4, TH, TH + 5, ga, gb, (i, j, k) => (Math.abs(i) === 4 && (k === ga || k === gb) ? tone(T.dark, i, j, k, 17) : bondTone(T.wall, i, j, k, 17)), 'mapStone', (_i, j) => courseShade(j));
    fillBox(g, -5, 5, TH + 6, TH + 6, ga - 1, gb + 1, (i, j, k) => (Math.abs(i) === 5 && (k === ga - 1 || k === gb + 1) ? null : tone(T.ledge, i, j, k, 18)));
    fillBox(g, -3, 3, TH + 7, TH + 8, ga, gb, (i, j, k) => (j === TH + 8 ? tone(T.ledge, i, j, k, 19) : bondTone(T.wall, i, j, k, 19)));
    fillBox(g, -2, 2, TH + 9, TH + 10, ga + 1, gb - 1, (i, j, k) => (j === TH + 10 ? tone(T.ledge, i, j, k, 20) : bondTone(T.wall, i, j, k, 20)));
    fillBox(g, -1, 1, TH + 11, TH + 12, ga + 1, gb - 1, (i, j, k) => (j === TH + 12 && i !== 0 ? null : tone(T.light, i, j, k, 21)));
    g.put(0, TH + 13, ga + 2, { color: tone(T.bright, 0, TH + 13, 0, 22), mat: 'mapStone' });
    // Pediments front and back, and the passage through.
    for (const k of [ga - 1, gb + 1]) {
      fillBox(g, -2, 2, TH + 4, TH + 5, k, k, (i, j, kk) => tone(T.light, i, j, kk, 23));
      g.put(0, TH + 6, k, { color: tone(T.light, 0, TH + 6, k, 24), mat: 'mapStone' });
    }
    for (let j = TH; j <= TH + 3; j++) for (let i = -1; i <= 1; i++) for (let k = ga - 1; k <= gb + 1; k++) g.delete(i, j, k);
  }

  // Guardian lions either side of the stair head: seated blocks, a lighter head.
  for (const s of [-1, 1]) {
    const li = s * 6;
    fillBox(g, li, li + s, TH, TH, k1 - 2, k1 - 1, (i, j, k) => tone(T.wall, i, j, k, 15));
    fillBox(g, li, li + s, TH + 1, TH + 1, k1 - 2, k1 - 2, (i, j, k) => tone(T.mid, i, j, k, 15));
    g.put(li, TH + 1, k1 - 1, { color: tone(T.light, li, TH + 1, k1 - 1, 15), mat: 'mapStone' });
    g.put(li, TH + 2, k1 - 1, { color: tone(T.light, li, TH + 2, k1 - 1, 16), mat: 'mapStone' });
  }

  // ── Moss, vines, and trees growing from the stones ──────────────────────
  overgrow(g, {
    seed: 61,
    keep,
    // Tops: ledges and tiers get the most; the terrace floor in patches.
    top: (_i, j) => (j < TH ? 0.18 : j <= TH + 1 ? 0.3 : j < 30 ? 0.55 : 0.3),
    side: (_i, j) => (j < TH + 4 ? 0.14 : 0.05),
    vines: 0.035,
    vineLen: [2, 7],
    cushion: 0.25,
    moss: T.moss,
  });
  // Small trees on the tier ledges, beside a corner pinnacle (lips: SE, NE, SW, NW per tier).
  const lipTree = (lip: [number, number, number] | undefined, towerI: number, trunk: number, radius: number, seed: number) => {
    if (lip) growTree(g, lip[0] - Math.sign(lip[0] - towerI), lip[1] + 1, lip[2], { trunk, radius, seed, squash: 0.7 });
  };
  lipTree(central.lips[2], TOWERS[0].ci, 3, 2.2, 71); // first tier, south-west
  lipTree(central.lips[5], TOWERS[0].ci, 2, 1.8, 72); // second tier, north-east
  lipTree(northEast.lips[1], TOWERS[4].ci, 2, 1.6, 73);
  lipTree(west.lips[3], TOWERS[2].ci, 2, 1.8, 74);
  lipTree(northWest.lips[0], TOWERS[3].ci, 3, 2, 75);
  // Big trees on the terrace's back corners and west side, their crowns among the towers
  // (the vegetation pass keeps off the pad).
  growTree(g, -26, TH, -15, { trunk: 10, radius: 5, seed: 81, thick: true, lean: [-1, 0] });
  growTree(g, 27, TH, -25, { trunk: 11, radius: 5, seed: 82, thick: true, lean: [1, -1] });
  growTree(g, 4, TH, -26, { trunk: 9, radius: 4.5, seed: 83, lean: [0, -1] });
  growTree(g, 29, 0, 16, { trunk: 5, radius: 3, seed: 84, lean: [1, 0] });
  growTree(g, -29, 0, 18, { trunk: 6, radius: 3.5, seed: 85, lean: [-1, 1] });

  // ── The central sanctum, its Buddha, and the doorway kept clear to kneel in ─
  const sacred = new SacredSet('overlook');
  const hidden = new VoxelBuilder();
  const shrineGlow = new AltarGlow({ seed: 3, scale: 1.3, halo: { off: [0, 0.3, 0.4], size: 3 } });
  if (central.door) sanctum(b, g, hidden, sacred, shrineGlow, place, central.door);

  g.commit();
  ctx.field.occupy(place.x + i0 - 2, place.z + k0 - 2, place.x + i1 + 2, place.z + k1 + 3);

  // ── Night: candles in the doorways of the other towers with a porch ─────
  const candles: [number, number, number][] = [];
  const halos: { at: [number, number, number]; size: number }[] = [];
  for (const t of [southWest, east]) {
    if (!t.door) continue;
    const [i, j, k] = t.door;
    const n = SIDE_AXES.S;
    const [x, y, z] = [place.x + i + 0.5 - n.nx * 0.2, place.y + j + 0.22, place.z + k + 0.5 - n.nz * 0.2];
    candles.push([x - 0.5, y, z], [x + 0.4, y, z]);
    halos.push({ at: [x, y + 1.2, z + 0.8], size: 4 });
  }
  const glow = new CandleGlow(candles, halos, { day: 0.15, night: 1.6, halo: 0.35, seed: 3 });

  const object = new Group();
  object.name = `landmark:${place.id}`;
  object.add(buildVoxelMesh(b, { quality: 'medium', name: `landmark:${place.id}` }), glow.object, shrineGlow.object, sacred.object, hiddenSolid(hidden, `landmark:${place.id}-solid`));
  return {
    name: `landmark:${place.id}`,
    object,
    blocks: b.boxes.length,
    update: (f: MapFrame) => {
      glow.update(f);
      shrineGlow.update(f);
      sacred.update(f);
    },
  };
}

/**
 * The central tower's sanctum behind its south door (`door`: the doorway's
 * floor cell at its back wall): a chamber 5 wide, 3 deep and 5 high cut
 * into the tower, lined in shadowed stone; on a sandstone pedestal the
 * naga Buddha faces the door, candles, incense and lotus on the step
 * before him (a red cloth over it), bay sei on the floor either side, two
 * gold parasols behind. The doorway is swept clear (no moss cushions) so
 * the explorer kneels flat there. Grid cells are the overlook's (1 m,
 * `place` at the pad's centre); the pedestal and pieces are in world
 * metres; `glow` lights its candles.
 */
function sanctum(b: VoxelBuilder, g: VoxelGrid, hidden: VoxelBuilder, sacred: SacredSet, glow: AltarGlow, place: PlaceDef, door: [number, number, number]): void {
  const src = traceSource();
  const [di, jb, dk] = door;
  // The chamber: cells di − 2 ‥ di + 2 across, dk − 3 ‥ dk − 1 deep, rows jb ‥ jb + 4.
  const [ci0, ci1, ck0, ck1, top] = [di - 2, di + 2, dk - 3, dk - 1, jb + 4];
  const dim = (i: number, j: number, k: number) => ({ color: tone(T.shadow, i, j, k, 90), mat: 'mapStone' as const, shade: 0.8 + 0.1 * hash3(i, j, k, 91) });
  for (let i = ci0 - 1; i <= ci1 + 1; i++)
    for (let k = ck0 - 1; k <= ck1; k++)
      for (let j = jb - 1; j <= top + 1; j++) {
        const inside = i >= ci0 && i <= ci1 && k >= ck0 && j >= jb && j <= top;
        if (inside) g.delete(i, j, k);
        else if (j === jb - 1) g.put(i, j, k, { color: tone(PAVING, i, 0, k, 92), mat: 'mapStone', shade: 0.85 });
        else g.put(i, j, k, dim(i, j, k));
      }
  // Its inside edges and corners sealed with thin strips (the rounded blocks leave a notch there,
  // and the tower behind is hollow: the sky would show through).
  {
    const [x0, x1, z0, z1, y0, y1] = [place.x + ci0, place.x + ci1 + 1, place.z + ck0, place.z + ck1 + 1, place.y + jb, place.y + top + 1];
    const e = 0.08;
    const seal = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => b.span(ax - e, ay - e, az - e, bx + e, by + e, bz + e, tone(T.shadow, ax, ay, az, 95), 'mapStone', { src, shade: 0.8 });
    for (const x of [x0, x1]) for (const z of [z0, z1]) seal(x, y0, z, x, y1, z);
    for (const y of [y0, y1]) {
      for (const z of [z0, z1]) seal(x0, y, z, x1, y, z);
      for (const x of [x0, x1]) seal(x, y, z0, x, y, z1);
    }
  }
  // The doorway: nothing standing on its floor (moss cushions, vines), the floor bare stone.
  for (let i = di - 1; i <= di + 1; i++)
    for (let k = dk; k <= dk + 3; k++) {
      for (let j = jb; j < jb + 4; j++) g.delete(i, j, k);
      g.put(i, jb - 1, k, { color: tone(T.ledge, i, jb - 1, k, 93), mat: 'mapStone' });
    }

  // The pedestal (world metres): a moulded base, the block, a slab; the offering step before it.
  const x = place.x + di + 0.5;
  const F = place.y + jb;
  const zb = place.z + ck0 + 1.15;
  const pTop = F + 0.55;
  const stone = (list: readonly number[], n: number) => tone(list, n, 7, 3, 94);
  const span = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, shade = 1) => b.span(x + x0, y0, zb + z0, x + x1, y1, zb + z1, color, 'mapStone', { src, shade });
  span(-0.74, F, -0.64, 0.74, F + 0.12, 0.64, stone(T.ledge, 1), 0.92);
  span(-0.68, F + 0.12, -0.58, 0.68, pTop - 0.08, 0.58, stone(T.light, 2));
  span(-0.72, pTop - 0.08, -0.62, 0.72, pTop, 0.62, stone(T.ledge, 3));
  const stepTop = stepCloth(b, src, x, 0.74, zb + 0.6, zb + 1.08, F + 0.28, F, 0x8a2419);
  span(-0.8, F, 0.58, 0.8, F + 0.28, 1.08, stone(T.ledge, 4), 0.95);
  // Hidden: the sanctum from the step's front back, wall to wall (he kneels in the doorway,
  // never climbs the pedestal or walks in among the parasols).
  hidden.span(place.x + ci0, F, place.z + ck0, place.x + ci1 + 1, F + 3, zb + 1.08, 0x808080, 'mapStone', { src });

  const low = stepTop - pTop;
  const front = 0.83;
  const shrine: ShrineSpec = {
    at: [x, pTop, zb],
    buddha: { kind: 'nagaSash', look: 'sandstone', height: 1.6 },
    scale: 1.3,
    offerings: [
      { kind: 'lotusVase', at: [-0.54, low, front], turn: 0.8 },
      { kind: 'candle', at: [-0.22, low, front + 0.08] },
      { kind: 'incense', at: [0, low, front], opts: { sticks: 9 } },
      { kind: 'candle', at: [0.22, low, front + 0.08] },
      { kind: 'lotusVase', at: [0.54, low, front], turn: -0.8 },
      { kind: 'marigold', at: [0, -0.02, 0.63], opts: { from: [-0.7, 0, 0], to: [0.7, 0, 0], sag: 0.13, seed: 4 } },
      { kind: 'baySei', at: [-1.05, F - pTop, 0.75] },
      { kind: 'baySei', at: [1.05, F - pTop, 0.75], turn: 1.3 },
      { kind: 'parasol', at: [-1.12, F - pTop, -0.35], opts: { height: 2.3, look: 'gold' } },
      { kind: 'parasol', at: [1.12, F - pTop, -0.35], opts: { height: 2.3, look: 'gold' } },
    ],
  };
  peoplesShrine(sacred, shrine, glow);
}
