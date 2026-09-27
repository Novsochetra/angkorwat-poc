import { Euler, Quaternion } from 'three';
import type { SourceTrace } from '../../feedback/sourceTrace';
import type { VoxelMaterialKey } from '../../voxel/materials';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { HeightField } from '../heightfield';
import type { Frame } from '../landmarks/_prasatKit';
import type { Palms } from '../veg/palms';
import { BAMBOO, CLOTH, JAR, LEAF, Local, POST, ROOFS, spiritHouse, TRIM, tone, WALLS, type GlowFn, type Roof, type Tones } from '../village/_kit';
import type { VillageLights } from '../village/_lights';
import type { SmokeSource } from '../village/_smoke';
import type { EvRoof, EvWalls } from './_evSpots';

/**
 * Plumbing for the sugar-palm village's builds (on top of the floating
 * village's kit, village/_kit.ts: plank walls, stepped roofs, jars, hens…):
 * its colours, boxes turned about a frame's own x axis (barge boards,
 * sunburst rays, wheels: `tilt`), and the things of a Khmer land village —
 * bicycles, an ox cart, a loom, a bamboo bed platform, rice straw stacks,
 * bamboo fences and gate pillars, papaya and mango trees,
 * bamboo clumps, kitchen gardens (the palms are veg/palms.ts's). Wood is `mapBark` (solid to walk on),
 * stone, clay, tile and tin `mapStone`, cloth and plants the soft families
 * (`petal`, `mapLeaf`): four block families, four draws for the whole
 * village.
 */

/** What every piece of the village builds into: the land, its blocks, glows and kitchen smoke. */
export interface EvEnv {
  field: HeightField;
  world: VoxelBuilder;
  lights: VillageLights;
  smoke: SmokeSource[];
  /** The village's sugar and coconut palms (veg/palms.ts: real palms, in draws of their own). */
  palms: Palms;
}

// ── Colours (sRGB) ───────────────────────────────────────────────────────────

export const EV_WALLS: Record<EvWalls, Tones> = {
  wood: WALLS.wood,
  // Whitewashed planks, a little dusty.
  white: [0xece6d6, 0xe4ddcb, 0xf2ede0, 0xddd5c2],
  blue: WALLS.blue,
  green: WALLS.green,
  yellow: [0xe8cf7e, 0xdfc472, 0xefd88c, 0xd8bc6a],
  pink: [0xe3aa9c, 0xd99d8f, 0xeab5a8, 0xd29488],
};
/** Doors and shutters on each wall colour (a contrasting paint). */
export const EV_TRIM: Record<EvWalls, Tones> = {
  wood: TRIM.wood,
  white: [0x3f6f8c, 0x46789a],
  blue: TRIM.blue,
  green: TRIM.green,
  yellow: [0x3a7a5a, 0x2f6a4c],
  pink: [0xf2ece0, 0xe6dfd0],
};
export const EV_ROOFS: Record<EvRoof, Tones> = {
  // Small clay tiles, red-brown, weathered in patches.
  tile: [0xa44a2c, 0x96432a, 0xb2573a, 0x8c3e26, 0xa85236, 0x9a5a3e],
  thatch: ROOFS.thatch,
  tin: ROOFS.tin,
  rust: ROOFS.rust,
};
export const EV_RIDGE: Record<EvRoof, number> = { tile: 0x7a3220, thatch: 0x5f5040, tin: 0x7b7f80, rust: 0x6e3f24 };
/** Whitewashed concrete (newer stilts, stairs, gate pillars). */
export const CONCRETE: Tones = [0xdcd6c8, 0xd2ccbe, 0xe4dfd2];
/** Rice straw (stacks, the cart's load, a granary's thatch). */
export const STRAW: Tones = [0xd4b868, 0xc8a858, 0xdcc478, 0xbc9c50];
/** Dark leaves of fruit trees (mango, tamarind). */
export const DARK_LEAF: Tones = [0x2e5220, 0x3a5e26, 0x33581f, 0x42682c, 0x284a1a];

// ── Turned boxes ─────────────────────────────────────────────────────────────

const Q = new Quaternion();
const E = new Euler();
const E2 = new Euler();

/**
 * A box in a frame's local metres (y the world height) turned by `ax` about
 * the frame's own x axis, straight into the world builder (a local build's
 * boxes turn about y only: `Frame.place` adds its heading). +ax tips the
 * box's +z end down.
 */
