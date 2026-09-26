import { OVERVIEW } from '../layout';
import type { UISound } from '../types';
import { ICON } from '../ui/icons';
import { onLang, t, type WordKey } from '../ui/lang';
import { setSteppedVars, steppedRing } from '../ui/shape';
import { roamPrefs } from './prefs';
import { setTouchUse } from './touch';
import type { RoamHud, RoamMode } from './types';

/** How the explorer goes down from his ledge: under a parachute, or on a hang glider. */
export type JumpKind = 'chute' | 'glider';

/**
 * The roaming interface, in the look of the map's own (map.css: dark
 * panels with stepped corners and a warm edge, gold for what to do next,
 * 'Pixelify Sans' titles over 'Nunito Sans'):
 *
 * - in the overview, a "Jump in" button over the explorer on his ledge (J),
 *   with the icon of the last pick. It opens a small card over his head to
 *   choose how he goes down: under a parachute (1) or on a hang glider (2).
 *   ← / → move between them, Enter (or J again) takes the one in focus (the
 *   last pick at first); Esc, the × or a click elsewhere closes it. The
 *   pick is kept for the visit;
 * - while roaming, "Back to map" at the top left (Esc), the keys of the mode
 *   at the bottom left (small; hidden while the touch controls show), a
 *   prompt at a place's beacon ("E  Enter Angkor Wat"), short messages that
 *   fade by themselves, and the fade to black; the explorer's tool bar
 *   (tools.ts) goes in the same layer.
 *
 * It sits beside the picker's root (`#ui`) and follows its size (`--u`) and
 * time of day (`--mu-n`).
 *
 * Shots: `jumpmenu=1` shows the card open (`jumpmenu=key`: as a key opens
 * it, with the focus ring) · `start=chute|glider` the last pick.
 */
