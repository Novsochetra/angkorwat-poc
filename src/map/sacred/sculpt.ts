import { BufferAttribute, BufferGeometry } from 'three';
import { boxDist, smax, smin, type Box, type Shape } from './sdf';

/**
 * A statue sculpted from distance shapes (sdf.ts) and turned into a smooth
 * mesh: `add` puts clay on, `carve` cuts it away, `paint` gives a part of
 * the surface its own region (the eyes, the lips, a hem) without changing
 * its shape. Each region gets its colour and finish from a palette later
 * (finish.ts), so one sculpt serves a gilt Buddha and a sandstone one.
 *
 * `meshSculpt` samples the shapes on a grid of `cell` m and joins the
 * surface with "surface nets" (one vertex per cell the surface crosses,
 * moved onto the surface), smooth normals from the distance's slope and a
 * baked occlusion (dark in the folds, the eye sockets, between the fingers).
 */

type Op = { kind: 'add' | 'carve'; shape: Shape; k: number; region: number } | { kind: 'paint'; shape: Shape; k: 0; region: number };

export class Sculpt {
  /** Region names by index (the `region` attribute of the mesh). */
  readonly regions: string[] = [];
  private readonly ops: Op[] = [];
  private readonly solid: Op[] = [];
  private readonly paints: Op[] = [];
  /** Boxes meshed on the fine grid (the face, the hands): see `meshSculpt`'s `fineCell`. */
  readonly fineZones: Box[] = [];

  private regionOf(name: string): number {
    let i = this.regions.indexOf(name);
    if (i < 0) i = this.regions.push(name) - 1;
    return i;
  }

  /** Clay on: the shape joined to what is there, blended over `k` m. */
  add(shape: Shape, region: string, k = 0): this {
    const op: Op = { kind: 'add', shape, k, region: this.regionOf(region) };
    this.ops.push(op);
    this.solid.push(op);
    return this;
  }

  /** Clay off: the shape cut out of what is there so far, the edge rounded over `k` m. */
  carve(shape: Shape, k = 0): this {
    const op: Op = { kind: 'carve', shape, k, region: -1 };
    this.ops.push(op);
    this.solid.push(op);
    return this;
  }

  /** The surface inside `shape` belongs to `region` (the shape does not change). Later paints win. */
  paint(shape: Shape, region: string): this {
    const op: Op = { kind: 'paint', shape, k: 0, region: this.regionOf(region) };
    this.ops.push(op);
    this.paints.push(op);
    return this;
  }

  /**
   * Mesh this box on the fine grid (`meshSculpt`'s `fineCell`): where the
   * small details are (the face, the ears, the fingers). Keep the box's
   * sides where the surface is smooth and plain (across the neck, the
   * wrist), not through a detail.
   */
  fine(box: Box): this {
    this.fineZones.push(box);
    return this;
  }

  /** Signed distance (m) at a point, negative inside the statue. */
  distance(x: number, y: number, z: number): number {
    let d = Infinity;
    const ops = this.solid;
    for (let i = 0; i < ops.length; i++) {
      const o = ops[i];
      if (o.kind === 'add') {
        if (boxDist(o.shape.box, x, y, z) >= d + o.k) continue;
        d = smin(d, o.shape.d(x, y, z), o.k);
      } else {
        if (d === Infinity || boxDist(o.shape.box, x, y, z) >= -d + o.k) continue;
        d = smax(d, -o.shape.d(x, y, z), o.k);
      }
    }
    return d;
  }

  /** The region at a point on the surface: the last paint round it, else the nearest clay. */
  regionAt(x: number, y: number, z: number): number {
    const p = this.paintAt(x, y, z, 0);
    return p.weight >= 0.5 ? p.region : this.clayAt(x, y, z);
  }

  /**
   * The last paint round a point and how much of it shows (0‥1): full
   * inside, fading out over `soft` m either side of its edge, so a painted
   * eye line has a soft edge instead of following the mesh's triangles.
   */
  paintAt(x: number, y: number, z: number, soft: number): { region: number; weight: number } {
    for (let i = this.paints.length - 1; i >= 0; i--) {
      const p = this.paints[i];
      if (boxDist(p.shape.box, x, y, z) > soft) continue;
      const d = p.shape.d(x, y, z);
      if (d >= soft) continue;
      return { region: p.region, weight: soft > 0 ? Math.min(1, 0.5 - d / (2 * soft)) : 1 };
    }
    return { region: -1, weight: 0 };
  }

  /** The region of the nearest clay at a point (paints left out). */
  clayAt(x: number, y: number, z: number): number {
    let best = Infinity;
    let region = 0;
    for (const o of this.solid) {
      if (o.kind !== 'add' || boxDist(o.shape.box, x, y, z) >= best) continue;
      const d = o.shape.d(x, y, z);
      // (ties go to the later shape: a sash laid over the robe shows)
      if (d <= best + 1e-5) {
        best = d;
        region = o.region;
      }
    }
    return region;
  }

