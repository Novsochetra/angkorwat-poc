import { coursesOf, DryMasonry, FACE, finishLook, type Box6 } from '../../lib/gallery';
import type { LionFinish } from '../../lib/lion';
import type { NagaLook } from '../../lib/naga';
import { profileFor, sideBox, terrace, TERRACE_SIDES, type TerraceInfo, type TerraceSide, type TerraceWeather } from '../../lib/terrace';
import { PieceBuilder } from '../../PieceBuilder';
import { placePiece } from '../../place';
import { snap } from '../../shapes';
import { STONE_FINISH, type StoneFinish } from '../../surface';
import type { KitPiece } from '../../types';
import type { VoxelBox } from '../../../voxel/VoxelBuilder';
import { CORE_LOOKS } from './_core-looks';

/**
 * §16 terrace edges — the terrace-wall stretch the wall and corner pieces are
 * made of: a `terrace()` body with its moulded face on the finished sides and
 * its cut sides (where the module meets the next one, or the terrace fill
 * behind it) dressed with plain ashlar, so a lone piece reads as solid stone
 * from every side and tiled ones hide it.
 */

/** The §16 sheet (all §16 components share it). */
export const SHEET_16 = 'section 16/51F119C4-CD9A-4DB5-BCFD-840E8D3A151C.PNG';

/** Terrace levels the edges are built for (SIZES-ARCH §1.8). */
export const LEVEL = { avenue: 1.5, first: 3.25 } as const;

/** Depth of a terrace-wall module (z): the moulded facing and a strip of paved top behind it. */
export const WALL_DEPTH = 2;

/** How the stone, the growth and the carved pieces on a terrace edge look. */
export interface EdgeLook {
  name: string;
  finish: StoneFinish;
  weather: TerraceWeather;
  /** Moss and grass on the parapets' ledges, 0‥1. */
  moss: number;
  grass: number;
  /** Chipped parapet stones, lost piers, a bitten naga, 0‥1. */
  wear: number;
  lion: { finish: LionFinish; weather: number };
}

/**
 * The §16 core terraces' three finishes (lower, middle, upper terrace), with
 * their age scaled to a 4 m module: the sheet's mossy grey-brown stone,
 * weathered and broken, and clean (restored).
 */
export const EDGE_LOOKS = {
  mossy: { ...CORE_LOOKS.mossy, moss: 0.55, grass: 0.45, wear: 0.05, lion: { finish: 'grey', weather: 0.4 } },
  weathered: {
    name: CORE_LOOKS.weathered.name,
    finish: CORE_LOOKS.weathered.finish,
    weather: { ...CORE_LOOKS.weathered.weather, missing: 1, cracked: 1 },
    moss: 0.4,
    grass: 0.6,
    wear: 0.55,
    lion: { finish: 'grey', weather: 0.75 },
  },
  clean: { name: 'Clean', finish: STONE_FINISH.clean, weather: CORE_LOOKS.clean.weather, moss: 0, grass: 0, wear: 0, lion: { finish: 'warm', weather: 0.05 } },
} as const satisfies Record<string, EdgeLook>;

export type EdgeLookId = keyof typeof EDGE_LOOKS;

/** The naga's look on a terrace of this look: the terrace's stone, a little moss in its hollows. */
export const nagaLook = (l: EdgeLook, seed: number): NagaLook => ({ seed, finish: l.finish, moss: l.moss * 0.6, broken: l.wear > 0.3 ? l.wear * 0.7 : 0 });

/** A cut side to dress, optionally only over a span along it (u, left → right from outside). */
export interface Dress {
  side: TerraceSide;
  span?: [number, number];
}

export interface ArmOptions {
  width: number;
  depth: number;
  height: number;
  /** Sides with the moulded terrace face. */
  sides: readonly TerraceSide[];
  /** Cut sides dressed with plain ashlar. */
  dress: readonly Dress[];
  look: EdgeLook;
  seed: number;
  /**
   * Areas (piece space) a parapet, post or statue will stand on: moss and
   * grass there are taken off again. (The terrace's own `clear` would strip
   * the whole coping's moss, the lip in front of a parapet too.)
   */
  keepOff?: readonly Box6[];
}

/** How deep the dressing stones reach into the cut face. */
const DRESS = 0.5;

/**
 * Courses of the dressing, matching the face's bands: the profile's bands and
 * dado courses (the coping's height is paving at the cut) merged into
 * courses of about half a metre, so their joints line up with the bands' ends.
 */
