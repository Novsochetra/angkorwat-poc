import { traceSource, type SourceTrace } from '../../feedback/sourceTrace';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { Frame } from '../landmarks/_prasatKit';
import { BAMBOO, bougainvillea, DECK, dog, gableEnd, gableRoof, hen, jar, lantern, Local, mat, moto, planks, potPlant, tone, traps, type GlowFn, type Hole, type Roof, type Tones } from '../village/_kit';
import { GLOW } from '../village/_lights';
import { bicycle, board, claystove, CONCRETE, coop, EV_RIDGE, EV_ROOFS, EV_TRIM, EV_WALLS, fence, frameGlow, gatePillars, gableTrim, hammock, jars, kbach, khmerSpiritHouse, kramaLine, kramaOver, kre, loom, mortar, oxCart, postTones, wokStove, woodpile, type EvEnv } from './_evKit';
import { EV_LIFT, EV_STEP, EV_WALL, evDepths, evKitchen, evStair, evStilts, evUnderSlots, type EvHome } from './_evSpots';

/**
 * A Khmer house on stilts in the sugar-palm village (`EvHome`, _evSpots.ts),
 * in one of the Khmer forms (`form`):
 *
 * - `dol` (ផ្ទះរោងដោល): one steep gable roof over the rooms and the open
 *   veranda in front;
 * - `kantaing` (ផ្ទះកន្តាំង): a steep gable over the rooms and, lower, a roof
 *   skirt all round them, stepping out over the veranda in front and the
 *   narrow eaves on the other sides (on struts from the walls);
 * - `pet` (ផ្ទះប៉ិត): the plain gable with a little gabled porch roof on two
 *   posts over the head of the front stair.
 *
 * All of them: the floor 3 m up on stilts of dark hardwood (on flat footing
 * stones) or whitewashed concrete; plank walls, plain wood or painted
 * (whitewash, pastel blue, green, yellow, pink); red-brown clay tiles, palm
 * thatch, grey or rusting tin; windows with open shutters and wooden bars;
 * a door framed in the trim colour; plain barge boards on the gables (no
 * horns, no hooks: those are Thai), and in a gable a fan of rays out of a
 * little sun or a kbach flame leaf. A stair (wooden, or solid whitewashed
 * concrete) down from the veranda; the space under the floor lived in (a
 * hammock, the bamboo bed platform, a loom, bicycles, a moto, jars,
 * firewood, a hen coop, the rice mortar, fish traps); a kitchen hut on the
 * ground behind with its clay stove or wok (smoke at the cooking times,
 * embers at night); in the front yard a spirit house on its post (a little
 * Angkor tower), flowers, hens, kramas on a line, a fence and a gate
 * between two whitewashed pillars. At night lit windows and doorway, an oil
 * lantern or a tube light on the veranda (glows, no lights). Local frame as
 * _evSpots.ts: x across, +z to the front, y the world height.
 */

/** Wall height over the floor for a form (m): the kantaing's roof skirt tucks under its main eave. */
const wallOf = (h: EvHome): number => (h.form === 'kantaing' ? 3.2 : EV_WALL);

/** The main roof of a house whose floor top is at `F` (m): over the rooms and veranda, or (kantaing) over the rooms only. */
export function evRoof(h: EvHome, F: number): Roof {
  const { zb, zw, zf } = evDepths(h);
  const run = h.roof === 'tin' || h.roof === 'rust' ? 0.5 : 0.45;
  const rise = h.roof === 'thatch' ? 0.5 : h.roof === 'tile' ? 0.45 : 0.36;
  if (h.form === 'kantaing') return { x0: -h.w / 2 - 0.3, x1: h.w / 2 + 0.3, z0: zb - 0.3, z1: zw + 0.3, eave: F + wallOf(h), run, rise };
  return { x0: -h.w / 2 - 0.45, x1: h.w / 2 + 0.45, z0: zb - run, z1: zf + run, eave: F + wallOf(h) - rise, run, rise };
}

/**
 * Build one house into the village (`env.world`, its glows and smoke).
 * Returns false (and builds nothing) when its ground is not fit: water
 * under it, or a bump more than a metre over its middle.
 */
