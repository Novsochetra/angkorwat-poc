import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { traceSource, type SourceTrace } from '../../../feedback/sourceTrace';
import type { VoxelBuilder } from '../../../voxel/VoxelBuilder';
import type { VoxelMaterialKey } from '../../../voxel/materials';
import { hash3 } from '../../../voxel/random';
import { Crown } from './_treeCrown';
import { registerModel } from '../look';
import type { PlantLook } from '../state';

/**
 * The bodhi tree (ដើមពោធិ៍, Ficus religiosa: garden/kinds.ts `KINDS.bodhi`), as it
 * stands in a Cambodian wat: the sapling the pagoda's head monk gives him
 * (roam/_bodhi*.ts), planted in the pagoda's grounds, grown over a game year.
 *
 * - **Stage 0**: the sapling just set in the earth, its bag torn off: a slender
 *   stem with a few heart-shaped leaves on long stalks (the newest at the top still
 *   unfolding, paler, as the bodhi's new leaves come), tied to a bamboo stake, a saffron ribbon
 *   on it (the monks mark a sacred tree from the start).
 * - **Stage 1**: a whip as tall as a man, side shoots, more leaves.
 * - **Stage 2**: a young tree of 3‥4 m, a thin grey stem branching into a
 *   small loose crown, a band of saffron cloth round the stem.
 * - **Stage 3**: a young tree of ≈ 8 m: a smooth grey trunk with its first
 *   flutes, three limbs, a rounded crown; bands of saffron and white cloth.
 * - **Stage 4**: the great tree, ≈ 14 m, its crown ≈ 6 m round: a massive pale
 *   grey trunk of fused, fluted stems flaring into buttresses and roots over
 *   the ground; four limbs up into a broad dome of fresh green leaves, and two
 *   long low limbs reaching out level, each held up by a wooden crutch (ឈើច្រត់
 *   ពោធិ៍: people offer them for merit); leaves with long drip tips hang along
 *   the crown's lower edge (they flutter: `mapLeaf` sways); bands of cloth
 *   round the trunk — saffron, white, yellow, red — their tails hanging in
 *   front; at its foot an incense pot, candles and marigolds.
 *
 * Front is +z (the view turns it by the plant's `yaw`: roam/_bodhi.ts plants it
 * with its front, the cloths' tails and the offerings, to the way up from the
 * village). Grown ≈ 800 blocks (≤ 900). It never droops nor dies at the pagoda
 * (the monks water it); `droop` / `dead` are drawn all the same if ever asked.
 */

type Rand = () => number;

/** A seeded stream (the same tree every time): `salt` keeps parts apart. */
function rng(look: PlantLook, salt: number): Rand {
  const s = Math.round(look.seed * 997);
  let n = 0;
  return () => hash3(n++, s, salt, 4219);
}

function mix(a: number, b: number, t: number): number {
  const u = 1 - t;
  const r = Math.round(((a >> 16) & 255) * u + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * u + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * u + (b & 255) * t);
  return (r << 16) | (g << 8) | bl;
}

const pick = (list: readonly number[], r: number): number => list[Math.min(list.length - 1, Math.floor(r * list.length))];

/** Smooth pale grey bark (a little warm), the young stem's green-brown, the limbs' a shade darker. */
const BARK = [0xa9a8a0, 0x9c9b93, 0xb4b3aa, 0x908f87] as const;
const LIMB = [0x96958c, 0x8a8981, 0xa09f96] as const;
const STEM = [0x7c7052, 0x86785a] as const;
/** The bodhi's fresh, glossy mid-green; its newest leaf, still unfolding, a paler yellow-green. */
const LEAF = [0x427e2c, 0x4d8b34, 0x386f26, 0x58963b, 0x467f30, 0x326426] as const;
const NEW_LEAF = [0x7e8c3c, 0x86903e, 0x768638] as const;
/** The bamboo stake and its tie; the crutches' old wood; earth. */
const STAKE = 0xc4ac6a;
const STAKE_NODE = 0xa08a52;
const TIE = 0x9a8456;
const PROP = [0x6e5238, 0x7a5c3e, 0x664a32] as const;
const EARTH = 0x5e4630;
/** Cloth round the trunk: saffron, white, yellow, red; the ribbon on a sapling is saffron. */
const SAFFRON = 0xe8901e;
const CLOTH = [SAFFRON, 0xf3efe3, 0xf3c63a, 0xc83a32, 0xe07a18] as const;
/** At its foot: the incense pot, the sticks and their glowing tips, candles, marigolds. */
const POT = 0x9a8a78;
const INCENSE = 0xb0583a;
const CANDLE = 0xf2ead0;
const MARIGOLD = [0xf0a020, 0xe88a18, 0xf6c040] as const;
const DEAD_LEAF = [0x8a6a42, 0x7a5c3a, 0x9a7a4c] as const;
const DEAD_WOOD = [0x8a8278, 0x7c746a] as const;

