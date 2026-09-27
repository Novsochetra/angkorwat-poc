import { BoxGeometry, BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, LOD, Matrix4, Mesh, Object3D, SRGBColorSpace, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { dress, statueMaterial, type Finish, type Palette } from './finish';
import { trackSacred } from './pending';
import { meshSculpt, Sculpt, type SculptMesh } from './sculpt';
import { cone, mirrorX, rot, smin, subtract, union, type Rot, type Shape } from './sdf';

/**
 * The Khmer naga (នាគ) for the pagodas' stairs and roofs, smooth like the
 * statues (sculpt.ts, finish.ts): a cobra of many heads under one smooth
 * fan hood, as on the balustrades of Angkor Wat's causeway — never the
 * crested, open-jawed dragon of a Thai naga. Two looks (`NagaLook`): `stone`
 * (grey-green sandstone, a stair's) and `gilt` (a roof's).
 *
 * - `nagaFan(kind, look)`: the naga rearing up. Its body comes in low from
 *   behind (−z) and rises into a smooth hood; round the hood's rim the heads
 *   (the middle one highest), each a broad cobra head looking ahead (+z)
 *   and a little down. `stair`: seven heads in a pointed arch of kbach
 *   flame leaves (the halo of Angkor Wat's nagas), a tall flame at its
 *   point, `FAN_HEIGHT.stair` m tall at 1:1; `roof`: five heads, no halo,
 *   for the lower ends of a roof's barge boards (scale it down). On y = 0,
 *   facing +z.
 * - `nagaBody(path, r, tail, look)`: its smooth round body along a path (a
 *   stair's balustrade, the top of a barge board), paler scales along its
 *   belly, tapering along its last `tail` m.
 * - `chovea()`: the slender finial on a ridge's end (ជហ្វា): it rises
 *   from the ridge and bends out (+z) and up to a thin hooked point,
 *   `CHOVEA_HEIGHT` m tall at 1:1 — no bird's beak (that is the Thai chofa).
 * - `rakeBoard(from, to, out, …)`: a gilt barge board along a gable's slope
 *   (its top edge on the line), the naga's body along its top.
 *
 * Each returns a geometry for `statueMaterial()` (colour and finish on its
 * vertices: `position`, `normal`, `color`, `finish`, `occlusion`, indexed),
 * so a roof's worth merges into one mesh (`mergeNaga`, or whole: `roofNaga`,
 * `stairNaga`, one draw each, hidden far off). The fans are sculpted once
 * per kind and shared: on first use (the roof's ≈ 30 ms, the stair's
 * ≈ 0.2 s), or before it in a worker (`nagaFanReady`: _nagaWorker.ts).
 * Preview: `sacred.html?piece=naga-stair|naga-roof` (gable.pieces.ts).
 */

// ── Colours ───────────────────────────────────────────────────────────────

/** How a naga is finished: `gilt` (a pagoda roof's), `stone` (grey-green sandstone, as Angkor Wat's balustrades). */
export type NagaLook = 'gilt' | 'stone';

/** Each look's regions: the body, the halo, the eyes; and the paler scales along its belly. */
export const NAGA_PALETTES: Record<NagaLook, Palette & { belly: Finish }> = {
  gilt: {
    '*': { color: 0xd6a03c, metal: 0.9, rough: 0.3, grain: 0.4 },
    naga: { color: 0xd6a03c, metal: 0.9, rough: 0.3, grain: 0.4 },
    halo: { color: 0xe8b650, metal: 0.95, rough: 0.22, grain: 0.25 },
    eye: { color: 0x1d1510, metal: 0.1, rough: 0.5, grain: 0 },
    belly: { color: 0xe6bd62, metal: 0.85, rough: 0.34, grain: 0.3 },
  },
  stone: {
    '*': { color: 0x8d957c, metal: 0, rough: 0.93, grain: 0.95 },
    naga: { color: 0x8d957c, metal: 0, rough: 0.93, grain: 0.95 },
    halo: { color: 0x9b9c84, metal: 0, rough: 0.93, grain: 0.95 },
    eye: { color: 0x4f5446, metal: 0, rough: 0.95, grain: 0.8 },
    belly: { color: 0xa6a78f, metal: 0, rough: 0.93, grain: 0.9 },
  },
};

// ── Distance shapes (allocation-free: the fans are sampled a million times) ──

const DEG = Math.PI / 180;

/** An upright ellipsoid, boxed tight (a bound near its surface, as sdf.ts's). */
function ell(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number): Shape {
  const ix = 1 / rx;
  const iy = 1 / ry;
  const iz = 1 / rz;
  const inner = -Math.min(rx, ry, rz);
  return {
    box: [cx - rx, cy - ry, cz - rz, cx + rx, cy + ry, cz + rz],
    d(x, y, z) {
      const px = (x - cx) * ix;
      const py = (y - cy) * iy;
      const pz = (z - cz) * iz;
      const k0 = Math.sqrt(px * px + py * py + pz * pz);
      const k1 = Math.sqrt(px * px * ix * ix + py * py * iy * iy + pz * pz * iz * iz);
      return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : inner;
    },
  };
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/**
 * One cobra head in its own frame: its middle at the origin, looking along
 * +z, its top +y. Broad and flat, widest behind the eyes, the snout short
 * and round, the mouth a closed line, the brows low over the eyes; its neck
 * runs back (−z) into the hood. About 0.26 m across.
 */
function cobraHead(): Shape {
  const parts: Shape[] = [
    ell(0, 0.012, -0.03, 0.125, 0.068, 0.12),
    ell(0, -0.006, 0.07, 0.088, 0.05, 0.085),
    ell(0, -0.044, 0.035, 0.08, 0.03, 0.088),
    mirrorX(ell(0.056, 0.05, 0.022, 0.042, 0.022, 0.052)),
    mirrorX(ell(0.086, 0.03, 0.042, 0.026, 0.026, 0.026)),
    cone([0, -0.015, -0.1], [0, -0.035, -0.26], 0.078, 0.085),
  ];
  return subtract(union(parts, 0.04), ell(0, -0.03, 0.145, 0.066, 0.007, 0.055), 0.003);
}

/** The eyes of a head (in its frame), for their dark paint. */
const EYES = mirrorX(ell(0.088, 0.031, 0.045, 0.028, 0.028, 0.028));

/** Where a head sits (fan space) and how it is turned: its middle, the rotation (head → fan), its size (1: `cobraHead`'s). */
interface HeadAt {
  x: number;
  y: number;
  z: number;
  R: Rot;
  s: number;
}

/** A shape in a head's frame, placed at `h` and sized (evaluated without allocating). */
function inHead(sh: Shape, h: HeadAt, x: number, y: number, z: number): number {
  const k = 1 / h.s;
  const px = (x - h.x) * k;
  const py = (y - h.y) * k;
  const pz = (z - h.z) * k;
  const R = h.R;
  return sh.d(R[0] * px + R[3] * py + R[6] * pz, R[1] * px + R[4] * py + R[7] * pz, R[2] * px + R[5] * py + R[8] * pz) * h.s;
}

/** The measures of a fan (m, at 1:1): hood centre height, the heads' arc radius and spread (to the outermost, from upright), the hood plate's radius, the halo. */
interface FanSpec {
  heads: number;
  hc: number;
  rh: number;
  spread: number;
  rp: number;
  /** The halo's band radius (0: none). */
  halo: number;
  /** How far back the body comes in (m behind the hood). */
  tail: number;
}

/** `stairFar` is the stair's fan meshed coarser (its far look). */
export type FanKind = 'stair' | 'stairFar' | 'roof';

const STAIR: FanSpec = { heads: 7, hc: 1.34, rh: 0.56, spread: 80 * DEG, rp: 0.5, halo: 0.8, tail: 0.75 };
const FANS: Record<FanKind, FanSpec> = {
  stair: STAIR,
  stairFar: STAIR,
  roof: { heads: 5, hc: 1.3, rh: 0.46, spread: 64 * DEG, rp: 0.42, halo: 0, tail: 0.5 },
};

/** The heads of a fan: round the hood's rim, the middle one highest and largest, turned out a little, looking a little down. */
function headsOf(f: FanSpec): HeadAt[] {
  const out: HeadAt[] = [];
  const n = f.heads;
  for (let j = 0; j < n; j++) {
    const a = n > 1 ? -f.spread + (2 * f.spread * j) / (n - 1) : 0;
    const mid = 1 - Math.abs(a) / f.spread;
    out.push({
      x: Math.sin(a) * f.rh,
      y: f.hc + Math.cos(a) * f.rh + 0.05 * mid,
      // (the side heads come forward a little: the hood is cupped)
      z: 0.14 + 0.1 * Math.sin(a) * Math.sin(a),
      R: rot(a * 0.3, 12 * DEG, -a * 0.55),
      s: 1.1 + 0.14 * mid,
    });
  }
  return out;
}

/**
 * The hood: a plate round the hood's centre (radius `rp`, hidden behind
 * the heads at its rim), narrowing below into the neck like a cobra's
 * spread hood, cupped forward at its sides.
 */
function hoodPlate(f: FanSpec): Shape {
  const low = f.hc - 0.5;
  const neck = 0.13;
  const t = 0.045;
  const cup = 0.28;
  const z0 = -0.03;
  const hw = (y: number) => neck + (f.rp - neck) * (1 - Math.pow(1 - clamp((y - low) / (f.hc - low), 0, 1), 2));
  return {
    box: [-f.rp, low - 0.02, z0 - t - 0.01, f.rp, f.hc + f.rp, z0 + t + cup * f.rp * f.rp],
    d(x, y, z) {
      const ax = x < 0 ? -x : x;
      let d2: number;
      if (y >= f.hc) {
        const dy = y - f.hc;
        d2 = Math.sqrt(ax * ax + dy * dy) - f.rp;
      } else d2 = Math.max((ax - hw(y)) * 0.85, low - y);
      const dz = Math.abs(z - (z0 + cup * x * x)) - t;
      const ox = d2 > 0 ? d2 : 0;
      const oz = dz > 0 ? dz : 0;
      return Math.min(Math.max(d2, dz), 0) + Math.sqrt(ox * ox + oz * oz) - 0.015;
    },
  };
}

/**
 * The heads, their necks (ribs across the hood from low on it out to each
 * head) as one shape: a point looks only at the two heads nearest it round
 * the fan, and at them only when it is near.
 */
function headFan(f: FanSpec, heads: HeadAt[]): Shape {
  const head = cobraHead();
  const n = heads.length;
  const step = n > 1 ? (2 * f.spread) / (n - 1) : 1;
  const cy = f.hc - 0.2;
  // Each rib: from the hood's lower middle out to the back of the head's neck (fan space).
  const ribs = heads.map((h) => {
    const R = h.R;
    // (the neck's end in the head's frame: (0, −0.035, −0.26))
    const ly = -0.035 * h.s;
    const lz = -0.26 * h.s;
    const bx = h.x + R[1] * ly + R[2] * lz;
    const by = h.y + R[4] * ly + R[5] * lz;
    const bz = h.z + R[7] * ly + R[8] * lz;
    return cone([0, cy, 0.0], [bx, by, bz], 0.04, 0.06);
  });
  const reach = 0.25;
  const one = (j: number, x: number, y: number, z: number) => {
    const h = heads[j];
    const dx = x - h.x;
    const dy = y - h.y;
    const dz = z - h.z;
    const ball = Math.sqrt(dx * dx + dy * dy + dz * dz) - reach * h.s;
    const hd = ball > 0.05 ? ball : inHead(head, h, x, y, z);
    return smin(hd, ribs[j].d(x, y, z), 0.05);
  };
  let x0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let z1 = -Infinity;
  for (const h of heads) {
    x0 = Math.min(x0, h.x - reach);
    x1 = Math.max(x1, h.x + reach);
    y1 = Math.max(y1, h.y + reach);
    z1 = Math.max(z1, h.z + reach);
  }
  return {
    box: [x0, cy - 0.1, -0.12, x1, y1, z1],
    d(x, y, z) {
      const a = Math.atan2(x, y - f.hc);
      const fj = (a + f.spread) / step;
      const j = clamp(Math.round(fj), 0, n - 1);
      const j2 = clamp(fj > j ? j + 1 : j - 1, 0, n - 1);
      const d = one(j, x, y, z);
      return j2 === j ? d : Math.min(d, one(j2, x, y, z));
    },
  };
}

/** A flat flame leaf (in the plane z = `zc`): from its foot, `len` long along the unit (ux, uy), `w` half-wide, `t` half-thick, its tip swept toward (−uy, ux) by `curl` m. */
function leafShape(bx: number, by: number, zc: number, ux: number, uy: number, len: number, w: number, t: number, curl: number): Shape {
  const vx = -uy;
  const vy = ux;
  const r = len + w + Math.abs(curl);
  return {
    box: [bx - r, by - r, zc - t - 0.01, bx + r, by + r, zc + t + 0.01],
    d(x, y, z) {
      const px = x - bx;
      const py = y - by;
      const u = px * ux + py * uy;
      const s = clamp(u / len, 0, 1);
      const v = px * vx + py * vy - curl * s * s;
      // (the outline: round at the foot, swelling to a third of the way, drawn out to a point)
      const hw = w * (s < 0.3 ? 0.55 + 0.45 * Math.sin((s / 0.3) * (Math.PI / 2)) : Math.pow(Math.cos(((s - 0.3) / 0.7) * (Math.PI / 2)), 1.15));
      const d2 = Math.max(Math.abs(v) - hw, -u, u - len) * 0.9;
      const th = t * (0.45 + 0.55 * Math.sqrt(Math.max(0, 1 - (v * v) / Math.max(hw * hw, 1e-8))));
      const dz = Math.abs(z - zc) - th;
      const ox = d2 > 0 ? d2 : 0;
      const oz = dz > 0 ? dz : 0;
      return Math.min(Math.max(d2, dz), 0) + Math.sqrt(ox * ox + oz * oz);
    },
  };
}

/**
 * The halo: a band close round the heads (radius `f.halo` round the hood's
 * centre, behind them), from low on one side over the top to the other;
 * flame leaves along its outside, leaning up and curling on outward, a tall
 * flame on its point, and at each end a leaf turned down. A point looks
 * only at the leaves nearest it round the band.
 */
function halo(f: FanSpec): Shape {
  const R = f.halo;
  const cy = f.hc;
  const zc = -0.05;
  const max = 118 * DEG;
  const hw = 0.055;
  const t = 0.04;
  const n = 17;
  const leaves: Shape[] = [];
  for (let i = 0; i < n; i++) {
    const a = -max + ((i + 0.5) * 2 * max) / n;
    const top = i === (n - 1) / 2;
    const end = i === 0 || i === n - 1;
    // (out from the band, leaning toward upright; the ends turned down and out)
    const lean = top ? 0 : end ? -Math.sign(a) * 0.5 : Math.sign(a) * Math.min(0.6, Math.abs(a) * 0.42);
    const dir = a - lean;
    const len = top ? 0.4 : end ? 0.16 : 0.24 - 0.06 * (Math.abs(a) / max);
    leaves.push(leafShape(Math.sin(a) * (R + hw * 0.5), cy + Math.cos(a) * (R + hw * 0.5), zc, Math.sin(dir), Math.cos(dir), len, top ? 0.085 : 0.078, t * 0.8, top ? 0 : -Math.sign(a) * 0.06));
  }
  const step = (2 * max) / n;
  return {
    box: [-R - 0.4, cy - R * Math.abs(Math.cos(max)) - 0.4, zc - t - 0.02, R + 0.4, cy + R + 0.5, zc + t + 0.02],
    d(x, y, z) {
      const dy = y - cy;
      const a = Math.atan2(x, dy);
      // The band, a bead along its inner edge.
      let d2: number;
      if (a > max || a < -max) {
        const s = a > 0 ? 1 : -1;
        const ex = x - s * Math.sin(max) * R;
        const ey = dy - Math.cos(max) * R;
        d2 = Math.sqrt(ex * ex + ey * ey) - hw;
      } else d2 = Math.abs(Math.sqrt(x * x + dy * dy) - R) - hw;
      const dz = Math.abs(z - zc) - t;
      const ox = d2 > 0 ? d2 : 0;
      const oz = dz > 0 ? dz : 0;
      let d = Math.min(Math.max(d2, dz), 0) + Math.sqrt(ox * ox + oz * oz);
      // The nearest leaves round the band.
      const fi = (a + max) / step - 0.5;
      const i = clamp(Math.round(fi), 0, n - 1);
      const i2 = clamp(fi > i ? i + 1 : i - 1, 0, n - 1);
      d = smin(d, leaves[i].d(x, y, z), 0.025);
      if (i2 !== i) d = smin(d, leaves[i2].d(x, y, z), 0.025);
      return d;
    },
  };
}

/** The whole fan of a kind as a sculpt (fan space, 1:1). */
export function fanSculpt(kind: FanKind): Sculpt {
  const f = FANS[kind];
  const s = new Sculpt();
  const heads = headsOf(f);
  // The body: in low from behind, bending up, the neck rising into the hood.
  const tz = -f.tail;
  const body = union(
    [
      cone([0, 0.2, tz], [0, 0.22, -0.24], 0.16, 0.17),
      cone([0, 0.22, -0.24], [0, 0.62, -0.02], 0.17, 0.16),
      cone([0, 0.62, -0.02], [0, f.hc - 0.34, -0.04], 0.16, 0.12),
    ],
    0.08,
  );
  s.add(body, 'naga', 0);
  s.add(hoodPlate(f), 'naga', 0.07);
  s.add(headFan(f, heads), 'naga', 0.03);
  if (f.halo > 0) {
    s.add(halo(f), 'halo', 0.02);
    // (the halo stands on the hood: two struts behind it, low on each side)
    for (const side of [-1, 1]) s.add(cone([side * 0.22, f.hc - 0.42, -0.05], [side * f.halo * Math.sin(114 * DEG), f.hc + f.halo * Math.cos(114 * DEG), -0.05], 0.05, 0.045), 'halo', 0.05);
  }
  // Their eyes, painted dark.
  const eye = EYES;
  s.paint(
    {
      box: [-2, 0, -1, 2, 3, 1],
      d(x, y, z) {
        let d = Infinity;
        for (const h of heads) {
          const dx = x - h.x;
          const dy = y - h.y;
          const dz = z - h.z;
          if (dx * dx + dy * dy + dz * dz > 0.04) continue;
          d = Math.min(d, inHead(eye, h, x, y, z));
        }
        return d;
      },
    },
    'eye',
  );
  return s;
}

/** Grid cells (m, at 1:1) for each kind: the stair's is seen close, the roof's small and far. */
export const FAN_CELL: Record<FanKind, { cell: number; fineCell?: number }> = {
  stair: { cell: 0.03 },
  stairFar: { cell: 0.06 },
  roof: { cell: 0.062 },
};

const fanMeshes = new Map<FanKind, SculptMesh>();
const fanGeometries = new Map<string, BufferGeometry>();

/** A fan's height at 1:1 (m, from its foot to the top of its halo or its highest head). */
export const FAN_HEIGHT: Record<FanKind, number> = { stair: 2.45, stairFar: 2.45, roof: 2.0 };

/** The naga fan of a kind and look (see the file's note): on y = 0, facing +z, at 1:1 (`FAN_HEIGHT`); made once and shared (do not dispose). */
export function nagaFan(kind: FanKind, look: NagaLook = 'gilt'): BufferGeometry {
  const key = `${kind}/${look}`;
  let g = fanGeometries.get(key);
  if (g) return g;
  let m = fanMeshes.get(kind);
  if (!m) {
    m = meshSculpt(fanSculpt(kind), FAN_CELL[kind]);
    fanMeshes.set(kind, m);
    console.info(`[sacred] naga fan ${kind}: ${(m.geometry.getIndex()!.count / 3) | 0} triangles in ${m.ms.toFixed(0)} ms`);
  }
  g = plain(dress(m, NAGA_PALETTES[look]));
  fanGeometries.set(key, g);
  return g;
}

// ── Sculpting off the main thread ─────────────────────────────────────────

const asked = new Map<FanKind, Promise<void>>();

/**
 * Sculpts a fan of `kind` in a worker (_nagaWorker.ts: the main thread keeps
 * drawing), so that `nagaFan` then only dresses it; where workers are
 * missing it sculpts here. Shots wait for it (pending.ts).
 */
export function nagaFanReady(kind: FanKind): Promise<void> {
  if (fanMeshes.has(kind)) return Promise.resolve();
  let p = asked.get(kind);
  if (p) return p;
  p = new Promise<void>((resolve) => {
    let w: Worker;
    try {
      w = new Worker(new URL('./_nagaWorker.ts', import.meta.url), { type: 'module' });
    } catch {
      nagaFan(kind);
      resolve();
      return;
    }
    const done = () => {
      w.terminate();
      resolve();
    };
    w.onerror = () => {
      nagaFan(kind);
      done();
    };
    w.onmessage = (e: MessageEvent<NagaSculpted>) => {
      const r = e.data;
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(r.position, 3));
      geometry.setAttribute('normal', new BufferAttribute(r.normal, 3));
      geometry.setAttribute('region', new BufferAttribute(r.region, 1));
      geometry.setAttribute('paint', new BufferAttribute(r.paint, 1));
      geometry.setAttribute('paintW', new BufferAttribute(r.paintW, 1));
      geometry.setAttribute('occlusion', new BufferAttribute(r.occlusion, 1));
      geometry.setIndex(new BufferAttribute(r.index, 1));
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      if (!fanMeshes.has(kind)) {
        fanMeshes.set(kind, { geometry, regions: r.regions, ms: r.ms });
        console.info(`[sacred] naga fan ${kind}: ${(r.index.length / 3) | 0} triangles in ${r.ms.toFixed(0)} ms (worker)`);
      }
      done();
    };
    w.postMessage({ kind });
  });
  asked.set(kind, p);
  return trackSacred(p);
}

/** A fan sculpted in the worker, as plain arrays (_nagaWorker.ts). */
export interface NagaSculpted {
  position: Float32Array;
  normal: Float32Array;
  region: Float32Array;
  paint: Float32Array;
  paintW: Float32Array;
  occlusion: Float32Array;
  index: Uint16Array | Uint32Array;
  regions: string[];
  ms: number;
}

/** Sculpt stats for checks: each fan so far, its triangles and time (ms). */
export function nagaStats(): { key: string; triangles: number; ms: number }[] {
  return [...fanMeshes].map(([key, m]) => ({ key, triangles: (m.geometry.getIndex()!.count / 3) | 0, ms: m.ms }));
}

// ── Swept pieces ──────────────────────────────────────────────────────────

/** Only what the statue material reads (the sculpt's region attributes dropped), indexed. */
function plain(g: BufferGeometry): BufferGeometry {
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'finish', 'occlusion'].includes(name)) g.deleteAttribute(name);
  if (!g.getIndex()) g.setIndex([...Array(g.getAttribute('position').count).keys()]);
  return g;
}

