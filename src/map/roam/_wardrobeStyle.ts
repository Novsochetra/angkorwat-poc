import { steppedRing, steppedShape } from '../ui/shape';

/**
 * The look of the clothes card (_wardrobeCard.ts): the buy menu's family
 * (_shopMenu.ts) — a dark panel with stepped corners and a warm edge at the
 * right of the view, gold for what to do next, the rows as stepped tiles with
 * a ring, the keys' digits (the pad's ✕ on the one in the ring, none on a
 * touch screen), the purse at the foot — with a row of tabs (the kinds). What
 * he wears is lit gold. While it is open (`body.roam-wear`) the mini-map, the
 * key help and the explorer menu step aside, and on touch the stick, the
 * buttons and the tool bar. A sheet along the bottom on a phone held upright;
 * at the right edge on one on its side.
 */

/** The game pad's ✕ on the row in the ring (shown only while the pad is in use). */
export const PAD_X = '<kbd class="wr-padx" data-pad="south" aria-hidden="true"></kbd>';

/** The close button's pixel ×, and the pad's ○ (Esc) beside it. */
export const CLOSE_X =
  '<svg class="wr-x-icon" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" d="M3 3h2v1h1v1h1v1h2V5h1V4h1V3h2v2h-1v1h-1v1h-1v2h1v1h1v1h1v2h-2v-1h-1v-1H9v-1H7v1H6v1H5v1H3v-2h1v-1h1V9h1V7H5V6H4V5H3z"/></svg><kbd data-pad="east">Esc</kbd>';

export const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * The parts in a row along the top, icons only (a phone on its side, a narrow page): the same rules for a media and
 * a container query, as they are and under `body.roam-touch` (whose own sizes they must win over: the same weight,
 * later).
 */
const ROW_RULES = `
      .lk-in { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); gap: 6px; }
      .lk-parts { grid-auto-flow: column; grid-auto-columns: minmax(40px, 1fr); gap: 0; overflow-x: auto; overflow-y: hidden; }
      .lk-part { justify-content: center; min-height: 42px; padding: 3px 2px; }
      .lk-pt { display: none; }
      .lk-slot { width: 30px; height: 30px; }
      .lk-panel { gap: 4px; }
      .lk-sub { margin-top: 2px; }`;
const LOOK_ROW = ROW_RULES + ROW_RULES.replace(/^(\s+)\./gm, '$1body.roam-touch .');

let lookStyled = false;
/**
 * The look of the explorer menu's Look page (_wardrobeLook.ts), in the menu's family (_explorerMenu.ts: stepped
 * tiles with a ring, gold for what is picked): the parts down the left (each with the picture of what he has on),
 * the picked one lit; its choices in a list beside them that scrolls (the page fills the menu's side panel, as tall
 * as it is: `flex: 1`, `min-height: 0`); what he wears lit gold with a ✓; what is not his yet dim, a small lock and
 * its price; what the outfit cannot show greyed; the line under the list (where to buy, or why). Desktop sizes
 * follow the interface's scale (`--px`); touch in px, 42 px and more to tap. A phone on its side (or a page under
 * 240 px): the parts in a row along the top.
 */