export function evHouse(h: EvHome, env: EvEnv): boolean {
  const src = traceSource();
  const fr = new Frame(h.x, 0, h.z, h.facing);
  const ground = (x: number, z: number) => env.field.heightAt(fr.wx(x, z), fr.wz(x, z));
  const wet = (x: number, z: number) => env.field.waterAt(fr.wx(x, z), fr.wz(x, z)) !== null;
  const { zb, zw, zf } = evDepths(h);
  const st = evStair(h);
  const kit = evKitchen(h);
  const g0 = ground(0, 0);
  // (fit: the footprint, the stair's foot, the kitchen)
  const probes: [number, number][] = [
    [-h.w / 2, zb],
    [h.w / 2, zb],
    [-h.w / 2, zf],
    [h.w / 2, zf],
    [h.stairX, st.footZ],
  ];
  if (kit) probes.push([kit.x, kit.z]);
  for (const [x, z] of probes) if (wet(x, z) || ground(x, z) > g0 + 1) return false;

  const lb = new VoxelBuilder();
  const L = new Local(lb, src, h.seed * 131 + 7);
  const glow = frameGlow(env, fr, h.seed);
  const F = g0 + EV_LIFT;
  const top = F + wallOf(h);
  const W = h.w;
  const wall = EV_WALLS[h.walls];
  const trim = EV_TRIM[h.walls];
  const r = evRoof(h, F);
  const kantaing = h.form === 'kantaing';

  // ── Stilts, joists, the floor ─────────────────────────────────────────────
  const { xs, zs } = evStilts(h);
  const posts = postTones(h.posts);
  for (const x of xs)
    for (const z of zs) {
      const g = ground(x, z);
      if (h.posts === 'wood') {
        L.span(x - 0.16, g - 0.3, z - 0.16, x + 0.16, F - 0.45, z + 0.16, tone(posts, L.r(x, z, 1)), 'mapBark');
        // (on a flat footing stone, against the damp)
        L.box(x, g + 0.08, z, 0.5, 0.18, 0.5, tone([0x8a8478, 0x7e786c, 0x96907f], L.r(z, x, 2)), 'mapStone');
      } else L.span(x - 0.18, g - 0.3, z - 0.18, x + 0.18, F - 0.45, z + 0.18, tone(posts, L.r(x, z, 1)), 'mapStone');
    }
  for (const z of zs) L.span(-W / 2, F - 0.45, z - 0.16, W / 2, F - 0.2, z + 0.16, tone(DECK, L.r(z, 3) * 0.4), 'mapBark', 0.85);
  for (let x = -W / 2, i = 0; x < W / 2 - 0.05; x += 0.5, i++) L.span(x, F - 0.2, zb, Math.min(W / 2, x + 0.5), F, zf, tone(DECK, L.r(i, 4)), 'mapBark', 0.95 + L.r(i, 5) * 0.08);
  // A fascia board round the floor's edge, in the trim colour.
  L.span(-W / 2 - 0.04, F - 0.32, zf - 0.02, W / 2 + 0.04, F - 0.04, zf + 0.05, tone(trim, 0.3), 'mapBark');
  for (const s of [-1, 1]) L.span(s * W / 2 - 0.04, F - 0.32, zb, s * W / 2 + 0.04, F - 0.04, zf, tone(trim, 0.6), 'mapBark');

  // ── Walls round the rooms ─────────────────────────────────────────────────
  const T = 0.2;
  const pane = (x: number, y: number, z: number, sx: number, sz: number) => {
    if (h.lit) glow(x, y, z, sx, 0.8, sz, GLOW.window);
    else L.box(x, y, z, sx, 0.8, sz, 0x2b221c, 'mapBark', 0.9);
  };
  // Back: the back door (to the kitchen) and a window.
  const backDoor = kit ? kit.x + (kit.x > 0 ? -0.6 : 0.6) : -W / 2 + 1.1;
  const backWin = backDoor > 0 ? -W / 4 : W / 4;
  planks(L, 'x', zb + T / 2, T, -W / 2, W / 2, F, top, [
    { a0: backDoor - 0.5, a1: backDoor + 0.5, y0: F, y1: F + 2.25 },
    { a0: backWin - 0.45, a1: backWin + 0.45, y0: F + 1.05, y1: F + 1.95 },
  ], wall);
  L.span(backDoor - 0.5, F, zb + 0.02, backDoor + 0.5, F + 2.25, zb + 0.14, tone(trim, L.r(1, 6)), 'mapBark', 0.9);
  windowAt(L, 'x', backWin, F + 1.5, zb, -1, trim, pane);
  // Front: the door onto the veranda between two windows.
  const wx = W / 4 + 0.5;
  planks(L, 'x', zw - T / 2, T, -W / 2, W / 2, F, top, [
    { a0: -0.5, a1: 0.5, y0: F, y1: F + 2.3 },
    { a0: -wx - 0.45, a1: -wx + 0.45, y0: F + 1.05, y1: F + 1.95 },
    { a0: wx - 0.45, a1: wx + 0.45, y0: F + 1.05, y1: F + 1.95 },
  ], wall);
  // (the doorway: open onto the lamplit room at night, shut when nobody is home)
  if (h.lit) glow(0, F + 1.15, zw - 0.14, 1.0, 2.3, 0.08, GLOW.warm);
  else for (const s of [-1, 1]) L.span(s * 0.5, F, zw - 0.16, s * 0.02, F + 2.3, zw - 0.04, tone(trim, L.r(s, 7)), 'mapBark', 0.92);
  const tc = tone(trim, L.r(3, 8));
  for (const s of [-1, 1]) L.span(s * 0.5 - 0.06, F, zw, s * 0.5 + 0.06, F + 2.42, zw + 0.06, tc, 'mapBark');
  L.span(-0.62, F + 2.3, zw, 0.62, F + 2.44, zw + 0.06, tc, 'mapBark');
  for (const x of [-wx, wx]) windowAt(L, 'x', x, F + 1.5, zw, 1, trim, pane);
  // Sides: a window each, and the gables above (the kantaing's over the rooms only).
  const sun = (s: number) => h.sun === 2 || h.sun === s;
  const gz1 = kantaing ? zw : zf;
  for (const s of [-1, 1]) {
    const x = s * (W / 2 - T / 2);
    const mid = (zb + zw) / 2;
    const holes: Hole[] = h.d >= 4 ? [{ a0: mid - 0.45, a1: mid + 0.45, y0: F + 1.05, y1: F + 1.95 }] : [];
    planks(L, 'z', x, T, zb + T, zw - T, F, top, holes, wall);
    if (holes.length) windowAt(L, 'z', mid, F + 1.5, s * (W / 2), s, trim, pane);
    gableEnd(L, r, x, T, zb, gz1, top, sun(s) ? lighter(wall) : wall);
    // (a gable without its fan of rays gets a kbach flame leaf under the ridge, on the tiled houses)
    if (!sun(s) && h.roof === 'tile') kbach(L, s * (W / 2), top + (roofTopOf(r) - top) * 0.5, (zb + gz1) / 2, 0.75, s, rays(h.walls, trim));
  }

  // ── The veranda: posts to the roof, a railing with a gap for the stair ────
  const vp = W >= 7 ? [-W / 2 + 0.2, 0, W / 2 - 0.2] : [-W / 2 + 0.2, W / 2 - 0.2];
  const postTop = kantaing ? skirtUnder(h, F, zf - 0.15) : r.eave + r.rise;
  for (const x of vp) L.span(x - 0.14, F, zf - 0.3, x + 0.14, postTop, zf - 0.02, tone(h.posts === 'wood' ? wall : CONCRETE, 0.9), h.posts === 'wood' ? 'mapBark' : 'mapStone');
  const railY = F + 0.95;
  const rail = (x0: number, z0: number, x1: number, z1: number) => {
    if (Math.max(x1 - x0, z1 - z0) < 0.3) return;
    L.span(x0, railY - 0.1, z0, x1, railY, z1, tone(trim, 0.2), 'mapBark');
    const along = x1 - x0 > z1 - z0;
    const len = along ? x1 - x0 : z1 - z0;
    if (h.posts === 'concrete') {
      // (a solid whitewashed parapet under the rail)
      L.span(x0, F, z0, x1, railY - 0.1, z1, tone(CONCRETE, L.r(x0, z0, 9)), 'mapStone');
      return;
    }
    for (let s = 0.22; s < len - 0.1; s += 0.4) {
      const x = along ? x0 + s : (x0 + x1) / 2;
      const z = along ? (z0 + z1) / 2 : z0 + s;
      L.box(x, F + 0.42, z, 0.08, 0.84, 0.08, tone(trim, 0.7), 'mapBark');
    }
  };
  const ga = h.stairX - st.width / 2;
  const gb = h.stairX + st.width / 2;
  // (the railing stops 0.35 m wide of the stair: its end's 0.5 m walk-map column stays off the way down, a little off
  // the stair's middle too)
  rail(-W / 2 + 0.34, zf - 0.12, ga - 0.35, zf - 0.02);
  rail(gb + 0.35, zf - 0.12, W / 2 - 0.34, zf - 0.02);
  rail(-W / 2 + 0.02, zw + 0.05, -W / 2 + 0.12, zf - 0.3);
  rail(W / 2 - 0.12, zw + 0.05, W / 2 - 0.02, zf - 0.3);

  // ── The roofs: the main gable, its plain barge boards, the fans of rays; the skirt or the porch ──
  const roofMat = h.roof === 'thatch' ? 'mapBark' : 'mapStone';
  gableRoof(L, r, EV_ROOFS[h.roof], EV_RIDGE[h.roof], roofMat, h.roof === 'thatch' ? 1.6 : h.roof === 'tile' ? 1.2 : 1.0);
  const barge = bargeColour(h, trim);
  for (const s of [-1, 1]) {
    gableTrim(env, fr, src, r, s * (r.x1 + 0.04), barge);
    if (sun(s)) sunburst(env, fr, src, r, s, W, zb, gz1, top, rays(h.walls, trim));
  }
  if (kantaing) skirt(L, env, fr, src, h, F, roofMat);
  if (h.form === 'pet') porchRoof(L, env, fr, src, h, F, ground, roofMat, barge, wall, trim);

  // ── The stair down to the yard ────────────────────────────────────────────
  const gFoot = ground(h.stairX, st.footZ - 0.6);
  const steps = Math.max(2, Math.round((F - gFoot) / EV_STEP));
  const step = (F - gFoot) / steps;
  for (let i = 1; i < steps; i++) {
    const z = zf + (i - 1) * EV_STEP;
    const y = F - i * step;
    if (h.posts === 'concrete') L.span(ga, gFoot - 0.2, z, gb, y, z + EV_STEP, tone(CONCRETE, L.r(i, 10)), 'mapStone', 0.96 + (i % 2) * 0.05);
    else L.span(ga, y - 0.12, z, gb, y, z + EV_STEP, tone(DECK, L.r(i, 11)), 'mapBark');
  }
  // The stair's sides, a step at a time (straight boxes: the walk map takes a tilted one's whole bounds, which would close the stairway):
  // wooden stringers under the treads' ends and a handrail on posts, or a whitewashed parapet stepping down.
  for (const x of [ga - 0.07, gb + 0.07]) {
    for (let i = 1; i < steps; i++) {
      const z = zf + (i - 1) * EV_STEP;
      const y = F - i * step;
      if (h.posts === 'wood') {
        L.span(x - 0.06, y - 0.4, z, x + 0.06, y - 0.12, z + EV_STEP, tone(DECK, 0.1), 'mapBark', 0.9);
        L.span(x - 0.05, y + 0.85, z, x + 0.05, y + 0.95, z + EV_STEP, tone(trim, 0.2), 'mapBark');
        if (i % 2 === 1 || i === steps - 1) L.span(x - 0.05, y, z + 0.2, x + 0.05, y + 0.85, z + 0.3, tone(trim, 0.6), 'mapBark');
      } else L.span(x - 0.08, gFoot - 0.2, z, x + 0.08, y + 0.55, z + EV_STEP, tone(CONCRETE, L.r(i, 12)), 'mapStone', 0.97);
    }
  }

  // ── On the veranda ────────────────────────────────────────────────────────
  const far = h.stairX > 0 ? -1 : 1;
  if (h.lit) {
    if (h.tube) {
      // A fluorescent tube on the front wall over the door (a car battery feeds it), a white fitting.
      L.span(-0.7, F + 2.62, zw + 0.02, 0.7, F + 2.72, zw + 0.1, 0xe8eef0, 'mapStone');
      glow(0, F + 2.6, zw + 0.12, 1.2, 0.06, 0.06, GLOW.tube, 1.2);
    } else lantern(L, far * (W / 2 - 1.0), Math.min(top, postTop) - 0.5, zf - 0.55, glow);
  }
  potPlant(L, -far * (W / 2 - 0.5), F, zw + 0.45, true);
  potPlant(L, far * (W / 2 - 0.45), F, zf - 0.45);
  if (h.dog) dog(L, far * 1.2, F, zw + 0.75);
  else if (h.seed % 3 !== 1) mat(L, far * (W / 2 - 1.4), F, (zw + zf) / 2);
  // Kramas hung over the railing to dry.
  if (h.laundry) for (let k = 0; k < 3; k++) kramaOver(L, far * (W / 2 - 0.9 - k * 0.8), railY, zf - 0.07, h.seed + k);

  // ── Under the house ───────────────────────────────────────────────────────
  const slots = evUnderSlots(h);
  for (const u of h.under) {
    const s = slots[u];
    if (!s) continue;
    const g = ground(s.x, s.z);
    if (u === 'hammock') {
      const i = h.stairX > 0 ? 0 : xs.length - 2;
      hammock(L, xs[i] + 0.16, xs[i + 1] - 0.16, s.z, g, F - 0.75, tone([0x3a6ab8, 0xc84a3a, 0x3a9a6a, 0xd89a2a], L.r(h.seed, 13)));
    } else if (u === 'kre') kre(L, s.x, g, s.z);
    else if (u === 'loom') loom(L, s.x, g, s.z);
    else if (u === 'moto') moto(L, s.x, g, s.z, tone([0xb8322a, 0x2a3a8a, 0x1a1a1a, 0xe8e4dc], L.r(h.seed, 14)));
    else if (u === 'bikes') {
      bicycle(L, s.x - 0.1, g, s.z - 0.35, tone([0x2a5aa8, 0xc83a3a, 0x3a8a4a], L.r(h.seed, 15)));
      bicycle(L, s.x + 0.2, g, s.z + 0.45, tone([0xe0c040, 0x8a3aa0, 0x222222], L.r(h.seed, 16)));
    } else if (u === 'jars') jars(L, s.x, g, s.z, 3);
    else if (u === 'woodpile') woodpile(L, s.x, g, s.z);
    else if (u === 'coop') {
      coop(L, s.x - 0.4, g, s.z);
      hen(L, s.x + 0.5, g, s.z + 0.3, false, true);
    } else if (u === 'mortar') mortar(L, s.x, g, s.z);
    else if (u === 'traps') traps(L, s.x - 0.35, g, s.z - 0.3, 3);
    else if (u === 'cart') {
      // (too long for a bay: beside the house, its pole to the front)
      const cx = far * (W / 2 + 1.9);
      oxCart(env.world, fr, src, cx, ground(cx, zb + 1), zb + 1);
    }
  }
  // A rice basket hung on a stilt, a hoe leaning on another.
  const px = xs[xs.length - 1];
  const pz = zs[zs.length - 1];
  L.box(px - 0.24, F - 1.4, pz, 0.12, 0.3, 0.32, tone(BAMBOO, L.r(h.seed, 17)), 'mapBark');
  L.box(xs[0], ground(xs[0], zs[0]) + 0.9, zs[0] + 0.22, 0.06, 1.7, 0.06, 0x8a6a48, 'mapBark');
  L.box(xs[0], ground(xs[0], zs[0]) + 0.1, zs[0] + 0.35, 0.24, 0.05, 0.2, 0x5a5a58, 'mapStone');

  // ── The kitchen hut behind ────────────────────────────────────────────────
  if (kit) kitchenHut(L, env, fr, kit, ground(kit.x, kit.z), h, glow);

  // ── The front yard ────────────────────────────────────────────────────────
  const yardZ = st.footZ + 0.4;
  const gy = ground(0, yardZ);
  jar(L, gb + 0.55, ground(gb + 0.55, st.footZ - 1), st.footZ - 1);
  if (h.flowers) bougainvillea(L, ga - 1.2, ground(ga - 1.2, st.footZ - 0.8), st.footZ - 0.8, h.seed);
  if (h.spirit) {
    const sx = -h.stairX * 0.75 - far * 0.6;
    const [fx, fy, fz] = khmerSpiritHouse(L, sx, ground(sx, yardZ), yardZ);
    glow(fx, fy + 0.05, fz, 0.06, 0.1, 0.06, 0xffb050, 0.8);
  }
  if (h.hens) for (let k = 0; k < 3; k++) hen(L, far * (1.4 + k * 0.8), gy, yardZ - 0.2 + L.r(k, h.seed, 18) * 1.1, k === 0 && h.seed % 2 === 0, k === 2);
  if (h.laundry) {
    // Kramas and sarongs on a line between two bamboo poles at the house's side.
    const lx = -far * (W / 2 + 1.3);
    const g = ground(lx, 0);
    for (const z of [zb + 0.5, zf - 0.5]) L.box(lx, g + 1.1, z, 0.1, 2.2, 0.1, tone(BAMBOO, L.r(z, 19)), 'mapBark');
    kramaLine(L, lx, zb + 0.5, lx, zf - 0.5, g + 2.05);
  }
  if (h.fence) {
    const fz = st.footZ + 1.3;
    const x0 = -W / 2 - 1.6;
    const x1 = W / 2 + 1.6;
    const gate: [number, number] = [h.stairX - 1.05 - x0, h.stairX + 1.05 - x0];
    fence(env.world, src, env.field, fr.wx(x0, fz), fr.wz(x0, fz), fr.wx(x1, fz), fr.wz(x1, fz), [gate], h.seed);
    gatePillars(L, h.stairX, ground(h.stairX, fz), fz, 1.7, tone([0x8a3a2a, 0x3a6a8a, 0x3a7a5a, 0xc89a3a], L.r(h.seed, 20)));
  }
  fr.place(lb, env.world);

  // Keep the trees off: the house, its stair and yard, the kitchen behind, a side yard.
  const corners: [number, number][] = [
    [-W / 2 - 2.2, zb - (kit ? 4.2 : 1.5)],
    [W / 2 + 2.2, zb - (kit ? 4.2 : 1.5)],
    [-W / 2 - 2.2, st.footZ + 1.5],
    [W / 2 + 2.2, st.footZ + 1.5],
  ];
  const wxs = corners.map(([x, z]) => fr.wx(x, z));
  const wzs = corners.map(([x, z]) => fr.wz(x, z));
  env.field.occupy(Math.min(...wxs), Math.min(...wzs), Math.max(...wxs), Math.max(...wzs));
  return true;
}

