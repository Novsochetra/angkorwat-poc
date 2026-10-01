import { CanvasTexture, Color, DynamicDrawUsage, Group, InstancedMesh, LinearFilter, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, NearestFilter, PlaneGeometry, Quaternion, SRGBColorSpace, Vector3, type Object3D } from 'three';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh, disposeVoxelMesh } from '../../voxel/VoxelMesh';
import { BODY_UNIT_M } from '../../world/scale';
import { Splash } from '../fauna/_landSplash';
import { GROUND_COLORS, RICE_COLORS } from '../paddies/ground';
import { sheafBuilder, turnBox } from './_farmProps';
import { ROAM_SCALE } from './types';

/**
 * What helping the farmers leaves in the field (roam/_farmWork.ts), in
 * roaming's own group:
 *
 * - the **guide**: a small dashed ring of light, gold like the prayer's lotus
 *   (_prayMark.ts), on the water or the earth where his next clump goes,
 *   breathing gently (one flat square, no light, one draw while shown);
 * - **splashes**: rings and drops where his feet go in the flooded plot and
 *   where his hand pushes the seedlings in (the elephants' bath splash,
 *   fauna/_landSplash.ts: one draw while any is alive);
 * - his **sheaves on the bund**: laid side by side across the dike, heads
 *   out, as the farmers lay theirs; they stay for the visit (one voxel mesh a
 *   bund, built again when he lays one more);
 * - the **cut floor** of his swath: under standing rice the paddies' floor
 *   takes the rice's gold (paddies/ground.ts); where he has cut, a soft patch
 *   of the cut floor's earth (wet mud drying, as the season has it) a clump
 *   each, so the swath reads among the tall heads; each fades once the
 *   plot's own cut has come there (its floor is the cut one then). One
 *   instanced draw.
 *
 * Made the first time he helps; nothing is drawn before.
 */

/** The guide ring (m across, true size; times his size) and how high over the floor (m): the water's skin is 0.11 over it. */
const RING = 0.44;
const RING_UP = { water: 0.135, dry: 0.075 };
/** Brightness by day and at night (over the bloom threshold, post.ts: it glows), the breath's pace (rad/s) and swell. */
const DAY = 1.0;
const NIGHT = 1.9;
const PULSE = 2.6;
const SWELL = 0.12;
/** Sheaves side by side on the bund (BU apart, his size), how long a bund's pile may grow along it (sheaves). */
const SHEAF_GAP = 2.1;
/** Two sheaves this near (m) are on the same bund's pile. */
const SAME_PILE = 3.5;
/** The cut floor: a patch a clump (m across), over the dry floor's skin (paddies/ground.ts lifts it 0.05), as many as kept. */
const PATCH = 0.78;
const PATCH_UP = 0.058;
const PATCHES = 96;
/** A patch grows in over this (s); and fades over this much of the season once the plot's own cut has come. */
const PATCH_IN = 0.3;
const PATCH_OUT = 0.012;

/** The ring: dashes of gold round a soft glow, in pixel art (32 × 32). */
function ringTexture(): CanvasTexture {
  const n = 32;
  const cell = 4;
  const c = document.createElement('canvas');
  c.width = c.height = n * cell;
  const g = c.getContext('2d')!;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const dx = x + 0.5 - n / 2;
      const dy = y + 0.5 - n / 2;
      const r = Math.hypot(dx, dy) / (n / 2);
      const a = Math.atan2(dy, dx);
      let col: string | null = null;
      // (the dashed ring: 12 dashes, a bright inner edge)
      if (r > 0.74 && r < 0.92 && Math.floor(((a + Math.PI) / (Math.PI * 2)) * 24) % 2 === 0) col = r < 0.82 ? 'rgba(255, 238, 170, 0.95)' : 'rgba(255, 206, 92, 0.9)';
      // (a soft glow inside it, fading out to the ring)
      else if (r < 0.7) col = `rgba(255, 220, 130, ${(0.32 * (1 - r / 0.7) ** 1.5).toFixed(3)})`;
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x * cell, y * cell, cell, cell);
    }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.magFilter = NearestFilter;
  t.generateMipmaps = false;
  t.minFilter = NearestFilter;
  return t;
}

interface Pile {
  /** Where the first sheaf lies (m) and the bund's way (unit x, z) the next go along; the sheaves' outward way. */
  at: Vector3;
  ax: number;
  az: number;
  ox: number;
  oz: number;
  n: number;
  group: Group;
  mesh: Group | null;
  builder: VoxelBuilder;
}

const _m = new Matrix4();
const _m2 = new Matrix4();
const _q = new Quaternion();
const _s = new Vector3();
const _c = new Color();
const _c2 = new Color();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();