const lin = new Color();

/** Colour and finish on every vertex of `g` (sRGB hex), occlusion `occ`. */
function finished(g: BufferGeometry, f: Finish, occ = 1): BufferGeometry {
  const n = g.getAttribute('position').count;
  lin.setHex(f.color, SRGBColorSpace);
  const col = new Float32Array(n * 3);
  const fin = new Float32Array(n * 3);
  const oc = new Float32Array(n).fill(occ);
  for (let i = 0; i < n; i++) {
    col[i * 3] = lin.r;
    col[i * 3 + 1] = lin.g;
    col[i * 3 + 2] = lin.b;
    fin[i * 3] = f.metal;
    fin[i * 3 + 1] = f.rough;
    fin[i * 3 + 2] = f.grain ?? 0.3;
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setAttribute('finish', new BufferAttribute(fin, 3));
  g.setAttribute('occlusion', new BufferAttribute(oc, 1));
  return plain(g);
}

/**
 * A tube swept along `pts` (a smooth curve through them), its cross-section
 * an ellipse `size(t)` = [half-width across (the frame's normal), half-depth
 * (its binormal)] at share t of the way; `up` sets which way the normal
 * leans (the side toward it is the tube's back). Colour per vertex from
 * `paint(t, a)` (a: the angle round, 0 at the back).
 */
function sweep(pts: readonly Vector3[], size: (t: number) => [number, number], up: Vector3, paint: (t: number, a: number) => Finish, radial = 12, step = 0.05): BufferGeometry {
  const curve = new CatmullRomCurve3(pts as Vector3[], false, 'centripetal');
  const len = curve.getLength();
  const segs = Math.max(4, Math.ceil(len / step));
  const P: Vector3[] = [];
  const T: Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    P.push(curve.getPointAt(i / segs));
    T.push(curve.getTangentAt(i / segs).normalize());
  }
  // Frames carried along the curve (no twist), the first leaning toward `up`.
  const N: Vector3[] = [];
  const n0 = up.clone().sub(T[0].clone().multiplyScalar(up.dot(T[0])));
  if (n0.lengthSq() < 1e-8) n0.set(1, 0, 0).sub(T[0].clone().multiplyScalar(T[0].x));
  N.push(n0.normalize());
  for (let i = 1; i <= segs; i++) {
    const n = N[i - 1].clone().sub(T[i].clone().multiplyScalar(N[i - 1].dot(T[i])));
    N.push(n.lengthSq() > 1e-10 ? n.normalize() : N[i - 1].clone());
  }
  const pos = new Float32Array((segs + 1) * (radial + 1) * 3);
  const nor = new Float32Array(pos.length);
  const col = new Float32Array(pos.length);
  const fin = new Float32Array(pos.length);
  const occ = new Float32Array((segs + 1) * (radial + 1));
  const B = new Vector3();
  let v = 0;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const [a, b] = size(t);
    B.crossVectors(T[i], N[i]);
    for (let j = 0; j <= radial; j++) {
      const ang = (j / radial) * Math.PI * 2;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const nx = N[i].x * c * a + B.x * s * b;
      const ny = N[i].y * c * a + B.y * s * b;
      const nz = N[i].z * c * a + B.z * s * b;
      pos[v * 3] = P[i].x + nx;
      pos[v * 3 + 1] = P[i].y + ny;
      pos[v * 3 + 2] = P[i].z + nz;
      // (an ellipse's normal: its point divided by the squared half-axes)
      const mx = (N[i].x * c) / Math.max(a, 1e-5) + (B.x * s) / Math.max(b, 1e-5);
      const my = (N[i].y * c) / Math.max(a, 1e-5) + (B.y * s) / Math.max(b, 1e-5);
      const mz = (N[i].z * c) / Math.max(a, 1e-5) + (B.z * s) / Math.max(b, 1e-5);
      const ml = Math.sqrt(mx * mx + my * my + mz * mz) || 1;
      nor[v * 3] = mx / ml;
      nor[v * 3 + 1] = my / ml;
      nor[v * 3 + 2] = mz / ml;
      const f = paint(t, ang);
      lin.setHex(f.color, SRGBColorSpace);
      col[v * 3] = lin.r;
      col[v * 3 + 1] = lin.g;
      col[v * 3 + 2] = lin.b;
      fin[v * 3] = f.metal;
      fin[v * 3 + 1] = f.rough;
      fin[v * 3 + 2] = f.grain ?? 0.3;
      // (a little darker underneath)
      occ[v] = 0.78 + 0.22 * (0.5 + 0.5 * c);
      v++;
    }
  }
  const idx: number[] = [];
  const row = radial + 1;
  for (let i = 0; i < segs; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * row + j;
      const b = a + row;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setAttribute('finish', new BufferAttribute(fin, 3));
  g.setAttribute('occlusion', new BufferAttribute(occ, 1));
  g.setIndex(idx);
  return g;
}