/** A leaf's colour for want of water (pale, then yellow-brown), or dead. */
function leafTone(c: number, look: PlantLook, r: number): number {
  if (look.dead) return pick(DEAD_LEAF, r);
  if (look.droop === 1) return mix(c, 0x9aa64e, 0.38 + r * 0.12);
  if (look.droop === 2) return mix(c, r < 0.35 ? 0x8a6a38 : 0xa8964a, 0.62 + r * 0.15);
  return c;
}

// ── Turned boxes ────────────────────────────────────────────────────────────

const _m = new Matrix4();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _a = new Vector3();
const _b = new Vector3();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _eu = new Euler();
const UP = new Vector3(0, 1, 0);
const ZAX = new Vector3(0, 0, 1);

/** A box turned by `q` (its centre at x, y, z). */
function turned(b: VoxelBuilder, x: number, y: number, z: number, sx: number, sy: number, sz: number, q: Quaternion, color: number, mat: VoxelMaterialKey, shade: number, src: SourceTrace | undefined): void {
  _eu.setFromQuaternion(q, 'XYZ');
  b.box(x, y, z, sx, sy, sz, color, mat, { shade, rx: _eu.x, ry: _eu.y, rz: _eu.z, src });
}

/** A limb from (ax, ay, az) to (bx, by, bz), `w` thick (a square rod, a little longer to close the joints). */
function rod(b: VoxelBuilder, ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, color: number, src: SourceTrace | undefined, mat: VoxelMaterialKey = 'mapBark', shade = 1, spin = 0): void {
  _a.set(bx - ax, by - ay, bz - az);
  const len = _a.length();
  if (len < 1e-4) return;
  _a.divideScalar(len);
  _q.setFromUnitVectors(UP, _a);
  if (spin) _q.multiply(_q2.setFromAxisAngle(UP, spin));
  turned(b, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, w, len + w * 0.6, w, _q, color, mat, shade, src);
}

const DIAMOND = new Quaternion().setFromAxisAngle(ZAX, Math.PI / 4);

/**
 * One heart-shaped leaf with its long drip tip: its stalk meets the blade at (px, py, pz), the tip points along `d`
 * (unit), its face toward `n` (roughly). The blade a square turned to a diamond (its broad top the heart's), `s` m
 * long; the tip a thin blade half as long again.
 */
function leaf(b: VoxelBuilder, px: number, py: number, pz: number, dx: number, dy: number, dz: number, nx: number, ny: number, nz: number, s: number, color: number, shade: number, src: SourceTrace | undefined): void {
  // (its frame: y back along the leaf to the stalk, z its face)
  _y.set(-dx, -dy, -dz).normalize();
  _z.set(nx, ny, nz);
  _z.addScaledVector(_y, -_z.dot(_y));
  if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1).addScaledVector(_y, -_y.z);
  _z.normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  _q.setFromRotationMatrix(_m);
  const half = s * 0.5;
  const diag = half * Math.SQRT2;
  // The blade: centre a half-diagonal out from the stalk.
  _q2.copy(_q).multiply(DIAMOND);
  turned(b, px - _y.x * diag, py - _y.y * diag, pz - _y.z * diag, s, s, Math.max(0.012, s * 0.08), _q2, color, 'mapLeaf', shade, src);
  // The drip tip, on from the blade's far corner.
  const tl = s * 0.6;
  const at = diag * 2 + tl * 0.5 - s * 0.08;
  turned(b, px - _y.x * at, py - _y.y * at, pz - _y.z * at, Math.max(0.02, s * 0.14), tl, Math.max(0.01, s * 0.06), _q, color, 'mapLeaf', shade * 0.97, src);
}

// ── The sapling and the young tree (stages 0‥2) ─────────────────────────────

/** A bamboo stake beside the stem (x, z off it), `h` tall, tied to it at `tieY`; a saffron ribbon round both. */
function stake(b: VoxelBuilder, x: number, z: number, h: number, tieY: number, src: SourceTrace | undefined): void {
  b.box(x, h / 2, z, 0.03, h, 0.03, STAKE, 'mapBark', { src });
  for (let y = 0.3; y < h - 0.1; y += 0.32) b.box(x, y, z, 0.036, 0.018, 0.036, STAKE_NODE, 'mapBark', { src });
  b.box(x / 2, tieY, z / 2, Math.abs(x) + 0.06, 0.02, Math.abs(z) + 0.06, TIE, 'mapBark', { src });
  // (the ribbon: a turn of saffron cloth a little higher, its tail hanging)
  b.box(x / 2, tieY + 0.09, z / 2, Math.abs(x) + 0.08, 0.035, Math.abs(z) + 0.075, SAFFRON, 'petal', { src });
  b.box(x / 2 + 0.03, tieY - 0.01, z / 2 + 0.045, 0.03, 0.16, 0.012, SAFFRON, 'petal', { shade: 0.95, src });
}

/**
 * A slender stem with leaves on stalks (stages 0, 1): `h` tall, `n` leaves of `s` m from `from` up, every way round
 * (the golden angle), the newest at the top paler; `shoots` side shoots with their own few leaves.
 */
