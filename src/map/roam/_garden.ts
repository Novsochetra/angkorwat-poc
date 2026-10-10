import '../audio/_garden';
import { HOME, HOME_AT, homeToWorld } from '../hamlet/_homePlan';
import { TIME } from '../time';
import type { GardenAction } from '../garden/actions';
import { GARDEN_KINDS, isTree, KINDS, type PlantKindId } from '../garden/kinds';
import { CAN_MAX, GARDEN, MAX_CROPS, MAX_TREES, ripeNow, thirsty, type Plant } from '../garden/state';
import { createGardenView, type GardenView } from '../garden/view';
import type { MapFrame, RoamMode } from '../types';
import { lang, num, t, type WordKey } from '../ui/lang';
import { addonBusy, registerAddon, type AddonEnv } from './_addons';
import { createSeedCard, type SeedCard, type SeedRow } from './_gardenCard';
import { GardenRing } from './_gardenRing';
import { AREA, canPlant, fillSpot, inGardenArea, jarAt, PLANT_AHEAD, REASON_WORDS, reachOf, type FillSpot, type SpotReason } from './_gardenSpots';
import { GardenToasts, plantWord } from './_gardenToasts';
import { installGardenWalk } from './_gardenWalk';
import { GardenWork, pickAction, plantAction } from './_gardenWork';
import type { RoamCtx } from './types';

/**
 * His home garden (add-on `garden`; the guide docs/map-work/addons.md "His home
 * garden"). What grows and how: garden/kinds.ts (the plants), garden/state.ts
 * (the saved garden, growth, water, harvest), garden/look.ts + garden/models/
 * (how each looks), garden/view.ts (drawn on the map), garden/actions.ts (the
 * work's timing: poses character/gardenWork.ts, props _gardenProps.ts, sounds
 * audio/_garden.ts).
 *
 * The player's garden, once the house is his (roam/_home.ts `HOME.owned`):
 * - **Where**: within `AREA` m of the house, not on paths, the stream, the house's
 *   things or a neighbour's yard, with room round it (_gardenSpots.ts `canPlant`).
 * - **The ring** (_gardenRing.ts): while he is in the garden with seeds in hand and
 *   nothing else to do here, a ring on the ground just in front of his feet, the
 *   size of the plant's room: soft green where it can go, red with the reason in
 *   the prompt's line where not. The ring's kind is the one he planted last (or
 *   the first he has seeds of), else the first that can go there.
 * - **The E row** (in this order, for the plant nearest in front of him within
 *   reach): pick a ripe one ("E  Pick the mango", "E  Cut the sugarcane", "E  Pick
 *   up the durian"), pull out a dead one, water a thirsty one ("E  Water the corn
 *   · can 5/8"; the can empty: "Your can is empty: fill it at the water jar or the
 *   stream", no key); then fill the can at the jar by his stair or the stream's
 *   edge before him; then "E  Plant here" (the seed card, _gardenCard.ts). With no
 *   seeds at all: a hint line, once a visit.
 * - **The work** (_gardenWork.ts) holds him through the action; **the toasts**
 *   (_gardenToasts.ts) say what the garden does meanwhile.
 *
 * URL (checks): `garden=lineup` (every kind at every stage, in rows before the
 * house), `garden=demo`, `garden=<kind>:<stage>[:ripe|:green|:dry|:wilt|:dead|:fallen],…`,
 * `garden=0` · `seeds=all|<kind>:<n>,…` · `basket=all|<kind>:<n>,…` · `can=<n>` ·
 * `gardenclock=<days>` (garden/state.ts `fromUrl`) · `gardenact=<action>:<t>` him at
 * his work held `t` s into it (the plant nearest him that suits it: `plant` /
 * `plantTree` on the spot before him, `fill` at the jar or the stream; the kind
 * `gardenkind=<kind>`) · `gardenring=1|<kind>` the ring (seeds given if he has none)
 * · `gardencard=1` the seed card open · `gardenhint=1` the no-seeds hint in a shot · `gardenspeed=<x>` (the dev server: the
 * garden's days x times faster). `report()` gives `garden=`, `seeds=`, `can=`,
 * `gardenact=`. `window.__garden` (shots, the dev server): the state and its verbs.
 */

