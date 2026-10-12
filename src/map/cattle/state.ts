import { progress } from '../progress';

/**
 * His own cattle (គោ), as they are, kept between visits (progress.ts
 * `cattle.herd`, `cattle.straw`, `cattle.clock`): every cow he has bought, the
 * rice-straw bundles (ចំបើង) in his stock, and the herd's own clock. No
 * three.js, nothing per frame allocated: the roaming add-on (roam/_cattle.ts)
 * moves it on each frame (`advance`) and draws the cows (roam/_cattleHerd.ts).
 *
 * **Time** is the herd's own clock (game days, saved), run as the garden's is
 * (garden/state.ts): with the map's days while the Time setting cycles (sleep
 * in his house moves it on), else a day each 360 s of play: the cattle grow
 * only while the game is played, never while it is shut.
 *
 * **Food**: a cow wants food once a game day. Fed (straw from his stock, or
 * grass he cut), it is full for `FULL` days; then it is hungry until fed
 * again. While full it grows (`grow`: fed days) and fills out (its condition
 * toward 1); hungry, it does not grow and gets thinner (its condition down to
 * `THIN_MIN`, never further: a calm game, no cow dies). Its weight is the
 * well-fed weight for its fed days (`wellFed`) times its condition.
 *
 * **Ages** by fed days: a calf (កូនគោ) under `YOUNG_AT`, young (គោក្មេង) under
 * `GROWN_AT`, then grown (គោធំ): about 3 and 6 fed days (18 and 36 minutes of
 * play fed every day). Only a grown cow can be ridden (roam/_cowRide.ts).
 *
 * **Prices** (riel; the pocket money is 20 000 ៛ a day, `_shopPurse.ts`): the
 * trader sells a calf for `PRICE.calf`, a young cow for `PRICE.young`, and buys
 * his cows back by their weight, a rate a kilo by their age, a little less for
 * a thin one (`value`): a calf raised well, grown at 260 kg, sells for about
 * 250 000 ៛; one left hungry for days much less.
 *
 * Shots save nothing and start with no cattle; their URL values set what they
 * show (`fromUrl`).
 */

export type CowAge = 'calf' | 'young' | 'grown';

export interface Cow {
  /** Unique, kept. */
  readonly id: number;
  /** When it was born (the herd's clock, game days; a bought one was born before). */
  readonly born: number;
  /** Fed days: it grows only while full (its age, `ageOf`). */
  grow: number;
  /** Kilograms now (its condition: `weight / wellFed(grow)`). */
  weight: number;
  /** When it was last fed (the herd's clock). */
  fed: number;
  /** Its look: the white or the grey-cream coat (0, 1) and a brightness step (0‥3). */
  readonly look: number;
  /** Its stake on the meadow north of his house (0‥3: cattle/plan.ts `STAKES`). */
  stake: number;
}

/** At most this many cows of his own. */
export const HERD_MAX = 4;
/** Straw bundles at most in his stock (they are stacked under his house). */
export const STRAW_MAX = 40;
/** Fed, a cow is full this many game days; then hungry. */
export const FULL = 1;
/** Fed days to be young, grown. */
export const YOUNG_AT = 3;
export const GROWN_AT = 6;
/** Its condition (weight over the well-fed weight) never falls under this; under `THIN` it looks thin and sad. */
export const THIN_MIN = 0.68;
export const THIN = 0.86;
/** A day full brings its condition up this much (to 1), a day hungry takes this much off. */
const GAIN = 0.15;
const LOSS = 0.06;

/** What the trader asks (riel), and a straw bundle's price. */
export const PRICE = { calf: 80_000, young: 150_000, straw: 1_000 } as const;
/** What he pays a kilo by age (riel), before the condition. */
const RATE: Record<CowAge, number> = { calf: 900, young: 850, grown: 960 };
/** The fed days of a calf and a young cow when he buys them. */
export const BOUGHT_GROW = { calf: 0.5, young: 3.5 } as const;

