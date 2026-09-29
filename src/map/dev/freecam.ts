import { MathUtils, Vector3, type Object3D, type PerspectiveCamera } from 'three';
import type GUI from 'three/addons/libs/lil-gui.module.min.js';
import type { HeightField } from '../heightfield';
import { MAP_BOUNDS } from '../layout';
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
 * - The frame: a shape (a desktop, a phone, an iPad…) with its guide on the
 *   screen and a thirds grid; the lens is the vertical field of view of what
 *   the guide holds, so a picture has exactly what the guide shows.
 * - The scene: hold the time of day, hold the moon's phase (full, half, a crescent…),
 *   hold a weather, freeze the scene's time, show or leave out the explorer.
 * - V saves a view into `wallpapers/views.json`, R records a flight into
 *   `wallpapers/paths/<name>.json`; "Render" draws either at full quality
 *   with scripts/wallpaper.mjs (headless, on the graphics card) into
 *   `wallpapers/out/`. `npm run wallpaper` draws them all.
 * - Video for a live wallpaper: a flight can be a loop (R flies back to the start
 *   by itself, or the panel makes one from the view: an orbit, a sway, a push in
 *   and out, a day turning to night), and the video is drawn so that it repeats
 *   with no jump, small (HEVC) or for everywhere (H.264).
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
}

/** What the map's frame loop asks of the free camera. */
export interface FreeCam {
  /** The camera is free now (the interface is away). */
  readonly active: boolean;
  /** The scene's time stands still. */
  readonly frozen: boolean;
  /** Once a step, before the camera is placed: moves the camera. */
  step(): void;
  /** Once a step, after the weather: puts the panel's weather over it. */
  weather(w: MapWeather): void;
}

