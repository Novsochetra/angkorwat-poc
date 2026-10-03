import { ICON } from '../ui/icons';
import { num, onLang, t } from '../ui/lang';
import type { Judgement } from './_raceRowGame';

/**
 * The boat race's interface (roam/_raceRow.ts), in the roaming layer:
 *
 * - **The course** (top middle): two lanes, a little ngo in each (his crew's
 *   purple, the other boat's teal) moving towards the finish flag, and how far
 *   his boat still has to go.
 * - **The drum** (bottom middle): the boat's drum seen from above, a gold ring
 *   closing on it as the next beat comes (it meets the rim on the beat) and the
 *   drum's skin jumping as it is struck; under it the keys (Space, E: the pad's
 *   ✕ and □) and "Paddle as the drum strikes". A click or a tap on it is a
 *   stroke too (a touch screen's paddle).
 * - **The marks** over the drum ("Perfect!", "Good!", "Too early"…, in the
 *   player's language) and the run of beats on time beside it.
 * - **Big words** in the middle: the count ("Ready…", 3, 2, 1, "Go!") and the
 *   caller's "Faster!" / "Push!".
 * - **The result** (a card in the middle): won or beaten, by how far, the time
 *   and the strokes, the prize; "Race again" (Space) and "Step ashore" (E).
 *
 * While it is up the body has `roam-race`: the tool bar, the explorer menu
 * and the touch stick and buttons go (the drum is the touch paddle); the key
 * help (bottom left) shows the race's keys (`keys()` in _raceRow.ts). Every word comes from ui/lang.ts (`race…`), filled again when the
 * language changes. Per frame only transforms change, and only when they move
 * (`frame`).
 */

export interface RaceUi {
  /** Show it (the race on) or not. */
  show(on: boolean): void;
  /** The course: his and the other boat's way (0‥1), his metres to go. */
  course(us: number, them: number, toGo: number): void;
  /** The drum: how far the ring has closed (0 the last beat … 1 the next), how long since the drum was struck (s). */
  drum(k: number, since: number): void;
  /** The drum and its keys shown (the count and the race) or not (the result). */
  drumOn(on: boolean): void;
  /** A mark over the drum, and the run of beats on time. */
  judge(j: Judgement, wild: boolean, streak: number): void;
  /** Big words in the middle for a moment ('' clears them). */
  big(text: string, kind?: 'count' | 'go' | 'call'): void;
  /** The result card (null: none). */
  result(r: { won: boolean; margin: number; time: number; counts: { perfect: number; good: number; ok: number; miss: number }; prize: string | null; again: boolean } | null): void;
  /** A press on the drum (touch or mouse): its moment (`performance.now()` ms). */
  onDrum: ((at: number) => void) | null;
  /** A press on the result's buttons. */
  onAgain: (() => void) | null;
  onOut: (() => void) | null;
}

