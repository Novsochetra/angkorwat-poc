import { FLOWER, LITTER } from '../../kit/palette';
import { pick } from '../../voxel/random';

/**
 * The forest floor's plants, as a few chunky boxes each (≈ 0.05–0.5 m, the
 * voxel look of the map's trees and the explorer), written by the
 * undergrowth pool (veg/undergrowth.ts). Real sizes: sword fern ≈ 1 m
 * across, elephant ear (Alocasia) 1–1.8 m, grass tufts 0.3–0.6 m, ground
 * flowers 0.3–0.5 m, reeds 1–1.5 m, fallen logs 2.5–4 m, vines hanging
 * 3–8 m from the crowns.
 *
 * A plant is drawn in its own space (m): its foot at (0, 0, 0), +y up; the
 * pool turns and scales it where it grows. A box turns about y (`yaw`, its
 * +x end toward (cos, −sin)) and may tip about its own z axis (`tilt`: +
 * lifts its +x end, and leans a standing box's top toward −x).
 */
export interface PlantSink {
  /** A box: centre, size (m), turn about y and tip (rad), colour (sRGB) and brightness. */
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number, color: number, shade: number, tilt?: number): void;
}

/** Seeded stream for one plant (0‥1). */
export type Rand = () => number;

const FERN = [0x528541, 0x619848, 0x70a650, 0x5a8e44];
const FERN_TIP = [0x84b257, 0x92bc5e];
const EAR = [0x386b39, 0x42793f, 0x4d8646, 0x356436];
const EAR_LIT = [0x5c974c, 0x68a052];
const STALK = [0x6d8f4a, 0x7c9a52];
const GRASS = [0x7fa048, 0x93b050, 0x6d8f40, 0xa4b85a, 0x88a64c];
const REED = [0x5e7a3a, 0x6b8742, 0x566f35];
const CATTAIL = 0x6b4a2c;
const LOG = [0x5f4a36, 0x6b5440, 0x54412f];
const LOG_END = 0x9c7a55;
const MOSS = [0x5f7a36, 0x6d8a3c];
const FUNGUS = [0xe9dcc0, 0xd9924a];
const VINE = [0x5a7a34, 0x67883a, 0x51702f];
const VINE_LEAF = [0x4f7d38, 0x5d8a3e, 0x6c9844];
/** Soft ground flowers (periwinkle pink and white, wedelia yellow, apricot). */
export const FLOWER_SETS = [FLOWER.pink, FLOWER.cream, [0xeed58a, 0xe8c870], [0xeeae7a, 0xe89c68]] as const;

/** Segments of an arching frond or leaf: (length, width, angle up from level), from the foot out. */
function arch(p: PlantSink, a: number, x0: number, y0: number, segs: readonly (readonly [number, number, number])[], thick: number, colors: readonly number[], rand: Rand, tipColors = colors): void {
  const c = Math.cos(a);
  const s = Math.sin(a);
  let d = x0;
  let y = y0;
  segs.forEach(([len, w, up], i) => {
    const mx = d + (Math.cos(up) * len) / 2;
    const my = y + (Math.sin(up) * len) / 2;
    p.box(c * mx, my, s * mx, len, thick, w, -a, pick(i === segs.length - 1 ? tipColors : colors, rand()), 0.92 + i * 0.05, up);
    d += Math.cos(up) * len;
    y += Math.sin(up) * len;
  });
}

/**
 * Sword fern: arching fronds round a tuft of young upright ones, each frond
 * three segments that rise, level off and droop at the tip (≈ 1 m across).
 */
export function fern(p: PlantSink, rand: Rand): void {
  const n = 5 + (rand() < 0.4 ? 1 : 0);
  const a0 = rand() * Math.PI * 2;
  p.box(0, 0.2, 0, 0.1, 0.4, 0.1, a0, pick(FERN_TIP, rand()), 0.9, 0.12);
  for (let q = 0; q < n; q++) {
    const a = a0 + (q / n) * Math.PI * 2 + (rand() - 0.5) * 0.5;
    const rise = 0.55 + rand() * 0.35;
    const L = 0.85 + rand() * 0.3;
    arch(p, a, 0.04, 0.12, [[0.32 * L, 0.2, rise], [0.3 * L, 0.24, 0.05], [0.26 * L, 0.16, -0.7]], 0.07, FERN, rand, FERN_TIP);
  }
}

/**
 * Elephant ear (Alocasia): a few long stalks leaning out, each with a big
 * heart-shaped leaf that tips down at its point.
 */
export function elephantEar(p: PlantSink, rand: Rand): void {
  const n = 3 + (rand() < 0.5 ? 1 : 0);
  const a0 = rand() * Math.PI * 2;
  for (let q = 0; q < n; q++) {
    const a = a0 + (q / n) * Math.PI * 2 + (rand() - 0.5) * 0.6;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const h = 0.75 + rand() * 0.45;
    // Stalk leaning out, then the blade: tipped down from the stalk to its point.
    const lean = 0.25 + rand() * 0.2;
    const top = 0.04 + Math.sin(lean) * h;
    p.box(c * (0.04 + top) / 2, (Math.cos(lean) * h) / 2, s * ((0.04 + top) / 2), 0.08, h, 0.08, -a, pick(STALK, rand()), 0.95, -lean);
    const y = Math.cos(lean) * h;
    arch(p, a, top - 0.08, y, [[0.46, 0.5, -0.3 - rand() * 0.2], [0.3, 0.3, -0.85]], 0.05, EAR, rand, EAR_LIT);
  }
}

