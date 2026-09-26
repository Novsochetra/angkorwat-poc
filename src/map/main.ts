import { DirectionalLight, Group, HemisphereLight, NeutralToneMapping, PCFShadowMap, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three';
import { FeedbackTool } from '../feedback/FeedbackTool';
import { skipBackFacets } from '../voxel/backFacets';
import { installLookPanel } from '../voxel/LookPanel';
import type { Atmosphere } from './atmosphere';
import type { MapAudio } from './audio/audio';
import { MapCameraRig } from './camera';
import { buildHeightField } from './heightfield';
import { PLACES } from './layout';
import type { Foreground } from './foreground';
import type { MapPost } from './post';
import { roamPrefs } from './roam/prefs';
import type { MapRoam } from './roam/roam';
import type { Story } from './story/story';
import { createWeather } from './sky/weather';
import { CALM_WEATHER, DEFAULT_SETTINGS, type Lang, type MapContext, type MapFrame, type MapPart, type MapQuality, type MapSettings, type PlaceId } from './types';
import { loadingHero } from './ui/_loadHero';
import { LOAD_TEMPLE } from './ui/_loadTemple';
import { onLang, setLang, t } from './ui/lang';
import type { AnchorOnScreen, MapUI } from './ui/ui';

/**
 * World map screen — "Angkor Heritage: choose your next expedition".
 *
 * URL: `shot=1` headless still · `t=` seconds into the scene (shots) ·
 * `night=0‥1` time of day · `focus=<place>` camera on a place ·
 * `ui=0` no interface · `quality=low|medium|high` ·
 * `parts=terrain,water,…` build only these parts (checking one part) ·
 * `cam=x,y,z,tx,ty,tz` a fixed camera (m) instead of the overview ·
 * `lang=km|en` the interface's language (else the saved one; Khmer first) ·
 * `story=<n>` the story from beat n (1‥; shots: that beat), `story=0` never
 * (else it plays before the map on the first visit) ·
 * `loading=0‥1` hold the loading screen at that point, and build nothing.
 *
 * Every part is its own module, loaded on its own: a part that fails to
 * load or build is logged and left out, and the rest of the map still runs.
 */
const params = new URLSearchParams(location.search);
const shot = params.get('shot') === '1';
const quality = (['low', 'medium', 'high'].includes(params.get('quality') ?? '') ? params.get('quality') : 'medium') as MapQuality;
const placeIds = PLACES.map((p) => p.id);
const asPlace = (v: string | null) => (placeIds.includes(v as PlaceId) ? (v as PlaceId) : null);

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: shot });
renderer.setPixelRatio(Math.min(devicePixelRatio, shot ? 1 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFShadowMap;

const scene = new Scene();
const camera = new PerspectiveCamera(40, innerWidth / innerHeight, 0.5, 9000);

// ── Settings (gear button), kept between visits ─────────────────────────────
const SETTINGS_KEY = 'angkor-map-settings';
function loadSettings(): MapSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<MapSettings> & { sfx?: number };
    // (older visits kept one "effects" volume: it becomes the interface and the explorer's moves; the steps start quieter)
    if (typeof saved.sfx === 'number') {
      saved.ui ??= saved.sfx;
      saved.moves ??= saved.sfx;
      saved.steps ??= Math.min(DEFAULT_SETTINGS.steps, saved.sfx);
      delete saved.sfx;
    }
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
let settings = shot ? { ...DEFAULT_SETTINGS } : loadSettings();
if (params.has('easyfly')) settings.easyFly = params.get('easyfly') !== '0';
roamPrefs.easyFly = settings.easyFly;
if (['km', 'en'].includes(params.get('lang') ?? '')) settings.lang = params.get('lang') as Lang;
// The page's own words (tab title, loading screen) in that language (ui/lang.ts).
function pageWords(): void {
  document.title = t('title');
  for (const [sel, key] of [['#loading h1', 'title'], ['#loading p', 'loading']] as const) {
    const e = document.querySelector(sel);
    if (e) e.textContent = t(key);
  }
}
setLang(settings.lang);
pageWords();
onLang(pageWords);

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

const field = timed('land', buildHeightField);
const ctx: MapContext = { scene, renderer, camera, field, quality, shot };
const atmosphere: Atmosphere = await safe('atmosphere', async () => {
  const { buildAtmosphere } = await import('./atmosphere');
  return timed('atmosphere', () => buildAtmosphere(ctx));
}, () => {
  const key = new DirectionalLight(0xffffff, 2);
  key.position.set(300, 400, 200);
  const object = new Group().add(new HemisphereLight(0xffffff, 0x444444, 1), key);
  return { name: 'atmosphere', object, key, update: (f: MapFrame) => void f.lightDir.copy(key.position).normalize() };
});
const parts: MapPart[] = [atmosphere];

type Builder = (ctx: MapContext) => MapPart | Promise<MapPart>;
/** Parts in build order (landmarks and the road first: they mark the ground trees must keep off). */
const BUILDERS: [string, () => Promise<Builder>][] = [
  ['terrain', async () => (await import('./terrain')).buildTerrain],
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
  ['vegetation', async () => (await import('./vegetation')).buildVegetation],
  ['undergrowth', async () => (await import('./veg/undergrowth')).buildUndergrowth],
  ['clouds', async () => (await import('./clouds')).buildClouds],
  ['rain', async () => (await import('./sky/rain')).buildRain],
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
const only = params.get('parts')?.split(',');
// The loading screen follows the build (map.html): Angkor Wat rises row by row
// from its grey outline with light on the stones being laid, the bar fills block by block (20) and the explorer walks
// below it to the bar's end; a frame in between lets it paint.
const loading = document.getElementById('loading');
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
  requestAnimationFrame(() => ((window as unknown as { __ready: boolean }).__ready = true));
  await new Promise(() => undefined);
}
const nextFrame = () => (shot || document.hidden ? Promise.resolve() : new Promise<void>((r) => requestAnimationFrame(() => r())));
for (const [i, [name, load]] of BUILDERS.entries()) {
  showProgress((i + 1) / (BUILDERS.length + 1));
  await nextFrame();
  if (only && !only.includes(name)) continue;
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
scene.add(atmosphere.object);
// The land, trees, temples and road never move: they draw only the block sides that can face the camera.
for (const p of parts) if (['terrain', 'vegetation', 'path', 'jungle'].includes(p.name) || p.name.startsWith('landmark:')) skipBackFacets(p.object);
const post: MapPost = await safe('post', async () => (await import('./post')).createPost(ctx), () => ({ render: () => renderer.render(scene, camera), setSize() {} }));
const blocks = Object.fromEntries(parts.filter((p) => p.blocks).map((p) => [p.name, p.blocks!]));

// ── Camera, sound, interface ────────────────────────────────────────────────
const rig = new MapCameraRig(camera);
rig.calm = settings.calm;
const audio: MapAudio = await safe('audio', async () => (await import('./audio/audio')).createMapAudio(), () => ({ started: false, async start() {}, setVolumes() {}, play() {}, type() {}, duck() {}, roam() {}, call() {}, setWorld() {}, flight() {}, update() {} }));
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
    settings = s;
    rig.calm = s.calm;
    roamPrefs.easyFly = s.easyFly;
    audio.setVolumes(s);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch {
      /* private mode: settings last for this visit only */
    }
  },
  onSound: (s: Parameters<MapAudio['play']>[0]) => audio.play(s),
  onFirstGesture: () => void audio.start(),
  onStory: () => void openStory(0),
};
const ui: MapUI = await safe('ui', async () => (await import('./ui/ui')).createMapUI(uiRoot, PLACES, handlers, settings), () => ({ update() {}, setSelected() {}, setNight() {}, setRoaming() {}, setLang() {} }));

// ── Roaming: the explorer leaps off the ledge to walk, glide and paddle ────
const foreground = parts.find((p): p is Foreground => p.name === 'foreground' && 'explorer' in p);
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
  // Mini-map while roaming, and the big map (M): a part, so the frame loop draws it after the roaming.
  const minimap = await safe('minimap', async () => (await import('./ui/minimap')).createMinimap({ root: uiRoot, field, parts: [...parts], roam, sound: (s) => audio.play(s) }), () => null);
  if (minimap) parts.push(minimap);
}

