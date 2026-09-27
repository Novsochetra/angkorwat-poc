import type { SourceTrace } from '../../feedback/sourceTrace';
import type { VoxelMaterialKey } from '../../voxel/materials';
import { hash3 } from '../../voxel/random';
import type { VoxelBox, VoxelBuilder } from '../../voxel/VoxelBuilder';
import { slab, stick } from './_psPalms';

/**
 * Plumbing for the palm sugar yard's builds (`_psHut.ts`, `_psHome.ts`,
 * `_psYard.ts`, `_psStall.ts`): a build in a local frame (`PsFrame`: boxes,
 * spans, sticks and slabs from its origin, traced to the builder function,
 * the small ones marked to be drawn only near), the yard's shared colours,
 * and the small things more than one of them makes (palm-leaf thatch rows,
 * round baskets, trays of sugar cakes, big earthen jars). Wood, bamboo,
 * thatch and leaf are `mapBark`; clay, earth, sugar and pots `mapStone`;
 * cloth and animals `petal`; living plants `mapLeaf`.
 */

export type Rgb = number;
export const pick = (list: readonly Rgb[], r: number): Rgb => list[Math.min(list.length - 1, Math.max(0, Math.floor(r * list.length)))];

// ── Colours (sRGB) ──────────────────────────────────────────────────────────

/** Rough hardwood posts and beams. */
export const POST: readonly Rgb[] = [0x5a4636, 0x4e3c2e, 0x645040, 0x54402f];
/** Bamboo: rafters, battens, racks, rails. */
export const BAMBOO: readonly Rgb[] = [0xb8a070, 0xa88f60, 0xc4ad7c, 0x9e8658];
/** Sugar-palm leaf thatch: silver-brown when old, a few newer golden bundles. */
export const THATCH: readonly Rgb[] = [0x8e8470, 0x857b68, 0x978d78, 0x7c7462, 0x8a806a, 0x9c9280, 0x827866];
export const THATCH_NEW: readonly Rgb[] = [0xb49c6a, 0xbfa874, 0xa89060];
/** Thatch blackened by years of smoke round the vent. */
export const THATCH_SOOT: readonly Rgb[] = [0x4a3e32, 0x544636, 0x3e342a, 0x5c4c3a];
/** Woven palm-leaf wall panels. */
export const WEAVE: readonly Rgb[] = [0xb09a6c, 0xa28c60, 0xbca676, 0x96825a];
/** Packed earth, swept. */
export const EARTH: readonly Rgb[] = [0x6e5236, 0x5f4630, 0x7a5a3c, 0x684c32];
/** Straw of mats, baskets and trays. */
export const STRAW: readonly Rgb[] = [0xd2b67e, 0xc8aa70, 0xdcc28c, 0xbfa066];
/** Set palm sugar cakes: golden to brown (the fresher, the paler). */
export const CAKE: readonly Rgb[] = [0xc08a42, 0xb07a38, 0xc89448, 0xa46e30, 0xd2a058];
/** Dry palm leaf (the wrappers, the fronds). */
export const FROND: readonly Rgb[] = [0x9a865e, 0x8a7652, 0xa8946a, 0x7e6c4c, 0x8f8a74];
/** Split firewood. */
export const WOOD: readonly Rgb[] = [0x7a5a3a, 0x6a4c30, 0x8a6a46, 0x5e4430];
/** Earthen jars (glazed dark brown, a few with a dragon-less plain glaze). */
export const JAR: readonly Rgb[] = [0x5e3620, 0x6b3f26, 0x4e2c1a, 0x62402a];

/** A build in a local frame: (x, z) from its origin (+x, +z as the world's), y over the ground under it. */
export class PsFrame {
  constructor(
    readonly b: VoxelBuilder,
    readonly ox: number,
    readonly oy: number,
    readonly oz: number,
    readonly src: SourceTrace | undefined,
    /** The small blocks (drawn only near: `_palmSugar.ts`), and whether this build's blocks go there. */
    readonly small: Set<VoxelBox>,
    readonly isSmall = false,
    /** Seed of this build's own random values. */
    readonly seed = 9171,
  ) {}

