import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import { SURFACE } from '../heightfield';
import { BAMBOO, dog, jar, laundry, LEAF, Local, POST, tone } from '../village/_kit';
import type { BuildEnv } from './_bhHouses';
import { GARDEN, HOMES, homeToWorld, PEN, SPIRIT, WELL, type BackSpots } from './_bhSpots';

/**
 * The yard and its work places, round the houses of the hamlet behind
 * Angkor Wat: the cattle pen by the lane's end (posts and bamboo rails, a
 * thatched lean-to over straw, a trough cut from a log), rice straw stacked
 * round poles beside it (the cattle's fodder for the dry season), the
 * spirit house in front of the old house (a tiny Angkor tower on a white
 * post, bay sei and incense, a candle that glows at night), the well
 * with its wash slab and jars, the vegetable garden in its bamboo fence
 * (morning glory, chillies, lemongrass, gourds on a trellis), washing on a
 * line, paddy drying on a tarp by the granary, the dog asleep by a
 * stair, earth steps where the lane and the back trail step up a
 * whole block of land (so the cattle, the bicycles and the people go up
 * and down them; and the explorer too), and footpaths trodden bare through
 * the grass (the children's to the jetty, to the well, the pen, the garden).
 *
 * All in map metres (`Local` with no frame: y is the world height).
 */

/** Rice straw: fresh gold, weathered grey-gold, the dark of the stack's shade side. */
const STRAW = [0xd8bc6a, 0xcaa95a, 0xbf9f52, 0xd2b464, 0xa89058];
/** Laterite and packed earth for the steps. */
const EARTH = [0x9a6a48, 0x8e6242, 0xa57352, 0x875c3f];
/** Whitewash and the spirit house's colours. */
const WHITE = 0xe8e2d4;
const OCHRE = 0xd8a060;
const GOLD = 0xd8a840;

export function buildYard(env: BuildEnv, spots: BackSpots): void {
  const src = traceSource();
  const L = new Local(env.world, src, 611);
  const g = (x: number, z: number) => env.field.heightAt(x, z);
  pen(L, g);
  haystack(env, src, 114.6, -334.2, 2.9, 1.25, 1);
  haystack(env, src, 112.9, -330.4, 2.4, 1.05, 2);
  // (the big one stands over the land's outcrop on the rise's lip, terrain/rocks.ts: it would be a dark block by the pen;
  // low and round-topped, so that from the yard it does not stand up under Angkor Wat's towers like a stupa)
  haystack(env, src, 117.24, -327.26, 3.3, 1.95, 3);
  spiritHouse(env, L, g);
  well(L, g);
  garden(L, g);
  // Washing on a line between two bamboo poles east of the children's house.
  const [ax, az] = [131.8, -338.9];
  const [bx, bz] = [135.9, -339.9];
  for (const [x, z] of [
    [ax, az],
    [bx, bz],
  ])
    L.box(x, g(x, z) + 1.0, z, 0.09, 2.0, 0.09, tone(BAMBOO, 0.4), 'mapBark');
  laundry(L, ax, az, bx, bz, g(ax, az) + 1.9);
  paddyMat(L, g);
  // The dog asleep by the children's stair.
  dog(L, 134.7, g(134.7, -344.2), -344.2);
  steps(env, src, spots);
  footpaths(env, src, spots);
}

/**
 * Footpaths trodden bare through the grass between the places people go
 * every day: the children's from the jetty round their house to its stair,
 * from the yard to the well and to the pen's gate, from the yard round the
 * blue house to the garden. The land's grass cells along them (2 m) laid
 * with thin patches of earth (solid, a few centimetres), a little inset
 * so the cells still show, patchy where the path frays; only on grass
 * (the yard's dirt is bare already), never on water.
 */