/** Top of a roof's ridge (m). */
function roofTopOf(r: Roof): number {
  return r.eave + (Math.ceil((r.z1 - r.z0) / 2 / r.run) + 0.2) * r.rise;
}

/** A window in a wall (along `axis`, centre `a` along it, middle height `y`; `at` the wall's outer face, `out` the side it faces): the pane, three wooden bars, open shutters. */
function windowAt(L: Local, axis: 'x' | 'z', a: number, y: number, at: number, out: number, trim: Tones, pane: (x: number, y: number, z: number, sx: number, sz: number) => void): void {
  const c = tone(trim, L.r(a, y, 21));
  const face = at + out * 0.04;
  if (axis === 'x') {
    pane(a, y, at - out * 0.1, 0.9, 0.1);
    for (const d of [-0.22, 0, 0.22]) L.box(a + d, y, at - out * 0.02, 0.06, 0.9, 0.06, c, 'mapBark');
    for (const s of [-1, 1]) L.box(a + s * 0.72, y, face, 0.44, 0.92, 0.06, c, 'mapBark', 0.95);
    L.box(a, y - 0.5, face, 1.1, 0.08, 0.12, c, 'mapBark');
  } else {
    pane(at - out * 0.1, y, a, 0.1, 0.9);
    for (const d of [-0.22, 0, 0.22]) L.box(at - out * 0.02, y, a + d, 0.06, 0.9, 0.06, c, 'mapBark');
    for (const s of [-1, 1]) L.box(face, y, a + s * 0.72, 0.06, 0.92, 0.44, c, 'mapBark', 0.95);
    L.box(face, y - 0.5, a, 0.12, 0.08, 1.1, c, 'mapBark');
  }
}

