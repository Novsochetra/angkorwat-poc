import { BAG, CARRY_LIMIT, MATERIAL_IDS, STORE, materialCount, materialsText } from '../build/materials';
import { num, onLang, t } from '../ui/lang';
import { materialIcon } from '../build/materialIcons';
import { BAG_MORE, bagNotify } from './_shopBag';

/**
 * What he carries, on screen (the gathering add-on, roam/_gather.ts):
 *
 * - **The load chip**, top left under the purse (the roaming interface's look,
 *   `mu-frame mu-sm`, as the purse): each material he carries, its picture and
 *   how many, then his load against the limit ("បន្ទុក ៨/១២" / "Load 8/12") with a
 *   thin bar that goes gold-red when full. Shown on foot while he carries
 *   something or is gathering; it glows a moment when something goes in or out.
 * - **"In my bag"** on the explorer menu's Bag page (_shopBag.ts `BAG_MORE`): the
 *   same, each material named ("ឫស្សី ៤ ដើម"), and what is in his home store.
 */
export interface GatherHud {
  /** Show the chip now (on foot: carrying or gathering), and whether it glows (something went in). */
  set(show: boolean): void;
  pop(): void;
}

const BAG_ICON = `<svg class="ga-bagicon" viewBox="0 0 12 12" aria-hidden="true" shape-rendering="crispEdges"><path fill="#8a6038" d="M4 1h4v1H4zM3 2h1v2H3zM8 2h1v2H8z"/><path fill="#c8925a" d="M1 4h10v7H1z"/><path fill="#a8743e" d="M1 4h10v1H1zM1 10h10v1H1z"/><path fill="#e8c860" d="M5 6h2v2H5z"/></svg>`;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

let styled = false;
function style(): void {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `
    /* The load chip: under the purse (_shopBag.ts \`.by-purse\`: 112 under the gold counter, 76 without it). */
    .rh > .ga-load.mu-frame { left: calc(24 * var(--px)); top: calc(148 * var(--px)); display: flex; align-items: center; gap: calc(8 * var(--px));
      padding: calc(5 * var(--px)) calc(11 * var(--px)) calc(5 * var(--px)) calc(8 * var(--px)); pointer-events: none; color: var(--mu-ink);
      font: 700 calc(13.5 * var(--px)) / 1 var(--mu-display); letter-spacing: 0.02em; --mu-edge: rgba(255, 229, 188, 0.2);
      opacity: 0; visibility: hidden; transition: opacity 0.35s, visibility 0s 0.35s; }
    .rh > .ga-load.is-top { top: calc(112 * var(--px)); }
    .rh > .ga-load > .mu-bg { background: color-mix(in srgb, rgba(13, 25, 39, 0.55), rgba(4, 15, 32, 0.55) var(--mu-night)); }
    .rh.is-roam > .ga-load.is-on { opacity: 1; visibility: visible; transition: opacity 0.35s, visibility 0s; }
    .rh[data-mode='leap'] > .ga-load { opacity: 0; visibility: hidden; }
    .ga-load .mu-glow { opacity: 0; transition: opacity 0.8s; }
    .ga-load.is-pop { --mu-edge: var(--mu-gold-hi); }
    .ga-load.is-pop .mu-glow { opacity: 0.7; }
    .ga-load.is-pop .ga-items { animation: ga-pop 0.6s var(--mu-ease); }
    @keyframes ga-pop { 30% { transform: translateY(calc(-3 * var(--px))) scale(1.06); } }
    .ga-items { display: flex; align-items: center; gap: calc(7 * var(--px)); }
    .ga-items:empty { display: none; }
    .ga-it { display: inline-flex; align-items: center; gap: calc(2 * var(--px)); }
    .ga-ic, .ga-bagicon { width: calc(18 * var(--px)); height: calc(18 * var(--px)); filter: drop-shadow(0 calc(1 * var(--px)) 0 rgba(0, 0, 0, 0.4)); }
    .ga-meter { display: inline-flex; align-items: center; gap: calc(6 * var(--px)); color: var(--mu-ink2); font-size: calc(12.5 * var(--px)); white-space: nowrap; }
    .ga-bar { position: relative; width: calc(38 * var(--px)); height: calc(5 * var(--px)); border-radius: calc(3 * var(--px)); background: rgba(255, 244, 222, 0.14); overflow: hidden; }
    .ga-bar > i { position: absolute; inset: 0 auto 0 0; width: calc(var(--ga-load, 0) * 100%); border-radius: inherit; background: linear-gradient(90deg, #ffe7a0, #f7bd40); transition: width 0.3s var(--mu-ease); }
    .ga-load.is-full .ga-bar > i { background: linear-gradient(90deg, #f7bd40, #e8806a); }
    .ga-load.is-full .ga-meter b { color: #ffb4a0; }
    :lang(km) .rh > .ga-load { font-size: calc(14.5 * var(--px)); letter-spacing: 0; }
    :lang(km) .ga-meter { font-size: calc(13.5 * var(--px)); }
    body.roam-sell .rh > .ga-load { opacity: 0 !important; visibility: hidden !important; }
    @media (max-width: 639px) {
      .rh > .ga-load.mu-frame { left: 10px; top: 128px; }
      .rh > .ga-load.is-top { top: 94px; }
    }

    /* In my bag: materials (the explorer menu's Bag page). */
    .ga-sec { display: grid; gap: calc(4 * var(--px)); }
    .ga-sec[hidden] { display: none; }
    .ga-sec-h { display: flex; align-items: center; gap: calc(6 * var(--px)); font-size: calc(12.5 * var(--px)); color: var(--mu-ink2); }
    .ga-sec-h .ga-bagicon { width: calc(20 * var(--px)); height: calc(20 * var(--px)); }
    .ga-sec-list { display: flex; flex-wrap: wrap; gap: calc(3 * var(--px)) calc(12 * var(--px)); padding-left: calc(4 * var(--px)); }
    .ga-sec-m { display: flex; align-items: center; gap: calc(5 * var(--px)); font-size: calc(12.5 * var(--px)); color: var(--mu-ink); white-space: nowrap; }
    .ga-sec-m .ga-ic { width: calc(16 * var(--px)); height: calc(16 * var(--px)); }
    .ga-sec-home { font-size: calc(12 * var(--px)); color: var(--mu-ink2); padding-left: calc(4 * var(--px)); text-wrap: pretty; }
    .ga-sec-home[hidden] { display: none; }`;
  document.head.append(s);
}

