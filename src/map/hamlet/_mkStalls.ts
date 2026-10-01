import { traceSource } from '../../feedback/sourceTrace';
import type { HeightField } from '../heightfield';
import { cloth, garments, goods, hang, heap, jar } from './_mkGoods';
import { bambooPole, BAMBOO, groundMat, MkBuild, PARASOLS, parasol, platform, POST, RUST, STOOLS, stool, table, TARPS, tarp, tone, wheel, WOOD } from './_mkKit';
import { EDGES, HALL, MK, NODES, NOODLE_BULB, PARKED, SHRINE, SIGN, STALLS, STOOL_AT, TABLE_BULB, TABLES, TREE, stallPoint, type Stall } from './_mkPlan';
import { SURFACE } from '../heightfield';
import { hash3 } from '../../voxel/random';
import type { ShrineLights } from '../jungle/_incense';
import { MARKET_WORD, NOODLE_WORD, signLetters, wordSize } from './_mkSign';

/**
 * The market's blocks, stall by stall (hamlet/_market.ts puts them in one
 * voxel mesh per family): every stall's frame, its table, platform, mat or
 * rack, its tarp or parasol, its goods (`_mkGoods.ts`); the covered hall and
 * its platforms, the sign arch, the big shade tree, the noodle stall's low
 * tables and stools, the grill, the sugarcane cart, the motos and bicycles
 * parked, crates and baskets round the edges. Also where the lamps, the
 * steam and the smoke are (for `_mkLights.ts`, `_mkSteam.ts`).
 *
 * Toggles (the boxes that come and go with the time of day): stall `i`'s
 * goods and spread tarp or open parasol are toggle `openTag(i)`, its rolled
 * tarp and folded parasol `closedTag(i)`; the motos and bicycles parked
 * only while the market is busy `PARKING_TAG`.
 */

export const openTag = (i: number): number => 1 + i * 2;
export const closedTag = (i: number): number => 2 + i * 2;
export const PARKING_TAG = 1 + STALLS.length * 2;

/** A light of the market (map m): a glowing block, its halo (m), and when it is lit. */
export interface Lamp {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  color: number;
  halo: number;
  /** `dawn`: the sellers' lamps before sunrise; `noodle`: the noodle stall's bulb and string (while it is open, dusk to dawn); `grill`: its embers. */
  on: 'dawn' | 'noodle' | 'grill';
}

/** A steaming pot or the grill's smoke (map m), and the stall it belongs to. */
export interface Puff {
  x: number;
  y: number;
  z: number;
  stall: string;
}

export interface Stalls {
  lamps: Lamp[];
  steam: Puff[];
  smoke: Puff[];
  /** The neak ta shrine's candles, incense and its thread of smoke (jungle/_incense.ts draws them). */
  shrine: ShrineLights;
  /** Map rectangles built on (trees keep off). */
  covers: [number, number, number, number][];
}

