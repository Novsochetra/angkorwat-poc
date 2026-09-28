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
 * Tab), and Tab goes round its two buttons. While a card is up, the body has
 * `mu-asking` (roaming holds the explorer still: roam.ts).
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
  /** The words, in the language in use (filled again when it changes). */
  words(): { title: string; note: string; stay: string; go: string };
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
        <button type="button" class="mu-ask-stay mu-frame mu-sm" aria-keyshortcuts="Escape"><span class="mu-bg"></span><span class="mu-focus"></span><span class="mu-ask-t"></span><kbd>Esc</kbd></button>
        <${goTag} ${goAttrs} class="mu-ask-go mu-frame mu-sm" aria-keyshortcuts="Enter"><span class="mu-bg"></span><span class="mu-glow"></span><span class="mu-focus"></span>${spec.goIcon ?? ''}<span class="mu-ask-t"></span><kbd>Enter</kbd></${goTag}>
      </div>
    </section>`;
  root.after(wrap);
  const card = wrap.querySelector<HTMLElement>('.mu-ask-card')!;
  const stay = wrap.querySelector<HTMLButtonElement>('.mu-ask-stay')!;
  const go = wrap.querySelector<HTMLElement>('.mu-ask-go')!;
  let isOpen = false;

  function words(): void {
    const w = spec.words();
    card.querySelector('h2')!.textContent = w.title;
    card.querySelector('p')!.textContent = w.note;
    stay.querySelector('.mu-ask-t')!.textContent = w.stay;
    go.querySelector('.mu-ask-t')!.textContent = w.go;
  }
  words();
  onLang(words);

  function show(on: boolean): void {
    isOpen = on;
    wrap.classList.toggle('is-open', on);
    card.setAttribute('aria-hidden', String(!on));
    document.body.classList.toggle('mu-asking', on);
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
        else {
          if (spec.href) open(spec.href, '_blank', 'noopener');
          goOn();
        }
      } else if (e.code === 'Tab') {
        // (Tab goes round the two buttons, never out to the page behind)
        const i = [stay, go].indexOf(document.activeElement as HTMLElement);
        (i < 0 ? (e.shiftKey ? go : stay) : i === 0 ? go : stay).focus({ preventScroll: true });
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
