import type { PlaceDef } from '../layout';
import { DEFAULT_SETTINGS, VOLUME_KEYS, type Lang, type MapSettings, type PlaceId, type RoamMode, type UISound, type VolumeKey } from '../types';
import { ICON } from './icons';
import { num, onLang, placeText, setLang, t, type WordKey } from './lang';
import { steppedRing, steppedShape } from './shape';

/**
 * The map's interface over the 3D view, after the concept art
 * (assets/world-map-selection-screen/): the title card (top left), a pin card
 * per place (placed from the place's beacon on screen), the info panel with
 * "Begin expedition" (right side; a bottom sheet on phones), the gear and
 * mute buttons with the settings panel and the ខ្មែរ / EN switch (top
 * right) and the hint line (bottom right). Styles: map.css (classes start
 * with `mu-`). Words: lang.ts (`data-t` / `data-t-aria` / `data-t-title`
 * name the word an element shows; `fillWords` fills them in the language).
 *
 * Keys: Tab / arrows move between cards, Enter picks, Esc goes back (or
 * closes the settings). A click on the empty map goes back too.
 *
 * While the explorer roams the map (`setRoaming`), the picker steps back:
 * no title, hint or info panel; the cards become small name pins over their
 * beacons that fade with distance and cannot be clicked; the keys and clicks
 * are the roaming's. The gear and mute buttons stay (top right), the
 * mini-map under them fades while the settings are open; the roaming HUD has
 * the top-left and bottom-left corners and the bottom centre.
 *
 * Shots (`?shot=1`) can show states: `uistate=` a comma list of
 * `hover:<id>`, `focus:<id>` (keyboard ring), `pressed:<id>`,
 * `selected:<id>` (panel open, camera stays: add `focus=<id>` to fly it),
 * `settings`, `muted`, `begin` (the fade to black), `roam` (the interface
 * while roaming, without the roaming itself: add `cam=` to stand somewhere).
 */
export interface MapUIHandlers {
  /** A card is hovered (null: none). */
  onHover(id: PlaceId | null): void;
  /** A place is picked (null: back to the overview). */
  onSelect(id: PlaceId | null): void;
  /** "Begin expedition" on the picked place. */
  onBegin(id: PlaceId): void;
  onSettings(s: MapSettings): void;
  /** Play an interface sound. */
  onSound(s: UISound): void;
  /** The first click / key / touch on the page (sound may start now). */
  onFirstGesture(): void;
  /** "Our story" in the settings: show the story again (story/story.ts). */
  onStory(): void;
}

/** Screen point of a place's anchor (CSS px) and whether it is in front of the camera. */
export interface AnchorOnScreen {
  x: number;
  y: number;
  visible: boolean;
  /** Metres from the camera to the anchor (the roaming pins fade with it and show it). */
  dist?: number;
}

export interface MapUI {
  /** Each frame: where each place's anchor is on screen. */
  update(anchors: Record<PlaceId, AnchorOnScreen>, dt: number): void;
  /** The picked place changed from outside (keys, URL). */
  setSelected(id: PlaceId | null): void;
  /** Night 0‥1, for anything that should follow the time of day. */
  setNight(night: number): void;
  /**
   * The player is roaming the map with the explorer (any mode but
   * `overview`): the picker steps back (no title, no arrow-key card focus,
   * no click-to-go-back) so the roaming controls and view have the screen.
   */
  setRoaming(mode: RoamMode): void;
  /** Change (and keep) the language from outside: the story's ខ្មែរ / EN switch. */
  setLang(l: Lang): void;
}

/** Card offsets in `PlaceDef.card` are CSS px for a view this wide. */
const CARD_REF_WIDTH = 1280;
/** The interface is drawn at 1× for the concept art's size (1672 × 941). */
const ART = { w: 1672, h: 941 };
/** Volumes restored by "unmute" (kept when muting). */
const UNMUTE_KEY = 'angkor-map-unmute';
/** Every volume but the master. */
const PART_KEYS = VOLUME_KEYS.filter((k) => k !== 'master');
/** Where each volume's slider goes: at the top (master, music), or under a sub-heading (its word): the sounds around you, your own. */
const SOUND_PART: Record<VolumeKey, WordKey | null> = {
  master: null,
  music: null,
  ambience: 'soundAround',
  water: 'soundAround',
  animals: 'soundAround',
  steps: 'soundYours',
  moves: 'soundYours',
  ui: 'soundYours',
};
/** The on / off settings (a switch each in the panel). */
type SwitchKey = 'calm' | 'easyFly';
/** The language switch: each button shows its language in that language. */
const LANG_LABEL: Record<Lang, string> = { km: 'ខ្មែរ', en: 'EN' };
/** Latin fonts, and the Khmer ones they fall back to (lang.ts). */
const FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;600;700;800&family=Pixelify+Sans:wght@500;600;700&family=Kantumruy+Pro:wght@400;600;700&family=Koulen&display=swap';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function loadFonts(): void {
  if (document.getElementById('mu-fonts')) return;
  const pre = (href: string, cross: boolean) => {
    const l = el('link');
    l.rel = 'preconnect';
    l.href = href;
    if (cross) l.crossOrigin = '';
    document.head.append(l);
  };
  pre('https://fonts.googleapis.com', false);
  pre('https://fonts.gstatic.com', true);
  const l = el('link');
  l.id = 'mu-fonts';
  l.rel = 'stylesheet';
  l.href = FONTS_HREF;
  document.head.append(l);
}

