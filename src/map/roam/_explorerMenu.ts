import type { OutfitName } from '../../character/AngkorExplorer';
import { EXPRESSIONS, type ExpressionName } from '../../character/parts/face';
import { focusFirst, markFocus } from '../pad/nav';
import { pad } from '../pad/pad';
import type { UISound } from '../types';
import { createTabs, type TabDef } from '../ui/_tabs';
import { num, onLang, t, type WordKey } from '../ui/lang';
import { steppedRing, steppedShape } from '../ui/shape';
import { LOOK_TOOLS, MENU_HOOKS, MENU_PAGES, type MenuPage } from './_addons';
import { calendarSvg } from './_calendarIcons';
import { DOG_MENU, DOG_MENU_ICON, DOG_NAME_ICON } from './_dogHook';
import { FACE_NAME } from './photo';

/**
 * The explorer menu (I, or the button with his face on the tool bar): what
 * the viewer's chips offer, for a mouse or a finger. One panel with the
 * settings' tab bar (ui/_tabs.ts, look `.mu-tabs` in map.css) and one page
 * at a time, only as tall as its page:
 *
 * - **Moves** (ចលនា): greet (the sampeah), wave, cheer, look up, peek, sit,
 *   lie down, and "Call the dog" (0) once he has one. Each goes in as its key
 *   (`press`: the same path as the keyboard, tools.ts; Greet and Wave both as
 *   F, saying which: _greet.ts), and the panel shuts so the move (and the sky,
 *   sitting or lying down) shows. On foot only: off it (boat, hang glider,
 *   balloon) they are greyed.
 * - **Look** (រូបរាង): everything he wears and his face, part by part: the
 *   page is the wardrobe's (`MENU_PAGES.look`, _addons.ts, filled by
 *   _wardrobe.ts); the menu holds its tab and its place, puts its `el` in once,
 *   tells it `shown(true / false)`, calls `update()` each step while it shows
 *   and asks it `first()` for the game pad's focus. While it shows, `.rxm`
 *   has `data-page="look"` and the page has all the room the panel has.
 *   Until the wardrobe's page is there, the four looks, the hat and the six
 *   faces stand on it (LOOK_TOOLS, tools.ts), so nothing is lost.
 * - **Bag** (កាបូប): the purse and what he keeps to eat or drink later
 *   (roam/_shopBag.ts, `bag`: a tap and he has it now), the umbrella (8:
 *   roam/_umbrella.ts), the photo album (V: the photos, the nature book, the
 *   passport) and the calendar of events (9: roam/_calendar.ts).
 * - **Me** (ខ្ញុំ): his name in Khmer letters (the name card:
 *   roam/_nameCard.ts), his dog's name (once he has one: roam/_dogCard.ts),
 *   the golden figures he has found ("n / 15": a tap opens their list of clues,
 *   map/treasure) and all the keys (?; with the game pad in use, all its
 *   buttons; not on touch: no keys).
 *
 * It opens on the tab last used (kept for the next visit too; shots start on
 * Moves, `menutab=` picks one). Every tab is in the same place, as wide, its tab
 * bar never moving (only the height follows the page, eased): a side panel on
 * the right under the top row (a mouse, a tablet), so he stays in view on the
 * left (`data-dock="right"`); the right ~45% under the bar (a phone on its
 * side); the lower part of the screen (a phone upright: `data-dock="bottom"`,
 * he is in view above it). It is placed from where the tool bar is measured to
 * be (`mount`, `place`: `data-bar="bottom|right|top"`), not from the screen's
 * size, so it follows the bar wherever it goes. While it is open
 * `body.rxm-open` steps the mini-map and the calendar button aside (where it
 * docks), and on touch the gold count, the purse, the stick and the Use / Jump
 * buttons (a class, not `:has()`: phones without it showed them over the
 * panel); the places' pins where it stands go too (ui.ts `placePins`: they are
 * under its glass). On touch a tap outside shuts it.
 *
 * With the game pad (pad/pad.ts) it is a layer while open: L1 / R1 the tab
 * before or after, the stick or the d-pad move within the page, ✕ presses one,
 * ○ or △ shut it. The keys' letters on its buttons are not the pad's: they go
 * while the pad is in use.
 */
export interface ExplorerMenu {
  /** The panel (`.rxm`; `mount` puts it in the roaming layer, placed from the tool bar). */
  readonly el: HTMLElement;
  readonly open: boolean;
  /** The page it shows (or opens on). */
  readonly tab: MenuTab;
  /** Open or shut it (no argument: the other way round). */
  toggle(on?: boolean): void;
  /** Show a page (shut: it opens on it). */
  select(tab: MenuTab): void;
  /** Put it in the roaming layer, placed from the tool bar's box (tools.ts, once). */
  mount(layer: HTMLElement, bar: HTMLElement): void;
  /** Light what is chosen now, grey the moves off foot, the Look page's own update (only what changed; nothing while it is shut). */
  update(): void;
}

export interface ExplorerMenuDeps {
  /** A move, or a key's job (the album V, the calendar 9, the umbrella 8, the dog 0, the keys ?), as its key (RoamControls.press: read as a key hit on the next step); the greeting's F says how (Greet: a sampeah, Wave). */
  press(code: string, how?: 'sampeah' | 'wave'): void;
  /** On foot: the moves work (the hands are busy in the boat, on the glider, in the balloon). */
  onFoot(): boolean;
  /** It opened or shut (the tool bar lights its button, shuts the key list). */
  onToggle(on: boolean): void;
  /** The Bag page's top: roam/_shopBag.ts's section (the purse, what he keeps to eat and drink). */
  bag?: HTMLElement;
  /** Interface sounds (a tab picked by hand). */
  sound?(s: UISound): void;
}

/** The menu's pages, in the tab bar's order. */
export type MenuTab = 'moves' | 'look' | 'bag' | 'me';
export const MENU_TABS: readonly MenuTab[] = ['moves', 'look', 'bag', 'me'];
const TAB_WORD: Record<MenuTab, WordKey> = { moves: 'rMoves', look: 'rxmLook', bag: 'rxmBag', me: 'rxmMe' };

/** The moves: key code, the key shown, the word (and for the greeting's two, how it greets). */
const MOVES: readonly [code: string, key: string, word: WordKey, how?: 'sampeah' | 'wave'][] = [
  ['KeyF', 'F', 'grGreet', 'sampeah'],
  ['KeyF', '', 'rWave', 'wave'],
  ['KeyC', 'C', 'rCheer'],
  ['KeyU', 'U', 'rLookUp'],
  ['KeyP', 'P', 'rPeek'],
  ['KeyJ', 'J', 'rSit'],
  ['KeyL', 'L', 'rLieDown'],
];