/** The well-fed weight (kg) at `g` fed days: a calf of 55 kg, 150 kg young, 260 kg grown, 320 kg at its fullest. */
export function wellFed(g: number): number {
  if (g <= 0) return 55;
  if (g < YOUNG_AT) return 55 + (95 * g) / YOUNG_AT;
  if (g < GROWN_AT) return 150 + (110 * (g - YOUNG_AT)) / (GROWN_AT - YOUNG_AT);
  return Math.min(320, 260 + (60 * (g - GROWN_AT)) / 6);
}

export const ageOf = (c: Pick<Cow, 'grow'>): CowAge => (c.grow < YOUNG_AT ? 'calf' : c.grow < GROWN_AT ? 'young' : 'grown');
/** Its condition: 1 well fed ‥ `THIN_MIN` thin. */
export const condOf = (c: Pick<Cow, 'grow' | 'weight'>): number => Math.max(THIN_MIN, Math.min(1, c.weight / wellFed(c.grow)));
/**
 * How it is drawn: the ox model's size (× `OX`), by its weight: grown and well fed at least as big as the village's
 * cattle (1.4, the people's scale: under him, 2.4 m tall, they must not look small), 1.54 at its fullest, a calf
 * bought ≈ 0.78, a young cow ≈ 1.15; a thin one a little smaller.
 */
export const sizeOf = (c: Pick<Cow, 'grow' | 'weight'>): number => 1.5 * Math.pow(Math.max(40, wellFed(c.grow) * (0.85 + 0.15 * condOf(c))) / 300, 0.45);
/** What the trader pays for it now (riel, to 500). */
export function value(c: Pick<Cow, 'grow' | 'weight'>): number {
  const v = c.weight * RATE[ageOf(c)] * (0.7 + 0.3 * condOf(c));
  return Math.max(500, Math.round(v / 500) * 500);
}

export type CattleEvent =
  | { type: 'bought' | 'sold' | 'fed' | 'hungry' | 'young' | 'grown' | 'thin'; cow: Cow }
  | { type: 'straw' };

interface Saved {
  v: 1;
  clock: number;
  nextId: number;
  herd: Cow[];
  straw: number;
}

const KEY_HERD = 'cattle.herd';
const KEY_STRAW = 'cattle.straw';
const KEY_CLOCK = 'cattle.clock';

const num = (v: unknown, fallback: number, lo = -Infinity, hi = Infinity): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
const isArr = (v: unknown): v is unknown[] => Array.isArray(v);

function load(): Saved {
  const clock = num(progress.get(KEY_CLOCK, 0), 0, 0);
  const straw = Math.round(num(progress.get(KEY_STRAW, 0), 0, 0, STRAW_MAX));
  const raw = progress.get(KEY_HERD, [], isArr as (v: unknown) => v is []) as unknown[];
  const herd: Cow[] = [];
  const ids = new Set<number>();
  const stakes = new Set<number>();
  // (an older or broken record: every value checked, what is wrong dropped or put right)
  for (const r of raw) {
    if (typeof r !== 'object' || r === null || herd.length >= HERD_MAX) continue;
    const q = r as Cow;
    if (!Number.isInteger(q.id) || ids.has(q.id)) continue;
    const grow = num(q.grow, 0, 0, 60);
    let stake = Math.round(num(q.stake, -1, -1, HERD_MAX - 1));
    if (stake < 0 || stakes.has(stake)) stake = freeStakeOf(stakes);
    ids.add(q.id);
    stakes.add(stake);
    herd.push({
      id: q.id,
      born: num(q.born, clock - grow, -1e6, 1e9),
      grow,
      weight: num(q.weight, wellFed(grow), wellFed(grow) * THIN_MIN, wellFed(grow)),
      fed: num(q.fed, clock - FULL, -1e9, clock),
      look: Math.round(num(q.look, 0, 0, 7)),
      stake,
    });
  }
  const top = herd.reduce((m, c) => Math.max(m, c.id), 0);
  return { v: 1, clock, nextId: Math.max(top + 1, Math.round(num(progress.get('cattle.next', 1), 1, 1))), herd, straw };
}

