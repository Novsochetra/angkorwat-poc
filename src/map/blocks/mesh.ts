import { VOXEL_MATERIALS, type VoxelMaterialKey } from '../../voxel/materials';
import { hash3 } from '../../voxel/random';
import { FORMS, MAT_BY_ID } from './kinds';
import { BLOCK_M, CHUNK_N, chunkKey, type BlockChunk, type BlockStore } from './store';

/**
 * One chunk of the player's blocks as instance data (no three.js; view.ts
 * makes the meshes): per block family, each drawn box's matrix, colour,
 * open sides and seen sides, as the map's own builders give them
 * (VoxelBuilder.ts `VoxelGrid.commit`, VoxelMesh.ts `packVoxelMesh`), so the
 * blocks look like the map's:
 *
 * - **Only what can be seen.** A side against a neighbour's filled side
 *   (kinds.ts `covers`, in this chunk or the next) is covered: a block with
 *   every side covered is not drawn at all; each drawn box keeps its open
 *   sides (`voxOpen`: the rim is drawn only on edges between two open sides,
 *   a seam between flush neighbours, as the map's grids) and its seen sides
 *   (`voxShown` = open + 64: the map's plain boxes leave the others out, block
 *   by block, cull.ts `cutCovered`), and each family's mesh draws only the
 *   sides any of its boxes shows (`sides`, VoxelMesh.ts `openSidesIndex`).
 * - **No sky through edge joints.** Two blocks that meet only along an edge
 *   (a roof stepping in a block a row, a diagonal wall) keep that edge square
 *   (`diagonalJoints`): cut on both, it left a channel the sky showed through.
 *   Where such a row meets the next block along it, the three edges at the
 *   corner still round (the shader squares a corner only when all three of its
 *   sides are joints, which would also square the seams between the blocks of
 *   the row): a pinhole of about the bevel's size is left there. Stairs and
 *   slabs (AWP-24) fill such steps; a roof two blocks deep has none.
 * - **Shade** baked as the map's grids bake it: soft occlusion from the 26
 *   cells round it (convex edges lighter, crevices and the cells under an
 *   overhang darker) and ±5 % seeded jitter by the cell (the same block, the
 *   same shade, every time).
 * - **Colour** per block (sRGB hex → linear, times its shade).
 *
 * Linear in the chunk's cells: the 34³ cells round it (its own and a layer
 * of each neighbour's) are copied into flat arrays first, then every block
 * reads its neighbours there. The arrays it fills are reused (one chunk at a
 * time): copy them out before the next.
 */

/** The block families the materials are drawn with (index: a family's slot). */
export const FAMILIES: readonly VoxelMaterialKey[] = [...new Set(MAT_BY_ID.filter(Boolean).map((m) => m.family))];
const famOfMat = new Int8Array(256).fill(-1);
for (const m of MAT_BY_ID) if (m) famOfMat[m.id] = FAMILIES.indexOf(m.family);
/** Per form (shape · 4 + turn, kinds.ts `FORMS`): the quarters of its cell's sides it fills, its boxes (turned), each box's sides' quarters and its sides inside the block. */
const coversOf = new Uint32Array(256);
const boxesOf: (readonly (readonly number[])[])[] = [];
const facesOf: (readonly number[])[] = [];
const innerOf: (readonly number[])[] = [];
for (let f = 0; f < 256; f++) {
  const s = FORMS[f];
  coversOf[f] = s ? s.covers : 0;
  boxesOf[f] = s ? s.boxes : [];
  facesOf[f] = s ? s.faces : [];
  innerOf[f] = s ? s.inner : [];
}

/** Soft occlusion as VoxelGrid's defaults (`ao`, `jitter`, `seed`). */
const AO = 0.25;
const JITTER = 0.05;
const SEED = 1;
/** Exposure of a block on a flat wall with these weights (VoxelGrid.commit). */
const FLAT = 0.305;

const N = CHUNK_N;
/** The padded block of cells round a chunk: 34 a side. */
const P = N + 2;
const PP = P * P;
const occ = new Uint8Array(P * PP);
const cov = new Uint32Array(P * PP);
const padded = (x: number, y: number, z: number) => x + z * P + y * PP;