  /** Box round all the clay (m). */
  bounds(): Box {
    const o = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const op of this.solid) {
      if (op.kind !== 'add') continue;
      const b = op.shape.box;
      for (let i = 0; i < 3; i++) {
        o[i] = Math.min(o[i], b[i]);
        o[i + 3] = Math.max(o[i + 3], b[i + 3]);
      }
    }
    return o as unknown as Box;
  }
}

export interface MeshOptions {
  /** Grid cell (m): about a third of the smallest detail that should show. */
  cell: number;
  /**
   * Grid cell (m) inside the sculpt's fine zones (`Sculpt.fine`); without it
   * the zones are meshed on `cell` like the rest. The coarse mesh stops
   * just inside each zone and sinks a little there, so the fine one covers
   * the seam.
   */
  fineCell?: number;
  /** Only this part of the statue (m); default all of it. */
  bounds?: Box;
  /** Strength of the baked occlusion, 0‥1 (default 0.8). */
  occlusion?: number;
}

interface Pass {
  cell: number;
  bounds: Box;
  /** Keep a cell (its middle) or not. */
  keep?: (x: number, y: number, z: number) => boolean;
  /** How far (m) to sink a vertex into the statue. */
  sink?: (x: number, y: number, z: number) => number;
  /** How far out (m) the occlusion looks (default from the cell); passes that meet share them, so their shading matches at the seam. */
  ao?: number[];
}

/** What `meshSculpt` makes: the mesh and its regions by name. */
export interface SculptMesh {
  geometry: BufferGeometry;
  regions: string[];
  /** Time it took (ms). */
  ms: number;
}

/**
 * The sculpt as a smooth mesh: `position`, `normal`, `region` (float: index
 * into `regions`, the clay's), `paint` (the paint's region, −1 none) and
 * `paintW` (how much of it shows, 0‥1), and `occlusion` (0 dark ‥ 1 open),
 * indexed.
 */
export function meshSculpt(s: Sculpt, o: MeshOptions): SculptMesh {
  const t0 = performance.now();
  const all = o.bounds ?? s.bounds();
  const zones = o.fineCell && o.fineCell < o.cell ? s.fineZones : [];
  const parts: Raw[] = [];
  if (!zones.length) parts.push(meshPass(s, { cell: o.cell, bounds: all }, o.occlusion ?? 0.8));
  else {
    const hc = o.cell;
    const hf = o.fineCell!;
    const ao = [1.5 * hf, 3 * hf, 1.5 * hc, 3 * hc, 6 * hc, 12 * hc];
    // (deep inside a zone: left to the fine mesh)
    const depth = (z: Box, x: number, y: number, zz: number) => Math.min(x - z[0], z[3] - x, y - z[1], z[4] - y, zz - z[2], z[5] - zz);
    parts.push(
      meshPass(
        s,
        {
          cell: hc,
          bounds: all,
          // (two coarse cells in: its surface then always reaches past where the fine one begins, no crack)
          keep: (x, y, z) => zones.every((zb) => depth(zb, x, y, z) < 2 * hc),
          // (level with the fine mesh where that one has not begun yet, then well under it:
          // its flat triangles cut across hollows, which would poke through a shallow sink)
          sink: (x, y, z) => {
            let d = 0;
            for (const zb of zones) d = Math.max(d, depth(zb, x, y, z));
            return d <= hf ? 0 : Math.min(1, (d - hf) / (hc * 0.5)) * hc * 0.4;
          },
          ao,
        },
        o.occlusion ?? 0.8,
      ),
    );
    for (const zb of zones) {
      const clip: Box = [Math.max(zb[0], all[0]), Math.max(zb[1], all[1]), Math.max(zb[2], all[2]), Math.min(zb[3], all[3]), Math.min(zb[4], all[4]), Math.min(zb[5], all[5])];
      parts.push(meshPass(s, { cell: hf, bounds: clip, keep: (x, y, z) => depth(zb, x, y, z) >= 0, ao }, o.occlusion ?? 0.8));
    }
  }
  const geometry = joinRaw(parts);
  return { geometry, regions: [...s.regions], ms: performance.now() - t0 };
}

interface Raw {
  position: Float32Array;
  normal: Float32Array;
  region: Float32Array;
  paint: Float32Array;
  paintW: Float32Array;
  occlusion: Float32Array;
  index: number[];
}

