import { BlockSet } from '../../BlockSet';
import { fromSheet } from '../../palette';
import type { PieceBuilder } from '../../PieceBuilder';
import { here, rng, snap, TEXEL, tone, type Rng } from '../../shapes';
import { barkSurf, leafSurf, stoneSurf } from '../../surface';
import type { VoxelMaterialKey } from '../../../voxel/materials';
import { hash3 } from '../../../voxel/random';
import type { Surf, VoxelBuilder } from '../../../voxel/VoxelBuilder';

/**
 * Parts of the §18.1 ① large tree — an Angkor strangler fig / banyan like the
 * giants of Ta Prohm. A seeded plan decides the layout (trunk flutes, buttress
 * roots, limbs, canopy clumps, vines, the sandstone blocks at its feet); the
 * builders below turn it into voxels:
 *
 *  - the stones: the ruin the tree grew over — a wall stump across the front
 *    root, piles gripped by the side roots, rubble between the buttresses;
 *  - bark on a 0.25 m grid: the fluted trunk, its limbs and the buttress roots,
 *    stair-stepped fins that follow the ground *and the stones*, so they arch
 *    over the blocks and hang down their faces, moss on their tops;
 *  - the canopy on a 0.5 m grid: a dome of rounded leaf clumps with drooping
 *    lobes at the rim, each clump lit from its own top (bright yellow-green
 *    crowns, mid-green flanks, teal undersides) around a dark core;
 *  - vines as thin free boxes hanging from the limbs and lobes.
 */

/** Height the plan is drawn for (m); other heights scale it by s = H / REF_H. */
export const REF_H = 22;
/** Bark cell: four texels — fine enough for the explorer standing at the roots. */
const BARK = 0.25;
/** Canopy cell: the sheet's leaf block, eight texels. */
const LEAF = 0.5;

type Vec3 = [number, number, number];

/** A flute of the trunk; the strong ones flare into buttress roots at the base. */
interface Ridge {
  theta: number;
  amp: number;
  sigma: number;
  /** Extra swelling towards the ground (× amp at y = 0). */
  flare: number;
}
/** A root as a strip of samples (metres; h = height above the ground or stone under it). */
interface Stroke {
  pts: { x: number; z: number; h: number; w: number }[];
}
/**
 * A leaf cushion (the sheet's clump): the centre of its rim, footprint radii,
 * the dome's height above the rim and the skirt hanging below it.
 */
interface Clump {
  c: Vec3;
  rx: number;
  rz: number;
  top: number;
  skirt: number;
}
/** The canopy's dark heart: an ellipsoid of shaded leaves behind the cushions. */
interface Core {
  c: Vec3;
  r: Vec3;
}
interface Limb {
  a: Vec3;
  m: Vec3;
  b: Vec3;
  r0: number;
  r1: number;
}
interface VinePlan {
  x: number;
  y: number;
  z: number;
  len: number;
}
interface StoneBlock {
  min: Vec3;
  max: Vec3;
  /** Palette: 0 warm pinkish tan, 1 grey (the sheet's left and right piles). */
  pal: number;
}

export interface TreePlan {
  seed: number;
  H: number;
  s: number;
  trunkR: number;
  forkY: number;
  /** Slow spiral of the flutes (rad / m). */
  twist: number;
  lean: [number, number];
  wobble: [number, number];
  ridges: Ridge[];
  roots: Stroke[];
  clumps: Clump[];
  core: Core;
  limbs: Limb[];
  vines: VinePlan[];
  stones: StoneBlock[];
}

// ── Colours (sampled off the sheet's card, see fromSheet) ─────────────────────
/** Canopy: sunlit clump tops, flanks, lower flanks, undersides, the dark heart. */
const LEAF_TOP = [0xaab83e, 0x9cad3a, 0xb6bf45, 0x8fa53a].map(fromSheet);
const LEAF_MID = [0x6f8f3e, 0x638a44, 0x5a8046, 0x76913c].map(fromSheet);
const LEAF_LOW = [0x4a7248, 0x41694a, 0x3d6448, 0x507548].map(fromSheet);
const LEAF_UNDER = [0x355a47, 0x2f5242, 0x2a4c3e].map(fromSheet);
const LEAF_CORE = [0x233d31, 0x1f372c, 0x28443a].map(fromSheet);
/** Trunk: sunlit ridges, mid bark, the grooves between the flutes. */
const BARK_RIDGE = [0xb98253, 0xab7a4f, 0xb88a5e].map(fromSheet);
const BARK_MID = [0x7d5d45, 0x735643, 0x86644a].map(fromSheet);
const BARK_GROOVE = [0x5a463c, 0x4e3d35, 0x604a3e].map(fromSheet);
/** Roots: the trunk's warm brown, a shade paler where they have crept into the sun. */
const ROOT = [0xb5804f, 0xa87548, 0xbd8a57, 0x9d6d45].map(fromSheet);
/** Sandstone blocks at the tree's foot: warm pinkish tan (left pile), grey (right stack). */
const STONE_WARM = [0xe2c9a8, 0xd6bb9a, 0xcfb296, 0xe6d0b0].map(fromSheet);
const STONE_GREY = [0xb4a69c, 0xa89990, 0xbcafa4, 0x9f9088].map(fromSheet);
/** Bright moss cushions on the roots and between the stones. */
const MOSS = [0x8fb040, 0x7fa83a, 0x6f9a36, 0x9cbc48].map(fromSheet);
/** Hanging vines: olive stems, yellow-green leaves. */
const VINE_STEM = [0x7d8a32, 0x6a7a2e, 0x8b8b30].map(fromSheet);
const VINE_LEAF = [0x9aa83a, 0x86a03a, 0x6f9038, 0xa9b43e].map(fromSheet);

const TAU = Math.PI * 2;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const adiff = (a: number, b: number) => {
  const d = a - b;
  return d - Math.round(d / TAU) * TAU;
};
/** A colour scaled by k, a touch warmer (red kept up). */
const darker = (c: number, k: number) => (Math.round(((c >> 16) & 255) * Math.min(1, k + 0.05)) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * (k - 0.04));

/**
 * valueNoise3 without its per-call closure and helper calls: the same lattice
 * and arithmetic, so the same values bit for bit. A tree samples it ~8k times,
 * and in a cold build those calls were a fifth of the time.
 */
function noise3(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  let tx = x - xi;
  let ty = y - yi;
  let tz = z - zi;
  tx = tx * tx * (3 - 2 * tx);
  ty = ty * ty * (3 - 2 * ty);
  tz = tz * tz * (3 - 2 * tz);
  const a = hash3(xi, yi, zi, seed);
  const b = hash3(xi + 1, yi, zi, seed);
  const c = hash3(xi, yi + 1, zi, seed);
  const d = hash3(xi + 1, yi + 1, zi, seed);
  const e = hash3(xi, yi, zi + 1, seed);
  const f = hash3(xi + 1, yi, zi + 1, seed);
  const g = hash3(xi, yi + 1, zi + 1, seed);
  const h = hash3(xi + 1, yi + 1, zi + 1, seed);
  const x00 = a + (b - a) * tx;
  const x10 = c + (d - c) * tx;
  const y0 = x00 + (x10 - x00) * ty;
  const x01 = e + (f - e) * tx;
  const x11 = g + (h - g) * tx;
  const y1 = x01 + (x11 - x01) * ty;
  return y0 + (y1 - y0) * tz;
}

// ── Dense cell block ──────────────────────────────────────────────────────────

/** Neighbour offsets and weights of the kit grid's ambient occlusion (VoxelGrid.commit). */
const AO_D: Vec3[] = [];
const AO_W: number[] = [];
for (let dx = -1; dx <= 1; dx++)
  for (let dy = -1; dy <= 1; dy++)
    for (let dz = -1; dz <= 1; dz++) {
      const n = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
      if (!n) continue;
      AO_D.push([dx, dy, dz]);
      AO_W.push(n === 1 ? 1 : n === 2 ? 0.6 : 0.35);
    }
const AO_TOTAL = AO_W.reduce((a, w) => a + w, 0);

/**
 * A dense block of cells for the tree's two big grids. It emits what a kit
 * VoxelGrid would — hidden cells culled, the same baked AO, jitter and open
 * faces — but from typed arrays: the grid keys cells by doubles in a Map, and
 * baking a 22 m tree's AO takes ~300k lookups, which alone blew the budget.
 * Each column also keeps its lowest and highest cell, so the passes over the
 * block only visit the layers that hold something — most of it is air.
 */
class Dense {
  /** Min cell index, less a one-cell empty pad (so neighbours never leave the arrays). */
  readonly li: number;
  readonly lj: number;
  readonly lk: number;
  /** Size in cells, pads included. */
  readonly ni: number;
  readonly nj: number;
  readonly nk: number;
  /** Flat-index steps of +1 in i and in j (+1 in k is 1). */
  readonly sI: number;
  readonly sJ: number;
  /** 0 empty · 1 solid, not drawn (buried, or filled by another part) · 2 drawn. */
  readonly occ: Uint8Array;
  private readonly color: Uint32Array;
  private readonly look: Uint8Array;
  /** Lowest and highest occupied layer of each column (i-major); low > high when empty. */
  private readonly low: Int16Array;
  private readonly high: Int16Array;
  private readonly looks: { mat: VoxelMaterialKey; surf?: Surf }[] = [];
  private readonly lookIds = new Map<string, number>();

  constructor(
    readonly cell: number,
    lo: Vec3,
    hi: Vec3,
  ) {
    this.li = lo[0] - 1;
    this.lj = lo[1] - 1;
    this.lk = lo[2] - 1;
    this.ni = hi[0] - lo[0] + 3;
    this.nj = hi[1] - lo[1] + 3;
    this.nk = hi[2] - lo[2] + 3;
    this.sJ = this.nk;
    this.sI = this.nj * this.nk;
    const n = this.ni * this.sI;
    this.occ = new Uint8Array(n);
    this.color = new Uint32Array(n);
    this.look = new Uint8Array(n);
    this.low = new Int16Array(this.ni * this.nk).fill(0x7fff);
    this.high = new Int16Array(this.ni * this.nk).fill(-1);
  }

