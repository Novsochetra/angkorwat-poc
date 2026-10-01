import { MENU_HOOKS } from './_addons';
import { COMMON_NAMES, khmerSpellings, latinPart, NAME_MAX, playerName, setPlayerName, tidyName } from '../khmerName';
import { clearMark, focusables, moveFocusIn } from '../pad/nav';
import { pad } from '../pad/pad';
import type { UISound } from '../types';
import { ICON } from '../ui/icons';
import { lang, onLang, t } from '../ui/lang';
import { setSteppedVars } from '../ui/shape';

/**
 * The name card ("ឈ្មោះរបស់ខ្ញុំ" / "My name"): the player writes the
 * explorer's name and sees it in Khmer letters as it is typed, big, in
 * Koulen on a palm leaf (the old Khmer manuscripts, សាស្ត្រាស្លឹករឹត).
 *
 * - **Type** in Latin letters (khmerName.ts writes it: Sophia → សូហ្វៀ), or in
 *   Khmer straight away (a Khmer keyboard, and an input method's composing:
 *   nothing is taken from it while it composes). When a name can be written
 *   more than one way the other spellings are chips under the leaf; a click
 *   (or the arrows and Enter) picks one.
 * - **Pick** one of the common Khmer names (Latin spelling under each).
 * - **Save** (Enter, the gold button; the game pad's △) keeps it
 *   (khmerName.ts `setPlayerName`: map/progress.ts); **Esc**, "Not now", the ×
 *   or a click beside the card shuts it; "Remove my name" forgets it.
 *
 * Its keys are its own while it is open (a capture listener, before the
 * roaming keys: Esc shuts this, not the walk); the roaming add-on (_name.ts)
 * keeps the explorer still meanwhile. With a game pad it is a pad layer: the
 * d-pad moves between the chips, the names and a letter board (shown only
 * while the pad is in use: A–Z, space, delete), ✕ presses, ○ shuts, △ saves.
 * On a phone it stands at the top (the keyboard comes up under it) and a tap
 * on the field brings the keyboard; the card itself takes the focus first.
 *
 * Lives beside the roaming interface (`.rh`, its size and time of day), over
 * the album (it opens from the passport too). Made the first time it opens.
 * Shots: `namecard=1` opens it, `namecard=<text>` with that typed,
 * `namealt=<i>` with that spelling picked.
 */

export interface NameCardDeps {
  sound?(s: UISound): void;
  /** Saved (`km`), or removed (null): the add-on says so (a toast, a chime). */
  onSaved?(km: string | null): void;
}

let deps: NameCardDeps = {};
/** The roaming add-on's sounds and toasts (it may open before them: from the album in a check). */
export function setNameCardDeps(d: NameCardDeps): void {
  deps = d;
}

interface Card {
  open(text?: string, from?: 'menu' | 'passport' | 'url'): void;
  close(): void;
  pickAlt(i: number): void;
  readonly isOpen: boolean;
}

let card: Card | null = null;

/** Open the name card (`text`: typed in already; `from`: the passport says what it is for). */
export function openNameCard(text?: string, from: 'menu' | 'passport' | 'url' = 'menu'): void {
  (card ??= makeCard()).open(text, from);
}
// (the explorer menu's "My name" opens it without loading this module: _addons.ts MENU_HOOKS)
MENU_HOOKS.openNameCard = () => openNameCard();

/** Shut it (nothing saved). */
export function closeNameCard(): void {
  card?.close();
}

/** It is open (the explorer waits). */
export const nameCardOpen = (): boolean => !!card?.isOpen;

/** Checks: pick spelling `i` of the ones shown. */
export function pickNameAlt(i: number): void {
  card?.pickAlt(i);
}

