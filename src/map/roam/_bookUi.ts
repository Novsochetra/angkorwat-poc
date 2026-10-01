import { albumOf } from '../../game/Photos';
import { markFocus } from '../pad/nav';
import { pad } from '../pad/pad';
import { lang, num, onLang, t, type WordKey } from '../ui/lang';
import type { SubjectKind } from '../types';
import type { Journal } from './_book';
import { BOOK_GROUPS, GROUP_NAME, KHMER_MONTHS, PASSPORT_GROUPS, SPECIES, SPECIES_BY_KIND, STAMPS, type BookGroup, type PassportGroup, type Species, type StampDef } from './_bookData';
import { fishPlate } from './_fishPlate';
import { offerName, passportName } from './_namePassport';
import { inkFilters, lotusSvg, stampSvg } from './_stamps';

/** The album's sections. */
export type AlbumTab = 'photos' | 'book' | 'passport';
const TABS: readonly AlbumTab[] = ['photos', 'book', 'passport'];

/** The passport's section headings (ui/lang.ts). */
const PASSPORT_HEAD: Record<PassportGroup, WordKey> = { temples: 'bkTemples', jungle: 'bkSites', villages: 'jnVillages', moments: 'equiMoments' };

export interface BookUi {
  /** Show a section (and, in the book, a page, or scrolled to a chapter; in the passport, to one of its sections: checks, `album=book:plants`, `album=passport:villages`). */
  setTab(tab: AlbumTab, kind?: SubjectKind | BookGroup | PassportGroup): void;
  readonly tab: AlbumTab;
  /** Esc in the album: from a page back to the book, from the book or the passport: close (true: done here). */
  back(): boolean;
}

/**
 * The nature book and the temple passport as sections of the photo album
 * (the game's album, src/game/Photos.ts, on the map: V): tabs in its header
 * — Photos · Nature book · Passport, each with its count — and two more
 * panes next to its photo grid, on the album's paper in its own look.
 * The book: a card per living thing, chapter by chapter (its picture and
 * names once photographed; else where to look), a page with the fact when
 * one is picked. The passport: an ink stamp per temple, jungle place,
 * village and holy place he reached (a section each), with the date and a
 * lotus seal where he prayed; faint rings for the rest. Words: ui/lang.ts
 * (`bk…`, `jn…`) and roam/_bookData.ts.
 */
