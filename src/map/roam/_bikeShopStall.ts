import type { Group } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { BAMBOO, MkBuild, POST, stool, table, TARPS, tarp, tone } from '../hamlet/_mkKit';
import { signLetters, wordSize } from '../hamlet/_mkSign';
import type { HeightField } from '../heightfield';
import { BIKE_SHOP, SHOP_BENCH, SHOP_DISPLAY, SHOP_MENDING, SHOP_SIGN, SHOP_STOOL, SHOP_TARP, shopLocal } from './_bikeShopPlan';
import { MEND_WORD, SALE_WORD } from './_bikeShopSign';
import type { RoamWorld } from './types';

/**
 * The bicycle shop's stall (roam/_bikeShop.ts builds it once into roaming's
 * scene; where everything stands: _bikeShopPlan.ts), in the market's blocks
 * (hamlet/_mkKit.ts: its box writer, poles, tarp, table and stool; the same
 * families, so no new shader): a faded blue tarp on four bamboo poles, the
 * workbench along the back of its west half (a vice, spanners, a tin of
 * grease and a rag, a red toolbox under it), the mechanic's low stool, an old
 * green bicycle upside down on its saddle and bars before it with its front
 * wheel off and leaning on the bench, a basin of water for finding punctures
 * with an inner tube in it, a foot pump and a tall hand pump by the front post,
 * inner tubes and tyres hanging from the front pole, rims on the back one, a
 * stack of tyres, the painted sign "ជួសជុលកង់" over the front and a small
 * "លក់កង់" board by the bicycles for sale (those three are the bicycle add-on's
 * models: roam/_bike.ts), oil-dark earth under it all.
 *
 * Its solid parts go into the walk map (`installShopWalk`: the map's own is
 * made from the built parts, roaming's scene is not in it): the workbench and
 * the mending corner, the row of bicycles for sale, the pumps and the basin,
 * the poles — walls to his feet, his bicycle and the dog's way-finding, and to
 * the follow camera. ≈ 400 blocks, four families (a draw each, and its shadow).
 */

const OLD_GREEN = 0x2f6a4a;
const TYRE = 0x1e1c1c;
const TUBE = 0x2a2422;
const RIM = 0xb8b8bc;
const STEEL = 0x8a8a90;
const RED = 0xc23a30;
const WHITEWASH = [0xf2eee2, 0xebe6d8, 0xf4f1e6];

/** A ring of `n` boxes in the frame's x-y plane (facing +z) round (x, y, z): `r` its radius, `t` thick, `d` deep; `sy` squashes it (a hanging tube). */
function ring(mk: MkBuild, x: number, y: number, z: number, r: number, t: number, d: number, color: number, mat: 'metal' | 'mapBark', n = 12, sy = 1): void {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const len = ((2 * Math.PI * r) / n) * 1.12;
    mk.box(x + Math.sin(a) * r, y + Math.cos(a) * r * sy, z, len, t, d, color, mat, 0.96 + mk.r(k, x, y) * 0.08, 0, 0, -a);
  }
}

/** A ring lying flat (a tyre on the ground: in the x-z plane) round (x, y, z). */
function flatRing(mk: MkBuild, x: number, y: number, z: number, r: number, t: number, h: number, color: number, n = 10): void {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const len = ((2 * Math.PI * r) / n) * 1.12;
    mk.box(x + Math.sin(a) * r, y, z + Math.cos(a) * r, len, h, t, color, 'metal', 0.95 + mk.r(k, z) * 0.08, 0, a);
  }
}

