import { valueNoise3 } from '../voxel/random';
import { MAP_BOUNDS, PATHS, PLACES, PLATEAUS, RIVERS, type Plateau } from './layout';
import { CAM_REACH, MAP_VIEWS, roamDistance, viewDistance } from './terrain/views';

/**
 * The land of the world map as a grid of columns: ground height, water level
 * and surface kind per 2 m cell. Built once from layout.ts; every other part
 * reads it (terrain blocks, trees, water, the road, the landmarks' pads).
 */

/** Size of one terrain column and of the height steps (m). */
export const CELL = 2;

export const SURFACE = {
  grass: 0,
  /** Bare rock top (cliff lips, steep ground). */
  rock: 1,
  dirt: 2,
  /** River bank. */
  sand: 3,
  /** Under the road. */
  path: 4,
  /** A landmark's flat pad. */
  pad: 5,
  /** River bed (under water). */
  bed: 6,
} as const;
export type SurfaceKind = (typeof SURFACE)[keyof typeof SURFACE];

/** Where a river drops off a cliff. */
export interface Waterfall {
  /** Lip of the fall: centre of the river where it goes over (m). */
  x: number;
  z: number;
  /** Water level above and below the fall (m). */
  top: number;
  bottom: number;
  /** River width (m). */
  width: number;
  /** Flow direction on the map (unit x, z). */
  dir: [number, number];
  river: string;
}

/** A point along a river, every metre downstream. */
export interface RiverSample {
  x: number;
  z: number;
  /** Water surface height (m). */
  level: number;
  /** Width (m). */
  w: number;
  /** Flow direction (unit x, z). */
  dir: [number, number];
}

/** A point along the road, every metre, on the ground. */
export interface PathSample {
  x: number;
  z: number;
  /** Ground height under it (m); over water: the water level. */
  y: number;
  /** Over a river (a bridge is needed). */
  wet: boolean;
}

const NO_WATER = -1e4;

/** 2D fractal value noise in [0, 1). */
export function fbm(x: number, z: number, seed: number, octaves = 3): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise3(x * f, z * f, 0.5 + o * 7.3, seed + o * 31) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

export class HeightField {
  readonly cell = CELL;
  readonly x0 = MAP_BOUNDS.x0;
  readonly z0 = MAP_BOUNDS.z0;
  readonly nx = Math.round((MAP_BOUNDS.x1 - MAP_BOUNDS.x0) / CELL);
  readonly nz = Math.round((MAP_BOUNDS.z1 - MAP_BOUNDS.z0) / CELL);
  /** Top of the ground per cell (m, a multiple of CELL). Index: i + k * nx. */
  readonly height: Float32Array;
  /** Water surface per cell (m), or below −1000 where there is none. */
  readonly water: Float32Array;
  readonly surface: Uint8Array;
  /** 1 where something is built or passes (pads, road, rivers): no trees there. */
  readonly occupied: Uint8Array;
  /**
   * Block size of the terrain per cell: 0 = 2 m columns, 1 = 4 m, 2 = 8 m.
   * All the land the roaming explorer can reach is fine; beyond it, land far
   * from every camera (or hidden from all of them) is coarse: its
   * 2 × 2 or 4 × 4 cells share one height, so everything that reads
   * `height` (trees, clouds) sits on the blocks that are drawn.
   */
  readonly lod: Uint8Array;
  readonly falls: Waterfall[] = [];
  readonly rivers: { name: string; samples: RiverSample[] }[] = [];
  readonly paths: { name: string; samples: PathSample[] }[] = [];

  constructor() {
    const n = this.nx * this.nz;
    this.height = new Float32Array(n);
    this.water = new Float32Array(n).fill(NO_WATER);
    this.surface = new Uint8Array(n);
    this.occupied = new Uint8Array(n);
    this.lod = new Uint8Array(n);
  }

  /** Cell index of a map point, or −1 outside the grid. */
  index(x: number, z: number): number {
    const i = Math.floor((x - this.x0) / CELL);
    const k = Math.floor((z - this.z0) / CELL);
    if (i < 0 || k < 0 || i >= this.nx || k >= this.nz) return -1;
    return i + k * this.nx;
  }

