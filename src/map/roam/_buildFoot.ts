import { Raycaster, Vector2, type PerspectiveCamera } from 'three';
import { cellMid, cellMin, cellOf, BLOCK_M } from '../blocks/store';
import { FOOT_KIND_IDS, FOOT_KINDS, planFoot, rectD, rectOf, rectW, sizeFault, clampCorner, type FootKind, type FootPlan, type FootRect, type FootSide, type FootStage } from '../build/footPlan';
import { FOOTS, footPlan, partFoot, type FootRec } from '../build/footState';
import { haveOf, MATERIAL_IDS, materialsText, missingOf, noMaterials, rielOf, useMaterials, type Materials } from '../build/materials';
import { materialIcon } from '../build/materialIcons';
import { BUILT } from '../build/pieces';
import { inPlot, plotBlocks, PLOT_BOX, PLOT_BUDGET } from '../build/plot';
import type { PieceLookData } from '../build/view';
import { lang, num, t, type WordKey } from '../ui/lang';
import type { VoxelBox } from '../../voxel/VoxelBuilder';
import type { AddonEnv } from './_addons';
import { BUILD_REASON_WORDS, canBuild, type BuildReason } from './_buildSpots';
import { FootGhost } from './_buildFootGhost';
import type { WorkJob } from './_buildWork';
import { riel } from './_shopPurse';
import type { RoamCtx, RoamWorld } from './types';

/**
 * Footprint mode (AWP-20; the plans build/footPlan.ts, the saved list
 * build/footState.ts): he draws a footprint on his land and the building fits
 * itself to it. Picked on the build card (roam/_build.ts: "Stilt house",
 * "Shed", "Fence line"); roam/_build.ts routes its keys, its E and its frame
 * here, and its camera looks over it as build mode's does.
 *
 * - **Drawing** (on the 0.5 m block grid, along the map's axes): a gold cursor
 *   on the ground, two steps before his feet (or where the mouse points on the
 *   ground; or, on a touch screen, where he tapped: held there until the
 *   stick moves). **E** (the pad's □, the touch Use button; a mouse click at
 *   the cursor) marks the first corner (a stake with a red strip); he walks,
 *   the footprint stretches from it to the cursor (never past the kind's
 *   largest size: it stops growing), and the finished building shows as a
 *   ghost (_buildFootGhost.ts: green, or red with the reason), its size and
 *   its cost on a panel (each material: what it takes, those he lacks in red;
 *   "Missing: … = … ៛"; his land's budget, now and after). **E** again:
 *   "Build here" — he pays for what he lacks, the rest comes from his bag and
 *   home store, and he hammers it up (_buildWork.ts, `footJob`: posts, floor,
 *   walls, roof, stair, the prompt saying which). `,` / `.` (the pad's d-pad
 *   ← →, the touch ⟲ ⟳) turn the door side a quarter (the door, the stair, the
 *   shed's open front, the gate; until turned, it faces the camera). Esc (the
 *   pad's ○, the touch ✕): the first corner again, then out of the mode. F / C:
 *   the card again.
 * - **Where not** (red, the reason first in the prompt): too small for its
 *   kind ("Too small: at least 5 × 5 m"), all of its kind built, the placing
 *   rules over every part of it (_buildSpots.ts `canBuild` with its own size:
 *   the eaves, the stair and a fence's lines each — the path, the water, past
 *   his land, by the house (and the grandmother's places), the ground not
 *   level enough for its kind, a tree, a plant, something he built, something
 *   else), his land's budget, not enough riel for what he lacks.
 */

export type FootReason = BuildReason | 'small' | 'most' | 'room' | 'money';

/** The cursor this far before his feet (m: past his hat's brim, seen from build mode's camera). */
const AHEAD = 1.8;
/** A mouse's pointer, or a tap, reaches this far (m). */
const AIM_RANGE = 90;
/** A tap: shorter than this (ms), moving less than this (px); never in the stick's corner (touch.ts: lower left). */
const TAP = { ms: 350, px: 12 };
/** The way out of a footprint through a side (footPlan.ts `FootSide`): x and z. */
const OUT: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
/** A door side as a side of the work's frame (_buildWork.ts `WorkJob.avoid`: 0 its +z, 1 its +x, 2 its −z, 3 its −x). */
const JOB_SIDE: Record<FootSide, number> = { 0: 2, 1: 1, 2: 0, 3: 3 };
/** The words of a stage. */
const STAGE_WORD: Record<FootStage, WordKey> = { posts: 'footStagePosts', floor: 'footStageFloor', walls: 'footStageWalls', roof: 'footStageRoof', stair: 'footStageStair' };

