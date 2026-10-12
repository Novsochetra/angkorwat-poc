import { Euler, Quaternion, Vector3 } from 'three';
import type { SourceTrace } from '../../../feedback/sourceTrace';
import type { VoxelMaterialKey } from '../../../voxel/materials';
import { hash3 } from '../../../voxel/random';
import type { VoxelBuilder } from '../../../voxel/VoxelBuilder';

/**
 * Shared plumbing of the yard pieces he builds at home (the pen, the shelter,
 * the bamboo bed, the fence, the straw stack: build/models/{pen,shelter,kre,
 * fence,haystack}.ts; the contract build/pieces.ts): seeded randomness, the
 * village's colours (hamlet/_evKit.ts, village/_kit.ts, jungle/_campKit.ts:
 * the same wood, bamboo, thatch and straw as the sugar-palm village's own pen,
 * houses and stacks), and turned boxes (poles from a to b, thatch courses,
 * leaning posts). Only the map's block families (`Mat`).
 */

export type Mat = Extract<VoxelMaterialKey, 'mapBark' | 'mapLeaf' | 'mapStone' | 'petal' | 'mapRock' | 'mapGrass'>;
export type Rand = () => number;
export type Src = SourceTrace | undefined;

/** A seeded stream for one piece (the same seed draws the same piece every time): `salt` keeps its parts apart. */
export function rng(seed: number, salt: number): Rand {
  // (seeds may be 0‥1 like the garden's, or whole numbers: both spread over the hash)
  const s = Math.round(seed * 9973) | 0;
  let n = 0;
  return () => hash3(n++, s, salt, 613);
}

/** One of a few tones by a random value. */
export const tone = (list: readonly number[], r: number): number => list[Math.min(list.length - 1, Math.floor(r * list.length))];

/** Two sRGB colours mixed (t 0 → a, 1 → b). */
export function mix(a: number, b: number, t: number): number {
  const u = 1 - t;
  const r = Math.round(((a >> 16) & 255) * u + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * u + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * u + (b & 255) * t);
  return (r << 16) | (g << 8) | bl;
}

// ── Colours (sRGB), the village's ───────────────────────────────────────────

/** Posts: dark, wet-stained hardwood (village/_kit.ts `POST`). */
export const POST = [0x4e3d30, 0x5a4636, 0x46372b, 0x55432f] as const;
/** Rough rails and poles, lighter (the village pen's rails). */
export const RAIL = [0x8a6a48, 0x7a5a3a, 0x9a7a54, 0x846446] as const;
/** Aged whole bamboo, straw-gold (village/_kit.ts `BAMBOO`). */
export const BAMBOO = [0xc8b27a, 0xbba36c, 0xd4bf88, 0xae9660] as const;
/** Older bamboo, darker gold-brown (frames, legs). */
export const OLD_BAMBOO = [0x9a8458, 0x8e7a4e, 0xa48c5e, 0x937c50] as const;
/** New split bamboo, pale green-gold (just cut: slats, lattice). */
export const NEW_BAMBOO = [0xcdc47e, 0xc1b970, 0xd6cc8c, 0xb8b066, 0xc9bd78] as const;
/** A bamboo node's ring (a little darker, greener). */
export const NODE = [0xa49a5a, 0x988e52] as const;
/** Rattan and bamboo-strip lashings. */
export const TIE = [0x7a6446, 0x6e5a3e, 0x857050] as const;
/** The thatch's dark underside and ragged eave ends. */
export const THATCH_DARK = [0x6e5e44, 0x66573e, 0x75644a] as const;
/**
 * A roof he thatched (the shelter's, the pen's shed: `thatchCourse`): palm leaf dried straw-gold, going grey-brown in
 * the sun, a little uneven. A course's own tone (`THATCH_ROOF`), its leaves' (the strands over it): mostly of a tone
 * near it, some fresh gold (`THATCH_GOLD`), some weathered grey (`THATCH_GREY`, the palm sugar shed's old thatch,
 * hamlet/_psKit.ts `THATCH`).
 */
