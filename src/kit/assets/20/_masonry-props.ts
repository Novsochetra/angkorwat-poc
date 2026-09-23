import { Euler, Vector3 } from 'three';
import { valueNoise3 } from '../../../voxel/random';
import type { Surf, VoxelBuilder, VoxelGrid } from '../../../voxel/VoxelBuilder';
import type { BlockSet } from '../../BlockSet';
import { fromSheet, GRASS, MOSS } from '../../palette';
import type { PieceBuilder } from '../../PieceBuilder';
import { here, rng, TEXEL, type Rng } from '../../shapes';
import { stoneSurf } from '../../surface';

/**
 * Shared look of the §20 masonry props (fallen blocks, stone steps, drainage
 * channels; the shrine, altar and pond take their tones from here too). The
 * sheet draws them all in one weathered sandstone, a taupe that leans olive:
 * warm tan tops, mid brown fronts, olive-grey shaded sides, the faces pocked
 * with small dark pores, yellow-olive moss lying on the tops and down the
 * joints, and small yellow-green tufts at their feet.
 */

/**
 * Tones of the props' blocks, via fromSheet from the sheet's fallen blocks: the
 * average of a lit top (#c39b70) and a lit front (#8f724f), give or take a
 * few percent — a warm tan that leans yellow-olive, not the kit's pink-brown.
 */
export const PROP_STONE: readonly number[] = [0xac8961, 0xa5835e, 0xb38f66, 0xa88a66, 0xb08c63].map(fromSheet);

/** Blocks lying on the ground or in the lowest course: darker and damper, like the sheet's bottom rows. */
export const PROP_STONE_LOW: readonly number[] = [0x9e7e5a, 0x977957, 0xa3835e, 0x9a7f5f].map(fromSheet);

/** Now and then an older stone: greyer, the taupe the sheet mixes in among the tan ones. */
export const PROP_STONE_OLD: readonly number[] = [0x9e8465, 0x967f60, 0xa3886a].map(fromSheet);

/** Faces opened by breakage / chipping: paler and more orange than the weathered skin. */
export const PROP_BROKEN: readonly number[] = [0xbd9870, 0xb59168, 0xc4a078].map(fromSheet);

/** Deep shadow of carved recesses (relief grounds, drain beds): the sheet's olive-black, not a red-brown. */
export const PROP_RECESS: readonly number[] = [0x3f3a2f, 0x38342a, 0x453f33];

/**
 * Pattern amounts. The pattern's own moss is a cool green, so it is kept to a
 * trace on the tops (and off the sides): the sheet's yellow-olive moss is laid
 * on as cells by {@link MossLayer.cover}. Stain gives the mottled, speckled,
 * higher-contrast skin; lichen a few pale blotches, cracks the odd hairline.
 */
export const PROP_SURF = {
  /** Upper stones. */
  top: stoneSurf({ moss: 0.22, stain: 0.3, lichen: 0.2, crack: 0.06 }),
  /** Stones on the ground: grimier, moss creeping up from the soil. */
  low: stoneSurf({ moss: 0.2, stain: 0.42, lichen: 0.12, crack: 0.06 }),
  /**
   * Overgrown stones (broken variants). Chipped stones are drawn as texel-high
   * runs, and the pattern's moss creeps down each run separately, so more moss
   * than this stripes their sides: heavier growth comes from {@link MossLayer}.
   */
  mossy: stoneSurf({ moss: 0.34, stain: 0.4, lichen: 0.18, crack: 0.08 }),
  /** Recently broken or sheltered faces. */
  clean: stoneSurf({ moss: 0.06, stain: 0.24, lichen: 0.06 }),
} satisfies Record<string, Surf>;

/** Damp stone at a water line (drain walls, pond rims): dark and olive. */
export const PROP_WET: readonly number[] = [0x4b4a35, 0x444532, 0x514d38];

/** Moss on the §20 props is yellow-olive, warmer than the kit's moss pattern: sampled off the sheet (lit tufts, mid moss, the dark under it). */
export const PROP_MOSS = {
  lit: [0xa39246, 0x8e7d34, 0x7f8a3a].map(fromSheet),
  mid: [0x746c2b, 0x6b6a2a].map(fromSheet),
  deep: [0x5a5a26, 0x3e4424].map(fromSheet),
};