/** The words in lists are in lower case (the key list): a capital for a button or a title. */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The tab last used: this visit's, else the last visit's (shots: Moves, and nothing saved). */
const TAB_KEY = 'angkor-map-menu-tab';
const isShot = typeof location !== 'undefined' && new URLSearchParams(location.search).get('shot') === '1';
let lastTab: MenuTab | null = null;
function startTab(): MenuTab {
  if (lastTab) return lastTab;
  if (isShot) return 'moves';
  try {
    const v = localStorage.getItem(TAB_KEY) as MenuTab | null;
    if (v && MENU_TABS.includes(v)) return v;
  } catch {
    // (no storage: a private window, blocked site data)
  }
  return 'moves';
}
function keepTab(tab: MenuTab): void {
  lastTab = tab;
  if (isShot) return;
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {
    // (no storage: this visit remembers it)
  }
}

export function createExplorerMenu(d: ExplorerMenuDeps): ExplorerMenu {
  injectStyle();
  /** The whole roaming layer's box (nothing to click: the panel in it is placed from the tool bar). */
  const dock = document.createElement('div');
  dock.className = 'rxm-dock';
  const el = document.createElement('div');
  el.className = 'rxm mu-frame mu-sm';
  el.setAttribute('role', 'dialog');
  dock.append(el);
  const start = startTab();
  el.dataset.page = start;
  el.dataset.bar = 'bottom';
  el.dataset.dock = 'right';

  const chip = (act: string, icon: string, word: WordKey, key = '', toggle = false) =>
    `<button type="button" class="rxm-b" ${act}${toggle ? ' aria-pressed="false"' : ''}><span class="rxm-bg"></span>${icon}<span class="rxm-t" data-w="${word}"></span>${key ? `<kbd>${key}</kbd>` : ''}</button>`;
  const page = (id: MenuTab, body: string) =>
    `<div class="rxm-page" id="rxm-page-${id}" role="tabpanel" aria-labelledby="rxm-tab-${id}"${id === start ? '' : ' hidden'}>${body}</div>`;
  el.innerHTML = `<span class="mu-bg"></span>
    <div class="rxm-head"><button type="button" class="rxm-x" data-act="close"><span class="rxm-bg"></span>${CLOSE_ICON}</button></div>
    <div class="rxm-body">
      ${page('moves', `<span class="rxm-note" data-w="rOnFootOnly"></span>
        <div class="rxm-grid">${MOVES.map(([code, key, w, how]) => chip(`data-move="${code}"${how ? ` data-how="${how}"` : ''}`, MOVE_ICONS[how ?? code], w, key)).join('')}${chip('data-act="dog" hidden', DOG_MENU_ICON, 'dogCall', '0')}</div>`)}
      ${page('look', '')}
      ${page('bag', `<div class="rxm-grid">${chip('data-act="umbrella"', UMBRELLA_ICON, 'umbName', '8', true)}${chip('data-act="album"', ALBUM_ICON, 'rAlbum', 'V')}${chip('data-act="calendar"', calendarSvg('rxm-icon'), 'whenButton', '9')}</div>`)}
      ${page('me', `<div class="rxm-grid">${chip('data-act="name"', NAME_ICON, 'nameMenu')}${chip('data-act="dogname" hidden', DOG_NAME_ICON, 'dogNameMenu')}${chip('data-act="gold" hidden', GOLD_ICON, 'rxmGold')}${chip('data-act="keys"', KEYS_ICON, 'rAllKeys', '?')}</div>`)}
    </div>`;
  const body = el.querySelector<HTMLElement>('.rxm-body')!;
  const pages = Object.fromEntries(MENU_TABS.map((id) => [id, el.querySelector<HTMLElement>(`#rxm-page-${id}`)!])) as Record<MenuTab, HTMLElement>;
  // (the bag's own section at the top of its page: its buttons are its own, not `.rxm-b`)
  if (d.bag) pages.bag.prepend(d.bag);
  const tabs = createTabs(
    MENU_TABS.map((id): TabDef<MenuTab> => ({ id, word: TAB_WORD[id], icon: TAB_ICONS[id] })),
    { prefix: 'rxm', label: 'rxmTabs', start, onSelect: showPage },
  );
  el.querySelector('.rxm-head')!.prepend(tabs.bar);
  const closeBtn = el.querySelector<HTMLButtonElement>('.rxm-x')!;
  const own = (s: string) => el.querySelector<HTMLButtonElement>(`.rxm-b[data-act="${s}"]`)!;
  const moves = [...pages.moves.querySelectorAll<HTMLButtonElement>('.rxm-b[data-move]')];
  /** The umbrella (8: roam/_umbrella.ts), lit while it is his choice. */
  const umbrella = own('umbrella');
  /** His dog's: "Call the dog" (as 0) and its name (roam/_dog.ts), shown once he has one. */
  const dogChips = [own('dog'), own('dogname')];
  /** The golden figures he has found (map/treasure: MENU_HOOKS), shown once they are on the map. */
  const gold = own('gold');
  const goldWord = gold.querySelector<HTMLElement>('.rxm-t')!;
  /** All the keys (?): "All buttons" while the game pad is in use (tools.ts lists its buttons then). */
  const keysWord = own('keys').querySelector<HTMLElement>('.rxm-t')!;

  // ── The Look page: the wardrobe's (MENU_PAGES.look), or the old chips until it is there ──
  /** The page that is in it now (null: the chips, or nothing yet). */
  let lookIn: MenuPage | null = null;
  /** The old chips (the looks, the hat, the faces) while the wardrobe's page is not there. */
  let fallback: { looks: HTMLButtonElement[]; faces: HTMLButtonElement[]; hat: HTMLButtonElement } | null = null;
  /** The wardrobe's page in (once), or the old chips (once, until it comes). */
  function fillLook(): void {
    const p = MENU_PAGES.look;
    if (p) {
      if (p === lookIn) return;
      pages.look.replaceChildren(p.el);
      lookIn = p;
      fallback = null;
      return;
    }
    if (fallback) return;
    const head = (word: WordKey, key: string) => `<b class="rxm-h"><span data-w="${word}"></span><kbd>${key}</kbd></b>`;
    pages.look.innerHTML = `<div class="rxm-lookfb">
      <section class="rxm-sec">${head('rOutfit', 'G')}
        <div class="rxm-grid">${LOOK_TOOLS.looks.map(([o, w], i) => chip(`data-look="${i}"`, lookIcon(o), w, '', true)).join('')}${chip('data-act="hat"', HAT_ICON, 'rHat', 'H', true)}</div></section>
      <section class="rxm-sec">${head('rFace', 'X')}
        <div class="rxm-grid">${EXPRESSIONS.map((e, i) => chip(`data-face="${i}"`, FACE_ICONS[e], FACE_NAME[e], '', true)).join('')}</div></section></div>`;
    fallback = {
      looks: [...pages.look.querySelectorAll<HTMLButtonElement>('.rxm-b[data-look]')],
      faces: [...pages.look.querySelectorAll<HTMLButtonElement>('.rxm-b[data-face]')],
      hat: pages.look.querySelector<HTMLButtonElement>('.rxm-b[data-act="hat"]')!,
    };
    fillWords();
  }
  /** My own buttons (the wardrobe's page has its own). */
  const chips = () => [...el.querySelectorAll<HTMLButtonElement>('.rxm-b')].filter((b) => !lookIn || !lookIn.el.contains(b));

  /** The words in the language in use (ui/lang.ts); a button's name says its key. */
  function fillWords(): void {
    el.setAttribute('aria-label', t('rExplorer'));
    keysWord.dataset.w = pad.active ? 'rAllButtons' : 'rAllKeys';
    for (const s of el.querySelectorAll<HTMLElement>('[data-w]')) {
      if (lookIn?.el.contains(s) || s === goldWord) continue;
      s.textContent = cap(t(s.dataset.w as WordKey));
    }
    for (const s of tabs.bar.querySelectorAll<HTMLElement>('[data-t]')) s.textContent = t(s.dataset.t as WordKey);
    tabs.bar.setAttribute('aria-label', t('rxmTabs'));
    fillGold();
    for (const b of chips()) {
      const name = b.querySelector('.rxm-t')!.textContent!;
      const key = b.querySelector('kbd')?.textContent;
      b.title = key ? `${name} (${key})` : name;
    }
    closeBtn.setAttribute('aria-label', t('rxmClose'));
    closeBtn.title = `${t('rxmClose')} (I)`;
  }
  /** "Golden figures 3 / 15" (the count from map/treasure). */
  function fillGold(): void {
    const [found, total] = MENU_HOOKS.goldCount();
    // (the count all on one line: "3 / 15")
    goldWord.textContent = t('rxmGold', { count: `${num(found)}\u00a0/\u00a0${num(total)}` });
    gold.title = goldWord.textContent;
  }
  fillWords();
  onLang(fillWords);
  pad.onChange(fillWords);

  let open = false;
  /** The game pad's layer while it is open (pad/pad.ts). */
  let padClose: (() => void) | null = null;
  /** What the buttons show now (to touch them only when it changes). */
  let shown = '';
  const light = (b: HTMLButtonElement, on: boolean) => {
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
  };

  // ── Where it stands: from the tool bar's box ──
  let layer: HTMLElement | null = null;
  let bar: HTMLElement | null = null;
  /** What it was placed for (the window's size, the interface's scale, touch): placed again when it changes. */
  let placedFor = '';
  const placeKey = () => `${innerWidth}x${innerHeight} ${layer?.style.getPropertyValue('--u') ?? ''} ${document.body.classList.contains('roam-touch')}`;
  /** The panel's room in px (`place`): how tall it may be from its top, for its page's height (`fit`). */
  let maxH = 0;
  /**
   * Where the panel stands, the same for every tab (only its height follows the page): the right side, from under
   * the top row (a mouse: `data-bar="bottom"`, the bar along the bottom; it stops over the bar where they would
   * meet, a narrow window); left of the bar up the right edge (touch, a tablet: `data-bar="right"`); the lower
   * part of a phone held upright (`data-dock="bottom"`); the right ~45% under a bar along the top (a phone on its
   * side: `data-bar="top"`). Worked out from the bar's measured box (whatever moved it there) into CSS values:
   * `--rxm-top`, `--rxm-right`, `--rxm-left`, `--rxm-w`, `--rxm-max`, and the bar's own `--bar-*`.
   */
  function place(): void {
    if (!bar || !open) return;
    const r = bar.getBoundingClientRect();
    // (the bar hidden: where it was)
    if (!r.width || !r.height) return;
    placedFor = placeKey();
    const W = innerWidth;
    const H = innerHeight;
    const u = Number.parseFloat(layer?.style.getPropertyValue('--u') || getComputedStyle(el).getPropertyValue('--u')) || 1;
    const where = r.height > r.width * 1.5 ? 'right' : r.top + r.height / 2 < H / 2 ? 'top' : 'bottom';
    const dock = where === 'right' && W < 600 && H > W ? 'bottom' : 'right';
    let top: number;
    let right: number;
    let left: number | null = null;
    let w: number;
    let foot: number;
    if (where === 'top') {
      right = 8;
      top = r.bottom + 6;
      w = Math.min(440, Math.max(280, W * 0.45), W - 16);
      foot = 8;
    } else if (where === 'right') {
      right = W - r.left + 8;
      foot = 12;
      if (dock === 'bottom') {
        left = 8;
        top = Math.round(H * 0.45);
        w = W - left - right;
      } else {
        top = 72;
        w = Math.min(380, r.left - 20);
      }
    } else {
      right = 16 * u;
      top = 84 * u;
      w = Math.min(370 * u, W - 32);
      foot = 18 * u;
      // (a narrow window: over the bar where the two would meet)
      if (W - right - w < r.right && W - right > r.left) foot = Math.max(foot, H - r.top + 10 * u);
    }
    maxH = Math.max(120, H - top - foot);
    el.dataset.bar = where;
    el.dataset.dock = dock;
    const s = el.style;
    const set = (k: string, v: number) => s.setProperty(k, `${Math.round(v)}px`);
    set('--bar-top', r.top);
    set('--bar-bottom', r.bottom);
    set('--bar-left', r.left);
    set('--rxm-top', top);
    set('--rxm-right', right);
    if (left === null) s.setProperty('--rxm-left', 'auto');
    else set('--rxm-left', left);
    set('--rxm-w', w);
    set('--rxm-max', maxH);
    fit(true);
  }
  /**
   * The body as tall as its page (the Look page: all the room), the change eased while it shows (as the settings'
   * `--mu-page-h`, ui.ts); `snap`: at once (it opens, or the screen changed). The top, the width and the tab bar
   * never move.
   */
  let easeTimer = 0;
  function fit(snap = false): void {
    if (!open) return;
    const id = tabs.current;
    // (the tab bar, the paddings and the gap: what is not the body)
    const chrome = el.getBoundingClientRect().height - body.getBoundingClientRect().height;
    const room = Math.max(0, Math.floor(maxH - chrome));
    const want = id === 'look' ? room : Math.min(room, Math.ceil(pages[id].getBoundingClientRect().height));
    const px = `${want}px`;
    if (body.style.getPropertyValue('--rxm-page-h') === px) return;
    if (snap) body.style.transition = 'none';
    else {
      // (no scrollbar while it eases: map.css's `is-easing` for the settings)
      body.classList.add('is-easing');
      clearTimeout(easeTimer);
      easeTimer = window.setTimeout(() => body.classList.remove('is-easing'), 360);
    }
    body.style.setProperty('--rxm-page-h', px);
    if (snap) {
      void body.offsetHeight;
      body.style.transition = '';
    }
  }
  const replace = () => {
    if (open) place();
  };
  addEventListener('resize', replace);
  visualViewport?.addEventListener('resize', replace);

  /** Where the game pad's focus starts: the page's first button (off foot the moves are greyed: the next one, else its tab). */
  function firstChip(): HTMLElement | null {
    const id = tabs.current;
    if (id === 'look' && lookIn) return lookIn.first?.() ?? focusFirst(pages.look) ?? tabs.button(id);
    return focusFirst(pages[id]) ?? tabs.button(id);
  }
  /** L1 / R1: the tab before or after (round the bar, as its arrow keys), the focus on it (as the settings). */
  function padTab(dir: -1 | 1): void {
    const i = MENU_TABS.indexOf(tabs.current);
    const to = MENU_TABS[(i + dir + MENU_TABS.length) % MENU_TABS.length];
    tabs.select(to, true);
    markFocus(tabs.button(to));
  }

  /** The Look page came into view, or went: the wardrobe's page is told (its camera turns to his front, or back). */
  function lookShown(on: boolean): void {
    document.body.classList.toggle('rxm-look', on);
    try {
      lookIn?.shown(on);
    } catch (e) {
      console.error('[roam] the Look page failed:', e);
    }
  }

  /**
   * A tab was picked (_tabs.ts: a click, ← → on the bar, L1 / R1, or `select`): its page shows and the last one
   * goes; by hand (`smooth`) it eases in from the side its tab lies on, with a sound.
   */
  function showPage(id: MenuTab, prev: MenuTab, smooth: boolean): void {
    keepTab(id);
    if (id === 'look') fillLook();
    for (const k of MENU_TABS) pages[k].hidden = k !== id;
    el.dataset.page = id;
    if (!open) return;
    if (prev === 'look') lookShown(false);
    // (the same place for every page: only the height follows, eased by hand, at once by the code)
    if (placeKey() !== placedFor) place();
    fit(!smooth);
    body.scrollTop = 0;
    pages.look.scrollTop = 0;
    const p = pages[id];
    p.classList.remove('is-in');
    if (smooth) {
      p.style.setProperty('--dir', MENU_TABS.indexOf(id) > MENU_TABS.indexOf(prev) ? '1' : '-1');
      // (a reflow, so the animation starts again)
      void p.offsetWidth;
      p.classList.add('is-in');
      d.sound?.('toggle');
    }
    if (id === 'look') lookShown(true);
    shown = '';
    api.update();
  }

  const api: ExplorerMenu = {
    el,
    get open() {
      return open;
    },
    get tab() {
      return tabs.current;
    },
    toggle(on = !open) {
      if (on === open) return;
      open = on;
      el.classList.toggle('is-on', on);
      document.body.classList.toggle('rxm-open', on);
      shown = '';
      if (on) {
        fillLook();
        place();
        body.scrollTop = 0;
      }
      if (tabs.current === 'look') lookShown(on);
      api.update();
      if (on) {
        const shut = () => api.toggle(false);
        padClose = pad.openLayer(el, { first: firstChip, back: shut, tabs: padTab, buttons: { north: shut } });
      } else {
        padClose?.();
        padClose = null;
        // (the pad's focus leaves it, so Space is the jump again)
        if (document.activeElement instanceof HTMLElement && el.contains(document.activeElement)) document.activeElement.blur();
      }
      d.onToggle(on);
    },
    select(tab) {
      if (MENU_TABS.includes(tab)) tabs.select(tab);
    },
    mount(into, toolBar) {
      layer = into;
      bar = toolBar;
      // (under the messages, "Face: happy", so they show over it)
      const toast = into.querySelector(':scope > .rh-toast');
      if (toast) toast.before(dock);
      else into.append(dock);
      // (the bar grows a slot while he carries something to eat: placed again)
      if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(replace).observe(toolBar);
        // (a page grew or shrank: the bag filled, the dog's buttons came, another language: the height follows)
        const ro = new ResizeObserver(() => fit());
        for (const id of MENU_TABS) ro.observe(pages[id]);
      }
    },
    update() {
      if (!open) return;
      if (placeKey() !== placedFor) place();
      // (the wardrobe's page came after the chips: in it goes)
      if (MENU_PAGES.look && MENU_PAGES.look !== lookIn) {
        fillLook();
        if (tabs.current === 'look') lookShown(true);
      }
      if (tabs.current === 'look')
        try {
          lookIn?.update?.();
        } catch (e) {
          console.error('[roam] the Look page failed:', e);
        }
      const foot = d.onFoot();
      const [found, total] = MENU_HOOKS.goldCount();
      const now = `${foot} ${MENU_HOOKS.umbrellaUp()} ${DOG_MENU.adopted()} ${found}/${total} ${fallback ? `${LOOK_TOOLS.look()} ${LOOK_TOOLS.hat()} ${LOOK_TOOLS.face()}` : '-'}`;
      if (now === shown) return;
      shown = now;
      el.classList.toggle('is-busy', !foot);
      for (const b of moves) b.disabled = !foot;
      light(umbrella, MENU_HOOKS.umbrellaUp());
      for (const b of dogChips) b.hidden = !DOG_MENU.adopted();
      gold.hidden = total <= 0;
      fillGold();
      if (fallback) {
        for (const b of fallback.looks) light(b, Number(b.dataset.look) === LOOK_TOOLS.look());
        for (const b of fallback.faces) light(b, Number(b.dataset.face) === LOOK_TOOLS.face());
        light(fallback.hat, LOOK_TOOLS.hat());
      }
    },
  };

  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.rxm-b, .rxm-x');
    // (the wardrobe's page answers its own buttons)
    if (!b || b.disabled || lookIn?.el.contains(b)) return;
    // (let go of the focus: Space is the jump and the shutter; the game pad's stays, it goes on from there)
    if (!pad.active) b.blur();
    const { move, look, face, how, act } = b.dataset;
    if (move) {
      d.press(move, how === 'sampeah' || how === 'wave' ? how : undefined);
      // (the panel goes, so the move shows: and the sky, sitting or lying down)
      return api.toggle(false);
    }
    if (look) LOOK_TOOLS.setLook(Number(look));
    else if (face) LOOK_TOOLS.setFace(Number(face));
    else if (act === 'hat') LOOK_TOOLS.setHat(!LOOK_TOOLS.hat());
    // (as 8: the umbrella opens or folds, roam/_umbrella.ts; the panel stays, as for the hat)
    else if (act === 'umbrella') d.press('Digit8');
    else if (act === 'close') return api.toggle(false);
    else if (act === 'album' || act === 'calendar' || act === 'dog' || act === 'keys') {
      // (as V: the album opens · 9: the calendar of events · 0: his dog comes to him · ?: the list of keys, or of the
      // pad's buttons; this shuts so it shows)
      d.press({ album: 'KeyV', calendar: 'Digit9', dog: 'Digit0', keys: 'Slash' }[act]);
      return api.toggle(false);
    } else if (act === 'name' || act === 'dogname' || act === 'gold') {
      // (his name in Khmer letters: the name card · his dog's name: its card · the golden figures' clues; this shuts under it)
      api.toggle(false);
      return act === 'name' ? MENU_HOOKS.openNameCard() : act === 'dogname' ? DOG_MENU.rename() : MENU_HOOKS.openGoldList();
    } else return;
    shown = '';
    api.update();
  });
  // Touch: a tap outside shuts it (the bar's button toggles it itself).
  addEventListener(
    'pointerdown',
    (e) => {
      if (!open || (e.pointerType !== 'touch' && !document.body.classList.contains('roam-touch'))) return;
      const at = e.target as Element | null;
      if (at && (el.contains(at) || at.closest('.rtb-me'))) return;
      api.toggle(false);
    },
    true,
  );
  return api;
}

