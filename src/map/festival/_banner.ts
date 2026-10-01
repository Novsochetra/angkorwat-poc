import { onLang, t, type WordKey } from '../ui/lang';
import type { Festival } from './_schedule';

/**
 * The festival's name on screen (words in ui/lang.ts, Khmer first):
 *  - in the picker, a small ribbon under the title card (the gold kicker
 *    "Festival", its name, a line of what is on);
 *  - when roaming starts, the same as a toast at the top, once, for a few
 *    seconds.
 * Made on the first frame (the interface fills its root after the parts are
 * built), inside the interface's root, with its panel look (map.css).
 *
 * It never covers a control: it is no wider than the screen less a margin (its
 * lines wrap on a phone), and where it would lie over a button, a counter or a
 * toolbar of the interface (the roaming "Back to the map", the gold figures and
 * the purse, the corner buttons, the mini-map, the calendar's button, the
 * roaming toasts' place) it goes down below them (`clear`, measured twice a
 * second); with no room in the top half of the screen it is not shown. The
 * place cards of the picker move with the map: they are not in its way.
 */

const STYLE = `
.mu-fest { position: absolute; left: calc(24 * var(--px)); top: 0; display: flex; align-items: center; gap: calc(12 * var(--px));
  padding: calc(8 * var(--px)) calc(18 * var(--px)) calc(9 * var(--px)) calc(14 * var(--px)); opacity: 0; transition: opacity 0.8s, transform 0.8s var(--mu-ease);
  transform: translateY(calc(-6 * var(--px))); pointer-events: none; max-width: calc(100% - 24px); box-sizing: border-box; }
.mu-fest.is-hidden { visibility: hidden; }
.mu-fest.is-on { opacity: 1; transform: none; }
.mu-fest .mu-fest-icon { width: calc(30 * var(--px)); height: calc(30 * var(--px)); flex: none; color: var(--mu-gold); }
.mu-fest .mu-fest-kick { display: block; font-size: calc(12 * var(--px)); letter-spacing: 0.08em; color: var(--mu-gold); text-transform: uppercase; }
:lang(km) .mu-fest .mu-fest-kick { letter-spacing: 0; text-transform: none; }
.mu-fest .mu-fest-name { display: block; font: 400 calc(21 * var(--px)) / 1.15 var(--mu-display); color: var(--mu-ink); }
.mu-fest .mu-fest-note { display: block; font-size: calc(13.5 * var(--px)); color: var(--mu-ink2); margin-top: calc(2 * var(--px)); }
.mu-fest.is-toast { left: 50%; top: calc(20 * var(--px)); transform: translate(-50%, calc(-8 * var(--px))); text-align: left; width: max-content; }
.mu-fest.is-compact .mu-fest-note { display: none; }
.mu-fest.is-compact { padding-top: calc(6 * var(--px)); padding-bottom: calc(6 * var(--px)); }
.mu-fest.is-toast.is-on { transform: translate(-50%, 0); }
.mu-shot .mu-fest { transition: none; }
`;

/**
 * The festival's picture (currentColor): a racing boat's prow for the Water Festival, a small stupa with a flag
 * for New Year, a tiffin carrier (chan srak, the stacked food pots families carry to the monks) for Pchum Ben, a
 * lotus bud and a candle under the full moon for Visak Bochea.
 */
