import { GARDEN } from '../garden/state';
import { GARDEN_KINDS, KINDS, type PlantKindId } from '../garden/kinds';
import { pad } from '../pad/pad';
import type { UISound } from '../types';
import { num, onLang, t, type WordKey } from '../ui/lang';
import { HARVEST_ICON, kindIcon, SEEDLING_ICON } from './_gardenShopArt';
import { CLOSE_X, esc, injectSellStyle, PAD_X } from './_fishSellStyle';
import { RIEL_ICON } from './_shopIcons';
import { riel } from './_shopPurse';

/**
 * The nursery's card (roam/_gardenShop.ts opens it with E at her table), in
 * the buy menu's and the fish sale's look (_shopMenu.ts, _fishSellCard.ts:
 * the same panel, rows and ring, `sl-` classes from _fishSellStyle.ts): the
 * nursery's name, her words, two tabs, the purse at the foot.
 *
 * - **Buy seeds and seedlings**: the twelve plants (garden/kinds.ts, in its
 *   order: crops first, the slowest trees last), each with its picture, its
 *   name, what one is (a packet of seeds, a cane cutting, a banana sucker, a
 *   seedling in its bag), how many he has, and its price in riel. A row buys
 *   one; short of riel, it says so in red on the row (and she says it).
 * - **Sell your harvest**: what is in his basket (`GARDEN.basketKinds()`),
 *   how many of each and what she pays for one; a row sells one, "Sell all"
 *   (with the total) everything. An empty basket: a line saying to pick from
 *   his garden first.
 *
 * Keys while it is open (its own: a capture listener): 1–9 take that row,
 * ↑ ↓ move the ring, ← → (Tab) change tabs, Enter, Space or E take the one in
 * the ring, Esc (or the ×) shuts it. A click or tap on a row or a tab; a tap
 * on the view outside the sheet shuts it on a phone; touch's Use takes the
 * one in the ring (`confirm`). The game pad: a layer while open (its arrows
 * move the ring and change tabs, ✕ takes, ○ shuts, L1 / R1 change tabs).
 * While a hand-over is under way (`busy`) nothing more is taken.
 */
export type ShopTab = 'buy' | 'sell';

export interface GardenShopCard {
  readonly el: HTMLElement;
  readonly open: boolean;
  readonly tab: ShopTab;
  /** Open on a tab, with the purse's riel now. */
  show(tab: ShopTab, rielNow: number): void;
  setTab(tab: ShopTab, sound?: boolean): void;
  /** Her words over the list. */
  say(key: WordKey): void;
  /** The seeds or the basket changed: the rows again. */
  refill(): void;
  /** The purse's riel at the foot (`up`: it glows, counting up). */
  purse(n: number, up: boolean): void;
  /** Short of riel for this kind: the row says so a moment. */
  short(k: PlantKindId): void;
  /** A hand-over under way: nothing more can be taken. */
  busy(on: boolean): void;
  close(): void;
  /** Touch's Use (or a check's `e`): take the one in the ring. */
  confirm(): void;
  /** Checks: the ring on row `i` (the Sell tab: after the rows, "Sell all"). */
  focus(i: number): void;
}

export interface GardenShopDeps {
  layer: HTMLElement;
  onBuy(k: PlantKindId): void;
  onSell(which: PlantKindId | 'all'): void;
  /** The tab changed (her words follow it). */
  onTab(tab: ShopTab): void;
  onClose(): void;
  sound(s: UISound): void;
}

