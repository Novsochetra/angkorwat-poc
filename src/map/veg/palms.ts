import { Box3, BoxGeometry, BufferAttribute, BufferGeometry, Color, DoubleSide, Group, InstancedBufferAttribute, InstancedBufferGeometry, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshDepthMaterial, MeshStandardMaterial, Quaternion, Sphere, Vector3, type Camera, type Object3D, type WebGLProgramParametersWithUniforms } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import { graphicsNow } from '../graphics';
import { fadeNearMaterial } from '../roam/_nearFade';
import type { MapFrame, Subject } from '../types';
import { finishProto, Vol, type FreeBox, type Proto } from './proto';
import { SWAY, SWAY_GLSL } from './sway';

/**
 * Real palm trees, for every part that plants them:
 *
 * - the **sugar palm** (ត្នោត thnot, Borassus flabellifer, Cambodia's tree):
 *   one very straight dark grey trunk, slightly swollen at the foot, ringed
 *   lower down and rough with old leaf bases under the crown; a dense round
 *   crown of ~30 stiff pleated fan leaves on long stalks, the young ones up,
 *   the old ones out and drooping; a skirt of dead brown fans under them,
 *   dark purple fruit and flower stalks at the crown's base (where the
 *   tapper works);
 * - the **coconut palm** (Cocos nucifera): a slender pale ringed trunk that
 *   leans and curves back up, a crown of long feather fronds (4–6 m) arching
 *   out and drooping, a bunch of coconuts under them.
 *
 * Plant them with {@link Palms} (or {@link plantPalms}): a part adds the
 * built `object` to its own and, if it can, calls `update(f)` every frame
 * (it hides the leaves of palms that are all far; without it they still
 * draw right). Everything is instanced: at most three draws for all the
 * palms of a part (blocks, fans, fronds) and their shadows; the trunks are
 * also bark blocks nobody sees, solid in the roaming walk map. The pieces are
 * posed in the vertex shader: the trunk bends a little with the land's wind
 * (veg/sway.ts: `f.weather.wind`, the top moving most), the leaves flutter
 * and stream downwind. Two levels of detail per palm, by its distance from
 * the camera: near, every fan and frond (≤ ~110 pieces a palm); far, a few
 * blocks that keep the silhouette (≤ ~25); one dissolves into the other
 * over a few metres (`NEAR`, nearer on low). Leaves glow a little with the
 * low sun behind them.
 *
 * The jungle's palms (the vegetation part's scatter) are voxel prototypes
 * on its lattice ({@link palmProto}, via veg/species.ts `palm()`): the same
 * two palms as upright blocks and slabs, in the jungle's blocks.
 *
 * The tappers (hamlet/_palmSugar.ts) build on {@link SUGAR_PALM},
 * {@link sugarPalmCrownBase}, {@link sugarPalmTrunkRadius} and
 * {@link sugarPalmWork}: a sugar palm of height `h` standing at ground `y`
 * has its crown's base — the flower stalks, where the tapper works and his
 * bamboo ladder ends — at `y + h − 1.6`; its trunk is 0.6 m across at the
 * foot (over the swelling) and 0.45 m at the top. A palm planted `tapped`
 * has bamboo tubes hanging at its flower stalks (on the ladder's side) and
 * its dead and lowest fans cut away; the ladder is the caller's.
 *
 * URL (for checking): `palms=near|far` holds every palm at one level of
 * detail; `palmstats` logs each planting (palms, pieces, draws).
 */

// ── The numbers the tappers build on ───────────────────────────────────────

/** A sugar palm's measures (m). */
export const SUGAR_PALM = {
  /** The crown's base (the flower stalks, the ladder's top) under the palm's height `h` (the heart of its crown). */
  crownDrop: 1.6,
  /** Trunk width over the swollen foot, and at the crown's base. */
  foot: 0.6,
  top: 0.45,
  /** The swollen foot: its width on the ground, and how high it swells. */
  swell: 0.86,
  swellTop: 0.8,
  /** The old leaf bases under the crown (from the crown's base up) stand out to this half width. */
  boots: 0.36,
  /** How far the youngest fans reach over `h`. */
  over: 2.4,
} as const;

/** Height (over the ground) of a sugar palm's crown base — its flower stalks, where the tapper works and his ladder ends — for a palm of height `h`. */
export const sugarPalmCrownBase = (h: number): number => h - SUGAR_PALM.crownDrop;

/**
 * Half the width of a sugar palm's trunk (m) at `above` m over its foot, for
 * a palm of height `h` (a ladder leans on it): the swollen foot, then
 * straight from 0.6 m across down low to 0.45 m at the crown's base; over
 * that the old leaf bases (`SUGAR_PALM.boots`).
 */
export function sugarPalmTrunkRadius(h: number, above: number): number {
  const P = SUGAR_PALM;
  const base = sugarPalmCrownBase(h);
  if (above >= base) return P.boots;
  if (above < P.swellTop) {
    const t = 1 - Math.max(0, above) / P.swellTop;
    return (P.foot + (P.swell - P.foot) * t * t) / 2;
  }
  const t = (above - P.swellTop) / Math.max(1, base - P.swellTop);
  return (P.foot + (P.top - P.foot) * t) / 2;
}

/**
 * How much a palm bends in the wind: its top moves `flex · h · swayAt(foot)`
 * (veg/sway.ts), a point `above` m up as the square of its share of `h`, the
 * foot not at all. Things lashed to a trunk (a tapper's ladder) move the
 * same way: {@link palmBend}.
 */
export const PALM_FLEX: Record<PalmKind, number> = { sugar: 0.2, coconut: 0.34 };

/**
 * How far the wind moves a point `above` m over a palm's foot now (x, z, m):
 * the vertex shader's sums on the CPU (the land's sway from veg/sway.ts's
 * shared uniforms), for what is fixed to the trunk.
 */
export function palmBend(s: PalmSpec, above: number, out: { x: number; z: number }): { x: number; z: number } {
  const up = Math.min(1.3, Math.max(0, above / s.h));
  const k = PALM_FLEX[s.kind] * s.h * up * up;
  swayAtCpu(s.x, s.z, out);
  out.x *= k;
  out.z *= k;
  return out;
}

/** veg/sway.ts `swayAt` on the CPU (the same uniforms). */
function swayAtCpu(x: number, z: number, out: { x: number; z: number }): void {
  const ph = Math.sin(x * 0.13 + z * 0.07) * 1.7 + Math.sin(z * 0.11 - x * 0.05) * 1.3 + x * 0.021 + z * 0.017;
  const t = SWAY.uSwayTime.value;
  const w = SWAY.uSwayWind.value;
  const dx = SWAY.uSwayDir.value.x;
  const dz = SWAY.uSwayDir.value.y;
  const rock = Math.sin(t * 1.3 + ph) + 0.35 * Math.sin(t * 2.3 + ph * 1.7);
  const roll = Math.sin(t * 0.9 + ph * 1.2 + 1.3);
  const k = 0.035 + 0.1 * w;
  const gust = 0.5 + 0.5 * Math.sin(t * 0.55 - (x * dx + z * dz) * 0.045 + ph * 0.25);
  const lean = w * (0.08 + 0.15 * gust);
  out.x = (dx * rock - dz * roll * 0.6) * k + dx * lean;
  out.z = (dz * rock + dx * roll * 0.6) * k + dz * lean;
}

// ── Planting ───────────────────────────────────────────────────────────────

export type PalmKind = 'sugar' | 'coconut';

/** One palm to plant (world, m). */
export interface PalmSpec {
  kind: PalmKind;
  /** The foot: the trunk's middle on the ground. */
  x: number;
  y: number;
  z: number;
  /**
   * Height (m). Sugar palm: the heart of its crown over the foot, where the
   * trunk ends and the fans spring from (9–16 on the map; the crown's base
   * is 1.6 m under it, the youngest fans reach 2.4 m over it). Coconut palm:
   * the trunk's height to its crown (7–12).
   */
  h: number;
  /** The same palm every run. */
  seed: number;
  /** Coconut: how far the top of the trunk leans from over the foot (x, z, m; default a hashed 1–2.5 m). Sugar palms stand straight. */
  lean?: [number, number];
  /** Sugar palm tapped for its juice: bamboo tubes hang at its flower stalks, its dead fans are cut away and the lowest living ones trimmed. */
  tapped?: boolean;
  /** A tapped palm's flower stalks and tubes: false leaves them to the caller (its own gear); default true. */
  tubes?: boolean;
  /**
   * Sugar palm: the side its ladder leans on (radians from +z toward +x, as
   * `atan2(dx, dz)` from the trunk to the ladder): the tubes hang on that
   * side, and nothing hangs down there under the crown's base.
   */
  ladder?: number;
}

/** Where the work is on a sugar palm (world, m). */
export interface PalmWork {
  /** The crown's base: the ladder's top, the tapper's feet a little under it. */
  base: number;
  /** The bamboo tubes (tapped palms): the middle of each, and its top. */
  tubes: { x: number; y: number; z: number; top: number }[];
}

/** The palms of one part, built: add `object` to the part's own. */
export interface PalmSet {
  object: Object3D;
  /** Every frame (optional): the leaves of palms that are all far are not drawn at all. */
  update(f: MapFrame): void;
  /** The sugar palms, for the nature book (`sugarPalm`): the crown and the top of the trunk. */
  subjects(out: Subject[]): void;
  /** Palms planted. */
  palms: number;
  /** Pieces (instances) near and far, for the budget lines. */
  pieces: number;
}

