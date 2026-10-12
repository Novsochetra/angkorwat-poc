import { BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, MeshStandardMaterial, Quaternion, Sphere, Vector3, type Camera } from 'three';
import { hash3 } from '../../voxel/random';
import { pixelSize } from '../graphics';
import type { RoamWorld } from '../roam/types';
import type { PlantKindId } from './kinds';
import { fallenAt as coconutAt } from './models/coconut';
import { fallenAt as durianAt } from './models/durian';
import { fallenAt as sugarPalmAt } from './models/sugarPalm';
import { FRUIT_CAP, HUSK_DARK, NUT_RIPE, PALM_FRUIT } from './models/_palmKit';
import type { PlantLook } from './state';

/**
 * Ripe fruit lying under his trees and falling from them, drawn as smooth
 * low-poly shapes (garden/view.ts), not the models' blocks: a coconut is one
 * oval husk with soft facets and its three faint ridges, the dry star of its
 * sepals at the stem end, in the model's own browns (models/_palmKit.ts
 * `NUT_RIPE`, `HUSK_DARK`); a sugar palm fruit a glossy purple-black ball, its
 * olive cap of sepals (`PALM_FRUIT`, `FRUIT_CAP`); a durian a green-gold ball
 * bristling with pyramid thorns, its stout stalk (models/durian.ts' ripe
 * colours). Their models lay no blocks for them: this draws each where the
 * model's rule puts it (`fallenAt`, where he goes to pick it up), on the earth
 * there (the basin's floor, its bank, the grass, a lower terrace).
 *
 * **The fall** (garden/state.ts `fell`): each fruit lets go of the crown where
 * one hung (the blocks gone from it: garden/_viewDrop.ts `crownGone`) one after
 * the other, a little shiver first; it falls tumbling, hits the earth (the view
 * puffs the dust and plays the thud: `frame`'s landings), squashes a hair,
 * bounces, bounces again, a little, and rolls out from the trunk to where it
 * lies (a coconut about its long axis; a durian hardly rolls). Worked backward
 * from where it comes to rest, so nothing jumps when it stops.
 *
 * Lit as the scene is: a plain MeshStandardMaterial on instanced meshes with
 * instance colours, received shadows, no cast shadow — the very program the
 * buffalo's rope already uses (roam/_buffaloRide.ts; a sheen of its own is a
 * uniform, the same program), and in the scene from the start, hidden (the map
 * compiles hidden objects before Start too): no shader is compiled in the
 * middle of play. Two draws a kind (the bodies, the caps or thorns) while one
 * is near enough to see; none otherwise. A fixed pool, nothing allocated a frame.
 */

/** The kinds drawn here (the others keep their model's blocks, and _viewDrop.ts drops them). */
export const SMOOTH: ReadonlySet<PlantKindId> = new Set<PlantKindId>(['coconut', 'sugarPalm', 'durian']);

/** Fruit drawn at most (three a tree). */
const CAP = 36;
const G = 9.8;
/** Shown within this far (m), and while a fruit spans at least this many pixels. */
const FAR = 90;
const MIN_PX = 0.8;

// ── The shapes ─────────────────────────────────────────────────────────────

/**
 * A ring-built shape's soft facets: each corner's normal is its face's turned this share toward the smooth one
 * (0 flat facets, 1 smooth), the faces drawn apart (non-indexed).
 */
function soften(pos: readonly number[], idx: readonly number[], smoothK: number): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx.slice());
  g.computeVertexNormals();
  const sn = g.getAttribute('normal');
  const n = idx.length;
  const P = new Float32Array(n * 3);
  const N = new Float32Array(n * 3);
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const f = new Vector3();
  const s = new Vector3();
  for (let t = 0; t < n; t += 3) {
    a.fromArray(pos, idx[t] * 3);
    b.fromArray(pos, idx[t + 1] * 3);
    c.fromArray(pos, idx[t + 2] * 3);
    f.subVectors(c, b).cross(s.subVectors(a, b)).normalize();
    for (let k = 0; k < 3; k++) {
      const v = idx[t + k];
      P[(t + k) * 3] = pos[v * 3];
      P[(t + k) * 3 + 1] = pos[v * 3 + 1];
      P[(t + k) * 3 + 2] = pos[v * 3 + 2];
      s.set(sn.getX(v), sn.getY(v), sn.getZ(v)).multiplyScalar(smoothK).addScaledVector(f, 1 - smoothK).normalize();
      N[(t + k) * 3] = s.x;
      N[(t + k) * 3 + 1] = s.y;
      N[(t + k) * 3 + 2] = s.z;
    }
  }
  g.dispose();
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(P, 3));
  out.setAttribute('normal', new BufferAttribute(N, 3));
  out.computeBoundingSphere();
  return out;
}

/** Around a coconut (a multiple of 3: its three ridges run along corners). */
const SEG = 12;
/** Its rings from the tip (0) to the stem end (1). */
const RINGS = [0.07, 0.17, 0.3, 0.44, 0.58, 0.7, 0.8, 0.88, 0.94, 1];
/** Its half-width along it (0‥1 of the widest): a blunt point, widest past the middle, a broad stem end. */
const huskProfile = (v: number): number => (v < 0.6 ? Math.pow(Math.sin((Math.PI / 2) * (v / 0.6)), 0.62) : Math.sqrt(1 - 0.86 * ((v - 0.6) / 0.4) ** 2));
/** How far its three ridges stand out (a share of its width), fading toward the ends. */
const RIDGE = 0.085;