/** A tuft of grass blades (0.3–0.6 m). */
export function grassTuft(p: PlantSink, rand: Rand): void {
  const n = 4 + Math.floor(rand() * 3);
  for (let q = 0; q < n; q++) {
    const h = 0.25 + rand() * 0.4;
    const a = rand() * Math.PI * 2;
    const lean = 0.1 + rand() * 0.3;
    const r = 0.04 + rand() * 0.1;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    // (leaning out from the middle of the tuft)
    p.box(x + (Math.cos(a) * Math.sin(lean) * h) / 2, (Math.cos(lean) * h) / 2, z + (Math.sin(a) * Math.sin(lean) * h) / 2, 0.07, h, 0.07, -a, pick(GRASS, rand()), 0.9 + rand() * 0.2, -lean);
  }
}

/** A patch of ground flowers in one soft colour, with a few leaves at their feet. */
export function flowers(p: PlantSink, rand: Rand, colors: readonly number[]): void {
  const n = 3 + Math.floor(rand() * 3);
  for (let q = 0; q < n; q++) {
    const x = (rand() - 0.5) * 0.7;
    const z = (rand() - 0.5) * 0.7;
    const h = 0.22 + rand() * 0.25;
    p.box(x, h / 2, z, 0.05, h, 0.05, 0, pick(GRASS, rand()), 0.85);
    p.box(x, h + 0.03, z, 0.14, 0.09, 0.14, rand() * 3, pick(colors, rand()), 1.05);
    if (rand() < 0.6) p.box(x + 0.06, 0.07, z, 0.18, 0.05, 0.09, rand() * 3, pick(FERN, rand()), 0.9, 0.4);
  }
}

/** Reeds on a river bank: tall thin blades and a cattail or two. */
export function reeds(p: PlantSink, rand: Rand): void {
  const n = 5 + Math.floor(rand() * 3);
  for (let q = 0; q < n; q++) {
    const h = 0.8 + rand() * 0.7;
    const a = rand() * Math.PI * 2;
    const lean = rand() * 0.15;
    const x = (rand() - 0.5) * 0.45;
    const z = (rand() - 0.5) * 0.45;
    p.box(x, h / 2, z, 0.07, h, 0.07, -a, pick(REED, rand()), 0.9 + rand() * 0.15, -lean);
    if (q < 2 && rand() < 0.6) p.box(x + Math.cos(a) * Math.sin(lean) * h, h + 0.08, z + Math.sin(a) * Math.sin(lean) * h, 0.1, 0.22, 0.1, -a, CATTAIL, 1, -lean);
  }
}

/** Leaf litter: a few fallen leaves flat on the ground. */
export function litter(p: PlantSink, rand: Rand): void {
  const n = 4 + Math.floor(rand() * 3);
  for (let q = 0; q < n; q++) {
    const set = rand() < 0.65 ? LITTER.wet : rand() < 0.7 ? LITTER.dry : LITTER.green;
    p.box((rand() - 0.5) * 0.9, 0.015 + q * 0.004, (rand() - 0.5) * 0.9, 0.2 + rand() * 0.08, 0.03, 0.14 + rand() * 0.06, rand() * 3, pick(set, rand()), 0.85 + rand() * 0.2);
  }
}

/**
 * A fallen log `len` m long along +x (the pool turns it), moss on its back,
 * a broken branch and a few bracket fungi.
 */
export function fallenLog(p: PlantSink, rand: Rand, len: number): void {
  const d = 0.42 + rand() * 0.18;
  p.box(0, d / 2, 0, len, d, d, 0, pick(LOG, rand()), 0.9);
  p.box(len / 2 + 0.02, d / 2, 0, 0.06, d * 0.8, d * 0.8, 0, LOG_END, 1);
  p.box(-len / 2 - 0.02, d / 2, 0, 0.06, d * 0.8, d * 0.8, 0, LOG_END, 0.95);
  p.box((rand() - 0.5) * len * 0.4, d + 0.04, 0, len * (0.4 + rand() * 0.3), 0.08, d * 0.7, 0, pick(MOSS, rand()), 1);
  const bx = (rand() - 0.2) * len * 0.35;
  p.box(bx, d * 0.75, d * 0.55 + 0.2, 0.14, 0.14, 0.5, 0, pick(LOG, rand()), 0.95);
  for (let q = 0; q < 2 + Math.floor(rand() * 2); q++) p.box((rand() - 0.5) * len * 0.8, d * (0.3 + rand() * 0.4), -d / 2 - 0.04, 0.16, 0.05, 0.1, 0, pick(FUNGUS, rand()), 1.05);
}

/**
 * A vine hanging `len` m from its top (at 0, the crown's underside), small
 * leaves on alternate sides; the pool hangs it from a crown.
 */
export function hangingVine(p: PlantSink, rand: Rand, len: number): void {
  const seg = 0.7;
  const col = pick(VINE, rand());
  let x = 0;
  for (let y = 0, q = 0; y < len; y += seg, q++) {
    const h = Math.min(seg, len - y);
    x += (rand() - 0.5) * 0.05;
    p.box(x, -y - h / 2, 0, 0.13, h, 0.13, 0, col, 0.9 + 0.2 * (1 - y / len));
    // A leaf on every segment, on alternate sides and turned a little; a tuft at the end.
    const side = q % 2 === 1 ? 1 : -1;
    p.box(x + side * 0.18, -y - h * 0.55, 0.02, 0.3, 0.2, 0.08, (rand() - 0.5) * 0.8, pick(VINE_LEAF, rand()), 1.05, side * 0.35);
  }
}
