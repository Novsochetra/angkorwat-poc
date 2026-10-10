import type { ConsumeKind } from '../shop';
import type { WordKey } from '../ui/lang';

/**
 * What grows in his home garden (the roaming add-on `garden`: roam/_garden*.ts,
 * the guide docs/map-work/addons.md "His home garden"): the twelve plants he can
 * plant near his stilt house, and the bodhi tree he plants at the village pagoda.
 * Everything here is plain data (no three.js): how long each takes to grow, how
 * thirsty it is, when it fruits, how big it stands, what a seedling costs and what
 * its harvest sells for.
 *
 * Time is **game days** (days of the map's cycle: 360 s of play each; the garden's
 * own clock, garden/state.ts, counts them only while the game is played, and sleep
 * moves it on). The year turns in 24 game days (main.ts `SEASON_PER_DAY`), so a
 * month of the year is two game days.
 *
 * Stages (0‥4) are what the models draw (garden/look.ts): 0 the seed or cutting
 * in fresh earth, 1 a sprout, 2 young, 3 nearly grown (a tree: a young tree), 4
 * grown (a crop bears, a tree is full size and bears in its months).
 */

export type PlantKindId =
  | 'eggplant'
  | 'corn'
  | 'pumpkin'
  | 'sugarcane'
  | 'banana'
  | 'papaya'
  | 'guava'
  | 'mango'
  | 'jackfruit'
  | 'durian'
  | 'coconut'
  | 'sugarPalm'
  | 'bodhi';

/** The garden's kinds, in the order the seed card and the shop list them (crops first, the slowest trees last). */
export const GARDEN_KINDS: readonly PlantKindId[] = ['eggplant', 'corn', 'pumpkin', 'sugarcane', 'banana', 'papaya', 'guava', 'mango', 'jackfruit', 'durian', 'coconut', 'sugarPalm'];

/** The bodhi tree is not sold nor planted at home: the pagoda's monk gives it (roam/_bodhi*.ts). */
export const SPECIAL_KINDS: readonly PlantKindId[] = ['bodhi'];

export type Stage = 0 | 1 | 2 | 3 | 4;
export const GROWN: Stage = 4;

/**
 * How he takes the harvest (the poses: character/gardenWork.ts; garden/actions.ts):
 * - `low`: picks it bending over a low plant (eggplant), or off the ground where it lies on its vine (pumpkin);
 * - `reach`: standing, from a stalk or a branch at hand height, at most ≈ 1.75 m (corn, guava, a jackfruit on the trunk);
 * - `cut`: with his knife (the sugarcane's canes, the banana's bunch);
 * - `pole`: with a long bamboo picking pole and its basket, up in the crown (mango, the papaya's fruit under its crown);
 * - `ground`: ripe fruit falls by itself; he picks it up from under the tree (durian, coconut, sugar palm).
 */
export type PickStyle = 'low' | 'reach' | 'cut' | 'pole' | 'ground';

/** What he plants: a seed, a cutting (sugarcane), a pup (banana's sucker), or a seedling in its black nursery bag. */
export type PlantForm = 'seed' | 'cutting' | 'pup' | 'seedling';

