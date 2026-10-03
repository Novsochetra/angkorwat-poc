import type { CalendarEvent } from '../calendar';
import { clearMark, markFocus, moveFocusIn } from '../pad/nav';
import { pad } from '../pad/pad';
import type { UISound } from '../types';
import { onLang, t, type WordKey } from '../ui/lang';
import { steppedRing, steppedShape } from '../ui/shape';
import { calendarSvg, eventSvg } from './_calendarIcons';

/**
 * The calendar card while roaming (roam/_calendar.ts opens it: key 9, its
 * button under the mini-map, the explorer menu's Calendar; the game pad's
 * △ → Calendar), in the look of the map's panels (map.css: a dark panel with
 * stepped corners and a warm edge, gold for what to do; the buy menu's,
 * _shopMenu.ts): its title, the map's moment under it (the part of the day,
 * the season, the moon's day), then
 *
 * - **Now**: what is on (where, until when);
 * - **Today**: the day's moments still to come, each with its time of day
 *   and how long until it in play ("at dawn · in 3 min");
 * - **Festivals ahead**: in how many days of the map (about how long in
 *   play), and the next days in real life (the Khmer calendar);
 * - **Seasons**: rice planting, the harvest, the kites, when not today.
 *
 * Each row: its picture (_calendarIcons.ts), name, when, where; **Show on
 * map** (the mini-map's target) and **Wait for it** (the time skips to just
 * before it, while the Time setting is Cycle). While the time stands still a
 * line at the foot says so and where to change it.
 *
 * Keys while open (its own: a capture listener, the roaming keys never see
 * them): ↑ ↓ ← → between the buttons, Enter or Space presses one, 9 or Esc
 * (or the ×) shuts it; a push of W A S D walks away (roam/_calendar.ts). The
 * game pad: a layer (pad.openLayer) while open: the stick or the d-pad move
 * the ring, ✕ presses, ○ shuts. Touch: a tap outside shuts it. Shut, the
 * focus leaves it (Space is the jump again).
 */

export interface CardRow {
  e: CalendarEvent;
  /** "at dawn · in 3 min". */
  when: string;
  /** The real-life line (festivals), or ''. */
  real: string;
  /** Dimmed (it waits for the clock to run). */
  muted: boolean;
  /** Show on map: none (nowhere on the map), off, or on (it is the target now). */
  show: 'none' | 'off' | 'on';
  /** A "Wait for it" button. */
  wait: boolean;
}

export interface CardSection {
  key: 'now' | 'today' | 'ahead' | 'seasons';
  title: WordKey;
  /** Said when it has no rows (null: the section is left out then). */
  empty: WordKey | null;
  rows: CardRow[];
}

export interface CardModel {
  /** The map's moment (under the title). */
  moment: string;
  /** The time stands still: the line that says so (null: it runs). */
  held: string | null;
  sections: CardSection[];
}

export interface CalendarCard {
  readonly el: HTMLElement;
  readonly open: boolean;
  /** Open it (or bring it up to date). */
  show(m: CardModel): void;
  /** Bring it up to date (only what changed; nothing while shut). */
  update(m: CardModel): void;
  close(): void;
  /** Checks: the focus ring on a row's button (`show` or `wait`). */
  focus(id: string, act: 'show' | 'wait'): void;
}

