import { Euler, Group, InstancedBufferAttribute, Matrix4, Vector3, type BufferGeometry, type Camera, type InstancedMesh, type Material, type Object3D, type PerspectiveCamera, type Scene, type WebGLRenderer } from 'three';
import type { VoxelMaterialKey } from '../../voxel/materials';
import type { VoxelBox, VoxelBuilder, VoxelGrid } from '../../voxel/VoxelBuilder';
import type { SourceTrace } from '../../feedback/sourceTrace';
import { buildVoxelMesh, unpackVoxelMesh, type CoverGround, type PackedVoxelMesh, type VoxelQuality } from '../../voxel/VoxelMesh';
import { graphicsNow } from '../graphics';
import type { HeightField } from '../heightfield';

/**
 * A temple's blocks drawn as only the sides that can be seen, each side
 * direction a mesh of its own, and of each of those only the blocks whose
 * side faces the camera; its shadows cast as before.
 *
 * A temple is a shell of blocks: in Angkor Wat 23,500 stones, most of whose
 * sides lie against the next stone or face the solid inside (the cells a
 * grid buries and drops). Drawn as one mesh a family, every block sent all
 * the sides that face the camera from anywhere in the temple: 10 triangles a
 * stone as plain boxes (the overview), 44 chamfered, the covered ones only
 * collapsed in the vertex shader (map/cull.ts `cutCovered`), each still a
 * vertex shader's work on a phone. The picture now draws the **shell**:
 *
 * 1. **The sides that can be seen** ({@link visibleSides}): a side is left
 *    out when its grid has a solid cell beside it (another block of the
 *    grid, or a buried cell inside the solid: {@link commitGrid}), or when
 *    the land under the temple covers all of it (a foot on the ground).
 *    What is left is the temple's outer surface: the same picture.
 * 2. **A mesh per side direction** (+x … −z) for the big families (stone;
 *    moss and leaves where there are many, {@link SPLIT_FROM}): a block is in
 *    the mesh of each side it shows, drawn with that side only (VoxelMesh.ts
 *    `openSidesIndex`: the face, and on chamfered blocks its edge strips and
 *    corners, so a block in two meshes draws the strip between its two faces
 *    twice, the same pixels). Plain boxes draw 2 triangles a side shown.
 * 3. **Only the sides facing the camera**: each mesh's blocks are sorted by
 *    how far out their side lies along its direction, so those whose side
 *    faces the eye come first: just before the mesh is drawn for a camera
 *    in perspective, `count` stops after them (a binary search), and goes
 *    back to all of them right after. A direction facing away altogether
 *    draws nothing (an empty draw: no triangles).
 *
 * On the levels with edges near the camera, each mesh switches between its
 * chamfered and plain shape as before (graphics.ts `plainFar`; `reshape`
 * keeps its one side). Small families, light, water and wax, and blocks
 * turned other than about the vertical are one mesh a family, all sides (as
 * before, with the sides that can be seen as `voxShown`). Blocks turned about
 * the vertical (the River Gate's pieces, built square to the road and turned
 * into place) are worked out in their own turned frame.
 *
 * **Shadows** are cast by the temple's blocks as they were built
 * (`buildVoxelMesh`, every side: the **casters**), never drawn in the
 * picture; the shell casts none. Without the covered sides a light ray
 * through the solid would stop only where it leaves it, and the shadow
 * thins out in the inner corners (by the shadow's bias); the casters keep it
 * as it was. They are the same meshes as before (the still layer, the shadow
 * gate, their edges far off), but out of the picture: off layer 0 while the
 * shadows are still (low, medium: the still pass draws the still layer), and
 * on high and max, where the shadow pass sees what the picture sees, drawn
 * with no blocks in any picture (`count` 0, an empty draw: {@link Shell.update}).
 * The walk map reads the casters (all the blocks, as before); the shell's
 * meshes are `noWalk`. The mini-map, the animals' survey and the water read
 * both (the same blocks twice). Picks (the bug report) hit the shell: each
 * block names the line that built it, as before.
 *
 * `shell=0` in the URL draws the temples as before (to compare).
 */

