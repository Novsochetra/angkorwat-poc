import '../audio/_garden';
import { HOME, HOME_AT, homeToWorld } from '../hamlet/_homePlan';
import { TIME } from '../time';
import type { GardenAction } from '../garden/actions';
import { GARDEN_KINDS, GROWN, isTree, KINDS, stageOf, type PlantKindId } from '../garden/kinds';
import { CAN_MAX, GARDEN, JAR_MAX, MAX_CROPS, MAX_TREES, ripeNow, thirsty, type Plant } from '../garden/state';
import { createGardenView, type GardenView } from '../garden/view';
import type { MapFrame, RoamMode } from '../types';
import { lang, num, t, type WordKey } from '../ui/lang';
import { pad } from '../pad/pad';
import { createAskCard, type AskCard } from '../ui/ask';
import { addonBusy, registerAddon, type AddonEnv } from './_addons';
import { createSeedCard, type SeedCard, type SeedRow } from './_gardenCard';
import { CARRY } from './_carryHook';
import { GardenGhost } from './_gardenGhost';
import { AREA, AREA_SEEN, atHomeHouse, canPlant, fillSpot, inGardenArea, jarAt, PLANT_AHEAD, ghostAhead, REASON_WORDS, reachOf, type FillSpot, type SpotReason } from './_gardenSpots';
import { gardenSay, GardenToasts, plantWord } from './_gardenToasts';
import { installGardenWalk } from './_gardenWalk';
import { countWords, fallenDistance, GardenWork, pickAction, plantAction } from './_gardenWork';
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
 * - **Planting mode** (the player's choice: no ring while he walks): "E  Plant…" opens the
 *   seed card (_gardenCard.ts); a kind picked, a see-through ghost of it (_gardenGhost.ts)
 *   sits before his feet and follows him as he walks and turns, soft grey where it cannot
 *   go (the reason is the prompt's line); "E  Dig here" plants it (the work), and the mode
 *   stays on while he has seeds of the kind (a row is quick); F or C (the pad's ↓, the
 *   touch "Change seed") brings the card back; Esc (the pad's ○, the touch ✕ "Done") leaves
 *   it, never asking "Back to the map?". Out of the garden, the shoulder pole on him
 *   (_carryHook.ts `CARRY`), another mode: it ends.
 * - **The E row** (in this order, for the plant nearest in front of him within
 *   reach): pick a ripe one ("E  Pick the mango", "E  Cut the sugarcane", "E  Pick
 *   up the durian"), pull out a dead one, water a thirsty one ("E  Water the corn
 *   · can 5/8"; the can empty: "Your can is empty: fill it at the water jar or the
 *   stream", no key); then fill the can at the jar by his stair ("· jar 18/24": it holds
 *   what the rain and his buckets put in it; empty, a line says to carry water with the
 *   shoulder pole) or the stream's low edge before him; then "E  Plant…" (planting
 *   mode, above). With no seeds at all: a hint line, once a visit. Nothing of it while he
 *   carries the shoulder pole.
 * - **The work** (_gardenWork.ts) holds him through the action; **the toasts**
 *   (_gardenToasts.ts) say what the garden does meanwhile.
 *
 * URL (checks): `garden=lineup` (every kind at every stage, in rows before the
 * house), `garden=demo`, `garden=<kind>:<stage>[:ripe|:green|:dry|:wilt|:dead|:fallen],…`,
 * `garden=0` · `seeds=all|<kind>:<n>,…` · `basket=all|<kind>:<n>,…` · `can=<n>` ·
 * `gardenclock=<days>` (garden/state.ts `fromUrl`) · `gardenact=<action>:<t>` him at
 * his work held `t` s into it (the plant nearest him that suits it: `plant` /
 * `plantTree` on the spot before him, `fill` at the jar or the stream; the kind
 * `gardenkind=<kind>`) · `gardenring=1|<kind>` (or `gardenplant=`) planting mode and its ghost (seeds given if he has none)
 * · `gardencard=1` the seed card open · `gardenhint=1` the no-seeds hint in a shot · `gardenspeed=<x>` (the dev server: the
 * garden's days x times faster). `report()` gives `garden=`, `seeds=`, `can=`,
 * `gardenact=`. `window.__garden` (shots, the dev server): the state and its verbs.
 */

let env: AddonEnv | null = null;
let view: GardenView | null = null;
let ghost: GardenGhost | null = null;
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
/**
 * Planting mode: the kind he is planting (picked on the seed card), or null. While it is on, a ghost of the plant
 * sits before his feet and follows him (_gardenGhost.ts); E digs there; F (or C; the pad's ↓) the seed card again;
 * Esc (the pad's ○, the touch ✕) leaves it. After each planting it stays on while he has seeds of the kind.
 */
let planting: PlantKindId | null = null;
/** Planting mode now (worked out once a step): the spot (m), the plant's turn (to face him), can it go there, why not. */
const spot = { x: 0, z: 0, yaw: 0, ok: false, reason: null as SpotReason | null, step: -1, prompt: null as string | null };
/**
 * Planting mode's camera: the follow camera looks down more and stands a little further back (eased in as the mode
 * starts, out as it ends), so the ghost on the ground before him is in view past his hat; the player's drag or wheel
 * wins (it stops easing until the next time). Before it came: the camera's tilt and distance.
 */
const PLANT_CAM = { pitch: 0.66, distance: 7.5, rate: 2.5, back: 2, toward: 0.75, shoulder: 0.55 };
/** The focus's shift toward the ghost now (0‥1, eased): he stands lower in the picture, the ghost in its middle. */
let camToward = 0;
let camBefore: { pitch: number; distance: number } | null = null;
let camLetGo = false;
function plantingCamera(ctx: RoamCtx, on: boolean, dt: number): void {
  const cam = ctx.cam;
  const i = ctx.input;
  if (on) {
    camBefore ??= { pitch: cam.pitch, distance: cam.distance };
    if (i.lookPitch || i.zoom || i.lookYaw) camLetGo = true;
    const k = 1 - Math.exp(-PLANT_CAM.rate * dt);
    camToward += (1 - camToward) * k;
    shiftFocus(ctx);
    // (over his shoulder: the camera swings in a little to his side, so the ghost ahead is beside his hat, not under it)
    cam.behindYaw = ctx.body.yaw + PLANT_CAM.shoulder * camToward;
    if (camLetGo) return;
    cam.pitch += (PLANT_CAM.pitch - cam.pitch) * k;
    // (round to his shoulder, a little: the ghost ahead beside his hat)
    const want = ctx.body.yaw + PLANT_CAM.shoulder;
    cam.yaw += Math.atan2(Math.sin(want - cam.yaw), Math.cos(want - cam.yaw)) * k * 0.6;
    cam.distance += (Math.min(cam.maxDistance, Math.max(PLANT_CAM.distance, camBefore.distance)) - cam.distance) * k;
    return;
  }
  if (camToward > 0.001) {
    camToward *= 1 - (1 - Math.exp(-PLANT_CAM.back * dt));
    shiftFocus(ctx);
  } else camToward = 0;
  if (!camBefore) return;
  if (camLetGo || i.lookPitch || i.zoom) {
    camBefore = null;
    camLetGo = false;
    return;
  }
  const k = 1 - Math.exp(-PLANT_CAM.back * dt);
  cam.pitch += (camBefore.pitch - cam.pitch) * k;
  cam.distance += (camBefore.distance - cam.distance) * k;
  if (Math.abs(camBefore.pitch - cam.pitch) < 0.005 && Math.abs(camBefore.distance - cam.distance) < 0.05) camBefore = null;
}

/** The follow camera's focus moved part of the way from his chest toward the ghost (the walker set it this step). */
function shiftFocus(ctx: RoamCtx): void {
  if (camToward <= 0) return;
  const f = ctx.cam.focus;
  const k = PLANT_CAM.toward * camToward;
  f.x += (spot.x - f.x) * k;
  f.z += (spot.z - f.z) * k;
}

/** Planting mode's touch buttons (change seed, done). */
let touchBar: HTMLElement | null = null;

type ChoiceKind = 'pick' | 'water' | 'clear' | 'fill' | 'plant' | 'dig' | 'dry' | 'jarEmpty' | 'hint';
interface Choice {
  kind: ChoiceKind | null;
  plant: Plant | null;
  prompt: string | null;
  readonly fill: FillSpot;
}
const choice: Choice = { kind: null, plant: null, prompt: null, fill: { at: 'jar', x: 0, y: 0, z: 0, sx: 0, sz: 0 } };

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

/** Standing this near a fruit lying under its tree (m), E picks it up (however far the trunk is). */
const FALLEN_REACH = 1.5;

/** The plant nearest in front of him within reach that wants something (ripe, dead, thirsty), or null. */
function plantNear(ctx: RoamCtx, any = false): Plant | null {
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
    // (fruit lying under it — a durian's under its wide crown — is picked up from by the fruit too, where its marker is)
    if (d > reachOf(p) && !(!any && KINDS[p.kind].fruit.pick === 'ground' && d < reachOf(p) + 3 && ripeNow(p) && fallenDistance(p, b.pos.x, b.pos.z) <= FALLEN_REACH)) continue;
    if (any ? p.dead : !(ripeNow(p) || p.dead || thirsty(p))) continue;
    // (in front of him first: behind him only when very near; to dig one up, facing it and near)
    const dot = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
    if (dot < -0.35 && d > 0.9) continue;
    if (any && (dot < 0.5 || d > reachOf(p) * (isTree(KINDS[p.kind]) ? 1 : 0.75))) continue;
    const s = d - dot * 0.9;
    if (s < score) {
      score = s;
      best = p;
    }
  }
  return best;
}

/** Roaming steps counted (the garden's `input`, once a step), and the step `choice` was worked out in. */
let stepN = 0;
let choiceStep = -1;

/** The E row's two halves: the jobs on a plant or the can come early (`garden`), planting and the lines with no key late (`gardenPlant`). */
const JOBS: ReadonlySet<ChoiceKind | null> = new Set<ChoiceKind | null>(['pick', 'water', 'clear', 'fill']);

/** Work out what E does here now (`choice`), once a step. */
function chooseOnce(ctx: RoamCtx): void {
  if (choiceStep === stepN) return;
  choiceStep = stepN;
  choose(ctx);
}

/** Work out what E does here now (`choice`). */
function choose(ctx: RoamCtx): void {
  const c = choice;
  c.kind = null;
  c.plant = null;
  c.prompt = null;
  const b = ctx.body;
  const p = b.pos;
  // (the shoulder pole on him: his hands are on it; its add-on offers what can be done with the buckets)
  // (as far as the can is filled: the stream, the washing steps, the village bridge)
  if (CARRY.on || !inGardenArea(p.x, p.z, AREA + 25)) return;
  // (on the veranda, the stair: nothing of the garden; but on the washing steps' landing over the stream he fills the can)
  if (p.y - ctx.world.field.heightAt(p.x, p.z) > 0.9 && ctx.world.waterAt(p.x, p.z) === null) return;
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
  const fs = GARDEN.can < CAN_MAX && (hasPlants || seeds.length) ? fillSpot(ctx.world, p.x, p.y, p.z, b.yaw, c.fill) : null;
  if (fs) {
    if (c.fill.at === 'jar') {
      // (the jar holds what the rain and his buckets put in it: `JAR_MAX` pours)
      const n = Math.floor(GARDEN.jar);
      if (n < 1) {
        c.kind = 'jarEmpty';
        c.prompt = words('jarEmpty', () => t('gardenJarEmpty'));
        return;
      }
      c.kind = 'fill';
      c.prompt = words(`fill|jar|${n}`, () => `E  ${t('gardenFillJar')}  ·  ${t('gardenJarLeft', { n: num(n), max: num(JAR_MAX) })}`);
      return;
    }
    c.kind = 'fill';
    c.prompt = c.fill.at === 'rope' ? words('fill|rope', () => `E  ${t('gardenFillRope')}`) : words('fill|stream', () => `E  ${t('gardenFill')}`);
    return;
  }
  if (pl) {
    // (a thirsty plant before him, the can empty)
    c.plant = pl;
    c.kind = 'dry';
    c.prompt = words('dry', () => t('gardenCanEmpty'));
    return;
  }
  // A living plant before him with nothing else to do there: hold E to dig it up (a grown tree: cut it down, asked first).
  const any = plantNear(ctx, true);
  if (any) {
    c.plant = any;
    c.kind = 'dig';
    const tree = grownTree(any);
    c.prompt = words(`dig|${any.kind}|${tree}`, () => `E  ${t(tree ? 'gardenFellHold' : 'gardenDigUpHold', { plant: plantWord(any.kind) })}`);
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
  // Planting: "E  Plant…" (the seed card, then planting mode) within the garden, not under the house.
  if (Math.hypot(p.x - HOME_AT.x, p.z - HOME_AT.z) > AREA || atHomeHouse(p.x, p.z)) return;
  c.kind = 'plant';
  c.prompt = words('plantStart', () => `E  ${t('gardenPlantStart')}`);
}

// ── Digging up, cutting down (hold E) ───────────────────────────────────────

/** A grown tree: cut down (the `fell` work, asked first), not dug up. */
const grownTree = (p: Plant): boolean => isTree(KINDS[p.kind]) && stageOf(KINDS[p.kind], p.age) === GROWN;

/** E held this long (s) digs it up (a short press does nothing: a plant is not lost by a slip of the finger). */
const HOLD_FOR = 0.8;
/** E being held: on the keyboard (E, Enter), the pad's □, the touch Use button. */
const holdKeys = { key: false, touch: false };
let holdWired = false;
function wireHold(): void {
  if (holdWired || typeof window === 'undefined') return;
  holdWired = true;
  addEventListener('keydown', (e) => {
    if ((e.code === 'KeyE' || e.code === 'Enter') && !e.repeat) holdKeys.key = true;
  });
  addEventListener('keyup', (e) => {
    if (e.code === 'KeyE' || e.code === 'Enter') holdKeys.key = false;
  });
  addEventListener('blur', () => (holdKeys.key = holdKeys.touch = false));
  addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement | null)?.closest?.('.rt-use')) holdKeys.touch = true;
  }, true);
  const up = () => (holdKeys.touch = false);
  addEventListener('pointerup', up, true);
  addEventListener('pointercancel', up, true);
}
const eHeld = (): boolean => holdKeys.key || holdKeys.touch || pad.held('west');

