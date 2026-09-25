import { Matrix4, type InstancedMesh, type Object3D } from 'three';
import { hash3 } from '../../voxel/random';
import { CELL, SURFACE, type HeightField } from '../heightfield';
import { PLACES } from '../layout';
import { buildRoadNetwork, KIND, LIFT, type RoadNetwork } from '../road/line';
import { WalkMap } from '../roam/walkmap';
import { MAP_VIEWS, ROAM_AREA, viewDistance } from '../terrain/views';
import type { MapContext, MapPart } from '../types';
import type { Ground } from './_landBrain';

/**
 * Where the land animals live, found on the built map:
 *
 * - the jungle's cover (vegetation blocks near the ground: trunks, bushes,
 *   low crowns), so deer graze in the open and keep out of the thickets;
 * - the temples' floors and the road's paving (the roaming walk map, made of
 *   the landmarks and the road only), so monkeys sit on open stone and not
 *   inside galleries;
 * - meadows (the most open, flat grass), forest edges, the roadside, river
 *   banks and shallows.
 *
 * Everything is picked with seeded hashes: the same animals every run.
 */

export interface Survey {
  field: HeightField;
  /**
   * Per land cell: 1 = low cover (bush, low crown), 2 = a trunk, 4 = something
   * built (a wall, a ruin, a lamp), 8 = under a crown (any height).
   */
  cover: Uint8Array;
  /** Top of the road's paving per land cell (NaN off the road). */
  paving: Float32Array;
  walk: WalkMap | null;
  road: RoadNetwork;
}

/** Vegetation blocks lower than this over the ground count as cover (m). */
const COVER_TOP = 5;
/** …and leaves lower than this are a canopy overhead (m). */
const CANOPY_TOP = 30;
/** Block families of the temples that are not in the way (lights, water, leaves). */
const SOFT = /(glow|water|wax|petal|Leaf|leaves|foliage)(:plain)?$/;

export function survey(ctx: MapContext): Survey {
  const field = ctx.field;
  const cover = new Uint8Array(field.nx * field.nz);
  const m = new Matrix4();
  /** Mark the cells under the blocks of an object: `bit` where a block is between `lo` and `hi` m over the ground. */
  const mark = (root: Object3D, bit: (name: string) => number, lo: number, hi: number) => {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const mesh = o as InstancedMesh;
      // (the ':plain' twins repeat the same blocks)
      if (!mesh.isInstancedMesh || mesh.name.endsWith(':plain')) return;
      const b = bit(mesh.name);
      if (!b) return;
      const a = mesh.instanceMatrix.array as Float32Array;
      const world = mesh.matrixWorld;
      const plain = world.equals(IDENTITY);
      for (let i = 0; i < mesh.count; i++) {
        let x = a[i * 16 + 12];
        let y = a[i * 16 + 13];
        let z = a[i * 16 + 14];
        if (!plain) {
          const e = m.fromArray(a, i * 16).premultiply(world).elements;
          x = e[12];
          y = e[13];
          z = e[14];
        }
        const c = field.index(x, z);
        if (c < 0) continue;
        const over = y - field.height[c];
        if (over > lo && over < hi) cover[c] |= b;
      }
    });
  };
  const veg = ctx.scene.getObjectByName('vegetation');
  if (veg) {
    mark(veg, (n) => (/(Bark|bark|trunk)$/.test(n) ? 2 : /(Leaf|leaf|leaves|foliage)$/.test(n) ? 1 : 0), 0, COVER_TOP);
    mark(veg, (n) => (/(Leaf|leaf|leaves|foliage)$/.test(n) ? 8 : 0), 0, CANOPY_TOP);
  }
  // Temples, ruins, the road's lamps and beacons (the paving itself is under 0.3 m).
  const built: MapPart[] = [];
  for (const o of ctx.scene.children as Object3D[]) {
    if (!o.name.startsWith('landmark:') && o.name !== 'path') continue;
    built.push({ name: o.name, object: o });
    mark(o, (n) => (SOFT.test(n) ? 0 : 4), 0.45, 3);
  }
  // The road's paving: stations every 0.5 m, 4 m wide.
  const road = buildRoadNetwork(field);
  const paving = new Float32Array(field.nx * field.nz).fill(NaN);
  for (const r of road.roads)
    for (const st of r.stations) {
      if (st.kind !== KIND.ground) continue;
      for (const k of [-1.5, -0.5, 0.5, 1.5]) {
        const c = field.index(st.x + st.tz * k, st.z - st.tx * k);
        if (c >= 0 && !(paving[c] >= st.h + LIFT)) paving[c] = st.h + LIFT;
      }
    }
  // The monkeys' temple floors: the walk map of the landmarks and the road (its columns are built as they are asked for).
  const walk = built.length ? new WalkMap(field, built) : null;
  return { field, cover, paving, walk, road };
}

