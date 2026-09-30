import type { PlaceDef } from '../layout';
import { DEFAULT_SETTINGS, GRAPHICS_CHOICES, MINIMAP_CHOICES, MOON_PATHS, VOLUME_KEYS, WEATHER_SETTINGS, type GraphicsChoice, type GraphicsLevel, type Lang, type MapSettings, type MiniMapChoice, type MoonPath, type PlaceId, type RoamMode, type UISound, type VolumeKey, type WeatherSetting } from '../types';
import posthog, { isPostHogConfigured } from '../../posthog';
import { PHONE } from '../graphics';
import { isResolutionShare, resolutionSizes, sizeForShare, sizeOfShare, stepOf, view, type ResolutionSize } from '../resolution';
import { FOG_AMOUNT_MAX } from '../sky/fogLevel';
import { createSupportCard } from './_support';
import { createTabs, type TabDef } from './_tabs';
import { CREDITS, SUPPORT_URL } from './credits';
import { ICON } from './icons';
import { lang, num, onLang, placeText, setLang, t, type WordKey } from './lang';
import { framed, setSteppedVars } from './shape';
import { padGlyph, type PadGlyph } from '../pad/glyphs';
import { clearMark, markFocus, moveFocusIn } from '../pad/nav';
import { pad } from '../pad/pad';

/**
 * The map's interface over the 3D view, after the concept art
 * (assets/world-map-selection-screen/): the title card (top left), a pin card
 * per place (placed from the place's beacon on screen), the info panel with
 * "Begin expedition" (right side; a bottom sheet on phones), the coffee,
 * credits and gear buttons with the settings panel (top right) and the hint
 * line (bottom right). Styles: map.css (classes start with `mu-`). Words:
 * lang.ts (`data-t` / `data-t-aria` / `data-t-title` name the word an element
 * shows; `fillWords` fills them in the language).
 *
 * The settings panel has five tabs (`_tabs.ts`), one page each, so it is only
 * as tall as the page you are on and the map stays in view: General (the
 * language, the time of day, the weather), Sound, Graphics (the graphics
 * level, the resolution, the fog, the battery saver), Play (the mini-map, the
 * key help, easy flying, reduce motion) and About (support the game, our
 * story, the credits). The gear opens the tab last used; the heart opens About.
 *
 * Keys: Tab / arrows move between cards, Enter picks, Esc goes back (or
 * closes the settings). A click on the empty map goes back too.
 *
 * A game pad (pad/pad.ts) works it as the keys do: the stick or the d-pad
 * between the cards (and on to the corner's buttons), ✕ picks, ○ goes back,
 * Options opens the settings, where L1 / R1 change the tab. The Play tab's
 * Controller group has the pad's vibration switch and its buttons; shots
 * draw them with `pad=ps|xbox` (`scroll:pad`).
 *
 * While the explorer roams the map (`setRoaming`), the picker steps back:
 * no title, hint or info panel; the cards become small name pins over their
 * beacons that fade with distance and cannot be clicked; the keys and clicks
 * are the roaming's. The corner buttons stay (top right), the mini-map
 * under them fades while the settings are open; the roaming HUD has the
 * top-left and bottom-left corners and the bottom centre.
 *
 * Shots (`?shot=1`) can show states: `uistate=` a comma list of
 * `hover:<id>`, `focus:<id>` (keyboard ring), `pressed:<id>`,
 * `selected:<id>` (panel open, camera stays: add `focus=<id>` to fly it),
 * `settings`, `tab:<id>` (the settings on that tab: general, sound,
 * graphics, play, about), `credits` (the settings on About, where the heart
 * goes), `muted`, `held` (the held-sound card), `weather:<setting>` (the
 * panel shows that weather chosen), `moon:high|low` (that moon's path
 * chosen; the sky's is `moonpath=`), `res:<share>` / `res:auto` (that
 * resolution picked), `battery` (the battery saver on), `fog:<0‥150>` (the
 * fog's thickness there), `scroll:<group>` (the settings
 * scrolled to that group, on its tab: lang, time, weather, moon, graphics, res,
 * fog, mini, pad), `begin` (the fade to black), `roam` (the interface while
 * roaming, without the roaming itself: add `cam=` to stand somewhere).
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
  /** The held-sound card was tapped: try to play again. */
  onWake(): void;
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
  /** The graphics level in use now (graphics.ts: Auto's pick, else the level chosen); Auto's note names it. */
  setGraphicsLevel(level: GraphicsLevel): void;
  /** The size the map is drawn at now, in pixels (main.ts, whenever it changes); the Resolution's Auto note names it. */
  setDrawSize(w: number, h: number): void;
  /** Back on the page, the browser still holds the sound: a card in the middle asks for a tap (audio.ts `onHeld`). */
  setSoundHeld(held: boolean): void;
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
type SwitchKey = 'calm' | 'easyFly' | 'keyHelp' | 'battery' | 'padRumble';
/**
 * The settings' tabs, in the bar's order (each page is `mu-set-page-<id>`).
 * Sound is the sound page's own word (lang.ts `sound`).
 */
type TabId = 'general' | 'sound' | 'graphics' | 'play' | 'about';
const TABS: TabDef<TabId>[] = [
  { id: 'general', word: 'tabGeneral', icon: ICON.sliders },
  { id: 'sound', word: 'sound', icon: ICON.speaker },
  { id: 'graphics', word: 'tabGraphics', icon: ICON.picture },
  { id: 'play', word: 'tabPlay', icon: ICON.gamepad },
  { id: 'about', word: 'tabAbout', icon: ICON.heartLine },
];
/** The tab of each choice's heading (`#mu-<group>-h`): a shot's `scroll:<group>` shows that tab first. */
const GROUP_TAB: Record<string, TabId> = { lang: 'general', time: 'general', weather: 'general', moon: 'general', graphics: 'graphics', res: 'graphics', fog: 'graphics', mini: 'play', pad: 'play' };
/** The snow choice's icon: a six-armed snowflake, drawn like the sun's rays (round strokes). */
const SNOW_ICON =
  '<svg class="mu-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
  [0, 60, 120].map((a) => `<path d="M12 2.6v18.8" transform="rotate(${a} 12 12)"/>`).join('') +
  [0, 60, 120, 180, 240, 300].map((a) => `<path d="M9.7 4.5 12 6.8l2.3-2.3" transform="rotate(${a} 12 12)"/>`).join('') +
  '</g></svg>';
/**
 * The weather setting's choices: icon, word, and the note under them while
 * chosen (lang.ts). Snow, the dream (it never snows at Angkor), has the whole
 * last row, under the four true to Cambodia.
 */
const WEATHER_CHOICE: Record<WeatherSetting, { icon: string; word: WordKey; note: WordKey }> = {
  season: { icon: ICON.season, word: 'wSeason', note: 'wSeasonNote' },
  clear: { icon: ICON.sun, word: 'wClear', note: 'wClearNote' },
  rainy: { icon: ICON.rain, word: 'wRainy', note: 'wRainyNote' },
  stormy: { icon: ICON.storm, word: 'wStormy', note: 'wStormyNote' },
  snow: { icon: SNOW_ICON, word: 'snSnow', note: 'snSnowNote' },
};
/**
 * The graphics setting's choices, the same way (graphics.ts says what each
 * level draws). Auto's note names the level in use (`setGraphicsLevel`).
 */
