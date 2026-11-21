import { Raycaster, Vector2, type Object3D } from 'three';
import { cellMin } from '../blocks/store';
import { FOOTS, partFoot, type FootRec } from '../build/footState';
import { BUILT, PIECES, type Built } from '../build/pieces';
import { BUILD, sizeOf } from '../build/state';
import { pieceLook } from '../build/view';
import { pad } from '../pad/pad';
import { lang, t, type WordKey } from '../ui/lang';
import type { AddonEnv } from './_addons';
import { BuildGhost } from './_buildGhost';
import { footWord } from './_buildFoot';
import { FootGhost } from './_buildFootGhost';
import { furnitureHeldBy } from './_buildFurniture';
import type { RoamCtx } from './types';

/**
 * Move mode (the build add-on, roam/_build.ts; the guide docs/map-work/addons.md
 * "Moving what he built"): he picks up a piece he built and sets it down
 * somewhere else, free, at once — every piece of the build card's Yard and
 * Furniture tabs, and the footprint buildings (a stilt house, a shed, a fence
 * line: the block layer's, build/footState.ts).
 *
 * - **In**: the build card's "Move your things" row (the Buildings tab, beside
 *   "Paint your buildings"). **Out**: Esc (the pad's ○, the touch ✕), walking
 *   off his land, another mode, the card's other rows. F / C: the card again.
 * - **Aim** (as paint mode, roam/_paint.ts): the piece under the mouse; with a
 *   game pad (or keys and no mouse over the view) the piece at the gold ring
 *   over his head (the camera's aim); nothing there, the one he faces close by
 *   (`FACE`); on a phone the piece tapped. The piece aimed at is drawn over itself in gold
 *   (`BuildGhost` 'pick': its own blocks, a hair bigger), red where it cannot
 *   be picked up, with the reason in the prompt.
 * - **Pick up**: E (the pad's □, the touch Use button), a mouse click on it, a
 *   tap on it. Then it is build mode with that piece (roam/_build.ts
 *   `enterPlacing(id, piece)`): its ghost goes with him and snaps as a new
 *   one's (a fence run onto ends, filling a gap), where it stands now does not
 *   count; "E  Put it here" sets it down (`BUILD.move`, the `moved` event: the
 *   view, the walk map, its seat, hammock, prayer spot and light go with it);
 *   Esc puts it back (it never left). Either way move mode goes on, for the next.
 *   A footprint building is carried in footprint mode (roam/_buildFoot.ts
 *   `FootMode.carry`): its footprint at its own size before him, `,` / `.` a
 *   quarter turn, "E  Put it here" writes its blocks there (their paint kept).
 * - **Not now** (`whyNot`): one half built (finish it first), one with a
 *   hanging lantern on it (take that down first: nothing left floating, as
 *   taking it down), the cattle pen (or a fence line his cows use as one)
 *   while a cow of his is in it; a footprint building with furniture on its
 *   floor (take it out first: `whyNotFoot`).
 * - He reaches `REACH` m from his feet ("Too far: come closer" past it).
 *
 * URL (shots and the dev server only): `buildmove=1` (the mode on),
 * `buildmove=<uid>` (that piece picked up), `buildmove=foot:<uid>[@x/z[/door]]`
 * (that footprint building picked up, held with its middle at x, z). `report()` gives `buildmove=`.
 */

/** He picks up a piece this far from his feet (m, to its footprint). */
const REACH = 10;
/** Without an aim (no mouse, nothing at the ring): the piece he faces this near (m), at least this much before him (dot). */
const FACE = { reach: 2.6, dot: 0.35 };
/** The gold ring (the camera's aim, no mouse): over his head, this far up the screen (NDC y), as paint mode's. */
const CROSS_Y = 0.24;
/** A piece's box for aiming is grown this much (m): a thin fence or a lamp post is easy to point at. */
const AIM_GROW = 0.12;
/** A tap: shorter than this (ms), moving less than this (px); never in the stick's corner (touch.ts: lower left). */
const TAP = { ms: 350, px: 12 };

