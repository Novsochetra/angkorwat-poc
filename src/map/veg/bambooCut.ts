import { Group, type InstancedMesh, type WebGLRenderer } from 'three';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { graphicsNow, markStill } from '../graphics';

/**
 * **Cut bamboo clumps** (ticket AWP-10): the jungle's bamboo clumps where he
 * roams can be cut (the gathering source roam/_gatherBamboo.ts), and a cut
 * one looks cut. The jungle is baked into big tile meshes (vegetation.ts, in a
 * build worker: map/work/), so a cut is never a rebuild: the clump's own
 * blocks are known by their place in their tile's meshes (vegetation.ts
 * `plant` tells, veg/lattice.ts `emit`'s owners), and a cut moves them:
 *
 * - A clump is cut by **sides** (`BAMBOO_SIDES` thirds round its middle, by
 *   the angle from it; a pole cut is a side's canes): the canes of a cut side
 *   end in stubs `CUT` m over the ground (their lowest block shortened, those
 *   over it and the side's leaves put away under the ground, a hair's size:
 *   the plain twin shares the buffer, terrain/lod.ts `lowTwin`), and the
 *   **cut layer** (one small voxel mesh of the bark family: no new shader)
 *   draws each stub's pale cut end and the side's young shoots (ទំពាំង: a
 *   sheathed shoot that grows into a green cane with a tuft of leaves) as the
 *   side grows back (`grow` 0‥1 over the game days the source gives).
 * - When a side has grown back its canes come back whole.
 *
 * The source sets each clump's look (`set`); this module keeps the looks by
 * clump id, so a jungle built again (`attach`) shows them again. Nothing is
 * drawn and nothing runs while no clump is cut; the young shoots are drawn
 * again only when one has grown visibly (`update`, a few times a second at
 * most). The still shadows (low, medium) are asked again after a change.
 */

/** A clump he can cut, as planted (vegetation.ts `plant`, maybe in a build worker). */
export interface BambooClumpData {
  /** Its middle (the lattice cell its canes spring from) and its ground (m). */
  x: number;
  y: number;
  z: number;
  /** How far its tips reach out, how tall (m). */
  r: number;
  h: number;
  /** Its blocks: pairs of (tile mesh code: `grid | far << 1 | tile << 2`, grid 0 the leaf tiles, 1 the rest; its place among its family's blocks in that builder). */
  at: Int32Array;
}

/** A clump he can cut. */
export interface BambooClump {
  /** `<source>:<x>,<z>` (whole metres: saved): `bamboo:…` the jungle's, `bambooForest:…` the bamboo forest's. */
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly r: number;
  readonly h: number;
}

/** How a clump looks: the sides cut (each once, oldest first) and how far each has grown back (0‥1). */
export interface BambooLook {
  readonly sides: readonly number[];
  readonly grow: readonly number[];
}

/** Thirds round a clump: a pole cut is one side's canes. */
export const BAMBOO_SIDES = 3;
/** The stubs stand this high (m over the clump's ground: the knife lands at knee height). */
const CUT = 0.55;
/** Put away: this far under the ground, this small (never 0: the leaves' sway divides by the block's size). */
const AWAY = { y: 80, s: 1e-4 };
/** The young shoots grow this tall before the side's canes come back (m). */
const SHOOT_TALL = 3.4;
/** The young shoots are drawn again when they have grown this much of the way (and at most this often, s). */
const GROW_STEP = 1 / 24;
const GROW_EVERY = 0.5;

/** The side of a clump a point is on (by the angle from its middle). */
export function bambooSideAt(c: { x: number; z: number }, x: number, z: number): number {
  const a = Math.atan2(z - c.z, x - c.x);
  const u = ((a + Math.PI * 2) % (Math.PI * 2)) / ((Math.PI * 2) / BAMBOO_SIDES);
  return Math.min(BAMBOO_SIDES - 1, Math.floor(u));
}

/** The middle of a side (radians, as `atan2(dz, dx)`). */
export const bambooSideAngle = (side: number): number => ((side + 0.5) * Math.PI * 2) / BAMBOO_SIDES;

/** One clump's blocks in the tile meshes, read when it is first cut. */
interface Blocks {
  mesh: InstancedMesh[];
  index: Int32Array;
  /** Each block's matrix as built (16 a block), its side, whether a leaf. */
  orig: Float32Array;
  side: Uint8Array;
  leaf: Uint8Array;
  /** How wide its canes are (m: the near clumps' 0.32, the far cells' up to 0.9): the young shoots grow as wide for it. */
  cane: number;
}

interface Clump extends BambooClump {
  readonly at: Int32Array;
  blocks: Blocks | null;
  look: BambooLook | null;
  /** The growth last drawn, per side cut (quantized). */
  drawn: number[];
}

