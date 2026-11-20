import { ICON } from '../ui/icons';
import { onLang, t } from '../ui/lang';
import { framed, setSteppedVars } from '../ui/shape';
import type { VoiceState } from './panel';

/**
 * The party's one voice control, the same on a phone and a computer: a round
 * microphone button at the bottom right, there while the player is in a party.
 * It is a switch (the owner, 2026-11-20: no holding to talk).
 *
 * - Not in voice yet: a dashed, crossed-out mic, "Tap to turn on voice". A
 *   tap (or Alt / Option) joins and turns the mic on: the browser asks for
 *   the microphone then, and from then on the friends are heard.
 * - In voice: a tap (or Alt / Option) turns the mic on (gold) or off (white,
 *   crossed out). Friends are heard either way; leaving the party ends voice.
 * - The page hidden (another tab or app, the phone locked) turns the mic off,
 *   so nobody is heard by mistake; a tap turns it on again.
 *
 * It sits over the party card (party.css), so it works with the card open.
 * Under it, a line: what a tap does now, or "Tap to hear your friends" when
 * the browser holds their sound until a tap (iOS Safari).
 */

const TOGGLE_KEYS = new Set(['AltLeft', 'AltRight']);

export interface MicButton {
  show(on: boolean): void;
  setState(state: VoiceState): void;
  /** The browser holds the friends' sound: the next tap on the button starts it. */
  needsTap(held: boolean): void;
  stop(): void;
  /** A message under the button for a few seconds (joining failed while the card is shut). */
  say(text: string): void;
  /** Shots (`partydemo=talk`): looks as it does with the mic on, without a microphone. */
  demoTalking(): void;
  /** As a tap on it (a game pad's button: the party card's □, the DualSense touchpad). */
  press(): void;
}

export function createMicButton(root: HTMLElement, h: { join(): void; talk(on: boolean): void; tapToHear(): void }): MicButton {
  const wrap = document.createElement('div');
  wrap.className = 'map-ui mu-mic is-off';
  wrap.innerHTML = `
    <button type="button" class="mu-mic-btn" aria-pressed="false"><span class="mu-mic-ico">${ICON.micOff}</span></button>
    <span class="mu-mic-hint"><span class="mu-mic-t"></span></span>`;
  // (the map's own stepped frame, as the corner's buttons: map.css .mu-frame)
  setSteppedVars(wrap);
  root.after(wrap);
  const btn = framed(wrap.querySelector<HTMLButtonElement>('.mu-mic-btn')!, 'md', true);
  const icon = btn.querySelector<HTMLElement>('.mu-mic-ico')!;
  framed(wrap.querySelector<HTMLElement>('.mu-mic-hint')!, 'xs');
  const hint = wrap.querySelector<HTMLElement>('.mu-mic-t')!;
  let shown = false;
  let state: VoiceState = 'off';
  let live = false;
  /** Joining was asked by a tap: the mic goes on once voice is in. */
  let liveOnJoin = false;
  let held = false;
  let message = '';
  let messageTimer = 0;

  const keyName = () => (/Mac|iPhone|iPad/.test(navigator.platform) ? 'Option' : 'Alt');
  const touchOnly = () => matchMedia('(hover: none)').matches;
  const withKey = (text: string) => (touchOnly() ? text : `${text} (${keyName()})`);

  function words(): void {
    const label = state === 'off' ? t('voiceJoin') : live ? t('voiceMute') : t('voiceTalk');
    btn.setAttribute('aria-label', label);
    wrap.classList.toggle('is-said', message !== '');
    if (message) hint.textContent = message;
    else if (state === 'connecting') hint.textContent = t('voiceConnecting');
    else if (state === 'reconnecting') hint.textContent = t('voiceReconnecting');
    else if (held) hint.textContent = t('voiceTap');
    else if (state === 'off') hint.textContent = withKey(t('voiceJoin'));
    else hint.textContent = withKey(live ? t('voiceMicOn') : t('voiceMicOff'));
  }

  function look(): void {
    wrap.classList.toggle('is-off', state === 'off');
    wrap.classList.toggle('is-busy', state === 'connecting' || state === 'reconnecting');
    wrap.classList.toggle('is-talking', live);
    btn.setAttribute('aria-pressed', String(live));
    icon.innerHTML = live ? ICON.mic : ICON.micOff;
    words();
  }

  function setLive(on: boolean): void {
    if (on && state !== 'on') return;
    if (on !== live) {
      live = on;
      h.talk(on);
    }
    look();
  }

  function press(): void {
    if (held) h.tapToHear();
    if (state === 'off') {
      liveOnJoin = true;
      h.join();
    } else if (state === 'on') {
      setLive(!live);
    }
  }

  btn.addEventListener('click', press);

  const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
  addEventListener('keydown', (e) => {
    if (!shown || !TOGGLE_KEYS.has(e.code) || typing(e)) return;
    // (Alt alone moves the focus to the browser's menu on Windows: keep it on the game)
    e.preventDefault();
    if (!e.repeat) press();
  });
  addEventListener('keyup', (e) => TOGGLE_KEYS.has(e.code) && e.preventDefault());
  document.addEventListener('visibilitychange', () => document.hidden && live && setLive(false));
  onLang(words);
  look();

  return {
    show(on) {
      shown = on;
      wrap.classList.toggle('is-open', on);
      if (!on) setLive(false);
    },
    setState(next) {
      if (next === state) return;
      state = next;
      if (state === 'on' && liveOnJoin) {
        liveOnJoin = false;
        setLive(true);
        return;
      }
      if (state === 'off') {
        liveOnJoin = false;
        live = false;
      }
      look();
    },
    needsTap(on) {
      held = on;
      wrap.classList.toggle('is-held', on);
      words();
    },
    stop() {
      setLive(false);
    },
    say(text) {
      message = text;
      words();
      clearTimeout(messageTimer);
      messageTimer = window.setTimeout(() => ((message = ''), words()), 5000);
    },
    demoTalking() {
      live = true;
      look();
    },
    press() {
      if (shown) press();
    },
  };
}
