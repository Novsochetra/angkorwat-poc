import { BufferGeometry, CanvasTexture, DoubleSide, Float32BufferAttribute, Frustum, Group, Matrix4, Mesh, MeshLambertMaterial, Object3D, RepeatWrapping, Sphere, SRGBColorSpace, Vector3 } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { ShadowGate } from '../cull';
import { Frame } from '../landmarks/_prasatKit';
import type { MapContext, MapFrame } from '../types';
import { bargeBoards, BLOOM, bougainvillea, DECK, gableEnd, gableRoof, jar, khmerGable, khmerHat, Local, mat, planks, POST, potPlant, tone, WALLS, type Hole, type Roof, type Tones } from '../village/_kit';
import { GLOW, VillageLights } from '../village/_lights';
import { EV_RIDGE, EV_ROOFS, hammock, jars, kramaOver, khmerSpiritHouse, woodpile } from './_evKit';
import { HOME, HOME_AT, HOME_DOG, HOME_DOOR, HOME_GRAN, HOME_IN, HOME_SIGN, HOME_SIZE, HOME_STAIR, HOME_STAIR_FOOT, HOME_T, HOME_Z, homeFloor, homeHammock, homeStilts } from './_homePlan';
import { homeShelf, homeSign } from './_homeShelf';
import type { HamletPiece } from './index';

/**
 * His stilt house (ផ្ទះឈើ), at the sugar-palm village's north-east edge
 * (where: _homePlan.ts), in the village's own Khmer form (a rông daol: one
 * steep gable roof of red-brown clay tiles over the rooms and the open
 * veranda in front; plain barge boards, no horns; a fan of rays out of a
 * little sun in the gable the trail sees, a kbach leaf in the other), built
 * with the villages' kit (village/_kit.ts, hamlet/_evKit.ts): the floor 3 m
 * up on dark hardwood stilts on footing stones, plank walls of plain old
 * wood, shutters and doors in a faded teal, a wooden stair with handrails
 * down from the veranda.
 *
 * It is lived in, so it has an inside (the village's houses are shells):
 * wide double doors (wide and tall enough for the roaming explorer, 1.4 ×
 * his size), open windows with their shutters out (the east one by his mat
 * wide, over the stream and the meadow; two in front looking at Phnom
 * Kulen), a plank floor; the sleeping mat (kantel) along the back wall with
 * a pillow and a folded blanket under a white mosquito net (its front rolled
 * up on its top bar by day, let down while he sleeps: `HOME.net`); the
 * altar shelf high on the west wall (a small seated Buddha with the lotus-bud
 * ushnisha, incense, lotus and jasmine, a candle, a red cloth with a gold
 * hem); a shelf on the back wall with what he has found (the golden figures
 * in miniature, his kite on the wall over it: _homeShelf.ts); a water jar
 * with its dipper by the door; a sitting mat with a teapot and cups; his
 * palm-leaf hat on a nail; an oil lamp on the east front window's sill, lit
 * at night once the house is his (a glow and a halo: no light); a lantern
 * under the tie beam, the altar's candle.
 *
 * Round it: the veranda's mat and teapot, pot plants, a krama over the rail;
 * under the floor a hammock between two stilts of the front row (the
 * hammock add-on's: roam/_hammock.ts), the water jars, firewood; a water jar
 * at the stair's foot to wash his feet, the dog's bed beside the stair (a
 * round woven basket with an old krama: `HOME_DOG`), a spirit house in the
 * front yard, bougainvillea; at night, while the house is not his yet, the
 * grandmother's little oil lamp by her mat (people/_sceneHome.ts).
 *
 * Its wood is the `bark` family, not `mapBark`: solid for the follow camera
 * (roam/walkmap.ts `hard`: inside, the walls and the floor keep the camera in
 * the room, never under the floor) and not dissolved by the near fade
 * (roam/_nearFade.ts: only `mapBark` and `mapLeaf` are), so the room stays
 * whole round him; it sounds of wood underfoot (_woodFloor.ts) all the same.
 * Four block families (bark, mapStone, petal, mapLeaf): four draws, their
 * shadows gated (cull.ts); the glows and halos two more, the moving things
 * (the doors, the net, the shelf and the sign: _homeShelf.ts) a few more,
 * all hidden while the house is out of view or far.
 */

/** The house's middle for culling (m, over the floor) and a sphere round it all; the moving things are drawn within `NEAR` of the camera. */
const REACH = 16;
const NEAR = 140;
/** Colours (sRGB): the trim (doors, shutters: a faded teal), the walls (old plain wood, a little silvered), the floor. */
const TRIM: Tones = [0x3f7d86, 0x47858d, 0x3a737c];
const WALL: Tones = WALLS.wood;
/** The walls' inside lining: lighter, warmer planks. */
const INNER: Tones = [0xa98260, 0xb48c68, 0x9e7a58, 0xb99470];
const FLOOR: Tones = DECK;
const ROOF = 'tile' as const;

