import { hash3 } from '../../voxel/random';
import { coursesOf, DryMasonry, FACE, spansOf, type Box6, type Ledge, type StoneLook } from '../lib/gallery';
import { commitGrass, ghostGround, GRASS_TONES, grassGrid, grassTuft, plusTuft, type GrassTones } from '../lib/grass';
import { BARK, LEAF, SANDSTONE, SOIL } from '../palette';
import type { PieceBuilder } from '../PieceBuilder';
import { placePiece, type Placement } from '../place';
import { here, rng, snap, TEXEL } from '../shapes';
import { soilSurf } from '../surface';
import type { KitPiece } from '../types';

/**
 * Shared parts of the §19 gallery usage examples (the sandstone gallery court,
 * the weathered gallery wall): paving and steps laid dry like the façades, a
 * prasat stand-in for the towers of later sections, hanging vines, grass in
 * the joints, and setting kit pieces into the scene.
 */

const T = TEXEL;
/** The dark in the joints (as in lib/gallery). */
const JOINT = SANDSTONE.cavity[1];
/**
 * Paving stands a quarter texel proud of y = 0: the walkable kit level lays
 * its lawn under every scene with its top at y = 0, and slabs flush with it
 * would flicker against the grass.
 */
export const PAVE = T / 4;

/** Is the point inside the box? */
const inBox = (b: Box6, x: number, y: number, z: number) => x > b[0] && x < b[3] && y > b[1] && y < b[4] && z > b[2] && z < b[5];

/**
 * Put a kit piece into the scene. Blocks whose centre lies inside one of
 * `cut` (stone the piece grows into) are dropped — they'd be hidden, and their
 * faces would flicker against the stone's.
 */
export function place(p: PieceBuilder, piece: KitPiece | null, at: Placement, cut: readonly Box6[] = []): void {
  if (!piece) return;
  const b0 = p.voxels.boxes.length;
  placePiece({ voxels: p.voxels, collider: (c) => p.colliders.push(c), extra: (o) => p.extras.push(o) }, piece, at);
  if (!cut.length) return;
  const boxes = p.voxels.boxes;
  let w = b0;
  for (let n = b0; n < boxes.length; n++) if (!cut.some((c) => inBox(c, boxes[n].x, boxes[n].y, boxes[n].z))) boxes[w++] = boxes[n];
  boxes.length = w;
}

export interface PavingOptions {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Depth of a row of slabs along z (default 0.75 m). */
  row?: number;
  /** Slab length range along x (default 0.5–1.25 m). */
  length?: [number, number];
  /** Look of the slab centred at (x, z). */
  look: (x: number, z: number) => StoneLook;
  /** Chance (0‥1) that the slab at (x, z) is gone: soil and grass show in the gap. */
  missing?: (x: number, z: number) => number;
  /** Chance (0‥1) of a grass tuft in the joint at (x, z). */
  grass?: (x: number, z: number) => number;
  /** Colour seen in the joints (default the walls' dark; paving reads better a shade softer). */
  bed?: number;
  seed: number;
}

/**
 * A paved court: rows of 0.25 m slabs in running bond, each a texel short of
 * its neighbours, the joints filled flush with dark (so they read as the
 * sheets' dark lines, and no ground under the court shows through them); a
 * slab gone here and there leaves soil and grass, and tufts root in the
 * joints. Top at y = 0 (see PAVE), one collider.
 */