/** Build the stall's blocks (map metres) on the ground of `field`. */
export function buildShopStall(field: HeightField): { object: Group; blocks: number } {
  const mk = new MkBuild();
  const ground = field.heightAt(BIKE_SHOP.x, BIKE_SHOP.z);
  mk.at(BIKE_SHOP.x, ground, BIKE_SHOP.z, BIKE_SHOP.yaw, 7301);
  mk.src = traceSource();

  // ── Oil-dark earth under it ──
  for (let i = -2; i <= 2; i++)
    for (let j = -1; j <= 1; j++) {
      const dark = [0x5e4e3c, 0x66543f, 0x584a3a, 0x6c5a44][Math.floor(mk.r(i, j) * 4)];
      mk.box(i * 1.05 + (mk.r(j, i, 2) - 0.5) * 0.1, 0.02, j * 1.05 - 0.05, 0.98, 0.04, 0.98, dark, 'mapBark', 0.96 + mk.r(i, j, 3) * 0.06);
    }

  // ── The tarp on its four poles (stays up: the stall is a fixture) ──
  tarp(mk, SHOP_TARP.w, SHOP_TARP.d, SHOP_TARP.front, SHOP_TARP.back, TARPS.tarpBlue, 0, 0, false, false);

  // ── The workbench along the back of the west half, its tools ──
  const B = SHOP_BENCH;
  const bx = (B.x0 + B.x1) / 2;
  const bz = (B.z0 + B.z1) / 2;
  table(mk, bx, bz, B.x1 - B.x0, B.z1 - B.z0, B.h, true);
  // (a vice bolted at its west end, its jaws and handle)
  mk.box(B.x1 - 0.25, B.h + 0.08, bz + 0.15, 0.16, 0.16, 0.2, 0x4a5a6a, 'metal');
  mk.box(B.x1 - 0.25, B.h + 0.19, bz + 0.15, 0.2, 0.06, 0.06, 0x3a4a5a, 'metal');
  mk.box(B.x1 - 0.25, B.h + 0.1, bz + 0.3, 0.24, 0.025, 0.025, STEEL, 'metal');
  // (spanners laid out, a hammer, a tin of grease with its red label, a rag, a tray of nuts and bolts)
  for (let k = 0; k < 4; k++) mk.box(B.x0 + 0.25 + k * 0.11, B.h + 0.012, bz + 0.12, 0.035, 0.02, 0.24 + k * 0.02, STEEL, 'metal', 0.95 + k * 0.03, 0, 0.12 * (k - 1.5));
  mk.box(B.x0 + 0.78, B.h + 0.025, bz - 0.08, 0.06, 0.05, 0.3, 0x6a4a2a, 'mapBark');
  mk.box(B.x0 + 0.78, B.h + 0.04, bz + 0.07, 0.1, 0.08, 0.06, 0x3a3a3e, 'metal');
  mk.box(B.x0 + 1.12, B.h + 0.07, bz - 0.12, 0.16, 0.14, 0.16, 0x3a3a3e, 'metal');
  mk.box(B.x0 + 1.12, B.h + 0.08, bz - 0.12, 0.165, 0.07, 0.165, RED, 'metal');
  mk.box(B.x0 + 0.98, B.h + 0.015, bz + 0.12, 0.24, 0.03, 0.18, 0xd8cdb0, 'mapBark', 0.9, 0, 0.3);
  mk.box(B.x0 + 0.42, B.h + 0.03, bz - 0.15, 0.24, 0.05, 0.16, 0x7a6a50, 'mapBark');
  for (let k = 0; k < 5; k++) mk.box(B.x0 + 0.34 + k * 0.04, B.h + 0.065, bz - 0.15 + (mk.r(k, 6) - 0.5) * 0.08, 0.025, 0.025, 0.025, 0xa8a8ae, 'metal');
  // (a red toolbox on the shelf under it)
  mk.box(B.x0 + 0.45, 0.4, bz, 0.42, 0.22, 0.22, RED, 'metal');
  mk.box(B.x0 + 0.45, 0.53, bz, 0.24, 0.03, 0.04, 0x2a2a2a, 'metal');

  // ── His low stool, the old green bicycle upside down before it (its front wheel off, leaning on the bench) ──
  stool(mk, SHOP_STOOL.x, SHOP_STOOL.z, 0x2a6ab0, 0.32);
  mending(mk);

  // ── The basin of water he finds punctures in, a tube in it ──
  const [wx, wz] = [2.12, 1.48];
  for (const a of [0, Math.PI / 4]) mk.box(wx, 0.11, wz, 0.62, 0.22, 0.62, 0xa4a8ae, 'metal', 1, 0, a);
  for (const a of [0, Math.PI / 4]) mk.box(wx, 0.205, wz, 0.54, 0.02, 0.54, 0x5f8494, 'metal', 1.05, 0, a);
  ring(mk, wx, 0.26, wz, 0.2, 0.035, 0.035, TUBE, 'metal', 10, 0.55);

  // ── The pumps outside the front west post: a foot pump on the ground, a tall hand pump standing ──
  const [fx, fz] = [2.95, 1.5];
  mk.box(fx, 0.02, fz, 0.16, 0.04, 0.32, 0x2a2a2a, 'metal');
  mk.box(fx, 0.08, fz - 0.03, 0.09, 0.09, 0.26, RED, 'metal', 1, 0.25);
  mk.box(fx, 0.15, fz + 0.1, 0.13, 0.03, 0.12, 0x2a2a2a, 'metal', 1, -0.35);
  const [hx, hz] = [2.92, 1.02];
  mk.box(hx, 0.015, hz, 0.24, 0.03, 0.1, 0x3a3a3a, 'metal');
  mk.box(hx, 0.42, hz, 0.07, 0.8, 0.07, 0x2f5f9a, 'metal');
  mk.box(hx, 0.86, hz, 0.025, 0.12, 0.025, STEEL, 'metal');
  mk.box(hx, 0.93, hz, 0.32, 0.045, 0.05, 0x1e1e1e, 'metal');
  mk.rod(hx, 0.1, hz + 0.04, hx - 0.18, 0.08, hz + 0.25, 0.025, 0.025, 0x1e1e1e, 'metal');

  // ── Inner tubes and tyres hanging from the front pole, rims from the back one ──
  const zf = SHOP_TARP.d / 2 + 0.35;
  const zb = -SHOP_TARP.d / 2 - 0.1;
  for (const [x, r, c, sq] of [
    [1.95, 0.27, TUBE, 1.35],
    [1.5, 0.3, TYRE, 1],
    [1.06, 0.26, 0x8a2a22, 1.3],
    [0.62, 0.29, TUBE, 1.4],
  ] as const) {
    const top = SHOP_TARP.front - 0.05;
    mk.box(x, top - 0.02, zf, 0.06, 0.07, 0.06, tone(BAMBOO, mk.r(x, 7)), 'mapBark');
    ring(mk, x, top - 0.06 - r * sq, zf, r, c === TYRE ? 0.07 : 0.04, c === TYRE ? 0.06 : 0.04, c, 'metal', 12, sq);
  }
  for (const [x, r] of [
    [1.6, 0.32],
    [0.75, 0.3],
    [-0.4, 0.31],
  ] as const) {
    const top = SHOP_TARP.back - 0.04;
    ring(mk, x, top - 0.05 - r, zb + 0.02, r, 0.035, 0.03, RIM, 'metal', 12);
    mk.box(x, top - 0.05 - r, zb + 0.02, 0.05, 0.05, 0.05, STEEL, 'metal');
  }
  // (a stack of new tyres by the back pole, a spare wheel leaning on it)
  for (let k = 0; k < 4; k++) flatRing(mk, -0.05, 0.045 + k * 0.085, -1.22, 0.3, 0.06, 0.08, TYRE);
  ring(mk, 0.12, 0.33, zb + 0.18, 0.31, 0.06, 0.05, TYRE, 'metal', 12);
  ring(mk, 0.12, 0.33, zb + 0.18, 0.24, 0.03, 0.04, RIM, 'metal', 10);

  // ── The signs: "ជួសជុលកង់" on a whitewashed board over the front pole; "លក់កង់" by the bicycles for sale ──
  // (the big board stands on the front pole, wired to it, before the tarp's hem)
  signBoard(mk, MEND_WORD, SHOP_SIGN.x, SHOP_SIGN.y, zf + SHOP_SIGN.z, SHOP_SIGN.w, SHOP_SIGN.h, 0.0185, 0xb02c26, true);
  for (const e of [-1, 1]) mk.box(SHOP_SIGN.x + e * (SHOP_SIGN.w / 2 - 0.3), SHOP_TARP.front + 0.04, zf + SHOP_SIGN.z - 0.06, 0.03, 0.1, 0.16, 0x9a9a9a, 'metal');
  // (the small board on two short legs before the row of bicycles, side-on to the street)
  const [sx, sz] = [-1.05, 1.32];
  for (const e of [-1, 1]) mk.box(sx + e * 0.42, 0.42, sz, 0.06, 0.84, 0.06, tone(POST, mk.r(e, 8)), 'mapBark');
  signBoard(mk, SALE_WORD, sx, 0.66, sz + 0.035, 0.98, 0.42, 0.019, 0x2a5a9a, false);

  const object = buildVoxelMesh(mk.b, { quality: 'medium', name: 'bikeShop' });
  return { object, blocks: mk.b.boxes.length };
}

