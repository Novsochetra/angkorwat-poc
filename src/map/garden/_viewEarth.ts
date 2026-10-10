import { Color } from 'three';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { KINDS, type PlantKindId, type Stage } from './kinds';
import { packBlocks, type Blocks } from './_viewLook';

/**
 * The earth he works round each plant (garden/view.ts draws it under the
 * plant's model): a crop's dug bed, a raised square of crumbly dark earth a
 * hand high with a few clods on it and crumbs at its foot, as big as the crop
 * needs room (`KINDS[kind].room`); a tree's watering basin, a low ring bank of
 * earth round its foot with a dished floor inside, as Cambodian growers make
 * them round a young fruit tree, wider as the tree grows. A bed follows the
 * map's grid (the land's 2 m blocks and the house): beds in rows stay square
 * to it.
 *
 * On the land exactly: the plant stands where the walk map's ground is
 * (`groundAt`: the top of the land's block, or of a paved floor); a bed or a
 * basin that would reach over the edge of a terrace (or into the foot of the
 * next one up) is cut back short of it.
 *
 * Its colour follows the water in it (`tint`): dry, pale dusty brown; damp,
 * darker; just watered, dark and wet, its top catching a cool sheen; in a
 * basin a little puddle stands (`puddle`, scaled by how much water is still
 * standing). The map's own families: the earth `mapRock`, the puddle `mapStone`.
 */

export interface Earth {
  /** The earth's blocks (local, from the plant's foot on the ground; not turned). */
  readonly rock: Blocks;
  /** Each block's colour dry, damp and wet (linear), and the blocks on top (they catch the wet sheen). */
  readonly dry: Float32Array;
  readonly damp: Float32Array;
  readonly wet: Float32Array;
  readonly top: Uint8Array;
  /** The puddle in a basin (null for a bed): its blocks scale with the water standing. */
  readonly puddle: Blocks | null;
  /** Where the plant's foot stands, over the ground (m): on the bed's top, on the basin's floor. */
  readonly foot: number;
  /** Its reach from the plant (m), for the bounds. */
  readonly reach: number;
}

/** The earth's tones (sRGB): dry, damp, wet. */
const TONES = {
  bed: [0x9c7650, 0x6e4e36, 0x4a3326],
  mound: [0xa67f57, 0x76543a, 0x4f3628],
  crumb: [0xb08b63, 0x80603f, 0x5a4130],
  bank: [0xa07a53, 0x725238, 0x4c3527],
  floor: [0x92704b, 0x664a31, 0x412e21],
} as const;
type Role = keyof typeof TONES;
/** The wet top's cool sheen (sRGB) and how much of it shows at its wettest. */
const SHEEN = 0x6e6a66;
const SHEEN_K = 0.32;
/** The puddle: muddy water with the sky in it (sRGB). */
const PUDDLE = [0x667075, 0x7a868b] as const;

const _c = new Color();

/** How far from (x, z) along (dx, dz) the ground stays at `y` (m, at most `max`): a terrace's edge or foot cuts it. */
function reachOn(groundAt: (x: number, z: number) => number, x: number, z: number, y: number, dx: number, dz: number, max: number): number {
  for (let t = 0.1; t <= max + 1e-6; t += 0.1) if (Math.abs(groundAt(x + dx * t, z + dz * t) - y) > 0.06) return Math.max(0.2, t - 0.1);
  return max;
}