// ── Icons ──────────────────────────────────────────────────────────────────

/** 16 × 16 pixel art, like the tool bar's (the figure in currentColor: gold when lit). */
const px = (body: string, cls = 'rxm-icon') => `<svg class="${cls}" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges">${body}</svg>`;
const GOLD = '#ffe07c';

const MOVE_ICONS: Record<string, string> = {
  // (the sampeah: elbows out, the palms together up the middle of his chest, gold)
  sampeah: px(`<path fill="currentColor" d="M7 1h3v3H7zM7 5h3v5H7zM7 10h1v6H7zM9 10h1v6H9zM6 5h1v1H6zM5 6h1v2H5zM5 8h2v1H5zM10 5h1v1h-1zM11 6h1v2h-1zM10 8h2v1h-2z"/>
    <path fill="${GOLD}" d="M8 4h1v5H8z"/><path fill="${GOLD}" opacity="0.55" d="M4 2h1v1H4zM12 2h1v1h-1z"/>`),
  // (one arm up, waving)
  wave: px(`<path fill="currentColor" d="M7 1h3v3H7zM7 5h3v5H7zM7 10h1v6H7zM9 10h1v6H9zM5 5h2v1H5zM5 6h1v4H5zM10 5h2v1h-2zM12 1h1v5h-1z"/>
    <path fill="${GOLD}" d="M14 1h2v1h-2zM14 4h2v1h-2z"/>`),
  // (both arms up, a spark or two)
  KeyC: px(`<path fill="currentColor" d="M7 2h3v3H7zM7 6h3v5H7zM7 11h1v5H7zM9 11h1v5H9zM6 6h1v1H6zM5 5h1v1H5zM4 4h1v1H4zM3 2h1v2H3zM10 6h1v1h-1zM11 5h1v1h-1zM12 4h1v1h-1zM13 2h1v2h-1z"/>
    <path fill="${GOLD}" d="M1 0h1v1H1zM15 0h1v1h-1zM8 0h1v1H8z"/>`),
  // (a star up above, his eyes on it)
  KeyU: px(`<path fill="currentColor" d="M6 3h3v3H6zM6 7h3v5H6zM6 12h1v4H6zM8 12h1v4H8zM4 7h2v1H4zM4 8h1v4H4zM9 7h2v1H9zM10 8h1v4h-1z"/>
    <path fill="${GOLD}" d="M13 0h1v1h-1zM12 1h3v1h-3zM13 2h1v1h-1z"/><path fill="${GOLD}" opacity="0.55" d="M10 3h1v1h-1z"/>`),
  // (his head out from behind a wall)
  KeyP: px(`<path fill="currentColor" opacity="0.4" d="M0 0h7v16H0z"/><path fill="#0d1927" opacity="0.35" d="M0 4h7v1H0zM0 9h7v1H0zM0 14h7v1H0zM3 0h1v4H3zM5 5h1v4H5zM2 10h1v4H2z"/>
    <path fill="currentColor" d="M7 4h3v3H7zM7 8h1v6H7zM6 9h1v2H6z"/><path fill="#0d1927" d="M9 5h1v1H9z"/>`),
  // (on a stone)
  KeyJ: px(`<path fill="currentColor" opacity="0.4" d="M2 12h7v4H2z"/><path fill="currentColor" d="M3 2h3v3H3zM3 6h3v4H3zM3 10h8v2H3zM10 12h2v4h-2zM6 7h2v1H6zM7 8h1v2H7z"/>`),
  // (on his back, a star over him)
  KeyL: px(`<path fill="currentColor" opacity="0.4" d="M0 14h16v1H0z"/><path fill="currentColor" d="M1 9h3v3H1zM4 10h6v3H4zM10 11h5v2h-5z"/>
    <path fill="${GOLD}" d="M9 2h1v1H9zM8 3h3v1H8zM9 4h1v1H9z"/><path fill="${GOLD}" opacity="0.55" d="M4 4h1v1H4zM13 1h1v1h-1z"/>`),
};

