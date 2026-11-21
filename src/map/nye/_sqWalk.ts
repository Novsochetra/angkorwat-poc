import { traceSource, type SourceTrace } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { TRADER_AT } from '../cattle/plan';
import type { Glow } from '../festival/_glow';
import { onNurseryLot } from '../hamlet/_nurseryPlan';
import { HOME_AT } from '../hamlet/_homePlan';
import type { HeightField } from '../heightfield';
import type { Lamps } from '../landmarks/_prasatKit';
import { NYE_YEAR } from './clock';
import { GATE, LANTERN_WALK, onSquare } from './plan';
import { TOP } from './_sqFloor';
import { GOLD, khmerLamp, LAMP_HALO, LATERITE, PAVER, PAVER_LIGHT, pick, POST_STONE } from './_sqKit';

/**
 * The way in (AWP-35): the lantern walk from the sugar-palm village up the Kulen foot trail (plan.ts
 * `LANTERN_WALK`), and its last stretch, the avenue: a wide paved way straight south from the gate.
 *
 * - The lantern walk (`layLanternWalk`): Khmer lamps on their stone posts (`_sqKit.ts` `khmerLamp`) both sides,
 *   closer together near the square (`step` × 0.6 in its last 60 m) than far out by the village (`step` × 1.25).
 *   Each lamp looks for its ground a little way out from the line: never on the trail's tread, on water, a cliff
 *   lip or anything built (the nursery, his house, the cattle trader's meadow, the woodcutters' camp); a spot it
 *   cannot find is left out. None on the avenue: it has its own.
 * - The avenue (`layAvenue`, `AVENUE`): 4.6 m of sandstone pavers flush with the land as the square's floor (pale
 *   slabs down the middle, a laterite kerb each side with a thin warm glow strip along its inner edge, as the
 *   map's glowing road), from the gate's face 36 m south, across the back trail; the link of pavers (glow strips
 *   along it) where the lantern walk comes in from the Kulen foot trail and turns north under the arch. Khmer lamps on both kerbs every 4.5 m (6.75 m on low; none
 *   on a trail's tread or the branch), fire bowls on stone stems by the gate and by the welcome arch. Between the
 *   lamps and 6 m out stays free (flower beds: the garden's); the flags stand there on slim poles (`_sqFlags.ts`).
 * - The welcome arch over the avenue just past the turn (`welcomeArch`): two sandstone pillars, a lintel, a small Angkor tower
 *   over its middle (corbelled tiers, the gilt lotus bud), a lacquer-red board with "សូមស្វាគមន៍" (welcome) and
 *   "ឆ្នាំថ្មី" with the year in Khmer numerals (clock.ts `NYE_YEAR`) in gold Koulen pixel letters on its south face.
 *
 * The pavers go into the floor's builder (kept out of the walk map, no shadow), everything else into the walk's
 * (stone): no draw of their own.
 */

/** The avenue: its middle line `x`, from the gate's face `z0` south to `z1`, `w` m of pavers between the kerbs. */
export const AVENUE = { x: GATE.x, z0: GATE.z + 2.75, z1: GATE.z + 38.5, w: 4.6 } as const;
/** The welcome arch across the avenue just north of where the lantern walk turns into it (its middle, m). */
export const ARCH = { x: AVENUE.x, z: AVENUE.z1 - 5.2 } as const;
/**
 * The link: the lantern walk's stretch west from the Kulen foot trail into the avenue's south end (plan.ts
 * `LANTERN_WALK`: its point before the avenue's corner, to the avenue's east kerb at the corner's z).
 */
const LINK_FROM = LANTERN_WALK[LANTERN_WALK.length - 3];
const LINK_Z = LANTERN_WALK[LANTERN_WALK.length - 2][1];
const BRANCH: readonly [[number, number], [number, number]] = [
  [LINK_FROM[0], LINK_FROM[1]],
  [AVENUE.x + AVENUE.w / 2, LINK_Z],
];
/** Lamps along the kerbs stand this far from the avenue's middle (m); flags farther out (`_sqFlags.ts`). */
export const KERB_LAMP = AVENUE.w / 2 + 0.55;