/** Why a piece cannot be picked up now (a word for the prompt), or null. */
export type MoveWhy = 'moveUnfinished' | 'moveHolds' | 'moveHoldsIn' | 'moveCows' | 'paintFar' | null;

/** Why `b` cannot be moved now (its own state: not how far he is), or null. */
export function whyNot(b: Built): MoveWhy {
  if (b.done < 1) return 'moveUnfinished';
  if (furnitureHeldBy(b.uid).length) return 'moveHolds';
  if (b.id === 'pen' && BUILT.penHolds(b.uid)) return 'moveCows';
  return null;
}

/** Why footprint building `r` cannot be moved now, or null. */
export function whyNotFoot(r: FootRec): MoveWhy {
  if (r.done < 1) return 'moveUnfinished';
  // (furniture on its floor or hung from its roof: _buildFurniture.ts `furnitureIn`)
  if (furnitureHeldBy(r.uid).length) return 'moveHoldsIn';
  // (a fence ring his herd uses as its pen: build/shelterRules.ts `roofedPens`, its uid `foot-<uid>`)
  if (r.kind === 'fence' && BUILT.penHolds(`foot-${r.uid}`)) return 'moveCows';
  return null;
}

let env: AddonEnv | null = null;
let ghost: BuildGhost | null = null;
let footGhost: FootGhost | null = null;
/** The footprint building the gold highlight shows now (placed again only when it changes). */
let footShown: { rec: FootRec | null; key: string } = { rec: null, key: '' };
let cross: HTMLElement | null = null;
let on = false;
let stepN = 0;
/** Where the aim comes from: the mouse, a tap (held there), the gold ring. */
let src: 'mouse' | 'tap' | 'cross' = 'cross';
const tapAt = { x: 0, y: 0 };
/** A touch on the view (not the stick's corner): where, when; null when it moved (a drag) or ended. */
let touch: { id: number; x: number; y: number; t: number } | null = null;
/** The aim (once a step): the piece, why not, the prompt. */
const aim = { step: -1, piece: null as Built | null, foot: null as FootRec | null, why: null as MoveWhy, prompt: null as string | null };
let lastCtx: RoamCtx | null = null;
/** The thing the mouse is over, out of move mode (press and drag: roam/_build.ts), drawn gold as an aimed one. */
let hover: Grabbed | null = null;
/** What a tap or a click on a piece does (roam/_build.ts: picks it up). */
let onPick: ((ctx: RoamCtx, b: Built | null, foot: FootRec | null) => void) | null = null;

// ── Words ─────────────────────────────────────────────────────────────────────

let wordsLang = '';
const said = new Map<string, string>();
function words(key: string, make: () => string): string {
  if (lang() !== wordsLang) {
    wordsLang = lang();
    said.clear();
  }
  let s = said.get(key);
  if (s === undefined) {
    if (said.size > 300) said.clear();
    s = make();
    said.set(key, s);
  }
  return s;
}
const nameOf = (b: Built): string => {
  const s = t(PIECES[b.id].name as WordKey);
  return lang() === 'en' ? s.toLowerCase() : s;
};
const onTouch = () => typeof document !== 'undefined' && document.body.classList.contains('roam-touch') && !document.body.classList.contains('pad-on');

// ── The aim ─────────────────────────────────────────────────────────────────

const _ray = new Raycaster();
const _ndc = new Vector2();

/** Where the ray (o + t·d) meets piece `b`'s box (its footprint, its top; grown `AIM_GROW`): t, or Infinity. */
function rayPiece(b: Built, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number {
  const s = sizeOf(b);
  const top = pieceLook(b.id, b.seed, b.len).top;
  const c = Math.cos(b.yaw);
  const sn = Math.sin(b.yaw);
  // (into its frame: local x along (c, −s), local z along (s, c); y from its ground)
  const rx = ox - b.x;
  const rz = oz - b.z;
  const lo = [rx * c - rz * sn, oy - b.y, rx * sn + rz * c];
  const ld = [dx * c - dz * sn, dy, dx * sn + dz * c];
  const lo3 = [-s.w / 2 - AIM_GROW, -AIM_GROW, -s.d / 2 - AIM_GROW];
  const hi3 = [s.w / 2 + AIM_GROW, top + AIM_GROW, s.d / 2 + AIM_GROW];
  let t0 = 0;
  let t1 = Infinity;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(ld[k]) < 1e-9) {
      if (lo[k] < lo3[k] || lo[k] > hi3[k]) return Infinity;
      continue;
    }
    let a = (lo3[k] - lo[k]) / ld[k];
    let b2 = (hi3[k] - lo[k]) / ld[k];
    if (a > b2) [a, b2] = [b2, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b2);
    if (t0 > t1) return Infinity;
  }
  return t0;
}

