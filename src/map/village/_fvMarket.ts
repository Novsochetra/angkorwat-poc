import { traceSource } from '../../feedback/sourceTrace';
import type { HeightField } from '../heightfield';
import { goods, hang, heap } from '../hamlet/_mkGoods';
import { bambooPole, BAMBOO, MkBuild, PARASOLS, parasol, platform, STOOLS, stool, table, TARPS, tarp, tone, wheel } from '../hamlet/_mkKit';
import { inWindow } from '../hamlet/_mkPlan';
import { MARKET_WORD, NOODLE_WORD, signLetters, wordSize } from '../hamlet/_mkSign';
import type { Puff } from '../hamlet/_mkStalls';
import type { Toggles } from '../hamlet/_mkToggles';
import { registerShop } from '../shop';
import type { MapFrame } from '../types';
import { FV_ARCH, FV_BOATS, FV_GROCERY, FV_STALLS, LANE, boatBuyer, type FvStall } from './_fvPlan';
import type { VillageLights } from './_lights';
import type { SmokeSource } from './_smoke';
import { GROUND, JETTY, SHOP_HOME, homeToWorld } from './_spots';

/**
 * The floating village's market (where it stands: `_fvPlan.ts`), built
 * with the morning market's kit (hamlet/_mkKit.ts, _mkGoods.ts: tables,
 * platforms, tarps and parasols on bamboo poles, the goods): the fish on a
 * sheet at the landing under an umbrella (an LED tube on a pole for the
 * dark before dawn), prahok and dried fish on a raised bamboo platform,
 * greens, fruit, Khmer sweets on tables, the grill with split fish clamped
 * in bamboo over the charcoal, the noodle cart by the shop (its
 * sign "នំបញ្ចុក", the pot of fish gravy steaming, a bare bulb and a string
 * of small bulbs), the drinks cart (a cooler of ice, the coffee, bags with
 * straws hung on a rail, coconuts); and over the lane where it leaves the
 * square for the jetty, the painted sign arch "ផ្សារ" facing whoever comes
 * down off the dike.
 *
 * Every stall's goods and spread tarp or open parasol are toggle
 * `openTag(i)`, its rolled tarp and folded parasol `closedTag(i)` (all soft
 * families: the walk map never keeps what comes and goes); the village part
 * shows the ones open now (`followMarket`). The lamps are the village's
 * switchable glows (`VillageLights.switchable`: groups `fv:dawn`,
 * `fv:noodle`, `fv:grill`); steam off the noodle pots, the grill's smoke.
 * Its shops (src/map/shop.ts) are registered here: the stalls that sell
 * something to eat or drink, the boats (`FV_BOATS`: their buyer stands on
 * the jetty), the grocery over its counter.
 */

export const openTag = (i: number): number => 1 + i * 2;
export const closedTag = (i: number): number => 2 + i * 2;

/** Lamp colours (sRGB): a bare bulb, a string of small bulbs, an LED tube, embers. */
const BULB = 0xffc070;
const STRING = [0xffd890, 0xff9a70, 0xffe0a0, 0x9ad0ff, 0xffb0d0];
const TUBE = 0xdcf0ff;
const EMBER = 0xff5a1c;
const UMBRELLA = [0xe07a2a, 0xd9a02e];

export interface FvMarket {
  /** Its blocks and their toggles (the village part adds them to its own). */
  mk: MkBuild;
  /** Steaming pots (the noodle stall's, the noodle boat's) and the grill's smoke. */
  steam: Puff[];
  smoke: SmokeSource[];
  /** Where the noodle stall's bulbs hang (world m): the pool of light under them at night. */
  pools: [number, number, number][];
  /** Map rectangles built on (trees keep off). */
  covers: [number, number, number, number][];
}

