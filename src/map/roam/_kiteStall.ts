import { frontOf, inWindow, MK, stallById, stallPoint } from '../hamlet/_mkPlan';
import { Kite, type KiteLook } from '../people/_kite';
import type { Things } from '../people/_things';
import { SALE, type Shop } from '../shop';
import type { MapFrame } from '../types';
import { HIS_KITE } from './_kiteSky';
import type { RoamWorld } from './types';

/**
 * Kites for sale at the morning market (hamlet/_mkPlan.ts): the stall of
 * woven things (baskets, mats, palm-leaf hats, brooms: `baskets`) has a
 * bamboo pole at its front north corner, a cross-piece along its front, and
 * three small kites: two khleng ek hung side by side from the cross-piece
 * (one in the colours of his, the other yellow and dark red, as the young
 * men's) and a children's khleng kandaung tied to the pole's top. While the stall is
 * open (its seller's hours) "E  Buy a kite — ៨,០០០ ៛" in front of the pole
 * opens a card that asks (roam/_kiteFly.ts); once he has his, his own kite's
 * twin is gone from the pole.
 *
 * Why its own card and not shop.ts: the shops sell food and drink, and their
 * flow (the buy menu, eating, the bag of things kept) is about eating; a
 * kite is one thing bought once and kept for good (progress.ts `kite.have`).
 * So the kite has a small card of its own, and tells the people part as the
 * shops do (shop.ts `BROWSE` while it asks, `SALE` when he pays): the seller
 * looks up and asks, then hands it over and thanks him (people/_saleBack.ts).
 *
 * Drawn with his kite's things (_kiteSky.ts: one draw), only while the stall
 * is open and the camera within `NEAR` m.
 */

/** Its price (riel, 2026: a small hand-made khleng ek with its bow, ≈ 2 US$). */
export const KITE_PRICE = 8000;
/** The stall's name for the people part (its seller), and the buyer's reach (m). */
const ID = 'market-kites';
const REACH = 1.7;
/** Drawn while the camera is this near (m). */
const NEAR = 160;
/**
 * Where the pole stands (stall space: across, to the front; m), how tall; the cross-piece's end (across), where
 * the two khleng ek hang from it (across) and how far under it their knots are (m); where the buyer stands (across).
 */
const POLE = { x: -2.05, z: 1.3, h: 3.4, end: -0.4 };
const HANG = [
  { x: -1.72, down: 0.62 },
  { x: -0.78, down: 0.72 },
];
const BUYER_ACROSS = -1.25;
/** The buyer stands a little further out than the market's own buyers (the roaming explorer is big: hamlet/_shops.ts). */
const OUT = 0.35;

const OTHER: KiteLook = { kind: 'ek', tips: 'round', sail: 0xe8b43a, edge: 0x8a2a24, motif: 0x2a2426, motif2: 0x8a2a24, tail: 0xd8c890, size: 1.3, line: 0, tails: 3 };
const SMALL: KiteLook = { kind: 'kandaung', sail: 0xd8407a, edge: 0xd8407a, motif: 0xf2d24a, size: 0.9, line: 0 };

export interface KiteStall {
  /** Where the buyer stands (m), the way he faces the stall. */
  readonly spot: { readonly x: number; readonly y: number; readonly z: number; readonly facing: number };
  /** For the people part's seller (shop.ts `browse`). */
  readonly shop: Shop;
  /** Feet at (x, y, z) within reach of the spot, and it is open at `clock` (its seller's hours). */
  near(x: number, y: number, z: number, clock: number): boolean;
  /** Once a frame: the pole and its kites (`his`: his own kite's twin is gone, he has it); true while they are out. */
  frame(f: MapFrame, his: boolean): boolean;
  /** He paid: tell the people part, as shop.ts `sold` does (a kite is no food item: the record is written here). */
  sold(t: number): void;
}

