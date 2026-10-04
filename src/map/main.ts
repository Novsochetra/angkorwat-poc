import { DirectionalLight, Group, HemisphereLight, NeutralToneMapping, PCFShadowMap, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three';
import { posthogLogger } from '../posthog';
import { FeedbackTool } from '../feedback/FeedbackTool';
import { skipBackFacets } from '../voxel/backFacets';
import { installLookPanel } from '../voxel/LookPanel';
import type { Atmosphere } from './atmosphere';
import type { MapAudio } from './audio/audio';
import { MapCameraRig } from './camera';
import { cutCovered, ShadowGate } from './cull';
import { festivalNow, festivalSoon } from './festival/_schedule';
import { AutoGraphics, autoLevel, frameCap, GRAPHICS, graphicsNow, lowerAutoLevel, markStill, PHONE, phoneRate, plainFar, resetAutoLevel, setBatterySaver, setGraphics, STILL_LAYER, stillCasters } from './graphics';
import { compileFor, LateParts, type CompileTimes } from './lazy';
import { PLACES } from './layout';
import { isResolutionShare, screenRatio, stepOf, view } from './resolution';
import type { Foreground } from './foreground';
import type { MapPost } from './post';
import { roamPrefs } from './roam/prefs';
import type { MapRoam } from './roam/roam';
import { sacredReady } from './sacred/pending';
import type { Story } from './story/story';
import { fogAmountOf, fogNow, setFog } from './sky/fogLevel';
import { createWeather, weatherAtLoad } from './sky/weather';
import { CALM_WEATHER, DEFAULT_SETTINGS, FOG_CHOICES, GRAPHICS_CHOICES, MINIMAP_CHOICES, MOON_PATHS, type MoonPath, type FogChoice, type GraphicsChoice, type GraphicsLevel, type Lang, type MapContext, type MapFrame, type MapPart, type MapQuality, type MapSettings, type MiniMapChoice, type PlaceId } from './types';
import { loadingHero } from './ui/_loadHero';
import { LOAD_TEMPLE } from './ui/_loadTemple';
import { onLang, setLang, t } from './ui/lang';
import { steppedShape } from './ui/shape';
import { TIME } from './time';
import type { AnchorOnScreen, MapUI } from './ui/ui';
import { BuildWork } from './work/build';
// (game pads: read from the start, so the loading screen's Start works with ✕)
import { pad, padPrefs } from './pad/pad';

/**
 * World map screen — "Angkor Heritage: choose your next expedition".
 *
 * URL: `shot=1` headless still · `t=` seconds into the scene (shots) ·
 * `night=0‥1` time of day · `moon=0‥1` hold the moon's age (0 new, 0.5 full) ·
 * `moonpath=high|low` the moon's path (across the sky, or low over the hills) ·
 * `focus=<place>` camera on a place ·
 * `ui=0` no interface · `graphics=auto|low|medium|high|max` the graphics
 * level (graphics.ts; auto is medium in shots) · `phone=1` act as a phone ·
 * `quality=low|medium|high` only the built detail ·
 * `parts=terrain,water,…` build only these parts (checking one part) ·
 * `cam=x,y,z,tx,ty,tz[,fov]` a fixed camera (m; its vertical field of view in
 * degrees) instead of the overview · `explorer=0` leave the explorer out ·
 * `lang=km|en` the interface's language (else the saved one; Khmer first) ·
 * `story=<n>` the story from beat n (1‥; shots: that beat), `story=0` never
 * (else it plays before the map on the first visit) ·
 * `loading=0‥1` hold the loading screen at that point, and build nothing
 * (1: built, with its button) · `video=1` a shot that then moves frame by
 * frame (`__videoFrame`, scripts/video.mjs) · `resolution=auto|<share>` the
 * Resolution setting (resolution.ts: 0.5 draws half across) ·
 * `battery=1` the battery saver (30 frames a second) · `fps=30|60` that cap, held (a phone's
 * 60-or-30 watch off: graphics.ts `PhoneFrameRate`) ·
 * `fog=auto|full|light|simple` the fog's step (sky/fogLevel.ts; auto, the graphics level's, else) ·
 * `fogamount=0‥1.5` the fog's thickness (1 the game's own, 0 clear air) · `idle=0` no idle
 * slow-down (the frame loop, below).
 *
 * Every part is its own module, loaded on its own: a part that fails to
 * load or build is logged and left out, and the rest of the map still runs.
 */
const params = new URLSearchParams(location.search);
// (the build workers start at once: the land is built in one while the page sets up, work/build.ts)
const work = new BuildWork(params);
const shot = params.get('shot') === '1';
const placeIds = PLACES.map((p) => p.id);
const asPlace = (v: string | null) => (placeIds.includes(v as PlaceId) ? (v as PlaceId) : null);

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: shot });
renderer.setPixelRatio(Math.min(devicePixelRatio, shot ? 1 : 2));
renderer.setSize(innerWidth, innerHeight);
// (what is drawn: the scene at the canvas's ratio, until the resolution below sets it)
view.scene = view.canvas = renderer.getPixelRatio();
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFShadowMap;
// (the low and medium levels' still shadows: only what is marked still casts, graphics.ts)
stillCasters(renderer);

const scene = new Scene();
const camera = new PerspectiveCamera(40, innerWidth / innerHeight, 0.5, 9000);

// ── Settings (gear button), kept between visits ─────────────────────────────
const SETTINGS_KEY = 'angkor-map-settings';
/** Which defaults the kept settings have seen (a new version gives them the new defaults once). */
const DEFAULTS_KEY = 'angkor-map-defaults';
const DEFAULTS_VERSION = '2';
function loadSettings(): MapSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<MapSettings> & { sfx?: number; sharp?: boolean; fog?: unknown };
    // (older visits kept one "effects" volume: it becomes the interface and the explorer's moves; the steps start quieter)
    if (typeof saved.sfx === 'number') {
      saved.ui ??= saved.sfx;
      saved.moves ??= saved.sfx;
      saved.steps ??= Math.min(DEFAULT_SETTINGS.steps, saved.sfx);
      delete saved.sfx;
    }
    // (the "Always sharp" switch of before is the high graphics level)
    if (saved.sharp !== undefined) {
      saved.graphics ??= saved.sharp ? 'high' : 'auto';
      delete saved.sharp;
    }
    if (!GRAPHICS_CHOICES.includes(saved.graphics as GraphicsChoice)) delete saved.graphics;
    // (the mini-map was a switch: on, shown; off, the button only)
    const mini: unknown = saved.miniMap;
    if (typeof mini === 'boolean') saved.miniMap = mini ? 'show' : 'button';
    else if (!MINIMAP_CHOICES.includes(mini as MiniMapChoice)) delete saved.miniMap;
    if (typeof saved.keyHelp !== 'boolean') delete saved.keyHelp;
    if (typeof saved.padRumble !== 'boolean') delete saved.padRumble;
    if (saved.resolution !== 'auto' && !isResolutionShare(saved.resolution)) delete saved.resolution;
    if (typeof saved.battery !== 'boolean') delete saved.battery;
    if (!MOON_PATHS.includes(saved.moonPath as MoonPath)) delete saved.moonPath;
    // (the fog's step was a setting: it follows the graphics level now, and the fog is one slider, its thickness)
    delete saved.fog;
    if (saved.fogAmount !== undefined) saved.fogAmount = fogAmountOf(saved.fogAmount);
    // (settings kept before the new defaults — cycling time, clear weather, the interface at full, easy flying — take them once)
    if (localStorage.getItem(DEFAULTS_KEY) !== DEFAULTS_VERSION) {
      delete saved.time;
      delete saved.weather;
      delete saved.ui;
      delete saved.easyFly;
      localStorage.setItem(DEFAULTS_KEY, DEFAULTS_VERSION);
    }
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
// (shots hold the day unless they ask for another time, so they look the same whenever they are taken)
let settings: MapSettings = shot ? { ...DEFAULT_SETTINGS, time: 'day' } : loadSettings();
if (params.has('easyfly')) settings.easyFly = params.get('easyfly') !== '0';
roamPrefs.easyFly = settings.easyFly;
// (`minimap=show|button|hide`; 1 and 0 as before: shown, the button only)
const urlMini = ({ '1': 'show', '0': 'button' } as Record<string, MiniMapChoice>)[params.get('minimap') ?? ''] ?? params.get('minimap');
if (MINIMAP_CHOICES.includes(urlMini as MiniMapChoice)) settings.miniMap = urlMini as MiniMapChoice;
roamPrefs.miniMap = settings.miniMap;
if (params.has('keyhelp')) settings.keyHelp = params.get('keyhelp') !== '0';
roamPrefs.keyHelp = settings.keyHelp;
// (the game pad's shakes: the Controller group on the Play tab)
padPrefs.rumble = settings.padRumble;
if (GRAPHICS_CHOICES.includes(params.get('graphics') as GraphicsChoice)) settings.graphics = params.get('graphics') as GraphicsChoice;
if (params.get('resolution') === 'auto') settings.resolution = 'auto';
else if (isResolutionShare(Number(params.get('resolution')))) settings.resolution = Number(params.get('resolution'));
if (params.has('battery')) settings.battery = params.get('battery') !== '0';
setBatterySaver(settings.battery);
/** `fog=` (checks): hold the fog's step (sky/fogLevel.ts); else auto, the graphics level's. */
const fogChoice: FogChoice = FOG_CHOICES.includes(params.get('fog') as FogChoice) ? (params.get('fog') as FogChoice) : 'auto';
/** The level for a choice: itself, or auto's (graphics.ts; medium in shots, so they look the same on every machine). */
const levelOf = (g: GraphicsChoice): GraphicsLevel => (g !== 'auto' ? g : shot ? 'medium' : autoLevel());
setGraphics(levelOf(settings.graphics), scene);
// (after the level: auto's fog is the level's step)
setFog(fogChoice, graphicsNow.level);
/** `fogamount=` (shots), or the free camera's: the fog's thickness held over the setting's (sky/fogLevel.ts), null: the setting's. */
let fogAmountParam: number | null = params.has('fogamount') ? fogAmountOf(Number(params.get('fogamount'))) : null;
const applyFogAmount = () => {
  fogNow.amount = fogAmountParam ?? settings.fogAmount;
};
applyFogAmount();
/** Auto's watch over the frames (graphics.ts): it steps the level down on a device that stays slow. */
const autoWatch = new AutoGraphics();
/** The frame loop has begun (the resolution below follows the level from then on). */
let drawing = false;
/** Built detail: the graphics level's (a new level is built the next time the map opens), or `quality=` to check one. */
const quality = (['low', 'medium', 'high'].includes(params.get('quality') ?? '') ? params.get('quality') : GRAPHICS[graphicsNow.level].build) as MapQuality;
if (['km', 'en'].includes(params.get('lang') ?? '')) settings.lang = params.get('lang') as Lang;
// The page's own words (tab title, loading screen) in that language (ui/lang.ts).
function pageWords(): void {
  document.title = t('title');
  for (const [sel, key] of [['#loading h1', 'title'], ['#loading p', 'loading'], ['#loading .ld-go span', 'loadGo']] as const) {
    const e = document.querySelector(sel);
    if (e) e.textContent = t(key);
  }
}
setLang(settings.lang);
pageWords();
onLang(pageWords);