/** Lamp colours (sRGB): a bare bulb, a string of small bulbs, an LED tube, embers. */
const BULB = 0xffc070;
const STRING = [0xffd890, 0xff9a70, 0xffe0a0, 0x9ad0ff, 0xffb0d0];
const TUBE = 0xdcf0ff;
const EMBER = 0xff5a1c;
/** Ground sellers' umbrellas. */
const UMBRELLAS = [0xe07a2a, 0x7a4a9a, 0x3a9a6a, 0xd84a6a, 0x3a7ac0, 0xe0b030];
/** A colour a bit darker (k < 1). */
function shade(hex: number, k: number): number {
  const c = (s: number) => Math.max(0, Math.min(255, Math.round(((hex >> s) & 255) * k)));
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

export function buildStalls(field: HeightField, mk: MkBuild): Stalls {
  const out: Stalls = { lamps: [], steam: [], smoke: [], covers: [], shrine: { candles: [], cores: [], tips: [], smoke: [], halos: [] } };
  const y0 = field.heightAt(MK.x, MK.z);
  const lamp = (lx: number, ly: number, lz: number, s: number, color: number, halo: number, on: Lamp['on']) =>
    out.lamps.push({ x: mk.wx(lx, lz), y: mk.ground + ly, z: mk.wz(lx, lz), sx: s, sy: s * 1.3, sz: s, color, halo, on });
  STALLS.forEach((s, i) => {
    const gx = MK.x + s.x;
    const gz = MK.z + s.z;
    mk.at(gx, s.kind === 'hall' ? y0 : field.heightAt(gx, gz), gz, s.yaw, 3001 + i * 17);
    stall(mk, s, i, out, lamp);
    const r = Math.max(s.w, s.d) / 2 + 1.5;
    out.covers.push([gx - r, gz - r, gx + r, gz + r]);
  });
  hall(mk, y0, out, lamp);
  sign(mk, field);
  tree(mk, field);
  neakTa(mk, field, out.shrine);
  noodleTables(mk, field);
  parking(mk, field);
  edges(mk, field);
  worn(mk, field);
  return out;
}

type LampFn = (lx: number, ly: number, lz: number, s: number, color: number, halo: number, on: Lamp['on']) => void;

/** One stall in its frame: structure, cover, goods (toggled), what hangs. */
function stall(mk: MkBuild, s: Stall, i: number, out: Stalls, lamp: LampFn): void {
  mk.src = traceSource();
  const open = openTag(i);
  const closed = closedTag(i);
  const { w, d } = s;
  const front = d / 2;
  mk.tag = 0;
  const cover = () => {
    if (s.cover === 'none') return;
    if (s.cover === 'umbrella') {
      // A ground seller's umbrella: small, round, one bright colour, leaning a little over her.
      const col = tone(UMBRELLAS, mk.r(i, 21));
      parasol(mk, -0.55, -0.5, 2.25, 1.3, [col, shade(col, 0.86)], open, 0, 0.1 * i);
      return;
    }
    if (s.cover.startsWith('tarp')) tarp(mk, w, d, 3.15, 2.85, TARPS[s.cover as keyof typeof TARPS], open, closed, s.cover === 'tarpStripe');
    else parasol(mk, s.kind === 'mat' ? 0.9 : 0, s.kind === 'mat' ? -0.6 : -0.35, 2.95, 1.95, PARASOLS[s.cover as keyof typeof PARASOLS], open, closed, 0.2 + i);
  };
  const seat = s.seat;
  switch (s.kind) {
    case 'table': {
      const td = 1.1;
      const tz = front - 0.05 - td / 2;
      const tw = w - 0.6;
      table(mk, 0, tz, tw, td, 1.0);
      if (seat.pose === 'stool') stool(mk, seat.x, seat.z, tone(STOOLS, mk.r(i, 1)));
      // Plastic crates under the table (they stay).
      mk.box(-tw / 4, 0.5, tz, 0.5, 0.36, 0.4, tone([0xc83a32, 0x3a6aa8], mk.r(i, 2)), 'mapBark', 0.9);
      cover();
      mk.tag = open;
      goods(mk, s.goods, { x0: -tw / 2 + 0.1, x1: tw / 2 - 0.1, z0: tz - td / 2 + 0.08, z1: tz + td / 2 - 0.08, y: 1.0 });
      mk.tag = 0;
      if (s.goods === 'flowers') {
        // A thin bamboo rail across the table's front for the garlands.
        for (const sx of [-1, 1]) mk.box((sx * tw) / 2, 1.45, tz + td / 2 - 0.05, 0.05, 0.9, 0.05, tone(BAMBOO, mk.r(sx, 3)), 'mapBark');
        mk.rod(-tw / 2, 1.88, tz + td / 2 - 0.05, tw / 2, 1.88, tz + td / 2 - 0.05, 0.05, 0.05, tone(BAMBOO, 0.3), 'mapBark');
        mk.tag = open;
        hang(mk, 'flowers', -tw / 2 + 0.15, tw / 2 - 0.15, tz + td / 2 - 0.05, 1.85);
      } else {
        mk.tag = open;
        hang(mk, s.goods, -w / 2 + 0.2, w / 2 - 0.2, front + 0.35, 3.1);
      }
      break;
    }
    case 'rack': {
      const tz = front - 0.5;
      table(mk, 0, tz, w - 1.2, 0.8, 0.95, false);
      const bx = w / 2 - 0.15;
      const bz = -d / 2 + 0.35;
      for (const sx of [-1, 1]) {
        bambooPole(mk, sx * bx, bz, 2.5);
        bambooPole(mk, sx * bx, front - 0.2, 2.3);
        mk.rod(sx * bx, 2.25, bz, sx * bx, 2.25, front - 0.2, 0.07, 0.07, tone(BAMBOO, mk.r(sx, 4)), 'mapBark');
      }
      mk.rod(-bx, 2.42, bz, bx, 2.42, bz, 0.08, 0.08, tone(BAMBOO, 0.6), 'mapBark');
      cover();
      mk.tag = open;
      goods(mk, s.goods, { x0: -(w - 1.2) / 2 + 0.1, x1: (w - 1.2) / 2 - 0.1, z0: tz - 0.32, z1: tz + 0.32, y: 0.95 });
      cloth(mk, -bx + 0.1, bx - 0.1, bz + 0.05, 2.4, i);
      // (along the sides, facing out: fisherman trousers and linen shirts on hangers — the explorer buys them: roam/_wardrobe.ts)
      for (const sx of [-1, 1]) {
        mk.at(mk.wx(sx * bx, 0), mk.ground, mk.wz(sx * bx, 0), s.yaw + (sx * Math.PI) / 2, mk.seed);
        garments(mk, bz + 0.2, front - 0.4, 0.04, 2.23, sx);
        mk.at(MK.x + s.x, mk.ground, MK.z + s.z, s.yaw, mk.seed);
      }
      break;
    }
    case 'platform': {
      platform(mk, 0, -0.05, w - 0.2, d - 0.3, 0.5);
      cover();
      mk.tag = open;
      goods(mk, s.goods, { x0: -w / 2 + 0.25, x1: w / 2 - 0.25, z0: -0.35, z1: front - 0.3, y: 0.5 });
      hang(mk, s.goods, -w / 2 + 0.2, w / 2 - 0.2, front + 0.35, 3.1);
      // A battery lamp for the dark before dawn, on a pole at the platform's corner.
      mk.tag = 0;
      bambooPole(mk, w / 2 - 0.25, front - 0.25, 2.2, 0.06);
      lamp(w / 2 - 0.25, 2.05, front - 0.1, 0.1, TUBE, 1.6, 'dawn');
      mk.box(w / 2 - 0.25, 2.05, front - 0.1, 0.5, 0.07, 0.07, 0xe8e8e2, 'mapBark');
      break;
    }
    case 'mat': {
      groundMat(mk, 0, 0.35, w - 0.2, d - 0.4, 0xd8c088, 0xb89a62);
      cover();
      mk.tag = open;
      goods(mk, s.goods, { x0: -w / 2 + 0.2, x1: w / 2 - 0.2, z0: -0.45, z1: front - 0.25, y: 0.03 });
      break;
    }
    case 'noodle': {
      // The cart: a table under a little roof on four thin posts, its painted sign "នំបញ្ចុក" on the roof's front; the
      // charcoal stove and the big pot of fish gravy beside it, a steamer.
      table(mk, 0, 0.35, 2.2, 0.9, 1.0);
      for (const [sx, sz] of [
        [-1.05, -0.05],
        [1.05, -0.05],
        [-1.05, 0.75],
        [1.05, 0.75],
      ])
        mk.box(sx, 1.5, sz, 0.05, 1.0, 0.05, 0xb8bcbe, 'metal');
      mk.span(-1.2, 1.98, -0.15, 1.2, 2.04, 0.95, 0x3a6aa8, 'mapBark', 0.95);
      const [nc, nr] = wordSize(NOODLE_WORD);
      const npx = 0.028;
      const nw = nc * npx + 0.18;
      const nh = nr * npx + 0.14;
      mk.span(-nw / 2, 2.04, 0.84, nw / 2, 2.04 + nh, 0.9, 0xf4f0e6, 'mapBark', 1.05);
      mk.span(-nw / 2 - 0.04, 2.04, 0.83, nw / 2 + 0.04, 2.08, 0.91, 0xc83a2a, 'mapBark');
      mk.span(-nw / 2 - 0.04, 2.0 + nh, 0.83, nw / 2 + 0.04, 2.08 + nh, 0.91, 0xc83a2a, 'mapBark');
      signLetters(mk, NOODLE_WORD, 0, 2.04 + nh / 2, 0.9, npx, 1, 0x2a4a8a);
      const [px, pz] = [-1.55, -0.2];
      mk.box(px, 0.28, pz, 0.62, 0.56, 0.62, 0x8a5a3a, 'mapBark', 0.9);
      mk.box(px, 0.28, pz, 0.62, 0.56, 0.62, 0x8a5a3a, 'mapBark', 0.9, 0, Math.PI / 4);
      mk.box(px, 0.8, pz, 0.86, 0.5, 0.86, 0xb4b8ba, 'metal', 1.05);
      mk.box(px, 0.8, pz, 0.86, 0.5, 0.86, 0xb4b8ba, 'metal', 1.05, 0, Math.PI / 4);
      mk.box(px, 1.04, pz, 0.94, 0.05, 0.94, 0xc8ccce, 'metal', 1.1, 0, Math.PI / 8);
      mk.box(px, 1.03, pz, 0.74, 0.03, 0.74, 0xb8b048, 'metal', 0.95, 0, Math.PI / 4);
      out.steam.push({ x: mk.wx(px, pz), y: mk.ground + 1.1, z: mk.wz(px, pz), stall: s.id });
      // The steamer on the cart (noodle soup at night).
      mk.box(0.75, 1.2, 0.2, 0.44, 0.4, 0.44, 0xb4b8ba, 'metal');
      mk.box(0.75, 1.43, 0.2, 0.3, 0.06, 0.3, 0x8a8e90, 'metal');
      out.steam.push({ x: mk.wx(0.75, 0.2), y: mk.ground + 1.5, z: mk.wz(0.75, 0.2), stall: s.id });
      // (its tarp stays up night and day)
      tarp(mk, w, d, 3.1, 2.9, TARPS.tarpBlue, 0, 0, false, false);
      mk.tag = open;
      goods(mk, 'noodles', { x0: -1.0, x1: 1.0, z0: -0.05, z1: 0.75, y: 1.0 });
      mk.tag = 0;
      // The bare bulb over the cart, a string of small bulbs along the tarp's front, to the tree.
      mk.box(NOODLE_BULB.x, 2.95, NOODLE_BULB.z, 0.02, 0.3, 0.02, 0x2a2a2a, 'mapBark');
      lamp(NOODLE_BULB.x, 2.72, NOODLE_BULB.z, 0.13, BULB, 2.4, 'noodle');
      const zf = d / 2 + 0.35;
      for (let k = 0; k < 7; k++) {
        const u = k / 6;
        const lx = -w / 2 + u * w;
        const sag = Math.sin(u * Math.PI) * 0.18;
        lamp(lx, 3.0 - sag, zf, 0.075, STRING[k % STRING.length], 0.55, 'noodle');
      }
      // (on to the shade tree: the string's far end is tied to a low limb)
      const tx = MK.x + TREE.x;
      const tz = MK.z + TREE.z;
      const [ax, az] = [mk.wx(w / 2 + 0.15, zf), mk.wz(w / 2 + 0.15, zf)];
      for (let k = 1; k <= 6; k++) {
        const u = k / 7;
        const sag = Math.sin(u * Math.PI) * 0.4;
        out.lamps.push({ x: ax + (tx - ax) * u, y: mk.ground + 3.05 + u * 0.6 - sag, z: az + (tz - az) * u, sx: 0.075, sy: 0.1, sz: 0.075, color: STRING[(k + 2) % STRING.length], halo: 0.55, on: 'noodle' });
      }
      // A bare bulb on a wire from the tree's low limb, over the tables.
      const wx = MK.x + TABLE_BULB.x;
      const wz = MK.z + TABLE_BULB.z;
      out.lamps.push({ x: wx, y: mk.ground + TABLE_BULB.y, z: wz, sx: 0.13, sy: 0.17, sz: 0.13, color: BULB, halo: 2.4, on: 'noodle' });
      mk.at(wx, mk.ground, wz, 0, mk.seed);
      mk.box(0, TABLE_BULB.y + 0.6, 0, 0.02, 1.05, 0.02, 0x2a2a2a, 'mapBark');
      mk.box(0, TABLE_BULB.y + 0.12, 0, 0.1, 0.06, 0.1, 0x3a3a3a, 'mapBark');
      mk.rod(0, TABLE_BULB.y + 1.12, 0, TREE.x - TABLE_BULB.x, 4.6, TREE.z - TABLE_BULB.z, 0.13, 0.13, 0x574332, 'mapBark');
      break;
    }
    case 'grill': {
      // The charcoal grill: a steel trough on legs, embers under the grid; a side table with raw skewers; a bucket of charcoal.
      for (const [sx, sz] of [
        [-0.65, 0.15],
        [0.65, 0.15],
        [-0.65, 0.55],
        [0.65, 0.55],
      ])
        mk.box(sx, 0.4, sz, 0.06, 0.8, 0.06, 0x3a3a38, 'metal');
      mk.span(-0.75, 0.72, 0.1, 0.75, 0.92, 0.6, 0x4a4a48, 'metal', 0.95);
      mk.span(-0.7, 0.92, 0.14, 0.7, 0.94, 0.56, 0x6a2a1a, 'metal', 0.8);
      lamp(0, 0.93, 0.35, 0.12, EMBER, 1.2, 'grill');
      out.smoke.push({ x: mk.wx(0, 0.35), y: mk.ground + 1.1, z: mk.wz(0, 0.35), stall: s.id });
      table(mk, 1.25, -0.2, 0.7, 0.6, 0.9, false);
      mk.box(-1.05, 0.2, -0.4, 0.34, 0.4, 0.34, 0x3a3a3a, 'metal', 0.9);
      cover();
      mk.tag = open;
      goods(mk, 'grill', { x0: -0.7, x1: 0.7, z0: 0.14, z1: 0.56, y: 0.92 });
      heap(mk, 1.25, 0.9, -0.2, 0.25, 0.2, 0.08, [0x8a4a2a, 0xa05a30], 1, 7);
      break;
    }
    case 'drinks': {
      // The sugarcane cart: a painted body on two wheels, the press on top (steel rollers, a big hand wheel), stalks of cane leaning on it.
      mk.span(-0.8, 0.45, -0.1, 0.8, 1.0, 0.6, 0x3a6aa8, 'metal', 1);
      mk.span(-0.85, 1.0, -0.15, 0.85, 1.05, 0.65, 0xe8e8e2, 'metal', 1.05);
      for (const sx of [-0.62, 0.62]) wheel(mk, sx, 0.3, 0.25, 0.3, 0.08, 0x2a2a2a, 'metal');
      mk.span(-0.3, 1.05, 0.05, 0.3, 1.5, 0.45, 0xb0b4b6, 'metal', 1.05);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        mk.box(0.42, 1.28 + Math.cos(a) * 0.34, 0.25 + Math.sin(a) * 0.34, 0.05, 0.08, 0.28, 0x3a8a5a, 'metal', 1, a);
      }
      mk.box(0.42, 1.28, 0.25, 0.08, 0.1, 0.1, 0x3a3a3a, 'metal');
      // A cooler box (they stay) and the stool.
      mk.span(-1.3, 0, -0.9, -0.7, 0.45, -0.45, 0xf0eee8, 'metal', 1);
      mk.span(-1.32, 0.45, -0.92, -0.68, 0.5, -0.43, 0xc83a30, 'metal', 1);
      cover();
      mk.tag = open;
      for (let k = 0; k < 7; k++) {
        const x = -0.75 + k * 0.08;
        mk.rod(x, 0.02, 0.9, x + 0.05, 2.35, 0.66 + k * 0.01, 0.07, 0.07, tone([0xb8c070, 0xa8b060, 0x7a5a6a], mk.r(k, 9)), 'petal');
      }
      goods(mk, 'drinks', { x0: -0.8, x1: 0.8, z0: -0.1, z1: 0.6, y: 1.05 });
      hang(mk, 'drinks', -0.8, 0.8, -0.3, 2.4);
      break;
    }
    case 'ground': {
      // A plastic sheet on the ground (blue, or a rice sack cut open), the goods on it; she squats behind.
      const sheet = tone([0x3a6aa8, 0xe8e4d8, 0x3a8a6a], mk.r(i, 22));
      mk.tag = open;
      mk.span(-w / 2 + 0.1, 0, -0.35, w / 2 - 0.1, 0.025, front - 0.05, sheet, 'petal', 0.95);
      mk.tag = 0;
      cover();
      mk.tag = open;
      goods(mk, s.goods, { x0: -w / 2 + 0.2, x1: w / 2 - 0.2, z0: -0.25, z1: front - 0.15, y: 0.025 });
      break;
    }
    case 'hall': {
      // (the hall's platforms are built with the hall; the stall is its goods)
      mk.tag = open;
      goods(mk, s.goods, { x0: -w / 2 + 0.2, x1: w / 2 - 0.2, z0: -0.2, z1: front - 0.08, y: 0.5 });
      if (s.goods === 'fish') {
        hang(mk, 'fish', -w / 2 + 0.3, w / 2 - 0.3, front - 0.1, 2.3);
        mk.tag = 0;
        lamp(0.8, 2.6, 0.2, 0.1, TUBE, 1.4, 'dawn');
      }
      if (s.goods === 'meat') {
        // A bar of hooks over the block, pieces hanging.
        mk.tag = 0;
        mk.rod(-1.2, 2.25, 0.1, 1.2, 2.25, 0.1, 0.05, 0.05, 0x6a6a68, 'metal');
        mk.tag = open;
        for (let k = 0; k < 3; k++) mk.box(-0.8 + k * 0.6, 1.9, 0.1, 0.24, 0.5, 0.14, [0xd88a80, 0xc8706a, 0xe0a090][k], 'petal');
      }
      break;
    }
  }
  mk.tag = 0;
  void out;
  void seat;
}

