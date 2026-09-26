import type { InstancedMesh, Object3D } from 'three';
import { hash3 } from '../../voxel/random';
import { CELL, SURFACE, type HeightField } from '../heightfield';
import { PLACES } from '../layout';
import { MAP_VIEWS, ROAM_AREA, viewDistance } from '../terrain/views';
import type { MapContext } from '../types';
import type { Ground } from './_landBrain';

/**
 * The jungle as its animals see it, read from the blocks the vegetation part
 * built (the trees are not known any other way):
 *
 * - per land cell, the top of the leaves over it and their underside, and
 *   what stands on the ground there (a bush, a trunk);
 * - the crowns: one per trunk, at the highest leaves round it (gibbons and
 *   hornbills sit on them);
 * - the forest floor (open ground under or between the trees: boar,
 *   peafowl), clearings at the forest edge, lowland river banks (giant ibis).
 *
 * Everything is picked with seeded hashes: the same animals every run.
 */

export interface Canopy {
  field: HeightField;
  /** Top of the leaves per land cell (m; NaN: open sky). */
  top: Float32Array;
  /** Underside of the leaves more than 2.5 m over the ground (m; NaN: none). */
  under: Float32Array;
  /** 1 = leaves near the ground (a bush, a low crown), 2 = a trunk standing there. */
  cover: Uint8Array;
  /** The crowns, one per tree with a trunk (roaming area only). */
  crowns: Crown[];
  /** Trunk feet (bark blocks at the ground, 0.8 m wide or more): centre and half width (m). */
  trunks: Trunk[];
  /** Blocks read from the vegetation (0: no vegetation part). */
  blocks: number;
}

export interface Crown {
  /** Highest leaf top of the crown (m) and where it is. */
  x: number;
  y: number;
  z: number;
  /** Height of that top over the ground under it (m). */
  h: number;
  /** Trunk foot. */
  tx: number;
  tz: number;
}

export interface Trunk {
  x: number;
  z: number;
  r: number;
}

export interface Spot {
  x: number;
  z: number;
}

/** A leaf this near the ground is a bush (m), a bark block this near a trunk's foot. */
const LOW_LEAF = 1.5;
const LOW_BARK = 2;
/** Leaves at least this high over the ground are a canopy overhead (m). */
export const OVERHEAD = 5;
/** A crown counts for gibbons and hornbills from this height (m). */
const CROWN_MIN = 7;

const LEAF = /(Leaf|leaf|leaves|foliage)$/;
const BARK = /(Bark|bark|trunk)$/;

export function readCanopy(ctx: MapContext): Canopy {
  const field = ctx.field;
  const n = field.nx * field.nz;
  const top = new Float32Array(n).fill(NaN);
  const under = new Float32Array(n).fill(NaN);
  const cover = new Uint8Array(n);
  const trunks: Trunk[] = [];
  const trunkAt = new Set<number>();
  let blocks = 0;
  const veg = ctx.scene.getObjectByName('vegetation');
  if (veg) {
    veg.updateMatrixWorld(true);
    veg.traverse((o: Object3D) => {
      const mesh = o as InstancedMesh;
      // (the ':plain' twins repeat the same blocks)
      if (!mesh.isInstancedMesh || mesh.name.endsWith(':plain')) return;
      const leaf = LEAF.test(mesh.name);
      if (!leaf && !BARK.test(mesh.name)) return;
      const a = mesh.instanceMatrix.array as Float32Array;
      const w = mesh.matrixWorld.elements;
      const moved = w[12] !== 0 || w[13] !== 0 || w[14] !== 0;
      for (let i = 0; i < mesh.count; i++) {
        const o16 = i * 16;
        const x = a[o16 + 12] + (moved ? w[12] : 0);
        const y = a[o16 + 13] + (moved ? w[13] : 0);
        const z = a[o16 + 14] + (moved ? w[14] : 0);
        const hy = Math.hypot(a[o16 + 4], a[o16 + 5], a[o16 + 6]) / 2;
        const hx = Math.hypot(a[o16], a[o16 + 1], a[o16 + 2]) / 2;
        blocks++;
        // (a big far block covers a few cells)
        const reach = hx > 1.1 ? hx - 0.5 : 0;
        for (let dz = -reach; dz <= reach; dz += CELL)
          for (let dx = -reach; dx <= reach; dx += CELL) {
            const c = field.index(x + dx, z + dz);
            if (c < 0) continue;
            const g = field.height[c];
            const lo = y - hy - g;
            if (leaf) {
              if (!(top[c] >= y + hy)) top[c] = y + hy;
              if (lo > 2.5 && !(under[c] <= y - hy)) under[c] = y - hy;
              if (lo < LOW_LEAF) cover[c] |= 1;
            } else if (lo < LOW_BARK) {
              cover[c] |= 2;
              // (one trunk per cell: a squirrel's tree)
              if (hx >= 0.4 && hx < 1.1 && !trunkAt.has(c)) {
                trunkAt.add(c);
                trunks.push({ x, z, r: hx });
              }
            }
          }
      }
    });
  }
  const cn: Canopy = { field, top, under, cover, crowns: [], trunks, blocks };
  cn.crowns = findCrowns(cn);
  return cn;
}

