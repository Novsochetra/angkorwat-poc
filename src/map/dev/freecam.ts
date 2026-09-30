import { MathUtils, Vector3, type Object3D, type PerspectiveCamera } from 'three';
import type { HeightField } from '../heightfield';
import { HAMLETS, JUNGLE_SITES, MAP_BOUNDS, PLACES, VILLAGE } from '../layout';
import { view as drawn } from '../resolution';
import { FOG_AMOUNT_MAX } from '../sky/fogLevel';
import { SKY, SYNODIC_MONTH } from '../sky/palette';
import { HELD_WEATHER } from '../sky/weather';
import { CAM_REACH, roamInside } from '../terrain/views';
import { CALM_WEATHER, type MapWeather } from '../types';
import { safeName, WALLPAPER_ENDPOINT, type VideoCodec, type WallpaperFlight, type WallpaperJob, type WallpaperList, type WallpaperView } from './wallpaperTypes';

/**
 * The free camera (dev server only; ` opens it, Esc leaves): a camera that
 * depends on nothing, for wallpapers and videos. The interface, the
 * explorer's keys and the map's own keys are put away; the camera flies
 * anywhere over the map, and the parts see the overview's rules with it
 * (main.ts: the rain, the shadows and the detail are those of a shot from
 * `cam=`, which is what draws it later).
 *
 * - Drag looks, W A S D fly along the view, Q / E (or Space) go down and up,
 *   Shift is fast, the wheel sets the speed, a trackpad pinch the lens.
 * - The panel is at the right. The frame (the picture's shape: a desktop, a
 *   phone, an iPad…) fills the room left of it, so the panel never covers the
 *   picture; the camera's centre is the frame's centre (a view offset), and the
 *   lens is the frame's vertical field of view: what the frame shows is what
 *   the picture has.
 * - V takes a picture: it is saved into `wallpapers/views.json` and drawn at
 *   once at full quality (scripts/wallpaper.mjs, headless, on the graphics
 *   card) into `wallpapers/out/`. R records a flight into
 *   `wallpapers/paths/<name>.json`, and it is drawn as a video when it stops.
 *   A loop video (orbit, sway, push in and out, day and night) is made from the
 *   view. Names are made from the place looked at and the time of day unless
 *   one is typed.
 * - The moment: the time of day (the game's, or held), the moon's phase, the
 *   weather, the fog's thickness (the settings', or held: clear air for a
 *   sharp picture), time frozen, the explorer shown or not.
 * - The gallery lists every picture and video with its thumbnail: go back to
 *   one, draw it again, open it, show it in the Finder, forget it.
 *
 * The land is built with big blocks past the roaming area, where no camera
 * of the map goes (terrain/views.ts): the notes say so when the camera is
 * out there.
 */
export interface FreeCamOptions {
  camera: PerspectiveCamera;
  canvas: HTMLCanvasElement;
  /** The land: the ground under the camera. */
  field: HeightField;
  /** Set the camera the map draws from (`[x, y, z, tx, ty, tz, fov]`), or give it back (null). */
  setCamera(cam: number[] | null): void;
  /** Hold the time of day at a clock (0 afternoon … 0.5 night), or let the game's own time run (null). */
  setClock(clock: number | null): void;
  /** The clock the time of day is held at now (null: not held). */
  clockHeld(): number | null;
  /** The day's clock now. */
  clock(): number;
  /** Hold the moon's age (0 new … 0.5 full … 1 new again), or let the calendar's moon show (null). */
  setMoon(age: number | null): void;
  /** The age the moon is held at now (null: not held). */
  moonHeld(): number | null;
  /** Hold the fog's thickness (0 clear … 1 the game's own … 1.5, sky/fogLevel.ts), or let the setting's show (null). */
  setFogAmount(amount: number | null): void;
  /** The thickness the fog is held at now (null: not held). */
  fogAmountHeld(): number | null;
  /** The settings' fog thickness (what Game shows). */
  fogAmount(): number;
  /** The camera is given back: the map's own field of view again. */
  restore(): void;
  /** The explorer, to leave him out of the picture. */
  explorer(): Object3D | null;
  /** Draw the shadow map again (the low and medium levels keep still shadows: his was in it). */
  redrawShadows(): void;
  /** The map is roaming (the explorer stands where he is). */
  roaming(): boolean;
  /** The moment as URL values, with his spot too (`roam=`, `at=`…) when he is in the picture. */
  moment(withExplorer: boolean): URLSearchParams;
  /** Put the explorer back as a saved view's query has him, posed (roam.ts `placeFrom`); false: no spot of his in it. */
  placeExplorer(q: URLSearchParams): boolean;
}

/** What the map's frame loop asks of the free camera. */
export interface FreeCam {
  /** The camera is free now (the interface is away). */
  readonly active: boolean;
  /** The scene's time stands still. */
  readonly frozen: boolean;
  /** Once a step, before the camera is placed: moves the camera. */
  step(): void;
  /** Once a step, after the camera is placed (and after roaming, which may clear a view offset): the frame's view offset. */
  placed(): void;
  /** Once a step, after the weather: puts the panel's weather over it. */
  weather(w: MapWeather): void;
}

/** Picture shapes: width × height in pixels (a `Custom` takes its own). The names are kept in the saved views. */
const SHAPES: Record<string, [number, number]> = {
  '4K · 16:9 (3840×2160)': [3840, 2160],
  '5K · 16:9 (5120×2880)': [5120, 2880],
  '8K · 16:9 (7680×4320)': [7680, 4320],
  '1440p · 16:9 (2560×1440)': [2560, 1440],
  'Mac · 16:10 (3840×2400)': [3840, 2400],
  'Ultrawide · 21:9 (5120×2160)': [5120, 2160],
  'iPhone tall (1290×2796)': [1290, 2796],
  'Phone · 9:16 (1080×1920)': [1080, 1920],
  'Phone 4K · 9:16 (2160×3840)': [2160, 3840],
  'iPad · 4:3 (2732×2048)': [2732, 2048],
  'Square (2048×2048)': [2048, 2048],
  Custom: [0, 0],
};
const DEFAULT_SHAPE = '4K · 16:9 (3840×2160)';

/** The weather choices: null is the game's own, a name a held weather (sky/weather.ts `HELD_WEATHER`), `view` the one a saved picture had. */
const WEATHERS: [string, string | null][] = [
  ['Game', null],
  ['Clear', 'clear'],
  ['Rain', 'rain'],
  ['Storm', 'storm'],
  ['Rainbow', 'rainbow'],
  ['Snow', 'snow'],
];
const VIEW_WEATHER = 'view';
const WEATHER_KEYS = ['wind', 'cloud', 'rain', 'storm', 'rainbow', 'wet', 'snow', 'snowCover'] as const;

/** Times of day (the `clock` of the map: 0 afternoon, 0.22 sunset, 0.5 night, 0.82 dawn: the promo's). */
const TIMES: [string, number][] = [
  ['Afternoon', 0],
  ['Sunset', 0.22],
  ['Night', 0.5],
  ['Dawn', 0.82],
];
/** The time of day's word (for a name): the nearest of {@link TIMES} round the dial. */
const timeWord = (clock: number): string => {
  const dial = (a: number, b: number) => Math.abs(((a - b + 1.5) % 1) - 0.5);
  return TIMES.reduce((best, t) => (dial(t[1], clock) < dial(best[1], clock) ? t : best))[0].toLowerCase();
};

/** Fog thicknesses by name (sky/fogLevel.ts `fogNow.amount`: 0 clear air, 1 the game's own; the edges keep their mist). */
const FOGS: [string, number][] = [
  ['None', 0],
  ['Light', 0.5],
  ['Normal', 1],
  ['Thick', FOG_AMOUNT_MAX],
];

/**
 * Moon phases by name, as the moon's age (0 new … 0.5 full … back to new). Growing is lit on the right, shrinking on
 * the left: the way the sky draws it, seen from Cambodia (sky/palette.ts).
 */
const MOONS: [string, number][] = [
  ['New (dark)', 0],
  ['Crescent, growing', 0.135],
  ['Half, growing', 0.25],
  ['Nearly full, growing', 0.375],
  ['Full', 0.5],
  ['Nearly full, shrinking', 0.625],
  ['Half, shrinking', 0.75],
  ['Crescent, shrinking', 0.865],
];
/** The moon choices besides the phases: the calendar's own moon, and an age set by the slider (between two phases). */
const GAME_MOON = 'Game moon';
const CUSTOM_MOON = 'Custom';
const moonName = (age: number): string => MOONS.find(([, at]) => Math.abs(at - age) < 0.0005 || Math.abs(at + 1 - age) < 0.0005)?.[0] ?? CUSTOM_MOON;

/** The moon's age (0‥1) that a saved moment draws: the one it holds (`moon=`), else the phase its date gives (`day=` and `clock=`, as the sky counts it); null: neither is there. */
function savedMoon(q: URLSearchParams): number | null {
  const held = q.has('moon') ? Number(q.get('moon')) : NaN;
  const dated = q.has('day') && q.has('clock') ? (Number(q.get('day')) + Number(q.get('clock'))) / SYNODIC_MONTH : NaN;
  const age = Number.isFinite(held) ? held : dated;
  return Number.isFinite(age) ? ((age % 1) + 1) % 1 : null;
}

/** Loop videos made from the view: a camera path that comes round to where it began; the word goes in its name. */
const LOOPS = ['Orbit round what I look at', 'Sway, gently', 'Push in and out', 'Day and night'] as const;
type LoopKind = (typeof LOOPS)[number];
const LOOP_WORD: Record<LoopKind, string> = { 'Orbit round what I look at': 'orbit', 'Sway, gently': 'sway', 'Push in and out': 'push', 'Day and night': 'day-night' };

/** Video formats: HEVC is small (a wallpaper's file), H.264 plays everywhere. */
const FORMATS: Record<string, VideoCodec> = { 'HEVC · small, for a wallpaper': 'hevc', 'H.264 · plays everywhere': 'h264' };

