import { pad } from '../pad/pad';
import type { Shop, ShopItem } from '../shop';
import type { UISound } from '../types';
import { num, onLang, t } from '../ui/lang';
import { steppedRing, steppedShape } from '../ui/shape';
import { BAG_ICON, itemIcon, RIEL_ICON, STALL_ICON } from './_shopIcons';
import { CARRY_MAX, nameOf, riel, type Purse } from './_shopPurse';

/**
 * The buy menu at a stall (_shop.ts opens it with E), in the look of the
 * map's panels (map.css: a dark panel with stepped corners and a warm edge,
 * gold for what to do next; 'Pixelify Sans' / Koulen titles): the stall's
 * name, what its seller asks ("ទិញអីដែរ បង?"), what it sells — a pixel
 * picture of each, its name, its price in riel (Khmer digits and ៛ in
 * Khmer) — and the purse at the foot, with what he carries (up to three).
 *
 * Two steps: the **list** (1–9 or a click / tap buys that one; ↑ ↓ and
 * Enter; what he cannot pay for is dimmed and says so), then, once paid,
 * **now or later**: eat or drink it now (the default: Enter, E, 1, ←) or
 * keep it for later (2, →; not when his bag is full). Esc, E again or the
 * × shuts the list (a second E buys nothing); on the second step Esc keeps
 * it (or eats it, the bag full). A tap on the view outside the sheet
 * shuts the list on a phone. Interface sounds: open, hover, select, close
 * (and `back` when he is short of riel).
 *
 * Its keys are its own while it is open (a capture listener: the roaming
 * keys never see them); a push of the stick walks away (_shop.ts). It sits
 * at the right, the explorer and the seller in view on the left (the
 * mini-map steps aside); on a phone held upright it is a sheet along the
 * bottom (the touch buttons and the tool bar step aside), on one on its
 * side it stands at the right edge, scrolling.
 *
 * With the game pad (pad/pad.ts) it is a layer while open: the pad's arrows
 * (the stick, the d-pad) come in as the arrow keys and move the ring, ✕ as
 * Enter buys the one in it (takes the choice), ○ as Esc shuts it. The keys'
 * digits go while the pad is in use; ✕ shows on the row in the ring, ○ on
 * the close button.
 */
export interface ShopMenu {
  /** The panel (its place on the page: the camera's lens shift, _shop.ts). */
  readonly el: HTMLElement;
  /** Open (either step). */
  readonly open: boolean;
  readonly step: 'list' | 'take' | null;
  /** Open at the list of `shop`'s things (the purse under it). */
  show(shop: Shop, purse: Purse): void;
  /** Paid for `item`: now or later (`canKeep`: room in his bag). */
  take(item: ShopItem, canKeep: boolean): void;
  /** Not enough riel for item `i`: it says so. */
  short(i: number): void;
  close(): void;
  /** The purse or the bag changed. */
  refresh(): void;
  /** Checks: the keyboard's focus ring shown on item `i` (the list) or choice `i` (0 now, 1 keep). */
  focus(i: number): void;
  /** Touch's Use (or a check's `e`): buy the item in the ring, or take the choice. */
  confirm(): void;
}

export interface ShopMenuDeps {
  /** The roaming interface's layer (roam/hud.ts), for the map's look and size. */
  layer: HTMLElement;
  onPick(i: number): void;
  onChoose(c: 'eat' | 'keep'): void;
  /** Esc or the ×: shut the list, or on the second step keep (or eat) it. */
  onClose(): void;
  sound?(s: UISound): void;
}

const SHOT = new URLSearchParams(location.search).get('shot') === '1';

/** A thing is a drink (the words: drink it now). */
export const isDrink = (c: ShopItem['consume']): boolean => c === 'coconut' || c === 'cupDrink' || c === 'bagDrink' || c === 'bottle';

