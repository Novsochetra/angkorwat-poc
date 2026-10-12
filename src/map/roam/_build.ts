import { BUILD_NEAR, BUILT, PIECE_IDS, PIECES, pieceToWorld, type Built, type PieceId } from '../build/pieces';
import { BUILD, distTo, toLocal } from '../build/state';
import { createBuildView, type BuildView } from '../build/view';
import { HOME, HOME_AT, homeToWorld } from '../hamlet/_homePlan';
import { pad } from '../pad/pad';
import { progress } from '../progress';
import type { MapFrame, RoamMode } from '../types';
import { createAskCard, type AskCard } from '../ui/ask';
import { lang, num, t, type WordKey } from '../ui/lang';
import { registerAddon, type AddonEnv } from './_addons';
import { createBuildCard, type BuildCard, type BuildRow } from './_buildCard';
import { BuildGhost } from './_buildGhost';
import { BUILD_REASON_WORDS, byHouse, canBuild, ghostAhead, type BuildReason } from './_buildSpots';
import { BuildUses } from './_buildUses';
import { installBuildWalk } from './_buildWalk';
import { BuildWork, pieceWord } from './_buildWork';
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
 *   anywhere within `BUILD_NEAR` m of it where nothing else takes E (the garden's
 *   "Plant…" first): "E  Build…" opens the build card: every piece with its price,
 *   how many he has of how many; not enough riel: greyed with how much more.
 * - **Build mode** (a piece picked): its ghost before him (green where it can
 *   stand, red with the reason where not: too far, water, the path, a rice field,
 *   the house, a neighbour's yard, not level, a plant, something he built, something
 *   else); it turns with him, `,` / `.` (the pad's d-pad ← →, the touch ⟲ ⟳) turn it
 *   15° more; a fence run's end snaps onto the end of one he built. "E  Build here"
 *   pays (`purse.pay`) and he builds it (the work); F / C (the pad's ↓) the card
 *   again; Esc (the pad's ○, the touch ✕) leaves the mode, never asking "Back to the
 *   map?". A fence or a lantern post: the mode stays on for the next.
 * - **By a piece** (facing it, within reach): half built, "E  Keep building";
 *   a seat (the bed, the shelter's bench), "E  Sit" (J / L there too: _rest.ts
 *   `REST_SEATS`); hold E (the bar fills, 0.8 s) to take it down — asked first,
 *   half its price back. A hammock's E is the hammock add-on's, the spirit house's
 *   "Pray" the shrine's (both before this).
 *
 * URL (shots and the dev server: a link never changes a player's saved pieces):
 * `build=<id>@x/z/yaw[:done],…` (yaw in degrees, done 0‥1), `build=all` (one of
 * each standing round the house), `build=0` · `buildcard=1` · `buildghost=<id>[:<deg>]`
 * (build mode, its ghost turned that much more) · `buildwork=<id>:<0‥1>[:<s>]` (him
 * at work on one, that far built, `s` into a stroke; the one of that kind under way,
 * else a new one before him) · `buildtake=<uid>` (the take-down question; `:<0‥1>`
 * him taking it down that far) · `buildsit=<uid>[:lie]` (sitting / lying on it) ·
 * `buildhint=1`. `report()` gives `build=` (and `buildghost=`, `buildwork=`).
 * `window.__build` (shots, the dev server): `state()`, `canBuild`, `add`, `card`,
 * `place`, `rebuild`. Console lines start `[build]`.
 */

/** Turning the ghost: a step (rad). */
const TURN_STEP = Math.PI / 12;
/** "E  Build…" by the house: within this of its footprint and stair (m). */
const BY_HOUSE = 2.6;
/** Build mode ends past this far from the house's middle (m). */
const MODE_FAR = BUILD_NEAR + 8;
/** E held this long (s) on a piece takes it down (asked first). */
const HOLD_FOR = 0.8;
/** He reaches a piece from this far (m, his feet to its footprint), facing it. */
const PIECE_REACH = 1.25;
/** A fence's end snaps onto another's end within this (m) and this turn (rad). */
const SNAP = { d: 1.1, turn: 0.6 };
/** Pieces the mode stays on for (one after another). */
const REPEAT: ReadonlySet<PieceId> = new Set<PieceId>(['fence', 'lamp']);
/** Build mode's camera: tilt, distance at least (and per metre of the piece's reach), its ease and back (1/s), the focus toward the ghost. */
const MODE_CAM = { pitch: 0.66, distance: 8, perReach: 1.1, rate: 2.5, back: 2, toward: 0.75, shoulder: 0.45 };

let env: AddonEnv | null = null;
let view: BuildView | null = null;
let ghost: BuildGhost | null = null;
let card: BuildCard | null = null;
let ask: AskCard | null = null;
let lastCtx: RoamCtx | null = null;
/** Build mode: the piece he is placing (picked on the card), its extra turn (rad). */
let placing: PieceId | null = null;
let turn = 0;
/** Build mode now (worked out once a step): the spot (m), its turn, can it stand there, why not, the prompt. */
const spot = { x: 0, z: 0, yaw: 0, ok: false, reason: null as BuildReason | null, step: -1, prompt: null as string | null, snapped: false };
let stepN = 0;
/** What E does by a piece now (once a step). */
const near = { step: -1, piece: null as Built | null, sit: false, prompt: null as string | null };
/** E held on a piece: the piece, how long, what a short press does. */
let pressing: { piece: Built; t: number; tap: 'sit' | 'keep' | null } | null = null;
/** The piece the take-down question is about. */
let asking: Built | null = null;
/** The hint said (saved; a shot only with `buildhint=1`). */
let hinted: boolean = progress.get<boolean>('build.hinted', false);
let modeCamBefore: { pitch: number; distance: number } | null = null;
let modeCamToward = 0;
let modeCamLetGo = false;
let touchBar: HTMLElement | null = null;

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
  const gone = !BUILD.list.includes(h.piece) || distTo(h.piece, b.x, b.z) > PIECE_REACH + 0.6 || BuildWork.active;
  if (gone) {
    pressing = null;
    holdBar(null);
    return;
  }
  if (!eHeld()) {
    // (a short press: its own job)
    pressing = null;
    holdBar(null);
    if (h.tap === 'keep') BuildWork.start(ctx, h.piece);
    else if (h.tap === 'sit') env?.controls.press('KeyJ');
    return;
  }
  h.t += dt;
  holdBar(Math.min(1, h.t / HOLD_FOR));
  if (h.t < HOLD_FOR) return;
  pressing = null;
  holdBar(null);
  askTake(ctx, h.piece);
}

/** "Take down the bamboo bed? You get half its price back: 7,500 ៛." */
const SAW = `<svg class="mu-icon" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges"><path fill="#8a6038" d="M2 9h12v3H2z"/><path fill="#b08a5a" d="M2 9h12v1H2z"/><path fill="#c8ccd0" d="M6 2h2v6H6z"/><path fill="#e8eef2" d="M6 2h1v6H6z"/><path fill="#7a5a3a" d="M5 1h4v2H5z"/><path fill="#ffd27a" d="M10 5h1v1h-1zM11 6h1v1h-1zM12 4h1v1h-1z"/></svg>`;
function askTake(ctx: RoamCtx, b: Built): void {
  if (!env) return;
  asking = b;
  lastCtx = ctx;
  ask ??= createAskCard(document.getElementById('ui') ?? document.body, {
    cls: 'bd-take',
    icon: SAW,
    words: () => {
      const q = asking ?? BUILD.list[0];
      const id = q?.id ?? 'kre';
      return {
        title: t('buildTakeAsk', { name: pieceWord({ id }) }),
        note: t('buildTakeNote', { riel: riel(Math.floor(PIECES[id].price / 2)) }),
        stay: t('buildTakeNo'),
        go: t('buildTakeYes'),
      };
    },
    onGo: () => {
      const q = asking;
      asking = null;
      if (q && lastCtx && BUILD.list.includes(q) && !BuildWork.active) BuildWork.start(lastCtx, q, true);
    },
    sound: env.uiSound,
  });
  ask.ask();
}

// ── Build mode ─────────────────────────────────────────────────────────────

/** A fence's spot snapped onto the end of one he built (its run going on), if near: into `spot`. */
function snapFence(): boolean {
  let best = SNAP.d;
  let bx = 0;
  let bz = 0;
  let byaw = 0;
  const half = PIECES.fence.w / 2;
  for (const f of BUILT.list) {
    if (f.id !== 'fence') continue;
    for (const end of [-1, 1]) {
      for (const flip of [0, Math.PI]) {
        const yaw = f.yaw + flip;
        const dy = Math.atan2(Math.sin(yaw - spot.yaw), Math.cos(yaw - spot.yaw));
        if (Math.abs(dy) > SNAP.turn) continue;
        // (the run going on from this end: the next one's middle half a run further along)
        const c = Math.cos(f.yaw);
        const s = Math.sin(f.yaw);
        const ex = f.x + end * 2 * half * c;
        const ez = f.z - end * 2 * half * s;
        const d = Math.hypot(ex - spot.x, ez - spot.z);
        if (d < best) {
          best = d;
          bx = ex;
          bz = ez;
          byaw = yaw;
        }
      }
    }
  }
  if (best >= SNAP.d) return false;
  spot.x = bx;
  spot.z = bz;
  spot.yaw = byaw;
  return true;
}

/** Build mode's spot and prompt now (once a step). */
function placingNow(ctx: RoamCtx): void {
  if (spot.step === stepN || !placing || !env) return;
  spot.step = stepN;
  const b = ctx.body;
  // (its front to him, turned more with , and .)
  spot.yaw = b.yaw + Math.PI + turn;
  const ahead = ghostAhead(placing, spot.yaw, b.yaw);
  spot.x = b.pos.x + Math.sin(b.yaw) * ahead;
  spot.z = b.pos.z + Math.cos(b.yaw) * ahead;
  spot.snapped = placing === 'fence' && snapFence();
  const r = canBuild(ctx.world, placing, spot.x, spot.z, spot.yaw);
  spot.ok = !r;
  spot.reason = r;
  const id = placing;
  const keys = words('modeKeys', () => `, .  ${t('buildTurn')}  ·  F  ${t('buildOther')}  ·  Esc  ${t('buildExit')}`);
  if (!r) spot.prompt = words(`here|${id}`, () => `E  ${t('buildHere')}  ·  ${keys}`);
  else if (onTouch()) spot.prompt = words(`no|${r}`, () => t(BUILD_REASON_WORDS[r]));
  else spot.prompt = words(`not|${r}`, () => `${t(BUILD_REASON_WORDS[r])}  ·  ${keys}`);
}

/** Why he cannot build `id` now (all of it built, not enough riel), or null. */
function cannot(id: PieceId): string | null {
  const p = PIECES[id];
  if (BUILD.count(id) >= p.max) return words(`all|${id}`, () => t('buildAllBuilt', { n: num(p.max) }));
  const riels = env?.purse.riel ?? 0;
  if (riels < p.price) return t('buildNeed', { riel: riel(p.price - riels) });
  return null;
}

function enterPlacing(id: PieceId): void {
  if (!placing) {
    modeCamLetGo = false;
    turn = 0;
  }
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
  if (!env.purse.pay(p.price)) {
    ctx.hud.toast(t('buildNoMoney', { riel: riel(p.price - env.purse.riel) }));
    exitPlacing();
    return;
  }
  const piece = BUILD.add(id, spot.x, ctx.world.field.heightAt(spot.x, spot.z), spot.z, spot.yaw);
  if (!piece) return;
  env.uiSound('select');
  ctx.hud.toast(t('buildPaid', { riel: riel(p.price) }));
  console.info(`[build] ${piece.uid} at (${piece.x.toFixed(2)}, ${piece.z.toFixed(2)}) yaw ${((piece.yaw * 180) / Math.PI).toFixed(0)}°: paid ${p.price} riel`);
  // (a fence or a lamp: the mode stays on for the next one, if he can)
  if (!REPEAT.has(id) || cannot(id)) exitPlacing();
  BuildWork.start(ctx, piece);
}

/** Build mode's camera: it looks down more, further back, the ghost in the middle (the player's drag wins). */
function modeCamera(ctx: RoamCtx, on: boolean, dt: number): void {
  const cam = ctx.cam;
  const i = ctx.input;
  const k = 1 - Math.exp(-MODE_CAM.rate * dt);
  if (on && placing) {
    modeCamBefore ??= { pitch: cam.pitch, distance: cam.distance };
    if (i.lookPitch || i.zoom || i.lookYaw) modeCamLetGo = true;
    modeCamToward += (1 - modeCamToward) * k;
    const f = cam.focus;
    f.x += (spot.x - f.x) * MODE_CAM.toward * modeCamToward;
    f.z += (spot.z - f.z) * MODE_CAM.toward * modeCamToward;
    // (over his shoulder, a little: the ghost ahead beside his hat, not under it)
    cam.behindYaw = ctx.body.yaw + MODE_CAM.shoulder * modeCamToward;
    if (modeCamLetGo) return;
    const reach = Math.hypot(PIECES[placing].w, PIECES[placing].d) / 2;
    cam.pitch += (MODE_CAM.pitch - cam.pitch) * k;
    const want = Math.min(cam.maxDistance, Math.max(MODE_CAM.distance + reach * MODE_CAM.perReach, modeCamBefore.distance));
    cam.distance += (want - cam.distance) * k;
    return;
  }
  if (modeCamToward > 0.001) {
    modeCamToward *= Math.exp(-MODE_CAM.back * dt);
    const f = cam.focus;
    f.x += (spot.x - f.x) * MODE_CAM.toward * modeCamToward;
    f.z += (spot.z - f.z) * MODE_CAM.toward * modeCamToward;
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
    el.innerHTML = `<button type="button" class="bd-tb mu-frame mu-sm" data-do="left" aria-label="⟲"><span class="mu-bg"></span><span class="bd-tb-t">⟲</span></button><button type="button" class="bd-tb mu-frame mu-sm" data-do="right" aria-label="⟳"><span class="mu-bg"></span><span class="bd-tb-t">⟳</span></button><button type="button" class="bd-tb mu-frame mu-sm" data-do="other"><span class="mu-bg"></span><span class="bd-tb-t"></span></button><button type="button" class="bd-tb mu-frame mu-sm" data-do="done"><span class="mu-bg"></span><span aria-hidden="true">✕</span><span class="bd-tb-t"></span></button>`;
    el.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!btn) return;
      env?.uiSound('select');
      const d = btn.dataset.do;
      if (d === 'done') exitPlacing();
      else if (d === 'left') turnBy(1);
      else if (d === 'right') turnBy(-1);
      else if (lastCtx) openCard(lastCtx);
    });
    env.layer.append(el);
    touchBar = el;
  }
  if (!touchBar) return;
  const ts = touchBar.querySelectorAll<HTMLElement>('.bd-tb-t');
  ts[2].textContent = t('buildOther');
  ts[3].textContent = t('buildExit');
  touchBar.classList.toggle('is-on', on);
}