/** The earth round a plant of `kind` at `stage` (its seed varies the clods), standing at (x, y, z) on the map. */
export function buildEarth(kind: PlantKindId, stage: Stage, seed: number, x: number, y: number, z: number, groundAt: (x: number, z: number) => number): Earth {
  const k = KINDS[kind];
  const b = new VoxelBuilder();
  const roles: Role[] = [];
  const tops: number[] = [];
  const jit: number[] = [];
  const s = Math.floor(seed * 9973);
  const r = (i: number, j = 0) => hash3(s, i, j, 7151);
  const add = (role: Role, top: boolean, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, ry = 0) => {
    b.box(cx, cy, cz, sx, sy, sz, TONES[role][0], 'mapRock', ry ? { ry } : {});
    roles.push(role);
    tops.push(top ? 1 : 0);
    jit.push(0.93 + 0.14 * r(roles.length, 3));
  };
  const puddle = new VoxelBuilder();
  let foot: number;
  let reach: number;
  if (k.size === 'crop') {
    // A dug bed, square to the map; cut back at a terrace's edge.
    const half = Math.min(0.85, Math.max(0.45, k.room * 0.75));
    const cut = (dx: number, dz: number) => {
      let m = half;
      for (const o of [-0.8, 0, 0.8]) m = Math.min(m, reachOn(groundAt, x + dz * o * half, z + dx * o * half, y, dx, dz, half));
      return m;
    };
    const xp = cut(1, 0);
    const xn = cut(-1, 0);
    const zp = cut(0, 1);
    const zn = cut(0, -1);
    const cx = (xp - xn) / 2;
    const cz = (zp - zn) / 2;
    const w = xp + xn;
    const d = zp + zn;
    // A mound in three steps (voxel-round): the bed a little into the ground (no seam with the grass), its
    // shoulder, its crown where the plant stands.
    // Each step two blocks across each other, its corners cut (voxel-round), a hand's breadth off true; the second
    // a centimetre lower (no two tops in one plane: they would shimmer far off).
    const step = (role: Role, top: boolean, y0: number, h: number, inset: number, cut: number, j: number) => {
      const dx = (r(j, 60) - 0.5) * 0.04;
      const dz = (r(j, 61) - 0.5) * 0.04;
      add(role, top, cx + dx, y0 + h / 2, cz + dz, w - inset * 2, h, d - inset * 2 - cut * 2);
      add(role, top, cx - dx, y0 + h / 2 - 0.012, cz - dz, w - inset * 2 - cut * 2, h, d - inset * 2);
    };
    step('bed', false, -0.04, 0.11, 0, 0.06, 1);
    step('mound', true, 0.06, 0.06, 0.07 + 0.03 * r(2, 62), 0.1, 2);
    foot = 0.12;
    // Crumbs at its foot and on its shoulder, one or two a side.
    let i = 0;
    for (const [ex, ez, len] of [
      [1, 0, d],
      [-1, 0, d],
      [0, 1, w],
      [0, -1, w],
    ] as const) {
      const n = 1 + Math.floor(r(i++, 1) * 2);
      for (let j = 0; j < n; j++) {
        const sz = 0.05 + 0.035 * r(i, j + 10);
        const along = (r(i, j + 20) - 0.5) * (len - 0.3);
        const out = r(i, j + 25) < 0.5 ? 0.02 : -0.1;
        const px = ex ? (ex > 0 ? xp : -xn) + ex * out : cx + along;
        const pz = ez ? (ez > 0 ? zp : -zn) + ez * out : cz + along;
        add('crumb', out < 0, px, out < 0 ? 0.07 + sz * 0.2 : sz * 0.2, pz, sz * 1.15, sz * 0.75, sz, r(i, j + 30) * Math.PI);
      }
    }
    // Clods on the crown, clear of the stem.
    const clods = 2 + Math.floor(r(9, 2) * 3);
    for (let j = 0; j < clods; j++) {
      const sz = 0.05 + 0.04 * r(j, 40);
      let px = cx + (r(j, 41) - 0.5) * (w - 0.4);
      let pz = cz + (r(j, 42) - 0.5) * (d - 0.4);
      if (Math.hypot(px, pz) < 0.18) {
        const a = r(j, 43) * Math.PI * 2;
        px = Math.cos(a) * 0.22;
        pz = Math.sin(a) * 0.22;
      }
      add('crumb', true, px, foot + sz * 0.15, pz, sz * 1.2, sz * 0.7, sz, r(j, 44) * Math.PI);
    }
    reach = Math.hypot(Math.max(xp, xn), Math.max(zp, zn)) + 0.1;
  } else {
    // A watering basin: a low ring bank round the foot, wider as the tree grows, cut back at a terrace's edge.
    const grown = Math.min(1.35, 0.75 + k.trunk * 1.1);
    let R = [0.42, 0.5, 0.62, 0.75, grown][stage];
    let room = R + 0.15;
    for (let a = 0; a < 8; a++) room = Math.min(room, reachOn(groundAt, x, z, y, Math.cos((a * Math.PI) / 4), Math.sin((a * Math.PI) / 4), R + 0.15));
    R = Math.max(0.3, Math.min(R, room - 0.12));
    const n = Math.max(8, Math.round((2 * Math.PI * R) / 0.27));
    const turn = r(1, 50) * Math.PI;
    for (let j = 0; j < n; j++) {
      const a = turn + (j / n) * Math.PI * 2;
      const h = 0.1 + 0.04 * r(j, 51);
      const rr = R + (r(j, 52) - 0.5) * 0.05;
      add('bank', true, Math.cos(a) * rr, h / 2 - 0.01, Math.sin(a) * rr, ((2 * Math.PI * R) / n) * 1.18, h, 0.2 + 0.05 * r(j, 53), -a + Math.PI / 2);
    }
    // The dished floor inside (two squares across each other: round enough), damp under the tree.
    const f = 2 * (R - 0.08) * 0.86;
    add('floor', true, 0, 0.005, 0, f, 0.04, f, turn);
    add('floor', true, 0, -0.007, 0, f, 0.04, f, turn + Math.PI / 4);
    foot = 0.025;
    // A clod or two on the bank.
    for (let j = 0; j < 2; j++) {
      const a = r(j, 54) * Math.PI * 2;
      const sz = 0.07 + 0.04 * r(j, 55);
      add('crumb', true, Math.cos(a) * R, 0.13, Math.sin(a) * R, sz * 1.2, sz * 0.8, sz, a);
    }
    // The puddle: water standing in the dish after a watering (it soaks in).
    const p = 2 * (R - 0.14) * 0.72;
    // (its layers a centimetre apart: no two tops in one plane)
    puddle.box(0, 0.038, 0, p, 0.012, p, PUDDLE[0], 'mapStone', { ry: turn + 0.2 });
    puddle.box(0, 0.026, 0, p, 0.012, p, PUDDLE[0], 'mapStone', { ry: turn + 0.2 + Math.PI / 4 });
    puddle.box(p * 0.12, 0.048, -p * 0.1, p * 0.42, 0.012, p * 0.2, PUDDLE[1], 'mapStone', { ry: turn + 0.6 });
    reach = R + 0.15;
  }
  const rock = packBlocks('mapRock', b.boxes);
  const set = (soil: 0 | 1 | 2) => {
    const out = new Float32Array(rock.n * 3);
    for (let i = 0; i < rock.n; i++) {
      _c.setHex(TONES[roles[i]][soil]).multiplyScalar(jit[i]);
      _c.toArray(out, i * 3);
    }
    return out;
  };
  const dry = set(0);
  const damp = set(1);
  const wet = set(2);
  rock.c.set(dry);
  return {
    rock,
    dry,
    damp,
    wet,
    top: Uint8Array.from(tops),
    puddle: puddle.boxes.length ? packBlocks('mapStone', puddle.boxes) : null,
    foot,
    reach,
  };
}

