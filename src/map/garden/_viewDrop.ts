import type { Blocks, LookData } from './_viewLook';

/**
 * Ripe fruit falling from a tree (garden/state.ts emits `fell`: a durian, a
 * coconut, the sugar palm's fruit): the view (garden/view.ts) finds the fruit
 * that has come to lie under the tree in its new look (blocks low down that
 * the look before did not have) and the fruit gone from the crown (blocks up
 * high it no longer has), and drops each fruit from where it hung: it falls,
 * hits the ground, bounces once (a third as high) and rolls the last bit to
 * where it lies. One after the other, a moment apart. The thud is the
 * interaction's (audio/_garden.ts).
 *
 * The blocks are the models' own (any model: no names needed); a fruit is the
 * blocks within a fist of each other.
 */

/** One falling fruit: its offset when it hangs (local m from where it lies), when it starts (s), its fall and bounce. */
interface Fruit {
  /** Where it comes to lie (local m, from the plant's foot). */
  lx: number;
  ly: number;
  lz: number;
  ox: number;
  oy: number;
  oz: number;
  delay: number;
  /** Seconds falling, bouncing; the bounce's speed up (m/s); the roll (local m, ending at 0). */
  fall: number;
  bounce: number;
  up: number;
  rx: number;
  rz: number;
}

export interface Drop {
  readonly fruit: readonly Fruit[];
  /** Each fruit has hit the ground (its dust puffed: the view's effects). */
  readonly landed: Uint8Array;
  /** Per family (as the look's `fams`): each block's fruit (-1: not falling), and its move this frame (world, 3 a block). */
  readonly of: readonly (Int16Array | null)[];
  readonly move: readonly (Float32Array | null)[];
  /** Seconds since it began, and when the last fruit lies still. */
  t: number;
  readonly end: number;
}

const G = 9.8;
/** Fruit that came to lie under the tree: blocks this low (m). */
const LOW = 0.8;
/** Fruit gone from the crown: blocks this high (m). */
const HIGH = 1.2;
/** Blocks of one fruit: within this of its first block (m, across). */
const FIST = 0.45;

const keyOf = (b: Blocks, i: number) => `${b.mat}|${Math.round(b.m[i * 16 + 12] * 40)}|${Math.round(b.m[i * 16 + 13] * 40)}|${Math.round(b.m[i * 16 + 14] * 40)}`;

interface Cluster {
  x: number;
  y: number;
  z: number;
  n: number;
}

function gather(list: Cluster[], x: number, y: number, z: number): number {
  for (let k = 0; k < list.length; k++) {
    const c = list[k];
    if (Math.hypot(c.x / c.n - x, c.z / c.n - z) < FIST && Math.abs(c.y / c.n - y) < FIST) {
      c.x += x;
      c.y += y;
      c.z += z;
      c.n++;
      return k;
    }
  }
  list.push({ x, y, z, n: 1 });
  return list.length - 1;
}

/** The fall from look `a` to look `b` (null: nothing new lies under it); fruit with no place in the crown falls from high in it (`b.height`). */
export function dropBetween(a: LookData, b: LookData): Drop | null {
  const had = new Set<string>();
  const has = new Set<string>();
  for (const f of a.fams) if (f) for (let i = 0; i < f.n; i++) had.add(keyOf(f, i));
  for (const f of b.fams) if (f) for (let i = 0; i < f.n; i++) has.add(keyOf(f, i));
  // Fruit lying now (new low blocks), and fruit gone from the crown (old high petal blocks).
  const lying: Cluster[] = [];
  const of = b.fams.map((f) => {
    if (!f) return null;
    let arr: Int16Array | null = null;
    for (let i = 0; i < f.n; i++) {
      const y = f.m[i * 16 + 13];
      if (y > LOW || had.has(keyOf(f, i))) continue;
      arr ??= new Int16Array(f.n).fill(-1);
      arr[i] = gather(lying, f.m[i * 16 + 12], y, f.m[i * 16 + 14]);
    }
    return arr;
  });
  if (!lying.length) return null;
  const gone: Cluster[] = [];
  for (const f of a.fams) {
    if (!f || f.mat !== 'petal') continue;
    for (let i = 0; i < f.n; i++) {
      const y = f.m[i * 16 + 13];
      if (y < HIGH || has.has(keyOf(f, i))) continue;
      gather(gone, f.m[i * 16 + 12], y, f.m[i * 16 + 14]);
    }
  }
  const used = new Set<number>();
  let end = 0;
  const fruit = lying.map((c, k): Fruit => {
    const lx = c.x / c.n;
    const ly = c.y / c.n;
    const lz = c.z / c.n;
    // (from the nearest fruit gone from the crown; else from up in the crown over it, nearer the trunk)
    let best = -1;
    let bd = Infinity;
    gone.forEach((g, j) => {
      if (used.has(j)) return;
      const d = Math.hypot(g.x / g.n - lx, g.z / g.n - lz);
      if (d < bd) {
        bd = d;
        best = j;
      }
    });
    let sx = lx * 0.45;
    let sy = Math.max(ly + 1.5, b.height * 0.72);
    let sz = lz * 0.45;
    if (best >= 0) {
      used.add(best);
      const g = gone[best];
      sx = g.x / g.n;
      sy = g.y / g.n;
      sz = g.z / g.n;
    }
    const h = Math.max(0.3, sy - ly);
    const fall = Math.sqrt((2 * h) / G);
    const up = 0.3 * G * fall;
    const bounce = (2 * up) / G;
    // (it rolls on a little after the bounce, out from the trunk)
    const l = Math.hypot(lx, lz) || 1;
    const roll = 0.18;
    const delay = k * 0.42;
    end = Math.max(end, delay + fall + bounce + 0.05);
    return { lx, ly, lz, ox: sx - lx, oy: sy - ly, oz: sz - lz, delay, fall, bounce, up, rx: (-lx / l) * roll, rz: (-lz / l) * roll };
  });
  return { fruit, landed: new Uint8Array(fruit.length), of, move: of.map((o, i) => (o ? new Float32Array(b.fams[i]!.n * 3) : null)), t: 0, end };
}

/** The moves of the falling blocks at `d.t` (world, the plant turned by `yaw`), into `d.move`. */
export function dropMoves(d: Drop, yaw: number, scale: number): void {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  for (let fi = 0; fi < d.of.length; fi++) {
    const of = d.of[fi];
    const mv = d.move[fi];
    if (!of || !mv) continue;
    for (let i = 0; i < of.length; i++) {
      const k = of[i];
      if (k < 0) continue;
      const f = d.fruit[k];
      const t = d.t - f.delay;
      let x = 0;
      let y = 0;
      let z = 0;
      if (t < 0) {
        x = f.ox;
        y = f.oy;
        z = f.oz;
      } else if (t < f.fall) {
        const u = t / f.fall;
        x = f.ox * (1 - u) + f.rx;
        z = f.oz * (1 - u) + f.rz;
        y = f.oy - 0.5 * G * t * t;
      } else if (t < f.fall + f.bounce) {
        const b = t - f.fall;
        const u = b / f.bounce;
        y = f.up * b - 0.5 * G * b * b;
        x = f.rx * (1 - u);
        z = f.rz * (1 - u);
      }
      mv[i * 3] = (c * x + s * z) * scale;
      mv[i * 3 + 1] = Math.max(0, y) * scale;
      mv[i * 3 + 2] = (-s * x + c * z) * scale;
    }
  }
}