export interface PalmBuildOptions {
  /** Name of the object and its meshes (default `palms`). */
  name?: string;
  /** Cast shadows (default true). */
  shadows?: boolean;
}

/**
 * A planting of palms: `add` each, then `build` once. Seeded: the same
 * palms every run.
 */
export class Palms {
  private readonly specs: PalmSpec[] = [];

  add(spec: PalmSpec): this {
    this.specs.push(spec);
    return this;
  }

  get list(): readonly PalmSpec[] {
    return this.specs;
  }

  build(opts: PalmBuildOptions = {}): PalmSet {
    return buildPalms(this.specs, opts);
  }
}

/** Plant palms at once (see {@link Palms}). */
export function plantPalms(specs: readonly PalmSpec[], opts: PalmBuildOptions = {}): PalmSet {
  return buildPalms(specs, opts);
}

/**
 * The tapper's places on a sugar palm (the same the build uses): the crown's
 * base, and where the bamboo tubes hang (none unless `tapped`).
 */
export function sugarPalmWork(s: PalmSpec): PalmWork {
  const base = s.y + sugarPalmCrownBase(s.h);
  const tubes = s.kind === 'sugar' && s.tapped && s.tubes !== false ? flowerStalks(s).map((f) => ({ x: f.tx, y: f.ty - TUBE_LEN / 2 + 0.06, z: f.tz, top: f.ty + 0.06 })) : [];
  return { base, tubes };
}

// ── Colours (sRGB) ─────────────────────────────────────────────────────────

/** Sugar palm: the trunk dark grey to near black, a little paler and dustier low down. */
const SUGAR_TRUNK = [0x3f3c38, 0x47433e, 0x393633, 0x4e4943];
const SUGAR_TRUNK_LOW = 0x59544c;
/** The old leaf bases under the crown: grey-brown, split and weathered. */
const BOOTS = [0x4d4236, 0x574a3b, 0x43392f, 0x5e5140];
/** The heart of the crown and the living leaves' stalks. */
const HEART = 0x505236;
const STALK = [0x66663c, 0x5c5d37, 0x6f6c41];
/** Fans: young ones yellow-green; the crown a dull grey-green; the oldest yellowing. */
const FAN_YOUNG = [0x7f9c56, 0x89a45c, 0x769450];
const FAN = [0x5a7a44, 0x64824a, 0x55723e, 0x6b864e, 0x5f7c43];
const FAN_OLD = [0x6c7842, 0x777f44, 0x807d42];
/** Dead fans hanging under the crown. */
const DEAD = [0x7d6242, 0x6f573a, 0x86694a, 0x62503a, 0x74604a];
/** Fruit: round, dark purple-black; the flower stalks tan. */
const FRUIT = [0x2c2228, 0x36282f, 0x3e2d33];
const FLOWER = [0x9b8558, 0x8d7749, 0xa89060];
/** Bamboo tubes, and their darker rim and node. */
const TUBE = [0xc4ae72, 0xb79f64, 0xcdb87e];
const TUBE_RIM = 0x7d6c40;

/** Coconut palm: the trunk pale grey-brown, ringed. */
const COCO_TRUNK = [0x8e806c, 0x998a75, 0x817461, 0x9d8f7a];
const COCO_SHAFT = 0x77804a;
const FROND = [0x6a9a38, 0x74a540, 0x5f8d32, 0x7fac47];
const FROND_OLD = [0x97a040, 0xa59e49, 0x8e993a];
const DEAD_FROND = [0x8b6f45, 0x7d6341, 0x957a50];
/** Coconuts: green, some golden (king coconuts), some ripe brown. */
const NUT = [0x5d8a2e, 0x6a9832, 0x74963a, 0xc39838, 0x7b5b37];

const pick = (list: readonly number[], r: number): number => list[Math.min(list.length - 1, Math.floor(r * list.length))];

// ── Pieces ─────────────────────────────────────────────────────────────────

/** Level of detail of a piece: drawn at both, near only, far only. */
const BOTH = 0;
const NEAR_ONLY = 1;
const FAR_ONLY = 2;

/** Trunk patterns (box pieces): none, the sugar palm's rings, the coconut's rings, leaf bases. */
const PAT_NONE = 0;
const PAT_SUGAR = 1;
const PAT_COCO = 2;
const PAT_BOOTS = 3;

/** Instanced pieces of one kind (blocks, fans or fronds): their attributes, as written. */
class Pieces {
  /** Origin (world) and level of detail. Blocks: the middle; leaves: the stalk's root. */
  readonly c: number[] = [];
  /** Axes (world). Blocks: scaled by the size; leaves: unit (x across, y the upper side, z along). */
  readonly x: number[] = [];
  readonly y: number[] = [];
  readonly z: number[] = [];
  /** The palm's foot and height (the trunk's bend). */
  readonly f: number[] = [];
  /** Colour (linear) and trunk pattern (blocks) or tip tone (leaves). */
  readonly k: number[] = [];
  /** Leaves: stalk length (m), blade scale, bend (1/m); all: how much the palm bends in the wind. */
  readonly m: number[] = [];

  get count(): number {
    return this.c.length / 4;
  }
}

const _col = new Color();
const _a = new Vector3();
const _b = new Vector3();
const _u = new Vector3();
const _d = new Vector3();
const UP = new Vector3(0, 1, 0);

/** Writes one palm's pieces: the palm being built (foot, height, flex) and its level of detail. */
class Writer {
  readonly box = new Pieces();
  readonly fan = new Pieces();
  readonly frond = new Pieces();
  /** The palm being written. */
  fx = 0;
  fy = 0;
  fz = 0;
  fh = 10;
  flex = 0.2;
  lod = BOTH;

  palm(x: number, y: number, z: number, h: number, flex: number): void {
    this.fx = x;
    this.fy = y;
    this.fz = z;
    this.fh = h;
    this.flex = flex;
    this.lod = BOTH;
  }

  private put(p: Pieces, cx: number, cy: number, cz: number, X: Vector3, Y: Vector3, Z: Vector3, hex: number, shade: number, k: number, m0: number, m1: number, m2: number): void {
    p.c.push(cx, cy, cz, this.lod);
    p.x.push(X.x, X.y, X.z);
    p.y.push(Y.x, Y.y, Y.z);
    p.z.push(Z.x, Z.y, Z.z);
    p.f.push(this.fx, this.fy, this.fz, this.fh);
    _col.setHex(hex).multiplyScalar(shade);
    p.k.push(_col.r, _col.g, _col.b, k);
    p.m.push(m0, m1, m2, this.flex);
  }

  /** An upright block centred at (x, y, z), turned by `yaw`. */
  block(x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number, hex: number, shade = 1, pattern = PAT_NONE): void {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    _a.set(c * sx, 0, -s * sx);
    _b.set(0, sy, 0);
    _u.set(s * sz, 0, c * sz);
    this.put(this.box, x, y, z, _a, _b, _u, hex, shade, pattern, 0, 0, 0);
  }

  /**
   * A block along the direction (dx, dy, dz) from (x, y, z), `len` long,
   * `w` wide and `t` thick, spun by `spin` about its length.
   */
  stick(x: number, y: number, z: number, dx: number, dy: number, dz: number, len: number, w: number, t: number, hex: number, shade = 1, spin = 0, pattern = PAT_NONE): void {
    const n = Math.hypot(dx, dy, dz) || 1;
    dx /= n;
    dy /= n;
    dz /= n;
    _b.set(dx, dy, dz);
    if (Math.abs(dy) > 0.98) _a.set(1, 0, 0);
    else _a.crossVectors(_b, UP).normalize();
    _u.crossVectors(_a, _b);
    if (spin) {
      const c = Math.cos(spin);
      const s = Math.sin(spin);
      _d.copy(_a).multiplyScalar(c).addScaledVector(_u, -s);
      _u.multiplyScalar(c).addScaledVector(_a, s);
      _a.copy(_d);
    }
    _a.multiplyScalar(w);
    _u.multiplyScalar(t);
    const h = len / 2;
    _b.multiplyScalar(len);
    this.put(this.box, x + dx * h, y + dy * h, z + dz * h, _a, _b, _u, hex, shade, pattern, 0, 0, 0);
  }

  /**
   * A leaf (a fan or a frond) from its root (x, y, z): pointing along
   * azimuth `az` (radians from +z toward +x) and elevation `el`, its blade
   * turned `roll` about that line from lying face up. `stalk`: the stalk's
   * (fan) or the midrib's (frond) length; `scale`: the blade's (m);
   * `bend`: how it curves down (1/m).
   */
  leaf(kind: 'fan' | 'frond', x: number, y: number, z: number, az: number, el: number, roll: number, stalk: number, scale: number, bend: number, hex: number, shade = 1, tip = 1): void {
    const ce = Math.cos(el);
    const se = Math.sin(el);
    const ca = Math.cos(az);
    const sa = Math.sin(az);
    // Z along the leaf; X0 across it, level; Y0 its upper side (Z × X0).
    _u.set(sa * ce, se, ca * ce);
    const x0x = ca;
    const x0z = -sa;
    const y0x = -se * sa;
    const y0y = ce;
    const y0z = -se * ca;
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    _a.set(x0x * cr + y0x * sr, y0y * sr, x0z * cr + y0z * sr);
    _b.set(y0x * cr - x0x * sr, y0y * cr, y0z * cr - x0z * sr);
    this.put(kind === 'fan' ? this.fan : this.frond, x, y, z, _a, _b, _u, hex, shade, tip, stalk, scale, bend);
  }
}