  /** Flat index of a cell, −1 outside the block. */
  at(i: number, j: number, k: number): number {
    const a = i - this.li;
    const b = j - this.lj;
    const c = k - this.lk;
    if (a < 1 || b < 1 || c < 1 || a >= this.ni - 1 || b >= this.nj - 1 || c >= this.nk - 1) return -1;
    return a * this.sI + b * this.sJ + c;
  }

  has(i: number, j: number, k: number): boolean {
    const n = this.at(i, j, k);
    return n >= 0 && this.occ[n] > 0;
  }

  /** Occupy cell n (1 solid only, 2 drawn), widening its column's span. */
  fill(n: number, state: number): void {
    this.occ[n] = state;
    const a = (n / this.sI) | 0;
    const r = n - a * this.sI;
    const b = (r / this.sJ) | 0;
    const col = a * this.nk + r - b * this.sJ;
    if (b < this.low[col]) this.low[col] = b;
    if (b > this.high[col]) this.high[col] = b;
  }

  /** A drawn cell. */
  set(i: number, j: number, k: number, color: number, look: number): void {
    const n = this.at(i, j, k);
    if (n < 0) return;
    this.fill(n, 2);
    this.color[n] = color;
    this.look[n] = look;
  }

  /** Draw a cell that is already occupied (flat index). */
  paint(n: number, color: number, look: number): void {
    this.occ[n] = 2;
    this.color[n] = color;
    this.look[n] = look;
  }

  /** A solid cell that is never drawn: it only occludes. */
  ghost(i: number, j: number, k: number): void {
    const n = this.at(i, j, k);
    if (n >= 0 && !this.occ[n]) this.fill(n, 1);
  }

  /** Ghosts along k from k0 to k1 (a buried run, e.g. across the trunk's heart). */
  ghostRun(i: number, j: number, k0: number, k1: number): void {
    const a = i - this.li;
    const b = j - this.lj;
    if (a < 1 || b < 1 || a >= this.ni - 1 || b >= this.nj - 1) return;
    const base = a * this.sI + b * this.sJ;
    for (let c = Math.max(1, k0 - this.lk); c <= Math.min(this.nk - 2, k1 - this.lk); c++) {
      if (this.occ[base + c]) continue;
      this.occ[base + c] = 1;
      const col = a * this.nk + c;
      if (b < this.low[col]) this.low[col] = b;
      if (b > this.high[col]) this.high[col] = b;
    }
  }

  /** The pad under layer j = 0 is ground: faces on it are never seen (nor emitted). */
  ground(): void {
    for (let a = 0; a < this.ni; a++) this.occ.fill(1, a * this.sI, a * this.sI + this.nk);
  }

  /**
   * Is cell n tucked into a concave edge or corner — enclosed, but with an
   * empty cell across one of its edges or corners? The rounded cells meeting
   * there leave a groove that looks straight at it, so it must be drawn
   * (dark), or the background shows through the groove as a bright hairline.
   */
  creased(n: number): boolean {
    const { occ, sI, sJ } = this;
    return (
      !occ[n + sI + sJ] || !occ[n + sI - sJ] || !occ[n - sI + sJ] || !occ[n - sI - sJ] || !occ[n + sI + 1] || !occ[n + sI - 1] || !occ[n - sI + 1] || !occ[n - sI - 1] || !occ[n + sJ + 1] || !occ[n + sJ - 1] || !occ[n - sJ + 1] || !occ[n - sJ - 1] ||
      !occ[n + sI + sJ + 1] || !occ[n + sI + sJ - 1] || !occ[n + sI - sJ + 1] || !occ[n + sI - sJ - 1] || !occ[n - sI + sJ + 1] || !occ[n - sI + sJ - 1] || !occ[n - sI - sJ + 1] || !occ[n - sI - sJ - 1]
    );
  }

  /**
   * Close the slits between cells that touch only along an edge (both other
   * cells round that edge empty): the rounded bevels leave a hairline hole
   * there, and on thin roots it lets the background through as white lines.
   * The cell under the upper one is filled (for vertical edges, either).
   */
  closeSlits(): void {
    const { occ, sI, sJ, ni, nj, nk, low, high } = this;
    for (let a = 1; a < ni - 2; a++)
      for (let c = 1; c < nk - 2; c++) {
        // Only the layers where the four columns round this corner hold cells.
        const col = a * nk + c;
        const b0 = Math.max(1, Math.min(low[col], low[col + 1], low[col + nk], low[col + nk + 1]) - 1);
        const b1 = Math.min(nj - 3, Math.max(high[col], high[col + 1], high[col + nk], high[col + nk + 1]));
        for (let b = b0; b <= b1; b++) {
          const n = a * sI + b * sJ + c;
          // A vertical edge (square in the ground plane), then horizontal ones
          // along z and along x (squares standing up).
          if (occ[n] && occ[n + sI + 1] && !occ[n + sI] && !occ[n + 1]) this.bridge(n + 1, n + sI + 1, n);
          else if (occ[n + sI] && occ[n + 1] && !occ[n] && !occ[n + sI + 1]) this.bridge(n + sI + 1, n + 1, n + sI);
          if (occ[n] && occ[n + sI + sJ] && !occ[n + sI] && !occ[n + sJ]) this.bridge(n + sI, n + sI + sJ, n);
          else if (occ[n + sI] && occ[n + sJ] && !occ[n] && !occ[n + sI + sJ]) this.bridge(n, n + sJ, n + sI);
          if (occ[n] && occ[n + 1 + sJ] && !occ[n + 1] && !occ[n + sJ]) this.bridge(n + 1, n + 1 + sJ, n);
          else if (occ[n + 1] && occ[n + sJ] && !occ[n] && !occ[n + 1 + sJ]) this.bridge(n, n + sJ, n + 1);
        }
      }
  }

  /** Fill cell `to` like `from` — or like `alt` when only that one is drawn (two ghosts: nothing to see). */
  private bridge(to: number, from: number, alt: number): void {
    if (this.occ[from] !== 2 && this.occ[alt] !== 2) return;
    const src = this.occ[from] === 2 ? from : alt;
    this.fill(to, 2);
    this.color[to] = this.color[src];
    this.look[to] = this.look[src];
  }

  /** Id of a family + pattern amounts pair (≤ 256 per block). */
  lookOf(mat: VoxelMaterialKey, surf?: Surf): number {
    const k = `${mat}|${surf?.join(',') ?? ''}`;
    let id = this.lookIds.get(k);
    if (id === undefined) {
      id = this.looks.length;
      this.looks.push({ mat, surf });
      this.lookIds.set(k, id);
    }
    return id;
  }

  /**
   * Emit the visible cells as boxes, shaded like VoxelGrid.commit — those
   * with an open face, and the enclosed ones behind concave edges (see
   * creased). With `merge`, a column of cells of one colour whose sides face
   * the same way becomes one tall box — bark then reads as the sheet's long
   * vertical planks, joints only where the tone changes (and it saves blocks).
   */
  commit(bld: VoxelBuilder, o: { jitter: number; ao: number; seed: number; merge?: boolean }): void {
    const src = here();
    const { occ, color, look, looks, sI, sJ, ni, nk, low, high, li, lj, lk, cell: s } = this;
    const offs = AO_D.map((d) => d[0] * sI + d[1] * sJ + d[2]);
    const box = (a: number, c: number, b0: number, b1: number, n: number, open: number, shade: number) => {
      const lo = looks[look[n]];
      const h = (b1 - b0 + 1) * s;
      bld.box((a + li + 0.5) * s, (b0 + lj) * s + h / 2, (c + lk + 0.5) * s, s, h, s, color[n], lo.mat, { shade, open, surf: lo.surf, src });
    };
    for (let a = 1; a < ni - 1; a++)
      for (let c = 1; c < nk - 1; c++) {
        const col = a * nk + c;
        const top = high[col];
        // The run being merged (r0 < 0: none): first / last layer, first cell,
        // open faces, summed shade.
        let r0 = -1;
        let r1 = -1;
        let rn = 0;
        let ropen = 0;
        let rshade = 0;
        for (let b = low[col]; b <= top; b++) {
          const n = a * sI + b * sJ + c;
          const open = occ[n] !== 2 ? 0 : (occ[n + sI] ? 0 : 1) | (occ[n - sI] ? 0 : 2) | (occ[n + sJ] ? 0 : 4) | (occ[n - sJ] ? 0 : 8) | (occ[n + 1] ? 0 : 16) | (occ[n - 1] ? 0 : 32);
          if (!open && (occ[n] !== 2 || !this.creased(n))) {
            if (r0 >= 0) box(a, c, r0, r1, rn, ropen, rshade / (r1 - r0 + 1));
            r0 = -1;
            continue;
          }
          let shade = 1;
          if (o.ao > 0) {
            let free = 0;
            for (let q = 0; q < 26; q++) if (!occ[n + offs[q]]) free += AO_W[q];
            shade *= 1 + o.ao * Math.max(-0.7, Math.min(0.45, (free / AO_TOTAL - 0.305) * 2.0));
            if (occ[n + sJ] && !occ[n + 1] && occ[n + sJ + 1]) shade *= 1 - o.ao * 0.35;
          }
          shade *= 1 + (hash3(a + li, b + lj, c + lk, o.seed) - 0.5) * 2 * o.jitter;
          // Same colour and look, sides facing the same way: extend the run upwards.
          if (o.merge && r0 >= 0 && r1 === b - 1 && (ropen & ~12) === (open & ~12) && color[rn] === color[n] && look[rn] === look[n]) {
            r1 = b;
            ropen = (ropen & ~4) | (open & 4);
            rshade += shade;
            continue;
          }
          if (r0 >= 0) box(a, c, r0, r1, rn, ropen, rshade / (r1 - r0 + 1));
          r0 = r1 = b;
          rn = n;
          ropen = open;
          rshade = shade;
        }
        if (r0 >= 0) box(a, c, r0, r1, rn, ropen, rshade / (r1 - r0 + 1));
      }
  }
}

