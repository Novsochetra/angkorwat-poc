import type { WordKey } from './lang';
import { framed } from './shape';

/**
 * The settings' tab bar (ui.ts; map.css `.mu-tabs`): a row of buttons, an icon
 * over a word, in the choices' dark slot, with one gold thumb behind the tab in
 * use that slides to the next (CSS `--i`: the tab's number, `--n`: how many).
 *
 * It is a `tablist`: the tab in use is the one Tab reaches, and ← → Home End
 * walk along the bar (the page changes with the tab, so a key is enough). The
 * pages are the caller's (ids `<prefix>-page-<id>`, `role="tabpanel"`):
 * `onSelect` says which one to show. The words are `data-t` (ui.ts
 * `fillWords` fills them in the language in use).
 */
export interface TabDef<Id extends string> {
  id: Id;
  /** Its word (lang.ts). */
  word: WordKey;
  /** Its icon (icons.ts). */
  icon: string;
}

export interface TabsSpec<Id extends string> {
  /** Start of the ids: the tabs are `<prefix>-tab-<id>`, the pages they control `<prefix>-page-<id>`. */
  prefix: string;
  /** The bar's name for a screen reader (lang.ts). */
  label: WordKey;
  /** The tab in use at the start (`onSelect` is not called for it). */
  start: Id;
  /** A tab was picked (`smooth`: by a click, a key or the caller's say-so, with motion and sound; else it changes quietly). */
  onSelect(id: Id, prev: Id, smooth: boolean): void;
}

export interface Tabs<Id extends string> {
  /** The bar (a `tablist`): put it above the pages. */
  readonly bar: HTMLElement;
  /** The tab in use. */
  readonly current: Id;
  /** Show a tab. */
  select(id: Id, smooth?: boolean): void;
  /** A tab's button (to give it the focus). */
  button(id: Id): HTMLButtonElement;
}

export function createTabs<Id extends string>(defs: TabDef<Id>[], spec: TabsSpec<Id>): Tabs<Id> {
  const bar = document.createElement('div');
  bar.className = 'mu-tabs';
  bar.setAttribute('role', 'tablist');
  bar.dataset.tAria = spec.label;
  bar.style.setProperty('--n', String(defs.length));
  framed(bar, 'sm');
  // (behind the buttons: the frame's fill and ring, then this)
  const thumb = framed(Object.assign(document.createElement('span'), { className: 'mu-tab-thumb' }), 'xs');
  thumb.setAttribute('aria-hidden', 'true');
  bar.append(thumb);
  const buttons = defs.map((d) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mu-tab';
    b.id = `${spec.prefix}-tab-${d.id}`;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', `${spec.prefix}-page-${d.id}`);
    b.innerHTML = `${d.icon}<span data-t="${d.word}"></span>`;
    bar.append(framed(b, 'xs'));
    return b;
  });

  let current = spec.start;
  const indexOf = (id: Id) => defs.findIndex((d) => d.id === id);
  /** Mark the tab in use (the one Tab reaches) and slide the thumb to it. */
  function mark(id: Id): void {
    const i = indexOf(id);
    buttons.forEach((b, j) => {
      b.setAttribute('aria-selected', String(j === i));
      b.tabIndex = j === i ? 0 : -1;
    });
    bar.style.setProperty('--i', String(i));
  }
  mark(current);

  function select(id: Id, smooth = false): void {
    if (id === current || indexOf(id) < 0) return;
    const prev = current;
    // (the keyboard's focus is on a tab: it goes along, so Tab and the arrows start from the tab in use)
    const focused = buttons.includes(document.activeElement as HTMLButtonElement);
    current = id;
    mark(id);
    if (focused) buttons[indexOf(id)].focus({ preventScroll: true });
    spec.onSelect(id, prev, smooth);
  }

  bar.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('.mu-tab');
    if (b) select(defs[buttons.indexOf(b)].id, true);
  });
  bar.addEventListener('keydown', (e) => {
    const from = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (from < 0 || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const n = buttons.length;
    const to = e.key === 'ArrowRight' ? (from + 1) % n : e.key === 'ArrowLeft' ? (from + n - 1) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (to < 0) return;
    // (these keys are the bar's: not the roaming's steps, nor the cards' arrows)
    e.preventDefault();
    e.stopPropagation();
    select(defs[to].id, true);
  });

  return {
    bar,
    get current() {
      return current;
    },
    select,
    button: (id) => buttons[indexOf(id)],
  };
}