function footpaths(env: BuildEnv, src: ReturnType<typeof traceSource>, spots: BackSpots): void {
  const f = env.field;
  const c = f.cell;
  const well: [number, number] = [WELL[0] + 1.6, WELL[1] + 1.8];
  const gate: [number, number] = [PEN.x1 + 2.2, (PEN.gate[0] + PEN.gate[1]) / 2];
  const lines: (readonly (readonly [number, number])[])[] = [
    spots.routes.kids,
    [[142.5, -343.5], [139.5, -347.5], well],
    [[141.5, -339.5], [137.8, -336.2], gate],
    [[150.5, -343.5], [158.5, -343.2], [GARDEN.x0 - 0.8, (GARDEN.z0 + GARDEN.z1) / 2]],
  ];
  const seen = new Set<number>();
  for (const [li, line] of lines.entries())
    for (let i = 1; i < line.length; i++) {
      const [ax, az] = line[i - 1];
      const [bx, bz] = line[i];
      const d = Math.hypot(bx - ax, bz - az);
      for (let u = 0; u <= d; u += 0.5) {
        const x = ax + ((bx - ax) * u) / d;
        const z = az + ((bz - az) * u) / d;
        const cx = Math.floor(x / c) * c + c / 2;
        const cz = Math.floor(z / c) * c + c / 2;
        const key = Math.round(cx) * 100000 + Math.round(cz);
        if (seen.has(key)) continue;
        seen.add(key);
        if (f.surfaceAt(cx, cz) !== SURFACE.grass || f.waterAt(cx, cz) !== null) continue;
        const r = hash3(Math.round(cx), Math.round(cz), li, 612);
        // (frayed: now and then a cell of dry grass instead)
        const earth = r > 0.2;
        env.world.box(cx, f.heightAt(cx, cz) + 0.02, cz, c - 0.14, 0.05, c - 0.14, earth ? tone(PATH, r) : tone(DRY, r * 4), 'mapBark', { src, shade: 0.95 + r * 0.08 });
      }
    }
}

/** Trodden earth, and the dry grass at a path's frayed edge. */
const PATH = [0x8e6c48, 0x86653f, 0x957451, 0x7f6a48, 0x8b774f];
const DRY = [0x8ba445, 0x85a042, 0x92aa4a];

/**
 * Paddy drying in the sun behind the old house, by the granary: a big blue
 * tarp, the golden grain raked out on it in ridges, the wooden rake left
 * on it, a basket.
 */
function paddyMat(L: Local, g: (x: number, z: number) => number): void {
  const x = 146.6;
  const z = -367.6;
  const y = g(x, z);
  L.box(x, y + 0.02, z, 3.6, 0.04, 2.6, 0x2a5aa8, 'petal');
  for (let k = 0; k < 6; k++) L.box(x - 1.45 + k * 0.58, y + 0.06, z, 0.44, 0.06, 2.3, tone(STRAW, L.r(k, 70)), 'petal', 0.95 + 0.05 * (k % 2));
  L.box(x + 0.4, y + 0.1, z + 0.7, 0.9, 0.05, 0.08, 0x8a6a48, 'mapBark');
  L.box(x + 1.0, y + 0.12, z + 0.2, 0.05, 0.04, 1.6, 0x8a6a48, 'mapBark');
  L.box(x - 2.3, y + 0.2, z - 0.6, 0.5, 0.4, 0.5, tone(BAMBOO, 0.2), 'mapBark');
}