const IDENTITY = new Matrix4();

// ── Grounds: where each kind of animal may stand ─────────────────────────────

/** Open land: grass, dirt, sand and the road; no water, cover, rock lips, pads or anything built. */
export function openGround(sv: Survey): Ground {
  const { field: f, cover, paving } = sv;
  return (x, z) => {
    const c = f.index(x, z);
    if (c < 0 || f.water[c] > -1000 || cover[c] & 7) return NaN;
    const s = f.surface[c];
    if (s === SURFACE.pad || s === SURFACE.bed || s === SURFACE.rock) return NaN;
    if (s === SURFACE.path) return Number.isNaN(paving[c]) ? f.height[c] : paving[c];
    // (rocks and pillars of the terrain mark their ground as built on)
    if (f.occupied[c] && s !== SURFACE.sand) return NaN;
    return f.height[c];
  };
}

/** Temple ground: open floors, terraces and paving with room above; not walls, roofs or trunks. */
export function templeGround(sv: Survey): Ground {
  const { field: f, cover, walk } = sv;
  const open = openGround(sv);
  if (!walk) return open;
  return (x, z) => {
    const c = f.index(x, z);
    if (c < 0 || f.water[c] > -1000 || cover[c] & 2) return NaN;
    const s = f.surface[c];
    if (s === SURFACE.bed || s === SURFACE.rock) return NaN;
    const top = walk.topAt(x, z);
    if (top > f.height[c] + 3.2) return NaN;
    // Flat under the body, and room to sit up.
    for (let k = 0; k < 4; k++) if (!(Math.abs(walk.topAt(x + AROUND[k * 2], z + AROUND[k * 2 + 1]) - top) < 0.26)) return NaN;
    if (walk.ceilingAt(x, z, top + 0.05) - top < 0.9) return NaN;
    return top;
  };
}
const AROUND = [0.3, 0, -0.3, 0, 0, 0.3, 0, -0.3];

/** River banks and shallows (water up to 1.3 m deep), in the open: no crown overhead. */
export function bankGround(sv: Survey): Ground {
  const { field: f, cover } = sv;
  return (x, z) => {
    const c = f.index(x, z);
    // (a cell round it too: a crown's edge overhangs)
    if (c < 0 || cover[c] || cover[c - 1] & 8 || cover[c + 1] & 8 || cover[c - f.nx] & 8 || cover[c + f.nx] & 8) return NaN;
    const h = f.height[c];
    if (f.water[c] > h) return f.water[c] - h <= 1.3 ? h : NaN;
    const s = f.surface[c];
    if (s !== SURFACE.sand && s !== SURFACE.grass && s !== SURFACE.dirt) return NaN;
    if (f.occupied[c] && s !== SURFACE.sand) return NaN;
    return h;
  };
}

// ── Finding places ───────────────────────────────────────────────────────────

export interface Spot {
  x: number;
  z: number;
}

const inRoam = (x: number, z: number, margin = 20) => x > ROAM_AREA.x0 + margin && x < ROAM_AREA.x1 - margin && z > ROAM_AREA.z0 + margin && z < ROAM_AREA.z1 - margin;

const nearPlace = (x: number, z: number, r: number) => PLACES.some((p) => Math.hypot(p.x - x, p.z - z) < Math.max(p.pad[0], p.pad[1]) + r);

