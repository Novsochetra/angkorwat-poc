import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { HeightField } from '../heightfield';
import { Palms, type PalmSet } from '../veg/palms';
import type { Proto } from '../veg/proto';
import { bamboo, broadleaf } from '../veg/species';
import { banana, bougainvillea, Local } from '../village/_kit';
import type { BuildEnv } from './_bhHouses';
import { MEADOW, type P2 } from './_bhSpots';

/**
 * The trees of the hamlet behind Angkor Wat, which it sits among: mango
 * trees heavy with fruit, a jackfruit with its big fruit hanging from the
 * trunk, coconut palms leaning out over the pond and the trail, sugar
 * palms on the edges, banana clumps and papayas by the houses, a stand of
 * bamboo, bougainvillea by the garden's fence and the granary, a few jungle
 * trees round it, and the big shade tree in the meadow the herder sits under. The
 * broadleaf trees and the bamboo are the jungle's own prototypes
 * (veg/species.ts: the same look), stamped at 1 m cells; the palms are the
 * real ones of veg/palms.ts (their own instanced draws: `buildTrees`
 * returns them); the bananas and bougainvillea the floating village's.
 */

/** A broadleaf tree (map x, z), height, crown radius, seed, and what fruit hangs on it. */
const BROAD: [number, number, number, number, number, 'mango' | 'jack' | null][] = [
  [131.4, -363.6, 9, 3.6, 41, 'mango'],
  [173.6, -361.4, 10, 4.0, 43, 'mango'],
  [156.2, -329.2, 8, 3.2, 47, 'jack'],
  // Jungle trees round the edges: the hamlet seen between them.
  [106.5, -372.5, 12, 4.6, 51, null],
  [121.5, -374, 10, 4.0, 53, null],
  [183.5, -351.5, 11, 4.4, 57, null],
  [181, -320.5, 10, 4.0, 59, null],
  [95.5, -337.5, 10, 4.0, 61, null],
  [160.5, -310, 9, 3.6, 67, null],
  [101.5, -306.5, 11, 4.4, 69, null],
  [158.5, -372.5, 9, 3.6, 71, 'mango'],
  [174.4, -345.6, 8, 3.2, 73, 'jack'],
];
/** Coconut palms: map x, z, height of the trunk, and how far its top leans out (x, z, m). */
const COCONUT: [number, number, number, number, number][] = [
  [117.6, -343.4, 9.5, -2.6, -0.9],
  [111.2, -365.8, 10, 0.6, -1.4],
  [172.2, -325.4, 9, 1.1, 0.9],
  [138.6, -368.2, 10.5, -0.6, -1.3],
  [161.8, -316.4, 9.5, 0.4, 1.7],
  [113.2, -314.6, 8.5, -1.2, 1.0],
  [123.2, -355.8, 9, -1.4, -0.9],
  [150.6, -326.6, 10, 0.9, 1.1],
];
/** Sugar palms (tall, straight, a round crown). (The west one stands off the line of sight up the back trail from the monk's hut: its trunk split the view of the hamlet in two.) */
const SUGAR: [number, number, number][] = [
  [106.6, -331.4, 12],
  [178.4, -337.2, 13],
  [151.2, -374.6, 11],
];
const BANANA: P2[] = [
  [134.8, -357.9],
  [170.9, -347.9],
  [149.4, -369.6],
  [121.1, -354.6],
  [157.4, -356.9],
  [131.6, -327.4],
];
const PAPAYA: P2[] = [
  [153.2, -358.2],
  [133.4, -352.9],
];
const BAMBOO: [number, number, number][] = [[98.6, -368.4, 12]];
/** (against the garden's fence and the granary's side: a bush in the open yard reads as a block) */
const BOUGAINVILLEA: P2[] = [
  [165.4, -339.4],
  [151.2, -366.4],
];

/** Every tree's foot (map x, z) and trunk radius: the part keeps the jungle's own trees and the undergrowth off them. */
export function treeFeet(): [number, number, number][] {
  return [
    ...BROAD.map(([x, z, , r]): [number, number, number] => [x, z, r > 4 ? 1.2 : 0.8]),
    ...COCONUT.map(([x, z]): [number, number, number] => [x, z, 0.6]),
    ...SUGAR.map(([x, z]): [number, number, number] => [x, z, 0.6]),
    [MEADOW.tree[0], MEADOW.tree[1], 1.2],
  ];
}

