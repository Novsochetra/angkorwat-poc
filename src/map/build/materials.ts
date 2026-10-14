import { progress } from '../progress';
import { lang, num, t, type WordKey } from '../ui/lang';

/**
 * Building materials (ticket AWP-9, the gathering add-on roam/_gather.ts): what
 * he gathers round the map and builds with at home. No three.js: the build
 * pieces (build/pieces.ts `cost`), the build add-on (roam/_build.ts), the
 * gathering add-on and its sources (build/gather.ts) read the same numbers.
 *
 * - **Materials** (`MATERIALS`): bamboo ឫស្សី, logs ឈើ, palm-leaf thatch
 *   ស្លឹកត្នោត, clay ដីឥដ្ឋ. Each has a weight (what it counts against his
 *   carry limit: a log is heavy), its riel price (what one costs when he lacks
 *   it at build time: gathering is the free way, money the shortcut), how it is
 *   gathered (`action`: the knife's chop or the hoe's dig) and its colour (the
 *   chips that fly as he hits). A new material: one line in `MaterialId`, one in
 *   `MATERIALS`, its words in ui/lang.ts (`mat…`), its icon in
 *   roam/_gatherIcons.ts, its sounds in audio/_gather.ts.
 * - **The bag** (`BAG`): what he carries on foot, up to `CARRY_LIMIT` in weight
 *   (`BAG.load()`, `BAG.room(m)`: how many more of `m` fit).
 * - **The home store** (`STORE`): what he has put down at home (under his
 *   stilt house; the gathering add-on unloads his bag there as he comes home,
 *   the ox cart will too, AWP-14). No limit.
 * - **Building** takes from the bag first, then the store (`useMaterials`);
 *   what is missing is bought (`missingOf`, `rielOf`).
 *
 * Saved (progress.ts): `gather.bag`, `gather.store` (`{ bamboo: 4, … }`); an old
 * or broken value reads as empty. Shots and `progress=0` save nothing.
 */

export type MaterialId = 'bamboo' | 'log' | 'thatch' | 'clay';

/** How a material is gathered: the knife's chop (bamboo, a palm leaf, a branch), the hoe's dig (clay). */
export type GatherAction = 'chop' | 'dig';

export interface MaterialSpec {
  readonly id: MaterialId;
  /** Its name ("Bamboo"), and a count of it ("{n} bamboo", "ឫស្សី {n} ដើម"; English: one and many). */
  readonly name: WordKey;
  readonly one: WordKey;
  readonly many: WordKey;
  /** What gathering it is called ("Cut bamboo"). */
  readonly verb: WordKey;
  /** What one weighs against his carry limit. */
  readonly weight: number;
  /** One bought when he lacks it at build time (riel). */
  readonly riel: number;
  /** How it is gathered (the pose and the tool). */
  readonly action: GatherAction;
  /** The chips' colours (sRGB): flying from a hit. */
  readonly chips: readonly number[];
}

/** He carries this much weight on foot (a bamboo pole is 2, a log 4: six poles, or three logs). */
export const CARRY_LIMIT = 12;

export const MATERIALS: Record<MaterialId, MaterialSpec> = {
  // A pole of bamboo cut from a clump (a long stalk, 2: six on his shoulder).
  bamboo: { id: 'bamboo', name: 'matBamboo', one: 'matBambooOne', many: 'matBambooMany', verb: 'gatherCutBamboo', weight: 2, riel: 2_000, action: 'chop', chips: [0xc8c070, 0x9aa850, 0xe0d8a0, 0x7a9040] },
  // A log (heavy, 4).
  log: { id: 'log', name: 'matLog', one: 'matLogOne', many: 'matLogMany', verb: 'gatherCutLog', weight: 4, riel: 6_000, action: 'chop', chips: [0xd8b080, 0xb08050, 0xe8c898, 0x8a6038] },
  // A bundle of sugar-palm leaf thatch (light, 1).
  thatch: { id: 'thatch', name: 'matThatch', one: 'matThatchOne', many: 'matThatchMany', verb: 'gatherCutThatch', weight: 1, riel: 2_500, action: 'chop', chips: [0xb8b060, 0x8a9a48, 0xd0c080, 0x6a7a38] },
  // A lump of clay dug from a bank (2).
  clay: { id: 'clay', name: 'matClay', one: 'matClayOne', many: 'matClayMany', verb: 'gatherDigClay', weight: 2, riel: 1_500, action: 'dig', chips: [0x9a6a48, 0x7a5038, 0xb08060, 0x5a3a28] },
};

export const MATERIAL_IDS = Object.keys(MATERIALS) as MaterialId[];

/** Some materials and how many of each (a piece's cost, what is missing, what he has). */
export type Materials = Partial<Record<MaterialId, number>>;

const isMaterial = (m: string): m is MaterialId => m in MATERIALS;
/** The most of one material kept (a broken save cannot make a heap). */
const MAX_EACH = 999;

/** A store of materials: the bag (with its limit) or the home store. */
export interface Stock {
  /** How many of `m` it holds. */
  count(m: MaterialId): number;
  /** Everything in it (a copy; only materials it holds). */
  all(): Materials;
  /** Nothing in it. */
  readonly empty: boolean;
  /** Put in up to `n` of `m`; returns how many went in (the bag: what fits under the limit). */
  add(m: MaterialId, n: number): number;
  /** Take out up to `n` of `m`; returns how many came out. */
  take(m: MaterialId, n: number): number;
  /** Empty it (checks, the URL). */
  clear(): void;
  /** Something changed. */
  onChange(fn: () => void): void;
  /** Bumps on every change. */
  readonly version: number;
}