function turnBy(dir: number): void {
  turn = Math.atan2(Math.sin(turn + dir * TURN_STEP), Math.cos(turn + dir * TURN_STEP));
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
      const rows: BuildRow[] = PIECE_IDS.map((id) => {
        const p = PIECES[id];
        return {
          id,
          name: nameOf(id),
          count: `${num(BUILD.count(id))}/${num(p.max)}`,
          note: t(p.line as WordKey),
          price: riel(p.price),
          off: cannot(id),
        };
      });
      return { title: t('buildCardTitle'), note: t('buildCardNote', { riel: riel(env?.purse.riel ?? 0) }), cancel: t('buildCardCancel'), rows };
    },
    (id) => {
      if (!id || BuildWork.active || cannot(id)) return;
      enterPlacing(id);
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
  if (!best) return;
  near.piece = best;
  const name = pieceWord(best);
  if (best.done < 1) {
    const pct = Math.round(best.done * 100);
    near.prompt = words(`keep|${best.id}|${pct}`, () => `E  ${t('buildKeep', { name, pct: num(pct) })}  ·  ${t('buildHoldTake')}`);
    return;
  }
  if (PIECES[best.id].seat && BuildUses.seatNear(p.x, p.y, p.z) === best) {
    near.sit = true;
    near.prompt = words(`sit|${best.id}`, () => `E  ${t('buildSit')}  ·  ${t('buildHoldTake')}`);
    return;
  }
  near.prompt = words(`take|${best.id}`, () => `E  ${t('buildTakeHold', { name })}`);
}