/** A block of a grid, with the sides its grid knows are against solid cells ({@link commitGrid}). */
type ShellBox = VoxelBox & { hid?: number };

/** The six side directions (bits as `open`: +x 1, −x 2, +y 4, −y 8, +z 16, −z 32). */
const SIDES: readonly { name: string; axis: 0 | 1 | 2 }[] = [
  { name: '+x', axis: 0 },
  { name: '-x', axis: 0 },
  { name: '+y', axis: 1 },
  { name: '-y', axis: 1 },
  { name: '+z', axis: 2 },
  { name: '-z', axis: 2 },
];
const STEP: readonly [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/** Families that neither cover nor are split (light, water, candle wax: they come and go, or are seen through; as cull.ts). */
const NO_COVER = new Set<string>(['glow', 'water', 'wax']);
/** A family is drawn a mesh per side direction from this many blocks (in one frame); fewer: one mesh, all sides (each mesh more is a draw). */
export const SPLIT_FROM = 2500;
/** A side within this far (m) of the eye's plane still counts as facing it (the GPU's rounding; ≥ 0: only ever more drawn). */
const SLACK = 0.05;
/** Sort keys (m) in steps of 1 / `KEY_Q` (¼ mm), shifted by `KEY_OFF` steps to be positive, above `KEY_I` places (a mesh's blocks). */
const KEY_Q = 4096;
const KEY_OFF = 2 ** 25;
const KEY_I = 2 ** 20;
/** `shell=0` in the URL: the temples drawn as before, one mesh a family with every side (to compare). */
const SHELL = new URLSearchParams(typeof location === 'undefined' ? '' : location.search).get('shell') !== '0';

// ── Grids: the sides against solid cells ────────────────────────────────────

const cellKey = (i: number, j: number, k: number) => ((i + 8192) * 16384 + (j + 8192)) * 16384 + (k + 8192);

/**
 * What a grid's ghost cells (marked solid, never drawn) stand for, for
 * {@link commitGrid}: `'none'` the grid has none; `'solid'` each truly is
 * solid (the stone of another grid, ground that is there); or the ghost
 * cells (not given: every cell of the grid is looked at) and which of them
 * truly are (the ground under the bottom row, but where a stream runs
 * lower). Not given at all: every cell is looked at, and no ghost counts as
 * solid.
 */
export type Ghosts = 'none' | 'solid' | { cells?: readonly (readonly [number, number, number])[]; real: (i: number, j: number, k: number) => boolean };

/**
 * Commit a grid (`g.commit()`, which drops the cells buried on all six
 * sides) and mark each block it makes with the sides that lie against a
 * solid cell of the grid: another block, or a buried cell (inside the
 * solid). A side against a ghost cell is solid only where the ghost truly
 * is ({@link Ghosts}); else it is drawn, unless the land covers it. A ghost
 * that is not (ground lower than the grid's floor: a stream under a
 * gallery) leaves a hole where the cells over it were buried: every buried
 * cell joined to it is not solid either (seen through the hole).
 *
 * Call it where the grid would be committed; the marks ride on the blocks
 * (spread copies keep them: `Frame.place`, `append`; `translate` moves them).
 */
export function commitGrid(b: VoxelBuilder, g: VoxelGrid, ghosts?: Ghosts): VoxelBuilder {
  const n0 = b.boxes.length;
  g.commit();
  // The ghost cells that are not solid ('none' and 'solid': no such ghosts).
  const loose = new Set<number>();
  const looseAt: [number, number, number][] = [];
  if (ghosts !== 'none' && ghosts !== 'solid') {
    const real = ghosts?.real ?? (() => false);
    const look = (i: number, j: number, k: number) => {
      const key = cellKey(i, j, k);
      if (!loose.has(key) && g.get(i, j, k)?.ghost && !real(i, j, k)) {
        loose.add(key);
        looseAt.push([i, j, k]);
      }
    };
    if (ghosts?.cells) for (const [i, j, k] of ghosts.cells) look(i, j, k);
    else g.forEach((i, j, k, c) => c.ghost && look(i, j, k));
  }
  // Buried cells seen through a hole: joined (through buried cells) to a ghost that is not solid.
  const open = new Set<number>();
  if (loose.size) {
    const buried = (i: number, j: number, k: number): boolean => {
      const c = g.get(i, j, k);
      if (!c || c.ghost) return false;
      for (const [a, e, o] of STEP) if (!g.has(i + a, j + e, k + o)) return false;
      return true;
    };
    const queue: [number, number, number][] = [];
    const reach = (i: number, j: number, k: number) => {
      for (const [a, e, o] of STEP) {
        const key = cellKey(i + a, j + e, k + o);
        if (!open.has(key) && buried(i + a, j + e, k + o)) {
          open.add(key);
          queue.push([i + a, j + e, k + o]);
        }
      }
    };
    for (const [i, j, k] of looseAt) reach(i, j, k);
    while (queue.length) reach(...queue.pop()!);
  }
  const [cx, cy, cz] = g.cell;
  const [ox, oy, oz] = g.origin;
  for (let n = n0; n < b.boxes.length; n++) {
    const box = b.boxes[n] as ShellBox;
    // (the sides commit left closed: a cell of the grid is there, solid but for the ghosts that are not and the cells seen through them)
    let hid = ~(box.open ?? 63) & 63;
    if (hid && (loose.size || open.size)) {
      const i = Math.round((box.x - ox) / cx - 0.5);
      const j = Math.round((box.y - oy) / cy - 0.5);
      const k = Math.round((box.z - oz) / cz - 0.5);
      for (let s = 0; s < 6; s++) {
        if (!(hid & (1 << s))) continue;
        const [a, e, o] = STEP[s];
        const key = cellKey(i + a, j + e, k + o);
        if (loose.has(key) || open.has(key)) hid &= ~(1 << s);
      }
    }
    box.hid = hid;
  }
  return b;
}

/** Whether the land fills up to `top` (m) under the rectangle [x0, x0 + sx] × [z0, z0 + sz] (a ghost cell standing for the ground). */
export function groundFills(f: HeightField, x0: number, z0: number, sx: number, sz: number, top: number): boolean {
  const e = 0.05;
  const low = top - 0.02;
  const fills = (x: number, z: number) => f.index(x, z) >= 0 && f.heightAt(x, z) >= low;
  return fills(x0 + e, z0 + e) && fills(x0 + sx - e, z0 + e) && fills(x0 + e, z0 + sz - e) && fills(x0 + sx - e, z0 + sz - e);
}

// ── The sides that can be seen ──────────────────────────────────────────────

/** Blocks turned only about the vertical, by how far (radians; 0: not turned), or null: turned some other way. */
function turnOf(b: VoxelBox): number | null {
  if (b.rx || b.rz) return null;
  return b.ry ?? 0;
}

/**
 * The sides of each block that can be seen (bits as `open`): not against a
 * solid cell of its grid ({@link commitGrid}), nor, for blocks not turned,
 * under the land all over (`ground`: a foot on the ground, a footing below
 * it). Blocks turned other than about the vertical, and light, water and
 * wax, show every side.
 *
 * (Sides that one grid's blocks cover on another's, or free boxes on a
 * grid's, are drawn: tested against every block, VoxelMesh.ts `shownSides`,
 * they came to 2 % of the temples' triangles in the overview, 5 k, for two
 * thirds of the shell's build time, ≈ 110 ms on an M1 Max.)
 */
export function visibleSides(boxes: readonly VoxelBox[], ground?: CoverGround): Uint8Array {
  const out = new Uint8Array(boxes.length);
  for (let j = 0; j < boxes.length; j++) {
    const b = boxes[j] as ShellBox;
    const t = turnOf(b);
    if (t === null || NO_COVER.has(b.mat)) {
      out[j] = 63;
      continue;
    }
    let m = 63 & ~(b.hid ?? 0);
    if (m && ground && !t) m &= ~landHides(b, m, ground);
    out[j] = m;
  }
  return out;
}

/** The land's top over the cells under the rectangle [x0, x1] × [z0, z1] (m): the lowest (`high`: the highest), −∞ off the land. */
function landTop(g: CoverGround, x0: number, x1: number, z0: number, z1: number, high = false): number {
  const i0 = Math.floor((x0 - g.x0) / g.cell);
  const i1 = Math.floor((x1 - g.x0) / g.cell);
  const k0 = Math.floor((z0 - g.z0) / g.cell);
  const k1 = Math.floor((z1 - g.z0) / g.cell);
  if (i0 < 0 || k0 < 0 || i1 >= g.nx || k1 >= g.nz) return -Infinity;
  let top = high ? -Infinity : Infinity;
  for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) top = high ? Math.max(top, g.floor[i + k * g.nx]) : Math.min(top, g.floor[i + k * g.nx]);
  return top;
}

