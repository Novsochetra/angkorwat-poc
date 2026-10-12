import { ageOf, BOUGHT_GROW, CATTLE, condOf, GROWN_AT, HERD_MAX, hungry, PRICE, STRAW_MAX, THIN, value, wellFed, type Cow } from '../cattle/state';
import { pad } from '../pad/pad';
import type { UISound } from '../types';
import { num, onLang, t, type WordKey } from '../ui/lang';
import { cattleIcon, type CattleArt } from './_cattleArt';
import { CLOSE_X, esc, injectSellStyle, PAD_X } from './_fishSellStyle';
import { RIEL_ICON } from './_shopIcons';
import { riel } from './_shopPurse';

/**
 * The cattle trader's card (roam/_cattle.ts opens it with E before his stool),
 * in the buy menu's and the nursery's look (_shopMenu.ts, _gardenShopCard.ts:
 * the same panel, rows and ring, `sl-` classes from _fishSellStyle.ts): his
 * name, his words, three tabs, the purse, his herd and his straw at the foot.
 *
 * - **Buy**: a calf (កូនគោ) and a young cow (គោក្មេង), each with its picture,
 *   about what it weighs and how soon it is grown if fed every day, and its
 *   price. Short of riel: greyed, the price in red (and he says so if tried);
 *   four cows already: "Meadow full".
 * - **Sell**: each of his cows (its age, weight, well fed, hungry or thin, can
 *   be ridden) and what the trader pays for it now (cattle/state.ts `value`).
 *   None: a line to buy a calf first.
 * - **Straw**: rice-straw bundles (ចំបើង) for feeding, one or five (or ten),
 *   how many he has at home; greyed when there is no room for more.
 *
 * Keys while it is open (its own, a capture listener): 1–9 take that row, ↑ ↓
 * move the ring, ← → (Tab) change tabs, Enter, Space or E take the one in the
 * ring, Esc (or the ×) shuts it. A click or tap on a row or a tab; a tap on the
 * view outside it shuts it on a phone; touch's Use takes the one in the ring
 * (`confirm`). The game pad: a layer while open (its arrows, ✕ takes, ○ shuts,
 * L1 / R1 the tabs). While a hand-over is under way (`busy`) nothing more is taken.
 */
export type CattleTab = 'buy' | 'sell' | 'straw';
const TABS: readonly CattleTab[] = ['buy', 'sell', 'straw'];

export type CattleRow = { kind: 'calf' } | { kind: 'young' } | { kind: 'cow'; cow: Cow } | { kind: 'straw'; n: number };

export interface CattleCard {
  readonly el: HTMLElement;
  readonly open: boolean;
  readonly tab: CattleTab;
  show(tab: CattleTab, rielNow: number): void;
  setTab(tab: CattleTab, sound?: boolean): void;
  say(key: WordKey, vars?: Record<string, string>): void;
  /** The herd, the straw or the prices changed: the rows again. */
  refill(): void;
  purse(n: number, up: boolean): void;
  /** Short of riel for this row: it says so a moment. */
  short(i: number): void;
  busy(on: boolean): void;
  close(): void;
  confirm(): void;
  focus(i: number): void;
}

export interface CattleCardDeps {
  layer: HTMLElement;
  onTake(row: CattleRow): void;
  onTab(tab: CattleTab): void;
  onClose(): void;
  sound(s: UISound): void;
}