/** The tabs' icons (all in currentColor: gold on the tab in use): a figure waving, his shirt, his bag, his head and shoulders. */
const TAB_ICONS: Record<MenuTab, string> = {
  moves: px(`<path fill="currentColor" d="M7 1h3v3H7zM7 5h3v5H7zM7 10h1v6H7zM9 10h1v6H9zM5 5h2v1H5zM5 6h1v4H5zM10 5h2v1h-2zM12 1h1v5h-1z"/>
    <path fill="currentColor" opacity="0.55" d="M14 1h2v1h-2zM14 4h2v1h-2z"/>`, 'mu-icon rxm-ticon'),
  look: px(`<path fill="currentColor" d="M4 2h3v1h2V2h3v1h2v1h1v3h-3v7H4V7H1V4h1V3h2z"/><path fill="#0d1927" opacity="0.45" d="M7 3h2v1H7zM5 9h6v1H5z"/>`, 'mu-icon rxm-ticon'),
  bag: px(`<path fill="currentColor" d="M5 1h6v1h1v4h-1V2H5v4H4V2h1zM2 5h12v1h1v8h-1v1H2v-1H1V6h1z"/><path fill="#0d1927" opacity="0.45" d="M2 9h12v1H2z"/>
    <path fill="#0d1927" d="M7 9h2v2H7z"/>`, 'mu-icon rxm-ticon'),
  me: px(`<path fill="currentColor" d="M6 1h4v1h1v4h-1v1H6V6H5V2h1zM3 9h10v1h1v1h1v4H1v-4h1v-1h1z"/><path fill="#0d1927" opacity="0.45" d="M7 9h2v2H7z"/>`, 'mu-icon rxm-ticon'),
};