/** A harvest's name as a row's title (the words are for sentences: "mango" → "Mango"). */
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** What one of a kind is at the nursery (the row's small line). */
const FORM: Record<string, WordKey> = { seed: 'gardenShopSeed', cutting: 'gardenShopCutting', pup: 'gardenShopPup', seedling: 'gardenShopSeedling' };

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `
    .rh > .gs-card.mu-frame { width: calc(400 * var(--px)); }
    .gs-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: calc(6 * var(--px)); }
    .gs-tab { position: relative; display: flex; align-items: center; justify-content: center; gap: calc(7 * var(--px)); min-height: calc(40 * var(--px));
      padding: calc(4 * var(--px)) calc(10 * var(--px)); border: 0; background: none; cursor: pointer; outline: none; color: var(--mu-ink2); isolation: isolate;
      font-family: inherit; font-weight: 700; font-size: calc(14 * var(--px)); line-height: 1.2; touch-action: manipulation; transition: color 0.2s; }
    .gs-tab .sl-bg { background: rgba(255, 244, 222, 0.04); }
    .gs-tab[aria-selected='true'] { color: var(--mu-gold-hi); }
    .gs-tab[aria-selected='true'] .sl-bg { background: rgba(58, 44, 20, 0.7); }
    .gs-tab[aria-selected='true'] .sl-bg::after { background: rgba(255, 208, 112, 0.65); }
    .gs-tab:hover { color: var(--mu-ink); }
    .gs-tab-icon { flex: none; width: calc(20 * var(--px)); height: calc(20 * var(--px)); filter: drop-shadow(0 calc(1 * var(--px)) 0 rgba(0, 0, 0, 0.4)); }
    .gs-tab-n { min-width: calc(18 * var(--px)); padding: 0 calc(5 * var(--px)); border-radius: calc(9 * var(--px)); background: rgba(255, 208, 112, 0.18); color: var(--mu-gold-hi);
      font: 700 calc(12 * var(--px)) / calc(18 * var(--px)) var(--mu-display); text-align: center; }
    .gs-tab-n:empty { display: none; }
    .gs-card .sl-list { max-height: calc(min(360 * var(--px), 52vh)); }
    .gs-card .by-icon { flex: none; width: calc(30 * var(--px)); height: calc(30 * var(--px)); filter: drop-shadow(0 calc(1.5 * var(--px)) 0 rgba(0, 0, 0, 0.4)); }
    .gs-card .sl-name small { display: flex; flex-wrap: wrap; gap: 0 calc(6 * var(--px)); }
    .gs-have { color: #a8d898; }
    .gs-have.is-none { color: var(--mu-ink2); opacity: 0.8; }
    .gs-short { display: none; color: #f0a08a; }
    .gs-item.is-short .gs-short { display: inline; }
    .gs-item.is-short .gs-have, .gs-item.is-short .gs-form { display: none; }
    .gs-item.is-short .sl-price { color: #d89080; }
    .gs-item.is-short .by-icon { opacity: 0.6; filter: grayscale(0.5); }
    .gs-price { display: grid; justify-items: end; gap: calc(1 * var(--px)); }
    .gs-price small { font-family: inherit; font-weight: 600; font-size: calc(11 * var(--px)); line-height: 1; color: var(--mu-ink2); letter-spacing: 0; }
    .gs-empty { margin: calc(4 * var(--px)) 0; padding: calc(10 * var(--px)) calc(12 * var(--px)); border-radius: calc(4 * var(--px)); background: rgba(255, 208, 112, 0.08);
      color: var(--mu-sand); font-size: calc(13.5 * var(--px)); line-height: 1.4; text-align: center; }
    .gs-empty[hidden], .gs-card .sl-all[hidden] { display: none; }
    .gs-item.is-got { animation: gs-got 0.45s var(--mu-ease); }
    @keyframes gs-got { 40% { transform: translateX(calc(-2 * var(--px))) scale(1.02); } }
    :lang(km) .gs-tab { font-size: calc(15 * var(--px)); }
    :lang(km) .gs-empty { font-size: calc(14 * var(--px)); }
    .mu-calm ~ .rh .gs-item.is-got { animation: none !important; }
    @media (max-width: 639px) { .gs-card .sl-list { max-height: 34vh; } .gs-tab { min-height: 44px; } }
    @media (max-height: 500px) { .gs-card .sl-list { max-height: none; } }`;
  document.head.append(s);
}

