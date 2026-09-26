import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type ToneMapping,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AngkorExplorer, OUTFITS, type OutfitName, type SelfieGesture } from '../character/AngkorExplorer';
import { ACTIONS, type ActionName } from '../character/clips';
import { EXPRESSIONS, type ExpressionName } from '../character/parts/face';
import { REST_U, restDuration, restPose, type RestState } from '../character/rest';
import { FeedbackTool } from '../feedback/FeedbackTool';
import { installLookPanel } from '../voxel/LookPanel';
import { CHARACTER_HEIGHT_M, RUN_SPEED, WALK_SPEED } from '../world/scale';
import type { VoxelQuality } from '../voxel/VoxelMesh';

/**
 * Character studio: turnaround, expressions, outfits and poses on a neutral
 * backdrop that mimics the reference sheet. Every state is URL-addressable so
 * scripts/screenshots.mjs can capture it, e.g.
 *   viewer.html?turnaround=1&shot=1
 *   viewer.html?view=45&expr=happy&outfit=withHat&anim=walk&t=0.4&shot=1
 *   viewer.html?view=30&anim=selfie&gesture=thumbsUp&saim=-30,10,1&t=1.2&shot=1
 *   viewer.html?view=90&anim=sleep&t=6&shot=1   (sit / lie / sleep: resting on the ground, character/rest.ts)
 */