/** The 26 neighbours: their offset in the padded cells and weight (faces 1, edges 0.6, corners 0.35). */
const NEAR_OFF: number[] = [];
const NEAR_W: number[] = [];
let NEAR_TOTAL = 0;
for (let dy = -1; dy <= 1; dy++)
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) {
      const n = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
      if (!n) continue;
      NEAR_OFF.push(dx + dz * P + dy * PP);
      const w = n === 1 ? 1 : n === 2 ? 0.6 : 0.35;
      NEAR_W.push(w);
      NEAR_TOTAL += w;
    }
/** Per side (+x −x +y −y +z −z: bits 1 2 4 8 16 32): the neighbour's offset, and the side of it that faces back (its index). */
const SIDE_OFF = [1, -1, PP, -PP, P, -P];
const SIDE_BACK = [1, 0, 3, 2, 5, 4];
/** The quarters a cell's form fills on side `s` (kinds.ts `FormSpec.covers`). */
const coverQ = (c: number, s: number): number => (c >>> (4 * s)) & 15;
/** Per side's axis: its quarters' two axes (u, v), in x y z order (kinds.ts). */
const UV = [
  [1, 2],
  [0, 2],
  [0, 1],
];

/** The 12 edges of a box: pairs of sides on two axes. */
const EDGES: [number, number][] = [];
for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) if (a >> 1 !== b >> 1) EDGES.push([a, b]);

/** sRGB byte → linear (as three's `Color.setHex`). */
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** One family's boxes in a chunk (arrays reused: `count` of them hold this chunk's). */
export interface PackedFamily {
  readonly family: VoxelMaterialKey;
  count: number;
  /** 16 a box (`instanceMatrix`), 3 (`instanceColor`: linear, times the shade), 1 (`voxOpen`), 1 (`voxShown`). */
  matrix: Float32Array;
  color: Float32Array;
  open: Float32Array;
  shown: Float32Array;
  /** Every side any box shows (bits as `open`). */
  sides: number;
  /** Round its boxes (m): min x y z, max x y z. */
  readonly bounds: Float64Array;
}

export interface PackedChunk {
  /** By family slot ({@link FAMILIES}); `count` 0 where the chunk has none. */
  readonly families: readonly PackedFamily[];
  /** Boxes drawn, and blocks left out (every side covered). */
  boxes: number;
  buried: number;
}

const out: PackedChunk = {
  families: FAMILIES.map((family) => ({ family, count: 0, matrix: new Float32Array(0), color: new Float32Array(0), open: new Float32Array(0), shown: new Float32Array(0), sides: 0, bounds: new Float64Array(6) })),
  boxes: 0,
  buried: 0,
};

/** Room for `n` boxes in a family's arrays (kept). */
function room(f: PackedFamily, n: number): void {
  if (f.open.length >= n) return;
  const cap = Math.max(64, Math.ceil(n * 1.5));
  const grow = (a: Float32Array, k: number) => {
    const b = new Float32Array(cap * k);
    b.set(a);
    return b;
  };
  f.matrix = grow(f.matrix, 16);
  f.color = grow(f.color, 3);
  f.open = grow(f.open, 1);
  f.shown = grow(f.shown, 1);
}

/** Copy the cells round `c` (its own, and the layer of each neighbour that touches it) into the padded arrays. */
function gather(store: BlockStore, c: BlockChunk): void {
  occ.fill(0);
  cov.fill(0);
  for (let dy = -1; dy <= 1; dy++)
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const nb = dx || dy || dz ? store.chunkAt(chunkKey(c.cx + dx, c.cy + dy, c.cz + dz)) : c;
        if (!nb) continue;
        // (its cells next to this chunk: the last layer on the low side, the first on the high side, all of an axis it shares)
        const x0 = dx < 0 ? N - 1 : 0;
        const x1 = dx > 0 ? 0 : N - 1;
        const y0 = dy < 0 ? N - 1 : 0;
        const y1 = dy > 0 ? 0 : N - 1;
        const z0 = dz < 0 ? N - 1 : 0;
        const z1 = dz > 0 ? 0 : N - 1;
        const cells = nb.cells;
        const form = nb.form;
        for (let y = y0; y <= y1; y++)
          for (let z = z0; z <= z1; z++) {
            const row = z * N + y * N * N;
            const prow = padded(1 + dx * N, 1 + y + dy * N, 1 + z + dz * N);
            for (let x = x0; x <= x1; x++) {
              if (!cells[row + x]) continue;
              const p = prow + x;
              occ[p] = 1;
              cov[p] = coversOf[form[row + x]];
            }
          }
      }
}