/** The market's kites for sale, or null when the market is not on this map (`parts=`). */
export function createKiteStall(world: RoamWorld, things: Things, params: URLSearchParams): KiteStall | null {
  const s = stallById('baskets');
  if (!s) return null;
  const force = params.get('mkopen');
  // The buyer's spot: out in front of the pole's side of the stall, facing it.
  const f = frontOf(s, BUYER_ACROSS);
  const [ox, oz] = stallPoint(s, BUYER_ACROSS, s.d / 2 + 1);
  const [fx, fz] = stallPoint(s, BUYER_ACROSS, s.d / 2);
  const k = OUT / Math.hypot(ox - fx, oz - fz);
  const bx = MK.x + f.x + (ox - fx) * k;
  const bz = MK.z + f.z + (oz - fz) * k;
  const spot = { x: bx, y: world.groundAt(bx, bz), z: bz, facing: f.yaw };
  const shop: Shop = { id: ID, name: { km: 'ខ្លែង', en: 'Kites' }, x: spot.x, y: spot.y, z: spot.z, r: REACH, facing: spot.facing, items: [] };
  // The pole, its cross-piece, and the strings the kites hang from.
  const at = (sx: number, sz: number): [number, number] => {
    const [lx, lz] = stallPoint(s, sx, sz);
    return [MK.x + lx, MK.z + lz];
  };
  const [px, pz] = at(POLE.x, POLE.z);
  const py = world.field.heightAt(px, pz);
  const top = py + POLE.h - 0.15;
  const [ex, ez] = at(POLE.end, POLE.z);
  const hangAt = HANG.map((h) => at(h.x, POLE.z));
  const slots = things.alloc(5);
  for (let i = 0; i < 5; i++) things.paint(slots + i, i < 2 ? 0xc49a58 : 0xeee8d8);
  const his = new Kite(things, HIS_KITE, 0.61, { line: false });
  const other = new Kite(things, OTHER, 0.23, { line: false });
  const small = new Kite(things, SMALL, 0.8, { line: false });
  // (the kites face the buyers: the stall's front)
  const yaw = s.yaw;
  if (params.get('shot') === '1') console.info(`[map] kite: the market's kites on their pole at ${px.toFixed(1)},${py.toFixed(1)},${pz.toFixed(1)}; the buyer stands at ${spot.x.toFixed(2)},${spot.y.toFixed(2)},${spot.z.toFixed(2)}`);
  const open = (clock: number) => force === 'all' || (force !== 'none' && inWindow(clock, s.open));
  let shown = false;
  return {
    spot,
    shop,
    near(x, y, z, clock) {
      return Math.abs(y - spot.y) < 2 && (x - spot.x) ** 2 + (z - spot.z) ** 2 < REACH * REACH && open(clock);
    },
    frame(fr, sold) {
      const c = fr.camera.position;
      const show = open(fr.clock) && (c.x - px) ** 2 + (c.z - pz) ** 2 < NEAR * NEAR;
      if (!show) {
        if (shown) {
          shown = false;
          things.hide(slots, 5);
          his.hide();
          other.hide();
          small.hide();
        }
        return false;
      }
      shown = true;
      // The pole (bamboo), its cross-piece along the stall's front, a string down to each ek's bow.
      things.put(slots, px, py + POLE.h / 2, pz, 0.07, POLE.h, 0.07);
      things.segment(slots + 1, px, top, pz, ex, top, ez, 0.045);
      const t = fr.t;
      // (a slow sway in the morning air)
      const sw = 0.04 * Math.sin(t * 0.9);
      for (let i = 0; i < 2; i++) {
        const [hx, hz] = hangAt[i];
        const hy = top - HANG[i].down;
        if (i === 0 && sold) {
          // (his own is gone: he has it)
          his.hide();
          things.hide(slots + 2);
          continue;
        }
        things.segment(slots + 2 + i, hx, top, hz, hx, hy + 0.5, hz, 0.012);
        (i ? other : his).hold(hx, hy, hz, yaw, -0.04, (i ? -sw : sw) * 0.8, t, 0.9, 0.15);
      }
      things.hide(slots + 4);
      small.hold(px, top + 0.3, pz, yaw, 0, sw * 0.5, t, 0, 0);
      return true;
    },
    sold(t) {
      SALE.t = t;
      SALE.shop = shop.id;
      SALE.item = 'khleng';
      SALE.x = shop.x;
      SALE.y = shop.y;
      SALE.z = shop.z;
      SALE.n++;
    },
  };
}