function sapling(b: VoxelBuilder, look: PlantLook, h: number, w: number, n: number, s: number, from: number, shoots: number): void {
  const r = rng(look, 11);
  const src = traceSource();
  const lean = (r() - 0.5) * 0.08;
  const sway = (r() - 0.5) * 0.08;
  // The stem: a few segments, a little crooked.
  const segs = Math.max(2, Math.round(h / 0.3));
  let px = 0;
  let pz = 0;
  for (let i = 0; i < segs; i++) {
    const y0 = (i / segs) * h;
    const y1 = ((i + 1) / segs) * h;
    const nx = lean * (y1 / h) + Math.sin(i * 1.7) * 0.012;
    const nz = sway * (y1 / h) + Math.cos(i * 1.3) * 0.012;
    rod(b, px, y0, pz, nx, y1, nz, w * (1 - (0.45 * i) / segs), look.dead ? pick(DEAD_WOOD, r()) : pick(STEM, r()), src);
    px = nx;
    pz = nz;
  }
  const at = (y: number): [number, number] => [lean * (y / h), sway * (y / h)];
  // Leaves on their long stalks, round and up the stem.
  let a = r() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const k = i / Math.max(1, n - 1);
    const y = from + (h - from) * k;
    a += 2.39996;
    const [sx, sz] = at(y);
    const top = i === n - 1;
    const stalk = s * (top ? 0.45 : 0.75);
    const ux = Math.sin(a);
    const uz = Math.cos(a);
    // (the stalk out and a little up; the blade hangs from it, its tip out and down: the top ones still unfolding, upright)
    const ex = sx + ux * stalk;
    const ey = y + stalk * 0.3;
    const ez = sz + uz * stalk;
    rod(b, sx, y, sz, ex, ey, ez, Math.max(0.008, s * 0.07), pick(STEM, r()), src, 'mapLeaf');
    const droop = top ? -0.2 : 0.55 + r() * 0.35 + look.droop * 0.35;
    const dx = ux * Math.cos(droop);
    const dy = -Math.sin(droop);
    const dz = uz * Math.cos(droop);
    const c = top && !look.droop ? pick(NEW_LEAF, r()) : pick(LEAF, r());
    leaf(b, ex, ey, ez, dx, dy, dz, ux * 0.3, 1, uz * 0.3, s * (top ? 0.75 : 0.9 + r() * 0.2), leafTone(c, look, r()), 0.9 + k * 0.15, src);
  }
  // Side shoots, each with a few leaves of its own.
  for (let j = 0; j < shoots; j++) {
    const y = h * (0.42 + 0.18 * j);
    const sa = a + j * 2.1 + r();
    const [sx, sz] = at(y);
    const len = h * (0.22 - 0.04 * j);
    const ex = sx + Math.sin(sa) * len;
    const ey = y + len * 0.7;
    const ez = sz + Math.cos(sa) * len;
    rod(b, sx, y, sz, ex, ey, ez, w * 0.55, pick(STEM, r()), src);
    for (let i = 0; i < 4; i++) {
      const t = 0.4 + i * 0.2;
      const lx = sx + (ex - sx) * t;
      const ly = y + (ey - y) * t;
      const lz = sz + (ez - sz) * t;
      const la = sa + (i % 2 ? 1.2 : -1.2) + (r() - 0.5) * 0.5;
      const ux = Math.sin(la);
      const uz = Math.cos(la);
      const droop = 0.5 + r() * 0.4 + look.droop * 0.35;
      leaf(b, lx + ux * s * 0.3, ly + s * 0.1, lz + uz * s * 0.3, ux * Math.cos(droop), -Math.sin(droop), uz * Math.cos(droop), ux * 0.3, 1, uz * 0.3, s * (0.85 + r() * 0.2), leafTone(pick(LEAF, r()), look, r()), 0.95, src);
    }
  }
}

// ── The crown, the trunk (stages 2‥4) ────────────────────────────────────────

/** A cluster of the crown: its middle (m), its radius, how flat (its height over its radius). */
type Cluster = readonly [x: number, y: number, z: number, r: number, flat: number];

/** The crown's ramp, deep shade → sunlit top: a fresher, lighter green than a mango's; the sun's sheen on its tops. */
const RAMP = [0x2f5a22, 0x3c6d2a, 0x4b8233, 0x5c963d, 0x70a84a, 0x88ba5c] as const;
const SUN = 0xc6d878;
/** The airy fringe: single leaves and tufts at the crown's edge and underside, pale and light (the bodhi's thin leaves glow). */
const FRINGE = [0x86b85a, 0x98c66a, 0x7aae4e, 0xa4cc74, 0x8fc062] as const;

/**
 * The crown (stages 3, 4): the union of the clusters' lumps as a volume of leaf cells (garden/models/_treeCrown.ts:
 * rough edges, merged leaf masses, cells off the grid and turned, sun on the tops, tufts), hollowed underneath so
 * the limbs show under the umbrella; then the bodhi's own: single heart-shaped leaves on long stalks hanging all
 * round its edge and from its underside, their drip tips down (`hang` of them: they flutter, `mapLeaf` sways), pale.
 */