let env: AddonEnv | null = null;
let ghost: FootGhost | null = null;
let kind: FootKind | null = null;
let anchor: [number, number] | null = null;
const cursor: [number, number] = [0, 0];
let door: FootSide = 2;
let doorTurned = false;
/** Where the cursor comes from: before his feet, the mouse's pointer, a tap (held). */
let src: 'ahead' | 'mouse' | 'tap' = 'ahead';
let held: [number, number] | null = null;
const lastMouse = { x: NaN, y: NaN };
/** Worked out once a step: the footprint, its plan, why not (null: it can stand), the prompt, what it takes. */
const now = {
  step: -1,
  rect: null as FootRect | null,
  plan: null as FootPlan | null,
  key: '',
  land: null as FootReason | null,
  reason: null as FootReason | null,
  prompt: null as string | null,
  missing: {} as Materials,
  riel: 0,
};
let stepN = 0;
let panel: HTMLElement | null = null;
let panelKey = '';

// ── Words ─────────────────────────────────────────────────────────────────────

const metres = (cells: number): string => num(+(cells * BLOCK_M).toFixed(1));
/** A footprint's size in words ("5 × 4.5 m"): across x by along z. */
const sizeWords = (r: FootRect): string => t('footSize', { w: metres(rectW(r)), d: metres(rectD(r)) });
/** A kind's name inside a sentence (English: lower case). */
export const footWord = (k: FootKind): string => {
  const s = t(FOOT_KINDS[k].name as WordKey);
  return lang() === 'en' ? s.toLowerCase() : s;
};
const onTouch = () => typeof document !== 'undefined' && document.body.classList.contains('roam-touch') && !document.body.classList.contains('pad-on');

function reasonWords(r: FootReason): string {
  if (r === 'small') {
    const s = FOOT_KINDS[kind ?? 'house'];
    // (a fence: its run at least 2 m long; narrower than 2 m it is a straight run)
    if (kind === 'fence') return t('footShortLine', { m: metres(s.minLong) });
    return t('footSmall', { w: metres(s.min), d: metres(s.minLong) });
  }
  if (r === 'most') return t('buildAllBuilt', { n: num(FOOT_KINDS[kind ?? 'house'].most) });
  if (r === 'room') return t('buildNoRoom');
  if (r === 'money') return t('buildNoMoney', { riel: riel(Math.max(0, now.riel - (env?.purse.riel ?? 0))) });
  return t(BUILD_REASON_WORDS[r]);
}

// ── The smallest of a kind (the card's "from") ──────────────────────────────

const minPlans = new Map<FootKind, FootPlan>();
/** The smallest footprint of a kind on flat land (the card's cost "from"). */
export function minPlan(k: FootKind): FootPlan {
  let p = minPlans.get(k);
  if (!p) {
    const s = FOOT_KINDS[k];
    minPlans.set(k, (p = planFoot(k, { i0: 0, k0: 0, i1: s.minLong - 1, k1: s.min - 1 }, 2, () => 0)));
  }
  return p;
}

// ── The job (his work on it: _buildWork.ts) ─────────────────────────────────

const looks = new WeakMap<FootPlan, PieceLookData>();
/** A plan's blocks in the job's frame (its middle on the ground): what his blow lands on. */
function lookOf(plan: FootPlan, x: number, y: number, z: number): PieceLookData {
  let l = looks.get(plan);
  if (l) return l;
  const boxes: VoxelBox[] = [];
  let top = 0;
  let reach = 0;
  for (let b = 0; b < plan.n; b++) {
    const bx = cellMid(plan.cells[b * 3]) - x;
    const by = cellMid(plan.cells[b * 3 + 1]) - y;
    const bz = cellMid(plan.cells[b * 3 + 2]) - z;
    boxes.push({ x: bx, y: by, z: bz, sx: BLOCK_M, sy: BLOCK_M, sz: BLOCK_M, color: 0, shade: 1, mat: 'mapBark' });
    top = Math.max(top, by + BLOCK_M / 2);
    reach = Math.max(reach, Math.hypot(bx, bz) + BLOCK_M);
  }
  looks.set(plan, (l = { boxes, top, reach }));
  return l;
}