// ── Sugar palm ─────────────────────────────────────────────────────────────

/** A flower stalk at the crown's base: where it leaves the trunk, and its tip (where a tube hangs). */
interface FlowerStalk {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
}
const TUBE_LEN = 0.55;

/** The sugar palm's turn (radians): hashed, the same for every use. */
const sugarTurn = (s: PalmSpec) => hash3(s.seed, 1, 17, 9431) * Math.PI * 2;

/** The flower stalks round the crown's base (tapped palms: on the ladder's side). */
function flowerStalks(s: PalmSpec): FlowerStalk[] {
  const r = (q: number) => hash3(s.seed, q, 29, 9433);
  const base = s.y + sugarPalmCrownBase(s.h);
  const n = s.tapped ? 3 : 2 + Math.floor(r(1) * 2);
  const out: FlowerStalk[] = [];
  const mid = s.ladder ?? sugarTurn(s) + 1.3;
  /** Tapped: either side of the ladder (not over it: he stands there) and one round the side, within his reach. */
  const TAPPED = [-0.95, 0.95, 1.85];
  for (let i = 0; i < n; i++) {
    const az = s.tapped ? mid + TAPPED[i] + (r(10 + i) - 0.5) * 0.2 : mid + i * 2.4 + r(10 + i);
    const dx = Math.sin(az);
    const dz = Math.cos(az);
    const y0 = base + 0.95 + r(20 + i) * 0.2;
    const reach = 0.52 + r(30 + i) * 0.12;
    out.push({ x: s.x + dx * 0.3, y: y0, z: s.z + dz * 0.3, tx: s.x + dx * reach, ty: base + 0.3 + r(40 + i) * 0.08, tz: s.z + dz * reach });
  }
  return out;
}

/** A sugar palm: trunk, leaf bases, crown of fans, dead fans, fruit or flower stalks (and the tubes of a tapped one). */
function sugarPalm(w: Writer, s: PalmSpec): void {
  const r = (q: number) => hash3(s.seed, q, 17, 9431);
  const { x, y, z } = s;
  // (a young palm at the least: the trunk must reach over its swollen foot)
  const h = Math.max(4, s.h);
  const P = SUGAR_PALM;
  const top = y + h;
  const base = top - P.crownDrop;
  const turn = sugarTurn(s);
  w.palm(x, y, z, h, PALM_FLEX.sugar);

  // The swollen foot: an octagon of two turned blocks, and a narrower step over it.
  w.block(x, y + 0.08, z, P.swell, 0.66, P.swell, turn, SUGAR_TRUNK_LOW, 0.95, PAT_SUGAR);
  w.block(x, y + 0.56, z, 0.7, 0.44, 0.7, turn + 0.4, SUGAR_TRUNK_LOW, 0.97, PAT_SUGAR);
  w.lod = NEAR_ONLY;
  w.block(x, y + 0.06, z, P.swell - 0.06, 0.62, P.swell - 0.06, turn + Math.PI / 4, SUGAR_TRUNK_LOW, 0.9, PAT_SUGAR);
  w.block(x, y + 0.56, z, 0.66, 0.44, 0.66, turn + 0.4 + Math.PI / 4, SUGAR_TRUNK_LOW, 0.94, PAT_SUGAR);
  w.lod = BOTH;
  // The trunk: straight, tapering; segments a little turned from each other (it reads round), their
  // octagon twins near. The rings and the dust low down are in the shader (PAT_SUGAR).
  const t0 = y + P.swellTop - 0.05;
  const t1 = base - 0.05;
  const n = Math.max(3, Math.round((t1 - t0) / 1.7));
  for (let i = 0; i < n; i++) {
    const a = t0 + ((t1 - t0) * i) / n;
    const b = t0 + ((t1 - t0) * (i + 1)) / n;
    const f = (i + 0.5) / n;
    const wd = P.foot + (P.top - P.foot) * f;
    const yaw = turn + (r(40 + i) - 0.5) * 0.5;
    const tone = pick(SUGAR_TRUNK, r(50 + i));
    w.block(x, (a + b) / 2, z, wd, b - a + 0.04, wd, yaw, tone, 1 - 0.05 * f, PAT_SUGAR);
    w.lod = NEAR_ONLY;
    w.block(x, (a + b) / 2, z, wd * 0.97, b - a + 0.04, wd * 0.97, yaw + Math.PI / 4, tone, 0.95 - 0.05 * f, PAT_SUGAR);
    w.lod = BOTH;
  }
  // The old leaf bases (boots) from the crown's base up to the heart.
  const bootsH = top - 0.15 - (base - 0.1);
  w.block(x, base - 0.1 + bootsH / 2, z, P.boots * 1.7, bootsH, P.boots * 1.7, turn + 0.2, pick(BOOTS, r(3)), 0.9, PAT_BOOTS);
  w.lod = NEAR_ONLY;
  w.block(x, base - 0.1 + bootsH / 2, z, P.boots * 1.65, bootsH, P.boots * 1.65, turn + 0.2 + Math.PI / 4, pick(BOOTS, r(4)), 0.84, PAT_BOOTS);
  // Their stubs, pointing up and out in a spiral (split, some lighter where the fan was cut).
  const stubs = s.tapped ? 7 : 9;
  for (let i = 0; i < stubs; i++) {
    const az = turn + i * 2.39996;
    // (none over the ladder's top)
    if (s.ladder !== undefined && Math.cos(az - s.ladder) > 0.8) continue;
    const u = (i + 0.5) / stubs;
    const yy = base + 0.05 + u * (bootsH - 0.35);
    const lean = 0.5 + r(60 + i) * 0.25;
    const dx = Math.sin(az) * Math.sin(lean);
    const dz = Math.cos(az) * Math.sin(lean);
    const dy = Math.cos(lean);
    w.stick(x + Math.sin(az) * 0.2, yy, z + Math.cos(az) * 0.2, dx, dy, dz, 0.5 + r(70 + i) * 0.2, 0.2, 0.09, pick(BOOTS, r(80 + i)), 0.95 + r(90 + i) * 0.15, 0);
  }
  // The heart: the bases of the young leaves, and the spear (the next leaf, folded) standing up.
  w.lod = BOTH;
  w.block(x, top - 0.1, z, 0.62, 0.8, 0.62, turn, HEART, 0.9);
  w.lod = NEAR_ONLY;
  w.stick(x + 0.05, top + 0.2, z - 0.04, 0.06, 1, 0.02, 1.3 + r(5) * 0.4, 0.12, 0.1, FAN_YOUNG[1], 1.05, r(6) * 3);

  // Flower stalks at the crown's base (the tapper's work), or fruit on some palms.
  const flowers = s.tapped && s.tubes === false ? [] : flowerStalks(s);
  flowers.forEach((fl, i) => {
    const dx = fl.tx - fl.x;
    const dy = fl.ty - fl.y;
    const dz = fl.tz - fl.z;
    const len = Math.hypot(dx, dy, dz);
    w.stick(fl.x, fl.y, fl.z, dx / len, dy / len, dz / len, len + 0.08, 0.08, 0.08, pick(FLOWER, r(100 + i)), 1);
    if (s.tapped) {
      // The bamboo tube hanging from the cut tip, tied on; its rim darker.
      w.block(fl.tx, fl.ty - TUBE_LEN / 2 + 0.06, fl.tz, 0.13, TUBE_LEN, 0.13, turn, pick(TUBE, r(110 + i)), 1);
      w.block(fl.tx, fl.ty + 0.05, fl.tz, 0.15, 0.05, 0.15, turn, TUBE_RIM, 1);
      w.block(fl.tx, fl.ty - TUBE_LEN + 0.12, fl.tz, 0.145, 0.04, 0.145, turn, TUBE_RIM, 1.1);
    } else {
      // Catkins: a few fingers hanging at the tip.
      for (let k = 0; k < 2; k++) w.stick(fl.tx, fl.ty, fl.tz, (k - 0.5) * 0.3, -1, 0.1, 0.36, 0.06, 0.06, pick(FLOWER, r(120 + i * 2 + k)), 0.92);
    }
  });
  if (!s.tapped && r(7) < 0.55) {
    // A female palm: two bunches of round fruit hanging among the leaf bases.
    for (let c = 0; c < 2; c++) {
      const az = turn + 3.4 + c * 2.2 + r(130 + c);
      const dx = Math.sin(az);
      const dz = Math.cos(az);
      const cx = x + dx * 0.55;
      const cy = base + 0.25 + r(140 + c) * 0.2;
      const cz = z + dz * 0.55;
      w.stick(x + dx * 0.25, base + 0.8, z + dz * 0.25, dx * 0.5, -0.8, dz * 0.5, 0.55, 0.06, 0.06, STALK[0], 0.9);
      for (let k = 0; k < 5; k++) {
        const a = k * 2.1 + c;
        const rr = k === 0 ? 0 : 0.14;
        w.block(cx + Math.sin(a) * rr, cy - (k === 0 ? 0 : 0.08 + (k % 2) * 0.1), cz + Math.cos(a) * rr, 0.2, 0.2, 0.2, a, pick(FRUIT, r(150 + k + c * 5)), 1, PAT_NONE);
      }
    }
  }

  // The crown: fans spiralling round the heart (the golden angle), from the young ones pointing up
  // to the old ones out and drooping, even over the ball (even in the sine of their elevation).
  const N = s.tapped ? 32 : 35 + Math.floor(r(8) * 6);
  // (a taller palm, a bigger crown)
  const grow = Math.min(1.15, Math.max(0.9, 0.55 + h / 28));
  for (let k = 0; k < N; k++) {
    const u = (k + 0.5) / N;
    // (tapped: the lowest fans cut away)
    if (s.tapped && u > 0.88) continue;
    const el = Math.asin(Math.max(-1, Math.min(1, 0.97 - 1.8 * u + (r(200 + k) - 0.5) * 0.12)));
    const az = turn + k * 2.39996 + (r(210 + k) - 0.5) * 0.3;
    const stalk = (1.0 + 0.45 * u + (r(220 + k) - 0.5) * 0.24) * grow;
    const blade = (0.78 + 0.18 * Math.sin(Math.PI * u) + (r(230 + k) - 0.5) * 0.12) * grow;
    const bend = 0.05 + 0.3 * u * u;
    // (tipped from lying flat, one way or the other: seen from the side as from above, most show their face)
    const roll = (r(240 + k) < 0.5 ? -1 : 1) * (0.35 + 0.85 * r(245 + k));
    const tones = u < 0.18 ? FAN_YOUNG : u > 0.8 ? FAN_OLD : FAN;
    const ox = Math.sin(az) * Math.cos(el) * 0.14;
    const oz = Math.cos(az) * Math.cos(el) * 0.14;
    w.leaf('fan', x + ox, top - 0.05 + Math.sin(el) * 0.14, z + oz, az, el, roll, stalk, blade, bend, pick(tones, r(250 + k)), 0.92 + r(260 + k) * 0.16);
  }
  // Dead fans hanging under the crown (tappers cut them away).
  if (!s.tapped) {
    const nd = 5 + Math.floor(r(9) * 4);
    for (let k = 0; k < nd; k++) {
      const az = turn + 0.6 + k * 2.39996 + r(300 + k) * 0.5;
      if (s.ladder !== undefined && Math.cos(az - s.ladder) > 0.6) continue;
      const el = -1.28 - r(310 + k) * 0.22;
      w.leaf('fan', x + Math.sin(az) * 0.3, base + 0.55 + r(320 + k) * 0.35, z + Math.cos(az) * 0.3, az, el, (r(330 + k) - 0.5) * 2, 0.7 + r(340 + k) * 0.3, 0.55 + r(350 + k) * 0.12, 0.05, pick(DEAD, r(360 + k)), 0.9 + r(370 + k) * 0.2, 0.6);
    }
  }

  // Far: the crown as a round tuft of slabs (a few fans' worth), the dead fans as a band.
  w.lod = FAR_ONLY;
  w.block(x, top + 0.05, z, 2.9, 2.3, 2.9, turn, FAN[0], 0.82);
  w.block(x, top + 0.15, z, 2.7, 2.7, 2.7, turn + Math.PI / 4, FAN[1], 0.9);
  const nf = 14;
  for (let k = 0; k < nf; k++) {
    const u = (k + 0.5) / nf;
    const el = Math.asin(0.95 - 1.75 * u);
    const az = turn + k * 2.39996;
    const dx = Math.sin(az) * Math.cos(el);
    const dz = Math.cos(az) * Math.cos(el);
    const dy = Math.sin(el);
    w.stick(x + dx * 0.9, top + dy * 0.9, z + dz * 0.9, dx, dy, dz, 2.0 * grow, 1.45, 0.12, pick(u < 0.2 ? FAN_YOUNG : u > 0.8 ? FAN_OLD : FAN, r(400 + k)), 0.95, r(410 + k) * 3);
  }
  if (!s.tapped) w.block(x, base + 0.1, z, 1.3, 1.1, 1.3, turn + 0.3, DEAD[0], 0.85);
  w.lod = BOTH;
}

