import { AdditiveBlending, BoxGeometry, CanvasTexture, Color, Group, Mesh, MeshBasicMaterial, Sprite, SpriteMaterial } from 'three';
import { hash3, valueNoise3 } from '../../voxel/random';
import type { VoxelGrid } from '../../voxel/VoxelBuilder';
import type { MapFrame } from '../types';
import type { StoneTones } from './_faces';

/**
 * Shared pieces of the map's ruins (Preah Khan, Bayon):
 * weathered stone tones, moss and hanging vines, small trees and a strangler
 * fig whose roots run down the walls, and faint candle glows for the night.
 */

/** Dark grey-brown weathered sandstone of Preah Khan. */
export const RUIN_STONE: StoneTones = {
  wall: [0x6d665d, 0x665f57, 0x756d63, 0x605a52],
  mid: [0x7a7267, 0x736b61, 0x81796d],
  light: [0x8f867a, 0x877f73, 0x978e81],
  bright: [0xa89e8f, 0xa09687, 0xb0a697],
  dark: [0x4d4740, 0x47423c, 0x534d45],
  deep: [0x1e1b18, 0x24201d, 0x1a1715],
  shadow: [0x423d37, 0x3d3833, 0x48423c],
  ledge: [0x857c70, 0x7d7569, 0x8c8377],
  moss: [0x4f6a2c, 0x5a7732, 0x44602a, 0x66823a],
};

/** Laterite of the ruin's base: rusty brown, pitted. */
export const LATERITE = [0x7a5f4a, 0x705744, 0x83664f, 0x68513f];

/** Hanging vines and creepers. */
export const VINE = [0x3f5f26, 0x4a6b2b, 0x385522, 0x557a31];

/** Pale grey bark of strangler figs (like the roots at Ta Prohm). */
export const FIG_BARK = [0xa39680, 0x988b76, 0xada08a, 0x8d816d];

/** Dark bark of ordinary trees. */
export const TREE_BARK = [0x6b5040, 0x5f4739, 0x745746];

/** Jungle canopy greens (mapLeaf). */
export const CANOPY = [0x4f7a2a, 0x5b8a30, 0x456c26, 0x679838, 0x3f6322];

export const pickOf = (list: readonly number[], i: number, j: number, k: number, seed: number): number => list[Math.floor(hash3(i, j, k, seed) * list.length)];

const key = (i: number, j: number, k: number) => `${i},${j},${k}`;

export interface OvergrowOptions {
  seed: number;
  /** Cells never covered (the carved faces). */
  keep?: Set<string>;
  /** Chance of moss on a stone block's open top. */
  top: (i: number, j: number, k: number) => number;
  /** Chance of moss on an open wall block. */
  side: (i: number, j: number, k: number) => number;
  /** Chance of a vine hanging from a ledge edge, and its length range (cells). */
  vines: number;
  vineLen: [number, number];
  /** Chance of a moss cushion (an extra block) on an open top. */
  cushion?: number;
  moss: readonly number[];
}

/**
 * Moss on ledges and walls (patches, not noise: a low-frequency field picks
 * where), moss cushions, and vines hanging from ledge edges down the walls.
 * Only stone (`mapStone`) is overgrown; the face cells in `keep` stay clean.
 */