/** A footprint building as a job for the hammer work (read live: its `done`). */
export function footJob(rec: FootRec, heightAt: (x: number, z: number) => number): WorkJob {
  const r = rec.rect;
  const x0 = cellMin(r.i0);
  const x1 = cellMin(r.i1 + 1);
  const z0 = cellMin(r.k0);
  const z1 = cellMin(r.k1 + 1);
  const x = (x0 + x1) / 2;
  const z = (z0 + z1) / 2;
  const y = heightAt(x, z);
  const plan = FOOTS.plan(rec);
  return {
    uid: rec.uid,
    x,
    y,
    z,
    yaw: 0,
    w: x1 - x0,
    d: z1 - z0,
    get done() {
      return rec.done;
    },
    secs: Math.min(60, Math.max(8, 6 + plan.n / 40)),
    // (a house's stair side: he works from the others)
    avoid: rec.kind === 'house' ? JOB_SIDE[rec.door] : undefined,
    look: () => lookOf(plan, x, y, z),
    setDone: (v) => FOOTS.setDone(rec, v),
    alive: () => FOOTS.list.includes(rec),
    word: () => footWord(rec.kind),
    stage() {
      const at = Math.floor(rec.done * plan.n);
      let s: FootStage = 'posts';
      for (const st of plan.stages) if (st.from <= at) s = st.stage;
      return t(rec.kind === 'fence' && s === 'walls' ? 'footStagePanels' : STAGE_WORD[s]);
    },
    back: () => FOOTS.back(rec),
    remove: () => FOOTS.remove(rec),
    tick: (dt, n) => FOOTS.tick(dt, n),
  };
}

// ── The cursor ──────────────────────────────────────────────────────────────

const _ray = new Raycaster();
const _ndc = new Vector2();
/** The land's point under a screen point (px), or null. */
function landHit(camera: PerspectiveCamera, px: number, py: number): [number, number] | null {
  if (!env) return null;
  const r = env.canvas.getBoundingClientRect();
  _ndc.set(((px - r.left) / r.width) * 2 - 1, -((py - r.top) / r.height) * 2 + 1);
  _ray.setFromCamera(_ndc, camera);
  const { origin: o, direction: d } = _ray.ray;
  const f = env.world.field;
  const under = (s: number) => o.y + d.y * s - f.heightAt(o.x + d.x * s, o.z + d.z * s);
  let a = 0.5;
  let s = a;
  while (s < AIM_RANGE) {
    if (under(s) <= 0) {
      let b = s;
      for (let i = 0; i < 8; i++) {
        const m = (a + b) / 2;
        if (under(m) <= 0) b = m;
        else a = m;
      }
      return [o.x + d.x * b, o.z + d.z * b];
    }
    a = s;
    s += Math.max(0.4, s * 0.03);
  }
  return null;
}

/** A tap on the canvas (touch: not in the stick's corner) puts the cursor there. */
let tapWired = false;
let lastCtx: RoamCtx | null = null;
function wireTap(): void {
  if (tapWired || !env) return;
  tapWired = true;
  const down = new Map<number, { x: number; y: number; t: number }>();
  env.canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' && kind) down.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
  });
  const end = (e: PointerEvent) => {
    const d = down.get(e.pointerId);
    down.delete(e.pointerId);
    if (!d || !kind || e.type !== 'pointerup' || !lastCtx) return;
    if (performance.now() - d.t > TAP.ms || Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP.px) return;
    if (d.x < innerWidth * 0.45 && d.y > innerHeight * 0.3) return;
    const hit = landHit(lastCtx.cam.camera, e.clientX, e.clientY);
    if (!hit) return;
    held = [cellOf(hit[0]), cellOf(hit[1])];
    src = 'tap';
    now.step = -1;
    env?.uiSound('tick');
  };
  env.canvas.addEventListener('pointerup', end);
  env.canvas.addEventListener('pointercancel', end);
}