export function tilt(world: VoxelBuilder, fr: Frame, src: SourceTrace | undefined, lx: number, y: number, lz: number, sx: number, sy: number, sz: number, ax: number, color: number, mat: VoxelMaterialKey, shade = 1): void {
  Q.setFromEuler(E.set(ax, fr.theta, 0, 'YXZ'));
  E2.setFromQuaternion(Q, 'XYZ');
  world.box(fr.wx(lx, lz), y, fr.wz(lx, lz), sx, sy, sz, color, mat, { src, shade, rx: E2.x, ry: E2.y, rz: E2.z });
}

/** A board from (y0, z0) to (y1, z1) in the plane x = `lx` of the frame, `w` wide and `t` thick (a barge board, a ray, a leaning pole). */
export function board(world: VoxelBuilder, fr: Frame, src: SourceTrace | undefined, lx: number, z0: number, y0: number, z1: number, y1: number, w: number, t: number, color: number, mat: VoxelMaterialKey = 'mapBark', shade = 1): void {
  const dz = z1 - z0;
  const dy = y1 - y0;
  const len = Math.hypot(dz, dy);
  tilt(world, fr, src, lx, (y0 + y1) / 2, (z0 + z1) / 2, t, w, len, -Math.atan2(dy, dz), color, mat, shade);
}

/**
 * The barge boards on a gable end (at local x = `x`): one plain board along
 * each slope over the stepped ends of the roof's rows, the two meeting at
 * the ridge (Khmer gables keep them plain: no horns crossing over the peak,
 * no hooks turned up at the eaves).
 */
export function gableTrim(env: EvEnv, fr: Frame, src: SourceTrace | undefined, r: Roof, x: number, color: number): void {
  const mid = (r.z0 + r.z1) / 2;
  const k = r.rise / r.run;
  const y0 = r.eave + r.rise - 0.1;
  const ytop = y0 + (mid - r.z0) * k;
  board(env.world, fr, src, x, r.z0 - 0.05, y0 - 0.05 * k, mid, ytop, 0.3, 0.09, color);
  board(env.world, fr, src, x, r.z1 + 0.05, y0 - 0.05 * k, mid, ytop, 0.3, 0.09, color);
}

/**
 * A kbach cut-out in a gable (a Khmer flame leaf, ក្បាច់): a pointed leaf of
 * boards standing on the gable's face (at local x = `x`, out toward `out`),
 * its middle at (y, z), `s` its height (m).
 */
export function kbach(L: Local, x: number, y: number, z: number, s: number, out: number, color: number): void {
  const rows: [number, number][] = [
    [0.12, 0.5],
    [0.34, 0.28],
    [0.52, 0.08],
    [0.46, -0.12],
    [0.26, -0.3],
    [0.1, -0.44],
  ];
  for (const [w, dy] of rows) L.box(x + out * 0.03, y + dy * s, z, 0.06, s * 0.2, w * s, color, 'mapBark', 1.05);
  // (the leaf's curl: a tip turned out to one side at its foot)
  L.box(x + out * 0.03, y - 0.46 * s, z + 0.14 * s, 0.06, s * 0.1, 0.16 * s, color, 'mapBark', 1.05);
}

/** Glow for panes, lamps and embers in a frame (local m → world), with a halo for lamps. */
export function frameGlow(env: EvEnv, fr: Frame, seed: number): GlowFn {
  let n = 0;
  return (x, y, z, sx, sy, sz, color, halo) => {
    const wx = fr.wx(x, z);
    const wz = fr.wz(x, z);
    env.lights.still.add(wx, y, wz, sx, sy, sz, fr.theta, color, ((seed * 7 + n++ * 3) % 29) * 0.217);
    if (halo) env.lights.halo(wx, y, wz, halo, wx * 0.37 + wz * 0.11);
  };
}

// ── Things of the village ────────────────────────────────────────────────────