/**
 * Grids for the searches, per land cell: open ground (its height, or NaN),
 * summed-area tables of open cells and of cover (window counts in O(1)), and
 * the distance to the road (m, up to `ROAD_FAR`).
 */
interface Grids {
  open: Float32Array;
  openSum: Float64Array;
  coverSum: Float64Array;
  road: Float32Array;
}

const grids = new WeakMap<Survey, Grids>();
const ROAD_FAR = 14;

function gridsOf(sv: Survey): Grids {
  const hit = grids.get(sv);
  if (hit) return hit;
  const { field: f, cover, paving } = sv;
  const { nx, nz, height, water, surface, occupied } = f;
  // (openGround, cell by cell over the roaming area)
  const open = new Float32Array(nx * nz).fill(NaN);
  const i0 = Math.max(0, Math.floor((ROAM_AREA.x0 - f.x0) / CELL));
  const i1 = Math.min(nx - 1, Math.floor((ROAM_AREA.x1 - f.x0) / CELL));
  const k0 = Math.max(0, Math.floor((ROAM_AREA.z0 - f.z0) / CELL));
  const k1 = Math.min(nz - 1, Math.floor((ROAM_AREA.z1 - f.z0) / CELL));
  for (let k = k0; k <= k1; k++)
    for (let i = i0; i <= i1; i++) {
      const c = i + k * nx;
      const s = surface[c];
      if (water[c] > -1000 || cover[c] & 7 || s === SURFACE.pad || s === SURFACE.bed || s === SURFACE.rock) continue;
      if (s === SURFACE.path) open[c] = Number.isNaN(paving[c]) ? height[c] : paving[c];
      else if (!occupied[c] || s === SURFACE.sand) open[c] = height[c];
    }
  const table = (v: (c: number) => number) => {
    const t = new Float64Array((nx + 1) * (nz + 1));
    for (let k = 0; k < nz; k++) {
      let row = 0;
      for (let i = 0; i < nx; i++) {
        row += v(i + k * nx);
        t[i + 1 + (k + 1) * (nx + 1)] = t[i + 1 + k * (nx + 1)] + row;
      }
    }
    return t;
  };
  const openSum = table((c) => (Number.isNaN(open[c]) ? 0 : 1));
  const coverSum = table((c) => (cover[c] & 3 ? 1 : 0));
  const road = new Float32Array(nx * nz).fill(ROAD_FAR);
  const reach = Math.ceil(ROAD_FAR / CELL);
  for (const r of sv.road.roads)
    for (let s = 0; s < r.stations.length; s += 6) {
      const st = r.stations[s];
      const c0 = f.index(st.x, st.z);
      if (c0 < 0) continue;
      const i0 = c0 % nx;
      const k0 = (c0 - i0) / nx;
      for (let k = Math.max(0, k0 - reach); k <= Math.min(nz - 1, k0 + reach); k++)
        for (let i = Math.max(0, i0 - reach); i <= Math.min(nx - 1, i0 + reach); i++) {
          const d = Math.hypot(f.x0 + (i + 0.5) * CELL - st.x, f.z0 + (k + 0.5) * CELL - st.z);
          if (d < road[i + k * nx]) road[i + k * nx] = d;
        }
    }
  const out = { open, openSum, coverSum, road };
  grids.set(sv, out);
  return out;
}

/** Cells counted in the window of cells [i0, i1] × [k0, k1] (clamped). */
function windowSum(f: HeightField, t: Float64Array, i0: number, k0: number, i1: number, k1: number): number {
  const w = f.nx + 1;
  i0 = Math.max(0, i0);
  k0 = Math.max(0, k0);
  i1 = Math.min(f.nx - 1, i1) + 1;
  k1 = Math.min(f.nz - 1, k1) + 1;
  return t[i1 + k1 * w] - t[i0 + k1 * w] - t[i1 + k0 * w] + t[i0 + k0 * w];
}

/**
 * Meadows: the most open grass (a window `r` m round each spot on an 8 m
 * lattice) that is also flat, best first, `spacing` m apart; meadows the
 * overview sees, near its camera, come first.
 */