// (the time of day's calendar, here before the build: the festival part is built as the page opens when one is on)
/** Days since a new moon (6 Jan 2000) when the page opened, for the moon's phase (`day=` in shots, else 15 there: a full moon, as in the concept art). */
const DAY0 = shot ? Number(params.get('day') ?? 15) || 0 : Math.floor((Date.now() - Date.UTC(2000, 0, 6, 18, 14)) / 86_400_000);
/** The time of the year when the page opened (0 = Khmer New Year, mid-April), and how far it moves per day of `clock`. */
const SEASON0 = params.has('season') ? Number(params.get('season')) || 0 : shot ? 0.45 : (((Date.now() - Date.UTC(new Date().getUTCFullYear(), 3, 14)) / 86_400_000 / 365) % 1 + 1) % 1;
const SEASON_PER_DAY = params.has('season') || shot ? 0 : 1 / 24;

// ── Build ───────────────────────────────────────────────────────────────────
const timings: Record<string, number> = {};
function timed<T>(name: string, fn: () => T): T {
  const t0 = performance.now();
  const r = fn();
  timings[name] = Math.round(performance.now() - t0);
  return r;
}

const failed: string[] = [];
/** Load an optional piece (post, sound, interface) with a plain stand-in if it fails. */
async function safe<T>(name: string, make: () => Promise<T>, fallback: () => T): Promise<T> {
  try {
    return await make();
  } catch (e) {
    failed.push(name);
    console.error(`[map] ${name} failed:`, e);
    return fallback();
  }
}

/** `parts=terrain,water,…`: build only these parts (checking one part). */
const only = params.get('parts')?.split(',');
// The heavy pure-data work runs in the build workers (work/build.ts): the land (being built since the page opened),
// then the land's blocks in all of them while the atmosphere is built here, the jungle's prototypes; the jungle is
// planted there in its place below. The page makes the three.js objects, in the same order as before.
work.plan({ quality, terrain: !only || only.includes('terrain'), vegetation: !only || only.includes('vegetation') });
// (the atmosphere's module loads while the land is built)
const atmosphereModule = import('./atmosphere');
atmosphereModule.catch(() => undefined);
// (the roaming add-ons' modules too, chunks of their own: they download while the map is built, and roaming waits for them,
// so their meshes are in the scene when the shaders are compiled below, not compiled in the middle of play: roam/_addonList.ts)
if (!only || only.includes('foreground')) void import('./roam/_addonList').then((m) => m.loadAddons()).catch(() => undefined);
const landT0 = performance.now();
const field = await work.field();
timings.land = Math.round(performance.now() - landT0);
const ctx: MapContext = { scene, renderer, camera, field, quality, shot, video: shot && params.get('video') === '1' };
const atmosphere: Atmosphere = await safe('atmosphere', async () => {
  const { buildAtmosphere } = await atmosphereModule;
  return timed('atmosphere', () => buildAtmosphere(ctx));
}, () => {
  const key = new DirectionalLight(0xffffff, 2);
  key.position.set(300, 400, 200);
  const object = new Group().add(new HemisphereLight(0xffffff, 0x444444, 1), key);
  return { name: 'atmosphere', object, key, update: (f: MapFrame) => void f.lightDir.copy(key.position).normalize() };
});
const parts: MapPart[] = [atmosphere];

type Builder = (ctx: MapContext) => MapPart | Promise<MapPart>;
/** The parts `cutCovered` leaves covered sides out of (below, after the build: cull.ts). */
const coverRoots = () => parts.filter((p) => ['terrain', 'path', 'jungle', 'camps', 'village', 'hamlet'].includes(p.name) || p.name.startsWith('landmark:')).map((p) => p.object);
/** Parts in build order (landmarks and the road first: they mark the ground trees must keep off). */
const BUILDERS: [string, () => Promise<Builder>][] = [
  // (its blocks laid and packed in the build workers: here only made into meshes; else laid here)
  ['terrain', async () => {
    const { buildTerrain } = await import('./terrain');
    return async (c) => buildTerrain(c, await work.terrain(c.field, c.quality));
  }],
  ...PLACES.map((p): [string, () => Promise<Builder>] => [p.id, async () => {
    const { LANDMARKS } = await import('./landmarks');
    return (c) => LANDMARKS[p.id](c, p);
  }]),
  ['path', async () => (await import('./path')).buildPath],
  ['jungle', async () => (await import('./jungle/ruins')).buildJungleRuins],
  ['camps', async () => (await import('./jungle/camps')).buildCamps],
  ['water', async () => (await import('./water')).buildWater],
  // (after the water: its stilts and rafts are not rocks in the lake, no foam round them)
  ['village', async () => (await import('./village')).buildVillage],
  ['paddies', async () => (await import('./paddies')).buildPaddies],
  // (the east village, its market, the palm sugar grove, the Kulen picnic place, the hamlet behind Angkor Wat: before the trees, which keep off them)
  ['hamlet', async () => (await import('./hamlet')).buildHamlets],
  // (planted in a build worker on the land as it is here now, the reserved spots too; else here. While the page waits,
  // another works out the covered sides of the parts built so far, for `cutCovered` after the build)
  ['vegetation', async () => {
    const { buildVegetation } = await import('./vegetation');
    return async (c) => {
      const planted = work.vegetation(c.field, c.quality);
      work.covers(coverRoots());
      return buildVegetation(c, await planted);
    };
  }],
  ['undergrowth', async () => (await import('./veg/undergrowth')).buildUndergrowth],
  ['clouds', async () => (await import('./clouds')).buildClouds],
  ['rain', async () => (await import('./sky/rain')).buildRain],
  ['snow', async () => (await import('./sky/snow')).buildSnow],
  ['rainbow', async () => (await import('./sky/rainbow')).buildRainbow],
  ['life', async () => (await import('./life')).buildLife],
  ['fauna', async () => (await import('./fauna/land')).buildLandFauna],
  ['wildlife', async () => (await import('./fauna/waterAir')).buildWaterAirFauna],
  ['jungleFauna', async () => (await import('./fauna/jungle')).buildJungleFauna],
  ['people', async () => (await import('./people')).buildPeople],
  ['festival', async () => (await import('./festival')).buildFestival],
  ['treasure', async () => (await import('./treasure')).buildTreasure],
  ['foreground', async () => (await import('./foreground')).buildForeground],
];
/**
 * Parts built only when wanted (lazy.ts): the weather's and the festival's may never show on a visit. Built in their
 * place, as before, when the page opens wanting them (the URL, the saved weather setting, the calendar: a shot builds
 * what its URL asks), else later in the background, once the weather or the festival calendar wants them (`wanted`,
 * asked twice a second on the live page). `prepare`: what still happens in their place (the snow's white cover goes
 * into the materials built so far, so they compile with it at load and none again when it first snows; its flakes'
 * material and snowmen, hidden, so their shaders compile at load with the rest).
 */