/** Plant the trees (blocks into the hamlet's builder); returns the palms, built (add their object, call their update). */
export function buildTrees(env: BuildEnv): PalmSet {
  const src = traceSource();
  const L = new Local(env.world, src, 911);
  const f = env.field;
  const g = (x: number, z: number) => f.heightAt(x, z);
  for (const [x, z, h, r, seed, fruit] of BROAD) {
    const p = broadleaf({ s: 1, h, r, seed: 7000 + seed });
    stamp(env, f, p, x, g(x, z), z, seed);
    if (fruit === 'mango') mangoes(L, p, x, g(x, z), z, seed);
    else if (fruit === 'jack') jackfruit(L, x, g(x, z), z, seed);
  }
  // The herder's big shade tree in the meadow.
  const [mx, mz] = MEADOW.tree;
  stamp(env, f, broadleaf({ s: 1, h: 12, r: 5, seed: 7090 }), mx, g(mx, mz), mz, 90);
  for (const [x, z, h] of BAMBOO) stamp(env, f, bamboo({ s: 1, h, r: 4, seed: 7300 }), x, g(x, z), z, 300);
  for (const [x, z] of BANANA) banana(L, x, g(x, z), z);
  for (const [i, [x, z]] of PAPAYA.entries()) papaya(L, x, g(x, z), z, i);
  for (const [i, [x, z]] of BOUGAINVILLEA.entries()) bougainvillea(L, x, g(x, z), z, 930 + i);
  const palms = new Palms();
  for (const [i, [x, z, h, lx, lz]] of COCONUT.entries()) palms.add({ kind: 'coconut', x, y: g(x, z), z, h, seed: 7100 + i, lean: [lx, lz] });
  for (const [i, [x, z, h]] of SUGAR.entries()) palms.add({ kind: 'sugar', x, y: g(x, z), z, h, seed: 7200 + i });
  return palms.build({ name: 'hamlet:back-palms' });
}

/**
 * Stamp a jungle prototype with its trunk at (x, y, z): its shell cells as
 * 1 m blocks (leaves or bark), its free boxes (trunk segments, roots), a
 * quarter turn by the seed; cells in the ground are left out.
 */
function stamp(env: BuildEnv, f: HeightField, p: Proto, x: number, y: number, z: number, seed: number): void {
  const s = p.s;
  const q = seed & 3;
  const turn = (i: number, k: number): [number, number] => (q === 0 ? [i, k] : q === 1 ? [-k, i] : q === 2 ? [-i, -k] : [k, -i]);
  const src = p.src;
  for (let c = 0; c < p.n; c++) {
    if (!p.shell[c]) continue;
    const [i, k] = turn(p.ci[c], p.ck[c]);
    const cx = x + i * s;
    const cz = z + k * s;
    const cy = y + (p.cj[c] + 0.5) * s;
    if (cy - s / 2 < f.heightAt(cx, cz) - 0.05) continue;
    env.world.box(cx, cy, cz, s, s, s, p.color[c], p.mat[c] ? 'mapBark' : 'mapLeaf', { src, shade: p.shade[c] });
  }
  for (const b of p.boxes) {
    const [bx, bz] = turn(b.x, b.z);
    const odd = (q & 1) === 1;
    env.world.box(x + bx, y + b.y, z + bz, odd ? b.sz : b.sx, b.sy, odd ? b.sx : b.sz, b.color, b.leaf ? 'mapLeaf' : 'mapBark', { src, shade: b.shade });
  }
}

/** Mangoes hanging on short stalks under the crown's rim: green, turning yellow and orange. */
function mangoes(L: Local, p: Proto, x: number, y: number, z: number, seed: number): void {
  const colors = [0x9ab43a, 0xc8b440, 0xe0a030, 0xb8c048];
  for (let k = 0; k < 12; k++) {
    const a = hash3(k, seed, 1, 94) * Math.PI * 2;
    const d = p.r * (0.55 + 0.35 * hash3(k, seed, 2, 94));
    const fy = y + p.low - 0.25 - hash3(k, seed, 3, 94) * 0.5;
    const fx = x + Math.cos(a) * d;
    const fz = z + Math.sin(a) * d;
    L.box(fx, fy + 0.2, fz, 0.03, 0.3, 0.03, 0x4e6a2a, 'mapLeaf');
    L.box(fx, fy, fz, 0.16, 0.22, 0.14, colors[k % colors.length], 'petal');
  }
}

/** Jackfruit: big knobbly green fruit hanging from the trunk and the low branches. */
function jackfruit(L: Local, x: number, y: number, z: number, seed: number): void {
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + hash3(k, seed, 4, 95);
    const h = 1.6 + hash3(k, seed, 5, 95) * 2.6;
    const r = 0.55 + (h > 3 ? 0.4 : 0);
    const c = [0x98a848, 0xa8b050, 0x8a9a40][k % 3];
    L.box(x + Math.cos(a) * r, y + h, z + Math.sin(a) * r, 0.34, 0.52, 0.34, c, 'mapLeaf', 0.95 + 0.1 * hash3(k, seed, 6, 95));
  }
}

/** A papaya: a thin grey trunk, a crown of big leaves on long stalks, green fruit clustered under it. */
function papaya(L: Local, x: number, y: number, z: number, i: number): void {
  const h = 4.2 + i * 0.6;
  L.box(x, y + h / 2, z, 0.22, h, 0.22, 0x8a8478, 'mapBark');
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + i;
    L.box(x + Math.cos(a) * 0.7, y + h + 0.15 + (k % 2) * 0.15, z + Math.sin(a) * 0.7, 0.9, 0.12, 0.9, [0x4e8a30, 0x5a9a38, 0x6aa840][k % 3], 'mapLeaf');
  }
  L.box(x, y + h + 0.3, z, 0.36, 0.3, 0.36, 0x5a9a38, 'mapLeaf');
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    L.box(x + Math.cos(a) * 0.2, y + h - 0.35 - (k % 2) * 0.2, z + Math.sin(a) * 0.2, 0.16, 0.26, 0.16, k === 2 ? 0xe0a030 : 0x7aa040, 'petal');
  }
}