// ── Plan ──────────────────────────────────────────────────────────────────────

/** Trunk centre (x, z) at height y: a slight lean and a lazy wobble. */
function axisAt(t: TreePlan, y: number): [number, number] {
  const w = (y: number, i: number) => 0.14 * t.s * Math.sin((y / t.s) * (i ? 0.37 : 0.45) + t.wobble[i]);
  return [t.lean[0] * y + w(y, 0) - w(0, 0), t.lean[1] * y + w(y, 1) - w(0, 1)];
}

/** Radius of the trunk's core (without flutes): a flared foot, a swelling at the fork. */
function coreRadius(t: TreePlan, y: number): number {
  return t.trunkR * (1 + 0.5 * Math.exp(-y / (2.2 * t.s)) + 0.14 * smooth(t.forkY - 2.5 * t.s, t.forkY + 0.5 * t.s, y));
}

/** Angular samples per trunk ring (the radius is tabulated once per ring). */
const RING = 192;
const ringIndex = (theta: number) => Math.min(RING - 1, Math.floor(((theta + Math.PI) / TAU) * RING));
/** The ring's lumpiness is sampled every 4th angle and every metre (it is smooth) and interpolated. */
const LUMPS = RING / 4;
const LUMP_AT: [number, number][] = [];
for (let q = 0; q < LUMPS; q++) {
  const theta = ((q + 0.5) / LUMPS) * TAU - Math.PI;
  LUMP_AT.push([Math.cos(theta) * 2.2 + 9, Math.sin(theta) * 2.2]);
}
/** Fine angular samples of the flute profiles (4 per ring sample). */
const FINE = RING * 4;

/**
 * The trunk's rings. Every flute turns with the same twist and swells towards
 * the ground as amp · (1 + flare · e^(−y / 1.5 s)), so a ring is two fixed
 * profiles round the trunk — A (the flutes) + e(y) · B (their flare) — turned
 * by twist · y: they are summed once, each flute only ±3σ round its crest.
 */
class Rings {
  private readonly A = new Float32Array(FINE);
  private readonly B = new Float32Array(FINE);
  private readonly lumps: Float32Array[] = [];

  constructor(private readonly t: TreePlan) {
    for (const g of t.ridges) {
      const reach = Math.ceil(((3 * g.sigma) / TAU) * FINE);
      const mid = Math.floor(((adiff(g.theta, 0) + Math.PI) / TAU) * FINE);
      for (let q = -reach; q <= reach; q++) {
        const a = (mid + q + FINE) % FINE;
        const d = adiff(((a + 0.5) / FINE) * TAU - Math.PI, g.theta);
        const e = g.amp * Math.exp(-(d * d) / (g.sigma * g.sigma));
        this.A[a] += e;
        this.B[a] += e * g.flare;
      }
    }
  }

  /** The lumpiness round the trunk at metre m (lazily). */
  private lumpsAt(m: number): Float32Array {
    const { t } = this;
    return (this.lumps[m] ??= Float32Array.from(LUMP_AT, ([x, z]) => (noise3(x, m * 0.4, z, t.seed) - 0.5) * 0.3 * t.s));
  }

  /** Radius and flute strength per angle (see ringIndex) at height y, into the given arrays. */
  at(y: number, radius: Float32Array, flute: Float32Array): void {
    const { t, A, B } = this;
    const e = Math.exp(-y / (1.5 * t.s));
    const turn = ((t.twist * y) / TAU) * FINE;
    const my = y / t.s;
    const m = Math.floor(my);
    const wy = my - m;
    const l0 = this.lumpsAt(m);
    const l1 = this.lumpsAt(m + 1);
    const core = coreRadius(t, y);
    for (let a = 0; a < RING; a++) {
      const f = (a + 0.5) * 4 - 0.5 - turn;
      const q = Math.floor(f);
      const w = f - q;
      const f0 = ((q % FINE) + FINE) % FINE;
      const f1 = f0 + 1 === FINE ? 0 : f0 + 1;
      flute[a] = (A[f0] + e * B[f0]) * (1 - w) + (A[f1] + e * B[f1]) * w;
      const g = ((a + 0.5) / RING) * LUMPS - 0.5;
      const p = Math.floor(g);
      const u = g - p;
      const p0 = (p + LUMPS) % LUMPS;
      const p1 = (p + 1) % LUMPS;
      radius[a] = core + flute[a] + (l0[p0] * (1 - u) + l0[p1] * u) * (1 - wy) + (l1[p0] * (1 - u) + l1[p1] * u) * wy;
    }
  }
}

type Blocks = [number, number, number, number, number, number][];
/** Small rubble piles for the gaps between roots (u across, v outwards, y up; metres). */
const RUBBLE: Blocks[] = [
  [[-0.5, 0.5, -0.25, 0.25, 0, 0.5]],
  [
    [-1.0, 0.0, -0.25, 0.25, 0, 0.5],
    [0.0, 0.75, -0.25, 0.25, 0, 0.5],
  ],
  [
    [-0.75, 0.25, -0.25, 0.5, 0, 0.5],
    [0.25, 1.0, -0.25, 0.25, 0, 0.5],
    [-0.5, 0.5, -0.25, 0.25, 0.5, 1.0],
  ],
  [[-0.75, 0.75, -0.25, 0.25, 0, 0.5]],
  [
    [-0.5, 0.5, -0.25, 0.25, 0, 0.25],
    [0.5, 1.0, -0.25, 0.25, 0, 0.5],
  ],
];
/**
 * The stump of a wall the tree grew over: courses of metre-long blocks in
 * running bond, three high in the middle, broken down towards the ends, one
 * block fallen off in front. The hero root arches over it at u = 0.
 */
const WALL: Blocks = [
  [-2.5, -1.5, -0.25, 0.5, 0, 0.5],
  [-1.5, -0.5, -0.25, 0.5, 0, 0.5],
  [-0.5, 0.5, -0.25, 0.5, 0, 0.5],
  [0.5, 1.5, -0.25, 0.5, 0, 0.5],
  [1.5, 2.25, -0.25, 0.5, 0, 0.5],
  [-2.0, -1.0, -0.25, 0.5, 0.5, 1.0],
  [-1.0, 0.0, -0.25, 0.5, 0.5, 1.0],
  [0.0, 1.0, -0.25, 0.5, 0.5, 1.0],
  [1.0, 1.75, -0.25, 0.25, 0.5, 1.0],
  [-1.5, -0.5, -0.25, 0.5, 1.0, 1.5],
  [-0.5, 0.5, -0.25, 0.5, 1.0, 1.5],
  [1.25, 2.25, 0.75, 1.25, 0, 0.5],
];
/** The sheet's left pile: two courses, a block of a third on top at times. */
const LEFT_PILE: Blocks = [
  [-1.5, -0.5, -0.5, 0.25, 0, 0.5],
  [-0.5, 0.5, -0.5, 0.25, 0, 0.5],
  [0.5, 1.5, -0.5, 0.25, 0, 0.5],
  [-1.25, -0.25, 0.25, 1.0, 0, 0.5],
  [-0.25, 0.75, 0.25, 1.0, 0, 0.5],
  [-1.0, 0.0, -0.5, 0.25, 0.5, 1.0],
  [0.0, 1.0, -0.25, 0.5, 0.5, 1.0],
];
/** The sheet's right stack, crowned by a big block; a low block reaches under the root. */
const RIGHT_STACK: Blocks = [
  [-2.0, -1.0, -0.25, 0.5, 0, 0.5],
  [-1.0, 0.0, -0.5, 0.25, 0, 0.5],
  [0.0, 1.0, -0.5, 0.25, 0, 0.5],
  [-0.75, 0.25, 0.25, 0.75, 0, 0.5],
  [-0.75, 0.25, -0.5, 0.25, 0.5, 1.0],
  [0.25, 1.0, -0.25, 0.25, 0.5, 1.0],
  [-0.75, 0.5, -0.75, 0.25, 1.0, 1.75],
];

/**
 * The sandstone blocks at the tree's feet — the ruin it grew over, as on the
 * sheet: the stump of a wall across the front root, which arches over it and
 * runs on into the soil (this lays that root's tail); a two-course pile on the
 * left and a stack crowned by a big block on the right, each gripped at one
 * end by a root; loose rubble between the other buttresses and blocks under
 * some root tips. Snapped to the bark grid so roots and stones meet on whole cells.
 */
