import type { HeightField } from '../heightfield';
import { registerShop, type ShopItem } from '../shop';
import type { MapFrame } from '../types';
import { EV_KIOSK, evToWorld } from './_evSpots';
import { kulenSite, roadStall } from './_knSite';
import { COUNTER } from './_knStall';
import { frontOf, inWindow, MK, stallById, stallPoint } from './_mkPlan';

/**
 * What the explorer can buy on the east side (shop.ts: roaming offers
 * "E  Buy — <stall>" where he stands in front of an open one, roam/_shop*.ts;
 * the seller hands it over, people/_saleBack.ts): the morning market's food
 * and drink stalls, the sugar-palm village's little shop, and Phnom Kulen's
 * food stall at the picnic place and the drinks stall at the mountain road's
 * foot. Each place registers its own when it is built (`registerMarketShops`
 * from hamlet/_market.ts, …). Real Cambodian prices (riel, 2026: 4 000 ៛ ≈
 * 1 US$), a little dearer at the Kulen picnic place, as at any beauty spot.
 *
 * Where the buyer stands: in front of the counter (a little further out
 * than the market's buyers stand: the roaming explorer is big), facing the
 * seller; each is open while its seller is there (the market's stalls by
 * `_mkPlan.ts STALLS open`, `mkopen=all|none` as the market; the village
 * shop by its shopkeeper's hours; Kulen's as its people's scene).
 */

// ── What they sell ───────────────────────────────────────────────────────────

/** An item; its colours are what he holds and its picture's (the most visible first: see shop.ts). */
const item = (id: string, km: string, en: string, price: number, consume: ShopItem['consume'], colors?: number[]): ShopItem => ({ id, name: { km, en }, price, consume, ...(colors ? { colors } : {}) });

// (the same things at several stalls: one id each, so the explorer's taste of it counts once, roam/_shopPurse.ts)
const COCONUT = (price: number) => item('dong', 'ដូងខ្ចី', 'Green coconut', price, 'coconut', [0x6a9a3a, 0xf0ecd8]);
const WATER = (price: number) => item('tukSot', 'ទឹកសុទ្ធ', 'Bottle of water', price, 'bottle', [0xcfe8f4, 0x2a6ac8]);
const COFFEE = (price: number) => item('kafe', 'កាហ្វេទឹកដោះគោទឹកកក', 'Iced coffee with milk', price, 'bagDrink', [0xa8744a, 0xd8b890]);
const CANE = (price: number) => item('tukAmpov', 'ទឹកអំពៅ', 'Sugarcane juice', price, 'cupDrink', [0xd8dc8a]);
const GREEN_MANGO = (price: number) => item('svayAmbel', 'ស្វាយខ្ចីជ្រលក់អំបិលម្ទេស', 'Green mango with chili salt', price, 'fruit', [0x8ab83a, 0xd8584a]);
const GRILLED_BANANA = (price: number) => item('chekAng', 'ចេកអាំង', 'Grilled banana', price, 'skewer', [0xd8a040, 0x8a5a2a]);
const RAMBUTAN = (price: number) => item('savMav', 'សាវម៉ាវ', 'Rambutans', price, 'fruit', [0xd83a2a]);

/** The market's food and drink stalls (by `_mkPlan.ts` stall id): the shop's name and what it sells. */
const MARKET: Record<string, { km: string; en: string; items: ShopItem[] }> = {
  noodles: {
    km: 'តូបនំបញ្ចុក',
    en: 'Num banh chok stall',
    items: [
      item('numBanhChok', 'នំបញ្ចុកសម្លខ្មែរ', 'Num banh chok, green fish gravy', 4000, 'noodles', [0xf2eee4, 0x9ab840, 0x3a7a2a]),
      item('numBanhChokKari', 'នំបញ្ចុកសម្លការី', 'Num banh chok, chicken curry', 5000, 'noodles', [0xf2eee4, 0xd87a2a, 0xa83a1a]),
      item('taeTukKak', 'តែទឹកកក', 'Iced tea', 500, 'cupDrink', [0xc8782a]),
    ],
  },
  grill: {
    km: 'តូបអាំង',
    en: 'Grill stall',
    items: [
      item('sachKoAng', 'សាច់គោអាំង', 'Beef skewer (sach ko ang)', 1500, 'skewer', [0x8a4a2a, 0xc8a050]),
      GRILLED_BANANA(1000),
      item('potAng', 'ពោតអាំង', 'Grilled corn', 1500, 'skewer', [0xe8c040, 0x8a5a2a]),
    ],
  },
  drinks: {
    km: 'តូបភេសជ្ជៈ',
    en: 'Drinks stall',
    items: [CANE(2000), COCONUT(3000), COFFEE(3000), WATER(1000)],
  },
  fruit: {
    km: 'តូបផ្លែឈើ',
    en: 'Fruit stall',
    items: [GREEN_MANGO(2000), RAMBUTAN(3000), item('krauchThlong', 'ក្រូចថ្លុង', 'Pomelo', 3000, 'fruit', [0xb8d070, 0xf08a8a]), COCONUT(3000)],
  },
  fruitG: {
    km: 'អ្នកលក់ផ្លែឈើ',
    en: 'Fruit seller',
    items: [item('svayTum', 'ស្វាយទុំ', 'Ripe mango', 2000, 'fruit', [0xf0b030, 0xd8584a]), item('chek', 'ចេកណាំវ៉ា', 'Bananas', 1000, 'fruit', [0xf0d040]), RAMBUTAN(3000)],
  },
  cakes: {
    km: 'នំខ្មែរ',
    en: 'Khmer cakes',
    items: [
      item('numKrok', 'នំគ្រក់', 'Num krok (coconut cakes)', 2000, 'sweet', [0xe8b860, 0xf4ecd0]),
      item('numAnsom', 'នំអន្សម', 'Num ansom (sticky rice roll)', 2000, 'sweet', [0x5a9a3a]),
      item('numKom', 'នំគម', 'Num kom', 1000, 'sweet', [0x4a8a34]),
      item('numPlaeAi', 'នំផ្លែអាយ', 'Num plae ai (palm sugar balls)', 2000, 'sweet', [0xf4f2ea]),
      item('numChahuoy', 'នំចាហួយ', 'Num chahuoy (jelly)', 1000, 'sweet', [0x6ac050, 0xf08aa8]),
    ],
  },
  sugar: {
    km: 'ស្ករត្នោត',
    en: 'Palm sugar',
    items: [item('skorThnot', 'ស្ករត្នោត', 'Palm sugar cakes', 3000, 'sweet', [0xb87a3a])],
  },
};