export const THATCH_ROOF = [0xae9a6e, 0xa6936a, 0xb4a276, 0x9e8f6c, 0xa89a78] as const;
export const THATCH_GOLD = [0xc4aa6c, 0xccb276, 0xbca266, 0xc8ae72] as const;
export const THATCH_GREY = [0x948a74, 0x8c826c, 0x9d937c, 0x857b66] as const;
/** The thatch's block family (the contract's, build/pieces.ts: `mapLeaf` thatch, as the rice straw). */
export const THATCH_MAT: Mat = 'mapLeaf';
/** Rice straw: fresh gold, weathered grey-gold (hamlet/_evKit.ts `STRAW`, _bhYard.ts). */
export const STRAW = [0xd4b868, 0xc8a858, 0xdcc478, 0xbc9c50, 0xd8bc6a] as const;
export const OLD_STRAW = [0xa89058, 0x9c8652, 0xb09a62, 0x8f7c4c] as const;
/** Trodden earth (as the palm sugar yard's), and the land's own worn paths (terrain/palette.ts `PATH`). */
export const EARTH = [0x8c6642, 0x82603e, 0x94704a, 0x7c5a3a] as const;
export const PATH = [0xa6825a, 0x997652, 0xb08c63, 0x9e7a55] as const;
/** Cut wood's pale end grain. */
export const CUT = [0xd8b27a, 0xcfa56b, 0xc89c62] as const;
/** Krama checks: a colour and white. */
export const KRAMA: readonly (readonly [number, number])[] = [
  [0xb8322c, 0xf0ece0],
  [0x2c5a9a, 0xf0ece0],
  [0x3a7a4a, 0xf0ece0],
  [0x7a2a6a, 0xf0ece0],
];

// ── Turned boxes ─────────────────────────────────────────────────────────────

const _q = new Quaternion();
const _q2 = new Quaternion();
const _e = new Euler();
const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);

/**
 * A box turned: `yaw` about y, then `pitch` (its +z end up, radians), then `roll` about its own length (z). The
 * box's centre at (x, y, z). (As the garden's `turned`.)
 */
export function turned(b: VoxelBuilder, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number, pitch: number, roll: number, color: number, mat: Mat, shade: number, src: Src): void {
  _q.setFromAxisAngle(Y, yaw);
  if (pitch) _q.multiply(_q2.setFromAxisAngle(X, -pitch));
  if (roll) _q.multiply(_q2.setFromAxisAngle(Z, roll));
  _e.setFromQuaternion(_q, 'XYZ');
  b.box(x, y, z, sx, sy, sz, color, mat, { shade, rx: _e.x, ry: _e.y, rz: _e.z, src });
}

/**
 * A pole, board or bundle from a to b: `w` across, `t` thick (its own up), its length along a→b plus `over` at
 * each end (lashed ends past the post), `roll` about its length.
 */
export function stick(b: VoxelBuilder, ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, t: number, color: number, mat: Mat, shade: number, src: Src, over = 0, roll = 0): void {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const flat = Math.hypot(dx, dz);
  const len = Math.hypot(flat, dy);
  if (len < 1e-4) return;
  turned(b, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, w, t, len + 2 * over, Math.atan2(dx, dz), Math.atan2(dy, flat), roll, color, mat, shade, src);
}

/**
 * An upright post from `y0` (below the ground: sunk in) to `top`, `w` square, leaning a little about its foot at
 * (x, z): `lx` its top toward +z, `lz` toward −x (radians, small).
 */
export function post(b: VoxelBuilder, x: number, z: number, y0: number, top: number, w: number, color: number, mat: Mat, shade: number, src: Src, lx = 0, lz = 0): void {
  const h = top - y0;
  // (turned about its middle, so the middle moves half as far as the top: the foot stays put)
  b.box(x - Math.sin(lz) * h * 0.5, y0 + h / 2, z + Math.sin(lx) * h * 0.5, w, h, w, color, mat, { shade, rx: lx, rz: lz, src });
}

/** A course's leaves: how they lie (`thatchCourse`). */
export interface ThatchLeaves {
  /** About this far apart along the course (m: each gap 0.6‥1.4 of it). */
  every: number;
  /** How far their ends hang past the course's lower edge (m, from‥to). */
  hang: readonly [number, number];
  /** Leaf tips hanging steeply from its lower edge (the eave's ragged ends): about this far apart (m), this long (from‥to); 0: none. */
  tips?: number;
  tipLen?: readonly [number, number];
  /** The leaves only between these along the course (a hip roof's: inside the hips' bundles), else the band's ends. */
  from?: number;
  to?: number;
}

/**
 * One course of palm-leaf thatch on a roof's slope (as the palm sugar shed's, hamlet/_psKit.ts `thatchSlope`): a band
 * along `axis` from `a0` to `a1` at `at` across it, `slab` wide down the slope, its middle `y` on the roof's plane (the
 * thatch's mid-thickness), the roof falling toward `down` (±1 along the other axis) at `pitch`. One band of its own
 * tone with no joints (cut in panels it read as planks), laid a little flatter than the roof, so its lower edge stands
 * proud on the course below. Then its leaves over the part of it the next course leaves bare (`bare`, m down the
 * slope from its lower edge): strands down the slope, a finger proud, each its own width and tone (now and then a run
 * of fresh gold or weathered grey), their ends hanging past its lower edge, ragged; at the eave the leaf tips hanging
 * steeply from it too (`leaves.tips`). Returns the band's tone.
 */
