import { pad } from '../pad/pad';
import { ICON } from '../ui/icons';
import { num, onLang, t, type WordKey } from '../ui/lang';
import { setSteppedVars } from '../ui/shape';
import type { Party } from './api';

/**
 * The party card (in the look of the map's asking cards, map.css `.mu-ask`):
 * out of a party, your name, "Make a party" and a code box to join a friend's;
 * in one, its code big (to read out), the members (who is talking, Mute, and
 * Remove for its maker), voice on / off, and Leave.
 *
 * It only draws a `PartyView` and says what was pressed (`PartyActions`):
 * index.ts holds the state and talks to the live service.
 */

export type VoiceState = 'off' | 'connecting' | 'on' | 'reconnecting';

export interface PartyView {
  party: Party | null;
  me: string;
  name: string;
  busy: boolean;
  error: WordKey | null;
  voice: VoiceState;
  speaking: Set<string>;
  muted: Set<string>;
}

export interface PartyActions {
  make(name: string): void;
  join(code: string, name: string): void;
  leave(): void;
  remove(id: string): void;
  mute(id: string, on: boolean): void;
  voice(on: boolean): void;
  close(): void;
}

export interface PartyPanel {
  readonly open: boolean;
  show(on: boolean): void;
  render(view: PartyView): void;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A code read out loud: two groups of three (K7Q M2P), in Latin letters (they are typed on any keyboard). */
const spaced = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

function startHtml(view: PartyView): string {
  return `
    <p class="mu-pty-note">${t('partyNote')}</p>
    <label class="mu-pty-field"><span>${t('partyName')}</span>
      <input class="mu-pty-name" maxlength="24" autocomplete="nickname" spellcheck="false" value="${esc(view.name)}"></label>
    <div class="mu-ask-row"><button type="button" class="mu-pty-make mu-ask-go mu-frame mu-sm" data-act="make"${view.busy ? ' disabled' : ''}>
      <span class="mu-bg"></span><span class="mu-glow"></span><span class="mu-focus"></span>${ICON.party}<span>${t('partyMake')}</span></button></div>
    <p class="mu-pty-or">${t('partyOr')}</p>
    <div class="mu-ask-row mu-pty-joinrow">
      <input class="mu-pty-code" maxlength="7" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="${t('partyCode')}" aria-label="${t('partyCode')}">
      <button type="button" class="mu-pty-join mu-ask-stay mu-frame mu-sm" data-act="join"${view.busy ? ' disabled' : ''}><span class="mu-bg"></span><span class="mu-focus"></span><span>${t('partyJoin')}</span></button>
    </div>`;
}

function memberHtml(view: PartyView, party: Party, m: { id: string; name: string }): string {
  const mine = m.id === view.me;
  const muted = view.muted.has(m.id);
  const talking = view.voice === 'on' && view.speaking.has(m.id) && !muted;
  const tags = [mine ? t('partyYou') : '', m.id === party.maker ? t('partyMaker') : ''].filter(Boolean).join(' · ');
  const muteBtn = mine || view.voice === 'off' ? '' : `<button type="button" class="mu-pty-ico${muted ? ' is-on' : ''}" data-act="mute" data-id="${esc(m.id)}" aria-pressed="${muted}" aria-label="${esc(t(muted ? 'partyUnmute' : 'partyMute', { name: m.name }))}">${muted ? ICON.muted : ICON.speaker}</button>`;
  const removeBtn = !mine && party.maker === view.me ? `<button type="button" class="mu-pty-ico" data-act="remove" data-id="${esc(m.id)}" aria-label="${esc(t('partyRemove', { name: m.name }))}">${ICON.close}</button>` : '';
  return `<li class="mu-pty-member${talking ? ' is-talking' : ''}"><span class="mu-pty-dot" aria-hidden="true"></span>
    <span class="mu-pty-who"><b>${esc(m.name)}</b>${tags ? `<small>${tags}</small>` : ''}</span>${muteBtn}${removeBtn}</li>`;
}

function inHtml(view: PartyView, party: Party): string {
  const voiceOn = view.voice !== 'off';
  const voiceLine = view.voice === 'connecting' ? t('voiceConnecting') : view.voice === 'reconnecting' ? t('voiceReconnecting') : t('voiceNote');
  return `
    <p class="mu-pty-share">${t('partyShare')}</p>
    <button type="button" class="mu-pty-codebig" data-act="copy" aria-label="${t('partyCopy')}: ${party.code}">${spaced(party.code)}</button>
    <p class="mu-pty-count">${t('partyMembers', { n: num(party.members.length), max: num(party.max) })}</p>
    <ul class="mu-pty-list">${party.members.map((m) => memberHtml(view, party, m)).join('')}</ul>
    <p class="mu-pty-vnote">${voiceLine}</p>
    <div class="mu-ask-row">
      <button type="button" class="mu-ask-stay mu-frame mu-sm" data-act="leave"><span class="mu-bg"></span><span class="mu-focus"></span><span>${t('partyLeave')}</span></button>
      <button type="button" class="mu-ask-go mu-frame mu-sm${voiceOn ? ' is-voice-on' : ''}" data-act="voice"${view.voice === 'connecting' ? ' disabled' : ''}>
        <span class="mu-bg"></span><span class="mu-glow"></span><span class="mu-focus"></span>${voiceOn ? ICON.micOff : ICON.mic}<span>${t(voiceOn ? 'voiceOff' : 'voiceOn')}</span></button>
    </div>`;
}

export function createPartyPanel(root: HTMLElement, act: PartyActions): PartyPanel {
  const wrap = document.createElement('div');
  wrap.className = 'map-ui mu-ask mu-pty';
  setSteppedVars(wrap);
  wrap.innerHTML = `
    <section class="mu-ask-card mu-frame mu-lg" role="dialog" aria-modal="true" aria-labelledby="mu-pty-title" aria-hidden="true" tabindex="-1">
      <span class="mu-bg"></span>
      <div class="mu-ask-head"><span class="mu-ask-icon">${ICON.party}</span><h2 id="mu-pty-title"></h2>
        <button type="button" class="mu-pty-x" data-act="close">${ICON.close}</button></div>
      <div class="mu-orn mu-ask-orn" aria-hidden="true"><i></i>${ICON.diamond}<i></i></div>
      <div class="mu-pty-body"></div>
      <p class="mu-pty-err" role="alert"></p>
    </section>`;
  root.after(wrap);
  const card = wrap.querySelector<HTMLElement>('.mu-ask-card')!;
  const body = wrap.querySelector<HTMLElement>('.mu-pty-body')!;
  const err = wrap.querySelector<HTMLElement>('.mu-pty-err')!;
  let isOpen = false;
  let closePad: (() => void) | null = null;
  let last: PartyView | null = null;
  let copiedUntil = 0;

  function render(view: PartyView): void {
    last = view;
    // (typing in a box: keep what is typed, and the caret, while the party list changes around it)
    const typing = body.contains(document.activeElement) && document.activeElement instanceof HTMLInputElement;
    if (!(typing && !view.party)) body.innerHTML = view.party ? inHtml(view, view.party) : startHtml(view);
    card.querySelector('h2')!.textContent = t('party');
    card.querySelector<HTMLElement>('.mu-pty-x')!.setAttribute('aria-label', t('partyClose'));
    err.textContent = view.error ? t(view.error) : performance.now() < copiedUntil ? t('partyCopied') : '';
    err.classList.toggle('is-ok', !view.error && performance.now() < copiedUntil);
    for (const b of body.querySelectorAll<HTMLButtonElement>('[data-act="make"], [data-act="join"]')) b.disabled = view.busy;
  }
  onLang(() => last && render(last));

  function value(cls: string): string {
    return body.querySelector<HTMLInputElement>(cls)?.value.trim() ?? '';
  }

  function copy(code: string): void {
    void navigator.clipboard?.writeText(code).catch(() => undefined);
    copiedUntil = performance.now() + 2000;
    if (last) render(last);
    setTimeout(() => last && render(last), 2100);
  }

  wrap.addEventListener('click', (e) => {
    if (e.target === wrap) return act.close();
    const b = (e.target as Element).closest<HTMLElement>('[data-act]');
    if (!b || (b as HTMLButtonElement).disabled) return;
    const id = b.dataset.id ?? '';
    switch (b.dataset.act) {
      case 'close': return act.close();
      case 'make': return act.make(value('.mu-pty-name'));
      case 'join': return act.join(value('.mu-pty-code'), value('.mu-pty-name'));
      case 'leave': return act.leave();
      case 'remove': return act.remove(id);
      case 'mute': return act.mute(id, !last?.muted.has(id));
      case 'voice': return act.voice(last?.voice === 'off');
      case 'copy': return last?.party && copy(last.party.code);
    }
  });
  wrap.addEventListener('keydown', (e) => {
    // (the map's own keys stay out while a box is typed in; Esc closes, Enter in the code box joins;
    // Alt / Option goes on to the mic button, so a player can talk with the card open)
    if (e.code !== 'AltLeft' && e.code !== 'AltRight') e.stopPropagation();
    if (e.code === 'Escape') act.close();
    else if (e.code === 'Enter' && (e.target as Element).classList.contains('mu-pty-code')) act.join(value('.mu-pty-code'), value('.mu-pty-name'));
    else if (e.code === 'Enter' && (e.target as Element).classList.contains('mu-pty-name')) act.make(value('.mu-pty-name'));
  });

  return {
    get open() {
      return isOpen;
    },
    show(on) {
      if (on === isOpen) return;
      isOpen = on;
      wrap.classList.toggle('is-open', on);
      card.setAttribute('aria-hidden', String(!on));
      document.body.classList.toggle('mu-asking', on);
      closePad?.();
      closePad = on ? pad.openLayer(wrap, { back: act.close }) : null;
      if (on) card.focus({ preventScroll: true });
      else (document.activeElement as HTMLElement | null)?.blur();
    },
    render,
  };
}