function joinRaw(parts: Raw[]): BufferGeometry {
  let nv = 0;
  let ni = 0;
  for (const p of parts) {
    nv += p.region.length;
    ni += p.index.length;
  }
  const position = new Float32Array(nv * 3);
  const normal = new Float32Array(nv * 3);
  const region = new Float32Array(nv);
  const paint = new Float32Array(nv);
  const paintW = new Float32Array(nv);
  const occlusion = new Float32Array(nv);
  const index = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let v = 0;
  let i = 0;
  for (const p of parts) {
    position.set(p.position, v * 3);
    normal.set(p.normal, v * 3);
    region.set(p.region, v);
    paint.set(p.paint, v);
    paintW.set(p.paintW, v);
    occlusion.set(p.occlusion, v);
    for (let k = 0; k < p.index.length; k++) index[i + k] = p.index[k] + v;
    v += p.region.length;
    i += p.index.length;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('normal', new BufferAttribute(normal, 3));
  geometry.setAttribute('region', new BufferAttribute(region, 1));
  geometry.setAttribute('paint', new BufferAttribute(paint, 1));
  geometry.setAttribute('paintW', new BufferAttribute(paintW, 1));
  geometry.setAttribute('occlusion', new BufferAttribute(occlusion, 1));
  geometry.setIndex(new BufferAttribute(index, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** One grid over `pass.bounds`: the surface there as raw arrays. */
function meshPass(s: Sculpt, pass: Pass, occ: number): Raw {
  const h = pass.cell;
  const b = pass.bounds;
  const keep = pass.keep;
  const pad = 2 * h;
  const x0 = b[0] - pad;
  const y0 = b[1] - pad;
  const z0 = b[2] - pad;
  const nx = Math.ceil((b[3] + pad - x0) / h);
  const ny = Math.ceil((b[4] + pad - y0) / h);
  const nz = Math.ceil((b[5] + pad - z0) / h);
  const px = nx + 1;
  const py = ny + 1;
  const pz = nz + 1;
  const P = (i: number, j: number, k: number) => i + px * (j + py * k);
  const vals = new Float32Array(px * py * pz);

  // Coarse pass: blocks of B cells far from the surface take one value (their sign) and are not sampled.
  const B = 6;
  const bx = Math.ceil(nx / B);
  const by = Math.ceil(ny / B);
  const bz = Math.ceil(nz / B);
  const reach = B * h * 0.8660254 + h;
  const active = new Uint8Array(bx * by * bz);
  for (let K = 0; K < bz; K++)
    for (let J = 0; J < by; J++)
      for (let I = 0; I < bx; I++) {
        const cx = x0 + (I + 0.5) * B * h;
        const cy = y0 + (J + 0.5) * B * h;
        const cz = z0 + (K + 0.5) * B * h;
        const d = s.distance(cx, cy, cz);
        const on = Math.abs(d) < reach * 1.35;
        active[I + bx * (J + by * K)] = on ? 1 : 0;
        if (on) continue;
        const v = d > 0 ? Math.max(d - reach, h) : Math.min(d + reach, -h);
        for (let k = K * B; k <= Math.min(nz, (K + 1) * B); k++)
          for (let j = J * B; j <= Math.min(ny, (J + 1) * B); j++) for (let i = I * B; i <= Math.min(nx, (I + 1) * B); i++) vals[P(i, j, k)] = v;
      }
  for (let K = 0; K < bz; K++)
    for (let J = 0; J < by; J++)
      for (let I = 0; I < bx; I++) {
        if (!active[I + bx * (J + by * K)]) continue;
        for (let k = K * B; k <= Math.min(nz, (K + 1) * B); k++)
          for (let j = J * B; j <= Math.min(ny, (J + 1) * B); j++)
            for (let i = I * B; i <= Math.min(nx, (I + 1) * B); i++) vals[P(i, j, k)] = s.distance(x0 + i * h, y0 + j * h, z0 + k * h);
      }

  // One vertex per cell the surface crosses: the mean of where it crosses the cell's edges.
  const cellVert = new Int32Array(nx * ny * nz).fill(-1);
  const C = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  const pos: number[] = [];
  const corner = new Float32Array(8);
  const EDGES = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
    [0, 2],
    [1, 3],
    [4, 6],
    [5, 7],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        let inside = 0;
        for (let c = 0; c < 8; c++) {
          const v = vals[P(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))];
          corner[c] = v;
          if (v < 0) inside++;
        }
        if (inside === 0 || inside === 8) continue;
        if (keep && !keep(x0 + (i + 0.5) * h, y0 + (j + 0.5) * h, z0 + (k + 0.5) * h)) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (const [a, c] of EDGES) {
          const va = corner[a];
          const vc = corner[c];
          if (va < 0 === vc < 0) continue;
          const t = va / (va - vc);
          sx += (a & 1) + ((c & 1) - (a & 1)) * t;
          sy += ((a >> 1) & 1) + (((c >> 1) & 1) - ((a >> 1) & 1)) * t;
          sz += ((a >> 2) & 1) + (((c >> 2) & 1) - ((a >> 2) & 1)) * t;
          n++;
        }
        cellVert[C(i, j, k)] = pos.length / 3;
        pos.push(x0 + (i + sx / n) * h, y0 + (j + sy / n) * h, z0 + (k + sz / n) * h);
      }

  // Faces: every grid edge the surface crosses joins the four cells round it.
  const idx: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) [b, d] = [d, b];
    // (split along the shorter diagonal)
    const dac = dist2(pos, a, c);
    const dbd = dist2(pos, b, d);
    if (dac <= dbd) idx.push(a, b, c, a, c, d);
    else idx.push(a, b, d, b, c, d);
  };
  for (let k = 1; k < nz; k++)
    for (let j = 1; j < ny; j++)
      for (let i = 1; i < nx; i++) {
        const v0 = vals[P(i, j, k)] < 0;
        // edge along +x from (i, j, k)
        if (i < nx && v0 !== vals[P(i + 1, j, k)] < 0)
          quad(cellVert[C(i, j - 1, k - 1)], cellVert[C(i, j, k - 1)], cellVert[C(i, j, k)], cellVert[C(i, j - 1, k)], !v0);
        if (j < ny && v0 !== vals[P(i, j + 1, k)] < 0)
          quad(cellVert[C(i - 1, j, k - 1)], cellVert[C(i - 1, j, k)], cellVert[C(i, j, k)], cellVert[C(i, j, k - 1)], !v0);
        if (k < nz && v0 !== vals[P(i, j, k + 1)] < 0)
          quad(cellVert[C(i - 1, j - 1, k)], cellVert[C(i, j - 1, k)], cellVert[C(i, j, k)], cellVert[C(i - 1, j, k)], !v0);
      }
  // (edges on the grid's first rows touch cells outside it: the padding keeps the surface off them)

  // Onto the surface, normals from the slope, the region, the occlusion.
  const nv = pos.length / 3;
  const position = new Float32Array(nv * 3);
  const normal = new Float32Array(nv * 3);
  const region = new Float32Array(nv);
  const paint = new Float32Array(nv);
  const paintW = new Float32Array(nv);
  const occlusion = new Float32Array(nv);
  const e = h * 0.5;
  const steps = pass.ao ?? [1.5, 3, 6, 12].map((m) => m * h);
  for (let v = 0; v < nv; v++) {
    let x = pos[v * 3];
    let y = pos[v * 3 + 1];
    let z = pos[v * 3 + 2];
    let gx = 0;
    let gy = 0;
    let gz = 0;
    for (let it = 0; it < 2; it++) {
      const d = s.distance(x, y, z);
      gx = s.distance(x + e, y, z) - s.distance(x - e, y, z);
      gy = s.distance(x, y + e, z) - s.distance(x, y - e, z);
      gz = s.distance(x, y, z + e) - s.distance(x, y, z - e);
      const g = Math.sqrt(gx * gx + gy * gy + gz * gz) / (2 * e);
      if (g < 1e-6) break;
      gx /= 2 * e * g;
      gy /= 2 * e * g;
      gz /= 2 * e * g;
      // (a step onto the surface, never more than half a cell: sharp creases stay where the grid put them)
      const step = Math.max(-0.5 * h, Math.min(0.5 * h, d / g));
      x -= gx * step;
      y -= gy * step;
      z -= gz * step;
    }
    const sunk = pass.sink ? pass.sink(x, y, z) : 0;
    position[v * 3] = x - gx * sunk;
    position[v * 3 + 1] = y - gy * sunk;
    position[v * 3 + 2] = z - gz * sunk;
    normal[v * 3] = gx;
    normal[v * 3 + 1] = gy;
    normal[v * 3 + 2] = gz;
    region[v] = s.clayAt(x, y, z);
    // (paint edges fade over about a cell, so they read as lines, not the mesh's zigzag)
    const pt = s.paintAt(x, y, z, h * 0.75);
    paint[v] = pt.region;
    paintW[v] = pt.weight;
    let dark = 0;
    let w = 0.5;
    for (const t of steps) {
      dark += w * Math.max(0, t - s.distance(x + gx * t, y + gy * t, z + gz * t)) / t;
      w *= 0.5;
    }
    occlusion[v] = Math.max(0.15, 1 - occ * dark * 1.1);
  }

  return { position, normal, region, paint, paintW, occlusion, index: idx };
}

function dist2(p: number[], a: number, b: number): number {
  const dx = p[a * 3] - p[b * 3];
  const dy = p[a * 3 + 1] - p[b * 3 + 1];
  const dz = p[a * 3 + 2] - p[b * 3 + 2];
  return dx * dx + dy * dy + dz * dz;
}
