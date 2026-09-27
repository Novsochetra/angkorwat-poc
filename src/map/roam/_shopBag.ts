import { num, onLang, t } from '../ui/lang';
import { itemIcon, RIEL_ICON } from './_shopIcons';
import { isDrink } from './_shopMenu';
import { CARRY_MAX, nameOf, riel, type Purse } from './_shopPurse';

/**
 * The purse and the bag in the roaming interface (buying: _shop.ts):
 *
 * - **the purse**: a small line under the gold counter at the top left
 *   while roaming (a riel note and "២០,០០០ ៛"; it glows for a moment when
 *   he pays or gets pocket money);
 * - **the bag's slot** on the tool bar, after the selfie phone (6): the
 *   first thing he keeps for later, how many he carries; only there while
 *   he carries something. 6, a click or a tap eats or drinks it;
 * - **the explorer menu's "In my bag"** (I, or his face on the tool bar):
 *   the purse, and each thing he carries as a button (a tap eats or drinks
 *   that one) — the touch player's way to it.
 */
export interface ShopBag {
  /** The tool bar's slot (tools.ts puts it after the selfie phone's). */
  readonly slot: HTMLButtonElement;
  /** The explorer menu's section (_explorerMenu.ts puts it after the faces). */
  readonly section: HTMLElement;
  /** The purse or the bag changed (`pop`: the purse glows, e.g. he paid). */
  update(pop?: 'purse' | 'bag'): void;
}

export interface ShopBagDeps {
  /** The roaming interface's layer (roam/hud.ts): the purse goes in there. */
  layer: HTMLElement;
  purse: Purse;
  /** The slot was clicked or tapped (6). */
  onSlot(): void;
  /** Thing `i` of the bag was picked in the explorer menu. */
  onPick(i: number): void;
}