export function createShopMenu(d: ShopMenuDeps): ShopMenu {
  injectStyle();
  const el = document.createElement('section');
  el.className = 'by-menu mu-frame mu-md';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-labelledby', 'by-title');
  el.innerHTML = `<span class="mu-bg"></span>
    <header class="by-head">${STALL_ICON}<h2 id="by-title"></h2><button type="button" class="by-x"><svg class="by-x-icon" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" d="M3 3h2v1h1v1h1v1h2V5h1V4h1V3h2v2h-1v1h-1v1h-1v2h1v1h1v1h1v2h-2v-1h-1v-1H9v-1H7v1H6v1H5v1H3v-2h1v-1h1V9h1V7H5V6H4V5H3z"/></svg><kbd data-pad="east">Esc</kbd></button></header>
    <p class="by-ask"></p>
    <div class="by-list" role="list"></div>
    <div class="by-take" hidden>
      <div class="by-got"><span class="by-got-icon"></span><b class="by-got-name"></b><span class="by-paid"></span></div>
      <div class="by-choose">
        <button type="button" class="by-c by-now" data-c="eat"><span class="by-bg"></span><kbd>1</kbd>${PAD_X}<span class="by-c-t"></span></button>
        <button type="button" class="by-c by-keep" data-c="keep"><span class="by-bg"></span><kbd>2</kbd>${PAD_X}<span class="by-c-t"></span><small class="by-c-n"></small></button>
      </div>
    </div>
    <footer class="by-foot">${RIEL_ICON}<span class="by-purse-label"></span><b class="by-riel"></b><span class="by-bagline" aria-hidden="true"></span></footer>`;
  d.layer.append(el);
  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const title = q('#by-title');
  const ask = q('.by-ask');
  const list = q('.by-list');
  const takeEl = q('.by-take');
  const gotIcon = q('.by-got-icon');
  const gotName = q('.by-got-name');
  const paid = q('.by-paid');
  const now = q<HTMLButtonElement>('.by-now');
  const keep = q<HTMLButtonElement>('.by-keep');
  const xBtn = q<HTMLButtonElement>('.by-x');
  const rielEl = q('.by-riel');
  const bagline = q('.by-bagline');

  let shop: Shop | null = null;
  let purse: Purse | null = null;
  let item: ShopItem | null = null;
  let canKeep = true;
  let step: 'list' | 'take' | null = null;
  /** The keyboard's (and the mouse's) choice: an item of the list, or 0 now / 1 keep. */
  let focus = 0;
  let rows: HTMLButtonElement[] = [];
  /** An item he could not pay for: its note shows until then (ms). */
  let shortI = -1;
  let shortTimer = 0;

  /** The list's rows (a shop's things), in the language in use. */
  function fillList(): void {
    if (!shop) return;
    list.innerHTML = shop.items
      .map(
        (it, i) =>
          `<button type="button" class="by-item" data-i="${i}" role="listitem"><span class="by-bg"></span>${i < 9 ? `<kbd>${i + 1}</kbd>` : '<kbd hidden></kbd>'}${PAD_X}${itemIcon(it)}<span class="by-name">${esc(nameOf(it))}<small class="by-short">${esc(t('byShort'))}</small></span><span class="by-price">${riel(it.price)}</span></button>`,
      )
      .join('');
    rows = [...list.querySelectorAll<HTMLButtonElement>('.by-item')];
  }

  /** The words, the prices, what he can pay for, the purse and his bag (only while open). */
  function fill(): void {
    if (!shop || !purse) return;
    title.textContent = nameOf(shop);
    ask.textContent = `“${t('byAsk')}”`;
    xBtn.setAttribute('aria-label', t('byClose'));
    xBtn.title = `${t('byClose')} (Esc)`;
    q('.by-purse-label').textContent = t('byPurse');
    rielEl.textContent = riel(purse.riel);
    const n = purse.kept.length;
    bagline.innerHTML = n ? `${BAG_ICON}${purse.kept.map((k) => itemIcon(k)).join('')}<span>${num(n)}/${num(CARRY_MAX)}</span>` : '';
    rows.forEach((b, i) => {
      const it = shop!.items[i];
      const can = purse!.riel >= it.price;
      b.classList.toggle('is-short', !can);
      b.classList.toggle('is-said', i === shortI);
      b.setAttribute('aria-label', `${nameOf(it)}, ${riel(it.price)}${can ? '' : `: ${t('byShort')}`}`);
    });
    if (item) {
      const drink = isDrink(item.consume);
      gotIcon.innerHTML = itemIcon(item, 'by-icon by-icon-big');
      gotName.textContent = nameOf(item);
      paid.textContent = t('byPaid', { price: riel(item.price) });
      q('.by-now .by-c-t').textContent = t(drink ? 'byDrinkNow' : 'byEatNow');
      q('.by-keep .by-c-t').textContent = t('byKeep');
      q('.by-c-n').textContent = canKeep ? `${num(n)}/${num(CARRY_MAX)}` : t('byBagFull');
      keep.disabled = !canKeep;
    }
    light();
  }

  /** The focus ring (the keyboard's choice, or where the mouse is). */
  function light(): void {
    rows.forEach((b, i) => b.classList.toggle('is-focus', step === 'list' && i === focus));
    now.classList.toggle('is-focus', step === 'take' && focus === 0);
    keep.classList.toggle('is-focus', step === 'take' && focus === 1);
  }

  function setFocus(i: number, sound = true): void {
    if (i === focus) return;
    focus = i;
    light();
    if (sound) d.sound?.('hover');
    if (step === 'list') rows[i]?.scrollIntoView({ block: 'nearest' });
  }

  function pick(i: number): void {
    if (step !== 'list' || !shop?.items[i]) return;
    setFocus(i, false);
    d.onPick(i);
  }

  function choose(c: 'eat' | 'keep'): void {
    if (step !== 'take' || (c === 'keep' && !canKeep)) return;
    d.sound?.('select');
    d.onChoose(c);
  }

  // ── Mouse and touch ──
  list.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.by-item');
    if (!b) return;
    // (let go of the focus: Space and Enter are the menu's, then roaming's)
    b.blur();
    pick(Number(b.dataset.i));
  });
  list.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.by-item');
    if (b) setFocus(Number(b.dataset.i));
  });
  for (const b of [now, keep]) {
    b.addEventListener('click', () => {
      b.blur();
      choose(b.dataset.c as 'eat' | 'keep');
    });
    b.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse' && !b.disabled) setFocus(b === now ? 0 : 1);
    });
  }
  xBtn.addEventListener('click', () => {
    xBtn.blur();
    d.onClose();
  });
  // (a tap on the view outside the sheet shuts the list on a phone, as the explorer menu; not the second step: it is paid for)
  addEventListener(
    'pointerdown',
    (e) => {
      if (step !== 'list' || e.pointerType !== 'touch' || el.contains(e.target as Node)) return;
      d.onClose();
    },
    true,
  );

  // ── Keys: its own while open (before the roaming keys, which then never see them) ──
  addEventListener(
    'keydown',
    (e) => {
      if (!step || e.ctrlKey || e.metaKey || e.altKey || document.body.classList.contains('reporting')) return;
      const tg = e.target as HTMLElement | null;
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
      const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      const n = step === 'list' ? rows.length : 2;
      let used = true;
      if (digit) {
        const i = Number(digit[1]) - 1;
        if (!e.repeat) {
          if (step === 'list') pick(i);
          else if (i < 2) choose(i === 0 ? 'eat' : 'keep');
        }
      } else if (e.code === 'ArrowDown' || e.code === 'ArrowRight' || (e.code === 'Tab' && !e.shiftKey)) {
        let i = (focus + 1) % n;
        if (step === 'take' && i === 1 && !canKeep) i = 0;
        setFocus(i);
      } else if (e.code === 'ArrowUp' || e.code === 'ArrowLeft' || (e.code === 'Tab' && e.shiftKey)) {
        let i = (focus - 1 + n) % n;
        if (step === 'take' && i === 1 && !canKeep) i = 0;
        setFocus(i);
      } else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
        if (!e.repeat) {
          if (step === 'list') pick(focus);
          else choose(focus === 1 ? 'keep' : 'eat');
        }
      } else if (e.code === 'KeyE') {
        // (E again at the list steps away from the stall, as it came: nothing bought by a second press; paid for, E takes the choice)
        if (!e.repeat) {
          if (step === 'list') d.onClose();
          else choose(focus === 1 ? 'keep' : 'eat');
        }
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
    if (!step) return;
    fillList();
    fill();
  });

  /** The game pad's layer while it is open (its keys come in as the keyboard's: the handler above). */
  let padClose: (() => void) | null = null;
  /** The row or choice in the ring (the pad's focus sits there: it draws no ring of its own on them). */
  const ringed = () => (step === 'take' ? (focus === 1 && canKeep ? keep : now) : (rows[focus] ?? null));

  function setStep(s: 'list' | 'take' | null): void {
    step = s;
    el.classList.toggle('is-on', s !== null);
    el.classList.toggle('is-take', s === 'take');
    list.hidden = s === 'take';
    ask.hidden = s === 'take';
    takeEl.hidden = s !== 'take';
    document.body.classList.toggle('roam-shop', s !== null);
    if (s && !padClose) padClose = pad.openLayer(el, { first: ringed, back: () => d.onClose() });
    else if (!s && padClose) {
      padClose();
      padClose = null;
    }
    // (shut: the pad's focus leaves it, so Enter and Space are his again)
    if (!s && document.activeElement instanceof HTMLElement && el.contains(document.activeElement)) document.activeElement.blur();
  }

  return {
    el,
    get open() {
      return step !== null;
    },
    get step() {
      return step;
    },
    show(s, p) {
      const was = step;
      shop = s;
      purse = p;
      item = null;
      shortI = -1;
      // (the first thing he can pay for)
      focus = Math.max(0, s.items.findIndex((it) => it.price <= p.riel));
      fillList();
      setStep('list');
      fill();
      if (!was) d.sound?.('open');
    },
    take(it, room) {
      item = it;
      canKeep = room;
      focus = 0;
      setStep('take');
      fill();
    },
    short(i) {
      shortI = i;
      fill();
      const b = rows[i];
      if (b) {
        b.classList.remove('is-shake');
        void b.offsetWidth;
        b.classList.add('is-shake');
      }
      d.sound?.('back');
      clearTimeout(shortTimer);
      // (it says so for a while; in a still, for good)
      if (!SHOT)
        shortTimer = window.setTimeout(() => {
          shortI = -1;
          fill();
        }, 2600);
    },
    close() {
      if (!step) return;
      setStep(null);
      item = null;
      d.sound?.('close');
    },
    refresh: fill,
    focus(i) {
      focus = i;
      light();
    },
    confirm() {
      if (step === 'list') pick(focus);
      else if (step === 'take') choose(focus === 1 && canKeep ? 'keep' : 'eat');
    },
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
/** The game pad's ✕ on a row or choice (shown only on the one in the ring, while the pad is in use). */
const PAD_X = '<kbd class="by-padx" data-pad="south" aria-hidden="true"></kbd>';

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  style.textContent = `
    .rh > .by-menu { right: calc(28 * var(--px)); top: 50%; left: auto; width: calc(372 * var(--px)); max-height: calc(100vh - 150 * var(--px));
      flex-direction: column; align-items: stretch; gap: calc(9 * var(--px)); padding: calc(14 * var(--px)) calc(14 * var(--px)) calc(12 * var(--px));
      pointer-events: auto; color: var(--mu-ink2); --mu-edge: rgba(255, 208, 112, 0.55); --by-shape: ${steppedShape(6, 3)}; --by-ring: ${steppedRing(6, 3, 1.5)};
      opacity: 0; visibility: hidden; transform: translate(calc(10 * var(--px)), -50%); transition: opacity 0.2s, transform 0.3s var(--mu-ease), visibility 0s 0.3s; }
    .rh > .by-menu.is-on { opacity: 1; visibility: visible; transform: translate(0, -50%); transition: opacity 0.25s, transform 0.4s var(--mu-ease), visibility 0s; }
    .by-menu > .mu-bg { backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
    .by-head { display: flex; align-items: center; gap: calc(9 * var(--px)); padding-right: calc(62 * var(--px)); }
    .by-head > .by-icon { width: calc(28 * var(--px)); height: calc(28 * var(--px)); }
    .by-head h2 { margin: 0; font: 700 calc(20 * var(--px)) / 1.15 var(--mu-display); color: var(--mu-ink); letter-spacing: 0.01em;
      text-shadow: 0 calc(2 * var(--px)) 0 rgba(0, 0, 0, 0.3); }
    .by-x { position: absolute; right: calc(10 * var(--px)); top: calc(10 * var(--px)); display: flex; align-items: center; gap: calc(6 * var(--px));
      padding: calc(4 * var(--px)) calc(5 * var(--px)) calc(4 * var(--px)) calc(6 * var(--px)); border: 0; border-radius: calc(6 * var(--px)); background: none;
      color: var(--mu-ink2); cursor: pointer; outline: none; transition: color 0.2s, background 0.2s; }
    .by-x-icon { width: calc(15 * var(--px)); height: calc(15 * var(--px)); }
    .by-x kbd { min-width: 0; height: calc(19 * var(--px)); font-size: calc(11.5 * var(--px)); color: var(--mu-ink2); }
    .by-x:hover { color: var(--mu-ink); background: rgba(255, 255, 255, 0.07); }
    .by-ask { margin: calc(-2 * var(--px)) 0 calc(2 * var(--px)) calc(37 * var(--px)); font-size: calc(14.5 * var(--px)); color: var(--mu-sand); font-style: italic; }
    .by-ask[hidden], .by-list[hidden], .by-take[hidden] { display: none; }
    .by-list { display: grid; gap: calc(5 * var(--px)); overflow: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: var(--mu-line) transparent;
      margin: 0 calc(-4 * var(--px)); padding: calc(2 * var(--px)) calc(4 * var(--px)); }
    .by-icon { flex: none; width: calc(30 * var(--px)); height: calc(30 * var(--px)); filter: drop-shadow(0 calc(1.5 * var(--px)) 0 rgba(0, 0, 0, 0.4)); }
    .by-item, .by-c { position: relative; display: flex; align-items: center; gap: calc(10 * var(--px)); min-height: calc(46 * var(--px)); padding: calc(5 * var(--px)) calc(12 * var(--px)) calc(5 * var(--px)) calc(8 * var(--px));
      border: 0; background: none; cursor: pointer; outline: none; color: var(--mu-ink); isolation: isolate; text-align: left; font: inherit; touch-action: manipulation;
      transition: color 0.2s, transform 0.2s var(--mu-ease), opacity 0.2s; }
    .by-bg { position: absolute; inset: 0; z-index: -1; clip-path: var(--by-shape); background: rgba(255, 244, 222, 0.05); transition: background 0.2s; }
    .by-bg::after { content: ''; position: absolute; inset: 0; clip-path: var(--by-ring); background: rgba(255, 229, 188, 0.12); transition: background 0.2s; }
    .by-item kbd, .by-c kbd { flex: none; min-width: calc(19 * var(--px)); height: calc(19 * var(--px)); padding: 0 calc(4 * var(--px)); font-size: calc(11 * var(--px)); color: var(--mu-ink2); }
    .by-name { flex: 1; min-width: 0; display: grid; font-weight: 700; font-size: calc(15 * var(--px)); line-height: 1.25; }
    .by-short { display: none; font-weight: 600; font-size: calc(12 * var(--px)); color: #f0a08a; }
    .by-price { flex: none; font: 700 calc(15.5 * var(--px)) / 1 var(--mu-display); color: var(--mu-gold-hi); letter-spacing: 0.02em; white-space: nowrap;
      text-shadow: 0 calc(1 * var(--px)) 0 rgba(0, 0, 0, 0.35); }
    .by-item.is-focus, .by-c.is-focus { transform: translateX(calc(-2 * var(--px))); }
    .by-item.is-focus .by-bg, .by-c.is-focus .by-bg { background: rgba(58, 44, 20, 0.7); box-shadow: 0 0 calc(10 * var(--px)) rgba(255, 176, 40, 0.35); }
    .by-item.is-focus .by-bg::after, .by-c.is-focus .by-bg::after { background: var(--mu-gold-hi); }
    .by-item.is-focus kbd, .by-c.is-focus kbd { color: var(--mu-gold-hi); border-color: rgba(255, 208, 112, 0.7); }
    /* (the game pad in use: no digits; ✕ on the row or choice in the ring, as wide as a digit so nothing moves; ○ on the close button) */
    .by-menu kbd.by-padx { display: none; }
    body.pad-on .by-menu :is(.by-item, .by-c) > kbd:not(.by-padx) { display: none; }
    body.pad-on .by-menu kbd.by-padx { display: inline-flex; justify-content: center; visibility: hidden; font-size: calc(13 * var(--px)); }
    body.pad-on .by-menu .is-focus > kbd.by-padx { visibility: visible; }
    .by-x kbd.is-pad { font-size: calc(14 * var(--px)); }
    .by-item:active, .by-c:active { transform: scale(0.97); }
    .by-item.is-short { color: var(--mu-ink2); }
    .by-item.is-short .by-icon { opacity: 0.55; filter: grayscale(0.5); }
    .by-item.is-short .by-price { color: #d89080; }
    .by-item.is-said .by-short { display: block; }
    .by-item.is-shake { animation: by-shake 0.4s; }
    @keyframes by-shake { 20% { transform: translateX(calc(-5 * var(--px))); } 45% { transform: translateX(calc(4 * var(--px))); } 70% { transform: translateX(calc(-2 * var(--px))); } }
    /* Now or later: what he got, paid for, and the two choices. */
    .by-take { display: grid; gap: calc(12 * var(--px)); padding-top: calc(4 * var(--px)); }
    .by-got { display: grid; justify-items: center; gap: calc(5 * var(--px)); text-align: center; }
    .by-icon-big { width: calc(64 * var(--px)); height: calc(64 * var(--px)); animation: by-got 0.5s var(--mu-ease); }
    @keyframes by-got { from { transform: translateY(calc(8 * var(--px))) scale(0.7); opacity: 0; } }
    .by-got-name { font: 700 calc(18 * var(--px)) / 1.2 var(--mu-display); color: var(--mu-ink); text-shadow: 0 calc(2 * var(--px)) 0 rgba(0, 0, 0, 0.3); }
    .by-paid { font-size: calc(13 * var(--px)); color: #a8d898; }
    .by-choose { display: grid; grid-template-columns: 1fr 1fr; gap: calc(8 * var(--px)); }
    .by-c { justify-content: center; min-height: calc(50 * var(--px)); gap: calc(7 * var(--px)); font-weight: 700; font-size: calc(15 * var(--px)); flex-wrap: wrap; }
    .by-c-n { font-weight: 600; font-size: calc(12 * var(--px)); color: var(--mu-ink2); }
    .by-now { color: var(--mu-gold-hi); }
    .by-c:disabled { opacity: 0.45; cursor: default; }
    /* The purse and the bag at the foot. */
    .by-foot { display: flex; align-items: center; gap: calc(7 * var(--px)); margin-top: calc(2 * var(--px)); padding-top: calc(9 * var(--px)); border-top: 1px solid var(--mu-line);
      font-size: calc(13.5 * var(--px)); }
    .by-foot > .by-icon { width: calc(22 * var(--px)); height: calc(22 * var(--px)); }
    .by-riel { font: 700 calc(16 * var(--px)) / 1 var(--mu-display); color: var(--mu-gold-hi); letter-spacing: 0.02em; }
    .by-bagline { margin-left: auto; display: flex; align-items: center; gap: calc(3 * var(--px)); color: var(--mu-ink2); font-size: calc(12.5 * var(--px)); }
    .by-bagline .by-icon { width: calc(20 * var(--px)); height: calc(20 * var(--px)); }
    .by-bagline span { margin-left: calc(3 * var(--px)); }
    /* (Khmer letters look smaller and stack signs above and below: map.css) */
    :lang(km) .by-head h2, :lang(km) .by-got-name { letter-spacing: 0; line-height: 1.35; }
    :lang(km) .by-name { font-size: calc(16 * var(--px)); line-height: 1.45; }
    :lang(km) .by-ask { font-style: normal; font-size: calc(15 * var(--px)); }
    :lang(km) .by-c { font-size: calc(16 * var(--px)); }
    /* (while it is open: the mini-map steps aside, and on touch the buttons and the tool bar) */
    body.roam-shop .mm { opacity: 0 !important; visibility: hidden !important; transition: opacity 0.2s, visibility 0s 0.2s !important; }
    body.roam-shop.roam-touch .rt, body.roam-shop.roam-touch .rtb-wrap { display: none !important; }
    body.roam-shop .rtb-keys, body.roam-shop .rxm { display: none !important; }
    .mu-calm ~ .rh > .by-menu { transform: translate(0, -50%) !important; }
    .mu-calm ~ .rh .by-icon-big { animation: none; }
    /* (no keys to press on a touch screen) */
    body.roam-touch .by-menu kbd { display: none; }
    /* A phone held upright (or any narrow view): a sheet along the bottom. */
    @media (max-width: 639px) {
      .rh > .by-menu { left: 10px; right: 10px; top: auto; bottom: 10px; width: auto; max-height: 54vh; transform: translateY(12px); gap: 7px; padding: 12px 12px 10px; }
      .rh > .by-menu.is-on { transform: none; }
      .mu-calm ~ .rh > .by-menu { transform: none !important; }
      .by-item, .by-c { min-height: 48px; }
      .by-list { gap: 4px; }
      .by-icon-big { width: 52px; height: 52px; }
    }
    /* A phone on its side: at the right edge, as tall as the view. */
    @media (max-height: 500px) {
      .rh > .by-menu { top: 8px; bottom: 8px; right: 8px; left: auto; width: min(380px, 52vw); max-height: none; transform: translateX(10px); gap: 6px; padding: 10px 12px; }
      .rh > .by-menu.is-on { transform: none; }
      .mu-calm ~ .rh > .by-menu { transform: none !important; }
      .by-item, .by-c { min-height: 44px; }
      .by-icon-big { width: 44px; height: 44px; }
      .by-take { gap: 8px; }
    }`;
  document.head.append(style);
}
