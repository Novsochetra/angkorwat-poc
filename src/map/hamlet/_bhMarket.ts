import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import { eventsNow } from '../events';
import { SURFACE, type HeightField } from '../heightfield';
import { registerShop } from '../shop';
import type { MapFrame } from '../types';
import { BREAKFAST_COUNTER, BREAKFAST_STOOLS, BREAKFAST_TABLE, BM_PARKED, BM_STALLS, BM_TREE, bmX, bmYaw, bmZ, CART_SHOP, cartOpen, frontXZ, stallFrame, stallOpen, type BmStall } from './_bhMarketPlan';
import { CART, SALA, salaToWorld } from './_bhSpots';
import { basket, goods, hang, heap } from './_mkGoods';
import { BAMBOO, groundMat, MkBuild, PARASOLS, parasol, platform, STOOLS, table, TARPS, tarp, tone, wheel, WOOD, type Tones } from './_mkKit';
import { NOODLE_WORD, signLetters, wordSize } from './_mkSign';
import type { Puff } from './_mkStalls';

/**
 * The blocks of the little morning market behind Angkor Wat (where it all
 * stands: `_bhMarketPlan.ts`), written with the east market's kit
 * (`_mkKit.ts` poles, tarps, parasols, tables; `_mkGoods.ts` goods;
 * `_mkSign.ts` the painted word) into a builder of its own that tags what
 * comes and goes with the time of day; the hamlet part appends them to its
 * own blocks (one set of meshes, `_backHamlet.ts`) and shows and hides the
 * tagged ones (`_bhToggles.ts`).
 *
 * - The breakfast stall: a table under a faded blue tarp with the painted
 *   sign "នំបញ្ចុក" hung from its front pole; two aluminium pots on clay
 *   charcoal stoves beside it — the green-gold fish gravy for the num banh
 *   chok, the rice porridge (bobor) — steaming in the cool of the morning;
 *   noodle nests on banana leaves, plates of herbs, bean sprouts and banana
 *   flower, a stack of bowls; a cooler of ice and bags of iced coffee; a low
 *   table with plastic stools in front for eating there; an LED tube for the
 *   dark before dawn.
 * - The fruit table under a red market parasol, a bamboo rail at its front
 *   with hands of bananas hanging, coconuts on the ground before it.
 * - Ground sellers on plastic sheets: vegetables under a small umbrella;
 *   fish in aluminium basins in the big tree's shade, the baskets and the
 *   shoulder pole she carried them in lying by her.
 * - The num krok seller on her mat: the clay charcoal stove and the
 *   blackened round griddle with its cups of batter crisping, trays of
 *   cakes (num ansom in banana leaf, num kom), a small umbrella, and a
 *   battery lamp on a stick she lights when she comes back in the evening.
 * - The big old tree across the trail from the lane's foot (its fluted
 *   trunk, roots, a broad flat crown), a bamboo kre under it to sit on;
 *   bicycles and a moto parked by the lane's foot; banana leaves dropped on
 *   the ground; trodden earth round the stalls.
 *
 * Toggles: stall `i`'s goods, sheet, spread tarp or open parasol are
 * `openTag(i)`, its rolled tarp and folded parasol `closedTag(i)`; what is
 * there only while the market is busy (a moto and a bicycle, dropped
 * leaves) `BUSY_TAG`. All of them soft families (goods, cloth: `petal`), so
 * the walk maps never keep what has gone. Families: `mapBark` (wood,
 * bamboo, the tree's trunk: solid), `mapStone` (stoves, pots, the cooler,
 * the moto: solid), `petal` (goods, cloth, stools: soft), `mapLeaf` (the
 * crown); the kit's `metal` (a moto's wheels) the hamlet draws as stone:
 * four families, four draws.
 */

export const openTag = (i: number): number => 1 + i * 2;
export const closedTag = (i: number): number => 2 + i * 2;
export const BUSY_TAG = 1 + BM_STALLS.length * 2;

/** A light of the market (map m): a glowing block and its halo (m), when it is lit: the breakfast stall's LED tube before sunrise, a stove's embers while its stall is open, the num krok seller's evening lamp. */
export interface BmLamp {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  color: number;
  halo: number;
  on: 'dawn' | 'fire' | 'evening';
  stall: string;
}

export interface BmBuilt {
  mk: MkBuild;
  lamps: BmLamp[];
  /** The steaming pots and the griddle (hamlet/_mkSteam.ts). */
  steam: Puff[];
  /** Map rectangles built on (the jungle's trees and the undergrowth keep off). */
  covers: [number, number, number, number][];
}

/** Lamp colours (sRGB): an LED tube, embers, a small warm bulb. */
const TUBE = 0xdcf0ff;
const EMBER = 0xff5a1c;
const BULB = 0xffc070;
/** Clay stoves, the griddle's cast iron, aluminium. */
const CLAY: Tones = [0x8a5a3a, 0x7e5234, 0x946242];
const ALU: Tones = [0xb4b8ba, 0xc4c8ca, 0xa8acae];
const IRON = 0x2a2622;
/** Ground sellers' umbrellas. */
const UMBRELLAS = [0xe07a2a, 0x3a9a6a, 0x7a4a9a, 0xd84a6a];