/** Of the sides `m` of a block not turned, those the land covers all over (as `shownSides` reads the land: solid below its top; 2 cm out, the side's border 1 cm in). */
function landHides(b: VoxelBox, m: number, g: CoverGround): number {
  const [x0, x1, y0, y1, z0, z1] = [b.x - b.sx / 2, b.x + b.sx / 2, b.y - b.sy / 2, b.y + b.sy / 2, b.z - b.sz / 2, b.z + b.sz / 2];
  const e = 0.01;
  const out = 0.02;
  // (the land nowhere up to its foot: nothing to cover)
  if (landTop(g, x0 - out, x1 + out, z0 - out, z1 + out, true) <= y0 - out) return 0;
  let hid = 0;
  const under = landTop(g, x0 + e, x1 - e, z0 + e, z1 - e);
  if (m & 8 && under > y0 - out) hid |= 8;
  if (m & 4 && under > y1 + out) hid |= 4;
  if (m & 1 && landTop(g, x1, x1 + out, z0 + e, z1 - e) >= y1 - e) hid |= 1;
  if (m & 2 && landTop(g, x0 - out, x0, z0 + e, z1 - e) >= y1 - e) hid |= 2;
  if (m & 16 && landTop(g, x0 + e, x1 - e, z1, z1 + out) >= y1 - e) hid |= 16;
  if (m & 32 && landTop(g, x0 + e, x1 - e, z0 - out, z0) >= y1 - e) hid |= 32;
  return hid;
}