/** On the avenue or its kerbs (with a margin m), between the gate and the arch. */
export function onAvenue(x: number, z: number, margin = 0): boolean {
  return Math.abs(x - AVENUE.x) <= AVENUE.w / 2 + 0.35 + margin && z >= AVENUE.z0 - margin && z <= AVENUE.z1 + margin;
}

/** Distance (m) from (x, z) to the branch's line. */
function toBranch(x: number, z: number): number {
  const [[ax, az], [bx, bz]] = BRANCH;
  const dx = bx - ax;
  const dz = bz - az;
  const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - ax - dx * u, z - az - dz * u);
}

/**
 * The lantern walk's lamps. `step` is the far spacing's base (m: 11, 14 on low): `step` × 0.6 in the last 60 m to
 * the gate, `step` × 1.25 before. Returns where the lamps stand (map x, z), for the culling groups.
 */
export function layLanternWalk(b: VoxelBuilder, field: HeightField, lamps: Lamps, glow: Glow | null, step: number): [number, number][] {
  const src = traceSource();
  const out: [number, number][] = [];
  // (the line's length so far at each point)
  const pts = LANTERN_WALK;
  const acc: number[] = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = acc[acc.length - 1];
  const at = (s: number): [number, number, number, number] => {
    let i = 1;
    while (i < pts.length - 1 && acc[i] < s) i++;
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const L = acc[i] - acc[i - 1];
    const u = Math.min(1, Math.max(0, (s - acc[i - 1]) / L));
    return [ax + (bx - ax) * u, az + (bz - az) * u, (bx - ax) / L, (bz - az) / L];
  };
  const ok = (x: number, z: number): boolean => {
    if (!groundOk(field, x, z)) return false;
    if (onSquare(x, z, 2) || Math.hypot(x - GATE.x, z - GATE.z) < 9) return false;
    // (none on the avenue, its lamps' line or its flags', nor on the branch)
    if (onAvenue(x, z, 4.5) || toBranch(x, z) < 2.4) return false;
    return true;
  };
  const near = 60;
  const end = total - 6;
  let s = 0;
  let q = 0;
  while (s <= end) {
    const [cx, cz, tx, tz] = at(s);
    for (const side of [-1, 1]) {
      for (const d of [2.6, 3.1, 3.7, 4.4, 5.2]) {
        const x = cx - tz * side * d;
        const z = cz + tx * side * d;
        if (!ok(x, z)) continue;
        khmerLamp(b, x, field.heightAt(x, z), z, 1.3, q * 2 + (side > 0 ? 1 : 0), src, lamps, glow);
        field.occupy(x - 0.6, z - 0.6, x + 0.6, z + 0.6);
        out.push([x, z]);
        break;
      }
    }
    q++;
    s += total - s < near ? step * 0.6 : step * 1.25;
  }
  return out;
}

/** Ground a post can stand on: off a trail's tread, water, a lip, anything built and the places kept clear. */
export function groundOk(field: HeightField, x: number, z: number, occupied: ArrayLike<number> = field.occupied): boolean {
  const c = field.index(x, z);
  if (c < 0 || field.trail[c] === 2 || occupied[c] || field.waterAt(x, z) !== null || field.dropAt(x, z) > 1.2) return false;
  if (onNurseryLot(x, z, 2) || Math.hypot(x - HOME_AT.x, z - HOME_AT.z) < 9 || Math.hypot(x - TRADER_AT.x, z - TRADER_AT.z) < 10) return false;
  // (the ground round its plinth as level as a man would set it)
  const g = field.heightAt(x, z);
  return Math.abs(field.heightAt(x + 0.6, z) - g) < 0.6 && Math.abs(field.heightAt(x, z + 0.6) - g) < 0.6;
}

