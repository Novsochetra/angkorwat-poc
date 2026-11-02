import '../audio/_paint';
import { Raycaster, Vector2 } from 'three';
import { SFX } from '../audio/addonSfx';
import { rayBlocks } from '../blocks/ray';
import { saveBlocksNow } from '../blocks/save';
import { BLOCKS, cellMid } from '../blocks/store';
import { FOOT_KIND_IDS, FOOT_KINDS, planFoot } from '../build/footPlan';
import { FOOTS } from '../build/footState';
import { BRUSH_IDS, BRUSH_WORD, brushColour, isPainted, kindsBound, kindsNow, PAINT_LINK, paintCells, paintFromUrl, partAt, type BrushId, type PaintPart } from '../build/paint';
import { pastPlot } from '../build/plot';
import { pad } from '../pad/pad';
import { padName } from '../pad/glyphs';
import { progress } from '../progress';
import type { MapFrame, RoamMode } from '../types';
import { lang, t } from '../ui/lang';
import { registerAddon, type AddonEnv } from './_addons';
import { createPaintBar, type PaintBar } from './_paintBar';
import { PaintCursor } from './_paintCursor';
import type { RoamCtx } from './types';

/**
 * Paint mode (add-on `paint`, AWP-22; what painting does: build/paint.ts; the
 * guide docs/map-work/addons.md "Paint"). Six Khmer colours for his own
 * blocks (the block layer: his footprint buildings and any blocks of his),
 * free, no colour wheel.
 *
 * - **In**: the build card's "Paint your buildings" row (the Buildings tab,
 *   roam/_build.ts: `PAINT_LINK.enter`). **Out**: Esc (the pad's ○, the
 *   touch ✕), walking off his land (8 m past it), another mode, build mode.
 *   F / C (the pad's ↓): the build card again.
 * - **The colour**: the swatches (_paintBar.ts: a click or a tap), 1‥7 (7: its
 *   own colour, the paint taken off), `,` / `.` (the pad's d-pad ← →) the one
 *   before or after. Kept between visits (`paint.brush`).
 * - **Aim**: the block under the mouse; with a game pad, or on a phone before
 *   a tap, the block at the gold ring over his head (the camera's aim: turn
 *   it, tilt it); on a phone the block tapped. A light frame round it, the
 *   side covered with the colour (_paintCursor.ts). He reaches `REACH` m from
 *   his head ("Too far: come closer" past it).
 * - **Paint**: E (the pad's □, the touch Use button; a mouse click on a block,
 *   a tap on one) paints that block. **E held** (`HOLD` s, the prompt's bar
 *   filling, the part tinted more and more: a long press on a phone) paints
 *   the whole part: a footprint building's walls, its roof, its posts… (build/
 *   paint.ts `partAt`). One gesture for one block or a whole wall, the same on
 *   keys, a pad and a phone (a run of blocks painted while held would need a
 *   steady aim a thumb does not give). He turns to what he paints.
 * - **Free**: the colours cost nothing (the owner looks at how it feels
 *   first; nothing to give back when the paint is taken off).
 * - **Saved with the build**: the colour is part of the block (blocks/save.ts);
 *   the save is written a second after painting, when the mode ends, and when
 *   the page is hidden or closed.
 *
 * URL (shots and the dev server only, never the live site): `paint=<what>:<colour>,…`
 * (build/paint.ts `paintFromUrl`: `all`, `house-1`, `house-1.walls`,
 * `house-1.walls.bamboo`), `paintmode=<colour>` (the mode on, that colour held),
 * `painthold=<0‥1>` (E held that far on the block aimed at: the part's tint).
 * `report()` gives `paintmode=`. `window.__paint` (shots, the dev server):
 * `state()`, `enter(colour)`, `exit()`, `brush(colour)`, `paint(what)`,
 * `aimAt(i, j, k)` (paints nothing), `kinds()`. Console lines start `[paint]`.
 */

/** He reaches this far from his head (m) to what he paints. */
const REACH = 9;
/** E held this long (s) paints the whole part; its tint shows after `SHOW`. */
const HOLD = 0.6;
const SHOW = 0.12;
/** Paint mode ends this far past his land (m), as build mode. */
const MODE_FAR = 8;
/** The gold ring (the camera's aim, no mouse): over his head, this far up the screen (NDC y). */
const CROSS_Y = 0.24;
/** A tap: shorter than this (ms), moving less than this (px); never in the stick's corner (touch.ts: lower left). A long press: still for `HOLD`. */
const TAP = { ms: 350, px: 12 };
/** His eyes over his feet (m). */
const EYES = 1.6;