/**
 * A coconut in its husk, its long axis along y (the stem end up), `len` long and `wide` across: an egg a little
 * pointed at the tip, three-sided (its ridges), the stem end broad and a hair domed.
 */
function huskGeometry(len: number, wide: number): BufferGeometry {
  const R = wide / 2;
  const pos: number[] = [];
  const idx: number[] = [];
  // (the tip)
  pos.push(0, -len / 2 - 0.006, 0);
  for (let j = 0; j < RINGS.length; j++) {
    const v = RINGS[j];
    const y = -len / 2 + len * v;
    const r = R * huskProfile(v);
    const k = RIDGE * Math.sqrt(Math.sin(Math.PI * Math.min(0.98, v)));
    for (let i = 0; i < SEG; i++) {
      const th = (i / SEG) * Math.PI * 2;
      // (the ridges, and a hair of unevenness: a husk is not turned on a lathe)
      const rr = r * (1 + k * Math.cos(3 * th) + 0.03 * (hash3(i, j, 3, 8807) - 0.5));
      pos.push(Math.cos(th) * rr, y + 0.004 * (hash3(i, j, 5, 8807) - 0.5), Math.sin(th) * rr);
    }
  }
  // (the stem end's middle, a little domed)
  pos.push(0, len / 2 + 0.012, 0);
  const ring = (j: number, i: number) => 1 + j * SEG + (i % SEG);
  // (counter-clockwise seen from outside: the faces three draws)
  for (let i = 0; i < SEG; i++) idx.push(0, ring(0, i), ring(0, i + 1));
  for (let j = 0; j < RINGS.length - 1; j++)
    for (let i = 0; i < SEG; i++) {
      const a = ring(j, i);
      const b = ring(j, i + 1);
      const c = ring(j + 1, i + 1);
      const d = ring(j + 1, i);
      idx.push(a, c, b, a, d, c);
    }
  const top = pos.length / 3 - 1;
  const last = RINGS.length - 1;
  for (let i = 0; i < SEG; i++) idx.push(top, ring(last, i + 1), ring(last, i));
  return soften(pos, idx, 0.55);
}

/** The husk's surface at `rho` m from its axis near the stem end (its height, m): where the sepals lie. */
function huskTop(len: number, wide: number, rho: number): number {
  const R = wide / 2;
  const rEnd = R * huskProfile(1);
  if (rho <= rEnd) return len / 2 + 0.012 * (1 - rho / rEnd);
  const v = 0.6 + 0.4 * Math.sqrt(Math.max(0, (1 - (rho / R) ** 2) / 0.86));
  return -len / 2 + len * v;
}

/**
 * A cap of sepals lying on a fruit's top (its surface's height `top(rho)` at `rho` m from its axis): `n` pointed
 * sepals in two rings (the odd ones shorter), each a low leaf with a raised midrib, and the stub of its stalk.
 */
function starCap(top: (rho: number) => number, o: { n: number; outer: number; inner: number; half: number; rib: number; stub: number; stubH: number }): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const lift = 0.007;
  const at = (rho: number, th: number, up = 0) => {
    pos.push(Math.cos(th) * rho, top(rho) + lift + up, Math.sin(th) * rho);
    return pos.length / 3 - 1;
  };
  for (let b = 0; b < o.n; b++) {
    const outer = b % 2 === 0;
    const th = (b / o.n) * Math.PI * 2;
    const L = outer ? o.outer : o.inner;
    const half = o.half * (outer ? 1 : 0.82);
    const base = at(0.02, th);
    const left = at(L * 0.5, th - half);
    const right = at(L * 0.5, th + half);
    const tip = at(L, th, -0.004);
    const rib = at(L * 0.45, th, o.rib * (outer ? 1 : 0.7));
    idx.push(base, rib, left, left, rib, tip, tip, rib, right, right, rib, base);
  }
  // The stalk's stub: a short six-sided peg.
  const h = top(0) + lift;
  const n0 = pos.length / 3;
  for (let i = 0; i < 6; i++) {
    const th = (i / 6) * Math.PI * 2 + 0.3;
    pos.push(Math.cos(th) * o.stub, h - 0.004, Math.sin(th) * o.stub);
    pos.push(Math.cos(th) * o.stub * 0.82, h + o.stubH, Math.sin(th) * o.stub * 0.82);
  }
  pos.push(0, h + o.stubH + 0.002, 0);
  const c = pos.length / 3 - 1;
  for (let i = 0; i < 6; i++) {
    const a0 = n0 + i * 2;
    const a1 = n0 + ((i + 1) % 6) * 2;
    idx.push(a0, a0 + 1, a1 + 1, a0, a1 + 1, a1, a0 + 1, c, a1 + 1);
  }
  return soften(pos, idx, 0.2);
}

