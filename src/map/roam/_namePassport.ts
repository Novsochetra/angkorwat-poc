import { onName, playerName } from '../khmerName';
import { progress } from '../progress';
import { lang, onLang, t } from '../ui/lang';
import { openNameCard } from './_nameCard';

/**
 * His name on the temple passport (the album's third section, _bookUi.ts):
 * a holder's line under the passport's title — "ឈ្មោះម្ចាស់" / "Holder",
 * the name in Koulen in the stamps' ink, its Latin spelling, and "Edit";
 * with no name yet a dotted line and "Write your name". Either opens the
 * name card (_nameCard.ts) over the album.
 *
 * The first time he opens the passport without a name the card is offered
 * by itself, once (`name.asked` in map/progress.ts): not in shots, unless
 * `nameoffer=1`.
 */

let line: HTMLElement | null = null;

/** The holder's line (one element: the passport puts it back in each time it draws its page). */
export function passportName(): HTMLElement {
  if (line) return line;
  injectStyle();
  const el = document.createElement('div');
  el.className = 'nm-pass';
  el.innerHTML = `<span class="nm-pass-l"></span><span class="nm-pass-v"><b class="nm-pass-km" lang="km"></b><span class="nm-pass-lat"></span></span><button type="button" class="photo-action nm-pass-b"></button>`;
  el.querySelector('button')!.addEventListener('click', (e) => {
    (e.currentTarget as HTMLElement).blur();
    openNameCard(undefined, 'passport');
  });
  line = el;
  fill();
  onName(fill);
  onLang(fill);
  return el;
}

function fill(): void {
  if (!line) return;
  const n = playerName();
  const q = <T extends HTMLElement>(s: string) => line!.querySelector<T>(s)!;
  line.classList.toggle('is-empty', !n);
  q('.nm-pass-l').textContent = t('nameHolder');
  q('.nm-pass-km').textContent = n?.km ?? '';
  // (the Latin spelling beside it, when there is one: in English first, as the passport's own names)
  const lat = q('.nm-pass-lat');
  lat.textContent = n?.latin ?? '';
  lat.lang = 'en';
  line.classList.toggle('is-en', lang() === 'en');
  const b = q<HTMLButtonElement>('.nm-pass-b');
  b.textContent = n ? `✎ ${t('nameEdit')}` : `✎ ${t('nameWrite')}`;
  b.setAttribute('aria-label', n ? `${t('nameEdit')}: ${t('nameTitle')}` : t('nameWrite'));
}

const params = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
const SHOT = params.get('shot') === '1';

/** The passport opened: with no name yet, the first time, the card offers to write one. */
export function offerName(): void {
  if (playerName()) return;
  if (SHOT ? params.get('nameoffer') !== '1' : progress.get('name.asked', false)) return;
  progress.set('name.asked', true);
  // (after the album has drawn the passport: the card comes in over it)
  requestAnimationFrame(() => openNameCard(undefined, 'passport'));
}

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  // (in the album's paper look, map.css `.bk-…`: its ink, its red, Koulen for Khmer names as on the stamps)
  style.textContent = `
    .nm-pass { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; margin-top: 8px; padding: 6px 0 4px; min-width: min(420px, 100%);
      border-bottom: 1.5px dotted rgba(31, 42, 54, 0.32); }
    .nm-pass-l { color: var(--ink-soft); font: 600 11.5px/1.2 system-ui, -apple-system, 'Kantumruy Pro', sans-serif; text-transform: uppercase; letter-spacing: 0.08em; }
    :lang(km) .nm-pass-l { text-transform: none; letter-spacing: 0; font-size: 13px; }
    .nm-pass-v { flex: 1; display: flex; align-items: baseline; gap: 10px; min-width: 0; }
    .nm-pass-km { color: var(--bk-red, #b3392b); font: 400 26px/1.4 Koulen, 'Kantumruy Pro', serif; letter-spacing: 0; }
    .nm-pass-lat { color: var(--ink); font: italic 600 15px/1.3 Georgia, serif; letter-spacing: 0.03em; }
    .nm-pass.is-en .nm-pass-v { flex-direction: row; }
    .nm-pass-b { flex: none; padding: 4px 12px; font-size: 12.5px; }
    .nm-pass.is-empty .nm-pass-b { border-color: var(--bk-red, #b3392b); background: var(--bk-red, #b3392b); color: #fff; }
    body.roam-touch .nm-pass-b { min-height: 40px; }`;
  document.head.append(style);
}