/** The land as `shownSides` reads it: solid below the ground's top in each cell. */
export function landCover(f: HeightField): CoverGround {
  return { x0: f.x0, z0: f.z0, cell: f.cell, nx: f.nx, nz: f.nz, floor: f.height };
}

// ── Meshes ──────────────────────────────────────────────────────────────────

export interface ShellOptions {
  /** The part's name (`landmark:<id>`): the casters' group is named so (as before), the shell `<name>:shell`, its meshes `<name>:<side>:<family>` and `<name>:<family>`. */
  name: string;
  quality: VoxelQuality;
  /** The land under the temple (blocks resting on it hide their undersides). */
  field?: HeightField;
}

/** A temple's blocks: the shell drawn, the casters' shadows (see the file's comment). */
export interface Shell {
  /** Both groups (add it to the part's object). */
  object: Group;
  /** Every frame (the part's `update`): the casters kept out of the picture as the level's shadows need. */
  update(): void;
}

/**
 * A temple's blocks as its shell and its casters, in place of
 * `buildVoxelMesh(builder, { quality, name })`.
 */
export function buildShell(builder: VoxelBuilder, o: ShellOptions): Shell {
  const object = new Group();
  object.name = `${o.name}:blocks`;
  const casters = buildVoxelMesh(builder, { quality: o.quality, name: o.name });
  object.add(casters);
  if (!SHELL) return { object, update() {} };
  const boxes = builder.boxes;
  const sides = visibleSides(boxes, o.field ? landCover(o.field) : undefined);
  const shell = new Group();
  shell.name = `${o.name}:shell`;
  // (builder space = world: the feedback tool reports picks in it)
  shell.userData.voxelOffset = new Vector3();

  // Each block's row in its family's caster (a family's blocks there in the builder's order): the shell's meshes copy their rows.
  const casterOf = new Map<string, InstancedMesh>();
  for (const c of casters.children) casterOf.set(c.name.slice(c.name.lastIndexOf(':') + 1), c as InstancedMesh);
  const rowOf = new Int32Array(boxes.length);
  const rows = new Map<string, number>();
  boxes.forEach((b, j) => {
    const r = rows.get(b.mat) ?? 0;
    rowOf[j] = r;
    rows.set(b.mat, r + 1);
  });
  const mesh = (name: string, mat: VoxelMaterialKey, js: readonly number[], drawn: number): InstancedMesh | null => {
    const from = casterOf.get(mat);
    return from ? copyRows(from, js, rowOf, sides, drawn, name) : null;
  };

  // Blocks of a family in a frame (turned the same way): split by side when there are enough of them.
  const byFrame = new Map<VoxelMaterialKey, Map<number, number[]>>();
  const whole = new Map<VoxelMaterialKey, number[]>();
  const wholeOf = (mat: VoxelMaterialKey) => {
    let w = whole.get(mat);
    if (!w) whole.set(mat, (w = []));
    return w;
  };
  boxes.forEach((b, j) => {
    const t = turnOf(b);
    if (t === null || NO_COVER.has(b.mat)) return void wholeOf(b.mat).push(j);
    let byTurn = byFrame.get(b.mat);
    if (!byTurn) byFrame.set(b.mat, (byTurn = new Map()));
    let list = byTurn.get(t);
    if (!list) byTurn.set(t, (list = []));
    list.push(j);
  });
  const turns = [...new Set([...byFrame.values()].flatMap((byTurn) => [...byTurn.keys()]))].sort((a, b) => a - b);
  for (const [mat, byTurn] of byFrame)
    for (const [t, list] of byTurn) {
      if (list.length < SPLIT_FROM) {
        wholeOf(mat).push(...list);
        continue;
      }
      const turn = new Matrix4().makeRotationFromEuler(new Euler(0, t, 0));
      const tag = turns.length > 1 && t ? `r${turns.indexOf(t)}` : '';
      const bySide: number[][] = [[], [], [], [], [], []];
      for (const j of list) for (let s = 0; s < 6; s++) if (sides[j] & (1 << s)) bySide[s].push(j);
      for (let s = 0; s < 6; s++) {
        const js = bySide[s];
        if (!js.length) continue;
        const { axis } = SIDES[s];
        // The side's outward direction (mesh space) and how far out each block's side lies along it, in
        // ¼ mm, sorted with the block's place in `js` below it (a number sorts natively).
        const n = new Vector3(...STEP[s]).applyMatrix4(turn);
        const code = new Float64Array(js.length);
        js.forEach((j, i) => {
          const b = boxes[j];
          const key = n.x * b.x + n.y * b.y + n.z * b.z + (axis === 0 ? b.sx : axis === 1 ? b.sy : b.sz) / 2;
          code[i] = (Math.round(key * KEY_Q) + KEY_OFF) * KEY_I + i;
        });
        code.sort();
        const sorted = Array.from(code, (v) => js[v % KEY_I]);
        const side = mesh(
          `${o.name}:${tag}${SIDES[s].name}`,
          mat,
          sorted,
          1 << s,
        );
        if (!side) continue;
        facing(
          side,
          Float32Array.from(code, (v) => (Math.floor(v / KEY_I) - KEY_OFF) / KEY_Q),
          n,
        );
        shell.add(side);
      }
    }
  for (const [mat, list] of whole) {
    let union = 0;
    for (const j of list) union |= sides[j];
    const all = mesh(o.name, mat, list, NO_COVER.has(mat) ? 63 : union);
    if (all) shell.add(all);
  }
  object.add(shell);

  // The casters: their sides that can be seen (so cull.ts leaves them as they are: they are not drawn), never in a picture.
  const shownOf = new Map<string, Float32Array>();
  for (const [fam, m] of casterOf) shownOf.set(fam, new Float32Array(m.count));
  boxes.forEach((b, j) => {
    const shown = shownOf.get(b.mat);
    if (shown) shown[rowOf[j]] = sides[j] | 64;
  });
  for (const [fam, m] of casterOf) {
    m.geometry.setAttribute('voxShown', new InstancedBufferAttribute(shownOf.get(fam)!, 1));
    unpictured(m);
  }
  let still: boolean | null = null;
  return {
    object,
    update() {
      if (graphicsNow.stillShadows === still) return;
      still = graphicsNow.stillShadows;
      // (still shadows: the pass sees the still layer only, so the casters stay off the picture's layer 0; else on it, for the pass)
      casters.traverse((x: Object3D) => (still ? x.layers.disable(0) : x.layers.enable(0)));
    },
  };
}