export interface AvenueOut {
  /** Lamps and fire bowls (map x, z). */
  lights: [number, number][];
  /** Ground free for a post by the avenue: as `groundOk`, but within 3.9 m of its middle only the land counts (its own posts never crowd each other out of a 2 m cell). */
  free(x: number, z: number): boolean;
  /** Blocks laid: pavers (the floor's builder), the rest (the walk's). */
  pavers: number;
  blocks: number;
}

/**
 * The avenue, its lamps, fire bowls and the welcome arch. `fb`: the floor's builder (pavers), `b`: the walk's
 * (stone). `glowStrip`: the warm strips along the kerbs (a soft lamp kind, `square.ts`'s bulbs).
 */
export function layAvenue(fb: VoxelBuilder, b: VoxelBuilder, field: HeightField, lamps: Lamps, glowStrip: Lamps, glow: Glow | null, low: boolean): AvenueOut {
  const src = traceSource();
  // (the avenue's strip, 3.9 m each side of its middle, is its own: the garden's beds and the square's lights keep
  // out of it, though their 2 m cells of `occupied` may reach in; so its posts check the land only)
  const before = field.occupied.slice();
  const none = { length: 0 } as ArrayLike<number>;
  const free = (x: number, z: number) => Math.abs(x - AVENUE.x) < 3.9 ? groundOk(field, x, z, none) : groundOk(field, x, z, before);
  const p0 = fb.boxes.length;
  const b0 = b.boxes.length;
  const { x: ax, z0, z1, w } = AVENUE;
  const half = w / 2;
  // ── Pavers: five slabs across (the middle three pale), 1 m courses, a laterite kerb each side ──
  const cols = 5;
  const cw = w / cols;
  for (let z = z0 + 0.5; z < z1; z += 1) {
    for (let i = 0; i < cols; i++) {
      const x = ax - half + cw * (i + 0.5);
      const g = field.heightAt(x, z);
      const mid = i > 0 && i < cols - 1;
      const color = pick(mid ? PAVER_LIGHT : PAVER, x, z, 3, 72);
      fb.box(x, g + TOP - 0.15, z, cw - 0.04, 0.3, 0.96, color, 'mapStone', { src, shade: 0.95 + 0.08 * hash3(x, z, 5, 72) });
    }
    for (const sd of [-1, 1]) {
      const x = ax + sd * (half + 0.2);
      const g = field.heightAt(x, z);
      fb.box(x, g + TOP - 0.1, z, 0.4, 0.36, 1, pick(LATERITE, x, z, 4, 72), 'mapStone', { src, shade: 0.94 });
    }
  }
  // The glow strips on the kerbs' inner edges (in 4 m lengths, each on its own ground).
  for (const sd of [-1, 1])
    for (let z = z0; z < z1 - 0.5; z += 4) {
      const len = Math.min(4, z1 - z);
      const x = ax + sd * (half + 0.02);
      const g = field.heightAt(x, z + len / 2);
      glowStrip.strip([x, g + TOP + 0.1, z + len / 2], len - 0.1, 0.07, 0.04, Math.PI / 2, 0.55);
    }
  // The link from the lantern walk, 2.8 m wide, slabs turned along it, a glow strip each side.
  {
    const [[bx0, bz0], [bx1, bz1]] = BRANCH;
    const L = Math.hypot(bx1 - bx0, bz1 - bz0);
    const tx = (bx1 - bx0) / L;
    const tz = (bz1 - bz0) / L;
    const ry = Math.atan2(tx, tz);
    for (let s = 0.5; s < L + 0.6; s += 1)
      for (const o of [-0.95, 0, 0.95]) {
        const x = bx0 + tx * s - tz * o;
        const z = bz0 + tz * s + tx * o;
        if (onAvenue(x, z, -0.1)) continue;
        const c = field.index(x, z);
        if (c < 0 || before[c] || field.waterAt(x, z) !== null) continue;
        fb.box(x, field.heightAt(x, z) + TOP - 0.15, z, 0.92, 0.3, 0.98, pick(o === 0 ? PAVER_LIGHT : PAVER, x, z, 6, 72), 'mapStone', { src, shade: 0.93 + 0.08 * hash3(x, z, 7, 72), ry });
      }
    for (const sd of [-1, 1])
      for (let s = 0; s < L - 0.5; s += 4) {
        const len = Math.min(4, L - s);
        const m = s + len / 2;
        const x = bx0 + tx * m - tz * sd * 1.45;
        const z = bz0 + tz * m + tx * sd * 1.45;
        glowStrip.strip([x, field.heightAt(x, z) + TOP + 0.04, z], len - 0.1, 0.07, 0.04, ry + Math.PI / 2, 0.55);
      }
  }

  const lights: [number, number][] = [];
  // ── Khmer lamps on both kerbs ──
  const every = low ? 6.75 : 4.5;
  let q = 0;
  for (let z = z0 + 2.2; z < ARCH.z - 1.5; z += every, q++)
    for (const sd of [-1, 1]) {
      const x = ax + sd * KERB_LAMP;
      if (!free(x, z) || toBranch(x, z) < 2.2) continue;
      khmerLamp(b, x, field.heightAt(x, z), z, 1.45, 300 + q * 2 + (sd > 0 ? 1 : 0), src, lamps, glow, 2.1);
      field.occupy(x - 0.5, z - 0.5, x + 0.5, z + 0.5);
      lights.push([x, z]);
    }
  // ── Fire bowls: either side of the gate's face, and before the arch's pillars ──
  for (const [x, z, k] of [
    [ax - half - 1.6, z0 + 0.9, 1.2],
    [ax + half + 1.6, z0 + 0.9, 1.2],
    [ARCH.x - 4.6, ARCH.z + 0.6, 1],
    [ARCH.x + 4.6, ARCH.z + 0.6, 1],
  ] as const) {
    fireBowl(b, field, x, z, k, src, lamps, glow, low);
    lights.push([x, z]);
  }
  welcomeArch(b, field, src, lamps, glow);
  return { lights, free, pavers: fb.boxes.length - p0, blocks: b.boxes.length - b0 };
}

