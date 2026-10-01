import { pad } from '../pad/pad';
import type { UISound } from '../types';
import { lang, num, onLang, t } from '../ui/lang';
import { FISH, type FishKind } from './_fishKinds';
import { BASKET_ICON, fishIcon } from './_fishSellArt';
import { basket, BASKET_MAX, fishName, fishPrice, told } from './_fishSellBasket';
import { esc, injectSellStyle, PAD_X } from './_fishSellStyle';
import { RIEL_ICON } from './_shopIcons';
import { riel } from './_shopPurse';

/**
 * The catch card (selling his fish: _fishSell.ts): when he holds up a fish
 * he caught (_fishing.ts), he chooses — **Keep** it (into his fish basket,
 * up to five) or **Let go** (back into the water, as before). It shows the
 * fish (its own pixels), its name and size, what a fish seller would pay
 * for it, how full the basket is; with the basket full only "Let go" can
 * be picked, and it says so. The first time (until he has kept one, saved)
 * it says that fish do not keep: sell them today.
 *
 * Keys while it is open (its own: a capture listener, so the roaming keys
 * never see them): 1 keep, 2 let go; ← → ↑ ↓ (Tab) move the ring; Enter,
 * Space, E or F take the one in the ring; Esc lets it go. The first moment
 * after it opens takes nothing (a strike key still held). A click or a tap
 * on a choice; touch's Use takes the one in the ring (`confirm`). The game
 * pad: a layer while open (its arrows move the ring, ✕ takes, ○ lets go).
 * In the look of the buy menu's second step (_shopMenu.ts), at the right of
 * the view (a sheet along the bottom on a phone held upright).
 */
export type CatchPick = 'keep' | 'free';

export interface CatchChoice {
  /** The card (its place on the page: the lens shift, _fishSell.ts), once made. */
  readonly el: HTMLElement | null;
  readonly open: boolean;
  /** Open it for a catch (in `layer`); `onChoose` is called once, with the choice. */
  show(layer: HTMLElement, kind: FishKind, cm: number, onChoose: (c: CatchPick) => void): void;
  /** Shut it without a choice (he stopped fishing, left the boat, went back to the map). */
  close(): void;
  /** Touch's Use, or a check's `e`: take the one in the ring. */
  confirm(): void;
  /** Checks: the ring on choice `i` (0 keep, 1 let go). */
  focus(i: number): void;
}

/** The interface's sounds (open, hover, select, close): the add-on lends roaming's (_fishSell.ts `init`). */
export const sellUi: { sound(s: UISound): void } = { sound() {} };

/** Nothing is taken this long after it opens (ms): a strike key still held. */
const SETTLE_MS = 350;

const SHOT = typeof location !== 'undefined' && new URLSearchParams(location.search).get('shot') === '1';

let el: HTMLElement | null = null;
let keepB: HTMLButtonElement;
let freeB: HTMLButtonElement;
let open = false;
let kind: FishKind = 'riel';
let cm = 10;
let room = true;
let focus = 0;
let openedAt = 0;
let choose: ((c: CatchPick) => void) | null = null;
let padClose: (() => void) | null = null;

function make(layer: HTMLElement): HTMLElement {
  injectSellStyle();
  const e = document.createElement('section');
  e.className = 'sl-card sl-catch mu-frame mu-md';
  e.setAttribute('role', 'dialog');
  e.setAttribute('aria-labelledby', 'sl-catch-name');
  e.innerHTML = `<span class="mu-bg"></span>
    <div class="sl-got"><span class="sl-got-art"></span><h2 class="sl-got-name" id="sl-catch-name"></h2><p class="sl-got-sub"></p><p class="sl-got-worth">${RIEL_ICON}<span class="sl-got-w"></span></p></div>
    <p class="sl-note" hidden></p>
    <div class="sl-choose">
      <button type="button" class="sl-c sl-keep" data-c="keep"><span class="sl-bg"></span><kbd>1</kbd>${PAD_X}<span class="sl-c-t"></span><small class="sl-c-n"></small></button>
      <button type="button" class="sl-c sl-free" data-c="free"><span class="sl-bg"></span><kbd>2</kbd>${PAD_X}<span class="sl-c-t"></span></button>
    </div>`;
  layer.append(e);
  keepB = e.querySelector<HTMLButtonElement>('.sl-keep')!;
  freeB = e.querySelector<HTMLButtonElement>('.sl-free')!;
  for (const b of [keepB, freeB]) {
    b.addEventListener('click', () => {
      b.blur();
      pick(b === keepB ? 'keep' : 'free', true);
    });
    b.addEventListener('pointerenter', (ev) => {
      if (ev.pointerType === 'mouse' && !b.disabled) setFocus(b === keepB ? 0 : 1);
    });
  }
  // ── Keys: its own while open (before the roaming keys, which then never see them) ──
  addEventListener(
    'keydown',
    (ev) => {
      if (!open || ev.ctrlKey || ev.metaKey || ev.altKey || document.body.classList.contains('reporting')) return;
      const tg = ev.target as HTMLElement | null;
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
      const c = ev.code;
      let used = true;
      if (c === 'Digit1' || c === 'Numpad1') pick('keep');
      else if (c === 'Digit2' || c === 'Numpad2') pick('free');
      else if (c === 'ArrowLeft' || c === 'ArrowRight' || c === 'ArrowUp' || c === 'ArrowDown' || c === 'Tab') setFocus(room ? 1 - focus : 1);
      else if (c === 'Enter' || c === 'NumpadEnter' || c === 'Space' || c === 'KeyE' || c === 'KeyF') pick(focus === 0 ? 'keep' : 'free');
      else if (c === 'Escape') pick('free');
      // (the explorer menu and the album wait until he has chosen: they would open behind the card)
      else if (c === 'KeyI' || c === 'KeyV') used = true;
      else used = false;
      if (!used) return;
      ev.preventDefault();
      ev.stopPropagation();
    },
    { capture: true },
  );
  onLang(() => {
    if (open) fill();
  });
  return e;
}

