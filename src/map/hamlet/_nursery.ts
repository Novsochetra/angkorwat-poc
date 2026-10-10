import { Group } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { ShadowGate } from '../cull';
import type { MapContext, MapFrame } from '../types';
import type { HamletPiece } from './index';
import { BAMBOO, BAMBOO_OLD, MkBuild, POST, tone, WOOD, type Tones } from './_mkKit';
import { signLetters, wordSize } from './_mkSign';
import { NURSERY, NURSERY_BEDS, NURSERY_CAN, NURSERY_LOT, NURSERY_NET, NURSERY_SIGN, NURSERY_STOOL, NURSERY_TABLE, NURSERY_TREES, nurseryToWorld } from './_nurseryPlan';
import { SEEDLINGS_WORD, SEEDS_WORD } from './_nurserySign';

/**
 * The seedling nursery by the Kulen foot trail (កន្លែងលក់កូនឈើ; where
 * everything stands: _nurseryPlan.ts), a family's roadside nursery as on the
 * roads out of Siem Reap:
 *
 * - a black-green shade net (sun cloth in strips, a little light between
 *   them, sagging between its ties) on bamboo poles over swept bare earth;
 * - under it, beds of seedlings in black plastic bags, front to back with
 *   aisles between: young fruit trees (the mangoes' new leaves bronze-red),
 *   papaya seedlings with their hand-shaped leaves, vegetable seedlings and,
 *   at the back, sprouting coconuts with their husks on;
 * - young trees taller in big bags along the north side, two more past the
 *   net, and more seedlings set out on the ground before them by the trail;
 * - the wooden table at the front with a woven basket of seed packets (each
 *   printed in its colour with the vegetable on it), loose packets, a tray
 *   of tiny seedlings; her low stool behind it, a blue water drum and a green
 *   plastic watering can (hers is the people's: people/_sceneNursery.ts
 *   carries it about), a heap of potting earth with a trowel and a stack of
 *   empty bags;
 * - the hand-painted sign on two posts, side-on to the trail, painted on both
 *   faces: "លក់កូនឈើ" in red, "និងគ្រាប់ពូជ" in green, a seedling in its bag
 *   painted by the words (_nurserySign.ts).
 *
 * Families: wood and bamboo `mapBark` (solid), the drum `mapStone` (solid),
 * the net, the bags, earth, packets and cans `petal` (soft: he walks through
 * the seedlings as through the market's goods), leaves `mapLeaf`, the bare
 * earth `mapGrass`: five draws, their shadows gated (cull.ts). It marks its
 * ground occupied (no tree grows there, the garden is not planted there).
 */

/** Colours (sRGB). */
const EARTH: Tones = [0x7a5a3c, 0x6f5236, 0x846142, 0x735538];
const BAG: Tones = [0x1c1c1f, 0x232326, 0x19191b, 0x262628];
const SOIL: Tones = [0x4a3424, 0x553c28, 0x42301f];
const NET: Tones = [0x1d2420, 0x232b26, 0x2c4a32, 0x335438];
const LEAF: Tones = [0x4a8a34, 0x3f7a2e, 0x58963c, 0x4f8e38];
const YOUNG: Tones = [0x6aa840, 0x78b44a, 0x5e9c3a];
const FLUSH: Tones = [0x9a5232, 0x8a4a2c, 0xa8603a, 0xb87048];
const PAPAYA_LEAF: Tones = [0x6ea83e, 0x7ab448, 0x64a03a];
const HUSK: Tones = [0x8a6438, 0x7c5830, 0x96703f];
const PACKETS = [0xd8402e, 0xe8b830, 0x3f8f4a, 0xe07a2a, 0x7a3a8a, 0x2f6ab0, 0xc8304a, 0x8ab43a];
const PICTURES = [0x6a2a6a, 0xf0c838, 0xe08a2a, 0x3a7a2a, 0xf0a030, 0x9a2a2a, 0xf2e8a0, 0xd8402e];
const CAN_GREEN = 0x2f8a4a;
const DRUM_BLUE = 0x2a5aa8;
const WHITEWASH = [0xf2eee2, 0xebe6d8, 0xf4f1e6];