/** A whitewashed board (`w` × `h`, its middle at (x, y, z)), a painted edge, the word painted on its front face. */
function signBoard(mk: MkBuild, word: readonly string[], x: number, y: number, z: number, w: number, h: number, px: number, ink: number, edgeRed: boolean): void {
  const n = 3;
  for (let k = 0; k < n; k++) mk.box(x, y - h / 2 + (h / n) * (k + 0.5), z, w, h / n - 0.01, 0.05, WHITEWASH[k], 'mapBark', 0.98 + mk.r(k, x, 9) * 0.04);
  const edge = edgeRed ? 0xb8302a : 0x2a5a9a;
  const zf = z + 0.027;
  mk.box(x, y + h / 2 - 0.022, zf, w - 0.02, 0.03, 0.008, edge, 'mapBark');
  mk.box(x, y - h / 2 + 0.022, zf, w - 0.02, 0.03, 0.008, edge, 'mapBark');
  for (const e of [-1, 1]) mk.box(x + e * (w / 2 - 0.022), y, zf, 0.03, h - 0.02, 0.008, edge, 'mapBark');
  const [, rows] = wordSize(word);
  // (painted a little high on the board: the subscripts and the vowels under the line have room)
  signLetters(mk, word, x, y + Math.min(0.02, (h - rows * px) / 4), z, px, 1, ink);
}