/** The hold under way: the plant, how long so far (s). */
let holding: { plant: Plant; t: number } | null = null;
/** The prompt's and the touch Use button's fill bar (`--gd-hold` 0‥1). */
function holdBar(v: number | null): void {
  if (typeof document === 'undefined') return;
  for (const el of document.querySelectorAll<HTMLElement>('.rh-prompt, .rt-use')) {
    el.classList.toggle('gd-hold', v !== null);
    if (v !== null) el.style.setProperty('--gd-hold', v.toFixed(3));
  }
}

/** Each step while E is held on a plant: the bar fills; full, the work (or the question for a grown tree). Let go or away: nothing. */
function holdStep(ctx: RoamCtx, dt: number): void {
  const h = holding;
  if (!h) return;
  const p = h.plant;
  const b = ctx.body.pos;
  if (!eHeld() || !GARDEN.plants.includes(p) || Math.hypot(p.x - b.x, p.z - b.z) > reachOf(p) + 0.5 || GardenWork.active) {
    holding = null;
    holdBar(null);
    return;
  }
  h.t += dt;
  holdBar(Math.min(1, h.t / HOLD_FOR));
  if (h.t < HOLD_FOR) return;
  holding = null;
  holdBar(null);
  if (grownTree(p)) askFell(ctx, p);
  else GardenWork.start(ctx, { action: 'uproot', kind: p.kind, plant: p });
}