export interface CardDeps {
  layer: HTMLElement;
  onShow(id: string): void;
  onWait(id: string): void;
  onClose(): void;
  sound?(s: UISound): void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const SHOT = new URLSearchParams(location.search).get('shot') === '1';
/** A day's moment waiting this long to be said (ms) is dropped. */
const STALE = 12_000;

/** A pin (Show on map) and an hourglass (Wait for it), 16 × 16 pixel art. */
const PIN_ICON = `<svg class="wh-bi" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" d="M6 1h4v1h1v1h1v4h-1v2h-1v2H9v2H7v-2H6V9H5V7H4V3h1V2h1zM7 4v2h2V4z"/><path fill="currentColor" opacity="0.45" d="M5 14h6v1H5z"/></svg>`;
const WAIT_ICON = `<svg class="wh-bi" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" d="M3 1h10v2h-1v2h-1v1h-1v1H9v2h1v1h1v1h1v2h1v2H3v-2h1v-2h1v-1h1V9h1V7H6V6H5V5H4V3H3z"/><path fill="#0d1927" opacity="0.6" d="M5 3h6v1H5zM6 12h4v1H6z"/></svg>`;
const X_ICON = `<svg class="wh-x-icon" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" d="M3 3h2v1h1v1h1v1h2V5h1V4h1V3h2v2h-1v1h-1v1h-1v2h1v1h1v1h1v2h-2v-1h-1v-1H9v-1H7v1H6v1H5v1H3v-2h1v-1h1V9h1V7H5V6H4V5H3z"/></svg>`;

export function createCalendarCard(d: CardDeps): CalendarCard {
  injectStyle();
  const el = document.createElement('section');
  el.className = 'wh-card mu-frame mu-md';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-labelledby', 'wh-title');
  el.inert = true;
  el.innerHTML = `<span class="mu-bg"></span>
    <header class="wh-head">${calendarSvg('wh-head-icon')}<div class="wh-head-text"><h2 id="wh-title"></h2><p class="wh-moment"></p></div>
      <button type="button" class="wh-x">${X_ICON}<kbd data-pad="east">Esc</kbd></button></header>
    <div class="wh-body"></div>
    <footer class="wh-foot"></footer>`;
  d.layer.append(el);
  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const title = q('#wh-title');
  const moment = q('.wh-moment');
  const body = q('.wh-body');
  const foot = q('.wh-foot');
  const xBtn = q<HTMLButtonElement>('.wh-x');

  let open = false;
  let model: CardModel | null = null;
  /** The rows' layout as last built (rebuilt only when it changes); the texts are written in place. */
  let built = '';
  let padClose: (() => void) | null = null;

  const words = () => {
    title.textContent = t('whenTitle');
    xBtn.setAttribute('aria-label', t('whenClose'));
    xBtn.title = `${t('whenClose')} (Esc)`;
  };
  words();

  /** The layout's key: the sections, their rows and their buttons (what needs new markup). */
  const layoutOf = (m: CardModel) => m.sections.map((s) => `${s.key}:${s.rows.map((r) => `${r.e.id}.${r.show}.${r.wait ? 1 : 0}.${r.muted ? 1 : 0}.${r.real ? 1 : 0}`).join(',')}`).join('|') + (m.held ? '|held' : '');

  function build(m: CardModel): void {
    // (keep the focus on the same button when it is rebuilt)
    const at = document.activeElement instanceof HTMLElement && el.contains(document.activeElement) ? document.activeElement : null;
    const keep = at?.closest<HTMLElement>('.wh-row')?.dataset.id;
    const keepAct = at?.dataset.act;
    const marked = !!at?.classList.contains('pad-focus');
    body.innerHTML = m.sections
      .filter((s) => s.rows.length || s.empty)
      .map(
        (s) => `<section class="wh-sec" data-sec="${s.key}"><h3>${esc(t(s.title))}</h3>${
          s.rows.length
            ? s.rows
                .map(
                  (r) => `<div class="wh-row${r.muted ? ' is-muted' : ''}${s.key === 'now' ? ' is-now' : ''}" data-id="${esc(r.e.id)}">
              <span class="wh-ico">${eventSvg(r.e, 'wh-icon')}</span>
              <div class="wh-txt"><b class="wh-name"></b><span class="wh-when"></span><span class="wh-where"></span>${r.real ? '<span class="wh-real"></span>' : ''}</div>
              <div class="wh-acts">${r.show !== 'none' ? `<button type="button" class="wh-b wh-show${r.show === 'on' ? ' is-on' : ''}" data-act="show" aria-pressed="${r.show === 'on'}"><span class="wh-bg"></span>${PIN_ICON}<span class="wh-bt"></span></button>` : ''}${
                r.wait ? `<button type="button" class="wh-b wh-wait" data-act="wait"><span class="wh-bg"></span>${WAIT_ICON}<span class="wh-bt"></span></button>` : ''
              }</div></div>`,
                )
                .join('')
            : `<p class="wh-empty">${esc(t(s.empty!))}</p>`
        }</section>`,
      )
      .join('');
    if (keep) {
      const to = body.querySelector<HTMLElement>(`.wh-row[data-id="${CSS.escape(keep)}"] [data-act="${keepAct}"]`) ?? body.querySelector<HTMLElement>(`.wh-row[data-id="${CSS.escape(keep)}"] .wh-b`);
      if (to) {
        if (marked) markFocus(to);
        else to.focus({ preventScroll: true });
      }
    }
  }

  /** The texts of every row (written only when they change). */
  function texts(m: CardModel): void {
    const set = (e: Element | null, s: string) => {
      if (e && e.textContent !== s) e.textContent = s;
    };
    set(moment, m.moment);
    set(foot, m.held ?? t('whenFoot'));
    foot.classList.toggle('is-held', !!m.held);
    for (const s of m.sections)
      for (const r of s.rows) {
        const row = body.querySelector(`.wh-row[data-id="${CSS.escape(r.e.id)}"]`);
        if (!row) continue;
        set(row.querySelector('.wh-name'), t(r.e.name));
        set(row.querySelector('.wh-when'), r.when);
        set(row.querySelector('.wh-where'), r.e.place ? t(r.e.place) : '');
        set(row.querySelector('.wh-real'), r.real);
        const show = row.querySelector<HTMLButtonElement>('.wh-show');
        if (show) {
          set(show.querySelector('.wh-bt'), t(r.show === 'on' ? 'whenShown' : 'whenShow'));
          show.title = `${t(r.e.name)}: ${t(r.show === 'on' ? 'whenShown' : 'whenShow')}`;
          show.setAttribute('aria-label', show.title);
        }
        const wait = row.querySelector<HTMLButtonElement>('.wh-wait');
        if (wait) {
          set(wait.querySelector('.wh-bt'), t('whenWait'));
          wait.title = `${t(r.e.name)}: ${t('whenWait')}`;
          wait.setAttribute('aria-label', wait.title);
        }
      }
  }

  function render(m: CardModel): void {
    model = m;
    const key = layoutOf(m);
    if (key !== built) {
      built = key;
      build(m);
    }
    texts(m);
  }

  /** The buttons in the card, in reading order (the pad's first: the first row's first button). */
  const buttons = () => [...el.querySelectorAll<HTMLButtonElement>('.wh-b')];

  body.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.wh-b');
    const id = b?.closest<HTMLElement>('.wh-row')?.dataset.id;
    if (!b || !id) return;
    if (b.dataset.act === 'show') d.onShow(id);
    else d.onWait(id);
  });
  xBtn.addEventListener('click', () => {
    xBtn.blur();
    d.onClose();
  });
  // (touch: a tap on the view outside the card shuts it, as the buy menu)
  addEventListener(
    'pointerdown',
    (e) => {
      if (!open || e.pointerType !== 'touch' || el.contains(e.target as Node) || (e.target as Element | null)?.closest?.('.wh-btn')) return;
      d.onClose();
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
      const at = document.activeElement instanceof HTMLElement && el.contains(document.activeElement) ? document.activeElement : null;
      if (e.code === 'Escape' || e.code === 'Digit9' || e.code === 'Numpad9') {
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) d.onClose();
        return;
      }
      if (e.key.startsWith('Arrow')) {
        // (the pad's arrows, not trusted, move its own ring: nav.ts)
        if (!e.isTrusted) return;
        e.preventDefault();
        e.stopPropagation();
        const dir = e.key === 'ArrowUp' ? 'up' : e.key === 'ArrowDown' ? 'down' : e.key === 'ArrowLeft' ? 'left' : 'right';
        const to = at ? moveFocusIn(el, at, dir) : (buttons()[0] ?? null);
        if (to && to !== at) {
          to.focus({ preventScroll: true });
          to.scrollIntoView({ block: 'nearest' });
          d.sound?.('hover');
        }
        return;
      }
      // (Enter and Space press the button in focus: the roaming keys must not also jump or use)
      if ((e.key === 'Enter' || e.key === ' ') && at) e.stopPropagation();
    },
    { capture: true },
  );
  // (the pad's ring scrolls the row into view)
  el.addEventListener('focusin', (e) => (e.target as HTMLElement).scrollIntoView?.({ block: 'nearest' }));
  onLang(() => {
    if (!open || !model) return;
    words();
    built = '';
    render(model);
  });

  return {
    el,
    get open() {
      return open;
    },
    show(m) {
      render(m);
      if (open) return;
      open = true;
      el.inert = false;
      el.classList.add('is-on');
      document.body.classList.add('roam-when');
      body.scrollTop = 0;
      d.sound?.('open');
      padClose = pad.openLayer(el, { first: () => buttons()[0] ?? xBtn, back: () => d.onClose() });
    },
    update(m) {
      if (open) render(m);
    },
    close() {
      if (!open) return;
      open = false;
      el.classList.remove('is-on');
      document.body.classList.remove('roam-when');
      padClose?.();
      padClose = null;
      if (el.querySelector('.pad-focus')) clearMark();
      // (the focus leaves it, so Space and Enter are his again)
      if (document.activeElement instanceof HTMLElement && el.contains(document.activeElement)) document.activeElement.blur();
      el.inert = true;
      d.sound?.('close');
    },
    focus(id, act) {
      const b = body.querySelector<HTMLElement>(`.wh-row[data-id="${CSS.escape(id)}"] [data-act="${act}"]`);
      if (b) b.classList.add('is-ring');
    },
  };
}