/** The cattle pen: posts and two bamboo rails round it (the gate a gap on the east side), the lean-to, straw, the trough. */
function pen(L: Local, g: (x: number, z: number) => number): void {
  const { x0, z0, x1, z1, gate, shelter } = PEN;
  const post = (x: number, z: number, i: number) => L.box(x, g(x, z) + 0.5, z, 0.14, 1.6, 0.14, tone(POST, L.r(x, z, 1 + i)), 'mapBark');
  const rails = (ax: number, az: number, bx: number, bz: number) => {
    const y = g((ax + bx) / 2, (az + bz) / 2);
    for (const h of [0.45, 0.95]) L.span(Math.min(ax, bx) - 0.04, y + h - 0.04, Math.min(az, bz) - 0.04, Math.max(ax, bx) + 0.04, y + h + 0.04, Math.max(az, bz) + 0.04, tone(BAMBOO, L.r(ax + bx, h * 10, 2)), 'mapBark');
  };
  // Posts every ~1.5 m.
  const along = (a: number, b: number) => {
    const n = Math.max(1, Math.round(Math.abs(b - a) / 1.5));
    return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
  };
  along(x0, x1).forEach((x, i) => {
    post(x, z0, i);
    post(x, z1, i + 7);
  });
  along(z0, z1).forEach((z, i) => {
    post(x0, z, i + 13);
    if (z < gate[0] - 0.1 || z > gate[1] + 0.1) post(x1, z, i + 17);
  });
  post(x1, gate[0], 23);
  post(x1, gate[1], 24);
  rails(x0, z0, x1, z0);
  rails(x0, z1, x1, z1);
  rails(x0, z0, x0, z1);
  rails(x1, z0, x1, gate[0]);
  rails(x1, gate[1], x1, z1);
  // The gate's bars, slid out and leaning on the fence beside the opening.
  const gy = g(x1, gate[1] + 1);
  for (const [k, h] of [0.3, 0.75, 1.15].entries()) L.span(x1 + 0.1, gy + h - 0.04, gate[1] + 0.2, x1 + 0.18, gy + h + 0.04, gate[1] + 2.6 - k * 0.1, tone(BAMBOO, 0.3 + k * 0.2), 'mapBark');
  // The lean-to over the west end: posts, a thatch roof sloping east in three courses.
  const sy = g((x0 + shelter) / 2, (z0 + z1) / 2);
  for (const z of [z0 + 0.3, (z0 + z1) / 2, z1 - 0.3]) {
    L.span(x0 + 0.15, sy - 0.2, z - 0.08, x0 + 0.31, sy + 2.55, z + 0.08, tone(POST, L.r(z, 3)), 'mapBark');
    L.span(shelter - 0.08, sy - 0.2, z - 0.08, shelter + 0.08, sy + 2.0, z + 0.08, tone(POST, L.r(z, 4)), 'mapBark');
  }
  const THATCH = [0x8f7d62, 0x857358, 0x9a876a, 0x7a6a52];
  const run = (shelter + 0.6 - (x0 - 0.5)) / 3;
  for (let k = 0; k < 3; k++) {
    const xa = x0 - 0.5 + k * run;
    for (let s = 0, i = 0; s < z1 - z0 + 0.9; s += 1.6, i++) L.span(xa, sy + 2.5 - k * 0.24, z0 - 0.45 + s, xa + run + 0.1, sy + 2.72 - k * 0.24, Math.min(z1 + 0.45, z0 - 0.45 + s + 1.6), tone(THATCH, L.r(k, i, 5)), 'mapBark', 0.95);
  }
  // Straw on the ground under it (soft: the cattle lie on it).
  for (let i = 0; i < 4; i++) {
    const x = x0 + 0.9 + (i % 2) * 2.0;
    const z = z0 + 1.6 + Math.floor(i / 2) * 3.8;
    L.box(x, g(x, z) + 0.04, z, 1.9 + L.r(i, 6) * 0.6, 0.08, 2.4, tone(STRAW, L.r(i, 7)), 'petal', 0.9);
  }
  // The trough: a log hollowed out, water in it, along the north fence.
  const tx = (x0 + x1) / 2 + 1.5;
  const tz = z0 + 0.55;
  const ty = g(tx, tz);
  L.span(tx - 1.0, ty, tz - 0.25, tx + 1.0, ty + 0.42, tz + 0.25, 0x5e4630, 'mapBark');
  L.span(tx - 0.85, ty + 0.3, tz - 0.14, tx + 0.85, ty + 0.44, tz + 0.14, 0x3a4a48, 'mapStone', 0.8);
}

/**
 * Rice straw stacked round a pole: a loaf, bulging a little over the middle
 * and rounding over the top into a low dome (each course turned, a little
 * ragged), the pole's end just showing (no knot, no spire: a tall stepped
 * stack with a finial reads as a stupa).
 */
