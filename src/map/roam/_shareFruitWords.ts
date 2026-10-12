import { hash3 } from '../../voxel/random';
import { GARDEN_KINDS, KINDS, type PlantKindId } from '../garden/kinds';
import { GARDEN } from '../garden/state';
import { villageAt, type ShareBack, type ShareWho } from '../share';
import type { Lang } from '../types';
import { lang, t, type WordKey } from '../ui/lang';
import type { Kept } from './_shopPurse';

/**
 * What they say and what they give back when he shares his fruit
 * (roam/_shareFruit.ts): Khmer custom first. A grown-up of the village thanks
 * him with a sampeah ("អរគុណច្រើន!"), a seller asks him to come again, an
 * elder calls him "ក្មួយ" / "ចៅ" and, as elders do, blesses him; a child calls
 * him "បង". What comes back is a gift too, never money: a sweet of the place
 * (a num ansom of sticky rice in banana leaf, a krolan of sticky rice roasted
 * in bamboo, a cake of the sugar-palm village's own palm sugar) for his bag,
 * a few seeds of a crop he has none of, an elder's blessing, or just a smile.
 *
 * Picked by a hash of who, the day and how many he has given (the same in a
 * shot every time). No three.js.
 */

/** The fruit's colours on the people model (their hands): its body, its stalk or shoulder. */
export const FRUIT_COLORS: Record<PlantKindId, readonly [number, number]> = {
  eggplant: [0xdfeec4, 0x4f8a3a],
  corn: [0xc2c27a, 0x6a4428],
  pumpkin: [0x7a9458, 0x8a7a52],
  sugarcane: [0x7a3448, 0x6a9a3a],
  banana: [0xe2c63e, 0x7a8a42],
  papaya: [0xe8a832, 0x9aa83a],
  guava: [0xdedc7c, 0x6a7a3a],
  mango: [0xf2c23a, 0x9ab43a],
  jackfruit: [0xa8a04a, 0x5a5a30],
  durian: [0xae9a42, 0x6a5a3a],
  coconut: [0x7b5b37, 0x6a5a32],
  sugarPalm: [0x2c2228, 0x6e6a3a],
  bodhi: [0x6a9a3a, 0x4a6a2a],
};

/** The sweets they may give back (his bag: purse `keep`), and how each looks held out (the people's parcel: its wrap, its tie). */
const SNACKS = {
  ansom: { kept: { shop: 'share', id: 'numAnsom', name: { km: 'នំអន្សម', en: 'Num ansom' }, consume: 'sweet', colors: [0x5a9a3a, 0xf4f0e0] } as Kept, word: 'shareBackAnsom' as WordKey, wrap: 0x5a9a3a, tie: 0xe8e0c8 },
  krolan: { kept: { shop: 'share', id: 'krolan', name: { km: 'ក្រឡាន', en: 'Krolan (sticky rice in bamboo)' }, consume: 'sweet', colors: [0xb08a4a, 0xf4ecd8] } as Kept, word: 'shareBackKrolan' as WordKey, wrap: 0xb08a4a, tie: 0x6a8a3a },
  sugar: { kept: { shop: 'share', id: 'skorThnot', name: { km: 'ស្ករត្នោត', en: 'Palm sugar cake' }, consume: 'sweet', colors: [0xc89a52, 0xe8d0a0] } as Kept, word: 'shareBackSugar' as WordKey, wrap: 0xc89a52, tie: 0xa8c070 },
} as const;
export type SnackId = keyof typeof SNACKS;

/** One giving's words and what comes back. */
export interface SharePlan {
  /** Their thanks (or "I have one already"). */
  word: WordKey;
  back: ShareBack;
  /** With what they give back: their words. */
  word2: WordKey | '';
  snack: SnackId | null;
  /** Seeds of this kind, this many. */
  seeds: PlantKindId | null;
  seedN: number;
  /** The parcel's colours (the snack's wrap and tie, the seeds' paper). */
  wrap: number;
  tie: number;
}

const plan: SharePlan = { word: 'shareThanks1', back: 'none', word2: '', snack: null, seeds: null, seedN: 0, wrap: 0, tie: 0 };

