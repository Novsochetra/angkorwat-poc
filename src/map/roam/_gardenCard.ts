import type { PlantKindId } from '../garden/kinds';
import { clearMark, markFocus } from '../pad/nav';
import { pad } from '../pad/pad';
import type { UISound } from '../types';
import { ICON as UI_ICON } from '../ui/icons';
import { onLang } from '../ui/lang';
import { setSteppedVars } from '../ui/shape';

/**
 * The seed card (roam/_garden.ts opens it with "E  Plant here"): what he will
 * plant on the spot the ring shows. In the middle of the screen, the look of the
 * map's cards that ask (map.css `.mu-ask`, as the home's sleep card,
 * _homeCard.ts): a sprout in a pot as its picture, the question, a line under it
 * (how many crops and trees the garden has of how many), then one row per kind
 * of seed or seedling he has: its little picture, its name and how many he has,
 * its line ("Grows fast and bears again and again"), crop or tree; a kind that
 * cannot go on this spot is greyed, with why ("Too close to another plant": a
 * tree needs room). The first that can go is in gold. A quiet "Not now" at the
 * foot.
 *
 * Keys (its own while it is up: a capture listener; the roaming keys never see
 * them): 1‥9 pick that row, ↑ ↓ move between the rows, Enter or Space presses
 * the one in focus (the first that can go when none is), Esc is "Not now". A
 * game pad: a layer (pad.openLayer) — the d-pad or the stick moves, ✕ presses,
 * ○ is "Not now". Touch or a mouse: a tap or a click; a tap beside the card is
 * "Not now". While it is up the body has `mu-asking` (roaming holds him still).
 */

export interface SeedRow {
  kind: PlantKindId;
  /** Its name, how many he has ("3 seedlings"), its line, crop or tree. */
  name: string;
  count: string;
  note: string;
  size: string;
  /** Why it cannot go here (greyed), or null. */
  off: string | null;
  /** Its picture's look: a crop, a tree, a palm; its fruit's colour. */
  shape: 'crop' | 'tree' | 'palm';
  color: number;
}

export interface SeedWords {
  title: string;
  note: string;
  cancel: string;
  rows: SeedRow[];
}

export interface SeedCard {
  readonly open: boolean;
  /** Ask (`onPick` gets the kind, or null for "Not now"). `words` is called again when the language changes. */
  ask(words: () => SeedWords, onPick: (kind: PlantKindId | null) => void): void;
  /** Shut it (as "Not now", quietly). */
  close(): void;
  /** Checks: the focus ring on row `i`. */
  ring(i: number): void;
}