const BRONZE = [0x5c4430, 0x523c2a, 0x664c36];

/** A fire bowl on a stone stem (its foot on the land at x, z; `k` its size): a bronze bowl, its fire's heart and tongues. */
export function fireBowl(b: VoxelBuilder, field: HeightField, x: number, z: number, k: number, src: SourceTrace | undefined, lamps: Lamps, glow: Glow | null, low: boolean): void {
  const y = field.heightAt(x, z);
  const st = (i: number) => pick(POST_STONE, x, z, i, 81);
  b.box(x, y + 0.1 * k, z, 0.7 * k, 0.3 * k, 0.7 * k, pick(LATERITE, x, z, 1, 81), 'mapStone', { src, shade: 0.95 });
  b.box(x, y + 0.3 * k, z, 0.52 * k, 0.12 * k, 0.52 * k, st(2), 'mapStone', { src });
  b.box(x, y + 0.8 * k, z, 0.28 * k, 0.9 * k, 0.28 * k, st(3), 'mapStone', { src });
  b.box(x, y + 1.29 * k, z, 0.44 * k, 0.1 * k, 0.44 * k, st(4), 'mapStone', { src, shade: 1.05 });
  b.box(x, y + 1.42 * k, z, 0.62 * k, 0.16 * k, 0.62 * k, pick(BRONZE, x, z, 5, 81), 'mapStone', { src, shade: 0.9 });
  b.box(x, y + 1.54 * k, z, 0.76 * k, 0.1 * k, 0.76 * k, pick(BRONZE, x, z, 6, 81), 'mapStone', { src, shade: 0.95 });
  const fy = y + 1.6 * k;
  lamps.add([x, fy + 0.16 * k, z], 0.5 * k, 1.5);
  lamps.add([x + 0.05, fy + 0.46 * k, z - 0.03], 0.26 * k, 1.8);
  glow?.add(x, fy + 0.4 * k, z, LAMP_HALO, low ? 3 : 3.6 * k, { level: 1.1 });
  field.occupy(x - 0.5 * k, z - 0.5 * k, x + 0.5 * k, z + 0.5 * k);
}