let env: AddonEnv | null = null;
let cursor: PaintCursor | null = null;
let bar: PaintBar | null = null;
let cross: HTMLElement | null = null;
let on = false;
const isBrush = (v: unknown): v is BrushId => typeof v === 'string' && (BRUSH_IDS as readonly string[]).includes(v);
let brush: BrushId = progress.get<BrushId>('paint.brush', 'lotus', isBrush);
/** Where the aim comes from: the mouse, a tap (held there), the gold ring. */
let src: 'mouse' | 'tap' | 'cross' = 'cross';
const tapAt = { x: 0, y: 0 };
let stepN = 0;
/** The aim (once a step): the block, its side and box, where it was met (m), too far. */
const aim = {
  step: -1,
  hit: null as { i: number; j: number; k: number; side: number; box: readonly number[] } | null,
  at: { x: 0, y: 0, z: 0 },
  far: false,
  prompt: null as string | null,
};
/** E (or a long press) held: the block it began on, its part (once its tint shows), how long. */
let press: { i: number; j: number; k: number; part: PaintPart | null; t: number; how: 'key' | 'touch' } | null = null;
/** A check's E held still (`painthold=`). */
let frozen: number | null = null;
/** A check's `painthold=` waiting for the aim (steps tried). */
let holdWant: { f: number; steps: number } | null = null;
/** Blocks painted since the map was opened (checks). */
let painted = 0;
let lastCtx: RoamCtx | null = null;

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
/** A colour's name inside a sentence (English: lower case). */
const colourWord = (b: BrushId): string => {
  const s = t(BRUSH_WORD[b]);
  return lang() === 'en' ? s.toLowerCase() : s;
};
const onTouch = () => typeof document !== 'undefined' && document.body.classList.contains('roam-touch') && !document.body.classList.contains('pad-on');

// ── E held ──────────────────────────────────────────────────────────────────