export function injectLookStyle(): void {
  if (lookStyled) return;
  lookStyled = true;
  const style = document.createElement('style');
  style.textContent = `
    .lk { flex: 1 1 auto; min-height: 0; min-width: 0; display: flex; flex-direction: column; container: lk / inline-size; color: var(--mu-ink2);
      --lk-shape: ${steppedShape(6, 3)}; --lk-ring: ${steppedRing(6, 3, 1.5)}; }
    /* (the parts' column as wide as its longest name, in either language: a word never breaks) */
    .lk-in { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: max-content minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); gap: calc(7 * var(--px)); }
    .lk-bg { position: absolute; inset: 0; z-index: -1; clip-path: var(--lk-shape); background: rgba(255, 244, 222, 0.04); transition: background 0.2s, box-shadow 0.2s; }
    .lk-bg::after { content: ''; position: absolute; inset: 0; clip-path: var(--lk-ring); background: rgba(255, 229, 188, 0.1); transition: background 0.2s; }
    .lk-icon { display: block; width: 100%; height: 100%; }
    /* The parts: the picture of what he has on, the part's name; the one shown lit. */
    .lk-parts { display: grid; align-content: start; gap: calc(4 * var(--px)); min-width: 0; min-height: 0; overflow-x: hidden; overflow-y: auto; scrollbar-width: none; padding: calc(1 * var(--px)); }
    .lk-part { position: relative; display: flex; align-items: center; gap: calc(6 * var(--px)); min-width: 0; min-height: calc(44 * var(--px)); padding: calc(4 * var(--px)) calc(6 * var(--px));
      border: 0; background: none; cursor: pointer; outline: none; color: var(--mu-ink2); isolation: isolate; text-align: left; font: 700 calc(13.5 * var(--px)) / 1.15 var(--mu-font);
      touch-action: manipulation; transition: color 0.2s, transform 0.2s var(--mu-ease); }
    .lk-slot { flex: none; display: grid; place-items: center; box-sizing: border-box; width: calc(30 * var(--px)); height: calc(30 * var(--px)); padding: calc(2 * var(--px));
      background: rgba(255, 244, 222, 0.08); box-shadow: inset 0 0 0 1px rgba(255, 229, 188, 0.08); }
    .lk-slot .lk-icon { filter: drop-shadow(0 calc(1.5 * var(--px)) 0 rgba(0, 0, 0, 0.4)); }
    .lk-part.is-tab .lk-slot { background: rgba(255, 224, 124, 0.14); box-shadow: inset 0 0 0 1px rgba(255, 224, 124, 0.3); }
    .lk-pt { flex: 1 1 auto; white-space: nowrap; overflow-wrap: normal; word-break: normal; hyphens: none; }
    .lk-part:hover { color: var(--mu-ink); }
    .lk-part:hover .lk-bg { background: rgba(255, 244, 222, 0.1); }
    .lk-part.is-tab { color: var(--mu-gold-hi); }
    .lk-part.is-tab .lk-bg { background: rgba(58, 44, 20, 0.78); }
    .lk-part.is-tab .lk-bg::after { background: rgba(255, 208, 112, 0.8); }
    .lk-part:focus-visible .lk-bg::after, .lk-c:focus-visible .lk-bg::after { background: rgba(255, 244, 214, 0.95); }
    .lk-part:active, .lk-c:active { transform: scale(0.97); }
    /* The choices of the part shown: its name, how many of the market's he has; a note; the list; the line under it. */
    .lk-panel { display: flex; flex-direction: column; gap: calc(6 * var(--px)); min-width: 0; min-height: 0; }
    .lk-head { flex: none; display: flex; align-items: center; gap: calc(7 * var(--px)); min-width: 0; padding: 0 calc(3 * var(--px)); min-height: calc(22 * var(--px)); }
    .lk-h { min-width: 0; font: 700 calc(16 * var(--px)) / 1.2 var(--mu-display); color: var(--mu-gold-hi); letter-spacing: 0.02em; text-shadow: 0 calc(2 * var(--px)) 0 rgba(0, 0, 0, 0.3); }
    .lk-count { margin-left: auto; font-size: calc(12 * var(--px)); color: var(--mu-dim); white-space: nowrap; }
    .lk-count[hidden], .lk-key[hidden], .lk-note[hidden], .lk-info[hidden] { display: none; }
    .lk kbd { flex: none; min-width: calc(17 * var(--px)); height: calc(17 * var(--px)); padding: 0 calc(4 * var(--px)); font-size: calc(10.5 * var(--px)); letter-spacing: 0; color: var(--mu-ink2); }
    .lk-count:not([hidden]) + .lk-key { margin-left: 0; }
    .lk-key { margin-left: auto; }
    .lk-note { flex: none; margin: 0; padding: 0 calc(3 * var(--px)); font-size: calc(12.5 * var(--px)); line-height: 1.35; color: var(--mu-sand); }
    .lk-list { flex: 0 1 auto; min-height: 0; display: grid; align-content: start; gap: calc(4 * var(--px)); overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain;
      scrollbar-width: thin; scrollbar-color: var(--mu-line) transparent; padding: calc(2 * var(--px)) calc(2 * var(--px)); }
    .lk-sub { display: flex; align-items: center; gap: calc(6 * var(--px)); margin: calc(6 * var(--px)) 0 0; padding: 0 calc(3 * var(--px)); font: 700 calc(12.5 * var(--px)) / 1.2 var(--mu-display); color: var(--mu-sand); letter-spacing: 0.02em; }
    .lk-c { position: relative; display: flex; align-items: center; gap: calc(8 * var(--px)); min-width: 0; min-height: calc(46 * var(--px)); padding: calc(4 * var(--px)) calc(9 * var(--px)) calc(4 * var(--px)) calc(6 * var(--px));
      border: 0; background: none; cursor: pointer; outline: none; color: var(--mu-ink); isolation: isolate; text-align: left; font: inherit; touch-action: manipulation;
      transition: color 0.2s, opacity 0.2s, transform 0.2s var(--mu-ease); }
    /* (each picture in a slot of its own, a little lighter than the row: dark cloth shows on it too) */
    .lk-ic { flex: none; display: grid; place-items: center; box-sizing: border-box; width: calc(34 * var(--px)); height: calc(34 * var(--px)); padding: calc(2 * var(--px));
      background: rgba(255, 244, 222, 0.08); box-shadow: inset 0 0 0 1px rgba(255, 229, 188, 0.08); transition: opacity 0.2s; }
    .lk-ic .lk-icon { filter: drop-shadow(0 calc(1.5 * var(--px)) 0 rgba(0, 0, 0, 0.4)); }
    .lk-c.is-on .lk-ic { background: rgba(255, 224, 124, 0.14); box-shadow: inset 0 0 0 1px rgba(255, 224, 124, 0.3); }
    .lk-cn { flex: 1 1 auto; min-width: 0; display: grid; font-weight: 700; font-size: calc(14 * var(--px)); line-height: 1.25; overflow-wrap: anywhere; }
    .lk-cs { font-weight: 600; font-size: calc(11.5 * var(--px)); line-height: 1.3; color: var(--mu-ink2); }
    .lk-st { flex: none; display: flex; align-items: center; gap: calc(4 * var(--px)); }
    .lk-on { display: none; font: 700 calc(15 * var(--px)) / 1 var(--mu-display); color: var(--mu-gold-hi); }
    .lk-lk { display: none; align-items: center; gap: calc(4 * var(--px)); color: var(--mu-dim); }
    .lk-lock { flex: none; width: calc(12 * var(--px)); height: calc(12 * var(--px)); }
    .lk-pr { font: 700 calc(12.5 * var(--px)) / 1 var(--mu-display); color: var(--mu-gold); letter-spacing: 0.02em; white-space: nowrap; }
    .lk-c:hover .lk-bg { background: rgba(255, 244, 222, 0.1); }
    .lk-c:hover .lk-bg::after { background: var(--mu-line-hi); }
    .lk-c.is-on { color: var(--mu-gold-hi); }
    .lk-c.is-on .lk-on { display: block; }
    .lk-c.is-on .lk-bg { background: rgba(58, 44, 20, 0.78); box-shadow: 0 0 calc(10 * var(--px)) rgba(255, 176, 40, 0.45); }
    .lk-c.is-on .lk-bg::after { background: var(--mu-gold-hi); }
    .lk-c.is-locked { color: var(--mu-ink2); }
    .lk-c.is-locked .lk-lk { display: flex; }
    .lk-c.is-locked .lk-ic { opacity: 0.55; }
    .lk-c.is-locked .lk-cn { opacity: 0.65; }
    .lk-c.is-blocked { opacity: 0.38; }
    .lk-c.is-blocked:hover .lk-bg::after { background: rgba(255, 229, 188, 0.18); }
    .lk-c.is-shake { animation: lk-shake 0.4s; }
    @keyframes lk-shake { 20% { transform: translateX(calc(-5 * var(--px))); } 45% { transform: translateX(calc(4 * var(--px))); } 70% { transform: translateX(calc(-2 * var(--px))); } }
    .mu-calm ~ .rh .lk-c.is-shake { animation: none; }
    .lk-info { flex: none; display: flex; align-items: flex-start; gap: calc(6 * var(--px)); margin: 0; padding: calc(6 * var(--px)) calc(3 * var(--px)) 0; border-top: 1px solid var(--mu-line);
      font-size: calc(12 * var(--px)); line-height: 1.4; color: var(--mu-dim); }
    .lk-info .lk-lock { margin-top: 0.15em; }
    .lk-info b { color: var(--mu-ink2); }
    .lk-info .lk-pr { font-size: 1em; color: var(--mu-gold); }
    .lk-info.is-told { color: var(--mu-sand); }
    /* (Khmer letters look smaller and stack signs above and below: map.css) */
    :lang(km) .lk-part { font-size: calc(14.5 * var(--px)); line-height: 1.3; }
    :lang(km) .lk-h { letter-spacing: 0; line-height: 1.4; }
    :lang(km) .lk-sub { letter-spacing: 0; font-size: calc(13.5 * var(--px)); }
    :lang(km) .lk-cn { font-size: calc(15 * var(--px)); line-height: 1.4; }
    :lang(km) .lk-cs { font-size: calc(12.5 * var(--px)); }
    :lang(km) :is(.lk-note, .lk-info) { font-size: calc(13 * var(--px)); line-height: 1.5; }
    :lang(km) .lk-count { font-size: calc(12.5 * var(--px)); }
    /* (no keys with the game pad in hand, nor on a touch screen) */
    body.pad-on .lk kbd, body.roam-touch .lk kbd { display: none; }
    /* Touch: in px, big enough for a thumb. */
    body.roam-touch .lk-in { grid-template-columns: max-content minmax(0, 1fr); gap: 7px; }
    body.roam-touch .lk-parts { gap: 4px; }
    body.roam-touch .lk-part { min-height: 46px; gap: 6px; padding: 3px 6px; font-size: 13.5px; }
    body.roam-touch:lang(km) .lk-part { font-size: 14.5px; }
    body.roam-touch .lk-slot { width: 30px; height: 30px; padding: 2px; }
    body.roam-touch .lk-panel { gap: 6px; }
    body.roam-touch .lk-head { min-height: 22px; }
    body.roam-touch .lk-h { font-size: 16px; }
    body.roam-touch .lk-count { font-size: 12px; }
    body.roam-touch .lk-note { font-size: 12.5px; }
    body.roam-touch .lk-list { gap: 4px; }
    body.roam-touch .lk-sub { font-size: 12.5px; margin-top: 4px; }
    body.roam-touch .lk-c { min-height: 48px; gap: 8px; padding: 3px 8px 3px 5px; }
    body.roam-touch .lk-ic { width: 34px; height: 34px; padding: 2px; }
    body.roam-touch .lk-cn { font-size: 14px; }
    body.roam-touch:lang(km) .lk-cn { font-size: 15px; }
    body.roam-touch .lk-cs { font-size: 11.5px; }
    body.roam-touch:lang(km) .lk-cs { font-size: 12.5px; }
    body.roam-touch .lk-on { font-size: 15px; }
    body.roam-touch .lk-lock { width: 12px; height: 12px; }
    body.roam-touch .lk-pr { font-size: 12.5px; }
    body.roam-touch .lk-info { font-size: 12px; padding-top: 5px; }
    body.roam-touch:lang(km) :is(.lk-note, .lk-info) { font-size: 13px; }
    @media (max-height: 500px) {${LOOK_ROW}
      .lk-c, body.roam-touch .lk-c { min-height: 44px; }
      .lk-info, body.roam-touch .lk-info { padding-top: 4px; }
    }
    /* (very low: the list keeps the room; where the locked ones are sold shows once one is tapped) */
    @media (max-height: 360px) {
      .lk-info:not(.is-told) { display: none; }
      .lk-head, body.roam-touch .lk-head { min-height: 0; }
    }
    @container lk (max-width: 239px) {${LOOK_ROW}
    }`;
  document.head.append(style);
}

