import { pad } from '../pad/pad';
import type { UISound } from '../types';
import { onLang, t, type WordKey } from '../ui/lang';
import { bikePicture, shopIcon } from './_bikeShopArt';
import { BIKE_KINDS, BIKE_OWN, costFor, tradeIn, type BikeKindId } from './_bikeOwn';
import { CLOSE_X, esc, injectSellStyle, PAD_X } from './_fishSellStyle';
import { RIEL_ICON } from './_shopIcons';
import { riel } from './_shopPurse';

/**
 * The bicycle shop's card (roam/_bikeShop.ts opens it with E before the
 * stall), in the buy menu's, the fish sale's and the nursery's look
 * (_fishSellStyle.ts: the same panel, rows and ring, `sl-` classes): the
 * shop's name, the mechanic's words, the three bicycles, the purse at the foot.
 *
 * Each row: the bicycle's picture on a light tile (_bikeShopArt.ts), its name
 * and a line about it, and what it costs him now — its price, less the
 * trade-in of the one he has ("Trade in yours: 30,000 ៛ off"); his own says
 * "✓ Yours". More than his purse holds: greyed, the price in red, and the line
 * says how much more he needs ("15,000 ៛ more"); tried anyway, the row shakes
 * and says it in red a moment (`short`). Under the list, while he has none, a
 * line: it stays where he leaves it.
 *
 * Keys while it is open (its own: a capture listener): 1–3 take that row, ↑ ↓
 * (Tab) move the ring, Enter, Space or E take the one in the ring, Esc (or the
 * ×) shuts it. A click or tap on a row; a tap on the view outside the sheet
 * shuts it on a phone; touch's Use takes the one in the ring (`confirm`). The
 * game pad: a layer while open (its arrows move the ring, ✕ takes, ○ shuts).
 * While a sale is under way (`busy`) nothing more is taken.
 */
export interface BikeShopCard {
  readonly el: HTMLElement;
  readonly open: boolean;
  /** The row in the ring. */
  readonly ring: number;
  /** Open, with the purse's riel now. */
  show(rielNow: number): void;
  /** The mechanic's words over the list. */
  say(key: WordKey): void;
  /** What he owns changed: the rows again (the one bought flashes). */
  refill(bought?: BikeKindId): void;
  /** The purse's riel at the foot (`up`: it glows, counting). */
  purse(n: number, up: boolean): void;
  /** Short of riel for this one: the row says how much more, in red, a moment. */
  short(k: BikeKindId): void;
  /** A sale under way: nothing more can be taken. */
  busy(on: boolean): void;
  close(): void;
  /** Touch's Use (or a check's `e`): take the one in the ring. */
  confirm(): void;
  /** Checks: the ring on row `i`. */
  focus(i: number): void;
}

export interface BikeShopDeps {
  layer: HTMLElement;
  onBuy(k: BikeKindId): void;
  onClose(): void;
  sound(s: UISound): void;
}

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `
    .rh > .bs-card.mu-frame { width: calc(430 * var(--px)); }
    .bs-card .sl-head-icon { width: calc(36 * var(--px)); height: calc(24 * var(--px)); }
    .bs-card .sl-list { max-height: calc(min(380 * var(--px), 54vh)); }
    .bs-card .sl-item { min-height: calc(62 * var(--px)); }
    .bs-pic { flex: none; display: grid; place-items: center; width: calc(64 * var(--px)); height: calc(46 * var(--px)); border-radius: calc(5 * var(--px));
      background: linear-gradient(#f4ead2, #e2d4b2); box-shadow: inset 0 calc(-2 * var(--px)) 0 rgba(0, 0, 0, 0.12), 0 calc(1.5 * var(--px)) 0 rgba(0, 0, 0, 0.35); }
    .bs-bike { width: calc(56 * var(--px)); height: calc(33 * var(--px)); }
    .bs-card .sl-name small { display: flex; flex-wrap: wrap; gap: 0 calc(6 * var(--px)); }
    .bs-more, .bs-short { color: #f0a08a; }
    .bs-short { display: none; }
    .bs-item.is-short .bs-short { display: inline; }
    .bs-item.is-short :is(.bs-note, .bs-more) { display: none; }
    .bs-yours { color: #a8d898; }
    .bs-price { display: grid; justify-items: end; gap: calc(2 * var(--px)); }
    .bs-price small { font-family: inherit; font-weight: 600; font-size: calc(11 * var(--px)); line-height: 1.1; color: #a8d898; letter-spacing: 0; white-space: normal; text-align: right; max-width: calc(130 * var(--px)); }
    .bs-price s { font: 600 calc(11.5 * var(--px)) / 1 var(--mu-display); color: var(--mu-ink2); text-decoration-thickness: 1px; }
    .bs-item.is-own .sl-price { color: #a8d898; }
    .bs-item.is-dear { color: var(--mu-ink2); }
    .bs-item.is-dear .bs-pic { opacity: 0.7; filter: grayscale(0.4); }
    .bs-item.is-dear .bs-price > b { color: #e8806a; }
    .bs-item.is-short { animation: bs-shake 0.4s var(--mu-ease); }
    @keyframes bs-shake { 20%, 60% { transform: translateX(calc(-4 * var(--px))); } 40%, 80% { transform: translateX(calc(4 * var(--px))); } }
    .bs-item.is-got { animation: bs-got 0.5s var(--mu-ease); }
    @keyframes bs-got { 40% { transform: translateX(calc(-2 * var(--px))) scale(1.03); } }
    .mu-calm ~ .rh .bs-item { animation: none !important; }
    :lang(km) .bs-price small { font-size: calc(12 * var(--px)); }
    @media (max-width: 639px) { .bs-card .sl-list { max-height: 36vh; } .bs-pic { width: 54px; height: 40px; } .bs-bike { width: 48px; height: 28px; } }`;
  document.head.append(s);
}

