import type { PieceId } from '../build/pieces';
import { clearMark, markFocus } from '../pad/nav';
import { pad } from '../pad/pad';
import type { UISound } from '../types';
import { ICON as UI_ICON } from '../ui/icons';
import { onLang } from '../ui/lang';
import { setSteppedVars } from '../ui/shape';

/**
 * The build card (roam/_build.ts opens it with "E  Build…" by his house): what
 * he will build. In the middle of the screen, the look of the map's cards that
 * ask (map.css `.mu-ask`, as the garden's seed card, _gardenCard.ts): a hammer
 * and a post as its picture, the question, a line under it (his riel), then
 * one row per piece: its little picture, its name and how many he has of how
 * many, its line ("Knee high: to sit on and to lie under the sky"), its price;
 * one he cannot build now is greyed with why ("You have all 3", "12,000 ៛ more
 * needed"). The first he can build is in gold. A quiet "Not now" at the foot.
 *
 * Keys (its own while it is up: a capture listener; the roaming keys never see
 * them): 1‥9 pick that row, ↑ ↓ move between the rows, Enter or Space presses
 * the one in focus, Esc is "Not now". A game pad: a layer (pad.openLayer) — the
 * d-pad or the stick moves, ✕ presses, ○ is "Not now". Touch or a mouse: a tap
 * or a click; a tap beside the card is "Not now". While it is up the body has
 * `mu-asking` (roaming holds him still).
 */

export interface BuildRow {
  id: PieceId;
  /** Its name, how many he has ("1 / 3"), its line, its price. */
  name: string;
  count: string;
  note: string;
  price: string;
  /** Why it cannot be built now (greyed), or null. */
  off: string | null;
}

export interface BuildWords {
  title: string;
  note: string;
  cancel: string;
  rows: BuildRow[];
}

export interface BuildCard {
  readonly open: boolean;
  /** Ask (`onPick` gets the piece, or null for "Not now"). `words` is called again when the language changes. */
  ask(words: () => BuildWords, onPick: (id: PieceId | null) => void): void;
  /** The words again (his riel changed). */
  refresh(): void;
  /** Shut it (as "Not now", quietly). */
  close(): void;
  /** Checks: the focus ring on row `i`. */
  ring(i: number): void;
}

/** A hammer over a post, 16 × 16 pixel art (the card's picture). */
const ICON = `<svg class="bd-icon" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges">
  <path fill="#8a6038" d="M3 8h3v7H3z"/><path fill="#b08a5a" d="M4 8h1v7H4z"/><path fill="#6a4a2a" d="M2 14h5v1H2z"/>
  <path fill="#c8ccd0" d="M8 1h6v3H8z"/><path fill="#e8eef2" d="M9 1h4v1H9z"/><path fill="#7a7e84" d="M8 4h6v1H8z"/>
  <path fill="#a8743e" d="M10 5h2v6h-2z"/><path fill="#c8925a" d="M10 5h1v6h-1z"/>
  <path fill="#ffd27a" d="M6 6h1v1H6zM7 5h1v1H7zM5 7h1v1H5z"/>
</svg>`;

