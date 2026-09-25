import { BufferAttribute, BufferGeometry, Color, Euler, Group, LineBasicMaterial, LineSegments, Quaternion, Vector3, type InstancedMesh } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';

/**
 * The explorer's hang glider: a delta wing in Khmer colours (saffron and
 * deep red panels, a gold leading edge, a gold-edged temple tower in the
 * middle that reads from below and from above), its tubes, wires, the
 * control frame he holds and the strap he hangs from.
 *
 * It is posed every frame from outside (`pose`). The frame, the king post
 * and the control frame are rigid: they ride on the glider's own group. The
 * sail is a fan of blocks round the nose. Folding swings each leading edge
 * round the nose towards the keel, and the fan of sail between them closes
 * into pleats, like a paper fan, so opening it looks like a glider being
 * unfolded. The trailing edge ripples with the airspeed.
 *
 * Glider space: origin at the hang point on the keel, +z forward (the
 * nose), +y up, +x the pilot's left (as in the explorer's own space). Sizes
 * are for the explorer at his true 1.7 m and scale with him (`size`).
 */

/** Half span, and each leading edge's angle from the keel when open (half the 125° nose angle). */
const HALF = 4.75;
const OPEN_ANGLE = (62.5 * Math.PI) / 180;
/** Folded: the leading edges lie almost along the keel. */
const FOLD_ANGLE = (2.4 * Math.PI) / 180;
/** Nose of the keel (z), keel length, chord at the root and at the tip (m). */
const NOSE = 1.35;
const KEEL = 3.2;
const ROOT = 2.6;
const TIP = 0.95;
/** Leading-edge length, and how far back its tip is from the nose. */
const LE_LEN = HALF / Math.sin(OPEN_ANGLE);
const LE_BACK = HALF / Math.tan(OPEN_ANGLE);
/** The trailing edge curves forward a little between the root and the tip (m). */
const SCALLOP = 0.2;
/** Middle of the sail above the keel, its thickness, the leading edge's drop to the tip (anhedral). */
const SAIL_Y = 0.075;
const THICK = 0.06;
const ANHEDRAL = 0.24;
/** Sag between the tubes towards the trailing edge, washout (the tips' trailing edge rides up), camber. */
const SAG = 0.12;
const WASH = 0.22;
const CAMBER = 0.03;
/** King post height, where the control frame hangs from the keel (z), the base bar (m). */
const KING = 0.95;
const APEX = 0.28;
const BAR_Y = -1.7;
const BAR_Z = 0.42;
/** (wide enough for his hat's brim to pass between the down tubes) */
const BAR_HALF = 0.85;
/** Hang strap length (the pilot hangs at its end: lying down, his chin just over the bar, his short arms reach it). */
const STRAP = 1.45;
/** Where the crossbar meets the leading edge, and the side wires with it (share of the leading edge). */
const JUNCTION = 0.62;
/** Sail blocks: columns of the fan on each side, rows from the nose to the trailing edge. */
const COLS = 16;
const ROWS = 16;
const DA = OPEN_ANGLE / COLS;
/** The sail starts a little behind the nose (the nose cone covers it). */
const R0 = 0.14;
/** Leading-edge pocket: blocks along each side. */
const NLE = 7;

/** Where things are in the glider frame (m, true size). */
export interface GliderLayout {
  /** Tip to tip, and the keel's length. */
  readonly span: number;
  readonly keel: number;
  /** Nose of the keel (z) and tail (z < 0). */
  readonly nose: number;
  readonly tail: number;
  /** The control bar (base bar) under the keel: its height (y < 0), z, and half width. The pilot's fists hold it. */
  readonly bar: { readonly y: number; readonly z: number; readonly half: number };
  /** Down tubes: from the keel at (0, 0, apex) down to the bar's ends. */
  readonly apex: number;
  /** Top of the king post (0, king, apex). */
  readonly king: number;
  /** Bottom of the hang strap: the pilot's harness hangs here. */
  readonly strap: Vector3;
  /** The left wing-tip lamp (red), fully open; the right one (green) is at −x. */
  readonly lamp: Vector3;
}

