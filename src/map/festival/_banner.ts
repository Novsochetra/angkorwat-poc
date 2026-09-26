import { onLang, t } from '../ui/lang';
import type { Festival } from './_schedule';

/**
 * The festival's name on screen (words in ui/lang.ts, Khmer first):
 *  - in the picker, a small ribbon under the title card (the gold kicker
 *    "Festival", its name, a line of what is on);
 *  - when roaming starts, the same as a toast at the top, once, for a few
 *    seconds.
 * Made on the first frame (the interface fills its root after the parts are
 * built), inside the interface's root, with its panel look (map.css).
 */

const STYLE = `
.mu-fest { position: absolute; left: calc(24 * var(--px)); top: 0; display: flex; align-items: center; gap: calc(12 * var(--px));
  padding: calc(8 * var(--px)) calc(18 * var(--px)) calc(9 * var(--px)) calc(14 * var(--px)); opacity: 0; transition: opacity 0.8s, transform 0.8s var(--mu-ease);
  transform: translateY(calc(-6 * var(--px))); pointer-events: none; }
.mu-fest.is-on { opacity: 1; transform: none; }
.mu-fest .mu-fest-icon { width: calc(30 * var(--px)); height: calc(30 * var(--px)); flex: none; color: var(--mu-gold); }
.mu-fest .mu-fest-kick { display: block; font-size: calc(12 * var(--px)); letter-spacing: 0.08em; color: var(--mu-gold); text-transform: uppercase; }
:lang(km) .mu-fest .mu-fest-kick { letter-spacing: 0; text-transform: none; }
.mu-fest .mu-fest-name { display: block; font: 400 calc(21 * var(--px)) / 1.15 var(--mu-display); color: var(--mu-ink); white-space: nowrap; }
.mu-fest .mu-fest-note { display: block; font-size: calc(13.5 * var(--px)); color: var(--mu-ink2); white-space: nowrap; margin-top: calc(2 * var(--px)); }
.mu-fest.is-toast { left: 50%; top: calc(20 * var(--px)); transform: translate(-50%, calc(-8 * var(--px))); }
.mu-fest.is-toast.is-on { transform: translate(-50%, 0); }
.mu-shot .mu-fest { transition: none; }
`;

/** A boat's prow for the Water Festival, a small stupa with a flag for New Year (currentColor). */
const ICON: Record<Festival, string> = {
  water: `<svg class="mu-fest-icon" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M3 20h20l3-6 2 1-2 7c-.3 1-1.2 2-2.4 2H7.5C6 24 4.2 22.4 3 20zm5-3 1.5-3h1l-1.5 3zm4 0 1.5-3h1l-1.5 3zm4 0 1.5-3h1l-1.5 3zm7-7c1.6-.3 3 .6 3.4 2l-2 .8c-.3-.6-.8-.9-1.4-.8z"/><path fill="currentColor" opacity=".55" d="M2 26c2 0 2 1 4 1s2-1 4-1 2 1 4 1 2-1 4-1 2 1 4 1 2-1 4-1 2 1 4 1v1.5c-2 0-2-1-4-1s-2 1-4 1-2-1-4-1-2 1-4 1-2-1-4-1-2 1-4 1-2-1-4-1z"/></svg>`,
  newyear: `<svg class="mu-fest-icon" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M16 4l1 5h-2zM13 10h6l1 4h-8zm-2 5h10l1.5 5h-13zm-3 6h16l1.5 5H6.5z"/><path fill="currentColor" opacity=".6" d="M17 3.5h6l-2 1.8 2 1.8h-6z"/></svg>`,
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
  /** Toasts already shown (once per festival a visit). */
  const toasted = new Set<Festival>();

  const fill = () => {
    if (!el || !shown) return;
    el.querySelector('.mu-fest-kick')!.textContent = t('festKicker');
    el.querySelector('.mu-fest-name')!.textContent = t(shown === 'water' ? 'festWater' : 'festNewYear');
    el.querySelector('.mu-fest-note')!.textContent = t(shown === 'water' ? 'festWaterNote' : 'festNewYearNote');
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

  /** Under the title card (measured: its size follows the window and the language). */
  const place = () => {
    const title = document.querySelector<HTMLElement>('.mu-title');
    if (!el || !title) return;
    const r = title.getBoundingClientRect();
    const root = el.parentElement!.getBoundingClientRect();
    el.style.top = `${Math.round(r.bottom - root.top + 10)}px`;
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
        }
      }
      // A toast once when roaming starts during a festival.
      if (roaming && !wasRoaming && kind && !toasted.has(kind)) {
        toasted.add(kind);
        toastUntil = time + 7;
      }
      wasRoaming = roaming;
      const toast = roaming && time < toastUntil;
      el.classList.toggle('is-toast', roaming);
      // (measured twice a second: the title's size follows the window and the language)
      if (!roaming && Math.abs(time - placedAt) > 0.5) {
        placedAt = time;
        place();
      }
      el.classList.toggle('is-on', !!kind && (!roaming || toast));
    },
  };
}
