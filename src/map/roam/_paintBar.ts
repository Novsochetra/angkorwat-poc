import { KHMER_PAINT } from '../blocks/kinds';
import { BRUSH_IDS, BRUSH_WORD, type BrushId } from '../build/paint';
import type { UISound } from '../types';
import { lang, t } from '../ui/lang';

/**
 * Paint mode's swatches (AWP-22, roam/_paint.ts): a strip of the six Khmer
 * colours and "its own colour" (the paint taken off), the one he holds ringed
 * in gold and named over the strip. A click or a tap picks one; the keys 1‥7
 * under each (hidden on a touch screen and with a game pad, whose d-pad ← →
 * show at the strip's ends). On a touch screen the strip sits above the
 * controls, where build mode's bar is (_build.ts `.bd-bar`), with ✕ (done) at
 * its end and a line saying how to paint (a tap, a long press); elsewhere at
 * the top of the screen.
 */

export interface PaintBar {
  show(on: boolean): void;
  /** The swatch held now. */
  set(brush: BrushId): void;
  /** The line under the name (what E held paints now, or how to aim), or '' for none. */
  hint(text: string): void;
  readonly el: HTMLElement;
}

/** "Its own colour": half the woods' tone, half the walls', a curved arrow over them (16 × 16 pixel art). */
const OWN = `<svg class="pt-own" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges"><path fill="#8a6a48" d="M0 0h16v16H0z"/><path fill="#cdc47e" d="M8 0h8v16H8z"/><path fill="#c8b27a" d="M8 4h8v2H8zM8 10h8v2H8z"/><path fill="#6e4a30" d="M0 5h8v1H0zM0 11h8v1H0z"/><path fill="#fff4d6" d="M5 3h6v1H5zM4 4h1v1H4zM11 4h1v4h-1zM3 5h1v4H3zM4 9h1v1H4zM2 7h3v1H2z"/></svg>`;

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

export function createPaintBar(layer: HTMLElement, sound: (s: UISound) => void, onPick: (b: BrushId) => void, onDone: () => void): PaintBar {
  injectStyle();
  const el = document.createElement('div');
  el.className = 'pt-bar';
  el.style.display = 'none';
  el.innerHTML = `<div class="pt-in mu-frame mu-sm"><span class="mu-bg"></span>
    <div class="pt-head"><b class="pt-title"></b><span class="pt-name"></span></div>
    <div class="pt-row"><kbd class="pt-pad" data-pad="left" aria-hidden="true">,</kbd>${BRUSH_IDS.map(
      (b, n) =>
        `<button type="button" class="pt-sw${b === 'own' ? ' is-own' : ''}" data-brush="${b}"><span class="pt-chip"${b === 'own' ? '' : ` style="--pt-c:${hex(KHMER_PAINT[b])}"`}>${b === 'own' ? OWN : ''}</span><kbd>${n + 1}</kbd></button>`,
    ).join('')}<kbd class="pt-pad" data-pad="right" aria-hidden="true">.</kbd><button type="button" class="pt-done" data-do="done"><span aria-hidden="true">✕</span><span class="pt-done-t"></span></button></div>
    <div class="pt-hint"></div></div>`;
  layer.append(el);
  const title = el.querySelector<HTMLElement>('.pt-title')!;
  const name = el.querySelector<HTMLElement>('.pt-name')!;
  const hintEl = el.querySelector<HTMLElement>('.pt-hint')!;
  const doneT = el.querySelector<HTMLElement>('.pt-done-t')!;
  let held: BrushId = 'lotus';
  let saidLang = '';
  let hintSaid = '';

  function words(): void {
    const l = lang();
    if (l === saidLang) return;
    saidLang = l;
    title.textContent = t('paintTitle');
    doneT.textContent = t('buildExit');
    for (const b of el.querySelectorAll<HTMLButtonElement>('.pt-sw')) {
      const w = t(BRUSH_WORD[b.dataset.brush as BrushId]);
      b.setAttribute('aria-label', w);
      b.title = w;
    }
    name.textContent = t(BRUSH_WORD[held]);
  }

  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b) return;
    if (b.dataset.do === 'done') {
      sound('close');
      onDone();
      return;
    }
    const brush = b.dataset.brush as BrushId | undefined;
    if (brush) onPick(brush);
  });

  return {
    el,
    show(on) {
      if (on) words();
      el.style.display = on ? '' : 'none';
    },
    set(brush) {
      held = brush;
      for (const b of el.querySelectorAll<HTMLButtonElement>('.pt-sw')) {
        const is = b.dataset.brush === brush;
        b.classList.toggle('is-on', is);
        b.setAttribute('aria-pressed', String(is));
      }
      saidLang = '';
      words();
    },
    hint(text) {
      if (text === hintSaid) return;
      hintSaid = text;
      hintEl.textContent = text;
      hintEl.hidden = !text;
    },
  };
}

