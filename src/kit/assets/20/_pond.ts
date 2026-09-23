import { hash3 } from '../../../voxel/random';
import type { VoxelBuilder, VoxelGrid } from '../../../voxel/VoxelBuilder';
import { FLOWER, LITTER } from '../../palette';
import type { PieceBuilder } from '../../PieceBuilder';
import { here, rng, snap, TEXEL, type Rng } from '../../shapes';
import { leafSurf, soilSurf, stoneSurf } from '../../surface';

/**
 * Water and water plants of the world kit — built for the §20 ⑧ small pond and
 * meant for every other body of water too (the §17 moat, the temple's reflecting
 * pools):
 *
 *  - {@link waterBody}: one translucent `water` box per body of water over a
 *    dark bed of silt and sunken stones, so it reads deep; its colliders (the
 *    water blocks the explorer but is never stood on, the bed is the floor).
 *  - {@link pondFlora}: lily-pad clusters, lotus flowers resting on them, buds
 *    on stalks and floating dry leaves, scattered over a water surface of any
 *    outline.
 *  - The single plants, for placing by hand: {@link FloatLayer} with
 *    {@link lilyPad} / {@link floatingLeaf}, and a {@link bloomGrid} with
 *    {@link lotusFlower} / {@link lotusBud}.
 *
 * A basin whose water spans x0‥x1 × z0‥z1 (a texel under its banks) with the
 * surface at `top`:
 *
 *   waterBody(p, { x0, z0, x1, z1, top, bed: top - 0.5 });
 *   pondFlora(p, { top, x0, z0, x1, z1, inside, seed, clusters: 5, flowers: 2, buds: 1 });
 *
 * The sheet's pads are round discs one texel thick with a notch, in several
 * greens, grouped in overlapping clusters; the lotus is an open bloom — a wide
 * star of near-white petals with pink tips, a small cup round a yellow seed
 * pod — sitting on its pads, and the buds are deep pink with a pale tip. Pads
 * and leaves are texel cells in the surface (a quarter under the water line,
 * so it cuts their edges); flowers and buds are half-texel cells, which gives
 * a real 0.2–0.3 m flower as many petals as the sheet draws on its bigger one.
 */

/** Colours (sRGB albedo), sampled from the §20 sheet's ponds and corrected for the studio light. */
export const POND = {
  /** Open water: renders as the sheet's lit teal (#3f6970) over a dark bed. */
  water: 0x44707c,
  /** The bed: dark silt, and the stones lying on it. */
  silt: 0x28322c,
  sunken: [0x4c4b3d, 0x575340, 0x42433a],
  /** Lily pads, yellow-green to dark olive (the sheet's #8fa22d, #6b822c and shaded pads). */
  pad: [0x7d9c35, 0x68892f, 0x8ba93b, 0x587b2c, 0x4b6d28],
  /** Stalks and the green sepals of the buds. */
  stalk: [0x5b7f30, 0x4e7129],
  /** Lotus: near-white outer petals, pink tips, a pale pink ring and cup, the yellow seed pod (the sheet's blooms read pale). */
  lotus: {
    outer: [0xfff1f4, 0xfde6ec, 0xfff8fa],
    tip: [0xee94ae, 0xe98aa8],
    mid: [0xf9d2dc, 0xf6c4d1],
    inner: [0xf0a3ba, 0xec98b2],
    deep: [0xe27e9e, 0xdb7494],
    pod: FLOWER.yellow,
  },
  /** Buds: deep pink body, paler tip. */
  bud: [0xd45d80, 0xc95276],
  budTip: [0xf6c4d2, 0xfbd3de],
  /** Dry leaves blown onto the water. */
  leaf: [...LITTER.dry, ...LITTER.wet],
} as const;

const pick = (list: readonly number[], i: number, j: number, k: number, seed: number) => list[Math.floor(hash3(i, j, k, seed) * list.length) % list.length];

// ── The water ────────────────────────────────────────────────────────────────

export interface WaterBodyOptions {
  /** Water area (metres). Let it reach a texel into the banks so no seam shows. */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Height of the water surface (keep it on the texel grid: the ripple texels line up). */
  top: number;
  /** Top of the bed under the water. */
  bed: number;
  /** Bottom of the bed blocks (default one texel under `bed`). */
  bottom?: number;
  /** Where sunken stones may lie (default: anywhere in the area). */
  inside?: (x: number, z: number) => boolean;
  /** Sunken stones per m² of bed (default 0.5). */
  stones?: number;
  color?: number;
  seed?: number;
}