export function buildHome(ctx: MapContext): HamletPiece {
  const t0 = performance.now();
  const field = ctx.field;
  const src = traceSource();
  const fr = new Frame(HOME_AT.x, 0, HOME_AT.z, HOME_AT.facing);
  const ground = (lx: number, lz: number) => field.heightAt(fr.wx(lx, lz), fr.wz(lx, lz));
  const { ground: g0, floor: F } = homeFloor(field);
  const lb = new VoxelBuilder();
  const L = new Local(lb, src, 4242, fr.theta);
  const lights = new VillageLights();
  let glowN = 0;
  const glow = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, halo = 0, key?: string) => {
    const wx = fr.wx(x, z);
    const wz = fr.wz(x, z);
    const ph = ((glowN++ * 7) % 29) * 0.217;
    if (key) lights.switchable(key, wx, y, wz, sx, sy, sz, fr.theta, color, halo, ph);
    else {
      lights.still.add(wx, y, wz, sx, sy, sz, fr.theta, color, ph);
      if (halo) lights.halo(wx, y, wz, halo, ph);
    }
  };

  const W = HOME_SIZE.w;
  const T = HOME_T;
  const { back: zb, wall: zw, front: zf } = HOME_Z;
  const top = F + HOME_SIZE.wall;
  const r: Roof = { x0: -W / 2 - 0.45, x1: W / 2 + 0.45, z0: zb - 0.45, z1: zf + 0.45, eave: top - 0.45, run: 0.45, rise: 0.45 };

  // ── Stilts, joists, the floor ─────────────────────────────────────────────
  const { xs, zs } = homeStilts();
  for (const x of xs)
    for (const z of zs) {
      const g = ground(x, z);
      L.span(x - 0.16, g - 0.3, z - 0.16, x + 0.16, F - 0.45, z + 0.16, tone(POST, L.r(x, z, 1)), 'mapBark');
      L.box(x, g + 0.08, z, 0.5, 0.18, 0.5, tone([0x8a8478, 0x7e786c, 0x96907f], L.r(z, x, 2)), 'mapStone');
    }
  for (const z of zs) L.span(-W / 2, F - 0.45, z - 0.16, W / 2, F - 0.2, z + 0.16, tone(FLOOR, L.r(z, 3) * 0.4), 'mapBark', 0.85);
  for (let x = -W / 2, i = 0; x < W / 2 - 0.05; x += 0.5, i++) L.span(x, F - 0.2, zb, Math.min(W / 2, x + 0.5), F, zf, tone(FLOOR, L.r(i, 4)), 'mapBark', 0.95 + L.r(i, 5) * 0.08);
  // A fascia board round the floor's edge, in the trim colour. (A soft family: in the walk map its long thin run would
  // fill the 0.5 m columns just outside the railing at the floor's height, a ledge he could walk along outside it.)
  L.span(-W / 2 - 0.04, F - 0.32, zf - 0.02, W / 2 + 0.04, F - 0.04, zf + 0.05, tone(TRIM, 0.3), 'petal');
  for (const s of [-1, 1]) L.span(s * W / 2 - 0.04, F - 0.32, zb, s * W / 2 + 0.04, F - 0.04, zf, tone(TRIM, 0.6), 'petal');

  // ── Walls round the rooms: the doorway, open windows with their shutters out ──
  const win = (a: number, half: number): Hole => ({ a0: a - half, a1: a + half, y0: F + 1.05, y1: F + 2.0 });
  const d = HOME_DOOR;
  // Front: the wide double doorway between two windows (the doors themselves move: _homeShelf.ts).
  planks(L, 'x', zw - T / 2, T, -W / 2, W / 2, F, top, [{ a0: -d.half, a1: d.half, y0: F, y1: F + d.h }, ...HOME_IN.front.map((x) => win(x, 0.47))], WALL);
  const tc = tone(TRIM, L.r(3, 8));
  for (const s of [-1, 1]) L.span(s * d.half - (s > 0 ? 0 : 0.08), F, zw - T - 0.02, s * d.half + (s > 0 ? 0.08 : 0), F + d.h + 0.12, zw + 0.05, tc, 'mapBark');
  L.span(-d.half - 0.08, F + d.h, zw - T - 0.02, d.half + 0.08, F + d.h + 0.14, zw + 0.05, tc, 'mapBark');
  // (a raised sill: Khmer doors have one; flush with the floor here, so he walks over it)
  L.span(-d.half, F, zw - T, d.half, F + 0.03, zw, 0x5a4232, 'mapBark');
  for (const x of HOME_IN.front) openWindow(L, 'x', x, F + 1.525, zw, 1, 0.47, true);
  // The sign over the door: a dark board in a cream frame (his name on it in Khmer letters, or "ផ្ទះខ្ញុំ": _homeShelf.ts).
  const sg = HOME_SIGN;
  const sy0 = F + sg.y - sg.h / 2;
  const sy1 = F + sg.y + sg.h / 2;
  L.span(sg.x - sg.w / 2, sy0, zw, sg.x + sg.w / 2, sy1, sg.z, 0x4a2e1c, 'mapBark');
  for (const y of [sy0, sy1 - 0.045]) L.span(sg.x - sg.w / 2 - 0.02, y, sg.z - 0.01, sg.x + sg.w / 2 + 0.02, y + 0.045, sg.z + 0.02, 0xe8d8b0, 'mapBark');
  for (const s of [-1, 1]) L.span(sg.x + s * (sg.w / 2 + 0.02) - 0.045, sy0, sg.z - 0.01, sg.x + s * (sg.w / 2 + 0.02), sy1, sg.z + 0.02, 0xe8d8b0, 'mapBark');
  // Back: plain (the shelf and the kite are on its inside).
  planks(L, 'x', zb + T / 2, T, -W / 2, W / 2, F, top, [], WALL);
  // Sides: the wide window by the mat on the east (local −x), a small one on the west; the gables above.
  const E = HOME_IN.east;
  const Wn = HOME_IN.west;
  planks(L, 'z', -(W / 2 - T / 2), T, zb + T, zw - T, F, top, [win(E.z, E.half)], WALL);
  planks(L, 'z', W / 2 - T / 2, T, zb + T, zw - T, F, top, [win(Wn.z, Wn.half)], WALL);
  openWindow(L, 'z', E.z, F + 1.525, -W / 2, -1, E.half, false);
  openWindow(L, 'z', Wn.z, F + 1.525, W / 2, 1, Wn.half, true);
  for (const s of [-1, 1]) gableEnd(L, r, s * (W / 2 - T / 2), T, zb, zf, top, s > 0 ? lighter(WALL) : WALL);
  // The walls' inside: a lining of lighter, smoother planks (the room is lit only through its doorway and windows).
  const t2 = 0.03;
  planks(L, 'x', zb + T + t2 / 2, t2, -W / 2 + T, W / 2 - T, F, top, [], INNER);
  planks(L, 'x', zw - T - t2 / 2, t2, -W / 2 + T, W / 2 - T, F, top, [{ a0: -d.half - 0.08, a1: d.half + 0.08, y0: F, y1: F + d.h + 0.14 }, ...HOME_IN.front.map((x) => win(x, 0.5))], INNER);
  planks(L, 'z', -(W / 2 - T - t2 / 2), t2, zb + T + t2, zw - T - t2, F, top, [win(E.z, E.half + 0.03)], INNER);
  planks(L, 'z', W / 2 - T - t2 / 2, t2, zb + T + t2, zw - T - t2, F, top, [win(Wn.z, Wn.half + 0.03)], INNER);
  // Tie beams across the rooms by the end walls (the middle left open under the ridge: the follow camera's room), a
  // lantern hanging high on a cord from the ridge, over the sitting mat.
  for (const x of [-2.75, 2.75]) L.span(x - 0.09, top - 0.12, zb, x + 0.09, top + 0.06, zw, tone(POST, L.r(x, 9)), 'mapBark');
  const lx = 1.7;
  const lz = -0.55;
  L.span(lx - 0.012, top + 0.4, lz - 0.012, lx + 0.012, top + 2.2, lz + 0.012, 0x3a332c, 'petal');
  L.box(lx, top + 0.34, lz, 0.26, 0.05, 0.26, 0x4a3a2a, 'metal');
  L.box(lx, top - 0.04, lz, 0.22, 0.04, 0.22, 0x4a3a2a, 'metal');
  glow(lx, top + 0.15, lz, 0.18, 0.32, 0.18, GLOW.lantern, 2.2, 'home');

  // ── The veranda: posts to the roof, a railing with a gap for the stair ────
  // (the corner posts and a beam along the front under the eaves: no post before the doorway and its sign)
  for (const x of [-W / 2 + 0.2, W / 2 - 0.2]) L.span(x - 0.14, F, zf - 0.3, x + 0.14, top, zf - 0.02, tone(WALL, 0.9), 'mapBark');
  L.span(-W / 2 + 0.06, top - 0.5, zf - 0.28, W / 2 - 0.06, top - 0.2, zf - 0.04, tone(POST, 0.4), 'mapBark');
  const railY = F + 0.95;
  const rail = (x0: number, z0: number, x1: number, z1: number) => {
    if (Math.max(x1 - x0, z1 - z0) < 0.3) return;
    L.span(x0, railY - 0.1, z0, x1, railY, z1, tone(TRIM, 0.2), 'mapBark');
    const along = x1 - x0 > z1 - z0;
    const len = along ? x1 - x0 : z1 - z0;
    for (let s = 0.22; s < len - 0.1; s += 0.4) L.box(along ? x0 + s : (x0 + x1) / 2, F + 0.42, along ? (z0 + z1) / 2 : z0 + s, 0.08, 0.84, 0.08, tone(TRIM, 0.7), 'mapBark');
  };
  const st = HOME_STAIR;
  const ga = st.x - st.width / 2;
  const gb = st.x + st.width / 2;
  // (the railing stops 0.35 m wide of the stair: its end's 0.5 m walk-map column stays off the way down, as the village's)
  rail(-W / 2 + 0.34, zf - 0.12, ga - 0.35, zf - 0.02);
  rail(gb + 0.35, zf - 0.12, W / 2 - 0.34, zf - 0.02);
  rail(-W / 2 + 0.02, zw + 0.05, -W / 2 + 0.12, zf - 0.3);
  rail(W / 2 - 0.12, zw + 0.05, W / 2 - 0.02, zf - 0.3);

  // ── The roof: tiles, plain barge boards; a fan of rays in the west gable (the trail's side), a kbach leaf in the east ──
  gableRoof(L, r, EV_ROOFS[ROOF], EV_RIDGE[ROOF], 'mapStone', 1.2);
  for (const s of [-1, 1]) {
    bargeBoards(L, r, s > 0 ? r.x1 : r.x0, s, 0xeee6d2);
    khmerGable(L, r, s * (W / 2), s, zb, zf, top, s > 0 ? 'rays' : 'kbach', s > 0 ? 0xc8a878 : 0xc8a878);
  }

  // ── The stair down to the yard ────────────────────────────────────────────
  const gFoot = ground(st.x, HOME_STAIR_FOOT - 0.6);
  const steps = Math.max(2, Math.round((F - gFoot) / st.step));
  const step = (F - gFoot) / steps;
  for (let i = 1; i < steps; i++) {
    const z = zf + (i - 1) * st.step;
    const y = F - i * step;
    L.span(ga, y - 0.12, z, gb, y, z + st.step, tone(FLOOR, L.r(i, 11)), 'mapBark');
  }
  // (its sides a step at a time, straight boxes: stringers under the treads' ends, a handrail on posts)
  for (const x of [ga - 0.07, gb + 0.07])
    for (let i = 1; i < steps; i++) {
      const z = zf + (i - 1) * st.step;
      const y = F - i * step;
      L.span(x - 0.06, y - 0.4, z, x + 0.06, y - 0.12, z + st.step, tone(FLOOR, 0.1), 'mapBark', 0.9);
      L.span(x - 0.05, y + 0.85, z, x + 0.05, y + 0.95, z + st.step, tone(TRIM, 0.2), 'mapBark');
      if (i % 2 === 1 || i === steps - 1) L.span(x - 0.05, y, z + 0.2, x + 0.05, y + 0.85, z + 0.3, tone(TRIM, 0.6), 'mapBark');
    }

  // ── Inside ────────────────────────────────────────────────────────────────
  inside(L, F, glow);

  // ── On the veranda ────────────────────────────────────────────────────────
  mat(L, -2.3, F, (zw + zf) / 2 + 0.05);
  potPlant(L, -W / 2 + 0.5, F, zw + 0.45, true);
  potPlant(L, W / 2 - 0.45, F, zf - 0.45);
  potPlant(L, ga - 0.55, F, zf - 0.4);
  kramaOver(L, -1.0, railY, zf - 0.07, 7);

  // ── Under the house ───────────────────────────────────────────────────────
  const hm = homeHammock();
  hammock(L, hm.x0, hm.x1, hm.z, ground((hm.x0 + hm.x1) / 2, hm.z), F - hm.down, 0x2f6aa8);
  jars(L, 1.6, ground(1.6, -2.3), -2.3, 3);
  woodpile(L, -1.7, ground(-1.7, -2.4), -2.4);
  // A rice basket hung on a stilt, a hoe leaning on another.
  L.box(xs[2] - 0.24, F - 1.4, zs[1], 0.12, 0.3, 0.32, tone([0xc8b27a, 0xbba36c], L.r(3, 17)), 'mapBark');
  L.box(xs[0], ground(xs[0], zs[0]) + 0.9, zs[0] + 0.22, 0.06, 1.7, 0.06, 0x8a6a48, 'mapBark');
  L.box(xs[0], ground(xs[0], zs[0]) + 0.1, zs[0] + 0.35, 0.24, 0.05, 0.2, 0x5a5a58, 'mapStone');

  // ── The yard ──────────────────────────────────────────────────────────────
  const foot = HOME_STAIR_FOOT;
  // The jar to wash his feet before he goes up, its dipper (a coconut shell on a stick) on the lid.
  const jx = gb + 0.75;
  const jz = foot - 1.0;
  jar(L, jx, ground(jx, jz), jz);
  L.box(jx, ground(jx, jz) + 0.86, jz, 0.5, 0.04, 0.5, 0x8a8a84, 'mapStone');
  L.box(jx + 0.08, ground(jx, jz) + 0.92, jz, 0.18, 0.08, 0.18, 0x5a3a22, 'mapBark');
  L.box(jx - 0.1, ground(jx, jz) + 0.9, jz, 0.34, 0.03, 0.04, 0x8a6a48, 'mapBark');
  dogBed(L, HOME_DOG.x, ground(HOME_DOG.x, HOME_DOG.z), HOME_DOG.z);
  const [fx, fy, fz] = khmerSpiritHouse(L, -2.9, ground(-2.9, foot + 1.5), foot + 1.5);
  glow(fx, fy + 0.05, fz, 0.06, 0.1, 0.06, 0xffb050, 0.8);
  bougainvillea(L, -W / 2 - 1.1, ground(-W / 2 - 1.1, zf + 1.2), zf + 1.2, 11);
  potPlant(L, ga - 1.2, ground(ga - 1.2, foot - 0.3), foot - 0.3, true);
  // The grandmother's things while she waits for him (her mat, her oil lamp: lit at night until the house is his).
  const gs = HOME_GRAN.sit;
  L.span(gs.x - 0.55, ground(gs.x, gs.z), gs.z - 0.45, gs.x + 0.55, ground(gs.x, gs.z) + 0.03, gs.z + 0.45, 0x2f6a5a, 'petal');
  for (const dz of [-0.25, 0.05, 0.35]) L.span(gs.x - 0.56, ground(gs.x, gs.z) + 0.01, gs.z + dz - 0.04, gs.x + 0.56, ground(gs.x, gs.z) + 0.035, gs.z + dz + 0.04, 0xc8a040, 'petal');
  const gl = HOME_GRAN.lamp;
  const gly = ground(gl.x, gl.z);
  L.box(gl.x, gly + 0.06, gl.z, 0.16, 0.12, 0.16, 0x6a4a30, 'mapStone');
  L.box(gl.x, gly + 0.2, gl.z, 0.12, 0.16, 0.12, 0xc8d4d0, 'mapStone', 0.9);
  glow(gl.x, gly + 0.2, gl.z, 0.09, 0.12, 0.09, GLOW.lantern, 1.4, 'gran');

  // ── Into the map ──────────────────────────────────────────────────────────
  // (the explorer's kit's tin and brass come out as plain stone, the wood as `bark` (see above): four families, four draws)
  for (const b of lb.boxes) {
    if (b.mat === 'mapBark') b.mat = 'bark';
    else if (b.mat === 'metal' || b.mat === 'brass') b.mat = 'mapStone';
  }
  const world = new VoxelBuilder();
  fr.place(lb, world);
  const object = new Group();
  object.name = 'home';
  const quality = ctx.quality === 'low' ? 'low' : 'medium';
  const blocks = buildVoxelMesh(world, { quality, name: 'home' });
  object.add(blocks);
  const shadows = new ShadowGate().addAll(blocks);
  const light = lights.build(ctx.renderer);
  light.object.name = 'home:lights';
  object.add(light.object);
  // Keep the trees and the bushes off: the house, its stair and the yard round it.
  const corners: [number, number][] = [
    [-W / 2 - 2.2, zb - 1.6],
    [W / 2 + 4.6, zb - 1.6],
    [-W / 2 - 2.2, foot + 4.6],
    [W / 2 + 4.6, foot + 4.6],
  ];
  const wxs = corners.map(([x, z]) => fr.wx(x, z));
  const wzs = corners.map(([x, z]) => fr.wz(x, z));
  field.occupy(Math.min(...wxs), Math.min(...wzs), Math.max(...wxs), Math.max(...wzs));

  // ── What moves: the doors, the net, the shelf and the sign (rebuilt when they change) ──
  const live = new Group();
  live.name = 'home:live';
  object.add(live);
  const doors = buildDoors(fr, F);
  const net = buildNet(fr, F);
  live.add(doors.object, net.object);
  const shelf = homeShelf(fr, F);
  const sign = homeSign(fr, F);
  live.add(shelf.object, sign.object);
  // (not walked on, not in the camera's walls: the walk map reads the map's voxel meshes, and these move)
  live.traverse((o) => void (o.userData.noWalk = true));

  console.info(`[map] home: his stilt house at (${HOME_AT.x}, ${HOME_AT.z}), floor ${F.toFixed(1)} m (ground ${g0.toFixed(1)}) · ${world.boxes.length} blocks in ${blocks.children.length} draws · ${lights.still.list.length} glows, ${lights.halos.length} halos · built in ${(performance.now() - t0).toFixed(0)} ms`);

  const view = new Frustum();
  const m = new Matrix4();
  const sphere = new Sphere(new Vector3(HOME_AT.x, F + 2, HOME_AT.z), REACH);
  let lit = -1;
  let gran = -1;
  return {
    object,
    blocks: world.boxes.length,
    update(f: MapFrame) {
      shadows.update(f);
      const cam = f.camera;
      m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      view.setFromProjectionMatrix(m);
      const dist = cam.position.distanceTo(sphere.center);
      const seen = view.intersectsSphere(sphere) && dist < 900;
      light.object.visible = seen;
      // (his lamps lit once it is his; the grandmother's while she waits for him)
      const on = HOME.owned ? 1 : 0;
      if (on !== lit) light.setLit('home', !!(lit = on));
      const g = !HOME.owned && HOME.gran.ready ? 1 : 0;
      if (g !== gran) light.setLit('gran', !!(gran = g));
      if (seen) light.update(f, cam);
      // The doors and the net ease to where they are wanted.
      const dt = Math.min(0.1, Math.max(0, f.dt));
      const k = f.dt > 0 ? dt : 1;
      HOME.door = ease(HOME.door, HOME.opened ? 1 : 0, k / 1.4);
      HOME.net = ease(HOME.net, HOME.netDown ? 1 : 0, k / 0.9);
      const near = seen && dist < NEAR;
      live.visible = near;
      if (!near) return;
      doors.set(HOME.door);
      net.set(HOME.net);
      shelf.update(f);
      sign.update();
    },
  };
}

