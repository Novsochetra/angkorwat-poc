import { SFX } from '../audio/addonSfx';
import type { GardenSfx } from '../garden/actions';
import { KINDS, stageOf, type PlantKindId } from '../garden/kinds';
import { GARDEN, type GardenEvent, type Plant } from '../garden/state';
import { HOME_AT } from '../hamlet/_homePlan';
import type { RoamMode } from '../types';
import { lang, num, t, type WordKey } from '../ui/lang';
import type { AddonEnv } from './_addons';

/**
 * What his garden tells him (roam/_garden.ts): toasts from the garden's events
 * (garden/state.ts `GARDEN.on`), each with its little chime (audio/_garden.ts):
 *
 * - a plant's first sprout ("Your corn has sprouted!"; only while he is near home),
 * - a plant grown ("Your mango tree is fully grown!"),
 * - ripe ("The mangoes are ripe!"; a durian, a coconut, palm fruit: "A durian has
 *   fallen! Pick it up under the tree", and its thud from the tree when he is
 *   within `THUD_FAR` m, softer the further),
 * - thirsty: near home, "Your eggplant needs water" (not more often than
 *   `THIRST_EVERY` s); away, "Your garden at home needs water" once, until he has
 *   been home again,
 * - died, gently ("Your corn dried out for want of water. Pull it out and plant again").
 *
 * Events that come together (a sleep moves the garden on a whole night) are
 * gathered for `GATHER` s and said once ("3 new sprouts in your garden"); the
 * toasts follow each other `GAP` s apart (the hud shows one at a time). The work
 * (roam/_gardenWork.ts) says its own through `gardenSay` (the harvest into his
 * basket). Nothing on the map screen (the hud shows no toasts there).
 */

/** Near home for the toasts that only matter there (m from the house). */
const NEAR = 60;
/** The thud of fruit falling is heard this far (m). */
const THUD_FAR = 60;
/** Events are gathered this long before they are said (s); toasts follow each other this far apart (s). */
const GATHER = 1.2;
const GAP = 3.1;
/** The same kind's ripe news, and "needs water" near home, no more often than this (s). */
const RIPE_EVERY = 45;
const THIRST_EVERY = 90;

const RIPE_WORDS: Partial<Record<PlantKindId, WordKey>> = {
  eggplant: 'gardenRipeEggplant',
  corn: 'gardenRipeCorn',
  pumpkin: 'gardenRipePumpkin',
  sugarcane: 'gardenRipeSugarcane',
  banana: 'gardenRipeBanana',
  papaya: 'gardenRipePapaya',
  guava: 'gardenRipeGuava',
  mango: 'gardenRipeMango',
  jackfruit: 'gardenRipeJackfruit',
  durian: 'gardenFellDurian',
  coconut: 'gardenFellCoconut',
  sugarPalm: 'gardenFellSugarPalm',
};

/** A plant's name for a sentence: lower case in English ("Water the sugar palm"), as it is in Khmer. */
export function plantWord(k: PlantKindId): string {
  const s = t(KINDS[k].name);
  return lang() === 'en' ? s.toLowerCase() : s;
}

interface Said {
  text: string;
  chime: GardenSfx | null;
}

let env: AddonEnv | null = null;
let mode: RoamMode = 'overview';
const queue: Said[] = [];
let wait = 0;
/** Gathering: since when (s; < 0 nothing gathered), and what. */
let gathering = -1;
const sprouts: Plant[] = [];
const grown: PlantKindId[] = [];
const ripe = new Set<PlantKindId>();
const thirsty: Plant[] = [];
const died: PlantKindId[] = [];
const ripeSaid = new Map<PlantKindId, number>();
let thirstSaid = -1e9;
let awaySaid = false;
let clock = 0;

/** Say something now (after what is waiting): the work's own lines, the hints. */
export function gardenSay(text: string, chime: GardenSfx | null = null, at = -1): void {
  if (mode === 'overview') return;
  // (the same line twice in a row is said once)
  if (queue.length && queue[queue.length - 1].text === text) return;
  // (`at`: before what was said since `gardenMark()`: the harvest's line before what follows from it)
  if (at >= 0 && at < queue.length) queue.splice(at, 0, { text, chime });
  else queue.push({ text, chime });
}

/** Where the next line would go (for `gardenSay`'s `at`). */
export const gardenMark = (): number => queue.length;

