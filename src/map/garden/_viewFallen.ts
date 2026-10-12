import { CanvasTexture, Group, InstancedMesh, MeshBasicMaterial, NearestFilter, PlaneGeometry, Sphere, SRGBColorSpace, Vector3, type Camera, type PerspectiveCamera } from 'three';
import { pixelSize } from '../graphics';
import type { PlantKindId } from './kinds';

/**
 * A marker over each of his trees that has ripe fruit lying under it to pick
 * up (garden/state.ts `fallen`: the coconut, the durian, the sugar palm), drawn
 * as the thirst drop is (garden/_viewThirst.ts): a crisp pixel-art icon on a
 * quad facing the camera, bobbing gently over where the fruit lies, about his
 * chest high (clear of the trunk on the camera's side): a coconut (🥥: half a brown shell, its white flesh), a durian
 * (green-gold, spiky, its stalk) or a sugar palm fruit (round, purple-black and
 * glossy, its cap of olive sepals), each with a thin dark outline so it reads on
 * grass. About 0.6 m, never under `MIN_PX` pixels on the screen, unlit
 * (a little dimmer at night), shown within `NEAR` m of the camera (roaming
 * there), eased in once the fruit lies still (not while it falls). Picked up,
 * it pops: it swells and bursts into little gold sparkles; rotted away, it only
 * fades. In shots only with `gardenfallen=1`.
 *
 * One picture (the three icons and the sparkle side by side), one quad mesh
 * per icon (a fixed pool each), drawn only while one shows: no allocation a
 * frame. The material is the drop's (MeshBasicMaterial, a map, alpha test),
 * so its program is the drop's: made with the map's at load (and these are in
 * the scene from the start, hidden: three compiles hidden objects too).
 * The quads are turned to each picture's camera as it is drawn (`face`, from
 * the scene's onBeforeRender: garden/view.ts), so a shot's or the free
 * camera's `cam=` sees them face on too.
 */

/** Its height in the world (m), and at least this many pixels on the screen (its picture has room round the fruit: the fruit itself about as big as the thirst drop). */
const HEIGHT = 0.6;
const MIN_PX = 22;
/** Its foot over the earth where the fruit lies (m: about his chest), how far it bobs. */
const LIFT = 1.3;
const BOB = 0.06;
/** Shown within this far of the camera (m), eased in over this far again. */
const NEAR = 45;
const NEAR_FADE = 8;
/** Trees marked at most; sparkles at most. */
const CAP = 24;
const SPARKS = 36;
/** A pop: the swell (s), the sparkles' flight (s), how many, how far (heights of the icon). */
const POP = { swell: 0.12, fly: 0.5, n: 6, out: 1.25 };

// ── The picture: four cells side by side (coconut, durian, sugar palm, sparkle), C × C pixels each ──
const C = 24;
const ICONS: readonly PlantKindId[] = ['coconut', 'durian', 'sugarPalm'];
const SPARK = 3;

/** Colour at a pixel's centre (x, y; y down), or null outside the shape. */
type Paint = (x: number, y: number) => string | null;

/** A cell's shape painted, with an outline `thick` pixels round it (diagonals too when `round`). */
function stamp(g: CanvasRenderingContext2D, cell: number, paint: Paint, outline: string, thick = 1): void {
  const ox = cell * C;
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < C && y < C ? paint(x + 0.5, y + 0.5) : null);
  for (let y = 0; y < C; y++)
    for (let x = 0; x < C; x++) {
      const c = at(x, y);
      if (c) {
        g.fillStyle = c;
        g.fillRect(ox + x, y, 1, 1);
        continue;
      }
      let near = false;
      for (let dy = -thick; dy <= thick && !near; dy++) for (let dx = -thick; dx <= thick && !near; dx++) if (Math.abs(dx) + Math.abs(dy) <= thick && at(x + dx, y + dy)) near = true;
      if (near) {
        g.fillStyle = outline;
        g.fillRect(ox + x, y, 1, 1);
      }
    }
}

/** A seeded 0‥1 for a pixel (the shell's fibres, the durian's spikes). */
const grain = (x: number, y: number, k: number): number => {
  const h = Math.sin(Math.floor(x) * 12.9898 + Math.floor(y) * 78.233 + k * 37.719) * 43758.5453;
  return h - Math.floor(h);
};

