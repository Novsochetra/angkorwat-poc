import {
  BackSide,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { AngkorExplorer, OUTFITS, type ExplorerOutfit, type OutfitName } from '../character/AngkorExplorer';
import { ACTIONS, type ActionName } from '../character/clips';
import { EXPRESSIONS, type ExpressionName } from '../character/parts/face';
import { FeedbackTool } from '../feedback/FeedbackTool';
import { installLookPanel } from '../voxel/LookPanel';
import { ANGKOR, CHARACTER_HEIGHT_M, RUN_SPEED, WALK_SPEED } from '../world/scale';
import { Input } from './Input';
import { PlayerController } from './PlayerController';
import { buildAngkorScaleWorld } from './world/AngkorScaleWorld';
import type { KitLabel } from './world/KitWorld';

/**
 * Angkor Quest — real-scale test level. Walk the explorer across the western
 * causeway, through the gopura's 3.4 m doorway and up to the 65 m central tower
 * to judge the character against the map at true size (1 unit = 1 m).
 * `?level=kit` loads the world-kit specimen garden instead (sections 18–20).
 */
const params = new URLSearchParams(location.search);
const level = params.get('level') === 'kit' ? 'kit' : 'angkor';
const shot = params.get('shot') === '1';
const test = params.get('test') === '1';
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: shot });
renderer.setPixelRatio(Math.min(devicePixelRatio, shot ? 1 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFShadowMap;

const scene = new Scene();
const camera = new PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 4000);

// ── Sky + fog ───────────────────────────────────────────────────────────────
const skyUniforms = { top: { value: new Color(0x7fb2dc) }, horizon: { value: new Color(0xf1e2c6) }, bottom: { value: new Color(0xd9c9a8) } };
const sky = new Mesh(
  new SphereGeometry(3000, 32, 16),
  new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: skyUniforms,
    vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vDir;
      void main(){ float h = vDir.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(min(1.0, h * 2.2), 0.7)) : mix(horizon, bottom, min(1.0, -h * 6.0)); gl_FragColor = vec4(c, 1.0); }`,
  }),
);
sky.renderOrder = -1;
scene.add(sky);
scene.fog = new Fog(0xe6dcc6, 260, 1900);

// ── Lights: warm afternoon sun from the west-southwest ─────────────────────
const hemi = new HemisphereLight(0xdfeaff, 0x8a7a55, 1.1);
scene.add(hemi);
const sun = new DirectionalLight(0xffe7c8, 3.0);
const sunDir = new Vector3(-0.55, 0.62, 0.35).normalize();
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const S = 26;
Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 260 });
// Soft shadows on the 0.5 m masonry: 2.5 cm texels blurred over two (a ~5 cm
// penumbra), offsets of about a texel (in metres, so the 260 m depth range
// doesn't inflate them into gaps under stones), and a quarter of the sun kept
// in shadow, so shaded stone keeps its colour under the cool sky.
const SUN_TEXEL = (2 * S) / 2048;
sun.shadow.radius = 2;
sun.shadow.normalBias = SUN_TEXEL;
sun.shadow.bias = -SUN_TEXEL / (260 - 1);
sun.shadow.intensity = 0.75;
scene.add(sun, sun.target);
// The shadow camera's axes across the light (it looks down −sunDir, +y up).
const sunX = new Vector3().crossVectors(new Vector3(0, 1, 0), sunDir).normalize();
const sunY = new Vector3().crossVectors(sunDir, sunX);

// ── World + explorer ────────────────────────────────────────────────────────
const t0 = performance.now();
// (the kit level loads on demand, so the main level doesn't pull in every kit asset)
const world = level === 'kit' ? await (await import('./world/KitWorld')).buildKitWorld('medium') : buildAngkorScaleWorld('medium');
const labels: KitLabel[] = 'labels' in world ? (world.labels as KitLabel[]) : [];
scene.add(world.root);
const buildMs = performance.now() - t0;

let outfit: OutfitName = (params.get('outfit') as OutfitName) ?? 'default';
const explorer = new AngkorExplorer({ quality: 'medium', outfit });
explorer.blinking = !shot;
scene.add(explorer.object);

const pad = document.getElementById('pad') ?? undefined;
const input = new Input(canvas, pad);
const player = new PlayerController(explorer, world.colliders, camera, input);
player.floor = world.baseGround;
let spawnIndex = Number(params.get('spawn') ?? 0);
const spawn = (i: number) => {
  spawnIndex = (i + world.spawns.length) % world.spawns.length;
  const s = world.spawns[spawnIndex];
  player.teleport(s.x, s.y, s.z, s.yaw);
  toast(s.name);
};

// Doorways the explorer can "open" with E.
const doors = [new Vector3(-522.5, 1.5, 0), new Vector3(-94.5, 3.5, 0), new Vector3(-51, 10.5, 0), new Vector3(-38.5, 23.5, 0)];

// ── HUD ─────────────────────────────────────────────────────────────────────
const hud = document.getElementById('hud')!;
const toastEl = document.getElementById('toast')!;
let toastTimer = 0;
function toast(msg: string): void {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  toastTimer = 2.2;
}

let dusk = false;
function setDusk(on: boolean): void {
  dusk = on;
  sun.intensity = on ? 0.35 : 3.0;
  sun.color.set(on ? 0xff9e6b : 0xffe7c8);
  hemi.intensity = on ? 0.22 : 1.1;
  hemi.color.set(on ? 0x6c7aa8 : 0xdfeaff);
  skyUniforms.top.value.set(on ? 0x1d2747 : 0x7fb2dc);
  skyUniforms.horizon.value.set(on ? 0xd9875a : 0xf1e2c6);
  (scene.fog as Fog).color.set(on ? 0x5a4a55 : 0xe6dcc6);
  explorer.propLightBoost = on ? 6 : 1;
  toast(on ? 'Dusk — try the lantern (L) or torch (T)' : 'Afternoon');
}

let expr = 0;
function onKeys(): void {
  for (let i = 0; i < Math.min(9, world.spawns.length); i++) if (input.hit(`Digit${i + 1}`)) spawn(i);
  // [ ] step through every spawn (the kit level has more than nine).
  if (input.hit('BracketRight')) spawn(spawnIndex + 1);
  if (input.hit('BracketLeft')) spawn(spawnIndex - 1);
  if (input.hit('KeyE')) {
    const near = doors.some((d) => d.distanceTo(player.position) < 3.2);
    explorer.play(near ? 'openDoor' : 'interact');
  }
  if (input.hit('KeyF')) explorer.play('wave');
  if (input.hit('KeyC')) explorer.play('cheer');
  if (input.hit('KeyU')) explorer.currentAction === 'lookUp' ? explorer.stop('lookUp') : explorer.play('lookUp');
  if (input.hit('KeyP')) explorer.currentAction === 'peek' ? explorer.stop('peek') : explorer.play('peek');
  if (input.hit('KeyL')) explorer.setOutfit({ held: explorer.currentOutfit.held === 'lantern' ? 'none' : 'lantern' });
  if (input.hit('KeyT')) explorer.setOutfit({ held: explorer.currentOutfit.held === 'torch' ? 'none' : 'torch' });
  if (input.hit('KeyH')) explorer.setOutfit({ hat: !explorer.currentOutfit.hat });
  if (input.hit('KeyG')) {
    const names = Object.keys(OUTFITS) as OutfitName[];
    outfit = names[(names.indexOf(outfit) + 1) % names.length];
    explorer.setOutfit(outfit);
    toast(`Outfit: ${outfit}`);
  }
  if (input.hit('KeyX')) {
    expr = (expr + 1) % EXPRESSIONS.length;
    explorer.setExpression(EXPRESSIONS[expr]);
    toast(`Expression: ${EXPRESSIONS[expr]}`);
  }
  if (input.hit('KeyN')) setDusk(!dusk);
  if (input.hit('KeyV')) {
    player.overview = !player.overview;
    player.camDist = player.overview ? 60 : 5.5;
    toast(player.overview ? 'Overview camera' : 'Follow camera');
  }
}

/** The kit level's nearest labelled asset or scene (within 14 m). */
function nearestLabel(): KitLabel | null {
  const p = player.position;
  let best: KitLabel | null = null;
  let bd = 14;
  for (const l of labels) {
    const d = Math.hypot(l.x - p.x, l.z - p.z);
    if (d < bd) [best, bd] = [l, d];
  }
  return best;
}

function renderHud(fps: number): void {
  const p = player.position;
  const dCentre = Math.hypot(p.x, p.z);
  const sp = Math.hypot(player.velocity.x, player.velocity.z);
  const near = level === 'kit' ? nearestLabel() : null;
  const title =
    level === 'kit'
      ? `<div class="title">Angkor Quest · world kit (sections 18–20)</div>
    Explorer <b>${CHARACTER_HEIGHT_M.toFixed(2)} m</b> · ${near ? `near <b>${near.name}</b> — ${near.detail}` : 'walk up to an asset to see its name and size'}<br>
    ${sp.toFixed(1)} m/s · (${p.x.toFixed(0)}, ${p.z.toFixed(0)}) · y ${p.y.toFixed(2)} m · ${fps.toFixed(0)} fps<br>`
      : `<div class="title">Angkor Quest · scale test</div>
    Explorer <b>${CHARACTER_HEIGHT_M.toFixed(2)} m</b> · doorway <b>${ANGKOR.doorwayHeight} m</b> · causeway <b>${ANGKOR.causewayWidth} m</b> wide · central tower <b>${ANGKOR.centralTowerHeight} m</b><br>
    ${sp.toFixed(1)} m/s · ${dCentre.toFixed(0)} m to the central tower · y ${p.y.toFixed(2)} m · ${fps.toFixed(0)} fps<br>`;
  hud.innerHTML = `${title}
    <kbd>WASD</kbd> move <kbd>Shift</kbd> run <kbd>Space</kbd> jump · drag / <kbd>Q</kbd><kbd>R</kbd> orbit · wheel zoom<br>
    <kbd>E</kbd> interact / open door <kbd>F</kbd> wave <kbd>C</kbd> cheer <kbd>U</kbd> look up <kbd>P</kbd> peek<br>
    <kbd>L</kbd> lantern <kbd>T</kbd> torch <kbd>H</kbd> hat <kbd>G</kbd> outfit <kbd>X</kbd> face <kbd>N</kbd> dusk <kbd>V</kbd> overview <kbd>K</kbd> block look<br>
    <kbd>1</kbd>–<kbd>${Math.min(9, world.spawns.length)}</kbd> ${level === 'kit' ? `${world.spawns.slice(0, 9).map((s) => s.name.replace(/^(Garden|Scene): /, '')).join(' · ')} · <kbd>[</kbd><kbd>]</kbd> all ${world.spawns.length} spots` : 'causeway · gopura · temple stairs · Bakan'} · <kbd>B</kbd> report a bug`;
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// ── Bug reports (B): pause, click what's wrong, save to feedback/ ───────────
/** Degrees in [−180, 180). */
const deg = (rad: number) => {
  const d = (rad * 180) / Math.PI;
  return d - 360 * Math.round(d / 360);
};
const feedback = shot || test
  ? null
  : new FeedbackTool({
      renderer,
      scene,
      camera,
      pickables: () => [world.root, explorer.object],
      colliders: world.colliders,
      anchor: () => player.position,
      state: () => {
        const p = player.position;
        const o = explorer.currentOutfit;
        const action = explorer.currentAction;
        return {
          Explorer: `(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) m · facing ${deg(player.yaw).toFixed(0)}° · ${player.grounded ? 'on the ground' : 'in the air'} · ${Math.hypot(player.velocity.x, player.velocity.z).toFixed(2)} m/s · ${Math.hypot(p.x, p.z).toFixed(0)} m from the central tower`,
          Action: action ? `${action}, ${explorer.animator.actionTime.toFixed(2)} s in` : 'none',
          Camera: `${player.overview ? 'overview' : 'follow'} · ${deg(player.camYaw - player.yaw - Math.PI).toFixed(0)}° round from behind · pitch ${deg(player.camPitch).toFixed(0)}° · ${player.camDist.toFixed(1)} m`,
          Look: `outfit ${outfit} (hat ${o.hat ? 'on' : 'off'}, holding ${o.held}) · expression ${explorer.currentExpression} · ${dusk ? 'dusk' : 'afternoon'}`,
          World: `${world.stats.instances} voxel blocks · ${world.colliders.boxes.length} colliders · built in ${buildMs.toFixed(0)} ms`,
        };
      },
      // Everything the URL params below need to put the explorer and camera back here.
      repro: () => {
        const q = new URLSearchParams(location.search);
        for (const k of ['spawn', 'shot', 'test', 'at', 'cam', 'hat', 'held', 'expr', 'dusk', 'overview', 'dist', 'anim', 'action', 't']) q.delete(k);
        const p = player.position;
        const o = explorer.currentOutfit;
        const speed = Math.hypot(player.velocity.x, player.velocity.z);
        q.set('at', `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)},${deg(player.yaw).toFixed(1)}`);
        q.set('cam', `${deg(player.camYaw - player.yaw - Math.PI).toFixed(1)},${deg(player.camPitch).toFixed(1)},${player.camDist.toFixed(2)}`);
        q.set('outfit', outfit);
        if (o.hat !== OUTFITS[outfit].hat) q.set('hat', o.hat ? '1' : '0');
        if (o.held !== OUTFITS[outfit].held) q.set('held', o.held);
        if (explorer.currentExpression !== 'neutral') q.set('expr', explorer.currentExpression);
        if (dusk) q.set('dusk', '1');
        if (player.overview) {
          q.set('overview', '1');
          q.set('dist', player.camDist.toFixed(1));
        }
        if (speed > 0.5) q.set('anim', speed > (WALK_SPEED + RUN_SPEED) / 2 ? 'run' : 'walk');
        if (explorer.currentAction) {
          q.set('action', explorer.currentAction);
          q.set('t', explorer.animator.actionTime.toFixed(2));
        }
        return q;
      },
    });

// ── Block look panel (K): tweak every block family's shading live ──────────
if (!test)
  installLookPanel({
    viewAt: () => ({ camera, rect: canvas.getBoundingClientRect() }),
    pickables: () => [world.root, explorer.object],
  });

// ── Loop ────────────────────────────────────────────────────────────────────
if (params.has('at')) {
  // An exact spot (e.g. from a bug report): x,y,z in metres, facing in degrees (0 = +Z, default 90 = toward the temple).
  const [x, y, z, yaw = 90] = params.get('at')!.split(',').map(Number);
  player.teleport(x, y, z, (yaw * Math.PI) / 180);
} else spawn(spawnIndex);
if (params.has('cam')) {
  const [yaw, pitch, dist] = params.get('cam')!.split(',').map(Number);
  player.camYaw = player.yaw + Math.PI + (yaw * Math.PI) / 180;
  player.camPitch = (pitch * Math.PI) / 180;
  player.camDist = dist;
}
if (params.get('dusk') === '1') setDusk(true);
if (params.get('held')) explorer.setOutfit({ held: params.get('held') as ExplorerOutfit['held'] });
if (params.has('hat')) explorer.setOutfit({ hat: params.get('hat') === '1' });
if (EXPRESSIONS.includes(params.get('expr') as ExpressionName)) {
  expr = EXPRESSIONS.indexOf(params.get('expr') as ExpressionName);
  explorer.setExpression(EXPRESSIONS[expr]);
}
if (params.get('overview') === '1') {
  player.overview = true;
  player.camDist = Number(params.get('dist') ?? 70);
}

const _sunAt = new Vector3();
function followSun(): void {
  // Move the shadow map in whole texels, so shadow edges don't crawl as the player walks.
  const p = player.position;
  const u = p.dot(sunX);
  const v = p.dot(sunY);
  _sunAt.copy(p).addScaledVector(sunX, Math.round(u / SUN_TEXEL) * SUN_TEXEL - u).addScaledVector(sunY, Math.round(v / SUN_TEXEL) * SUN_TEXEL - v);
  sun.target.position.copy(_sunAt);
  sun.position.copy(_sunAt).addScaledVector(sunDir, 120);
  sky.position.copy(camera.position);
}

let last = performance.now();
let fpsAcc = 0;
let fpsFrames = 0;
let fps = 60;
function tick(now: number): void {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); // (the first rAF time can predate `last`)
  last = now;
  if (feedback?.active) player.look(dt); // frozen for a bug report; the camera still turns
  else {
    onKeys();
    player.update(dt);
    explorer.update(dt);
  }
  followSun();
  renderer.render(scene, camera);
  feedback?.update();
  input.endFrame();
  fpsAcc += dt;
  fpsFrames++;
  if (fpsAcc > 0.5) {
    fps = fpsFrames / fpsAcc;
    fpsAcc = fpsFrames = 0;
    renderHud(fps);
  }
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) toastEl.classList.remove('show');
  requestAnimationFrame(tick);
}

if (test) {
  // Deterministic stepping for scripts/playtest.mjs (no rAF loop, no rendering).
  Object.assign(window, {
    __step: (dt: number) => {
      onKeys();
      player.update(dt);
      explorer.update(dt);
      input.endFrame();
    },
    __spawn: (i: number) => spawn(i),
  });
} else if (shot) {
  document.body.classList.add('shot');
  // Deterministic warm-up for screenshots: settle animation + camera (then play
  // `action` for `t` seconds), render once.
  const anim = params.get('anim');
  const speed = anim === 'run' ? RUN_SPEED : anim === 'walk' ? WALK_SPEED : 0;
  const settle = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      player.update(1 / 60);
      if (speed) explorer.setMotion(speed, true, 0);
      explorer.update(1 / 60);
    }
  };
  settle(1);
  const action = params.get('action') as ActionName | null;
  if (action && action in ACTIONS) {
    explorer.play(action);
    settle(Number(params.get('t') ?? 0.5));
  }
  followSun();
  renderer.render(scene, camera);
  (window as unknown as { __ready: boolean }).__ready = true;
} else {
  renderHud(60);
  requestAnimationFrame(tick);
}

console.info(`[angkor] world built in ${buildMs.toFixed(0)} ms, ${world.stats.instances} voxel instances, ${world.colliders.boxes.length} colliders`);
Object.assign(window, { scene, camera, player, explorer, world, renderer, feedback });
