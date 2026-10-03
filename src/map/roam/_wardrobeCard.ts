import { pad } from '../pad/pad';
import type { UISound } from '../types';
import { onLang, t, type WordKey } from '../ui/lang';
import { RIEL_ICON } from './_shopIcons';
import { riel } from './_shopPurse';
import { stallIcon, wearIcon } from './_wardrobeIcons';
import { itemsOf, WEAR_KINDS, wearName, type WearItem, type WearKind } from './_wardrobeItems';
import { CLOSE_X, esc, injectWearStyle, PAD_X } from './_wardrobeStyle';

/**
 * The krama stall's card (_wardrobe.ts opens it with E), in the buy menu's
 * look (_shopMenu.ts): the stall's name, the seller's words, a tab for each
 * kind (kramas, shirts, trousers, hats) with what the stall sells — each its
 * picture, its name, its price in riel; what he owns says "Wear" (and
 * "Yours"), what he wears "✓ Wearing" ("Take off" in the ring) — and at the
 * foot the purse and "Original look". What he owns and wears after is on the
 * explorer menu's Look page (_wardrobeLook.ts).
 *
 * A row: buy it (paid, he puts it on), put it on, or take it off. Keys while
 * it is open (its own: a capture listener; the roaming keys never see them):
 * 1–6 that row of the tab; ↑ ↓ (Tab) move the ring, down to "Original look";
 * ← → the tabs; Enter or Space take the one in the ring; E or Esc (or the ×)
 * shut it. Mouse and touch: a click or a tap; on a phone a tap on the view
 * outside the sheet shuts it; touch's Use takes the one in the ring
 * (`confirm`). The game pad: a layer while open (its arrows move the ring
 * and the tabs, L1 / R1 the tabs, ✕ takes, ○ shuts).
 */
export interface WearCard {
  /** The panel (its place on the page: the camera's lens shift, _wardrobe.ts). */
  readonly el: HTMLElement;
  readonly open: boolean;
  /** `stall` while open (its only way now: his wardrobe is the explorer menu's Look page). */
  readonly mode: 'stall' | null;
  readonly tab: WearKind;
  /** Open on a tab (default: the first). */
  show(tab?: WearKind): void;
  /** What he owns or wears, the purse, the look changed. */
  refresh(): void;
  /** The seller's words over the list (the stall). */
  say(key: WordKey): void;
  /** Not enough riel for this item: its row says so. */
  short(id: string): void;
  /** A sale handed over (nothing can be picked meanwhile); `fresh`: the row of what he just bought glows. */
  busy(on: boolean, fresh?: string): void;
  setTab(kind: WearKind): void;
  close(): void;
  /** Touch's Use (or a check's `e`): take the one in the ring. */
  confirm(): void;
  /** Checks: the ring on row `i` of the tab (its length: "Original look"). */
  focus(i: number): void;
}

export interface WearCardDeps {
  layer: HTMLElement;
  /** Riel in the purse now. */
  riel(): number;
  owned(id: string): boolean;
  wearing(id: string): boolean;
  /** Wearing it, it waits for the explorer clothes (trousers with the sampot on). */
  waits(it: WearItem): boolean;
  /** He looks as he set out (no "Original look" to take). */
  original(): boolean;
  /** A row taken: buy it, put it on or take it off. */
  onPick(it: WearItem): void;
  onOriginal(): void;
  /** Esc, E, the ×, ○, a tap outside: shut it. */
  onClose(): void;
  sound(s: UISound): void;
}

const TAB_WORD: Record<WearKind, WordKey> = { krama: 'wearKramas', shirt: 'wearShirts', trousers: 'wearTrousers', hat: 'wearHats' };

const SHOT = new URLSearchParams(location.search).get('shot') === '1';

