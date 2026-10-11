import { clearMark, markFocus } from '../pad/nav';
import { pad } from '../pad/pad';
import type { UISound } from '../types';
import { ICON } from '../ui/icons';
import { lang, onLang } from '../ui/lang';
import { setSteppedVars } from '../ui/shape';
import { DOG_MENU_ICON, DOG_ORDER_ICONS, DOG_ORDERS, type DogOrder } from './_dogHook';

/**
 * The small card that tells his dog what to do (roam/_dog.ts: 0 by the dog):
 * in the middle of the screen, the look of the map's cards that ask (map.css
 * `.mu-ask`: the strong glass, the gold edge, the ornament line), the dog
 * sitting as its picture and "ប្រាប់សុនខ… / Tell …" (its name), then the three
 * orders one under the other, each with its picture and a line on what it
 * does: **Follow me**, **Stay here**, **Go home**; the one it does now is lit
 * gold and says "ឥឡូវនេះ / now"; and a quiet "Not now".
 *
 * Keys (its own while it is up: a capture listener, the roaming keys never
 * see them): 1‥3 pick, ↑ ↓ (or ← →, Tab) move between them, Enter or Space
 * presses the one in focus (with none, the first it does not do now), Esc or
 * 0 is "Not now". A game pad: a layer (pad.openLayer), its focus on the first
 * it does not do now — the d-pad or the stick moves, ✕ presses, ○ is "Not
 * now". Touch or a mouse: a tap or a click; beside the card is "Not now".
 * While it is up the body has `mu-asking` (the dog's add-on holds him still).
 */

export interface DogOrderWords {
  title: string;
  /** The tag on the one it does now. */
  now: string;
  cancel: string;
  /** Each order's words, and the line under it. */
  choices: Record<DogOrder, { label: string; sub: string }>;
}

export interface DogOrderCard {
  readonly open: boolean;
  /**
   * Ask (`onPick` gets the order, or null for "Not now"). Words in the language in use (`words` is called again when
   * it changes); `now`: what it does now.
   */
  ask(words: () => DogOrderWords, now: DogOrder, onPick: (o: DogOrder | null) => void): void;
  /** Shut it (as "Not now", quietly). */
  close(): void;
  /** Checks: the focus ring on order `i`. */
  ring(i: number): void;
}

const SHOT = typeof location !== 'undefined' && new URLSearchParams(location.search).get('shot') === '1';
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
/** The dog sitting (the explorer menu's picture, _dogHook.ts), big at the card's head; the orders' small ones. */
const DOG_ICON = DOG_MENU_ICON.replace('class="rxm-icon"', 'class="dgo-dog"');
const PICS = Object.fromEntries(DOG_ORDERS.map((o) => [o, DOG_ORDER_ICONS[o].replace('class="rxm-icon"', 'class="dgo-pic"')])) as Record<DogOrder, string>;

