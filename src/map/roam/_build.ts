import { BAG, MATERIAL_IDS, STORE, haveOf, materialsText, missingOf, noMaterials, rielOf, useMaterials, type Materials } from '../build/materials';
import { boughtRiel, BUILT, PIECE_IDS, PIECES, pieceBack, pieceToWorld, type Built, type PieceId } from '../build/pieces';
import { addPlotBlocks, inPlot, pastPlot, PLOT_AREA, PLOT_BOX, PLOT_BUDGET, PLOT_CORNERS, plotBlocks, plotBlocksBy } from '../build/plot';
import { createPlotEdge, type PlotEdge } from '../build/plotEdge';
import { BLOCKS, cellMid, cellOf, CHUNK_CELLS, CHUNK_N } from '../blocks/store';
import { BUILD, distTo, toLocal } from '../build/state';
import { FOOT_KIND_IDS, FOOT_KINDS, type FootKind, type FootSide } from '../build/footPlan';
import { FOOTS, partFoot, type FootRec } from '../build/footState';
import { BED_SLEEP, bedPlace, type BedPlace } from '../build/beds';
import { createBuildView, pieceLook, type BuildView } from '../build/view';
import { graphicsNow } from '../graphics';
import { HOME, HOME_AT, homeToWorld } from '../hamlet/_homePlan';
import { pad } from '../pad/pad';
import { progress } from '../progress';
import type { MapFrame, RoamMode } from '../types';
import { createAskCard, type AskCard } from '../ui/ask';
import { lang, num, t, type WordKey } from '../ui/lang';
import { addonOffer, registerAddon, type AddonEnv } from './_addons';
import { createBuildCard, type BuildCard, type BuildRow } from './_buildCard';
import { BuildGhost } from './_buildGhost';
import { BUILD_REASON_WORDS, byHouse, canBuild, ghostAhead, overlapsBuilt, type BuildReason } from './_buildSpots';
import { BuildUses } from './_buildUses';
import { installBuildWalk } from './_buildWalk';
import { backWords, BuildWork, pieceJob, pieceWord, type WorkJob } from './_buildWork';
import { cannotFoot, fillFoot, footJob, FootMode, footWord, minPlan } from './_buildFoot';
import { riel } from './_shopPurse';
import type { RoamCtx } from './types';

/**
 * Building at home (add-on `build`; the guide docs/map-work/addons.md "Building
 * at home"). The pieces and their numbers: build/pieces.ts (the contract the
 * models, his cattle and this share); what he has built, saved: build/state.ts;
 * drawn on the map: build/view.ts; where a piece may stand: _buildSpots.ts; the
 * build card: _buildCard.ts; the ghost: _buildGhost.ts; his work with the
 * hammer: _buildWork.ts (his pose character/buildWork.ts, sounds
 * audio/_build.ts); the walk map: _buildWalk.ts; what the pieces are for (seats,
 * hammocks, the spirit house's prayer): _buildUses.ts.
 *
 * Once the house is his (`HOME.owned`), on foot:
 * - **By the house** (on the ground under it, round it, at its stair's foot), and
 *   anywhere on his land (build/plot.ts `PLOT_CORNERS`) where nothing else takes E (the garden's
 *   "Plant…" first): "E  Build…" opens the build card: every piece with what it
 *   costs (AWP-9: its materials, build/materials.ts; those he gathered, in his bag
 *   or his home store, are free; what he lacks he buys: "Missing: 1 bamboo pole =
 *   2,000 ៛"; what can never be gathered, cloth or straw, always bought, on a line
 *   of its own: "Bought: cloth 8,000 ៛"; the prices are the old ones), how many he has
 *   of how many; not enough riel for what he lacks: greyed with how much more.
 * - **Footprint buildings** (AWP-20): the card's first rows (a stilt house, a
 *   shed, a fence line) open footprint mode (_buildFoot.ts: he draws a
 *   rectangle, the building fits itself to it, written into the player's block
 *   layer as he hammers it up); this file routes its keys, its E, the camera and
 *   the touch bar to it, and its buildings take E by them as a piece does.
 * - **Build mode** (a piece picked): its ghost before him (green where it can
 *   stand, red with the reason where not: too far, water, the path, a rice field,
 *   past his land, a neighbour's yard, the house, not level, a tree, a plant, something
 *   he built, something else); it turns with him, `,` / `.` (the pad's d-pad ← →, the touch ⟲ ⟳) turn it
 *   15° more; a fence run's end snaps onto the end of one he built (in line, or turned a quarter: a corner). "E  Build here"
 *   pays for what he lacks (`purse.pay`), takes the rest from his bag, then his
 *   home store (`useMaterials`), and he builds it (the work); F / C (the pad's ↓) the card
 *   again; Esc (the pad's ○, the touch ✕) leaves the mode, never asking "Back to the
 *   map?". A fence or a lantern post: the mode stays on for the next.
 * - **By a piece** (facing it, within reach): half built, "E  Keep building";
 *   a seat (the bed, the shelter's bench), "E  Sit" (J / L there too: _rest.ts
 *   `REST_SEATS`); hold E (the bar fills, 0.8 s) to take it down — asked first,
 *   half its materials back (into his home store) and half its bought part's riel. A hammock's E is the hammock add-on's, the spirit house's
 *   "Pray" the shrine's (both before this).
 *
 * URL (shots and the dev server: a link never changes a player's saved pieces):
 * `build=<id>@x/z/yaw[:done],…` (yaw in degrees, done 0‥1), `build=all` (one of
 * each standing round the house), `build=0` · `buildcard=1` · `buildghost=<id>[:<deg>]`
 * (build mode, its ghost turned that much more) · `buildwork=<id>:<0‥1>[:<s>]` (him
 * at work on one, that far built, `s` into a stroke; the one of that kind under way,
 * else a new one before him) · `buildtake=<uid>` (the take-down question; `:<0‥1>`
 * him taking it down that far) · `buildsit=<uid>[:lie]` (sitting / lying on it) ·
 * `buildhint=1` · `lamps=<n>` (n lamp posts before the house, past the 8 a player may have: the placed lights'
 * check, sky/placedLights.ts). `report()` gives `build=` (and `buildghost=`, `buildwork=`).
 * `window.__build` (shots, the dev server): `state()`, `canBuild`, `add`, `card`,
 * `place`, `rebuild`. Console lines start `[build]`.
 */

/** Turning the ghost: a step (rad: 15°), a fine step (Shift + , / .: 5°), held on a step this far past its middle (rad). */
const TURN_STEP = Math.PI / 12;
const TURN_FINE = Math.PI / 36;
const TURN_HOLD = (4 * Math.PI) / 180;
/** The ghost's middle steps on his land's grid this fine (m). */
const GRID = 0.5;
/** "E  Build…" by the house: within this of its footprint and stair (m). */
const BY_HOUSE = 2.6;
/** Build mode ends past this far past his land (m). */
const MODE_FAR = 8;
/** "E  Build…" this far past his land too (m: standing on the trail by it, on the bank). */
const START_PAST = 2;
/** E held this long (s) on a piece takes it down (asked first). */
const HOLD_FOR = 0.8;
/** He reaches a piece from this far (m, his feet to its footprint), facing it. */
const PIECE_REACH = 1.25;
/**
 * A fence's end snaps onto another's end within this (m: the ghost's middle from where it would go); it goes on that
 * fence's own line, or square to it, when he faces within `align` of it (rad: 20°).
 */
const SNAP = { d: 1.5, align: (20 * Math.PI) / 180 };
/** Pieces the mode stays on for (one after another). */
const REPEAT: ReadonlySet<PieceId> = new Set<PieceId>(['fence', 'lamp']);
/**
 * Build mode's camera: tilt, distance at least (and per metre of the piece's reach; and per metre of a footprint building's height), its ease and back (1/s), the focus
 * toward the ghost, over his shoulder (rad); its first move (picked on the card): this quick (1/s), this long (s).
 */
const MODE_CAM = { pitch: 0.66, distance: 8, perReach: 1.1, perHigh: 1.8, rate: 2.5, back: 2, toward: 0.75, shoulder: 0.45, open: 5, openFor: 0.9 };

