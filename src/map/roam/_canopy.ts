import { BufferAttribute, BufferGeometry, Color, Euler, Group, LineBasicMaterial, LineSegments, Matrix4, Mesh, Quaternion, Vector3, type InstancedMesh } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { FLAG_ASPECT, FLAG_BLUE, flagMaterial } from './_flag';

/**
 * The explorer's parachute: a ram-air canopy of nine cells of cream silk
 * trimmed in blue, the flag of Cambodia on top of its wider middle cell
 * (a flat panel, upright from the follow camera behind him), its
 * suspension lines and two leather risers.
 *
 * It is posed every frame from outside (`fly`, `settle`): every block is an
 * instance whose matrix is written from its cell's frame, so the same ~360
 * blocks unfold out of the pack, inflate cell by cell, bank, ripple, pull
 * down at the trailing edge when a toggle is pulled, and fall in a heap
 * behind the explorer after the landing; the flag rides on its cell. Sizes
 * below are for the explorer at his true 1.7 m and scale with him (`size`):
 * at the roaming size (1.6×) it is 11 m across, 3.4 m deep and 6.6 m above
 * his shoulders.
 */

/** Cells across the span, the middle one, blocks along the chord. */
const N = 9;
const MID = (N - 1) / 2;
const ROWS = 9;
/** Span along the arc, chord in the middle (m, at true size). */
const SPAN = 6.9;
const CHORD = 2.15;
/** The middle cell is wider (it carries the flag), 8 blocks across; the others share the rest, 4 blocks each. */
const MID_W = 1.64;
const CELL_W = (SPAN - MID_W) / (N - 1);
/**
 * The flag on the middle cell, behind its thickest part (facing the follow
 * camera): its front and back edge (shares of the chord, on block rows),
 * width, and lift off the silk (m).
 */
const FLAG_C0 = 3 / ROWS;
const FLAG_C1 = 7 / ROWS;
const FLAG_W = (FLAG_C1 - FLAG_C0) * CHORD * FLAG_ASPECT;
const FLAG_LIFT = 0.008;
/** From the harness up to the underside of the middle cell (m). */
const LINE = 4.1;
/** How much each cell turns from the one inside it (rad): an arc, the tips' middles about 0.85 m lower than the middle. */
const TURN = 0.168;
/** Share of the chord in front of the lines, thickness over chord, nose-down trim (rad). */
const LEAD = 0.3;
const THICK = 0.17;
const TRIM = 0.07;
/** Riser length (m: up past his hat brim), and how far a full toggle pulls the trailing edge down (m). */
const RISER = 0.75;
const BEND = 0.42;
/** Seconds from the pack to a full canopy. */
export const OPEN_TIME = 0.86;

// Cream silk (sRGB) round the flag, as on the hang glider, trimmed in the flag's blue.
const SILK = [0xf1e5cb, 0xebdec2, 0xf4ead6];
const BLUE = [FLAG_BLUE, 0x0a3092];
const STRAP = 0x3a2a1e;
const LAMP = new Color(1, 0.62, 0.28);
const LINE_COLOR = 0x33291f;

/** What the canopy hangs from, where it is in its opening, and how it is steered (world metres). */
export interface CanopyPose {
  /** Where the risers meet, above the explorer's shoulders. */
  harness: Vector3;
  /** The canopy's turn round the harness: heading, then pitch and bank. */
  quat: Quaternion;
  /** The explorer's scale (the canopy grows with him). */
  size: number;
  /** Seconds since it began to open (`OPEN_TIME` and more: fully open). */
  open: number;
  /** Toggles: trailing edge pulled down on his left / right (0‥1). */
  brakeL: number;
  brakeR: number;
  /** A clock (s) and how much the fabric ripples (0‥1). */
  t: number;
  flutter: number;
  /** The explorer's pack (the bundle comes out of it), shoulders (risers) and fists (brake lines). */
  pack: Vector3;
  /** Where the little lamp is clipped (on the back of his pack: the follow camera sees it). */
  lamp: Vector3;
  shoulderL: Vector3;
  shoulderR: Vector3;
  handL: Vector3;
  handR: Vector3;
  /** Suspension lines' strength (0 hidden ‥ 1). */
  lines: number;
  /** Time of day (the harness lamp glows at night). */
  night: number;
}

