import { clearMark, markFocus } from '../pad/nav';
import { pad } from '../pad/pad';
import type { UISound } from '../types';
import { ICON as UI_ICON } from '../ui/icons';
import { onLang } from '../ui/lang';
import { setSteppedVars } from '../ui/shape';

/**
 * The small card that asks how long he sleeps in his stilt house
 * (roam/_homeSleep.ts): in the middle of the screen, the look of the map's
 * cards that ask (map.css `.mu-ask`: the strong glass, the gold edge, the
 * ornament line): a moon over the roof as its picture, the question, a line
 * under it (the time of day now, or why it is only a short rest), then the
 * choices one under the other ("Until dawn", "Until the afternoon", "Wake
 * for: the morning market"…), the first in gold, and a quiet "Not now".
 *
 * Keys (its own while it is up: a capture listener, the roaming keys never
 * see them): 1‥4 pick, ↑ ↓ move between them, Enter or Space presses the one
 * in focus (the first when none is), Esc is "Not now". A game pad: a layer
 * (pad.openLayer) — the d-pad or the stick moves, ✕ presses, ○ is "Not now".
 * Touch or a mouse: a tap or a click; beside the card is "Not now". While it
 * is up the body has `mu-asking` (roaming holds him still: roam.ts).
 */

export interface HomeChoice {
  id: string;
  label: string;
  /** A second line (when, where), or ''. */
  sub: string;
}

export interface HomeCard {
  readonly open: boolean;
  /** Ask (`onPick` gets the choice's id, or null for "Not now"). Words in the language in use (`words` is called again when it changes). */
  ask(words: () => { title: string; note: string; cancel: string; choices: HomeChoice[] }, onPick: (id: string | null) => void): void;
  /** Shut it (as "Not now", quietly). */
  close(): void;
  /** Checks: the focus ring on choice `i`. */
  ring(i: number): void;
}

