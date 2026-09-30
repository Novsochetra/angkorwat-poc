import { clearMark, markFocus } from '../pad/nav';
import { pad } from '../pad/pad';
import type { UISound } from '../types';
import { ICON } from './icons';
import { onLang } from './lang';
import { setSteppedVars } from './shape';

/**
 * A card in the middle of the screen that asks (map.css `.mu-ask`), in the
 * look of the map's own cards: an icon and the question, the info card's
 * gold ornament line, a line of text, a quiet button to stay and the gold
 * "Begin expedition" button to go, the keys on key caps.
 *
 * **Esc** (or N, a click beside the card, the quiet button) stays; **Enter**
 * (or Y, the gold button) goes, but Enter on the quiet button, reached with
 * Tab, stays. The card takes the focus, not a button (no focus ring until
 * Tab), and Tab goes round its two buttons; ← ↑ go to the quiet one, → ↓ to
 * the gold one. While a card is up, the body has `mu-asking` (roaming holds
 * the explorer still: roam.ts).
 *
 * A game pad (pad/pad.ts): the card is a pad layer while it is up, the keys
 * show as its buttons (Esc ○, Enter ✕): ✕ goes (or presses the button the
 * d-pad moved to, with its ring), ○ stays. A link's page opens in a new tab
 * only from a click, a tap or a key (a pad press is none of them: the browser
 * would block it), so ✕ on a link keeps the card up, rings the gold button
 * and says so (`words().padLink`).
 *
 * Used by "Back to the map?" (roam/_leave.ts) and "Support the game"
 * (_support.ts: its gold button is a link, opened in a new tab).
 */
export interface AskCard {
  /** The card is up. */
  readonly open: boolean;
  /** Ask. */
  ask(): void;
  /** Close it without going. */
  close(): void;
}

export interface AskSpec {
  /** Its own class on the layer (and the start of its element ids). */
  cls: string;
  /** The icon beside the question (HTML). */
  icon: string;
  /** The words, in the language in use (filled again when it changes); `padLink`: instead of the note when the pad pressed the link and its page could not open. */
  words(): { title: string; note: string; stay: string; go: string; padLink?: string };
  /** The gold button is a link to this page, opened in a new tab (Enter opens it too). */
  href?: string;
  /** An icon before the gold button's words. */
  goIcon?: string;
  /** Go (the card is already closed). */
  onGo(): void;
  sound?(s: UISound): void;
}