export function attachBookUi(panel: HTMLElement, journal: Journal, closeAlbum: () => void): BookUi {
  const head = panel.querySelector('header')!;
  const countEl = panel.querySelector<HTMLElement>('.photo-count');
  const nav = el('nav', 'bk-tabs');
  nav.setAttribute('role', 'tablist');
  const tabBtn = new Map<AlbumTab, HTMLButtonElement>();
  for (const id of TABS) {
    const b = el('button', 'bk-tab');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.dataset.tab = id;
    b.append(el('span', 'bk-tab-name'), el('span', 'bk-tab-n'));
    b.addEventListener('click', () => {
      b.blur();
      ui.setTab(id);
    });
    tabBtn.set(id, b);
    nav.append(b);
  }
  // (← / → move between the tabs; used: the game pad's arrow moves no focus of its own, pad/pad.ts)
  nav.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const i = (TABS.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
    ui.setTab(TABS[i]);
    const b = tabBtn.get(TABS[i])!;
    if (pad.active) markFocus(b);
    else b.focus();
    e.preventDefault();
    e.stopPropagation();
  });
  // (with the game pad: L1 and R1 either side of the tabs, and its back button on the close ✕)
  nav.insertAdjacentHTML('afterbegin', '<kbd class="bk-padk" data-pad="l1" aria-hidden="true"></kbd>');
  nav.insertAdjacentHTML('beforeend', '<kbd class="bk-padk" data-pad="r1" aria-hidden="true"></kbd>');
  const closeBtn = panel.querySelector<HTMLElement>('.photo-close');
  if (closeBtn) closeBtn.innerHTML = '<span class="bk-x">✕</span><kbd class="bk-padk" data-pad="east" aria-hidden="true"></kbd>';
  head.insertBefore(nav, countEl ?? head.lastChild);

  const bookPane = el('div', 'bk-pane bk-book');
  const passPane = el('div', 'bk-pane bk-pass');
  bookPane.setAttribute('role', 'tabpanel');
  passPane.setAttribute('role', 'tabpanel');
  panel.append(bookPane, passPane);
  panel.insertAdjacentHTML('beforeend', inkFilters());

  let tab: AlbumTab = 'photos';
  /** The book's page open (null: the cards). */
  let page: SubjectKind | null = null;
  let dirty = true;

  // ── Counts on the tabs ──────────────────────────────────────────────────
  const photoCount = () => Number(countEl?.dataset.n ?? 0);
  function fillTabs(): void {
    nav.setAttribute('aria-label', t('bkTabs'));
    const pages = SPECIES.filter((s) => journal.book[s.kind]).length;
    const stamps = STAMPS.filter((s) => journal.stamps[s.id]).length;
    const label: Record<AlbumTab, [string, string]> = {
      photos: [t('bkPhotos'), num(photoCount())],
      book: [t('bkBook'), `${num(pages)}/${num(SPECIES.length)}`],
      passport: [t('bkPassport'), `${num(stamps)}/${num(STAMPS.length)}`],
    };
    for (const [id, b] of tabBtn) {
      b.querySelector('.bk-tab-name')!.textContent = label[id][0];
      b.querySelector('.bk-tab-n')!.textContent = label[id][1];
      b.setAttribute('aria-selected', String(id === tab));
      b.tabIndex = id === tab ? 0 : -1;
    }
  }
  if (countEl) new MutationObserver(fillTabs).observe(countEl, { childList: true, characterData: true, subtree: true });

  // ── Words ──────────────────────────────────────────────────────────────
  const km = () => lang() === 'km';
  const other = (): 'km' | 'en' => (km() ? 'en' : 'km');
  function dateText(time: number, stamp = false): string {
    const d = new Date(time);
    if (km()) return `${num(d.getDate())} ${KHMER_MONTHS[d.getMonth()]} ${num(d.getFullYear())}`;
    const mon = EN_MONTHS[d.getMonth()];
    return `${d.getDate()} ${stamp ? mon : mon.charAt(0) + mon.slice(1).toLowerCase()} ${d.getFullYear()}`;
  }
  const nearText = (x: number, z: number) => {
    const s = journal.stampNear(x, z, 120);
    // ("near the morning market": a stamp's "The" in the middle of the line)
    return s ? t('bkNear', { name: s.name[lang()].replace(/^The /, 'the ') }) : '';
  };

  // ── The nature book ─────────────────────────────────────────────────────
  function card(s: Species): HTMLElement {
    const rec = journal.book[s.kind];
    const c = el(rec ? 'button' : 'div', `bk-card${rec ? ' is-found' : ''}`);
    c.dataset.kind = s.kind;
    const pic = el('span', 'bk-pic');
    // (a fish he caught: its drawn picture until a photo gives it one)
    const img = rec ? rec.img || fishPlate(s.kind) : '';
    if (img) pic.append(Object.assign(el('img', ''), { src: img, alt: '' }));
    else pic.append(Object.assign(el('span', 'bk-pic-q'), { textContent: rec ? '✓' : '?' }));
    const n1 = Object.assign(el('span', 'bk-n1'), { textContent: s.name[lang()] });
    const n2 = Object.assign(el('span', 'bk-n2'), { textContent: s.name[other()] });
    n2.lang = other();
    c.append(pic, n1, n2);
    if (rec) {
      (c as HTMLButtonElement).type = 'button';
      c.addEventListener('click', () => openPage(s.kind));
    } else {
      c.append(Object.assign(el('span', 'bk-where'), { textContent: t('bkLook', { where: s.where[lang()] }) }));
      padStop(c);
    }
    return c;
  }

  function renderBook(): void {
    bookPane.replaceChildren();
    if (page && journal.book[page]) {
      bookPane.append(pageView(SPECIES_BY_KIND.get(page)!));
      return;
    }
    page = null;
    const done = SPECIES.filter((s) => journal.book[s.kind]).length;
    const intro = el('div', 'bk-intro');
    intro.append(
      Object.assign(el('p', ''), { textContent: t('bkBookHint') }),
      Object.assign(el('span', 'bk-meter'), { innerHTML: `<i style="width:${((done / SPECIES.length) * 100).toFixed(1)}%"></i>` }),
    );
    bookPane.append(intro);
    for (const g of BOOK_GROUPS) {
      const list = SPECIES.filter((s) => s.group === g);
      const sec = el('section', 'bk-group');
      sec.dataset.group = g;
      const h = el('h3', '');
      h.append(GROUP_NAME[g][lang()], Object.assign(el('span', ''), { textContent: `${num(list.filter((s) => journal.book[s.kind]).length)}/${num(list.length)}` }));
      const cards = el('div', 'bk-cards');
      for (const s of list) cards.append(card(s));
      sec.append(h, cards);
      bookPane.append(sec);
    }
  }

  function pageView(s: Species): HTMLElement {
    const rec = journal.book[s.kind]!;
    const art = el('article', 'bk-page');
    const back = Object.assign(el('button', 'bk-back photo-action'), { type: 'button', textContent: `← ${t('bkBack')}` });
    back.addEventListener('click', () => openPage(null));
    const fig = el('figure', 'bk-page-pic');
    const img = rec.img || fishPlate(s.kind);
    if (img) fig.append(Object.assign(el('img', ''), { src: img, alt: s.name[lang()] }));
    else fig.append(Object.assign(el('span', 'bk-pic-q'), { textContent: t('bkNoPicture') }));
    const text = el('div', 'bk-page-text');
    const n2 = Object.assign(el('p', 'bk-page-n2'), { textContent: s.name[other()] });
    n2.lang = other();
    const near = nearText(rec.x, rec.z);
    text.append(
      Object.assign(el('p', 'bk-page-group'), { textContent: GROUP_NAME[s.group][lang()] }),
      Object.assign(el('h3', 'bk-page-n1'), { textContent: s.name[lang()] }),
      n2,
      Object.assign(el('p', 'bk-page-fact'), { textContent: s.fact[lang()] }),
      Object.assign(el('p', 'bk-page-meta'), {
        // (a fish he caught: when first, how many, the biggest; photos too if any)
        textContent: (rec.caught
          ? [t('fiFirstCaught', { date: dateText(rec.t) }) + (near ? ` · ${near}` : ''), t('fiCaughtMeta', { n: num(rec.caught), cm: num(rec.cm ?? 0) }), ...(rec.n ? [t('bkShots', { n: num(rec.n) })] : [])]
          : // (seen through the binoculars, no photo yet: roam/_binoculars.ts)
            [t('bkFirstSeen', { date: dateText(rec.t) }) + (near ? ` · ${near}` : ''), rec.n ? t('bkShots', { n: num(rec.n) }) : t('binoSeen')]
        ).join(' · '),
      }),
    );
    const body = el('div', 'bk-page-body');
    body.append(fig, text);
    art.append(back, body);
    return art;
  }

  function openPage(kind: SubjectKind | null): void {
    page = kind;
    renderBook();
    panel.scrollTop = 0;
  }

  // ── The passport ────────────────────────────────────────────────────────
  function slot(s: StampDef): HTMLElement {
    const rec = journal.stamps[s.id];
    const c = el('div', `bk-slot${rec ? ' is-done' : ''}${s.group === 'temples' ? ' is-temple' : ''}`);
    padStop(c);
    const name = s.name[lang()];
    if (!rec) {
      c.append(el('span', 'bk-ring'), Object.assign(el('span', 'bk-slot-name'), { textContent: name }));
      c.title = `${name} · ${t('bkNotVisited')}`;
      return c;
    }
    c.innerHTML = stampSvg(s, { lines: splitName(name, km()), date: dateText(rec.t, true), km: km() }) + (rec.pray ? lotusSvg(s.id, t('bkLotusLabel'), km()) : '');
    c.title = [name, t('bkVisited', { date: dateText(rec.t) }), ...(rec.pray ? [t('bkPrayedOn', { date: dateText(rec.pray) })] : [])].join(' · ');
    c.setAttribute('aria-label', c.title);
    return c;
  }

  function renderPassport(): void {
    passPane.replaceChildren();
    const intro = el('div', 'bk-intro bk-pass-intro');
    intro.append(Object.assign(el('h3', ''), { textContent: t('bkPassportTitle') }), Object.assign(el('p', ''), { textContent: t('bkPassportHint') }));
    // (the holder's name, in Khmer letters: _namePassport.ts)
    intro.append(passportName());
    passPane.append(intro);
    for (const group of PASSPORT_GROUPS) {
      const list = STAMPS.filter((s) => s.group === group);
      const h = el('h4', 'bk-pass-h');
      h.dataset.group = group;
      h.append(t(PASSPORT_HEAD[group]), Object.assign(el('span', ''), { textContent: `${num(list.filter((s) => journal.stamps[s.id]).length)}/${num(list.length)}` }));
      const grid = el('div', 'bk-stamps');
      for (const s of list) grid.append(slot(s));
      passPane.append(h, grid);
    }
  }

  function render(): void {
    fillTabs();
    if (tab === 'book') renderBook();
    else if (tab === 'passport') renderPassport();
    dirty = tab === 'photos';
  }

  journal.onChange(() => {
    dirty = true;
    if (!panel.closest('[hidden]')) render();
    else fillTabs();
  });
  onLang(() => {
    dirty = true;
    render();
  });

  const ui: BookUi = {
    get tab() {
      return tab;
    },
    setTab(next, kind) {
      const same = next === tab && !dirty && kind === undefined;
      const group = next === 'passport' ? PASSPORT_GROUPS.find((g) => g === kind) : undefined;
      const chapter = next === 'book' ? BOOK_GROUPS.find((g) => g === kind) : undefined;
      tab = next;
      panel.dataset.tab = next;
      if (kind !== undefined && !group) page = journal.book[kind as SubjectKind] ? (kind as SubjectKind) : null;
      if (!same) render();
      else fillTabs();
      // (no name yet: the first time, the passport offers to write it, _namePassport.ts)
      if (next === 'passport') offerName();
      const at = group ?? chapter;
      const head = at ? (group ? passPane : bookPane).querySelector<HTMLElement>(`[data-group="${at}"]`) : null;
      panel.scrollTop = head ? head.offsetTop - 8 : 0;
    },
    back() {
      if (tab === 'photos') return false;
      if (tab === 'book' && page) openPage(null);
      else closeAlbum();
      return true;
    },
  };
  panel.dataset.tab = tab;
  fillTabs();
  padAlbum(panel, {
    tab: () => tab,
    tabs: tabBtn,
    page: () => page,
    book: bookPane,
    passport: passPane,
    setTab: (next) => ui.setTab(next),
    back: () => ui.back(),
  });
  return ui;
}