let env: AddonEnv | null = null;
let view: BuildView | null = null;
let ghost: BuildGhost | null = null;
let card: BuildCard | null = null;
let ask: AskCard | null = null;
let lastCtx: RoamCtx | null = null;
/** Build mode: the piece he is placing (picked on the card), its extra turn (rad). */
let placing: PieceId | null = null;
let turn = 0;
/** The 15° step of his land's lines the ghost holds (`landYaw`), or null (picked again). */
let heldStep: number | null = null;
/** Shift held (the fine turn). */
let shiftDown = false;
/** Shift was down as , or . went down (the fine turn: read on the key's own press, a quick chord is not missed). */
let fineKey = false;
/** Build mode now (worked out once a step): the spot (m), its turn, can it stand there, why not, the prompt. */
const spot = { x: 0, z: 0, yaw: 0, ok: false, reason: null as BuildReason | null, step: -1, prompt: null as string | null, snapped: false };
let stepN = 0;
/** What E does by a piece (or a footprint building) now (once a step). */
const near = { step: -1, piece: null as Built | null, foot: null as FootRec | null, sit: false, bed: null as BedPlace | null, prompt: null as string | null };
/** E held on a piece or a footprint building: it as a job, how far he is from it, how long, what a short press does. */
let pressing: { job: WorkJob; dist: (x: number, z: number) => number; t: number; tap: 'sit' | 'keep' | 'sleep' | null; bed?: BedPlace | null } | null = null;
/** What the take-down question is about. */
let asking: WorkJob | null = null;
/** The hint said (saved; a shot only with `buildhint=1`). */
let hinted: boolean = progress.get<boolean>('build.hinted', false);
let modeCamBefore: { pitch: number; distance: number } | null = null;
let modeCamToward = 0;
let modeCamLetGo = false;
/** Seconds left of the camera's first move into build mode. */
let modeCamOpen = 0;
let touchBar: HTMLElement | null = null;
/** The touch bar's turn ("45°") and the one shown. */
let touchDeg: HTMLElement | null = null;
let shownTouchDeg = -1;
/** A ⟲ ⟳ held (touch): 5° after `LONG.first` s, again every `LONG.every` s; the tap after it does not turn 15°. */
const LONG = { first: 0.45, every: 0.35 };
let longTimer: ReturnType<typeof setTimeout> | null = null;
let longFired = false;
/** His land's edge on the ground (while he builds). */
let edge: PlotEdge | null = null;
/** A check's `plotedge=1`: shown without building. */
let edgeHeld = false;

// ── The budget (build/plot.ts `PLOT_BUDGET`) ────────────────────────────────

/** A kind's blocks as the ghost shows it (its seed: _buildGhost.ts), made once a kind. */
const kindBlocks = new Map<PieceId, number>();
function blocksOf(id: PieceId): number {
  let n = kindBlocks.get(id);
  if (n === undefined) kindBlocks.set(id, (n = pieceLook(id, 0.37).boxes.length));
  return n;
}
/**
 * The pieces' blocks (each its own model's, with its own seed), counted again when the list changes. Every piece
 * counts, a piece left past his land from before AWP-31 too: it is drawn and saved like the rest, and the budget is
 * what a phone draws of everything he built (so taking it down makes room).
 */
let piecesAt = -1;
let piecesN = 0;
function piecesBlocks(): number {
  if (piecesAt !== BUILT.version) {
    piecesAt = BUILT.version;
    piecesN = 0;
    for (const p of BUILD.list) piecesN += pieceLook(p.id, p.seed).boxes.length;
  }
  return piecesN;
}
addPlotBlocks('pieces', piecesBlocks);
/** His land's box in the block layer's cells (blocks/store.ts: AWP-16). */
const PLOT_CELLS = { i0: cellOf(PLOT_BOX.x0), i1: cellOf(PLOT_BOX.x1), k0: cellOf(PLOT_BOX.z0), k1: cellOf(PLOT_BOX.z1) };
/**
 * His own blocks on his land: those of the chunks over its box whose cell's middle is inside its shape (`inPlot`: not
 * the neighbours' yards, the cattle trader's meadow or the herd's that the box takes in). Counted again only when the
 * layer changes (`onChange`), never every frame.
 */
function layerOnLand(): number {
  let n = 0;
  const b = PLOT_CELLS;
  for (const c of BLOCKS.chunkList()) {
    if (!c.count || c.i0 > b.i1 || c.i0 + CHUNK_N <= b.i0 || c.k0 > b.k1 || c.k0 + CHUNK_N <= b.k0) continue;
    for (let at = 0; at < CHUNK_CELLS; at++) {
      if (!c.cells[at]) continue;
      if (inPlot(cellMid(c.i0 + (at % CHUNK_N)), cellMid(c.k0 + (Math.floor(at / CHUNK_N) % CHUNK_N)))) n++;
    }
  }
  return n;
}
let layerN = -1;
BLOCKS.onChange(() => (layerN = -1));
addPlotBlocks('blocks', () => (layerN < 0 ? (layerN = layerOnLand()) : layerN));
// (the blocks still to come of footprint buildings under way: taken already, AWP-20; those written are the layer's)
addPlotBlocks('footprints', () => FOOTS.pending());
/** Room on his land for one more `id` (the budget)? A little over the line rounds the way the meter shows. */
const roomFor = (id: PieceId): boolean => plotBlocks() + blocksOf(id) <= PLOT_BUDGET;

// ── Words (made once a language and value: no string is made a frame) ──────────

let wordsLang = '';
const said = new Map<string, string>();
function words(key: string, make: () => string): string {
  if (lang() !== wordsLang) {
    wordsLang = lang();
    said.clear();
  }
  let s = said.get(key);
  if (s === undefined) {
    if (said.size > 600) said.clear();
    s = make();
    said.set(key, s);
  }
  return s;
}

const nameOf = (id: PieceId): string => t(PIECES[id].name as WordKey);
const onTouch = () => typeof document !== 'undefined' && document.body.classList.contains('roam-touch') && !document.body.classList.contains('pad-on');

// ── E held (to take a piece down) ───────────────────────────────────────────

const holdKeys = { key: false, touch: false };
let holdWired = false;
function wireHold(): void {
  if (holdWired || typeof window === 'undefined') return;
  holdWired = true;
  addEventListener('keydown', (e) => {
    shiftDown = e.shiftKey;
    if (e.code === 'Comma' || e.code === 'Period') fineKey = e.shiftKey;
    if ((e.code === 'KeyE' || e.code === 'Enter') && !e.repeat) holdKeys.key = true;
  });
  addEventListener('keyup', (e) => {
    shiftDown = e.shiftKey;
    if (e.code === 'KeyE' || e.code === 'Enter') holdKeys.key = false;
  });
  addEventListener('blur', () => (holdKeys.key = holdKeys.touch = shiftDown = false));
  addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement | null)?.closest?.('.rt-use')) holdKeys.touch = true;
  }, true);
  const up = () => (holdKeys.touch = false);
  addEventListener('pointerup', up, true);
  addEventListener('pointercancel', up, true);
}
const eHeld = (): boolean => holdKeys.key || holdKeys.touch || pad.held('west');

/** The prompt's and the touch Use button's fill bar (`--bd-hold` 0‥1). */
function holdBar(v: number | null): void {
  if (typeof document === 'undefined') return;
  for (const el of document.querySelectorAll<HTMLElement>('.rh-prompt, .rt-use')) {
    el.classList.toggle('bd-hold', v !== null);
    if (v !== null) el.style.setProperty('--bd-hold', v.toFixed(3));
  }
}

/** Each step while E is held on a piece: the bar fills; full, the question. Let go before: the short press's job. */
function holdStep(ctx: RoamCtx, dt: number): void {
  const h = pressing;
  if (!h) return;
  const b = ctx.body.pos;
  const gone = !h.job.alive() || h.dist(b.x, b.z) > PIECE_REACH + 0.6 || BuildWork.active;
  if (gone) {
    pressing = null;
    holdBar(null);
    return;
  }
  if (!eHeld()) {
    // (a short press: its own job)
    pressing = null;
    holdBar(null);
    if (h.tap === 'keep') BuildWork.start(ctx, h.job);
    else if (h.tap === 'sit') env?.controls.press('KeyJ');
    else if (h.tap === 'sleep' && h.bed) BED_SLEEP.start?.(h.bed);
    return;
  }
  h.t += dt;
  holdBar(Math.min(1, h.t / HOLD_FOR));
  if (h.t < HOLD_FOR) return;
  pressing = null;
  holdBar(null);
  askTake(ctx, h.job);
}

/** "Take down the bamboo bed? You get half its materials back: 3 bamboo poles." */
const SAW = `<svg class="mu-icon" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges"><path fill="#8a6038" d="M2 9h12v3H2z"/><path fill="#b08a5a" d="M2 9h12v1H2z"/><path fill="#c8ccd0" d="M6 2h2v6H6z"/><path fill="#e8eef2" d="M6 2h1v6H6z"/><path fill="#7a5a3a" d="M5 1h4v2H5z"/><path fill="#ffd27a" d="M10 5h1v1h-1zM11 6h1v1h-1zM12 4h1v1h-1z"/></svg>`;
function askTake(ctx: RoamCtx, b: WorkJob): void {
  if (!env) return;
  asking = b;
  lastCtx = ctx;
  ask ??= createAskCard(document.getElementById('ui') ?? document.body, {
    cls: 'bd-take',
    icon: SAW,
    words: () => {
      const q = asking;
      return {
        title: t('buildTakeAsk', { name: q ? q.word() : pieceWord({ id: 'kre' }) }),
        // (one that gives back only riel, half its bought part: worded so, not "half its materials")
        note: t(q && Object.keys(q.back().cost).length > 0 ? 'buildTakeNote' : 'buildTakeNoteRiel', { what: backWords(q ? q.back() : pieceBack('kre')) }),
        stay: t('buildTakeNo'),
        go: t('buildTakeYes'),
      };
    },
    onGo: () => {
      const q = asking;
      asking = null;
      if (q && lastCtx && q.alive() && !BuildWork.active) BuildWork.start(lastCtx, q, true);
    },
    sound: env.uiSound,
  });
  ask.ask();
}

// ── Build mode ─────────────────────────────────────────────────────────────

const _snap = { id: 'fence' as PieceId, x: 0, z: 0, yaw: 0 };

/**
 * The ghost's turn on his land's lines (AWP-30): `raw` (rad, as `body.yaw`) clicked to `TURN_STEP` (15°) counted from
 * the house's frame (`HOME_AT.facing`: his land's sides run along it), held on its step until `raw` is `TURN_HOLD`
 * past the middle to the next (no flicker as he sways).
 */