const loadWants = weatherAtLoad(params, settings.weather);
const LATER: Record<string, { atLoad: boolean; wanted: (f: MapFrame) => boolean; now?: (f: MapFrame) => boolean; prepare?: () => Promise<void> }> = {
  rain: { atLoad: loadWants.rain, wanted: (f) => weather.wants(f).rain },
  snow: {
    atLoad: loadWants.snow,
    wanted: (f) => weather.wants(f).snow,
    prepare: async () => {
      const { prepareSnow } = await import('./sky/snow');
      timed('snowCover', () => prepareSnow(ctx));
    },
  },
  rainbow: { atLoad: loadWants.rainbow, wanted: (f) => weather.wants(f).rainbow },
  festival: { atLoad: festivalNow({ season: SEASON0, day: DAY0 }) !== null, wanted: festivalSoon, now: (f) => festivalNow(f) !== null },
};
const late = new LateParts({
  ctx,
  arrive: (name, part, ms) => arrive(name, part, ms),
  fail: (name, e) => {
    failed.push(name);
    console.error(`[map] part "${name}" failed:`, e);
  },
});
// The loading screen follows the build (index.html): Angkor Wat rises row by row
// from its grey outline with light on the stones being laid, the bar fills block by block (20) and the explorer walks
// below it to the bar's end; a frame in between lets it paint. Built, it waits for its button (enter()).
const loading = document.getElementById('loading');
loading?.style.setProperty('--ld-shape', steppedShape(10, 5));
/** The loading screen's button was pressed (or there is none). */
let entered = false;
for (const s of loading?.querySelectorAll('.ld-ghost, .ld-built, .ld-lit') ?? []) s.innerHTML = LOAD_TEMPLE.svg;
loading?.style.setProperty('--ld-rows', String(LOAD_TEMPLE.rows));
loading?.style.setProperty('--ld-cols', String(LOAD_TEMPLE.cols));
const hero = loading?.querySelector('.ld-hero');
if (hero) hero.innerHTML = loadingHero();
function showProgress(p: number): void {
  const rows = LOAD_TEMPLE.rows;
  loading?.style.setProperty('--ld-cut', `${+((1 - Math.round(p * rows) / rows) * 100).toFixed(3)}%`);
  loading?.style.setProperty('--ld-segs', String(Math.round(p * 20)));
  loading?.style.setProperty('--ld-p', p.toFixed(4));
  loading?.classList.toggle('is-built', p >= 1);
}
// (shots: hold it at one point, build nothing)
if (params.has('loading')) {
  showProgress(Math.min(1, Math.max(0, Number(params.get('loading')) || 0)));
  await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 4000))]);
  // (the ones that run once — the temple coming in, his hop, the button rising — at their end, whenever the shot is taken)
  for (const a of loading?.getAnimations({ subtree: true }) ?? []) if (a.effect?.getTiming().iterations !== Infinity) a.finish();
  requestAnimationFrame(() => ((window as unknown as { __ready: boolean }).__ready = true));
  await new Promise(() => undefined);
}
const nextFrame = () => (shot || document.hidden ? Promise.resolve() : new Promise<void>((r) => requestAnimationFrame(() => r())));
for (const [i, [name, load]] of BUILDERS.entries()) {
  showProgress((i + 1) / (BUILDERS.length + 1));
  await nextFrame();
  if (only && !only.includes(name)) continue;
  // (a part built only when wanted: the work of its place now; the part itself now, or later)
  const later = Object.hasOwn(LATER, name) ? LATER[name] : undefined;
  if (later) {
    try {
      await later.prepare?.();
    } catch (e) {
      console.warn(`[map] ${name}: its place in the build failed:`, e);
    }
    if (!later.atLoad) {
      late.defer({ name, load, wanted: later.wanted, now: later.now });
      continue;
    }
  }
  // The hang glider's take-off ramps are picked on the bare land, before the jungle is planted: no tree grows on them.
  if (name === 'vegetation')
    try {
      (await import('./roam/launchSpots')).reserveLaunchSpots(ctx.field);
    } catch (e) {
      console.warn('[map] launch spots failed:', e);
    }
  // The hot air balloon's field below Angkor Wat, and a lane to the valley road: kept clear of trees too.
  if (name === 'vegetation')
    try {
      (await import('./roam/balloon')).reserveBalloonHome(ctx.field);
    } catch (e) {
      console.warn('[map] balloon field failed:', e);
    }
  try {
    const build = await load();
    const t0 = performance.now();
    const part = await build(ctx);
    timings[name] = Math.round(performance.now() - t0);
    parts.push(part);
    scene.add(part.object);
  } catch (e) {
    failed.push(name);
    console.error(`[map] part "${name}" failed:`, e);
  }
}
// (the build workers are done: they stop, their memory freed)
work.done();
console.info(work.line());
if (Object.keys(late.states).length) console.info(`[map] built only when wanted: ${Object.keys(late.states).join(', ')}`);
scene.add(atmosphere.object);
// The land, trees, temples and road never move: they draw only the block sides that can face the camera.
for (const p of parts) if (['terrain', 'vegetation', 'path', 'jungle'].includes(p.name) || p.name.startsWith('landmark:')) skipBackFacets(p.object);
// …and, as plain boxes, not the sides that lie against the next block (cull.ts; the trees' own: veg/sway.ts).
timings.covered = Math.round(cutCovered(coverRoots(), undefined, work.knownCover).ms);
// What never moves casts the low and medium levels' still shadows (graphics.ts): the land, trees, temples, road, jungle
// sites, the village (its rafts bob a little: their shadows stand), the paddies' props (they change with the season
// only), the hamlets and the ledge, and the explorer while he stands on it (the overview); nor the people, animals
// and boats.
const STILL_PARTS = ['terrain', 'vegetation', 'undergrowth', 'path', 'jungle', 'camps', 'village', 'paddies', 'hamlet', 'foreground'];
for (const p of parts) if (STILL_PARTS.includes(p.name) || p.name.startsWith('landmark:')) markStill(p.object);
// The statues sculpted in workers (sacred/: Buddhas, offerings, the pagoda's naga) join their part when they are done:
// still as it is, whenever they come. (They were only if they came before the line above: on the live page most did, in
// a shot, which waits less, none did; the build workers' waits let some in first. Not the ledge: its explorer comes and goes.)
const sculptedStill = sacredReady().then(() => {
  for (const p of parts) if ((STILL_PARTS.includes(p.name) && p.name !== 'foreground') || p.name.startsWith('landmark:')) markStill(p.object);
  renderer.shadowMap.needsUpdate = true;
});
const ledgeExplorer = (parts.find((p) => p.name === 'foreground') as Foreground | undefined)?.explorer?.object;
/** Roaming, the explorer moves: he casts no still shadow then (the still map is drawn again as he leaves his ledge and comes back). */
function explorerStill(still: boolean): void {
  if (!ledgeExplorer || ledgeExplorer.layers.isEnabled(STILL_LAYER) === still) return;
  markStill(ledgeExplorer, still);
  renderer.shadowMap.needsUpdate = true;
}
// The land, the temples, the road and the ledge cast only while their shadows can be in view (cull.ts; the trees,
// jungle sites, camps, village, paddies and hamlets gate their own): roaming, the shadow map draws a half to a third of
// the map (the still shadows of low and medium: all of it).
const castGate = new ShadowGate();
for (const p of parts) if (p.name === 'path' || p.name.startsWith('landmark:')) castGate.addAll(p.object);
const land = parts.find((p) => p.name === 'terrain');
if (land) castGate.addLive(land.object);
const ledge = scene.getObjectByName('foreground:ledge');
if (ledge) castGate.addAll(ledge);
// (the low graphics level's plain blocks, now that they are built)
setGraphics(graphicsNow.level, scene);
const post: MapPost = await safe('post', async () => (await import('./post')).createPost(ctx), () => ({ render: () => renderer.render(scene, camera), setSize() {} }));
const blocks = Object.fromEntries(parts.filter((p) => p.blocks).map((p) => [p.name, p.blocks!]));
/**
 * A part built later (lazy.ts) joins the map as the ones built with it did: the scene, the frame's updates (after
 * the others'), the blocks line, the bug report's and the look panel's picks (they read `parts`), the nature book
 * (roaming reads `parts`), and the graphics level's block shapes for its voxel meshes (plain on low: the scene
 * again). Were it still, it would cast the still shadows (low, medium), drawn again. (Not in the walk maps, made once
 * as roaming is set up: the late parts have nothing to stand on; the snowmen are never solid.)
 */