const STRAW_ROWS = [1, 5, 10];
const cowArt = (c: Cow): CattleArt => ageOf(c);
const AGE_WORD = { calf: 'cattleCalf', young: 'cattleYoung', grown: 'cattleGrown' } as const;

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `
    .rh > .ct-card.mu-frame { width: calc(410 * var(--px)); }
    .ct-tabs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: calc(6 * var(--px)); }
    .ct-tab { position: relative; display: flex; align-items: center; justify-content: center; gap: calc(6 * var(--px)); min-height: calc(40 * var(--px));
      padding: calc(4 * var(--px)) calc(8 * var(--px)); border: 0; background: none; cursor: pointer; outline: none; color: var(--mu-ink2); isolation: isolate;
      font-family: inherit; font-weight: 700; font-size: calc(14 * var(--px)); line-height: 1.2; touch-action: manipulation; transition: color 0.2s; }
    .ct-tab .sl-bg { background: rgba(255, 244, 222, 0.04); }
    .ct-tab[aria-selected='true'] { color: var(--mu-gold-hi); }
    .ct-tab[aria-selected='true'] .sl-bg { background: rgba(58, 44, 20, 0.7); }
    .ct-tab[aria-selected='true'] .sl-bg::after { background: rgba(255, 208, 112, 0.65); }
    .ct-tab:hover { color: var(--mu-ink); }
    .ct-tab-icon { flex: none; width: calc(20 * var(--px)); height: calc(20 * var(--px)); filter: drop-shadow(0 calc(1 * var(--px)) 0 rgba(0, 0, 0, 0.4)); }
    .ct-tab-n { min-width: calc(18 * var(--px)); padding: 0 calc(5 * var(--px)); border-radius: calc(9 * var(--px)); background: rgba(255, 208, 112, 0.18); color: var(--mu-gold-hi);
      font: 700 calc(12 * var(--px)) / calc(18 * var(--px)) var(--mu-display); text-align: center; }
    .ct-tab-n:empty { display: none; }
    .ct-card .sl-list { max-height: calc(min(330 * var(--px), 48vh)); }
    .ct-card .by-icon { flex: none; width: calc(34 * var(--px)); height: calc(34 * var(--px)); filter: drop-shadow(0 calc(1.5 * var(--px)) 0 rgba(0, 0, 0, 0.4)); }
    .ct-card .sl-name small { display: flex; flex-wrap: wrap; gap: 0 calc(6 * var(--px)); }
    .ct-good { color: #a8d898; }
    .ct-bad { color: #f0b07a; }
    .ct-short { display: none; color: #f0a08a; }
    .ct-item.is-short .ct-short { display: inline; }
    .ct-item.is-short .ct-line { display: none; }
    .ct-item.is-dear { color: var(--mu-ink2); }
    .ct-item.is-dear .by-icon { opacity: 0.55; filter: grayscale(0.6); }
    .ct-item.is-dear .sl-price { color: #e8806a; }
    .ct-item.is-off { color: var(--mu-ink2); }
    .ct-item.is-off .by-icon { opacity: 0.5; filter: grayscale(0.7); }
    .ct-item.is-off .sl-price { color: var(--mu-ink2); }
    .ct-empty { margin: calc(4 * var(--px)) 0; padding: calc(10 * var(--px)) calc(12 * var(--px)); border-radius: calc(4 * var(--px)); background: rgba(255, 208, 112, 0.08);
      color: var(--mu-sand); font-size: calc(13.5 * var(--px)); line-height: 1.4; text-align: center; }
    .ct-empty[hidden] { display: none; }
    .ct-item.is-got { animation: ct-got 0.45s var(--mu-ease); }
    @keyframes ct-got { 40% { transform: translateX(calc(-2 * var(--px))) scale(1.02); } }
    .ct-foot-more { margin-left: auto; display: flex; align-items: center; gap: calc(10 * var(--px)); color: var(--mu-ink2); font-size: calc(12.5 * var(--px)); }
    .ct-foot-more span { display: flex; align-items: center; gap: calc(3 * var(--px)); }
    .ct-foot-more .ct-mini { width: calc(20 * var(--px)); height: calc(20 * var(--px)); filter: drop-shadow(0 calc(1.5 * var(--px)) 0 rgba(0, 0, 0, 0.4)); }
    :lang(km) .ct-tab { font-size: calc(15 * var(--px)); }
    :lang(km) .ct-empty { font-size: calc(14 * var(--px)); }
    .mu-calm ~ .rh .ct-item.is-got { animation: none !important; }
    @media (max-width: 639px) { .ct-card .sl-list { max-height: 34vh; } .ct-tab { min-height: 44px; } }
    @media (max-height: 500px) { .ct-card .sl-list { max-height: none; } }`;
  document.head.append(s);
}