export function buildFvMarket(field: HeightField, lights: VillageLights): FvMarket {
  const mk = new MkBuild();
  const out: FvMarket = { mk, steam: [], smoke: [], pools: [], covers: [] };
  FV_STALLS.forEach((s, i) => {
    mk.at(s.x, field.heightAt(s.x, s.z), s.z, s.yaw, 5101 + i * 17);
    stall(mk, s, i, out, lights);
    const r = Math.max(s.w, s.d) / 2 + 1;
    out.covers.push([s.x - r, s.z - r, s.x + r, s.z + r]);
  });
  arch(mk, field);
  // The noodle boat's pot steams while it lies at the jetty.
  // (its pot a little forward of the boat's middle, at the people's scale: people/_sceneVillageMarket.ts)
  for (const b of FV_BOATS) if (b.goods === 'noodles') out.steam.push({ x: b.x + Math.sin(b.yaw) * 0.5, y: JETTY.y - 0.3, z: b.z + Math.cos(b.yaw) * 0.5, stall: b.id });
  shops();
  return out;
}

/** Show what is open at `clock` (`force`: every stall open or shut, `fvopen=all|none`), and switch the lamps. */
export function followMarket(f: MapFrame, force: string | null, toggles: Toggles, setLit: (key: string, on: boolean) => void): void {
  const c = f.clock;
  const open = (w: [number, number]) => (force === 'all' ? true : force === 'none' ? false : inWindow(c, w));
  FV_STALLS.forEach((s, i) => {
    const on = open(s.open);
    toggles.set(openTag(i), on);
    toggles.set(closedTag(i), !on);
  });
  setLit('fv:dawn', open(stallOf('fish').open) && inWindow(c, [0.66, 0.77]));
  setLit('fv:noodle', open(stallOf('noodles').open) && inWindow(c, [0.18, 0.78]));
  setLit('fv:grill', open(stallOf('grill').open) && f.night > 0.25);
}

/** Is a stall (or boat) open at `clock` (as `followMarket` shows it)? */
export function fvOpen(id: string, clock: number, force: string | null): boolean {
  if (force === 'all') return true;
  if (force === 'none') return false;
  const w = FV_STALLS.find((s) => s.id === id)?.open ?? FV_BOATS.find((b) => b.id === id)?.open;
  return w ? inWindow(clock, w) : false;
}

const stallOf = (id: string): FvStall => FV_STALLS.find((s) => s.id === id)!;

/** The shops: every stall with something to eat or drink, the boats that sell food, the grocery. */
function shops(): void {
  const force = new URLSearchParams(location.search).get('fvopen');
  for (const s of FV_STALLS) {
    if (!s.shop) continue;
    // (the buyer stands at the stall's front, facing the seller)
    const sx = s.x + Math.sin(s.yaw) * (s.d / 2 + 0.9);
    const sz = s.z + Math.cos(s.yaw) * (s.d / 2 + 0.9);
    registerShop({ id: `village-${s.id}`, name: s.shop.name, x: sx, y: GROUND, z: sz, r: 1.8, facing: s.yaw + Math.PI, items: s.shop.items, open: (f) => fvOpen(s.id, f.clock, force) });
  }
  for (const b of FV_BOATS) {
    if (!b.shop) continue;
    const q = boatBuyer(b);
    registerShop({ id: `village-${b.id}`, name: b.shop.name, x: q.x, y: JETTY.y, z: q.z, r: 1.7, facing: q.yaw, items: b.shop.items, open: (f) => fvOpen(b.id, f.clock, force) });
  }
  // The grocery: on its veranda before the counter (up its two steps), facing it.
  const h = SHOP_HOME;
  const zw = -(h.d + h.v) / 2 + h.d;
  const [gx, gz] = homeToWorld(h, 0, zw + 1.3);
  registerShop({ id: 'village-grocery', name: FV_GROCERY.name, x: gx, y: h.floor, z: gz, r: 1.7, facing: h.facing + Math.PI, items: FV_GROCERY.items, open: (f) => force !== 'none' && inWindow(f.clock, FV_GROCERY.open) });
}

