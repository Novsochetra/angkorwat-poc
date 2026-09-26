import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { HeightField } from '../heightfield';
import { Frame } from '../landmarks/_prasatKit';
import { mooredSkiff, type Floaters } from './_floating';
import { houseBody, WALL_H } from './_house';
import { BAMBOO, banana, bougainvillea, DECK, dog, drapedNet, hen, jar, khmerHat, lantern, laundry, Local, lotus, mat, moto, palm, POST, potPlant, shadeTree, skiff, spiritHouse, stove, tone, traps, TRIM, toWorld, type GlowFn } from './_kit';
import type { VillageLights } from './_lights';
import type { SmokeSource } from './_smoke';
import { frontStair, GROUND, JETTY, LAKE_LEVEL, STEP, type HomeSpec } from './_spots';

/**
 * The stilt houses along the shore, the shop by the trail's end, the jetty
 * and the life round them: stairs down to the beach, ladders down to the
 * water with boats tied at their foot, jars, pots, washing, a dog asleep
 * on a veranda, hens, a motorbike parked in the shade under a house, fish
 * traps and nets, palms and banana plants, a spirit house by the jetty.
 */

export interface Env {
  field: HeightField;
  /** The village's static blocks (world). */
  world: VoxelBuilder;
  lights: VillageLights;
  smoke: SmokeSource[];
  floaters: Floaters;
}

/** Glow for panes and lanterns that stand still, built in the frame `fr`. */
export function stillGlow(env: Env, fr: Frame): GlowFn {
  return (x, y, z, sx, sy, sz, color, halo) => {
    const [wx, wy, wz] = toWorld(fr, x, y, z);
    env.lights.still.add(wx, wy, wz, sx, sy, sz, fr.theta, color, hash3(Math.round(wx), Math.round(wz), 3, 71) * 6.28);
    if (halo) env.lights.halo(wx, wy, wz, halo, wx * 0.37);
  };
}

/**
 * A house on stilts astride the shore (or, `shop`, on short posts on the
 * land). Local frame: +z its front, toward the village; the rooms at the
 * back over the shallows, the veranda in front, a stair from it down to the
 * ground, a small deck at the back door with a ladder down to the boat.
 */