/** How wet its earth looks (0 dry ‥ 1 just watered) for the water in it (garden/state.ts `Plant.wet`). */
export const wetLook = (wet: number): number => Math.min(1, Math.max(0, (wet - 0.08) / 0.78));
/** How much water stands in a basin (0‥1): only just after a watering or in the rain, soaking in. */
export const puddleLook = (wet: number): number => {
  const t = Math.min(1, Math.max(0, (wet - 0.86) / 0.12));
  return t * t * (3 - 2 * t);
};

const _sheen = new Color();
const mix = (a: Float32Array, b: Float32Array, t: number, i: number): number => a[i] + (b[i] - a[i]) * t;
/** The earth's colours at wetness `w` (0‥1) into `out` (3 a block). */
export function tintEarth(e: Earth, w: number, out: Float32Array): void {
  _sheen.setHex(SHEEN);
  const k = w > 0.72 ? ((w - 0.72) / 0.28) * SHEEN_K : 0;
  const n = e.rock.n;
  for (let i = 0; i < n * 3; i++) out[i] = w <= 0.5 ? mix(e.dry, e.damp, w * 2, i) : mix(e.damp, e.wet, w * 2 - 1, i);
  if (k > 0)
    for (let i = 0; i < n; i++) {
      if (!e.top[i]) continue;
      out[i * 3] += (_sheen.r - out[i * 3]) * k;
      out[i * 3 + 1] += (_sheen.g - out[i * 3 + 1]) * k;
      out[i * 3 + 2] += (_sheen.b - out[i * 3 + 2]) * k;
    }
}