const params = new URLSearchParams(location.search);
const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
const shot = params.get('shot') === '1';
if (shot) document.body.classList.add('shot');

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: shot });
renderer.setPixelRatio(Math.min(devicePixelRatio, shot ? 1 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = SRGBColorSpace;
const toneMaps: Record<string, ToneMapping> = { neutral: NeutralToneMapping, aces: ACESFilmicToneMapping, agx: AgXToneMapping };
renderer.toneMapping = toneMaps[params.get('tone') ?? 'neutral'] ?? NeutralToneMapping;
renderer.toneMappingExposure = num('exposure', 1.0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFShadowMap;

const scene = new Scene();
const bg = new Color(params.get('bg') ? `#${params.get('bg')}` : '#f4f0e9');
scene.background = bg;
const pmrem = new PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = num('env', 0.2);

// Studio lighting modelled on the sheet: warm key from front-left-top, cool fill, warm rim.
// (named for the block look panel's Lights folder)
const hemi = new HemisphereLight(0xfbf6f0, 0xbfb1a0, num('hemi', 0.62));
hemi.name = 'sky light';
scene.add(hemi);
const key = new DirectionalLight(0xffeedd, num('key', 3.1));
key.name = 'key light (sun, upper left)';
key.position.set(-2.2, 5.4, 3.8);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -3;
key.shadow.camera.right = 3;
key.shadow.camera.top = 3;
key.shadow.camera.bottom = -3;
key.shadow.camera.near = 0.5;
key.shadow.camera.far = 12;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.012;
key.shadow.radius = 4;
key.shadow.intensity = num('shadow', 0.6);
scene.add(key);
const fill = new DirectionalLight(0xe6ecff, num('fill', 0.85));
fill.name = 'fill light (cool, right)';
fill.position.set(1.2, 1.4, 4.0);
scene.add(fill);
const rim = new DirectionalLight(0xffd7a8, num('rim', 1.2));
rim.name = 'rim light (warm, behind)';
rim.position.set(1.0, 3.0, -4.0);
scene.add(rim);

const ground = new Mesh(new PlaneGeometry(60, 60), new ShadowMaterial({ opacity: 0.16 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
ground.visible = params.get('ground') !== '0';
scene.add(ground);

const camera = new PerspectiveCamera(num('fov', 22), innerWidth / innerHeight, 0.05, 200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = !shot;
controls.target.set(0, CHARACTER_HEIGHT_M * 0.5, 0);

// ── State ───────────────────────────────────────────────────────────────────
const quality = (params.get('quality') as VoxelQuality) ?? 'high';
let outfit = (params.get('outfit') as OutfitName) ?? 'default';
let expression = (params.get('expr') as ExpressionName) ?? 'neutral';
let anim = params.get('anim') ?? 'idle';
const turnaround = params.get('turnaround') === '1';
const TURN_SPACING = 1.05;
const TURN_LABELS = ['Front (0°)', 'Front-Left (45°)', 'Left (90°)', 'Back-Left (135°)', 'Back (180°)', 'Back-Right (225°)', 'Right (270°)', 'Front-Right (315°)'];
const explorers: AngkorExplorer[] = [];
const stage = new Group();
scene.add(stage);

function spawn(): void {
  for (const e of explorers) e.dispose();
  explorers.length = 0;
  const count = turnaround ? 8 : 1;
  const spacing = TURN_SPACING;
  for (let i = 0; i < count; i++) {
    const e = new AngkorExplorer({ quality, outfit, expression });
    e.blinking = !shot;
    // Selfie: the free hand's gesture, and the phone's place (yaw, pitch in degrees, reach 0‥1).
    if (params.has('gesture')) e.selfieGesture = params.get('gesture') as SelfieGesture;
    if (params.has('saim')) {
      const [yaw, pitch, reach = 1] = params.get('saim')!.split(',').map(Number);
      Object.assign(e.selfieAim, { yaw: (yaw * Math.PI) / 180, pitch: (pitch * Math.PI) / 180, reach });
    }
    e.object.position.x = turnaround ? (i - (count - 1) / 2) * spacing : 0;
    e.object.rotation.y = turnaround ? (i * Math.PI) / 4 : (num('view', 0) * Math.PI) / 180;
    stage.add(e.object);
    explorers.push(e);
  }
  applyAnim();
}

function speedFor(name: string): number {
  if (name === 'walk') return WALK_SPEED;
  if (name === 'run') return RUN_SPEED;
  return 0;
}

/** Resting on the ground (character/rest.ts): he sits down, lies down, or lies down and falls asleep 1 s later. */
const RESTS = ['sit', 'lie', 'sleep'] as const;
type RestAnim = (typeof RESTS)[number];

function applyAnim(): void {
  for (const e of explorers) {
    e.setMotion(speedFor(anim), anim !== 'jump', anim === 'jump' ? 1.5 : 0);
    if (anim in ACTIONS) e.play(anim as ActionName);
    else e.stop();
    rest(e, RESTS.includes(anim as RestAnim) ? (anim as RestAnim) : null);
  }
}

/**
 * Sit or lie him down from where he stands (the posture eases `u` there as
 * the map does), or stand him up at once. A shot without `t=` shows him
 * already down (and asleep); with `t=` the way down that far in.
 */
function rest(e: AngkorExplorer, kind: RestAnim | null): void {
  e.asleep = false;
  // (down he sits or lies behind where he stood: moved forward by his middle, so he stays in the middle of the view)
  const home = (e.object.userData.home ??= e.object.position.clone()) as Vector3;
  const ahead = kind === 'sit' ? 0.3 : kind ? 0.55 : 0;
  e.object.position.copy(home).add(new Vector3(Math.sin(e.object.rotation.y), 0, Math.cos(e.object.rotation.y)).multiplyScalar(ahead));
  if (!kind) {
    e.animator.posture = null;
    e.animator.postureFeet = true;
    return;
  }
  const to = kind === 'sit' ? REST_U.sit : REST_U.lie;
  const len = restDuration(REST_U.stand, to);
  const t0 = e.animator.time - (shot && !params.has('t') ? len + 4 : 0);
  const s: RestState = { u: 0, sleep: 0, t: 0, pack: e.currentOutfit.pack, knife: e.currentOutfit.legs === 'shorts' };
  const ease = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
  e.animator.postureFeet = false;
  e.animator.posture = (t) => {
    s.u = to * ease((t - t0) / len);
    s.t = t;
    s.pack = e.currentOutfit.pack;
    s.knife = e.currentOutfit.legs === 'shorts';
    s.sleep = kind === 'sleep' ? ease((t - t0 - len - 1) / 2.5) : 0;
    e.asleep = s.sleep > 0.3;
    return restPose(s);
  };
}

function frame(): void {
  const h = CHARACTER_HEIGHT_M;
  if (turnaround) {
    // Fit the row of eight figures to the viewport width (and height).
    camera.fov = 16;
    const rowHalf = (TURN_SPACING * 7) / 2 + 0.6;
    const tanV = Math.tan((camera.fov * Math.PI) / 360);
    const tanH = tanV * camera.aspect;
    const dist = Math.max(rowHalf / tanH, (h * 0.75) / tanV);
    camera.position.set(0, h * 0.58, dist);
    controls.target.set(0, h * 0.5, 0);
  } else {
    const zoom = params.get('zoom') ?? 'full';
    // (sitting or lying he is low: the view comes down with him)
    const low = RESTS.includes(anim as RestAnim);
    const targetY = num('ty', zoom === 'head' ? h * (low ? 0.4 : 0.78) : zoom === 'torso' ? h * 0.55 : zoom === 'feet' ? h * 0.14 : h * (low ? 0.28 : 0.5));
    const dist = num('dist', zoom === 'full' ? 5.6 : 2.2);
    const elev = (num('elev', 8) * Math.PI) / 180;
    const azim = (num('azim', 0) * Math.PI) / 180;
    const tx = num('tx', 0);
    camera.position.set(tx + Math.sin(azim) * Math.cos(elev) * dist, targetY + Math.sin(elev) * dist, Math.cos(azim) * Math.cos(elev) * dist);
    controls.target.set(tx, targetY, 0);
  }
  camera.updateProjectionMatrix();
  controls.update();
}

// Simulate deterministically up to `t` seconds for screenshots.
function settle(t: number): void {
  const steps = Math.round(t * 60);
  for (let i = 0; i < steps; i++) for (const e of explorers) e.update(1 / 60);
  for (const e of explorers) e.update(0);
}

spawn();
frame();
settle(num('t', shot ? 0.5 : 0));

// ── UI ──────────────────────────────────────────────────────────────────────
const panel = document.getElementById('panel')!;
const caption = document.getElementById('caption')!;
caption.textContent = `Angkor Heritage · Explorer · ${CHARACTER_HEIGHT_M.toFixed(2)} m tall`;

function chipGroup<T extends string>(title: string, items: readonly T[], current: () => T, pick: (v: T) => void, label: (v: T) => string = (v) => v): void {
  const h = document.createElement('h2');
  h.textContent = title;
  const wrap = document.createElement('div');
  wrap.className = 'chips';
  const buttons = items.map((v) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label(v);
    b.onclick = () => {
      pick(v);
      buttons.forEach((x, i) => x.setAttribute('aria-pressed', String(items[i] === current())));
    };
    b.setAttribute('aria-pressed', String(v === current()));
    return b;
  });
  wrap.append(...buttons);
  panel.append(h, wrap);
}

if (!shot) {
  panel.innerHTML = `<h1>Angkor Heritage Explorer</h1><p class="sub">Voxel character · ${CHARACTER_HEIGHT_M.toFixed(2)} m · drag to orbit · B to report a bug · K for block look</p>`;
  const pretty = (s: string) => s.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
  chipGroup('Outfit', Object.keys(OUTFITS) as OutfitName[], () => outfit, (v) => {
    outfit = v;
    for (const e of explorers) e.setOutfit(v);
  }, pretty);
  chipGroup('Expression', EXPRESSIONS, () => expression, (v) => {
    expression = v;
    for (const e of explorers) e.setExpression(v);
  }, pretty);
  const anims = ['idle', 'walk', 'run', 'jump', ...Object.keys(ACTIONS), ...RESTS];
  chipGroup('Animation', anims, () => anim, (v) => {
    anim = v;
    applyAnim();
    frame();
  }, pretty);
  const views: [string, number][] = [['Front', 0], ['Front-L', 45], ['Left', 90], ['Back', 180], ['Right', 270], ['Front-R', 315]];
  const h = document.createElement('h2');
  h.textContent = 'View';
  const wrap = document.createElement('div');
  wrap.className = 'chips';
  for (const [name, deg] of views) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = name;
    b.onclick = () => {
      if (turnaround) return;
      explorers[0].object.rotation.y = (deg * Math.PI) / 180;
      frame();
    };
    wrap.append(b);
  }
  const t = document.createElement('button');
  t.type = 'button';
  t.textContent = turnaround ? 'Single view' : 'Turnaround ×8';
  t.onclick = () => {
    params.set('turnaround', turnaround ? '0' : '1');
    location.search = params.toString();
  };
  wrap.append(t);
  panel.append(h, wrap);
}

// Sheet-style labels under each turnaround figure.
const labels: HTMLDivElement[] = [];
if (turnaround) {
  for (let i = 0; i < 8; i++) {
    const d = document.createElement('div');
    d.className = 'turn-label';
    d.textContent = `${i + 1}. ${TURN_LABELS[i]}`;
    document.body.append(d);
    labels.push(d);
  }
}
const _lp = new Vector3();
function placeLabels(): void {
  explorers.forEach((e, i) => {
    if (!labels[i]) return;
    _lp.copy(e.object.position).setY(-0.08).project(camera);
    labels[i].style.left = `${((_lp.x + 1) / 2) * innerWidth}px`;
    labels[i].style.top = `${((1 - _lp.y) / 2) * innerHeight}px`;
  });
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  frame();
});

// ── Bug reports (B): pause, click what's wrong, save to feedback/ ───────────
const deg = (rad: number) => (rad * 180) / Math.PI;
const feedback = shot
  ? null
  : new FeedbackTool({
      renderer,
      scene,
      camera,
      pickables: () => explorers.map((e) => e.object),
      state: () => {
        const a = explorers[0]?.animator;
        const d = camera.position.clone().sub(controls.target);
        return {
          Character: `outfit ${outfit} · expression ${expression} · animation ${anim}${a?.currentAction ? ` (${a.actionTime.toFixed(2)} s in)` : ''} · quality ${quality}${turnaround ? ' · turnaround ×8' : ''}`,
          Camera: `${d.length().toFixed(2)} m from (${controls.target.x.toFixed(2)}, ${controls.target.y.toFixed(2)}, ${controls.target.z.toFixed(2)}) · azimuth ${deg(Math.atan2(d.x, d.z)).toFixed(0)}° · elevation ${deg(Math.asin(d.y / d.length())).toFixed(0)}° · fov ${camera.fov}°`,
        };
      },
      repro: () => {
        const q = new URLSearchParams(location.search);
        q.delete('shot');
        q.set('outfit', outfit);
        q.set('expr', expression);
        q.set('anim', anim);
        const a = explorers[0]?.animator;
        if (a) q.set('t', (a.currentAction ? a.actionTime : a.time).toFixed(2));
        if (!turnaround) {
          const d = camera.position.clone().sub(controls.target);
          q.delete('zoom'); // ty + dist below pin the framing instead
          q.set('view', deg(explorers[0].object.rotation.y).toFixed(0));
          q.set('azim', deg(Math.atan2(d.x, d.z)).toFixed(1));
          q.set('elev', deg(Math.asin(d.y / d.length())).toFixed(1));
          q.set('dist', d.length().toFixed(2));
          q.set('tx', controls.target.x.toFixed(3));
          q.set('ty', controls.target.y.toFixed(3));
        }
        return q;
      },
    });

// ── Block look panel (K): tweak every block family's shading live ──────────
if (!shot)
  installLookPanel({
    viewAt: () => ({ camera, rect: canvas.getBoundingClientRect() }),
    pickables: () => explorers.map((e) => e.object),
    scene,
    renderer,
    lightsFile: 'src/viewer/main.ts',
    // (the side panel holds the top right; Report is top left)
    place: { top: '52px', left: '12px', right: 'auto', maxHeight: 'calc(100% - 64px)' },
  });

let last = performance.now();
function tick(now: number): void {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); // (the first rAF time can predate `last`)
  last = now;
  if (!feedback?.active) for (const e of explorers) e.update(dt); // frozen while reporting
  controls.update();
  renderer.render(scene, camera);
  placeLabels();
  feedback?.update();
  requestAnimationFrame(tick);
}
if (shot) {
  // Screenshot mode: one deterministic frame, no loop (software GL is slow).
  controls.update();
  renderer.render(scene, camera);
  placeLabels();
  (window as unknown as { __ready: boolean }).__ready = true;
} else requestAnimationFrame(tick);

// Handy for debugging from the console.
Object.assign(window, { explorers, scene, camera, renderer, Vector3, feedback });
