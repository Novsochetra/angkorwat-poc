import { isKhmer, khmerOnly, khmerSpellings, latinPart, NAME_MAX, tidyName, toKhmer } from '../khmerName';
import { clearMark } from '../pad/nav';
import { pad } from '../pad/pad';
import type { UISound } from '../types';
import { ICON } from '../ui/icons';
import { lang, onLang, t } from '../ui/lang';
import { setSteppedVars } from '../ui/shape';
import { DOG_MENU_ICON } from './_dogHook';

/**
 * The dog's name (roam/_dog.ts): the card that asks ("ដាក់ឈ្មោះឱ្យសុនខរបស់អ្នក" /
 * "Give your dog a name") — when the dog decides to go with him, and from the
 * explorer menu's "Dog's name" after. The player writes it, as for the explorer's
 * name (_nameCard.ts): in Latin letters (khmerName.ts writes it in Khmer: Mimi →
 * មីមី) or in Khmer straight away, and sees it big, in Koulen, as it is typed; when
 * a name can be written more than one way the other spellings are chips under it.
 * There are no names to pick from and no default: until one is written the card is
 * empty, the gold button is dim, and the dog is "សុនខ" / "the dog" (the polite Khmer word,
 * not ឆ្កែ) in its words.
 *
 * Keys: the field has the focus (a desktop keyboard), Enter keeps the name (with
 * none written the field shakes), Esc shuts (the name stays as it was). Its keys are
 * its own while it is open (a capture listener, before the roaming keys); the
 * add-on keeps him still meanwhile. The game pad: a layer (a letter board, shown only
 * while the pad is in use, the spellings, ✕ presses, △ keeps, ○ shuts). On a phone
 * the card stands at the top (the keyboard comes up under it).
  */

export interface DogName {
  /** In Khmer letters. */
  km: string;
  /** The Latin spelling ('' for a name written in Khmer). */
  latin: string;
}

/** A name written (or kept): null unless `km` is Khmer script. */
export function customDogName(km: string, latin: string): DogName | null {
  const k = tidyName(km).trim();
  return k && khmerOnly(k) ? { km: k, latin: latinPart(latin).trim() } : null;
}

/**
 * The six village names the first card offered (by their ids): a dog already given one keeps it
 * (`oldDogName`), and an old link's `dogname=` still reads them.
 */
const OLD_NAMES: Record<string, DogName> = {
  leung: { km: 'លឿង', latin: 'Leung' },
  khmao: { km: 'ខ្មៅ', latin: 'Khmao' },
  sar: { km: 'ស', latin: 'Sar' },
  krahom: { km: 'ក្រហម', latin: 'Krahom' },
  touch: { km: 'តូច', latin: 'Touch' },
  samnang: { km: 'សំណាង', latin: 'Samnang' },
};

/** An old village name by its id, its Khmer letters or its Latin spelling (any case); null if none. */
export function oldDogName(s: string | null | undefined): DogName | null {
  if (!s) return null;
  const k = s.trim().toLowerCase();
  return OLD_NAMES[k] ?? Object.values(OLD_NAMES).find((n) => n.km === s.trim() || n.latin.toLowerCase() === k) ?? null;
}

/**
 * A name from text (the URL's `dogname=`): `<Khmer>|<Latin>` (what `dogNameParam` writes), an old
 * village name, or any name typed in Latin or Khmer letters (null if nothing is left of it).
 */
export function parseDogName(s: string | null | undefined): DogName | null {
  if (!s) return null;
  const old = oldDogName(s);
  if (old) return old;
  const [a, b] = s.split('|');
  const text = tidyName(a).trim();
  if (!text) return null;
  return customDogName(isKhmer(text) ? text : toKhmer(text), b ?? latinPart(text));
}

/** A name as `parseDogName` reads it (a bug report's `dogname=`). */
export const dogNameParam = (n: DogName): string => `${n.km}|${n.latin}`;