/** A bicycle standing on its stand at (x, y, z), along local x (`c`: its frame's paint). Wheels as square rims. */
export function bicycle(L: Local, x: number, y: number, z: number, c: number): void {
  const r = 0.34;
  for (const wx of [x - 0.55, x + 0.55]) {
    L.box(wx, y + r * 2 - 0.02, z, 0.62, 0.04, 0.04, 0x222222, 'mapStone');
    L.box(wx, y + 0.02, z, 0.62, 0.04, 0.04, 0x222222, 'mapStone');
    L.box(wx - r + 0.02, y + r, z, 0.04, 0.62, 0.04, 0x222222, 'mapStone');
    L.box(wx + r - 0.02, y + r, z, 0.04, 0.62, 0.04, 0x222222, 'mapStone');
    L.box(wx, y + r, z, 0.08, 0.08, 0.1, 0x9a9a96, 'mapStone');
  }
  L.box(x, y + 0.56, z, 1.05, 0.06, 0.06, c, 'mapStone');
  L.box(x - 0.18, y + 0.45, z, 0.06, 0.4, 0.06, c, 'mapStone');
  L.box(x - 0.22, y + 0.8, z, 0.26, 0.07, 0.14, 0x2a2a2a, 'mapStone');
  L.box(x + 0.5, y + 0.82, z, 0.06, 0.34, 0.06, 0x444444, 'mapStone');
  L.box(x + 0.5, y + 0.98, z, 0.06, 0.05, 0.56, 0x444444, 'mapStone');
  // A basket on the carrier at the back.
  L.box(x - 0.52, y + 0.8, z, 0.34, 0.2, 0.36, tone(BAMBOO, L.r(x, z, 3)), 'mapBark');
}

/** A spoked wheel (8 felloes, 4 spokes, the hub) upright in the frame's y–z plane at local (lx, y, lz), radius `r`. */
export function wheel(world: VoxelBuilder, fr: Frame, src: SourceTrace | undefined, lx: number, y: number, lz: number, r: number, wood: number, dark: number): void {
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    tilt(world, fr, src, lx, y + Math.cos(a) * (r - 0.04), lz + Math.sin(a) * (r - 0.04), 0.08, 0.08, ((Math.PI * 2 * r) / 8) * 1.08, a, k % 2 ? wood : dark, 'mapBark');
  }
  for (let k = 0; k < 4; k++) tilt(world, fr, src, lx, y, lz, 0.04, (r - 0.06) * 2, 0.04, (k / 4) * Math.PI, wood, 'mapBark');
  tilt(world, fr, src, lx, y, lz, 0.2, 0.16, 0.16, 0, dark, 'mapBark');
}

/**
 * An ox cart standing unhitched at local (x, z) on ground `y`, its pole
 * along local +z resting on the ground: two tall spoked wheels, the bed
 * tipped forward, low side rails.
 */
export function oxCart(world: VoxelBuilder, fr: Frame, src: SourceTrace | undefined, x: number, y: number, z: number): void {
  const R = 0.66;
  const wood = 0x8a6038;
  const dark = 0x5e3f24;
  for (const s of [-1, 1]) wheel(world, fr, src, x + s * 0.74, y + R, z, R, wood, dark);
  tilt(world, fr, src, x, y + R, z, 1.78, 0.08, 0.08, 0, dark, 'mapBark');
  // The bed tipped forward: its front end lower (the pole's end on the ground 3 m ahead).
  const pitch = Math.atan2(R + 0.2 - 0.12, 3.1);
  const bed = (dz: number, dy: number) => [z + dz * Math.cos(pitch), y + R + 0.2 + dy - dz * Math.sin(pitch)] as const;
  let [bz, by] = bed(0.1, 0);
  tilt(world, fr, src, x, by, bz, 0.96, 0.07, 2.4, pitch, wood, 'mapBark');
  for (const s of [-1, 1]) {
    [bz, by] = bed(0.1, 0.2);
    tilt(world, fr, src, x + s * 0.46, by, bz, 0.05, 0.05, 2.4, pitch, 0xa87c4c, 'mapBark');
  }
  [bz, by] = bed(-1.18, 0.1);
  tilt(world, fr, src, x, by, bz, 0.96, 0.22, 0.05, pitch, dark, 'mapBark');
  // The pole from the bed's front down to the ground, and the yoke lying across its end.
  [bz, by] = bed(2.35, -0.05);
  tilt(world, fr, src, x, (by + y + 0.08) / 2, (bz + z + 3.3) / 2, 0.1, 0.1, Math.hypot(z + 3.3 - bz, by - y - 0.08), Math.atan2(by - y - 0.08, z + 3.3 - bz), dark, 'mapBark');
  tilt(world, fr, src, x, y + 0.08, z + 3.3, 1.25, 0.09, 0.11, 0, 0xa87c4c, 'mapBark');
}