/** "Cut down the mango? It took 8 game days to grow." (Yes: the `fell` work; No: nothing.) */
let fellCard: AskCard | null = null;
let fellPlant: Plant | null = null;
const AXE = `<svg class="mu-icon" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges"><path fill="#8a6038" d="M7 5h2v10H7z"/><path fill="#c8ccd0" d="M3 2h6v1h1v4H9v1H6V7H4V6H3z"/><path fill="#e8eef2" d="M4 3h4v1H4z"/><path fill="#5a8a3a" d="M11 9h3v1h1v3h-1v1h-3v-1h-1v-3h1z"/></svg>`;
function askFell(ctx: RoamCtx, p: Plant): void {
  if (!env) return;
  fellPlant = p;
  lastCtx = ctx;
  fellCard ??= createAskCard(document.getElementById('ui') ?? document.body, {
    cls: 'gd-fell',
    icon: AXE,
    words: () => {
      const q = fellPlant;
      const k = q ? q.kind : 'mango';
      return {
        title: t('gardenFellAsk', { plant: plantWord(k) }),
        note: t('gardenFellNote', { n: num(Math.round(KINDS[k].growDays)) }),
        stay: t('gardenFellNo'),
        go: t('gardenFellYes'),
      };
    },
    onGo: () => {
      const q = fellPlant;
      fellPlant = null;
      if (q && lastCtx && GARDEN.plants.includes(q) && !GardenWork.active) GardenWork.start(lastCtx, { action: 'fell', kind: q.kind, plant: q });
    },
    sound: env.uiSound,
  });
  fellCard.ask();
}