/** The pores: olive-grey, rendering like the marks on the sheet's faces (#4a4036 in front, #63574a on the tops). */
const PORE = [0x5e5244, 0x54493c, 0x665848, 0x4e4438];

/**
 * The small dark pits that pock the sheet's blocks — weathered-out pores and
 * the lifting holes of Angkor's masonry: marks one or two `size` long (a
 * texel; half one on small stones, so they stay in scale) on the box min‥max
 * (metres), `density` per m² of face, a mark's width in from the edges, on
 * the faces `open` says are exposed at a point just outside them. Drawn as
 * plates a hair proud of the face (a carved hole would split the stone into
 * cells), with no rim, so they read as holes, not studs.
 */
export function poreMarks(b: VoxelBuilder, min: readonly number[], max: readonly number[], r: Rng, density: number, open: (x: number, y: number, z: number, axis: number) => boolean, size = TEXEL): void {
  const lift = 0.004;
  const src = here();
  for (const [axis, dir] of [[0, 1], [0, -1], [1, 1], [2, 1], [2, -1]] as const) {
    // Along the face: u (horizontal where there is one) and v.
    const [u, v] = axis === 0 ? [2, 1] : axis === 1 ? [0, 2] : [0, 1];
    const nu = Math.round((max[u] - min[u]) / size);
    const nv = Math.round((max[v] - min[v]) / size);
    if (nu < 3 || nv < 3) continue;
    const face = dir > 0 ? max[axis] : min[axis];
    for (let n = Math.floor((max[u] - min[u]) * (max[v] - min[v]) * density + r()); n > 0; n--) {
      const len = nu > 4 && r.chance(0.3) ? 2 : 1;
      const iu = r.int(1, nu - 1 - len);
      const iv = r.int(1, nv - 2);
      const p = [0, 0, 0];
      p[axis] = face + dir * TEXEL * 0.25;
      p[v] = min[v] + (iv + 0.5) * size;
      let ok = true;
      for (let t = 0; t < len && ok; t++) {
        p[u] = min[u] + (iu + t + 0.5) * size;
        ok = open(p[0], p[1], p[2], axis);
      }
      if (!ok) continue;
      const c = [0, 0, 0];
      const s = [size, size, size];
      c[axis] = face + (dir * lift) / 2;
      c[u] = min[u] + (iu + len / 2) * size;
      c[v] = p[v];
      s[axis] = lift;
      s[u] = len * size;
      b.box(c[0], c[1], c[2], s[0], s[1], s[2], r.pick(PORE), 'sandstone', { open: 1 << (axis * 2 + (dir > 0 ? 0 : 1)), surf: stoneSurf(), src });
    }
  }
}

/** Pores on every stone of a block set (not the thin plates), where its face is still stone and open to the air; `where` (stone centres) limits them. */
export function pores(p: PieceBuilder, set: BlockSet, seed: number, density = 12, where: (x: number, y: number, z: number) => boolean = () => true, size = TEXEL): void {
  const r = rng(seed * 19 + 5);
  const e = TEXEL * 0.5;
  for (const id of set.find(where)) {
    const { min, max } = set.boxOf(id);
    if (Math.min(max[0] - min[0], max[1] - min[1], max[2] - min[2]) < TEXEL * 1.5) continue;
    poreMarks(
      p.voxels,
      min,
      max,
      r,
      density,
      (x, y, z, axis) => {
        const back = [x, y, z];
        // (the point sits a quarter texel out: step back through the face into the stone)
        back[axis] += back[axis] > (min[axis] + max[axis]) / 2 ? -e : e;
        return !set.solidAt(x, y, z) && set.solidAt(back[0], back[1], back[2]);
      },
      size,
    );
  }
}

/** The joint lines: the dark of the sheet's outlines, a shadowed olive-brown rather than black. */
const JOINT = [0x4a4034, 0x443a2f, 0x50453a];

/**
 * Dark lines along the joints of a block set, wherever two stones meet flush
 * on an open face: the sheet outlines every stone in dark, where the soft
 * bevels alone leave a pale seam and the stones run together into one mass.
 * Plates `w` wide centred on the joint, a hair proud of the faces, stopping
 * short of the rounded corners (each stone draws the joints along its +u and
 * +v edges, so every joint is drawn once).
 */