/** The covered hall: posts on two lines, beams, a long roof of rusty corrugated tin, the platforms under it, bulbs on a wire. */
function hall(mk: MkBuild, y0: number, out: Stalls, lamp: LampFn): void {
  mk.src = traceSource();
  mk.at(MK.x, y0, MK.z, 0, 4001);
  mk.tag = 0;
  const H = HALL;
  const zm = (H.z0 + H.z1) / 2;
  const n = Math.round((H.x1 - H.x0) / H.bay);
  for (let k = 0; k <= n; k++) {
    const x = H.x0 + (k * (H.x1 - H.x0)) / n;
    for (const z of [H.z0, H.z1]) mk.box(x, H.eave / 2, z, 0.24, H.eave, 0.24, tone(POST, mk.r(k, z)), 'mapBark');
    // A king post under the ridge at each end and in the middle.
    if (k === 0 || k === n || k === Math.round(n / 2)) mk.box(x, (H.eave + H.ridge) / 2, zm, 0.2, H.ridge - H.eave, 0.2, tone(POST, mk.r(k, 3)), 'mapBark');
    // A tie beam across.
    mk.box(x, H.eave - 0.1, zm, 0.16, 0.2, H.z1 - H.z0 + 0.3, tone(POST, mk.r(k, 4)), 'mapBark', 0.9);
  }
  // Plates along the post tops and the ridge beam.
  for (const z of [H.z0, H.z1]) mk.span(H.x0 - 0.2, H.eave - 0.02, z - 0.13, H.x1 + 0.2, H.eave + 0.14, z + 0.13, tone(POST, mk.r(z, 5)), 'mapBark', 0.9);
  mk.span(H.x0 - 0.3, H.ridge - 0.14, zm - 0.1, H.x1 + 0.3, H.ridge + 0.02, zm + 0.1, tone(POST, 0.5), 'mapBark', 0.9);
  // The roof: sheets of corrugated tin down each slope, each its own tone (rust, patches of old grey), ribs along them.
  const xa = H.x0 - H.overEnd;
  const xb = H.x1 + H.overEnd;
  const sheets = Math.round((xb - xa) / 0.86);
  for (const side of [-1, 1]) {
    const zEave = side < 0 ? H.z0 - H.over : H.z1 + H.over;
    const eaveY = H.eave - (H.over * (H.ridge - H.eave)) / ((H.z1 - H.z0) / 2) + 0.12;
    for (let k = 0; k < sheets; k++) {
      const x0 = xa + ((xb - xa) * k) / sheets;
      const x1 = xa + ((xb - xa) * (k + 1)) / sheets;
      const cx = (x0 + x1) / 2;
      const c = tone(RUST, mk.r(k, side, 6));
      const lift = (k % 2) * 0.015;
      mk.rod(cx, eaveY + lift, zEave, cx, H.ridge + 0.14 + lift, zm, x1 - x0 + 0.04, 0.05, c, 'metal', 0.94 + mk.r(k, side, 7) * 0.1);
      mk.rod(cx - (x1 - x0) * 0.25, eaveY + lift + 0.04, zEave, cx - (x1 - x0) * 0.25, H.ridge + 0.18 + lift, zm, 0.08, 0.04, c, 'metal', 1.12);
      mk.rod(cx + (x1 - x0) * 0.25, eaveY + lift + 0.04, zEave, cx + (x1 - x0) * 0.25, H.ridge + 0.18 + lift, zm, 0.08, 0.04, c, 'metal', 1.12);
    }
  }
  mk.span(xa - 0.05, H.ridge + 0.12, zm - 0.3, xb + 0.05, H.ridge + 0.3, zm + 0.3, 0x6e3f24, 'metal', 0.95);
  // The platforms: the north row faces the square, the south row faces the aisle.
  platform(mk, (H.x0 + H.x1) / 2 - 0.3, 5.35, H.x1 - H.x0 - 1.0, 1.9, 0.5);
  platform(mk, (H.x0 + H.x1) / 2 - 1.2, 9.65, H.x1 - H.x0 - 2.8, 1.9, 0.5);
  // Bulbs on a wire under the ridge (lit before sunrise).
  mk.rod(H.x0 + 0.5, H.ridge - 0.3, zm, H.x1 - 0.5, H.ridge - 0.3, zm, 0.02, 0.02, 0x2a2a2a, 'mapBark');
  for (let k = 0; k < 3; k++) {
    const x = H.x0 + 2.5 + k * 5;
    mk.box(x, H.ridge - 0.55, zm, 0.02, 0.5, 0.02, 0x2a2a2a, 'mapBark');
    lamp(x, H.ridge - 0.86, zm, 0.12, BULB, 2.2, 'dawn');
  }
  // Reserve goods behind the north row (their backs to the aisle): sacks, baskets; a water jar by a post.
  for (let k = 0; k < 6; k++) {
    const x = H.x0 + 1.2 + k * 2.3 + mk.r(k, 8) * 0.6;
    mk.box(x, 0.5 + 0.3, 6.05, 0.4, 0.6, 0.34, tone([0xeae6da, 0xe0dccc, 0xc8a868], mk.r(k, 9)), 'mapBark', 0.95);
  }
  jar(mk, H.x0 - 0.5, 0, H.z1 - 0.4, 1.2, [0x6b3f26, 0x5e3620]);
  out.covers.push([MK.x + H.x0 - 1.5, MK.z + H.z0 - 1.5, MK.x + H.x1 + 1.5, MK.z + H.z1 + 1.5]);
}

