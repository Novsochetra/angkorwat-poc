import { traceSource, type SourceTrace } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { VoxelMaterialKey } from '../../voxel/materials';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { CELL, fbm, SURFACE, type HeightField } from '../heightfield';
import * as P from './palette';
import { Strata } from './strata';
import { FACE_X_MAX, FACE_X_MIN } from './views';

/** Where a block goes: the builder of its chunk and level of detail. */
export type Sink = (x: number, z: number, lod: number) => VoxelBuilder;

const NONE = -1e4;
/** How far a pillar stands out of a cliff face (m). */
const PILLAR_OFFSETS = [-1, -0.5, -0.5, 0, 0, 0.5, 1];
const isNatural = (s: number) => s === SURFACE.grass || s === SURFACE.rock || s === SURFACE.dirt;

/**
 * The land's columns as blocks. A column is its top block (2 m of grass,
 * rock, sand…) and, where a neighbour on a side some camera sees is lower, a
 * wall down to that neighbour, cut into the rock strata (one block per band,
 * so a tall band is one tall block). Cliff walls are shaped: pillars stand
 * out or sit back a little, dark grooves run down between them, some bands
 * stick out as ledges, the grass top overhangs the lip and greenery hangs
 * down; the foot is darker and mossy, the waterline wet and dark.
 * North faces and faces turned away from every camera are never built.
 */
export class ColumnMaker {
  readonly strata = new Strata(3);
  /** Cells by a waterfall (dark wet rock, no shaping). */
  readonly wet: Uint8Array;
  private readonly splits: number[] = [];
  private readonly hard = new Set<number>();
  // What the bug report tool names as the maker of each block (one trace per
  // kind of block: traces are slow).
  /** Top blocks of the 2 m columns. */
  private readonly srcTop: SourceTrace | undefined = traceSource();
  /** Cliff walls of the 2 m columns. */
  private readonly srcWall: SourceTrace | undefined = traceSource();
  /** Coarse (4 m, 8 m) columns. */
  private readonly srcFar: SourceTrace | undefined = traceSource();

  constructor(
    private readonly f: HeightField,
    private readonly sink: Sink,
  ) {
    this.wet = new Uint8Array(f.nx * f.nz);
    for (const fall of f.falls) {
      const r = fall.width / 2 + 5;
      const len = 10 + (fall.top - fall.bottom) * 0.3;
      for (let t = -3; t <= len; t += 1) {
        const cx = fall.x + fall.dir[0] * t;
        const cz = fall.z + fall.dir[1] * t;
        for (let dz = -r; dz <= r; dz += CELL / 2)
          for (let dx = -r; dx <= r; dx += CELL / 2) {
            if (dx * dx + dz * dz > r * r) continue;
            const c = f.index(cx + dx, cz + dz);
            if (c >= 0) this.wet[c] = 1;
          }
      }
    }
  }

  /** Ground that may be shaped (plain land: not built on, no water nearby). */
  private shapeable(c: number): boolean {
    const f = this.f;
    return isNatural(f.surface[c]) && !f.occupied[c] && f.water[c] < -1000 && !this.wet[c];
  }

  /** Highest water level on the cell or next to it (for the wet waterline), or NONE. */
  private waterNear(c: number, i: number, k: number): number {
    const { water, nx, nz } = this.f;
    let w = water[c];
    if (i > 0) w = Math.max(w, water[c - 1]);
    if (i < nx - 1) w = Math.max(w, water[c + 1]);
    if (k > 0) w = Math.max(w, water[c - nx]);
    if (k < nz - 1) w = Math.max(w, water[c + nx]);
    return w > -1000 ? w : NONE;
  }