/** A look: his shirt with what goes over it (the scarf, the day pack's strap, the big pack's straps; the temple clothes' sash). */
const STRAP = 'M11 3h1v1h-1zM10 4h1v2h-1zM9 6h1v1H9zM8 7h1v2H8zM7 9h1v1H7zM6 10h1v2H6zM5 12h1v1H5z';
const SCARF = '<path fill="#c8453a" d="M6 2h1v1h2V2h1v2H9v1H7V4H6zM9 5h1v2H9z"/>';
const LOOK_OVER: Partial<Record<OutfitName, string>> = {
  explorerGear: `<path fill="#7a5634" d="M5 3h1v8H5zM10 3h1v8h-1zM5 8h6v1H5z"/>${SCARF}`,
  default: `<path fill="#7a5634" d="${STRAP}"/>${SCARF}`,
  withoutScarf: `<path fill="#7a5634" d="${STRAP}"/>`,
  templeOutfit: `<path fill="#e0892f" d="${STRAP}M10 3h1v1h-1zM9 4h1v2H9zM8 6h1v1H8zM7 7h1v2H7zM6 9h1v1H6zM5 10h1v2H5zM4 12h1v1H4z"/>`,
};
/** One of the four looks (G), for a button (class `rxm-icon`: 20 px, a drop shadow). */
export const lookIcon = (o: OutfitName) =>
  px(`<path fill="currentColor" d="M4 2h3v1h2V2h3v1h2v1h1v3h-3v7H4V7H1V4h1V3h2z"/><path fill="#0d1927" opacity="0.4" d="M7 2h2v1H7z"/>${LOOK_OVER[o] ?? ''}`);
