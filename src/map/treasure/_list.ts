import { PLACES } from '../layout';
import { clearMark, markFocus, moveFocusIn } from '../pad/nav';
import { pad } from '../pad/pad';
import type { PlaceId, UISound } from '../types';
import { lang, num, onLang, placeText, t, type WordKey } from '../ui/lang';
import { steppedRing, steppedShape } from '../ui/shape';
import { goldArt } from './_art';
import { goldIcon } from './_hud';
import type { GoldDef } from './_spots';

/**
 * The list of clues for the fifteen golden figures (index.ts opens it: a
 * click or a tap on the gold counter, the explorer menu's "Golden figures"
 * through `MENU_HOOKS.openGoldList`, the game pad by that menu), in the
 * look of the map's panels (map.css: a dark panel with stepped corners and
 * a warm edge, gold for what matters; as the calendar's card).
 *
 * - The head: the tiny golden figure, "Golden figures", "8 of 15 found"
 *   and a pip for each (gold when found); when all are found, a gold line
 *   that says so.
 * - A row a figure, in the order of `GOLD` (the temples, the jungle, the
 *   village). Found: its picture in gold (_art.ts), its name and where.
 *   Not found yet: its dark silhouette, where to look (a temple's name, or
 *   an area) and its clue (`tgClue…`); the whole row is a button, "Show on
 *   map": its search area goes on the mini-map and the big map
 *   (_mapMark.ts), one at a time (again: off). The one followed is lit gold.
 * - The foot: how the hunt helps near one (the shimmer, the glint).
 *
 * Keys while open (its own: a capture listener, before the roaming keys,
 * which never see them; B for a bug report and the map's M still work):
 * ↑ ↓ ← → between the rows, Enter or Space presses one, Esc (or the ×)
 * shuts it, Tab stays inside. The game pad: a layer (pad.openLayer) while
 * open: the stick or the d-pad move the ring, ✕ presses, ○ shuts. A tap or
 * a click outside shuts it. While it is open the roaming input stops
 * (index.ts: its add-on's `input`). Upright on a phone it is a sheet along
 * the bottom, on its side a panel down the left (rows of at least 44 px,
 * the list scrolls inside); no `:has()` (classes from here).
 */

export interface GoldRow {
  def: GoldDef;
  found: boolean;
}

export interface GoldListDeps {
  /** The roaming interface's layer (its size and time of day). */
  layer: HTMLElement;
  /** The figures now, in `GOLD`'s order. */
  rows(): readonly GoldRow[];
  /** The one followed (its search area on the maps), or null. */
  tracked(): string | null;
  /** "Show on map" on a row (again on the one followed: off). */
  onTrack(id: string): void;
  /** It shut (Esc, ×, ○, a tap outside, or `close`). */
  onClose(): void;
  /** What opens it (a tap there is not a tap outside: it toggles it itself). */
  opener(): HTMLElement | null;
  sound?(s: UISound): void;
}