/** A lighter set of a wall's tones (the sunburst gable's ground). */
function lighter(t: Tones): Tones {
  return t.map((c) => {
    const k = 1.12;
    const ch = (s: number) => Math.min(255, Math.round(((c >> s) & 255) * k));
    return (ch(16) << 16) | (ch(8) << 8) | ch(0);
  });
}

/** The colour of the gable's rays and kbach leaf: the trim on white and yellow walls, cream on the other paints, pale wood on plain wood. */
function rays(walls: EvHome['walls'], trim: Tones): number {
  return walls === 'wood' ? 0xc8a878 : walls === 'white' || walls === 'yellow' ? tone(trim, 0.2) : 0xefe8d8;
}

/** The barge boards' colour: cream on the tiled roofs, dark wood on thatch, the trim on tin. */
function bargeColour(h: EvHome, trim: Tones): number {
  return h.roof === 'tile' ? 0xeee6d2 : h.roof === 'thatch' ? 0x5a4232 : tone(trim, 0.4);
}

/**
 * A fan of rays in the gable on side `s` (±1) between the depths `zb`‥`zf`:
 * a tie beam across its foot, a little half sun in the middle, nine rays
 * fanning out of it to the roof.
 */
function sunburst(env: EvEnv, fr: Frame, src: SourceTrace | undefined, r: Roof, s: number, W: number, zb: number, zf: number, top: number, color: number): void {
  const x = s * (W / 2 + 0.04);
  const mid = (zb + zf) / 2;
  const hw = (zf - zb) / 2;
  const apex = r.eave + (hw / r.run + 1) * r.rise - 0.45;
  const H = apex - top;
  const y0 = top + 0.08;
  const lb = new VoxelBuilder();
  const L = new Local(lb, src, 3);
  L.span(x - 0.06, top - 0.06, zb, x + 0.06, top + 0.08, zf, color, 'mapBark', 0.9);
  L.box(x, y0 + 0.14, mid, 0.08, 0.3, 0.7, 0xe0b048, 'mapStone', 1.05);
  L.box(x, y0 + 0.3, mid, 0.08, 0.1, 0.4, 0xe0b048, 'mapStone', 1.05);
  fr.place(lb, env.world);
  const n = 9;
  for (let i = 0; i < n; i++) {
    const phi = (Math.PI * (i + 0.5)) / n;
    const c = Math.cos(phi);
    const sn = Math.sin(phi);
    const t = (H - 0.08) / (sn + (H * Math.abs(c)) / hw);
    const a = 0.45;
    const b = t - 0.14;
    if (b - a < 0.2) continue;
    board(env.world, fr, src, x, mid + c * a, y0 + sn * a, mid + c * b, y0 + sn * b, 0.12, 0.07, color, 'mapBark', i % 2 ? 1 : 0.9);
  }
}