/** Leaves over (x, z) higher than `y` (m). */
export function leavesOver(cn: Canopy, x: number, z: number, y: number): boolean {
  const c = cn.field.index(x, z);
  return c >= 0 && cn.top[c] > y && (cn.under[c] > y - 0.5 || cn.top[c] - cn.field.height[c] > OVERHEAD);
}

/** Height of the canopy top over (x, z) (m; NaN: open sky). */
export function canopyTop(cn: Canopy, x: number, z: number): number {
  const c = cn.field.index(x, z);
  return c < 0 ? NaN : cn.top[c];
}

/** One crown per trunk: the highest leaf top within 4 m of it. */
function findCrowns(cn: Canopy): Crown[] {
  const { field: f, top, cover } = cn;
  const out: Crown[] = [];
  const taken = new Map<number, number>();
  const key = (x: number, z: number) => Math.floor(x / 4) * 4096 + Math.floor(z / 4);
  const i0 = Math.max(2, Math.floor((ROAM_AREA.x0 - f.x0) / CELL));
  const i1 = Math.min(f.nx - 3, Math.floor((ROAM_AREA.x1 - f.x0) / CELL));
  const k0 = Math.max(2, Math.floor((ROAM_AREA.z0 - f.z0) / CELL));
  const k1 = Math.min(f.nz - 3, Math.floor((ROAM_AREA.z1 - f.z0) / CELL));
  for (let k = k0; k <= k1; k++)
    for (let i = i0; i <= i1; i++) {
      const c = i + k * f.nx;
      if (!(cover[c] & 2)) continue;
      let best = -1;
      let bt = -Infinity;
      for (let b = -2; b <= 2; b++)
        for (let a = -2; a <= 2; a++) {
          const cc = c + a + b * f.nx;
          if (top[cc] > bt) {
            bt = top[cc];
            best = cc;
          }
        }
      if (best < 0 || !(bt - f.height[c] >= CROWN_MIN)) continue;
      const bi = best % f.nx;
      const bk = (best - bi) / f.nx;
      const [x, z] = f.cellCenter(bi, bk);
      // (a trunk two cells wide, or two trunks under one crown: one crown)
      let dup = false;
      for (let b = -1; b <= 1 && !dup; b++)
        for (let a = -1; a <= 1 && !dup; a++) {
          const j = taken.get(key(x + a * 4, z + b * 4));
          if (j !== undefined && Math.hypot(out[j].x - x, out[j].z - z) < 4) dup = true;
        }
      if (dup) continue;
      const [tx, tz] = f.cellCenter(i, k);
      taken.set(key(x, z), out.length);
      out.push({ x, y: bt, z, h: bt - f.height[c], tx, tz });
    }
  return out;
}

// ── Grounds ──────────────────────────────────────────────────────────────────

/**
 * The forest floor: dry grass, dirt, sand and the road, not in a bush, a
 * trunk, water, on rock, a pad or anything built.
 */
export function floorGround(cn: Canopy): Ground {
  const { field: f, cover } = cn;
  return (x, z) => {
    const c = f.index(x, z);
    if (c < 0 || f.water[c] > -1000 || cover[c] & 3) return NaN;
    const s = f.surface[c];
    if (s === SURFACE.pad || s === SURFACE.bed || s === SURFACE.rock) return NaN;
    if (f.occupied[c] && s !== SURFACE.sand && s !== SURFACE.path) return NaN;
    return f.height[c];
  };
}

/** River banks and shallows (up to 0.6 m deep) with open sky over them (giant ibis). */
export function marshGround(cn: Canopy): Ground {
  const { field: f, cover, top } = cn;
  return (x, z) => {
    const c = f.index(x, z);
    if (c < 0 || cover[c] || top[c] > f.height[c] + 1) return NaN;
    const h = f.height[c];
    if (f.water[c] > h) return f.water[c] - h <= 0.6 ? h : NaN;
    const s = f.surface[c];
    if (s !== SURFACE.sand && s !== SURFACE.grass && s !== SURFACE.dirt) return NaN;
    if (f.occupied[c] && s !== SURFACE.sand) return NaN;
    return h;
  };
}

// ── Finding places ───────────────────────────────────────────────────────────

const inRoam = (x: number, z: number, margin: number) => x > ROAM_AREA.x0 + margin && x < ROAM_AREA.x1 - margin && z > ROAM_AREA.z0 + margin && z < ROAM_AREA.z1 - margin;
const nearPlace = (x: number, z: number, r: number) => PLACES.some((p) => Math.hypot(p.x - x, p.z - z) < Math.max(p.pad[0], p.pad[1]) + r);