/** Toward `to` by at most `k` (a linear ease: the house's own smoothing is in the shapes). */
const ease = (v: number, to: number, k: number): number => (v < to ? Math.min(to, v + k) : Math.max(to, v - k));

/**
 * An open window in a wall (along `axis`, its middle `a` along it, its middle height `y`; `at` the wall's
 * outer face, `out` the side it faces): its frame in the trim, two thin bars (none on the wide view window:
 * `bars` false), the two shutters open flat against the wall outside.
 */
function openWindow(L: Local, axis: 'x' | 'z', a: number, y: number, at: number, out: number, half: number, bars: boolean): void {
  const c = tone(TRIM, L.r(a, y, 21));
  const face = at + out * 0.04;
  const sh = half + 0.02;
  const put = (along: number, yy: number, across: number, sa: number, sy: number, sc: number, color: number, shade = 1) =>
    axis === 'x' ? L.box(along, yy, across, sa, sy, sc, color, 'mapBark', shade) : L.box(across, yy, along, sc, sy, sa, color, 'mapBark', shade);
  if (bars) for (const dd of [-half / 3, half / 3]) put(a + dd, y, at - out * 0.08, 0.05, 0.92, 0.05, c);
  // The frame round it, the sill sticking out a little.
  for (const s of [-1, 1]) put(a + s * (half + 0.03), y, at - out * 0.07, 0.07, 1.0, 0.24, c);
  put(a, y + 0.5, at - out * 0.07, half * 2 + 0.12, 0.07, 0.24, c);
  put(a, y - 0.5, at - out * 0.04, half * 2 + 0.2, 0.07, 0.34, c);
  // The shutters, open against the wall either side.
  for (const s of [-1, 1]) {
    put(a + s * (half + 0.06 + sh / 2), y, face, sh, 0.94, 0.06, c, 0.95);
    // (their two panels' frames, a little darker)
    put(a + s * (half + 0.06 + sh / 2), y, face + out * 0.03, sh - 0.12, 0.05, 0.02, c, 0.82);
  }
}