export function joints(p: PieceBuilder, set: BlockSet, seed: number, w = TEXEL / 5): void {
  const r = rng(seed * 29 + 3);
  const e = TEXEL * 0.25;
  const lift = 0.003;
  const bevel = 0.02;
  const src = here();
  for (const id of set.find(() => true)) {
    const { min, max } = set.boxOf(id);
    for (const [axis, dir] of [[0, 1], [0, -1], [1, 1], [2, 1], [2, -1]] as const) {
      const [u, v] = axis === 0 ? [2, 1] : axis === 1 ? [0, 2] : [0, 1];
      const face = dir > 0 ? max[axis] : min[axis];
      for (const [edge, run] of [[u, v], [v, u]]) {
        const n = Math.round((max[run] - min[run]) / TEXEL);
        // Both stones' skins are stone and open to the air at this texel of the joint.
        const flush = (t: number) => {
          const q = [0, 0, 0];
          q[axis] = face - dir * e;
          q[run] = min[run] + (t + 0.5) * TEXEL;
          const at = (d: number, out: number) => {
            const c = [...q];
            c[edge] = max[edge] + d;
            c[axis] += dir * out;
            return set.solidAt(c[0], c[1], c[2]);
          };
          return at(e, 0) && at(-e, 0) && !at(e, 2 * e) && !at(-e, 2 * e);
        };
        let start = -1;
        for (let t = 0; t <= n; t++) {
          const ok = t < n && flush(t);
          if (ok && start < 0) start = t;
          if (ok || start < 0) continue;
          const len = (t - start) * TEXEL - 2 * bevel;
          if (len > TEXEL / 2) {
            const c = [0, 0, 0];
            const s = [0, 0, 0];
            c[axis] = face + (dir * lift) / 2;
            c[edge] = max[edge];
            c[run] = min[run] + ((start + t) / 2) * TEXEL;
            s[axis] = lift;
            s[edge] = w;
            s[run] = len;
            p.voxels.box(c[0], c[1], c[2], s[0], s[1], s[2], r.pick(JOINT), 'sandstone', { open: 1 << (axis * 2 + (dir > 0 ? 0 : 1)), surf: stoneSurf(), src });
          }
          start = -1;
        }
      }
    }
  }
}

/** One collider per stone still standing in a block set. */
export function setColliders(p: PieceBuilder, set: BlockSet): void {
  for (const id of set.find(() => true)) {
    const { min, max } = set.boxOf(id);
    p.collider(min[0], min[1], min[2], max[0], max[1], max[2]);
  }
}

/** A rotation (radians, XYZ like the renderer) and where the local origin lands. */
export interface Tilt {
  at: [number, number, number];
  rot: [number, number, number];
}

const _e = new Euler();
const _v = new Vector3();

/**
 * Copy voxels built around a local origin into the piece, turned and moved by
 * `tilt` — blocks that came to rest at an angle. Every box keeps its own frame
 * (the renderer turns it about its centre), so their faces stay flush.
 */
export function placeTilted(p: PieceBuilder, local: VoxelBuilder, tilt: Tilt): void {
  _e.set(tilt.rot[0], tilt.rot[1], tilt.rot[2]);
  for (const b of local.boxes) {
    _v.set(b.x, b.y, b.z).applyEuler(_e);
    p.voxels.boxes.push({ ...b, x: tilt.at[0] + _v.x, y: tilt.at[1] + _v.y, z: tilt.at[2] + _v.z, rx: tilt.rot[0], ry: tilt.rot[1], rz: tilt.rot[2] });
  }
}

/** Where a local point of a tilted piece lands. */
function tiltPoint(tilt: Tilt, x: number, y: number, z: number): [number, number, number] {
  _e.set(tilt.rot[0], tilt.rot[1], tilt.rot[2]);
  _v.set(x, y, z).applyEuler(_e);
  return [tilt.at[0] + _v.x, tilt.at[1] + _v.y, tilt.at[2] + _v.z];
}

/** Lower (or raise) a tilted box (local min/max corners) until its lowest corner rests on the ground (y = 0). */
export function restOnGround(tilt: Tilt, min: [number, number, number], max: [number, number, number]): Tilt {
  let low = Infinity;
  for (let c = 0; c < 8; c++) low = Math.min(low, tiltPoint(tilt, c & 1 ? max[0] : min[0], c & 2 ? max[1] : min[1], c & 4 ? max[2] : min[2])[1]);
  return { at: [tilt.at[0], tilt.at[1] - low, tilt.at[2]], rot: tilt.rot };
}