// ── Planting mode ──────────────────────────────────────────────────────────

const onTouch = () => typeof document !== 'undefined' && document.body.classList.contains('roam-touch') && !document.body.classList.contains('pad-on');

/** Planting mode's spot and prompt now (once a step). */
function plantingNow(ctx: RoamCtx): void {
  if (spot.step === stepN || !planting) return;
  spot.step = stepN;
  const b = ctx.body;
  const ahead = ghostAhead(planting);
  spot.x = b.pos.x + Math.sin(b.yaw) * ahead;
  spot.z = b.pos.z + Math.cos(b.yaw) * ahead;
  // (the plant faces him)
  spot.yaw = b.yaw + Math.PI;
  const r = atHomeHouse(b.pos.x, b.pos.z) ? 'house' : canPlant(ctx.world, planting, spot.x, spot.z);
  spot.ok = !r;
  spot.reason = r;
  const k = planting;
  const n = GARDEN.seeds(k);
  const keys = words('plantKeys', () => `F  ${t('gardenChangeSeed')}  ·  Esc  ${t('gardenDone')}`);
  if (!r) spot.prompt = words(`dig|${k}|${n}`, () => `E  ${t('gardenDig', { plant: plantWord(k), n: num(n) })}  ·  ${keys}`);
  else if (onTouch()) spot.prompt = reasonWords(r, k);
  else spot.prompt = words(`dignot|${r}|${k}`, () => `${reasonWords(r, k)}  ·  ${keys}`);
}