export function overgrow(g: VoxelGrid, o: OvergrowOptions): void {
  const stones: [number, number, number][] = [];
  g.forEach((i, j, k, c) => {
    if (c.mat === 'mapStone' && !c.ghost && !o.keep?.has(key(i, j, k))) stones.push([i, j, k]);
  });
  // Patches, not speckle: a smooth field (≈ 5 m) with a finer one on top; the
  // chance moves the threshold, a little dither frays the patch edges.
  const patch = (i: number, j: number, k: number) => 0.7 * valueNoise3(i / 5, j / 4, k / 5, o.seed) + 0.3 * valueNoise3(i / 2, j / 2, k / 2, o.seed + 1);
  const covered = (chance: number, p: number, r: number) => p > 0.75 - 0.5 * chance + (r - 0.5) * 0.12;
  const blocked = (i: number, j: number, k: number) =>
    o.keep !== undefined && (o.keep.has(key(i, j, k)) || o.keep.has(key(i + 1, j, k)) || o.keep.has(key(i - 1, j, k)) || o.keep.has(key(i, j, k + 1)) || o.keep.has(key(i, j, k - 1)));
  for (const [i, j, k] of stones) {
    const r = hash3(i, j, k, o.seed);
    const p = patch(i, j, k);
    const openTop = !g.has(i, j + 1, k);
    if (openTop && covered(o.top(i, j, k), p, r)) {
      g.put(i, j, k, { color: pickOf(o.moss, i, j, k, o.seed + 1), mat: 'mapGrass', shade: 0.9 + 0.2 * hash3(i, j, k, o.seed + 2) });
      if (o.cushion && hash3(i, j, k, o.seed + 3) < o.cushion && covered(o.top(i, j, k), p - 0.12, r) && !blocked(i, j + 1, k))
        g.put(i, j + 1, k, { color: pickOf(o.moss, i, j + 1, k, o.seed + 4), mat: 'mapGrass', shade: 1.05 });
    } else if (!openTop) {
      const open = !g.has(i + 1, j, k) || !g.has(i - 1, j, k) || !g.has(i, j, k + 1) || !g.has(i, j, k - 1);
      if (open && covered(o.side(i, j, k), p, r)) g.put(i, j, k, { color: pickOf(o.moss, i, j, k, o.seed + 5), mat: 'mapGrass', shade: 0.82 });
    }
    // Vines from ledge edges: start beside the ledge, fall along the wall below.
    if (openTop && hash3(i, j, k, o.seed + 6) < o.vines) {
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const [vi, vk] = [i + dx, k + dz];
        if (g.has(vi, j, vk) || g.has(vi, j - 1, vk) || !g.has(i, j - 1, k)) continue;
        const len = o.vineLen[0] + Math.floor(hash3(vi, j, vk, o.seed + 7) * (o.vineLen[1] - o.vineLen[0] + 1));
        for (let s = 0; s < len; s++) {
          const vj = j - s;
          if (vj < 0 || g.has(vi, vj, vk) || blocked(vi, vj, vk)) break;
          // Thin out towards the tip.
          if (s > 1 && hash3(vi, vj, vk, o.seed + 8) < 0.12) break;
          g.put(vi, vj, vk, { color: pickOf(VINE, vi, vj, vk, o.seed + 9), mat: 'mapLeaf', shade: 0.8 + 0.15 * hash3(vi, vj, vk, 3) });
        }
        break;
      }
    }
  }
}

/**
 * Weathering: knock stones off exposed corners and edges (never the cells in
 * `keep`). `corner` is the chance for a block open on two or more sides,
 * `edge` for a top block open on one side.
 */
export function chip(g: VoxelGrid, o: { seed: number; corner: number; edge: number; keep?: Set<string>; from?: number }): void {
  const gone: [number, number, number][] = [];
  g.forEach((i, j, k, c) => {
    if (c.mat !== 'mapStone' || c.ghost || j < (o.from ?? 0) || o.keep?.has(key(i, j, k))) return;
    const sides = (g.has(i + 1, j, k) ? 0 : 1) + (g.has(i - 1, j, k) ? 0 : 1) + (g.has(i, j, k + 1) ? 0 : 1) + (g.has(i, j, k - 1) ? 0 : 1);
    const top = !g.has(i, j + 1, k);
    const r = hash3(i, j, k, o.seed);
    if ((sides >= 2 && top && r < o.corner) || (sides >= 2 && r < o.corner * 0.35) || (sides === 1 && top && r < o.edge)) gone.push([i, j, k]);
  });
  for (const [i, j, k] of gone) g.delete(i, j, k);
}

export interface TreeOptions {
  /** Trunk height (cells) and canopy radius (m). */
  trunk: number;
  radius: number;
  seed: number;
  /** Canopy height ÷ width (default 0.6: umbrella crowns). */
  squash?: number;
  /** Where the crown sits relative to the trunk top (cells). */
  lean?: [number, number];
  bark?: readonly number[];
  leaf?: readonly number[];
  /** Trunk two cells thick. */
  thick?: boolean;
}

