import { BoxGeometry, Color, Euler, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import type { SourceTrace } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { ANIM, perPeriod, SHOW, type Kit } from '../festival/_kit';
import { GLOW_MODE, type Glow } from '../festival/_glow';
import type { HeightField } from '../heightfield';
import type { Lamps } from '../landmarks/_prasatKit';
import { onTemple } from '../roam/_flag';
import { LAKE_STAGE } from './plan';
import { GOLD, pick, type Tones } from './_sqKit';

/**
 * The lake venue's shared bits (AWP-35, `lake.ts`): the stage's frame on the water, the woods and lacquer, the glowing
 * boxes (flames, gilt, bulbs, lantern glass: one unlit draw, over 1.0 at night), string lights (their wire in the
 * festival kit, their bulbs glowing, a halo now and then), hanging lanterns, the red banners with the white Angkor Wat
 * (three towers, roam/_flag.ts `onTemple`) as cloth in the kit, and the little wooden boats with their lanterns.
 *
 * Axes: +x east, −z north; a yaw is radians toward (sin, cos) in x, z.
 */

/** The stage's frame: its middle on the water, its front `f` (toward the shore and the crowd), its side `a` (local +x). */
export interface LakeFrame {
  x: number;
  z: number;
  yaw: number;
  /** The lake's level there and the deck's top (m). */
  water: number;
  deck: number;
  f: [number, number];
  a: [number, number];
  /** Map (x, z) of a point `u` m along the stage's width (local x) and `v` m toward the shore (local z). */
  at(u: number, v: number): [number, number];
  /** Back from the map into the stage's (u, v). */
  local(x: number, z: number): [number, number];
}

export function lakeFrame(field: HeightField): LakeFrame {
  const { x, z, yaw } = LAKE_STAGE;
  const f: [number, number] = [Math.sin(yaw), Math.cos(yaw)];
  const a: [number, number] = [Math.cos(yaw), -Math.sin(yaw)];
  // (the lake's level under the stage: its middle, else round it)
  let water = field.waterAt(x, z);
  for (let r = 2; water === null && r < 14; r += 2) water = field.waterAt(x - f[0] * r, z - f[1] * r);
  const w = water ?? 5;
  return {
    x,
    z,
    yaw,
    water: w,
    deck: w + LAKE_STAGE.deck,
    f,
    a,
    at: (u, v) => [x + a[0] * u + f[0] * v, z + a[1] * u + f[1] * v],
    local: (px, pz) => [(px - x) * a[0] + (pz - z) * a[1], (px - x) * f[0] + (pz - z) * f[1]],
  };
}

// ── Colours (sRGB) ───────────────────────────────────────────────────────────

/** Dark hardwood: posts, beams, the frame (oiled, wet-stained). */
export const TIMBER: Tones = [0x3e2c20, 0x4a3426, 0x36271c, 0x442f22];
/** Deck and jetty planks: weathered teak. */
export const PLANK: Tones = [0x7a5a3e, 0x6e5036, 0x86664a, 0x654830, 0x8c6c4c];
/** Red lacquer (the stage's skirt, the banner poles). */
export const LACQUER: Tones = [0x7a1c16, 0x8a2219, 0x6e1812];
/** Bundled bamboo floats. */
export const BAMBOO: Tones = [0x8f8250, 0x9a8c58, 0x837648, 0xa49660];
/** Rope lashings. */
export const ROPE = 0xb8a47a;
/** Lantern glass and paper, warm (bulbs a little whiter). */
export const LANTERN: readonly number[] = [0xffb860, 0xffc878, 0xffa850, 0xffd090];
export const BULB: readonly number[] = [0xffd79a, 0xffe2b0, 0xffc884, 0xfff0d0];
const WIRE = 0x262019;

export { GOLD, pick };
export type { Tones };

export const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ── The glowing boxes: flames, gilt, bulbs, lantern glass (one instanced draw, unlit) ──

export class Bodies {
  private readonly items: { p: [number, number, number]; s: [number, number, number]; c: number; k: number; ry: number }[] = [];
  readonly material = new MeshBasicMaterial({ color: 0xffffff });
  get count(): number {
    return this.items.length;
  }
  /** A glowing box: middle (world m), size, colour (sRGB) × brightness `k`, turned `ry`. */
  add(x: number, y: number, z: number, sx: number, sy: number, sz: number, c: number, k = 1, ry = 0): void {
    this.items.push({ p: [x, y, z], s: [sx, sy, sz], c, k, ry });
  }
  /**
   * The square's Khmer lamp (`_sqKit.ts` `khmerLamp`) puts its flame into a `Lamps`: this one takes it instead
   * (its point mapped by `map`, for lamps built in the stage's own frame), a halo into `glow`.
   */
  asLamps(glow: Glow | null, map: (p: [number, number, number]) => [number, number, number] = (p) => p, halo = 2.2): Lamps {
    const shim = {
      add: (p: [number, number, number], size = 0.5, k = 1) => {
        const [x, y, z] = map(p);
        this.add(x, y, z, size, size * 1.2, size, 0xffb050, 1.15 * k);
        glow?.add(x, y, z, 0xffb45a, halo, { level: 0.85 });
        return shim;
      },
    };
    return shim as unknown as Lamps;
  }
  build(name: string): { mesh: InstancedMesh; update(night: number, event: number): void } | null {
    if (!this.items.length) return null;
    const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), this.material, this.items.length);
    mesh.name = name;
    const m = new Matrix4();
    const q = new Quaternion();
    const e = new Euler();
    const v = new Vector3();
    const s = new Vector3();
    const c = new Color();
    this.items.forEach((it, i) => {
      q.setFromEuler(e.set(0, it.ry, 0));
      m.compose(v.set(...it.p), q, s.set(...it.s));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.setHex(it.c).multiplyScalar(it.k));
    });
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.raycast = () => {};
    mesh.computeBoundingSphere();
    const material = this.material;
    return {
      mesh,
      update(night, event) {
        const n = smooth(0.1, 0.85, night);
        // Gilt and glass by day (a little warm), over 1.0 at night for the bloom.
        material.color.setScalar((0.62 + 2.5 * n) * (1 + 0.22 * event));
      },
    };
  }
}