/** A sprout in a clay pot, 16 × 16 pixel art (the card's picture). */
const ICON = `<svg class="gd-icon" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges">
  <path fill="#7fd05a" d="M7 2h1v1h1v1H8v1H7zM9 3h3v1h1v1h-2v1H9V5h1V4H9zM4 4h2v1h1v2h-1V6H5V5H4z"/>
  <path fill="#4f9a34" d="M7 5h1v4H7zM10 4h1v1h-1zM5 5h1v1H5z"/>
  <path fill="#c86a3a" d="M3 9h10v2h-1v4H4v-4H3z"/>
  <path fill="#e8925a" d="M4 9h8v1H4z"/>
  <path fill="#9a4a26" d="M5 11h1v3H5zM10 11h1v3h-1z"/>
</svg>`;

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** A row's little picture: a crop (a sprout with its fruit), a tree (a round crown with fruit), a palm (fronds and fruit). */
function rowIcon(shape: SeedRow['shape'], color: number): string {
  const f = hex(color);
  if (shape === 'crop')
    return `<svg class="gd-ri" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><path fill="#4f9a34" d="M5 3h1v7H5z"/><path fill="#7fd05a" d="M3 2h2v1h1v1H4V3H3zM7 4h2v1h1v1H8V5H7zM2 6h3v1H3z"/><path fill="${f}" d="M6 6h2v3H6z"/><path fill="#8a6038" d="M2 10h8v1H2z"/></svg>`;
  if (shape === 'palm')
    return `<svg class="gd-ri" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><path fill="#7a5a3a" d="M5 4h2v7H5z"/><path fill="#5aa040" d="M1 3h4v1H1zM7 3h4v1H7zM2 1h3v1h1v1H2zM6 1h4v1H7v1H6zM1 4h2v1H1zM9 4h2v1H9z"/><path fill="${f}" d="M4 4h1v1H4zM7 4h1v1H7z"/><path fill="#8a6038" d="M3 11h6v1H3z"/></svg>`;
  return `<svg class="gd-ri" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><path fill="#7a5a3a" d="M5 7h2v4H5z"/><path fill="#4f9a34" d="M3 1h6v1h1v1h1v3h-1v1H2V6H1V3h1V2h1z"/><path fill="#6cc04a" d="M4 2h3v1H4zM3 3h1v1H3z"/><path fill="${f}" d="M3 5h1v1H3zM7 4h1v1H7zM8 6h1v1H8z"/><path fill="#8a6038" d="M3 11h6v1H3z"/></svg>`;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function createSeedCard(sound?: (s: UISound) => void): SeedCard {
  injectStyle();
  const wrap = document.createElement('div');
  wrap.className = 'map-ui mu-ask gd-ask';
  if (new URLSearchParams(location.search).get('shot') === '1') wrap.classList.add('mu-shot');
  setSteppedVars(wrap);
  wrap.innerHTML = `
    <section class="mu-ask-card mu-frame mu-lg" role="dialog" aria-modal="true" aria-labelledby="gd-title" aria-describedby="gd-note" aria-hidden="true" tabindex="-1">
      <span class="mu-bg"></span>
      <div class="mu-ask-head"><span class="gd-icon-wrap">${ICON}</span><h2 id="gd-title"></h2></div>
      <div class="mu-orn mu-ask-orn" aria-hidden="true"><i></i>${UI_ICON.diamond}<i></i></div>
      <p id="gd-note"></p>
      <div class="gd-opts" role="list"></div>
    </section>`;
  const ui = document.getElementById('ui');
  if (ui) {
    if (ui.style.display === 'none') wrap.style.display = 'none';
    ui.after(wrap);
  } else document.body.append(wrap);
  const card = wrap.querySelector<HTMLElement>('.mu-ask-card')!;
  const title = wrap.querySelector<HTMLElement>('h2')!;
  const note = wrap.querySelector<HTMLElement>('#gd-note')!;
  const opts = wrap.querySelector<HTMLElement>('.gd-opts')!;
  let isOpen = false;
  let words: (() => SeedWords) | null = null;
  let pick: ((k: PlantKindId | null) => void) | null = null;
  let closePad: (() => void) | null = null;

  /** Every button (the rows, then "Not now"), and those that can be pressed. */
  const buttons = () => [...opts.querySelectorAll<HTMLButtonElement>('button')];
  const live = () => buttons().filter((b) => !b.disabled);

  function render(): void {
    if (!words) return;
    const w = words();
    title.textContent = w.title;
    note.textContent = w.note;
    note.hidden = !w.note;
    const gold = w.rows.findIndex((r) => !r.off);
    opts.innerHTML =
      w.rows
        .map(
          (r, i) => `<button type="button" role="listitem" class="gd-opt mu-frame mu-sm${i === gold ? ' is-gold' : ''}${r.off ? ' is-off' : ''}" data-kind="${r.kind}"${r.off ? ' disabled aria-disabled="true"' : ''}><span class="mu-bg"></span>${i === gold ? '<span class="mu-glow"></span>' : ''}<span class="mu-focus"></span>
        <span class="gd-pic">${rowIcon(r.shape, r.color)}</span>
        <span class="gd-t"><b>${esc(r.name)}<span class="gd-n">${esc(r.count)}</span></b><em>${esc(r.off ?? r.note)}</em></span>
        <span class="gd-size">${esc(r.size)}</span>${i < 9 ? `<kbd data-pad="${i === gold ? 'south' : ''}">${i + 1}</kbd>` : ''}</button>`,
        )
        .join('') +
      `<button type="button" class="gd-opt gd-cancel mu-frame mu-sm" data-kind=""><span class="mu-bg"></span><span class="mu-focus"></span><span class="gd-t"><b>${esc(w.cancel)}</b></span><kbd data-pad="east">Esc</kbd></button>`;
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

  function choose(kind: string | null): void {
    if (!isOpen) return;
    show(false);
    (document.activeElement as HTMLElement | null)?.blur();
    sound?.(kind ? 'select' : 'close');
    const f = pick;
    pick = null;
    f?.((kind || null) as PlantKindId | null);
  }

  opts.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (b && !b.disabled) choose(b.dataset.kind || null);
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
        // (the row's number, as shown: a greyed one says no)
        const b = all[Number(e.code.slice(-1)) - 1];
        if (b && !b.classList.contains('gd-cancel')) {
          if (b.disabled) {
            sound?.('tick');
            b.classList.remove('is-nope');
            void b.offsetWidth;
            b.classList.add('is-nope');
          } else choose(b.dataset.kind || null);
        }
      } else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
        const b = at >= 0 ? list[at] : (list.find((x) => !x.classList.contains('gd-cancel')) ?? list[0]);
        choose(b?.dataset.kind || null);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.code === 'Tab') {
        const back = e.key === 'ArrowUp' || e.key === 'ArrowLeft' || (e.code === 'Tab' && e.shiftKey);
        const to = list[at < 0 ? 0 : (at + (back ? -1 : 1) + list.length) % list.length];
        if (to) {
          if (!e.isTrusted && pad.active) markFocus(to);
          else to.focus({ preventScroll: true });
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
    .gd-ask .mu-ask-card { width: min(calc(460 * var(--px)), 100%); max-height: calc(100% - 24px); display: flex; flex-direction: column; }
    .gd-icon-wrap { display: grid; place-items: center; flex: none; width: calc(48 * var(--px)); height: calc(48 * var(--px)); border-radius: 50%;
      background: rgba(10, 18, 30, 0.75); box-shadow: inset 0 0 0 calc(1.5 * var(--px)) rgba(255, 216, 120, 0.55), 0 0 calc(12 * var(--px)) rgba(160, 230, 110, 0.22); }
    .gd-icon { width: calc(32 * var(--px)); height: calc(32 * var(--px)); }
    .gd-ask #gd-note[hidden] { display: none; }
    .gd-opts { display: grid; gap: calc(7 * var(--px)); margin-top: calc(14 * var(--px)); overflow-y: auto; min-height: 0; padding: calc(2 * var(--px)); margin-inline: calc(-2 * var(--px)); touch-action: pan-x pan-y; }
    .gd-opt { position: relative; display: flex; align-items: center; gap: calc(10 * var(--px)); min-height: calc(50 * var(--px)); padding: calc(6 * var(--px)) calc(12 * var(--px)) calc(6 * var(--px)) calc(10 * var(--px));
      border: 0; background: none; cursor: pointer; outline: none; text-align: left; color: var(--mu-ink); touch-action: manipulation;
      --mu-edge: var(--mu-btn-edge); --mu-shadow: none; transition: transform 0.3s var(--mu-ease), opacity 0.2s; }
    .gd-opt > .mu-bg { background: var(--mu-btn); }
    .gd-opt.is-gold { color: #2b1904; --mu-edge: rgba(255, 250, 225, 0.85); --mu-shadow: 0 calc(6 * var(--px)) calc(18 * var(--px)) rgba(40, 20, 0, 0.35); }
    .gd-opt.is-gold > .mu-bg { background: linear-gradient(180deg, #ffdc80 0%, #f7bd40 55%, #eba52a 100%); }
    .gd-opt.is-gold > .mu-glow { opacity: 0.45; }
    .gd-opt.is-off { cursor: default; opacity: 0.62; }
    .gd-opt.is-off > .mu-bg { background: rgba(20, 24, 30, 0.55); }
    .gd-opt.is-off .gd-ri { filter: grayscale(0.85) brightness(0.8); }
    .gd-opt.is-off .gd-t em { color: #ffb4a0; }
    .gd-opt.is-nope { animation: gd-nope 0.32s; }
    @keyframes gd-nope { 25% { transform: translateX(calc(-4 * var(--px))); } 75% { transform: translateX(calc(4 * var(--px))); } }
    .gd-pic { flex: none; display: grid; place-items: center; width: calc(36 * var(--px)); height: calc(36 * var(--px)); border-radius: calc(6 * var(--px)); background: rgba(10, 18, 30, 0.45); }
    .gd-opt.is-gold .gd-pic { background: rgba(90, 50, 0, 0.16); }
    .gd-ri { width: calc(24 * var(--px)); height: calc(24 * var(--px)); }
    .gd-t { flex: 1; display: flex; flex-direction: column; gap: calc(2 * var(--px)); min-width: 0; }
    .gd-t b { font: 700 calc(15.5 * var(--px)) / 1.2 var(--mu-display); letter-spacing: 0.01em; display: flex; align-items: baseline; gap: calc(8 * var(--px)); }
    .gd-n { font-weight: 600; font-size: calc(12.5 * var(--px)); color: var(--mu-ink2); white-space: nowrap; }
    .gd-opt.is-gold .gd-n { color: #5a3a0c; }
    .gd-t em { font-style: normal; font-size: calc(12 * var(--px)); font-weight: 600; color: var(--mu-ink2); overflow: hidden; text-overflow: ellipsis; }
    .gd-opt.is-gold .gd-t em { color: #5a3a0c; }
    .gd-size { flex: none; font: 600 calc(11 * var(--px)) / 1 var(--mu-display); padding: calc(3 * var(--px)) calc(6 * var(--px)); border-radius: calc(10 * var(--px));
      background: rgba(140, 210, 110, 0.16); color: #bfe8a8; border: 1px solid rgba(160, 230, 120, 0.3); }
    .gd-opt.is-gold .gd-size { background: rgba(90, 50, 0, 0.12); color: #4a2e08; border-color: rgba(90, 50, 0, 0.3); }
    .gd-cancel { min-height: calc(40 * var(--px)); padding-left: calc(16 * var(--px)); }
    .gd-cancel .gd-t b { font-size: calc(14.5 * var(--px)); font-weight: 600; color: var(--mu-ink2); }
    .gd-opt kbd { display: inline-grid; place-items: center; min-width: calc(20 * var(--px)); height: calc(20 * var(--px)); padding: 0 calc(5 * var(--px)); box-sizing: border-box;
      font: 600 calc(11.5 * var(--px)) / 1 var(--mu-display); color: var(--mu-ink2); background: rgba(255, 244, 222, 0.1); border: 1px solid var(--mu-line-hi); border-bottom-width: 2px; border-radius: calc(3 * var(--px)); }
    .gd-opt.is-gold kbd { color: #4a2e08; background: rgba(90, 50, 0, 0.12); border-color: rgba(90, 50, 0, 0.4); }
    body.pad-on .gd-opt kbd:not([data-pad]), body.pad-on .gd-opt kbd[data-pad=""] { visibility: hidden; }
    @media (hover: hover) {
      .gd-opt:not(.is-off):hover { transform: translateY(var(--mu-lift)); }
      .gd-opt:not(.is-gold):not(.is-off):hover > .mu-bg { background: var(--mu-btn-hi); }
      .gd-opt.is-gold:hover > .mu-glow { opacity: 1; }
    }
    .gd-opt:focus-visible, .gd-opt.pad-focus { --mu-edge: rgba(255, 244, 214, 0.95); }
    .gd-opt:not(.is-off):active { transform: scale(0.97); transition-duration: 0.08s; }
    :lang(km) .gd-t b { font-size: calc(16.5 * var(--px)); line-height: 1.4; letter-spacing: 0; }
    :lang(km) .gd-t em { font-size: calc(13 * var(--px)); line-height: 1.4; }
    :lang(km) .gd-n { font-size: calc(13 * var(--px)); }
    :lang(km) .gd-size { font-size: calc(12 * var(--px)); line-height: 1.3; }
    :lang(km) .gd-cancel .gd-t b { font-size: calc(15.5 * var(--px)); }
    @media (pointer: coarse) { .gd-opt kbd { display: none; } .gd-opt { min-height: 52px; } }
    body.roam-touch:not(.pad-on) .gd-opt kbd { display: none; }
    .mu-calm ~ .gd-ask .gd-opt { transform: none !important; }`;
  document.head.append(style);
}