/** A tree of 1 m blocks: trunk (mapBark), a few branches, a lumpy crown (mapLeaf). Never replaces stone. */
export function growTree(g: VoxelGrid, i: number, j: number, k: number, o: TreeOptions): void {
  const bark = o.bark ?? TREE_BARK;
  const leaf = o.leaf ?? CANOPY;
  const [li, lk] = o.lean ?? [0, 0];
  const setIfFree = (x: number, y: number, z: number, color: number, mat: 'mapBark' | 'mapLeaf', shade = 1) => {
    if (!g.has(x, y, z)) g.put(x, y, z, { color, mat, shade });
  };
  const top = j + o.trunk;
  for (let y = j; y < top; y++) {
    // Lean the trunk towards the crown as it rises.
    const t = (y - j) / Math.max(1, o.trunk);
    const x = i + Math.round(li * t * 0.6);
    const z = k + Math.round(lk * t * 0.6);
    setIfFree(x, y, z, pickOf(bark, x, y, z, o.seed), 'mapBark', 0.9);
    if (o.thick) {
      setIfFree(x + 1, y, z, pickOf(bark, x + 1, y, z, o.seed), 'mapBark', 0.85);
      setIfFree(x, y, z + 1, pickOf(bark, x, y, z + 1, o.seed), 'mapBark', 0.85);
      setIfFree(x + 1, y, z + 1, pickOf(bark, x + 1, y, z + 1, o.seed), 'mapBark', 0.8);
    }
  }
  const [ci, ck] = [i + li, k + lk];
  const r = o.radius;
  const ry = Math.max(1.5, r * (o.squash ?? 0.6));
  const cy = top + ry * 0.35;
  // Branches from the trunk top into the crown.
  for (let b = 0; b < 3; b++) {
    const a = hash3(i, j, b, o.seed + 11) * Math.PI * 2;
    for (let s = 1; s <= Math.round(r * 0.6); s++) {
      const x = Math.round(ci + Math.cos(a) * s);
      const z = Math.round(ck + Math.sin(a) * s);
      setIfFree(x, top - 1 + Math.floor(s / 2), z, pickOf(bark, x, top, z, o.seed), 'mapBark', 0.85);
    }
  }
  const R = Math.ceil(r) + 1;
  for (let dx = -R; dx <= R; dx++)
    for (let dz = -R; dz <= R; dz++)
      for (let dy = -Math.ceil(ry) - 1; dy <= Math.ceil(ry) + 1; dy++) {
        const x = ci + dx;
        const y = Math.round(cy) + dy;
        const z = ck + dz;
        const lump = (valueNoise3(x / 2.5, y / 2.5, z / 2.5, o.seed) - 0.5) * 0.55;
        const d = Math.hypot(dx / r, dy / ry, dz / r) + lump;
        if (d > 1) continue;
        // Lighter on top, darker underneath and inside.
        const shade = 0.72 + 0.4 * Math.min(1, Math.max(0, (dy + ry) / (2 * ry))) + (hash3(x, y, z, o.seed) - 0.5) * 0.12;
        setIfFree(x, y, z, pickOf(leaf, x, y, z, o.seed + 1), 'mapLeaf', shade);
      }
}

/**
 * A root: from `start` it creeps outwards along `dir` over the stone, and
 * drops wherever it can, so it hugs ledges and falls down wall faces to the
 * ground (row `floor`), then crawls a few cells along it. Returns its cells.
 */