// ── The stalls ───────────────────────────────────────────────────────────────

/** One stall in its frame (x across, z to its front, y up from the ground): structure, cover, goods (toggled), lamps. */
function stall(mk: MkBuild, s: FvStall, i: number, out: FvMarket, lights: VillageLights): void {
  mk.src = traceSource();
  const open = openTag(i);
  const closed = closedTag(i);
  const { w, d } = s;
  const front = d / 2;
  const lamp = (key: string, lx: number, ly: number, lz: number, size: number, color: number, halo: number) =>
    lights.switchable(key, mk.wx(lx, lz), mk.ground + ly, mk.wz(lx, lz), size, size * 1.3, size, 0, color, halo, lx * 3.1 + lz);
  mk.tag = 0;
  const cover = () => {
    if (s.cover === 'none') return;
    if (s.cover === 'umbrella') {
      const col = UMBRELLA[i % UMBRELLA.length];
      parasol(mk, -0.55, -0.45, 2.25, 1.3, [col, 0xf0ebe0], open, 0, 0.3);
      return;
    }
    if (s.cover.startsWith('tarp')) tarp(mk, w, d, 3.15, 2.85, TARPS[s.cover as keyof typeof TARPS], open, closed, s.cover === 'tarpStripe');
    else parasol(mk, 0, -0.35, 2.95, 1.9, PARASOLS[s.cover as keyof typeof PARASOLS], open, closed, 0.2 + i);
  };
  switch (s.kind) {
    case 'table': {
      const td = 1.1;
      const tz = front - 0.05 - td / 2;
      const tw = w - 0.6;
      table(mk, 0, tz, tw, td, 1.0);
      if (s.seat.pose === 'stool') stool(mk, s.seat.x, s.seat.z, tone(STOOLS, mk.r(i, 1)));
      // Plastic crates and a basket under the table (they stay).
      mk.box(-tw / 4, 0.5, tz, 0.5, 0.36, 0.4, tone([0xc83a32, 0x3a6aa8], mk.r(i, 2)), 'mapBark', 0.9);
      mk.box(tw / 4, 0.14, tz - 0.1, 0.46, 0.28, 0.4, 0xc8a868, 'mapBark', 0.9);
      cover();
      mk.tag = open;
      goods(mk, s.goods as Parameters<typeof goods>[1], { x0: -tw / 2 + 0.1, x1: tw / 2 - 0.1, z0: tz - td / 2 + 0.08, z1: tz + td / 2 - 0.08, y: 1.0 });
      if (s.cover.startsWith('tarp')) hang(mk, s.goods as Parameters<typeof hang>[1], -w / 2 + 0.2, w / 2 - 0.2, front + 0.35, 3.1);
      else if (s.goods === 'fruit') {
        // (under a parasol: a thin bamboo rail across the table's front for the banana hands)
        mk.tag = 0;
        const rz = tz + td / 2 - 0.05;
        for (const sx of [-1, 1]) mk.box((sx * tw) / 2, 1.45, rz, 0.05, 0.9, 0.05, tone(BAMBOO, mk.r(sx, 3)), 'mapBark');
        mk.rod(-tw / 2, 1.88, rz, tw / 2, 1.88, rz, 0.05, 0.05, tone(BAMBOO, 0.3), 'mapBark');
        mk.tag = open;
        hang(mk, 'fruit', -tw / 2 + 0.15, tw / 2 - 0.15, rz, 1.85);
      }
      break;
    }
    case 'platform': {
      platform(mk, 0, -0.05, w - 0.2, d - 0.3, 0.5);
      cover();
      mk.tag = open;
      goods(mk, s.goods as Parameters<typeof goods>[1], { x0: -w / 2 + 0.25, x1: w / 2 - 0.25, z0: -0.35, z1: front - 0.3, y: 0.5 });
      // Big prahok jars on the ground by the platform (they stay: the stock), one open.
      mk.tag = 0;
      for (let k = 0; k < 3; k++) {
        const jx = w / 2 + 0.45;
        const jz = -0.7 + k * 0.62;
        const c = tone([0x5a3a24, 0x4e3220, 0x66442a], mk.r(k, 3));
        mk.box(jx, 0.28, jz, 0.5, 0.56, 0.5, c, 'mapBark', 0.95);
        mk.box(jx, 0.6, jz, 0.34, 0.1, 0.34, c, 'mapBark', 1.05);
        if (k === 1) mk.box(jx, 0.56, jz, 0.3, 0.04, 0.3, 0x8a7a5a, 'petal');
        else mk.box(jx, 0.68, jz, 0.4, 0.05, 0.4, 0x3a6aa8, 'petal', 0.9);
      }
      break;
    }
    case 'ground': {
      // A plastic sheet (blue), the basins on it; she squats behind; an LED tube on a bamboo pole for the dark before dawn.
      mk.tag = open;
      mk.span(-w / 2 + 0.1, 0, -0.35, w / 2 - 0.1, 0.025, front - 0.05, 0x3a6aa8, 'petal', 0.95);
      mk.tag = 0;
      cover();
      mk.tag = open;
      goods(mk, s.goods as Parameters<typeof goods>[1], { x0: -w / 2 + 0.2, x1: w / 2 - 0.2, z0: -0.25, z1: front - 0.15, y: 0.025 });
      mk.tag = 0;
      bambooPole(mk, w / 2 + 0.2, -0.5, 2.2, 0.06);
      mk.box(w / 2 + 0.2, 2.05, -0.3, 0.07, 0.07, 0.5, 0xe8e8e2, 'mapBark');
      lamp('fv:dawn', w / 2 + 0.2, 2.02, -0.3, 0.1, TUBE, 1.6);
      // Crates of ice and the fish's plastic tubs from the boats, stacked by her.
      for (let k = 0; k < 3; k++) mk.box(-w / 2 - 0.35, 0.2 + k * 0.38, -0.2, 0.5, 0.36, 0.44, k === 1 ? 0xe8eef2 : tone([0xc83a32, 0x3a6aa8], mk.r(k, 4)), 'mapBark', 0.95);
      break;
    }
    case 'noodle': {
      noodleCart(mk, s, out, lamp);
      break;
    }
    case 'grill': {
      grill(mk, i, out, lamp, cover);
      break;
    }
    case 'drinks': {
      drinksCart(mk, cover, open);
      break;
    }
  }
  mk.tag = 0;
}