/** A ball, `r` m, its top a little flattened (`flat`), faintly three-lobed (`lobes`): a sugar palm fruit, a durian's body (`tall` its height over its width). */
function ballGeometry(r: number, tall: number, flat: number, lobes: number, seg: number, rings: number, smoothK: number): BufferGeometry {
  const pos: number[] = [0, -r * tall, 0];
  const idx: number[] = [];
  for (let j = 1; j < rings; j++) {
    const phi = Math.PI * (1 - j / rings);
    const y = Math.cos(phi) * r * tall * (Math.cos(phi) > 0 ? flat : 1);
    const rr = Math.sin(phi) * r;
    for (let i = 0; i < seg; i++) {
      const th = (i / seg) * Math.PI * 2;
      const k = 1 + lobes * Math.sin(phi) * Math.cos(3 * th) + 0.025 * (hash3(i, j, 7, 8809) - 0.5);
      pos.push(Math.cos(th) * rr * k, y, Math.sin(th) * rr * k);
    }
  }
  pos.push(0, r * tall * flat, 0);
  const ring = (j: number, i: number) => 1 + j * seg + (i % seg);
  const last = rings - 2;
  for (let i = 0; i < seg; i++) idx.push(0, ring(0, i), ring(0, i + 1));
  for (let j = 0; j < last; j++)
    for (let i = 0; i < seg; i++) {
      const a = ring(j, i);
      const b = ring(j, i + 1);
      const c = ring(j + 1, i + 1);
      const d = ring(j + 1, i);
      idx.push(a, c, b, a, d, c);
    }
  const top = pos.length / 3 - 1;
  for (let i = 0; i < seg; i++) idx.push(top, ring(last, i + 1), ring(last, i));
  return soften(pos, idx, smoothK);
}

/**
 * A durian's thorns and stalk: low pyramids standing out of its body all over (`r` wide, `tall` high over wide; none
 * round the stalk), each lit hard on its faces, and its stout woody stalk on top.
 */
function durianThorns(r: number, tall: number): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const n = 54;
  const t = new Vector3();
  const u = new Vector3();
  const v = new Vector3();
  const p = new Vector3();
  for (let i = 0; i < n; i++) {
    // (a Fibonacci sphere, the top round the stalk left bare)
    const y = 1 - (2 * (i + 0.5)) / n;
    if (y > 0.86) continue;
    const ring = Math.sqrt(1 - y * y);
    const th = i * 2.39996;
    p.set(Math.cos(th) * ring * r, y * r * tall, Math.sin(th) * ring * r);
    // (out from an ellipsoid: its normal)
    t.set(p.x / (r * r), p.y / (r * r * tall * tall), p.z / (r * r)).normalize();
    u.set(0, 1, 0).cross(t);
    if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
    u.normalize();
    v.crossVectors(t, u).normalize();
    const s = 0.03 + 0.008 * hash3(i, 1, 2, 8811);
    const out = 0.05 + 0.012 * hash3(i, 3, 4, 8811);
    const k = pos.length / 3;
    // (its base sunk a little into the body; turned a little each)
    const spin = hash3(i, 5, 6, 8811) * Math.PI;
    for (let c = 0; c < 4; c++) {
      const a = spin + (c * Math.PI) / 2;
      pos.push(p.x - t.x * 0.012 + (u.x * Math.cos(a) + v.x * Math.sin(a)) * s, p.y - t.y * 0.012 + (u.y * Math.cos(a) + v.y * Math.sin(a)) * s, p.z - t.z * 0.012 + (u.z * Math.cos(a) + v.z * Math.sin(a)) * s);
    }
    pos.push(p.x + t.x * out, p.y + t.y * out, p.z + t.z * out);
    for (let c = 0; c < 4; c++) idx.push(k + c, k + ((c + 1) % 4), k + 4);
  }
  // The stalk: a stout six-sided peg, a little flared at its foot.
  const h = r * tall - 0.01;
  const n0 = pos.length / 3;
  for (let i = 0; i < 6; i++) {
    const th = (i / 6) * Math.PI * 2;
    pos.push(Math.cos(th) * 0.04, h, Math.sin(th) * 0.04);
    pos.push(Math.cos(th) * 0.022, h + 0.09, Math.sin(th) * 0.022);
  }
  pos.push(0, h + 0.095, 0);
  const c = pos.length / 3 - 1;
  for (let i = 0; i < 6; i++) {
    const a0 = n0 + i * 2;
    const a1 = n0 + ((i + 1) % 6) * 2;
    idx.push(a0, a0 + 1, a1 + 1, a0, a1 + 1, a1, a0 + 1, c, a1 + 1);
  }
  return soften(pos, idx, 0);
}

interface Shape {
  readonly body: BufferGeometry;
  readonly cap: BufferGeometry;
  /** Its colours (sRGB): the body's, the cap's; its body's sheen (roughness: a sugar palm fruit is glossy). */
  readonly colors: readonly number[];
  readonly capColors: readonly number[];
  readonly rough: number;
  /** Half its length along its axis (the stem end up), half its width (m). */
  readonly a: number;
  readonly b: number;
  /** How it lies: on its side (its long axis level: a coconut), or its stalk up, leaning `lean` rad (a round fruit). */
  readonly lie: 'side' | 'up';
  readonly lean: readonly [number, number];
  /** How far it rolls out after the bounce (m), its first bounce's speed up over its speed down, its dust's size. */
  readonly roll: readonly [number, number];
  readonly bounce: number;
  readonly dust: number;
}

/**
 * The fruit as they lie, each played up a little from its real size (the explorer on the map is 2.4 m tall), so it
 * reads from the path, as the durian on the ground always was: a coconut 0.34 × 0.27 m (real ≈ 0.27), a sugar palm
 * fruit 0.22 m (real ≈ 0.18), a durian 0.4 m across its body, its thorns out of it.
 */
