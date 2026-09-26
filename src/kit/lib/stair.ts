import { PieceBuilder } from '../PieceBuilder';
import { here, rng, snap, TEXEL } from '../shapes';
import type { StoneFinish } from '../surface';
import type { KitPiece } from '../types';
import { coursesOf, DryMasonry, FACE, finishLook, overgrow, type Box6, type Ledge } from './gallery';
import { keyPanel } from './roof';

/**
 * Stair flights — the temple's stone stairs (§21.2 ④, used by the §16 terrace
 * stair and the §21.3 terrace, gopura and causeway modules): a flight of steps
 * between cheek walls that step down with it in tiers, laid dry like the
 * walls (one stone per block, running bond, every joint a dark line), with one
 * collider per step so the explorer (0.42 m step-up) climbs it.
 *
 * Placement contract (piece space, before `at`):
 *  - The flight climbs towards −Z. Its foot — the front edge of the lowest
 *    riser — is at z = +depth/2, its back at z = −depth/2; set the back
 *    against a terrace face and the top tread is level with the terrace top.
 *  - y = 0 is the ground at the foot, the top tread is at y = height
 *    (= steps × rise).
 *  - The clear flight spans x = ±width/2; the cheek walls stand outside it to
 *    x = ±(width/2 + cheek), their plinth and coping mouldings a texel
 *    further. Each cheek tier's top stands `above` over its highest tread
 *    (the stair head's pedestals, where the lions stand); `pedestal` runs the
 *    lowest tier on in front of the foot.
 *  - Treads face +Z. To face another way, build it with {@link stairPiece}
 *    and put it in with `placePiece(…, { turn })` (src/kit/place.ts).
 *
 * Real stairs (SIZES-ARCH §1.9): ordinary 0.25 m risers on 0.3125 m treads
 * (terraces, causeway ends); steep temple stairs 0.25 / 0.25 (45°); the
 * Bakan's 40 steps of ≈ 0.31 m at 70°, in game 0.3125 / 0.1875 (59°).
 *
 * @example
 * // A 1.5 m terrace stair whose back meets a terrace face at z = −4:
 * const o = { finish: STONE_FINISH.warm, seed, height: 1.5 };
 * stairFlight(p, { ...o, at: [0, 0, -4 + stairLayout(o).depth / 2] });
 * // A steep 3.25 m flight climbing towards +X instead (turned a quarter):
 * placePiece({ voxels: p.voxels, collider: (c) => p.colliders.push(c) }, stairPiece({ ...o, ...STAIR.steep, height: 3.25, width: 2.5 }), { x: 6, y: 0, z: 0, turn: 3 });
 */

/** Riser and tread of the kit's stair types (metres). */
export const STAIR = {
  /** Terraces, causeway ends, libraries: 0.25 / 0.3125 (39°). */
  ordinary: { rise: 0.25, tread: 0.3125 },
  /** Temple stairs between the levels, gopura porches: 0.25 / 0.25 (45°). */
  steep: { rise: 0.25, tread: 0.25 },
  /** The Bakan's stairs, eased for play: 0.3125 / 0.1875 (59°; the real ones are 70°). */
  bakan: { rise: 0.3125, tread: 0.1875 },
} as const;

/** The explorer steps up at most 0.42 m: risers are kept to 6 texels. */
const MAX_RISE = 0.375;
const T = TEXEL;

export interface StairOptions {
  finish: StoneFinish;
  seed: number;
  /** Clear width of the flight between the cheek walls (default 3.0 m). */
  width?: number;
  /** Riser height (default 0.25 m), snapped to the texel and kept ≤ 0.375 m. */
  rise?: number;
  /** Tread depth (default 0.3125 m). */
  tread?: number;
  /** Number of risers. Default: `height` / rise, else 6. */
  steps?: number;
  /** Height to climb (metres): gives the number of risers when `steps` isn't set. */
  height?: number;
  /** Width of each cheek wall (default 0.75 m); 0 = a bare flight. */
  cheek?: number;
  /** Steps per cheek-wall tier (default 2); the tiers share the steps out evenly. */
  tier?: number;
  /** How far each cheek tier's top stands above its highest tread (default 0.5 m). */
  above?: number;
  /** The lowest cheek tier runs this far in front of the foot, a plinth for a lion (default 0). */
  pedestal?: number;
  /** Landings: after these risers (counted from the foot) comes a tread `landing` deep. */
  landings?: readonly number[];
  /** Depth of a landing (default 1.0 m). */
  landing?: number;
  /** Where the flight's origin (the centre of its footprint at the foot's level) goes in the piece. */
  at?: [number, number, number];
  /**
   * Lay the stones into this masonry instead of a fresh one: the caller then
   * emits it and grows moss on the returned ledges (colliders are still added).
   */
  masonry?: DryMasonry;
  /** Moss cushions on the treads and copings (0‥1; default: the finish's own if mossy). */
  moss?: number;
  /** Grass tufts in the joints of the treads (0‥1; default 0). */
  grass?: number;
  /** Step stones knocked out of the flight (count; default 0) — a ruined stair. */
  missing?: number;
}