export function paving(p: PieceBuilder, o: PavingOptions): void {
  const r = rng(o.seed);
  const row = o.row ?? 0.75;
  const [l0, l1] = o.length ?? [0.5, 1.25];
  const v = p.voxels;
  const src = here();
  const bed = o.bed ?? JOINT;
  const joint = (x0: number, z0: number, x1: number, z1: number) => v.span(x0, -0.25, z0, x1, PAVE, z1, bed, 'sandstone', { open: 4, src });
  const tufts: [number, number, number][] = [];
  for (let z = o.z0, n = 0; z < o.z1 - 1e-6; z += row, n++) {
    const zb = Math.min(o.z1, snap(z + row));
    const gz = zb < o.z1 - 1e-6 ? T : 0;
    // The row's slabs (alternate rows start with a part slab).
    const slabs: { x: number; xe: number; lost: boolean }[] = [];
    let x = o.x0;
    const part = n % 2 ? snap(((l0 + l1) / 4) * (0.8 + 0.4 * hash3(n, 1, 3, o.seed))) : 0;
    if (part > 0) slabs.push({ x, xe: (x += part), lost: false });
    for (let i = 0; x < o.x1 - 1e-6; i++) {
      let len = snap(l0 + (l1 - l0) * hash3(n, i, 7, o.seed));
      if (o.x1 - (x + len) < l0 * 0.5) len = o.x1 - x;
      const xe = x + len;
      slabs.push({ x, xe, lost: !!o.missing && r() < o.missing((x + xe) / 2, (z + zb) / 2) });
      x = xe;
    }
    slabs.forEach((sl, i) => {
      const last = i === slabs.length - 1;
      const gx = last ? 0 : T;
      const [cx, cz] = [(sl.x + sl.xe) / 2, (z + zb) / 2];
      if (sl.lost) {
        // A lost slab: the soil under it, a hand lower, grassed over.
        v.span(sl.x, -0.4, z, sl.xe, -0.125, zb, SOIL.dirt[i % SOIL.dirt.length], 'soil', { surf: soilSurf({ grass: 0.85, moss: 0.3 }), src });
        if (r.chance(0.7)) tufts.push([cx + r.range(-0.15, 0.15), -0.125, cz + r.range(-0.15, 0.15)]);
        return;
      }
      const lk = o.look(cx, cz);
      v.span(sl.x, -0.25, z, sl.xe - gx, PAVE, zb - gz, lk.color, 'sandstone', { shade: lk.shade, surf: lk.surf, src });
      if (!last && !slabs[i + 1].lost) joint(sl.xe - T, z, sl.xe, zb - gz);
      if (o.grass && gx && r() < o.grass(sl.xe, cz)) tufts.push([sl.xe - T / 2, 0, snap(r.range(z + 0.1, zb - 0.1)) + T / 2]);
      if (o.grass && gz && r() < o.grass(cx, zb) * 0.5) tufts.push([snap(r.range(sl.x + 0.1, sl.xe - 0.1)) + T / 2, 0, zb - T / 2]);
    });
    // The joint to the next row (not along the lost slabs).
    if (gz) for (const [a, b] of spansOf(o.x0, o.x1, slabs.filter((sl) => sl.lost).map((sl) => [sl.x, sl.xe]))) joint(a, zb - T, b, zb);
  }
  p.collider(o.x0, -0.25, o.z0, o.x1, PAVE, o.z1);
  tuftsAt(p, tufts, { seed: o.seed + 5, height: [2, 5] });
}

/**
 * Grass tufts rooted at points (x, ground y, z) — joints, the foot of a wall,
 * the gap of a lost slab — in one texel grid: most the sheets' short "+"
 * tufts, some fuller fans.
 */
export function tuftsAt(p: PieceBuilder, at: readonly [number, number, number][], o: { seed: number; height?: [number, number]; tones?: GrassTones; full?: number }): void {
  if (!at.length) return;
  const r = rng(o.seed);
  const [h0, h1] = o.height ?? [2, 5];
  const ox = snap(Math.min(...at.map((a) => a[0]))) - 1;
  const oz = snap(Math.min(...at.map((a) => a[2]))) - 1;
  const g = grassGrid(p, [ox, 0, oz], o.seed);
  for (const [x, y, z] of at) {
    const i = Math.floor((x - ox) / T);
    const k = Math.floor((z - oz) / T);
    const j = Math.round(y / T);
    ghostGround(g, i - 2, k - 2, i + 2, k + 2, j);
    const tones = o.tones ?? (r.chance(0.6) ? GRASS_TONES.meadow : GRASS_TONES.lawn);
    if (r.chance(o.full ?? 0.35)) grassTuft(g, i, k, { j, height: r.int(h0 + 1, h1 + 1), radius: r.pick([1, 1.4]), arms: 0.4, seed: r.int(1, 1e6), tones });
    else plusTuft(g, i, k, { j, height: r.int(h0, h1), seed: r.int(1, 1e6), tones });
  }
  commitGrass(p, g, { seed: o.seed });
}

