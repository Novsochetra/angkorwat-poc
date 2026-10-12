import { Group } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { TRADER_AT, TRADER_CRATE, TRADER_POSTS, TRADER_SIGN, TRADER_STOOL, TRADER_STRAW, TRADER_TREE, TRADER_TROUGH, traderToWorld } from '../cattle/plan';
import { GROUND_CLEAR } from '../groundClear';
import { MkBuild, POST, tone, WOOD, type Tones } from '../hamlet/_mkKit';
import { signLetters, wordSize } from '../hamlet/_mkSign';
import type { HeightField } from '../heightfield';
import { ROAM_SCALE, type RoamWorld } from './types';

/**
 * The cattle trader's place on the Kulen foot meadow (where everything is:
 * cattle/plan.ts), roaming's own (in `env.scene`, the overview too), built once
 * when roaming is: a big old tamarind (អម្ពិល) for shade — a dark fluted trunk
 * leaning a little, its roots spreading, four limbs, a broad flat crown of fine
 * leaves, hollow under it —; his low wooden stool in its shade facing the
 * trail, an upturned crate beside it with his dented kettle and a glass of
 * tea; behind him a neat stack of rice-straw bundles (ចំបើង, each tied round
 * its middle: what he sells for feeding); a hollowed log trough with water for
 * the cattle; three tethering posts in front, each with its rope's loop (the
 * ropes to the animals are the herd's: roam/_cattleHerd.ts); and his
 * hand-painted sign on a post by the trail, "លក់គោ" (cattle for sale) in red
 * Koulen letters, painted on both faces, a white cow beside them.
 *
 * Families: wood, the stack and the sign `mapBark` (solid), leaves `mapLeaf`,
 * the kettle and the trough's water `mapStone`, the glass and the bare earth's
 * patches `petal` / `mapGrass`: a few draws. It is solid where it should be
 * (`installTraderWalk`): the trunk, the posts, the stool with him on it, the
 * crate, the stack, the trough, the sign's post; the crown is soft to the
 * follow camera (it keeps out of it, and sees through it near him: the map's
 * leaves fade). The meadow's wild ground cover keeps off it (`GROUND_CLEAR`),
 * and the land under it is taken (`occupy`: no garden there).
 */

const BARK: Tones = [0x4f3e30, 0x5a4636, 0x463628, 0x544030];
const LEAF: Tones = [0x4e7e2e, 0x5a8a34, 0x467428, 0x64963a, 0x3f6a24, 0x6ea040];
const STRAW: Tones = [0xd6b866, 0xcfae5a, 0xe0c474, 0xc8a650];
const TIE = 0x8a6430;
const WHITEWASH = [0xf2eee2, 0xebe6d8, 0xf4f1e6];

/** "លក់គោ" (cattle for sale), Koulen 24 px, as the nursery's sign is painted (`#` = paint). */
const SALE_WORD = [
  '...........................###...................................',
  '...........................###...................................',
  '...........................###...................................',
  '...........................###...................................',
  '...........................###...................................',
  '...........................###...................................',
  '...........................###...................................',
  '...........................###...................................',
  '.................................................................',
  '.#########.....####...############....####...##################..',
  '###########....####...############...#####...###################.',
  '###########...#####...############...#####...####################',
  '####...#####.####...................####....................#####',
  '####...#####.#####..................####....................#####',
  '####...#####..#####....##########....####.....##########....#####',
  '####...#####...####....###########....####....###########...#####',
  '####...#####...####...############....####...############...#####',
  '####...#####...####...#####...####....####...#####...####...#####',
  '####...#####...####...#####...####....####...#####...####...#####',
  '####...#####...####...#####...####....####...#####...####...#####',
  '####...#####...####...#####...####....####...#####...####...#####',
  '####...#####...####...#####...####....####...#######.####...#####',
  '####...#####...####...#####...####....####...#######.####...#####',
  '####...#####...####...#####...####....####...######..####...#####',
  '#####..############...#####...####....#####..######..####...#####',
  '#####...###########...#####...####....#####..#####...####...#####',
  '#####....#########....#####...####....#####..#####...####...#####',
];