function planStones(r: Rng, s: number, rootAngles: number[], mains: Stroke[]): StoneBlock[] {
  const out: StoneBlock[] = [];
  const q = (v: number) => snap(v, BARK);
  const alongX = (theta: number) => Math.abs(Math.sin(theta)) > Math.abs(Math.cos(theta));
  /**
   * A pile centred on (x, z), laid on whichever axis is closer: v points out
   * along theta, u across it towards larger angles (× flip); `du` shifts it along u.
   */
  const pile = (x: number, z: number, theta: number, pal: number, blocks: Blocks, du = 0, flip = 1) => {
    const ax = alongX(theta);
    const su = (Math.sign(ax ? -Math.sin(theta) : Math.cos(theta)) || 1) * flip;
    const sv = Math.sign(ax ? Math.sin(theta) : Math.cos(theta)) || 1;
    const cx = q(x + (ax ? su * du : 0));
    const cz = q(z + (ax ? 0 : su * du));
    for (const [u0, u1, v0, v1, y0, y1] of blocks) {
      const [a0, a1] = su > 0 ? [u0, u1] : [-u1, -u0];
      const [b0, b1] = sv > 0 ? [v0, v1] : [-v1, -v0];
      if (ax) out.push({ min: [cx + a0, y0, cz + b0], max: [cx + a1, y1, cz + b1], pal });
      else out.push({ min: [cx + b0, y0, cz + a0], max: [cx + b1, y1, cz + a1], pal });
    }
  };
  const polar = (theta: number, rho: number, pal: number, blocks: Blocks) => pile(Math.cos(theta) * rho, Math.sin(theta) * rho, theta, pal, blocks);
  /** Index of the first sample where a root's fin has come down below h metres. */
  const down = (st: Stroke, h: number) => Math.max(5, st.pts.findIndex((p) => p.h < h));
  const nearest = (target: number) => rootAngles.reduce((best, g, n) => (Math.abs(adiff(g, target)) < Math.abs(adiff(rootAngles[best], target)) ? n : best), 0);
  const nr = rootAngles.length;
  // gaps[n] lies between roots n and n + 1.
  const gaps = rootAngles.map((a, n) => a + adiff(rootAngles[(n + 1) % nr], a) / 2);
  const taken = new Set<number>();
  /** A pile on root n where it is h high, reaching into the gap towards `target`: the root crosses it at u = −du. */
  const gripped = (n: number, h: number, target: number, pal: number, blocks: Blocks, du: number) => {
    const pt = mains[n].pts[down(mains[n], h)];
    const dir = adiff(target, rootAngles[n]) >= 0 ? 1 : -1;
    taken.add(dir > 0 ? n : (n + nr - 1) % nr);
    pile(pt.x, pt.z, Math.atan2(pt.z, pt.x), pal, blocks, du, dir);
  };
  // The hero root faces the card's front (3/4) view; the side piles sit at its silhouettes.
  const hero = nearest(Math.PI * 0.29);
  const left = nearest(Math.PI * 0.8);
  const right = nearest(-Math.PI * 0.2);

  // The wall, across the front root where its fin has come down to the
  // ground: the root arches over it, then runs on low and dives into the soil.
  const hs = mains[hero].pts;
  const f = down(mains[hero], 0.8 * s);
  const w = hs[f];
  pile(w.x, w.z, Math.atan2(w.z, w.x), 0, WALL);
  const [dx, dz] = [w.x - hs[f - 5].x, w.z - hs[f - 5].z];
  const dl = Math.hypot(dx, dz);
  const tail = Math.ceil(2.6 / 0.1);
  hs.length = f + 1;
  for (let m = 1; m <= tail; m++) {
    const u = m / tail;
    hs.push({ x: w.x + (dx / dl) * m * 0.1, z: w.z + (dz / dl) * m * 0.1, h: Math.max(0.2, 0.62 * s * (1 - u) ** 0.6), w: Math.max(0.5, w.w * (1 - 0.4 * u)) });
  }
  // The side piles, one end under a root.
  gripped(left, 1.1 * s, Math.PI * 0.8, 0, [...LEFT_PILE, ...((r.chance(0.6) ? [[-0.5, 0.5, -0.25, 0.25, 1.0, 1.5]] : []) as Blocks)], 1);
  gripped(right, 0.85 * s, -Math.PI * 0.2, 1, RIGHT_STACK, 1.25);
  // Rubble between the other buttresses.
  gaps.forEach((g, n) => {
    if (taken.has(n)) return;
    const rho = s * r.range(4.8, 5.8);
    polar(g + r.range(-0.12, 0.12), rho, r.int(0, 1), r.pick(RUBBLE));
    if (r.chance(0.5)) polar(g + r.range(-0.2, 0.2), rho + s * r.range(1.1, 1.6), r.int(0, 1), r.pick([RUBBLE[0], RUBBLE[1], RUBBLE[4]]));
  });
  // Blocks under the other root tips: the roots lie across them.
  rootAngles.forEach((a, n) => {
    if (n !== hero && n !== left && n !== right && r.chance(0.45)) polar(a + r.range(-0.06, 0.06), s * r.range(5.8, 6.6), r.int(0, 1), r.pick([RUBBLE[0], RUBBLE[3]]));
  });
  return out;
}

export function planTree(seed: number, H: number): TreePlan {
  const r = rng(seed);
  const s = H / REF_H;
  const t: TreePlan = {
    seed,
    H,
    s,
    trunkR: 2.05 * s * r.range(0.95, 1.06),
    forkY: 9.4 * s * r.range(0.95, 1.05),
    twist: r.range(0.012, 0.03) * (r.chance(0.5) ? 1 : -1),
    lean: [r.range(-0.02, 0.02), r.range(-0.02, 0.02)],
    wobble: [r.range(0, TAU), r.range(0, TAU)],
    ridges: [],
    roots: [],
    clumps: [],
    core: { c: [0, 0, 0], r: [1, 1, 1] },
    limbs: [],
    vines: [],
    stones: [],
  };

  // Flutes: one strong ridge per buttress root, weaker ones between them.
  const nRoots = r.int(7, 8);
  const theta0 = (Math.PI * 3) / 4 + r.range(-0.15, 0.15);
  const rootAngles: number[] = [];
  for (let n = 0; n < nRoots; n++) rootAngles.push(theta0 + (n * TAU) / nRoots + r.range(-0.16, 0.16));
  for (const theta of rootAngles) {
    t.ridges.push({ theta, amp: t.trunkR * r.range(0.22, 0.3), sigma: r.range(0.2, 0.26), flare: r.range(1.1, 1.6) });
    // Two lesser flutes in each gap: the trunk looks like fused stems.
    for (const f of [0.36, 0.66]) t.ridges.push({ theta: theta + (f * TAU) / nRoots + r.range(-0.08, 0.08), amp: t.trunkR * r.range(0.1, 0.16), sigma: r.range(0.12, 0.16), flare: 0.5 });
  }

  // Buttress roots: tall fins at the trunk stepping down in a long slope to
  // low surface roots that dive into the ground ~5 m out; some fork.
  const rb = coreRadius(t, 0);
  const mains: Stroke[] = [];
  rootAngles.forEach((theta, n) => {
    const len = s * r.range(5.6, 7.0);
    const h0 = s * r.range(3.4, 4.4);
    const w0 = Math.max(0.5, s * r.range(0.95, 1.25));
    const tip = Math.max(0.25, 0.5 * s);
    const bend = r.range(-0.35, 0.35);
    const prof = (_u: number, rho: number) => {
      const v = clamp01((rho - rb) / (len - rb));
      return { h: Math.max(h0 * (1 - v) ** 1.25, tip * Math.sqrt(1 - v)), w: w0 * (1 - 0.55 * v) };
    };
    const main = stroke(0, 0, theta, t.trunkR * 0.6, len, bend, 0.35, seed * 31 + n, prof);
    t.roots.push(main);
    mains.push(main);
    if (r.chance(0.55)) {
      // A side root forking off halfway.
      const at = main.pts[Math.floor(main.pts.length * r.range(0.4, 0.6))];
      const h1 = Math.min(1.0 * s + 0.1, at.h);
      const w1 = Math.max(0.375, at.w * 0.75);
      const len2 = s * r.range(1.5, 2.5);
      const turn = (r.chance(0.5) ? 1 : -1) * r.range(0.5, 0.85);
      t.roots.push(stroke(at.x, at.z, theta + bend * 0.3 + turn, 0, len2, 0, 0.4, seed * 37 + n, (u) => ({ h: Math.max(0.2, h1 * (1 - u) ** 1.4), w: w1 * (1 - 0.35 * u) })));
    }
  });
  // Thin snaking surface roots between the buttresses.
  const nSurf = r.int(2, 4);
  for (let n = 0; n < nSurf; n++) {
    const theta = rootAngles[r.int(0, nRoots - 1)] + Math.PI / nRoots + r.range(-0.2, 0.2);
    const len = s * r.range(6.0, 7.4);
    const hs = Math.max(0.25, 0.4 * s);
    const ws = Math.max(0.375, 0.45 * s);
    t.roots.push(stroke(0, 0, theta, rb * 0.85, len, r.range(-0.5, 0.5), 0.7, seed * 41 + n, (u) => ({ h: hs * Math.sqrt(Math.max(0, 1 - u ** 3)), w: ws })));
  }

  // Canopy: four tiers of leaf cushions stepping up and in, like the sheet's
  // stacked clumps, set irregularly so dark gaps open between them. The rim
  // tier is sparse, with a gap facing the front as on the sheet, and some of
  // its cushions droop lower. A small dark core keeps the dome from being
  // see-through.
  const R = 9.7 * s * r.range(0.95, 1.04);
  const yb = 11.2 * s * r.range(0.97, 1.03);
  const step = (H - yb - 2.9 * s) / 3;
  const tiers = [
    { n: r.int(5, 6), rho: 0.8, rh: [2.3, 2.8], top: [1.2, 1.5], skirt: [1.3, 1.6] },
    { n: r.int(5, 6), rho: 0.64, rh: [2.8, 3.3], top: [1.2, 1.5], skirt: [1.1, 1.4] },
    { n: 4, rho: 0.46, rh: [2.8, 3.3], top: [1.3, 1.6], skirt: [1.1, 1.4] },
    { n: r.int(1, 2), rho: 0.16, rh: [2.8, 3.2], top: [2.0, 2.4], skirt: [1.2, 1.5] },
  ];
  const tierOf: number[] = [];
  tiers.forEach((tier, ti) => {
    // The rim's first gap faces the front (the sheet's "front view").
    const phase = ti === 0 ? Math.PI * 0.39 + Math.PI / tier.n + r.range(-0.25, 0.25) : r.range(0, TAU);
    for (let n = 0; n < tier.n; n++) {
      const a = phase + ((n + r.range(-0.25, 0.25)) * TAU) / tier.n;
      const rho = tier.rho * R * r.range(0.9, 1.1);
      const droop = ti === 0 && r.chance(0.4) ? s * r.range(0.6, 1.3) : 0;
      const rh = s * r.range(tier.rh[0], tier.rh[1]);
      t.clumps.push({
        c: [Math.cos(a) * rho, yb + ti * step - droop + s * r.range(-0.35, 0.35), Math.sin(a) * rho],
        rx: rh * r.range(0.9, 1.1),
        rz: rh * r.range(0.9, 1.1),
        top: s * r.range(tier.top[0], tier.top[1]),
        skirt: s * r.range(tier.skirt[0], tier.skirt[1]) + droop * 0.5,
      });
      tierOf.push(ti);
    }
  });
  t.core = { c: [0, yb + 1.5 * step, 0], r: [0.4 * R, 1.3 * step, 0.4 * R] };

  // Limbs: the trunk splits at the fork into four main limbs climbing out;
  // every cushion hangs on a branch off the nearest one, so branches show in
  // the gaps like the sheet's — the rim's run nearly level under the canopy.
  const mainLimbs: Limb[] = [];
  const mphase = r.range(0, TAU);
  for (let m = 0; m < 4; m++) {
    const a = mphase + (m * TAU) / 4 + r.range(-0.3, 0.3);
    const ya = t.forkY + s * r.range(-0.8, 0.3);
    const [ax, az] = axisAt(t, ya);
    const b: Vec3 = [Math.cos(a) * 0.42 * R, yb + step * r.range(0.9, 1.2), Math.sin(a) * 0.42 * R];
    const limb: Limb = { a: [ax, ya, az], m: [ax + (b[0] - ax) * 0.55, ya + (b[1] - ya) * 0.3, az + (b[2] - az) * 0.55], b, r0: s * r.range(0.75, 0.85), r1: s * 0.45 };
    mainLimbs.push(limb);
    t.limbs.push(limb);
  }
  const angle = (v: Vec3) => Math.atan2(v[2], v[0]);
  const rimBranches: Limb[] = [];
  t.clumps.forEach((c, n) => {
    const ti = tierOf[n];
    let a: Vec3;
    let m: Vec3;
    const b: Vec3 = [c.c[0] * 0.9, c.c[1] - c.skirt * (ti ? 0.3 : 0.6), c.c[2] * 0.9];
    if (!ti) {
      // Rim cushions sit on thick limbs straight off the trunk, nearly level
      // below the canopy — the sheet's spreading limbs.
      const ya = t.forkY + s * r.range(-1.3, 0);
      const [ax, az] = axisAt(t, ya);
      a = [ax, ya, az];
      m = [ax + (b[0] - ax) * 0.62, ya + (b[1] - ya) * 0.15, az + (b[2] - az) * 0.62];
    } else {
      const main = mainLimbs.reduce((x, y) => (Math.abs(adiff(angle(y.b), angle(c.c))) < Math.abs(adiff(angle(x.b), angle(c.c))) ? y : x));
      a = bezier(main, [0, 0.6, 0.9, 1][ti]);
      m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.2 * s, (a[2] + b[2]) / 2];
    }
    const branch: Limb = { a, m, b, r0: Math.max(0.3, s * (ti ? 0.42 : r.range(0.58, 0.68))), r1: Math.max(0.25, 0.28 * s) };
    t.limbs.push(branch);
    if (!ti) rimBranches.push(branch);
  });

  // Vines: from the rim branches and the main limbs, and the rim cushions'
  // skirts; most short, a few long.
  for (const l of [...rimBranches, ...rimBranches, ...mainLimbs]) {
    for (let v = r.int(1, 2); v > 0; v--) {
      const p = bezier(l, r.range(0.25, 0.9));
      const len = s * (r.chance(0.22) ? r.range(7, 10) : r.chance(0.4) ? r.range(3.5, 6) : r.range(1.6, 3.5));
      t.vines.push({ x: p[0] + r.range(-0.3, 0.3), y: p[1], z: p[2] + r.range(-0.3, 0.3), len });
    }
  }
  t.clumps.forEach((c, n) => {
    if (tierOf[n]) return;
    for (let v = r.int(0, 2); v > 0; v--) {
      const a = r.range(0, TAU);
      const d = r.range(0.25, 0.75);
      t.vines.push({ x: c.c[0] + Math.cos(a) * c.rx * d, y: c.c[1] - c.skirt, z: c.c[2] + Math.sin(a) * c.rz * d, len: s * r.range(1.2, 4) });
    }
  });

  t.stones = planStones(r, s, rootAngles, mains);
  return t;
}

