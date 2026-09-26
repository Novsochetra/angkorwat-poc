import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Euler,
  Group,
  LatheGeometry,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Vector2,
  Vector3,
  type InstancedMesh,
} from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { FLAG_BLUE, FLAG_RED, FLAG_WHITE } from './_flag';

/**
 * The hot air balloon, as voxels at the explorer's true size (metres; the
 * roaming code scales it with him, `size`): a small one-man balloon, as the
 * sport balloons that fly at dawn over the temples.
 *
 * - The envelope wears the flag of Cambodia wrapped round it: a blue crown,
 *   a wide red band with Angkor Wat in white on the front and the back
 *   (`TEMPLE`, drawn in cells), a blue skirt; thin gold lines at the band's
 *   edges, darker load-tape seams between its twelve gores, a gold ring
 *   round the vent at the top and a dark scoop under the mouth. About
 *   8.4 m wide and 9.2 m tall, its mouth 3.45 m over the basket floor (over
 *   a metre above the burner: the flame shows).
 * - A small wicker basket (weave in three tones, a leather-padded rim at
 *   his hip, two fuel tanks at the back), four sleeved rods up to the
 *   burner over his head, cables from the burner frame to the mouth.
 * - The burner's flame: glow blocks (no light: the scene's light count
 *   never changes) that bloom at night, with a small blue pilot flame that
 *   never goes out; while it roars the envelope glows from inside like a
 *   lantern (an additive shell over it, stronger after dark).
 * - The burner line: a cord from the blast valve down to his right hand.
 * - Parked (deflated): the envelope lies on the grass as a long flat heap
 *   with soft folds (`heap`, its bands in the flag's order, the crown's gold
 *   ring at the far end), the basket tipped on its side at the mouth, a small
 *   petrol fan (the inflator, its propeller spins) beside it. Inflating: the
 *   fan fills the envelope with cold air (it rises off the grass, lying),
 *   then the burner stands it up over the basket (`BalloonPose.cold`,
 *   `rise`, `tip`). The envelope's lying pose turns it about its mouth, the
 *   crown behind the basket, the front (the temple) up.
 *
 * Balloon space: origin on the basket floor in the middle (the explorer's
 * feet point), +z forward (his facing), +x his left, +y up.
 */

/** Where things are (m, true size, balloon space). */
export const BALLOON = {
  /** Basket: outer half width (x) and half depth (z), rim top over the floor. */
  basket: { hx: 0.55, hz: 0.5, rim: 0.62 },
  /** Bottom of the basket's runners (under the floor). */
  bottom: -0.12,
  /** Burner frame and the mouth of the envelope (the flame shows between them). */
  burner: 2.05,
  throat: 3.45,
  /** Widest radius of the envelope, and how high over the basket floor it is. */
  radius: 4.2,
  equator: 3.45 + 5.2,
  /** Top of the envelope. */
  crown: 3.45 + 9.2,
  /** The blast valve (the burner line hangs from it) and the line's handle at rest (at his right shoulder). */
  valve: new Vector3(-0.26, 1.98, 0.12),
  handle: new Vector3(-0.3, 1.2, 0.12),
  /** His left hand on the left rim. */
  rimHand: new Vector3(0.43, 0.67, 0.02),
  /** Tether rings at the top of the basket's front corners (the ropes to the stakes at home). */
  tether: [new Vector3(0.52, 0.6, 0.47), new Vector3(-0.52, 0.6, -0.47)],
  /** Parked: the lying envelope's mouth (z, behind the basket) and how long the heap is from it (m). */
  mouthZ: -2.6,
  heapLength: 8.6,
} as const;

// ── The envelope's shape ────────────────────────────────────────────────────
/** Mouth radius, the equator above the mouth, the crown above the equator (m). */
const R0 = 0.85;
const H1 = BALLOON.equator - BALLOON.throat;
const HC = BALLOON.crown - BALLOON.equator;
const R = BALLOON.radius;
/** The scoop under the mouth: how far down (m). */
const SKIRT = 0.35;
/** Envelope cells (m). */
const CELL = 0.4;
/** Gores (the panels the envelope is sewn from). */
const GORES = 12;
/**
 * Angkor Wat in white on the red band, front and back, as on the flag: five
 * towers, the gallery with its windows, the stepped base. Drawn in cells on
 * the cloth (one character a cell, the top row first), its middle on the
 * front (and the back) meridian.
 */
const TEMPLE = [
  '.........#.........',
  '........###........',
  '....#...###...#....',
  '...###..###..###...',
  '...###.#####.###...',
  '.#.###.#####.###.#.',
  '###################',
  '#.#.#.#.#.#.#.#.#.#',
  '###################',
  '###################',
];

/** Radius of the envelope at height `h` over its mouth (m), or −1 above the crown / under the mouth. */
function radiusAt(h: number): number {
  if (h < 0 || h > H1 + HC) return -1;
  if (h <= H1) return R0 + (R - R0) * Math.pow(Math.sin((Math.PI / 2) * (h / H1)), 0.85);
  const u = (h - H1) / HC;
  return R * Math.sqrt(Math.max(0, 1 - u * u));
}