/** Where the ray meets footprint building `r` (each part's box, from its lowest block to its top; grown `AIM_GROW`): t, or Infinity. */
function rayFoot(r: FootRec, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number {
  const plan = FOOTS.plan(r);
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];
  let best = Infinity;
  for (const p of plan.parts) {
    const f = partFoot(p);
    const lo = [f.x - f.w / 2 - AIM_GROW, plan.bottom - AIM_GROW, f.z - f.d / 2 - AIM_GROW];
    const hi = [f.x + f.w / 2 + AIM_GROW, plan.top + AIM_GROW, f.z + f.d / 2 + AIM_GROW];
    let t0 = 0;
    let t1 = Infinity;
    let hit = true;
    for (let k = 0; k < 3 && hit; k++) {
      if (Math.abs(d[k]) < 1e-9) {
        if (o[k] < lo[k] || o[k] > hi[k]) hit = false;
        continue;
      }
      let a = (lo[k] - o[k]) / d[k];
      let b = (hi[k] - o[k]) / d[k];
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
      if (t0 > t1) hit = false;
    }
    if (hit && t0 < best) best = t0;
  }
  return best;
}

/** The point of footprint building `r`'s land nearest (x, z) (into `out`). */
function nearestOfFoot(r: FootRec, x: number, z: number, out: [number, number]): void {
  let d = Infinity;
  for (const p of FOOTS.parts(r)) {
    const f = partFoot(p);
    const nx = Math.min(f.x + f.w / 2, Math.max(f.x - f.w / 2, x));
    const nz = Math.min(f.z + f.d / 2, Math.max(f.z - f.d / 2, z));
    const e = Math.hypot(nx - x, nz - z);
    if (e < d) {
      d = e;
      out[0] = nx;
      out[1] = nz;
    }
  }
}
const _np: [number, number] = [0, 0];

/** How far (x, z) is from piece `b`'s footprint (m; 0 on it). */
function distTo(b: Built, x: number, z: number): number {
  const s = sizeOf(b);
  const c = Math.cos(b.yaw);
  const sn = Math.sin(b.yaw);
  const dx = x - b.x;
  const dz = z - b.z;
  const lx = Math.max(0, Math.abs(dx * c - dz * sn) - s.w / 2);
  const lz = Math.max(0, Math.abs(dx * sn + dz * c) - s.d / 2);
  return Math.hypot(lx, lz);
}

/** The piece (or footprint building) he faces close by (no aim): the nearest before him, or null. */
function faced(ctx: RoamCtx): Built | FootRec | null {
  const b = ctx.body;
  const fx = Math.sin(b.yaw);
  const fz = Math.cos(b.yaw);
  let best: Built | FootRec | null = null;
  let score = Infinity;
  for (const r of FOOTS.list) {
    const plan = FOOTS.plan(r);
    if (b.pos.y < plan.bottom - 2.5 || b.pos.y > plan.top + 0.5) continue;
    nearestOfFoot(r, b.pos.x, b.pos.z, _np);
    const wx = _np[0] - b.pos.x;
    const wz = _np[1] - b.pos.z;
    const d = Math.hypot(wx, wz);
    if (d > FACE.reach) continue;
    const dot = d > 0.05 ? (wx * fx + wz * fz) / d : 1;
    if (d > 0.05 && dot < FACE.dot) continue;
    const sc = d - dot * 0.5;
    if (sc < score) {
      score = sc;
      best = r;
    }
  }
  for (const q of BUILD.list) {
    if (Math.abs(b.pos.y - q.y) > 2.5) continue;
    const d = distTo(q, b.pos.x, b.pos.z);
    if (d > FACE.reach) continue;
    const wx = q.x - b.pos.x;
    const wz = q.z - b.pos.z;
    const l = Math.hypot(wx, wz);
    const dot = l > 0.05 ? (wx * fx + wz * fz) / l : 1;
    if (d > 0.05 && dot < FACE.dot) continue;
    const sc = d - dot * 0.5;
    if (sc < score) {
      score = sc;
      best = q;
    }
  }
  return best;
}