/** A colour a bit darker (k < 1). */
function darker(hex: number, k: number): number {
  const c = (s: number) => Math.max(0, Math.min(255, Math.round(((hex >> s) & 255) * k)));
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

/** Build the market into a builder of its own (append it to the hamlet's with its tags: `_backHamlet.ts`). */
export function buildBackMarket(field: HeightField): BmBuilt {
  const mk = new MkBuild();
  const out: BmBuilt = { mk, lamps: [], steam: [], covers: [] };
  BM_STALLS.forEach((s, i) => {
    const f = stallFrame(s);
    mk.at(f.x, field.heightAt(f.x, f.z), f.z, f.yaw, 5101 + i * 17);
    stall(mk, s, i, out);
    const r = Math.max(s.w, s.d) / 2 + 1.2;
    out.covers.push([f.x - r, f.z - r, f.x + r, f.z + r]);
  });
  breakfastTable(mk, field, BM_STALLS.findIndex((s) => s.id === 'breakfast'), out);
  bigTree(mk, field, out);
  parked(mk, field, out);
  dropped(mk, field);
  worn(mk, field);
  mk.tag = 0;
  return out;
}

/** Keep the jungle's trees and the undergrowth off what the market builds on. */
export function occupyMarket(field: HeightField, built: BmBuilt): void {
  for (const [x0, z0, x1, z1] of built.covers) field.occupy(x0, z0, x1, z1);
}

/** A lamp at a point of the builder's frame now (stall space). */
function lampAt(mk: MkBuild, out: BmBuilt, lx: number, ly: number, lz: number, s: number, color: number, halo: number, on: BmLamp['on'], stall: string): void {
  out.lamps.push({ x: mk.wx(lx, lz), y: mk.ground + ly, z: mk.wz(lx, lz), sx: s, sy: s * 1.3, sz: s, color, halo, on, stall });
}

/** A low plastic stool (soft: a person sitting on it is posed on the ground, `POSE.stool`). */
function softStool(mk: MkBuild, x: number, z: number, color: number, h = 0.34): void {
  mk.box(x, h - 0.03, z, 0.34, 0.06, 0.34, color, 'petal', 1.05);
  mk.box(x, (h - 0.06) / 2, z, 0.28, h - 0.06, 0.28, color, 'petal', 0.8);
}

/**
 * A pot on a clay charcoal stove at (x, z): the stove (round: two boxes
 * crossed), its mouth glowing while the stall is open, the aluminium pot and
 * what is in it (its top: toggled with the stall); returns the pot's top.
 */
function potOnStove(mk: MkBuild, out: BmBuilt, stallId: string, open: number, x: number, z: number, r: number, h: number, fill: number): number {
  const c = tone(CLAY, mk.r(x, z, 1));
  mk.box(x, 0.18, z, 0.52, 0.36, 0.52, c, 'mapStone', 0.92);
  mk.box(x, 0.18, z, 0.52, 0.36, 0.52, c, 'mapStone', 0.92, 0, Math.PI / 4);
  // (the fire mouth, facing the front)
  mk.box(x, 0.12, z + 0.25, 0.2, 0.14, 0.04, 0x1e1814, 'mapStone', 0.8);
  lampAt(mk, out, x, 0.12, z + 0.27, 0.12, EMBER, 0.6, 'fire', stallId);
  const s = r * 1.66;
  const a = tone(ALU, mk.r(z, x, 2));
  mk.box(x, 0.36 + h / 2, z, s, h, s, a, 'mapStone', 1);
  mk.box(x, 0.36 + h / 2, z, s, h, s, a, 'mapStone', 1, 0, Math.PI / 4);
  mk.box(x, 0.36 + h - 0.02, z, s + 0.05, 0.05, s + 0.05, a, 'mapStone', 1.1, 0, Math.PI / 8);
  const was = mk.tag;
  mk.tag = open;
  mk.box(x, 0.36 + h - 0.06, z, s - 0.08, 0.04, s - 0.08, fill, 'petal', 0.95, 0, Math.PI / 4);
  mk.tag = was;
  out.steam.push({ x: mk.wx(x, z), y: mk.ground + 0.36 + h + 0.05, z: mk.wz(x, z), stall: stallId });
  return 0.36 + h;
}

/** One stall in its frame (stall space: x across, z to its front, y up from its ground). */
function stall(mk: MkBuild, s: BmStall, i: number, out: BmBuilt): void {
  mk.src = traceSource();
  const open = openTag(i);
  const closed = closedTag(i);
  const { w, d } = s;
  const front = d / 2;
  mk.tag = 0;
  switch (s.kind) {
    case 'breakfast': {
      tarp(mk, w, d, 2.95, 2.7, TARPS.tarpBlue, open, closed);
      // The serving table (the seller stands behind it), a shelf of bowls and a basket under it.
      const { x: tx, z: tz, w: tw, d: td, h: th } = BREAKFAST_COUNTER;
      table(mk, tx, tz, tw, td, th);
      mk.box(tx + 0.6, 0.35, tz, 0.5, 0.2, 0.4, tone(BAMBOO, mk.r(i, 3)), 'mapBark', 0.9);
      mk.tag = open;
      goods(mk, 'noodles', { x0: tx - tw / 2 + 0.1, x1: tx + tw / 2 - 0.1, z0: tz - td / 2 + 0.08, z1: tz + td / 2 - 0.08, y: th });
      mk.tag = 0;
      // The two pots on their stoves at the west end: the fish gravy (samlor proher) and the rice porridge.
      potOnStove(mk, out, s.id, open, -1.25, 0.35, 0.34, 0.42, 0xb8a848);
      potOnStove(mk, out, s.id, open, -1.25, -0.55, 0.3, 0.36, 0xf0ece0);
      // A cooler of ice at the east end; bags of iced coffee and cups on it while she is there.
      mk.span(1.55, 0, 0.2, 2.05, 0.46, 0.75, 0xd83a2a, 'mapStone', 1);
      mk.span(1.53, 0.46, 0.18, 2.07, 0.52, 0.77, 0xf2f0ea, 'mapStone', 1);
      mk.tag = open;
      for (let k = 0; k < 4; k++) {
        const bx = 1.63 + (k % 2) * 0.22;
        const bz = 0.32 + Math.floor(k / 2) * 0.24;
        mk.box(bx, 0.62, bz, 0.14, 0.2, 0.12, 0xa8744a, 'petal', 1.05);
        mk.box(bx + 0.03, 0.8, bz, 0.02, 0.18, 0.02, [0xe87aa0, 0x5a9ad8][k % 2], 'petal');
      }
      for (let k = 0; k < 5; k++) mk.box(1.95, 0.57 + k * 0.08, 0.62, 0.12, 0.08, 0.12, 0xf4f2ee, 'petal', 1.05);
      mk.tag = 0;
      // A big glazed water jar behind, a bucket of washing water and a basin of bowls.
      mk.box(-1.55, 0.35, -1.0, 0.62, 0.7, 0.62, 0x5e3620, 'mapStone', 0.95);
      mk.box(-1.55, 0.74, -1.0, 0.42, 0.1, 0.42, 0x6b3f26, 'mapStone', 1.05);
      mk.box(0.9, 0.16, -0.95, 0.44, 0.32, 0.44, 0x3a6aa8, 'petal', 0.95);
      mk.box(0.9, 0.3, -0.95, 0.36, 0.03, 0.36, 0x9ab4c0, 'petal', 1.05);
      // The painted sign "នំបញ្ចុក" hung from the tarp's front pole on two strings.
      const [nc, nr] = wordSize(NOODLE_WORD);
      const px = 0.021;
      const bw = nc * px + 0.16;
      const bh = nr * px + 0.12;
      const zf = front + 0.35;
      const by = 2.9 - 0.3 - bh / 2;
      mk.span(-bw / 2, by - bh / 2, zf - 0.03, bw / 2, by + bh / 2, zf + 0.03, 0xf4f0e6, 'mapBark', 1.05);
      mk.span(-bw / 2 - 0.03, by - bh / 2 - 0.03, zf - 0.035, bw / 2 + 0.03, by - bh / 2 + 0.02, zf + 0.035, 0xc83a2a, 'mapBark');
      mk.span(-bw / 2 - 0.03, by + bh / 2 - 0.02, zf - 0.035, bw / 2 + 0.03, by + bh / 2 + 0.03, zf + 0.035, 0xc83a2a, 'mapBark');
      for (const sx of [-1, 1]) mk.box((sx * bw) / 2.6, by + bh / 2 + 0.12, zf, 0.015, 0.22, 0.015, 0x3a3a3a, 'mapBark');
      signLetters(mk, NOODLE_WORD, 0, by, zf + 0.01, px, 1, 0x2a4a8a);
      // An LED tube on the east front pole for the dark before dawn.
      lampAt(mk, out, w / 2 + 0.15, 2.3, front + 0.2, 0.1, TUBE, 1.6, 'dawn', s.id);
      mk.box(w / 2 + 0.15, 2.3, front + 0.2, 0.06, 0.06, 0.5, 0xe8e8e2, 'mapBark');
      break;
    }
    case 'table': {
      const td = 1.0;
      const tz = front - 0.05 - td / 2;
      const tw = w - 0.6;
      table(mk, 0, tz, tw, td, 0.95);
      softStool(mk, s.seat.x, s.seat.z, tone(STOOLS, mk.r(i, 1)));
      // Plastic crates under the table (they stay).
      mk.box(-tw / 4, 0.3, tz, 0.5, 0.36, 0.4, tone([0xc83a32, 0x3a6aa8], mk.r(i, 2)), 'mapBark', 0.9);
      mk.box(tw / 4, 0.3, tz - 0.05, 0.5, 0.36, 0.4, tone([0x3a9a5a, 0xe0a02a], mk.r(i, 4)), 'mapBark', 0.9);
      parasol(mk, -0.2, -0.45, 2.85, 1.9, PARASOLS[s.cover === 'parasolGreen' ? 'parasolGreen' : 'parasolRed'], open, closed, 0.3 + i);
      mk.tag = open;
      goods(mk, s.goods, { x0: -tw / 2 + 0.1, x1: tw / 2 - 0.1, z0: tz - td / 2 + 0.08, z1: tz + td / 2 - 0.08, y: 0.95 });
      mk.tag = 0;
      // A thin bamboo rail across the front for the hands of bananas.
      const rz = tz + td / 2 + 0.08;
      for (const sx of [-1, 1]) mk.box((sx * tw) / 2, 0.95, rz, 0.05, 1.9, 0.05, tone(BAMBOO, mk.r(sx, 3)), 'mapBark');
      mk.rod(-tw / 2, 1.88, rz, tw / 2, 1.88, rz, 0.05, 0.05, tone(BAMBOO, 0.3), 'mapBark');
      mk.tag = open;
      hang(mk, 'fruit', -tw / 2 + 0.15, tw / 2 - 0.15, rz, 1.95);
      mk.tag = 0;
      break;
    }
    case 'platform': {
      // A raised bamboo platform (she sits on it among her goods), a green parasol; palm sugar and rice on it, duck eggs in a basket and a jug of palm juice by it.
      platform(mk, 0, -0.05, w - 0.2, d - 0.3, 0.5);
      parasol(mk, -0.75, -0.7, 2.9, 1.75, PARASOLS.parasolGreen, open, closed, 0.6);
      mk.tag = open;
      goods(mk, s.goods, { x0: -w / 2 + 0.25, x1: w / 2 - 0.25, z0: -0.2, z1: front - 0.35, y: 0.5 });
      const ex = w / 2 + 0.35;
      basket(mk, ex, 0, 0.35, 0.44, 0.44, 0.26);
      heap(mk, ex, 0.26, 0.35, 0.16, 0.16, 0.07, [0xf0ece0, 0xe8e2d0, 0xdcd4c0], 2, 11);
      mk.box(ex, 0.22, -0.3, 0.3, 0.44, 0.3, 0xe8ecf0, 'petal', 1);
      mk.box(ex, 0.3, -0.3, 0.26, 0.26, 0.26, 0xf0e8c8, 'petal', 0.95);
      mk.box(ex, 0.47, -0.3, 0.1, 0.06, 0.1, 0x3a8a5a, 'petal');
      for (let k = 0; k < 4; k++) mk.box(ex - 0.28, 0.05 + k * 0.08, -0.62, 0.1, 0.08, 0.1, 0xf4f2ee, 'petal', 1.05);
      mk.tag = 0;
      break;
    }
    case 'ground': {
      // A plastic sheet on the ground (blue, or a rice sack cut open), the goods on it; she squats behind.
      const sheet = tone([0x3a6aa8, 0xe8e4d8, 0x3a8a6a], mk.r(i, 22));
      mk.tag = open;
      mk.span(-w / 2 + 0.1, 0, -0.35, w / 2 - 0.1, 0.025, front - 0.05, sheet, 'petal', 0.95);
      goods(mk, s.goods, { x0: -w / 2 + 0.2, x1: w / 2 - 0.2, z0: -0.25, z1: front - 0.15, y: 0.025 });
      if (s.cover === 'umbrella') {
        const col = UMBRELLAS[i % UMBRELLAS.length];
        parasol(mk, -0.6, -0.55, 2.2, 1.25, [col, darker(col, 0.86)], open, 0, 0.1 * i);
      } else {
        // (no umbrella under the tree: the baskets she brought the fish in and her shoulder pole lying by her)
        basket(mk, w / 2 + 0.2, 0, -0.3, 0.46, 0.46, 0.34);
        basket(mk, w / 2 + 0.2, 0, 0.3, 0.46, 0.46, 0.34);
        mk.rod(w / 2 + 0.45, 0.05, -0.9, w / 2 - 0.1, 0.05, 0.9, 0.06, 0.06, tone(BAMBOO, 0.6), 'petal');
      }
      mk.tag = 0;
      break;
    }
    case 'krok': {
      // Her mat; the clay stove and the round griddle of num krok; trays of cakes; the umbrella; the evening lamp.
      // (all of it goes home with her in her baskets: soft, toggled)
      mk.tag = open;
      groundMat(mk, 0, -0.1, w - 0.2, d - 0.3, 0xd8c088, 0xb89a62);
      const gx = 0.15;
      const gz = 0.2;
      const c = tone(CLAY, mk.r(i, 5));
      mk.box(gx, 0.15, gz, 0.46, 0.3, 0.46, c, 'petal', 0.92);
      mk.box(gx, 0.15, gz, 0.46, 0.3, 0.46, c, 'petal', 0.92, 0, Math.PI / 4);
      mk.box(gx, 0.1, gz + 0.23, 0.18, 0.12, 0.04, 0x1e1814, 'petal', 0.8);
      lampAt(mk, out, gx, 0.1, gz + 0.25, 0.11, EMBER, 0.55, 'fire', s.id);
      // (the griddle: a round cast-iron pan, its cups in a ring round one in the middle)
      mk.box(gx, 0.33, gz, 0.58, 0.06, 0.58, IRON, 'petal', 1);
      mk.box(gx, 0.33, gz, 0.58, 0.06, 0.58, IRON, 'petal', 1, 0, Math.PI / 4);
      for (let k = 0; k < 7; k++) {
        const a = (k / 6) * Math.PI * 2;
        const rr = k === 6 ? 0 : 0.17;
        mk.box(gx + Math.sin(a) * rr, 0.365, gz + Math.cos(a) * rr, 0.09, 0.02, 0.09, k % 3 === 0 ? 0xe8c070 : 0xf4ecd0, 'petal', 1.05);
      }
      // (the little lid set aside, a bowl of batter, a tray of num krok in pairs on banana leaf)
      mk.box(gx + 0.45, 0.05, gz - 0.25, 0.3, 0.06, 0.3, IRON, 'petal', 0.9);
      mk.box(gx - 0.45, 0.07, gz - 0.3, 0.24, 0.12, 0.24, 0xe8e4d8, 'petal', 1);
      mk.box(gx - 0.45, 0.13, gz - 0.3, 0.2, 0.02, 0.2, 0xf4ecd0, 'petal', 1.05);
      const [tx, tz] = [-0.6, 0.35];
      mk.box(tx, 0.04, tz, 0.56, 0.05, 0.56, tone([0xc8a868, 0xb89458], mk.r(i, 6)), 'petal', 0.95);
      mk.box(tx, 0.07, tz, 0.48, 0.02, 0.48, 0x5a9a3a, 'petal', 0.9);
      for (let k = 0; k < 6; k++) mk.box(tx - 0.15 + (k % 3) * 0.15, 0.1, tz - 0.08 + Math.floor(k / 3) * 0.16, 0.12, 0.05, 0.08, k % 2 ? 0xe8c070 : 0xf0e6c8, 'petal', 1.05);
      // Round bamboo trays: num ansom (sticky rice and banana rolled in banana leaf, tied), num kom (little green pyramids).
      const tray = (x: number, z: number) => {
        mk.box(x, 0.05, z, 0.52, 0.06, 0.52, tone([0xc8a868, 0xb89458], mk.r(x, 7)), 'petal', 0.95);
        mk.box(x, 0.05, z, 0.52, 0.06, 0.52, tone([0xc8a868, 0xb89458], mk.r(z, 8)), 'petal', 0.95, 0, Math.PI / 4);
      };
      tray(0.85, 0.25);
      for (let k = 0; k < 5; k++) {
        mk.box(0.85 - 0.16 + (k % 3) * 0.16, 0.13 + Math.floor(k / 3) * 0.09, 0.25, 0.1, 0.09, 0.32, tone([0x4a8a34, 0x5a9a3a, 0x3f7a2e], mk.r(k, 9)), 'petal', 1);
        mk.box(0.85 - 0.16 + (k % 3) * 0.16, 0.13 + Math.floor(k / 3) * 0.09, 0.25, 0.11, 0.1, 0.03, 0xd8c890, 'petal');
      }
      tray(0.85, -0.35);
      for (let k = 0; k < 6; k++) mk.box(0.85 - 0.14 + (k % 3) * 0.14, 0.14, -0.35 - 0.08 + Math.floor(k / 3) * 0.16, 0.11, 0.12, 0.11, 0x4a8a34, 'petal', 1, 0, Math.PI / 4);
      const col = UMBRELLAS[0];
      parasol(mk, -0.75, -0.55, 2.15, 1.25, [col, darker(col, 0.86)], open, 0, 0.4);
      // Her battery lamp on a bamboo stick (lit in the evening; soft: it goes home with her).
      mk.box(-1.05, 0.75, 0.55, 0.05, 1.5, 0.05, tone(BAMBOO, mk.r(i, 9)), 'petal', 0.95);
      mk.box(-1.05, 1.42, 0.62, 0.1, 0.08, 0.1, 0xe8e8e2, 'petal', 1);
      mk.tag = 0;
      lampAt(mk, out, -1.05, 1.34, 0.62, 0.09, BULB, 1.9, 'evening', s.id);
      out.steam.push({ x: mk.wx(gx, gz), y: mk.ground + 0.42, z: mk.wz(gx, gz), stall: s.id });
      break;
    }
  }
  mk.tag = 0;
}

/** The breakfast stall's low table in front of it, plastic stools round it; bowls, a jug of iced tea, herbs on it while it is open. */
function breakfastTable(mk: MkBuild, field: HeightField, i: number, out: BmBuilt): void {
  mk.src = traceSource();
  const t = BREAKFAST_TABLE;
  const x = bmX(t.s, t.t);
  const z = bmZ(t.s, t.t);
  mk.at(x, field.heightAt(x, z), z, bmYaw(t.face), 5301);
  mk.tag = 0;
  for (const [sx, sz] of [
    [-0.45, -0.25],
    [0.45, -0.25],
    [-0.45, 0.25],
    [0.45, 0.25],
  ])
    mk.box(sx, 0.27, sz, 0.05, 0.54, 0.05, 0x8a8e90, 'mapStone');
  mk.span(-0.56, 0.54, -0.34, 0.56, 0.6, 0.34, tone(WOOD, mk.r(1, 1)), 'mapBark', 1);
  BREAKFAST_STOOLS.forEach(([sx, sz], k) => softStool(mk, sx, sz, tone(STOOLS, mk.r(k, 3))));
  mk.tag = openTag(i);
  for (let k = 0; k < 2; k++) {
    const bx = -0.25 + k * 0.5;
    mk.box(bx, 0.65, k ? 0.1 : -0.1, 0.2, 0.1, 0.2, 0xf0f0ea, 'petal', 1.05);
    mk.box(bx, 0.7, k ? 0.1 : -0.1, 0.16, 0.02, 0.16, 0xc8c070, 'petal', 1);
  }
  mk.box(0.05, 0.72, 0.2, 0.13, 0.24, 0.13, 0xc88a3a, 'petal', 1.05);
  mk.box(-0.05, 0.68, -0.22, 0.07, 0.16, 0.07, 0xd8c890, 'petal');
  mk.box(0.3, 0.62, 0.22, 0.26, 0.04, 0.18, 0x5aa040, 'petal');
  mk.tag = 0;
  out.covers.push([x - 1.6, z - 1.6, x + 1.6, z + 1.6]);
}

/**
 * The big old tree across the trail from the lane's foot (a tamarind, as
 * old as the hamlet): a fluted trunk leaning a little, roots spreading, four
 * limbs, a broad flat crown of leaf blocks, hollow inside, ragged at its
 * rim; a bamboo kre (a slatted bed on legs) in its shade to sit and rest on.
 */
function bigTree(mk: MkBuild, field: HeightField, out: BmBuilt): void {
  mk.src = traceSource();
  const T = BM_TREE;
  const gx = bmX(T.s, T.t);
  const gz = bmZ(T.s, T.t);
  mk.at(gx, field.heightAt(gx, gz), gz, 0.3, 5401);
  mk.tag = 0;
  const bark = [0x5a4636, 0x4e3c2e, 0x645040, 0x574332];
  for (let j = 0; j < 5; j++) {
    const ox = Math.sin(j * 0.9) * 0.14;
    const oz = Math.cos(j * 1.3) * 0.12;
    const wd = 1.3 - j * 0.08;
    mk.box(ox, j * 0.92 + 0.46, oz, wd, 0.94, wd, tone(bark, mk.r(j, 1)), 'mapBark');
    mk.box(ox + wd * 0.5, j * 0.92 + 0.46, oz + 0.1, 0.26, 0.92, wd * 0.5, tone(bark, mk.r(j, 5)), 'mapBark', 0.9);
    mk.box(ox - 0.1, j * 0.92 + 0.46, oz - wd * 0.5, wd * 0.55, 0.92, 0.26, tone(bark, mk.r(j, 6)), 'mapBark', 0.92);
  }
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.4;
    mk.box(Math.sin(a) * 0.85, 0.16, Math.cos(a) * 0.85, 0.6, 0.32, 0.55, tone(bark, mk.r(k, 2)), 'mapBark', 0.9, 0, a);
  }
  const limbs: [number, number, number][] = [
    [1, 0.35, 6.1],
    [-0.95, 0.6, 6.4],
    [0.25, -1, 6.8],
    [-0.45, -0.75, 5.9],
  ];
  for (const [dx, dz, h] of limbs) {
    mk.rod(0, 4.4, 0, dx * 2.4, h, dz * 2.4, 0.6, 0.6, tone(bark, mk.r(dx, dz, 3)), 'mapBark');
    mk.rod(dx * 2.4, h, dz * 2.4, dx * 3.8, h + 0.8, dz * 3.8, 0.42, 0.42, tone(bark, mk.r(dz, dx, 4)), 'mapBark');
  }
  // The crown: a broad, flat umbrella (a tamarind's, its fine leaves a fresher green than the jungle's behind), hollow
  // inside, ragged at the rim, a few gaps; a little higher on the trail's side, where the limbs reach up.
  const R = T.r;
  const cy = T.h;
  const leaf = [0x4e7e2e, 0x5a8a34, 0x467428, 0x64963a, 0x3f6a24, 0x6ea040];
  const n = Math.ceil(R);
  for (let i = -n; i <= n; i++)
    for (let j = -2; j <= 3; j++)
      for (let k = -n; k <= n; k++) {
        const dy = j * 0.8;
        const d = Math.hypot(i / R, dy / 2.1, k / R) + (mk.r(i, j, k) - 0.5) * 0.28;
        if (d > 1 || (d < 0.66 && j < 2)) continue;
        if (mk.r(k, i, j + 9) < 0.08) continue;
        const shade = 0.8 + 0.3 * ((j + 2) / 5);
        mk.box(i * 0.97, cy + dy, k * 0.97, 1, 0.85, 1, tone(leaf, mk.r(k, i, j + 3)), 'mapLeaf', shade);
      }
  // A bamboo kre in its shade, on the far side from the trail (old people sit and talk on it).
  const kx = bmX(T.s + 3.2, T.t - 1.4);
  const kz = bmZ(T.s + 3.2, T.t - 1.4);
  mk.at(kx, field.heightAt(kx, kz), kz, bmYaw(Math.PI / 2), 5402);
  for (const [sx, sz] of [
    [-0.95, -0.6],
    [0.95, -0.6],
    [-0.95, 0.6],
    [0.95, 0.6],
  ])
    mk.box(sx, 0.24, sz, 0.1, 0.48, 0.1, tone(BAMBOO, 0.2), 'mapBark');
  for (let k = 0; k < 6; k++) mk.box(0, 0.5, -0.62 + k * 0.25, 2.1, 0.06, 0.2, tone(BAMBOO, mk.r(k, 7)), 'mapBark', 0.95 + mk.r(k, 8) * 0.08);
  mk.box(-0.3, 0.545, 0, 1.2, 0.03, 1.0, 0x3a7a5a, 'petal');
  mk.box(-0.3, 0.56, 0.2, 1.2, 0.02, 0.12, 0xb8423a, 'petal');
  const r = T.r * 0.35;
  out.covers.push([gx - r, gz - r, gx + r, gz + r], [kx - 1.4, kz - 1.4, kx + 1.4, kz + 1.4]);
}

