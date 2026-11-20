import type { NetPeer } from '../../net/types';
import { clearMark, focusables, markFocus, moveFocusIn } from '../pad/nav';
import { pad } from '../pad/pad';
import { inKhmer, joinHere, joinNet, joinSound, stateWords } from './_join';
import { ICON } from './icons';
import { lang, num, onLang, t } from './lang';
import { setSteppedVars } from './shape';

/**
 * New Year online, safety (AWP-35 phase 2, ticket 8; docs/discussion/new-year-online.md "Safety"): the players near
 * you, and Mute, Block and Report on each.
 *
 * - **The list** (the join card's "Players near you", or E on a player: roam/_nyePlayers.ts): the players `NET` has
 *   near him (`NET.peers`, the nearest first, at most `ROWS`), each with the name, its Khmer letters (a Latin name,
 *   khmerName.ts) and how far; the room's state at the top.
 * - **Mute** (their emotes' sounds, later their voice) is a toggle; **Block** asks once ("Block for good?") and hides
 *   them for good on this device (`NET.block`); **Report** asks why (a rude name / bad behaviour), sends
 *   `NET.report`, and they are gone from your screen at once (the client hides them). A line at the foot says what
 *   was done.
 * - `openPlayers(sid)`: that player first, picked (the E choice's "Player: …").
 *
 * While it is up the body has `mu-asking` (roaming holds him still); Esc, ×, a click beside it or the pad's ○ shut
 * it. A pad layer: the d-pad moves between the buttons. A phone: a sheet from the bottom (on its side: at the right).
 * Shots: `nyejoin=list` (with `nyepeers=<n>`), `nyejoin=player` (the nearest picked), `nyeask=block|report` (the
 * first row asks that).
 */

/** Rows at most (the nearest). */
const ROWS = 30;

type Ask = 'block' | 'report';

let panel: ReturnType<typeof makePanel> | null = null;