// ── Colours (sRGB) ─────────────────────────────────────────────────────────
/** Khmer gold for the trim lines and the vent ring; the dark scoop; the flame. */
const GOLD = [0xe9b64a, 0xf2c55e, 0xdca63e];
const SCOOP = [0x2c2a2e, 0x34312f];
const WICKER = [0xb58a52, 0xa77c47, 0xc49a61, 0x9b7141];
const WICKER_DARK = [0x7e5a33, 0x8a6239];
const RIM = [0x5b3620, 0x663d24];
const FLOOR = 0x6a4a2c;
const TANK = [0x2f4f7a, 0x2a4670];
const STEEL = [0xb9bdc2, 0xa9aeb4, 0xc6c9cd];
const SLEEVE = [0x2b2b2e, 0x333236];
const CABLE = 0x3a3634;
const CORD = 0xd8c7a0;
/** Flame colours, linear (they are scaled over 1 to bloom): the blue root, the white-yellow core, the orange tips; the pilot light. */
const FLAME_ROOT = new Color(0.3, 0.55, 1);
const FLAME_CORE = new Color(1, 0.7, 0.26);
const FLAME_TIP = new Color(1, 0.36, 0.05);
const PILOT = new Color(0.35, 0.6, 1);
/** The sign's lantern (linear). */
const SIGN_LAMP = new Color(1, 0.6, 0.24);
/** The envelope lit from inside: warm. */
const LANTERN = new Color(1, 0.8, 0.6);

const tone = (list: readonly number[], h: number) => list[Math.min(list.length - 1, Math.floor(h * list.length))];

/** How to pose the balloon (world metres). */
export interface BalloonPose {
  /** The basket floor's middle, the heading (radians, 0 = +z), a small sway of the envelope (radians round x and z). */
  position: Vector3;
  yaw: number;
  swayX: number;
  swayZ: number;
  /** The explorer's scale (the balloon grows with him). */
  size: number;
  /** The burner: 0 off (the pilot light only) … 1 roaring. */
  flame: number;
  /** Time of day (0 day … 1 night) and a clock (s), for the flame's flicker. */
  night: number;
  t: number;
  /** Where the burner line's handle is (balloon space, m true size): in his fist, or hanging. */
  handle: Vector3;
  /** The tether ropes to these stakes (world, the rope's knot), or null (flying, parked away from home). */
  tether: readonly Vector3[] | null;
  /** How far from the camera it is (m): the inside glow fades out with distance (it gets no fog). */
  distance: number;
  /** The basket on its side (0 standing … 1 lying, parked). */
  tip: number;
  /** The fan's cold air in the lying envelope (0 flat on the grass … 1 full), and the burner standing it up (0 lying … 1 upright). */
  cold: number;
  rise: number;
  /** The fan running (0‥1): its propeller spins. */
  fan: number;
  /** The pilot light burns (not while parked). */
  pilot: boolean;
  /** The first frames: every part drawn (tiny where it should be hidden), so their shaders compile at load. */
  warm?: boolean;
}

/** Flame blocks: [height of its middle over the burner, width, length] at full burn (m), and its colour. */
const FLAME: readonly (readonly [number, number, number, Color])[] = [
  [0.1, 0.2, 0.2, FLAME_ROOT],
  [0.34, 0.34, 0.32, FLAME_CORE],
  [0.66, 0.44, 0.38, FLAME_CORE],
  [1.0, 0.42, 0.38, FLAME_CORE],
  [1.34, 0.34, 0.36, FLAME_TIP],
  [1.66, 0.22, 0.32, FLAME_TIP],
];
/** The two burner cans the flames come out of (x, m). */
const CANS = [0.11, -0.11];
/** Top of the burner cans (m). */
const NOZZLE = BALLOON.burner + 0.3;

const _m = new Matrix4();
const _m2 = new Matrix4();
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _v = new Vector3();
const _w = new Vector3();
const _c = new Color();
const _e = new Euler();
const UP = new Vector3(0, 1, 0);

export class Balloon {
  /** The whole balloon (posed every frame by `pose`). */
  readonly object = new Group();
  /** The envelope alone (the follow camera's near fade dissolves it: _nearFade.ts). */
  readonly envelope: Group;
  readonly blocks: number;
  private readonly rig = new Group();
  /** The basket, burner, rods, flame and lines: tipped on its side while parked (round the basket's back foot). */
  private readonly cradle = new Group();
  /** The deflated envelope lying on the grass (rig space). */
  private readonly heap: Group;
  /** The fan (stays on the home field: `setHome`) and its propeller. */
  private readonly ground = new Group();
  private readonly prop: Group;
  private propAngle = 0;
  private lastT = 0;
  private readonly flames: InstancedMesh;
  private readonly glow: Mesh<LatheGeometry, MeshBasicMaterial>;
  private readonly cord: LineSegments<BufferGeometry, LineBasicMaterial>;
  private readonly tether: LineSegments<BufferGeometry, LineBasicMaterial>;