function bodhiCrown(b: VoxelBuilder, look: PlantLook, P: TreeP, cl: readonly Cluster[], src: SourceTrace | undefined): void {
  const r = rng(look, 23);
  const seed = Math.round(look.seed * 997) + 7;
  const y0 = P.fork * 0.95;
  const cr = new Crown(P.cell, P.spread * 1.15, y0, P.h + 0.6, seed);
  for (const [x, y, z, rad, f] of cl) cr.blob(x, y, z, rad, rad * f, rad, 0.55);
  // (the hollow under the umbrella: its limbs show, he stands in its shade)
  const span = P.h - P.fork;
  cr.carve(0, P.fork + span * 0.2, 0, P.spread * 0.52, span * 0.17, P.spread * 0.52, 0.3);
  const fringeAt = (x: number, y: number, z: number) => FRINGE[Math.floor(hash3(Math.round(x * 3), Math.round(y * 3), Math.round(z * 3), seed + 5) * FRINGE.length) % FRINGE.length];
  cr.emit(b, {
    ramp: RAMP,
    seed,
    tufts: 0.34,
    tuft: 0.6,
    merge: 0.7,
    sun: SUN,
    paint: (c) => {
      // (the tufts at the edge and underneath: the pale fringe of single leaves)
      let col: number | null = null;
      if (c.tuft && (c.under || (c.exposure > 0.42 && c.t < 0.7))) col = fringeAt(c.x, c.y, c.z);
      if (look.droop) return leafTone(col ?? c.color, look, hash3(Math.round(c.x * 3), Math.round(c.y * 3), Math.round(c.z * 3), seed + 3));
      return col;
    },
  });
  // Single leaves hanging: half from the underside, half off the sides all round.
  const c = P.cell;
  const s0 = Math.min(0.44, 0.14 + P.h * 0.022);
  let put = 0;
  for (let tries = 0; tries < P.hang * 4 && put < P.hang; tries++) {
    const under = put % 2 === 0;
    const a = r() * Math.PI * 2;
    const ux = Math.sin(a);
    const uz = Math.cos(a);
    let x = 0;
    let y = Number.NaN;
    let z = 0;
    if (under) {
      const rr = Math.sqrt(0.15 + r() * 0.85) * P.spread * 1.05;
      x = ux * rr;
      z = uz * rr;
      y = cr.bottomAt(x, z) - c * 0.1;
    } else {
      // (in from outside at a height, to the first leaf cell: just outside it)
      const yy = y0 + c + r() * (P.h - y0 - 2 * c);
      const j = Math.floor((yy - y0) / c);
      for (let rr = P.spread * 1.15; rr > c; rr -= c * 0.5) {
        if (!cr.at(Math.round((ux * rr) / c), j, Math.round((uz * rr) / c))) continue;
        x = ux * (rr + c * 0.5);
        z = uz * (rr + c * 0.5);
        y = y0 + (j + 0.2) * c;
        break;
      }
    }
    if (!Number.isFinite(y)) continue;
    const tilt = under ? 0.15 + r() * 0.3 : 0.35 + r() * 0.35;
    const s = s0 * (0.85 + r() * 0.3);
    leaf(b, x, y, z, ux * tilt, -1, uz * tilt, ux, 0.25, uz, s, leafTone(pick(FRINGE, r()), look, r()), 1.04 + r() * 0.08, src);
    put++;
  }
}

interface TreeP {
  /** Height (m), the trunk's radius, where it forks, the crown's radius round the trunk. */
  readonly h: number;
  readonly trunk: number;
  readonly fork: number;
  readonly spread: number;
  /** The crown's lattice (m); limbs up into it; long low limbs (each on a crutch when `props`). */
  readonly cell: number;
  readonly limbs: number;
  readonly low: number;
  readonly props: boolean;
  /** Bands of cloth round the trunk; offerings at its foot (0 none, 1 the incense pot, 2 all); leaves hanging; flutes round the trunk. */
  readonly bands: number;
  readonly offer: 0 | 1 | 2;
  readonly hang: number;
  readonly flutes: number;
  /** Limbs that let down aerial-root strands (two each). */
  readonly strands: number;
}

const GREAT: TreeP = { h: 14, trunk: 0.62, fork: 3.3, spread: 6.6, cell: 0.86, limbs: 5, low: 2, props: true, bands: 5, offer: 2, hang: 80, flutes: 7, strands: 4 };
const YOUNG: TreeP = { h: 8, trunk: 0.26, fork: 2.1, spread: 3.8, cell: 0.62, limbs: 4, low: 0, props: false, bands: 2, offer: 1, hang: 40, flutes: 5, strands: 0 };
const SMALL: TreeP = { h: 3.6, trunk: 0.06, fork: 1.5, spread: 1.5, cell: 0.42, limbs: 4, low: 0, props: false, bands: 1, offer: 0, hang: 0, flutes: 0, strands: 0 };

