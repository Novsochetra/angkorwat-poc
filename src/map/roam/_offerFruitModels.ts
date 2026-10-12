import {
  BufferAttribute,
  Color,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  QuadraticBezierCurve3,
  SphereGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
  type Camera,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash3 } from '../../voxel/random';
import type { PlantKindId } from '../garden/kinds';
import { statueMaterial, type Finish } from '../sacred/finish';
import { OFFERING_FINISH as F, plainAttributes, revolve, type RevolvePoint } from '../sacred/offerings';

/**
 * His garden's fruit as he offers it (roam/_offerFruit.ts): each kind on a
 * small footed brass tray (ថាស), smooth and in the statues' material like the
 * altar offerings (sacred/offerings.ts): a hand of five bananas, a young green
 * coconut, three mangoes, a papaya, four guavas, a jackfruit, a durian, three
 * sugar palm fruits, two pieces of sugarcane; or the fruit alone (no tray) as
 * it goes into a monk's bowl or his hands. Colours are the fruit's own
 * (garden/kinds.ts `eat.colors`, the harvest's look).
 *
 * Real metres, the tray's foot at the origin on y = 0, +z ahead (drawn at his
 * size on the map: the mesh's scale is his `body.scale`). Each geometry is made
 * the first time and shared; the meshes are a fixed pool (`LaidPool`).
 */

/** The kinds that can be offered (fruit eaten as it is: the vegetables go to the kitchen, not to a shrine). */
export type OfferKind = Extract<PlantKindId, 'sugarcane' | 'banana' | 'papaya' | 'guava' | 'mango' | 'jackfruit' | 'durian' | 'coconut' | 'sugarPalm'>;
export const OFFER_KINDS: readonly OfferKind[] = ['banana', 'coconut', 'mango', 'papaya', 'guava', 'jackfruit', 'durian', 'sugarPalm', 'sugarcane'];
export const isOfferKind = (k: string): k is OfferKind => (OFFER_KINDS as readonly string[]).includes(k);

/** The tray's top inside (m, real) where the fruit sits, its rim's radius. */
const TRAY_TOP = 0.044;
export const TRAY_R = 0.128;
/** The fruit's own size (m, real): half its width across his hands, its height over its foot. */
export const FRUIT_SIZE: Record<OfferKind, { half: number; high: number }> = {
  banana: { half: 0.1, high: 0.06 },
  coconut: { half: 0.1, high: 0.21 },
  mango: { half: 0.09, high: 0.08 },
  papaya: { half: 0.12, high: 0.13 },
  guava: { half: 0.08, high: 0.07 },
  jackfruit: { half: 0.17, high: 0.22 },
  durian: { half: 0.13, high: 0.21 },
  sugarPalm: { half: 0.1, high: 0.1 },
  sugarcane: { half: 0.16, high: 0.04 },
};

// ── Painting ─────────────────────────────────────────────────────────────────

const _c = new Color();
const _p = new Vector3();
/** Colour, finish and occlusion per vertex from `f(x, y, z)` (the attributes `statueMaterial()` reads). */
function paint(g: BufferGeometry, f: (p: Vector3) => Finish, occ = 1): BufferGeometry {
  const pos = g.getAttribute('position');
  const n = pos.count;
  const col = new Float32Array(n * 3);
  const fin = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    _p.fromBufferAttribute(pos, i);
    const k = f(_p);
    _c.setHex(k.color, SRGBColorSpace);
    col[i * 3] = _c.r;
    col[i * 3 + 1] = _c.g;
    col[i * 3 + 2] = _c.b;
    fin[i * 3] = k.metal;
    fin[i * 3 + 1] = k.rough;
    fin[i * 3 + 2] = k.grain ?? 0.3;
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setAttribute('finish', new BufferAttribute(fin, 3));
  g.setAttribute('occlusion', new BufferAttribute(new Float32Array(n).fill(occ), 1));
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  return plainAttributes(g);
}
const plain = (g: BufferGeometry, f: Finish, occ = 1) => paint(g, () => f, occ);
/** Two finishes blended by `k` (0‥1). */
function blend(a: Finish, b: Finish, k: number): Finish {
  const t = Math.max(0, Math.min(1, k));
  _ca.setHex(a.color, SRGBColorSpace).lerp(_cb.setHex(b.color, SRGBColorSpace), t);
  return { color: _ca.getHex(SRGBColorSpace), metal: a.metal + (b.metal - a.metal) * t, rough: a.rough + (b.rough - a.rough) * t, grain: (a.grain ?? 0.3) + ((b.grain ?? 0.3) - (a.grain ?? 0.3)) * t };
}
const _ca = new Color();
const _cb = new Color();
const fin = (color: number, rough = 0.5, grain = 0.3): Finish => ({ color, metal: 0, rough, grain });