/** A bamboo bed platform (kre) at (x, ground y, z): legs, slats along x, a folded krama and a pillow on it. Returns its top. */
export function kre(L: Local, x: number, y: number, z: number, w = 2.1, d = 1.4): number {
  const top = y + 0.5;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) L.box(x + sx * (w / 2 - 0.1), y + 0.22, z + sz * (d / 2 - 0.1), 0.1, 0.44, 0.1, tone(BAMBOO, L.r(sx, sz, 4)), 'mapBark');
  L.span(x - w / 2, top - 0.08, z - d / 2, x + w / 2, top - 0.04, z + d / 2, 0x9a8458, 'mapBark');
  for (let i = 0; i < 5; i++) {
    const zz = z - d / 2 + (d / 5) * (i + 0.5);
    L.box(x, top - 0.02, zz, w, 0.05, d / 5 - 0.04, tone(BAMBOO, L.r(i, x, 5)), 'mapBark', 0.95 + L.r(i, z, 6) * 0.1);
  }
  L.box(x - w / 2 + 0.35, top + 0.06, z, 0.4, 0.1, 0.5, tone(CLOTH, L.r(x, z, 7)), 'petal');
  L.box(x + w / 2 - 0.5, top + 0.05, z - d / 4, 0.6, 0.06, 0.45, 0xb8322c, 'petal');
  return top;
}

/** A hammock hung between two posts from (x0, z) to (x1, z), the rope ends at `hy`: it sags to about 0.75 m over the ground `y`. */
export function hammock(L: Local, x0: number, x1: number, z: number, y: number, hy: number, color: number): void {
  const n = 6;
  const low = y + 0.72;
  const a = x0 + 0.35;
  const b = x1 - 0.35;
  // Ropes from the posts down to the cloth's ends.
  L.span(x0, hy - 0.04, z - 0.02, a, hy, z + 0.02, 0xd8d0c0, 'petal');
  L.span(b, hy - 0.04, z - 0.02, x1, hy, z + 0.02, 0xd8d0c0, 'petal');
  const endY = low + 0.55;
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const yy = endY - Math.sin(t * Math.PI) * (endY - low);
    const stripe = k % 2 === 0 ? color : 0xf0e6d0;
    L.span(a + ((b - a) * k) / n, yy - 0.05, z - 0.42, a + ((b - a) * (k + 1)) / n, yy + 0.03, z + 0.42, stripe, 'petal');
  }
  L.box(a, (hy + endY) / 2, z, 0.05, hy - endY, 0.05, 0xd8d0c0, 'petal');
  L.box(b, (hy + endY) / 2, z, 0.05, hy - endY, 0.05, 0xd8d0c0, 'petal');
}

/** A Khmer loom (a wooden frame, the warp of coloured silk stretched to the cloth beam, a roll of woven cloth, the weaver's bench) at (x, y, z), the weaver's side toward +z. */
export function loom(L: Local, x: number, y: number, z: number): void {
  const wood = 0x6a4a30;
  const silk = tone([0x9a2a5a, 0x2a4a9a, 0xb8322c, 0x6a2a8a], L.r(x, z, 8));
  for (const sx of [-0.8, 0.8])
    for (const sz of [-0.7, 0.55]) L.box(x + sx, y + 0.65, z + sz, 0.09, 1.3, 0.09, wood, 'mapBark');
  L.box(x, y + 1.3, z - 0.7, 1.7, 0.09, 0.09, wood, 'mapBark');
  L.box(x, y + 1.3, z + 0.55, 1.7, 0.09, 0.09, wood, 'mapBark');
  for (const sx of [-0.8, 0.8]) L.box(x + sx, y + 1.3, z - 0.07, 0.09, 0.09, 1.34, wood, 'mapBark');
  // The warp: a thin sheet of silk from the back beam down to the cloth, the heddle bar across it.
  L.span(x - 0.62, y + 0.86, z - 0.66, x + 0.62, y + 0.9, z + 0.3, silk, 'petal', 1.1);
  L.box(x, y + 1.02, z - 0.1, 1.4, 0.05, 0.05, wood, 'mapBark');
  L.box(x, y + 0.84, z + 0.4, 1.36, 0.14, 0.14, tone([0xc8302a, 0x7a2a6a, 0xd8a030], L.r(z, x, 9)), 'petal');
  // The weaver's low bench (its top where the people's stool pose sits: 0.23 m).
  L.span(x - 0.5, y + 0.16, z + 0.95, x + 0.5, y + 0.23, z + 1.25, 0x7a5a3a, 'mapBark');
  for (const sx of [-0.4, 0.4]) L.box(x + sx, y + 0.08, z + 1.1, 0.07, 0.16, 0.25, 0x5a4230, 'mapBark');
}

