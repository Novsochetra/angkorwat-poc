import { num, onLang, t } from '../ui/lang';

/**
 * The treasure's bits of the roaming interface, in its layer (roam/hud.ts,
 * `.map-ui.rh`: the map's dark stepped panels, gold for what matters):
 * a small gold counter under "Back to map" while roaming ("4 / 15", a tiny
 * golden figure beside it; it glows for a moment when one is found).
 */
export interface TreasureHud {
  /** Figures found and how many there are; `pop`: one was just found. */
  count(n: number, total: number, pop?: boolean): void;
}

export function createTreasureHud(layer: HTMLElement): TreasureHud {
  injectStyle();
  const counter = document.createElement('div');
  counter.className = 'tg-count mu-frame mu-sm';
  counter.setAttribute('role', 'status');
  counter.innerHTML = `<span class="mu-bg"></span><span class="mu-glow"></span>${FIGURE_ICON}<span class="tg-n"></span>`;
  layer.append(counter);
  const nEl = counter.querySelector<HTMLElement>('.tg-n')!;

  let found = -1;
  let of = 0;
  let popTimer = 0;
  const words = () => {
    nEl.textContent = `${num(found)} / ${num(of)}`;
    counter.setAttribute('aria-label', `${t('tgCount')}: ${num(found)} / ${num(of)}`);
    counter.title = t('tgCount');
  };
  onLang(words);

  return {
    count(n, total, pop = false) {
      if (n !== found || total !== of) {
        found = n;
        of = total;
        words();
      }
      if (pop) {
        counter.classList.remove('is-pop');
        void counter.offsetWidth;
        counter.classList.add('is-pop');
        clearTimeout(popTimer);
        popTimer = window.setTimeout(() => counter.classList.remove('is-pop'), 2400);
      }
      counter.classList.toggle('is-all', n >= total && total > 0);
    },
  };
}

/** A tiny golden apsara on a plinth (16 × 16 pixel art, like the map's icons). */
const FIGURE_ICON = `<svg class="tg-icon" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges">
  <path fill="#ffe89a" d="M7 0h2v1h1v2H6V1h1z"/>
  <path fill="#f3c24d" d="M6 3h4v2H9v1h2v1h2V6h1v2h-2v1h-2v2h1v1h1v1H3v-1h1v-1h1V9H4V8H2V6h1v1h2V6h2V5H6z"/>
  <path fill="#b27a1c" d="M7 3h1v1H7zM2 14h12v2H2zM6 9h4v1H6z"/>
  <path fill="#ffe89a" d="M3 13h10v1H3z"/>
</svg>`;

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  style.textContent = `
    /* The gold counter: small, under "Back to map". */
    .rh > .tg-count { left: calc(24 * var(--px)); top: calc(76 * var(--px)); gap: calc(7 * var(--px)); padding: calc(6 * var(--px)) calc(12 * var(--px)) calc(6 * var(--px)) calc(9 * var(--px));
      font: 700 calc(15 * var(--px)) / 1 var(--mu-display); color: var(--mu-ink); letter-spacing: 0.02em; --mu-edge: rgba(255, 208, 112, 0.45);
      opacity: 0; visibility: hidden; transition: opacity 0.6s, visibility 0s 0.6s; pointer-events: none; }
    :lang(km) .rh > .tg-count { letter-spacing: 0; }
    .rh > .tg-count > .mu-bg { background: color-mix(in srgb, rgba(13, 25, 39, 0.62), rgba(4, 15, 32, 0.62) var(--mu-night)); }
    .rh > .tg-count .mu-glow { opacity: 0; transition: opacity 0.8s; }
    .rh.is-roam > .tg-count { opacity: 1; visibility: visible; transition: opacity 0.6s 0.5s, visibility 0s; }
    .rh[data-mode='leap'] > .tg-count { opacity: 0; visibility: hidden; }
    .tg-icon { flex: none; width: calc(18 * var(--px)); height: calc(18 * var(--px)); filter: drop-shadow(0 calc(1 * var(--px)) 0 rgba(0, 0, 0, 0.35)); }
    .tg-n { color: var(--mu-gold-hi); text-shadow: 0 calc(1 * var(--px)) 0 rgba(0, 0, 0, 0.35); }
    .rh > .tg-count.is-pop { --mu-edge: var(--mu-gold-hi); }
    .rh > .tg-count.is-pop .mu-glow { opacity: 0.9; }
    .rh > .tg-count.is-pop .tg-icon { animation: tg-pop 0.9s var(--mu-ease); }
    .rh > .tg-count.is-all { --mu-edge: rgba(255, 224, 140, 0.85); }
    @keyframes tg-pop { 30% { transform: scale(1.35) translateY(calc(-2 * var(--px))); } }
    body:has(.fb-button) .rh > .tg-count { top: calc(76 * var(--px)); }

    @media (max-width: 639px) {
      .rh > .tg-count { left: 10px; top: 58px; }
    }`;
  document.head.append(style);
}