/** Into planting mode with `kind` (the seed card's pick). */
function enterPlanting(kind: PlantKindId): void {
  if (!planting) camLetGo = false;
  planting = kind;
  chosen = kind;
  spot.step = -1;
  ghost?.setKind(kind);
  showTouchBar(true);
}

/** Out of planting mode (Esc, ○, the touch ✕, his seeds of the kind gone, out of the garden, another mode). */
function exitPlanting(): void {
  if (!planting) return;
  planting = null;
  ghost?.show(null);
  showTouchBar(false);
}

/** Planting mode's buttons on a touch screen: change the seed, done (the Use button digs). */
function showTouchBar(on: boolean): void {
  if (!env || typeof document === 'undefined') return;
  if (!touchBar && on) {
    injectTouchStyle();
    const el = document.createElement('div');
    el.className = 'gd-plantbar';
    el.innerHTML = `<button type="button" class="gd-pb mu-frame mu-sm" data-do="change"><span class="mu-bg"></span><span class="gd-pb-t"></span></button><button type="button" class="gd-pb gd-pb-done mu-frame mu-sm" data-do="done"><span class="mu-bg"></span><span class="gd-pb-x" aria-hidden="true">✕</span><span class="gd-pb-t"></span></button>`;
    el.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!btn) return;
      env?.uiSound('select');
      if (btn.dataset.do === 'done') exitPlanting();
      else if (lastCtx) openCard(lastCtx);
    });
    env.layer.append(el);
    touchBar = el;
  }
  if (!touchBar) return;
  const [a, b] = touchBar.querySelectorAll<HTMLElement>('.gd-pb-t');
  a.textContent = t('gardenChangeSeed');
  b.textContent = t('gardenDone');
  touchBar.classList.toggle('is-on', on);
}