function landYaw(raw: number): number {
  const base = HOME_AT.facing;
  const steps = Math.round((2 * Math.PI) / TURN_STEP);
  const r = raw - base;
  if (heldStep !== null) {
    const d = Math.atan2(Math.sin(r - heldStep * TURN_STEP), Math.cos(r - heldStep * TURN_STEP));
    if (Math.abs(d) < TURN_STEP / 2 + TURN_HOLD) return base + heldStep * TURN_STEP;
  }
  heldStep = ((Math.round(r / TURN_STEP) % steps) + steps) % steps;
  return base + heldStep * TURN_STEP;
}
/** A spot (x or z, m) on his land's grid (`GRID`, from its box's corner: runs line up with its sides and each other). */
const onGrid = (v: number, o: number): number => o + Math.round((v - o) / GRID) * GRID;

/**
 * A fence's spot run on from the end of one he built, if one is near (into `spot`): its own end on that end. Its turn:
 * that fence's own line (on in line) or square to it (a corner) whenever the way he faces is within `SNAP.align` of it
 * (straight is the easy way: no 15° step can bend a run he means to go on with, and a fence built before AWP-30 at any
 * angle goes on at its own), then `turn` (, . / ⟲ ⟳ / the pad: a bend he asks for); past that, the ghost's own turn (a
 * bend of 30°, 45°…). Two runs meeting there may cross at the joint (_buildSpots.ts `fenceJoint`). The nearest such
 * spot to where the ghost was, within `SNAP.d`; never onto another piece. `raw`: the way the ghost's front would face
 * him, unclicked.
 */
function snapFence(raw: number): boolean {
  let best = SNAP.d;
  let bx = 0;
  let bz = 0;
  let by = spot.yaw;
  const half = PIECES.fence.w / 2;
  for (const f of BUILT.list) {
    if (f.id !== 'fence') continue;
    // (its own lines: on in line (0, π) or square (±π/2), the one nearest the way he faces)
    let yaw = spot.yaw;
    let near = SNAP.align;
    for (let q = 0; q < 4; q++) {
      const y = f.yaw + (q * Math.PI) / 2;
      const d = Math.abs(Math.atan2(Math.sin(y - raw), Math.cos(y - raw)));
      if (d < near) {
        near = d;
        yaw = y + turn;
      }
    }
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    _snap.yaw = yaw;
    // (its local x axis on the map is (cos, −sin): its ends half a run along it)
    const fc = Math.cos(f.yaw);
    const fs = Math.sin(f.yaw);
    for (let end = -1; end <= 1; end += 2) {
      const ex = f.x + end * half * fc;
      const ez = f.z - end * half * fs;
      for (let sig = -1; sig <= 1; sig += 2) {
        // (the new run's end `sig` on that end: its middle half a run back along its own way)
        const x = ex - sig * half * c;
        const z = ez + sig * half * s;
        const d = Math.hypot(x - spot.x, z - spot.z);
        if (d >= best) continue;
        _snap.x = x;
        _snap.z = z;
        let free = true;
        for (const b of BUILT.list) if (overlapsBuilt(_snap, b)) free = false;
        if (!free) continue;
        best = d;
        bx = x;
        bz = z;
        by = yaw;
      }
    }
  }
  if (best >= SNAP.d) return false;
  spot.x = bx;
  spot.z = bz;
  spot.yaw = Math.atan2(Math.sin(by), Math.cos(by));
  return true;
}

/** The turn shown in the prompt (degrees from the house's line: a fence's run 0‥179, a piece's front 0‥359). */
function shownDeg(id: PieceId, yaw: number): number {
  const m = id === 'fence' ? 180 : 360;
  const d = Math.round(((yaw - HOME_AT.facing - Math.PI) * 180) / Math.PI);
  return ((d % m) + m) % m;
}

/** Build mode's spot and prompt now (once a step). */
function placingNow(ctx: RoamCtx): void {
  if (spot.step === stepN || !placing || !env) return;
  spot.step = stepN;
  const b = ctx.body;
  // (its front to him, on his land's lines, turned more with , and .)
  const raw = b.yaw + Math.PI;
  spot.yaw = landYaw(raw) + turn;
  const ahead = ghostAhead(placing, spot.yaw, b.yaw);
  spot.x = onGrid(b.pos.x + Math.sin(b.yaw) * ahead, PLOT_BOX.x0);
  spot.z = onGrid(b.pos.z + Math.cos(b.yaw) * ahead, PLOT_BOX.z0);
  spot.snapped = placing === 'fence' && snapFence(raw);
  const r = canBuild(ctx.world, placing, spot.x, spot.z, spot.yaw);
  spot.ok = !r;
  spot.reason = r;
  const id = placing;
  const deg = shownDeg(id, spot.yaw);
  // (",." the d-pad's ← → on a pad, "⇧,." L2: hud.ts `promptPad`)
  const keys = words('modeKeys', () => `,.  ${t('buildTurn')}  ·  ⇧,.  ${t('buildTurnFine')}  ·  F  ${t('buildOther')}  ·  Esc  ${t('buildExit')}`);
  // (the turn on the Build here line itself: the phone's Use button reads it, "សង់នៅទីនេះ ៤៥°")
  if (!r) spot.prompt = words(`here|${id}|${deg}`, () => `E  ${t('buildHere')} ${num(deg)}°  ·  ${keys}`);
  else if (onTouch()) spot.prompt = words(`no|${r}`, () => t(BUILD_REASON_WORDS[r]));
  else spot.prompt = words(`not|${r}`, () => `${t(BUILD_REASON_WORDS[r])}  ·  ${keys}`);
  // (and by the touch bar's ⟲ ⟳, red or green)
  if (touchDeg && deg !== shownTouchDeg) {
    shownTouchDeg = deg;
    touchDeg.textContent = `${num(deg)}°`;
  }
}

/**
 * What building `id` takes now (AWP-9: its materials from his bag and home store are free; what he lacks he buys):
 * the materials missing, and the riel to pay (theirs and the piece's always-bought part, `boughtRiel`).
 */
function toPay(id: PieceId): { missing: Materials; riel: number } {
  const p = PIECES[id];
  const missing = missingOf(p.cost);
  return { missing, riel: rielOf(missing) + boughtRiel(id) };
}

/** Why he cannot build `id` now (all of it built, not enough riel for what he lacks), or null. */
function cannot(id: PieceId): string | null {
  const p = PIECES[id];
  if (BUILD.count(id) >= p.max) return words(`all|${id}`, () => t('buildAllBuilt', { n: num(p.max) }));
  const riels = env?.purse.riel ?? 0;
  const pay = toPay(id);
  if (riels < pay.riel) {
    const short = riel(pay.riel - riels);
    return noMaterials(pay.missing) ? t('buildNeed', { riel: short }) : t('buildNeedMat', { what: materialsText(pay.missing), riel: short });
  }
  if (!roomFor(id)) return words('room', () => t('buildNoRoom'));
  return null;
}

function enterPlacing(id: PieceId): void {
  if (!placing) {
    modeCamLetGo = false;
    modeCamOpen = FootMode.on ? 0 : MODE_CAM.openFor;
    turn = 0;
    heldStep = null;
  }
  exitFoot();
  placing = id;
  spot.step = -1;
  ghost?.setPiece(id);
  showTouchBar(true);
}

function exitPlacing(): void {
  if (!placing) return;
  placing = null;
  ghost?.show(null);
  showTouchBar(false);
}

/** Footprint mode (AWP-20: _buildFoot.ts) for a kind: build mode's camera and touch bar, its own E, keys and ghost. */
function enterFoot(kind: FootKind): void {
  if (!FootMode.on) {
    modeCamLetGo = false;
    modeCamOpen = placing ? 0 : MODE_CAM.openFor;
  }
  exitPlacing();
  FootMode.enter(kind);
  showTouchBar(true);
}

function exitFoot(): void {
  if (!FootMode.on) return;
  FootMode.exit();
  showTouchBar(false);
}

/** Esc (the pad's ○, the touch ✕) in footprint mode: the first corner again, else out of it. */
function backFoot(): void {
  if (!FootMode.back()) showTouchBar(false);
}

/** E (or a click) in footprint mode: the first corner, or "Build here" and his work on it. */
function useFoot(ctx: RoamCtx): void {
  FootMode.use(ctx, (c) => {
    const rec = FootMode.buildHere(c);
    showTouchBar(FootMode.on);
    if (rec) BuildWork.start(c, footJob(rec, (x, z) => c.world.field.heightAt(x, z)));
  });
}

/** What build mode's camera frames: the piece's ghost, or the footprint (its middle, its reach, m). */
function modeTarget(): { x: number; z: number; reach: number; high: number } | null {
  if (placing) return { x: spot.x, z: spot.z, reach: Math.hypot(PIECES[placing].w, PIECES[placing].d) / 2, high: 0 };
  return FootMode.on ? FootMode.target() : null;
}