export class FarmMarks {
  private guide: Mesh | null = null;
  private guideMat: MeshBasicMaterial | null = null;
  private splash: Splash | null = null;
  private readonly piles: Pile[] = [];
  private tied: VoxelBuilder | null = null;
  /** The marks' own clock (s). */
  private clock = 0;
  private guideOn = 0;
  private guideWant = 0;
  private patches: InstancedMesh | null = null;
  /** Each patch: where (m), when it was cut (the marks' clock), the plot's own cut there (plot-local season) and that plot's lag. */
  private readonly patchAt: { x: number; y: number; z: number; t: number; cut0: number; lag: number }[] = [];
  private patchNext = 0;
  /** Until when a patch grows in, and when the patches are looked at next (the marks' clock). */
  private patchGrow = -1;
  private patchLook = -1;

  constructor(private readonly parent: Object3D) {}

  private makeGuide(): Mesh {
    const geo = new PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.guideMat = new MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false, toneMapped: true });
    const m = new Mesh(geo, this.guideMat);
    m.name = 'farm:guide';
    m.renderOrder = 3;
    m.frustumCulled = false;
    m.visible = false;
    this.parent.add(m);
    return m;
  }

  /** The guide on the floor at (x, y, z) (`wet`: on the water), or nowhere (null). Fades in and out by itself. */
  showGuide(at: Vector3 | null, wet = false): void {
    if (!at) {
      this.guideWant = 0;
      return;
    }
    const g = (this.guide ??= this.makeGuide());
    g.position.set(at.x, at.y + (wet ? RING_UP.water : RING_UP.dry), at.z);
    this.guideWant = 1;
  }

  /** A splash at (x, y, z) on the water: `size` 0‥1 (a footfall ~0.5, the seedlings pushed in ~0.35). */
  splashAt(x: number, y: number, z: number, size: number): void {
    const s = (this.splash ??= this.makeSplash());
    const t = this.clock;
    s.ring(x, y, z, t, 0.25 + 0.35 * size, 0.55 + 0.3 * size, 0.7 + 0.4 * size, size * 0.6);
    const n = 2 + Math.round(5 * size);
    for (let i = 0; i < n; i++) {
      const a = hash3(Math.round(t * 60), i, 3, 8851) * Math.PI * 2;
      const v = 0.5 + hash3(Math.round(t * 60), i, 5, 8851) * 0.9 * size;
      s.drop(x, y + 0.02, z, t, Math.cos(a) * v * 0.6, 1.0 + 1.6 * size * hash3(i, 7, 1, 8853), Math.sin(a) * v * 0.6, 0.025 + 0.02 * size, 0.6, y - 0.01, 0.75);
    }
  }

  private makeSplash(): Splash {
    const s = new Splash();
    s.mesh.name = 'farm:splash';
    this.parent.add(s.mesh);
    return s;
  }

  /**
   * His sheaf laid on the bund at (x, y, z): across the dike, its heads `(ox, oz)` (out from the plot), beside the
   * ones he laid there before (along `(ax, az)`).
   */
  laySheaf(x: number, y: number, z: number, ax: number, az: number, ox: number, oz: number): void {
    let pile = this.piles.find((p) => Math.hypot(p.at.x - x, p.at.z - z) < SAME_PILE + p.n * SHEAF_GAP * BODY_UNIT_M * ROAM_SCALE);
    if (!pile) {
      const group = new Group();
      group.name = 'farm:sheaves';
      group.position.set(x, y, z);
      group.scale.setScalar(BODY_UNIT_M * ROAM_SCALE);
      this.parent.add(group);
      pile = { at: new Vector3(x, y, z), ax, az, ox, oz, n: 0, group, mesh: null, builder: new VoxelBuilder() };
      this.piles.push(pile);
    }
    // (lying on its side across the dike: its stalks along `o`, the heads out, their nodding side down on the earth)
    const k = pile.n;
    const along = (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * SHEAF_GAP;
    const jitter = (hash3(k, 1, 3, 8861) - 0.5) * 0.25;
    const c = Math.cos(jitter);
    const s = Math.sin(jitter);
    const sx = pile.ox * c - pile.oz * s;
    const sz = pile.ox * s + pile.oz * c;
    _y.set(sx, 0, sz);
    _z.set(0, -1, 0);
    _x.crossVectors(_y, _z);
    _m.makeBasis(_x, _y, _z);
    // (its middle a sheaf's half-thickness over the ground; the fist's place in it is a little toward the stalk ends)
    _m2.makeTranslation(pile.ax * along - sx * 1.6, 0.95, pile.az * along - sz * 1.6);
    _m.premultiply(_m2);
    this.tied ??= sheafBuilder(12, true);
    for (const b of this.tied.boxes) turnBox(b, _m, pile.builder);
    pile.n++;
    if (pile.mesh) {
      pile.group.remove(pile.mesh);
      disposeVoxelMesh(pile.mesh);
    }
    pile.mesh = buildVoxelMesh(pile.builder, { quality: 'medium', name: 'farm:sheaves', castShadow: true });
    pile.group.add(pile.mesh);
  }

  private makePatches(): InstancedMesh {
    // (a soft round patch: full in its middle, fading out to its edge)
    const n = 32;
    const c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, n, n);
    const tex = new CanvasTexture(c);
    tex.minFilter = tex.magFilter = LinearFilter;
    const geo = new PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new MeshStandardMaterial({ color: GROUND_COLORS.mud, roughness: 1, metalness: 0, alphaMap: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
    mat.name = 'farm:cut-floor';
    const m = new InstancedMesh(geo, mat, PATCHES);
    m.name = 'farm:cut-floor';
    m.instanceMatrix.setUsage(DynamicDrawUsage);
    m.count = 0;
    m.frustumCulled = false;
    m.receiveShadow = true;
    m.renderOrder = 1;
    this.parent.add(m);
    return m;
  }

  /** A clump cut at (x, y, z) (its foot): a patch of the cut floor under it, until the plot's own cut (`cut0`, its `lag`) comes there. */
  cutFloor(x: number, y: number, z: number, cut0: number, lag: number): void {
    const m = (this.patches ??= this.makePatches());
    const k = this.patchNext;
    this.patchNext = (k + 1) % PATCHES;
    this.patchAt[k] = { x, y, z, t: this.clock, cut0, lag };
    m.count = Math.max(m.count, k + 1);
    this.patchGrow = this.clock + PATCH_IN + 0.05;
  }

  /** Every frame: the guide's breath and fade, the splashes' clock. */
  frame(dt: number, night: number, scale: number, season = 0.7): void {
    this.clock += dt;
    const g = this.guide;
    if (g && this.guideMat) {
      this.guideOn += (this.guideWant - this.guideOn) * (dt > 0 ? Math.min(1, dt * 8) : 1);
      g.visible = this.guideOn > 0.01;
      const breath = 0.5 + 0.5 * Math.sin(this.clock * PULSE);
      g.scale.setScalar(RING * (scale / ROAM_SCALE) * (1 + SWELL * breath * 0.5));
      this.guideMat.opacity = this.guideOn * (0.75 + 0.25 * breath);
      this.guideMat.color.setScalar(DAY + (NIGHT - DAY) * night);
    }
    this.splash?.flush(this.clock, night);
    const m = this.patches;
    // (written again while one grows in, else twice a second: the season fades them slowly)
    if (m && m.count > 0 && (this.clock < this.patchGrow || this.clock >= this.patchLook)) {
      this.patchLook = this.clock + 0.5;
      // (the cut floor's earth now: wet mud drying after the water was let out, as paddies/ground.ts has it)
      const s0 = this.patchAt[0] ? (((season - this.patchAt[0].lag) % 1) + 1) % 1 : season;
      const mud = Math.max(0.15, 1 - smoothstep(0.62, 0.8, s0));
      (m.material as MeshStandardMaterial).color.copy(_c.setHex(GROUND_COLORS.dry)).lerp(_c2.setHex(GROUND_COLORS.mud), mud).lerp(_c2.setHex(RICE_COLORS.straw), 0.18);
      for (let i = 0; i < m.count; i++) {
        const p = this.patchAt[i];
        if (!p) continue;
        const s = (((season - p.lag) % 1) + 1) % 1;
        const grow = Math.min(1, (this.clock - p.t) / PATCH_IN);
        // (gone once the plot's own cut has come: its floor is the cut one; and in the next year's season)
        const out = s >= p.cut0 ? 1 - smoothstep(p.cut0, p.cut0 + PATCH_OUT, s) : s < 0.55 ? 0 : 1;
        const k = PATCH * (scale / ROAM_SCALE) * Math.sqrt(grow) * out;
        _m.compose(_x.set(p.x, p.y + PATCH_UP, p.z), _q.identity(), _s.set(k || 1e-4, 1, k || 1e-4));
        m.setMatrixAt(i, _m);
      }
      m.instanceMatrix.needsUpdate = true;
    }
  }

  /** The marks' clock (s): splashes are timed on it. */
  get now(): number {
    return this.clock;
  }
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