/** The same sides cut (the blocks stay as they are; only the shoots may differ). */
const sameSides = (a: BambooLook | null, b: BambooLook | null): boolean =>
  a === b || (!!a && !!b && a.sides.length === b.sides.length && a.sides.every((s, i) => s === b.sides[i]));

/** The cut clumps of one stand: the jungle's (`BAMBOO_CUT`), the bamboo forest's (veg/bambooForest.ts `BAMBOO_FOREST_CUT`). */
export class BambooCuts {
  private list: Clump[] = [];
  private readonly byId = new Map<string, Clump>();
  /** Looks set before the jungle was built (or for a jungle built again), by id. */
  private readonly looks = new Map<string, BambooLook>();
  private meshOf: ((code: number) => { mesh: InstancedMesh; from: number } | null) | null = null;
  private renderer: WebGLRenderer | null = null;
  /** The cut layer: the stubs' cut ends and the young shoots (one voxel mesh, made again on a change). */
  readonly object = new Group();
  private layer: Group | null = null;
  private dirty = false;
  private shadow = false;
  private since = 0;
  /** How each cut clump's sides grow now (the source's: 0‥1 per side cut), for the shoots. */
  private growth: ((id: string) => readonly number[] | null) | null = null;
  /** Checks: blocks moved by the last looks. */
  stats = { clumps: 0, cut: 0, moved: 0, layerBlocks: 0 };

  constructor(
    /** The gathering source the clumps' ids start with (saved). */
    readonly source = 'bamboo',
    name = 'vegetation:bamboo-cut',
  ) {
    this.object.name = name;
  }

  /** The clumps he can cut (empty until the jungle is built). */
  clumps(): readonly BambooClump[] {
    return this.list;
  }

  get(id: string): BambooClump | null {
    return this.byId.get(id) ?? null;
  }

  /**
   * The jungle built (vegetation.ts): its clumps he can cut, the tile mesh of a code (`BambooClumpData.at`) and where
   * that builder's blocks start in it (the low level puts the far ones after the near ones), the renderer (the still
   * shadows). The looks set so far show at once.
   */
  attach(data: readonly BambooClumpData[], meshOf: (code: number) => { mesh: InstancedMesh; from: number } | null, renderer: WebGLRenderer): void {
    this.meshOf = meshOf;
    this.renderer = renderer;
    this.list = [];
    this.byId.clear();
    for (const d of data) {
      const id = `${this.source}:${Math.round(d.x)},${Math.round(d.z)}`;
      if (this.byId.has(id)) continue;
      const c: Clump = { id, x: d.x, y: d.y, z: d.z, r: d.r, h: d.h, at: d.at, blocks: null, look: null, drawn: [] };
      this.list.push(c);
      this.byId.set(id, c);
    }
    this.stats.clumps = this.list.length;
    for (const [id, look] of this.looks) {
      const c = this.byId.get(id);
      if (c) this.apply(c, look);
    }
    this.dirty = true;
    this.redraw();
  }

  /** How the sides grow (the source's), read for the young shoots as the game days pass. */
  growthFrom(fn: (id: string) => readonly number[] | null): void {
    this.growth = fn;
  }

  /** Clump `id` looks so (null or no sides: whole). */
  set(id: string, look: BambooLook | null): void {
    const l = look && look.sides.length ? look : null;
    if (l) this.looks.set(id, l);
    else this.looks.delete(id);
    const c = this.byId.get(id);
    if (!c) return;
    if (sameSides(c.look, l)) {
      // (only the shoots: drawn again if they changed)
      if (!l || l.grow.every((g, i) => Math.abs(quant(g) - (c.drawn[i] ?? -1)) < 1e-6)) return;
      c.look = l;
    } else this.apply(c, l);
    this.dirty = true;
    this.redraw();
  }

  /** Each frame (vegetation.ts `update`): the shoots grown, the still shadows asked again. */
  update(dt: number): void {
    this.since += dt;
    // (a shot's frames stand still: looked at every frame)
    if (this.growth && this.looks.size && (this.since >= GROW_EVERY || dt <= 0)) {
      this.since = 0;
      for (const id of this.looks.keys()) {
        const c = this.byId.get(id);
        const g = this.growth(id);
        if (!c?.look || !g) continue;
        if (g.some((v, i) => Math.abs(quant(v) - (c.drawn[i] ?? -1)) > 1e-6)) {
          c.look = { sides: c.look.sides, grow: g.slice(0, c.look.sides.length) };
          this.dirty = true;
        }
      }
      if (this.dirty) this.redraw();
    }
    if (this.shadow && this.renderer && graphicsNow.stillShadows) this.renderer.shadowMap.needsUpdate = true;
    this.shadow = false;
  }