/** E in build mode: pay, and he builds it. */
function buildHere(ctx: RoamCtx): void {
  if (!env || !placing) return;
  placingNow(ctx);
  if (!spot.ok) return;
  const id = placing;
  const p = PIECES[id];
  if (BUILD.count(id) >= p.max) {
    ctx.hud.toast(t('buildNoMore', { name: pieceWord({ id }) }));
    exitPlacing();
    return;
  }
  if (!roomFor(id)) {
    ctx.hud.toast(t('buildNoRoom'));
    exitPlacing();
    return;
  }
  // (what he lacks paid for first; then what he has taken, from his bag, then his home store)
  const pay = toPay(id);
  if (pay.riel > 0 && !env.purse.pay(pay.riel)) {
    ctx.hud.toast(t('buildNoMoney', { riel: riel(pay.riel - env.purse.riel) }));
    exitPlacing();
    return;
  }
  const piece = BUILD.add(id, spot.x, ctx.world.field.heightAt(spot.x, spot.z), spot.z, spot.yaw);
  if (!piece) {
    if (pay.riel > 0) env.purse.earn(pay.riel);
    return;
  }
  const used = useMaterials(p.cost);
  const both: Materials = {};
  for (const m of MATERIAL_IDS) if ((used.bag[m] ?? 0) + (used.store[m] ?? 0) > 0) both[m] = (used.bag[m] ?? 0) + (used.store[m] ?? 0);
  const what = materialsText(both);
  env.uiSound('select');
  ctx.hud.toast(what ? (pay.riel > 0 ? t('buildUsedPaid', { what, riel: riel(pay.riel) }) : t('buildUsed', { what })) : t('buildPaid', { riel: riel(pay.riel) }));
  console.info(`[build] ${piece.uid} at (${piece.x.toFixed(2)}, ${piece.z.toFixed(2)}) yaw ${((piece.yaw * 180) / Math.PI).toFixed(0)}°: used ${JSON.stringify(used)}, paid ${pay.riel} riel`);
  // (a fence or a lamp: the mode stays on for the next one, if he can)
  if (!REPEAT.has(id) || cannot(id)) exitPlacing();
  // (the next one starts straight again: a fence runs on in line from this one's end, a bend asked for again)
  turn = 0;
  BuildWork.start(ctx, piece);
}

/**
 * How far down build mode's camera looks for a ghost `ahead` m before him (rad): a near one (the jar, the lamp, the
 * spirit house: a step or two before him) a little steeper, so the line from the camera to it goes over his hat.
 */
const pitchFor = (ahead: number): number => MODE_CAM.pitch + Math.min(0.24, Math.max(0, (3.2 - ahead) * 0.2));
/** The follow camera's swing behind him before build mode held it (put back after). */
let followBefore: number | null = null;
/** Where build mode's camera last looked (eased back from it after). */
const lastAim = { x: 0, z: 0 };

/** Build mode's camera: it looks down more, further back, the ghost in the middle (the player's drag wins). */
function modeCamera(ctx: RoamCtx, on: boolean, dt: number): void {
  const cam = ctx.cam;
  const i = ctx.input;
  const k = 1 - Math.exp(-MODE_CAM.rate * dt);
  const aim = modeTarget();
  if (on && aim) {
    modeCamBefore ??= { pitch: cam.pitch, distance: cam.distance };
    if (i.lookPitch || i.zoom || i.lookYaw) modeCamLetGo = true;
    // (its first move quick: just picked, the ghost before him sits behind his hat until the camera has moved)
    const open = modeCamOpen > 0;
    modeCamOpen = Math.max(0, modeCamOpen - dt);
    const kk = open ? 1 - Math.exp(-MODE_CAM.open * dt) : k;
    modeCamToward += (1 - modeCamToward) * kk;
    const f = cam.focus;
    f.x += (aim.x - f.x) * MODE_CAM.toward * modeCamToward;
    f.z += (aim.z - f.z) * MODE_CAM.toward * modeCamToward;
    lastAim.x = aim.x;
    lastAim.z = aim.z;
    // (the follow camera holds its heading while he walks here: W walks along it, so he walks straight. Swinging round
    // behind him, over his shoulder, it turned the way W walks a little each step: he walked a curve, and a fence line
    // he stretched bent into an enclosure. The player's own turn, Q / R, a drag or the right stick, still turns it.)
    if (followBefore === null) followBefore = cam.follow;
    cam.follow = 0;
    cam.behindYaw = ctx.body.yaw;
    if (modeCamLetGo) return;
    // On the first move it goes round over his shoulder (a piece's ghost ahead beside his hat, not under it), standing
    // too, when it looks his way already (from in front of him it stays: no spin).
    // (a footprint's cursor is two steps ahead, clear of his hat: the camera straight behind him, so W walks the way he
    // faces and a fence line he stretches runs along it)
    const shoulder = ctx.body.yaw + (placing ? MODE_CAM.shoulder * modeCamToward : 0);
    const round = Math.atan2(Math.sin(shoulder - cam.yaw), Math.cos(shoulder - cam.yaw));
    if (open && Math.abs(round) < 1.3) cam.yaw += round * kk;
    const reach = aim.reach;
    cam.pitch += (pitchFor(Math.hypot(aim.x - ctx.body.pos.x, aim.z - ctx.body.pos.z)) - cam.pitch) * kk;
    // (a footprint building: far enough back that the camera looks over its roof, not from inside its ghost)
    const want = Math.min(cam.maxDistance, Math.max(MODE_CAM.distance + reach * MODE_CAM.perReach, aim.high * MODE_CAM.perHigh, modeCamBefore.distance));
    cam.distance += (want - cam.distance) * kk;
    return;
  }
  if (followBefore !== null) {
    cam.follow = followBefore;
    followBefore = null;
  }
  if (modeCamToward > 0.001) {
    modeCamToward *= Math.exp(-MODE_CAM.back * dt);
    const f = cam.focus;
    f.x += (lastAim.x - f.x) * MODE_CAM.toward * modeCamToward;
    f.z += (lastAim.z - f.z) * MODE_CAM.toward * modeCamToward;
  } else modeCamToward = 0;
  if (!modeCamBefore) return;
  if (modeCamLetGo || i.lookPitch || i.zoom) {
    modeCamBefore = null;
    modeCamLetGo = false;
    return;
  }
  const kb = 1 - Math.exp(-MODE_CAM.back * dt);
  cam.pitch += (modeCamBefore.pitch - cam.pitch) * kb;
  cam.distance += (modeCamBefore.distance - cam.distance) * kb;
  if (Math.abs(modeCamBefore.pitch - cam.pitch) < 0.005 && Math.abs(modeCamBefore.distance - cam.distance) < 0.05) modeCamBefore = null;
}

/** Build mode's buttons on a touch screen: turn, another piece, done (the Use button builds). */
function showTouchBar(on: boolean): void {
  if (!env || typeof document === 'undefined') return;
  if (!touchBar && on) {
    injectStyle();
    const el = document.createElement('div');
    el.className = 'bd-bar';
    el.innerHTML = `<button type="button" class="bd-tb mu-frame mu-sm" data-do="left" aria-label="⟲"><span class="mu-bg"></span><span class="bd-tb-t">⟲</span></button><button type="button" class="bd-tb mu-frame mu-sm" data-do="right" aria-label="⟳"><span class="mu-bg"></span><span class="bd-tb-t">⟳</span></button><span class="bd-tb-deg mu-frame mu-sm" aria-live="polite"><span class="mu-bg"></span><span class="bd-tb-dv">0°</span></span><button type="button" class="bd-tb mu-frame mu-sm" data-do="other"><span class="mu-bg"></span><span class="bd-tb-t"></span></button><button type="button" class="bd-tb mu-frame mu-sm" data-do="done"><span class="mu-bg"></span><span aria-hidden="true">✕</span><span class="bd-tb-t"></span></button>`;
    // ⟲ ⟳ held: 5° (the fine turn on a phone), again while held; the tap that ends it turns no more.
    const stopLong = () => {
      if (longTimer) clearTimeout(longTimer);
      longTimer = null;
    };
    el.addEventListener('pointerdown', (e) => {
      const d = (e.target as HTMLElement).closest<HTMLButtonElement>('button')?.dataset.do;
      if ((d !== 'left' && d !== 'right') || FootMode.on) return;
      stopLong();
      longFired = false;
      const again = (wait: number) => {
        longTimer = setTimeout(() => {
          longFired = true;
          turnBy(d === 'left' ? 1 : -1, TURN_FINE);
          again(LONG.every);
        }, wait * 1000);
      };
      again(LONG.first);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) el.addEventListener(ev, stopLong);
    el.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!btn) return;
      const d = btn.dataset.do;
      if ((d === 'left' || d === 'right') && longFired) {
        longFired = false;
        return;
      }
      env?.uiSound('select');
      if (FootMode.on) {
        // (footprint mode: ⟲ ⟳ the door side, ✕ the first corner again, then out)
        if (d === 'done') backFoot();
        else if (d === 'left') FootMode.turnDoor(-1);
        else if (d === 'right') FootMode.turnDoor(1);
        else if (lastCtx) openCard(lastCtx);
        return;
      }
      if (d === 'done') exitPlacing();
      else if (d === 'left') turnBy(1);
      else if (d === 'right') turnBy(-1);
      else if (lastCtx) openCard(lastCtx);
    });
    env.layer.append(el);
    touchBar = el;
    touchDeg = el.querySelector<HTMLElement>('.bd-tb-dv');
    shownTouchDeg = -1;
  }
  if (!touchBar) return;
  barWords();
  touchBar.classList.toggle('is-on', on);
}

