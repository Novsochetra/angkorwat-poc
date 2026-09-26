import { lang, num, onLang, t } from '../ui/lang';
import type { SubjectKind } from '../types';
import type { Journal } from './_book';
import { BOOK_GROUPS, GROUP_NAME, KHMER_MONTHS, SPECIES, SPECIES_BY_KIND, STAMPS, type Species, type StampDef } from './_bookData';
import { inkFilters, lotusSvg, stampSvg } from './_stamps';

/** The album's sections. */
export type AlbumTab = 'photos' | 'book' | 'passport';
const TABS: readonly AlbumTab[] = ['photos', 'book', 'passport'];

export interface BookUi {
  /** Show a section (and, in the book, a page). */
  setTab(tab: AlbumTab, kind?: SubjectKind): void;
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
 * one is picked. The passport: an ink stamp per temple and jungle place he
 * reached, with the date and a lotus seal where he prayed; faint rings for
 * the rest. Words: ui/lang.ts (`bk…`) and roam/_bookData.ts.
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
  // (← / → move between the tabs)
  nav.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const i = (TABS.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
    ui.setTab(TABS[i]);
    tabBtn.get(TABS[i])!.focus();
    e.stopPropagation();
  });
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
  const photoCount = () => Number(/\d+/.exec(countEl?.textContent ?? '')?.[0] ?? 0);
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
    return s ? t('bkNear', { name: s.name[lang()] }) : '';
  };

  // ── The nature book ─────────────────────────────────────────────────────
  function card(s: Species): HTMLElement {
    const rec = journal.book[s.kind];
    const c = el(rec ? 'button' : 'div', `bk-card${rec ? ' is-found' : ''}`);
    c.dataset.kind = s.kind;
    const pic = el('span', 'bk-pic');
    if (rec?.img) pic.append(Object.assign(el('img', ''), { src: rec.img, alt: '' }));
    else pic.append(Object.assign(el('span', 'bk-pic-q'), { textContent: rec ? '✓' : '?' }));
    const n1 = Object.assign(el('span', 'bk-n1'), { textContent: s.name[lang()] });
    const n2 = Object.assign(el('span', 'bk-n2'), { textContent: s.name[other()] });
    n2.lang = other();
    c.append(pic, n1, n2);
    if (rec) {
      (c as HTMLButtonElement).type = 'button';
      c.addEventListener('click', () => openPage(s.kind));
    } else c.append(Object.assign(el('span', 'bk-where'), { textContent: t('bkLook', { where: s.where[lang()] }) }));
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
    if (rec.img) fig.append(Object.assign(el('img', ''), { src: rec.img, alt: s.name[lang()] }));
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
      Object.assign(el('p', 'bk-page-meta'), { textContent: [t('bkFirstSeen', { date: dateText(rec.t) }) + (near ? ` · ${near}` : ''), t('bkShots', { n: num(rec.n) })].join(' · ') }),
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
    const c = el('div', `bk-slot${rec ? ' is-done' : ''}${s.temple ? ' is-temple' : ''}`);
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
    passPane.append(intro);
    for (const temple of [true, false]) {
      const list = STAMPS.filter((s) => s.temple === temple);
      const h = el('h4', 'bk-pass-h');
      h.append(t(temple ? 'bkTemples' : 'bkSites'), Object.assign(el('span', ''), { textContent: `${num(list.filter((s) => journal.stamps[s.id]).length)}/${num(list.length)}` }));
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
      tab = next;
      panel.dataset.tab = next;
      if (kind !== undefined) page = journal.book[kind] ? kind : null;
      if (!same) render();
      else fillTabs();
      panel.scrollTop = 0;
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
  return ui;
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
