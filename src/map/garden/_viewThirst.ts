import { CanvasTexture, Group, InstancedMesh, MeshBasicMaterial, NearestFilter, PlaneGeometry, Sphere, SRGBColorSpace, Vector3, type Camera, type PerspectiveCamera } from 'three';
import { pixelSize } from '../graphics';

/**
 * A drop of water over each plant of his that wants it (garden/state.ts
 * `thirsty`), drawn as an icon, as the 💧 is: a crisp pixel-art drop (round
 * bottom, pointed top, sky-blue with a lighter heart, a white highlight, a thin
 * dark navy outline so it reads on grass) on a quad facing the camera, just
 * over the plant's top, bobbing gently. About half a metre tall, and never under
 * `MIN_PX` pixels on the screen (it grows a little with distance: it reads at
 * 20 m on a phone). Unlit, so it stays clear at night (a little dimmer there:
 * not a lamp). Wilting badly (`droop` 2): its outline turns orange and pulses,
 * and a tiny second drop shows beside it (💦). Watered, it pops into a few
 * splashes (the view's effects: `pop`) and is gone; otherwise it eases in and
 * out. Shown while the camera is near the garden (`NEAR` m: roaming there, not
 * the overview), in shots only with `gardenthirst=1`.
 *
 * Two instanced quads (the plain drop and the urgent one: one texture, its two
 * pictures), a fixed pool (no allocation a frame), nothing drawn when no drop
 * shows; their program is made with the map's (they are in the scene from the
 * start, hidden: three compiles hidden objects too).
 */

/** Its height in the world (m), and at least this many pixels on the screen. */
const HEIGHT = 0.5;
const MIN_PX = 18;
/** Width over height of its picture. */
const ASPECT = 20 / 26;
/** Shown within this far of the camera (m), eased in over this far again. */
const NEAR = 45;
const NEAR_FADE = 8;
const CAP = 64;

// ── The picture: two drops side by side (plain, urgent), 20 × 26 pixels each ──
const W = 20;
const H = 26;
const NAVY = '#14304f';
const ORANGE = '#f27a1a';

/** Inside the drop's shape (pixel centre x, y; y down): a round bottom and a point at the top. */
function inside(x: number, y: number): boolean {
  const cx = W / 2;
  const cy = 16.5;
  const r = 7.2;
  if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) return true;
  // (the point: two curved sides meeting at the top)
  if (y < 3 || y > cy) return false;
  const u = (y - 3) / (cy - 3);
  const half = r * Math.pow(u, 0.75) * 0.98;
  return Math.abs(x - cx) <= half;
}

function drawDrop(g: CanvasRenderingContext2D, ox: number, outline: string, thick: number): void {
  const cell = (x: number, y: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(ox + x, y, 1, 1);
  };
  const isIn = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && inside(x + 0.5, y + 0.5);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (isIn(x, y)) {
        // (a lighter heart up and left of the middle, deeper blue at the bottom right)
        const d = Math.hypot(x + 0.5 - 8.5, y + 0.5 - 14.5) / 9;
        const low = Math.max(0, (x - 10 + y - 17) / 10);
        const c = d < 0.45 ? '#8ed6fb' : d < 0.8 ? '#5cbcf3' : '#3fa2e8';
        cell(x, y, low > 0.3 ? '#2f8fdc' : c);
        continue;
      }
      // (the outline: next to the drop, `thick` pixels)
      let near = false;
      for (let dy = -thick; dy <= thick && !near; dy++) for (let dx = -thick; dx <= thick && !near; dx++) if (Math.abs(dx) + Math.abs(dy) <= thick && isIn(x + dx, y + dy)) near = true;
      if (near) cell(x, y, outline);
    }
  // The white highlight: a short curved stroke on its upper left, and a glint near the point.
  for (const [x, y] of [
    [6, 13],
    [6, 14],
    [6, 15],
    [7, 12],
    [7, 16],
    [8, 11],
    [9, 7],
  ])
    cell(x, y, '#ffffff');
}

function texture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = W * 2;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  drawDrop(g, 0, NAVY, 1);
  drawDrop(g, W, ORANGE, 1);
  const t = new CanvasTexture(canvas);
  t.magFilter = t.minFilter = NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** A quad of the picture's `frame` (0 plain, 1 urgent), its foot at 0. */
function quad(frame: number): PlaneGeometry {
  const geo = new PlaneGeometry(ASPECT, 1);
  geo.translate(0, 0.5, 0);
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setX(i, (frame + uv.getX(i)) / 2);
  return geo;
}