function arrive(name: string, part: MapPart, ms: { build: number; compile: CompileTimes }): void {
  timings[name] = Math.round(ms.build);
  parts.push(part);
  scene.add(part.object);
  if (part.blocks) blocks[name] = part.blocks;
  if (STILL_PARTS.includes(name)) {
    markStill(part.object);
    renderer.shadowMap.needsUpdate = true;
  }
  setGraphics(graphicsNow.level, scene);
  const c = ms.compile;
  console.info(`[map] part "${name}" built when wanted, in ${ms.build.toFixed(0)} ms · its ${c.link.length} shaders started in ${c.start.toFixed(0)} ms, ready in ${c.ready.toFixed(0)}, linked in ${c.link.map((l) => l.toFixed(0)).join(' + ')} ms${c.slow.length ? ` (slow: ${c.slow.join(', ')})` : ''}${part.blocks ? ` · ${part.blocks} blocks` : ''}`);
}

// ── Camera, sound, interface ────────────────────────────────────────────────
const rig = new MapCameraRig(camera);
rig.calm = settings.calm;
const audio: MapAudio = await safe('audio', async () => (await import('./audio/audio')).createMapAudio(), () => ({ started: false, async start() {}, onHeld() {}, wake() {}, setVolumes() {}, play() {}, type() {}, duck() {}, roam() {}, call() {}, setWorld() {}, flight() {}, update() {} }));
audio.setVolumes(settings);
audio.setWorld(field);

let selected: PlaceId | null = null;
let hovered: PlaceId | null = null;
/** Tell the parts which place to point out: the hovered card, else the picked one. */
function pointOut(): void {
  for (const p of parts) p.highlight?.(hovered ?? selected);
}
function select(id: PlaceId | null): void {
  if (id === selected) return;
  selected = id;
  rig.focus(id);
  audio.flight(settings.calm ? 1.2 : 2.6);
  ui.setSelected(id);
  pointOut();
}

const uiRoot = document.getElementById('ui')!;
if (params.get('ui') === '0') uiRoot.style.display = 'none';
const handlers = {
  onHover: (id: PlaceId | null) => {
    hovered = id;
    pointOut();
  },
  onSelect: (id: PlaceId | null) => select(id),
  onBegin: (id: PlaceId) => {
    const href = PLACES.find((p) => p.id === id)?.href;
    // (after the fade to black, while the gong rings out)
    if (href) setTimeout(() => location.assign(href), 2000);
  },
  onSettings: (s: MapSettings) => {
    const was = settings;
    settings = s;
    if (s.graphics !== was.graphics) {
      // (auto picked again starts over from its guess)
      if (s.graphics === 'auto') resetAutoLevel();
      useLevel(levelOf(s.graphics));
    }
    // (a new resolution: drawn at once; auto's watches start over)
    if (s.resolution !== was.resolution && drawing) {
      autoWatch.reset();
      newLevelRatio();
    }
    if (s.fogAmount !== was.fogAmount) applyFogAmount();
    if (s.battery !== was.battery) {
      setBatterySaver(s.battery);
      autoWatch.reset();
      if (drawing) newLevelRatio();
    }
    rig.calm = s.calm;
    roamPrefs.easyFly = s.easyFly;
    roamPrefs.miniMap = s.miniMap;
    roamPrefs.keyHelp = s.keyHelp;
    padPrefs.rumble = s.padRumble;
    audio.setVolumes(s);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch {
      /* private mode: settings last for this visit only */
    }
  },
  onSound: (s: Parameters<MapAudio['play']>[0]) => audio.play(s),
  onFirstGesture: () => void audio.start(),
  onWake: () => audio.wake(),
  onStory: () => void openStory(0),
};
const ui: MapUI = await safe('ui', async () => (await import('./ui/ui')).createMapUI(uiRoot, PLACES, handlers, settings), () => ({ update() {}, setSelected() {}, setNight() {}, setRoaming() {}, setLang() {}, setGraphicsLevel() {}, setSoundHeld() {}, setDrawSize() {} }));
ui.setGraphicsLevel(graphicsNow.level);
audio.onHeld((held) => ui.setSoundHeld(held));
// (the game pad's moves in the menus and on the map sound like the mouse over a card)
pad.setSounds({ move: () => audio.play('hover') });

// ── Roaming: the explorer leaps off the ledge to walk, glide and paddle ────
const foreground = parts.find((p): p is Foreground => p.name === 'foreground' && 'explorer' in p);
// (`explorer=0`: he is left out of the picture: the wallpaper script's shots, dev/freecam.ts)
if (params.get('explorer') === '0' && foreground) foreground.explorer.object.visible = false;
const roam: MapRoam | null = foreground
  ? await safe<MapRoam | null>(
      'roam',
      async () =>
        (await import('./roam/roam')).buildRoam(ctx, {
          explorer: foreground.explorer,
          feet: foreground.feet,
          yaw: foreground.yaw,
          release: (on) => foreground.release(on),
          parts,
          uiRoot,
          canvas,
          onMode: (mode) => {
            if (mode !== 'overview') select(null);
            ui.setRoaming(mode);
            explorerStill(mode === 'overview');
          },
          onOverview: () => {
            rig.fit();
            rig.focus(null, true);
          },
          onEnter: (place) => {
            audio.play('begin');
            if (place.href) setTimeout(() => location.assign(place.href!), 1600);
          },
          playSound: (s, gain) => audio.roam(s, gain),
          uiSound: (s) => audio.play(s),
        }),
      () => null,
    )
  : null;
if (roam) {
  parts.push(roam);
  scene.add(roam.object);
  // (the disc under his feet with still shadows (low, medium) lies on the roaming world's floors: foreground.ts)
  foreground?.follow(roam.world);
  // (the roaming's own blocks too: on low its ramps, parked gliders, boats and balloon plain from afar, graphics.ts)
  setGraphics(graphicsNow.level, scene);
  // Mini-map while roaming, and the big map (M): a part, so the frame loop draws it after the roaming.
  const minimap = await safe('minimap', async () => (await import('./ui/minimap')).createMinimap({ root: uiRoot, field, parts: [...parts], roam, sound: (s) => audio.play(s) }), () => null);
  if (minimap) parts.push(minimap);
}

addEventListener('pointermove', (e) => rig.setPointer((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1));
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  rig.fit();
  // (a picked resolution is a share of the screen's width: its sizes follow the window, and the screen when the window moves to another)
  if (drawing) holdRatio(true);
  renderer.setSize(innerWidth, innerHeight);
  post.setSize(innerWidth, innerHeight);
  ui.setDrawSize?.(Math.round(innerWidth * view.scene), Math.round(innerHeight * view.scene));
});

// ── Time of day ─────────────────────────────────────────────────────────────
/** A full day↔night cycle in "cycle" mode (s). */
const CYCLE = 360;
/** `clock=` (checks): hold the day's cycle there (0 afternoon, 0.25 dusk, 0.5 night, 0.75 dawn). */
let clockParam = params.has('clock') ? (((Number(params.get('clock')) || 0) % 1) + 1) % 1 : null;
/**
 * `equinox=1` on the live page (not a shot): `clock=` holds the clock only until Start is pressed, then it runs on from
 * there, so the equinox morning plays (from 0.7 the sun reaches the tower in about 20 s); null once let go.
 */