/** The touch bar's words (footprint mode: ✕ is "Corner again" while he stretches one). */
let barSaid = '';
function barWords(): void {
  if (!touchBar) return;
  const done = FootMode.on && FootMode.stretching ? t('footAgain') : t('buildExit');
  const key = `${lang()}|${done}`;
  if (key === barSaid) return;
  barSaid = key;
  const ts = touchBar.querySelectorAll<HTMLElement>('.bd-tb-t');
  ts[2].textContent = t('buildOther');
  ts[3].textContent = done;
}

function turnBy(dir: number, step = TURN_STEP): void {
  turn = Math.atan2(Math.sin(turn + dir * step), Math.cos(turn + dir * step));
  spot.step = -1;
  env?.uiSound('tick');
}

let styled = false;
function injectStyle(): void {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const st = document.createElement('style');
  st.textContent = `
    .bd-bar { position: absolute; left: 50%; bottom: calc(206px + 4vh); transform: translateX(-50%); display: none; gap: 8px; z-index: 6; pointer-events: auto; }
    body.roam-touch:not(.pad-on) .bd-bar.is-on { display: flex; }
    .bd-tb { position: relative; display: inline-flex; white-space: nowrap; align-items: center; gap: 6px; min-height: 40px; min-width: 44px; justify-content: center; padding: 0 12px; border: 0; background: none; color: var(--mu-ink); cursor: pointer;
      font: 700 14px / 1 var(--mu-display); --mu-edge: var(--mu-btn-edge); touch-action: manipulation; }
    .bd-tb > .mu-bg { background: var(--mu-btn); }
    /* The ghost's turn by ⟲ ⟳ (AWP-30: the phone shows it): a quiet gold number. */
    .bd-tb-deg { position: relative; display: inline-flex; align-items: center; justify-content: center; min-width: 52px; min-height: 40px; padding: 0 10px; color: #ffe2a0;
      font: 700 15px / 1 var(--mu-display); --mu-edge: rgba(255, 216, 120, 0.4); pointer-events: none; }
    .bd-tb-deg > .mu-bg { background: rgba(10, 18, 30, 0.72); }
    .bd-tb-dv { position: relative; }
    :lang(km) .bd-tb { font-size: 15px; }
    .bd-tb:active { transform: scale(0.96); }
    .rh-prompt.bd-hold::after, .rt-use.bd-hold::after { content: ''; position: absolute; left: 12%; right: 12%; bottom: 4px; height: 4px; border-radius: 2px;
      background: linear-gradient(90deg, #ffe7a0, #f7bd40); transform: scaleX(var(--bd-hold, 0)); transform-origin: left center; pointer-events: none; box-shadow: 0 0 6px rgba(255, 200, 90, 0.6); }`;
  document.head.append(st);
}

// ── The card ───────────────────────────────────────────────────────────────

function openCard(ctx: RoamCtx): void {
  if (!env) return;
  lastCtx = ctx;
  card ??= createBuildCard(env.uiSound);
  card.ask(
    () => {
      // Footprint buildings first (AWP-20): what he draws, its cost from its smallest size.
      const feet: BuildRow[] = FOOT_KIND_IDS.map((k) => {
        const s = FOOT_KINDS[k];
        const cost = minPlan(k).cost;
        const miss = missingOf(cost);
        const lacks = !noMaterials(miss);
        const from = t('footFrom', { w: num(s.minLong / 2), d: num(s.min / 2) });
        return {
          id: `foot:${k}`,
          name: t(s.name as WordKey),
          count: `${num(FOOTS.count(k))}/${num(s.most)}`,
          note: lacks ? `${from} · ${t('buildMissing', { what: materialsText(miss), riel: riel(rielOf(miss)) })}` : `${t(s.line as WordKey)} · ${from}`,
          short: lacks,
          buy: null,
          cost: MATERIAL_IDS.filter((m) => (cost[m] ?? 0) > 0).map((m) => ({ m, n: cost[m]!, have: Math.min(cost[m]!, haveOf(m)) })),
          price: rielOf(miss) > 0 ? riel(rielOf(miss)) : '',
          off: cannotFoot(k, env?.purse.riel ?? 0),
        };
      });
      const rows: BuildRow[] = PIECE_IDS.map((id) => {
        const p = PIECES[id];
        const pay = toPay(id);
        const lacks = !noMaterials(pay.missing);
        return {
          id,
          name: nameOf(id),
          count: `${num(BUILD.count(id))}/${num(p.max)}`,
          // (what he lacks and its price, else the piece's own line)
          note: lacks ? t('buildMissing', { what: materialsText(pay.missing), riel: riel(rielOf(pay.missing)) }) : t(p.line as WordKey),
          short: lacks,
          // (what is always bought, on its own line: the price chip is the missing materials and this)
          buy: p.bought ? t('buildBought', { what: t(p.bought), riel: riel(boughtRiel(id)) }) : null,
          cost: MATERIAL_IDS.filter((m) => (p.cost[m] ?? 0) > 0).map((m) => ({ m, n: p.cost[m]!, have: Math.min(p.cost[m]!, haveOf(m)) })),
          price: pay.riel > 0 ? riel(pay.riel) : '',
          off: cannot(id),
        };
      });
      const used = Math.min(1, plotBlocks() / PLOT_BUDGET);
      const pct = Math.round(used * 100);
      const meter = { label: t('buildMeter'), value: t('buildMeterPct', { pct: num(pct) }), used };
      const have: Materials = {};
      for (const m of MATERIAL_IDS) if (haveOf(m) > 0) have[m] = haveOf(m);
      const mats = materialsText(have);
      return {
        title: t('buildCardTitle'),
        note: `${t('buildCardNote', { riel: riel(env?.purse.riel ?? 0) })}\n${mats ? t('buildCardHave', { what: mats }) : t('buildCardNoMat')}`,
        cancel: t('buildCardCancel'),
        rows: [...feet, ...rows],
        meter,
      };
    },
    (id) => {
      if (!id || BuildWork.active) return;
      if (id.startsWith('foot:')) {
        const k = id.slice(5) as FootKind;
        if (k in FOOT_KINDS && !cannotFoot(k, env?.purse.riel ?? 0)) enterFoot(k);
        return;
      }
      if (cannot(id as PieceId)) return;
      enterPlacing(id as PieceId);
    },
  );
}

// ── What E does by a piece ──────────────────────────────────────────────────

const _l: [number, number] = [0, 0];

/** The piece he faces within reach (once a step): its prompt. */
function nearNow(ctx: RoamCtx): void {
  if (near.step === stepN) return;
  near.step = stepN;
  near.piece = null;
  near.foot = null;
  near.bed = null;
  near.prompt = null;
  near.sit = false;
  const b = ctx.body;
  const p = b.pos;
  const fx = Math.sin(b.yaw);
  const fz = Math.cos(b.yaw);
  let best: Built | null = null;
  let score = Infinity;
  for (const q of BUILT.list) {
    if (Math.abs(p.y - q.y) > 2.5) continue;
    const d = distTo(q, p.x, p.z);
    if (d > PIECE_REACH) continue;
    // (the footprint's nearest point: in front of him, or he is on it)
    toLocal(q, p.x, p.z, _l);
    const P = PIECES[q.id];
    const cx = Math.max(-P.w / 2, Math.min(P.w / 2, _l[0]));
    const cz = Math.max(-P.d / 2, Math.min(P.d / 2, _l[1]));
    const c = Math.cos(q.yaw);
    const s = Math.sin(q.yaw);
    const wx = q.x + cx * c + cz * s - p.x;
    const wz = q.z - cx * s + cz * c - p.z;
    const l = Math.hypot(wx, wz);
    const dot = l > 0.05 ? (wx * fx + wz * fz) / l : 1;
    if (dot < 0.35) continue;
    const sc = d - dot * 0.5;
    if (sc < score) {
      score = sc;
      best = q;
    }
  }
  // A footprint building (AWP-20), on the ground by its land (its footprint and eaves, its stair, a fence's line).
  let foot: FootRec | null = null;
  if (p.y - ctx.world.field.heightAt(p.x, p.z) < 0.9)
    for (const r of FOOTS.list) {
      const d = FOOTS.distTo(r, p.x, p.z);
      if (d > PIECE_REACH) continue;
      // (under it or in it — a bed under his house, a piece in his shed —: the piece he faces first; the building from
      // outside it, or with no piece by him)
      if (d < 0.01 && best) continue;
      footNearest(r, p.x, p.z, _l);
      const wx = _l[0] - p.x;
      const wz = _l[1] - p.z;
      const l = Math.hypot(wx, wz);
      const dot = l > 0.05 ? (wx * fx + wz * fz) / l : 1;
      if (dot < 0.35) continue;
      const sc = d - dot * 0.5;
      if (sc < score) {
        score = sc;
        foot = r;
      }
    }
  if (foot) {
    near.foot = foot;
    const name = footWord(foot.kind);
    const pct = Math.round(foot.done * 100);
    near.prompt =
      foot.done < 1
        ? words(`fkeep|${foot.kind}|${pct}`, () => `E  ${t('buildKeep', { name, pct: num(pct) })}  ·  ${t('buildHoldTake')}`)
        : words(`ftake|${foot.kind}`, () => `E  ${t('buildTakeHold', { name })}`);
    return;
  }
  if (!best) return;
  near.piece = best;
  const name = pieceWord(best);
  if (best.done < 1) {
    const pct = Math.round(best.done * 100);
    near.prompt = words(`keep|${best.id}|${pct}`, () => `E  ${t('buildKeep', { name, pct: num(pct) })}  ·  ${t('buildHoldTake')}`);
    return;
  }
  // A bed under a roof of his (AWP-25: build/beds.ts): E sleeps there as on his mat at home (the home add-on's card).
  const bed = BED_SLEEP.start ? bedPlace(best) : null;
  if (bed) {
    near.bed = bed;
    near.prompt = words(`bed|${best.id}`, () => `E  ${t('homeSleep')}  ·  ${t('buildHoldTake')}`);
    return;
  }
  if (PIECES[best.id].seat && BuildUses.seatNear(p.x, p.y, p.z) === best) {
    near.sit = true;
    near.prompt = words(`sit|${best.id}`, () => `E  ${t('buildSit')}  ·  ${t('buildHoldTake')}`);
    return;
  }
  near.prompt = words(`take|${best.id}`, () => `E  ${t('buildTakeHold', { name })}`);
}