/** An ellipsoid (radii `r`) at `at`, turned `yaw` about y. */
function ellipsoid(at: readonly [number, number, number], r: readonly [number, number, number], yaw = 0, seg = 14): BufferGeometry {
  const g = new SphereGeometry(1, seg, Math.max(8, (seg * 3) >> 2));
  g.scale(r[0], r[1], r[2]);
  g.rotateY(yaw);
  g.translate(at[0], at[1], at[2]);
  return g;
}

// ── The tray ─────────────────────────────────────────────────────────────────

function tray(): BufferGeometry {
  const b = F.brass;
  const d = F.brassDark;
  const prof: RevolvePoint[] = [
    { r: 0, y: 0, f: d },
    { r: 0.05, y: 0, f: d },
    { r: 0.052, y: 0.006, f: b },
    { r: 0.032, y: 0.016, f: b },
    { r: 0.026, y: 0.03, f: b, occ: 0.8 },
    { r: 0.034, y: 0.034, f: b },
    { r: 0.1, y: 0.038, f: b },
    { r: 0.124, y: 0.047, f: b },
    { r: TRAY_R, y: 0.053, f: b },
    { r: 0.12, y: 0.052, f: b },
    { r: 0.1, y: TRAY_TOP + 0.002, f: b },
    { r: 0, y: TRAY_TOP, f: b, occ: 0.85 },
  ];
  return plainAttributes(revolve(prof, 22));
}

// ── The fruit (each on y = 0: the tray's top, or the bowl's floor) ───────────

const YELLOW = fin(0xf2d24a, 0.5, 0.3);
const TIP = F.bananaTip;
const STALK = F.stalk;

function bananas(): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const z = -0.05 + i * 0.025;
    const y = 0.02 + (i === 2 ? 0.012 : i % 2 ? 0.006 : 0);
    const a = new Vector3(-0.085, y + 0.01, z * 0.35);
    const e = new Vector3(0.095, y + 0.03, z * 1.1);
    const m = new Vector3(0.01, y - 0.012, z * 0.8);
    const tube = new TubeGeometry(new QuadraticBezierCurve3(a, m, e), 8, 0.0165, 7, false);
    out.push(paint(tube, (p) => blend(YELLOW, fin(0x9ab43a), (p.x + 0.07) / -0.04)));
    out.push(plain(new SphereGeometry(0.008, 6, 4).translate(e.x, e.y, e.z), TIP));
  }
  // (the hand's stalk at the left, where the five meet)
  out.push(plain(new CylinderGeometry(0.014, 0.017, 0.035, 8).rotateZ(Math.PI / 2).translate(-0.1, 0.034, 0), STALK));
  return out;
}

function coconut(): BufferGeometry[] {
  const green = fin(0x5f8f2f, 0.4, 0.35);
  const pale = fin(0x9ab45a, 0.45, 0.3);
  const g = ellipsoid([0, 0.105, 0], [0.1, 0.105, 0.1], 0, 18);
  // (paler round its foot; a trimmed husk's darker cap at the top)
  return [paint(g, (p) => blend(pale, green, (p.y - 0.01) / 0.08)), plain(new CylinderGeometry(0.026, 0.034, 0.016, 10).translate(0, 0.207, 0), fin(0x6a5030, 0.8, 0.5))];
}

function mangoes(): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  const gold = fin(0xf2c23a, 0.42, 0.25);
  const blush = fin(0xe0803a, 0.42, 0.25);
  const green = fin(0x9ab43a, 0.45, 0.25);
  const at: readonly [number, number, number, number][] = [
    [-0.045, 0.04, -0.03, 0.4],
    [0.05, 0.04, -0.025, -0.3],
    [0.0, 0.042, 0.05, 1.5],
  ];
  for (const [x, y, z, yaw] of at) {
    const c = new Vector3(x, y, z);
    out.push(
      paint(ellipsoid([x, y, z], [0.045, 0.04, 0.066], yaw), (p) => {
        // (a blush on top toward one end, green round the stem end)
        const along = (p.x - c.x) * Math.sin(yaw) + (p.z - c.z) * Math.cos(yaw);
        const k = blend(gold, blush, ((p.y - c.y) / 0.04) * 0.8 + along / 0.13);
        return blend(k, green, (-along - 0.035) / 0.03);
      }),
    );
  }
  return out;
}

function papaya(): BufferGeometry[] {
  const orange = fin(0xf08a2a, 0.45, 0.3);
  const green = fin(0x7aa040, 0.45, 0.3);
  const g = ellipsoid([0, 0.068, 0], [0.12, 0.068, 0.07], 0, 18);
  return [paint(g, (p) => blend(orange, green, (-p.x - 0.03) / 0.08)), plain(new CylinderGeometry(0.009, 0.012, 0.02, 6).rotateZ(Math.PI / 2).translate(-0.124, 0.07, 0), STALK)];
}