  constructor() {
    this.object.name = 'balloon';
    const t0 = performance.now();

    // ── Envelope (its own meshes, for the near fade) ──
    const env = new VoxelBuilder();
    const src = traceSource();
    const g = env.grid({ cell: CELL, origin: [-(R + 2 * CELL), BALLOON.throat - SKIRT, -(R + 2 * CELL)], mat: 'shirt', jitter: 0.025, ao: 0.25, seed: 71 });
    const n = Math.ceil((R + 2 * CELL) / CELL) * 2;
    const ny = Math.ceil((SKIRT + H1 + HC + CELL) / CELL);
    const y0 = BALLOON.throat - SKIRT;
    const centre = (i: number) => -(R + 2 * CELL) + (i + 0.5) * CELL;
    /** Inside the envelope's cloth at (x, y, z) (balloon space); under the mouth a tube goes on down, so the mouth stays open. */
    const inside = (x: number, y: number, z: number) => {
      const h = y - BALLOON.throat;
      const rho = Math.hypot(x, z);
      if (h < 0) return rho < R0 - 0.1;
      const r = radiusAt(h);
      return r > 0 && rho <= r;
    };
    const vTop = BALLOON.crown;
    const vSpan = BALLOON.crown - BALLOON.throat;
    /** Top of the temple's rows: the drawing in the middle of the red band. */
    const templeTop = vTop - 0.5 * vSpan + (TEMPLE.length / 2) * CELL;
    for (let j = 0; j < ny; j++) {
      const y = y0 + (j + 0.5) * CELL;
      const h = y - BALLOON.throat;
      for (let i = 0; i < n; i++) {
        const x = centre(i);
        for (let k = 0; k < n; k++) {
          const z = centre(k);
          const rho = Math.hypot(x, z);
          if (h < 0) {
            // The scoop: a short dark ring under the mouth.
            if (Math.abs(rho - (R0 + 0.05)) <= CELL * 0.55) g.put(i, j, k, { color: tone(SCOOP, hash3(i, j, k, 72)), shade: 0.9 });
            continue;
          }
          if (!inside(x, y, z)) continue;
          // (the cloth: a cell with open air on a side)
          if (inside(x + CELL, y, z) && inside(x - CELL, y, z) && inside(x, y + CELL, z) && inside(x, y - CELL, z) && inside(x, y, z + CELL) && inside(x, y, z - CELL)) continue;
          // The flag's bands from the crown down to the mouth (a quarter blue, half red, a quarter blue), the temple on the red.
          const theta = Math.atan2(x, z);
          const v0 = (vTop - (y + CELL / 2)) / vSpan;
          const v1 = (vTop - (y - CELL / 2)) / vSpan;
          const v = (v0 + v1) / 2;
          let color = v < 0.25 || v > 0.75 ? FLAG_BLUE : FLAG_RED;
          if (color === FLAG_RED) {
            // (the arc from the nearer of the front and back meridians, in cells)
            const off = Math.abs(theta) > Math.PI / 2 ? Math.PI - Math.abs(theta) : Math.abs(theta);
            const col = Math.round((off * rho) / CELL) * (Math.abs(theta) > Math.PI / 2 ? -Math.sign(theta) : Math.sign(theta));
            const row = Math.floor((templeTop - y) / CELL);
            const line = TEMPLE[row];
            if (line && line[col + (line.length - 1) / 2] === '#') color = FLAG_WHITE;
          }
          let shade = 1;
          // Gold lines at the red band's edges.
          if ((v0 <= 0.25 && v1 > 0.25) || (v0 <= 0.75 && v1 > 0.75)) color = tone(GOLD, hash3(i, j, k, 73));
          // The vent at the top: a gold ring round a darker blue cap.
          else if (h > H1 + HC - 0.9 && rho < 1.5) color = rho < 0.95 ? 0x02226f : tone(GOLD, hash3(i, j, k, 74));
          // Load tapes between the gores: a darker seam (not over the temple).
          else if (color !== FLAG_WHITE) {
            const gore = ((theta / (Math.PI * 2)) * GORES + GORES) % 1;
            const seam = Math.min(gore, 1 - gore) * ((2 * Math.PI * rho) / GORES);
            if (seam < CELL * 0.5) shade = 0.84;
          }
          // (a hair of tone in the cloth, and the blue a touch lighter than the flag's: it reads from far off)
          const hs = hash3(i, j, k, 75);
          if (color === FLAG_BLUE) color = hs < 0.5 ? 0x0a36b0 : 0x0633a8;
          else if (color === FLAG_RED) color = hs < 0.5 ? 0xe00025 : 0xd4052a;
          g.put(i, j, k, { color, shade, src });
        }
      }
    }
    g.commit();
    const envBlocks = env.boxes.length;
    this.envelope = buildVoxelMesh(env, { quality: 'medium', name: 'balloon:envelope' });

    // ── Basket, burner, rods (one build) ──
    const b = new VoxelBuilder();
    const bsrc = traceSource();
    const { hx, hz, rim } = BALLOON.basket;
    const W = 0.07;
    const base = -0.08;
    // Floor and two runners under it.
    b.box(0, -0.04, 0, 2 * hx - 0.04, 0.08, 2 * hz - 0.04, FLOOR, 'wood', { src: bsrc });
    for (const s of [1, -1]) b.box(s * (hx - 0.16), BALLOON.bottom + 0.02, 0, 0.09, 0.05, 2 * hz - 0.02, 0x4a3320, 'wood', { src: bsrc });
    // The four walls: vertical wicker strips, woven over and under (three tones, alternating rows).
    const ROWS = 4;
    const rowH = (rim - 0.06 - base) / ROWS;
    const wall = (side: 'x' | 'z', s: number) => {
      const len = side === 'x' ? 2 * hz : 2 * hx;
      const strips = Math.round(len / 0.1);
      const sw = len / strips;
      for (let c = 0; c < strips; c++)
        for (let r = 0; r < ROWS; r++) {
          const a = -len / 2 + (c + 0.5) * sw;
          const y = base + (r + 0.5) * rowH;
          const over = (c + r) % 2 === 0;
          const color = over ? tone(WICKER, hash3(c, r, s, side === 'x' ? 81 : 82)) : tone(WICKER_DARK, hash3(c, r, s, 83));
          // (the strands over sit a hair proud of the ones under)
          const out = over ? W / 2 + 0.006 : W / 2 - 0.006;
          if (side === 'x') b.box(s * (hx - out), y, a, W, rowH + 0.004, sw + 0.004, color, 'wood', { src: bsrc, shade: 0.94 + 0.1 * hash3(c, r, s, 84) });
          else b.box(a, y, s * (hz - out), sw + 0.004, rowH + 0.004, W, color, 'wood', { src: bsrc, shade: 0.94 + 0.1 * hash3(c, r, s, 85) });
        }
    };
    for (const s of [1, -1]) {
      wall('x', s);
      wall('z', s);
    }
    // Corner posts (darker cane) and the padded leather rim.
    for (const sx of [1, -1]) for (const sz of [1, -1]) b.box(sx * (hx - 0.035), (base + rim) / 2, sz * (hz - 0.035), 0.085, rim - base, 0.085, WICKER_DARK[1], 'wood', { src: bsrc });
    for (const s of [1, -1]) {
      b.box(s * (hx - 0.035), rim - 0.02, 0, 0.11, 0.1, 2 * hz + 0.02, tone(RIM, 0.2), 'leather', { src: bsrc });
      b.box(0, rim - 0.02, s * (hz - 0.035), 2 * hx - 0.1, 0.1, 0.11, tone(RIM, 0.7), 'leather', { src: bsrc });
    }
    // Fuel tanks in the back corners (blue padded covers, steel valve tops).
    for (const s of [1, -1]) {
      b.box(s * 0.33, 0.24, -0.32, 0.2, 0.48, 0.2, tone(TANK, s > 0 ? 0.2 : 0.8), 'leather', { src: bsrc });
      b.box(s * 0.33, 0.51, -0.32, 0.1, 0.06, 0.1, STEEL[0], 'metal', { src: bsrc });
    }
    // Rods in their black sleeves, from the basket's corners up to the burner frame.
    const tube = (a: Vector3, c: Vector3, w: number, color: number, mat: 'leather' | 'metal') => {
      _v.subVectors(c, a);
      const len = _v.length();
      _e.setFromQuaternion(_q.setFromUnitVectors(UP, _v.divideScalar(len)), 'XYZ');
      b.box((a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2, w, len, w, color, mat, { src: bsrc, rx: _e.x, ry: _e.y, rz: _e.z });
    };
    const F = 0.28;
    for (const sx of [1, -1])
      for (const sz of [1, -1]) tube(new Vector3(sx * (hx - 0.05), rim + 0.02, sz * (hz - 0.05)), new Vector3(sx * F, BALLOON.burner - 0.02, sz * F), 0.045, tone(SLEEVE, (sx + sz + 2) / 5), 'leather');
    // Burner frame, the two cans, the valve block, the gimbal.
    for (const s of [1, -1]) {
      b.box(s * F, BALLOON.burner, 0, 0.04, 0.04, 2 * F + 0.04, STEEL[1], 'metal', { src: bsrc });
      b.box(0, BALLOON.burner, s * F, 2 * F + 0.04, 0.04, 0.04, STEEL[1], 'metal', { src: bsrc });
    }
    for (const x of CANS) {
      b.box(x, BALLOON.burner + 0.15, 0, 0.19, 0.28, 0.19, tone(STEEL, hash3(x * 10, 1, 2, 86)), 'metal', { src: bsrc });
      b.box(x, BALLOON.burner + 0.31, 0, 0.13, 0.04, 0.13, 0x6f7479, 'metal', { src: bsrc });
    }
    b.box(0, BALLOON.burner - 0.03, 0, 0.5, 0.05, 0.06, STEEL[2], 'metal', { src: bsrc });
    b.box(BALLOON.valve.x, BALLOON.valve.y + 0.05, BALLOON.valve.z, 0.08, 0.1, 0.08, 0x8a2a22, 'metal', { src: bsrc });
    // The line's handle: a small wooden toggle (posed with the cord).
    this.blocks = envBlocks + b.boxes.length;
    const kit = buildVoxelMesh(b, { quality: 'medium', name: 'balloon:basket' });

    // ── The flame (glow blocks, posed every frame) and the pilot light ──
    const fb = new VoxelBuilder();
    for (let c = 0; c < CANS.length; c++) for (let i = 0; i < FLAME.length; i++) fb.box(0, 0, 0, 1, 1, 1, 0xffffff, 'glow', { src: bsrc });
    for (let c = 0; c < CANS.length; c++) fb.box(CANS[c], NOZZLE + 0.04, 0, 0.05, 0.08, 0.05, 0xffffff, 'glow', { src: bsrc });
    const fg = buildVoxelMesh(fb, { quality: 'medium', name: 'balloon:flame', castShadow: false, receiveShadow: false });
    this.flames = fg.children[0] as InstancedMesh;
    this.flames.frustumCulled = false;
    this.blocks += fb.boxes.length;

    // ── The inside glow: a smooth shell just over the cloth, additive, tinted as the cloth it shines through (the red band
    // glows warm, the blue dim violet), brightest over the flame ──
    const pts: Vector2[] = [];
    for (let s = 0; s <= 32; s++) {
      const h = ((H1 + HC) * s) / 32;
      pts.push(new Vector2(Math.max(0.02, radiusAt(Math.min(h, H1 + HC - 1e-4)) + CELL * 1.05), BALLOON.throat + h));
    }
    pts[pts.length - 1].x = 0.02;
    const lathe = new LatheGeometry(pts, 28);
    const pos = lathe.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const v = (BALLOON.crown - pos.getY(i)) / (BALLOON.crown - BALLOON.throat);
      const red = Math.min(1, Math.max(0, Math.min((v - 0.22) / 0.06, (0.78 - v) / 0.06)));
      const k = 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, v * 1.15));
      col.set([k * (0.32 + 0.68 * red), k * (0.2 + 0.12 * red), k * (0.55 - 0.45 * red)], i * 3);
    }
    lathe.setAttribute('color', new BufferAttribute(col, 3));
    this.glow = new Mesh(lathe, new MeshBasicMaterial({ color: 0x000000, vertexColors: true, transparent: true, opacity: 1, blending: AdditiveBlending, depthWrite: false, fog: false }));
    this.glow.name = 'balloon:lantern';
    // (always drawn, black while unlit: compiled at load, nothing stutters the first time it glows)
    this.glow.frustumCulled = false;
    this.glow.renderOrder = 2;

    // ── The burner line, and the tether ropes at home ──
    // (one line mesh: the burner line first, posed every frame, then the cables from the burner frame to the mouth)
    const cables = new BufferGeometry();
    const cp: number[] = [BALLOON.valve.x, BALLOON.valve.y, BALLOON.valve.z, BALLOON.handle.x, BALLOON.handle.y, BALLOON.handle.z];
    const cc: number[] = [];
    for (let a = 0; a < 8; a++) {
      const th = (a / 8) * Math.PI * 2 + Math.PI / 8;
      const fx = Math.sign(Math.sin(th)) * F;
      const fz = Math.sign(Math.cos(th)) * F;
      cp.push(fx, BALLOON.burner + 0.02, fz, Math.sin(th) * (R0 + 0.05), BALLOON.throat - SKIRT + 0.05, Math.cos(th) * (R0 + 0.05));
    }
    _c.setHex(CORD).convertSRGBToLinear();
    cc.push(_c.r, _c.g, _c.b, _c.r, _c.g, _c.b);
    _c.setHex(CABLE).convertSRGBToLinear();
    while (cc.length < cp.length) cc.push(_c.r, _c.g, _c.b);
    cables.setAttribute('position', new BufferAttribute(new Float32Array(cp), 3));
    cables.setAttribute('color', new BufferAttribute(new Float32Array(cc), 3));
    this.cord = new LineSegments(cables, new LineBasicMaterial({ vertexColors: true }));
    this.cord.name = 'balloon:lines';
    this.cord.frustumCulled = false;
    const tetherGeo = new BufferGeometry();
    tetherGeo.setAttribute('position', new BufferAttribute(new Float32Array(6 * BALLOON.tether.length), 3));
    this.tether = new LineSegments(tetherGeo, new LineBasicMaterial({ color: 0xcbb688 }));
    this.tether.name = 'balloon:tether';
    this.tether.frustumCulled = false;

    // ── Parked: the heap on the grass, the fan ──
    const hb = new VoxelBuilder();
    buildHeap(hb, traceSource());
    this.heap = buildVoxelMesh(hb, { quality: 'medium', name: 'balloon:heap' });
    const fan = new VoxelBuilder();
    const pb = new VoxelBuilder();
    buildFan(fan, pb, traceSource());
    const fanMesh = buildVoxelMesh(fan, { quality: 'medium', name: 'balloon:fan' });
    this.prop = buildVoxelMesh(pb, { quality: 'medium', name: 'balloon:fanProp' });
    const propPivot = new Group();
    propPivot.position.set(0, FAN_HUB_Y, 0.06);
    propPivot.add(this.prop);
    const fanGroup = new Group();
    // (beside the tipped basket, blowing into the lying envelope's mouth)
    fanGroup.position.set(1.35, 0, -1.75);
    fanGroup.rotation.y = Math.atan2(-1.35, BALLOON.mouthZ + 1.75);
    fanGroup.add(fanMesh, propPivot);
    this.ground.add(fanGroup);
    this.blocks += hb.boxes.length + fan.boxes.length + pb.boxes.length;

    this.cradle.matrixAutoUpdate = false;
    this.cradle.add(kit, fg, this.cord);
    this.rig.add(this.envelope, this.cradle, this.glow, this.heap);
    this.object.add(this.rig, this.tether, this.ground);
    console.info(`[map] balloon: ${this.blocks} blocks (envelope ${envBlocks}), built in ${Math.round(performance.now() - t0)} ms`);
  }

  /** The home field (world, the balloon's size): the fan stays there when the balloon flies. */
  setHome(position: Vector3, yaw: number, size: number): void {
    this.ground.position.copy(position);
    this.ground.rotation.set(0, yaw, 0);
    this.ground.scale.setScalar(size);
  }

  pose(p: BalloonPose): void {
    const rig = this.rig;
    rig.position.copy(p.position);
    rig.rotation.set(0, p.yaw, 0);
    rig.scale.setScalar(p.size);
    const tip = clamp01(p.tip);
    const cold = clamp01(p.cold);
    const rise = clamp01(p.rise);
    const warm = !!p.warm;

    // The basket on its side: round its back foot, then forward onto its old place (its floor where the front wall stood).
    const { hz } = BALLOON.basket;
    const e = tip * tip * (3 - 2 * tip);
    const cm = this.cradle.matrix;
    if (e > 0) {
      _p.set(0, BALLOON.bottom, -hz);
      cm.makeTranslation(0, -BALLOON.bottom * e, (2 * hz - BALLOON.bottom) * e)
        .multiply(_m.makeTranslation(_p.x, _p.y, _p.z))
        .multiply(_m2.makeRotationX((-Math.PI / 2) * e))
        .multiply(_m.makeTranslation(-_p.x, -_p.y, -_p.z));
    } else cm.identity();
    this.cradle.matrixWorldNeedsUpdate = true;

    // The envelope: lying behind the basket (turned about its mouth, the crown to −z, the front up), squashed flat
    // until the fan fills it, then the burner stands it up; standing, it sways a little round the burner frame.
    const standing = rise >= 1 && cold >= 1;
    const env = this.envelope;
    const shown = cold > 0.05 || rise > 0;
    env.visible = shown || warm;
    if (!shown) {
      env.matrixAutoUpdate = true;
      env.position.set(0, 0, 0);
      env.rotation.set(0, 0, 0);
      env.scale.setScalar(warm ? 1e-3 : 1);
    }
    if (shown && standing) {
      env.matrixAutoUpdate = true;
      env.scale.setScalar(1);
      env.rotation.set(p.swayX, 0, p.swayZ);
      env.position.set(0, BALLOON.burner, 0).sub(_v.set(0, BALLOON.burner, 0).applyEuler(env.rotation));
    } else if (shown) {
      // (the cold air ripples the cloth while the fan runs)
      const wob = (1 - rise) * clamp01(p.fan);
      const across = (0.55 + 0.45 * cold) * (1 + 0.035 * wob * Math.sin(p.t * 3.1));
      const high = (0.08 + 0.92 * cold) * (1 + 0.07 * wob * Math.sin(p.t * 2.3 + 1)) ;
      const r = rise * rise * (3 - 2 * rise);
      const a = (-Math.PI / 2) * (1 - r);
      // The mouth: over the grass by the lying envelope's radius, behind the basket; up to the throat as it stands.
      const my0 = R * high + 0.05;
      _p.set(0, my0 + (BALLOON.throat - my0) * r, BALLOON.mouthZ * (1 - r));
      // (never through the grass while it swings up: lift the mouth by what would dip under)
      const ca = Math.cos(a);
      const sa = Math.abs(Math.sin(a));
      let low = Infinity;
      for (let h = -SKIRT; h <= H1 + HC; h += 0.5) low = Math.min(low, h * ca - Math.max(R0, radiusAt(h)) * high * sa);
      _p.y = Math.max(_p.y, 0.05 - low);
      env.matrixAutoUpdate = false;
      env.matrix
        .makeTranslation(_p.x, _p.y, _p.z)
        .multiply(_m.makeRotationX(a))
        .multiply(_m2.makeScale(across, 1, high))
        .multiply(_m.makeTranslation(0, -BALLOON.throat, 0));
      env.matrixWorldNeedsUpdate = true;
    }
    // (the inside glow shell goes with the envelope)
    const glow = this.glow;
    if (env.matrixAutoUpdate) {
      glow.matrixAutoUpdate = true;
      glow.position.copy(env.position);
      glow.rotation.copy(env.rotation);
      glow.scale.copy(env.scale);
    } else {
      glow.matrixAutoUpdate = false;
      glow.matrix.copy(env.matrix);
      glow.matrixWorldNeedsUpdate = true;
    }
    this.heap.visible = (cold < 0.12 && rise <= 0) || warm;

    // The fan's propeller.
    const dt = Math.max(0, Math.min(0.1, p.t - this.lastT));
    this.lastT = p.t;
    this.propAngle = (this.propAngle + clamp01(p.fan) * 42 * dt) % (Math.PI * 2);
    this.prop.rotation.z = this.propAngle;

    // The flame: each can's column of blocks, as long as the burn, flickering; the pilot light always.
    const m = this.flames;
    const burn = Math.max(0, Math.min(1, p.flame));
    const night = Math.max(0, Math.min(1, p.night));
    const bright = 1.05 + 2.6 * night;
    let n = 0;
    for (let c = 0; c < CANS.length; c++)
      for (let i = 0; i < FLAME.length; i++, n++) {
        const [hy, w, len, color] = FLAME[i];
        const f = 0.82 + 0.18 * Math.sin(p.t * (23 + 5 * i) + c * 2.1 + i) + 0.08 * Math.sin(p.t * 41 + i * 1.7);
        // (the column grows out of the can: the upper blocks show as the burn builds)
        const on = Math.max(0, Math.min(1, burn * FLAME.length * 1.3 - i));
        const k = on * f;
        _p.set(CANS[c] + 0.03 * Math.sin(p.t * 17 + i + c) * on, NOZZLE + hy * (0.55 + 0.45 * burn) * f, 0.03 * Math.cos(p.t * 13 + i * 2 + c) * on);
        _s.set(w * k + 1e-4, len * k + 1e-4, w * k + 1e-4);
        m.setMatrixAt(n, _m.compose(_p, _q.identity(), _s));
        m.setColorAt(n, _c.copy(color).multiplyScalar(bright * (0.8 + 0.4 * f)));
      }
    for (let c = 0; c < CANS.length; c++, n++) {
      const f = 0.85 + 0.15 * Math.sin(p.t * 9 + c * 3);
      const k = p.pilot || warm ? 1 : 0;
      _p.set(CANS[c], NOZZLE + 0.04, 0);
      _s.set(0.05 * k + 1e-4, 0.08 * k + 1e-4, 0.05 * k + 1e-4);
      m.setMatrixAt(n, _m.compose(_p, _q.identity(), _s));
      m.setColorAt(n, _c.copy(PILOT).multiplyScalar((0.9 + 2.6 * night) * f));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;

    // The envelope lit from inside while the burner roars (soft by day, a lantern after dark), fading with distance.
    const far = 1 - Math.max(0, Math.min(1, (p.distance - 220) / 500));
    this.glow.material.color.copy(LANTERN).multiplyScalar(burn * (0.03 + 0.28 * night * night) * far);

    // The burner line: from the valve down to the handle.
    const cp = this.cord.geometry.attributes.position.array as Float32Array;
    cp.set([p.handle.x, p.handle.y, p.handle.z], 3);
    this.cord.geometry.attributes.position.needsUpdate = true;

    // The tether ropes: from the basket's rings (tipped with it) to the stakes (world).
    if (p.tether) {
      rig.updateMatrix();
      _m.multiplyMatrices(rig.matrix, cm);
      const tp = this.tether.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < BALLOON.tether.length && i < p.tether.length; i++) {
        _w.copy(BALLOON.tether[i]).applyMatrix4(_m);
        tp.set([_w.x, _w.y, _w.z, p.tether[i].x, p.tether[i].y, p.tether[i].z], i * 6);
      }
      this.tether.geometry.attributes.position.needsUpdate = true;
    }
    this.tether.visible = !!p.tether;
  }
}

