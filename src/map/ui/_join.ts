import { NET } from '../../net/client';
import { checkName, type NameReason } from '../../net/names';
import { isKhmer, latinPart, playerName, setPlayerName, toKhmer } from '../khmerName';
import { inTestRoom, nightHeld, nyePhase, squareShown } from '../nye/clock';
import { openParty } from '../party/gate';
import { clearMark, focusables, moveFocusIn } from '../pad/nav';
import { pad } from '../pad/pad';
import { progress } from '../progress';
import type { UISound } from '../types';
import { makeFakeNet, type JoinNet } from './_joinFake';
import { openPlayers } from './_joinPlayers';
import { installRoomVoice } from './_joinVoice';
import { ICON } from './icons';
import { lang, num, onLang, t, type WordKey } from './lang';
import { setSteppedVars } from './shape';

/**
 * New Year online, joining (AWP-35 phase 2, ticket 7; docs/discussion/new-year-online.md "Joining is a choice",
 * "Names", "Testing"). Playing alone works as before: nothing connects until the player says so.
 *
 * - **The card** "ចូលរួមឆ្នាំថ្មីតាមអ៊ីនធឺណិត / Join the New Year online" (a `.mu-ask` card, map.css): the name
 *   others see (filled from what was used last, `nye.name`, else the name card's: khmerName.ts), Latin or Khmer
 *   letters, checked as it is typed (src/net/names.ts: the reason in words), a Latin name shown in Khmer letters
 *   too; "Join" → `NET.join({ room: 'public' })`. Its states follow `NET`: connecting, online ("Crowd 2" when the
 *   room has more than one, how many play), retrying, refused (why: the name, the code, full…), not online (no
 *   server set: said kindly, the show plays anyway). Online: the players near you (ui/_joinPlayers.ts) and Leave.
 * - **"Have a code?"**: a box for a 6-letter code (the hidden test room's, later a party's): upper case, Khmer
 *   digits read as digits, spaces and dashes out; it joins `room: 'test'` with it (the server checks it: the code is
 *   never in the game). The hidden link `/?event=<code>` (net/client.ts `pendingCode`): with a good name it joins
 *   at once, else the card opens on the name first.
 * - **"Play with friends: a party"** (when the corner has the party button: party/gate.ts): closes this card and
 *   opens the party card (map/party/): the party's players share a crowd here, and talk with each other.
 * - **Where it is offered** (never pushy): a small gold button by the calendar's while roaming, from the day the
 *   square ships until the night ends (`joinButton`, placed by roam/_nyePlayers.ts); once as this card when roaming
 *   starts during the night (`nye.asked`, kept); and the setting on the Play tab (New Year online on / off, the
 *   name), kept as `nye.online`: on, the next visit joins by itself with the same name.
 *
 * Kept (map/progress.ts): `nye.name` (the name as joined), `nye.online` (the setting), `nye.asked` (the card was
 * offered once). While the card is up the body has `mu-asking` (roaming holds him still) and its keys are its own.
 * A game pad: a pad layer (○ closes, △ joins).
 *
 * Shots (with the pretend room ui/_joinFake.ts): `nyejoin=card|connecting|online|retrying|offline|refused:<reason>`
 * the card in that state; `nyejoin=code` with the code box open (`nyecode=<code>`); `nyejoin=list|player` the players
 * list (roaming: roam/_nyePlayers.ts); `nyejoin=button|setting` nothing opened (the button while roaming; the setting
 * with `uistate=settings,tab:play,scroll:nyeon`); `nyename=<text>` typed in, `nyepeers=`, `nyecrowd=`, `nyeonline=`,
 * `nyetest=1` (the test room, and the overlay's TEST tag).
 */

const params = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
const SHOT = params.get('shot') === '1';
/** `nyejoin=…` in a shot: the pretend room and what to open. */
const ASK = SHOT ? params.get('nyejoin') : null;

// ── The connection the interface uses (the real one, or a shot's pretend one) ───────────────────────────────────

let here: () => { x: number; y: number; z: number; yaw: number } | null = () => null;
/** Where he is (roam/_nyePlayers.ts sets it: the players list's distances, the pretend players round him). */
export function setJoinHere(fn: typeof here): void {
  here = fn;
}
export const joinHere = (): { x: number; y: number; z: number; yaw: number } | null => here();

let netNow: JoinNet | null = null;
/** The live rooms' connection (net/client.ts `NET`), or a shot's pretend room (`nyejoin=`). */
export function joinNet(): JoinNet {
  return (netNow ??= ASK !== null ? makeFakeNet(params, () => here()) : (NET as JoinNet));
}

/** A server is set (else joining says so kindly). */
const available = (): boolean => joinNet().available !== false;

/** The words for why joining was refused (`NET.refusal`: a names.ts reason, or the server's code). */
export function refusalWords(r: string | null): string {
  const names: Record<NameReason | 'name', WordKey> = {
    short: 'njWhyShort',
    long: 'njWhyLong',
    letters: 'njWhyLetters',
    rude: 'njWhyRude',
    link: 'njWhyLink',
    digits: 'njWhyDigits',
    staff: 'njWhyStaff',
    name: 'njWhyName',
  };
  const other: Record<string, WordKey> = { code: 'njWhyCode', 'code-needed': 'njWhyCodeNeeded', full: 'njWhyFull', rate: 'njWhyRate', version: 'njWhyVersion', offline: 'njOffline' };
  const k = (r && (names[r as NameReason] ?? other[r])) || 'njWhyOther';
  return t(k);
}

/** The status in a line: "Online · Crowd 2 · 37 players", "Connecting…" (the button, the setting, the card). */
export function stateWords(): string {
  const n = joinNet();
  switch (n.state) {
    case 'connecting':
      return t('njConnecting');
    case 'retrying':
      return t('njRetrying');
    case 'online': {
      const parts = [t('njOnline')];
      if (n.room === 'test') parts.push(t('njTestRoom'));
      if (n.crowd > 1) parts.push(t('njCrowd', { n: num(n.crowd) }));
      parts.push(n.count.online > 1 ? t('njCount', { n: num(n.count.online) }) : t('njCount1'));
      return parts.join(' · ');
    }
    case 'refused':
      return n.refusal === 'offline' ? t('njOffline') : `${t('njRefused')}: ${refusalWords(n.refusal)}`;
    default:
      return available() ? t('njOff') : t('njOffline');
  }
}