// ── The welcome arch ────────────────────────────────────────────────────────

/** "សូមស្វាគមន៍" (welcome) as Koulen draws it at 20 px, one character a pixel (`#` paint). */
const WELCOME = [
  '.........................................................................................###',
  '...................................................................................#########',
  '...................................................................................###......',
  '...................................................................................#####....',
  '............................................................................................',
  '............................................................................................',
  '..#######....####...###...###.....#######....#########...##########....###...###...########.',
  '.########....####..####..####....########....##########..##########...####..####...#########',
  '.###........###....##....##......###........###....####...............##....##....####..####',
  '.###........###...###....###.....###........###....####..............###....###...####...###',
  '.########....###...###...####....########....###...####...########....###...####..####..####',
  '.#########...####..####...###....#########...####..####...#########...####...###...###..####',
  '####..####...####..####..####...####..####...####..####..####..####...####..####...####.....',
  '####...###...####..##########...####...###...####..####..####...###...##########....#####...',
  '####...###...####..##########...####...###...####..####..####...###...##########......######',
  '####...###...####..####...###...####...###...####..####..####...###...####...###..####...###',
  '####...###...####..####...###...####...###...####..####..######.###...####...###..####...###',
  '####...###...####..####...###...####...###...####..####..######.###...####...###..######.###',
  '####...####..####..####..####...####...####..####..####..#####..###...####..####..##########',
  '#####..#########....#########...#####..#########...####..#####..###....#########..##########',
  '#####...########....########....#####...########...####..####...###....########...####..####',
  '............................................................................................',
  '..........##..###...........................####............................................',
  '..........##..###.........................######............................................',
  '..........##..###......................#####.###............................................',
  '..........##..###......................###..###.............................................',
  '..........#######.......................######..............................................',
  '...........#####............................................................................',
];
const NEW_YEAR = [
  '...........###.................',
  '..........#####..............#.',
  '..........######.......#####.##',
  '..........######......#########',
  '..........#####.......##....###',
  '...........###........#########',
  '...............................',
  '...........................###.',
  '..#########.#####....#########.',
  '.##########.######..##########.',
  '.##...........####..##.........',
  '###...........####.###.........',
  '.###...####...####..###...####.',
  '.####..####...####..####..####.',
  '.####..####...####..####..####.',
  '.####...###...####..####...###.',
  '.####...###...####..####...###.',
  '.####...###...####..####...###.',
  '######..###...####..####...###.',
  '#######.###...####..####...###.',
  '.##########...####..####..####.',
  '.####.#####...####...#########.',
  '.####..####...####...########..',
  '...............................',
  '........###.................###',
  '..##########................##.',
  '..###..####.........##########.',
  '..##########........###########',
  '........####................###',
];
/** The Khmer digits ០‥៩, one baseline: rows top to bottom. */
const DIGITS = [
  ['..........', '..........', '..........', '..........', '.########.', '.#########', '####..####', '####...###', '####...###', '####...###', '####...###', '####...###', '####...###', '####...###', '####...###', '####...###', '####..####', '.#########', '.########.'],
  ['..........', '..........', '..........', '..........', '.########.', '.#########', '####..####', '####...###', '####...###', '####...###', '####...###', '#####..###', '#####..###', '.......###', '.......###', '.......###', '......####', '...#######', '...######.'],
  ['...............', '...............', '#####..........', '#####..........', '.####.####.####', '.####.#########', '.####.#########', '.####.###..####', '.####.###..####', '.####.####.####', '.####.####.####', '.####......####', '.####......####', '.####......####', '.####......####', '.####......####', '.####......####', '..############.', '..############.'],
  ['.................', '.................', '.................', '.................', '.###############.', '.###############.', '####..#####..####', '####...###...####', '####...###...####', '####...###...####', '####...###...####', '####...###...####', '####...###...####', '####...###...####', '####...###...####', '####...###...####', '####...###...####', '#####..###...####', '#####..###...####'],
  ['...........', '...........', '#####......', '#####......', '.####......', '.####......', '.####......', '.####......', '.####......', '.####..####', '.####.#####', '.####.####.', '.####.####.', '.####.####.', '.####.####.', '.####..###.', '.####...###', '..#########', '..#########'],
  ['..........', '..........', '.......###', '####...###', '####...###', '.#########', '.#########', '.###......', '####......', '####..####', '####.#####', '####.####.', '####.####.', '####.####.', '####.####.', '####..###.', '####...###', '.#########', '.#########'],
  ['####......', '####......', '####......', '####......', '#########.', '##########', '####..####', '.......###', '.......###', '.......###', '.####..###', '.####..###', '####...###', '####...###', '####...###', '####...###', '####..####', '.#########', '.########.'],
  ['...............', '............###', '............###', '............###', '####..####..###', '##########..###', '##########..###', '######.###..###', '####...###..###', '####...###..###', '####...###..###', '####...###..###', '####...###..###', '####...###..###', '####...###..###', '####...###..###', '####...########', '#####..########', '#####...######.'],
  ['.......###', '.......###', '.......###', '.......###', '.#########', '.#########', '####..####', '####......', '####......', '####......', '####.#####', '####.#####', '####...###', '####...###', '####...###', '######.###', '##########', '##########', '####..####'],
  ['.......###', '.......###', '.......###', '.......###', '.#########', '.#########', '####..####', '####......', '.####.....', '.########.', '.########.', '####......', '####......', '####.#####', '####.#####', '####..####', '####..####', '.#########', '.#########'],
];
/** The digits' top row in NEW_YEAR's rows (they sit on its letters' baseline). */
const DIGIT_TOP = 4;