// ── String lights, lanterns ──────────────────────────────────────────────────

type V3 = { x: number; y: number; z: number };

/** A wire as thin kit boxes from p to q sagging `sag` m (still: the kit's world rig, no motion). */
export function wire(kit: Kit, p: V3, q: V3, sag: number, thick = 0.025): void {
  const len = Math.hypot(q.x - p.x, q.z - p.z);
  if (len < 0.2) return;
  const yaw = Math.atan2(q.x - p.x, q.z - p.z) - Math.PI / 2;
  const yAt = (t: number) => p.y + (q.y - p.y) * t - sag * 4 * t * (1 - t);
  const pieces = Math.max(3, Math.round(len / 1.6));
  for (let i = 0; i < pieces; i++) {
    const t0 = i / pieces;
    const t1 = (i + 1) / pieces;
    const x0 = p.x + (q.x - p.x) * t0;
    const x1 = p.x + (q.x - p.x) * t1;
    const z0 = p.z + (q.z - p.z) * t0;
    const z1 = p.z + (q.z - p.z) * t1;
    const y0 = yAt(t0);
    const y1 = yAt(t1);
    kit.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, y1 - y0, z1 - z0) + 0.02, thick, thick, WIRE, { yaw, roll: Math.atan2(y1 - y0, Math.hypot(x1 - x0, z1 - z0)) });
  }
}

/** A string of bulbs from p to q sagging `sag` m: the wire, a bulb every `every` m, a small halo on every `haloEvery`th. */
export function stringLights(kit: Kit, bodies: Bodies, glow: Glow | null, p: V3, q: V3, sag: number, every: number, haloEvery = 3): void {
  wire(kit, p, q, sag);
  const len = Math.hypot(q.x - p.x, q.z - p.z);
  const n = Math.max(2, Math.round(len / every));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x = p.x + (q.x - p.x) * t;
    const z = p.z + (q.z - p.z) * t;
    const y = p.y + (q.y - p.y) * t - sag * 4 * t * (1 - t) - 0.08;
    const c = BULB[Math.floor(hash3(x, z, i, 95) * BULB.length) % BULB.length];
    bodies.add(x, y, z, 0.11, 0.13, 0.11, c, 0.85 + 0.3 * hash3(x, z, i, 96));
    if (glow && i % haloEvery === 0) glow.add(x, y, z, c, 0.7, { level: 0.22 });
  }
}