export function createBikeShopCard(d: BikeShopDeps): BikeShopCard {
  injectSellStyle();
  injectStyle();
  const el = document.createElement('section');
  el.className = 'sl-card bs-card mu-frame mu-md';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-labelledby', 'bs-title');
  el.innerHTML = `<span class="mu-bg"></span>
    <header class="sl-head">${shopIcon('sl-head-icon')}<h2 id="bs-title"></h2><button type="button" class="sl-x">${CLOSE_X}</button></header>
    <p class="sl-ask" aria-live="polite"></p>
    <div class="sl-list" role="list"></div>
    <p class="sl-note bs-hint"></p>
    <footer class="sl-foot">${RIEL_ICON}<span class="sl-purse-label"></span><b class="sl-riel-foot"></b></footer>`;
  d.layer.append(el);
  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const title = q('#bs-title');
  const ask = q('.sl-ask');
  const list = q('.sl-list');
  const hint = q('.bs-hint');
  const xBtn = q<HTMLButtonElement>('.sl-x');
  const rielEl = q('.sl-riel-foot');
  let open = false;
  let rows: HTMLButtonElement[] = [];
  let ring = 0;
  let isBusy = false;
  let words: WordKey = 'bikeShopHi';
  let shownRiel = 0;
  let shortK: BikeKindId | null = null;
  let shortTimer = 0;
  let padClose: (() => void) | null = null;
  /** What the rows were made from (made again only when it changes). */
  let made = '';

  /** More than the purse holds (greyed, its price in red). */
  const dear = (k: BikeKindId): boolean => BIKE_OWN.kind !== k && costFor(k) > shownRiel;

  /** The rows in the language in use (made again only when they change: true then). */
  function fillList(): boolean {
    const key = `${BIKE_OWN.kind ?? ''}|${BIKE_KINDS.map((k) => `${k.id}:${costFor(k.id)}:${dear(k.id) ? shownRiel : ''}`).join(',')}|${t('bikeShopYours')}|${shortK ?? ''}`;
    if (key === made) return false;
    made = key;
    list.innerHTML = BIKE_KINDS.map((K, i) => {
      const k = K.id;
      const mine = BIKE_OWN.kind === k;
      const cost = costFor(k);
      const traded = !mine && BIKE_OWN.kind ? tradeIn(BIKE_OWN.kind) : 0;
      const more = dear(k) ? `<span class="bs-more">${esc(t('bikeShopMore', { riel: riel(cost - shownRiel) }))}</span>` : '';
      const line = `<span class="bs-note">${esc(t(K.note))}</span>${more}<span class="bs-short">${esc(t('bikeShopMore', { riel: riel(Math.max(0, cost - shownRiel)) }))}</span>`;
      const price = mine
        ? `<span class="sl-price bs-price"><b>✓ ${esc(t('bikeShopYours'))}</b></span>`
        : `<span class="sl-price bs-price"><b>${riel(cost)}</b>${traded ? `<s>${riel(K.price)}</s><small>${esc(t('bikeShopTrade', { riel: riel(traded) }))}</small>` : ''}</span>`;
      return `<button type="button" class="sl-item bs-item${mine ? ' is-own' : ''}${dear(k) ? ' is-dear' : ''}${shortK === k ? ' is-short' : ''}" data-i="${i}" role="listitem"><span class="sl-bg"></span><kbd>${i + 1}</kbd>${PAD_X}<span class="bs-pic">${bikePicture(k, K.colour)}</span><span class="sl-name">${esc(t(K.name))}<small>${line}</small></span>${price}</button>`;
    }).join('');
    rows = [...list.querySelectorAll<HTMLButtonElement>('.bs-item')];
    rows.forEach((b, i) => {
      const K = BIKE_KINDS[i];
      const mine = BIKE_OWN.kind === K.id;
      b.setAttribute('aria-label', `${t(K.name)}, ${t(K.note)}, ${mine ? t('bikeShopYours') : riel(costFor(K.id))}${dear(K.id) ? ` (${t('bikeShopMore', { riel: riel(costFor(K.id) - shownRiel) })})` : ''}`);
    });
    if (ring >= rows.length) ring = Math.max(0, rows.length - 1);
    return true;
  }

  /** The words, the hint, the foot. */
  function fill(): void {
    title.textContent = t('bikeShopName');
    xBtn.setAttribute('aria-label', t('byClose'));
    xBtn.title = `${t('byClose')} (Esc)`;
    q('.sl-purse-label').textContent = t('byPurse');
    rielEl.textContent = riel(shownRiel);
    ask.textContent = `“${t(words)}”`;
    hint.textContent = t('bikeShopFoot');
    hint.hidden = !!BIKE_OWN.kind;
    rows.forEach((b) => (b.disabled = isBusy));
    light();
  }

  function light(): void {
    rows.forEach((b, i) => b.classList.toggle('is-focus', open && ring === i));
  }

  function setRing(i: number, sound = true): void {
    const n = rows.length;
    if (!n) return;
    i = ((i % n) + n) % n;
    if (i === ring) return;
    ring = i;
    light();
    if (sound) d.sound('hover');
    rows[ring]?.scrollIntoView({ block: 'nearest' });
  }

  /** Take row `i` (buy that bicycle). */
  function take(i: number): void {
    if (!open || isBusy) return;
    const K = BIKE_KINDS[i];
    if (!K) return;
    d.sound('select');
    d.onBuy(K.id);
  }

  // ── Mouse and touch ──
  list.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.bs-item');
    if (!b) return;
    b.blur();
    const i = Number(b.dataset.i);
    setRing(i, false);
    take(i);
  });
  list.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.bs-item');
    if (b && !b.disabled) setRing(Number(b.dataset.i));
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
        const i = Number(digit[1]) - 1;
        if (!e.repeat && i < rows.length) {
          setRing(i, false);
          take(i);
        } else if (i >= rows.length) used = false;
      } else if (e.code === 'ArrowDown' || (e.code === 'Tab' && !e.shiftKey)) setRing(ring + 1);
      else if (e.code === 'ArrowUp' || (e.code === 'Tab' && e.shiftKey)) setRing(ring - 1);
      else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space' || e.code === 'KeyE') {
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
    get ring() {
      return ring;
    },
    show(rielNow) {
      shownRiel = rielNow;
      isBusy = false;
      shortK = null;
      made = '';
      words = BIKE_OWN.kind ? 'bikeShopHiOwn' : 'bikeShopHi';
      // (the ring starts on the first he does not have)
      ring = Math.max(0, BIKE_KINDS.findIndex((k) => k.id !== BIKE_OWN.kind));
      open = true;
      fillList();
      fill();
      list.scrollTop = 0;
      ask.classList.remove('is-said');
      el.classList.add('is-on');
      document.body.classList.add('roam-sell');
      padClose ??= pad.openLayer(el, {
        first: () => rows[ring] ?? xBtn,
        back: () => d.onClose(),
      });
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
    refill(bought) {
      if (!open) return;
      made = '';
      fillList();
      fill();
      if (bought) rows[BIKE_KINDS.findIndex((k) => k.id === bought)]?.classList.add('is-got');
    },
    purse(n, up) {
      shownRiel = n;
      rielEl.textContent = riel(n);
      rielEl.classList.toggle('is-up', up);
      if (open && fillList()) fill();
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