/** One cheek-wall tier: z from `z1` (back) to `z0` (front), standing to `top`. */
export interface CheekTier {
  z0: number;
  z1: number;
  top: number;
  /** Its first and last step. */
  first: number;
  last: number;
}

/** Where a flight's parts go (piece space, before `at`). */
export interface StairLayout {
  steps: number;
  rise: number;
  tread: number;
  height: number;
  /** Run from the foot to the back (metres). */
  depth: number;
  width: number;
  cheek: number;
  /** Outer half-width, cheek walls included (without their texel mouldings). */
  halfWidth: number;
  /** z of each riser's front edge, foot first; `fronts[steps]` is the back (−depth/2). */
  fronts: number[];
  tiers: CheekTier[];
}

export interface StairInfo extends StairLayout {
  /** The treads and the cheek tops, for moss and grass (see `overgrow` in lib/gallery.ts). */
  ledges: Ledge[];
}

/** The flight's sizes, without building it. */
export function stairLayout(o: StairOptions): StairLayout {
  const rise = Math.min(MAX_RISE, Math.max(2 * T, snap(o.rise ?? STAIR.ordinary.rise)));
  const tread = Math.max(2 * T, snap(o.tread ?? STAIR.ordinary.tread));
  const steps = Math.max(1, Math.round(o.steps ?? (o.height !== undefined ? o.height / rise : 6)));
  const landing = Math.max(tread, snap(o.landing ?? 1.0));
  const land = new Set(o.landings ?? []);
  const treads = Array.from({ length: steps }, (_, i) => (land.has(i + 1) && i < steps - 1 ? landing : tread));
  const depth = treads.reduce((a, b) => a + b, 0);
  const fronts = [depth / 2];
  treads.forEach((t, i) => fronts.push(fronts[i] - t));
  const width = snap(o.width ?? 3.0);
  const cheek = Math.max(0, snap(o.cheek ?? 0.75));
  const above = snap(o.above ?? 0.5);
  const pedestal = snap(o.pedestal ?? 0);
  // Tiers: the runs between landings, each shared out evenly in tiers of about `tier` steps.
  const tiers: CheekTier[] = [];
  const k = Math.max(1, Math.round(o.tier ?? 2));
  let s0 = 0;
  for (let i = 0; i < steps; i++) {
    if (!(treads[i] > tread) && i < steps - 1) continue;
    const n = i - s0 + 1;
    const count = Math.ceil(n / k);
    for (let g = 0; g < count; g++) {
      const a = s0 + Math.round((g * n) / count);
      const b = s0 + Math.round(((g + 1) * n) / count) - 1;
      tiers.push({ z0: fronts[a] + (a === 0 ? pedestal : 0), z1: fronts[b + 1], top: (b + 1) * rise + above, first: a, last: b });
    }
    s0 = i + 1;
  }
  return { steps, rise, tread, height: steps * rise, depth, width, cheek, halfWidth: width / 2 + cheek, fronts, tiers };
}

/**
 * Lay a flight of steps with its cheek walls into a piece (see the placement
 * contract above). Returns its layout and ledges.
 */
