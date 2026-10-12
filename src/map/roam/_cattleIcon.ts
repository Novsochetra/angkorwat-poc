import { CanvasTexture, Group, InstancedMesh, MeshBasicMaterial, NearestFilter, PlaneGeometry, Sphere, SRGBColorSpace, Vector3, type Camera } from 'three';
import { pixelSize } from '../graphics';

/**
 * A bundle of straw over each of his cows that is hungry (roam/_cattle.ts),
 * drawn as an icon, as the garden's thirst drop is (garden/_viewThirst.ts: the
 * same technique and look): a crisp pixel-art sheaf of rice straw (ចំបើង) —
 * golden stalks fanning out at both ends, a twist of darker straw tied round
 * its middle, a light streak along it, a thin dark outline so it reads on the
 * grass — on a quad facing the camera, over the cow's head, bobbing gently.
 * About 0.6 m tall and never under `MIN_PX` pixels on the screen. Unlit, so it
 * stays clear at night (a little dimmer). Hungry long enough to grow thin
 * (`urgent`): its outline turns orange and it pulses. Fed, it pops away (a few
 * straws fly: the caller's `burst`) and is gone; otherwise it eases in and out.
 * Shown while the camera is near (`NEAR` m), in shots with `cattlehungry=1`
 * (or a hungry cow in `cattle=`).
 *
 * Two instanced quads (plain, urgent: one texture, its two pictures), a fixed
 * pool (no allocation a frame), nothing drawn when no icon shows; its program
 * is the thirst drop's (the same material's kind), made with the map's.
 */

const HEIGHT = 0.66;
const MIN_PX = 22;
const W = 18;
const H = 26;
const ASPECT = W / H;
const NEAR = 55;
const NEAR_FADE = 10;
const CAP = 8;

const OUTLINE = '#3a2410';
const ORANGE = '#f27a1a';
const CX = W / 2;

/** Half the sheaf's width at row `y` (pixel rows, y down): fanning up from the tie, a little flared at its cut foot. */
function halfWidth(y: number): number {
  if (y < 2 || y > 23) return -1;
  if (y < 12) return 2.4 + (12 - y) * 0.58;
  if (y < 16) return 2.4;
  return 2.4 + (y - 15) * 0.4;
}

/** The sheaf's colour at pixel (x, y), or null: golden stalks, their lines leaning out above the tie, the tie, a light streak. */
function straw(x: number, y: number): string | null {
  const dx = x + 0.5 - CX;
  const hw = halfWidth(y);
  if (hw < 0 || Math.abs(dx) > hw) return null;
  // (the ragged tips at the top: some stalks shorter)
  if (y < 5 && (Math.round(dx * 3 + y * 7) % 4 === 0 || (y < 3 && Math.abs(dx) < 2))) return null;
  // The tie: a twist of dark straw round its waist.
  if (y >= 12 && y < 15) return y === 13 ? '#7a4a1a' : '#9a6224';
  // The stalks: lines leaning out above the tie (fanning), upright below it.
  const lean = y < 12 ? dx / (hw + 0.01) * (12 - y) * 0.45 : 0;
  const line = Math.round(dx - lean + 40) % 3 === 0;
  if (dx < -0.5 && dx > -2.5 && y > 3 && y < 11) return '#fff0b8';
  if (line) return y > 15 ? '#a8822c' : '#c49a3a';
  return dx > hw - 1.2 ? '#c8a040' : '#e6c25c';
}

function drawBundle(g: CanvasRenderingContext2D, ox: number, outline: string): void {
  const isIn = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && straw(x, y) !== null;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = straw(x, y);
      if (c) {
        g.fillStyle = c;
        g.fillRect(ox + x, y, 1, 1);
        continue;
      }
      if (isIn(x - 1, y) || isIn(x + 1, y) || isIn(x, y - 1) || isIn(x, y + 1)) {
        g.fillStyle = outline;
        g.fillRect(ox + x, y, 1, 1);
      }
    }
}

function texture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = W * 2;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  drawBundle(g, 0, OUTLINE);
  drawBundle(g, W, ORANGE);
  const t = new CanvasTexture(canvas);
  t.magFilter = t.minFilter = NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = SRGBColorSpace;
  return t;
}

function quad(frame: number): PlaneGeometry {
  const geo = new PlaneGeometry(ASPECT, 1);
  geo.translate(0, 0.5, 0);
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setX(i, (frame + uv.getX(i)) / 2);
  return geo;
}