/** Summed-area table of a per-cell 0/1 test: window counts in O(1). */
export class Sat {
  private readonly t: Float64Array;
  constructor(
    private readonly f: HeightField,
    v: (c: number) => boolean,
  ) {
    const { nx, nz } = f;
    const t = new Float64Array((nx + 1) * (nz + 1));
    for (let k = 0; k < nz; k++) {
      let row = 0;
      for (let i = 0; i < nx; i++) {
        row += v(i + k * nx) ? 1 : 0;
        t[i + 1 + (k + 1) * (nx + 1)] = t[i + 1 + k * (nx + 1)] + row;
      }
    }
    this.t = t;
  }

  /** Share of the cells within `r` cells of the cell under (x, z) (0‥1). */
  share(x: number, z: number, r: number): number {
    const f = this.f;
    const c = f.index(x, z);
    if (c < 0) return 0;
    const i = c % f.nx;
    const k = (c - i) / f.nx;
    const w = f.nx + 1;
    const i0 = Math.max(0, i - r);
    const k0 = Math.max(0, k - r);
    const i1 = Math.min(f.nx - 1, i + r) + 1;
    const k1 = Math.min(f.nz - 1, k + r) + 1;
    const t = this.t;
    return (t[i1 + k1 * w] - t[i0 + k1 * w] - t[i1 + k0 * w] + t[i0 + k0 * w]) / ((i1 - i0) * (k1 - k0));
  }
}

/** Greedy pick from candidates (best first), `spacing` apart and away from `avoid`. */
function spread(cands: (Spot & { score: number })[], n: number, spacing: number, avoid: Spot[]): Spot[] {
  cands.sort((a, b) => b.score - a.score);
  const out: Spot[] = [];
  for (const c of cands) {
    if (out.length >= n) break;
    if (out.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < spacing) || avoid.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < spacing * 0.6)) continue;
    out.push({ x: c.x, z: c.z });
  }
  return out;
}

/** Search grids shared by the site finders. */
export interface Sites {
  floor: Ground;
  /** Open floor, and floor under leaves. */
  open: Sat;
  shade: Sat;
  road: Sat;
}

export function sites(cn: Canopy): Sites {
  const f = cn.field;
  const floor = floorGround(cn);
  const ok = new Uint8Array(f.nx * f.nz);
  for (let c = 0; c < ok.length; c++) {
    const i = c % f.nx;
    const [x, z] = f.cellCenter(i, (c - i) / f.nx);
    ok[c] = Number.isNaN(floor(x, z)) ? 0 : 1;
  }
  return {
    floor,
    open: new Sat(f, (c) => ok[c] === 1 && !(cn.top[c] - f.height[c] > OVERHEAD)),
    shade: new Sat(f, (c) => ok[c] === 1 && cn.top[c] - f.height[c] > OVERHEAD),
    road: new Sat(f, (c) => f.surface[c] === SURFACE.path),
  };
}

/** Deep forest floor with room to root about (wild boar): open floor under the canopy. */
export function forestFloors(s: Sites, n: number, spacing: number, avoid: Spot[]): Spot[] {
  const cands: (Spot & { score: number })[] = [];
  for (let z = ROAM_AREA.z0 + 40; z < ROAM_AREA.z1 - 30; z += 8)
    for (let x = ROAM_AREA.x0 + 40; x < ROAM_AREA.x1 - 40; x += 8) {
      if (Number.isNaN(s.floor(x, z)) || nearPlace(x, z, 30)) continue;
      const shade = s.shade.share(x, z, 5);
      const open = s.open.share(x, z, 5);
      if (shade < 0.45 || shade + open < 0.7 || s.road.share(x, z, 4) > 0) continue;
      // (rather near a road: where the explorer walks)
      const near = s.road.share(x, z, 18) > 0 ? 0.4 : 0;
      cands.push({ x, z, score: shade + 0.5 * open + near + hash3(x, z, 17) * 0.3 });
    }
  return spread(cands, n, spacing, avoid);
}

/** Clearings at the forest edge (green peafowl): open grass with trees round it, off the road. */
export function clearings(s: Sites, n: number, spacing: number, avoid: Spot[]): Spot[] {
  const cands: (Spot & { score: number })[] = [];
  for (let z = ROAM_AREA.z0 + 40; z < ROAM_AREA.z1 - 30; z += 6)
    for (let x = ROAM_AREA.x0 + 40; x < ROAM_AREA.x1 - 40; x += 6) {
      if (Number.isNaN(s.floor(x, z)) || nearPlace(x, z, 25)) continue;
      const open = s.open.share(x, z, 5);
      const shade = s.shade.share(x, z, 7);
      if (open < 0.45 || shade < 0.15 || s.open.share(x, z, 1) < 1 || s.road.share(x, z, 4) > 0) continue;
      const near = s.road.share(x, z, 16) > 0 ? 0.35 : 0;
      cands.push({ x, z, score: open + Math.min(shade, 0.45) + near + hash3(x, z, 19) * 0.3 });
    }
  return spread(cands, n, spacing, avoid);
}

