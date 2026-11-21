import { BAG, MATERIAL_IDS, STORE, haveOf, materialsText, missingOf, noMaterials, rielOf, useMaterials, type Materials } from '../build/materials';
import { boughtRiel, BUILT, FENCE_RUN, PIECE_IDS, PIECES, pieceBack, pieceToWorld, type Built, type PieceId } from '../build/pieces';
import { addPlotBlocks, inPlot, pastPlot, PLOT_AREA, PLOT_BOX, PLOT_BUDGET, PLOT_CORNERS, plotBlocks, plotBlocksBy } from '../build/plot';
import { createPlotEdge, type PlotEdge } from '../build/plotEdge';
import { BLOCKS, cellMid, cellMin, cellOf, CHUNK_CELLS, CHUNK_N } from '../blocks/store';
import { BUILD, distTo, toLocal } from '../build/state';
import { FOOT_KIND_IDS, FOOT_KINDS, type FootKind, type FootSide } from '../build/footPlan';
import { FOOTS, partFoot, type FootRec } from '../build/footState';
import { BED_SLEEP, bedPlace, type BedPlace } from '../build/beds';
import { PAINT_LINK } from '../build/paint';
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
import { grabAt, MoveMode, whyNot, whyNotFoot, type Grabbed } from './_buildMove';
import { DRAG_GRAB } from './dragGrab';
import { byHouse, canBuild, fenceEnd, fenceJoint, ghostAhead, MEET, overlapsBuilt } from './_buildSpots';
import { BuildUses } from './_buildUses';
import { furnFromUrl, furnitureHeldBy, furnReport, installFurniture } from './_buildFurniture';
import { furnSpot, onFurnFloor, reasonWord, type FurnReason } from './_buildFurnSpots';
import { FURN, FURN_GRID, isFurniture } from '../build/furniture';
import { installBuildWalk } from './_buildWalk';
import { backWords, BuildWork, pieceJob, pieceWord, type WorkJob } from './_buildWork';
import { cannotFoot, fillFoot, footJob, FootMode, footWord, landHit, minPlan } from './_buildFoot';
import { riel } from './_shopPurse';
import { touchUseHeld } from './touch';
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
/** A seat (the bed, a bench) is offered from beside it too (his facing's dot with the way to it at least this), and before what is near it (m off its score). */
const SEAT_FACING = -0.3;
const SEAT_FIRST = 0.4;
/** Right by a seat (m from it) it is offered whichever way he faces. */
const SEAT_BY = 0.7;
/** He reaches a piece from this far (m, his feet to its footprint), facing it. */
const PIECE_REACH = 1.25;
/**
 * A fence's end snaps onto another's end within this (m: the ghost's middle from where it would go); it goes on that
 * fence's own line, or square to it, when he faces within `align` of it (rad: 20°).
 */
const SNAP = { d: 1.5, align: (20 * Math.PI) / 180 };
/**
 * Fences meet (closing a gap between two runs he started apart): a run that fills the gap between two free fence ends
 * 0.3‥3 m apart is offered when its middle is within `d` of the ghost's (m); a run going on from an end stops on the line
 * of another free end's fence (a corner: the next run closes it square) when that line crosses it, the other fence's end
 * at most `reach` m back along it (m), at `angle` or more between them (rad: 30°).
 */
const CLOSE = { d: 2, reach: 6, angle: (30 * Math.PI) / 180 };
/** Pieces the mode stays on for (one after another). */
const REPEAT: ReadonlySet<PieceId> = new Set<PieceId>(['fence', 'lamp', 'oillamp', 'hanglamp', 'pot']);
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
const spot = { x: 0, y: 0, z: 0, yaw: 0, ok: false, reason: null as FurnReason | null, step: -1, prompt: null as string | null, snapped: false, ceil: Infinity, len: undefined as number | undefined, edge: false };
let stepN = 0;
/**
 * Press and drag (dragGrab.ts): the thing he holds with the mouse or a finger, carried as a moved one (build mode with
 * it, or footprint mode carrying a building), its middle this far from the ground point under the pointer (m: where
 * he grabbed it). Let go: put down there if it may stand, else put back.
 */
let drag: { foot: boolean; offX: number; offZ: number } | null = null;
/** The ground point under the pointer while he drags (world x, z), or null (the pointer over the sky). */
let dragGround: [number, number] | null = null;
/** The roaming mode now (press and drag only on foot). */
let lastMode: RoamMode = 'overview';
/** The thing under the mouse last step (the canvas's cursor changes with it). */
let hovered: Grabbed | null = null;
/** What E does by a piece (or a footprint building) now (once a step). */
const near = { step: -1, piece: null as Built | null, foot: null as FootRec | null, sit: false, bed: null as BedPlace | null, prompt: null as string | null };
/** E held on a piece or a footprint building: it as a job, how far he is from it, how long, what a short press does. */
let pressing: { job: WorkJob; dist: (x: number, z: number) => number; t: number; tap: 'sit' | 'keep' | 'sleep' | null; bed?: BedPlace | null } | null = null;
/** The piece he is moving (build mode with it: its ghost goes with him; it stays where it was until put down). */
let moving: Built | null = null;
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
    for (const p of BUILD.list) piecesN += pieceLook(p.id, p.seed, p.len).boxes.length;
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

const holdKeys = { key: false };
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
  addEventListener('blur', () => (holdKeys.key = shiftDown = false));
}
// (on touch the Use button held, let go only by its own finger: the thumb leaving the stick as he stops by a piece
// ended the hold, and a fence, which has nothing for a short press, was never taken down)
const eHeld = (): boolean => holdKeys.key || touchUseHeld() || pad.held('west');

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
  // (a footprint building with furniture on its floor or hung from its roof, a shelter with a lantern hung from it:
  // that first, AWP-23 — nothing left floating)
  const inside = furnitureHeldBy(b.uid).length;
  if (inside) {
    ctx.hud.toast(t('buildFurnInside', { n: num(inside) }));
    env.uiSound('tick');
    return;
  }
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

const _snap = { id: 'fence' as PieceId, x: 0, z: 0, yaw: 0, len: undefined as number | undefined };
/** The free fence ends (no other run's end on them): x, z, their run, which end; filled each step a fence is placed. */
interface FenceEnd {
  x: number;
  z: number;
  f: Built;
  end: number;
}
const freeEnds: FenceEnd[] = [];
const _e: [number, number] = [0, 0];
const _e2: [number, number] = [0, 0];