const GRAPHICS_CHOICE: Record<GraphicsChoice, { icon: string; word: WordKey; note: WordKey }> = {
  auto: { icon: ICON.auto, word: 'gAuto', note: 'gAutoNote' },
  low: { icon: ICON.bars1, word: 'gLow', note: 'gLowNote' },
  medium: { icon: ICON.bars2, word: 'gMedium', note: 'gMediumNote' },
  high: { icon: ICON.bars3, word: 'gHigh', note: 'gHighNote' },
  max: { icon: ICON.bars4, word: 'gMax', note: 'gMaxNote' },
};
/** The time of day's choices, the same way: day, night, or the cycle (the clock's own, so it is the automatic one). */
const TIME_SETTINGS = ['day', 'night', 'cycle'] as const;
/** The moon's paths (sky/palette.ts `moonPath`): across the sky, or low over the hills as the concept art has it. */
const MOON_CHOICE: Record<MoonPath, { icon: string; word: WordKey; note: WordKey }> = {
  high: { icon: ICON.moonHigh, word: 'moonHigh', note: 'moonHighNote' },
  low: { icon: ICON.moonLow, word: 'moonLow', note: 'moonLowNote' },
};
const TIME_CHOICE: Record<MapSettings['time'], { icon: string; word: WordKey }> = {
  day: { icon: ICON.sun, word: 'day' },
  night: { icon: ICON.moon, word: 'night' },
  cycle: { icon: ICON.cycle, word: 'cycle' },
};
/** The mini-map choices (minimap.ts): shown, the button only, hidden. */
const MINI_CHOICE: Record<MiniMapChoice, { icon: string; word: WordKey; note: WordKey }> = {
  show: { icon: ICON.mapShow, word: 'mmShowChoice', note: 'miniMapShowNote' },
  button: { icon: ICON.mapButton, word: 'mmButtonChoice', note: 'miniMapButtonNote' },
  hide: { icon: ICON.mapHide, word: 'mmHideChoice', note: 'miniMapHideNote' },
};
/**
 * The game pad's buttons in the Controller group (Play tab), as pad/pad.ts maps them: on the map screen and in the
 * menus, and on foot (R2 runs, L3 too). Drawn as the pad in hand has them (glyphs.ts), again when it changes.
 */