/** A lighter set of a wall's tones (the gable with the fan of rays). */
function lighter(t: Tones): Tones {
  return t.map((c) => {
    const ch = (s: number) => Math.min(255, Math.round(((c >> s) & 255) * 1.12));
    return (ch(16) << 16) | (ch(8) << 8) | ch(0);
  });
}

/**
 * The room (local m, `F` the floor's top): the mat under its net along the back wall, the altar shelf on the
 * west wall, the shelf for his finds (its boards: what is on it is _homeShelf.ts's), the water jar by the
 * door, the sitting mat, the hat on its nail, the lamp on the window sill.
 */
function inside(L: Local, F: number, glow: (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, halo?: number, key?: string) => void): void {
  const I = HOME_IN;
  // ── The sleeping mat (kantel): a woven reed mat with a red and green border, the pillow by the east window, a folded blanket at the foot ──
  const M = I.mat;
  L.span(M.x0, F, M.z0, M.x1, F + 0.035, M.z1, 0xd8c08a, 'petal');
  for (let x = M.x0 + 0.3; x < M.x1 - 0.1; x += 0.6) L.span(x, F + 0.01, M.z0 + 0.12, x + 0.04, F + 0.04, M.z1 - 0.12, 0xb8a06a, 'petal');
  for (const z of [M.z0 + 0.06, M.z1 - 0.06]) L.span(M.x0, F + 0.01, z - 0.05, M.x1, F + 0.045, z + 0.05, 0xb83a2e, 'petal');
  for (const z of [M.z0 + 0.16, M.z1 - 0.16]) L.span(M.x0 + 0.1, F + 0.01, z - 0.025, M.x1 - 0.1, F + 0.045, z + 0.025, 0x2f7a4a, 'petal');
  L.box(M.x0 + 0.32, F + 0.1, (M.z0 + M.z1) / 2, 0.36, 0.14, 0.62, 0xf2ece0, 'petal');
  L.box(M.x0 + 0.32, F + 0.17, (M.z0 + M.z1) / 2, 0.3, 0.02, 0.56, 0xc8d8e8, 'petal');
  // (a krama folded at the foot: red and white checks)
  for (let k = 0; k < 4; k++) L.box(M.x1 - 0.28, F + 0.06 + k * 0.025, (M.z0 + M.z1) / 2 - 0.2 + (k % 2) * 0.02, 0.4, 0.024, 0.5, k % 2 ? 0xf0ece0 : 0xb8322c, 'petal');
  // The net's four cords: from its top corners up to nails in the back wall, and to a bamboo pole laid across the room
  // from wall to wall over its front edge (soft families: neither solid nor in the camera's way).
  const N = I.net;
  const ny = F + N.top + 0.07;
  const toY = F + HOME_SIZE.wall - 0.25;
  const inner = HOME_SIZE.w / 2 - HOME_T - 0.03;
  L.span(-inner, toY - 0.02, N.z1 - 0.025, inner, toY + 0.03, N.z1 + 0.025, 0xc8b27a, 'petal');
  for (const x of [N.x0, N.x1]) {
    L.span(x - 0.008, ny, N.z1 - 0.008, x + 0.008, toY - 0.02, N.z1 + 0.008, 0xe8e4dc, 'petal');
    L.span(x - 0.008, ny, N.z0 - 0.008, x + 0.008, toY, N.z0 + 0.008, 0xe8e4dc, 'petal');
    L.span(x - 0.008, toY - 0.016, HOME_Z.back + HOME_T + 0.03, x + 0.008, toY, N.z0 + 0.008, 0xe8e4dc, 'petal');
    L.box(x, toY, HOME_Z.back + HOME_T + 0.03, 0.03, 0.03, 0.04, 0x5a5550, 'mapStone');
  }
  // ── The altar shelf (high on the west wall, facing into the room): a red cloth with a gold hem, the Buddha in the middle ──
  const A = I.altar;
  const ax = A.x - HOME_T - A.d / 2;
  const ay = F + A.y;
  L.span(A.x - HOME_T - A.d, ay - 0.06, A.z - A.w / 2, A.x - HOME_T, ay, A.z + A.w / 2, 0x6a3a22, 'mapBark');
  for (const s of [-1, 1]) L.span(A.x - HOME_T - 0.34, ay - 0.36, A.z + s * (A.w / 2 - 0.1) - 0.04, A.x - HOME_T, ay - 0.06, A.z + s * (A.w / 2 - 0.1) + 0.04, 0x5a3220, 'mapBark');
  L.span(A.x - HOME_T - A.d - 0.01, ay - 0.3, A.z - A.w / 2 + 0.05, A.x - HOME_T - A.d + 0.02, ay - 0.04, A.z + A.w / 2 - 0.05, 0xb02a26, 'petal');
  L.span(A.x - HOME_T - A.d - 0.02, ay - 0.33, A.z - A.w / 2 + 0.05, A.x - HOME_T - A.d + 0.02, ay - 0.29, A.z + A.w / 2 - 0.05, 0xe0b048, 'petal');
  buddha(L, ax + 0.06, ay, A.z);
  // Before him: the incense bowl with three sticks, two vases (lotus buds, jasmine), a plate of bananas, the candle.
  const fxA = ax - 0.15;
  L.box(fxA, ay + 0.05, A.z, 0.13, 0.1, 0.13, 0xb8322c, 'mapStone');
  for (const dz of [-0.03, 0, 0.03]) L.box(fxA, ay + 0.2, A.z + dz, 0.012, 0.2, 0.012, 0x7a3a22, 'petal');
  for (const s of [-1, 1]) {
    const vz = A.z + s * 0.4;
    L.box(ax, ay + 0.08, vz, 0.09, 0.16, 0.09, 0xe8e2d4, 'mapStone');
    L.box(ax, ay + 0.24, vz, 0.03, 0.18, 0.03, 0x4a7a3a, 'mapLeaf');
    L.box(ax, ay + 0.35, vz, 0.07, 0.09, 0.07, s > 0 ? tone(BLOOM, 0.2) : 0xf4f2ea, 'petal');
  }
  L.box(fxA, ay + 0.02, A.z + 0.22, 0.16, 0.03, 0.16, 0xd0c8b8, 'mapStone');
  L.box(fxA, ay + 0.06, A.z + 0.22, 0.12, 0.05, 0.08, 0xe8c840, 'petal');
  L.box(fxA, ay + 0.05, A.z - 0.22, 0.04, 0.1, 0.04, 0xf2eee0, 'petal');
  glow(fxA, ay + 0.13, A.z - 0.22, 0.025, 0.05, 0.025, 0xffb050, 0.5, 'home');

  // ── The shelf for his finds: two boards on brackets on the back wall (what stands on them: _homeShelf.ts) ──
  const S = I.shelf;
  const z0 = S.z + HOME_T * 0.2;
  for (const y of S.ys) {
    L.span(S.x0, F + y - 0.05, z0, S.x1, F + y, z0 + S.d, 0x6a4a30, 'mapBark');
    for (const x of [S.x0 + 0.15, (S.x0 + S.x1) / 2, S.x1 - 0.15]) L.span(x - 0.03, F + y - 0.26, z0, x + 0.03, F + y - 0.05, z0 + 0.2, 0x5a3e28, 'mapBark');
  }
  // His palm-leaf hat hung on a nail beside it.
  khmerHat(L, 0.22, F + 1.95, HOME_Z.back + HOME_T);
  // ── The water jar by the door, its lid and the dipper ──
  const J = I.jar;
  jar(L, J.x, F, J.z, 0.95);
  L.box(J.x, F + 0.8, J.z, 0.48, 0.04, 0.48, 0x8a6a48, 'mapBark');
  L.box(J.x + 0.1, F + 0.86, J.z, 0.17, 0.08, 0.17, 0x5a3a22, 'mapBark');
  L.box(J.x - 0.08, F + 0.84, J.z, 0.32, 0.03, 0.04, 0x8a6a48, 'mapBark');
  // ── A sitting mat with a teapot and cups ──
  mat(L, I.sit.x, F, I.sit.z);
  // ── The lamp on the east front window's sill (an oil lamp: a glass on a little tin base) ──
  const P = I.lamp;
  L.box(P.x, F + P.y - 0.03, P.z, 0.14, 0.05, 0.14, 0x4a3a2a, 'metal');
  L.box(P.x, F + P.y + 0.1, P.z, 0.1, 0.2, 0.1, 0xd8e0dc, 'mapStone', 0.9);
  glow(P.x, F + P.y + 0.1, P.z, 0.07, 0.12, 0.07, GLOW.lantern, 1.6, 'home');
}