/** The fan's hub over the ground (m, fan space). */
const FAN_HUB_Y = 0.55;

/**
 * The deflated envelope on the grass (balloon space, true size): a long flat
 * heap from the mouth (`BALLOON.mouthZ`) back along −z, narrow at the mouth
 * and wider further out, 0.2–0.5 m tall, with lengthwise fold ridges and a
 * few cross wrinkles; the flag's bands run across it in the envelope's
 * order (the dark scoop, blue, a gold line, red with a few white temple
 * fragments, a gold line, blue, the gold ring round the dark blue cap).
 */
function buildHeap(b: VoxelBuilder, src: ReturnType<typeof traceSource>): void {
  const CZ = 0.25;
  const CX = 0.2;
  const len = BALLOON.heapLength;
  const rows = Math.round(len / CZ);
  for (let j = 0; j < rows; j++) {
    const u = (j + 0.5) / rows;
    // (narrow at the mouth, wide in the middle, rounded at the crown's end; it wanders a little)
    let half = 0.6 + 1.15 * Math.sin((Math.PI / 2) * Math.min(1, u / 0.45));
    if (u > 0.88) half *= 0.55 + 0.45 * Math.sqrt(Math.max(0, 1 - ((u - 0.88) / 0.12) ** 2));
    const mid = 0.22 * Math.sin(u * 5.5 + 0.6) * Math.min(1, u * 4);
    const z = BALLOON.mouthZ - u * len;
    const cols = Math.max(3, Math.round((2 * half) / CX));
    // A cross wrinkle now and then.
    const wrinkle = 0.11 * Math.max(0, Math.sin(u * 41 + 0.3)) ** 6;
    for (let i = 0; i < cols; i++) {
      const xr = -half + (i + 0.5) * ((2 * half) / cols);
      const x = mid + xr;
      const edge = Math.abs(xr) / half;
      const ridge = 0.2 * Math.max(0, Math.sin(xr * 4.6 + u * 3 + 1.3 * hash3(j >> 2, 0, 0, 91))) ** 2;
      const h = Math.max(0.08, (0.2 + ridge + wrinkle + 0.05 * hash3(i, j, 3, 92)) * (1 - 0.6 * edge ** 3) * (u < 0.05 ? 0.7 : 1));
      // The bands (v: 0 at the crown, 1 at the mouth, as on the envelope).
      const v = 1 - u;
      let color: number;
      let shade = 0.9 + 0.35 * (ridge + wrinkle);
      if (u < 0.05) color = tone(SCOOP, hash3(i, j, 1, 93));
      else if (u > 0.955) color = 0x02226f;
      else if (u > 0.93) color = tone(GOLD, hash3(i, j, 2, 94));
      else if (Math.abs(v - 0.25) < 0.018 || Math.abs(v - 0.75) < 0.018) color = tone(GOLD, hash3(i, j, 3, 95));
      else if (v < 0.25 || v > 0.75) color = hash3(i, j, 4, 96) < 0.5 ? 0x0a36b0 : 0x0633a8;
      else {
        color = hash3(i, j, 5, 97) < 0.5 ? 0xe00025 : 0xd4052a;
        // (a few white bits of the temple show between the folds)
        if (Math.abs(v - 0.5) < 0.12 && Math.abs(xr) < 0.9 && ridge < 0.08 && hash3(i, j, 6, 98) > 0.72) color = FLAG_WHITE;
      }
      // (load tapes along the gores: darker seams)
      if (color !== FLAG_WHITE && Math.abs(((xr / 0.7) % 1 + 1) % 1 - 0.5) > 0.44) shade *= 0.84;
      b.box(x, h / 2, z, (2 * half) / cols + 0.01, h, CZ + 0.01, color, 'shirt', { src, shade });
    }
  }
}