/** A white cow in profile, painted by the words (`#` coat, `d` dark: horns, hooves, eye). */
const COW_PICTURE = [
  '.........d.d.',
  '.##......####',
  '#.#########d#',
  '..##########.',
  '..#########..',
  '..#.#...#.#..',
  '..d.d...d.d..',
];

export function buildTraderPlace(field: HeightField): { object: Group; blocks: number } {
  const t0 = performance.now();
  const g0 = field.heightAt(TRADER_AT.x, TRADER_AT.z);
  const mk = new MkBuild().at(TRADER_AT.x, g0, TRADER_AT.z, TRADER_AT.yaw, 7201);
  const gy = (lx: number, lz: number): number => {
    const [x, z] = traderToWorld(lx, lz);
    return field.heightAt(x, z) - g0;
  };
  tree(mk, gy);
  seat(mk, gy);
  straw(mk, gy);
  posts(mk, gy);
  trough(mk, gy);
  ground(mk, gy);
  sign(mk, field);
  // (the land under it taken: no tree, no garden, no wild cover)
  const [ax, az] = traderToWorld(-8, -6.5);
  const [bx, bz] = traderToWorld(7.5, 8.5);
  field.occupy(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz));
  const [cx, cz] = traderToWorld(-0.5, 1.5);
  GROUND_CLEAR.set(-7201, cx, cz, 7.5);
  const object = new Group();
  object.name = 'cattle:trader';
  object.add(buildVoxelMesh(mk.b, { name: 'cattle:trader' }));
  console.info(`[map] cattle trader: ${mk.b.boxes.length} blocks · built in ${(performance.now() - t0).toFixed(1)} ms`);
  return { object, blocks: mk.b.boxes.length };
}

type Ground = (lx: number, lz: number) => number;

/** The tamarind: a fluted trunk leaning a little, roots, four limbs, a broad flat crown hollow underneath, ragged at its rim. */
function tree(mk: MkBuild, gy: Ground): void {
  mk.src = traceSource();
  const T = TRADER_TREE;
  const g = gy(T.x, T.z);
  for (let j = 0; j < 5; j++) {
    const ox = T.x + Math.sin(j * 0.9) * 0.12 + j * 0.03;
    const oz = T.z + Math.cos(j * 1.3) * 0.1;
    const wd = T.r * 2 - j * 0.09;
    mk.box(ox, g + j * 0.88 + 0.44, oz, wd, 0.9, wd, tone(BARK, mk.r(j, 1)), 'mapBark');
    // (the flutes: ridges down its sides)
    mk.box(ox + wd * 0.5, g + j * 0.88 + 0.44, oz + 0.1, 0.24, 0.88, wd * 0.5, tone(BARK, mk.r(j, 5)), 'mapBark', 0.9);
    mk.box(ox - 0.1, g + j * 0.88 + 0.44, oz - wd * 0.5, wd * 0.55, 0.88, 0.24, tone(BARK, mk.r(j, 6)), 'mapBark', 0.92);
    mk.box(ox - wd * 0.5, g + j * 0.88 + 0.44, oz - 0.12, 0.22, 0.86, wd * 0.45, tone(BARK, mk.r(j, 7)), 'mapBark', 0.88);
  }
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.4;
    mk.box(T.x + Math.sin(a) * 0.8, g + 0.15, T.z + Math.cos(a) * 0.8, 0.55, 0.3, 0.5, tone(BARK, mk.r(k, 2)), 'mapBark', 0.9, 0, a);
  }
  const top = g + 4.2;
  const limbs: [number, number, number][] = [
    [1, 0.3, 5.7],
    [-0.9, 0.55, 6.0],
    [0.25, 1, 6.2],
    [-0.4, -0.85, 5.6],
  ];
  for (const [dx, dz, h] of limbs) {
    mk.rod(T.x, top, T.z, T.x + dx * 2.2, g + h, T.z + dz * 2.2, 0.55, 0.55, tone(BARK, mk.r(dx, dz, 3)), 'mapBark');
    mk.rod(T.x + dx * 2.2, g + h, T.z + dz * 2.2, T.x + dx * 3.5, g + h + 0.7, T.z + dz * 3.5, 0.38, 0.38, tone(BARK, mk.r(dz, dx, 4)), 'mapBark');
  }
  // The crown: a broad flat umbrella of fine leaves, hollow under it, ragged at the rim, a few gaps.
  const R = T.cr;
  const n = Math.ceil(R);
  for (let i = -n; i <= n; i++)
    for (let j = -2; j <= 3; j++)
      for (let k = -n; k <= n; k++) {
        const dy = j * 0.8;
        const d = Math.hypot(i / R, dy / 2.1, k / R) + (mk.r(i, j, k) - 0.5) * 0.28;
        if (d > 1 || (d < 0.66 && j < 2)) continue;
        if (mk.r(k, i, j + 9) < 0.08) continue;
        const shade = 0.8 + 0.3 * ((j + 2) / 5);
        mk.box(T.cx + i * 0.97, g + T.cy + dy, T.cz + k * 0.97, 1, 0.85, 1, tone(LEAF, mk.r(k, i, j + 3)), 'mapLeaf', shade);
      }
}