const ICON: Record<Festival, string> = {
  water: `<svg class="mu-fest-icon" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M3 20h20l3-6 2 1-2 7c-.3 1-1.2 2-2.4 2H7.5C6 24 4.2 22.4 3 20zm5-3 1.5-3h1l-1.5 3zm4 0 1.5-3h1l-1.5 3zm4 0 1.5-3h1l-1.5 3zm7-7c1.6-.3 3 .6 3.4 2l-2 .8c-.3-.6-.8-.9-1.4-.8z"/><path fill="currentColor" opacity=".55" d="M2 26c2 0 2 1 4 1s2-1 4-1 2 1 4 1 2-1 4-1 2 1 4 1 2-1 4-1 2 1 4 1v1.5c-2 0-2-1-4-1s-2 1-4 1-2-1-4-1-2 1-4 1-2-1-4-1-2 1-4 1-2-1-4-1z"/></svg>`,
  newyear: `<svg class="mu-fest-icon" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M16 4l1 5h-2zM13 10h6l1 4h-8zm-2 5h10l1.5 5h-13zm-3 6h16l1.5 5H6.5z"/><path fill="currentColor" opacity=".6" d="M17 3.5h6l-2 1.8 2 1.8h-6z"/></svg>`,
  pchumben: `<svg class="mu-fest-icon" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M11.5 3.5h9v1.8h-1.6v2.4h-1.8V5.3h-2.2v2.4h-1.8V5.3h-1.6zM9 9h14v1.6H9zm.6 2.2h12.8v4H9.6zM9 16.4h14V18H9zm.6 2.2h12.8v4H9.6zM9 23.8h14v1.6H9zm.6 2.2h12.8v2.5c0 .6-.5 1-1 1H10.6c-.5 0-1-.4-1-1z"/><path fill="currentColor" opacity=".55" d="M7.4 8.6h1.2v21H7.4zm16 0h1.2v21h-1.2z"/></svg>`,
  visak: `<svg class="mu-fest-icon" viewBox="0 0 32 32" aria-hidden="true"><circle cx="22.5" cy="8.5" r="5" fill="currentColor" opacity=".45"/><path fill="currentColor" d="M12.5 7.5c.9 1.4 1.5 2.9 1.5 4.2 0 1.4-.7 2.4-1.5 2.4S11 13.1 11 11.7c0-1.3.6-2.8 1.5-4.2z"/><path fill="currentColor" d="M11.6 15.2h1.8v8.3h-1.8z"/><path fill="currentColor" d="M19 12.5c2.6 2.3 4 5 4 7.5 0 3.4-2.4 5.6-5 5.6s-5-2.2-5-5.6c0-2.5 1.4-5.2 4-7.5l1 4.4z" opacity=".9"/><path fill="currentColor" d="M5 27.5c3.8-1.6 7.6-1.6 11.4 0 3.8 1.6 7.6 1.6 11.4 0v1.6c-3.8 1.6-7.6 1.6-11.4 0-3.8-1.6-7.6-1.6-11.4 0z" opacity=".6"/></svg>`,
};

/** Its name and its line of what is on (ui/lang.ts). */
const WORDS: Record<Festival, [WordKey, WordKey]> = {
  water: ['festWater', 'festWaterNote'],
  newyear: ['festNewYear', 'festNewYearNote'],
  pchumben: ['pchumName', 'pchumNote'],
  visak: ['visakName', 'visakNote'],
};

export interface FestivalBanner {
  /** Every frame: the festival on now (or none) and whether he roams. */
  update(kind: Festival | null, roaming: boolean, t: number): void;
}