/** The fence ends nothing else joins (into `freeEnds`). */
function findFreeEnds(): void {
  freeEnds.length = 0;
  for (const f of BUILT.list) {
    if (f.id !== 'fence' || f === moving) continue;
    for (let end = -1; end <= 1; end += 2) {
      fenceEnd(f, end, _e);
      let free = true;
      for (const g of BUILT.list) {
        if (g === f || g.id !== 'fence' || g === moving) continue;
        for (let k = -1; k <= 1 && free; k += 2) {
          fenceEnd(g, k, _e2);
          if (Math.hypot(_e[0] - _e2[0], _e[1] - _e2[1]) < MEET) free = false;
        }
        if (!free) break;
      }
      if (free) freeEnds.push({ x: _e[0], z: _e[1], f, end });
    }
  }
}

/** Would `_snap` stand clear of what he built (fence runs may cross at a joint; the one he is moving not counted)? */
function snapFree(): boolean {
  for (const b of BUILT.list) if (b !== moving && overlapsBuilt(_snap, b)) return false;
  return true;
}

/**
 * A run that closes the gap between two free fence ends (into `spot`, its own length `spot.len`): the two ends 0.3‥3 m
 * apart, on two runs not already joined, its middle the nearest to the ghost's within `CLOSE.d`. Its front to him
 * (`raw`). He started two fence lines apart and walked them toward each other: the last gap is seldom a whole 3 m run.
 */
function closeFence(raw: number): boolean {
  let best = CLOSE.d;
  let bx = 0;
  let bz = 0;
  let by = 0;
  let bl = 0;
  for (let i = 0; i < freeEnds.length; i++)
    for (let j = i + 1; j < freeEnds.length; j++) {
      const a = freeEnds[i];
      const b = freeEnds[j];
      if (a.f === b.f || fenceJoint(a.f, b.f)) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < FENCE_RUN.min || len > PIECES.fence.w + 1e-3) continue;
      const x = (a.x + b.x) / 2;
      const z = (a.z + b.z) / 2;
      const d = Math.hypot(x - spot.x, z - spot.z);
      if (d >= best) continue;
      // (its local x axis on the map is (cos, −sin) along a → b; its front, local +z (sin, cos), turned to him)
      let yaw = Math.atan2(-dz, dx);
      if (Math.cos(yaw - raw) < 0) yaw += Math.PI;
      _snap.x = x;
      _snap.z = z;
      _snap.yaw = yaw;
      _snap.len = Math.min(PIECES.fence.w, len);
      if (!snapFree()) continue;
      best = d;
      bx = x;
      bz = z;
      by = yaw;
      bl = _snap.len;
    }
  _snap.len = undefined;
  if (best >= CLOSE.d) return false;
  spot.x = bx;
  spot.z = bz;
  spot.yaw = Math.atan2(Math.sin(by), Math.cos(by));
  spot.len = Math.abs(bl - PIECES.fence.w) < 1e-3 ? undefined : bl;
  return true;
}

/**
 * How long a run going from (ex, ez) along (ux, uz) may be (m, at most 3) before it meets the line of another free
 * fence end's run (its end at most `CLOSE.reach` back along that line, at `CLOSE.angle` or more to it): the corner
 * the two lines would make, where the next run closes it. `from`: the run it goes on from (not one to meet).
 */
function meetLine(ex: number, ez: number, ux: number, uz: number, from: Built, full: number): number {
  let t = full;
  for (const g of freeEnds) {
    if (g.f === from || fenceJoint(g.f, from)) continue;
    // (the way the other run goes out past its free end: its local x, toward that end)
    const vx = g.end * Math.cos(g.f.yaw);
    const vz = -g.end * Math.sin(g.f.yaw);
    const cross = ux * vz - uz * vx;
    if (Math.abs(cross) < Math.sin(CLOSE.angle)) continue;
    // (e + t·u = g + s·v)
    const wx = g.x - ex;
    const wz = g.z - ez;
    const tt = (wx * vz - wz * vx) / cross;
    const ss = (wx * uz - wz * ux) / cross;
    if (tt < FENCE_RUN.min || tt >= t - 1e-3 || ss < FENCE_RUN.min || ss > CLOSE.reach) continue;
    t = tt;
  }
  return t;
}
/** Furniture's spot (AWP-23). */
const _fs = { y: 0, ceil: Infinity, reason: null as FurnReason | null };

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
const onGrid = (v: number, o: number, g = GRID): number => o + Math.round((v - o) / g) * g;

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
  findFreeEnds();
  // (a gap between two runs first: the run that fills it)
  if (closeFence(raw)) return true;
  // (a run he moves goes on at its own length)
  const full = moving?.len ?? PIECES.fence.w;
  let best = SNAP.d;
  let bx = 0;
  let bz = 0;
  let by = spot.yaw;
  let bl = full;
  const half = full / 2;
  for (const f of BUILT.list) {
    if (f.id !== 'fence' || f === moving) continue;
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
    for (let end = -1; end <= 1; end += 2) {
      fenceEnd(f, end, _e);
      const [ex, ez] = _e;
      for (let sig = -1; sig <= 1; sig += 2) {
        // (the new run's end `sig` on that end: its middle half a run back along its own way)
        const x = ex - sig * half * c;
        const z = ez + sig * half * s;
        const d = Math.hypot(x - spot.x, z - spot.z);
        if (d >= best) continue;
        // (it stops where it meets another run's line: a corner the next run closes; its middle half its length out)
        const ux = -sig * c;
        const uz = sig * s;
        const len = meetLine(ex, ez, ux, uz, f, full);
        _snap.x = ex + (ux * len) / 2;
        _snap.z = ez + (uz * len) / 2;
        _snap.len = len < PIECES.fence.w ? len : undefined;
        const free = snapFree();
        _snap.len = undefined;
        if (!free) continue;
        best = d;
        bx = ex + (ux * len) / 2;
        bz = ez + (uz * len) / 2;
        by = yaw;
        bl = len;
      }
    }
  }
  if (best >= SNAP.d) return false;
  spot.x = bx;
  spot.z = bz;
  spot.yaw = Math.atan2(Math.sin(by), Math.cos(by));
  spot.len = bl < PIECES.fence.w ? bl : undefined;
  return true;
}

/** The turn shown in the prompt (degrees from the house's line: a fence's run 0‥179, a piece's front 0‥359). */
function shownDeg(id: PieceId, yaw: number): number {
  const m = id === 'fence' ? 180 : 360;
  const d = Math.round(((yaw - HOME_AT.facing - Math.PI) * 180) / Math.PI);
  return ((d % m) + m) % m;
}

/** Build mode's spot and prompt now (once a step). */
/** A fence run this near his land's edge (m, its middle to the line) and this close to along it (rad) snaps onto it. */
const EDGE_SNAP = { m: 0.55, turn: (15 * Math.PI) / 180 };
/**
 * A fence run near a side of his land (build/plot.ts `PLOT_CORNERS`, the cord he sees while he builds) and turned
 * along it: just inside the side, its outer face on the cord (no gap left, and on the upper side where the edge
 * follows a step of the land), turned exactly along it, kept within the side's length. True: snapped (into `spot`).
 */