  private mark(): void {
    if (this.isSmall) this.small.add(this.b.boxes[this.b.boxes.length - 1]);
  }

  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: Rgb, mat: VoxelMaterialKey, shade = 1, ry = 0, rx = 0, rz = 0): void {
    this.b.box(this.ox + x, this.oy + y, this.oz + z, sx, sy, sz, color, mat, { src: this.src, shade, ry: ry || undefined, rx: rx || undefined, rz: rz || undefined });
    this.mark();
  }

  span(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: Rgb, mat: VoxelMaterialKey, shade = 1): void {
    this.b.span(this.ox + x0, this.oy + y0, this.oz + z0, this.ox + x1, this.oy + y1, this.oz + z1, color, mat, { src: this.src, shade });
    this.mark();
  }

  stick(ax: number, ay: number, az: number, bx: number, by: number, bz: number, t: number, color: Rgb, mat: VoxelMaterialKey, shade = 1): void {
    stick(this.b, this.ox + ax, this.oy + ay, this.oz + az, this.ox + bx, this.oy + by, this.oz + bz, t, color, mat, this.src, shade);
    this.mark();
  }

  slab(x: number, y: number, z: number, w: number, h: number, t: number, az: number, tilt: number, color: Rgb, mat: VoxelMaterialKey, shade = 1): void {
    slab(this.b, this.ox + x, this.oy + y, this.oz + z, w, h, t, az, tilt, color, mat, this.src, shade);
    this.mark();
  }

  /** The same build, its blocks traced to the caller (one trace per builder function: the feedback tool names it). */
  at(src: SourceTrace | undefined): PsFrame {
    return new PsFrame(this.b, this.ox, this.oy, this.oz, src, this.small, false, this.seed);
  }

  /** The same build for small things (props, rims, cords…): drawn only near. */
  get fine(): PsFrame {
    return new PsFrame(this.b, this.ox, this.oy, this.oz, this.src, this.small, true, this.seed);
  }

  /** A seeded 0‥1 value for this build. */
  r(i: number, j = 0, k = 0): number {
    return hash3(Math.round(i * 7.3), Math.round(j * 5.1), Math.round(k * 3.7), this.seed);
  }
}

// ── Small things ────────────────────────────────────────────────────────────

/**
 * One slope of a thatched roof: courses of palm leaf laid like shingles from
 * the eave (its edge at `x0`, height `y0`) up to the ridge (`x1`, `y1`),
 * along z from `z0` to `z1`: each course a thick mat along the slope, its
 * top tucked under the course above, its lower edge lifted over the one
 * below (the roof's rough, layered skin, not stair steps). Each course is one
 * long band of its own tone (no joints: not planks), a few patches of older
 * or newer leaf over it, every third course a shade darker; its lower edge
 * shaggy with leaf tips hanging out — thick along the eave, a few on a
 * course half way up. `soot(z, k)` (0‥1) darkens a course toward black where the
 * smoke streams past (round a vent); `gap` leaves the top course open
 * between two z (the vent). Along x: the slope's own side (`x0` < `x1` or
 * the other way round); its underside is the plane from (x0, y0) to (x1, y1).
 */