function freeStakeOf(taken: ReadonlySet<number>): number {
  for (let i = 0; i < HERD_MAX; i++) if (!taken.has(i)) return i;
  return 0;
}

const state: Saved = load();
const listeners: ((e: CattleEvent) => void)[] = [];
let dirty = false;
let saveIn = 0;

function emit(e: CattleEvent): void {
  for (const fn of listeners) fn(e);
}

/** Keep it now (after anything he did), or within a few seconds (the clock's growth). */
function flush(): void {
  if (!dirty) return;
  dirty = false;
  saveIn = 5;
  if (!progress.saving) return;
  progress.set(KEY_HERD, JSON.parse(JSON.stringify(state.herd)) as Parameters<typeof progress.set>[1]);
  progress.set(KEY_STRAW, state.straw);
  progress.set(KEY_CLOCK, +state.clock.toFixed(4));
  progress.set('cattle.next', state.nextId);
}
function changed(now = false): void {
  dirty = true;
  if (now) flush();
}

/** A cow's coat (`look & 1`: white, grey-cream) and its brightness step (`look >> 1`: 0‥3). */
export const coatVariant = (look: number): number => look & 1;
const TINTS = [1, 0.96, 1.03, 0.92];
export const coatTint = (look: number): number => TINTS[(look >> 1) & 3];
/** The looks of a shot's cows, in order (two white, two grey-cream, each its own brightness). */
const URL_LOOKS = [0, 3, 4, 7];

/** Small steps for a long jump of the clock (sleep): hunger, growth and thinning go in order. */
const STEP = 0.05;

/** It is hungry now (a game day since it was fed). */
export const hungry = (c: Cow, clock = state.clock): boolean => clock - c.fed >= FULL;
/** How long it has been hungry (game days; 0 while full). */
export const hungryFor = (c: Cow, clock = state.clock): number => Math.max(0, clock - c.fed - FULL);

function stepCow(c: Cow, from: number, d: number): void {
  const was = ageOf(c);
  const wasThin = condOf(c) < THIN;
  const fullUntil = c.fed + FULL;
  // (the part of the step it was full, the part hungry)
  const full = Math.max(0, Math.min(d, fullUntil - from));
  const empty = d - full;
  if (full > 0) {
    c.grow += full;
    const k = Math.min(1, condOf(c) + GAIN * full);
    c.weight = wellFed(c.grow) * k;
  }
  if (empty > 0) {
    if (from + full <= fullUntil && from + d > fullUntil) emit({ type: 'hungry', cow: c });
    const k = Math.max(THIN_MIN, condOf(c) - LOSS * empty);
    c.weight = wellFed(c.grow) * k;
  }
  const now = ageOf(c);
  if (now !== was) emit({ type: now === 'grown' ? 'grown' : 'young', cow: c });
  if (!wasThin && condOf(c) < THIN) emit({ type: 'thin', cow: c });
}