/** His low stool facing the trail; the upturned crate beside it with his kettle and a glass of tea; a krama folded on it. */
function seat(mk: MkBuild, gy: Ground): void {
  mk.src = traceSource();
  const S = TRADER_STOOL;
  const sg = gy(S.x, S.z);
  mk.box(S.x, sg + 0.1, S.z, 0.32, 0.2, 0.28, tone(POST, 0.3), 'mapBark', 0.95);
  mk.box(S.x, sg + 0.215, S.z, 0.36, 0.03, 0.32, tone(WOOD, 0.6), 'mapBark');
  const C = TRADER_CRATE;
  const cg = gy(C.x, C.z);
  mk.box(C.x, cg + 0.17, C.z, 0.42, 0.34, 0.36, tone(WOOD, 0.2), 'mapBark', 0.92);
  for (const y of [0.08, 0.26]) mk.box(C.x, cg + y, C.z, 0.44, 0.03, 0.38, tone(WOOD, 0.8), 'mapBark', 0.85);
  // (the kettle: dented aluminium, its spout and handle; the glass of tea, amber)
  mk.box(C.x - 0.08, cg + 0.42, C.z, 0.18, 0.16, 0.18, 0x9aa0a4, 'mapStone', 1.05);
  mk.box(C.x - 0.08, cg + 0.51, C.z, 0.12, 0.03, 0.12, 0x7a8084, 'mapStone');
  mk.rod(C.x + 0.01, cg + 0.42, C.z, C.x + 0.1, cg + 0.5, C.z, 0.04, 0.04, 0x8a9094, 'mapStone');
  mk.box(C.x - 0.08, cg + 0.56, C.z, 0.14, 0.02, 0.03, 0x3a3634, 'mapStone');
  mk.box(C.x + 0.12, cg + 0.39, C.z + 0.08, 0.06, 0.09, 0.06, 0xb87a2a, 'petal');
  // (his krama, red and white check, folded on the crate)
  mk.box(C.x + 0.08, cg + 0.355, C.z - 0.09, 0.2, 0.025, 0.14, 0xc8423a, 'petal');
  mk.box(C.x + 0.08, cg + 0.36, C.z - 0.09, 0.2, 0.026, 0.03, 0xf0ece0, 'petal');
}