/** A root strip radiating from (x0, z0) at angle theta, from rho0 to len (metres). */
function stroke(
  x0: number,
  z0: number,
  theta: number,
  rho0: number,
  len: number,
  bend: number,
  wiggle: number,
  nseed: number,
  prof: (u: number, rho: number) => { h: number; w: number },
): Stroke {
  const pts: Stroke['pts'] = [];
  const n = Math.max(2, Math.ceil((len - rho0) / 0.1));
  for (let q = 0; q <= n; q++) {
    const u = q / n;
    const rho = rho0 + (len - rho0) * u;
    const a = theta + bend * u * u + wiggle * (noise3(u * 3.2, 0.5, 0.5, nseed) - 0.5) * u;
    const { h, w } = prof(u, rho);
    pts.push({ x: x0 + Math.cos(a) * rho, z: z0 + Math.sin(a) * rho, h, w });
  }
  return { pts };
}

function bezier(l: Limb, t: number): Vec3 {
  const u = 1 - t;
  return [0, 1, 2].map((i) => u * u * l.a[i] + 2 * u * t * l.m[i] + t * t * l.b[i]) as Vec3;
}

// ── Stones ────────────────────────────────────────────────────────────────────

/** Lay the planned blocks (weathered, mossy sandstone) and a height map of their tops. */
export function buildStones(t: TreePlan): { set: BlockSet; topAt: (x: number, z: number) => number } {
  const set = new BlockSet(0.125);
  const surf = stoneSurf({ moss: 0.38, lichen: 0.06, stain: 0.14 });
  // Tops per bark column over the stones' footprint (plus a one-cell rim).
  let [i0, i1, k0, k1] = [0, 0, 0, 0];
  for (const b of t.stones) {
    i0 = Math.min(i0, Math.round(b.min[0] / BARK) - 1);
    i1 = Math.max(i1, Math.round(b.max[0] / BARK) + 1);
    k0 = Math.min(k0, Math.round(b.min[2] / BARK) - 1);
    k1 = Math.max(k1, Math.round(b.max[2] / BARK) + 1);
  }
  const nk = k1 - k0 + 1;
  const tops = new Float32Array((i1 - i0 + 1) * nk);
  t.stones.forEach((b, n) => {
    // Broken faces: the block's own stone, a shade darker (fresh breaks on weathered stone).
    const color = tone(b.pal ? STONE_GREY : STONE_WARM, n, 0, 0, t.seed);
    set.add(b.min[0], b.min[1], b.min[2], b.max[0], b.max[1], b.max[2], color, { surf, broken: [darker(color, 0.84), darker(color, 0.78)] });
    for (let i = Math.round(b.min[0] / BARK); i < Math.round(b.max[0] / BARK); i++)
      for (let k = Math.round(b.min[2] / BARK); k < Math.round(b.max[2] / BARK); k++) {
        const c = (i - i0) * nk + k - k0;
        tops[c] = Math.max(tops[c], b.max[1]);
      }
  });
  // Weathering: a broken top corner on some blocks — one no other block
  // touches. The sheet's blocks are crisp otherwise (and intact blocks stay one box each).
  const r = rng(t.seed * 5 + 3);
  t.stones.forEach((b, n) => {
    const [sx, sz] = [r.chance(0.5) ? -1 : 1, r.chance(0.5) ? -1 : 1];
    const [x, z, y] = [sx < 0 ? b.min[0] : b.max[0], sz < 0 ? b.min[2] : b.max[2], b.max[1]];
    const free = !set.solidAt(x + sx * 0.06, y - 0.06, z - sz * 0.06) && !set.solidAt(x - sx * 0.06, y - 0.06, z + sz * 0.06) && !set.solidAt(x - sx * 0.06, y + 0.06, z - sz * 0.06);
    if (r.chance(0.3) && free) set.carveSphere(x, y, z, r.range(0.15, 0.24), t.seed + n, 0.3);
  });
  // Highest stone top within a cell of (x, z): roots riding over a block also hug its sides.
  const topAt = (x: number, z: number) => {
    const i = Math.floor(x / BARK);
    const k = Math.floor(z / BARK);
    if (i <= i0 || i >= i1 || k <= k0 || k >= k1) return 0;
    let h = 0;
    for (let di = -1; di <= 1; di++) for (let dk = -1; dk <= 1; dk++) h = Math.max(h, tops[(i + di - i0) * nk + k + dk - k0]);
    return h;
  };
  return { set, topAt };
}

// ── Bark: trunk, limbs, roots ─────────────────────────────────────────────────

export interface BarkResult {
  /** Is there bark (or stone) at this point? */
  solid(x: number, y: number, z: number): boolean;
  /** Is there drawn bark (trunk, root, moss) at this point? */
  drawn(x: number, y: number, z: number): boolean;
  /** Root strips as stamped (for colliders): per stroke, each sample's top (metres). */
  rootTops: { x: number; z: number; w: number; top: number }[][];
}