/**
 * A mesh of the picture: the blocks `js` (builder indices, one family), in
 * that order, copied from their rows in the family's caster `from`
 * (`rowOf`), named `<name>:<family>`, drawing the sides in `drawn`
 * (VoxelMesh.ts `openSidesIndex`, kept by graphics.ts `reshape` through
 * `voxelSides`), each block's sides that can be seen as its `voxShown`
 * (cull.ts reads it). Casts no shadow; not in the walk map (`noWalk`: it
 * reads the casters).
 */
function copyRows(from: InstancedMesh, js: readonly number[], rowOf: Int32Array, sides: Uint8Array, drawn: number, name: string): InstancedMesh | null {
  const n = js.length;
  if (!n) return null;
  const geo = from.geometry;
  const M = from.instanceMatrix.array as Float32Array;
  const C = from.instanceColor!.array as Float32Array;
  const O = geo.getAttribute('voxOpen').array as Float32Array;
  const R = geo.getAttribute('voxRadius').array as Float32Array;
  const S = geo.getAttribute('voxSurf')?.array as Float32Array | undefined;
  const traces = from.userData.voxelSources as (SourceTrace | undefined)[] | undefined;
  const matrix = new Float32Array(n * 16);
  const color = new Float32Array(n * 3);
  const open = new Float32Array(n);
  const radius = new Float32Array(n);
  const surf = S ? new Float32Array(n * 4) : null;
  const shown = new Float32Array(n);
  const src = traces ? new Int32Array(n) : null;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    const j = js[i];
    const r = rowOf[j];
    for (let q = 0; q < 16; q++) matrix[i * 16 + q] = M[r * 16 + q];
    for (let q = 0; q < 3; q++) color[i * 3 + q] = C[r * 3 + q];
    open[i] = O[r];
    radius[i] = R[r];
    if (surf && S) for (let q = 0; q < 4; q++) surf[i * 4 + q] = S[r * 4 + q];
    shown[i] = sides[j] | 64;
    // (the caster's own trace list: a block's trace is its row there)
    if (src) src[i] = r;
    // (the block's box round its turn: half of |rotation × scale| along each axis)
    const e = r * 16;
    for (let a = 0; a < 3; a++) {
      const h = 0.5 * (Math.abs(M[e + a]) + Math.abs(M[e + 4 + a]) + Math.abs(M[e + 8 + a]));
      lo[a] = Math.min(lo[a], M[e + 12 + a] - h);
      hi[a] = Math.max(hi[a], M[e + 12 + a] + h);
    }
  }
  // A sphere round every block (graphics.ts `plainFar` measures from it): all the caster's blocks, the caster's own (the
  // same blocks, the same edges far off as before); else the box's middle, out to the furthest corner.
  const all = n === from.count && from.boundingSphere;
  const mid = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  let r2 = 0;
  for (let i = 0; i < n && !all; i++) {
    const e = i * 16;
    let d2 = 0;
    for (let a = 0; a < 3; a++) {
      const h = 0.5 * (Math.abs(matrix[e + a]) + Math.abs(matrix[e + 4 + a]) + Math.abs(matrix[e + 8 + a]));
      d2 += (Math.abs(matrix[e + 12 + a] - mid[a]) + h) ** 2;
    }
    r2 = Math.max(r2, d2);
  }
  const sphere = all ? Float64Array.of(all.center.x, all.center.y, all.center.z, all.radius) : Float64Array.of(mid[0], mid[1], mid[2], Math.sqrt(r2));
  const shape = from.userData.voxelShape as { segments: number; flat: boolean };
  const packed: PackedVoxelMesh = {
    mat: from.name.slice(from.name.lastIndexOf(':') + 1) as VoxelMaterialKey,
    sides: drawn & 63,
    segments: shape.segments,
    flat: shape.flat,
    count: n,
    matrix,
    color,
    open,
    radius,
    surf,
    shown,
    src,
    sphere,
    box: Float64Array.of(lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]),
  };
  const group = unpackVoxelMesh({ name, offset: [0, 0, 0], castShadow: false, receiveShadow: true, blocks: n, meshes: [packed] }, traces ?? []);
  const mesh = group.children[0] as InstancedMesh;
  mesh.removeFromParent();
  mesh.userData.noWalk = true;
  return mesh;
}

