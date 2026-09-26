import { ClampToEdgeWrapping, DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, UnsignedByteType } from 'three';
import { hash3, valueNoise3 } from '../../voxel/random';

/**
 * The moon's face: the real near side, painted from code (seeded, the same
 * every run) into a small texture the sky dome maps onto the moon disc.
 * Full-moon light is flat, so the face is all albedo: dark grey seas
 * (maria) over bright, finely cratered highlands, and bright ray craters.
 *
 * Texture: the disc fills the square (x → east / right, y → north / up,
 * row 0 at the bottom, like the dome's disc coordinates).
 *  - r: albedo 0‥1 (seas ≈ 0.4, highlands ≈ 0.85, rays up to 1),
 *  - g: how much of a sea the point is (0‥1), for their bluer tint,
 *  - b: relief (0.5 flat; crater rims and rough highlands up, crater floors
 *    and the smooth seas down): the dome's terminator runs ragged with it,
 *    the rims catching the sunlight first.
 * Outside the disc it repeats the limb, so filtering at the edge stays on the face.
 */

/** Seas: latitude °N, longitude °E, radius (°), darkness 0‥1. The long ones are chains of blobs. Positions from lunar maps. */
const MARIA: [number, number, number, number][] = [
  // Mare Imbrium, with Sinus Iridum on its north-west shore.
  [33, -16, 19, 0.8],
  [42, -26, 10, 0.75],
  [45, -32, 5, 0.7],
  [24, -4, 7, 0.7],
  // Oceanus Procellarum: the broad dark west side, joined to Imbrium.
  [44, -48, 9, 0.72],
  [30, -55, 13, 0.8],
  [16, -60, 13, 0.82],
  [2, -54, 11, 0.78],
  [-8, -45, 9, 0.72],
  [22, -40, 11, 0.76],
  [8, -38, 9, 0.72],
  // Mare Insularum, Sinus Aestuum, Mare Cognitum.
  [8, -27, 8, 0.62],
  [11, -9, 5, 0.62],
  [-10, -23, 6, 0.64],
  // Mare Nubium, Mare Humorum.
  [-21, -16, 11, 0.62],
  [-14, -28, 7, 0.6],
  [-24, -39, 7, 0.8],
  // Mare Frigoris: a long thin band in the far north.
  [55, -40, 4.5, 0.55],
  [57, -24, 5, 0.6],
  [58, -8, 5, 0.6],
  [58, 8, 5, 0.58],
  [57, 22, 4.5, 0.55],
  // Mare Serenitatis, Lacus Somniorum, Mare Vaporum, Sinus Medii.
  [28, 17.5, 11.5, 0.72],
  [37, 31, 5.5, 0.5],
  [14, 4, 5, 0.64],
  [3, 2, 3.5, 0.52],
  // Mare Tranquillitatis: dark and bluish, ragged, joined to Serenitatis and Fecunditatis.
  [8, 31, 12, 0.9],
  [4, 23, 7.5, 0.86],
  [16, 37, 7, 0.86],
  [18, 25, 6, 0.82],
  [-4, 27, 4, 0.75],
  // Mare Crisium: dark, alone near the east limb.
  [17, 59, 9, 0.92],
  // Mare Fecunditatis, Mare Nectaris.
  [-7, 53, 10, 0.75],
  [0, 43, 6, 0.74],
  [-16, 52, 7, 0.7],
  [-15, 35, 6, 0.72],
  // Small seas on the east limb.
  [1, 66, 3.5, 0.6],
  [7, 69, 3.5, 0.6],
  [13, 86, 6, 0.6],
  [-1, 87, 6, 0.6],
  [57, 81, 5, 0.55],
  // Dark-floored craters: Grimaldi, Plato.
  [-5, -68, 3.4, 0.95],
  [51.6, -9.4, 1.8, 0.9],
];

/** Ray craters: latitude, longitude, crater radius (°), ray length (°), rays, brightness. */
const RAY_CRATERS: [number, number, number, number, number, number][] = [
  [-43.3, -11.2, 1.4, 62, 34, 0.55], // Tycho: the long rays over the south
  [9.6, -20.1, 1.5, 26, 26, 0.38], // Copernicus
  [8.1, -38, 0.6, 14, 18, 0.3], // Kepler
  [23.7, -47.4, 0.7, 9, 12, 0.35], // Aristarchus, the brightest spot
  [16.1, 46.8, 0.5, 14, 10, 0.25], // Proclus
  [-8.9, 61, 1.2, 8, 10, 0.18], // Langrenus
];

