import { Matrix4, PerspectiveCamera } from 'three';
import { hash3 } from '../../voxel/random';
import { CELL, fbm, SURFACE, type HeightField } from '../heightfield';
import { OVERVIEW, PLACES } from '../layout';
import { CAM_REACH, roamDistance } from '../terrain/views';
import type { Species } from './species';

/**
 * Where the jungle grows. Rules, like the concept art:
 *  - dense on the mesa tops, a little lighter in the lowlands, in big
 *    patches (fractal noise) with glades between them;
 *  - a row of trees along the cliff lips, their crowns hanging over the edge;
 *  - clearings round the landmarks (a ring that thickens away from the pad),
 *    no crown over a pad or the road (`field.occupy` marks them);
 *  - thin on steep ground; palms and bushes by the rivers;
 *  - everywhere the roaming explorer and his camera go; beyond that (the
 *    sinking edges) only where a map camera can see (overview and the six
 *    place views).
 * Everything is seeded: the same jungle every run.
 */

export interface TreeSpot {
  x: number;
  z: number;
  /** Ground height under the trunk (m). */
  y: number;
  kind: Species;
  /** Canopy radius (m). */
  r: number;
  /** Size class 0 (small) ‥ 2 (large). */
  size: number;
  /** Level of detail as the overview sees it (`lodAt`): its size and spacing. */
  lod: number;
  /** The cells it is built of (`cellLod`): 0 = 1 m, 1 = 1.5 m, 2 = 2 m, 3 = 3 m. */
  cell: number;
  /** Prototype pick, turn and mirror (from a hash). */
  seed: number;
}

/** Map cameras: the overview and every place's close view. */
function cameraMatrices(): Matrix4[] {
  const views = [{ pos: OVERVIEW.pos, target: OVERVIEW.target }, ...PLACES.map((p) => p.focus)];
  return views.map((v) => {
    const cam = new PerspectiveCamera(OVERVIEW.fov + 6, 16 / 9, 1, 5000);
    cam.position.set(...v.pos);
    cam.lookAt(...v.target);
    cam.updateMatrixWorld();
    return new Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  });
}

/** Seen by the roaming camera, or by any map camera (with a margin for wide windows and the camera's sway). */
function makeSeen(): (x: number, y: number, z: number) => boolean {
  const ms = cameraMatrices().map((m) => m.elements.slice());
  return (x, y, z) => {
    if (roamDistance(x, z) < CAM_REACH) return true;
    for (const e of ms) {
      const w = e[3] * x + e[7] * y + e[11] * z + e[15];
      if (w <= 0) continue;
      const nx = (e[0] * x + e[4] * y + e[8] * z + e[12]) / w;
      const ny = (e[1] * x + e[5] * y + e[9] * z + e[13]) / w;
      if (Math.abs(nx) < 1.45 && ny > -1.25 && ny < 1.3) return true;
    }
    return false;
  };
}

/** Half width of the road (m), the gap crowns keep from its edge, and their distance from a beacon's centre. */
const ROAD_HALF = 2;
const ROAD_MARGIN = 2.5;
const BEACON_CLEAR = 9;

/** Cell size (m) per level of detail. */
export const LOD_CELL = [1, 1.5, 2, 3];

const FOCUS = PLACES.map((p) => p.focus.pos);

/**
 * Level of detail by distance from the overview camera: 1 m cells up to
 * ~250 m (a 1 m block is 3+ px there), 1.5 m to ~400 m (the summit), then
 * 2 m cells and a plain-box mesh; 3 m cells beyond ~560 m where no place's
 * close view comes near (the back hills, the far side of the holy mountain).
 * The jungle is planted by it (how thick, how big the crowns), as the
 * overview sees it; the cells may be smaller (`cellLod`).
 */
export function lodAt(x: number, y: number, z: number): number {
  const [cx, cy, cz] = OVERVIEW.pos;
  const d = Math.hypot(x - cx, y - cy, z - cz);
  if (d > 560 && FOCUS.every(([fx, fy, fz]) => Math.hypot(x - fx, y - fy, z - fz) > 280)) return 3;
  return z < -330 || d > 400 ? 2 : d > 250 ? 1 : 0;
}

/**
 * The cells a tree is built of: its level of detail, but no bigger than
 * 2 m where the roaming explorer goes (from the ground, leaves bigger than
 * the land's 2 m blocks look like boxes).
 */
export function cellLod(lod: number, x: number, z: number): number {
  return lod === 3 && roamDistance(x, z) < CAM_REACH ? 2 : lod;
}