const COCO_LEN = 0.34;
const COCO_WIDE = 0.27;
const PALM_R = 0.11;
const DURIAN_R = 0.2;
const DURIAN_TALL = 1.13;
function shapes(): Partial<Record<PlantKindId, Shape>> {
  const palmTop = (rho: number) => Math.sqrt(Math.max(0, PALM_R * PALM_R - rho * rho)) * 0.94;
  return {
    coconut: {
      body: huskGeometry(COCO_LEN, COCO_WIDE),
      cap: starCap((rho) => huskTop(COCO_LEN, COCO_WIDE, rho), { n: 6, outer: COCO_WIDE * 0.36, inner: COCO_WIDE * 0.27, half: 0.34, rib: 0.014, stub: 0.024, stubH: 0.03 }),
      colors: NUT_RIPE,
      capColors: [HUSK_DARK, 0x4e3a28, 0x625038],
      rough: 0.92,
      a: COCO_LEN / 2,
      b: COCO_WIDE / 2,
      lie: 'side',
      lean: [0.06, 0.14],
      roll: [0.22, 0.38],
      bounce: 0.24,
      dust: 0.6,
    },
    sugarPalm: {
      body: ballGeometry(PALM_R, 1, 0.94, 0.045, 12, 9, 0.7),
      cap: starCap(palmTop, { n: 6, outer: PALM_R * 0.78, inner: PALM_R * 0.6, half: 0.42, rib: 0.012, stub: 0.016, stubH: 0.022 }),
      colors: PALM_FRUIT,
      capColors: FRUIT_CAP,
      rough: 0.42,
      a: PALM_R,
      b: PALM_R,
      lie: 'up',
      lean: [0.25, 1.35],
      roll: [0.3, 0.5],
      bounce: 0.3,
      dust: 0.35,
    },
    durian: {
      body: ballGeometry(DURIAN_R, DURIAN_TALL, 0.96, 0.03, 12, 9, 0.5),
      cap: durianThorns(DURIAN_R, DURIAN_TALL),
      // (models/durian.ts: its ripe green-brown, its thorns a little darker)
      colors: [0xae9a42, 0xb6a24a, 0xa4903c],
      capColors: [0x8a7a32, 0x7e6e2c, 0x948436],
      rough: 0.9,
      a: DURIAN_R * DURIAN_TALL + 0.03,
      b: DURIAN_R + 0.035,
      lie: 'up',
      lean: [0.3, 1.15],
      roll: [0.04, 0.1],
      bounce: 0.12,
      dust: 0.9,
    },
  };
}

// ── Where it lies ──────────────────────────────────────────────────────────

/** Where fallen fruit `i` of `look` lies (local m from the plant's foot: [x, z]), the models' own rule. */
export function fallenSpot(look: PlantLook, i: number): [number, number] | null {
  if (look.kind === 'coconut') return coconutAt(look, i);
  if (look.kind === 'sugarPalm') return sugarPalmAt(look, i);
  if (look.kind === 'durian') {
    const [x, , z] = durianAt(look, i);
    return [x, z];
  }
  return null;
}

// ── The fruit ──────────────────────────────────────────────────────────────

interface Fruit {
  /** Where it lies (world m: its middle) and its turn lying; its size and colours (linear). */
  rx: number;
  ry: number;
  rz: number;
  readonly q: Quaternion;
  sx: number;
  sy: number;
  sz: number;
  /** Its middle over the earth lying (m), its radius rolling (m). */
  h: number;
  rr: number;
  readonly color: Color;
  readonly capColor: Color;
  /** Rolling out from the trunk to where it lies: along (dx, dz), `roll` m, about (kx, 0, kz). */
  dx: number;
  dz: number;
  kx: number;
  kz: number;
  roll: number;
  /** Its fall (s from the tree's fall clock): when it lets go, from where (world), where it lands (its middle, world). */
  delay: number;
  fx: number;
  fy: number;
  fz: number;
  lx: number;
  ly: number;
  lz: number;
  /** Falling s; its bounces' speeds up and lengths (s); rolling s; its tumble's axis (level) and speed (rad/s). */
  tf: number;
  up1: number;
  tb1: number;
  up2: number;
  tb2: number;
  tr: number;
  ax: number;
  az: number;
  spin: number;
  /** Landed (its dust and thud given). */
  landed: boolean;
}

interface Rec {
  id: number;
  kind: PlantKindId;
  shape: Shape;
  /** The plant's foot (world m). */
  x: number;
  y: number;
  z: number;
  /** Fruit lying (or falling) now, of `fruit`. */
  n: number;
  readonly fruit: Fruit[];
  /** Its fall's clock (s; < 0: none), when its last fruit lies still. */
  t: number;
  end: number;
  /** Near enough to draw, as last judged. */
  near: boolean;
}