export interface PlantKind {
  readonly id: PlantKindId;
  /** Its name (ui/lang.ts `garden…`) and what the seed card says of it. */
  readonly name: WordKey;
  readonly note: WordKey;
  /** A crop (a bed of dug earth; it can be planted close) or a tree (it needs room, and blocks the way once it is big). */
  readonly size: 'crop' | 'tree';
  readonly form: PlantForm;
  /** Game days of watered growth from planting to grown (stage 4). */
  readonly growDays: number;
  /**
   * Where the stages begin, as parts of `growDays` (stage 1, 2, 3; stage 4 at 1). A tree spends long as a young
   * tree; a crop comes up quickly.
   */
  readonly stageAt: readonly [number, number, number];
  /** Game days a full watering lasts (the earth dries from wet to dry). */
  readonly thirst: number;
  /** Game days it can stand dry before it dies (only before it is grown: a grown plant or tree only droops and waits). */
  readonly dieAfter: number;
  /** Harvest. */
  readonly fruit: {
    /** Fruits only in these months (1‥12, both included; `from > to` goes round the new year), or all year. */
    readonly months: readonly [from: number, to: number] | 'all';
    /** Game days from grown (or from the last picking) until it is ripe again. */
    readonly ripenDays: number;
    /** `once`: the plant is done after the harvest (it leaves its bed empty); `again`: it bears again. */
    readonly harvest: 'once' | 'again';
    /** How many he takes at one harvest (from‥to). */
    readonly count: readonly [number, number];
    readonly pick: PickStyle;
    /** Its name for the harvest (one of it: "mango", "ear of corn"; ui/lang.ts). */
    readonly item: WordKey;
    /** Eaten as it is (key 6 from his bag: shop.ts `ConsumeKind`, and the colours of what he holds), or null (sold only). */
    readonly eat: { readonly consume: ConsumeKind; readonly colors: readonly number[] } | null;
    /** What the nursery pays for one (riel). */
    readonly sell: number;
  };
  /** At the nursery: what one costs (riel, a real Cambodian price), or null (not sold). */
  readonly price: number | null;
  /** Room it needs round it (m, from its middle): nothing else is planted nearer than the larger of two plants' rooms. */
  readonly room: number;
  /** Grown, in metres: its height and the radius of its leaves or crown (for the camera, the walk map's trunk, the far view). */
  readonly height: number;
  readonly spread: number;
  /** A grown tree's trunk (radius, m): the walk map's solid round it (0: he walks through it). Young trees from stage 3 have half of it. */
  readonly trunk: number;
}

const K = (k: PlantKind): PlantKind => k;

/**
 * The plants. Grow times are play: a crop in two or three game days (12–18 minutes of play), a banana or papaya in
 * four, a mango in eight, the durian in fourteen, the sugar palm in a whole game year (24 days: a tree for keeps).
 * Prices: a nursery's on the road out of Siem Reap (2026: a packet of seed ≈ 1,000 ៛, a grafted mango seedling
 * ≈ 8,000–10,000 ៛, a durian seedling ≈ 15,000–25,000 ៛), and what a market seller pays for a piece.
 */
