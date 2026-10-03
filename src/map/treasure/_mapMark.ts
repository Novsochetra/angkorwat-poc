import { t } from '../ui/lang';

/**
 * The search area of the golden figure he follows from its list of clues
 * (_list.ts "Show on map"; `treasure.search()`, hooks.ts) on the two maps,
 * drawn here so the mini-map (ui/minimap.ts) only calls these:
 *
 * - **Mini-map** (`drawSearchMini`, in its face's clip, under the icons): a
 *   soft gold disc with a slowly turning dashed ring; while its middle is
 *   off the face, a small gold mark on the rim pings towards it (the
 *   target's arrow is a different shape: both can show).
 * - **Big map** (`searchMarkBig`, among the golden figures found, under the
 *   other marks): the same circle at its size in metres, "Search area"
 *   under it.
 *
 * Small and light (no three.js): the mini-map's module imports it.
 */

/**
 * On the mini-map's canvas (device px): the area's middle at (x, y), its radius `r`; the face's middle `C`, half its
 * size `F`, device px per overlay unit `ks`, seconds `t` (the ring turns, the rim mark pings).
 */
export function drawSearchMini(g: CanvasRenderingContext2D, x: number, y: number, r: number, C: number, F: number, ks: number, t: number): void {
  const dx = x - C;
  const dy = y - C;
  // (the face's rounded-square edge: as the target's arrow measures it)
  const norm = Math.pow(dx ** 4 + dy ** 4, 0.25);
  g.save();
  if (norm - r < F * 1.2) {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255, 216, 96, 0.4)');
    grad.addColorStop(0.65, 'rgba(255, 200, 72, 0.27)');
    grad.addColorStop(1, 'rgba(255, 188, 60, 0.12)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    // (a dark line under the gold one: it reads on the pale fields and the dark jungle)
    g.lineWidth = 3 * ks;
    g.strokeStyle = 'rgba(40, 22, 4, 0.45)';
    g.stroke();
    g.setLineDash([4.5 * ks, 3 * ks]);
    g.lineDashOffset = -t * 5 * ks;
    g.lineWidth = 1.7 * ks;
    g.strokeStyle = `rgba(255, 224, 124, ${(0.75 + 0.2 * Math.sin(t * 1.7)).toFixed(3)})`;
    g.stroke();
    g.setLineDash([]);
  }
  const lim = F - 15 * ks;
  if (norm > lim) {
    const L = Math.hypot(dx, dy) || 1;
    const ux = dx / L;
    const uy = dy / L;
    const k = lim / Math.pow(ux ** 4 + uy ** 4, 0.25);
    const mx = C + ux * k;
    const my = C + uy * k;
    const ph = (t * 0.5) % 1;
    const R = 6.2 * ks;
    g.beginPath();
    g.arc(mx, my, R + ph * 8 * ks, 0, Math.PI * 2);
    g.lineWidth = 1.6 * ks;
    g.strokeStyle = `rgba(255, 213, 74, ${(0.75 * (1 - ph) * (1 - ph)).toFixed(3)})`;
    g.stroke();
    // (a small point out of it, towards the area: "that way")
    g.beginPath();
    g.moveTo(mx + ux * (R + 5.5 * ks), my + uy * (R + 5.5 * ks));
    g.lineTo(mx + ux * (R - 1 * ks) - uy * 4.2 * ks, my + uy * (R - 1 * ks) + ux * 4.2 * ks);
    g.lineTo(mx + ux * (R - 1 * ks) + uy * 4.2 * ks, my + uy * (R - 1 * ks) - ux * 4.2 * ks);
    g.closePath();
    g.fillStyle = '#ffd54a';
    g.fill();
    g.lineWidth = 1.2 * ks;
    g.strokeStyle = 'rgba(40, 22, 4, 0.9)';
    g.stroke();
    g.beginPath();
    g.arc(mx, my, R, 0, Math.PI * 2);
    g.fillStyle = 'rgba(58, 38, 8, 0.94)';
    g.fill();
    g.lineWidth = 1.7 * ks;
    g.strokeStyle = '#ffd54a';
    g.stroke();
    g.beginPath();
    g.arc(mx, my, 2.5 * ks, 0, Math.PI * 2);
    g.fillStyle = '#ffe07c';
    g.fill();
  }
  g.restore();
}

/** On the big map (its area `x0`, `z0`, `w` × `h` m, north up): the circle and its name, as markup for its marks' layer. */
export function searchMarkBig(s: { x: number; z: number; r: number }, x0: number, z0: number, w: number, h: number): string {
  injectStyle();
  const pc = (v: number, of: number) => `${((v / of) * 100).toFixed(2)}%`;
  return `<span class="tg-area" style="left:${pc(s.x - x0, w)};top:${pc(s.z - z0, h)};width:${pc(2 * s.r, w)}" aria-hidden="true"><i></i><b>${t('tgArea')}</b></span>`;
}

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  style.textContent = `
    .tg-area { position: absolute; aspect-ratio: 1; min-width: calc(26 * var(--px)); transform: translate(-50%, -50%); pointer-events: none; }
    .tg-area > i { position: absolute; inset: 0; border-radius: 50%; border: calc(2.5 * var(--px)) dashed #ffe07c;
      background: radial-gradient(closest-side, rgba(255, 216, 96, 0.5), rgba(255, 200, 72, 0.32) 65%, rgba(255, 188, 60, 0.16));
      box-shadow: 0 0 0 calc(1.5 * var(--px)) rgba(40, 22, 4, 0.6), inset 0 0 0 calc(1 * var(--px)) rgba(40, 22, 4, 0.45), 0 0 calc(16 * var(--px)) rgba(255, 190, 60, 0.55);
      animation: tg-area 24s linear infinite; }
    .tg-area > b { position: absolute; left: 50%; top: calc(100% + 3 * var(--px)); transform: translateX(-50%); white-space: nowrap; padding: calc(1 * var(--px)) calc(6 * var(--px));
      border-radius: calc(4 * var(--px)); background: rgba(58, 38, 8, 0.86); font: 700 calc(11.5 * var(--px)) / 1.3 var(--mu-font); color: #ffe07c;
      box-shadow: 0 0 0 1px rgba(255, 213, 74, 0.6); }
    :lang(km) .tg-area > b { font-size: calc(12.5 * var(--px)); line-height: 1.45; }
    /* (a phone's small big map: the circle alone, its name would meet the places') */
    @media (max-width: 639px) { .tg-area > b { display: none; } }
    @keyframes tg-area { to { transform: rotate(360deg); } }
    .mu-calm ~ .mm-bigwrap .tg-area > i, .mu-shot .tg-area > i { animation: none; }`;
  document.head.append(style);
}