export function createGatherHud(layer: HTMLElement): GatherHud {
  style();
  const el = document.createElement('div');
  el.className = 'ga-load mu-frame mu-sm';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="mu-bg"></span><span class="mu-glow"></span><span class="ga-items"></span><span class="ga-meter">${BAG_ICON}<span class="ga-bar"><i></i></span><b></b></span>`;
  layer.append(el);
  const items = el.querySelector<HTMLElement>('.ga-items')!;
  const meter = el.querySelector<HTMLElement>('.ga-meter b')!;
  // (no gold counter in the layer: the purse is at the top, and this under it)
  const noGold = () => el.classList.toggle('is-top', !layer.querySelector(':scope > .tg-count'));
  noGold();
  new MutationObserver(noGold).observe(layer, { childList: true });

  // ── In my bag (the explorer menu) ──
  const sec = document.createElement('div');
  sec.className = 'ga-sec';
  sec.hidden = true;
  BAG_MORE.push({ el: sec, has: () => !BAG.empty || !STORE.empty });

  let shown = '';
  let on = false;
  function fill(): void {
    const key = `${BAG.version}|${STORE.version}|${num(1)}`;
    if (key === shown) return;
    shown = key;
    const load = BAG.load();
    items.innerHTML = MATERIAL_IDS.filter((m) => BAG.count(m) > 0)
      .map((m) => `<span class="ga-it">${materialIcon(m, 'ga-ic')}${num(BAG.count(m))}</span>`)
      .join('');
    meter.textContent = t('gatherLoad', { n: num(load), max: num(CARRY_LIMIT) });
    el.style.setProperty('--ga-load', Math.min(1, load / CARRY_LIMIT).toFixed(3));
    el.classList.toggle('is-full', load >= CARRY_LIMIT);
    const what = materialsText(BAG.all());
    el.setAttribute('aria-label', `${t('gatherLoad', { n: num(load), max: num(CARRY_LIMIT) })}${what ? `: ${what}` : ''}`);
    // (the explorer menu's section)
    sec.hidden = BAG.empty && STORE.empty;
    const home = materialsText(STORE.all());
    sec.innerHTML = `<span class="ga-sec-h">${BAG_ICON}${esc(t('gatherBagTitle'))} · ${esc(t('gatherLoad', { n: num(load), max: num(CARRY_LIMIT) }))}</span>${
      BAG.empty
        ? `<span class="ga-sec-home">${esc(t('gatherBagEmpty'))}</span>`
        : `<span class="ga-sec-list">${MATERIAL_IDS.filter((m) => BAG.count(m) > 0)
            .map((m) => `<span class="ga-sec-m">${materialIcon(m, 'ga-ic')}${esc(materialCount(m, BAG.count(m)))}</span>`)
            .join('')}</span>`
    }<span class="ga-sec-home"${home ? '' : ' hidden'}>${esc(t('gatherAtHome', { what: home }))}</span>`;
  }
  fill();
  const changed = () => {
    fill();
    bagNotify.update();
  };
  BAG.onChange(changed);
  STORE.onChange(changed);
  onLang(() => {
    shown = '';
    fill();
  });
  let popTimer = 0;
  return {
    set(show) {
      if (show === on) return;
      on = show;
      el.classList.toggle('is-on', on);
    },
    pop() {
      el.classList.remove('is-pop');
      void el.offsetWidth;
      el.classList.add('is-pop');
      clearTimeout(popTimer);
      popTimer = window.setTimeout(() => el.classList.remove('is-pop'), 900);
    },
  };
}