export function buildNursery(ctx: MapContext): HamletPiece {
  const t0 = performance.now();
  const field = ctx.field;
  const g0 = field.heightAt(NURSERY.x, NURSERY.z);
  const mk = new MkBuild().at(NURSERY.x, g0, NURSERY.z, NURSERY.yaw, 9101);
  /** The ground under a local point, over the frame's (m). */
  const gy = (lx: number, lz: number): number => {
    const [x, z] = nurseryToWorld(lx, lz);
    return field.heightAt(x, z) - g0;
  };

  floor(mk, gy);
  shadeNet(mk, gy);
  beds(mk, gy);
  youngTrees(mk, gy);
  display(mk, gy);
  table(mk, gy);
  corner(mk, gy);
  sign(mk, field.heightAt(...nurseryToWorld(NURSERY_SIGN.x, NURSERY_SIGN.z)));

  // Trees keep off its ground (and the garden: its rules read the same lot).
  const L = NURSERY_LOT;
  const [ax, az] = nurseryToWorld(L.x0, L.z0);
  const [bx, bz] = nurseryToWorld(L.x1, L.z1);
  field.occupy(ax, az, bx, bz);

  const object = new Group();
  object.name = 'nursery';
  const voxels = buildVoxelMesh(mk.b, { quality: ctx.quality === 'low' ? 'low' : 'medium', name: 'nursery' });
  object.add(voxels);
  const shadows = new ShadowGate(true).addAll(voxels);
  console.info(`[map] nursery: ${mk.b.boxes.length} blocks · built in ${(performance.now() - t0).toFixed(1)} ms`);
  return {
    object,
    blocks: mk.b.boxes.length,
    update(f: MapFrame) {
      shadows.update(f);
    },
  };
}

type Ground = (lx: number, lz: number) => number;

/** Swept bare earth under the net and before the table: one slab, damp darker under the beds, a dusty path before the table. */
function floor(mk: MkBuild, gy: Ground): void {
  mk.src = traceSource();
  const g = gy(0, 0);
  mk.box(-0.05, g + 0.02, 0.05, 5.9, 0.04, 5.2, tone(EARTH, 0.1), 'mapGrass', 0.97);
  // (damp earth under the beds and the trees, where she waters)
  for (const bx of NURSERY_BEDS.xs) mk.box(bx, g + 0.043, (NURSERY_BEDS.z0 + NURSERY_BEDS.z1) / 2, NURSERY_BEDS.half * 2 + 0.2, 0.01, NURSERY_BEDS.z1 - NURSERY_BEDS.z0 + 0.35, 0x5e4430, 'mapGrass', 0.92);
  mk.box(1.95, g + 0.043, -1.0, 1.4, 0.01, 2.6, 0x634832, 'mapGrass', 0.92);
  // (the trodden path before the table and the sign, paler)
  mk.box(-0.4, g + 0.043, 2.45, 4.6, 0.01, 0.85, 0x8a6a4a, 'mapGrass', 1.02);
}