/** "E  Build…" here (on foot, his house, not on its floor)? */
function canStart(ctx: RoamCtx, anywhere: boolean): boolean {
  const p = ctx.body.pos;
  if (!HOME.owned || Math.hypot(p.x - HOME_AT.x, p.z - HOME_AT.z) > BUILD_NEAR) return false;
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
      if (q !== '0' && q !== 'all') BUILD.fromUrl(q, (x, z) => e.world.field.heightAt(x, z));
    }
    view = createBuildView(e.shot);
    e.scene.add(view.object);
    installBuildWalk(e.world);
    BuildUses.init(e.world.field, view.standing);
    view.onStanding(() => BuildUses.sync(true));
    BUILD.on(() => BuildUses.sync());
    ghost = new BuildGhost(e.scene, e.world);
    BuildWork.init(e);
    // (the card's riel and greyed rows as his purse changes while it is up)
    e.purse.onChange(() => card?.refresh());
    wireHold();
    injectStyle();
    if (q === 'all' && (e.shot || import.meta.env.DEV)) placeAll(e.world);
    BuildUses.sync();
    console.info(`[build] ${BUILD.list.length} pieces at home${BUILD.list.length ? `: ${BUILD.list.map((p) => `${p.uid}${p.done < 1 ? ` ${(p.done * 100).toFixed(0)}%` : ''}`).join(', ')}` : ''}${progress.saving ? '' : ' (not saved: a shot or progress=0)'}`);
    if (e.shot || import.meta.env.DEV)
      Object.assign(window, {
        __build: {
          state: () => ({
            pieces: BUILD.list.map((p) => ({ uid: p.uid, id: p.id, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), yaw: +p.yaw.toFixed(3), done: +p.done.toFixed(3) })),
            version: BUILT.version,
            placing: placing ? { id: placing, x: +spot.x.toFixed(2), z: +spot.z.toFixed(2), yaw: +spot.yaw.toFixed(3), turn: +turn.toFixed(3), ok: spot.ok, reason: spot.reason, prompt: spot.prompt, snapped: spot.snapped, ghost: !!ghost?.shown } : null,
            near: near.piece ? { uid: near.piece.uid, prompt: near.prompt, sit: near.sit } : null,
            work: BuildWork.now,
            card: !!card?.open,
            ask: !!ask?.open,
            pressing: pressing ? { uid: pressing.piece.uid, t: +pressing.t.toFixed(2) } : null,
            riel: env?.purse.riel ?? 0,
            owned: HOME.owned,
            view: view?.stats() ?? null,
            uses: BuildUses.state(),
            saving: progress.saving,
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
          rebuild: () => view?.rebuild(),
          shown: (uid: string) => view?.shownOf(uid) ?? -1,
        },
      });
  },
  input(ctx, m, tap, dt) {
    lastCtx = ctx;
    stepN++;
    if (card?.open || ask?.open) return true;
    holdStep(ctx, dt);
    if (BuildWork.active) return tap('KeyJ', 'KeyL', 'KeyF', 'KeyC', 'KeyU', 'KeyP', 'Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3', 'KeyO', 'KeyI');
    if (pressing) return false;
    if (placing) {
      const p = ctx.body.pos;
      // (out of it: far from home, another mode, all of it built, not enough riel)
      if (m !== 'walk' || Math.hypot(p.x - HOME_AT.x, p.z - HOME_AT.z) > MODE_FAR || cannot(placing)) {
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
        turnBy(left ? 1 : -1);
      }
      // F or C (the pad's ↓): the card again (another piece); not a greeting.
      if (tap('KeyF', 'KeyC')) {
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
    if (m !== 'walk' || !env || BuildWork.active || card?.open || ask?.open || env.busy()) return null;
    if (placing) {
      placingNow(ctx);
      return spot.prompt;
    }
    if (pressing) return near.prompt;
    nearNow(ctx);
    if (near.prompt) return near.prompt;
    return canStart(ctx, false) ? words('start', () => `E  ${t('buildStart')}`) : null;
  },
  use(ctx) {
    if (!env || BuildWork.active) return;
    if (placing) {
      buildHere(ctx);
      return;
    }
    nearNow(ctx);
    if (near.piece) {
      wireHold();
      pressing = { piece: near.piece, t: 0, tap: near.piece.done < 1 ? 'keep' : near.sit ? 'sit' : null };
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
    if (m === 'walk' && !BuildWork.active) modeCamera(ctx, !!placing && !card?.open, dt);
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
    const free = m === 'walk' && !BuildWork.active && !card?.open && !!env && !env.busy();
    if (free) {
      placingNow(ctx);
      ghost?.show(spot.x, spot.z, spot.yaw, spot.ok);
    } else ghost?.show(null);
  },
  frame(f: MapFrame, _m: RoamMode) {
    if (!view) return;
    view.frame(f.camera, f.t, f.dt, f.night);
    ghost?.frame(f.dt > 0 ? f.dt : 0);
    BUILD.tick(f.dt > 0 ? f.dt : 0);
  },
  setMode(next, _prev, ctx) {
    card?.close();
    ask?.close();
    pressing = null;
    holdBar(null);
    BuildWork.stop(ctx, next === 'overview');
    exitPlacing();
  },
  fromUrl(q, ctx) {
    lastCtx = ctx;
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
          view?.frame(ctx.cam.camera, ctx.t, 0, ctx.night);
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
      } else askTake(ctx, piece);
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
    }
    return Object.keys(out).length ? out : null;
  },
});

/**
 * The late half of the E row (after every other add-on's: the garden's "Plant…" first): "E  Build…" anywhere near
 * his house where nothing else here has E.
 */
registerAddon({
  id: 'buildLate',
  order: 96,
  offer(ctx, m) {
    if (m !== 'walk' || !env || placing || pressing || BuildWork.active || card?.open || ask?.open || env.busy()) return null;
    return canStart(ctx, true) ? words('start', () => `E  ${t('buildStart')}`) : null;
  },
  use(ctx) {
    if (!env || BuildWork.active || placing || !canStart(ctx, true)) return;
    openCard(ctx);
  },
});