export interface GoldList {
  readonly el: HTMLElement;
  readonly open: boolean;
  /** Open it (or bring it up to date). */
  show(): void;
  /** Bring it up to date: found, followed (nothing while shut). */
  refresh(): void;
  close(): void;
  /** Checks: the focus ring on a row. */
  ring(id: string): void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const PLACE_IDS = new Set<string>(PLACES.map((p) => p.id));

/** Where to look, in the language: a temple's name, or the area's words. */
export const areaText = (d: GoldDef): string => (PLACE_IDS.has(d.area) ? placeText(PLACES.find((p) => p.id === (d.area as PlaceId))!).name : t(d.area as WordKey));
/** The name at the head of a row ("Golden apsara"; English only has capitals). */
const nameText = (d: GoldDef): string => {
  const s = t(d.name);
  return lang() === 'en' ? s.charAt(0).toUpperCase() + s.slice(1) : s;
};

/** A pin (Show on map), a tick (found), a cross (close), a star (all found): 16 × 16 pixel art. */
const PIN_ICON = `<svg class="tgl-bi" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" d="M6 1h4v1h1v1h1v4h-1v2h-1v2H9v2H7v-2H6V9H5V7H4V3h1V2h1zM7 4v2h2V4z"/><path fill="currentColor" opacity="0.45" d="M5 14h6v1H5z"/></svg>`;
const TICK_ICON = `<svg class="tgl-tick" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" d="M12 3h2v2h-1v2h-1v2h-1v2h-1v2H8v-1H7v-1H6v-1H5V9H3V7h3v1h1v1h1v1h1V8h1V6h1V4h1z"/></svg>`;
const X_ICON = `<svg class="tgl-x-icon" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" d="M3 3h2v1h1v1h1v1h2V5h1V4h1V3h2v2h-1v1h-1v1h-1v2h1v1h1v1h1v2h-2v-1h-1v-1H9v-1H7v1H6v1H5v1H3v-2h1v-1h1V9h1V7H5V6H4V5H3z"/></svg>`;
const STAR_ICON = `<svg class="tgl-star" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" d="M7 1h2v3h1v2h2v1h3v2h-3v1h-2v2H9v3H7v-3H6v-2H4V9H1V7h3V6h2V4h1z"/><path fill="#fff6d6" d="M7 7h2v2H7z"/></svg>`;

export function createGoldList(d: GoldListDeps): GoldList {
  injectStyle();
  const el = document.createElement('section');
  el.className = 'tgl mu-frame mu-md';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-labelledby', 'tgl-title');
  el.tabIndex = -1;
  el.inert = true;
  el.innerHTML = `<span class="mu-bg"></span>
    <header class="tgl-head">${goldIcon('tgl-head-icon')}<div class="tgl-head-text"><h2 id="tgl-title"></h2><p class="tgl-count"></p></div>
      <button type="button" class="tgl-x">${X_ICON}<kbd data-pad="east">Esc</kbd></button></header>
    <div class="tgl-pips" aria-hidden="true"></div>
    <p class="tgl-all" hidden>${STAR_ICON}<span></span>${STAR_ICON}</p>
    <div class="tgl-body"></div>
    <footer class="tgl-foot"></footer>`;
  d.layer.append(el);
  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const title = q('#tgl-title');
  const countEl = q('.tgl-count');
  const pips = q('.tgl-pips');
  const all = q('.tgl-all');
  const body = q('.tgl-body');
  const foot = q('.tgl-foot');
  const xBtn = q<HTMLButtonElement>('.tgl-x');

  let open = false;
  /** The rows' layout as last built (which are found): rebuilt only when it changes; the texts are written in place. */
  let built = '';
  let padClose: (() => void) | null = null;

  /** The buttons in reading order: the rows not found yet, then the ×. */
  const buttons = () => [...el.querySelectorAll<HTMLButtonElement>('.tgl-row[data-go]')];
  /** Where the focus starts: the row followed, else the first not found yet, else the ×. */
  const first = (): HTMLElement => {
    const id = d.tracked();
    return (id ? el.querySelector<HTMLElement>(`.tgl-row[data-go][data-id="${CSS.escape(id)}"]`) : null) ?? buttons()[0] ?? xBtn;
  };

  function build(rows: readonly GoldRow[]): void {
    const at = document.activeElement instanceof HTMLElement && el.contains(document.activeElement) ? document.activeElement : null;
    const keep = at?.closest<HTMLElement>('.tgl-row')?.dataset.id;
    const marked = !!at?.classList.contains('pad-focus');
    body.innerHTML = rows
      .map(({ def, found }) => {
        const id = esc(def.id);
        if (found)
          return `<div class="tgl-row is-found" data-id="${id}"><span class="tgl-art">${goldArt(def.id, true)}</span>
            <span class="tgl-txt"><b class="tgl-name"></b><span class="tgl-where"></span></span><span class="tgl-ok">${TICK_ICON}</span></div>`;
        return `<button type="button" class="tgl-row" data-id="${id}" data-go aria-pressed="false"><span class="tgl-bg"></span><span class="tgl-art">${goldArt(def.id, false)}</span>
          <span class="tgl-txt"><b class="tgl-area"></b><span class="tgl-clue"></span></span><span class="tgl-go">${PIN_ICON}<span class="tgl-go-t"></span></span></button>`;
      })
      .join('');
    pips.innerHTML = rows.map(({ found }) => `<i${found ? ' class="is-on"' : ''}></i>`).join('');
    // (keep the focus on the same row when it is rebuilt; a row just found: the next one)
    if (keep) {
      const to = el.querySelector<HTMLElement>(`.tgl-row[data-go][data-id="${CSS.escape(keep)}"]`) ?? (open ? first() : null);
      if (to) {
        if (marked) markFocus(to);
        else to.focus({ preventScroll: true });
      }
    }
  }

  function texts(rows: readonly GoldRow[]): void {
    const set = (e: Element | null, s: string) => {
      if (e && e.textContent !== s) e.textContent = s;
    };
    el.lang = lang();
    const n = rows.filter((r) => r.found).length;
    const total = rows.length;
    set(title, t('tgListTitle'));
    set(countEl, t('tgListCount', { n: num(n), total: num(total) }));
    const done = total > 0 && n >= total;
    all.hidden = !done;
    el.classList.toggle('is-all', done);
    set(all.querySelector('span'), t('tgListAll', { total: num(total) }));
    set(foot, done ? t('tgListSub') : `${t('tgListSub')} ${t('tgListFoot')}`);
    foot.hidden = done;
    xBtn.setAttribute('aria-label', t('tgListClose'));
    xBtn.title = `${t('tgListClose')} (Esc)`;
    const tracked = d.tracked();
    for (const { def, found } of rows) {
      const row = body.querySelector<HTMLElement>(`.tgl-row[data-id="${CSS.escape(def.id)}"]`);
      if (!row) continue;
      if (found) {
        set(row.querySelector('.tgl-name'), nameText(def));
        set(row.querySelector('.tgl-where'), areaText(def));
        row.setAttribute('aria-label', `${nameText(def)}: ${t('tgListFound')} · ${areaText(def)}`);
        continue;
      }
      const on = def.id === tracked;
      row.classList.toggle('is-on', on);
      row.setAttribute('aria-pressed', String(on));
      set(row.querySelector('.tgl-area'), areaText(def));
      set(row.querySelector('.tgl-clue'), t(def.clue));
      set(row.querySelector('.tgl-go-t'), t(on ? 'tgListShown' : 'tgListShow'));
      row.setAttribute('aria-label', `${t('tgListHidden')}. ${areaText(def)}: ${t(def.clue)} ${t(on ? 'tgListShown' : 'tgListShow')}`);
    }
  }

  function render(): void {
    const rows = d.rows();
    const key = rows.map((r) => (r.found ? 1 : 0)).join('');
    if (key !== built) {
      built = key;
      build(rows);
    }
    texts(rows);
  }

  body.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.tgl-row[data-go]');
    const id = b?.dataset.id;
    if (!b || !id) return;
    d.onTrack(id);
  });
  xBtn.addEventListener('click', () => {
    xBtn.blur();
    shut();
  });
  // (a tap or a click on the view outside it shuts it; on its opener, the opener's own click toggles it)
  addEventListener(
    'pointerdown',
    (e) => {
      // (not while a bug report picks what is on the screen, nor on its button and panel)
      if (!open || document.body.classList.contains('reporting')) return;
      const tg = e.target as Node | null;
      if (!tg || el.contains(tg) || d.opener()?.contains(tg)) return;
      if ((tg as Element).closest?.('.fb-button, .fb-panel')) return;
      shut();
    },
    true,
  );

  // ── Keys: its own while open (before the roaming keys) ──
  addEventListener(
    'keydown',
    (e) => {
      if (!open || e.ctrlKey || e.metaKey || e.altKey || document.body.classList.contains('reporting')) return;
      const tg = e.target as HTMLElement | null;
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
      // (a bug report, B, still works; M has the big map: index.ts shuts this then)
      if (e.code === 'KeyB' || e.code === 'KeyM') return;
      const at = document.activeElement instanceof HTMLElement && el.contains(document.activeElement) && document.activeElement !== el ? document.activeElement : null;
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!e.repeat) shut();
        return;
      }
      if (e.key.startsWith('Arrow')) {
        // (the pad's arrows, not trusted, move its own ring: nav.ts)
        if (!e.isTrusted) return;
        e.preventDefault();
        const dir = e.key === 'ArrowUp' ? 'up' : e.key === 'ArrowDown' ? 'down' : e.key === 'ArrowLeft' ? 'left' : 'right';
        const to = at ? moveFocusIn(el, at, dir) : first();
        if (to && to !== at) {
          to.focus({ preventScroll: true });
          to.scrollIntoView({ block: 'nearest' });
          d.sound?.('hover');
        }
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const list = [...buttons(), xBtn];
        const i = at ? list.indexOf(at as HTMLButtonElement) : -1;
        const to = list[(i < 0 ? (e.shiftKey ? list.length - 1 : 0) : i + (e.shiftKey ? -1 : 1) + list.length) % list.length];
        to.focus({ preventScroll: true });
        to.scrollIntoView({ block: 'nearest' });
        return;
      }
      // (Enter and Space press the button in focus; the pad's ✕, not trusted, also puts its ring on the first row when none
      // has it: nav.ts; the keyboard's with none in focus does nothing)
      if ((e.key === 'Enter' || e.key === ' ') && (at instanceof HTMLButtonElement || !e.isTrusted)) return;
      e.preventDefault();
    },
    { capture: true },
  );
  // (the ring scrolls the row into view: the keys, the pad)
  el.addEventListener('focusin', (e) => {
    if (e.target !== el) (e.target as HTMLElement).scrollIntoView?.({ block: 'nearest' });
  });
  onLang(() => {
    if (open) render();
  });

  function shut(): void {
    if (!open) return;
    open = false;
    el.classList.remove('is-on');
    document.body.classList.remove('tg-list-on');
    padClose?.();
    padClose = null;
    if (el.querySelector('.pad-focus')) clearMark();
    // (the focus leaves it, so Space and Enter are his again)
    if (document.activeElement instanceof HTMLElement && el.contains(document.activeElement)) document.activeElement.blur();
    el.inert = true;
    d.sound?.('close');
    d.onClose();
  }

  return {
    el,
    get open() {
      return open;
    },
    show() {
      render();
      if (open) return;
      open = true;
      el.inert = false;
      el.classList.add('is-on');
      document.body.classList.add('tg-list-on');
      d.sound?.('open');
      // (the row followed in view, else the top)
      const to = first();
      body.scrollTop = 0;
      if (to !== xBtn) to.scrollIntoView({ block: 'nearest' });
      padClose = pad.openLayer(el, { first, back: shut });
      if (pad.active) (document.activeElement as HTMLElement | null)?.blur?.();
      else el.focus({ preventScroll: true });
    },
    refresh() {
      if (open) render();
    },
    close: shut,
    ring(id) {
      const b = el.querySelector<HTMLElement>(`.tgl-row[data-id="${CSS.escape(id)}"]`);
      if (b) b.classList.add('is-ring');
    },
  };
}

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  style.textContent = `
    /* The list: down the left, under the gold counter. */
    .rh > .tgl { left: calc(24 * var(--px)); top: calc(116 * var(--px)); width: calc(430 * var(--px)); max-height: calc(100vh - 140 * var(--px)); box-sizing: border-box;
      flex-direction: column; align-items: stretch; gap: calc(8 * var(--px)); padding: calc(13 * var(--px)) calc(10 * var(--px)) calc(10 * var(--px)) calc(14 * var(--px));
      pointer-events: auto; outline: none; color: var(--mu-ink2); --mu-edge: rgba(255, 208, 112, 0.55); --tgl-shape: ${steppedShape(6, 3)}; --tgl-ring: ${steppedRing(6, 3, 1.5)};
      opacity: 0; visibility: hidden; transform: translateY(calc(-8 * var(--px))); transition: opacity 0.2s, transform 0.3s var(--mu-ease), visibility 0s 0.3s; }
    .rh > .tgl.is-on { opacity: 1; visibility: visible; transform: none; transition: opacity 0.25s, transform 0.4s var(--mu-ease), visibility 0s; }
    .tgl > .mu-bg { backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
    .tgl.is-all { --mu-edge: rgba(255, 224, 140, 0.9); }
    .tgl-head { display: flex; align-items: center; gap: calc(10 * var(--px)); padding-right: calc(2 * var(--px)); }
    .tgl-head-icon { flex: none; width: calc(30 * var(--px)); height: calc(30 * var(--px)); filter: drop-shadow(0 0 calc(6 * var(--px)) rgba(255, 196, 80, 0.45)) drop-shadow(0 calc(1.5 * var(--px)) 0 rgba(0, 0, 0, 0.4)); }
    .tgl-head-text { flex: 1; min-width: 0; }
    .tgl-head h2 { margin: 0; font: 700 calc(20 * var(--px)) / 1.15 var(--mu-display); color: var(--mu-ink); letter-spacing: 0.01em; text-shadow: 0 calc(2 * var(--px)) 0 rgba(0, 0, 0, 0.3); }
    .tgl-count { margin: calc(3 * var(--px)) 0 0; font: 700 calc(13.5 * var(--px)) / 1.25 var(--mu-font); color: var(--mu-gold-hi); }
    .tgl-x { align-self: flex-start; display: flex; align-items: center; gap: calc(6 * var(--px)); min-height: calc(30 * var(--px)); padding: calc(4 * var(--px)) calc(5 * var(--px)) calc(4 * var(--px)) calc(6 * var(--px));
      border: 0; border-radius: calc(6 * var(--px)); background: none; color: var(--mu-ink2); cursor: pointer; outline: none; touch-action: manipulation; transition: color 0.2s, background 0.2s; }
    .tgl-x-icon { width: calc(15 * var(--px)); height: calc(15 * var(--px)); }
    .tgl-x kbd { min-width: 0; height: calc(19 * var(--px)); font-size: calc(11.5 * var(--px)); color: var(--mu-ink2); }
    .tgl-x kbd.is-pad { font-size: calc(14 * var(--px)); }
    .tgl-x:hover { color: var(--mu-ink); background: rgba(255, 255, 255, 0.07); }
    .tgl-x:focus-visible { outline: 2px solid rgba(255, 244, 214, 0.95); outline-offset: 2px; }
    .tgl-pips { display: flex; gap: calc(4 * var(--px)); padding: 0 calc(2 * var(--px)); }
    .tgl-pips i { flex: 1; max-width: calc(22 * var(--px)); height: calc(5 * var(--px)); border-radius: calc(2 * var(--px)); background: rgba(255, 244, 222, 0.12); box-shadow: inset 0 0 0 1px rgba(255, 229, 188, 0.12); }
    .tgl-pips i.is-on { background: linear-gradient(#ffe89a, #e2a93b); box-shadow: 0 0 calc(5 * var(--px)) rgba(255, 190, 60, 0.6); }
    .tgl-all { display: flex; align-items: center; gap: calc(8 * var(--px)); margin: 0; padding: calc(7 * var(--px)) calc(10 * var(--px)); border-radius: calc(6 * var(--px));
      background: rgba(58, 40, 10, 0.78); box-shadow: inset 0 0 0 1px rgba(255, 213, 74, 0.6), 0 0 calc(14 * var(--px)) rgba(255, 180, 40, 0.3);
      font: 700 calc(14 * var(--px)) / 1.35 var(--mu-font); color: var(--mu-gold-hi); }
    .tgl-all[hidden] { display: none; }
    .tgl-all span { flex: 1; text-align: center; }
    .tgl-star { flex: none; width: calc(14 * var(--px)); height: calc(14 * var(--px)); color: #ffd54a; animation: tgl-twinkle 1.8s ease-in-out infinite; }
    .tgl-star:last-child { animation-delay: 0.9s; }
    @keyframes tgl-twinkle { 0%, 100% { transform: scale(0.8); opacity: 0.7; } 50% { transform: scale(1.15); opacity: 1; } }
    /* (a column, not a grid: a grid's rows would shrink to their least height in a box shorter than they are) */
    .tgl-body { display: flex; flex-direction: column; gap: calc(5 * var(--px)); min-height: 0; overflow: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: var(--mu-line) transparent;
      margin: 0 calc(-4 * var(--px)); padding: calc(2 * var(--px)) calc(8 * var(--px)) calc(2 * var(--px)) calc(4 * var(--px)); }
    .tgl-row { position: relative; flex: none; display: grid; grid-template-columns: calc(46 * var(--px)) minmax(0, 1fr) auto; align-items: center; gap: calc(10 * var(--px));
      min-height: calc(56 * var(--px)); padding: calc(5 * var(--px)) calc(8 * var(--px)) calc(5 * var(--px)) calc(6 * var(--px)); isolation: isolate; text-align: left; box-sizing: border-box; }
    button.tgl-row { width: 100%; border: 0; background: none; cursor: pointer; outline: none; color: inherit; font: inherit; touch-action: manipulation; transition: transform 0.2s var(--mu-ease); }
    .tgl-row::before { content: ''; position: absolute; inset: 0; z-index: -2; clip-path: var(--tgl-shape); background: rgba(255, 244, 222, 0.035); transition: background 0.2s; }
    .tgl-bg { position: absolute; inset: 0; z-index: -1; clip-path: var(--tgl-ring); background: transparent; transition: background 0.2s; pointer-events: none; }
    button.tgl-row:hover::before { background: rgba(255, 244, 222, 0.09); }
    button.tgl-row:hover .tgl-bg { background: var(--mu-line-hi); }
    button.tgl-row:focus-visible::before, button.tgl-row.is-ring::before { background: rgba(58, 44, 20, 0.7); }
    button.tgl-row:focus-visible .tgl-bg, button.tgl-row.is-ring .tgl-bg { background: rgba(255, 244, 214, 0.95); }
    button.tgl-row:active { transform: scale(0.985); }
    .tgl-row.is-on::before { background: rgba(58, 44, 20, 0.62); box-shadow: inset 0 0 calc(14 * var(--px)) rgba(255, 176, 40, 0.2); }
    .tgl-row.is-on .tgl-bg { background: var(--mu-gold-hi); }
    .tgl-row.is-found::before { background: rgba(58, 44, 20, 0.42); }
    .tgl-art { display: grid; place-items: center; width: calc(46 * var(--px)); height: calc(46 * var(--px)); border-radius: 50%; background: rgba(10, 18, 30, 0.72);
      box-shadow: inset 0 0 0 calc(1.5 * var(--px)) rgba(255, 236, 200, 0.22); }
    .tgl-row.is-found .tgl-art { background: radial-gradient(closest-side, rgba(255, 210, 110, 0.32), rgba(58, 38, 8, 0.94)); box-shadow: inset 0 0 0 calc(2 * var(--px)) #ffd54a, 0 0 calc(10 * var(--px)) rgba(255, 180, 40, 0.4); }
    .tgl-row.is-on .tgl-art { box-shadow: inset 0 0 0 calc(2 * var(--px)) rgba(255, 213, 74, 0.85); }
    .tgl-svg { display: block; height: calc(36 * var(--px)); width: auto; max-width: calc(40 * var(--px)); }
    .tgl-sil { fill: #0b121c; }
    .tgl-row:not(.is-found) .tgl-svg { filter: drop-shadow(0 0 calc(0.8 * var(--px)) rgba(255, 214, 120, 0.85)) drop-shadow(0 0 calc(4 * var(--px)) rgba(255, 190, 80, 0.3)); }
    .tgl-row.is-found .tgl-svg { filter: drop-shadow(0 calc(1 * var(--px)) 0 rgba(40, 22, 4, 0.7)); }
    .tgl-txt { display: grid; gap: calc(1 * var(--px)); min-width: 0; }
    .tgl-area, .tgl-name { font: 700 calc(14.5 * var(--px)) / 1.25 var(--mu-font); color: var(--mu-ink); }
    .tgl-name { color: var(--mu-gold-hi); }
    .tgl-clue { font-size: calc(12.5 * var(--px)); line-height: 1.32; color: var(--mu-ink2); }
    .tgl-where { font-size: calc(12.5 * var(--px)); line-height: 1.3; color: var(--mu-sand); }
    .tgl-go { display: flex; align-items: center; gap: calc(5 * var(--px)); max-width: calc(108 * var(--px)); padding: calc(4 * var(--px)) calc(8 * var(--px)) calc(4 * var(--px)) calc(6 * var(--px));
      border-radius: calc(5 * var(--px)); background: rgba(255, 244, 222, 0.07); box-shadow: inset 0 0 0 1px rgba(255, 229, 188, 0.18);
      font: 700 calc(11.5 * var(--px)) / 1.2 var(--mu-font); color: var(--mu-ink2); transition: color 0.2s, background 0.2s; }
    .tgl-bi { flex: none; width: calc(14 * var(--px)); height: calc(14 * var(--px)); }
    button.tgl-row:hover .tgl-go, button.tgl-row:focus-visible .tgl-go, button.tgl-row.is-ring .tgl-go { color: var(--mu-ink); background: rgba(255, 244, 222, 0.13); }
    .tgl-row.is-on .tgl-go { color: #2a1804; background: linear-gradient(#ffe89a, #f0b640); box-shadow: 0 0 calc(8 * var(--px)) rgba(255, 180, 40, 0.5); }
    .tgl-ok { display: grid; place-items: center; width: calc(26 * var(--px)); height: calc(26 * var(--px)); border-radius: 50%; background: rgba(58, 38, 8, 0.94); color: #ffd54a;
      box-shadow: inset 0 0 0 calc(1.5 * var(--px)) rgba(255, 213, 74, 0.7); }
    .tgl-tick { width: calc(15 * var(--px)); height: calc(15 * var(--px)); }
    .tgl-foot { padding-top: calc(7 * var(--px)); border-top: 1px solid var(--mu-line); font-size: calc(12.5 * var(--px)); color: var(--mu-dim); line-height: 1.35; }
    .tgl-foot[hidden] { display: none; }
    /* (Khmer letters look smaller and stack signs above and below: map.css) */
    :lang(km) .tgl-head h2 { letter-spacing: 0; line-height: 1.35; }
    :lang(km) .tgl-count { font-size: calc(14.5 * var(--px)); line-height: 1.45; }
    :lang(km) .tgl-area, :lang(km) .tgl-name { font-size: calc(15.5 * var(--px)); line-height: 1.45; }
    :lang(km) .tgl-clue, :lang(km) .tgl-where, :lang(km) .tgl-foot { font-size: calc(13.5 * var(--px)); line-height: 1.5; }
    :lang(km) .tgl-go { font-size: calc(12.5 * var(--px)); line-height: 1.35; }
    :lang(km) .tgl-all { font-size: calc(14.5 * var(--px)); line-height: 1.5; }
    /* (while it is open: the counter's neighbours step aside, the key help goes, on touch the stick, the buttons and the tool bar) */
    body.tg-list-on .rh > .by-purse, body.tg-list-on .rh-help { opacity: 0 !important; visibility: hidden !important; }
    body.tg-list-on.roam-touch .rt, body.tg-list-on.roam-touch .rtb-wrap { display: none !important; }
    body.tg-list-on .rtb-keys, body.tg-list-on .rxm { display: none !important; }
    body.roam-touch .tgl kbd { display: none; }
    body.pad-on .tgl kbd { display: inline-grid; }
    .mu-calm ~ .rh > .tgl { transform: none !important; }
    .mu-calm ~ .rh .tgl-star { animation: none; }
    /* A phone held upright (or any narrow view): a sheet along the bottom; each row's button under its words. */
    @media (max-width: 639px) {
      .rh > .tgl { left: 10px; right: 10px; top: auto; bottom: 10px; width: auto; max-height: min(74vh, calc(100dvh - 120px)); padding: 12px 8px 10px 12px; transform: translateY(12px); }
      .rh > .tgl.is-on { transform: none; }
      .tgl-head h2 { font-size: 19px; }
      .tgl-x { min-width: 44px; min-height: 44px; justify-content: center; margin: -6px -2px -6px 0; }
      .tgl-row { grid-template-columns: 44px minmax(0, 1fr); grid-template-rows: auto auto; row-gap: 5px; min-height: 64px; padding: 7px 8px 8px 6px; }
      .tgl-row .tgl-art { grid-row: 1 / span 2; align-self: start; width: 44px; height: 44px; }
      .tgl-svg { height: 34px; max-width: 38px; }
      .tgl-go { grid-column: 2; justify-self: start; max-width: none; min-height: 28px; padding: 3px 10px 3px 7px; }
      .tgl-ok { position: absolute; right: 8px; top: 8px; }
      .tgl-row.is-found { min-height: 56px; padding-right: 40px; }
      .tgl-row.is-found .tgl-art { grid-row: 1 / span 2; }
    }
    /* A phone on its side: down the left, as tall as the view. */
    @media (max-height: 500px) {
      .rh > .tgl { left: 8px; top: 8px; bottom: 8px; right: auto; width: min(450px, 58vw); max-height: none; padding: 9px 7px 8px 11px; gap: 6px; transform: translateX(-10px); }
      .rh > .tgl.is-on { transform: none; }
      .tgl-head-icon { width: 24px; height: 24px; }
      .tgl-head h2 { font-size: 17px; }
      .tgl-count { margin-top: 1px; }
      .tgl-x { min-width: 44px; min-height: 44px; justify-content: center; margin: -6px -2px -6px 0; }
      .tgl-row { min-height: 52px; padding: 4px 8px 4px 5px; }
      .tgl-foot { display: none; }
    }
    /* (a very short view: the pips go, the count says it) */
    @media (max-height: 360px) {
      .tgl-pips { display: none; }
    }`;
  document.head.append(style);
}