export function createBanner(): FestivalBanner {
  let el: HTMLElement | null = null;
  let shown: Festival | null = null;
  let toastUntil = -1;
  let wasRoaming = false;
  let placedAt = -1e9;
  /** Frames since it was last placed afresh: the first few are measured each frame (the interface still laying out). */
  let framesSince = 0;
  /** Toasts already shown (once per festival a visit). */
  const toasted = new Set<Festival>();

  const fill = () => {
    if (!el || !shown) return;
    el.querySelector('.mu-fest-kick')!.textContent = t('festKicker');
    el.querySelector('.mu-fest-name')!.textContent = t(WORDS[shown][0]);
    el.querySelector('.mu-fest-note')!.textContent = t(WORDS[shown][1]);
  };

  const make = (): HTMLElement | null => {
    const root = document.getElementById('ui');
    if (!root || !root.classList.contains('mu-root')) return null;
    if (!document.getElementById('mu-fest-style')) {
      const s = document.createElement('style');
      s.id = 'mu-fest-style';
      s.textContent = STYLE;
      document.head.append(s);
    }
    const e = document.createElement('div');
    e.className = 'mu-fest mu-frame mu-md';
    e.setAttribute('role', 'status');
    e.innerHTML = `<span class="mu-bg"></span><span class="mu-fest-ico"></span><span><span class="mu-fest-kick"></span><span class="mu-fest-name"></span><span class="mu-fest-note"></span></span>`;
    root.append(e);
    onLang(fill);
    return e;
  };

  /**
   * Where it goes (measured: the window's size, the language, what the interface shows): in the picker under the
   * title card, roaming at the top in the middle; then down below whatever control it would cover there (`clear`),
   * hidden when that is past the screen's top half.
   */
  const place = (roaming: boolean) => {
    if (!el) return;
    const root = el.parentElement!.getBoundingClientRect();
    // (a short screen, a phone held sideways: one line, its name, without the line of what is on)
    el.classList.toggle('is-compact', root.height < SHORT);
    el.style.left = '';
    let top: number;
    let left: number;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (roaming) {
      // (the style's own top first: 20 px of the interface's scale)
      el.style.top = '';
      top = el.offsetTop;
      left = (root.width - w) / 2;
    } else {
      const title = document.querySelector<HTMLElement>('.mu-title');
      if (!title) return;
      const tr = title.getBoundingClientRect();
      top = tr.bottom - root.top + 10;
      left = el.offsetLeft;
      // (short: beside the title card when it fits there, not over the place cards below it)
      if (root.height < SHORT) {
        const x = tr.right - root.left + 12;
        const y = tr.top - root.top;
        if (clear(el, root, x, y, w, h, true) === y && x + w < root.width - 12) {
          top = y;
          left = x;
          el.style.left = `${Math.round(x)}px`;
        }
      }
    }
    const y = clear(el, root, left, top, w, h, !roaming);
    el.classList.toggle('is-hidden', y + h > root.height * 0.5);
    el.style.top = `${Math.round(y)}px`;
  };

  return {
    update(kind, roaming, time) {
      if (!el) {
        if (!kind) return;
        el = make();
        if (!el) return;
      }
      if (kind !== shown) {
        shown = kind;
        if (kind) {
          el.querySelector('.mu-fest-ico')!.innerHTML = ICON[kind];
          fill();
          placedAt = -1e9;
        }
      }
      // A toast once when roaming starts during a festival.
      if (roaming && !wasRoaming && kind && !toasted.has(kind)) {
        toasted.add(kind);
        toastUntil = time + 7;
      }
      const was = wasRoaming;
      wasRoaming = roaming;
      const toast = roaming && time < toastUntil;
      el.classList.toggle('is-toast', roaming);
      // (measured twice a second while it shows, and as it comes up: the window, the language, the interface)
      const on = !!kind && (!roaming || toast);
      const fresh = roaming !== was || !el.classList.contains('is-on');
      framesSince = fresh ? 0 : framesSince + 1;
      if (on && (fresh || framesSince < 12 || Math.abs(time - placedAt) > 0.5)) {
        placedAt = time;
        place(roaming);
      }
      el.classList.toggle('is-on', on);
    },
  };
}

/** Screens shorter than this (px) get it on one line (a phone held sideways). */
const SHORT = 520;

/** What it must not cover: the interface's controls and counters (the picker's place cards move with the map: not those). */
const CONTROLS = 'button, a[href], [role="button"], [role="toolbar"], [role="status"]';

/**
 * The lowest top (px in the root, from `top` down) where a box `w` × `h` at `left` covers none of the interface's
 * controls: each one it would cover pushes it down below that one, a few times over. Toasts and counters
 * (`role="status"`) keep their place even while they are not showing (they come and go: the banner does not jump).
 */
function clear(self: HTMLElement, root: DOMRect, left: number, top: number, w: number, h: number, picker: boolean): number {
  const boxes: { l: number; t: number; r: number; b: number }[] = [];
  for (const c of document.querySelectorAll<HTMLElement>(CONTROLS)) {
    if (self.contains(c) || (picker && c.closest('.mu-pin'))) continue;
    const r = c.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.top - root.top > root.height * 0.5) continue;
    const cs = getComputedStyle(c);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    // (in the picker a faded control is not in the way; roaming, its controls may still be fading in as it comes up: they are)
    if (picker && c.getAttribute('role') !== 'status' && Number(cs.opacity) < 0.05) continue;
    boxes.push({ l: r.left - root.left, t: r.top - root.top, r: r.right - root.left, b: r.bottom - root.top });
  }
  const gap = 6;
  let y = top;
  for (let pass = 0; pass < 12; pass++) {
    let moved = false;
    for (const o of boxes)
      if (left < o.r + gap && left + w > o.l - gap && y < o.b + gap && y + h > o.t - gap) {
        y = o.b + gap + 2;
        moved = true;
      }
    if (!moved) break;
  }
  return y;
}