function haystack(env: BuildEnv, src: ReturnType<typeof traceSource>, x: number, z: number, h: number, r: number, seed: number): void {
  const y = env.field.heightAt(x, z);
  const n = Math.round(h / 0.3);
  env.world.box(x, y + h / 2 + 0.1, z, 0.1, h + 0.2, 0.1, 0x6a5238, 'mapBark', { src });
  for (let j = 0; j < n; j++) {
    const t = j / (n - 1);
    // (bulging over the middle; over the top half a dome: the radius falls as a circle's)
    const dome = t > 0.5 ? Math.sqrt(Math.max(0.08, 1 - ((t - 0.5) / 0.55) ** 2)) : 1;
    const rr = r * (0.94 + 0.1 * Math.sin(t * Math.PI * 0.9)) * dome * (0.97 + 0.06 * hash3(j, seed, 5, 91));
    const c = STRAW[Math.floor(hash3(j, seed, 3, 91) * STRAW.length)];
    env.world.box(x, y + j * 0.3 + 0.16, z, rr * 2, 0.34, rr * 2, c, 'mapBark', { src, ry: (j % 3) * (Math.PI / 6) + seed, shade: 0.9 + 0.08 * t });
  }
  // (straw pulled out round the foot)
  for (let k = 0; k < 3; k++) {
    const a = hash3(k, seed, 4, 92) * Math.PI * 2;
    env.world.box(x + Math.cos(a) * (r + 0.4), y + 0.03, z + Math.sin(a) * (r + 0.4), 0.7, 0.06, 0.4, STRAW[k + 1], 'petal', { src, ry: a });
  }
}

/**
 * The spirit house in front of the old house, the Khmer way (as every Khmer
 * home has one, for the spirit of the place): a tiny Angkor tower (prasat)
 * on a whitewashed post, facing the yard — a redented base (the square
 * plan stepped in at the corners), the sanctum with its dark doorway and
 * false doors on the other sides, the tower rising in shrinking tiers set
 * with little leaf antefixes at their corners, a lotus bud on top; white,
 * ochre and gold. On the platform before it: two bay sei (banana-leaf
 * cones), incense in a pot, a candle, flowers, a cup of water, bananas, a
 * marigold garland. The candle and the incense glow at night.
 */
function spiritHouse(env: BuildEnv, L: Local, g: (x: number, z: number) => number): void {
  const h = HOMES[0];
  const [x, z] = homeToWorld(h, SPIRIT[0], SPIRIT[1]);
  const y = g(x, z);
  /** A redented square (a cross of two boxes: the Angkorian plan), its middle at height `cy`. */
  const cross = (cy: number, w: number, hgt: number, c: number, sh = 1) => {
    L.box(x, cy, z, w, hgt, w * 0.7, c, 'mapStone', sh);
    L.box(x, cy, z, w * 0.7, hgt, w, c, 'mapStone', sh);
  };
  // The post on its footing, the platform with a gold edge.
  L.box(x, y + 0.1, z, 0.62, 0.2, 0.62, WHITE, 'mapStone', 0.92);
  L.box(x, y + 0.78, z, 0.24, 1.16, 0.24, WHITE, 'mapStone');
  L.box(x, y + 1.41, z, 0.94, 0.1, 0.86, GOLD, 'mapStone');
  L.box(x, y + 1.48, z, 0.88, 0.05, 0.8, WHITE, 'mapStone', 0.96);
  // Base, sanctum (the doorway on its front, +z, false doors round it), cornice.
  cross(y + 1.57, 0.56, 0.12, OCHRE);
  cross(y + 1.81, 0.42, 0.36, WHITE, 1.02);
  L.box(x, y + 1.79, z + 0.212, 0.13, 0.25, 0.02, 0x3a2418, 'mapStone', 0.8);
  L.box(x, y + 1.94, z + 0.216, 0.2, 0.04, 0.02, GOLD, 'mapStone');
  for (const s of [-1, 1]) L.box(x + s * 0.212, y + 1.79, z, 0.02, 0.23, 0.12, OCHRE, 'mapStone');
  L.box(x, y + 1.79, z - 0.212, 0.12, 0.23, 0.02, OCHRE, 'mapStone');
  cross(y + 2.02, 0.5, 0.06, GOLD);
  // The tower: tiers shrinking upward, leaf antefixes at their corners, the lotus bud.
  let ty = y + 2.05;
  let w = 0.4;
  for (let k = 0; k < 4; k++) {
    const hgt = 0.12 - k * 0.014;
    cross(ty + hgt / 2, w, hgt, k % 2 ? OCHRE : WHITE, 1 + k * 0.03);
    for (const [sx, sz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ])
      L.box(x + sx * w * 0.33, ty + hgt + 0.022, z + sz * w * 0.33, 0.035, 0.045, 0.035, GOLD, 'mapStone');
    ty += hgt;
    w *= 0.78;
  }
  L.box(x, ty + 0.05, z, 0.1, 0.1, 0.1, GOLD, 'mapStone');
  L.box(x, ty + 0.13, z, 0.06, 0.07, 0.06, GOLD, 'mapStone', 1.08);
  L.box(x, ty + 0.19, z, 0.025, 0.06, 0.025, GOLD, 'mapStone', 1.1);
  // Offerings on the platform before it.
  baySei(L, x - 0.3, y + 1.505, z + 0.27);
  baySei(L, x + 0.31, y + 1.505, z + 0.25, 0.85);
  L.box(x - 0.06, y + 1.545, z + 0.34, 0.07, 0.08, 0.07, 0xe8eef2, 'mapStone');
  L.box(x + 0.02, y + 1.52, z + 0.4, 0.3, 0.03, 0.05, 0xf0a020, 'petal');
  L.box(x - 0.02, y + 1.535, z + 0.2, 0.16, 0.05, 0.08, 0xe8c840, 'petal');
  // Incense sticks in a little pot, the candle.
  L.box(x + 0.12, y + 1.55, z + 0.3, 0.09, 0.09, 0.09, 0x8a5a3a, 'mapStone');
  for (const dx of [-0.02, 0.02]) L.box(x + 0.12 + dx, y + 1.71, z + 0.3, 0.012, 0.24, 0.012, 0x6a3a2a, 'petal');
  env.glow(x + 0.12, y + 1.84, z + 0.3, 0.03, 0.03, 0.03, 0, 0xff6a2a);
  L.box(x - 0.16, y + 1.55, z + 0.36, 0.05, 0.1, 0.05, 0xf4ecd8, 'mapStone');
  env.glow(x - 0.16, y + 1.64, z + 0.36, 0.04, 0.07, 0.04, 0, 0xffb050, 0.9);
}