/**
 * The old green bicycle he is mending: upside down on its saddle and bars, lying along the frame's x before his stool
 * (its front to −x), the back wheel on, the front one off and leaning on the bench's front.
 */
function mending(mk: MkBuild): void {
  const M = SHOP_MENDING;
  // (the bicycle's own: `u` along it, + to its front; `v` up from the ground, upside down)
  const at = (u: number): number => M.x - u;
  const z = M.z;
  const r = 0.34;
  const hub = 0.52;
  // The back wheel, up in the air, its tyre and rim; the back hub's axle.
  ring(mk, at(-0.4), hub, z, r - 0.025, 0.05, 0.05, TYRE, 'metal', 14);
  ring(mk, at(-0.4), hub, z, r - 0.07, 0.022, 0.03, RIM, 'metal', 12);
  mk.box(at(-0.4), hub, z, 0.05, 0.05, 0.12, STEEL, 'metal');
  // The frame upside down: the stays to the back hub, the two curved tubes, the seat tube to the saddle on the ground.
  const bb: [number, number] = [0.1, 0.57];
  mk.rod(at(bb[0]), bb[1], z, at(-0.4), hub, z, 0.035, 0.035, OLD_GREEN, 'metal');
  mk.rod(at(-0.06), 0.14, z, at(-0.4), hub, z, 0.03, 0.03, OLD_GREEN, 'metal');
  mk.rod(at(bb[0]), bb[1], z, at(-0.04), 0.16, z, 0.04, 0.04, OLD_GREEN, 'metal');
  mk.rod(at(bb[0]), bb[1], z, at(0.42), 0.38, z, 0.04, 0.04, OLD_GREEN, 'metal');
  mk.rod(at(0.42), 0.38, z, at(0.55), 0.05, z, 0.045, 0.045, OLD_GREEN, 'metal');
  // (the saddle on the ground, the bars upside down on it, the empty fork up)
  mk.box(at(-0.06), 0.035, z, 0.24, 0.07, 0.16, 0x2e2420, 'mapBark');
  mk.box(at(0.6), 0.03, z, 0.06, 0.05, 0.62, 0xc4c4c8, 'metal');
  for (const e of [-1, 1]) mk.box(at(0.6), 0.03, z + e * 0.28, 0.07, 0.06, 0.1, 0x2a2a2a, 'metal');
  for (const e of [-1, 1]) mk.rod(at(0.55), 0.08, z + e * 0.05, at(0.74), hub, z + e * 0.05, 0.026, 0.026, OLD_GREEN, 'metal');
  // The cranks and the chain case, the pedals up.
  mk.box(at(bb[0]), bb[1], z - 0.08, 0.2, 0.2, 0.014, OLD_GREEN, 'metal');
  for (const e of [-1, 1]) mk.box(at(bb[0]) + e * 0.08, bb[1] + e * 0.1, z + e * 0.1, 0.03, 0.18, 0.03, STEEL, 'metal', 1, 0, 0, e * 0.6);
  // The front wheel off, leaning on the bench's front, and a tyre lever on the ground.
  const B = SHOP_BENCH;
  const lx = B.x0 + 0.5;
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    const len = ((2 * Math.PI * (r - 0.025)) / 14) * 1.12;
    // (in the frame's x-y plane, tilted back against the bench: about x)
    mk.box(lx + Math.sin(a) * (r - 0.025), r + Math.cos(a) * (r - 0.025) * 0.97, B.z1 + 0.12 - Math.cos(a) * 0.08, len, 0.05, 0.05, TYRE, 'metal', 1, 0.24, 0, -a);
  }
  mk.box(lx, r, B.z1 + 0.12, 0.05, 0.05, 0.12, STEEL, 'metal', 1, 0.24);
  mk.box(at(0.2), 0.012, z + 0.42, 0.03, 0.02, 0.2, 0x3a3a8a, 'metal', 1, 0, 0.6);
}