/** 🥥 Half a coconut: the brown fibrous shell below, the cut face on top: a thin shell rim, white flesh, a cream hollow. */
const coconut: Paint = (x, y) => {
  const cx = 12;
  const cy = 9.6;
  // The cut face (an ellipse seen from a little above) and the round shell under it.
  const face = ((x - cx) / 10.4) ** 2 + ((y - cy) / 4.6) ** 2;
  const bowl = y >= cy && ((x - cx) / 10.4) ** 2 + ((y - cy) / 11.6) ** 2 <= 1;
  if (face <= 1) {
    if (face > 0.8) return '#6e4424';
    const hollow = ((x - cx - 0.3) / 5.6) ** 2 + ((y - cy - 0.6) / 2.2) ** 2;
    if (hollow <= 1) return y < cy ? '#d8c9a4' : '#ebe0c2';
    return x < cx - 3.5 && y < cy ? '#ffffff' : '#f7f0de';
  }
  if (!bowl) return null;
  // The shell: lit from the upper left, its fibres in short slanted strokes, a glint.
  const u = (x - cx) / 10.4;
  const v = (y - cy) / 11.6;
  if ((Math.abs(x - 4.5) < 0.6 && y > 11.5 && y < 15.6) || (Math.abs(x - 5.5) < 0.6 && y > 15.5 && y < 17.6)) return '#cf9a68';
  const shade = u * 0.6 + v * 0.8;
  const fibre = (Math.floor(x) + Math.floor(y) * 2) % 5 === 0 && grain(x, y, 1) > 0.35;
  if (fibre) return shade < 0.4 ? '#6e4426' : '#4e2f18';
  return shade < -0.05 ? '#a46e40' : shade < 0.42 ? '#8a5a32' : '#6a4224';
};

/** A durian: an oval body bristling with spikes (the outline jagged), green-gold lit from the upper left, its woody stalk. */
const durian: Paint = (x, y) => {
  const cx = 12;
  const cy = 13.8;
  // (the stalk on top)
  if (Math.abs(x - cx) < 1.1 && y > 1.4 && y < 5.4) return y < 2.8 ? '#4f5a26' : '#6e5c30';
  const a = Math.atan2(y - cy, x - cx);
  const spikes = 1 - Math.abs(((((a / (Math.PI * 2)) * 9 + 10.25) % 1) - 0.5) * 2);
  const r = Math.hypot((x - cx) / 7.4, (y - cy) / 8.1);
  if (r > 1 + 0.26 * spikes ** 1.5) return null;
  const shade = ((x - cx) / 7.4) * 0.55 + ((y - cy) / 8.1) * 0.75;
  // (the spikes standing out of the outline)
  if (r > 1) return shade < 0.15 ? '#c2b04a' : '#8a7a28';
  // Its thorns on the body: little pyramids on a diamond grid, lit on their upper left, dark below right.
  const gx = (x - cx) / 3.4 + (y - cy) / 3.4 + 0.5;
  const gy = (x - cx) / 3.4 - (y - cy) / 3.4 + 0.5;
  const fx = gx - Math.round(gx);
  const fy = gy - Math.round(gy);
  if (r < 0.92 && Math.abs(fx) + Math.abs(fy) < 0.34) {
    if (fx + fy < -0.06) return shade < 0.4 ? '#e6d77e' : '#b9a748';
    return shade < 0.4 ? '#7a6a22' : '#5e5018';
  }
  if (x < 8 && x > 6.2 && y > 9.4 && y < 11.6) return '#f2e8a8';
  return shade < -0.25 ? '#c8b84f' : shade < 0.35 ? '#ae9d3c' : '#8a7a2a';
};