let env: AddonEnv | null = null;
let view: GardenView | null = null;
let ring: GardenRing | null = null;
let card: SeedCard | null = null;
/** The map's days of the cycle last frame (NaN: not yet). */
let lastDays = Number.NaN;
/** The map's days moved on on purpose (sleep, "Wait for it": `TIME.skipped()`) as of last frame (NaN: not yet). */
let lastSkipped = Number.NaN;
/** The garden's days go this many times faster (`gardenspeed=`, the dev server and checks). */
let speed = 1;
/** The kind he means to plant (the last he planted; null: the first he has seeds of). */
let chosen: PlantKindId | null = null;
let lastCtx: RoamCtx | null = null;
/** The hint for no seeds: shown until (s); said this visit. */
let hintUntil = -1;
let hinted = false;
/** The frame's time when the E row last asked (the ring shows only while it does). */
let offerT = -1;

type ChoiceKind = 'pick' | 'water' | 'clear' | 'fill' | 'plant' | 'dry' | 'reason' | 'hint';
interface Choice {
  kind: ChoiceKind | null;
  plant: Plant | null;
  prompt: string | null;
  /** Planting: where (m), the ring's kind, can it go there. */
  x: number;
  z: number;
  ringKind: PlantKindId;
  ok: boolean;
  reason: SpotReason | null;
  readonly fill: { at: 'jar' | 'stream'; x: number; y: number; z: number };
}
const choice: Choice = { kind: null, plant: null, prompt: null, x: 0, z: 0, ringKind: 'eggplant', ok: false, reason: null, fill: { at: 'jar', x: 0, y: 0, z: 0 } };

// ── Words (made once a language and value: no string is made a frame) ──────────

let wordsLang = '';
const said = new Map<string, string>();
/** A prompt's words, kept: `key` names it, `make` makes it the first time. */
function words(key: string, make: () => string): string {
  if (lang() !== wordsLang) {
    wordsLang = lang();
    said.clear();
  }
  let s = said.get(key);
  if (s === undefined) {
    s = make();
    said.set(key, s);
  }
  return s;
}

const PICK_WORDS: Record<string, WordKey> = { low: 'gardenPick', reach: 'gardenPick', pole: 'gardenPick', cut: 'gardenCut', ground: 'gardenPickUp' };

function reasonWords(r: SpotReason, kind: PlantKindId): string {
  if (r === 'full') {
    const tree = isTree(KINDS[kind]);
    return words(`full|${tree}`, () => t(tree ? 'gardenNoFullTrees' : 'gardenNoFull', { n: num(tree ? MAX_TREES : MAX_CROPS) }));
  }
  return words(`no|${r}`, () => t(REASON_WORDS[r]));
}

// ── What E does here ───────────────────────────────────────────────────────

/** The kinds he has seeds or seedlings of that go in the home garden (the bodhi goes to the pagoda). */
function homeSeeds(): PlantKindId[] {
  return GARDEN.seedKinds();
}
const plantable = (k: PlantKindId) => k !== 'bodhi';

/** The plant nearest in front of him within reach that wants something (ripe, dead, thirsty), or null. */
function plantNear(ctx: RoamCtx): Plant | null {
  const b = ctx.body;
  const fx = Math.sin(b.yaw);
  const fz = Math.cos(b.yaw);
  let best: Plant | null = null;
  let score = Infinity;
  for (const p of GARDEN.plants) {
    if (p.at !== 'home') continue;
    const dx = p.x - b.pos.x;
    const dz = p.z - b.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > reachOf(p)) continue;
    if (!(ripeNow(p) || p.dead || thirsty(p))) continue;
    // (in front of him first: behind him only when very near)
    const dot = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
    if (dot < -0.35 && d > 0.9) continue;
    const s = d - dot * 0.9;
    if (s < score) {
      score = s;
      best = p;
    }
  }
  return best;
}