/** Picture shapes: width × height in pixels (a `Custom` takes its own). */
const SHAPES: Record<string, [number, number]> = {
  '4K · 16:9 (3840×2160)': [3840, 2160],
  '1440p · 16:9 (2560×1440)': [2560, 1440],
  '5K · 16:9 (5120×2880)': [5120, 2880],
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

/** The weather choices: null is the game's own, a name a held weather (sky/weather.ts `HELD_WEATHER`). */
const WEATHERS: Record<string, string | null> = { 'Game weather': null, Clear: 'clear', Rain: 'rain', Storm: 'storm', Rainbow: 'rainbow', Snow: 'snow', 'From the saved view': 'view' };
const WEATHER_KEYS = ['wind', 'cloud', 'rain', 'storm', 'rainbow', 'wet', 'snow', 'snowCover'] as const;

/** Times of day (the `clock` of the map: 0 afternoon, 0.22 sunset, 0.5 night, 0.82 dawn: the promo's). */
const TIMES: [string, number][] = [
  ['Afternoon', 0],
  ['Sunset', 0.22],
  ['Night', 0.5],
  ['Dawn', 0.82],
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
/** The panel's moon choices besides the phases: the calendar's own moon, and an age set by the slider (between two phases). */
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

/** Loop videos the panel makes from the view: a camera path that comes round to where it began. */
const LOOPS = ['Orbit round what I look at', 'Sway, gently', 'Push in and out', 'Day and night'] as const;
type LoopKind = (typeof LOOPS)[number];

/** Video formats: HEVC is small (a wallpaper's file), H.264 plays everywhere. */
const FORMATS: Record<string, VideoCodec> = { 'HEVC · small, for a wallpaper': 'hevc', 'H.264 · plays everywhere': 'h264' };

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

const CSS = `
body.freecam #ui, body.freecam .map-ui, body.freecam .rt, body.freecam .fb-button, body.freecam .fc-open { display: none !important; }
body.freecam canvas#scene { cursor: grab; }
.fc-open { left: 124px !important; }
.fc-guide { position: fixed; z-index: 20; pointer-events: none; display: none; box-sizing: border-box; border: 1px solid rgba(255, 255, 255, 0.6); box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.5); }
.fc-guide.thirds {
  background:
    linear-gradient(to right, transparent calc(33.333% - 0.5px), rgba(255, 255, 255, 0.32) calc(33.333% - 0.5px), rgba(255, 255, 255, 0.32) calc(33.333% + 0.5px), transparent calc(33.333% + 0.5px), transparent calc(66.666% - 0.5px), rgba(255, 255, 255, 0.32) calc(66.666% - 0.5px), rgba(255, 255, 255, 0.32) calc(66.666% + 0.5px), transparent calc(66.666% + 0.5px)),
    linear-gradient(to bottom, transparent calc(33.333% - 0.5px), rgba(255, 255, 255, 0.32) calc(33.333% - 0.5px), rgba(255, 255, 255, 0.32) calc(33.333% + 0.5px), transparent calc(33.333% + 0.5px), transparent calc(66.666% - 0.5px), rgba(255, 255, 255, 0.32) calc(66.666% - 0.5px), rgba(255, 255, 255, 0.32) calc(66.666% + 0.5px), transparent calc(66.666% + 0.5px));
}
.fc-hud { position: fixed; left: 50%; bottom: 12px; transform: translateX(-50%); z-index: 21; pointer-events: none; display: none; white-space: pre-wrap; max-width: calc(100vw - 24px); text-align: center; padding: 6px 12px; border-radius: 8px; background: rgba(20, 24, 28, 0.62); color: #f3efe7; font: 12px/1.5 ui-monospace, Menlo, monospace; }
.fc-hud b { color: #ffd27a; font-weight: 600; }
.fc-hud i { color: #ff9a6b; font-style: normal; }
.fc-gui.lil-gui { --width: 330px; z-index: 30; }
.fc-status { padding: 8px 10px 10px; font: 12px/1.45 system-ui, sans-serif; color: #ddd; word-break: break-word; }
.fc-status.error { color: #ff9a8a; }
.fc-status img, .fc-status video { display: block; width: 100%; max-height: 180px; object-fit: contain; margin-top: 8px; border-radius: 4px; background: #000; }
.fc-status a { color: #ffd27a; }
`;

const rad = MathUtils.degToRad;
const deg = MathUtils.radToDeg;
const round = (v: number, n = 2): number => Math.round(v * 10 ** n) / 10 ** n;
/** A field where keys are typed (not a slider or a checkbox: those keep flying). */
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
  time: 'Game time' | 'Hold';
  clock: number;
  /** A time of day picked by name ("—": the clock is where the slider is). */
  preset: string;
  /** The moon: the calendar's (`GAME_MOON`), a phase by name, or `CUSTOM_MOON` (the age is where the slider is). */
  moon: string;
  moonAge: number;
  weather: string;
  freeze: boolean;
  explorer: boolean;
  name: string;
  /** Video: its format, whether to draw it as soon as it is saved, whether R closes a flight into a loop, and the loop the panel makes. */
  format: string;
  drawNow: boolean;
  closeLoop: boolean;
  loopKind: string;
  loopSeconds: number;
  loopReverse: boolean;
}

/** A saved thing in the list: a picture or a video. */
interface Saved {
  kind: 'view' | 'flight';
  name: string;
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
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${WALLPAPER_ENDPOINT}${path}`, init);
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  return (await res.json()) as T;
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
    time: 'Game time',
    clock: 0.22,
    preset: '—',
    moon: GAME_MOON,
    moonAge: 0.5,
    weather: 'Game weather',
    freeze: false,
    explorer: false,
    name: 'view-1',
    format: 'HEVC · small, for a wallpaper',
    drawNow: true,
    closeLoop: true,
    loopKind: LOOPS[0],
    loopSeconds: 40,
    loopReverse: false,
  };
  /** The weather the panel holds (null: the game's), and the one a saved view has. */
  private held: Partial<MapWeather> | null = null;
  private viewWeather: Partial<MapWeather> = {};
  private prevHold: number | null = null;
  private prevMoon: number | null = null;
  private explorerWas = true;
  private rec: Recording | null = null;
  private list: WallpaperList = { views: [], flights: [], out: {} };
  /** The picked saved thing (`view:<name>` or `flight:<name>`), and the things listed. */
  private pick = { label: '' };
  private saved: Saved[] = [];

  private gui: GUI | null = null;
  private building: Promise<void> | null = null;
  private savedFolder: GUI | null = null;
  /** The record button, whose words change while a flight is flown. */
  private recordButton: { name(text: string): unknown } | null = null;
  private chromeHidden = false;
  /** Shows the custom size's fields only for the Custom picture (set with the panel). */
  private syncShape: () => void = () => undefined;
  private readonly button = document.createElement('button');
  private readonly guide = document.createElement('div');
  private readonly hud = document.createElement('div');
  private readonly status = document.createElement('div');
  private box = { x: 0, y: 0, w: 0, h: 0 };

  /** The panel's buttons. */
  private readonly act: Record<string, () => void> = {
    exit: () => this.exit(),
    save: () => void this.saveView(),
    record: () => this.toggleRecord(),
    goTo: () => void this.goTo(),
    render: () => void this.renderSelected(),
    forget: () => void this.forget(),
    stop: () => void this.stopRender(),
    makeLoop: () => void this.makeLoop(),
  };

  constructor(private readonly o: FreeCamOptions) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.button.type = 'button';
    this.button.className = 'fb-button fc-open';
    this.button.textContent = '📷 Free camera';
    this.button.title = 'Fly a free camera and save wallpapers (`)';
    this.button.onclick = () => this.enter();
    this.guide.className = 'fc-guide';
    this.hud.className = 'fc-hud';
    this.status.className = 'fc-status';
    document.body.append(this.button, this.guide, this.hud);

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

  /** The camera's own vertical field of view: the guide is a part of the window's height, and the lens is its field of view. */
  private camFov(): number {
    const part = this.box.h > 0 ? innerHeight / this.box.h : 1;
    return MathUtils.clamp(deg(2 * Math.atan(Math.tan(rad(this.s.lens) / 2) * part)), 5, 140);
  }

  /** The guide: the largest frame of the picture's shape that fits the window. */
  private layout(): void {
    const [w, h] = this.size();
    const room = 14;
    const maxW = Math.max(50, innerWidth - 2 * room);
    const maxH = Math.max(50, innerHeight - 2 * room);
    let gw = maxW;
    let gh = (gw * h) / w;
    if (gh > maxH) {
      gh = maxH;
      gw = (gh * w) / h;
    }
    this.box = { x: (innerWidth - gw) / 2, y: (innerHeight - gh) / 2, w: gw, h: gh };
    Object.assign(this.guide.style, { left: `${this.box.x}px`, top: `${this.box.y}px`, width: `${gw}px`, height: `${gh}px`, display: this.open && !this.chromeHidden ? 'block' : 'none' });
    this.guide.classList.toggle('thirds', this.s.thirds);
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
    if (this.s.time === 'Game time') this.s.clock = round(this.o.clock(), 3);
    if (this.s.moon === GAME_MOON) this.s.moonAge = round(SKY.moonAge, 3);
    if (this.rec) {
      this.rec.rows.push([now, this.pos.x, this.pos.y, this.pos.z, aim.x, aim.y, aim.z, this.s.lens, this.o.clock()]);
      if (now - this.rec.start > FLIGHT_MAX * 1000) void this.stopRecord();
    }
    if (now - this.hudAt > 120) {
      this.hudAt = now;
      this.showHud(now);
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
    const lines = [
      `x <b>${p.x.toFixed(1)}</b>  y <b>${p.y.toFixed(1)}</b>  z <b>${p.z.toFixed(1)}</b>   <b>${Math.max(0, p.y - ground).toFixed(0)}</b> m over the ground   look <b>${bearing.toFixed(0)}°</b> ${pitch >= 0 ? '↑' : '↓'}<b>${Math.abs(pitch).toFixed(0)}°</b>   lens <b>${this.s.lens.toFixed(0)}°</b>   speed <b>${this.s.speed.toFixed(0)}</b> m/s${this.s.freeze ? '   <b>❄ time stands still</b>' : ''}`,
      'W A S D fly · Q E down / up · Shift fast · drag look · wheel speed · pinch lens',
      'V save view · R record a flight · F freeze time · H hide the panel · Esc leave',
    ];
    if (out) lines.push('<i>⚠ past the detailed land: the far edges are built with big blocks</i>');
    if (this.rec) lines.unshift(`<i>● recording "${this.rec.name}" ${((now - this.rec.start) / 1000).toFixed(1)} s</i>`);
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
    this.last = performance.now();
    this.prevHold = this.o.clockHeld();
    this.s.time = this.prevHold === null ? 'Game time' : 'Hold';
    this.s.clock = round(this.prevHold ?? this.o.clock(), 3);
    this.prevMoon = this.o.moonHeld();
    this.moonFields(this.prevMoon);
    this.s.freeze = false;
    this.explorerWas = this.o.explorer()?.visible ?? true;
    this.layout();
    // (the lens starts as the view is, so nothing jumps)
    this.s.lens = MathUtils.clamp(round(deg(2 * Math.atan(Math.tan(rad(c.fov) / 2) * (this.box.h / innerHeight))), 1), 12, 100);
    document.body.classList.add('freecam');
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.applyExplorer();
    this.hud.style.display = 'block';
    this.showPanel();
  }

  private exit(): void {
    if (!this.open) return;
    if (this.rec) void this.stopRecord();
    this.open = false;
    this.keys.clear();
    this.drag = null;
    document.body.classList.remove('freecam');
    this.o.setCamera(null);
    this.o.restore();
    this.o.setClock(this.prevHold);
    this.o.setMoon(this.prevMoon);
    this.held = null;
    this.s.weather = 'Game weather';
    const ex = this.o.explorer();
    if (ex && ex.visible !== this.explorerWas) {
      ex.visible = this.explorerWas;
      this.o.redrawShadows();
    }
    this.guide.style.display = 'none';
    this.hud.style.display = 'none';
    this.gui?.hide();
    this.o.canvas.style.cursor = '';
  }

  /** H: the panel, the guide and the notes away, for a clean look. */
  private hideChrome(hide: boolean): void {
    this.chromeHidden = hide;
    this.hud.style.display = hide ? 'none' : 'block';
    this.gui?.show(!hide);
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
    return t instanceof Node && !!this.gui?.domElement.contains(t);
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
        void this.saveView();
        break;
      case 'KeyR':
        this.toggleRecord();
        break;
      case 'KeyF':
        this.s.freeze = !this.s.freeze;
        break;
      case 'KeyH':
        this.hideChrome(!this.chromeHidden);
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
    else this.s.speed = MathUtils.clamp(this.s.speed * Math.exp(-e.deltaY * 0.0015), 2, 400);
  }

  // ── Time and weather ─────────────────────────────────────────────────────

  weather(w: MapWeather): void {
    if (!this.open || !this.held) return;
    // (the wind's direction stays the game's: a held weather only sets how much)
    const dir = w.windDir;
    Object.assign(w, CALM_WEATHER, this.held);
    w.windDir = dir;
  }

  private pickWeather(): void {
    const key = WEATHERS[this.s.weather];
    if (key === null || key === undefined) this.held = null;
    else if (key === 'view') this.held = this.viewWeather;
    else this.held = HELD_WEATHER[key] ?? {};
  }

  private holdClock(clock: number): void {
    this.s.time = 'Hold';
    this.s.clock = clock;
    if (!TIMES.some(([label, at]) => label === this.s.preset && at === clock)) this.s.preset = '—';
    this.o.setClock(clock);
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
  }

  // ── Saving and drawing ───────────────────────────────────────────────────

  /** The camera as saved: `cam=` values, the lens as the field of view (the picture is cut to the guide's shape). */
  private frameCam(): number[] {
    const fwd = this.forward(this._f);
    const aim = this._t.copy(this.pos).addScaledVector(fwd, AIM);
    return [this.pos.x, this.pos.y, this.pos.z, aim.x, aim.y, aim.z, this.s.lens].map((v) => round(v, 2));
  }

  private nextName(base: 'view' | 'flight' | 'loop'): string {
    const taken = new Set([...this.list.views.map((v) => v.name), ...this.list.flights.map((f) => f.name)]);
    for (let n = 1; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  }

  private say(text: string, error = false): void {
    this.status.className = `fc-status${error ? ' error' : ''}`;
    this.status.textContent = text;
  }

  private async saveView(): Promise<void> {
    if (!this.open) return;
    const [w, h] = this.size();
    const name = safeName(this.s.name) || this.nextName('view');
    const withExplorer = this.s.explorer;
    const view: WallpaperView = {
      name,
      cam: this.frameCam(),
      w,
      h,
      shape: this.s.shape,
      query: this.o.moment(withExplorer && this.o.roaming()).toString(),
      noExplorer: !withExplorer,
      saved: '',
    };
    try {
      this.list = await call<WallpaperList>('/view', { method: 'POST', body: JSON.stringify(view) });
      this.s.name = this.nextName('view');
      this.buildSaved(`view:${name}`);
      this.say(`Saved the view "${name}" (${w}×${h}). Pick it under Saved and press Render, or run: npm run wallpaper`);
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
    const named = safeName(this.s.name);
    this.rec = { name: !named || /^view-\d+$/.test(named) ? this.nextName('flight') : named, start: performance.now(), rows: [], w, h, t0, frozen: this.s.freeze, query: q.toString(), noExplorer: !withExplorer };
    this.recordButton?.name('■ Stop recording (R)');
    this.say(`Recording. Fly, then press R to stop.${this.s.drawNow ? ' The video is drawn as soon as you stop.' : ' It is drawn later, frame by frame.'}`);
  }

  private async stopRecord(): Promise<void> {
    const rec = this.rec;
    this.rec = null;
    this.recordButton?.name('● Record a flight (R)');
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
    const flight: WallpaperFlight = { name: rec.name, w: rec.w, h: rec.h, fps: FLIGHT_FPS, frozen: rec.frozen, t0: rec.t0, query: rec.query, noExplorer: rec.noExplorer, samples: all, loop, saved: '' };
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

  /** Make a loop video from the view the camera has now (the panel's kind and seconds), and draw it. */
  private async makeLoop(): Promise<void> {
    if (!this.open) return;
    const kind = this.s.loopKind as LoopKind;
    const seconds = MathUtils.clamp(Math.round(this.s.loopSeconds), 4, 180);
    const { rows, raised } = this.loopSamples(kind, seconds, this.s.loopReverse);
    const [w, h] = this.size();
    const withExplorer = this.s.explorer;
    const q = this.o.moment(withExplorer && this.o.roaming());
    const t0 = Number(q.get('t')) || 0;
    for (const k of ['t', 'clock']) q.delete(k);
    const named = safeName(this.s.name);
    const name = !named || /^(view|flight|loop)-\d+$/.test(named) ? this.nextName('loop') : named;
    const flight: WallpaperFlight = { name, w, h, fps: FLIGHT_FPS, frozen: this.s.freeze, t0, query: q.toString(), noExplorer: !withExplorer, samples: rows, loop: true, kind, saved: '' };
    await this.saveFlight(flight, `${kind.toLowerCase()}${raised ? `; lifted over the land in ${raised} frames` : ''}`);
  }

  /** How long a video takes to draw, in words (a rough guess: the frames, a JPEG each, and the encoder). */
  private estimate(flight: WallpaperFlight): string {
    const frames = flight.samples.length + (flight.loop && !flight.frozen ? Math.round(flight.fps * 1.2) : 0);
    const seconds = 15 + frames * (0.032 + (0.0104 * flight.w * flight.h) / 1e6) * 1.4;
    return seconds < 90 ? 'a minute' : `${Math.round(seconds / 60)} minutes`;
  }

  /** Save a flight (flown, or a loop the panel made), and draw its video at once if the panel says so. */
  private async saveFlight(flight: WallpaperFlight, note: string): Promise<void> {
    try {
      this.list = await call<WallpaperList>('/flight', { method: 'POST', body: JSON.stringify(flight) });
      this.buildSaved(`flight:${flight.name}`);
      const what = `${flight.loop ? 'the loop' : 'the flight'} "${flight.name}" (${(flight.samples.length / FLIGHT_FPS).toFixed(1)} s, ${flight.w}×${flight.h}${note ? `; ${note}` : ''})`;
      if (this.s.drawNow) await this.startRender({ kind: 'flight', name: flight.name }, `about ${this.estimate(flight)}`, `Saved ${what}. `);
      else this.say(`Saved ${what}. Pick it under Saved and press Render, or run: npm run wallpaper -- flights`);
    } catch (err) {
      this.say(`Not saved: ${message(err)}`, true);
    }
  }

  private selected(): Saved | null {
    return this.saved.find((s) => `${s.kind}:${s.name}` === this.pick.label) ?? null;
  }

  /** The shape that has these pixels, else Custom with them. */
  private shapeOf(w: number, h: number): string {
    const name = Object.keys(SHAPES).find((k) => SHAPES[k][0] === w && SHAPES[k][1] === h);
    if (name) return name;
    this.s.customW = w;
    this.s.customH = h;
    return 'Custom';
  }

  /** Fly back to a saved view (or a flight's start), with its time of day, its weather, its shape and its explorer. */
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
      } else {
        const res = await fetch(`${WALLPAPER_ENDPOINT}/file/paths/${item.name}.json`);
        const f = (await res.json()) as WallpaperFlight;
        [cam, query, explorer, size] = [f.samples[0].slice(0, 7), f.query, !f.noExplorer, [f.w, f.h]];
        // (a flight's clock is in its frames, not in its query)
        query = `${f.query}&clock=${f.samples[0][7]}`;
      }
      const d = new Vector3(cam[3] - cam[0], cam[4] - cam[1], cam[5] - cam[2]).normalize();
      this.pos.set(cam[0], cam[1], cam[2]);
      this.yaw = this.yawNow = Math.atan2(-d.x, -d.z);
      this.pitch = this.pitchNow = Math.asin(MathUtils.clamp(d.y, -1, 1));
      this.vel.set(0, 0, 0);
      this.s.lens = cam[6];
      this.s.shape = this.shapeOf(size[0], size[1]);
      this.s.explorer = explorer;
      this.applyExplorer();
      const q = new URLSearchParams(query);
      if (q.has('clock')) this.holdClock(Number(q.get('clock')));
      // (the moon the picture will show, not today's: the one it holds, else the phase its date gave it)
      this.holdMoon(savedMoon(q));
      this.viewWeather = {};
      for (const k of WEATHER_KEYS) if (q.has(k)) this.viewWeather[k] = Number(q.get(k));
      this.s.weather = 'From the saved view';
      this.pickWeather();
      this.layout();
      this.s.name = item.name;
      this.refreshPanel();
      this.say(`At "${item.name}". Change it, then save it under the same name to replace it.`);
    } catch (err) {
      this.say(`Could not go there: ${message(err)}`, true);
    }
  }

  private async renderSelected(): Promise<void> {
    if (!this.open) return;
    const item = this.selected();
    if (!item) return this.say('Nothing saved yet: press V first.', true);
    await this.startRender(item);
  }

  /** Draw a saved view or flight (a video in the panel's format); `lead` and `hint` go in the words while it draws. */
  private async startRender(item: Saved, hint = '', lead = ''): Promise<void> {
    try {
      const codec = FORMATS[this.s.format] ?? 'hevc';
      const job = await call<WallpaperJob>('/render', { method: 'POST', body: JSON.stringify({ names: [item.name], codec }) });
      void this.watch(job.id, item, hint, lead);
    } catch (err) {
      this.say(`${lead}Not started: ${message(err)}`, true);
    }
  }

  /** Follow a render job until it is done, and show what it drew. */
  private async watch(id: string, item: Saved, hint = '', lead = ''): Promise<void> {
    const started = performance.now();
    for (;;) {
      let job: WallpaperJob;
      try {
        job = await call<WallpaperJob>(`/job?id=${id}`);
      } catch (err) {
        return this.say(`Lost the render: ${message(err)}`, true);
      }
      const secs = ((performance.now() - started) / 1000).toFixed(0);
      if (job.status === 'running') {
        this.say(`${lead}Drawing "${item.name}" at full quality… ${job.now && job.now.total > 1 ? `frame ${job.now.done} of ${job.now.total}, ` : ''}${secs} s${hint ? ` (${hint})` : ''}`);
        await new Promise((r) => setTimeout(r, 700));
        continue;
      }
      if (job.status === 'failed') return this.say(`Render failed: ${job.error ?? job.log.slice(-2).join(' · ')}`, true);
      const file = job.files.find((f) => f.name === item.name)?.file;
      this.say(`Drawn in ${secs} s → wallpapers/${file ?? ''}`);
      if (file) {
        const url = `${WALLPAPER_ENDPOINT}/file/${file}?at=${Date.now()}`;
        const media = document.createElement(item.kind === 'flight' ? 'video' : 'img');
        media.src = url;
        if (media instanceof HTMLVideoElement) Object.assign(media, { controls: true, loop: true, muted: true, autoplay: true });
        const link = Object.assign(document.createElement('a'), { href: url, target: '_blank', textContent: ' open' });
        this.status.append(link, media);
      }
      this.list = await call<WallpaperList>('/list').catch(() => this.list);
      this.buildSaved(this.pick.label);
      return;
    }
  }

  /** Stop the render that is running (a flight can take an hour at 4K). */
  private async stopRender(): Promise<void> {
    try {
      await call<unknown>('/cancel', { method: 'POST' });
      this.say('Stopping the render.');
    } catch (err) {
      this.say(`Could not stop it: ${message(err)}`, true);
    }
  }

  private async forget(): Promise<void> {
    const item = this.selected();
    if (!item) return;
    try {
      this.list = await call<WallpaperList>(`/${item.kind}?name=${encodeURIComponent(item.name)}`, { method: 'DELETE' });
      this.buildSaved();
      this.say(`Forgot "${item.name}" (a picture already drawn stays in wallpapers/out/).`);
    } catch (err) {
      this.say(`Not deleted: ${message(err)}`, true);
    }
  }

  // ── The panel ────────────────────────────────────────────────────────────

  /** Show what the values are now (after a change made in code). */
  private refreshPanel(): void {
    this.syncShape();
    this.gui?.controllersRecursive().forEach((c) => c.updateDisplay());
  }

  private showPanel(): void {
    this.building ??= this.buildPanel();
    void this.building.then(() => {
      // (the camera may have been left while the panel was still being made)
      this.gui?.show(this.open && !this.chromeHidden);
      this.refreshPanel();
    });
    call<WallpaperList>('/list').then(
      (list) => {
        this.list = list;
        this.s.name = this.nextName('view');
        void this.building?.then(() => {
          this.buildSaved();
          this.refreshPanel();
        });
      },
      (err) => this.say(`Wallpapers: ${message(err)}`, true),
    );
  }

  private async buildPanel(): Promise<void> {
    const { default: G } = await import('three/addons/libs/lil-gui.module.min.js');
    const gui = new G({ title: '📷 Free camera' });
    gui.domElement.classList.add('fc-gui');
    this.gui = gui;
    // (a dropdown or a button that was used keeps the focus: the keys would go to it, and a dropdown would pick by typing, not fly)
    gui.onChange(() => {
      const a = document.activeElement;
      if (a instanceof HTMLSelectElement || a instanceof HTMLButtonElement) a.blur();
    });
    const s = this.s;
    const act = this.act;
    gui.add(act, 'exit').name('Leave the free camera (Esc)');

    const cam = gui.addFolder('Camera');
    cam.add(s, 'speed', 2, 400, 1).name('Speed (wheel)').listen();
    cam.add(s, 'lens', 12, 100, 0.5).name('Lens: view angle (pinch)').listen();
    const shape = cam.add(s, 'shape', Object.keys(SHAPES)).name('Picture');
    const customW = cam.add(s, 'customW', 64, 16384, 1).name('Custom width').onChange(() => this.layout());
    const customH = cam.add(s, 'customH', 64, 16384, 1).name('Custom height').onChange(() => this.layout());
    // (the custom size is only for the Custom picture)
    this.syncShape = () => {
      customW.show(s.shape === 'Custom');
      customH.show(s.shape === 'Custom');
    };
    shape.onChange(() => {
      this.syncShape();
      this.layout();
    });
    this.syncShape();
    cam.add(s, 'thirds').name('Thirds grid').onChange(() => this.layout());

    const scene = gui.addFolder('Scene');
    scene
      .add(s, 'time', ['Game time', 'Hold'])
      .name('Time of day')
      .onChange(() => (s.time === 'Hold' ? this.holdClock(s.clock) : this.o.setClock(null)))
      .listen();
    scene.add(s, 'clock', 0, 1, 0.005).name('Clock (0 day · 0.5 night)').onChange(() => this.holdClock(s.clock)).listen();
    scene
      .add(s, 'preset', ['—', ...TIMES.map(([label]) => label)])
      .name('Time preset')
      .onChange(() => {
        const time = TIMES.find(([label]) => label === s.preset);
        if (time) this.holdClock(time[1]);
      })
      .listen();
    scene
      .add(s, 'moon', [GAME_MOON, ...MOONS.map(([label]) => label), CUSTOM_MOON])
      .name('Moon phase')
      .onChange(() => {
        const phase = MOONS.find(([label]) => label === s.moon);
        if (s.moon === GAME_MOON) this.holdMoon(null);
        else this.holdMoon(phase ? phase[1] : s.moonAge);
      })
      .listen();
    scene.add(s, 'moonAge', 0, 1, 0.005).name('Moon age (0 new · 0.5 full)').onChange(() => this.holdMoon(s.moonAge)).listen();
    scene.add(s, 'weather', Object.keys(WEATHERS)).name('Weather').onChange(() => this.pickWeather());
    scene.add(s, 'freeze').name('Freeze time (F)').listen();
    scene.add(s, 'explorer').name('Show the explorer').onChange(() => this.applyExplorer());

    const save = gui.addFolder('Save');
    save.add(s, 'name').name('Name').listen();
    save.add(act, 'save').name('Save this view (V)');
    this.recordButton = save.add(act, 'record').name('● Record a flight (R)');

    const video = gui.addFolder('Video (for a live wallpaper)');
    video.add(s, 'format', Object.keys(FORMATS)).name('Format');
    video.add(s, 'drawNow').name('Draw it when it is saved');
    video.add(s, 'closeLoop').name('R: fly back to the start (a loop)');
    video.add(s, 'loopKind', [...LOOPS]).name('Loop from this view');
    video.add(s, 'loopSeconds', 4, 180, 1).name('Loop seconds');
    video.add(s, 'loopReverse').name('Turn the other way');
    video.add(act, 'makeLoop').name('Make the loop video');

    gui.domElement.append(this.status);
    this.say('Fly to a place you like. V saves the view.');
    this.buildSaved();
  }

  /** The "Saved" folder: pictures and flights to go to, draw or forget. It is the last folder, so it is made again each time. */
  private buildSaved(select?: string): void {
    const gui = this.gui;
    if (!gui) return;
    this.savedFolder?.destroy();
    const folder = gui.addFolder(`Saved (${this.list.views.length + this.list.flights.length})`);
    this.savedFolder = folder;
    this.saved = [...this.list.views.map((v): Saved => ({ kind: 'view', name: v.name })), ...this.list.flights.map((f): Saved => ({ kind: 'flight', name: f.name }))];
    const labels: Record<string, string> = {};
    for (const it of this.saved) labels[`${it.kind === 'view' ? '🖼' : '🎞'} ${it.name}${this.list.out[it.name] ? ' ✓' : ''}`] = `${it.kind}:${it.name}`;
    const values = Object.values(labels);
    if (!values.length) {
      folder.add({ note: 'nothing saved yet' }, 'note').name('Saved').disable();
      return;
    }
    if (select && values.includes(select)) this.pick.label = select;
    else if (!values.includes(this.pick.label)) this.pick.label = values[0];
    folder.add(this.pick, 'label', labels).name('Pick');
    folder.add(this.act, 'goTo').name('Go there');
    folder.add(this.act, 'render').name('Render at full quality');
    folder.add(this.act, 'stop').name('Stop the render');
    folder.add(this.act, 'forget').name('Forget it');
  }
}

/** Install the free camera: the ` key or its button opens it. */
export function installFreeCam(o: FreeCamOptions): FreeCam {
  return new FreeCamTool(o);
}