/**
 * A small seated Buddha on a lotus base (≈ 0.45 m), facing into the room (local −x): legs crossed, the hands in
 * the lap, the robe over the left shoulder, the head with its curls and the lotus-bud ushnisha (Khmer: a bud,
 * never a flame), gilt.
 */
function buddha(L: Local, x: number, y: number, z: number): void {
  const G = 0xe0b048;
  const D = 0xb8862e;
  const B = 0xf2cf6a;
  // The lotus base: a red cushion, the petals' rim.
  L.box(x, y + 0.03, z, 0.26, 0.06, 0.36, 0xa83a2a, 'mapStone');
  L.box(x, y + 0.075, z, 0.24, 0.03, 0.34, D, 'mapStone');
  // Crossed legs, the lap, the hands in it.
  L.box(x - 0.01, y + 0.13, z, 0.2, 0.08, 0.3, G, 'mapStone');
  L.box(x - 0.08, y + 0.17, z, 0.06, 0.03, 0.1, B, 'mapStone');
  // The body, the robe's fold over the left shoulder.
  L.box(x + 0.02, y + 0.26, z, 0.12, 0.18, 0.18, G, 'mapStone');
  L.box(x - 0.045, y + 0.27, z - 0.04, 0.015, 0.16, 0.05, D, 'mapStone');
  // The head, the long ears, the curls, the ushnisha and its bud.
  L.box(x + 0.01, y + 0.4, z, 0.1, 0.1, 0.1, B, 'mapStone');
  for (const s of [-1, 1]) L.box(x + 0.02, y + 0.39, z + s * 0.055, 0.03, 0.08, 0.015, G, 'mapStone');
  L.box(x + 0.01, y + 0.46, z, 0.09, 0.03, 0.09, D, 'mapStone');
  L.box(x + 0.01, y + 0.49, z, 0.06, 0.04, 0.06, D, 'mapStone');
  L.box(x + 0.01, y + 0.53, z, 0.03, 0.04, 0.03, B, 'mapStone');
  // (a halo of carved leaves behind him, on the wall)
  L.box(x + 0.09, y + 0.36, z, 0.02, 0.26, 0.26, D, 'mapStone', 0.9);
}

