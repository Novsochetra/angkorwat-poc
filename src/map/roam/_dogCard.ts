import { clearMark } from '../pad/nav';
import { pad } from '../pad/pad';
import type { UISound } from '../types';
import { ICON } from '../ui/icons';
import { lang, onLang, t } from '../ui/lang';
import { setSteppedVars } from '../ui/shape';
import { DOG_MENU_ICON } from './_dogHook';

/**
 * The dog's name (roam/_dog.ts): the names the player picks from, and the card
 * that asks ("ដាក់ឈ្មោះឆ្កែរបស់អ្នក" / "Name your dog") — when the dog decides
 * to go with him, and from the explorer menu's "Dog's name" after.
 *
 * Village dogs are named for their coat or as a pet name: លឿង "Yellow" (his is
 * tan: the first, kept if nothing is picked), ខ្មៅ "Blackie", ស "Whitey", ក្រហម
 * "Red", តូច "Little one", សំណាង "Lucky". Each chip shows the Khmer and its
 * Latin spelling; the one picked is written big, in Koulen.
 *
 * Keys: ← → (and ↑ ↓) or 1–6 pick, Enter keeps it, Esc shuts (the name stays as
 * it was). Its keys are its own while it is open (a capture listener, before
 * the roaming keys); the add-on keeps him still meanwhile. The game pad: a
 * layer (the d-pad between the chips, ✕ picks, △ keeps, ○ shuts). On a phone
 * the chips are three a row, big enough for a thumb.
 */

export interface DogName {
  id: string;
  km: string;
  latin: string;
  /** What it means (English). */
  en: string;
}

export const DOG_NAMES: readonly DogName[] = [
  { id: 'leung', km: 'លឿង', latin: 'Leung', en: 'Yellow' },
  { id: 'khmao', km: 'ខ្មៅ', latin: 'Khmao', en: 'Blackie' },
  { id: 'sar', km: 'ស', latin: 'Sar', en: 'Whitey' },
  { id: 'krahom', km: 'ក្រហម', latin: 'Krahom', en: 'Red' },
  { id: 'touch', km: 'តូច', latin: 'Touch', en: 'Little one' },
  { id: 'samnang', km: 'សំណាង', latin: 'Samnang', en: 'Lucky' },
];

/** The name until one is picked. */
export const DEFAULT_DOG_NAME = DOG_NAMES[0];

/** A name by its id, its Khmer letters or its Latin spelling (any case); null if none. */
export function findDogName(s: string | null | undefined): DogName | null {
  if (!s) return null;
  const k = s.trim().toLowerCase();
  return DOG_NAMES.find((n) => n.id === k || n.km === s.trim() || n.latin.toLowerCase() === k) ?? null;
}

/** The name as shown in the language in use (Khmer letters in Khmer, the Latin spelling in English). */
export const dogNameIn = (n: DogName): string => (lang() === 'km' ? n.km : n.latin);

export interface DogCardDeps {
  /** The name now (the chip lit when it opens). */
  current(): DogName;
  /** Kept (Enter, the gold button, △). */
  onPick(n: DogName): void;
  /** Shut without keeping (Esc, Not now, ○): `fresh` when it opened as the dog came along (the add-on says what it is called). */
  onClose?(fresh: boolean): void;
  sound?(s: UISound): void;
}

interface Card {
  open(fresh: boolean): void;
  close(): void;
  pick(i: number): void;
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

/** Checks: pick name `i` (not kept). */
export function pickDogCard(i: number): void {
  card?.pick(i);
}

const SHOT = typeof location !== 'undefined' && new URLSearchParams(location.search).get('shot') === '1';

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
        <div class="dgc-names" role="radiogroup">${DOG_NAMES.map((n, i) => `<button type="button" class="dgc-chip" role="radio" aria-checked="false" data-i="${i}"><b lang="km">${n.km}</b><small>${n.latin}</small></button>`).join('')}</div>
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
  const chips = [...wrap.querySelectorAll<HTMLButtonElement>('.dgc-chip')];
  const keep = q<HTMLButtonElement>('.dgc-keep');
  const later = q<HTMLButtonElement>('.dgc-later');
  let isOpen = false;
  let fresh = false;
  let chosen = 0;
  let closePad: (() => void) | null = null;