type LampAt = (key: string, lx: number, ly: number, lz: number, size: number, color: number, halo: number) => void;

/**
 * The noodle cart (num banh chok): a table under a little roof on four thin
 * posts, its painted sign "នំបញ្ចុក" on the roof's front; the charcoal
 * stove and the big pot of fish gravy beside it, a steamer; its blue tarp
 * stays up night and day; a bare bulb over the cart and a string of small
 * bulbs along the tarp's front (lit while it is open, from dusk).
 */
function noodleCart(mk: MkBuild, s: FvStall, out: FvMarket, lamp: LampAt): void {
  const i = FV_STALLS.indexOf(s);
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
  // The stove and the pot of gravy (eight-sided: two boxes turned) on the side toward the square, the steamer on the cart.
  const [px, pz] = [1.55, -0.2];
  mk.box(px, 0.28, pz, 0.62, 0.56, 0.62, 0x8a5a3a, 'mapBark', 0.9);
  mk.box(px, 0.28, pz, 0.62, 0.56, 0.62, 0x8a5a3a, 'mapBark', 0.9, 0, Math.PI / 4);
  mk.box(px, 0.8, pz, 0.86, 0.5, 0.86, 0xb4b8ba, 'metal', 1.05);
  mk.box(px, 0.8, pz, 0.86, 0.5, 0.86, 0xb4b8ba, 'metal', 1.05, 0, Math.PI / 4);
  mk.box(px, 1.04, pz, 0.74, 0.03, 0.74, 0xb8b048, 'metal', 0.95, 0, Math.PI / 4);
  out.steam.push({ x: mk.wx(px, pz), y: mk.ground + 1.1, z: mk.wz(px, pz), stall: s.id });
  mk.box(-0.75, 1.2, 0.2, 0.44, 0.4, 0.44, 0xb4b8ba, 'metal');
  mk.box(-0.75, 1.43, 0.2, 0.3, 0.06, 0.3, 0x8a8e90, 'metal');
  out.steam.push({ x: mk.wx(-0.75, 0.2), y: mk.ground + 1.5, z: mk.wz(-0.75, 0.2), stall: s.id });
  tarp(mk, s.w, s.d, 3.1, 2.9, TARPS.tarpBlue, 0, 0, false, false);
  // Two stools by the cart for whoever eats there (the shop's two tables are beside it).
  stool(mk, -1.7, 1.2, tone(STOOLS, mk.r(i, 5)));
  stool(mk, 0.6, 1.55, tone(STOOLS, mk.r(i, 6)));
  // A water jar behind.
  mk.box(-1.45, 0.3, -0.75, 0.56, 0.6, 0.56, 0x6b3f26, 'mapBark', 0.95);
  mk.tag = openTag(i);
  goods(mk, 'noodles', { x0: -1.0, x1: 1.0, z0: -0.05, z1: 0.75, y: 1.0 });
  mk.tag = 0;
  // The bare bulb over the cart, the string of small bulbs along the tarp's front.
  mk.box(0.4, 2.95, 0.5, 0.02, 0.3, 0.02, 0x2a2a2a, 'mapBark');
  lamp('fv:noodle', 0.4, 2.72, 0.5, 0.13, BULB, 2.4);
  const zf = s.d / 2 + 0.35;
  for (let k = 0; k < 7; k++) {
    const u = k / 6;
    const lx = -s.w / 2 + u * s.w;
    const sag = Math.sin(u * Math.PI) * 0.18;
    lamp('fv:noodle', lx, 3.0 - sag, zf, 0.075, STRING[k % STRING.length], 0.55);
  }
  out.pools.push([mk.wx(0.4, 0.8), mk.ground, mk.wz(0.4, 0.8)]);
}