/** A sugar palm fruit: round, purple-black and glossy, its cap of olive sepals on top round the stalk. */
const sugarPalm: Paint = (x, y) => {
  const cx = 12;
  const cy = 13.8;
  // The cap: the stalk's stub, and three broad pointed sepals spread over the top of the fruit.
  if (Math.abs(x - cx) < 1.1 && y > 1.6 && y < 4.6) return '#5e5a2c';
  const dx = x - cx;
  const dy = y - 4.2;
  for (const [ang, len, w] of [
    [Math.PI / 2, 5.6, 2.9],
    [Math.PI / 2 + 0.95, 6.6, 2.6],
    [Math.PI / 2 - 0.95, 6.6, 2.6],
  ] as const) {
    const along = dx * Math.cos(ang) + dy * Math.sin(ang);
    const across = -dx * Math.sin(ang) + dy * Math.cos(ang);
    if (along > -0.8 && along < len && Math.abs(across) < w * (1 - along / len) + 0.3) {
      if (Math.abs(across) < 0.45 && along > 0.8) return '#6e7a2c';
      return across < 0 && ang >= Math.PI / 2 ? '#b6c45a' : along > len * 0.55 ? '#7a8632' : '#97a644';
    }
  }
  const r = Math.hypot(x - cx, y - cy) / 8.6;
  if (r > 1) return null;
  // (gloss: a white glint and a lilac sheen up and left, a dark underside)
  const gx = x - (cx - 3.8);
  const gy = y - (cy - 2.2);
  if (gx * gx + gy * gy < 2.3) return gx + gy < -0.5 ? '#ffffff' : '#eadcea';
  if (gx * gx + gy * gy < 9.5) return '#7a5a72';
  const shade = ((x - cx) / 8.6) * 0.5 + ((y - cy) / 8.6) * 0.8;
  return shade < -0.2 ? '#5a4054' : shade < 0.45 ? '#43303e' : '#2a1d26';
};

/** A sparkle: a four-pointed star, white at its heart, gold to its points. */
const sparkle: Paint = (x, y) => {
  const dx = Math.abs(x - 12);
  const dy = Math.abs(y - 12);
  const s = Math.sqrt(dx / 10.5) + Math.sqrt(dy / 10.5);
  if (s > 1) return null;
  return s < 0.42 ? '#ffffff' : s < 0.7 ? '#fff0a0' : '#ffc93a';
};

function texture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = C * 4;
  canvas.height = C;
  const g = canvas.getContext('2d')!;
  stamp(g, 0, coconut, '#2a170a');
  stamp(g, 1, durian, '#262408');
  stamp(g, 2, sugarPalm, '#120a10');
  stamp(g, SPARK, sparkle, '#7a5210');
  const t = new CanvasTexture(canvas);
  t.magFilter = t.minFilter = NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** A quad of the picture's cell `cell`, its foot at 0 (a sparkle's: its middle). */
function quad(cell: number): PlaneGeometry {
  const geo = new PlaneGeometry(1, 1);
  geo.translate(0, cell === SPARK ? 0 : 0.5, 0);
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setX(i, (cell + uv.getX(i)) / 4);
  return geo;
}

interface Slot {
  id: number;
  icon: number;
  /** Shown now (0‥1), wanted (0, 1, eased in), near the camera (0‥1). */
  k: number;
  want: number;
  near: number;
  /** Where its foot floats (m, the map), its bob's phase. */
  x: number;
  y: number;
  z: number;
  phase: number;
  seen: boolean;
  /** Its fruit was just picked up (s left to pop), popping (s into it; < 0 not). */
  picked: number;
  pop: number;
}

interface Spark {
  /** Where it began (the icon's middle), its way out in the picture (rad), its time (s), its size (m). */
  x: number;
  y: number;
  z: number;
  a: number;
  t: number;
  h: number;
}

const _eye = new Vector3();
const _r = new Vector3();
const _u = new Vector3();

export class FallenMarks {
  /** Its meshes (the view adds it). */
  readonly mesh = new Group();
  private readonly icons: InstancedMesh[];
  private readonly sparks: InstancedMesh;
  private readonly material: MeshBasicMaterial;
  private readonly slots: Slot[] = [];
  /** The sparkles: a fixed pool, the first `nFly` flying. */
  private readonly flying: Spark[] = Array.from({ length: SPARKS }, () => ({ x: 0, y: 0, z: 0, a: 0, t: 0, h: 0 }));
  private nFly = 0;
  private readonly on: boolean;
  private time = 0;
  /** Quads written per icon (`face`). */
  private readonly used = new Int32Array(ICONS.length);

  constructor(shot: boolean) {
    this.on = !shot || new URLSearchParams(location.search).get('gardenfallen') === '1';
    // (the thirst drop's material, its program the drop's: a map, an alpha test, the fog)
    this.material = new MeshBasicMaterial({ map: texture(), alphaTest: 0.5, fog: true });
    this.material.name = 'garden:fallen';
    const make = (cell: number, name: string, n: number) => {
      const m = new InstancedMesh(quad(cell), this.material, n);
      m.name = `garden:fallen:${name}`;
      m.count = 0;
      m.castShadow = false;
      m.receiveShadow = false;
      m.boundingSphere = new Sphere(new Vector3(), 0);
      m.renderOrder = 3;
      m.raycast = () => undefined;
      // (in the scene from the start, hidden: three compiles hidden objects too)
      m.visible = false;
      this.mesh.add(m);
      return m;
    };
    this.icons = ICONS.map((k, i) => make(i, k, CAP));
    this.sparks = make(SPARK, 'sparkle', SPARKS);
    this.mesh.name = 'garden:fallen';
  }