/** Open the list (`sid`: that player first and picked). */
export function openPlayers(sid?: number): void {
  (panel ??= makePanel()).open(sid);
}
export function closePlayers(): void {
  panel?.close();
}
export const playersOpen = (): boolean => !!panel?.isOpen;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function makePanel() {
  injectStyle();
  const shot = new URLSearchParams(location.search).get('shot') === '1';
  const wrap = document.createElement('div');
  wrap.className = 'map-ui njp';
  if (shot) wrap.classList.add('mu-shot');
  setSteppedVars(wrap);
  wrap.innerHTML = `
    <section class="njp-card mu-frame mu-lg" role="dialog" aria-modal="true" aria-labelledby="njp-title" aria-hidden="true" tabindex="-1">
      <span class="mu-bg"></span>
      <div class="njp-head">
        <div><h2 id="njp-title"></h2><p class="njp-state"><i class="nj-dot" aria-hidden="true"></i><span></span></p></div>
        <button type="button" class="nj-x njp-x">${ICON.close}<kbd data-pad="east">Esc</kbd></button>
      </div>
      <ul class="njp-list"></ul>
      <p class="njp-none" hidden></p>
      <p class="njp-msg" role="status" aria-live="polite"></p>
    </section>`;
  const anchor = document.querySelector('.map-ui.rh') ?? document.getElementById('ui');
  if (anchor) anchor.after(wrap);
  else document.body.append(wrap);
  const box = wrap.querySelector<HTMLElement>('.njp-card')!;
  const list = wrap.querySelector<HTMLUListElement>('.njp-list')!;
  const none = wrap.querySelector<HTMLElement>('.njp-none')!;
  const msg = wrap.querySelector<HTMLElement>('.njp-msg')!;
  const xBtn = wrap.querySelector<HTMLButtonElement>('.njp-x')!;
  const sound = joinSound;

  let isOpen = false;
  let first: number | null = null;
  const asks = new Map<number, Ask>();
  let closePad: (() => void) | null = null;
  let stopNet: (() => void) | null = null;
  let timer = 0;
  let msgTimer = 0;
  /** What the list shows (to draw it again only when that changes). */
  let drawn = '';

  /** The players by distance (the picked one first). */
  function rows(): { p: NetPeer; d: number | null }[] {
    const h = joinHere();
    const out = [...joinNet().peers.values()].map((p) => ({ p, d: h ? Math.hypot(p.x - h.x, p.z - h.z) : null }));
    out.sort((a, b) => (a.p.sid === first ? -1 : b.p.sid === first ? 1 : (a.d ?? 0) - (b.d ?? 0)));
    return out.slice(0, ROWS);
  }

  function say(text: string): void {
    msg.textContent = text;
    window.clearTimeout(msgTimer);
    if (!shot) msgTimer = window.setTimeout(() => (msg.textContent = ''), 6000);
  }

  function draw(force = false): void {
    const n = joinNet();
    wrap.dataset.state = n.state;
    wrap.querySelector('#njp-title')!.textContent = t('njPlayers');
    wrap.querySelector('.njp-state span')!.textContent = stateWords();
    none.textContent = t('njPlayersNone');
    xBtn.setAttribute('aria-label', t('njClose'));
    const rs = rows();
    none.hidden = rs.length > 0;
    const key = `${lang()}|${rs.map((r) => `${r.p.sid}:${r.p.name}:${r.d === null ? '' : Math.round(r.d)}:${n.isMuted(r.p.sid)}:${asks.get(r.p.sid) ?? ''}`).join(',')}`;
    if (!force && key === drawn) return;
    drawn = key;
    // (the focus kept across the drawing: the same button of the same player)
    const at = document.activeElement as HTMLElement | null;
    const keep = at && list.contains(at) ? { sid: at.closest<HTMLElement>('[data-sid]')?.dataset.sid, act: at.dataset.act } : null;
    list.innerHTML = rs
      .map(({ p, d }) => {
        const km = inKhmer(p.name);
        const latin = km !== p.name;
        const muted = n.isMuted(p.sid);
        const ask = asks.get(p.sid);
        const name = esc(p.name);
        const acts =
          ask === 'block'
            ? `<div class="njp-ask"><span><b>${esc(t('njBlockSure'))}</b><small>${esc(t('njBlockNote', { name: p.name }))}</small></span>
                <button type="button" class="njp-b is-bad" data-act="blockGo">${esc(t('njBlock'))}</button><button type="button" class="njp-b" data-act="cancel">${esc(t('njCancel'))}</button></div>`
            : ask === 'report'
              ? `<div class="njp-ask"><span><b>${esc(t('njReportWhy', { name: p.name }))}</b></span>
                <button type="button" class="njp-b is-bad" data-act="reportName">${esc(t('njReportName'))}</button><button type="button" class="njp-b is-bad" data-act="reportAct">${esc(t('njReportAct'))}</button><button type="button" class="njp-b" data-act="cancel">${esc(t('njCancel'))}</button></div>`
              : `<div class="njp-acts"><button type="button" class="njp-b" data-act="mute" aria-pressed="${muted}">${MUTE_ICON(muted)}<span>${esc(t(muted ? 'njUnmute' : 'njMute'))}</span></button><button type="button" class="njp-b" data-act="block">${esc(t('njBlock'))}</button><button type="button" class="njp-b" data-act="report">${esc(t('njReport'))}</button></div>`;
        return `<li class="njp-row${p.sid === first ? ' is-first' : ''}${muted ? ' is-muted' : ''}" data-sid="${p.sid}" aria-label="${esc(t('njPlayerAria', { name: p.name }))}">
          <div class="njp-who"><b${latin ? ' lang="en"' : ' lang="km" class="is-km"'}>${latin ? name : esc(km)}</b>${latin && km ? `<small lang="km">${esc(km)}</small>` : ''}</div>
          <span class="njp-d">${d === null ? '' : esc(t('njMeters', { n: num(Math.round(d)) }))}</span>
          ${acts}</li>`;
      })
      .join('');
    if (keep?.sid) {
      const row = list.querySelector<HTMLElement>(`[data-sid="${keep.sid}"]`);
      const to = row?.querySelector<HTMLElement>(`[data-act="${keep.act}"]`) ?? row?.querySelector<HTMLElement>('button');
      if (to) (pad.active ? markFocus : (e: HTMLElement) => e.focus({ preventScroll: true }))(to);
    }
  }

  list.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-act]');
    const row = b?.closest<HTMLElement>('[data-sid]');
    if (!b || !row) return;
    const sid = Number(row.dataset.sid);
    const n = joinNet();
    const p = n.peers.get(sid);
    const name = p?.name ?? '';
    const act = b.dataset.act;
    if (act === 'mute') {
      const on = !n.isMuted(sid);
      n.mute(sid, on);
      sound('toggle');
      if (on) say(t('njMuted', { name }));
    } else if (act === 'block' || act === 'report') {
      asks.set(sid, act);
      sound('select');
      draw(true);
      list.querySelector<HTMLElement>(`[data-sid="${sid}"] .njp-ask .njp-b`)?.focus({ preventScroll: true });
      return;
    } else if (act === 'cancel') {
      asks.delete(sid);
      sound('back');
      draw(true);
      list.querySelector<HTMLElement>(`[data-sid="${sid}"] [data-act]`)?.focus({ preventScroll: true });
      return;
    } else if (act === 'blockGo') {
      asks.delete(sid);
      n.block(sid);
      sound('close');
      say(t('njBlocked', { name }));
    } else if (act === 'reportName' || act === 'reportAct') {
      asks.delete(sid);
      n.report(sid, act === 'reportName' ? 'name' : 'behaviour');
      sound('close');
      say(t('njReported', { name }));
    }
    draw(true);
    // (the player gone: the focus to the next row's first button, else the card)
    if (!list.contains(document.activeElement)) (list.querySelector<HTMLElement>('[data-act]') ?? box).focus({ preventScroll: true });
  });

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
    window.clearInterval(timer);
    asks.clear();
    if (wrap.querySelector('.pad-focus')) clearMark();
    if (document.activeElement instanceof HTMLElement && wrap.contains(document.activeElement)) document.activeElement.blur();
  }
  const close = () => {
    if (!isOpen) return;
    shut();
    sound('close');
  };
  xBtn.addEventListener('click', close);
  wrap.addEventListener('pointerdown', (e) => {
    if (isOpen && e.target === wrap) close();
  });
  addEventListener(
    'keydown',
    (e) => {
      if (!isOpen || document.body.classList.contains('reporting')) return;
      const at = document.activeElement;
      const k = e.key;
      let used = true;
      if (k === 'Escape') {
        if (!e.repeat) {
          // (a question open: Esc answers no; else it shuts)
          const row = at instanceof HTMLElement ? at.closest<HTMLElement>('[data-sid]') : null;
          const sid = row ? Number(row.dataset.sid) : NaN;
          if (asks.has(sid)) {
            asks.delete(sid);
            draw(true);
          } else close();
        }
      } else if (k === 'Tab') {
        const all = focusables(box);
        if (all.length) {
          const i = all.indexOf(at as HTMLElement);
          all[(i < 0 ? (e.shiftKey ? all.length - 1 : 0) : i + (e.shiftKey ? -1 : 1) + all.length) % all.length].focus();
        }
      } else if (k.startsWith('Arrow') && e.isTrusted) {
        const from = at instanceof HTMLElement && box.contains(at) && at !== box ? at : null;
        const to = from ? moveFocusIn(box, from, k.slice(5).toLowerCase() as 'up' | 'down' | 'left' | 'right') : list.querySelector<HTMLElement>('[data-act]');
        to?.focus();
      } else used = k === 'Enter' || k === ' ' ? false : true;
      e.stopImmediatePropagation();
      if (used) e.preventDefault();
    },
    true,
  );
  onLang(() => isOpen && draw(true));

  return {
    get isOpen() {
      return isOpen;
    },
    open(sid?: number) {
      first = sid ?? null;
      const like = document.querySelector<HTMLElement>('.map-ui.rh') ?? document.getElementById('ui');
      if (like) {
        wrap.style.setProperty('--u', like.style.getPropertyValue('--u') || '1');
        wrap.style.setProperty('--mu-n', like.style.getPropertyValue('--mu-n') || '0');
      }
      wrap.lang = lang();
      msg.textContent = '';
      // (a shot: `nyeask=block|report` asks that of the first row)
      const ask = shot ? new URLSearchParams(location.search).get('nyeask') : null;
      if (ask === 'block' || ask === 'report') {
        const sid = first ?? rows()[0]?.p.sid;
        if (sid !== undefined) asks.set(sid, ask);
      }
      draw(true);
      if (isOpen) return;
      isOpen = true;
      wrap.classList.add('is-open');
      box.setAttribute('aria-hidden', 'false');
      document.body.classList.add('mu-asking', 'nj-on');
      sound('open');
      stopNet = joinNet().onChange(() => draw());
      // (the distances once a second)
      timer = window.setInterval(() => draw(), 1000);
      closePad = pad.openLayer(wrap, { first: () => list.querySelector<HTMLElement>('[data-act]') ?? xBtn, back: close });
      if (!pad.active) box.focus({ preventScroll: true });
      if (first !== null) list.querySelector<HTMLElement>('.is-first')?.scrollIntoView({ block: 'nearest' });
    },
    close: shut,
  };
}