/** Places a picture is named after: the landmarks, the jungle's sites, the villages (x, z; `reach`, m: how far off it still names a picture — a landmark (450) from afar, and first, as it is big; a small site only near). */
const NAMED: { word: string; x: number; z: number; reach: number }[] = [
  ...PLACES.map((p) => ({ word: p.name, x: p.x, z: p.z, reach: 450 })),
  ...JUNGLE_SITES.map((s) => ({ word: s.name ?? s.id, x: s.x, z: s.z, reach: 60 + s.r * 4 })),
  ...HAMLETS.map((h) => ({ word: ({ market: 'Morning market', 'east-village': 'Sugar palm village', 'palm-grove': 'Palm sugar yard', 'kulen-picnic': 'Kulen falls' } as Record<string, string>)[h.id] ?? h.id, x: h.x, z: h.z, reach: 80 + h.r * 3 })),
  { word: 'Floating village', x: VILLAGE.x, z: VILLAGE.z, reach: 300 },
];
/** A place's words as a name ("The monk's hut" → "monks-hut"). */
const slug = (v: string): string => safeName(v.toLowerCase().replace(/^the\s+/, '').replace(/'/g, '')).toLowerCase();

const UP = new Vector3(0, 1, 0);

/** Keys that move the camera: right, up, forward. */
const MOVE: Record<string, [number, number, number]> = {
  KeyW: [0, 0, 1],
  ArrowUp: [0, 0, 1],
  KeyS: [0, 0, -1],
  ArrowDown: [0, 0, -1],
  KeyA: [-1, 0, 0],
  ArrowLeft: [-1, 0, 0],
  KeyD: [1, 0, 0],
  ArrowRight: [1, 0, 0],
  KeyE: [0, 1, 0],
  Space: [0, 1, 0],
  KeyQ: [0, -1, 0],
};
const SHIFT = new Set(['ShiftLeft', 'ShiftRight']);

/** How far away what the camera looks at is set (m): far, so the rounding of a saved view turns it by nothing. */
const AIM = 100;
/** Frames a second of a flight. */
const FLIGHT_FPS = 30;
/** A flight ends by itself after this long (s). */
const FLIGHT_MAX = 120;
/** Room kept over the ground and the water (m), and the highest the camera goes. */
const CLEARANCE = 1.5;
const CEILING = 900;
/** Speeds (m/s): the slider's ends (it is even in steps of ×, not of +). */
const SPEED_MIN = 2;
const SPEED_MAX = 400;
/** The keys are shown under the frame this long after it opens (s); ? shows or hides them. */
const KEYS_FOR = 15;
/** The panel's width (px), and the room kept round the frame. */
const PANEL_W = 300;
const ROOM = 16;

const CSS = `
body.freecam #ui, body.freecam .map-ui, body.freecam .rt, body.freecam .fb-button, body.freecam .fc-open { display: none !important; }
body.freecam canvas#scene { cursor: grab; }
.fc-open { left: 124px !important; }
.fc-guide { position: fixed; z-index: 20; pointer-events: none; display: none; box-sizing: border-box; border: 1px solid rgba(255, 255, 255, 0.6); box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.55); }
.fc-guide.thirds {
  background:
    linear-gradient(to right, transparent calc(33.333% - 0.5px), rgba(255, 255, 255, 0.32) calc(33.333% - 0.5px), rgba(255, 255, 255, 0.32) calc(33.333% + 0.5px), transparent calc(33.333% + 0.5px), transparent calc(66.666% - 0.5px), rgba(255, 255, 255, 0.32) calc(66.666% - 0.5px), rgba(255, 255, 255, 0.32) calc(66.666% + 0.5px), transparent calc(66.666% + 0.5px)),
    linear-gradient(to bottom, transparent calc(33.333% - 0.5px), rgba(255, 255, 255, 0.32) calc(33.333% - 0.5px), rgba(255, 255, 255, 0.32) calc(33.333% + 0.5px), transparent calc(33.333% + 0.5px), transparent calc(66.666% - 0.5px), rgba(255, 255, 255, 0.32) calc(66.666% - 0.5px), rgba(255, 255, 255, 0.32) calc(66.666% + 0.5px), transparent calc(66.666% + 0.5px));
}
.fc-guide.rec { border: 2px solid #ff5a4a; }
.fc-hud { position: fixed; bottom: 12px; transform: translateX(-50%); z-index: 21; pointer-events: none; display: none; white-space: pre-wrap; max-width: calc(100vw - ${PANEL_W + 24}px); text-align: center; padding: 6px 12px; border-radius: 8px; background: rgba(20, 24, 28, 0.62); color: #f3efe7; font: 12px/1.5 ui-monospace, Menlo, monospace; }
.fc-hud b { color: #ffd27a; font-weight: 600; }
.fc-hud i { color: #ff9a6b; font-style: normal; }
.fc-panel { position: fixed; top: 0; right: 0; bottom: 0; width: ${PANEL_W}px; z-index: 30; display: none; flex-direction: column; overflow-y: auto; overscroll-behavior: contain; box-sizing: border-box; background: rgba(17, 19, 23, 0.96); border-left: 1px solid rgba(255, 255, 255, 0.08); color: #e9e6df; font: 12px/1.4 system-ui, -apple-system, sans-serif; -webkit-user-select: none; user-select: none; }
.fc-panel.open { display: flex; }
.fc-panel * { box-sizing: border-box; }
.fc-head { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: rgb(17, 19, 23); font-size: 13px; font-weight: 650; }
.fc-head .fc-btn { margin-left: auto; padding: 3px 8px; font-weight: 400; }
.fc-sec { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border-top: 1px solid rgba(255, 255, 255, 0.07); }
.fc-sec h3 { margin: 0; font-size: 10.5px; font-weight: 650; letter-spacing: 0.07em; text-transform: uppercase; color: #8f98a3; }
.fc-row { display: grid; grid-template-columns: 58px minmax(0, 1fr) auto; align-items: center; gap: 8px; }
.fc-row > .fc-label { color: #aeb5bd; }
.fc-row.two { grid-template-columns: 58px minmax(0, 1fr); }
.fc-btn { appearance: none; border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(255, 255, 255, 0.07); color: #eee; border-radius: 7px; padding: 6px 9px; font: inherit; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fc-btn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.14); }
.fc-btn:disabled { opacity: 0.4; cursor: default; }
.fc-btn.big { font-size: 14px; font-weight: 700; padding: 10px 9px; background: #e7b64a; border-color: #e7b64a; color: #1d1605; }
.fc-btn.big:hover:not(:disabled) { background: #f4c862; }
.fc-btn.rec.on { background: #cf3a2e; border-color: #cf3a2e; color: #fff; }
.fc-btn.warn { color: #ffb0a4; }
.fc-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.fc-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.fc-chip { appearance: none; border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(255, 255, 255, 0.06); color: #ddd; border-radius: 999px; padding: 3px 9px; font: inherit; font-size: 11.5px; cursor: pointer; }
.fc-chip:hover { background: rgba(255, 255, 255, 0.14); }
.fc-chip.on { background: #e7b64a; border-color: #e7b64a; color: #1d1605; font-weight: 600; }
.fc-panel input[type='range'] { width: 100%; margin: 0; accent-color: #e7b64a; cursor: pointer; }
.fc-val { min-width: 52px; text-align: right; color: #ffd27a; font-variant-numeric: tabular-nums; white-space: nowrap; }
.fc-panel select, .fc-panel input[type='text'], .fc-panel input[type='number'] { width: 100%; min-width: 0; padding: 5px 7px; border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 6px; background: #22262c; color: #eee; font: inherit; -webkit-user-select: text; user-select: text; }
.fc-panel input::placeholder { color: #7f8791; }
.fc-check { display: flex; align-items: center; gap: 6px; color: #ddd; cursor: pointer; }
.fc-check input { margin: 0; accent-color: #e7b64a; }
.fc-note { color: #8f98a3; font-size: 11px; }
.fc-status { display: flex; flex-direction: column; gap: 6px; padding: 8px 10px; border-radius: 8px; background: rgba(255, 255, 255, 0.05); color: #d7d3cb; word-break: break-word; }
.fc-status:empty { display: none; }
.fc-status.error { color: #ffab9e; background: rgba(255, 80, 60, 0.1); }
.fc-bar { height: 5px; border-radius: 3px; background: rgba(255, 255, 255, 0.1); overflow: hidden; }
.fc-bar > i { display: block; height: 100%; width: 0; background: #e7b64a; transition: width 0.4s; }
.fc-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; }
.fc-tile { position: relative; aspect-ratio: 16 / 10; padding: 0; border: 2px solid transparent; border-radius: 6px; overflow: hidden; background: #2a2f36; cursor: pointer; }
.fc-tile img { display: block; width: 100%; height: 100%; object-fit: cover; }
.fc-tile.on { border-color: #e7b64a; }
.fc-tile .fc-name { position: absolute; left: 0; right: 0; bottom: 0; padding: 1px 4px; background: rgba(0, 0, 0, 0.6); color: #fff; font-size: 10px; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fc-tile .fc-kind { position: absolute; top: 2px; right: 3px; font-size: 11px; text-shadow: 0 1px 2px #000; }
.fc-tile .fc-none { position: absolute; inset: 0 0 14px; display: grid; place-items: center; color: #7f8791; font-size: 10px; }
.fc-tile.busy::after { content: ''; position: absolute; inset: 0; background: rgba(231, 182, 74, 0.25); animation: fc-pulse 1.2s ease-in-out infinite; }
@keyframes fc-pulse { 50% { opacity: 0.2; } }
.fc-pick { display: flex; flex-direction: column; gap: 6px; }
.fc-shot { display: grid; place-items: center; height: 158px; border-radius: 6px; background: #000; overflow: hidden; color: #7f8791; font-size: 11px; }
.fc-shot img { display: block; max-width: 100%; max-height: 100%; object-fit: contain; cursor: pointer; }
.fc-pick .fc-title { font-weight: 650; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fc-pick .fc-note { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fc-acts { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px; }
.fc-panel details > summary { cursor: pointer; color: #8f98a3; font-size: 10.5px; font-weight: 650; letter-spacing: 0.07em; text-transform: uppercase; list-style: none; }
.fc-panel details > summary::before { content: '▸ '; }
.fc-panel details[open] > summary::before { content: '▾ '; }
.fc-panel details > div { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.fc-panel a { color: #ffd27a; }
`;

const rad = MathUtils.degToRad;
const deg = MathUtils.radToDeg;
const round = (v: number, n = 2): number => Math.round(v * 10 ** n) / 10 ** n;
/** A field where keys are typed (not a slider, a checkbox or a button: those keep flying). */
const typing = (t: EventTarget | null): boolean => t instanceof HTMLElement && (t.isContentEditable || ['TEXTAREA', 'SELECT'].includes(t.tagName) || (t.tagName === 'INPUT' && !['range', 'checkbox', 'button'].includes((t as HTMLInputElement).type)));
const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** What the panel holds. */
interface Panel {
  speed: number;
  lens: number;
  shape: string;
  customW: number;
  customH: number;
  thirds: boolean;
  /** The time of day: the game's own (it moves), or held at `clock`. */
  hold: boolean;
  clock: number;
  /** The moon: the calendar's (`GAME_MOON`), a phase by name, or `CUSTOM_MOON` (the age is where the slider is). */
  moon: string;
  moonAge: number;
  /** The fog's thickness: the settings' (it follows them), or held at `fog`. */
  fogHold: boolean;
  fog: number;
  /** A weather of {@link WEATHERS} (null: the game's), or {@link VIEW_WEATHER}. */
  weather: string | null;
  freeze: boolean;
  explorer: boolean;
  /** A name typed for what is saved next ('': one is made from the place and the time). */
  name: string;
  /** Video: its format, whether to draw it as soon as it is saved, whether R closes a flight into a loop, and the loop made from the view. */
  format: string;
  drawNow: boolean;
  closeLoop: boolean;
  loopKind: LoopKind;
  loopSeconds: number;
  loopReverse: boolean;
}

/** A picture or a video in the gallery. */
interface Item {
  kind: 'view' | 'flight';
  name: string;
  w: number;
  h: number;
  saved: string;
  /** A video's length (s), and whether it is a loop. */
  seconds?: number;
  loop?: boolean;
}

/** A flight while it is flown: a row a frame (ms, x, y, z, tx, ty, tz, lens, clock). */
interface Recording {
  name: string;
  start: number;
  rows: number[][];
  w: number;
  h: number;
  t0: number;
  frozen: boolean;
  query: string;
  noExplorer: boolean;
  screenH: number;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${WALLPAPER_ENDPOINT}${path}`, init);
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  return (await res.json()) as T;
}

/** An element with a class and words. */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

class FreeCamTool implements FreeCam {
  private open = false;
  /** Where the camera stands, where the drag turns it to (yaw: 0 looks north, turning to the west; pitch: up is +) and where it looks now (eased). */
  private readonly pos = new Vector3();
  private yaw = 0;
  private pitch = 0;
  private yawNow = 0;
  private pitchNow = 0;
  private readonly vel = new Vector3();
  private readonly keys = new Set<string>();
  private drag: { id: number } | null = null;
  /** Frames the map has drawn since the page asked to open the camera at once (`?freecam=1`), else 0. */
  private auto = 0;
  private last = 0;
  private hudAt = 0;
  private syncAt = 0;
  /** When the camera opened (ms), and whether ? shows the keys (null: for the first seconds). */
  private openedAt = 0;
  private keysShown: boolean | null = null;
  private readonly _f = new Vector3();
  private readonly _r = new Vector3();
  private readonly _w = new Vector3();
  private readonly _t = new Vector3();

  private readonly s: Panel = {
    speed: 30,
    lens: 50,
    shape: DEFAULT_SHAPE,
    customW: 3000,
    customH: 2000,
    thirds: true,
    hold: false,
    clock: 0.22,
    moon: GAME_MOON,
    moonAge: 0.5,
    fogHold: false,
    fog: 1,
    weather: null,
    freeze: false,
    explorer: false,
    name: '',
    format: 'HEVC · small, for a wallpaper',
    drawNow: true,
    closeLoop: true,
    loopKind: LOOPS[0],
    loopSeconds: 40,
    loopReverse: false,
  };
  /** The explorer's box was ticked or unticked by hand (else it follows roaming: shown while he roams). */
  private explorerPicked = false;
  /** The weather the panel holds (null: the game's), and the one a saved picture has. */
  private held: Partial<MapWeather> | null = null;
  private viewWeather: Partial<MapWeather> | null = null;
  private prevHold: number | null = null;
  private prevMoon: number | null = null;
  private prevFog: number | null = null;
  private explorerWas = true;
  private rec: Recording | null = null;
  private list: WallpaperList = { views: [], flights: [], out: {}, drawn: {} };
  /** The picked picture or video (`view:<name>` or `flight:<name>`). */
  private pick = '';
  /** What is being drawn, what waits, and how far the one drawn is (0‥1, null: not known). */
  private drawing: Item | null = null;
  private readonly queue: Item[] = [];
  private stopped = false;
  /** The last thing drawn (its file under wallpapers/), shown under the words. */
  private result: { item: Item; file: string } | null = null;

  private readonly button = document.createElement('button');
  private readonly guide = el('div', 'fc-guide');
  private readonly hud = el('div', 'fc-hud');
  private readonly panel = el('div', 'fc-panel');
  private readonly status = el('div', 'fc-status');
  private readonly bar = el('div', 'fc-bar');
  private readonly grid = el('div', 'fc-grid');
  private readonly picked = el('div', 'fc-pick');
  private readonly galleryTitle = el('h3');
  private chromeHidden = false;
  private box = { x: 0, y: 0, w: 0, h: 0 };
  /** Each control shows the value it holds (after a key, the wheel, or a change made in code). */
  private readonly syncs: (() => void)[] = [];
  private statusText = '';
  private statusError = false;

  constructor(private readonly o: FreeCamOptions) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.button.type = 'button';
    this.button.className = 'fb-button fc-open';
    this.button.textContent = '📷 Free camera';
    this.button.title = 'Fly a free camera and make wallpapers (`)';
    this.button.onclick = () => this.enter();
    this.bar.append(el('i'));
    this.buildPanel();
    document.body.append(this.button, this.guide, this.hud, this.panel);

    addEventListener('keydown', (e) => this.key(e, true), true);
    addEventListener('keyup', (e) => this.key(e, false), true);
    addEventListener('blur', () => {
      this.keys.clear();
      this.drag = null;
    });
    addEventListener('focusin', () => this.keys.clear());
    addEventListener('pointerdown', (e) => this.pointerDown(e), true);
    addEventListener('pointermove', (e) => this.pointerMove(e), true);
    addEventListener('pointerup', (e) => this.pointerUp(e), true);
    addEventListener('pointercancel', (e) => this.pointerUp(e), true);
    addEventListener('wheel', (e) => this.wheel(e), { capture: true, passive: false });
    addEventListener('contextmenu', (e) => {
      if (this.open && !this.inPanel(e.target)) e.preventDefault();
    }, true);
    for (const type of ['touchstart', 'touchmove', 'touchend'] as const)
      addEventListener(type, (e) => {
        if (this.open && !this.inPanel(e.target)) e.stopPropagation();
      }, { capture: true, passive: true });
    addEventListener('resize', () => this.layout());
    // (`?freecam=1`: opens on the map's first frames, when the camera is where the page puts it)
    if (new URLSearchParams(location.search).get('freecam') === '1') this.auto = 1;
  }

  get active(): boolean {
    return this.open;
  }

  get frozen(): boolean {
    return this.open && this.s.freeze;
  }

  // ── Camera ───────────────────────────────────────────────────────────────

  private forward(out: Vector3): Vector3 {
    const c = Math.cos(this.pitchNow);
    return out.set(-Math.sin(this.yawNow) * c, Math.sin(this.pitchNow), -Math.cos(this.yawNow) * c);
  }

  /** The picture's size in pixels. */
  private size(): [number, number] {
    const [w, h] = SHAPES[this.s.shape] ?? SHAPES[DEFAULT_SHAPE];
    // (a custom size is made even: a video's codec needs it)
    const even = (v: number) => MathUtils.clamp(Math.round(v / 2) * 2, 64, 16384);
    return w > 0 ? [w, h] : [even(this.s.customW), even(this.s.customH)];
  }

  /** The camera's own vertical field of view: the frame is a part of the window's height, and the lens is its field of view. */
  private camFov(): number {
    const part = this.box.h > 0 ? innerHeight / this.box.h : 1;
    return MathUtils.clamp(deg(2 * Math.atan(Math.tan(rad(this.s.lens) / 2) * part)), 5, 140);
  }

  /** The frame's height in the pixels the map draws now: a picture this many pixels high looks the way the frame does (its glow, its fireflies). */
  private screenH(): number {
    return Math.max(1, Math.round(this.box.h * drawn.scene));
  }

  /** The frame: the largest of the picture's shape that fits the room left of the panel, in the middle of the window's height. */
  private layout(): void {
    const [w, h] = this.size();
    const areaW = Math.max(120, innerWidth - (this.open && !this.chromeHidden ? PANEL_W : 0));
    const maxW = Math.max(50, areaW - 2 * ROOM);
    const maxH = Math.max(50, innerHeight - 2 * ROOM);
    let gw = maxW;
    let gh = (gw * h) / w;
    if (gh > maxH) {
      gh = maxH;
      gw = (gh * w) / h;
    }
    this.box = { x: (areaW - gw) / 2, y: (innerHeight - gh) / 2, w: gw, h: gh };
    Object.assign(this.guide.style, { left: `${this.box.x}px`, top: `${this.box.y}px`, width: `${gw}px`, height: `${gh}px`, display: this.open && !this.chromeHidden ? 'block' : 'none' });
    this.guide.classList.toggle('thirds', this.s.thirds);
    this.hud.style.left = `${this.box.x + gw / 2}px`;
    this.placed();
  }

  /**
   * The camera's centre is the frame's (the frame is left of the panel, not in the middle of the window): the window
   * is a part of a wider view whose middle is the frame's. Only across: the frame is in the middle of the height, so the
   * field of view stays the frame's (and the detail and the point sprites, which read it, stay right).
   */
  placed(): void {
    if (!this.open) return;
    const c = this.o.camera;
    const W = innerWidth;
    const H = innerHeight;
    const cx = this.box.x + this.box.w / 2;
    const full = 2 * Math.max(cx, W - cx);
    c.aspect = full / H;
    c.setViewOffset(full, H, full / 2 - cx, 0, W, H);
  }

  step(): void {
    if (!this.open) {
      // (`?freecam=1`: on the map's ninth frame, once the loading screen has gone)
      if (this.auto && ++this.auto > 8 && !document.getElementById('loading')) {
        this.auto = 0;
        this.enter();
      }
      return;
    }
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    // The look is eased (a drag is quick, a recorded flight smooth), and so is the flight.
    const ease = 1 - Math.exp(-dt * 22);
    this.yawNow += (this.yaw - this.yawNow) * ease;
    this.pitchNow += (this.pitch - this.pitchNow) * ease;
    const fwd = this.forward(this._f);
    const right = this._r.set(Math.cos(this.yawNow), 0, -Math.sin(this.yawNow));
    let mx = 0;
    let my = 0;
    let mz = 0;
    let fast = false;
    for (const code of this.keys) {
      const m = MOVE[code];
      if (m) {
        mx += m[0];
        my += m[1];
        mz += m[2];
      } else if (SHIFT.has(code)) fast = true;
    }
    const want = this._w.set(0, my, 0).addScaledVector(right, mx).addScaledVector(fwd, mz);
    if (want.lengthSq() > 0) want.normalize().multiplyScalar(this.s.speed * (fast ? 4 : 1));
    this.vel.lerp(want, 1 - Math.exp(-dt * 9));
    this.pos.addScaledVector(this.vel, dt);
    this.limit();
    const aim = this._t.copy(this.pos).addScaledVector(fwd, AIM);
    this.o.setCamera([this.pos.x, this.pos.y, this.pos.z, aim.x, aim.y, aim.z, this.camFov()]);
    if (!this.s.hold) this.s.clock = round(this.o.clock(), 3);
    if (this.s.moon === GAME_MOON) this.s.moonAge = round(SKY.moonAge, 3);
    if (!this.s.fogHold) this.s.fog = this.o.fogAmount();
    if (this.rec) {
      this.rec.rows.push([now, this.pos.x, this.pos.y, this.pos.z, aim.x, aim.y, aim.z, this.s.lens, this.o.clock()]);
      if (now - this.rec.start > FLIGHT_MAX * 1000) void this.stopRecord();
    }
    if (now - this.hudAt > 120) {
      this.hudAt = now;
      this.showHud(now);
    }
    // (the values that move by themselves: the game's clock and moon, the speed and lens set by the wheel)
    if (now - this.syncAt > 150) {
      this.syncAt = now;
      this.sync();
    }
  }

  /** Keep the camera on the map, and over the ground and the water. */
  private limit(): void {
    const p = this.pos;
    p.x = MathUtils.clamp(p.x, MAP_BOUNDS.x0 - 80, MAP_BOUNDS.x1 + 80);
    p.z = MathUtils.clamp(p.z, MAP_BOUNDS.z0 - 80, MAP_BOUNDS.z1 + 320);
    const floor = Math.max(0, this.o.field.standY(p.x, p.z)) + CLEARANCE;
    if (p.y < floor) {
      p.y = floor;
      if (this.vel.y < 0) this.vel.y = 0;
    }
    p.y = Math.min(p.y, CEILING);
  }

  private showHud(now: number): void {
    const p = this.pos;
    const ground = Math.max(0, this.o.field.standY(p.x, p.z));
    const bearing = (((360 - deg(this.yawNow)) % 360) + 360) % 360;
    const pitch = deg(this.pitchNow);
    // (the land is finely built as far as the follow camera goes past the roaming area, and in front of the map, where the overview looks from)
    const out = roamInside(p.x, p.z, false) < -CAM_REACH;
    // (the keys for the first seconds, then only when asked for: they would cover the bottom of a tall picture)
    const keys = this.keysShown ?? now - this.openedAt < KEYS_FOR * 1000;
    const lines = [
      `<b>${Math.max(0, p.y - ground).toFixed(0)}</b> m up · look <b>${bearing.toFixed(0)}°</b> ${pitch >= 0 ? '↑' : '↓'}<b>${Math.abs(pitch).toFixed(0)}°</b> · lens <b>${this.s.lens.toFixed(0)}°</b> · <b>${this.s.speed.toFixed(0)}</b> m/s${this.s.freeze ? ' · <b>❄ time stands still</b>' : ''}${keys ? '' : ' · ? keys'}`,
      ...(keys ? ['W A S D fly · Q E down / up · Shift fast · drag to look · wheel: speed · pinch: zoom', 'V picture · R video · F freeze time · H hide the panel · ? keys · Esc leave'] : []),
    ];
    if (out) lines.push('<i>⚠ past the detailed land: the far edges are built with big blocks</i>');
    if (this.rec) lines.unshift(`<i>● recording “${this.rec.name}” ${((now - this.rec.start) / 1000).toFixed(1)} s · R stops</i>`);
    this.hud.innerHTML = lines.join('\n');
  }

  // ── Opening and leaving ──────────────────────────────────────────────────

  private enter(): void {
    // (not under the loading screen: the map is not running yet)
    if (this.open || document.getElementById('loading')) return;
    const c = this.o.camera;
    c.updateMatrixWorld();
    const d = c.getWorldDirection(this._f);
    this.pos.copy(c.position);
    this.yaw = this.yawNow = Math.atan2(-d.x, -d.z);
    this.pitch = this.pitchNow = Math.asin(MathUtils.clamp(d.y, -1, 1));
    this.vel.set(0, 0, 0);
    this.open = true;
    this.chromeHidden = false;
    this.last = this.openedAt = performance.now();
    this.prevHold = this.o.clockHeld();
    this.s.hold = this.prevHold !== null;
    this.s.clock = round(this.prevHold ?? this.o.clock(), 3);
    this.prevMoon = this.o.moonHeld();
    this.moonFields(this.prevMoon);
    this.prevFog = this.o.fogAmountHeld();
    this.s.fogHold = this.prevFog !== null;
    this.s.fog = this.prevFog ?? this.o.fogAmount();
    this.s.freeze = false;
    this.explorerWas = this.o.explorer()?.visible ?? true;
    // (roaming, he is in the picture unless unticked; on the overview he is not)
    if (!this.explorerPicked) this.s.explorer = this.o.roaming();
    const fov = c.fov;
    this.layout();
    // (the lens starts as the view is, so nothing jumps)
    this.s.lens = MathUtils.clamp(round(deg(2 * Math.atan(Math.tan(rad(fov) / 2) * (this.box.h / innerHeight))), 1), 12, 100);
    document.body.classList.add('freecam');
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.applyExplorer();
    this.hud.style.display = 'block';
    this.panel.classList.add('open');
    this.sync();
    this.refreshList();
  }

  private exit(): void {
    if (!this.open) return;
    if (this.rec) void this.stopRecord();
    this.open = false;
    this.keys.clear();
    this.drag = null;
    document.body.classList.remove('freecam');
    const c = this.o.camera;
    c.clearViewOffset();
    c.aspect = innerWidth / innerHeight;
    c.updateProjectionMatrix();
    this.o.setCamera(null);
    this.o.restore();
    this.o.setClock(this.prevHold);
    this.o.setMoon(this.prevMoon);
    this.o.setFogAmount(this.prevFog);
    this.held = null;
    this.s.weather = null;
    const ex = this.o.explorer();
    if (ex && ex.visible !== this.explorerWas) {
      ex.visible = this.explorerWas;
      this.o.redrawShadows();
    }
    this.guide.style.display = 'none';
    this.hud.style.display = 'none';
    this.panel.classList.remove('open');
    this.o.canvas.style.cursor = '';
  }

  /** H: the panel, the frame and the notes away, for a clean look (the frame then has the whole window). */
  private hideChrome(hide: boolean): void {
    this.chromeHidden = hide;
    this.hud.style.display = hide ? 'none' : 'block';
    this.panel.classList.toggle('open', !hide);
    this.layout();
  }

  private applyExplorer(): void {
    const ex = this.o.explorer();
    if (!ex || ex.visible === this.s.explorer) return;
    ex.visible = this.s.explorer;
    this.o.redrawShadows();
  }

  // ── Keys, the pointer ────────────────────────────────────────────────────

  private inPanel(t: EventTarget | null): boolean {
    return t instanceof Node && this.panel.contains(t);
  }

  private key(e: KeyboardEvent, down: boolean): void {
    const inField = typing(e.target);
    if (!this.open) {
      if (down && e.code === 'Backquote' && !inField && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !document.body.classList.contains('reporting')) {
        e.preventDefault();
        this.enter();
      }
      return;
    }
    if (inField) {
      // (a field of the panel: Enter or Esc leaves it, the other keys are typed)
      if (down && (e.code === 'Escape' || e.code === 'Enter')) (e.target as HTMLElement).blur();
      return;
    }
    // (a key let go goes on to the page: roaming may have seen it pressed, and lets go of it only then)
    if (!down) {
      this.keys.delete(e.code);
      return;
    }
    // (nothing else on the page hears a key pressed while the camera is free)
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) return;
    if (MOVE[e.code] || SHIFT.has(e.code)) {
      e.preventDefault();
      this.keys.add(e.code);
      // (a slider or a button of the panel that has the focus must not take the arrows or Space too)
      if (this.inPanel(document.activeElement)) (document.activeElement as HTMLElement).blur();
      return;
    }
    if (e.repeat) return;
    switch (e.code) {
      case 'Backquote':
      case 'Escape':
        e.preventDefault();
        this.exit();
        break;
      case 'KeyV':
        void this.takePicture();
        break;
      case 'KeyR':
        this.toggleRecord();
        break;
      case 'KeyF':
        this.s.freeze = !this.s.freeze;
        this.sync();
        break;
      case 'KeyH':
        this.hideChrome(!this.chromeHidden);
        break;
      case 'Slash':
        this.keysShown = !(this.keysShown ?? performance.now() - this.openedAt < KEYS_FOR * 1000);
        this.hudAt = 0;
        break;
    }
  }

  private pointerDown(e: PointerEvent): void {
    if (!this.open || this.inPanel(e.target)) return;
    e.stopPropagation();
    if (e.target !== this.o.canvas || !e.isPrimary) return;
    e.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.drag = { id: e.pointerId };
    try {
      this.o.canvas.setPointerCapture(e.pointerId);
    } catch {
      // (a pointer that is already gone)
    }
    this.o.canvas.style.cursor = 'grabbing';
  }

  private pointerMove(e: PointerEvent): void {
    if (!this.open) return;
    if (!this.drag) {
      if (!this.inPanel(e.target)) e.stopPropagation();
      return;
    }
    if (e.pointerId !== this.drag.id) return;
    e.stopPropagation();
    // (a narrower lens turns the view by less)
    const k = (0.0034 * Math.tan(rad(this.camFov()) / 2)) / Math.tan(rad(27.5));
    this.yaw -= e.movementX * k;
    this.pitch = MathUtils.clamp(this.pitch - e.movementY * k, -1.52, 1.52);
  }

  /** A press let go (or lost): it goes on to the page, which may have seen it begin (roaming lets go of its drag then). */
  private pointerUp(e: PointerEvent): void {
    if (!this.open || !this.drag || e.pointerId !== this.drag.id) return;
    this.drag = null;
    this.o.canvas.style.cursor = '';
  }

  private wheel(e: WheelEvent): void {
    if (!this.open || this.inPanel(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    // (a pinch on a trackpad comes as a wheel with Ctrl held)
    if (e.ctrlKey) this.s.lens = MathUtils.clamp(this.s.lens * Math.exp(e.deltaY * 0.01), 12, 100);
    else this.s.speed = MathUtils.clamp(this.s.speed * Math.exp(-e.deltaY * 0.0015), SPEED_MIN, SPEED_MAX);
  }

  // ── Time and weather ─────────────────────────────────────────────────────

  weather(w: MapWeather): void {
    if (!this.open || !this.held) return;
    // (the wind's direction stays the game's: a held weather only sets how much)
    const dir = w.windDir;
    Object.assign(w, CALM_WEATHER, this.held);
    w.windDir = dir;
  }

  private pickWeather(key: string | null): void {
    this.s.weather = key;
    if (key === null) this.held = null;
    else if (key === VIEW_WEATHER) this.held = this.viewWeather ?? {};
    else this.held = HELD_WEATHER[key] ?? {};
    this.sync();
  }

  /** Hold the time of day at a clock, or let the game's own time run (null). */
  private holdClock(clock: number | null): void {
    this.s.hold = clock !== null;
    if (clock !== null) this.s.clock = round(((clock % 1) + 1) % 1, 3);
    this.o.setClock(clock === null ? null : this.s.clock);
    this.sync();
  }

  /** The panel's moon fields for an age (null: the calendar's own moon, which the slider then follows). */
  private moonFields(age: number | null): void {
    if (age === null) {
      this.s.moon = GAME_MOON;
      this.s.moonAge = round(SKY.moonAge, 3);
      return;
    }
    this.s.moonAge = round(MathUtils.clamp(age, 0, 1), 3);
    this.s.moon = moonName(this.s.moonAge);
  }

  /** Hold the moon at an age (0 new … 0.5 full), or let the calendar's own moon show (null). */
  private holdMoon(age: number | null): void {
    this.moonFields(age);
    this.o.setMoon(age === null ? null : this.s.moonAge);
    this.sync();
  }

  /** Hold the fog at a thickness (0 clear … 1.5 thick), or let the settings' show (null). */
  private holdFog(amount: number | null): void {
    this.s.fogHold = amount !== null;
    this.s.fog = amount === null ? this.o.fogAmount() : round(MathUtils.clamp(amount, 0, FOG_AMOUNT_MAX), 2);
    this.o.setFogAmount(amount === null ? null : this.s.fog);
    this.sync();
  }

  // ── Saving ───────────────────────────────────────────────────────────────

  /** The camera as saved: `cam=` values, the lens as the field of view (the picture is cut to the frame's shape). */
  private frameCam(): number[] {
    const fwd = this.forward(this._f);
    const aim = this._t.copy(this.pos).addScaledVector(fwd, AIM);
    return [this.pos.x, this.pos.y, this.pos.z, aim.x, aim.y, aim.z, this.s.lens].map((v) => round(v, 2));
  }

  private taken(): Set<string> {
    return new Set([...this.list.views.map((v) => v.name), ...this.list.flights.map((f) => f.name)]);
  }

  /**
   * A name from the place in the picture and the time of day ("angkor-wat-night"; "-2", "-3"… when it is taken), and
   * what it is (a word after it). The place: of those in the frame and within their reach, the one nearest the frame's
   * middle, a far one counting as further off it.
   */
  private autoName(what = ''): string {
    const fwd = this.forward(this._f);
    const [w, h] = this.size();
    const halfV = rad(this.s.lens) / 2;
    const halfH = Math.atan(Math.tan(halfV) * (w / h));
    const right = this._r.set(Math.cos(this.yawNow), 0, -Math.sin(this.yawNow));
    const up = this._w.crossVectors(right, fwd);
    let best: { word: string; k: number } | null = null;
    for (const n of NAMED) {
      const to = this._t.set(n.x - this.pos.x, Math.max(0, this.o.field.standY(n.x, n.z)) + 4 - this.pos.y, n.z - this.pos.z);
      const dist = to.length();
      const ahead = to.dot(fwd);
      if (dist > n.reach || ahead <= 0) continue;
      const across = Math.abs(Math.atan2(to.dot(right), ahead));
      const upDown = Math.abs(Math.atan2(to.dot(up), ahead));
      if (across > halfH || upDown > halfV) continue;
      const k = Math.acos(MathUtils.clamp(ahead / dist, -1, 1)) * (1 + dist / n.reach) * (n.reach >= 450 ? 0.5 : 1);
      if (!best || k < best.k) best = { word: n.word, k };
    }
    const place = best ? slug(best.word) : this.pos.y - Math.max(0, this.o.field.standY(this.pos.x, this.pos.z)) > 200 ? 'highlands' : 'jungle';
    const base = [place, timeWord(this.s.clock), what].filter(Boolean).join('-');
    const taken = this.taken();
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  }

  /** The typed name, if there is one and it is not another kind's (a view and a flight never share a name). */
  private typedName(kind: 'view' | 'flight'): string {
    const name = safeName(this.s.name);
    if (!name) return '';
    const other = kind === 'view' ? this.list.flights : this.list.views;
    return other.some((x) => x.name === name) ? '' : name;
  }

  /** The words for the picture button: a typed name that is saved already is replaced. */
  private replacing(): string | null {
    const name = safeName(this.s.name);
    return name && this.list.views.some((v) => v.name === name) ? name : null;
  }

  private say(text: string, error = false): void {
    this.statusText = text;
    this.statusError = error;
    this.showStatus();
  }

  /** V: save the view as a picture and draw it at once. */
  private async takePicture(): Promise<void> {
    if (!this.open) return;
    const [w, h] = this.size();
    const replaced = this.replacing();
    const name = this.typedName('view') || this.autoName();
    const withExplorer = this.s.explorer;
    const v: WallpaperView = {
      name,
      cam: this.frameCam(),
      w,
      h,
      shape: this.s.shape,
      query: this.o.moment(withExplorer && this.o.roaming()).toString(),
      noExplorer: !withExplorer,
      screenH: this.screenH(),
      saved: '',
    };
    try {
      this.list = await call<WallpaperList>('/view', { method: 'POST', body: JSON.stringify(v) });
      // (a new name is used once; a picture being replaced keeps its name, to try another time of day on it)
      if (!replaced) this.s.name = '';
      this.pick = `view:${name}`;
      this.showList();
      this.draw(this.itemOf('view', name)!, `${replaced ? 'Replaced' : 'Saved'} “${name}”.`);
    } catch (err) {
      this.say(`Not saved: ${message(err)}`, true);
    }
  }

  private toggleRecord(): void {
    if (this.rec) void this.stopRecord();
    else this.startRecord();
  }

  private startRecord(): void {
    if (!this.open) return;
    const [w, h] = this.size();
    const withExplorer = this.s.explorer;
    const q = this.o.moment(withExplorer && this.o.roaming());
    const t0 = Number(q.get('t')) || 0;
    // (each frame of the flight has its own clock; the scene's time goes on from `t0` unless it stands still)
    for (const k of ['t', 'clock']) q.delete(k);
    const name = this.typedName('flight') || this.autoName(this.s.closeLoop ? 'loop' : 'video');
    this.rec = { name, start: performance.now(), rows: [], w, h, t0, frozen: this.s.freeze, query: q.toString(), noExplorer: !withExplorer, screenH: this.screenH() };
    this.guide.classList.add('rec');
    this.sync();
    this.say(`● Recording “${name}”. Fly, then press R to stop.${this.s.closeLoop ? ' The camera flies back to the start by itself, so the video can repeat.' : ''}`);
  }

  private async stopRecord(): Promise<void> {
    const rec = this.rec;
    this.rec = null;
    this.guide.classList.remove('rec');
    this.sync();
    if (!rec || rec.rows.length < 3) return this.say('That flight was too short: nothing saved.', true);
    // (the frames the game drew, an even thirty a second)
    const { rows } = rec;
    const t0 = rows[0][0];
    const n = Math.max(2, Math.floor(((rows[rows.length - 1][0] - t0) / 1000) * FLIGHT_FPS) + 1);
    const samples: number[][] = [];
    for (let i = 0, j = 0; i < n; i++) {
      const at = t0 + (i / FLIGHT_FPS) * 1000;
      while (j < rows.length - 2 && rows[j + 1][0] < at) j++;
      const [a, b] = [rows[j], rows[j + 1]];
      const u = MathUtils.clamp((at - a[0]) / Math.max(1e-6, b[0] - a[0]), 0, 1);
      samples.push(
        a.slice(1).map((v, k) => {
          // (the clock wraps at 1: from 0.99 to 0.01 is a short step forward, not most of the dial back)
          if (k === 7) return round((((v + (((b[k + 1] - v + 1.5) % 1) - 0.5) * u) % 1) + 1) % 1, 4);
          return round(v + (b[k + 1] - v) * u, 2);
        }),
      );
    }
    // (a loop flies back to where it began: what the video needs to repeat)
    const loop = this.s.closeLoop;
    const all = loop ? this.closePath(samples) : samples;
    const flight: WallpaperFlight = { name: rec.name, w: rec.w, h: rec.h, fps: FLIGHT_FPS, frozen: rec.frozen, t0: rec.t0, query: rec.query, noExplorer: rec.noExplorer, screenH: rec.screenH, samples: all, loop, saved: '' };
    await this.saveFlight(flight, loop ? `it flies back to the start over ${((all.length - samples.length + 1) / FLIGHT_FPS).toFixed(1)} s, so that it can repeat` : '');
  }

  /**
   * A flown path made a loop: the way back to its start is added, smooth where it leaves the last frame and where it
   * reaches the first (a cubic with the speeds the path has at those two frames). The frame after the last is the
   * first again.
   */
  private closePath(rows: number[][]): number[][] {
    const n = rows.length;
    const first = rows[0];
    const last = rows[n - 1];
    // (the day's clock is a dial: the short way from one value to another)
    const short = (a: number, b: number) => ((b - a + 1.5) % 1) - 0.5;
    const speed = (from: number[], to: number[]) => to.map((v, k) => (k === 7 ? short(from[k], v) : v - from[k]) * FLIGHT_FPS);
    const v1 = speed(rows[n - 2], last);
    const v0 = speed(first, rows[1]);
    const dist = Math.hypot(first[0] - last[0], first[1] - last[1], first[2] - last[2]);
    const seconds = MathUtils.clamp(2 + dist / 20, 2.5, 10);
    const m = Math.round(seconds * FLIGHT_FPS);
    const out = rows.slice();
    for (let j = 1; j < m; j++) {
      const u = j / m;
      const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
      const h10 = u ** 3 - 2 * u ** 2 + u;
      const h01 = -2 * u ** 3 + 3 * u ** 2;
      const h11 = u ** 3 - u ** 2;
      out.push(
        last.map((v, k) => {
          const end = k === 7 ? v + short(v, first[7]) : first[k];
          const x = h00 * v + h10 * seconds * v1[k] + h01 * end + h11 * seconds * v0[k];
          return k === 7 ? round(((x % 1) + 1) % 1, 4) : round(x, 2);
        }),
      );
    }
    return out;
  }

  /** Where the view meets the ground (or the water): the point an orbit goes round. Nothing within reach: a point in the air ahead. */
  private groundAhead(): Vector3 {
    const f = this.forward(new Vector3());
    const p = this.pos;
    const at = (d: number) => this._t.set(p.x + f.x * d, p.y + f.y * d, p.z + f.z * d);
    const below = (d: number) => {
      const q = at(d);
      return q.y <= this.o.field.standY(q.x, q.z);
    };
    let near = 0;
    for (let d = 4; d <= 1600; d += 4) {
      if (below(d)) {
        let far = d;
        for (let k = 0; k < 10; k++) {
          const mid = (near + far) / 2;
          if (below(mid)) far = mid;
          else near = mid;
        }
        return at(far).clone();
      }
      near = d;
    }
    return at(160).clone();
  }

  /**
   * The frames of a loop made from the view: a camera path that comes round to where it began (the frame after the
   * last is the first), whatever its kind, and the same lens.
   * - Orbit: the whole view turns once about a vertical line through the point it meets the ground, so the picture keeps
   *   its composition while the world goes round behind it.
   * - Sway: a slow turn and a little sideways.
   * - Push in and out: forward some metres and back.
   * - Day and night: the light goes round once (the clock 0 → 1) while the camera drifts a little.
   */
  private loopSamples(kind: LoopKind, seconds: number, reverse: boolean): { rows: number[][]; raised: number } {
    const n = Math.max(FLIGHT_FPS, Math.round(seconds * FLIGHT_FPS));
    const p0 = this.pos.clone();
    const yaw0 = this.yawNow;
    const pitch0 = this.pitchNow;
    const clock0 = this.o.clock();
    const centre = kind === LOOPS[0] ? this.groundAhead() : p0;
    const sign = reverse ? -1 : 1;
    const right0 = new Vector3(Math.cos(yaw0), 0, -Math.sin(yaw0));
    const fwd0 = new Vector3(-Math.sin(yaw0) * Math.cos(pitch0), Math.sin(pitch0), -Math.cos(yaw0) * Math.cos(pitch0));
    const pos = new Vector3();
    const f = new Vector3();
    const aim = new Vector3();
    const rows: number[][] = [];
    let raised = 0;
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const a = Math.PI * 2 * u;
      let yaw = yaw0;
      let pitch = pitch0;
      let clock = clock0;
      pos.copy(p0);
      if (kind === LOOPS[0]) {
        const turn = a * sign;
        const dx = p0.x - centre.x;
        const dz = p0.z - centre.z;
        pos.x = centre.x + dx * Math.cos(turn) + dz * Math.sin(turn);
        pos.z = centre.z - dx * Math.sin(turn) + dz * Math.cos(turn);
        yaw = yaw0 + turn;
      } else if (kind === LOOPS[1]) {
        yaw = yaw0 + rad(7) * Math.sin(a);
        pitch = pitch0 + rad(1.2) * Math.sin(a + Math.PI / 2);
        pos.addScaledVector(right0, 3 * Math.sin(a)).addScaledVector(UP, 0.8 * Math.sin(2 * a));
      } else if (kind === LOOPS[2]) {
        pos.addScaledVector(fwd0, 30 * (0.5 - 0.5 * Math.cos(a)));
      } else {
        yaw = yaw0 + rad(3) * Math.sin(a);
        pos.addScaledVector(right0, 1.5 * Math.sin(a));
        clock = (((clock0 + u) % 1) + 1) % 1;
      }
      // (over the ground and the water: lifted where the path would touch them)
      const floor = Math.max(0, this.o.field.standY(pos.x, pos.z)) + CLEARANCE;
      if (pos.y < floor) {
        pos.y = floor;
        raised++;
      }
      pos.y = Math.min(pos.y, CEILING);
      f.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      aim.copy(pos).addScaledVector(f, AIM);
      rows.push([pos.x, pos.y, pos.z, aim.x, aim.y, aim.z, this.s.lens, clock].map((v, k) => round(v, k === 7 ? 4 : 2)));
    }
    return { rows, raised };
  }

  /** Make a loop video from the view the camera has now (the kind and the seconds of the Video settings), and draw it. */
  private async makeLoop(): Promise<void> {
    if (!this.open) return;
    const kind = this.s.loopKind;
    const seconds = MathUtils.clamp(Math.round(this.s.loopSeconds), 4, 180);
    const { rows, raised } = this.loopSamples(kind, seconds, this.s.loopReverse);
    const [w, h] = this.size();
    const withExplorer = this.s.explorer;
    const q = this.o.moment(withExplorer && this.o.roaming());
    const t0 = Number(q.get('t')) || 0;
    for (const k of ['t', 'clock']) q.delete(k);
    const name = this.typedName('flight') || this.autoName(LOOP_WORD[kind]);
    const flight: WallpaperFlight = { name, w, h, fps: FLIGHT_FPS, frozen: this.s.freeze, t0, query: q.toString(), noExplorer: !withExplorer, screenH: this.screenH(), samples: rows, loop: true, kind, saved: '' };
    await this.saveFlight(flight, `${kind.toLowerCase()}${raised ? `; lifted over the land in ${raised} frames` : ''}`);
  }

  /** How long a video takes to draw, in words (a rough guess: the frames, a JPEG each, and the encoder). */
  private estimate(frames: number, w: number, h: number): string {
    const seconds = 15 + frames * (0.032 + (0.0104 * w * h) / 1e6) * 1.4;
    return seconds < 90 ? 'about a minute' : `about ${Math.round(seconds / 60)} minutes`;
  }

  /** Save a flight (flown, or a loop made from the view), and draw its video at once if the Video settings say so. */
  private async saveFlight(flight: WallpaperFlight, note: string): Promise<void> {
    try {
      this.list = await call<WallpaperList>('/flight', { method: 'POST', body: JSON.stringify(flight) });
      this.s.name = '';
      this.pick = `flight:${flight.name}`;
      this.showList();
      const what = `${flight.loop ? 'the loop' : 'the video'} “${flight.name}” (${(flight.samples.length / FLIGHT_FPS).toFixed(1)} s${note ? `; ${note}` : ''})`;
      if (this.s.drawNow) this.draw(this.itemOf('flight', flight.name)!, `Saved ${what}.`);
      else this.say(`Saved ${what}. Press “Draw” under it to make the video.`);
    } catch (err) {
      this.say(`Not saved: ${message(err)}`, true);
    }
  }

  // ── Drawing ──────────────────────────────────────────────────────────────

  /** Draw a picture or a video at full quality; one at a time (the graphics card is shared): the next waits its turn. */
  private draw(item: Item, lead = ''): void {
    const key = `${item.kind}:${item.name}`;
    if (this.drawing) {
      if (`${this.drawing.kind}:${this.drawing.name}` !== key && !this.queue.some((q) => `${q.kind}:${q.name}` === key)) this.queue.push(item);
      this.say(`${lead ? `${lead} ` : ''}“${item.name}” waits its turn: “${this.drawing.name}” is being drawn.`);
      this.showList();
      return;
    }
    void this.startRender(item, lead);
  }

  private async startRender(item: Item, lead = ''): Promise<void> {
    this.drawing = item;
    this.stopped = false;
    this.result = null;
    this.progress(0);
    this.showList();
    const hint = item.kind === 'flight' ? ` (${this.estimate(Math.round((item.seconds ?? 10) * FLIGHT_FPS), item.w, item.h)})` : '';
    this.say(`${lead ? `${lead} ` : ''}Drawing “${item.name}” at full quality…${hint}`);
    try {
      const codec = FORMATS[this.s.format] ?? 'hevc';
      const job = await call<WallpaperJob>('/render', { method: 'POST', body: JSON.stringify({ names: [item.name], codec }) });
      await this.watch(job.id, item, lead, hint);
    } catch (err) {
      this.say(`${lead ? `${lead} ` : ''}Not drawn: ${message(err)}`, true);
    }
    this.drawing = null;
    this.progress(null);
    const next = this.stopped ? undefined : this.queue.shift();
    if (this.stopped) this.queue.length = 0;
    this.showStatus();
    this.showList();
    if (next) void this.startRender(next);
  }

  /** Follow a render until it is done, and show what it drew. */
  private async watch(id: string, item: Item, lead: string, hint: string): Promise<void> {
    const started = performance.now();
    for (;;) {
      const job = await call<WallpaperJob>(`/job?id=${id}`);
      const secs = ((performance.now() - started) / 1000).toFixed(0);
      if (job.status === 'running') {
        const frames = job.now && job.now.total > 1 ? job.now : null;
        this.progress(frames ? frames.done / frames.total : null);
        const waiting = this.queue.length ? ` · ${this.queue.length} more to draw after it` : '';
        this.say(`${lead ? `${lead} ` : ''}Drawing “${item.name}” at full quality… ${frames ? `frame ${frames.done} of ${frames.total}, ` : ''}${secs} s${hint}${waiting}`);
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }
      if (job.status === 'failed') {
        this.say(this.stopped ? `Stopped drawing “${item.name}”.` : `Could not draw “${item.name}”: ${job.error ?? job.log.slice(-2).join(' · ')}`, !this.stopped);
        return;
      }
      const file = job.files.find((f) => f.name === item.name)?.file ?? '';
      this.list = await call<WallpaperList>('/list').catch(() => this.list);
      this.result = file ? { item, file } : null;
      this.pick = `${item.kind}:${item.name}`;
      this.say(`Done in ${secs} s: wallpapers/${file}`);
      return;
    }
  }

  /** Stop the render that is running (a video can take an hour at 4K), and what waits. */
  private async stopRender(): Promise<void> {
    this.stopped = true;
    this.queue.length = 0;
    try {
      await call<unknown>('/cancel', { method: 'POST' });
      this.say('Stopping…');
    } catch (err) {
      this.say(`Could not stop it: ${message(err)}`, true);
    }
  }

  private progress(k: number | null): void {
    this.bar.style.display = k === null && !this.drawing ? 'none' : 'block';
    (this.bar.firstElementChild as HTMLElement).style.width = `${Math.round((k ?? 0.08) * 100)}%`;
  }

  // ── The gallery ──────────────────────────────────────────────────────────

  private items(): Item[] {
    const all: Item[] = [...this.list.views.map((v): Item => ({ kind: 'view', name: v.name, w: v.w, h: v.h, saved: v.saved })), ...this.list.flights.map((f): Item => ({ kind: 'flight', name: f.name, w: f.w, h: f.h, saved: f.saved, seconds: f.seconds, loop: f.loop }))];
    return all.sort((a, b) => (b.saved > a.saved ? 1 : b.saved < a.saved ? -1 : 0));
  }

  private itemOf(kind: Item['kind'], name: string): Item | null {
    return this.items().find((i) => i.kind === kind && i.name === name) ?? null;
  }

  private selected(): Item | null {
    return this.items().find((i) => `${i.kind}:${i.name}` === this.pick) ?? null;
  }

  private thumb(name: string): string | null {
    const at = this.list.drawn?.[name];
    return this.list.out[name] ? `${WALLPAPER_ENDPOINT}/thumb/${encodeURIComponent(name)}?v=${Math.round(at ?? 0)}` : null;
  }

  private refreshList(): void {
    call<WallpaperList>('/list').then(
      (list) => {
        this.list = list;
        this.showList();
      },
      (err) => this.say(`Wallpapers: ${message(err)}`, true),
    );
  }

  /** The gallery: a tile for each picture and video, newest first; the picked one bigger, with what can be done with it. */
  private showList(): void {
    const items = this.items();
    if (!items.some((i) => `${i.kind}:${i.name}` === this.pick)) this.pick = items[0] ? `${items[0].kind}:${items[0].name}` : '';
    this.galleryTitle.textContent = `My pictures and videos (${items.length})`;
    const busy = new Set([this.drawing, ...this.queue].filter(Boolean).map((i) => `${i!.kind}:${i!.name}`));
    const tiles = items.map((it) => {
      const key = `${it.kind}:${it.name}`;
      const tile = el('button', `fc-tile${key === this.pick ? ' on' : ''}${busy.has(key) ? ' busy' : ''}`);
      tile.type = 'button';
      tile.title = `${it.name} · ${it.w}×${it.h}${it.kind === 'flight' ? ` · a ${it.loop ? 'loop ' : ''}video of ${(it.seconds ?? 0).toFixed(0)} s` : ''}\nClick: pick it · Double-click: go there`;
      const src = this.thumb(it.name);
      if (src) {
        const img = el('img');
        img.loading = 'lazy';
        img.src = src;
        img.alt = '';
        tile.append(img);
      } else tile.append(el('span', 'fc-none', busy.has(key) ? 'drawing…' : 'not drawn'));
      if (it.kind === 'flight') tile.append(el('span', 'fc-kind', it.loop ? '🔁' : '🎞'));
      tile.append(el('span', 'fc-name', it.name));
      tile.dataset.key = key;
      tile.onclick = () => {
        this.pick = key;
        // (only the marks and the picked one: a list made again under the pointer would take a double-click's second click)
        for (const t of this.grid.querySelectorAll<HTMLElement>('.fc-tile')) t.classList.toggle('on', t.dataset.key === key);
        this.showPicked();
      };
      tile.ondblclick = () => {
        this.pick = key;
        void this.goTo();
      };
      return tile;
    });
    this.grid.replaceChildren(...tiles);
    if (!items.length) this.grid.replaceChildren(el('div', 'fc-note', 'Nothing yet. Fly somewhere you like and press V.'));
    this.showPicked();
    this.sync();
  }

  private showPicked(): void {
    const it = this.selected();
    this.picked.replaceChildren();
    if (!it) return;
    const src = this.thumb(it.name);
    // (always as tall: a picture that loads late must not move the tiles under the pointer, between the two clicks of a double-click)
    const shot = el('div', 'fc-shot', src ? '' : 'not drawn yet');
    if (src) {
      const img = el('img');
      img.src = src;
      img.alt = '';
      img.title = 'Open it';
      img.onclick = () => this.openFile(it);
      shot.append(img);
    }
    this.picked.append(shot);
    const kind = it.kind === 'view' ? 'picture' : `${it.loop ? 'loop ' : ''}video, ${(it.seconds ?? 0).toFixed(0)} s`;
    this.picked.append(el('div', 'fc-title', it.name), el('div', 'fc-note', `${kind} · ${it.w}×${it.h}${src ? '' : ' · not drawn yet'}`));
    const acts = el('div', 'fc-acts');
    const busy = this.drawing?.name === it.name || this.queue.some((q) => q.name === it.name);
    acts.append(
      this.button2('📍 Go there', 'Put the camera, the time, the moon, the fog, the weather, the frame and the explorer back as they were', () => void this.goTo()),
      this.button2(src ? '↻ Draw again' : '▶ Draw', 'Draw it at full quality (a video takes a while)', () => this.draw(it), busy),
      this.button2('↗ Open', 'Open the picture or the video in a new tab', () => this.openFile(it), !src),
      this.button2('📂 Finder', 'Show the file in the Finder', () => void this.reveal(it), !src),
      this.forgetButton(it),
    );
    this.picked.append(acts);
  }

  private button2(text: string, title: string, onClick: () => void, disabled = false): HTMLButtonElement {
    const b = el('button', 'fc-btn', text);
    b.type = 'button';
    b.title = title;
    b.disabled = disabled;
    b.onclick = () => {
      b.blur();
      onClick();
    };
    return b;
  }

  /** Forget: a second click within a few seconds does it (the drawn file stays in wallpapers/out/). */
  private forgetButton(it: Item): HTMLButtonElement {
    let armed = 0;
    const b = this.button2('🗑 Forget', 'Take it off the list (its file stays in wallpapers/out/)', () => {
      if (performance.now() - armed > 3000) {
        armed = performance.now();
        b.textContent = 'Sure? Click';
        b.classList.add('warn');
        setTimeout(() => {
          b.textContent = '🗑 Forget';
          b.classList.remove('warn');
        }, 3000);
        return;
      }
      void this.forget(it);
    });
    return b;
  }

  private openFile(it: Item): void {
    const file = this.list.out[it.name];
    if (file) window.open(`${WALLPAPER_ENDPOINT}/file/${file}?at=${Math.round(this.list.drawn?.[it.name] ?? 0)}`, '_blank');
  }

  private async reveal(it: Item): Promise<void> {
    try {
      await call<unknown>(`/reveal?name=${encodeURIComponent(it.name)}`, { method: 'POST' });
    } catch (err) {
      this.say(`Could not show it: ${message(err)}`, true);
    }
  }

  private async forget(it: Item): Promise<void> {
    try {
      this.list = await call<WallpaperList>(`/${it.kind}?name=${encodeURIComponent(it.name)}`, { method: 'DELETE' });
      // (its name typed to replace it is not wanted any more)
      if (safeName(this.s.name) === it.name) this.s.name = '';
      this.showList();
      this.say(`Forgot “${it.name}” (a file already drawn stays in wallpapers/out/).`);
    } catch (err) {
      this.say(`Not forgotten: ${message(err)}`, true);
    }
  }

  /** The shape that has these pixels, else Custom with them. */
  private shapeOf(w: number, h: number): string {
    const name = Object.keys(SHAPES).find((k) => SHAPES[k][0] === w && SHAPES[k][1] === h);
    if (name) return name;
    this.s.customW = w;
    this.s.customH = h;
    return 'Custom';
  }

  /** Back to a saved picture (or a video's start), with its time of day, its moon, its fog, its weather, its shape and its explorer. */
  private async goTo(): Promise<void> {
    const item = this.selected();
    if (!this.open || !item) return;
    try {
      let cam: number[];
      let query: string;
      let explorer: boolean;
      let size: [number, number];
      if (item.kind === 'view') {
        const v = this.list.views.find((x) => x.name === item.name);
        if (!v) return;
        [cam, query, explorer, size] = [v.cam, v.query, !v.noExplorer, [v.w, v.h]];
        // (a picture is one moment: it stands still, as it was; F lets it run)
        this.s.freeze = true;
      } else {
        const f = await call<WallpaperFlight>(`/file/paths/${encodeURIComponent(item.name)}.json`);
        // (a flight's clock is in its frames, not in its query)
        [cam, query, explorer, size] = [f.samples[0].slice(0, 7), `${f.query}&clock=${f.samples[0][7]}`, !f.noExplorer, [f.w, f.h]];
        this.s.freeze = f.frozen;
      }
      const d = new Vector3(cam[3] - cam[0], cam[4] - cam[1], cam[5] - cam[2]).normalize();
      this.pos.set(cam[0], cam[1], cam[2]);
      this.yaw = this.yawNow = Math.atan2(-d.x, -d.z);
      this.pitch = this.pitchNow = Math.asin(MathUtils.clamp(d.y, -1, 1));
      this.vel.set(0, 0, 0);
      this.s.lens = cam[6];
      this.s.shape = this.shapeOf(size[0], size[1]);
      this.s.explorer = explorer;
      this.explorerPicked = true;
      this.applyExplorer();
      const q = new URLSearchParams(query);
      if (q.has('clock')) this.holdClock(Number(q.get('clock')));
      // (the moon the picture shows, not today's: the one it holds, else the phase its date gave it)
      this.holdMoon(savedMoon(q));
      // (and its fog: the thickness it was framed in, the game's own when it has none)
      this.holdFog(q.has('fogamount') ? Number(q.get('fogamount')) : 1);
      this.viewWeather = {};
      for (const k of WEATHER_KEYS) if (q.has(k)) this.viewWeather[k] = Number(q.get(k));
      this.pickWeather(VIEW_WEATHER);
      // (roaming when it was saved: he is put back where the picture has him, in its mode, posed)
      const placed = explorer && q.has('roam') && this.o.placeExplorer(q);
      this.layout();
      // (a picture's name stays typed: V replaces it; a video is not replaced by V)
      this.s.name = item.kind === 'view' ? item.name : '';
      this.sync();
      const him = placed ? ' The explorer is back where it has him.' : explorer && q.has('roam') ? ' The explorer could not be put back: a new picture shows him where he is now.' : '';
      this.say(`At “${item.name}”.${him}${item.kind === 'view' ? ' Time stands still (F lets it run). Change what you like; V replaces it.' : ''}`);
    } catch (err) {
      this.say(`Could not go there: ${message(err)}`, true);
    }
  }

  // ── The panel ────────────────────────────────────────────────────────────

  /** Show every control's value, the buttons' words and the status. */
  private sync(): void {
    for (const s of this.syncs) s();
  }

  private showStatus(): void {
    this.status.className = `fc-status${this.statusError ? ' error' : ''}`;
    this.status.replaceChildren();
    if (!this.statusText && !this.drawing) return;
    if (this.statusText) this.status.append(el('div', '', this.statusText));
    if (this.drawing) {
      const stop = this.button2('■ Stop drawing', 'Stop the picture or video being drawn (and what waits)', () => void this.stopRender());
      this.status.append(this.bar, stop);
    }
    const r = this.result;
    if (r && !this.drawing) {
      const links = el('div', 'fc-pair');
      links.append(
        this.button2('↗ Open', 'Open it in a new tab', () => this.openFile(r.item)),
        this.button2('📂 Show in Finder', 'Show the file in the Finder', () => void this.reveal(r.item)),
      );
      this.status.append(links);
    }
  }

  private section(title: string): HTMLDivElement {
    const sec = el('div', 'fc-sec');
    if (title) sec.append(el('h3', '', title));
    this.panel.append(sec);
    return sec;
  }

  private row(label: string, control: HTMLElement, value?: () => string, title = ''): HTMLDivElement {
    const r = el('div', value ? 'fc-row' : 'fc-row two');
    const l = el('span', 'fc-label', label);
    if (title) r.title = title;
    r.append(l, control);
    if (value) {
      const v = el('span', 'fc-val');
      this.syncs.push(() => (v.textContent = value()));
      r.append(v);
    }
    return r;
  }

  private chips<T>(options: [string, T][], get: () => T, set: (v: T) => void, titles: Record<string, string> = {}): HTMLDivElement {
    const box = el('div', 'fc-chips');
    const chips = options.map(([label, value]) => {
      const c = el('button', 'fc-chip', label);
      c.type = 'button';
      if (titles[label]) c.title = titles[label];
      c.onclick = () => {
        c.blur();
        set(value);
      };
      box.append(c);
      return [c, value] as const;
    });
    this.syncs.push(() => {
      const now = get();
      for (const [c, value] of chips) c.classList.toggle('on', value === now);
    });
    return box;
  }

  private range(min: number, max: number, step: number, get: () => number, set: (v: number) => void): HTMLInputElement {
    const r = el('input');
    Object.assign(r, { type: 'range', min: String(min), max: String(max), step: String(step) });
    let held = false;
    r.onpointerdown = () => (held = true);
    r.onpointerup = r.onblur = () => (held = false);
    r.oninput = () => set(Number(r.value));
    r.onchange = () => r.blur();
    this.syncs.push(() => {
      if (!held) r.value = String(get());
    });
    return r;
  }

  private select<T extends string>(options: [string, T][], get: () => T, set: (v: T) => void): HTMLSelectElement {
    const s = el('select');
    for (const [label, value] of options) s.append(new Option(label, value));
    s.onchange = () => {
      set(s.value as T);
      // (a dropdown that keeps the focus picks by typing: the keys would not fly)
      s.blur();
    };
    this.syncs.push(() => {
      if (document.activeElement !== s) s.value = get();
    });
    return s;
  }

  private check(label: string, title: string, get: () => boolean, set: (v: boolean) => void): HTMLLabelElement {
    const l = el('label', 'fc-check');
    l.title = title;
    const c = el('input');
    c.type = 'checkbox';
    c.onchange = () => {
      set(c.checked);
      c.blur();
    };
    this.syncs.push(() => (c.checked = get()));
    l.append(c, document.createTextNode(label));
    return l;
  }

  private buildPanel(): void {
    const s = this.s;
    const p = this.panel;
    const head = el('div', 'fc-head', '📷 Free camera');
    head.append(this.button2('Leave (Esc)', 'Back to the map', () => this.exit()));
    p.append(head);

    // What it is for: a picture, a video.
    const top = this.section('');
    const shoot = this.button2('📸 Take picture (V)', 'Save this view and draw it at full quality', () => void this.takePicture());
    shoot.classList.add('big');
    const rec = this.button2('● Record video (R)', 'Fly while it records; R again stops, and the video is drawn', () => this.toggleRecord());
    rec.classList.add('rec');
    const loop = this.button2('🔁 Loop video', 'A video that repeats with no jump, made from this view (the kind is under “Video settings”)', () => void this.makeLoop());
    const pair = el('div', 'fc-pair');
    pair.append(rec, loop);
    const name = el('input');
    let hintAt = -1e9;
    name.type = 'text';
    name.spellcheck = false;
    name.oninput = () => {
      s.name = name.value;
      this.sync();
    };
    top.append(shoot, pair, this.row('Name', name), this.status);
    this.syncs.push(() => {
      const r = this.replacing();
      shoot.textContent = r ? `📸 Replace “${r}” (V)` : '📸 Take picture (V)';
      rec.textContent = this.rec ? '■ Stop (R)' : '● Record video (R)';
      rec.classList.toggle('on', !!this.rec);
      if (document.activeElement !== name) name.value = s.name;
      // (the name it would get: the place looked at changes as the camera flies; worked out now and then)
      if (this.open && performance.now() - hintAt > 700) {
        hintAt = performance.now();
        name.placeholder = `${this.autoName()} (automatic)`;
      }
    });

    // The frame.
    const frame = this.section('Frame');
    const shape = this.select(
      Object.keys(SHAPES).map((k): [string, string] => [k, k]),
      () => s.shape,
      (v) => {
        s.shape = v;
        this.layout();
        this.sync();
      },
    );
    const customW = el('input');
    const customH = el('input');
    const custom = el('div', 'fc-pair');
    for (const [input, key] of [
      [customW, 'customW'],
      [customH, 'customH'],
    ] as const) {
      Object.assign(input, { type: 'number', min: '64', max: '16384', step: '2' });
      input.onchange = () => {
        s[key] = MathUtils.clamp(Number(input.value) || 64, 64, 16384);
        this.layout();
      };
      this.syncs.push(() => {
        if (document.activeElement !== input) input.value = String(s[key]);
      });
      custom.append(input);
    }
    const customRow = this.row('W × H', custom);
    this.syncs.push(() => (customRow.style.display = s.shape === 'Custom' ? '' : 'none'));
    const speedLog = (v: number) => Math.log(v / SPEED_MIN) / Math.log(SPEED_MAX / SPEED_MIN);
    frame.append(
      this.row('Size', shape, undefined, 'The picture’s shape and pixels: the frame on the screen has this shape'),
      customRow,
      this.row('Zoom', this.range(12, 100, 0.5, () => 112 - s.lens, (v) => (s.lens = round(112 - v, 1))), () => `${s.lens.toFixed(0)}°`, 'Right zooms in, left sees wider (a trackpad pinch does it too). The number is the picture’s view angle'),
      this.row('Speed', this.range(0, 1, 0.001, () => speedLog(s.speed), (v) => (s.speed = round(SPEED_MIN * (SPEED_MAX / SPEED_MIN) ** v, 1))), () => `${s.speed.toFixed(0)} m/s`, 'How fast W A S D fly (the mouse wheel sets it too; Shift is four times as fast)'),
      this.check(
        'Thirds grid',
        'Lines that cut the frame in three each way, to place things on',
        () => s.thirds,
        (v) => {
          s.thirds = v;
          this.layout();
        },
      ),
    );

    // The moment.
    const moment = this.section('Moment');
    moment.append(
      this.row(
        'Time',
        this.chips<number | null>([['Game', null], ...TIMES], () => (s.hold ? (TIMES.find(([, at]) => at === s.clock)?.[1] ?? -1) : null), (v) => this.holdClock(v), { Game: 'The game’s own time of day (it moves on)' }),
      ),
      this.row('', this.range(0, 1, 0.005, () => s.clock, (v) => this.holdClock(v)), () => (s.hold ? timeWord(s.clock) : 'game'), 'Any time of day: 0 afternoon, 0.22 sunset, 0.5 night, 0.82 dawn'),
      this.row(
        'Moon',
        this.select(
          [[GAME_MOON, GAME_MOON], ...MOONS.map(([label]): [string, string] => [label, label]), [CUSTOM_MOON, CUSTOM_MOON]],
          () => s.moon,
          (v) => {
            const phase = MOONS.find(([label]) => label === v);
            this.holdMoon(v === GAME_MOON ? null : phase ? phase[1] : s.moonAge);
          },
        ),
        undefined,
        'The moon’s phase (it shows at night)',
      ),
    );
    const moonAge = this.row('', this.range(0, 1, 0.005, () => s.moonAge, (v) => this.holdMoon(v)), () => (s.moonAge < 0.02 || s.moonAge > 0.98 ? 'new' : Math.abs(s.moonAge - 0.5) < 0.02 ? 'full' : s.moonAge < 0.5 ? 'growing' : 'shrinking'), 'The moon’s age: 0 new, 0.5 full, 1 new again');
    this.syncs.push(() => (moonAge.style.display = s.moon === GAME_MOON ? 'none' : ''));
    const weathers = el('div');
    const weatherChips = this.chips<string | null>([...WEATHERS, ['Saved', VIEW_WEATHER]], () => s.weather, (v) => this.pickWeather(v), { Game: 'The game’s own weather', Saved: 'The weather the saved picture had' });
    const savedChip = weatherChips.lastElementChild as HTMLElement;
    this.syncs.push(() => (savedChip.style.display = this.viewWeather ? '' : 'none'));
    weathers.append(weatherChips);
    const toggles = el('div', 'fc-pair');
    toggles.append(
      this.check('Freeze time (F)', 'The scene stands still: water, clouds, people and the explorer', () => s.freeze, (v) => (s.freeze = v)),
      this.check(
        'Explorer',
        'Show the explorer in the picture',
        () => s.explorer,
        (v) => {
          s.explorer = v;
          this.explorerPicked = true;
          this.applyExplorer();
        },
      ),
    );
    const fog = this.row(
      'Fog',
      this.chips<number | null>([['Game', null], ...FOGS], () => (s.fogHold ? (FOGS.find(([, at]) => at === s.fog)?.[1] ?? -1) : null), (v) => this.holdFog(v), {
        Game: 'The fog of the settings (Graphics → Fog → Thickness)',
        None: 'Clear air: no haze or valley mist (the map’s edges keep theirs)',
        Thick: 'Half again the game’s own fog',
      }),
    );
    const fogAmount = this.row('', this.range(0, FOG_AMOUNT_MAX, 0.05, () => s.fog, (v) => this.holdFog(v)), () => `${Math.round(s.fog * 100)} %${s.fogHold ? '' : ' game'}`, 'How thick the fog is: 0 clear air, 100 the game’s own, 150 thick. The map’s edges keep their mist');
    moment.append(moonAge, fog, fogAmount, this.row('Weather', weathers), toggles);

    // Video settings (folded).
    const video = this.section('');
    const more = el('details');
    const inner = el('div');
    more.append(el('summary', '', 'Video settings'), inner);
    inner.append(
      this.row(
        'Loop',
        this.select(
          LOOPS.map((k): [string, LoopKind] => [k, k]),
          () => s.loopKind,
          (v) => (s.loopKind = v),
        ),
        undefined,
        'What “Loop video” makes from the view',
      ),
      this.row('Length', this.range(4, 120, 1, () => s.loopSeconds, (v) => (s.loopSeconds = v)), () => `${s.loopSeconds.toFixed(0)} s`, 'How long a loop video lasts'),
      this.check('Turn the other way', 'An orbit or a sway the other way round', () => s.loopReverse, (v) => (s.loopReverse = v)),
      this.check('Recording flies back to the start (a loop)', 'When R stops, the camera flies back to where it began, so the video repeats with no jump', () => s.closeLoop, (v) => (s.closeLoop = v)),
      this.row(
        'Format',
        this.select(
          Object.keys(FORMATS).map((k): [string, string] => [k, k]),
          () => s.format,
          (v) => (s.format = v),
        ),
      ),
      this.check('Draw videos as soon as they are saved', 'Else press “Draw” under the video later', () => s.drawNow, (v) => (s.drawNow = v)),
    );
    video.append(more);

    // The gallery.
    const gallery = this.section('');
    gallery.append(this.galleryTitle, this.grid, this.picked);
    this.bar.style.display = 'none';
  }
}

/** Install the free camera: the ` key or its button opens it. */
export function installFreeCam(o: FreeCamOptions): FreeCam {
  return new FreeCamTool(o);
}