/** The shade net on its bamboo poles: strips of black-green sun cloth front to back, sagging between the ties, a curtain on the back. */
function shadeNet(mk: MkBuild, gy: Ground): void {
  mk.src = traceSource();
  const N = NURSERY_NET;
  const hOf = (z: number) => N.back + ((z - N.z0) / (N.z1 - N.z0)) * (N.front - N.back);
  for (const x of N.xs)
    for (const z of [N.z0, N.z1]) {
      const g = gy(x, z);
      const h = hOf(z) + 0.1;
      mk.box(x, g + h / 2, z, 0.1, h, 0.1, tone(BAMBOO, mk.r(x, z, 4)), 'mapBark', 0.95 + mk.r(z, x, 5) * 0.1);
      mk.box(x, g + 0.95, z, 0.13, 0.05, 0.13, tone(BAMBOO_OLD, mk.r(x, z, 6)), 'mapBark');
    }
  // Bamboo along the front and back edges and over the posts, tied on.
  const g = gy(0, 0);
  mk.rod(-3.05, g + N.front + 0.05, N.z1, 3.05, g + N.front + 0.05, N.z1, 0.08, 0.08, tone(BAMBOO, mk.r(1, 7)), 'mapBark');
  mk.rod(-3.05, g + N.back + 0.05, N.z0, 3.05, g + N.back + 0.05, N.z0, 0.08, 0.08, tone(BAMBOO, mk.r(2, 7)), 'mapBark');
  for (const x of N.xs) mk.rod(x, g + N.back + 0.1, N.z0 - 0.05, x, g + N.front + 0.1, N.z1 + 0.05, 0.07, 0.07, tone(BAMBOO_OLD, mk.r(x, 8)), 'mapBark');
  // The cloth: strips front to back with a hand's width of light between them; each sags midway between the poles.
  const x0 = -3.05;
  const x1 = 3.05;
  const n = 11;
  const sw = (x1 - x0) / n;
  for (let k = 0; k < n; k++) {
    const cx = x0 + sw * (k + 0.5);
    // (the sag: 0 at a pole line, deepest halfway between two)
    const u = Math.min(1, Math.abs(((cx + 8.4) % 2.8) - 1.4) / 1.4);
    const sag = 0.1 * (1 - u * u);
    const col = tone(NET, (k % 2) * 0.5 + mk.r(k, 9) * 0.5);
    const zm = (N.z0 + N.z1) / 2;
    mk.rod(cx, g + N.back + 0.13 - sag * 0.6, N.z0 - 0.12, cx, g + hOf(zm) + 0.13 - sag, zm, sw - 0.1, 0.03, col, 'petal', 0.95);
    mk.rod(cx, g + hOf(zm) + 0.13 - sag, zm, cx, g + N.front + 0.13 - sag * 0.6, N.z1 + 0.12, sw - 0.1, 0.03, col, 'petal', 0.95);
  }
  // A short hem along the front; the back hung with a curtain of the same cloth down to the bags' height, a gap here and there.
  mk.box(0, g + N.front + 0.03, N.z1 + 0.12, x1 - x0, 0.22, 0.03, tone(NET, 0.6), 'petal', 0.9);
  for (let k = 0; k < 6; k++) {
    const a = x0 + ((x1 - x0) * k) / 6;
    const b = a + (x1 - x0) / 6 - 0.05;
    if (k === 4) continue;
    const top = N.back + 0.1;
    const bot = 0.55 + mk.r(k, 10) * 0.25;
    mk.box((a + b) / 2, g + (top + bot) / 2, N.z0 - 0.04, b - a, top - bot, 0.03, tone(NET, mk.r(k, 11)), 'petal', 0.88);
  }
  // (the south side: a strip of curtain against the low afternoon sun)
  mk.box(-3.06, g + N.back - 0.15, (N.z0 + N.z1) / 2 - 0.4, 0.03, 0.6, N.z1 - N.z0 - 1.2, tone(NET, 0.3), 'petal', 0.88);
}

/** A seedling bag (black plastic, a lip of earth) at (x, z), `s` its size; returns its earth's top (over the frame's ground). */
function bag(mk: MkBuild, gy: Ground, x: number, z: number, s: number): number {
  const g = gy(x, z);
  const h = s * 1.05;
  mk.box(x, g + h / 2, z, s, h, s, tone(BAG, mk.r(x, z, 12)), 'petal', 0.9 + mk.r(z, x, 13) * 0.2);
  mk.box(x, g + h - 0.005, z, s * 0.8, 0.03, s * 0.8, tone(SOIL, mk.r(x, z, 14)), 'petal');
  return g + h + 0.01;
}

/** Beds of seedlings in their bags, three across, front to back: young fruit trees, papayas, then vegetables, coconuts at the back. */
function beds(mk: MkBuild, gy: Ground): void {
  mk.src = traceSource();
  const B = NURSERY_BEDS;
  const step = 0.265;
  B.xs.forEach((bx, bed) => {
    for (let z = B.z0, row = 0; z <= B.z1 + 1e-6; z += step, row++)
      for (let c = -1; c <= 1; c++) {
        const x = bx + c * 0.27 + (mk.r(row, c, bed) - 0.5) * 0.03;
        const zz = z + (mk.r(c, row, bed + 3) - 0.5) * 0.03;
        // (a gap now and then: one sold)
        if (mk.r(x * 3, zz * 3, 15) < 0.06) continue;
        const r = mk.r(x, zz, 16);
        if (bed === 2 && z < B.z0 + 0.6) {
          coconutSprout(mk, gy, x, zz, r);
          continue;
        }
        const top = bag(mk, gy, x, zz, 0.2);
        if (bed === 0) fruitSeedling(mk, x, top, zz, r);
        else if (bed === 1) papayaSeedling(mk, x, top, zz, r);
        else vegSeedling(mk, x, top, zz, r);
      }
  });
}