export function stairFlight(p: PieceBuilder, o: StairOptions): StairInfo {
  const L = stairLayout(o);
  const f = o.finish;
  const [ax, ay, az] = o.at ?? [0, 0, 0];
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box6 => [x0 + ax, y0 + ay, z0 + az, x1 + ax, y1 + ay, z1 + az];
  const m = o.masonry ?? new DryMasonry(o.seed);
  const look = finishLook(f, o.seed);
  const hw = L.width / 2;
  const back = -L.depth / 2;
  const ledges: Ledge[] = [];
  const steps: ReturnType<DryMasonry['course']>[] = [];
  const panels: { normal: number; at: [number, number, number]; size: number; mirror: number }[] = [];

  // Steps: course i fills from the back to its riser, so each tread is the
  // exposed front of one course; stones two to a metre, like the sheet's blocks.
  const ends = L.cheek > 0 ? FACE.px | FACE.nx : 0;
  for (let i = 0; i < L.steps; i++) {
    const y = i * L.rise;
    const b = box(-hw, y, back, hw, y + L.rise, L.fronts[i]);
    const stones = m.course(b, { length: [0.5, 1.0], row: i, closed: FACE.ny | ends, look });
    steps.push(stones);
    p.collider(...b);
    ledges.push({ x0: -hw + ax, x1: hw + ax, y: y + L.rise + ay, z0: L.fronts[i + 1] + az, z1: L.fronts[i] + az, joints: stones.slice(0, -1).map((s) => s.box[3]) });
  }

  // Cheek walls: a pier per tier from the ground to its coping, the tiers
  // stepping down to the foot; a plinth and a coping a texel proud outside
  // (the coping also in front), never on the flight's side.
  if (L.cheek > 0) {
    L.tiers.forEach((t, g) => {
      for (const side of [-1, 1]) {
        const [xa, xb] = side < 0 ? [-hw - L.cheek, -hw] : [hw, hw + L.cheek];
        const face = side < 0 ? FACE.nx : FACE.px;
        const out = (d: number): [number, number] => (side < 0 ? [xa - d, xb] : [xa, xb + d]);
        const plinth = t.top >= 0.75 ? 0.25 : 0;
        const cope = t.top >= 0.5 ? 0.25 : 0;
        const course = { axis: 'z' as const, face, length: [0.5, 1.0] as [number, number], look };
        if (plinth) {
          const [pa, pb] = out(T);
          m.course(box(pa, 0, t.z1, pb, plinth, t.z0 + (g === 0 ? T : 0)), { ...course, row: g });
        }
        m.wall(box(xa, plinth, t.z1, xb, t.top - cope, t.z0), coursesOf(t.top - cope - plinth), { ...course, row: g + 1, closed: FACE.ny | FACE.py });
        if (cope) {
          const [ca, cb] = out(T);
          m.course(box(ca, t.top - cope, t.z1, cb, t.top, t.z0 + T), { ...course, row: g });
        }
        p.collider(...box(xa, 0, t.z1, xb, t.top, t.z0));
        // A key pattern carved in the top course of the outer face (and of the foot's front).
        const body = t.top - cope - plinth;
        const size = Math.min(0.375, snap(Math.min(body, 0.5) - 0.125));
        const y = t.top - cope - Math.min(0.25, body / 2);
        if (size >= 0.25 && t.z0 - t.z1 >= 0.5) {
          panels.push({ normal: face, at: [(side < 0 ? xa : xb) + ax, y + ay, snap((t.z0 + t.z1) / 2) + az], size, mirror: side });
          if (g === 0) panels.push({ normal: FACE.pz, at: [snap((xa + xb) / 2) + ax, y + ay, t.z0 + az], size, mirror: side });
        }
        ledges.push({ x0: xa + ax, x1: xb + ax, y: t.top + ay, z0: t.z1 + az, z1: t.z0 + T + az, joints: [] });
      }
    });
  }

  const src = here();
  for (const k of panels) keyPanel(p.voxels, k.normal, k.at, k.size, k.mirror, src);
  if (o.masonry) return { ...L, ledges };
  weather(m, f, o.seed, o.missing ?? 0, steps);
  m.emit(p.voxels);
  const moss = o.moss ?? (f.surf[0] >= 0.4 ? f.surf[0] : 0);
  if (moss > 0 || (o.grass ?? 0) > 0) overgrow(p, ledges, moss, o.grass ?? 0, o.seed);
  return { ...L, ledges };
}

/** A flight on its own, as a kit piece (see {@link stairFlight}). */
export function stairPiece(o: StairOptions): KitPiece {
  const p = new PieceBuilder();
  stairFlight(p, o);
  return p.done();
}

/**
 * Age on a flight: a few step stones knocked out (never the foot's, so the
 * stair still reads as a stair), cracks and chipped arrises as the finish has.
 */
function weather(m: DryMasonry, f: StoneFinish, seed: number, missing: number, steps: ReturnType<DryMasonry['course']>[]): void {
  const r = rng(seed * 17 + 3);
  const pool = steps.slice(1).flatMap((c) => c.slice(1, -1));
  for (let k = 0; k < missing && pool.length; k++) m.knockOut(pool.splice(r.int(0, pool.length - 1), 1)[0], 0.375);
  const cracks = f.surf[2] >= 0.3 ? Math.max(1, Math.round(m.stones.length / 12)) : 0;
  const whole = m.stones.filter((s) => !s.gone && s.box[4] - s.box[1] >= 0.25);
  for (let k = 0; k < cracks && whole.length; k++) m.crack(whole.splice(r.int(0, whole.length - 1), 1)[0], r.int(1, 1e6));
  for (const s of m.stones) if (!s.gone && !s.crack && r.chance(f.wear * 0.6)) m.chip(s, r.int(1, 1e6));
}