/** The name as shown in the language in use (Khmer letters in Khmer, the Latin spelling in English; a Khmer-only name in both). */
export const dogNameIn = (n: DogName): string => (lang() === 'km' ? n.km : n.latin || n.km);
/** The name in a sentence: in Khmer after សុនខ (the polite word for a dog), "សុនខស" (a one-letter name, ស, reads as a name, not a word); with no name yet, "សុនខ" / "the dog". */
export const dogCalled = (n: DogName | null): string => (lang() === 'km' ? `${t('dogTheDog')}${n ? n.km : ''}` : n ? n.latin || n.km : t('dogTheDog'));
/** The name on its own in a sentence: in Khmer in quotes, «ស». */
export const dogQuoted = (n: DogName): string => (lang() === 'km' ? `«${n.km}»` : n.latin || n.km);

export interface DogCardDeps {
  /** The name now (written in the field when it opens; null while it has none). */
  current(): DogName | null;
  /** Kept (Enter, the gold button, △). */
  onPick(n: DogName): void;
  /** Shut without keeping (Esc, Not now, ○): `fresh` when it opened as the dog came along (it goes with him, unnamed). */
  onClose?(fresh: boolean): void;
  sound?(s: UISound): void;
}

interface Card {
  open(fresh: boolean): void;
  close(): void;
  type(text: string): void;
  readonly isOpen: boolean;
}

let deps: DogCardDeps | null = null;
let card: Card | null = null;

export function setDogCardDeps(d: DogCardDeps): void {
  deps = d;
}

/** Open the card (`fresh`: the dog has just come along: its title says so). */
export function openDogCard(fresh = false): void {
  if (!deps) return;
  (card ??= makeCard()).open(fresh);
}

export function closeDogCard(): void {
  card?.close();
}

export const dogCardOpen = (): boolean => !!card?.isOpen;

/** Checks: type `text` into the field (not kept). */
export function typeDogCard(text: string): void {
  card?.type(text);
}