/**
 * The grill: a steel trough on legs, embers under the grid, split fish
 * clamped in bamboo lying across it (trey ang) and grilled bananas in their
 * leaves; a side table with the fish waiting on a tray and a basket; a
 * bucket of charcoal; a parasol over the man turning them. Its smoke drifts
 * over the square while it is open.
 */
function grill(mk: MkBuild, i: number, out: FvMarket, lamp: LampAt, cover: () => void): void {
  for (const [sx, sz] of [
    [-0.65, 0.15],
    [0.65, 0.15],
    [-0.65, 0.55],
    [0.65, 0.55],
  ])
    mk.box(sx, 0.4, sz, 0.06, 0.8, 0.06, 0x3a3a38, 'metal');
  mk.span(-0.75, 0.72, 0.1, 0.75, 0.92, 0.6, 0x4a4a48, 'metal', 0.95);
  mk.span(-0.7, 0.92, 0.14, 0.7, 0.94, 0.56, 0x6a2a1a, 'metal', 0.8);
  lamp('fv:grill', 0, 0.93, 0.35, 0.12, EMBER, 1.2);
  out.smoke.push({ x: mk.wx(0, 0.35), y: mk.ground + 1.1, z: mk.wz(0, 0.35) });
  table(mk, 1.3, -0.2, 0.8, 0.6, 0.9, false);
  mk.box(-1.05, 0.2, -0.4, 0.34, 0.4, 0.34, 0x3a3a3a, 'metal', 0.9);
  cover();
  mk.tag = openTag(i);
  // Split fish clamped in bamboo across the grid, their sticks reaching over the front edge; bananas in their leaves.
  for (let k = 0; k < 6; k++) {
    const x = -0.55 + k * 0.22;
    const fish = k % 3 !== 2;
    mk.box(x, 0.97, 0.38, 0.03, 0.03, 0.9, 0xc8b27a, 'petal');
    if (fish) {
      mk.box(x, 0.97, 0.3, 0.17, 0.04, 0.36, tone([0x9a7a4a, 0x8a6a3a, 0xa8864e], mk.r(k, 7)), 'petal');
      mk.box(x, 0.99, 0.3, 0.18, 0.02, 0.04, 0x3a2a1e, 'petal');
      mk.box(x, 0.99, 0.2, 0.18, 0.02, 0.04, 0x3a2a1e, 'petal');
    } else mk.box(x, 0.98, 0.32, 0.12, 0.08, 0.3, 0x6a7a3a, 'petal');
  }
  // The fish waiting on a tray, a basket of bananas.
  mk.box(1.3, 0.92, -0.2, 0.62, 0.03, 0.44, 0xc8ccce, 'petal', 1.05);
  for (let k = 0; k < 3; k++) mk.box(1.14 + k * 0.16, 0.95, -0.2, 0.12, 0.04, 0.34, tone([0xb8c0c4, 0xa8b2b8, 0xcfd6d8], mk.r(k, 8)), 'petal');
  heap(mk, -1.05, 0.4, -0.4, 0.14, 0.12, 0.07, [0x2a2622, 0x3a3430], 1, 9);
  mk.tag = 0;
}