export function drapeRoot(
  g: VoxelGrid,
  start: [number, number, number],
  dir: [number, number],
  o: { floor: number; seed: number; thick?: number; crawl?: number; bark?: readonly number[] },
): [number, number, number][] {
  const bark = o.bark ?? FIG_BARK;
  let [i, j, k] = start;
  const cells: [number, number, number][] = [];
  const put = (x: number, y: number, z: number, shade: number) => {
    const c = g.get(x, y, z);
    if (c && c.mat !== 'mapStone' && c.mat !== 'mapGrass') return;
    g.put(x, y, z, { color: pickOf(bark, x, y, z, o.seed), mat: 'mapBark', shade });
    cells.push([x, y, z]);
  };
  const side: [number, number] = [-dir[1], dir[0]];
  let crawl = o.crawl ?? 3;
  for (let step = 0; step < 200; step++) {
    // Roots replace stone they run over (they sit in the surface), thicker near the trunk.
    put(i, j, k, 0.95);
    if ((o.thick ?? 0) > 0 && step < (o.thick ?? 0)) put(i + side[0], j, k + side[1], 0.88);
    if (j <= o.floor) {
      if (crawl-- <= 0) break;
      i += dir[0];
      k += dir[1];
      if (g.has(i, j + 1, k)) break;
      continue;
    }
    if (!g.has(i, j - 1, k) || g.get(i, j - 1, k)?.mat === 'mapBark') {
      j -= 1;
      // Hug the stone: hanging free (nothing beside it), step back under the overhang.
      const touches = [side, [-side[0], -side[1]], dir, [-dir[0], -dir[1]]].some(([a, c]) => g.get(i + a, j, k + c)?.mat === 'mapStone');
      if (!touches && !g.has(i - dir[0], j, k - dir[1])) {
        put(i, j, k, 0.9);
        i -= dir[0];
        k -= dir[1];
      }
      // Wander sideways now and then, as long as it stays against the wall.
      const w = hash3(i, j, k, o.seed + 3);
      if (w < 0.18) {
        const [si, sk] = w < 0.09 ? side : [-side[0], -side[1]];
        if (!g.has(i + si, j, k + sk) && g.has(i + si - dir[0], j, k + sk - dir[1])) {
          i += si;
          k += sk;
        }
      }
    } else {
      // On a ledge: outwards over it, climbing a one-block step if there is one.
      const [ni, nk] = [i + dir[0], k + dir[1]];
      if (!g.has(ni, j, nk)) [i, k] = [ni, nk];
      else if (!g.has(ni, j + 1, nk)) [i, j, k] = [ni, j + 1, nk];
      else break;
    }
  }
  return cells;
}

/**
 * A limb of bark cells from `a` to `b` (cells), `thick` cells square for the
 * first part of its length, then one. Replaces leaves and stone it runs through.
 */
export function limb(g: VoxelGrid, a: [number, number, number], b: [number, number, number], o: { seed: number; thick?: number; bark?: readonly number[] }): void {
  const bark = o.bark ?? FIG_BARK;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2]))));
  for (let s = 0; s <= n; s++) {
    const t = s / n;
    const [x, y, z] = [0, 1, 2].map((c) => Math.round(a[c] + (b[c] - a[c]) * t));
    const w = t < 0.6 ? (o.thick ?? 1) : 1;
    for (let dx = 0; dx < w; dx++)
      for (let dz = 0; dz < w; dz++) g.put(x + dx, y, z + dz, { color: pickOf(bark, x + dx, y, z + dz, o.seed), mat: 'mapBark', shade: 0.88 + 0.12 * hash3(x + dx, y, z + dz, o.seed + 1) });
  }
}

/** Soft round spot for the glow halos. */
function haloTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

/**
 * Faint candle light: small unlit flames whose colour goes above 1.0
 * (linear) at night so they bloom a little, and a soft additive halo round
 * them. Barely there by day. Flickers slowly.
 */
export class CandleGlow {
  readonly object = new Group();
  private readonly flame = new MeshBasicMaterial({ color: 0xffffff });
  private readonly halo: SpriteMaterial;
  private readonly base = new Color(1, 0.55, 0.2);
  private readonly seed: number;

  constructor(
    candles: [number, number, number][],
    halos: { at: [number, number, number]; size: number }[],
    private readonly o: { night: number; day: number; halo: number; seed?: number },
  ) {
    this.object.name = 'candles';
    this.seed = o.seed ?? 1;
    const geo = new BoxGeometry(0.3, 0.45, 0.3);
    for (const [x, y, z] of candles) {
      const m = new Mesh(geo, this.flame);
      m.position.set(x, y, z);
      this.object.add(m);
    }
    this.halo = new SpriteMaterial({ map: haloTexture(), color: 0xffa050, blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 });
    for (const h of halos) {
      const s = new Sprite(this.halo);
      s.position.set(...h.at);
      s.scale.setScalar(h.size);
      this.object.add(s);
    }
  }

  update(f: MapFrame): void {
    const n = f.night;
    const flicker = 1 + 0.06 * Math.sin(f.t * 1.3 + this.seed) + 0.04 * Math.sin(f.t * 2.9 + this.seed * 2.1);
    const k = (this.o.day + (this.o.night - this.o.day) * n) * flicker;
    this.flame.color.copy(this.base).multiplyScalar(k);
    this.halo.opacity = this.o.halo * n * n * flicker;
    this.object.visible = k > 0.02;
  }
}