/** The dog's bed: a round woven basket (eight staves round a low rim), an old krama in it. */
function dogBed(L: Local, x: number, y: number, z: number): void {
  const c = [0xb89a62, 0xa88a54, 0xc4a870];
  const R = 0.5;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    L.box(x + Math.cos(a) * R, y + 0.12, z + Math.sin(a) * R, 0.36, 0.24, 0.36, c[k % 3], 'mapBark', k % 2 ? 0.92 : 1);
  }
  L.box(x, y + 0.04, z, 0.8, 0.08, 0.8, 0x9a7a48, 'mapBark');
  // (the krama: red and white checks, rumpled)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) L.box(x - 0.24 + i * 0.24, y + 0.1 + ((i + j) % 2) * 0.02, z - 0.24 + j * 0.24, 0.24, 0.04, 0.24, (i + j) % 2 ? 0xf0ece0 : 0xb8322c, 'petal');
}

// ── The doors ──────────────────────────────────────────────────────────────

/** How far a door leaf turns open (radians): back against the front wall inside. */
const OPEN = 3.0;

/**
 * The double doors (the trim's teal, two raised panels each, a ring handle), hinged at the doorway's jambs:
 * shut in the doorway, or swung in against the room (`set(0‥1)`). Each leaf its own small mesh on a pivot.
 */