export function buildBark(p: PieceBuilder, t: TreePlan, stones: BlockSet, stoneTop: (x: number, z: number) => number, inCanopy: (x: number, y: number, z: number) => boolean): BarkResult {
  const { s, seed } = t;
  // Bounds: roots and limbs reach furthest…
  let ext = coreRadius(t, 0) * 2;
  let yMax = t.forkY + 2 * s;
  for (const st of t.roots) for (const q of st.pts) ext = Math.max(ext, Math.abs(q.x) + q.w, Math.abs(q.z) + q.w);
  for (const l of t.limbs)
    for (const v of [l.a, l.m, l.b]) {
      ext = Math.max(ext, Math.abs(v[0]) + l.r0, Math.abs(v[2]) + l.r0);
      yMax = Math.max(yMax, v[1] + l.r0);
    }
  // …and the rubble round them (but not a whole terrace a scene may have laid in the set).
  const sb = stones.bounds();
  const stoneY = Number.isFinite(sb.max[1]) ? sb.max[1] : 0;
  if (stoneY > 0) ext = Math.max(ext, Math.min(ext + 1.5, Math.max(-sb.min[0], sb.max[0], -sb.min[2], sb.max[2])));
  const n = Math.ceil(ext / BARK) + 2;
  const g = new Dense(BARK, [-n, 0, -n], [n, Math.ceil(yMax / BARK) + 2, n]);
  g.ground();
  // Below the canopy's lowest leaves (fringe and tufts included) there is no need to ask it.
  let leafY = t.core.c[1] - t.core.r[1] * 1.2 - 1;
  for (const c of t.clumps) leafY = Math.min(leafY, c.c[1] - c.skirt - 2);
  /** Place a bark cell unless stone or leaves already fill it (then it only occludes). */
  const put = (i: number, j: number, k: number, color: number, look: number) => {
    const y = (j + 0.5) * BARK;
    if ((y < stoneY && stones.solidAt((i + 0.5) * BARK, y, (k + 0.5) * BARK)) || (y > leafY && inCanopy((i + 0.5) * BARK, y, (k + 0.5) * BARK))) g.ghost(i, j, k);
    else g.set(i, j, k, color, look);
  };

  // Trunk: fluted rings, coloured in vertical strips (ridges light, grooves dark).
  const top = t.forkY + 1.4 * s;
  const jTop = Math.floor(top / BARK);
  const rings = new Rings(t);
  const radius = new Float32Array(RING);
  const flute = new Float32Array(RING);
  /** Per strip of bark at this height: its tone lot, ridge bias and whether it pales into root. */
  const STRIPS = 48;
  const [sTone, sBias, sPale] = [new Float32Array(STRIPS), new Float32Array(STRIPS), new Uint8Array(STRIPS)];
  for (let j = 0; j < jTop; j++) {
    const y = (j + 0.5) * BARK;
    const [ax, az] = axisAt(t, y);
    // Above the fork the trunk thins as the limbs take over.
    const thin = 1 - 0.55 * smooth(t.forkY - 0.5 * s, top, y);
    rings.at(y, radius, flute);
    let reach = 0;
    let inner = Infinity;
    for (let a = 0; a < RING; a++) {
      reach = Math.max(reach, radius[a] * thin);
      inner = Math.min(inner, radius[a] * thin);
    }
    // Deep inside: never seen, no colour needed.
    const deep = j < jTop - 2 ? Math.max(0, inner - 0.6) : 0;
    const look = g.lookOf('trunk', barkSurf({ moss: Math.max(0, Math.round((0.42 - (y / s) * 0.16) * 20) / 20), lichen: 0.12, stain: 0.18 }));
    // Strips follow the flutes' twist; their tone changes every metre or so,
    // and at the foot some pale into the roots' colour.
    for (let q = 0; q < STRIPS; q++) {
      const band = Math.floor(y / (1.2 * s) + hash3(q, 0, 0, seed));
      sTone[q] = hash3(q, band, 2, seed);
      sBias[q] = (hash3(q, band, 1, seed) - 0.5) * 0.6;
      sPale[q] = hash3(q, band, 3, seed) < 0.7 - y / (2.3 * s) ? 1 : 0;
    }
    for (let i = Math.floor((ax - reach) / BARK); i <= Math.ceil((ax + reach) / BARK); i++) {
      const x = (i + 0.5) * BARK - ax;
      if (x * x > reach * reach) continue;
      // The row's cells within reach, less the buried run across the heart.
      const zr = Math.sqrt(reach * reach - x * x);
      const zd = x * x < deep * deep ? Math.sqrt(deep * deep - x * x) : 0;
      const [h0, h1] = zd ? [Math.floor((az - zd) / BARK + 0.5), Math.ceil((az + zd) / BARK - 1.5)] : [1, 0];
      if (h0 <= h1) g.ghostRun(i, j, h0, h1);
      for (let k = Math.ceil((az - zr) / BARK - 0.5); k <= Math.floor((az + zr) / BARK - 0.5); k++) {
        if (k === h0 && h0 <= h1) {
          k = h1;
          continue;
        }
        const z = (k + 0.5) * BARK - az;
        const rr = x * x + z * z;
        const theta = Math.atan2(z, x);
        const a = ringIndex(theta);
        const edge = radius[a] * thin;
        if (rr > edge * edge) continue;
        const q = Math.floor((((theta - t.twist * y) / TAU + 1) % 1) * STRIPS);
        const ridge = flute[a] / (t.trunkR * 0.25) + sBias[q];
        const pal = sPale[q] ? ROOT : ridge > 0.62 ? BARK_RIDGE : ridge > 0.25 ? BARK_MID : BARK_GROOVE;
        put(i, j, k, pal[Math.floor(sTone[q] * pal.length) % pal.length], look);
      }
    }
  }

  // Limbs: tapered Bézier tubes, stamped as balls along the curve (a slice of
  // the ball per row of cells).
  const limbLook = g.lookOf('trunk', barkSurf({ moss: 0.12, lichen: 0.18, stain: 0.2 }));
  for (const l of t.limbs) {
    const len = Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1], l.b[2] - l.a[2]) * 1.15;
    const steps = Math.ceil(len / ((l.r0 + l.r1) * 0.25));
    for (let q = 0; q <= steps; q++) {
      const u = q / steps;
      const [w0, w1, w2] = [(1 - u) * (1 - u), 2 * (1 - u) * u, u * u];
      const cx = w0 * l.a[0] + w1 * l.m[0] + w2 * l.b[0];
      const cy = w0 * l.a[1] + w1 * l.m[1] + w2 * l.b[1];
      const cz = w0 * l.a[2] + w1 * l.m[2] + w2 * l.b[2];
      const rad = Math.max(BARK * 0.6, l.r0 + (l.r1 - l.r0) * u);
      for (let i = Math.floor((cx - rad) / BARK); i <= Math.floor((cx + rad) / BARK); i++) {
        const dx = (i + 0.5) * BARK - cx;
        for (let j = Math.floor((cy - rad) / BARK); j <= Math.floor((cy + rad) / BARK); j++) {
          const dy = (j + 0.5) * BARK - cy;
          const rem = rad * rad - dx * dx - dy * dy;
          if (rem < 0) continue;
          const w = Math.sqrt(rem);
          for (let k = Math.ceil((cz - w) / BARK - 0.5); k <= Math.floor((cz + w) / BARK - 0.5); k++) {
            if (g.has(i, j, k)) continue;
            // In the canopy's shade: darker than the trunk, like the sheet's limbs.
            put(i, j, k, tone(hash3(i, j, k, seed) < 0.3 ? BARK_MID : BARK_GROOVE, i, j, k, seed), limbLook);
          }
        }
      }
    }
  }

  // Roots: a height map stamped by every strip, filled as columns from the
  // ground — so fins step down like the sheet's. Over a block a root keeps at
  // least a strap's thickness above the stone: it flows over the block and
  // down its faces, and takes the block's place in its own columns (it reads
  // as gripping the stone, and no pale stone shows through the seams).
  const { ni, nk, li, lk } = g;
  const colTop = new Float32Array(ni * nk);
  const colRoot = new Int16Array(ni * nk).fill(-1);
  const stoneCol = new Float32Array(ni * nk).fill(-1);
  const stoneUnder = (i: number, k: number, c: number) => (stoneCol[c] >= 0 ? stoneCol[c] : (stoneCol[c] = stoneTop((i + 0.5) * BARK, (k + 0.5) * BARK)));
  const rootTops: BarkResult['rootTops'] = [];
  t.roots.forEach((st, si) => {
    const tops: BarkResult['rootTops'][number] = [];
    for (const pt of st.pts) {
      const hw = pt.w / 2;
      const span = Math.max(hw, BARK * 0.5);
      let peak = 0;
      for (let i = Math.floor((pt.x - hw) / BARK); i <= Math.floor((pt.x + hw) / BARK); i++) {
        const dx = (i + 0.5) * BARK - pt.x;
        for (let k = Math.floor((pt.z - hw) / BARK); k <= Math.floor((pt.z + hw) / BARK); k++) {
          const dz = (k + 0.5) * BARK - pt.z;
          const d2 = (dx * dx + dz * dz) / (span * span);
          if (d2 > 1) continue;
          // Flat-topped fins with steep sides, stepping down in half-metre
          // stairs like the sheet's (a strap over stone keeps its own curve).
          const h = pt.h * (1 - 0.3 * d2 * d2);
          if (h < BARK * 0.5) continue;
          const c = (i - li) * nk + k - lk;
          const under = stoneUnder(i, k, c);
          const fin = h > 1 ? Math.round(h / 0.5) * 0.5 : h;
          const y = under > 0 ? Math.max(fin, under + Math.min(0.5, Math.max(0.375, h * 0.5)) * (1 - 0.3 * d2)) : fin;
          if (y > colTop[c]) {
            colTop[c] = y;
            colRoot[c] = si;
          }
          peak = Math.max(peak, y);
        }
      }
      tops.push({ x: pt.x, z: pt.z, w: pt.w, top: peak });
    }
    rootTops.push(tops);
  });
  // Stone footprints per column (planned blocks), to know where roots lie on stone.
  const onStone = new Uint8Array(ni * nk);
  const blocks = stones.find(() => true).map((id) => stones.boxOf(id));
  for (const b of blocks)
    for (let i = Math.max(li, Math.round(b.min[0] / BARK)); i < Math.min(li + ni, Math.round(b.max[0] / BARK)); i++)
      for (let k = Math.max(lk, Math.round(b.min[2] / BARK)); k < Math.min(lk + nk, Math.round(b.max[2] / BARK)); k++) onStone[(i - li) * nk + k - lk] = 1;
  const all = () => true;
  for (let c = 0; c < colTop.length; c++) {
    if (!colTop[c] || !onStone[c]) continue;
    const i = ((c / nk) | 0) + li;
    const k = (c % nk) + lk;
    stones.carve(all, { min: [i * BARK, 0, k * BARK], max: [(i + 1) * BARK, colTop[c], (k + 1) * BARK] });
  }
  const rootLook = g.lookOf('trunk', barkSurf({ moss: 0.45, lichen: 0.1, stain: 0.12 }));
  const mossLook = g.lookOf('leaves', leafSurf());
  const moss = (i: number, j: number, k: number) => put(i, j, k, tone(MOSS, i, j, k, seed), mossLook);
  const around = [1, 0, -1, 0, 0, 1, 0, -1];
  for (let c = 0; c < colTop.length; c++) {
    const y = colTop[c];
    if (!y) continue;
    const i = ((c / nk) | 0) + li;
    const k = (c % nk) + lk;
    const jn = Math.round(y / BARK);
    // Bark in patches half a metre across and a metre tall, one tone per root
    // (under the trunk's own cells; over a block, ghosts are stone it replaced).
    const r = colRoot[c] * 7;
    const lift = onStone[c] ? 2 : 1;
    for (let j = 0; j < jn; j++) if (g.occ[g.at(i, j, k)] < lift) g.set(i, j, k, tone(ROOT, (i >> 1) + r, j >> 2, k >> 1, seed), rootLook);
    if (jn * BARK > (onStone[c] ? 2.2 : 1.4)) continue;
    // Moss cushions in patches on low root tops (thickest where they lie on
    // stone), and tufts on the ground beside them.
    if (!g.has(i, jn, k) && noise3(i * 0.3, 0.5, k * 0.3, seed + 5) > (onStone[c] ? 0.52 : 0.64) && hash3(i, jn, k, seed + 71) < 0.35) moss(i, jn, k);
    const q = Math.floor(hash3(i, 5, k, seed) * 4) * 2;
    const [ti, tk] = [i + around[q], k + around[q + 1]];
    if (!colTop[(ti - li) * nk + tk - lk] && hash3(i, 0, k, seed + 73) < 0.05 && !g.has(ti, 0, tk)) moss(ti, 0, tk);
  }
  // Moss cushions in patches on the blocks' bare tops.
  for (const b of blocks) {
    const j = Math.round(b.max[1] / BARK);
    for (let i = Math.max(li, Math.round(b.min[0] / BARK)); i < Math.min(li + ni, Math.round(b.max[0] / BARK)); i++)
      for (let k = Math.max(lk, Math.round(b.min[2] / BARK)); k < Math.min(lk + nk, Math.round(b.max[2] / BARK)); k++) {
        if (noise3(i * 0.35, j * 0.5, k * 0.35, seed + 9) < 0.64 || hash3(i, j, k, seed + 77) > 0.42 || g.has(i, j, k)) continue;
        const [x, z] = [(i + 0.5) * BARK, (k + 0.5) * BARK];
        if (stones.solidAt(x, b.max[1] - 0.06, z) && !stones.solidAt(x, b.max[1] + 0.06, z)) moss(i, j, k);
      }
  }
  g.closeSlits();
  g.commit(p.voxels, { jitter: 0.05, ao: 0.32, seed, merge: true });

  return {
    solid: (x, y, z) => g.has(Math.floor(x / BARK), Math.floor(y / BARK), Math.floor(z / BARK)) || stones.solidAt(x, y, z),
    drawn: (x, y, z) => g.occ[g.at(Math.floor(x / BARK), Math.floor(y / BARK), Math.floor(z / BARK))] === 2,
    rootTops,
  };
}