/**
 * The inflation fan (fan space: its feet on the ground, blowing along +z): a
 * small petrol engine on a tube frame, a round wire cage; the propeller is a
 * separate build (`prop`, round its hub at the origin, turning about z).
 */
function buildFan(b: VoxelBuilder, prop: VoxelBuilder, src: ReturnType<typeof traceSource>): void {
  const FRAME = 0x8a3a22;
  // Skids and the upright hoop's legs.
  for (const s of [1, -1]) {
    b.box(s * 0.28, 0.03, -0.05, 0.05, 0.05, 0.75, FRAME, 'metal', { src });
    b.box(s * 0.28, 0.28, 0.05, 0.05, 0.5, 0.05, FRAME, 'metal', { src });
  }
  b.box(0, 0.05, -0.32, 0.6, 0.05, 0.05, FRAME, 'metal', { src });
  // The engine behind the cage: block, tank, pull cord housing.
  b.box(0, 0.36, -0.28, 0.3, 0.26, 0.3, 0x3a3a3c, 'metal', { src });
  b.box(0, 0.54, -0.3, 0.24, 0.1, 0.22, 0xc23a22, 'metal', { src });
  b.box(0.16, 0.38, -0.28, 0.04, 0.14, 0.14, STEEL[0], 'metal', { src });
  b.box(0, FAN_HUB_Y, -0.1, 0.08, 0.08, 0.3, STEEL[1], 'metal', { src });
  // The cage: a ring of wire round the propeller, front spokes.
  const RING = 0.44;
  for (let a = 0; a < 20; a++) {
    const th = (a / 20) * Math.PI * 2;
    for (const z of [-0.02, 0.14]) b.box(Math.cos(th) * RING, FAN_HUB_Y + Math.sin(th) * RING, z, 0.15, 0.035, 0.035, STEEL[a % 3], 'metal', { src, rz: th + Math.PI / 2 });
  }
  for (let a = 0; a < 4; a++) {
    const th = (a / 4) * Math.PI * 2 + Math.PI / 4;
    b.box(Math.cos(th) * RING * 0.5, FAN_HUB_Y + Math.sin(th) * RING * 0.5, 0.15, RING, 0.02, 0.02, STEEL[2], 'metal', { src, rz: th });
  }
  // The propeller: a hub and four blades.
  prop.box(0, 0, 0, 0.1, 0.1, 0.08, 0x2b2b2e, 'metal', { src });
  for (let a = 0; a < 4; a++) {
    const th = (a / 4) * Math.PI * 2;
    prop.box(Math.cos(th) * 0.2, Math.sin(th) * 0.2, 0, 0.32, 0.09, 0.02, 0x5c4630, 'wood', { src, rz: th, rx: 0.3 });
  }
}

