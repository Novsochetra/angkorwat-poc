import { Matrix4, type InstancedMesh } from 'three';
import { hash3 } from '../../voxel/random';
import { fbm, SURFACE, type HeightField } from '../heightfield';
import * as P from '../terrain/palette';
import { ROAM_AREA } from '../terrain/views';
import type { MapPart } from '../types';

/**
 * The land as the mini-map and the big map draw it: the map seen straight
 * from above, 1 m per texel, made once from the height field (ground
 * colours, water) and the top blocks of the temples, the road and the
 * jungle (in their own colours). So the mesas read from above, their
 * cliffs are drawn as a band of warm rock at their foot (as wide as the
 * cliff is high, up to 6 m), their lips catch the light, higher ground is
 * a little lighter, and everything is hill-shaded and casts a shadow from
 * the north-west. The roads are painted over as a gold line. Past the
 * roaming area the land fades into the mist.
 *
 * Two versions: by day, and moonlit (blue and dim, the road glowing), made
 * from the day one when it is first wanted.
 *
 * Both are made a slice at a time (`LandBuilder.step(ms)`, `moonlight(ms)`),
 * so the work spreads over a few frames instead of stalling one.
 */
export interface LandPicture {
  /** Map point of the picture's top-left corner (m), and metres per texel. */
  readonly x0: number;
  readonly z0: number;
  readonly res: number;
  readonly w: number;
  readonly h: number;
  readonly day: HTMLCanvasElement;
  /** The moonlit picture, once `moonlight` has made it. */
  readonly night: HTMLCanvasElement | null;
  /** Make the moonlit picture, working at most about `ms` now: true once it is made. */
  moonlight(ms: number): boolean;
  /** Time spent making the day picture (ms, all slices) and blocks drawn from the parts. */
  readonly ms: number;
  readonly blocks: number;
}

/** Makes the land picture a slice at a time. */
export class LandBuilder {
  private readonly job: Generator<number, LandPicture, void>;
  picture: LandPicture | null = null;
  constructor(field: HeightField, parts: readonly MapPart[]) {
    this.job = landSteps(field, parts);
  }
  /** Work at most about `ms` (Infinity: to the end); the picture once it is made. */
  step(ms: number): LandPicture | null {
    const end = performance.now() + ms;
    while (!this.picture) {
      const r = this.job.next();
      if (r.done) this.picture = r.value;
      else if (performance.now() >= end) break;
    }
    return this.picture;
  }
}

/** Beyond the land (the sea of mist), by day and by night (sRGB; the night one is the day one moonlit). */
export const MIST = { day: 0x56656e, night: 0x23324f };

/** Parts whose blocks are drawn (the rest is land from the height field, or moves). */
const DRAWN = (name: string) => name.startsWith('landmark') || name === 'path' || name === 'vegetation';
/** Block families left out: light, water. */
const SKIP_FAMILY = new Set(['glow', 'water', 'wax']);

const WATER_SHALLOW = 0x4cc2b4;
const WATER_DEEP = 0x1d7d93;
/** Cliff bands, by height (a band every 4 m): warm sandstone like the art's cliffs. */
const CLIFF = [...P.STRATA_KINDS.ochre, ...P.STRATA_KINDS.rust, ...P.STRATA_KINDS.pale, ...P.STRATA_KINDS.redBrown];
const ROAD = { casing: 'rgba(58, 34, 12, 0.55)', line: '#f2b64a', hi: '#ffe07c', glow: '' };
const ROAD_NIGHT = { casing: 'rgba(8, 10, 24, 0.6)', line: '#ffb648', hi: '#ffe7a0', glow: 'rgba(255, 170, 60, 0.9)' };

const _m = new Matrix4();