/** Lowland river banks with shallows beside them and open sky (giant ibis), lowest first. */
export function lowBanks(cn: Canopy, n: number, spacing: number): Spot[] {
  const f = cn.field;
  const g = marshGround(cn);
  const cands: (Spot & { score: number })[] = [];
  for (const r of f.rivers)
    for (let i = 4; i < r.samples.length - 4; i += 4) {
      const s = r.samples[i];
      for (const side of [1, -1]) {
        const nx = -s.dir[1] * side;
        const nz = s.dir[0] * side;
        const off = s.w / 2 + 1.5;
        const x = s.x + nx * off;
        const z = s.z + nz * off;
        if (!inRoam(x, z, 25) || nearPlace(x, z, 20)) continue;
        const h = g(x, z);
        if (Number.isNaN(h) || f.water[f.index(x, z)] > h) continue;
        // Room along the bank.
        let room = 0;
        for (let a = -3; a <= 3; a++) if (!Number.isNaN(g(x + s.dir[0] * a * 2, z + s.dir[1] * a * 2))) room++;
        if (room < 4) continue;
        cands.push({ x, z, score: -s.level * 0.2 + room * 0.3 + (x < -200 ? 3 : 0) + hash3(Math.round(x), Math.round(z), 23) });
      }
    }
  return spread(cands, n, spacing, []);
}

/** The tallest crowns (hornbill perches), `spacing` apart; `seen` of them in the overview's frame first. */
export function tallCrowns(cn: Canopy, n: number, spacing: number, seen: number): Crown[] {
  const view = MAP_VIEWS[0];
  const tall = cn.crowns.filter((c) => c.h > 11 && inRoam(c.x, c.z, 30) && !nearPlace(c.x, c.z, 15));
  const score = (c: Crown) => c.h + hash3(Math.round(c.x), Math.round(c.z), 29) * 4;
  const pick = (list: Crown[], k: number, taken: Crown[]) => {
    const out: Crown[] = [];
    for (const c of [...list].sort((a, b) => score(b) - score(a))) {
      if (out.length >= k) break;
      if ([...taken, ...out].some((o) => Math.hypot(o.x - c.x, o.z - c.z) < spacing)) continue;
      out.push(c);
    }
    return out;
  };
  // (the overview's: in its frame, near enough to be seen as birds, not so near as to clutter it)
  const dist = (c: Crown) => viewDistance(view, c.x, c.y, c.z);
  const inView = cn.crowns
    .filter((c) => c.h > 9 && inRoam(c.x, c.z, 30) && !nearPlace(c.x, c.z, 15) && dist(c) > 150 && dist(c) < 320)
    .map((c) => ({ ...c, h: c.h - Math.abs(dist(c) - 230) / 15 }));
  const first = pick(inView, seen, []).map((c) => cn.crowns.find((o) => o.x === c.x && o.z === c.z)!);
  return first.concat(pick(tall, n - first.length, first));
}

/** Dense stands of tall crowns (gibbon families): many crowns ≥ 9 m within `r` m. */
export function groves(cn: Canopy, n: number, spacing: number, avoid: Spot[], r = 26): Spot[] {
  const cands: (Spot & { score: number })[] = [];
  const big = cn.crowns.filter((c) => c.h >= 9 && inRoam(c.x, c.z, 40) && !nearPlace(c.x, c.z, 20));
  // (bucketed, so counting neighbours is quick)
  const B = 32;
  const buckets = new Map<number, Crown[]>();
  const key = (i: number, k: number) => i * 4096 + k;
  for (const c of big) {
    const kk = key(Math.floor(c.x / B), Math.floor(c.z / B));
    let l = buckets.get(kk);
    if (!l) buckets.set(kk, (l = []));
    l.push(c);
  }
  for (const c of big) {
    let count = 0;
    const bi = Math.floor(c.x / B);
    const bk = Math.floor(c.z / B);
    for (let b = -1; b <= 1; b++)
      for (let a = -1; a <= 1; a++) for (const o of buckets.get(key(bi + a, bk + b)) ?? []) if (Math.hypot(o.x - c.x, o.z - c.z) < r) count++;
    if (count < 8) continue;
    cands.push({ x: c.x, z: c.z, score: count + hash3(Math.round(c.x), Math.round(c.z), 31) * 3 });
  }
  return spread(cands, n, spacing, avoid);
}