// ── Coconut palm ───────────────────────────────────────────────────────────

/** A coconut palm's lean (m, x and z): the caller's, or hashed (1–2.5 m, any way). */
function coconutLean(s: PalmSpec): [number, number] {
  if (s.lean) return s.lean;
  const a = hash3(s.seed, 2, 23, 9437) * Math.PI * 2;
  const d = 1 + hash3(s.seed, 3, 23, 9437) * 1.5;
  return [Math.sin(a) * d, Math.cos(a) * d];
}

/** A coconut palm: a leaning trunk curving back up, a crown of feather fronds, coconuts under it. */
function coconutPalm(w: Writer, s: PalmSpec): void {
  const r = (q: number) => hash3(s.seed, q, 23, 9437);
  const { x, y, z, h } = s;
  const turn = r(1) * Math.PI * 2;
  const [lx, lz] = coconutLean(s);
  w.palm(x, y, z, h, PALM_FLEX.coconut);
  /** The trunk's middle at t (0 foot ‥ 1 top): leaning out low, curving back up to the crown. */
  const at = (t: number): [number, number, number] => {
    const k = 2 * t - t * t;
    return [x + lx * k, y + h * t, z + lz * k];
  };
  // The swollen bole.
  w.block(x, y + 0.2, z, 0.62, 0.7, 0.62, turn, COCO_TRUNK[2], 0.92, PAT_COCO);
  w.lod = NEAR_ONLY;
  w.block(x, y + 0.2, z, 0.58, 0.66, 0.58, turn + Math.PI / 4, COCO_TRUNK[2], 0.88, PAT_COCO);
  // Near: the trunk in short segments along its curve (each along its own tangent).
  const n = Math.max(6, Math.round(h / 0.95));
  for (let i = 0; i < n; i++) {
    const [ax, ay, az] = at(i / n);
    const [bx, by, bz] = at((i + 1) / n);
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    const f = (i + 0.5) / n;
    const wd = 0.44 - 0.12 * f;
    const tone = pick(COCO_TRUNK, r(10 + i));
    w.stick(ax, ay, az, dx / len, dy / len, dz / len, len + 0.05, wd, wd, tone, 1 - 0.06 * f, turn + i * 0.3, PAT_COCO);
  }
  // Far: three segments.
  w.lod = FAR_ONLY;
  for (let i = 0; i < 3; i++) {
    const [ax, ay, az] = at(i / 3);
    const [bx, by, bz] = at((i + 1) / 3);
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    w.stick(ax, ay, az, dx / len, dy / len, dz / len, len + 0.1, 0.42 - 0.08 * i, 0.42 - 0.08 * i, COCO_TRUNK[i], 1, turn, PAT_COCO);
  }
  const [cx, cy, cz] = at(1);
  // The crown shaft and the frond bases round it.
  w.lod = BOTH;
  w.block(cx, cy + 0.15, cz, 0.5, 0.7, 0.5, turn, COCO_SHAFT, 0.9);
  // Coconuts: a bunch or two under the fronds, on stalks.
  w.lod = NEAR_ONLY;
  const bunches = 1 + (r(4) < 0.6 ? 1 : 0);
  for (let c = 0; c < bunches; c++) {
    const az = turn + c * 2.7 + r(20 + c);
    const dx = Math.sin(az);
    const dz = Math.cos(az);
    const n2 = 4 + Math.floor(r(30 + c) * 4);
    const ripe = r(40 + c);
    for (let k = 0; k < n2; k++) {
      const a = az + (k - n2 / 2) * 0.45;
      const rr = 0.36 + (k % 2) * 0.12;
      const hex = ripe < 0.6 ? pick(NUT.slice(0, 3), r(50 + k)) : ripe < 0.8 ? NUT[3] : NUT[4];
      w.block(cx + Math.sin(a) * rr, cy - 0.28 - (k % 3) * 0.14, cz + Math.cos(a) * rr, 0.27, 0.3, 0.27, a, hex, 0.95 + r(60 + k) * 0.1);
    }
    w.stick(cx, cy, cz, dx * 0.6, -0.8, dz * 0.6, 0.45, 0.05, 0.05, 0x9a8a50, 1);
  }
  // Fronds: spiralling, the upper ones rising and arching over, the middle ones spreading, the old
  // ones hanging; the oldest yellowing.
  const N = 18 + Math.floor(r(5) * 5);
  for (let k = 0; k < N; k++) {
    const u = (k + 0.5) / N;
    const el = 1.2 - 1.95 * u + (r(100 + k) - 0.5) * 0.15;
    const az = turn + k * 2.39996 + (r(110 + k) - 0.5) * 0.3;
    const len = 3.6 + 1.3 * Math.sin(Math.PI * Math.min(1, u * 1.3)) + (r(120 + k) - 0.5) * 0.5;
    const bend = 0.1 + 0.18 * u + (r(130 + k) - 0.5) * 0.04;
    const tones = u > 0.82 ? FROND_OLD : FROND;
    w.leaf('frond', cx, cy + 0.35, cz, az, el, (r(140 + k) - 0.5) * 0.3, len, 0.9 + r(150 + k) * 0.2, bend, pick(tones, r(160 + k)), 0.92 + r(170 + k) * 0.14);
  }
  // A dead frond or two hanging down the trunk.
  for (let k = 0; k < 1 + (r(6) < 0.5 ? 1 : 0); k++) {
    const az = turn + 2 + k * 2.5;
    w.leaf('frond', cx, cy + 0.1, cz, az, -1.3 - r(180 + k) * 0.15, (r(190 + k) - 0.5) * 0.4, 3.2 + r(200 + k) * 0.6, 0.75, 0.04, pick(DEAD_FROND, r(210 + k)), 0.95, 0.7);
  }

  // Far: the fronds as slabs, rising then drooping; a dark knot of nuts.
  w.lod = FAR_ONLY;
  const nf = 8;
  for (let k = 0; k < nf; k++) {
    const u = (k + 0.5) / nf;
    const az = turn + k * 2.39996;
    const el = 0.9 - 1.5 * u;
    const dx = Math.sin(az);
    const dz = Math.cos(az);
    // (inner half up and out, outer half bending down)
    const e2 = el - 0.75;
    const ix = dx * Math.cos(el);
    const iz = dz * Math.cos(el);
    const iy = Math.sin(el);
    const tone = pick(u > 0.8 ? FROND_OLD : FROND, r(300 + k));
    w.stick(cx, cy + 0.3, cz, ix, iy, iz, 2.3, 1.1, 0.12, tone, 0.95, Math.PI / 2);
    const mx = cx + ix * 2.2;
    const my = cy + 0.3 + iy * 2.2;
    const mz = cz + iz * 2.2;
    w.stick(mx, my, mz, dx * Math.cos(e2), Math.sin(e2), dz * Math.cos(e2), 2.2, 0.9, 0.1, tone, 0.9, Math.PI / 2);
  }
  w.block(cx, cy - 0.4, cz, 0.7, 0.55, 0.7, turn, NUT[1], 0.9);
  w.lod = BOTH;
}