type Hook = (renderer: WebGLRenderer, scene: Scene, camera: Camera, geometry: BufferGeometry, material: Material, group: unknown) => void;
const _eye = new Vector3();
const _inv = new Matrix4();

/**
 * Draw only the first blocks of a mesh, those whose side faces the camera
 * (`keys` ascending: how far out along `n` each block's side lies; it faces
 * an eye further out than that), for a camera in perspective, all of them
 * again right after. The hooks main.ts and others set on the mesh
 * (voxel/backFacets.ts, before or after this) run inside these, as set.
 */
function facing(mesh: InstancedMesh, keys: Float32Array, n: Vector3): void {
  let before: Hook = mesh.onBeforeRender as Hook;
  let after: Hook = mesh.onAfterRender as Hook;
  let was = -1;
  const onBefore: Hook = function (this: InstancedMesh, renderer, scene, camera, geometry, material, group) {
    before.call(this, renderer, scene, camera, geometry, material, group);
    if (!(camera as PerspectiveCamera).isPerspectiveCamera) return;
    _eye.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(_inv.copy(this.matrixWorld).invert());
    const t = n.dot(_eye) + SLACK;
    // (the blocks whose side lies nearer than the eye along n: a binary search)
    let lo = 0;
    let hi = keys.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (keys[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    was = this.count;
    this.count = Math.min(lo, was);
  };
  const onAfter: Hook = function (this: InstancedMesh, renderer, scene, camera, geometry, material, group) {
    if (was >= 0) {
      this.count = was;
      was = -1;
    }
    after.call(this, renderer, scene, camera, geometry, material, group);
  };
  // (a hook set later, e.g. main.ts `skipBackFacets` after the build, runs inside these)
  Object.defineProperty(mesh, 'onBeforeRender', { configurable: true, get: () => onBefore, set: (fn: Hook) => void (before = fn) });
  Object.defineProperty(mesh, 'onAfterRender', { configurable: true, get: () => onAfter, set: (fn: Hook) => void (after = fn) });
}

/**
 * A caster drawn with no blocks in every picture (any camera: the view, the
 * snow's map, photos), with all of them in the shadow passes (which call
 * `onBeforeShadow`, not these). Hooks set on it later keep their after part
 * (voxel/backFacets.ts: whose picture part has nothing to draw here).
 */
function unpictured(mesh: InstancedMesh): void {
  let after: Hook = mesh.onAfterRender as Hook;
  let was = -1;
  const onBefore: Hook = function (this: InstancedMesh) {
    was = this.count;
    this.count = 0;
  };
  const onAfter: Hook = function (this: InstancedMesh, renderer, scene, camera, geometry, material, group) {
    if (was >= 0) {
      this.count = was;
      was = -1;
    }
    after.call(this, renderer, scene, camera, geometry, material, group);
  };
  Object.defineProperty(mesh, 'onBeforeRender', { configurable: true, get: () => onBefore, set: () => undefined });
  Object.defineProperty(mesh, 'onAfterRender', { configurable: true, get: () => onAfter, set: (fn: Hook) => void (after = fn) });
}