/** The crops that come as seeds, he has none of (none sown nor in his bag of seeds), in the kinds' order. */
function lacking(): PlantKindId | null {
  const sown = GARDEN.plants;
  for (const k of GARDEN_KINDS) {
    if (KINDS[k].form !== 'seed' || GARDEN.seeds(k) > 0) continue;
    if (sown.some((p) => p.kind === k)) continue;
    return k;
  }
  return null;
}

/**
 * What they say and give for this giving (`n`: how many he has given in all; `bagFull`: no room for a sweet).
 * `force`: a check's own gift back (`shareback=`).
 */
export function planShare(who: ShareWho, day: number, n: number, bagFull: boolean, force: ShareBack | null = null): SharePlan {
  const r1 = hash3(who.id, day, n, 811);
  const r2 = hash3(who.id, day, n, 812);
  const p = plan;
  p.back = 'none';
  p.word2 = '';
  p.snack = null;
  p.seeds = null;
  p.seedN = 0;
  // Their thanks: a child, the grandmother, an elder, a seller, a grown-up.
  if (who.kid) p.word = r1 < 0.4 ? 'shareThanksKid1' : r1 < 0.7 ? 'shareThanksKid2' : 'shareThanksKid3';
  else if (who.gran) p.word = 'shareThanksGran';
  else if (who.elder) p.word = r1 < 0.5 ? 'shareThanksElder1' : 'shareThanksElder2';
  else if (who.kind === 'vendor') p.word = 'shareThanksSeller';
  else p.word = r1 < 0.4 ? 'shareThanks1' : r1 < 0.75 ? 'shareThanks2' : 'shareThanks3';
  // What comes back (children: their joy is enough).
  if (who.kid) return p;
  let back: ShareBack;
  if (force) back = force;
  else if (who.elder || who.gran) back = r2 < 0.4 ? 'bless' : r2 < 0.7 ? 'snack' : r2 < 0.85 ? 'seeds' : 'none';
  else back = r2 < 0.35 ? 'snack' : r2 < 0.55 ? 'seeds' : 'none';
  if (back === 'snack' && bagFull) back = who.elder || who.gran ? 'bless' : 'none';
  if (back === 'seeds') {
    const k = lacking();
    if (!k) back = who.elder || who.gran ? 'bless' : 'none';
    else {
      p.seeds = k;
      p.seedN = 2 + Math.floor(hash3(who.id, day, n, 813) * 2);
      p.word2 = 'shareBackSeeds';
      p.wrap = 0xd8c8a0;
      p.tie = 0x8a6a3a;
    }
  }
  if (back === 'snack') {
    // (the sugar-palm village's own palm sugar there; sticky rice elsewhere)
    const v = villageAt(who.x, who.z);
    const id: SnackId = v === 'east' && r1 < 0.6 ? 'sugar' : hash3(who.id, day, n, 814) < 0.6 ? 'ansom' : 'krolan';
    const s = SNACKS[id];
    p.snack = id;
    p.word2 = s.word;
    p.wrap = s.wrap;
    p.tie = s.tie;
  }
  if (back === 'bless') p.word2 = hash3(who.id, day, n, 815) < 0.5 ? 'shareBless1' : 'shareBless2';
  p.back = back;
  return p;
}

/** The sweet for his bag. */
export const snackKept = (id: SnackId): Kept => ({ ...SNACKS[id].kept, name: { ...SNACKS[id].kept.name } });

/** His thanks words when they have one already. */
export function againWord(who: ShareWho): WordKey {
  return who.kid ? 'shareHaveKid' : who.elder || who.gran ? 'shareHaveElder' : 'shareHave';
}

/** The fruit's name for the words (garden/kinds.ts `fruit.item`: "ផ្លែស្វាយ" / "mango"). */
export const itemName = (k: PlantKindId): string => t(KINDS[k].fruit.item);

/** The same with "a" or "an" in English (the Khmer has none): "a mango", "an ear of corn". */
export function anItem(k: PlantKindId, l: Lang = lang()): string {
  const s = itemName(k);
  if (l !== 'en') return s;
  return `${/^[aeiou]/i.test(s) ? 'an' : 'a'} ${s}`;
}

/** The prompt's words for whom: the children, the grandmother, an elder, anyone else. */
export function promptWord(who: ShareWho): WordKey {
  return who.kid ? 'shareGiveKids' : who.gran ? 'shareGiveGran' : who.elder ? 'shareGiveElder' : 'shareGive';
}