// ── Geometry ───────────────────────────────────────────────────────────────

/** Geometry of one leaf, in pieces of quads: position, normal, and (root along the stalk 0‥1, part: 0 stalk, 1 blade). */
class LeafGeo {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly leaf: number[] = [];
  readonly index: number[] = [];

  /**
   * A quad a–b–c–d (flat, its normal from its winding); `roots` per corner.
   * A stalk's corners lie at z = 0 (their place along it is the root): its
   * normal is then taken with the roots for z.
   */
  quad(a: number[], b: number[], c: number[], d: number[], roots: number[], part: number): void {
    const n0 = this.pos.length / 3;
    const zs = part === 0 ? roots : [a[2], b[2], c[2], d[2]];
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = zs[1] - zs[0];
    const vx = d[0] - a[0];
    const vy = d[1] - a[1];
    const vz = zs[3] - zs[0];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    [a, b, c, d].forEach((p, i) => {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nx, ny, nz);
      this.leaf.push(roots[i], part);
    });
    this.index.push(n0, n0 + 1, n0 + 2, n0, n0 + 2, n0 + 3);
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('leaf', new BufferAttribute(new Float32Array(this.leaf), 2));
    g.setIndex(this.index);
    return g;
  }
}

/** Segments of a sugar palm's fan and how far round they spread (≈ 200°). */
const FAN_SEGS = 11;
const FAN_SPREAD = 3.5;

/**
 * A sugar palm's leaf: a stiff stalk (its length set per leaf: `root` 0‥1)
 * and, at its tip, the fan: segments radiating in a half circle and more,
 * pleated (every other one tipped the other way about its length), the two
 * halves rising in a shallow V (blade units: radius ≤ 1).
 */
function fanGeometry(): BufferGeometry {
  const g = new LeafGeo();
  // Stalk: the four sides of a flat bar, 0.11 × 0.07 (in blade units, ≈ 7 × 5 cm).
  const sw = 0.055;
  const sh = 0.035;
  const sides: [number, number, number, number][] = [
    [-sw, sh, sw, sh],
    [sw, sh, sw, -sh],
    [sw, -sh, -sw, -sh],
    [-sw, -sh, -sw, sh],
  ];
  for (const [ax, ay, bx, by] of sides) g.quad([ax, ay, 0], [bx, by, 0], [bx * 0.7, by * 0.7, 0], [ax * 0.7, ay * 0.7, 0], [0, 0, 1, 1], 0);
  // Blade: pleated segments from the stalk's tip.
  for (let i = 0; i < FAN_SEGS; i++) {
    const f = (i + 0.5) / FAN_SEGS;
    const phi = -FAN_SPREAD / 2 + FAN_SPREAD * f;
    const side = Math.abs(Math.sin(phi));
    const len = 1 - 0.24 * (phi / (FAN_SPREAD / 2)) ** 2;
    const tilt = (i % 2 ? 1 : -1) * 0.38;
    const dx = Math.sin(phi);
    const dz = Math.cos(phi);
    // Across the segment: level, tipped by the pleat.
    const ex = Math.cos(phi) * Math.cos(tilt);
    const ey = Math.sin(tilt);
    const ez = -Math.sin(phi) * Math.cos(tilt);
    const r0 = 0.05;
    const w0 = 0.035;
    const w1 = 0.17;
    const lift = (r: number) => r * (0.3 * side + 0.06) + 0.08 * r * r;
    const c0 = [dx * r0, lift(r0), dz * r0];
    const c1 = [dx * len, lift(len), dz * len];
    g.quad(
      [c0[0] - ex * w0, c0[1] - ey * w0, c0[2] - ez * w0],
      [c0[0] + ex * w0, c0[1] + ey * w0, c0[2] + ez * w0],
      [c1[0] + ex * w1, c1[1] + ey * w1, c1[2] + ez * w1],
      [c1[0] - ex * w1, c1[1] - ey * w1, c1[2] - ez * w1],
      [1, 1, 1, 1],
      1,
    );
  }
  return g.build();
}

/** Leaflet pairs along a coconut frond. */
const FROND_PAIRS = 17;
/** Segments of the midrib (the frond bends along it). */
const RACHIS_SEGS = 6;

/**
 * A coconut frond: the midrib (`root` 0‥1 along its length, set per frond)
 * with pairs of long narrow leaflets, each rooted on it (`root`) and
 * reaching forward and out, hanging down in a V (their own metres, times
 * the frond's scale): short at the base and the tip, longest in the middle.
 */
function frondGeometry(): BufferGeometry {
  const g = new LeafGeo();
  // Midrib: a top face and a keel, in segments (thicker at the base).
  for (let i = 0; i < RACHIS_SEGS; i++) {
    const a = i / RACHIS_SEGS;
    const b = (i + 1) / RACHIS_SEGS;
    const wa = 0.06 * (1 - 0.7 * a);
    const wb = 0.06 * (1 - 0.7 * b);
    g.quad([-wa, 0, 0], [wa, 0, 0], [wb, 0, 0], [-wb, 0, 0], [a, a, b, b], 0);
    g.quad([0, 0, 0], [0, -wa * 1.4, 0], [0, -wb * 1.4, 0], [0, 0, 0], [a, a, b, b], 0);
  }
  for (let k = 0; k < FROND_PAIRS; k++) {
    const t = 0.08 + 0.88 * ((k + 0.5) / FROND_PAIRS);
    const len = 0.42 + 0.58 * Math.sin(Math.PI * Math.min(1, (t - 0.02) / 0.96)) ** 0.7;
    // (reaching forward, hanging down more toward the tip)
    const fwd = 0.95;
    const hang = 0.45 + 0.35 * t;
    for (const s of [-1, 1]) {
      const dx = s * Math.sin(fwd) * Math.cos(hang);
      const dy = -Math.sin(hang);
      const dz = Math.cos(fwd) * Math.cos(hang);
      // Across the leaflet: level, square to its length.
      let ex = -dz * s;
      let ez = dx * s;
      const el = Math.hypot(ex, ez) || 1;
      ex /= el;
      ez /= el;
      const w0 = 0.035;
      const w1 = 0.075;
      const m = len * 0.45;
      // Base → middle (widening) → tip (pointed); the middle and the tip sag a little more.
      const p0 = [0, 0, 0];
      const p1 = [dx * m, dy * m - 0.03, dz * m];
      const p2 = [dx * len, dy * len - 0.12, dz * len];
      g.quad([p0[0] - ex * w0, p0[1], p0[2] - ez * w0], [p0[0] + ex * w0, p0[1], p0[2] + ez * w0], [p1[0] + ex * w1, p1[1], p1[2] + ez * w1], [p1[0] - ex * w1, p1[1], p1[2] - ez * w1], [t, t, t, t], 1);
      g.quad([p1[0] - ex * w1, p1[1], p1[2] - ez * w1], [p1[0] + ex * w1, p1[1], p1[2] + ez * w1], [p2[0] + ex * 0.01, p2[1], p2[2] + ez * 0.01], [p2[0] - ex * 0.01, p2[1], p2[2] - ez * 0.01], [t, t, t, t], 1);
    }
  }
  return g.build();
}

let geos: { box: BufferGeometry; fan: BufferGeometry; frond: BufferGeometry } | null = null;
/** The shared shapes (made once). */
function shapes(): { box: BufferGeometry; fan: BufferGeometry; frond: BufferGeometry } {
  geos ??= { box: new BoxGeometry(1, 1, 1), fan: fanGeometry(), frond: frondGeometry() };
  return geos;
}