/** The cursor's cell now (into `cursor`). */
function aim(ctx: RoamCtx): void {
  const i = ctx.input;
  if (Math.hypot(i.move.x, i.move.y) > 0.2) {
    src = 'ahead';
    held = null;
  }
  const p = i.pointer;
  if (p && (p.x !== lastMouse.x || p.y !== lastMouse.y)) {
    lastMouse.x = p.x;
    lastMouse.y = p.y;
    src = 'mouse';
    held = null;
  }
  if (src === 'tap' && held) {
    cursor[0] = held[0];
    cursor[1] = held[1];
    return;
  }
  if (src === 'mouse' && p) {
    const hit = landHit(ctx.cam.camera, p.x, p.y);
    if (hit) {
      cursor[0] = cellOf(hit[0]);
      cursor[1] = cellOf(hit[1]);
      return;
    }
  }
  const b = ctx.body;
  cursor[0] = cellOf(b.pos.x + Math.sin(b.yaw) * AHEAD);
  cursor[1] = cellOf(b.pos.z + Math.cos(b.yaw) * AHEAD);
}

/** The side of the footprint facing the camera (the door's, until he turns it). */
function sideToCamera(ctx: RoamCtx): FootSide {
  const fx = Math.sin(ctx.cam.yaw);
  const fz = Math.cos(ctx.cam.yaw);
  let best: FootSide = 2;
  let score = -Infinity;
  for (let s = 0; s < 4; s++) {
    const v = -(OUT[s][0] * fx + OUT[s][1] * fz);
    if (v > score) {
      score = v;
      best = s as FootSide;
    }
  }
  return best;
}

// ── The rules ───────────────────────────────────────────────────────────────

/** Why the plan cannot stand on the land (the placing rules over its parts), or null. */
function landRules(world: RoamWorld, plan: FootPlan): FootReason | null {
  for (const p of plan.parts) {
    const f = partFoot(p);
    const r = canBuild(world, 'foot', f.x, f.z, 0, null, { w: f.w, d: f.d, h: p.h, level: p.level });
    if (r) return r;
  }
  return null;
}

/** What it takes now: the materials he lacks and their riel. */
function payFor(plan: FootPlan): void {
  now.missing = missingOf(plan.cost);
  now.riel = rielOf(now.missing);
}

/** Why a kind cannot be drawn now, at its smallest (the card greys it), or null. */
export function cannotFoot(k: FootKind, purseRiel: number): string | null {
  const s = FOOT_KINDS[k];
  if (FOOTS.count(k) >= s.most) return t('buildAllBuilt', { n: num(s.most) });
  const p = minPlan(k);
  const miss = missingOf(p.cost);
  const short = rielOf(miss);
  if (purseRiel < short) return noMaterials(miss) ? t('buildNeed', { riel: riel(short - purseRiel) }) : t('buildNeedMat', { what: materialsText(miss), riel: riel(short - purseRiel) });
  if (plotBlocks() + p.n > PLOT_BUDGET) return t('buildNoRoom');
  return null;
}

// ── The mode ────────────────────────────────────────────────────────────────

