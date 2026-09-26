import { BoxGeometry, ConeGeometry, CylinderGeometry, Euler, ExtrudeGeometry, LOD, Matrix4, Mesh, Object3D, QuadraticBezierCurve3, Shape as Outline, SphereGeometry, TorusGeometry, TubeGeometry, Vector2, Vector3, type BufferGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { VoxelGrid } from '../../voxel/VoxelBuilder';
import { bondTone, courseShade, fillBox, tone } from '../landmarks/_faces';
import { CANOPY, chip, growTree, LATERITE, overgrow, pickOf, RUIN_STONE, TREE_BARK } from '../landmarks/_ruin';
import { buddhaStatue } from '../sacred/buddha';
import { PALETTES, statueMaterial, type Finish } from '../sacred/finish';
import { finishGeometry, plainAttributes, revolve } from '../sacred/offerings';
import type { V3 } from '../sacred/sdf';
import { stupa, stupaNiche } from '../sacred/stupa';
import type { ShrineLights } from './_incense';
import { mossOn, plantsAround, steppingStones } from './_ruinBits';
import type { SiteFrame } from './_ruinFrame';
import { BRASS, clothBand, LACQUER, later, marigolds, offer, place, type Sculpted } from './_ruinOfferings';

/**
 * The jungle's places of worship (site space: +z toward the trail, see
 * _ruinFrame.ts), each kept by the people who pass: incense, candles,
 * flowers, fruit. The statues, the stupa and the offerings are sculpted
 * (sacred/: smooth stone, gilt, brass, wax), on voxel plinths, steps and
 * tables that make them solid; hidden blocks (`Sculpted.solid`) keep the
 * explorer out of a statue's body.
 *
 * - the forest Buddha: the Angkor naga Buddha in sandstone, meditating on
 *   the serpent's coils under its seven heads, a saffron cloth the people
 *   tied over his shoulder, on a moulded plinth under a great bodhi tree,
 *   a red offering table before him;
 * - the spirit house (san preah phum) by the village trail: a little
 *   temple of the land's spirit on a post (smooth: crossed gable roofs in
 *   red and gold, chofa horns, a spire), garlands, a tray of small
 *   offerings;
 * - the lake shrine: a small whitewashed stupa on a laterite base, a gilt
 *   Buddha in its niche, candles on its step, a brass urn of incense
 *   before it and a frangipani beside it;
 * - the Kulen shrine: a small stone sanctuary tower at the mountain's foot,
 *   a gilt Buddha in saffron on a pedestal inside its doorway, candles, an
 *   urn of incense on the step.
 *
 * `KNEEL` (site space) is where the explorer kneels at each and what he
 * faces (roam/_worship.ts holds them in map metres).
 */

export const KNEEL: Record<string, { at: [number, number]; face: [number, number] }> = {
  'forest-buddha': { at: [0, 3.1], face: [0, -2] },
  'spirit-house': { at: [0.5, 1.7], face: [0.5, -1.2] },
  'lake-shrine': { at: [0, 2.95], face: [0, -1.4] },
  'kulen-shrine': { at: [0, 3.35], face: [0, -2.2] },
};

type CellPut = (i: number, j: number, k: number, color: number, mat?: 'mapStone' | 'krama' | 'brass' | 'mapGrass', shade?: number) => void;
const putter =
  (g: VoxelGrid): CellPut =>
  (i, j, k, color, mat = 'mapStone', shade = 1) =>
    g.put(i, j, k, { color, mat, shade });

/** A statue's sandstone plinth: warm, lighter than the ruins (the people keep it clean). */
const PLINTH = {
  wall: [0xb89a76, 0xb0926e, 0xc0a27d, 0xa98c69],
  ledge: [0xc8ab86, 0xc0a37e, 0xd0b38d],
  dado: [0xa5886a, 0x9d8163, 0xab8e6f],
};

/**
 * A moulded plinth for a statue (cells of `cell` m, centred on the site
 * point (x, z), its foot `y` m over the floor): the base course (laterite,
 * a cell wider all round), a moulding, a recessed dado, the cornice and the
 * top slab (half sizes `hw` × `hd` cells), the moulding's and cornice's
 * corners cut back; with `land`, laterite footing down to the land under
 * it. Moss in patches on the base course (`moss` 0‥1). Returns its top (m
 * over the floor).
 */
function plinth(fr: SiteFrame, o: { x: number; z: number; y?: number; cell: number; hw: number; hd: number; seed: number; land?: boolean; moss?: number }): number {
  const { cell, hw, hd, seed } = o;
  const y0 = o.y ?? 0;
  const g = fr.grid(cell, { seed, at: [o.x, y0, o.z], ao: 0.3, jitter: 0.015 });
  const lat = (i: number, j: number, k: number) => tone(LATERITE, i >> 1, j, k >> 1, seed + 1);
  const wall = (i: number, j: number, k: number) => bondTone(PLINTH.wall, i, j, k, seed + 2);
  const ledge = (i: number, j: number, k: number) => tone(PLINTH.ledge, i, j, k, seed + 3);
  const notch = (i: number, k: number, a: number, b: number) => Math.abs(i) === a && Math.abs(k) === b;
  // Laterite footing to the land, and the base course.
  for (let i = -hw - 1; i <= hw + 1; i++)
    for (let k = -hd - 1; k <= hd + 1; k++) {
      const low = o.land ? Math.min(0, fr.landRow(o.x + i * cell, o.z + k * cell, cell, y0)) : 0;
      if (o.land) g.ghost(i, low - 1, k);
      for (let j = low; j <= 0; j++) g.put(i, j, k, { color: lat(i, j, k), mat: 'mapStone', shade: 0.95 });
    }
  fillBox(g, -hw, hw, 1, 1, -hd, hd, (i, j, k) => (notch(i, k, hw, hd) ? null : ledge(i, j, k)));
  fillBox(g, -hw + 1, hw - 1, 2, 2, -hd + 1, hd - 1, (i, j, k) => tone(PLINTH.dado, i, j, k, seed + 4), 'mapStone', () => 0.92);
  fillBox(g, -hw, hw, 3, 3, -hd, hd, (i, j, k) => (notch(i, k, hw, hd) ? null : wall(i, j, k)), 'mapStone', (_i, j) => courseShade(j));
  fillBox(g, -hw, hw, 4, 4, -hd, hd, (i, j, k) => ledge(i, j, k), 'mapStone', () => 1.04);
  // (the top slab under the statue stays clean)
  const keep = new Set<string>();
  for (let i = -hw; i <= hw; i++) for (let k = -hd; k <= hd; k++) keep.add(`${i},4,${k}`);
  if (o.moss) mossOn(g, { seed: seed + 5, amount: o.moss, dirs: [[0, 1, 0]], moss: RUIN_STONE.moss, keep, scale: 3 });
  g.commit();
  return y0 + 5 * cell;
}

/** A hidden block (solid to the explorer, never drawn) over a statue's or a stupa's body: site space, its foot `y` m over the floor. */
function solidBody(S: Sculpted, x: number, y: number, z: number, w: number, h: number, d: number): void {
  S.solid.b.box(x, y + h / 2, z, w, h, d, 0x808080, 'mapStone');
}

// ── The forest Buddha ────────────────────────────────────────────────────

/** The Buddha's middle (site z, m) and his height to the hood's top (m). */
const ZB = -2;
const FOREST_BUDDHA = 3;

/**
 * The forest Buddha (back trail, behind Angkor Wat): the naga Buddha on
 * his plinth under a bodhi tree whose trunk is tied with a saffron cloth,
 * laterite paving round the plinth, a red offering table with candles,
 * incense, lotus, bay sei, fruit and marigolds, stepping stones from the
 * trail, ferns.
 */
export function forestBuddha(fr: SiteFrame, L: ShrineLights, S: Sculpted): void {
  const src = traceSource();
  // The bodhi tree behind him, its crown over him.
  const tg = fr.grid(1, { seed: 610, mat: 'mapBark' });
  fr.ghostLand(tg, 1, -9, 9, -12, 6);
  growTree(tg, 0, fr.landRow(0, -6, 1), -6, { trunk: 10, radius: 8, squash: 0.5, seed: 611, thick: true, bark: [0x7d7262, 0x74695a, 0x857a69], leaf: CANOPY, lean: [0, -2] });
  tg.commit();
  clothBand(fr, 0.5, -5.5, 1.05, 1.05, 1.5, 0.4, 612);
  // Paving round the plinth.
  for (let x = -2; x <= 2; x++)
    for (let z = -4; z <= 0; z++) {
      const px = x + (hash3(x, z, 1, 613) - 0.5) * 0.08;
      const pz = z + (hash3(x, z, 2, 613) - 0.5) * 0.08;
      fr.b.box(px, fr.ground(px, pz) + 0.06, pz, 0.94, 0.14, 0.94, pickOf(PATH_STONE, x, z, 0, 614), 'mapStone', { src, shade: 0.9 + 0.12 * hash3(x, z, 3, 613) });
    }
  // The plinth (0.2 m cells: 2.6 × 2.2 m, 1 m high), and the Buddha on it, facing the trail.
  const top = plinth(fr, { x: 0, z: ZB, cell: 0.2, hw: 6, hd: 5, seed: 620, land: true, moss: 0.55 });
  place(fr, S, buddhaStatue({ kind: 'nagaSash', look: 'sandstone', height: FOREST_BUDDHA }), 0, top, ZB);
  solidBody(S, 0, top, ZB, 1.8, FOREST_BUDDHA * 0.9, 1.4);
  // Marigold swags across the plinth's cornice, hung from three points.
  const zf = ZB + 5.5 * 0.2 + 0.03;
  marigolds(fr, S, [-1.2, top - 0.08, zf], [0, top - 0.08, zf], 0.3, 621);
  marigolds(fr, S, [0, top - 0.08, zf], [1.2, top - 0.08, zf], 0.3, 622);

  // The offering table: red lacquer, gilt edge.
  const tt = 0.78;
  const [tx0, tx1, tz0, tz1] = [-1.1, 1.1, -0.35, 0.45];
  const tzc = (tz0 + tz1) / 2;
  fr.b.box(0, tt - 0.04, tzc, tx1 - tx0, 0.08, tz1 - tz0, LACQUER[0], 'wood', { src });
  fr.b.box(0, tt - 0.13, tz1 - 0.02, tx1 - tx0 - 0.1, 0.1, 0.04, BRASS[1], 'brass', { src });
  for (const x of [tx0 + 0.08, tx1 - 0.08]) for (const z of [tz0 + 0.08, tz1 - 0.08]) fr.b.box(x, (tt - 0.08) / 2, z, 0.1, tt - 0.08, 0.1, LACQUER[1], 'wood', { src });
  // On it: bay sei at the ends, lotus in vases, the urn of incense between two candles, fruit.
  for (const s of [-1, 1]) {
    offer(fr, S, L, 'baySei', s * 0.88, tt, tzc - 0.12, { scale: 1.3 });
    offer(fr, S, L, 'lotusVase', s * 0.52, tt, tzc - 0.14, { ry: s * 0.4 });
    offer(fr, S, L, 'candle', s * 0.24, tt, tzc + 0.16, { scale: 1.6 });
    offer(fr, S, L, 'fruitPlate', s * 0.6, tt, tzc + 0.2, { ry: -s * 0.5 });
  }
  offer(fr, S, L, 'incense', 0, tt, tzc - 0.06, { scale: 1.7, sticks: 9, smoke: 1 });
  // A marigold garland along the table's front.
  marigolds(fr, S, [tx0 + 0.04, tt - 0.05, tz1 + 0.03], [tx1 - 0.04, tt - 0.05, tz1 + 0.03], 0.2, 635);
  // Night: a soft halo over the table (none on the Buddha: it bleached the stone white; the candles light him).
  L.halos.push({ at: fr.point(0, tt + 0.5, tzc), size: 2.2 });

  steppingStones(fr, [0.2, 5.6], [0.1, 1.2], 1.1, 640, PATH_STONE);
  plantsAround(fr, { n: 40, r0: 3, r1: 8.5, seed: 641, flowers: 0.25, keepOut: (x, z) => Math.abs(x) < 2.6 && z > -4.8 && z < 6 });
}

// ── The spirit house ─────────────────────────────────────────────────────

const PAINT_RED = [0x9c2a22, 0x8e241d];

/** The spirit house's surfaces (the statues' material, sacred/finish.ts). */
const SH = {
  plaster: { color: 0xf0e4c8, metal: 0, rough: 0.82, grain: 0.35 },
  gold: PALETTES.gilt.skin,
  trim: PALETTES.gilt.hem,
  lacquer: { color: 0x8a2217, metal: 0.05, rough: 0.4, grain: 0.3 },
  tile: { color: 0xb9492c, metal: 0, rough: 0.6, grain: 0.45 },
  tileDark: { color: 0xa33d25, metal: 0, rough: 0.62, grain: 0.45 },
  dark: { color: 0x2c0e0a, metal: 0, rough: 0.8, grain: 0 },
} satisfies Record<string, Finish>;

/** The house's measures (m, house space: its foot's middle at the origin, the front +z). */
const HOUSE = {
  /** The walls' half width and depth (their middle 0.08 back), height over the plinth. */
  wall: [0.42, 0.31] as const,
  wallZ: -0.08,
  wallH: 0.62,
  plinth: 0.1,
  /** The lower roofs: the eaves' half span and height, the pitch, the half lengths along z and x. */
  span: 0.56,
  eaveY: 0.7,
  pitch: 0.92,
  front: 0.56,
  side: 0.62,
  /** Where a garland hangs from the front eave's corners. */
  eaveX: 0.5,
};

let house: BufferGeometry | null = null;

/**
 * The spirit house's little temple (smooth, made once; about 2.4 m tall):
 * a red plinth with a gold band, cream walls with gold pilasters, a porch
 * of two gold columns before a gold-framed doorway where the guardian
 * spirit's gilt figure stands, a window each side; two tiers of crossed
 * gable roofs in red tiles laid in courses, red gables with gold
 * medallions, gold naga bargeboards curling up at the eaves and a chofa
 * horn at each peak; a gold spire of rings over the crossing.
 */
function spiritHouseModel(): Object3D {
  house ??= houseGeometry();
  const m = new Mesh(house, statueMaterial());
  m.name = 'spirit house';
  m.castShadow = m.receiveShadow = true;
  const lod = new LOD();
  lod.name = 'spirit house';
  lod.addLevel(m, 0);
  lod.addLevel(new Object3D(), 150);
  return lod;
}

function houseGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const mat = new Matrix4();
  const put = (g: BufferGeometry, f: Finish, at: V3 = [0, 0, 0], turn: V3 = [0, 0, 0]) => {
    g.applyMatrix4(mat.makeRotationFromEuler(new Euler(turn[0], turn[1], turn[2])).setPosition(at[0], at[1], at[2]));
    parts.push(plainAttributes(finishGeometry(g, f)));
  };
  const box = (w: number, h: number, d: number, f: Finish, at: V3, turn?: V3) => put(new BoxGeometry(w, h, d), f, at, turn);
  const H = HOUSE;
  const [hw, hd] = H.wall;
  const top = H.plinth + H.wallH;
  // The plinth, its gold band; the walls, gold pilasters at their corners and a gold cornice.
  put(new RoundedBoxGeometry(1.04, H.plinth, 0.92, 2, 0.015), SH.lacquer, [0, H.plinth / 2, 0]);
  box(1.06, 0.022, 0.94, SH.trim, [0, H.plinth - 0.005, 0]);
  put(new RoundedBoxGeometry(hw * 2, H.wallH, hd * 2, 2, 0.01), SH.plaster, [0, H.plinth + H.wallH / 2, H.wallZ]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.06, H.wallH, 0.06, SH.gold, [sx * hw, H.plinth + H.wallH / 2, H.wallZ + sz * hd]);
  box(hw * 2 + 0.08, 0.04, hd * 2 + 0.08, SH.trim, [0, top - 0.01, H.wallZ]);
  // The doorway: dark within, a gold frame and a pointed pediment; the guardian spirit's gilt figure.
  const fz = H.wallZ + hd;
  box(0.3, 0.44, 0.012, SH.dark, [0, H.plinth + 0.22, fz + 0.002]);
  for (const sx of [-1, 1]) box(0.035, 0.48, 0.03, SH.gold, [sx * 0.168, H.plinth + 0.24, fz + 0.01]);
  box(0.4, 0.04, 0.03, SH.gold, [0, H.plinth + 0.49, fz + 0.01]);
  const ped = new Outline([new Vector2(-0.2, 0), new Vector2(0.2, 0), new Vector2(0, 0.13)]);
  put(new ExtrudeGeometry(ped, { depth: 0.02, bevelEnabled: false }), SH.gold, [0, H.plinth + 0.51, fz]);
  put(new CylinderGeometry(0.03, 0.045, 0.13, 10), SH.gold, [0, H.plinth + 0.065, fz + 0.05]);
  put(new SphereGeometry(0.027, 10, 8), SH.gold, [0, H.plinth + 0.155, fz + 0.05]);
  put(new ConeGeometry(0.018, 0.06, 8), SH.gold, [0, H.plinth + 0.205, fz + 0.05]);
  // Windows each side, gold framed.
  for (const sx of [-1, 1]) {
    box(0.012, 0.2, 0.2, SH.dark, [sx * (hw + 0.002), H.plinth + 0.36, H.wallZ]);
    box(0.02, 0.24, 0.03, SH.gold, [sx * (hw + 0.008), H.plinth + 0.36, H.wallZ - 0.115]);
    box(0.02, 0.24, 0.03, SH.gold, [sx * (hw + 0.008), H.plinth + 0.36, H.wallZ + 0.115]);
    box(0.02, 0.03, 0.26, SH.gold, [sx * (hw + 0.008), H.plinth + 0.475, H.wallZ]);
  }
  // The porch: two gold columns with red bands, on the plinth before the door.
  for (const sx of [-1, 1]) {
    put(new CylinderGeometry(0.026, 0.03, H.wallH, 10), SH.gold, [sx * 0.38, H.plinth + H.wallH / 2, 0.39]);
    for (const y of [H.plinth + 0.03, top - 0.05]) box(0.075, 0.04, 0.075, SH.lacquer, [sx * 0.38, y, 0.39]);
  }
  // The lower roofs, crossed; a drum under the upper ones; the upper roofs; the spire.
  gableRoof(put, box, { span: H.span, eave: H.eaveY, pitch: H.pitch, len: H.front, turn: 0 });
  gableRoof(put, box, { span: H.span, eave: H.eaveY, pitch: H.pitch, len: H.side, turn: Math.PI / 2 });
  put(new RoundedBoxGeometry(0.56, 0.4, 0.56, 2, 0.01), SH.plaster, [0, 1.05, 0]);
  const up = { span: 0.34, eave: 1.2, pitch: 1.02, len: 0.38 };
  gableRoof(put, box, { ...up, turn: 0 });
  gableRoof(put, box, { ...up, turn: Math.PI / 2 });
  const ridge = up.eave + up.span * Math.tan(up.pitch);
  const G = SH.gold;
  const T = SH.trim;
  const spire: [number, number, Finish][] = [
    [0.075, ridge - 0.08, G],
    [0.075, ridge + 0.02, G],
    [0.058, ridge + 0.04, T],
    [0.062, ridge + 0.08, T],
    [0.046, ridge + 0.1, G],
    [0.05, ridge + 0.14, G],
    [0.036, ridge + 0.16, T],
    [0.04, ridge + 0.2, T],
    [0.026, ridge + 0.22, G],
    [0.03, ridge + 0.26, G],
    [0.016, ridge + 0.3, T],
    [0.011, ridge + 0.42, T],
    [0.006, ridge + 0.56, G],
    [0, ridge + 0.64, G],
  ];
  parts.push(plainAttributes(revolve([{ r: 0, y: ridge - 0.08, f: G }, ...spire.map(([r, y, f]) => ({ r, y, f }))], 16)));
  const g = mergeGeometries(parts)!;
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

type Put = (g: BufferGeometry, f: Finish, at?: V3, turn?: V3) => void;
type BoxPut = (w: number, h: number, d: number, f: Finish, at: V3, turn?: V3) => void;

/**
 * A gable roof on the house (its ridge along z, turned `turn` about y):
 * the eaves `span` m out each side at height `eave`, the slopes at `pitch`
 * (rad), `len` m to each gable. Red tiles laid in courses (each lapping the
 * one below it), a gold ridge; at each end a red gable with a gold
 * medallion, gold naga bargeboards curling up at the eaves, a chofa horn
 * at the peak.
 */
function gableRoof(put: Put, box: BoxPut, o: { span: number; eave: number; pitch: number; len: number; turn: number }): void {
  const { span, eave, pitch, len, turn } = o;
  const [c, s] = [Math.cos(turn), Math.sin(turn)];
  // (roof space → house space: turned about y)
  const at = (x: number, y: number, z: number): V3 => [c * x + s * z, y, -s * x + c * z];
  const rise = span * Math.tan(pitch);
  const slope = span / Math.cos(pitch);
  const ridge = eave + rise;
  const n = 5;
  const t = 0.026;
  for (const side of [-1, 1]) {
    // Down the slope from the ridge: (sin, −cos) of the pitch outward; its normal (side·sin… up).
    const dir = [side * Math.cos(pitch), -Math.sin(pitch)];
    const nor = [side * Math.sin(pitch), Math.cos(pitch)];
    for (let i = 0; i < n; i++) {
      const d = ((i + 0.5) * slope) / n + 0.012;
      const lift = t / 2 + (n - 1 - i) * 0.006;
      const x = dir[0] * d + nor[0] * lift;
      const y = ridge + dir[1] * d + nor[1] * lift;
      box(slope / n + 0.03, t, len * 2 + 0.04, i & 1 ? SH.tileDark : SH.tile, at(x, y, 0), [0, turn, -side * pitch]);
    }
  }
  box(0.05, 0.05, len * 2 + 0.06, SH.trim, at(0, ridge + 0.035, 0), [0, turn, 0]);
  for (const end of [-1, 1]) {
    const z = end * (len - 0.01);
    // The gable: red, a gold medallion.
    const tri = new Outline([new Vector2(-span * 0.96, 0), new Vector2(span * 0.96, 0), new Vector2(0, rise * 0.96)]);
    put(new ExtrudeGeometry(tri, { depth: 0.02, bevelEnabled: false }), SH.lacquer, at(0, eave, z - 0.01), [0, turn, 0]);
    put(new CylinderGeometry(rise * 0.17, rise * 0.17, 0.02, 20).rotateX(Math.PI / 2), SH.gold, at(0, eave + rise * 0.36, z + end * 0.012), [0, turn, 0]);
    // The bargeboards along both slopes, and the curls at the eaves.
    for (const side of [-1, 1]) {
      const d = slope / 2 + 0.02;
      const x = side * Math.cos(pitch) * d + side * Math.sin(pitch) * 0.045;
      const y = ridge - Math.sin(pitch) * d + Math.cos(pitch) * 0.045;
      box(slope + 0.06, 0.05, 0.03, SH.gold, at(x, y, end * (len + 0.02)), [0, turn, -side * pitch]);
      const curl = new TorusGeometry(0.045, 0.012, 6, 12, Math.PI * 1.25);
      put(curl, SH.gold, at(side * (span + 0.06), eave + 0.03, end * (len + 0.02)), [0, turn, side > 0 ? -Math.PI * 0.2 : Math.PI * 1.2 - Math.PI * 0.25]);
    }
    // The chofa: a slim horn rising from the peak, curling out.
    const [bx, by, bz] = at(0, ridge + 0.02, end * (len + 0.02));
    const [ox, , oz] = at(0, 0, end * 0.1);
    const horn = new QuadraticBezierCurve3(new Vector3(bx, by, bz), new Vector3(bx, by + 0.16, bz), new Vector3(bx + ox, by + 0.2, bz + oz));
    put(new TubeGeometry(horn, 8, 0.014, 6), SH.gold);
  }
}

/**
 * The spirit house on the village trail: a cream post on a white plinth,
 * red brackets, a red tray with a gold rim (blocks: solid), and on it the
 * little temple of the land's spirit (`spiritHouseModel`, smooth). On the
 * tray before it: an urn of incense between two candles, a plate of fruit,
 * a red soda with a straw, small bay sei by the house; marigold garlands
 * along the tray and hanging from its corners and the eaves.
 */
export function spiritHouse(fr: SiteFrame, L: ShrineLights, S: Sculpted): void {
  const src = traceSource();
  const [cx, cz] = [0.5, -1.2];
  const gy = fr.ground(cx, cz);
  // Plinth, a step, the post with gold bands.
  fr.b.box(cx, gy + 0.15, cz, 1.3, 0.3, 1.3, 0xdcd5c6, 'mapStone', { src });
  fr.b.box(cx, gy + 0.36, cz, 0.8, 0.12, 0.8, 0xe6dfd0, 'mapStone', { src });
  const postTop = 2.05;
  fr.b.box(cx, (gy + 0.42 + postTop) / 2, cz, 0.24, postTop - gy - 0.42, 0.24, 0xe4d9c1, 'wood', { src });
  for (const y of [gy + 0.5, postTop - 0.1]) fr.b.box(cx, y, cz, 0.3, 0.07, 0.3, BRASS[0], 'brass', { src });
  // Brackets from the post to the tray.
  for (const s of [-1, 1]) {
    fr.b.box(cx + s * 0.28, postTop - 0.2, cz, 0.08, 0.5, 0.08, PAINT_RED[0], 'wood', { src, rz: s * 0.8 });
    fr.b.box(cx, postTop - 0.2, cz + s * 0.26, 0.08, 0.5, 0.08, PAINT_RED[0], 'wood', { src, rx: -s * 0.8 });
  }
  // The tray, red with a gold rim; the house at its back, a porch in front.
  const ty = postTop + 0.06;
  const [trw, trd] = [1.5, 1.3];
  const tcz = cz + 0.1;
  fr.b.box(cx, ty, tcz, trw, 0.1, trd, PAINT_RED[1], 'wood', { src });
  for (const s of [-1, 1]) {
    fr.b.box(cx, ty + 0.07, tcz + (s * trd) / 2, trw, 0.05, 0.04, BRASS[1], 'brass', { src });
    fr.b.box(cx + (s * trw) / 2, ty + 0.07, tcz, 0.04, 0.05, trd, BRASS[1], 'brass', { src });
  }
  const floor = ty + 0.05;

  // The house (smooth, made later; a hidden block keeps the follow camera out of it).
  const hz = cz - 0.1;
  later(() => place(fr, S, spiritHouseModel(), cx, floor, hz, 0, src));
  solidBody(S, cx, floor, hz, 1.1, 1.5, 0.95);

  // Offerings on the porch (sculpted, a little smaller than an altar's).
  const pz = hz + 0.62;
  offer(fr, S, L, 'incense', cx, floor, pz - 0.02, { scale: 1.1, sticks: 5, smoke: 0.6 });
  // (their light kept soft: close by, it glared on the brass)
  for (const s of [-1, 1]) offer(fr, S, L, 'candle', cx + s * 0.34, floor, pz + 0.04, { scale: 1.1, lamp: 0.5 });
  offer(fr, S, L, 'fruitPlate', cx - 0.57, floor, pz, { scale: 1.1, ry: 0.4 });
  for (const s of [-1, 1]) offer(fr, S, L, 'baySei', cx + s * 0.63, floor, hz + 0.02, { tiers: 3, scale: 0.9 });
  fr.b.box(cx + 0.55, floor + 0.1, pz - 0.02, 0.07, 0.2, 0.07, 0xd8263a, 'petal', { src }); // the red soda
  fr.b.box(cx + 0.57, floor + 0.25, pz - 0.02, 0.015, 0.14, 0.015, 0xf2f2f2, 'petal', { src, rz: -0.3 }); // its straw
  // Garlands: along the tray's front, hanging from its corners and the roof's eaves.
  const front = tcz + trd / 2 + 0.04;
  marigolds(fr, S, [cx - trw / 2, ty - 0.02, front], [cx + trw / 2, ty - 0.02, front], 0.16, 720);
  for (const s of [-1, 1]) marigolds(fr, S, [cx + (s * trw) / 2, ty - 0.02, front], [cx + (s * trw) / 2, ty - 0.52, front], 0, 721 + s);
  for (const s of [-1, 1]) marigolds(fr, S, [cx + s * HOUSE.eaveX, floor + HOUSE.eaveY - 0.03, hz + HOUSE.front], [cx + s * HOUSE.eaveX, floor + HOUSE.eaveY - 0.4, hz + HOUSE.front], 0, 723 + s);
  L.halos.push({ at: fr.point(cx, floor + 0.5, pz + 0.1), size: 2.4 });
}

// ── The lake shrine ──────────────────────────────────────────────────────

/** Laterite stepping stones and paving: warm red-brown and ochre (grey went navy in the shade). */
const PATH_STONE = [0xa86f47, 0x9e6640, 0xb37a50, 0x94603d];

/** Frangipani flowers: white with a yellow heart. */
const FRANGIPANI = [0xf6f2e6, 0xf8f0d0, 0xf4e8b8];
/** The stupa's height to its gold tip (m). */
const LAKE_STUPA = 4;

/**
 * A small whitewashed stupa on the lake's north shore (sacred/stupa.ts:
 * mouldings, a lotus band, the bell, the spire of gold rings) on a base
 * of two steps (0.25 m cells: laterite, a sandstone course on top, moss on
 * the lower tread). In its niche sits a small gilt Buddha, two candles on
 * the step before him; a brass urn of incense stands before it on a stone,
 * a frangipani beside it.
 */
export function lakeShrine(fr: SiteFrame, L: ShrineLights, S: Sculpted): void {
  const src = traceSource();
  const zc = -1.4;
  const g = fr.grid(0.25, { seed: 801, at: [0, 0, zc], ao: 0.3 });
  const P = putter(g);
  const lat = (i: number, j: number, k: number) => tone(PATH_STONE, i >> 1, j, k >> 1, 805);
  const course = (i: number, j: number, k: number) => bondTone(PLINTH.ledge, i, j, k, 802);
  // Footing down to the land and the lower step of laterite (5 cells out, a tread in front), the upper a sandstone course (4 out).
  for (let i = -5; i <= 5; i++)
    for (let k = -5; k <= 6; k++) {
      const low = Math.min(0, fr.landRow(i * 0.25, zc + k * 0.25, 0.25));
      g.ghost(i, low - 1, k);
      const top = Math.abs(i) <= 4 && k >= -4 && k <= 4 ? 1 : k === 6 && Math.abs(i) > 2 ? -1 : 0;
      for (let j = low; j <= top; j++) P(i, j, k, j === 1 ? course(i, j, k) : lat(i, j, k), 'mapStone', j === 1 ? 1.02 : 0.92);
    }
  mossOn(g, { seed: 806, amount: 0.3, dirs: [[0, 1, 0]], moss: RUIN_STONE.moss, scale: 2, keep: new Set(Array.from({ length: 81 }, (_, n) => `${(n % 9) - 4},1,${Math.floor(n / 9) - 4}`)) });
  g.commit();
  const base = 0.5;

  // The stupa on it, facing the trail; the gilt Buddha in its niche.
  later(() => place(fr, S, stupa({ height: LAKE_STUPA, look: 'white', niche: true }), 0, base, zc, 0, src));
  solidBody(S, 0, base, zc, 1.4, LAKE_STUPA * 0.85, 1.4);
  const n = stupaNiche({ height: LAKE_STUPA, look: 'white' });
  place(fr, S, buddhaStatue({ kind: 'meditate', look: 'gilt', height: n.height * 0.7, farOnly: true, hide: 80 }), 0, base + n.at.y, zc + n.at.z);
  // Candles on the upper step before him, a garland along its edge.
  const step = zc + 4.5 * 0.25;
  // (their light kept low: it bleaches the whitewash)
  for (const s of [-1, 1]) offer(fr, S, L, 'candle', s * 0.36, base, step - 0.16, { scale: 1.5, lamp: 0.4 });
  offer(fr, S, L, 'lotusVase', -0.72, base, step - 0.22, { scale: 1.1, ry: 0.5 });
  offer(fr, S, L, 'fruitPlate', 0.72, base, step - 0.2, { scale: 1.1, ry: -0.4 });
  marigolds(fr, S, [-1.1, base - 0.04, step + 0.03], [1.1, base - 0.04, step + 0.03], 0.1, 812);

  // The urn before it, on a stone.
  // (low: its sticks stay under the niche, seen from where he kneels)
  const uz = zc + 2.1;
  fr.b.box(0, 0.12, uz, 0.5, 0.24, 0.5, PLINTH.wall[0], 'mapStone', { src, shade: 0.95 });
  fr.b.box(0, 0.27, uz, 0.58, 0.06, 0.58, PLINTH.ledge[0], 'mapStone', { src });
  offer(fr, S, L, 'incense', 0, 0.3, uz, { scale: 2, sticks: 9, smoke: 1 });
  L.halos.push({ at: fr.point(0, 1.2, zc + 1.5), size: 2, strength: 0.12 });

  // The frangipani to its left, flowers in its crown; ferns.
  const tg = fr.grid(1, { seed: 820, mat: 'mapBark' });
  fr.ghostLand(tg, 1, -7, 7, -7, 5);
  growTree(tg, -4, fr.landRow(-4, -2, 1), -2, { trunk: 3, radius: 2.4, squash: 0.6, seed: 821, bark: [0x9a9282, 0x8f8878, 0xa39b8b], leaf: [0x4d7a2e, 0x5a8a34, 0x44702a], lean: [-1, 0] });
  const flowers: [number, number, number][] = [];
  tg.forEach((i, j, k, c) => {
    if (c.mat !== 'mapLeaf' || hash3(i, j, k, 822) > 0.75) return;
    // (on the top, and on the sides of the crown)
    for (const [dx, dy, dz] of [
      [0, 1, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
    ])
      if (!tg.has(i + dx, j + dy, k + dz)) {
        flowers.push([i + dx * 0.55, j + 0.5 + dy * 0.55, k + dz * 0.55]);
        break;
      }
  });
  tg.commit();
  for (const [x, y, z] of flowers) {
    const h = hash3(x * 3, y * 3, z * 3, 823);
    fr.b.box(x + (h - 0.5) * 0.4, y, z + (hash3(x, y, z, 824) - 0.5) * 0.4, 0.3, 0.14, 0.3, pickOf(FRANGIPANI, Math.round(x * 2), Math.round(y * 2), Math.round(z * 2), 825), 'petal', { src, ry: h * 1.5, shade: 1.08 });
  }
  steppingStones(fr, [0.4, 4.6], [0.1, 1.8], 1.1, 830, PATH_STONE);
  plantsAround(fr, { n: 26, r0: 2.4, r1: 6.5, seed: 831, flowers: 0.3, keepOut: (x, z) => (Math.abs(x) < 1.9 && z > -3.2) || (Math.abs(x) < 3.2 && Math.abs(z + 1.4) < 1.8) });
}

// ── The Kulen shrine ─────────────────────────────────────────────────────

/** The Kulen Buddha's height (m). */
const KULEN_BUDDHA = 1.2;

/**
 * A small stone sanctuary at the foot of Phnom Kulen (0.5 m cells): a
 * laterite platform with a step, a square cella with a doorway to the
 * trail and false doors on its other sides, three tiers and a lotus bud,
 * weathered and mossy, a small tree behind. Inside the doorway a gilt
 * Buddha calling the earth to witness, a saffron cloth over his shoulder,
 * sits on a sandstone pedestal, candles and an urn on a slab before him;
 * a big urn of incense on the step, lotus in vases, marigolds.
 */
export function kulenShrine(fr: SiteFrame, L: ShrineLights, S: Sculpted): void {
  const src = traceSource();
  const zc = -2.2;
  const g = fr.grid(0.5, { seed: 901, at: [0, 0, zc], ao: 0.34 });
  const R = RUIN_STONE;
  const P = putter(g);
  const wall = (i: number, j: number, k: number) => bondTone(R.wall, i, j, k, 902);
  const ledge = (i: number, j: number, k: number) => tone(R.ledge, i, j, k, 903);
  const deep = (i: number, j: number, k: number) => tone(R.deep, i, j, k, 904);
  fr.ghostLand(g, 0.5, -7, 7, -7, 7, [0, 0, zc]);
  // Platform, with a step to the front.
  for (let i = -5; i <= 5; i++)
    for (let k = -5; k <= 5; k++) for (let j = Math.min(0, fr.landRow(i * 0.5, zc + k * 0.5, 0.5)); j <= 0; j++) P(i, j, k, tone(LATERITE, i >> 1, j, k >> 1, 905), 'mapStone', 0.95);
  for (let i = -2; i <= 2; i++) P(i, 0, 6, ledge(i, 0, 6), 'mapStone', 0.9);
  // Cella: hollow, redented, the doorway (3 × 4) to the front.
  fillBox(g, -3, 3, 1, 7, -3, 3, (i, j, k) => (Math.abs(i) === 3 && Math.abs(k) === 3 ? null : Math.abs(i) < 3 && Math.abs(k) < 3 ? null : j === 7 ? ledge(i, j, k) : wall(i, j, k)), 'mapStone', (_i, j) => courseShade(j));
  fillBox(g, -2, 2, 7, 7, -2, 2, (i, j, k) => ledge(i, j, k));
  for (let j = 1; j <= 4; j++) for (let i = -1; i <= 1; i++) g.delete(i, j, 3);
  // The door frame stands out a little, a small pediment over it.
  for (let j = 1; j <= 5; j++) for (const i of [-2, 2]) P(i, j, 4, tone(R.light, i, j, 4, 906));
  for (let i = -2; i <= 2; i++) P(i, 5, 4, tone(R.light, i, 5, 4, 907));
  for (let i = -1; i <= 1; i++) P(i, 6, 4, tone(R.bright, i, 6, 4, 908));
  // False doors on the other sides.
  for (const [nx, nz] of [
    [1, 0],
    [-1, 0],
    [0, -1],
  ])
    for (let j = 1; j <= 4; j++)
      for (let a = -1; a <= 1; a++) {
        const [i, k] = [nx * 3 + (nz !== 0 ? a : 0), nz * 3 + (nx !== 0 ? a : 0)];
        P(i, j, k, deep(i, j, k), 'mapStone', 0.85);
      }
  // Tiers and the lotus bud.
  let j = 8;
  for (const h of [3, 2, 1]) {
    fillBox(g, -h, h, j, j + 1, -h, h, (i, jj, k) => (Math.abs(i) === h && Math.abs(k) === h ? null : jj === j + 1 ? ledge(i, jj, k) : wall(i, jj, k)));
    for (const [sx, sz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ])
      P(sx * h, j + 2, sz * h, tone(R.light, sx, j, sz, 909));
    j += 2;
  }
  P(0, j, 0, tone(R.light, 0, j, 0, 910));
  P(0, j + 1, 0, tone(R.bright, 0, j + 1, 0, 911));
  chip(g, { seed: 912, corner: 0.2, edge: 0.05, from: 8 });
  overgrow(g, { seed: 913, top: (_i, jj) => (jj < 2 ? 0.3 : 0.45), side: (_i, jj) => (jj < 3 ? 0.1 : 0.03), vines: 0.04, vineLen: [2, 4], cushion: 0.12, moss: R.moss });
  // (no vine across the doorway)
  for (let jj = 1; jj <= 5; jj++) for (let i = -1; i <= 1; i++) if (g.get(i, jj, 4)?.mat === 'mapLeaf') g.delete(i, jj, 4);
  g.commit();

  // The Buddha inside on his pedestal (0.1 m cells, on the cella's floor), facing out of the door.
  const floor = 0.5;
  const bz = zc - 0.5;
  const top = plinth(fr, { x: 0, y: floor, z: bz, cell: 0.1, hw: 6, hd: 4, seed: 920 });
  place(fr, S, buddhaStatue({ kind: 'shrine', look: 'gilt', height: KULEN_BUDDHA }), 0, top, bz);
  solidBody(S, 0, top, bz, 0.9, KULEN_BUDDHA * 0.9, 0.7);
  // Before him a low slab: candles, a small urn, lotus.
  const sz = zc + 0.45;
  fr.b.box(0, floor + 0.09, sz, 1.3, 0.18, 0.36, tone(PLINTH.ledge, 0, 0, 0, 921), 'mapStone', { src });
  for (const s of [-1, 1]) {
    offer(fr, S, L, 'candle', s * 0.32, floor + 0.18, sz + 0.02, { scale: 1.5 });
    offer(fr, S, L, 'lotusVase', s * 0.54, floor + 0.18, sz - 0.02, { scale: 1.05, ry: s * 0.5 });
  }
  offer(fr, S, L, 'incense', 0, floor + 0.18, sz, { scale: 1.3, sticks: 5, smoke: 0.5 });
  L.halos.push({ at: fr.point(0, 1.2, zc + 1.2), size: 2.2 });

  // The big urn on the step, lotus in vases beside it, marigolds along the platform's front edge.
  const uz = zc + 3.05;
  offer(fr, S, L, 'incense', 0, floor, uz, { scale: 2.4, sticks: 9, smoke: 1 });
  for (const s of [-1, 1]) offer(fr, S, L, 'lotusVase', s * 0.85, floor, uz - 0.05, { scale: 1.5, ry: s * 0.3 });
  marigolds(fr, S, [-1.25, floor - 0.03, zc + 2.78], [1.25, floor - 0.03, zc + 2.78], 0.04, 932);
  marigolds(fr, S, [-0.75, floor + 1.95, zc + 2.03], [0.75, floor + 1.95, zc + 2.03], 0.28, 933);

  // A tree behind, ferns about.
  const tg = fr.grid(1, { seed: 940, mat: 'mapBark' });
  fr.ghostLand(tg, 1, -8, 8, -10, 3);
  growTree(tg, 3, fr.landRow(3, -7, 1), -7, { trunk: 8, radius: 5, squash: 0.55, seed: 941, bark: TREE_BARK, lean: [-1, 1] });
  growTree(tg, -5, fr.landRow(-5, -5, 1), -5, { trunk: 5, radius: 3.5, squash: 0.6, seed: 942, lean: [-1, 0] });
  tg.commit();
  plantsAround(fr, { n: 30, r0: 3.2, r1: 7.5, seed: 943, keepOut: (x, z) => Math.abs(x) < 3.4 && z > -5.6 && z < 1.4 });
}