/**
 * Colliders for a tilted box (local min/max corners): its longest side cut into
 * `n` slices, each slice's bounding box, so the top follows the slope in steps
 * the explorer can climb instead of one tall box.
 */
export function tiltedColliders(p: PieceBuilder, tilt: Tilt, min: [number, number, number], max: [number, number, number], n = 3): void {
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const axis = size[0] >= size[1] && size[0] >= size[2] ? 0 : size[1] >= size[2] ? 1 : 2;
  for (let s = 0; s < n; s++) {
    const lo = [...min];
    const hi = [...max];
    lo[axis] = min[axis] + (size[axis] * s) / n;
    hi[axis] = min[axis] + (size[axis] * (s + 1)) / n;
    const a = [Infinity, Infinity, Infinity];
    const b = [-Infinity, -Infinity, -Infinity];
    for (let c = 0; c < 8; c++) {
      const q = tiltPoint(tilt, c & 1 ? hi[0] : lo[0], c & 2 ? hi[1] : lo[1], c & 4 ? hi[2] : lo[2]);
      for (let i = 0; i < 3; i++) {
        a[i] = Math.min(a[i], q[i]);
        b[i] = Math.max(b[i], q[i]);
      }
    }
    p.collider(a[0], Math.max(0, a[1]), a[2], b[0], b[1], b[2]);
  }
}

/** Colours of the tufts: dark olive cushions, blades and pale tips. */
const TUFT = { base: [...PROP_MOSS.deep, MOSS[1]], blade: [...PROP_MOSS.mid, PROP_MOSS.lit[2], GRASS.blade[0]], tip: [PROP_MOSS.lit[0], fromSheet(0xa8a24a), GRASS.tip[0]] };

/** A tuft spot (metres): on the ground (y = 0) unless `y` says otherwise; `size` 1 ≈ 0.25 m across. */
export interface TuftSpot {
  x: number;
  z: number;
  y?: number;
  size?: number;
}

/**
 * Grass and moss tufts at the foot of the stones and in their corners: a low
 * mossy cushion with a few blades standing out of it, in half-texel cells (3 cm)
 * so they read as grass rather than blocks. `solid` keeps the cells out of the stone.
 */
export function tufts(p: PieceBuilder, spots: readonly TuftSpot[], seed: number, solid: (x: number, y: number, z: number) => boolean = () => false): void {
  const h = TEXEL / 2;
  const g = p.voxels.grid({ cell: h, origin: [0, 0, 0], mat: 'leaves', jitter: 0.08, ao: 0.3, seed });
  const r = rng(seed * 7 + 3);
  for (const { x, z, y = 0, size = 1 } of spots) {
    const ci = Math.floor(x / h);
    const ck = Math.floor(z / h);
    const j0 = Math.round(y / h);
    const rad = (2.2 + 2.6 * size) * r.range(0.75, 1.15);
    const R = Math.ceil(rad);
    for (let di = -R; di <= R; di++)
      for (let dk = -R; dk <= R; dk++) {
        const d = Math.hypot(di, dk) / rad;
        if (d > 1 || r.chance(d * 0.4)) continue;
        const i = ci + di;
        const k = ck + dk;
        const cx = (i + 0.5) * h;
        const cz = (k + 0.5) * h;
        const at = (j: number) => (j0 + j + 0.5) * h;
        // Needs something to sit on (the ground, or stone below) and room above.
        if (solid(cx, at(0), cz) || (j0 > 0 && !solid(cx, at(-1), cz))) continue;
        // Cushion 1–3 cells, highest in the middle; here and there a blade 2–6 cells tall with a pale tip.
        const cushion = 1 + (d < 0.6 && r.chance(0.6) ? 1 : 0) + (d < 0.3 && r.chance(0.5) ? 1 : 0);
        let top = 0;
        for (; top < cushion && !solid(cx, at(top), cz); top++) g.set(i, j0 + top, k, r.pick(TUFT.base));
        if (top === cushion && r.chance(0.26 * (1 - d * 0.7))) {
          const tall = cushion + r.int(2, Math.max(2, Math.round(2 + 3 * size)));
          for (let j = cushion; j < tall && !solid(cx, at(j), cz); j++) g.set(i, j0 + j, k, j === tall - 1 ? r.pick(TUFT.tip) : r.pick(TUFT.blade));
        }
        g.ghost(i, j0 - 1, k);
      }
  }
  g.commit();
}