export function thatchSlope(
  F: PsFrame,
  o: { x0: number; y0: number; x1: number; y1: number; z0: number; z1: number; rows: number; seed: number; gap?: [number, number]; soot?: (z: number, k: number) => number; thick?: number },
): void {
  const { x0, y0, x1, y1, z0, z1, rows, seed } = o;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const hyp = Math.hypot(dx, dy);
  const ux = dx / hyp;
  const uy = dy / hyp;
  // (out of the roof: up, away from the house)
  const nx = dx > 0 ? -uy : uy;
  const ny = dx > 0 ? ux : -ux;
  const T = o.thick ?? 0.16;
  const course = hyp / rows;
  const L = course * 1.55;
  // (each course tilted a little flatter than the roof: its lower edge rests on the course below)
  const lift = T * 0.9;
  const tilt = Math.atan2(lift, L);
  const rz = Math.atan2(dy, dx) + (dx > 0 ? -tilt : tilt);
  for (let k = 0; k < rows; k++) {
    const lo = k * course - (k === 0 ? 0.1 : 0);
    const hi = Math.min(hyp + 0.05, lo + L);
    const len = hi - lo;
    const mid = (lo + hi) / 2;
    // (the middle of the mat: on the plane, raised half its thickness and half the lift)
    const off = T / 2 + lift / 2 + k * 0.004;
    const cx = x0 + ux * mid + nx * off;
    const cy = y0 + uy * mid + ny * off;
    const dark = k % 3 === 2 ? 0.86 : 1;
    const base = F.r(k, seed, 1);
    const spans: [number, number][] = k >= rows - 2 && o.gap ? [[z0, o.gap[0]], [o.gap[1], z1]] : [[z0, z1]];
    for (const [za, zb] of spans) {
      // The band, cut only where the smoke's stain changes (none, light, black).
      const cls = (z: number) => (o.soot ? Math.min(2, Math.floor(o.soot(z, k) * 2.99)) : 0);
      let a = za;
      while (zb - a > 0.02) {
        const c0 = cls(a + 0.01);
        let e = a;
        while (e < zb - 0.01 && cls(Math.min(zb - 0.01, e + 0.25)) === c0) e = Math.min(zb, e + 0.25);
        if (e <= a + 0.01) e = Math.min(zb, a + 0.25);
        if (zb - e < 0.3) e = zb;
        const color = c0 === 2 ? pick(THATCH_SOOT, F.r(k, a, seed + 3)) : pick(THATCH, base);
        F.box(cx, cy, (a + e) / 2, len, T, e - a, color, 'mapBark', dark * (c0 === 1 ? 0.72 : 1), 0, 0, rz);
        a = e;
      }
      // Patches of older (grey) or newer (golden) leaf over the band, a finger proud, a little shorter along the slope.
      const n = Math.max(1, Math.round((zb - za) / 2.2));
      for (let i = 0; i < n; i++) {
        const pl = 0.5 + 1.1 * F.r(k, i, seed + 4);
        const mz = za + (zb - za) * ((i + 0.2 + 0.6 * F.r(i, k, seed + 5)) / n);
        const pa = Math.max(za, mz - pl / 2);
        const pb = Math.min(zb, mz + pl / 2);
        if (pb - pa < 0.3) continue;
        if (o.soot && o.soot(mz, k) > 0.3) continue;
        const fresh = F.r(i, k, seed + 6) > 0.7;
        const po = 0.025;
        F.fine.box(cx - ux * 0.06 + nx * po, cy - uy * 0.06 + ny * po, (pa + pb) / 2, len * 0.86, T, pb - pa, fresh ? pick(THATCH_NEW, F.r(i, k, seed + 7)) : pick(THATCH, F.r(i, k, seed + 8)), 'mapBark', dark * (0.9 + 0.14 * F.r(k, i, 9)), 0, 0, rz);
      }
      // Leaf tips hanging out of the course's lower edge: thick along the eave, a few higher up.
      if (k === 0 || (rows > 3 && k === rows >> 1)) {
        const step = k === 0 ? 0.34 : 0.8;
        // (the lower edge's outer corner)
        const ex = x0 + ux * lo + nx * (lift + T * 0.6);
        const ey = y0 + uy * lo + ny * (lift + T * 0.6);
        for (let z = za + 0.12 + F.r(seed, k, 21) * step; z < zb - 0.1; z += step * (0.7 + 0.6 * F.r(z, seed, 22))) {
          const l = (k === 0 ? 0.14 : 0.08) + (k === 0 ? 0.22 : 0.12) * F.r(z, k, 23);
          F.fine.box(ex - ux * 0.02, ey - l / 2, z, 0.07, l, 0.1 + 0.14 * F.r(z, k, 24), pick(THATCH, F.r(z, seed, 25)), 'mapBark', 0.8 + 0.16 * F.r(k, z, 26), 0, 0, (dx > 0 ? -1 : 1) * 0.25);
        }
      }
    }
  }
}