/**
 * A body of water: the dark bed (silt, a few sunken stones), then one
 * translucent box up to the surface — the `water` family draws the ripples and
 * glints. Adds the bed as a floor collider and the water as a `noStand` one.
 */
export function waterBody(p: PieceBuilder, o: WaterBodyOptions): void {
  const r = rng(o.seed ?? 1);
  const bottom = o.bottom ?? o.bed - TEXEL;
  p.voxels.span(o.x0, bottom, o.z0, o.x1, o.bed, o.z1, POND.silt, 'soil', { surf: soilSurf({ wet: 1, moss: 0.45 }) });
  const n = Math.round((o.x1 - o.x0) * (o.z1 - o.z0) * (o.stones ?? 0.5));
  const h = Math.min(2 * TEXEL, o.top - TEXEL - o.bed);
  for (let s = 0; s < n && h > 0; s++) {
    const w = r.int(2, 4) * TEXEL;
    const d = r.int(2, 4) * TEXEL;
    const x = snap(r.range(o.x0 + w, o.x1 - w));
    const z = snap(r.range(o.z0 + d, o.z1 - d));
    if (o.inside && !o.inside(x, z)) continue;
    p.voxels.span(x - w / 2, o.bed, z - d / 2, x + w / 2, o.bed + h, z + d / 2, r.pick(POND.sunken), 'sandstone', { surf: stoneSurf({ moss: 0.55, stain: 0.6 }) });
  }
  p.voxels.span(o.x0, o.bed, o.z0, o.x1, o.top, o.z1, o.color ?? POND.water, 'water');
  p.collider(o.x0, bottom, o.z0, o.x1, o.bed, o.z1);
  p.collider(o.x0, o.bed, o.z0, o.x1, o.top, o.z1, true);
}

// ── Floating plants: pads and leaves ─────────────────────────────────────────

interface FloatCell {
  color: number;
  plant: number;
  yellow: number;
}

const fkey = (i: number, k: number) => (i + 4096) * 8192 + (k + 4096);

/**
 * Flat things floating on the water — lily pads, dry leaves — as texel cells
 * sitting in the surface (a quarter texel under it), cell (0, 0) at `origin`
 * (x, z on the texel grid). Every plant is emitted as one plate: its cells
 * merge (no bevel between them) and only its outline is rounded and catches
 * the rim light, where a voxel grid would draw every texel as a stud. Where two
 * plants overlap the later one lies on top.
 */
export class FloatLayer {
  private readonly cells = new Map<number, FloatCell>();
  private plants = 0;
  /** Cell (0, 0) min corner: x, surface height, z. */
  constructor(readonly origin: [number, number, number]) {}

  /** A fresh plant id: cells of one plant merge into one plate. */
  plant(): number {
    return this.plants++;
  }

  set(i: number, k: number, color: number, plant: number, yellow = 0): void {
    this.cells.set(fkey(i, k), { color, plant, yellow });
  }

  has(i: number, k: number): boolean {
    return this.cells.has(fkey(i, k));
  }

  /** Centre (metres) of cell (i, k). */
  at(i: number, k: number): [number, number] {
    return [this.origin[0] + (i + 0.5) * TEXEL, this.origin[2] + (k + 0.5) * TEXEL];
  }

  commit(b: VoxelBuilder): void {
    const y = this.origin[1] - TEXEL / 4 + TEXEL / 2;
    const src = here();
    for (const [kk, c] of this.cells) {
      const i = Math.floor(kk / 8192) - 4096;
      const k = (kk % 8192) - 4096;
      const n = (di: number, dk: number) => this.cells.get(fkey(i + di, k + dk));
      let open = 4;
      let merge = 0;
      ([[1, 0, 1], [-1, 0, 2], [0, 1, 16], [0, -1, 32]] as const).forEach(([di, dk, bit]) => {
        const o = n(di, dk);
        if (!o) open |= bit;
        else if (o.plant === c.plant) merge |= bit;
      });
      const [x, z] = this.at(i, k);
      const shade = 0.94 + 0.12 * hash3(c.plant, 3, 7, 11);
      b.box(x, y, z, TEXEL, TEXEL, TEXEL, c.color, 'leaves', { open, merge, shade, surf: leafSurf({ yellow: c.yellow }), src });
    }
  }
}