/** The sign arch over the road coming in: two posts, a painted board, "ផ្សារ" in raised letters on both faces, a painted lotus either side. */
function sign(mk: MkBuild, field: HeightField): void {
  mk.src = traceSource();
  const gx = MK.x + SIGN.x;
  const gz = MK.z + SIGN.z;
  mk.at(gx, field.heightAt(gx, gz), gz, 0, 4101);
  mk.tag = 0;
  // (the letters' pixel: the word fills the board's middle, a lotus either side)
  const px = 0.085;
  const [SIGN_COLS, SIGN_ROWS] = wordSize(MARKET_WORD);
  const bw = SIGN.half * 2 - 0.34;
  const bh = SIGN_ROWS * px + 0.42;
  const by = SIGN.board;
  const top = by + bh / 2 + 0.3;
  for (const sx of [-1, 1]) {
    const x = sx * SIGN.half;
    mk.box(x, top / 2, 0, 0.3, top, 0.3, 0xe8e2d4, 'mapBark');
    mk.box(x, 0.25, 0, 0.42, 0.5, 0.42, 0x3a6aa8, 'mapBark');
    mk.box(x, top + 0.08, 0, 0.38, 0.16, 0.38, 0xc83a2a, 'mapBark');
    mk.box(x, top + 0.26, 0, 0.2, 0.2, 0.2, 0xe0b040, 'mapBark');
  }
  // The board: blue, a red border, painted both sides.
  mk.span(-bw / 2, by - bh / 2, -0.07, bw / 2, by + bh / 2, 0.07, 0x2a5a9a, 'mapBark', 1);
  mk.span(-bw / 2 - 0.08, by + bh / 2, -0.09, bw / 2 + 0.08, by + bh / 2 + 0.12, 0.09, 0xc83a2a, 'mapBark');
  mk.span(-bw / 2 - 0.08, by - bh / 2 - 0.12, -0.09, bw / 2 + 0.08, by - bh / 2, 0.09, 0xc83a2a, 'mapBark');
  for (const sx of [-1, 1]) mk.span(sx * (bw / 2) - 0.06, by - bh / 2, -0.09, sx * (bw / 2) + 0.06, by + bh / 2, 0.09, 0xc83a2a, 'mapBark');
  // The letters: pale yellow, a finger proud of each face (read from the road coming in, and going out).
  for (const face of [-1, 1]) signLetters(mk, MARKET_WORD, 0, by, face * 0.09, px, face, 0xf6e7a8);
  for (const sx of [-1, 1])
    for (const face of [-1, 1]) {
      const lx = sx * (SIGN_COLS * px * 0.5 + (bw / 2 - SIGN_COLS * px * 0.5) / 2);
      const z = face * 0.1;
      mk.box(lx, by - 0.18, z, 0.4, 0.22, 0.04, 0xe86a9a, 'mapBark');
      mk.box(lx, by + 0.06, z, 0.16, 0.3, 0.04, 0xf08ab0, 'mapBark');
      mk.box(lx - 0.2, by - 0.02, z, 0.1, 0.2, 0.04, 0xf08ab0, 'mapBark');
      mk.box(lx + 0.2, by - 0.02, z, 0.1, 0.2, 0.04, 0xf08ab0, 'mapBark');
      mk.box(lx, by - 0.4, z, 0.6, 0.06, 0.04, 0x3f8a3a, 'mapBark');
    }
}