/**
 * The drinks cart: a blue body on two wheels with a white top, a big
 * cooler of ice, a kettle of coffee and cans of condensed milk, cups;
 * bags of iced coffee and juice hung with their straws on a rail, green
 * coconuts; a stool; its parasol.
 */
function drinksCart(mk: MkBuild, cover: () => void, open: number): void {
  mk.span(-0.8, 0.45, -0.1, 0.8, 1.0, 0.6, 0x3a6aa8, 'metal', 1);
  mk.span(-0.85, 1.0, -0.15, 0.85, 1.05, 0.65, 0xe8e8e2, 'metal', 1.05);
  for (const sx of [-0.62, 0.62]) wheel(mk, sx, 0.3, 0.25, 0.3, 0.08, 0x2a2a2a, 'metal');
  // The cooler of ice (red and white), the kettle and the milk cans, a glass jar of coffee.
  mk.span(-0.75, 1.05, 0.0, -0.15, 1.45, 0.5, 0xf0eee8, 'metal', 1);
  mk.span(-0.77, 1.45, -0.02, -0.13, 1.5, 0.52, 0xc83a30, 'metal', 1);
  mk.box(0.15, 1.2, 0.35, 0.22, 0.3, 0.22, 0xb8bcbe, 'metal', 1.05);
  mk.box(0.15, 1.37, 0.35, 0.1, 0.06, 0.1, 0x3a3a3a, 'metal');
  // A rail on two bamboo posts for the bags.
  for (const sx of [-0.8, 0.8]) mk.box(sx, 1.45, 0.62, 0.05, 0.9, 0.05, tone(BAMBOO, 0.4), 'mapBark');
  mk.rod(-0.85, 1.88, 0.62, 0.85, 1.88, 0.62, 0.05, 0.05, tone(BAMBOO, 0.2), 'mapBark');
  // A stool behind, a crate of empty bottles.
  stool(mk, -0.3, -0.75, tone(STOOLS, 0.3));
  mk.span(0.5, 0, -0.8, 1.0, 0.35, -0.4, 0x3a8a4a, 'mapBark', 0.9);
  cover();
  mk.tag = open;
  for (let k = 0; k < 3; k++) mk.box(0.4 + k * 0.13, 1.1, 0.12, 0.08, 0.1, 0.08, [0xe8e0c8, 0xd8c890, 0xe8e0c8][k], 'petal');
  mk.box(0.55, 1.14, 0.45, 0.14, 0.18, 0.14, 0x5a3a24, 'petal', 1.05);
  goods(mk, 'drinks', { x0: -0.8, x1: 0.8, z0: -0.1, z1: 0.6, y: 1.05 });
  hang(mk, 'drinks', -0.75, 0.75, 0.62, 1.86);
  mk.tag = 0;
}