export const FootMode = {
  init(e: AddonEnv): void {
    env = e;
    ghost = new FootGhost(e.scene, e.world);
    FOOTS.init((x, z) => e.world.field.heightAt(x, z));
  },
  /** The kind being drawn (null: the mode is off). */
  get kind(): FootKind | null {
    return kind;
  },
  get on(): boolean {
    return kind !== null;
  },
  /** The first corner is marked (the footprint is being stretched). */
  get stretching(): boolean {
    return anchor !== null;
  },

  enter(k: FootKind): void {
    kind = k;
    anchor = null;
    doorTurned = false;
    now.step = -1;
    now.key = '';
    wireTap();
  },
  exit(): void {
    if (!kind) return;
    kind = null;
    anchor = null;
    held = null;
    src = 'ahead';
    ghost?.show(false);
    showPanel(false);
  },

  /** Esc: the first corner again, else out of the mode. True: still in it. */
  back(): boolean {
    if (anchor) {
      anchor = null;
      now.step = -1;
      return true;
    }
    this.exit();
    return false;
  },

  /** `,` / `.`: the door side a quarter round (−1 / +1). */
  turnDoor(dir: number): void {
    door = (((door + dir) % 4) + 4) % 4 as FootSide;
    doorTurned = true;
    now.step = -1;
  },

  /** A check's footprint (`footdraw=`): its corners held (no cursor of his), the door side if given. */
  hold(k: FootKind, a: [number, number] | null, b: [number, number] | null, side: FootSide | null): void {
    this.enter(k);
    anchor = a;
    if (b) {
      held = b;
      src = 'tap';
    }
    if (side !== null) {
      door = side;
      doorTurned = true;
    }
  },

  /** Once a step (in the mode, on foot, free): the cursor, the footprint, its plan, the reasons, the prompt. */
  step(ctx: RoamCtx): void {
    if (!kind || now.step === stepN) return;
    now.step = stepN;
    lastCtx = ctx;
    aim(ctx);
    if (!doorTurned) door = sideToCamera(ctx);
    let rect: FootRect | null = null;
    if (anchor) {
      const [ci, ck] = clampCorner(kind, anchor[0], anchor[1], cursor[0], cursor[1]);
      cursor[0] = ci;
      cursor[1] = ck;
      rect = rectOf(anchor[0], anchor[1], ci, ck);
      // (a fence narrower than an enclosure's least, 2 m, is a straight run along its longer side, on the first
      // corner's row: walking, a tap or the pad seldom keep the cursor on one row of cells)
      if (kind === 'fence' && Math.min(rectW(rect), rectD(rect)) < FOOT_KINDS.fence.min)
        rect = rectW(rect) >= rectD(rect) ? { ...rect, k0: anchor[1], k1: anchor[1] } : { ...rect, i0: anchor[0], i1: anchor[0] };
    }
    const key = rect ? `${kind}|${rect.i0},${rect.k0},${rect.i1},${rect.k1}|${door}|${BUILT.version}|${FOOTS.list.length}` : `${kind}|-|${cursor[0]},${cursor[1]}`;
    if (key !== now.key) {
      now.key = key;
      now.rect = rect;
      now.plan = rect && !sizeFault(kind, rect) ? footPlan(kind, rect, door) : null;
      now.land = rect ? (sizeFault(kind, rect) ? 'small' : landRules(ctx.world, now.plan!)) : inPlot(cellMid(cursor[0]), cellMid(cursor[1])) ? null : 'plot';
      ghost?.set(now.plan, rect, anchor, cursor);
    }
    // (the budget and his riel can change while he stands: asked each step, cheaply)
    let r: FootReason | null = FOOTS.count(kind) >= FOOT_KINDS[kind].most ? 'most' : now.land;
    if (now.plan) {
      payFor(now.plan);
      if (!r && plotBlocks() + now.plan.n > PLOT_BUDGET) r = 'room';
      if (!r && (env?.purse.riel ?? 0) < now.riel) r = 'money';
    }
    now.reason = r;
    now.prompt = promptNow();
    updatePanel();
  },

  /** E (or a click): the first corner, or "Build here". */
  use(ctx: RoamCtx, build: (ctx: RoamCtx) => void): void {
    if (!kind) return;
    now.step = -1;
    this.step(ctx);
    if (!anchor) {
      if (now.reason) return;
      anchor = [cursor[0], cursor[1]];
      now.step = -1;
      env?.uiSound('tick');
      return;
    }
    if (!now.reason && now.plan) build(ctx);
  },

  /** "Build here": pay for what he lacks, take the rest, the record; returns it (the caller starts his work). */
  buildHere(ctx: RoamCtx): FootRec | null {
    if (!env || !kind || !now.plan || !now.rect || now.reason) return null;
    const plan = now.plan;
    const pay = rielOf(missingOf(plan.cost));
    if (pay > 0 && !env.purse.pay(pay)) {
      ctx.hud.toast(t('buildNoMoney', { riel: riel(pay - env.purse.riel) }));
      return null;
    }
    const rec = FOOTS.add(kind, now.rect, door, plan.cost);
    if (!rec) {
      if (pay > 0) env.purse.earn(pay);
      return null;
    }
    const used = useMaterials(plan.cost);
    const both: Materials = {};
    for (const m of MATERIAL_IDS) if ((used.bag[m] ?? 0) + (used.store[m] ?? 0) > 0) both[m] = (used.bag[m] ?? 0) + (used.store[m] ?? 0);
    const what = materialsText(both);
    env.uiSound('select');
    ctx.hud.toast(what ? (pay > 0 ? t('buildUsedPaid', { what, riel: riel(pay) }) : t('buildUsed', { what })) : t('buildPaid', { riel: riel(pay) }));
    console.info(`[foot] ${rec.uid} ${sizeWords(rec.rect)} at cells ${rec.rect.i0},${rec.rect.k0}‥${rec.rect.i1},${rec.rect.k1} door ${rec.door}: ${plan.n} blocks, cost ${JSON.stringify(plan.cost)}, used ${JSON.stringify(used)}, paid ${pay} riel`);
    this.exit();
    return rec;
  },

  get prompt(): string | null {
    return kind ? now.prompt : null;
  },

  /** Where build mode's camera looks (its focus moves toward it), how far the footprint reaches and its building's top over the ground (m). */
  target(): { x: number; z: number; reach: number; high: number } {
    const r = now.rect;
    if (!r) return { x: cellMid(cursor[0]), z: cellMid(cursor[1]), reach: 1, high: 0 };
    const x0 = cellMin(r.i0);
    const x1 = cellMin(r.i1 + 1);
    const z0 = cellMin(r.k0);
    const z1 = cellMin(r.k1 + 1);
    const y = env ? env.world.field.heightAt((x0 + x1) / 2, (z0 + z1) / 2) : 0;
    return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, reach: Math.hypot(x1 - x0, z1 - z0) / 2, high: now.plan ? now.plan.top - y : 0 };
  },

  /** The touch bar's middle: the size ("5 × 4 m"), or the kind's name before the first corner. */
  barText(): string {
    return now.rect ? sizeWords(now.rect) : kind ? t(FOOT_KINDS[kind].name as WordKey) : '';
  },

  /** After a step: the ghost shown (free) or not. */
  show(free: boolean): void {
    ghost?.show(free && !!kind, !now.reason);
    // (the panel not over the explorer menu or a card that asks: it is the drawing's, and only while he draws)
    const over = typeof document !== 'undefined' && (document.body.classList.contains('rxm-open') || document.body.classList.contains('mu-asking'));
    showPanel(free && !!kind && !over);
  },

  /** A new step of roaming (the work of `step` is done once a step). */
  nextStep(): void {
    stepN++;
  },

  frame(dt: number): void {
    ghost?.frame(dt);
  },

  /** Checks (`__build.state().foot`). */
  state() {
    return {
      kind,
      step: [now.step, stepN],
      anchor,
      cursor: [...cursor],
      src,
      door,
      rect: now.rect,
      size: now.rect ? [rectW(now.rect) * BLOCK_M, rectD(now.rect) * BLOCK_M] : null,
      blocks: now.plan?.n ?? 0,
      cost: now.plan?.cost ?? null,
      missing: now.missing,
      riel: now.riel,
      reason: now.reason,
      prompt: now.prompt,
      ghost: !!ghost?.shown,
      list: FOOTS.list.map((r) => ({ uid: r.uid, kind: r.kind, rect: r.rect, door: r.door, done: +r.done.toFixed(3), written: r.written, n: FOOTS.plan(r).n, cost: r.cost })),
    };
  },
  /** A check's URL value for the mode now (`footdraw=`), or null. */
  report(): string | null {
    if (!kind) return null;
    const m = (c: number) => +cellMin(c).toFixed(2);
    if (!anchor) return kind;
    return `${kind}@${m(anchor[0])}/${m(anchor[1])}/${m(cursor[0])}/${m(cursor[1])}:${door}`;
  },
};