/** The big shade tree at the inner corner: a short thick trunk, limbs, a wide low crown with gaps the light comes through. */
function tree(mk: MkBuild, field: HeightField): void {
  mk.src = traceSource();
  const gx = MK.x + TREE.x;
  const gz = MK.z + TREE.z;
  mk.at(gx, field.heightAt(gx, gz), gz, 0, 4201);
  mk.tag = 0;
  const bark = [0x5a4636, 0x4e3c2e, 0x645040, 0x574332];
  // (a trunk that leans and wanders a little, fluted: a core and ribs of bark)
  for (let j = 0; j < 5; j++) {
    const ox = Math.sin(j * 0.9) * 0.12;
    const oz = Math.cos(j * 1.3) * 0.1;
    const wd = 1.15 - j * 0.07;
    mk.box(ox, j * 0.9 + 0.45, oz, wd, 0.92, wd, tone(bark, mk.r(j, 1)), 'mapBark');
    mk.box(ox + wd * 0.5, j * 0.9 + 0.45, oz + 0.1, 0.24, 0.9, wd * 0.5, tone(bark, mk.r(j, 5)), 'mapBark', 0.9);
    mk.box(ox - 0.1, j * 0.9 + 0.45, oz - wd * 0.5, wd * 0.55, 0.9, 0.24, tone(bark, mk.r(j, 6)), 'mapBark', 0.92);
  }
  // Roots spreading at the foot.
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    mk.box(Math.sin(a) * 0.75, 0.15, Math.cos(a) * 0.75, 0.5, 0.3, 0.5, tone(bark, mk.r(k, 2)), 'mapBark', 0.9, 0, a);
  }
  const limbs: [number, number, number][] = [
    [1, 0.3, 5.6],
    [-0.9, 0.6, 5.9],
    [0.2, -1, 6.2],
    [-0.4, -0.7, 5.4],
  ];
  for (const [dx, dz, h] of limbs) {
    mk.rod(0, 4.2, 0, dx * 2.2, h, dz * 2.2, 0.55, 0.55, tone(bark, mk.r(dx, dz, 3)), 'mapBark');
    mk.rod(dx * 2.2, h, dz * 2.2, dx * 3.4, h + 0.7, dz * 3.4, 0.4, 0.4, tone(bark, mk.r(dz, dx, 4)), 'mapBark');
  }
  // The crown: a flattened dome of leaf blocks, hollow inside, ragged at the rim, some gaps.
  const R = TREE.r;
  const cy = 7.2;
  const leaf = [0x3a5e26, 0x456b2c, 0x33541f, 0x4e7432, 0x2e4d1c, 0x547a36];
  for (let i = -6; i <= 6; i++)
    for (let j = -3; j <= 3; j++)
      for (let k = -6; k <= 6; k++) {
        const dy = j * 0.85;
        const d = Math.hypot(i / R, dy / 2.7, k / R) + (mk.r(i, j, k) - 0.5) * 0.3;
        if (d > 1 || (d < 0.62 && j < 2)) continue;
        if (mk.r(k, i, j + 9) < 0.08) continue;
        const shade = 0.78 + 0.32 * ((j + 3) / 6);
        mk.box(i * 0.95, cy + dy, k * 0.95, 1, 0.9, 1, tone(leaf, mk.r(k, i, j + 3)), 'mapLeaf', shade);
      }
}