export function createRaceUi(layer: HTMLElement, shot: boolean): RaceUi {
  injectStyle();
  const el = document.createElement('div');
  el.className = shot ? 'rr mu-shot' : 'rr';
  el.hidden = true;
  el.innerHTML = `
    <div class="rr-course mu-frame mu-sm" aria-hidden="true">
      <span class="mu-bg"></span>
      <div class="rr-lanes">
        <div class="rr-lane"><span class="rr-name rr-name-us"></span><i class="rr-boat rr-us">${BOAT}</i></div>
        <div class="rr-lane"><span class="rr-name rr-name-them"></span><i class="rr-boat rr-them">${BOAT}</i></div>
        <i class="rr-line"></i>
        <i class="rr-flag">${FLAG}</i>
      </div>
      <span class="rr-togo"></span>
    </div>
    <div class="rr-big" role="status" aria-live="assertive"></div>
    <div class="rr-pad">
      <div class="rr-mark" aria-live="polite"></div>
      <button type="button" class="rr-drum" aria-keyshortcuts="Space E">
        <span class="rr-ring"></span>
        <span class="rr-face">${DRUM}</span>
      </button>
      <div class="rr-streak"><b></b><span></span></div>
      <div class="rr-keys"><kbd data-pad="south">Space</kbd><kbd data-pad="west">E</kbd><span class="rr-hint"></span></div>
    </div>
    <section class="rr-card mu-frame mu-lg" role="dialog" aria-labelledby="rr-title">
      <span class="mu-bg"></span>
      <div class="rr-head"><span class="rr-cup">${CUP}</span><h2 id="rr-title"></h2></div>
      <p class="rr-by"></p>
      <div class="mu-orn" aria-hidden="true"><i></i>${ICON.diamond}<i></i></div>
      <p class="rr-stats"></p>
      <p class="rr-prize"></p>
      <div class="mu-ask-row">
        <button type="button" class="mu-ask-stay mu-frame mu-sm rr-out" aria-keyshortcuts="E"><span class="mu-bg"></span><span class="rr-t-out"></span><kbd data-pad="west">E</kbd></button>
        <button type="button" class="mu-ask-go mu-frame mu-sm rr-again" aria-keyshortcuts="Space"><span class="mu-bg"></span><span class="mu-glow"></span><span class="rr-t-again"></span><kbd data-pad="south">Space</kbd></button>
      </div>
    </section>`;
  layer.append(el);
  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const us = q('.rr-us');
  const them = q('.rr-them');
  const togo = q('.rr-togo');
  const bigEl = q('.rr-big');
  const pad = q('.rr-pad');
  const drumBtn = q<HTMLButtonElement>('.rr-drum');
  const ring = q('.rr-ring');
  const face = q('.rr-face');
  const mark = q('.rr-mark');
  const streakEl = q('.rr-streak');
  const card = q('.rr-card');
  const againBtn = q<HTMLButtonElement>('.rr-again');
  const outBtn = q<HTMLButtonElement>('.rr-out');
  let shown = false;
  let lastUs = -1;
  let lastThem = -1;
  let lastToGo = -1;
  let lastRing = -1;
  let lastHit = -1;
  let lastResult: Parameters<RaceUi['result']>[0] = null;

  const words = () => {
    q('.rr-name-us').textContent = t('raceUs');
    q('.rr-name-them').textContent = t('raceThem');
    q('.rr-hint').textContent = t('raceHint');
    q('.rr-streak span').textContent = t('raceStreak');
    q('.rr-t-again').textContent = t('raceAgain');
    q('.rr-t-out').textContent = t('raceOut');
    drumBtn.setAttribute('aria-label', t('raceHint'));
    lastToGo = -1;
    if (lastResult) ui.result(lastResult);
  };

  const ui: RaceUi = {
    onDrum: null,
    onAgain: null,
    onOut: null,
    show(on) {
      if (on === shown) return;
      shown = on;
      el.hidden = !on;
      document.body.classList.toggle('roam-race', on);
      if (!on) {
        ui.result(null);
        ui.big('');
        mark.textContent = '';
      }
    },
    course(a, b, toGo) {
      // (moved only when they move half a pixel's worth)
      const ua = Math.round(a * 400) / 400;
      const ub = Math.round(b * 400) / 400;
      if (ua !== lastUs) {
        lastUs = ua;
        us.style.setProperty('--p', String(ua));
      }
      if (ub !== lastThem) {
        lastThem = ub;
        them.style.setProperty('--p', String(ub));
      }
      const m = Math.max(0, Math.ceil(toGo));
      if (m !== lastToGo) {
        lastToGo = m;
        togo.textContent = t('raceMetres', { n: num(m) });
      }
    },
    drum(k, since) {
      const r = Math.round(Math.min(1, Math.max(0, k)) * 100) / 100;
      if (r !== lastRing) {
        lastRing = r;
        // (the ring closes from twice the drum to its rim; it fades in as it comes)
        ring.style.setProperty('--k', String(r));
      }
      const h = since < 0.18 ? Math.round((1 - since / 0.18) * 20) / 20 : 0;
      if (h !== lastHit) {
        lastHit = h;
        face.style.setProperty('--hit', String(h));
      }
    },
    drumOn(on) {
      pad.classList.toggle('is-off', !on);
    },
    judge(j, wild, streak) {
      const key = wild ? 'raceMiss' : j === 'perfect' ? 'racePerfect' : j === 'good' ? 'raceGood' : j === 'early' ? 'raceEarly' : j === 'late' ? 'raceLate' : 'raceMiss';
      mark.textContent = t(key);
      mark.dataset.j = wild ? 'miss' : j;
      // (its own place is the stylesheet's, by the view's size: the pop moves and scales round it)
      if (!shot) mark.animate([{ translate: '0 6px', scale: '0.8', opacity: 0 }, { translate: '0 0', scale: '1.08', opacity: 1, offset: 0.18 }, { translate: '0 0', scale: '1', opacity: 1, offset: 0.7 }, { translate: '0 -8px', scale: '1', opacity: 0 }], { duration: 650, easing: 'ease-out', fill: 'forwards' });
      streakEl.classList.toggle('is-on', streak >= 3);
      if (streak >= 3) streakEl.querySelector('b')!.textContent = num(streak);
    },
    big(text, kind = 'count') {
      bigEl.textContent = text;
      bigEl.dataset.kind = kind;
      if (!text || shot) return;
      bigEl.animate(
        kind === 'call'
          ? [{ scale: '0.7', opacity: 0 }, { scale: '1.1', opacity: 1, offset: 0.2 }, { scale: '1', translate: '0 0', opacity: 1, offset: 0.75 }, { scale: '1', translate: '0 -12px', opacity: 0 }]
          : [{ scale: '1.5', opacity: 0 }, { scale: '1', opacity: 1, offset: 0.25 }, { scale: '1', opacity: 1, offset: 0.7 }, { scale: '0.9', opacity: 0 }],
        { duration: kind === 'call' ? 1300 : kind === 'go' ? 900 : 820, easing: 'ease-out', fill: 'forwards' },
      );
    },
    result(r) {
      lastResult = r;
      card.classList.toggle('is-open', !!r);
      el.classList.toggle('is-over', !!r);
      if (!r) return;
      card.classList.toggle('is-won', r.won);
      q('#rr-title').textContent = t(r.won ? 'raceWin' : 'raceLose');
      q('.rr-by').textContent = t(r.won ? 'raceWinBy' : 'raceLoseBy', { n: num(Math.max(1, Math.round(r.margin))) });
      const time = Number.isFinite(r.time) ? `${t('raceTime', { s: num(r.time.toFixed(1)) })} · ` : '';
      q('.rr-stats').textContent = time + t('raceStats', { p: num(r.counts.perfect), g: num(r.counts.good), m: num(r.counts.miss + r.counts.ok) });
      const prize = q('.rr-prize');
      prize.hidden = !r.prize;
      prize.textContent = r.prize ? t('racePrize', { riel: r.prize }) : '';
      againBtn.hidden = !r.again;
    },
  };

  drumBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ui.onDrum?.(e.timeStamp);
  });
  // (the keys do it from the roaming keys: the button only takes pointers, not the focus)
  drumBtn.addEventListener('click', (e) => e.preventDefault());
  drumBtn.tabIndex = -1;
  againBtn.addEventListener('click', () => ui.onAgain?.());
  outBtn.addEventListener('click', () => ui.onOut?.());
  words();
  onLang(words);
  return ui;
}