/**
 * One lily pad: a disc of texel cells (centre and radius in cells) with the
 * notch the sheet draws, a wedge from the rim in to the stem at angle `notch`.
 * `keep` drops cells that would lie on the bank.
 */
export function lilyPad(f: FloatLayer, ci: number, ck: number, radius: number, notch: number, color: number, o: { yellow?: number; keep?: (i: number, k: number) => boolean } = {}): void {
  const plant = f.plant();
  const R = Math.ceil(radius);
  for (let i = Math.floor(ci - R); i <= Math.ceil(ci + R); i++)
    for (let k = Math.floor(ck - R); k <= Math.ceil(ck + R); k++) {
      const dx = i + 0.5 - ci;
      const dz = k + 0.5 - ck;
      const d = Math.hypot(dx, dz);
      if (d > radius) continue;
      let da = Math.abs(Math.atan2(dz, dx) - notch) % (Math.PI * 2);
      if (da > Math.PI) da = Math.PI * 2 - da;
      if (d > 0.75 && da < 0.36) continue;
      if (o.keep && !o.keep(i, k)) continue;
      f.set(i, k, color, plant, o.yellow ?? 0);
    }
}

/** A dry leaf on the water: 2–3 texels along a random direction, sometimes with a side lobe. */
export function floatingLeaf(f: FloatLayer, ci: number, ck: number, seed: number, keep?: (i: number, k: number) => boolean): void {
  const r = rng(seed);
  const plant = f.plant();
  const [di, dk] = r.pick([[1, 0], [0, 1], [1, 1], [1, -1]] as const);
  const n = r.int(2, 3);
  const color = r.pick(POND.leaf);
  const put = (i: number, k: number) => {
    if (!f.has(i, k) && (!keep || keep(i, k))) f.set(i, k, color, plant);
  };
  for (let s = 0; s < n; s++) put(ci + di * s, ck + dk * s);
  if (n === 3 && r.chance(0.6)) put(ci + di - dk, ck + dk + di);
}

// ── Blooms: lotus flowers and buds ───────────────────────────────────────────

/**
 * The half-texel grid flowers and buds are drawn in: row 0 on top of the pads
 * (the water surface + ¾ texel), cell (2i, ·, 2k) at the corner of pad cell
 * (i, k) of a FloatLayer with the same origin. Commit when done.
 */
export function bloomGrid(p: PieceBuilder, origin: [number, number, number], seed = 1): VoxelGrid {
  return p.voxels.grid({ cell: TEXEL / 2, origin: [origin[0], origin[1] + (TEXEL * 3) / 4, origin[2]], mat: 'petal', jitter: 0.04, ao: 0.2, seed });
}

/**
 * Lotus layers (top views, bottom to top) in half-texel cells: o outer petal,
 * t its pink tip, m mid petal, p inner cup, P deep pink tip, y seed pod. Open
 * and low like the sheet's blooms — a wide star of pale petals, a paler ring
 * opening out, a small cup round the pod — pink only at the tips.
 */
const LOTUS: Record<7 | 9, string[][]> = {
  9: [
    ['...t.t...', '.t.ooo.t.', '..ooooo..', 'tooooooot', '.ooooooo.', 'tooooooot', '..ooooo..', '.t.ooo.t.', '...t.t...'],
    ['.........', '..m...m..', '...mmm...', '.mmmmmmm.', '..mmymm..', '.mmmmmmm.', '...mmm...', '..m...m..', '.........'],
    ['.........', '.........', '...p.p...', '..ppppp..', '...pyp...', '..ppppp..', '...p.p...', '.........', '.........'],
    ['.........', '.........', '.........', '...P.P...', '.........', '...P.P...', '.........', '.........', '.........'],
  ],
  7: [
    ['..t.t..', '.ooooo.', 'tooooot', '.ooooo.', 'tooooot', '.ooooo.', '..t.t..'],
    ['.......', '.m...m.', '..mmm..', '.mmymm.', '..mmm..', '.m...m.', '.......'],
    ['.......', '.......', '..p.p..', '...y...', '..p.p..', '.......', '.......'],
  ],
};

const LOTUS_TONES: Record<string, readonly number[]> = {
  o: POND.lotus.outer,
  t: POND.lotus.tip,
  m: POND.lotus.mid,
  p: POND.lotus.inner,
  P: POND.lotus.deep,
  y: POND.lotus.pod,
};