/** Work out what E does here now (`choice`). */
function choose(ctx: RoamCtx): void {
  const c = choice;
  c.kind = null;
  c.plant = null;
  c.prompt = null;
  const b = ctx.body;
  const p = b.pos;
  if (!inGardenArea(p.x, p.z)) return;
  // (on the veranda, the stair: nothing of the garden)
  if (p.y - ctx.world.field.heightAt(p.x, p.z) > 0.9) return;
  const pl = plantNear(ctx);
  if (pl && (ripeNow(pl) || pl.dead || GARDEN.can > 0)) {
    c.plant = pl;
    const k = KINDS[pl.kind];
    if (ripeNow(pl)) {
      c.kind = 'pick';
      c.prompt = words(`pick|${pl.kind}`, () => `E  ${t(PICK_WORDS[k.fruit.pick], { item: t(k.fruit.item) })}`);
    } else if (pl.dead) {
      c.kind = 'clear';
      c.prompt = words('clear', () => `E  ${t('gardenClear')}`);
    } else {
      c.kind = 'water';
      const n = GARDEN.can;
      c.prompt = words(`water|${pl.kind}|${n}`, () => `E  ${t('gardenWater', { plant: plantWord(pl.kind) })}  ·  ${t('gardenCanLeft', { n: num(n), max: num(CAN_MAX) })}`);
    }
    return;
  }
  const hasPlants = GARDEN.plants.some((q) => q.at === 'home');
  const seeds = homeSeeds();
  if (GARDEN.can < CAN_MAX && (hasPlants || seeds.length) && fillSpot(ctx.world, p.x, p.y, p.z, b.yaw, c.fill)) {
    c.kind = 'fill';
    c.prompt = words(`fill|${c.fill.at}`, () => `E  ${t(c.fill.at === 'jar' ? 'gardenFillJar' : 'gardenFill')}`);
    return;
  }
  if (pl) {
    // (a thirsty plant before him, the can empty)
    c.plant = pl;
    c.kind = 'dry';
    c.prompt = words('dry', () => t('gardenCanEmpty'));
    return;
  }
  const home: PlantKindId[] = seeds.filter(plantable);
  if (!home.length) {
    // No seeds: a hint, once a visit (only where he could plant).
    // (not in a shot's picture unless asked: `gardenhint=1`)
    if (!hinted && Math.hypot(p.x - HOME_AT.x, p.z - HOME_AT.z) < AREA && (!env?.shot || env.params.get('gardenhint') === '1')) {
      hinted = true;
      hintUntil = ctx.t + 7;
    }
    if (ctx.t < hintUntil) {
      c.kind = 'hint';
      c.prompt = words('hint', () => t(seeds.length ? 'gardenNoSeedsHome' : 'gardenNoSeeds'));
    }
    return;
  }
  // Planting: the spot before his feet; the ring's kind (the chosen one if it can go there, else the first that can).
  c.x = p.x + Math.sin(b.yaw) * PLANT_AHEAD;
  c.z = p.z + Math.cos(b.yaw) * PLANT_AHEAD;
  const want = chosen && home.includes(chosen) ? chosen : home[0];
  let ringKind = want;
  let reason = canPlant(ctx.world, want, c.x, c.z);
  if (reason)
    for (const k of home) {
      if (k === want || canPlant(ctx.world, k, c.x, c.z)) continue;
      ringKind = k;
      reason = null;
      break;
    }
  c.ringKind = ringKind;
  c.ok = !reason;
  c.reason = reason;
  if (reason) {
    c.kind = 'reason';
    c.prompt = reasonWords(reason, ringKind);
  } else {
    c.kind = 'plant';
    c.prompt = words('plant', () => `E  ${t('gardenPlant')}`);
  }
}

// ── The seed card ──────────────────────────────────────────────────────────

const COLORS: Record<PlantKindId, number> = {
  eggplant: 0x7a3a8a,
  corn: 0xf2c84a,
  pumpkin: 0xe8862a,
  sugarcane: 0x9a5a8a,
  banana: 0xf2d24a,
  papaya: 0xf08a2a,
  guava: 0xb8d870,
  mango: 0xf2c23a,
  jackfruit: 0xa8b848,
  durian: 0x9aa83a,
  coconut: 0x7aa848,
  sugarPalm: 0x3a2e28,
  bodhi: 0x6aa040,
};
const COUNT_WORDS = { seed: 'gardenHaveSeeds', cutting: 'gardenHaveCuttings', pup: 'gardenHavePups', seedling: 'gardenHaveSeedlings' } as const;