/** Spatial hash of placed trees, for spacing. */
class Spacing {
  private readonly cells = new Map<number, TreeSpot[]>();
  private readonly size = 12;
  private k(i: number, k: number) {
    return (i + 200) * 1000 + (k + 200);
  }
  add(t: TreeSpot): void {
    const kk = this.k(Math.floor(t.x / this.size), Math.floor(t.z / this.size));
    let l = this.cells.get(kk);
    if (!l) this.cells.set(kk, (l = []));
    l.push(t);
  }
  /** True when no tree is closer than the pair's spacing. */
  fits(x: number, z: number, r: number, kind: Species, lod: number): boolean {
    const reach = r + 9;
    const i0 = Math.floor((x - reach) / this.size);
    const i1 = Math.floor((x + reach) / this.size);
    const k0 = Math.floor((z - reach) / this.size);
    const k1 = Math.floor((z + reach) / this.size);
    for (let k = k0; k <= k1; k++)
      for (let i = i0; i <= i1; i++) {
        const l = this.cells.get(this.k(i, k));
        if (!l) continue;
        for (const t of l) {
          const d = Math.hypot(t.x - x, t.z - z);
          if (d < pairSpacing(kind, t.kind, lod) * (r + t.r)) return false;
        }
      }
    return true;
  }
}

/** Share of the two crown radii two trunks must keep apart (below 1: crowns overlap). */
function pairSpacing(a: Species, b: Species, lod: number): number {
  if (a === 'emergent' || b === 'emergent') return a === b ? 1.1 : 0.42;
  if (a === 'bush' || b === 'bush') return a === b ? 0.8 : 0.62;
  if (a === 'palm' || b === 'palm') return 0.6;
  return [0.62, 0.62, 0.56, 0.56][lod];
}