let styled = false;
function injectStyle(): void {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const st = document.createElement('style');
  st.textContent = `
    .pt-bar { position: absolute; left: 50%; top: 64px; transform: translateX(-50%); z-index: 6; pointer-events: none; max-width: calc(100% - 20px); }
    .pt-in { position: relative; display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 8px 12px 9px; box-sizing: border-box; color: var(--mu-ink);
      font: 600 13px / 1.3 var(--mu-display); --mu-edge: var(--mu-btn-edge); }
    .pt-in > .mu-bg { background: rgba(14, 20, 30, 0.82); }
    .pt-in > :not(.mu-bg) { position: relative; }
    .pt-head { display: flex; align-items: baseline; gap: 10px; white-space: nowrap; }
    .pt-title { color: var(--mu-ink2); font-size: 13px; }
    .pt-name { color: #ffe2a0; font-size: 15.5px; font-weight: 700; }
    .pt-row { display: flex; align-items: center; gap: 6px; pointer-events: auto; }
    .pt-sw { display: inline-flex; flex-direction: column; align-items: center; gap: 3px; padding: 0; border: 0; background: none; cursor: pointer; color: var(--mu-ink2); touch-action: manipulation; }
    .pt-chip { position: relative; display: block; width: 32px; height: 32px; border-radius: 7px; background: var(--pt-c, #888); overflow: hidden;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25), inset 0 -5px 0 rgba(0, 0, 0, 0.18), 0 1px 0 rgba(0, 0, 0, 0.4); transition: transform 0.15s; }
    .pt-own { display: block; width: 100%; height: 100%; }
    .pt-sw.is-on .pt-chip { box-shadow: 0 0 0 2px #1a1208, 0 0 0 4px #f7c95a, 0 0 10px rgba(255, 200, 90, 0.6); transform: translateY(-1px); }
    .pt-sw kbd, .pt-pad { display: inline-grid; place-items: center; min-width: 16px; height: 16px; padding: 0 3px; box-sizing: border-box; font: 600 10.5px / 1 var(--mu-display);
      color: var(--mu-ink2); background: rgba(255, 244, 222, 0.1); border: 1px solid var(--mu-line-hi); border-bottom-width: 2px; border-radius: 3px; }
    .pt-sw.is-on kbd { color: #2b1904; background: #f7c95a; border-color: #ffe7a0; }
    body.roam-touch:not(.pad-on) .pt-pad { display: none; }
    body.pad-on .pt-sw kbd { visibility: hidden; }
    .pt-done { display: none; align-items: center; gap: 5px; min-height: 36px; padding: 0 10px; margin-left: 4px; border: 1px solid var(--mu-btn-edge); border-radius: 8px; background: var(--mu-btn);
      color: var(--mu-ink); font: 700 14px / 1 var(--mu-display); cursor: pointer; touch-action: manipulation; }
    .pt-hint { color: var(--mu-ink2); font-size: 12px; text-align: center; }
    .pt-hint[hidden] { display: none; }
    :lang(km) .pt-in { font-size: 14px; line-height: 1.45; }
    :lang(km) .pt-name { font-size: 16.5px; }
    :lang(km) .pt-title { font-size: 14px; }
    :lang(km) .pt-hint { font-size: 13px; }
    @media (hover: hover) { .pt-sw:hover .pt-chip { transform: translateY(-2px); } }
    .pt-sw:active .pt-chip { transform: scale(0.94); }
    /* A touch screen: above the controls (where build mode's bar is), ✕ at its end, no key caps. */
    body.roam-touch:not(.pad-on) .pt-bar { top: auto; bottom: calc(206px + 4vh); }
    body.roam-touch:not(.pad-on) .pt-sw kbd { display: none; }
    body.roam-touch:not(.pad-on) .pt-done { display: inline-flex; }
    body.roam-touch:not(.pad-on) .pt-chip { width: 36px; height: 36px; }
    /* (a phone upright: smaller chips, the ✕ without its word) */
    @media (max-width: 480px) {
      body.roam-touch:not(.pad-on) .pt-chip { width: 31px; height: 31px; }
      .pt-row { gap: 4px; }
      .pt-in { padding: 6px 8px 7px; }
      .pt-done-t { display: none; }
    }
    /* (a phone on its side: along the bottom between the stick and the Use button, small, ✕ without its word, the
       line left out; with keys, at the top) */
    @media (max-height: 500px) {
      .pt-bar { top: 8px; }
      body.roam-touch:not(.pad-on) .pt-bar { top: auto; bottom: 6px; }
      body.roam-touch:not(.pad-on) .pt-chip { width: 27px; height: 27px; border-radius: 6px; }
      body.roam-touch:not(.pad-on) .pt-row { gap: 4px; }
      body.roam-touch:not(.pad-on) .pt-done { min-height: 30px; padding: 0 9px; }
      .pt-done-t { display: none; }
      .pt-in { padding: 4px 8px 5px; gap: 2px; }
      .pt-head { font-size: 12px; }
      .pt-hint { display: none; }
    }
    .rh-prompt.pt-hold::after, .rt-use.pt-hold::after { content: ''; position: absolute; left: 12%; right: 12%; bottom: 4px; height: 4px; border-radius: 2px;
      background: linear-gradient(90deg, #ffe7a0, #f7bd40); transform: scaleX(var(--pt-hold, 0)); transform-origin: left center; pointer-events: none; box-shadow: 0 0 6px rgba(255, 200, 90, 0.6); }
    .pt-cross { position: fixed; width: 18px; height: 18px; margin: -9px 0 0 -9px; border-radius: 50%; border: 2px solid rgba(255, 236, 190, 0.9); box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.45), inset 0 0 0 1px rgba(0, 0, 0, 0.35);
      pointer-events: none; z-index: 5; display: none; }
    .pt-cross::after { content: ''; position: absolute; left: 50%; top: 50%; width: 4px; height: 4px; margin: -2px 0 0 -2px; border-radius: 50%; background: #ffe2a0; }
    .pt-cross.is-far { border-color: rgba(255, 170, 150, 0.85); }`;
  document.head.append(st);
}