/** A young fruit tree's seedling: a thin stem, a few leaves along it, the newest at the tip bronze-red (a mango's flush) on some. */
function fruitSeedling(mk: MkBuild, x: number, y: number, z: number, r: number): void {
  const h = 0.28 + r * 0.22;
  mk.box(x, y + h / 2, z, 0.03, h, 0.03, 0x5a4a2e, 'mapBark');
  const flush = r > 0.45;
  for (let k = 0; k < 4; k++) {
    const a = k * 2.4 + r * 6;
    const yy = y + h * (0.45 + k * 0.17);
    const tip = k === 3;
    mk.box(x + Math.sin(a) * 0.07, yy, z + Math.cos(a) * 0.07, 0.16, 0.025, 0.07, tip && flush ? tone(FLUSH, r) : tone(LEAF, mk.r(k, r * 9, 17)), 'mapLeaf', 1, 0.25, a + Math.PI / 2);
  }
}

/** A papaya seedling: a pale stem, three hand-shaped leaves held out on their stalks. */
function papayaSeedling(mk: MkBuild, x: number, y: number, z: number, r: number): void {
  const h = 0.22 + r * 0.16;
  mk.box(x, y + h / 2, z, 0.035, h, 0.035, 0x9aa070, 'mapLeaf');
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + r * 5;
    mk.box(x + Math.sin(a) * 0.08, y + h + 0.01, z + Math.cos(a) * 0.08, 0.15, 0.02, 0.15, tone(PAPAYA_LEAF, mk.r(k, r * 7, 18)), 'mapLeaf', 1.05, 0.2, a);
  }
}

/** A vegetable seedling (eggplant, chilli): a low tuft of round leaves. */
function vegSeedling(mk: MkBuild, x: number, y: number, z: number, r: number): void {
  mk.box(x, y + 0.06, z, 0.13, 0.11, 0.13, tone(YOUNG, r), 'mapLeaf', 0.95);
  mk.box(x + (r - 0.5) * 0.04, y + 0.13, z, 0.08, 0.06, 0.08, tone(YOUNG, 1 - r), 'mapLeaf', 1.1);
}

/** A sprouting coconut, laid on the earth in its husk, two or three young fronds up out of its eye. */
function coconutSprout(mk: MkBuild, gy: Ground, x: number, z: number, r: number): void {
  const g = gy(x, z);
  mk.box(x, g + 0.1, z, 0.22, 0.2, 0.27, tone(HUSK, r), 'petal', 0.95, 0, r * 0.6);
  const n = 2 + Math.floor(r * 2);
  for (let k = 0; k < n; k++) {
    const lean = (k - (n - 1) / 2) * 0.35;
    const h = 0.42 + mk.r(k, r * 11, 19) * 0.2;
    mk.box(x + Math.sin(lean) * h * 0.4, g + 0.2 + h / 2, z + 0.06, 0.05, h, 0.02, tone(LEAF, mk.r(k, r, 20)), 'mapLeaf', 1, 0, r, lean);
  }
}

/** Young trees in big bags along the north side (two past the net): a slim trunk, a small crown of blocks; mangoes flushed red at the tips. */
function youngTrees(mk: MkBuild, gy: Ground): void {
  mk.src = traceSource();
  NURSERY_TREES.forEach(([x, z, h], i) => {
    const top = bag(mk, gy, x, z, 0.36);
    const r = mk.r(i, 21);
    const mangoLike = i % 3 !== 1;
    mk.box(x, top + (h * 0.62) / 2, z, 0.06, h * 0.62, 0.06, mangoLike ? 0x5a4632 : 0x6a7040, 'mapBark');
    const cy = top + h * 0.72;
    const rr = 0.22 + h * 0.1;
    // (a round crown: a core and leaves on its shell, the newest at the top flushed bronze-red on the mangoes)
    mk.box(x, cy, z, rr * 1.15, rr * 0.95, rr * 1.15, tone(LEAF, r * 0.7), 'mapLeaf', 0.82);
    const n = 14;
    for (let k = 0; k < n; k++) {
      const v = 1 - (2 * (k + 0.5)) / n;
      const ring = Math.sqrt(1 - v * v);
      const a = k * 2.399 + r * 6;
      const tip = v > 0.35 && mangoLike && r > 0.3 && k % 2 === 0;
      const s = 0.17 + mk.r(k, i, 22) * 0.1;
      mk.box(x + Math.sin(a) * ring * rr, cy + v * rr * 0.8, z + Math.cos(a) * ring * rr, s, s * 0.75, s, tip ? tone(FLUSH, mk.r(k, i, 23)) : tone(LEAF, mk.r(i, k, 24)), 'mapLeaf', 0.86 + (v + 1) * 0.12);
    }
    // (a stake and a tie on the taller ones)
    if (h > 1.8) mk.box(x + 0.08, top + 0.55, z, 0.03, 1.1, 0.03, tone(BAMBOO, r), 'mapBark');
  });
}