/** A panel's layers: fill with its stepped border (`mu-bg`), and an optional glow ring. */
function framed<T extends HTMLElement>(host: T, size: 'sm' | 'md' | 'lg', glow = false): T {
  host.classList.add('mu-frame', `mu-${size}`);
  host.prepend(el('span', 'mu-bg'));
  if (glow) host.querySelector('.mu-bg')!.after(el('span', 'mu-glow'));
  return host;
}

interface Card {
  place: PlaceDef;
  button: HTMLButtonElement;
  /** Measured size (CSS px). */
  w: number;
  h: number;
  shown: boolean;
  /** Push that keeps cards from overlapping (eased, px). */
  push: number;
  /** Last placed centre (for arrow keys). */
  cx: number;
  cy: number;
  /** Roaming: the pin's opacity (fades with distance) and its distance text, as last set. */
  fade: number;
  dist: string;
}

export function createMapUI(root: HTMLElement, places: PlaceDef[], h: MapUIHandlers, initial: MapSettings): MapUI {
  const params = new URLSearchParams(location.search);
  const shot = params.get('shot') === '1';
  loadFonts();

  let settings: MapSettings = { ...initial };
  let selected: PlaceId | null = null;
  let hovered: PlaceId | null = null;
  let settingsOpen = false;
  let begun = false;
  let night = -1;
  /** The explorer is roaming the map: the cards are name pins, the keys are the roaming's. */
  let roaming = false;
  /** Interface scale (`--u`). */
  let unit = 1;
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');

  root.replaceChildren();
  root.classList.add('mu-root');
  if (shot) root.classList.add('mu-shot');
  // Stepped corners (cut px, steps) and edge rings (px), after the art.
  root.style.setProperty('--mu-shape-sm', steppedShape(8, 4));
  root.style.setProperty('--mu-ring-sm', steppedRing(8, 4, 1.25));
  root.style.setProperty('--mu-ring-sm-b', steppedRing(8, 4, 2.5));
  root.style.setProperty('--mu-shape-md', steppedShape(10, 5));
  root.style.setProperty('--mu-ring-md', steppedRing(10, 5, 1.25));
  root.style.setProperty('--mu-shape-lg', steppedShape(12, 4));
  root.style.setProperty('--mu-ring-lg', steppedRing(12, 4, 1.5));

  // ── Title ────────────────────────────────────────────────────────────────
  const title = framed(el('header', 'mu-title', `
    <span class="mu-title-icon">${ICON.temple}</span>
    <span class="mu-title-text"><h1 data-t="title"></h1><p data-t="tagline"></p></span>`), 'lg');

  // ── Pin cards ────────────────────────────────────────────────────────────
  const pinsNav = el('nav', 'mu-pins');
  pinsNav.dataset.tAria = 'places';
  const cards: Card[] = places.map((p) => {
    const b = el('button', `mu-pin is-off${p.id === 'sanctuary' ? ' is-main' : ''}${p.href ? '' : ' is-soon'}`);
    b.type = 'button';
    b.dataset.id = p.id;
    b.setAttribute('aria-controls', 'mu-info');
    b.setAttribute('aria-expanded', 'false');
    const inner = framed(el('span', 'mu-pin-in', `
      <span class="mu-pin-icon">${ICON.pin}</span>
      <span class="mu-pin-text"><span class="mu-pin-name"></span><span class="mu-pin-sub"></span><span class="mu-pin-dist"></span></span>
      <span class="mu-pin-chev">${ICON.chevron}</span>`), 'sm', true);
    b.append(inner);
    pinsNav.append(b);
    return { place: p, button: b, w: 200, h: 48, shown: false, push: 0, cx: -1e4, cy: -1e4, fade: 1, dist: '' };
  });
  const cardById = new Map(cards.map((c) => [c.place.id, c]));

  // ── Info panel ───────────────────────────────────────────────────────────
  const info = framed(el('aside', 'mu-info', `
    <div class="mu-grip" aria-hidden="true"></div>
    <div class="mu-info-top">
      <button type="button" class="mu-back" data-t-aria="backToMap">${ICON.back}<span data-t="map"></span></button>
      <span class="mu-info-kicker" data-t="destination"></span>
    </div>
    <div class="mu-info-body"></div>`), 'lg');
  info.id = 'mu-info';
  info.setAttribute('aria-labelledby', 'mu-info-name');
  const infoBody = info.querySelector<HTMLElement>('.mu-info-body')!;
  const backBtn = info.querySelector<HTMLButtonElement>('.mu-back')!;

  // ── Corner buttons and settings ─────────────────────────────────────────
  const corner = el('div', 'mu-corner');
  const langSwitch = framed(el('div', 'mu-lang', (['km', 'en'] as Lang[]).map((l) => `<button type="button" lang="${l}" data-lang="${l}">${LANG_LABEL[l]}</button>`).join('')), 'md');
  langSwitch.setAttribute('role', 'group');
  langSwitch.dataset.tAria = 'language';
  const langBtns = [...langSwitch.querySelectorAll<HTMLButtonElement>('button')];
  const muteBtn = framed(el('button', 'mu-round mu-mute'), 'md');
  muteBtn.type = 'button';
  muteBtn.dataset.tAria = 'mute';
  const gearBtn = framed(el('button', 'mu-round mu-gear', ICON.gear), 'md');
  gearBtn.type = 'button';
  gearBtn.dataset.tAria = 'settings';
  gearBtn.setAttribute('aria-controls', 'mu-settings');
  gearBtn.setAttribute('aria-expanded', 'false');
  corner.append(langSwitch, muteBtn, gearBtn);

  const slider = (k: VolumeKey) =>
    `<label class="mu-slider${k === 'master' ? ' is-master' : ''}" data-t-title="${k}Tip"><span data-t="${k}"></span><input type="range" min="0" max="100" step="1" data-k="${k}"><output></output></label>`;
  // (the sliders in `VOLUME_KEYS` order, a sub-heading over each part but the top)
  const soundParts = [...new Set(VOLUME_KEYS.map((k) => SOUND_PART[k]))].map((p) => {
    const rows = VOLUME_KEYS.filter((k) => SOUND_PART[k] === p).map(slider).join('');
    return p ? `<div class="mu-set-sub" role="group" aria-labelledby="mu-${p}-h"><h4 id="mu-${p}-h" data-t="${p}"></h4>${rows}</div>` : rows;
  });
  const panel = framed(el('section', 'mu-settings', `
    <div class="mu-set-head"><h2 data-t="settings"></h2><button type="button" class="mu-x" data-t-aria="closeSettings">${ICON.close}</button></div>
    <div class="mu-set-body">
      <div class="mu-set-group" role="group" data-t-aria="sound">
        <h3 data-t="sound"></h3>
        ${soundParts.join('')}
      </div>
      <div class="mu-set-group">
        <h3 id="mu-time-h" data-t="time"></h3>
        <div class="mu-seg" role="group" aria-labelledby="mu-time-h">
          <button type="button" data-time="day">${ICON.sun}<span data-t="day"></span></button>
          <button type="button" data-time="night">${ICON.moon}<span data-t="night"></span></button>
          <button type="button" data-time="cycle">${ICON.cycle}<span data-t="cycle"></span></button>
        </div>
      </div>
      <div class="mu-set-row">
        <span id="mu-calm-l"><span data-t="calm"></span><small data-t="calmNote"></small></span>
        <button type="button" class="mu-switch" role="switch" data-set="calm" aria-labelledby="mu-calm-l"><span></span></button>
      </div>
      <div class="mu-set-row">
        <span id="mu-fly-l"><span data-t="easyFly"></span><small class="mu-fly-note"></small></span>
        <button type="button" class="mu-switch" role="switch" data-set="easyFly" aria-labelledby="mu-fly-l"><span></span></button>
      </div>
      <div class="mu-set-row">
        <span id="mu-story-l"><span data-t="stStory"></span><small data-t="stStoryNote"></small></span>
        <button type="button" class="mu-watch" aria-describedby="mu-story-l">${ICON.play}<span data-t="stWatch"></span></button>
      </div>
    </div>`), 'lg');
  panel.id = 'mu-settings';
  panel.setAttribute('role', 'dialog');
  panel.dataset.tAria = 'settings';
  const sliders = [...panel.querySelectorAll<HTMLInputElement>('input[type=range]')];
  const segBtns = [...panel.querySelectorAll<HTMLButtonElement>('.mu-seg button')];
  /** The on / off settings: a switch each (`data-set` names the setting). */
  const switches = [...panel.querySelectorAll<HTMLButtonElement>('.mu-switch')];
  /** Everything under the panel's heading: it scrolls when the screen is too low for it all. */
  const setBody = panel.querySelector<HTMLElement>('.mu-set-body')!;

  // ── Hint, fade, live region ─────────────────────────────────────────────
  const hint = el('p', 'mu-hint', `${ICON.plane}<span data-t="hint"></span>`);
  const fade = el('div', 'mu-fade', '<p></p>');
  const live = el('p', 'mu-sr');
  live.setAttribute('aria-live', 'polite');

  root.append(title, hint, pinsNav, info, corner, panel, fade, live);

  // ── Words (lang.ts) ──────────────────────────────────────────────────────
  /**
   * The easy flying note names the glider's keys, or the stick of the touch
   * controls (roam/touch.ts) when the last press was a finger (on a
   * touch-first device, before any).
   */
  const flyNote = panel.querySelector<HTMLElement>('.mu-fly-note')!;
  let touchUse = matchMedia('(pointer: coarse)').matches;
  const fillFlyNote = () => (flyNote.textContent = t(touchUse ? 'easyFlyNoteTouch' : 'easyFlyNote'));
  addEventListener(
    'pointerdown',
    (e) => {
      if ((e.pointerType === 'touch') === touchUse) return;
      touchUse = !touchUse;
      fillFlyNote();
    },
    { capture: true, passive: true },
  );

  /** Every word in the language in use: the marked elements, the cards and the open panel. */
  function fillWords(): void {
    for (const e of root.querySelectorAll<HTMLElement>('[data-t]')) e.textContent = t(e.dataset.t as WordKey);
    fillFlyNote();
    for (const e of root.querySelectorAll<HTMLElement>('[data-t-aria]')) e.setAttribute('aria-label', t(e.dataset.tAria as WordKey));
    for (const e of root.querySelectorAll<HTMLElement>('[data-t-title]')) e.title = t(e.dataset.tTitle as WordKey);
    for (const c of cards) {
      const p = placeText(c.place);
      c.button.querySelector('.mu-pin-name')!.textContent = p.name;
      c.button.querySelector('.mu-pin-sub')!.textContent = p.subtitle;
      c.button.setAttribute('aria-label', `${p.name}, ${p.subtitle}${c.place.href ? '' : t('pinSoon')}`);
      // (the roaming pins write their distance again next frame)
      c.dist = '';
    }
    if (selected) renderInfo(cardById.get(selected)!.place);
  }
  fillWords();
  onLang(() => {
    fillWords();
    syncSettings();
    // Khmer and English words differ in size.
    measure();
  });

  // ── Sizes ────────────────────────────────────────────────────────────────
  /** Screen boxes cards keep out of: title and corner buttons (cards go below), the hint line (cards go above). */
  let obstacles: { r: DOMRect; up: boolean }[] = [];
  /** The open info panel's box (layout, without its slide): cards under it hide. */
  let infoBox: { l: number; t: number; r: number; b: number } | null = null;
  function measureInfo(): void {
    infoBox = selected ? { l: info.offsetLeft, t: info.offsetTop, r: info.offsetLeft + info.offsetWidth, b: info.offsetTop + info.offsetHeight } : null;
  }
  let lastAnchors: Record<PlaceId, AnchorOnScreen> | null = null;
  function measure(): void {
    // Interface scale: the art's size at 1672 × 941, never below 0.8 on a desktop (phones: own sizes in map.css).
    unit = innerWidth < 640 ? 0.74 : clamp(Math.min(innerWidth / ART.w, innerHeight / ART.h), 0.8, 1.3);
    root.style.setProperty('--u', unit.toFixed(3));
    for (const c of cards) {
      c.w = c.button.offsetWidth || c.w;
      c.h = c.button.offsetHeight || c.h;
    }
    obstacles = [
      { r: title.getBoundingClientRect(), up: false },
      { r: corner.getBoundingClientRect(), up: false },
      { r: hint.getBoundingClientRect(), up: true },
    ];
    measureInfo();
    scrollEdges();
    // Shots render once: place the cards again with the new sizes.
    if (lastAnchors) place(lastAnchors, 0);
  }
  measure();
  addEventListener('resize', measure);
  void document.fonts?.ready.then(measure);
  document.fonts?.addEventListener?.('loadingdone', measure);

  // ── Motion ───────────────────────────────────────────────────────────────
  function applyCalm(): void {
    root.classList.toggle('mu-calm', settings.calm || reducedQuery.matches);
  }
  reducedQuery.addEventListener?.('change', applyCalm);

  // ── Sound helpers ────────────────────────────────────────────────────────
  let lastHoverSound = 0;
  function hoverSound(): void {
    const now = performance.now();
    if (now - lastHoverSound < 70) return;
    lastHoverSound = now;
    h.onSound('hover');
  }

  // ── Selection ────────────────────────────────────────────────────────────
  function renderInfo(p: PlaceDef): void {
    const w = placeText(p);
    const body = el('div', 'mu-info-card', `
      <div class="mu-info-head">
        <span class="mu-info-pin">${ICON.pin}</span>
        <div><h2 id="mu-info-name">${esc(w.name)}</h2><p class="mu-info-sub">${esc(w.subtitle)}</p></div>
      </div>
      <div class="mu-orn" aria-hidden="true"><i></i>${ICON.diamond}<i></i></div>
      <p class="mu-info-blurb">${esc(w.blurb)}</p>
      <ul class="mu-facts">${w.facts.map((f) => `<li>${ICON.diamond}${esc(f)}</li>`).join('')}</ul>
      ${p.href
        ? `<button type="button" class="mu-begin">${esc(t('begin'))}${ICON.arrow}</button>`
        : `<button type="button" class="mu-begin" disabled aria-disabled="true">${ICON.hourglass}${esc(t('soon'))}</button><p class="mu-soon-note">${esc(t('soonNote'))}</p>`}`);
    const begin = body.querySelector<HTMLButtonElement>('.mu-begin')!;
    framed(begin, 'md', true);
    if (p.href) begin.addEventListener('click', () => beginExpedition(p));
    infoBody.replaceChildren(body);
    info.classList.toggle('is-main', p.id === 'sanctuary');
  }

  function applySelected(id: PlaceId | null): void {
    const prev = selected;
    selected = id;
    for (const c of cards) {
      const on = c.place.id === id;
      c.button.classList.toggle('is-selected', on);
      c.button.setAttribute('aria-expanded', String(on));
    }
    root.classList.toggle('mu-has-pick', !!id);
    if (id) {
      const p = cardById.get(id)!.place;
      if (id !== prev) renderInfo(p);
      info.classList.add('is-open');
      info.inert = false;
      measureInfo();
      info.removeAttribute('aria-hidden');
      const w = placeText(p);
      live.textContent = `${w.name}, ${w.subtitle}. ${t(p.href ? 'ready' : 'soonLive')}`;
    } else {
      info.classList.remove('is-open');
      info.inert = true;
      measureInfo();
      info.setAttribute('aria-hidden', 'true');
      if (prev) live.textContent = t('backLive');
    }
  }

  function pick(id: PlaceId, byKey: boolean): void {
    // (roaming: the pins are only markers)
    if (begun || roaming) return;
    if (settingsOpen) toggleSettings(false, false);
    if (id !== selected) {
      h.onSound('select');
      applySelected(id);
      h.onSelect(id);
    }
    // Keyboard: go on to the panel's button (Enter again begins).
    if (byKey) {
      const b = info.querySelector<HTMLButtonElement>('.mu-begin:not([disabled])') ?? backBtn;
      b.focus({ preventScroll: true });
    }
  }

  function back(): void {
    if (!selected || begun) return;
    const was = selected;
    const hadFocus = info.contains(document.activeElement);
    h.onSound('back');
    applySelected(null);
    h.onSelect(null);
    if (hadFocus) cardById.get(was)?.button.focus({ preventScroll: true });
  }

  function beginExpedition(p: PlaceDef): void {
    if (begun || !p.href) return;
    begun = true;
    h.onSound('begin');
    h.onBegin(p.id);
    fade.querySelector('p')!.textContent = t('settingOut', { name: placeText(p).name });
    fade.classList.add('is-on');
    root.classList.add('mu-begun');
  }
  // Back from the next page (bfcache): lift the fade again.
  addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    begun = false;
    fade.classList.remove('is-on');
    root.classList.remove('mu-begun');
  });

  // ── Card events ──────────────────────────────────────────────────────────
  for (const c of cards) {
    const id = c.place.id;
    const b = c.button;
    b.addEventListener('click', (e) => pick(id, e.detail === 0));
    b.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse' || begun) return;
      hovered = id;
      h.onHover(id);
      hoverSound();
    });
    b.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'mouse' || hovered !== id) return;
      hovered = null;
      h.onHover(null);
    });
    b.addEventListener('focus', () => {
      if (!b.matches(':focus-visible')) return;
      hovered = id;
      h.onHover(id);
    });
    b.addEventListener('blur', () => {
      if (hovered !== id) return;
      hovered = null;
      h.onHover(null);
    });
  }
  backBtn.addEventListener('click', back);

  // ── Settings ─────────────────────────────────────────────────────────────
  /** Silent: the master is down, or every other volume is. */
  const isMuted = () => settings.master === 0 || PART_KEYS.every((k) => settings[k] === 0);

  function syncSettings(): void {
    for (const s of sliders) {
      const k = s.dataset.k as VolumeKey;
      const v = Math.round(settings[k] * 100);
      s.value = String(v);
      s.style.setProperty('--v', `${v}%`);
      s.nextElementSibling!.textContent = num(v);
      s.setAttribute('aria-valuetext', t('percent', { n: String(v) }));
    }
    for (const b of segBtns) b.setAttribute('aria-pressed', String(b.dataset.time === settings.time));
    for (const b of switches) b.setAttribute('aria-checked', String(settings[b.dataset.set as SwitchKey]));
    const muted = isMuted();
    muteBtn.innerHTML = '';
    muteBtn.append(el('span', 'mu-bg'));
    muteBtn.insertAdjacentHTML('beforeend', muted ? ICON.muted : ICON.speaker);
    muteBtn.setAttribute('aria-pressed', String(muted));
    muteBtn.classList.toggle('is-off', muted);
    for (const b of langBtns) b.setAttribute('aria-pressed', String(b.dataset.lang === settings.lang));
    applyCalm();
    // (a new language fills the words again: `onLang` above)
    setLang(settings.lang);
  }

  function change(s: Partial<MapSettings>): void {
    settings = { ...settings, ...s };
    syncSettings();
    h.onSettings(settings);
  }

  function toggleSettings(open = !settingsOpen, sound = true): void {
    if (open === settingsOpen) return;
    settingsOpen = open;
    panel.classList.toggle('is-open', open);
    // (the roaming mini-map, under the gear, fades while the panel is open: map.css)
    root.classList.toggle('mu-set-open', open);
    panel.inert = !open;
    if (open) panel.removeAttribute('aria-hidden');
    else panel.setAttribute('aria-hidden', 'true');
    gearBtn.setAttribute('aria-expanded', String(open));
    gearBtn.classList.toggle('is-on', open);
    if (sound) h.onSound(open ? 'open' : 'close');
    if (open) sliders[0].focus({ preventScroll: true });
    else if (panel.contains(document.activeElement)) gearBtn.focus({ preventScroll: true });
  }
  /** Soft edges on the panel's body where there is more to scroll to (map.css). */
  function scrollEdges(): void {
    setBody.classList.toggle('is-more-up', setBody.scrollTop > 1);
    setBody.classList.toggle('is-more-down', setBody.scrollTop + setBody.clientHeight < setBody.scrollHeight - 1);
  }
  setBody.addEventListener('scroll', scrollEdges, { passive: true });
  panel.inert = true;
  panel.setAttribute('aria-hidden', 'true');
  info.inert = true;
  info.setAttribute('aria-hidden', 'true');

  gearBtn.addEventListener('click', () => toggleSettings());
  panel.querySelector('.mu-x')!.addEventListener('click', () => toggleSettings(false));
  panel.querySelector('.mu-watch')!.addEventListener('click', () => {
    toggleSettings(false, false);
    h.onStory();
  });

  let lastTick = 0;
  for (const s of sliders) {
    s.addEventListener('input', () => {
      const k = s.dataset.k as VolumeKey;
      const v = Number(s.value) / 100;
      // Moving a slider while muted brings the sound back too (the moved slider keeps its value).
      const restore: Partial<MapSettings> = isMuted() && v > 0 ? unmuted() : {};
      change({ ...restore, [k]: v });
      const now = performance.now();
      if (now - lastTick > 70) {
        lastTick = now;
        h.onSound('tick');
      }
    });
  }
  for (const b of segBtns)
    b.addEventListener('click', () => {
      const time = b.dataset.time as MapSettings['time'];
      if (time === settings.time) return;
      change({ time });
      h.onSound('toggle');
    });
  for (const b of switches)
    b.addEventListener('click', () => {
      const k = b.dataset.set as SwitchKey;
      change({ [k]: !settings[k] });
      h.onSound('toggle');
    });
  for (const b of langBtns)
    b.addEventListener('click', () => {
      const l = b.dataset.lang as Lang;
      if (l === settings.lang) return;
      change({ lang: l });
      h.onSound('toggle');
    });

  /** The volumes kept by the last mute (volumes it did not keep: the defaults). */
  function savedVolumes(): Pick<MapSettings, VolumeKey> {
    const out = Object.fromEntries(VOLUME_KEYS.map((k) => [k, DEFAULT_SETTINGS[k]])) as Pick<MapSettings, VolumeKey>;
    try {
      const v = JSON.parse(localStorage.getItem(UNMUTE_KEY) ?? 'null');
      if (v && typeof v === 'object') {
        const kept = { ...out };
        for (const k of VOLUME_KEYS) if (typeof v[k] === 'number' && Number.isFinite(v[k])) kept[k] = clamp(v[k], 0, 1);
        // (a kept set that is itself silent would not unmute)
        if (kept.master > 0 && PART_KEYS.some((k) => kept[k] > 0)) return kept;
      }
    } catch {
      /* no storage */
    }
    return out;
  }
  /** What brings the sound back: the kept master if it is down, the kept others if they all are. */
  function unmuted(): Partial<MapSettings> {
    const kept = savedVolumes();
    const out: Partial<MapSettings> = {};
    if (settings.master === 0) out.master = kept.master;
    if (PART_KEYS.every((k) => settings[k] === 0)) for (const k of PART_KEYS) out[k] = kept[k];
    return out;
  }
  // Mute turns the master down (the mix stays as it was); unmute brings it back.
  muteBtn.addEventListener('click', () => {
    if (isMuted()) {
      change(unmuted());
      h.onSound('toggle');
    } else {
      h.onSound('toggle');
      try {
        localStorage.setItem(UNMUTE_KEY, JSON.stringify(Object.fromEntries(VOLUME_KEYS.map((k) => [k, settings[k]]))));
      } catch {
        /* no storage: unmute brings the defaults */
      }
      change({ master: 0 });
    }
  });
  syncSettings();

  // ── Page-wide input ──────────────────────────────────────────────────────
  // Browsers let sound start only inside an "activating" event: a mouse
  // pointerdown, a touch / pen pointerup, or a key (not Esc).
  let gestured = false;
  const firstGesture = (e: Event) => {
    if (gestured) return;
    if (e instanceof PointerEvent && (e.type === 'pointerdown') !== (e.pointerType === 'mouse')) return;
    if (e instanceof KeyboardEvent && e.key === 'Escape') return;
    gestured = true;
    for (const t of ['pointerdown', 'pointerup', 'keydown']) removeEventListener(t, firstGesture, true);
    h.onFirstGesture();
  };
  for (const t of ['pointerdown', 'pointerup', 'keydown']) addEventListener(t, firstGesture, true);

  const reporting = () => document.body.classList.contains('reporting');

  /** Arrow keys: the nearest shown card that way from the focused one. */
  function moveFocus(dx: number, dy: number): void {
    const shown = cards.filter((c) => c.shown);
    if (!shown.length) return;
    const from = cards.find((c) => c.button === document.activeElement) ?? (selected ? cardById.get(selected) : undefined);
    if (!from || !from.shown) {
      (shown.find((c) => c.place.id === 'sanctuary') ?? shown[0]).button.focus();
      return;
    }
    let best: Card | null = null;
    let bestCost = Infinity;
    for (const c of shown) {
      if (c === from) continue;
      const vx = c.cx - from.cx;
      const vy = c.cy - from.cy;
      const along = vx * dx + vy * dy;
      if (along <= 4) continue;
      const across = Math.abs(vx * dy - vy * dx);
      const cost = along + across * 2.2;
      if (cost < bestCost) {
        bestCost = cost;
        best = c;
      }
    }
    if (best) {
      best.button.focus();
      hoverSound();
    }
  }

  addEventListener('keydown', (e) => {
    if (reporting() || e.ctrlKey || e.metaKey || e.altKey) return;
    // (roaming: the keys move the explorer, and Esc goes back to the overview,
    // unless it closes the settings first)
    if (roaming) {
      if (e.key === 'Escape' && settingsOpen) {
        toggleSettings(false);
        e.preventDefault();
      }
      return;
    }
    const t = e.target as HTMLElement | null;
    if (e.key === 'Escape') {
      if (settingsOpen) toggleSettings(false);
      else if (selected) back();
      else return;
      e.preventDefault();
      return;
    }
    const dir = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[e.key];
    if (!dir || begun) return;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || panel.contains(t))) return;
    e.preventDefault();
    moveFocus(dir[0], dir[1]);
  });

  // A click (not a drag) on the empty map: close the settings, else go back.
  let down: { x: number; y: number; t: number } | null = null;
  addEventListener('pointerdown', (e) => {
    down = e.target instanceof HTMLCanvasElement ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
  });
  addEventListener('pointerup', (e) => {
    const d = down;
    down = null;
    if (!d || reporting() || !(e.target instanceof HTMLCanvasElement)) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8 || performance.now() - d.t > 700) return;
    if (settingsOpen) toggleSettings(false);
    else if (!roaming) back();
  });

  // Phones: drag the sheet's grip down to close it.
  const grip = info.querySelector<HTMLElement>('.mu-grip')!;
  let drag: { y: number; id: number } | null = null;
  grip.addEventListener('pointerdown', (e) => {
    drag = { y: e.clientY, id: e.pointerId };
    grip.setPointerCapture(e.pointerId);
    info.classList.add('is-drag');
  });
  grip.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    info.style.setProperty('--drag', `${Math.max(0, e.clientY - drag.y)}px`);
  });
  const endDrag = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y;
    drag = null;
    info.classList.remove('is-drag');
    info.style.removeProperty('--drag');
    if (dy > 70) back();
  };
  grip.addEventListener('pointerup', endDrag);
  grip.addEventListener('pointercancel', endDrag);

  // ── Shot states (`uistate=`) ─────────────────────────────────────────────
  if (shot) {
    for (const s of (params.get('uistate') ?? '').split(',').filter(Boolean)) {
      const [k, v] = s.split(':') as [string, PlaceId | undefined];
      const c = v ? cardById.get(v) : undefined;
      if (k === 'hover' && c) {
        c.button.classList.add('is-hover');
        h.onHover(c.place.id);
      }
      if (k === 'focus' && c) c.button.classList.add('is-focus');
      if (k === 'pressed' && c) c.button.classList.add('is-hover', 'is-press');
      if (k === 'selected' && c) applySelected(c.place.id);
      if (k === 'settings') toggleSettings(true, false);
      if (k === 'muted') {
        settings = { ...settings, master: 0 };
        syncSettings();
      }
      if (k === 'roam') queueMicrotask(() => setRoaming('walk'));
      if (k === 'begin') {
        const p = (selected && cardById.get(selected)?.place) || places[0];
        fade.querySelector('p')!.textContent = t('settingOut', { name: placeText(p).name });
        fade.classList.add('is-on', 'is-half');
      }
    }
  }

  // ── Frame ────────────────────────────────────────────────────────────────
  const MARGIN = 8;
  const GAP = 6;
  /** How far off the view a beacon may be and still show its card (px). */
  const EDGE = 24;
  /** Cards at their beacons (+ the art's offset), inside the view, clear of the corners and of each other. */
  function place(anchors: Record<PlaceId, AnchorOnScreen>, dt: number): void {
    if (roaming) return placePins(anchors, dt);
    const k = innerWidth / CARD_REF_WIDTH;
    const phone = innerWidth < 640;
    const want = new Map<Card, number>();
    for (const c of cards) {
      const a = anchors[c.place.id];
      if (!a) continue;
      const [ox, oy] = c.place.card;
      const s = phone ? 0.55 : 1;
      c.cx = clamp(a.x + ox * k * s, c.w / 2 + MARGIN, innerWidth - c.w / 2 - MARGIN);
      c.cy = clamp(a.y + oy * k * s, c.h / 2 + MARGIN, innerHeight - c.h / 2 - MARGIN);
      const under = !!infoBox && c.cx + c.w / 2 > infoBox.l && c.cx - c.w / 2 < infoBox.r && c.cy + c.h / 2 > infoBox.t && c.cy - c.h / 2 < infoBox.b;
      // The beacon must be on screen (a card pinned to the edge far from it
      // would mislead) — except on a phone's overview, whose narrow view
      // shows only the middle of the map: there cards wait at the edges.
      const edge = phone && !selected ? innerWidth * 0.6 : EDGE;
      const onScreen = a.x > -edge && a.x < innerWidth + edge && a.y > -EDGE && a.y < innerHeight + EDGE;
      const shown = a.visible && onScreen && !begun && !under;
      if (shown !== c.shown) {
        c.shown = shown;
        c.button.classList.toggle('is-off', !shown);
      }
      // Below the title / corner buttons, above the hint, when on them.
      let down = 0;
      let up = 0;
      for (const { r, up: above } of obstacles) {
        if (above && selected) continue; // the hint hides while a place is picked
        if (Math.abs(c.cx - (r.left + r.right) / 2) > (c.w + r.width) / 2 + GAP) continue;
        if (above) up = Math.max(up, c.cy + c.h / 2 - (r.top - GAP));
        else down = Math.max(down, r.bottom + GAP - (c.cy - c.h / 2));
      }
      want.set(c, down > 0 ? down : -up);
    }
    settle(want, dt);
  }

  /** Keep shown cards apart (push overlapping pairs up / down, from where `want` already moves them), then move them there. */
  function settle(want: Map<Card, number>, dt: number): void {
    const shown = cards.filter((c) => c.shown).sort((a, b) => a.cy + want.get(a)! - (b.cy + want.get(b)!));
    for (let pass = 0; pass < 3; pass++)
      for (let i = 0; i < shown.length; i++)
        for (let j = i + 1; j < shown.length; j++) {
          const a = shown[i];
          const b = shown[j];
          if (Math.abs(a.cx - b.cx) > (a.w + b.w) / 2 + GAP) continue;
          const overlap = (a.h + b.h) / 2 + GAP - (b.cy + want.get(b)! - (a.cy + want.get(a)!));
          if (overlap <= 0) continue;
          want.set(a, want.get(a)! - overlap / 2);
          want.set(b, want.get(b)! + overlap / 2);
        }
    // Eased, so a push that starts (a card sliding under another) glides.
    const ease = dt > 0 ? 1 - Math.exp(-dt * 8) : 1;
    for (const c of cards) {
      c.push += ((want.get(c) ?? 0) - c.push) * ease;
      c.cy += c.push;
      c.button.style.transform = `translate3d(${(c.cx - c.w / 2).toFixed(2)}px, ${(c.cy - c.h / 2).toFixed(2)}px, 0)`;
    }
  }

  // ── Roaming pins ─────────────────────────────────────────────────────────
  /** Gap between a pin and its beacon (the pin's stem), px at 1×. */
  const STEM = 12;
  /** Metres from the camera to a place's beacon: from main.ts (`dist`), else from the camera it puts on `window`. */
  function beaconDistance(a: AnchorOnScreen, p: PlaceDef): number {
    if (a.dist !== undefined) return a.dist;
    const cam = (window as unknown as { camera?: { position: { x: number; y: number; z: number } } }).camera;
    if (!cam) return 300;
    return Math.hypot(p.anchor[0] - cam.position.x, p.anchor[1] - cam.position.y, p.anchor[2] - cam.position.z);
  }
  const smooth = (a: number, b: number, v: number) => {
    const x = clamp((v - a) / (b - a), 0, 1);
    return x * x * (3 - 2 * x);
  };
  /** A pin's opacity at `d` m: gone when you are at the place (its prompt shows then), faint far off. */
  const pinFade = (d: number) => smooth(25, 50, d) * (1 - 0.6 * smooth(150, 700, d));
  const distText = (d: number) => (d < 1000 ? `${num(Math.max(10, Math.round(d / 10) * 10))} ${t('m')}` : `${num((d / 1000).toFixed(1))} ${t('km')}`);
  /** Screen boxes of the roaming HUD (px): its corners top left and bottom left, the prompt at the bottom. */
  /** The roaming mini-map and tool bar (found the first time pins are placed while roaming). */
  let roamHud: HTMLElement[] | null = null;
  function hudZones(): { l: number; t: number; r: number; b: number }[] {
    const u = unit;
    const w = innerWidth;
    const hgt = innerHeight;
    const prompt = hgt * 0.86;
    return [
      { l: 0, t: 0, r: 330 * u, b: 110 * u },
      { l: 0, t: hgt - 110 * u, r: 640 * u, b: hgt },
      { l: w / 2 - 250 * u, t: prompt - 70 * u, r: w / 2 + 250 * u, b: prompt + 16 * u },
    ];
  }
  /** While roaming: small name pins right over their beacons, fading with distance, none under the HUD or the corner buttons. */
  function placePins(anchors: Record<PlaceId, AnchorOnScreen>, dt: number): void {
    const zones = hudZones();
    const cr = corner.getBoundingClientRect();
    zones.push({ l: cr.left - GAP, t: 0, r: innerWidth, b: cr.bottom + GAP });
    // The roaming mini-map and tool bar (theirs: ui/minimap.ts, roam/tools.ts), where they show.
    for (const e of (roamHud ??= [...document.querySelectorAll<HTMLElement>('.mm-mini, .rtb')])) {
      const r = e.getBoundingClientRect();
      if (r.width > 0) zones.push({ l: r.left - GAP, t: r.top - GAP, r: r.right + GAP, b: r.bottom + GAP });
    }
    const want = new Map<Card, number>();
    for (const c of cards) {
      const a = anchors[c.place.id];
      if (!a) continue;
      const d = beaconDistance(a, c.place);
      c.cx = a.x;
      c.cy = a.y - c.h / 2 - STEM * unit;
      const inView = a.visible && a.x > c.w / 2 && a.x < innerWidth - c.w / 2 && c.cy > c.h / 2 && a.y < innerHeight;
      const l = c.cx - c.w / 2;
      const t = c.cy - c.h / 2;
      const underHud = zones.some((z) => l < z.r && l + c.w > z.l && t < z.b && t + c.h > z.t);
      const fade = pinFade(d);
      const shown = inView && !underHud && fade > 0.02 && !begun;
      if (shown !== c.shown) {
        c.shown = shown;
        c.button.classList.toggle('is-off', !shown);
      }
      if (Math.abs(fade - c.fade) > 0.01) {
        c.fade = fade;
        c.button.style.opacity = fade.toFixed(2);
      }
      const text = distText(d);
      if (text !== c.dist) {
        c.dist = text;
        c.button.querySelector('.mu-pin-dist')!.textContent = text;
        // ("90 m" and "1.2 km" differ in width: centre the pin again)
        c.w = c.button.offsetWidth || c.w;
      }
      want.set(c, 0);
    }
    settle(want, dt);
  }

  function setRoaming(mode: RoamMode): void {
    const on = mode !== 'overview';
    if (on === roaming) return;
    roaming = on;
    root.classList.toggle('mu-roam', on);
    // The pins are only markers now: no focus, no hover, no clicks.
    pinsNav.inert = on;
    if (on) {
      if (hovered) {
        hovered = null;
        h.onHover(null);
      }
      for (const c of cards) c.button.classList.remove('is-hover', 'is-press', 'is-focus');
      if (selected) applySelected(null);
    } else
      for (const c of cards) {
        c.fade = 1;
        c.dist = '';
        c.button.style.removeProperty('opacity');
      }
    live.textContent = t(on ? 'exploring' : 'backLive');
    // Pins and cards differ in size.
    measure();
  }

  return {
    update(anchors, dt) {
      lastAnchors = anchors;
      place(anchors, dt);
    },
    setSelected(id) {
      if (id !== selected) applySelected(id);
    },
    setNight(n) {
      if (Math.abs(n - night) < 0.004) return;
      night = n;
      root.style.setProperty('--mu-n', n.toFixed(3));
    },
    setRoaming,
    setLang(l) {
      if (l !== settings.lang) change({ lang: l });
    },
  };
}
