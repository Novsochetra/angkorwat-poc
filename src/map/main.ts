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
import type { MapRoam } from './roam/roam';
import { DEFAULT_SETTINGS, type MapContext, type MapFrame, type MapPart, type MapQuality, type MapSettings, type PlaceId } from './types';
import type { AnchorOnScreen, MapUI } from './ui/ui';

/**
 * World map screen — "Highland Journey: choose your next expedition".
 *
 * URL: `shot=1` headless still · `t=` seconds into the scene (shots) ·
 * `night=0‥1` time of day · `focus=<place>` camera on a place ·
 * `ui=0` no interface · `quality=low|medium|high` ·
 * `parts=terrain,water,…` build only these parts (checking one part) ·
 * `cam=x,y,z,tx,ty,tz` a fixed camera (m) instead of the overview.
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
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
let settings = shot ? { ...DEFAULT_SETTINGS } : loadSettings();

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
  ['water', async () => (await import('./water')).buildWater],
  ['vegetation', async () => (await import('./vegetation')).buildVegetation],
  ['clouds', async () => (await import('./clouds')).buildClouds],
  ['life', async () => (await import('./life')).buildLife],
  ['fauna', async () => (await import('./fauna/land')).buildLandFauna],
  ['wildlife', async () => (await import('./fauna/waterAir')).buildWaterAirFauna],
  ['foreground', async () => (await import('./foreground')).buildForeground],
];
const only = params.get('parts')?.split(',');
// The loading screen's bar follows the build; a frame in between lets it paint.
const loading = document.getElementById('loading');
const bar = loading?.querySelector<HTMLElement>('.bar span');
const nextFrame = () => (shot || document.hidden ? Promise.resolve() : new Promise<void>((r) => requestAnimationFrame(() => r())));
for (const [i, [name, load]] of BUILDERS.entries()) {
  if (bar) bar.style.width = `${Math.round(((i + 1) / (BUILDERS.length + 1)) * 100)}%`;
  await nextFrame();
  if (only && !only.includes(name)) continue;
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
for (const p of parts) if (['terrain', 'vegetation', 'path'].includes(p.name) || p.name.startsWith('landmark:')) skipBackFacets(p.object);
const post: MapPost = await safe('post', async () => (await import('./post')).createPost(ctx), () => ({ render: () => renderer.render(scene, camera), setSize() {} }));
const blocks = Object.fromEntries(parts.filter((p) => p.blocks).map((p) => [p.name, p.blocks!]));

// ── Camera, sound, interface ────────────────────────────────────────────────
const rig = new MapCameraRig(camera);
rig.calm = settings.calm;
const audio: MapAudio = await safe('audio', async () => (await import('./audio/audio')).createMapAudio(), () => ({ started: false, async start() {}, setVolumes() {}, play() {}, roam() {}, call() {}, setWorld() {}, flight() {}, update() {} }));
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
    audio.setVolumes(s);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch {
      /* private mode: settings last for this visit only */
    }
  },
  onSound: (s: Parameters<MapAudio['play']>[0]) => audio.play(s),
  onFirstGesture: () => void audio.start(),
};
const ui: MapUI = await safe('ui', async () => (await import('./ui/ui')).createMapUI(uiRoot, PLACES, handlers, settings), () => ({ update() {}, setSelected() {}, setNight() {}, setRoaming() {} }));

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
let night = params.has('night') ? Number(params.get('night')) : settings.time === 'night' ? 1 : 0;
function nightTarget(t: number): number {
  if (params.has('night')) return Number(params.get('night'));
  if (settings.time === 'cycle') return 0.5 - 0.5 * Math.cos((t / CYCLE) * Math.PI * 2);
  return settings.time === 'night' ? 1 : 0;
}

// ── Frame ───────────────────────────────────────────────────────────────────
const fixedCam = params.get('cam')?.split(',').map(Number);
const frame: MapFrame = { t: 0, dt: 0, drift: 0, night, camera, lightDir: new Vector3(0, 1, 0), listener: new Vector3(), roam: 'overview', roamLevels: { wind: 0, wake: 0 }, calls: [] };
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

function step(t: number, dt: number): void {
  const target = nightTarget(t);
  // Ease towards the time of day (a few seconds for a switch).
  night += (target - night) * (dt > 0 ? 1 - Math.exp(-dt * 0.8) : 1);
  frame.t = t;
  frame.dt = dt;
  frame.drift = shot ? t : frame.drift + (settings.calm ? 0 : dt);
  frame.night = night;
  if (fixedCam) {
    camera.position.set(fixedCam[0], fixedCam[1], fixedCam[2]);
    camera.lookAt(fixedCam[3], fixedCam[4], fixedCam[5]);
  } else if (!roam?.active) rig.update(dt, t);
  // Roaming moves the explorer and the follow camera first: the other parts read the camera.
  roam?.update?.(frame);
  camera.updateMatrixWorld();
  for (const p of parts) if (p !== roam) p.update?.(frame);
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
console.info(`[map] built in ${Object.entries(timings).map(([k, v]) => `${k} ${v}`).join(', ')} ms · blocks ${JSON.stringify(blocks)}${failed.length ? ` · FAILED: ${failed.join(', ')}` : ''}`);
Object.assign(window, { scene, camera, field, parts, rig, roam, audio, ui, renderer, __mapStats: { timings, blocks, failed } });

/** Fade the loading screen out once the map is drawn. */
function hideLoading(): void {
  if (!loading) return;
  if (bar) bar.style.width = '100%';
  if (shot) return loading.remove();
  loading.classList.add('done');
  setTimeout(() => loading.remove(), 1000);
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
  const t0 = performance.now();
  let last = t0;
  const tick = (now: number) => {
    const raw = Math.max(0, (now - last) / 1000);
    const dt = Math.min(0.05, raw);
    last = now;
    if (!feedback?.active) step((now - t0) / 1000, dt);
    if (now - t0 > 3000) adaptResolution(raw);
    post.render(frame);
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