const newFruit = (): Fruit => ({
  rx: 0,
  ry: 0,
  rz: 0,
  q: new Quaternion(),
  sx: 1,
  sy: 1,
  sz: 1,
  h: 0.1,
  rr: 0.1,
  color: new Color(),
  capColor: new Color(),
  dx: 0,
  dz: 0,
  kx: 1,
  kz: 0,
  roll: 0,
  delay: 0,
  fx: 0,
  fy: 0,
  fz: 0,
  lx: 0,
  ly: 0,
  lz: 0,
  tf: 0,
  up1: 0,
  tb1: 0,
  up2: 0,
  tb2: 0,
  tr: 0,
  ax: 1,
  az: 0,
  spin: 0,
  landed: true,
});

const _q = new Quaternion();
const _q2 = new Quaternion();
const _v = new Vector3();
const _w = new Vector3();
const Y = new Vector3(0, 1, 0);
const _eye = new Vector3();

export class GroundFruit {
  /** Its meshes (the view adds it). */
  readonly object = new Group();
  private readonly shapes = shapes();
  /** The bodies' materials (a sheen of their own: a uniform, the one program) and the caps'. */
  private readonly materials: MeshStandardMaterial[] = [];
  /** Per kind: the bodies' and the caps' meshes (sharing their matrices). */
  private readonly meshes = new Map<PlantKindId, { body: InstancedMesh; cap: InstancedMesh; used: number }>();
  /** The same, as a list (walked each frame a fall plays: no iterator made). */
  private readonly meshList: { body: InstancedMesh; cap: InstancedMesh; used: number }[] = [];
  private readonly recs: Rec[] = [];
  private dirty = true;

  constructor(private readonly world: RoamWorld) {
    this.object.name = 'garden:fruit';
    const material = (rough: number) => {
      let m = this.materials.find((q) => q.roughness === rough);
      if (!m) {
        m = new MeshStandardMaterial({ color: 0xffffff, roughness: rough, metalness: 0 });
        m.name = 'garden:fruit';
        this.materials.push(m);
      }
      return m;
    };
    for (const kind of SMOOTH) {
      const sh = this.shapes[kind];
      if (!sh) continue;
      const matrix = new InstancedBufferAttribute(new Float32Array(CAP * 16), 16).setUsage(DynamicDrawUsage);
      const make = (geo: BufferGeometry, name: string) => {
        const m = new InstancedMesh(geo, material(name === 'body' ? sh.rough : 0.92), CAP);
        m.name = `garden:fruit:${kind}:${name}`;
        m.instanceMatrix = matrix;
        m.instanceColor = new InstancedBufferAttribute(new Float32Array(CAP * 3).fill(1), 3).setUsage(DynamicDrawUsage);
        m.count = 0;
        // (as the buffalo's rope: shadows received, none cast — the same program, compiled with the map's)
        m.castShadow = false;
        m.receiveShadow = true;
        m.boundingSphere = new Sphere(new Vector3(), 0);
        // (in the scene from the start, hidden: three compiles hidden objects too)
        m.visible = false;
        m.raycast = () => undefined;
        this.object.add(m);
        return m;
      };
      const pair = { body: make(sh.body, 'body'), cap: make(sh.cap, 'cap'), used: 0 };
      this.meshes.set(kind, pair);
      this.meshList.push(pair);
    }
  }

  /** The kinds it draws. */
  handles(kind: PlantKindId): boolean {
    return this.meshes.has(kind);
  }

  private rec(id: number): Rec | null {
    for (let i = 0; i < this.recs.length; i++) if (this.recs[i].id === id) return this.recs[i];
    return null;
  }

  /**
   * The fruit lying under plant `id` as its look has it now (its foot at x, y, z on the map, turned `yaw`; its basin's
   * bank `bank` m out, its top `bankTop` m high, the floor inside `floor` m). Called when its look changes.
   */
  lay(id: number, look: PlantLook, x: number, y: number, z: number, yaw: number, bank: number, bankTop: number, floor: number): void {
    const sh = this.shapes[look.kind];
    if (!sh || !this.meshes.has(look.kind)) return;
    let r = this.rec(id);
    const n = Math.min(3, look.fallen);
    if (!r) {
      if (!n) return;
      r = { id, kind: look.kind, shape: sh, x, y, z, n: 0, fruit: [newFruit(), newFruit(), newFruit()], t: -1, end: 0, near: false };
      this.recs.push(r);
    }
    r.x = x;
    r.y = y;
    r.z = z;
    // (a fall under way goes on when the look is built again with the same fruit)
    if (n !== r.n) r.t = -1;
    r.n = n;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const seed = Math.round(look.seed * 9973);
    for (let i = 0; i < n; i++) {
      const f = r.fruit[i];
      const at = fallenSpot(look, i);
      if (!at) continue;
      const [lx, lz] = at;
      const wx = x + lx * c + lz * s;
      const wz = z - lx * s + lz * c;
      const d = Math.hypot(lx, lz) || 1;
      // (out from the trunk, on the map)
      f.dx = (lx * c + lz * s) / d;
      f.dz = (-lx * s + lz * c) / d;
      f.kx = f.dz;
      f.kz = -f.dx;
      const rnd = (q: number) => hash3(seed, i, q, 6131);
      // Its size and colours.
      const k = 0.92 + 0.14 * rnd(1);
      f.sx = f.sz = k * (0.95 + 0.08 * rnd(2));
      f.sy = k * (0.94 + 0.1 * rnd(3));
      f.color.setHex(sh.colors[Math.floor(rnd(4) * sh.colors.length) % sh.colors.length]);
      f.capColor.setHex(sh.capColors[Math.floor(rnd(5) * sh.capColors.length) % sh.capColors.length]);
      // Where it lies: on the earth there (the basin's floor or bank, the grass, another terrace), sunk a hair.
      f.rx = wx;
      f.rz = wz;
      const lean = sh.lean[0] + (sh.lean[1] - sh.lean[0]) * rnd(9);
      if (sh.lie === 'side') {
        // Its turn: on its side, its long axis across the way it rolled (it rolls about it), the stem end a little up
        // (the husk is broadest there), which ridge is up seeded.
        const up = rnd(6) < 0.5 ? -1 : 1;
        _v.set(f.kx * up, Math.tan(lean), f.kz * up).normalize();
        _q.setFromUnitVectors(Y, _v);
      } else {
        // Its stalk up, leaning some way (round: it lies any way up).
        const a = rnd(6) * Math.PI * 2;
        _v.set(Math.cos(a), 0, Math.sin(a));
        _q.setFromAxisAngle(_v, lean);
      }
      _q2.setFromAxisAngle(Y, rnd(7) * Math.PI * 2);
      f.q.multiplyQuaternions(_q, _q2);
      // (its middle over the earth: half its height that way up, the up of the world in its own frame)
      _v.set(0, 1, 0).applyQuaternion(_q.copy(f.q).invert());
      f.h = Math.hypot(sh.b * f.sx * _v.x, sh.a * f.sy * _v.y, sh.b * f.sz * _v.z);
      f.rr = sh.b * f.sx;
      f.ry = this.earthAt(wx, wz, y, d, bank, bankTop, floor) + f.h - 0.02;
      f.roll = sh.roll[0] + (sh.roll[1] - sh.roll[0]) * rnd(8);
      f.landed = true;
    }
    this.dirty = true;
  }