/** Seedlings set out on the ground before the young trees, by the trail (what passers-by see first): fruit trees, papayas, a few coconuts. */
function display(mk: MkBuild, gy: Ground): void {
  mk.src = traceSource();
  let n = 0;
  for (let x = 1.0; x <= 2.62; x += 0.27)
    for (let z = 1.32; z <= 2.4; z += 0.27, n++) {
      const r = mk.r(x, z, 40);
      const xx = x + (r - 0.5) * 0.04;
      if (r < 0.08) continue;
      if (n % 7 === 3) {
        coconutSprout(mk, gy, xx, z, r);
        continue;
      }
      const top = bag(mk, gy, xx, z, 0.2);
      if (n % 3 === 1) papayaSeedling(mk, xx, top, z, r);
      else fruitSeedling(mk, xx, top, z, r);
    }
}

/** The wooden table at the front: a woven basket of seed packets, loose packets fanned out, a tray of tiny seedlings. */
function table(mk: MkBuild, gy: Ground): void {
  mk.src = traceSource();
  const T = NURSERY_TABLE;
  const cx = (T.x0 + T.x1) / 2;
  const cz = (T.z0 + T.z1) / 2;
  const g = gy(cx, cz);
  const top = g + T.h;
  const w = T.x1 - T.x0;
  const d = T.z1 - T.z0;
  for (let k = 0; k < 3; k++) mk.box(cx, top - 0.02, T.z0 + d * ((k + 0.5) / 3), w + 0.06, 0.04, d / 3 - 0.012, tone(WOOD, mk.r(k, 25)), 'mapBark', 0.95 + mk.r(k, 26) * 0.1);
  for (const lx of [T.x0 + 0.06, T.x1 - 0.06])
    for (const lz of [T.z0 + 0.06, T.z1 - 0.06]) mk.box(lx, g + (T.h - 0.04) / 2, lz, 0.06, T.h - 0.04, 0.06, tone(POST, mk.r(lx, lz, 27)), 'mapBark');
  mk.box(cx, g + 0.22, cz, w - 0.1, 0.04, 0.04, tone(POST, 0.5), 'mapBark');
  // The basket of seed packets (woven bamboo, a darker rim), the packets standing in it.
  const bx = T.x0 + 0.42;
  const bz = cz + 0.02;
  mk.box(bx, top + 0.07, bz, 0.5, 0.14, 0.36, tone(BAMBOO, 0.4), 'petal', 0.95);
  mk.box(bx, top + 0.145, bz, 0.54, 0.03, 0.4, tone(BAMBOO_OLD, 0.5), 'petal', 0.9);
  for (let k = 0; k < 8; k++) {
    const px = bx - 0.19 + (k % 4) * 0.125;
    const pz = bz - 0.08 + Math.floor(k / 4) * 0.15;
    const tilt = (mk.r(k, 28) - 0.5) * 0.35;
    mk.box(px, top + 0.2, pz, 0.1, 0.15, 0.014, PACKETS[k], 'petal', 1, 0.1, 0, tilt);
    mk.box(px, top + 0.215, pz + 0.009, 0.055, 0.06, 0.004, PICTURES[k], 'petal', 1.05, 0.1, 0, tilt);
  }
  // Loose packets fanned out on the table, picture up.
  for (let k = 0; k < 5; k++) {
    const px = cx - 0.05 + k * 0.13;
    const pz = cz + 0.12 - (k % 2) * 0.05;
    const c = PACKETS[(k + 3) % PACKETS.length];
    mk.box(px, top + 0.008 + k * 0.002, pz, 0.1, 0.012, 0.14, c, 'petal', 1, 0, (k - 2) * 0.18);
    mk.box(px, top + 0.016 + k * 0.002, pz + 0.01, 0.055, 0.004, 0.06, PICTURES[(k + 3) % PICTURES.length], 'petal', 1.05, 0, (k - 2) * 0.18);
  }
  // A plug tray of tiny seedlings, green dots in black cells.
  const tx = T.x1 - 0.28;
  const tz = cz - 0.1;
  mk.box(tx, top + 0.025, tz, 0.36, 0.05, 0.26, 0x18181a, 'petal');
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 3; j++) mk.box(tx - 0.135 + i * 0.09, top + 0.07, tz - 0.08 + j * 0.08, 0.05, 0.04, 0.05, tone(YOUNG, mk.r(i, j, 29)), 'mapLeaf', 1.05);
}