// ── The walk map: the stall's solid parts ───────────────────────────────────

/** A solid part (local box, its top over the stall's ground, m). */
interface Solid {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
  readonly top: number;
}

/** The poles: where `tarp()` stands them (local), as boxes a little wider than the pole. */
const POLE = 0.14;
const pole = (x: number, z: number, top: number): Solid => ({ x0: x - POLE, x1: x + POLE, z0: z - POLE, z1: z + POLE, top });
const PX = SHOP_TARP.w / 2 + 0.15;
const PZF = SHOP_TARP.d / 2 + 0.35;
const PZB = -SHOP_TARP.d / 2 - 0.1;
/** The slanted row's reach across (local x): each bicycle ±0.75 m round its middle that way. */
const [DX0, DX1] = [Math.min(...SHOP_DISPLAY.map(([x]) => x)) - 0.85, Math.max(...SHOP_DISPLAY.map(([x]) => x)) + 0.65];

export const SOLIDS: readonly Solid[] = [
  // (the workbench and the mending corner with his stool: one block, he never walks among the tools)
  { x0: SHOP_BENCH.x0 - 0.05, x1: SHOP_BENCH.x1 + 0.12, z0: SHOP_BENCH.z0 - 0.1, z1: SHOP_MENDING.z + 0.22, top: 1.0 },
  // (the row of bicycles for sale, slanted: from the back wheels to the baskets)
  { x0: DX0, x1: DX1, z0: -1.1, z1: 0.85, top: 1.1 },
  // (the small sign before them, the basin, the pumps outside the west post)
  { x0: -1.55, x1: -0.55, z0: 1.2, z1: 1.45, top: 0.9 },
  { x0: 1.78, x1: 2.46, z0: 1.12, z1: 1.82, top: 0.65 },
  { x0: 2.7, x1: 3.15, z0: 0.9, z1: 1.75, top: 0.95 },
  // (the stack of tyres and the spare wheel at the back)
  { x0: -0.4, x1: 0.48, z0: -1.6, z1: -0.88, top: 0.7 },
  pole(-PX, PZF, SHOP_TARP.front + 0.1),
  pole(PX, PZF, SHOP_TARP.front + 0.1),
  pole(-PX, PZB, SHOP_TARP.back + 0.1),
  pole(PX, PZB, SHOP_TARP.back + 0.1),
];