/** The point of a footprint building's land nearest (x, z), into `out`. */
function footNearest(r: FootRec, x: number, z: number, out: [number, number]): [number, number] {
  let best = Infinity;
  for (const q of FOOTS.parts(r)) {
    const f = partFoot(q);
    const cx = Math.max(f.x - f.w / 2, Math.min(f.x + f.w / 2, x));
    const cz = Math.max(f.z - f.d / 2, Math.min(f.z + f.d / 2, z));
    const d = Math.hypot(cx - x, cz - z);
    if (d < best) {
      best = d;
      out[0] = cx;
      out[1] = cz;
    }
  }
  return out;
}

/** "E  Build…" here (on foot, his house, not on its floor)? */
function canStart(ctx: RoamCtx, anywhere: boolean): boolean {
  const p = ctx.body.pos;
  if (!HOME.owned || !inPlot(p.x, p.z, -START_PAST)) return false;
  // (on the ground: not on the veranda or the stair)
  if (p.y - ctx.world.field.heightAt(p.x, p.z) > 0.9) return false;
  return anywhere || byHouse(p.x, p.z, BY_HOUSE);
}

// ── Checks ─────────────────────────────────────────────────────────────────

/** One of each piece standing round the house (`build=all`): the first spot each fits, scanning the meadow in a fixed order. */
function placeAll(world = env?.world): number {
  if (!world) return 0;
  let n = 0;
  const order: PieceId[] = ['pen', 'shelter', 'haystack', 'hammock', 'kre', 'spirit', 'jar', 'lamp', 'fence'];
  for (const id of order) {
    if (BUILD.count(id) >= PIECES[id].max) continue;
    let done = false;
    // (rows before the house: its front looks north; nearest first, from its west side across)
    for (let lz = 9; lz < 46 && !done; lz += 1.5)
      for (let lx = -16; lx <= 16 && !done; lx += 1.5) {
        const [x, z] = homeToWorld(lx, lz);
        const yaw = HOME_AT.facing;
        if (canBuild(world, id, x, z, yaw)) continue;
        BUILD.add(id, x, world.field.heightAt(x, z), z, yaw, 1);
        done = true;
        n++;
      }
    if (!done) console.warn(`[build] build=all: no room for the ${id}`);
  }
  return n;
}

/**
 * His land full (`build=full`, perf and the budget's checks): every kind up to its most, where each fits, scanning his
 * land row by row from the north (each kind going on from where it stopped), while the budget lasts.
 */
function placeFull(world = env?.world): number {
  if (!world) return 0;
  let n = 0;
  const order: PieceId[] = ['pen', 'shelter', 'haystack', 'hammock', 'kre', 'spirit', 'jar', 'lamp', 'fence'];
  const yaw = HOME_AT.facing;
  for (const id of order) {
    const p = PIECES[id];
    // (a fence's run along a row: one after the other, touching)
    const sx = id === 'fence' ? p.w : 1.5;
    let x = PLOT_BOX.x0 + 0.6;
    let z = PLOT_BOX.z0 + 0.6;
    while (BUILD.count(id) < p.max && roomFor(id) && z < PLOT_BOX.z1) {
      if (!canBuild(world, id, x, z, yaw)) {
        BUILD.add(id, x, world.field.heightAt(x, z), z, yaw, 1);
        n++;
      }
      x += sx;
      if (x > PLOT_BOX.x1) {
        x = PLOT_BOX.x0 + 0.6;
        z += 1.5;
      }
    }
  }
  console.info(`[build] build=full: ${n} pieces, ${plotBlocks()} of ${PLOT_BUDGET} blocks on his land`);
  return n;
}

/**
 * `lamps=<n>` (a check of the placed lights, sky/placedLights.ts): n lantern posts standing before the house, past the
 * 8 a player may have, in rows 3.5 m apart (from 8 m before it, 8.75 m either side of its middle), each where it fits
 * (for 20 today: x 419‥433, z −115‥−129).
 */
function placeLamps(world: AddonEnv['world'], n: number): number {
  let k = 0;
  for (let lz = 8; lz < 46 && k < n; lz += 3.5)
    for (let lx = -8.75; lx <= 8.75 && k < n; lx += 3.5) {
      const [x, z] = homeToWorld(lx, lz);
      if (canBuild(world, 'lamp', x, z, HOME_AT.facing)) continue;
      if (BUILD.add('lamp', x, world.field.heightAt(x, z), z, HOME_AT.facing, 1, undefined, true)) k++;
    }
  if (k < n) console.warn(`[build] lamps=${n}: room for ${k}`);
  return k;
}

/** A piece of `id` before him (a check's), as far built as `done`: the one under way, else a new one where it fits. */
function pieceBefore(ctx: RoamCtx, id: PieceId, done: number): Built | null {
  const was = BUILD.list.find((q) => q.id === id && q.done < 1);
  if (was) {
    BUILD.setDone(was, done);
    return was;
  }
  const b = ctx.body;
  const yaw = b.yaw + Math.PI;
  const ahead = ghostAhead(id, yaw, b.yaw);
  const x = b.pos.x + Math.sin(b.yaw) * ahead;
  const z = b.pos.z + Math.cos(b.yaw) * ahead;
  const r = canBuild(ctx.world, id, x, z, yaw);
  if (r) console.warn(`[build] buildwork=: the ${id} before him would not fit (${r}); put there all the same`);
  return BUILD.add(id, x, ctx.world.field.heightAt(x, z), z, yaw, done);
}

