import { BoxGeometry, Color, DynamicDrawUsage, Euler, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3, type Object3D } from 'three';
import { GROUND_CLEAR } from '../groundClear';
import { isTree, KINDS, trunkAt, type PlantKindId } from '../garden/kinds';
import { plantBlocks } from '../garden/look';
import { bedHalf, type RowSpot } from '../garden/rows';
import type { PlantLook } from '../garden/state';
import type { RoamWorld } from './types';

/**
 * Planting mode's preview (roam/_garden.ts): where the plant he is about to plant would go, readable on its own as
 * a placement preview is in a farming game.
 *
 * - **It can go there**: a translucent patch of freshly dug earth on the ground — the crop's bed (a square,
 *   garden/_viewEarth.ts's size) or the young tree's basin (a ring of earth) — with the plant standing on it as it
 *   soon will (a crop's young plant, a tree's sapling: the kind's own model, garden/look.ts, tinted pale), and a
 *   faint dotted circle the size of the room it needs (nothing else is planted inside it).
 * - **It cannot**: the same patch in grey with a small "✕" of blocks on it, the plant hidden (the reason is the
 *   prompt's line). Never invisible: it is drawn over whatever stands there (a basket, a stair), on the top of what
 *   is there when that is low (the dog's bed), else on the land.
 *
 * The patch and the dots lie square to the map, as the real bed will (garden/_viewEarth.ts); the plant turns. With
 * "Rows" on (AWP-32: garden/rows.ts) a faint guide lies on the ground too: pale dashes along the row, from its first
 * plant through the ghost and on, and a small square mark on each of the next spots that can be planted.
 *
 * It sits before his feet and follows him as he walks and turns; it breathes slowly. Where it goes, the ground cover
 * steps aside (map/groundClear.ts, a disc moved only after a metre and at most twice a second). One instanced draw
 * of small blocks in a plain colour each (a basic material: no lights), made with roaming so its shader is
 * compiled before Start; no allocation per frame.
 */

/** Most blocks a ghost has: the plant, its patch and dots; and its guide's (AWP-32). */
const MAX_GHOST = 760;
const GUIDE_MAX = 72;
const MAX = MAX_GHOST + GUIDE_MAX;
/** The plant: its own colours, this much toward a pale mint (it stands out of the grass); this much bigger. */
const LIGHT = 0.45;
const MINT = new Color(0xeaffd6);
const GROW = 1.25;
/** Freshly dug earth (sRGB), its edge a shade lighter; grey where it cannot go, its ✕; the room's dots. */
const EARTH = new Color(0x7a5434);
const EARTH_EDGE = new Color(0x9a7048);
const GREY = new Color(0x9c9a94);
const GREY_EDGE = new Color(0xb8b6b0);
const CROSS = new Color(0xf2f0ea);
const DOTS = new Color(0xe6efd6);
/** Opacity where it can go and where not; its breath (rad/s, swell). */
const ALPHA = { ok: 0.68, no: 0.72 };
const PULSE = 1.5;
const SWELL = 0.07;
/** The patch over the ground (m); the highest thing it lies on (m over the land), else on the land. */
const UP = 0.035;
const ON_TOP = 0.9;
/**
 * The rows' guide (AWP-32): dashes `dash` long every `every` m, `w` wide, back along the row at most `back` m from the
 * ghost; a mark's bars `w` wide round a square of `mark` × the next bed's side (a tree's: `markTree` m). Its colour.
 */
const GUIDE = { dash: 0.34, every: 0.68, w: 0.055, back: 12, mark: 0.72, markTree: 0.9, up: UP + 0.03 };
const GUIDE_C = new Color(0xe4ecd0);
/** The ground cover's disc under it: its key, moved after this far (m) and at most this often (s). */
const CLEAR_KEY = -7301;
const CLEAR_MOVE = 1;
const CLEAR_EVERY = 0.5;

/** Who shows a block: always, only where it can go, only where not. */
type Show = 0 | 1 | 2;