export function createGardenShopCard(d: GardenShopDeps): GardenShopCard {
  injectSellStyle();
  injectStyle();
  const el = document.createElement('section');
  el.className = 'sl-card gs-card mu-frame mu-md';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-labelledby', 'gs-title');
  el.innerHTML = `<span class="mu-bg"></span>
    <header class="sl-head">${SEEDLING_ICON('sl-head-icon')}<h2 id="gs-title"></h2><button type="button" class="sl-x">${CLOSE_X}</button></header>
    <p class="sl-ask" aria-live="polite"></p>
    <div class="gs-tabs" role="tablist">
      <button type="button" class="gs-tab" role="tab" data-tab="buy" id="gs-tab-buy" aria-controls="gs-list"><span class="sl-bg"></span>${SEEDLING_ICON('gs-tab-icon')}<span class="gs-tab-t"></span></button>
      <button type="button" class="gs-tab" role="tab" data-tab="sell" id="gs-tab-sell" aria-controls="gs-list"><span class="sl-bg"></span>${HARVEST_ICON('gs-tab-icon')}<span class="gs-tab-t"></span><b class="gs-tab-n"></b></button>
    </div>
    <div class="sl-list" id="gs-list" role="tabpanel"></div>
    <p class="gs-empty" hidden></p>
    <button type="button" class="sl-all" hidden><span class="sl-bg"></span>${PAD_X}<span class="sl-all-t"></span><b class="sl-all-n"></b></button>
    <footer class="sl-foot">${RIEL_ICON}<span class="sl-purse-label"></span><b class="sl-riel-foot"></b><span class="sl-foot-basket">${HARVEST_ICON('sl-basket-icon')}<span class="sl-foot-n"></span></span></footer>`;
  d.layer.append(el);
  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const title = q('#gs-title');
  const ask = q('.sl-ask');
  const list = q('.sl-list');
  const empty = q('.gs-empty');
  const all = q<HTMLButtonElement>('.sl-all');
  const xBtn = q<HTMLButtonElement>('.sl-x');
  const rielEl = q('.sl-riel-foot');
  const tabBtns = [...el.querySelectorAll<HTMLButtonElement>('.gs-tab')];
  let open = false;
  let tab: ShopTab = 'buy';
  /** The rows now: their kinds (the Sell tab's "Sell all" is after them in the ring). */
  let rows: HTMLButtonElement[] = [];
  let kinds: PlantKindId[] = [];
  let ring = 0;
  let isBusy = false;
  let words: WordKey = 'gardenShopHi';
  let shownRiel = 0;
  let shortK: PlantKindId | null = null;
  let shortTimer = 0;
  let padClose: (() => void) | null = null;
  /** What the rows were made from (made again only when it changes). */
  let made = '';

  const ringLen = () => rows.length + (tab === 'sell' && rows.length ? 1 : 0);
  const ringEl = (i: number): HTMLElement | null => (i < rows.length ? rows[i] : tab === 'sell' && rows.length ? all : null);

  /** The rows of the tab in the language in use. */
  function fillList(): void {
    kinds = tab === 'buy' ? GARDEN_KINDS.filter((k) => KINDS[k].price !== null) : GARDEN.basketKinds();
    const key = `${tab}|${kinds.map((k) => `${k}:${tab === 'buy' ? GARDEN.seeds(k) : GARDEN.basket(k)}`).join(',')}|${num(1)}|${shortK ?? ''}`;
    if (key === made) return;
    made = key;
    list.innerHTML = kinds
      .map((k, i) => {
        const K = KINDS[k];
        const digit = i < 9 ? `<kbd>${i + 1}</kbd>` : '<kbd hidden></kbd>';
        if (tab === 'buy') {
          const have = GARDEN.seeds(k);
          return `<button type="button" class="sl-item gs-item${shortK === k ? ' is-short' : ''}" data-i="${i}" role="listitem"><span class="sl-bg"></span>${digit}${PAD_X}${kindIcon(k)}<span class="sl-name">${esc(t(K.name))}<small><span class="gs-form">${esc(t(FORM[K.form]))}</span><span class="gs-have${have ? '' : ' is-none'}">${esc(t('gardenShopHave', { n: num(have) }))}</span><span class="gs-short">${esc(t('gardenShopShort'))}</span></small></span><span class="sl-price">${riel(K.price ?? 0)}</span></button>`;
        }
        const n = GARDEN.basket(k);
        return `<button type="button" class="sl-item gs-item" data-i="${i}" role="listitem"><span class="sl-bg"></span>${digit}${PAD_X}${kindIcon(k)}<span class="sl-name">${esc(cap(t(K.fruit.item)))}<small><span class="gs-have">${esc(t('gardenShopInBasket', { n: num(n) }))}</span></small></span><span class="sl-price gs-price">${riel(K.fruit.sell)}<small>${esc(t('gardenShopEach'))}</small></span></button>`;
      })
      .join('');
    rows = [...list.querySelectorAll<HTMLButtonElement>('.gs-item')];
    rows.forEach((b, i) => {
      const k = kinds[i];
      const K = KINDS[k];
      b.setAttribute(
        'aria-label',
        tab === 'buy' ? `${t(K.name)}, ${t(FORM[K.form])}, ${riel(K.price ?? 0)}, ${t('gardenShopHave', { n: num(GARDEN.seeds(k)) })}` : `${t(K.fruit.item)}, ${t('gardenShopInBasket', { n: num(GARDEN.basket(k)) })}, ${riel(K.fruit.sell)} ${t('gardenShopEach')}`,
      );
    });
    if (ring >= ringLen()) ring = Math.max(0, ringLen() - 1);
  }

  /** The words, the tabs, "Sell all", the foot. */
  function fill(): void {
    title.textContent = t('gardenShopName');
    xBtn.setAttribute('aria-label', t('byClose'));
    xBtn.title = `${t('byClose')} (Esc)`;
    q('.sl-purse-label').textContent = t('byPurse');
    rielEl.textContent = riel(shownRiel);
    ask.textContent = `“${t(words)}”`;
    tabBtns.forEach((b) => {
      const on = b.dataset.tab === tab;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      b.querySelector('.gs-tab-t')!.textContent = t(b.dataset.tab === 'buy' ? 'gardenShopTabBuy' : 'gardenShopTabSell');
    });
    const inBasket = GARDEN.basketKinds().reduce((a, k) => a + GARDEN.basket(k), 0);
    q('.gs-tab-n').textContent = inBasket ? num(inBasket) : '';
    const total = GARDEN.basketKinds().reduce((a, k) => a + GARDEN.basket(k) * KINDS[k].fruit.sell, 0);
    const selling = tab === 'sell';
    all.hidden = !selling || !rows.length;
    q('.sl-all-t').textContent = t('gardenShopSellAll');
    q('.sl-all-n').textContent = total ? riel(total) : '';
    all.disabled = isBusy || !rows.length;
    empty.hidden = !(selling && !rows.length);
    empty.textContent = t('gardenShopEmpty');
    rows.forEach((b) => (b.disabled = isBusy));
    q('.sl-foot-n').textContent = num(inBasket);
    q('.sl-foot-basket').setAttribute('aria-label', t('gardenShopBasket', { n: num(inBasket) }));
    q('.sl-foot-basket').title = t('gardenShopBasket', { n: num(inBasket) });
    light();
  }

  function light(): void {
    all.classList.toggle('is-focus', open && tab === 'sell' && ring === rows.length);
    rows.forEach((b, i) => b.classList.toggle('is-focus', open && ring === i));
  }

  function setRing(i: number, sound = true): void {
    const n = ringLen();
    if (!n) return;
    i = ((i % n) + n) % n;
    if (i === ring) return;
    ring = i;
    light();
    if (sound) d.sound('hover');
    ringEl(ring)?.scrollIntoView({ block: 'nearest' });
  }

  function setTab(to: ShopTab, sound = true): void {
    if (to === tab && made) return;
    tab = to;
    ring = 0;
    made = '';
    fillList();
    fill();
    list.scrollTop = 0;
    if (sound) d.sound('select');
    d.onTab(tab);
  }

  /** Take row `i` (buy one, sell one) or "Sell all". */
  function take(i: number): void {
    if (!open || isBusy) return;
    if (tab === 'sell' && i === rows.length && rows.length) {
      d.sound('select');
      d.onSell('all');
      return;
    }
    const k = kinds[i];
    if (!k) return;
    d.sound('select');
    if (tab === 'buy') d.onBuy(k);
    else d.onSell(k);
  }

  // ── Mouse and touch ──
  list.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.gs-item');
    if (!b) return;
    b.blur();
    const i = Number(b.dataset.i);
    setRing(i, false);
    take(i);
  });
  list.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.gs-item');
    if (b && !b.disabled) setRing(Number(b.dataset.i));
  });
  all.addEventListener('click', () => {
    all.blur();
    setRing(rows.length, false);
    take(rows.length);
  });
  all.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse' && !all.disabled) setRing(rows.length);
  });
  for (const b of tabBtns)
    b.addEventListener('click', () => {
      b.blur();
      setTab(b.dataset.tab as ShopTab);
    });
  xBtn.addEventListener('click', () => {
    xBtn.blur();
    d.onClose();
  });
  // (a tap on the view outside the sheet shuts it on a phone, as the buy menu)
  addEventListener(
    'pointerdown',
    (e) => {
      if (!open || isBusy || e.pointerType !== 'touch' || el.contains(e.target as Node)) return;
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
            setRing(i, false);
            take(i);
          }
        }
      } else if (e.code === 'ArrowDown') setRing(ring + 1);
      else if (e.code === 'ArrowUp') setRing(ring - 1);
      else if (e.code === 'ArrowRight' || e.code === 'ArrowLeft' || e.code === 'Tab') {
        if (!e.repeat) setTab(tab === 'buy' ? 'sell' : 'buy');
      } else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space' || e.code === 'KeyE') {
        if (!e.repeat) take(ring);
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
    made = '';
    fillList();
    fill();
  });

  return {
    el,
    get open() {
      return open;
    },
    get tab() {
      return tab;
    },
    show(to, rielNow) {
      shownRiel = rielNow;
      isBusy = false;
      shortK = null;
      tab = to;
      ring = 0;
      made = '';
      words = to === 'buy' ? 'gardenShopHi' : GARDEN.basketKinds().length ? 'gardenShopSellHi' : 'gardenShopEmpty';
      open = true;
      fillList();
      fill();
      list.scrollTop = 0;
      ask.classList.remove('is-said');
      el.classList.add('is-on');
      document.body.classList.add('roam-sell');
      padClose ??= pad.openLayer(el, {
        first: () => ringEl(ring) ?? tabBtns[0],
        back: () => d.onClose(),
        tabs: () => setTab(tab === 'buy' ? 'sell' : 'buy'),
      });
      d.sound('open');
    },
    setTab,
    say(key) {
      if (key === words) return;
      words = key;
      fill();
      ask.classList.remove('is-said');
      void ask.offsetWidth;
      ask.classList.add('is-said');
    },
    refill() {
      if (!open) return;
      const was = rows[ring]?.dataset.i;
      fillList();
      fill();
      if (was !== undefined) rows[Number(was)]?.classList.add('is-got');
    },
    purse(n, up) {
      shownRiel = n;
      rielEl.textContent = riel(n);
      rielEl.classList.toggle('is-up', up);
    },
    short(k) {
      shortK = k;
      made = '';
      fillList();
      fill();
      clearTimeout(shortTimer);
      shortTimer = window.setTimeout(() => {
        shortK = null;
        made = '';
        if (open) {
          fillList();
          fill();
        }
      }, 2400);
    },
    busy(on) {
      if (on === isBusy) return;
      isBusy = on;
      fill();
    },
    close() {
      if (!open) return;
      open = false;
      isBusy = false;
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
    confirm: () => take(ring),
    focus(i) {
      setRing(i, false);
    },
  };
}