const SHOT = typeof location !== 'undefined' && new URLSearchParams(location.search).get('shot') === '1';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function makeCard(): Card {
  injectStyle();
  const wrap = document.createElement('div');
  wrap.className = 'map-ui mu-ask nm';
  if (SHOT) wrap.classList.add('mu-shot');
  setSteppedVars(wrap);
  wrap.innerHTML = `
    <section class="mu-ask-card mu-frame mu-lg nm-card" role="dialog" aria-modal="true" aria-labelledby="nm-title" aria-describedby="nm-sub" aria-hidden="true" tabindex="-1">
      <span class="mu-bg"></span>
      <div class="nm-in">
        <button type="button" class="nm-x" aria-keyshortcuts="Escape">${ICON.close}<kbd data-pad="east">Esc</kbd></button>
        <div class="mu-ask-head nm-head"><span class="nm-icon">${LEAF_ICON}</span><div><h2 id="nm-title"></h2><p id="nm-sub" class="nm-sub"></p></div></div>
        <div class="mu-orn mu-ask-orn" aria-hidden="true"><i></i>${ICON.diamond}<i></i></div>
        <div class="nm-leaf" aria-live="polite"><i class="nm-hole"></i><b class="nm-km" lang="km"></b><i class="nm-hole"></i></div>
        <p class="nm-latin"></p>
        <div class="nm-alts" role="radiogroup"><span class="nm-alts-t"></span><span class="nm-alts-c"></span></div>
        <label class="nm-field mu-frame mu-sm"><span class="mu-bg"></span><input class="nm-input" type="text" maxlength="${NAME_MAX + 8}" autocomplete="off" autocapitalize="words" autocorrect="off" spellcheck="false" enterkeyhint="done" /></label>
        <div class="nm-keys">${LETTERS.map((l) => `<button type="button" class="nm-key" data-key="${l}" tabindex="-1">${l}</button>`).join('')}<button type="button" class="nm-key nm-key-sp" data-key=" " tabindex="-1"></button><button type="button" class="nm-key nm-key-bs" data-key="⌫" tabindex="-1">⌫</button></div>
        <h3 class="nm-h"></h3>
        <div class="nm-names">${COMMON_NAMES.map((n, i) => `<button type="button" class="nm-name" data-i="${i}"><b lang="km">${n.km}</b><small>${n.latin}</small></button>`).join('')}</div>
        <div class="mu-ask-row nm-row">
          <button type="button" class="mu-ask-stay mu-frame mu-sm nm-later" aria-keyshortcuts="Escape"><span class="mu-bg"></span><span class="mu-focus"></span><span class="mu-ask-t"></span><kbd data-pad="east">Esc</kbd></button>
          <button type="button" class="mu-ask-go mu-frame mu-sm nm-save" aria-keyshortcuts="Enter"><span class="mu-bg"></span><span class="mu-glow"></span><span class="mu-focus"></span><span class="mu-ask-t"></span><kbd data-pad="north">Enter</kbd></button>
        </div>
        <button type="button" class="nm-clear"></button>
      </div>
    </section>`;
  const anchor = document.querySelector('.map-ui.rh') ?? document.getElementById('ui');
  if (anchor) anchor.after(wrap);
  else document.body.append(wrap);
  const q = <T extends HTMLElement>(s: string) => wrap.querySelector<T>(s)!;
  const box = q('.nm-card');
  const input = q<HTMLInputElement>('.nm-input');
  const kmEl = q('.nm-km');
  const latinEl = q('.nm-latin');
  const altsEl = q('.nm-alts');
  const altsC = q('.nm-alts-c');
  const save = q<HTMLButtonElement>('.nm-save');
  const later = q<HTMLButtonElement>('.nm-later');
  const xBtn = q<HTMLButtonElement>('.nm-x');
  const clearBtn = q<HTMLButtonElement>('.nm-clear');
  const names = [...wrap.querySelectorAll<HTMLButtonElement>('.nm-name')];

  let isOpen = false;
  let from: 'menu' | 'passport' | 'url' = 'menu';
  /** The spellings of what is typed (the usual first), and the one picked. */
  let spells: string[] = [];
  let chosen = 0;
  /** A common name picked (its own spelling, until the field changes). */
  let picked: (typeof COMMON_NAMES)[number] | null = null;
  let closePad: (() => void) | null = null;
  /** What the leaf shows (to ink it in again only when it changes). */
  let shown = '';

  const km = () => spells[chosen] ?? '';
  const latin = () => (picked ? picked.latin : latinPart(input.value));

  function words(): void {
    const l = lang();
    q('#nm-title').textContent = t('nameTitle');
    q('#nm-sub').textContent = t(from === 'passport' ? 'nameSubPass' : 'nameSub');
    input.placeholder = t('nameType');
    input.setAttribute('aria-label', t('nameField'));
    q('.nm-alts-t').textContent = t('nameOther');
    altsEl.setAttribute('aria-label', t('nameOther'));
    q('.nm-h').textContent = t('namePick');
    later.querySelector('.mu-ask-t')!.textContent = t('nameLater');
    save.querySelector('.mu-ask-t')!.textContent = t('nameSave');
    xBtn.setAttribute('aria-label', t('nameClose'));
    xBtn.title = `${t('nameClose')} (Esc)`;
    clearBtn.textContent = t('nameClear');
    q('.nm-key-sp').textContent = t('nameSpace');
    q('.nm-key-sp').setAttribute('aria-label', t('nameSpace'));
    q('.nm-key-bs').setAttribute('aria-label', t('nameBack'));
    for (const b of names) b.setAttribute('aria-label', `${COMMON_NAMES[Number(b.dataset.i)].km}, ${COMMON_NAMES[Number(b.dataset.i)].latin}`);
    wrap.lang = l;
    show();
  }

  /** The leaf, the Latin line, the other spellings, the buttons: as the field and the pick are now. */
  function show(): void {
    const k = km();
    const empty = !k;
    kmEl.textContent = empty ? t('nameEmpty') : k;
    kmEl.classList.toggle('is-empty', empty);
    // (inked in again when it changes: a quick fade, not on every frame)
    if (!empty && k !== shown && isOpen && !SHOT) {
      kmEl.classList.remove('is-new');
      void kmEl.offsetWidth;
      kmEl.classList.add('is-new');
    }
    shown = k;
    // (long names: the letters shrink to fit the leaf)
    const len = [...k].length;
    kmEl.style.setProperty('--nm-fit', String(len > 18 ? 0.55 : len > 13 ? 0.7 : len > 9 ? 0.85 : 1));
    const lat = latin();
    latinEl.textContent = lat;
    latinEl.classList.toggle('is-empty', !lat);
    // The other spellings (only when there are some).
    altsEl.hidden = spells.length < 2;
    altsC.innerHTML = spells.length < 2 ? '' : spells.map((s, i) => `<button type="button" class="nm-alt" role="radio" aria-checked="${i === chosen}" data-i="${i}" lang="km">${esc(s)}</button>`).join('');
    for (const b of names) {
      const on = picked === COMMON_NAMES[Number(b.dataset.i)];
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    }
    save.disabled = empty;
    clearBtn.hidden = !playerName();
  }

  /** The field changed: its spellings (a common name picked stays only while the field still says it). */
  function typed(): void {
    const v = input.value;
    if (picked && tidyName(v).trim().toLowerCase() !== picked.latin.toLowerCase()) picked = null;
    spells = picked ? uniq([picked.km, ...khmerSpellings(v)]).slice(0, 3) : khmerSpellings(v);
    chosen = 0;
    show();
  }

  function pickName(i: number): void {
    const n = COMMON_NAMES[i];
    if (!n) return;
    picked = n;
    input.value = n.latin;
    spells = uniq([n.km, ...khmerSpellings(n.latin)]).slice(0, 3);
    chosen = 0;
    deps.sound?.('select');
    show();
  }

  function pickAlt(i: number): void {
    if (i < 0 || i >= spells.length || i === chosen) return;
    chosen = i;
    deps.sound?.('tick');
    show();
  }

  /** Keep the name; shut. */
  function keep(): void {
    const k = km();
    if (!k) {
      // (nothing to keep: the field says so)
      q('.nm-field').classList.remove('is-shake');
      void q('.nm-field').offsetWidth;
      q('.nm-field').classList.add('is-shake');
      deps.sound?.('back');
      return;
    }
    setPlayerName({ km: k, latin: latin() });
    shut();
    deps.onSaved?.(k);
  }

  function forget(): void {
    setPlayerName(null);
    input.value = '';
    picked = null;
    typed();
    deps.onSaved?.(null);
    if (!pad.active && !touchy()) input.focus({ preventScroll: true });
  }

  function shut(): void {
    if (!isOpen) return;
    isOpen = false;
    wrap.classList.remove('is-open');
    box.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('nm-on');
    closePad?.();
    closePad = null;
    if (wrap.querySelector('.pad-focus')) clearMark();
    if (document.activeElement instanceof HTMLElement && wrap.contains(document.activeElement)) document.activeElement.blur();
  }

  /** A phone or a tablet: no keyboard to type with until the field is tapped. */
  const touchy = () => document.body.classList.contains('roam-touch') || matchMedia('(pointer: coarse)').matches;

  // ── Mouse and touch ──
  input.addEventListener('input', () => {
    // (an input method composing a letter: its letters come at the end, compositionend)
    if (!(input as HTMLInputElement & { isComposing?: boolean }).isComposing) typed();
  });
  input.addEventListener('compositionend', typed);
  altsC.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.nm-alt');
    if (!b) return;
    pickAlt(Number(b.dataset.i));
    // (back to the field for the keys; the pad's focus stays on the chips, drawn again: the one picked)
    if (!pad.active && !touchy()) input.focus({ preventScroll: true });
    else altsC.querySelector<HTMLElement>(`[data-i="${b.dataset.i}"]`)?.focus({ preventScroll: true });
  });
  for (const b of names)
    b.addEventListener('click', () => {
      pickName(Number(b.dataset.i));
      // (back to the field for the keys; the pad's focus stays where it is)
      if (!pad.active && !touchy()) input.focus({ preventScroll: true });
    });
  q('.nm-keys').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.nm-key');
    if (!b) return;
    const k = b.dataset.key!;
    let v = input.value;
    if (k === '⌫') v = [...v].slice(0, -1).join('');
    else if (v.length < NAME_MAX && !(k === ' ' && (!v || v.endsWith(' ')))) v += v && !v.endsWith(' ') ? k.toLowerCase() : k;
    input.value = v;
    typed();
    deps.sound?.('tick');
  });
  save.addEventListener('click', keep);
  later.addEventListener('click', () => {
    shut();
    deps.sound?.('close');
  });
  xBtn.addEventListener('click', () => {
    shut();
    deps.sound?.('close');
  });
  clearBtn.addEventListener('click', forget);
  // (a click or a tap beside the card shuts it, as Esc)
  wrap.addEventListener('pointerdown', (e) => {
    if (isOpen && e.target === wrap) {
      shut();
      deps.sound?.('close');
    }
  });

  // ── Keys: its own while open (before the roaming keys and the map's) ──
  addEventListener(
    'keydown',
    (e) => {
      if (!isOpen || document.body.classList.contains('reporting')) return;
      // (an input method composing: its keys are its own — Enter there picks the letters, not the name)
      if (e.isComposing || e.keyCode === 229) return;
      const at = document.activeElement;
      const inField = at === input;
      const inCard = at instanceof HTMLElement && wrap.contains(at);
      const k = e.key;
      let used = true;
      if (k === 'Escape') {
        if (!e.repeat) {
          shut();
          deps.sound?.('close');
        }
      } else if (k === 'Enter') {
        // (Enter on a chip or a button presses it, as everywhere; in the field, or with nothing in focus, it keeps the name)
        if (inField || !inCard || at === box) {
          if (!e.repeat) keep();
        } else used = false;
      } else if (k === 'Tab') {
        const all = focusables(box);
        if (all.length) {
          const i = all.indexOf(at as HTMLElement);
          const to = all[(i < 0 ? (e.shiftKey ? -1 : 0) : i + (e.shiftKey ? -1 : 1) + all.length) % all.length];
          to.focus({ preventScroll: false });
        }
      } else if (k.startsWith('Arrow') && !inField) {
        // (the keys' arrows move between the chips; the game pad's, made by the page, move its own focus: pad.ts)
        if (!e.isTrusted) used = false;
        else {
          const dir = k.slice(5).toLowerCase() as 'up' | 'down' | 'left' | 'right';
          const from = inCard && at !== box ? (at as HTMLElement) : null;
          const to = from ? moveFocusIn(box, from, dir) : input;
          if (to) {
            to.focus({ preventScroll: false });
            deps.sound?.('hover');
          }
        }
      } else if (!inField && k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && k !== ' ') {
        // (a letter typed with a chip in focus goes into the field)
        input.focus({ preventScroll: true });
        used = false;
      } else used = inField || k === ' ' ? false : true;
      // (nothing reaches the roaming keys, the mini-map or the map: only the field and the buttons' own)
      e.stopImmediatePropagation();
      if (used) e.preventDefault();
    },
    true,
  );
  onLang(words);
  words();

  return {
    get isOpen() {
      return isOpen;
    },
    open(text, f = 'menu') {
      from = f;
      // (its size and time of day: the roaming interface's)
      const like = document.querySelector<HTMLElement>('.map-ui.rh') ?? document.getElementById('ui');
      if (like) {
        wrap.style.setProperty('--u', like.style.getPropertyValue('--u') || '1');
        wrap.style.setProperty('--mu-n', like.style.getPropertyValue('--mu-n') || '0');
      }
      // What it starts with: the text given, else his name (its Latin spelling, or its Khmer letters).
      const now = playerName();
      picked = null;
      if (text !== undefined) input.value = text.slice(0, NAME_MAX + 8);
      else input.value = now ? now.latin || now.km : '';
      spells = khmerSpellings(input.value);
      if (text === undefined && now) spells = uniq([now.km, ...spells]).slice(0, 3);
      chosen = 0;
      const common = COMMON_NAMES.find((n) => n.km === spells[0] && n.latin.toLowerCase() === input.value.trim().toLowerCase());
      if (common) picked = common;
      words();
      if (isOpen) return;
      isOpen = true;
      shown = km();
      wrap.classList.add('is-open');
      box.setAttribute('aria-hidden', 'false');
      document.body.classList.add('nm-on');
      deps.sound?.('open');
      closePad = pad.openLayer(wrap, {
        // (the pad starts on the letter board's A with nothing typed, else on Save)
        first: () => (input.value ? save : q('.nm-key')),
        back: () => {
          shut();
          deps.sound?.('close');
        },
        buttons: {
          north: () => {
            keep();
            return true;
          },
        },
      });
      // (the pad: its layer puts its ring on the letter board's A, or on Save; a phone: the card, no keyboard yet)
      if (pad.active) (document.activeElement as HTMLElement | null)?.blur();
      else if (touchy() || SHOT) box.focus({ preventScroll: true });
      else {
        input.focus({ preventScroll: true });
        const n = input.value.length;
        input.setSelectionRange(n, n);
      }
    },
    close() {
      shut();
    },
    pickAlt,
  };
}