/**
 * A bay sei (បាយសី): the banana-leaf offering, a cone of folded green leaf
 * in tiers with flowers tucked in and a boiled egg on its tip, at (x, y, z)
 * (its foot), `s` its size (1: 0.35 m tall).
 */
export function baySei(L: Local, x: number, y: number, z: number, s = 1): void {
  const greens = [0x4e8a30, 0x5a9a38, 0x437a2a, 0x62a040];
  for (let k = 0; k < 4; k++) {
    const w = (0.15 - k * 0.03) * s;
    L.box(x, y + (0.035 + k * 0.068) * s, z, w, 0.068 * s, w, greens[k], 'mapLeaf', 1 + k * 0.04);
  }
  L.box(x, y + 0.3 * s, z, 0.045 * s, 0.055 * s, 0.045 * s, 0xf4f0e6, 'petal');
  L.box(x + 0.055 * s, y + 0.1 * s, z + 0.055 * s, 0.03 * s, 0.03 * s, 0.03 * s, 0xe8508a, 'petal');
  L.box(x - 0.05 * s, y + 0.17 * s, z + 0.045 * s, 0.03 * s, 0.03 * s, 0.03 * s, 0xf0c030, 'petal');
  L.box(x, y + 0.24 * s, z + 0.035 * s, 0.025 * s, 0.025 * s, 0.025 * s, 0xf4f0f0, 'petal');
}