let clockRunsFrom = !shot && params.get('equinox') === '1' ? clockParam : null;
/** It was let go: the clock runs (as the Time setting's "Cycle") until the Time setting changes. */
let urlRuns = false;
const timeAtStart = settings.time;
/** `moon=` (checks): hold the moon's age there (0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter), else it follows the date (`day=`). */
let moonParam = params.has('moon') ? (((Number(params.get('moon')) || 0) % 1) + 1) % 1 : null;
/** `moonpath=high|low`: hold the moon's path (the free camera's panel holds it too), else the Moon setting's. */
let moonPathParam: MoonPath | null = MOON_PATHS.find((p) => p === params.get('moonpath')) ?? null;
const moonPathNow = (): MoonPath => moonPathParam ?? settings.moonPath;
/** The moon's path now (`MapFrame.moonHigh`): 1 across the sky, 0 low; a change eases over a couple of seconds. */
let moonHigh = moonPathNow() === 'high' ? 1 : 0;
const nightOf = (c: number) => 0.5 - 0.5 * Math.cos(c * Math.PI * 2);
/** The clock on the dusk side for a time of day (0 afternoon … 0.5 night). */
const duskClock = (n: number) => Math.acos(1 - 2 * Math.min(1, Math.max(0, n))) / (Math.PI * 2);
// (DAY0, SEASON0 and SEASON_PER_DAY: above the build)
let night = clockParam !== null ? nightOf(clockParam) : params.has('night') ? Number(params.get('night')) : settings.time === 'night' ? 1 : 0;
/** Days of the cycle so far (its fraction is always the clock): runs with `t` while cycling, else follows the eased clock, so a switch in or out of "cycle" (and the moon, the season) never jumps. */
let cycleDays = duskClock(night);
const cycleDays0 = cycleDays;
/** `t` where the cycle's days would be 0 (set on entering the cycle so it starts at the current clock). */
let cycleOff = 0;
let wasCycling = false;
function nightTarget(): number {
  if (clockParam !== null) return nightOf(clockParam);
  if (params.has('night')) return Number(params.get('night'));
  if (isCycling()) return nightOf(cycleDays % 1);
  return settings.time === 'night' ? 1 : 0;
}

// ── Frame ───────────────────────────────────────────────────────────────────
/** The frame loop's pace: every frame the cap allows, fewer while idle, few while the window has no focus. */
type LoopMode = 'full' | 'idle' | 'blurred';
/** No input for this long (ms) on the overview, and no camera flight: idle. */
const IDLE_AFTER = 4000;
/** Frames a second while idle (half the desktop's 60), and on a phone or the battery saver. */
const IDLE_FPS = 30;
const IDLE_FPS_SLOW = 20;
/** Frames a second while the window has no focus (another window in front; still on screen). */
const BLURRED_FPS = 10;
/** `cam=x,y,z,tx,ty,tz` or with a seventh value, the vertical field of view (degrees). */
const fixedCam = params.get('cam')?.split(',').map(Number);
/** The camera of a video frame (scripts/video.mjs: `__videoFrame`), else the URL's or the rig's. */
let videoCam: number[] | null = null;
/** The free camera's (dev server only: dev/freecam.ts), the same seven values; it goes before the other two. */
let freeCam: number[] | null = null;
/** The free camera's panel (dev server only; set below, once its module has loaded). */
let free: import('./dev/freecam').FreeCam | null = null;
// (the weather setting: follow the season, clear, rainy, stormy; a change eases in)
const weather = createWeather(params, () => settings.weather);
const frame: MapFrame = { t: 0, dt: 0, drift: 0, night, clock: duskClock(night), day: DAY0, season: SEASON0, weather: { ...CALM_WEATHER }, camera, lightDir: new Vector3(0, 1, 0), listener: new Vector3(), roam: 'overview', roamLevels: { wind: 0, wake: 0, sail: 0 }, calls: [] };
const anchors = Object.fromEntries(PLACES.map((p) => [p.id, { x: 0, y: 0, visible: false }])) as Record<PlaceId, AnchorOnScreen>;
const _p = new Vector3();
const _d = new Vector3();
function projectAnchors(): void {
  for (const p of PLACES) {
    _p.set(...p.anchor).project(camera);
    const a = anchors[p.id];
    a.dist = camera.position.distanceTo(_d.set(...p.anchor));
    a.x = ((_p.x + 1) / 2) * innerWidth;
    a.y = ((1 - _p.y) / 2) * innerHeight;
    // In front of the camera (the interface keeps cards of off-screen places at the screen's edge).
    a.visible = _p.z < 1;
  }
}

/** Parts whose `update` threw: logged once, then left still (the rest of the map keeps running). */
const broken = new Set<MapPart>();
function runUpdate(p: MapPart | null | undefined, f: MapFrame): void {
  if (!p?.update || broken.has(p)) return;
  try {
    p.update(f);
  } catch (e) {
    broken.add(p);
    console.error(`[map] part "${p.name}" failed to update (left still from now on):`, e);
  }
}

/** Put the camera at `cam` (`[x, y, z, tx, ty, tz]`, m: where it is and what it looks at) and, if a seventh value is there, its vertical field of view (degrees). */
function placeCamera(cam: number[]): void {
  camera.position.set(cam[0], cam[1], cam[2]);
  camera.lookAt(cam[3], cam[4], cam[5]);
  if (cam[6] > 0 && cam[6] !== camera.fov) {
    camera.fov = cam[6];
    camera.updateProjectionMatrix();
  }
}

/** The clock runs: the Time setting is "Cycle" and nothing in the URL holds it. */
const isCycling = () => clockParam === null && !params.has('night') && (settings.time === 'cycle' || (urlRuns && settings.time === timeAtStart));
// (for the calendar of events and the stilt house's bed: time.ts)
Object.assign(TIME, {
  days: () => cycleDays,
  cycling: isCycling,
  dayLength: CYCLE,
  moment: (d: number) => ({
    clock: (((d % 1) + 1) % 1),
    day: DAY0 + (clockParam !== null ? 0 : Math.floor(d)),
    season: (((SEASON0 + (d - cycleDays0) * SEASON_PER_DAY) % 1) + 1) % 1,
  }),
  skipTo: (d: number) => {
    if (shot || !isCycling() || !Number.isFinite(d)) return false;
    const to = Math.max(d, cycleDays);
    cycleOff -= (to - cycleDays) * CYCLE;
    cycleDays = to;
    // (the light there at once: no slow dusk)
    night = nightOf(to % 1);
    return true;
  },
  building: () => Object.values(late.states).includes('building'),
} satisfies Partial<typeof TIME>);