export const KINDS: Record<PlantKindId, PlantKind> = {
  eggplant: K({
    id: 'eggplant', name: 'gardenEggplant', note: 'gardenEggplantNote', size: 'crop', form: 'seed',
    growDays: 1.5, stageAt: [0.12, 0.4, 0.75], thirst: 0.8, dieAfter: 0.9,
    fruit: { months: 'all', ripenDays: 0.5, harvest: 'again', count: [3, 5], pick: 'low', item: 'gardenEggplantItem', eat: null, sell: 300 },
    price: 1000, room: 0.7, height: 0.9, spread: 0.45, trunk: 0,
  }),
  corn: K({
    id: 'corn', name: 'gardenCorn', note: 'gardenCornNote', size: 'crop', form: 'seed',
    growDays: 2, stageAt: [0.1, 0.35, 0.7], thirst: 0.8, dieAfter: 0.9,
    fruit: { months: 'all', ripenDays: 0, harvest: 'once', count: [2, 3], pick: 'reach', item: 'gardenCornItem', eat: null, sell: 500 },
    price: 1000, room: 0.55, height: 2.3, spread: 0.45, trunk: 0,
  }),
  pumpkin: K({
    id: 'pumpkin', name: 'gardenPumpkin', note: 'gardenPumpkinNote', size: 'crop', form: 'seed',
    growDays: 2.5, stageAt: [0.1, 0.35, 0.7], thirst: 0.9, dieAfter: 1,
    fruit: { months: 'all', ripenDays: 1, harvest: 'again', count: [1, 2], pick: 'low', item: 'gardenPumpkinItem', eat: null, sell: 3000 },
    price: 1000, room: 1.6, height: 0.6, spread: 1.6, trunk: 0,
  }),
  sugarcane: K({
    id: 'sugarcane', name: 'gardenSugarcane', note: 'gardenSugarcaneNote', size: 'crop', form: 'cutting',
    growDays: 4, stageAt: [0.08, 0.3, 0.65], thirst: 1.2, dieAfter: 1.2,
    fruit: { months: 'all', ripenDays: 2, harvest: 'again', count: [2, 3], pick: 'cut', item: 'gardenSugarcaneItem', eat: { consume: 'skewer', colors: [0xe8dca0, 0x8a5a8a, 0x6a9a3a] }, sell: 1000 },
    price: 1500, room: 0.8, height: 3.4, spread: 0.7, trunk: 0,
  }),
  banana: K({
    id: 'banana', name: 'gardenBanana', note: 'gardenBananaNote', size: 'tree', form: 'pup',
    growDays: 4, stageAt: [0.08, 0.3, 0.65], thirst: 1.2, dieAfter: 1.2,
    fruit: { months: 'all', ripenDays: 2, harvest: 'again', count: [1, 1], pick: 'cut', item: 'gardenBananaItem', eat: { consume: 'fruit', colors: [0xf2d24a, 0xe8c23a, 0x6a5a2a] }, sell: 4000 },
    price: 3000, room: 1.6, height: 4.2, spread: 1.8, trunk: 0.18,
  }),
  papaya: K({
    id: 'papaya', name: 'gardenPapaya', note: 'gardenPapayaNote', size: 'tree', form: 'seedling',
    growDays: 4, stageAt: [0.08, 0.3, 0.65], thirst: 1.2, dieAfter: 1.2,
    fruit: { months: 'all', ripenDays: 1, harvest: 'again', count: [1, 2], pick: 'pole', item: 'gardenPapayaItem', eat: { consume: 'fruit', colors: [0xf08a2a, 0xe8a030, 0x7aa040] }, sell: 2500 },
    price: 2000, room: 1.4, height: 4, spread: 1.2, trunk: 0.12,
  }),
  guava: K({
    id: 'guava', name: 'gardenGuava', note: 'gardenGuavaNote', size: 'tree', form: 'seedling',
    growDays: 6, stageAt: [0.06, 0.25, 0.6], thirst: 1.4, dieAfter: 1.4,
    fruit: { months: 'all', ripenDays: 1.5, harvest: 'again', count: [3, 5], pick: 'reach', item: 'gardenGuavaItem', eat: { consume: 'fruit', colors: [0xa8c860, 0xc8d878, 0xf0e6c8] }, sell: 500 },
    price: 4000, room: 2.2, height: 4.5, spread: 2.2, trunk: 0.14,
  }),
  mango: K({
    id: 'mango', name: 'gardenMango', note: 'gardenMangoNote', size: 'tree', form: 'seedling',
    growDays: 8, stageAt: [0.05, 0.22, 0.55], thirst: 1.5, dieAfter: 1.5,
    fruit: { months: [3, 5], ripenDays: 1.5, harvest: 'again', count: [4, 6], pick: 'pole', item: 'gardenMangoItem', eat: { consume: 'fruit', colors: [0xf2c23a, 0xe8a830, 0x9ab43a] }, sell: 1000 },
    price: 8000, room: 3.2, height: 7, spread: 3.2, trunk: 0.3,
  }),
  jackfruit: K({
    id: 'jackfruit', name: 'gardenJackfruit', note: 'gardenJackfruitNote', size: 'tree', form: 'seedling',
    growDays: 10, stageAt: [0.05, 0.2, 0.55], thirst: 1.5, dieAfter: 1.5,
    fruit: { months: [3, 8], ripenDays: 2, harvest: 'again', count: [1, 2], pick: 'reach', item: 'gardenJackfruitItem', eat: { consume: 'fruit', colors: [0xf2c84a, 0xe8b838, 0x9aa848] }, sell: 8000 },
    price: 8000, room: 3.4, height: 8, spread: 3.4, trunk: 0.32,
  }),
  durian: K({
    id: 'durian', name: 'gardenDurian', note: 'gardenDurianNote', size: 'tree', form: 'seedling',
    growDays: 14, stageAt: [0.04, 0.18, 0.5], thirst: 1.5, dieAfter: 1.5,
    fruit: { months: [5, 8], ripenDays: 2, harvest: 'again', count: [1, 2], pick: 'ground', item: 'gardenDurianItem', eat: { consume: 'fruit', colors: [0xf0dc8a, 0xe8d070, 0x8a9a3a] }, sell: 15000 },
    price: 20000, room: 3.8, height: 11, spread: 3.6, trunk: 0.36,
  }),
  coconut: K({
    id: 'coconut', name: 'gardenCoconut', note: 'gardenCoconutNote', size: 'tree', form: 'seedling',
    growDays: 12, stageAt: [0.05, 0.2, 0.5], thirst: 1.6, dieAfter: 1.6,
    fruit: { months: 'all', ripenDays: 2, harvest: 'again', count: [1, 2], pick: 'ground', item: 'gardenCoconutItem', eat: { consume: 'coconut', colors: [0x6a9a3a, 0xece2c2, 0xf4f0e0] }, sell: 2000 },
    price: 5000, room: 2.6, height: 11, spread: 3.2, trunk: 0.22,
  }),
  sugarPalm: K({
    id: 'sugarPalm', name: 'gardenSugarPalm', note: 'gardenSugarPalmNote', size: 'tree', form: 'seedling',
    growDays: 24, stageAt: [0.04, 0.15, 0.45], thirst: 1.8, dieAfter: 1.8,
    fruit: { months: [12, 5], ripenDays: 2, harvest: 'again', count: [2, 3], pick: 'ground', item: 'gardenSugarPalmItem', eat: { consume: 'fruit', colors: [0xf4f0d8, 0x2a2420, 0x3a3028] }, sell: 1000 },
    price: 4000, room: 2.8, height: 13, spread: 3.2, trunk: 0.26,
  }),
  bodhi: K({
    id: 'bodhi', name: 'gardenBodhi', note: 'gardenBodhiNote', size: 'tree', form: 'seedling',
    growDays: 24, stageAt: [0.04, 0.15, 0.45], thirst: 1.8, dieAfter: 1.8,
    fruit: { months: 'all', ripenDays: 0, harvest: 'again', count: [0, 0], pick: 'reach', item: 'gardenBodhi', eat: null, sell: 0 },
    price: null, room: 5, height: 14, spread: 6, trunk: 0.45,
  }),
};