/** Bicycles and a moto parked by the lane's foot (the busy ones only while the market is busy). */
function parked(mk: MkBuild, field: HeightField, out: BmBuilt): void {
  mk.src = traceSource();
  BM_PARKED.forEach((p, n) => {
    const gx = bmX(p.s, p.t);
    const gz = bmZ(p.s, p.t);
    mk.at(gx, field.heightAt(gx, gz), gz, bmYaw(p.face), 5501 + n);
    mk.tag = p.busy ? BUSY_TAG : 0;
    // (the ones there only while it is busy come and go: soft)
    const mat = p.busy ? 'petal' : 'mapStone';
    if (p.kind === 'moto') {
      // A step-through moto (a Honda Dream): wheels, the body, the seat, the handlebars, a basket at the front.
      // (the kit's wheels are `metal`: the hamlet draws that as stone, _backHamlet.ts)
      for (const z of [-0.62, 0.62]) wheel(mk, 0, 0.3, z, 0.3, 0.1, 0x1e1e1e, p.busy ? 'petal' : 'metal');
      mk.box(0, 0.55, 0.05, 0.3, 0.3, 1.0, p.color, mat, 1);
      mk.box(0, 0.78, -0.25, 0.3, 0.14, 0.62, 0x2a2622, mat, 0.9);
      mk.box(0, 0.8, 0.5, 0.26, 0.44, 0.22, p.color, mat, 1.05);
      mk.box(0, 1.05, 0.55, 0.7, 0.06, 0.08, 0x3a3a3a, mat);
      mk.box(0, 0.98, 0.75, 0.34, 0.24, 0.26, 0x6a6a68, mat, 0.9);
    } else {
      // An old bicycle with a rack and a basket.
      for (const z of [-0.55, 0.55]) {
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          mk.box(0, 0.36 + Math.cos(a) * 0.33, z + Math.sin(a) * 0.33, 0.04, 0.05, 0.27, 0x2a2a2a, mat, 1, a);
        }
      }
      mk.rod(0, 0.36, -0.55, 0, 0.8, -0.05, 0.05, 0.05, p.color, mat);
      mk.rod(0, 0.8, -0.05, 0, 0.36, 0.55, 0.05, 0.05, p.color, mat);
      mk.rod(0, 0.8, -0.2, 0, 0.8, 0.4, 0.05, 0.05, p.color, mat);
      mk.box(0, 0.86, -0.25, 0.14, 0.05, 0.24, 0x2a2622, mat);
      mk.box(0, 1.0, 0.45, 0.6, 0.04, 0.05, 0x3a3a3a, mat);
      mk.box(0, 0.78, 0.7, 0.34, 0.24, 0.3, 0xc8a868, mat, 0.95);
    }
    out.covers.push([gx - 1.2, gz - 1.2, gx + 1.2, gz + 1.2]);
  });
  mk.tag = 0;
}