function step(t: number, dt: number): void {
  // (`equinox=1` on the live page: Start lets the clock go, on from where `clock=` held it)
  if (clockRunsFrom !== null && entered && clockParam === clockRunsFrom) {
    cycleDays = Math.floor(cycleDays) + clockRunsFrom;
    clockParam = clockRunsFrom = null;
    urlRuns = true;
  }
  const cycling = isCycling();
  // (entering the cycle: start it at the current clock and day, so the sun, the moon and the festivals carry on)
  if (cycling && !wasCycling) cycleOff = t - cycleDays * CYCLE;
  wasCycling = cycling;
  if (cycling) cycleDays = (t - cycleOff) / CYCLE;
  const target = nightTarget();
  // Ease towards the time of day (a few seconds for a switch).
  night += (target - night) * (dt > 0 ? 1 - Math.exp(-dt * 0.8) : 1);
  frame.t = t;
  frame.dt = dt;
  frame.drift = shot ? t : frame.drift + (settings.calm ? 0 : dt);
  frame.night = night;
  // (the cycle's own clock while it runs; else the eased time of day on the side of the dial the clock was on — dawn stays
  // dawn — moving to the dusk side once it settles, so a switch to night from the afternoon goes through dusk)
  if (clockParam !== null) frame.clock = clockParam;
  else if (cycling) frame.clock = cycleDays % 1;
  else {
    const prev = frame.clock;
    const settled = night < 1e-3 || night > 1 - 1e-3;
    const clock = prev > 0.5 && !settled ? 1 - duskClock(night) : duskClock(night);
    // (keep the days whole across the dial's wrap, so the moon's phase does not jump)
    const wrap = clock - prev > 0.5 ? -1 : clock - prev < -0.5 ? 1 : 0;
    cycleDays = Math.round(cycleDays - prev) + wrap + clock;
    frame.clock = clock;
  }
  frame.day = DAY0 + (clockParam !== null ? 0 : Math.floor(cycleDays));
  // (the sky's moon only: the festivals and the daily seeds go by `day`)
  frame.moonAge = moonParam ?? undefined;
  const highTarget = moonPathNow() === 'high' ? 1 : 0;
  moonHigh += (highTarget - moonHigh) * (dt > 0 && !shot ? 1 - Math.exp(-dt * 1.5) : 1);
  if (Math.abs(highTarget - moonHigh) < 1e-3) moonHigh = highTarget;
  frame.moonHigh = moonHigh;
  frame.season = (((SEASON0 + (cycleDays - cycleDays0) * SEASON_PER_DAY) % 1) + 1) % 1;
  weather.update(frame);
  // (the free camera's panel can hold a weather: dev/freecam.ts)
  free?.weather(frame.weather);
  // (parts built only when wanted: the rain, snow, the festival, lazy.ts; a shot builds what its URL asks with the map)
  if (!shot) late.watch(frame);
  // (the free camera moves first: it sets `freeCam`)
  free?.step();
  const cam = freeCam ?? videoCam ?? fixedCam;
  if (cam && !roam?.active) placeCamera(cam);
  else if (!roam?.active) rig.update(dt, t);
  // Roaming moves the explorer and the follow camera first: the other parts read the camera.
  runUpdate(roam, frame);
  // (the free camera, and the shots that draw what it saved, win over the follow camera too: the explorer stays where he
  // is, and the parts see the overview's rules with it: the rain, the shadows and the detail as a shot from `cam=` has
  // them. Not on the live page, where `?cam=` never held the camera while roaming)
  if (cam && roam?.active && (freeCam || shot)) {
    placeCamera(cam);
    frame.roam = 'overview';
  }
  // (the free camera's frame is left of its panel: its view offset, after roaming, which clears one)
  free?.placed();
  camera.updateMatrixWorld();
  for (const p of parts) if (p !== roam) runUpdate(p, frame);
  castGate.update(frame);
  // (the low level: props, boats and houses far off drawn as plain boxes, graphics.ts)
  plainFar(camera);
  projectAnchors();
  ui.update(anchors, dt);
  ui.setNight(night);
  audio.update(frame, selected);
  // (animal calls: heard where they are)
  for (const c of frame.calls) audio.call(c);
  frame.calls.length = 0;
}

/**
 * The moment as URL values, for a shot to bring it back: the scene's time `t`, the time of day (the day's cycle, the
 * moon, the season) and the weather as they are now: dawn is not dusk, the balloon keeps its wind.
 */
function momentQuery(q: URLSearchParams, t: number): URLSearchParams {
  q.set('t', t.toFixed(1));
  q.set('night', night.toFixed(2));
  q.set('clock', frame.clock.toFixed(3));
  q.set('day', String(frame.day));
  if (moonParam !== null) q.set('moon', moonParam.toFixed(3));
  q.set('moonpath', moonPathNow());
  q.set('season', frame.season.toFixed(3));
  // (the fog's thickness, when it is not the game's own: a picture keeps the fog it was framed in)
  if (fogNow.amount !== 1) q.set('fogamount', fogNow.amount.toFixed(2));
  const w = frame.weather;
  for (const k of ['wind', 'cloud', 'rain', 'storm', 'rainbow', 'wet', 'snow', 'snowCover'] as const) if (w[k] > 0.005) q.set(k, w[k].toFixed(2));
  return q;
}

// ── Tools: bug reports (B), block look panel (K) and the free camera (`) ───
// (dev server only: reports are saved through it, and a deployed map shows no tools)
const devTools = import.meta.env.DEV && !shot;
const feedback = !devTools
  ? null
  : new FeedbackTool({
      renderer,
      scene,
      camera,
      pickables: () => parts.map((p) => p.object),
      render: () => post.render(frame),
      state: () => ({
        Map: `${roam?.report()?.text ?? (selected ? `focused on ${selected}` : 'overview')} · night ${night.toFixed(2)} · t ${frame.t.toFixed(1)} s`,
        Camera: `(${camera.position.toArray().map((v) => v.toFixed(1)).join(', ')})`,
        Blocks: Object.entries(blocks).map(([k, v]) => `${k} ${v}`).join(' · '),
      }),
      repro: () => {
        const q = momentQuery(new URLSearchParams(location.search), frame.t);
        if (selected) q.set('focus', selected);
        for (const [k, v] of Object.entries(roam?.report()?.params ?? {})) q.set(k, v);
        return q;
      },
    });
if (devTools) installLookPanel({ viewAt: () => ({ camera, rect: canvas.getBoundingClientRect() }), pickables: () => parts.map((p) => p.object), scene, renderer });
// The free camera (dev/freecam.ts; `wallpapers/`, `npm run wallpaper`): a camera that goes anywhere, for wallpapers and videos.
if (devTools)
  void import('./dev/freecam').then(({ installFreeCam }) => {
    free = installFreeCam({
      camera,
      canvas,
      field,
      setCamera: (c) => {
        freeCam = c;
      },
      setClock: (c) => {
        clockParam = c;
        // (at once, not eased over a few seconds)
        if (c !== null) night = nightOf(c);
      },
      clockHeld: () => clockParam,
      clock: () => frame.clock,
      setMoon: (m) => {
        moonParam = m;
      },
      moonHeld: () => moonParam,
      setMoonPath: (p) => {
        moonPathParam = p;
        // (at once, not eased: the panel shows it where it goes)
        moonHigh = moonPathNow() === 'high' ? 1 : 0;
      },
      moonPathHeld: () => moonPathParam,
      moonPath: () => settings.moonPath,
      setFogAmount: (v) => {
        fogAmountParam = v;
        applyFogAmount();
      },
      fogAmountHeld: () => fogAmountParam,
      fogAmount: () => settings.fogAmount,
      restore: () => {
        if (!roam?.active) rig.fit();
      },
      explorer: () => foreground?.explorer.object ?? null,
      redrawShadows: () => {
        renderer.shadowMap.needsUpdate = true;
      },
      roaming: () => !!roam?.active,
      placeExplorer: (q) => roam?.placeFrom(q, frame) ?? false,
      // (the sky moves with `drift`, which a shot sets from its `t=`)
      moment: (withExplorer) => {
        const q = momentQuery(new URLSearchParams(), frame.drift);
        if (withExplorer) for (const [k, v] of Object.entries(roam?.report()?.params ?? {})) if (k !== 'rcam') q.set(k, v);
        return q;
      },
    });
  });

// ── Start ───────────────────────────────────────────────────────────────────
const focus = asPlace(params.get('focus'));
if (focus) {
  selected = focus;
  rig.focus(focus, true);
  ui.setSelected(focus);
  pointOut();
}
// ── The story (story/): before the map on the first visit; "Our story" in the settings shows it again ──
const STORY_KEY = 'angkor-story-seen';
let story: Story | null = null;
async function loadStory(): Promise<Story | null> {
  return (story ??= await safe<Story | null>(
    'story',
    async () =>
      (await import('./story/story')).createStory(
        {
          focus: (id, instant) => {
            // (roaming: the explorer's camera stays his)
            if (roam?.active) return;
            rig.focus(id, instant);
            if (!instant) audio.flight(settings.calm ? 1.2 : 2.6);
          },
          setLang: (l) => ui.setLang(l),
          sound: (s) => audio.play(s),
          // (the loading screen's button was the click the sound needs: its first beat does not ask again)
          soundOn: () => audio.started || entered,
          startSound: () => audio.start(),
          type: (k, pan, delay) => audio.type(k, pan, delay),
          duck: (d) => audio.duck(d),
          onOpen: () => {
            select(null);
            uiRoot.inert = true;
          },
          onClose: () => {
            uiRoot.inert = false;
            try {
              localStorage.setItem(STORY_KEY, '1');
            } catch {
              /* private mode: it shows again next visit */
            }
          },
        },
        { shot },
      ),
    () => null,
  ));
}
async function openStory(from: number): Promise<void> {
  (await loadStory())?.play(from);
}
const storyAt = Number(params.get('story') ?? 0);
let seenStory = false;
try {
  seenStory = localStorage.getItem(STORY_KEY) === '1';
} catch {
  /* no storage */
}
const storyDue = storyAt > 0 || (!shot && !seenStory && !focus && params.get('story') !== '0' && params.get('ui') !== '0');
// (shots: at once; else it opens with the loading screen's button, loaded now so it shows at once then)
if (storyDue) await (shot ? openStory(storyAt - 1) : loadStory());