/** His feet's distance from the house (m), or Infinity on the map screen. */
function fromHome(): number {
  if (!env || mode === 'overview') return Infinity;
  const p = env.body.pos;
  return Math.hypot(p.x - HOME_AT.x, p.z - HOME_AT.z);
}

function onEvent(e: GardenEvent): void {
  if (!env || !('plant' in e)) return;
  const p = e.plant;
  if (p.at !== 'home') return;
  const k = KINDS[p.kind];
  const near = fromHome() < NEAR;
  switch (e.type) {
    case 'stage':
      if (stageOf(k, p.age) === 1 && near) sprouts.push(p);
      break;
    case 'grown':
      grown.push(p.kind);
      break;
    case 'ripe':
      ripe.add(p.kind);
      break;
    case 'fell': {
      ripe.add(p.kind);
      if (mode === 'overview') break;
      const b = env.body.pos;
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if (d < THUD_FAR) SFX.play('gardenThud', 0.9 * (1 - d / THUD_FAR) ** 1.4);
      break;
    }
    case 'thirsty':
      thirsty.push(p);
      break;
    case 'died':
      died.push(p.kind);
      break;
    default:
      return;
  }
  if (gathering < 0) gathering = clock;
}

/** "Your corn …" for one kind, "3 plants …" for more. */
function oneOrMany(list: PlantKindId[], one: WordKey, many: WordKey): string {
  return list.length === 1 ? t(one, { plant: plantWord(list[0]) }) : t(many, { n: num(list.length) });
}

/** What was gathered, said. */
function sayGathered(): void {
  const near = fromHome() < NEAR;
  if (died.length) gardenSay(oneOrMany(died, 'gardenDied1', 'gardenDiedN'), 'gardenDied');
  for (const k of grown) gardenSay(t('gardenGrown', { plant: plantWord(k) }), 'gardenSprout');
  for (const k of ripe) {
    const w = RIPE_WORDS[k];
    if (!w || clock - (ripeSaid.get(k) ?? -1e9) < RIPE_EVERY) continue;
    ripeSaid.set(k, clock);
    gardenSay(t(w), 'gardenRipe');
  }
  // (a sprout that has died meanwhile is said dead, not sprouted)
  const up: PlantKindId[] = [];
  for (const p of sprouts) if (!p.dead && GARDEN.plants.includes(p)) up.push(p.kind);
  if (up.length) gardenSay(oneOrMany(up, 'gardenSprout1', 'gardenSproutN'), 'gardenSprout');
  // (not those that died meanwhile: they are said dead)
  const dry: PlantKindId[] = [];
  for (const p of thirsty) if (!p.dead && GARDEN.plants.includes(p) && p.wet <= 0) dry.push(p.kind);
  if (dry.length) {
    if (near) {
      awaySaid = false;
      if (clock - thirstSaid >= THIRST_EVERY) {
        thirstSaid = clock;
        gardenSay(oneOrMany(dry, 'gardenThirsty1', 'gardenThirstyN'), 'gardenThirst');
      }
    } else if (!awaySaid && mode !== 'overview') {
      awaySaid = true;
      gardenSay(t('gardenThirstyAway'), 'gardenThirst');
    }
  }
  sprouts.length = grown.length = thirsty.length = died.length = 0;
  ripe.clear();
}

export const GardenToasts = {
  init(e: AddonEnv): void {
    env = e;
    GARDEN.on(onEvent);
  },
  setMode(m: RoamMode): void {
    mode = m;
    if (m === 'overview') {
      queue.length = 0;
      gathering = -1;
      sprouts.length = grown.length = thirsty.length = died.length = 0;
      ripe.clear();
    }
  },
  /** Each frame. `hold`: something else has him (asleep in his house): what is said waits until he is up. */
  frame(dt: number, hold: boolean): void {
    clock += dt;
    if (!env) return;
    // (back home: the news from away may come again next time he is away)
    if (fromHome() < NEAR) awaySaid = false;
    if (gathering >= 0 && clock - gathering >= GATHER && !hold) {
      gathering = -1;
      sayGathered();
    }
    wait -= dt;
    if (wait > 0 || hold || !queue.length || mode === 'overview') return;
    const s = queue.shift()!;
    env.hud.toast(s.text);
    if (s.chime) SFX.play(s.chime, 0.8);
    wait = GAP;
  },
};