/** Rings of the kantaing's roof skirt: how many, their drop each (m), how far each reaches out at the sides and back (m), the first one's top over the floor (m). */
const SKIRT = { rings: 4, drop: 0.17, side: 0.3, top: 3.12 };

/** The underside of the kantaing's skirt over a depth `z` of the veranda (m). */
function skirtUnder(h: EvHome, F: number, z: number): number {
  const { zw } = evDepths(h);
  const runF = (h.v + 0.5) / SKIRT.rings;
  const k = Math.min(SKIRT.rings - 1, Math.max(0, Math.floor((z - zw) / runF)));
  return F + SKIRT.top - SKIRT.drop * k - 0.12;
}

/**
 * The kantaing's roof skirt: rings stepping down and out from under the
 * main eave all round the rooms — deep over the veranda in front, narrow at
 * the sides and back (on struts from the walls) — in the roof's own
 * material, cut into sheets or tiles of their own tones.
 */
function skirt(L: Local, env: EvEnv, fr: Frame, src: SourceTrace | undefined, h: EvHome, F: number, mat: 'mapBark' | 'mapStone'): void {
  const { zb, zw } = evDepths(h);
  const W = h.w;
  const runF = (h.v + 0.5) / SKIRT.rings;
  const rs = SKIRT.side;
  const tones = EV_ROOFS[h.roof];
  const strip = (x0: number, z0: number, x1: number, z1: number, y: number, k: number) => {
    const alongX = x1 - x0 >= z1 - z0;
    const a0 = alongX ? x0 : z0;
    const a1 = alongX ? x1 : z1;
    let a = a0;
    let i = 0;
    while (a1 - a > 0.05) {
      let e = Math.min(a1, a + 1.1 + L.r(k, i, a0) * 0.6);
      if (a1 - e < 0.4) e = a1;
      const c = tone(tones, L.r(a, k, 41));
      const sh = (k % 2 ? 0.95 : 1) * (0.95 + L.r(i, k, 42) * 0.08);
      if (alongX) L.span(a, y - 0.12, z0, e, y, z1, c, mat, sh);
      else L.span(x0, y - 0.12, a, x1, y, e, c, mat, sh);
      a = e;
      i++;
    }
  };
  for (let k = 0; k < SKIRT.rings; k++) {
    const y = F + SKIRT.top - SKIRT.drop * k;
    const ox = W / 2 + rs * (k + 1);
    strip(-ox, zw + runF * k - (k ? 0 : 0.1), ox, zw + runF * (k + 1), y, k);
    strip(-ox, zb - rs * (k + 1), ox, zb - rs * k + (k ? 0 : 0.1), y, k);
    for (const s of [-1, 1]) {
      const xa = s > 0 ? W / 2 + rs * k - (k ? 0 : 0.1) : -W / 2 - rs * (k + 1);
      const xb = s > 0 ? W / 2 + rs * (k + 1) : -W / 2 - rs * k + (k ? 0 : 0.1);
      strip(xa, zb - rs * k, xb, zw + runF * k, y, k);
    }
  }
  // Struts from the walls up under the skirt's edge at the sides and back.
  const reach = rs * SKIRT.rings;
  const yEdge = F + SKIRT.top - SKIRT.drop * (SKIRT.rings - 1) - 0.14;
  for (const s of [-1, 1])
    for (const z of [zb + 0.6, zw - 0.6]) {
      // (a strut across x: in a frame turned a quarter, whose own z runs along this frame's x)
      const q = new Frame(fr.wx(0, z), 0, fr.wz(0, z), fr.theta + Math.PI / 2);
      board(env.world, q, src, 0, s * (W / 2 + 0.05), F + 2.0, s * (W / 2 + reach - 0.15), yEdge, 0.1, 0.1, 0x5a4232);
    }
  for (const x of [-W / 2 + 0.8, W / 2 - 0.8]) board(env.world, fr, src, x, zb - 0.05, F + 2.0, zb - reach + 0.15, yEdge, 0.1, 0.1, 0x5a4232);
}