const UP = new Vector3(0, 1, 0);

/**
 * The naga's body along a path (m, any space): a smooth round body `r` m
 * thick, a row of paler scales along its belly; with `tail`, it tapers
 * along its last `tail` m to a point. `detail`: sides round it (14) and
 * the step along it (m; straight bodies need few).
 */
export function nagaBody(path: readonly Vector3[], r: number, tail = 0, look: NagaLook = 'gilt', detail: { radial?: number; step?: number } = {}): BufferGeometry {
  const P = NAGA_PALETTES[look];
  const curve = new CatmullRomCurve3(path as Vector3[], false, 'centripetal');
  const len = curve.getLength();
  const k = tail > 0 ? tail / len : 0;
  const size = (t: number): [number, number] => {
    const q = k > 0 && t > 1 - k ? Math.max(0.08, (1 - t) / k) : 1;
    const rr = r * Math.sqrt(q);
    return [rr, rr];
  };
  const scale = Math.max(1, Math.round(len / (r * 1.1)));
  return sweep(path, size, UP, (t, a) => {
    // (the belly: the side away from `up`, in plates across it)
    const belly = Math.cos(a) < -0.35 && ((t * scale) % 1) > 0.18;
    return belly ? P.belly : P.naga;
  }, detail.radial ?? 14, detail.step ?? Math.min(0.09, r * 0.45));
}