/** The prompt now (see the mode's comment). */
function promptNow(): string | null {
  if (!kind) return null;
  const touch = onTouch();
  const r = now.reason;
  const keys = (b: boolean) => (b ? `,.  ${t('footDoor')}  ·  Esc  ${t('footAgain')}` : `F  ${t('buildOther')}  ·  Esc  ${t('buildExit')}`);
  if (!anchor) {
    if (r) return touch ? reasonWords(r) : `${reasonWords(r)}  ·  ${keys(false)}`;
    return touch ? `E  ${t('footMark')}` : `E  ${t('footMark')}  ·  ${keys(false)}`;
  }
  const size = now.rect ? sizeWords(now.rect) : '';
  if (r) return touch ? reasonWords(r) : `${reasonWords(r)}  ·  ${size}  ·  ${keys(true)}`;
  return touch ? `E  ${t('buildHere')} ${size}` : `E  ${t('buildHere')}  ·  ${size}  ·  ${keys(true)}`;
}

// ── The panel (the size, the cost, the budget) ──────────────────────────────

let styled = false;
function injectStyle(): void {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const st = document.createElement('style');
  st.textContent = `
    .bf-panel { position: absolute; left: 50%; top: 64px; transform: translateX(-50%); width: min(380px, calc(100% - 32px)); box-sizing: border-box; padding: 9px 14px 10px; display: none;
      flex-direction: column; gap: 5px; z-index: 6; pointer-events: none; color: var(--mu-ink); font: 600 13px / 1.3 var(--mu-display); --mu-edge: var(--mu-btn-edge); }
    .bf-panel.is-on { display: flex; }
    .bf-panel > .mu-bg { background: rgba(14, 20, 30, 0.82); }
    .bf-panel > :not(.mu-bg) { position: relative; }
    .bf-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
    .bf-head b { font-size: 15.5px; color: #ffe2a0; }
    .bf-size { color: var(--mu-ink); white-space: nowrap; font-size: 14px; }
    .bf-cost { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }
    .bf-m { display: inline-flex; align-items: center; gap: 2px; white-space: nowrap; }
    .bf-m.is-short { color: #ffb4a0; }
    .bf-mi { width: 16px; height: 16px; filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.35)); }
    .bf-riel { margin-left: auto; padding-left: 8px; border-left: 1px solid rgba(255, 210, 120, 0.32); color: #ffe2a0; white-space: nowrap; }
    .bf-note { color: var(--mu-ink2); }
    .bf-note.is-short { color: #ffd890; }
    .bf-note.is-no { color: #ffb4a0; }
    .bf-meter { display: flex; align-items: center; gap: 8px; color: var(--mu-ink2); font-size: 12px; }
    .bf-bar { position: relative; flex: 1; min-width: 60px; height: 8px; border-radius: 4px; background: rgba(255, 244, 222, 0.12); box-shadow: inset 0 0 0 1px rgba(255, 216, 120, 0.4); overflow: hidden; }
    .bf-bar > i, .bf-bar > u { position: absolute; inset: 0; transform-origin: left center; border-radius: inherit; }
    .bf-bar > u { background: rgba(255, 226, 160, 0.45); transform: scaleX(var(--bf-after, 0)); }
    .bf-bar > i { background: #f2bf52; transform: scaleX(var(--bf-used, 0)); }
    .bf-meter.is-full .bf-bar > u { background: rgba(240, 120, 80, 0.75); }
    .bf-meter-v { white-space: nowrap; }
    :lang(km) .bf-panel { font-size: 14px; line-height: 1.45; }
    :lang(km) .bf-head b { font-size: 16.5px; }
    /* A touch screen: above the build bar (_build.ts .bd-bar), the top keeps its buttons and the mini-map. */
    body.roam-touch:not(.pad-on) .bf-panel { top: auto; bottom: calc(262px + 4vh); }
    /* (a phone upright: clear of the tool column down the right side) */
    @media (max-width: 560px) { body.roam-touch:not(.pad-on) .bf-panel { left: 10px; transform: none; width: calc(100% - 78px); } }
    @media (max-height: 500px) {
      .bf-panel { top: 8px; padding: 6px 12px 7px; gap: 3px; width: min(340px, calc(100% - 300px)); }
      .bf-meter { display: none; }
      /* (a phone on its side: down the left under his purse, clear of the top's tool bar, the "Now on" card and the
         build bar; the note in two lines at most) */
      body.roam-touch:not(.pad-on) .bf-panel { top: 96px; bottom: auto; left: 10px; transform: none; width: 210px; font-size: 12px; padding: 5px 10px 6px; }
      body.roam-touch:not(.pad-on) .bf-head b { font-size: 13.5px; }
      body.roam-touch:not(.pad-on) .bf-note { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
    }`;
  document.head.append(st);
}