export function createAskCard(root: HTMLElement, spec: AskSpec): AskCard {
  const wrap = document.createElement('div');
  wrap.className = `map-ui mu-ask ${spec.cls}`;
  if (new URLSearchParams(location.search).get('shot') === '1') wrap.classList.add('mu-shot');
  if (root.style.display === 'none') wrap.style.display = 'none';
  setSteppedVars(wrap);
  const id = spec.cls;
  const goTag = spec.href ? 'a' : 'button';
  const goAttrs = spec.href ? `href="${spec.href}" target="_blank" rel="noopener"` : 'type="button"';
  wrap.innerHTML = `
    <section class="mu-ask-card mu-frame mu-lg" role="alertdialog" aria-modal="true" aria-labelledby="${id}-title" aria-describedby="${id}-note" aria-hidden="true" tabindex="-1">
      <span class="mu-bg"></span>
      <div class="mu-ask-head"><span class="mu-ask-icon">${spec.icon}</span><h2 id="${id}-title"></h2></div>
      <div class="mu-orn mu-ask-orn" aria-hidden="true"><i></i>${ICON.diamond}<i></i></div>
      <p id="${id}-note"></p>
      <div class="mu-ask-row">
        <button type="button" class="mu-ask-stay mu-frame mu-sm" aria-keyshortcuts="Escape"><span class="mu-bg"></span><span class="mu-focus"></span><span class="mu-ask-t"></span><kbd data-pad="east">Esc</kbd></button>
        <${goTag} ${goAttrs} class="mu-ask-go mu-frame mu-sm" aria-keyshortcuts="Enter"><span class="mu-bg"></span><span class="mu-glow"></span><span class="mu-focus"></span>${spec.goIcon ?? ''}<span class="mu-ask-t"></span><kbd data-pad="south">Enter</kbd></${goTag}>
      </div>
    </section>`;
  root.after(wrap);
  const card = wrap.querySelector<HTMLElement>('.mu-ask-card')!;
  const stay = wrap.querySelector<HTMLButtonElement>('.mu-ask-stay')!;
  const go = wrap.querySelector<HTMLElement>('.mu-ask-go')!;
  let isOpen = false;
  /** Its pad layer while it is up (pad.ts `openLayer`): its close. */
  let closePad: (() => void) | null = null;
  /** The pad pressed the link and its page could not open: the note says how to open it. */
  let linkHeld = false;

  function words(): void {
    const w = spec.words();
    card.querySelector('h2')!.textContent = w.title;
    card.querySelector('p')!.textContent = (linkHeld && w.padLink) || w.note;
    stay.querySelector('.mu-ask-t')!.textContent = w.stay;
    go.querySelector('.mu-ask-t')!.textContent = w.go;
  }
  words();
  onLang(words);
  injectStyle();

  function show(on: boolean): void {
    isOpen = on;
    wrap.classList.toggle('is-open', on);
    card.setAttribute('aria-hidden', String(!on));
    document.body.classList.toggle('mu-asking', on);
    // (the pad works it while it is up: ✕ is Enter, ○ is Esc, the d-pad the arrows below; shut, its ring goes)
    closePad?.();
    closePad = on ? pad.openLayer(wrap, { back: close }) : null;
    if (!on && wrap.querySelector('.pad-focus')) clearMark();
    if (linkHeld) {
      linkHeld = false;
      wrap.classList.remove('is-link-held');
      words();
    }
  }

  /** The link's page in a new tab, if the browser lets this press open one (a click, a tap or a key: not a pad's press). */
  function openLink(href: string): boolean {
    const ua = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
    if (ua && !ua.isActive) return false;
    open(href, '_blank', 'noopener');
    return true;
  }

  /** The pad pressed the link and the browser would block its page: the card stays, the gold button in focus, the note says to click it. */
  function holdLink(): void {
    linkHeld = true;
    wrap.classList.add('is-link-held');
    words();
    if (pad.active) markFocus(go);
    else go.focus({ preventScroll: true });
    spec.sound?.('tick');
  }
  function close(): void {
    if (!isOpen) return;
    show(false);
    spec.sound?.('close');
    (document.activeElement as HTMLElement | null)?.blur();
  }
  function goOn(): void {
    if (!isOpen) return;
    show(false);
    (document.activeElement as HTMLElement | null)?.blur();
    spec.onGo();
  }

  stay.addEventListener('click', close);
  // (a link opens its page by itself; the card only closes)
  go.addEventListener('click', goOn);
  // (a click beside the card stays, like Esc)
  wrap.addEventListener('pointerdown', (e) => {
    if (isOpen && e.target === wrap) close();
  });
  // (the card takes the keys while it is up, before the map and the roaming input see them: a second Esc stays, never goes)
  addEventListener(
    'keydown',
    (e) => {
      if (!isOpen) return;
      if (e.code === 'Escape' || e.code === 'KeyN') close();
      else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'KeyY') {
        // (Enter on the quiet button, picked with Tab, stays)
        if (e.code !== 'KeyY' && document.activeElement === stay) close();
        else if (spec.href && !openLink(spec.href)) holdLink();
        else goOn();
      } else if (e.code === 'Tab') {
        // (Tab goes round the two buttons, never out to the page behind)
        const i = [stay, go].indexOf(document.activeElement as HTMLElement);
        (i < 0 ? (e.shiftKey ? go : stay) : i === 0 ? go : stay).focus({ preventScroll: true });
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        // (the arrows, and the pad's d-pad and stick: ← ↑ the quiet button, → ↓ the gold one; not to the map behind)
        const to = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? stay : go;
        if (document.activeElement !== to) {
          if (!e.isTrusted && pad.active) markFocus(to);
          else to.focus({ preventScroll: true });
          spec.sound?.('hover');
        }
      } else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true,
  );

  return {
    get open() {
      return isOpen;
    },
    ask() {
      if (isOpen) return;
      show(true);
      spec.sound?.('open');
      // (the card takes the focus, not a button: no focus ring until Tab; Enter and Esc work from the keys above)
      card.focus({ preventScroll: true });
    },
    close,
  };
}

let styled = false;
/** The pad's additions to the cards' look (map.css `.mu-ask`). */
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  style.textContent = `
    /* (a pad in hand on a touch screen: its buttons show, where the keys would not) */
    body.pad-on .mu-ask kbd.is-pad { display: inline-grid; }
    /* (the pad pressed the link: the note says to click it, in gold) */
    .mu-ask.is-link-held .mu-ask-card p { color: var(--mu-gold-hi); }`;
  document.head.append(style);
}