  function words(): void {
    wrap.lang = lang();
    q('#dgc-title').textContent = t(fresh ? 'dogNameTitleNew' : 'dogNameTitle');
    q('#dgc-sub').textContent = t('dogNameSub');
    later.querySelector('.mu-ask-t')!.textContent = t(fresh ? 'dogNameKeep' : 'dogNameLater');
    keep.querySelector('.mu-ask-t')!.textContent = t('dogNameSave');
    q('.dgc-names').setAttribute('aria-label', t('dogNameTitle'));
    for (const b of chips) {
      const n = DOG_NAMES[Number(b.dataset.i)];
      b.setAttribute('aria-label', `${n.km}, ${n.latin} (${n.en})`);
      b.title = `${n.latin} — ${n.en}`;
    }
    show();
  }

  function show(): void {
    const n = DOG_NAMES[chosen];
    q('.dgc-km').textContent = n.km;
    q('.dgc-latin').textContent = lang() === 'km' ? n.latin : `${n.latin} · ${n.en}`;
    chips.forEach((b, i) => {
      b.classList.toggle('is-on', i === chosen);
      b.setAttribute('aria-checked', String(i === chosen));
    });
    if (fresh) later.querySelector('.mu-ask-t')!.textContent = t('dogNameKeep', { name: dogNameIn(deps!.current()) });
  }

  function pick(i: number): void {
    if (i < 0 || i >= DOG_NAMES.length) return;
    if (i !== chosen) deps?.sound?.('select');
    chosen = i;
    show();
  }