/**
 * A hanging lantern on a cord `drop` m below (x, y, z): a glowing body under a little Angkor tower top (three
 * corbelled tiers, a gilt bud) on a dark wooden frame — Khmer, never a Chinese red lantern with tassels.
 */
export function towerLantern(b: VoxelBuilder, kit: Kit, bodies: Bodies, glow: Glow | null, x: number, y: number, z: number, drop: number, seed: number, src: SourceTrace | undefined, ry = 0): void {
  const top = y - drop;
  kit.box(x, (y + top) / 2, z, 0.02, drop, 0.02, WIRE);
  const col = LANTERN[Math.floor(hash3(x, z, seed, 94) * LANTERN.length) % LANTERN.length];
  b.box(x, top - 0.05, z, 0.07, 0.1, 0.07, pick(GOLD, x, z, 1, 94), 'mapStone', { src, shade: 1.1, ry });
  let yy = top - 0.1;
  for (const [i, w] of [0.14, 0.22, 0.3].entries()) {
    b.box(x, yy - 0.05, z, w, 0.1, w, pick(TIMBER, x, z, 2 + i, 94), 'mapStone', { src, shade: 1 + i * 0.03, ry });
    yy -= 0.1;
  }
  b.box(x, yy - 0.03, z, 0.44, 0.06, 0.44, pick(TIMBER, x, z, 6, 94), 'mapStone', { src, ry });
  yy -= 0.06;
  bodies.add(x, yy - 0.22, z, 0.34, 0.44, 0.34, col, 1, ry);
  b.box(x, yy - 0.47, z, 0.4, 0.06, 0.4, pick(TIMBER, x, z, 7, 94), 'mapStone', { src, ry });
  glow?.add(x, yy - 0.22, z, col, 2.6, { level: 0.75 });
}

/**
 * A tall red-lacquer pole on a laterite foot (its foot at y), a gilt collar and finial, a cross arm turned `ry` with a
 * tower lantern hanging at each end. Returns the point the string lights tie to (just under the finial).
 */
export function lanternPole(b: VoxelBuilder, kit: Kit, bodies: Bodies, glow: Glow | null, x: number, g: number, z: number, h: number, ry: number, src: SourceTrace | undefined): V3 {
  b.box(x, g + 0.2, z, 0.62, 0.4, 0.62, 0x8f6249, 'mapStone', { src, shade: 0.95 });
  b.box(x, g + 0.47, z, 0.44, 0.14, 0.44, 0xbfae90, 'mapStone', { src });
  b.box(x, g + h / 2, z, 0.2, h, 0.2, pick(LACQUER, x, z, 2, 92), 'mapStone', { src });
  b.box(x, g + h * 0.62, z, 0.28, 0.14, 0.28, pick(GOLD, x, z, 3, 92), 'mapStone', { src });
  b.box(x, g + h + 0.06, z, 0.3, 0.12, 0.3, pick(GOLD, x, z, 4, 92), 'mapStone', { src });
  b.box(x, g + h + 0.26, z, 0.14, 0.28, 0.14, pick(GOLD, x, z, 5, 92), 'mapStone', { src, shade: 1.08 });
  const ay = g + h * 0.72;
  b.box(x, ay, z, 1.9, 0.1, 0.1, pick(LACQUER, x, z, 6, 92), 'mapStone', { src, ry });
  const cx = Math.cos(ry);
  const cz = -Math.sin(ry);
  for (const s of [-1, 1]) towerLantern(b, kit, bodies, glow, x + cx * s * 0.85, ay - 0.05, z + cz * s * 0.85, 0.45, Math.round(x * 3 + s), src, ry);
  return { x, y: g + h - 0.15, z };
}

// ── Banners: red cloth with the white Angkor Wat, hanging from a bar ──────────