/** Open the seed card for the spot (x, z). */
function openCard(ctx: RoamCtx, x: number, z: number): void {
  if (!env) return;
  lastCtx = ctx;
  card ??= createSeedCard(env.uiSound);
  const world = ctx.world;
  card.ask(
    () => {
      const rows: SeedRow[] = homeSeeds().map((k) => {
        const kind = KINDS[k];
        const r = canPlant(world, k, x, z);
        return {
          kind: k,
          name: t(kind.name),
          count: t(COUNT_WORDS[kind.form], { n: num(GARDEN.seeds(k)) }),
          note: t(kind.note),
          size: t(isTree(kind) ? 'gardenTree' : 'gardenCrop'),
          off: r ? reasonWords(r, k) : null,
          shape: k === 'coconut' || k === 'sugarPalm' || k === 'banana' || k === 'papaya' ? 'palm' : isTree(kind) ? 'tree' : 'crop',
          color: COLORS[k],
        };
      });
      // (those that can go here first, in the shop's order)
      rows.sort((a, b) => Number(!!a.off) - Number(!!b.off));
      return {
        title: t('gardenCardTitle'),
        note: t('gardenCardNote', { c: num(GARDEN.count('crop')), cm: num(MAX_CROPS), t: num(GARDEN.count('tree')), tm: num(MAX_TREES) }),
        cancel: t('gardenCardCancel'),
        rows,
      };
    },
    (kind) => {
      if (!kind || !lastCtx || GardenWork.active) return;
      if (canPlant(world, kind, x, z)) return;
      chosen = kind;
      GardenWork.start(lastCtx, { action: plantAction(kind), kind, plant: null, spot: { x, z } });
    },
  );
}

// ── Checks ─────────────────────────────────────────────────────────────────