/**
 * The market's neak ta (អ្នកតា): the guardian spirit of the place, in a
 * humble wooden shrine at the foot of the big tree (a little house with a
 * tiled gable roof on a low plinth; inside, the spirits as small stones
 * wrapped in cloth), incense in a bowl of sand, two candles, bay sei
 * (banana-leaf offerings), marigolds, a bottle; strips of coloured cloth
 * tied round the tree's trunk. Sellers light incense here in the morning.
 */
function neakTa(mk: MkBuild, field: HeightField, lights: ShrineLights): void {
  mk.src = traceSource();
  const gx = MK.x + SHRINE.x;
  const gz = MK.z + SHRINE.z;
  mk.at(gx, field.heightAt(gx, gz), gz, SHRINE.yaw, 4251);
  mk.tag = 0;
  // The plinth: rough plastered brick, a step in front.
  mk.span(-0.55, 0, -0.45, 0.55, 0.55, 0.4, 0xc8bca4, 'mapBark', 0.95);
  mk.span(-0.62, 0.55, -0.5, 0.62, 0.62, 0.46, 0xd8ccb4, 'mapBark', 1);
  mk.span(-0.4, 0, 0.4, 0.4, 0.22, 0.62, 0xbcb09a, 'mapBark', 0.9);
  // The little house: three plank walls, open to the front, a gable roof of red tiles in two steps with a small ridge.
  const wood = 0x7a5a3a;
  mk.span(-0.4, 0.62, -0.36, 0.4, 1.3, -0.3, wood, 'mapBark', 0.9);
  for (const sx of [-1, 1]) mk.span(sx * 0.4 - 0.03, 0.62, -0.36, sx * 0.4 + 0.03, 1.3, 0.22, wood, 'mapBark', 0.85);
  mk.span(-0.5, 1.3, -0.46, 0.5, 1.38, 0.32, 0x9a3a24, 'mapBark');
  mk.span(-0.42, 1.38, -0.38, 0.42, 1.48, 0.24, 0xb04a2c, 'mapBark');
  mk.span(-0.3, 1.48, -0.3, 0.3, 1.56, 0.16, 0xb85a34, 'mapBark');
  // (a plain ridge: no horns at its ends, which would read as a Thai spirit house)
  mk.span(-0.34, 1.56, -0.1, 0.34, 1.62, -0.04, 0x8a3a24, 'mapBark');
  // The spirits: stones wrapped in white, red and yellow cloth; a small red cloth hung over the front.
  const cloth = [0xf2eee4, 0xc8342c, 0xe8b830];
  for (let k = 0; k < 3; k++) {
    mk.box(-0.2 + k * 0.2, 0.74 + (k === 1 ? 0.04 : 0), -0.12, 0.14, 0.24 + (k === 1 ? 0.08 : 0), 0.12, 0x8a8478, 'mapBark');
    mk.box(-0.2 + k * 0.2, 0.72, -0.12, 0.16, 0.1, 0.14, cloth[k], 'petal');
  }
  mk.box(0, 1.25, 0.23, 0.78, 0.1, 0.03, 0xc8342c, 'petal');
  // In front: the incense bowl, two candles, bay sei, marigolds, a bottle of water.
  mk.box(0, 0.68, 0.28, 0.2, 0.12, 0.2, 0xb8a888, 'petal');
  for (let k = 0; k < 3; k++) {
    const x = -0.05 + k * 0.05;
    mk.box(x, 0.84, 0.28, 0.015, 0.26, 0.015, 0xc8302a, 'petal');
    lights.tips.push([mk.wx(x, 0.28), mk.ground + 0.98, mk.wz(x, 0.28)]);
  }
  lights.smoke.push({ at: [mk.wx(0, 0.28), mk.ground + 1.0, mk.wz(0, 0.28)], strength: 0.8 });
  for (const sx of [-1, 1]) {
    mk.box(sx * 0.3, 0.72, 0.3, 0.05, 0.16, 0.05, 0xf4ecd8, 'petal');
    lights.candles.push([mk.wx(sx * 0.3, 0.3), mk.ground + 0.84, mk.wz(sx * 0.3, 0.3)]);
    // Bay sei: a cone of folded banana leaf on a small stand, a white flower at its tip.
    mk.box(sx * 0.46, 0.7, 0.05, 0.14, 0.16, 0.14, 0x4a8a34, 'petal');
    mk.box(sx * 0.46, 0.84, 0.05, 0.09, 0.14, 0.09, 0x5a9a3a, 'petal');
    mk.box(sx * 0.46, 0.94, 0.05, 0.05, 0.06, 0.05, 0xf4f0e6, 'petal');
  }
  lights.halos.push({ at: [mk.wx(0, 0.3), mk.ground + 0.9, mk.wz(0, 0.3)], size: 1.6 });
  mk.box(0.18, 0.66, 0.12, 0.2, 0.08, 0.12, 0xf0a020, 'petal');
  mk.box(-0.2, 0.7, 0.12, 0.06, 0.18, 0.06, 0xd8e8e0, 'petal', 1.1);
  // Cloth tied round the tree: bands of red, yellow and white on the trunk.
  mk.at(MK.x + TREE.x, mk.ground, MK.z + TREE.z, 0, 4252);
  const bands = [0xc8342c, 0xe8b830, 0xf2eee4, 0x3a7ac0];
  for (let k = 0; k < 4; k++) mk.box(Math.sin(k * 0.9) * 0.12, 1.2 + k * 0.16, Math.cos(k * 1.3) * 0.1, 1.24 - k * 0.01, 0.12, 1.24 - k * 0.01, bands[k], 'petal', 1);
  mk.box(0.66, 1.0, 0.1, 0.05, 0.5, 0.14, 0xc8342c, 'petal');
}