/**
 * Moss colours: dark against the stone, lighter olive where it catches the
 * light — mostly the mid olives, like the sheet's moss (#444622–#535124 on
 * its props), its bright yellow-green tufts only here and there.
 */
const MOSS_DEEP = [PROP_MOSS.deep[1], PROP_MOSS.deep[0], PROP_MOSS.deep[0], PROP_MOSS.mid[1]];
const MOSS_LIT = [PROP_MOSS.mid[1], PROP_MOSS.mid[0], PROP_MOSS.mid[1], PROP_MOSS.lit[2]];

type Axis = 'x' | 'y' | 'z';

/** A moss cell's tone: it drifts in soft patches (a smooth noise, not a pick per cell), so the moss reads as a felt, not a checkerboard. */
function mossTone(deep: boolean, x: number, y: number, z: number, seed: number, r: Rng): number {
  const list = deep ? MOSS_DEEP : MOSS_LIT;
  const t = valueNoise3(x * 7, y * 7, z * 7, seed + 3) * 0.85 + r() * 0.15;
  return list[Math.min(list.length - 1, Math.floor(t * list.length))];
}

/**
 * Moss lying on the top of a lone box (local min‥max, metres) built into `b`,
 * like {@link MossLayer.cover} — for blocks that {@link placeTilted} will turn,
 * so the moss turns with them.
 */
export function mossOnTop(b: VoxelBuilder, min: readonly number[], max: readonly number[], amount: number, seed: number): void {
  const r = rng(seed * 37 + 11);
  const g = b.grid({ cell: [TEXEL, TEXEL / 2, TEXEL], origin: [min[0], max[1], min[2]], mat: 'leaves', jitter: 0.1, ao: 0.25, seed });
  const t = 0.24 + 0.55 * amount;
  for (let i = 0; i < Math.round((max[0] - min[0]) / TEXEL); i++)
    for (let k = 0; k < Math.round((max[2] - min[2]) / TEXEL); k++) {
      const [x, z] = [min[0] + (i + 0.5) * TEXEL, min[2] + (k + 0.5) * TEXEL];
      const edge = Math.min(x - min[0], max[0] - x, z - min[2], max[2] - z) < TEXEL;
      const n = valueNoise3(x * 2.5 + seed, 0.5, z * 2.5, 17) * 0.8 + r() * 0.2 - (edge ? 0.08 : 0);
      if (n < t) g.set(i, 0, k, mossTone((edge && r.chance(0.6)) || n < t - 0.2, x, max[1], z, seed, r));
    }
  g.commit();
}

/**
 * Moss that gathers in the corners of the masonry — where a tread meets the
 * riser above it, along the foot of a wall, down the joints — the sheet's
 * darkest greens sit exactly there — and lies on the tops. A thin skin (half a
 * cell thick, `cell` across: a texel, or half one on small stones) of `leaves`
 * cells, so it reads as moss on the stone rather than as little cubes.
 */
export class MossLayer {
  private readonly grids = new Map<Axis, VoxelGrid>();
  private readonly r;

  constructor(
    private readonly p: PieceBuilder,
    private readonly seed: number,
    private readonly solid: (x: number, y: number, z: number) => boolean = () => false,
    private readonly cell = TEXEL,
  ) {
    this.r = rng(seed * 11 + 7);
  }

  /** The grid whose cells are thin along `thin` (the normal of the face they cover). */
  private grid(thin: Axis): VoxelGrid {
    let g = this.grids.get(thin);
    if (!g) {
      const c = (a: Axis) => (a === thin ? this.cell / 2 : this.cell);
      g = this.p.voxels.grid({ cell: [c('x'), c('y'), c('z')], origin: [0, 0, 0], mat: 'leaves', jitter: 0.1, ao: 0.25, seed: this.seed });
      this.grids.set(thin, g);
    }
    return g;
  }

  /**
   * A cell of the skin covering a face whose normal runs along `thin`, if it
   * lies on stone (`back` = towards the stone, ±1; the ground counts under a
   * lying cell) and isn't inside any.
   */
  private put(thin: Axis, i: number, j: number, k: number, deep: boolean, back: number): boolean {
    const g = this.grid(thin);
    const [x, y, z] = g.center(i, j, k);
    const d = back * this.cell * 0.5;
    const behind = thin === 'x' ? this.solid(x + d, y, z) : thin === 'y' ? y + d < 0 || this.solid(x, y + d, z) : this.solid(x, y, z + d);
    if (y < 0 || this.solid(x, y, z) || !behind) return false;
    g.set(i, j, k, mossTone(deep, x, y, z, this.seed, this.r));
    return true;
  }