/** Put a top-view pattern (rows = k, columns = i) into a grid, centred on (ci, ck), turned by quarter turns. */
function stamp(g: VoxelGrid, rows: string[], ci: number, j: number, ck: number, turn: number, tone: (ch: string, i: number, k: number) => number): void {
  const n = rows.length;
  const h = (n - 1) / 2;
  for (let a = 0; a < n; a++)
    for (let b = 0; b < n; b++) {
      const ch = rows[b][a];
      if (ch === '.') continue;
      let [u, v] = [a - h, b - h];
      for (let q = 0; q < (turn & 3); q++) [u, v] = [-v, u];
      g.set(ci + u, j, ck + v, tone(ch, ci + u, ck + v));
    }
}

/** A stalk of one cell from the pads up to row `h` − 1, stepping sideways once for a natural bend. */
function stalk(g: VoxelGrid, ci: number, ck: number, h: number, r: Rng): [number, number] {
  let [i, k] = [ci, ck];
  const bend = h > 4 && r.chance(0.6) ? r.int(2, h - 2) : -1;
  const [di, dk] = r.pick([[1, 0], [-1, 0], [0, 1], [0, -1]] as const);
  for (let j = 0; j < h; j++) {
    if (j === bend) {
      g.set(i, j, k, r.pick(POND.stalk), 'leaves');
      i += di;
      k += dk;
    }
    g.set(i, j, k, r.pick(POND.stalk), 'leaves');
  }
  return [i, k];
}

/**
 * An open lotus in a bloom grid, rising from (ci, ck) on a stalk `h` cells tall
 * (0: resting on its pads, as the sheet draws them): `size` 9 (0.28 m) or
 * 7 (0.22 m) half-texel cells across.
 */
export function lotusFlower(g: VoxelGrid, ci: number, ck: number, o: { h?: number; size?: 7 | 9; seed?: number } = {}): void {
  const seed = o.seed ?? 1;
  const r = rng(seed);
  const h = o.h ?? 0;
  const [i, k] = stalk(g, ci, ck, h, r);
  const turn = r.int(0, 3);
  LOTUS[o.size ?? 9].forEach((rows, l) => stamp(g, rows, i, h + l, k, turn, (ch, x, z) => pick(LOTUS_TONES[ch], x, l, z, seed)));
}

/** A closed lotus bud on a stalk `h` half-texel cells tall: green sepals, a deep pink body, a pale tip. */
export function lotusBud(g: VoxelGrid, ci: number, ck: number, o: { h: number; seed?: number }): void {
  const seed = o.seed ?? 1;
  const r = rng(seed);
  const [i, k] = stalk(g, ci, ck, o.h, r);
  const plus = ['.x.', 'xxx', '.x.'];
  const full = ['xxx', 'xxx', 'xxx'];
  const dot = ['...', '.x.', '...'];
  const layers: [string[], readonly number[]][] = [
    [plus, POND.stalk],
    [full, POND.bud],
    [full, POND.bud],
    [plus, POND.bud],
    [dot, POND.budTip],
    [dot, POND.budTip],
  ];
  layers.forEach(([rows, tones], l) => stamp(g, rows, i, o.h + l, k, 0, (_, x, z) => pick(tones, x, l, z, seed)));
}

// ── A whole planted surface ──────────────────────────────────────────────────

export interface PondFloraOptions {
  /** Height of the water surface. */
  top: number;
  /** Area to plant (metres). */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Open water in the area (default all of it); cells outside it are dropped. */
  inside?: (x: number, z: number) => boolean;
  seed: number;
  /** Lily-pad clusters (overlapping pads). */
  clusters: number;
  /** Loose single pads between them. */
  pads?: number;
  /** Open lotus flowers, each resting on one of the clusters. */
  flowers?: number;
  /** Buds on stalks, each over a pad of its own. */
  buds?: number;
  /** Dry leaves floating on the water. */
  leaves?: number;
  /** Size of the pads and clusters (default 1: pads 0.25–0.43 m; a small basin wants less). */
  scale?: number;
}

/**
 * Plant a water surface: pad clusters spread over the open water (keeping off
 * the banks), a lotus resting on each of the first ones, loose single pads,
 * buds on 0.12–0.25 m stalks over pads of their own (flowers and buds keep to
 * the middle half of the water), dry leaves drifting in between.
 */