/**
 * The sign arch over the lane where it leaves the square for the jetty:
 * two bamboo posts (a brick foot each), a painted board, blue with a red
 * border, "ផ្សារ" in raised pale yellow letters on both faces (toward the
 * square and the dike, and toward the jetty), a lotus painted either side.
 */
function arch(mk: MkBuild, field: HeightField): void {
  mk.src = traceSource();
  // (across the lane between the stalls, its face to the square: the way back down the lane)
  const [ax, az] = LANE.from;
  const [bx, bz] = LANE.to;
  const l = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / l;
  const uz = (bz - az) / l;
  const cx = ax + ux * FV_ARCH.t;
  const cz = az + uz * FV_ARCH.t;
  mk.at(cx, field.heightAt(cx, cz), cz, Math.atan2(-ux, -uz), 5401);
  mk.tag = 0;
  const half = FV_ARCH.half;
  const px = 0.05;
  const [cols, rows] = wordSize(MARKET_WORD);
  const bw = cols * px + 1.0;
  const bh = rows * px + 0.3;
  const by = 3.45 + bh / 2;
  const top = by + bh / 2 + 0.25;
  for (const sx of [-1, 1]) {
    const x = sx * half;
    mk.box(x, 0.2, 0, 0.36, 0.4, 0.36, 0xb8a080, 'mapBark');
    bambooPole(mk, x, 0, top, 0.16);
    mk.box(x, top + 0.06, 0, 0.22, 0.12, 0.22, 0xc8b27a, 'mapBark');
  }
  mk.span(-bw / 2, by - bh / 2, -0.06, bw / 2, by + bh / 2, 0.06, 0x2a5a9a, 'mapBark', 1);
  mk.span(-bw / 2 - 0.07, by + bh / 2, -0.08, bw / 2 + 0.07, by + bh / 2 + 0.1, 0.08, 0xc83a2a, 'mapBark');
  mk.span(-bw / 2 - 0.07, by - bh / 2 - 0.1, -0.08, bw / 2 + 0.07, by - bh / 2, 0.08, 0xc83a2a, 'mapBark');
  for (const sx of [-1, 1]) mk.span(sx * (bw / 2) - 0.05, by - bh / 2, -0.08, sx * (bw / 2) + 0.05, by + bh / 2, 0.08, 0xc83a2a, 'mapBark');
  // (its board ties on to the posts with a rope at each end)
  for (const sx of [-1, 1]) mk.rod(sx * (bw / 2), by, 0, sx * half, by + 0.1, 0, 0.04, 0.04, 0xc8b27a, 'mapBark');
  for (const face of [-1, 1]) {
    signLetters(mk, MARKET_WORD, 0, by, face * 0.06, px, face, 0xf6e7a8);
    const z = face * 0.08;
    for (const sx of [-1, 1]) {
      const lx = sx * (cols * px * 0.5 + 0.26);
      mk.box(lx, by - 0.14, z, 0.32, 0.18, 0.04, 0xe86a9a, 'mapBark');
      mk.box(lx, by + 0.06, z, 0.13, 0.24, 0.04, 0xf08ab0, 'mapBark');
      mk.box(lx - 0.16, by - 0.02, z, 0.08, 0.16, 0.04, 0xf08ab0, 'mapBark');
      mk.box(lx + 0.16, by - 0.02, z, 0.08, 0.16, 0.04, 0xf08ab0, 'mapBark');
      mk.box(lx, by - 0.32, z, 0.48, 0.05, 0.04, 0x3f8a3a, 'mapBark');
    }
  }
}