/** The photo album (as the tool bar's V: tools.ts). */
const ALBUM_ICON = px(`<path fill="currentColor" opacity="0.55" d="M4 1h11v10H4z"/><path fill="currentColor" d="M1 4h11v11H1z"/><path fill="#0d1927" d="M2 5h9v7H2z"/>
    <path fill="${GOLD}" d="M8 6h2v2H8z"/><path fill="#7fa36a" d="M2 11h2V9h1V8h1v1h1v1h1v1h1v-1h1v1h1v1H2z"/>`);
/** His name: a strip of palm leaf with lines of script, its string through the middle (the name card, _nameCard.ts). */
const NAME_ICON = px(`<path fill="currentColor" d="M1 5h14v1h1v5h-1v1H1v-1H0V6h1z"/>
    <path fill="#0d1927" opacity="0.6" d="M2 7h3v1H2zM5 7h1v1H5zM10 7h4v1h-4zM2 9h2v1H2zM5 9h2v1H5zM10 9h2v1h-2zM13 9h1v1h-1z"/><path fill="#0d1927" d="M8 8h1v1H8z"/>
    <path fill="${GOLD}" d="M8 2h1v3H8zM7 1h1v1H7zM8 12h1v3H8zM9 15h1v1H9z"/>`);
/** A key cap with a question mark (the list of all the keys: ?). */
const KEYS_ICON = px(`<path fill="currentColor" d="M2 1h12v1h1v11h-1v1H2v-1H1V2h1z"/><path fill="#0d1927" d="M3 2h10v10H3z"/>
    <path fill="${GOLD}" d="M7 3h3v1H7zM6 4h1v1H6zM10 4h1v2h-1zM9 6h1v1H9zM8 7h1v2H8zM8 10h1v1H8z"/>`);
/** A golden figure sitting on its plinth, a glint on it (map/treasure: the ones he has found). */
const GOLD_ICON = px(`<path fill="#f7b733" d="M7 1h2v1H7zM6 2h4v3H6zM7 5h2v1H7zM5 6h6v4H5zM4 7h1v3H4zM11 7h1v3h-1zM3 10h10v2H3z"/>
    <path fill="${GOLD}" d="M7 2h1v2H7zM6 6h2v1H6zM5 7h1v2H5zM4 10h4v1H4z"/><path fill="#a8691c" d="M2 12h12v2H2zM9 3h1v1H9zM10 8h1v2h-1z"/>
    <path fill="#fff6d0" d="M13 1h1v1h-1zM12 2h1v1h-1zM14 2h1v1h-1zM13 3h1v1h-1z"/>`);
/** His straw hat with the red band. */
export const HAT_ICON = px(`<path fill="#e2b35c" d="M5 4h6v1h1v3H4V5h1z"/><path fill="#c8453a" d="M4 7h8v1H4z"/><path fill="#f0c874" d="M1 8h14v1h-1v1H2V9H1z"/>`);
/** His umbrella (roam/_umbrella.ts): a deep blue canopy on its ribs, the shaft and its curved handle. */
const UMBRELLA_ICON = px(`<path fill="#3b5c9e" d="M6 2h4v1h2v1h1v1h1v1h1v2H1V6h1V5h1V4h1V3h2z"/><path fill="#5e82c8" d="M6 3h3v1H6zM4 4h2v1H4zM3 5h1v1H3z"/>
    <path fill="#d8dde3" d="M1 8h1v1H1zM5 8h1v1H5zM10 8h1v1h-1zM14 8h1v1h-1zM7 1h1v1H7z"/><path fill="currentColor" d="M7 8h1v5H7zM8 13h1v1H8zM9 14h1v1H9zM10 12h1v2h-1z"/>`);
/** The close button's cross. */
const CLOSE_ICON = px(
  `<path fill="currentColor" d="M3 3h2v1h1v1h1v1h2V5h1V4h1V3h2v2h-1v1h-1v1h-1v2h1v1h1v1h1v2h-2v-1h-1v-1H9v-1H7v1H6v1H5v1H3v-2h1v-1h1V9h1V7H5V6H4V5H3z"/>`,
  'rxm-x-icon',
);

