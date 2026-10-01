import { BM_STALLS, frontXZ, stallOpen } from '../hamlet/_bhMarketPlan';
import { frontOf, inWindow, MK, stallById, stallPoint } from '../hamlet/_mkPlan';
import type { HeightField } from '../heightfield';
import type { WordKey } from '../ui/lang';
import { boatBuyer, FV_BOATS, FV_STALLS } from '../village/_fvPlan';
import { GROUND, JETTY } from '../village/_spots';

/**
 * Who buys his fish (selling his fish: _fishSell.ts): the people who sell
 * fish, at the places' own stalls (no three.js; read from the places'
 * plans, so they stand where the sellers are built):
 *
 * - the floating village by the Tonle Sap (village/_fvPlan.ts): the fish
 *   seller at the landing by the jetty's foot (straight off the boats,
 *   squatting under her umbrella, before dawn to mid-morning), the woman in
 *   the fish boat tied along the jetty (the buyer stands on the jetty, dawn
 *   to mid-morning), and the grilled fish man across the lane, at the side
 *   table where his fish wait (from midday into the evening: a grill wants
 *   snakehead — he buys any);
 * - the morning market of the sugar-palm village (hamlet/_mkPlan.ts): the
 *   fish stall in the covered hall and the fish seller on the ground across
 *   the walk from it (before dawn to late morning);
 * - the hamlet behind Angkor Wat (hamlet/_bhMarketPlan.ts): the fish seller
 *   on the ground in the big tree's shade (dawn to mid-morning).
 *
 * All are in the roaming area (on foot; the jetty's from the land or from a
 * boat stepped up onto it). Each is "there" over her stall's own hours (the
 * places' `fvopen=`, `mkopen=`, `bhopen=` hold them all open or shut, as
 * the places do); away, the prompt says when to come back (the morning, or
 * midday for the grill).
 */
export interface FishBuyer {
  /** Unique (`village-fish`, `village-boat-fish`, `village-grill`, `market-fish`, `market-fishG`, `back-fish`). */
  id: string;
  /** Who: the card's title, the away words. */
  name: WordKey;
  /** Where he stands to sell (m; `y` the floor there), how near he must be (m), and the way he faces her. */
  x: number;
  y: number;
  z: number;
  r: number;
  facing: number;
  /** She is there at this time of day (`clock`: 0 golden afternoon, 0.25 dusk, 0.5 night, 0.75 dawn). */
  open(clock: number): boolean;
  /** When she comes back, away. */
  back: 'sellAway' | 'sellAwayNoon';
}

let list: FishBuyer[] | null = null;

/** Every fish buyer (made once). */
export function fishBuyers(field: HeightField): readonly FishBuyer[] {
  return (list ??= make(field));
}

function make(field: HeightField): FishBuyer[] {
  const q = new URLSearchParams(location.search);
  const held = (key: string, w: (c: number) => boolean) => {
    const f = q.get(key);
    return (c: number) => (f === 'all' ? true : f === 'none' ? false : w(c));
  };
  const out: FishBuyer[] = [];
  // ── The floating village (its floor: the village's ground; the jetty's planks) ──
  const fv = FV_STALLS.find((s) => s.id === 'fish');
  if (fv) {
    const x = fv.x + Math.sin(fv.yaw) * (fv.d / 2 + 0.9);
    const z = fv.z + Math.cos(fv.yaw) * (fv.d / 2 + 0.9);
    out.push({ id: 'village-fish', name: 'sellFishSeller', x, y: GROUND, z, r: 1.6, facing: fv.yaw + Math.PI, open: held('fvopen', (c) => inWindow(c, fv.open)), back: 'sellAway' });
  }
  const boat = FV_BOATS.find((b) => b.id === 'boat-fish');
  if (boat) {
    const b = boatBuyer(boat);
    out.push({ id: 'village-boat-fish', name: 'sellFishBoat', x: b.x, y: JETTY.y, z: b.z, r: 1.5, facing: b.yaw, open: held('fvopen', (c) => inWindow(c, boat.open)), back: 'sellAway' });
  }
  const grill = FV_STALLS.find((s) => s.id === 'grill');
  if (grill) {
    // (beside his side table, out past it: the stall's +x side; facing the table and him behind it)
    const c = Math.cos(grill.yaw);
    const n = Math.sin(grill.yaw);
    const lx = grill.w / 2 + 1.3;
    const lz = -0.2;
    const x = grill.x + lx * c + lz * n;
    const z = grill.z - lx * n + lz * c;
    out.push({ id: 'village-grill', name: 'sellGrill', x, y: GROUND, z, r: 1.3, facing: Math.atan2(-c, n), open: held('fvopen', (cl) => inWindow(cl, grill.open)), back: 'sellAwayNoon' });
  }
  // ── The morning market (in front of each, a little further out than its own buyers stand: the roaming explorer is big) ──
  for (const [id, name] of [
    ['fish', 'sellFishStall'],
    ['fishG', 'sellFishSeller'],
  ] as const) {
    const s = stallById(id);
    if (!s) continue;
    const f = frontOf(s, 0);
    const [ox, oz] = stallPoint(s, 0, s.d / 2 + 1);
    const [fx, fz] = stallPoint(s, 0, s.d / 2);
    const k = 0.35 / Math.hypot(ox - fx, oz - fz);
    const x = MK.x + f.x + (ox - fx) * k;
    const z = MK.z + f.z + (oz - fz) * k;
    out.push({ id: `market-${id}`, name, x, y: field.heightAt(x, z), z, r: 1.3, facing: f.yaw, open: held('mkopen', (c) => inWindow(c, s.open)), back: 'sellAway' });
  }
  // ── The hamlet behind Angkor Wat ──
  const bm = BM_STALLS.find((s) => s.id === 'fish');
  if (bm) {
    const f = frontXZ(bm);
    const x = f.x - Math.sin(f.yaw) * 0.3;
    const z = f.z - Math.cos(f.yaw) * 0.3;
    out.push({ id: 'back-fish', name: 'sellFishSeller', x, y: field.heightAt(x, z), z, r: 1.5, facing: f.yaw, open: held('bhopen', (c) => stallOpen(bm, c)), back: 'sellAway' });
  }
  return out;
}

/** The fish buyer whose spot (x, y, z) is in reach (the nearest), or null. */
export function buyerNear(field: HeightField, x: number, y: number, z: number): FishBuyer | null {
  let best: FishBuyer | null = null;
  let bd = Infinity;
  for (const b of fishBuyers(field)) {
    if (Math.abs(b.y - y) > 2.5) continue;
    const d = (b.x - x) ** 2 + (b.z - z) ** 2;
    if (d > b.r * b.r || d >= bd) continue;
    best = b;
    bd = d;
  }
  return best;
}
