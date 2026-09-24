import { traceSource } from '../../feedback/sourceTrace';
import { BARK as BARK_TONES, LEAF as LEAF_TONES } from '../../kit/palette';
import { pick } from '../../voxel/random';
import { barkLine, fillBlobs, finishProto, rng, RAMP_ID, Vol, type Blob, type FreeBox, type Proto, type RampName } from './proto';

/**
 * The jungle's species, as map-scale prototypes (1 m cells near the camera,
 * 2 m far away). Sizes are real-world (reference sheet §18.1, scale row):
 *  - broadleaf: most of the jungle, 8–14 m tall, canopy 6–10 m wide, a lumpy
 *    round crown on a brown trunk, big ones with branches under the lumps;
 *  - emergent: a tall pale trunk (18–25 m) with a flat, wide crown above the rest;
 *  - sugar palm: a ringed trunk 9–14 m with a star of fronds and dry ones hanging;
 *  - bush: low clumps 2–3 m;
 *  - flowering: a broadleaf with pink or orange blossom on its sunny side.
 */

export type Species = 'broadleaf' | 'emergent' | 'palm' | 'bush' | 'flowering';

/** Canopy ramps for broadleaf trees, with their weights. */
const BROAD_RAMPS: [RampName, number][] = [
  ['green', 4],
  ['jungle', 3],
  ['olive', 2],
  ['deep', 2],
];

function pickRamp(r: number): number {
  const total = BROAD_RAMPS.reduce((s, x) => s + x[1], 0);
  let a = r * total;
  for (const [name, w] of BROAD_RAMPS) {
    if (a < w) return RAMP_ID[name];
    a -= w;
  }
  return RAMP_ID.green;
}

/**
 * Trunk as free boxes: near (1 m cells) in segments of 3–4 m in a few bark
 * tones, darker under the crown; farther away one box (a trunk is a few
 * pixels there).
 */
function trunk(boxes: FreeBox[], top: number, width: number, tones: readonly number[], rand: () => number, ox = 0, oz = 0, s = 1): void {
  let y = -0.5;
  while (y < top) {
    const seg = s > 1 ? top - y : Math.min(top - y, 3 + Math.floor(rand() * 2));
    const t = (y + seg / 2) / Math.max(1, top);
    boxes.push({ x: ox, y: y + seg / 2, z: oz, sx: width, sy: seg, sz: width, color: pick(tones, rand()), shade: 1.02 - 0.25 * t });
    y += seg;
  }
}

/** Root flare: short blocks round the foot of a big trunk. */
function roots(boxes: FreeBox[], width: number, tones: readonly number[], rand: () => number, ox = 0, oz = 0): void {
  const half = width / 2;
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    if (rand() < 0.25) continue;
    const len = 0.8 + rand() * 0.8;
    const h = 0.8 + rand() * 1.2;
    const side = width * (0.5 + rand() * 0.3);
    boxes.push({
      x: ox + dx * (half + len / 2 - 0.1),
      y: h / 2 - 0.4,
      z: oz + dz * (half + len / 2 - 0.1),
      sx: dx ? len : side,
      sy: h,
      sz: dz ? len : side,
      color: pick(tones, rand()),
      shade: 0.95,
    });
  }
}

export interface BroadleafOpts {
  /** Cell size (m). */
  s: number;
  /** Total height (m). */
  h: number;
  /** Canopy radius (m). */
  r: number;
  seed: number;
  flower?: RampName;
}

/** A broadleaf tree: lumpy round crown, trunk, branches on the big ones. */
export function broadleaf(o: BroadleafOpts): Proto {
  const src = traceSource();
  const rand = rng(o.seed);
  const s = o.s;
  const R = o.r / s;
  const H = o.h / s;
  const Rv = R * (0.8 + rand() * 0.14);
  const cy = H - Rv;
  const v = new Vol(Math.ceil(R * 1.35) + 1, Math.ceil(H) + 2);
  const ramp = pickRamp(rand());
  // Lumps: a main body, a ring of bumps round it and a few on top.
  const blobs: Blob[] = [{ x: 0, y: cy, z: 0, r: R * 0.78, ry: Rv * 0.8 }];
  const n = 3 + Math.floor(rand() * 3) + (R > 4 ? 1 : 0);
  const a0 = rand() * Math.PI * 2;
  for (let q = 0; q < n; q++) {
    const a = a0 + (q / n) * Math.PI * 2 + (rand() - 0.5) * 0.8;
    const d = R * (0.4 + rand() * 0.22);
    blobs.push({ x: Math.cos(a) * d, y: cy + Rv * (rand() * 0.5 - 0.25), z: Math.sin(a) * d, r: R * (0.45 + rand() * 0.15), ry: Rv * (0.5 + rand() * 0.15) });
  }
  const tops = 1 + Math.floor(rand() * 2) + (R > 4 ? 1 : 0);
  for (let q = 0; q < tops; q++) {
    const a = rand() * Math.PI * 2;
    const d = R * rand() * 0.35;
    blobs.push({ x: Math.cos(a) * d, y: cy + Rv * (0.45 + rand() * 0.15), z: Math.sin(a) * d, r: R * (0.36 + rand() * 0.12), ry: Rv * 0.42 });
  }
  // Branches first (the leaves cover them inside the crown; they show under it).
  const barkTones = R * s > 4.2 ? BARK_TONES.brown : rand() < 0.5 ? BARK_TONES.grey : BARK_TONES.brown;
  const trunkTop = cy - Rv * 0.2;
  if (R * s >= 3.4 && s === 1) {
    for (const b of blobs.slice(1, 5)) barkLine(v, [0, cy - Rv * 0.95, 0], [b.x * 0.9, b.y - b.ry * 0.6, b.z * 0.9], () => pick(barkTones, rand()));
  }
  fillBlobs(v, blobs, ramp, o.seed, cy - Rv * 0.85, s === 1 ? 0.22 : 0.16);
  if (o.flower) flowerCells(v, RAMP_ID[o.flower], o.seed);
  const boxes: FreeBox[] = [];
  const tw = R * s > 4.2 ? 2 : R * s > 3.2 ? 1.4 : 1;
  const off = tw === 2 && s === 1 ? -0.5 : 0;
  trunk(boxes, trunkTop * s, tw, barkTones, rand, off, off, s);
  if (tw >= 1.4 && s === 1) roots(boxes, tw, barkTones, rand, off, off);
  return finishProto(v, { s, r: o.r, h: o.h, seed: o.seed, boxes, src });
}