const ease = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};
/** 0 → 1 with a small overshoot (the cells pop full of air). */
const pop = (t: number) => {
  const c = Math.min(1, Math.max(0, t)) - 1;
  return 1 + 2.4 * c * c * c + 1.4 * c * c;
};
/** Airfoil thickness along the chord (0 = leading edge, 1 = trailing edge), 1 at its thickest. */
const airfoil = (c: number) => (c < 0.22 ? 0.62 + 0.38 * Math.sin(((c / 0.22) * Math.PI) / 2) : 0.14 + 0.86 * Math.cos((((c - 0.22) / 0.78) * Math.PI) / 2));
/** Cell `i`'s distance from the middle (0‥1) and chord (m): the tips are a little shorter. */
const cellD = (i: number) => Math.abs(i + 0.5 - N / 2) / (N / 2);
const cellChord = (i: number) => CHORD * (1 - 0.2 * cellD(i) ** 2);
/** Cell `i`'s width, blocks across it, and its middle along the span (m, 0 in the middle). */
const cellW = (i: number) => (i === MID ? MID_W : CELL_W);
const cellCols = (i: number) => (i === MID ? 8 : 4);
const cellS = (i: number) => Math.sign(i - MID) * (MID_W / 2 + (Math.abs(i - MID) - 0.5) * CELL_W);

/**
 * Where cell `i`'s middle is (x, y; the middle cell's at 0) with the cells
 * in a chain out from the middle one, each turned `TURN` more than the one
 * inside it; returns its turn (rad, + on his left). `spread` 0 draws it all
 * in to the middle (the bundle).
 */
function chain(i: number, spread: number, out: Vector3): number {
  const side = Math.sign(i - MID);
  const n = Math.abs(i - MID);
  if (n === 0) {
    out.set(0, 0, 0);
    return 0;
  }
  let x = (MID_W / 2) * spread;
  let y = 0;
  for (let j = 1; j <= n; j++) {
    // (whole cells out to this one's middle)
    const w = (j < n ? CELL_W : CELL_W / 2) * spread;
    x += w * Math.cos(j * TURN * spread);
    y -= w * Math.sin(j * TURN * spread);
  }
  out.set(side * x, y, 0);
  return side * n * TURN * spread;
}

/** Height of the top of the silk at chord share `c` in a cell of chord `chord` (m, open; ribs are lower). */
const topAt = (c: number, chord: number, rib: boolean) => chord * (0.03 * Math.sin(Math.PI * c) + THICK * airfoil(c) * (rib ? 0.8 : 1));

/** The flag's plane on the middle cell's top: its height at the flag's front edge, and its rise per chord share. */
const FLAG_Y0 = topAt(FLAG_C0, CHORD, false);
const FLAG_RISE = (topAt(FLAG_C1, CHORD, false) - FLAG_Y0) / (FLAG_C1 - FLAG_C0);
/** The flag's rows of corners (chord shares): its edges and the middles of the block rows under it, so it bends as they do. */
const FLAG_ROWS = [FLAG_C0, ...Array.from({ length: Math.round((FLAG_C1 - FLAG_C0) * ROWS) }, (_, r) => FLAG_C0 + (r + 0.5) / ROWS), FLAG_C1];

/** Colour of the fabric block at cell `i`, column `col`, row `row` (from the leading edge): cream, blue tips and edges. */
function fabric(i: number, col: number, row: number): number {
  const h = hash3(i * 8 + col, row, 7, 41);
  const blue = i === 0 || i === N - 1 || row === 0 || row === ROWS - 1;
  const list = blue ? BLUE : SILK;
  return list[Math.floor(h * list.length)];
}

const _v = new Vector3();
const _w = new Vector3();
const _s = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _e = new Euler();
const _m = new Matrix4();
const _c = new Color();
const _top = new Vector3();
const _topL = new Vector3();
const _topR = new Vector3();
const _a = new Vector3();
const _mid = new Vector3();
const _te = Array.from({ length: 4 }, () => new Vector3());
/** The slope `Canopy.trail` found last. */
let trailSlope = 0;
const X = new Vector3(1, 0, 0);
const UP = new Vector3(0, 1, 0);