export function thatchCourse(b: VoxelBuilder, r: Rand, axis: 'x' | 'z', a0: number, a1: number, at: number, y: number, slab: number, thick: number, pitch: number, down: number, dark: number, bare: number, leaves: ThatchLeaves, src: Src): number {
  const lift = thick * 0.8;
  const flat = pitch - Math.atan2(lift, slab);
  // (raised half the lift: the upper edge on the plane, the lower edge `lift` over it)
  const yc = y + lift / 2;
  const base = tone(THATCH_ROOF, r());
  const tilt = axis === 'x' ? { rx: down * flat } : { rz: -down * flat };
  if (axis === 'x') b.box((a0 + a1) / 2, yc, at, a1 - a0, thick, slab, base, THATCH_MAT, { src, shade: dark * (0.93 + r() * 0.08), ...tilt });
  else b.box(at, yc, (a0 + a1) / 2, slab, thick, a1 - a0, base, THATCH_MAT, { src, shade: dark * (0.93 + r() * 0.08), ...tilt });
  // The band's frame: along it (u), down the slope (d), out of the roof (n); its middle (cx, cz) across.
  const cs = Math.cos(flat);
  const sn = Math.sin(flat);
  const [ux, uz] = axis === 'x' ? [1, 0] : [0, 1];
  const [dx, dy, dz] = axis === 'x' ? [0, -sn, down * cs] : [down * cs, -sn, 0];
  const [nx, ny, nz] = axis === 'x' ? [0, cs, down * sn] : [down * sn, cs, 0];
  const cx = axis === 'x' ? 0 : at;
  const cz = axis === 'x' ? at : 0;
  // (the leaves' heading: down the slope)
  const yaw0 = axis === 'x' ? (down > 0 ? 0 : Math.PI) : down > 0 ? Math.PI / 2 : -Math.PI / 2;
  // (a strand's thickness, and how far it stands out of the band: a finger's width, no more: not slats)
  const t = 0.026;
  const proud = 0.014;
  // A run of fresh or weathered leaf: its tones, strands left in it.
  let run: readonly number[] | null = null;
  let left = 0;
  const l0 = leaves.from ?? a0;
  const l1 = leaves.to ?? a1;
  let a = l0 + leaves.every * (0.2 + 0.5 * r());
  while (a < l1 - 0.04) {
    if (left <= 0) {
      const q = r();
      run = q < 0.1 ? THATCH_GOLD : q < 0.22 ? THATCH_GREY : null;
      left = run ? 2 + Math.floor(r() * 4) : 1;
    }
    left--;
    const w = 0.05 + r() * 0.08;
    const c = run ? tone(run, r()) : mix(base, r() < 0.5 ? tone(THATCH_GOLD, r()) : tone(THATCH_GREY, r()), 0.08 + r() * 0.24);
    // (from under the next course down past this one's lower edge, ragged)
    const s0 = slab / 2 - bare - 0.05 + r() * 0.2;
    const s1 = slab / 2 + leaves.hang[0] + r() * (leaves.hang[1] - leaves.hang[0]);
    const s = (s0 + s1) / 2;
    const h = thick / 2 + proud - t / 2;
    turned(b, cx + ux * a + dx * s + nx * h, yc + dy * s + ny * h, cz + uz * a + dz * s + nz * h, w, t, s1 - s0, yaw0 + (r() - 0.5) * 0.1, -flat, 0, c, THATCH_MAT, dark * (0.92 + r() * 0.14), src);
    a += leaves.every * (0.6 + 0.8 * r());
  }
  // The eave: the butts of its leaves along its lower edge, bent down (its thickness, a shade darker), in short
  // lengths, each its own length down and tone (a ragged edge, not a board); then a few leaf tips hanging over them.
  if (leaves.tips) {
    const e0 = slab / 2 - 0.07;
    let p = l0;
    while (p < l1 - 0.04) {
      let p1 = Math.min(l1, p + 0.2 + r() * 0.26);
      if (l1 - p1 < 0.12) p1 = l1;
      const m = (p + p1) / 2;
      const qe = flat + 0.35 + r() * 0.35;
      const le = 0.12 + r() * 0.15;
      const [hx, hy, hz] = axis === 'x' ? [0, -Math.sin(qe) * le * 0.5, down * Math.cos(qe) * le * 0.5] : [down * Math.cos(qe) * le * 0.5, -Math.sin(qe) * le * 0.5, 0];
      const c = mix(base, r() < 0.25 ? tone(THATCH_GREY, r()) : tone(THATCH_DARK, r()), 0.2 + r() * 0.3);
      turned(b, cx + ux * m + dx * e0 + hx, yc + dy * e0 + hy, cz + uz * m + dz * e0 + hz, p1 - p + 0.03, thick * (0.45 + r() * 0.2), le, yaw0 + (r() - 0.5) * 0.08, -qe, 0, c, THATCH_MAT, 0.88 + r() * 0.12, src);
      p = p1;
    }
    const [t0, t1] = leaves.tipLen ?? [0.12, 0.28];
    p = l0 + leaves.tips * r() * 0.6;
    while (p < l1 - 0.05) {
      const l = t0 + r() * (t1 - t0);
      const q = flat + 0.25 + r() * 0.55;
      const tc = Math.cos(q);
      const ts = Math.sin(q);
      // (from just inside the edge, at the band's middle, down and out)
      const e = slab / 2 - 0.05;
      const ox = cx + ux * p + dx * e;
      const oy = yc + dy * e;
      const oz = cz + uz * p + dz * e;
      const [hx, hy, hz] = axis === 'x' ? [0, -ts * l * 0.5, down * tc * l * 0.5] : [down * tc * l * 0.5, -ts * l * 0.5, 0];
      const c = mix(base, tone(THATCH_DARK, r()), 0.1 + r() * 0.35);
      turned(b, ox + hx, oy + hy, oz + hz, 0.06 + r() * 0.08, 0.04, l, yaw0 + (r() - 0.5) * 0.4, -q, 0, c, THATCH_MAT, 0.86 + r() * 0.16, src);
      p += leaves.tips * (0.6 + 0.8 * r());
    }
  }
  return base;
}

