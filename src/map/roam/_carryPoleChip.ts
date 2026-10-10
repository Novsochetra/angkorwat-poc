import { num, onLang, t } from '../ui/lang';

/**
 * The buckets' water while he carries the shoulder pole (roam/_carryPole.ts): a small chip over the tool bar, two
 * pixel buckets filled to their levels and "ធុង ៩/១២" / "Buckets 9/12" (pours of water), in the roaming interface's
 * look (`mu-frame mu-sm`, as the purse). Shown only while he carries it; it steps aside with the other chips while a
 * card is open (`body.roam-sell`).
 */
export interface CarryChip {
  set(on: boolean, pours: number, max: number): void;
}

const BUCKET = (cls: string) =>
  `<svg class="${cls}" viewBox="0 0 12 14" aria-hidden="true" shape-rendering="crispEdges"><path fill="#6a7076" d="M2 0h8v1H2zM1 1h1v2H1zM10 1h1v2h-1z"/><path fill="#b6bbbe" d="M0 3h12v1H0z"/><path fill="#aab0b3" d="M1 4h10v9H1z"/><path class="cp-w" fill="#6f97c3" d="M2 5h8v7H2z"/><path fill="#80888d" d="M1 13h10v1H1z"/></svg>`;

let styled = false;
function style(): void {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `
    .rh > .cp-chip.mu-frame { left: 50%; right: auto; top: auto; bottom: calc(84 * var(--px)); transform: translateX(-50%); display: flex; align-items: center; gap: calc(6 * var(--px));
      padding: calc(5 * var(--px)) calc(11 * var(--px)) calc(5 * var(--px)) calc(8 * var(--px)); pointer-events: none; color: var(--mu-ink);
      font: 700 calc(13.5 * var(--px)) / 1 var(--mu-display); letter-spacing: 0.02em; transition: opacity 0.25s, visibility 0s 0.25s; opacity: 0; visibility: hidden; }
    .rh > .cp-chip.mu-frame.is-on { opacity: 1; visibility: visible; transition: opacity 0.25s, visibility 0s; }
    .cp-chip .cp-b { width: calc(14 * var(--px)); height: calc(16 * var(--px)); filter: drop-shadow(0 calc(1 * var(--px)) 0 rgba(0, 0, 0, 0.4)); }
    .cp-chip.is-low .cp-n { color: #f0a08a; }
    :lang(km) .cp-chip { font-size: calc(14.5 * var(--px)); letter-spacing: 0; }
    body.roam-sell .rh > .cp-chip { opacity: 0 !important; visibility: hidden !important; }
    @media (max-width: 639px) { .rh > .cp-chip.mu-frame { bottom: calc(150px + env(safe-area-inset-bottom, 0px)); } }`;
  document.head.append(s);
}

export function createCarryChip(layer: HTMLElement): CarryChip {
  style();
  const el = document.createElement('div');
  el.className = 'cp-chip mu-frame mu-sm';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="mu-bg"></span>${BUCKET('cp-b')}${BUCKET('cp-b')}<span class="cp-n"></span>`;
  layer.append(el);
  const n = el.querySelector<HTMLElement>('.cp-n')!;
  const waters = [...el.querySelectorAll<SVGPathElement>('.cp-w')];
  let shown = '';
  let last = { on: false, pours: -1, max: 12 };
  const paint = () => {
    const { on, pours, max } = last;
    el.classList.toggle('is-on', on);
    if (!on) return;
    const whole = Math.floor(pours + 1e-6);
    const key = `${whole}|${max}|${num(1)}`;
    if (key === shown) return;
    shown = key;
    n.textContent = t('carryBuckets', { n: num(whole), max: num(max) });
    el.classList.toggle('is-low', whole === 0);
    // (each bucket's water: its share of the pours, 7 pixels a full bucket)
    const per = max / 2;
    [Math.min(per, Math.ceil(pours / 2)), Math.min(per, Math.floor(pours / 2))].forEach((v, i) => {
      const h = Math.round((v / per) * 7);
      waters[i].setAttribute('d', h > 0 ? `M2 ${12 - h}h8v${h}H2z` : '');
    });
  };
  onLang(() => {
    shown = '';
    paint();
  });
  return {
    set(on, pours, max) {
      last = { on, pours, max };
      paint();
    },
  };
}
