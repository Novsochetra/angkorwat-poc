import { progress } from '../progress';
import { GARDEN_KINDS, GROWN, inFruitMonths, isTree, KINDS, stageOf, type PlantKind, type PlantKindId, type Stage } from './kinds';

/**
 * His garden as it is, kept between visits (progress.ts `garden.v1`): every plant
 * he has planted (near his house, and the bodhi at the pagoda), his seeds and
 * seedlings, his harvest basket and his watering can. No three.js; the roaming
 * add-on (roam/_garden.ts) moves it on each frame (`advance`) and draws it
 * (garden/view.ts) from `lookOf`.
 *
 * **Time** is the garden's own clock (`GARDEN.clock`, game days, saved): it runs
 * as the map's time does (time.ts `TIME.days()`: sleep in his house moves it on),
 * and while the Time setting holds the clock still, a day passes with every
 * 360 s of play (`TIME.dayLength`) all the same: plants grow only while the game
 * is played, never while it is shut.
 *
 * **Water**: a watering fills a plant's earth (`wet` 1), which dries over
 * `thirst` game days; rain fills it too. While it is dry a plant does not grow
 * (nor ripen) and droops; dry for `dieAfter` days before it is grown, it dies (a
 * dry stick he pulls out). A grown tree needs no water (its roots are deep): it
 * never droops nor dies. A grown crop droops and waits for water.
 *
 * **Harvest**: grown, in its months, the fruit ripens over `ripenDays` (it shows
 * green from a third of the way); ripe, E picks it (`pick`). A tree that drops its
 * fruit (`ground`) lets it fall when ripe (`fallen`: lying under it till he picks
 * it up). `once` plants (corn) leave their bed empty after the harvest.
 *
 * Shots save nothing and start empty; their URL values set what they show
 * (`fromUrl`: `garden=lineup|demo|<kind>:<stage>[:ripe|:green|:cut|:dry|:wilt|:dead|:fallen]…` (mods may stack: `sugarcane:4:cut:green`),
 * `seeds=`, `basket=`, `can=`, `gardenclock=`).
 */

/** A watering can's pours when full. */
export const CAN_MAX = 8;
/**
 * His yard's big water jar (ពាង, by the stair) holds this many pours (three cans). It is not a well: he fills it by
 * carrying water from the stream on his shoulder pole (roam/_carryPole*.ts: two buckets, `BUCKET_POURS` each), and
 * rain fills it. A new garden starts with it full.
 */
export const JAR_MAX = 24;
/** One bucket of the shoulder pole's two, in pours (into the jar, or on the plants with the dipper). */
export const BUCKET_POURS = 6;
/** Plants at most near the house: crops, trees (a garden that stays quick to draw). */
export const MAX_CROPS = 40;
export const MAX_TREES = 12;

export interface Plant {
  /** Unique, kept. */
  readonly id: number;
  readonly kind: PlantKindId;
  /** Where (m, the map's x and z) and its turn (radians), its look's variety (0‥1). */
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly seed: number;
  /** Home garden, or the pagoda's bodhi. */
  readonly at: 'home' | 'pagoda';
  /** Game days of watered growth. */
  age: number;
  /** Its earth: 1 just watered ‥ 0 dry. */
  wet: number;
  /** Game days dry (0 while the earth is wet). */
  dry: number;
  dead: boolean;
  /** Grown: the next harvest's ripening (0 just picked ‥ 1 ripe). */
  ripe: number;
  /** Fruit lying under it (a tree that drops its fruit). */
  fallen: number;
  /** Harvests taken. */
  picked: number;
  /** Game days its fruit has hung (or lain) ripe out of its months: after `STALE` it drops and rots. */
  out?: number;
  /** When it was planted (the garden's clock, game days). */
  readonly planted: number;
}