export interface FlightOptions {
  x0: number;
  x1: number;
  /** Height of the foot (default 0). */
  y0?: number;
  /** Front edge of the lowest step; the flight climbs towards −z. */
  zFoot: number;
  /** Where the steps run back to (the wall or terrace behind them). */
  zBack: number;
  n: number;
  /** Riser and tread (default 0.25 × 0.35 m). */
  rise?: number;
  run?: number;
  look: (x: number, y: number, z: number) => StoneLook;
  length?: [number, number];
  /** Faces the steps abut (FACE bits; default the ground and the wall behind). */
  closed?: number;
}

/**
 * A flight of steps (or a stepped terrace) laid dry: each step a course of
 * stones running back to `zBack`, one collider per step (walkable: risers
 * ≤ 0.25 m). Returns the treads, for moss and grass.
 */
export function flight(m: DryMasonry, p: PieceBuilder, o: FlightOptions): Ledge[] {
  const rise = o.rise ?? 0.25;
  const run = o.run ?? 0.35;
  const y0 = o.y0 ?? 0;
  const ledges: Ledge[] = [];
  for (let k = 0; k < o.n; k++) {
    const y = y0 + k * rise;
    const front = snap(o.zFoot - k * run);
    const stones = m.course([o.x0, y, o.zBack, o.x1, y + rise, front], { length: o.length ?? [0.75, 1.5], row: k, closed: o.closed ?? FACE.ny | FACE.nz, look: o.look });
    p.collider(o.x0, y0, o.zBack, o.x1, y + rise, front);
    ledges.push({ x0: o.x0, x1: o.x1, y: y + rise, z0: k < o.n - 1 ? snap(o.zFoot - (k + 1) * run) : o.zBack, z1: front, joints: stones.slice(0, -1).map((s) => s.box[3]) });
  }
  return ledges;
}

export interface TowerOptions {
  /** Centre of the foot and the ground it stands on. */
  x: number;
  y: number;
  z: number;
  /** Footprint of the body (metres). */
  w: number;
  d: number;
  /** Ground to the tip of the finial. */
  height: number;
  look: (x: number, y: number, z: number) => StoneLook;
  /** Height where the body gives way to the tiers (default half the height). */
  body?: number;
}

/**
 * A prasat stand-in (the towers of §05 / §14 aren't built yet), laid dry: a
 * tall body, then tiers stepping in — each a band of stones with a dark niche
 * on its front and a projecting cornice crowned by antefix blocks at its
 * corners and middle — up to a lotus-bud finial. The sheets' bumpy, stepped
 * silhouette. Adds its collider.
 */