addEventListener('pointermove', (e) => rig.setPointer((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1));
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  rig.fit();
  post.setSize(innerWidth, innerHeight);
});

// ── Time of day ─────────────────────────────────────────────────────────────
/** A full day↔night cycle in "cycle" mode (s). */
const CYCLE = 360;
/** `clock=` (checks): hold the day's cycle there (0 afternoon, 0.25 dusk, 0.5 night, 0.75 dawn). */
const clockParam = params.has('clock') ? (((Number(params.get('clock')) || 0) % 1) + 1) % 1 : null;
const nightOf = (c: number) => 0.5 - 0.5 * Math.cos(c * Math.PI * 2);
/** The clock on the dusk side for a time of day (0 afternoon … 0.5 night). */
const duskClock = (n: number) => Math.acos(1 - 2 * Math.min(1, Math.max(0, n))) / (Math.PI * 2);
/** Days since a new moon (6 Jan 2000) when the page opened, for the moon's phase (`day=` in shots, else 15 there: a full moon, as in the concept art). */
const DAY0 = shot ? Number(params.get('day') ?? 15) || 0 : Math.floor((Date.now() - Date.UTC(2000, 0, 6, 18, 14)) / 86_400_000);
/** The time of the year when the page opened (0 = Khmer New Year, mid-April), and how far it moves per day of `clock`. */
const SEASON0 = params.has('season') ? Number(params.get('season')) || 0 : shot ? 0.45 : (((Date.now() - Date.UTC(new Date().getUTCFullYear(), 3, 14)) / 86_400_000 / 365) % 1 + 1) % 1;
const SEASON_PER_DAY = params.has('season') || shot ? 0 : 1 / 24;
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
  if (settings.time === 'cycle') return nightOf(cycleDays % 1);
  return settings.time === 'night' ? 1 : 0;
}