export const CATTLE = {
  get clock(): number {
    return state.clock;
  },
  get herd(): readonly Cow[] {
    return state.herd;
  },
  get straw(): number {
    return state.straw;
  },
  byId(id: number): Cow | null {
    return state.herd.find((c) => c.id === id) ?? null;
  },
  on(fn: (e: CattleEvent) => void): void {
    listeners.push(fn);
  },
  /** Room for one more cow. */
  get room(): boolean {
    return state.herd.length < HERD_MAX;
  },
  /** How many of his cows are hungry now. */
  hungryCount(): number {
    let n = 0;
    for (const c of state.herd) if (hungry(c)) n++;
    return n;
  },

  /** Move the herd on by `d` game days (roam/_cattle.ts, each frame; a sleep's jump in small steps). */
  advance(d: number): void {
    if (!(d > 0)) return;
    d = Math.min(d, 6);
    while (d > 1e-9) {
      const s = Math.min(STEP, d);
      for (const c of state.herd) stepCow(c, state.clock, s);
      state.clock += s;
      d -= s;
    }
    dirty = true;
  },
  /** Each frame (real seconds): saves what changed now and then. */
  tick(dt: number): void {
    saveIn -= dt;
    if (dirty && saveIn <= 0) flush();
  },

  /** He buys a calf or a young cow (the trader's card has taken the riel): the new cow, at a free stake. */
  buy(kind: 'calf' | 'young', look: number): Cow | null {
    if (!CATTLE.room) return null;
    const taken = new Set(state.herd.map((c) => c.stake));
    const grow = BOUGHT_GROW[kind];
    const c: Cow = { id: state.nextId++, born: state.clock - grow * 1.6, grow, weight: wellFed(grow), fed: state.clock, look, stake: freeStakeOf(taken) };
    state.herd.push(c);
    emit({ type: 'bought', cow: c });
    changed(true);
    return c;
  },
  /** He sells it to the trader: what it fetched (riel), or 0 (not his). */
  sell(c: Cow): number {
    const i = state.herd.indexOf(c);
    if (i < 0) return 0;
    const v = value(c);
    state.herd.splice(i, 1);
    emit({ type: 'sold', cow: c });
    changed(true);
    return v;
  },
  /** He feeds it (a bundle of straw from his stock: `straw`, false when he has none; or grass he cut). */
  feed(c: Cow, what: 'straw' | 'grass'): boolean {
    if (!state.herd.includes(c)) return false;
    if (what === 'straw') {
      if (state.straw <= 0) return false;
      state.straw--;
      emit({ type: 'straw' });
    }
    c.fed = state.clock;
    emit({ type: 'fed', cow: c });
    changed(true);
    return true;
  },
  /** Straw bundles bought (to `STRAW_MAX`): how many went in. */
  addStraw(n: number): number {
    const k = Math.max(0, Math.min(n, STRAW_MAX - state.straw));
    if (k <= 0) return 0;
    state.straw += k;
    emit({ type: 'straw' });
    changed(true);
    return k;
  },

  /**
   * A shot's or a check's URL values (nothing is saved in shots): `cattle=calf,young,grown,…` his cows at their
   * stakes (an age, or `<fed days>`, with `:thin`, `:hungry`, `:full` after it), `cattlehungry=1` every one hungry,
   * `cattlestraw=<n>`, `cattleclock=<days>`.
   */
  fromUrl(q: URLSearchParams): void {
    const clock = q.get('cattleclock');
    if (clock !== null && Number.isFinite(+clock)) state.clock = Math.max(0, +clock);
    const straw = q.get('cattlestraw');
    if (straw !== null && Number.isFinite(+straw)) state.straw = Math.max(0, Math.min(STRAW_MAX, Math.round(+straw)));
    const spec = q.get('cattle');
    if (spec !== null) {
      state.herd = [];
      if (spec !== '0' && spec !== '')
        for (const part of spec.split(',')) {
          if (state.herd.length >= HERD_MAX) break;
          const [age, ...mods] = part.split(':');
          const g = age === 'calf' ? 1.2 : age === 'young' ? 4.2 : age === 'grown' ? 8 : Number(age);
          if (!Number.isFinite(g)) continue;
          const grow = Math.max(0, Math.min(60, g));
          const thin = mods.includes('thin');
          const c: Cow = {
            id: state.nextId++,
            born: state.clock - grow * 1.5,
            grow,
            weight: wellFed(grow) * (thin ? THIN_MIN + 0.04 : 1),
            fed: mods.includes('hungry') || thin ? state.clock - FULL - (thin ? 3 : 0.2) : state.clock - 0.3,
            look: URL_LOOKS[state.herd.length],
            stake: state.herd.length,
          };
          state.herd.push(c);
        }
    }
    if (q.get('cattlehungry') === '1') for (const c of state.herd) c.fed = Math.min(c.fed, state.clock - FULL - 0.2);
  },

  /** For bug reports: the herd as a URL value (`cattle=<fed days>[:hungry|:thin],…`). */
  report(): string | null {
    if (!state.herd.length) return null;
    return state.herd.map((c) => `${c.grow.toFixed(1)}${condOf(c) < THIN ? ':thin' : hungry(c) ? ':hungry' : ''}`).join(',');
  },
};
