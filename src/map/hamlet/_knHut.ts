import { hash3 } from '../../voxel/random';
import { BAMBOO, FLAGSTONE, pickTone, POST, ROPE, Site, THATCH } from '../jungle/_campKit';
import type { KnFx } from './_knFx';
import type { KnHut } from './_knSite';

/**
 * A picnic hut at Kulen's falls (ខ្ទម): a raised deck of split bamboo on
 * bamboo posts, open all round, under a steep roof of dried palm-leaf
 * thatch (a plain gable, its ridge bundled and tied), a bright woven
 * plastic mat (kantel) on the deck, a pair of pillows, and in some a tin
 * lantern hung from the front beam (lit at dusk: `_knFx.ts`). Families rent
 * them for the day, sit on the mat round their food and hang a hammock
 * between the back posts (the people part's, `HAMMOCK_HUTS`); the deck is
 * walked on (solid), a log at the back is the step up.
 *
 * Hut space (m): +z its front (to the water), +x its left, y up from the
 * terrace; true sizes × 1.4 like the people. Families of `mapBark` (bamboo,
 * wood, thatch), `mapStone` (footings, tin), `petal` (the mat, pillows,
 * ropes), no more. (No horns at the ridge's ends: the curled gable horns
 * are Thai, not Khmer.)
 */

/** Post rows: half the width and depth between the posts' middles (m). */
export const POST_X = 1.6;
export const POST_Z = 1.35;
/** Eaves (on the posts) and the ridge's rise over them (m, over the terrace / the eaves). */
const EAVE = 3.05;
const RISE = 1.3;
/** The roof's overhang past the posts: front and back, and at the gable ends (m). */
const OVER_Z = 0.6;
const OVER_X = 0.4;

/**
 * Where people sit on a hut's deck (local x, z) and the way they face
 * (local yaw: 0 = to the water): round the mat, two on its sides facing
 * in, one at the back facing the water, two on the front edge looking out.
 */
export const HUT_SEATS: readonly [number, number, number][] = [
  [-0.85, 0.3, Math.PI / 2],
  [0.85, 0.3, -Math.PI / 2],
  [0, -0.8, 0],
  [-0.55, 1.0, 0],
  [0.55, 1.0, 0],
];
/** The food on the mat (local x, z). */
export const HUT_FOOD: readonly [number, number] = [0, 0.3];
/** A hammock between the back posts: its ends' height over the deck and its sag (m). */
export const HAMMOCK_HANG = 1.3;
export const HAMMOCK_SAG = 0.62;
/** Huts (in `KulenSite.huts` order) where a family hangs a hammock (the people part's), and one hanging empty. */
export const HAMMOCK_HUTS = [1, 2];
/** (the empty one is the explorer's to lie in: roam/_hammock.ts) */
export const HAMMOCK_EMPTY = 3;
/** Huts with a lantern under the ridge. */
const LANTERN_HUTS = [0, 1, 2, 4];

/** Mat colours: woven plastic, a ground and its stripes. */
const MATS: [number, number, number][] = [
  [0x2f6fb0, 0xe8d24a, 0xd8403a],
  [0xc8423a, 0x2e7a4e, 0xf0e2c0],
  [0x3a8a5a, 0xe86a8a, 0xf2ecd8],
  [0xe0a030, 0x2a4a8a, 0xc83a3a],
  [0x7a3a8a, 0xf0d060, 0x3a9a8a],
];
const PILLOWS = [0xc8302a, 0xe0b040, 0x2a5aa0, 0x2e8a5a];

/**
 * Build hut `i` into `s`; its thatch (the courses, the eaves' fringe, the ridge's cap) into `roof` (the picnic
 * place keeps it out of the walk map: tilted, the courses would fill their whole bounds there, a low ceiling over
 * the deck's edges and a wall at the eaves, and the roaming explorer — 2.4 m tall — could not step up onto it).
 */