// ── Shaders ────────────────────────────────────────────────────────────────

/**
 * Near level of detail: every fan and frond to this far (m), dissolving into
 * the far blocks over `band` (short: a player seldom stands in it; walking,
 * it passes in a second or two).
 */
const NEAR = { medium: 110, low: 60, max: 160, band: 6 };

/** Shared by every palm material: the eye (the view's camera), the near distance and its band. */
const U = {
  uPalmEye: { value: new Vector3(0, 1e5, 0) },
  uPalmLod: { value: new Vector3(NEAR.medium, NEAR.band, 0) },
};
const PARAMS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
/** `palms=near|far` holds every palm at one level of detail (for checking). */
const HOLD = PARAMS?.get('palms') ?? null;
/** `palmstats` logs each planting's palms, pieces and draws. */
const STATS = PARAMS?.has('palmstats') ?? false;

const VERTEX_PARS = /* glsl */ `
attribute vec4 aC;
attribute vec3 aX;
attribute vec3 aY;
attribute vec3 aZ;
attribute vec4 aF;
attribute vec4 aK;
attribute vec4 aM;
#ifdef PALM_LEAF
attribute vec2 leaf;
#endif
uniform vec3 uPalmEye;
uniform vec3 uPalmLod;
varying vec3 vPalmCol;
varying vec3 vPalmP;
varying float vPalmPat;
varying float vPalmShow;
${SWAY_GLSL}
void palmPose(out vec3 P, out vec3 N) {
  // Level of detail: past the near distance the near pieces dissolve and the far ones come in
  // (a dither in the fragments: 'vPalmShow'); a piece not shown at all folds to a point.
  float d = length(uPalmEye.xz - aF.xz);
  float nearK = uPalmLod.z > 0.5 ? (uPalmLod.z > 1.5 ? 0.0 : 1.0) : 1.0 - smoothstep(uPalmLod.x, uPalmLod.x + uPalmLod.y, d);
  float show = aC.w < 0.5 ? 1.0 : (aC.w < 1.5 ? nearK : 1.0 - nearK);
  vPalmShow = show;
  vec3 p = show > 0.0 ? position : vec3(0.0);
  vec3 n = normal;
  float lift;
#ifdef PALM_LEAF
  // Metres along the midline (the stalk's share by 'leaf.x', the blade's own) and across it.
  float along = leaf.x * aM.x + p.z * aM.y;
  vec2 side = p.xy * aM.y;
  float total = aM.x + aM.y;
  // It curves down (its bend), flutters (a flap of the curve) and streams downwind.
  float ph = fract(dot(aC.xyz, vec3(0.1031, 0.1130, 0.0973)) * 7.13) * 6.2832;
  float flap = PALM_FLUTTER * (1.0 + 2.5 * uSwayWind) * (sin(uSwayTime * 2.1 + ph) + 0.5 * sin(uSwayTime * 3.7 + ph * 2.3));
  float k = aM.z + flap / max(total, 0.5);
  float a = k * along;
  float S = abs(a) < 1e-3 ? along : sin(a) / k;
  float C = abs(a) < 1e-3 ? 0.5 * k * along * along : (1.0 - cos(a)) / k;
  vec3 T = aZ * cos(a) - aY * sin(a);
  vec3 Up = aY * cos(a) + aZ * sin(a);
  P = aC.xyz + aZ * S - aY * C + aX * side.x + Up * side.y;
  P.xz += uSwayDir * (uSwayWind * PALM_STREAM * along * along);
  N = aX * n.x + Up * n.y + T * n.z;
  lift = aC.y;
  #ifdef PALM_FAN
  vPalmCol = aK.rgb * (leaf.y < 0.5 ? 0.78 : mix(0.8, 1.08 * aK.w, clamp(length(position.xz), 0.0, 1.0)));
  #else
  vPalmCol = aK.rgb * (leaf.y < 0.5 ? 1.25 : mix(0.82, 1.06 * aK.w, leaf.x));
  #endif
  vPalmPat = 0.0;
#else
  P = aC.xyz + aX * p.x + aY * p.y + aZ * p.z;
  N = normalize(aX * (n.x / max(dot(aX, aX), 1e-6)) + aY * (n.y / max(dot(aY, aY), 1e-6)) + aZ * (n.z / max(dot(aZ, aZ), 1e-6)));
  lift = P.y;
  // (undersides a little darker)
  vPalmCol = aK.rgb * (0.8 + 0.2 * smoothstep(-1.0, 0.3, N.y));
  vPalmPat = aK.w;
#endif
  // Where on the trunk (rest: before the wind), for its rings.
  vPalmP = vec3(P.y - aF.y, p.x * length(aX) + p.z * length(aZ), 0.0);
  // The palm bends in the wind: the top moves most (height²), the foot not at all.
  float up = clamp((lift - aF.y) / aF.w, 0.0, 1.3);
  P.xz += swayAt(aF.xyz) * (aM.w * aF.w * up * up);
}`;

const FRAGMENT_PARS = /* glsl */ `
varying vec3 vPalmCol;
varying vec3 vPalmP;
varying float vPalmPat;
varying float vPalmShow;
// A 4 × 4 ordered dither of the pixel (0‥15/16), for the cross-over between the levels of detail.
float palmBayer(vec2 a) { a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
float palmDither(vec2 p) { return palmBayer(0.5 * p) * 0.25 + palmBayer(p); }`;

/** The cross-over's dissolve (drawn and shadow pass alike). */
const FRAGMENT_SHOW = /* glsl */ `
#include <clipping_planes_fragment>
if (vPalmShow < 0.999 && vPalmShow <= palmDither(gl_FragCoord.xy) + 0.03) discard;`;

/** Colour and trunk rings (their contrast fades with distance, before they would shimmer). */
const FRAGMENT_COLOR = /* glsl */ `
diffuseColor.rgb *= vPalmCol;
if (vPalmPat > 0.5) {
  float y = vPalmP.x;
  float fade = 1.0 - smoothstep(25.0, 70.0, length(vViewPosition));
  if (vPalmPat < 1.5) {
    // Sugar palm: fine irregular rings, dust and mud low down.
    float ring = fract(y * 3.3 + 0.35 * sin(y * 1.7) + 0.2 * sin(vPalmP.y * 9.0));
    diffuseColor.rgb *= 1.0 - fade * (0.2 * smoothstep(0.72, 0.92, ring) + 0.05 * sin(y * 0.8 + vPalmP.y * 3.0));
    diffuseColor.rgb *= mix(1.12, 1.0, smoothstep(0.2, 1.6, y));
  } else if (vPalmPat < 2.5) {
    // Coconut palm: close, clear leaf scars.
    float ring = fract(y * 6.5 + 0.15 * sin(vPalmP.y * 7.0));
    diffuseColor.rgb *= 1.0 - fade * 0.26 * smoothstep(0.68, 0.9, ring);
  } else {
    // Leaf bases: split, criss-crossed.
    float a = fract((vPalmP.y * 2.2 + y * 1.6));
    float b = fract((vPalmP.y * 2.2 - y * 1.6));
    diffuseColor.rgb *= 1.0 - fade * 0.25 * max(smoothstep(0.75, 0.9, a), smoothstep(0.75, 0.9, b));
  }
}`;

/** Leaves let the low sun through: a warm glow when it is behind them. */
const FRAGMENT_BACKLIGHT = /* glsl */ `
#if defined(PALM_LEAF) && NUM_DIR_LIGHTS > 0
{
  // (the light behind the leaf: its direction opposite the way to the eye)
  vec3 plV = normalize(vViewPosition);
  float plBack = pow(max(-dot(plV, directionalLights[0].direction), 0.0), 3.0);
  outgoingLight += diffuseColor.rgb * directionalLights[0].color * (0.22 * plBack);
}
#endif
#include <opaque_fragment>`;

type PieceKind = 'box' | 'fan' | 'frond';

const DEFINES: Record<PieceKind, Record<string, string>> = {
  box: {},
  fan: { PALM_LEAF: '', PALM_FAN: '', PALM_FLUTTER: '0.05', PALM_STREAM: '0.035' },
  frond: { PALM_LEAF: '', PALM_FROND: '', PALM_FLUTTER: '0.09', PALM_STREAM: '0.05' },
};

const mats = new Map<PieceKind, { material: MeshStandardMaterial; depth: MeshDepthMaterial }>();

/** The material and shadow caster of a kind of piece (made once, shared by every planting). */
function materials(kind: PieceKind): { material: MeshStandardMaterial; depth: MeshDepthMaterial } {
  const hit = mats.get(kind);
  if (hit) return hit;
  const leaf = kind !== 'box';
  const material = new MeshStandardMaterial({ roughness: leaf ? 0.8 : 0.93, metalness: 0 });
  if (leaf) material.side = DoubleSide;
  material.name = `palms:${kind}`;
  material.defines = { ...DEFINES[kind] };
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, SWAY, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace('#include <beginnormal_vertex>', 'vec3 plP;\nvec3 objectNormal;\npalmPose(plP, objectNormal);')
      .replace('#include <begin_vertex>', 'vec3 transformed = plP;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace('#include <clipping_planes_fragment>', FRAGMENT_SHOW)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAGMENT_COLOR}`)
      .replace('#include <opaque_fragment>', FRAGMENT_BACKLIGHT);
  };
  material.customProgramCacheKey = () => `map-palms-${kind}-v1`;
  fadeNearMaterial(material);
  const depth = new MeshDepthMaterial();
  depth.name = `palms:${kind}-depth`;
  depth.defines = { ...DEFINES[kind] };
  depth.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, SWAY, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace('#include <begin_vertex>', 'vec3 plP;\nvec3 plN;\npalmPose(plP, plN);\nvec3 transformed = plP;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`).replace('#include <clipping_planes_fragment>', FRAGMENT_SHOW);
  };
  depth.customProgramCacheKey = () => `map-palms-${kind}-depth-v1`;
  const m = { material, depth };
  mats.set(kind, m);
  return m;
}