/**
 * The pet's porch: a little gabled roof over the head of the front stair,
 * its ridge running out from the house, its gable (plain barge boards, a
 * kbach leaf) looking to the front, on two posts standing in the yard
 * either side of the stair. Built in a frame turned a quarter from the
 * house's.
 */
function porchRoof(L: Local, env: EvEnv, fr: Frame, src: SourceTrace | undefined, h: EvHome, F: number, ground: (x: number, z: number) => number, mat: 'mapBark' | 'mapStone', barge: number, wall: Tones, trim: Tones): void {
  const { zf } = evDepths(h);
  const Lp = 2.3;
  // (its posts well clear of the stair's handrails: the roaming explorer comes down it a little off its middle)
  const Wp = evStair(h).width + 1.6;
  const zc = zf + Lp / 2 - 0.25;
  // (the porch's frame: its x along the house's +z, so its ridge runs out from the house)
  const pf = new Frame(h.stairX, 0, zc, -Math.PI / 2);
  const pb = new VoxelBuilder();
  const P = new Local(pb, src, h.seed * 17 + 3);
  const run = 0.4;
  const rise = h.roof === 'thatch' ? 0.46 : 0.4;
  const eave = F + 2.42;
  const rp: Roof = { x0: -Lp / 2, x1: Lp / 2 + 0.2, z0: -Wp / 2 - 0.35, z1: Wp / 2 + 0.35, eave, run, rise };
  gableRoof(P, rp, EV_ROOFS[h.roof], EV_RIDGE[h.roof], mat, 1.0);
  gableEnd(P, rp, Lp / 2 - 0.06, 0.12, -Wp / 2, Wp / 2, eave + rise, wall);
  kbach(P, Lp / 2, eave + rise + (roofTopOf(rp) - eave - rise) * 0.42, 0, 0.5, 1, rays(h.walls, trim));
  pf.place(pb, L.b);
  // The two posts in the yard, a beam across under the gable.
  const pz = zc + Lp / 2 - 0.15;
  for (const s of [-1, 1]) {
    const x = h.stairX + s * (Wp / 2 - 0.05);
    L.span(x - 0.1, ground(x, pz) - 0.2, pz - 0.1, x + 0.1, eave + 0.05, pz + 0.1, tone(trim, 0.5), 'mapBark');
  }
  L.span(h.stairX - Wp / 2 - 0.1, eave - 0.1, pz - 0.1, h.stairX + Wp / 2 + 0.1, eave + 0.08, pz + 0.1, tone(trim, 0.3), 'mapBark');
  // Its barge boards, in the porch's frame on the map.
  gableTrim(env, new Frame(fr.wx(h.stairX, zc), 0, fr.wz(h.stairX, zc), fr.theta - Math.PI / 2), src, rp, rp.x1 + 0.04, barge);
}