/** A tree of stage 2‥4 by its measures. */
function tree(b: VoxelBuilder, look: PlantLook, P: TreeP): void {
  const r = rng(look, 31);
  const k = P.h / 14;
  const dead = look.dead;
  const bark = (u: number) => (dead ? pick(DEAD_WOOD, u) : pick(BARK, u));
  // ── The trunk: a stack of slightly crooked blocks, its flutes (fused stems) flaring into buttresses and roots ──
  let src = traceSource();
  const segH = Math.max(0.3, P.fork / 6);
  const segs = Math.ceil(P.fork / segH);
  const tx = (y: number) => Math.sin(y * 0.9 + look.seed * 6) * P.trunk * 0.12;
  const tz = (y: number) => Math.cos(y * 0.7 + look.seed * 4) * P.trunk * 0.1;
  for (let j = 0; j < segs; j++) {
    const y0 = j * segH;
    const y1 = Math.min(P.fork + P.trunk * 0.6, (j + 1) * segH + 0.02);
    const w = 2 * P.trunk * (1 - 0.1 * (j / segs));
    b.box(tx(y0), (y0 + y1) / 2, tz(y0), w, y1 - y0, w, bark(r()), 'mapBark', { shade: 0.95 + r() * 0.08, ry: (j % 2) * 0.785 * 0.5, src });
  }
  src = traceSource();
  const flute0 = r() * Math.PI * 2;
  for (let f = 0; f < P.flutes; f++) {
    const a = flute0 + (f / P.flutes) * Math.PI * 2 + (r() - 0.5) * 0.3;
    const ux = Math.sin(a);
    const uz = Math.cos(a);
    const tall = P.fork * (0.55 + r() * 0.35);
    for (let j = 0; j * segH < tall; j++) {
      const y0 = j * segH;
      const y1 = Math.min(tall, y0 + segH + 0.02);
      const ym = (y0 + y1) / 2;
      // (the buttress flares out toward the ground)
      const flare = P.trunk * 1.25 * Math.pow(Math.max(0, 1 - ym / (tall * 0.75)), 2);
      const out = P.trunk * 0.62 + flare * 0.5;
      const depth = P.trunk * 0.62 + flare;
      b.box(tx(ym) + ux * out, ym, tz(ym) + uz * out, P.trunk * 0.5, y1 - y0, depth, bark(r()), 'mapBark', { shade: 0.88 + r() * 0.1, ry: a, src });
    }
    // A root over the ground, out from the buttress, low and tapering.
    const rl = P.trunk * (2.4 + r() * 1.4);
    const r0 = P.trunk * 1.4;
    b.box(ux * (r0 + rl * 0.25), P.trunk * 0.22, uz * (r0 + rl * 0.25), P.trunk * 0.5, P.trunk * 0.44, rl * 0.5, bark(r()), 'mapBark', { shade: 0.86, ry: a, src });
    b.box(ux * (r0 + rl * 0.7), P.trunk * 0.12, uz * (r0 + rl * 0.7), P.trunk * 0.34, P.trunk * 0.24, rl * 0.45, bark(r()), 'mapBark', { shade: 0.84, ry: a + (r() - 0.5) * 0.3, src });
  }
  // (the crotch: where the limbs part, a swelling of the trunk)
  b.box(tx(P.fork), P.fork - P.trunk * 0.25, tz(P.fork), P.trunk * 2.25, P.trunk * 1.3, P.trunk * 2.25, pick(BARK, r()), 'mapBark', { shade: 0.97, ry: 0.4, src });
  b.box(tx(P.fork), P.fork + P.trunk * 0.2, tz(P.fork), P.trunk * 1.8, P.trunk * 0.9, P.trunk * 1.8, pick(BARK, r()), 'mapBark', { shade: 1, ry: 1.1, src });
  // ── The limbs: up and out from the trunk's top into the crown's clusters, each bending outward (no two alike);
  // long low ones reaching out nearly level ──
  src = traceSource();
  const clusters: Cluster[] = [];
  /** Where aerial-root strands hang from (on the limbs near the trunk: x, y, z each). */
  const strands: number[] = [];
  const fx = tx(P.fork);
  const fz = tz(P.fork);
  const a0 = r() * Math.PI * 2;
  for (let i = 0; i < P.limbs; i++) {
    const a = a0 + (i / P.limbs) * Math.PI * 2 + (r() - 0.5) * 0.5;
    const ux = Math.sin(a);
    const uz = Math.cos(a);
    // (sideways from its way out: a limb wanders a little)
    const sx = Math.cos(a);
    const sz = -Math.sin(a);
    const R = P.spread * (0.6 + r() * 0.06);
    const cy = P.h * (0.53 + r() * 0.04);
    const bx = fx + ux * P.trunk * 0.45;
    const by = P.fork - P.trunk * 0.5;
    const bz = fz + uz * P.trunk * 0.45;
    const w1 = (r() - 0.5) * 0.9 * k;
    const w2 = (r() - 0.5) * 1.1 * k;
    // Steep first, then out: three bends.
    const p1x = ux * R * 0.22 + sx * w1;
    const p1y = P.fork + (cy - P.fork) * 0.45;
    const p1z = uz * R * 0.22 + sz * w1;
    const p2x = ux * R * 0.58 + sx * w2;
    const p2y = P.fork + (cy - P.fork) * 0.8;
    const p2z = uz * R * 0.58 + sz * w2;
    const cx = ux * R;
    const cz = uz * R;
    const limbC = dead ? pick(DEAD_WOOD, r()) : pick(LIMB, r());
    const thick = P.trunk * (0.78 + r() * 0.12);
    rod(b, bx, by, bz, p1x, p1y, p1z, thick, bark(r()), src, 'mapBark', 1, a);
    rod(b, p1x, p1y, p1z, p2x, p2y, p2z, thick * 0.72, limbC, src, 'mapBark', 1, a);
    rod(b, p2x, p2y, p2z, cx, cy, cz, thick * 0.5, limbC, src, 'mapBark', 0.97, a);
    // (branchlets on toward the crown's outer side and its underside: they show under its edge)
    for (const s of [-1, 1]) {
      const ba = a + s * (0.55 + r() * 0.35);
      const bl = P.spread * (0.28 + r() * 0.08);
      rod(b, p2x, p2y, p2z, p2x + Math.sin(ba) * bl, p2y + bl * 0.15, p2z + Math.cos(ba) * bl, thick * 0.3, limbC, src, 'mapBark', 0.95);
    }
    rod(b, cx, cy, cz, cx + ux * P.spread * 0.28, cy + 0.2 * k, cz + uz * P.spread * 0.28, thick * 0.26, limbC, src, 'mapBark', 0.95);
    clusters.push([cx, cy, cz, P.spread * (0.44 + r() * 0.05), 0.4]);
    strands.push(p1x, p1y, p1z);
  }
  // The umbrella's dome over all, broad and low, and two bumps on top (no two trees the same outline).
  clusters.push([fx * 0.5, P.h * 0.65, fz * 0.5, P.spread * 0.8, 0.3]);
  for (let i = 0; i < 2; i++) {
    const a = a0 + 0.8 + i * 2.6 + r();
    clusters.push([Math.sin(a) * P.spread * 0.3, P.h * 0.74, Math.cos(a) * P.spread * 0.3, P.spread * 0.34, 0.5]);
  }
  // Long low limbs, between the others, out nearly level (sagging a little), each on a crutch.
  const propAt: [number, number, number, number][] = [];
  for (let i = 0; i < P.low; i++) {
    const a = a0 + ((i * 2 + 1) / P.limbs) * Math.PI + (r() - 0.5) * 0.3;
    const ux = Math.sin(a);
    const uz = Math.cos(a);
    const L = P.spread * (0.8 + r() * 0.08 - i * 0.1);
    const y0 = P.fork * 0.7;
    const y1 = P.fork * (1.05 + r() * 0.08);
    const bx = tx(y0) + ux * P.trunk * 0.6;
    const bz = tz(y0) + uz * P.trunk * 0.6;
    const mx = ux * L * 0.5;
    const mz = uz * L * 0.5;
    const my = (y0 + y1) / 2 - 0.1 * k;
    const limbC = dead ? pick(DEAD_WOOD, r()) : pick(LIMB, r());
    rod(b, bx, y0, bz, mx, my, mz, P.trunk * 0.6, bark(r()), src, 'mapBark', 1, a);
    rod(b, mx, my, mz, ux * L, y1, uz * L, P.trunk * 0.42, limbC, src, 'mapBark', 1, a);
    // (its end turns up into a cluster of its own; a branchlet off it)
    rod(b, ux * L, y1, uz * L, ux * L * 0.95, P.h * 0.46, uz * L * 0.95, P.trunk * 0.3, limbC, src);
    rod(b, mx, my, mz, mx + Math.cos(a) * L * 0.3, my + 0.9 * k, mz - Math.sin(a) * L * 0.3, P.trunk * 0.24, limbC, src);
    clusters.push([ux * L * 0.92, P.h * 0.5, uz * L * 0.92, P.spread * 0.36, 0.42]);
    strands.push(bx + (mx - bx) * 0.45, y0 + (my - y0) * 0.45, bz + (mz - bz) * 0.45);
    // (the crutch under it, three quarters out: its top just under the limb)
    const pt = 0.5;
    const px = mx + (ux * L - mx) * pt;
    const pz = mz + (uz * L - mz) * pt;
    const py = my + (y1 - my) * pt - P.trunk * 0.21;
    propAt.push([px, py, pz, a]);
  }
  // ── The crown ──
  src = traceSource();
  if (!dead) bodhiCrown(b, look, P, clusters, src);
  else for (const [cx, cy, cz] of clusters) b.box(cx, cy - 0.2, cz, 0.3 * k + 0.1, 0.12, 0.25 * k + 0.1, pick(DEAD_LEAF, r()), 'mapLeaf', { src });
  // ── Aerial-root strands: thin, hanging from the limbs near the trunk, a few reaching the ground and thickening ──
  if (P.strands > 0) {
    src = traceSource();
    for (let q = 0; q < strands.length / 3 && q < P.strands; q++) {
      const sx = strands[q * 3];
      const sy = strands[q * 3 + 1];
      const sz = strands[q * 3 + 2];
      for (let w = 0; w < 2; w++) {
        const ox = sx + (r() - 0.5) * 0.5 * k;
        const oz = sz + (r() - 0.5) * 0.5 * k;
        const reach = r() < 0.45;
        const ey = reach ? 0 : sy * (0.25 + r() * 0.35);
        const my = (sy + ey) / 2;
        const wx = ox + (r() - 0.5) * 0.18;
        const wz = oz + (r() - 0.5) * 0.18;
        const th = reach ? 0.08 * k + 0.025 : 0.05 * k + 0.02;
        const c = dead ? DEAD_WOOD[0] : mix(pick(LIMB, r()), 0x6e604c, 0.35);
        rod(b, ox, sy, oz, wx, my, wz, th, c, src);
        rod(b, wx, my, wz, ox + (r() - 0.5) * 0.1, ey, oz + (r() - 0.5) * 0.1, th * (reach ? 1.3 : 0.8), mix(c, 0xb0a490, 0.25), src);
      }
    }
  }
  // ── Crutches under the long limbs: old posts with a fork at the top, set on a flat stone ──
  if (P.props) {
    src = traceSource();
    for (const [px, py, pz, a] of propAt) {
      const c = pick(PROP, r());
      const w = 0.16;
      b.box(px, py / 2 - 0.12, pz, w, py - 0.24, w, c, 'mapBark', { ry: a, src });
      // (the fork: two short arms up either side of the limb)
      for (const s of [-1, 1]) {
        // (tilted about the limb's line, out to its side)
        _q.setFromAxisAngle(_b.set(Math.sin(a), 0, Math.cos(a)), -s * 0.42);
        turned(b, px + Math.cos(a) * s * 0.11, py - 0.1, pz - Math.sin(a) * s * 0.11, w * 0.8, 0.42, w * 0.8, _q, c, 'mapBark', 0.95, src);
      }
      b.box(px, 0.05, pz, 0.42, 0.1, 0.38, 0x8e8a80, 'mapStone', { ry: a + 0.3, src });
      // (a strip of saffron cloth tied round the crutch: an offering too)
      b.box(px, py * 0.55, pz, w + 0.05, 0.1, w + 0.05, SAFFRON, 'petal', { ry: a, src });
    }
  }
  // ── Cloth round the trunk: bands, the tails of the knots hanging in front ──
  if (!dead && P.bands > 0) {
    src = traceSource();
    const w = 2 * P.trunk + P.trunk * 0.5;
    for (let i = 0; i < P.bands; i++) {
      const y = Math.max(0.85, P.trunk * 2) + i * Math.max(0.14, P.trunk * 0.3) + (i > 2 ? P.trunk * 0.4 : 0);
      const c = CLOTH[i % CLOTH.length];
      const th = Math.max(0.05, P.trunk * 0.26);
      b.box(tx(y), y, tz(y), w, th, w, c, 'petal', { shade: 1, src });
      b.box(tx(y), y, tz(y), w * 0.98, th * 0.96, w * 0.98, c, 'petal', { shade: 0.96, ry: Math.PI / 4, src });
      if (i < 3) {
        // (the tail: from the knot in front, down a hand or two, turned a little)
        const tl = P.trunk * (1.6 + i * 0.5);
        b.box(tx(y) + (i - 1) * P.trunk * 0.35, y - tl / 2, tz(y) + w * 0.5 + 0.02, Math.max(0.05, P.trunk * 0.24), tl, 0.03, c, 'petal', { shade: 0.95, rz: (i - 1) * 0.08, src });
      }
    }
  }
  // ── At its foot, in front: the incense pot (its sticks), candles, marigolds ──
  if (!dead && P.offer > 0) {
    src = traceSource();
    const oz = P.trunk * 1.25 + 0.42;
    const ox = P.trunk * 0.25;
    b.box(ox, 0.11, oz, 0.24, 0.22, 0.24, POT, 'mapStone', { src });
    b.box(ox, 0.21, oz, 0.27, 0.04, 0.27, mix(POT, 0xffffff, 0.15), 'mapStone', { src });
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26 + r() * 0.3;
      const sx = ox + Math.sin(a) * 0.05;
      const sz = oz + Math.cos(a) * 0.05;
      b.box(sx, 0.36, sz, 0.014, 0.3, 0.014, INCENSE, 'petal', { rx: Math.cos(a) * 0.12, rz: -Math.sin(a) * 0.12, src });
      b.box(sx + Math.sin(a) * 0.02, 0.52, sz + Math.cos(a) * 0.02, 0.02, 0.03, 0.02, 0xf05a20, 'petal', { src });
    }
    if (P.offer > 1) {
      for (const s of [-1, 1]) {
        b.box(ox + s * 0.32, 0.12, oz - 0.02, 0.05, 0.24, 0.05, CANDLE, 'petal', { src });
        b.box(ox + s * 0.32, 0.26, oz - 0.02, 0.02, 0.04, 0.02, 0xf2a030, 'petal', { src });
      }
      // (a heap of marigolds on a banana leaf)
      b.box(ox - 0.62, 0.025, oz + 0.05, 0.42, 0.03, 0.3, 0x5a8a34, 'mapLeaf', { ry: 0.3, src });
      for (let i = 0; i < 6; i++) b.box(ox - 0.62 + (r() - 0.5) * 0.28, 0.08 + (i > 3 ? 0.06 : 0), oz + 0.05 + (r() - 0.5) * 0.18, 0.1, 0.08, 0.1, pick(MARIGOLD, r()), 'petal', { src });
    }
  }
}

