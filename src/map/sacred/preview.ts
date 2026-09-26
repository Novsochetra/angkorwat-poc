import {
  CircleGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from 'three';
import { SACRED_LAMPS, updateSacredLights } from './finish';
import { PIECES } from './pieces';

/**
 * A quick look at one sacred piece (a statue, a gable, an altar) without
 * building the map: `sacred.html?piece=<name>` (names in pieces.ts), in the
 * map's light and tone. For checks:
 *
 *   npm run shots -- b="@sacred.html?piece=buddha-earth&yaw=20"
 *
 * Params: `piece` (or `pieces=a,b` side by side), `yaw` / `pitch` (deg) and
 * `dist` (m) of the camera round the piece, `ty` the height it looks at
 * (share of the piece's height, default 0.5), `fov`, `night=0‥1` (the sun
 * down, the lamps up), `bg` (hex), `sun=<deg>` the sun's bearing.
 */

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
const names = (q.get('pieces') ?? q.get('piece') ?? Object.keys(PIECES)[0]).split(',');
const night = num('night', 0);

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFShadowMap;

const scene = new Scene();
scene.background = new Color(q.get('bg') ? Number('0x' + q.get('bg')) : night > 0.5 ? 0x14161f : 0x8a7f70);
const fill = new HemisphereLight(0xfff2dc, 0x3a2c22, 1 - 0.8 * night);
const sun = new DirectionalLight(0xffe2b8, 3 * (1 - 0.9 * night));
const sunYaw = (num('sun', 35) * Math.PI) / 180;
sun.position.set(Math.sin(sunYaw) * 10, 12, Math.cos(sunYaw) * 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -6;
sun.shadow.camera.right = sun.shadow.camera.top = 6;
sun.shadow.bias = -0.0002;
sun.shadow.normalBias = 0.02;
scene.add(fill, sun);
const floor = new Mesh(new CircleGeometry(12, 48), new MeshStandardMaterial({ color: 0x6b5e50, roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const info = document.getElementById('info')!;
const lines: string[] = [];
let width = 0;
let height = 0;
const built: Object3D[] = [];
for (const name of names) {
  const make = PIECES[name];
  if (!make) {
    lines.push(`no piece "${name}" (have: ${Object.keys(PIECES).join(', ')})`);
    continue;
  }
  const t0 = performance.now();
  const piece = make();
  const ms = performance.now() - t0;
  piece.object.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  built.push(piece.object);
  lines.push(`${name}: ${ms.toFixed(0)} ms${piece.note ? ' · ' + piece.note : ''}`);
  width = Math.max(width, piece.size[0]);
  height = Math.max(height, piece.size[1]);
}
const gap = width * 1.25;
built.forEach((o, i) => {
  o.position.x += (i - (built.length - 1) / 2) * gap;
  scene.add(o);
});
info.textContent = lines.join('\n');
console.log('[sacred] ' + lines.join(' | '));

const span = Math.max(height, width * built.length * 0.8);
const yaw = (num('yaw', 0) * Math.PI) / 180;
const pitch = (num('pitch', 8) * Math.PI) / 180;
const fov = num('fov', 35);
const dist = num('dist', (span / 2 / Math.tan(((fov / 2) * Math.PI) / 180)) * 1.25);
const target = new Vector3(0, height * num('ty', 0.5), 0);
const camera = new PerspectiveCamera(fov, innerWidth / innerHeight, 0.02, 200);
camera.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * dist, target.y + Math.sin(pitch) * dist, target.z + Math.cos(yaw) * Math.cos(pitch) * dist);
camera.lookAt(target);
camera.updateMatrixWorld();

function draw() {
  updateSacredLights(camera, night);
  renderer.render(scene, camera);
}
draw();
requestAnimationFrame(() => {
  draw();
  requestAnimationFrame(() => {
    draw();
    (window as unknown as { __ready: boolean }).__ready = true;
  });
});
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  draw();
});
// (lamps the pieces added stay listed; the preview never rebuilds)
void SACRED_LAMPS;