interface Slot {
  id: number;
  /** Shown now (0‥1), wanted (0, 1), urgent (0‥1 eased). */
  k: number;
  want: number;
  urgent: number;
  x: number;
  y: number;
  z: number;
  phase: number;
  seen: boolean;
  thirsty: boolean;
}

const _eye = new Vector3();
const _r = new Vector3();
const _u = new Vector3();

export class ThirstDrops {
  /** Both quads' meshes (the view adds it). */
  readonly mesh = new Group();
  private readonly plain: InstancedMesh;
  private readonly urgentMesh: InstancedMesh;
  private readonly material: MeshBasicMaterial;
  private readonly slots: Slot[] = [];
  private readonly on: boolean;
  private time = 0;

  constructor(shot: boolean) {
    this.on = !shot || new URLSearchParams(location.search).get('gardenthirst') === '1';
    this.material = new MeshBasicMaterial({ map: texture(), alphaTest: 0.5, fog: true });
    this.material.name = 'garden:thirst';
    const make = (frame: number, name: string, n: number) => {
      const m = new InstancedMesh(quad(frame), this.material, n);
      m.name = name;
      m.count = 0;
      m.castShadow = false;
      m.receiveShadow = false;
      m.boundingSphere = new Sphere(new Vector3(), 0);
      m.renderOrder = 3;
      return m;
    };
    // (the plain drops and the urgent ones' tiny second drops; the urgent drops)
    this.plain = make(0, 'garden:thirst:drop', CAP * 2);
    this.urgentMesh = make(1, 'garden:thirst:urgent', CAP);
    this.mesh.name = 'garden:thirst';
    this.mesh.add(this.plain, this.urgentMesh);
    // (in the scene from the start, hidden: three compiles hidden objects too, so the map's compile at load makes its program)
    this.plain.visible = this.urgentMesh.visible = false;
  }

  /** A plant this frame: does it want water (and how badly), and where its drop floats (m, the map). */
  set(id: number, thirsty: boolean, urgent: boolean, x: number, y: number, z: number): void {
    if (!this.on) return;
    let s: Slot | null = null;
    for (let i = 0; i < this.slots.length; i++) if (this.slots[i].id === id) s = this.slots[i];
    if (!s) {
      if (!thirsty || this.slots.length >= CAP) return;
      this.slots.push((s = { id, k: 0, want: 0, urgent: 0, x, y, z, phase: (id * 2.39996) % (Math.PI * 2), seen: true, thirsty }));
    }
    s.seen = true;
    s.thirsty = thirsty;
    s.want = thirsty ? 1 : 0;
    s.urgent += ((urgent ? 1 : 0) - s.urgent) * 0.15;
    s.x = x;
    s.y = y;
    s.z = z;
  }

  /**
   * Each frame, after the plants' `set`: the drops eased (near the camera: `NEAR`) and turned to it (`night` 0‥1 dims
   * them a little). Returns the drops that burst this frame (watered) into `burst` (x, y, z each), their count.
   */
  frame(dt: number, camera: Camera, burst: Float32Array, night = 0): number {
    const plain = this.plain;
    const urg = this.urgentMesh;
    if (!this.on || !this.slots.length) {
      plain.count = urg.count = 0;
      plain.visible = urg.visible = false;
      return 0;
    }
    this.time += dt;
    this.material.color.setScalar(1 - 0.3 * night);
    const e = camera.matrixWorld.elements;
    _eye.set(e[12], e[13], e[14]);
    let bursts = 0;
    for (let si = this.slots.length - 1; si >= 0; si--) {
      const s = this.slots[si];
      if (!s.seen) s.want = 0;
      s.seen = false;
      const d = Math.hypot(s.x - _eye.x, s.y - _eye.y, s.z - _eye.z);
      const near = Math.max(0, Math.min(1, (NEAR + NEAR_FADE - d) / NEAR_FADE));
      const want = s.want * near;
      // Watered while shown: it bursts (splashes) and is gone at once.
      if (s.k > 0.5 && !s.thirsty && near > 0.5 && dt > 0) {
        if (bursts * 3 + 2 < burst.length) {
          burst[bursts * 3] = s.x;
          burst[bursts * 3 + 1] = s.y + HEIGHT * 0.4;
          burst[bursts * 3 + 2] = s.z;
          bursts++;
        }
        s.k = 0;
      } else s.k += (want - s.k) * (dt > 0 ? 1 - Math.exp(-dt * 6) : 1);
      if (s.k < 0.01 && want === 0) {
        this.slots[si] = this.slots[this.slots.length - 1];
        this.slots.pop();
      }
    }
    this.face(camera);
    return bursts;
  }