console.info(`[map] built in ${Object.entries(timings).map(([k, v]) => `${k} ${v}`).join(', ')} ms · blocks ${JSON.stringify(blocks)}${failed.length ? ` · FAILED: ${failed.join(', ')}` : ''}`);
posthogLogger.info('map initialized', {
  entry_point: 'map',
  built_part_count: parts.length,
  failed_part_count: failed.length,
});
Object.assign(window, { scene, camera, field, parts, rig, roam, audio, ui, renderer, post, graphicsNow, __frame: frame, __mapStats: { timings, blocks, failed, late: late.states, work: work.stats } });

/** Starts the frame loop again once the loading screen's button is pressed (set with the loop, below). */
let wakeLoop: () => void = () => undefined;

/**
 * The map is drawn: the explorer turns and waves, and the loading screen's
 * gold button waits (a shot takes the screen away at once). Its click lets
 * the browser play sound (it plays none before one, a phone most of all).
 */
function mapReady(): void {
  const go = loading?.querySelector<HTMLButtonElement>('.ld-go');
  if (!loading || !go || shot) {
    entered = true;
    loading?.remove();
    return;
  }
  showProgress(1);
  // (the map's keys and cards wait behind it, their animations still: map.css `.map-waiting`)
  uiRoot.inert = true;
  document.body.classList.add('map-waiting');
  go.addEventListener('click', enter, { once: true });
  go.focus({ preventScroll: true });
  // (a game pad: ✕ presses it, and nothing behind the screen takes the pad meanwhile)
  closeLoadPad = pad.openLayer(loading, { first: () => go });
}
/** The loading screen's hold on the game pad (let go when its button is pressed). */
let closeLoadPad: () => void = () => undefined;
/** The button: the sound starts (inside the click), the story opens on the first visit, and the loading screen fades out. */
function enter(): void {
  if (entered || !loading) return;
  entered = true;
  closeLoadPad();
  uiRoot.inert = false;
  document.body.classList.remove('map-waiting');
  // (the frame loop rests while the button waits: it draws again from now, under the fading screen)
  wakeLoop();
  void audio.start().then(() => audio.play('select'));
  if (storyDue) void openStory(Math.max(0, storyAt - 1));
  loading.classList.add('done');
  setTimeout(() => loading.remove(), 1000);
}

// ── Resolution follows the frame rate ─────────────────────────────────────
/**
 * The pixel ratio drops to 1 while frames stay slower than about 40 a second
 * (20 on a phone, which draws at most 30: graphics.ts; two checks in a row:
 * one hitch is not enough), and goes back to the screen's own when they keep
 * up again: the haze, mist, bloom and
 * grading run on every pixel, so fewer pixels keep a slow machine smooth.
 * Only the screen's ratio or 1, never a step between: 1.5 on a 2× screen is
 * stretched by 4/3, which blurs the whole map and lays a fine grid over it.
 * A ratio that proved too slow waits a minute before it is tried again, twice
 * as long each time it fails again (up to ten minutes: no see-sawing).
 * That is the medium graphics level's `auto`; the others hold one ratio
 * (graphics.ts: the screen's on high and max, 1 on low).
 *
 * The Resolution setting (resolution.ts) overrides all of it: a picked size
 * is a share of the screen's own width, held whatever the frames do. A whole
 * step draws a canvas that size, stretched by the browser with nearest
 * pixels; a size between keeps the canvas at the screen's own size and draws
 * the scene smaller (post.ts scales it up). Auto is the level's, as above.
 */
const MAX_RATIO = Math.min(devicePixelRatio, shot ? 1 : 2);
const res = { ratio: renderer.getPixelRatio(), ceiling: MAX_RATIO, time: 0, frames: 0, since: 0, ceilingAge: 0, slow: 0, wait: 30 };
/** The scene's pixel ratio `scene`, the canvas's and its stretch as the Resolution setting wants them; `force`: set again even if the same (a resize). */
function setRatio(scene: number, force = false): void {
  const pick = settings.resolution;
  let canvasRatio = scene;
  let pixelated = false;
  if (pick !== 'auto') {
    const { step, whole } = stepOf(pick);
    if (whole) pixelated = Math.round(step) > 1;
    else canvasRatio = screenRatio();
  }
  const same = view.scene === scene && view.canvas === canvasRatio && view.pixelated === pixelated;
  res.ratio = scene;
  if (same && !force) return;
  res.since = 0;
  view.scene = scene;
  view.canvas = canvasRatio;
  view.pixelated = pixelated;
  canvas.style.imageRendering = pixelated ? 'pixelated' : '';
  renderer.setPixelRatio(canvasRatio);
  renderer.setSize(innerWidth, innerHeight);
  post.setSize(innerWidth, innerHeight);
  ui.setDrawSize?.(Math.round(innerWidth * scene), Math.round(innerHeight * scene));
}
/** A picked resolution, or a graphics level with its own ratio, gets it (true); `auto` is left to {@link adaptResolution} (false). */
function holdRatio(force = false): boolean {
  const pick = settings.resolution;
  const want = graphicsNow.ratio;
  if (pick === 'auto' && want === 'auto') {
    // (back to auto from a picked size: the canvas as the scene again)
    if (force || view.canvas !== view.scene || view.pixelated) setRatio(res.ratio, true);
    return false;
  }
  const ratio = pick !== 'auto' ? pick * screenRatio() : typeof want === 'number' ? Math.min(MAX_RATIO, want) : MAX_RATIO;
  setRatio(ratio, force);
  res.ceiling = MAX_RATIO;
  res.time = res.frames = res.slow = 0;
  return true;
}
// (from the first frame: the low level never draws a full-size picture)
holdRatio();
/** A new graphics level (or resolution, or frame cap): its own ratio, or (auto) the screen's again, dropping only if it proves slow there. */
function newLevelRatio(): void {
  if (holdRatio()) return;
  Object.assign(res, { ceiling: MAX_RATIO, ceilingAge: 0, time: 0, frames: 0, slow: 0, wait: 30 });
  setRatio(MAX_RATIO);
}
function adaptResolution(dt: number): void {
  if (holdRatio()) return;
  if (dt > 0.25) return; // (a hitch: a tab switch, a build)
  res.time += dt;
  res.frames++;
  res.since += dt;
  res.ceilingAge += dt;
  if (res.ceilingAge > res.wait) res.ceiling = MAX_RATIO;
  if (res.frames < 45 || res.since < 1.5) return;
  const avg = res.time / res.frames;
  res.time = res.frames = 0;
  res.slow = avg > 1.5 * frameCap.time ? res.slow + 1 : 0;
  let next = res.ratio;
  if (res.slow >= 2 && res.ratio > 1) {
    res.ceiling = 1;
    res.ceilingAge = 0;
    res.wait = Math.min(600, res.wait * 2);
    next = 1;
  } else if (avg < 1.05 * frameCap.time && res.ratio < res.ceiling) next = res.ceiling;
  if (next !== res.ratio) setRatio(next);
}
drawing = true;
/** Use a graphics level now: what it draws, its resolution, auto's note; auto's watch starts over. */
function useLevel(level: GraphicsLevel): void {
  autoWatch.reset();
  if (level === graphicsNow.level) return;
  setGraphics(level, scene);
  // (the fog's step follows the level)
  setFog(fogChoice, level);
  ui.setGraphicsLevel(level);
  // (before the first frame the resolution is set up with the level in use)
  if (drawing) newLevelRatio();
}
Object.assign(window, { __mapResolution: res });