function snapEdge(): boolean {
  const hw = (spot.len ?? PIECES.fence.w) / 2;
  const hd = PIECES.fence.d / 2;
  // (the run's direction: local x along (cos yaw, −sin yaw))
  const dx = Math.cos(spot.yaw);
  const dz = -Math.sin(spot.yaw);
  let best = EDGE_SNAP.m;
  let hit: { x: number; z: number; yaw: number } | null = null;
  for (let i = 0; i < PLOT_CORNERS.length; i++) {
    const [ax, az] = PLOT_CORNERS[i];
    const [bx, bz] = PLOT_CORNERS[(i + 1) % PLOT_CORNERS.length];
    const len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len;
    const uz = (bz - az) / len;
    // (along it, either way round)
    const along = Math.abs(dx * ux + dz * uz);
    if (along < Math.cos(EDGE_SNAP.turn)) continue;
    const t = (spot.x - ax) * ux + (spot.z - az) * uz;
    const off = Math.abs((spot.x - ax) * -uz + (spot.z - az) * ux);
    if (off >= best || t < -hw || t > len + hw) continue;
    const tt = len >= hw * 2 ? Math.min(len - hw, Math.max(hw, t)) : len / 2;
    const yaw = Math.atan2(-uz, ux);
    // (the way round nearer the one he had: its front stays his)
    const flip = dx * ux + dz * uz < 0;
    // (inward: the side of the line his land is on)
    const px = ax + ux * tt;
    const pz = az + uz * tt;
    const inw = inPlot(px - uz * 0.3, pz + ux * 0.3) ? 1 : -1;
    best = off;
    hit = { x: px - uz * hd * inw, z: pz + ux * hd * inw, yaw: flip ? yaw + Math.PI : yaw };
  }
  if (!hit) return false;
  spot.x = hit.x;
  spot.z = hit.z;
  spot.yaw = Math.atan2(Math.sin(hit.yaw), Math.cos(hit.yaw));
  return true;
}

function placingNow(ctx: RoamCtx): void {
  if (spot.step === stepN || !placing || !env) return;
  spot.step = stepN;
  const b = ctx.body;
  // (its front to him, on his land's lines, turned more with , and .)
  const raw = b.yaw + Math.PI;
  spot.yaw = landYaw(raw) + turn;
  const ahead = ghostAhead(placing, spot.yaw, b.yaw);
  // (furniture on a finer grid, on the floor at his level: AWP-23, _buildFurnSpots.ts)
  const furn = isFurniture(placing);
  spot.x = onGrid(b.pos.x + Math.sin(b.yaw) * ahead, PLOT_BOX.x0, furn ? FURN_GRID : GRID);
  spot.z = onGrid(b.pos.z + Math.cos(b.yaw) * ahead, PLOT_BOX.z0, furn ? FURN_GRID : GRID);
  // (dragged: under the pointer where he grabbed it, turned as it stood and by , and .)
  const dragged = !!drag && !!moving;
  if (dragged) {
    spot.yaw = Math.atan2(Math.sin(moving!.yaw + turn), Math.cos(moving!.yaw + turn));
    const g = dragGround ?? [moving!.x - drag!.offX, moving!.z - drag!.offZ];
    spot.x = onGrid(g[0] + drag!.offX, PLOT_BOX.x0, furn ? FURN_GRID : GRID);
    spot.z = onGrid(g[1] + drag!.offZ, PLOT_BOX.z0, furn ? FURN_GRID : GRID);
  }
  // (a run he moves keeps its own length unless it snaps to fill a gap)
  spot.len = moving?.len;
  spot.snapped = placing === 'fence' && snapFence(dragged ? spot.yaw : raw);
  // (a fence near his land's edge and along it: on the edge's line)
  spot.edge = placing === 'fence' && !spot.snapped && snapEdge();
  spot.ceil = Infinity;
  let r: FurnReason | null;
  if (isFurniture(placing)) {
    const f = furnSpot(ctx.world, placing, spot.x, spot.z, spot.yaw, b.pos.y, _fs, moving);
    r = f.reason;
    spot.y = f.y;
    spot.ceil = f.ceil;
  } else {
    // (a fence run of its own length: one that closes a gap, or stops on another run's line)
    const P = PIECES[placing];
    r = canBuild(ctx.world, placing, spot.x, spot.z, spot.yaw, moving, spot.len !== undefined ? { w: spot.len, d: P.d, h: P.h } : null);
    spot.y = ctx.world.field.heightAt(spot.x, spot.z);
  }
  spot.ok = !r;
  spot.reason = r;
  const id = placing;
  const deg = shownDeg(id, spot.yaw);
  // (",." the d-pad's ← → on a pad, "⇧,." L2: hud.ts `promptPad`)
  // (carrying one he moves: Esc puts it back)
  const esc = moving ? 'movePutBack' : 'buildExit';
  const keys = words(`modeKeys|${esc}`, () => `,.  ${t('buildTurn')}  ·  ⇧,.  ${t('buildTurnFine')}  ·  F  ${t('buildOther')}  ·  Esc  ${t(esc)}`);
  // (the turn on the Build here line itself: the phone's Use button reads it, "សង់នៅទីនេះ ៤៥°"; on touch the build bar
  // has the turn's, F's and Esc's buttons: only E's here, or they would show twice)
  // (moving one: "E  Put it here 45°")
  const here = moving ? 'buildMoveHere' : 'buildHere';
  // (dragged: no E; he lets go)
  if (!r && dragged) spot.prompt = onTouch() ? words('dragt', () => t('dragHere')) : words(`drag|${esc}`, () => `${t('dragHere')}  ·  ${keys}`);
  else if (!r) spot.prompt = onTouch() ? words(`heret|${here}|${deg}`, () => `E  ${t(here)} ${num(deg)}°`) : words(`here|${here}|${id}|${deg}`, () => `E  ${t(here)} ${num(deg)}°  ·  ${keys}`);
  else if (onTouch()) spot.prompt = words(`no|${r}`, () => t(reasonWord(r)));
  else spot.prompt = words(`not|${r}`, () => `${t(reasonWord(r))}  ·  ${keys}`);
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
  // (on a floor, in his house or of his blocks: furniture only, AWP-23)
  if (!isFurniture(id) && lastCtx && onFurnFloor(lastCtx.world, lastCtx.body.pos.x, lastCtx.body.pos.y, lastCtx.body.pos.z)) return words('ground', () => t('buildOnGround'));
  const riels = env?.purse.riel ?? 0;
  const pay = toPay(id);
  if (riels < pay.riel) {
    const short = riel(pay.riel - riels);
    return noMaterials(pay.missing) ? t('buildNeed', { riel: short }) : t('buildNeedMat', { what: materialsText(pay.missing), riel: short });
  }
  if (!roomFor(id)) return words('room', () => t('buildNoRoom'));
  return null;
}