/**
 * The chovea (see the file's note): on y = 0 (the ridge's end), rising and
 * bending out along +z, `CHOVEA_HEIGHT` m tall at 1:1 (scale it), thin
 * across (x), a blade seen from the side.
 */
export function chovea(): BufferGeometry {
  const pts = [
    new Vector3(0, -0.12, -0.05),
    new Vector3(0, 0.3, 0.0),
    new Vector3(0, 0.7, 0.07),
    new Vector3(0, 1.02, 0.2),
    new Vector3(0, 1.26, 0.38),
    new Vector3(0, 1.42, 0.5),
    new Vector3(0, 1.55, 0.5),
    new Vector3(0, 1.62, 0.4),
  ];
  // (the frame's normal leans across (x): the blade is thin that way, deep in the curve's own plane)
  const g = sweep(
    pts,
    (t) => {
      const taper = Math.pow(1 - t, 0.8);
      // (a swelling a little past the middle: the naga's head the chovea is)
      const head = 1 + 0.35 * Math.exp(-Math.pow((t - 0.72) / 0.1, 2));
      return [0.016 + 0.058 * taper, (0.022 + 0.085 * taper) * head];
    },
    new Vector3(1, 0, 0),
    () => NAGA_PALETTES.gilt.halo,
    10,
    0.04,
  );
  return g;
}