/** Joined or joining (the setting's switch on). */
const inRoom = (): boolean => ['connecting', 'online', 'retrying'].includes(joinNet().state);

// ── The name ───────────────────────────────────────────────────────────────────────────────────────────────────

const isString = (v: unknown): v is string => typeof v === 'string';
/** The name to start with: the one joined with last, else the name card's (its Latin spelling, else its Khmer letters). */
function startName(): string {
  const kept = progress.get('nye.name', '', isString);
  if (kept && checkName(kept).ok) return kept;
  const n = playerName();
  return n ? n.latin || n.km : '';
}
/** The room code joined with last (the event's), or ''. */
function savedCode(): string {
  return tidyCode(progress.get('nye.code', '', isString)) ?? '';
}
/** The name as it will be joined with, if it passes the check, else null. */
function goodName(): string | null {
  const c = checkName(startName());
  return c.ok ? c.name : null;
}

/** A name in Khmer letters (the players list, the card): itself when it is Khmer, else khmerName.ts's spelling. */
export function inKhmer(name: string): string {
  return isKhmer(name) ? name : toKhmer(name);
}

/** A code typed in "Have a code?": upper case, Khmer digits as digits, spaces and dashes out; null if not a code. */
export function tidyCode(raw: string): string | null {
  const c = raw
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[០-៩]/g, (d) => String(d.charCodeAt(0) - 0x17e0))
    .replace(/[\s\-_.]/g, '');
  // (a room's code: the event's NYE2027, the test room's: 4 to 16 letters or digits)
  return /^[A-Z0-9]{4,16}$/.test(c) ? c : null;
}

// ── Joining ────────────────────────────────────────────────────────────────────────────────────────────────────

let sound: (s: UISound) => void = () => undefined;
/** The interface's sounds (roam/_nyePlayers.ts: the roaming add-on's `uiSound`). */
export function setJoinSound(fn: (s: UISound) => void): void {
  sound = fn;
}
/** One of the interface's sounds (the players list's too). */
export const joinSound = (s: UISound): void => sound(s);

/** Join with `name` (checked), the public room or (with `code`) the test room; kept for next time. */
function join(name: string, code: string | null): boolean {
  const c = checkName(name);
  if (!c.ok) return false;
  progress.set('nye.name', c.name);
  progress.set('nye.online', true);
  progress.set('nye.code', code ?? '');
  // (no name of his own yet: this one is his, as the name card keeps it)
  if (!playerName()) {
    const km = inKhmer(c.name);
    if (km) setPlayerName({ km, latin: latinPart(c.name) });
  }
  const n = joinNet();
  n.join({ name: c.name, look: n.look ?? 0, room: code ? 'test' : 'public', ...(code ? { code } : {}) });
  return true;
}

/** Leave (playing alone again); the setting is off until turned on. */
function leave(): void {
  progress.set('nye.online', false);
  joinNet().leave();
}

// ── The card ───────────────────────────────────────────────────────────────────────────────────────────────────

interface Card {
  open(o?: { code?: string; from?: 'button' | 'night' | 'link' | 'settings' }): void;
  close(): void;
  readonly isOpen: boolean;
}
let card: Card | null = null;

/** The icon: a burst over a temple's tower (the overlay's toast's), gold. */
const BURST = `<svg class="mu-icon nj-ico" viewBox="0 0 32 32" aria-hidden="true"><g fill="#ffd54a"><circle cx="16" cy="9" r="1.8"/><path d="M15.3 1h1.4v4h-1.4zM15.3 13h1.4v3h-1.4zM8 8.3h4v1.4H8zM20 8.3h4v1.4h-4zM10.3 3.3l1-1 2.8 2.8-1 1zM17.9 12.9l1-1 2.8 2.8-1 1zM20.7 2.3l1 1-2.8 2.8-1-1zM11.3 11.9l1 1-2.8 2.8-1-1z"/><path opacity=".8" d="M16 17l1.2 3h-2.4zM14.3 20.6h3.4l.8 2.6h-5zM12.8 23.8h6.4l.9 2.6h-8.2zM10 27h12l1.2 3H8.8z"/></g><circle cx="26" cy="20" r="1.3" fill="#f59ab8"/><circle cx="5" cy="18" r="1.1" fill="#cfe8ff"/><circle cx="27" cy="7" r="0.9" fill="#c9a6ff"/></svg>`;
/** Two people side by side (the players near you). */
const PEOPLE = `<svg class="mu-icon" viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><circle cx="8.5" cy="7.5" r="3.2"/><circle cx="16.5" cy="8.5" r="2.7"/><path d="M2.5 19.5c0-3.6 2.7-6 6-6s6 2.4 6 6v1h-12zM15.5 20.5v-1c0-1.9-.6-3.5-1.7-4.7.8-.5 1.7-.8 2.7-.8 2.9 0 5 2.1 5 5.2v1.3z"/></g></svg>`;

/** The map is shown (not under the loading screen or the story): the card waits for it. */
function mapShown(): boolean {
  if (SHOT) return true;
  if (document.body.classList.contains('map-waiting')) return false;
  const ld = document.getElementById('loading');
  if (ld && !ld.classList.contains('done')) return false;
  return !document.querySelector('.st');
}
function whenShown(fn: () => void): void {
  if (mapShown()) fn();
  else window.setTimeout(() => whenShown(fn), 400);
}

/** Open the join card (`code`: in the code box, from the test link; `from`: why it opened). */
export function openJoin(o: { code?: string; from?: 'button' | 'night' | 'link' | 'settings' } = {}): void {
  whenShown(() => (card ??= makeCard()).open(o));
}
export function closeJoin(): void {
  card?.close();
}
export const joinOpen = (): boolean => !!card?.isOpen;