export class Canopy {
  readonly object = new Group();
  readonly blocks: number;
  private readonly fabric: InstancedMesh;
  private readonly straps: InstancedMesh;
  private readonly lamp: InstancedMesh;
  private readonly lines: LineSegments<BufferGeometry, LineBasicMaterial>;
  private readonly linePos: Float32Array;
  /** The flag panel on the middle cell (a pair of corners on each of its rows, posed with the cell). */
  private readonly flag: Mesh<BufferGeometry>;
  // Every fabric block at true size, fully open, in its cell's frame.
  private readonly nb = ROWS * Array.from({ length: N }, (_, i) => cellCols(i)).reduce((a, n) => a + n, 0);
  private readonly bx = new Float32Array(this.nb);
  private readonly by = new Float32Array(this.nb);
  private readonly bz = new Float32Array(this.nb);
  private readonly bh = new Float32Array(this.nb);
  private readonly bsx = new Float32Array(this.nb);
  private readonly bsz = new Float32Array(this.nb);
  private readonly bcr = new Float32Array(this.nb);
  /** Slope of the top surface along the chord (m per chord share): blocks tilt to it, so the top reads smooth. */
  private readonly btop = new Float32Array(this.nb);
  private readonly bcell = new Uint8Array(this.nb);
  private readonly bseed = new Float32Array(this.nb);
  // Each cell's frame now (world), how full it is, and its trailing-edge bend and ripple.
  private readonly pos = Array.from({ length: N }, () => new Vector3());
  private readonly quat = Array.from({ length: N }, () => new Quaternion());
  private readonly thick = new Float32Array(N);
  private readonly width = new Float32Array(N);
  private readonly chord = new Float32Array(N);
  private readonly bend = new Float32Array(N);
  private readonly wave = new Float32Array(N);
  private readonly phase = new Float32Array(N);
  // The collapse: from the last flight pose to a heap on the ground.
  private readonly from = { pos: Array.from({ length: N }, () => new Vector3()), quat: Array.from({ length: N }, () => new Quaternion()), thick: new Float32Array(N), width: new Float32Array(N), chord: new Float32Array(N), bend: new Float32Array(N) };
  private readonly rest = { pos: Array.from({ length: N }, () => new Vector3()), quat: Array.from({ length: N }, () => new Quaternion()) };
  private onWater = false;
  private restSize = 1;