// ── Frame ───────────────────────────────────────────────────────────────────
const fixedCam = params.get('cam')?.split(',').map(Number);
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

function step(t: number, dt: number): void {
  const cycling = clockParam === null && !params.has('night') && settings.time === 'cycle';
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
  frame.season = (((SEASON0 + (cycleDays - cycleDays0) * SEASON_PER_DAY) % 1) + 1) % 1;
  weather.update(frame);
  if (fixedCam) {
    camera.position.set(fixedCam[0], fixedCam[1], fixedCam[2]);
    camera.lookAt(fixedCam[3], fixedCam[4], fixedCam[5]);
  } else if (!roam?.active) rig.update(dt, t);
  // Roaming moves the explorer and the follow camera first: the other parts read the camera.
  runUpdate(roam, frame);
  camera.updateMatrixWorld();
  for (const p of parts) if (p !== roam) runUpdate(p, frame);
  projectAnchors();
  ui.update(anchors, dt);
  ui.setNight(night);
  audio.update(frame, selected);
  // (animal calls: heard where they are)
  for (const c of frame.calls) audio.call(c);
  frame.calls.length = 0;
}

// ── Tools: bug reports (B) and block look panel (K) ────────────────────────
const feedback = shot
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
        const q = new URLSearchParams(location.search);
        q.set('t', frame.t.toFixed(1));
        q.set('night', night.toFixed(2));
        // (the day's cycle, the moon, the season and the weather as they are now: dawn is not dusk, the balloon keeps its wind)
        q.set('clock', frame.clock.toFixed(3));
        q.set('day', String(frame.day));
        q.set('season', frame.season.toFixed(3));
        const w = frame.weather;
        for (const k of ['wind', 'cloud', 'rain', 'storm', 'rainbow', 'wet'] as const) if (w[k] > 0.005) q.set(k, w[k].toFixed(2));
        if (selected) q.set('focus', selected);
        for (const [k, v] of Object.entries(roam?.report()?.params ?? {})) q.set(k, v);
        return q;
      },
    });
if (!shot) installLookPanel({ viewAt: () => ({ camera, rect: canvas.getBoundingClientRect() }), pickables: () => parts.map((p) => p.object), scene, renderer });

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
async function openStory(from: number): Promise<void> {
  story ??= await safe<Story | null>(
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
          soundOn: () => audio.started,
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
  );
  story?.play(from);
}
const storyAt = Number(params.get('story') ?? 0);
let seenStory = false;
try {
  seenStory = localStorage.getItem(STORY_KEY) === '1';
} catch {
  /* no storage */
}
if (storyAt > 0 || (!shot && !seenStory && !focus && params.get('story') !== '0' && params.get('ui') !== '0')) await openStory(Math.max(0, storyAt - 1));