/**
 * The kitchen hut on the ground behind a house (`k`: its middle and size,
 * local): corner posts, a lean-to roof sloping away from the house, a
 * woven bamboo back and outer side, open toward the house; the clay stove
 * against the back (its smoke, its embers at night), firewood, a shelf of
 * pots, a water jar.
 */
function kitchenHut(L: Local, env: EvEnv, fr: Frame, k: { x: number; z: number; w: number; d: number }, g: number, h: EvHome, glow: GlowFn): void {
  const x0 = k.x - k.w / 2;
  const x1 = k.x + k.w / 2;
  const z0 = k.z - k.d / 2;
  const z1 = k.z + k.d / 2;
  const hi = g + 2.8;
  const lo = g + 2.2;
  for (const [x, z, y] of [
    [x0 + 0.1, z0 + 0.1, lo],
    [x1 - 0.1, z0 + 0.1, lo],
    [x0 + 0.1, z1 - 0.1, hi],
    [x1 - 0.1, z1 - 0.1, hi],
  ])
    L.span(x - 0.1, g - 0.2, z - 0.1, x + 0.1, y, z + 0.1, tone(BAMBOO, L.r(x, z, 22) * 0.5), 'mapBark');
  // The lean-to: four rows stepping down from the front to the back, overhanging.
  const thatch = h.roof === 'thatch' || h.seed % 2 === 0;
  const tones = thatch ? EV_ROOFS.thatch : EV_ROOFS.rust;
  const rows = 4;
  const za = z1 + 0.35;
  const zbk = z0 - 0.35;
  for (let i = 0; i < rows; i++) {
    const ra = za - ((za - zbk) * i) / rows;
    const rb = za - ((za - zbk) * (i + 1)) / rows;
    const y = hi + 0.12 - ((hi - lo + 0.1) * (i + 0.5)) / rows;
    for (let xx = x0 - 0.3, j = 0; xx < x1 + 0.25; xx += 1.2, j++) L.span(xx, y - 0.1, rb, Math.min(x1 + 0.3, xx + 1.2), y + 0.12, ra, tone(tones, L.r(i, j, 23)), thatch ? 'mapBark' : 'mapStone', 0.95 + (i % 2) * 0.05);
  }
  // Woven bamboo walls: the back, and the side away from the house's middle.
  const woven = [0xb8a070, 0xa89060, 0xc4ac7c];
  L.span(x0 + 0.1, g, z0, x1 - 0.1, lo - 0.1, z0 + 0.08, tone(woven, L.r(k.x, 24)), 'mapBark');
  const sx = k.x > 0 ? x1 - 0.08 : x0;
  L.span(sx, g, z0 + 0.1, sx + 0.08, lo - 0.1, z1 - 0.4, tone(woven, L.r(k.z, 25)), 'mapBark', 0.94);
  // The stove against the back, its embers, the smoke; firewood; a shelf of pots; a jar.
  const stx = k.x - 0.3;
  const stz = z0 + (h.wok ? 0.65 : 0.55);
  const topY = h.wok ? wokStove(L, stx, g, stz) : claystove(L, stx, g, stz);
  env.smoke.push({ x: fr.wx(stx, stz), y: topY, z: fr.wz(stx, stz) });
  glow(stx, g + 0.28, stz + 0.29, 0.22, 0.14, 0.04, GLOW.ember);
  L.span(stx + 0.5, g, stz - 0.25, stx + 1.5, g + 0.36, stz + 0.25, 0x7a5a3a, 'mapBark');
  L.span(x0 + 0.2, g + 1.3, z0 + 0.1, x0 + 1.4, g + 1.36, z0 + 0.4, 0x6a5038, 'mapBark');
  for (let i = 0; i < 3; i++) L.box(x0 + 0.4 + i * 0.4, g + 1.48, z0 + 0.25, 0.26, 0.24, 0.24, tone([0x3a342e, 0x8a5a3a, 0xa8a49a], L.r(i, k.x, 26)), 'mapStone');
  jar(L, x1 - 0.55, g, z1 - 0.6, 0.9);
}