// ── The game pad (pad/pad.ts) ────────────────────────────────────────────────

/**
 * The album with the game pad: while it is open it is a layer of its own
 * (roaming reads nothing). The stick and the d-pad move between the tabs,
 * the photos, the book's cards and the passport's stamps (the panel scrolls
 * along), ✕ opens what is in focus, ○ goes back (a photo or a page → all
 * of them → shut), L1 / R1 the tab before / after. Where the focus was
 * goes (a photo opened, a page turned, a tab changed), it goes to the
 * photo or card that was open, else the first thing there.
 */
function padAlbum(
  panel: HTMLElement,
  b: {
    tab(): AlbumTab;
    tabs: ReadonlyMap<AlbumTab, HTMLButtonElement>;
    page(): SubjectKind | null;
    book: HTMLElement;
    passport: HTMLElement;
    setTab(tab: AlbumTab): void;
    back(): boolean;
  },
): void {
  injectPadStyle();
  const album = albumOf(panel);
  if (!album) return;
  const box = album.el;
  /** The photo last opened (its place in the grid) and the book's card last opened. */
  let lastThumb = 0;
  let lastCard = '';
  box.addEventListener(
    'click',
    (e) => {
      const at = e.target as HTMLElement;
      const thumb = at.closest('.photo-thumb');
      if (thumb) lastThumb = Math.max(0, [...panel.querySelectorAll('.photo-thumb')].indexOf(thumb));
      const card = at.closest<HTMLElement>('.bk-card.is-found');
      if (card) lastCard = card.dataset.kind ?? '';
    },
    true,
  );
  const shown = (e: Element | null | undefined): HTMLElement | null => (e instanceof HTMLElement && e.checkVisibility() ? e : null);

  /** Where the pad's focus goes in the album now. */
  function first(): HTMLElement | null {
    const tab = b.tab();
    const tabEl = b.tabs.get(tab) ?? null;
    if (tab === 'photos') {
      // (a photo open: "All photos", the way back; else the photo that was open)
      if (album!.photoShown) return shown(panel.querySelector('.photo-view .photo-action:last-child')) ?? tabEl;
      const thumbs = panel.querySelectorAll('.photo-thumb');
      return shown(thumbs[Math.min(lastThumb, thumbs.length - 1)]) ?? tabEl;
    }
    if (tab === 'book') {
      if (b.page()) return shown(b.book.querySelector('.bk-back')) ?? tabEl;
      return shown(lastCard ? b.book.querySelector(`.bk-card[data-kind="${lastCard}"]`) : null) ?? shown(b.book.querySelector('.bk-card')) ?? tabEl;
    }
    return shown(b.passport.querySelector('.bk-slot')) ?? tabEl;
  }

  let close: (() => void) | null = null;
  let later = 0;
  /** What had the focus went: the focus to where it goes now (after the change is drawn). */
  const refocus = () => {
    if (later) return;
    later = requestAnimationFrame(() => {
      later = 0;
      if (!close || !pad.active) return;
      const at = document.activeElement;
      if (at instanceof HTMLElement && at !== box && box.contains(at) && at.checkVisibility()) return;
      const to = first();
      if (to) markFocus(to);
    });
  };
  const watch = new MutationObserver(refocus);
  album.onToggle((open) => {
    if (open) {
      close ??= pad.openLayer(box, {
        first,
        back: () => {
          if (!b.back()) album.back();
        },
        tabs: (dir) => {
          const i = (TABS.indexOf(b.tab()) + dir + TABS.length) % TABS.length;
          b.setTab(TABS[i]);
          const to = first();
          if (to) markFocus(to);
        },
      });
      watch.observe(box, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'data-tab'] });
      padStops(panel);
    } else {
      close?.();
      close = null;
      watch.disconnect();
    }
  });
  // (the book's empty cards and the stamps are stops for the pad only: the keys' Tab stays as it was)
  pad.onChange(() => padStops(panel));
}

