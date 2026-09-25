import { OVERVIEW } from '../layout';
import { onLang, t } from '../ui/lang';
import { steppedRing, steppedShape } from '../ui/shape';
import { setTouchUse } from './touch';
import type { RoamHud, RoamMode } from './types';

/**
 * The roaming interface, in the look of the map's own (map.css: dark
 * panels with stepped corners and a warm edge, gold for what to do next,
 * 'Pixelify Sans' titles over 'Nunito Sans'):
 *
 * - in the overview, a "Jump in" button with a little parachute over the
 *   explorer on his ledge (key J);
 * - while roaming, "Back to map" at the top left (Esc), the keys of the mode
 *   at the bottom left (small; hidden while the touch controls show), a
 *   prompt at a place's beacon ("E  Enter Angkor Wat"), short messages that
 *   fade by themselves, and the fade to black; the explorer's tool bar
 *   (tools.ts) goes in the same layer.
 *
 * It sits beside the picker's root (`#ui`) and follows its size (`--u`) and
 * time of day (`--mu-n`).
 */
export function createRoamHud(root: HTMLElement, h: { onJump(): void; onBack(): void }): RoamHud {
  injectStyle();
  const shot = new URLSearchParams(location.search).get('shot') === '1';
  const wrap = document.createElement('div');
  wrap.className = 'map-ui rh';
  if (shot) wrap.classList.add('mu-shot');
  if (root.style.display === 'none') wrap.style.display = 'none';
  wrap.style.setProperty('--mu-shape-sm', steppedShape(8, 4));
  wrap.style.setProperty('--mu-ring-sm', steppedRing(8, 4, 1.25));
  wrap.style.setProperty('--mu-ring-sm-b', steppedRing(8, 4, 2));
  wrap.innerHTML = `
    <button type="button" class="rh-jump mu-frame mu-sm">
      <span class="mu-bg"></span><span class="mu-glow"></span>${CHUTE_ICON}<span class="rh-jump-text"></span><kbd>J</kbd>
    </button>
    <button type="button" class="rh-back mu-frame mu-sm">
      <span class="mu-bg"></span>${BACK_ICON}<span>Back to map</span><kbd>Esc</kbd>
    </button>
    <div class="rh-help mu-frame mu-sm" aria-hidden="true"><span class="mu-bg"></span><span class="rh-keys"></span></div>
    <div class="rh-prompt mu-frame mu-sm" role="status"><span class="mu-bg"></span><kbd></kbd><span class="rh-prompt-text"></span></div>
    <div class="rh-toast mu-frame mu-sm" role="status"><span class="mu-bg"></span><span class="rh-toast-text"></span></div>
    <div class="rh-fade"></div>`;
  root.after(wrap);
  const q = <T extends HTMLElement>(s: string) => wrap.querySelector<T>(s)!;
  const jump = q('.rh-jump');
  // (in the map's language: ui/lang.ts; the roaming's own words are English for now)
  const jumpWords = () => {
    q('.rh-jump-text').textContent = t('jumpIn');
    jump.setAttribute('aria-label', t('jumpInAria'));
  };
  jumpWords();
  onLang(jumpWords);
  const keys = q('.rh-keys');
  const promptEl = q('.rh-prompt');
  const promptKey = q('.rh-prompt kbd');
  const promptText = q('.rh-prompt-text');
  const toastEl = q('.rh-toast');
  const toastText = q('.rh-toast-text');
  const fadeEl = q('.rh-fade');
  // (let go of the focus: Space and Enter are the roaming keys now)
  jump.addEventListener('click', () => {
    jump.blur();
    h.onJump();
  });
  const back = q('.rh-back');
  back.addEventListener('click', () => {
    back.blur();
    h.onBack();
  });

  let mode: RoamMode = 'overview';
  let toastLeft = 0;
  let u = '';
  let n = '';

  // J in the overview: jump in (the picker keeps its own keys).
  addEventListener('keydown', (e) => {
    if (mode !== 'overview' || e.code !== 'KeyJ' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (!jump.offsetParent || jump.classList.contains('is-away')) return;
    e.preventDefault();
    h.onJump();
  });

  /** Put the "Jump in" button over the explorer's head (where the overview camera shows him). */
  function placeJump(): void {
    const { x, y } = explorerOnScreen();
    // (his head is a little left of his feet: he leans towards the map)
    jump.style.left = `${Math.max(90, x - innerWidth * 0.012)}px`;
    jump.style.top = `${Math.max(70, y - 16)}px`;
  }
  placeJump();
  addEventListener('resize', placeJump);

  return {
    layer: wrap,
    setMode(next) {
      mode = next;
      wrap.dataset.mode = next;
      wrap.classList.toggle('is-roam', next !== 'overview');
      keys.innerHTML = HELP[next];
      this.prompt(null);
    },
    prompt(text) {
      if (!text) {
        promptEl.classList.remove('is-on');
        setTouchUse(null);
        return;
      }
      // "E  Enter Angkor Wat": a key, two spaces, what it does.
      const m = /^(\S{1,6})\s{2,}(.+)$/.exec(text);
      promptKey.textContent = m?.[1] ?? '';
      promptKey.hidden = !m;
      promptText.textContent = m?.[2] ?? text;
      promptEl.classList.toggle('is-soon', !m);
      promptEl.classList.add('is-on');
      setTouchUse(m?.[1] === 'E' ? m[2] : null);
    },
    toast(text) {
      toastText.textContent = text;
      toastEl.classList.add('is-on');
      toastLeft = 2.8;
    },
    fade(to, seconds) {
      fadeEl.style.transition = `opacity ${seconds}s ease`;
      fadeEl.style.opacity = String(to);
      return new Promise((r) => setTimeout(r, seconds * 1000));
    },
    update(dt) {
      if (toastLeft > 0 && (toastLeft -= dt) <= 0) toastEl.classList.remove('is-on');
      // Follow the picker's size and time of day.
      const nu = root.style.getPropertyValue('--u');
      if (nu !== u) wrap.style.setProperty('--u', (u = nu) || '1');
      const nn = root.style.getPropertyValue('--mu-n');
      if (nn !== n) wrap.style.setProperty('--mu-n', (n = nn) || '0');
      // Out of the way while a place is picked (the camera flies off) or the expedition begins.
      jump.classList.toggle('is-away', root.classList.contains('mu-has-pick') || root.classList.contains('mu-begun'));
    },
  };
}

/**
 * Where the explorer's head is on screen in the overview (CSS px): the
 * foreground puts his feet at 10.5 % across and 86 % down a 16:9 view, 9 m
 * from the camera; narrower windows open the field of view (camera.ts `fit`).
 */
function explorerOnScreen(): { x: number; y: number } {
  const half = Math.tan((OVERVIEW.fov * Math.PI) / 360);
  const wide = (half * 16) / 9;
  const aspect = innerWidth / Math.max(1, innerHeight);
  const need = Math.min(Math.tan((40 * Math.PI) / 180), Math.max(half, wide / aspect));
  const feet = { x: 0.105 * 2 - 1, y: -(0.86 * 2 - 1) };
  // (1.95 m with his hat, 9 m away)
  const head = feet.y * half + 1.95 / 9;
  return { x: ((((feet.x * wide) / (need * aspect)) + 1) / 2) * innerWidth, y: ((1 - head / need) / 2) * innerHeight };
}

const key = (k: string) => `<kbd>${k}</kbd>`;
const item = (keys: string, what: string) => `<span class="rh-k">${keys}<em>${what}</em></span>`;
const HELP: Record<RoamMode, string> = {
  overview: '',
  leap: '',
  glide: [item(key('A') + key('D'), 'steer'), item(key('W'), 'dive'), item(key('S'), 'brake'), item(key('Space'), 'let go'), item('<i>drag</i>', 'look')].join(''),
  walk: [
    item(key('W') + key('A') + key('S') + key('D'), 'move'),
    item(key('Shift'), 'run'),
    item(key('Space'), 'jump'),
    item(key('E'), 'enter · fly'),
    item('<i>drag</i>', 'look'),
    item(key('1') + '–' + key('5'), 'tools'),
    item(key('F') + key('C') + key('U') + key('P'), 'emotes'),
    item(key('?'), 'all keys'),
  ].join(''),
  boat: [item(key('W') + key('S'), 'paddle'), item(key('A') + key('D'), 'turn'), item(key('E'), 'step ashore'), item('<i>drag</i>', 'look'), item(key('4') + key('5'), 'photo')].join(''),
  hang: [
    item(key('A') + key('D'), 'turn'),
    item(key('W'), 'faster'),
    item(key('S'), 'slower · climb'),
    item(key('Shift'), 'fast'),
    item(key('Space'), 'let go'),
    item('<i>drag</i>', 'look'),
    item(key('4') + key('5'), 'photo'),
  ].join(''),
};

/** A small parachute over a tiny explorer (16 × 16 pixel art). */
const CHUTE_ICON = `<svg class="rh-chute" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges">
  <path fill="currentColor" d="M5 1h6v1h2v1h1v1h1v2H1V4h1V3h1V2h2z"/>
  <path fill="#0d1927" opacity="0.55" d="M5 2h1v4H5zM10 2h1v4h-1z"/>
  <path fill="none" stroke="currentColor" stroke-width="0.6" d="M1.5 6.2L7.3 11.5M5.5 6.2L7.6 11.5M10.5 6.2L8.4 11.5M14.5 6.2L8.7 11.5"/>
  <path fill="#f8f0dc" d="M7 11h2v2H7z"/><path fill="#dcae8f" d="M7 13h2v2H7z"/>
</svg>`;
const BACK_ICON = `<svg class="rh-back-icon" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" d="M7 3h2v2H7v1h6v4H7v1h2v2H7v-1H6v-1H5V9H4V7h1V6h1V5h1z"/></svg>`;

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  style.textContent = `
    .map-ui.rh { z-index: 20; }
    .rh kbd { display: inline-grid; place-items: center; min-width: calc(20 * var(--px)); height: calc(20 * var(--px)); padding: 0 calc(5 * var(--px));
      box-sizing: border-box; font: 600 calc(12 * var(--px)) / 1 var(--mu-display); color: var(--mu-ink); background: rgba(255, 244, 222, 0.1);
      border: 1px solid var(--mu-line-hi); border-bottom-width: 2px; border-radius: calc(3 * var(--px)); }
    .rh kbd[hidden] { display: none; }
    .rh > .mu-frame { position: absolute; display: flex; align-items: center; gap: calc(10 * var(--px)); }

    /* Jump in: over the explorer on his ledge. */
    .rh-jump { transform: translate(-50%, -100%); padding: calc(9 * var(--px)) calc(12 * var(--px)) calc(9 * var(--px)) calc(10 * var(--px));
      border: 0; background: none; cursor: pointer; pointer-events: auto; outline: none; color: var(--mu-gold-hi);
      --mu-edge: rgba(255, 208, 112, 0.7); transition: opacity 0.4s, transform 0.4s var(--mu-ease), visibility 0s; }
    .rh-jump .mu-glow { opacity: 0.55; }
    .rh-jump .mu-glow::before { animation: rh-breathe 3.2s ease-in-out infinite; }
    .rh-jump-text { font: 700 calc(19 * var(--px)) / 1 var(--mu-display); color: var(--mu-ink); letter-spacing: 0.01em; text-shadow: 0 calc(2 * var(--px)) 0 rgba(0, 0, 0, 0.3); }
    .rh-chute { width: calc(26 * var(--px)); height: calc(26 * var(--px)); filter: drop-shadow(0 calc(2 * var(--px)) 0 rgba(0, 0, 0, 0.35)); }
    .rh-jump::after { content: ''; position: absolute; left: 50%; bottom: calc(-7 * var(--px)); width: calc(10 * var(--px)); height: calc(7 * var(--px));
      transform: translateX(-50%); background: var(--mu-panel); clip-path: polygon(0 0, 100% 0, 50% 100%); }
    .rh-jump:hover, .rh-jump:focus-visible { --mu-edge: var(--mu-gold-hi); transform: translate(-50%, calc(-100% + var(--mu-lift))); }
    .rh-jump:hover .mu-glow, .rh-jump:focus-visible .mu-glow { opacity: 1; }
    .rh-jump:active { transform: translate(-50%, -100%) scale(0.97); }
    .rh-jump:focus-visible { outline: 2px solid rgba(255, 244, 214, 0.95); outline-offset: 3px; border-radius: calc(8 * var(--px)); }
    .rh-jump.is-away, .rh.is-roam .rh-jump { opacity: 0; visibility: hidden; pointer-events: none; transform: translate(-50%, calc(-100% + 8px));
      transition: opacity 0.3s, transform 0.3s, visibility 0s 0.3s; }
    @keyframes rh-breathe { 50% { opacity: 0.45; } }

    /* Back to map: top left, where the title card was. */
    .rh-back { left: calc(24 * var(--px)); top: calc(22 * var(--px)); padding: calc(10 * var(--px)) calc(12 * var(--px)) calc(10 * var(--px)) calc(12 * var(--px));
      border: 0; background: none; cursor: pointer; pointer-events: auto; outline: none; font-weight: 700; font-size: calc(15 * var(--px));
      opacity: 0; visibility: hidden; transition: opacity 0.4s, visibility 0s 0.4s; }
    .rh-back-icon { width: calc(18 * var(--px)); height: calc(18 * var(--px)); color: var(--mu-gold-hi); }
    .rh-back:hover, .rh-back:focus-visible { --mu-edge: var(--mu-line-hi); }
    .rh-back:focus-visible { outline: 2px solid rgba(255, 244, 214, 0.95); outline-offset: 3px; border-radius: calc(8 * var(--px)); }

    /* Keys of the mode: bottom left, small and calm (clear of the bug-report button). */
    .rh-help { left: calc(24 * var(--px)); bottom: calc(22 * var(--px)); padding: calc(7 * var(--px)) calc(12 * var(--px));
      opacity: 0; visibility: hidden; transition: opacity 0.6s, visibility 0s 0.6s; --mu-edge: rgba(255, 229, 188, 0.12); }
    .rh-help > .mu-bg { background: color-mix(in srgb, rgba(13, 25, 39, 0.55), rgba(4, 15, 32, 0.55) var(--mu-night)); }
    .rh-keys { display: flex; flex-wrap: wrap; gap: calc(6 * var(--px)) calc(16 * var(--px)); }
    .rh-k { display: inline-flex; align-items: center; gap: calc(3 * var(--px)); font-size: calc(13 * var(--px)); color: var(--mu-ink2); }
    .rh-k em { font-style: normal; margin-left: calc(4 * var(--px)); }
    .rh-k i { font-style: normal; font-weight: 700; color: var(--mu-ink); }
    body:has(.fb-button) .rh-help { bottom: calc(22 * var(--px) + 36px); }
    body.roam-touch .rh-help { display: none; }

    /* Prompt at a beacon: bottom centre, gold. */
    .rh-prompt { left: 50%; bottom: 17vh; transform: translate(-50%, 8px); padding: calc(10 * var(--px)) calc(18 * var(--px)) calc(10 * var(--px)) calc(12 * var(--px));
      opacity: 0; visibility: hidden; transition: opacity 0.35s, transform 0.35s var(--mu-ease), visibility 0s 0.35s; --mu-edge: rgba(255, 208, 112, 0.75); white-space: nowrap; }
    .rh-prompt.is-on { opacity: 1; visibility: visible; transform: translate(-50%, 0); transition: opacity 0.35s, transform 0.35s var(--mu-ease); }
    .rh-prompt kbd { min-width: calc(26 * var(--px)); height: calc(26 * var(--px)); font-size: calc(15 * var(--px)); color: var(--mu-gold-hi); border-color: rgba(255, 208, 112, 0.8); }
    .rh-prompt-text { font: 700 calc(18 * var(--px)) / 1.1 var(--mu-display); letter-spacing: 0.01em; }
    .rh-prompt.is-soon { --mu-edge: var(--mu-line); padding-left: calc(18 * var(--px)); }
    .rh-prompt.is-soon .rh-prompt-text { font: 600 calc(16 * var(--px)) / 1.1 var(--mu-font); color: var(--mu-ink2); }
    body.roam-touch .rh-prompt kbd { display: none; }
    /* (on touch the Use button says it) */
    body.roam-touch .rh-prompt:not(.is-soon) { display: none; }
    body.roam-touch .rh-prompt { bottom: calc(150px + 4vh); }

    /* Short messages: top centre. */
    .rh-toast { left: 50%; top: 13vh; transform: translate(-50%, -6px); padding: calc(9 * var(--px)) calc(18 * var(--px)); font-weight: 600;
      opacity: 0; visibility: hidden; transition: opacity 0.5s, transform 0.5s var(--mu-ease), visibility 0s 0.5s; white-space: nowrap; }
    .rh-toast.is-on { opacity: 1; visibility: visible; transform: translate(-50%, 0); transition: opacity 0.3s, transform 0.3s var(--mu-ease); }

    .rh.is-roam .rh-back, .rh.is-roam .rh-help { opacity: 1; visibility: visible; transition: opacity 0.6s 0.4s, visibility 0s; }
    .rh[data-mode='leap'] .rh-help { opacity: 0; visibility: hidden; }
    .rh-fade { position: absolute; inset: 0; background: #05070c; opacity: 0; pointer-events: none; }

    @media (max-width: 639px) {
      .rh-back { left: 10px; top: 10px; }
      .rh-back kbd { display: none; }
      .rh-help { left: 10px; bottom: 10px; }
      .rh-prompt { bottom: 22vh; }
    }
    .mu-calm ~ .rh .rh-jump .mu-glow::before { animation: none; }`;
  document.head.append(style);
}