const BANNER_RED = 0xb8141c;
const BANNER_DEEP = 0x7a0c12;
const BANNER_GOLD = 0xe6b44a;
/** Swaying at about 1.6 rad/s (whole turns in the kit's period). */
const SWAY = perPeriod(1.6);

/**
 * A banner hanging from (x, top, z), facing `yaw`, `w` × `h` m: red, a gold band at the top and gold borders, the white
 * Angkor Wat (three towers) on its upper half, a gold band under it, a pointed foot. Cloth in the kit (columns of
 * runs of one colour), swaying a little at its foot.
 */
export function banner(kit: Kit, x: number, top: number, z: number, yaw: number, w: number, h: number, low: boolean, seed: number): void {
  const cols = low ? 9 : 15;
  const rows = low ? 28 : 46;
  const du = w / cols;
  const dv = h / rows;
  const ax = Math.cos(yaw);
  const az = -Math.sin(yaw);
  const tip = Math.round(rows * 0.12);
  const phase = hash3(x, z, seed, 3) * 6.28;
  const sq = { v0: 0.17, side: w * 0.78 };
  const colour = (c: number, r: number): number | null => {
    const u = (c + 0.5) / cols;
    const v = (r + 0.5) * dv;
    // (the pointed foot: the rows of the last `tip` narrow toward the middle)
    const fromFoot = rows - r;
    if (fromFoot <= tip && Math.abs(u - 0.5) > (fromFoot / tip) * 0.5) return null;
    if (r < 2) return BANNER_GOLD;
    if (c === 0 || c === cols - 1) return BANNER_GOLD;
    if (fromFoot <= tip && Math.abs(u - 0.5) > (fromFoot / tip) * 0.5 - 1 / cols) return BANNER_GOLD;
    // The temple on a square of the cloth (as the gate's banners: the flag's drawing, three towers).
    const ty = (v - sq.v0 * h) / sq.side;
    const tx = (u * w - (w - sq.side) / 2) / sq.side;
    if (tx >= 0 && tx <= 1 && ty >= 0 && ty <= 1 && onTemple(0.27 + tx * 0.46, 0.27 + ty * 0.46)) return 0xfffaf0;
    // (a gold band under it — on so few threads a lotus would read as a cross — and a thin deep-red frame inside the border)
    const lv = v - (sq.v0 * h + sq.side + 0.18);
    if (lv >= 0 && lv <= dv * 1.5 && c > 1 && c < cols - 2) return BANNER_GOLD;
    if (c === 1 || c === cols - 2) return BANNER_DEEP;
    return BANNER_RED;
  };
  for (let c = 0; c < cols; c++) {
    const off = -w / 2 + (c + 0.5) * du;
    let r0 = 0;
    while (r0 < rows) {
      const col = colour(c, r0);
      let r1 = r0 + 1;
      while (r1 < rows && colour(c, r1) === col) r1++;
      if (col !== null) {
        const len = (r1 - r0) * dv;
        const mid = r0 * dv + len / 2;
        const white = col === 0xfffaf0;
        // (the box's own x runs down the cloth: rolled −90°; waving grows from the bar down)
        kit.box(x + ax * off, top - mid, z + az * off, len + 0.002, du + 0.002, white ? 0.05 : 0.03, col, {
          yaw,
          roll: -Math.PI / 2,
          anim: ANIM.wave,
          a: [0.035, r0 * dv, SWAY],
          b: [phase, 0, 0, 0],
          glow: white ? 0.05 : 0.02,
        });
      }
      r0 = r1;
    }
  }
}

// ── The little boats moored round the stage ──────────────────────────────────

const HULL: Tones = [0x5a4030, 0x4e372a, 0x664936];
const HULL_PAINT = [0x2f6f8a, 0x8a2a22, 0x3d7a4a] as const;

/**
 * A small wooden boat (a Tonle Sap skiff: long and narrow, its bow and stern rising) on the water at (x, wy, z), its
 * length along `yaw`, bobbing (the kit's drift); a bamboo pole at its stern with a lantern (glowing, a halo, its streak
 * on the water at night). In the kit: no walk map (the roaming boat passes through it, as through the festival's).
 */