/**
 * Emit the stones, then join the faces the roots lie on to the roots: no
 * bevel groove and no pale rim there — otherwise every root over a block
 * traces the block's hidden edges in light lines.
 */
export function emitStones(p: PieceBuilder, set: BlockSet, barkAt: (x: number, y: number, z: number) => boolean, seed: number): void {
  const boxes = p.voxels.boxes;
  const first = boxes.length;
  set.emit(p.voxels, { seed });
  const q = [0, 0, 0];
  for (let n = first; n < boxes.length; n++) {
    const b = boxes[n];
    const c = [b.x, b.y, b.z];
    const size = [b.sx, b.sy, b.sz];
    let open = b.open ?? 63;
    let merge = b.merge ?? 0;
    for (let f = 0; f < 6; f++) {
      const bit = 1 << f;
      if (!(open & bit)) continue;
      // Sample the face a hair outside it, every ~0.2 m (a small face: its middle).
      const ax = f >> 1;
      const u = (ax + 1) % 3;
      const v = (ax + 2) % 3;
      const nu = Math.max(1, Math.round(size[u] / 0.2));
      const nv = Math.max(1, Math.round(size[v] / 0.2));
      q[ax] = c[ax] + (f & 1 ? -1 : 1) * (size[ax] / 2 + 0.05);
      let hit = 0;
      if (nu * nv <= 3) {
        q[u] = c[u];
        q[v] = c[v];
        hit = barkAt(q[0], q[1], q[2]) ? nu * nv : 0;
      } else
        for (let a = 0; a < nu; a++) {
          q[u] = c[u] + ((a + 0.5) / nu - 0.5) * size[u];
          for (let d = 0; d < nv; d++) {
            q[v] = c[v] + ((d + 0.5) / nv - 0.5) * size[v];
            if (barkAt(q[0], q[1], q[2])) hit++;
          }
        }
      if (hit >= 0.3 * nu * nv) {
        open &= ~bit;
        merge |= bit;
      }
    }
    b.open = open;
    b.merge = merge;
  }
}

// ── Canopy ────────────────────────────────────────────────────────────────────

/**
 * Leaf cushions around a dark core. A cushion is filled column by column: a
 * rounded-square footprint frayed by noise, a flat-topped dome over its rim
 * and a skirt under it whose edge hangs in a ragged fringe — the sheet's
 * clumps. Upper tiers overlap the lower ones; the core leaves tunnels where
 * the limbs pass, so branches show in the gaps. Tones follow the cushion:
 * sunlit tops bright yellow-green, flanks mid green, skirts and undersides
 * teal, a step darker where two cushions meet.
 */