/** An empty card or a stamp: a stop for the game pad while it is in use (else none, as for the keys). */
function padStop(c: HTMLElement): void {
  if (pad.active) c.tabIndex = 0;
  else c.removeAttribute('tabindex');
}

function padStops(panel: HTMLElement): void {
  for (const c of panel.querySelectorAll<HTMLElement>('.bk-card:not(.is-found), .bk-slot')) padStop(c);
}

let padStyled = false;
/** The pad's ring on the album's things that have none of their own (only for the pad: the keys' look stays), and its buttons shown. */
function injectPadStyle(): void {
  if (padStyled) return;
  padStyled = true;
  const style = document.createElement('style');
  style.textContent = `
    .photo-album kbd.bk-padk { display: none; }
    body.pad-on .photo-album kbd.bk-padk { display: inline-flex; align-self: center; font-size: 15px; }
    body.pad-on .bk-tabs > .bk-padk { margin: 0 4px 3px; opacity: 0.9; }
    body.pad-on .photo-close .bk-x { display: none; }
    body.pad-on .photo-close { display: inline-flex; align-items: center; }
    .photo-album :is(.photo-thumb, .photo-action, .photo-close, .bk-back, .bk-card:not(.is-found), .bk-slot).pad-focus {
      outline: 3px solid rgba(179, 57, 43, 0.72); outline-offset: 2px; }
    .photo-album .photo-thumb.pad-focus img { transform: scale(1.04); }
    .photo-album .bk-card:not(.is-found).pad-focus { border-color: rgba(179, 57, 43, 0.6); }
    .photo-album .bk-slot.pad-focus { border-radius: 50%; outline-offset: -2px; }`;
  document.head.append(style);
}

/** Months in English (upper case on the stamps). */
const EN_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** A long name in two lines (Latin: at the space nearest the middle; Khmer names are short). */
function splitName(s: string, km: boolean): string[] {
  if (km || s.length <= 16) return [s];
  const mid = s.length / 2;
  let cut = -1;
  for (let i = 0; i < s.length; i++) if (s[i] === ' ' && (cut < 0 || Math.abs(i - mid) < Math.abs(cut - mid))) cut = i;
  return cut < 0 ? [s] : [s.slice(0, cut), s.slice(cut + 1)];
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}