/** A woven hen coop (a round bamboo basket, upside down) with a hen beside it. */
export function coop(L: Local, x: number, y: number, z: number): void {
  const c = tone(BAMBOO, L.r(x, z, 10));
  L.box(x, y + 0.2, z, 0.9, 0.4, 0.9, c, 'mapBark', 0.9);
  L.box(x, y + 0.5, z, 0.7, 0.22, 0.7, c, 'mapBark');
  L.box(x, y + 0.66, z, 0.4, 0.12, 0.4, c, 'mapBark', 1.05);
}

/** A wooden rice mortar with its long pestle leaning on it. */
export function mortar(L: Local, x: number, y: number, z: number): void {
  L.box(x, y + 0.25, z, 0.55, 0.5, 0.55, 0x6a4a32, 'mapBark');
  L.box(x, y + 0.49, z, 0.36, 0.03, 0.36, 0x3a2a1e, 'mapBark');
  L.box(x + 0.32, y + 0.8, z, 0.08, 1.6, 0.08, 0x8a6a48, 'mapBark');
}

/** A pile of firewood (split logs stacked along x). */
export function woodpile(L: Local, x: number, y: number, z: number, len = 1.6): void {
  for (let k = 0; k < 4; k++) {
    const n = 4 - (k >> 1);
    for (let i = 0; i < n; i++) {
      const zz = z - 0.45 + (0.9 / n) * (i + 0.5);
      L.box(x, y + 0.1 + k * 0.19, zz, len - k * 0.1, 0.18, 0.9 / n - 0.03, tone([0x7a5a3a, 0x6a4a30, 0x8a6a48, 0x9a7a54], L.r(i, k, x)), 'mapBark');
    }
  }
}

/** A few big water jars in a row (along x), the Khmer peang, one with its lid. */
export function jars(L: Local, x: number, y: number, z: number, n = 3): void {
  for (let i = 0; i < n; i++) {
    const s = 1.05 + L.r(i, x, 11) * 0.25;
    const jx = x + (i - (n - 1) / 2) * 0.95;
    const c = tone(JAR, L.r(jx, z, 12));
    L.box(jx, y + 0.13 * s, z, 0.52 * s, 0.26 * s, 0.52 * s, c, 'mapStone', 0.9);
    L.box(jx, y + 0.48 * s, z, 0.74 * s, 0.46 * s, 0.74 * s, c, 'mapStone');
    L.box(jx, y + 0.8 * s, z, 0.48 * s, 0.17 * s, 0.48 * s, c, 'mapStone', 1.05);
    if (i === 0) L.box(jx, y + 0.9 * s, z, 0.54 * s, 0.05, 0.54 * s, 0x8a8a84, 'mapStone');
  }
}

/** A rice straw stack (a round mound built up round a pole), `s` its size (≈ 1: 2.6 m across, 3 m high). */
export function strawStack(L: Local, x: number, y: number, z: number, s = 1): void {
  const rows: [number, number][] = [
    [2.6, 0.8],
    [2.8, 0.7],
    [2.4, 0.6],
    [1.8, 0.5],
    [1.1, 0.45],
  ];
  let yy = y;
  rows.forEach(([w, h], i) => {
    L.box(x, yy + (h * s) / 2, z, w * s, h * s, w * s, tone(STRAW, L.r(i, x, 13)), 'mapBark', 0.92 + i * 0.03);
    yy += h * s;
  });
  L.box(x, yy + 0.3, z, 0.08, 0.7, 0.08, 0x6a5238, 'mapBark');
}