  /** Top colour and family of a cell. */
  private topColor(c: number, i: number, k: number, x: number, z: number, h: number, lip: boolean): [number, VoxelMaterialKey] {
    const s = this.f.surface[c];
    const r = hash3(i, h, k, 7);
    switch (s) {
      case SURFACE.grass: {
        if (lip && r < 0.35) return [P.pick(P.GRASS_DARK, hash3(i, h, k, 8)), 'mapGrass'];
        const patch = fbm(x / 34, z / 34, 21);
        if (patch > 0.6 && r < 0.75) return [P.pick(P.GRASS_DRY, hash3(i, h, k, 8)), 'mapGrass'];
        if (patch < 0.38 && r < 0.75) return [P.pick(P.GRASS_DARK, hash3(i, h, k, 8)), 'mapGrass'];
        return [P.pick(P.GRASS, r), 'mapGrass'];
      }
      case SURFACE.rock:
        return [P.pick(P.ROCK_TOP, r), 'mapRock'];
      case SURFACE.dirt:
        return [P.pick(P.DIRT, r), 'mapRock'];
      case SURFACE.sand:
        return [r < 0.28 ? P.pick(P.PEBBLE, hash3(i, h, k, 9)) : P.pick(P.SAND, r), 'mapRock'];
      case SURFACE.path:
        return [P.pick(P.PATH, r), 'mapRock'];
      case SURFACE.pad:
        // Natural ground (a meadow with bare patches) wherever the landmark leaves it open.
        if (fbm(x / 9, z / 9, 23, 2) < 0.4 && r < 0.8) return [P.pick(P.PAD, hash3(i, h, k, 8)), 'mapRock'];
        return [P.pick(P.GRASS_DRY, r), 'mapGrass'];
      default:
        return [P.pick(P.BED, r), 'mapRock'];
    }
  }

  /**
   * The pillar a column belongs to along a face (`u` runs along it): faces
   * are cut into pillars 1–4 columns wide, each standing out or sitting back
   * up to 1 m, with a tint of its own, and often a dark groove at its edge.
   * Returns [offset (m), groove, tint].
   */
  private static pillar(u: number, seed: number): [number, boolean, number] {
    let s = u;
    for (let n = 0; n < 3 && hash3(s, 0, 0, seed) >= 0.4; n++) s--;
    const off = PILLAR_OFFSETS[Math.floor(hash3(s, 1, 0, seed) * PILLAR_OFFSETS.length)];
    return [off, s === u && hash3(s, 2, 0, seed) < 0.55, 0.84 + hash3(s, 3, 0, seed) * 0.24];
  }

  /** Ground height of a cell; outside the map: +∞ (counts as buried, never reached into). */
  private hAt(i: number, k: number): number {
    const f = this.f;
    return i < 0 || k < 0 || i >= f.nx || k >= f.nz ? Infinity : f.height[i + k * f.nx];
  }