function showPanel(on: boolean): void {
  if (!env || typeof document === 'undefined') return;
  if (!panel && on) {
    injectStyle();
    panel = document.createElement('div');
    panel.className = 'bf-panel mu-frame mu-sm';
    panel.setAttribute('aria-live', 'polite');
    env.layer.append(panel);
  }
  panel?.classList.toggle('is-on', on);
  // (hidden for sure: the roaming layer's own rule for its framed cards, `.rh > .mu-frame { display: flex }`, outranks a
  // class's; an inline style does not lose to it)
  if (panel) panel.style.display = on ? '' : 'none';
  if (!on) panelKey = '';
}

/** The panel's words (made again only when they change). */
function updatePanel(): void {
  if (!panel || !kind) return;
  const plan = now.plan;
  const used = plotBlocks();
  const after = used + (plan?.n ?? 0);
  const key = `${lang()}|${kind}|${now.key}|${now.reason}|${now.riel}|${used}|${MATERIAL_IDS.map(haveOf).join(',')}`;
  if (key === panelKey) return;
  panelKey = key;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const shown = plan ?? minPlan(kind);
  const cost = MATERIAL_IDS.filter((m) => (shown.cost[m] ?? 0) > 0)
    .map((m) => `<span class="bf-m${haveOf(m) < shown.cost[m]! ? ' is-short' : ''}">${materialIcon(m, 'bf-mi')}${num(shown.cost[m]!)}</span>`)
    .join('');
  const missing = missingOf(shown.cost);
  const pay = rielOf(missing);
  let note: string;
  let cls = '';
  if (now.reason && anchor) {
    note = reasonWords(now.reason);
    cls = ' is-no';
  } else if (pay > 0) {
    note = t('buildMissing', { what: materialsText(missing), riel: riel(pay) });
    cls = ' is-short';
  } else note = t(FOOT_KINDS[kind].line as WordKey);
  const size = now.rect ? sizeWords(now.rect) : t('footFrom', { w: metres(FOOT_KINDS[kind].minLong), d: metres(FOOT_KINDS[kind].min) });
  const u = Math.min(1, used / PLOT_BUDGET);
  const a = Math.min(1, after / PLOT_BUDGET);
  panel.innerHTML = `<span class="mu-bg"></span>
    <div class="bf-head"><b>${esc(t(FOOT_KINDS[kind].name as WordKey))}</b><span class="bf-size">${esc(size)}${plan ? ` · ${esc(t('footBlocks', { n: num(plan.n) }))}` : ''}</span></div>
    <div class="bf-cost">${cost}${pay > 0 ? `<b class="bf-riel">${esc(riel(pay))}</b>` : ''}</div>
    <div class="bf-note${cls}">${esc(note)}</div>
    <div class="bf-meter${a >= 0.9 ? ' is-full' : ''}" style="--bf-used:${u.toFixed(3)};--bf-after:${a.toFixed(3)}"><span>${esc(t('buildMeter'))}</span><span class="bf-bar" style="display:block"><u></u><i></i></span><span class="bf-meter-v">${esc(t('buildMeterPct', { pct: num(Math.round(a * 100)) }))}</span></div>`;
}