export function createWearCard(d: WearCardDeps): WearCard {
  injectWearStyle();
  const el = document.createElement('section');
  el.className = 'wr-card mu-frame mu-md';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-labelledby', 'wr-title');
  el.innerHTML = `<span class="mu-bg"></span>
    <header class="wr-head"><span class="wr-head-icon"></span><h2 id="wr-title"></h2><button type="button" class="wr-x">${CLOSE_X}</button></header>
    <p class="wr-ask" aria-live="polite"></p>
    <nav class="wr-tabs" role="tablist"><kbd class="wr-tabk" data-pad="l1" aria-hidden="true">←</kbd>${WEAR_KINDS.map((k) => `<button type="button" class="wr-tab" role="tab" data-tab="${k}"><span class="wr-bg"></span><span class="wr-tab-t"></span></button>`).join('')}<kbd class="wr-tabk" data-pad="r1" aria-hidden="true">→</kbd></nav>
    <div class="wr-list" role="list"></div>
    <footer class="wr-foot"><span class="wr-purse">${RIEL_ICON}<span class="wr-purse-label"></span><b class="wr-riel"></b></span>
      <button type="button" class="wr-orig"><span class="wr-bg"></span>${PAD_X}<span class="wr-orig-t"></span></button></footer>`;
  d.layer.append(el);
  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const title = q('#wr-title');
  const headIcon = q('.wr-head-icon');
  const ask = q('.wr-ask');
  const list = q('.wr-list');
  const xBtn = q<HTMLButtonElement>('.wr-x');
  const orig = q<HTMLButtonElement>('.wr-orig');
  const tabs = [...el.querySelectorAll<HTMLButtonElement>('.wr-tab')];

  let mode: 'stall' | null = null;
  let tab: WearKind = 'krama';
  /** The rows' items (this tab's), their buttons; the ring: a row, or `items.length` for "Original look". */
  let items: WearItem[] = [];
  let rows: HTMLButtonElement[] = [];
  let ring = 0;
  let words: WordKey = 'wearAsk';
  let busy = false;
  let fresh = '';
  let shortId = '';
  let shortTimer = 0;
  let padClose: (() => void) | null = null;

  /** This tab's rows: the stall's things. */
  function fillList(): void {
    items = itemsOf(tab);
    list.innerHTML = items
      .map(
        (it, i) =>
          `<button type="button" class="wr-item" data-i="${i}" role="listitem"><span class="wr-bg"></span>${i < 9 ? `<kbd>${i + 1}</kbd>` : '<kbd hidden></kbd>'}${PAD_X}${wearIcon(it)}<span class="wr-name">${esc(wearName(it))}<small class="wr-note"></small><small class="wr-short">${esc(t('byShort'))}</small></span><span class="wr-state"><b class="wr-price">${riel(it.price)}</b><span class="wr-put">${esc(t('wearPutOn'))}</span><span class="wr-on">✓ ${esc(t('wearOnNow'))}</span><span class="wr-off">${esc(t('wearTakeOff'))}</span></span></button>`,
      )
      .join('');
    rows = [...list.querySelectorAll<HTMLButtonElement>('.wr-item')];
    if (ring > items.length) ring = items.length;
    // (the list as tall as the longest tab: the stall's six)
    el.style.setProperty('--wr-rows', String(Math.max(...WEAR_KINDS.map((k) => itemsOf(k).length))));
  }

  /** The words, the states of the rows, the tabs, the foot (only while open). */
  function fill(): void {
    if (!mode) return;
    title.textContent = t('wearStall');
    headIcon.innerHTML = stallIcon('wr-icon');
    ask.textContent = `“${t(words)}”`;
    ask.classList.add('is-quote');
    xBtn.setAttribute('aria-label', t('byClose'));
    xBtn.title = `${t('byClose')} (Esc)`;
    q('.wr-purse-label').textContent = t('byPurse');
    q('.wr-riel').textContent = riel(d.riel());
    q('.wr-orig-t').textContent = t('wearOriginal');
    orig.disabled = d.original() || busy;
    for (const b of tabs) {
      const k = b.dataset.tab as WearKind;
      b.querySelector('.wr-tab-t')!.textContent = t(TAB_WORD[k]);
      b.classList.toggle('is-tab', k === tab);
      b.setAttribute('aria-selected', String(k === tab));
      // (a dot: he wears one of it)
      b.classList.toggle('is-worn', itemsOf(k).some((i) => d.wearing(i.id)));
    }
    rows.forEach((b, i) => {
      const it = items[i];
      const own = d.owned(it.id);
      const on = d.wearing(it.id);
      const can = own || d.riel() >= it.price;
      b.classList.toggle('is-owned', own);
      b.classList.toggle('is-on', on);
      b.classList.toggle('is-short', !can);
      b.classList.toggle('is-said', it.id === shortId);
      b.classList.toggle('is-new', it.id === fresh);
      b.disabled = busy;
      const note = on && d.waits(it) ? t('wearWithExplorer') : own ? t('wearYours') : '';
      b.querySelector('.wr-note')!.textContent = note;
      const state = on ? t('wearOnNow') : own ? t('wearPutOn') : riel(it.price);
      b.setAttribute('aria-label', `${wearName(it)}, ${state}${!can ? `: ${t('byShort')}` : ''}`);
      b.setAttribute('aria-pressed', String(on));
    });
    light();
  }

  /** The ring (the keyboard's choice, or where the mouse is). */
  function light(): void {
    rows.forEach((b, i) => b.classList.toggle('is-focus', i === ring));
    orig.classList.toggle('is-focus', ring === items.length && !orig.disabled);
  }

  /** The ring on `i` (rows, then "Original look" when it can be pressed). */
  function setRing(i: number, sound = true): void {
    const n = items.length + (orig.disabled ? 0 : 1);
    if (!n) return;
    const r = ((i % n) + n) % n;
    if (r === ring) return;
    ring = r;
    light();
    if (sound) d.sound('hover');
    rows[ring]?.scrollIntoView({ block: 'nearest' });
  }

  function take(i: number): void {
    if (busy || !mode) return;
    if (i === items.length) {
      if (orig.disabled) return;
      d.sound('select');
      d.onOriginal();
      return;
    }
    const it = items[i];
    if (!it) return;
    setRing(i, false);
    d.onPick(it);
  }

  function setTab(k: WearKind, sound = true): void {
    if (k === tab) return;
    tab = k;
    ring = 0;
    fillList();
    fill();
    if (sound) d.sound('hover');
  }
  const nextTab = (dir: 1 | -1) => setTab(WEAR_KINDS[(WEAR_KINDS.indexOf(tab) + dir + WEAR_KINDS.length) % WEAR_KINDS.length]);

  // ── Mouse and touch ──
  list.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.wr-item');
    if (!b) return;
    // (let go of the focus: Space and Enter are the card's, then roaming's)
    b.blur();
    take(Number(b.dataset.i));
  });
  list.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.wr-item');
    if (b) setRing(Number(b.dataset.i));
  });
  orig.addEventListener('click', () => {
    orig.blur();
    take(items.length);
  });
  orig.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse' && !orig.disabled) setRing(items.length);
  });
  for (const b of tabs)
    b.addEventListener('click', () => {
      b.blur();
      setTab(b.dataset.tab as WearKind);
    });
  xBtn.addEventListener('click', () => {
    xBtn.blur();
    d.onClose();
  });
  // (a tap on the view outside the sheet shuts it on a phone, as the buy menu)
  addEventListener(
    'pointerdown',
    (e) => {
      if (!mode || e.pointerType !== 'touch' || el.contains(e.target as Node)) return;
      if ((e.target as Element | null)?.closest?.('.rxm, .rtb-wrap')) return;
      d.onClose();
    },
    true,
  );

  // ── Keys: its own while open (before the roaming keys, which then never see them) ──
  addEventListener(
    'keydown',
    (e) => {
      if (!mode || e.ctrlKey || e.metaKey || e.altKey || document.body.classList.contains('reporting')) return;
      const tg = e.target as HTMLElement | null;
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
      const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      let used = true;
      if (digit) {
        if (!e.repeat && Number(digit[1]) <= items.length) take(Number(digit[1]) - 1);
      } else if (e.code === 'ArrowDown' || (e.code === 'Tab' && !e.shiftKey)) setRing(ring + 1);
      else if (e.code === 'ArrowUp' || (e.code === 'Tab' && e.shiftKey)) setRing(ring - 1);
      else if (e.code === 'ArrowRight') nextTab(1);
      else if (e.code === 'ArrowLeft') nextTab(-1);
      else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
        if (!e.repeat) take(ring);
      } else if (e.code === 'KeyE' || e.code === 'Escape') {
        if (!e.repeat) d.onClose();
      } else used = false;
      if (!used) return;
      e.preventDefault();
      e.stopPropagation();
    },
    { capture: true },
  );
  onLang(() => {
    if (!mode) return;
    fillList();
    fill();
  });

  /** The row or button in the ring (the pad's focus sits there). */
  const ringed = (): HTMLElement | null => (ring === items.length ? orig : (rows[ring] ?? null));

  function setOpen(m: 'stall' | null): void {
    mode = m;
    el.classList.toggle('is-on', m !== null);
    document.body.classList.toggle('roam-wear', m !== null);
    if (m && !padClose) padClose = pad.openLayer(el, { first: ringed, back: () => d.onClose(), tabs: (dir) => nextTab(dir) });
    else if (!m && padClose) {
      padClose();
      padClose = null;
    }
    // (shut: the pad's focus leaves it, so Enter and Space are his again)
    if (!m && document.activeElement instanceof HTMLElement && el.contains(document.activeElement)) document.activeElement.blur();
  }

  return {
    el,
    get open() {
      return mode !== null;
    },
    get mode() {
      return mode;
    },
    get tab() {
      return tab;
    },
    show(k) {
      const was = mode;
      words = 'wearAsk';
      shortId = '';
      fresh = '';
      busy = false;
      tab = k ?? 'krama';
      mode = 'stall';
      ring = 0;
      fillList();
      setOpen('stall');
      fill();
      if (!was) d.sound('open');
    },
    refresh() {
      if (!mode) return;
      fill();
    },
    say(key) {
      words = key;
      fill();
      ask.classList.remove('is-said');
      void ask.offsetWidth;
      ask.classList.add('is-said');
    },
    short(id) {
      shortId = id;
      fill();
      const b = rows[items.findIndex((i) => i.id === id)];
      if (b) {
        b.classList.remove('is-shake');
        void b.offsetWidth;
        b.classList.add('is-shake');
      }
      d.sound('back');
      clearTimeout(shortTimer);
      // (it says so for a while; in a still, for good)
      if (!SHOT)
        shortTimer = window.setTimeout(() => {
          shortId = '';
          fill();
        }, 2600);
    },
    busy(on, f) {
      busy = on;
      if (f !== undefined) fresh = f;
      fill();
    },
    setTab: (k) => setTab(k, false),
    close() {
      if (!mode) return;
      setOpen(null);
      d.sound('close');
    },
    confirm() {
      take(ring);
    },
    focus(i) {
      ring = Math.max(0, Math.min(items.length, i));
      light();
    },
  };
}