  /** The earth's top at (wx, wz) (m), `d` m from the foot of a plant standing at height `y`. */
  private earthAt(wx: number, wz: number, y: number, d: number, bank: number, bankTop: number, floor: number): number {
    const land = this.world.field.heightAt(wx, wz);
    // (another terrace: its own land)
    if (Math.abs(land - y) > 0.3) return land;
    if (bank <= 0) return y;
    const off = Math.abs(d - bank);
    if (off < 0.14) return y + bankTop * (1 - 0.35 * (off / 0.14) ** 2);
    return d < bank ? y + floor : y;
  }

  /**
   * Its fruit fall now (it was just laid): from where fruit hung in the crown (`from`: local m from the foot, x, y, z
   * each; the nearest to each), else from up in the crown (`height` m tall); the plant turned `yaw`. `t0`: seconds
   * into it already (a shot's held fall).
   */
  fall(id: number, from: readonly number[], height: number, yaw: number, t0 = 0): void {
    const r = this.rec(id);
    if (!r || !r.n) return;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const used: number[] = [];
    r.end = 0;
    for (let i = 0; i < r.n; i++) {
      const f = r.fruit[i];
      const rnd = (q: number) => hash3(r.id, i, q, 6133);
      // From the nearest fruit gone from the crown (local: back from where it lies).
      const llx = (f.rx - r.x) * c - (f.rz - r.z) * s;
      const llz = (f.rx - r.x) * s + (f.rz - r.z) * c;
      let best = -1;
      let bd = Infinity;
      for (let j = 0; j + 2 < from.length; j += 3) {
        if (used.includes(j)) continue;
        const dd = Math.hypot(from[j] - llx, from[j + 2] - llz);
        if (dd < bd) {
          bd = dd;
          best = j;
        }
      }
      let ox = llx * 0.45;
      let oy = Math.max(1.5, height * 0.72);
      let oz = llz * 0.45;
      if (best >= 0) {
        used.push(best);
        ox = from[best];
        oy = from[best + 1];
        oz = from[best + 2];
      }
      f.fx = r.x + ox * c + oz * s;
      f.fy = r.y + oy;
      f.fz = r.z - ox * s + oz * c;
      // It lands short of where it lies and rolls out to it.
      f.lx = f.rx - f.dx * f.roll;
      f.lz = f.rz - f.dz * f.roll;
      f.ly = f.ry;
      const h = Math.max(0.3, f.fy - f.ly);
      f.tf = Math.sqrt((2 * h) / G);
      f.up1 = r.shape.bounce * G * f.tf * (0.9 + 0.2 * rnd(1));
      f.tb1 = (2 * f.up1) / G;
      f.up2 = f.up1 * 0.34;
      f.tb2 = (2 * f.up2) / G;
      f.tr = 0.5 + 0.2 * rnd(2);
      const a = rnd(3) * Math.PI * 2;
      f.ax = Math.cos(a);
      f.az = Math.sin(a);
      f.spin = (4.5 + 3.5 * rnd(4)) * (rnd(5) < 0.5 ? -1 : 1);
      f.delay = i * 0.42 + 0.08 * rnd(6);
      f.landed = false;
      r.end = Math.max(r.end, f.delay + f.tf + f.tb1 + f.tb2 + f.tr);
    }
    r.t = t0;
    this.dirty = true;
  }

  /** Falling now (the view shows the marker once it lies still). */
  falling(id: number): boolean {
    const r = this.rec(id);
    return !!r && r.t >= 0;
  }