export function pondFlora(p: PieceBuilder, o: PondFloraOptions): void {
  const r = rng(o.seed * 31 + 7);
  const inside = o.inside ?? (() => true);
  const origin: [number, number, number] = [Math.floor(o.x0 / TEXEL) * TEXEL, o.top, Math.floor(o.z0 / TEXEL) * TEXEL];
  const pads = new FloatLayer(origin);
  const blooms = bloomGrid(p, origin, o.seed);
  const keep = (i: number, k: number) => inside(...pads.at(i, k));
  const open = (x: number, z: number, m: number) => inside(x, z) && inside(x - m, z) && inside(x + m, z) && inside(x, z - m) && inside(x, z + m);
  // Spread the centres out: the best of a few random candidates, farthest from the others.
  const centres: [number, number][] = [];
  const place = (margin: number, middle = false): [number, number] | null => {
    // Flowers keep to the middle half of the water, where the banks don't hide them (and tiny ponds get what room there is).
    const m = Math.min(margin, (o.x1 - o.x0) / 4, (o.z1 - o.z0) / 4);
    const mx = middle ? Math.max(m, (o.x1 - o.x0) / 4) : m;
    const mz = middle ? Math.max(m, (o.z1 - o.z0) / 4) : m;
    let best: [number, number] | null = null;
    let bestD = -1;
    for (let t = 0; t < 24; t++) {
      const x = r.range(o.x0 + mx, o.x1 - mx);
      const z = r.range(o.z0 + mz, o.z1 - mz);
      if (!open(x, z, m)) continue;
      const d = Math.min(9, ...centres.map(([cx, cz]) => Math.hypot(cx - x, cz - z)));
      if (d > bestD) [best, bestD] = [[x, z], d];
    }
    if (best) centres.push(best);
    return best;
  };
  const cell = (x: number, z: number): [number, number] => [(x - origin[0]) / TEXEL, (z - origin[2]) / TEXEL];
  const size = o.scale ?? 1;
  const pad = (ci: number, ck: number, rad: number) =>
    lilyPad(pads, ci, ck, Math.max(1.4, rad * size), r() * Math.PI * 2, r.pick(POND.pad), { keep, yellow: r.chance(0.35) ? r.range(0.2, 0.45) : 0 });
  const flowers = o.flowers ?? 0;
  for (let c = 0; c < o.clusters; c++) {
    const at = place(0.25, c < flowers);
    if (!at) continue;
    const [ci, ck] = cell(...at);
    // A ring of pads around a big one; the flower rests on the big one.
    const main = r.range(2.6, 3.4);
    const n = r.int(2, 4);
    const a0 = r() * Math.PI * 2;
    for (let q = 0; q < n; q++) {
      const rad = r.range(2, 3);
      const a = a0 + (q / n) * Math.PI * 2 + r.range(-0.4, 0.4);
      const d = (main + rad * r.range(0.35, 0.8)) * size;
      pad(ci + Math.cos(a) * d, ck + Math.sin(a) * d, rad);
    }
    pad(ci, ck, main);
    if (c < flowers) lotusFlower(blooms, Math.round(ci * 2), Math.round(ck * 2), { h: r.int(0, 1), size: c % 2 ? 7 : 9, seed: o.seed * 17 + c });
  }
  for (let s = 0; s < (o.pads ?? 0); s++) {
    const at = place(0.12);
    if (at) pad(...cell(...at), r.range(1.6, 2.4));
  }
  for (let b = 0; b < (o.buds ?? 0); b++) {
    const at = place(0.15, true);
    if (!at) continue;
    const [ci, ck] = cell(...at);
    pad(ci, ck, r.range(1.8, 2.4));
    lotusBud(blooms, Math.round(ci * 2), Math.round(ck * 2), { h: r.int(4, 8), seed: o.seed * 23 + b });
  }
  for (let l = 0; l < (o.leaves ?? 0); l++) {
    const x = r.range(o.x0, o.x1);
    const z = r.range(o.z0, o.z1);
    if (!open(x, z, 0.1)) continue;
    const [ci, ck] = cell(x, z);
    floatingLeaf(pads, Math.floor(ci), Math.floor(ck), o.seed * 41 + l, keep);
  }
  pads.commit(p.voxels);
  blooms.commit();
}