/**
 * The balloon's home field: a small wooden sign by the path in (a balloon
 * painted on it, in the flag's colours), and the tether stakes. World
 * positions; `stakes` are where the ropes are tied (m).
 */
export function buildBalloonHome(
  at: { x: number; y: number; z: number; yaw: number },
  sign: { x: number; y: number; z: number; yaw: number },
  stakes: readonly Vector3[],
  size: number,
): { object: Group; blocks: number; lantern: (night: number) => void } {
  const b = new VoxelBuilder();
  const src = traceSource();
  // The stakes: short posts leaning out, a coil of rope at each.
  for (const [i, s] of stakes.entries()) {
    const dx = s.x - at.x;
    const dz = s.z - at.z;
    const l = Math.hypot(dx, dz) || 1;
    b.box(s.x, s.y - 0.12 * size, s.z, 0.07 * size, 0.42 * size, 0.07 * size, 0x6b4a2c, 'wood', { src, rx: (dz / l) * 0.25, rz: (-dx / l) * 0.25 });
    b.box(s.x + (dx / l) * 0.18 * size, s.y - 0.3 * size, s.z + (dz / l) * 0.18 * size, 0.24 * size, 0.05 * size, 0.24 * size, i % 2 ? 0xcbb688 : 0xc2ab7c, 'krama', { src });
  }
  // The sign: a post, a board, a balloon painted on it in pixels (sign space: +z its face, turned `sign.yaw`).
  const c = Math.cos(sign.yaw);
  const sn = Math.sin(sign.yaw);
  const S = size;
  const put = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, mat: 'wood' | 'krama') =>
    b.box(sign.x + x * c + z * sn, sign.y + y, sign.z - x * sn + z * c, sx, sy, sz, color, mat, { src, ry: sign.yaw });
  put(0, 0.65 * S, 0, 0.1 * S, 1.3 * S, 0.1 * S, 0x6e4b2b, 'wood');
  put(0, 1.2 * S, 0.06 * S, 0.84 * S, 0.66 * S, 0.05 * S, 0xc9a26b, 'wood');
  put(0, 1.55 * S, 0.06 * S, 0.9 * S, 0.06 * S, 0.08 * S, 0x7a522e, 'wood');
  const ART = [
    '..bbbbb..',
    '.bbbbbbb.',
    'bbbbbbbbb',
    'rrrrwrrrr',
    'rrrwwwrrr',
    'rrwwwwwrr',
    '.bbbbbbb.',
    '..bbbbb..',
    '...l.l...',
    '...kkk...',
  ];
  const PAL: Record<string, number> = { b: 0x0a36b0, r: 0xe00025, w: 0xffffff, l: 0x5a3a24, k: 0x8a5a30 };
  const px = 0.058 * S;
  ART.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const k = row[x];
      if (k !== '.') put((x - (row.length - 1) / 2) * px, 1.2 * S + ((ART.length - 1) / 2 - y) * px, 0.09 * S, px, px, 0.012 * S, PAL[k], 'krama');
    }
  });
  // A small lantern on a post beside the sign (a glow block, lit after dark; no light of its own).
  put(0.62 * S, 0.5 * S, 0.1 * S, 0.06 * S, 1.0 * S, 0.06 * S, 0x6e4b2b, 'wood');
  put(0.62 * S, 1.02 * S, 0.1 * S, 0.2 * S, 0.04 * S, 0.2 * S, 0x3a2a1c, 'wood');
  put(0.62 * S, 0.8 * S, 0.1 * S, 0.18 * S, 0.03 * S, 0.18 * S, 0x3a2a1c, 'wood');
  const lb = new VoxelBuilder();
  lb.box(sign.x + 0.62 * S * c + 0.1 * S * sn, sign.y + 0.91 * S, sign.z - 0.62 * S * sn + 0.1 * S * c, 0.13 * S, 0.18 * S, 0.13 * S, 0xffffff, 'glow', { src, ry: sign.yaw });
  const lg = buildVoxelMesh(lb, { quality: 'medium', name: 'balloon:signLantern', castShadow: false, receiveShadow: false });
  const lamp = lg.children[0] as InstancedMesh;
  const object = new Group();
  object.name = 'balloon:home';
  object.add(buildVoxelMesh(b, { quality: 'medium', name: 'balloon:home' }), lg);
  const lantern = (night: number) => {
    // (by day a dull paper amber, after dark a warm glow that blooms)
    const k = Math.max(0, Math.min(1, night));
    lamp.setColorAt(0, _c.copy(SIGN_LAMP).multiplyScalar(0.3 + 2.2 * k * k));
    if (lamp.instanceColor) lamp.instanceColor.needsUpdate = true;
  };
  lantern(0);
  return { object, blocks: b.boxes.length + lb.boxes.length, lantern };
}
