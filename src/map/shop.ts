import type { Lang, MapFrame } from './types';

/**
 * Buying food and drink while roaming: every stall that sells something
 * registers a `Shop` here when its place is built (the market's stalls, the
 * east village shop, the coconut cart behind Angkor Wat, the palm sugar hut,
 * Kulen's food and drinks stalls, the floating village's market…); the
 * roaming explorer (roam/_shop*.ts) offers "E  Buy" when he stands at one,
 * lets the player pick what to buy with the riel in his purse, then eats or
 * drinks it (or keeps it for later); and the people part hands it over:
 * the seller nearest the shop turns to him and gives it (`SALE`, read like
 * `GREET` in greet.ts). No three.js, nothing per frame but `SALE`.
 */

/** How the explorer takes what he bought (the animation and what he holds: src/character). */
export type ConsumeKind =
  /** A bowl of noodles (num banh chok) or soup, with chopsticks: eaten sitting on a stool when one is near, else standing. */
  | 'noodles'
  /** A plate or box of rice (bai sach chrouk, fried rice) with a spoon. */
  | 'riceBowl'
  /** Grilled skewers (sach ko ang), a grilled fish or corn on a stick: bitten. */
  | 'skewer'
  /** Fruit: mango slices in a bag with a stick, a banana, a bunch of rambutans. */
  | 'fruit'
  /** A small sweet: a palm sugar cake, num ansom, num krok, a sticky rice cake. */
  | 'sweet'
  /** A green coconut with a straw, held in both hands. */
  | 'coconut'
  /** A cup with a straw: sugarcane juice, palm juice (tuk thnot), iced tea. */
  | 'cupDrink'
  /** A plastic bag with a straw, tied to a finger: iced coffee with milk (kafe tuk doh ko). */
  | 'bagDrink'
  /** A bottle of water. */
  | 'bottle';

/** One thing a shop sells. */
export interface ShopItem {
  /** Unique within its shop, e.g. `numBanhChok`. */
  id: string;
  name: Record<Lang, string>;
  /** Price in riel (៛), a real Cambodian price. */
  price: number;
  consume: ConsumeKind;
  /** Colours for what he holds (sRGB, the most visible first), when the kind's defaults are not right. */
  colors?: number[];
}

/** A stall or seller the explorer can buy from. */
export interface Shop {
  /** Unique, e.g. `market-noodles`. */
  id: string;
  /** Its name for the prompt ("E  Buy — {name}"). */
  name: Record<Lang, string>;
  /** Where the buyer stands (m; `y` = the floor there) and how near he must be (m). */
  x: number;
  y: number;
  z: number;
  r: number;
  /** The way the buyer faces the seller (radians: toward (sin, cos) in x, z), if it matters. */
  facing?: number;
  items: ShopItem[];
  /** Open now (time of day, the weather…)? Default: always. */
  open?(f: MapFrame): boolean;
}

/** Every shop on the map (filled as the places build; read by roaming). */
export const SHOPS: Shop[] = [];

/** A place adds its shop (a shop with the same id replaces the old one: a rebuilt part). */
export function registerShop(s: Shop): void {
  const i = SHOPS.findIndex((o) => o.id === s.id);
  if (i >= 0) SHOPS[i] = s;
  else SHOPS.push(s);
}

/** The open shop whose spot (x, y, z) is within its reach, nearest first; null if none. */
export function shopNear(x: number, y: number, z: number, f: MapFrame): Shop | null {
  let best: Shop | null = null;
  let bestD = Infinity;
  for (const s of SHOPS) {
    if (Math.abs(s.y - y) > 2.5) continue;
    const dx = s.x - x;
    const dz = s.z - z;
    const d = dx * dx + dz * dz;
    if (d > s.r * s.r || d >= bestD) continue;
    if (s.open && !s.open(f)) continue;
    best = s;
    bestD = d;
  }
  return best;
}

/**
 * The last sale, for the people part: when it happened (s, `MapFrame.t`),
 * at which shop, what; `n` counts up with each sale (a reader keeps the last
 * it answered). The seller nearest the shop's spot hands it over.
 */
export const SALE = { t: -1e9, shop: '', item: '', x: 0, y: 0, z: 0, n: 0 };

/** Roaming records a sale at shop `s`. */
export function sold(t: number, s: Shop, item: ShopItem): void {
  SALE.t = t;
  SALE.shop = s.id;
  SALE.item = item.id;
  SALE.x = s.x;
  SALE.y = s.y;
  SALE.z = s.z;
  SALE.n++;
}

/**
 * The explorer at a shop's buy menu (roaming, roam/_shop.ts): which shop
 * (`''`: none now), since when (s, `MapFrame.t`), where its buyer stands and
 * faces; `n` counts up with each change. The people part's seller there
 * looks up at him and asks what he would like (people/_saleBack.ts).
 */
export const BROWSE = { shop: '', t: -1e9, x: 0, y: 0, z: 0, facing: 0, n: 0 };

/** Roaming opens (`s`) or shuts (null) the buy menu at a shop. */
export function browse(t: number, s: Shop | null): void {
  const id = s?.id ?? '';
  if (id === BROWSE.shop) return;
  BROWSE.shop = id;
  BROWSE.t = t;
  if (s) {
    BROWSE.x = s.x;
    BROWSE.y = s.y;
    BROWSE.z = s.z;
    BROWSE.facing = s.facing ?? 0;
  }
  BROWSE.n++;
}