interface GhostBox {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  q: Quaternion;
  c: Color;
  /** Where it cannot go: its colour (null: hidden). */
  g: Color | null;
  show: Show;
  /** It lies on the ground under it (the patch, the dots), else stands on the patch's middle (the plant). */
  flat: boolean;
  /** Square to the map (the patch, the dots: as the real bed lies), else turned with the plant. */
  fixed: boolean;
}

/** One block of the guide, on the map (m): its middle, size, turn about the up axis. */
interface GuideBox {
  x: number;
  z: number;
  sx: number;
  sz: number;
  ry: number;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _qy = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _up = new Vector3(0, 1, 0);
const _e = new Euler();

export class GardenGhost {
  readonly mesh: InstancedMesh;
  private readonly mat: MeshBasicMaterial;
  private boxes: GhostBox[] = [];
  private kind: PlantKindId | null = null;
  private clearR = 1;
  private want = false;
  private x = 0;
  private z = 0;
  private yaw = 0;
  private ok = true;
  private shownOk: boolean | null = null;
  private on = 0;
  private clock = 0;
  /** The ground cover's disc: where it was set (m), when (s); set at all. */
  private cx = 0;
  private cz = 0;
  private ct = -1e9;
  private cleared = false;
  /** The guide's blocks now (on the map), how many. */
  private readonly guides: GuideBox[] = Array.from({ length: GUIDE_MAX }, () => ({ x: 0, z: 0, sx: 0, sz: 0, ry: 0 }));
  private nGuide = 0;