const PAD_ON_MAP: [PadGlyph[], WordKey][] = [
  [['lstick', 'dpad'], 'padPlaces'],
  [['south'], 'padPick'],
  [['east'], 'padBack'],
  [['north'], 'jumpIn'],
  [['start'], 'settings'],
  [['l1', 'r1'], 'padTabs'],
];
const PAD_ON_FOOT: [PadGlyph[], WordKey][] = [
  [['lstick'], 'padWalk'],
  [['r2'], 'padRun'],
  [['rstick'], 'padLook'],
  [['l1', 'r1'], 'padZoom'],
  [['south'], 'padJump'],
  [['west'], 'padUse'],
  [['north'], 'padMenu'],
  [['east'], 'padToMap'],
  [['dpad'], 'padTools'],
  [['select'], 'padBigMap'],
  [['r3'], 'padRamp'],
  [['start'], 'settings'],
];
/** The language choice (in the settings): each button shows its language in that language. */
const LANG_LABEL: Record<Lang, string> = { km: 'ខ្មែរ', en: 'English' };
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
  /** The graphics level in use now (`setGraphicsLevel`): Auto's note names it. */
  let graphicsLevel: GraphicsLevel = 'medium';
  /** Interface scale (`--u`). */
  let unit = 1;
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');

  root.replaceChildren();
  root.classList.add('mu-root');
  if (shot) root.classList.add('mu-shot');
  // Stepped corners, edge rings and glow areas, after the art.
  setSteppedVars(root);

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
  // (the coffee, the credits and the gear; the language and the sound on / off are in the settings)
  const corner = el('div', 'mu-corner');
  const gearBtn = framed(el('button', 'mu-round mu-gear', ICON.gear), 'md');
  gearBtn.type = 'button';
  gearBtn.dataset.tAria = 'settings';
  gearBtn.setAttribute('aria-controls', 'mu-settings');
  gearBtn.setAttribute('aria-expanded', 'false');
  /** Credits (credits.ts): opens the panel on its credits page. */
  const creditsBtn = framed(el('button', 'mu-round mu-cr-btn', ICON.heart), 'md');
  creditsBtn.type = 'button';
  creditsBtn.dataset.tAria = 'credits';
  creditsBtn.dataset.tTitle = 'credits';
  creditsBtn.setAttribute('aria-controls', 'mu-settings');
  creditsBtn.setAttribute('aria-expanded', 'false');
  /** Support the game: a gold coffee cup that asks with a card (_support.ts: "Buy me a coffee" opens the page). */
  const coffeeBtn = framed(el('button', 'mu-round mu-coffee-btn', ICON.coffee), 'md', true);
  coffeeBtn.type = 'button';
  coffeeBtn.dataset.tAria = 'support';
  coffeeBtn.dataset.tTitle = 'support';
  corner.append(coffeeBtn, creditsBtn, gearBtn);

  const slider = (k: VolumeKey) =>
    `<label class="mu-slider${k === 'master' ? ' is-master' : ''}" data-t-title="${k}Tip"><span data-t="${k}"></span><input type="range" min="0" max="100" step="1" data-k="${k}"><output></output></label>`;
  // (the sliders in `VOLUME_KEYS` order, a sub-heading over each part but the top)
  const soundParts = [...new Set(VOLUME_KEYS.map((k) => SOUND_PART[k]))].map((p) => {
    const rows = VOLUME_KEYS.filter((k) => SOUND_PART[k] === p).map(slider).join('');
    return p ? `<div class="mu-set-sub" role="group" aria-labelledby="mu-${p}-h"><h4 id="mu-${p}-h" data-t="${p}"></h4>${rows}</div>` : rows;
  });
  // (a choice's heading: its name, and its automatic choice, if it has one, as a chip at the right end; the others are the buttons under it)
  const head = (id: string, word: WordKey, auto = '') => `<div class="mu-set-top"><h3 id="mu-${id}-h" data-t="${word}"></h3>${auto}</div>`;
  const autoChip = <K extends string>(attr: string, value: K, of: Record<K, { icon: string; word: WordKey }>) =>
    `<button type="button" class="mu-auto" data-${attr}="${value}">${of[value].icon}<span data-t="${of[value].word}"></span></button>`;
  const choices = <K extends string>(attr: string, all: readonly K[], skip: K | null, of: Record<K, { icon: string; word: WordKey }>) =>
    all.filter((k) => k !== skip).map((k) => `<button type="button" data-${attr}="${k}">${of[k].icon}<span data-t="${of[k].word}"></span></button>`).join('');
  const page = (id: TabId, body: string) => `<div class="mu-page" id="mu-set-page-${id}" role="tabpanel" aria-labelledby="mu-set-tab-${id}"${id === 'general' ? '' : ' hidden'}>${body}</div>`;
  const switchRow = (id: string, key: SwitchKey, word: WordKey, note: string) =>
    `<div class="mu-set-row"><span id="mu-${id}-l"><span data-t="${word}"></span>${note}</span><button type="button" class="mu-switch" role="switch" data-set="${key}" aria-labelledby="mu-${id}-l"><span class="mu-knob"></span></button></div>`;
  const panel = framed(el('section', 'mu-settings', `
    <div class="mu-set-head"><h2 data-t="settings"></h2><button type="button" class="mu-x mu-close" data-t-aria="closeSettings">${ICON.close}</button></div>
    <div class="mu-set-body"><div class="mu-set-pages">
      ${page('general', `
        <div class="mu-set-group" role="group" aria-labelledby="mu-lang-h">
          ${head('lang', 'language')}
          <div class="mu-seg mu-lang-seg">
            ${(['km', 'en'] as Lang[]).map((l) => `<button type="button" lang="${l}" data-lang="${l}">${LANG_LABEL[l]}</button>`).join('')}
          </div>
        </div>
        <div class="mu-set-group" role="group" aria-labelledby="mu-time-h">
          ${head('time', 'time', autoChip('time', 'cycle', TIME_CHOICE))}
          <div class="mu-seg is-pairs">${choices('time', TIME_SETTINGS, 'cycle', TIME_CHOICE)}</div>
        </div>
        <div class="mu-set-group" role="group" aria-labelledby="mu-weather-h" aria-describedby="mu-weather-note">
          ${head('weather', 'weather', autoChip('weather', 'season', WEATHER_CHOICE))}
          <div class="mu-seg is-pairs">${choices('weather', WEATHER_SETTINGS, 'season', WEATHER_CHOICE)}</div>
          <p class="mu-set-note" id="mu-weather-note"></p>
        </div>
        <div class="mu-set-group" role="group" aria-labelledby="mu-moon-h" aria-describedby="mu-moon-note">
          ${head('moon', 'moonPath')}
          <div class="mu-seg is-pairs">${choices('moon', MOON_PATHS, null, MOON_CHOICE)}</div>
          <p class="mu-set-note" id="mu-moon-note"></p>
        </div>`)}
      ${page('sound', `
        <div class="mu-set-row mu-sound-row">
          <span id="mu-sound-l" data-t="soundOn"></span>
          <button type="button" class="mu-switch mu-sound-sw" role="switch" aria-labelledby="mu-sound-l"><span class="mu-knob"></span></button>
        </div>
        ${soundParts.join('')}`)}
      ${page('graphics', `
        <div class="mu-set-group" role="group" aria-labelledby="mu-graphics-h" aria-describedby="mu-graphics-note">
          ${head('graphics', 'graphics', autoChip('graphics', 'auto', GRAPHICS_CHOICE))}
          <div class="mu-seg is-pairs">${choices('graphics', GRAPHICS_CHOICES, 'auto', GRAPHICS_CHOICE)}</div>
          <p class="mu-set-note" id="mu-graphics-note"></p>
        </div>
        <div class="mu-set-group" role="group" aria-labelledby="mu-res-h" aria-describedby="mu-res-note">
          ${head('res', 'resolution', `<button type="button" class="mu-auto" data-res="auto">${ICON.auto}<span data-t="gAuto"></span></button>`)}
          <div class="mu-seg mu-res-seg"></div>
          <p class="mu-set-note" id="mu-res-note"></p>
        </div>
        <div class="mu-set-group" role="group" aria-labelledby="mu-fog-h" aria-describedby="mu-fog-note">
          ${head('fog', 'fog')}
          <label class="mu-slider mu-fog-amount"><span data-t="fogAmount"></span><input type="range" min="0" max="${FOG_AMOUNT_MAX * 100}" step="5" data-fogamount><output></output></label>
          <p class="mu-set-note" id="mu-fog-note" data-t="fogNote"></p>
        </div>
        <div class="mu-set-row"${PHONE ? ' hidden' : ''}>
          <span id="mu-battery-l"><span data-t="battery"></span><small data-t="batteryNote"></small></span>
          <button type="button" class="mu-switch" role="switch" data-set="battery" aria-labelledby="mu-battery-l"><span class="mu-knob"></span></button>
        </div>`)}
      ${page('play', `
        <div class="mu-set-group" role="group" aria-labelledby="mu-mini-h" aria-describedby="mu-mini-note">
          ${head('mini', 'miniMap')}
          <div class="mu-seg">${choices('minimap', MINIMAP_CHOICES, null, MINI_CHOICE)}</div>
          <p class="mu-set-note" id="mu-mini-note"></p>
        </div>
        ${switchRow('keys', 'keyHelp', 'keyHelp', '<small data-t="keyHelpNote"></small>')}
        ${switchRow('fly', 'easyFly', 'easyFly', '<small class="mu-fly-note"></small>')}
        ${switchRow('calm', 'calm', 'calm', '<small data-t="calmNote"></small>')}
        <div class="mu-set-group mu-pad-group" role="group" aria-labelledby="mu-pad-h">
          ${head('pad', 'padHead', '<span class="mu-pad-state"></span>')}
          ${switchRow('rumble', 'padRumble', 'padRumble', '<small data-t="padRumbleNote"></small>')}
          <div class="mu-pad-map"></div>
        </div>`)}
      ${page('about', '')}
    </div></div>`), 'lg');
  // (the choices and the switches in the stepped frames of the buttons above)
  for (const seg of panel.querySelectorAll<HTMLElement>('.mu-seg')) {
    framed(seg, 'sm');
    for (const b of seg.querySelectorAll<HTMLButtonElement>('button')) framed(b, 'xs');
  }
  for (const b of panel.querySelectorAll<HTMLButtonElement>('.mu-auto')) framed(b, 'xs');
  for (const s of panel.querySelectorAll<HTMLButtonElement>('.mu-switch')) framed(s, 'xs');
  panel.id = 'mu-settings';
  panel.setAttribute('role', 'dialog');
  panel.dataset.tAria = 'settings';
  /** The volumes (`data-k`); the fog's thickness has its own slider. */
  const sliders = [...panel.querySelectorAll<HTMLInputElement>('input[type=range][data-k]')];
  const fogAmount = panel.querySelector<HTMLInputElement>('input[data-fogamount]')!;
  const segBtns = [...panel.querySelectorAll<HTMLButtonElement>('button[data-time]')];
  const weatherBtns = [...panel.querySelectorAll<HTMLButtonElement>('button[data-weather]')];
  const weatherNote = panel.querySelector<HTMLElement>('#mu-weather-note')!;
  const graphicsBtns = [...panel.querySelectorAll<HTMLButtonElement>('button[data-graphics]')];
  const graphicsNote = panel.querySelector<HTMLElement>('#mu-graphics-note')!;
  /** The resolution's choice: Auto (the chip by the heading), then this window's sizes (`buildRes`) under it, and its note. */
  const resSeg = panel.querySelector<HTMLElement>('.mu-res-seg')!;
  const resAuto = panel.querySelector<HTMLButtonElement>('button[data-res="auto"]')!;
  const resNote = panel.querySelector<HTMLElement>('#mu-res-note')!;
  const moonBtns = [...panel.querySelectorAll<HTMLButtonElement>('button[data-moon]')];
  const moonNote = panel.querySelector<HTMLElement>('#mu-moon-note')!;
  const miniBtns = [...panel.querySelectorAll<HTMLButtonElement>('button[data-minimap]')];
  const miniNote = panel.querySelector<HTMLElement>('#mu-mini-note')!;
  /** The on / off settings: a switch each (`data-set` names the setting). */
  const switches = [...panel.querySelectorAll<HTMLButtonElement>('.mu-switch[data-set]')];
  /** Sound on / off: the mute (the master down, the mix kept). */
  const soundSw = panel.querySelector<HTMLButtonElement>('.mu-sound-sw')!;
  const langBtns = [...panel.querySelectorAll<HTMLButtonElement>('button[data-lang]')];
  /** Everything under the tabs: as tall as the page in it (map.css eases the change), and it scrolls when the screen is too low for that. */
  const setBody = panel.querySelector<HTMLElement>('.mu-set-body')!;
  const pagesBox = panel.querySelector<HTMLElement>('.mu-set-pages')!;
  /** One page a tab (`mu-set-page-<id>`): only the tab in use shows its page. About is filled with the words (`fillAbout`). */
  const pages = new Map(TABS.map(({ id }) => [id, panel.querySelector<HTMLElement>(`#mu-set-page-${id}`)!]));
  const soundPage = pages.get('sound')!;
  const aboutPage = pages.get('about')!;
  /** The tab in use, and the last settings tab (the gear goes back to it: the heart's About is not one). */
  let tab: TabId = 'general';
  let lastTab: TabId = 'general';
  /** The timer of the body's height easing (0: none; ui.ts `scrollEdges` waits for it). */
  let easing = 0;
  const tabs = createTabs(TABS, { prefix: 'mu-set', label: 'settingsTabs', start: tab, onSelect: showPage });
  panel.querySelector('.mu-set-head')!.after(tabs.bar);

  // ── Hint, fade, live region ─────────────────────────────────────────────
  const hint = el('p', 'mu-hint', `${ICON.plane}<span data-t="hint"></span>`);
  const fade = el('div', 'mu-fade', '<p></p>');
  const live = el('p', 'mu-sr');
  live.setAttribute('aria-live', 'polite');

  root.append(title, hint, pinsNav, info, corner, panel, fade, live);

  // ── Held sound ───────────────────────────────────────────────────────────
  // Back on the page, a phone may keep the sound off until a tap: a card in
  // the middle asks for it. On its own layer over the story too (story.css).
  const wakeLayer = el('div', 'map-ui mu-wake-layer');
  setSteppedVars(wakeLayer);
  const wakeBtn = framed(el('button', 'mu-wake', `
    <span class="mu-wake-icon">${ICON.speaker}</span>
    <span class="mu-wake-text"><span data-t="soundHeld"></span><small data-t="soundHeldNote"></small></span>`), 'lg', true);
  wakeBtn.type = 'button';
  wakeBtn.inert = true;
  wakeLayer.append(wakeBtn);
  document.body.append(wakeLayer);
  // (it goes once the sound plays: audio.ts `onHeld`)
  wakeBtn.addEventListener('click', () => h.onWake());
  const wakeNote = wakeBtn.querySelector<HTMLElement>('small')!;
  /**
   * The card's note: a tap, or, while the game pad is in use, a key or a click (a browser may not count a pad's
   * press as the gesture it waits for: the pad's ✕ on the loading screen can leave the sound held, audio.ts).
   */
  function fillWake(): void {
    const k: WordKey = pad.active ? 'soundHeldPadNote' : 'soundHeldNote';
    wakeNote.dataset.t = k;
    wakeNote.textContent = t(k);
  }
  function setSoundHeld(on: boolean): void {
    if (on === wakeBtn.classList.contains('is-on')) return;
    wakeBtn.classList.toggle('is-on', on);
    wakeBtn.inert = !on;
    fillWake();
    if (on) live.textContent = `${t('soundHeld')}. ${wakeNote.textContent}`;
  }

  // ── Words (lang.ts) ──────────────────────────────────────────────────────
  /**
   * The easy flying note names the glider's keys, or the stick of the touch
   * controls (roam/touch.ts) when the last press was a finger (on a
   * touch-first device, before any).
   */
  const flyNote = panel.querySelector<HTMLElement>('.mu-fly-note')!;
  let touchUse = matchMedia('(pointer: coarse)').matches;
  const fillFlyNote = () => (flyNote.textContent = t(touchUse ? 'easyFlyNoteTouch' : 'easyFlyNote'));
  /**
   * The About page: support the game (its gold coffee button), our story (a
   * button to watch it again), then the credits (credits.ts) under their own
   * line. Written again with the words (`fillWords`), so the frames' layers
   * are written in, as framed() would add them, and the story button is
   * heard through the panel (below).
   */
  function fillAbout(): void {
    const l = lang();
    const support = `<div class="mu-cr-sup mu-frame mu-sm"><span class="mu-bg"></span>
        <p class="mu-cr-sup-head">${ICON.coffee}<span>${t('support')}</span></p><p class="mu-cr-sup-note">${t('supportNote')}</p>
        <a class="mu-watch mu-coffee mu-frame mu-sm" href="${SUPPORT_URL}" target="_blank" rel="noopener" data-from="credits"><span class="mu-bg"></span><span class="mu-glow"></span><span class="mu-focus"></span>${ICON.coffee}<span>${t('supportGo')}</span></a></div>`;
    const story = `<div class="mu-set-row">
        <span id="mu-story-l"><span>${t('stStory')}</span><small>${t('stStoryNote')}</small></span>
        <button type="button" class="mu-watch mu-story-go mu-frame mu-sm" aria-describedby="mu-story-l"><span class="mu-bg"></span><span class="mu-focus"></span>${ICON.play}<span>${t('stWatch')}</span></button></div>`;
    aboutPage.innerHTML = support + story + `<div class="mu-set-sub"><h4>${t('credits')}</h4></div>` + CREDITS.map(
      (g) =>
        `<div class="mu-set-group" role="group"><h3>${g.head[l]}</h3>${g.lines
          .map((c) => `<p class="mu-cr-line">${c.name ? `<span lang="en">${c.name}</span>` : ''}${c.note ? `<small>${c.note[l]}</small>` : ''}</p>`)
          .join('')}</div>`,
    ).join('');
  }
  /**
   * The Controller group (Play tab): with a game pad connected, its kind by the heading and its buttons on the map
   * and on foot (`PAD_ON_MAP`, `PAD_ON_FOOT`) drawn as that pad has them; without one, a line saying one works.
   * Written again with the words and whenever the pad changes (`pad.onChange`).
   */
  const padState = panel.querySelector<HTMLElement>('.mu-pad-state')!;
  const padMap = panel.querySelector<HTMLElement>('.mu-pad-map')!;
  function fillPad(): void {
    const on = pad.connected || pad.active;
    const k = pad.kind;
    padState.innerHTML = on ? `${ICON.gamepad}<span${k === 'other' ? '' : ' lang="en"'}>${k === 'ps' ? 'PlayStation' : k === 'xbox' ? 'Xbox' : esc(t('padOther'))}</span>` : '';
    const list = (head: WordKey, rows: [PadGlyph[], WordKey][]) =>
      `<div class="mu-set-sub"><h4>${esc(t(head))}</h4></div><ul class="mu-pad-list">${rows
        .map(([gs, w]) => `<li><span class="mu-pad-keys">${gs.map((g) => padGlyph(g, k)).join('')}</span><span>${esc(t(w))}</span></li>`)
        .join('')}</ul>`;
    padMap.innerHTML = on ? list('padOnMap', PAD_ON_MAP) + list('padOnFoot', PAD_ON_FOOT) : `<p class="mu-set-note">${esc(t('padNone'))}</p>`;
  }
  /**
   * The note under the graphics choice: the chosen level's, or Auto's with
   * the level in use in it (no `data-t`: `fillWords` and `syncSettings` fill
   * it, so a language change puts the level's word in again too).
   */
  function fillGraphicsNote(): void {
    const g = GRAPHICS_CHOICE[settings.graphics] ?? GRAPHICS_CHOICE.auto;
    graphicsNote.textContent = g === GRAPHICS_CHOICE.auto ? t(g.note, { level: t(GRAPHICS_CHOICE[graphicsLevel].word) }) : t(g.note);
  }

  // ── Resolution (resolution.ts): Auto (the chip by the heading), then the sizes for this window ────
  /** The sizes in the menu now, biggest first, and their buttons (in the same order). */
  let resSizes: ResolutionSize[] = [];
  let resBtns: HTMLButtonElement[] = [];
  /** The size drawn now (main.ts `setDrawSize`; until it says, from resolution.ts `view`): Auto's note names it. */
  let drawSize: { w: number; h: number } | null = null;
  /** "2880 × 1800": Khmer digits in Khmer, the × kept with its numbers (no-break spaces). */
  const sizeText = (w: number, ht: number) => `${num(w)}\u00a0×\u00a0${num(ht)}`;
  /**
   * The size buttons for this window on this screen (`resolutionSizes`),
   * made again only when the list changes (the panel opens, the window is
   * resized or moves to another screen). A size that had the keyboard's
   * focus hands it on to the nearest new one.
   */
  function buildRes(): void {
    const sizes = resolutionSizes();
    const same = sizes.length === resSizes.length && sizes.every((s, i) => s.w === resSizes[i].w && s.h === resSizes[i].h && s.whole === resSizes[i].whole);
    if (!same) {
      const had = resBtns.indexOf(document.activeElement as HTMLButtonElement);
      const hadShare = had >= 0 ? resSizes[had].share : null;
      for (const b of resBtns) b.remove();
      resBtns = sizes.map((s, i) => {
        const b = el('button', '', `<span class="mu-res-size"></span>${s.whole ? `<span class="mu-res-mark">${ICON.sharp}</span>` : ''}`);
        b.type = 'button';
        b.dataset.i = String(i);
        resSeg.append(framed(b, 'xs'));
        return b;
      });
      resSizes = sizes;
      if (hadShare !== null && sizes.length) {
        let near = 0;
        for (let i = 1; i < sizes.length; i++) if (Math.abs(sizes[i].share - hadShare) < Math.abs(sizes[near].share - hadShare)) near = i;
        resBtns[near].focus({ preventScroll: true });
      }
    }
    labelRes();
    syncRes();
    scrollEdges();
  }
  /** The sizes' words: "2880 × 1800", and a whole step's mark named ("sharp"). */
  function labelRes(): void {
    resSizes.forEach((s, i) => {
      const b = resBtns[i];
      const text = sizeText(s.w, s.h);
      b.querySelector('.mu-res-size')!.textContent = text;
      if (!s.whole) return;
      b.setAttribute('aria-label', t('resSharpSize', { size: text }));
      b.title = t('resSharp');
    });
  }
  /** The choice pressed (a size kept from another window size or screen: none of them), and the note. */
  function syncRes(): void {
    const r = settings.resolution;
    const pick = isResolutionShare(r) ? sizeForShare(r, resSizes) : null;
    resAuto.setAttribute('aria-pressed', String(!isResolutionShare(r)));
    resBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(resSizes[i] === pick)));
    fillResNote();
  }
  /**
   * The note under the sizes: Auto's names the size drawn now; a size says
   * what it means (every screen dot; each pixel a crisp square of dots; or
   * scaled up smoothly); a size kept from another window size or screen,
   * the size it draws at now.
   */
  function fillResNote(): void {
    const r = settings.resolution;
    if (!isResolutionShare(r)) {
      const d = drawSize ?? { w: Math.round(innerWidth * view.scene), h: Math.round(innerHeight * view.scene) };
      resNote.textContent = t('resAutoNote', { size: sizeText(d.w, d.h) });
      return;
    }
    const pick = sizeForShare(r, resSizes);
    if (!pick) {
      const here = sizeOfShare(r);
      resNote.textContent = t('resOtherNote', { size: sizeText(here.w, here.h) });
      return;
    }
    const n = Math.round(stepOf(pick.share).step);
    resNote.textContent = !pick.whole ? t('resSmoothNote') : n <= 1 ? t('resFullNote') : t('resWholeNote', { n: num(n) });
  }
  buildRes();
  // (while the panel shows: a new window size, or another screen or zoom, which may come without a resize)
  addEventListener('resize', () => settingsOpen && buildRes());
  let dprQuery: MediaQueryList | null = null;
  function watchDpr(): void {
    dprQuery?.removeEventListener?.('change', onDpr);
    dprQuery = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
    dprQuery.addEventListener?.('change', onDpr);
  }
  function onDpr(): void {
    watchDpr();
    if (settingsOpen) buildRes();
  }
  watchDpr();

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
    fillAbout();
    fillPad();
    for (const e of wakeBtn.querySelectorAll<HTMLElement>('[data-t]')) e.textContent = t(e.dataset.t as WordKey);
    fillFlyNote();
    fillGraphicsNote();
    labelRes();
    fillResNote();
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
  // (a game pad connected or gone, or it or the keys and mouse in use now: the Controller group's buttons, the held card's note)
  pad.onChange(() => {
    fillPad();
    fillWake();
  });
  // (unplugged while the keys or the mouse were in use, the pad core tells no change: pad/pad.ts)
  addEventListener('gamepaddisconnected', () => requestAnimationFrame(fillPad));

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
    wakeLayer.style.setProperty('--u', unit.toFixed(3));
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
    if (!hadFocus) return;
    const c = cardById.get(was);
    c?.button.focus({ preventScroll: true });
    // (its card hidden, under the panel or off the view, takes no focus: the nearest shown one does, so the keys and the pad go on from there)
    if (c && document.activeElement !== c.button) {
      const near = cards.filter((k) => k.shown).sort((a, b) => Math.hypot(a.cx - c.cx, a.cy - c.cy) - Math.hypot(b.cx - c.cx, b.cy - c.cy))[0];
      near?.button.focus({ preventScroll: true });
    }
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
      // (the keyboard's focus, or the game pad's: its ring comes just after, pad/nav.ts)
      if (!b.matches(':focus-visible') && !pad.active) return;
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
    for (const b of weatherBtns) b.setAttribute('aria-pressed', String(b.dataset.weather === settings.weather));
    // (the note of the weather chosen: filled again with the other words when the language changes)
    weatherNote.dataset.t = WEATHER_CHOICE[settings.weather]?.note ?? 'wSeasonNote';
    weatherNote.textContent = t(weatherNote.dataset.t as WordKey);
    for (const b of graphicsBtns) b.setAttribute('aria-pressed', String(b.dataset.graphics === settings.graphics));
    // (and the graphics choice's)
    fillGraphicsNote();
    // (the resolution's size pressed, and its note)
    syncRes();
    // (the fog's thickness: 0‥150, the slot filled up to it)
    const fogV = Math.round(settings.fogAmount * 100);
    fogAmount.value = String(fogV);
    fogAmount.style.setProperty('--v', `${(fogV / FOG_AMOUNT_MAX)}%`);
    fogAmount.nextElementSibling!.textContent = num(fogV);
    fogAmount.setAttribute('aria-valuetext', t('percent', { n: String(fogV) }));
    for (const b of moonBtns) b.setAttribute('aria-pressed', String(b.dataset.moon === settings.moonPath));
    moonNote.dataset.t = MOON_CHOICE[settings.moonPath]?.note ?? 'moonLowNote';
    moonNote.textContent = t(moonNote.dataset.t as WordKey);
    for (const b of miniBtns) b.setAttribute('aria-pressed', String(b.dataset.minimap === settings.miniMap));
    miniNote.dataset.t = MINI_CHOICE[settings.miniMap]?.note ?? 'miniMapShowNote';
    miniNote.textContent = t(miniNote.dataset.t as WordKey);
    for (const b of switches) b.setAttribute('aria-checked', String(settings[b.dataset.set as SwitchKey]));
    soundSw.setAttribute('aria-checked', String(!isMuted()));
    soundPage.classList.toggle('is-muted', isMuted());
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
    // (the resolution's sizes for the window and screen as they are now)
    if (open) buildRes();
    panel.classList.toggle('is-open', open);
    // (the roaming mini-map, under the gear, fades while the panel is open: map.css)
    root.classList.toggle('mu-set-open', open);
    panel.inert = !open;
    if (open) panel.removeAttribute('aria-hidden');
    else panel.setAttribute('aria-hidden', 'true');
    cornerOn();
    if (sound) h.onSound(open ? 'open' : 'close');
    // (open: the tab in use has the focus, so the arrow keys walk the bar; closed: the focus goes back to the corner button it came from)
    if (open) tabs.button(tab).focus({ preventScroll: true });
    else if (panel.contains(document.activeElement)) (tab === 'about' ? creditsBtn : gearBtn).focus({ preventScroll: true });
    // (the game pad: the panel has it while open (every way it shuts comes through here); shut while roaming with the
    // pad, the corner's button keeps no ring: the pad walks the explorer, not the buttons)
    if (open && !shot) closePanelPad = pad.openLayer(panel, { back: () => toggleSettings(false), tabs: padTab, first: () => tabs.button(tab) });
    else if (!open) {
      closePanelPad();
      // (the coffee's note back to its own words, if the pad's press held its link)
      if (aboutPage.querySelector('.mu-cr-sup-note.is-held')) fillAbout();
      if (roaming && pad.active && corner.contains(document.activeElement)) {
        clearMark();
        (document.activeElement as HTMLElement).blur();
      }
    }
  }
  /** The settings panel's hold on the game pad (let go as it shuts). */
  let closePanelPad: () => void = () => undefined;
  /** L1 / R1 with the settings open: the tab before or after (round the bar, as its arrow keys), the focus on it. */
  function padTab(dir: -1 | 1): void {
    const i = TABS.findIndex((d) => d.id === tab);
    const to = TABS[(i + dir + TABS.length) % TABS.length].id;
    tabs.select(to, true);
    markFocus(tabs.button(to));
  }
  /**
   * A tab was picked (`_tabs.ts`): its page shows and the last one hides.
   * Picked by hand (`smooth`), the page eases in from the side its tab lies
   * on, with a sound; picked by the code (a shot, the panel opening on its
   * page), it just is there.
   */
  function showPage(id: TabId, prev: TabId, smooth: boolean): void {
    tab = id;
    if (id !== 'about') lastTab = id;
    for (const [k, p] of pages) p.hidden = k !== id;
    // (the height follows at once: open, it eases to the page's; shut, it is the page's when the panel opens)
    fitBody(!settingsOpen);
    setBody.scrollTop = 0;
    const page = pages.get(id)!;
    page.classList.remove('is-in');
    if (smooth) {
      const at = (x: TabId) => TABS.findIndex((d) => d.id === x);
      page.style.setProperty('--dir', at(id) > at(prev) ? '1' : '-1');
      // (a reflow, so the animation starts again)
      void page.offsetWidth;
      page.classList.add('is-in');
      h.onSound('toggle');
    }
    cornerOn();
    scrollEdges();
  }
  /** The gear or the heart lit, for the page the panel shows: About is the heart's, the other tabs the gear's. */
  function cornerOn(): void {
    const about = settingsOpen && tab === 'about';
    gearBtn.setAttribute('aria-expanded', String(settingsOpen && !about));
    gearBtn.classList.toggle('is-on', settingsOpen && !about);
    creditsBtn.setAttribute('aria-expanded', String(about));
    creditsBtn.classList.toggle('is-on', about);
  }
  /** The corner's gear (`about` false: the tab last used) or heart (About): opens the panel on its page, or closes it. */
  function panelButton(about: boolean): void {
    if (settingsOpen && (tab === 'about') === about) return toggleSettings(false);
    const to: TabId = about ? 'about' : lastTab;
    if (settingsOpen) {
      tabs.select(to, true);
      tabs.button(tab).focus({ preventScroll: true });
    } else {
      // (on its page from the first frame: nothing slides)
      tabs.select(to);
      toggleSettings(true);
    }
  }
  /**
   * The body is as tall as the page in it: its height follows the page's
   * (map.css eases the change while the panel shows). `snap`: at once, with
   * nothing easing (the page changed while the panel was shut, so it opens on
   * its page, at its height).
   */
  function fitBody(snap = false): void {
    const h = pagesBox.getBoundingClientRect().height;
    // (an interface that is hidden reads 0: keep the height it had)
    if (!h) return;
    const px = `${Math.ceil(h)}px`;
    if (setBody.style.getPropertyValue('--mu-page-h') === px) return;
    if (snap) setBody.style.transition = 'none';
    else easeBody();
    setBody.style.setProperty('--mu-page-h', px);
    if (snap) {
      // (a style flush with the transition off, then it is back on: nothing eases)
      void setBody.offsetHeight;
      setBody.style.transition = '';
    }
    scrollEdges();
  }
  /**
   * The height is about to change while the panel shows: no scrollbar and no
   * soft edges until it has (`is-easing`, map.css; 380 ms; not for reduce
   * motion, where the change is at once, nor in shots).
   */
  function easeBody(): void {
    if (!settingsOpen || shot || root.classList.contains('mu-calm')) return;
    setBody.classList.add('is-easing');
    clearTimeout(easing);
    easing = window.setTimeout(() => {
      easing = 0;
      setBody.classList.remove('is-easing');
      scrollEdges();
    }, 380);
  }
  // (a page change fits at once, above; the other changes of height (words that wrap again, the resolution's sizes, a window resize) are
  // asked in the next frame, not while the observer reports: a change made then moves what it watches, and the browser logs a loop)
  let fitting = 0;
  new ResizeObserver(() => {
    if (!fitting)
      fitting = requestAnimationFrame(() => {
        fitting = 0;
        fitBody();
      });
  }).observe(pagesBox);
  /** Soft edges on the panel's body where there is more to scroll to (map.css). */
  function scrollEdges(): void {
    if (easing) return;
    setBody.classList.toggle('is-more-up', setBody.scrollTop > 1);
    setBody.classList.toggle('is-more-down', setBody.scrollTop + setBody.clientHeight < setBody.scrollHeight - 1);
  }
  setBody.addEventListener('scroll', scrollEdges, { passive: true });
  panel.inert = true;
  panel.setAttribute('aria-hidden', 'true');
  info.inert = true;
  info.setAttribute('aria-hidden', 'true');

  gearBtn.addEventListener('click', () => panelButton(false));
  creditsBtn.addEventListener('click', () => panelButton(true));
  panel.querySelector('.mu-close')!.addEventListener('click', () => toggleSettings(false));
  // (a key pressed in the panel is the panel's: not the explorer's steps and tools behind it (roam/input.ts), nor the cards' arrows; Esc goes on to close it)
  panel.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') e.stopPropagation();
  });
  /**
   * The game pad's arrows in the panel (its keys are the page's own, `isTrusted` false: pad/pad.ts): ← → move a
   * slider in fives (a press a step; the keys' ones would take the pad twenty presses for a volume), and ↑ ↓ scroll
   * a long page — the credits — a step where no control lies near that way (else the focus moves, and its box
   * scrolls it into view: pad/nav.ts).
   */
  panel.addEventListener('keydown', (e) => {
    if (e.isTrusted || !pad.active || !(e.target instanceof HTMLElement)) return;
    const at = e.target;
    if (at instanceof HTMLInputElement && at.type === 'range' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const step = Math.max(5, Number(at.step) || 1);
      const v = clamp(Math.round(Number(at.value) / step) * step + (e.key === 'ArrowRight' ? step : -step), Number(at.min), Number(at.max));
      if (String(v) !== at.value) {
        at.value = String(v);
        at.dispatchEvent(new Event('input', { bubbles: true }));
        at.dispatchEvent(new Event('change', { bubbles: true }));
      }
      e.preventDefault();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const down = e.key === 'ArrowDown';
    const room = down ? setBody.scrollHeight - setBody.clientHeight - setBody.scrollTop : setBody.scrollTop;
    if (room < 1) return;
    const box = setBody.getBoundingClientRect();
    const stepPx = setBody.clientHeight * 0.35;
    const next = moveFocusIn(panel, at, down ? 'down' : 'up')?.getBoundingClientRect();
    if (next && (down ? next.bottom <= box.bottom + stepPx : next.top >= box.top - stepPx)) return;
    // (gliding, so the eye keeps its line; at once for reduce motion)
    setBody.scrollBy({ top: (down ? 1 : -1) * Math.min(room, stepPx), behavior: root.classList.contains('mu-calm') ? 'auto' : 'smooth' });
    e.preventDefault();
  });
  // (the story button is on the About page, which is written again with the words: heard through the panel)
  panel.addEventListener('click', (e) => {
    if (!(e.target as Element).closest('.mu-story-go')) return;
    toggleSettings(false, false);
    h.onStory();
  });
  // (the About page's "Buy me a coffee" pressed with the game pad: a browser opens a new tab only from a click, a tap
  // or a key, and may not count a pad's press as one (Chrome does). Then the page stays, and the note over the button
  // says to click it or gives the address, gold, as the coffee card does (ask.ts `padLink`); the panel shut, it is the
  // plain note again. Not counted as a support click)
  panel.addEventListener('click', (e) => {
    const a = (e.target as Element).closest<HTMLElement>('.mu-coffee');
    const ua = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
    if (!a || e.isTrusted || !ua || ua.isActive) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const note = aboutPage.querySelector<HTMLElement>('.mu-cr-sup-note');
    if (note) {
      note.textContent = t('supportPadLink', { url: SUPPORT_URL.replace(/^https?:\/\//, '') });
      note.classList.add('is-held');
    }
    h.onSound('tick');
  });
  // (the coffee buttons open the support page in a new tab: count where from)
  const countSupport = (e: MouseEvent) => {
    const a = (e.target as Element).closest<HTMLElement>('.mu-coffee');
    if (a && isPostHogConfigured) posthog.capture('support_clicked', { from: a.dataset.from ?? '' });
  };
  panel.addEventListener('click', countSupport);
  // (the corner's coffee asks first, with a card: _support.ts)
  const support = createSupportCard(root, { sound: (s) => h.onSound(s) });
  coffeeBtn.addEventListener('click', () => {
    // (and the game pad's ring, which a blur alone leaves: pad/nav.ts)
    if (pad.active) clearMark();
    coffeeBtn.blur();
    support.ask();
    if (isPostHogConfigured) posthog.capture('support_opened');
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
  fogAmount.addEventListener('input', () => {
    change({ fogAmount: Number(fogAmount.value) / 100 });
    const now = performance.now();
    if (now - lastTick > 70) {
      lastTick = now;
      h.onSound('tick');
    }
  });
  for (const b of segBtns)
    b.addEventListener('click', () => {
      const time = b.dataset.time as MapSettings['time'];
      if (time === settings.time) return;
      change({ time });
      h.onSound('toggle');
    });
  for (const b of weatherBtns)
    b.addEventListener('click', () => {
      const weather = b.dataset.weather as WeatherSetting;
      if (weather === settings.weather) return;
      change({ weather });
      h.onSound('toggle');
    });
  for (const b of graphicsBtns)
    b.addEventListener('click', () => {
      const graphics = b.dataset.graphics as GraphicsChoice;
      if (graphics === settings.graphics) return;
      change({ graphics });
      h.onSound('toggle');
    });
  // (the sizes are made again with the window: one listener for them all; Auto is the chip by the heading)
  const pickRes = (resolution: MapSettings['resolution']) => {
    change({ resolution });
    h.onSound('toggle');
  };
  resAuto.addEventListener('click', () => resAuto.getAttribute('aria-pressed') !== 'true' && pickRes('auto'));
  resSeg.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button');
    const size = b && resSeg.contains(b) && b.getAttribute('aria-pressed') !== 'true' ? resSizes[Number(b.dataset.i)] : undefined;
    if (size) pickRes(size.share);
  });
  for (const b of moonBtns)
    b.addEventListener('click', () => {
      const moonPath = b.dataset.moon as MoonPath;
      if (moonPath === settings.moonPath) return;
      change({ moonPath });
      h.onSound('toggle');
    });
  for (const b of miniBtns)
    b.addEventListener('click', () => {
      const miniMap = b.dataset.minimap as MiniMapChoice;
      if (miniMap === settings.miniMap) return;
      change({ miniMap });
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
  // Sound off turns the master down (the mix stays as it was); on brings it back.
  soundSw.addEventListener('click', () => {
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

  /** Arrow keys: the nearest shown card that way from the focused one (false: none that way). */
  function moveFocus(dx: number, dy: number): boolean {
    const shown = cards.filter((c) => c.shown);
    if (!shown.length) return false;
    const from = cards.find((c) => c.button === document.activeElement) ?? (selected ? cardById.get(selected) : undefined);
    if (!from || !from.shown) {
      (shown.find((c) => c.place.id === 'sanctuary') ?? shown[0]).button.focus();
      return true;
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
    return !!best;
  }

  // ── The game pad (pad/pad.ts) ────────────────────────────────────────────
  // The map screen is the pad's base: its arrows and ✕ ○ come as the keys (above and below: the cards' arrows, Enter
  // picks, Esc goes back); ✕ with nothing in focus, and an arrow no key handler took, start from `padFirst`. Options
  // opens or shuts the settings anywhere (also roaming, and over a menu). A control the focus moves to while the pad
  // is in use shows the ring (pad/nav.ts `markFocus`), however it moved. Shots show the pad's buttons (`pad=ps`) but
  // take no pad.
  /** The corner's buttons, left to right: the pad's arrows reach them too (the keys: Tab). */
  const cornerBtns = [coffeeBtn, creditsBtn, gearBtn];
  /** Where the pad starts on the map: the picked place's card, else Angkor Wat's, else any shown. */
  function padFirst(): HTMLElement | null {
    const c = (selected ? cardById.get(selected) : undefined) ?? cardById.get('sanctuary');
    return c?.shown ? c.button : (cards.find((k) => k.shown)?.button ?? null);
  }
  /** A pad's arrow on a corner button: along them, or down to the nearest card under them; up, nothing (true: it was on one). */
  function padCorner(at: HTMLElement | null, dx: number, dy: number): boolean {
    const i = cornerBtns.indexOf(at as HTMLButtonElement);
    if (i < 0 || !at) return false;
    let to: HTMLElement | null = null;
    if (dx) to = cornerBtns[i + dx] ?? null;
    else if (dy > 0) {
      const r = at.getBoundingClientRect();
      const x = (r.left + r.right) / 2;
      const far = (c: Card) => Math.hypot(c.cx - x, c.cy - r.bottom);
      let best: Card | null = null;
      for (const c of cards) if (c.shown && c.cy > r.bottom && (!best || far(c) < far(best))) best = c;
      to = best?.button ?? null;
    }
    if (to) {
      to.focus({ preventScroll: true });
      hoverSound();
    }
    return true;
  }
  /** A pad's arrow up or right from a card with no card that way: the corner's nearest button that way. */
  function padToCorner(dx: number, dy: number): void {
    const from = document.activeElement;
    if (!(from instanceof HTMLElement) || !pinsNav.contains(from) || dx < 0 || dy > 0) return;
    const to = moveFocusIn(corner, from, dy < 0 ? 'up' : 'right');
    if (!to) return;
    to.focus({ preventScroll: true });
    hoverSound();
  }
  if (!shot) {
    pad.setBase({
      root,
      first: padFirst,
      // (○ where Esc did nothing: the overview, nothing picked: the card in focus lets go)
      back: () => {
        const at = document.activeElement;
        if (!(at instanceof HTMLElement) || !root.contains(at)) return;
        clearMark();
        at.blur();
      },
    });
    pad.onPress(
      'start',
      () => {
        const b = document.body.classList;
        // (not over the story, the loading screen, a bug report, or once an expedition begins)
        if (begun || b.contains('st-on') || b.contains('map-waiting') || reporting()) return false;
        if (settingsOpen) toggleSettings(false);
        else panelButton(false);
      },
      { always: true },
    );
    root.addEventListener('focusin', (e) => {
      const at = e.target;
      if (pad.active && at instanceof HTMLElement && at !== root && !at.classList.contains('pad-focus')) markFocus(at);
    });
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
    // (the game pad's arrows: the cards are the base's; a menu or card over them (pad.ts layers) moves in itself)
    const fromPad = !e.isTrusted && pad.active;
    if (fromPad && pad.inMenu) return;
    e.preventDefault();
    if (fromPad && padCorner(t, dir[0], dir[1])) return;
    if (!moveFocus(dir[0], dir[1]) && fromPad) padToCorner(dir[0], dir[1]);
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
    /** `scroll:<group>`: the settings' body scrolled to that group's heading (`#mu-<group>-h`), on the group's tab. */
    let scrollGroup = '';
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
      // (`tab:<id>`: the settings on that tab, e.g. `uistate=settings,tab:sound`; before or after `settings`)
      if (k === 'tab' && TABS.some((d) => d.id === (v as string))) tabs.select(v as string as TabId);
      if (k === 'held') setSoundHeld(true);
      // (`weather:<setting>`: the panel shows that weather chosen, e.g. `uistate=settings,weather:snow`)
      if (k === 'weather' && WEATHER_SETTINGS.includes(v as string as WeatherSetting)) {
        settings = { ...settings, weather: v as string as WeatherSetting };
        syncSettings();
      }
      // (`moon:high|low`: the panel shows that moon's path chosen, e.g. `uistate=settings,scroll:moon,moon:low`)
      if (k === 'moon' && MOON_PATHS.includes(v as string as MoonPath)) {
        settings = { ...settings, moonPath: v as string as MoonPath };
        syncSettings();
      }
      // (`res:<share>` or `res:auto`: the panel shows that resolution picked, e.g. `uistate=settings,res:0.5`; `battery`: the battery saver on)
      if (k === 'res' && ((v as string) === 'auto' || isResolutionShare(Number(v)))) {
        settings = { ...settings, resolution: (v as string) === 'auto' ? 'auto' : Number(v) };
        syncSettings();
      }
      if (k === 'battery') {
        settings = { ...settings, battery: true };
        syncSettings();
      }
      // (`fog:<0‥150>`: the panel shows the fog that thick, e.g. `uistate=settings,scroll:fog,fog:40`)
      if (k === 'fog' && v !== undefined && Number.isFinite(Number(v))) {
        settings = { ...settings, fogAmount: Math.min(FOG_AMOUNT_MAX, Math.max(0, Number(v) / 100)) };
        syncSettings();
      }
      if (k === 'scroll' && v) scrollGroup = v;
      if (k === 'credits') {
        tabs.select('about');
        toggleSettings(true, false);
      }
      if (k === 'support') queueMicrotask(() => support.ask());
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
    // (opening the panel gave a tab the focus: a shot shows the panel at rest, without the keyboard's ring)
    (document.activeElement as HTMLElement | null)?.blur();
    // (and the game pad's ring, with `pad=ps|xbox`)
    clearMark();
    if (scrollGroup) {
      tabs.select(GROUP_TAB[scrollGroup] ?? tab);
      // (again once the web fonts are in: the words change size)
      const scrollThere = () => {
        const head = setBody.querySelector<HTMLElement>(`#mu-${scrollGroup}-h`);
        if (!head) return;
        setBody.scrollTop += head.getBoundingClientRect().top - setBody.getBoundingClientRect().top - 8 * unit;
        scrollEdges();
      };
      scrollThere();
      void document.fonts?.ready.then(scrollThere);
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
      // (steps of 2 %, a colour level or less: the cycle turns it all day, and each change restyles and repaints every panel and restarts their background transitions)
      if (Math.abs(n - night) < 0.02) return;
      night = n;
      root.style.setProperty('--mu-n', n.toFixed(3));
      wakeLayer.style.setProperty('--mu-n', n.toFixed(3));
    },
    setRoaming,
    setLang(l) {
      if (l !== settings.lang) change({ lang: l });
    },
    setGraphicsLevel(level) {
      if (level === graphicsLevel) return;
      graphicsLevel = level;
      fillGraphicsNote();
    },
    setDrawSize(w, ht) {
      if (drawSize?.w === w && drawSize.h === ht) return;
      drawSize = { w, h: ht };
      if (!isResolutionShare(settings.resolution)) fillResNote();
    },
    setSoundHeld,
  };
}