/** What the models draw of a plant (garden/look.ts): changes only at these steps, so the view rebuilds rarely. */
export interface PlantLook {
  readonly kind: PlantKindId;
  readonly stage: Stage;
  /** Fruit on it: 0 none, 1 green (growing), 2 ripe. */
  readonly fruit: 0 | 1 | 2;
  /** Ripe fruit lying on the ground under it (0‥3 drawn). */
  readonly fallen: number;
  /** Drooping for want of water: 0 fresh, 1 drooping, 2 wilting badly (near death). */
  readonly droop: 0 | 1 | 2;
  readonly dead: boolean;
  /** Harvested at least once (a cut sugarcane's stumps, a banana's cut stalk): false while grown for the first time. */
  readonly cut: boolean;
  /** Its own variety (0‥1): models vary leaf counts, lean and colours by it, the same every time. */
  readonly seed: number;
}

/** Its earth for the view (the dug bed round a crop, the ring round a young tree): 0 dry, 1 damp, 2 just watered. */
export type SoilLook = 0 | 1 | 2;

export type GardenEvent =
  | { type: 'planted' | 'watered' | 'stage' | 'ripe' | 'fell' | 'thirsty' | 'wilting' | 'died' | 'cleared' | 'grown'; plant: Plant }
  | { type: 'picked'; plant: Plant; n: number }
  | { type: 'seeds' | 'basket' | 'can' | 'jar' };

interface Saved {
  v: 1;
  clock: number;
  nextId: number;
  plants: Plant[];
  seeds: Partial<Record<PlantKindId, number>>;
  basket: Partial<Record<PlantKindId, number>>;
  can: number;
  /** Pours in his yard's water jar (0‥`JAR_MAX`). */
  jar: number;
  /** He took the seeds Grandma left for him on the veranda. */
  gift: boolean;
  /** The pagoda's monk has given him the bodhi sapling (roam/_bodhi*.ts). */
  bodhiGiven: boolean;
  /**
   * The garden's own year: the time of the year (0 = 14 April, as `MapFrame.season`) when its clock was 0, set from the
   * map's season the first time it grows (the real date). From then on the garden's year turns with its own clock (24
   * game days a year), kept between visits: a mango planted in October fruits after the garden's year has come round
   * to March, however many visits that takes (the map's own season starts from the real date at every visit).
   */
  year0: number | null;
}

const KEY = 'garden.v1';

const isSaved = (v: unknown): v is Saved => typeof v === 'object' && v !== null && (v as Saved).v === 1 && Array.isArray((v as Saved).plants);

function fresh(): Saved {
  return { v: 1, clock: 0, nextId: 1, plants: [], seeds: {}, basket: {}, can: 0, jar: JAR_MAX, gift: false, bodhiGiven: false, year0: null };
}

/** A kind of the garden's (not `constructor`, `toString`…: an own key of `KINDS`). */
export const isKind = (k: unknown): k is PlantKindId => typeof k === 'string' && Object.hasOwn(KINDS, k);

const num = (v: unknown, fallback: number, lo = -Infinity, hi = Infinity): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

/** Counts by kind, cleaned: own kinds only, whole numbers ≥ 0. */
function counts(v: unknown): Partial<Record<PlantKindId, number>> {
  const out: Partial<Record<PlantKindId, number>> = {};
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return out;
  for (const [k, n] of Object.entries(v)) {
    const c = Math.floor(num(n, 0, 0, 9999));
    if (isKind(k) && c > 0) out[k] = c;
  }
  return out;
}