export function createShopBag(d: ShopBagDeps): ShopBag {
  injectStyle();
  const { purse } = d;
  // ── The purse under the gold counter ──
  const chip = document.createElement('div');
  chip.className = 'by-purse mu-frame mu-sm';
  chip.setAttribute('role', 'status');
  chip.innerHTML = `<span class="mu-bg"></span><span class="mu-glow"></span>${RIEL_ICON}<span class="by-purse-n"></span>`;
  d.layer.append(chip);
  const chipN = chip.querySelector<HTMLElement>('.by-purse-n')!;

  // ── The tool bar's slot (6) ──
  const slot = document.createElement('button');
  slot.type = 'button';
  slot.className = 'rtb-slot by-slot';
  slot.dataset.key = '6';
  slot.innerHTML = `<span class="rtb-bg"></span><span class="by-slot-art"></span><kbd>6</kbd><b class="by-slot-n"></b>`;
  const slotArt = slot.querySelector<HTMLElement>('.by-slot-art')!;
  const slotN = slot.querySelector<HTMLElement>('.by-slot-n')!;
  slot.addEventListener('click', () => {
    slot.blur();
    d.onSlot();
  });

  // ── The explorer menu's "In my bag" ──
  const section = document.createElement('section');
  section.className = 'rxm-sec by-sec';
  section.innerHTML = `<b class="rxm-h"><span class="by-sec-h"></span><kbd>6</kbd></b><span class="by-sec-purse">${RIEL_ICON}<b></b></span><div class="rxm-grid by-sec-grid"></div><span class="rxm-note by-sec-none"></span>`;
  const secGrid = section.querySelector<HTMLElement>('.by-sec-grid')!;
  const secNone = section.querySelector<HTMLElement>('.by-sec-none')!;
  section.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.by-bagb');
    if (!b) return;
    b.blur();
    d.onPick(Number(b.dataset.i));
  });

  let popTimer = 0;
  let slotTimer = 0;
  /** What shows now (to touch the page only when it changes). */
  let shown = '';
  function fill(): void {
    const kept = purse.kept;
    const key = `${purse.riel}|${kept.map((k) => k.shop + k.id).join(',')}|${num(1)}`;
    if (key === shown) return;
    shown = key;
    chipN.textContent = riel(purse.riel);
    chip.setAttribute('aria-label', `${t('byPurse')}: ${riel(purse.riel)}`);
    chip.title = t('byPurse');
    const first = kept[0];
    slot.hidden = !first;
    if (first) {
      slotArt.innerHTML = itemIcon(first, 'rtb-icon by-slot-icon');
      slotN.textContent = kept.length > 1 ? num(kept.length) : '';
      slot.title = `${t(isDrink(first.consume) ? 'byDrinkThis' : 'byEatThis', { name: nameOf(first) })} (6)`;
      slot.setAttribute('aria-label', slot.title);
    }
    section.querySelector('.by-sec-h')!.textContent = `${t('byBag')} ${num(kept.length)}/${num(CARRY_MAX)}`;
    section.querySelector('.by-sec-purse b')!.textContent = riel(purse.riel);
    secNone.textContent = t('byBagEmpty');
    secNone.hidden = kept.length > 0;
    secGrid.innerHTML = kept
      .map(
        (k, i) =>
          `<button type="button" class="by-bagb" data-i="${i}"><span class="by-bagb-bg"></span>${itemIcon(k, 'rxm-icon')}<span class="rxm-t">${esc(t(isDrink(k.consume) ? 'byDrinkThis' : 'byEatThis', { name: nameOf(k) }))}</span>${i === 0 ? '<kbd>6</kbd>' : ''}</button>`,
      )
      .join('');
  }
  fill();
  onLang(() => {
    shown = '';
    fill();
  });

  return {
    slot,
    section,
    update(pop) {
      fill();
      if (pop === 'purse') {
        chip.classList.remove('is-pop');
        void chip.offsetWidth;
        chip.classList.add('is-pop');
        clearTimeout(popTimer);
        popTimer = window.setTimeout(() => chip.classList.remove('is-pop'), 1800);
      } else if (pop === 'bag' && !slot.hidden) {
        slot.classList.remove('is-pop');
        void slot.offsetWidth;
        slot.classList.add('is-pop');
        clearTimeout(slotTimer);
        slotTimer = window.setTimeout(() => slot.classList.remove('is-pop'), 1800);
      }
    },
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  style.textContent = `
    /* The purse: small, under the gold counter (or where it would be). */
    .rh > .by-purse { left: calc(24 * var(--px)); top: calc(112 * var(--px)); gap: calc(7 * var(--px)); padding: calc(5 * var(--px)) calc(11 * var(--px)) calc(5 * var(--px)) calc(8 * var(--px));
      font: 700 calc(14 * var(--px)) / 1 var(--mu-display); color: var(--mu-gold-hi); letter-spacing: 0.02em; --mu-edge: rgba(255, 229, 188, 0.2);
      opacity: 0; visibility: hidden; transition: opacity 0.6s, visibility 0s 0.6s; pointer-events: none; }
    .rh:not(:has(> .tg-count)) > .by-purse { top: calc(76 * var(--px)); }
    :lang(km) .rh > .by-purse { letter-spacing: 0; }
    .rh > .by-purse > .mu-bg { background: color-mix(in srgb, rgba(13, 25, 39, 0.55), rgba(4, 15, 32, 0.55) var(--mu-night)); }
    .rh > .by-purse .mu-glow { opacity: 0; transition: opacity 0.8s; }
    .rh.is-roam > .by-purse { opacity: 1; visibility: visible; transition: opacity 0.6s 0.6s, visibility 0s; }
    .rh[data-mode='leap'] > .by-purse { opacity: 0; visibility: hidden; }
    .rh > .by-purse .by-icon { width: calc(18 * var(--px)); height: calc(18 * var(--px)); }
    .by-purse-n { text-shadow: 0 calc(1 * var(--px)) 0 rgba(0, 0, 0, 0.35); }
    .rh > .by-purse.is-pop { --mu-edge: var(--mu-gold-hi); }
    .rh > .by-purse.is-pop .mu-glow { opacity: 0.8; }
    .rh > .by-purse.is-pop .by-icon { animation: by-note 0.8s var(--mu-ease); }
    @keyframes by-note { 30% { transform: translateY(calc(-3 * var(--px))) rotate(-8deg); } }
    @media (max-width: 639px) {
      .rh > .by-purse { left: 10px; top: 92px; }
      .rh:not(:has(> .tg-count)) > .by-purse { top: 58px; }
    }

    /* The bag's slot on the tool bar (6): only while he carries something. */
    .rtb-slot.by-slot[hidden] { display: none; }
    .by-slot .by-slot-art { display: contents; }
    .by-slot-icon { filter: drop-shadow(0 calc(1.5 * var(--px)) 0 rgba(0, 0, 0, 0.35)); }
    .by-slot-n { position: absolute; right: calc(3 * var(--px)); bottom: calc(2 * var(--px)); font: 700 calc(11 * var(--px)) / 1 var(--mu-display); color: var(--mu-gold-hi);
      text-shadow: 0 1px 0 rgba(0, 0, 0, 0.6); }
    .rtb-slot.by-slot.is-pop { animation: by-bag 0.9s var(--mu-ease); }
    .rtb-slot.by-slot.is-pop .rtb-bg { box-shadow: 0 0 calc(12 * var(--px)) rgba(255, 176, 40, 0.55); }
    @keyframes by-bag { 25% { transform: translateY(calc(-5 * var(--px))) scale(1.08); } }
    body.roam-touch .by-slot-n { font-size: 11px; }

    /* In my bag (the explorer menu). */
    .by-sec-purse { display: flex; align-items: center; gap: calc(6 * var(--px)); margin-top: calc(-2 * var(--px)); font: 700 calc(13 * var(--px)) / 1 var(--mu-display); color: var(--mu-gold-hi); }
    .by-sec-purse .by-icon { width: calc(18 * var(--px)); height: calc(18 * var(--px)); }
    .by-sec .rxm-note.by-sec-none { display: block; }
    .by-sec .rxm-note.by-sec-none[hidden] { display: none; }
    .by-bagb { position: relative; display: flex; align-items: center; gap: calc(8 * var(--px)); min-height: calc(34 * var(--px)); padding: calc(4 * var(--px)) calc(8 * var(--px));
      border: 0; background: none; cursor: pointer; outline: none; color: var(--mu-ink2); isolation: isolate; text-align: left; white-space: nowrap; font: inherit;
      transition: color 0.2s, transform 0.2s var(--mu-ease); }
    .by-bagb-bg { position: absolute; inset: 0; z-index: -1; clip-path: var(--rtb-shape); background: rgba(255, 244, 222, 0.04); transition: background 0.2s; }
    .by-bagb-bg::after { content: ''; position: absolute; inset: 0; clip-path: var(--rtb-ring); background: rgba(255, 229, 188, 0.1); transition: background 0.2s; }
    .by-bagb kbd { flex: none; min-width: calc(18 * var(--px)); height: calc(18 * var(--px)); padding: 0 calc(4 * var(--px)); font-size: calc(11 * var(--px)); }
    .by-bagb:hover, .by-bagb:focus-visible { color: var(--mu-ink); }
    .by-bagb:hover .by-bagb-bg { background: rgba(255, 244, 222, 0.1); }
    .by-bagb:hover .by-bagb-bg::after { background: var(--mu-line-hi); }
    .by-bagb:active { transform: scale(0.96); }
    body.roam-touch .by-bagb { min-height: 44px; gap: 7px; padding: 4px 8px; white-space: normal; line-height: 1.15; }
    body.roam-touch .by-sec .rxm-grid { grid-template-columns: 1fr; }
    body.roam-touch .by-bagb kbd { display: none; }`;
  document.head.append(style);
}