/** The noodle stall's low tables under the tree and plastic stools round them; bowls on them while it is open. */
function noodleTables(mk: MkBuild, field: HeightField): void {
  mk.src = traceSource();
  const i = STALLS.findIndex((s) => s.id === 'noodles');
  TABLES.forEach((t, n) => {
    const gx = MK.x + t.x;
    const gz = MK.z + t.z;
    mk.at(gx, field.heightAt(gx, gz), gz, t.yaw, 4301 + n);
    mk.tag = 0;
    // A low steel table with a wooden top.
    for (const [sx, sz] of [
      [-0.5, -0.3],
      [0.5, -0.3],
      [-0.5, 0.3],
      [0.5, 0.3],
    ])
      mk.box(sx, 0.3, sz, 0.05, 0.6, 0.05, 0x8a8e90, 'metal');
    mk.span(-0.62, 0.6, -0.4, 0.62, 0.66, 0.4, tone(WOOD, mk.r(n, 1)), 'mapBark', 1);
    STOOL_AT.forEach(([sx, sz], k) => {
      // (a stool pulled out a little askew)
      stool(mk, sx * 1.02 + (mk.r(n, k) - 0.5) * 0.12, sz * 1.02 + (mk.r(k, n) - 0.5) * 0.12, tone(STOOLS, mk.r(n, k, 2)));
    });
    mk.tag = openTag(i);
    // Bowls, a jug of iced tea, chopsticks in a cup, a tray of herbs.
    for (let k = 0; k < 2 + (n % 2); k++) {
      const bx = -0.35 + k * 0.35;
      mk.box(bx, 0.72, (k % 2 ? 0.14 : -0.14), 0.2, 0.1, 0.2, 0xf0f0ea, 'petal', 1.05);
      mk.box(bx, 0.77, (k % 2 ? 0.14 : -0.14), 0.16, 0.02, 0.16, 0xd8d0a0, 'petal', 1);
    }
    mk.box(0.45, 0.78, 0.18, 0.14, 0.24, 0.14, 0xc88a3a, 'petal', 1.05);
    mk.box(-0.45, 0.74, 0.2, 0.08, 0.16, 0.08, 0xd8c890, 'petal');
    mk.box(0.1, 0.69, 0.25, 0.3, 0.04, 0.2, 0x5aa040, 'petal');
    mk.tag = 0;
  });
}