export interface Bag extends Stock {
  /** The weight he carries now (0‥`CARRY_LIMIT`, more only from an old save). */
  load(): number;
  /** How many more of `m` fit under the limit. */
  room(m: MaterialId): number;
}

const isCounts = (v: unknown): v is Record<string, number> => typeof v === 'object' && v !== null && !Array.isArray(v);

function makeStock(key: string, limit: number | null): Bag {
  const counts: Record<MaterialId, number> = { bamboo: 0, log: 0, thatch: 0, clay: 0 };
  // (an old or broken save: what reads as a whole number of a known material, the rest dropped)
  const saved = progress.get<Record<string, number>>(key, {}, isCounts);
  for (const [m, n] of Object.entries(saved)) if (isMaterial(m) && Number.isFinite(n)) counts[m] = Math.max(0, Math.min(MAX_EACH, Math.floor(n)));
  const fns: (() => void)[] = [];
  let version = 0;
  const load = () => MATERIAL_IDS.reduce((w, m) => w + counts[m] * MATERIALS[m].weight, 0);
  const changed = () => {
    version++;
    const out: Record<string, number> = {};
    for (const m of MATERIAL_IDS) if (counts[m] > 0) out[m] = counts[m];
    progress.set(key, Object.keys(out).length ? out : null);
    for (const fn of fns) fn();
  };
  const room = (m: MaterialId) => (limit === null ? MAX_EACH - counts[m] : Math.max(0, Math.min(MAX_EACH - counts[m], Math.floor((limit - load()) / MATERIALS[m].weight))));
  return {
    count: (m) => counts[m] ?? 0,
    all() {
      const out: Materials = {};
      for (const m of MATERIAL_IDS) if (counts[m] > 0) out[m] = counts[m];
      return out;
    },
    get empty() {
      return MATERIAL_IDS.every((m) => counts[m] === 0);
    },
    add(m, n) {
      const k = Math.max(0, Math.min(Math.floor(n), room(m)));
      if (!k) return 0;
      counts[m] += k;
      changed();
      return k;
    },
    take(m, n) {
      const k = Math.max(0, Math.min(Math.floor(n), counts[m]));
      if (!k) return 0;
      counts[m] -= k;
      changed();
      return k;
    },
    clear() {
      if (MATERIAL_IDS.every((m) => counts[m] === 0)) return;
      for (const m of MATERIAL_IDS) counts[m] = 0;
      changed();
    },
    onChange(fn) {
      fns.push(fn);
    },
    get version() {
      return version;
    },
    load,
    room,
  };
}

/** What he carries on foot (saved: `gather.bag`). */
export const BAG: Bag = makeStock('gather.bag', CARRY_LIMIT);
/** What he has put down at home (saved: `gather.store`). */
export const STORE: Stock = makeStock('gather.store', null);

/** How many of `m` he has to build with (the bag and the store). */
export const haveOf = (m: MaterialId): number => BAG.count(m) + STORE.count(m);

/** What of `cost` he lacks (bag and store together); empty when he has it all. */
export function missingOf(cost: Materials): Materials {
  const out: Materials = {};
  for (const m of MATERIAL_IDS) {
    const short = (cost[m] ?? 0) - haveOf(m);
    if (short > 0) out[m] = short;
  }
  return out;
}

/** What `ms` costs bought (riel). */
export const rielOf = (ms: Materials): number => MATERIAL_IDS.reduce((r, m) => r + (ms[m] ?? 0) * MATERIALS[m].riel, 0);

/** No materials in `ms`. */
export const noMaterials = (ms: Materials): boolean => MATERIAL_IDS.every((m) => !ms[m]);

/**
 * Take `cost` for a build: what he has, from the bag first (what he carries frees his hands for more), then the
 * store. Returns what came from each (the rest he paid for: `missingOf` before this).
 */
export function useMaterials(cost: Materials): { bag: Materials; store: Materials } {
  const bag: Materials = {};
  const store: Materials = {};
  for (const m of MATERIAL_IDS) {
    let need = cost[m] ?? 0;
    if (need <= 0) continue;
    const b = BAG.take(m, need);
    if (b) bag[m] = b;
    need -= b;
    const s = STORE.take(m, need);
    if (s) store[m] = s;
  }
  return { bag, store };
}

/** One material counted, in a sentence ("2 bamboo", "ឫស្សី ២ ដើម", "1 log"). */
export const materialCount = (m: MaterialId, n: number): string => t(n === 1 ? MATERIALS[m].one : MATERIALS[m].many, { n: num(n) });

/** Materials counted, in a sentence ("2 bamboo, 1 log"; "ឫស្សី ២ ដើម និង ឈើ ១ កំណាត់"), or '' for none. */
export function materialsText(ms: Materials): string {
  const parts = MATERIAL_IDS.filter((m) => (ms[m] ?? 0) > 0).map((m) => materialCount(m, ms[m]!));
  if (parts.length < 2) return parts[0] ?? '';
  return lang() === 'km' ? `${parts.slice(0, -1).join(' ')} និង ${parts[parts.length - 1]}` : parts.join(', ');
}