function dressCourses(h: number): number[] {
  const pr = profileFor(h);
  const bandH = [...pr.base, ...pr.cornice].reduce((a, b) => a + b.h, 0);
  const dado = h - bandH;
  const bands = [...pr.base.map((b) => b.h), ...(dado > 1e-6 ? coursesOf(dado) : []), ...pr.cornice.slice(0, -1).map((b) => b.h)];
  const out: number[] = [];
  let acc = 0;
  for (const b of bands) {
    acc += b;
    if (acc >= 0.375 - 1e-6) (out.push(acc), (acc = 0));
  }
  if (acc > 1e-6) out.length ? (out[out.length - 1] += acc) : out.push(acc);
  return out;
}

/**
 * A terrace-wall stretch as a piece: one terrace stage `height` high over
 * `width` × `depth`, finished on `sides`, the `dress` sides laid with plain
 * ashlar. Returns the piece and the terrace's info (edges for parapets).
 */
export function terraceArm(o: ArmOptions): { piece: KitPiece; info: TerraceInfo } {
  const p = new PieceBuilder();
  const m = new DryMasonry(o.seed);
  const f = o.look.finish;
  const info = terrace(p, {
    width: o.width,
    depth: o.depth,
    stages: [{ height: o.height }],
    sides: o.sides,
    finish: f,
    weather: o.look.weather,
    seed: o.seed,
    masonry: m,
  });
  const off = o.keepOff ?? [];
  if (off.length) {
    const E = 1e-6;
    const hit = (b: VoxelBox, q: Box6) =>
      b.x + b.sx / 2 > q[0] + E && b.x - b.sx / 2 < q[3] - E && b.y + b.sy / 2 > q[1] + E && b.y - b.sy / 2 < q[4] - E && b.z + b.sz / 2 > q[2] + E && b.z - b.sz / 2 < q[5] - E;
    const kept = p.voxels.boxes.filter((b) => b.mat !== 'leaves' || !off.some((q) => hit(b, q)));
    p.voxels.boxes.length = 0;
    p.voxels.boxes.push(...kept);
  }
  const st = info.stages[0];
  const fin = new Set(o.sides);
  const dressed = new Set(o.dress.map((d) => d.side));
  const foot = { front: o.depth / 2, back: o.depth / 2, left: o.width / 2, right: o.width / 2 };
  const look = finishLook(f, o.seed + 7);
  const heights = dressCourses(st.y1 - st.y0);
  for (const d of o.dress) {
    const s = d.side;
    const i = TERRACE_SIDES.indexOf(s);
    const [L, R] = [TERRACE_SIDES[(i + 3) % 4], TERRACE_SIDES[(i + 1) % 4]];
    // Along the side: to a finished side's facing, to the footprint's edge, or
    // (a left or right side) to where the front or back dressing starts.
    const reach = (e: TerraceSide) => (fin.has(e) ? st.inner[e] : dressed.has(e) && (s === 'left' || s === 'right') ? foot[e] - DRESS : foot[e]);
    let [u0, u1] = [-reach(L), reach(R)];
    if (d.span) [u0, u1] = [Math.max(u0, d.span[0]), Math.min(u1, d.span[1])];
    if (u1 - u0 < 0.125) continue;
    const box = sideBox(s, u0, u1, 0, st.y1 - 0.25, foot[s] - DRESS, foot[s]);
    const axis = s === 'front' || s === 'back' ? 'x' : 'z';
    const face = { front: FACE.pz, back: FACE.nz, right: FACE.px, left: FACE.nx }[s];
    const inward = { front: FACE.nz, back: FACE.pz, right: FACE.nx, left: FACE.px }[s];
    m.wall(box, heights, { axis, face, length: [0.75, 1.25], closed: FACE.ny | inward, row: i, look });
  }
  m.emit(p.voxels);
  return { piece: p.done(), info };
}

/** Copy a piece into `p` at (x, 0, z), turned. */
export function put(p: PieceBuilder, piece: KitPiece, x: number, z: number, turn = 0): void {
  placePiece({ voxels: p.voxels, collider: (c) => p.colliders.push(c) }, piece, { x, y: 0, z, turn });
}

/** A terrace level from the studio's `height` (0.25 m steps, at least 0.75 m). */
export const levelOf = (height: number | undefined, fallback: number) => Math.max(0.75, snap(height ?? fallback, 0.25));
