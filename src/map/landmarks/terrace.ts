import { Group } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { hash3, valueNoise3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import type { PlaceDef } from '../layout';
import type { MapContext, MapFrame, MapPart } from '../types';
import { bondTone, courseShade, tone } from './_faces';
import { buddhaStatue } from '../sacred/buddha';
import { stupa } from '../sacred/stupa';
import { FLOWER_ORANGE, FLOWER_PINK, gardenTree, GRASS, LEAF, Mason, pick, type Tones } from './_prasat';
import { Frame, grassOverPad, Lamps, Pools, Shrines } from './_prasatKit';
import { giantTree } from './_prasatTrees';
import { chip, overgrow } from './_ruin';

/**
 * Ta Prohm — "The Lost Gardens": a jungle temple swallowed by giant trees,
 * in a setting of garden pools on the eastern hills.
 *
 * The garden road comes up to the pad from the west and leaves it to the
 * north-east, so it makes a corner (the place's beacon) south of the pad.
 * The temple stands inside that corner, north of the pad where it opens
 * wide, and faces south down a causeway to the beacon between two lotus
 * basins. On a laterite platform: a long gallery of dark mossy stone
 * (pillars along the front, windows round the rest, corbelled roofs fallen
 * in on the west and north), a tower on each corner (the north-west one a
 * stump) and a gate pavilion over a stair in the middle of the front.
 * Inside, a storey up, a court with its own gallery, a small tower on each
 * corner and the central tower: a big stepped lotus bud, green with moss.
 * Giant silk-cotton and fig trees stand on the galleries and beside them,
 * roots pouring down the walls, their crowns beside and behind the central
 * tower. Across the road a raised garden with a long pool, flower beds and
 * small stupas; south-west of the pad an open meadow with a lotus pool, so
 * the overview sees the temple. At night lanterns, the gate and a few
 * gallery windows glow.
 *
 * People still pray here: in the gate's passage an old sandstone Buddha
 * wrapped in a saffron cloth sits on a stone altar with candles, incense
 * and lotus (the passage is walled up behind him); the garden's stupas are
 * sculpted in weathered stone, offerings at the foot of the one by the
 * road (sacred/, `Shrines`; the worship spots are roam/_worship.ts).
 *
 * Built on a 1 m grid whose cell (0, 0, 0) is the pad centre at pad height:
 * i = east, j = up, k = south. Where the eye lands the edges are finer, on
 * a 0.5 m grid (`d`): the towers' cornices with antefixes on their corners,
 * the lotus buds, the door frames and pediments, loose stones on the broken
 * walls, and the roots pouring down the walls.
 */

/**
 * Ta Prohm's stone: dark, cool grey sandstone, stained green-grey — darker
 * than the other temples. (A touch of violet: the map's warm light turns it
 * the picture's grey-brown, and its shadows stay cool.)
 */
const TP = {
  wall: [0x55525a, 0x4f4c54, 0x5b5860, 0x4a474f],
  ledge: [0x736e72, 0x6b666a, 0x7a7478],
  light: [0x857f80, 0x7c7678, 0x8c8687],
  dark: [0x3d3a42, 0x37343c, 0x423f47],
  deep: [0x121116, 0x16141a, 0x0f0e13],
  roof: [0x4d4a51, 0x47444b, 0x534f56, 0x423f46],
  /** Lichen and damp: green-grey patches on the walls. */
  stain: [0x4c5347, 0x474e42, 0x51584b],
  /** Moss: dark olive, a little lighter where it catches the sun. */
  moss: [0x3d5426, 0x46602b, 0x354a21, 0x4f6a30, 0x2f4120],
  /** Laterite of the platforms. */
  base: [0x5e4e44, 0x56473e, 0x66554a, 0x4f423a],
};
/** Bushes on the stone: the jungle's dark greens, and their sunlit tips. */
const BUSH = [0x2f4f1f, 0x365a22, 0x29451a, 0x3c6226];
const BUSH_TOP = [0x5a8a2e, 0x679a34, 0x4e7d29];

/**
 * The temple's axis (column) and middle row: the central tower stands there.
 * North of the pad, where the road's corner opens wide enough for the long
 * front gallery.
 */
const AX = -17;
const CK = -24;
/** Outer gallery: half sizes round the middle. Three cells deep: outer wall, corridor, inner wall. */
const GAL = { hi: 23, hk: 15 };
/** The raised inner court round the central tower: half sizes. */
const INNER = { hi: 17, hk: 11 };
/** Keep this far (m) from the road's centre line. */
const CLEAR = 4.5;
/** The garden stupas: their height, and their stone plinths' side (m; their middles are in the garden code). */
const STUPA = { height: 4.2, plinth: 3 };
/** The Buddha in the gate's passage: his height (m, the explorer's world is 1.4 × true size). */
const BUDDHA = 1.5;
const ROAD = 'garden and mountain road';

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Inside a square of half size `h` whose corners step in `s` times (the Khmer redented plan)? */
const redented = (di: number, dk: number, h: number, s: number): boolean => {
  const a = Math.abs(di);
  const c = Math.abs(dk);
  return a <= h && c <= h && !(a > h - s && c > h - s && a + c > 2 * h - s);
};
/** Corners step in twice on wide plans, once on narrow ones. */
const steps = (h: number) => (h >= 3 ? 2 : 1);
/**
 * Is the point (dx, dz) m from a column's centre on the redented plan of
 * half size `h` (cells), grown by `grow` m? (for 0.5 m cells over 1 m plans)
 */
const onPlan = (dx: number, dz: number, h: number, grow: number): boolean =>
  redented(Math.floor(Math.max(0, Math.abs(dx) - grow) + 0.5), Math.floor(Math.max(0, Math.abs(dz) - grow) + 0.5), h, steps(h));
const QUADS = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;
/** Outward normals of a square's faces. */
const FACES = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export function buildTerrace(ctx: MapContext, place: PlaceDef): MapPart {
  const f = ctx.field;
  const gy = place.y;
  const [hx, hz] = place.pad;
  const ex = hx + 2;
  const ez = hz + 2;
  // Everything is built round the pad centre (x, z) at world heights, and moved into place at the end.
  const b = new VoxelBuilder();
  const g = b.grid({ cell: 1, origin: [0, gy, 0], mat: 'mapStone', jitter: 0.04, ao: 0.32, seed: 51 });
  const d = new Mason(b, 0.5, { seed: 52 });
  const lamps = new Lamps(0.5, 4.2);
  // (by day nearly black: the glowing windows and doors are the temple's dark openings)
  const windows = new Lamps(0.015, 3);
  const pools = new Pools();
  const src = traceSource();
  const at = (x: number, y: number, z: number): [number, number, number] => [place.x + x, gy + y, place.z + z];
  // The sculpted shrines, placed in pad metres (x east, z south; y a world height).
  const shrines = new Shrines(`landmark:${place.id}`);
  const pad = new Frame(place.x, 0, place.z, 0);

  // ── The road: its centre line smoothed as the road part does it (road/line.ts), + on the temple's side ──
  const raw = f.paths.find((p) => p.name === ROAD)?.samples ?? [];
  const line: [number, number, number, number][] = [];
  const mid = raw.map((_, n) => {
    const r = Math.min(6, n, raw.length - 1 - n);
    let [x, z] = [0, 0];
    for (let m = n - r; m <= n + r; m++) [x, z] = [x + raw[m].x, z + raw[m].z];
    return [x / (2 * r + 1) - place.x, z / (2 * r + 1) - place.z];
  });
  mid.forEach(([x, z], n) => {
    const [ax, az] = mid[Math.max(0, n - 1)];
    const [bx, bz] = mid[Math.min(mid.length - 1, n + 1)];
    const l = Math.hypot(bx - ax, bz - az) || 1;
    if (Math.abs(x) < 110 && Math.abs(z) < 110) line.push([x, z, (bx - ax) / l, (bz - az) / l]);
  });
  const road = (x: number, z: number): number => {
    let best = Infinity;
    let side = 1;
    for (const [sx, sz, tx, tz] of line) {
      const dd = (x - sx) ** 2 + (z - sz) ** 2;
      if (dd < best) {
        best = dd;
        side = (x - sx) * tz - (z - sz) * tx >= 0 ? 1 : -1;
      }
    }
    return Math.sqrt(best) * side;
  };
  const cellRoad = (i: number, k: number) => road(i + 0.5, k + 0.5);
  const inPad = (x: number, z: number) => x >= -ex && x < ex && z >= -ez && z < ez;
  /** Ground under a column, in rows from the pad (0 on the flat hill top). */
  const ground = (i: number, k: number) => f.heightAt(place.x + i + 0.5, place.z + k + 0.5) - gy;

  // ── Stone painters ───────────────────────────────────────────────────────
  const put = (i: number, j: number, k: number, color: number, shade = 1) => g.put(i, j, k, { color, mat: 'mapStone', shade });
  const wall = (i: number, j: number, k: number) => bondTone(TP.wall, i, j, k, 3);
  const ledge = (i: number, j: number, k: number) => tone(TP.ledge, i, j, k, 4);
  const light = (i: number, j: number, k: number) => tone(TP.light, i, j, k, 5);
  const dark = (i: number, j: number, k: number) => tone(TP.dark, i, j, k, 6);
  const deep = (i: number, j: number, k: number) => tone(TP.deep, i, j, k, 7);
  const roofTone = (i: number, j: number, k: number) => tone(TP.roof, i, j, k, 8);
  const base = (i: number, j: number, k: number) => tone(TP.base, i >> 1, j, k >> 1, 9);
  const layer = (ci: number, ck: number, j: number, h: number, s: number, color: (i: number, j: number, k: number) => number, shade = 1) => {
    for (let di = -h; di <= h; di++) for (let dk = -h; dk <= h; dk++) if (redented(di, dk, h, s)) put(ci + di, j, ck + dk, color(ci + di, j, ck + dk), shade);
  };

  // ── Fine masonry (0.5 m): cornices, antefixes, buds and door frames ─────
  /** A course of 0.5 m cells, `y0`‥`y1` m above the pad, over the plan of half size `h` round column (ci, ck), grown by `grow` m. */
  const fineLayer = (ci: number, ck: number, y0: number, y1: number, h: number, grow: number, paint: Tones) => {
    const [cx, cz, r] = [ci + 0.5, ck + 0.5, h + 0.5 + grow];
    d.fill(cx - r, gy + y0, cz - r, cx + r, gy + y1, cz + r, paint, { src, keep: (x, _y, z) => onPlan(x - cx, z - cz, h, grow) });
  };
  /** Small upright stones (antefixes) on the outer corners of that plan, `tall` m high from `y`. */
  const antefixes = (ci: number, ck: number, y: number, h: number, grow: number, tall: number) => {
    const [cx, cz, r] = [ci + 0.5, ck + 0.5, h + 0.5 + grow];
    for (let u = 0.25; u < r; u += 0.5)
      for (let v = 0.25; v < r; v += 0.5) {
        if (!onPlan(u, v, h, grow) || onPlan(u + 0.5, v, h, grow) || onPlan(u, v + 0.5, h, grow)) continue;
        for (const [sx, sz] of QUADS) {
          const [x, z] = [cx + sx * u, cz + sz * v];
          d.fill(x - 0.25, gy + y, z - 0.25, x + 0.25, gy + y + tall, z + 0.25, TP.light, { src });
        }
      }
  };
  /** Spikes on the buds: added at the end, on the buds still standing. */
  const spikes: [number, number, number][] = [];
  /** A lotus bud of 0.5 m cells on row `j`, and a thin spike. */
  const bud = (ci: number, ck: number, j: number) => {
    const [cx, cz] = [ci + 0.5, ck + 0.5];
    const round = (r: number) => (x: number, _y: number, z: number) => Math.abs(x - cx) + Math.abs(z - cz) < r;
    d.fill(cx - 1.5, gy + j, cz - 1.5, cx + 1.5, gy + j + 0.5, cz + 1.5, TP.light, { src, keep: round(2.3) });
    d.fill(cx - 1, gy + j + 0.5, cz - 1, cx + 1, gy + j + 1.5, cz + 1, TP.light, { src, keep: round(1.3) });
    d.fill(cx - 0.5, gy + j + 1.5, cz - 0.5, cx + 0.5, gy + j + 2, cz + 0.5, TP.light, { src });
    spikes.push([cx, gy + j + 2, cz]);
  };
  /**
   * A door's frame in 0.5 m stones standing out of a face `out` m from the
   * column's centre along (nx, nz): colonnettes either side of a door `w` m
   * from its middle, `y0`‥`y1` high, a lintel and a small stepped pediment.
   */
  const frame = (ci: number, ck: number, nx: number, nz: number, out: number, w: number, y0: number, y1: number) => {
    const [cx, cz] = [ci + 0.5, ck + 0.5];
    // (a along the face, n out of it)
    const box = (a0: number, a1: number, b0: number, b1: number) => {
      const [n0, n1] = [out, out + 0.5];
      const [xa, xb] = nx > 0 ? [cx + n0, cx + n1] : nx < 0 ? [cx - n1, cx - n0] : [cx + a0, cx + a1];
      const [za, zb] = nz > 0 ? [cz + n0, cz + n1] : nz < 0 ? [cz - n1, cz - n0] : [cz + a0, cz + a1];
      d.fill(xa, gy + b0, za, xb, gy + b1, zb, TP.light, { src });
    };
    box(-w - 0.5, -w, y0, y1);
    box(w, w + 0.5, y0, y1);
    box(-w - 0.5, w + 0.5, y1, y1 + 0.5);
    for (let s = 0; w - s * 0.5 > 0; s++) box(-w + s * 0.5, w - s * 0.5, y1 + 0.5 + s * 0.5, y1 + 1 + s * 0.5);
  };

  /**
   * A 0.5 m cornice on row `y` over the plan of half size `h`: a drip course,
   * a band standing out `lip` m, and antefixes `tall` m high on its corners.
   */
  const cornice = (ci: number, ck: number, y: number, h: number, lip: number, tall: number) => {
    fineLayer(ci, ck, y, y + 0.5, h, lip + 0.5, TP.light);
    fineLayer(ci, ck, y + 0.5, y + 1, h, lip, TP.ledge);
    antefixes(ci, ck, y + 1, h, lip, tall);
    // (the 1 m grid is told the cornice is there, for its shading and moss)
    for (let di = -h; di <= h; di++) for (let dk = -h; dk <= h; dk++) if (redented(di, dk, h, steps(h))) g.ghost(ci + di, y, ck + dk);
  };

  /**
   * Stepped tiers from row `j`: each `rows` of wall (a dark niche in every
   * face on those of half size `niche` or more) under a cornice standing out
   * `lip` m; then a bud.
   */
  const tiers = (ci: number, ck: number, j: number, halves: number[], rows = 2, niche = 2, lip = 0) => {
    for (const h of halves) {
      for (let r = 0; r < rows; r++) layer(ci, ck, j + r, h, steps(h), wall, courseShade(j + r));
      if (h >= niche)
        for (let r = 0; r < rows; r++) {
          put(ci, j + r, ck + h, deep(ci, j + r, ck + h), 0.85);
          put(ci, j + r, ck - h, deep(ci, j + r, ck - h), 0.85);
          put(ci + h, j + r, ck, deep(ci + h, j + r, ck), 0.85);
          put(ci - h, j + r, ck, deep(ci - h, j + r, ck), 0.85);
        }
      cornice(ci, ck, j + rows, h, lip, h >= 3 ? 1 : 0.5);
      j += rows + 1;
    }
    bud(ci, ck, j);
  };

  /**
   * A tower: a redented body of half size `h`, `rows` high from row `j0`
   * (a dark base course, a framed false door in every face), a cornice, then tiers.
   */
  const tower = (ci: number, ck: number, j0: number, h: number, rows: number, halves: number[]) => {
    for (let j = j0; j < j0 + rows; j++) layer(ci, ck, j, h, steps(h), j === j0 ? dark : wall, courseShade(j));
    const top = j0 + Math.min(5, rows - 1);
    for (let j = j0 + 1; j < top; j++) {
      put(ci, j, ck + h, deep(ci, j, ck + h), 0.82);
      put(ci, j, ck - h, deep(ci, j, ck - h), 0.82);
      put(ci + h, j, ck, deep(ci + h, j, ck), 0.82);
      put(ci - h, j, ck, deep(ci - h, j, ck), 0.82);
    }
    for (const [nx, nz] of FACES) frame(ci, ck, nx, nz, h + 0.5, 0.5, j0 + 1, top);
    cornice(ci, ck, j0 + rows, h, 0.5, 0.5);
    tiers(ci, ck, j0 + rows + 1, halves);
  };

  // ── Platform: two courses of laterite, a stone kerb, footings where the hill falls away ──
  const G = { i0: AX - GAL.hi, i1: AX + GAL.hi, k0: CK - GAL.hk, k1: CK + GAL.hk };
  const P = { i0: G.i0 - 2, i1: G.i1 + 2, k0: G.k0 - 2, k1: G.k1 + 2 };
  const onPlatform = (i: number, k: number) => i >= P.i0 && i <= P.i1 && k >= P.k0 && k <= P.k1 && cellRoad(i, k) >= CLEAR;
  for (let i = P.i0; i <= P.i1; i++)
    for (let k = P.k0; k <= P.k1; k++) {
      if (!onPlatform(i, k)) continue;
      const edge = !onPlatform(i + 1, k) || !onPlatform(i - 1, k) || !onPlatform(i, k + 1) || !onPlatform(i, k - 1);
      for (let j = Math.min(0, ground(i, k)); j < 0; j++) put(i, j, k, base(i, j, k), 0.9);
      put(i, 0, k, base(i, 0, k), 0.95);
      put(i, 1, k, edge ? ledge(i, 1, k) : base(i, 1, k));
    }

  // ── Outer gallery: two walls with windows, a corbelled roof, fallen in on the west and north ──
  // How whole the gallery is: a smooth field, lower to the west and north; low = roof gone, lower = walls down.
  const whole = (i: number, k: number) => valueNoise3(i / 6, 0.5, k / 6, 29) + 0.01 * (i - G.i0) + 0.012 * (k - G.k0) - 0.12;
  // (kept whole: the front by the gate, and where the east tree stands on the roof)
  const kept = (i: number, k: number) => (Math.abs(i - AX) <= 7 && k >= G.k1 - 3) || (i >= G.i1 - 4 && Math.abs(k - (CK - 2)) <= 3);
  // (a broken stretch east of the gate, as in the picture)
  const broken = (i: number, k: number) => i >= AX + 13 && i <= AX + 18 && k >= G.k1 - 3;
  const depth = (i: number, k: number) => Math.min(i - G.i0, G.i1 - i, k - G.k0, G.k1 - k);
  for (let i = G.i0 - 1; i <= G.i1 + 1; i++)
    for (let k = G.k0 - 1; k <= G.k1 + 1; k++) {
      const dd = depth(i, k);
      if (dd < -1 || dd > 3) continue;
      const along = dd === i - G.i0 || dd === G.i1 - i ? k : i;
      const south = dd === G.k1 - k;
      // (one value across the gallery, so a roof never outlives both its walls)
      const [mi, mk] = dd === i - G.i0 ? [G.i0 + 1, k] : dd === G.i1 - i ? [G.i1 - 1, k] : dd === k - G.k0 ? [i, G.k0 + 1] : [i, G.k1 - 1];
      const w = kept(mi, mk) ? 1 : broken(mi, mk) ? 0.2 + 0.1 * hash3(mi, 0, mk, 31) : whole(mi, mk);
      const top = w < 0.3 ? 2 + Math.floor(Math.max(0, w) * 12 + hash3(i, 1, k, 32) * 2) : 6;
      // Windows every 3 m (every 2 m on the south front, a row of pillars), dark behind.
      const win = (j: number) => j >= 3 && j <= 5 && mod(along, south ? 2 : 3) === 1;
      if (dd === 0 || dd === 2)
        for (let j = 2; j <= top; j++) {
          if (dd === 0 && win(j)) continue;
          put(i, j, k, dd === 2 && win(j) ? deep(i, j, k) : j === 2 ? dark(i, j, k) : wall(i, j, k), dd === 2 && win(j) ? 0.8 : courseShade(j));
        }
      if (dd === 1) put(i, 1, k, dark(i, 1, k));
      if (top < 6 || w < 0.42) continue;
      put(i, 7, k, ledge(i, 7, k), 1.04);
      if (dd >= 0 && dd <= 2) put(i, 8, k, roofTone(i, 8, k));
      if (dd === 1 && w >= 0.5) put(i, 9, k, roofTone(i, 9, k), 1.05);
    }
  // Night: a few of the south windows glow (the dark wall behind them).
  for (let i = G.i0 + 4; i <= G.i1 - 4; i++)
    if (mod(i, 2) === 1 && Math.abs(i - AX) > 7 && !broken(i, G.k1) && hash3(i, 2, 3, 57) < 0.5) windows.strip(at(i + 0.5, 4.5, G.k1 - 0.95), 0.8, 0.1, 2.6, 0, 0.9);

  // ── Corner towers (the north-west one has fallen) ────────────────────────
  const corners: [number, number][] = [
    [G.i0 + 1, G.k1 - 1],
    [G.i1 - 1, G.k1 - 1],
    [G.i1 - 1, G.k0 + 1],
    [G.i0 + 1, G.k0 + 1],
  ];
  for (const [ci, ck] of corners) tower(ci, ck, 2, 3, 7, [2]);

  // ── Gate pavilion in the south gallery, a passage through, a stair to the causeway ──
  const GK = G.k1;
  // Terrace in front of it and the steps down.
  for (let i = AX - 5; i <= AX + 5; i++)
    for (let k = GK + 3; k <= GK + 6; k++) {
      const edge = Math.abs(i - AX) === 5 || k === GK + 6;
      put(i, 0, k, base(i, 0, k), 0.95);
      put(i, 1, k, edge ? ledge(i, 1, k) : light(i, 1, k));
    }
  for (let i = AX - 3; i <= AX + 3; i++) put(i, 0, GK + 7, ledge(i, 0, GK + 7));
  // Body (from the gallery's inner wall to two cells in front of it) and porch.
  for (let j = 2; j <= 9; j++)
    for (let i = AX - 6; i <= AX + 6; i++)
      for (let k = GK - 2; k <= GK + 2; k++) put(i, j, k, j === 2 ? dark(i, j, k) : wall(i, j, k), courseShade(j));
  for (let j = 2; j <= 8; j++) for (let i = AX - 3; i <= AX + 3; i++) put(i, j, GK + 3, Math.abs(i - AX) === 2 || j === 8 ? light(i, j, GK + 3) : wall(i, j, GK + 3), courseShade(j));
  // Passage: 3 wide, 5 high, dark inside; lower at the court end.
  for (let k = GK - 2; k <= GK + 3; k++)
    for (let i = AX - 1; i <= AX + 1; i++) {
      for (let j = 2; j <= (k === GK - 2 ? 4 : 6); j++) g.delete(i, j, k);
      put(i, k === GK - 2 ? 5 : 7, k, k === GK + 3 ? light(i, 7, k) : deep(i, 7, k), 0.8);
      put(i, 1, k, deep(i, 1, k), 0.8);
    }
  for (let k = GK - 2; k <= GK + 2; k++) for (let j = 2; j <= 6; j++) for (const i of [AX - 2, AX + 2]) put(i, j, k, deep(i, j, k), 0.8);
  // (a glow at its far end at night, behind the Buddha; by day a dark screen, so the passage reads as a deep door)
  windows.strip(at(AX + 0.5, 3.5, GK - 0.94), 2.8, 0.1, 3, 0, 0.8);
  // Roof, a stepped pediment over the porch, and the gate's tower.
  for (let i = AX - 7; i <= AX + 7; i++) for (let k = GK - 3; k <= GK + 2; k++) put(i, 10, k, ledge(i, 10, k), 1.04);
  for (let i = AX - 5; i <= AX + 5; i++) for (let k = GK - 3; k <= GK + 2; k++) put(i, 11, k, roofTone(i, 11, k));
  for (let s = 0; s < 6; s++) d.fill(AX - 3 + s * 0.5, gy + 9 + s * 0.5, GK + 3, AX + 4 - s * 0.5, gy + 9.5 + s * 0.5, GK + 4, TP.light, { src });
  frame(AX, GK, 0, 1, 3.5, 1.5, 2, 7);
  tiers(AX, GK, 12, [3, 2, 1]);
  lamps.add(at(AX - 1.5, 4.4, GK + 4.75), 0.5);
  lamps.add(at(AX + 2.5, 4.4, GK + 4.75), 0.5);

  /** The lotus basins (m, from the pad centre): west and east of the causeway. */
  const BASINS = {
    x: [
      [AX - 11, AX - 6],
      [AX + 7, AX + 12],
    ],
    z: [GK + 4, GK + 14],
  };

  // ── Causeway to the beacon: raised, with a low parapet ───────────────────
  const onCauseway = (i: number, k: number) => Math.abs(i - AX) <= 3 && k >= GK + 7 && cellRoad(i, k) >= 3.2;
  let causeEnd = GK + 7;
  for (let k = GK + 7; k < GK + 40 && onCauseway(AX, k); k++) {
    causeEnd = k;
    for (let i = AX - 3; i <= AX + 3; i++) {
      if (!onCauseway(i, k)) continue;
      const side = Math.abs(i - AX) === 3;
      put(i, 0, k, side ? ledge(i, 0, k) : light(i, 0, k), side ? 1 : 1.02);
      if (side && mod(k, 2) === 0) put(i, 1, k, ledge(i, 1, k), 1.05);
    }
  }
  // A half step down to the road.
  if (cellRoad(AX, causeEnd + 1) >= 2.2) d.fill(AX - 2, gy, causeEnd + 1, AX + 3, gy + 0.5, causeEnd + 1.5, TP.light, { src });
  for (const s of [-1, 1])
    for (let k of [GK + 8, causeEnd]) {
      // (on the parapet, where the causeway is whole)
      while (k > GK + 8 && !g.has(AX + s * 3, 0, k)) k--;
      put(AX + s * 3, 1, k, ledge(AX + s * 3, 1, k), 1.05);
      lamps.add(at(AX + 0.5 + s * 3, 2.3, k + 0.5), 0.45);
    }

  // ── Lotus basins either side of the causeway ─────────────────────────────
  for (const [x0, x1] of BASINS.x) {
    const [z0, z1] = BASINS.z;
    d.fill(x0 - 0.5, gy, z0 - 0.5, x1 + 0.5, gy + 0.5, z1 + 0.5, TP.light, { src, keep: (x, _y, z) => !(x > x0 && x < x1 && z > z0 && z < z1) });
    pools.add(place.x + x0, place.z + z0, place.x + x1, place.z + z1, gy + 0.35);
    for (let n = 0; n < 9; n++) {
      const x = Math.floor((x0 + 0.5 + hash3(n, 1, x0, 73) * (x1 - x0 - 1)) * 2) / 2;
      const z = Math.floor((z0 + 0.5 + hash3(n, 2, x0, 73) * (z1 - z0 - 1)) * 2) / 2;
      const flower = hash3(n, 3, x0, 73) < 0.4;
      b.box(x + 0.25, gy + 0.45, z + 0.25, 0.5, flower ? 0.3 : 0.1, 0.5, flower ? pick(FLOWER_PINK, hash3(n, 4, x0, 73)) : pick(LEAF, hash3(n, 5, x0, 73)), 'mapLeaf', { src });
    }
  }

  // ── Inner court: a terrace a storey up, a gallery round its edge, towers on its corners ──
  const I = { i0: AX - INNER.hi, i1: AX + INNER.hi, k0: CK - INNER.hk, k1: CK + INNER.hk };
  /** The first row on the inner terrace (its top is a storey above the platform's). */
  const UP = 6;
  for (let i = I.i0; i <= I.i1; i++)
    for (let k = I.k0; k <= I.k1; k++) {
      const edge = i === I.i0 || i === I.i1 || k === I.k0 || k === I.k1;
      for (let j = 2; j < UP; j++) put(i, j, k, edge && j === UP - 1 ? ledge(i, j, k) : base(i, j, k), j === UP - 1 ? 1 : 0.95);
    }
  // The inner gallery: two cells deep, blind windows outside, a door on each axis.
  const inDepth = (i: number, k: number) => Math.min(i - I.i0, I.i1 - i, k - I.k0, I.k1 - k);
  for (let i = I.i0 - 1; i <= I.i1 + 1; i++)
    for (let k = I.k0 - 1; k <= I.k1 + 1; k++) {
      const dd = inDepth(i, k);
      if (dd < -1 || dd > 2) continue;
      const along = dd === i - I.i0 || dd === I.i1 - i ? k - CK : i - AX;
      const door = Math.abs(along) <= 1;
      if (dd === 0 || dd === 1)
        for (let j = UP; j <= UP + 5; j++) {
          if (door && j <= UP + 2) continue;
          const win = dd === 0 && j >= UP + 1 && j <= UP + 3 && !door && mod(along, 3) === 0;
          put(i, j, k, win ? deep(i, j, k) : j === UP ? dark(i, j, k) : wall(i, j, k), win ? 0.82 : courseShade(j));
        }
      put(i, UP + 6, k, ledge(i, UP + 6, k), 1.04);
      if (dd === 0 || dd === 1) put(i, UP + 7, k, roofTone(i, UP + 7, k));
    }
  // Stairs up from the gate's passage, through the gallery's south door.
  for (let s = 0; s < UP - 2; s++)
    for (let i = AX - 1; i <= AX + 1; i++) {
      const k = I.k1 + 1 - s;
      for (let j = 2; j < UP; j++) {
        if (j > 2 + s) g.delete(i, j, k);
        else put(i, j, k, j === 2 + s ? ledge(i, j, k) : base(i, j, k));
      }
    }
  const inner: [number, number][] = [
    [I.i0 + 2, I.k1 - 2],
    [I.i1 - 2, I.k1 - 2],
    [I.i0 + 2, I.k0 + 2],
    [I.i1 - 2, I.k0 + 2],
  ];
  for (const [ci, ck] of inner) tower(ci, ck, UP, 2, 8, [2, 1]);

  // Central tower: a redented body with a porch and door on every side, a cornice, five tiers, a bud.
  const CH = 6;
  for (let j = UP; j <= UP + 7; j++) layer(AX, CK, j, CH, 2, j === UP ? dark : wall, courseShade(j));
  for (const [nx, nz] of [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ]) {
    const cell = (a: number, dist: number): [number, number] => [AX + nx * dist + nz * a, CK + nz * dist + nx * a];
    for (let a = -2; a <= 2; a++)
      for (let dist = CH + 1; dist <= CH + 2; dist++)
        for (let j = UP; j <= UP + 7; j++) {
          const [i, k] = cell(a, dist);
          if (Math.abs(a) <= 1 && j <= UP + 4 && dist === CH + 2) continue;
          const door = Math.abs(a) <= 1 && j <= UP + 4;
          put(i, j, k, door ? deep(i, j, k) : j === UP + 7 || Math.abs(a) === 2 ? light(i, j, k) : wall(i, j, k), door ? 0.8 : courseShade(j));
        }
    // A little stepped gable over each porch.
    for (let s = 0; s < 2; s++)
      for (let a = -1 + s; a <= 1 - s; a++) {
        const [i, k] = cell(a, CH + 2);
        put(i, UP + 8 + s, k, light(i, UP + 8 + s, k), 1.05);
      }
  }
  for (const [nx, nz] of FACES) frame(AX, CK, nx, nz, CH + 2.5, 1.5, UP, UP + 5);
  layer(AX, CK, UP + 8, CH + 1, 2, ledge, 1.04);
  tiers(AX, CK, UP + 9, [6, 5, 5, 4, 3], 2, 4, 0.5);

  // ── What has fallen ──────────────────────────────────────────────────────
  const heaps: [number, number, number][] = [];
  const fall = (ci: number, ck: number, r: number, cut: (i: number, k: number) => number, seed: number) => {
    // (ragged across, but the same all the way up a column: nothing is left hanging)
    const down = (i: number, j: number, k: number) => Math.abs(i - ci) <= r && Math.abs(k - ck) <= r && j > cut(i, k) + (valueNoise3(i / 2, 0.5, k / 2, seed) - 0.5) * 3;
    const gone: [number, number, number][] = [];
    g.forEach((i, j, k) => {
      if (j >= 0 && down(i, j, k)) gone.push([i, j, k]);
    });
    for (const [i, j, k] of gone) g.delete(i, j, k);
    // (and the fine stones on what fell)
    const fine: [number, number, number][] = [];
    d.grid.forEach((i, j, k) => {
      if (down(Math.floor(i / 2), Math.floor(j / 2 - gy), Math.floor(k / 2))) fine.push([i, j, k]);
    });
    for (const [i, j, k] of fine) d.grid.delete(i, j, k);
  };
  // The north-west corner tower, down to a stump.
  fall(G.i0 + 1, G.k0 + 1, 5, () => 6, 21);
  heaps.push([G.i0 + 5, G.k0 + 4, 4]);
  // The north-east inner tower and the gallery by it, the court round it heaped with their stones.
  const [ni, nk] = inner[3];
  fall(ni, nk, 4, (i, k) => UP + 3 - 0.6 * Math.max(0, i - ni) - 0.5 * Math.max(0, nk - k), 22);
  heaps.push([ni + 4, nk + 2, 3], [ni - 3, nk - 3, 2]);
  // Rubble where the gallery fell: in the corridor and the court beside it.
  for (let i = G.i0; i <= G.i1; i++)
    for (let k = G.k0; k <= G.k1; k++) {
      const dd = depth(i, k);
      if (dd < 0 || dd > 4 || kept(i, k)) continue;
      const w = broken(i, k) ? 0.25 : whole(i, k);
      if (w < 0.3 && hash3(i, 5, k, 33) < 0.5 - w) {
        let j = 2;
        while (j < 5 && g.has(i, j, k)) j++;
        if (j < 5 && !g.has(i, j, k)) put(i, j, k, hash3(i, j, k, 34) < 0.6 ? wall(i, j, k) : dark(i, j, k), 0.88 + 0.12 * hash3(i, j, k, 35));
      }
    }
  for (const [hi, hk, r] of heaps)
    for (let i = hi - r; i <= hi + r; i++)
      for (let k = hk - r; k <= hk + r; k++) {
        const q = Math.hypot(i - hi, k - hk) / r;
        let j = 1;
        while (j < 12 && g.has(i, j + 1, k)) j++;
        const h = Math.floor((1 - q) * (r + 1) + (valueNoise3(i / 2, 1, k / 2, 25) - 0.5) * 2);
        for (let y = j + 1; y <= j + h; y++) if (!g.has(i, y, k)) put(i, y, k, hash3(i, y, k, 26) < 0.7 ? wall(i, y, k) : dark(i, y, k), 0.86 + 0.14 * hash3(i, y, k, 27));
      }

  // ── Weathering ───────────────────────────────────────────────────────────
  // The hill top under the temple (not drawn): shades and hides the bottom blocks.
  for (let i = P.i0 - 10; i <= P.i1 + 10; i++) for (let k = P.k0 - 8; k <= P.k1 + 16; k++) if (ground(i, k) === 0 && !g.has(i, -1, k)) g.ghost(i, -1, k);
  chip(g, { seed: 36, corner: 0.2, edge: 0.05, from: 2 });
  // Loose 0.5 m stones on the broken wall tops and the heaps: crumbling edges.
  const nearHeap = (i: number, k: number) => heaps.some(([hi, hk, r]) => Math.hypot(i - hi, k - hk) <= r + 1);
  const loose: [number, number, number][] = [];
  g.forEach((i, j, k, c) => {
    if (c.ghost || c.mat !== 'mapStone' || j < 2 || j > 8 || g.has(i, j + 1, k) || hash3(i, j, k, 64) > 0.35) return;
    let broke = nearHeap(i, k);
    if (!broke && depth(i, k) >= 0 && depth(i, k) <= 2) {
      broke = true;
      for (let y = j + 1; y <= 7 && broke; y++) broke = !g.has(i, y, k);
    }
    if (broke) loose.push([i, j + 1, k]);
  });
  for (const [i, j, k] of loose) {
    const [x, z] = [i + (hash3(i, j, k, 65) < 0.5 ? 0 : 0.5), k + (hash3(i, j, k, 66) < 0.5 ? 0 : 0.5)];
    const tall = hash3(i, j, k, 67) < 0.3 ? 1 : 0.5;
    d.fill(x, gy + j, z, x + 0.5, gy + j + tall, z + 0.5, hash3(i, j, k, 68) < 0.6 ? TP.wall : TP.dark, { src });
    if (hash3(i, j, k, 69) < 0.4) d.fill(x === i ? x + 0.5 : x - 0.5, gy + j, z, (x === i ? x + 0.5 : x - 0.5) + 0.5, gy + j + 0.5, z + 0.5, TP.light, { src });
  }
  // The spikes of the buds still standing.
  for (const [x, y, z] of spikes) if (d.has(x, y - 0.25, z)) b.box(x, y + 0.4, z, 0.3, 0.8, 0.3, pick(TP.light, hash3(x, y, z, 58)), 'mapStone', { src, shade: 1.05 });
  // Lichen: green-grey patches on the walls.
  g.forEach((i, j, k, c) => {
    if (c.ghost || c.mat !== 'mapStone' || j < 2 || TP.deep.includes(c.color)) return;
    const open = !g.has(i + 1, j, k) || !g.has(i - 1, j, k) || !g.has(i, j, k + 1) || !g.has(i, j, k - 1);
    if (open && valueNoise3(i / 4, j / 3, k / 4, 37) > 0.62 && hash3(i, j, k, 38) < 0.8) c.color = tone(TP.stain, i, j, k, 39);
  });

  // ── Giant trees ──────────────────────────────────────────────────────────
  // Crowns beside and behind the central tower, never south-east of it: the
  // sun comes from there, and their shadows would fall on it.
  const allowed = (i: number, k: number) => cellRoad(i, k) >= 3.5 && ground(i, k) === 0;
  /** The 1 m cells the roots run through (drawn in the fine grid): moss and bushes keep out. */
  const rooted = new Set<string>();
  const fine = { fine: d.grid, marks: rooted };
  /** The first empty row over a column's stone. */
  const standOn = (i: number, k: number) => {
    let j = 14;
    while (j > 0 && !g.has(i, j - 1, k)) j--;
    return j;
  };
  // Beside the south-west corner, on the ground: the crown leans out over the lawn.
  giantTree(g, { i: G.i0 - 5, k: G.k1 - 6, j: 0, trunk: 16, crown: 9, lean: [-3, 1], roots: 6, reach: 11, seed: 80, allowed, ...fine });
  // On the east gallery's roof, roots down both its faces.
  giantTree(g, { i: G.i1 - 1, k: CK - 2, j: standOn(G.i1 - 1, CK - 2), trunk: 12, crown: 10, lean: [4, -1], roots: 6, reach: 14, seed: 87, allowed, ...fine });
  // Out of the stump of the fallen north-west corner tower.
  giantTree(g, { i: G.i0 + 1, k: G.k0 + 1, j: standOn(G.i0 + 1, G.k0 + 1), trunk: 13, crown: 9, lean: [-2, -2], roots: 7, reach: 14, seed: 94, allowed, ...fine });
  // Behind the north-east corner, on the ground.
  giantTree(g, { i: G.i1 + 4, k: G.k0 + 2, j: 0, trunk: 19, crown: 9, lean: [2, -2], roots: 5, reach: 10, seed: 101, allowed, ...fine });
  // A young fig on the broken stretch east of the gate: small crown, roots down the front.
  giantTree(g, { i: AX + 16, k: G.k1 - 1, j: standOn(AX + 16, G.k1 - 1), width: 2, trunk: 5, crown: 3.5, lean: [1, 0], roots: 5, reach: 10, seed: 108, allowed, ...fine });

  // ── Moss, vines and bushes ───────────────────────────────────────────────
  overgrow(g, {
    seed: 41,
    // (the causeway kept fairly clean, the tower tops greenest)
    // (clumps on ledges and tops, the walls left grey; the causeway fairly clean, the tower tops greenest)
    top: (_i, j) => (j <= 0 ? 0.1 : j < UP ? 0.3 : j <= UP + 7 ? 0.32 : 0.45),
    side: () => 0.03,
    vines: 0.04,
    vineLen: [2, 5],
    cushion: 0.35,
    moss: TP.moss,
    keep: rooted,
  });
  // …and on the fine cornices, in patches, greener higher up.
  d.grid.forEach((i, j, k, c) => {
    const y = j / 2 - gy;
    if (y < 4 || c.mat !== 'mapStone' || d.grid.has(i, j + 1, k) || g.has(Math.floor(i / 2), Math.floor(y + 0.5), Math.floor(k / 2))) return;
    if (valueNoise3(i / 5, j / 4, k / 5, 61) + y * 0.008 > 0.6 && hash3(i, j, k, 62) < 0.85) {
      c.color = pick(TP.moss, hash3(i, k, j, 63));
      c.mat = 'mapGrass';
    }
  });
  // Bushes and ferns in clumps: mostly out of the moss patches, a few off bare
  // ledges, and shrubs along the platform's foot.
  const seeds: [number, number, number, number][] = [];
  g.forEach((i, j, k, c) => {
    if (c.ghost || j < 4 || g.has(i, j + 1, k)) return;
    const r = hash3(i, j, k, 43);
    if ((c.mat === 'mapGrass' && r < 0.07) || (c.mat === 'mapStone' && r < 0.008)) seeds.push([i, j + 1, k, 1.1 + hash3(i, j, k, 44) * 1.1]);
  });
  for (let i = P.i0 - 1; i <= P.i1 + 1; i++)
    for (let k = P.k0 - 1; k <= P.k1 + 1; k++) {
      const foot = !onPlatform(i, k) && (onPlatform(i + 1, k) || onPlatform(i - 1, k) || onPlatform(i, k + 1) || onPlatform(i, k - 1));
      if (foot && ground(i, k) === 0 && !g.has(i, 0, k) && cellRoad(i, k) >= 4 && Math.abs(i - AX) > 6 && hash3(i, 0, k, 48) < 0.12) seeds.push([i, 0, k, 1.2 + hash3(i, 0, k, 49) * 0.8]);
    }
  for (const [i, j, k, r] of seeds) {
    // A lumpy mound, each layer only over something to grow on; bright on top.
    const n = Math.ceil(r);
    const cells: [number, number, number][] = [];
    for (let dj = 0; dj <= n; dj++)
      for (let di = -n; di <= n; di++)
        for (let dk = -n; dk <= n; dk++) {
          const [x, y, z] = [i + di, j + dj, k + dk];
          if (Math.hypot(di / r, dj / (r * 0.75), dk / r) + (hash3(x, y, z, 45) - 0.5) * 0.4 > 1 || g.has(x, y, z) || !g.has(x, y - 1, z) || rooted.has(`${x},${y},${z}`)) continue;
          g.put(x, y, z, { color: pick(BUSH, hash3(x, y, z, 46)), mat: 'mapLeaf', shade: 0.85 });
          cells.push([x, y, z]);
        }
    for (const [x, y, z] of cells) if (!g.has(x, y + 1, z)) g.put(x, y, z, { color: pick(BUSH_TOP, hash3(x, y, z, 47)), mat: 'mapLeaf', shade: 1 });
  }

  // ── The Buddha in the gate's passage ─────────────────────────────────────
  // The passage's low court end is walled up (the stair beyond and the
  // court are out of reach), and before that wall (the dark screen behind
  // him) an old sandstone Buddha wrapped in a saffron cloth sits on a
  // two-step stone altar, facing out down the causeway; candles and lotus on
  // the altar's step, incense, bay sei and a marigold garland before it. The
  // explorer kneels in the passage, the open terrace a step behind him
  // (roam/_worship.ts `terrace-gate`), 1.5 m clear before him.
  {
    for (let i = AX - 1; i <= AX + 1; i++) for (let j = 2; j <= 4; j++) put(i, j, GK - 2, deep(i, j, GK - 2), 0.8);
    const F = gy + 2;
    const cx = AX + 0.5;
    const back = GK - 1;
    // The altar: a bench nearly the passage's width, and the seat on its back half.
    d.fill(cx - 1, F, back + 0.5, cx + 1, F + 0.5, back + 2, TP.light, { src });
    d.fill(cx - 1, F + 0.5, back + 0.5, cx + 1, F + 1, back + 1.5, TP.ledge, { src });
    const seat = F + 1;
    const bz = back + 1;
    shrines.place(pad, buddhaStatue({ kind: 'shrine', look: 'sandstone', height: BUDDHA }), cx, seat, bz);
    // (the explorer walks in up to the offerings, never onto the altar nor round it)
    shrines.solid(pad, cx, F + 2.5, back + 1.35, 3, 5, 2.7);
    // On the bench before him: candles, lotus in vases, a plate of fruit; a garland along its edge.
    const step = F + 0.5;
    const sz = back + 1.75;
    for (const s of [-1, 1]) {
      shrines.offer(pad, 'candle', cx + s * 0.36, step, sz, {});
      shrines.offer(pad, 'lotusVase', cx + s * 0.76, step, sz - 0.02, { ry: s * 0.4 });
    }
    shrines.offer(pad, 'fruitPlate', cx, step, sz + 0.06, { scale: 1.1 });
    shrines.garland(pad, [cx - 1, step - 0.06, back + 2.03], [cx + 1, step - 0.06, back + 2.03], 0.16, 141);
    // On the floor: the incense urn in the middle, a bay sei either side.
    shrines.offer(pad, 'incense', cx, F, back + 2.45, { scale: 2, sticks: 9, smoke: 1 });
    for (const s of [-1, 1]) shrines.offer(pad, 'baySei', cx + s * 0.8, F, back + 2.35, { tiers: 3, scale: 1.2 });
    shrines.halo(pad, cx, F + 1.1, back + 2, 2.6);
  }

  // ── Gardens across the road: a raised lawn with a long pool, beds, stupas ──
  const onGarden = (x: number, z: number) => inPad(x, z) && road(x, z) <= -CLEAR;
  const pool = { x0: 8, x1: 22, z0: 9, z1: 19 };
  const inPool = (x: number, z: number) => x > pool.x0 && x < pool.x1 && z > pool.z0 && z < pool.z1;
  for (let i = -ex; i < ex; i++)
    for (let k = -ez; k < ez; k++) {
      const [x, z] = [i + 0.5, k + 0.5];
      if (!onGarden(x, z) || inPool(x, z)) continue;
      const lawn = onGarden(x + 1, z) && onGarden(x - 1, z) && onGarden(x, z + 1) && onGarden(x, z - 1) && !inPool(x + 1, z) && !inPool(x - 1, z) && !inPool(x, z + 1) && !inPool(x, z - 1);
      if (lawn) g.put(i, 0, k, { color: pick(GRASS, hash3(i, 0, k, 47)), mat: 'mapGrass' });
      else put(i, 0, k, light(i, 0, k));
    }
  pools.add(place.x + pool.x0, place.z + pool.z0, place.x + pool.x1, place.z + pool.z1, gy + 0.7);
  for (const [x, z] of [
    [pool.x0 + 0.5, pool.z0 + 0.5],
    [pool.x1 - 0.5, pool.z0 + 0.5],
    [pool.x0 + 0.5, pool.z1 - 0.5],
    [pool.x1 - 0.5, pool.z1 - 0.5],
  ])
    lamps.add(at(x, 1.5, z), 0.45);
  // The stupas' middles (pad m): the first by the road, the explorer kneels west of it.
  const stupas = [
    [4.5, 20.5],
    [24.5, 5.5],
    [24.5, 20.5],
  ];
  // (kept off the stupas' plinths and the lawn west of them, where he kneels)
  const byStupa = (x: number, z: number) => stupas.some(([sx, sz]) => x > sx - STUPA.plinth / 2 - 4.5 && x < sx + STUPA.plinth / 2 + 0.5 && Math.abs(z + 0.25 - sz) < STUPA.plinth / 2 + 0.75);
  // Flower beds: pink and orange, sparse.
  for (let x = -ex; x < ex; x += 0.5)
    for (let z = -ez; z < ez; z += 0.5) {
      const bed = onGarden(x, z) && (z > pool.z1 + 0.5 || x > pool.x1 + 0.5) && onGarden(x + 1.5, z) && onGarden(x, z + 1.5) && onGarden(x - 1.5, z) && !byStupa(x + 0.25, z);
      if (!bed || hash3(x * 2, z * 2, 5, 79) > 0.2) continue;
      const tones = hash3(x * 2, z * 2, 6, 79) < 0.6 ? FLOWER_PINK : FLOWER_ORANGE;
      b.box(x + 0.25, gy + 1.25, z + 0.25, 0.5, 0.5, 0.5, pick(tones, hash3(x * 2, z * 2, 7, 79)), 'mapLeaf', { src });
    }
  // The stupas: weathered stone, sculpted (sacred/stupa.ts), each on a low
  // stone plinth, their fronts to the road; offerings at the foot of the
  // one by the road, where the explorer kneels on the lawn west of it
  // (roam/_worship.ts `terrace-garden-stupa`).
  for (const [n, [x, z]] of stupas.entries()) {
    const h = STUPA.plinth / 2;
    if (!onGarden(x, z) || !onGarden(x - h, z - h)) continue;
    const y = gy + 1;
    d.fill(x - h, y, z - h, x + h, y + 0.5, z + h, TP.light, { src });
    const west = -Math.PI / 2;
    shrines.place(pad, stupa({ height: STUPA.height, look: 'stone' }), x, y + 0.5, z, west);
    // (the whole plinth: the explorer keeps off it and its offerings)
    shrines.solid(pad, x, y + 1.75, z, STUPA.plinth, 3.5, STUPA.plinth);
    if (n > 0) continue;
    // (on the plinth's west edge, toward the kneeling explorer)
    const fx = x - h + 0.3;
    const top = y + 0.5;
    shrines.offer(pad, 'incense', fx, top, z, { ry: west, scale: 1.8, sticks: 9, smoke: 1 });
    for (const s of [-1, 1]) {
      shrines.offer(pad, 'candle', fx, top, z + s * 0.4, { ry: west, scale: 1.6 });
      shrines.offer(pad, 'lotusVase', fx + 0.05, top, z + s * 0.85, { ry: west + s * 0.4, scale: 1.2 });
    }
    shrines.garland(pad, [x - 1.02, top + 0.5, z - 0.9], [x - 1.02, top + 0.5, z + 0.9], 0.25, 142);
    shrines.halo(pad, fx, top + 0.6, z, 2.2);
  }
  for (const [n, [x, z, h]] of [
    [0, 15, 8],
    [23, -1, 7],
    [14, 21, 6],
  ].entries())
    if (onGarden(x, z)) gardenTree(b, x + 0.5, gy + 1, z + 0.5, h, 90 + n, n === 1 ? FLOWER_PINK : undefined);

  // ── Lower garden south-west of the pad ───────────────────────────────────
  // The overview looks at the temple across this ground: an open lawn (no
  // jungle in the way) with a lotus pool. Built only where the land is flat
  // at pad height.
  const LG = { x0: -44, x1: -12, z0: ez, z1: ez + 20 };
  const flat = (x: number, z: number) => f.heightAt(place.x + x, place.z + z) === gy && f.waterAt(place.x + x, place.z + z) === null;
  const lotus = { x0: -40, x1: -27, z0: ez + 8, z1: ez + 17 };
  let lotusOk = true;
  for (let x = lotus.x0 - 1; x <= lotus.x1 + 1 && lotusOk; x += 1) for (let z = lotus.z0 - 1; z <= lotus.z1 + 1 && lotusOk; z += 1) lotusOk = flat(x, z) && Math.abs(road(x, z)) >= 5;
  if (lotusOk) {
    d.fill(lotus.x0 - 0.5, gy, lotus.z0 - 0.5, lotus.x1 + 0.5, gy + 0.5, lotus.z1 + 0.5, TP.light, { src, keep: (x, _y, z) => !(x > lotus.x0 && x < lotus.x1 && z > lotus.z0 && z < lotus.z1) });
    pools.add(place.x + lotus.x0, place.z + lotus.z0, place.x + lotus.x1, place.z + lotus.z1, gy + 0.35);
    for (let n = 0; n < 22; n++) {
      const x = Math.floor((lotus.x0 + 0.5 + hash3(n, 1, 4, 83) * (lotus.x1 - lotus.x0 - 1)) * 2) / 2;
      const z = Math.floor((lotus.z0 + 0.5 + hash3(n, 2, 4, 83) * (lotus.z1 - lotus.z0 - 1)) * 2) / 2;
      const flower = hash3(n, 3, 4, 83) < 0.4;
      b.box(x + 0.25, gy + 0.45, z + 0.25, 0.5, flower ? 0.3 : 0.1, 0.5, flower ? pick(FLOWER_PINK, hash3(n, 4, 4, 83)) : pick(LEAF, hash3(n, 5, 4, 83)), 'mapLeaf', { src });
    }
    for (const [x, z] of [
      [lotus.x0 - 0.5, lotus.z0 - 0.5],
      [lotus.x1 + 0.5, lotus.z0 - 0.5],
      [lotus.x0 - 0.5, lotus.z1 + 0.5],
    ])
      lamps.add(at(x, 1.1, z), 0.45);
  }
  // Sparse flower beds on the lawn.
  for (let x = LG.x0; x < LG.x1; x += 0.5)
    for (let z = LG.z0 + 1; z < LG.z1; z += 0.5) {
      if (hash3(x * 2, z * 2, 8, 89) > 0.035 || !flat(x, z) || Math.abs(road(x, z)) < 5) continue;
      if (x > lotus.x0 - 1.5 && x < lotus.x1 + 1.5 && z > lotus.z0 - 1.5 && z < lotus.z1 + 1.5) continue;
      const tones = hash3(x * 2, z * 2, 9, 89) < 0.6 ? FLOWER_PINK : FLOWER_ORANGE;
      b.box(x + 0.25, gy + 0.25, z + 0.25, 0.5, 0.5, 0.5, pick(tones, hash3(x * 2, z * 2, 10, 89)), 'mapLeaf', { src });
    }

  // The fine grid is told where the 1 m stone touches it (not drawn): it hides
  // the buried insides of the cornices and shades the joints.
  const touch: [number, number, number][] = [];
  d.grid.forEach((i, j, k, c) => {
    if (c.ghost) return;
    for (const [a, e, o] of [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ]) {
      const [ni, nj, nk] = [i + a, j + e, k + o];
      const cell = g.get(Math.floor(ni / 2), Math.floor(nj / 2 - gy), Math.floor(nk / 2));
      if (cell && cell.mat !== 'mapLeaf' && !d.grid.has(ni, nj, nk)) touch.push([ni, nj, nk]);
    }
  });
  for (const [i, j, k] of touch) d.grid.ghost(i, j, k);
  g.commit();
  d.commit();

  // ── Into place ───────────────────────────────────────────────────────────
  b.translate(place.x, 0, place.z);
  const basins = (x: number, z: number) => BASINS.x.some(([x0, x1]) => x > x0 - 1 && x < x1 + 1) && z > BASINS.z[0] - 1 && z < BASINS.z[1] + 1;
  grassOverPad(f, b, { x0: place.x - ex, z0: place.z - ez, x1: place.x + ex, z1: place.z + ez, y: gy }, (x, z) => {
    const [i, k] = [Math.floor(x - place.x), Math.floor(z - place.z)];
    return Math.abs(road(x - place.x, z - place.z)) < 3.2 || onPlatform(i, k) || onGarden(x - place.x, z - place.z) || basins(x - place.x, z - place.z) || (Math.abs(i - AX) <= 5 && k >= GK && k <= causeEnd);
  });
  f.occupy(place.x - ex, place.z - ez, place.x + ex, place.z + ez);
  // The temple and a margin round it, off the pad to the west and north.
  f.occupy(place.x + P.i0 - 5, place.z + P.k0 - 5, place.x + P.i1 + 3, place.z + P.k1);
  // The lower garden stays an open lawn (terrain grass, no trees), and so does
  // the meadow west and south of it, down to the stream: the overview looks
  // at the temple across it.
  f.occupy(place.x + LG.x0, place.z + LG.z0, place.x + LG.x1, place.z + LG.z1);
  f.occupy(place.x + LG.x0 - 12, place.z - 12, place.x - ex, place.z + LG.z1 + 10);

  const object = new Group();
  object.name = `landmark:${place.id}`;
  object.add(buildVoxelMesh(b, { quality: ctx.quality === 'low' ? 'low' : 'medium', name: `landmark:${place.id}` }));
  object.add(shrines.build());
  const water = pools.build(`landmark:${place.id}:pools`);
  if (water) object.add(water);
  object.add(lamps.addLight(at(AX + 0.5, 8, GK + 10), 800, 50));
  for (const [l, name] of [
    [lamps, 'lamps'],
    [windows, 'windows'],
  ] as const) {
    const mesh = l.build(`landmark:${place.id}:${name}`);
    if (mesh) object.add(mesh);
  }
  return {
    name: `landmark:${place.id}`,
    object,
    blocks: b.boxes.length,
    update(fr: MapFrame) {
      lamps.update(fr.night, fr.t);
      windows.update(fr.night, fr.t);
      shrines.update(fr);
    },
  };
}
