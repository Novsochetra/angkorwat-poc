import type { UISound } from '../types';
import { onLang, t } from '../ui/lang';
import { setSteppedVars } from '../ui/shape';

/**
 * "Back to the map?" — a small card that asks before roaming ends. Esc (or
 * the touch close button, or the "Back to the map" button) no longer drops
 * the player straight back to the picker, where he would have to jump in
 * again: the card asks first. **Enter** (or Y, or its gold button) leaves;
 * **Esc** again (or N, or "Keep exploring") stays, as a stray second Esc
 * must never leave. While it is open the explorer stands still (roam.ts
 * reads `open`).
 *
 * Shots: `leave=1` shows it (roaming).
 */
export interface LeaveConfirm {
  /** The card is up (the explorer waits). */
  readonly open: boolean;
  /** Ask. */
  ask(): void;
  /** Close it without leaving. */
  close(): void;
}

export function createLeaveConfirm(root: HTMLElement, h: { onLeave(): void; sound?(s: UISound): void }): LeaveConfirm {
  injectStyle();
  const wrap = document.createElement('div');
  wrap.className = 'map-ui rl';
  if (new URLSearchParams(location.search).get('shot') === '1') wrap.classList.add('mu-shot');
  if (root.style.display === 'none') wrap.style.display = 'none';
  setSteppedVars(wrap);
  wrap.innerHTML = `
    <section class="rl-card mu-frame mu-md" role="alertdialog" aria-modal="true" aria-labelledby="rl-title" aria-describedby="rl-note" aria-hidden="true">
      <span class="mu-bg"></span>
      <h2 id="rl-title"></h2>
      <p id="rl-note"></p>
      <div class="rl-row">
        <button type="button" class="rl-stay mu-frame mu-sm" aria-keyshortcuts="Escape"><span class="mu-bg"></span><span class="mu-focus"></span><span class="rl-stay-text"></span><kbd>Esc</kbd></button>
        <button type="button" class="rl-go mu-frame mu-sm" aria-keyshortcuts="Enter"><span class="mu-bg"></span><span class="mu-glow"></span><span class="mu-focus"></span><span class="rl-go-text"></span><kbd>Enter</kbd></button>
      </div>
    </section>`;
  root.after(wrap);
  const card = wrap.querySelector<HTMLElement>('.rl-card')!;
  const stay = wrap.querySelector<HTMLButtonElement>('.rl-stay')!;
  const go = wrap.querySelector<HTMLButtonElement>('.rl-go')!;
  let isOpen = false;

  function words(): void {
    wrap.querySelector('#rl-title')!.textContent = t('rlTitle');
    wrap.querySelector('#rl-note')!.textContent = t('rlNote');
    wrap.querySelector('.rl-stay-text')!.textContent = t('rlStay');
    wrap.querySelector('.rl-go-text')!.textContent = t('rlGo');
  }
  words();
  onLang(words);

  function show(on: boolean): void {
    isOpen = on;
    wrap.classList.toggle('is-open', on);
    card.setAttribute('aria-hidden', String(!on));
  }
  function close(): void {
    if (!isOpen) return;
    show(false);
    h.sound?.('close');
    stay.blur();
  }
  function leave(): void {
    show(false);
    go.blur();
    h.onLeave();
  }

  stay.addEventListener('click', close);
  go.addEventListener('click', leave);
  // (the card takes the keys while it is up, before the roaming input sees them: a second Esc stays, never leaves)
  addEventListener(
    'keydown',
    (e) => {
      if (!isOpen) return;
      if (e.code === 'Escape' || e.code === 'KeyN') close();
      else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'KeyY') leave();
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true,
  );

  // (a check: `leave=1` shows the card)
  if (new URLSearchParams(location.search).get('leave') === '1') setTimeout(() => api.ask(), 0);

  const api: LeaveConfirm = {
    get open() {
      return isOpen;
    },
    ask() {
      if (isOpen) return;
      show(true);
      h.sound?.('open');
      // (focus on staying: a quick Enter still leaves, a key mashed by accident does not)
      stay.focus({ preventScroll: true });
    },
    close,
  };
  return api;
}

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `
    .rl { position: fixed; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center; pointer-events: none; }
    .rl::before { content: ''; position: absolute; inset: 0; background: rgba(8, 12, 20, 0.35); opacity: 0; transition: opacity 0.25s; }
    .rl.is-open { pointer-events: auto; }
    .rl.is-open::before { opacity: 1; }
    .rl-card { position: relative; display: flex; flex-direction: column; gap: calc(10 * var(--px)); max-width: min(calc(440 * var(--px)), calc(100vw - 32px));
      padding: calc(18 * var(--px)) calc(20 * var(--px)) calc(16 * var(--px)); opacity: 0; visibility: hidden; transform: translateY(calc(8 * var(--px))) scale(0.97);
      transition: opacity 0.2s, transform 0.3s var(--mu-ease), visibility 0s 0.3s; }
    .rl.is-open .rl-card { opacity: 1; visibility: visible; transform: none; transition: opacity 0.22s, transform 0.35s var(--mu-ease), visibility 0s; }
    .rl-card > .mu-bg { backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
    .rl-card h2 { margin: 0; font: 700 calc(21 * var(--px)) / 1.2 var(--mu-display); color: var(--mu-ink); }
    .rl-card p { margin: 0; font-size: calc(14 * var(--px)); line-height: 1.45; color: var(--mu-ink2); text-wrap: pretty; }
    .rl-row { display: flex; gap: calc(10 * var(--px)); justify-content: flex-end; flex-wrap: wrap; margin-top: calc(4 * var(--px)); }
    .rl-row button { position: relative; display: flex; align-items: center; gap: calc(8 * var(--px)); padding: calc(9 * var(--px)) calc(12 * var(--px));
      font: 700 calc(15 * var(--px)) / 1.1 var(--mu-display); color: var(--mu-ink); cursor: pointer; }
    .rl-row button kbd { font-size: calc(11.5 * var(--px)); color: var(--mu-ink2); }
    .rl-go { --mu-edge: rgba(255, 208, 112, 0.75); color: var(--mu-gold-hi) !important; }
    .rl-row button:hover, .rl-row button:focus-visible { --mu-edge: var(--mu-gold-hi); }
    @media (pointer: coarse) { .rl-row button kbd { display: none; } .rl-row button { padding: 12px 16px; } }
  `;
  document.head.append(s);
}