/** A box round them all (local), and the stall's ground (m), set when installed. */
const ALL = { x0: Math.min(...SOLIDS.map((s) => s.x0)), x1: Math.max(...SOLIDS.map((s) => s.x1)), z0: Math.min(...SOLIDS.map((s) => s.z0)), z1: Math.max(...SOLIDS.map((s) => s.z1)) };
let floor = 0;
const _l: [number, number] = [0, 0];

/** The top (map m) of the solid part under (x, z), or −Infinity: none there. No allocation. */
export function shopSolidTop(x: number, z: number): number {
  const [lx, lz] = shopLocal(x, z, _l);
  if (lx < ALL.x0 || lx > ALL.x1 || lz < ALL.z0 || lz > ALL.z1) return -Infinity;
  let top = -Infinity;
  for (const s of SOLIDS) if (lx > s.x0 && lx < s.x1 && lz > s.z0 && lz < s.z1 && floor + s.top > top) top = floor + s.top;
  return top;
}

/**
 * The stall's solid parts over the world's walk map (roam/walkmap.ts is made from the built parts; this is roaming's
 * own scene): over `standAt` each is a wall (NaN) to feet under its top (nobody climbs onto the workbench, the row
 * for sale or the tyres; a bicycle rode up onto the mending corner when it could stand on them); over `clearance` and `hardClearance` (the follow camera, the photo's lens) each is a box. Anywhere else
 * every answer is the world's own. (Asked many times a step: nothing allocated.)
 */
export function installShopWalk(world: RoamWorld, ground: number): void {
  floor = ground;
  const { standAt, clearance, hardClearance } = world;
  if (standAt)
    world.standAt = (x, z, y, up, h) => {
      const g = standAt(x, z, y, up, h);
      const top = shopSolidTop(x, z);
      if (top === -Infinity || Number.isNaN(g) || g >= top) return g;
      // (under its top: a wall — nobody stands on the workbench, the row for sale or the stack of tyres, and his
      // bicycle, which may step up 2.45 m onto what carries it, rode up onto the mending corner)
      return NaN;
    };
  if (clearance) world.clearance = (ax, ay, az, bx, by, bz) => Math.min(clearance(ax, ay, az, bx, by, bz), boxes(ax, ay, az, bx, by, bz));
  if (hardClearance) world.hardClearance = (ax, ay, az, bx, by, bz) => Math.min(hardClearance(ax, ay, az, bx, by, bz), boxes(ax, ay, az, bx, by, bz));
}

/** What is left of the segment (0‥1) while `axis` narrows it. */
let t0 = 0;
let t1 = 1;
const _a: [number, number] = [0, 0];
const _b: [number, number] = [0, 0];

/** The part of a → b (0‥1) before it comes into one of the solid parts (1: it misses them all). */
function boxes(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const [alx, alz] = shopLocal(ax, az, _a);
  const [blx, blz] = shopLocal(bx, bz, _b);
  // (far from the stall: nothing to test)
  if (Math.max(alx, blx) < ALL.x0 || Math.min(alx, blx) > ALL.x1 || Math.max(alz, blz) < ALL.z0 || Math.min(alz, blz) > ALL.z1) return 1;
  let best = 1;
  for (const s of SOLIDS) {
    t0 = 0;
    t1 = 1;
    if (!axis(alx, blx, s.x0, s.x1) || !axis(alz, blz, s.z0, s.z1) || !axis(ay, by, floor, floor + s.top)) continue;
    if (t0 < best) best = t0;
  }
  return best;
}

/** One axis of a box: narrows `t0‥t1` to where p → q is between lo and hi; false once nothing is left. */
function axis(p: number, q: number, lo: number, hi: number): boolean {
  const d = q - p;
  if (Math.abs(d) < 1e-9) return p > lo && p < hi;
  const a = (lo - p) / d;
  const b = (hi - p) / d;
  if (Math.min(a, b) > t0) t0 = Math.min(a, b);
  if (Math.max(a, b) < t1) t1 = Math.max(a, b);
  return t0 < t1;
}