  /** Centre of cell (i, k) on the map (m). */
  cellCenter(i: number, k: number): [number, number] {
    return [this.x0 + (i + 0.5) * CELL, this.z0 + (k + 0.5) * CELL];
  }

  /** Ground top at a map point (m); outside the grid: 0. */
  heightAt(x: number, z: number): number {
    const c = this.index(x, z);
    return c < 0 ? 0 : this.height[c];
  }

  /** Water surface at a map point, or null where there is none. */
  waterAt(x: number, z: number): number | null {
    const c = this.index(x, z);
    return c < 0 || this.water[c] < -1000 ? null : this.water[c];
  }

  /** What you stand on: the ground, or the water surface above it. */
  standY(x: number, z: number): number {
    const w = this.waterAt(x, z);
    return w === null ? this.heightAt(x, z) : Math.max(w, this.heightAt(x, z));
  }

  surfaceAt(x: number, z: number): SurfaceKind {
    const c = this.index(x, z);
    return (c < 0 ? SURFACE.rock : this.surface[c]) as SurfaceKind;
  }

  /** Largest drop from this cell to one of its four neighbours (m): 0 on flat ground, big on a cliff lip. */
  dropAt(x: number, z: number): number {
    const c = this.index(x, z);
    if (c < 0) return 0;
    const i = c % this.nx;
    const k = (c - i) / this.nx;
    const h = this.height[c];
    let d = 0;
    if (i > 0) d = Math.max(d, h - this.height[c - 1]);
    if (i < this.nx - 1) d = Math.max(d, h - this.height[c + 1]);
    if (k > 0) d = Math.max(d, h - this.height[c - this.nx]);
    if (k < this.nz - 1) d = Math.max(d, h - this.height[c + this.nx]);
    return d;
  }

  /** Free for a tree or a rock: open grass or dirt, nothing built, not on a cliff lip, no water. */
  isFree(x: number, z: number): boolean {
    const c = this.index(x, z);
    if (c < 0 || this.occupied[c] || this.water[c] > -1000) return false;
    const s = this.surface[c];
    return (s === SURFACE.grass || s === SURFACE.dirt) && this.dropAt(x, z) <= CELL;
  }

  /** Mark a map rectangle as built on (m). */
  occupy(xa: number, za: number, xb: number, zb: number): void {
    const [i0, i1] = [Math.floor((Math.min(xa, xb) - this.x0) / CELL), Math.floor((Math.max(xa, xb) - this.x0) / CELL)];
    const [k0, k1] = [Math.floor((Math.min(za, zb) - this.z0) / CELL), Math.floor((Math.max(za, zb) - this.z0) / CELL)];
    for (let k = Math.max(0, k0); k <= Math.min(this.nz - 1, k1); k++)
      for (let i = Math.max(0, i0); i <= Math.min(this.nx - 1, i1); i++) this.occupied[i + k * this.nx] = 1;
  }
}

/** Height of one plateau at a point, or −Infinity outside it. */
function plateauHeight(p: Plateau, x: number, z: number, seed: number): number {
  const rough = p.rough ?? 0.1;
  const c = Math.cos(p.rot ?? 0);
  const s = Math.sin(p.rot ?? 0);
  const dx = x - p.x;
  const dz = z - p.z;
  const u = (dx * c + dz * s) / p.rx;
  const v = (-dx * s + dz * c) / p.rz;
  let d = Math.hypot(u, v);
  if (d > 1 + rough) return -Infinity;
  // Ragged edge: big bays and points, and a finer bite.
  d += (fbm(x / 34, z / 34, seed) - 0.5) * 2 * rough + (fbm(x / 9, z / 9, seed + 5, 2) - 0.5) * 0.5 * rough;
  if (d >= 1) return -Infinity;
  if (p.cone) {
    // Stepped mountain: flat summit, terraces `cone` metres high down to the foot.
    // Spurs and gullies run down the flanks (fading out toward the summit,
    // so the top and its temple stay as they are).
    const t = Math.min(1, (1 - d) / 0.72);
    const spur = (fbm(x / 44, z / 44, seed + 11) - 0.5) * p.cone * 3.2 * (1 - t * t);
    const h = p.top * Math.pow(t, 0.85) + (fbm(x / 16, z / 16, seed + 9) - 0.5) * p.cone * 1.2 + spur;
    return Math.min(p.top, Math.floor(h / p.cone) * p.cone);
  }
  let h = p.top;
  for (const l of p.ledges ?? []) if (d > l.at) h = p.top - l.drop;
  return h;
}