const SHOT = typeof location !== 'undefined' && new URLSearchParams(location.search).get('shot') === '1';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const uniq = (xs: readonly string[]): string[] => [...new Set(xs.filter(Boolean))];
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** The dog sitting, in pixels (the explorer menu's picture, _dogHook.ts), big at the card's head. */
const DOG_ICON = DOG_MENU_ICON.replace('class="rxm-icon"', 'class="dgc-dog"');

function makeCard(): Card {
  injectStyle();
  const wrap = document.createElement('div');
  wrap.className = 'map-ui mu-ask dgc';
  if (SHOT) wrap.classList.add('mu-shot');
  setSteppedVars(wrap);
  wrap.innerHTML = `
    <section class="mu-ask-card mu-frame mu-lg dgc-card" role="dialog" aria-modal="true" aria-labelledby="dgc-title" aria-describedby="dgc-sub" aria-hidden="true" tabindex="-1">
      <span class="mu-bg"></span>
      <div class="dgc-in">
        <div class="mu-ask-head"><span class="dgc-icon">${DOG_ICON}</span><div><h2 id="dgc-title"></h2><p id="dgc-sub" class="dgc-sub"></p></div></div>
        <div class="mu-orn mu-ask-orn" aria-hidden="true"><i></i>${ICON.diamond}<i></i></div>
        <div class="dgc-name" aria-live="polite"><b class="dgc-km" lang="km"></b><span class="dgc-latin"></span></div>
        <label class="dgc-field mu-frame mu-sm"><span class="mu-bg"></span><input class="dgc-input" type="text" maxlength="${NAME_MAX + 8}" autocomplete="off" autocapitalize="words" autocorrect="off" spellcheck="false" enterkeyhint="done" /></label>
        <div class="dgc-alts" role="radiogroup"><span class="dgc-alts-t"></span><span class="dgc-alts-c"></span></div>
        <div class="dgc-keys">${LETTERS.map((l) => `<button type="button" class="dgc-key" data-key="${l}" tabindex="-1">${l}</button>`).join('')}<button type="button" class="dgc-key dgc-key-sp" data-key=" " tabindex="-1"></button><button type="button" class="dgc-key dgc-key-bs" data-key="⌫" tabindex="-1">⌫</button></div>
        <div class="mu-ask-row dgc-row">
          <button type="button" class="mu-ask-stay mu-frame mu-sm dgc-later" aria-keyshortcuts="Escape"><span class="mu-bg"></span><span class="mu-focus"></span><span class="mu-ask-t"></span><kbd data-pad="east">Esc</kbd></button>
          <button type="button" class="mu-ask-go mu-frame mu-sm dgc-keep" aria-keyshortcuts="Enter"><span class="mu-bg"></span><span class="mu-glow"></span><span class="mu-focus"></span><span class="mu-ask-t"></span><kbd data-pad="north">Enter</kbd></button>
        </div>
      </div>
    </section>`;
  const anchor = document.querySelector('.map-ui.rh') ?? document.getElementById('ui');
  if (anchor) anchor.after(wrap);
  else document.body.append(wrap);
  const q = <T extends HTMLElement>(s: string) => wrap.querySelector<T>(s)!;
  const box = q('.dgc-card');
  const keep = q<HTMLButtonElement>('.dgc-keep');
  const later = q<HTMLButtonElement>('.dgc-later');
  const input = q<HTMLInputElement>('.dgc-input');
  const altsEl = q('.dgc-alts');
  const altsC = q('.dgc-alts-c');
  let isOpen = false;
  let fresh = false;
  /** The spellings of what is typed (the usual first), and the one picked: none typed, none of its own. */
  let spells: string[] = [];
  let spell = 0;
  let closePad: (() => void) | null = null;
  /** A phone or a tablet: no keyboard to type with until the field is tapped. */
  const touchy = () => document.body.classList.contains('roam-touch') || matchMedia('(pointer: coarse)').matches;

  /** The name as it stands: the one written (its spelling picked), or none. */
  function now(): DogName | null {
    return spells.length ? customDogName(spells[spell], latinPart(input.value)) : null;
  }

  function words(): void {
    wrap.lang = lang();
    q('#dgc-title').textContent = t(fresh ? 'dogNameTitleNew' : 'dogNameTitle');
    q('#dgc-sub').textContent = t('dogNameSub');
    later.querySelector('.mu-ask-t')!.textContent = t(fresh ? 'nameLater' : 'dogNameLater');
    keep.querySelector('.mu-ask-t')!.textContent = t('dogNameSave');
    input.placeholder = t('nameType');
    input.setAttribute('aria-label', t('dogNameTitle'));
    q('.dgc-alts-t').textContent = t('nameOther');
    altsEl.setAttribute('aria-label', t('nameOther'));
    q('.dgc-key-sp').textContent = t('nameSpace');
    q('.dgc-key-sp').setAttribute('aria-label', t('nameSpace'));
    q('.dgc-key-bs').setAttribute('aria-label', t('nameBack'));
    show();
  }

  function show(): void {
    const n = now();
    const big = q('.dgc-km');
    big.textContent = n ? n.km : t('dogNameEmpty');
    big.classList.toggle('is-empty', !n);
    // (long names: the letters shrink to fit)
    const len = n ? [...n.km].length : 0;
    q('.dgc-name').style.setProperty('--dgc-fit', String(len > 18 ? 0.55 : len > 13 ? 0.7 : len > 9 ? 0.85 : 1));
    q('.dgc-latin').textContent = n ? n.latin : '';
    keep.disabled = !n;
    // The other spellings (only when there are some).
    altsEl.hidden = spells.length < 2;
    altsC.innerHTML = spells.length < 2 ? '' : spells.map((x, i) => `<button type="button" class="dgc-alt" role="radio" aria-checked="${i === spell}" data-i="${i}" lang="km">${esc(x)}</button>`).join('');
  }

  /** The field changed: its spellings (none when nothing writable is left in it). */
  function typed(): void {
    spells = khmerSpellings(input.value);
    spell = 0;
    show();
  }

  function pickAlt(i: number): void {
    if (i < 0 || i >= spells.length || i === spell) return;
    spell = i;
    deps?.sound?.('tick');
    show();
  }

  /** Checks: the field says `text`. */
  function type(text: string): void {
    input.value = text.slice(0, NAME_MAX + 8);
    typed();
  }

  function keepIt(): void {
    const n = now();
    if (!n) {
      // (nothing to keep: the field says so)
      const f = q('.dgc-field');
      f.classList.remove('is-shake');
      void f.offsetWidth;
      f.classList.add('is-shake');
      deps?.sound?.('back');
      return;
    }
    shut();
    deps?.onPick(n);
  }

  function shut(): void {
    if (!isOpen) return;
    isOpen = false;
    wrap.classList.remove('is-open');
    box.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('dgc-on');
    closePad?.();
    closePad = null;
    if (wrap.querySelector('.pad-focus')) clearMark();
    if (document.activeElement instanceof HTMLElement && wrap.contains(document.activeElement)) document.activeElement.blur();
  }

  const cancel = () => {
    if (!isOpen) return;
    const f = fresh;
    shut();
    deps?.sound?.('close');
    deps?.onClose?.(f);
  };

  input.addEventListener('input', () => {
    // (an input method composing a letter: its letters come at the end, compositionend)
    if (!(input as HTMLInputElement & { isComposing?: boolean }).isComposing) typed();
  });
  input.addEventListener('compositionend', typed);
  altsC.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.dgc-alt');
    if (!b) return;
    pickAlt(Number(b.dataset.i));
    // (back to the field for the keys; the pad's focus stays on the spellings, drawn again: the one picked)
    if (!pad.active && !touchy()) input.focus({ preventScroll: true });
    else altsC.querySelector<HTMLElement>(`[data-i="${b.dataset.i}"]`)?.focus({ preventScroll: true });
  });
  q('.dgc-keys').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.dgc-key');
    if (!b) return;
    const k = b.dataset.key!;
    let v = input.value;
    if (k === '⌫') v = [...v].slice(0, -1).join('');
    else if (v.length < NAME_MAX && !(k === ' ' && (!v || v.endsWith(' ')))) v += v && !v.endsWith(' ') ? k.toLowerCase() : k;
    input.value = v;
    typed();
    deps?.sound?.('tick');
  });
  keep.addEventListener('click', keepIt);
  later.addEventListener('click', cancel);
  wrap.addEventListener('pointerdown', (e) => {
    if (isOpen && e.target === wrap) cancel();
  });
  addEventListener(
    'keydown',
    (e) => {
      if (!isOpen || document.body.classList.contains('reporting')) return;
      // (an input method composing: its keys are its own — Enter there picks the letters, not the name)
      if (e.isComposing || e.keyCode === 229) return;
      const k = e.key;
      const at = document.activeElement;
      const inField = at === input;
      const alt = at instanceof HTMLButtonElement && at.classList.contains('dgc-alt') ? at : null;
      const onKey = at instanceof HTMLElement && at.classList.contains('dgc-key');
      let used = true;
      if (k === 'Escape') {
        if (!e.repeat) cancel();
      } else if (k === 'Enter' || (k === ' ' && !inField)) {
        // (Enter on Not now, reached with Tab, shuts; on a spelling it picks it; on a letter it presses it; else it keeps the name)
        if (at === later) cancel();
        else if (alt) pickAlt(Number(alt.dataset.i));
        else if (onKey) used = false;
        else if (!e.repeat) keepIt();
      } else if (k.startsWith('Arrow')) {
        // (the game pad's arrows, made by the page, move its own focus: pad.ts; the keys' are the field's caret)
        if (!e.isTrusted) return;
        used = false;
      } else if (k === 'Tab') {
        const all = [input, ...altsC.querySelectorAll<HTMLButtonElement>('.dgc-alt'), later, keep];
        const i = all.indexOf(at as HTMLButtonElement);
        all[(i < 0 ? (e.shiftKey ? all.length - 1 : 0) : i + (e.shiftKey ? -1 : 1) + all.length) % all.length].focus({ preventScroll: true });
      } else if (!inField && k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && k !== ' ') {
        // (a letter typed with a button or the card in focus goes into the field)
        input.focus({ preventScroll: true });
        used = false;
      } else used = inField || k === ' ' ? false : true;
      // (nothing reaches the roaming keys, the mini-map or the map while it is open: only the field's and the buttons' own)
      e.stopImmediatePropagation();
      if (used) e.preventDefault();
    },
    true,
  );
  onLang(words);

  return {
    get isOpen() {
      return isOpen;
    },
    open(f) {
      fresh = f;
      // (its size and time of day: the roaming interface's)
      const like = document.querySelector<HTMLElement>('.map-ui.rh') ?? document.getElementById('ui');
      if (like) {
        wrap.style.setProperty('--u', like.style.getPropertyValue('--u') || '1');
        wrap.style.setProperty('--mu-n', like.style.getPropertyValue('--mu-n') || '0');
      }
      // What it starts with: the name kept (in the field, its spelling first), or nothing.
      const kept = deps!.current();
      input.value = kept ? kept.latin || kept.km : '';
      spells = kept ? uniq([kept.km, ...khmerSpellings(input.value)]).slice(0, 3) : [];
      spell = 0;
      words();
      if (isOpen) return;
      isOpen = true;
      wrap.classList.add('is-open');
      box.setAttribute('aria-hidden', 'false');
      document.body.classList.add('dgc-on');
      deps?.sound?.('open');
      closePad = pad.openLayer(wrap, {
        // (the pad starts on the letter board's A with nothing written, else on the gold button)
        first: () => (input.value ? keep : q('.dgc-key')),
        back: cancel,
        buttons: {
          north: () => {
            keepIt();
            return true;
          },
        },
      });
      // (a desktop keyboard: the field has the focus — a letter typed anywhere else would reach the mini-map's M and N first; a pad: its ring; a phone: the card, no keyboard yet)
      if (pad.active) (document.activeElement as HTMLElement | null)?.blur();
      else if (touchy() || SHOT) box.focus({ preventScroll: true });
      else {
        input.focus({ preventScroll: true });
        const n = input.value.length;
        input.setSelectionRange(n, n);
      }
    },
    close: shut,
    type,
  };
}

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  // (on map.css's cards that ask, `.mu-ask`: the same glass, gold edge, ornament and buttons)
  style.textContent = `
    .mu-ask.dgc { z-index: 66; }
    .dgc .mu-ask-card { width: min(calc(500 * var(--px)), 100%); padding: 0; }
    .dgc-in { display: flex; flex-direction: column; max-height: calc(100vh - 32px); max-height: calc(100dvh - 32px); overflow: auto; overscroll-behavior: contain;
      padding: calc(18 * var(--px)) calc(22 * var(--px)) calc(16 * var(--px)); scrollbar-width: thin; scrollbar-color: var(--mu-line) transparent; }
    .dgc-icon { flex: none; display: grid; place-items: center; width: calc(56 * var(--px)); }
    .dgc-dog { width: calc(48 * var(--px)); height: calc(48 * var(--px)); filter: drop-shadow(0 0 calc(8 * var(--px)) rgba(255, 196, 110, 0.3)) drop-shadow(0 calc(2 * var(--px)) 0 rgba(0, 0, 0, 0.35)); }
    .dgc .mu-ask-card h2 { font-size: calc(23 * var(--px)); }
    .dgc-sub { margin: calc(4 * var(--px)) 0 0 !important; font-size: calc(14.5 * var(--px)) !important; color: var(--mu-ink2); }
    .dgc .mu-ask-orn { margin: calc(12 * var(--px)) 0 calc(10 * var(--px)); }
    .dgc-name { display: flex; flex-direction: column; align-items: center; min-height: calc(96 * var(--px)); }
    .dgc-km { max-width: 100%; text-align: center; overflow-wrap: anywhere; font: 400 calc(50 * var(--dgc-fit, 1) * var(--px)) / 1.5 Koulen, 'Kantumruy Pro', serif; color: var(--mu-gold-hi); letter-spacing: 0;
      text-shadow: 0 0 calc(14 * var(--px)) rgba(255, 176, 40, 0.35), 0 calc(2 * var(--px)) 0 rgba(0, 0, 0, 0.35); }
    .dgc-km.is-empty { font-size: calc(30 * var(--px)); color: var(--mu-ink2); opacity: 0.5; text-shadow: none; }
    .dgc-latin { min-height: calc(20 * var(--px)); margin-top: calc(-4 * var(--px)); font: 600 calc(15 * var(--px)) / 1.3 var(--mu-display); color: var(--mu-sand); letter-spacing: 0.04em; }
    /* The field, the other spellings, the letter board (only while the game pad is in use). */
    .dgc-field { display: block; margin-top: calc(14 * var(--px)); --mu-edge: var(--mu-line-hi); --mu-shadow: none; }
    .dgc-field > .mu-bg { background: rgba(4, 10, 20, 0.55); }
    .dgc-field:focus-within { --mu-edge: var(--mu-gold-hi); }
    .dgc-input { display: block; width: 100%; box-sizing: border-box; height: calc(44 * var(--px)); padding: 0 calc(16 * var(--px)); border: 0; background: none; outline: none;
      color: var(--mu-ink); caret-color: var(--mu-gold-hi); font: 600 calc(18 * var(--px)) / 1 'Nunito Sans', 'Kantumruy Pro', system-ui, sans-serif; text-align: center; user-select: text; -webkit-user-select: text; }
    .dgc-input::placeholder { color: var(--mu-dim); font-weight: 400; font-size: calc(15 * var(--px)); }
    .dgc-field.is-shake { animation: dgc-shake 0.4s; }
    @keyframes dgc-shake { 20% { transform: translateX(calc(-6 * var(--px))); } 45% { transform: translateX(calc(5 * var(--px))); } 70% { transform: translateX(calc(-2 * var(--px))); } }
    .dgc-keep:disabled { opacity: 0.45; cursor: default; }
    .dgc-alts { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: calc(6 * var(--px)) calc(8 * var(--px)); margin-top: calc(8 * var(--px)); }
    .dgc-alts[hidden] { display: none; }
    .dgc-alts-t { font-size: calc(13 * var(--px)); color: var(--mu-dim); }
    .dgc-alts-c { display: contents; }
    .dgc-alt { min-height: calc(34 * var(--px)); padding: 0 calc(12 * var(--px)); border: 1px solid var(--mu-line); border-radius: calc(17 * var(--px)); background: rgba(255, 244, 222, 0.05);
      color: var(--mu-ink); font: 400 calc(19 * var(--px)) / 1.4 Koulen, 'Kantumruy Pro', serif; cursor: pointer; outline: none; transition: background 0.15s, border-color 0.15s, color 0.15s; }
    .dgc-alt:hover { background: rgba(255, 244, 222, 0.12); border-color: var(--mu-line-hi); }
    .dgc-alt[aria-checked='true'] { color: var(--mu-gold-hi); border-color: var(--mu-gold-hi); background: rgba(58, 44, 20, 0.75); box-shadow: 0 0 calc(10 * var(--px)) rgba(255, 176, 40, 0.35); }
    .dgc-alt:focus-visible, .dgc-alt.pad-focus { outline: 2px solid rgba(255, 244, 214, 0.95); outline-offset: 2px; }
    .dgc-keys { display: none; grid-template-columns: repeat(10, 1fr); gap: calc(4 * var(--px)); margin-top: calc(10 * var(--px)); }
    body.pad-on .dgc-keys { display: grid; }
    .dgc-key { min-height: calc(34 * var(--px)); border: 1px solid var(--mu-line); border-radius: calc(5 * var(--px)); background: rgba(255, 244, 222, 0.05); color: var(--mu-ink);
      font: 600 calc(15 * var(--px)) / 1 var(--mu-display); cursor: pointer; outline: none; }
    .dgc-key-sp { grid-column: span 2; font-size: calc(13 * var(--px)); }
    .dgc-key-bs { grid-column: span 2; }
    .dgc-key.pad-focus, .dgc-key:focus-visible { color: var(--mu-gold-hi); border-color: var(--mu-gold-hi); background: rgba(58, 44, 20, 0.75); }
    .dgc .dgc-row { margin-top: calc(18 * var(--px)); }
    :lang(km) .dgc .mu-ask-card h2 { letter-spacing: 0; line-height: 1.35; }
    :lang(km) .dgc-sub, :lang(km) .dgc-alts-t { font-size: calc(15 * var(--px)) !important; }
    body.pad-on .dgc kbd:not(.is-pad) { display: none; }
    body.dgc-on .mm, body.dgc-on .rh-help { opacity: 0 !important; visibility: hidden !important; }
    body.dgc-on.roam-touch .rt, body.dgc-on.roam-touch .rtb-wrap { display: none !important; }
    @media (max-width: 639px), (pointer: coarse) {
      .mu-ask.dgc { align-items: flex-start; padding: 10px; }
      .dgc-in { padding: 14px 14px 12px; }
      .dgc-alt { min-height: 44px; }
      .dgc kbd { display: none; }
    }
    @media (max-height: 520px) {
      .mu-ask.dgc { align-items: flex-start; padding: 8px; }
      .dgc-in { max-height: calc(100vh - 16px); max-height: calc(100dvh - 16px); padding: 10px 14px; }
      .dgc-sub { display: none; }
      .dgc .mu-ask-orn { margin: 6px 0; }
      .dgc-name { min-height: 64px; }
      .dgc-km { font-size: 36px; }
      .dgc-field { margin-top: 8px; }
    }`;
  document.head.append(style);
}