/** The buyer stands this far further out than the market's own buyers (m: the roaming explorer is 1.4 × 1.7 m, his body 0.42 m round). */
const OUT = 0.35;
/** How near the spot he must be (m). */
const REACH = 2.1;

/** The morning market's food and drink stalls (hamlet/_market.ts calls it once built). */
export function registerMarketShops(field: HeightField): void {
  const force = new URLSearchParams(location.search).get('mkopen');
  for (const [id, sells] of Object.entries(MARKET)) {
    const s = stallById(id);
    const f = frontOf(s, 0);
    // (straight out from the stall's front)
    const [ox, oz] = stallPoint(s, 0, s.d / 2 + 1);
    const [fx, fz] = stallPoint(s, 0, s.d / 2);
    const k = OUT / Math.hypot(ox - fx, oz - fz);
    const x = MK.x + f.x + (ox - fx) * k;
    const z = MK.z + f.z + (oz - fz) * k;
    registerShop({
      id: `market-${id}`,
      name: { km: sells.km, en: sells.en },
      x,
      y: field.heightAt(x, z),
      z,
      r: REACH,
      facing: f.yaw,
      items: sells.items,
      open: (fr: MapFrame) => force === 'all' || (force !== 'none' && inWindow(fr.clock, s.open)),
    });
  }
}

/** The sugar-palm village's little shop by the street (hamlet/_eastVillage.ts): drinks and snacks, from dawn into the evening (its shopkeeper's hours). */
export function registerVillageShop(field: HeightField): void {
  // (in front of its counter, between the two plastic stools: the kiosk's own frame, +z its front)
  const [x, z] = evToWorld(EV_KIOSK, -0.05, 1.75);
  registerShop({
    id: 'eastvillage-shop',
    name: { km: 'ហាងលក់ទំនិញ', en: 'Village shop' },
    x,
    y: field.heightAt(x, z),
    z,
    r: REACH,
    facing: EV_KIOSK.facing + Math.PI,
    items: [WATER(1000), COFFEE(3000), item('tukKrauch', 'ទឹកក្រូច', 'Orange soda', 2000, 'bottle', [0xf08a2a, 0xe8452a]), item('numKanhchap', 'នំកញ្ចប់', 'Packet of biscuits', 1000, 'sweet', [0xd83a2a, 0xf0c030])],
    open: (f: MapFrame) => inWindow(f.clock, [0.78, 0.36]),
  });
}

/** In a stall's own frame (its +z its front): (lx, lz) → map (x, z). */
function local(s: { x: number; z: number; yaw: number }, lx: number, lz: number): [number, number] {
  const c = Math.cos(s.yaw);
  const n = Math.sin(s.yaw);
  return [s.x + lx * c + lz * n, s.z - lx * n + lz * c];
}

/**
 * Phnom Kulen's two stalls (hamlet/_kulenPicnic.ts): the food stall at the
 * picnic place (its cook at the grill and the counter, `people/_sceneKulen.ts`:
 * open by day, `[0.77, 0.25]` of the clock, till dark) and the pilgrims'
 * drinks stall at the mountain road's foot (`_sceneKulenPilgrims.ts`: early
 * morning to dusk).
 */
export function registerKulenShops(field: HeightField): void {
  const site = kulenSite(field);
  const st = site.stall;
  {
    // (in front of the counter's other end from the grill, beside the table and its stools: out of the grill's smoke; the cook
    // comes to the counter to sell)
    const [x, z] = local(st, -2.35, 1.8);
    const [cx, cz] = local(st, COUNTER.x + 0.6, COUNTER.z);
    registerShop({
      id: 'kulen-stall',
      name: { km: 'តូបអាហារ', en: 'Food stall' },
      x,
      y: site.ground,
      z,
      r: REACH,
      facing: Math.atan2(cx - x, cz - z),
      items: [item('moanAng', 'មាន់អាំង', 'Grilled chicken', 4000, 'skewer', [0xb8642a]), GRILLED_BANANA(1000), COCONUT(4000), GREEN_MANGO(2000), WATER(1500)],
      open: (f: MapFrame) => inWindow(f.clock, [0.77, 0.25]) && f.night < 0.62,
    });
  }
  const road = roadStall(field);
  if (road) {
    // (in front of the table of water crates, the seller on her stool behind it; the resting stools further out)
    const [x, z] = local(road, -1.0, 1.05);
    registerShop({
      id: 'kulen-road',
      name: { km: 'តូបទឹកអំពៅ', en: 'Sugarcane juice stall' },
      x,
      y: road.ground,
      z,
      r: REACH,
      facing: road.yaw + Math.PI,
      items: [CANE(2000), COCONUT(3000), COFFEE(3000), WATER(1000)],
      open: (f: MapFrame) => f.night < 0.5 && !(f.clock > 0.25 && f.clock < 0.72),
    });
  }
}