/** The stack of rice-straw bundles behind him: three rows, each bundle tied round its middle, a few loose straws. */
function straw(mk: MkBuild, gy: Ground): void {
  mk.src = traceSource();
  const S = TRADER_STRAW;
  const g = gy(S.x, S.z);
  const rows = [5, 4, 3];
  let y = 0.17;
  for (let r = 0; r < rows.length; r++) {
    const n = rows[r];
    for (let k = 0; k < n; k++) {
      const z = S.z - S.hd + 0.14 + ((2 * S.hd - 0.28) * (k + 0.5)) / n + (r % 2) * 0.05;
      const tilt = (mk.r(r, k, 1) - 0.5) * 0.1;
      mk.box(S.x, g + y, z, S.hw * 2, 0.3, 0.3, tone(STRAW, mk.r(r, k, 2)), 'mapBark', 0.95 + mk.r(r, k, 3) * 0.1, 0, tilt);
      mk.box(S.x + (mk.r(k, r, 4) - 0.5) * 0.2, g + y, z, 0.12, 0.33, 0.33, TIE, 'mapBark');
      // (its ends fanning a little wider)
      for (const e of [-1, 1]) mk.box(S.x + e * (S.hw - 0.08), g + y, z, 0.18, 0.34, 0.36, tone(STRAW, mk.r(r, k, 5 + e)), 'mapBark', 1.05);
    }
    y += 0.29;
  }
  for (let k = 0; k < 5; k++) mk.box(S.x + (mk.r(k, 7) - 0.5) * 2.2, g + 0.015, S.z + S.hd + 0.2 + mk.r(k, 8) * 0.4, 0.5, 0.02, 0.05, tone(STRAW, mk.r(k, 9)), 'petal', 1, 0, 0, 0);
}

/** The tethering posts: rough wood, the rope's loop tied round each a little under its top. */
function posts(mk: MkBuild, gy: Ground): void {
  mk.src = traceSource();
  for (const [k, p] of TRADER_POSTS.entries()) {
    const g = gy(p.x, p.z);
    mk.box(p.x, g + 0.55, p.z, 0.14, 1.1, 0.14, tone(POST, mk.r(k, 11)), 'mapBark', 0.95);
    mk.box(p.x, g + 1.12, p.z, 0.1, 0.06, 0.1, tone(POST, mk.r(k, 12)), 'mapBark', 0.85);
    mk.box(p.x, g + 0.85, p.z, 0.2, 0.06, 0.2, 0x9a8058, 'mapBark');
    // (worn earth round it, where they stand and stamp: a patch or two, the grass gone)
    const d = 1.1 + p.size * 0.6;
    mk.box(p.x + Math.sin(p.out) * d, g + 0.012, p.z + Math.cos(p.out) * d, 1.3 * p.size, 0.02, 1.0 * p.size, 0x8f7652, 'mapGrass', 0.98, 0, p.out + 0.3);
    mk.box(p.x + Math.sin(p.out) * 0.4, g + 0.014, p.z + Math.cos(p.out) * 0.4, 0.8, 0.02, 0.7, 0x94795a, 'mapGrass', 1, 0, p.out - 0.4);
  }
}

/** The log trough with water, on two chocks. */
function trough(mk: MkBuild, gy: Ground): void {
  mk.src = traceSource();
  const T = TRADER_TROUGH;
  const g = gy(T.x, T.z);
  for (const e of [-1, 1]) mk.box(T.x + e * (T.len / 2 - 0.25), g + 0.08, T.z, 0.18, 0.16, 0.5, tone(POST, 0.6), 'mapBark');
  mk.box(T.x, g + 0.3, T.z - 0.2, T.len, 0.3, 0.1, tone(BARK, 0.3), 'mapBark');
  mk.box(T.x, g + 0.3, T.z + 0.2, T.len, 0.3, 0.1, tone(BARK, 0.5), 'mapBark');
  mk.box(T.x, g + 0.18, T.z, T.len, 0.08, 0.42, tone(BARK, 0.7), 'mapBark');
  for (const e of [-1, 1]) mk.box(T.x + e * (T.len / 2 - 0.05), g + 0.3, T.z, 0.1, 0.3, 0.36, tone(BARK, 0.2), 'mapBark');
  mk.box(T.x, g + 0.39, T.z, T.len - 0.2, 0.02, 0.3, 0x4a6a6a, 'mapStone', 0.9);
}