export function tower(m: DryMasonry, p: PieceBuilder, o: TowerOptions): void {
  const { x, z, look } = o;
  const top = o.y + o.height;
  let y = o.y;
  let hw = snap(o.w / 2);
  let hd = snap(o.d / 2);
  const body = snap(o.body ?? o.height / 2, 0.25);
  // A band of courses; with `holeW`, its middle courses leave a dark niche (a false window) on
  // the front. `capped`: a wider course covers its top.
  const band = (y0: number, y1: number, holeW: number, row: number, capped = true) => {
    const hs = coursesOf(y1 - y0);
    const hole: [number, number][] = [[x - holeW / 2, x + holeW / 2]];
    let [n0, n1] = [Infinity, -Infinity];
    let yy = y0;
    hs.forEach((h, i) => {
      const inHole = holeW > 0 && i > 0 && i < hs.length - 1;
      const closed = FACE.ny | (capped || i < hs.length - 1 ? FACE.py : 0);
      for (const [a, b] of spansOf(x - hw, x + hw, inHole ? hole : [])) m.course([a, yy, z - hd, b, yy + h, z + hd], { length: [0.5, 1.25], row: row + i, closed, look });
      if (inHole) {
        // The niche's back; its sides are the stones around it.
        m.course([x - holeW / 2, yy, z - hd, x + holeW / 2, yy + h, z + hd - 0.25], { length: [2, 2], closed: FACE.ny | FACE.py, look });
        [n0, n1] = [Math.min(n0, yy), Math.max(n1, yy + h)];
      }
      yy += h;
    });
    if (n1 > n0) p.voxels.span(x - holeW / 2, n0, z + hd - 0.25, x + holeW / 2, n1, z + hd - T, JOINT, 'sandstone', { shade: 0.5, open: 16, src: here() });
  };
  // Base: two courses, a quarter metre wider each.
  m.course([x - hw - 0.5, y, z - hd - 0.5, x + hw + 0.5, y + 0.5, z + hd + 0.5], { length: [0.75, 1.5], look });
  m.course([x - hw - 0.25, y + 0.5, z - hd - 0.25, x + hw + 0.25, y + 1, z + hd + 0.25], { length: [0.75, 1.5], row: 1, look });
  y += 1;
  band(y, body, 0, 0);
  y = body;
  // Tiers stepping in, faster towards the top (the lotus bud).
  const tiers = Math.max(3, Math.round((top - y - 1.5) / 1.4));
  const th = (top - y - 1.5) / tiers;
  for (let t = 0; t < tiers; t++) {
    const bodyH = Math.max(0.5, snap(th - 0.25, 0.125));
    // Cornice: a projecting course (its underside open), antefixes on its corners and mid-sides.
    m.course([x - hw - 0.25, y, z - hd - 0.25, x + hw + 0.25, y + 0.25, z + hd + 0.25], { length: [0.75, 1.5], closed: 0, look });
    const ah = t < tiers - 1 ? 0.5 : 0.375;
    const aw = hw > 1.2 ? 0.25 : 0.1875;
    for (const [ux, uz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const cx = snap(x + ux * (hw + 0.25 - aw));
      const cz = snap(z + uz * (hd + 0.25 - aw));
      m.course([cx - aw, y + 0.25, cz - aw, cx + aw, y + 0.25 + ah, cz + aw], { length: [2, 2], look });
    }
    y += 0.25;
    hw = Math.max(0.5, snap(hw * (t < tiers - 2 ? 0.8 : 0.66), 0.125));
    hd = Math.max(0.5, snap(hd * (t < tiers - 2 ? 0.8 : 0.66), 0.125));
    band(y, y + bodyH, hw > 1 ? snap(Math.min(1, hw * 0.5)) : 0, t + 1, t < tiers - 1);
    y += bodyH;
  }
  // Lotus-bud finial.
  m.course([x - 0.5, y, z - 0.5, x + 0.5, y + 0.5, z + 0.5], { length: [2, 2], look });
  m.course([x - 0.375, y + 0.5, z - 0.375, x + 0.375, y + 0.875, z + 0.375], { length: [2, 2], look });
  m.course([x - 0.1875, y + 0.875, z - 0.1875, x + 0.1875, y + 1.25, z + 0.1875], { length: [2, 2], look });
  p.collider(x - o.w / 2 - 0.5, o.y, z - o.d / 2 - 0.5, x + o.w / 2 + 0.5, top, z + o.d / 2 + 0.5);
}

/** Hanging vines and creepers: yellow-green strands with leaf clusters. */
const VINE = [0x8a9c34, 0x7a8e30, 0x6f8a33, BARK.vine[0], BARK.vine[1]] as const;

/**
 * Vines hanging down a wall face at z (facing +z) from `top`: `n` strands
 * spread over x0‥x1, each a texel stem 0.6–3 m long that kinks a texel
 * sideways now and then, leaves sprouting on alternate sides (bigger and
 * denser near the top), and a leafy clump where it hangs from the ledge.
 */
export function vines(p: PieceBuilder, o: { x0: number; x1: number; top: number; z: number; n: number; seed: number; floor?: number }): void {
  const r = rng(o.seed);
  const v = p.voxels;
  const src = here();
  for (let s = 0; s < o.n; s++) {
    let x = snap(r.range(o.x0, o.x1));
    const len = Math.min(o.top - (o.floor ?? 0.3), snap(r.range(0.6, 3)));
    const c = VINE[r.int(0, VINE.length - 1)];
    let y = o.top;
    let side = r.chance(0.5) ? 1 : -1;
    while (y > o.top - len) {
      // A run of stem, then a kink one texel over.
      const run = Math.min(y - (o.top - len), snap(r.range(0.25, 0.7)));
      v.span(x, y - run, o.z, x + T, y, o.z + T, c, 'leaves', { shade: 0.9, src });
      for (let ly = y - r.range(0.05, 0.15); ly > y - run; ly -= r.range(0.12, 0.3)) {
        const yy = snap(ly);
        const big = (o.top - yy) / len < 0.4 && r.chance(0.6);
        const lx = side > 0 ? x + T : x - (big ? 3 : 2) * T;
        v.span(lx, yy - (big ? T : 0), o.z, lx + (big ? 3 : 2) * T, yy + T, o.z + (big ? 2 : 1) * T, r.pick(LEAF.jungle), 'leaves', { shade: r.range(0.9, 1.1), src });
        side = -side;
      }
      y -= run;
      x += r.chance(0.5) ? T : -T;
    }
    // A leafy clump where it hangs from the ledge.
    v.span(x - 2 * T, o.top, o.z - T, x + 3 * T, o.top + 2 * T, o.z + 2 * T, r.pick(LEAF.jungle), 'leaves', { src });
  }
}

/** Moss tones on the ground: olive to the sheets' bright yellow-green. */
const GROUND_MOSS = [0x607339, 0x6d833f, 0x788741, 0x8a9a3e, 0x495d30] as const;

/**
 * Moss creeping out from the foot of a wall along x0‥x1 (the wall's face at
 * z, facing +z): cushions a texel or two thick reaching 0.1–0.6 m onto the
 * ground at y, with lumps, where `amount` (0‥1 along x) says.
 */
export function footMoss(p: PieceBuilder, o: { x0: number; x1: number; y?: number; z: number; amount: (x: number) => number; seed: number }): void {
  const r = rng(o.seed);
  const v = p.voxels;
  const src = here();
  const y = o.y ?? 0;
  // (cushions side by side, never overlapping: overlapping tops would flicker)
  for (let x = o.x0 + r.range(0, 0.3); x < o.x1 - 0.2; x += r.range(0.2, 0.6)) {
    if (!r.chance(o.amount(x))) continue;
    const xa = snap(x);
    const len = snap(r.range(0.25, 0.8));
    const d = snap(r.range(0.125, 0.6));
    x = xa + len;
    const c = () => GROUND_MOSS[r.int(0, GROUND_MOSS.length - 1)];
    v.span(xa, y, o.z, xa + len, y + T, o.z + d, c(), 'leaves', { src });
    // Thicker against the wall, a lump or two further out.
    v.span(xa + T, y + T, o.z, xa + len - T, y + 2 * T, o.z + Math.min(d - T, 3 * T), c(), 'leaves', { shade: 1.05, src });
    if (d > 3 * T && r.chance(0.6)) {
      const lx = snap(xa + r.range(0, len - 2 * T));
      const lz = snap(o.z + r.range(2 * T, d - T));
      v.span(lx, y + T, lz - T, lx + 2 * T, y + 2 * T, lz + T, c(), 'leaves', { shade: 1.1, src });
    }
  }
}