/** The work, cut into slices: it yields the time spent since the last slice. */
function* landSteps(field: HeightField, parts: readonly MapPart[]): Generator<number, LandPicture, void> {
  let busy = 0;
  let t0 = performance.now();
  /** Time of this slice (ms); the next one starts after the yield. */
  const lap = () => {
    const now = performance.now();
    busy += now - t0;
    t0 = now;
    return busy;
  };
  const { nx, nz, height, water, surface } = field;
  const W = nx * 2;
  const H = nz * 2;
  const n = W * H;
  const x0 = field.x0;
  const z0 = field.z0;

  // ── Ground, per 2 m cell: colour and light ───────────────────────────────
  const cellCol = new Uint32Array(nx * nz);
  const cellLight = new Float32Array(nx * nz);
  const cellTop = new Float32Array(nx * nz);
  const cellWet = new Uint8Array(nx * nz);
  // Grass patches: dry and lush, on an 8 m grid (like the terrain's).
  const pw = (nx >> 2) + 1;
  const patch = new Float32Array(pw * ((nz >> 2) + 1));
  for (let b = 0; b * 4 < nz; b++) for (let a = 0; a < pw; a++) patch[a + b * pw] = fbm((x0 + a * 8) / 60, (z0 + b * 8) / 60, 55, 2);
  /** Cells from the edge the relief looks at (the edges are mist anyway). */
  const M = 4;
  // (locals: the loop runs 234 000 times)
  const hash = hash3;
  const pick = P.pick;
  const { ROCK_TOP, DIRT, SAND, PATH, PAD, BED, GRASS, GRASS_DRY, GRASS_DARK } = P;
  const { rock, dirt, sand, path, pad, bed } = SURFACE;
  // (a row at a time: small functions get fast sooner than one long loop)
  const cellRow = (k: number) => {
    for (let i = 0; i < nx; i++) {
      const c = i + k * nx;
      const h = height[c];
      if (water[c] > -1000) {
        cellCol[c] = bankNear(field, i, k) ? WATER_SHALLOW : WATER_DEEP;
        cellTop[c] = h > water[c] ? h : water[c];
        cellLight[c] = 1;
        cellWet[c] = 1;
        continue;
      }
      cellTop[c] = h;
      const r = hash(i, k, 3, 71);
      const inner = i >= M && k >= M && i < nx - M && k < nz - M;
      // A cliff above this cell: higher ground within 1‥4 cells, steeper than 5 m a cell.
      let rise = 0;
      let drop = 0;
      let slope = 0;
      if (inner) {
        for (let j = 1; j <= M; j++) {
          const up = Math.max(height[c - j], height[c + j], height[c - j * nx], height[c + j * nx]) - h;
          if (up >= 5 * j + 1 && up > rise) rise = up;
        }
        drop = h - Math.min(height[c - 1], height[c + 1], height[c - nx], height[c + nx]);
        slope = height[c + 1] - height[c - 1] + height[c + nx] - height[c - nx];
      }
      let col: number;
      let light = 1;
      if (rise > 0) {
        // Cliff foot: warm rock in bands by height.
        col = CLIFF[Math.floor(hash(Math.floor((h + rise * 0.5) / 4), 0, 0, 9) * CLIFF.length)];
        light = 0.78 + 0.1 * r;
      } else {
        const s = surface[c];
        if (s === rock) col = pick(ROCK_TOP, r);
        else if (s === dirt) col = pick(DIRT, r);
        else if (s === sand) col = pick(SAND, r);
        else if (s === path) col = pick(PATH, r);
        else if (s === pad) col = pick(PAD, r);
        else if (s === bed) col = pick(BED, r);
        else {
          const p = patch[(i >> 2) + (k >> 2) * pw];
          col = pick(p > 0.6 ? GRASS_DRY : p < 0.4 ? GRASS_DARK : GRASS, r);
        }
        // A lip: the ground drops away beside it (catches the light).
        if (drop >= 4) light = 1.22;
      }
      // Hill-shade (light from the north-west) and height (mesas a little lighter).
      light *= clamp(1 + 0.05 * slope, 0.7, 1.25) * (0.86 + 0.26 * clamp(h / 60, 0, 1));
      cellCol[c] = col;
      cellLight[c] = light;
    }
  };
  for (let k = 0; k < nz; k++) {
    cellRow(k);
    if (k % 24 === 23) {
      yield lap();
      t0 = performance.now();
    }
  }

  // ── Texels: the ground, then the top blocks of the temples, road and jungle ─
  const top = new Float32Array(n);
  const blockCol = new Uint32Array(n);
  for (let k = 0; k < H; k++) {
    const row = (k >> 1) * nx;
    const t0k = k * W;
    for (let i = 0; i < W; i++) top[t0k + i] = cellTop[row + (i >> 1)];
  }
  const lut = srgbLut();
  let blocks = 0;
  const meshes: InstancedMesh[] = [];
  for (const part of parts) {
    if (!DRAWN(part.name)) continue;
    part.object.updateMatrixWorld(true);
    part.object.traverse((o) => {
      const mesh = o as InstancedMesh;
      if (mesh.isInstancedMesh && mesh.count && mesh.instanceColor && !SKIP_FAMILY.has(mesh.name.slice(mesh.name.lastIndexOf(':') + 1))) meshes.push(mesh);
    });
  }
  yield lap();
  t0 = performance.now();
  for (const mesh of meshes) {
    {
      const arr = mesh.instanceMatrix.array as Float32Array;
      const colors = mesh.instanceColor!.array as Float32Array;
      const world = isIdentity(mesh.matrixWorld.elements) ? null : mesh.matrixWorld;
      for (let j = 0; j < mesh.count; j++) {
        let e: ArrayLike<number> = arr;
        let o16 = j * 16;
        if (world) {
          e = _m.fromArray(arr, o16).premultiply(world).elements;
          o16 = 0;
        }
        const hx = 0.5 * (Math.abs(e[o16]) + Math.abs(e[o16 + 4]) + Math.abs(e[o16 + 8]));
        const hy = 0.5 * (Math.abs(e[o16 + 1]) + Math.abs(e[o16 + 5]) + Math.abs(e[o16 + 9]));
        const hz = 0.5 * (Math.abs(e[o16 + 2]) + Math.abs(e[o16 + 6]) + Math.abs(e[o16 + 10]));
        const cx = e[o16 + 12] - x0;
        const cz = e[o16 + 14] - z0;
        const y1 = e[o16 + 13] + hy;
        // Texels whose centres the block covers (at least the one under its centre).
        let i0 = Math.ceil(cx - hx - 0.5);
        let i1 = Math.ceil(cx + hx - 0.5) - 1;
        let k0 = Math.ceil(cz - hz - 0.5);
        let k1 = Math.ceil(cz + hz - 0.5) - 1;
        if (i1 < i0) i0 = i1 = Math.floor(cx);
        if (k1 < k0) k0 = k1 = Math.floor(cz);
        if (i0 < 0) i0 = 0;
        if (k0 < 0) k0 = 0;
        if (i1 >= W) i1 = W - 1;
        if (k1 >= H) k1 = H - 1;
        if (i1 < i0 || k1 < k0) continue;
        const ci = j * 3;
        const col = (lut[toIdx(colors[ci])] << 16) | (lut[toIdx(colors[ci + 1])] << 8) | lut[toIdx(colors[ci + 2])] | 0x1000000;
        let hit = false;
        for (let k = k0; k <= k1; k++)
          for (let i = i0; i <= i1; i++) {
            const t = i + k * W;
            if (y1 <= top[t] + 0.05) continue;
            top[t] = y1;
            blockCol[t] = col;
            hit = true;
          }
        if (hit) blocks++;
      }
    }
    yield lap();
    t0 = performance.now();
  }

  // ── Light per texel: blocks shaded by their own relief; cast shadows; mist ─
  const dayPx = new Uint32Array(n);
  /** Water seen from above (the moonlit picture keeps it blue). */
  const wetPx = new Uint8Array(n);
  const [mr, mg, mb] = unpack(MIST.day);
  const A = ROAM_AREA;
  const S2 = 2 + 2 * W;
  const S4 = 4 + 4 * W;
  const S7 = 7 + 7 * W;
  const S11 = 11 + 11 * W;
  const lightRow = (k: number) => {
    const z = z0 + k + 0.5;
    // (the front edge has no sinking land past it: fade over its last 40 m instead)
    const oz = z < A.z0 ? A.z0 - z : z > A.z1 - 40 ? (z - A.z1 + 40) * 1.5 : 0;
    const row = (k >> 1) * nx;
    const up = k > 0 ? -W : 0;
    const down = k < H - 1 ? W : 0;
    const tk = k * W;
    for (let i = 0; i < W; i++) {
      const t = tk + i;
      const c = row + (i >> 1);
      const h = top[t];
      // Cast shadow: higher ground or crowns towards the light (a 42° sun).
      let sh = 0;
      if (i >= 11 && k >= 11) {
        if (top[t - S2] - h > 2.2) sh++;
        if (top[t - S4] - h > 4.4) sh++;
        if (top[t - S7] - h > 7.7) sh++;
        if (top[t - S11] - h > 12.1) sh++;
      }
      const bc = blockCol[t];
      let base: number;
      let s: number;
      if (bc) {
        base = bc & 0xffffff;
        const gx = top[i < W - 1 ? t + 1 : t] - top[i > 0 ? t - 1 : t];
        const gz = top[t + down] - top[t + up];
        const hl = h < 70 ? h / 70 : 1;
        s = clamp(1 + 0.07 * (gx + gz), 0.72, 1.25) * (0.88 + 0.2 * hl) * (1 - 0.09 * sh);
      } else {
        base = cellCol[c];
        const wet = cellWet[c];
        wetPx[t] = wet;
        s = cellLight[c] * (1 - (wet ? 0.05 : 0.09) * sh);
      }
      let r = ((base >> 16) & 255) * s;
      let g = ((base >> 8) & 255) * s;
      let b = (base & 255) * s;
      // Past the roaming area: into the mist.
      const x = x0 + i + 0.5;
      const ox = x < A.x0 ? A.x0 - x : x > A.x1 ? x - A.x1 : 0;
      if (ox > 0 || oz > 0) {
        let f = Math.sqrt(ox * ox + oz * oz) / 90;
        if (f > 0.85) f = 0.85;
        r += (mr - r) * f;
        g += (mg - g) * f;
        b += (mb - b) * f;
      }
      // (ImageData texels: little-endian ABGR)
      dayPx[t] = (0xff000000 | ((b > 255 ? 255 : b) << 16) | ((g > 255 ? 255 : g) << 8) | (r > 255 ? 255 : r)) >>> 0;
    }
  };
  for (let k = 0; k < H; k++) {
    lightRow(k);
    if (k % 48 === 47) {
      yield lap();
      t0 = performance.now();
    }
  }

  const day = document.createElement('canvas');
  day.width = W;
  day.height = H;
  paint(day, dayPx, field, ROAD);
  let night: HTMLCanvasElement | null = null;
  let nightJob: Generator<void, Uint32Array, void> | null = null;
  return {
    x0,
    z0,
    res: 1,
    w: W,
    h: H,
    day,
    get night() {
      return night;
    },
    moonlight(ms) {
      if (night) return true;
      nightJob ??= moonlit(day, wetPx);
      const end = performance.now() + ms;
      for (;;) {
        const r = nightJob.next();
        if (r.done) {
          const cv = document.createElement('canvas');
          cv.width = W;
          cv.height = H;
          paint(cv, r.value, field, ROAD_NIGHT);
          night = cv;
          nightJob = null;
          return true;
        }
        if (performance.now() >= end) return false;
      }
    },
    ms: Math.round(lap()),
    blocks,
  };
}