function buildDoors(fr: Frame, F: number): { object: Group; set(v: number): void } {
  const object = new Group();
  object.name = 'home:doors';
  const d = HOME_DOOR;
  // (hinged at the wall's inside face: open, each leaf lies back against the front wall inside, out of the way)
  const z = HOME_Z.wall - HOME_T - 0.08;
  const leaves: Object3D[] = [];
  for (const s of [-1, 1]) {
    const b = new VoxelBuilder();
    const w = d.half - 0.01;
    // (in the leaf's own frame: its hinge at x 0, the leaf along +x·(−s) to the middle)
    const L = new Local(b, undefined, 77 + s, 0);
    const mid = (-s * w) / 2;
    L.span(Math.min(0, -s * w), F, -0.04, Math.max(0, -s * w), F + d.h - 0.02, 0.04, tone(TRIM, 0.4), 'bark');
    for (const yy of [0.66, 1.8]) L.box(mid, F + yy, 0.05, w - 0.22, 0.9, 0.02, tone(TRIM, 0.9), 'bark', 0.86);
    L.box(-s * (w - 0.1), F + 1.2, 0.07, 0.05, 0.14, 0.03, 0x3a2e22, 'bark');
    const mesh = buildVoxelMesh(b, { quality: 'medium', name: `home:door${s > 0 ? 'R' : 'L'}` });
    mesh.traverse((o) => void (o.castShadow = false));
    const pivot = new Group();
    const hx = s * d.half;
    pivot.position.set(fr.wx(hx, z), 0, fr.wz(hx, z));
    pivot.rotation.y = fr.theta;
    pivot.add(mesh);
    object.add(pivot);
    leaves.push(mesh);
  }
  let at = -1;
  return {
    object,
    set(v) {
      if (Math.abs(v - at) < 1e-4) return;
      at = v;
      // (swung in toward the room, −z, until each lies back against the wall beside the doorway; eased at both ends)
      const e = v * v * (3 - 2 * v);
      leaves[0].rotation.y = e * OPEN;
      leaves[1].rotation.y = -e * OPEN;
    },
  };
}

// ── The mosquito net ───────────────────────────────────────────────────────

/** Its fine mesh: thin threads on nothing (a small canvas, repeated: a cell `NET_CELL` m), a knot where they cross. */
const NET_CELL = 0.03;
/** A texel's middle that is a knot (fully opaque): the hems and ties sample only this (their UV, before the repeat). */
const NET_SOLID = 0.5 / 8 * NET_CELL;

function netTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255, 255, 255, 0.025)';
  g.fillRect(0, 0, 8, 8);
  g.fillStyle = 'rgba(255, 255, 255, 0.3)';
  g.fillRect(0, 0, 8, 1);
  g.fillRect(0, 0, 1, 8);
  g.fillStyle = 'rgba(255, 255, 255, 1)';
  g.fillRect(0, 0, 1, 1);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(1 / NET_CELL, 1 / NET_CELL);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Plain arrays for a geometry: positions, uvs, colours (linear), indices. */
class NetBuild {
  readonly pos: number[] = [];
  readonly uv: number[] = [];
  readonly col: number[] = [];
  readonly idx: number[] = [];

  /**
   * A cloth panel: `at(a, b)` its point for a 0‥1 across and b 0‥1 down (house-local m, y over the floor), `nu` × `nw`
   * cells; its mesh is laid by the cloth's own length (`wide`, `tall` m), so the threads keep their size.
   */
  panel(at: (a: number, b: number) => [number, number, number], nu: number, nw: number, wide: number, tall: number, shade: number): void {
    const base = this.pos.length / 3;
    for (let j = 0; j <= nw; j++)
      for (let i = 0; i <= nu; i++) {
        const [x, y, z] = at(i / nu, j / nw);
        this.pos.push(x, y, z);
        this.uv.push((i / nu) * wide, (j / nw) * tall);
        this.col.push(shade, shade, shade * 0.985);
      }
    for (let j = 0; j < nw; j++)
      for (let i = 0; i < nu; i++) {
        const a = base + j * (nu + 1) + i;
        this.idx.push(a, a + nu + 1, a + 1, a + 1, a + nu + 1, a + nu + 2);
      }
  }