/** Banana leaves and a lost flip-flop dropped on the ground while it is busy; a stack of empty baskets and a sack by the tree (they stay). */
function dropped(mk: MkBuild, field: HeightField): void {
  mk.src = traceSource();
  const put = (s: number, t: number, yaw: number, seed: number) => {
    const x = bmX(s, t);
    const z = bmZ(s, t);
    mk.at(x, field.heightAt(x, z), z, yaw, seed);
  };
  mk.tag = BUSY_TAG;
  const leaves: [number, number][] = [
    [-4.4, -2.6],
    [0.2, 2.7],
    [3.4, -2.8],
    [-9.6, 2.8],
    [7.8, -2.6],
  ];
  leaves.forEach(([s, t], k) => {
    put(s, t, hash3(k, 3, 5, 5601) * 3, 5610 + k);
    mk.box(0, 0.02, 0, 0.5, 0.03, 0.9, tone([0x5a8a3a, 0x7a8a40, 0x8a7a48], mk.r(k, 3)), 'petal', 0.9);
  });
  mk.tag = 0;
  put(-0.8, -8.2, 0.4, 5620);
  for (let k = 0; k < 3; k++) mk.box(0, 0.16 + k * 0.26, 0, 0.62 - k * 0.04, 0.3, 0.62 - k * 0.04, tone([0xc8a868, 0xb89458, 0xd2b474], mk.r(k, 1)), 'petal', 0.92);
  mk.box(0.75, 0.3, 0.2, 0.44, 0.6, 0.4, 0xeae6da, 'petal');
  heap(mk, 0.75, 0.6, 0.2, 0.12, 0.1, 0.08, [0xf4f0e6, 0xf8f4ea], 1, 3);
}