export function stiltHouse(h: HomeSpec, env: Env): void {
  const src = traceSource();
  const fr = new Frame(h.x, 0, h.z, h.facing);
  const lb = new VoxelBuilder();
  const L = new Local(lb, src, h.seed * 97 + 5);
  const W = h.w;
  const zb = -(h.d + h.v) / 2;
  const zf = (h.d + h.v) / 2;
  const zw = zb + h.d;
  const F = h.floor;
  const ground = (x: number, z: number) => env.field.heightAt(fr.wx(x, z), fr.wz(x, z));
  const glow = stillGlow(env, fr);
  const st = frontStair(h);
  const trim = TRIM[h.walls];

  // ── Stilts, beams, the floor ───────────────────────────────────────────────
  const nx = Math.max(2, Math.ceil(W / 2.4) + 1);
  const nz = Math.max(2, Math.ceil((zf - zb) / 2.4) + 1);
  const rows: number[] = [];
  for (let j = 0; j < nz; j++) rows.push(zb + 0.2 + ((zf - zb - 0.4) * j) / (nz - 1));
  for (let i = 0; i < nx; i++)
    for (const z of rows) {
      const x = -W / 2 + 0.2 + ((W - 0.4) * i) / (nx - 1);
      L.span(x - 0.16, ground(x, z) - 0.4, z - 0.16, x + 0.16, F - 0.45, z + 0.16, tone(POST, L.r(i, z, 1)), 'mapBark');
    }
  for (const z of rows) L.span(-W / 2, F - 0.45, z - 0.17, W / 2, F - 0.2, z + 0.17, tone(POST, L.r(z, 2)), 'mapBark', 0.9);
  for (let x = -W / 2, i = 0; x < W / 2 - 0.05; x += 0.5, i++) L.span(x, F - 0.2, zb, Math.min(W / 2, x + 0.5), F, zf, tone(DECK, L.r(i, 3)), 'mapBark', 0.95 + L.r(i, 4) * 0.08);

  houseBody(L, { w: W, d: h.d, v: h.v, floor: F, roof: h.roof, walls: h.walls, lit: h.lit, shop: h.shop, gap: h.shop ? null : st.x }, glow);

  // ── The front stair: straight down from the veranda to the village ────────
  const sx0 = st.x - st.width / 2;
  const sx1 = st.x + st.width / 2;
  for (let i = 1; i < st.steps; i++) {
    const z = zf + (i - 1) * STEP;
    const y = F - i * STEP;
    L.span(sx0, y - 0.14, z, sx1, y, z + STEP, tone(DECK, L.r(i, 7)), 'mapBark');
    // Stringers under the treads' ends; a handrail each side (posts every other step).
    for (const x of [sx0, sx1 - 0.12]) {
      L.span(x, y - 0.42, z, x + 0.12, y - 0.14, z + STEP, tone(POST, 0.3), 'mapBark', 0.9);
      if (!h.shop) L.span(x, y + 0.85, z, x + 0.1, y + 0.95, z + STEP, tone(trim, 0.2), 'mapBark');
      if (!h.shop && i % 2 === 1) L.span(x, y, z + 0.2, x + 0.1, y + 0.9, z + 0.28, tone(trim, 0.6), 'mapBark');
    }
  }

  if (!h.shop) {
    // ── The lake side: a deck at the back door, a ladder down to the boat ──
    const dx0 = -W / 2 + 0.2;
    const dx1 = -W / 2 + 2.6;
    const dz = zb - 1.3;
    const ladder = -W / 2 + 1.9;
    for (let x = dx0, i = 0; x < dx1 - 0.05; x += 0.5, i++) L.span(x, F - 0.2, dz, Math.min(dx1, x + 0.5), F, zb, tone(DECK, L.r(i, 21)), 'mapBark');
    for (const x of [dx0 + 0.15, dx1 - 0.15]) L.span(x - 0.12, ground(x, dz + 0.15) - 0.4, dz + 0.03, x + 0.12, F - 0.2, dz + 0.27, tone(POST, L.r(x, 6)), 'mapBark');
    const rail = (x0: number, z0: number, x1: number, z1: number) => {
      L.span(x0, F + 0.85, z0, x1, F + 0.95, z1, tone(trim, 0.2), 'mapBark');
      for (let x = x0 + 0.15; x < x1 - 0.05; x += 0.55) L.span(x, F, z0, x + 0.08, F + 0.85, z0 + 0.08, tone(trim, 0.7), 'mapBark');
    };
    rail(dx0, dz, ladder - 0.45, dz + 0.08);
    rail(ladder + 0.45, dz, dx1, dz + 0.08);
    L.span(dx1 - 0.08, F + 0.85, dz, dx1, F + 0.95, zb, tone(trim, 0.2), 'mapBark');
    const foot = ground(ladder, dz - 0.3);
    for (const s of [-1, 1]) L.span(ladder + s * 0.36 - 0.05, foot - 0.2, dz - 0.24, ladder + s * 0.36 + 0.05, F + 0.9, dz - 0.12, tone(BAMBOO, L.r(s, 8)), 'mapBark');
    for (let y = Math.max(foot, LAKE_LEVEL - 0.3) + 0.35; y < F - 0.1; y += 0.4) L.span(ladder - 0.36, y - 0.04, dz - 0.22, ladder + 0.36, y + 0.04, dz - 0.14, tone(BAMBOO, L.r(y, 9)), 'mapBark');
    if (h.boat) {
      const bx = ladder + 1.6;
      const bz = dz - 1.0;
      mooredSkiff(env.floaters, fr.wx(bx, bz), fr.wz(bx, bz), h.facing + Math.PI / 2, h.seed * 13, 4.4);
    }
    // Washing over the deck's rail, a lantern by the back door of a lived-in house.
    if (h.laundry) laundry(L, dx0 + 0.1, dz + 0.3, dx1 - 0.2, dz + 0.3, F + 2.1);
    else drapedNet(L, dx0 + 0.1, ladder - 0.5, F + 0.95, dz);
    if (h.lit) lantern(L, dx1 - 0.4, F + 2.0, zb - 0.35, glow);
    jar(L, dx1 - 0.5, F, zb - 0.55, 0.75);
  }

  // ── Life round the house ──────────────────────────────────────────────────
  if (h.dog) dog(L, -0.9, F, zw + 0.7);
  if (h.hat) khmerHat(L, -1.0, F + 1.75, zw);
  if (!h.shop && !h.dog && h.seed % 3 !== 1) mat(L, -W / 2 + 1.3, F, (zw + zf) / 2);
  if (!h.shop && h.seed % 3 === 2) bougainvillea(L, st.x + st.width / 2 + 1.2, GROUND, st.footZ - 0.6, h.seed);
  // Jars at the stair's foot, a stove and its smoke in front of the house.
  jar(L, sx1 + 0.5, GROUND, st.footZ - 0.8);
  if (L.r(1, 12) < 0.6) jar(L, sx1 + 0.55, GROUND, st.footZ - 1.6, 0.85);
  const yard = zf + 1.6;
  if (h.smoke) {
    const sx = -W / 2 + 1.0;
    const top = stove(L, sx, GROUND, yard);
    const [wx, , wz] = toWorld(fr, sx, top, yard);
    env.smoke.push({ x: wx, y: top, z: wz });
    glow(sx, GROUND + 0.28, yard + 0.29, 0.22, 0.14, 0.04, 0xff5a1c);
    // Firewood stacked by it.
    for (let k = 0; k < 3; k++) L.span(sx + 0.6, GROUND + k * 0.18, yard - 0.9 + k * 0.05, sx + 1.7, GROUND + k * 0.18 + 0.18, yard - 0.25 - k * 0.05, tone([0x7a5a3a, 0x6a4a30, 0x8a6a48], L.r(k, 13)), 'mapBark');
  }
  // In the shade under the veranda: a hammock, a motorbike, fish traps (on the land).
  const under = zf - 1.2;
  const choice = h.seed % 3;
  if (!h.shop && F - GROUND > 3) {
    if (choice === 0) {
      const x0 = -W / 2 + 0.2 + (W - 0.4) / (nx - 1);
      const x1 = -W / 2 + 0.2 + (2 * (W - 0.4)) / (nx - 1);
      const zr = rows[rows.length - 1];
      for (let k = 0; k < 4; k++) {
        const t = (k + 0.5) / 4;
        const sag = Math.sin(t * Math.PI) * 0.45;
        L.span(x0 + (x1 - x0) * (k / 4), GROUND + 1.25 - sag, zr - 0.4, x0 + (x1 - x0) * ((k + 1) / 4), GROUND + 1.33 - sag, zr + 0.4, tone([0x3a6ab8, 0xc84a3a, 0x3a9a6a], L.r(h.seed, 14)), 'petal');
      }
    } else if (choice === 1) moto(L, -0.6, GROUND, under, tone([0xb8322a, 0x2a3a8a, 0x1a1a1a], L.r(h.seed, 15)));
    else traps(L, -W / 2 + 1.2, GROUND, under - 0.4, 4);
  }
  // Hens and a rooster scratching about in front of a few houses.
  if (h.seed % 2 === 1)
    for (let k = 0; k < 3; k++) hen(L, -W / 2 + 0.5 + k * 0.9, GROUND, yard + 1.2 + L.r(k, 16) * 1.2, k === 0 && h.seed % 4 === 1, k === 2);
  if (h.shop) {
    // Two tables with stools in front of the shop, a lantern, a pot, a jar.
    for (const x of [-W / 2 - 1.2, W / 2 + 1.2]) {
      L.span(x - 0.5, GROUND + 0.7, zf + 0.5, x + 0.5, GROUND + 0.78, zf + 1.3, 0xd8d0c0, 'mapBark');
      L.span(x - 0.06, GROUND, zf + 0.84, x + 0.06, GROUND + 0.7, zf + 0.96, 0x8a8a8a, 'metal');
      for (const s of [-1, 1]) L.box(x + s * 0.75, GROUND + 0.22, zf + 0.9, 0.36, 0.44, 0.36, s > 0 ? 0x2a6ac8 : 0xc8302a, 'petal');
    }
    lantern(L, -W / 2 + 0.6, F + WALL_H - 0.6, zf - 0.4, glow);
    potPlant(L, W / 2 - 0.5, F, zf - 0.5, true);
    jar(L, -W / 2 - 0.6, GROUND, zb + 0.6);
  }
  fr.place(lb, env.world);
}