  constructor(parent: Object3D, private readonly world: RoamWorld) {
    this.mat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: true });
    this.mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), this.mat, MAX);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX * 3).fill(1), 3);
    this.mesh.name = 'garden:ghost';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.castShadow = this.mesh.receiveShadow = false;
    // (one tiny block far under the land on the first frames: its shader is compiled with the map's, before Start)
    this.mesh.setMatrixAt(0, _m.makeScale(0.001, 0.001, 0.001).setPosition(0, -500, 0));
    this.mesh.count = 1;
    parent.add(this.mesh);
  }

  /** The kind it shows (its blocks made once per kind). */
  setKind(kind: PlantKindId): void {
    if (kind === this.kind) return;
    this.kind = kind;
    this.shownOk = null;
    const k = KINDS[kind];
    const tree = isTree(k);
    const out: GhostBox[] = [];
    const flat = (x: number, z: number, sx: number, sy: number, sz: number, ry: number, c: Color, g: Color | null, show: Show, y = UP) =>
      out.push({ x, y: y + sy / 2, z, sx, sy, sz, q: new Quaternion().setFromAxisAngle(_up, ry), c, g, show, flat: true, fixed: true });
    // The patch of dug earth (both states; grey where it cannot go).
    let half: number;
    if (!tree) {
      // A crop's bed: a square (garden/_viewEarth.ts: half its side `room × 0.75` within 0.45‥0.85 m), a raised edge.
      half = Math.min(0.85, Math.max(0.45, k.room * 0.75));
      flat(0, 0, half * 2 - 0.1, 0.05, half * 2 - 0.1, 0, EARTH, GREY, 0);
      for (const s of [-1, 1]) {
        flat(s * (half - 0.05), 0, 0.1, 0.08, half * 2, 0, EARTH_EDGE, GREY_EDGE, 0);
        flat(0, s * (half - 0.05), half * 2 - 0.2, 0.08, 0.1, 0, EARTH_EDGE, GREY_EDGE, 0);
      }
    } else {
      // A young tree's basin: a ring bank of earth round a dish of it.
      const r = 0.6 + trunkAt(k, 3);
      half = r + 0.12;
      flat(0, 0, r * 1.5, 0.04, r * 1.5, Math.PI / 4, EARTH, GREY, 0);
      flat(0, 0, r * 1.5, 0.04, r * 1.5, 0, EARTH, GREY, 0);
      const n = 20;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        flat(Math.sin(a) * r, Math.cos(a) * r, 0.2, 0.1, ((Math.PI * 2 * r) / n) * 1.05, a + Math.PI / 2, EARTH_EDGE, GREY_EDGE, 0);
      }
    }
    this.clearR = half + 0.15;
    // Where it cannot go: a small ✕ of blocks on the patch.
    const cl = Math.min(0.9, half * 1.3);
    for (const a of [Math.PI / 4, -Math.PI / 4]) flat(0, 0, 0.11, 0.05, cl, a, CROSS, CROSS, 2, UP + 0.06);
    // The room it needs: a dotted circle, faint (both states).
    const room = k.room;
    const nd = Math.max(12, Math.min(64, Math.round((Math.PI * 2 * room) / 0.45)));
    for (let i = 0; i < nd; i++) {
      const a = (i / nd) * Math.PI * 2;
      flat(Math.sin(a) * room, Math.cos(a) * room, 0.1, 0.03, 0.1, a, DOTS, GREY_EDGE, 0);
    }
    // The plant standing on the patch (only where it can go): a crop as the young plant it soon is (a sprout is lost
    // in the meadow's grass), a tree as its sapling.
    const look: PlantLook = { kind, stage: tree ? 1 : 2, fruit: 0, fallen: 0, droop: 0, dead: false, seed: 0.37, cut: false };
    for (const b of plantBlocks(look).boxes) {
      if (out.length >= MAX_GHOST) break;
      out.push({
        x: b.x * GROW,
        y: b.y * GROW + UP + 0.05,
        z: b.z * GROW,
        sx: b.sx * GROW,
        sy: b.sy * GROW,
        sz: b.sz * GROW,
        q: new Quaternion().setFromEuler(_e.set(b.rx ?? 0, b.ry ?? 0, b.rz ?? 0)),
        c: new Color(b.color).lerp(MINT, LIGHT),
        g: null,
        show: 1,
        flat: false,
        fixed: false,
      });
    }
    this.boxes = out;
  }

  /** Show it at (x, z) turned `yaw` (as `body.yaw`), where it can go (`ok`) or grey; or hide it (null). */
  show(x: number | null, z = 0, yaw = 0, ok = true): void {
    if (x === null || !this.kind) {
      this.want = false;
      return;
    }
    this.want = true;
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.ok = ok;
  }

  get shown(): boolean {
    return this.want;
  }

  /** How many blocks the guide has now (checks). */
  get guideBlocks(): number {
    return this.want ? this.nGuide : 0;
  }

  /**
   * The rows' guide (AWP-32) for the spot `r` (garden/rows.ts `snapRow` + `rowNext`), or none (null: Rows off). Marks
   * first (the next spots), then the dashes outward from the ghost, so a long row never crowds out what is near.
   */
  guide(r: RowSpot | null): void {
    this.nGuide = 0;
    if (!r || !this.kind) return;
    const ry = Math.atan2(r.dx, r.dz);
    const side = isTree(KINDS[this.kind]) ? GUIDE.markTree : bedHalf(this.kind) * 2 * GUIDE.mark;
    const h = side / 2;
    const add = (x: number, z: number, sx: number, sz: number, a: number) => {
      if (this.nGuide >= GUIDE_MAX) return;
      const g = this.guides[this.nGuide++];
      g.x = x;
      g.z = z;
      g.sx = sx;
      g.sz = sz;
      g.ry = a;
    };
    // The next spots: a square of four bars each, along the row's way.
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    for (let i = 0; i < r.nNext; i++) {
      const x = r.next[i * 2];
      const z = r.next[i * 2 + 1];
      // (local x across the row is (cos, −sin) on the map; local z along it (sin, cos))
      for (const k of [-1, 1]) {
        add(x + k * h * s, z + k * h * c, side + GUIDE.w, GUIDE.w, ry);
        add(x + k * h * c, z - k * h * s, GUIDE.w, side + GUIDE.w, ry);
      }
    }
    // The dashes: from the ghost forward to the last next spot, then back toward the row's first plant.
    const ahead = r.nNext * r.step;
    let back = 0;
    if (r.hasFrom) back = Math.min(GUIDE.back, (r.fx - r.x) * -r.dx + (r.fz - r.z) * -r.dz);
    for (let u = GUIDE.every / 2; u < ahead; u += GUIDE.every) add(r.x + r.dx * u, r.z + r.dz * u, GUIDE.w, GUIDE.dash, ry);
    for (let u = GUIDE.every / 2; u < back; u += GUIDE.every) add(r.x - r.dx * u, r.z - r.dz * u, GUIDE.w, GUIDE.dash, ry);
  }

  /** The ground height a block lies on at (x, z): the top of something low there (a basket, a step), else the land. */
  private groundAt(x: number, z: number): number {
    const land = this.world.field.heightAt(x, z);
    const top = this.world.groundAt(x, z);
    return top - land < ON_TOP ? Math.max(top, land) : land;
  }

  /** Each frame: fade, breath, its blocks on the land; the ground cover's disc. */
  frame(dt: number): void {
    this.clock += dt;
    const k = dt > 0 ? Math.min(1, dt * 8) : 1;
    this.on += ((this.want ? 1 : 0) - this.on) * k;
    this.clearDisc();
    if (this.on < 0.02 && !this.want) {
      this.on = 0;
      this.mesh.count = 1;
      this.mesh.setMatrixAt(0, _m.makeScale(0.001, 0.001, 0.001).setPosition(0, -500, 0));
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mat.opacity = 0;
      return;
    }
    const breath = 1 + SWELL * Math.sin(this.clock * PULSE);
    this.mat.opacity = this.on * (this.ok ? ALPHA.ok : ALPHA.no) * breath;
    // (where it cannot go it is drawn over what stands there: never invisible)
    if (this.mat.depthTest !== this.ok) this.mat.depthTest = this.ok;
    const boxes = this.boxes;
    const recolour = this.shownOk !== this.ok;
    this.shownOk = this.ok;
    const y0 = this.groundAt(this.x, this.z);
    _qy.setFromAxisAngle(_up, this.yaw);
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    let n = 0;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if ((b.show === 1 && !this.ok) || (b.show === 2 && this.ok)) continue;
      // (the patch and the dots square to the map, as the real bed; the plant turned)
      if (b.fixed) _p.set(this.x + b.x, 0, this.z + b.z);
      else _p.set(this.x + b.x * c + b.z * s, 0, this.z - b.x * s + b.z * c);
      // (the patch and the dots follow the ground under them; the plant stands on the patch's middle)
      _p.y = (b.flat ? this.groundAt(_p.x, _p.z) : y0) + b.y;
      if (b.fixed) _q.copy(b.q);
      else _q.copy(_qy).multiply(b.q);
      this.mesh.setMatrixAt(n, _m.compose(_p, _q, _s.set(b.sx, b.sy, b.sz)));
      if (recolour) this.mesh.setColorAt(n, this.ok ? b.c : (b.g ?? b.c));
      n++;
    }
    // The rows' guide (its blocks after the ghost's: their colours written each frame, as the ghost's count moves them).
    for (let i = 0; i < this.nGuide && n < MAX; i++) {
      const g = this.guides[i];
      _p.set(g.x, this.groundAt(g.x, g.z) + GUIDE.up + 0.0125, g.z);
      _q.setFromAxisAngle(_up, g.ry);
      this.mesh.setMatrixAt(n, _m.compose(_p, _q, _s.set(g.sx, 0.025, g.sz)));
      this.mesh.setColorAt(n, GUIDE_C);
      n++;
    }
    if ((recolour || this.nGuide) && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** The ground cover steps aside under it (moved after a metre, at most twice a second); away when it hides. */
  private clearDisc(): void {
    if (!this.want) {
      if (this.cleared) {
        GROUND_CLEAR.set(CLEAR_KEY, 0, 0, 0);
        this.cleared = false;
      }
      return;
    }
    if (this.clock - this.ct < CLEAR_EVERY) return;
    if (this.cleared && Math.hypot(this.x - this.cx, this.z - this.cz) < CLEAR_MOVE) return;
    this.cx = this.x;
    this.cz = this.z;
    this.ct = this.clock;
    this.cleared = true;
    GROUND_CLEAR.set(CLEAR_KEY, this.x, this.z, this.clearR);
  }
}