/** Blossom on the outside of the crown, in patches, most on top. */
function flowerCells(v: Vol, ramp: number, seed: number): void {
  const { r, h } = v;
  for (let j = 1; j < h; j++)
    for (let k = -r; k <= r; k++)
      for (let i = -r; i <= r; i++) {
        const c = v.idx(i, j, k);
        if (v.kind[c] !== 1) continue;
        const top = v.at(i, j + 1, k) === 0;
        const side = v.at(i + 1, j, k) === 0 || v.at(i - 1, j, k) === 0 || v.at(i, j, k + 1) === 0 || v.at(i, j, k - 1) === 0;
        if (!top && !side) continue;
        const patch = Math.sin(i * 1.7 + seed) + Math.sin(k * 1.3 - seed * 0.7) + Math.sin(j * 2.1 + seed * 0.3);
        if (patch > (top ? 0.2 : 1.1)) v.ramp[c] = ramp;
      }
}

export interface EmergentOpts {
  s: number;
  h: number;
  r: number;
  seed: number;
}

/** A tall emergent tree: a straight pale trunk and a flat, spreading crown above the canopy. */
export function emergent(o: EmergentOpts): Proto {
  const src = traceSource();
  const rand = rng(o.seed);
  const s = o.s;
  const R = o.r / s;
  const H = o.h / s;
  const Rv = Math.max(1.4, (2.4 + rand() * 0.9) / s);
  const cy = H - Rv;
  const v = new Vol(Math.ceil(R * 1.3) + 1, Math.ceil(H) + 2);
  const ramp = rand() < 0.5 ? RAMP_ID.olive : rand() < 0.5 ? RAMP_ID.green : RAMP_ID.jungle;
  const blobs: Blob[] = [{ x: 0, y: cy, z: 0, r: R * 0.7, ry: Rv * 0.9 }];
  const n = 4 + Math.floor(rand() * 3);
  const a0 = rand() * Math.PI * 2;
  for (let q = 0; q < n; q++) {
    const a = a0 + (q / n) * Math.PI * 2 + (rand() - 0.5) * 0.6;
    const d = R * (0.5 + rand() * 0.2);
    blobs.push({ x: Math.cos(a) * d, y: cy - Rv * (0.1 + rand() * 0.35), z: Math.sin(a) * d, r: R * (0.38 + rand() * 0.12), ry: Rv * (0.7 + rand() * 0.25) });
  }
  const tones = rand() < 0.6 ? BARK_TONES.pale : BARK_TONES.grey;
  const fork = cy - Rv - 2.5 / s;
  if (s === 1) for (const b of blobs.slice(1)) barkLine(v, [0, fork, 0], [b.x * 0.85, b.y - b.ry * 0.5, b.z * 0.85], () => pick(tones, rand()));
  // A lower side cluster on some.
  if (rand() < 0.55) {
    const a = rand() * Math.PI * 2;
    const d = 1.6 / s;
    const y = H * (0.55 + rand() * 0.1);
    const lower: Blob = { x: Math.cos(a) * d, y, z: Math.sin(a) * d, r: Math.max(1.3, 2.3 / s), ry: Math.max(1, 1.5 / s) };
    if (s === 1) barkLine(v, [0, y - 2, 0], [lower.x, y - 0.5, lower.z], () => pick(tones, rand()));
    fillBlobs(v, [lower], ramp, o.seed + 1, -1e9, 0.2);
  }
  fillBlobs(v, blobs, ramp, o.seed, cy - Rv * 1.1, s === 1 ? 0.2 : 0.14);
  const boxes: FreeBox[] = [];
  const tw = o.h > 21 ? 2 : 1.4;
  const off = tw === 2 && s === 1 ? -0.5 : 0;
  trunk(boxes, (fork + 1) * s, tw, tones, rand, off, off, s);
  if (s === 1) roots(boxes, tw, tones, rand, off, off);
  return finishProto(v, { s, r: o.r, h: o.h, seed: o.seed, boxes, src, lift: 0.8 });
}