/**
 * The moonlit picture, from the day one: blue and dim, water a clear night
 * blue (lighter than the land). (The roads are painted again over it.)
 */
function* moonlit(day: HTMLCanvasElement, wet: Uint8Array): Generator<void, Uint32Array, void> {
  const img = day.getContext('2d')!.getImageData(0, 0, day.width, day.height);
  const px = new Uint32Array(img.data.buffer);
  yield;
  const rows = (day.width * 64) | 0;
  for (let t0 = 0; t0 < px.length; t0 += rows) {
    moonRow(px, wet, t0, Math.min(px.length, t0 + rows));
    yield;
  }
  return px;
}

function moonRow(px: Uint32Array, wet: Uint8Array, from: number, to: number): void {
  for (let t = from; t < to; t++) {
    const p = px[t];
    const r = p & 255;
    const g = (p >> 8) & 255;
    const b = (p >> 16) & 255;
    let nr: number;
    let ng: number;
    let nb: number;
    if (wet[t]) {
      nr = r * 0.8;
      ng = g * 0.6;
      nb = b * 0.9 + 6;
    } else {
      const l = r * 0.3 + g * 0.59 + b * 0.11;
      nr = r * 0.16 + l * 0.16 + 6;
      ng = g * 0.2 + l * 0.2 + 10;
      nb = b * 0.2 + l * 0.34 + 24;
    }
    px[t] = (0xff000000 | ((nb > 255 ? 255 : nb) << 16) | (ng << 8) | nr) >>> 0;
  }
}