/** The plant nearest (x, z) that suits an action (a check's `gardenact=`): the right pick style, a thirsty or dead one, else the nearest. */
function plantFor(a: GardenAction, x: number, z: number): Plant | null {
  const suits = (p: Plant) => {
    if (a === 'clear') return p.dead;
    if (a === 'water') return !p.dead && !(isTree(KINDS[p.kind]) && p.age >= KINDS[p.kind].growDays);
    if (a.startsWith('pick')) return !p.dead && pickAction(p.kind) === a;
    return true;
  };
  let best: Plant | null = null;
  let bd = Infinity;
  for (const pass of [0, 1, 2])
    if (!best)
      for (const p of GARDEN.plants) {
        if (p.at !== 'home') continue;
        if (pass === 0 && !(suits(p) && (a.startsWith('pick') ? ripeNow(p) : true))) continue;
        if (pass === 1 && !suits(p)) continue;
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
  return best;
}

/** Hold him at an action (the URL's `gardenact=<action>:<t>`, `__garden.act`). */
function act(ctx: RoamCtx, a: GardenAction, at: number, kindParam: string | null): boolean {
  if (!(a in { plant: 1, plantTree: 1, water: 1, fill: 1, pickLow: 1, pickReach: 1, pickCut: 1, pickPole: 1, pickGround: 1, clear: 1 })) {
    console.warn(`[map] garden: no action "${a}"`);
    return false;
  }
  GardenWork.stop(ctx);
  const b = ctx.body;
  const want = kindParam && kindParam in KINDS ? (kindParam as PlantKindId) : null;
  if (a === 'plant' || a === 'plantTree') {
    const kind = want ?? (a === 'plantTree' ? 'mango' : 'eggplant');
    if (GARDEN.seeds(kind) <= 0) GARDEN.addSeeds(kind, 1);
    const x = b.pos.x + Math.sin(b.yaw) * PLANT_AHEAD;
    const z = b.pos.z + Math.cos(b.yaw) * PLANT_AHEAD;
    return GardenWork.freeze(ctx, { action: a, kind, plant: null, spot: { x, z } }, at);
  }
  if (a === 'fill') {
    const f: FillSpot = { at: 'jar', x: 0, y: 0, z: 0 };
    if (!fillSpot(ctx.world, b.pos.x, b.pos.y, b.pos.z, b.yaw, f)) {
      // (not by the stream: the jar)
      const [jx, jz] = jarAt();
      f.x = jx;
      f.z = jz;
      f.y = ctx.world.field.heightAt(jx, jz) + 0.82;
    }
    return GardenWork.freeze(ctx, { action: 'fill', kind: want ?? 'eggplant', plant: null, fill: f }, at);
  }
  const p = plantFor(a, b.pos.x, b.pos.z);
  if (!p) {
    console.warn(`[map] garden: no plant for "${a}" (garden=… puts some)`);
    return false;
  }
  return GardenWork.freeze(ctx, { action: a, kind: p.kind, plant: p }, at);
}

/** The crops' places of the last lineup (the trees keep off them). */
let lineupCrops: [number, number][] = [];

/**
 * `n` places for a shot's lineup (`garden=lineup|demo`, m), each one where the garden's own rules let a plant go
 * (_gardenSpots.ts `canPlant`, as the biggest crop or tree would need: off the Kulen foot trail and its band, off the
 * land step north of the house, clear of the spirit house, the grandmother's places, the stream), only closer to
 * each other than real spacing (a lineup is tight) and past the garden's 40 m when it must be. Rows across the
 * meadow before the house (its front looks north), nearest first: crops from local z 11, trees from z 22. The same
 * places every time (a scan in a fixed order).
 */
function lineupSpots(n: number, trees: boolean): [number, number][] {
  const out: [number, number][] = [];
  const world = env?.world;
  const gap = trees ? 4.6 : 1.7;
  const kind: PlantKindId = trees ? 'durian' : 'pumpkin';
  const x0 = trees ? -12 : -3;
  const x1 = trees ? 5 : 5;
  const ok = (x: number, z: number) => {
    if (!world) return true;
    const r = canPlant(world, kind, x, z, false);
    if (r && r !== 'room' && r !== 'full') return false;
    for (const [cx, cz] of out) if (Math.hypot(cx - x, cz - z) < gap * 0.98) return false;
    if (trees) for (const [cx, cz] of lineupCrops) if (Math.hypot(cx - x, cz - z) < 2.6) return false;
    return true;
  };
  for (let lz = trees ? 22 : 11; lz < 160 && out.length < n; lz += gap)
    for (let lx = x1; lx >= x0 - 1e-6 && out.length < n; lx -= gap) {
      const [x, z] = homeToWorld(lx, lz);
      if (ok(x, z)) out.push([x, z]);
    }
  // (no world, or the meadow full: in rows on, as they come)
  for (let i = out.length; i < n; i++) out.push(homeToWorld(x1 - (i % 4) * gap, 160 + Math.floor(i / 4) * gap));
  if (!trees) lineupCrops = out.slice();
  return out;
}

/** Break the keys that would start something else while he works (sitting, lying, a greeting, a light, the explorer menu). */
const BREAKERS = ['KeyJ', 'KeyL', 'KeyF', 'KeyC', 'KeyU', 'KeyP', 'Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3', 'KeyO', 'KeyI'];

registerAddon({
  id: 'garden',
  order: 45,
  get holding() {
    return GardenWork.active;
  },
  get handsBusy() {
    return GardenWork.active;
  },
  init(e) {
    env = e;
    view = createGardenView(e.world, e.shot);
    installGardenWalk(e.world);
    e.scene.add(view.object);
    ring = new GardenRing(e.scene, e.world.field);
    GardenWork.init(e);
    GardenToasts.init(e);
    // (a shot's or a check's garden, before the first frame: the overview's shots too; never on the live site,
    // where a link's values would replace the player's own saved garden)
    if (e.shot || import.meta.env.DEV) GARDEN.fromUrl(e.params, lineupSpots);
    const sp = Number(e.params.get('gardenspeed'));
    if ((import.meta.env.DEV || e.shot) && Number.isFinite(sp) && sp > 0) speed = sp;
    if (e.shot || import.meta.env.DEV) {
      // (the garden's last events, for checks)
      const log: string[] = [];
      GARDEN.on((ev) => {
        log.push(`${GARDEN.clock.toFixed(2)} ${ev.type}${'plant' in ev ? ` ${ev.plant.kind}#${ev.plant.id}` : ''}`);
        if (log.length > 80) log.shift();
      });
      Object.assign(window, {
        __garden: {
          events: log,
          state: () => ({
            clock: +GARDEN.clock.toFixed(3),
            can: GARDEN.can,
            seeds: Object.fromEntries(GARDEN.seedKinds().map((k) => [k, GARDEN.seeds(k)])),
            basket: Object.fromEntries(GARDEN.basketKinds().map((k) => [k, GARDEN.basket(k)])),
            plants: GARDEN.plants.map((p) => ({ id: p.id, kind: p.kind, x: +p.x.toFixed(2), z: +p.z.toFixed(2), age: +p.age.toFixed(3), wet: +p.wet.toFixed(3), dry: +p.dry.toFixed(3), dead: p.dead, ripe: +p.ripe.toFixed(3), fallen: p.fallen, ripeNow: ripeNow(p), thirsty: thirsty(p), at: p.at })),
            owned: HOME.owned,
            choice: { kind: choice.kind, plant: choice.plant?.id ?? null, prompt: choice.prompt, ring: ring?.shown ? { x: +choice.x.toFixed(2), z: +choice.z.toFixed(2), kind: choice.ringKind, ok: choice.ok, reason: choice.reason } : null },
            work: GardenWork.now,
            card: !!card?.open,
            chosen,
            speed,
          }),
          canPlant: (kind: PlantKindId, x: number, z: number) => (lastCtx ? canPlant(lastCtx.world, kind, x, z) : 'no ctx'),
          seeds: (kind: PlantKindId, n = 1) => GARDEN.addSeeds(kind, n),
          plant: (kind: PlantKindId, x: number, z: number) => {
            if (GARDEN.seeds(kind) <= 0) GARDEN.addSeeds(kind, 1);
            return GARDEN.plant(kind, x, z, 0, 0.5)?.id ?? null;
          },
          water: (id: number) => {
            const p = GARDEN.byId(id);
            return p ? GARDEN.water(p) : false;
          },
          pick: (id: number) => {
            const p = GARDEN.byId(id);
            return p ? GARDEN.pick(p) : 0;
          },
          remove: (id: number) => {
            const p = GARDEN.byId(id);
            if (p) GARDEN.remove(p);
          },
          fill: () => GARDEN.fillCan(),
          advance: (days: number, season = 0.1, rain = 0) => GARDEN.advance(days, season, rain),
          speed: (x: number) => (speed = x),
          act: (a: GardenAction, at = 1, kind: string | null = null) => (lastCtx ? act(lastCtx, a, at, kind) : false),
          card: () => lastCtx && openCard(lastCtx, choice.x, choice.z),
          canMax: CAN_MAX,
          kinds: GARDEN_KINDS,
        },
      });
    }
  },
  input(ctx, _mode, tap) {
    lastCtx = ctx;
    if (card?.open) return true;
    return GardenWork.active && tap(...BREAKERS);
  },
  offer(ctx, m) {
    lastCtx = ctx;
    offerT = ctx.t;
    if (m !== 'walk' || !env || GardenWork.active || card?.open || env.busy()) {
      choice.kind = null;
      return null;
    }
    choose(ctx);
    return choice.prompt;
  },
  use(ctx) {
    const c = choice;
    if (!env || GardenWork.active) return;
    switch (c.kind) {
      case 'pick':
        if (c.plant) GardenWork.start(ctx, { action: pickAction(c.plant.kind), kind: c.plant.kind, plant: c.plant });
        break;
      case 'water':
        if (c.plant) GardenWork.start(ctx, { action: 'water', kind: c.plant.kind, plant: c.plant });
        break;
      case 'clear':
        if (c.plant) GardenWork.start(ctx, { action: 'clear', kind: c.plant.kind, plant: c.plant });
        break;
      case 'fill':
        GardenWork.start(ctx, { action: 'fill', kind: chosen ?? 'eggplant', plant: null, fill: { ...c.fill } });
        break;
      case 'plant':
        openCard(ctx, c.x, c.z);
        break;
      default:
        break;
    }
  },
  hold(ctx, dt) {
    return GardenWork.hold(ctx, dt);
  },
  keys() {
    return GardenWork.keys();
  },
  after(ctx, m, dt) {
    lastCtx = ctx;
    GardenWork.after(ctx, dt);
    // The ring: only while the E row asked this frame and planting is what E does (or why not).
    const c = choice;
    const show = m === 'walk' && offerT === ctx.t && !GardenWork.active && !card?.open && (c.kind === 'plant' || c.kind === 'reason');
    if (show) ring?.show(c.x, c.z, KINDS[c.ringKind].room, c.ok);
    else if (!card?.open) ring?.show(null);
  },
  frame(f: MapFrame, m: RoamMode) {
    if (!view) return;
    // The garden's clock: the map's days as they run (sleep moves them on), else a day each `dayLength` s of play.
    // Only the time the frames account for counts (a hidden tab, a phone in another app, the loading screen, a stalled
    // page bring no growth: the plants grow while the game is played), plus the jumps that are meant (sleep).
    const days = TIME.days();
    const played = (f.dt > 0 ? f.dt : 0) / TIME.dayLength;
    const sk = TIME.skipped();
    const jumped = Number.isNaN(lastSkipped) ? 0 : Math.max(0, sk - lastSkipped);
    let d = 0;
    if (TIME.cycling()) d = Number.isNaN(lastDays) ? 0 : Math.min(days - lastDays, played * 1.5 + jumped);
    else d = played;
    lastSkipped = sk;
    lastDays = days;
    // (nothing dies on the map seen from above: only while he roams, where he can see it and come to water it)
    if (!(env?.shot ?? true) && d > 0) GARDEN.advance(Math.min(d * speed, 2), f.season, f.weather.rain, m !== 'overview');
    GARDEN.tick(f.dt);
    view.sync(GARDEN.plants);
    view.frame(f.camera, f.t);
    ring?.frame(f.dt > 0 ? f.dt : 0, f.night);
    // (what the garden says waits while something else holds him: asleep in his house)
    GardenToasts.frame(f.dt > 0 ? f.dt : 0, m !== 'overview' && addonBusy() && !GardenWork.active);
  },
  setMode(next, _prev, ctx) {
    card?.close();
    GardenWork.stop(ctx, next === 'overview');
    GardenToasts.setMode(next);
    ring?.show(null);
    choice.kind = null;
    // (a new visit: the hint may come again)
    if (next === 'overview') {
      hinted = false;
      hintUntil = -1;
    }
  },
  fromUrl(q, ctx) {
    lastCtx = ctx;
    const k = q.get('gardenkind');
    if (k && k in KINDS && k !== 'bodhi') chosen = k as PlantKindId;
    const r = q.get('gardenring');
    if (r) {
      if (r in KINDS && r !== 'bodhi') chosen = r as PlantKindId;
      if (!homeSeeds().filter(plantable).length) GARDEN.addSeeds(chosen ?? 'eggplant', 3);
    }
    const a = q.get('gardenact');
    if (a) {
      const [name, at] = a.split(':');
      act(ctx, name as GardenAction, Number(at) || 0, k);
    }
    if (q.get('gardencard')) {
      if (!homeSeeds().filter(plantable).length) for (const kk of ['eggplant', 'corn', 'mango', 'durian'] as const) GARDEN.addSeeds(kk, 2);
      const b = ctx.body;
      openCard(ctx, b.pos.x + Math.sin(b.yaw) * PLANT_AHEAD, b.pos.z + Math.cos(b.yaw) * PLANT_AHEAD);
    }
  },
  report() {
    const out: Record<string, string> = {};
    const g = GARDEN.report((p) => p.at === 'home');
    if (g) out.garden = g;
    const seeds = GARDEN.seedKinds();
    if (seeds.length) out.seeds = seeds.map((k) => `${k}:${GARDEN.seeds(k)}`).join(',');
    if (GARDEN.can) out.can = String(GARDEN.can);
    const w = GardenWork.now;
    if (w) {
      out.gardenact = `${w.action}:${w.t}`;
      out.gardenkind = w.kind;
    }
    return Object.keys(out).length ? out : null;
  },
});