/** The piece or footprint building the ray from the camera through `_ndc` meets first, or null. */
function rayHit(ctx: RoamCtx): Built | FootRec | null {
  _ray.setFromCamera(_ndc, ctx.cam.camera);
  const { origin: o, direction: d } = _ray.ray;
  let hit: Built | FootRec | null = null;
  let bt = Infinity;
  for (const b of BUILD.list) {
    const tt = rayPiece(b, o.x, o.y, o.z, d.x, d.y, d.z);
    if (tt < bt) {
      bt = tt;
      hit = b;
    }
  }
  // (a footprint building: a piece just before it wins, and a piece inside a house or a shed, its walls round it)
  for (const r of FOOTS.list) {
    const tt = rayFoot(r, o.x, o.y, o.z, d.x, d.y, d.z) + 0.3;
    if (tt >= bt) continue;
    if (hit && !isFoot(hit) && r.kind !== 'fence' && insideFoot(r, hit)) continue;
    bt = tt;
    hit = r;
  }
  return hit;
}

/** What a press and drag would pick up: the thing of his under the screen point (px), and why not (null: it can be). */
export interface Grabbed {
  readonly piece: Built | null;
  readonly foot: FootRec | null;
  readonly why: MoveWhy;
  readonly name: string;
}
/** The thing of his under the screen point (px) (press and drag, roam/_build.ts), or null. No reach: he moves it from where he stands. */
export function grabAt(ctx: RoamCtx, px: number, py: number): Grabbed | null {
  if (!env) return null;
  const r = env.canvas.getBoundingClientRect();
  _ndc.set(((px - r.left) / r.width) * 2 - 1, -((py - r.top) / r.height) * 2 + 1);
  const hit = rayHit(ctx);
  if (!hit) return null;
  if (isFoot(hit)) return { piece: null, foot: hit, why: whyNotFoot(hit), name: footWord(hit.kind) };
  return { piece: hit, foot: null, why: whyNot(hit), name: nameOf(hit) };
}