/** The well: a round shaft of concrete rings, a frame with a pulley and a bucket, a wash slab, jars and a basin. */
function well(L: Local, g: (x: number, z: number) => number): void {
  const [x, z] = WELL;
  const y = g(x, z);
  const conc = [0xa8a298, 0x9c968c, 0xb2ab9f];
  for (let k = 0; k < 2; k++) {
    L.box(x, y + 0.2 + k * 0.4, z, 1.2, 0.38, 1.2, tone(conc, L.r(k, 1, 30)), 'mapStone');
  }
  L.box(x, y + 0.81, z, 0.84, 0.04, 0.84, 0x24303a, 'mapStone', 0.7);
  for (const dx of [-0.75, 0.75]) L.box(x + dx, y + 1.1, z, 0.12, 2.2, 0.12, tone(POST, L.r(dx, 31)), 'mapBark');
  L.box(x, y + 2.15, z, 1.7, 0.12, 0.12, tone(POST, 0.6), 'mapBark');
  L.box(x, y + 2.0, z, 0.14, 0.18, 0.14, 0x3a332c, 'mapStone');
  L.box(x, y + 1.62, z, 0.02, 0.72, 0.02, 0xc8b88a, 'petal');
  L.box(x, y + 1.14, z, 0.26, 0.24, 0.26, 0x2a6ac8, 'mapStone');
  // The wash slab beside it, a basin and a jar.
  L.span(x + 0.9, y, z - 0.7, x + 2.3, y + 0.14, z + 0.6, 0x9a948a, 'mapStone', 0.95);
  L.box(x + 1.4, y + 0.22, z - 0.2, 0.5, 0.16, 0.5, 0xe0503a, 'mapStone');
  jar(L, x - 1.0, y, z + 0.8);
  jar(L, x - 1.05, y, z - 0.4, 0.8);
}

/** The vegetable garden: raised beds of greens, chillies and lemongrass, a gourd trellis, a low bamboo fence round it. */
function garden(L: Local, g: (x: number, z: number) => number): void {
  const { x0, z0, x1, z1 } = GARDEN;
  const y = g((x0 + x1) / 2, (z0 + z1) / 2);
  // Fence: posts and a woven band of split bamboo (a gap on the yard side for the gardener).
  const gapZ = (z0 + z1) / 2;
  for (let x = x0; x <= x1 + 0.01; x += 1.35)
    for (const z of [z0, z1]) L.box(x, y + 0.45, z, 0.08, 0.9, 0.08, tone(BAMBOO, L.r(x, z, 50)), 'mapBark');
  for (let z = z0; z <= z1 + 0.01; z += 1.3)
    for (const x of [x0, x1]) if (x !== x0 || Math.abs(z - gapZ) > 0.7) L.box(x, y + 0.45, z, 0.08, 0.9, 0.08, tone(BAMBOO, L.r(x, z, 51)), 'mapBark');
  for (const h of [0.35, 0.7]) {
    L.span(x0, y + h - 0.03, z0 - 0.03, x1, y + h + 0.03, z0 + 0.03, tone(BAMBOO, h), 'mapBark');
    L.span(x0, y + h - 0.03, z1 - 0.03, x1, y + h + 0.03, z1 + 0.03, tone(BAMBOO, h + 0.2), 'mapBark');
    L.span(x1 - 0.03, y + h - 0.03, z0, x1 + 0.03, y + h + 0.03, z1, tone(BAMBOO, h + 0.1), 'mapBark');
    L.span(x0 - 0.03, y + h - 0.03, z0, x0 + 0.03, y + h + 0.03, gapZ - 0.7, tone(BAMBOO, h + 0.3), 'mapBark');
    L.span(x0 - 0.03, y + h - 0.03, gapZ + 0.7, x0 + 0.03, y + h + 0.03, z1, tone(BAMBOO, h + 0.4), 'mapBark');
  }
  // Two raised beds of dark earth, running east–west.
  const soil = 0x4e3a2a;
  const beds: [number, number][] = [
    [z0 + 0.7, z0 + 2.4],
    [z0 + 3.4, z1 - 0.6],
  ];
  beds.forEach(([za, zb], b) => {
    L.span(x0 + 0.5, y, za, x1 - 0.4, y + 0.22, zb, soil, 'mapStone', 0.9);
    // Rows: morning glory (low, bright), chillies (dark with red), lemongrass (tall, pale).
    for (let x = x0 + 0.8, i = 0; x < x1 - 0.6; x += 0.55, i++) {
      const kind = (i + b) % 3;
      const zc = (za + zb) / 2 + (L.r(i, b, 52) - 0.5) * 0.3;
      if (kind === 0) L.box(x, y + 0.34, zc, 0.5, 0.24, (zb - za) * 0.7, tone([0x5aa03a, 0x68ac40, 0x4e9434], L.r(i, b, 53)), 'mapLeaf');
      else if (kind === 1) {
        L.box(x, y + 0.42, zc, 0.36, 0.4, 0.36, tone(LEAF, L.r(i, b, 54)), 'mapLeaf');
        L.box(x + 0.08, y + 0.5, zc + 0.1, 0.08, 0.08, 0.08, 0xd8281c, 'petal');
      } else L.box(x, y + 0.6, zc, 0.24, 0.76, 0.24, tone([0x9ab45a, 0xa8c064, 0x8aa84e], L.r(i, b, 55)), 'mapLeaf');
    }
  });
  // A gourd trellis over the east end: bamboo posts and a lattice top, leaves, hanging gourds, yellow flowers.
  const tx0 = x1 - 1.6;
  for (const [x, z] of [
    [tx0, z0 + 0.4],
    [x1 - 0.2, z0 + 0.4],
    [tx0, z1 - 0.3],
    [x1 - 0.2, z1 - 0.3],
  ])
    L.box(x, y + 0.95, z, 0.07, 1.9, 0.07, tone(BAMBOO, L.r(x, z, 56)), 'mapBark');
  for (let z = z0 + 0.6; z < z1 - 0.3; z += 0.9) L.span(tx0, y + 1.88, z - 0.03, x1 - 0.2, y + 1.93, z + 0.03, tone(BAMBOO, 0.5), 'mapBark');
  for (let k = 0; k < 6; k++) {
    const x = tx0 + 0.3 + L.r(k, 57) * 1.1;
    const z = z0 + 0.8 + L.r(k, 58) * (z1 - z0 - 1.4);
    L.box(x, y + 1.98, z, 0.7, 0.14, 0.7, tone(LEAF, L.r(k, 59)), 'mapLeaf');
    if (k % 2 === 0) L.box(x + 0.1, y + 1.62, z, 0.14, 0.38, 0.14, 0x8ab04a, 'mapLeaf');
    else L.box(x - 0.1, y + 2.07, z + 0.1, 0.1, 0.06, 0.1, 0xf0d040, 'petal');
  }
}