const smooth = (a: number, b: number, t: number) => {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

export interface ScatterOptions {
  /** Overall density multiplier (1 = the tuned jungle). */
  density: number;
  /**
   * Grove threshold on the patch noise (0‥1, higher = fewer groves): mesa
   * tops, low ground, extra per level of detail and on the back of the map
   * (behind the summit: the hills and the holy mountain, seen through haze).
   */
  grove: { top: number; low: number; lod: number[]; back: number };
  /** How much the ring round each landmark thickens the jungle (added to the patch noise). */
  halo: number;
  /** The same for high ground (30 m and up). */
  high: number;
  /** Density in the glades between groves, per level of detail. */
  glade: number[];
  /** Chance per cliff-lip cell of a tree on the edge, and its factor per level of detail. */
  lip: number;
  lipLod: number[];
}

export function scatterTrees(f: HeightField, opts: ScatterOptions): TreeSpot[] {
  const seen = makeSeen();
  const spots: TreeSpot[] = [];
  const spacing = new Spacing();

  // Near a river (water within reach): banks count as open ground for crowns.
  const river = new Uint8Array(f.nx * f.nz);
  for (const r of f.rivers)
    for (let s = 0; s < r.samples.length; s += 2) {
      const sm = r.samples[s];
      const reach = sm.w / 2 + 8;
      for (let dz = -reach; dz <= reach; dz += CELL)
        for (let dx = -reach; dx <= reach; dx += CELL) {
          const c = f.index(sm.x + dx, sm.z + dz);
          if (c >= 0) river[c] = 1;
        }
    }
  const nearRiver = (x: number, z: number) => {
    const c = f.index(x, z);
    return c >= 0 && river[c] === 1;
  };
  // Distance to the road's centre line (m, per cell, up to 20 m): crowns keep
  // back from the golden line so it reads unbroken from the overview.
  const roadDist = new Float32Array(f.nx * f.nz).fill(1e9);
  for (const p of f.paths)
    for (const sm of p.samples) {
      const i0 = Math.max(0, Math.floor((sm.x - 20 - f.x0) / CELL));
      const i1 = Math.min(f.nx - 1, Math.floor((sm.x + 20 - f.x0) / CELL));
      const k0 = Math.max(0, Math.floor((sm.z - 20 - f.z0) / CELL));
      const k1 = Math.min(f.nz - 1, Math.floor((sm.z + 20 - f.z0) / CELL));
      for (let k = k0; k <= k1; k++)
        for (let i = i0; i <= i1; i++) {
          const [cx, cz] = f.cellCenter(i, k);
          const d = Math.hypot(cx - sm.x, cz - sm.z);
          const c = i + k * f.nx;
          if (d < roadDist[c]) roadDist[c] = d;
        }
    }
  /** Clear of the road (half width 2 m + margin) and of the beacons for a crown of radius r. */
  const roadClear = (x: number, z: number, r: number, bush: boolean) => {
    const c = f.index(x, z);
    // Crowns reach ~1.15 r from the trunk; the cell grid is ±1.4 m.
    const need = bush ? r + 2 + 1.5 : r * 1.15 + ROAD_HALF + ROAD_MARGIN + 1.4;
    if (c >= 0 && roadDist[c] < need) return false;
    for (const p of PLACES) if (Math.hypot(x - p.anchor[0], z - p.anchor[2]) < r * 1.15 + BEACON_CLEAR) return false;
    return true;
  };
  /** Built on (a pad, the road, a landmark): no crown over it. */
  const built = (x: number, z: number) => {
    const c = f.index(x, z);
    if (c < 0) return false;
    if (!f.occupied[c]) return false;
    const s = f.surface[c];
    if (s === SURFACE.pad || s === SURFACE.path) return true;
    if (f.water[c] > -1000 || s === SURFACE.bed || s === SURFACE.sand) return false;
    return !river[c];
  };
  /** Distance to the nearest landmark pad's edge (m). */
  const padDist = (x: number, z: number) => {
    let d = Infinity;
    for (const p of PLACES) {
      const dx = Math.max(0, Math.abs(x - p.x) - p.pad[0]);
      const dz = Math.max(0, Math.abs(z - p.z) - p.pad[1]);
      d = Math.min(d, Math.hypot(dx, dz));
    }
    return d;
  };
  /**
   * The ring of thick jungle round the landmarks, 0‥1: from a few metres off
   * the pad out to about its own size (the summit temple's ring is widest).
   */
  const halo = (x: number, z: number) => {
    let h = 0;
    for (const p of PLACES) {
      const dx = Math.max(0, Math.abs(x - p.x) - p.pad[0]);
      const dz = Math.max(0, Math.abs(z - p.z) - p.pad[1]);
      const d = Math.hypot(dx, dz);
      const reach = Math.max(p.pad[0], p.pad[1]) + 25;
      h = Math.max(h, smooth(3, 12, d) * (1 - smooth(reach * 0.6, reach * 1.2, d)));
    }
    return h;
  };
  /** Steepness: largest rise or fall within 6 m (m). */
  const steep = (x: number, z: number, y: number) => {
    let m = 0;
    for (const [dx, dz] of [
      [6, 0],
      [-6, 0],
      [0, 6],
      [0, -6],
    ])
      m = Math.max(m, Math.abs(f.heightAt(x + dx, z + dz) - y));
    return m;
  };
  /**
   * Jungle density at a point, 0‥1: groves (fractal noise over a threshold,
   * lower on the mesa tops so they are thicker) with open glades between
   * them where only a tree here and there stands.
   */
  const density = (x: number, z: number, y: number) => {
    const patch = fbm(x / 70, z / 70, 404);
    const lod = lodAt(x, y, z);
    const t = (y >= 14 ? opts.grove.top : opts.grove.low) + opts.grove.lod[lod] + (z < -330 ? opts.grove.back : 0);
    const glade = opts.glade[lod];
    // Thicker jungle hugging the landmarks (ruins in the forest), a small clearing right round the pad.
    // High mesas (the summit tiers, the western cliffs) wear the thickest jungle.
    const high = y >= 30 ? opts.high : 0;
    let d = glade + (1 - glade) * smooth(t - 0.05, t + 0.05, patch + halo(x, z) * opts.halo + high);
    d *= 0.1 + 0.9 * smooth(2, 12, padDist(x, z));
    // Steep ground: thin.
    d *= 1 - 0.7 * smooth(6, 16, steep(x, z, y));
    return Math.min(1, d * opts.density);
  };
  /** Crown clear of pads and the road (a few samples round the trunk). */
  const crownClear = (x: number, z: number, r: number) => {
    if (built(x, z)) return false;
    const rr = r * 0.8;
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      if (built(x + Math.cos(ang) * rr, z + Math.sin(ang) * rr)) return false;
    }
    return true;
  };
  /** Ground a tree may stand on: `isFree`, or a cliff lip (grass, dirt or bare rock). */
  const standable = (x: number, z: number, lip: boolean) => {
    if (f.isFree(x, z)) return true;
    if (!lip) return false;
    const c = f.index(x, z);
    if (c < 0 || f.occupied[c] || f.water[c] > -1000) return false;
    const s = f.surface[c];
    return s === SURFACE.grass || s === SURFACE.dirt || s === SURFACE.rock;
  };
  const place = (t: TreeSpot, lip = false): boolean => {
    if (!standable(t.x, t.z, lip)) return false;
    if (!seen(t.x, t.y + t.r, t.z)) return false;
    if (!spacing.fits(t.x, t.z, t.r, t.kind, t.lod)) return false;
    if (!crownClear(t.x, t.z, t.kind === 'bush' ? t.r * 0.8 : t.r)) return false;
    if (!roadClear(t.x, t.z, t.r, t.kind === 'bush')) return false;
    spacing.add(t);
    spots.push(t);
    return true;
  };
  const spot = (x: number, z: number, kind: Species, size: number, r: number, seed: number): TreeSpot => {
    const y = f.heightAt(x, z);
    const lod = lodAt(x, y, z);
    return { x, z, y, kind, size, r, lod, cell: cellLod(lod, x, z), seed };
  };
  const { x0, z0, nx, nz } = f;
  const x1 = x0 + nx * CELL;
  const z1 = z0 + nz * CELL;

  // 1. Emergents: a few tall crowns over the canopy.
  for (let z = z0; z < z1; z += 16)
    for (let x = x0; x < x1; x += 16) {
      const h = hash3(x, z, 1, 11);
      const px = x + hash3(x, z, 2, 11) * 16;
      const pz = z + hash3(x, z, 3, 11) * 16;
      const y = f.heightAt(px, pz);
      // Only inside groves (alone in a glade they look like lollipops).
      const d = density(px, pz, y);
      if (d < 0.7 || h > 0.15 * d) continue;
      const r = 5 + hash3(x, z, 4, 11) * 2;
      place(spot(Math.floor(px), Math.floor(pz), 'emergent', 2, r, Math.floor(hash3(x, z, 5, 11) * 1e6)));
    }

  // 2. Cliff lips: a row of trees on the edge, crowns over the drop.
  for (let k = 0; k < nz; k++)
    for (let i = 0; i < nx; i++) {
      const [x, z] = f.cellCenter(i, k);
      const drop = f.dropAt(x, z);
      if (drop < CELL * 3) continue;
      const y = f.heightAt(x, z);
      const run = fbm(x / 30, z / 30, 505);
      if (hash3(i, k, 7, 12) > opts.lip * smooth(0.3, 0.5, run) * Math.min(1, opts.density) * opts.lipLod[lodAt(x, y, z)]) continue;
      if (padDist(x, z) < 6) continue;
      const size = hash3(i, k, 8, 12) < 0.4 ? 2 : 1;
      const r = size === 2 ? 4.2 + hash3(i, k, 9, 12) * 0.8 : 3.2 + hash3(i, k, 9, 12) * 0.8;
      const lod = lodAt(x, y, z);
      const t: TreeSpot = { x: Math.floor(x), z: Math.floor(z), y, kind: 'broadleaf', size, r, lod, cell: cellLod(lod, x, z), seed: Math.floor(hash3(i, k, 10, 12) * 1e6) };
      place(t, true);
    }

  // 3. The canopy: broadleaf trees, palms by the water, a few in flower.
  // Crowns grow a little with distance (they read as clumps, and cost less per square metre).
  const STEP = [3, 4, 5, 7];
  const RADII = [
    [3, 3.8, 4.6],
    [3.4, 4.2, 5.2],
    [4, 5, 6],
    [5, 6, 7],
  ];
  for (const lod of [0, 1, 2, 3]) {
    const step = STEP[lod];
    for (let z = z0; z < z1; z += step)
      for (let x = x0; x < x1; x += step) {
        const px = x + hash3(x, z, 1, 13) * step;
        const pz = z + hash3(x, z, 2, 13) * step;
        const y = f.heightAt(px, pz);
        if (lodAt(px, y, pz) !== lod) continue;
        if (hash3(x, z, 3, 13) > density(px, pz, y)) continue;
        const wet = nearRiver(px, pz);
        const r0 = hash3(x, z, 4, 13);
        const r1 = hash3(x, z, 5, 13);
        let kind: Species = 'broadleaf';
        if (r0 < (wet ? 0.3 : y < 14 ? 0.09 : 0.04)) kind = 'palm';
        else if (r0 > 0.975) kind = 'flowering';
        const size = r1 < 0.3 ? 0 : r1 < 0.78 ? 1 : 2;
        const r = kind === 'palm' ? 3.5 : RADII[lod][size] + ((r1 * 7) % 1) * 0.7;
        place(spot(Math.floor(px), Math.floor(pz), kind, size, r, Math.floor(hash3(x, z, 6, 13) * 1e6)));
      }
  }

  // 4. Bushes in the gaps, most at the edges of the forest and by the water.
  for (let z = z0; z < z1; z += 4)
    for (let x = x0; x < x1; x += 4) {
      const px = x + hash3(x, z, 1, 14) * 4;
      const pz = z + hash3(x, z, 2, 14) * 4;
      const y = f.heightAt(px, pz);
      if (lodAt(px, y, pz) !== 0) continue;
      const d = density(px, pz, y);
      const p = (nearRiver(px, pz) ? 0.4 : 0.22) * Math.min(1, 0.4 + d);
      if (hash3(x, z, 3, 14) > p) continue;
      const r = 1.6 + hash3(x, z, 4, 14) * 1.2;
      place(spot(Math.floor(px), Math.floor(pz), 'bush', 0, r, Math.floor(hash3(x, z, 5, 14) * 1e6)));
    }
  return spots;
}
