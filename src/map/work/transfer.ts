import type { SourceTrace } from '../../feedback/sourceTrace';
import { VoxelBuilder, type Surf, type VoxelBox } from '../../voxel/VoxelBuilder';
import { TraceTable } from '../../voxel/VoxelMesh';
import type { VoxelMaterialKey } from '../../voxel/materials';

/**
 * Blocks and the code lines that made them, sent between the build workers
 * and the page (map/work/). A structured clone keeps plain data but not a
 * `VoxelBuilder` (a class) nor an `Error`'s stack (a trace), and cloning a
 * hundred thousand small objects is slow: blocks go as a few typed arrays
 * whose buffers are moved, not copied, and traces as their stack's text.
 * Every value comes back exactly (numbers as 64-bit floats).
 */

/** A builder's blocks as typed arrays (`packBoxes`). */
export interface PackedBoxes {
  n: number;
  /** 8 a block: x, y, z, sx, sy, sz, color, shade. */
  num: Float64Array;
  /** The block's family: an index into `mats`. */
  mat: Uint16Array;
  mats: VoxelMaterialKey[];
  /** Which of the optional values a block has (`OPT`), in `extra` in that order. */
  has: Uint16Array;
  extra: Float64Array;
  /** The block's trace: an index into the traces sent with it, −1 none. */
  src: Int32Array;
}

/** The optional values of a block (VoxelBuilder.ts `VoxelBox`), as bits of `has`. */
const OPT = ['open', 'merge', 'joint', 'radius', 'rx', 'ry', 'rz'] as const;
const SURF = 1 << OPT.length;

/** A builder's blocks as typed arrays (their traces into `traces`). */
export function packBoxes(boxes: readonly VoxelBox[], traces: TraceTable): PackedBoxes {
  const n = boxes.length;
  const num = new Float64Array(n * 8);
  const mat = new Uint16Array(n);
  const mats: VoxelMaterialKey[] = [];
  const matIndex = new Map<VoxelMaterialKey, number>();
  const has = new Uint16Array(n);
  const extra: number[] = [];
  const src = new Int32Array(n);
  for (let j = 0; j < n; j++) {
    const b = boxes[j];
    const o = j * 8;
    num[o] = b.x;
    num[o + 1] = b.y;
    num[o + 2] = b.z;
    num[o + 3] = b.sx;
    num[o + 4] = b.sy;
    num[o + 5] = b.sz;
    num[o + 6] = b.color;
    num[o + 7] = b.shade;
    let m = matIndex.get(b.mat);
    if (m === undefined) {
      matIndex.set(b.mat, (m = mats.length));
      mats.push(b.mat);
    }
    mat[j] = m;
    let bits = 0;
    for (let q = 0; q < OPT.length; q++) {
      const v = b[OPT[q]];
      if (v === undefined) continue;
      bits |= 1 << q;
      extra.push(v);
    }
    if (b.surf !== undefined) {
      bits |= SURF;
      extra.push(b.surf[0], b.surf[1], b.surf[2], b.surf[3]);
    }
    has[j] = bits;
    src[j] = traces.of(b.src);
  }
  return { n, num, mat, mats, has, extra: Float64Array.from(extra), src };
}

/** The blocks of `packBoxes`, as `VoxelBuilder.box` makes them (the same keys, in its order). */
export function unpackBoxes(p: PackedBoxes, traces: readonly (SourceTrace | undefined)[]): VoxelBox[] {
  const out: VoxelBox[] = new Array(p.n);
  const { num, mat, mats, has, extra, src } = p;
  let e = 0;
  const opt: (number | undefined)[] = new Array(OPT.length);
  for (let j = 0; j < p.n; j++) {
    const o = j * 8;
    const bits = has[j];
    for (let q = 0; q < OPT.length; q++) opt[q] = bits & (1 << q) ? extra[e++] : undefined;
    let surf: Surf | undefined;
    if (bits & SURF) {
      surf = [extra[e], extra[e + 1], extra[e + 2], extra[e + 3]];
      e += 4;
    }
    out[j] = {
      x: num[o],
      y: num[o + 1],
      z: num[o + 2],
      sx: num[o + 3],
      sy: num[o + 4],
      sz: num[o + 5],
      color: num[o + 6],
      mat: mats[mat[j]],
      shade: num[o + 7],
      open: opt[0],
      surf,
      merge: opt[1],
      joint: opt[2],
      radius: opt[3],
      rx: opt[4],
      ry: opt[5],
      rz: opt[6],
      src: src[j] < 0 ? undefined : traces[src[j]],
    };
  }
  return out;
}

/** The buffers of packed blocks (moved, not copied). */
function boxBuffers(p: PackedBoxes, out: ArrayBufferLike[]): void {
  for (const a of [p.num, p.mat, p.has, p.extra, p.src]) out.push(a.buffer);
}

const BUILDER = '__voxelBuilder';

/**
 * A value with builders in it (anywhere in plain objects and arrays) as plain
 * data: each builder's blocks packed (their buffers added to `transfer`).
 */
export function encodeBuilders(value: unknown, traces: TraceTable, transfer: ArrayBufferLike[]): unknown {
  if (value instanceof VoxelBuilder) {
    const p = packBoxes(value.boxes, traces);
    boxBuffers(p, transfer);
    return { [BUILDER]: p };
  }
  if (Array.isArray(value)) return value.map((v) => encodeBuilders(v, traces, transfer));
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = encodeBuilders(v, traces, transfer);
    return out;
  }
  return value;
}

/** The value of `encodeBuilders`, its builders made again. */
export function decodeBuilders(value: unknown, traces: readonly (SourceTrace | undefined)[]): unknown {
  if (Array.isArray(value)) return value.map((v) => decodeBuilders(v, traces));
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const packed = (value as Record<string, PackedBoxes | undefined>)[BUILDER];
    if (packed) {
      const b = new VoxelBuilder();
      for (const box of unpackBoxes(packed, traces)) b.boxes.push(box);
      return b;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = decodeBuilders(v, traces);
    return out;
  }
  return value;
}

/** The traces of a table as the text of their stacks (to send them: a clone drops an Error's stack). */
export function traceStacks(t: TraceTable): string[] {
  return t.list.map((e) => e.stack ?? '');
}

/**
 * Traces made again from their stacks' text, one per text (`cache`: shared by
 * every result of a build, so blocks made by the same line share one trace, as
 * when built on the page). The bug report tool (B) reads only a trace's stack.
 */
export function tracesFrom(stacks: readonly string[], cache: Map<string, SourceTrace>): SourceTrace[] {
  return stacks.map((stack) => {
    let t = cache.get(stack);
    if (!t) {
      t = new Error('source trace');
      t.stack = stack;
      cache.set(stack, t);
    }
    return t;
  });
}