let styled = false;
export function injectWearStyle(): void {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  style.textContent = `
    .rh > .wr-card { right: calc(28 * var(--px)); top: 50%; left: auto; width: calc(384 * var(--px)); flex-direction: column; align-items: stretch; gap: calc(9 * var(--px));
      padding: calc(14 * var(--px)) calc(14 * var(--px)) calc(12 * var(--px)); max-height: calc(100vh - 150 * var(--px)); pointer-events: auto; color: var(--mu-ink2);
      --mu-edge: rgba(255, 208, 112, 0.55); --wr-shape: ${steppedShape(6, 3)}; --wr-ring: ${steppedRing(6, 3, 1.5)};
      opacity: 0; visibility: hidden; transform: translate(calc(10 * var(--px)), -50%); transition: opacity 0.2s, transform 0.3s var(--mu-ease), visibility 0s 0.3s; }
    .rh > .wr-card.is-on { opacity: 1; visibility: visible; transform: translate(0, -50%); transition: opacity 0.25s, transform 0.4s var(--mu-ease), visibility 0s; }
    .wr-card > .mu-bg { backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
    .wr-head { display: flex; align-items: center; gap: calc(9 * var(--px)); padding-right: calc(62 * var(--px)); }
    .wr-head h2 { margin: 0; font: 700 calc(20 * var(--px)) / 1.15 var(--mu-display); color: var(--mu-ink); letter-spacing: 0.01em; text-shadow: 0 calc(2 * var(--px)) 0 rgba(0, 0, 0, 0.3); }
    .wr-head-icon { display: flex; flex: none; }
    .wr-head-icon .wr-icon { width: calc(28 * var(--px)); height: calc(28 * var(--px)); }
    .wr-x { position: absolute; right: calc(10 * var(--px)); top: calc(10 * var(--px)); display: flex; align-items: center; gap: calc(6 * var(--px));
      padding: calc(4 * var(--px)) calc(5 * var(--px)) calc(4 * var(--px)) calc(6 * var(--px)); border: 0; border-radius: calc(6 * var(--px)); background: none;
      color: var(--mu-ink2); cursor: pointer; outline: none; transition: color 0.2s, background 0.2s; }
    .wr-x-icon { width: calc(15 * var(--px)); height: calc(15 * var(--px)); }
    .wr-x kbd { min-width: 0; height: calc(19 * var(--px)); font-size: calc(11.5 * var(--px)); color: var(--mu-ink2); }
    .wr-x kbd.is-pad { font-size: calc(14 * var(--px)); }
    .wr-x:hover { color: var(--mu-ink); background: rgba(255, 255, 255, 0.07); }
    .wr-ask { margin: calc(-2 * var(--px)) 0 calc(2 * var(--px)) calc(37 * var(--px)); font-size: calc(14.5 * var(--px)); color: var(--mu-sand); min-height: 1.3em; }
    .wr-ask.is-quote { font-style: italic; }
    .wr-ask.is-said { animation: wr-say 0.4s var(--mu-ease); }
    @keyframes wr-say { from { opacity: 0; transform: translateY(calc(4 * var(--px))); } }
    /* The kinds: four tabs in a row, the one shown lit; a dot over a kind he wears one of. */
    .wr-tabs { display: flex; align-items: center; gap: calc(4 * var(--px)); }
    .wr-tabk { flex: none; min-width: calc(17 * var(--px)); height: calc(17 * var(--px)); padding: 0 calc(3 * var(--px)); font-size: calc(10.5 * var(--px)); color: var(--mu-ink2); }
    .wr-tab { position: relative; flex: 1; min-width: 0; min-height: calc(32 * var(--px)); padding: calc(3 * var(--px)) calc(6 * var(--px)); border: 0; background: none; cursor: pointer;
      outline: none; color: var(--mu-ink2); isolation: isolate; font: 700 calc(13.5 * var(--px)) / 1.2 var(--mu-display); white-space: nowrap; touch-action: manipulation;
      transition: color 0.2s, opacity 0.2s; }
    .wr-tab:hover { color: var(--mu-ink); }
    .wr-tab.is-tab { color: var(--mu-gold-hi); }
    .wr-tab.is-tab .wr-bg { background: rgba(58, 44, 20, 0.75); }
    .wr-tab.is-tab .wr-bg::after { background: rgba(255, 208, 112, 0.75); }
    .wr-tab.is-worn::before { content: ''; position: absolute; right: calc(5 * var(--px)); top: calc(4 * var(--px)); width: calc(5 * var(--px)); height: calc(5 * var(--px));
      background: var(--mu-gold-hi); box-shadow: 0 0 calc(5 * var(--px)) rgba(255, 196, 60, 0.7); }
    /* (as tall as its longest tab — the stall's six rows — so it does not jump from tab to tab) */
    .wr-list { display: grid; align-content: start; gap: calc(5 * var(--px)); min-height: calc((var(--wr-rows, 6) * 51 - 1) * var(--px)); overflow: auto; overscroll-behavior: contain; scrollbar-width: thin;
      scrollbar-color: var(--mu-line) transparent; margin: 0 calc(-4 * var(--px)); padding: calc(2 * var(--px)) calc(4 * var(--px)); }
    .wr-item, .wr-orig { position: relative; display: flex; align-items: center; gap: calc(10 * var(--px)); min-height: calc(46 * var(--px));
      padding: calc(5 * var(--px)) calc(12 * var(--px)) calc(5 * var(--px)) calc(8 * var(--px)); border: 0; background: none; cursor: pointer; outline: none; color: var(--mu-ink);
      isolation: isolate; text-align: left; font: inherit; touch-action: manipulation; transition: color 0.2s, transform 0.2s var(--mu-ease), opacity 0.3s; }
    .wr-bg { position: absolute; inset: 0; z-index: -1; clip-path: var(--wr-shape); background: rgba(255, 244, 222, 0.05); transition: background 0.2s, box-shadow 0.2s; }
    .wr-bg::after { content: ''; position: absolute; inset: 0; clip-path: var(--wr-ring); background: rgba(255, 229, 188, 0.12); transition: background 0.2s; }
    .wr-card kbd { flex: none; min-width: calc(19 * var(--px)); height: calc(19 * var(--px)); padding: 0 calc(4 * var(--px)); font-size: calc(11 * var(--px)); color: var(--mu-ink2); }
    .wr-icon { flex: none; width: calc(32 * var(--px)); height: calc(32 * var(--px)); filter: drop-shadow(0 calc(1.5 * var(--px)) 0 rgba(0, 0, 0, 0.4)); }
    .wr-name { flex: 1; min-width: 0; display: grid; font-weight: 700; font-size: calc(15 * var(--px)); line-height: 1.25; }
    .wr-note { font-weight: 600; font-size: calc(12 * var(--px)); color: var(--mu-ink2); }
    .wr-note:empty { display: none; }
    .wr-short { display: none; font-weight: 600; font-size: calc(12 * var(--px)); color: #f0a08a; }
    .wr-item.is-said .wr-short { display: block; }
    .wr-state { flex: none; display: grid; justify-items: end; white-space: nowrap; }
    .wr-state > * { grid-area: 1 / 1; }
    .wr-price { font: 700 calc(15.5 * var(--px)) / 1 var(--mu-display); color: var(--mu-gold-hi); letter-spacing: 0.02em; text-shadow: 0 calc(1 * var(--px)) 0 rgba(0, 0, 0, 0.35); }
    .wr-put, .wr-on, .wr-off { display: none; font-weight: 700; font-size: calc(13.5 * var(--px)); }
    .wr-put { color: var(--mu-sand); }
    .wr-on { color: var(--mu-gold-hi); }
    .wr-off { color: #f0c0a8; }
    .wr-item.is-owned .wr-price { display: none; }
    .wr-item.is-owned:not(.is-on) .wr-put { display: block; }
    .wr-item.is-on .wr-on { display: block; }
    .wr-item.is-on:is(.is-focus, :hover) .wr-on { display: none; }
    .wr-item.is-on:is(.is-focus, :hover) .wr-off { display: block; }
    .wr-item.is-on .wr-bg { background: rgba(255, 208, 112, 0.1); }
    .wr-item.is-on .wr-bg::after { background: rgba(255, 208, 112, 0.5); }
    .wr-item.is-short { color: var(--mu-ink2); }
    .wr-item.is-short .wr-icon { opacity: 0.55; filter: grayscale(0.5); }
    .wr-item.is-short .wr-price { color: #d89080; }
    .wr-item.is-shake { animation: wr-shake 0.4s; }
    @keyframes wr-shake { 20% { transform: translateX(calc(-5 * var(--px))); } 45% { transform: translateX(calc(4 * var(--px))); } 70% { transform: translateX(calc(-2 * var(--px))); } }
    .wr-item.is-new .wr-bg { animation: wr-new 1.6s var(--mu-ease); }
    .wr-item.is-new .wr-icon { animation: wr-pop 0.5s var(--mu-ease); }
    @keyframes wr-new { 0% { box-shadow: 0 0 calc(18 * var(--px)) rgba(255, 196, 60, 0.9); background: rgba(255, 208, 112, 0.35); } }
    @keyframes wr-pop { from { transform: scale(0.6) translateY(calc(5 * var(--px))); } }
    .wr-item:is(.is-focus), .wr-orig.is-focus { transform: translateX(calc(-2 * var(--px))); }
    :is(.wr-item, .wr-orig).is-focus .wr-bg { background: rgba(58, 44, 20, 0.7); box-shadow: 0 0 calc(10 * var(--px)) rgba(255, 176, 40, 0.35); }
    :is(.wr-item, .wr-orig).is-focus .wr-bg::after { background: var(--mu-gold-hi); }
    :is(.wr-item, .wr-orig).is-focus kbd { color: var(--mu-gold-hi); border-color: rgba(255, 208, 112, 0.7); }
    :is(.wr-item, .wr-orig, .wr-tab):active { transform: scale(0.97); }
    :is(.wr-item, .wr-orig):disabled { cursor: default; }
    .wr-item:disabled:not(.is-new) { opacity: 0.7; }
    /* (the game pad in use: no digits; ✕ on the one in the ring, as wide as a digit so nothing moves) */
    .wr-card kbd.wr-padx { display: none; }
    body.pad-on .wr-card :is(.wr-item, .wr-orig) > kbd:not(.wr-padx) { display: none; }
    body.pad-on .wr-card kbd.wr-padx { display: inline-flex; justify-content: center; visibility: hidden; font-size: calc(13 * var(--px)); }
    body.pad-on .wr-card .is-focus > kbd.wr-padx { visibility: visible; }
    body.pad-on .wr-tabk { font-size: calc(13 * var(--px)); }
    /* The foot: the purse, "Original look". */
    .wr-foot { display: flex; align-items: center; gap: calc(8 * var(--px)); margin-top: calc(2 * var(--px)); padding-top: calc(9 * var(--px)); border-top: 1px solid var(--mu-line);
      font-size: calc(13.5 * var(--px)); }
    .wr-purse { display: flex; align-items: center; gap: calc(7 * var(--px)); }
    .wr-purse .by-icon { flex: none; width: calc(22 * var(--px)); height: calc(22 * var(--px)); filter: drop-shadow(0 calc(1.5 * var(--px)) 0 rgba(0, 0, 0, 0.4)); }
    .wr-riel { font: 700 calc(16 * var(--px)) / 1 var(--mu-display); color: var(--mu-gold-hi); letter-spacing: 0.02em; }
    .wr-orig { margin-left: auto; min-height: calc(36 * var(--px)); gap: calc(6 * var(--px)); padding: calc(4 * var(--px)) calc(12 * var(--px)); font-weight: 700; font-size: calc(13.5 * var(--px));
      color: var(--mu-sand); white-space: nowrap; }
    .wr-orig:disabled { opacity: 0.4; }
    /* (Khmer letters look smaller and stack signs above and below: map.css) */
    :lang(km) .wr-head h2 { letter-spacing: 0; line-height: 1.35; }
    :lang(km) .wr-name { font-size: calc(16 * var(--px)); line-height: 1.45; }
    :lang(km) .wr-ask { font-style: normal; font-size: calc(15 * var(--px)); }
    :lang(km) .wr-tab { font-size: calc(14.5 * var(--px)); letter-spacing: 0; }
    :lang(km) :is(.wr-put, .wr-on, .wr-off, .wr-orig) { font-size: calc(14.5 * var(--px)); }
    /* (while it is open: the mini-map, the key help and the explorer menu step aside, and on touch the stick, the buttons and the tool bar) */
    body.roam-wear .mm { opacity: 0 !important; visibility: hidden !important; transition: opacity 0.2s, visibility 0s 0.2s !important; }
    body.roam-wear.roam-touch .rt, body.roam-wear.roam-touch .rtb-wrap { display: none !important; }
    body.roam-wear .rtb-keys, body.roam-wear .rxm { display: none !important; }
    /* (the mode's prompt under it — "E  Step ashore" in the boat — is not E's while the card has the keys) */
    body.roam-wear .rh-prompt { opacity: 0 !important; visibility: hidden !important; }
    .mu-calm ~ .rh > .wr-card { transform: translate(0, -50%) !important; }
    .mu-calm ~ .rh .wr-item { animation: none !important; }
    .mu-calm ~ .rh .wr-item .wr-bg, .mu-calm ~ .rh .wr-icon { animation: none !important; }
    /* (no keys to press on a touch screen; no ring to read "Take off" from: what he wears says so) */
    body.roam-touch .wr-card kbd { display: none; }
    body.roam-touch .wr-item.is-on:is(.is-focus, :hover) .wr-on { display: block; }
    body.roam-touch .wr-item.is-on:is(.is-focus, :hover) .wr-off { display: none; }
    /* A phone held upright (or any narrow view): a sheet along the bottom. */
    @media (max-width: 639px) {
      .rh > .wr-card { left: 10px; right: 10px; top: auto; bottom: 10px; width: auto; max-height: 58vh; transform: translateY(12px); gap: 7px; padding: 12px 12px 10px; }
      .rh > .wr-card.is-on { transform: none; }
      .mu-calm ~ .rh > .wr-card { transform: none !important; }
      .wr-item, .wr-orig { min-height: 48px; }
      .wr-tab { min-height: 40px; }
      .wr-list { gap: 4px; min-height: 0; }
    }
    /* A phone on its side: at the right edge, as tall as the view. */
    @media (max-height: 500px) {
      .rh > .wr-card { top: 8px; bottom: 8px; right: 8px; left: auto; width: min(390px, 54vw); max-height: none; transform: translateX(10px); gap: 6px; padding: 10px 12px; }
      .rh > .wr-card.is-on { transform: none; }
      .mu-calm ~ .rh > .wr-card { transform: none !important; }
      .wr-item, .wr-orig { min-height: 44px; }
      .wr-ask { display: none; }
      .wr-list { min-height: 0; }
    }`;
  document.head.append(style);
}