const held = { key: false, touch: false, canvas: false };
let wired = false;
/** A touch on the view (not the stick's corner): where, when; null when it moved (a drag) or ended. */
let touch: { id: number; x: number; y: number; t: number } | null = null;
function wire(): void {
  if (wired || !env) return;
  wired = true;
  addEventListener('keydown', (e) => {
    if ((e.code === 'KeyE' || e.code === 'Enter') && !e.repeat) held.key = true;
  });
  addEventListener('keyup', (e) => {
    if (e.code === 'KeyE' || e.code === 'Enter') held.key = false;
  });
  addEventListener('blur', () => (held.key = held.touch = held.canvas = false));
  addEventListener(
    'pointerdown',
    (e) => {
      if ((e.target as HTMLElement | null)?.closest?.('.rt-use')) held.touch = true;
    },
    true,
  );
  const up = () => (held.touch = false);
  addEventListener('pointerup', up, true);
  addEventListener('pointercancel', up, true);
  // A tap on a block paints it; a long press there, the whole part.
  const canvas = env.canvas;
  canvas.addEventListener('pointerdown', (e) => {
    if (!on || e.pointerType !== 'touch' || touch) return;
    if (e.clientX < innerWidth * 0.45 && e.clientY > innerHeight * 0.3) return;
    touch = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
    held.canvas = true;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (touch && e.pointerId === touch.id && Math.hypot(e.clientX - touch.x, e.clientY - touch.y) > TAP.px) {
      // (a drag: the camera's, not a paint)
      touch = null;
      held.canvas = false;
      if (press?.how === 'touch') cancelPress();
    }
  });
  const end = (e: PointerEvent) => {
    if (!touch || e.pointerId !== touch.id) return;
    const tp = touch;
    touch = null;
    held.canvas = false;
    // (a quick tap: that block, painted now; a long press ended its own way, in `pressStep`)
    if (e.type === 'pointerup' && !press && performance.now() - tp.t <= TAP.ms && lastCtx) {
      src = 'tap';
      tapAt.x = tp.x;
      tapAt.y = tp.y;
      aim.step = -1;
      aimNow(lastCtx);
      if (aim.hit && !aim.far) paintOne(lastCtx, aim.hit.i, aim.hit.j, aim.hit.k);
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}
const eHeld = (): boolean => held.key || held.touch || pad.held('west');

/** The prompt's and the touch Use button's fill bar (`--pt-hold` 0‥1). */
function holdBar(v: number | null): void {
  if (typeof document === 'undefined') return;
  for (const el of document.querySelectorAll<HTMLElement>('.rh-prompt, .rt-use')) {
    el.classList.toggle('pt-hold', v !== null);
    if (v !== null) el.style.setProperty('--pt-hold', v.toFixed(3));
  }
}

function cancelPress(): void {
  press = null;
  holdBar(null);
  cursor?.part(null);
}

// ── The aim ─────────────────────────────────────────────────────────────────

const _ray = new Raycaster();
const _ndc = new Vector2();
const ground = (x: number, z: number) => env?.world.field.heightAt(x, z) ?? -Infinity;

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
  // (a long press aims where the finger is)
  if (touch && press?.how === 'touch') _ndc.set(((touch.x - r.left) / r.width) * 2 - 1, -((touch.y - r.top) / r.height) * 2 + 1);
  const cam = ctx.cam.camera;
  _ray.setFromCamera(_ndc, cam);
  const { origin: o, direction: d } = _ray.ray;
  const b = ctx.body.pos;
  const far = Math.hypot(o.x - b.x, o.y - b.y - EYES, o.z - b.z) + REACH + 1;
  const hit = rayBlocks(o.x, o.y, o.z, d.x, d.y, d.z, far, ground);
  if (!hit) {
    aim.hit = null;
    aim.far = false;
    return;
  }
  const ah = (aim.hit ??= { i: 0, j: 0, k: 0, side: 0, box: hit.box });
  ah.i = hit.i;
  ah.j = hit.j;
  ah.k = hit.k;
  ah.side = hit.side;
  ah.box = hit.box;
  aim.at.x = o.x + d.x * hit.t;
  aim.at.y = o.y + d.y * hit.t;
  aim.at.z = o.z + d.z * hit.t;
  aim.far = Math.hypot(aim.at.x - b.x, aim.at.y - b.y - EYES, aim.at.z - b.z) > REACH;
}

/** The gold ring (no mouse, no tap): on the screen where the camera aims. */
function showCross(show: boolean): void {
  if (!env || typeof document === 'undefined') return;
  if (!cross && show) {
    cross = document.createElement('div');
    cross.className = 'pt-cross';
    document.body.append(cross);
  }
  if (!cross) return;
  cross.style.display = show ? 'block' : 'none';
  if (!show) return;
  const r = env.canvas.getBoundingClientRect();
  cross.style.left = `${r.left + r.width / 2}px`;
  cross.style.top = `${r.top + (r.height * (1 - CROSS_Y)) / 2}px`;
  cross.classList.toggle('is-far', !!aim.hit && aim.far);
}

// ── Painting ────────────────────────────────────────────────────────────────

/** Turn him to what he paints. */
function face(ctx: RoamCtx, x: number, z: number): void {
  const b = ctx.body;
  const dx = x - b.pos.x;
  const dz = z - b.pos.z;
  if (Math.hypot(dx, dz) > 0.3) b.yaw = Math.atan2(dx, dz);
}

function paintOne(ctx: RoamCtx, i: number, j: number, k: number): void {
  const n = paintCells([i, j, k], brush);
  face(ctx, cellMid(i), cellMid(k));
  cursor?.flash();
  SFX.play('paintStroke', 1);
  painted += n;
}

function paintPart(ctx: RoamCtx, part: PaintPart, i: number, k: number): void {
  const n = paintCells(part.cells, brush);
  face(ctx, cellMid(i), cellMid(k));
  cursor?.flash();
  SFX.play('paintWash', 1);
  painted += n;
  const what = t(part.word);
  ctx.hud.toast(brush === 'own' ? t('paintOwnDone', { part: what }) : t('paintPartDone', { part: what, colour: colourWord(brush) }));
  console.info(`[paint] ${part.uid ?? 'blocks'}: ${n} of ${part.cells.length / 3} blocks ${brush}`);
}

/** Each step while E (or a long press) is held: the part's tint grows; held long enough, the part is painted. */
function pressStep(ctx: RoamCtx, dt: number): void {
  if (frozen !== null) return;
  if (!press && touch && performance.now() - touch.t > TAP.ms && lastCtx) {
    // (a long press on the view: the part at the finger)
    src = 'tap';
    tapAt.x = touch.x;
    tapAt.y = touch.y;
    aim.step = -1;
    aimNow(ctx);
    if (aim.hit && !aim.far) press = { i: aim.hit.i, j: aim.hit.j, k: aim.hit.k, part: null, t: TAP.ms / 1000, how: 'touch' };
    else touch = null;
  }
  const p = press;
  if (!p) return;
  if (!BLOCKS.raw(p.i, p.j, p.k)) {
    cancelPress();
    return;
  }
  const down = p.how === 'key' ? eHeld() : held.canvas;
  if (!down) {
    // (let go before the part: that block)
    cancelPress();
    paintOne(ctx, p.i, p.j, p.k);
    return;
  }
  p.t += dt;
  if (p.t >= SHOW) {
    p.part ??= partAt(p.i, p.j, p.k);
    const f = Math.min(1, (p.t - SHOW) / (HOLD - SHOW));
    if (p.part) cursor?.part(p.part.cells, brushColour(brush, p.i, p.j, p.k, BLOCKS.raw(p.i, p.j, p.k)), f);
    holdBar(f);
  }
  if (p.t < HOLD) return;
  const part = p.part ?? partAt(p.i, p.j, p.k);
  cancelPress();
  touch = null;
  held.canvas = false;
  if (part) paintPart(ctx, part, p.i, p.k);
}

/** What the marks show (one object, filled each step). */
const _mark = { i: 0, j: 0, k: 0, side: 2, box: [0, 0, 0, 1, 1, 1] as readonly number[], colour: 0 };

/** A check's E held still (`painthold=`): on the block aimed at, once there is one (a few steps in). */
function freezeHold(w: { f: number; steps: number }): void {
  if (++w.steps < 3) return;
  if (!aim.hit) {
    if (w.steps > 60) {
      holdWant = null;
      console.warn('[paint] painthold=: nothing aimed at (give rcam= so the ring is on a block)');
    }
    return;
  }
  holdWant = null;
  const p = (press = { i: aim.hit.i, j: aim.hit.j, k: aim.hit.k, part: partAt(aim.hit.i, aim.hit.j, aim.hit.k), t: SHOW + w.f * (HOLD - SHOW), how: 'key' });
  frozen = w.f;
  if (p.part) cursor?.part(p.part.cells, brushColour(brush, p.i, p.j, p.k, BLOCKS.raw(p.i, p.j, p.k)), w.f);
  holdBar(w.f);
}

// ── The mode ────────────────────────────────────────────────────────────────

function setBrush(b: BrushId, quiet = false): void {
  if (b === brush && !quiet) return;
  brush = b;
  bar?.set(b);
  aim.step = -1;
  if (!quiet) env?.uiSound('tick');
  if (env && !env.shot) progress.set('paint.brush', b);
}

function enter(): void {
  if (!env) return;
  wire();
  on = true;
  PAINT_LINK.on = true;
  src = 'cross';
  aim.step = -1;
  bar ??= createPaintBar(env.layer, env.uiSound, (b) => setBrush(b), () => exit());
  bar.set(brush);
  bar.show(true);
  console.info(`[paint] on: ${brush}`);
}

function exit(): void {
  if (!on) return;
  on = false;
  PAINT_LINK.on = false;
  cancelPress();
  frozen = null;
  touch = null;
  bar?.show(false);
  showCross(false);
  cursor?.aim(null);
  // (what he painted, kept now: AWP-22, "saved with the build")
  saveBlocksNow();
}

/** The prompt now (once a step). */
function promptNow(): string | null {
  if (!on) return null;
  const touchUi = onTouch();
  const h = aim.hit;
  if (press && press.part) return words(`painting|${press.part.word}`, () => t('paintPainting', { part: t(press!.part!.word) }));
  if (!h) return words('aim', () => t('paintAim'));
  if (aim.far) return words('far', () => t('paintFar'));
  const verb = brush === 'own' ? words('own', () => t('paintOwnHere')) : words(`here|${brush}`, () => t('paintHere', { colour: colourWord(brush) }));
  if (touchUi) return `E  ${verb}`;
  return words(`line|${brush}`, () => `E  ${verb}  ·  ${t('paintHold')}  ·  F  ${t('buildOther')}  ·  Esc  ${t('buildExit')}`);
}

/** The strip's line: how to paint here (a tap and a long press on a phone; the pad's buttons). */
function hintNow(): string {
  if (onTouch()) return words('hintTouch', () => t('paintTouchHint'));
  if (pad.active) return words(`hintPad|${pad.kind}`, () => t('paintPadHint', { btn: padName('west', pad.kind) }));
  return words('hintKeys', () => t('paintKeyHint'));
}

registerAddon({
  id: 'paint',
  // (first in the E row and the keys: its E paints, its 1‥7 pick colours before the tools and the binoculars)
  order: 2,
  // (paint mode: its E is the E row's only line, _addons.ts)
  get endsRow() {
    return on;
  },
  init(e) {
    env = e;
    cursor = new PaintCursor(e.scene);
    PAINT_LINK.enter = enter;
    PAINT_LINK.exit = exit;
    if (e.shot || import.meta.env.DEV)
      Object.assign(window, {
        __paint: {
          state: () => ({
            on,
            brush,
            src,
            aim: aim.hit ? { ...aim.hit, box: [...aim.hit.box], at: { x: +aim.at.x.toFixed(2), y: +aim.at.y.toFixed(2), z: +aim.at.z.toFixed(2) }, far: aim.far } : null,
            prompt: aim.prompt,
            press: press ? { cell: [press.i, press.j, press.k], t: +press.t.toFixed(2), part: press.part ? press.part.cells.length / 3 : 0, how: press.how } : null,
            cursor: !!cursor?.shown,
            painted,
            blocks: BLOCKS.count,
            paintedNow: (() => {
              let n = 0;
              BLOCKS.forEach((_i, _j, _k, raw) => (n += isPainted(raw) ? 1 : 0));
              return n;
            })(),
            saving: progress.saving,
          }),
          enter: (b?: BrushId) => {
            if (b && isBrush(b)) setBrush(b, true);
            PAINT_LINK.exit();
            enter();
          },
          exit,
          brush: (b: BrushId) => isBrush(b) && setBrush(b),
          paint: (v: string) => paintFromUrl(v),
          aimAt: (i: number, j: number, k: number) => {
            const raw = BLOCKS.raw(i, j, k);
            return raw ? { part: partAt(i, j, k)?.cells.length ?? 0, colour: brushColour(brush, i, j, k, raw).toString(16) } : null;
          },
          part: (i: number, j: number, k: number) => {
            const p = partAt(i, j, k);
            return p ? { n: p.cells.length / 3, word: p.word, uid: p.uid } : null;
          },
          /** The kinds of block now, and the most footprint buildings can make (every kind, size and door, flat and on a slope). */
          kinds: () => {
            const raws: number[] = [];
            const slope = (x: number, z: number) => x * 0.08 + z * 0.05;
            for (const k of FOOT_KIND_IDS) {
              const s = FOOT_KINDS[k];
              for (let w = k === 'fence' ? 1 : s.min; w <= s.max; w += k === 'fence' ? 3 : 1)
                for (let d = s.minLong; d <= s.max; d += 3)
                  for (let door = 0; door < 4; door++)
                    for (const g of [() => 0, slope]) {
                      const rect = { i0: 0, k0: 0, i1: d - 1, k1: w - 1 };
                      const p = planFoot(k, rect, door as 0 | 1 | 2 | 3, g);
                      for (const r of p.raws) raws.push(r);
                    }
            }
            return { now: kindsNow(), bound: kindsBound(raws), records: FOOTS.list.length };
          },
        },
      });
  },
  input(ctx, m, tap) {
    lastCtx = ctx;
    stepN++;
    if (!on) return false;
    const p = ctx.body.pos;
    if (m !== 'walk' || pastPlot(p.x, p.z) > MODE_FAR || PAINT_LINK.building()) {
      exit();
      return false;
    }
    const i = ctx.input;
    const taps = i.taps as Set<string> | undefined;
    // Esc (the pad's ○, the touch ✕): out of paint mode, not "Back to the map?".
    if (i.exit) {
      i.exit = false;
      env?.uiSound('close');
      exit();
      return false;
    }
    // 1‥7: a colour (with a game pad 4 and 5 are its d-pad's ← →).
    for (let n = 1; n <= BRUSH_IDS.length; n++) {
      if (pad.active && (n === 4 || n === 5)) continue;
      if (tap(`Digit${n}`, `Numpad${n}`)) {
        taps?.delete(`Digit${n}`);
        taps?.delete(`Numpad${n}`);
        setBrush(BRUSH_IDS[n - 1]);
      }
    }
    const prev = tap('Comma') || (pad.active && tap('Digit4'));
    const next = tap('Period') || (pad.active && tap('Digit5'));
    if (prev || next) {
      for (const c of ['Comma', 'Period', 'Digit4', 'Digit5']) taps?.delete(c);
      const at = BRUSH_IDS.indexOf(brush);
      setBrush(BRUSH_IDS[(at + (prev ? -1 : 1) + BRUSH_IDS.length) % BRUSH_IDS.length]);
    }
    // F or C (the pad's ↓): the build card again.
    if (tap('KeyF', 'KeyC')) {
      taps?.delete('KeyF');
      taps?.delete('KeyC');
      PAINT_LINK.card();
      return true;
    }
    // A mouse click on a block: that block.
    if (i.click && !env?.busy()) {
      i.click = false;
      aim.step = -1;
      aimNow(ctx);
      if (aim.hit && !aim.far && !press) paintOne(ctx, aim.hit.i, aim.hit.j, aim.hit.k);
    }
    return false;
  },
  offer(ctx, m) {
    if (!on || m !== 'walk' || !env || env.busy()) return null;
    aimNow(ctx);
    aim.prompt = promptNow();
    return aim.prompt;
  },
  use(ctx) {
    if (!on || !env || press) return;
    aimNow(ctx);
    if (!aim.hit || aim.far) return;
    press = { i: aim.hit.i, j: aim.hit.j, k: aim.hit.k, part: null, t: 0, how: 'key' };
    holdBar(0);
  },
  after(ctx, m, dt) {
    lastCtx = ctx;
    if (!on) return;
    const asking = typeof document !== 'undefined' && (document.body.classList.contains('mu-asking') || document.body.classList.contains('rxm-open'));
    const free = m === 'walk' && !!env && !env.busy() && !asking;
    if (!free) {
      if (press && frozen === null) cancelPress();
      cursor?.aim(null);
      showCross(false);
      bar?.show(!asking && m === 'walk');
      return;
    }
    bar?.show(true);
    aimNow(ctx);
    if (holdWant) freezeHold(holdWant);
    pressStep(ctx, dt);
    aim.prompt = promptNow();
    // (the block the press began on while E is held, else the one aimed at)
    const h = aim.hit;
    const mark = _mark;
    if (press) {
      mark.i = press.i;
      mark.j = press.j;
      mark.k = press.k;
      if (h && h.i === press.i && h.j === press.j && h.k === press.k) {
        mark.side = h.side;
        mark.box = h.box;
      }
    } else if (h) {
      mark.i = h.i;
      mark.j = h.j;
      mark.k = h.k;
      mark.side = h.side;
      mark.box = h.box;
    }
    const raw = (press || (h && !aim.far)) && BLOCKS.raw(mark.i, mark.j, mark.k);
    if (raw) {
      mark.colour = brushColour(brush, mark.i, mark.j, mark.k, raw);
      cursor?.aim(mark);
    } else cursor?.aim(null);
    showCross(src === 'cross');
    bar?.hint(hintNow());
  },
  frame(f: MapFrame, _m: RoamMode) {
    cursor?.frame(f.dt > 0 ? f.dt : 0);
  },
  setMode() {
    exit();
  },
  fromUrl(q, ctx) {
    lastCtx = ctx;
    // (every value here is a check's: shots and the dev server only, never the live site — a link would paint a
    // player's saved build: REVIEW.md "Lessons")
    if (!(env?.shot || import.meta.env.DEV)) return;
    const v = q.get('paint');
    if (v) console.info(`[paint] paint=${v}: ${paintFromUrl(v)} blocks`);
    const mode = q.get('paintmode');
    if (mode !== null) {
      if (isBrush(mode)) setBrush(mode, true);
      PAINT_LINK.exit();
      enter();
    }
    // (E held still on what the ring is on, once the camera has settled: the next steps)
    const h = q.get('painthold');
    if (h !== null && on) holdWant = { f: Math.min(1, Math.max(0, Number(h) || 0)), steps: 0 };
  },
  report() {
    return on ? { paintmode: brush } : null;
  },
});

