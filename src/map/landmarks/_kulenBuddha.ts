import { CanvasTexture, Group, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import type { VoxelMaterialKey } from '../../voxel/materials';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { HeightField } from '../heightfield';
import type { MapFrame } from '../types';
import { lang, onLang, t } from '../ui/lang';
import { buddhaStatue, KULEN_STONE } from '../sacred/buddha';
import { SACRED_LAMPS } from '../sacred/finish';
import { gable, type GableSpec } from '../sacred/gable';
import { roofNaga, type RoofNagaSpec } from '../sacred/naga';
import { trackSacred } from '../sacred/pending';
import { noise3 } from '../sacred/sdf';
import { Mason, MOSS, pick, SHADOW, type Tones } from './_prasat';
import { Frame, type Lamps, type Shrines } from './_prasatKit';

/**
 * Preah Ang Thom (ព្រះអង្គធំ), the reclining Buddha of Phnom Kulen, on the
 * summit plateau east of the mountain temple (kulen.ts): as at the real Wat
 * Preah Ang Thom, a great sandstone boulder with the Buddha lying along its
 * top, carved out of it (sacred/_buddhaReclining.ts: on his right side, his
 * head on his hand, facing south to the way up, his head to the west), 10 m
 * long, on a stone bed. Everything Khmer (KHMER-STYLE): a two-tier roof on
 * white posts shelters him, terracotta tiles, gold bargeboards (the naga's
 * body) ending at the eaves in hoods of three heads, a slender hooked chovea
 * at each end of the ridge, a gilded gable at each end (sacred/gable.ts);
 * the stair up the rock's south face runs between naga balustrades as on
 * Angkor Wat's causeway (the smooth body down the cheeks, seven heads under
 * one hood with a flame-leaf halo at the foot) from a gate: white posts, a
 * lintel with the name board in Khmer letters (`gateBoard`), a small Angkor
 * tower with a lotus bud on it, a stone elephant either side. Before his
 * chest an altar with candles, incense, lotus, a bay sei and fruit, a
 * marigold garland; white parasols at his head and feet, a donation box,
 * Buddhist flags at the gate and on the rock, lanterns under the eaves that
 * glow at night. A paved way leads from the temple's grand stair across the
 * plateau to the gate (`RECLINING.way`: pilgrims follow it). Worship spot
 * `kulen-buddha` (roam/_worship.ts) on the floor before the altar.
 *
 * Local frame: origin at the boulder's middle (`RECLINING.x`, `.z`), +x east,
 * +z south, heights are world heights; the floor on the rock is `TOP`.
 * Walk it: `roam=walk&at=406.5,150,-440.5&yaw=180&sim=_:0.5&rcam=0,14,9`.
 */

/** Where it is (map m): the boulder's middle, the floor on its top. */
export const RECLINING = {
  x: 409,
  z: -445,
  top: 150,
  /**
   * The way for pilgrims (map x, z, and y of the floor there): from the foot
   * of the temple's grand stair along the paved path to the arch, up the
   * rock's stair to its head, and on to the kneeling place (roam/_worship.ts
   * `kulen-buddha`).
   */
  way: [
    [377, 144, -418.6],
    [393, 144, -418.8],
    [398.5, 144, -424],
    [406.5, 144, -430.4],
    [406.5, 144, -432.6],
    [406.5, 150, -439.2],
    [406.5, 150, -444.4],
  ] as [number, number, number][],
};

/** The floor on the rock (m, world). */
const TOP = RECLINING.top;
/** The rock: half sizes at its foot and its top (x, z), and how square its outline is (a superellipse's power). */
const ROCK = { foot: [11, 8], top: [9.4, 6.4], power: 3.2 };
/** The stone bed he lies on, carved in the rock (local m). */
const BED = { x0: -6, x1: 6, z0: -5, z1: -2.5, h: 0.5 };
/** The Buddha: length (m), the middle of his depth (z). */
const BUDDHA = { length: 10, z: -3.7 };
/** The altar before his chest and head, its top (m over the floor). */
const ALTAR = { x0: -4, x1: -1, z0: -2, z1: -1, h: 0.5 };
/** The stair up the south face: its middle (x), half-width, where it leaves the floor (z); on the 0.5 m grid. */
const STAIR = { x: -2.5, half: 1, z0: 6 };
/** Where the explorer kneels (local x, z) and the point he faces: between the Buddha's head and chest. */
const KNEEL = { x: -2.5, z: 0.6, fx: -2.5, fz: BUDDHA.z };
/** The shelter's posts: x of each, on its back and front rows (z). */
const POSTS = { x: [-7.4, -4.4, 4.4, 7.4], z: [-4.9, 2.6] };
/**
 * The roof: a lower skirt from ±`eave` to ±`skirt` m across the ridge, the
 * upper roof from ±`upper` up to the ridge, in rows `run` m in and `rise` m
 * up; eaves at `eaveY` (world); the ridge along x at z = `zc`, its gable
 * ends at x = ±`half`.
 */
const ROOF = { eave: 4.7, skirt: 3.2, upper: 3.5, run: 0.5, rise: 0.42, eaveY: TOP + 3.9, zc: -1.15, half: 8.4 };

// Colours (sRGB).
/** Kulen sandstone: grey-ochre with a pink cast. */
const STONE: Tones = [0xa08c74, 0x978269, 0xab977d, 0x8e7a63, 0xa39079];
/** Rain-darkened bands and stains. */
const STAIN: Tones = [0x7a6a57, 0x6f604f, 0x836f5c];
/** The carved, swept floor, in squares of two tones; the bed and altar. */
const FLOOR: Tones = [0xcdbfa6, 0xc5b69c, 0xd4c7ae];
const FLOOR_B: Tones = [0xb9a98e, 0xb0a086, 0xbfae93];
const CARVED: Tones = [0xbfac8e, 0xb7a386, 0xc6b495];
const WHITE: Tones = [0xf0e9da, 0xe9e1cf, 0xf4eee2];
const GOLD: Tones = [0xd9a93a, 0xe6b84a, 0xcc9a32];
const RED: Tones = [0x9c2e24, 0xa8342a, 0x922a22];
/** Roof tiles: red-orange terracotta, the eaves' row a deeper red. */
const TILE: Tones = [0xc8582a, 0xbf5026, 0xd0632f, 0xb84a24, 0xc55c2c];
const TILE_EDGE: Tones = [0x9a3a22, 0xa3402a, 0x8f341e];
/** The naga: grey-green sandstone, as the balustrades of Angkor Wat's causeway. */
const NAGA: Tones = [0x8d977c, 0x848f75, 0x96a084, 0x7f8a70];
const ELEPHANT: Tones = [0x9a948a, 0x8e887e, 0xa49e94];
const BAMBOO: Tones = [0xc8b27a, 0xbba36c, 0xd4bf88];
const FERN: Tones = [0x4a7a2e, 0x57883a, 0x3f6e2a];
/** The Buddhist flag's five colours, in its stripes: blue, yellow, red, white, orange. */
const FLAG = [0x2a5ab8, 0xf0c030, 0xc8302a, 0xf2eee6, 0xe8801a];

export interface RecliningOut {
  /** Blocks it added to the landmark. */
  blocks: number;
  /** For the landmark's console line. */
  note: string;
  /** What is not blocks: the gate's painted name board (add to the landmark's object). */
  object: Group;
  update(f: MapFrame): void;
}

/**
 * Builds the shrine into the landmark: its blocks into `world` (map m), the
 * Buddha, gables and offerings into `shrines`, its lanterns into `lamps`;
 * marks its ground as built on (no trees).
 */
export function buildReclining(f: HeightField, world: VoxelBuilder, shrines: Shrines, lamps: Lamps): RecliningOut {
  const t0 = performance.now();
  const src = traceSource();
  const fr = new Frame(RECLINING.x, 0, RECLINING.z, 0);
  const sign = gateBoard(3.2, 0.3);
  const board = sign.mesh;
  const b = new VoxelBuilder();
  const rock = new Mason(b, 1, { seed: 71, jitter: 0.05, ao: 0.3 });
  const d = new Mason(b, 0.5, { seed: 72 });
  const ground = (x: number, z: number) => f.heightAt(fr.wx(x, z), fr.wz(x, z));
  const r = (i: number, j = 0, k = 0) => hash3(Math.round(i * 7.3), Math.round(j * 5.1), Math.round(k * 3.7), 7301);
  const span = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tones: Tones | number, mat: VoxelMaterialKey, shade = 1) =>
    b.span(x0, y0, z0, x1, y1, z1, typeof tones === 'number' ? tones : pick(tones, r(x0 + x1, y0 + z0, z1)), mat, { src, shade });

  // ── The boulder ────────────────────────────────────────────────────────
  // A rounded block of sandstone swelling a little a third of the way up and
  // drawing in to its flat top; its sides wander (noise), its layers show as
  // darker bands; the stair's channel is cut out of its south face.
  const foot = Math.min(...[-9, 0, 9].flatMap((x) => [-6, 0, 6].map((z) => ground(x, z))));
  // (the rock is cut away under the stair and its cheeks: the steps are filled from the ground up, and 1 m
  // cells under 0.5 m steps would share their tops)
  const inStair = (x: number, z: number) => Math.abs(x - STAIR.x) < STAIR.half + 0.5 && z > STAIR.z0 - 1e-6;
  const outline = (x: number, z: number, a: number, c: number) => Math.pow(Math.abs(x) / a, ROCK.power) + Math.pow(Math.abs(z) / c, ROCK.power);
  const floorAt = (x: number, z: number) => outline(x, z, ROCK.top[0] - 0.3, ROCK.top[1] - 0.3) <= 1;
  for (let i = -13; i < 13; i++)
    for (let k = -10; k < 10; k++) {
      const x = i + 0.5;
      const z = k + 0.5;
      const g = Math.floor(ground(x, z));
      let lowest = Infinity;
      for (let j = g - 1; j < TOP; j++) {
        const y = j + 0.5;
        const t = Math.max(0, Math.min(1, (y - foot) / (TOP - foot)));
        const swell = 0.8 * Math.sin(Math.PI * Math.min(1, t * 1.3));
        const a = ROCK.foot[0] + (ROCK.top[0] - ROCK.foot[0]) * t + swell;
        const c = ROCK.foot[1] + (ROCK.top[1] - ROCK.foot[1]) * t + swell;
        const wob = 0.07 * noise3(x * 0.21, y * 0.33, z * 0.21) + 0.035 * noise3(x * 0.6 + 7, y * 0.8, z * 0.6);
        // (the top layer: the floor, whole and clean-edged; below it the wandering sides)
        const top = j === TOP - 1;
        if (top ? !floorAt(x, z) && outline(x, z, a, c) > 1 : outline(x, z, a, c) > 1 + wob) continue;
        if (inStair(x, z)) continue;
        const band = (j - Math.floor(foot)) % 3 === 1;
        const color = top && floorAt(x, z) ? pick((i + k) & 1 ? FLOOR : FLOOR_B, r(i, k, 2)) : band ? pick(STAIN, r(i, j, k)) : pick(STONE, r(k, j, i));
        rock.grid.put(i, j, k, { color, src });
        lowest = Math.min(lowest, j);
      }
      // (hidden under the lowest cell, so the bottom layer is not drawn)
      if (lowest < Infinity) rock.grid.ghost(i, lowest - 1, k);
    }
  // Moss and ferns on the rim and ledges (never on the floor), stains down the sides.
  rock.grid.forEach((i, j, k, cell) => {
    if (cell.ghost || rock.grid.has(i, j + 1, k) || (j === TOP - 1 && floorAt(i + 0.5, k + 0.5))) return;
    const h = hash3(i, j, k, 75);
    if (h < 0.45) cell.color = pick(MOSS, hash3(k, i, j, 76));
    else if (h < 0.52 && j < TOP - 1) b.box(i + 0.5, j + 1.25, k + 0.5, 0.7, 0.5, 0.7, pick(FERN, h * 9), 'mapLeaf', { src });
  });
  rock.mottle(0.16, STAIN, 77);

  // ── The stair up the south face between naga balustrades ──────────────
  // As on Angkor Wat's causeway: the naga's smooth body is the rail, resting
  // on the stair's cheek walls; at the foot it rears up into a fan of seven
  // cobra heads under one smooth hood, a flame-leaf halo round them.
  const stairFoot = Math.min(ground(STAIR.x - 1, 12), ground(STAIR.x + 1, 12), ground(STAIR.x, 10));
  const steps = Math.max(1, Math.round((TOP - stairFoot) / 0.5));
  const zFoot = STAIR.z0 + steps * 0.5;
  for (let s = 1; s <= steps; s++) {
    const z0 = STAIR.z0 + (s - 1) * 0.5;
    const top = TOP - 0.5 * s;
    const lo = Math.floor(Math.min(ground(STAIR.x - 1.2, z0 + 0.25), ground(STAIR.x + 1.2, z0 + 0.25)) * 2) / 2 - 0.5;
    if (top > lo) d.fill(STAIR.x - STAIR.half, lo, z0, STAIR.x + STAIR.half, top, z0 + 0.5, s % 2 ? CARVED : FLOOR, { src });
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? STAIR.x - STAIR.half - 0.5 : STAIR.x + STAIR.half;
      d.fill(x0, lo, z0, x0 + 0.5, top + 1, z0 + 0.5, WHITE, { src });
    }
  }
  // (the naga's body: one smooth rail down each cheek, laid along the stair's slope)
  for (const side of [-1, 1]) {
    const cx = STAIR.x + side * (STAIR.half + 0.25);
    // (from the floor's edge down to the plinth at the foot, its underside on the cheek's step corners:
    // the line y = TOP + 0.5 − (z − z0), at 45°)
    const za = STAIR.z0 - 0.3;
    const zb = zFoot - 0.1;
    const tilt = Math.PI / 4;
    const mz = (za + zb) / 2;
    const my = TOP + 0.5 - (mz - STAIR.z0) + 0.15 / Math.cos(tilt);
    const len = (zb - za) / Math.cos(tilt);
    b.box(cx, my, mz, 0.36, 0.3, len, pick(NAGA, r(side, 11)), 'mapStone', { src, rx: tilt });
    b.box(cx, my + 0.13, mz + 0.13, 0.22, 0.1, len - 0.1, pick(NAGA, r(side, 12)), 'mapStone', { src, rx: tilt, shade: 1.06 });
  }
  // (the balustrade runs on 1 m onto the floor, where the naga's tail rises in a curl)
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? STAIR.x - STAIR.half - 0.5 : STAIR.x + STAIR.half;
    d.fill(x0, TOP, STAIR.z0 - 1, x0 + 0.5, TOP + 1, STAIR.z0, WHITE, { src });
    span(x0 + 0.06, TOP + 1, STAIR.z0 - 1, x0 + 0.44, TOP + 1.26, STAIR.z0, NAGA, 'mapStone');
    span(x0 + 0.1, TOP + 1.26, STAIR.z0 - 1, x0 + 0.4, TOP + 1.7, STAIR.z0 - 0.7, NAGA, 'mapStone');
    span(x0 + 0.1, TOP + 1.55, STAIR.z0 - 0.7, x0 + 0.4, TOP + 1.8, STAIR.z0 - 0.45, NAGA, 'mapStone', 1.05);
  }
  for (const side of [-1, 1]) {
    const cx = STAIR.x + side * (STAIR.half + 0.35);
    const z = zFoot + 0.5;
    const g = ground(cx, z);
    // The plinth (narrow: 1.8 m open between the two at the stair's foot), the body rising from it,
    // the smooth hood fanned out behind the heads (high enough to walk under its rim).
    span(cx - 0.45, g - 0.3, z - 0.6, cx + 0.45, g + 0.8, z + 0.6, WHITE, 'mapStone');
    span(cx - 0.5, g + 0.8, z - 0.65, cx + 0.5, g + 0.92, z + 0.65, GOLD, 'brass');
    span(cx - 0.22, g + 0.92, z - 0.3, cx + 0.22, g + 1.9, z + 0.1, NAGA, 'mapStone');
    const hub = g + 1.95;
    // (the hood: a smooth fan from the neck up to the heads' arc, in thin rows)
    for (let row = 0; row < 10; row++) {
      const u = (row + 0.5) / 10;
      const hw = 0.24 + 0.66 * Math.sin((u * Math.PI) / 2);
      span(cx - hw, hub + row * 0.1, z - 0.16, cx + hw, hub + (row + 1) * 0.1, z - 0.02, NAGA, 'mapStone', 0.97 + u * 0.08);
    }
    // (seven heads round the hood's rim, the middle one highest, each looking south down the way)
    for (let h = -3; h <= 3; h++) {
      const a = (h / 3) * 1.12;
      const hx = cx + Math.sin(a) * 0.86;
      const hy = hub + 0.38 + Math.cos(a) * 0.66;
      b.box(hx, hy, z + 0.02, 0.24, 0.26, 0.3, pick(NAGA, r(h, side, 3)), 'mapStone', { src, shade: 1.08 });
      b.box(hx, hy - 0.04, z + 0.24, 0.15, 0.13, 0.2, pick(NAGA, r(h, side, 4)), 'mapStone', { src, shade: 1.12 });
    }
    // (the flame-leaf halo: a pointed arch of leaves round the heads, gilded)
    for (let l = -5; l <= 5; l++) {
      const a = (l / 5) * 1.3;
      const lx = cx + Math.sin(a) * 1.12;
      const ly = hub + 0.38 + Math.cos(a) * 0.9;
      b.box(lx, ly, z - 0.12, 0.2, 0.26, 0.1, pick(GOLD, r(l, side, 5)), 'brass', { src });
    }
    b.box(cx, hub + 1.42, z - 0.12, 0.14, 0.3, 0.1, pick(GOLD, 0.5), 'brass', { src });
  }

  // ── The entrance arch and its two stone elephants ──────────────────────
  // Two white posts and a lintel with a gold band, and on it a small Angkor
  // tower (redented tiers, a lotus bud): the gate of a Khmer wat.
  {
    const z = zFoot + 1.5;
    const g = Math.round(ground(STAIR.x, z) * 2) / 2;
    for (const side of [-1, 1]) {
      const px = STAIR.x + side * 2.4;
      span(px - 0.3, g - 0.3, z - 0.3, px + 0.3, g + 0.5, z + 0.3, RED, 'mapStone');
      span(px - 0.22, g + 0.5, z - 0.22, px + 0.22, g + 3.9, z + 0.22, WHITE, 'mapStone');
      span(px - 0.3, g + 3.9, z - 0.3, px + 0.3, g + 4.1, z + 0.3, GOLD, 'brass');
      lamps.add(fr.world(px, g + 3.55, z + 0.3), 0.26, 0.9);
    }
    d.fill(STAIR.x - 2.75, g + 4, z - 0.5, STAIR.x + 2.75, g + 4.5, z + 0.5, WHITE, { src });
    span(STAIR.x - 2.8, g + 3.95, z - 0.55, STAIR.x + 2.8, g + 4.05, z + 0.55, GOLD, 'brass');
    // (its name board on the lintel's front: red, gold-edged; the words painted on it, `gateBoard`)
    span(STAIR.x - 1.7, g + 4.06, z + 0.5, STAIR.x + 1.7, g + 4.46, z + 0.56, GOLD, 'brass');
    span(STAIR.x - 1.62, g + 4.1, z + 0.52, STAIR.x + 1.62, g + 4.42, z + 0.58, RED, 'mapStone');
    board.position.set(...fr.world(STAIR.x, g + 4.26, z + 0.585));
    // (the tower: a whitewashed body, two receding tiers with gold cornices, a lotus bud)
    let ty = g + 4.5;
    for (const [hw, h] of [
      [0.9, 0.55],
      [0.68, 0.45],
      [0.5, 0.4],
    ]) {
      span(STAIR.x - hw, ty, z - hw, STAIR.x + hw, ty + h, z + hw, WHITE, 'mapStone');
      span(STAIR.x - hw - 0.06, ty + h - 0.1, z - hw - 0.06, STAIR.x + hw + 0.06, ty + h, z + hw + 0.06, GOLD, 'brass');
      ty += h;
    }
    for (const [hw, h] of [
      [0.32, 0.3],
      [0.24, 0.25],
      [0.14, 0.22],
      [0.06, 0.2],
    ]) {
      span(STAIR.x - hw, ty, z - hw, STAIR.x + hw, ty + h, z + hw, GOLD, 'brass');
      ty += h;
    }
    for (const side of [-1, 1]) elephant(STAIR.x + side * 3.9, ground(STAIR.x + side * 3.9, z + 0.4), z + 0.4);
  }

  // ── The bed he lies on, the altar before him ───────────────────────────
  d.fill(BED.x0, TOP, BED.z0, BED.x1, TOP + BED.h, BED.z1, CARVED, { src });
  // (a band of carved lotus petals along the bed's front and ends)
  for (let x = BED.x0 + 0.2; x < BED.x1 - 0.1; x += 0.4) span(x - 0.13, TOP + 0.12, BED.z1, x + 0.13, TOP + 0.38, BED.z1 + 0.07, CARVED, 'mapStone', 0.9 + (Math.round(x / 0.4) & 1) * 0.12);
  span(BED.x0 - 0.05, TOP + BED.h - 0.06, BED.z0 - 0.05, BED.x1 + 0.05, TOP + BED.h, BED.z1 + 0.05, FLOOR, 'mapStone', 1.05);
  d.fill(ALTAR.x0, TOP, ALTAR.z0, ALTAR.x1, TOP + ALTAR.h, ALTAR.z1, CARVED, { src });
  // (a red cloth over it, its gold hem hanging down the front)
  span(ALTAR.x0 - 0.04, TOP + ALTAR.h, ALTAR.z0 - 0.04, ALTAR.x1 + 0.04, TOP + ALTAR.h + 0.04, ALTAR.z1 + 0.06, RED, 'petal');
  span(ALTAR.x0 + 0.1, TOP + ALTAR.h - 0.3, ALTAR.z1 + 0.02, ALTAR.x1 - 0.1, TOP + ALTAR.h, ALTAR.z1 + 0.06, RED, 'petal');
  span(ALTAR.x0 + 0.1, TOP + ALTAR.h - 0.34, ALTAR.z1 + 0.03, ALTAR.x1 - 0.1, TOP + ALTAR.h - 0.28, ALTAR.z1 + 0.07, GOLD, 'brass');
  // The donation box by the altar: red, gold-edged, a dark slot in its lid.
  {
    const x = ALTAR.x1 + 0.9;
    const z = ALTAR.z1 - 0.2;
    span(x - 0.35, TOP, z - 0.25, x + 0.35, TOP + 0.75, z + 0.25, RED, 'mapStone');
    span(x - 0.38, TOP + 0.75, z - 0.28, x + 0.38, TOP + 0.83, z + 0.28, GOLD, 'brass');
    span(x - 0.18, TOP + 0.83, z - 0.03, x + 0.18, TOP + 0.85, z + 0.03, SHADOW[0], 'mapStone');
    span(x - 0.38, TOP, z + 0.24, x + 0.38, TOP + 0.08, z + 0.28, GOLD, 'brass');
  }

  // ── The shelter: posts, beams and a two-tier Khmer roof ─────────────────
  let gableMs = 0;
  const upperEave = ROOF.eaveY + ((ROOF.eave - ROOF.skirt) / ROOF.run) * ROOF.rise - 0.25;
  const roofBottom = (a: number) => {
    const up = a < ROOF.upper ? upperEave + Math.floor((ROOF.upper - a) / ROOF.run) * ROOF.rise : Infinity;
    const skirt = a >= ROOF.skirt && a <= ROOF.eave ? ROOF.eaveY + Math.floor((ROOF.eave - a) / ROOF.run) * ROOF.rise : Infinity;
    return Math.min(up, skirt);
  };
  for (const pz of POSTS.z)
    for (const px of POSTS.x) {
      const top = ROOF.eaveY - 0.35;
      span(px - 0.3, TOP, pz - 0.3, px + 0.3, TOP + 0.45, pz + 0.3, RED, 'mapStone');
      span(px - 0.22, TOP + 0.45, pz - 0.22, px + 0.22, top - 0.3, pz + 0.22, WHITE, 'mapStone');
      span(px - 0.32, top - 0.3, pz - 0.32, px + 0.32, top, pz + 0.32, GOLD, 'brass');
    }
  for (const pz of POSTS.z) {
    span(-ROOF.half + 0.4, ROOF.eaveY - 0.35, pz - 0.25, ROOF.half - 0.4, ROOF.eaveY, pz + 0.25, WHITE, 'mapStone');
    span(-ROOF.half + 0.4, ROOF.eaveY - 0.4, pz - 0.29, ROOF.half - 0.4, ROOF.eaveY - 0.3, pz + 0.29, GOLD, 'brass');
  }
  for (const px of [POSTS.x[0], POSTS.x[3]]) span(px - 0.22, ROOF.eaveY - 0.35, POSTS.z[0], px + 0.22, ROOF.eaveY, POSTS.z[1], WHITE, 'mapStone');
  // (tie beams across under the upper roof, on the outer posts, where the gables stand)
  for (const px of [-ROOF.half + 0.55, ROOF.half - 0.55]) span(px - 0.25, upperEave - 0.35, ROOF.zc - ROOF.upper, px + 0.25, upperEave, ROOF.zc + ROOF.upper, WHITE, 'mapStone');
  const tiers: [number, number, number][] = [
    [ROOF.eave, ROOF.skirt, ROOF.eaveY],
    [ROOF.upper, 0, upperEave],
  ];
  for (const [from, to, y0] of tiers) {
    const rows = Math.ceil((from - to) / ROOF.run - 1e-6);
    for (let k = 0; k < rows; k++) {
      const outer = from - k * ROOF.run;
      const inner = Math.max(to, outer - ROOF.run);
      const y = y0 + k * ROOF.rise;
      const ridge = to === 0 && inner <= 1e-6;
      for (const s of [-1, 1]) {
        if (ridge && s > 0) break;
        const za = ridge ? ROOF.zc - outer : s < 0 ? ROOF.zc - outer : ROOF.zc + inner;
        const zb = ridge ? ROOF.zc + outer : s < 0 ? ROOF.zc - inner : ROOF.zc + outer;
        // (the eaves' row a deeper red; the tiles in runs of a few metres, each its own tone)
        for (let x = -ROOF.half, n = 0; x < ROOF.half - 0.05; n++) {
          const e = Math.min(ROOF.half, x + 1.4 + r(n, k, 18) * 1.2);
          span(x, y, za, e, y + ROOF.rise + 0.05, zb, k === 0 ? pick(TILE_EDGE, r(x, k, 16)) : pick(TILE, r(x + n, k + y0, 17)), 'mapStone', k % 3 === 2 ? 0.92 : 1);
          x = e;
        }
      }
      if (ridge) {
        // The ridge: a gold crest along it.
        const top = y + ROOF.rise + 0.05;
        span(-ROOF.half, top, ROOF.zc - 0.09, ROOF.half, top + 0.16, ROOF.zc + 0.09, GOLD, 'brass');
      }
    }
  }
  // The gilt naga at the gable ends (sacred/naga.ts, made just after the build): a barge board down each
  // slope over the rows' stepped ends, a five-headed hood rearing at each eave, a slender hooked chovea on
  // the ridge's end.
  {
    const naga: RoofNagaSpec = { rakes: [], fans: [], choveas: [] };
    const W = (x: number, y: number, z: number) => new Vector3(...fr.world(x, y, z));
    const slopeAt = (from: number, y0: number, a: number) => y0 + ROOF.rise + 0.1 + (from - a) * (ROOF.rise / ROOF.run);
    for (const [from, to, y0] of tiers)
      for (const out of [-1, 1]) {
        const xo = out * (ROOF.half + 0.02);
        const aTop = to === 0 ? 0 : ROOF.skirt + 0.55;
        for (const s of [-1, 1]) {
          naga.rakes.push({ from: W(xo, slopeAt(from, y0, from + 0.04), ROOF.zc + s * (from + 0.04)), to: W(xo, slopeAt(from, y0, aTop), ROOF.zc + s * aTop), out: new Vector3(out, 0, 0) });
          naga.fans.push({ at: W(out * (ROOF.half + 0.12), y0 + 0.12, ROOF.zc + s * (from + 0.18)), look: new Vector3(out * 0.95, 0, s).normalize(), height: 1.0 });
        }
        if (to === 0) naga.choveas.push({ at: W(out * (ROOF.half + 0.08), slopeAt(from, y0, 0) - 0.06, ROOF.zc), out: new Vector3(out, 0, 0), height: 1.5 });
      }
    void trackSacred(new Promise<void>((done) => setTimeout(() => {
      try {
        shrines.sacred.add(roofNaga(naga));
      } finally {
        done();
      }
    }, 0)));
  }
  // The gable ends: red boards filling the triangle under the upper roof, a gold line at their foot,
  // and on them the painted gable (sacred/gable.ts: gold kbach on red lacquer, a gilt Buddha in relief).
  {
    const from = upperEave - 0.35;
    const edges = [ROOF.upper, ROOF.skirt];
    for (let a = ROOF.upper - ROOF.run; a > 1e-6; a -= ROOF.run) edges.push(a);
    edges.sort((p, q) => q - p);
    const steps = edges.filter((a) => a <= ROOF.upper).map((a) => [a, roofBottom(a - 0.01) - from] as [number, number]);
    const base = upperEave - from;
    const inner = ROOF.upper - ROOF.run;
    const slope = ROOF.rise / ROOF.run;
    const spec: GableSpec = { steps, foot: 0.15, half: inner + (base - 0.15) / slope, apex: base + slope * inner };
    const tg = performance.now();
    for (const out of [-1, 1]) {
      const xg = out * (ROOF.half - 0.4);
      for (let a = -ROOF.upper + 0.25; a < ROOF.upper - 0.2; a += 0.5) {
        const bottom = roofBottom(Math.abs(a) + 0.25);
        if (bottom - from < 0.05) continue;
        span(xg - 0.1 * out - 0.1, from, ROOF.zc + a - 0.25, xg - 0.1 * out + 0.1, bottom, ROOF.zc + a + 0.25, RED, 'mapStone');
      }
      span(xg - 0.2, from - 0.05, ROOF.zc - ROOF.upper, xg + 0.2, from + 0.15, ROOF.zc + ROOF.upper, GOLD, 'brass');
      // (the panel is made facing +z: turned to face out along x)
      const g = new Group();
      g.add(gable(spec, { x: 0, y: 0, z: 0, facing: 1 }));
      const [wx, , wz] = fr.world(xg + out * 0.12, 0, ROOF.zc);
      g.position.set(wx, from, wz);
      g.rotation.y = (out * Math.PI) / 2;
      g.updateMatrixWorld(true);
      shrines.sacred.add(g);
    }
    gableMs = performance.now() - tg;
  }
  // Lanterns under the front and back eaves, glowing at night (no light: glow and bloom).
  for (const pz of [POSTS.z[1] + 0.55, POSTS.z[0] - 0.55])
    for (const px of [-6, -2, 2, 6]) {
      span(px - 0.06, ROOF.eaveY - 0.75, pz - 0.06, px + 0.06, ROOF.eaveY - 0.3, pz + 0.06, GOLD, 'brass');
      span(px - 0.2, ROOF.eaveY - 0.82, pz - 0.2, px + 0.2, ROOF.eaveY - 0.74, pz + 0.2, RED, 'mapStone');
      lamps.add(fr.world(px, ROOF.eaveY - 1.05, pz), 0.3, 0.8);
    }

  // ── Buddhist flags on bamboo poles: either side of the arch, and at the rock's front corners ──
  const flag = (x: number, y: number, z: number, h: number, dir: 1 | -1) => {
    span(x - 0.07, y, z - 0.07, x + 0.07, y + h, z + 0.07, BAMBOO, 'mapBark');
    b.box(x, y + h + 0.12, z, 0.2, 0.24, 0.2, pick(GOLD, 0.3), 'brass', { src });
    FLAG.forEach((c, i) => span(x + dir * (0.07 + i * 0.3), y + h - 1.3, z - 0.025, x + dir * (0.07 + (i + 1) * 0.3), y + h - 0.1, z + 0.025, c, 'petal'));
  };
  for (const side of [-1, 1] as const) {
    const x = STAIR.x + side * 5.6;
    flag(x, ground(x, zFoot + 2), zFoot + 2, 6.5, side);
  }
  for (const side of [-1, 1] as const) flag(side * 8.3, TOP, 3.6, 5, side);

  // ── The Buddha, his altar's offerings, parasols, garlands; hidden blocks ──
  shrines.place(fr, buddhaStatue({ kind: 'reclining', look: KULEN_STONE, length: BUDDHA.length, near: 40, hide: 420 }), 0, TOP + BED.h, BUDDHA.z);
  // (his whole body: the explorer walks round the bed, never onto him)
  shrines.solid(fr, 0, TOP + BED.h + 1.5, BUDDHA.z, BUDDHA.length + 0.6, 3, 2.3);
  const cx = (ALTAR.x0 + ALTAR.x1) / 2;
  const on = TOP + ALTAR.h + 0.04;
  const az = (ALTAR.z0 + ALTAR.z1) / 2;
  shrines.offer(fr, 'incense', cx, on, az, { scale: 1.8, sticks: 11, smoke: 1 });
  for (const side of [-1, 1]) {
    shrines.offer(fr, 'candle', cx + side * 0.42, on, az + 0.12, { scale: 1.6 });
    shrines.offer(fr, 'candle', cx + side * 0.62, on, az - 0.18, { scale: 1.4 });
    shrines.offer(fr, 'lotusVase', cx + side * 0.95, on, az, { ry: side * 0.4, scale: 1.3 });
  }
  shrines.offer(fr, 'baySei', ALTAR.x0 + 0.28, on, az, { scale: 1.3 });
  shrines.offer(fr, 'fruitPlate', ALTAR.x1 - 0.28, on, az, { scale: 1.3 });
  shrines.garland(fr, [ALTAR.x0, on - 0.06, ALTAR.z1 + 0.08], [ALTAR.x1, on - 0.06, ALTAR.z1 + 0.08], 0.16, 311);
  // (marigolds the pilgrims laid along his bed)
  shrines.garland(fr, [-3.2, TOP + BED.h - 0.05, BED.z1 + 0.1], [1.6, TOP + BED.h - 0.05, BED.z1 + 0.1], 0.2, 312);
  for (const end of [-1, 1]) {
    const px = end * (BED.x1 + 0.75);
    shrines.offer(fr, 'parasol', px, TOP, BUDDHA.z + 0.4, { height: 3.2 });
    shrines.solid(fr, px, TOP + 1.6, BUDDHA.z + 0.4, 0.25, 3.2, 0.25);
    shrines.offer(fr, 'lotusVase', end * (BED.x1 - 0.35), TOP + BED.h, BED.z1 - 0.3, { scale: 1.4 });
  }
  shrines.halo(fr, cx, TOP + 1.1, ALTAR.z1 + 0.2, 3.2);
  shrines.halo(fr, 0, TOP + 1.6, BUDDHA.z + 1.2, 6, 0.5);
  // (lanterns' warm light on him at night, at his head, middle and feet: statue lamps, no light)
  for (const x of [-4, 0, 4]) {
    const [lx, ly, lz] = fr.world(x, ROOF.eaveY - 1.2, POSTS.z[1] - 0.6);
    SACRED_LAMPS.push({ x: lx, y: ly, z: lz, range: 7, color: [1.3, 0.72, 0.32], day: 0 });
  }

  // ── The paved way from the temple's grand stair to the arch ────────────
  const slabs = new Set<string>();
  const way = RECLINING.way.slice(0, 4);
  for (let w = 1; w < way.length; w++) {
    const [ax, , az0] = way[w - 1];
    const [bx, , bz0] = way[w];
    const len = Math.hypot(bx - ax, bz0 - az0);
    const ux = (bx - ax) / len;
    const uz = (bz0 - az0) / len;
    for (let t = 0; t <= len; t += 0.5)
      for (const off of [-0.55, 0.55]) {
        const x = Math.floor(ax + ux * t - uz * off) + 0.5;
        const z = Math.floor(az0 + uz * t + ux * off) + 0.5;
        const key = `${x},${z}`;
        if (slabs.has(key)) continue;
        slabs.add(key);
        const h = hash3(Math.floor(x), 0, Math.floor(z), 79);
        if (h < 0.12) continue;
        const y = f.heightAt(x, z);
        world.box(x, y + 0.05, z, 0.92, 0.14, 0.92, pick(h < 0.5 ? FLOOR : FLOOR_B, h), 'mapStone', { src, shade: 0.94 + h * 0.08 });
        f.occupy(x - 0.5, z - 0.5, x + 0.5, z + 0.5);
      }
  }

  rock.commit();
  d.commit();
  const n0 = world.boxes.length;
  fr.place(b, world);
  for (let i = n0; i < world.boxes.length; i++) world.boxes[i].ry = undefined;
  f.occupy(RECLINING.x - 13, RECLINING.z - 10, RECLINING.x + 13, RECLINING.z + zFoot + 4);
  const [kx, , kz] = fr.world(KNEEL.x, TOP, KNEEL.z);
  const [fx, , fz] = fr.world(KNEEL.fx, TOP, KNEEL.fz);
  const note = `reclining Buddha ${b.boxes.length + slabs.size} blocks in ${(performance.now() - t0).toFixed(0)} ms (gables ${gableMs.toFixed(0)}), kneel at ${kx},${TOP},${kz} facing ${fx},${fz}, ${steps} steps, gate at z ${fr.wz(0, zFoot + 1.5)}`;
  const object = new Group();
  object.name = 'landmark:kulen:reclining';
  object.add(board);
  return { blocks: b.boxes.length + slabs.size, note, object, update: sign.update };

  /** A stone elephant on a low plinth, facing south down the way: legs, body, head, ears, trunk, tusks, a gold headdress. */
  function elephant(x: number, g: number, z: number): void {
    span(x - 0.85, g - 0.3, z - 1.35, x + 0.85, g + 0.3, z + 1.35, WHITE, 'mapStone');
    const y = g + 0.3;
    for (const [lx, lz] of [
      [-0.38, -0.75],
      [0.38, -0.75],
      [-0.38, 0.65],
      [0.38, 0.65],
    ])
      span(x + lx - 0.2, y, z + lz - 0.2, x + lx + 0.2, y + 0.95, z + lz + 0.2, ELEPHANT, 'mapStone');
    span(x - 0.6, y + 0.85, z - 1.05, x + 0.6, y + 1.95, z + 0.95, ELEPHANT, 'mapStone');
    span(x - 0.5, y + 1.95, z - 0.8, x + 0.5, y + 2.15, z + 0.6, ELEPHANT, 'mapStone', 1.05);
    // (the head, the ears spread flat, the trunk hanging and curling forward at its tip, the tusks)
    span(x - 0.45, y + 1.35, z + 0.85, x + 0.45, y + 2.3, z + 1.55, ELEPHANT, 'mapStone');
    for (const s of [-1, 1]) span(x + s * 0.45, y + 1.3, z + 0.95, x + s * 0.72, y + 2.2, z + 1.35, ELEPHANT, 'mapStone', 0.92);
    span(x - 0.16, y + 0.35, z + 1.45, x + 0.16, y + 1.45, z + 1.78, ELEPHANT, 'mapStone');
    span(x - 0.13, y + 0.25, z + 1.6, x + 0.13, y + 0.45, z + 2.0, ELEPHANT, 'mapStone');
    for (const s of [-1, 1]) span(x + s * 0.28 - 0.06, y + 1.2, z + 1.45, x + s * 0.28 + 0.06, y + 1.32, z + 1.95, WHITE, 'mapStone', 1.1);
    span(x - 0.47, y + 2.05, z + 0.95, x + 0.47, y + 2.35, z + 1.25, GOLD, 'brass');
    span(x - 0.62, y + 1.4, z - 0.4, x + 0.62, y + 1.9, z + 0.3, RED, 'mapStone');
    span(x - 0.64, y + 1.35, z - 0.42, x + 0.64, y + 1.43, z + 0.32, GOLD, 'brass');
    span(x - 0.05, y + 0.9, z - 1.2, x + 0.05, y + 1.8, z - 1.05, ELEPHANT, 'mapStone');
  }
}