/** Her stool behind the table; the water drum and a watering can at the north front corner; the heap of potting earth, a trowel and empty bags by the south. */
function corner(mk: MkBuild, gy: Ground): void {
  mk.src = traceSource();
  const S = NURSERY_STOOL;
  const sg = gy(S.x, S.z);
  mk.box(S.x, sg + 0.1, S.z, 0.32, 0.2, 0.28, tone(POST, 0.3), 'mapBark', 0.95);
  mk.box(S.x, sg + 0.215, S.z, 0.36, 0.03, 0.32, tone(BAMBOO, 0.6), 'mapBark');
  // The blue drum of water, a dipper floating on it.
  const dx = 3.2;
  const dz = 1.45;
  const dg = gy(dx, dz);
  mk.box(dx, dg + 0.42, dz, 0.5, 0.84, 0.5, DRUM_BLUE, 'mapStone', 0.95);
  mk.box(dx, dg + 0.42, dz, 0.58, 0.72, 0.38, DRUM_BLUE, 'mapStone', 0.92);
  mk.box(dx, dg + 0.42, dz, 0.38, 0.72, 0.58, DRUM_BLUE, 'mapStone', 0.92);
  for (const y of [0.2, 0.62]) mk.box(dx, dg + y, dz, 0.6, 0.04, 0.6, 0x24509a, 'mapStone', 0.85);
  mk.box(dx, dg + 0.83, dz, 0.42, 0.02, 0.42, 0x4a7a8a, 'mapStone', 0.8);
  mk.box(dx + 0.05, dg + 0.86, dz - 0.04, 0.14, 0.05, 0.14, 0xd8c8a0, 'petal');
  mk.box(dx - 0.08, dg + 0.88, dz + 0.04, 0.22, 0.02, 0.03, 0x8a6a48, 'petal');
  // A green plastic watering can standing by the drum.
  wateringCan(mk, gy, dx - 0.15, dz + 0.6, 0.4);
  // (hers by the stool is the seller's own: people/_sceneNursery.ts; here only its patch of wet earth)
  mk.box(NURSERY_CAN.x, gy(NURSERY_CAN.x, NURSERY_CAN.z) + 0.052, NURSERY_CAN.z, 0.42, 0.01, 0.36, 0x5a4230, 'mapGrass', 0.9);
  // The heap of potting earth, a trowel stuck in it, a stack of empty bags folded flat.
  const hx = -2.55;
  const hz = 1.35;
  const hg = gy(hx, hz);
  mk.box(hx, hg + 0.08, hz, 0.75, 0.16, 0.6, tone(SOIL, 0.2), 'petal', 0.95);
  mk.box(hx + 0.03, hg + 0.2, hz - 0.02, 0.5, 0.12, 0.4, tone(SOIL, 0.7), 'petal', 1.0);
  mk.box(hx - 0.02, hg + 0.29, hz, 0.26, 0.08, 0.22, tone(SOIL, 0.4), 'petal', 1.05);
  mk.box(hx + 0.12, hg + 0.38, hz + 0.05, 0.03, 0.2, 0.03, 0x8a6a48, 'mapBark', 1, 0, 0, 0.35);
  mk.box(hx + 0.08, hg + 0.27, hz + 0.05, 0.06, 0.1, 0.012, 0x9a9a98, 'mapStone', 1, 0, 0, 0.35);
  for (let k = 0; k < 4; k++) mk.box(hx + 0.6, hg + 0.012 + k * 0.022, hz + 0.25, 0.3, 0.02, 0.24, tone(BAG, mk.r(k, 30)), 'petal', 1, 0, k * 0.2);
}