/** Paint rows as rectangles (c0, c1, r0, r1): runs along a row, grown down while the rows below repeat them. */
function rects(rows: readonly string[]): [number, number, number, number][] {
  const H = rows.length;
  const W = Math.max(...rows.map((r) => r.length));
  const at = (r: number, c: number) => rows[r][c] === '#';
  const used = rows.map(() => new Array<boolean>(W).fill(false));
  const out: [number, number, number, number][] = [];
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      if (!at(r, c) || used[r][c]) continue;
      let c1 = c;
      while (c1 + 1 < W && at(r, c1 + 1) && !used[r][c1 + 1]) c1++;
      let r1 = r;
      const same = (row: number) => {
        for (let k = c; k <= c1; k++) if (!at(row, k) || used[row][k]) return false;
        return (c === 0 || !at(row, c - 1) || used[row][c - 1]) && (c1 === W - 1 || !at(row, c1 + 1) || used[row][c1 + 1]);
      };
      while (r1 + 1 < H && same(r1 + 1)) r1++;
      for (let rr = r; rr <= r1; rr++) for (let k = c; k <= c1; k++) used[rr][k] = true;
      out.push([c, c1, r, r1]);
    }
  return out;
}

/** "ឆ្នាំថ្មី ២០២៧": the words, a space, the year's digits (from `NYE_YEAR`, never written here) on their baseline. */
function newYearLine(): string[] {
  const digits = String(NYE_YEAR)
    .split('')
    .map((d) => DIGITS[Number(d)]);
  const rows = NEW_YEAR.map((r) => r + '......');
  for (const g of digits) {
    const w = g[0].length;
    for (let r = 0; r < rows.length; r++) {
      const gr = r - DIGIT_TOP;
      rows[r] += (gr >= 0 && gr < g.length ? g[gr] : '.'.repeat(w)) + '..';
    }
  }
  return rows;
}