function guavas(): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  const skin = fin(0xa8c860, 0.5, 0.45);
  const light = fin(0xc8d878, 0.5, 0.45);
  for (const [x, y, z] of [
    [-0.04, 0.035, -0.035],
    [0.04, 0.035, -0.03],
    [0.0, 0.035, 0.045],
    [0.0, 0.085, 0.0],
  ] as const) {
    out.push(paint(ellipsoid([x, y, z], [0.036, 0.034, 0.036], 0, 12), (p) => blend(skin, light, (p.y - y) / 0.03)));
  }
  return out;
}

function jackfruit(): BufferGeometry[] {
  const g = new IcosahedronGeometry(1, 4);
  const pos = g.getAttribute('position');
  // (bumpy all over: a fine knobbed rind)
  for (let i = 0; i < pos.count; i++) {
    _p.fromBufferAttribute(pos, i);
    const bump = 1 + 0.025 * Math.sin(_p.x * 37) * Math.sin(_p.y * 41) * Math.sin(_p.z * 39);
    pos.setXYZ(i, _p.x * 0.17 * bump, _p.y * 0.11 * bump + 0.11, _p.z * 0.11 * bump);
  }
  g.computeVertexNormals();
  const rind = fin(0x9aa848, 0.65, 0.8);
  const ripe = fin(0xc8b848, 0.65, 0.8);
  return [paint(g, (p) => blend(rind, ripe, (p.y - 0.08) / 0.12 + 0.3 * hash3(Math.round(p.x * 60), Math.round(p.y * 60), Math.round(p.z * 60)))), plain(new CylinderGeometry(0.012, 0.016, 0.05, 6).rotateZ(Math.PI / 2).translate(-0.19, 0.12, 0), STALK)];
}

/** The durian's spikes: where they stand on the unit sphere (an icosahedron's corners and middles). */
const SPIKES = (() => {
  const g = new IcosahedronGeometry(1, 2);
  const pos = g.getAttribute('position');
  const out: Vector3[] = [];
  for (let i = 0; i < pos.count; i++) {
    const v = new Vector3().fromBufferAttribute(pos, i).normalize();
    if (!out.some((o) => o.distanceToSquared(v) < 1e-4)) out.push(v);
  }
  g.dispose();
  return out;
})();

function durian(): BufferGeometry[] {
  const g = new IcosahedronGeometry(1, 5);
  const pos = g.getAttribute('position');
  const spike = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    _p.fromBufferAttribute(pos, i).normalize();
    let best = 0;
    for (const s of SPIKES) best = Math.max(best, _p.dot(s));
    // (a cone to each spike's point)
    const a = Math.acos(Math.min(1, best));
    const k = Math.max(0, 1 - a / 0.17);
    spike[i] = k;
    const r = 1 + 0.16 * k * k;
    pos.setXYZ(i, _p.x * 0.12 * r, _p.y * 0.1 * r + 0.105, _p.z * 0.11 * r);
  }
  g.computeVertexNormals();
  const husk = fin(0x8a9a3a, 0.7, 0.6);
  const tip = fin(0x5a6228, 0.75, 0.5);
  let i = 0;
  const body = paint(g, () => blend(husk, tip, spike[i++] ** 2));
  return [body, plain(new CylinderGeometry(0.01, 0.014, 0.05, 6).translate(0, 0.235, 0), fin(0x6a5a2a, 0.8, 0.4))];
}

function palmFruit(): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  const skin = fin(0x2a2420, 0.32, 0.25);
  const cap = fin(0x5a6a30, 0.7, 0.5);
  for (const [x, z, yaw] of [
    [-0.045, -0.03, 0.4],
    [0.05, -0.02, -0.7],
    [0.0, 0.05, 2],
  ] as const) {
    out.push(plain(ellipsoid([x, 0.05, z], [0.052, 0.05, 0.052], yaw, 14), skin));
    // (its green cap of sepals on top)
    out.push(plain(new CylinderGeometry(0.02, 0.03, 0.016, 8).translate(x, 0.098, z), cap));
  }
  return out;
}

function sugarcane(): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  const cane = fin(0x8a5a8a, 0.35, 0.3);
  const node = fin(0x5a3a5a, 0.5, 0.4);
  const cut = fin(0xe8dca0, 0.7, 0.5);
  for (const [z, y, len] of [
    [-0.022, 0.019, 0.32],
    [0.022, 0.019, 0.3],
    [0, 0.05, 0.28],
  ] as const) {
    const g = new CylinderGeometry(0.019, 0.019, len, 10, 6, false);
    g.rotateZ(Math.PI / 2);
    g.translate(0, y, z);
    // (a node every ≈ 5 cm: a darker ring)
    out.push(paint(g, (p) => (Math.abs(((p.x + len / 2) % 0.055) - 0.004) < 0.004 ? node : cane)));
    // (the cut ends pale)
    for (const s of [-1, 1]) out.push(plain(new CylinderGeometry(0.0185, 0.0185, 0.002, 10).rotateZ(Math.PI / 2).translate((s * len) / 2, y, z), cut));
  }
  return out;
}