  /** Checks: every fall held at `t` s (a shot's: `__gardenView.fall`). */
  hold(t: number): void {
    for (const r of this.recs)
      if (r.end > 0) {
        r.t = t;
        // (those already down puff their dust again: the still shows it)
        for (let i = 0; i < r.n; i++) r.fruit[i].landed = false;
        this.dirty = true;
      }
  }

  /** Plant `id` is gone: its fruit with it. */
  clear(id: number): void {
    const r = this.rec(id);
    if (!r) return;
    this.recs.splice(this.recs.indexOf(r), 1);
    this.dirty = true;
  }

  /**
   * Each frame: the falls move on (`dt` s; 0 in a shot), the near ones drawn. Landings this frame go into `land`
   * (x, y of the earth, z, the dust's size: 4 each); returns how many.
   */
  frame(dt: number, camera: Camera, land: Float32Array): number {
    let landings = 0;
    const e = camera.matrixWorld.elements;
    _eye.set(e[12], e[13], e[14]);
    const px = pixelSize(camera);
    let moving = false;
    for (let ri = 0; ri < this.recs.length; ri++) {
      const r = this.recs[ri];
      const d = Math.hypot(r.x - _eye.x, r.y - _eye.y, r.z - _eye.z);
      const near = r.n > 0 && d < FAR && (2 * r.shape.a) / Math.max(1e-3, d * px) >= MIN_PX;
      if (near !== r.near) {
        r.near = near;
        this.dirty = true;
      }
      if (r.t < 0) continue;
      r.t += dt;
      moving = true;
      for (let i = 0; i < r.n; i++) {
        const f = r.fruit[i];
        if (f.landed || r.t < f.delay + f.tf) continue;
        f.landed = true;
        if (landings * 4 + 3 < land.length) {
          land[landings * 4] = f.lx;
          land[landings * 4 + 1] = f.ly - f.h;
          land[landings * 4 + 2] = f.lz;
          land[landings * 4 + 3] = r.shape.dust;
          landings++;
        }
      }
      if (r.t >= r.end) r.t = -1;
    }
    if (moving || this.dirty) this.write();
    return landings;
  }

  /** Every near fruit's place, turn and colour into the meshes (and its bounds). */
  private write(): void {
    this.dirty = false;
    const list = this.meshList;
    for (let i = 0; i < list.length; i++) list[i].used = 0;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let ri = 0; ri < this.recs.length; ri++) {
      const r = this.recs[ri];
      if (!r.near) continue;
      const m = this.meshes.get(r.kind);
      if (!m) continue;
      const mat = m.body.instanceMatrix.array as Float32Array;
      const bc = m.body.instanceColor!.array as Float32Array;
      const cc = m.cap.instanceColor!.array as Float32Array;
      for (let i = 0; i < r.n && m.used < CAP; i++) {
        const f = r.fruit[i];
        const k = m.used++;
        pose(f, r.t);
        writeMatrix(mat, k, f);
        bc[k * 3] = f.color.r;
        bc[k * 3 + 1] = f.color.g;
        bc[k * 3 + 2] = f.color.b;
        cc[k * 3] = f.capColor.r;
        cc[k * 3 + 1] = f.capColor.g;
        cc[k * 3 + 2] = f.capColor.b;
        x0 = Math.min(x0, _p.x, f.rx);
        x1 = Math.max(x1, _p.x, f.rx);
        y0 = Math.min(y0, _p.y, f.ry);
        y1 = Math.max(y1, _p.y, f.ry);
        z0 = Math.min(z0, _p.z, f.rz);
        z1 = Math.max(z1, _p.z, f.rz);
      }
    }
    const rad = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + 0.5;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      const n = m.used;
      shown(m.body, n, x0, x1, y0, y1, z0, z1, rad);
      shown(m.cap, n, x0, x1, y0, y1, z0, z1, rad);
      if (n) {
        // (one matrix buffer for both: sent once)
        m.body.instanceMatrix.clearUpdateRanges();
        m.body.instanceMatrix.addUpdateRange(0, n * 16);
        m.body.instanceMatrix.needsUpdate = true;
      }
    }
  }

  /** Fruit lying or falling now (stats). */
  get shown(): number {
    let n = 0;
    for (const m of this.meshList) n += m.used;
    return n;
  }

  dispose(): void {
    for (const m of this.meshList) {
      m.body.dispose();
      m.cap.dispose();
    }
    for (const sh of Object.values(this.shapes)) {
      sh.body.dispose();
      sh.cap.dispose();
    }
    for (const m of this.materials) m.dispose();
    this.recs.length = 0;
  }
}

/** A mesh's `n` fruit drawn (none: not drawn), round their bounds, their colours sent. */
function shown(mesh: InstancedMesh, n: number, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, rad: number): void {
  mesh.count = n;
  mesh.visible = n > 0;
  if (!n) return;
  mesh.boundingSphere!.center.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  mesh.boundingSphere!.radius = rad;
  mesh.instanceColor!.clearUpdateRanges();
  mesh.instanceColor!.addUpdateRange(0, n * 3);
  mesh.instanceColor!.needsUpdate = true;
}

// ── Its pose at a moment ───────────────────────────────────────────────────

/** The pose worked out last: its middle (world), its turn, its squash (0: none; world up). */
const _p = new Vector3();
const _rot = new Quaternion();
let _squash = 0;