export function createCattleCard(d: CattleCardDeps): CattleCard {
  injectSellStyle();
  injectStyle();
  const el = document.createElement('section');
  el.className = 'sl-card ct-card mu-frame mu-md';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-labelledby', 'ct-title');
  const tabIcon: Record<CattleTab, CattleArt> = { buy: 'calf', sell: 'purse', straw: 'straw' };
  el.innerHTML = `<span class="mu-bg"></span>
    <header class="sl-head">${cattleIcon('grown', 'sl-head-icon')}<h2 id="ct-title"></h2><button type="button" class="sl-x">${CLOSE_X}</button></header>
    <p class="sl-ask" aria-live="polite"></p>
    <div class="ct-tabs" role="tablist">${TABS.map(
      (tb) => `<button type="button" class="ct-tab" role="tab" data-tab="${tb}" id="ct-tab-${tb}" aria-controls="ct-list"><span class="sl-bg"></span>${cattleIcon(tabIcon[tb], 'ct-tab-icon')}<span class="ct-tab-t"></span><b class="ct-tab-n"></b></button>`,
    ).join('')}</div>
    <div class="sl-list" id="ct-list" role="tabpanel"></div>
    <p class="ct-empty" hidden></p>
    <footer class="sl-foot">${RIEL_ICON}<span class="sl-purse-label"></span><b class="sl-riel-foot"></b><span class="ct-foot-more"><span class="ct-foot-herd">${cattleIcon('grown', 'ct-mini')}<span></span></span><span class="ct-foot-straw">${cattleIcon('straw', 'ct-mini')}<span></span></span></span></footer>`;
  d.layer.append(el);
  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const title = q('#ct-title');
  const ask = q('.sl-ask');
  const list = q('.sl-list');
  const empty = q('.ct-empty');
  const xBtn = q<HTMLButtonElement>('.sl-x');
  const rielEl = q('.sl-riel-foot');
  const tabBtns = [...el.querySelectorAll<HTMLButtonElement>('.ct-tab')];
  let open = false;
  let tab: CattleTab = 'buy';
  let rows: HTMLButtonElement[] = [];
  let data: CattleRow[] = [];
  let ring = 0;
  let isBusy = false;
  let words: WordKey = 'cattleHi';
  let wordVars: Record<string, string> = {};
  let shownRiel = 0;
  let shortI = -1;
  let shortTimer = 0;
  let padClose: (() => void) | null = null;
  let made = '';

  /** A row's price (riel) and whether it can be taken now (and why not: 'dear', 'off'). */
  const priceOf = (r: CattleRow): number => (r.kind === 'calf' ? PRICE.calf : r.kind === 'young' ? PRICE.young : r.kind === 'straw' ? PRICE.straw * r.n : value(r.cow));
  const offOf = (r: CattleRow): 'dear' | 'off' | null => {
    if (r.kind === 'cow') return null;
    if (r.kind === 'straw' && CATTLE.straw >= STRAW_MAX) return 'off';
    if ((r.kind === 'calf' || r.kind === 'young') && !CATTLE.room) return 'off';
    return priceOf(r) > shownRiel ? 'dear' : null;
  };

  function rowsOf(tb: CattleTab): CattleRow[] {
    if (tb === 'buy') return [{ kind: 'calf' }, { kind: 'young' }];
    if (tb === 'sell') return CATTLE.herd.map((cow) => ({ kind: 'cow', cow }) as CattleRow);
    return STRAW_ROWS.map((n) => ({ kind: 'straw', n }) as CattleRow);
  }

  function lineOf(r: CattleRow): string {
    if (r.kind === 'calf' || r.kind === 'young') {
      if (!CATTLE.room) return `<span class="ct-bad">${esc(t('cattleNoRoom', { n: num(HERD_MAX) }))}</span>`;
      const g = BOUGHT_GROW[r.kind];
      return esc(t('cattleCalfLine', { kg: num(Math.round(wellFed(g))), d: num(Math.round(GROWN_AT - g)) }));
    }
    if (r.kind === 'straw') {
      if (CATTLE.straw >= STRAW_MAX) return `<span class="ct-bad">${esc(t('cattleStrawFull'))}</span>`;
      return esc(t('cattleStrawLine', { n: num(CATTLE.straw) }));
    }
    const c = r.cow;
    const thin = condOf(c) < THIN;
    const state = thin ? t('cattleStateThin') : hungry(c) ? t('cattleStateHungry') : t('cattleStateFed');
    const cls = thin || hungry(c) ? 'ct-bad' : 'ct-good';
    const ride = ageOf(c) === 'grown' ? ` · ${esc(t('cattleRideable'))}` : '';
    return `${esc(t('cattleKg', { kg: num(Math.round(c.weight)) }))} · <span class="${cls}">${esc(state)}</span>${ride}`;
  }

  function nameOf(r: CattleRow): string {
    if (r.kind === 'calf') return t('cattleCalf');
    if (r.kind === 'young') return t('cattleYoung');
    if (r.kind === 'straw') return r.n === 1 ? t('cattleStraw1') : t('cattleStrawN', { n: num(r.n) });
    return t(AGE_WORD[ageOf(r.cow)]);
  }

  function artOf(r: CattleRow): CattleArt {
    if (r.kind === 'calf' || r.kind === 'young') return r.kind;
    if (r.kind === 'straw') return 'straw';
    return cowArt(r.cow);
  }

  const ringLen = () => rows.length;

  function fillList(): boolean {
    data = rowsOf(tab);
    const key = `${tab}|${data.map((r) => `${nameOf(r)}:${priceOf(r)}:${offOf(r) ?? ''}:${r.kind === 'cow' ? `${Math.round(r.cow.weight)}${hungry(r.cow) ? 'h' : ''}` : ''}`).join(',')}|${CATTLE.straw}|${CATTLE.herd.length}|${num(1)}|${shortI}`;
    if (key === made) return false;
    made = key;
    list.innerHTML = data
      .map((r, i) => {
        const digit = i < 9 ? `<kbd>${i + 1}</kbd>` : '<kbd hidden></kbd>';
        const off = offOf(r);
        const cls = `sl-item ct-item${shortI === i ? ' is-short' : ''}${off === 'dear' ? ' is-dear' : off === 'off' ? ' is-off' : ''}`;
        return `<button type="button" class="${cls}" data-i="${i}" role="listitem"><span class="sl-bg"></span>${digit}${PAD_X}${cattleIcon(artOf(r))}<span class="sl-name">${esc(nameOf(r))}<small><span class="ct-line">${lineOf(r)}</span><span class="ct-short">${esc(t('cattleShort'))}</span></small></span><span class="sl-price">${riel(priceOf(r))}</span></button>`;
      })
      .join('');
    rows = [...list.querySelectorAll<HTMLButtonElement>('.ct-item')];
    rows.forEach((b, i) => b.setAttribute('aria-label', `${nameOf(data[i])}, ${riel(priceOf(data[i]))}${offOf(data[i]) === 'dear' ? ` (${t('cattleShort')})` : ''}`));
    if (ring >= ringLen()) ring = Math.max(0, ringLen() - 1);
    return true;
  }

  function fill(): void {
    title.textContent = t('cattleCardName');
    xBtn.setAttribute('aria-label', t('byClose'));
    xBtn.title = `${t('byClose')} (Esc)`;
    q('.sl-purse-label').textContent = t('byPurse');
    rielEl.textContent = riel(shownRiel);
    ask.textContent = `“${t(words, wordVars)}”`;
    const tabWord: Record<CattleTab, WordKey> = { buy: 'cattleTabBuy', sell: 'cattleTabSell', straw: 'cattleTabStraw' };
    tabBtns.forEach((b) => {
      const tb = b.dataset.tab as CattleTab;
      const on = tb === tab;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      b.querySelector('.ct-tab-t')!.textContent = t(tabWord[tb]);
      b.querySelector('.ct-tab-n')!.textContent = tb === 'sell' && CATTLE.herd.length ? num(CATTLE.herd.length) : '';
    });
    empty.hidden = !(tab === 'sell' && !rows.length);
    empty.textContent = t('cattleSellNone');
    rows.forEach((b) => (b.disabled = isBusy));
    q('.ct-foot-herd > span').textContent = t('cattleHerd', { n: num(CATTLE.herd.length), max: num(HERD_MAX) });
    q('.ct-foot-straw > span').textContent = t('cattleStock', { n: num(CATTLE.straw) });
    light();
  }

  function light(): void {
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
    rows[ring]?.scrollIntoView({ block: 'nearest' });
  }

  function setTab(to: CattleTab, sound = true): void {
    if (to === tab && made) return;
    tab = to;
    ring = 0;
    made = '';
    shortI = -1;
    fillList();
    fill();
    list.scrollTop = 0;
    if (sound) d.sound('select');
    d.onTab(tab);
  }
  const stepTab = (k: number) => setTab(TABS[(TABS.indexOf(tab) + k + TABS.length) % TABS.length]);

  function take(i: number): void {
    if (!open || isBusy) return;
    const r = data[i];
    if (!r) return;
    d.sound('select');
    d.onTake(r);
  }

  list.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.ct-item');
    if (!b) return;
    b.blur();
    const i = Number(b.dataset.i);
    setRing(i, false);
    take(i);
  });
  list.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.ct-item');
    if (b && !b.disabled) setRing(Number(b.dataset.i));
  });
  for (const b of tabBtns)
    b.addEventListener('click', () => {
      b.blur();
      setTab(b.dataset.tab as CattleTab);
    });
  xBtn.addEventListener('click', () => {
    xBtn.blur();
    d.onClose();
  });
  addEventListener(
    'pointerdown',
    (e) => {
      if (!open || isBusy || e.pointerType !== 'touch' || el.contains(e.target as Node)) return;
      d.onClose();
    },
    true,
  );
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
      else if (e.code === 'ArrowRight' || (e.code === 'Tab' && !e.shiftKey)) {
        if (!e.repeat) stepTab(1);
      } else if (e.code === 'ArrowLeft' || e.code === 'Tab') {
        if (!e.repeat) stepTab(-1);
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
      shortI = -1;
      tab = to;
      ring = 0;
      made = '';
      open = true;
      fillList();
      fill();
      list.scrollTop = 0;
      ask.classList.remove('is-said');
      el.classList.add('is-on');
      document.body.classList.add('roam-sell');
      padClose ??= pad.openLayer(el, {
        first: () => rows[ring] ?? tabBtns[0],
        back: () => d.onClose(),
        tabs: () => stepTab(1),
      });
      d.sound('open');
    },
    setTab,
    say(key, vars = {}) {
      words = key;
      wordVars = vars;
      fill();
      ask.classList.remove('is-said');
      void ask.offsetWidth;
      ask.classList.add('is-said');
    },
    refill() {
      if (!open) return;
      const was = ring;
      if (fillList()) rows[was]?.classList.add('is-got');
      fill();
    },
    purse(n, up) {
      shownRiel = n;
      rielEl.textContent = riel(n);
      rielEl.classList.toggle('is-up', up);
      if (open && fillList()) fill();
    },
    short(i) {
      shortI = i;
      made = '';
      fillList();
      fill();
      clearTimeout(shortTimer);
      shortTimer = window.setTimeout(() => {
        shortI = -1;
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