const MAKE: Record<OfferKind, () => BufferGeometry[]> = {
  banana: bananas,
  coconut,
  mango: mangoes,
  papaya,
  guava: guavas,
  jackfruit,
  durian,
  sugarPalm: palmFruit,
  sugarcane,
};

const geoms = new Map<string, BufferGeometry>();

/** The geometry of `kind` (on its tray, or alone: `tray` false), made the first time and shared. */
export function offerGeometry(kind: OfferKind, onTray: boolean): BufferGeometry {
  const key = `${kind}:${onTray ? 1 : 0}`;
  let g = geoms.get(key);
  if (g) return g;
  const parts = MAKE[kind]();
  if (onTray) {
    for (const p of parts) p.translate(0, TRAY_TOP - 0.002, 0);
    parts.unshift(tray());
  }
  g = mergeGeometries(parts.map(plainAttributes));
  for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  geoms.set(key, g);
  return g;
}

/** A mesh of the offering, its geometry swapped for each kind (no new mesh). */
export function offerMesh(name: string): Mesh {
  const m = new Mesh(offerGeometry('banana', true), statueMaterial());
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  m.visible = false;
  return m;
}

export function setOfferKind(m: Mesh, kind: OfferKind, onTray: boolean): void {
  const g = offerGeometry(kind, onTray);
  if (m.geometry !== g) m.geometry = g;
}

// ── What lies before the shrines ─────────────────────────────────────────────

/** At most this many lie at once (the oldest goes first), each this long (game days: a few map hours), hidden past this far (m). */
const MAX = 14;
export const LAID_DAYS = 0.25;
const SEEN = 90;

export interface Laid {
  kind: OfferKind;
  spot: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  /** Laid at (game days, `TIME.days()`). */
  at: number;
  on: boolean;
}

export interface LaidPool {
  readonly object: Group;
  readonly list: readonly Laid[];
  /** Lay one (the oldest taken up first when all are used). */
  lay(kind: OfferKind, spot: string, x: number, y: number, z: number, yaw: number, scale: number, at: number): void;
  /** How many lie within `r` m of (x, z). */
  near(x: number, z: number, r: number): number;
  /** Each frame: gone after `LAID_DAYS` (once the camera is not on it), hidden far off. */
  frame(camera: Camera, days: number): void;
  clear(): void;
}

const _v = new Vector3();

export function createLaidPool(): LaidPool {
  const object = new Group();
  object.name = 'roam:offerings-laid';
  const meshes: Mesh[] = [];
  const list: Laid[] = [];
  let next = 0;
  return {
    object,
    list,
    lay(kind, spot, x, y, z, yaw, scale, at) {
      let m = meshes[next];
      if (!m) {
        m = offerMesh(`offer:laid-${next}`);
        meshes[next] = m;
        object.add(m);
      }
      setOfferKind(m, kind, true);
      m.position.set(x, y, z);
      m.rotation.set(0, yaw, 0);
      m.scale.setScalar(scale);
      m.visible = true;
      const l = (list[next] ??= { kind, spot, x, y, z, yaw, scale, at, on: true });
      Object.assign(l, { kind, spot, x, y, z, yaw, scale, at, on: true });
      next = (next + 1) % MAX;
    },
    near(x, z, r) {
      let n = 0;
      for (const l of list) if (l.on && Math.hypot(l.x - x, l.z - z) < r) n++;
      return n;
    },
    frame(camera, days) {
      const c = camera.position;
      for (let i = 0; i < list.length; i++) {
        const l = list[i];
        const m = meshes[i];
        if (!l.on || !m) continue;
        const d = Math.hypot(l.x - c.x, l.y - c.y, l.z - c.z);
        // (its time over: taken away while nobody looks — the camera far, or turned from it)
        if (days - l.at > LAID_DAYS || days < l.at - 1) {
          camera.getWorldDirection(_v);
          const ahead = ((l.x - c.x) * _v.x + (l.y - c.y) * _v.y + (l.z - c.z) * _v.z) / Math.max(0.01, d);
          if (d > 30 || ahead < 0.3 || days - l.at > LAID_DAYS * 2) {
            l.on = false;
            m.visible = false;
            continue;
          }
        }
        m.visible = d < SEEN;
      }
    },
    clear() {
      for (const l of list) l.on = false;
      for (const m of meshes) m.visible = false;
    },
  };
}