// The GPU lost the picture (WebGL context lost: a GPU reset, a driver update, too little memory). three asks for it
// back and, once the browser gives it, uploads again what it holds as it draws; the parts draw again what they drew
// only once (`restored`: the still shadows, the far trees' pictures, the snow's map from above). On auto the level
// steps down one, kept on this device as auto's watch does, lest the next frames lose it again. (Its shader errors
// with empty logs come first: three links programs on a context that is already gone.)
canvas.addEventListener('webglcontextlost', () => {
  const lower = settings.graphics === 'auto' ? lowerAutoLevel() : null;
  console.warn(`[map] the GPU lost the picture (WebGL context lost) ${(performance.now() / 1000).toFixed(0)} s into the page, graphics ${graphicsNow.level}${lower ? `: auto steps down to ${lower}` : ''}`);
  if (lower) useLevel(lower);
});
canvas.addEventListener('webglcontextrestored', () => {
  console.info('[map] the picture is back: what was drawn once is drawn again');
  // (three has made a new shadow pass: what only still casters draw goes on it again, before the atmosphere's hook)
  stillCasters(renderer);
  for (const p of parts) p.restored?.();
});

if (shot) {
  document.body.classList.add('shot');
  mapReady();
  // (statues are sculpted in workers: wait for them, sacred/pending.ts)
  const sculpted = await sacredReady();
  await sculptedStill;
  console.info(`[map] sacred pieces sculpted ${sculpted.ms.toFixed(0)} ms after the build${sculpted.left ? ` · ${sculpted.left} NOT READY` : ''}`);
  const t = Number(params.get('t') ?? 12);
  step(t, 0);
  // (a late part this moment wants but the URL did not ask for — none should be — built now, and its update)
  for (const p of await late.settle(frame)) runUpdate(p, frame);
  roam?.simulate(frame);
  // Let the scene settle (animated parts ease in), then render once.
  for (let i = 0; i < 30; i++) step(t, 1 / 60);
  step(t, 0);
  // (the interface's web fonts first, so shots don't show the fallback font)
  await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 4000))]);
  post.render(frame);
  /**
   * One frame of a video (scripts/video.mjs): the scene at `t`, `dt` after
   * the last one, from a camera `[x, y, z, tx, ty, tz]` (null: the rig's or
   * the explorer's) at a time of day `clock` (null: as it was), then drawn.
   * (Left out, `cam` and `clock` are null: a check's `__videoFrame(t, dt)`
   * once made the clock undefined, the night NaN and the ducks' loop with it.)
   */
  const videoFrame = (t: number, dt: number, cam: number[] | null = null, clock: number | null = null) => {
    videoCam = cam;
    if (clock !== null) {
      clockParam = clock;
      night = nightOf(clock);
    }
    step(t, dt);
    post.render(frame);
    for (const p of parts) p.afterRender?.();
  };
  Object.assign(window, { __videoFrame: videoFrame });
  requestAnimationFrame(() => ((window as unknown as { __ready: boolean }).__ready = true));
} else {
  // (the shaders compile side by side while the loading screen still shows, not one by one in the first frame; never waits long.
  // As the map draws them — into the post effects' target, lazy.ts `compileFor` —: compiled for the screen, with its tone
  // mapping and sRGB, they were other programs, and the first frame compiled all ~75 again: 1.3 s on an M1 Max, now 0.3)
  const c0 = performance.now();
  await compileFor(renderer, scene, camera, scene, false, 6000);
  console.info(`[map] shaders compiled in ${(performance.now() - c0).toFixed(0)} ms`);
  const t0 = performance.now();
  /** When the last frame was drawn, and when the next one is due (ms). */
  let last = t0;
  let due = t0;
  let first = true;
  /** The loop has a frame asked for (it rests while the loading screen's button waits). */
  let looping = true;
  // Idle: the overview, hands off, draws fewer frames (the water, people and clouds still move, only less often);
  // any input, a camera flight or roaming brings them all back at once. A window without focus draws few.
  let lastInput = t0;
  let focused = document.hasFocus();
  /** A slow pace sleeps between frames (a timer, not a wake-up every refresh); this one, if it does. */
  let sleep = 0;
  const touched = () => {
    lastInput = performance.now();
    // (a frame at once, not when the slow pace would have drawn one)
    due = Math.min(due, lastInput);
    if (sleep) {
      clearTimeout(sleep);
      sleep = 0;
      requestAnimationFrame(tick);
    }
  };
  // (`padinput`: a game pad pressed or pushed, pad/pad.ts)
  for (const type of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'padinput']) addEventListener(type, touched, { capture: true, passive: true });
  addEventListener('focus', () => {
    focused = true;
    touched();
  });
  addEventListener('blur', () => (focused = false));
  const idleOff = params.get('idle') === '0';
  /** Frames a second now: the cap (graphics.ts `frameCap`: 60, or 30 with the battery saver and on a phone that cannot keep up), fewer while idle or unfocused. */
  const pace = (now: number): { fps: number; mode: LoopMode } => {
    if (idleOff || feedback?.active || free?.active) return { fps: frameCap.fps, mode: 'full' };
    if (!focused) return { fps: BLURRED_FPS, mode: 'blurred' };
    if (roam?.active || rig.flying || now - lastInput < IDLE_AFTER) return { fps: frameCap.fps, mode: 'full' };
    return { fps: frameCap.fps > 30 && !PHONE ? IDLE_FPS : IDLE_FPS_SLOW, mode: 'idle' };
  };
  /** The loop's state, for checks (scripts/idle.mjs): frames drawn, the pace now. */
  const loop = { drawn: 0, fps: frameCap.fps, mode: 'full' as LoopMode | 'waiting' };
  Object.assign(window, { __loop: loop, __phoneRate: phoneRate });
  /** The last frame was at full pace (the resolution and auto's watch measure only such frames). */
  let wasFull = false;
  /** Roaming at the last frame (a phone tries 60 again as it starts or ends: graphics.ts `PhoneFrameRate`). */
  let wasRoaming = false;
  /** Seconds the free camera stood the scene's time still so far (s). */
  let stoodStill = 0;
  const tick = (now: number) => {
    // (built, the loading screen's button waits: one frame was drawn under it — the shaders, the buffers — and the loop rests until it is pressed)
    if (!first && !entered) {
      looping = false;
      loop.mode = 'waiting';
      return;
    }
    const { fps, mode } = pace(now);
    const interval = 1000 / fps;
    // (a pace that got faster draws soon, not when the slower one would have)
    due = Math.min(due, last + interval);
    // (evenly: a refresh a few ms early is on time; a 120 Hz screen draws every other refresh at 60)
    if (!first && now < due - Math.min(4, interval / 4)) {
      // (more than a refresh or two to wait: sleep until just before it, then wait for the refresh)
      const wait = due - now - 12;
      if (wait > 0)
        sleep = window.setTimeout(() => {
          sleep = 0;
          requestAnimationFrame(tick);
        }, wait);
      else requestAnimationFrame(tick);
      return;
    }
    due = now - due > interval ? now + interval : due + interval;
    loop.fps = fps;
    loop.mode = mode;
    loop.drawn++;
    const raw = Math.max(0, (now - last) / 1000);
    // (slow paces step further a frame; roaming's physics keep short steps)
    const dt = Math.min(roam?.active ? 0.05 : 0.1, raw);
    last = now;
    // (the free camera can stand the scene's time still: the clock loses the seconds it stood, and goes on from there)
    const still = free?.frozen === true;
    if (still) stoodStill += raw;
    // (the first frame's time can come a hair before t0)
    if (!feedback?.active) step(Math.max(0, (now - t0) / 1000 - stoodStill), still ? 0 : dt);
    // (while the story hides the whole map, the map is not drawn: story/story.ts)
    const drawn = !story?.covered;
    const full = mode === 'full';
    const roaming = !!roam?.active;
    if (roaming !== wasRoaming) phoneRate.retry();
    wasRoaming = roaming;
    if (now - t0 > 3000 && drawn && full && wasFull) {
      adaptResolution(raw);
      const settled = settings.resolution !== 'auto' || graphicsNow.ratio !== 'auto' || res.ratio <= 1;
      // (auto: a level lower once this one proves too slow, its own resolution as low as it goes)
      const lower = settings.graphics === 'auto' ? autoWatch.watch(raw, settled) : null;
      if (lower) useLevel(lower);
      // (a phone: 60 while it keeps up, else an even 30; the watches measure against the new cap from here)
      else if (phoneRate.watch(raw, settled)) {
        autoWatch.reset();
        res.time = res.frames = res.slow = 0;
      }
    }
    wasFull = full;
    if (drawn) post.render(frame);
    for (const p of parts) p.afterRender?.();
    feedback?.update();
    if (first) {
      first = false;
      mapReady();
    }
    requestAnimationFrame(tick);
  };
  /** The loading screen's button was pressed: the loop runs again. */
  wakeLoop = () => {
    if (looping) return;
    looping = true;
    last = due = performance.now();
    wasFull = false;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