/** Krama checks: red and white, blue and white, green and white, purple and white; and the sarongs' batik colours. */
const KRAMA: [number, number][] = [
  [0xb8322c, 0xf0ece0],
  [0x2c5a9a, 0xf0ece0],
  [0x3a7a4a, 0xf0ece0],
  [0x7a2a6a, 0xf0ece0],
  [0xc8302a, 0x2a2a2a],
];
const SARONG = [0x6a2a4a, 0x2a4a6a, 0x8a3a2a, 0x3a5a3a, 0x5a3a6a, 0x7a5a2a];

/**
 * Washing on a line from (x0, z0) to (x1, z1) at height y: kramas (the
 * checked scarves: two colours in bands) and sarongs hung over a cord.
 */
export function kramaLine(L: Local, x0: number, z0: number, x1: number, z1: number, y: number): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(2, Math.floor(len / 0.75));
  const along = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  L.span(Math.min(x0, x1), y, Math.min(z0, z1), Math.max(x0, x1) + (along ? 0 : 0.03), y + 0.03, Math.max(z0, z1) + (along ? 0.03 : 0), 0xd8d0c0, 'petal');
  for (let i = 0; i < n; i++) {
    if (L.r(i, x0, 31) < 0.15) continue;
    const t = (i + 0.5) / n;
    const x = x0 + (x1 - x0) * t;
    const z = z0 + (z1 - z0) * t;
    const hang = (w: number, h: number, yy: number, c: number) => L.box(x, yy - h / 2, z, along ? w : 0.04, h, along ? 0.04 : w, c, 'petal');
    if (L.r(i, z0, 32) < 0.65) {
      // A krama: bands of its two colours, the fringe at the foot.
      const [a, b] = KRAMA[Math.floor(L.r(i, 1, 33) * KRAMA.length) % KRAMA.length];
      const h = 0.75 + L.r(i, 2, 34) * 0.25;
      const bands = 5;
      for (let k = 0; k < bands; k++) hang(0.36, h / bands + 0.01, y - (h * k) / bands, k % 2 ? b : a);
      hang(0.3, 0.06, y - h, b);
    } else hang(0.6, 0.7 + L.r(i, 3, 35) * 0.3, y, tone(SARONG, L.r(i, 4, 36)));
  }
}

/** A krama hung over a rail at (x, y, z) (the rail along x), its two ends down either side. */
export function kramaOver(L: Local, x: number, y: number, z: number, seed: number): void {
  const [a, b] = KRAMA[Math.floor(L.r(seed, x, 37) * KRAMA.length) % KRAMA.length];
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) L.box(x, y - 0.08 - k * 0.14, z + s * 0.07, 0.34, 0.15, 0.03, k % 2 ? b : a, 'petal');
}

/**
 * A Khmer spirit house (រានទេវតា) on its post at (x, y, z), facing +z: the
 * floating village's own (village/_kit.ts `spiritHouse`: a little Angkor
 * tower on a white post — a redented plinth, the whitewashed cella with its
 * door open to the front, a corn-cob tower of shrinking white and ochre
 * tiers with gilt leaf antefixes at the corners, a gilt lotus bud on top;
 * bay sei, incense and a candle on its red tray), so every village's spirit
 * houses are one Khmer design; its gilt in stone blocks (the village keeps
 * to its four families). Returns where its candle burns (for a glow).
 */
export function khmerSpiritHouse(L: Local, x: number, y: number, z: number): [number, number, number] {
  return spiritHouse(L, x, y, z, 'mapStone');
}

/** A bamboo pole fence along a line (posts every 1.4 m, two rails), leaving `gaps` (m along) open: returns nothing. */
export function fence(b: VoxelBuilder, src: SourceTrace | undefined, field: HeightField, x0: number, z0: number, x1: number, z1: number, gaps: [number, number][] = [], seed = 0, height = 1.15): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  if (len < 0.5) return;
  const ux = (x1 - x0) / len;
  const uz = (z1 - z0) / len;
  const ry = Math.atan2(ux, uz);
  const open = (s: number) => gaps.some(([a, c]) => s > a && s < c);
  const n = Math.max(1, Math.round(len / 1.4));
  let run0 = -1;
  const rails = (a: number, c: number) => {
    if (c - a < 0.3) return;
    const m = (a + c) / 2;
    const x = x0 + ux * m;
    const z = z0 + uz * m;
    const g = field.heightAt(x, z);
    for (const hy of [0.45, height - 0.15]) b.box(x, g + hy, z, 0.06, 0.07, c - a, tone(BAMBOO, ((m * 13 + hy * 7 + seed) % 10) / 10), 'mapBark', { src, ry });
  };
  for (let i = 0; i <= n; i++) {
    const s = (len * i) / n;
    if (open(s)) {
      if (run0 >= 0) rails(run0, (len * (i - 1)) / n);
      run0 = -1;
      continue;
    }
    const x = x0 + ux * s;
    const z = z0 + uz * s;
    const g = field.heightAt(x, z);
    b.box(x, g + height / 2 - 0.1, z, 0.1, height + 0.2, 0.1, tone(BAMBOO, ((i * 7 + seed) % 10) / 10), 'mapBark', { src });
    if (run0 < 0) run0 = s;
    if (i === n) rails(run0, s);
  }
}