/** The chovea's height at 1:1 (m). */
export const CHOVEA_HEIGHT = 1.62;

const _u = new Vector3();
const _v = new Vector3();
const _w = new Vector3();
const _m = new Matrix4();

/**
 * A barge board along a gable's slope: its top edge on the line from `from`
 * (the lower end, at the eave) to `to` (the upper end), `width` m deep
 * under the line, `thick` m thick standing out along `out` (the gable's
 * outward normal) from the line's plane; the naga's body (`body` m thick)
 * along its top.
 */
export function rakeBoard(from: Vector3, to: Vector3, out: Vector3, width: number, thick: number, body: number): BufferGeometry {
  _u.subVectors(to, from);
  const len = _u.length();
  _u.normalize();
  _w.copy(out).normalize();
  _v.crossVectors(_w, _u);
  // (v up the board's face; u turned with it, so the basis stays right-handed and the faces outward)
  if (_v.y < 0) {
    _v.negate();
    _u.negate();
  }
  const board = new BoxGeometry(len, width, thick);
  _m.makeBasis(_u, _v, _w).setPosition(
    (from.x + to.x) / 2 - _v.x * (width / 2 - body * 0.5) + _w.x * (thick / 2),
    (from.y + to.y) / 2 - _v.y * (width / 2 - body * 0.5) + _w.y * (thick / 2),
    (from.z + to.z) / 2 - _v.z * (width / 2 - body * 0.5) + _w.z * (thick / 2),
  );
  board.applyMatrix4(_m);
  finished(board, NAGA_PALETTES.gilt.naga, 0.92);
  const lift = (p: Vector3) => p.clone().addScaledVector(_v, body * 0.35).addScaledVector(_w, thick * 0.5);
  const a = lift(from);
  const b = lift(to);
  const bodyGeo = nagaBody([a, a.clone().lerp(b, 0.5), b], body, 0, 'gilt', { radial: 8, step: 0.5 });
  return mergeGeometries([board, bodyGeo])!;
}