/** The words on a board facing +z at `z` (its front face), centred on (x, y), `px` m a pixel, raised a little. */
function boardWords(b: VoxelBuilder, rows: readonly string[], x: number, y: number, z: number, px: number, color: number, src: SourceTrace | undefined): void {
  const W = Math.max(...rows.map((r) => r.length)) * px;
  const H = rows.length * px;
  for (const [c0, c1, r0, r1] of rects(rows)) {
    const u = ((c0 + c1 + 1) / 2) * px - W / 2;
    const v = H / 2 - ((r0 + r1 + 1) / 2) * px;
    b.box(x + u, y + v, z + 0.02, (c1 - c0 + 1) * px, (r1 - r0 + 1) * px, 0.04, color, 'mapStone', { src, shade: 1.1 });
  }
}

/** Arch sandstone (the gate's warm Kulen stone) and the board's lacquer. */
const ARCH_STONE = [0xb4a68d, 0xac9e85, 0xbcae95, 0xa69882];
const ARCH_DARK = [0x8a7d68, 0x82755f, 0x908370];
const LACQUER = 0x8e1a1e;

/**
 * The welcome arch over the avenue's start, facing south (the way people come): two square sandstone pillars on
 * laterite plinths, capitals, a lintel with a cornice; over its middle a small Angkor tower (corbelled tiers, corner
 * buds, the gilt lotus bud), smaller buds on the pillars; under the lintel the lacquer-red board with its gold rim
 * and the words. Khmer (a gopura's lintel and tower), never a Chinese paifang (no sweeping tiled roofs).
 */