  /** Its blocks (read once, the first time it is cut). */
  private blocksOf(c: Clump): Blocks | null {
    if (c.blocks || !this.meshOf) return c.blocks;
    const n = c.at.length / 2;
    const b: Blocks = { mesh: [], index: new Int32Array(n), orig: new Float32Array(n * 16), side: new Uint8Array(n), leaf: new Uint8Array(n), cane: 0 };
    let k = 0;
    let far = 0;
    for (let i = 0; i < n; i++) {
      const code = c.at[i * 2];
      const m = this.meshOf(code);
      if (!m) continue;
      const mesh = m.mesh;
      const idx = m.from + c.at[i * 2 + 1];
      const a = mesh.instanceMatrix.array as Float32Array;
      // (by the buffer, not `count`: the overview draws only its seen blocks, terrain/seen.ts, a phone's far tiles fewer)
      if (idx < 0 || idx >= a.length / 16) continue;
      const o = idx * 16;
      const x = a[o + 12];
      const z = a[o + 14];
      // (a block that is not near the clump: the meshes are not as the planting said; leave it)
      if (Math.hypot(x - c.x, z - c.z) > c.r + 4) {
        far++;
        continue;
      }
      b.mesh[k] = mesh;
      b.index[k] = idx;
      for (let j = 0; j < 16; j++) b.orig[k * 16 + j] = a[o + j];
      b.side[k] = bambooSideAt(c, x, z);
      b.leaf[k] = (code & 1) === 0 ? 1 : 0;
      if (!b.leaf[k]) b.cane = Math.max(b.cane, Math.min(a[o], a[o + 10]));
      k++;
    }
    if (far) console.error(`[map] bamboo cut: ${far} of ${n} blocks of ${c.id} are not where it stands (the tile meshes changed?)`);
    b.index = b.index.slice(0, k);
    b.orig = b.orig.slice(0, k * 16);
    b.side = b.side.slice(0, k);
    b.leaf = b.leaf.slice(0, k);
    c.blocks = b;
    return b;
  }

  /** Its blocks moved (or put back) for `look`. */
  private apply(c: Clump, look: BambooLook | null): void {
    c.look = look;
    c.drawn = [];
    this.dirty = true;
    const b = this.blocksOf(c);
    if (!b) return;
    const cut = new Set(look?.sides ?? []);
    const top = c.y + CUT;
    const touched = new Set<InstancedMesh>();
    let moved = 0;
    for (let i = 0; i < b.index.length; i++) {
      const mesh = b.mesh[i];
      const a = mesh.instanceMatrix.array as Float32Array;
      const o = b.index[i] * 16;
      const src = i * 16;
      for (let j = 0; j < 16; j++) a[o + j] = b.orig[src + j];
      touched.add(mesh);
      if (!cut.has(b.side[i])) continue;
      const sy = b.orig[src + 5];
      const y = b.orig[src + 13];
      const bottom = y - sy / 2;
      if (!b.leaf[i] && bottom < top - 0.02 && y + sy / 2 > top) {
        // (the cane's lowest block, cut down to the stub)
        a[o + 5] = top - bottom;
        a[o + 13] = (top + bottom) / 2;
      } else if (b.leaf[i] || bottom >= top - 0.02) {
        a[o] = a[o + 5] = a[o + 10] = AWAY.s;
        a[o + 13] = c.y - AWAY.y;
      }
      moved++;
    }
    for (const m of touched) m.instanceMatrix.needsUpdate = true;
    this.stats.moved = moved;
    this.shadow = true;
  }

  /** The cut layer made again: each cut clump's stubs' ends and young shoots. */
  private redraw(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const v = new VoxelBuilder();
    let cut = 0;
    for (const c of this.list) {
      const look = c.look;
      const b = c.blocks;
      if (!look || !b) continue;
      cut++;
      c.drawn = look.grow.map(quant);
      const top = c.y + CUT;
      look.sides.forEach((side, k) => {
        // The stubs' cut ends: a pale ring of fibre round the dark hollow.
        for (let i = 0; i < b.index.length; i++) {
          if (b.leaf[i] || b.side[i] !== side) continue;
          const o = i * 16;
          const sy = b.orig[o + 5];
          const bottom = b.orig[o + 13] - sy / 2;
          if (!(bottom < top - 0.02 && b.orig[o + 13] + sy / 2 > top)) continue;
          const x = b.orig[o + 12];
          const z = b.orig[o + 14];
          const w = Math.max(b.orig[o], b.orig[o + 10]);
          v.box(x, top + 0.02, z, w + 0.05, 0.05, w + 0.05, 0xe9dfb4, 'mapBark', { shade: 1.05 });
          v.box(x, top + 0.048, z, w * 0.5, 0.012, w * 0.5, 0x56592c, 'mapBark');
        }
        shoots(v, c, side, c.drawn[k] ?? 0, Math.max(1, Math.min(2.5, b.cane / 0.32)));
      });
    }
    this.stats.cut = cut;
    this.stats.layerBlocks = v.boxes.length;
    if (this.layer) {
      this.object.remove(this.layer);
      this.layer.traverse((o) => (o as InstancedMesh).isInstancedMesh && (o as InstancedMesh).geometry.dispose());
      this.layer = null;
    }
    if (v.boxes.length) {
      // (as the jungle's own: plain blocks on the low level; it casts the still shadows of low and medium)
      this.layer = buildVoxelMesh(v, { quality: graphicsNow.plainBlocks ? 'low' : 'medium', name: this.object.name });
      markStill(this.layer);
      // (built for the level it is made on, made again often: graphics.ts `setGraphics` leaves it be, no far rim variant)
      for (const o of this.layer.children) delete o.userData.voxelShape;
      this.object.add(this.layer);
    }
    this.object.visible = v.boxes.length > 0;
    this.shadow = true;
  }
}