/** A round woven basket (a square at this size) with a rim, its bottom at `y`. */
export function basket(F: PsFrame, x: number, y: number, z: number, w: number, h: number, seed: number): void {
  F.box(x, y + h / 2, z, w, h, w, pick(STRAW, F.r(seed, 50)), 'mapBark', 0.95);
  F.box(x, y + h + 0.02, z, w + 0.05, 0.05, w + 0.05, pick(BAMBOO, F.r(seed, 51)), 'mapBark', 0.9);
}

/**
 * A flat round tray of woven bamboo (ចង្អេរ) with round palm sugar cakes
 * drying on it in rows, lying at height `y`, `w` across; `n` cakes a side,
 * `gone` of them already taken (from the corner).
 */
export function cakeTray(F: PsFrame, x: number, y: number, z: number, w: number, n: number, seed: number, gone = 0): void {
  F.box(x, y + 0.02, z, w, 0.04, w, pick(STRAW, F.r(seed, 43)), 'mapBark', 1.04);
  // (the rim: two sides a little proud, the round tray's edge)
  F.fine.box(x, y + 0.05, z - w / 2 + 0.03, w, 0.04, 0.06, pick(BAMBOO, F.r(seed, 44)), 'mapBark', 0.9);
  F.fine.box(x, y + 0.05, z + w / 2 - 0.03, w, 0.04, 0.06, pick(BAMBOO, F.r(seed, 45)), 'mapBark', 0.9);
  const step = (w - 0.16) / n;
  let k = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      if (k++ < gone) continue;
      const cx = x - (w - 0.16) / 2 + step * (i + 0.5);
      const cz = z - (w - 0.16) / 2 + step * (j + 0.5);
      F.fine.box(cx, y + 0.07, cz, step * 0.72, 0.055, step * 0.72, pick(CAKE, F.r(seed * 16 + i, j, 46)), 'mapStone', 0.95 + 0.1 * F.r(i, j + seed, 47));
    }
}

/** A big earthen jar (ពាង): a foot, the round belly, shoulder and neck, `s` its size (1: ≈ 1 m tall), a lid or water in its mouth. */
export function bigJar(F: PsFrame, x: number, y: number, z: number, s: number, seed: number, lid: boolean): void {
  const c = pick(JAR, F.r(seed, 31));
  F.box(x, y + 0.1 * s, z, 0.5 * s, 0.2 * s, 0.5 * s, c, 'mapStone', 0.88);
  F.box(x, y + 0.45 * s, z, 0.84 * s, 0.52 * s, 0.84 * s, c, 'mapStone');
  F.box(x, y + 0.78 * s, z, 0.62 * s, 0.16 * s, 0.62 * s, c, 'mapStone', 1.04);
  F.box(x, y + 0.9 * s, z, 0.44 * s, 0.1 * s, 0.44 * s, c, 'mapStone', 1.08);
  if (lid) {
    F.fine.box(x, y + 0.97 * s, z, 0.52 * s, 0.05, 0.52 * s, 0x8a6a48, 'mapBark', 0.95);
    F.fine.box(x, y + 1.0 * s, z, 0.12, 0.05, 0.12, 0x6a4c30, 'mapBark');
  } else F.fine.box(x, y + 0.94 * s, z, 0.32 * s, 0.03, 0.32 * s, 0x3a4a4c, 'mapStone', 0.8);
}