  /** Lowest ground along a strip of cells (inclusive ranges). */
  private minH(i0: number, i1: number, k0: number, k1: number): number {
    let m = Infinity;
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) m = Math.min(m, this.hAt(i, k));
    return m;
  }

  /**
   * How far a wall block of the column at cells (i, k)…(i + g − 1, k + g − 1)
   * whose top is `y1` reaches into its neighbours [north, south, east, west].
   * The land is a hollow shell, and block edges are bevelled: where two
   * blocks only touch along an edge (a cliff's foot, an inner corner of its
   * outline) the view would go through to the sky under the land. So a wall
   * block reaches a little into every neighbour that is buried at its height,
   * unless one of its faces there would lie on a neighbour's face in view
   * (two faces in one plane flicker).
   */
  private reach(i: number, k: number, g: number, y1: number, amount: number, out: number[]): void {
    const f = this.f;
    const xl = f.x0 + i * CELL;
    const xr = xl + g * CELL;
    const seeE = xr < FACE_X_MAX;
    const seeW = xl > FACE_X_MIN;
    const i1 = i + g - 1;
    const k1 = k + g - 1;
    const ok = (strip: number, dA: number, seeA: boolean, dB: number, seeB: boolean) =>
      strip !== Infinity && strip >= y1 && (!seeA || dA >= y1) && (!seeB || dB >= y1) ? amount : 0;
    // North / south: the side faces of the reach are east and west.
    out[0] = ok(this.minH(i, i1, k - 1, k - 1), this.hAt(i + g, k - 1), seeE, this.hAt(i - 1, k - 1), seeW);
    out[1] = ok(this.minH(i, i1, k + g, k + g), this.hAt(i + g, k + g), seeE, this.hAt(i - 1, k + g), seeW);
    // East / west: north faces are never seen; south ones always.
    out[2] = ok(this.minH(i + g, i + g, k, k1), 0, false, this.hAt(i + g, k + g), true);
    out[3] = ok(this.minH(i - 1, i - 1, k, k1), 0, false, this.hAt(i - 1, k + g), true);
  }
  private readonly rch = [0, 0, 0, 0];

  /** Lowest block of a 2 m column (its top block's bottom if it has no wall). */
  private lowOf(i: number, k: number): number {
    const h = this.hAt(i, k);
    if (h === Infinity) return Infinity;
    const x = this.f.x0 + (i + 0.5) * CELL;
    let low = Math.min(h - CELL, this.hAt(i, k + 1));
    if (x + CELL / 2 < FACE_X_MAX) low = Math.min(low, this.hAt(i + 1, k));
    if (x - CELL / 2 > FACE_X_MIN) low = Math.min(low, this.hAt(i - 1, k));
    return low;
  }

  /**
   * May the face of column (i, k) on side (di, dk) sit back from y0 up? Only
   * if the columns on both sides along the face are open air or have blocks
   * there: else the notch opens into the hollow under their tops.
   */
  private canSitBack(i: number, k: number, di: number, dk: number, y0: number): boolean {
    for (const s of [-1, 1]) {
      const ni = i + dk * s;
      const nk = k + di * s;
      if (!(this.hAt(ni, nk) < y0 || this.lowOf(ni, nk) <= y0)) return false;
    }
    return true;
  }
  private reachOf(i: number, k: number, g: number, y1: number, amount: number): number[] {
    this.reach(i, k, g, y1, amount, this.rch);
    return this.rch;
  }

  /** One 2 m column (cell i, k). */
  fine(i: number, k: number): void {
    const f = this.f;
    const { nx, nz, height: H } = f;
    const c = i + k * nx;
    const h = H[c];
    const [x, z] = f.cellCenter(i, k);
    const hS = k + 1 < nz ? H[c + nx] : h;
    const hE = i + 1 < nx && x + 1 < FACE_X_MAX ? H[c + 1] : h;
    const hW = i > 0 && x - 1 > FACE_X_MIN ? H[c - 1] : h;
    const hN = k > 0 ? H[c - nx] : h;
    const low = Math.min(hS, hE, hW, h - CELL);
    const b = this.sink(x, z, 0);
    const s = f.surface[c];
    const natural = this.shapeable(c);
    const shapeS = natural && k + 1 < nz && this.shapeable(c + nx);
    const shapeE = natural && i + 1 < nx && this.shapeable(c + 1);
    const shapeW = natural && i > 0 && this.shapeable(c - 1);
    const lip = h - low >= 2 * CELL;

    // Top block: the grass overhangs a cliff lip a little.
    const [color, mat] = this.topColor(c, i, k, x, z, h, lip);
    // (only where no neighbour's top is beside the overhang: no two tops in one plane)
    const over = s === SURFACE.rock ? 0.15 : 0.3;
    const oS = shapeS && h - hS >= 2 * CELL && this.hAt(i - 1, k + 1) < h && this.hAt(i + 1, k + 1) < h ? over : 0;
    const oE = shapeE && h - hE >= 2 * CELL && this.hAt(i + 1, k - 1) < h && this.hAt(i + 1, k + 1) < h ? over : 0;
    const oW = shapeW && h - hW >= 2 * CELL && this.hAt(i - 1, k - 1) < h && this.hAt(i - 1, k + 1) < h ? over : 0;
    let shade = 0.96 + hash3(i, h, k, 17) * 0.08;
    // Ground at the foot of a cliff lies in its shade.
    if (hN - h >= 2 * CELL) shade *= 0.86;
    else if (hN - h >= CELL) shade *= 0.94;
    const open = 4 | (hE < h ? 1 : 0) | (hW < h ? 2 : 0) | (hS < h ? 16 : 0);
    // (a top with no wall under it goes 1 m deeper, past the next step's edge)
    const bottom = low >= h - CELL ? h - CELL - 1 : h - CELL;
    b.span(x - CELL / 2 - oW, bottom, z - CELL / 2, x + CELL / 2 + oE, h, z + CELL / 2 + oS, color, mat, { open, shade, src: this.srcTop });
    if (low >= h - CELL) return;

    // Wall: split at the strata, at each neighbour's top (shaping stops
    // there) and where the hanging greenery ends.
    const w = Strata.warp(x, z);
    const grassy = s === SURFACE.grass && natural;
    const rv = hash3(i, 3, k, 31);
    // (longer on tall cliffs; never below the foot band)
    const vine = grassy && lip && rv < 0.24 ? Math.min(CELL + Math.floor(hash3(i, 4, k, 31) * 5) * CELL, Math.max(0, h - low - 3 * CELL)) : 0;
    const lipMoss = grassy && lip && rv >= 0.24 && rv < 0.55 ? (rv < 0.4 ? 1 : 2) : 0;
    const wallTop = h - CELL;
    const splits = this.splits;
    const hard = this.hard;
    splits.length = 0;
    hard.clear();
    splits.push(low, wallTop);
    for (const t of [hS, hE, hW, wallTop - vine, wallTop - lipMoss])
      if (t > low && t < wallTop) {
        splits.push(t);
        hard.add(t);
      }
    this.strata.boundaries(low, wallTop, w, splits);
    splits.sort((p, q) => p - q);

    const wl = this.waterNear(c, i, k);
    const wetFall = this.wet[c] === 1;
    const footH = 3 + fbm(x / 15, z / 15, 44, 2) * 6;
    const [pS, gS, tS] = ColumnMaker.pillar(i, 101);
    const [pE, gE, tE] = ColumnMaker.pillar(k, 102);
    const [pW, gW, tW] = ColumnMaker.pillar(k, 103);
    // The tint of the pillar on the side that shows most.
    const tint = hS < h ? tS : hE < h && x < FACE_X_MAX ? tE : tW;
    let y0 = splits[0];
    for (let n = 1; n < splits.length; n++) {
      let y1 = splits[n];
      if (y1 <= y0) continue;
      // A 1 m sliver of a band joins the one above (unless a hard split).
      if (y1 - y0 < 2 && n + 1 < splits.length && !hard.has(y1) && splits[n + 1] - y0 <= 6) y1 = splits[++n];
      const mid = (y0 + y1) / 2;
      const bi = this.strata.indexAt(mid, w);
      const band = this.strata.bands[bi];
      const rr = hash3(i, Math.round(y0 * 2), k, 13);
      let col: number;
      let m: VoxelMaterialKey = 'mapRock';
      if (wetFall || (wl > NONE && mid < wl + 1.5)) col = P.pick(rr < 0.2 ? P.MOSS_ROCK : P.WET, rr);
      else if (s === SURFACE.sand) col = mid > wallTop - CELL ? P.pick(P.SAND, rr) : P.pick(P.WET, rr);
      else if (s === SURFACE.bed) col = P.pick(P.WET, rr);
      else if (y0 >= wallTop - vine) {
        col = P.pick(P.VINE, rr);
        m = 'mapGrass';
      } else if (y0 >= wallTop - lipMoss) {
        col = P.pick(P.LIP, rr);
        m = 'mapGrass';
      } else if (mid < low + footH) col = P.pick(rr < 0.45 ? P.MOSS_ROCK : P.FOOT, hash3(i, bi, k, 14));
      else col = P.pick(P.STRATA_KINDS[band.kind], rr);

      // Shape the face above each neighbour's top: pillars, grooves, ledges;
      // the band right under the lip sits back, so the grass overhangs it.
      const under = y1 >= wallTop;
      const ledge = band.ledge > 0 && fbm(x / 18, z / 18, 300 + (bi % 50), 2) > 0.45 ? band.ledge : 0;
      // (a block may only sit back if a block of its own column is under
      // it: the notch it leaves needs a floor, or the view goes through)
      const face = (ok: boolean, nTop: number, pillar: number, groove: boolean, di: number, dk: number) => {
        if (!ok || y0 < nTop) return 0;
        let o = groove ? -1 : pillar + ledge;
        if (under) o = Math.min(o, -0.25);
        return o >= 0 || (y0 > nTop && this.canSitBack(i, k, di, dk, y0)) ? o : Math.max(0, o);
      };
      const sS = face(shapeS, hS, pS, gS, 0, 1);
      const sE = face(shapeE, hE, pE, gE, 1, 0);
      const sW = face(shapeW, hW, pW, gW, -1, 0);
      let sh = (0.8 + 0.2 * Math.min(1, (mid - low) / 12)) * (0.94 + rr * 0.12) * (m === 'mapRock' ? tint : 1);
      if ((gS && sS < 0) || (gE && sE < 0) || (gW && sW < 0)) sh *= 0.55;
      else if (under && m === 'mapRock') sh *= 0.9;
      const op = (hE < y1 ? 1 : 0) | (hW < y1 ? 2 : 0) | (hS < y1 ? 16 : 0) | (ledge > 0 && !under ? 4 : 0);
      const [rN, rS, rE, rW] = this.reachOf(i, k, 1, y1, 0.3);
      // (the lowest block goes 1 m under its neighbour's top, past that top's edge)
      b.span(x - CELL / 2 - (sW || rW), y0 === low ? low - 1 : y0, z - CELL / 2 - rN, x + CELL / 2 + (sE || rE), y1, z + CELL / 2 + (sS || rS), col, m, { open: op, shade: sh, src: this.srcWall });
      y0 = y1;
    }
  }

  /** A coarse column: g × g cells (4 or 8 m) that share one height, seen from far. */
  coarse(i: number, k: number, g: number): void {
    const f = this.f;
    const { nx, nz, height: H } = f;
    const src = this.srcFar;
    const c = i + k * nx;
    const h = H[c];
    const size = g * CELL;
    const x = f.x0 + i * CELL + size / 2;
    const z = f.z0 + k * CELL + size / 2;
    let hS = h;
    let hE = h;
    let hW = h;
    if (k + g < nz) for (let a = i; a < i + g; a++) hS = Math.min(hS, H[a + (k + g) * nx]);
    if (i + g < nx && x + size / 2 < FACE_X_MAX) for (let a = k; a < k + g; a++) hE = Math.min(hE, H[i + g + a * nx]);
    if (i > 0 && x - size / 2 > FACE_X_MIN) for (let a = k; a < k + g; a++) hW = Math.min(hW, H[i - 1 + a * nx]);
    const low = Math.min(hS, hE, hW, h - CELL);
    const b = this.sink(x, z, g === 2 ? 1 : 2);
    const [color, mat] = this.topColor(c, i, k, x, z, h, h - low >= 2 * CELL);
    const open = 4 | (hE < h ? 1 : 0) | (hW < h ? 2 : 0) | (hS < h ? 16 : 0);
    const bottom = low >= h - CELL ? h - CELL - 1 : h - CELL;
    b.span(x - size / 2, bottom, z - size / 2, x + size / 2, h, z + size / 2, color, mat, { open, shade: 0.96 + hash3(i, h, k, 17) * 0.08, src });
    if (low >= h - CELL) return;
    const w = Strata.warp(x, z);
    const splits = this.splits;
    splits.length = 0;
    splits.push(low, h - CELL);
    this.strata.boundaries(low, h - CELL, w, splits);
    splits.sort((p, q) => p - q);
    const minH = g === 2 ? 2 : 4;
    const footH = 4 + fbm(x / 15, z / 15, 44, 2) * 6;
    let y0 = splits[0];
    for (let n = 1; n < splits.length; n++) {
      let y1 = splits[n];
      while (y1 - y0 < minH && n + 1 < splits.length) y1 = splits[++n];
      const mid = (y0 + y1) / 2;
      const bi = this.strata.indexAt(mid, w);
      const rr = hash3(i, Math.round(y0 * 2), k, 13);
      const col = mid < low + footH ? P.pick(rr < 0.45 ? P.MOSS_ROCK : P.FOOT, rr) : P.pick(P.STRATA_KINDS[this.strata.bands[bi].kind], rr);
      const sh = (0.8 + 0.2 * Math.min(1, (mid - low) / 14)) * (0.95 + rr * 0.1);
      const op = (hE < y1 ? 1 : 0) | (hW < y1 ? 2 : 0) | (hS < y1 ? 16 : 0);
      const [rN, rS, rE, rW] = this.reachOf(i, k, g, y1, 0.6);
      b.span(x - size / 2 - rW, y0 === low ? low - 1 : y0, z - size / 2 - rN, x + size / 2 + rE, y1, z + size / 2 + rS, col, 'mapRock', { open: op, shade: sh, src });
      y0 = y1;
    }
  }

}