/** The stage at `age` game days of watered growth. */
export function stageOf(k: PlantKind, age: number): Stage {
  const p = age / k.growDays;
  if (p >= 1) return 4;
  if (p >= k.stageAt[2]) return 3;
  if (p >= k.stageAt[1]) return 2;
  if (p >= k.stageAt[0]) return 1;
  return 0;
}

/** The month of the year (1‥12, with its fraction: 3.5 is mid-March) at `season` (0 = 14 April, Khmer New Year). */
export function monthOf(season: number): number {
  // 14 April is 3 months and 13 days into the year: month 4 + 13/30
  const m = (3 + 13 / 30 + (((season % 1) + 1) % 1) * 12) % 12;
  return m + 1;
}

/** It fruits at `season` (its months, or all year). */
export function inFruitMonths(k: PlantKind, season: number): boolean {
  const ms = k.fruit.months;
  if (ms === 'all') return true;
  const m = Math.floor(monthOf(season));
  const [a, b] = ms;
  return a <= b ? m >= a && m <= b : m >= a || m <= b;
}

/** A tree for the rules (it needs room; its trunk blocks the way). */
export const isTree = (k: PlantKind): boolean => k.size === 'tree';

/** The walk map's trunk radius at a stage (m; 0: walk through). */
export function trunkAt(k: PlantKind, stage: Stage): number {
  if (k.trunk <= 0 || stage < 3) return 0;
  return stage === 4 ? k.trunk : k.trunk * 0.5;
}