export function createDogOrderCard(sound?: (s: UISound) => void): DogOrderCard {
  injectStyle();
  const wrap = document.createElement('div');
  wrap.className = 'map-ui mu-ask dgo';
  if (SHOT) wrap.classList.add('mu-shot');
  setSteppedVars(wrap);
  wrap.innerHTML = `
    <section class="mu-ask-card mu-frame mu-lg" role="dialog" aria-modal="true" aria-labelledby="dgo-title" aria-hidden="true" tabindex="-1">
      <span class="mu-bg"></span>
      <div class="mu-ask-head"><span class="dgo-icon">${DOG_ICON}</span><h2 id="dgo-title"></h2></div>
      <div class="mu-orn mu-ask-orn" aria-hidden="true"><i></i>${ICON.diamond}<i></i></div>
      <div class="dgo-opts"></div>
    </section>`;
  const anchor = document.querySelector('.map-ui.rh') ?? document.getElementById('ui');
  if (anchor) anchor.after(wrap);
  else document.body.append(wrap);
  const card = wrap.querySelector<HTMLElement>('.mu-ask-card')!;
  const title = wrap.querySelector<HTMLElement>('h2')!;
  const opts = wrap.querySelector<HTMLElement>('.dgo-opts')!;
  let isOpen = false;
  let words: (() => DogOrderWords) | null = null;
  let now: DogOrder = 'follow';
  let pick: ((o: DogOrder | null) => void) | null = null;
  let closePad: (() => void) | null = null;

  const buttons = () => [...opts.querySelectorAll<HTMLButtonElement>('button')];
  /** The first order it does not do now (Enter with nothing in focus, the pad's first). */
  const firstNew = () => buttons().find((b) => b.dataset.id && b.dataset.id !== now) ?? buttons()[0] ?? null;

  function render(): void {
    if (!words) return;
    const w = words();
    wrap.lang = lang();
    title.textContent = w.title;
    opts.innerHTML =
      DOG_ORDERS.map((o, i) => {
        const c = w.choices[o];
        const on = o === now;
        return `<button type="button" class="dgo-opt mu-frame mu-sm${on ? ' is-now' : ''}" data-id="${o}" aria-pressed="${on}"><span class="mu-bg"></span><span class="mu-focus"></span>${PICS[o]}
        <span class="dgo-t"><b>${esc(c.label)}${on ? `<i class="dgo-tag">${esc(w.now)}</i>` : ''}</b><em>${esc(c.sub)}</em></span><kbd>${i + 1}</kbd></button>`;
      }).join('') +
      `<button type="button" class="dgo-opt dgo-cancel mu-frame mu-sm" data-id=""><span class="mu-bg"></span><span class="mu-focus"></span><span class="dgo-t"><b>${esc(w.cancel)}</b></span><kbd data-pad="east">Esc</kbd></button>`;
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
    closePad = on ? pad.openLayer(wrap, { first: firstNew, back: () => choose(null) }) : null;
    if (!on && wrap.querySelector('.pad-focus')) clearMark();
  }

  function choose(id: string | null): void {
    if (!isOpen) return;
    show(false);
    (document.activeElement as HTMLElement | null)?.blur();
    sound?.(id ? 'select' : 'close');
    const f = pick;
    pick = null;
    f?.(id ? (id as DogOrder) : null);
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
      if (!isOpen || e.ctrlKey || e.metaKey || e.altKey || document.body.classList.contains('reporting')) return;
      const list = buttons();
      const at = list.indexOf(document.activeElement as HTMLButtonElement);
      if (e.code === 'Escape' || e.code === 'Digit0' || e.code === 'Numpad0') {
        if (!e.repeat) choose(null);
      } else if (/^(Digit|Numpad)[1-3]$/.test(e.code)) choose(DOG_ORDERS[Number(e.code.slice(-1)) - 1]);
      else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
        if (!e.repeat) choose((at >= 0 ? list[at] : firstNew())?.dataset.id || null);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.code === 'Tab') {
        const back = e.key === 'ArrowUp' || e.key === 'ArrowLeft' || (e.code === 'Tab' && e.shiftKey);
        const to = list[at < 0 ? (back ? list.length - 1 : 0) : (at + (back ? -1 : 1) + list.length) % list.length];
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
    ask(w, o, onPick) {
      words = w;
      now = o;
      pick = onPick;
      // (its size and time of day: the roaming interface's)
      const like = document.querySelector<HTMLElement>('.map-ui.rh') ?? document.getElementById('ui');
      if (like) {
        wrap.style.setProperty('--u', like.style.getPropertyValue('--u') || '1');
        wrap.style.setProperty('--mu-n', like.style.getPropertyValue('--mu-n') || '0');
        // (no interface in this shot, `ui=0`: none of it)
        wrap.style.display = like.style.display === 'none' ? 'none' : '';
      }
      render();
      if (isOpen) return;
      show(true);
      sound?.('open');
      // (a pad: its ring on the first it does not do now, `pad.openLayer`; else the card has the focus, no ring until Tab)
      if (pad.active) (document.activeElement as HTMLElement | null)?.blur();
      else card.focus({ preventScroll: true });
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
  // (on map.css's cards that ask, `.mu-ask`, and the home card's choices: the same glass, gold edge, ornament and buttons)
  style.textContent = `
    .mu-ask.dgo { z-index: 66; }
    .dgo .mu-ask-card { width: min(calc(430 * var(--px)), 100%); }
    .dgo-icon { flex: none; display: grid; place-items: center; width: calc(52 * var(--px)); }
    .dgo-dog { width: calc(44 * var(--px)); height: calc(44 * var(--px)); filter: drop-shadow(0 0 calc(8 * var(--px)) rgba(255, 196, 110, 0.3)) drop-shadow(0 calc(2 * var(--px)) 0 rgba(0, 0, 0, 0.35)); }
    .dgo-opts { display: grid; gap: calc(8 * var(--px)); margin-top: calc(14 * var(--px)); }
    .dgo-opt { position: relative; display: flex; align-items: center; gap: calc(12 * var(--px)); min-height: calc(52 * var(--px)); padding: calc(7 * var(--px)) calc(12 * var(--px)) calc(7 * var(--px)) calc(12 * var(--px));
      border: 0; background: none; cursor: pointer; outline: none; text-align: left; color: var(--mu-ink); touch-action: manipulation;
      --mu-edge: var(--mu-btn-edge); --mu-shadow: none; transition: transform 0.3s var(--mu-ease); }
    .dgo-opt > .mu-bg { background: var(--mu-btn); }
    .dgo-pic { flex: none; width: calc(32 * var(--px)); height: calc(32 * var(--px)); filter: drop-shadow(0 calc(1.5 * var(--px)) 0 rgba(0, 0, 0, 0.35)); }
    .dgo-opt.is-now { --mu-edge: rgba(255, 216, 120, 0.85); --mu-shadow: 0 0 calc(14 * var(--px)) rgba(255, 176, 40, 0.25); }
    .dgo-opt.is-now > .mu-bg { background: rgba(58, 44, 20, 0.78); }
    .dgo-opt.is-now .dgo-t b { color: var(--mu-gold-hi); }
    .dgo-t { flex: 1; display: flex; flex-direction: column; gap: calc(2 * var(--px)); min-width: 0; }
    .dgo-t b { display: flex; align-items: center; gap: calc(8 * var(--px)); font: 700 calc(16 * var(--px)) / 1.2 var(--mu-display); letter-spacing: 0.01em; }
    .dgo-t em { font-style: normal; font-size: calc(12.5 * var(--px)); font-weight: 600; color: var(--mu-ink2); }
    .dgo-tag { font: 700 calc(10.5 * var(--px)) / 1 var(--mu-display); font-style: normal; letter-spacing: 0.04em; text-transform: uppercase; color: #2b1904;
      padding: calc(3 * var(--px)) calc(6 * var(--px)); border-radius: calc(3 * var(--px)); background: linear-gradient(180deg, #ffdc80 0%, #f7bd40 100%); }
    .dgo-cancel { min-height: calc(40 * var(--px)); padding-left: calc(16 * var(--px)); }
    .dgo-cancel .dgo-t b { font-size: calc(14.5 * var(--px)); font-weight: 600; color: var(--mu-ink2); }
    .dgo-opt kbd { display: inline-grid; place-items: center; min-width: calc(20 * var(--px)); height: calc(20 * var(--px)); padding: 0 calc(5 * var(--px)); box-sizing: border-box;
      font: 600 calc(11.5 * var(--px)) / 1 var(--mu-display); color: var(--mu-ink2); background: rgba(255, 244, 222, 0.1); border: 1px solid var(--mu-line-hi); border-bottom-width: 2px; border-radius: calc(3 * var(--px)); }
    body.pad-on .dgo-opt kbd:not([data-pad]) { visibility: hidden; }
    @media (hover: hover) {
      .dgo-opt:hover { transform: translateY(var(--mu-lift)); }
      .dgo-opt:not(.is-now):hover > .mu-bg { background: var(--mu-btn-hi); }
    }
    .dgo-opt:focus-visible, .dgo-opt.pad-focus { --mu-edge: rgba(255, 244, 214, 0.95); }
    .dgo-opt:active { transform: scale(0.97); transition-duration: 0.08s; }
    :lang(km) .dgo .mu-ask-card h2 { letter-spacing: 0; line-height: 1.35; }
    :lang(km) .dgo-t b { font-size: calc(17 * var(--px)); line-height: 1.4; letter-spacing: 0; }
    :lang(km) .dgo-t em { font-size: calc(13.5 * var(--px)); line-height: 1.4; }
    :lang(km) .dgo-tag { font-size: calc(11.5 * var(--px)); letter-spacing: 0; text-transform: none; }
    :lang(km) .dgo-cancel .dgo-t b { font-size: calc(15.5 * var(--px)); }
    @media (pointer: coarse) { .dgo-opt kbd { display: none; } .dgo-opt { min-height: 54px; } }
    body.roam-touch:not(.pad-on) .dgo-opt kbd { display: none; }
    @media (max-height: 520px) {
      .mu-ask.dgo { padding: 8px; }
      .dgo .mu-ask-orn { margin: 4px 0; }
      .dgo-opts { gap: 6px; margin-top: 8px; }
      .dgo-opt { min-height: 44px; }
      .dgo-t em { display: none; }
    }
    .mu-calm ~ .dgo .dgo-opt { transform: none !important; }`;
  document.head.append(style);
}