export function boat(kit: Kit, glow: Glow, x: number, wy: number, z: number, yaw: number, seed: number, lantern: boolean): void {
  const drift = { a: [0, hash3(seed, 1, 2, 61), 0.04] as [number, number, number], b: [0, 0, perPeriod(0.25 + 0.1 * hash3(seed, 2, 2, 61)), 0] as [number, number, number, number] };
  const d = { anim: ANIM.drift, a: drift.a, b: drift.b };
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const L = 5.2;
  const paint = HULL_PAINT[seed % HULL_PAINT.length];
  const at = (s: number) => [x + fx * s, z + fz * s] as const;
  // The hull: a flat bottom, sides drawing in toward the ends, a painted strake, raised ends.
  const seg = 6;
  for (let i = 0; i < seg; i++) {
    const s = -L / 2 + ((i + 0.5) * L) / seg;
    const k = 1 - Math.pow(Math.abs(s) / (L / 2), 2.2);
    const wdt = 0.36 + 0.62 * k;
    const [cx, cz] = at(s);
    const len = L / seg + 0.02;
    kit.box(cx, wy + 0.06, cz, wdt * 0.82, 0.12, len, pick(HULL, seed, i, 1), { ...d, yaw });
    for (const side of [-1, 1]) {
      const ox = Math.cos(yaw) * side * wdt * 0.46;
      const oz = -Math.sin(yaw) * side * wdt * 0.46;
      kit.box(cx + ox, wy + 0.24, cz + oz, 0.07, 0.36, len, pick(HULL, seed, i, 2 + side), { ...d, yaw });
      kit.box(cx + ox * 1.04, wy + 0.4, cz + oz * 1.04, 0.08, 0.06, len, paint, { ...d, yaw });
    }
  }
  for (const end of [-1, 1]) {
    const [cx, cz] = at(end * (L / 2 + 0.12));
    kit.box(cx, wy + 0.42, cz, 0.18, 0.5, 0.3, pick(HULL, seed, 9, end), { ...d, yaw, pitch: -end * 0.35 });
  }
  // Thwarts.
  for (const s of [-1.1, 0.4]) {
    const [cx, cz] = at(s);
    kit.box(cx, wy + 0.34, cz, 0.86, 0.05, 0.22, pick(HULL, seed, 7, s > 0 ? 1 : 2), { ...d, yaw });
  }
  if (!lantern) return;
  // The stern pole and its lantern.
  const [px, pz] = at(-L / 2 + 0.55);
  kit.box(px, wy + 1.15, pz, 0.06, 1.7, 0.06, 0xb09a68, d);
  const [lx, lz] = [px + fx * 0.32, pz + fz * 0.32];
  kit.box(px + fx * 0.16, wy + 1.95, pz + fz * 0.16, 0.05, 0.05, 0.38, 0xb09a68, { ...d, yaw });
  kit.box(lx, wy + 1.62, lz, 0.22, 0.3, 0.22, LANTERN[seed % LANTERN.length], { ...d, glow: 2.4 });
  kit.box(lx, wy + 1.8, lz, 0.28, 0.06, 0.28, 0x3a2a1e, d);
  glow.add(lx, wy + 1.62, lz, 0xffb050, 2.2, { drift, level: 0.7 });
  glow.add(lx, wy + 0.01, lz, 0xffa040, 9, { drift, mode: GLOW_MODE.streak, level: 1.6, width: 0.4 });
}

/** Ripples where the floats meet the water: pale thin boxes bobbing round them (always shown). */
export function lap(kit: Kit, x: number, wy: number, z: number, len: number, yaw: number, seed: number): void {
  const drift = { a: [0, hash3(seed, 3, 1, 62), 0.05] as [number, number, number], b: [0, 0, perPeriod(0.5 + 0.3 * hash3(seed, 4, 1, 62)), 0] as [number, number, number, number] };
  kit.box(x, wy + 0.015, z, len, 0.02, 0.16, 0xc8d6d2, { yaw, anim: ANIM.drift, a: drift.a, b: drift.b, show: SHOW.always, glow: 0.04 });
}