/**
 * The gate's name board, "វត្តព្រះអង្គធំ" (Wat Preah Ang Thom) over
 * "ភ្នំគូលែន" (Phnom Kulen) in gold on red, in Khmer letters (English on the
 * ខ្មែរ / EN switch: `rbGate`, `rbGateSub` in ui/lang.ts): a canvas on a thin
 * plane just in front of the voxel board, `w` × `h` m. One small draw, only
 * while the camera is near, no shadow; painted again when the fonts have
 * loaded and when the language changes.
 */
function gateBoard(w: number, h: number): { mesh: Mesh; update(f: MapFrame): void } {
  const PX = 200;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * PX);
  canvas.height = Math.round(h * PX);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new MeshStandardMaterial({ map: texture, roughness: 0.6, metalness: 0.1 });
  material.name = 'kulen:gateBoard';
  const mesh = new Mesh(new PlaneGeometry(w, h), material);
  mesh.name = 'kulen:gateBoard';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  const paint = () => {
    const g = canvas.getContext('2d');
    if (!g) return;
    const W = canvas.width;
    const H = canvas.height;
    const km = lang() === 'km';
    g.fillStyle = '#962c22';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#e2b24a';
    g.lineWidth = H * 0.05;
    g.strokeRect(H * 0.07, H * 0.07, W - H * 0.14, H - H * 0.14);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#f0c85a';
    const face = km ? `'Koulen', 'Kantumruy Pro', 'Khmer Sangam MN', 'Khmer MN', sans-serif` : `'Nunito Sans', 'Kantumruy Pro', system-ui, sans-serif`;
    const title = t('rbGate');
    const sub = t('rbGateSub');
    let size = Math.round(H * (km ? 0.5 : 0.42));
    g.font = `${km ? 400 : 800} ${size}px ${face}`;
    // (the name and the mountain's side by side, the name bigger)
    while (size > 8 && g.measureText(title).width + g.measureText(sub).width * 0.7 > W * 0.84) g.font = `${km ? 400 : 800} ${(size -= 2)}px ${face}`;
    const tw = g.measureText(title).width;
    const small = `${km ? 400 : 700} ${Math.round(size * 0.66)}px ${face}`;
    g.font = small;
    const sw = g.measureText(sub).width;
    const gap = H * 0.35;
    const x0 = (W - tw - gap - sw) / 2;
    g.font = `${km ? 400 : 800} ${size}px ${face}`;
    g.fillText(title, x0 + tw / 2, H * 0.54);
    g.font = small;
    g.fillStyle = '#f2e6c8';
    g.fillText(sub, x0 + tw + gap + sw / 2, H * 0.56);
    texture.needsUpdate = true;
  };
  paint();
  document.fonts?.ready.then(paint).catch(() => undefined);
  onLang(paint);
  return {
    mesh,
    update(f) {
      const c = f.camera.position;
      mesh.visible = Math.hypot(c.x - mesh.position.x, c.z - mesh.position.z) < 90;
    },
  };
}