/** A pair of gate pillars (whitewashed, a painted cap) either side of a gap `w` wide at local (x, z), across local x. */
export function gatePillars(L: Local, x: number, y: number, z: number, w: number, cap: number): void {
  for (const s of [-1, 1]) {
    const px = x + s * (w / 2 + 0.2);
    L.box(px, y + 0.75, z, 0.4, 1.5, 0.4, tone(CONCRETE, L.r(s, x, 14)), 'mapStone');
    L.box(px, y + 1.56, z, 0.52, 0.12, 0.52, cap, 'mapStone');
    L.box(px, y + 1.7, z, 0.24, 0.16, 0.24, cap, 'mapStone', 1.05);
  }
}

// ── Plants ───────────────────────────────────────────────────────────────────

/** A papaya: a thin pale trunk, a star of big leaves at its top, fruit clustered under them. */
export function papaya(L: Local, x: number, y: number, z: number, h = 3.4): void {
  L.box(x, y + h / 2, z, 0.2, h, 0.2, 0x9a9a7a, 'mapBark');
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + L.r(k, x, 19) * 0.4;
    const out = 0.7 + (k % 2) * 0.25;
    L.box(x + Math.cos(a) * out, y + h + 0.1 - (k % 2) * 0.25, z + Math.sin(a) * out, 0.85, 0.12, 0.85, tone([0x5a9a34, 0x4a8a2e, 0x68a83c], L.r(k, z, 20)), 'mapLeaf');
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    L.box(x + Math.cos(a) * 0.17, y + h - 0.35 - (k % 2) * 0.2, z + Math.sin(a) * 0.17, 0.18, 0.26, 0.18, k === 0 ? 0xe89a34 : 0x6a9a3a, 'petal');
  }
}

/** A mango tree: a short trunk, a dense round crown of dark leaves (1 m cells), `r` its radius. */
export function mango(L: Local, x: number, y: number, z: number, r = 3, seed = 0): void {
  L.box(x, y + 1.1, z, 0.55, 2.2, 0.55, 0x4e3c2e, 'mapBark');
  for (const [dx, dz] of [
    [0.7, 0.3],
    [-0.6, 0.5],
  ])
    L.box(x + dx * 0.6, y + 2.5, z + dz * 0.6, 0.4, 0.8, 0.4, 0x5a4636, 'mapBark');
  const cy = y + 2.2 + r * 0.85;
  const R = Math.ceil(r);
  for (let i = -R; i <= R; i++)
    for (let j = -R; j <= R; j++)
      for (let k = -R; k <= R; k++) {
        const d = Math.hypot(i / r, j / (r * 0.8), k / r) + (L.r(i, j + seed, k) - 0.5) * 0.3;
        if (d > 1 || d < 0.62) continue;
        L.box(x + i, cy + j * 0.8, z + k, 1, 0.8, 1, tone(DARK_LEAF, L.r(k, i, j + seed)), 'mapLeaf', 0.82 + 0.28 * ((j + R) / (2 * R)));
      }
}

/**
 * A bamboo clump: a dozen tall culms springing from one root, leaning out
 * and arching over, feathery leaves along their upper halves.
 */