export function buildHut(s: Site, hut: KnHut, i: number, fx: KnFx, roof: Site = s): void {
  const seed = s.seed;
  const tone = (list: readonly number[], a: number, b: number, c: number) => pickTone(list, a, b, c, seed);
  const r = (a: number, b = 0) => hash3(a, b, i, seed + 17);
  const FLOOR = hut.floor - hut.ground;

  // ── Posts: bamboo on flat stones (down to the bed where the front stands in the water) ──
  for (const [px, pz] of [
    [-POST_X, -POST_Z],
    [POST_X, -POST_Z],
    [-POST_X, POST_Z],
    [POST_X, POST_Z],
  ]) {
    const g = s.ground(px, pz);
    const wet = g < -0.4;
    const y0 = g - (wet ? 0.3 : 0.1);
    s.box(px, (y0 + EAVE) / 2, pz, 0.16, EAVE - y0, 0.16, tone(BAMBOO, px * 10, pz * 10, 1), 'mapBark');
    // (the nodes of the bamboo: thin rings, a little darker)
    for (let y = y0 + 0.55; y < EAVE - 0.2; y += 0.75) s.box(px, y, pz, 0.19, 0.05, 0.19, tone(BAMBOO, y * 10, px, 2), 'mapBark', { shade: 0.82 });
    if (!wet) s.box(px, g + 0.05, pz, 0.42, 0.14, 0.42, tone(FLAGSTONE, px, pz, 3), 'mapStone');
  }
  // Middle posts under the deck; bearers across the front and back, joists front to back.
  for (const pz of [-POST_Z, POST_Z]) {
    const g = s.ground(0, pz);
    s.box(0, (g + FLOOR - 0.18) / 2, pz, 0.13, Math.max(0.1, FLOOR - 0.18 - g), 0.13, tone(POST, 7, pz * 10, 4), 'mapBark');
    s.box(0, FLOOR - 0.13, pz, 2 * POST_X + 0.25, 0.11, 0.12, tone(POST, 8, pz * 10, 5), 'mapBark');
  }
  for (const px of [-1.1, 0, 1.1]) s.box(px, FLOOR - 0.08, 0, 0.09, 0.07, 2 * POST_Z + 0.4, tone(POST, px * 10, 9, 6), 'mapBark');
  // The deck: split bamboo across, alternately pale and aged, the front edge a whole pole.
  const slats = 12;
  const depth = 2 * POST_Z + 0.3;
  for (let k = 0; k < slats; k++) {
    const z = -depth / 2 + (k + 0.5) * (depth / slats);
    const c = k % 2 ? tone(BAMBOO, k, 10, 7) : tone([0xb89a62, 0xae915a, 0xc0a26a], k, 11, 8);
    s.box(0, FLOOR - 0.025, z, 2 * POST_X + 0.2, 0.05, depth / slats - 0.03, c, 'mapBark', { shade: 0.94 + 0.1 * r(k, 1) });
  }
  s.box(0, FLOOR - 0.02, depth / 2 + 0.05, 2 * POST_X + 0.3, 0.1, 0.1, tone(BAMBOO, 12, 12, 9), 'mapBark', { shade: 0.9 });
  // (a log at the back to step up on)
  const lg = s.ground(0, -depth / 2 - 0.45);
  s.log([-0.7, lg + 0.16, -depth / 2 - 0.45], [0.7, lg + 0.16, -depth / 2 - 0.45], 0.34, tone(POST, 13, 13, 10), 'mapBark');
  // A low rail along one side's back half (not all huts).
  if (r(1, 2) < 0.6) {
    const sx = r(2, 3) < 0.5 ? 1 : -1;
    s.box(sx * POST_X, FLOOR + 0.45, -POST_Z / 2, 0.07, 0.07, POST_Z + 0.1, tone(BAMBOO, 14, 14, 11), 'mapBark');
    s.box(sx * POST_X, FLOOR + 0.22, 0, 0.08, 0.44, 0.08, tone(BAMBOO, 15, 15, 12), 'mapBark');
  }

  // ── The roof: plates on the posts, a ridge pole, two slopes of thatch in courses ──
  for (const pz of [-POST_Z, POST_Z]) s.box(0, EAVE + 0.05, pz, 2 * POST_X + 0.3, 0.1, 0.12, tone(POST, 16, pz * 10, 13), 'mapBark');
  for (const px of [-POST_X, POST_X]) {
    s.box(px, EAVE + 0.05, 0, 0.12, 0.1, 2 * POST_Z + 0.3, tone(POST, px * 10, 17, 14), 'mapBark');
    // (the gable's bamboo rafters and king post)
    s.beam([px, EAVE + 0.08, -POST_Z - OVER_Z * 0.7], [px, EAVE + RISE - 0.05, 0], 0.09, 0.09, tone(BAMBOO, px, 18, 15), 'mapBark');
    s.beam([px, EAVE + 0.08, POST_Z + OVER_Z * 0.7], [px, EAVE + RISE - 0.05, 0], 0.09, 0.09, tone(BAMBOO, px, 19, 16), 'mapBark');
    s.box(px, EAVE + RISE / 2, 0, 0.08, RISE, 0.08, tone(BAMBOO, px, 20, 17), 'mapBark');
  }
  s.box(0, EAVE + RISE - 0.1, 0, 2 * POST_X + 2 * OVER_X, 0.1, 0.1, tone(POST, 21, 21, 18), 'mapBark');
  const slope = Math.atan2(RISE, POST_Z);
  const reach = (POST_Z + OVER_Z) / Math.cos(slope);
  const courses = 5;
  const cw = reach / courses;
  const pieces = 6;
  const span = 2 * (POST_X + OVER_X);
  const pl = span / pieces;
  for (const sz of [1, -1])
    for (let c = 0; c < courses; c++) {
      // From the eave (c = 0) up to the ridge, each course over the one below.
      const u = reach - (c + 0.55) * cw;
      const z = sz * u * Math.cos(slope);
      const y = EAVE + RISE - u * Math.sin(slope) + 0.1 + 0.025 * c;
      for (let p = 0; p < pieces; p++) {
        const x = -span / 2 + (p + 0.5) * pl;
        const sh = 0.84 + 0.08 * (c / courses) + 0.14 * hash3(c, p, sz + 5, seed + i);
        roof.box(x, y + (hash3(c, p, sz + 7, seed + i) - 0.5) * 0.05, z, pl + 0.03, 0.15 + 0.05 * hash3(c, p, sz + 9, seed), cw * 1.3, tone(THATCH, c, p, sz + 30 + i), 'mapBark', { rx: sz * slope, shade: sh });
      }
    }
  // The ragged fringe along the eaves (darker: the roof reads as layers of leaves).
  for (const sz of [1, -1]) {
    const z = sz * (POST_Z + OVER_Z - 0.05);
    const y = EAVE - OVER_Z * Math.tan(slope) + 0.05;
    for (let x = -span / 2 + 0.17; x < span / 2; x += 0.34) {
      const len = 0.16 + 0.18 * hash3(x * 10, sz, 1, seed + i);
      roof.box(x, y - len / 2, z, 0.3, len, 0.08, tone(THATCH, x * 10, sz, 31), 'mapBark', { shade: 0.72 });
    }
  }
  // Ridge: a bundled cap of thatch tied down with split bamboo (a plain Khmer gable: no horns at its ends).
  const ry = EAVE + RISE + 0.12;
  for (let p = 0; p < 5; p++) roof.box(-span / 2 + ((p + 0.5) * span) / 5, ry, 0, span / 5 + 0.02, 0.24, 0.42, tone(THATCH, p, 40, 41 + i), 'mapBark', { shade: 0.7 });
  for (let p = 0; p <= 4; p++) roof.box(-span / 2 + 0.3 + (p * (span - 0.6)) / 4, ry + 0.02, 0, 0.06, 0.27, 0.46, tone(BAMBOO, p, 42, 43), 'mapBark', { shade: 0.9 });

  // ── The mat, the pillows ──
  const [ground, stripe, border] = MATS[i % MATS.length];
  const mw = 2.7;
  const md = 2.2;
  s.box(0, FLOOR + 0.012, 0.1, mw, 0.025, md, ground, 'petal');
  for (const d of [-0.62, 0, 0.62]) s.box(0, FLOOR + 0.02, 0.1 + d, mw - 0.02, 0.025, 0.14, stripe, 'petal', { shade: 0.95 });
  for (const sx of [1, -1]) s.box(sx * (mw / 2 - 0.06), FLOOR + 0.022, 0.1, 0.12, 0.026, md - 0.02, border, 'petal');
  // (triangular pillows, Khmer style: a block and a smaller one on it)
  const pc = PILLOWS[Math.floor(r(3, 4) * PILLOWS.length) % PILLOWS.length];
  for (const sx of r(4, 5) < 0.5 ? [1] : [1, -1]) {
    s.box(sx * 1.05, FLOOR + 0.13, -1.0, 0.55, 0.22, 0.36, pc, 'petal', { ry: sx * 0.2 });
    s.box(sx * 1.05, FLOOR + 0.3, -1.08, 0.5, 0.14, 0.2, pc, 'petal', { ry: sx * 0.2, shade: 1.08 });
  }

  // ── A hammock: the ties on the back posts (and an empty one hanging in one hut) ──
  const hy = FLOOR + HAMMOCK_HANG;
  if (HAMMOCK_HUTS.includes(i) || i === HAMMOCK_EMPTY)
    for (const sx of [1, -1]) s.box(sx * POST_X, hy, -POST_Z, 0.22, 0.08, 0.22, tone(ROPE, sx, 46, 47), 'petal');
  if (i === HAMMOCK_EMPTY) {
    const n = 9;
    const cloth = [0x3a7ac0, 0xe0a030, 0x2e8a5a][Math.floor(r(5, 6) * 3)];
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n;
      const x = POST_X - 2 * POST_X * u;
      const sag = HAMMOCK_SAG * 4 * u * (1 - u);
      // (the curve's tilt there: it rises toward either post)
      const tilt = Math.atan((HAMMOCK_SAG * 2 * (1 - 2 * u)) / POST_X);
      const edge = u < 0.18 || u > 0.82;
      // (ropes near the posts, the cloth between, gathered to the ends)
      if (edge) s.box(x, hy - sag, -POST_Z, (2 * POST_X) / n / Math.cos(tilt) + 0.02, 0.05, 0.08, tone(ROPE, k, 48, 49), 'petal', { rz: tilt });
      else s.box(x, hy - sag - 0.04, -POST_Z, (2 * POST_X) / n / Math.cos(tilt) + 0.03, 0.06, 0.62 - Math.abs(u - 0.5) * 0.5, cloth, 'petal', { rz: tilt, shade: k % 2 ? 1 : 0.9 });
    }
  }

  // ── The lantern, hung on a wire from the front beam (seen from the water) ──
  if (LANTERN_HUTS.includes(i)) {
    const lx = i % 2 ? 0.6 : -0.6;
    const lz = POST_Z - 0.05;
    const ly = EAVE - 0.55;
    s.box(lx, (ly + 0.22 + EAVE) / 2, lz, 0.025, EAVE - ly - 0.22, 0.025, 0x3a3530, 'mapStone');
    s.box(lx, ly + 0.2, lz, 0.26, 0.05, 0.26, 0x6d6a64, 'mapStone');
    s.box(lx, ly - 0.18, lz, 0.24, 0.05, 0.24, 0x6d6a64, 'mapStone');
    for (const [a, c] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ])
      s.box(lx + a * 0.1, ly + 0.01, lz + c * 0.1, 0.025, 0.36, 0.025, 0x6d6a64, 'mapStone');
    const w = s.world(lx, ly, lz);
    fx.lantern(w.x, w.y, w.z, s.yaw);
  }
}

/**
 * A hut's hammock (between its back posts) on the map: its two ends (m) and
 * sag, for the people part's hammock with someone in it.
 */
export function hutHammock(hut: KnHut): { a: [number, number, number]; b: [number, number, number]; sag: number } {
  const c = Math.cos(hut.yaw);
  const s = Math.sin(hut.yaw);
  const y = hut.floor + HAMMOCK_HANG;
  const at = (lx: number, lz: number): [number, number, number] => [hut.x + lx * c + lz * s, y, hut.z - lx * s + lz * c];
  return { a: at(POST_X, -POST_Z), b: at(-POST_X, -POST_Z), sag: HAMMOCK_SAG };
}

/** A point on a hut's deck (local x, z) on the map, and the world yaw for a local one. */
export function onHut(hut: KnHut, lx: number, lz: number, yaw = 0): { x: number; y: number; z: number; yaw: number } {
  const c = Math.cos(hut.yaw);
  const s = Math.sin(hut.yaw);
  return { x: hut.x + lx * c + lz * s, y: hut.floor, z: hut.z - lx * s + lz * c, yaw: hut.yaw + yaw };
}