function load(): Saved {
  const s = progress.get(KEY, null, (v): v is null => isSaved(v)) as Saved | null;
  if (!s) return fresh();
  // (an older or broken record: every value checked, what is wrong dropped or put right)
  const plants: Plant[] = [];
  const ids = new Set<number>();
  for (const p of s.plants as unknown[]) {
    if (typeof p !== 'object' || p === null) continue;
    const q = p as Plant;
    if (!isKind(q.kind) || !Number.isFinite(q.x) || !Number.isFinite(q.z) || !Number.isInteger(q.id) || ids.has(q.id)) continue;
    ids.add(q.id);
    plants.push({
      id: q.id, kind: q.kind, x: q.x, z: q.z, yaw: num(q.yaw, 0), seed: num(q.seed, 0.5, 0, 1), at: q.at === 'pagoda' ? 'pagoda' : 'home',
      age: num(q.age, 0, 0), wet: num(q.wet, 0, 0, 1), dry: num(q.dry, 0, 0), dead: q.dead === true, ripe: num(q.ripe, 0, 0, 1),
      fallen: Math.floor(num(q.fallen, 0, 0, 9)), picked: Math.floor(num(q.picked, 0, 0)), planted: num(q.planted, 0), out: num(q.out, 0, 0),
    });
  }
  const top = plants.reduce((m, p) => Math.max(m, p.id), 0);
  return {
    v: 1,
    clock: num(s.clock, 0, 0),
    nextId: Math.max(Math.floor(num(s.nextId, 1, 1)), top + 1),
    plants,
    seeds: counts(s.seeds),
    basket: counts(s.basket),
    can: Math.round(num(s.can, 0, 0, CAN_MAX)),
    jar: Math.round(num(s.jar, JAR_MAX, 0, JAR_MAX)),
    gift: s.gift === true,
    bodhiGiven: s.bodhiGiven === true,
    year0: typeof s.year0 === 'number' && Number.isFinite(s.year0) ? s.year0 : null,
  };
}

const state: Saved = load();
const listeners: ((e: GardenEvent) => void)[] = [];
let dirty = false;
let saveIn = 0;

function emit(e: GardenEvent): void {
  for (const fn of listeners) fn(e);
}

function changed(now = false): void {
  dirty = true;
  if (now) flush();
}

/** Save now what changed (each few seconds of growth, at once after anything he did). */
function flush(): void {
  if (!dirty) return;
  dirty = false;
  saveIn = 5;
  progress.set(KEY, JSON.parse(JSON.stringify(state)) as Parameters<typeof progress.set>[1]);
}

/** Small steps for a long jump of the clock (sleep): growth, drying and ripening go in order. */
const STEP = 0.05;
/** The garden's year turns once in this many game days (main.ts `SEASON_PER_DAY`). */
const YEAR_DAYS = 24;
const frac = (x: number) => ((x % 1) + 1) % 1;

/** A jump of the clock this long (game days: sleep, "Wait for it") lets nothing die: a plant left dry wilts and waits for him. */
const JUMP = 0.25;
/** After a jump or the map seen from above, a dry young plant has at least this long left (game days: 6 min of play, time to come home from a landing). */
const SPARE = 1;
/** Game days ripe fruit hangs (or lies) out of its months before it drops and rots. */
const STALE = 2;

/** A whole number from the plant's variety (the same every time). */
function countOf(k: PlantKind, p: Plant): number {
  const [a, b] = k.fruit.count;
  const r = ((p.seed * 9301 + p.picked * 0.618) % 1 + 1) % 1;
  return a + Math.floor(r * (b - a + 1));
}