function welcomeArch(b: VoxelBuilder, field: HeightField, src: SourceTrace | undefined, lamps: Lamps, glow: Glow | null): void {
  const { x: cx, z } = ARCH;
  const g = Math.min(field.heightAt(cx - 3.4, z), field.heightAt(cx + 3.4, z), field.heightAt(cx, z));
  const st = (i: number, a = 0) => pick(ARCH_STONE, i, a, 3, 91);
  const dk = (i: number) => pick(ARCH_DARK, i, 1, 4, 91);
  const span = 6.6;
  const ph = 4.4;
  // Pillars.
  for (const sd of [-1, 1]) {
    const x = cx + sd * span / 2;
    const gy = field.heightAt(x, z);
    b.box(x, gy + 0.05, z, 1.3, 0.5, 1.3, pick(LATERITE, x, z, 1, 91), 'mapStone', { src, shade: 0.95 });
    b.box(x, gy + 0.38, z, 1.1, 0.18, 1.1, st(1, sd), 'mapStone', { src, shade: 1.04 });
    b.box(x, (gy + 0.47 + g + ph) / 2, z, 0.82, g + ph - gy - 0.47, 0.82, st(2, sd), 'mapStone', { src });
    // (carved bands on the shaft: a darker course every metre)
    for (let k = 1; k <= 3; k++) b.box(x, gy + 0.47 + k * 1.0, z, 0.86, 0.1, 0.86, dk(k + sd), 'mapStone', { src });
    b.box(x, g + ph + 0.08, z, 1.04, 0.16, 1.04, st(3, sd), 'mapStone', { src, shade: 1.05 });
    // Small bud on each pillar, over the cornice.
    b.box(x, g + ph + 1.36, z, 0.5, 0.2, 0.5, st(4, sd), 'mapStone', { src });
    b.box(x, g + ph + 1.54, z, 0.32, 0.16, 0.32, st(5, sd), 'mapStone', { src, shade: 1.04 });
    b.box(x, g + ph + 1.7, z, 0.14, 0.18, 0.14, pick(GOLD, x, z, 6, 91), 'mapStone', { src, shade: 1.08 });
    field.occupy(x - 0.7, z - 0.7, x + 0.7, z + 0.7);
  }
  // Lintel and cornice across.
  const y0 = g + ph + 0.16;
  b.box(cx, y0 + 0.4, z, span + 1.2, 0.8, 0.9, st(6), 'mapStone', { src });
  b.box(cx, y0 + 0.85, z, span + 1.5, 0.12, 1.1, st(7), 'mapStone', { src, shade: 1.05 });
  b.box(cx, y0 + 1.0, z, span + 1.2, 0.18, 0.95, dk(8), 'mapStone', { src });
  // (a carved band down the lintel's faces: lighter stone with dark dots, a kbach's rhythm)
  for (let i = -6; i <= 6; i++)
    for (const f of [-1, 1]) b.box(cx + i * 0.55, y0 + 0.42, z + f * 0.46, 0.22, 0.22, 0.04, pick(ARCH_DARK, i, f, 9, 91), 'mapStone', { src, shade: 0.92 });
  // The tower over the middle: a base, tiers drawing in, buds at the lower tiers' corners, the gilt lotus bud.
  let ty = y0 + 1.09;
  const tiers: [number, number][] = [
    [1.9, 0.5],
    [1.55, 0.42],
    [1.2, 0.38],
    [0.9, 0.34],
    [0.62, 0.3],
  ];
  for (const [k, [w, h]] of tiers.entries()) {
    b.box(cx, ty + h / 2, z, w, h, Math.min(w, 1.3), k % 2 ? dk(10 + k) : st(10 + k), 'mapStone', { src, shade: 1 + k * 0.02 });
    if (k < 3)
      for (const sd of [-1, 1]) b.box(cx + sd * (w / 2 - 0.08), ty + h + 0.1, z, 0.2, 0.2, 0.2, st(20 + k, sd), 'mapStone', { src, shade: 1.06 });
    ty += h;
  }
  b.box(cx, ty + 0.18, z, 0.36, 0.36, 0.36, st(30), 'mapStone', { src, shade: 1.05 });
  b.box(cx, ty + 0.46, z, 0.2, 0.22, 0.2, pick(GOLD, cx, z, 31, 91), 'mapStone', { src, shade: 1.1 });
  b.box(cx, ty + 0.66, z, 0.08, 0.2, 0.08, pick(GOLD, cx, z, 32, 91), 'mapStone', { src, shade: 1.12 });
  // The board under the lintel: a gold rim round the lacquer, the words on its south face.
  const bw = 5.2;
  const bh = 2.0;
  const by = y0 - bh / 2 - 0.02;
  b.box(cx, by, z, bw + 0.16, bh + 0.16, 0.14, pick(GOLD, cx, z, 40, 91), 'mapStone', { src, shade: 0.98 });
  b.box(cx, by, z + 0.01, bw, bh, 0.16, LACQUER, 'mapStone', { src });
  const front = z + 0.09;
  const px = 0.04;
  boardWords(b, WELCOME, cx, by + 0.4, front, px, 0xf2c04c, src);
  boardWords(b, newYearLine(), cx, by - 0.52, front, 0.027, 0xf6e6b8, src);
  // Two little lamps hung under the lintel, either side of the board: they light the words.
  for (const sd of [-1, 1]) {
    const x = cx + sd * (bw / 2 + 0.42);
    b.box(x, y0 - 0.25, z, 0.03, 0.5, 0.03, 0x2a2420, 'mapStone', { src });
    b.box(x, y0 - 0.55, z, 0.26, 0.06, 0.26, pick(GOLD, x, z, 41, 91), 'mapStone', { src });
    b.box(x, y0 - 0.95, z, 0.26, 0.06, 0.26, pick(GOLD, x, z, 42, 91), 'mapStone', { src });
    lamps.add([x, y0 - 0.75, z], 0.22, 1.2);
    glow?.add(x, y0 - 0.75, z + 0.3, LAMP_HALO, 2.2, { level: 0.9 });
  }
}