/** Low ground between the mesas (m): gentle hills 4–12 m. */
function baseHeight(x: number, z: number): number {
  return 8 + (fbm(x / 70, z / 70, 101) - 0.5) * 10;
}

const snap = (h: number) => Math.round(h / CELL) * CELL;

/** Width of the band along the west, east and north edges where the land sinks into the mist (m). */
const EDGE_FALL = 150;
/** Ground height at the very edge (m). */
const EDGE_Y = -16;

/**
 * The land sinks away toward the far edges of the map (not the front one,
 * which is under the camera), so no wall shows where the map ends. The steps
 * it makes face away from every camera.
 */
function edgeFall(x: number, z: number, h: number): number {
  let e = Math.min(x - MAP_BOUNDS.x0, MAP_BOUNDS.x1 - x, z - MAP_BOUNDS.z0);
  if (e >= EDGE_FALL + 35) return h;
  e += (fbm(x / 70, z / 70, 211) - 0.5) * 70;
  if (e >= EDGE_FALL) return h;
  const t = Math.max(0, e / EDGE_FALL);
  return EDGE_Y + (h - EDGE_Y) * t * t * (3 - 2 * t);
}

/** Build the land from layout.ts. */
export function buildHeightField(): HeightField {
  const f = new HeightField();
  const { nx, nz } = f;

  // Land: the highest of the low ground and every plateau.
  for (let k = 0; k < nz; k++)
    for (let i = 0; i < nx; i++) {
      const [x, z] = f.cellCenter(i, k);
      let h = baseHeight(x, z);
      PLATEAUS.forEach((p, n) => {
        h = Math.max(h, plateauHeight(p, x, z, 1000 + n * 17));
      });
      const c = i + k * nx;
      f.height[c] = snap(edgeFall(x, z, h));
      f.surface[c] = SURFACE.grass;
    }

  // Landmark pads: flat, exactly at the place's height (a cell of margin round them).
  for (const p of PLACES) {
    const [hx, hz] = p.pad;
    for (let k = 0; k < nz; k++)
      for (let i = 0; i < nx; i++) {
        const [x, z] = f.cellCenter(i, k);
        if (Math.abs(x - p.x) > hx + CELL || Math.abs(z - p.z) > hz + CELL) continue;
        const c = i + k * nx;
        f.height[c] = p.y;
        f.surface[c] = SURFACE.pad;
        f.occupied[c] = 1;
      }
  }

  // Rivers: the level follows the land down (never up); where the land drops
  // by a cliff, the river falls. Channels are carved one cell deep, with low banks.
  const near = new Float32Array(nx * nz).fill(1e9);
  const nearLevel = new Float32Array(nx * nz);
  const nearW = new Float32Array(nx * nz);
  for (const r of RIVERS) {
    const samples: RiverSample[] = [];
    let level = Infinity;
    for (let s = 0; s < r.points.length - 1; s++) {
      const [ax, az] = r.points[s];
      const [bx, bz] = r.points[s + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const dir: [number, number] = [(bx - ax) / len, (bz - az) / len];
      for (let t = 0; t < len; t += 1) {
        const x = ax + dir[0] * t;
        const z = az + dir[1] * t;
        level = Math.min(level, f.heightAt(x, z) - 1);
        samples.push({ x, z, level, w: r.w, dir });
      }
    }
    f.rivers.push({ name: r.name, samples });
    // Falls: level drops of 3 m or more, merged when a few metres apart.
    for (let s = 1; s < samples.length; s++) {
      if (samples[s - 1].level - samples[s].level < 3) continue;
      const lip = samples[s - 1];
      let e = s;
      while (e + 1 < samples.length && e - s < 4 && samples[e].level - samples[e + 1].level >= 1) e++;
      f.falls.push({ x: lip.x, z: lip.z, top: lip.level, bottom: samples[e].level, width: r.w, dir: lip.dir, river: r.name });
      s = e;
    }
    // Nearest sample per cell (within the banks).
    const reach = r.w / 2 + CELL * 1.5;
    for (const sm of samples) {
      const i0 = Math.floor((sm.x - reach - f.x0) / CELL);
      const i1 = Math.floor((sm.x + reach - f.x0) / CELL);
      const k0 = Math.floor((sm.z - reach - f.z0) / CELL);
      const k1 = Math.floor((sm.z + reach - f.z0) / CELL);
      for (let k = Math.max(0, k0); k <= Math.min(nz - 1, k1); k++)
        for (let i = Math.max(0, i0); i <= Math.min(nx - 1, i1); i++) {
          const [x, z] = f.cellCenter(i, k);
          const d = Math.hypot(x - sm.x, z - sm.z);
          const c = i + k * nx;
          if (d < near[c]) {
            near[c] = d;
            nearLevel[c] = sm.level;
            nearW[c] = sm.w;
          }
        }
    }
  }
  for (let c = 0; c < nx * nz; c++) {
    if (near[c] > 1e8) continue;
    const L = nearLevel[c];
    // (the level is always a column top minus 1 m, so L ± 1 are whole steps)
    if (near[c] <= nearW[c] / 2 + 0.5) {
      // Channel: the bed one step under the bank, the water 1 m over the bed.
      f.height[c] = Math.min(f.height[c], L - 1);
      f.water[c] = L;
      f.surface[c] = SURFACE.bed;
      f.occupied[c] = 1;
    } else if (f.height[c] > L + 1) {
      // Bank: cut down towards the water (at most two steps).
      f.height[c] = Math.max(L + 1, f.height[c] - CELL * 2);
      if (f.height[c] <= L + 2) f.surface[c] = SURFACE.sand;
      f.occupied[c] = 1;
    } else if (f.surface[c] !== SURFACE.pad) {
      f.surface[c] = SURFACE.sand;
      f.occupied[c] = 1;
    }
  }

  // Road: samples every metre on the ground; its cells turn to dirt and stay free of trees.
  for (const p of PATHS) {
    const samples: PathSample[] = [];
    for (let s = 0; s < p.points.length - 1; s++) {
      const [ax, az] = p.points[s];
      const [bx, bz] = p.points[s + 1];
      const len = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t < len; t += 1) {
        const x = ax + ((bx - ax) * t) / len;
        const z = az + ((bz - az) * t) / len;
        const w = f.waterAt(x, z);
        samples.push({ x, z, y: f.standY(x, z), wet: w !== null && w > f.heightAt(x, z) });
      }
    }
    const [lx, lz] = p.points[p.points.length - 1];
    samples.push({ x: lx, z: lz, y: f.standY(lx, lz), wet: false });
    f.paths.push({ name: p.name, samples });
    for (const sm of samples) {
      if (sm.wet) continue;
      f.occupy(sm.x - 2.5, sm.z - 2.5, sm.x + 2.5, sm.z + 2.5);
      const c = f.index(sm.x, sm.z);
      if (c >= 0 && f.surface[c] !== SURFACE.pad && f.surface[c] !== SURFACE.bed) f.surface[c] = SURFACE.path;
    }
  }

  coarsen(f);

  // Bare rock on cliff lips.
  for (let k = 0; k < nz; k++)
    for (let i = 0; i < nx; i++) {
      const c = i + k * nx;
      if (f.surface[c] !== SURFACE.grass) continue;
      const [x, z] = f.cellCenter(i, k);
      if (f.dropAt(x, z) >= CELL * 3 && fbm(x / 6, z / 6, 77, 2) > 0.55) f.surface[c] = SURFACE.rock;
    }
  return f;
}