export const GLIDER: GliderLayout = {
  span: 2 * HALF,
  keel: KEEL,
  nose: NOSE,
  tail: NOSE - KEEL,
  bar: { y: BAR_Y, z: BAR_Z, half: BAR_HALF },
  apex: APEX,
  king: KING,
  strap: new Vector3(0, -STRAP, 0),
  lamp: new Vector3(Math.sin(OPEN_ANGLE) * (LE_LEN + 0.13), SAIL_Y - ANHEDRAL, NOSE - Math.cos(OPEN_ANGLE) * (LE_LEN + 0.13)),
};

/** How to pose the glider (world metres). */
export interface GliderPose {
  /** The hang point (origin of glider space) and the glider's turn. */
  position: Vector3;
  quaternion: Quaternion;
  /** The explorer's scale (the glider grows with him). */
  size: number;
  /** 0 folded (a long bundle along the keel) … 1 fully open (with a small pop past open near the end). */
  open: number;
  /** How much the trailing edge ripples (airspeed, 0‥1), and a clock (s). */
  flutter: number;
  t: number;
  /** Time of day: the tip lamps glow above 1.0 at night, soft by day. */
  night: number;
  /** Wire strength (0 hidden ‥ 1, default 1). */
  lines?: number;
  /** Put away: blocks shrink away one by one (0‥1, default 0). */
  shrink?: number;
}

// Khmer silk colours (sRGB), as on the parachute: saffron, deep red, gold, a cream core.
const SAFFRON = [0xe98d1c, 0xf29a28, 0xe2831a];
const RED = [0x9c2420, 0x8c1e1b, 0xa82b24];
const GOLD = [0xe9b84b, 0xf3c75c];
const CREAM = 0xf3e2bd;
/** Dark anodised tubes (their family's rim catches the light), light fittings, leather. */
const TUBE = [0x3b4048, 0x343941, 0x42474f];
const FITTING = 0x8e9398;
const STRAP_COLOR = 0x3a2a1e;
const GRIP = 0x5a3a24;
const LINE_COLOR = 0x2c2f34;
/** Wing-tip lamps: red on his left, green on his right. */
const LAMP_L = new Color(1, 0.16, 0.1);
const LAMP_R = new Color(0.22, 1, 0.42);

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const ease = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};
/** How far the wings are spread (0 folded … 1 open), popping a little past open near the end. */
const spread = (open: number) => {
  const o = clamp01(open);
  return ease(o / 0.8) + 0.06 * Math.sin(Math.PI * clamp01((o - 0.6) / 0.4));
};

/** Leading and trailing edge (z) at spanwise share `s` (0 keel ‥ 1 tip), fully open. */
const leadZ = (s: number) => NOSE - s * LE_BACK;
const trailZ = (s: number) => NOSE - ROOT - (LE_BACK + TIP - ROOT) * s + SCALLOP * Math.sin(Math.PI * s);

/** Height of the sail's middle at (x, z), fully open: anhedral, camber, sag between the tubes, washout. */
function sailY(x: number, z: number): number {
  const s = Math.min(1, Math.abs(x) / HALF);
  const lz = leadZ(s);
  const q = clamp01((lz - z) / Math.max(1e-3, lz - trailZ(s)));
  const chord = lz - trailZ(s);
  return SAIL_Y - ANHEDRAL * s + CAMBER * chord * Math.sin(Math.PI * Math.pow(q, 0.8)) - SAG * Math.sin(Math.PI * s) * Math.pow(q, 1.5) + WASH * Math.pow(s, 2.5) * Math.pow(q, 1.5);
}

/** Distance from the nose to where the ray at angle `a` from the keel leaves the sail (trailing edge or tip). */
function rayEnd(a: number): number {
  const sn = Math.sin(a);
  const cs = Math.cos(a);
  const out = (r: number) => r * sn > HALF || NOSE - r * cs < trailZ(Math.min(1, (r * sn) / HALF));
  let lo = 0;
  let hi = sn > 1e-6 ? Math.min(HALF / sn, 12) : ROOT + 0.01;
  if (!out(hi)) return hi;
  for (let n = 0; n < 40; n++) {
    const mid = (lo + hi) / 2;
    if (out(mid)) hi = mid;
    else lo = mid;
  }
  return lo;
}