/** Worn earth: the grass where the sellers sit and people stand trodden bare (thin patches, a little inset so the land's cells still show). */
function worn(mk: MkBuild, field: HeightField): void {
  mk.src = traceSource();
  mk.at(0, 0, 0, 0, 5701);
  mk.tag = 0;
  const earth = [0x8e6c48, 0x86653f, 0x957451, 0x7f6a48, 0x8b774f];
  const dry = [0x8ba445, 0x85a042, 0x92aa4a];
  // (how far a point is from where people stand: the stalls and their fronts, the tree's foot, the breakfast table; m)
  const spots = BM_STALLS.map((s) => {
    const f = frontXZ(s);
    const c = stallFrame(s);
    return { x: (f.x + c.x) / 2, z: (f.z + c.z) / 2, r: Math.max(s.w, s.d) * 0.45 };
  });
  spots.push({ x: bmX(BM_TREE.s, BM_TREE.t), z: bmZ(BM_TREE.s, BM_TREE.t), r: 1.6 });
  spots.push({ x: bmX(BREAKFAST_TABLE.s, BREAKFAST_TABLE.t), z: bmZ(BREAKFAST_TABLE.s, BREAKFAST_TABLE.t), r: 1.2 });
  const c = field.cell;
  const seen = new Set<number>();
  for (let s = -14; s <= 12; s += c * 0.5)
    for (let t = -12; t <= 10; t += c * 0.5) {
      const x = bmX(s, t);
      const z = bmZ(s, t);
      const cx = Math.floor(x / c) * c + c / 2;
      const cz = Math.floor(z / c) * c + c / 2;
      if (field.surfaceAt(cx, cz) !== SURFACE.grass || field.waterAt(cx, cz) !== null) continue;
      let d = Infinity;
      for (const p of spots) d = Math.min(d, Math.hypot(cx - p.x, cz - p.z) - p.r);
      const r = hash3(Math.round(cx * 2), Math.round(cz * 2), 7, 5702);
      if (d > 0.6 || (d > 0 && r < d / 0.6)) continue;
      if (seen.has(cx * 10000 + cz)) continue;
      seen.add(cx * 10000 + cz);
      const bare = r > 0.35;
      mk.box(cx, field.heightAt(cx, cz) + 0.02, cz, c - 0.12, 0.05, c - 0.12, bare ? tone(earth, hash3(Math.round(cx), Math.round(cz), 8, 5703)) : tone(dry, r * 5), 'mapBark', 0.96 + r * 0.08);
    }
}