/** What he aims at now (once a step, or again after a tap). */
function aimNow(ctx: RoamCtx): void {
  if (aim.step === stepN || !env) return;
  aim.step = stepN;
  const i = ctx.input;
  const p = i.pointer;
  // (the mouse over the view aims, unless a game pad is in use; a tap holds until he walks or the camera turns)
  if (p && !pad.active && !onTouch()) src = 'mouse';
  else if (src === 'mouse') src = 'cross';
  if (src === 'tap' && (Math.hypot(i.move.x, i.move.y) > 0.2 || i.lookYaw || i.lookPitch)) src = 'cross';
  const r = env.canvas.getBoundingClientRect();
  if (src === 'mouse' && p) _ndc.set(((p.x - r.left) / r.width) * 2 - 1, -((p.y - r.top) / r.height) * 2 + 1);
  else if (src === 'tap') _ndc.set(((tapAt.x - r.left) / r.width) * 2 - 1, -((tapAt.y - r.top) / r.height) * 2 + 1);
  else _ndc.set(0, CROSS_Y);
  let hit = rayHit(ctx);
  // (nothing under the mouse or at the ring: the piece he faces close by; a tap aims only where it was)
  if (!hit && src !== 'tap') hit = faced(ctx);
  const foot = hit && isFoot(hit) ? hit : null;
  const best = hit && !isFoot(hit) ? hit : null;
  aim.piece = best;
  aim.foot = foot;
  aim.why = null;
  const px = ctx.body.pos.x;
  const pz = ctx.body.pos.z;
  if (best) {
    aim.why = whyNot(best);
    if (!aim.why && distTo(best, px, pz) > REACH) aim.why = 'paintFar';
  } else if (foot) {
    aim.why = whyNotFoot(foot);
    if (!aim.why && FOOTS.distTo(foot, px, pz) > REACH) aim.why = 'paintFar';
  }
  // (the prompt: "E  Pick up the bamboo bed", or why not; "Point at something you built" with none)
  const keys = words('keys', () => `F  ${t('buildOther')}  ·  Esc  ${t('buildExit')}`);
  const touchy = onTouch();
  if (!best && !foot) aim.prompt = touchy ? words('aimt', () => t('moveAim')) : words('aim', () => `${t('moveAim')}  ·  ${keys}`);
  else {
    const id = best ? best.id : `foot:${foot!.kind}`;
    const name = best ? nameOf(best) : footWord(foot!.kind);
    if (aim.why) {
      const why = aim.why;
      const line = words(`why|${why}|${id}`, () => t(why, { name }));
      aim.prompt = touchy ? line : words(`whyk|${why}|${id}`, () => `${line}  ·  ${keys}`);
    } else aim.prompt = touchy ? words(`pickt|${id}`, () => `E  ${t('movePick', { name })}`) : words(`pick|${id}`, () => `E  ${t('movePick', { name })}  ·  ${keys}`);
  }
}

/** The gold ring (no mouse, no tap): on the screen where the camera aims. */
function showCross(show: boolean): void {
  if (!env || typeof document === 'undefined') return;
  if (!cross && show) {
    injectStyle();
    cross = document.createElement('div');
    cross.className = 'mv-cross';
    document.body.append(cross);
  }
  if (!cross) return;
  cross.style.display = show ? 'block' : 'none';
  if (!show) return;
  const r = env.canvas.getBoundingClientRect();
  cross.style.left = `${r.left + r.width / 2}px`;
  cross.style.top = `${r.top + (r.height * (1 - CROSS_Y)) / 2}px`;
  cross.classList.toggle('is-no', !!(aim.piece || aim.foot) && !!aim.why);
}

let styled = false;
function injectStyle(): void {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const st = document.createElement('style');
  st.textContent = `
    .mv-cross { position: fixed; width: 18px; height: 18px; margin: -9px 0 0 -9px; border-radius: 50%; border: 2px solid rgba(255, 216, 120, 0.95); box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.45), inset 0 0 0 1px rgba(0, 0, 0, 0.35);
      pointer-events: none; z-index: 5; display: none; }
    .mv-cross::after { content: ''; position: absolute; left: 50%; top: 50%; width: 4px; height: 4px; margin: -2px 0 0 -2px; border-radius: 50%; background: #ffd27a; }
    .mv-cross.is-no { border-color: rgba(255, 170, 150, 0.9); }`;
  document.head.append(st);
}

// ── Taps and clicks ─────────────────────────────────────────────────────────