console.info(`[map] built in ${Object.entries(timings).map(([k, v]) => `${k} ${v}`).join(', ')} ms · blocks ${JSON.stringify(blocks)}${failed.length ? ` · FAILED: ${failed.join(', ')}` : ''}`);
Object.assign(window, { scene, camera, field, parts, rig, roam, audio, ui, renderer, __frame: frame, __mapStats: { timings, blocks, failed } });

/** Fade the loading screen out once the map is drawn (after the explorer's wave has begun). */
function hideLoading(): void {
  if (!loading) return;
  showProgress(1);
  if (shot) return loading.remove();
  setTimeout(() => loading.classList.add('done'), 700);
  setTimeout(() => loading.remove(), 1700);
}

// ── Resolution follows the frame rate ─────────────────────────────────────
/**
 * The pixel ratio steps down (to 1 at least) while frames come slower than
 * about 48 a second, and back up when they keep up with the screen: the
 * haze, mist, bloom and grading run on every pixel, so fewer pixels keep
 * the map smooth on any machine. A ratio that proved too slow is not tried
 * again for a minute (no see-sawing).
 */
const MAX_RATIO = renderer.getPixelRatio();
const res = { ratio: MAX_RATIO, ceiling: MAX_RATIO, time: 0, frames: 0, since: 0, ceilingAge: 0 };
function adaptResolution(dt: number): void {
  if (dt > 0.25) return; // (a hitch: a tab switch, a build)
  res.time += dt;
  res.frames++;
  res.since += dt;
  res.ceilingAge += dt;
  if (res.ceilingAge > 60) res.ceiling = MAX_RATIO;
  if (res.frames < 45 || res.since < 1.5) return;
  const avg = res.time / res.frames;
  res.time = res.frames = 0;
  let next = res.ratio;
  if (avg > 1 / 48 && res.ratio > 1) {
    res.ceiling = res.ratio - 0.25;
    res.ceilingAge = 0;
    next = Math.max(1, res.ratio - 0.25);
  } else if (avg < 1 / 57 && res.ratio < res.ceiling) next = Math.min(res.ceiling, res.ratio + 0.25);
  if (next === res.ratio) return;
  res.ratio = next;
  res.since = 0;
  renderer.setPixelRatio(next);
  renderer.setSize(innerWidth, innerHeight);
  post.setSize(innerWidth, innerHeight);
}
Object.assign(window, { __mapResolution: res });

if (shot) {
  document.body.classList.add('shot');
  hideLoading();
  const t = Number(params.get('t') ?? 12);
  step(t, 0);
  roam?.simulate(frame);
  // Let the scene settle (animated parts ease in), then render once.
  for (let i = 0; i < 30; i++) step(t, 1 / 60);
  step(t, 0);
  // (the interface's web fonts first, so shots don't show the fallback font)
  await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 4000))]);
  post.render(frame);
  requestAnimationFrame(() => ((window as unknown as { __ready: boolean }).__ready = true));
} else {
  // (the shaders compile side by side while the loading screen still shows, not one by one in the first frame; never waits long)
  const c0 = performance.now();
  await Promise.race([renderer.compileAsync(scene, camera).catch(() => undefined), new Promise((r) => setTimeout(r, 6000))]);
  console.info(`[map] shaders compiled in ${(performance.now() - c0).toFixed(0)} ms`);
  const t0 = performance.now();
  let last = t0;
  const tick = (now: number) => {
    const raw = Math.max(0, (now - last) / 1000);
    const dt = Math.min(0.05, raw);
    last = now;
    // (the first frame's time can come a hair before t0)
    if (!feedback?.active) step(Math.max(0, (now - t0) / 1000), dt);
    // (while the story hides the whole map, the map is not drawn: story/story.ts)
    const drawn = !story?.covered;
    if (now - t0 > 3000 && drawn) adaptResolution(raw);
    if (drawn) post.render(frame);
    for (const p of parts) p.afterRender?.();
    feedback?.update();
    if (first) {
      first = false;
      hideLoading();
    }
    requestAnimationFrame(tick);
  };
  let first = true;
  requestAnimationFrame(tick);
}