/** A speaker, crossed out while muted. */
const MUTE_ICON = (muted: boolean) =>
  `<svg class="mu-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 9h4l5-4v14l-5-4H3z"/>${
    muted
      ? '<path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
      : '<path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
  }</svg>`;

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  style.textContent = `
    .njp { position: fixed; inset: 0; z-index: 66; display: flex; justify-content: flex-end; align-items: flex-start; padding: calc(80 * var(--px)) calc(16 * var(--px)) 16px; pointer-events: none; }
    .njp.is-open { pointer-events: auto; }
    .njp-card { position: relative; display: flex; flex-direction: column; width: min(calc(420 * var(--px)), 100%); max-height: 100%; box-sizing: border-box;
      padding: calc(16 * var(--px)) calc(16 * var(--px)) calc(12 * var(--px)); outline: none; opacity: 0; visibility: hidden; transform: translateX(calc(14 * var(--px)));
      transition: opacity 0.2s, transform 0.3s var(--mu-ease), visibility 0s 0.3s; --mu-edge: rgba(255, 208, 112, 0.5); }
    .njp.is-open .njp-card { opacity: 1; visibility: visible; transform: none; transition: opacity 0.22s, transform 0.35s var(--mu-ease), visibility 0s; }
    .njp-card > .mu-bg { background: var(--mu-panel-strong); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
    .njp-head { position: relative; display: flex; align-items: flex-start; justify-content: space-between; gap: calc(10 * var(--px)); padding-bottom: calc(10 * var(--px));
      border-bottom: 1px solid var(--mu-line); }
    .njp-head h2 { margin: 0; font: 700 calc(20 * var(--px)) / 1.2 var(--mu-display); color: var(--mu-ink); }
    .njp .nj-x { position: static; flex: none; }
    .njp-state { display: flex; align-items: center; gap: calc(7 * var(--px)); margin: calc(4 * var(--px)) 0 0; font-size: calc(12.5 * var(--px)); color: var(--mu-ink2); }
    .njp[data-state='online'] .nj-dot { background: #6ee08a; box-shadow: 0 0 calc(7 * var(--px)) rgba(110, 224, 138, 0.8); }
    .njp-list { flex: 1 1 auto; min-height: 0; margin: 0; padding: calc(4 * var(--px)) calc(2 * var(--px)) 0 0; list-style: none; overflow: auto; overscroll-behavior: contain;
      scrollbar-width: thin; scrollbar-color: var(--mu-line) transparent; }
    .njp-row { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: calc(4 * var(--px)) calc(10 * var(--px)); padding: calc(9 * var(--px)) calc(8 * var(--px));
      border-bottom: 1px solid rgba(255, 244, 222, 0.07); border-radius: calc(4 * var(--px)); }
    .njp-row.is-first { background: rgba(255, 208, 112, 0.09); box-shadow: inset calc(3 * var(--px)) 0 0 rgba(255, 208, 112, 0.75); }
    .njp-who { display: flex; align-items: baseline; gap: calc(8 * var(--px)); min-width: 0; }
    .njp-who b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 700 calc(15.5 * var(--px)) / 1.35 var(--mu-font); color: var(--mu-ink); }
    .njp-who b.is-km { font: 400 calc(17 * var(--px)) / 1.45 Koulen, 'Kantumruy Pro', serif; color: var(--mu-gold-hi); letter-spacing: 0; }
    .njp-who small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 400 calc(15 * var(--px)) / 1.45 Koulen, 'Kantumruy Pro', serif; color: var(--mu-gold-hi); }
    .njp-row.is-muted .njp-who b { color: var(--mu-ink2); }
    .njp-d { font: 600 calc(12.5 * var(--px)) / 1 var(--mu-font); color: var(--mu-dim); font-variant-numeric: tabular-nums; }
    .njp-acts, .njp-ask { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: calc(6 * var(--px)); }
    .njp-ask > span { flex: 1 1 100%; display: flex; flex-direction: column; gap: calc(2 * var(--px)); font-size: calc(13.5 * var(--px)); color: var(--mu-ink); }
    .njp-ask small { font-size: calc(12 * var(--px)); color: var(--mu-dim); }
    .njp-b { display: inline-flex; align-items: center; gap: calc(5 * var(--px)); min-height: calc(32 * var(--px)); padding: 0 calc(11 * var(--px)); border: 1px solid var(--mu-line-hi);
      border-radius: calc(5 * var(--px)); background: rgba(255, 244, 222, 0.06); color: var(--mu-ink); font: 700 calc(12.5 * var(--px)) / 1.2 var(--mu-display); cursor: pointer; outline: none;
      transition: background 0.15s, border-color 0.15s, color 0.15s; }
    .njp-b .mu-icon { width: calc(15 * var(--px)); height: calc(15 * var(--px)); }
    .njp-b:hover { background: rgba(255, 244, 222, 0.13); }
    .njp-b:focus-visible, .njp-b.pad-focus { outline: 2px solid rgba(255, 244, 214, 0.95); outline-offset: 2px; }
    .njp-b[aria-pressed='true'] { color: var(--mu-gold-hi); border-color: var(--mu-gold-hi); background: rgba(58, 44, 20, 0.75); }
    .njp-b.is-bad { color: #ffd0c4; border-color: rgba(255, 138, 112, 0.7); background: rgba(120, 36, 20, 0.45); }
    .njp-b.is-bad:hover { background: rgba(150, 44, 24, 0.65); }
    .njp-none { margin: calc(16 * var(--px)) 0 calc(8 * var(--px)); text-align: center; font-size: calc(14 * var(--px)); color: var(--mu-dim); }
    .njp-none[hidden] { display: none; }
    .njp-msg { min-height: 0; margin: calc(8 * var(--px)) 0 0; font-size: calc(13 * var(--px)); font-weight: 600; color: #8fe3a3; }
    .njp-msg:empty { display: none; }
    :lang(km) .njp-head h2 { line-height: 1.4; letter-spacing: 0; }
    :lang(km) .njp-state, :lang(km) .njp-ask > span, :lang(km) .njp-msg { font-size: calc(14 * var(--px)); line-height: 1.55; }
    :lang(km) .njp-b { font-size: calc(13.5 * var(--px)); line-height: 1.4; letter-spacing: 0; }
    body.pad-on .njp kbd:not(.is-pad), body.roam-touch .njp kbd { display: none; }
    /* A phone upright: a sheet from the bottom, big enough for a thumb. */
    @media (max-width: 639px), (pointer: coarse) {
      .njp { align-items: flex-end; justify-content: center; padding: 10px; }
      .njp-card { width: 100%; max-height: 72vh; max-height: 72dvh; padding: 12px; transform: translateY(14px); }
      .njp-b { min-height: 40px; padding: 0 12px; }
      .njp kbd { display: none; }
    }
    /* A phone on its side: at the right, the whole height. */
    @media (max-height: 520px) {
      .njp { align-items: stretch; justify-content: flex-end; padding: 8px; }
      .njp-card { width: min(400px, 60vw); max-height: none; }
      .njp-row { padding: 6px; }
    }`;
  document.head.append(style);
}