// ── Checks: a full plot ─────────────────────────────────────────────────────

/**
 * His land full of footprint buildings (`foot=full`, perf and the budget's checks): the largest of each (houses and
 * sheds of 8 × 8 m, fences round 8 × 8 m), each where the placing rules let it stand, scanning his land in rows from
 * the north (2 m steps), while each kind has room and the budget lasts. Returns how many.
 */
export function fillFoot(world: RoamWorld): number {
  let n = 0;
  const sizes: Record<FootKind, number> = { house: 16, shed: 16, fence: 16 };
  for (const k of FOOT_KIND_IDS) {
    const s = sizes[k];
    for (let z = cellOf(PLOT_BOX.z0) + 2; z + s < cellOf(PLOT_BOX.z1) && FOOTS.count(k) < FOOT_KINDS[k].most; z += 4)
      for (let x = cellOf(PLOT_BOX.x0) + 2; x + s < cellOf(PLOT_BOX.x1) && FOOTS.count(k) < FOOT_KINDS[k].most; x += 4) {
        const rect = { i0: x, k0: z, i1: x + s - 1, k1: z + s - 1 };
        const plan = footPlan(k, rect, 2);
        if (plotBlocks() + plan.n > PLOT_BUDGET) continue;
        if (landRules(world, plan)) continue;
        if (FOOTS.add(k, rect, 2, plan.cost, 1)) n++;
      }
  }
  console.info(`[foot] foot=full: ${n} buildings (${FOOT_KIND_IDS.map((k) => `${FOOTS.count(k)} ${k}`).join(', ')}), ${plotBlocks()} of ${PLOT_BUDGET} blocks on his land`);
  return n;
}