/**
 * The jetty where the village trail meets the water: a plank walk on posts
 * out over the shallows to a wider head, a ladder down to the boats tied
 * alongside, a lamp on a post at its head, a spirit house at its foot.
 */
export function jetty(env: Env): void {
  const src = traceSource();
  const [fx, fz] = JETTY.from;
  const [ux, uz] = JETTY.dir;
  const fr = new Frame(fx, 0, fz, Math.atan2(ux, uz));
  const lb = new VoxelBuilder();
  const L = new Local(lb, src, 811);
  const len = Math.hypot(JETTY.to[0] - fx, JETTY.to[1] - fz);
  const hw = JETTY.width / 2;
  const Y = JETTY.y;
  const ground = (x: number, z: number) => env.field.heightAt(fr.wx(x, z), fr.wz(x, z));
  const head = 3.2;
  const glow = stillGlow(env, fr);
  // Planks across, beams along, posts in pairs every 2.4 m (in the water).
  for (let z = 0, i = 0; z < len - 0.05; z += 0.5, i++) {
    const w = z > len - head ? 2.2 : hw;
    L.span(-w, Y - 0.16, z, w, Y, Math.min(len, z + 0.5) - 0.04, tone(DECK, L.r(i, 1)), 'mapBark', 0.93 + L.r(i, 2) * 0.1);
  }
  for (const s of [-1, 1]) L.span(s * hw - 0.14 * s - 0.1, Y - 0.42, 0.5, s * hw - 0.14 * s + 0.1, Y - 0.16, len, tone(POST, L.r(s, 3)), 'mapBark', 0.9);
  for (let z = 2.2; z < len + 0.1; z += 2.4) {
    const at = Math.min(z, len - 0.2);
    for (const s of [-1, 1]) {
      const x = s * (at > len - head ? 2.0 : hw - 0.1);
      const g = ground(x, at);
      if (g >= GROUND - 0.1) continue;
      L.span(x - 0.13, g - 0.4, at - 0.13, x + 0.13, Y + (Math.abs(at - len) < 0.5 || at < 3 ? 0.9 : -0.16), at + 0.13, tone(POST, L.r(z, s)), 'mapBark');
    }
  }
  // A rail along the head's end, a bench, crates and jars.
  L.span(-2.2, Y + 0.85, len - 0.12, 2.2, Y + 0.95, len, tone(POST, 0.5), 'mapBark');
  L.span(-2.0, Y, len - 2.8, -1.3, Y + 0.45, len - 1.0, tone(DECK, 0.8), 'mapBark');
  jar(L, 1.7, Y, len - 2.8);
  L.box(1.6, Y + 0.25, len - 1.8, 0.6, 0.5, 0.5, 0x6a8a4a, 'petal');
  traps(L, -1.6, Y, len - 0.9, 2);
  // Ladder down on the south side of the head, a boat at its foot and another alongside.
  for (let y = LAKE_LEVEL - 0.2; y < Y - 0.1; y += 0.35) L.span(2.2, y - 0.04, len - 1.7, 2.35, y + 0.04, len - 1.0, tone(BAMBOO, L.r(y, 5)), 'mapBark');
  // The lamp post at the head's corner.
  L.span(-2.1, Y, len - 0.35, -1.9, Y + 2.6, len - 0.15, tone(POST, 0.1), 'mapBark');
  L.span(-2.1, Y + 2.5, len - 0.8, -1.9, Y + 2.6, len - 0.15, tone(POST, 0.1), 'mapBark');
  lantern(L, -2.0, Y + 2.05, len - 0.75, glow);
  // The spirit house at the jetty's foot, on the land, facing the way down to it.
  const [sx, sy, sz] = spiritHouse(L, -2.8, ground(-2.8, -0.6), -0.6);
  glow(sx, sy + 0.05, sz, 0.1, 0.12, 0.1, 0xffb050, 0.8);
  fr.place(lb, env.world);
  const boat = (x: number, z: number, yaw: number, seed: number) => mooredSkiff(env.floaters, fr.wx(x, z), fr.wz(x, z), fr.theta + yaw, seed, 4.4);
  boat(3.3, len - 1.4, 0, 3);
  boat(-2.9, len - 5.5, 0.1, 4);
  boat(2.7, len - 8.5, -0.08, 5);
}