function makeCard(): Card {
  injectStyle();
  const wrap = document.createElement('div');
  wrap.className = 'map-ui mu-ask nj';
  if (SHOT) wrap.classList.add('mu-shot');
  setSteppedVars(wrap);
  wrap.innerHTML = `
    <section class="mu-ask-card mu-frame mu-lg nj-card" role="dialog" aria-modal="true" aria-labelledby="nj-title" aria-describedby="nj-sub" aria-hidden="true" tabindex="-1">
      <span class="mu-bg"></span>
      <div class="nj-in">
        <button type="button" class="nj-x" aria-keyshortcuts="Escape">${ICON.close}<kbd data-pad="east">Esc</kbd></button>
        <div class="mu-ask-head nj-head"><span class="mu-ask-icon">${BURST}</span><div><h2 id="nj-title"></h2><p id="nj-sub" class="nj-sub"></p></div></div>
        <div class="mu-orn mu-ask-orn" aria-hidden="true"><i></i>${ICON.diamond}<i></i></div>
        <p class="nj-state" role="status" aria-live="polite"><i class="nj-dot" aria-hidden="true"></i><span class="nj-state-t"></span></p>
        <p class="nj-voice" hidden>${ICON.mic}<span></span></p>
        <div class="nj-form">
          <label class="nj-label" for="nj-input"></label>
          <label class="nj-field mu-frame mu-sm"><span class="mu-bg"></span><input id="nj-input" class="nj-input" type="text" maxlength="48" autocomplete="off" autocapitalize="words" autocorrect="off" spellcheck="false" enterkeyhint="go" /></label>
          <p class="nj-km"><span class="nj-km-l"></span> <b lang="km"></b></p>
          <p class="nj-check" aria-live="polite"></p>
          <button type="button" class="nj-code-t" aria-expanded="true" aria-controls="nj-code" hidden></button>
          <label class="nj-label nj-code-label" for="nj-code-in"></label>
          <div class="nj-code" id="nj-code">
            <label class="nj-field nj-code-field mu-frame mu-sm"><span class="mu-bg"></span><input id="nj-code-in" class="nj-code-in" type="text" maxlength="20" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" enterkeyhint="go" /></label>
            <button type="button" class="nj-code-go mu-frame mu-sm" hidden><span class="mu-bg"></span><span class="mu-focus"></span><span class="nj-code-go-t"></span></button>
          </div>
          <p class="nj-code-why" aria-live="polite"></p>
        </div>
        <p class="nj-safe"></p>
        <button type="button" class="nj-party" hidden>${ICON.party}<span><b class="nj-party-t"></b><small class="nj-party-n"></small></span>${ICON.chevron}</button>
        <div class="mu-ask-row nj-row">
          <button type="button" class="mu-ask-stay mu-frame mu-sm nj-later"><span class="mu-bg"></span><span class="mu-focus"></span><span class="mu-ask-t"></span></button>
          <button type="button" class="mu-ask-stay mu-frame mu-sm nj-people"><span class="mu-bg"></span><span class="mu-focus"></span>${PEOPLE}<span class="mu-ask-t"></span></button>
          <button type="button" class="mu-ask-go mu-frame mu-sm nj-go" aria-keyshortcuts="Enter"><span class="mu-bg"></span><span class="mu-glow"></span><span class="mu-focus"></span><span class="mu-ask-t"></span><kbd data-pad="north">Enter</kbd></button>
        </div>
      </div>
    </section>`;
  const anchor = document.querySelector('.map-ui.rh') ?? document.getElementById('ui');
  if (anchor) anchor.after(wrap);
  else document.body.append(wrap);
  const q = <T extends HTMLElement>(s: string) => wrap.querySelector<T>(s)!;
  const box = q('.nj-card');
  const input = q<HTMLInputElement>('.nj-input');
  const codeIn = q<HTMLInputElement>('.nj-code-in');
  const codeBox = q('.nj-code');
  const codeT = q<HTMLButtonElement>('.nj-code-t');
  const codeGo = q<HTMLButtonElement>('.nj-code-go');
  const codeWhy = q('.nj-code-why');
  const later = q<HTMLButtonElement>('.nj-later');
  const people = q<HTMLButtonElement>('.nj-people');
  const go = q<HTMLButtonElement>('.nj-go');
  const xBtn = q<HTMLButtonElement>('.nj-x');
  const partyLink = q<HTMLButtonElement>('.nj-party');

  let isOpen = false;
  let from: 'button' | 'night' | 'link' | 'settings' = 'button';
  let closePad: (() => void) | null = null;
  let stopNet: (() => void) | null = null;
  /** The code box said what is wrong (after a press, not while typing). */
  let codeTried = false;
  /** Join (or the code's button) was pressed with no good name: the check says to type one first. */
  let nameTried = false;
  /** The room code came with the link (`?event=`): the card says it is filled in. */
  let linkCode: string | null = null;

  /** What the buttons do now: by the connection's state. */
  const mode = (): 'form' | 'busy' | 'online' | 'offline' => {
    const n = joinNet();
    if (!available() || (n.state === 'refused' && n.refusal === 'offline')) return 'offline';
    if (n.state === 'online') return 'online';
    if (n.state === 'connecting' || n.state === 'retrying') return 'busy';
    return 'form';
  };

  function words(): void {
    q('#nj-title').textContent = t('njTitle');
    q('#nj-sub').textContent = linkCode !== null && joinNet().state !== 'online' ? t('njCodeFrom') : t('njSub');
    q('.nj-label').textContent = t('njName');
    input.placeholder = t('njNameType');
    input.setAttribute('aria-label', t('njNameField'));
    q('.nj-km-l').textContent = `${t('njKhmer')}:`;
    codeT.textContent = t('njCode');
    q('.nj-code-label').textContent = t('njCode');
    codeIn.placeholder = t('njCodeField');
    codeIn.setAttribute('aria-label', t('njCodeField'));
    q('.nj-code-go-t').textContent = t('njCodeGo');
    q('.nj-safe').textContent = t('njSafe');
    q('.nj-safe').hidden = true;
    q('.nj-party-t').textContent = t('njParty');
    q('.nj-party-n').textContent = t('njPartyNote');
    people.querySelector('.mu-ask-t')!.textContent = t('njPlayers');
    xBtn.setAttribute('aria-label', t('njClose'));
    xBtn.title = `${t('njClose')} (Esc)`;
    wrap.lang = lang();
    show();
  }

  /** Everything as the field, the code and the connection are now. */
  function show(): void {
    const n = joinNet();
    const m = mode();
    wrap.dataset.mode = m;
    wrap.dataset.state = n.state;
    q('.nj-state-t').textContent = stateWords();
    q('.nj-state').classList.toggle('is-bad', n.state === 'refused' && m !== 'offline');
    // The name: its Khmer letters (a Latin name), and the check in words.
    const v = input.value;
    const km = v.trim() && !isKhmer(v) ? inKhmer(v) : '';
    q('.nj-km b').textContent = km;
    q('.nj-km').classList.toggle('is-empty', !km);
    const c = checkName(v);
    const check = q('.nj-check');
    if (!v.trim()) {
      check.textContent = nameTried ? t('njNameFirst') : '';
      check.className = nameTried ? 'nj-check is-bad' : 'nj-check';
    } else if (c.ok) {
      check.textContent = `✓ ${t('njNameOk')}`;
      check.className = 'nj-check is-ok';
    } else {
      check.textContent = refusalWords(c.reason);
      check.className = 'nj-check is-bad';
    }
    q('.nj-field').classList.toggle('is-bad', !!v.trim() && !c.ok);
    // The code: what is wrong with it, once pressed.
    const code = tidyCode(codeIn.value);
    codeWhy.textContent = codeTried && codeIn.value.trim() && !code ? t('njCodeBad') : '';
    // The buttons (the party's row is not offered here for now: the owner, November 2026).
    partyLink.hidden = true;
    later.querySelector('.mu-ask-t')!.textContent = t(m === 'form' ? 'njLater' : m === 'offline' ? 'njClose' : 'njLeave');
    people.hidden = m !== 'online';
    const vh = q('.nj-voice');
    vh.hidden = m !== 'online';
    vh.querySelector('span')!.textContent = t('njVoiceHint');
    go.hidden = m === 'offline';
    go.querySelector('.mu-ask-t')!.textContent = t(m === 'online' || m === 'busy' ? 'njClose' : n.state === 'refused' ? 'njAgain' : 'njJoin');
    go.disabled = false;
  }

  /** Pressed with no good name: say so, shake the field and put the cursor there. */
  function nameFirst(): void {
    nameTried = true;
    shake(q('.nj-field'));
    sound('back');
    if (!pad.active) input.focus({ preventScroll: true });
    show();
  }

  /** Join: the name first, then the room code under it (empty: the open room, when the server has one). */
  function tryJoin(): void {
    if (!checkName(input.value).ok) return nameFirst();
    codeTried = true;
    let code: string | null = null;
    if (codeIn.value.trim()) {
      code = tidyCode(codeIn.value);
      if (!code) {
        shake(q('.nj-code-field'));
        sound('back');
        if (!pad.active) codeIn.focus({ preventScroll: true });
        show();
        return;
      }
      codeIn.value = code;
    }
    if (!join(input.value, code)) return nameFirst();
    sound('begin');
    show();
  }
  const useCode = tryJoin;

  function shake(el: HTMLElement): void {
    el.classList.remove('is-shake');
    void el.offsetWidth;
    el.classList.add('is-shake');
  }

  function shut(): void {
    if (!isOpen) return;
    isOpen = false;
    wrap.classList.remove('is-open');
    box.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('mu-asking', 'nj-on');
    closePad?.();
    closePad = null;
    stopNet?.();
    stopNet = null;
    if (wrap.querySelector('.pad-focus')) clearMark();
    if (document.activeElement instanceof HTMLElement && wrap.contains(document.activeElement)) document.activeElement.blur();
  }
  const close = () => {
    if (!isOpen) return;
    shut();
    sound('close');
  };

  const touchy = () => document.body.classList.contains('roam-touch') || matchMedia('(pointer: coarse)').matches;

  input.addEventListener('input', () => {
    if (!(input as HTMLInputElement & { isComposing?: boolean }).isComposing) show();
  });
  input.addEventListener('compositionend', show);
  codeIn.addEventListener('input', () => {
    codeIn.value = codeIn.value.toUpperCase();
    show();
  });
  codeT.addEventListener('click', () => {
    const on = codeBox.hidden;
    codeBox.hidden = !on;
    codeT.setAttribute('aria-expanded', String(on));
    sound('toggle');
    if (on && !pad.active) codeIn.focus({ preventScroll: true });
  });
  codeGo.addEventListener('click', useCode);
  go.addEventListener('click', () => {
    const m = mode();
    if (m === 'online' || m === 'busy') close();
    else tryJoin();
  });
  later.addEventListener('click', () => {
    const m = mode();
    if (m === 'online' || m === 'busy') {
      leave();
      sound('close');
      show();
    } else close();
  });
  people.addEventListener('click', () => {
    shut();
    openPlayers();
  });
  partyLink.addEventListener('click', () => {
    shut();
    openParty();
  });
  xBtn.addEventListener('click', close);
  wrap.addEventListener('pointerdown', (e) => {
    if (isOpen && e.target === wrap) close();
  });

  // ── Keys: its own while open (before the roaming keys and the map's) ──
  addEventListener(
    'keydown',
    (e) => {
      if (!isOpen || document.body.classList.contains('reporting')) return;
      if (e.isComposing || e.keyCode === 229) return;
      const at = document.activeElement;
      const inField = at === input || at === codeIn;
      const inCard = at instanceof HTMLElement && wrap.contains(at);
      const k = e.key;
      let used = true;
      if (k === 'Escape') {
        if (!e.repeat) close();
      } else if (k === 'Enter') {
        // (Enter on a button presses it; in a field, or with nothing in focus, it joins)
        if (at === codeIn) {
          if (!e.repeat) useCode();
        } else if (inField || !inCard || at === box) {
          if (!e.repeat) go.click();
        } else used = false;
      } else if (k === 'Tab') {
        const all = focusables(box);
        if (all.length) {
          const i = all.indexOf(at as HTMLElement);
          all[(i < 0 ? (e.shiftKey ? all.length - 1 : 0) : i + (e.shiftKey ? -1 : 1) + all.length) % all.length].focus();
        }
      } else if (k.startsWith('Arrow') && !inField) {
        if (!e.isTrusted) used = false;
        else {
          const to = inCard && at !== box ? moveFocusIn(box, at as HTMLElement, k.slice(5).toLowerCase() as 'up' | 'down' | 'left' | 'right') : go;
          if (to) {
            to.focus();
            sound('hover');
          }
        }
      } else used = false;
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
    open(o = {}) {
      from = o.from ?? 'button';
      const like = document.querySelector<HTMLElement>('.map-ui.rh') ?? document.getElementById('ui');
      if (like) {
        wrap.style.setProperty('--u', like.style.getPropertyValue('--u') || '1');
        wrap.style.setProperty('--mu-n', like.style.getPropertyValue('--mu-n') || '0');
      }
      if (!isOpen || o.code) {
        const typed = SHOT ? params.get('nyename') : null;
        input.value = typed ?? (joinNet().me?.name || startName());
        // (the room code: the link's, else the one used last)
        linkCode = o.code && from === 'link' ? o.code : null;
        codeIn.value = o.code ?? savedCode();
      }
      codeTried = false;
      nameTried = false;
      words();
      if (isOpen) return;
      isOpen = true;
      wrap.classList.add('is-open');
      box.setAttribute('aria-hidden', 'false');
      document.body.classList.add('mu-asking', 'nj-on');
      sound('open');
      stopNet = joinNet().onChange(show);
      closePad = pad.openLayer(wrap, {
        first: () => (mode() === 'form' && !checkName(input.value).ok ? input : go),
        back: close,
        buttons: {
          north: () => {
            go.click();
            return true;
          },
        },
      });
      if (pad.active) (document.activeElement as HTMLElement | null)?.blur();
      else if (touchy() || SHOT || mode() !== 'form') box.focus({ preventScroll: true });
      else {
        input.focus({ preventScroll: true });
        input.setSelectionRange(input.value.length, input.value.length);
      }
    },
    close: shut,
  };
}

// ── The small gold button (by the calendar's, while roaming) ───────────────────────────────────────────────────

let btn: HTMLButtonElement | null = null;

/** The button is offered: a server is set, the square stands and the night is not over (or he is in a room: the test room any time). */
export function joinOffered(): boolean {
  if (inRoom() || joinNet().room === 'test' || inTestRoom()) return true;
  // (no server set: no button — the setting says so, and the card from it)
  if (!squareShown() || !available()) return false;
  const p = nyePhase();
  return p !== 'over' && p !== 'gone';
}

/** The small gold button (made once; roam/_nyePlayers.ts puts it under the mini-map, beside the calendar's). */
export function joinButton(): HTMLButtonElement {
  if (btn) return btn;
  injectStyle();
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'nj-btn mu-frame mu-sm';
  b.innerHTML = `<span class="mu-bg"></span><span class="mu-focus"></span><i class="nj-dot" aria-hidden="true"></i>${BURST.replace('nj-ico', 'nj-btn-ico')}<span class="nj-btn-t"></span>`;
  b.addEventListener('click', () => {
    b.blur();
    sound('select');
    if (joinOpen()) closeJoin();
    else openJoin({ from: 'button' });
  });
  btn = b;
  const words = () => labelButton();
  onLang(words);
  joinNet().onChange(words);
  words();
  return b;
}

/** The button's line: "Play online", or "Online · 37" (players in the room), its dot by the state; hidden when not offered. */
export function refreshJoinButton(): void {
  labelButton();
}
function labelButton(): void {
  if (!btn) return;
  const n = joinNet();
  const text = n.state === 'online' ? t('njBtnOn', { n: num(Math.max(1, n.count.online)) }) : n.state === 'connecting' || n.state === 'retrying' ? t('njConnecting') : t('njBtn');
  const el = btn.querySelector('.nj-btn-t')!;
  if (el.textContent !== text) el.textContent = text;
  btn.dataset.state = n.state;
  btn.setAttribute('aria-label', `${t('njBtnAria')}: ${stateWords()}`);
  btn.title = t('njBtnAria');
  // (the corner's people button opens the card now: ui.ts; this one under the mini-map is not shown for now)
  btn.hidden = true;
}

// ── Installing: the setting, the test link, a visit that joined last time, shots ───────────────────────────────

let installed = false;

/** Once, after the interface is made (nye/event.ts `installNye`, while the square stands). */
export function installJoin(o: { uiRoot: HTMLElement }): void {
  if (installed) return;
  installed = true;
  injectStyle();
  wireSetting(o.uiRoot);
  const n = joinNet();
  // (checks on the dev server: the state, and open the card)
  if (import.meta.env.DEV) Object.assign(window, { __join: { net: n, open: openJoin, close: closeJoin, words: stateWords } });
  // The room's mic (bottom right, while online): ui/_joinVoice.ts.
  installRoomVoice(n, o.uiRoot);
  if (ASK !== null) return fromUrl();
  // The hidden test link: with a good name, in at once; else the card asks for the name first.
  const code = n.pendingCode ?? null;
  if (code && n.state === 'off') {
    const name = goodName();
    if (name && available()) join(name, code);
    else openJoin({ code: tidyCode(code) ?? code, from: 'link' });
    return;
  }
  // The setting was on last time: in again with the same name (nothing said: the button and the setting show it).
  if (!SHOT && progress.get('nye.online', false, (v): v is boolean => typeof v === 'boolean') && joinOffered() && available() && n.state === 'off') {
    const name = goodName();
    if (name) join(name, savedCode() || null);
  }
}

/** Shots: `nyejoin=` opens what it names. */
function fromUrl(): void {
  const [kind] = (ASK ?? '').split(':');
  // (the list: once he stands, roam/_nyePlayers.ts `fromUrl`, for the distances; on the overview at once)
  if (kind === 'list' || kind === 'player') {
    if (!params.has('roam')) openPlayers();
  }
  else if (kind === 'code') openJoin({ code: params.get('nyecode') ?? 'K7QM2P', from: params.has('event') ? 'link' : 'button' });
  else if (kind !== 'button' && kind !== 'setting') openJoin({ from: 'button' });
}

/**
 * The night came while roaming (roam/_nyePlayers.ts, as roaming starts): the card once (kept), never while in a room,
 * nor when the player turned the setting off, nor in a shot.
 */
export function offerOnce(): void {
  if (SHOT || inRoom() || !nightHeld() || !available()) return;
  if (progress.get('nye.asked', false, (v): v is boolean => typeof v === 'boolean')) return;
  if (progress.get('nye.online', null, (v): v is boolean | null => typeof v === 'boolean') === false) return;
  progress.set('nye.asked', true);
  openJoin({ from: 'night' });
}

/** The Play tab's group (ui.ts makes its markup while the square stands): the switch, the state, the name. */
function wireSetting(root: HTMLElement): void {
  const group = root.querySelector<HTMLElement>('.mu-nj-set');
  if (!group) return;
  const sw = group.querySelector<HTMLButtonElement>('.mu-nj-sw')!;
  const state = group.querySelector<HTMLElement>('.mu-nj-state')!;
  const name = group.querySelector<HTMLElement>('.mu-nj-name')!;
  const edit = group.querySelector<HTMLButtonElement>('.mu-nj-edit')!;
  const fill = () => {
    const on = inRoom();
    sw.setAttribute('aria-checked', String(on));
    sw.disabled = !available();
    state.textContent = stateWords();
    state.classList.toggle('is-bad', joinNet().state === 'refused' && joinNet().refusal !== 'offline');
    const nm = joinNet().me?.name || startName();
    const km = nm && !isKhmer(nm) ? inKhmer(nm) : '';
    name.innerHTML = '';
    if (!nm) name.textContent = t('njSetNone');
    else {
      const b = document.createElement('b');
      b.lang = 'km';
      b.textContent = km || nm;
      name.append(b);
      if (km) name.append(` · ${nm}`);
    }
    edit.textContent = t(nm ? 'njSetEdit' : 'njSetOpen');
  };
  sw.addEventListener('click', () => {
    if (inRoom()) {
      leave();
      sound('toggle');
    } else {
      const nm = goodName();
      sound('toggle');
      if (nm && available()) join(nm, savedCode() || null);
      else openJoin({ from: 'settings' });
    }
    fill();
  });
  edit.addEventListener('click', () => openJoin({ from: 'settings' }));
  onLang(fill);
  joinNet().onChange(fill);
  fill();
  // (a moment after: the name card's name may come later than this)
  window.setTimeout(fill, 1500);
}

// ── The look (on map.css's cards that ask, `.mu-ask`) ──────────────────────────────────────────────────────────

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  style.textContent = `
    .mu-ask.nj { z-index: 66; }
    .nj .mu-ask-card { width: min(calc(500 * var(--px)), 100%); padding: 0; }
    .nj-in { position: relative; display: flex; flex-direction: column; max-height: calc(100vh - 32px); max-height: calc(100dvh - 32px); overflow: auto; overscroll-behavior: contain;
      padding: calc(18 * var(--px)) calc(22 * var(--px)) calc(18 * var(--px)); scrollbar-width: thin; scrollbar-color: var(--mu-line) transparent; }
    .nj-head { padding-right: calc(60 * var(--px)); align-items: flex-start !important; }
    .nj-ico { width: calc(52 * var(--px)) !important; filter: drop-shadow(0 0 calc(8 * var(--px)) rgba(255, 190, 60, 0.45)) !important; }
    .nj .mu-ask-card h2 { font-size: calc(22 * var(--px)); }
    .nj-sub { margin: calc(5 * var(--px)) 0 0 !important; font-size: calc(14 * var(--px)) !important; line-height: 1.45 !important; color: var(--mu-ink2); }
    .nj .mu-ask-orn { margin: calc(12 * var(--px)) 0 calc(10 * var(--px)); }
    .nj-x { position: absolute; right: calc(12 * var(--px)); top: calc(12 * var(--px)); z-index: 1; display: flex; align-items: center; gap: calc(6 * var(--px));
      padding: calc(5 * var(--px)) calc(6 * var(--px)); border: 0; border-radius: calc(6 * var(--px)); background: none; color: var(--mu-ink2); cursor: pointer; outline: none; }
    .nj-x .mu-icon { width: calc(16 * var(--px)); height: calc(16 * var(--px)); }
    .nj-x kbd { min-width: 0; height: calc(19 * var(--px)); font-size: calc(11.5 * var(--px)); }
    .nj-x:hover, .nj-x:focus-visible { color: var(--mu-ink); background: rgba(255, 255, 255, 0.08); }

    /* The state: a dot (grey alone, gold joining, green online, red refused) and its line. */
    .nj-state { display: flex; align-items: center; gap: calc(8 * var(--px)); margin: 0 0 calc(4 * var(--px)) !important; font: 700 calc(14 * var(--px)) / 1.4 var(--mu-font) !important; color: var(--mu-ink) !important; }
    .nj-state.is-bad { color: #ffb4a2 !important; }
    .nj-dot { flex: none; width: calc(9 * var(--px)); height: calc(9 * var(--px)); border-radius: 50%; background: #8d96a4; box-shadow: 0 0 0 calc(2 * var(--px)) rgba(0, 0, 0, 0.25); }
    [data-state='connecting'] .nj-dot, [data-state='retrying'] .nj-dot { background: #ffd54a; animation: nj-blink 1s ease-in-out infinite; }
    [data-state='online'] .nj-dot { background: #6ee08a; box-shadow: 0 0 calc(7 * var(--px)) rgba(110, 224, 138, 0.8); }
    [data-state='refused'] .nj-dot { background: #ff8a70; }
    .nj[data-mode='offline'] .nj-dot { background: #8d96a4; box-shadow: none; }
    .nj[data-mode='offline'] .nj-state { font-weight: 600 !important; color: var(--mu-ink2) !important; }
    @keyframes nj-blink { 50% { opacity: 0.35; } }

    /* The name: a label, the field, its Khmer letters, the check. */
    .nj-form { display: flex; flex-direction: column; }
    .nj[data-mode='online'] .nj-form, .nj[data-mode='busy'] .nj-form, .nj[data-mode='offline'] .nj-form { display: none; }
    .nj-label { margin-top: calc(8 * var(--px)); font: 700 calc(13.5 * var(--px)) / 1.3 var(--mu-display); color: var(--mu-gold-hi); letter-spacing: 0.02em; }
    .nj-field { display: block; margin-top: calc(7 * var(--px)); --mu-edge: var(--mu-line-hi); --mu-shadow: none; }
    .nj-field > .mu-bg { background: rgba(4, 10, 20, 0.55); }
    .nj-field:focus-within { --mu-edge: var(--mu-gold-hi); }
    .nj-field.is-bad { --mu-edge: rgba(255, 138, 112, 0.85); }
    .nj-input, .nj-code-in { display: block; width: 100%; box-sizing: border-box; height: calc(46 * var(--px)); padding: 0 calc(14 * var(--px)); border: 0; background: none; outline: none;
      color: var(--mu-ink); caret-color: var(--mu-gold-hi); font: 600 calc(18 * var(--px)) / 1 'Nunito Sans', 'Kantumruy Pro', system-ui, sans-serif; user-select: text; -webkit-user-select: text; }
    .nj-input::placeholder, .nj-code-in::placeholder { color: var(--mu-dim); font-weight: 400; font-size: calc(15 * var(--px)); letter-spacing: 0; }
    .nj-field.is-shake { animation: nj-shake 0.4s; }
    @keyframes nj-shake { 20% { transform: translateX(calc(-6 * var(--px))); } 45% { transform: translateX(calc(5 * var(--px))); } 70% { transform: translateX(calc(-2 * var(--px))); } }
    .nj-km { display: flex; align-items: baseline; gap: calc(6 * var(--px)); min-height: calc(30 * var(--px)); margin: calc(6 * var(--px)) 0 0 !important; font-size: calc(13 * var(--px)) !important; color: var(--mu-dim) !important; }
    .nj-km b { font: 400 calc(21 * var(--px)) / 1.4 Koulen, 'Kantumruy Pro', serif; color: var(--mu-gold-hi); letter-spacing: 0; }
    .nj-km.is-empty { display: none; }
    .nj-check:empty { display: none; }
    .nj-check { min-height: calc(20 * var(--px)); margin: 0 !important; font-size: calc(13.5 * var(--px)) !important; font-weight: 600; }
    .nj-check.is-ok { color: #8fe3a3 !important; }
    .nj-check.is-bad { color: #ffb4a2 !important; }

    /* "Have a code?" */
    .nj-code-t { align-self: flex-start; margin-top: calc(8 * var(--px)); padding: calc(3 * var(--px)) 0; border: 0; background: none; color: var(--mu-sand); cursor: pointer;
      font: 600 calc(13.5 * var(--px)) / 1.3 var(--mu-font); text-decoration: underline; text-underline-offset: 3px; outline: none; }
    .nj-code-t:hover, .nj-code-t:focus-visible { color: var(--mu-gold-hi); }
    .nj-code { display: flex; gap: calc(8 * var(--px)); align-items: stretch; margin-top: calc(6 * var(--px)); }
    .nj-code[hidden] { display: none; }
    .nj-code-field { flex: 1; margin-top: 0; }
    .nj-code-in { height: calc(42 * var(--px)); font: 700 calc(19 * var(--px)) / 1 var(--mu-display); letter-spacing: 0.22em; text-transform: uppercase; }
    .nj-code-go { flex: none; padding: 0 calc(14 * var(--px)); border: 0; background: none; color: var(--mu-ink); cursor: pointer; outline: none; --mu-edge: var(--mu-btn-edge); --mu-shadow: none;
      font: 700 calc(14 * var(--px)) / 1.2 var(--mu-display); }
    .nj-code-go > .mu-bg { background: var(--mu-btn); }
    .nj-code-go:hover > .mu-bg { background: var(--mu-btn-hi); }
    .nj-code-go:disabled { opacity: 0.45; cursor: default; }
    .nj-code-why { min-height: 0; margin: calc(4 * var(--px)) 0 0 !important; font-size: calc(13 * var(--px)) !important; color: #ffb4a2 !important; }
    .nj-code-why:empty { display: none; }

    .nj-safe { margin: calc(12 * var(--px)) 0 0 !important; padding: calc(8 * var(--px)) calc(10 * var(--px)); border-left: calc(3 * var(--px)) solid rgba(255, 208, 112, 0.5);
      background: rgba(255, 244, 222, 0.05); font-size: calc(12.5 * var(--px)) !important; line-height: 1.45 !important; color: var(--mu-ink2) !important; }
    .nj-party { display: flex; align-items: center; gap: calc(10 * var(--px)); margin-top: calc(10 * var(--px)); padding: calc(8 * var(--px)) calc(10 * var(--px));
      border: 1px solid var(--mu-line-hi); border-radius: calc(6 * var(--px)); background: rgba(255, 244, 222, 0.05); color: var(--mu-ink); text-align: left; cursor: pointer; outline: none; }
    .nj-party[hidden] { display: none; }
    .nj-safe[hidden] { display: none; }
    .nj-voice { display: flex; gap: calc(8 * var(--px)); align-items: flex-start; margin: calc(10 * var(--px)) 0 0 !important; padding: calc(8 * var(--px)) calc(10 * var(--px));
      border-left: calc(3 * var(--px)) solid rgba(143, 227, 163, 0.6); background: rgba(143, 227, 163, 0.06); font-size: calc(13 * var(--px)) !important; line-height: 1.5 !important; color: var(--mu-ink2) !important; }
    .nj-voice svg { flex: none; width: calc(18 * var(--px)); height: calc(18 * var(--px)); margin-top: calc(2 * var(--px)); color: #8fe3a3; }
    .nj-voice[hidden] { display: none; }
    .nj-party > .mu-icon { flex: none; width: calc(26 * var(--px)); height: calc(26 * var(--px)); color: var(--mu-gold-hi); }
    .nj-party > .mu-icon:last-child { width: calc(16 * var(--px)); height: calc(16 * var(--px)); margin-left: auto; color: var(--mu-ink2); }
    .nj-party > span { display: flex; flex-direction: column; min-width: 0; }
    .nj-party b { font: 700 calc(14 * var(--px)) / 1.3 var(--mu-display); color: var(--mu-gold-hi); }
    .nj-party small { font-size: calc(12.5 * var(--px)); line-height: 1.4; color: var(--mu-ink2); }
    .nj-party:hover, .nj-party:focus-visible, .nj-party.pad-focus { border-color: var(--mu-gold-hi); background: rgba(255, 220, 140, 0.1); }
    :lang(km) .nj-party b { font-size: calc(15 * var(--px)); letter-spacing: 0; }
    :lang(km) .nj-party small { font-size: calc(13.5 * var(--px)); line-height: 1.55; }
    .nj .nj-row { margin-top: calc(16 * var(--px)); }
    .nj-row > [hidden] { display: none; }
    .nj-people .mu-icon { width: calc(19 * var(--px)); height: calc(19 * var(--px)); }
    .nj-go:disabled { opacity: 0.45; cursor: default; }
    :lang(km) .nj .mu-ask-card h2 { letter-spacing: 0; line-height: 1.35; }
    :lang(km) .nj-sub, :lang(km) .nj-safe { font-size: calc(14.5 * var(--px)) !important; line-height: 1.6 !important; }
    :lang(km) .nj-label { letter-spacing: 0; font-size: calc(14.5 * var(--px)); }
    :lang(km) .nj-state { font-size: calc(15 * var(--px)) !important; line-height: 1.55 !important; }
    :lang(km) .nj-check, :lang(km) .nj-code-t { font-size: calc(14.5 * var(--px)) !important; }
    body.pad-on .nj kbd:not(.is-pad), body.roam-touch .nj kbd { display: none; }
    body.nj-on .mm, body.nj-on .rh-help { opacity: 0 !important; visibility: hidden !important; }
    body.nj-on.roam-touch .rt, body.nj-on.roam-touch .rtb-wrap { display: none !important; }
    .mu-calm ~ .nj .nj-dot { animation: none; }

    /* A phone: at the top (the keyboard comes up under it), big enough for a thumb. */
    @media (max-width: 639px), (pointer: coarse) {
      .mu-ask.nj { align-items: flex-start; padding: 10px; }
      .nj .mu-ask-card { width: 100%; }
      .nj-in { max-height: calc(100vh - 20px); max-height: calc(100dvh - 20px); padding: 14px 14px 12px; }
      .nj kbd { display: none; }
      .nj-code-t { min-height: 40px; }
    }
    /* A phone on its side: the head smaller, the ornament and the safety line tighter. */
    @media (max-height: 520px) {
      .mu-ask.nj { align-items: flex-start; padding: 8px; }
      .nj-in { max-height: calc(100vh - 16px); max-height: calc(100dvh - 16px); padding: 10px 14px; }
      .nj .mu-ask-orn { display: none; }
      .nj-ico { width: 36px !important; }
      .nj .mu-ask-card h2 { font-size: 19px; }
      .nj-sub { font-size: 12.5px !important; }
      .nj-safe { margin-top: 8px !important; padding: 5px 8px; }
      .nj .nj-row { margin-top: 10px; }
      .nj .mu-ask-row > * { min-height: 42px; }
    }

    /* The small gold button: under the mini-map, beside the calendar's (or in the roaming layer's top right). */
    .nj-btn { position: relative; display: flex; align-items: center; gap: calc(6 * var(--px)); max-width: calc(204 * var(--px)); margin-top: calc(6 * var(--px));
      padding: calc(4 * var(--px)) calc(10 * var(--px)) calc(4 * var(--px)) calc(7 * var(--px)); border: 0; background: none; cursor: pointer; pointer-events: auto; outline: none;
      color: var(--mu-gold-hi); font: 700 calc(12.5 * var(--px)) / 1.2 var(--mu-font); --mu-edge: rgba(255, 208, 112, 0.7); }
    .nj-btn[hidden] { display: none; }
    .nj-btn > .mu-bg { background: color-mix(in srgb, rgba(52, 36, 10, 0.78), rgba(30, 22, 12, 0.8) var(--mu-night)); }
    .nj-btn-ico { flex: none; width: calc(18 * var(--px)); height: calc(18 * var(--px)); }
    .nj-btn .nj-dot { display: none; width: calc(7 * var(--px)); height: calc(7 * var(--px)); }
    .nj-btn[data-state='online'] .nj-dot, .nj-btn[data-state='connecting'] .nj-dot, .nj-btn[data-state='retrying'] .nj-dot { display: block; }
    .nj-btn-t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .nj-btn:hover, .nj-btn:focus-visible { color: #fff2c4; --mu-edge: var(--mu-gold-hi); }
    :lang(km) .nj-btn { font-size: calc(13.5 * var(--px)); line-height: 1.35; }
    .rh > .nj-btn.is-loose { position: absolute; right: calc(22 * var(--px)); top: calc(122 * var(--px)); opacity: 0; visibility: hidden; }
    .rh.is-roam > .nj-btn.is-loose { opacity: 1; visibility: visible; }
    body.photo-mode .nj-btn, body.selfie-mode .nj-btn { display: none; }

    /* The setting (Play tab). */
    .mu-nj-set .mu-set-row:first-of-type { margin-top: calc(6 * var(--px)); }
    .mu-nj-state.is-bad { color: #ffb4a2 !important; }
    .mu-nj-name b { font: 400 calc(15 * var(--px)) / 1.4 Koulen, 'Kantumruy Pro', serif; color: var(--mu-gold-hi); letter-spacing: 0; }
    .mu-nj-name-row { margin-top: calc(10 * var(--px)) !important; }
    .mu-nj-edit { flex: none; min-height: calc(32 * var(--px)); padding: 0 calc(12 * var(--px)); border: 1px solid var(--mu-line-hi); border-radius: calc(5 * var(--px)); background: rgba(255, 244, 222, 0.06);
      color: var(--mu-ink); font: 700 calc(13 * var(--px)) / 1 var(--mu-display); cursor: pointer; outline: none; }
    .mu-nj-edit:hover, .mu-nj-edit:focus-visible { border-color: var(--mu-gold-hi); color: var(--mu-gold-hi); }
    .mu-nj-sw:disabled { opacity: 0.4; cursor: default; }`;
  document.head.append(style);
}