export function createRoamHud(root: HTMLElement, h: { onJump(kind: JumpKind): void; onBack(): void; sound?(s: UISound): void }): RoamHud {
  injectStyle();
  const params = new URLSearchParams(location.search);
  const shot = params.get('shot') === '1';
  const wrap = document.createElement('div');
  wrap.className = 'map-ui rh';
  if (shot) wrap.classList.add('mu-shot');
  if (root.style.display === 'none') wrap.style.display = 'none';
  setSteppedVars(wrap);
  wrap.style.setProperty('--mu-ring-sm-b', steppedRing(8, 4, 2));
  wrap.innerHTML = `
    <button type="button" class="rh-jump mu-frame mu-sm" aria-haspopup="dialog" aria-expanded="false" aria-controls="rh-jumps" aria-keyshortcuts="J">
      <span class="mu-bg"></span><span class="mu-glow"></span><span class="rh-jump-icon"></span><span class="rh-jump-text"></span><kbd>J</kbd>
    </button>
    <section id="rh-jumps" class="rh-jumps mu-frame mu-md" role="dialog" aria-labelledby="rh-jumps-title" aria-hidden="true">
      <span class="mu-bg"></span>
      <h2 id="rh-jumps-title"></h2>
      <div class="rh-picks">${JUMPS.map((j, i) => `
        <button type="button" class="rh-pick mu-frame mu-sm" data-kind="${j.kind}" aria-labelledby="rh-pick-${j.kind}" aria-describedby="rh-pick-${j.kind}-note" aria-keyshortcuts="${i + 1}">
          <span class="mu-bg"></span><span class="mu-glow"></span>${j.icon}<span class="rh-pick-name" id="rh-pick-${j.kind}"></span><span class="rh-pick-note" id="rh-pick-${j.kind}-note"></span><kbd>${i + 1}</kbd>
        </button>`).join('')}
      </div>
      <button type="button" class="rh-jumps-x" aria-keyshortcuts="Escape">${ICON.close}<kbd>Esc</kbd></button>
    </section>
    <button type="button" class="rh-back mu-frame mu-sm">
      <span class="mu-bg"></span>${BACK_ICON}<span class="rh-back-text"></span><kbd>Esc</kbd>
    </button>
    <div class="rh-help mu-frame mu-sm" aria-hidden="true"><span class="mu-bg"></span><span class="rh-keys"></span></div>
    <div class="rh-prompt mu-frame mu-sm" role="status"><span class="mu-bg"></span><kbd></kbd><span class="rh-prompt-text"></span></div>
    <div class="rh-toast mu-frame mu-sm" role="status"><span class="mu-bg"></span><span class="rh-toast-text"></span></div>
    <div class="rh-fade"></div>`;
  root.after(wrap);
  const q = <T extends HTMLElement>(s: string) => wrap.querySelector<T>(s)!;
  const jump = q('.rh-jump');
  const jumpIcon = q('.rh-jump-icon');
  const card = q('.rh-jumps');
  const picks = [...card.querySelectorAll<HTMLButtonElement>('.rh-pick')];
  const closeBtn = q('.rh-jumps-x');
  const keys = q('.rh-keys');
  const promptEl = q('.rh-prompt');
  const promptKey = q('.rh-prompt kbd');
  const promptText = q('.rh-prompt-text');
  const toastEl = q('.rh-toast');
  const toastText = q('.rh-toast-text');
  const fadeEl = q('.rh-fade');
  const back = q('.rh-back');
  back.addEventListener('click', () => {
    back.blur();
    h.onBack();
  });

  let mode: RoamMode = 'overview';
  let toastLeft = 0;
  let u = '';
  let n = '';

  /**
   * Every word in the language in use (ui/lang.ts): the Jump in card, "Back
   * to map" and the keys of the mode. (The prompt comes again from the mode
   * next step; a message is gone in a moment.)
   */
  function fillWords(): void {
    q('.rh-jump-text').textContent = t('jumpIn');
    jump.setAttribute('aria-label', t('jumpInAria'));
    q('#rh-jumps-title').textContent = t('jumpIn');
    closeBtn.setAttribute('aria-label', t('jumpClose'));
    for (const j of JUMPS) {
      q(`#rh-pick-${j.kind}`).textContent = t(j.name);
      q(`#rh-pick-${j.kind}-note`).textContent = t(j.note);
    }
    q('.rh-back-text').textContent = t('backToMap');
    keys.innerHTML = helpFor(mode);
  }
  fillWords();
  onLang(fillWords);

  // ── Jump in: parachute or hang glider ────────────────────────────────────
  const urlPick = params.get('start');
  let last: JumpKind = urlPick === 'chute' || urlPick === 'glider' ? urlPick : (keptPick() ?? 'chute');
  /** The card is open. */
  let choosing = false;

  /** The last pick: its icon on the button, its choice marked in gold. */
  function showLast(): void {
    jumpIcon.innerHTML = JUMPS.find((j) => j.kind === last)!.icon;
    for (const b of picks) b.classList.toggle('is-last', b.dataset.kind === last);
  }
  showLast();

  let lastHover = 0;
  /** The hover tick (not in a burst). */
  function hoverSound(): void {
    const now = performance.now();
    if (now - lastHover < 70) return;
    lastHover = now;
    h.sound?.('hover');
  }

  /**
   * Open the card (the last pick in focus) or close it. Closed by a key or
   * the ×, the focus goes back to the button; `quiet`: no sound, the focus
   * is left alone (a pick, a click elsewhere, roaming).
   */
  function openCard(on: boolean, quiet = false): void {
    if (on === choosing) return;
    choosing = on;
    wrap.classList.toggle('is-choosing', on);
    card.inert = !on;
    card.setAttribute('aria-hidden', String(!on));
    jump.setAttribute('aria-expanded', String(on));
    if (!quiet) h.sound?.(on ? 'open' : 'close');
    if (on) {
      placeCard();
      picks.find((b) => b.dataset.kind === last)!.focus({ preventScroll: true });
    } else if (!quiet) jump.focus({ preventScroll: true });
  }
  card.inert = true;

  /** Go: keep the pick for the visit, close the card, leap off the ledge. */
  function pick(kind: JumpKind): void {
    if (mode !== 'overview') return;
    last = kind;
    try {
      sessionStorage.setItem(PICK_KEY, kind);
    } catch {
      /* no storage: kept until the page closes */
    }
    showLast();
    h.sound?.('select');
    openCard(false, true);
    // (let go of the focus: Space and Enter are the roaming keys now)
    (document.activeElement as HTMLElement | null)?.blur?.();
    h.onJump(kind);
  }

  jump.addEventListener('click', () => openCard(!choosing));
  jump.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse') hoverSound();
  });
  for (const b of picks) {
    b.addEventListener('click', () => pick(b.dataset.kind as JumpKind));
    b.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse') hoverSound();
    });
  }
  closeBtn.addEventListener('click', () => openCard(false));
  // A click or tap anywhere else closes it (and goes on to what it was on); so does Tab out of it.
  addEventListener(
    'pointerdown',
    (e) => {
      if (choosing && !card.contains(e.target as Node)) openCard(false, true);
    },
    { capture: true },
  );
  card.addEventListener('focusout', (e) => {
    const to = e.relatedTarget as Node | null;
    if (choosing && to && !card.contains(to)) openCard(false, true);
  });

  // Keys in the overview: J opens the card; while it is open its keys stay
  // here (capture phase, before the picker's arrows and Esc).
  addEventListener(
    'keydown',
    (e) => {
      if (mode !== 'overview' || e.ctrlKey || e.metaKey || e.altKey || document.body.classList.contains('reporting')) return;
      const tg = e.target as HTMLElement | null;
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
      if (!choosing) {
        if (e.code !== 'KeyJ' || e.repeat || !jump.offsetParent || jump.classList.contains('is-away')) return;
        e.preventDefault();
        openCard(true);
        return;
      }
      const focused = picks.indexOf(document.activeElement as HTMLButtonElement);
      const digit = /^(?:Digit|Numpad)([12])$/.exec(e.code);
      if (digit) {
        if (!e.repeat) pick(JUMPS[Number(digit[1]) - 1].kind);
      } else if (e.key === 'Escape') openCard(false);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const to = picks[e.key === 'ArrowLeft' ? 0 : 1];
        if (to !== document.activeElement) {
          to.focus({ preventScroll: true });
          hoverSound();
        }
      } else if (e.code === 'KeyJ' || ((e.key === 'Enter' || e.key === ' ') && !card.contains(document.activeElement))) {
        // J: the one in focus, else the last pick (Enter and Space on a button press it).
        if (!e.repeat) pick(focused >= 0 ? JUMPS[focused].kind : last);
      } else if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      e.stopPropagation();
    },
    { capture: true },
  );

  /** Over the explorer's head (where the overview camera shows him), CSS px: the tip of the button's tail. */
  function overHead(): { x: number; y: number } {
    const { x, y } = explorerOnScreen();
    // (his head is a little left of his feet: he leans towards the map)
    return { x: Math.max(90, x - innerWidth * 0.012), y: Math.max(70, y - 16) };
  }
  /** Put the "Jump in" button over his head. */
  function placeJump(): void {
    const { x, y } = overHead();
    jump.style.left = `${x}px`;
    jump.style.top = `${y}px`;
    if (choosing) placeCard();
  }
  /** The card where the button is, its tail at the same point, kept inside the view. */
  function placeCard(): void {
    const { x, y } = overHead();
    const w = card.offsetWidth;
    const left = Math.min(Math.max(10, x - w / 2), innerWidth - 10 - w);
    card.style.left = `${left}px`;
    card.style.top = `${Math.max(10, y - card.offsetHeight)}px`;
    card.style.setProperty('--tail', `${Math.min(Math.max(24, x - left), w - 24)}px`);
  }
  placeJump();
  addEventListener('resize', placeJump);
  // (its size changes with the language, the fonts and the interface scale)
  new ResizeObserver(() => {
    if (choosing) placeCard();
  }).observe(card);

  if (shot && params.get('jumpmenu')) {
    openCard(true, true);
    if (params.get('jumpmenu') === 'key') picks.find((b) => b.dataset.kind === last)!.classList.add('is-focus');
  }

  return {
    layer: wrap,
    setMode(next) {
      mode = next;
      if (next !== 'overview') openCard(false, true);
      wrap.dataset.mode = next;
      wrap.classList.toggle('is-roam', next !== 'overview');
      keys.innerHTML = helpFor(next);
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
      // (the Use button takes the E part wherever it is: "Space  Parachute  ·  E  Hang glider" in a long fall)
      const use = /(?:^|·\s+)E\s{2,}([^·]+?)\s*(?:·|$)/.exec(text);
      setTouchUse(use ? use[1] : null);
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
      const away = root.classList.contains('mu-has-pick') || root.classList.contains('mu-begun');
      jump.classList.toggle('is-away', away);
      if (away) openCard(false, true);
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
/** A key and what it does (in English in lower case, as a list). */
const item = (keys: string, what: WordKey) => `<span class="rh-k">${keys}<em>${t(what).toLowerCase()}</em></span>`;
/** The keys of a mode (bottom left) in the language in use; the hang glider's with easy flying off (roam/prefs.ts) are the real glider's. */
function helpFor(mode: RoamMode): string {
  const look = item(`<i>${t('rDrag')}</i> / ${key('Q')}${key('R')}`, 'rLook');
  const letGo = item(key('Space'), 'rLetGo');
  const photo = item(key('4') + key('5'), 'rPhoto');
  switch (mode) {
    case 'glide':
      return [item(key('A') + key('D'), 'rSteer'), item(key('W'), 'rChuteDive'), item(key('S'), 'rBrake'), letGo, look].join('');
    case 'walk':
      return [
        item(key('W') + key('A') + key('S') + key('D'), 'rMove'),
        item(key('Shift'), 'rRun'),
        item(key('Space'), 'rJump'),
        item(key('E'), 'rEnterFly'),
        item(key('N'), 'rRamp'),
        look,
        item(key('1') + '–' + key('5'), 'rTools'),
        item(key('F') + key('C') + key('U') + key('P'), 'rEmotes'),
        item(key('?'), 'rAllKeys'),
      ].join('');
    case 'boat':
      return [item(key('W') + key('S'), 'rPaddle'), item(key('A') + key('D'), 'rTurn'), item(key('E'), 'rAshore'), look, photo].join('');
    case 'hang':
      return [
        item(key('A') + key('D'), 'rTurn'),
        ...(roamPrefs.easyFly ? [item(key('S'), 'rClimb'), item(key('W'), 'rDive')] : [item(key('W'), 'rFaster'), item(key('S'), 'rSlowerClimb')]),
        item(key('Shift'), 'rFast'),
        letGo,
        look,
        photo,
      ].join('');
    case 'balloon':
      return [item(key('W') + key('Space'), 'rBurn'), item(key('Shift'), 'rBothBurners'), item(key('S'), 'rVent'), item(key('A') + key('D'), 'rTurn'), item(key('E'), 'rLandOut'), look, photo].join('');
    default:
      return '';
  }
}

/** A small parachute over a tiny explorer (16 × 16 pixel art). */
const CHUTE_ICON = `<svg class="rh-icon" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges">
  <path fill="currentColor" d="M5 1h6v1h2v1h1v1h1v2H1V4h1V3h1V2h2z"/>
  <path fill="#0d1927" opacity="0.55" d="M5 2h1v4H5zM10 2h1v4h-1z"/>
  <path fill="none" stroke="currentColor" stroke-width="0.6" d="M1.5 6.2L7.3 11.5M5.5 6.2L7.6 11.5M10.5 6.2L8.4 11.5M14.5 6.2L8.7 11.5"/>
  <path fill="#f8f0dc" d="M7 11h2v2H7z"/><path fill="#dcae8f" d="M7 13h2v2H7z"/>
</svg>`;
/** The hang glider seen from the front: the wing, its control frame, the tiny explorer hanging in it (16 × 16, like the parachute). */
const WING_ICON = `<svg class="rh-icon" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges">
  <path fill="currentColor" d="M7 2h2v1h2v1h2v1h2v1h1v2h-2V7H2v1H0V6h1V5h2V4h2V3h2z"/>
  <path fill="#0d1927" opacity="0.55" d="M5 4h1v3H5zM10 4h1v3h-1z"/>
  <path fill="none" stroke="currentColor" stroke-width="0.6" d="M7.2 7L4.6 13.5M8.8 7L11.4 13.5"/>
  <path fill="currentColor" d="M4 13h8v1H4z"/>
  <path fill="#f8f0dc" d="M7 9h2v2H7z"/><path fill="#dcae8f" d="M7 11h2v2H7z"/>
</svg>`;

/** The two ways down, in the card's order (keys 1 and 2). */
const JUMPS: readonly { kind: JumpKind; icon: string; name: WordKey; note: WordKey }[] = [
  { kind: 'chute', icon: CHUTE_ICON, name: 'jumpChute', note: 'jumpChuteNote' },
  { kind: 'glider', icon: WING_ICON, name: 'jumpGlider', note: 'jumpGliderNote' },
];
/** The last pick, kept for the visit (this tab). */
const PICK_KEY = 'angkor-map-jump';
function keptPick(): JumpKind | null {
  try {
    const v = sessionStorage.getItem(PICK_KEY);
    return v === 'chute' || v === 'glider' ? v : null;
  } catch {
    return null;
  }
}
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
    .rh-jump-icon { display: flex; }
    .rh-icon { flex: none; width: calc(26 * var(--px)); height: calc(26 * var(--px)); filter: drop-shadow(0 calc(2 * var(--px)) 0 rgba(0, 0, 0, 0.35)); }
    .rh-jump::after { content: ''; position: absolute; left: 50%; bottom: calc(-7 * var(--px)); width: calc(10 * var(--px)); height: calc(7 * var(--px));
      transform: translateX(-50%); background: var(--mu-panel); clip-path: polygon(0 0, 100% 0, 50% 100%); }
    .rh-jump:hover, .rh-jump:focus-visible { --mu-edge: var(--mu-gold-hi); transform: translate(-50%, calc(-100% + var(--mu-lift))); }
    .rh-jump:hover .mu-glow, .rh-jump:focus-visible .mu-glow { opacity: 1; }
    .rh-jump:active { transform: translate(-50%, -100%) scale(0.97); }
    .rh-jump:focus-visible { outline: 2px solid rgba(255, 244, 214, 0.95); outline-offset: 3px; border-radius: calc(8 * var(--px)); }
    .rh-jump.is-away, .rh.is-roam .rh-jump { opacity: 0; visibility: hidden; pointer-events: none; transform: translate(-50%, calc(-100% + 8px));
      transition: opacity 0.3s, transform 0.3s, visibility 0s 0.3s; }
    .rh.is-choosing .rh-jump { opacity: 0; visibility: hidden; pointer-events: none; transform: translate(-50%, -100%) scale(0.96);
      transition: opacity 0.15s, transform 0.2s, visibility 0s 0.2s; }
    @keyframes rh-breathe { 50% { opacity: 0.45; } }

    /* The choice, parachute or hang glider: a card where the button was, growing out of its tail. */
    .rh > .rh-jumps { flex-direction: column; align-items: stretch; gap: calc(12 * var(--px)); padding: calc(13 * var(--px)) calc(14 * var(--px)) calc(14 * var(--px));
      pointer-events: auto; --mu-edge: rgba(255, 208, 112, 0.5); transform-origin: var(--tail, 50%) calc(100% + 9 * var(--px));
      opacity: 0; visibility: hidden; transform: translateY(calc(6 * var(--px))) scale(0.94); transition: opacity 0.18s, transform 0.25s var(--mu-ease), visibility 0s 0.25s; }
    .rh.is-choosing .rh-jumps { opacity: 1; visibility: visible; transform: none; transition: opacity 0.22s, transform 0.4s var(--mu-ease), visibility 0s; }
    .rh-jumps > .mu-bg { backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
    .rh-jumps::after { content: ''; position: absolute; left: var(--tail, 50%); bottom: calc(-9 * var(--px)); width: calc(14 * var(--px)); height: calc(9 * var(--px));
      transform: translateX(-50%); background: var(--mu-panel); clip-path: polygon(0 0, 100% 0, 50% 100%); }
    .rh-jumps h2 { margin: calc(2 * var(--px)) calc(70 * var(--px)) 0 calc(3 * var(--px)); font: 700 calc(19 * var(--px)) / 1.1 var(--mu-display); color: var(--mu-ink);
      letter-spacing: 0.01em; text-shadow: 0 calc(2 * var(--px)) 0 rgba(0, 0, 0, 0.3); white-space: nowrap; }
    .rh-jumps-x { position: absolute; right: calc(9 * var(--px)); top: calc(9 * var(--px)); display: flex; align-items: center; gap: calc(6 * var(--px));
      padding: calc(3 * var(--px)) calc(4 * var(--px)) calc(3 * var(--px)) calc(6 * var(--px)); border: 0; border-radius: calc(6 * var(--px)); background: none;
      color: var(--mu-ink2); cursor: pointer; outline: none; transition: color 0.2s, background 0.2s; }
    .rh-jumps-x .mu-icon { width: calc(15 * var(--px)); height: calc(15 * var(--px)); }
    .rh-jumps-x kbd { min-width: 0; height: calc(19 * var(--px)); font-size: calc(11.5 * var(--px)); color: var(--mu-ink2); }
    .rh-jumps-x:hover { color: var(--mu-ink); background: rgba(255, 255, 255, 0.07); }
    .rh-jumps-x:focus-visible { outline: 2px solid rgba(255, 244, 214, 0.95); outline-offset: 2px; }
    .rh-picks { display: grid; grid-template-columns: 1fr 1fr; gap: calc(10 * var(--px)); }

    /* A way down: its icon, name and a line about it, the key in the corner; the last pick in gold. */
    .rh-pick { display: flex; flex-direction: column; align-items: center; gap: calc(3 * var(--px)); width: calc(154 * var(--px));
      padding: calc(16 * var(--px)) calc(10 * var(--px)) calc(13 * var(--px)); border: 0; background: none; cursor: pointer; outline: none;
      text-align: center; color: var(--mu-gold); touch-action: manipulation; --mu-edge: var(--mu-line);
      --mu-shadow: 0 calc(3 * var(--px)) calc(10 * var(--px)) rgba(3, 8, 16, 0.28); transition: transform 0.35s var(--mu-ease), color 0.25s; }
    .rh-pick > .mu-bg { background: color-mix(in srgb, rgba(44, 58, 76, 0.5), rgba(18, 36, 66, 0.5) var(--mu-night)); }
    .rh-pick .rh-icon { width: calc(48 * var(--px)); height: calc(48 * var(--px)); margin-bottom: calc(5 * var(--px)); transition: transform 0.35s var(--mu-ease); }
    .rh-pick-name { font: 700 calc(17 * var(--px)) / 1.15 var(--mu-display); color: var(--mu-ink); letter-spacing: 0.01em; white-space: nowrap;
      text-shadow: 0 calc(2 * var(--px)) 0 rgba(0, 0, 0, 0.3); }
    .rh-pick-note { font-size: calc(12.5 * var(--px)); line-height: 1.3; color: var(--mu-ink2); text-wrap: balance; }
    .rh-pick kbd { position: absolute; right: calc(7 * var(--px)); top: calc(7 * var(--px)); min-width: calc(18 * var(--px)); height: calc(18 * var(--px));
      padding: 0 calc(4 * var(--px)); font-size: calc(11 * var(--px)); color: var(--mu-ink2); }
    .rh-pick.is-last { --mu-edge: rgba(255, 208, 112, 0.75); color: var(--mu-gold-hi); }
    .rh-pick.is-last > .mu-bg { box-shadow: inset 0 0 calc(18 * var(--px)) rgba(255, 190, 70, 0.2); }
    .rh-pick.is-last > .mu-glow { opacity: 0.4; }
    .rh-pick.is-last kbd { color: var(--mu-gold-hi); border-color: rgba(255, 208, 112, 0.7); }
    @media (hover: hover) {
      .rh-pick:hover { transform: translateY(var(--mu-lift)); color: var(--mu-gold-hi); --mu-edge: var(--mu-line-hi); }
      .rh-pick:hover > .mu-bg { background: color-mix(in srgb, rgba(54, 70, 90, 0.6), rgba(24, 44, 78, 0.6) var(--mu-night)); }
      .rh-pick:hover .rh-icon { transform: translateY(calc(-2 * var(--px))); }
      .rh-pick.is-last:hover { --mu-edge: var(--mu-gold-hi); }
      .rh-pick.is-last:hover > .mu-glow { opacity: 0.8; }
    }
    .rh-pick:focus-visible, .rh-pick.is-focus { transform: translateY(var(--mu-lift)); color: var(--mu-gold-hi); outline: 2px solid rgba(255, 244, 214, 0.95);
      outline-offset: 3px; border-radius: calc(8 * var(--px)); }
    .rh-pick:active { transform: scale(0.97); transition-duration: 0.08s; }

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
    /* (under the mini-map's banner while it shows: "You have arrived", then E and the glider's keys) */
    body:has(.mm-toast.is-on) .rh-toast { top: calc(13vh + 72 * var(--px)); }

    .rh.is-roam .rh-back, .rh.is-roam .rh-help { opacity: 1; visibility: visible; transition: opacity 0.6s 0.4s, visibility 0s; }
    .rh[data-mode='leap'] .rh-help { opacity: 0; visibility: hidden; }
    .rh-fade { position: absolute; inset: 0; background: #05070c; opacity: 0; pointer-events: none; }

    /* (Khmer letters look smaller and stack signs above and below: map.css) */
    :lang(km) .rh-jumps h2, :lang(km) .rh-pick-name { letter-spacing: 0; line-height: 1.3; }
    :lang(km) .rh-pick-name { font-size: calc(18 * var(--px)); }
    :lang(km) .rh-pick-note { font-size: calc(13.5 * var(--px)); line-height: 1.5; }
    :lang(km) .rh-prompt-text { letter-spacing: 0; line-height: 1.3; }
    :lang(km) .rh-k { font-size: calc(14 * var(--px)); }

    @media (max-width: 639px) {
      .rh-back { left: 10px; top: 10px; }
      .rh-back kbd { display: none; }
      .rh-help { left: 10px; bottom: 10px; }
      .rh-prompt { bottom: 22vh; }
      /* (under the mini-map, and wrapping: a phone is narrow) */
      .rh-toast { top: 218px; width: max-content; max-width: calc(100vw - 40px); box-sizing: border-box; white-space: normal; text-align: center; }
      body:has(.mm-toast.is-on) .rh-toast { top: calc(218px + 72 * var(--px)); }
      .rh-pick { width: calc(132 * var(--px)); }
      /* (the settings open across the whole screen: Jump in steps back under them) */
      .mu-set-open ~ .rh .rh-jump { opacity: 0; visibility: hidden; pointer-events: none; }
    }
    /* (no keys to press on a touch screen) */
    @media (max-width: 639px), (hover: none) and (pointer: coarse) {
      .rh-jumps kbd { display: none; }
      .rh-jumps h2 { margin-right: calc(30 * var(--px)); }
      .rh-jumps-x { padding: calc(6 * var(--px)); }
    }
    .mu-calm ~ .rh { --mu-lift: 0px; }
    .mu-calm ~ .rh .rh-jump .mu-glow::before { animation: none; }
    .mu-calm ~ .rh .rh-jumps, .mu-calm ~ .rh .rh-pick .rh-icon { transform: none !important; }`;
  document.head.append(style);
}