  /** Its icon for a kind (-1: none). */
  static icon(kind: PlantKindId): number {
    return ICONS.indexOf(kind);
  }

  /**
   * A tree this frame: whether ripe fruit lies under it to pick up (and lies still), and where its marker's foot is
   * (the map: over where the fruit lies, `LIFT` over the earth).
   */
  set(id: number, kind: PlantKindId, has: boolean, x: number, y: number, z: number): void {
    if (!this.on) return;
    const icon = ICONS.indexOf(kind);
    if (icon < 0) return;
    let s: Slot | null = null;
    for (let i = 0; i < this.slots.length; i++) if (this.slots[i].id === id) s = this.slots[i];
    if (!s) {
      if (!has || this.slots.length >= CAP) return;
      this.slots.push((s = { id, icon, k: 0, want: 0, near: 0, x, y, z, phase: (id * 2.39996) % (Math.PI * 2), seen: true, picked: 0, pop: -1 }));
    }
    s.seen = true;
    s.want = has ? 1 : 0;
    s.x = x;
    s.y = y + LIFT;
    s.z = z;
  }

  /** Its fruit was picked up (garden/state.ts `picked`): the marker pops as it goes. */
  picked(id: number): void {
    for (let i = 0; i < this.slots.length; i++) if (this.slots[i].id === id) this.slots[i].picked = 0.6;
  }

  /** Each frame, after the trees' `set`: the markers eased in and out, popped, near the camera (`night` 0‥1 dims them a little). */
  frame(dt: number, camera: Camera, night = 0): void {
    if (!this.on) return;
    this.time += dt;
    this.material.color.setScalar(1 - 0.3 * night);
    _eye.setFromMatrixPosition(camera.matrixWorld);
    const ease = dt > 0 ? 1 - Math.exp(-dt * 5) : 1;
    for (let si = this.slots.length - 1; si >= 0; si--) {
      const s = this.slots[si];
      if (!s.seen) s.want = 0;
      s.seen = false;
      const d = Math.hypot(s.x - _eye.x, s.y - _eye.y, s.z - _eye.z);
      s.near = Math.max(0, Math.min(1, (NEAR + NEAR_FADE - d) / NEAR_FADE));
      if (s.pop >= 0) {
        // Popping: it swells, then is gone into its sparkles.
        s.pop += dt;
        if (s.pop >= POP.swell || dt === 0) {
          this.burst(s);
          this.slots[si] = this.slots[this.slots.length - 1];
          this.slots.pop();
        }
        continue;
      }
      // Picked up while shown: it pops (otherwise, rotted or far, it fades).
      if (s.want === 0 && s.picked > 0 && s.k > 0.5 && s.near > 0.5) {
        s.pop = 0;
        continue;
      }
      s.picked = Math.max(0, s.picked - dt);
      s.k += (s.want - s.k) * ease;
      if (s.k < 0.01 && s.want === 0) {
        this.slots[si] = this.slots[this.slots.length - 1];
        this.slots.pop();
      }
    }
    for (let i = this.nFly - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.t += dt;
      // (gone: the last flying one takes its place)
      if (f.t >= POP.fly) {
        this.flying[i] = this.flying[this.nFly - 1];
        this.flying[--this.nFly] = f;
      }
    }
    this.face(camera);
  }

  /** A marker bursts into its sparkles. */
  private burst(s: Slot): void {
    for (let i = 0; i < POP.n && this.nFly < SPARKS; i++) {
      const f = this.flying[this.nFly++];
      f.x = s.x;
      f.y = s.y + HEIGHT * 0.55;
      f.z = s.z;
      f.a = s.phase + (i / POP.n) * Math.PI * 2;
      f.t = 0;
      f.h = HEIGHT;
    }
  }

