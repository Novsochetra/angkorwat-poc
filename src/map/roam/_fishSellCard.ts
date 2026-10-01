import { pad } from '../pad/pad';
import type { UISound } from '../types';
import { num, onLang, t, type WordKey } from '../ui/lang';
import { BASKET_ICON, fishIcon, SCALE_ICON } from './_fishSellArt';
import { basket, BASKET_MAX, fishName, fishPrice } from './_fishSellBasket';
import { CLOSE_X, esc, injectSellStyle, PAD_X } from './_fishSellStyle';
import { RIEL_ICON } from './_shopIcons';
import { riel } from './_shopPurse';

/**
 * The sale card at a fish seller (selling his fish: _fishSell.ts opens it
 * with E), in the buy menu's look (_shopMenu.ts): who buys (the fish
 * seller, the fish stall, the fish boat, the grilled fish seller), her
 * words, the fish in his basket — each its own pixels, its name in the
 * language in use and its size, and what she pays once she has weighed it
 * on her hanging dial scale (one after the other: the needle swings, then
 * the price) — "Sell all" with the total, and the purse and the basket at
 * the foot (the purse counts up as she pays).
 *
 * Keys while it is open (its own: a capture listener): 1–5 sell that fish;
 * ↑ ↓ (← → Tab) move the ring (it starts on "Sell all"); Enter, Space or E
 * take the one in the ring; Esc (or the ×) shuts it. A click or a tap on a
 * row or on "Sell all"; touch's Use takes the one in the ring (`confirm`);
 * a tap on the view outside the sheet shuts it on a phone. The game pad: a
 * layer while open (its arrows move the ring, ✕ takes, ○ shuts). Nothing can
 * be sold before it is weighed, nor while a sale is being handed over.
 */
export interface SaleCard {
  /** The panel (its place on the page: the lens shift, _fishSell.ts). */
  readonly el: HTMLElement;
  readonly open: boolean;
  /** Open, for the seller called `name()` (in the language in use), with the purse's riel now. */
  show(name: () => string, rielNow: number): void;
  /** Her words over the list. */
  say(key: WordKey): void;
  /** Rows weighed so far (their prices show; the next one is on the scale). */
  weighed(n: number): void;
  /** A sale under way (nothing more can be picked): rows `sold` fade out. */
  selling(sold: readonly number[] | null): void;
  /** The basket changed (fish sold): the rows again, all weighed. */
  refill(): void;
  /** The purse's riel at the foot (`up`: it glows, counting up). */
  purse(n: number, up: boolean): void;
  close(): void;
  /** Touch's Use (or a check's `e`): take the one in the ring. */
  confirm(): void;
  /** Checks: the ring on `i` (0 "Sell all", 1… the fish). */
  focus(i: number): void;
}

export interface SaleCardDeps {
  layer: HTMLElement;
  /** Sell fish `i` of the basket, or all of them. */
  onSell(which: number | 'all'): void;
  /** Esc, the ×, ○, a tap outside: shut it. */
  onClose(): void;
  sound(s: UISound): void;
}