/** A green plastic watering can: its body, the handle arched over it, the long spout with its rose. */
export function wateringCan(mk: MkBuild, gy: Ground, x: number, z: number, turn: number): void {
  const g = gy(x, z);
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  const at = (fx: number, fz: number): [number, number] => [x + fx * c + fz * s, z - fx * s + fz * c];
  const [bx, bz] = at(0, 0);
  mk.box(bx, g + 0.12, bz, 0.18, 0.24, 0.28, CAN_GREEN, 'petal', 1, 0, turn);
  const [hx, hz] = at(0, -0.02);
  mk.box(hx, g + 0.3, hz, 0.04, 0.04, 0.22, 0x27773e, 'petal', 1, 0, turn);
  for (const e of [-0.1, 0.07]) {
    const [ex, ez] = at(0, e);
    mk.box(ex, g + 0.27, ez, 0.04, 0.07, 0.04, 0x27773e, 'petal', 1, 0, turn);
  }
  const [sx0, sz0] = at(0, 0.12);
  const [sx1, sz1] = at(0, 0.36);
  mk.rod(sx0, g + 0.07, sz0, sx1, g + 0.3, sz1, 0.035, 0.035, CAN_GREEN, 'petal');
  const [rx, rz] = at(0, 0.38);
  mk.box(rx, g + 0.32, rz, 0.07, 0.07, 0.04, 0x27773e, 'petal', 1.05, 0, turn);
}

/** The painted sign on two posts, side-on to the trail, its words on both faces. */
function sign(mk: MkBuild, ground: number): void {
  const S = NURSERY_SIGN;
  const [x, z] = nurseryToWorld(S.x, S.z);
  mk.at(x, ground, z, NURSERY.yaw + S.turn, 9102);
  mk.src = traceSource();
  const w = S.w;
  const post = (px: number) => {
    mk.box(px, 1.05, 0.06, 0.1, 2.1, 0.1, tone(POST, mk.r(px, 31)), 'mapBark');
    mk.box(px, 0.05, 0.06, 0.18, 0.1, 0.18, 0x8a8478, 'mapStone');
  };
  post(-w / 2 - 0.06);
  post(w / 2 + 0.06);
  // The board: three whitewashed planks, a red edge painted round.
  const y0 = 0.78;
  const y1 = 2.04;
  const ph = (y1 - y0) / 3;
  for (let k = 0; k < 3; k++) mk.box(0, y0 + ph * (k + 0.5), 0.06, w, ph - 0.012, 0.06, WHITEWASH[k], 'mapBark', 0.98 + mk.r(k, 32) * 0.04);
  for (const face of [-1, 1]) {
    const zf = 0.06 + face * 0.031;
    mk.box(0, y1 - 0.025, zf, w - 0.02, 0.03, 0.008, 0xb8302a, 'mapBark');
    mk.box(0, y0 + 0.025, zf, w - 0.02, 0.03, 0.008, 0xb8302a, 'mapBark');
    for (const e of [-1, 1]) mk.box(e * (w / 2 - 0.025), (y0 + y1) / 2, zf, 0.03, y1 - y0 - 0.02, 0.008, 0xb8302a, 'mapBark');
    // (the words: the big one in red, the small one in green; mirrored so each face reads left to right)
    const px = 0.0175;
    const [, h1] = wordSize(SEEDLINGS_WORD);
    const [w2, h2] = wordSize(SEEDS_WORD);
    signLetters(mk, SEEDLINGS_WORD, 0, y1 - 0.08 - (h1 * px) / 2, 0.06, px, face, 0xb02c26);
    const ly = y0 + 0.08 + (h2 * px) / 2;
    signLetters(mk, SEEDS_WORD, -0.18 * face, ly, 0.06, px, face, 0x2f7a3a);
    // A seedling in its black bag painted by the small words.
    const sx = face * (-0.18 + (w2 * px) / 2 + 0.22);
    const zp = 0.06 + face * 0.035;
    mk.box(sx, y0 + 0.13, zp, 0.12, 0.12, 0.01, 0x1c1c1f, 'mapBark');
    mk.box(sx, y0 + 0.24, zp, 0.02, 0.1, 0.01, 0x3f7a2e, 'mapBark');
    mk.box(sx - 0.05, y0 + 0.3, zp, 0.08, 0.04, 0.01, 0x4a8a34, 'mapBark');
    mk.box(sx + 0.05, y0 + 0.33, zp, 0.08, 0.04, 0.01, 0x58963c, 'mapBark');
  }
}