/** The faces: a round face with the eyes, brows and mouth of each. */
const face = (f: string) => px(`<path fill="#dcae8f" d="M3 2h10v1h1v10h-1v1H3v-1H2V3h1z"/><path fill="#3a2a26" d="${f}"/>`);
/** The six faces (X), for a button. */
export const FACE_ICONS: Record<ExpressionName, string> = {
  neutral: face('M5 6h1v2H5zM10 6h1v2h-1zM6 11h4v1H6z'),
  happy: face('M5 6h1v2H5zM10 6h1v2h-1zM5 10h1v1H5zM10 10h1v1h-1zM6 11h4v1H6z'),
  determined: face('M4 4h2v1H4zM6 5h1v1H6zM10 4h2v1h-2zM9 5h1v1H9zM5 6h1v2H5zM10 6h1v2h-1zM6 11h4v1H6z'),
  surprised: face('M4 3h2v1H4zM10 3h2v1h-2zM5 5h1v3H5zM10 5h1v3h-1zM7 9h2v1H7zM6 10h1v2H6zM9 10h1v2H9zM7 12h2v1H7z'),
  curious: face('M4 5h2v1H4zM10 3h2v1h-2zM5 7h1v1H5zM10 5h1v3h-1zM8 11h2v1H8z'),
  focused: face('M4 5h2v1H4zM10 5h2v1h-2zM4 7h2v1H4zM10 7h2v1h-2zM7 11h2v1H7z'),
};