/** One plant over `d` game days (≤ STEP). */
function stepPlant(p: Plant, d: number, season: number, rain: number, mayDie: boolean): void {
  if (p.dead) return;
  const k = KINDS[p.kind];
  const stage0 = stageOf(k, p.age);
  // (a grown tree's roots are deep; the pagoda's monks water the bodhi every day)
  const deep = (isTree(k) && stage0 === GROWN) || p.at === 'pagoda';
  // Rain: a shower soaks the earth in a tenth of a day.
  if (rain > 0.15) p.wet = Math.min(1, p.wet + d * rain * 10);
  const wasWet = p.wet > 0;
  if (!deep) p.wet = Math.max(0, p.wet - d / k.thirst);
  else p.wet = Math.max(p.wet, 0.5);
  if (p.wet <= 0) {
    if (wasWet) emit({ type: 'thirsty', plant: p });
    const was = p.dry;
    p.dry += d;
    // (a second warning as it wilts badly, before it is too late)
    if (stage0 < GROWN && was < k.dieAfter * 0.5 && p.dry >= k.dieAfter * 0.5) emit({ type: 'wilting', plant: p });
    // (while nothing may die: kept well short of it, so he has a few minutes of play to come and water it)
    if (!mayDie) p.dry = Math.min(p.dry, Math.max(was, k.dieAfter - SPARE));
    if (stage0 < GROWN && p.dry > k.dieAfter) {
      p.dead = true;
      emit({ type: 'died', plant: p });
      changed(true);
    }
    return;
  }
  p.dry = 0;
  p.age += d;
  const stage1 = stageOf(k, p.age);
  if (stage1 !== stage0) {
    emit({ type: stage1 === GROWN ? 'grown' : 'stage', plant: p });
    if (stage1 === GROWN && k.fruit.harvest === 'once') p.ripe = 1;
  }
  if (stage1 !== GROWN || k.fruit.count[1] <= 0) return;
  // Out of its months: what was ripening stops (it starts again next season); ripe fruit left on (or under) the
  // tree drops and rots after a while.
  if (!inFruitMonths(k, season)) {
    if (p.ripe < 1) p.ripe = 0;
    if (p.ripe >= 1 || p.fallen > 0) {
      p.out = (p.out ?? 0) + d;
      if (p.out > STALE) {
        p.ripe = 0;
        p.fallen = 0;
        p.out = 0;
      }
    }
    return;
  }
  p.out = 0;
  // Ripening (in its months; a ripe one waits to be picked).
  if (p.ripe < 1) {
    const was = p.ripe;
    p.ripe = Math.min(1, p.ripe + d / Math.max(0.01, k.fruit.ripenDays));
    if (p.ripe >= 1 && was < 1) {
      if (k.fruit.pick === 'ground') {
        if (p.fallen === 0) {
          p.fallen = countOf(k, p);
          p.ripe = 0;
          emit({ type: 'fell', plant: p });
        } else p.ripe = 1;
      } else emit({ type: 'ripe', plant: p });
    }
  }
}

/** Its look now (garden/look.ts draws it). */
export function lookOf(p: Plant): PlantLook {
  const k = KINDS[p.kind];
  const stage = stageOf(k, p.age);
  const ground = k.fruit.pick === 'ground';
  let fruit: 0 | 1 | 2 = 0;
  if (stage === GROWN && !p.dead && k.fruit.count[1] > 0) fruit = p.ripe >= 1 && !ground ? 2 : p.ripe >= 0.33 ? 1 : 0;
  // (a grown plant cannot die: it only droops)
  const droop: 0 | 1 | 2 = p.dead || p.wet > 0 ? 0 : p.dry < k.dieAfter * 0.5 || stage === GROWN ? 1 : 2;
  return { kind: p.kind, stage, fruit, fallen: Math.min(3, p.fallen), droop, dead: p.dead, cut: p.picked > 0, seed: p.seed };
}

/**
 * A number that changes exactly when its look does (the plant's kind and seed never change), worked out with no
 * allocation: the view compares it each frame (`lookOf` / `lookKey` only when it changed).
 */
export function lookSig(p: Plant): number {
  const k = KINDS[p.kind];
  const stage = stageOf(k, p.age);
  const ground = k.fruit.pick === 'ground';
  let fruit = 0;
  if (stage === GROWN && !p.dead && k.fruit.count[1] > 0) fruit = p.ripe >= 1 && !ground ? 2 : p.ripe >= 0.33 ? 1 : 0;
  const droop = p.dead || p.wet > 0 ? 0 : p.dry < k.dieAfter * 0.5 || stage === GROWN ? 1 : 2;
  return stage + 5 * fruit + 15 * Math.min(3, p.fallen) + 60 * droop + 180 * (p.dead ? 1 : 0) + 360 * (p.picked > 0 ? 1 : 0);
}

/** A key that changes exactly when the look does (for the view's cache). */
export function lookKey(l: PlantLook): string {
  return `${l.kind}|${l.stage}|${l.fruit}|${l.fallen}|${l.droop}|${l.dead ? 1 : 0}|${l.cut ? 1 : 0}|${Math.round(l.seed * 997)}`;
}