  /**
   * A cushion along the foot of a vertical face (metres): running along `axis`
   * from `a` to `b`, lying on the surface at height `y`, against the face at
   * `face` that looks towards `dir`. `cover` is the share of the run grown over.
   */
  corner(axis: 'x' | 'z', a: number, b: number, y: number, face: number, dir: 1 | -1, cover = 0.4): void {
    const c = this.cell;
    const j = Math.round(y / (c / 2));
    const f = Math.round(face / c) + (dir > 0 ? 0 : -1);
    const phase = this.r() * 100;
    // (the noise runs in texels whatever the cell, so the patches keep their size)
    const s = c / TEXEL;
    for (let t = Math.round(Math.min(a, b) / c); t < Math.round(Math.max(a, b) / c); t++) {
      const n = valueNoise3(t * 0.3 * s + phase, j * 0.1 * s, f * 0.2 * s, 5) * 0.8 + this.r() * 0.2;
      if (n > cover + 0.1) continue;
      const deep = n < cover * 0.6;
      // Only where the face really stands: stone just behind the first cell, above the surface.
      const back = (dir > 0 ? f - 0.5 : f + 1.5) * c;
      const up = y + c / 2;
      const along = (t + 0.5) * c;
      if (!(axis === 'x' ? this.solid(along, up, back) : this.solid(back, up, along))) continue;
      const at = (d: number) => (axis === 'x' ? this.put('y', t, j, f + d * dir, d === 0, -1) : this.put('y', f + d * dir, j, t, d === 0, -1));
      if (at(0) && deep && at(1) && this.r.chance(0.3)) at(2);
    }
  }

  /**
   * Moss lying on the exposed tops of a block set's stones: the sheet's
   * yellow-olive felt, in patches (noise at about 0.4 m) that gather along the
   * joints between the stones, darker there. `amount` is about the share of
   * the tops grown over; `where` (the centre of a stone's top, metres) limits it.
   */
  cover(set: BlockSet, amount: number, where: (x: number, y: number, z: number) => boolean = () => true): void {
    if (amount <= 0) return;
    const c = this.cell;
    // (the noise below is bell-shaped: this threshold covers about `amount` of the area)
    const t = 0.24 + 0.55 * amount;
    const phase = this.r() * 100;
    for (const id of set.find(() => true)) {
      const { min, max } = set.boxOf(id);
      if (!where((min[0] + max[0]) / 2, max[1], (min[2] + max[2]) / 2)) continue;
      const j = Math.round(max[1] / (c / 2));
      for (let i = Math.round(min[0] / c); i < Math.round(max[0] / c); i++)
        for (let k = Math.round(min[2] / c); k < Math.round(max[2] / c); k++) {
          const [x, z] = [(i + 0.5) * c, (k + 0.5) * c];
          const joint = Math.min(x - min[0], max[0] - x, z - min[2], max[2] - z) < c;
          const n = valueNoise3(x * 2.5 + phase, max[1] * 2, z * 2.5, 17) * 0.8 + this.r() * 0.2 - (joint ? 0.08 : 0);
          if (n < t) this.put('y', i, j, k, (joint && this.r.chance(0.6)) || n < t - 0.2, -1);
        }
    }
  }

  /** A streak down a vertical face (metres): from its top edge at `yTop` down 2–`len` texels, at `along` on the face at `face` (running along `axis`) that looks towards `dir`. */
  drip(axis: 'x' | 'z', along: number, yTop: number, face: number, dir: 1 | -1, len: number): void {
    const c = this.cell;
    const t = Math.floor(along / c);
    const f = Math.round(face / (c / 2)) + (dir > 0 ? 0 : -1);
    const top = Math.round(yTop / c) - 1;
    const k = Math.round(TEXEL / c);
    const n = this.r.int(Math.min(2, len) * k, len * k);
    for (let d = 0; d < n; d++) if (!(axis === 'x' ? this.put('z', t, top - d, f, d > 0, -dir) : this.put('x', f, top - d, t, d > 0, -dir))) break;
  }

  commit(): void {
    for (const g of this.grids.values()) g.commit();
  }
}
