import { steppedRing, steppedShape } from '../ui/shape';

/**
 * The look of the catch card (_fishSellChoice.ts) and the sale card
 * (_fishSellCard.ts), and of the basket in his bag (_fishSell.ts): the buy
 * menu's family (_shopMenu.ts) — a dark panel with stepped corners and a
 * warm edge at the right of the view, gold for what to do next, the rows
 * and choices as stepped tiles with a ring, the keys' digits (the pad's ✕
 * on the one in the ring, none on a touch screen), the purse at the foot.
 * While either is open (`body.roam-sell`) the mini-map, the key help and the
 * explorer menu step aside, and on touch the stick, the buttons and the
 * tool bar. A sheet along the bottom on a phone held upright; at the right
 * edge on one on its side.
 */

/** The game pad's ✕ on the row or choice in the ring (shown only while the pad is in use). */
export const PAD_X = '<kbd class="sl-padx" data-pad="south" aria-hidden="true"></kbd>';

/** The close button's pixel ×, and the pad's ○ (Esc) beside it. */
export const CLOSE_X =
  '<svg class="sl-x-icon" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" d="M3 3h2v1h1v1h1v1h2V5h1V4h1V3h2v2h-1v1h-1v1h-1v2h1v1h1v1h1v2h-2v-1h-1v-1H9v-1H7v1H6v1H5v1H3v-2h1v-1h1V9h1V7H5V6H4V5H3z"/></svg><kbd data-pad="east">Esc</kbd>';

export const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