export function meadows(sv: Survey, n: number, spacing: number, avoid: Spot[], r = 16): Spot[] {
  const { field: f } = sv;
  const G = gridsOf(sv);
  const k = Math.round(r / CELL);
  const full = (2 * k + 1) ** 2;
  const [ox, oy, oz] = MAP_VIEWS[0].pos;
  const cands: { x: number; z: number; score: number; c: number }[] = [];
  for (let z = ROAM_AREA.z0 + 40; z < ROAM_AREA.z1 - 30; z += 8)
    for (let x = ROAM_AREA.x0 + 40; x < ROAM_AREA.x1 - 40; x += 8) {
      const c = f.index(x, z);
      if (c < 0 || Number.isNaN(G.open[c]) || f.surface[c] !== SURFACE.grass || G.road[c] < 10) continue;
      const i = c % f.nx;
      const kk = (c - i) / f.nx;
      const share = windowSum(f, G.openSum, i - k, kk - k, i + k, kk + k) / full;
      if (share < 0.6) continue;
      const h = G.open[c];
      const seen = viewDistance(MAP_VIEWS[0], x, h, z) > 0 ? 25 : 0;
      cands.push({ x, z, c, score: share * 100 + seen - Math.hypot(x - ox, h - oy, z - oz) / 25 + hash3(x, z, 7) * 2 });
    }
  cands.sort((a, b) => b.score - a.score);
  return spread(cands, n, spacing, avoid, (cd) => {
    if (nearPlace(cd.x, cd.z, 25)) return false;
    // Flat: the open ground in the window within two steps.
    const h0 = G.open[cd.c];
    for (let b = -k; b <= k; b += 2)
      for (let a = -k; a <= k; a += 2) {
        const h = G.open[f.index(cd.x + a * CELL, cd.z + b * CELL)];
        if (Math.abs(h - h0) > 4.1) return false;
      }
    return true;
  });
}

/**
 * Forest edges: open ground with cover close by (a window of 18 m: a good
 * share of each), the spot itself in the open (muntjac, junglefowl).
 */
export function edges(sv: Survey, n: number, spacing: number, avoid: Spot[], near?: (x: number, z: number, c: number) => boolean): Spot[] {
  const { field: f } = sv;
  const G = gridsOf(sv);
  const cands: { x: number; z: number; score: number }[] = [];
  for (let z = ROAM_AREA.z0 + 40; z < ROAM_AREA.z1 - 30; z += 6)
    for (let x = ROAM_AREA.x0 + 40; x < ROAM_AREA.x1 - 40; x += 6) {
      const c = f.index(x, z);
      if (c < 0 || Number.isNaN(G.open[c]) || (near && !near(x, z, c))) continue;
      const i = c % f.nx;
      const k = (c - i) / f.nx;
      if (windowSum(f, G.openSum, i - 1, k - 1, i + 1, k + 1) < 9) continue;
      const free = windowSum(f, G.openSum, i - 4, k - 4, i + 4, k + 4);
      const bush = windowSum(f, G.coverSum, i - 4, k - 4, i + 4, k + 4);
      if (bush < 8 || free < 30) continue;
      cands.push({ x, z, score: free + Math.min(bush, 25) + hash3(x, z, 11) * 6 });
    }
  cands.sort((a, b) => b.score - a.score);
  return spread(cands, n, spacing, avoid, (c) => !nearPlace(c.x, c.z, 15));
}

/** Roadside spots (junglefowl): 5–12 m off the road, open, near cover; one near each of the given points. */
export function roadside(sv: Survey, towards: Spot[], spacing: number, avoid: Spot[]): Spot[] {
  const G = gridsOf(sv);
  const out: Spot[] = [];
  for (const t of towards) {
    const pick = edges(sv, 1, spacing, [...avoid, ...out], (x, z, c) => Math.hypot(x - t.x, z - t.z) < 45 && G.road[c] > 5 && G.road[c] < 12);
    if (pick.length) out.push(pick[0]);
  }
  return out;
}