export function bambooClump(L: Local, x: number, y: number, z: number, seed: number): void {
  const n = 11;
  for (let c = 0; c < n; c++) {
    const a = (c / n) * Math.PI * 2 + L.r(c, seed, 21) * 0.5;
    const lean = 0.18 + L.r(c, seed, 22) * 0.22;
    const h = 7 + L.r(c, seed, 23) * 3.5;
    const segs = 5;
    let px = x + Math.cos(a) * 0.4;
    let pz = z + Math.sin(a) * 0.4;
    let py = y;
    const seg = h / segs;
    for (let s = 0; s < segs; s++) {
      const t = (s + 1) / segs;
      const out = lean * seg * (0.4 + t * 1.6);
      const nx = px + Math.cos(a) * out;
      const nz = pz + Math.sin(a) * out;
      const ny = py + seg * (1 - t * t * 0.35);
      L.box((px + nx) / 2, (py + ny) / 2, (pz + nz) / 2, 0.14, ny - py + 0.05, 0.14, tone([0x7a9a3a, 0x8aa84a, 0x6a8a34], L.r(c, s, seed)), 'mapBark');
      if (s >= 2) L.box(nx + Math.cos(a) * 0.4, ny - 0.2, nz + Math.sin(a) * 0.4, 1.2, 0.5, 1.2, tone(LEAF, L.r(c, s + 5, seed)), 'mapLeaf', 0.9 + t * 0.15);
      px = nx;
      pz = nz;
      py = ny;
    }
  }
}

/** A kitchen garden bed (x0..x1 along x, z0..z1): rows of greens (morning glory, herbs, lemongrass) with dark earth between. */
export function vegBed(L: Local, x0: number, z0: number, x1: number, z1: number, y: number): void {
  L.span(x0, y - 0.05, z0, x1, y + 0.08, z1, 0x5a4230, 'mapBark');
  const rows = Math.max(1, Math.floor((z1 - z0) / 0.7));
  for (let i = 0; i < rows; i++) {
    const zz = z0 + (z1 - z0) * ((i + 0.5) / rows);
    const lemongrass = L.r(i, x0, 24) < 0.3;
    L.span(x0 + 0.15, y + 0.08, zz - 0.2, x1 - 0.15, y + (lemongrass ? 0.75 : 0.35), zz + 0.2, tone(lemongrass ? [0x8aa84a, 0x9ab85a] : LEAF, L.r(i, z0, 25)), 'mapLeaf', 0.95 + L.r(i, 1, 26) * 0.1);
  }
}

/** A clay stove (a round firepot) with a blackened pot on it: returns the top (the smoke comes from it). */
export function claystove(L: Local, x: number, y: number, z: number): number {
  L.box(x, y + 0.2, z, 0.55, 0.4, 0.55, 0x8a5a3a, 'mapStone');
  L.box(x, y + 0.5, z, 0.42, 0.22, 0.42, 0x2a2420, 'mapStone');
  return y + 0.7;
}

/**
 * A wide clay stove with a big wok on it (supper stirred with a long paddle:
 * its rim where the people's `stir` pose works, `FIT.wok`): returns the top.
 */
export function wokStove(L: Local, x: number, y: number, z: number): number {
  L.box(x, y + 0.22, z, 0.72, 0.44, 0.72, 0x8a5a3a, 'mapStone');
  L.box(x, y + 0.47, z, 0.8, 0.06, 0.8, 0x6e4630, 'mapStone');
  L.box(x, y + 0.52, z, 0.92, 0.1, 0.92, 0x2a2622, 'mapStone');
  L.box(x, y + 0.56, z, 0.7, 0.04, 0.7, 0x4a3a2a, 'mapStone', 0.9);
  return y + 0.62;
}

/** A hedge of flowering shrubs (hibiscus) along a line, soft to walk through. */
export function hedge(L: Local, x0: number, z0: number, x1: number, z1: number, y: number): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / 0.9));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = x0 + (x1 - x0) * t;
    const z = z0 + (z1 - z0) * t;
    const h = 0.8 + L.r(i, x0, 27) * 0.4;
    const bloom = L.r(i, z0, 28) < 0.35;
    L.box(x, y + h / 2, z, 0.95, h, 0.95, bloom ? tone([0xd83a3a, 0xe85a4a, 0xf07a8a], L.r(i, 2, 29)) : tone(LEAF, L.r(i, 3, 30)), bloom ? 'petal' : 'mapLeaf');
  }
}

/** Posts of dark wood or whitewashed concrete. */
export const postTones = (kind: 'wood' | 'concrete'): Tones => (kind === 'wood' ? POST : CONCRETE);