let styled = false;
export function injectSellStyle(): void {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  style.textContent = `
    .rh > .sl-card.mu-frame { right: calc(28 * var(--px)); top: 50%; left: auto; flex-direction: column; align-items: stretch; gap: calc(9 * var(--px));
      padding: calc(14 * var(--px)) calc(14 * var(--px)) calc(12 * var(--px)); max-height: calc(100vh - 150 * var(--px)); pointer-events: auto; color: var(--mu-ink2);
      --mu-edge: rgba(255, 208, 112, 0.55); --sl-shape: ${steppedShape(6, 3)}; --sl-ring: ${steppedRing(6, 3, 1.5)};
      opacity: 0; visibility: hidden; transform: translate(calc(10 * var(--px)), -50%); transition: opacity 0.2s, transform 0.3s var(--mu-ease), visibility 0s 0.3s; }
    .rh > .sl-card.mu-frame.is-on { opacity: 1; visibility: visible; transform: translate(0, -50%); transition: opacity 0.25s, transform 0.4s var(--mu-ease), visibility 0s; }
    .sl-card > .mu-bg { backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
    .rh > .sl-sale.mu-frame { width: calc(372 * var(--px)); }
    .rh > .sl-catch.mu-frame { width: calc(318 * var(--px)); }
    .sl-head { display: flex; align-items: center; gap: calc(9 * var(--px)); padding-right: calc(62 * var(--px)); }
    .sl-head h2 { margin: 0; font: 700 calc(20 * var(--px)) / 1.15 var(--mu-display); color: var(--mu-ink); letter-spacing: 0.01em; text-shadow: 0 calc(2 * var(--px)) 0 rgba(0, 0, 0, 0.3); }
    .sl-head-icon { flex: none; width: calc(28 * var(--px)); height: calc(28 * var(--px)); filter: drop-shadow(0 calc(1.5 * var(--px)) 0 rgba(0, 0, 0, 0.4)); }
    .sl-x { position: absolute; right: calc(10 * var(--px)); top: calc(10 * var(--px)); display: flex; align-items: center; gap: calc(6 * var(--px));
      padding: calc(4 * var(--px)) calc(5 * var(--px)) calc(4 * var(--px)) calc(6 * var(--px)); border: 0; border-radius: calc(6 * var(--px)); background: none;
      color: var(--mu-ink2); cursor: pointer; outline: none; transition: color 0.2s, background 0.2s; }
    .sl-x-icon { width: calc(15 * var(--px)); height: calc(15 * var(--px)); }
    .sl-x kbd { min-width: 0; height: calc(19 * var(--px)); font-size: calc(11.5 * var(--px)); color: var(--mu-ink2); }
    .sl-x kbd.is-pad { font-size: calc(14 * var(--px)); }
    .sl-x:hover { color: var(--mu-ink); background: rgba(255, 255, 255, 0.07); }
    .sl-ask { margin: calc(-2 * var(--px)) 0 calc(2 * var(--px)) calc(37 * var(--px)); font-size: calc(14.5 * var(--px)); color: var(--mu-sand); font-style: italic; min-height: 1.3em; }
    .sl-ask.is-said { animation: sl-say 0.4s var(--mu-ease); }
    @keyframes sl-say { from { opacity: 0; transform: translateY(calc(4 * var(--px))); } }
    .sl-list { display: grid; gap: calc(5 * var(--px)); overflow: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: var(--mu-line) transparent;
      margin: 0 calc(-4 * var(--px)); padding: calc(2 * var(--px)) calc(4 * var(--px)); }
    .sl-item, .sl-c, .sl-all { position: relative; display: flex; align-items: center; gap: calc(10 * var(--px)); min-height: calc(46 * var(--px));
      padding: calc(5 * var(--px)) calc(12 * var(--px)) calc(5 * var(--px)) calc(8 * var(--px)); border: 0; background: none; cursor: pointer; outline: none; color: var(--mu-ink);
      isolation: isolate; text-align: left; font: inherit; touch-action: manipulation; transition: color 0.2s, transform 0.2s var(--mu-ease), opacity 0.3s; }
    .sl-bg { position: absolute; inset: 0; z-index: -1; clip-path: var(--sl-shape); background: rgba(255, 244, 222, 0.05); transition: background 0.2s; }
    .sl-bg::after { content: ''; position: absolute; inset: 0; clip-path: var(--sl-ring); background: rgba(255, 229, 188, 0.12); transition: background 0.2s; }
    .rh .sl-card kbd { flex: none; min-width: calc(19 * var(--px)); height: calc(19 * var(--px)); padding: 0 calc(4 * var(--px)); font-size: calc(11 * var(--px)); color: var(--mu-ink2); }
    .sl-fish { flex: none; width: calc(46 * var(--px)); height: calc(24 * var(--px)); filter: drop-shadow(0 calc(1.5 * var(--px)) 0 rgba(0, 0, 0, 0.4)); }
    .sl-name { flex: 1; min-width: 0; display: grid; font-weight: 700; font-size: calc(15 * var(--px)); line-height: 1.25; }
    .sl-name small { font-weight: 600; font-size: calc(12.5 * var(--px)); color: var(--mu-ink2); }
    .sl-price { flex: none; display: flex; align-items: center; gap: calc(5 * var(--px)); font: 700 calc(15.5 * var(--px)) / 1 var(--mu-display); color: var(--mu-gold-hi);
      letter-spacing: 0.02em; white-space: nowrap; text-shadow: 0 calc(1 * var(--px)) 0 rgba(0, 0, 0, 0.35); }
    .sl-price { position: relative; min-width: calc(24 * var(--px)); justify-content: flex-end; }
    .sl-scale { position: absolute; right: 0; top: 50%; width: calc(22 * var(--px)); height: calc(22 * var(--px)); margin-top: calc(-11 * var(--px));
      filter: drop-shadow(0 calc(1 * var(--px)) 0 rgba(0, 0, 0, 0.4)); opacity: 0; transition: opacity 0.3s; }
    .sl-scale .sl-needle { transform-origin: 8px 7.5px; transform-box: view-box; }
    .sl-item.is-weighing .sl-scale { opacity: 1; }
    .sl-item.is-waiting .sl-scale { opacity: 0.4; }
    .sl-item.is-weighing .sl-needle { animation: sl-weigh 0.32s ease-in-out infinite alternate; }
    @keyframes sl-weigh { from { transform: rotate(-70deg); } to { transform: rotate(95deg); } }
    .sl-item .sl-riel { transition: opacity 0.35s, transform 0.35s var(--mu-ease); }
    .sl-item:is(.is-weighing, .is-waiting) .sl-riel { opacity: 0; transform: translateY(calc(3 * var(--px))); }
    .sl-item.is-sold { opacity: 0.42; pointer-events: none; }
    .sl-item.is-sold .sl-riel::before { content: '✓ '; color: #a8d898; }
    .sl-all.is-done { color: #a8d898; }
    .sl-item.is-focus, .sl-c.is-focus, .sl-all.is-focus { transform: translateX(calc(-2 * var(--px))); }
    :is(.sl-item, .sl-c, .sl-all).is-focus .sl-bg { background: rgba(58, 44, 20, 0.7); box-shadow: 0 0 calc(10 * var(--px)) rgba(255, 176, 40, 0.35); }
    :is(.sl-item, .sl-c, .sl-all).is-focus .sl-bg::after { background: var(--mu-gold-hi); }
    :is(.sl-item, .sl-c, .sl-all).is-focus kbd { color: var(--mu-gold-hi); border-color: rgba(255, 208, 112, 0.7); }
    :is(.sl-item, .sl-c, .sl-all):active { transform: scale(0.97); }
    :is(.sl-item, .sl-c, .sl-all):disabled { cursor: default; }
    .sl-all { justify-content: center; min-height: calc(50 * var(--px)); color: var(--mu-gold-hi); font-weight: 700; font-size: calc(15.5 * var(--px)); }
    .sl-all .sl-bg { background: rgba(255, 208, 112, 0.1); }
    .sl-all b { font: 700 calc(16 * var(--px)) / 1 var(--mu-display); letter-spacing: 0.02em; }
    .sl-all:disabled { opacity: 0.45; }
    /* (the game pad in use: no digits; ✕ on the one in the ring, as wide as a digit so nothing moves) */
    .sl-card kbd.sl-padx { display: none; }
    body.pad-on .sl-card :is(.sl-item, .sl-c, .sl-all) > kbd:not(.sl-padx) { display: none; }
    body.pad-on .sl-card kbd.sl-padx { display: inline-flex; justify-content: center; visibility: hidden; font-size: calc(13 * var(--px)); }
    body.pad-on .sl-card .is-focus > kbd.sl-padx { visibility: visible; }
    /* The foot: the purse, the basket. */
    .sl-foot { display: flex; align-items: center; gap: calc(7 * var(--px)); margin-top: calc(2 * var(--px)); padding-top: calc(9 * var(--px)); border-top: 1px solid var(--mu-line);
      font-size: calc(13.5 * var(--px)); }
    .sl-foot .by-icon, .sl-foot .sl-basket-icon { flex: none; width: calc(22 * var(--px)); height: calc(22 * var(--px)); filter: drop-shadow(0 calc(1.5 * var(--px)) 0 rgba(0, 0, 0, 0.4)); }
    .sl-riel-foot { font: 700 calc(16 * var(--px)) / 1 var(--mu-display); color: var(--mu-gold-hi); letter-spacing: 0.02em; transition: color 0.3s, text-shadow 0.3s; }
    .sl-riel-foot.is-up { color: #fff2b8; text-shadow: 0 0 calc(10 * var(--px)) rgba(255, 196, 60, 0.8); }
    .sl-foot-basket { margin-left: auto; display: flex; align-items: center; gap: calc(4 * var(--px)); color: var(--mu-ink2); font-size: calc(12.5 * var(--px)); }
    .sl-foot-basket .sl-basket-icon { width: calc(20 * var(--px)); height: calc(20 * var(--px)); }
    /* The catch card: the fish, its name and size, what it would sell for, then keep it or let it go. */
    .sl-got { display: grid; justify-items: center; gap: calc(4 * var(--px)); text-align: center; padding-top: calc(4 * var(--px)); }
    .sl-got-fish { width: calc(150 * var(--px)); height: calc(54 * var(--px)); filter: drop-shadow(0 calc(2 * var(--px)) 0 rgba(0, 0, 0, 0.45)); animation: sl-got 0.5s var(--mu-ease); }
    @keyframes sl-got { from { transform: translateY(calc(8 * var(--px))) scale(0.7); opacity: 0; } }
    .sl-got-name { margin: 0; font: 700 calc(21 * var(--px)) / 1.2 var(--mu-display); color: var(--mu-ink); text-shadow: 0 calc(2 * var(--px)) 0 rgba(0, 0, 0, 0.3); }
    .sl-got-sub { margin: 0; font-size: calc(13.5 * var(--px)); color: var(--mu-ink2); }
    .sl-got-worth { margin: calc(2 * var(--px)) 0 0; display: flex; align-items: center; gap: calc(6 * var(--px)); font-size: calc(13.5 * var(--px)); color: #a8d898; }
    .sl-got-worth .by-icon { width: calc(18 * var(--px)); height: calc(18 * var(--px)); }
    .sl-got-worth b { font: 700 calc(15 * var(--px)) / 1 var(--mu-display); color: var(--mu-gold-hi); letter-spacing: 0.02em; }
    .sl-note { margin: 0; padding: calc(6 * var(--px)) calc(9 * var(--px)); border-radius: calc(4 * var(--px)); background: rgba(255, 208, 112, 0.08); color: var(--mu-sand);
      font-size: calc(12.5 * var(--px)); line-height: 1.35; text-align: center; }
    .sl-note[hidden] { display: none; }
    .sl-choose { display: grid; grid-template-columns: 1fr 1fr; gap: calc(8 * var(--px)); }
    .sl-c { justify-content: center; flex-wrap: wrap; min-height: calc(54 * var(--px)); gap: calc(5 * var(--px)) calc(7 * var(--px)); font-weight: 700; font-size: calc(15 * var(--px)); }
    .sl-c-n { flex-basis: 100%; display: flex; align-items: center; justify-content: center; gap: calc(4 * var(--px)); font-weight: 600; font-size: calc(12 * var(--px)); color: var(--mu-ink2); }
    .sl-c-n .sl-basket-icon { width: calc(16 * var(--px)); height: calc(16 * var(--px)); }
    .sl-keep { color: var(--mu-gold-hi); }
    .sl-c:disabled { opacity: 0.5; }
    .sl-c:disabled .sl-c-n { color: #f0a08a; }
    /* In my bag (the explorer menu): the basket and the fish in it. */
    .sl-bagrow { display: grid; gap: calc(4 * var(--px)); }
    .sl-bagrow[hidden] { display: none; }
    .sl-bag-h { display: flex; align-items: center; gap: calc(6 * var(--px)); font-size: calc(12.5 * var(--px)); color: var(--mu-ink2); }
    .sl-bag-h .sl-basket-icon { width: calc(20 * var(--px)); height: calc(20 * var(--px)); filter: drop-shadow(0 calc(1 * var(--px)) 0 rgba(0, 0, 0, 0.35)); }
    .sl-bag-fish { display: flex; flex-wrap: wrap; gap: calc(3 * var(--px)) calc(10 * var(--px)); padding-left: calc(4 * var(--px)); }
    .sl-bag-f { display: flex; align-items: center; gap: calc(5 * var(--px)); font-size: calc(12 * var(--px)); color: var(--mu-ink2); white-space: nowrap; }
    .sl-bag-f .sl-fish { width: calc(30 * var(--px)); height: calc(15 * var(--px)); }
    /* (Khmer letters look smaller and stack signs above and below: map.css) */
    :lang(km) .sl-head h2, :lang(km) .sl-got-name { letter-spacing: 0; line-height: 1.35; }
    :lang(km) .sl-name { font-size: calc(16 * var(--px)); line-height: 1.45; }
    :lang(km) .sl-ask { font-style: normal; font-size: calc(15 * var(--px)); }
    :lang(km) .sl-c, :lang(km) .sl-all { font-size: calc(16 * var(--px)); }
    :lang(km) .sl-note, :lang(km) .sl-got-sub { font-size: calc(13.5 * var(--px)); }
    /* (while one is open: the mini-map, the key help and the explorer menu step aside, and on touch the stick, the buttons and the tool bar) */
    body.roam-sell .mm { opacity: 0 !important; visibility: hidden !important; transition: opacity 0.2s, visibility 0s 0.2s !important; }
    body.roam-sell.roam-touch .rt, body.roam-sell.roam-touch .rtb-wrap { display: none !important; }
    body.roam-sell .rtb-keys, body.roam-sell .rxm { display: none !important; }
    .mu-calm ~ .rh > .sl-card.mu-frame { transform: translate(0, -50%) !important; }
    .mu-calm ~ .rh .sl-got-fish, .mu-calm ~ .rh .sl-needle { animation: none !important; }
    /* (no keys to press on a touch screen) */
    body.roam-touch .sl-card kbd { display: none; }
    /* A phone held upright (or any narrow view): a sheet along the bottom. */
    @media (max-width: 639px) {
      .rh > .sl-card.mu-frame { left: 10px; right: 10px; top: auto; bottom: 10px; width: auto !important; max-height: 56vh; transform: translateY(12px); gap: 7px; padding: 12px 12px 10px; }
      .rh > .sl-card.mu-frame.is-on { transform: none; }
      .mu-calm ~ .rh > .sl-card.mu-frame { transform: none !important; }
      .sl-item, .sl-c, .sl-all { min-height: 48px; }
      .sl-list { gap: 4px; }
      .sl-got-fish { width: 120px; height: 42px; }
    }
    /* A phone on its side: at the right edge, as tall as the view. */
    @media (max-height: 500px) {
      .rh > .sl-card.mu-frame { top: 8px; bottom: 8px; right: 8px; left: auto; width: min(380px, 52vw) !important; max-height: none; transform: translateX(10px); gap: 6px; padding: 10px 12px; overflow: auto; }
      .rh > .sl-card.mu-frame.is-on { transform: none; }
      .mu-calm ~ .rh > .sl-card.mu-frame { transform: none !important; }
      .sl-item, .sl-c, .sl-all { min-height: 44px; }
      .sl-got-fish { width: 110px; height: 38px; }
    }`;
  document.head.append(style);
}
