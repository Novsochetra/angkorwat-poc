import { KINDS, type PlantKindId } from '../garden/kinds';
import { GARDEN } from '../garden/state';

/**
 * Giving his garden's harvest (his basket, garden/state.ts `GARDEN.basket`),
 * shared by two add-ons so they agree on what he gives and never both offer E
 * for the same person:
 *
 * - **offering** (roam/_offerFruit*.ts, id `offerFruit`): at a shrine or an
 *   altar (roam/_worship.ts `WORSHIP`, the villages' spirit houses and the neak
 *   ta's shrine, his own spirit house) he lays fruit before it (ថ្វាយ), and to
 *   monks (ប្រគេន): the dawn alms round, the blessing monk, a monk he meets;
 * - **sharing** (roam/_shareFruit*.ts, id `shareFruit`): to everyone else, the
 *   neighbours, the elders, his grandmother, the children (ចែក, ឲ្យ).
 *
 * A monk is the offering's (`isMonk`), never the sharing's. What he gives is one
 * of a kind from his basket: the kind shown in the E prompt (`giftKind`: the one
 * he has most of, ties by the kinds' order), `,` / `.` (the add-ons' spare keys)
 * step through his kinds (`stepGift`). No three.js, nothing per frame allocated.
 */

/** Kinds that can be given (all his harvest; the bodhi is never harvested). */
const GIFTABLE = (Object.keys(KINDS) as PlantKindId[]).filter((k) => k !== 'bodhi');

/** The kind he chose with `,` / `.` (null: the one he has most of). */
let chosen: PlantKindId | null = null;

/** Kinds he has in his basket to give, in the kinds' order. */
export function giftKinds(out: PlantKindId[] = []): PlantKindId[] {
  out.length = 0;
  for (const k of GIFTABLE) if (GARDEN.basket(k) > 0) out.push(k);
  return out;
}

/** The kind he would give now, or null (his basket is empty). */
export function giftKind(): PlantKindId | null {
  if (chosen && GARDEN.basket(chosen) > 0) return chosen;
  let best: PlantKindId | null = null;
  let n = 0;
  for (const k of GIFTABLE) {
    const m = GARDEN.basket(k);
    if (m > n) {
      best = k;
      n = m;
    }
  }
  return best;
}

const _kinds: PlantKindId[] = [];

/** `,` (−1) or `.` (+1): the next kind of his basket to give. */
export function stepGift(dir: -1 | 1): PlantKindId | null {
  const ks = giftKinds(_kinds);
  if (!ks.length) return (chosen = null);
  const now = giftKind();
  const i = now ? ks.indexOf(now) : -1;
  chosen = ks[(i + dir + ks.length) % ks.length];
  return chosen;
}

/** Take one of `k` from his basket as he gives it: false when he has none. */
export function takeGift(k: PlantKindId): boolean {
  return GARDEN.takeFromBasket(k, 1);
}

/** A person's look kind (greet.ts `Near.kind`) is a monk's: the offering's, not the sharing's. */
export const isMonk = (kind: string): boolean => kind === 'monk' || kind.startsWith('monk');

/** One giving at a time: the add-on that is giving now, or null. */
export const GIVING = { by: null as null | 'offerFruit' | 'shareFruit', t: 0 };