/**
 * The temple tower (a lotus bud) over the keel, its tip towards the nose:
 * a gold outline and tiers, red inside, a cream doorway, a gold plinth and
 * finial. `ax` = |x|, `z` along the keel. Null outside it.
 */
function tower(ax: number, z: number, tone: (list: readonly number[]) => number): number | null {
  const base = -0.74;
  const top = 0.78;
  const t = (z - base) / (top - base);
  const w0 = 0.62;
  if (t < 0) return t > -0.11 && ax < w0 + 0.12 ? tone(GOLD) : null;
  if (t > 1) return t < 1.14 && ax < 0.07 ? tone(GOLD) : null;
  const w = w0 * Math.pow(1 - Math.pow(t, 2.2), 0.65);
  if (ax > w) return null;
  if (ax > w - 0.13 || t < 0.07) return tone(GOLD);
  if (Math.abs(t - 0.36) < 0.035 || Math.abs(t - 0.6) < 0.035) return tone(GOLD);
  if (ax < 0.15 && t < 0.24) return CREAM;
  return tone(RED);
}

/** Colour of the sail block in column `j` (0 at the keel), row `i` (0 at the nose), centred at (x, z). */
function sailColor(j: number, i: number, x: number, z: number, h: number): number {
  const tone = (list: readonly number[]) => list[Math.floor(h * list.length)];
  // A deep red hem along the trailing edge, a gold band just in front of it.
  if (i === ROWS - 1) return tone(RED);
  if (i === ROWS - 3) return tone(GOLD);
  const m = tower(Math.abs(x), z, tone);
  if (m !== null) return m;
  // Panels fanning out from the nose: saffron in the middle, red, saffron, red tips.
  return j < 5 || (j >= 8 && j < 11) ? tone(SAFFRON) : tone(RED);
}

// Scratch (pose allocates nothing).
const _p = new Vector3();
const _d = new Vector3();
const _a = new Vector3();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _u = new Vector3();
const _v = new Vector3();
const _w = new Vector3();
const _c = new Color();
const _q = new Quaternion();
const _e = new Euler();
const UP = new Vector3(0, 1, 0);

/** Axes of a block that runs along `d`, its width towards `a`, its thickness up (right-handed, unit). */
function frame(d: Vector3, a: Vector3): void {
  _z.copy(d).normalize();
  _x.copy(a).addScaledVector(_z, -a.dot(_z)).normalize();
  _y.crossVectors(_z, _x);
  if (_y.y < 0) _y.negate();
  _z.crossVectors(_x, _y);
}

/** Write block `i`'s matrix: centre `p`, axes `_x _y _z`, sizes. */
function put(m: Float32Array, i: number, p: Vector3, sx: number, sy: number, sz: number): void {
  const o = i * 16;
  m[o] = _x.x * sx;
  m[o + 1] = _x.y * sx;
  m[o + 2] = _x.z * sx;
  m[o + 3] = 0;
  m[o + 4] = _y.x * sy;
  m[o + 5] = _y.y * sy;
  m[o + 6] = _y.z * sy;
  m[o + 7] = 0;
  m[o + 8] = _z.x * sz;
  m[o + 9] = _z.y * sz;
  m[o + 10] = _z.z * sz;
  m[o + 11] = 0;
  m[o + 12] = p.x;
  m[o + 13] = p.y;
  m[o + 14] = p.z;
  m[o + 15] = 1;
}

/** Size left of a block with seed `seed` when the glider is `shrink` put away (one by one). */
const kept = (shrink: number, seed: number) => (shrink <= 0 ? 1 : Math.max(1e-4, 1 - ease((shrink - seed * 0.7) / 0.3)));

/** One block family's instances: which are posed by hand every call, and the rest as built. */
interface Family {
  mesh: InstancedMesh;
  /** The first `moving` instances are posed every call; the others ride on the rig as built. */
  moving: number;
  base: Float32Array;
  seed: Float32Array;
}