/**
 * The cap over a ridge along x (from `x0` to `x1`, at depth `z`): a bundle of thatch folded over it, two sides at
 * `pitch` meeting at `top` (its upper face), each about `w` down its slope and `thick`; in `n` lengths a side, each its
 * own tone and reach down the slope (the cap's lower edges ragged), a little apart in height; the ends of its leaves
 * hanging from both lower edges about every `o.tips` m (0: none); tied down with split bamboo about every `o.tie` m
 * (or at `o.ties`).
 */
export function thatchCap(b: VoxelBuilder, r: Rand, x0: number, x1: number, z: number, top: number, pitch: number, w: number, thick: number, n: number, o: { tips: number; tie?: number; ties?: readonly number[] }, src: Src): void {
  const cs = Math.cos(pitch);
  const sn = Math.sin(pitch);
  for (const side of [-1, 1]) {
    // (the lengths' joints apart on the two sides)
    let a = x0;
    for (let i = 0; i < n; i++) {
      const e = i === n - 1 ? x1 : Math.min(x1, a + ((x1 - x0) / n) * (0.75 + 0.5 * r()));
      const c = r() < 0.3 ? tone(THATCH_GREY, r()) : tone(THATCH_ROOF, r());
      const wi = w * (0.82 + 0.3 * r());
      // (its upper inner edge at the top's middle line: the box's middle half its width down the slope and half `thick` in)
      const mz = z + side * ((wi / 2) * cs - (thick / 2) * sn);
      const my = top - (wi / 2) * sn - (thick / 2) * cs + (r() - 0.5) * 0.02;
      b.box((a + e) / 2, my, mz, e - a + 0.03, thick, wi, c, THATCH_MAT, { src, rx: side * pitch, shade: 0.9 + r() * 0.1 });
      a = e;
    }
  }
  // Its leaves' ends along both lower edges.
  if (o.tips > 0)
    for (const side of [-1, 1]) {
      let x = x0 + 0.08 + r() * 0.12;
      while (x < x1 - 0.06) {
        const l = 0.1 + r() * 0.12;
        const q = pitch + 0.35 + r() * 0.4;
        const ez = z + side * w * cs;
        const ey = top - w * sn - thick * 0.5;
        const c = mix(tone(THATCH_ROOF, r()), tone(THATCH_DARK, r()), 0.2 + r() * 0.3);
        turned(b, x, ey - (Math.sin(q) * l) / 2, ez + side * (Math.cos(q) * l) / 2, 0.07 + r() * 0.05, 0.04, l, side > 0 ? 0 : Math.PI, -q, 0, c, THATCH_MAT, 0.88 + r() * 0.12, src);
        x += o.tips * (0.7 + 0.6 * r());
      }
    }
  // Split bamboo over it, folded across both sides.
  const nt = Math.max(2, Math.round((x1 - x0) / (o.tie ?? 1.4)) + 1);
  const at = o.ties ?? Array.from({ length: nt }, (_, k) => x0 + 0.12 + ((x1 - x0 - 0.24) * k) / (nt - 1));
  for (const x of at)
    for (const side of [-1, 1]) {
      const c = tone(BAMBOO, r());
      b.box(x, top - (w * 0.45 * sn) / 2 + 0.012, z + side * ((w * 0.45 * cs) / 2), 0.05, 0.03, w * 0.45, c, 'mapBark', { src, rx: side * pitch, shade: 0.92 });
    }
}