/** Turn `out` about the level axis (ax, 0, az) by `a` rad, before `q`. */
function about(out: Quaternion, ax: number, az: number, a: number, q: Quaternion): Quaternion {
  _w.set(ax, 0, az);
  return out.setFromAxisAngle(_w, a).multiply(q);
}

/** The squash of a landing `dt` s ago (a hair, gone in a tenth of a second). */
const squashAt = (dt: number, k: number): number => (dt >= 0 && dt < 0.12 ? k * Math.sin((Math.PI * dt) / 0.12) : 0);

/**
 * Where fruit `f` is at `t` s of its tree's fall (t < 0: lying still): its middle into `_p`, its turn into `_rot`,
 * its squash into `_squash`. Worked backward from where it lies: the roll ends there, the bounces end where the roll
 * begins, the tumble ends as it lands.
 */
function pose(f: Fruit, t: number): void {
  _squash = 0;
  if (t < 0) {
    _p.set(f.rx, f.ry, f.rz);
    _rot.copy(f.q);
    return;
  }
  const u = t - f.delay;
  const tLand = f.tf;
  const tB2 = tLand + f.tb1;
  const tRoll = tB2 + f.tb2;
  const tEnd = tRoll + f.tr;
  // How far along its roll it is (m), and the turn rolling that far gives (about its long axis).
  const rollAt = (dist: number) => about(_rot, f.kx, f.kz, -(f.roll - dist) / Math.max(0.05, f.rr), f.q);
  if (u >= tEnd) {
    _p.set(f.rx, f.ry, f.rz);
    _rot.copy(f.q);
    return;
  }
  if (u >= tLand) {
    // Bouncing (twice, along the first 60 % of its roll), then rolling to a stop (ease out).
    let dist: number;
    let y = f.ly;
    if (u < tRoll) {
      dist = f.roll * 0.6 * ((u - tLand) / Math.max(1e-3, tRoll - tLand));
      if (u < tB2) {
        const b = u - tLand;
        y += Math.max(0, f.up1 * b - 0.5 * G * b * b);
      } else {
        const b = u - tB2;
        y += Math.max(0, f.up2 * b - 0.5 * G * b * b);
      }
    } else {
      const v = (u - tRoll) / f.tr;
      dist = f.roll * (0.6 + 0.4 * (1 - (1 - v) * (1 - v)));
    }
    const w = dist / f.roll;
    _p.set(f.lx + (f.rx - f.lx) * w, y + (f.ry - f.ly) * w, f.lz + (f.rz - f.lz) * w);
    rollAt(dist);
    _squash = squashAt(u - tLand, 0.11) + squashAt(u - tB2, 0.05) + squashAt(u - tRoll, 0.025);
    return;
  }
  // Up in the tree (waiting its turn, a shiver as it lets go), then falling, tumbling.
  rollAt(0);
  _q.copy(_rot);
  if (u < 0) {
    _p.set(f.fx, f.fy, f.fz);
    about(_rot, f.ax, f.az, -f.spin * tLand, _q);
    // (a shiver as it lets go: a quarter of a second)
    if (u > -0.28) {
      _q2.copy(_rot);
      about(_rot, f.az, -f.ax, 0.16 * Math.sin(u * 38) * (1 + u / 0.28), _q2);
    }
    return;
  }
  const v = u / tLand;
  _p.set(f.fx + (f.lx - f.fx) * v, f.fy - 0.5 * G * u * u, f.fz + (f.lz - f.fz) * v);
  if (_p.y < f.ly) _p.y = f.ly;
  about(_rot, f.ax, f.az, -f.spin * (tLand - u), _q);
}

/** Fruit `f`'s matrix (its size, the pose's turn, squash and place) into slot `i` of `m`. */
function writeMatrix(m: Float32Array, i: number, f: Fruit): void {
  const { x, y, z, w } = _rot;
  // (the turn's matrix, rows r0..r2; each column times the fruit's size)
  const r00 = 1 - 2 * (y * y + z * z);
  const r01 = 2 * (x * y - w * z);
  const r02 = 2 * (x * z + w * y);
  const r10 = 2 * (x * y + w * z);
  const r11 = 1 - 2 * (x * x + z * z);
  const r12 = 2 * (y * z - w * x);
  const r20 = 2 * (x * z - w * y);
  const r21 = 2 * (y * z + w * x);
  const r22 = 1 - 2 * (x * x + y * y);
  // (squashed along the world's up, widened across)
  const sy = 1 - _squash;
  const sw = 1 + _squash * 0.5;
  const o = i * 16;
  m[o] = r00 * f.sx * sw;
  m[o + 1] = r10 * f.sx * sy;
  m[o + 2] = r20 * f.sx * sw;
  m[o + 3] = 0;
  m[o + 4] = r01 * f.sy * sw;
  m[o + 5] = r11 * f.sy * sy;
  m[o + 6] = r21 * f.sy * sw;
  m[o + 7] = 0;
  m[o + 8] = r02 * f.sz * sw;
  m[o + 9] = r12 * f.sz * sy;
  m[o + 10] = r22 * f.sz * sw;
  m[o + 11] = 0;
  m[o + 12] = _p.x;
  // (squashed, its middle comes down with it: its underside stays on the earth)
  m[o + 13] = _p.y - _squash * f.h;
  m[o + 14] = _p.z;
  m[o + 15] = 1;
}