/**
 * The instance data of chunk `c` of `store` (the cells round it read from its
 * neighbours). The arrays are reused by the next call.
 */
export function packChunk(store: BlockStore, c: BlockChunk): PackedChunk {
  gather(store, c);
  for (const f of out.families) {
    f.count = 0;
    f.sides = 0;
    f.bounds.set([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
  }
  out.boxes = 0;
  out.buried = 0;
  const cells = c.cells;
  const forms = c.form;
  for (let at = 0; at < cells.length; at++) {
    const v = cells[at];
    if (!v) continue;
    const lx = at % N;
    const lz = Math.floor(at / N) % N;
    const ly = Math.floor(at / (N * N));
    const p = padded(lx + 1, ly + 1, lz + 1);
    const form = forms[at];
    const boxes = boxesOf[form];
    const faces = facesOf[form];
    const inner = innerOf[form];
    // Open sides of each box: one on the cell's side is open unless the neighbour fills every quarter of it on its
    // side facing back; one inside the cell, unless another box of the block lies against all of it.
    let any = 0;
    for (let b = 0; b < boxes.length; b++) any |= openOf(faces[b], inner[b], p);
    if (!any) {
      out.buried++;
      continue;
    }
    const fam = out.families[famOfMat[v >>> 24]];
    // Shade: exposure in the 26 cells round it (VoxelGrid.commit), and seeded jitter by the cell.
    const i = c.i0 + lx;
    const j = c.j0 + ly;
    const k = c.k0 + lz;
    let open = 0;
    for (let n = 0; n < 26; n++) if (!occ[p + NEAR_OFF[n]]) open += NEAR_W[n];
    let shade = 1 + AO * Math.max(-0.7, Math.min(0.45, (open / NEAR_TOTAL - FLAT) * 2));
    if (occ[p + PP] && !occ[p + P] && occ[p + PP + P]) shade *= 1 - AO * 0.35;
    shade *= 1 + (hash3(i, j, k, SEED) - 0.5) * 2 * JITTER;
    const r = LIN[(v >> 16) & 255] * shade;
    const g = LIN[(v >> 8) & 255] * shade;
    const bl = LIN[v & 255] * shade;
    for (let b = 0; b < boxes.length; b++) {
      const box = boxes[b];
      const sides = openOf(faces[b], inner[b], p);
      if (!sides) continue;
      room(fam, fam.count + 1);
      const n = fam.count++;
      const sx = (box[3] - box[0]) * BLOCK_M;
      const sy = (box[4] - box[1]) * BLOCK_M;
      const sz = (box[5] - box[2]) * BLOCK_M;
      const x = (i + (box[0] + box[3]) / 2) * BLOCK_M;
      const y = (j + (box[1] + box[4]) / 2) * BLOCK_M;
      const z = (k + (box[2] + box[5]) / 2) * BLOCK_M;
      // (column-major, as Matrix4.compose with no turn writes it)
      const m = fam.matrix;
      const o = n * 16;
      m[o] = sx;
      m[o + 1] = m[o + 2] = m[o + 3] = m[o + 4] = 0;
      m[o + 5] = sy;
      m[o + 6] = m[o + 7] = m[o + 8] = m[o + 9] = 0;
      m[o + 10] = sz;
      m[o + 11] = 0;
      m[o + 12] = x;
      m[o + 13] = y;
      m[o + 14] = z;
      m[o + 15] = 1;
      fam.color[n * 3] = r;
      fam.color[n * 3 + 1] = g;
      fam.color[n * 3 + 2] = bl;
      fam.open[n] = sides + diagonalJoints(box, p, sides) * 64;
      fam.shown[n] = sides | 64;
      fam.sides |= sides;
      const bd = fam.bounds;
      bd[0] = Math.min(bd[0], x - sx / 2);
      bd[1] = Math.min(bd[1], y - sy / 2);
      bd[2] = Math.min(bd[2], z - sz / 2);
      bd[3] = Math.max(bd[3], x + sx / 2);
      bd[4] = Math.max(bd[4], y + sy / 2);
      bd[5] = Math.max(bd[5], z + sz / 2);
      out.boxes++;
    }
  }
  return out;
}

/** The open sides of a box of the block at padded cell `p` (its sides' quarters on the cell's sides, its sides inside the block). */
function openOf(faces: number, inner: number, p: number): number {
  let m = 0;
  for (let s = 0; s < 6; s++) {
    if (inner & (1 << s)) continue;
    const q = coverQ(faces, s);
    // (inside the cell, or on quarters the neighbour leaves open)
    if (!q || q & ~coverQ(cov[p + SIDE_OFF[s]], SIDE_BACK[s])) m |= 1 << s;
  }
  return m;
}

/** The half (bit 0 low, 1 high) of a cell axis a box's span [lo, hi] reaches, for each: lo < ½, hi > ½. */
const spanHalves = (lo: number, hi: number): number => (lo < 0.5 ? 1 : 0) | (hi > 0.5 ? 2 : 0);

/**
 * Sides to draw as joints (`voxOpen` bits 6‥11: the voxel shader keeps the
 * edge between two joint sides square, materials.ts `injectVoxelVertex`):
 * both sides of an edge where the block meets another only along that edge
 * (the cell across the edge fills, on both its sides facing back, the
 * quarters along that edge as far as the box runs; the two cells beside it
 * leave the box's sides open). Cut on both blocks, such an edge left a
 * channel through which the sky showed (a roof stepping in a block a row, a
 * diagonal wall, a stair's top edge on the next row's slab); square, the two
 * blocks close it. The sides stay open (their rims as they were): only the
 * cut of that edge goes. (Where such a row of blocks meets the next block
 * along it the corners still round: a pinhole, not a slit.)
 */
function diagonalJoints(box: readonly number[], p: number, open: number): number {
  let j = 0;
  for (let e = 0; e < EDGES.length; e++) {
    const [s1, s2] = EDGES[e];
    if (!(open & (1 << s1)) || !(open & (1 << s2))) continue;
    // (the box reaches both of the cell's sides there)
    if (!(s1 & 1 ? box[s1 >> 1] === 0 : box[(s1 >> 1) + 3] === 1) || !(s2 & 1 ? box[s2 >> 1] === 0 : box[(s2 >> 1) + 3] === 1)) continue;
    const c = cov[p + SIDE_OFF[s1] + SIDE_OFF[s2]];
    if (!c) continue;
    // The quarters of the far cell along the edge: on its side facing back across s1 (over axes a2 and a3), the
    // half of a2 next to the edge and the halves of a3 the box runs over; the same on its side across s2.
    const a1 = s1 >> 1;
    const a2 = s2 >> 1;
    const a3 = 3 - a1 - a2;
    const along = spanHalves(box[a3], box[a3 + 3]);
    if (alongEdge(coverQ(c, SIDE_BACK[s1]), a1, a2, s2 & 1 ? 2 : 1, along) && alongEdge(coverQ(c, SIDE_BACK[s2]), a2, a1, s1 & 1 ? 2 : 1, along))
      j |= (1 << s1) | (1 << s2);
  }
  return j;
}

/**
 * Do a side's quarters `q` (the side on axis `axis`) fill those at half `near` (1 low, 2 high) of
 * axis `a` and halves `along` (bits) of the third axis?
 */
function alongEdge(q: number, axis: number, a: number, near: number, along: number): boolean {
  const [u] = UV[axis];
  for (let h = 0; h < 2; h++) {
    if (!(along & (1 << h))) continue;
    const ha = near === 1 ? 0 : 1;
    const bit = u === a ? ha + 2 * h : h + 2 * ha;
    if (!(q & (1 << bit))) return false;
  }
  return true;
}

/** The largest cut edge (m) of a family's full blocks (graphics.ts `chamferOf`: the smallest side × the family's bevel). */
export const edgeOf = (family: VoxelMaterialKey): number => BLOCK_M * VOXEL_MATERIALS[family].bevel;