export class Glider {
  readonly object = new Group();
  readonly blocks: number;
  /** The glider's own space (hang point, turn, scale): everything below is posed in it. */
  private readonly rig = new Group();
  private readonly krama: Family;
  private readonly metal: Family;
  private readonly leather: Family;
  private readonly glow: Family;
  private readonly lines: LineSegments<BufferGeometry, LineBasicMaterial>;
  private readonly linePos: Float32Array;
  // Every sail block fully open: its side, column (0‥2·COLS), angle and distance from the nose, size, height and slopes.
  private readonly ns = 2 * COLS * ROWS;
  private readonly bside = new Int8Array(this.ns);
  private readonly bcol = new Uint8Array(this.ns);
  private readonly br = new Float32Array(this.ns);
  private readonly bw = new Float32Array(this.ns);
  private readonly bd = new Float32Array(this.ns);
  /** Height of the frame under the block (anhedral), and of the sail itself. */
  private readonly bframe = new Float32Array(this.ns);
  private readonly by = new Float32Array(this.ns);
  /** Slope along the ray (m per m) and across it (m per m of arc). */
  private readonly bsr = new Float32Array(this.ns);
  private readonly bsa = new Float32Array(this.ns);
  /** Pleat: +1 the block's outer edge rises when folded, −1 it falls. And a hair of lift, alternating, so no two faces are flush. */
  private readonly bpleat = new Int8Array(this.ns);
  private readonly blift = new Float32Array(this.ns);
  /** Trailing-edge ripple: share (0‥1 over the last rows), its growth per m along the ray, phase and its growth per m, strength. */
  private readonly bte = new Float32Array(this.ns);
  private readonly bdte = new Float32Array(this.ns);
  private readonly bph = new Float32Array(this.ns);
  private readonly bdph = new Float32Array(this.ns);
  private readonly bamp = new Float32Array(this.ns);
  // Each column's angle now (sin, cos): one pair per call.
  private readonly colA = new Float32Array(2 * COLS);
  private readonly colSin = new Float32Array(2 * COLS);
  private readonly colCos = new Float32Array(2 * COLS);
  /** The wing tip's trailing corner, open: angle and distance from the nose. */
  private readonly tipA: number;
  private readonly tipR: number;
  private readonly tipY: number;
  /** The lamps now (glider space), for `lampAt`. */
  private readonly lampLocal = [new Vector3(), new Vector3()];
  private lastShrink = 0;
  private readonly families: Family[];
  private readonly posed: InstancedMesh[];