/** Point the shared uniforms at the view's camera (from each mesh's draw: the shadows then use the same). */
function lookFrom(camera: Camera): void {
  const e = camera.matrixWorld.elements;
  U.uPalmEye.value.set(e[12], e[13], e[14]);
  const lod = U.uPalmLod.value;
  lod.x = graphicsNow.level === 'low' ? NEAR.low : graphicsNow.level === 'max' ? NEAR.max : NEAR.medium;
  lod.y = NEAR.band;
  lod.z = HOLD === 'near' ? 1 : HOLD === 'far' ? 2 : 0;
}

/** One kind of piece as an instanced mesh over the given bounds. */
function pieceMesh(kind: PieceKind, p: Pieces, name: string, bounds: Box3, shadows: boolean): Mesh {
  const shape = shapes()[kind];
  const geo = new InstancedBufferGeometry();
  geo.index = shape.index;
  for (const [key, attr] of Object.entries(shape.attributes)) geo.setAttribute(key, attr);
  geo.setAttribute('aC', new InstancedBufferAttribute(new Float32Array(p.c), 4));
  geo.setAttribute('aX', new InstancedBufferAttribute(new Float32Array(p.x), 3));
  geo.setAttribute('aY', new InstancedBufferAttribute(new Float32Array(p.y), 3));
  geo.setAttribute('aZ', new InstancedBufferAttribute(new Float32Array(p.z), 3));
  geo.setAttribute('aF', new InstancedBufferAttribute(new Float32Array(p.f), 4));
  geo.setAttribute('aK', new InstancedBufferAttribute(new Float32Array(p.k), 4));
  geo.setAttribute('aM', new InstancedBufferAttribute(new Float32Array(p.m), 4));
  geo.instanceCount = p.count;
  geo.boundingBox = bounds.clone();
  geo.boundingSphere = bounds.getBoundingSphere(new Sphere());
  const { material, depth } = materials(kind);
  const mesh = new Mesh(geo, material);
  mesh.name = `${name}:${kind}`;
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  mesh.customDepthMaterial = depth;
  mesh.onBeforeRender = (_r, _s, camera) => lookFrom(camera);
  return mesh;
}

function buildPalms(specs: readonly PalmSpec[], opts: PalmBuildOptions): PalmSet {
  const name = opts.name ?? 'palms';
  const w = new Writer();
  const bounds = new Box3();
  for (const s of specs) {
    if (s.kind === 'sugar') sugarPalm(w, s);
    else coconutPalm(w, s);
    // (the crown's reach, the lean and the wind's sway in a storm)
    const reach = s.kind === 'sugar' ? 4.6 : 6.5 + Math.hypot(...coconutLean(s));
    bounds.expandByPoint(_a.set(s.x - reach, s.y - 1, s.z - reach)).expandByPoint(_a.set(s.x + reach, s.y + s.h + SUGAR_PALM.over + 1.5, s.z + reach));
  }
  const object = new Group();
  object.name = name;
  const shadows = opts.shadows ?? true;
  const box = w.box.count ? pieceMesh('box', w.box, name, bounds, shadows) : null;
  const leaves: Mesh[] = [];
  if (w.fan.count) leaves.push(pieceMesh('fan', w.fan, name, bounds, shadows));
  if (w.frond.count) leaves.push(pieceMesh('frond', w.frond, name, bounds, shadows));
  if (box) object.add(box);
  for (const m of leaves) object.add(m);
  if (specs.length) object.add(trunkBlocks(specs, name));
  const sugar = specs.filter((s) => s.kind === 'sugar');
  const feet = specs.map((s) => [s.x, s.z] as const);
  if (STATS) {
    const lods = [0, 0, 0];
    for (const p of [w.box, w.fan, w.frond]) for (let i = 3; i < p.c.length; i += 4) lods[p.c[i]]++;
    console.info(`[map] palms ${name}: ${specs.length} (${sugar.length} sugar, ${specs.length - sugar.length} coconut) · pieces ${lods[0]} both, ${lods[1]} near, ${lods[2]} far · ${(box ? 1 : 0) + leaves.length} draws`);
  }
  return {
    object,
    palms: specs.length,
    pieces: w.box.count + w.fan.count + w.frond.count,
    update(f: MapFrame) {
      // The leaves are drawn only while a palm is within the near distance (and its band).
      const c = f.camera.position;
      const lim = U.uPalmLod.value.x + U.uPalmLod.value.y + 4;
      let near = HOLD !== 'far' && HOLD !== null;
      for (let i = 0; !near && i < feet.length; i++) {
        const dx = feet[i][0] - c.x;
        const dz = feet[i][1] - c.z;
        near = dx * dx + dz * dz < lim * lim;
      }
      if (HOLD === 'far') near = false;
      for (const m of leaves) m.visible = near;
    },
    subjects(out: Subject[]) {
      for (const s of sugar) out.push({ kind: 'sugarPalm', x: s.x, y: s.y + s.h - 0.4, z: s.z, r: 3 });
    },
  };
}

const _m = new Matrix4();
const _q = new Quaternion();
const _s = new Vector3();
let unseen: MeshBasicMaterial | null = null;

/**
 * The trunks as blocks nobody sees, for the roaming walk map (roam/walkmap.ts
 * reads a part's voxel meshes): bark, so he cannot walk through a trunk and
 * the follow camera looks past it, as with the jungle's trees. Never drawn.
 */
function trunkBlocks(specs: readonly PalmSpec[], name: string): InstancedMesh {
  const blocks: [number, number, number, number, number][] = [];
  for (const s of specs) {
    if (s.kind === 'sugar') {
      const h = Math.max(4, s.h);
      blocks.push([s.x, s.y + 0.3, s.z, SUGAR_PALM.swell, 1.0]);
      blocks.push([s.x, s.y + (h - SUGAR_PALM.crownDrop) / 2, s.z, SUGAR_PALM.foot, h - SUGAR_PALM.crownDrop]);
    } else {
      // (the lower two thirds, stepping along the lean as the trunk does: the height he can reach)
      const [lx, lz] = coconutLean(s);
      for (const [t0, t1] of [
        [0, 1 / 3],
        [1 / 3, 2 / 3],
      ]) {
        const t = (t0 + t1) / 2;
        const k = 2 * t - t * t;
        blocks.push([s.x + lx * k, s.y + (s.h * (t0 + t1)) / 2, s.z + lz * k, 0.42, s.h * (t1 - t0) + 0.1]);
      }
    }
  }
  unseen ??= new MeshBasicMaterial({ visible: false });
  const mesh = new InstancedMesh(shapes().box, unseen, blocks.length);
  blocks.forEach(([x, y, z, w, h], i) => mesh.setMatrixAt(i, _m.compose(_a.set(x, y, z), _q.identity(), _s.set(w, h, w))));
  mesh.name = `${name}:trunks:mapBark`;
  // (read as blocks by the walk map; plain boxes: the graphics levels and the look panel leave it be)
  mesh.userData.voxelShape = { segments: 0, flat: true };
  mesh.visible = false;
  mesh.castShadow = false;
  return mesh;
}

// ── The jungle's palms (voxel prototypes) ──────────────────────────────────

export interface PalmProtoOpts {
  /** Cell size (m): 1 near the camera ‥ 3 far away (veg/scatter.ts `LOD_CELL`). */
  s: number;
  /** Height (m): the top of the crown, about. */
  h: number;
  seed: number;
}

/**
 * A jungle palm as a vegetation prototype (veg/proto.ts), for the scatter's
 * palms by the rivers and on low ground: only upright blocks and slabs (the
 * lattice turns trees by quarter turns), in the jungle's leaf and bark
 * families, so they sway and shade like its trees. Two in three are sugar
 * palms — the dark trunk and its swollen foot, the leaf bases, a round
 * crown of fans (vertical slabs radiating round the heart, young ones
 * standing on top, old ones hanging lower) and dead fans against the trunk
 * — every third a coconut palm: a pale trunk stepping out to one side and
 * curving back up, fronds of flat slabs reaching out all round and bending
 * down. Blocks per palm, by cell size: ≤ 36 (1 m), 26 (1.5 m), 18 (2 m),
 * 10 (3 m): what the old palm cost.
 */