/**
 * The small young tree (stage 2): a thin grey stem forking at 1.5 m into a few slender limbs, each with twigs of
 * single heart-shaped leaves on their long stalks (a young bodhi's crown is open: the light comes through), a small
 * tuft at each twig's end; a saffron band round the stem; still tied to its stake.
 */
function youngSmall(b: VoxelBuilder, look: PlantLook): void {
  const r = rng(look, 41);
  const src = traceSource();
  const P = SMALL;
  const stemC = look.dead ? DEAD_WOOD[0] : pick(BARK, r());
  const lean = (r() - 0.5) * 0.12;
  rod(b, 0, 0, 0, lean, P.fork, lean * 0.5, P.trunk * 2, stemC, src);
  const a0 = r() * Math.PI * 2;
  const leafS = 0.2;
  for (let i = 0; i < P.limbs + 1; i++) {
    // (the leader up the middle, the others out and up)
    const up = i === P.limbs;
    const a = a0 + (i / P.limbs) * Math.PI * 2 + (r() - 0.5) * 0.6;
    const reach = up ? 0.15 : P.spread * (0.62 + r() * 0.12);
    const ex = lean + Math.sin(a) * reach;
    const ey = up ? P.h * 0.97 : P.h * (0.74 + r() * 0.1);
    const ez = lean * 0.5 + Math.cos(a) * reach;
    const sx = lean;
    const sy = P.fork - 0.05;
    const sz = lean * 0.5;
    rod(b, sx, sy, sz, ex, ey, ez, P.trunk * (up ? 1.2 : 1.0), look.dead ? DEAD_WOOD[1] : pick(LIMB, r()), src);
    if (look.dead) continue;
    // Twigs along it, each with its leaves hanging round it and a small tuft at its end.
    for (const t of [0.42, 0.68, 0.94]) {
      const tx = sx + (ex - sx) * t;
      const ty = sy + (ey - sy) * t;
      const tz = sz + (ez - sz) * t;
      const ta = a + (r() - 0.5) * 1.6;
      const tl = 0.28 + r() * 0.12;
      const wx = tx + Math.sin(ta) * tl;
      const wy = ty + tl * 0.35;
      const wz = tz + Math.cos(ta) * tl;
      rod(b, tx, ty, tz, wx, wy, wz, 0.022, pick(LIMB, r()), src);
      b.box(wx, wy + 0.04, wz, 0.34, 0.26, 0.32, leafTone(pick(LEAF, r()), look, r()), 'mapLeaf', { shade: 0.95 + r() * 0.1, ry: r() * 1.5, src });
      for (let j = 0; j < 5; j++) {
        const la = ta + (j / 5) * Math.PI * 2 + r() * 0.5;
        const ux = Math.sin(la);
        const uz = Math.cos(la);
        const k = 0.3 + (j / 5) * 0.6;
        const px = tx + (wx - tx) * k + ux * 0.05;
        const py = ty + (wy - ty) * k;
        const pz = tz + (wz - tz) * k + uz * 0.05;
        const droop = 0.6 + r() * 0.5 + look.droop * 0.3;
        leaf(b, px, py, pz, ux * Math.cos(droop), -Math.sin(droop), uz * Math.cos(droop), ux * 0.3, 1, uz * 0.3, leafS * (0.85 + r() * 0.3), leafTone(pick(LEAF, r()), look, r()), 0.9 + (ty / P.h) * 0.15, src);
      }
    }
  }
  // (the saffron band on the stem, its tail)
  b.box(lean * 0.4, 0.9, lean * 0.2, 0.2, 0.06, 0.2, SAFFRON, 'petal', { src });
  b.box(lean * 0.4 + 0.03, 0.78, lean * 0.2 + 0.11, 0.045, 0.22, 0.015, SAFFRON, 'petal', { shade: 0.95, src });
  // (still on its stake, tied)
  stake(b, 0.09, -0.04, 1.3, 1.0, src);
}

registerModel('bodhi', (b, look) => {
  if (look.stage === 0) {
    // The sapling just planted: earth firmed round it, its stake and ribbon.
    const src = traceSource();
    b.box(0, 0.035, 0, 0.42, 0.07, 0.42, EARTH, 'mapRock', { src });
    b.box(0, 0.06, 0, 0.26, 0.06, 0.26, mix(EARTH, 0x000000, 0.15), 'mapRock', { ry: 0.6, src });
    sapling(b, look, 0.72, 0.024, 7, 0.15, 0.24, 0);
    stake(b, 0.07, -0.03, 0.82, 0.42, src);
    return;
  }
  if (look.stage === 1) {
    sapling(b, look, 1.6, 0.038, 13, 0.19, 0.45, 2);
    stake(b, 0.08, -0.035, 1.35, 0.85, traceSource());
    return;
  }
  if (look.stage === 2) {
    youngSmall(b, look);
    return;
  }
  tree(b, look, look.stage === 3 ? YOUNG : GREAT);
});