/** Bare trodden earth under the tree and before his stool, a few pats of dung. */
function ground(mk: MkBuild, gy: Ground): void {
  mk.src = traceSource();
  const g = gy(0, 0);
  mk.box(-0.3, g + 0.012, 0.2, 3.4, 0.02, 2.8, 0x927552, 'mapGrass', 0.98, 0, 0.12);
  mk.box(-0.5, g + 0.013, 1.9, 1.5, 0.02, 1.6, 0x9a7d58, 'mapGrass', 1.02, 0, -0.2);
  for (let k = 0; k < 4; k++) mk.box(-4 + k * 2.6 + mk.r(k, 21), g + 0.03, 4.2 + mk.r(k, 22) * 1.4, 0.26, 0.05, 0.22, 0x5a4a30, 'mapGrass', 0.9);
}

/** His sign by the trail: a whitewashed board on a post, "លក់គោ" in red on both faces, a little white cow by the words. */
function sign(mk: MkBuild, field: HeightField): void {
  const S = TRADER_SIGN;
  const [x, z] = traderToWorld(S.x, S.z);
  mk.at(x, field.heightAt(x, z), z, TRADER_AT.yaw + S.turn, 7202);
  mk.src = traceSource();
  const w = S.w;
  mk.box(0, 0.9, 0.06, 0.12, 1.8, 0.12, tone(POST, 0.4), 'mapBark');
  const y0 = 1.02;
  const y1 = 1.74;
  const ph = (y1 - y0) / 2;
  for (let k = 0; k < 2; k++) mk.box(0, y0 + ph * (k + 0.5), 0.06, w, ph - 0.012, 0.06, WHITEWASH[k], 'mapBark', 0.98 + mk.r(k, 32) * 0.04);
  const px = 0.0145;
  const [ww] = wordSize(SALE_WORD);
  const [cw, ch] = wordSize(COW_PICTURE);
  const cp = 0.034;
  for (const face of [-1, 1]) {
    const zf = 0.06 + face * 0.031;
    mk.box(0, y1 - 0.02, zf, w - 0.02, 0.025, 0.008, 0xb8302a, 'mapBark');
    mk.box(0, y0 + 0.02, zf, w - 0.02, 0.025, 0.008, 0xb8302a, 'mapBark');
    // (the words left of the middle, the cow right of them, as read from that face)
    const wx = -face * ((cw * cp) / 2 + 0.03);
    signLetters(mk, SALE_WORD, wx, (y0 + y1) / 2 + 0.01, 0.06, px, face, 0xb02c26);
    const cx = face * ((ww * px) / 2 + 0.05);
    const dir = face < 0 ? -1 : 1;
    COW_PICTURE.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        const ch2 = row[c];
        if (ch2 === '.') continue;
        const u = (c + 0.5) * cp - (cw * cp) / 2;
        const v = (ch * cp) / 2 - (r + 0.5) * cp;
        mk.box(cx + dir * u, (y0 + y1) / 2 + v, 0.06 + face * 0.045, cp, cp, 0.03, ch2 === 'd' ? 0x2e2826 : 0xf2efe6, 'mapBark', 1.05);
      }
    });
  }
  mk.at(TRADER_AT.x, field.heightAt(TRADER_AT.x, TRADER_AT.z), TRADER_AT.z, TRADER_AT.yaw, 7201);
}

/** Solid parts (map m): circles (x, z, r) and boxes (local x, z, half w, half d), up to a top over the land (m). */
interface Solid {
  x: number;
  z: number;
  r: number;
  top: number;
}

/**
 * His place in the walk map (roam/walkmap.ts is made once from the map's parts; this is roaming's own): the trunk,
 * the posts, the stool (with him on it), the crate, the straw stack, the trough and the sign's post are walls to his
 * feet up to their tops; the crown keeps the follow camera out softly (as his garden's trees: roam/_gardenWalk.ts).
 * Laid over the world's `standAt`, `clearance` and `softClearance`; elsewhere every answer is the world's own.
 */