  /** A solid band (a hem, a tie, the roll): a strip of quads along points, `w` wide across `side` (unit), all on the knot texel. */
  band(pts: readonly [number, number, number][], side: [number, number, number], w: number, shade: number): void {
    const base = this.pos.length / 3;
    for (const [x, y, z] of pts)
      for (const k of [-0.5, 0.5]) {
        this.pos.push(x + side[0] * w * k, y + side[1] * w * k, z + side[2] * w * k);
        this.uv.push(NET_SOLID, NET_SOLID);
        this.col.push(shade, shade, shade * 0.97);
      }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = base + i * 2;
      this.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }

  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * The mosquito net over the mat (មុង): fine white netting you see through, hung by its four top corners on cords
 * (the top sagging between them, each top edge a little), the sides falling to the floor in soft folds, a lighter
 * hem along the top and the foot, a tie at each corner. One material for all of it (one program): the netting's
 * alpha is a small repeated texture (threads and knots), the hems and ties sample its one opaque texel. By day its
 * front is gathered up in a roll along the top front edge; while he sleeps it is let down to the floor
 * (`set(0‥1)`: its points rewritten, a few hundred, only while it moves).
 */
function buildNet(fr: Frame, F: number): { object: Group; set(v: number): void } {
  const object = new Group();
  object.name = 'home:net';
  const N = HOME_IN.net;
  const H = N.top;
  const W = N.x1 - N.x0;
  const D = N.z1 - N.z0;
  const material = new MeshLambertMaterial({ color: 0xffffff, map: netTexture(), vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide, name: 'home:net' });
  /** The top's sag between the corners (m), each top edge's, how far the folds swing out at the foot, their length (m). */
  const SAG = 0.11;
  const EDGE = 0.045;
  const FOLD = 0.03;
  const FOLD_LEN = 0.32;
  const BODY = 0.9;
  const HEM = 1.0;
  const edgeY = (a: number) => H - EDGE * Math.sin(Math.PI * a);
  /** A fold's push out of a side (0 at the top, more toward the foot), and the foot's lean out onto the floor. */
  const fold = (s: number, b: number, phase: number) => FOLD * Math.sin((s / FOLD_LEN) * Math.PI * 2 + phase) * (0.25 + 0.75 * b);
  const shell = new NetBuild();
  // The top: sagging in the middle, its edges as the sides' tops.
  shell.panel((a, b) => [N.x0 + W * a, H - EDGE * Math.max(Math.sin(Math.PI * a), Math.sin(Math.PI * b)) - (SAG - EDGE) * Math.sin(Math.PI * a) * Math.sin(Math.PI * b), N.z0 + D * b], 12, 6, W, D, BODY);
  // The back (against the wall: hardly any lean), the two ends (the room's end leans out a little onto the floor).
  shell.panel((a, b) => [N.x0 + W * a, edgeY(a) * (1 - b) + 0.01 * b, N.z0 + fold(W * a, b, 0) * 0.4], 14, 8, W, H, BODY);
  for (const [x, out, lean] of [
    [N.x0, -1, 0.02],
    [N.x1, 1, 0.07],
  ] as const)
    shell.panel((a, b) => [x + out * (fold(D * a, b, 1.3) + lean * b * b), edgeY(a) * (1 - b) + 0.01 * b, N.z0 + D * a], 6, 8, D, H, BODY);
  // The hems: round the top's four edges and along the feet; a tie (a short loop of cord) at each top corner.
  const n = 12;
  const along = (x0: number, z0: number, x1: number, z1: number, y: (a: number) => number) => Array.from({ length: n + 1 }, (_, i): [number, number, number] => [x0 + ((x1 - x0) * i) / n, y(i / n), z0 + ((z1 - z0) * i) / n]);
  const up: [number, number, number] = [0, 1, 0];
  shell.band(along(N.x0, N.z0, N.x1, N.z0, edgeY), up, 0.035, HEM);
  shell.band(along(N.x0, N.z1, N.x1, N.z1, edgeY), up, 0.035, HEM);
  shell.band(along(N.x0, N.z0, N.x0, N.z1, edgeY), up, 0.035, HEM);
  shell.band(along(N.x1, N.z0, N.x1, N.z1, edgeY), up, 0.035, HEM);
  shell.band(along(N.x0, N.z0 + 0.004, N.x1, N.z0 + 0.004, () => 0.03), up, 0.05, HEM);
  shell.band(along(N.x0 - 0.02, N.z0, N.x0 - 0.02, N.z1, () => 0.03), up, 0.05, HEM);
  shell.band(along(N.x1 + 0.07, N.z0, N.x1 + 0.07, N.z1, () => 0.03), up, 0.05, HEM);
  for (const x of [N.x0, N.x1])
    for (const z of [N.z0, N.z1]) {
      shell.band([[x, H - 0.02, z], [x, H + 0.07, z]], [1, 0, 0], 0.03, HEM * 0.96);
      shell.band([[x, H - 0.02, z], [x, H + 0.07, z]], [0, 0, 1], 0.03, HEM * 0.96);
    }
  // The front: let down from its top edge to the floor (`e` of the way), or gathered in a roll on that edge.
  const NU = 14;
  const NW = 8;
  const front = new NetBuild();
  front.panel(() => [0, 0, 0], NU, NW, W, H, BODY);
  front.band(along(N.x0, N.z1, N.x1, N.z1, () => 0), up, 0.05, HEM);
  const frontGeo = front.geometry();
  const roll = new NetBuild();
  // (a gathered roll: four bands round the edge, a square tube; scaled about the edge as it unrolls)
  const ring: [number, number][] = [[0, 0.06], [0.06, 0], [0, -0.06], [-0.06, 0], [0, 0.06]];
  for (let k = 0; k < 4; k++) {
    const [y0, z0] = ring[k];
    const [y1, z1] = ring[k + 1];
    const pts = along(N.x0 + 0.04, N.z1 + z0 * 0, N.x1 - 0.04, N.z1, (a) => edgeY(a) - 0.06 + y0).map(([x, y, z]): [number, number, number] => [x, y, z + z0]);
    const side: [number, number, number] = [0, y1 - y0, z1 - z0];
    const l = Math.hypot(side[1], side[2]);
    roll.band(
      pts.map(([x, y, z]): [number, number, number] => [x, y + (y1 - y0) / 2, z + (z1 - z0) / 2]),
      [0, side[1] / l, side[2] / l],
      l,
      0.93 - 0.03 * k,
    );
  }
  const holder = new Group();
  holder.position.set(fr.wx(0, 0), F, fr.wz(0, 0));
  holder.rotation.y = fr.theta;
  const shellMesh = new Mesh(shell.geometry(), material);
  const frontMesh = new Mesh(frontGeo, material);
  const rollMesh = new Mesh(roll.geometry(), material);
  for (const m of [shellMesh, frontMesh, rollMesh]) {
    m.renderOrder = 2;
    m.castShadow = false;
  }
  // (the roll shrinks about the top front edge)
  rollMesh.position.set(0, H - 0.06, N.z1);
  rollMesh.geometry.translate(0, -(H - 0.06), -N.z1);
  holder.add(shellMesh, frontMesh, rollMesh);
  object.add(holder);
  const fp = frontGeo.getAttribute('position') as Float32BufferAttribute;
  let at = -1;
  return {
    object,
    set(v) {
      if (Math.abs(v - at) < 1e-4) return;
      at = v;
      const e = v * v * (3 - 2 * v);
      frontMesh.visible = e > 0.01;
      rollMesh.visible = e < 0.98;
      rollMesh.scale.set(1, 1 - 0.8 * e, 1 - 0.8 * e);
      if (!frontMesh.visible) return;
      // The front's points: from the top edge down `e` of the way to the floor, in folds, leaning out onto the floor at its foot.
      const a = fp.array as Float32Array;
      let k = 0;
      for (let j = 0; j <= NW; j++)
        for (let i = 0; i <= NU; i++) {
          const u = i / NU;
          const b = j / NW;
          const top = edgeY(u);
          const y = top - b * e * (top - 0.01);
          const d = b * e;
          a[k++] = N.x0 + W * u;
          a[k++] = y;
          a[k++] = N.z1 + fold(W * u, d, 2.1) + 0.08 * d * d * e;
        }
      // (its hem along the foot)
      for (let i = 0; i <= 12; i++)
        for (const s of [-0.5, 0.5]) {
          const u = i / 12;
          const top = edgeY(u);
          a[k++] = N.x0 + W * u;
          a[k++] = top - e * (top - 0.01) + s * 0.05 + 0.025;
          a[k++] = N.z1 + fold(W * u, e, 2.1) + 0.08 * e * e + 0.004;
        }
      fp.needsUpdate = true;
      frontGeo.computeVertexNormals();
      frontGeo.computeBoundingSphere();
    },
  };
}