/** Texels across: the disc is ≈ 70 px on screen (≈ 140 on a Retina screen). */
const SIZE = 192;
const DEG = Math.PI / 180;

type V3 = [number, number, number];
const unit = (lat: number, lon: number): V3 => [Math.cos(lat * DEG) * Math.sin(lon * DEG), Math.sin(lat * DEG), Math.cos(lat * DEG) * Math.cos(lon * DEG)];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** Fractal value noise on the sphere (0‥1), `octaves` from size `scale`. */
function fbm(v: V3, scale: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const s = scale * (1 << o);
    sum += valueNoise3(v[0] * s + 17.3, v[1] * s + 5.1, v[2] * s + 9.7, seed + o) * amp;
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

let cached: DataTexture | null = null;

export function moonTexture(): DataTexture {
  if (cached) return cached;
  const maria = MARIA.map(([lat, lon, r, dark]) => ({ c: unit(lat, lon), r: r * DEG, cosMax: Math.cos(r * 1.5 * DEG), dark }));

  // Ray systems: per crater, the brightest ray in each direction (azimuth
  // bins) and how far it reaches; rays are thin straight streaks.
  const BINS = 720;
  const rays = RAY_CRATERS.map(([lat, lon, r, len, count, bright], k) => {
    const c = unit(lat, lon);
    // Tangent frame at the crater (e1 east, e2 north).
    const e1: V3 = [c[2], 0, -c[0]];
    const l1 = Math.hypot(e1[0], e1[2]);
    e1[0] /= l1;
    e1[2] /= l1;
    const e2: V3 = [c[1] * e1[2] - c[2] * e1[1], c[2] * e1[0] - c[0] * e1[2], c[0] * e1[1] - c[1] * e1[0]];
    const power = new Float32Array(BINS);
    const reach = new Float32Array(BINS);
    for (let i = 0; i < count; i++) {
      const at = hash3(i, k, 1, 71) * Math.PI * 2;
      const width = (0.012 + hash3(i, k, 2, 71) * 0.03) * Math.PI;
      const strength = 0.45 + hash3(i, k, 3, 71) * 0.55;
      const length = len * DEG * (0.35 + hash3(i, k, 4, 71) * 0.65);
      for (let b = 0; b < BINS; b++) {
        let da = Math.abs((b / BINS) * Math.PI * 2 - at);
        da = Math.min(da, Math.PI * 2 - da);
        const v = strength * Math.exp(-((da / width) ** 2));
        if (v > power[b]) {
          power[b] = v;
          reach[b] = length;
        }
      }
    }
    return { c, e1, e2, r: r * DEG, bright, power, reach };
  });

  // Small craters, stamped into their own layer first: bright rims and
  // ejecta, slightly darker floors; fewer on the seas (they are younger).
  const craters = new Float32Array(SIZE * SIZE);
  const px = (v: number) => ((v + 1) / 2) * SIZE - 0.5;
  for (let i = 0; i < 220; i++) {
    const lat = Math.asin(hash3(i, 0, 0, 83) * 2 - 1) / DEG;
    const lon = (hash3(i, 1, 0, 83) * 2 - 1) * 88;
    const c = unit(lat, lon);
    const sea = maria.some((m) => dot(c, m.c) > Math.cos(m.r * 0.9));
    if (sea && hash3(i, 2, 0, 83) < 0.75) continue;
    const r = (0.5 + 2.8 * hash3(i, 3, 0, 83) ** 3) * DEG;
    const fresh = hash3(i, 4, 0, 83) < 0.25 ? 1.4 : 0.8;
    const span = r * 2.2;
    const x0 = Math.max(0, Math.floor(px(c[0] - span)));
    const x1 = Math.min(SIZE - 1, Math.ceil(px(c[0] + span)));
    const y0 = Math.max(0, Math.floor(px(c[1] - span)));
    const y1 = Math.min(SIZE - 1, Math.ceil(px(c[1] + span)));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const vx = ((x + 0.5) / SIZE) * 2 - 1;
        const vy = ((y + 0.5) / SIZE) * 2 - 1;
        const r2 = vx * vx + vy * vy;
        if (r2 >= 1) continue;
        const d = Math.acos(Math.min(1, dot([vx, vy, Math.sqrt(1 - r2)], c))) / r;
        if (d > 2.2) continue;
        const rim = Math.exp(-(((d - 1) / 0.2) ** 2)) * 0.05;
        const floor = d < 0.85 ? -0.03 : 0;
        const ejecta = d > 1 ? 0.025 * (1 - smooth(1, 2.2, d)) : 0;
        craters[x + y * SIZE] += (rim + floor + ejecta) * fresh;
      }
    }
  }

  const data = new Uint8Array(SIZE * SIZE * 4);
  const v: V3 = [0, 0, 0];
  const w: V3 = [0, 0, 0];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let vx = ((x + 0.5) / SIZE) * 2 - 1;
      let vy = ((y + 0.5) / SIZE) * 2 - 1;
      let r2 = vx * vx + vy * vy;
      // Outside the disc: the nearest point of the limb.
      if (r2 > 0.995) {
        const s = Math.sqrt(0.995 / r2);
        vx *= s;
        vy *= s;
        r2 = 0.995;
      }
      v[0] = vx;
      v[1] = vy;
      v[2] = Math.sqrt(1 - r2);

      // Highlands: bright, mottled; brightest in the battered south.
      let albedo = 0.8 + (fbm(v, 5, 3, 3) - 0.5) * 0.16 + (valueNoise3(v[0] * 22, v[1] * 22, v[2] * 22, 5) - 0.5) * 0.1 - vy * 0.03;
      // Seas: the point bent by noise (so no round blobs) and ragged shores,
      // a little variation inside.
      w[0] = v[0] + (fbm(v, 3.5, 2, 41) - 0.5) * 0.22;
      w[1] = v[1] + (fbm(v, 3.5, 2, 43) - 0.5) * 0.22;
      w[2] = v[2] + (fbm(v, 3.5, 2, 47) - 0.5) * 0.22;
      const wl = Math.hypot(w[0], w[1], w[2]);
      w[0] /= wl;
      w[1] /= wl;
      w[2] /= wl;
      const shore = (fbm(v, 9, 3, 9) - 0.5) * 0.7;
      let sea = 0;
      for (const m of maria) {
        const cd = dot(w, m.c);
        if (cd < m.cosMax) continue;
        const d = Math.acos(Math.min(1, cd)) / m.r + shore;
        sea = Math.max(sea, (1 - smooth(0.72, 1.08, d)) * m.dark);
      }
      if (sea > 0) albedo += (0.5 - (fbm(v, 9, 2, 13) - 0.5) * 0.12 - albedo) * sea;
      albedo += craters[x + y * SIZE] * (1 - sea * 0.5);
      // (the highlands are rough, the seas low and smooth)
      const relief = 0.5 + craters[x + y * SIZE] * 4 + (fbm(v, 14, 3, 61) - 0.5) * 0.5 * (1 - sea) - 0.08 * sea;

      // Ray craters: a bright halo round each, and patchy rays that fade with distance.
      const patchy = 0.5 + 0.9 * valueNoise3(v[0] * 40, v[1] * 40, v[2] * 40, 29);
      for (const c of rays) {
        const cd = dot(v, c.c);
        const d = Math.acos(Math.min(1, Math.max(-1, cd)));
        const tx = v[0] - c.c[0] * cd;
        const ty = v[1] - c.c[1] * cd;
        const tz = v[2] - c.c[2] * cd;
        const az = Math.atan2(tx * c.e2[0] + ty * c.e2[1] + tz * c.e2[2], tx * c.e1[0] + ty * c.e1[1] + tz * c.e1[2]);
        const b = Math.floor(((az / (Math.PI * 2) + 1) % 1) * BINS) % BINS;
        const along = d / Math.max(c.reach[b], 1e-4);
        // (rays start at the rim: no bright star in the middle)
        const ray = along < 1 ? c.power[b] * (1 - along) ** 1.4 * smooth(c.r * 1.5, c.r * 8, d) * patchy : 0;
        const halo = Math.exp(-((d / (c.r * 2.4)) ** 2));
        const crater = d < c.r ? 0.1 : Math.exp(-(((d - c.r) / (c.r * 0.35)) ** 2)) * 0.25;
        albedo += c.bright * (ray * 0.45 + halo * 0.3 + crater);
      }

      const i = (x + y * SIZE) * 4;
      data[i] = Math.round(Math.min(1, Math.max(0, albedo)) * 255);
      data[i + 1] = Math.round(Math.min(1, sea) * 255);
      data[i + 2] = Math.round(Math.min(1, Math.max(0, relief)) * 255);
      data[i + 3] = 255;
    }
  }
  const tex = new DataTexture(data, SIZE, SIZE, RGBAFormat, UnsignedByteType);
  tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  tex.name = 'moon face';
  cached = tex;
  return tex;
}