  /**
   * The quads turned to `camera` and sized for it: each picture as it is drawn (the scene's onBeforeRender,
   * garden/view.ts), so a shot's or the free camera's `cam=` sees them face on too.
   */
  face(camera: Camera): void {
    const plain = this.plain;
    const urg = this.urgentMesh;
    if (!this.on || !(camera as PerspectiveCamera).isPerspectiveCamera) return;
    const e = camera.matrixWorld.elements;
    _eye.set(e[12], e[13], e[14]);
    // (the camera's right and up: the quads face it)
    _r.set(e[0], e[1], e[2]).normalize();
    _u.set(e[4], e[5], e[6]).normalize();
    const px = pixelSize(camera);
    let np = 0;
    let nu = 0;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    const pm = plain.instanceMatrix.array as Float32Array;
    const um = urg.instanceMatrix.array as Float32Array;
    for (let si = 0; si < this.slots.length; si++) {
      const s = this.slots[si];
      if (s.k < 0.01) continue;
      const d = Math.hypot(s.x - _eye.x, s.y - _eye.y, s.z - _eye.z);
      const t = this.time + s.phase;
      // (half a metre, at least MIN_PX pixels tall; urgent: it pulses)
      const h = Math.max(HEIGHT, MIN_PX * px * d) * s.k * (1 + 0.1 * s.urgent * Math.sin(t * 7));
      const y = s.y + 0.06 * Math.sin(t * 1.9);
      const urgent = s.urgent > 0.5;
      if (urgent) writeQuad(um, nu++, s.x, y, s.z, h);
      else writeQuad(pm, np++, s.x, y, s.z, h);
      // (urgent: a tiny second drop beside it, a little lower)
      if (s.urgent > 0.05) {
        const k = 0.42 * s.urgent;
        writeQuad(pm, np++, s.x + _r.x * h * 0.55, y - h * 0.08, s.z + _r.z * h * 0.55, h * k);
      }
      x0 = Math.min(x0, s.x);
      x1 = Math.max(x1, s.x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y + h);
      z0 = Math.min(z0, s.z);
      z1 = Math.max(z1, s.z);
    }
    plain.count = np;
    urg.count = nu;
    // (nothing to show: not drawn at all)
    plain.visible = np > 0;
    urg.visible = nu > 0;
    const r = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + 2;
    upload(plain, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, r);
    upload(urg, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, r);
  }

  /** Drops shown now (stats). */
  get shown(): number {
    return this.slots.length;
  }

  dispose(): void {
    this.plain.geometry.dispose();
    this.urgentMesh.geometry.dispose();
    this.material.map?.dispose();
    this.material.dispose();
    this.plain.dispose();
    this.urgentMesh.dispose();
  }
}

/** The quads written go up to the GPU, round their bounds. */
function upload(m: InstancedMesh, cx: number, cy: number, cz: number, r: number): void {
  if (!m.count) return;
  m.boundingSphere!.center.set(cx, cy, cz);
  m.boundingSphere!.radius = r;
  m.instanceMatrix.clearUpdateRanges();
  m.instanceMatrix.addUpdateRange(0, m.count * 16);
  m.instanceMatrix.needsUpdate = true;
}

/** A quad `h` m tall at (x, y, z) (its foot), facing the camera (`_r`, `_u`), into slot `i` of `m`. */
function writeQuad(m: Float32Array, i: number, x: number, y: number, z: number, h: number): void {
  const o = i * 16;
  // (columns: right, up, the facing (right × up), each × its size; the place. The geometry is ASPECT wide already)
  const fx = _r.y * _u.z - _r.z * _u.y;
  const fy = _r.z * _u.x - _r.x * _u.z;
  const fz = _r.x * _u.y - _r.y * _u.x;
  m[o] = _r.x * h;
  m[o + 1] = _r.y * h;
  m[o + 2] = _r.z * h;
  m[o + 3] = 0;
  m[o + 4] = _u.x * h;
  m[o + 5] = _u.y * h;
  m[o + 6] = _u.z * h;
  m[o + 7] = 0;
  m[o + 8] = fx;
  m[o + 9] = fy;
  m[o + 10] = fz;
  m[o + 11] = 0;
  m[o + 12] = x;
  m[o + 13] = y;
  m[o + 14] = z;
  m[o + 15] = 1;
}
