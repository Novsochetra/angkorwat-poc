import { ICON } from '../ui/icons';
import { onLang, t } from '../ui/lang';
import type { VoiceState } from './panel';

/**
 * The party's one voice control, the same on a phone and a computer: a round
 * microphone button at the bottom right, there while the player is in a party.
 *
 * - Voice off: a crossed-out mic, "Tap to join the voice chat". A tap (or
 *   Alt / Option) joins: the browser asks for the microphone then, and from
 *   then on the friends are heard.
 * - Voice on: hold it (a finger or the mouse) to talk; it glows gold. Slide up
 *   while holding to lock it on (a padlock), a tap stops it. On a computer,
 *   hold Left Alt / Option (V is the album, and almost every letter is taken);
 *   typing in a box never talks.
 * - The page hidden or the window left stops talking, so nobody is heard by
 *   mistake after switching apps.
 *
 * It sits over the party card (party.css), so a player can talk with it open.
 * Under it, a line: what a tap does now, the key, or "Tap to hear your
 * friends" when the browser holds their sound until a tap (iOS Safari).
 */

const LOCK_PX = 48;
const TALK_KEYS = new Set(['AltLeft', 'AltRight']);

export interface MicButton {
  show(on: boolean): void;
  setState(state: VoiceState): void;
  /** The browser holds the friends' sound: the next tap on the button starts it. */
  needsTap(held: boolean): void;
  stop(): void;
  /** A message under the button for a few seconds (joining failed while the card is shut). */
  say(text: string): void;
  /** Shots (`partydemo=talk`): looks as it does while talking, without talking. */
  demoTalking(): void;
}

export function createMicButton(root: HTMLElement, h: { join(): void; talk(on: boolean): void; tapToHear(): void }): MicButton {
  const wrap = document.createElement('div');
  wrap.className = 'map-ui mu-mic is-off';
  wrap.innerHTML = `
    <span class="mu-mic-lock" aria-hidden="true">${ICON.lock}</span>
    <button type="button" class="mu-mic-btn" aria-pressed="false">${ICON.micOff}</button>
    <span class="mu-mic-hint"></span>`;
  root.after(wrap);
  const btn = wrap.querySelector<HTMLButtonElement>('.mu-mic-btn')!;
  const hint = wrap.querySelector<HTMLElement>('.mu-mic-hint')!;
  let shown = false;
  let state: VoiceState = 'off';
  let talking = false;
  let locked = false;
  let held = false;
  let startY = 0;
  let pointer = -1;
  let message = '';
  let messageTimer = 0;

  const keyName = () => (/Mac|iPhone|iPad/.test(navigator.platform) ? 'Option' : 'Alt');
  const touchOnly = () => matchMedia('(hover: none)').matches;

  function words(): void {
    btn.setAttribute('aria-label', state === 'off' ? t('voiceJoin') : t('voiceHold'));
    wrap.classList.toggle('is-said', message !== '');
    if (message) hint.textContent = message;
    else if (state === 'off') hint.textContent = t('voiceJoin');
    else if (state === 'connecting') hint.textContent = t('voiceConnecting');
    else if (state === 'reconnecting') hint.textContent = t('voiceReconnecting');
    else if (held) hint.textContent = t('voiceTap');
    else if (locked) hint.textContent = t('voiceLocked');
    else if (talking) hint.textContent = '';
    else hint.textContent = touchOnly() ? t('voiceHoldLock') : t('voiceKey', { key: keyName() });
  }

  function set(on: boolean, lock = false): void {
    if (on && state !== 'on') return;
    locked = on && lock;
    wrap.classList.toggle('is-locked', locked);
    if (on !== talking) {
      talking = on;
      wrap.classList.toggle('is-talking', on);
      btn.setAttribute('aria-pressed', String(on));
      h.talk(on);
    }
    words();
  }

  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (state === 'off') return h.join();
    if (state !== 'on') return;
    if (held) h.tapToHear();
    if (locked) return set(false);
    pointer = e.pointerId;
    startY = e.clientY;
    btn.setPointerCapture(e.pointerId);
    set(true);
  });
  btn.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointer || !talking || locked) return;
    wrap.classList.toggle('is-near-lock', startY - e.clientY > LOCK_PX / 2);
    if (startY - e.clientY > LOCK_PX) set(true, true);
  });
  const release = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    pointer = -1;
    wrap.classList.remove('is-near-lock');
    if (!locked) set(false);
  };
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());

  const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
  addEventListener('keydown', (e) => {
    if (!shown || !TALK_KEYS.has(e.code) || typing(e)) return;
    // (Alt alone moves the focus to the browser's menu on Windows: keep it on the game)
    e.preventDefault();
    if (e.repeat) return;
    if (state === 'off') h.join();
    else if (!talking) set(true);
  });
  addEventListener('keyup', (e) => {
    if (!TALK_KEYS.has(e.code)) return;
    e.preventDefault();
    if (talking && !locked) set(false);
  });
  addEventListener('blur', () => talking && set(false));
  document.addEventListener('visibilitychange', () => document.hidden && talking && set(false));
  onLang(words);
  words();

  return {
    show(on) {
      shown = on;
      wrap.classList.toggle('is-open', on);
      if (!on && talking) set(false);
    },
    setState(next) {
      if (next === state) return;
      state = next;
      if (state !== 'on' && talking) set(false);
      wrap.classList.toggle('is-off', state === 'off');
      wrap.classList.toggle('is-busy', state === 'connecting' || state === 'reconnecting');
      btn.innerHTML = state === 'off' ? ICON.micOff : ICON.mic;
      words();
    },
    needsTap(on) {
      held = on;
      wrap.classList.toggle('is-held', on);
      words();
    },
    stop() {
      if (talking) set(false);
    },
    say(text) {
      message = text;
      words();
      clearTimeout(messageTimer);
      messageTimer = window.setTimeout(() => ((message = ''), words()), 5000);
    },
    demoTalking() {
      talking = true;
      wrap.classList.add('is-talking');
      words();
    },
  };
}