registerAddon({
  id: 'build',
  order: 94,
  get holding() {
    return BuildWork.active;
  },
  get handsBusy() {
    return BuildWork.active;
  },
  init(e) {
    env = e;
    // (a shot's or a check's pieces, before the first frame: never on the live site, where a link's values would
    // replace the player's own)
    const q = e.params.get('build');
    if ((e.shot || import.meta.env.DEV) && q !== null) {
      BUILD.clear();
      if (q !== '0' && q !== 'all' && q !== 'full') BUILD.fromUrl(q, (x, z) => e.world.field.heightAt(x, z));
    }
    view = createBuildView(e.shot);
    e.scene.add(view.object);
    // (footprint buildings, AWP-20: their plans need the land; a check's own, as `build=`)
    FootMode.init(e);
    const fq = e.params.get('foot');
    if ((e.shot || import.meta.env.DEV) && fq !== null) {
      FOOTS.clear();
      if (fq === 'full') fillFoot(e.world);
      else if (fq !== '0') FOOTS.fromUrl(fq);
    }
    installBuildWalk(e.world);
    BuildUses.init(e.world.field, view.standing);
    view.onStanding(() => BuildUses.sync(true));
    BUILD.on((ev) => {
      if (ev.type !== 'progress') BuildUses.sync();
    });
    ghost = new BuildGhost(e.scene, e.world);
    edge = createPlotEdge(e.world.field, () => (graphicsNow.plainBlocks ? 'low' : 'medium'));
    e.scene.add(edge.object);
    BuildWork.init(e);
    // (the card's riel and greyed rows as his purse changes while it is up)
    e.purse.onChange(() => card?.refresh());
    // (and as his materials change: AWP-9)
    BAG.onChange(() => card?.refresh());
    STORE.onChange(() => card?.refresh());
    wireHold();
    injectStyle();
    if (q === 'all' && (e.shot || import.meta.env.DEV)) placeAll(e.world);
    if (q === 'full' && (e.shot || import.meta.env.DEV)) placeFull(e.world);
    // (a check's blocks on his land from elsewhere, as a block layer's would be: the budget's meter and its "no room")
    const extra = Number(e.params.get('plotblocks'));
    if ((e.shot || import.meta.env.DEV) && extra > 0) addPlotBlocks('check', () => extra);
    const nLamps = Number(e.params.get('lamps'));
    if (nLamps > 0 && (e.shot || import.meta.env.DEV)) placeLamps(e.world, Math.min(64, Math.floor(nLamps)));
    BuildUses.sync();
    // (the pieces drawn before the first frame: the hammock add-on reads its cloth from them)
    view.sync();
    console.info(`[build] ${BUILD.list.length} pieces at home${BUILD.list.length ? `: ${BUILD.list.map((p) => `${p.uid}${p.done < 1 ? ` ${(p.done * 100).toFixed(0)}%` : ''}`).join(', ')}` : ''}${progress.saving ? '' : ' (not saved: a shot or progress=0)'}`);
    if (e.shot || import.meta.env.DEV)
      Object.assign(window, {
        __build: {
          state: () => ({
            pieces: BUILD.list.map((p) => ({ uid: p.uid, id: p.id, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), yaw: +p.yaw.toFixed(3), done: +p.done.toFixed(3) })),
            version: BUILT.version,
            placing: placing ? { id: placing, x: +spot.x.toFixed(2), z: +spot.z.toFixed(2), yaw: +spot.yaw.toFixed(3), deg: shownDeg(placing, spot.yaw), turn: +turn.toFixed(3), ok: spot.ok, reason: spot.reason, prompt: spot.prompt, snapped: spot.snapped, ghost: !!ghost?.shown } : null,
            near: near.piece || near.foot ? { uid: (near.piece ?? near.foot)!.uid, prompt: near.prompt, sit: near.sit } : null,
            work: BuildWork.now,
            card: !!card?.open,
            ask: !!ask?.open,
            pressing: pressing ? { uid: pressing.job.uid, t: +pressing.t.toFixed(2) } : null,
            foot: FootMode.state(),
            riel: env?.purse.riel ?? 0,
            plot: { area: +PLOT_AREA.toFixed(0), corners: PLOT_CORNERS.length, budget: PLOT_BUDGET, used: plotBlocks(), by: plotBlocksBy(), edge: !!edge?.shown, edgeBlocks: edge?.blocks ?? 0 },
            materials: { bag: BAG.all(), store: STORE.all() },
            owned: HOME.owned,
            view: view?.stats() ?? null,
            uses: BuildUses.state(),
            saving: progress.saving,
            busy: env?.busy() ?? null,
          }),
          canBuild: (id: PieceId, x: number, z: number, yawDeg = 0) => (lastCtx ? canBuild(lastCtx.world, id, x, z, (yawDeg * Math.PI) / 180) : 'no ctx'),
          add: (id: PieceId, x: number, z: number, yawDeg = 0, done = 1) => BUILD.add(id, x, env!.world.field.heightAt(x, z), z, (yawDeg * Math.PI) / 180, done)?.uid ?? null,
          remove: (uid: string) => {
            const p = BUILD.byUid(uid);
            if (p) BUILD.remove(p);
          },
          card: () => lastCtx && openCard(lastCtx),
          place: (id: PieceId | null) => (id ? enterPlacing(id) : exitPlacing()),
          all: () => placeAll(),
          full: () => placeFull(),
          rebuild: () => view?.rebuild(),
          shown: (uid: string) => view?.shownOf(uid) ?? -1,
          // (footprint buildings, AWP-20: corners in metres as `foot=`; the mode for a kind, or off)
          foot: {
            add: (kind: FootKind, x0: number, z0: number, x1: number, z1: number, door = 2, done = 1) => FOOTS.fromUrl(`${kind}@${x0}/${z0}/${x1}/${z1}/${door}:${done}`),
            remove: (uid: string) => {
              const r = FOOTS.byUid(uid);
              if (r) FOOTS.remove(r);
            },
            clear: () => FOOTS.clear(),
            full: () => fillFoot(env!.world),
            draw: (kind: FootKind | null) => (kind ? enterFoot(kind) : exitFoot()),
            plan: (uid: string) => {
              const r = FOOTS.byUid(uid);
              return r ? { ...FOOTS.plan(r), cells: undefined, raws: undefined } : null;
            },
          },
        },
      });
  },
  input(ctx, m, tap, dt) {
    lastCtx = ctx;
    stepN++;
    FootMode.nextStep();
    if (card?.open || ask?.open) return true;
    holdStep(ctx, dt);
    if (BuildWork.active) return tap('KeyJ', 'KeyL', 'KeyF', 'KeyC', 'KeyU', 'KeyP', 'Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3', 'KeyO', 'KeyI');
    if (pressing) return false;
    if (placing) {
      const p = ctx.body.pos;
      // (out of it: far from home, another mode, all of it built, not enough riel)
      if (m !== 'walk' || pastPlot(p.x, p.z) > MODE_FAR || cannot(placing)) {
        exitPlacing();
        return false;
      }
      const i = ctx.input;
      const taps = i.taps as Set<string> | undefined;
      // Esc (the pad's ○, the touch ✕): out of build mode — not "Back to the map?".
      if (i.exit) {
        i.exit = false;
        env?.uiSound('close');
        exitPlacing();
        return false;
      }
      // , and . (the pad's d-pad ← →, read as 4 and 5): turn it 15°.
      const left = tap('Comma') || (pad.active && tap('Digit4'));
      const right = tap('Period') || (pad.active && tap('Digit5'));
      if (left || right) {
        for (const c of ['Comma', 'Period', 'Digit4', 'Digit5']) taps?.delete(c);
        // (Shift on the keys, L2 held on the pad: 5°)
        const fine = pad.active ? pad.held('l2') : fineKey || shiftDown;
        turnBy(left ? 1 : -1, fine ? TURN_FINE : TURN_STEP);
      }
      // F or C (the pad's ↓): the card again (another piece); not a greeting.
      if (tap('KeyF', 'KeyC')) {
        taps?.delete('KeyF');
        taps?.delete('KeyC');
        openCard(ctx);
        return true;
      }
    }
    if (FootMode.on) {
      const p = ctx.body.pos;
      // (out of it: far from home, another mode)
      if (m !== 'walk' || pastPlot(p.x, p.z) > MODE_FAR) {
        exitFoot();
        return false;
      }
      const i = ctx.input;
      const taps = i.taps as Set<string> | undefined;
      // Esc (the pad's ○, the touch ✕): the first corner again, then out — not "Back to the map?".
      if (i.exit) {
        i.exit = false;
        env?.uiSound('close');
        backFoot();
        return false;
      }
      // , and . (the pad's d-pad ← →): the door side a quarter round.
      const left = tap('Comma') || (pad.active && tap('Digit4'));
      const right = tap('Period') || (pad.active && tap('Digit5'));
      if (left || right) {
        for (const c of ['Comma', 'Period', 'Digit4', 'Digit5']) taps?.delete(c);
        FootMode.turnDoor(left ? -1 : 1);
        env?.uiSound('tick');
      }
      if (tap('KeyF', 'KeyC')) {
        taps?.delete('KeyF');
        taps?.delete('KeyC');
        openCard(ctx);
        return true;
      }
      // A mouse click on the ground: the corner (or "Build here") at the cursor, where it points.
      if (i.click && !env?.busy()) {
        i.click = false;
        useFoot(ctx);
      }
    }
    return false;
  },
  offer(ctx, m) {
    lastCtx = ctx;
    // (build mode's E is `buildMode`'s, first in the row)
    if (m !== 'walk' || !env || placing || FootMode.on || BuildWork.active || card?.open || ask?.open || env.busy()) return null;
    if (pressing) return near.prompt;
    nearNow(ctx);
    if (near.prompt) return near.prompt;
    return canStart(ctx, false) ? words('start', () => `E  ${t('buildStart')}`) : null;
  },
  use(ctx) {
    if (!env || BuildWork.active || placing || FootMode.on) return;
    nearNow(ctx);
    if (near.piece) {
      wireHold();
      const piece = near.piece;
      pressing = { job: pieceJob(piece), dist: (x, z) => distTo(piece, x, z), t: 0, tap: piece.done < 1 ? 'keep' : near.bed ? 'sleep' : near.sit ? 'sit' : null, bed: near.bed };
      holdBar(0);
      return;
    }
    if (near.foot) {
      wireHold();
      const rec = near.foot;
      pressing = { job: footJob(rec, (x, z) => ctx.world.field.heightAt(x, z)), dist: (x, z) => FOOTS.distTo(rec, x, z), t: 0, tap: rec.done < 1 ? 'keep' : null };
      holdBar(0);
      return;
    }
    if (canStart(ctx, true)) openCard(ctx);
  },
  hold(ctx, dt) {
    return BuildWork.hold(ctx, dt);
  },
  keys() {
    return BuildWork.keys();
  },
  after(ctx, m, dt) {
    lastCtx = ctx;
    BuildWork.after(ctx, dt);
    // (the ghost's spot first: the camera's move starts toward where the ghost is now, not where it was)
    const free = m === 'walk' && !BuildWork.active && !card?.open && !!env && !env.busy();
    if (placing && free) placingNow(ctx);
    if (FootMode.on && free) FootMode.step(ctx);
    if (m === 'walk' && !BuildWork.active) modeCamera(ctx, (!!placing || FootMode.on) && !card?.open, dt);
    // Footprint mode: its ghost and panel (free), the touch bar's size and ✕.
    if (FootMode.on) {
      FootMode.show(free);
      if (touchDeg) {
        const s = FootMode.barText();
        if (touchDeg.textContent !== s) touchDeg.textContent = s;
        shownTouchDeg = -1;
      }
      barWords();
    } else FootMode.show(false);
    // The hint, once: the house is his, he is by it.
    if (!hinted && m === 'walk' && HOME.owned && env && (!env.shot || env.params.get('buildhint') === '1')) {
      const p = ctx.body.pos;
      if (byHouse(p.x, p.z, 8) && !env.busy() && !BuildWork.active) {
        hinted = true;
        progress.set('build.hinted', true);
        ctx.hud.toast(t('buildHint'));
      }
    }
    if (!placing) return;
    // The ghost before him (not while he works, a card is open, or something else has him).
    if (free) {
      placingNow(ctx);
      ghost?.show(spot.x, spot.z, spot.yaw, spot.ok);
    } else ghost?.show(null);
  },
  frame(f: MapFrame, _m: RoamMode) {
    if (!view) return;
    view.frame(f.camera, f.t, f.dt, f.night);
    // His land's edge while he builds (build mode, the card), or a check's `plotedge=1`.
    edge?.show(!!placing || FootMode.on || !!card?.open || edgeHeld);
    edge?.frame(f.dt > 0 ? f.dt : 0);
    ghost?.frame(f.dt > 0 ? f.dt : 0);
    FootMode.frame(f.dt > 0 ? f.dt : 0);
    BUILD.tick(f.dt > 0 ? f.dt : 0);
    FOOTS.tick(f.dt > 0 ? f.dt : 0);
  },
  setMode(next, _prev, ctx) {
    card?.close();
    ask?.close();
    pressing = null;
    holdBar(null);
    BuildWork.stop(ctx, next === 'overview');
    exitPlacing();
    exitFoot();
  },
  fromUrl(q, ctx) {
    lastCtx = ctx;
    // (every value here is a check's: shots and the dev server only, never the live site, where a link would build
    // pieces into a player's save or open build mode: REVIEW.md "Lessons")
    if (!(env?.shot || import.meta.env.DEV)) return;
    if (q.get('build') === 'all' && !BUILD.list.length) placeAll(ctx.world);
    const g = q.get('buildghost');
    if (g) {
      const [id, deg] = g.split(':');
      if (id in PIECES) {
        enterPlacing(id as PieceId);
        turn = ((Number(deg) || 0) * Math.PI) / 180;
        spot.step = -1;
      } else console.warn(`[build] buildghost=: no piece "${id}"`);
    }
    const w = q.get('buildwork');
    if (w) {
      const [id, d, s] = w.split(':');
      if (id in PIECES) {
        const piece = pieceBefore(ctx, id as PieceId, Math.min(0.999, Math.max(0, Number(d) || 0)));
        if (piece) {
          view?.sync();
          BuildWork.freeze(ctx, piece, Number(s) || 0.4);
        }
      } else console.warn(`[build] buildwork=: no piece "${id}"`);
    }
    const tk = q.get('buildtake');
    if (tk) {
      const [uid, d] = tk.split(':');
      const piece = BUILD.byUid(uid);
      if (!piece) console.warn(`[build] buildtake=: no piece "${uid}" (${BUILD.list.map((p) => p.uid).join(', ')})`);
      else if (d !== undefined) {
        BUILD.setDone(piece, Math.min(0.999, Math.max(0.001, Number(d) || 0.5)));
        BuildWork.freeze(ctx, piece, 0.4, true);
      } else askTake(ctx, pieceJob(piece));
    }
    // Footprint buildings (AWP-20): the mode with a footprint drawn, his work on one, the take-down question.
    const fd = q.get('footdraw');
    if (fd) {
      const m = /^([a-z]+)(?:@(-?[\d.]+)\/(-?[\d.]+)(?:\/(-?[\d.]+)\/(-?[\d.]+))?)?(?::([0-3]))?$/.exec(fd);
      if (m && m[1] in FOOT_KINDS) {
        const k = m[1] as FootKind;
        const a: [number, number] | null = m[2] !== undefined ? [cellOf(Number(m[2])), cellOf(Number(m[3]))] : null;
        // (the far corner: the cell before the given point, as `foot=`)
        const b: [number, number] | null = m[4] !== undefined ? [cellOf(Number(m[4]) - 0.001), cellOf(Number(m[5]) - 0.001)] : null;
        enterFoot(k);
        FootMode.hold(k, a, b, m[6] !== undefined ? (Number(m[6]) as FootSide) : null);
      } else console.warn(`[foot] footdraw=: "${fd}" is not <kind>[@x0/z0[/x1/z1]][:door] (kinds: ${FOOT_KIND_IDS.join(', ')})`);
    }
    const fw = q.get('footwork');
    if (fw) {
      const [k, d, sec] = fw.split(':');
      const rec = [...FOOTS.list].reverse().find((r) => r.kind === k && r.done < 1) ?? [...FOOTS.list].reverse().find((r) => r.kind === k);
      if (rec) {
        FOOTS.setDone(rec, Math.min(0.999, Math.max(0, Number(d) || 0)));
        BuildWork.freeze(ctx, footJob(rec, (x, z) => ctx.world.field.heightAt(x, z)), Number(sec) || 0.4);
      } else console.warn(`[foot] footwork=: no ${k} (give one with foot=)`);
    }
    const ft = q.get('foottake');
    if (ft) {
      const [uid, d] = ft.split(':');
      const rec = FOOTS.byUid(uid);
      if (!rec) console.warn(`[foot] foottake=: no building "${uid}" (${FOOTS.list.map((r) => r.uid).join(', ')})`);
      else {
        const job = footJob(rec, (x, z) => ctx.world.field.heightAt(x, z));
        if (d !== undefined) {
          FOOTS.setDone(rec, Math.min(0.999, Math.max(0.001, Number(d) || 0.5)));
          BuildWork.freeze(ctx, job, 0.4, true);
        } else askTake(ctx, job);
      }
    }
    const st = q.get('buildsit');
    if (st) {
      const [uid, how] = st.split(':');
      const piece = BUILD.byUid(uid);
      if (piece) {
        // (before it on the ground, facing it, then J (or L) as the player would)
        const b = ctx.body;
        pieceToWorld(piece, 0, PIECES[piece.id].d / 2 + 0.5, _l);
        b.pos.set(_l[0], ctx.world.field.heightAt(_l[0], _l[1]), _l[1]);
        b.yaw = piece.yaw + Math.PI;
        env?.controls.press(how === 'lie' ? 'KeyL' : 'KeyJ');
      } else console.warn(`[build] buildsit=: no piece "${uid}"`);
    }
    if (q.get('buildcard')) openCard(ctx);
    if (q.get('plotedge') === '1') edgeHeld = true;
  },
  report() {
    const out: Record<string, string> = {};
    const b = BUILD.report();
    if (b) out.build = b;
    if (placing) out.buildghost = `${placing}:${((turn * 180) / Math.PI).toFixed(0)}`;
    const w = BuildWork.now;
    if (w && !w.take) {
      const p = BUILD.byUid(w.uid);
      if (p) out.buildwork = `${p.id}:${w.done.toFixed(3)}:${w.t.toFixed(2)}`;
      const r = FOOTS.byUid(w.uid);
      if (r) out.footwork = `${r.kind}:${w.done.toFixed(3)}:${w.t.toFixed(2)}`;
    }
    const f = FOOTS.report();
    if (f) out.foot = f;
    const fd = FootMode.report();
    if (fd) out.footdraw = fd;
    return Object.keys(out).length ? out : null;
  },
});