/** The pieces in one geometry for one mesh (each already where it goes). */
export function mergeNaga(parts: BufferGeometry[]): BufferGeometry {
  const g = mergeGeometries(parts.map(plain))!;
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** A copy of `g` moved into place by `m` (for merging). */
export function placed(g: BufferGeometry, m: Matrix4): BufferGeometry {
  return g.clone().applyMatrix4(m);
}

// ── Whole pieces ──────────────────────────────────────────────────────────

/** A roof's naga (world m): its barge boards, the five-headed fans at their lower ends, the chovea on its ridge's ends. */
export interface RoofNagaSpec {
  /** Barge boards: the lower end (at the eave, the rows' outer top corner), the upper end, the gable's outward normal. */
  rakes: { from: Vector3; to: Vector3; out: Vector3 }[];
  /** Board depth under the line and thickness (m; default 0.42, 0.12), the body along its top (0.08). */
  board?: [number, number];
  body?: number;
  /** Fans: where each stands (its foot), the level way it looks, its height (m). */
  fans: { at: Vector3; look: Vector3; height: number }[];
  /** Chovea: where each rises (the ridge's end), the level way it bends out, its height (m). */
  choveas: { at: Vector3; out: Vector3; height: number }[];
  /** Hidden past this distance (m, default 200). */
  hide?: number;
}

const _s = new Vector3();

/** A turn about y (+z toward `look`), a size, a place. */
function levelMatrix(at: Vector3, look: Vector3, size: number): Matrix4 {
  _s.setScalar(size);
  return new Matrix4().makeRotationY(Math.atan2(look.x, look.z)).scale(_s).setPosition(at);
}

/**
 * Pieces merged into one mesh per level in the statues' material, round the
 * first level's middle: an LOD showing each level from its distance (m) on,
 * nothing past `hide`.
 */
function lodMesh(levels: [BufferGeometry[], number][], name: string, hide: number, shadows: boolean): LOD {
  const lod = new LOD();
  lod.name = name;
  let c: Vector3 | null = null;
  for (const [parts, at] of levels) {
    const g = mergeNaga(parts);
    c ??= g.boundingSphere!.center.clone();
    g.translate(-c.x, -c.y, -c.z);
    g.computeBoundingSphere();
    const mesh = new Mesh(g, statueMaterial());
    mesh.name = name;
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    lod.addLevel(mesh, at);
  }
  lod.position.copy(c!);
  lod.addLevel(new Object3D(), hide);
  lod.updateMatrixWorld(true);
  return lod;
}

/** A Khmer roof's gilt naga (see `RoofNagaSpec`) as one mesh. */
export function roofNaga(o: RoofNagaSpec): LOD {
  const [bw, bt] = o.board ?? [0.42, 0.12];
  const parts: BufferGeometry[] = [];
  for (const r of o.rakes) parts.push(rakeBoard(r.from, r.to, r.out, bw, bt, o.body ?? 0.08));
  const fan = nagaFan('roof');
  for (const f of o.fans) parts.push(placed(fan, levelMatrix(f.at, f.look, f.height / FAN_HEIGHT.roof)));
  const ch = chovea();
  for (const c of o.choveas) parts.push(placed(ch, levelMatrix(c.at, c.out, c.height / CHOVEA_HEIGHT)));
  return lodMesh([[parts, 0]], 'roof naga', o.hide ?? 200, false);
}

/** A stair's naga balustrades (world m): the rearing fans at its foot (feet, level look), each body's path, its thickness, the look. */
export interface StairNagaSpec {
  fans: { at: Vector3; look: Vector3; height: number }[];
  bodies: { path: Vector3[]; tail: number }[];
  radius: number;
  look: NagaLook;
  /** Coarser from this distance on (m, default 55), hidden past `hide` (m, default 220). */
  far?: number;
  hide?: number;
}

/**
 * A stair's two naga as one mesh (see `StairNagaSpec`), a coarser one from
 * `far` on (the `stairFar` fans: have both ready, `nagaFanReady`).
 */
export function stairNaga(o: StairNagaSpec): LOD {
  const level = (kind: FanKind, radial: number, step: number) => {
    const parts: BufferGeometry[] = [];
    const fan = nagaFan(kind, o.look);
    for (const f of o.fans) parts.push(placed(fan, levelMatrix(f.at, f.look, f.height / FAN_HEIGHT[kind])));
    for (const b of o.bodies) parts.push(nagaBody(b.path, o.radius, b.tail, o.look, { radial, step }));
    return parts;
  };
  return lodMesh(
    [
      [level('stair', 14, 0.09), 0],
      [level('stairFar', 8, 0.25), o.far ?? 55],
    ],
    'stair naga',
    o.hide ?? 220,
    true,
  );
}