/** Build mode for `id`; `move`: the piece he built that he is moving (else a new one: move mode ends). */
function enterPlacing(id: PieceId, move: Built | null = null): void {
  if (!move) MoveMode.exit();
  moving = move;
  if (!placing) {
    modeTurned = 0;
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

/** Move mode (the card's "Move your things"): he aims at what he built (roam/_buildMove.ts). */
function enterMove(): void {
  exitPlacing();
  exitFoot();
  MoveMode.enter();
  showTouchBar(true);
}

/** Out of move mode (and what he carries put back: it never left its place). */
function exitMove(): void {
  if (placing && moving) exitPlacing();
  if (!MoveMode.on) return;
  MoveMode.exit();
  showTouchBar(false);
}

/** Picked up in move mode: build mode with that piece (it stays where it is until he puts it down). */
function pickUp(ctx: RoamCtx, b: Built): void {
  if (!env || whyNot(b) || !BUILD.list.includes(b)) return;
  lastCtx = ctx;
  MoveMode.exit();
  enterPlacing(b.id, b);
  env.uiSound('select');
  console.info(`[build] ${b.uid} picked up to move`);
}

/** A footprint building picked up in move mode: footprint mode carrying it (it stays where it is until put down). */
function carryFoot(ctx: RoamCtx, rec: FootRec): void {
  if (!env || whyNotFoot(rec) || !FOOTS.list.includes(rec)) return;
  lastCtx = ctx;
  enterFoot(rec.kind, rec);
  env.uiSound('select');
  console.info(`[build] ${rec.uid} picked up to move`);
}

/** Done carrying (put down, or Esc: put back): move mode again, for the next. */
function backToMove(): void {
  exitPlacing();
  MoveMode.enter();
  showTouchBar(true);
}

function exitPlacing(): void {
  if (!placing) return;
  placing = null;
  moving = null;
  ghost?.show(null);
  showTouchBar(false);
}

/** Footprint mode (AWP-20: _buildFoot.ts) for a kind: build mode's camera and touch bar, its own E, keys and ghost. */
function enterFoot(kind: FootKind, carry: FootRec | null = null): void {
  if (!FootMode.on) {
    if (!placing) modeTurned = 0;
    modeCamLetGo = false;
    modeCamOpen = placing ? 0 : MODE_CAM.openFor;
  }
  exitPlacing();
  MoveMode.exit();
  if (carry) FootMode.carry(carry);
  else FootMode.enter(kind);
  showTouchBar(true);
}

function exitFoot(): void {
  if (!FootMode.on) return;
  FootMode.exit();
  showTouchBar(false);
}

/** Esc (the pad's ○, the touch ✕) in footprint mode: the first corner again, else out of it. */
function backFoot(): void {
  // (dragging one: put back, out of the drag)
  if (drag) return endDragMode();
  // (carrying one he moves: put back, move mode goes on)
  const carried = !!FootMode.carrying;
  if (FootMode.back()) return;
  if (carried) MoveMode.enter();
  showTouchBar(carried);
}

/** E (or a click) in footprint mode: the first corner, or "Build here" and his work on it. */
function useFoot(ctx: RoamCtx): void {
  if (FootMode.carrying) {
    // (carrying one he moves: put down there, at once and free; move mode goes on for the next)
    FootMode.use(ctx, (c) => {
      if (!FootMode.putDown(c)) return;
      MoveMode.enter();
      showTouchBar(true);
    });
    return;
  }
  FootMode.use(ctx, (c) => {
    const rec = FootMode.buildHere(c);
    showTouchBar(FootMode.on);
    if (rec) BuildWork.start(c, footJob(rec, (x, z) => c.world.field.heightAt(x, z)));
  });
}

/** What build mode's camera frames: the piece's ghost, or the footprint (its middle, its reach, m). */
function modeTarget(): { x: number; z: number; reach: number; high: number } | null {
  if (placing) return { x: spot.x, z: spot.z, reach: Math.hypot(spot.len ?? PIECES[placing].w, PIECES[placing].d) / 2, high: 0 };
  return FootMode.on ? FootMode.target() : null;
}

/** The piece he moves, put down where the ghost is (`spot`), at once and free. */
function putMoved(ctx: RoamCtx, m: Built): void {
  BUILD.move(m, spot.x, spot.y, spot.z, spot.yaw, spot.len);
  env?.uiSound('select');
  ctx.hud.toast(t('buildMoved', { name: pieceWord(m) }));
  console.info(`[build] ${m.uid} moved to (${m.x.toFixed(2)}, ${m.z.toFixed(2)}) yaw ${((m.yaw * 180) / Math.PI).toFixed(0)}°${m.len !== undefined ? ` ${m.len.toFixed(2)} m` : ''}`);
}

// ── Press and drag (dragGrab.ts) ────────────────────────────────────────────

/** He may grab a thing of his now: on foot by his land, nothing else holding him, no mode of the build's but move mode. */
function canGrab(ctx: RoamCtx): boolean {
  if (!env || lastMode !== 'walk' || env.busy() || BuildWork.active || card?.open || ask?.open || pressing || drag) return false;
  if (placing || FootMode.on || PAINT_LINK.on) return false;
  const p = ctx.body.pos;
  return pastPlot(p.x, p.z) <= MODE_FAR;
}

/** Out of the drag: nothing carried any more (what was not put down stays where it was). */
function endDragMode(): void {
  drag = null;
  dragGround = null;
  if (FootMode.carrying) exitFoot();
  exitPlacing();
  showTouchBar(false);
}

const dragGrab = {
  can(x: number, y: number): boolean {
    const ctx = lastCtx;
    return !!ctx && canGrab(ctx) && !!grabAt(ctx, x, y);
  },
  start(x: number, y: number): boolean {
    const ctx = lastCtx;
    if (!env || !ctx || !canGrab(ctx)) return false;
    const g = grabAt(ctx, x, y);
    if (!g) return false;
    if (g.why) {
      ctx.hud.toast(t(g.why, { name: g.name }));
      env.uiSound('tick');
      return false;
    }
    const hit = landHit(ctx.cam.camera, x, y);
    MoveMode.exit();
    MoveMode.hover(null);
    if (g.piece) {
      const b = g.piece;
      drag = { foot: false, offX: hit ? b.x - hit[0] : 0, offZ: hit ? b.z - hit[1] : 0 };
      dragGround = hit;
      enterPlacing(b.id, b);
      turn = 0;
      spot.step = -1;
    } else {
      const r = g.foot!;
      const cx = (cellMin(r.rect.i0) + cellMin(r.rect.i1 + 1)) / 2;
      const cz = (cellMin(r.rect.k0) + cellMin(r.rect.k1 + 1)) / 2;
      drag = { foot: true, offX: hit ? cx - hit[0] : 0, offZ: hit ? cz - hit[1] : 0 };
      dragGround = hit;
      enterFoot(r.kind, r);
      FootMode.dragging = true;
      FootMode.holdCarry(cx, cz, null);
    }
    showTip(null);
    env.uiSound('select');
    console.info(`[build] ${(g.piece ?? g.foot)!.uid} grabbed to drag`);
    return true;
  },
  end(drop: boolean): void {
    const d = drag;
    const ctx = lastCtx;
    if (!d || !env || !ctx) return endDragMode();
    if (d.foot) {
      if (FootMode.carrying && drop) {
        FootMode.refresh(ctx);
        if (!FootMode.putDown(ctx)) {
          const why = FootMode.prompt?.split('  ·  ')[0];
          if (why) ctx.hud.toast(why);
          env.uiSound('tick');
        }
      }
      return endDragMode();
    }
    if (placing && moving && drop) {
      spot.step = -1;
      placingNow(ctx);
      if (spot.ok && BUILD.list.includes(moving) && !whyNot(moving)) putMoved(ctx, moving);
      else {
        if (spot.reason) ctx.hud.toast(t(reasonWord(spot.reason)));
        env.uiSound('tick');
      }
    }
    turn = 0;
    endDragMode();
  },
};

/** The words by the mouse over a thing he can grab: "Hold and drag to move it", or why not. */
let tip: HTMLElement | null = null;
let tipSaid = '';
function showTip(h: Grabbed | null, at?: { x: number; y: number }): void {
  if (typeof document === 'undefined' || !env) return;
  if (!h || !at) {
    if (tip) tip.style.display = 'none';
    return;
  }
  if (!tip) {
    injectStyle();
    tip = document.createElement('div');
    tip.className = 'bd-grab-tip';
    document.body.append(tip);
  }
  const s = h.why ? t(h.why, { name: h.name }) : t('dragTip');
  if (s !== tipSaid) {
    tipSaid = s;
    tip.textContent = s;
  }
  tip.classList.toggle('is-no', !!h.why);
  tip.style.display = 'block';
  tip.style.left = `${at.x + 16}px`;
  tip.style.top = `${at.y + 18}px`;
}

/** E in build mode: pay, and he builds it. */
function buildHere(ctx: RoamCtx): void {
  if (!env || !placing) return;
  placingNow(ctx);
  if (!spot.ok) return;
  if (moving) {
    // (moving one: put down where the ghost is, at once and free; move mode goes on for the next)
    const m = moving;
    if (!BUILD.list.includes(m)) return backToMove();
    const why = whyNot(m);
    if (why) {
      ctx.hud.toast(t(why, { name: pieceWord(m) }));
      return backToMove();
    }
    putMoved(ctx, m);
    turn = 0;
    if (drag) endDragMode();
    else backToMove();
    return;
  }
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
  const piece = BUILD.add(id, spot.x, spot.y, spot.z, spot.yaw, 0, undefined, false, spot.len);
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
  console.info(`[build] ${piece.uid} at (${piece.x.toFixed(2)}, ${piece.z.toFixed(2)}) yaw ${((piece.yaw * 180) / Math.PI).toFixed(0)}°${piece.len !== undefined ? ` ${piece.len.toFixed(2)} m` : ''}: used ${JSON.stringify(used)}, paid ${pay.riel} riel`);
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
/**
 * How far build mode's first move turned the camera round over his shoulder (rad): W, the stick and the touch stick
 * walk that much back from the camera's heading, so he walks where he faced as the mode opened, not along the camera.
 */
let modeTurned = 0;
/** The follow camera's swing behind him before build mode held it (put back after). */
let followBefore: number | null = null;
/** Where build mode's camera last looked (eased back from it after). */
const lastAim = { x: 0, z: 0 };

/**
 * Build mode's camera under a roof (AWP-23: placing furniture in a room): a roof this far over his feet at most (m)
 * makes it a room; its tilt (rad), its distance (m) at least and at most, kept this far this side of a wall.
 */
const ROOM_CAM = { roof: 7, pitch: 0.55, least: 2.2, most: 6, margin: 0.7, look: 0.8, hangLook: 2.45, hangPitch: 0.15 };
const _rc = { x: 0, y: 0, z: 0 };
/** Under a roof: the room's tilt and as far back as there is room (true); else false (build mode's own). */
function roomCamera(ctx: RoamCtx, kk: number): boolean {
  const w = ctx.world;
  const b = ctx.body.pos;
  const roof = w.ceilingAt?.(b.x, b.z, b.y + 0.5) ?? Infinity;
  if (roof - b.y > ROOM_CAM.roof) return false;
  const cam = ctx.cam;
  const f = cam.focus;
  // (it looks at the ghost's middle, not over his shoulders at his chest's height: the ghost mid-screen)
  // (a hanging lantern: between its outline on the floor and its glass over his head, the camera lower)
  const hang = !!placing && isFurniture(placing) && !!FURN[placing].hang;
  f.y += ((placing ? spot.y : b.y) + (hang ? ROOM_CAM.hangLook : 0.45) - f.y) * ROOM_CAM.look * modeCamToward;
  // (the room behind the camera's way out at the room's tilt: its walls, its roof)
  const cp = Math.cos(ROOM_CAM.pitch);
  _rc.x = f.x - Math.sin(cam.yaw) * cp * ROOM_CAM.most;
  _rc.y = f.y + Math.sin(ROOM_CAM.pitch) * ROOM_CAM.most;
  _rc.z = f.z - Math.cos(cam.yaw) * cp * ROOM_CAM.most;
  const clear = w.hardClearance ?? w.clearance;
  const t = clear ? clear(f.x, f.y, f.z, _rc.x, _rc.y, _rc.z) : 1;
  const want = Math.max(ROOM_CAM.least, Math.min(ROOM_CAM.most, t * ROOM_CAM.most - ROOM_CAM.margin));
  cam.pitch += ((hang ? ROOM_CAM.hangPitch : ROOM_CAM.pitch) - cam.pitch) * kk;
  cam.distance += (want - cam.distance) * kk;
  return true;
}

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
    if (open && Math.abs(round) < 1.3) {
      cam.yaw += round * kk;
      modeTurned += round * kk;
    }
    const reach = aim.reach;
    // (under a roof, AWP-23: a room's camera — low, as far back as the room lets it, so the ghost sits mid-screen and
    // the follow camera never has to rise over him to find room)
    if (roomCamera(ctx, kk)) return;
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
      if (MoveMode.on) {
        // (move mode: ✕ out of it, the other button the card; nothing to turn before he picks one up)
        if (d === 'done') exitMove();
        else if (d === 'other' && lastCtx) openCard(lastCtx);
        return;
      }
      if (FootMode.on) {
        // (footprint mode: ⟲ ⟳ the door side, ✕ the first corner again, then out)
        if (d === 'done') backFoot();
        else if (d === 'left') FootMode.turnDoor(-1);
        else if (d === 'right') FootMode.turnDoor(1);
        else if (lastCtx) openCard(lastCtx);
        return;
      }
      // (carrying one he moves: ✕ puts it back, move mode goes on)
      if (d === 'done') {
        if (drag) endDragMode();
        else if (moving) backToMove();
        else exitPlacing();
      } else if (d === 'left') turnBy(1);
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
  // (move mode: nothing to turn until he picks one up)
  touchBar.classList.toggle('is-pick', MoveMode.on);
  const done = FootMode.carrying || (placing && moving) ? t('movePutBack') : FootMode.on && FootMode.stretching ? t('footAgain') : t('buildExit');
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
    .bd-grab-tip { position: fixed; z-index: 7; pointer-events: none; display: none; padding: 4px 9px 5px; border-radius: 4px; white-space: nowrap;
      background: rgba(14, 20, 30, 0.86); box-shadow: 0 0 0 1px rgba(255, 216, 120, 0.55); color: #ffe2a0; font: 600 13px / 1.3 var(--mu-display); }
    .bd-grab-tip.is-no { color: #ffb4a0; box-shadow: 0 0 0 1px rgba(255, 150, 120, 0.5); }
    :lang(km) .bd-grab-tip { font-size: 14px; line-height: 1.45; }
    .bd-bar { position: absolute; left: 50%; bottom: calc(206px + 4vh); transform: translateX(-50%); display: none; gap: 8px; z-index: 6; pointer-events: auto; }
    body.roam-touch:not(.pad-on) .bd-bar.is-on { display: flex; }
    .bd-bar.is-pick [data-do="left"], .bd-bar.is-pick [data-do="right"], .bd-bar.is-pick .bd-tb-deg { display: none; }
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
          group: 'foot',
        };
      });
      // (paint, AWP-22: the Buildings tab's last row; paint mode is roam/_paint.ts)
      const paint: BuildRow = { id: 'paint', name: t('paintRow'), count: '', note: t('paintRowLine'), short: false, buy: null, cost: [], price: '', off: BLOCKS.count ? null : t('paintNone'), group: 'foot' };
      // (move mode: beside paint, a tool for what he built; roam/_buildMove.ts)
      const move: BuildRow = { id: 'move', name: t('moveRow'), count: '', note: t('moveRowLine'), short: false, buy: null, cost: [], price: '', off: BUILD.list.length ? null : t('moveNone'), group: 'foot' };
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
          group: isFurniture(id) ? 'furn' : 'yard',
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
        rows: [...feet, paint, move, ...rows],
        meter,
        // (on tabs, AWP-23: the footprint buildings, the yard's pieces, the furniture (each 9 rows at most: the keys 1‥9);
        // on a floor it opens on the furniture)
        groups: [
          { id: 'foot', label: t('buildFootTab') },
          { id: 'yard', label: t('buildYardTab') },
          { id: 'furn', label: t('buildFurnTab') },
        ],
        group: onFurnFloor(ctx.world, ctx.body.pos.x, ctx.body.pos.y, ctx.body.pos.z) ? 'furn' : undefined,
      };
    },
    (id) => {
      if (!id || BuildWork.active) return;
      if (id === 'paint') {
        if (!BLOCKS.count) return;
        exitPlacing();
        exitFoot();
        exitMove();
        PAINT_LINK.enter();
        return;
      }
      if (id === 'move') {
        if (BUILD.list.length) enterMove();
        return;
      }
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
    const hw = (q.len ?? P.w) / 2;
    const cx = Math.max(-hw, Math.min(hw, _l[0]));
    const cz = Math.max(-P.d / 2, Math.min(P.d / 2, _l[1]));
    const c = Math.cos(q.yaw);
    const s = Math.sin(q.yaw);
    const wx = q.x + cx * c + cz * s - p.x;
    const wz = q.z - cx * s + cz * c - p.z;
    const l = Math.hypot(wx, wz);
    const dot = l > 0.05 ? (wx * fx + wz * fz) / l : 1;
    // (a seat — the bed, a bench — from any side he stands by, beside it too, and before what is near it: AWP-23)
    const seat = !!P.seat && q.done >= 1;
    if (dot < (seat ? (d < SEAT_BY ? -1.01 : SEAT_FACING) : 0.35)) continue;
    const sc = d - dot * 0.5 - (seat ? SEAT_FIRST : 0);
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
  // (on the ground: not on the veranda or the stair; or on a floor furniture goes on, AWP-23: his house's, his blocks')
  if (p.y - ctx.world.field.heightAt(p.x, p.z) > 0.9) return onFurnFloor(ctx.world, p.x, p.y, p.z);
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
    // (paint mode, AWP-22: its F opens the card again; it ends when build mode starts)
    PAINT_LINK.card = () => void (lastCtx && openCard(lastCtx));
    PAINT_LINK.building = () => !!placing || FootMode.on || MoveMode.on;
    // (press and drag a thing he built, from the mouse and the finger: dragGrab.ts)
    DRAG_GRAB.by = dragGrab;
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
    installFurniture(e, view);
    BuildUses.init(e.world.field, view.standing);
    view.onStanding(() => BuildUses.sync(true));
    BUILD.on((ev) => {
      // (moved: its hammock and prayer spot registered again where it stands now)
      if (ev.type === 'moved') BuildUses.forget(ev.piece.uid);
      if (ev.type !== 'progress') BuildUses.sync();
    });
    ghost = new BuildGhost(e.scene, e.world);
    // (move mode: a piece aimed at and picked up is build mode with it)
    MoveMode.init(e, e.scene, (ctx, b, foot) => (foot ? carryFoot(ctx, foot) : b && pickUp(ctx, b)));
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
            pieces: BUILD.list.map((p) => ({ uid: p.uid, id: p.id, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), yaw: +p.yaw.toFixed(3), done: +p.done.toFixed(3), ...(p.len !== undefined ? { len: +p.len.toFixed(3) } : {}) })),
            version: BUILT.version,
            placing: placing ? { id: placing, x: +spot.x.toFixed(2), y: +spot.y.toFixed(2), z: +spot.z.toFixed(2), ceil: Number.isFinite(spot.ceil) ? +spot.ceil.toFixed(2) : null, yaw: +spot.yaw.toFixed(3), deg: shownDeg(placing, spot.yaw), turn: +turn.toFixed(3), ok: spot.ok, reason: spot.reason, prompt: spot.prompt, snapped: spot.snapped, edge: spot.edge, moving: moving?.uid ?? null, len: spot.len !== undefined ? +spot.len.toFixed(3) : null, ghost: !!ghost?.shown } : null,
            moveMode: MoveMode.on ? { aimed: MoveMode.aimed.piece?.uid ?? (MoveMode.aimed.foot ? `foot:${MoveMode.aimed.foot.uid}` : null), why: MoveMode.aimed.why } : null,
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
          // (move mode: on / off; pick up a piece by its uid as E on it would)
          moveMode: (want = true) => (want ? enterMove() : exitMove()),
          move: (uid: string) => {
            const p = BUILD.byUid(uid);
            if (!p || !lastCtx) return 'no piece';
            if (!MoveMode.on) enterMove();
            const why = whyNot(p);
            if (why) return why;
            pickUp(lastCtx, p);
            return null;
          },
          // (a footprint building by its uid, as E on it would)
          moveFoot: (uid: string) => {
            const r = FOOTS.byUid(uid);
            if (!r || !lastCtx) return 'no building';
            if (!MoveMode.on) enterMove();
            const why = whyNotFoot(r);
            if (why) return why;
            carryFoot(lastCtx, r);
            return null;
          },
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
            done: (uid: string, v: number) => {
              const r = FOOTS.byUid(uid);
              if (r) FOOTS.setDone(r, v);
            },
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
    lastMode = m;
    stepN++;
    FootMode.nextStep();
    MoveMode.nextStep();
    if (card?.open || ask?.open) return true;
    holdStep(ctx, dt);
    if (BuildWork.active) return tap('KeyJ', 'KeyL', 'KeyF', 'KeyC', 'KeyU', 'KeyP', 'Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3', 'KeyO', 'KeyI');
    if (pressing) return false;
    // (in build mode, the move turned back by the camera's turn over his shoulder: walker.ts reads it along the camera)
    if ((placing || FootMode.on) && m === 'walk' && modeTurned) {
      const mv = ctx.input.move;
      const c = Math.cos(modeTurned);
      const sn = Math.sin(modeTurned);
      const x = mv.x;
      const y = mv.y;
      mv.x = x * c + y * sn;
      mv.y = y * c - x * sn;
    }
    if (placing) {
      const p = ctx.body.pos;
      // (out of it: far from home, another mode, all of it built, not enough riel)
      // (one he moves: never "all of it built" or "not enough riel"; it is his already)
      if (m !== 'walk' || pastPlot(p.x, p.z) > MODE_FAR || (!moving && cannot(placing))) {
        exitPlacing();
        return false;
      }
      const i = ctx.input;
      const taps = i.taps as Set<string> | undefined;
      // Esc (the pad's ○, the touch ✕): out of build mode — not "Back to the map?"; carrying one he moves: put back.
      if (i.exit) {
        i.exit = false;
        env?.uiSound('close');
        if (drag) endDragMode();
        else if (moving) backToMove();
        else exitPlacing();
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
    if (MoveMode.on) {
      const p = ctx.body.pos;
      // (out of it: far from home, another mode)
      if (m !== 'walk' || pastPlot(p.x, p.z) > MODE_FAR) {
        exitMove();
        return false;
      }
      const i = ctx.input;
      const taps = i.taps as Set<string> | undefined;
      // Esc (the pad's ○, the touch ✕): out of move mode — not "Back to the map?".
      if (i.exit) {
        i.exit = false;
        env?.uiSound('close');
        exitMove();
        return false;
      }
      if (tap('KeyF', 'KeyC')) {
        taps?.delete('KeyF');
        taps?.delete('KeyC');
        openCard(ctx);
        return true;
      }
      // A mouse click on a piece: picked up (as E).
      if (i.click && !env?.busy()) {
        i.click = false;
        MoveMode.use(ctx);
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
    // (build mode's E is `buildMode`'s, first in the row; move mode's too)
    if (m !== 'walk' || !env || placing || FootMode.on || MoveMode.on || BuildWork.active || card?.open || ask?.open || env.busy()) return null;
    if (pressing) return near.prompt;
    nearNow(ctx);
    if (near.prompt) return near.prompt;
    return canStart(ctx, false) ? words('start', () => `E  ${t('buildStart')}`) : null;
  },
  use(ctx) {
    if (!env || BuildWork.active || placing || FootMode.on || MoveMode.on) return;
    nearNow(ctx);
    if (near.piece) {
      wireHold();
      const piece = near.piece;
      pressing = {
        job: pieceJob(piece),
        dist: (x, z) => distTo(piece, x, z),
        t: 0,
        tap: piece.done < 1 ? 'keep' : near.bed ? 'sleep' : near.sit ? 'sit' : null,
        bed: near.bed,
      };
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
    lastMode = m;
    BuildWork.after(ctx, dt);
    // (the ghost's spot first: the camera's move starts toward where the ghost is now, not where it was)
    const free = m === 'walk' && !BuildWork.active && !card?.open && !!env && !env.busy();
    // Press and drag: the ground under the pointer (what he holds follows it); the thing under the mouse, gold.
    if (drag) {
      if (!placing && !FootMode.carrying) endDragMode();
      else {
        dragGround = landHit(ctx.cam.camera, DRAG_GRAB.at.x, DRAG_GRAB.at.y) ?? dragGround;
        if (drag.foot && dragGround) FootMode.holdCarry(dragGround[0] + drag.offX, dragGround[1] + drag.offZ, null);
      }
    }
    const ptr = ctx.input.pointer;
    const hv = !drag && free && ptr && !pad.active && !onTouch() && !DRAG_GRAB.active && canGrab(ctx) ? grabAt(ctx, ptr.x, ptr.y) : null;
    MoveMode.hover(hv);
    showTip(hv, ptr ?? undefined);
    if (env && hv !== hovered) {
      if (!!hv !== !!hovered) env.canvas.style.cursor = hv ? 'pointer' : 'grab';
      hovered = hv;
    }
    if (placing && free) placingNow(ctx);
    if (FootMode.on && free) FootMode.step(ctx);
    // (dragging: the camera holds still, so the ground under the pointer does not slide away)
    if (m === 'walk' && !BuildWork.active && !drag) modeCamera(ctx, (!!placing || FootMode.on) && !card?.open, dt);
    // Move mode: the piece aimed at, highlighted; the gold ring.
    if (MoveMode.on && free) MoveMode.step(ctx);
    MoveMode.show(free && !card?.open);
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
    if (MoveMode.on || moving) barWords();
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
      // (one he moves looks as it stands: its own seed)
      ghost?.setPiece(placing, spot.len, moving?.seed);
      ghost?.show(spot.x, spot.z, spot.yaw, spot.ok, spot.y, spot.ceil);
    } else ghost?.show(null);
  },
  frame(f: MapFrame, _m: RoamMode) {
    if (!view) return;
    view.frame(f.camera, f.t, f.dt, f.night);
    // His land's edge while he builds (build mode, the card), or a check's `plotedge=1`.
    edge?.show(!!placing || FootMode.on || MoveMode.on || !!card?.open || edgeHeld);
    edge?.frame(f.dt > 0 ? f.dt : 0);
    ghost?.frame(f.dt > 0 ? f.dt : 0);
    MoveMode.frame(f.dt > 0 ? f.dt : 0);
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
    drag = null;
    dragGround = null;
    MoveMode.hover(null);
    showTip(null);
    exitPlacing();
    exitMove();
    exitFoot();
  },
  fromUrl(q, ctx) {
    lastCtx = ctx;
    // (every value here is a check's: shots and the dev server only, never the live site, where a link would build
    // pieces into a player's save or open build mode: REVIEW.md "Lessons")
    if (!(env?.shot || import.meta.env.DEV)) return;
    if (q.get('build') === 'all' && !BUILD.list.length) placeAll(ctx.world);
    furnFromUrl(q, ctx);
    // (move mode: `buildmove=1` on, `buildmove=<uid>` that piece picked up)
    const mv = q.get('buildmove');
    if (mv) {
      // (`foot:<uid>[@x/z[/door]]`: a footprint building, held with its middle there)
      const fm = /^foot:([a-z]+-\d+)(?:@(-?[\d.]+)\/(-?[\d.]+)(?:\/([0-3]))?)?$/.exec(mv);
      const rec = fm ? FOOTS.byUid(fm[1]) : null;
      const piece = mv === '1' || fm ? null : BUILD.byUid(mv);
      if (fm && !rec) console.warn(`[build] buildmove=: no footprint building "${fm[1]}" (${FOOTS.list.map((r) => r.uid).join(', ')})`);
      else if (!fm && mv !== '1' && !piece) console.warn(`[build] buildmove=: no piece "${mv}" (${BUILD.list.map((p) => p.uid).join(', ')})`);
      enterMove();
      if (piece) pickUp(ctx, piece);
      if (rec) {
        carryFoot(ctx, rec);
        if (fm![2] !== undefined) FootMode.holdCarry(Number(fm![2]), Number(fm![3]), fm![4] === undefined ? null : (Number(fm![4]) as FootSide));
      }
    }
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
    // (furniture as `furn=`, on its floor: AWP-23; the rest as `build=`)
    const b = BUILD.report()
      ?.split(',')
      .filter((e) => !isFurniture(e.slice(0, e.indexOf('@'))))
      .join(',');
    if (b) out.build = b;
    const fr = furnReport();
    if (fr) out.furn = fr;
    const fc = FootMode.carrying;
    if (fc) {
      const st = FootMode.state();
      const r = st.rect;
      out.buildmove = r ? `foot:${fc.uid}@${((r.i0 + r.i1 + 1) * 0.25).toFixed(2)}/${((r.k0 + r.k1 + 1) * 0.25).toFixed(2)}/${st.door}` : `foot:${fc.uid}`;
    } else if (placing && moving) out.buildmove = moving.uid;
    else if (placing) out.buildghost = `${placing}:${((turn * 180) / Math.PI).toFixed(0)}`;
    else if (MoveMode.on) out.buildmove = '1';
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
  // (while he places a piece or draws a footprint, "Build here" is the E row's last line: nothing after it, _addons.ts)
  get endsRow() {
    return !!placing || FootMode.on || MoveMode.on;
  },
  // While he places a piece, the pad's L2 is the fine turn's (L2 held with ← →: 5°), not the binoculars' (their add-on,
  // order 5, takes the L2 press after this one: taken here, it never raises them).
  input(_ctx, m) {
    if (placing && m === 'walk' && !BuildWork.active) pad.take('l2');
    return false;
  },
  offer(ctx, m) {
    if ((!placing && !FootMode.on && !MoveMode.on) || m !== 'walk' || !env || BuildWork.active || card?.open || ask?.open || env.busy()) return null;
    lastCtx = ctx;
    if (MoveMode.on) return MoveMode.step(ctx);
    if (FootMode.on) {
      FootMode.step(ctx);
      return FootMode.prompt;
    }
    placingNow(ctx);
    return spot.prompt;
  },
  use(ctx) {
    if (FootMode.on && env && !BuildWork.active) useFoot(ctx);
    else if (MoveMode.on && env && !BuildWork.active) MoveMode.use(ctx);
    else if (placing && env && !BuildWork.active) buildHere(ctx);
  },
});

/**
 * The late half of the E row (after every other add-on's: the garden's "Plant…" first): "E  Build…" anywhere near
 * his house where nothing else here has E. Just before the garden's late half (`GARDEN_LATE`: "E  Plant…" and its
 * lines with no key) so that a line of the garden's with no key (no seeds yet, the can empty, the jar empty) never
 * hides it: the garden's line goes on after it ("E  Build…  ·  You have no seeds yet…"), and a real E of the
 * garden's still comes first. By the house the early half's "E  Build…" (94) is there already: not twice.
 */
const GARDEN_LATE = 95;
/** The garden's late offer, worked out once a step there (_garden.ts `chooseOnce`), or null. */
const gardenLate = (ctx: RoamCtx, m: 'walk' | 'boat'): string | null => addonOffer(ctx, m, GARDEN_LATE, GARDEN_LATE)?.prompt ?? null;
/** Build mode, a card or the work has him: no "Build…". */
const lateOff = (m: 'walk' | 'boat'): boolean => m !== 'walk' || !env || !!placing || FootMode.on || MoveMode.on || !!pressing || BuildWork.active || !!card?.open || !!ask?.open || env.busy();
registerAddon({
  id: 'buildLate',
  order: GARDEN_LATE - 0.1,
  offer(ctx, m) {
    if (lateOff(m) || !canStart(ctx, true)) return null;
    // (by the house with nothing of his in reach: the early half says it)
    if (canStart(ctx, false) && !near.prompt) return null;
    const g = gardenLate(ctx, m);
    if (g?.startsWith('E ')) return null;
    const start = words('start', () => `E  ${t('buildStart')}`);
    return g ? words(`start|${g}`, () => `${start}  ·  ${g}`) : start;
  },
  use(ctx) {
    if (!env || BuildWork.active || placing || FootMode.on || MoveMode.on || !canStart(ctx, true)) return;
    openCard(ctx);
  },
});

/**
 * "E  Build…" after the garden's "E  Plant…" (AWP-33: every E choice shows, the E list _eChoices.ts): where the garden
 * has an E of its own on his land, it stays the top line, and "Build…" is the next.
 */
registerAddon({
  id: 'buildLater',
  order: GARDEN_LATE + 0.1,
  offer(ctx, m) {
    if (lateOff(m) || !canStart(ctx, true)) return null;
    return gardenLate(ctx, m)?.startsWith('E ') ? words('start', () => `E  ${t('buildStart')}`) : null;
  },
  use(ctx) {
    if (!env || BuildWork.active || placing || FootMode.on || MoveMode.on || !canStart(ctx, true)) return;
    openCard(ctx);
  },
});