/**
 * Earth steps where the lane and the back trail step up a whole block (2 m):
 * eight steps of a quarter metre, the width of the way, laid on the low side
 * up to the edge (turned along the way), so the cattle, the bicycles and
 * the people walk up and down them (and the explorer: solid, stone family).
 */
function steps(env: BuildEnv, src: ReturnType<typeof traceSource>, spots: BackSpots): void {
  for (const [r, ramp] of spots.ramps.entries()) {
    const ry = Math.atan2(ramp.ux, ramp.uz);
    const rise = ramp.high - ramp.low;
    const n = Math.max(2, Math.round(rise / 0.25));
    const run = 0.5;
    for (let k = 1; k <= n; k++) {
      // (step k: its own tread's length, from below the low ground up to the tread; the last runs 0.3 m into the high ground)
      const a = -(n - k + 1) * run;
      const b = k === n ? 0.3 : a + run;
      const mid = (a + b) / 2;
      const top = ramp.low + (rise * k) / n;
      const x = ramp.x + ramp.ux * mid;
      const z = ramp.z + ramp.uz * mid;
      env.world.box(x, (ramp.low - 0.3 + top) / 2, z, 2.6, top - ramp.low + 0.3, b - a, EARTH[Math.floor(hash3(k, r, 60, 93) * EARTH.length)], 'mapStone', { src, ry, shade: 0.92 + 0.08 * (k / n) });
    }
    // Flat stones set along the edges of the flight.
    for (const s of [-1, 1]) {
      const x = ramp.x - ramp.ux * (n * run) * 0.5 + ramp.uz * s * 1.45;
      const z = ramp.z - ramp.uz * (n * run) * 0.5 - ramp.ux * s * 1.45;
      env.world.box(x, env.field.heightAt(x, z) + 0.15, z, 0.4, 0.3, n * run, 0x8a857c, 'mapStone', { src, ry, shade: 0.9 });
    }
  }
}