const quant = (g: number): number => Math.round(Math.max(0, Math.min(1, g)) / GROW_STEP) * GROW_STEP;

/**
 * A cut side's young shoots (ទំពាំង), grown `g` (0‥1) of the way back: first a sheathed shoot, pale brown and pointed,
 * pushing up from the ground; then a slim green cane, its sheaths at the foot and its first leaves fanning at the top.
 */
function shoots(v: VoxelBuilder, c: Clump, side: number, g: number, wide: number): void {
  const a0 = bambooSideAngle(side);
  for (let n = 0; n < 2; n++) {
    const h0 = hash3(Math.round(c.x * 10), Math.round(c.z * 10), side * 7 + n, 4101);
    const a = a0 + (n ? 0.35 : -0.3) + (h0 - 0.5) * 0.3;
    const d = (0.45 + 0.35 * hash3(n, side, Math.round(c.x), 4102)) * wide;
    const x = c.x + Math.cos(a) * d;
    const z = c.z + Math.sin(a) * d;
    // (the second one comes a little later and stays a little shorter)
    const k = Math.max(0, Math.min(1, n ? (g - 0.12) / 0.88 : g));
    if (k <= 0) continue;
    const tall = (0.25 + (SHOOT_TALL - 0.25) * k) * (n ? 0.82 : 1);
    const y = c.y;
    if (tall < 1.3) {
      // The shoot: stacked sheaths narrowing to a point.
      const rows = Math.max(2, Math.round(tall / 0.16));
      for (let r = 0; r < rows; r++) {
        const u = r / rows;
        const w = 0.3 * wide * (1 - u * 0.8);
        const sh = 0.9 + 0.12 * hash3(r, n, side, 4103);
        v.box(x, y + (r + 0.5) * (tall / rows), z, w, tall / rows + 0.01, w, r === rows - 1 ? 0x5e4a2a : r % 2 ? 0x8f6f3e : 0xa4844c, 'mapBark', { shade: sh, ry: r * 0.4 });
      }
      continue;
    }
    // The young cane: sheaths at its foot, green and powdered at the nodes, its first leaves at the top.
    const w = 0.2 * wide;
    v.box(x, y + 0.3, z, w + 0.08, 0.6, w + 0.08, 0x9a7a44, 'mapBark', { shade: 0.95 });
    const seg = 0.55;
    for (let s = 0.6; s < tall; s += seg) {
      const l = Math.min(seg, tall - s);
      v.box(x, y + s + l / 2, z, w, l, w, (s / seg) % 2 < 1 ? 0x7da848 : 0x73a042, 'mapBark', { shade: 1.02 });
      if (s + seg < tall) v.box(x, y + s + l, z, w + 0.05, 0.06, w + 0.05, 0xc8d49c, 'mapBark');
    }
    const leaves = 3 + Math.round(k * 3);
    for (let i = 0; i < leaves; i++) {
      const b = a + (i / leaves) * Math.PI * 2 + h0;
      const l = 0.45 + 0.25 * hash3(i, n, side, 4104);
      const ly = y + tall - 0.1 - (i % 2) * 0.25;
      v.box(x + Math.cos(b) * l * 0.5, ly - 0.05, z + Math.sin(b) * l * 0.5, l, 0.05, 0.13, i % 2 ? 0x6f9d3c : 0x86b04a, 'mapBark', { ry: -b, rz: -0.35 });
    }
  }
}

/** The cut clumps of the map's jungle (vegetation.ts attaches it; roam/_gatherBamboo.ts sets the looks). */
export const BAMBOO_CUT = new BambooCuts();
/** The bamboo forest's (AWP-15: veg/bambooForest.ts attaches it; the source `bambooForest`, roam/_gatherBamboo.ts). */
export const BAMBOO_FOREST_CUT = new BambooCuts('bambooForest', 'vegetation:bamboo-forest-cut');