  /** The quads turned to `camera` and sized for it (each picture as it is drawn: the scene's onBeforeRender). */
  face(camera: Camera): void {
    if (!this.on) return;
    if (!(camera as PerspectiveCamera).isPerspectiveCamera) return;
    const e = camera.matrixWorld.elements;
    _eye.set(e[12], e[13], e[14]);
    // (the camera's right and up: the quads face it)
    _r.set(e[0], e[1], e[2]).normalize();
    _u.set(e[4], e[5], e[6]).normalize();
    const px = pixelSize(camera);
    const used = this.used;
    used.fill(0);
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let si = 0; si < this.slots.length; si++) {
      const s = this.slots[si];
      const k = s.pop >= 0 ? 1 + 0.35 * Math.sin((Math.PI / 2) * Math.min(1, s.pop / POP.swell)) : s.k * s.near;
      if (k < 0.01) continue;
      const d = Math.hypot(s.x - _eye.x, s.y - _eye.y, s.z - _eye.z);
      const t = this.time + s.phase;
      const h = Math.max(HEIGHT, MIN_PX * px * d) * k;
      const y = s.y + BOB * Math.sin(t * 1.9);
      const m = this.icons[s.icon];
      writeQuad(m.instanceMatrix.array as Float32Array, used[s.icon]++, s.x, y, s.z, h);
      x0 = Math.min(x0, s.x);
      x1 = Math.max(x1, s.x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y + h);
      z0 = Math.min(z0, s.z);
      z1 = Math.max(z1, s.z);
    }
    let ns = 0;
    const sm = this.sparks.instanceMatrix.array as Float32Array;
    for (let i = 0; i < this.nFly; i++) {
      const f = this.flying[i];
      const u = Math.min(1, f.t / POP.fly);
      const d = Math.hypot(f.x - _eye.x, f.y - _eye.y, f.z - _eye.z);
      const big = Math.max(f.h, MIN_PX * px * d);
      // (out in the picture's plane, slowing; shrinking to nothing; a little fall)
      const out = big * POP.out * (1 - (1 - u) * (1 - u)) + big * 0.25;
      const ca = Math.cos(f.a) * out;
      const sa = Math.sin(f.a) * out - big * 0.3 * u * u;
      const h = big * 0.42 * (1 - u * u);
      if (h < 1e-3) continue;
      const x = f.x + _r.x * ca + _u.x * sa;
      const y = f.y + _r.y * ca + _u.y * sa;
      const z = f.z + _r.z * ca + _u.z * sa;
      writeQuad(sm, ns++, x, y, z, h);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y - h);
      y1 = Math.max(y1, y + h);
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
    const r = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + 2;
    for (let i = 0; i < this.icons.length; i++) upload(this.icons[i], used[i], x0, x1, y0, y1, z0, z1, r);
    upload(this.sparks, ns, x0, x1, y0, y1, z0, z1, r);
  }

  /** Markers shown now (stats). */
  get shown(): number {
    return this.slots.length;
  }

  dispose(): void {
    for (const m of [...this.icons, this.sparks]) {
      m.geometry.dispose();
      m.dispose();
    }
    this.material.map?.dispose();
    this.material.dispose();
  }
}

/** `n` quads written go up to the GPU, round their bounds; nothing drawn when none. */
function upload(m: InstancedMesh, n: number, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, r: number): void {
  m.count = n;
  m.visible = n > 0;
  if (!n) return;
  m.boundingSphere!.center.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.boundingSphere!.radius = r;
  m.instanceMatrix.clearUpdateRanges();
  m.instanceMatrix.addUpdateRange(0, n * 16);
  m.instanceMatrix.needsUpdate = true;
}

/** A quad `h` m tall (and wide) at (x, y, z) (its foot), facing the camera (`_r`, `_u`), into slot `i` of `m`. */
function writeQuad(m: Float32Array, i: number, x: number, y: number, z: number, h: number): void {
  const o = i * 16;
  // (columns: right, up, the facing (right × up), each × its size; the place)
  m[o] = _r.x * h;
  m[o + 1] = _r.y * h;
  m[o + 2] = _r.z * h;
  m[o + 3] = 0;
  m[o + 4] = _u.x * h;
  m[o + 5] = _u.y * h;
  m[o + 6] = _u.z * h;
  m[o + 7] = 0;
  m[o + 8] = _r.y * _u.z - _r.z * _u.y;
  m[o + 9] = _r.z * _u.x - _r.x * _u.z;
  m[o + 10] = _r.x * _u.y - _r.y * _u.x;
  m[o + 11] = 0;
  m[o + 12] = x;
  m[o + 13] = y;
  m[o + 14] = z;
  m[o + 15] = 1;
}