/** A little ngo seen from the side: a long hull, the bow post swept up ahead, paddles. */
const BOAT = `<svg viewBox="0 0 40 12" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" d="M2 6h30l3-4h2v2l-2 3-2 3H6L3 8z"/><path fill="#e8b84a" d="M5 6h27v1H5z"/><path fill="rgba(0,0,0,0.35)" d="M8 9h2v2H8zM13 9h2v2h-2zM18 9h2v2h-2zM23 9h2v2h-2zM28 9h2v2h-2z"/></svg>`;
/** The finish flag (red on a pole). */
const FLAG = `<svg viewBox="0 0 12 16" aria-hidden="true" shape-rendering="crispEdges"><path fill="#e8e0cc" d="M2 1h1v15H2z"/><path fill="#d8312a" d="M3 2h8v5H3z"/><path fill="#f4f0e6" d="M3 4h8v1H3z"/></svg>`;
/** The boat's drum from above: a red body, gold bands, the cream skin (its middle jumps when struck). */
const DRUM = `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#7a1c18"/><circle cx="32" cy="32" r="28" fill="#a82a22"/><circle cx="32" cy="32" r="25" fill="none" stroke="#e8b84a" stroke-width="3"/><circle class="rr-skin" cx="32" cy="32" r="21" fill="#efe3c6"/><circle cx="32" cy="32" r="13" fill="none" stroke="#d8c8a0" stroke-width="1.5"/><circle cx="32" cy="32" r="5" fill="#c8b48a"/></svg>`;
/** A trophy for the result (the winners' cup on the judges' table). */
const CUP = `<svg viewBox="0 0 24 24" aria-hidden="true" shape-rendering="crispEdges"><path fill="#f7b733" d="M6 3h12v2h3v4l-3 3h-1l-2 2v3h3v2H6v-2h3v-3l-2-2H6L3 9V5h3zm-1 4v1l1 1V7zm13 0v2l1-1V7z"/><path fill="#ffe07c" d="M8 4h2v6H8z"/></svg>`;

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  style.textContent = `
    .rr { position: absolute; inset: 0; pointer-events: none; }
    .rr[hidden] { display: none; }
    /* While racing the walking tools step aside (the drum is the touch paddle). */
    body.roam-race .rtb-wrap, body.roam-race .rtb-keys, body.roam-race .rxm, body.roam-race .rh-prompt, body.roam-race .mu-fest { display: none !important; }
    body.roam-race.roam-touch .rt { display: none !important; }

    /* The course, top middle (a touch screen's and a small view's: along the bottom, below). */
    .rr-course { position: absolute; left: 50%; top: calc(16 * var(--px)); transform: translateX(-50%); display: flex; align-items: center; gap: calc(14 * var(--px));
      padding: calc(9 * var(--px)) calc(16 * var(--px)) calc(9 * var(--px)) calc(14 * var(--px)); transition: opacity 0.4s; }
    .rr-lanes { position: relative; width: calc(300 * var(--px)); display: grid; gap: calc(5 * var(--px)); }
    .rr-lane { position: relative; height: calc(18 * var(--px)); border-radius: calc(3 * var(--px)); background: rgba(120, 190, 220, 0.16); }
    .rr-name { position: absolute; left: calc(6 * var(--px)); top: 50%; transform: translateY(-50%); font: 600 calc(11 * var(--px)) / 1 var(--mu-font); color: var(--mu-ink2); opacity: 0.75; white-space: nowrap; }
    .rr-boat { --p: 0; position: absolute; top: 50%; left: calc(var(--p) * (100% - 40 * var(--px))); width: calc(40 * var(--px)); height: calc(12 * var(--px));
      transform: translateY(-50%); filter: drop-shadow(0 calc(1 * var(--px)) 0 rgba(0, 0, 0, 0.4)); }
    .rr-boat svg { display: block; width: 100%; height: 100%; }
    .rr-us { color: #b066e0; }
    .rr-them { color: #2ec4b6; }
    .rr-line { position: absolute; right: calc(2 * var(--px)); top: calc(-3 * var(--px)); bottom: calc(-3 * var(--px)); width: calc(2 * var(--px));
      background: repeating-linear-gradient(180deg, #f4f0e6 0 calc(3 * var(--px)), #d8312a calc(3 * var(--px)) calc(6 * var(--px))); }
    .rr-flag { position: absolute; right: calc(-14 * var(--px)); top: calc(-12 * var(--px)); width: calc(12 * var(--px)); height: calc(16 * var(--px)); }
    .rr-flag svg { display: block; width: 100%; height: 100%; }
    .rr-togo { min-width: calc(64 * var(--px)); text-align: right; font: 700 calc(17 * var(--px)) / 1 var(--mu-display); color: var(--mu-gold-hi); text-shadow: 0 calc(2 * var(--px)) 0 rgba(0, 0, 0, 0.35); }
    .rr.is-over .rr-course { opacity: 0; }

    /* Big words, the middle of the view. */
    .rr-big { position: absolute; left: 50%; top: 38%; transform: translate(-50%, -50%); opacity: 0; white-space: nowrap;
      font: 700 calc(72 * var(--px)) / 1.2 var(--mu-display); color: var(--mu-ink); letter-spacing: 0.02em;
      text-shadow: 0 calc(4 * var(--px)) 0 rgba(0, 0, 0, 0.35), 0 0 calc(24 * var(--px)) rgba(255, 190, 90, 0.45); }
    .rr-big[data-kind='go'] { color: var(--mu-gold-hi); font-size: calc(92 * var(--px)); }
    .rr-big[data-kind='call'] { color: var(--mu-gold-hi); font-size: calc(46 * var(--px)); top: 30%; }
    .mu-shot .rr-big, .rr-big.is-still { opacity: 1; }

    /* The drum, bottom middle. */
    /* (bottom right: under the right thumb on a touch screen; the view's middle stays his) */
    .rr-pad { position: absolute; right: calc(64 * var(--px)); bottom: calc(30 * var(--px)); display: grid; justify-items: center; gap: calc(12 * var(--px)); transition: opacity 0.35s, transform 0.35s var(--mu-ease); }
    .rr-pad.is-off { opacity: 0; transform: translateY(calc(16 * var(--px))); }
    .rr-drum { position: relative; width: calc(96 * var(--px)); height: calc(96 * var(--px)); padding: 0; border: 0; background: none; cursor: pointer; pointer-events: auto; touch-action: none;
      -webkit-tap-highlight-color: transparent; outline: none; }
    .rr-face { position: absolute; inset: 0; border-radius: 50%; --hit: 0; transform: scale(calc(1 + 0.1 * var(--hit)));
      filter: drop-shadow(0 calc(3 * var(--px)) 0 rgba(0, 0, 0, 0.35)) drop-shadow(0 0 calc(18 * var(--px) * var(--hit)) rgba(255, 210, 110, 0.9)); }
    .rr-face svg { display: block; width: 100%; height: 100%; }
    .rr-ring { --k: 0; position: absolute; inset: calc(-2 * var(--px)); border-radius: 50%; border: calc(4 * var(--px)) solid var(--mu-gold-hi);
      transform: scale(calc(2.1 - 1.1 * var(--k))); opacity: calc(0.15 + 0.85 * var(--k)); box-shadow: 0 0 calc(10 * var(--px)) rgba(255, 200, 90, 0.5); }
    .rr-keys { display: flex; align-items: center; gap: calc(6 * var(--px)); padding: calc(4 * var(--px)) calc(10 * var(--px)); border-radius: calc(6 * var(--px));
      background: rgba(8, 16, 28, 0.55); font: 600 calc(13 * var(--px)) / 1.2 var(--mu-font); color: var(--mu-ink); white-space: nowrap; }
    .rr-keys kbd { display: inline-grid; place-items: center; min-width: calc(20 * var(--px)); height: calc(20 * var(--px)); padding: 0 calc(5 * var(--px)); box-sizing: border-box;
      font: 600 calc(11.5 * var(--px)) / 1 var(--mu-display); color: var(--mu-gold-hi); background: rgba(255, 244, 222, 0.1); border: 1px solid rgba(255, 208, 112, 0.7);
      border-bottom-width: 2px; border-radius: calc(3 * var(--px)); }
    .rr-hint { margin-left: calc(4 * var(--px)); }
    body.roam-touch .rr-keys kbd { display: none; }
    .rr-mark { position: absolute; left: 50%; bottom: calc(100% + 34 * var(--px)); transform: translate(-50%, 0); opacity: 0; white-space: nowrap;
      font: 700 calc(26 * var(--px)) / 1.2 var(--mu-display); color: var(--mu-ink); text-shadow: 0 calc(3 * var(--px)) 0 rgba(0, 0, 0, 0.4); }
    .rr-mark[data-j='perfect'] { color: var(--mu-gold-hi); text-shadow: 0 calc(3 * var(--px)) 0 rgba(0, 0, 0, 0.4), 0 0 calc(14 * var(--px)) rgba(255, 196, 80, 0.7); }
    .rr-mark[data-j='good'] { color: #bfe8a0; }
    .rr-mark[data-j='early'], .rr-mark[data-j='late'] { color: #f2d49a; }
    .rr-mark[data-j='miss'] { color: #f0a090; }
    .mu-shot .rr-mark { opacity: 1; transform: translate(-50%, 0); }
    .rr-streak { position: absolute; left: calc(100% + 14 * var(--px)); top: calc(18 * var(--px)); display: grid; justify-items: start; opacity: 0; transition: opacity 0.3s;
      color: var(--mu-gold-hi); text-shadow: 0 calc(2 * var(--px)) 0 rgba(0, 0, 0, 0.4); }
    .rr-streak.is-on { opacity: 1; }
    .rr-streak b { font: 700 calc(30 * var(--px)) / 1 var(--mu-display); }
    .rr-streak span { font: 600 calc(12 * var(--px)) / 1.2 var(--mu-font); color: var(--mu-ink2); white-space: nowrap; }
    .rr-pad > .rr-streak { position: absolute; left: auto; right: calc(100% + 30 * var(--px)); top: calc(30 * var(--px)); justify-items: end; }

    /* The result. */
    .rr-card { position: absolute; left: 50%; top: 34%; width: min(calc(440 * var(--px)), calc(100vw - 32px)); box-sizing: border-box;
      padding: calc(20 * var(--px)) calc(22 * var(--px)) calc(22 * var(--px)); pointer-events: auto; --mu-edge: rgba(255, 208, 112, 0.5);
      opacity: 0; visibility: hidden; transform: translate(-50%, calc(-50% + 10 * var(--px))) scale(0.96); transition: opacity 0.2s, transform 0.3s var(--mu-ease), visibility 0s 0.3s; }
    .rr-card.is-open { opacity: 1; visibility: visible; transform: translate(-50%, -50%); transition: opacity 0.3s, transform 0.45s var(--mu-ease), visibility 0s; }
    .rr-card > .mu-bg { background: var(--mu-panel-strong); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
    .rr-head { display: flex; align-items: center; gap: calc(12 * var(--px)); }
    .rr-cup { display: none; width: calc(40 * var(--px)); height: calc(40 * var(--px)); filter: drop-shadow(0 0 calc(10 * var(--px)) rgba(255, 196, 110, 0.5)); }
    .rr-cup svg { display: block; width: 100%; height: 100%; }
    .rr-card.is-won .rr-cup { display: block; }
    .rr-card h2 { margin: 0; font: 700 calc(30 * var(--px)) / 1.15 var(--mu-display); color: var(--mu-ink); text-shadow: 0 calc(2 * var(--px)) 0 rgba(0, 0, 0, 0.3); }
    .rr-card.is-won h2 { color: var(--mu-gold-hi); }
    .rr-card p { margin: calc(6 * var(--px)) 0 0; font-size: calc(15 * var(--px)); line-height: 1.5; color: var(--mu-ink2); }
    .rr-card .mu-orn { margin: calc(12 * var(--px)) 0 calc(4 * var(--px)); }
    .rr-card .rr-by { color: var(--mu-ink); font-weight: 600; }
    .rr-card .rr-prize { color: var(--mu-gold-hi); font-weight: 700; }
    .rr-card .rr-prize[hidden] { display: none; }
    .rr-card .mu-ask-row button[hidden] { display: none; }
    .rr-card kbd { display: inline-grid; place-items: center; min-width: calc(20 * var(--px)); height: calc(20 * var(--px)); padding: 0 calc(5 * var(--px)); box-sizing: border-box;
      font: 600 calc(11.5 * var(--px)) / 1 var(--mu-display); color: var(--mu-ink2); background: rgba(255, 244, 222, 0.1); border: 1px solid var(--mu-line-hi);
      border-bottom-width: 2px; border-radius: calc(3 * var(--px)); }
    .rr-card .mu-ask-go kbd { color: #4a2e08; background: rgba(90, 50, 0, 0.12); border-color: rgba(90, 50, 0, 0.4); }
    body.roam-touch .rr-card kbd { display: none; }
    :lang(km) .rr-card h2 { font-size: calc(28 * var(--px)); line-height: 1.4; }
    :lang(km) .rr-card p { line-height: 1.7; }
    :lang(km) .rr-big { line-height: 1.45; }
    :lang(km) .rr-mark { font-size: calc(24 * var(--px)); line-height: 1.5; }
    :lang(km) .rr-card .mu-ask-row > * { font-size: calc(17 * var(--px)); line-height: 1.3; letter-spacing: 0; }

    /* A phone held upright: the course narrower, the drum a thumb's size. */
    /* A touch screen (its calendar chip sits top middle) or a short view (a phone on its side): the course along the
       bottom left, clear of the purse, the chip and the mini-map; the drum stays bottom right. */
    body.roam-touch .rr-course { left: 16px; top: auto; bottom: 20px; transform: none; }
    @media (max-height: 500px) {
      /* (bottom middle: the key help keeps the bottom left with a keyboard) */
      .rr-course, body.roam-touch .rr-course { left: 50%; top: auto; bottom: 14px; transform: translateX(-50%); }
      /* (the marks and the run left of the drum: over it they would meet the calendar chip under the mini-map) */
      .rr-mark { left: auto; right: calc(100% + 14px); bottom: auto; top: 4px; transform: none; text-align: right; }
      .mu-shot .rr-mark { transform: none; }
      .rr-pad > .rr-streak { top: 52px; right: calc(100% + 14px); }
      .rr-lanes { width: min(calc(300 * var(--px)), calc(100vw - 640px)); min-width: 150px; }
      .rr-pad { bottom: 14px; right: 20px; }
      .rr-big { top: 45%; }
      .rr-card { top: 50%; }
      .rr-card.is-open { transform: translate(-50%, -50%); }
    }
    /* A phone held upright: the course across the bottom, the drum (a thumb's size) over it on the right, the result
       card at the bottom (the top is the purse's, the chip's and the mini-map's). */
    /* (a low phone on its side: the drum would stand on the mini-map's foot; the mini-map steps aside while he races) */
    @media (max-height: 400px) and (min-width: 640px) {
      body.roam-race .mm .mm-mini, body.roam-race .mm .mm-under { visibility: hidden; }
    }
    @media (max-width: 639px) {
      body.roam-race .rh-help { display: none; }
      .rr-course, body.roam-touch .rr-course { left: 12px; right: 12px; top: auto; bottom: 14px; transform: none; padding: 8px 12px; gap: 10px; }
      .rr-lanes { flex: 1; width: auto; min-width: 0; }
      .rr-pad { bottom: 92px; right: 20px; }
      .rr-drum { width: 100px; height: 100px; }
      .rr-big { top: 46%; }
      .rr-card { top: auto; bottom: 16px; transform: translate(-50%, 10px) scale(0.96); }
      .rr-card.is-open { transform: translate(-50%, 0); }
    }
    .mu-calm ~ .rh .rr-card { transition: opacity 0.2s, visibility 0s 0.2s; }
  `;
  document.head.append(style);
}