/**
 * The calendar's banner as an event begins (or about to, after waiting for it): top centre, under the map's own
 * banners when they show: its picture, a small line ("Now on"), what is happening and where. One at a time, the
 * next waits its turn.
 */
export interface CalendarToast {
  /** `first`: before what waits, and the one showing (a day's moment) gives way to it at once (the event waited for). */
  show(e: CalendarEvent, kicker: string, line: string, place: string, seconds?: number, first?: boolean): void;
  /** Hold the queue (the view is faded out): they show once it is let go. */
  hold(on: boolean): void;
  /** Forget what waits, and put away the one showing (the time jumped: old news). */
  clear(): void;
  update(dt: number): void;
  /** Showing one now (checks). */
  readonly on: boolean;
}

export function createCalendarToast(layer: HTMLElement): CalendarToast {
  injectStyle();
  const el = document.createElement('div');
  el.className = 'wh-toast mu-frame mu-sm';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="mu-bg"></span><span class="mu-glow"></span><span class="wh-toast-ico"></span><span class="wh-toast-text"><em></em><b></b><span></span></span>`;
  layer.append(el);
  const ico = el.querySelector<HTMLElement>('.wh-toast-ico')!;
  const kick = el.querySelector<HTMLElement>('.wh-toast-text em')!;
  const big = el.querySelector<HTMLElement>('.wh-toast-text b')!;
  const where = el.querySelector<HTMLElement>('.wh-toast-text span')!;
  /** What waits its turn, and since when (ms: a day's moment that waited too long is old news). */
  const queue: { e: CalendarEvent; kicker: string; line: string; place: string; at: number; seconds: number }[] = [];
  let left = 0;
  let held = false;
  /** The event of the banner showing (or last shown). */
  let showing: CalendarEvent | null = null;
  const next = () => {
    let n = queue.shift();
    while (n && n.e.kind === 'daily' && performance.now() - n.at > STALE) n = queue.shift();
    if (!n) return;
    showing = n.e;
    ico.innerHTML = eventSvg(n.e, 'wh-toast-icon');
    kick.textContent = n.kicker;
    big.textContent = n.line;
    where.textContent = n.place;
    where.hidden = !n.place;
    el.classList.remove('is-on');
    void el.offsetWidth;
    el.classList.add('is-on');
    left = SHOT ? Infinity : n.seconds;
  };
  return {
    show(e, kicker, line, place, seconds = 5, first = false) {
      // (the same one again while it shows or waits: once)
      if (queue.some((q) => q.e === e && q.line === line) || (left > 0 && big.textContent === line)) return;
      const item = { e, kicker, line, place, at: performance.now(), seconds };
      if (first) {
        queue.unshift(item);
        // (a day's moment showing gives way now)
        if (left > 0 && showing?.kind === 'daily' && showing !== e) left = Math.min(left, 0.01);
      } else queue.push(item);
      if (queue.length > 3) queue.pop();
      if (left <= 0 && !held) next();
    },
    hold(on) {
      held = on;
      if (!on && left <= 0) next();
    },
    clear() {
      queue.length = 0;
      left = 0;
      el.classList.remove('is-on');
    },
    update(dt) {
      if (left > 0 && (left -= dt) <= 0) {
        el.classList.remove('is-on');
        // (a moment between two)
        left = queue.length ? -0.6 : 0;
      } else if (left < 0 && (left += dt) >= 0) {
        left = 0;
        if (!held) next();
      }
    },
    get on() {
      return left > 0;
    },
  };
}

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  style.textContent = `
    .rh > .wh-card { right: calc(28 * var(--px)); top: 50%; left: auto; width: calc(408 * var(--px)); max-height: calc(100vh - 140 * var(--px));
      flex-direction: column; align-items: stretch; gap: calc(8 * var(--px)); padding: calc(14 * var(--px)) calc(10 * var(--px)) calc(10 * var(--px)) calc(14 * var(--px));
      pointer-events: auto; color: var(--mu-ink2); --mu-edge: rgba(255, 208, 112, 0.55); --wh-shape: ${steppedShape(6, 3)}; --wh-ring: ${steppedRing(6, 3, 1.5)};
      opacity: 0; visibility: hidden; transform: translate(calc(10 * var(--px)), -50%); transition: opacity 0.2s, transform 0.3s var(--mu-ease), visibility 0s 0.3s; }
    .rh > .wh-card.is-on { opacity: 1; visibility: visible; transform: translate(0, -50%); transition: opacity 0.25s, transform 0.4s var(--mu-ease), visibility 0s; }
    .wh-card > .mu-bg { backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
    .wh-head { display: flex; align-items: center; gap: calc(10 * var(--px)); padding-right: calc(4 * var(--px)); }
    .wh-head-icon { flex: none; width: calc(30 * var(--px)); height: auto; filter: drop-shadow(0 calc(1.5 * var(--px)) 0 rgba(0, 0, 0, 0.4)); }
    .wh-head-text { flex: 1; min-width: 0; }
    .wh-head h2 { margin: 0; font: 700 calc(20 * var(--px)) / 1.15 var(--mu-display); color: var(--mu-ink); letter-spacing: 0.01em; text-shadow: 0 calc(2 * var(--px)) 0 rgba(0, 0, 0, 0.3); }
    .wh-moment { margin: calc(3 * var(--px)) 0 0; font-size: calc(13 * var(--px)); color: var(--mu-sand); }
    .wh-x { align-self: flex-start; display: flex; align-items: center; gap: calc(6 * var(--px)); padding: calc(4 * var(--px)) calc(5 * var(--px)) calc(4 * var(--px)) calc(6 * var(--px));
      border: 0; border-radius: calc(6 * var(--px)); background: none; color: var(--mu-ink2); cursor: pointer; outline: none; transition: color 0.2s, background 0.2s; }
    .wh-x-icon { width: calc(15 * var(--px)); height: calc(15 * var(--px)); }
    .wh-x kbd { min-width: 0; height: calc(19 * var(--px)); font-size: calc(11.5 * var(--px)); color: var(--mu-ink2); }
    .wh-x kbd.is-pad { font-size: calc(14 * var(--px)); }
    .wh-x:hover { color: var(--mu-ink); background: rgba(255, 255, 255, 0.07); }
    .wh-x:focus-visible { outline: 2px solid rgba(255, 244, 214, 0.95); outline-offset: 2px; }
    .wh-body { display: grid; gap: calc(10 * var(--px)); overflow: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: var(--mu-line) transparent;
      margin: 0 calc(-4 * var(--px)); padding: calc(2 * var(--px)) calc(8 * var(--px)) calc(2 * var(--px)) calc(4 * var(--px)); }
    .wh-sec { display: grid; gap: calc(5 * var(--px)); }
    .wh-sec h3 { margin: 0; padding-bottom: calc(3 * var(--px)); border-bottom: 1px solid var(--mu-line); font: 700 calc(13.5 * var(--px)) / 1.2 var(--mu-display);
      color: var(--mu-gold-hi); letter-spacing: 0.04em; }
    .wh-empty { margin: 0; padding: calc(2 * var(--px)) calc(4 * var(--px)); font-size: calc(13 * var(--px)); color: var(--mu-dim); }
    .wh-row { position: relative; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: calc(10 * var(--px));
      padding: calc(6 * var(--px)) calc(6 * var(--px)) calc(6 * var(--px)) calc(6 * var(--px)); isolation: isolate; }
    .wh-row::before { content: ''; position: absolute; inset: 0; z-index: -1; clip-path: var(--wh-shape); background: rgba(255, 244, 222, 0.035); }
    .wh-row.is-now::before { background: rgba(58, 44, 20, 0.55); box-shadow: inset 0 0 calc(14 * var(--px)) rgba(255, 176, 40, 0.18); }
    .wh-row.is-muted .wh-ico, .wh-row.is-muted .wh-txt { opacity: 0.6; }
    .wh-ico { display: grid; place-items: center; width: calc(42 * var(--px)); height: calc(42 * var(--px)); border-radius: 50%; background: rgba(10, 18, 30, 0.7);
      box-shadow: inset 0 0 0 calc(1.5 * var(--px)) rgba(255, 236, 200, 0.4); }
    .wh-row.is-now .wh-ico { background: rgba(58, 38, 8, 0.94); box-shadow: inset 0 0 0 calc(2 * var(--px)) #ffd54a, 0 0 calc(10 * var(--px)) rgba(255, 180, 40, 0.5); }
    .wh-icon { display: block; width: calc(var(--w) * 2.15 * var(--px)); height: auto; }
    .wh-txt { display: grid; gap: calc(1 * var(--px)); min-width: 0; }
    .wh-name { font: 700 calc(15 * var(--px)) / 1.25 var(--mu-font); color: var(--mu-ink); }
    .wh-when { font-size: calc(13 * var(--px)); font-weight: 700; color: var(--mu-gold-hi); }
    .wh-where { font-size: calc(12.5 * var(--px)); color: var(--mu-ink2); }
    .wh-where:empty { display: none; }
    .wh-real { font-size: calc(12 * var(--px)); color: #a8d898; }
    .wh-acts { display: grid; gap: calc(4 * var(--px)); justify-items: stretch; }
    .wh-b { position: relative; display: flex; align-items: center; gap: calc(5 * var(--px)); min-height: calc(28 * var(--px)); padding: calc(3 * var(--px)) calc(9 * var(--px)) calc(3 * var(--px)) calc(7 * var(--px));
      border: 0; background: none; cursor: pointer; outline: none; color: var(--mu-ink2); isolation: isolate; font: 700 calc(12 * var(--px)) / 1.15 var(--mu-font); white-space: nowrap;
      touch-action: manipulation; transition: color 0.2s, transform 0.2s var(--mu-ease); }
    .wh-bg { position: absolute; inset: 0; z-index: -1; clip-path: var(--wh-shape); background: rgba(255, 244, 222, 0.06); transition: background 0.2s; }
    .wh-bg::after { content: ''; position: absolute; inset: 0; clip-path: var(--wh-ring); background: rgba(255, 229, 188, 0.16); transition: background 0.2s; }
    .wh-bi { flex: none; width: calc(15 * var(--px)); height: calc(15 * var(--px)); }
    .wh-b:hover, .wh-b:focus-visible, .wh-b.is-ring { color: var(--mu-ink); transform: translateX(calc(-2 * var(--px))); }
    .wh-b:hover .wh-bg { background: rgba(255, 244, 222, 0.12); }
    .wh-b:hover .wh-bg::after { background: var(--mu-line-hi); }
    .wh-b:focus-visible .wh-bg, .wh-b.is-ring .wh-bg { background: rgba(58, 44, 20, 0.7); box-shadow: 0 0 calc(10 * var(--px)) rgba(255, 176, 40, 0.35); }
    .wh-b:focus-visible .wh-bg::after, .wh-b.is-ring .wh-bg::after { background: rgba(255, 244, 214, 0.95); }
    .wh-b:active { transform: scale(0.96); }
    .wh-wait { color: var(--mu-gold-hi); }
    .wh-show.is-on { color: var(--mu-gold-hi); }
    .wh-show.is-on .wh-bg { background: rgba(58, 44, 20, 0.75); }
    .wh-show.is-on .wh-bg::after { background: var(--mu-gold-hi); }
    .wh-foot { padding-top: calc(7 * var(--px)); border-top: 1px solid var(--mu-line); font-size: calc(12.5 * var(--px)); color: var(--mu-dim); line-height: 1.35; }
    .wh-foot.is-held { color: #f2c46a; font-weight: 600; }
    body.pad-on .wh-foot:not(.is-held) { display: none; }
    /* (Khmer letters look smaller and stack signs above and below: map.css) */
    :lang(km) .wh-head h2 { letter-spacing: 0; line-height: 1.35; }
    :lang(km) .wh-sec h3 { letter-spacing: 0; font-size: calc(14.5 * var(--px)); line-height: 1.45; }
    :lang(km) .wh-name { font-size: calc(16 * var(--px)); line-height: 1.45; }
    :lang(km) .wh-when, :lang(km) .wh-moment { font-size: calc(14 * var(--px)); line-height: 1.45; }
    :lang(km) .wh-where, :lang(km) .wh-real, :lang(km) .wh-foot { font-size: calc(13.5 * var(--px)); line-height: 1.45; }
    :lang(km) .wh-b { font-size: calc(13 * var(--px)); line-height: 1.35; }
    /* (while it is open: the mini-map steps aside, and on touch the buttons and the tool bar; the explorer menu and the key list shut) */
    body.roam-when .mm { opacity: 0 !important; visibility: hidden !important; transition: opacity 0.2s, visibility 0s 0.2s !important; }
    body.roam-when.roam-touch .rt, body.roam-when.roam-touch .rtb-wrap { display: none !important; }
    body.roam-when .rtb-keys, body.roam-when .rxm { display: none !important; }
    .mu-calm ~ .rh > .wh-card { transform: translate(0, -50%) !important; }
    body.roam-touch .wh-card kbd, body.roam-touch .wh-foot:not(.is-held) { display: none; }
    /* A phone held upright (or any narrow view): a sheet along the bottom; the buttons under each row's words. */
    @media (max-width: 639px) {
      .rh > .wh-card { left: 10px; right: 10px; top: auto; bottom: 10px; width: auto; max-height: 72vh; transform: translateY(12px); padding: 12px 10px 10px 12px; }
      .rh > .wh-card.is-on { transform: none; }
      .mu-calm ~ .rh > .wh-card { transform: none !important; }
      /* (the buttons by their pictures only, big enough for a thumb: their words are their names) */
      .wh-acts { gap: 6px; }
      .wh-b { width: 42px; min-height: 42px; justify-content: center; padding: 0; }
      .wh-bt { display: none; }
      .wh-bi { width: 18px; height: 18px; }
    }
    /* A phone on its side: at the right edge, as tall as the view. */
    @media (max-height: 500px) {
      .rh > .wh-card { top: 8px; bottom: 8px; right: 8px; left: auto; width: min(420px, 56vw); max-height: none; transform: translateX(10px); padding: 10px 8px 8px 12px; }
      .rh > .wh-card.is-on { transform: none; }
      .mu-calm ~ .rh > .wh-card { transform: none !important; }
      .wh-b { min-height: 36px; }
    }

    /* The banner as an event begins: top centre, under the map's own banners and messages when they show. */
    .rh > .wh-toast { left: 50%; top: 13vh; gap: calc(12 * var(--px)); padding: calc(9 * var(--px)) calc(20 * var(--px)) calc(10 * var(--px)) calc(12 * var(--px));
      transform: translate(-50%, -6px); opacity: 0; visibility: hidden; transition: opacity 0.6s, transform 0.6s var(--mu-ease), visibility 0s 0.6s;
      --mu-edge: rgba(255, 208, 112, 0.8); pointer-events: none; max-width: calc(100vw - 40px); box-sizing: border-box; }
    .rh > .wh-toast.is-on { opacity: 1; visibility: visible; transform: translate(-50%, 0); transition: opacity 0.35s, transform 0.35s var(--mu-ease); }
    .wh-toast .mu-glow { opacity: 0.55; }
    .wh-toast-ico { flex: none; display: grid; place-items: center; width: calc(48 * var(--px)); height: calc(48 * var(--px)); border-radius: 50%;
      background: rgba(58, 38, 8, 0.94); box-shadow: inset 0 0 0 calc(2 * var(--px)) #ffd54a, 0 0 calc(12 * var(--px)) rgba(255, 180, 40, 0.55); }
    .wh-toast-icon { display: block; width: calc(var(--w) * 2.4 * var(--px)); height: auto; }
    .wh-toast-text { display: flex; flex-direction: column; gap: calc(2 * var(--px)); min-width: 0; }
    .wh-toast-text em { font-style: normal; font-size: calc(12.5 * var(--px)); font-weight: 700; color: var(--mu-gold-hi); letter-spacing: 0.04em; }
    .wh-toast-text b { font: 700 calc(19 * var(--px)) / 1.15 var(--mu-display); color: var(--mu-ink); letter-spacing: 0.01em; }
    .wh-toast-text span { font-size: calc(13 * var(--px)); color: var(--mu-ink2); }
    .wh-toast-text span[hidden] { display: none; }
    body.mm-toast-on .rh > .wh-toast, body.rh-toast-on .rh > .wh-toast { top: calc(13vh + 76 * var(--px)); }
    /* (the map's banner and the HUD's message: classes on the page set as they show, mm-toast-on, rh-toast-on; not :has(), which some phones lack) */
    /* (the card open at the right: in the middle of the room left of it) */
    body.roam-when .rh > .wh-toast { left: calc((100% - 436 * var(--px)) / 2); max-width: calc(100% - 476 * var(--px)); }
    body.mm-toast-on.rh-toast-on .rh > .wh-toast { top: calc(13vh + 150 * var(--px)); }
    :lang(km) .wh-toast-text em { letter-spacing: 0; font-size: calc(13.5 * var(--px)); }
    :lang(km) .wh-toast-text b { letter-spacing: 0; line-height: 1.4; }
    :lang(km) .wh-toast-text span { font-size: calc(14 * var(--px)); }
    body.roam-photo .rh > .wh-toast { opacity: 0 !important; }
    @media (max-width: 639px) {
      .rh > .wh-toast, body.roam-when .rh > .wh-toast { top: 250px; left: 50%; max-width: calc(100vw - 40px); }
      body.mm-toast-on .rh > .wh-toast, body.rh-toast-on .rh > .wh-toast { top: calc(250px + 76 * var(--px)); }
    }
    /* (a phone on its side: under the tool bar along the top and the festival's banner; with the card open, in the room left of it) */
    @media (max-height: 500px) {
      .rh > .wh-toast { top: 82px; }
      body.mm-toast-on .rh > .wh-toast, body.rh-toast-on .rh > .wh-toast { top: 156px; }
      body.roam-when .rh > .wh-toast { left: calc((100% - min(420px, 56vw) - 8px) / 2); max-width: calc(100% - min(420px, 56vw) - 32px); }
    }
    /* (a phone, upright or on its side: the explorer menu or the golden figures' list open would have the banner over its top,
       so it steps aside meanwhile: their classes on the page, rxm-open and tg-list-on) */
    @media (max-width: 639px), (max-height: 500px) {
      body.rxm-open .rh > .wh-toast, body.tg-list-on .rh > .wh-toast { opacity: 0; visibility: hidden; transition: opacity 0.2s, visibility 0s 0.2s; }
    }`;
  document.head.append(style);
}