/**
 * The shore round the houses: net fences on bamboo poles in the shallows
 * north of the village, nets drying on a frame, boats pulled up on the
 * sand, palms and banana plants, a shade tree by the trail's end.
 */
export function shore(env: Env): void {
  const src = traceSource();
  const lb = new VoxelBuilder();
  const L = new Local(lb, src, 907);
  const g = (x: number, z: number) => env.field.heightAt(x, z);
  // Net fences: a row of tall bamboo poles standing in the water, the net hung between them.
  for (const [x0, z0, x1, z1] of [
    [-298.5, 6, -300.5, 24],
    [-303, 16, -312, 30],
  ]) {
    const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / 2);
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const z = z0 + ((z1 - z0) * i) / n;
      const h = 3.2 + L.r(i, x, 1) * 0.8;
      L.box(x, g(x, z) - 0.3 + h / 2, z, 0.12, h, 0.12, tone(BAMBOO, L.r(i, z, 2)), 'mapBark');
      if (i < n) {
        const x2 = x0 + ((x1 - x0) * (i + 1)) / n;
        const z2 = z0 + ((z1 - z0) * (i + 1)) / n;
        const cx = (x + x2) / 2;
        const cz = (z + z2) / 2;
        const seg = Math.hypot(x2 - x, z2 - z);
        const ry = Math.atan2(x2 - x, z2 - z);
        lb.box(cx, LAKE_LEVEL + 0.75, cz, 0.03, 1.3, seg, 0x3a4a3e, 'petal', { src, ry, shade: 0.9 });
        lb.box(cx, LAKE_LEVEL + 1.42, cz, 0.05, 0.05, seg, 0xc8b27a, 'petal', { src, ry });
      }
    }
  }
  // Nets drying on a bamboo frame on the beach, north of the first house.
  {
    const x = -289;
    const z = 22;
    const y = g(x, z);
    for (const dz of [-2, 2]) L.box(x, y + 1.0, z + dz, 0.12, 2.0, 0.12, tone(BAMBOO, 0.4), 'mapBark');
    L.box(x, y + 1.95, z, 0.1, 0.1, 4.4, tone(BAMBOO, 0.6), 'mapBark');
    for (let k = 0; k < 7; k++) L.box(x + 0.02, y + 1.3 - (k % 2) * 0.12, z - 1.8 + k * 0.6, 0.04, 1.3, 0.6, k % 3 ? 0x3e5a4a : 0x6a4a3a, 'petal', 0.9);
    traps(L, x + 1.4, y, z - 3.2, 3);
  }
  // Boats pulled up on the sand, one on its side.
  const beached = (x: number, z: number, yaw: number, seed: number) => {
    const fr = new Frame(x, 0, z, yaw);
    const b = new VoxelBuilder();
    skiff(new Local(b, src, seed), 0, g(x, z) + 0.15, 0, 4.0, seed);
    fr.place(b, lb);
  };
  beached(-291.5, 26, 0.25, 41);
  beached(-296.2, 62.5, 1.9, 42);
  // Palms along the beach and round the square, banana plants behind the houses.
  const palms: [number, number, number, number, number][] = [
    [-289.5, 36, 9, -0.6, 0.1],
    [-296, 52.5, 10, -0.8, 0.2],
    [-302.5, 66, 8.5, -0.4, -0.3],
    [-313.5, 73.5, 9.5, -0.3, -0.7],
    [-330, 80, 10, 0.1, -0.8],
    [-339.2, 83.7, 8, -0.4, -0.5],
    [-296.5, 88.5, 9, 0.3, 0.4],
  ];
  for (const [x, z, h, lx, lz] of palms) palm(L, x, g(x, z), z, h, [lx, lz]);
  for (const [x, z] of [
    [-284.5, 30],
    [-285.6, 48],
    [-305, 72.5],
    [-321.5, 77.5],
    [-336.8, 85.5],
    [-283, 78],
  ])
    banana(L, x, g(x, z), z);
  potPlant(L, -300.5, GROUND, 71, true);
  for (const [x, z, seed] of [
    [-290, 84.5, 51],
    [-285, 67.5, 52],
    [-311.8, 84.2, 53],
    [-300.8, 83.2, 54],
    [-327.5, 82.5, 55],
  ])
    bougainvillea(L, x, g(x, z), z, seed);
  // Lotus in the shallows past the last houses.
  for (const [x, z, n] of [
    [-361, 85, 14],
    [-367, 88.5, 10],
    [-356.5, 86, 6],
  ])
    lotus(L, x, LAKE_LEVEL, z, n);
  // A tamarind shading the trails' end, the village's meeting place, a bench under it.
  shadeTree(L, -297, g(-297, 81), 81, 911);
  L.span(-299.4, GROUND, 79.4, -297.8, GROUND + 0.45, 79.9, tone(DECK, 0.3), 'mapBark');
  for (let k = 0; k < 4; k++) hen(L, -303 + k * 0.8, GROUND, 76 + L.r(k, 3) * 1.5, k === 1, k % 2 === 0);
  env.world.append(lb);
}