/** A crescent moon over a little stilt house's roof, 16 × 16 pixel art. */
const ICON = `<svg class="hm-icon" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges">
  <path fill="#ffe7a0" d="M10 1h3v1h1v1h-1v1h-1v2h1v1h1v1h-1v1h-3V8H9V7H8V3h1V2h1z"/>
  <path fill="#e58a5a" d="M5 6h2v1h1v1h1v1h1v1H2V9h1V8h1V7h1z"/>
  <path fill="#b4532f" d="M6 7h1v1h1v1h1v1H6z"/>
  <path fill="#f2dfb6" d="M3 10h6v3H3z"/>
  <path fill="#ffd76a" d="M4 11h1v1H4z"/>
  <path fill="#4a2e1c" d="M6 11h2v2H6z"/>
  <path fill="#8a6038" d="M3 13h1v2H3zM8 13h1v2H8z"/>
</svg>`;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function createHomeCard(sound?: (s: UISound) => void): HomeCard {
  injectStyle();
  const wrap = document.createElement('div');
  wrap.className = 'map-ui mu-ask hm-ask';
  if (new URLSearchParams(location.search).get('shot') === '1') wrap.classList.add('mu-shot');
  setSteppedVars(wrap);
  wrap.innerHTML = `
    <section class="mu-ask-card mu-frame mu-lg" role="dialog" aria-modal="true" aria-labelledby="hm-title" aria-describedby="hm-note" aria-hidden="true" tabindex="-1">
      <span class="mu-bg"></span>
      <div class="mu-ask-head"><span class="hm-icon-wrap">${ICON}</span><h2 id="hm-title"></h2></div>
      <div class="mu-orn mu-ask-orn" aria-hidden="true"><i></i>${UI_ICON.diamond}<i></i></div>
      <p id="hm-note"></p>
      <div class="hm-opts"></div>
    </section>`;
  const ui = document.getElementById('ui');
  if (ui) {
    if (ui.style.display === 'none') wrap.style.display = 'none';
    ui.after(wrap);
  } else document.body.append(wrap);
  const card = wrap.querySelector<HTMLElement>('.mu-ask-card')!;
  const title = wrap.querySelector<HTMLElement>('h2')!;
  const note = wrap.querySelector<HTMLElement>('p')!;
  const opts = wrap.querySelector<HTMLElement>('.hm-opts')!;
  let isOpen = false;
  let words: (() => { title: string; note: string; cancel: string; choices: HomeChoice[] }) | null = null;
  let pick: ((id: string | null) => void) | null = null;
  let closePad: (() => void) | null = null;

  const buttons = () => [...opts.querySelectorAll<HTMLButtonElement>('button')];

  function render(): void {
    if (!words) return;
    const w = words();
    title.textContent = w.title;
    note.textContent = w.note;
    note.hidden = !w.note;
    opts.innerHTML =
      w.choices
        .map(
          (c, i) => `<button type="button" class="hm-opt mu-frame mu-sm${i === 0 ? ' is-gold' : ''}" data-id="${esc(c.id)}"><span class="mu-bg"></span>${i === 0 ? '<span class="mu-glow"></span>' : ''}<span class="mu-focus"></span>
        <span class="hm-t"><b>${esc(c.label)}</b>${c.sub ? `<em>${esc(c.sub)}</em>` : ''}</span><kbd data-pad="${i === 0 ? 'south' : ''}">${i + 1}</kbd></button>`,
        )
        .join('') + `<button type="button" class="hm-opt hm-cancel mu-frame mu-sm" data-id=""><span class="mu-bg"></span><span class="mu-focus"></span><span class="hm-t"><b>${esc(w.cancel)}</b></span><kbd data-pad="east">Esc</kbd></button>`;
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
    closePad = on ? pad.openLayer(wrap, { first: () => buttons()[0] ?? null, back: () => choose(null) }) : null;
    if (!on && wrap.querySelector('.pad-focus')) clearMark();
  }

  function choose(id: string | null): void {
    if (!isOpen) return;
    show(false);
    (document.activeElement as HTMLElement | null)?.blur();
    sound?.(id ? 'select' : 'close');
    const f = pick;
    pick = null;
    f?.(id);
  }

  opts.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (b) choose(b.dataset.id || null);
  });
  // (a click or a tap beside the card: "Not now")
  wrap.addEventListener('pointerdown', (e) => {
    if (isOpen && e.target === wrap) choose(null);
  });
  addEventListener(
    'keydown',
    (e) => {
      if (!isOpen || e.ctrlKey || e.metaKey || e.altKey) return;
      const list = buttons();
      const at = list.indexOf(document.activeElement as HTMLButtonElement);
      if (e.code === 'Escape') choose(null);
      else if (/^(Digit|Numpad)[1-9]$/.test(e.code)) {
        const i = Number(e.code.slice(-1)) - 1;
        if (i < list.length - 1) choose(list[i].dataset.id || null);
      } else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') choose((at >= 0 ? list[at] : list[0]).dataset.id || null);
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.code === 'Tab') {
        const back = e.key === 'ArrowUp' || e.key === 'ArrowLeft' || (e.code === 'Tab' && e.shiftKey);
        const to = list[at < 0 ? 0 : (at + (back ? -1 : 1) + list.length) % list.length];
        // (the pad's arrows are not trusted: they move its own ring, nav.ts)
        if (!e.isTrusted && pad.active) markFocus(to);
        else to.focus({ preventScroll: true });
        sound?.('hover');
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
    .hm-ask .mu-ask-card { width: min(calc(420 * var(--px)), 100%); }
    .hm-icon-wrap { display: grid; place-items: center; flex: none; width: calc(48 * var(--px)); height: calc(48 * var(--px)); border-radius: 50%;
      background: rgba(10, 18, 30, 0.75); box-shadow: inset 0 0 0 calc(1.5 * var(--px)) rgba(255, 216, 120, 0.55), 0 0 calc(12 * var(--px)) rgba(255, 200, 100, 0.25); }
    .hm-icon { width: calc(32 * var(--px)); height: calc(32 * var(--px)); }
    .hm-ask #hm-note[hidden] { display: none; }
    .hm-opts { display: grid; gap: calc(8 * var(--px)); margin-top: calc(16 * var(--px)); }
    .hm-opt { position: relative; display: flex; align-items: center; gap: calc(10 * var(--px)); min-height: calc(46 * var(--px)); padding: calc(7 * var(--px)) calc(12 * var(--px)) calc(7 * var(--px)) calc(16 * var(--px));
      border: 0; background: none; cursor: pointer; outline: none; text-align: left; color: var(--mu-ink); touch-action: manipulation;
      --mu-edge: var(--mu-btn-edge); --mu-shadow: none; transition: transform 0.3s var(--mu-ease); }
    .hm-opt > .mu-bg { background: var(--mu-btn); }
    .hm-opt.is-gold { color: #2b1904; --mu-edge: rgba(255, 250, 225, 0.85); --mu-shadow: 0 calc(6 * var(--px)) calc(18 * var(--px)) rgba(40, 20, 0, 0.35); }
    .hm-opt.is-gold > .mu-bg { background: linear-gradient(180deg, #ffdc80 0%, #f7bd40 55%, #eba52a 100%); }
    .hm-opt.is-gold > .mu-glow { opacity: 0.45; }
    .hm-t { flex: 1; display: flex; flex-direction: column; gap: calc(2 * var(--px)); min-width: 0; }
    .hm-t b { font: 700 calc(16 * var(--px)) / 1.2 var(--mu-display); letter-spacing: 0.01em; }
    .hm-t em { font-style: normal; font-size: calc(12.5 * var(--px)); font-weight: 600; color: var(--mu-ink2); }
    .hm-opt.is-gold .hm-t em { color: #5a3a0c; }
    .hm-cancel { min-height: calc(40 * var(--px)); }
    .hm-cancel .hm-t b { font-size: calc(14.5 * var(--px)); font-weight: 600; color: var(--mu-ink2); }
    .hm-opt kbd { display: inline-grid; place-items: center; min-width: calc(20 * var(--px)); height: calc(20 * var(--px)); padding: 0 calc(5 * var(--px)); box-sizing: border-box;
      font: 600 calc(11.5 * var(--px)) / 1 var(--mu-display); color: var(--mu-ink2); background: rgba(255, 244, 222, 0.1); border: 1px solid var(--mu-line-hi); border-bottom-width: 2px; border-radius: calc(3 * var(--px)); }
    .hm-opt.is-gold kbd { color: #4a2e08; background: rgba(90, 50, 0, 0.12); border-color: rgba(90, 50, 0, 0.4); }
    body.pad-on .hm-opt kbd:not([data-pad]), body.pad-on .hm-opt kbd[data-pad=""] { visibility: hidden; }
    @media (hover: hover) {
      .hm-opt:hover { transform: translateY(var(--mu-lift)); }
      .hm-opt:not(.is-gold):hover > .mu-bg { background: var(--mu-btn-hi); }
      .hm-opt.is-gold:hover > .mu-glow { opacity: 1; }
    }
    .hm-opt:focus-visible, .hm-opt.pad-focus { --mu-edge: rgba(255, 244, 214, 0.95); }
    .hm-opt:active { transform: scale(0.97); transition-duration: 0.08s; }
    :lang(km) .hm-t b { font-size: calc(17 * var(--px)); line-height: 1.4; letter-spacing: 0; }
    :lang(km) .hm-t em { font-size: calc(13.5 * var(--px)); line-height: 1.4; }
    :lang(km) .hm-cancel .hm-t b { font-size: calc(15.5 * var(--px)); }
    @media (pointer: coarse) { .hm-opt kbd { display: none; } .hm-opt { min-height: 50px; } }
    body.roam-touch:not(.pad-on) .hm-opt kbd { display: none; }
    .mu-calm ~ .hm-ask .hm-opt { transform: none !important; }`;
  document.head.append(style);
}