export function installTraderWalk(world: RoamWorld): void {
  const f = world.field;
  const g0 = f.heightAt(TRADER_AT.x, TRADER_AT.z);
  // (a wall at least as wide as the walker's probes need to feel it: _gardenWalk.ts `WALL_MIN`)
  const WALL = 0.3 * ROAM_SCALE * 0.5 + 0.03;
  const solids: Solid[] = [];
  const add = (lx: number, lz: number, r: number, top: number) => {
    const [x, z] = traderToWorld(lx, lz);
    solids.push({ x, z, r: Math.max(WALL, r), top });
  };
  add(TRADER_TREE.x, TRADER_TREE.z, TRADER_TREE.r + 0.1, 4.6);
  for (const p of TRADER_POSTS) add(p.x, p.z, 0.08, 1.15);
  add(TRADER_STOOL.x, TRADER_STOOL.z, 0.42, 1.6);
  add(TRADER_CRATE.x, TRADER_CRATE.z, 0.24, 0.6);
  // (the stack and the trough as rows of circles along them)
  for (let k = -1; k <= 1; k++) add(TRADER_STRAW.x, TRADER_STRAW.z + k * 0.48, 0.55, 0.95);
  for (let k = -1; k <= 1; k++) add(TRADER_TROUGH.x + k * 0.7, TRADER_TROUGH.z, 0.32, 0.45);
  add(TRADER_SIGN.x, TRADER_SIGN.z, 0.08, 1.8);
  const [tx, tz] = traderToWorld(TRADER_TREE.cx, TRADER_TREE.cz);
  const crown = { x: tx, z: tz, r: TRADER_TREE.cr * 0.92, y0: g0 + TRADER_TREE.low, y1: g0 + TRADER_TREE.cy + 2.6 };
  const reach = 12;
  const near = (x: number, z: number) => Math.abs(x - TRADER_AT.x) < reach && Math.abs(z - TRADER_AT.z) < reach;
  const { standAt, clearance, softClearance } = world;
  if (standAt)
    world.standAt = (x, z, y, up, h) => {
      if (near(x, z))
        for (const s of solids) {
          const ex = x - s.x;
          const ez = z - s.z;
          if (ex * ex + ez * ez < s.r * s.r && y < g0 + s.top && y + h > g0) return NaN;
        }
      return standAt(x, z, y, up, h);
    };
  /** Part of the way a → b (0‥1) before it enters a solid (`isCrown`: the crown, softly), from a; 1 if none. */
  const cut = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, isCrown: boolean, leave: boolean): number => {
    if (!near(ax, az) && !near(bx, bz) && !near((ax + bx) / 2, (az + bz) / 2)) return 1;
    let best = 1;
    if (isCrown) best = hit(ax, ay, az, bx, by, bz, crown.x, crown.z, crown.r, crown.y0, crown.y1, leave, best);
    else for (const s of solids) if (s.top > 0.9) best = hit(ax, ay, az, bx, by, bz, s.x, s.z, s.r, g0, g0 + s.top, leave, best);
    return best;
  };
  if (clearance) world.clearance = (ax, ay, az, bx, by, bz) => Math.min(clearance(ax, ay, az, bx, by, bz), cut(ax, ay, az, bx, by, bz, false, false));
  if (softClearance) world.softClearance = (ax, ay, az, bx, by, bz, leave) => Math.min(softClearance(ax, ay, az, bx, by, bz, leave), cut(ax, ay, az, bx, by, bz, true, leave ?? false));
}

/** The way a → b against an upright cylinder (middle cx, cz, radius r, from lo to hi): the part of the way before it enters it, if less than `best`; a in it: 0 (unless `leave`). No allocation. */
function hit(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cz: number, r: number, lo: number, hi: number, leave: boolean, best: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const fx = ax - cx;
  const fz = az - cz;
  const C = fx * fx + fz * fz - r * r;
  if (C <= 0 && ay >= lo && ay <= hi) return leave ? best : 0;
  const A = dx * dx + dz * dz;
  if (C > 0 && A > 1e-9) {
    const B = 2 * (fx * dx + fz * dz);
    const disc = B * B - 4 * A * C;
    if (disc >= 0) {
      const u = (-B - Math.sqrt(disc)) / (2 * A);
      const y = ay + (by - ay) * u;
      if (u >= 0 && u < best && y >= lo && y <= hi) return u;
    }
  }
  return best;
}
