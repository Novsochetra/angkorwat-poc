import { HAT_BANDS, KRAMAS, SHIRTS, TROUSERS, type ExplorerClothes, type HatTones, type KramaLook, type ShirtTones, type TrouserTones } from '../../character/clothes';
import { progress } from '../progress';
import type { Lang } from '../types';
import { lang } from '../ui/lang';

/**
 * Clothes from the market: what the krama stall sells (real riel prices of a
 * Cambodian market, 2026: 4 000 ៛ ≈ 1 US$; a day's pocket money is 20 000 ៛),
 * what he owns and what he wears (kept between visits in map/progress.ts:
 * `wear.owned`, `wear.on`). The colours are the character's (character/clothes.ts):
 * the explorer wears them over his own (`AngkorExplorer.setClothes`).
 *
 * One of each kind at a time: a krama, a shirt, trousers, the hat's band. No
 * three.js, nothing per frame.
 */

export type WearKind = 'krama' | 'shirt' | 'trousers' | 'hat';
/** The kinds in the card's order (its tabs). */
export const WEAR_KINDS: readonly WearKind[] = ['krama', 'shirt', 'trousers', 'hat'];

interface Tones {
  krama: KramaLook;
  shirt: ShirtTones;
  trousers: TrouserTones;
  hat: HatTones;
}

export interface WearItem<K extends WearKind = WearKind> {
  /** Unique (the URL's `wear=`, the saved state). */
  readonly id: string;
  readonly kind: K;
  readonly name: Record<Lang, string>;
  /** Riel. */
  readonly price: number;
  readonly look: Tones[K];
}

const item = <K extends WearKind>(id: string, kind: K, km: string, en: string, price: number, look: Tones[K]): WearItem<K> => ({ id, kind, name: { km, en }, price, look });

/** What the krama stall sells, by kind: cotton kramas (a silk one), linen shirts, loose fisherman trousers, a palm-leaf hat. */
export const WEAR_ITEMS: readonly WearItem[] = [
  item('kramaRedWhite', 'krama', 'ក្រមាឆូតក្រហមស', 'Red and white check krama', 5000, KRAMAS.redWhite),
  item('kramaBlueWhite', 'krama', 'ក្រមាឆូតខៀវស', 'Blue and white check krama', 5000, KRAMAS.blueWhite),
  item('kramaGreen', 'krama', 'ក្រមាពណ៌បៃតង', 'Green krama', 4000, KRAMAS.green),
  item('kramaPurple', 'krama', 'ក្រមាសូត្រពណ៌ស្វាយ', 'Purple silk krama', 8000, KRAMAS.purple),
  item('kramaOrange', 'krama', 'ក្រមាពណ៌ទឹកក្រូច', 'Orange krama', 4000, KRAMAS.orange),
  item('kramaRed', 'krama', 'ក្រមាក្រហមបុរាណ', 'Classic red krama', 3000, KRAMAS.red),
  item('shirtWhite', 'shirt', 'អាវដៃខ្លីពណ៌ស', 'White linen shirt', 15000, SHIRTS.white),
  item('shirtIndigo', 'shirt', 'អាវដៃខ្លីពណ៌ខៀវចាស់', 'Indigo linen shirt', 15000, SHIRTS.indigo),
  item('shirtSand', 'shirt', 'អាវដៃខ្លីពណ៌ខ្សាច់', 'Sand linen shirt', 15000, SHIRTS.sand),
  item('trousersNavy', 'trousers', 'ខោធូរពណ៌ខៀវទឹកប្រៃ', 'Navy fisherman trousers', 12000, TROUSERS.navy),
  item('trousersBlack', 'trousers', 'ខោធូរពណ៌ខ្មៅ', 'Black fisherman trousers', 12000, TROUSERS.black),
  item('hatBlue', 'hat', 'មួកស្លឹកត្នោត ក្រណាត់ខៀវ', 'Palm-leaf hat, blue band', 6000, HAT_BANDS.blue),
];

export const wearItem = (id: string): WearItem | null => WEAR_ITEMS.find((i) => i.id === id) ?? null;
export const itemsOf = (kind: WearKind): WearItem[] => WEAR_ITEMS.filter((i) => i.kind === kind);
/** An item's name in the language in use. */
export const wearName = (i: WearItem): string => i.name[lang()];

const isIds = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/**
 * What he owns and wears. Kept between visits (`wear.owned`, `wear.on`: item
 * ids), but not in shots, nor on a page whose URL dresses him (`wear=`,
 * `wearown=`: checks).
 */
export class Wardrobe {
  readonly owned = new Set<string>();
  /** What he wears, by kind (none: his own). */
  readonly on = new Map<WearKind, WearItem>();
  private keep: boolean;
  private readonly listeners: (() => void)[] = [];

  constructor(params: URLSearchParams) {
    this.keep = progress.saving && !params.has('wear') && !params.has('wearown');
    if (!this.keep) return;
    for (const id of progress.get('wear.owned', [] as string[], isIds)) if (wearItem(id)) this.owned.add(id);
    for (const id of progress.get('wear.on', [] as string[], isIds)) {
      const it = wearItem(id);
      if (it && this.owned.has(id)) this.on.set(it.kind, it);
    }
  }

  /** Kept between visits (false in shots and on a check's page). */
  get saving(): boolean {
    return this.keep;
  }

  /** Something changed (the card, the explorer menu show it again). */
  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  has(id: string): boolean {
    return this.owned.has(id);
  }

  wearing(id: string): boolean {
    const it = wearItem(id);
    return !!it && this.on.get(it.kind)?.id === id;
  }

  /** He owns it now (bought). */
  add(it: WearItem): void {
    if (this.owned.has(it.id)) return;
    this.owned.add(it.id);
    this.changed();
  }

  /** Put it on (null: take off what he wears of `kind`). */
  wear(kind: WearKind, it: WearItem | null): void {
    if (it) this.on.set(kind, it);
    else this.on.delete(kind);
    this.changed();
  }

  /** His own clothes again (what he owns stays his). */
  original(): void {
    if (!this.on.size) return;
    this.on.clear();
    this.changed();
  }

  /** The tones for the explorer (`AngkorExplorer.setClothes`). */
  clothes(): ExplorerClothes {
    const of = <K extends WearKind>(k: K) => (this.on.get(k)?.look as Tones[K] | undefined) ?? null;
    return { krama: of('krama'), shirt: of('shirt'), trousers: of('trousers'), hat: of('hat') };
  }

  /** Checks: own (and, with `wear`, wear) these ids; unknown ones are named in the console. */
  fromIds(ids: string[], wear: boolean): void {
    for (const id of ids) {
      const it = wearItem(id);
      if (!it) {
        console.warn(`[map] wear: no "${id}" (${WEAR_ITEMS.map((i) => i.id).join(', ')}, or all)`);
        continue;
      }
      this.owned.add(id);
      if (wear) this.on.set(it.kind, it);
    }
    this.changed();
  }

  private changed(): void {
    if (this.keep) {
      progress.set('wear.owned', [...this.owned]);
      progress.set('wear.on', [...this.on.values()].map((i) => i.id));
    }
    for (const fn of this.listeners) fn();
  }
}