export function palmProto(o: PalmProtoOpts): Proto {
  const src = traceSource();
  const r = (q: number) => hash3(o.seed, q, 31, 9451);
  const coconut = o.seed % 3 === 2;
  const boxes = coconut ? coconutBlocks(o, r) : sugarBlocks(o, r);
  const top = boxes.reduce((m, b) => Math.max(m, b.y + b.sy / 2), 0);
  // (no lattice cells: every piece is a free box; one spacing for both, so the scatter's pick keeps the mix)
  const proto = finishProto(new Vol(1, 2), { s: o.s, r: 3.4, h: top, seed: o.seed, boxes, src });
  if (!coconut) SUGAR_PROTOS.add(proto);
  return proto;
}

const SUGAR_PROTOS = new WeakSet<Proto>();

/** Whether a jungle prototype is a sugar palm (for the nature book: `sugarPalm`). */
export const isSugarPalmProto = (p: Proto): boolean => SUGAR_PROTOS.has(p);

/** A free box (proto space, m: y from the ground, x and z from the trunk's cell): bark, or a leaf. */
const fb = (leaf: boolean, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, shade: number): FreeBox => ({ x, y, z, sx, sy, sz, color, shade, leaf });

const AXES: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const DIAGONALS: [number, number][] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** The jungle's sugar palm (see {@link palmProto}). */
function sugarBlocks(o: PalmProtoOpts, r: (q: number) => number): FreeBox[] {
  const s = o.s;
  const near = s <= 1;
  const far = s >= 3;
  // The heart of the crown.
  const H = o.h - 1.8;
  const bootsY = H - SUGAR_PALM.crownDrop + 0.2;
  const B: FreeBox[] = [];
  // Trunk: the swollen foot, the trunk (two lengths near, narrowing), the leaf bases under the crown.
  if (!far) B.push(fb(false, 0, 0.3, 0, 0.84, 0.9, 0.84, SUGAR_TRUNK_LOW, 0.95));
  const from = far ? -0.3 : 0.7;
  if (near) {
    const mid = (from + bootsY) / 2;
    B.push(fb(false, 0, (from + mid) / 2, 0, 0.6, mid - from + 0.05, 0.6, pick(SUGAR_TRUNK, r(1)), 1));
    B.push(fb(false, 0, (mid + bootsY) / 2, 0, 0.5, bootsY - mid + 0.05, 0.5, pick(SUGAR_TRUNK, r(2)), 0.95));
  } else B.push(fb(false, 0, (from + bootsY) / 2, 0, far ? 0.7 : 0.56, bootsY - from, far ? 0.7 : 0.56, pick(SUGAR_TRUNK, r(1)), 1));
  if (!far) B.push(fb(false, 0, (bootsY + H) / 2, 0, 0.72, H - bootsY, 0.72, pick(BOOTS, r(3)), 0.9));
  B.push(fb(true, 0, H + 0.1, 0, 1, 1, 1, HEART, 0.95));
  const fan = (q: number) => pick(FAN, r(q));
  // Young fans standing up out of the top (turned every other way).
  const tops = near ? 3 : s < 2 ? 2 : 1;
  for (let i = 0; i < tops; i++) {
    const x = i % 2 === 0;
    B.push(fb(true, (r(10 + i) - 0.5) * 0.6, H + 1.25 + r(30 + i) * 0.3, (r(20 + i) - 0.5) * 0.6, x ? 0.12 : 1.1, 1.5, x ? 1.1 : 0.12, pick(FAN_YOUNG, r(40 + i)), 1.05));
  }
  // The ring: fans radiating level along the axes (upright slabs; near, out on their stalks), and a
  // little higher and shorter over them.
  AXES.forEach(([dx, dz], i) => {
    if (near) {
      B.push(fb(true, dx * 0.85, H + 0.05, dz * 0.85, dx ? 0.95 : 0.14, 0.14, dz ? 0.95 : 0.14, STALK[i % STALK.length], 0.95));
      B.push(fb(true, dx * 1.9, H + 0.25, dz * 1.9, dx ? 1.25 : 0.13, 1.4, dz ? 1.25 : 0.13, fan(50 + i), 1));
      B.push(fb(true, dx * 1.1, H + 1.15, dz * 1.1, dx ? 1.1 : 0.12, 1.1, dz ? 1.1 : 0.12, pick(FAN_YOUNG, r(55 + i)), 1.02));
    } else B.push(fb(true, dx * 1.45, H + 0.3, dz * 1.45, dx ? 1.7 : 0.13, 1.3, dz ? 1.7 : 0.13, fan(50 + i), 1));
  });
  // On the diagonals: near, a fan of two crossed upright slabs; farther, a plate held out.
  if (!far)
    DIAGONALS.forEach(([dx, dz], i) => {
      if (near) {
        B.push(fb(true, dx * 1.05, H + 0.65, dz * 1.05, 1.0, 1.15, 0.12, fan(60 + i), 0.98));
        B.push(fb(true, dx * 1.05, H + 0.65, dz * 1.05, 0.12, 1.15, 1.0, fan(64 + i), 0.94));
      } else B.push(fb(true, dx * 1.0, H + 0.6, dz * 1.0, 1.1, 0.14, 1.1, fan(60 + i), 0.98));
    });
  // Old fans hanging out and down under the ring (a little off the axes).
  AXES.forEach(([dx, dz], i) => {
    if (far && i > 1) return;
    B.push(fb(true, dx * 1.25 + dz * 0.4, H - 0.85, dz * 1.25 + dx * 0.4, dx ? 1.1 : 0.12, 1.35, dz ? 1.1 : 0.12, pick(FAN_OLD, r(70 + i)), 0.9));
  });
  // Dead fans against the trunk.
  if (s < 2)
    AXES.forEach(([dx, dz], i) => {
      if (!near && i > 1) return;
      B.push(fb(true, dx * 0.48, H - 1.6, dz * 0.48, dx ? 0.12 : 0.8, 1.5, dz ? 0.12 : 0.8, pick(DEAD, r(80 + i)), 0.95));
    });
  return B;
}

/** The jungle's coconut palm (see {@link palmProto}). */
function coconutBlocks(o: PalmProtoOpts, r: (q: number) => number): FreeBox[] {
  const s = o.s;
  const near = s <= 1;
  const far = s >= 3;
  const H = o.h - 1;
  const B: FreeBox[] = [];
  // Trunk: stepping out along +x as it rises (the lattice turns it), curving back up at the top.
  const segs = near ? 4 : s < 2 ? 3 : s < 3 ? 2 : 1;
  const lean = 0.9 + r(1) * 0.5;
  const out = (t: number) => lean * (2 * t - t * t);
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * H;
    const b = ((i + 1) / segs) * H;
    const first = i === 0;
    B.push(fb(false, out((i + 0.5) / segs), (a + b) / 2 - (first ? 0.25 : 0), 0, first ? 0.55 : 0.44, b - a + (first ? 0.5 : 0.06), first ? 0.55 : 0.44, pick(COCO_TRUNK, r(2 + i)), 1 - 0.04 * i));
  }
  const cx = out(1);
  B.push(fb(true, cx, H + 0.1, 0, 0.7, 0.7, 0.7, COCO_SHAFT, 0.95));
  if (s < 2) B.push(fb(true, cx + 0.35, H - 0.45, 0.2, 0.55, 0.45, 0.55, NUT[1], 0.95));
  // Fronds along the axes: flat slabs reaching out, then bending down, the tip hanging.
  const steps = near ? 4 : s < 2 ? 3 : 2;
  const PATHS: Record<number, [number, number, number, number][]> = {
    4: [
      [0.9, 0.35, 1.3, 0.9],
      [2.1, 0.2, 1.3, 1.0],
      [3.1, -0.35, 1.0, 0.85],
      [3.7, -1.2, 0.5, 0.6],
    ],
    3: [
      [1.1, 0.3, 1.6, 1.0],
      [2.5, -0.1, 1.4, 1.0],
      [3.5, -1.0, 0.8, 0.7],
    ],
    2: [
      [1.4, 0.2, 2.2, 1.1],
      [3.1, -0.6, 1.5, 0.9],
    ],
  };
  AXES.forEach(([dx, dz], i) => {
    const col = i === 3 ? pick(FROND_OLD, r(10 + i)) : pick(FROND, r(10 + i));
    PATHS[steps].forEach(([d, y, len, wd], j) => {
      // (the last step of the longer fronds hangs: an upright slab)
      const hang = steps > 2 && j === steps - 1;
      B.push(fb(true, cx + dx * d, H + y, dz * d, dx ? (hang ? 0.14 : len) : wd, hang ? 1.1 : 0.14, dz ? (hang ? 0.14 : len) : wd, col, 1 - 0.04 * j));
    });
  });
  // Fronds on the diagonals: a staircase of plates going out and down.
  if (!far)
    DIAGONALS.forEach(([dx, dz], i) => {
      const n = near ? 3 : s < 2 ? 2 : 1;
      for (let j = 0; j < n; j++) {
        const d = 0.75 + j * 0.85;
        B.push(fb(true, cx + dx * d, H + 0.3 - j * 0.45, dz * d, 0.95, 0.14, 0.95, pick(FROND, r(20 + i * 3 + j)), 1 - 0.05 * j));
      }
    });
  // Young fronds standing up on the top.
  if (near) {
    B.push(fb(true, cx + 0.2, H + 1.2, 0, 0.14, 1.6, 0.8, pick(FROND, r(40)), 1.06));
    B.push(fb(true, cx - 0.2, H + 1.0, 0.1, 0.8, 1.3, 0.14, pick(FROND, r(41)), 1.02));
  }
  return B;
}