/** Put the texels on a canvas and paint the roads over them. */
function paint(cv: HTMLCanvasElement, px: Uint32Array, field: HeightField, road: typeof ROAD): void {
  const g = cv.getContext('2d')!;
  g.putImageData(new ImageData(new Uint8ClampedArray(px.buffer as ArrayBuffer, px.byteOffset, px.byteLength), cv.width, cv.height), 0, 0);
  g.lineCap = g.lineJoin = 'round';
  const line = (width: number, color: string, glow = '') => {
    g.lineWidth = width;
    g.strokeStyle = color;
    g.shadowColor = glow || 'transparent';
    g.shadowBlur = glow ? 6 : 0;
    for (const p of field.paths) {
      g.beginPath();
      p.samples.forEach((s, j) => (j ? g.lineTo(s.x - field.x0, s.z - field.z0) : g.moveTo(s.x - field.x0, s.z - field.z0)));
      g.stroke();
    }
  };
  line(7, road.casing);
  line(4, road.line, road.glow);
  line(1.4, road.hi);
  g.shadowBlur = 0;
}

/** A water cell within 2 cells of a bank (shallow, jade; the rest is deep teal). */
function bankNear(field: HeightField, i: number, k: number): boolean {
  const { nx, nz, water } = field;
  for (let dk = -2; dk <= 2; dk++)
    for (let di = -2; di <= 2; di++) {
      const ii = i + di;
      const kk = k + dk;
      if (ii < 0 || kk < 0 || ii >= nx || kk >= nz || water[ii + kk * nx] < -1000) return true;
    }
  return false;
}

/** Linear 0‥1 (block colours) → sRGB byte, in 4096 steps. */
function srgbLut(): Uint8Array {
  const lut = new Uint8Array(4096);
  for (let j = 0; j < 4096; j++) {
    const v = j / 4095;
    lut[j] = Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
  }
  return lut;
}
const toIdx = (v: number) => (v <= 0 ? 0 : v >= 1 ? 4095 : (v * 4095) | 0);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const unpack = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const isIdentity = (e: ArrayLike<number>) => e[0] === 1 && e[5] === 1 && e[10] === 1 && e[12] === 0 && e[13] === 0 && e[14] === 0 && e[1] === 0 && e[2] === 0 && e[4] === 0 && e[6] === 0 && e[8] === 0 && e[9] === 0;