let touchStyled = false;
function injectTouchStyle(): void {
  if (touchStyled) return;
  touchStyled = true;
  const st = document.createElement('style');
  st.textContent = `
    .gd-plantbar { position: absolute; left: 50%; bottom: calc(206px + 4vh); transform: translateX(-50%); display: none; gap: 10px; z-index: 6; pointer-events: auto; }
    body.roam-touch:not(.pad-on) .gd-plantbar.is-on { display: flex; }
    .gd-pb { position: relative; display: inline-flex; white-space: nowrap; align-items: center; gap: 6px; min-height: 40px; padding: 0 14px; border: 0; background: none; color: var(--mu-ink); cursor: pointer;
      font: 700 14px / 1 var(--mu-display); --mu-edge: var(--mu-btn-edge); touch-action: manipulation; }
    .gd-pb > .mu-bg { background: var(--mu-btn); }
    .gd-pb-x { font-size: 13px; opacity: 0.85; }
    :lang(km) .gd-pb { font-size: 15px; }
    .gd-pb:active { transform: scale(0.96); }`;
  document.head.append(st);
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

/** The seed card: what he will plant (then planting mode). A kind is greyed only when the garden has no room left of its size. */
function openCard(ctx: RoamCtx): void {
  if (!env) return;
  lastCtx = ctx;
  card ??= createSeedCard(env.uiSound);
  card.ask(
    () => {
      const rows: SeedRow[] = homeSeeds().map((k) => {
        const kind = KINDS[k];
        const r: SpotReason | null = k === 'bodhi' ? 'pagoda' : !GARDEN.roomFor(kind.size) ? 'full' : null;
        return {
          kind: k,
          name: t(kind.name),
          count: countWords(COUNT_WORDS[kind.form], GARDEN.seeds(k)),
          note: t(kind.note),
          size: t(isTree(kind) ? 'gardenTree' : 'gardenCrop'),
          off: r ? reasonWords(r, k) : null,
          shape: k === 'coconut' || k === 'sugarPalm' || k === 'banana' || k === 'papaya' ? 'palm' : isTree(kind) ? 'tree' : 'crop',
          color: COLORS[k],
        };
      });
      // (those that can be planted first, in the shop's order)
      rows.sort((a, b) => Number(!!a.off) - Number(!!b.off));
      return {
        title: t('gardenCardTitle'),
        note: t('gardenCardNote', { c: num(GARDEN.count('crop')), cm: num(MAX_CROPS), t: num(GARDEN.count('tree')), tm: num(MAX_TREES) }),
        cancel: t('gardenCardCancel'),
        rows,
      };
    },
    (kind) => {
      if (!kind || GardenWork.active || kind === 'bodhi' || GARDEN.seeds(kind) <= 0) return;
      enterPlanting(kind);
    },
  );
}

// ── Checks ─────────────────────────────────────────────────────────────────

/** The plant nearest (x, z) that suits an action (a check's `gardenact=`): the right pick style, a thirsty or dead one, else the nearest. */
function plantFor(a: GardenAction, x: number, z: number): Plant | null {
  const suits = (p: Plant) => {
    if (a === 'clear') return p.dead;
    if (a === 'uproot') return !p.dead && !grownTree(p);
    if (a === 'fell') return !p.dead && grownTree(p);
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
  if (!(a in { plant: 1, plantTree: 1, water: 1, fill: 1, fillRope: 1, pickLow: 1, pickReach: 1, pickCut: 1, pickPole: 1, pickGround: 1, clear: 1, uproot: 1, fell: 1 })) {
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
  if (a === 'fill' || a === 'fillRope') {
    const f: FillSpot = { at: 'jar', x: 0, y: 0, z: 0, sx: b.pos.x, sz: b.pos.z };
    const r = fillSpot(ctx.world, b.pos.x, b.pos.y, b.pos.z, b.yaw, f);
    if (!r) {
      f.at = 'jar';
      // (not by the stream: the jar)
      const [jx, jz] = jarAt();
      f.x = jx;
      f.z = jz;
      f.y = ctx.world.field.heightAt(jx, jz) + 0.82;
    }
    return GardenWork.freeze(ctx, { action: f.at === 'rope' ? 'fillRope' : 'fill', kind: want ?? 'eggplant', plant: null, fill: f }, at);
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
    ghost = new GardenGhost(e.scene, e.world);
    wireHold();
    if (typeof document !== 'undefined') {
      // (the hold's fill bar under the prompt's words and on the touch Use button)
      const st = document.createElement('style');
      st.textContent = `.rh-prompt.gd-hold::after, .rt-use.gd-hold::after { content: ''; position: absolute; left: 12%; right: 12%; bottom: 4px; height: 4px; border-radius: 2px;
        background: linear-gradient(90deg, #ffe7a0, #f7bd40); transform: scaleX(var(--gd-hold, 0)); transform-origin: left center; pointer-events: none; box-shadow: 0 0 6px rgba(255, 200, 90, 0.6); }`;
      document.head.append(st);
    }
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
            choice: { kind: choice.kind, plant: choice.plant?.id ?? null, prompt: choice.prompt },
            planting: planting ? { kind: planting, x: +spot.x.toFixed(2), z: +spot.z.toFixed(2), ok: spot.ok, reason: spot.reason, prompt: spot.prompt, ghost: !!ghost?.shown } : null,
            jar: +GARDEN.jar.toFixed(2),
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
          card: () => lastCtx && openCard(lastCtx),
          plantMode: (k: PlantKindId | null) => (k ? enterPlanting(k) : exitPlanting()),
          canMax: CAN_MAX,
          kinds: GARDEN_KINDS,
        },
      });
    }
  },
  input(ctx, m, tap, dt) {
    lastCtx = ctx;
    stepN++;
    if (card?.open || fellCard?.open) return true;
    holdStep(ctx, dt);
    if (GardenWork.active) return tap(...BREAKERS);
    if (planting) {
      const p = ctx.body.pos;
      // (out of it: the garden left behind, his hands on the shoulder pole, another mode, no seeds of the kind)
      if (m !== 'walk' || CARRY.on || !inGardenArea(p.x, p.z, AREA_SEEN) || GARDEN.seeds(planting) <= 0) {
        exitPlanting();
        return false;
      }
      const i = ctx.input;
      // Esc (the pad's ○, the touch ✕): out of planting mode — not "Back to the map?".
      if (i.exit) {
        i.exit = false;
        env?.uiSound('close');
        exitPlanting();
        return false;
      }
      // F or C (the pad's ↓): the seed card again (another kind); not a greeting, not a cheer.
      if (tap('KeyF', 'KeyC')) {
        const taps = i.taps as Set<string> | undefined;
        taps?.delete('KeyF');
        taps?.delete('KeyC');
        openCard(ctx);
        return true;
      }
    }
    return false;
  },
  offer(ctx, m) {
    lastCtx = ctx;
    if (m !== 'walk' || !env || GardenWork.active || card?.open || env.busy()) return null;
    // Planting mode: E digs where the ghost is (or why not); nothing else of the garden meanwhile.
    if (planting) {
      plantingNow(ctx);
      return spot.prompt;
    }
    chooseOnce(ctx);
    // (only a job on a plant or the can here, early: planting and the lines with no key are `gardenPlant`'s, late)
    return JOBS.has(choice.kind) ? choice.prompt : null;
  },
  use(ctx) {
    const c = choice;
    if (!env || GardenWork.active) return;
    if (planting) {
      plantingNow(ctx);
      if (spot.ok) GardenWork.start(ctx, { action: plantAction(planting), kind: planting, plant: null, spot: { x: spot.x, z: spot.z, yaw: spot.yaw } });
      return;
    }
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
        GardenWork.start(ctx, { action: c.fill.at === 'rope' ? 'fillRope' : 'fill', kind: chosen ?? 'eggplant', plant: null, fill: { ...c.fill } });
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
    // (planting mode's camera: in while he walks with the ghost, out after; the work's own camera while he digs)
    if (m === 'walk' && !GardenWork.active) plantingCamera(ctx, !!planting && !card?.open, dt);
    if (!planting) return;
    // His seeds of the kind all planted: out of planting mode (said once).
    if (!GardenWork.active && GARDEN.seeds(planting) <= 0) {
      const k = planting;
      exitPlanting();
      gardenSay(t('gardenPlantedAll', { plant: plantWord(k) }));
      return;
    }
    // The ghost before his feet (not while he digs, a card is open, or something else has him).
    const free = m === 'walk' && !GardenWork.active && !card?.open && !!env && !env.busy();
    if (free) {
      plantingNow(ctx);
      ghost?.show(spot.x, spot.z, spot.yaw, spot.ok);
    } else ghost?.show(null);
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
    view.frame(f.camera, f.t, f.drift, f.night);
    ghost?.frame(f.dt > 0 ? f.dt : 0);
    // (what the garden says waits while something else holds him: asleep in his house)
    GardenToasts.frame(f.dt > 0 ? f.dt : 0, m !== 'overview' && addonBusy() && !GardenWork.active);
  },
  setMode(next, _prev, ctx) {
    card?.close();
    fellCard?.close();
    holding = null;
    holdBar(null);
    GardenWork.stop(ctx, next === 'overview');
    GardenToasts.setMode(next);
    exitPlanting();
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
    // (planting mode with its ghost: the kind's seeds given if he has none)
    const r = q.get('gardenring') ?? q.get('gardenplant');
    if (r) {
      const kind: PlantKindId = r in KINDS && r !== 'bodhi' ? (r as PlantKindId) : (chosen ?? homeSeeds().filter(plantable)[0] ?? 'eggplant');
      if (GARDEN.seeds(kind) <= 0) GARDEN.addSeeds(kind, 3);
      enterPlanting(kind);
    }
    const a = q.get('gardenact');
    if (a) {
      const [name, at] = a.split(':');
      act(ctx, name as GardenAction, Number(at) || 0, k);
    }
    if (q.get('gardencard')) {
      if (!homeSeeds().filter(plantable).length) for (const kk of ['eggplant', 'corn', 'mango', 'durian'] as const) GARDEN.addSeeds(kk, 2);
      openCard(ctx);
    }
  },
  report() {
    const out: Record<string, string> = {};
    const g = GARDEN.report((p) => p.at === 'home');
    if (g) out.garden = g;
    const seeds = GARDEN.seedKinds();
    if (seeds.length) out.seeds = seeds.map((k) => `${k}:${GARDEN.seeds(k)}`).join(',');
    if (GARDEN.can) out.can = String(GARDEN.can);
    out.gardenclock = GARDEN.clock.toFixed(2);
    const basket = GARDEN.basketKinds();
    if (basket.length) out.basket = basket.map((k) => `${k}:${GARDEN.basket(k)}`).join(',');
    const w = GardenWork.now;
    if (w) {
      out.gardenact = `${w.action}:${w.t}`;
      out.gardenkind = w.kind;
    }
    return Object.keys(out).length ? out : null;
  },
});

/**
 * The garden's late half of the E row (after every other add-on's: a hammock, the sey, the dog, a ride…): "E  Plant
 * here" (the seed card) and the lines with no key — why not here (the red ring), the can is empty, no seeds yet.
 * Only when nothing else here has a real E: they never hide another's prompt (nor the touch Use button).
 */
registerAddon({
  id: 'gardenPlant',
  order: 95,
  offer(ctx, m) {
    lastCtx = ctx;
    if (m !== 'walk' || !env || planting || GardenWork.active || card?.open || env.busy()) return null;
    chooseOnce(ctx);
    return JOBS.has(choice.kind) ? null : choice.prompt;
  },
  use(ctx) {
    if (!env || GardenWork.active || planting) return;
    if (choice.kind === 'dig' && choice.plant) {
      // (held: the bar fills while E stays down; `holdStep`)
      wireHold();
      holding = { plant: choice.plant, t: 0 };
      holdBar(0);
      return;
    }
    if (choice.kind !== 'plant') return;
    openCard(ctx);
  },
});