/** Motos and bicycles parked south of the village street (some only while the market is busy). */
function parking(mk: MkBuild, field: HeightField): void {
  mk.src = traceSource();
  PARKED.forEach((p, n) => {
    const gx = MK.x + p.x;
    const gz = MK.z + p.z;
    mk.at(gx, field.heightAt(gx, gz), gz, p.yaw, 4401 + n);
    // (the ones there only while it is busy come and go: soft, so the walk map never keeps a moto that has left)
    mk.tag = p.always ? 0 : PARKING_TAG;
    const mat = p.always ? 'metal' : 'petal';
    if (p.kind === 'moto') {
      // A step-through moto (a Honda Dream): wheels, the body, the seat, the handlebars, a basket at the front.
      for (const z of [-0.62, 0.62]) wheel(mk, 0, 0.3, z, 0.3, 0.1, 0x1e1e1e, mat);
      mk.box(0, 0.55, 0.05, 0.3, 0.3, 1.0, p.color, mat, 1);
      mk.box(0, 0.78, -0.25, 0.3, 0.14, 0.62, 0x2a2622, mat, 0.9);
      mk.box(0, 0.8, 0.5, 0.26, 0.44, 0.22, p.color, mat, 1.05);
      mk.box(0, 1.05, 0.55, 0.7, 0.06, 0.08, 0x3a3a3a, mat);
      mk.box(0, 0.98, 0.75, 0.34, 0.24, 0.26, 0x6a6a68, mat, 0.9);
      mk.box(0, 0.62, -0.55, 0.3, 0.06, 0.4, 0x3a3a3a, mat);
    } else {
      // An old black bicycle with a rack and a basket.
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
  });
  mk.tag = 0;
}

/** Round the edges: stacks of empty crates, a hand cart, baskets, banana leaves on the ground, a water jar. */
function edges(mk: MkBuild, field: HeightField): void {
  mk.src = traceSource();
  const put = (lx: number, lz: number, yaw: number, seed: number) => {
    const gx = MK.x + lx;
    const gz = MK.z + lz;
    mk.at(gx, field.heightAt(gx, gz), gz, yaw, seed);
  };
  mk.tag = 0;
  // Crates behind the hall.
  put(-9, 12.6, 0.1, 4501);
  for (let k = 0; k < 7; k++) {
    const x = (k % 4) * 0.62 - 1;
    const layer = Math.floor(k / 4);
    mk.box(x + layer * 0.3, 0.2 + layer * 0.4, 0, 0.58, 0.38, 0.44, tone([0xc83a32, 0x3a6aa8, 0xe0a02a, 0x3a9a5a], mk.r(k, 1)), 'mapBark', 0.95);
  }
  // A hand cart (a flat bed on two wheels) by the hall's west end.
  put(-17.4, 4.6, 0.4, 4502);
  mk.span(-0.6, 0.45, -1, 0.6, 0.55, 1, tone(WOOD, 0.4), 'mapBark');
  for (const sx of [-0.66, 0.66]) wheel(mk, sx, 0.35, 0, 0.35, 0.08, 0x2a2622, 'metal');
  mk.rod(-0.4, 0.5, 1, -0.45, 0.9, 2.0, 0.07, 0.07, tone(BAMBOO, 0.5), 'mapBark');
  mk.rod(0.4, 0.5, 1, 0.45, 0.9, 2.0, 0.07, 0.07, tone(BAMBOO, 0.2), 'mapBark');
  // Baskets and a sack by the north row's end, banana leaves dropped on the ground here and there.
  put(-16.6, 1.2, 0, 4503);
  mk.box(0, 0.22, 0, 0.6, 0.44, 0.6, 0xc8a868, 'mapBark', 0.9);
  mk.box(0.7, 0.3, 0.3, 0.44, 0.6, 0.4, 0xeae6da, 'mapBark');
  const leaves: [number, number][] = [
    [-2.2, -2.5],
    [-6.5, 1.2],
    [1.6, -9.5],
    [-3.6, -13],
    [3.2, 3.6],
    [-11, 2.4],
    [8.5, 1.4],
  ];
  leaves.forEach(([lx, lz], k) => {
    put(lx, lz, mk.r(k, 2) * 3, 4510 + k);
    mk.box(0, 0.02, 0, 0.5, 0.03, 0.9, tone([0x5a8a3a, 0x7a8a40, 0x8a7a48], mk.r(k, 3)), 'petal', 0.9);
  });
  // A big glazed water jar and a dipper by the noodle stall.
  put(1.9, -7.4, 0, 4520);
  jar(mk, 0, 0, 0, 1.3, [0x6b3f26, 0x5e3620]);
}

/** Worn earth: the land's grass cells where people walk and the stalls stand, trodden bare (thin patches over them, a little inset so the cells still show). */
function worn(mk: MkBuild, field: HeightField): void {
  mk.src = traceSource();
  mk.at(0, 0, 0, 0, 4601);
  mk.tag = 0;
  const earth = [0x8e6c48, 0x86653f, 0x957451, 0x7f6a48, 0x8b774f];
  const dry = [0x8ba445, 0x85a042, 0x92aa4a];
  const near = (lx: number, lz: number): number => {
    // (how far from the nearest walk, stall or the hall: m)
    let d = Infinity;
    for (const [a, b] of EDGES) {
      const [ax, az] = NODES[a];
      const [bx, bz] = NODES[b];
      const ux = bx - ax;
      const uz = bz - az;
      const t = Math.max(0, Math.min(1, ((lx - ax) * ux + (lz - az) * uz) / (ux * ux + uz * uz)));
      d = Math.min(d, Math.hypot(lx - ax - ux * t, lz - az - uz * t) - 1.2);
    }
    for (const s of STALLS) {
      const [cx, cz] = stallPoint(s, 0, 0);
      d = Math.min(d, Math.hypot(lx - cx, lz - cz) - Math.max(s.w, s.d) * 0.6);
    }
    if (lx > HALL.x0 - 1 && lx < HALL.x1 + 1 && lz > HALL.z0 - 1 && lz < HALL.z1 + 1) d = Math.min(d, 0);
    for (const t of TABLES) d = Math.min(d, Math.hypot(lx - t.x, lz - t.z) - 2);
    return d;
  };
  const c = field.cell;
  for (let z = MK.z - 30; z < MK.z + 16; z += c)
    for (let x = MK.x - 22; x < MK.x + 22; x += c) {
      const cx = Math.floor(x / c) * c + c / 2;
      const cz = Math.floor(z / c) * c + c / 2;
      if (field.surfaceAt(cx, cz) !== SURFACE.grass || field.waterAt(cx, cz) !== null) continue;
      const d = near(cx - MK.x, cz - MK.z);
      const r = hash3(Math.round(cx), Math.round(cz), 7, 4602);
      // (bare where it is walked most, patchy at the edges)
      if (d > 1.5 || (d > 0 && r < d / 1.5)) continue;
      const bare = r > 0.18;
      mk.box(cx, field.heightAt(cx, cz) + 0.02, cz, c - 0.12, 0.05, c - 0.12, bare ? tone(earth, hash3(Math.round(cx), Math.round(cz), 8, 4603)) : tone(dry, r * 5), 'mapBark', 0.96 + r * 0.08);
    }
}