/**
 * Build mode's E, first in the row (before a shrine, a hammock, the dog, the house's doors): "E  Build here", or why
 * not here (no key).
 */
registerAddon({
  id: 'buildMode',
  order: 3,
  // While he places a piece, the pad's L2 is the fine turn's (L2 held with ← →: 5°), not the binoculars' (their add-on,
  // order 5, takes the L2 press after this one: taken here, it never raises them).
  input(_ctx, m) {
    if (placing && m === 'walk' && !BuildWork.active) pad.take('l2');
    return false;
  },
  offer(ctx, m) {
    if ((!placing && !FootMode.on) || m !== 'walk' || !env || BuildWork.active || card?.open || ask?.open || env.busy()) return null;
    lastCtx = ctx;
    if (FootMode.on) {
      FootMode.step(ctx);
      return FootMode.prompt;
    }
    placingNow(ctx);
    return spot.prompt;
  },
  use(ctx) {
    if (FootMode.on && env && !BuildWork.active) useFoot(ctx);
    else if (placing && env && !BuildWork.active) buildHere(ctx);
  },
});

/**
 * The late half of the E row (after every other add-on's: the garden's "Plant…" first): "E  Build…" anywhere near
 * his house where nothing else here has E. Just before the garden's late half (`GARDEN_LATE`: "E  Plant…" and its
 * lines with no key) so that a line of the garden's with no key (no seeds yet, the can empty, the jar empty) never
 * hides it: the garden's line goes on after it ("E  Build…  ·  You have no seeds yet…"), and a real E of the
 * garden's still comes first.
 */
const GARDEN_LATE = 95;
registerAddon({
  id: 'buildLate',
  order: GARDEN_LATE - 0.1,
  offer(ctx, m) {
    if (m !== 'walk' || !env || placing || FootMode.on || pressing || BuildWork.active || card?.open || ask?.open || env.busy()) return null;
    if (!canStart(ctx, true)) return null;
    // (the garden's late offer, worked out once a step there: its "E  …" first; a line with no key after ours)
    const g = addonOffer(ctx, m, GARDEN_LATE, GARDEN_LATE)?.prompt ?? null;
    if (g?.startsWith('E ')) return null;
    const start = words('start', () => `E  ${t('buildStart')}`);
    return g ? words(`start|${g}`, () => `${start}  ·  ${g}`) : start;
  },
  use(ctx) {
    if (!env || BuildWork.active || placing || FootMode.on || !canStart(ctx, true)) return;
    openCard(ctx);
  },
});