/** Its earth for the view. */
export const soilOf = (p: Plant): SoilLook => (p.wet > 0.66 ? 2 : p.wet > 0.2 ? 1 : 0);

/** Ripe to pick now (on it, or lying under it). */
export function ripeNow(p: Plant): boolean {
  if (p.dead) return false;
  const k = KINDS[p.kind];
  if (stageOf(k, p.age) !== GROWN || k.fruit.count[1] <= 0) return false;
  return k.fruit.pick === 'ground' ? p.fallen > 0 : p.ripe >= 1;
}

/** It wants water: alive, not a grown tree, the earth drying (under a third). */
export function thirsty(p: Plant): boolean {
  if (p.dead) return false;
  const k = KINDS[p.kind];
  if (isTree(k) && stageOf(k, p.age) === GROWN) return false;
  return p.wet < 0.34;
}

export const GARDEN = {
  get clock(): number {
    return state.clock;
  },
  get plants(): readonly Plant[] {
    return state.plants;
  },
  get can(): number {
    return state.can;
  },
  get gift(): boolean {
    return state.gift;
  },
  get bodhiGiven(): boolean {
    return state.bodhiGiven;
  },
  /** Seeds and seedlings he has of a kind. */
  seeds(k: PlantKindId): number {
    return state.seeds[k] ?? 0;
  },
  /** Every kind he has seeds of, in the seed card's order. */
  seedKinds(): PlantKindId[] {
    return [...GARDEN_KINDS, 'bodhi' as PlantKindId].filter((k) => (state.seeds[k] ?? 0) > 0);
  },
  /** His harvest of a kind in his basket (at home). */
  basket(k: PlantKindId): number {
    return state.basket[k] ?? 0;
  },
  basketKinds(): PlantKindId[] {
    return GARDEN_KINDS.filter((k) => (state.basket[k] ?? 0) > 0);
  },
  /** Crops and trees near the house now (dead ones count till he clears them). */
  count(size: 'crop' | 'tree', at: 'home' | 'pagoda' = 'home'): number {
    let n = 0;
    for (const p of state.plants) if (p.at === at && KINDS[p.kind].size === size) n++;
    return n;
  },
  /** Room for one more of this size near the house. */
  roomFor(size: 'crop' | 'tree'): boolean {
    return GARDEN.count(size) < (size === 'crop' ? MAX_CROPS : MAX_TREES);
  },
  byId(id: number): Plant | null {
    return state.plants.find((p) => p.id === id) ?? null;
  },
  on(fn: (e: GardenEvent) => void): void {
    listeners.push(fn);
  },

  /**
   * Move the garden on by `d` game days (roam/_garden.ts, every frame; `rain` the weather's 0‥1). `mayDie` false (the
   * map seen from above, not roaming) and any jump of the clock (sleep) let nothing die: a plant left dry wilts and
   * waits for him to come and water it.
   */
  advance(d: number, season: number, rain: number, mayDie = true): void {
    if (!(d > 0)) return;
    d = Math.min(d, 3);
    if (d > JUMP) mayDie = false;
    // (the garden's year starts from the map's, the real date, the first time it grows; then it turns with the garden)
    if (state.year0 === null) state.year0 = frac(season - state.clock / YEAR_DAYS);
    // (rain fills the jar too: a good shower, a tenth of a day, fills it)
    if (rain > 0.15 && state.jar < JAR_MAX) {
      state.jar = Math.min(JAR_MAX, state.jar + d * rain * JAR_MAX * 10);
      emit({ type: 'jar' });
    }
    while (d > 1e-9) {
      const s = Math.min(STEP, d);
      state.clock += s;
      const sn = GARDEN.season();
      for (const p of state.plants) stepPlant(p, s, sn, rain, mayDie);
      d -= s;
    }
    dirty = true;
  },
  /** The time of the garden's year now (0 = 14 April; garden/kinds.ts `monthOf`), or `fallback` before it has one. */
  season(fallback = 0): number {
    return state.year0 === null ? fallback : frac(state.year0 + state.clock / YEAR_DAYS);
  },
  /** Each frame (real seconds): saves what changed now and then. */
  tick(dt: number): void {
    saveIn -= dt;
    if (dirty && saveIn <= 0) flush();
  },

  /** Plant one of his seeds of `kind` at (x, z) (the rules of where are roam/_gardenSpots.ts'): the new plant, or null (no seed). */
  plant(kind: PlantKindId, x: number, z: number, yaw: number, seed: number, at: 'home' | 'pagoda' = 'home'): Plant | null {
    if ((state.seeds[kind] ?? 0) <= 0) return null;
    state.seeds[kind] = (state.seeds[kind] ?? 0) - 1;
    if (!state.seeds[kind]) delete state.seeds[kind];
    const p: Plant = { id: state.nextId++, kind, x, z, yaw, seed, at, age: 0, wet: 1, dry: 0, dead: false, ripe: 0, fallen: 0, picked: 0, planted: state.clock };
    state.plants.push(p);
    emit({ type: 'planted', plant: p });
    emit({ type: 'seeds' });
    changed(true);
    return p;
  },
  /** Water it: one pour from his can (`from` 'can': false when it is empty), or from a bucket with the dipper ('bucket': the shoulder pole's add-on counts its own water). */
  water(p: Plant, from: 'can' | 'bucket' = 'can'): boolean {
    if (p.dead || (from === 'can' && state.can <= 0)) return false;
    if (from === 'can') state.can--;
    p.wet = 1;
    p.dry = 0;
    emit({ type: 'watered', plant: p });
    emit({ type: 'can' });
    changed(true);
    return true;
  },
  /** Fill his can: at the stream (`from` 'water': full), or from the jar ('jar': what it has, up to full; false when the jar is empty). */
  fillCan(from: 'water' | 'jar' = 'water'): boolean {
    const want = CAN_MAX - state.can;
    if (from === 'jar') {
      const n = Math.min(want, Math.floor(state.jar));
      if (n <= 0) return false;
      state.jar -= n;
      state.can += n;
      emit({ type: 'jar' });
    } else state.can = CAN_MAX;
    emit({ type: 'can' });
    changed(true);
    return true;
  },
  /** Pours in his yard's jar. */
  get jar(): number {
    return state.jar;
  },
  /** Pour `n` pours into the jar (his buckets, the rain): what went in (the rest spills over). */
  fillJar(n: number): number {
    const k = Math.max(0, Math.min(n, JAR_MAX - state.jar));
    if (k <= 0) return 0;
    state.jar += k;
    emit({ type: 'jar' });
    changed(true);
    return k;
  },
  /** Take its harvest: how many went into his basket (0: nothing ripe). A `once` plant is gone after it. */
  pick(p: Plant): number {
    if (!ripeNow(p)) return 0;
    const k = KINDS[p.kind];
    const ground = k.fruit.pick === 'ground';
    const n = ground ? p.fallen : countOf(k, p);
    // (a tree that drops its fruit: a batch that ripened while the last lay there falls now)
    const waiting = ground && p.ripe >= 1;
    p.fallen = 0;
    p.ripe = 0;
    p.out = 0;
    p.picked++;
    if (waiting) {
      p.fallen = countOf(k, p);
      emit({ type: 'fell', plant: p });
    }
    state.basket[p.kind] = (state.basket[p.kind] ?? 0) + n;
    emit({ type: 'picked', plant: p, n });
    emit({ type: 'basket' });
    if (k.fruit.harvest === 'once') GARDEN.remove(p);
    changed(true);
    return n;
  },
  /** Pull a plant out (a dead one, or one he no longer wants): its place is free again. */
  remove(p: Plant): void {
    const i = state.plants.indexOf(p);
    if (i < 0) return;
    state.plants.splice(i, 1);
    emit({ type: 'cleared', plant: p });
    changed(true);
  },
  /** Add seeds (the nursery, Grandma's gift, the monk's bodhi). */
  addSeeds(k: PlantKindId, n: number): void {
    state.seeds[k] = Math.max(0, (state.seeds[k] ?? 0) + n);
    if (!state.seeds[k]) delete state.seeds[k];
    emit({ type: 'seeds' });
    changed(true);
  },
  /** Take `n` of a kind out of his basket (sold, eaten, offered): false when there are not that many. */
  takeFromBasket(k: PlantKindId, n: number): boolean {
    if ((state.basket[k] ?? 0) < n) return false;
    state.basket[k] = (state.basket[k] ?? 0) - n;
    if (!state.basket[k]) delete state.basket[k];
    emit({ type: 'basket' });
    changed(true);
    return true;
  },
  /** Grandma's seeds taken (once). */
  takeGift(): void {
    state.gift = true;
    changed(true);
  },
  /** The monk gave him the bodhi sapling (once). */
  setBodhiGiven(): void {
    state.bodhiGiven = true;
    changed(true);
  },

  /**
   * A shot's or a check's URL values (nothing is saved in shots): `garden=` the plants, `seeds=`, `basket=`, `can=`,
   * `gardenclock=`. `spots(n)` gives `n` free places (m) in front of the house for the lineups (roam/_garden.ts).
   */
  fromUrl(q: URLSearchParams, spots: (n: number, trees: boolean) => readonly (readonly [number, number])[]): void {
    const clock = q.get('gardenclock');
    if (clock !== null && Number.isFinite(+clock)) state.clock = Math.max(0, +clock);
    const sea = q.get('season');
    if (sea !== null && Number.isFinite(+sea)) state.year0 = frac(+sea - state.clock / YEAR_DAYS);
    const jar = q.get('jar');
    if (jar !== null && Number.isFinite(+jar)) state.jar = Math.max(0, Math.min(JAR_MAX, Math.round(+jar)));
    const can = q.get('can');
    if (can !== null && Number.isFinite(+can)) state.can = Math.max(0, Math.min(CAN_MAX, Math.round(+can)));
    const seeds = q.get('seeds');
    if (seeds === 'all') for (const k of GARDEN_KINDS) state.seeds[k] = 3;
    else if (seeds) for (const [k, n] of pairs(seeds)) state.seeds[k] = n;
    const basket = q.get('basket');
    if (basket === 'all') for (const k of GARDEN_KINDS) state.basket[k] = 2;
    else if (basket) for (const [k, n] of pairs(basket)) state.basket[k] = n;
    const g = q.get('garden');
    if (g === null) return;
    state.plants = [];
    if (g === '0') return;
    const want: { kind: PlantKindId; stage: Stage; mods: string[]; at?: readonly [number, number]; yaw?: number; seed?: number }[] = [];
    if (g === 'lineup') {
      for (const kind of GARDEN_KINDS) for (let s = 0; s <= 4; s++) want.push({ kind, stage: s as Stage, mods: s === 4 ? ['ripe'] : [] });
    } else if (g === 'demo') {
      for (const [kind, s, m] of DEMO) want.push({ kind, stage: s, mods: m ? [m] : [] });
    } else
      for (const part of g.split(',')) {
        const [spec, where] = part.split('@');
        const [kind, s, ...mods] = spec.split(':');
        if (!isKind(kind)) continue;
        const v = where?.split('/').map(Number) ?? [];
        const at = v.length >= 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]) ? ([v[0], v[1]] as const) : undefined;
        const yaw = Number.isFinite(v[2]) ? v[2] : undefined;
        const seed = Number.isFinite(v[3]) ? Math.min(1, Math.max(0, v[3])) : undefined;
        want.push({ kind, stage: Math.max(0, Math.min(4, Math.round(+(s ?? 4)) || 0)) as Stage, mods, at, yaw, seed });
      }
    // (those with a place of their own stand there; the rest in the lineup's rows)
    const placed = want.filter((w) => w.at);
    const crops = want.filter((w) => !w.at && !isTree(KINDS[w.kind]));
    const trees = want.filter((w) => !w.at && isTree(KINDS[w.kind]));
    const cs = spots(crops.length, false);
    const ts = spots(trees.length, true);
    const put = (w: (typeof want)[number], at: readonly [number, number] | undefined, i: number) => {
      if (!at) return;
      const k = KINDS[w.kind];
      const age = w.stage === 4 ? k.growDays : w.stage === 0 ? 0 : k.growDays * (k.stageAt[w.stage - 1] + (w.stage < 4 ? ((w.stage === 3 ? 1 : k.stageAt[w.stage]) - k.stageAt[w.stage - 1]) * 0.5 : 0));
      const p: Plant = { id: state.nextId++, kind: w.kind, x: at[0], z: at[1], yaw: w.yaw ?? (i * 2.39996) % (Math.PI * 2), seed: w.seed ?? ((i * 0.618034) % 1 + 1) % 1, at: 'home', age, wet: 0.5, dry: 0, dead: false, ripe: 0, fallen: 0, picked: 0, planted: 0 };
      for (const m of w.mods) {
        if (m === 'ripe') {
          if (k.fruit.pick === 'ground') p.fallen = k.fruit.count[1];
          p.ripe = k.fruit.pick === 'ground' ? 0.5 : 1;
        } else if (m === 'green') p.ripe = 0.5;
        else if (m === 'cut') p.picked = 1;
        else if (m === 'fallen') p.fallen = Math.max(1, k.fruit.count[1]);
        else if (m === 'wilt' || m === 'dry') {
          p.wet = 0;
          p.dry = m === 'wilt' ? k.dieAfter * 0.75 : k.dieAfter * 0.2;
        } else if (m === 'dead') p.dead = true;
      }
      state.plants.push(p);
    };
    crops.forEach((w, i) => put(w, cs[i], i));
    trees.forEach((w, i) => put(w, ts[i], i + crops.length));
    placed.forEach((w, i) => put(w, w.at, i + crops.length + trees.length));
  },

  /** For bug reports: the garden in a URL value (`garden=<kind>:<stage>[:mod],…`, near plants only). */
  report(near: (p: Plant) => boolean): string | null {
    const ps = state.plants.filter(near);
    if (!ps.length) return null;
    return ps
      .map((p) => {
        const l = lookOf(p);
        let mod = l.dead ? ':dead' : l.droop === 2 ? ':wilt' : l.droop === 1 ? ':dry' : '';
        if (!l.dead) mod += l.fruit === 2 || l.fallen ? ':ripe' : l.fruit === 1 ? ':green' : '';
        if (l.cut) mod += ':cut';
        // (where it stands, its turn and its variety: `@x/z/yaw/seed`, so the shot draws the same plant there)
        return `${p.kind}:${l.stage}${mod}@${p.x.toFixed(1)}/${p.z.toFixed(1)}/${p.yaw.toFixed(2)}/${p.seed.toFixed(3)}`;
      })
      .join(',');
  },
};

/** A shot's pretty garden: crops in their beds at every stage, a few trees, one thirsty, one dead. */
const DEMO: readonly (readonly [PlantKindId, Stage, string?])[] = [
  ['eggplant', 4, 'ripe'], ['eggplant', 4, 'green'], ['eggplant', 2], ['corn', 4, 'ripe'], ['corn', 3], ['corn', 3],
  ['corn', 1], ['pumpkin', 4, 'ripe'], ['pumpkin', 2, 'wilt'], ['sugarcane', 4, 'ripe'], ['sugarcane', 2], ['eggplant', 1, 'dead'],
  ['banana', 4, 'ripe'], ['papaya', 4, 'ripe'], ['guava', 3], ['mango', 4, 'ripe'], ['jackfruit', 2], ['coconut', 3], ['durian', 1], ['sugarPalm', 1],
];

function pairs(s: string): [PlantKindId, number][] {
  const out: [PlantKindId, number][] = [];
  for (const part of s.split(',')) {
    const [k, n] = part.split(':');
    if (isKind(k)) out.push([k, Math.max(0, Math.round(+(n ?? 1)) || 0)]);
  }
  return out;
}