/** Cells per LOD tile side (8 m). */
const TILE = 4;
/** Past the roaming area (m): 2 m columns as far as the follow camera goes, then 4 m ones this far out. */
const ROAM_MID = 110;

/**
 * Pick the block size of every 8 m tile (see `HeightField.lod`) from the
 * cameras that can see it, and give coarse tiles one height per 4 m or 8 m
 * block (the upper median of their cells). Tiles with a pad, road, river or
 * bank keep 2 m columns, and so does all the land the roaming explorer and
 * his camera get near; past it (the sinking edges, the far back) the roaming
 * camera only sees the land from afar.
 */
function coarsen(f: HeightField): void {
  const { nx, nz, height } = f;
  let top = -Infinity;
  for (let c = 0; c < nx * nz; c++) top = Math.max(top, height[c]);
  const hs: number[] = [];
  for (let b = 0; b < nz; b += TILE)
    for (let a = 0; a < nx; a += TILE) {
      const full = a + TILE <= nx && b + TILE <= nz;
      let forced = !full;
      let hmax = -Infinity;
      for (let k = b; k < Math.min(nz, b + TILE) && !forced; k++)
        for (let i = a; i < Math.min(nx, a + TILE); i++) {
          const c = i + k * nx;
          const s = f.surface[c];
          if (f.occupied[c] || f.water[c] > -1000 || (s !== SURFACE.grass && s !== SURFACE.rock && s !== SURFACE.dirt)) {
            forced = true;
            break;
          }
          hmax = Math.max(hmax, height[c]);
        }
      if (forced) continue;
      const x = f.x0 + (a + TILE / 2) * CELL;
      const z = f.z0 + (b + TILE / 2) * CELL;
      // (distance from the tile's nearest point)
      const dr = roamDistance(x, z) - (TILE * CELL) / 2;
      if (dr <= CAM_REACH) continue;
      let level = dr <= ROAM_MID ? 1 : 2;
      for (const v of MAP_VIEWS) {
        const d = viewDistance(v, x, hmax + 1, z);
        if (d < 0) continue;
        const want = d < v.fine ? 0 : d < v.mid ? 1 : 2;
        if (want >= level || occluded(f, x, hmax + 1, z, v.pos, top)) continue;
        level = want;
        if (level === 0) break;
      }
      if (level === 0) continue;
      const g = level === 2 ? TILE : TILE / 2;
      for (let gb = b; gb < b + TILE; gb += g)
        for (let ga = a; ga < a + TILE; ga += g) {
          hs.length = 0;
          for (let k = gb; k < gb + g; k++) for (let i = ga; i < ga + g; i++) hs.push(height[i + k * nx]);
          hs.sort((p, q) => p - q);
          const h = hs[hs.length >> 1];
          for (let k = gb; k < gb + g; k++)
            for (let i = ga; i < ga + g; i++) {
              height[i + k * nx] = h;
              f.lod[i + k * nx] = level;
            }
        }
    }
}

/** Is the straight line from a point to a camera blocked by the land? */
function occluded(f: HeightField, x: number, y: number, z: number, cam: readonly [number, number, number], top: number): boolean {
  const dx = cam[0] - x;
  const dy = cam[1] - y;
  const dz = cam[2] - z;
  const len = Math.hypot(dx, dy, dz);
  const step = 3;
  const sx = (dx / len) * step;
  const sy = (dy / len) * step;
  const sz = (dz / len) * step;
  let px = x + sx * 2;
  let py = y + sy * 2;
  let pz = z + sz * 2;
  for (let t = step * 2; t < len; t += step) {
    if (py > top) return false;
    const i = Math.floor((px - f.x0) / CELL);
    const k = Math.floor((pz - f.z0) / CELL);
    if (i >= 0 && k >= 0 && i < f.nx && k < f.nz && f.height[i + k * f.nx] > py) return true;
    px += sx;
    py += sy;
    pz += sz;
  }
  return false;
}