  constructor() {
    this.object.name = 'parachute';
    const b = new VoxelBuilder();
    const src = traceSource();
    let k = 0;
    for (let i = 0; i < N; i++) {
      const chord = cellChord(i);
      const cols = cellCols(i);
      const bw = cellW(i) / cols;
      for (let col = 0; col < cols; col++) {
        // The ribs between cells are thinner than the cells' middles: the canopy reads cell by cell.
        const rib = col === 0 || col === cols - 1;
        for (let row = 0; row < ROWS; row++, k++) {
          const cr = (row + 0.5) / ROWS;
          // Under the flag the top is flat (the flag's plane), ribs too.
          const flag = i === MID && cr > FLAG_C0 && cr < FLAG_C1;
          const yb = chord * 0.03 * Math.sin(Math.PI * cr);
          const t = (flag ? FLAG_Y0 + FLAG_RISE * (cr - FLAG_C0) : topAt(cr, chord, rib)) - yb;
          this.btop[k] = flag ? FLAG_RISE : (topAt(cr + 0.02, chord, rib) - topAt(cr - 0.02, chord, rib)) / 0.04;
          this.bx[k] = (col + 0.5 - cols / 2) * bw;
          this.by[k] = yb + t / 2;
          this.bz[k] = chord * (LEAD - cr);
          this.bh[k] = t;
          this.bsx[k] = bw * 0.98;
          this.bsz[k] = (chord / ROWS) * 1.04;
          this.bcr[k] = cr;
          this.bcell[k] = i;
          this.bseed[k] = hash3(i, col, row, 17);
          const shade = (rib && !flag ? 0.86 : 1) * (0.95 + 0.1 * hash3(i, col, row, 3));
          b.box(this.bx[k], this.by[k], this.bz[k], this.bsx[k], t, this.bsz[k], fabric(i, col, row), 'krama', { shade, src });
        }
      }
    }
    for (const side of [1, -1]) b.box(side * 0.2, 0, 0, 0.07, RISER, 0.035, STRAP, 'leather', { src });
    b.box(0, 0, 0, 0.07, 0.07, 0.07, 0xffc070, 'glow', { src });
    this.blocks = b.boxes.length;
    const g = buildVoxelMesh(b, { quality: 'medium', name: 'parachute' });
    const mesh = (fam: string) => g.children.find((c) => c.name === `parachute:${fam}`) as InstancedMesh;
    this.fabric = mesh('krama');
    this.straps = mesh('leather');
    this.lamp = mesh('glow');
    this.lamp.castShadow = false;
    // (posed by hand every frame: the build-time bounds mean nothing)
    for (const m of [this.fabric, this.straps, this.lamp]) m.frustumCulled = false;
    this.object.add(g);

    // Suspension lines: three rows per rib to a cascade, cascades to the risers; brake lines to the fists.
    const segs = (N + 1) * 4 + 2 * 5;
    this.linePos = new Float32Array(segs * 6);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.linePos, 3));
    this.lines = new LineSegments(geo, new LineBasicMaterial({ color: LINE_COLOR, transparent: true, opacity: 0.8 }));
    this.lines.name = 'parachute:lines';
    this.lines.frustumCulled = false;
    this.object.add(this.lines);

    // The flag: a pair of corners (his left, his right) on each of its rows, front to back; from behind him his
    // left is on the left, the flag's top towards the leading edge. Lit like the silk, in its shadows, casting none.
    const nv = FLAG_ROWS.length * 2;
    const uv = new Float32Array(nv * 2);
    const index: number[] = [];
    for (const [r, c] of FLAG_ROWS.entries()) {
      uv.set([0, 1 - (c - FLAG_C0) / (FLAG_C1 - FLAG_C0), 1, 1 - (c - FLAG_C0) / (FLAG_C1 - FLAG_C0)], r * 4);
      if (r > 0) index.push(2 * r - 2, 2 * r + 1, 2 * r - 1, 2 * r - 2, 2 * r, 2 * r + 1);
    }
    const fg = new BufferGeometry();
    fg.setAttribute('position', new BufferAttribute(new Float32Array(nv * 3), 3));
    fg.setAttribute('normal', new BufferAttribute(new Float32Array(nv * 3), 3));
    fg.setAttribute('uv', new BufferAttribute(uv, 2));
    fg.setIndex(index);
    this.flag = new Mesh(fg, flagMaterial());
    this.flag.name = 'parachute:flag';
    this.flag.frustumCulled = false;
    this.flag.receiveShadow = true;
    this.object.add(this.flag);
    this.object.visible = false;
  }

  hide(): void {
    this.object.visible = false;
  }

  /** Pose the canopy in the air (opening, flying, or folding back into the pack). */
  fly(p: CanopyPose): void {
    const size = p.size;
    const t = p.open;
    const lines = ease(t / 0.3);
    const spread = pop((t - 0.18) / 0.5);
    const chord = 0.35 + 0.65 * ease((t - 0.12) / 0.5);
    // Out of the pack, then carried up by the lines.
    const origin = _w.lerpVectors(p.pack, p.harness, lines);
    const up = 0.25 + (LINE - 0.25) * lines;
    for (let i = 0; i < N; i++) {
      const s = cellS(i);
      const d = cellD(i);
      const a = chain(i, spread, _v);
      // (folded: the cells lie stacked in a bundle)
      _v.y += up + (1 - spread) * (i - MID) * 0.09 + p.flutter * 0.03 * Math.sin(p.t * 5.1 + i * 1.9);
      this.pos[i].copy(_v.multiplyScalar(size).applyQuaternion(p.quat).add(origin));
      this.quat[i].copy(p.quat).multiply(_q.setFromEuler(_e.set(TRIM + p.flutter * 0.02 * Math.sin(p.t * 3.7 + i * 2.3), 0, -a)));
      this.thick[i] = 0.2 + 0.8 * pop((t - 0.28 - 0.2 * d) / 0.38);
      this.width[i] = 0.4 + 0.6 * Math.min(1.05, spread);
      this.chord[i] = chord;
      this.bend[i] = (s > 0 ? p.brakeL : p.brakeR) * BEND * (0.35 + 0.65 * d);
      this.wave[i] = 0.015 + 0.03 * p.flutter;
      this.phase[i] = p.t * 6.3 + i * 1.3;
    }
    this.writeFabric(size, null);
    // (the flag once the cells are out of the bundle)
    this.writeFlag(size, ease((spread - 0.85) / 0.15));
    this.writeStraps(p, 1);
    this.writeLines(p, p.lines);
    this.object.visible = true;
  }

  /**
   * Start collapsing, from the last `fly` pose, onto the ground (or the water)
   * behind a landing at `at` facing `yaw`, towards `side` (1 = his left).
   * `floorAt` is the ground or water height where each cell comes to rest.
   */
  collapse(at: Vector3, yaw: number, size: number, floorAt: (x: number, z: number) => number, water: boolean, side: 1 | -1): void {
    // (a little to one side of straight behind, where the follow camera can see it)
    const dir = yaw + side * 0.5;
    const f = this.from;
    for (let i = 0; i < N; i++) {
      f.pos[i].copy(this.pos[i]);
      f.quat[i].copy(this.quat[i]);
      f.thick[i] = this.thick[i];
      f.width[i] = this.width[i];
      f.chord[i] = this.chord[i];
      f.bend[i] = this.bend[i];
      // The heap: behind him, narrower than the span, cells crumpled every which way.
      const h1 = hash3(i, 1, 0, 91);
      const h2 = hash3(i, 2, 0, 91);
      const h3 = hash3(i, 3, 0, 91);
      const s = cellS(i) * 0.8 * size;
      const back = (LINE * 0.55 + h1 * 0.4) * size;
      const x = at.x - Math.sin(dir) * back + Math.cos(dir) * s;
      const z = at.z - Math.cos(dir) * back - Math.sin(dir) * s;
      const y = floorAt(x, z) + (0.06 + 0.2 * (1 - cellD(i)) * h2) * size;
      this.rest.pos[i].set(x, y, z);
      this.rest.quat[i].setFromAxisAngle(UP, dir).multiply(_q.setFromEuler(_e.set((h1 - 0.5) * 0.5, (h3 - 0.5) * 0.8, (h2 - 0.5) * 0.5)));
    }
    this.onWater = water;
    this.restSize = size;
  }

  /**
   * Pose the collapse `tau` s after it began: the cells lose their air and
   * fall back in a heap (the tips first), the lines go slack and fade, and a
   * few seconds later the blocks shrink away one by one. `p` gives the
   * explorer's harness for the fading lines. False once it is gone.
   */
  settle(tau: number, p: CanopyPose): boolean {
    const f = this.from;
    const r = this.rest;
    const size = this.restSize;
    const gone = this.onWater ? 1.6 : 3.2;
    const sink = this.onWater ? ease((tau - 0.9) / 1.6) * 0.5 * size : 0;
    for (let i = 0; i < N; i++) {
      const k = Math.min(1, Math.max(0, (tau - 0.15 * (1 - cellD(i))) / 1.3));
      const e = ease(k);
      const pos = this.pos[i];
      pos.x = f.pos[i].x + (r.pos[i].x - f.pos[i].x) * e;
      pos.z = f.pos[i].z + (r.pos[i].z - f.pos[i].z) * e;
      // (falls faster and faster, and billows up a little first)
      pos.y = f.pos[i].y + (r.pos[i].y - f.pos[i].y) * k * k + Math.sin(Math.PI * k) * 0.35 * size * (1 - k) - sink;
      this.quat[i].slerpQuaternions(f.quat[i], r.quat[i], e);
      const air = ease(tau / 0.8);
      this.thick[i] = f.thick[i] + (0.22 - f.thick[i]) * air;
      this.width[i] = f.width[i] + (0.82 - f.width[i]) * air;
      this.chord[i] = f.chord[i] + (0.85 - f.chord[i]) * air;
      this.bend[i] = f.bend[i] * (1 - e);
      this.wave[i] = 0.06 * (1 - k);
      this.phase[i] = tau * 9 + i * 1.3;
    }
    const left = (seed: number) => 1 - ease((tau - gone - seed) / 0.4);
    this.writeFabric(size, left);
    this.writeFlag(size, left(0.5));
    this.writeStraps(p, 1 - ease(tau / 0.3));
    this.writeLines(p, 1 - ease((tau - 0.1) / 0.8));
    this.object.visible = tau < gone + 1.45;
    return this.object.visible;
  }

  /** Write every fabric block's matrix from its cell (`shrink` per block seed: blocks fading away). */
  private writeFabric(size: number, shrink: ((seed: number) => number) | null): void {
    const m = this.fabric;
    for (let k = 0; k < this.nb; k++) {
      const i = this.bcell[k];
      const cr = this.bcr[k];
      const chordLen = cellChord(i) * this.chord[i];
      // The trailing edge bends down under a pulled toggle and ripples a little.
      const dy = this.trail(i, cr);
      const slope = this.btop[k] * this.thick[i] + trailSlope;
      const sk = shrink ? Math.max(0, shrink(this.bseed[k])) : 1;
      _v.set(this.bx[k] * this.width[i], this.by[k] * this.thick[i] + dy, this.bz[k] * this.chord[i]).multiplyScalar(size).applyQuaternion(this.quat[i]).add(this.pos[i]);
      _q.copy(this.quat[i]).multiply(_q2.setFromAxisAngle(X, Math.atan(slope / chordLen)));
      _s.set(this.bsx[k] * this.width[i], Math.max(0.03, this.bh[k] * this.thick[i]), this.bsz[k] * this.chord[i]).multiplyScalar(size * sk);
      m.setMatrixAt(k, _m.compose(_v, _q, _s));
    }
    m.instanceMatrix.needsUpdate = true;
    // (bounds come back from the new matrices when something asks: a pick)
    m.boundingSphere = null;
    m.boundingBox = null;
  }

  /** The flag on the middle cell's flat top, as the cell is now (`shown` 0‥1: tucked away to its middle). */
  private writeFlag(size: number, shown: number): void {
    const flag = this.flag;
    flag.visible = shown > 0.01;
    if (!flag.visible) return;
    const pos = flag.geometry.attributes.position.array as Float32Array;
    const nor = flag.geometry.attributes.normal.array as Float32Array;
    const quat = this.quat[MID];
    const chordLen = CHORD * this.chord[MID];
    const x = (FLAG_W / 2) * this.width[MID] * shown;
    const mid = (FLAG_C0 + FLAG_C1) / 2;
    for (const [r, row] of FLAG_ROWS.entries()) {
      // On the flat top, pulled down and rippled as the blocks under it are.
      const c = mid + (row - mid) * shown;
      const y = (FLAG_Y0 + FLAG_RISE * (c - FLAG_C0)) * this.thick[MID] + this.trail(MID, c) + FLAG_LIFT;
      const z = (LEAD - c) * chordLen;
      _w.set(0, chordLen, FLAG_RISE * this.thick[MID] + trailSlope).normalize().applyQuaternion(quat);
      for (const [n, side] of [[0, 1], [1, -1]]) {
        _v.set(side * x, y, z).multiplyScalar(size).applyQuaternion(quat).add(this.pos[MID]).toArray(pos, (2 * r + n) * 3);
        _w.toArray(nor, (2 * r + n) * 3);
      }
    }
    flag.geometry.attributes.position.needsUpdate = true;
    flag.geometry.attributes.normal.needsUpdate = true;
  }

  /**
   * How far the silk of cell `i` at chord share `cr` is pulled down by a
   * toggle and rippled (m, true size); its slope along the chord (m per
   * chord share) goes to `trailSlope`.
   */
  private trail(i: number, cr: number): number {
    const te = Math.max(0, (cr - 0.45) / 0.55);
    const ph = this.phase[i] + cr * 5;
    const bend = this.bend[i];
    const wave = this.wave[i];
    trailSlope = (te > 0 ? (-bend * 1.7 * te ** 0.7) / 0.55 : 0) + wave * (5 * Math.cos(ph) * cr * cr + 2 * cr * Math.sin(ph));
    return -bend * te ** 1.7 + wave * Math.sin(ph) * cr * cr;
  }

  /** Riser top on each side (world): above the shoulders, where the lines meet. */
  private riserTop(p: CanopyPose, side: 1 | -1, out: Vector3): Vector3 {
    return out.set(side * 0.15, RISER, -0.02).multiplyScalar(p.size).applyQuaternion(p.quat).add(p.harness);
  }

  /** The two risers from the shoulders up, and the little lamp on his pack (`k` shrinks them away). */
  private writeStraps(p: CanopyPose, k: number): void {
    const top = _top;
    for (const [n, side, shoulder] of [[0, 1, p.shoulderL], [1, -1, p.shoulderR]] as const) {
      this.riserTop(p, side, top);
      _w.subVectors(top, shoulder);
      const len = _w.length();
      _q.setFromUnitVectors(UP, _w.divideScalar(Math.max(1e-4, len)));
      _v.addVectors(top, shoulder).multiplyScalar(0.5);
      _s.set(0.07 * p.size * k, len * k, 0.035 * p.size * k);
      this.straps.setMatrixAt(n, _m.compose(_v, _q, _s));
    }
    const lk = 0.07 * p.size * k;
    this.lamp.setMatrixAt(0, _m.compose(p.lamp, p.quat, _s.set(lk, lk, lk)));
    this.straps.instanceMatrix.needsUpdate = true;
    this.lamp.instanceMatrix.needsUpdate = true;
    // Soft by day, a warm spark at night (bright enough to bloom).
    this.lamp.setColorAt(0, _c.copy(LAMP).multiplyScalar(0.5 + p.night * 5));
    if (this.lamp.instanceColor) this.lamp.instanceColor.needsUpdate = true;
  }

  /** Point on the underside of rib `b` (0‥N, between cells) at chord share `cr` (world). */
  private ribPoint(b: number, cr: number, size: number, out: Vector3): Vector3 {
    const i = Math.min(b, N - 1);
    const edge = b < N ? -0.5 : 0.5;
    const chord = cellChord(i);
    const te = Math.max(0, (cr - 0.45) / 0.55);
    const y = chord * 0.03 * Math.sin(Math.PI * cr) * this.thick[i] - this.bend[i] * te ** 1.7;
    return out.set(edge * cellW(i) * this.width[i], y, chord * (LEAD - cr) * this.chord[i]).multiplyScalar(size).applyQuaternion(this.quat[i]).add(this.pos[i]);
  }

  private writeLines(p: CanopyPose, strength: number): void {
    const mat = this.lines.material;
    mat.opacity = 0.8 * strength;
    this.lines.visible = strength > 0.02;
    if (!this.lines.visible) return;
    const out = this.linePos;
    let n = 0;
    const seg = (a: Vector3, b: Vector3) => {
      out[n++] = a.x;
      out[n++] = a.y;
      out[n++] = a.z;
      out[n++] = b.x;
      out[n++] = b.y;
      out[n++] = b.z;
    };
    const size = p.size;
    const topL = this.riserTop(p, 1, _topL);
    const topR = this.riserTop(p, -1, _topR);
    const a = _a;
    const cascade = _mid;
    for (let b = 0; b <= N; b++) {
      // (ribs with b < N/2 are on his right: −x)
      const top = b < N / 2 ? topR : topL;
      cascade.lerpVectors(this.ribPoint(b, 0.4, size, a), top, 0.42);
      for (const cr of [0.1, 0.4, 0.68]) seg(this.ribPoint(b, cr, size, a), cascade);
      seg(cascade, top);
    }
    // Brake lines: the trailing edge of the outer cells to each fist.
    for (const [b0, hand] of [[0, p.handR], [N - 3, p.handL]] as const) {
      const mid = _mid.set(0, 0, 0);
      for (let j = 0; j < _te.length; j++) mid.add(this.ribPoint(b0 + j, 1, size, _te[j]));
      mid.multiplyScalar(1 / _te.length).lerp(hand, 0.5);
      for (const q of _te) seg(q, mid);
      seg(mid, hand);
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
  }
}