export function createSaleCard(d: SaleCardDeps): SaleCard {
  injectSellStyle();
  const el = document.createElement('section');
  el.className = 'sl-card sl-sale mu-frame mu-md';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-labelledby', 'sl-sale-title');
  el.innerHTML = `<span class="mu-bg"></span>
    <header class="sl-head">${BASKET_ICON('sl-head-icon')}<h2 id="sl-sale-title"></h2><button type="button" class="sl-x">${CLOSE_X}</button></header>
    <p class="sl-ask" aria-live="polite"></p>
    <div class="sl-list" role="list"></div>
    <button type="button" class="sl-all"><span class="sl-bg"></span>${PAD_X}<span class="sl-all-t"></span><b class="sl-all-n"></b></button>
    <footer class="sl-foot">${RIEL_ICON}<span class="sl-purse-label"></span><b class="sl-riel-foot"></b><span class="sl-foot-basket">${BASKET_ICON('sl-basket-icon')}<span class="sl-foot-n"></span></span></footer>`;
  d.layer.append(el);
  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const title = q('#sl-sale-title');
  const ask = q('.sl-ask');
  const list = q('.sl-list');
  const all = q<HTMLButtonElement>('.sl-all');
  const xBtn = q<HTMLButtonElement>('.sl-x');
  const rielEl = q('.sl-riel-foot');
  let open = false;
  let rows: HTMLButtonElement[] = [];
  /** The ring: 0 "Sell all", i + 1 fish i. */
  let ring = 0;
  let weighedN = 0;
  let busy = false;
  /** While a sale is handed over: the total shown before it (the basket empties as she takes the fish). */
  let frozen: number | null = null;
  let words: WordKey = 'sellWeigh';
  let shownRiel = 0;
  let padClose: (() => void) | null = null;

  /** The rows: the fish in the basket now (in the language in use). */
  function fillList(): void {
    list.innerHTML = basket.fish
      .map(
        (f, i) =>
          `<button type="button" class="sl-item" data-i="${i}" role="listitem"><span class="sl-bg"></span><kbd>${i + 1}</kbd>${PAD_X}${fishIcon(f.kind, 'sl-fish')}<span class="sl-name">${esc(fishName(f.kind))}<small>${esc(t('sellCm', { cm: num(f.cm) }))}</small></span><span class="sl-price">${SCALE_ICON('sl-scale')}<span class="sl-riel">${riel(fishPrice(f.kind, f.cm))}</span></span></button>`,
      )
      .join('');
    rows = [...list.querySelectorAll<HTMLButtonElement>('.sl-item')];
    rows.forEach((b, i) => b.setAttribute('aria-label', `${t('sellOne', { name: fishName(basket.fish[i].kind) })}, ${t('sellCm', { cm: num(basket.fish[i].cm) })}, ${riel(fishPrice(basket.fish[i].kind, basket.fish[i].cm))}`));
    if (ring > rows.length) ring = 0;
  }

  /** The words, what is weighed, "Sell all", the basket. */
  function fill(): void {
    xBtn.setAttribute('aria-label', t('byClose'));
    xBtn.title = `${t('byClose')} (Esc)`;
    q('.sl-purse-label').textContent = t('byPurse');
    rielEl.textContent = riel(shownRiel);
    ask.textContent = `“${t(words)}”`;
    rows.forEach((b, i) => {
      b.classList.toggle('is-weighing', i === weighedN);
      b.classList.toggle('is-waiting', i > weighedN);
      b.disabled = busy || i >= weighedN;
    });
    const done = weighedN >= rows.length && rows.length > 0;
    // (all sold: it says so until the card shuts)
    const empty = basket.n === 0 && frozen === null;
    q('.sl-all-t').textContent = t(empty ? 'sellSoldAll' : 'sellAll');
    q('.sl-all-n').textContent = done && !empty ? riel(frozen ?? basket.total) : '';
    all.disabled = busy || !done || empty;
    all.classList.toggle('is-done', empty);
    q('.sl-foot-n').textContent = `${num(basket.n)}/${num(BASKET_MAX)}`;
    q('.sl-foot-basket').setAttribute('aria-label', `${t('sellBasket')} ${num(basket.n)}/${num(BASKET_MAX)}`);
    light();
  }

  function light(): void {
    all.classList.toggle('is-focus', open && ring === 0);
    rows.forEach((b, i) => b.classList.toggle('is-focus', open && ring === i + 1));
  }

  function setRing(i: number, sound = true): void {
    const n = rows.length + 1;
    i = ((i % n) + n) % n;
    if (i === ring) return;
    ring = i;
    light();
    if (sound) d.sound('hover');
    (ring === 0 ? all : rows[ring - 1])?.scrollIntoView({ block: 'nearest' });
  }

  function sell(which: number | 'all'): void {
    if (!open || busy) return;
    if (which === 'all' ? weighedN < rows.length || !rows.length : which >= weighedN || !rows[which]) return;
    d.sound('select');
    d.onSell(which);
  }

  const take = () => sell(ring === 0 ? 'all' : ring - 1);

  // ── Mouse and touch ──
  list.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.sl-item');
    if (!b) return;
    b.blur();
    const i = Number(b.dataset.i);
    setRing(i + 1, false);
    sell(i);
  });
  list.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.sl-item');
    if (b && !b.disabled) setRing(Number(b.dataset.i) + 1);
  });
  all.addEventListener('click', () => {
    all.blur();
    setRing(0, false);
    sell('all');
  });
  all.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse' && !all.disabled) setRing(0);
  });
  xBtn.addEventListener('click', () => {
    xBtn.blur();
    d.onClose();
  });
  // (a tap on the view outside the sheet shuts it on a phone, as the buy menu)
  addEventListener(
    'pointerdown',
    (e) => {
      if (!open || busy || e.pointerType !== 'touch' || el.contains(e.target as Node)) return;
      d.onClose();
    },
    true,
  );

  // ── Keys: its own while open (before the roaming keys, which then never see them) ──
  addEventListener(
    'keydown',
    (e) => {
      if (!open || e.ctrlKey || e.metaKey || e.altKey || document.body.classList.contains('reporting')) return;
      const tg = e.target as HTMLElement | null;
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
      const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      let used = true;
      if (digit) {
        if (!e.repeat) {
          const i = Number(digit[1]) - 1;
          if (i < rows.length) {
            setRing(i + 1, false);
            sell(i);
          }
        }
      } else if (e.code === 'ArrowDown' || e.code === 'ArrowRight' || (e.code === 'Tab' && !e.shiftKey)) setRing(ring + 1);
      else if (e.code === 'ArrowUp' || e.code === 'ArrowLeft' || (e.code === 'Tab' && e.shiftKey)) setRing(ring - 1);
      else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space' || e.code === 'KeyE') {
        if (!e.repeat) take();
      } else if (e.code === 'Escape') {
        if (!e.repeat) d.onClose();
      } else used = false;
      if (!used) return;
      e.preventDefault();
      e.stopPropagation();
    },
    { capture: true },
  );
  onLang(() => {
    if (!open) return;
    fillList();
    title.textContent = lastTitle();
    fill();
  });
  let lastTitle = () => '';

  return {
    el,
    get open() {
      return open;
    },
    show(name, rielNow) {
      lastTitle = name;
      title.textContent = name();
      shownRiel = rielNow;
      weighedN = 0;
      busy = false;
      frozen = null;
      words = 'sellWeigh';
      ring = 0;
      open = true;
      fillList();
      fill();
      ask.classList.remove('is-said');
      el.classList.add('is-on');
      document.body.classList.add('roam-sell');
      padClose ??= pad.openLayer(el, { first: () => (ring === 0 ? all : (rows[ring - 1] ?? all)), back: () => d.onClose() });
      d.sound('open');
    },
    say(key) {
      if (key === words) return;
      words = key;
      fill();
      ask.classList.remove('is-said');
      void ask.offsetWidth;
      ask.classList.add('is-said');
    },
    weighed(n) {
      if (n === weighedN) return;
      weighedN = n;
      fill();
    },
    selling(sold) {
      busy = sold !== null;
      frozen = sold ? basket.total : null;
      if (sold) for (const i of sold) rows[i]?.classList.add('is-sold');
      fill();
    },
    refill() {
      // (all sold: the rows stay, ticked, until the card shuts)
      if (!basket.n) return fill();
      weighedN = basket.n;
      fillList();
      if (ring > rows.length) ring = 0;
      fill();
    },
    purse(n, up) {
      shownRiel = n;
      rielEl.textContent = riel(n);
      rielEl.classList.toggle('is-up', up);
    },
    close() {
      if (!open) return;
      open = false;
      busy = false;
      frozen = null;
      el.classList.remove('is-on');
      document.body.classList.remove('roam-sell');
      light();
      if (padClose) {
        padClose();
        padClose = null;
      }
      if (document.activeElement instanceof HTMLElement && el.contains(document.activeElement)) document.activeElement.blur();
      d.sound('close');
    },
    confirm: take,
    focus(i) {
      setRing(i, false);
    },
  };
}