// ── Style ──────────────────────────────────────────────────────────────────

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  // (the chips: the tool bar's stepped button shape and ring, --rtb-shape / --rtb-ring)
  // Where it stands comes from the tool bar's box (`place`): --bar-top, --bar-bottom, --bar-left, --bar-cx (px from the window's top left).
  // No `:has()` and no `:is()` here (phones without them showed the stick and the counters over it): a body class.
  style.textContent = `
    .rxm-dock { position: absolute; inset: 0; pointer-events: none; --rtb-shape: ${steppedShape(6, 3)}; --rtb-ring: ${steppedRing(6, 3, 1.5)}; }
    /* One place for every tab, worked out from the tool bar's box (\`place\`): the right side under the top row (a mouse, a tablet),
       the right ~45% under the bar (a phone on its side), the lower part (a phone upright). Its top, its width and its tab bar
       never move; only its height follows the page (\`fit\`: the body's --rxm-page-h, eased). */
    .rxm-dock > .rxm { position: absolute; display: none; flex-direction: column; gap: calc(8 * var(--px)); box-sizing: border-box;
      top: var(--rxm-top, calc(84 * var(--px))); right: var(--rxm-right, calc(16 * var(--px))); left: var(--rxm-left, auto);
      width: var(--rxm-w, min(calc(370 * var(--px)), calc(100% - 32px))); max-height: var(--rxm-max, calc(100% - 102 * var(--px)));
      padding: calc(10 * var(--px)) calc(12 * var(--px)) calc(12 * var(--px));
      pointer-events: auto; font-size: calc(14 * var(--px)); line-height: 1.2; color: var(--mu-ink2); }
    .rxm-dock > .rxm.is-on { display: flex; }
    /* (the settings' stronger glass: nothing behind it, the world or the places' pins, shows through its chips) */
    .rxm-dock > .rxm > .mu-bg { background: var(--mu-panel-strong); }
    /* (the mode's key help at the bottom left steps aside for it, as for the key list) */
    body.rxm-open .rh .rh-help { opacity: 0; visibility: hidden; transition: opacity 0.2s, visibility 0s 0.2s; }

    /* The tab bar (ui/_tabs.ts, map.css .mu-tabs) and the close button beside it. */
    .rxm-head { flex: none; display: flex; align-items: stretch; gap: calc(6 * var(--px)); }
    .rxm-head > .mu-tabs { flex: 1 1 auto; min-width: 0; margin: 0; }
    .rxm .mu-tab { height: calc(48 * var(--px)); }
    .rxm-x { position: relative; flex: none; display: grid; place-items: center; width: calc(38 * var(--px)); padding: 0; border: 0; background: none;
      cursor: pointer; outline: none; color: var(--mu-ink2); isolation: isolate; transition: color 0.2s; }
    .rxm-x-icon { width: calc(14 * var(--px)); height: calc(14 * var(--px)); }
    .rxm-x:hover, .rxm-x:focus-visible { color: var(--mu-ink); }

    /* The page: one at a time; it scrolls when the room is lower than it. */
    .rxm-body { flex: 0 1 auto; min-height: 0; height: var(--rxm-page-h, auto); overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain;
      scrollbar-width: thin; scrollbar-color: var(--mu-line) transparent; transition: height 0.32s var(--mu-ease); }
    .rxm-body.is-easing { overflow: hidden; }
    .mu-calm ~ .rh .rxm-body { transition: none; }
    .rxm-page { display: grid; gap: calc(8 * var(--px)); align-content: start; min-width: 0; }
    .rxm-page[hidden] { display: none !important; }
    .rxm-page.is-in { animation: rxm-page-in 0.28s var(--mu-ease); }
    @keyframes rxm-page-in { from { opacity: 0; transform: translateX(calc(var(--dir, 1) * 10 * var(--px))); } }
    .mu-calm ~ .rh .rxm-page.is-in { animation: none; }
    .rxm-sec { display: grid; gap: calc(6 * var(--px)); align-content: start; min-width: 0; }
    .rxm-h { display: flex; align-items: center; gap: calc(6 * var(--px)); min-width: 0; font: 700 calc(14 * var(--px)) / 1.2 var(--mu-display); color: var(--mu-gold-hi); letter-spacing: 0.02em; }
    .rxm-h kbd { min-width: calc(17 * var(--px)); height: calc(17 * var(--px)); padding: 0 calc(4 * var(--px)); font-size: calc(10.5 * var(--px)); letter-spacing: 0; }
    .rxm-note { display: none; font-size: calc(13 * var(--px)); color: var(--mu-dim); }
    .rxm.is-busy .rxm-note { display: block; }
    .rxm-lookfb { display: grid; gap: calc(12 * var(--px)); align-content: start; }

    /* The chips: two a row (the side panel's width; three would wrap words). */
    .rxm-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: calc(6 * var(--px)); }
    .rxm-b { position: relative; display: flex; align-items: center; gap: calc(8 * var(--px)); min-width: 0; min-height: calc(42 * var(--px)); padding: calc(5 * var(--px)) calc(9 * var(--px));
      border: 0; background: none; cursor: pointer; outline: none; color: var(--mu-ink2); isolation: isolate; text-align: left; font: inherit; line-height: 1.2;
      transition: color 0.2s, transform 0.2s var(--mu-ease), opacity 0.2s; }
    .rxm-b[hidden] { display: none; }
    .rxm-bg { position: absolute; inset: 0; z-index: -1; clip-path: var(--rtb-shape); background: rgba(255, 244, 222, 0.04); transition: background 0.2s; }
    .rxm-bg::after { content: ''; position: absolute; inset: 0; clip-path: var(--rtb-ring); background: rgba(255, 229, 188, 0.1); transition: background 0.2s; }
    .rxm-icon { flex: none; width: calc(20 * var(--px)); height: calc(20 * var(--px)); filter: drop-shadow(0 calc(1 * var(--px)) 0 rgba(0, 0, 0, 0.35)); }
    /* (a long word wraps inside its chip, never under the next) */
    .rxm-t { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
    .rxm-b kbd { flex: none; min-width: calc(18 * var(--px)); height: calc(18 * var(--px)); padding: 0 calc(4 * var(--px)); font-size: calc(11 * var(--px)); }
    .rxm-b:hover, .rxm-b:focus-visible { color: var(--mu-ink); }
    .rxm-b:hover .rxm-bg, .rxm-x:hover .rxm-bg { background: rgba(255, 244, 222, 0.1); }
    .rxm-b:hover .rxm-bg::after, .rxm-x:hover .rxm-bg::after { background: var(--mu-line-hi); }
    .rxm-b:focus-visible .rxm-bg::after { background: rgba(255, 244, 214, 0.95); }
    .rxm-x:focus-visible .rxm-bg::after { background: rgba(255, 244, 214, 0.95); }
    .rxm-b:active, .rxm-x:active { transform: scale(0.96); }
    .rxm-b.is-on { color: var(--mu-gold-hi); }
    .rxm-b.is-on .rxm-bg { background: rgba(58, 44, 20, 0.75); box-shadow: 0 0 calc(10 * var(--px)) rgba(255, 176, 40, 0.5); }
    .rxm-b.is-on .rxm-bg::after { background: var(--mu-gold-hi); }
    .rxm-b:disabled { opacity: 0.35; cursor: default; }
    .rxm-b:disabled .rxm-bg { background: rgba(255, 244, 222, 0.04); }
    .rxm-b:disabled .rxm-bg::after { background: rgba(255, 229, 188, 0.1); }
    /* (Khmer letters look smaller at the same size, and take no letter spacing: map.css) */
    :lang(km) .rxm-dock > .rxm { font-size: calc(15 * var(--px)); line-height: 1.3; }
    :lang(km) .rxm-h { letter-spacing: 0; }
    /* (the game pad in use: the keys' letters are not its buttons) */
    body.pad-on .rxm kbd { display: none; }

    /* The Look page (the wardrobe's, MENU_PAGES.look): all the room the panel has, a column its page fills. */
    .rxm[data-page='look'] .rxm-body { flex: 1 1 auto; display: flex; flex-direction: column; overflow: hidden; }
    .rxm[data-page='look'] #rxm-page-look { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; overflow-x: hidden; overflow-y: auto;
      overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: var(--mu-line) transparent; }
    /* (the mini-map, its captions and the calendar under it are where it docks: they step aside while it is open, every tab) */
    body.rxm-open .mm, body.rxm-open .wh-btn { opacity: 0 !important; visibility: hidden !important; transition: opacity 0.2s, visibility 0s 0.2s !important; }

    /* Touch: two chips a row, big enough for a thumb; no keys. */
    body.roam-touch .rxm-dock > .rxm { padding: 8px 10px 10px; gap: 8px; font-size: 14px; line-height: 1.15; }
    body.roam-touch:lang(km) .rxm-dock > .rxm { font-size: 15px; line-height: 1.25; }
    body.roam-touch .rxm-head { gap: 6px; }
    body.roam-touch .rxm .mu-tab { height: 48px; font-size: 12.5px; }
    body.roam-touch:lang(km) .rxm .mu-tab { font-size: 13.5px; }
    body.roam-touch .rxm-x { width: 44px; }
    body.roam-touch .rxm-x-icon { width: 14px; height: 14px; }
    body.roam-touch .rxm-page, body.roam-touch .rxm-sec { gap: 6px; }
    body.roam-touch .rxm-lookfb { gap: 10px; }
    body.roam-touch .rxm-h { font-size: 15px; }
    body.roam-touch .rxm-note { font-size: 13px; }
    body.roam-touch .rxm-grid { gap: 6px; }
    body.roam-touch .rxm-b { min-height: 44px; gap: 7px; padding: 4px 8px; }
    body.roam-touch .rxm-icon { width: 22px; height: 22px; }
    body.roam-touch .rxm kbd { display: none; }
    body.roam-touch .rxm-b[data-act='keys'] { display: none; }
    /* (the counters and the purse, the stick and the Use / Jump buttons step aside while it is open on touch: the Jump button
       stands where it docks, and a tap outside shuts it; the bag's own line shows the riel) */
    body.roam-touch.rxm-open .rh > .tg-count, body.roam-touch.rxm-open .rh > .by-purse {
      opacity: 0 !important; visibility: hidden !important; transition: opacity 0.2s, visibility 0s 0.2s !important; }
    body.roam-touch.rxm-open .rt.is-on { display: none !important; }
    /* A phone on its side (the bar along the top): a little lower, the chips 40 px. */
    body.roam-touch .rxm-dock > .rxm[data-bar='top'] { padding: 6px 8px 8px; gap: 6px; }
    body.roam-touch .rxm[data-bar='top'] .rxm-b { min-height: 40px; }
    /* (off foot the moves are greyed, no taps to take: lower, so the note and all eight fit the lowest phone) */
    body.roam-touch .rxm[data-bar='top'] .rxm-b[data-move]:disabled { min-height: 34px; }
    body.roam-touch .rxm[data-bar='top'] .rxm-page, body.roam-touch .rxm[data-bar='top'] .rxm-sec { gap: 5px; }
    body.roam-touch .rxm[data-bar='top'] .rxm-grid { gap: 5px; }
    body.roam-touch .rxm[data-bar='top'] .mu-tab { height: 42px; gap: 2px; font-size: 11.5px; }
    body.roam-touch:lang(km) .rxm[data-bar='top'] .mu-tab { font-size: 12.5px; }
    body.roam-touch .rxm[data-bar='top'] .rxm-x { width: 40px; }`;
  document.head.append(style);
}
