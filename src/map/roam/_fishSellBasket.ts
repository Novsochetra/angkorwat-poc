import { progress } from '../progress';
import { lang } from '../ui/lang';
import { SPECIES_BY_KIND } from './_bookData';
import { FISH, FISH_KINDS, type FishKind } from './_fishKinds';

/**
 * His fish basket (selling his fish: _fishSell.ts): the fish he caught and
 * kept (the catch card's "Keep": _fishing.ts, _fishSellChoice.ts), up to
 * `BASKET_MAX`, what a fish seller pays for each, and their names. No
 * three.js, no page: the boat, the walker's add-on and the cards read it.
 *
 * Fish do not keep: the basket empties when he goes back to the map
 * (_fishSell.ts `setMode`); it is never saved (a new visit starts with an
 * empty basket).
 *
 * URL (checks): `fishbasket=<kind>:<cm>,…` fills it when the page opens
 * (kinds: riel, snakehead, catfish, perch, featherback; the length in cm,
 * or the kind's middle size without one), e.g.
 * `fishbasket=snakehead:42,riel:12`.
 */

/** Fish he can carry in the basket. */
export const BASKET_MAX = 5;

export interface BasketFish {
  kind: FishKind;
  /** Length (cm). */
  cm: number;
}

/**
 * What a fish seller pays for one, by kind (riel: the smallest of the kind's
 * sizes, the biggest; _fishKinds.ts `cm`), more for a bigger one by its
 * weight (as the length cubed). A Tonle Sap landing's prices of 2026
 * (4 000 ៛ ≈ 1 US$), a little under the market's, as a fish seller buys to
 * sell again: a trey riel 500–1 500 ៛ (a few to a hundred grams; she pays
 * at least the smallest note in use), a climbing perch, sold live, 1 000–
 * 3 500 ៛, a striped catfish 4 000–8 000 ៛, a striped snakehead (the
 * grill's favourite) 4 000–15 000 ៛, a clown featherback (made into fish
 * cakes) 5 000–18 000 ៛.
 */
const PAY: Readonly<Record<FishKind, readonly [number, number]>> = {
  riel: [500, 1500],
  perch: [1000, 3500],
  catfish: [4000, 8000],
  snakehead: [4000, 15000],
  featherback: [5000, 18000],
};

/** What a fish seller pays for this fish (riel: to 100 ៛ under 2 000, to 500 ៛ above). */
export function fishPrice(kind: FishKind, cm: number): number {
  const [a, b] = FISH[kind].cm;
  const [lo, hi] = PAY[kind];
  const l = Math.min(b, Math.max(a, cm));
  const w = (l ** 3 - a ** 3) / Math.max(1, b ** 3 - a ** 3);
  const p = lo + (hi - lo) * w;
  return p < 2000 ? Math.max(lo, Math.round(p / 100) * 100) : Math.round(p / 500) * 500;
}

/** A fish's name in the language in use (the nature book's: ត្រីរ៉ស់ / Striped snakehead). */
export const fishName = (kind: FishKind): string => SPECIES_BY_KIND.get(kind)?.name[lang()] ?? FISH[kind].say;

const fish: BasketFish[] = [];
const listeners: (() => void)[] = [];
const changed = () => {
  basket.version++;
  for (const fn of listeners) fn();
};

export const basket = {
  /** Counts up with each change (readers keep the last they showed). */
  version: 0,
  /** What is in it, the first kept first. */
  get fish(): readonly BasketFish[] {
    return fish;
  },
  get n(): number {
    return fish.length;
  },
  get full(): boolean {
    return fish.length >= BASKET_MAX;
  },
  /** What a fish seller pays for all of it (riel). */
  get total(): number {
    let s = 0;
    for (const f of fish) s += fishPrice(f.kind, f.cm);
    return s;
  },
  /** Put a fish in (false: the basket is full). */
  add(kind: FishKind, cm: number): boolean {
    if (fish.length >= BASKET_MAX) return false;
    fish.push({ kind, cm: Math.round(cm) });
    changed();
    return true;
  },
  /** Take fish `i` out (sold), or null. */
  take(i: number): BasketFish | null {
    const f = fish[i];
    if (!f) return null;
    fish.splice(i, 1);
    changed();
    return f;
  },
  /** Empty it (back to the map: fish do not keep; or all sold). */
  clear(): void {
    if (!fish.length) return;
    fish.length = 0;
    changed();
  },
  /** Something changed. */
  onChange(fn: () => void): void {
    listeners.push(fn);
  },
  /** For bug reports and checks: `riel:12,snakehead:42`. */
  spec(): string {
    return fish.map((f) => `${f.kind}:${f.cm}`).join(',');
  },
};

/** He has kept a fish before (saved: `sell.told`): the catch card stops saying that fish do not keep, and where to sell them. */
export const told = {
  get: (): boolean => progress.get('sell.told', false),
  set: (): void => {
    if (!told.get()) progress.set('sell.told', true);
  },
};

/** `fishbasket=<kind>:<cm>,…`: the fish in it (an unknown kind is left out). */
export function parseBasket(spec: string): BasketFish[] {
  const out: BasketFish[] = [];
  for (const part of spec.split(',')) {
    const [k, c] = part.trim().split(':');
    if (!(FISH_KINDS as readonly string[]).includes(k)) {
      if (k) console.warn(`[map] fishbasket: no fish "${k}" (${FISH_KINDS.join(', ')})`);
      continue;
    }
    const kind = k as FishKind;
    const [a, b] = FISH[kind].cm;
    const n = Number(c);
    out.push({ kind, cm: Number.isFinite(n) && n > 0 ? Math.round(n) : Math.round((a + b) / 2) });
    if (out.length >= BASKET_MAX) break;
  }
  return out;
}

// (checks: the URL's basket, filled once when the page opens)
if (typeof location !== 'undefined') {
  const spec = new URLSearchParams(location.search).get('fishbasket');
  if (spec) for (const f of parseBasket(spec)) basket.add(f.kind, f.cm);
}