export function buildCanopy(p: PieceBuilder, t: TreePlan): (x: number, y: number, z: number) => boolean {
  const { seed } = t;
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  const grow = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
    [x0, y0, z0].forEach((v, a) => (lo[a] = Math.min(lo[a], Math.floor(v / LEAF) - 2)));
    [x1, y1, z1].forEach((v, a) => (hi[a] = Math.max(hi[a], Math.ceil(v / LEAF) + 2)));
  };
  for (const c of t.clumps) grow(c.c[0] - c.rx * 1.2, c.c[1] - c.skirt - 1.5, c.c[2] - c.rz * 1.2, c.c[0] + c.rx * 1.2, c.c[1] + c.top, c.c[2] + c.rz * 1.2);
  const { c: cc, r: cr } = t.core;
  grow(cc[0] - cr[0] * 1.2, cc[1] - cr[1] * 1.2, cc[2] - cr[2] * 1.2, cc[0] + cr[0] * 1.2, cc[1] + cr[1] * 1.2, cc[2] + cr[2] * 1.2);
  const g = new Dense(LEAF, lo, hi);
  const { occ, sI: di, sJ: dj } = g;
  const owner = new Int16Array(occ.length).fill(-2);
  const cells: number[] = [];
  const claim = (n: number, id: number) => {
    if (n < 0) return;
    if (owner[n] === -2) cells.push(n);
    owner[n] = id;
  };

  // The core's cells, and tunnels through them where the limbs pass.
  const [ci0, cj0, ck0] = [0, 1, 2].map((a) => Math.floor((cc[a] - cr[a] * 1.15) / LEAF));
  const [ci1, cj1, ck1] = [0, 1, 2].map((a) => Math.ceil((cc[a] + cr[a] * 1.15) / LEAF));
  const tunnel = new Uint8Array(occ.length);
  for (const l of t.limbs) {
    const steps = Math.ceil(Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1], l.b[2] - l.a[2]) / 0.25);
    for (let q = 0; q <= steps; q++) {
      const u = q / steps;
      const [x, y, z] = bezier(l, u);
      const rad = l.r0 + (l.r1 - l.r0) * u + 0.3;
      const [i0, i1] = [Math.max(ci0, Math.floor((x - rad) / LEAF)), Math.min(ci1, Math.floor((x + rad) / LEAF))];
      const [j0, j1] = [Math.max(cj0, Math.floor((y - rad) / LEAF)), Math.min(cj1, Math.floor((y + rad) / LEAF))];
      const [k0, k1] = [Math.max(ck0, Math.floor((z - rad) / LEAF)), Math.min(ck1, Math.floor((z + rad) / LEAF))];
      for (let i = i0; i <= i1; i++)
        for (let j = j0; j <= j1; j++)
          for (let k = k0; k <= k1; k++) {
            const n = g.at(i, j, k);
            if (n >= 0) tunnel[n] = 1;
          }
    }
  }
  // The core: an ellipsoid of shaded leaves, roughened (±0.15: only near its skin).
  for (let i = ci0; i <= ci1; i++)
    for (let j = cj0; j <= cj1; j++)
      for (let k = ck0; k <= ck1; k++) {
        const d = Math.hypot(((i + 0.5) * LEAF - cc[0]) / cr[0], ((j + 0.5) * LEAF - cc[1]) / cr[1], ((k + 0.5) * LEAF - cc[2]) / cr[2]);
        if (d > 1.15 || (d > 0.85 && d > 1 + (noise3(i * 0.4, j * 0.4, k * 0.4, seed + 3) - 0.5) * 0.3)) continue;
        const n = g.at(i, j, k);
        if (n >= 0 && !tunnel[n]) claim(n, -1);
      }

  // Cushions, lowest tier first: the upper ones hang over them.
  t.clumps.forEach((cl, id) => {
    const cy = cl.c[1] / LEAF;
    const top = cl.top / LEAF;
    const skirt = cl.skirt / LEAF;
    for (let i = Math.floor((cl.c[0] - cl.rx * 1.2) / LEAF); i <= Math.ceil((cl.c[0] + cl.rx * 1.2) / LEAF); i++)
      for (let k = Math.floor((cl.c[2] - cl.rz * 1.2) / LEAF); k <= Math.ceil((cl.c[2] + cl.rz * 1.2) / LEAF); k++) {
        const dx = Math.abs((i + 0.5) * LEAF - cl.c[0]) / cl.rx;
        const dz = Math.abs((k + 0.5) * LEAF - cl.c[2]) / cl.rz;
        const d = (dx ** 2.6 + dz ** 2.6) ** (1 / 2.6) / (1 + (noise3(i * 0.45, id * 3.7, k * 0.45, seed) - 0.5) * 0.36);
        if (d >= 1) continue;
        // A flat-topped dome over the rim, a skirt under it that rounds off at
        // the edge, where a ragged fringe of 0–1 cells hangs.
        const yTop = cy + top * (1 - d ** 3) ** 0.6;
        const fringe = d > 0.5 ? Math.floor(hash3(i, id, k, seed + 7) * 1.8) : 0;
        const yBot = cy - skirt * Math.sqrt(1 - d ** 4) - fringe;
        for (let j = Math.ceil(yBot - 0.5); j + 0.5 <= yTop; j++) claim(g.at(i, j, k), id);
      }
  });

  // Pixel tufts: leaves poking out of the cushions' tops and sides, single
  // blocks hanging from their bottoms, a few notches — the sheet's leafy edges.
  const sides = [di, -di, 1, -1];
  const first = cells.length;
  for (let q = 0; q < first; q++) {
    const n = cells[q];
    const id = owner[n];
    // (Buried cells, owned all round, grow nothing.)
    if (id < 0 || (owner[n + dj] !== -2 && owner[n - dj] !== -2 && owner[n + di] !== -2 && owner[n - di] !== -2 && owner[n + 1] !== -2 && owner[n - 1] !== -2)) continue;
    const h = hash3(n, 7, 3, seed + 13);
    const side = n + sides[Math.floor(hash3(n, 1, 9, seed + 17) * 4)];
    if (owner[n + dj] === -2 && h < 0.06) claim(n + dj, id);
    else if (owner[n + dj] === -2 && h > 0.965 && owner[n - dj] !== -2) owner[n] = -2;
    else if (owner[side] === -2 && h > 0.9) claim(side, id);
    else if (owner[n - dj] === -2 && h > 0.8 && h < 0.88) claim(n - dj, id);
  }
  for (const n of cells) if (owner[n] !== -2) g.fill(n, 1);

  // How far out the canopy reaches at each layer, to shade its inside.
  const reach = new Float64Array(g.nj);
  for (const c of t.clumps)
    for (let j = Math.floor((c.c[1] - c.skirt - 1) / LEAF); j <= Math.ceil((c.c[1] + c.top) / LEAF); j++) {
      const b = j - g.lj;
      if (b >= 0 && b < g.nj) reach[b] = Math.max(reach[b], Math.hypot(c.c[0], c.c[2]) + Math.max(c.rx, c.rz));
    }

  const SHADES = [LEAF_TOP, LEAF_MID, LEAF_LOW, LEAF_UNDER, LEAF_CORE];
  const topLook = g.lookOf('leaves', leafSurf({ yellow: 0.16 }));
  const leafLook = g.lookOf('leaves', leafSurf());
  const differs = (m: number, id: number) => owner[m] >= 0 && owner[m] !== id;
  for (const n of cells) {
    const id = owner[n];
    if (occ[n] !== 1) continue;
    const upOpen = !occ[n + dj];
    const downOpen = !occ[n - dj];
    // Enclosed cells stay ghosts: they only occlude.
    if (!upOpen && !downOpen && occ[n + di] && occ[n - di] && occ[n + 1] && occ[n - 1]) continue;
    const a = (n / di) | 0;
    const b = ((n - a * di) / dj) | 0;
    const [i, j, k] = [a + g.li, b + g.lj, n - a * di - b * dj + g.lk];
    const hsh = hash3(i, j, k, seed + 23);
    let shade: number;
    if (id < 0) shade = upOpen ? 2 : 4;
    else {
      const cl = t.clumps[id];
      // Height in the cushion: 0‥1 up its dome, 0‥−1 down its skirt.
      const y = (j + 0.5) * LEAF - cl.c[1];
      const v = (y > 0 ? y / cl.top : y / cl.skirt) + (hsh - 0.5) * 0.3;
      if (upOpen) {
        // Sunlit caps on the crowns, the dome's flanks mid green: seen from
        // above the sheet's canopy is a green dome, each clump's crown catching the light.
        const dd = Math.hypot(((i + 0.5) * LEAF - cl.c[0]) / cl.rx, ((k + 0.5) * LEAF - cl.c[2]) / cl.rz);
        shade = v > -0.15 && hsh < (dd < 0.45 ? 0.8 : dd < 0.75 ? 0.45 : 0.15) ? 0 : 1;
      } else if (downOpen) shade = hsh < 0.3 ? 2 : 3;
      else shade = v > 0.45 ? (hsh < 0.3 ? 0 : 1) : v > -0.25 ? 1 : v > -0.65 ? (hsh < 0.5 ? 1 : 2) : 2;
      if (differs(n + di, id) || differs(n - di, id) || differs(n + 1, id) || differs(n - 1, id) || differs(n + dj, id)) shade = Math.min(3, shade + 1);
      // Deep inside the dome (seen through the gaps) the leaves are in shade.
      if (!upOpen) {
        const depth = 1 - Math.hypot((i + 0.5) * LEAF, (k + 0.5) * LEAF) / (reach[b] || 1);
        shade = Math.min(4, shade + (depth > 0.62 ? 2 : depth > 0.42 ? 1 : 0));
      }
    }
    g.paint(n, tone(SHADES[shade], i, j, k, seed), shade === 0 ? topLook : leafLook);
  }
  g.commit(p.voxels, { jitter: 0.07, ao: 0.4, seed });
  return (x, y, z) => g.has(Math.floor(x / LEAF), Math.floor(y / LEAF), Math.floor(z / LEAF));
}

// ── Vines ─────────────────────────────────────────────────────────────────────

/**
 * Hanging vines: a 4-texel stem that kinks a texel every metre or so, leaves
 * budding off its sides, a tuft at the tip; it stops short of whatever is below.
 */
export function buildVines(p: PieceBuilder, t: TreePlan, blocked: (x: number, y: number, z: number) => boolean, inCanopy: (x: number, y: number, z: number) => boolean): void {
  const r = rng(t.seed * 3 + 1);
  const src = here();
  const W = 4 * TEXEL;
  for (const v of t.vines) {
    let x = snap(v.x);
    let z = snap(v.z);
    // Start below the leaves / bark it hangs from.
    let y = v.y;
    for (let n = 0; n < 16 && (inCanopy(x, y, z) || blocked(x, y, z)); n++) y -= BARK;
    let bottom = Math.max(0.6, y - v.len);
    for (let yy = y - BARK; yy > bottom; yy -= BARK)
      if (blocked(x, yy, z) || blocked(x + W, yy, z) || blocked(x - W, yy, z) || blocked(x, yy, z + W) || blocked(x, yy, z - W) || inCanopy(x, yy, z)) {
        bottom = yy + BARK + 0.2;
        break;
      }
    const y0 = snap(y + 0.35);
    const y1 = snap(bottom);
    if (y0 - y1 < 0.6) continue;
    // Stem in segments that kink by a texel.
    let yt = y0;
    while (yt > y1) {
      const seg = Math.min(yt - y1, snap(r.range(0.75, 1.6)));
      p.voxels.box(x, yt - seg / 2, z, W, seg, W, r.pick(VINE_STEM), 'leaves', { src });
      yt -= seg;
      if (r.chance(0.5)) x += r.chance(0.5) ? TEXEL : -TEXEL;
      else z += r.chance(0.5) ? TEXEL : -TEXEL;
    }
    // Leaves: small cubes budding off the sides, sometimes a pair.
    for (let yy = y0 - 0.15; yy > y1 + 0.05; yy -= snap(r.range(0.19, 0.38))) {
      if (!r.chance(0.85)) continue;
      const first = r.int(0, 3);
      for (const side of r.chance(0.3) ? [first, first ^ 1] : [first]) {
        const sz = r.pick([3, 4, 4, 5]) * TEXEL;
        const off = (W + sz) / 2 - TEXEL;
        const dx = side === 0 ? off : side === 1 ? -off : 0;
        const dz = side === 2 ? off : side === 3 ? -off : 0;
        p.voxels.box(x + dx, snap(yy), z + dz, sz, sz, sz, r.pick(VINE_LEAF), 'leaves', { src });
      }
    }
    p.voxels.box(x, y1 - TEXEL, z, 5 * TEXEL, 4 * TEXEL, 5 * TEXEL, r.pick(VINE_LEAF), 'leaves', { src });
  }
}

// ── Colliders ─────────────────────────────────────────────────────────────────

/**
 * Trunk: crossed boxes in 3 m lifts following its lean; roots: a box per metre
 * of strip (step over the thin ones, walk round the fins); one box per stone.
 * Leaves and vines have none.
 */
export function treeColliders(p: PieceBuilder, t: TreePlan, rootTops: BarkResult['rootTops']): void {
  const lift = 3 * t.s;
  for (let y0 = 0; y0 < t.forkY; y0 += lift) {
    const y1 = Math.min(t.forkY, y0 + lift);
    const [ax, az] = axisAt(t, (y0 + y1) / 2);
    const r = coreRadius(t, y0 + lift * 0.5) * 0.95;
    p.collider(ax - r, y0, az - r * 0.7, ax + r, y1, az + r * 0.7);
    p.collider(ax - r * 0.7, y0, az - r, ax + r * 0.7, y1, az + r);
  }
  for (const tops of rootTops) {
    const run = 11;
    for (let a = 0; a < tops.length; a += run) {
      const seg = tops.slice(a, a + run + 1).filter((q) => q.top > 0.12);
      if (!seg.length) continue;
      let [x0, z0, x1, z1, top] = [Infinity, Infinity, -Infinity, -Infinity, 0];
      for (const q of seg) {
        x0 = Math.min(x0, q.x - q.w * 0.4);
        x1 = Math.max(x1, q.x + q.w * 0.4);
        z0 = Math.min(z0, q.z - q.w * 0.4);
        z1 = Math.max(z1, q.z + q.w * 0.4);
        top = Math.max(top, q.top);
      }
      p.collider(x0, 0, z0, x1, snap(top, BARK), z1);
    }
  }
  for (const b of t.stones) p.collider(b.min[0], b.min[1], b.min[2], b.max[0], b.max[1], b.max[2]);
}