/** A row's little picture (12 × 12 pixel art). */
const PIC: Record<PieceId, string> = {
  pen: '<path fill="#8a6038" d="M1 4h1v7H1zM5 4h1v7H5zM10 4h1v7h-1z"/><path fill="#b08a5a" d="M1 5h10v1H1zM1 8h10v1H1z"/><path fill="#c9a04a" d="M2 9h3v2H2z"/><path fill="#6a8a3a" d="M0 11h12v1H0z"/>',
  shelter: '<path fill="#c9a04a" d="M1 4h10v1H1zM2 3h8v1H2zM4 2h4v1H4z"/><path fill="#a07a30" d="M0 5h12v1H0z"/><path fill="#8a6038" d="M2 6h1v5H2zM9 6h1v5H9z"/><path fill="#b08a5a" d="M3 8h6v1H3z"/><path fill="#6a8a3a" d="M0 11h12v1H0z"/>',
  kre: '<path fill="#d8c08a" d="M1 6h10v2H1z"/><path fill="#b8a06a" d="M1 7h10v1H1z"/><path fill="#8a6038" d="M2 8h1v3H2zM9 8h1v3H9z"/><path fill="#6a8a3a" d="M0 11h12v1H0z"/>',
  fence: '<path fill="#8a6038" d="M1 3h1v8H1zM6 3h1v8H6zM10 3h1v8h-1z"/><path fill="#d8c08a" d="M2 4h8v1H2zM2 6h8v1H2zM2 8h8v1H2z"/><path fill="#6a8a3a" d="M0 11h12v1H0z"/>',
  spirit: '<path fill="#e8c860" d="M5 0h2v2H5z"/><path fill="#d8b050" d="M4 2h4v2H4z"/><path fill="#c89838" d="M3 4h6v2H3z"/><path fill="#ffb050" d="M5 5h2v1H5z"/><path fill="#a07a30" d="M2 6h8v1H2z"/><path fill="#8a6038" d="M5 7h2v4H5z"/><path fill="#6a8a3a" d="M0 11h12v1H0z"/>',
  jar: '<path fill="#5a3a24" d="M4 2h4v1H4z"/><path fill="#7a4a2a" d="M3 3h6v1H3zM2 4h8v5H2zM3 9h6v1H3z"/><path fill="#9a6a3a" d="M3 5h2v3H3z"/><path fill="#6a8a3a" d="M0 11h12v1H0zM2 10h8v1H2z"/>',
  hammock: '<path fill="#8a6038" d="M0 2h1v9H0zM11 2h1v9h-1z"/><path fill="#d8d0c0" d="M1 4h1v1H1zM10 4h1v1h-1z"/><path fill="#c84a3a" d="M2 5h2v1H2zM8 5h2v1H8z"/><path fill="#3a6a9a" d="M4 6h4v1H4z"/><path fill="#e8c860" d="M3 6h1v1H3zM8 6h1v1H8z"/><path fill="#6a8a3a" d="M0 11h12v1H0z"/>',
  lamp: '<path fill="#8a6038" d="M5 4h2v7H5z"/><path fill="#5a3a24" d="M4 1h4v1H4z"/><path fill="#ffd27a" d="M4 2h4v2H4z"/><path fill="#fff0b0" d="M5 2h2v1H5z"/><path fill="#6a8a3a" d="M0 11h12v1H0z"/>',
  haystack: '<path fill="#8a6038" d="M5 0h2v3H5z"/><path fill="#d8b860" d="M4 3h4v1H4zM3 4h6v2H3zM2 6h8v3H2zM1 9h10v2H1z"/><path fill="#b8983a" d="M3 7h1v1H3zM7 5h1v1H7zM6 9h1v1H6zM9 8h1v1H9z"/><path fill="#6a8a3a" d="M0 11h12v1H0z"/>',
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function createBuildCard(sound?: (s: UISound) => void): BuildCard {
  injectStyle();
  const wrap = document.createElement('div');
  wrap.className = 'map-ui mu-ask bd-ask';
  if (new URLSearchParams(location.search).get('shot') === '1') wrap.classList.add('mu-shot');
  setSteppedVars(wrap);
  wrap.innerHTML = `
    <section class="mu-ask-card mu-frame mu-lg" role="dialog" aria-modal="true" aria-labelledby="bd-title" aria-describedby="bd-note" aria-hidden="true" tabindex="-1">
      <span class="mu-bg"></span>
      <div class="mu-ask-head"><span class="bd-icon-wrap">${ICON}</span><h2 id="bd-title"></h2></div>
      <div class="mu-orn mu-ask-orn" aria-hidden="true"><i></i>${UI_ICON.diamond}<i></i></div>
      <p id="bd-note"></p>
      <div class="bd-opts" role="list"></div>
    </section>`;
  const ui = document.getElementById('ui');
  if (ui) {
    if (ui.style.display === 'none') wrap.style.display = 'none';
    ui.after(wrap);
  } else document.body.append(wrap);
  const card = wrap.querySelector<HTMLElement>('.mu-ask-card')!;
  const title = wrap.querySelector<HTMLElement>('h2')!;
  const note = wrap.querySelector<HTMLElement>('#bd-note')!;
  const opts = wrap.querySelector<HTMLElement>('.bd-opts')!;
  let isOpen = false;
  let words: (() => BuildWords) | null = null;
  let pick: ((id: PieceId | null) => void) | null = null;
  let closePad: (() => void) | null = null;

  const buttons = () => [...opts.querySelectorAll<HTMLButtonElement>('button')];
  const live = () => buttons().filter((b) => !b.disabled);

  function render(): void {
    if (!words) return;
    const w = words();
    title.textContent = w.title;
    note.textContent = w.note;
    note.hidden = !w.note;
    const focused = (document.activeElement as HTMLElement | null)?.dataset?.id;
    const gold = w.rows.findIndex((r) => !r.off);
    opts.innerHTML =
      w.rows
        .map(
          (r, i) => `<button type="button" role="listitem" class="bd-opt mu-frame mu-sm${i === gold ? ' is-gold' : ''}${r.off ? ' is-off' : ''}" data-id="${r.id}"${r.off ? ' disabled aria-disabled="true"' : ''}><span class="mu-bg"></span>${i === gold ? '<span class="mu-glow"></span>' : ''}<span class="mu-focus"></span>
        <span class="bd-pic"><svg class="bd-ri" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true">${PIC[r.id]}</svg></span>
        <span class="bd-t"><b>${esc(r.name)}<span class="bd-n">${esc(r.count)}</span></b><em>${esc(r.off ?? r.note)}</em></span>
        <span class="bd-price">${esc(r.price)}</span>${i < 9 ? `<kbd data-pad="${i === gold ? 'south' : ''}">${i + 1}</kbd>` : ''}</button>`,
        )
        .join('') +
      `<button type="button" class="bd-opt bd-cancel mu-frame mu-sm" data-id=""><span class="mu-bg"></span><span class="mu-focus"></span><span class="bd-t"><b>${esc(w.cancel)}</b></span><kbd data-pad="east">Esc</kbd></button>`;
    if (focused) opts.querySelector<HTMLButtonElement>(`button[data-id="${focused}"]`)?.focus({ preventScroll: true });
  }
  onLang(() => {
    if (isOpen) render();
  });

  function show(on: boolean): void {
    isOpen = on;
    wrap.classList.toggle('is-open', on);
    card.setAttribute('aria-hidden', String(!on));
    document.body.classList.toggle('mu-asking', on);
    closePad?.();
    closePad = on ? pad.openLayer(wrap, { first: () => live()[0] ?? null, back: () => choose(null) }) : null;
    if (!on && wrap.querySelector('.pad-focus')) clearMark();
  }

  function choose(id: string | null): void {
    if (!isOpen) return;
    show(false);
    (document.activeElement as HTMLElement | null)?.blur();
    sound?.(id ? 'select' : 'close');
    const f = pick;
    pick = null;
    f?.((id || null) as PieceId | null);
  }

  function nope(b: HTMLElement): void {
    sound?.('tick');
    b.classList.remove('is-nope');
    void b.offsetWidth;
    b.classList.add('is-nope');
  }

  opts.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (b && !b.disabled) choose(b.dataset.id || null);
  });
  wrap.addEventListener('pointerdown', (e) => {
    if (isOpen && e.target === wrap) choose(null);
  });
  addEventListener(
    'keydown',
    (e) => {
      if (!isOpen || e.ctrlKey || e.metaKey || e.altKey) return;
      const all = buttons();
      const list = live();
      const at = list.indexOf(document.activeElement as HTMLButtonElement);
      if (e.code === 'Escape') choose(null);
      else if (/^(Digit|Numpad)[1-9]$/.test(e.code)) {
        const b = all[Number(e.code.slice(-1)) - 1];
        if (b && !b.classList.contains('bd-cancel')) {
          if (b.disabled) nope(b);
          else choose(b.dataset.id || null);
        }
      } else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
        const b = at >= 0 ? list[at] : (list.find((x) => !x.classList.contains('bd-cancel')) ?? list[0]);
        choose(b?.dataset.id || null);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.code === 'Tab') {
        const back = e.key === 'ArrowUp' || e.key === 'ArrowLeft' || (e.code === 'Tab' && e.shiftKey);
        const to = list[at < 0 ? 0 : (at + (back ? -1 : 1) + list.length) % list.length];
        if (to) {
          if (!e.isTrusted && pad.active) markFocus(to);
          else to.focus({ preventScroll: true });
          to.scrollIntoView({ block: 'nearest' });
          sound?.('hover');
        }
      } else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true,
  );

  return {
    get open() {
      return isOpen;
    },
    ask(w, onPick) {
      words = w;
      pick = onPick;
      render();
      if (isOpen) return;
      show(true);
      sound?.('open');
      card.focus({ preventScroll: true });
    },
    refresh() {
      if (isOpen) render();
    },
    close() {
      if (!isOpen) return;
      pick = null;
      show(false);
      (document.activeElement as HTMLElement | null)?.blur();
    },
    ring(i) {
      const b = buttons()[i];
      if (b) markFocus(b);
    },
  };
}

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  style.textContent = `
    .bd-ask .mu-ask-card { width: min(calc(480 * var(--px)), 100%); max-height: calc(100% - 24px); display: flex; flex-direction: column; }
    .bd-icon-wrap { display: grid; place-items: center; flex: none; width: calc(48 * var(--px)); height: calc(48 * var(--px)); border-radius: 50%;
      background: rgba(10, 18, 30, 0.75); box-shadow: inset 0 0 0 calc(1.5 * var(--px)) rgba(255, 216, 120, 0.55), 0 0 calc(12 * var(--px)) rgba(255, 190, 110, 0.22); }
    .bd-icon { width: calc(32 * var(--px)); height: calc(32 * var(--px)); }
    .bd-ask #bd-note[hidden] { display: none; }
    .bd-opts { display: grid; grid-template-columns: minmax(0, 1fr); gap: calc(5 * var(--px)); margin-top: calc(12 * var(--px)); overflow-y: auto; min-height: 0; padding: calc(2 * var(--px)); margin-inline: calc(-2 * var(--px)); touch-action: pan-x pan-y; }
    .bd-opt { position: relative; display: flex; align-items: center; gap: calc(10 * var(--px)); min-height: calc(44 * var(--px)); padding: calc(4 * var(--px)) calc(10 * var(--px)) calc(4 * var(--px)) calc(8 * var(--px));
      border: 0; background: none; cursor: pointer; outline: none; text-align: left; color: var(--mu-ink); touch-action: manipulation;
      --mu-edge: var(--mu-btn-edge); --mu-shadow: none; transition: transform 0.3s var(--mu-ease), opacity 0.2s; }
    .bd-opt > .mu-bg { background: var(--mu-btn); }
    .bd-opt.is-gold { color: #2b1904; --mu-edge: rgba(255, 250, 225, 0.85); --mu-shadow: 0 calc(6 * var(--px)) calc(18 * var(--px)) rgba(40, 20, 0, 0.35); }
    .bd-opt.is-gold > .mu-bg { background: linear-gradient(180deg, #ffdc80 0%, #f7bd40 55%, #eba52a 100%); }
    .bd-opt.is-gold > .mu-glow { opacity: 0.45; }
    .bd-opt.is-off { cursor: default; opacity: 0.62; }
    .bd-opt.is-off > .mu-bg { background: rgba(20, 24, 30, 0.55); }
    .bd-opt.is-off .bd-ri { filter: grayscale(0.85) brightness(0.8); }
    .bd-opt.is-off .bd-t em { color: #ffb4a0; }
    .bd-opt.is-nope { animation: bd-nope 0.32s; }
    @keyframes bd-nope { 25% { transform: translateX(calc(-4 * var(--px))); } 75% { transform: translateX(calc(4 * var(--px))); } }
    .bd-pic { flex: none; display: grid; place-items: center; width: calc(36 * var(--px)); height: calc(36 * var(--px)); border-radius: calc(6 * var(--px)); background: rgba(10, 18, 30, 0.45); }
    .bd-opt.is-gold .bd-pic { background: rgba(90, 50, 0, 0.16); }
    .bd-ri { width: calc(26 * var(--px)); height: calc(26 * var(--px)); }
    .bd-t { flex: 1; display: flex; flex-direction: column; gap: calc(2 * var(--px)); min-width: 0; }
    .bd-t b { font: 700 calc(15.5 * var(--px)) / 1.2 var(--mu-display); letter-spacing: 0.01em; display: flex; align-items: baseline; gap: calc(8 * var(--px)); }
    .bd-n { font-weight: 600; font-size: calc(12.5 * var(--px)); color: var(--mu-ink2); white-space: nowrap; }
    .bd-opt.is-gold .bd-n { color: #5a3a0c; }
    .bd-t em { font-style: normal; font-size: calc(12 * var(--px)); font-weight: 600; color: var(--mu-ink2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bd-opt.is-gold .bd-t em { color: #5a3a0c; }
    .bd-price { flex: none; font: 700 calc(12 * var(--px)) / 1 var(--mu-display); padding: calc(4 * var(--px)) calc(7 * var(--px)); border-radius: calc(10 * var(--px)); white-space: nowrap;
      background: rgba(255, 210, 120, 0.14); color: #ffe2a0; border: 1px solid rgba(255, 210, 120, 0.32); }
    .bd-opt.is-gold .bd-price { background: rgba(90, 50, 0, 0.12); color: #4a2e08; border-color: rgba(90, 50, 0, 0.3); }
    .bd-cancel { min-height: calc(40 * var(--px)); padding-left: calc(16 * var(--px)); }
    .bd-cancel .bd-t b { font-size: calc(14.5 * var(--px)); font-weight: 600; color: var(--mu-ink2); }
    .bd-opt kbd { display: inline-grid; place-items: center; min-width: calc(20 * var(--px)); height: calc(20 * var(--px)); padding: 0 calc(5 * var(--px)); box-sizing: border-box;
      font: 600 calc(11.5 * var(--px)) / 1 var(--mu-display); color: var(--mu-ink2); background: rgba(255, 244, 222, 0.1); border: 1px solid var(--mu-line-hi); border-bottom-width: 2px; border-radius: calc(3 * var(--px)); }
    .bd-opt.is-gold kbd { color: #4a2e08; background: rgba(90, 50, 0, 0.12); border-color: rgba(90, 50, 0, 0.4); }
    body.pad-on .bd-opt kbd:not([data-pad]), body.pad-on .bd-opt kbd[data-pad=""] { visibility: hidden; }
    @media (hover: hover) {
      .bd-opt:not(.is-off):hover { transform: translateY(var(--mu-lift)); }
      .bd-opt:not(.is-gold):not(.is-off):hover > .mu-bg { background: var(--mu-btn-hi); }
      .bd-opt.is-gold:hover > .mu-glow { opacity: 1; }
    }
    .bd-opt:focus-visible, .bd-opt.pad-focus { --mu-edge: rgba(255, 244, 214, 0.95); }
    .bd-opt:not(.is-off):active { transform: scale(0.97); transition-duration: 0.08s; }
    :lang(km) .bd-t b { font-size: calc(16.5 * var(--px)); line-height: 1.4; letter-spacing: 0; }
    :lang(km) .bd-t em { font-size: calc(13 * var(--px)); line-height: 1.4; }
    :lang(km) .bd-n { font-size: calc(13 * var(--px)); }
    :lang(km) .bd-price { font-size: calc(13 * var(--px)); line-height: 1.2; }
    :lang(km) .bd-cancel .bd-t b { font-size: calc(15.5 * var(--px)); }
    @media (pointer: coarse) { .bd-opt kbd { display: none; } .bd-opt { min-height: 50px; } }
    body.roam-touch:not(.pad-on) .bd-opt kbd { display: none; }
    .mu-calm ~ .bd-ask .bd-opt { transform: none !important; }`;
  document.head.append(style);
}