  constructor() {
    this.object.name = 'glider';
    const b = new VoxelBuilder();
    const src = traceSource();
    const count = { krama: 0, metal: 0, leather: 0, glow: 0 };
    type Fam = keyof typeof count;
    const add = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, mat: Fam, extra: { shade?: number; rx?: number; ry?: number; rz?: number } = {}) => {
      b.box(x, y, z, sx, sy, sz, color, mat, { ...extra, src });
      return count[mat]++;
    };
    /** A straight tube from `a` to `b` (built once: it rides on the rig). */
    const tube = (a: Vector3, c: Vector3, w: number, d: number, color: number, mat: Fam) => {
      _v.subVectors(c, a);
      const len = _v.length();
      _q.setFromUnitVectors(UP, _v.divideScalar(len));
      _e.setFromQuaternion(_q, 'XYZ');
      add((a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2, w, len, d, color, mat, { rx: _e.x, ry: _e.y, rz: _e.z });
    };

    // ── Moving blocks first in each family (posed every call). ──
    // The sail: a fan of columns round the nose on each side, rows out to the trailing edge.
    let k = 0;
    for (let si = 0; si < 2; si++) {
      const side = si === 0 ? 1 : -1;
      for (let j = 0; j < COLS; j++) {
        const col = si * COLS + j;
        const a = (j + 0.5) * DA;
        this.colA[col] = a;
        const end = rayEnd(a);
        const depth = (end - R0) / ROWS;
        for (let i = 0; i < ROWS; i++, k++) {
          const c = (i + 0.5) / ROWS;
          const r = R0 + (end - R0) * c;
          const x = side * r * Math.sin(a);
          const z = NOSE - r * Math.cos(a);
          const y = sailY(x, z);
          // Slopes, measured along the ray and across it.
          const e = 0.02;
          const yr = sailY(side * (r + e) * Math.sin(a), NOSE - (r + e) * Math.cos(a)) - sailY(side * (r - e) * Math.sin(a), NOSE - (r - e) * Math.cos(a));
          const da = e / r;
          const ya = sailY(side * r * Math.sin(a + da), NOSE - r * Math.cos(a + da)) - sailY(side * r * Math.sin(a - da), NOSE - r * Math.cos(a - da));
          this.bside[k] = side;
          this.bcol[k] = col;
          this.br[k] = r;
          this.bw[k] = r * DA * 1.02;
          this.bd[k] = depth * 1.04;
          this.bframe[k] = SAIL_Y - ANHEDRAL * Math.min(1, Math.abs(x) / HALF);
          this.by[k] = y;
          this.bsr[k] = yr / (2 * e);
          this.bsa[k] = ya / (2 * e);
          this.bpleat[k] = j % 2 === 0 ? 1 : -1;
          this.blift[k] = (i + j) % 2 === 0 ? 0.002 : -0.002;
          const te = (c - 0.55) / 0.45;
          this.bte[k] = Math.max(0, te);
          this.bdte[k] = te > 0 ? 1 / (0.45 * (end - R0)) : 0;
          this.bph[k] = side * j * 0.7 - c * 8;
          this.bdph[k] = -8 / (end - R0);
          this.bamp[k] = 0.6 + (0.4 * j) / COLS;
          const h = hash3(col, i, 3, 57);
          const shade = 0.96 + 0.08 * hash3(col, i, 5, 57);
          add(x, y, z, this.bw[k], THICK, this.bd[k], sailColor(j, i, x, z, h), 'krama', { shade, ry: side * a });
        }
      }
    }
    // Leading-edge pockets (gold), each side from the nose to the tip.
    for (let si = 0; si < 2; si++)
      for (let i = 0; i < NLE; i++) add(0, SAIL_Y, NOSE - i * 0.5, 0.15, 0.115, LE_LEN / NLE, GOLD[(i + si) % 2], 'krama', { shade: i % 2 ? 0.96 : 1.04 });
    // Tip caps: a red batten round each tip, from the leading edge back to the trailing corner.
    for (let si = 0; si < 2; si++) add(0, SAIL_Y, 0, 0.1, 0.09, TIP, RED[1], 'krama');
    const kramaMoving = count.krama;
    // Leading-edge tube ends beyond the pockets, and the crossbar under the sail (a single-surface glider shows it from below).
    for (let si = 0; si < 2; si++) add(0, 0, 0, 0.07, 0.07, 0.16, FITTING, 'metal');
    for (let si = 0; si < 2; si++) add(0, 0, 0, 0.05, 0.05, 1, TUBE[1], 'metal');
    const metalMoving = count.metal;
    // Tip lamps.
    for (let si = 0; si < 2; si++) add(0, 0, 0, 0.09, 0.09, 0.09, 0xffffff, 'glow');
    const glowMoving = count.glow;

    // ── Rigid blocks (built in place, they ride on the rig). ──
    // Keel: tube segments from the tail to the nose, a light cap on the tail, a nose plate and cone.
    const tail = NOSE - KEEL;
    const seg = KEEL / 4;
    for (let i = 0; i < 4; i++) add(0, 0, tail + (i + 0.5) * seg, 0.07, 0.07, seg, TUBE[i % 3], 'metal');
    add(0, 0, tail - 0.03, 0.085, 0.085, 0.07, FITTING, 'metal');
    add(0, 0.035, NOSE + 0.03, 0.12, 0.11, 0.16, FITTING, 'metal');
    add(0, SAIL_Y + 0.03, NOSE - 0.1, 0.24, 0.13, 0.34, GOLD[1], 'krama');
    // King post on top, its fitting.
    add(0, 0.035 + KING / 2, APEX, 0.05, KING, 0.05, TUBE[0], 'metal');
    add(0, KING + 0.02, APEX, 0.08, 0.07, 0.08, FITTING, 'metal');
    // Control frame: the apex fitting, two streamlined down tubes, the base bar, corner fittings, grips.
    add(0, -0.06, APEX, 0.1, 0.08, 0.11, FITTING, 'metal');
    const apex = new Vector3(0, -0.04, APEX);
    for (const side of [1, -1]) tube(apex, new Vector3(side * BAR_HALF, BAR_Y, BAR_Z), 0.045, 0.075, TUBE[0], 'metal');
    add(0, BAR_Y, BAR_Z, 2 * BAR_HALF, 0.045, 0.045, TUBE[2], 'metal');
    for (const side of [1, -1]) {
      add(side * BAR_HALF, BAR_Y, BAR_Z, 0.09, 0.09, 0.09, FITTING, 'metal');
      add(side * 0.32, BAR_Y, BAR_Z, 0.34, 0.06, 0.06, GRIP, 'leather');
    }
    // Hang strap: a loop round the keel, the strap down, a carabiner at its end.
    add(0, 0, 0, 0.1, 0.1, 0.075, STRAP_COLOR, 'leather');
    add(0, -STRAP / 2, 0, 0.05, STRAP, 0.025, STRAP_COLOR, 'leather');
    add(0, -STRAP - 0.03, 0, 0.045, 0.09, 0.03, FITTING, 'metal');

    this.blocks = b.boxes.length;
    const g = buildVoxelMesh(b, { quality: 'medium', name: 'glider' });
    const fam = (name: Fam, moving: number): Family => {
      const mesh = g.children.find((c) => c.name === `glider:${name}`) as InstancedMesh;
      // (posed by hand every frame: the build-time bounds mean nothing)
      mesh.frustumCulled = false;
      const n = mesh.count;
      const seed = new Float32Array(n);
      for (let i = 0; i < n; i++) seed[i] = hash3(i, name.length, 11, 83);
      return { mesh, moving, base: (mesh.instanceMatrix.array as Float32Array).slice(), seed };
    };
    this.krama = fam('krama', kramaMoving);
    this.metal = fam('metal', metalMoving);
    this.leather = fam('leather', 0);
    this.glow = fam('glow', glowMoving);
    this.glow.mesh.castShadow = false;
    this.families = [this.krama, this.metal, this.leather, this.glow];
    this.posed = [this.krama.mesh, this.metal.mesh, this.glow.mesh];
    this.rig.add(g);

    // The wing tip's trailing corner (the tip caps run to it).
    const tx = HALF;
    const tz = trailZ(1);
    this.tipA = Math.atan2(tx, NOSE - tz);
    this.tipR = Math.hypot(tx, NOSE - tz);
    this.tipY = sailY(tx, tz);

    // Wires: from each corner of the base bar to the nose, the tail and its side's crossbar junction;
    // from the king post to the nose, the tail and both junctions.
    this.linePos = new Float32Array(10 * 6);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.linePos, 3));
    this.lines = new LineSegments(geo, new LineBasicMaterial({ color: LINE_COLOR, transparent: true, opacity: 0.8 }));
    this.lines.name = 'glider:wires';
    this.lines.frustumCulled = false;
    this.rig.add(this.lines);
    this.object.add(this.rig);
    this.object.visible = false;
  }

  hide(): void {
    this.object.visible = false;
  }

  /** Where a wing-tip lamp is now (world, with `object` left untransformed): `side` 1 his left (red), −1 his right (green). */
  lampAt(side: 1 | -1, out: Vector3): Vector3 {
    return out.copy(this.lampLocal[side === 1 ? 0 : 1]).applyMatrix4(this.rig.matrix);
  }

  pose(p: GliderPose): void {
    const shrink = clamp01(p.shrink ?? 0);
    if (shrink >= 1) {
      this.object.visible = false;
      return;
    }
    const rig = this.rig;
    rig.position.copy(p.position);
    rig.quaternion.copy(p.quaternion);
    rig.scale.setScalar(p.size);
    rig.updateMatrix();

    // The leading edges' angle from the keel, and how much the fan between them is closed.
    const theta = FOLD_ANGLE + (OPEN_ANGLE - FOLD_ANGLE) * spread(p.open);
    const f = theta / OPEN_ANGLE;
    const stretch = Math.max(1, f);
    const cosP = Math.min(1, f);
    const sinP = Math.sqrt(1 - cosP * cosP);
    // (folded, the sail lies slack: less sag and washout to show)
    const shape = 0.35 + 0.65 * Math.min(1, f);
    for (let c = 0; c < 2 * COLS; c++) {
      const a = this.colA[c] * f;
      this.colSin[c] = Math.sin(a);
      this.colCos[c] = Math.cos(a);
    }

    // ── Sail ──
    const km = this.krama.mesh.instanceMatrix.array as Float32Array;
    const kseed = this.krama.seed;
    const wave = (0.01 + 0.05 * clamp01(p.flutter)) * Math.min(1, f);
    const clock = p.t * 9.5;
    for (let k = 0; k < this.ns; k++) {
      const side = this.bside[k];
      const col = this.bcol[k];
      const sn = this.colSin[col];
      const cs = this.colCos[col];
      const r = this.br[k];
      let y = this.bframe[k] + (this.by[k] - this.bframe[k]) * shape;
      let sr = this.bsr[k] * shape;
      const te = this.bte[k];
      if (te > 0) {
        // The trailing edge ripples: a wave running back along the rows.
        const ph = clock + this.bph[k];
        const s = Math.sin(ph);
        const amp = wave * this.bamp[k];
        y += amp * s * te * te;
        sr += amp * (Math.cos(ph) * this.bdph[k] * te * te + s * 2 * te * this.bdte[k]);
      }
      // Along the ray (back from the nose), and across it (outwards).
      _d.set(side * sn, sr, -cs);
      _a.set(side * cs, this.bsa[k] * shape, sn);
      frame(_d, _a);
      const w = this.bw[k];
      if (sinP > 0) {
        // Folding: every other column tilts the other way, so the sail closes in pleats.
        const ps = this.bpleat[k] * sinP;
        _u.copy(_x).multiplyScalar(cosP).addScaledVector(_y, ps);
        _y.multiplyScalar(cosP).addScaledVector(_x, -ps);
        _x.copy(_u);
        y += 0.5 * w * sinP;
      }
      _p.set(side * sn * r, y, NOSE - cs * r).addScaledVector(_y, this.blift[k]);
      const sk = kept(shrink, kseed[k]);
      put(km, k, _p, w * stretch * sk, THICK * sk, this.bd[k] * sk);
    }

    // ── Leading edges, tip caps, tube ends, crossbar, lamps ──
    const snT = Math.sin(theta);
    const csT = Math.cos(theta);
    const mm = this.metal.mesh.instanceMatrix.array as Float32Array;
    const gm = this.glow.mesh.instanceMatrix.array as Float32Array;
    const mseed = this.metal.seed;
    const gseed = this.glow.seed;
    const tipA = this.tipA * f;
    const lines = this.linePos;
    const seg = LE_LEN / NLE;
    for (let si = 0; si < 2; si++) {
      const side = si === 0 ? 1 : -1;
      // The leading edge, from the nose down to the tip (anhedral).
      _d.set(side * snT * LE_LEN, -ANHEDRAL, -csT * LE_LEN);
      _a.set(side * csT, 0, snT);
      frame(_d, _a);
      for (let i = 0; i < NLE; i++) {
        const t = (i + 0.5) / NLE;
        const n = this.ns + si * NLE + i;
        _p.set(side * snT * LE_LEN * t, SAIL_Y - ANHEDRAL * t, NOSE - csT * LE_LEN * t);
        const sk = kept(shrink, kseed[n]);
        put(km, n, _p, 0.15 * sk, 0.115 * sk, seg * 1.03 * sk);
      }
      // Tube end and lamp beyond the tip.
      const tipLen = LE_LEN + 0.07;
      _p.set(side * snT * tipLen, SAIL_Y - ANHEDRAL * (tipLen / LE_LEN), NOSE - csT * tipLen);
      let sk = kept(shrink, mseed[si]);
      put(mm, si, _p, 0.07 * sk, 0.07 * sk, 0.16 * sk);
      const lampLen = LE_LEN + 0.13;
      const lamp = this.lampLocal[si].set(side * snT * lampLen, SAIL_Y - ANHEDRAL * (lampLen / LE_LEN), NOSE - csT * lampLen);
      sk = kept(shrink, gseed[si]);
      put(gm, si, lamp, 0.09 * sk, 0.09 * sk, 0.09 * sk);
      // Tip cap: from the leading edge's tip back to the trailing corner.
      _u.set(side * snT * LE_LEN, SAIL_Y - ANHEDRAL, NOSE - csT * LE_LEN);
      _v.set(side * Math.sin(tipA) * this.tipR, SAIL_Y + (this.tipY - SAIL_Y) * shape, NOSE - Math.cos(tipA) * this.tipR);
      _d.subVectors(_v, _u);
      const capLen = _d.length();
      _a.set(side * Math.cos(tipA), 0, Math.sin(tipA));
      frame(_d, _a);
      _p.addVectors(_u, _v).multiplyScalar(0.5);
      const cap = this.ns + 2 * NLE + si;
      sk = kept(shrink, kseed[cap]);
      put(km, cap, _p, 0.1 * sk, 0.09 * sk, capLen * sk);
      // Crossbar: from the keel to the junction on the leading edge, just under the sail.
      _u.set(0, SAIL_Y - 0.07, NOSE - ROOT * 0.55);
      _v.set(side * snT * LE_LEN * JUNCTION, SAIL_Y - ANHEDRAL * JUNCTION - 0.07, NOSE - csT * LE_LEN * JUNCTION);
      _d.subVectors(_v, _u);
      const barLen = _d.length();
      frame(_d, UP);
      _p.addVectors(_u, _v).multiplyScalar(0.5);
      sk = kept(shrink, mseed[2 + si]);
      put(mm, 2 + si, _p, 0.05 * sk, 0.05 * sk, barLen * sk);
      // (the junction, for the wires)
      _w.set(side * snT * LE_LEN * JUNCTION, SAIL_Y - ANHEDRAL * JUNCTION - 0.04, NOSE - csT * LE_LEN * JUNCTION);
      // Wires from this base-bar corner: to the nose, the tail and the junction; king post to the junction.
      let o = si * 18;
      o = seg6(lines, o, side * BAR_HALF, BAR_Y, BAR_Z, 0, 0, NOSE + 0.05);
      o = seg6(lines, o, side * BAR_HALF, BAR_Y, BAR_Z, 0, 0, NOSE - KEEL);
      seg6(lines, o, side * BAR_HALF, BAR_Y, BAR_Z, _w.x, _w.y, _w.z);
      seg6(lines, 36 + si * 6, 0, KING + 0.04, APEX, _w.x, _w.y + 0.08, _w.z);
    }
    seg6(lines, 48, 0, KING + 0.04, APEX, 0, SAIL_Y + 0.08, NOSE - 0.12);
    seg6(lines, 54, 0, KING + 0.04, APEX, 0, 0.04, NOSE - KEEL);
    this.lines.geometry.attributes.position.needsUpdate = true;
    const strength = (p.lines ?? 1) * (1 - ease(shrink / 0.35));
    this.lines.material.opacity = 0.8 * strength;
    this.lines.visible = strength > 0.02;

    // Rigid blocks only change when they are being put away.
    if (shrink !== this.lastShrink) {
      this.lastShrink = shrink;
      for (const fam of this.families) {
        const m = fam.mesh.instanceMatrix.array as Float32Array;
        for (let i = fam.moving; i < fam.mesh.count; i++) {
          const sk = kept(shrink, fam.seed[i]);
          const o = i * 16;
          for (let e = 0; e < 11; e++) m[o + e] = e === 3 || e === 7 ? 0 : fam.base[o + e] * sk;
        }
        fam.mesh.instanceMatrix.needsUpdate = true;
      }
    }

    // Soft by day, bright enough to bloom at night.
    const glow = 0.5 + clamp01(p.night) * 5;
    this.glow.mesh.setColorAt(0, _c.copy(LAMP_L).multiplyScalar(glow));
    this.glow.mesh.setColorAt(1, _c.copy(LAMP_R).multiplyScalar(glow));
    if (this.glow.mesh.instanceColor) this.glow.mesh.instanceColor.needsUpdate = true;

    for (const m of this.posed) {
      m.instanceMatrix.needsUpdate = true;
      // (bounds come back from the new matrices when something asks: a pick)
      m.boundingSphere = null;
      m.boundingBox = null;
    }
    this.object.visible = true;
  }
}

/** One wire from (ax, ay, az) to (bx, by, bz) at float `o`; returns the next offset. */
function seg6(out: Float32Array, o: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  out[o] = ax;
  out[o + 1] = ay;
  out[o + 2] = az;
  out[o + 3] = bx;
  out[o + 4] = by;
  out[o + 5] = bz;
  return o + 6;
}