/** The words, the fish, the basket (in the language in use). */
function fill(): void {
  if (!el) return;
  const q = <T extends HTMLElement>(s: string) => el!.querySelector<T>(s)!;
  q('.sl-got-art').innerHTML = fishIcon(kind, 'sl-got-fish');
  q('.sl-got-name').textContent = FISH[kind].km;
  q('.sl-got-sub').textContent = `${lang() === 'km' ? FISH[kind].say : fishName(kind)} · ${t('sellCm', { cm: num(cm) })}`;
  q('.sl-got-w').innerHTML = esc(t('sellWorth', { price: '\u0000' })).replace('\u0000', `<b>${riel(fishPrice(kind, cm))}</b>`);
  const note = q('.sl-note');
  note.textContent = room ? t('sellNoKeep') : t('sellFullNote');
  note.hidden = room && !firstTime();
  q('.sl-keep .sl-c-t').textContent = t('sellKeep');
  q('.sl-free .sl-c-t').textContent = t('sellLetGo');
  q('.sl-c-n').innerHTML = `${BASKET_ICON('sl-basket-icon')}${num(basket.n)}/${num(BASKET_MAX)}`;
  q('.sl-c-n').setAttribute('aria-label', room ? `${t('sellBasket')} ${num(basket.n)}/${num(BASKET_MAX)}` : t('sellFull'));
  keepB.disabled = !room;
  el.setAttribute('aria-label', `${FISH[kind].km}, ${t('sellCm', { cm: num(cm) })}`);
  light();
}

/** Fish do not keep: said until he has kept one (saved), and not while his basket has some. */
const firstTime = () => !told.get() && basket.n === 0;

function light(): void {
  keepB.classList.toggle('is-focus', open && focus === 0);
  freeB.classList.toggle('is-focus', open && focus === 1);
}

function setFocus(i: number, sound = true): void {
  if (!room) i = 1;
  if (i === focus) return;
  focus = i;
  light();
  if (sound) sellUi.sound('hover');
}

/** A choice: carried out by `choose` (the first moment after it opens takes no key: `click` comes from a pointer). */
function pick(c: CatchPick, click = false): void {
  if (!open || (c === 'keep' && !room)) return;
  if (!click && !SHOT && performance.now() - openedAt < SETTLE_MS) return;
  const fn = choose;
  sellUi.sound('select');
  shut();
  fn?.(c);
}

function shut(): void {
  open = false;
  choose = null;
  if (!el) return;
  el.classList.remove('is-on');
  document.body.classList.remove('roam-sell');
  light();
  if (padClose) {
    padClose();
    padClose = null;
  }
  if (document.activeElement instanceof HTMLElement && el.contains(document.activeElement)) document.activeElement.blur();
}

export const catchChoice: CatchChoice = {
  get el() {
    return el;
  },
  get open() {
    return open;
  },
  show(layer, k, c, onChoose) {
    el ??= make(layer);
    kind = k;
    cm = c;
    room = !basket.full;
    focus = room ? 0 : 1;
    choose = onChoose;
    open = true;
    openedAt = performance.now();
    fill();
    el.classList.add('is-on');
    document.body.classList.add('roam-sell');
    padClose ??= pad.openLayer(el, { first: () => (focus === 0 && room ? keepB : freeB), back: () => pick('free', true) });
    sellUi.sound('open');
  },
  close() {
    if (!open) return;
    shut();
    sellUi.sound('close');
  },
  confirm() {
    pick(focus === 0 && room ? 'keep' : 'free', true);
  },
  focus(i) {
    setFocus(i, false);
  },
};