let wired = false;
function wire(): void {
  if (wired || !env) return;
  wired = true;
  const canvas = env.canvas;
  canvas.addEventListener('pointerdown', (e) => {
    if (!on || e.pointerType !== 'touch' || touch) return;
    if (e.clientX < innerWidth * 0.45 && e.clientY > innerHeight * 0.3) return;
    touch = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
  });
  canvas.addEventListener('pointermove', (e) => {
    // (a drag: the camera's, not a pick)
    if (touch && e.pointerId === touch.id && Math.hypot(e.clientX - touch.x, e.clientY - touch.y) > TAP.px) touch = null;
  });
  const end = (e: PointerEvent) => {
    if (!touch || e.pointerId !== touch.id) return;
    const tp = touch;
    touch = null;
    // (a quick tap on a piece: picked up now)
    if (e.type !== 'pointerup' || !on || performance.now() - tp.t > TAP.ms || !lastCtx) return;
    src = 'tap';
    tapAt.x = tp.x;
    tapAt.y = tp.y;
    aim.step = -1;
    aimNow(lastCtx);
    pickAimed(lastCtx);
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}

/** Pick up what he aims at, if he can (else a tick: the prompt says why). */
function pickAimed(ctx: RoamCtx): boolean {
  const b = aim.piece;
  const f = aim.foot;
  if ((!b && !f) || !env) return false;
  if (aim.why) {
    env.uiSound('tick');
    return false;
  }
  onPick?.(ctx, b, b ? null : f);
  return true;
}

/** Does piece `b` stand within footprint building `r`'s blocks (its box over the land)? */
function insideFoot(r: FootRec, b: Built): boolean {
  const box = FOOTS.plan(r).box;
  return b.x > cellMin(box.i0) && b.x < cellMin(box.i1 + 1) && b.z > cellMin(box.k0) && b.z < cellMin(box.k1 + 1);
}

/** A footprint building, not a piece (both have a uid; only a record has a footprint). */
function isFoot(x: Built | FootRec): x is FootRec {
  return 'rect' in x;
}

// ── The mode ────────────────────────────────────────────────────────────────

export const MoveMode = {
  /** Once, from the build add-on's `init`; `pick`: what picking a piece up does (roam/_build.ts: build mode with it). */
  init(e: AddonEnv, scene: Object3D, pick: (ctx: RoamCtx, b: Built | null, foot: FootRec | null) => void): void {
    env = e;
    ghost = new BuildGhost(scene, e.world, 'pick');
    footGhost = new FootGhost(scene, e.world, 'pick');
    onPick = pick;
  },
  get on(): boolean {
    return on;
  },
  enter(): void {
    if (!env) return;
    wire();
    on = true;
    aim.step = -1;
    if (src === 'tap') src = 'cross';
  },
  exit(): void {
    if (!on) return;
    on = false;
    touch = null;
    aim.piece = null;
    aim.foot = null;
    aim.prompt = null;
    ghost?.show(null);
    footGhost?.show(false);
    showCross(false);
  },
  /** A new step (the add-on's `input`): the aim is worked out again. */
  nextStep(): void {
    stepN++;
  },
  /** The aim now (once a step): its prompt. */
  step(ctx: RoamCtx): string | null {
    lastCtx = ctx;
    if (!on) return null;
    aimNow(ctx);
    return aim.prompt;
  },
  /** E (or a click): pick up what he aims at. */
  use(ctx: RoamCtx): boolean {
    if (!on) return false;
    aimNow(ctx);
    return pickAimed(ctx);
  },
  /** The piece aimed at now (checks), and why not. */
  get aimed(): { piece: Built | null; foot: FootRec | null; why: MoveWhy } {
    return { piece: aim.piece, foot: aim.foot, why: aim.why };
  },
  /** Each step after the rest (`free`: nothing else has him): the highlight and the ring. */
  show(free: boolean): void {
    const hv = !on && free ? hover : null;
    const why = hv ? hv.why : aim.why;
    const b = on && free ? aim.piece : (hv?.piece ?? null);
    if (b && ghost) {
      ghost.setPiece(b.id, b.len, b.seed);
      ghost.show(b.x, b.z, b.yaw, !why, b.y);
    } else ghost?.show(null);
    const f = on && free ? aim.foot : (hv?.foot ?? null);
    if (f && footGhost) {
      const key = `${f.uid}|${f.rect.i0},${f.rect.k0},${f.rect.i1},${f.rect.k1}|${f.door}|${BUILT.version}`;
      if (footShown.rec !== f || footShown.key !== key) {
        footShown = { rec: f, key };
        footGhost.set(FOOTS.plan(f), f.rect, null, null);
      }
      footGhost.show(true, !why);
    } else footGhost?.show(false);
    showCross(on && free && src === 'cross' && !onTouch());
  },
  frame(dt: number): void {
    ghost?.frame(dt);
    footGhost?.frame(dt);
  },
  /** The thing under the mouse out of move mode (press and drag), or null: drawn gold (red with a reason) by `show`. */
  hover(h: Grabbed | null): void {
    hover = h;
  },
};