const uniq = (xs: readonly string[]): string[] => [...new Set(xs.filter(Boolean))];
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** A palm-leaf manuscript (a strip of leaf, its two string holes, lines of script; the string through it), in pixels. */
const LEAF_ICON = `<svg class="nm-leaf-icon" viewBox="0 0 32 16" aria-hidden="true" shape-rendering="crispEdges">
  <path fill="#c47a14" d="M14 0h1v2h-1zM15 1h1v1h-1zM16 2h1v1h-1z"/>
  <path fill="#e7cf98" d="M2 4h28v1h1v6h-1v1H2v-1H1V5h1z"/>
  <path fill="#c9a866" d="M2 11h28v1H2zM1 10h1v1H1zM30 10h1v1h-1z"/>
  <path fill="#7a5634" d="M3 6h2v1H3zM6 6h4v1H6zM11 6h3v1h-3zM18 6h3v1h-3zM22 6h5v1h-5zM3 9h4v1H3zM8 9h2v1H8zM11 9h3v1h-3zM18 9h4v1h-4zM23 9h3v1h-3zM27 9h2v1h-2z"/>
  <path fill="#3a2a18" d="M15 7h2v2h-2z"/>
  <path fill="#c47a14" d="M16 3h1v4h-1zM16 9h1v4h-1zM15 13h1v2h-1zM14 15h1v1h-1z"/>
  <path fill="#ffe07c" d="M29 5h1v1h-1z"/>
</svg>`;

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  // (on map.css's cards that ask, `.mu-ask`: the same glass, gold edge, ornament and buttons)
  style.textContent = `
    .mu-ask.nm { z-index: 66; }
    .nm .mu-ask-card { width: min(calc(560 * var(--px)), 100%); padding: 0; }
    .nm-in { position: relative; display: flex; flex-direction: column; max-height: calc(100dvh - 32px); overflow: auto; overscroll-behavior: contain;
      padding: calc(18 * var(--px)) calc(22 * var(--px)) calc(16 * var(--px)); scrollbar-width: thin; scrollbar-color: var(--mu-line) transparent; }
    .nm-head { padding-right: calc(64 * var(--px)); }
    .nm-icon { flex: none; display: grid; place-items: center; width: calc(64 * var(--px)); }
    .nm-leaf-icon { width: calc(64 * var(--px)); height: auto; filter: drop-shadow(0 0 calc(8 * var(--px)) rgba(255, 196, 110, 0.3)) drop-shadow(0 calc(2 * var(--px)) 0 rgba(0, 0, 0, 0.35)); }
    .nm .mu-ask-card h2 { font-size: calc(24 * var(--px)); }
    .nm-sub { margin: calc(4 * var(--px)) 0 0 !important; font-size: calc(14.5 * var(--px)) !important; color: var(--mu-ink2); }
    .nm .mu-ask-orn { margin: calc(12 * var(--px)) 0 calc(14 * var(--px)); }
    .nm-x { position: absolute; right: calc(12 * var(--px)); top: calc(12 * var(--px)); z-index: 1; display: flex; align-items: center; gap: calc(6 * var(--px));
      padding: calc(5 * var(--px)) calc(6 * var(--px)); border: 0; border-radius: calc(6 * var(--px)); background: none; color: var(--mu-ink2); cursor: pointer; outline: none; }
    .nm-x .mu-icon { width: calc(16 * var(--px)); height: calc(16 * var(--px)); }
    .nm-x kbd { min-width: 0; height: calc(19 * var(--px)); font-size: calc(11.5 * var(--px)); }
    .nm-x:hover, .nm-x:focus-visible { color: var(--mu-ink); background: rgba(255, 255, 255, 0.08); }

    /* The leaf: the name in Koulen, dark ink on a strip of palm leaf with its two string holes. */
    .nm-leaf { position: relative; display: flex; align-items: center; justify-content: center; gap: calc(14 * var(--px)); min-height: calc(100 * var(--px));
      padding: calc(4 * var(--px)) calc(26 * var(--px)) calc(12 * var(--px)); border-radius: calc(5 * var(--px)) / calc(14 * var(--px));
      background: linear-gradient(180deg, #ecd8a6 0%, #e2c88c 48%, #d4b574 100%); color: #3b2812;
      box-shadow: inset 0 calc(2 * var(--px)) 0 rgba(255, 250, 230, 0.55), inset 0 calc(-3 * var(--px)) 0 rgba(120, 82, 34, 0.35), 0 calc(4 * var(--px)) calc(14 * var(--px)) rgba(0, 0, 0, 0.35); }
    .nm-leaf::before, .nm-leaf::after { content: ''; position: absolute; left: calc(14 * var(--px)); right: calc(14 * var(--px)); height: 1px; background: rgba(122, 86, 52, 0.28); }
    .nm-leaf::before { top: calc(14 * var(--px)); }
    .nm-leaf::after { bottom: calc(14 * var(--px)); }
    .nm-hole { flex: none; width: calc(9 * var(--px)); height: calc(9 * var(--px)); border-radius: 50%; background: radial-gradient(circle at 40% 40%, #2a1c0c, #4a3418); box-shadow: 0 0 0 calc(2 * var(--px)) rgba(196, 122, 20, 0.45); }
    .nm-km { flex: 1; min-width: 0; text-align: center; font: 400 calc(52 * var(--nm-fit, 1) * var(--px)) / 1.5 Koulen, 'Kantumruy Pro', serif; letter-spacing: 0;
      overflow-wrap: anywhere; text-shadow: 0 1px 0 rgba(255, 246, 220, 0.6); }
    .nm-km.is-empty { color: rgba(59, 40, 18, 0.28); text-shadow: none; }
    .nm-km.is-new { animation: nm-ink 0.22s ease-out; }
    @keyframes nm-ink { from { opacity: 0.35; transform: translateY(calc(2 * var(--px))); } }
    .nm-latin { min-height: calc(22 * var(--px)); margin: calc(7 * var(--px)) 0 0 !important; text-align: center; font: 600 calc(16 * var(--px)) / 1.35 var(--mu-display) !important;
      color: var(--mu-sand) !important; letter-spacing: 0.04em; }
    .nm-latin.is-empty { visibility: hidden; }

    /* The other spellings. */
    .nm-alts { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: calc(6 * var(--px)) calc(8 * var(--px)); margin-top: calc(6 * var(--px)); }
    .nm-alts[hidden] { display: none; }
    .nm-alts-t { font-size: calc(13 * var(--px)); color: var(--mu-dim); }
    .nm-alts-c { display: contents; }
    .nm-alt { min-height: calc(36 * var(--px)); padding: 0 calc(12 * var(--px)); border: 1px solid var(--mu-line); border-radius: calc(18 * var(--px)); background: rgba(255, 244, 222, 0.05);
      color: var(--mu-ink); font: 400 calc(20 * var(--px)) / 1.4 Koulen, 'Kantumruy Pro', serif; cursor: pointer; outline: none; transition: background 0.15s, border-color 0.15s, color 0.15s; }
    .nm-alt:hover { background: rgba(255, 244, 222, 0.12); border-color: var(--mu-line-hi); }
    .nm-alt[aria-checked='true'] { color: var(--mu-gold-hi); border-color: var(--mu-gold-hi); background: rgba(58, 44, 20, 0.75); box-shadow: 0 0 calc(10 * var(--px)) rgba(255, 176, 40, 0.35); }
    .nm-alt:focus-visible { outline: 2px solid rgba(255, 244, 214, 0.95); outline-offset: 2px; }

    /* The field. */
    .nm-field { display: block; margin-top: calc(14 * var(--px)); --mu-edge: var(--mu-line-hi); --mu-shadow: none; }
    .nm-field > .mu-bg { background: rgba(4, 10, 20, 0.55); }
    .nm-field:focus-within { --mu-edge: var(--mu-gold-hi); }
    .nm-input { display: block; width: 100%; box-sizing: border-box; height: calc(48 * var(--px)); padding: 0 calc(16 * var(--px)); border: 0; background: none; outline: none;
      color: var(--mu-ink); caret-color: var(--mu-gold-hi); font: 600 calc(19 * var(--px)) / 1 'Nunito Sans', 'Kantumruy Pro', system-ui, sans-serif; text-align: center; user-select: text; -webkit-user-select: text; }
    .nm-input::placeholder { color: var(--mu-dim); font-weight: 400; font-size: calc(16 * var(--px)); }
    .nm-field.is-shake { animation: nm-shake 0.4s; }
    @keyframes nm-shake { 20% { transform: translateX(calc(-6 * var(--px))); } 45% { transform: translateX(calc(5 * var(--px))); } 70% { transform: translateX(calc(-2 * var(--px))); } }

    /* The letter board: only while the game pad is in use (no keyboard in hand). */
    .nm-keys { display: none; grid-template-columns: repeat(10, 1fr); gap: calc(4 * var(--px)); margin-top: calc(10 * var(--px)); }
    body.pad-on .nm-keys { display: grid; }
    .nm-key { min-height: calc(34 * var(--px)); border: 1px solid var(--mu-line); border-radius: calc(5 * var(--px)); background: rgba(255, 244, 222, 0.05); color: var(--mu-ink);
      font: 600 calc(15 * var(--px)) / 1 var(--mu-display); cursor: pointer; outline: none; }
    .nm-key-sp { grid-column: span 2; font-size: calc(13 * var(--px)); }
    .nm-key-bs { grid-column: span 2; }
    .nm-key.pad-focus, .nm-key:focus-visible { color: var(--mu-gold-hi); border-color: var(--mu-gold-hi); background: rgba(58, 44, 20, 0.75); }

    /* Common Khmer names. */
    .nm-h { margin: calc(16 * var(--px)) 0 calc(8 * var(--px)); font: 700 calc(14 * var(--px)) / 1.2 var(--mu-display); color: var(--mu-gold-hi); letter-spacing: 0.02em; }
    .nm-names { display: grid; grid-template-columns: repeat(6, 1fr); gap: calc(5 * var(--px)); }
    .nm-name { display: grid; justify-items: center; gap: 0; padding: calc(5 * var(--px)) calc(2 * var(--px)) calc(6 * var(--px)); border: 1px solid var(--mu-line); border-radius: calc(6 * var(--px));
      background: rgba(255, 244, 222, 0.04); color: var(--mu-ink); cursor: pointer; outline: none; transition: background 0.15s, border-color 0.15s, transform 0.2s var(--mu-ease); }
    .nm-name b { font: 400 calc(19 * var(--px)) / 1.45 Koulen, 'Kantumruy Pro', serif; }
    .nm-name small { font-size: calc(11.5 * var(--px)); color: var(--mu-ink2); }
    .nm-name:hover { background: rgba(255, 244, 222, 0.11); border-color: var(--mu-line-hi); }
    .nm-name:active { transform: scale(0.96); }
    .nm-name.is-on { border-color: var(--mu-gold-hi); background: rgba(58, 44, 20, 0.75); }
    .nm-name.is-on b { color: var(--mu-gold-hi); }
    .nm-name:focus-visible { outline: 2px solid rgba(255, 244, 214, 0.95); outline-offset: 2px; }
    .nm .nm-row { margin-top: calc(18 * var(--px)); }
    .nm-save:disabled { opacity: 0.45; cursor: default; }
    .nm-clear { align-self: center; margin-top: calc(10 * var(--px)); padding: calc(4 * var(--px)) calc(10 * var(--px)); border: 0; background: none; color: var(--mu-dim);
      font-size: calc(13 * var(--px)); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
    .nm-clear[hidden] { display: none; }
    .nm-clear:hover { color: #f0a08a; }
    :lang(km) .nm .mu-ask-card h2 { letter-spacing: 0; line-height: 1.35; }
    :lang(km) .nm-sub, :lang(km) .nm-alts-t, :lang(km) .nm-clear { font-size: calc(15 * var(--px)) !important; }
    :lang(km) .nm-h { letter-spacing: 0; font-size: calc(15 * var(--px)); }
    /* (the game pad: no keys' letters; its buttons, glyphs.ts) */
    body.pad-on .nm kbd:not(.is-pad) { display: none; }
    /* (while it is open: the mini-map, the touch buttons and the tool bar step aside) */
    body.nm-on .mm, body.nm-on .rh-help { opacity: 0 !important; visibility: hidden !important; }
    body.nm-on.roam-touch .rt, body.nm-on.roam-touch .rtb-wrap { display: none !important; }
    .mu-calm ~ .nm .nm-km.is-new { animation: none; }

    /* A phone: at the top (the keyboard comes up under it), three names a row, big enough for a thumb. */
    @media (max-width: 639px), (pointer: coarse) {
      .mu-ask.nm { align-items: flex-start; padding: 10px; }
      .nm .mu-ask-card { width: 100%; }
      .nm-in { max-height: calc(100dvh - 20px); padding: 14px 14px 12px; }
      .nm-names { grid-template-columns: repeat(4, 1fr); }
      .nm-name, .nm-alt { min-height: 44px; }
      .nm .mu-ask kbd, .nm kbd { display: none; }
    }
    @media (max-width: 420px) {
      .nm-names { grid-template-columns: repeat(3, 1fr); }
      .nm-leaf { min-height: 72px; padding: 4px 16px; }
      .nm-km { font-size: calc(40px * var(--nm-fit, 1)); }
    }
    /* A phone on its side: the head and the leaf lower, the names in one wide grid. */
    @media (max-height: 520px) {
      .mu-ask.nm { align-items: flex-start; padding: 8px; }
      .nm-in { max-height: calc(100dvh - 16px); padding: 10px 14px; }
      .nm-sub { display: none; }
      .nm-icon, .nm-leaf-icon { width: 44px; }
      .nm .mu-ask-orn { margin: 6px 0 8px; }
      .nm-leaf { min-height: 74px; padding: 6px 20px 8px; }
      .nm-km { font-size: calc(36px * var(--nm-fit, 1)); line-height: 1.7; }
      .nm-latin { margin-top: 4px !important; }
      .nm-field { margin-top: 8px; }
      .nm-names { grid-template-columns: repeat(6, 1fr); }
      .nm-h { margin: 10px 0 6px; }
    }`;
  document.head.append(style);
}