/** Stretches of river bank with shallows next to them, in the valleys (buffalo). */
export function banks(sv: Survey, towards: Spot[], avoid: Spot[]): Spot[] {
  const { field: f } = sv;
  const g = bankGround(sv);
  const out: Spot[] = [];
  for (const t of towards) {
    let best: { x: number; z: number; score: number } | null = null;
    for (const r of f.rivers)
      for (let i = 0; i < r.samples.length; i += 3) {
        const s = r.samples[i];
        if (Math.hypot(s.x - t.x, s.z - t.z) > 40 || s.level > 20) continue;
        // Across the flow, both sides: the first dry cell past the water.
        for (const side of [1, -1]) {
          const nx = -s.dir[1] * side;
          const nz = s.dir[0] * side;
          const off = s.w / 2 + 2;
          const x = s.x + nx * off;
          const z = s.z + nz * off;
          const h = g(x, z);
          if (Number.isNaN(h) || f.water[f.index(x, z)] > h) continue;
          // Room on the bank, and shallows beside it.
          let room = 0;
          for (let a = -3; a <= 3; a++) if (!Number.isNaN(g(x + s.dir[0] * a * 2 + nx * 2, z + s.dir[1] * a * 2 + nz * 2))) room++;
          const shallow = !Number.isNaN(g(s.x + nx * (s.w / 2 - 1), s.z + nz * (s.w / 2 - 1)));
          if (room < 4 || !shallow || avoid.concat(out).some((o) => Math.hypot(o.x - x, o.z - z) < 50)) continue;
          const score = room + (inRoam(x, z) ? 3 : 0) + hash3(Math.round(x), Math.round(z), 5) - Math.hypot(s.x - t.x, s.z - t.z) / 20;
          if (!best || score > best.score) best = { x, z, score };
        }
      }
    if (best) out.push(best);
  }
  return out;
}

/** Up to `n` spots on `ground` within `r` m of a point, at least `gap` apart (a troop, a herd). */
export function scatter(ground: Ground, cx: number, cz: number, r: number, n: number, gap: number, seed: number): Spot[] {
  const out: Spot[] = [];
  for (let k = 0; k < n * 40 && out.length < n; k++) {
    const a = hash3(k, seed, 1) * Math.PI * 2;
    const d = r * Math.sqrt(hash3(k, seed, 2));
    const x = cx + Math.sin(a) * d;
    const z = cz + Math.cos(a) * d;
    if (Number.isNaN(ground(x, z)) || out.some((o) => Math.hypot(o.x - x, o.z - z) < gap)) continue;
    out.push({ x, z });
  }
  return out;
}

/** Greedy pick from candidates (best first), `spacing` apart and away from `avoid`. */
function spread<T extends Spot>(cands: T[], n: number, spacing: number, avoid: Spot[], ok: (c: T) => boolean): Spot[] {
  const out: Spot[] = [];
  for (const c of cands) {
    if (out.length >= n) break;
    if (!inRoam(c.x, c.z) || !ok(c)) continue;
    if (out.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < spacing) || avoid.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < spacing * 0.6)) continue;
    out.push({ x: c.x, z: c.z });
  }
  return out;
}

/**
 * The elephants' walk: the longest flat stretch of ground road (no stairs,
 * no bridge) — on the valley road, from the River Gate towards the summit.
 */
export function flatStretch(sv: Survey): { road: number; from: number; to: number } | null {
  let best: { road: number; from: number; to: number } | null = null;
  sv.road.roads.forEach((r, ri) => {
    const st = r.stations;
    let a = 0;
    for (let i = 1; i <= st.length; i++) {
      const brk = i === st.length || st[i].h !== st[a].h || st[i].kind !== KIND.ground || st[i].stair || st[i].landing;
      if (!brk) continue;
      // (trim a margin at the ends: stair heads, beacon landings)
      const from = a + 8;
      const to = i - 9;
      if (to - from > (best ? best.to - best.from : 60)) best = { road: ri, from, to };
      a = i;
    }
  });
  return best;
}