interface Slot {
  id: number;
  k: number;
  want: number;
  urgent: number;
  x: number;
  y: number;
  z: number;
  phase: number;
  seen: boolean;
  hungry: boolean;
}

const _eye = new Vector3();
const _r = new Vector3();
const _u = new Vector3();

export class HungerIcons {
  readonly mesh = new Group();
  private readonly plain: InstancedMesh;
  private readonly urgentMesh: InstancedMesh;
  private readonly material: MeshBasicMaterial;
  private readonly slots: Slot[] = [];
  private readonly on: boolean;
  private time = 0;

  constructor(shot: boolean, params: URLSearchParams) {
    const c = params.get('cattle') ?? '';
    this.on = !shot || params.get('cattlehungry') === '1' || /hungry|thin/.test(c);
    this.material = new MeshBasicMaterial({ map: texture(), alphaTest: 0.5, fog: true });
    this.material.name = 'cattle:hungry';
    const make = (frame: number, name: string) => {
      const m = new InstancedMesh(quad(frame), this.material, CAP);
      m.name = name;
      m.count = 0;
      m.castShadow = false;
      m.receiveShadow = false;
      m.boundingSphere = new Sphere(new Vector3(), 0);
      m.renderOrder = 3;
      return m;
    };
    this.plain = make(0, 'cattle:hungry:plain');
    this.urgentMesh = make(1, 'cattle:hungry:urgent');
    this.mesh.name = 'cattle:hungry';
    this.mesh.add(this.plain, this.urgentMesh);
    // (in the scene from the start, hidden: three compiles hidden objects too)
    this.plain.visible = this.urgentMesh.visible = false;
  }

  /** A cow this frame: is it hungry (and thin: urgent), and where its icon floats (m, the map). */
  set(id: number, hungry: boolean, urgent: boolean, x: number, y: number, z: number): void {
    if (!this.on) return;
    let s: Slot | null = null;
    for (let i = 0; i < this.slots.length; i++) if (this.slots[i].id === id) s = this.slots[i];
    if (!s) {
      if (!hungry || this.slots.length >= CAP) return;
      this.slots.push((s = { id, k: 0, want: 0, urgent: 0, x, y, z, phase: (id * 2.39996) % (Math.PI * 2), seen: true, hungry }));
    }
    s.seen = true;
    s.hungry = hungry;
    s.want = hungry ? 1 : 0;
    s.urgent += ((urgent ? 1 : 0) - s.urgent) * 0.15;
    s.x = x;
    s.y = y;
    s.z = z;
  }

  /** Each frame after the cows' `set`: eased and turned to the camera; the icons fed away this frame into `burst` (x, y, z each), their count. */
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
    _r.set(e[0], e[1], e[2]).normalize();
    _u.set(e[4], e[5], e[6]).normalize();
    const px = pixelSize(camera);
    let np = 0;
    let nu = 0;
    let bursts = 0;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    const pm = plain.instanceMatrix.array as Float32Array;
    const um = urg.instanceMatrix.array as Float32Array;
    for (let si = this.slots.length - 1; si >= 0; si--) {
      const s = this.slots[si];
      if (!s.seen) s.want = 0;
      s.seen = false;
      const d = Math.hypot(s.x - _eye.x, s.y - _eye.y, s.z - _eye.z);
      const near = Math.max(0, Math.min(1, (NEAR + NEAR_FADE - d) / NEAR_FADE));
      const want = s.want * near;
      // Fed while shown: it pops (straws fly) and is gone at once.
      if (s.k > 0.5 && !s.hungry && near > 0.5 && dt > 0) {
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
        continue;
      }
      if (s.k < 0.01) continue;
      const t = this.time + s.phase;
      const h = Math.max(HEIGHT, MIN_PX * px * d) * s.k * (1 + 0.1 * s.urgent * Math.sin(t * 7));
      const y = s.y + 0.07 * Math.sin(t * 1.7);
      if (s.urgent > 0.5) writeQuad(um, nu++, s.x, y, s.z, h);
      else writeQuad(pm, np++, s.x, y, s.z, h);
      x0 = Math.min(x0, s.x);
      x1 = Math.max(x1, s.x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y + h);
      z0 = Math.min(z0, s.z);
      z1 = Math.max(z1, s.z);
    }
    plain.count = np;
    urg.count = nu;
    plain.visible = np > 0;
    urg.visible = nu > 0;
    const r = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + 2;
    upload(plain, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, r);
    upload(urg, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, r);
    return bursts;
  }

  /** Icons shown now (checks). */
  get shown(): number {
    return this.slots.length;
  }
}

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