  function keepIt(): void {
    const n = DOG_NAMES[chosen];
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

  for (const b of chips)
    b.addEventListener('click', () => {
      pick(Number(b.dataset.i));
      // (a mouse: the focus goes back to the card, so Enter keeps the name; the pad's stays on the chip)
      if (!pad.active) box.focus({ preventScroll: true });
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
      const k = e.key;
      const at = document.activeElement;
      if (k === 'Escape') {
        if (!e.repeat) cancel();
      } else if (k === 'Enter' || k === ' ') {
        // (Enter on Not now, reached with Tab, shuts; on a chip it picks it; else it keeps the name)
        if (at === later) cancel();
        else if (at instanceof HTMLButtonElement && chips.includes(at)) pick(Number(at.dataset.i));
        else if (!e.repeat) keepIt();
      } else if (/^[1-9]$/.test(k)) pick(Number(k) - 1);
      else if (k.startsWith('Arrow') && e.isTrusted) pick((chosen + (k === 'ArrowLeft' || k === 'ArrowUp' ? -1 : 1) + DOG_NAMES.length) % DOG_NAMES.length);
      else if (k === 'Tab') {
        const all = [...chips, later, keep];
        const i = all.indexOf(at as HTMLButtonElement);
        all[(i < 0 ? (e.shiftKey ? all.length - 1 : 0) : i + (e.shiftKey ? -1 : 1) + all.length) % all.length].focus({ preventScroll: true });
      } else if (k.startsWith('Arrow')) return;
      // (nothing reaches the roaming keys, the mini-map or the map while it is open)
      e.stopImmediatePropagation();
      e.preventDefault();
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
      const now = deps!.current();
      chosen = Math.max(0, DOG_NAMES.indexOf(now));
      words();
      if (isOpen) return;
      isOpen = true;
      wrap.classList.add('is-open');
      box.setAttribute('aria-hidden', 'false');
      document.body.classList.add('dgc-on');
      deps?.sound?.('open');
      closePad = pad.openLayer(wrap, {
        first: () => chips[chosen],
        back: cancel,
        buttons: {
          north: () => {
            keepIt();
            return true;
          },
        },
      });
      if (pad.active) (document.activeElement as HTMLElement | null)?.blur();
      else box.focus({ preventScroll: true });
    },
    close: shut,
    pick,
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
    .dgc-in { display: flex; flex-direction: column; max-height: calc(100dvh - 32px); overflow: auto; overscroll-behavior: contain;
      padding: calc(18 * var(--px)) calc(22 * var(--px)) calc(16 * var(--px)); scrollbar-width: thin; scrollbar-color: var(--mu-line) transparent; }
    .dgc-icon { flex: none; display: grid; place-items: center; width: calc(56 * var(--px)); }
    .dgc-dog { width: calc(48 * var(--px)); height: calc(48 * var(--px)); filter: drop-shadow(0 0 calc(8 * var(--px)) rgba(255, 196, 110, 0.3)) drop-shadow(0 calc(2 * var(--px)) 0 rgba(0, 0, 0, 0.35)); }
    .dgc .mu-ask-card h2 { font-size: calc(23 * var(--px)); }
    .dgc-sub { margin: calc(4 * var(--px)) 0 0 !important; font-size: calc(14.5 * var(--px)) !important; color: var(--mu-ink2); }
    .dgc .mu-ask-orn { margin: calc(12 * var(--px)) 0 calc(10 * var(--px)); }
    .dgc-name { display: flex; flex-direction: column; align-items: center; min-height: calc(96 * var(--px)); }
    .dgc-km { font: 400 calc(50 * var(--px)) / 1.5 Koulen, 'Kantumruy Pro', serif; color: var(--mu-gold-hi); letter-spacing: 0;
      text-shadow: 0 0 calc(14 * var(--px)) rgba(255, 176, 40, 0.35), 0 calc(2 * var(--px)) 0 rgba(0, 0, 0, 0.35); }
    .dgc-latin { margin-top: calc(-4 * var(--px)); font: 600 calc(15 * var(--px)) / 1.3 var(--mu-display); color: var(--mu-sand); letter-spacing: 0.04em; }
    .dgc-names { display: grid; grid-template-columns: repeat(6, 1fr); gap: calc(5 * var(--px)); margin-top: calc(12 * var(--px)); }
    .dgc-chip { position: relative; display: grid; justify-items: center; padding: calc(5 * var(--px)) calc(2 * var(--px)) calc(6 * var(--px)); border: 1px solid var(--mu-line);
      border-radius: calc(6 * var(--px)); background: rgba(255, 244, 222, 0.04); color: var(--mu-ink); cursor: pointer; outline: none;
      transition: background 0.15s, border-color 0.15s, transform 0.2s var(--mu-ease); }
    .dgc-chip b { font: 400 calc(19 * var(--px)) / 1.45 Koulen, 'Kantumruy Pro', serif; }
    .dgc-chip small { font-size: calc(11.5 * var(--px)); color: var(--mu-ink2); }
    .dgc-chip:hover { background: rgba(255, 244, 222, 0.11); border-color: var(--mu-line-hi); }
    .dgc-chip:active { transform: scale(0.96); }
    .dgc-chip.is-on { border-color: var(--mu-gold-hi); background: rgba(58, 44, 20, 0.75); box-shadow: 0 0 calc(10 * var(--px)) rgba(255, 176, 40, 0.35); }
    .dgc-chip.is-on b { color: var(--mu-gold-hi); }
    .dgc-chip:focus-visible, .dgc-chip.pad-focus { outline: 2px solid rgba(255, 244, 214, 0.95); outline-offset: 2px; }
    .dgc .dgc-row { margin-top: calc(18 * var(--px)); }
    :lang(km) .dgc .mu-ask-card h2 { letter-spacing: 0; line-height: 1.35; }
    :lang(km) .dgc-sub { font-size: calc(15 * var(--px)) !important; }
    body.pad-on .dgc kbd:not(.is-pad) { display: none; }
    body.dgc-on .mm, body.dgc-on .rh-help { opacity: 0 !important; visibility: hidden !important; }
    body.dgc-on.roam-touch .rt, body.dgc-on.roam-touch .rtb-wrap { display: none !important; }
    @media (max-width: 639px), (pointer: coarse) {
      .mu-ask.dgc { padding: 10px; }
      .dgc-in { padding: 14px 14px 12px; }
      .dgc-names { grid-template-columns: repeat(3, 1fr); }
      .dgc-chip { min-height: 48px; }
      .dgc kbd { display: none; }
    }
    @media (max-height: 520px) {
      .mu-ask.dgc { align-items: flex-start; padding: 8px; }
      .dgc-in { max-height: calc(100dvh - 16px); padding: 10px 14px; }
      .dgc-sub { display: none; }
      .dgc .mu-ask-orn { margin: 6px 0; }
      .dgc-name { min-height: 64px; }
      .dgc-km { font-size: 36px; }
      .dgc-names { grid-template-columns: repeat(6, 1fr); }
    }`;
  document.head.append(style);
}