export interface PalmOpts {
  s: number;
  h: number;
  seed: number;
}

/** A sugar palm: ringed trunk, a star of fronds (drooping at the tips), dry fronds hanging under. */
export function palm(o: PalmOpts): Proto {
  const src = traceSource();
  const rand = rng(o.seed);
  const s = o.s;
  const H = Math.round(o.h / s);
  const L = s === 1 ? 3 + Math.floor(rand() * 2) : s < 2 ? 3 : s < 3 ? 2 : 1;
  const v = new Vol(L + 1, H + 4);
  const fr = RAMP_ID.palm;
  const dry = RAMP_ID.dry;
  // Crown heart.
  v.leaf(0, H, 0, fr, 0.9);
  v.leaf(0, H + 1, 0, fr, 1.05);
  if (s === 1) v.leaf(0, H + 2, 0, fr, 1.1);
  // Fronds along the 8 lattice directions; the straight ones longer.
  const dirs: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  for (const [dx, dz] of dirs) {
    const diag = dx !== 0 && dz !== 0;
    const len = diag ? L - 1 : L;
    // Rise, level, then droop.
    const lift = s === 1 ? [1, 1, 0, -1, -2] : [1, 0, -1];
    for (let t = 1; t <= len; t++) {
      const y = H + lift[Math.min(lift.length - 1, t - 1)];
      v.leaf(dx * t, y, dz * t, fr, 0.9 + t * 0.06);
      // Tips droop one more cell on the long fronds.
      if (t === len && !diag && s === 1 && rand() < 0.6) v.leaf(dx * t, y - 1, dz * t, fr, 0.85);
    }
  }
  // Dry fronds and fruit hanging under the crown.
  for (const [dx, dz] of dirs.slice(0, 4)) {
    if (rand() < 0.35) continue;
    v.leaf(dx, H - 1, dz, dry, 0.85);
    if (s === 1 && rand() < 0.5) v.leaf(dx, H - 2, dz, dry, 0.75);
  }
  const boxes: FreeBox[] = [];
  const tones = BARK_TONES.palm;
  // Ringed trunk: 1 m bands near, a few long segments far; a slight lean.
  const band = s === 1 ? 1.5 : 1e3;
  const lean = (rand() - 0.5) * 0.5;
  for (let y = -0.5; y < H * s; y += band) {
    const seg = Math.min(band, H * s - y);
    const t = y / (H * s);
    boxes.push({ x: lean * t, y: y + seg / 2, z: lean * 0.5 * t, sx: s === 1 ? 0.8 : 1, sy: seg, sz: s === 1 ? 0.8 : 1, color: pick(tones, rand()), shade: 1 - t * 0.12 });
  }
  return finishProto(v, { s, r: (L + 0.5) * s, h: (H + 2) * s, seed: o.seed, boxes, src, lift: 0.6 });
}

export interface BushOpts {
  s: number;
  h: number;
  r: number;
  seed: number;
}

/** A low bush: a few lumps on the ground. */
export function bush(o: BushOpts): Proto {
  const src = traceSource();
  const rand = rng(o.seed);
  const s = o.s;
  const R = o.r / s;
  const H = o.h / s;
  const v = new Vol(Math.ceil(R) + 1, Math.ceil(H) + 2);
  const ramp = rand() < 0.6 ? RAMP_ID.bush : rand() < 0.5 ? RAMP_ID.deep : RAMP_ID.jungle;
  const blobs: Blob[] = [{ x: 0, y: H * 0.45, z: 0, r: R * 0.75, ry: H * 0.6 }];
  const n = 2 + Math.floor(rand() * 3);
  for (let q = 0; q < n; q++) {
    const a = rand() * Math.PI * 2;
    const d = R * (0.3 + rand() * 0.35);
    blobs.push({ x: Math.cos(a) * d, y: H * (0.3 + rand() * 0.25), z: Math.sin(a) * d, r: R * (0.4 + rand() * 0.2), ry: H * (0.4 + rand() * 0.2) });
  }
  fillBlobs(v, blobs, ramp, o.seed, 0, 0.25);
  return finishProto(v, { s, r: o.r, h: o.h, seed: o.seed, src, lift: 1.1 });
}

/** A small stand of leaf tones, for a sanity check of LEAF use (kept for the vines and moss). */
export const VINE_TONES = [...BARK_TONES.vine, LEAF_TONES.jungle[0], LEAF_TONES.dark[2], LEAF_TONES.jungle[3]];