/**
 * The explorer's own spot at a stall, from where the market's buyers stand
 * (`frontXZ`): `out` m further back from the goods and `along` m to the
 * stall's +x, so its counter, tarp poles and sign clear his broader body
 * (0.42 m round in the walk map's 0.5 m columns).
 */
const BUYER_ROOM: Partial<Record<BmStall['kind'], { out: number; along: number }>> = {
  breakfast: { out: 0.35, along: 0.7 },
  table: { out: 0.3, along: 0 },
};

/**
 * Register the market's shops and the coconut cart's (shop.ts): the buyer's
 * spot in front of each stall, open while its seller is there (the market's
 * sellers stay under their tarps and umbrellas in the rain; the juice seller
 * goes home in a storm).
 */
export function registerBackShops(field: HeightField): void {
  for (const s of BM_STALLS) {
    if (!s.sells) continue;
    const f = frontXZ(s);
    const room = BUYER_ROOM[s.kind];
    if (room) {
      // (back, away from the goods: the way he faces, turned round; along: the stall's +x)
      const yaw = stallFrame(s).yaw;
      f.x += Math.sin(yaw) * room.out + Math.cos(yaw) * room.along;
      f.z += Math.cos(yaw) * room.out - Math.sin(yaw) * room.along;
    }
    registerShop({
      id: `back-${s.id}`,
      name: s.sells.name,
      x: f.x,
      y: field.heightAt(f.x, f.z),
      z: f.z,
      r: s.kind === 'breakfast' ? 2.0 : 1.5,
      facing: f.yaw,
      items: s.sells.items,
      open: (fr: MapFrame) => stallOpen(s, fr.clock),
    });
  }
  // The coconut cart: its buyer stands in front of the counter's east end, facing it (the seller is behind it): clear
  // of its sign over the counter, the low table and the stools in front.
  const [cx, cz] = salaToWorld(CART.lx + 0.95, CART.lz + 1.2);
  registerShop({
    id: 'back-coconut',
    name: CART_SHOP.name,
    x: cx,
    y: field.heightAt(cx, cz),
    z: cz,
    r: 1.6,
    facing: SALA.facing + Math.PI,
    items: CART_SHOP.items,
    open: (fr) => cartOpen(fr, eventsNow(fr).shelter),
  });
}
