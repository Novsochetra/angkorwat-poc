import { traceSource } from '../../feedback/sourceTrace';
import type { VoxelBox, VoxelBuilder } from '../../voxel/VoxelBuilder';
import { BENCH, CHIMNEY, JARS, KID_STOOL, LANTERN, MAT, PILE, RACK, ROOF, STOVE, VENT, WOK_R, WOKS } from './_psPlan';
import { BAMBOO, basket, CAKE, EARTH, FROND, PsFrame, pick, POST, STRAW, thatchSlope, THATCH_SOOT, WEAVE, WOOD, type Rgb } from './_psKit';

/**
 * The family's palm sugar shed (រោងដាំស្ករ), built in its frame (`_psPlan.ts`
 * `HUT`: +x east to the open front, +z south): posts of rough hardwood on
 * stones under a steep roof of sugar-palm thatch, silver-brown with a few
 * newer golden bundles, blackened by years of smoke round the long raised
 * vent along the ridge over the stove (a little thatched roof of its own on
 * short posts, the steam and the smoke pour out under it); on the west the
 * thatch sweeps down lower over a woven palm-leaf wall, the gables are
 * closed with woven leaf (the north one faces the lane's approach), the east
 * side stays open to the yard and the lane. Under the east slope the long
 * low clay stove with three big iron woks in a row, a fire mouth under each
 * on the lane side (frond stalks being fed in), a short chimney at its north
 * end; the juice jars in the south-east corner, the mat of palm-leaf rings
 * where the syrup is poured into cakes, a low bench under the eaves and the
 * child's stool, a lantern hung from the front beam, bundles of rings and a
 * krama hanging on the wall; outside the fronds and firewood stacked north,
 * a rack of clean tubes drying. Sizes are the people's (1.4 × true: the
 * eaves clear their heads).
 *
 * `glow` receives the fire mouths' coals and flames (hut frame, m) for the
 * fire's glow mesh, `lamp` the lantern's flame for the lamps' own;
 * `WOK_TOP` is the woks' rims (m over the ground) for the syrup.
 */

/** A glowing box (hut frame, m): centre, size, colour, flicker phase. */
export type PsGlowFn = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, phase: number) => void;

/** The fire's colours (sRGB): the coals deep in a mouth, the flames licking out. */
export const FIRE = { coal: 0xff4a12, flame: 0xffa040 } as const;
/** A lamp's flame behind its glass (sRGB). */
export const LAMP_FLAME = 0xffb45a;

/** Top of the woks' rims over the ground (m): the syrup lies just under it. */
export const WOK_TOP = STOVE.h + 0.09;

// ── Colours (sRGB) of the shed's own things ──
/** Clay stove: reddish earth, blackened round the fire. */
const CLAY: readonly Rgb[] = [0x8a5a3c, 0x7e5236, 0x96643f, 0x74492e];
const SOOT: readonly Rgb[] = [0x2c2420, 0x3a2e26, 0x241e1a];
const IRON: readonly Rgb[] = [0x2e2a28, 0x383230, 0x3e3029];
/** Earthen juice jars (glazed dark brown). */
const JAR: readonly Rgb[] = [0x5e3620, 0x6b3f26, 0x4e2c1a, 0x62402a];
const ASH: readonly Rgb[] = [0x8a847a, 0x7a746c, 0x96908a];
/** Palm sugar: fresh syrup in the rings. */
const SYRUP_FRESH: readonly Rgb[] = [0xa8621e, 0xb06a22, 0x9c581a];
const TUBE: readonly Rgb[] = [0x6a4a2c, 0x7a5a36, 0x5c3e24, 0x846440];

export function buildHut(b: VoxelBuilder, ox: number, oy: number, oz: number, glow: PsGlowFn, lamp: PsGlowFn, small: Set<VoxelBox>): void {
  const H = new PsFrame(b, ox, oy, oz, undefined, small);
  floor(H);
  frame(H);
  roof(H);
  wall(H);
  gables(H);
  stove(H, glow);
  jars(H);
  mat(H);
  bench(H);
  hanging(H, lamp);
  pile(H);
  rack(H);
}

/** Packed earth under the roof (a little darker than the yard), ash before the fire mouths. */
function floor(H: PsFrame): void {
  H = H.at(traceSource()).fine;
  const x0 = -ROOF.postX - 0.3;
  const x1 = ROOF.postX + 0.5;
  const z0 = ROOF.rows[0] - 0.3;
  const z1 = ROOF.rows[2] + 0.3;
  for (let x = x0, i = 0; x < x1 - 0.01; x += 1.7, i++)
    for (let z = z0, k = 0; z < z1 - 0.01; z += 1.9, k++)
      H.span(x, 0, z, Math.min(x1, x + 1.7), 0.03, Math.min(z1, z + 1.9), pick(EARTH, H.r(i, k, 1)), 'mapStone', 0.86 + 0.1 * H.r(k, i, 2));
  const fx = STOVE.x + STOVE.w / 2;
  for (const [k, wz] of WOKS.entries()) H.span(fx, 0.03, wz - 0.55, fx + 0.9, 0.045, wz + 0.5, pick(ASH, H.r(k, 3)), 'mapStone', 0.95);
}

/** Posts on stones (the ones by the stove smoke-dark), the eave and tie beams, the ridge on its two tall posts, bamboo rafters. */
function frame(H: PsFrame): void {
  H = H.at(traceSource());
  const { postX: px, rows, eave, ridge } = ROOF;
  let i = 0;
  for (const z of rows)
    for (const x of [-px, px]) {
      H.fine.box(x, 0.06, z, 0.34, 0.12, 0.34, 0x8a8478, 'mapStone', 0.9);
      H.box(x, eave / 2, z, 0.22, eave, 0.22, pick(POST, H.r(i++, 4)), 'mapBark', x > 0 ? 0.85 : 1, (H.r(i, 5) - 0.5) * 0.2);
    }
  for (const z of [rows[0], rows[2]]) H.box(0, ridge / 2, z, 0.2, ridge, 0.2, pick(POST, H.r(z, 6)), 'mapBark');
  const z0 = rows[0] - 0.25;
  const z1 = rows[2] + 0.25;
  for (const x of [-px, px]) H.span(x - 0.09, eave - 0.1, z0, x + 0.09, eave + 0.06, z1, pick(POST, H.r(x, 7)), 'mapBark');
  H.span(-0.09, ridge - 0.14, z0, 0.09, ridge + 0.02, z1, pick(POST, H.r(8)), 'mapBark', 0.8);
  for (const z of rows) {
    H.span(-px - 0.15, eave - 0.2, z - 0.07, px + 0.15, eave - 0.08, z + 0.07, pick(POST, H.r(z, 9)), 'mapBark', 0.9);
    // (rafters from the eaves up to the ridge, both sides; smoke-dark near the top)
    for (const s of [-1, 1]) H.fine.stick(s * (px + ROOF.over - 0.1), eave - 0.02, z + 0.35, 0, ridge - 0.05, z + 0.35, 0.08, pick(BAMBOO, H.r(z, s, 10)), 'mapBark', 0.62);
  }
}

/** How smoke-black the thatch is at z on row k (0‥1): round the vent, most at the top rows over the stove. */
function sootAt(z: number, k: number, rows: number): number {
  const along = z > VENT.z0 - 0.5 && z < VENT.z1 + 0.5 ? 1 : Math.max(0, 1 - Math.min(Math.abs(z - VENT.z0), Math.abs(z - VENT.z1)) / 1.6);
  const up = Math.max(0, (k - (rows - 4)) / 3);
  return along * up;
}

/**
 * Sugar-palm thatch: rows stepping up from each eave to the ridge (`_psKit.ts`
 * `thatchSlope`), smoke-black round the vent; on the west a lower skirt of
 * two more rows over the wall (the old lean-to); a ridge cap of folded
 * leaves; over the stove the top rows are left open under the vent's own
 * little thatched roof on short posts, dark with soot underneath.
 */
function roof(H: PsFrame): void {
  H = H.at(traceSource());
  const { postX: px, eave, ridge, over } = ROOF;
  const edge = px + over;
  const z0 = ROOF.rows[0] - over;
  const z1 = ROOF.rows[2] + over;
  const rows = 9;
  for (const s of [-1, 1])
    thatchSlope(H, { x0: s * edge, y0: eave - 0.12, x1: s * 0.02, y1: ridge + 0.05, z0, z1, rows, seed: 12 + s, gap: [VENT.z0, VENT.z1], soot: (z, k) => sootAt(z, k, rows) });
  // The west skirt: two rows further down and out over the woven wall.
  const run = edge / rows;
  const rise = (ridge + 0.05 - eave + 0.12) / rows;
  thatchSlope(H, { x0: -edge - 2 * run * 1.3, y0: eave - 0.12 - 2 * rise * 1.3, x1: -edge + 0.12, y1: eave - 0.1, z0: z0 + 0.3, z1: z1 - 0.3, rows: 2, seed: 30 });
  // (the ridge cap either side of the vent)
  for (const [za, zb] of [
    [z0 - 0.05, VENT.z0],
    [VENT.z1, z1 + 0.05],
  ])
    H.span(-0.35, ridge + 0.02, za, 0.35, ridge + 0.32, zb, 0x5e5040, 'mapBark', 0.95);
  // The vent: a little gable of thatch on short posts over the gap, soot-black underneath and round its lips.
  const vy = ridge + 0.66;
  for (const z of [VENT.z0 + 0.15, (VENT.z0 + VENT.z1) / 2, VENT.z1 - 0.15]) H.fine.box(0, ridge + 0.33, z, 0.09, 0.7, 0.09, pick(POST, H.r(z, 70)), 'mapBark', 0.6);
  for (const s of [-1, 1]) {
    thatchSlope(H, { x0: s * 1.3, y0: vy - 0.12, x1: s * 0.02, y1: vy + 0.5, z0: VENT.z0 - 0.45, z1: VENT.z1 + 0.45, rows: 2, seed: 70 + s, thick: 0.13 });
    // (soot on the lips of the gap, where the smoke streams past; black under the vent's roof)
    H.fine.span(s > 0 ? 0.3 : -0.55, ridge - 0.02, VENT.z0, s > 0 ? 0.55 : -0.3, ridge + 0.1, VENT.z1, pick(SOOT, H.r(s, 72)), 'mapBark');
  }
  H.span(-1.0, vy - 0.16, VENT.z0 - 0.3, 1.0, vy - 0.12, VENT.z1 + 0.3, pick(THATCH_SOOT, H.r(73)), 'mapBark', 0.6);
  H.span(-0.22, vy + 0.5, VENT.z0 - 0.47, 0.22, vy + 0.7, VENT.z1 + 0.47, 0x4e4032, 'mapBark', 0.9);
}

/** The west wall: woven palm-leaf panels between the posts, bamboo battens across. */
function wall(H: PsFrame): void {
  H = H.at(traceSource());
  const x = -ROOF.postX - 0.02;
  const [za, , zb] = ROOF.rows;
  for (let z = za + 0.12, i = 0; z < zb - 0.13; z += 0.66, i++)
    for (let y = 0.05, j = 0; y < 2.3; y += 0.38, j++) {
      const e = Math.min(zb - 0.12, z + 0.66);
      H.span(x - 0.03, y, z, x + 0.03, Math.min(2.4, y + 0.38), e, pick(WEAVE, H.r(i, j, 14)), 'mapBark', (i + j) % 2 ? 0.9 : 1.02);
    }
  for (const y of [0.35, 1.2, 2.05]) H.fine.span(x + 0.03, y - 0.04, za, x + 0.09, y + 0.04, zb, pick(BAMBOO, H.r(y, 15)), 'mapBark');
}

/**
 * The gables: woven palm-leaf panels filling the triangle between the tie
 * beam and the roof at both ends (in steps, the weave's squares checkered),
 * a bamboo batten across and one up the middle; the south one has a smoke
 * hole under its peak.
 */
function gables(H: PsFrame): void {
  H = H.at(traceSource());
  const { eave, ridge, postX: px, over, rows } = ROOF;
  const edge = px + over;
  const band = 0.3;
  for (const [z, hole] of [
    [rows[0] - 0.04, false],
    [rows[2] + 0.04, true],
  ] as [number, boolean][]) {
    for (let y = eave - 0.2, j = 0; y < ridge - 0.15; y += band, j++) {
      // (the roof's underside at this height: the panels reach just under it)
      const w = Math.max(0.2, edge * ((ridge + 0.05 - (y + band)) / (ridge + 0.05 - eave + 0.12)) - 0.12);
      if (hole && y > ridge - 1.0) {
        H.span(-w, y, z - 0.03, -0.35, y + band, z + 0.03, pick(WEAVE, H.r(j, z, 16)), 'mapBark', j % 2 ? 0.88 : 1);
        H.span(0.35, y, z - 0.03, w, y + band, z + 0.03, pick(WEAVE, H.r(j, z, 17)), 'mapBark', j % 2 ? 1 : 0.88);
        continue;
      }
      // (two halves of their own tone: the weave's checker)
      H.span(-w, y, z - 0.03, 0, y + band, z + 0.03, pick(WEAVE, H.r(j, z, 16)), 'mapBark', j % 2 ? 0.88 : 1);
      H.span(0, y, z - 0.03, w, y + band, z + 0.03, pick(WEAVE, H.r(j, z, 17)), 'mapBark', j % 2 ? 1 : 0.88);
    }
    const s = z < 0 ? -1 : 1;
    H.fine.span(-edge + 0.4, eave + 0.35, z + s * 0.03, edge - 0.4, eave + 0.42, z + s * 0.09, pick(BAMBOO, H.r(z, 18)), 'mapBark');
    H.fine.span(-0.04, eave - 0.2, z + s * 0.03, 0.04, ridge - 0.2, z + s * 0.09, pick(BAMBOO, H.r(z, 19)), 'mapBark');
  }
}

/**
 * The long clay stove: a low ridge of earth along z, open under each wok on
 * the east (the fire mouths, black inside, coals glowing at the back and
 * flames licking out; frond stalks poking out, being fed in), a collar of
 * clay round each wok, the iron woks' rims and handles, the chimney at the
 * north end, soot round the mouths and the top.
 */
function stove(H: PsFrame, glow: PsGlowFn): void {
  H = H.at(traceSource());
  const { x: sx, z0, z1, w, h } = STOVE;
  const xa = sx - w / 2;
  const xb = sx + w / 2;
  const MOUTH = { w: 0.5, h: 0.42, deep: 0.42 };
  // Along z: between the woks the stove is whole; at a wok, the body stops under the bowl and the mouth opens east.
  const cuts: [number, number][] = WOKS.map((wz) => [wz - WOK_R + 0.08, wz + WOK_R - 0.08]);
  let z = z0;
  let i = 0;
  for (const [ca, cb] of cuts) {
    if (ca > z) H.span(xa, 0, z, xb, h, ca, pick(CLAY, H.r(i++, 16)), 'mapStone', 0.95 + 0.08 * H.r(i, 17));
    // Under the wok: the back half whole to the bowl, the front with the mouth in it.
    const mz = (ca + cb) / 2;
    H.span(xa, 0, ca, xb - MOUTH.deep, h - 0.2, cb, pick(CLAY, H.r(i++, 16)), 'mapStone');
    H.span(xb - MOUTH.deep, 0, ca, xb, h - 0.2, mz - MOUTH.w / 2, pick(CLAY, H.r(i++, 16)), 'mapStone');
    H.span(xb - MOUTH.deep, 0, mz + MOUTH.w / 2, xb, h - 0.2, cb, pick(CLAY, H.r(i++, 16)), 'mapStone');
    H.span(xb - MOUTH.deep, MOUTH.h, mz - MOUTH.w / 2, xb, h - 0.2, mz + MOUTH.w / 2, pick(SOOT, H.r(i, 18)), 'mapStone');
    // (the mouth: black inside, the floor of ash)
    H.fine.span(xb - MOUTH.deep, 0.02, mz - MOUTH.w / 2, xb - 0.02, 0.05, mz + MOUTH.w / 2, pick(ASH, H.r(i, 19)), 'mapStone', 0.6);
    // Coals at the back of the mouth, flames licking up round the wok's belly, a glow at the mouth.
    glow(xb - MOUTH.deep + 0.12, 0.12, mz, 0.2, 0.16, MOUTH.w - 0.1, FIRE.coal, i * 1.7);
    glow(xb - MOUTH.deep + 0.2, 0.28, mz - 0.08, 0.22, 0.2, 0.18, FIRE.flame, i * 2.3 + 1);
    glow(xb - MOUTH.deep + 0.24, 0.26, mz + 0.1, 0.2, 0.16, 0.16, FIRE.flame, i * 2.9 + 2);
    // Frond stalks being fed in, poking out of the mouth to the ground.
    for (let s = 0; s < 2; s++) {
      const off = (s - 0.5) * 0.22;
      H.fine.stick(xb - 0.25, 0.16 + 0.04 * s, mz + off, xb + 0.75 + 0.3 * H.r(i, s, 20), 0.03, mz + off * 2.2, 0.07, pick(FROND, H.r(i, s, 21)), 'mapBark', 0.95);
    }
    // The clay collar round the wok (soot-black on top), the iron rim and two handles.
    const wz = (ca + cb) / 2;
    const n = 12;
    for (let k = 0; k < n; k++) {
      const a = ((k + 0.5) / n) * Math.PI * 2;
      const cx = sx + Math.sin(a) * (WOK_R + 0.02);
      const cz = wz + Math.cos(a) * (WOK_R + 0.02);
      // (each piece along the ring's tangent: turned by its angle)
      H.fine.box(cx, h - 0.12, cz, 0.36, 0.24, 0.16, pick(k % 3 ? CLAY : SOOT, H.r(i, k, 22)), 'mapStone', 0.92, a);
      H.fine.box(sx + Math.sin(a) * (WOK_R - 0.03), h + 0.045, wz + Math.cos(a) * (WOK_R - 0.03), 0.34, 0.09, 0.07, pick(IRON, H.r(i, k, 23)), 'mapStone', 1, a);
    }
    H.fine.box(sx, h - 0.16, wz, WOK_R * 1.5, 0.12, WOK_R * 1.5, pick(IRON, H.r(i, 24)), 'mapStone', 0.8);
    for (const s of [-1, 1]) H.fine.box(sx, h + 0.1, wz + s * (WOK_R + 0.05), 0.2, 0.05, 0.06, pick(IRON, H.r(i, s, 25)), 'mapStone');
    z = cb;
  }
  if (z1 > z) H.span(xa, 0, z, xb, h, z1, pick(CLAY, H.r(i++, 16)), 'mapStone');
  // A lip of darker clay along the top edges, soot on the east face over the mouths.
  H.fine.span(xa - 0.04, h - 0.06, z0 - 0.04, xa + 0.06, h + 0.02, z1 + 0.04, pick(CLAY, H.r(26)), 'mapStone', 0.85);
  for (const wz of WOKS) H.fine.span(xb - 0.01, h - 0.24, wz - 0.36, xb + 0.02, h - 0.05, wz + 0.36, pick(SOOT, H.r(wz, 27)), 'mapStone');
  // The chimney: a short tapering clay stack, black at its mouth.
  const c = CHIMNEY;
  H.box(c.x, 0.45, c.z, 0.7, 0.9, 0.62, pick(CLAY, H.r(28)), 'mapStone');
  H.box(c.x, 1.15, c.z, 0.52, 0.5, 0.48, pick(CLAY, H.r(29)), 'mapStone', 0.95);
  H.box(c.x, c.top - 0.2, c.z, 0.4, 0.4, 0.38, pick(SOOT, H.r(30)), 'mapStone');
}

/** The juice jars (peang): a foot, the round belly, shoulder and neck; the juice dark in their mouths, a filter cloth tied over one. */
function jars(H: PsFrame): void {
  H = H.at(traceSource());
  JARS.forEach((j, k) => {
    const c = pick(JAR, H.r(k, 31));
    const s = 1 - 0.08 * k;
    H.box(j.x, 0.1 * s, j.z, 0.5 * s, 0.2 * s, 0.5 * s, c, 'mapStone', 0.88);
    H.box(j.x, 0.42 * s, j.z, 0.82 * s, 0.46 * s, 0.82 * s, c, 'mapStone');
    H.box(j.x, 0.72 * s, j.z, 0.6 * s, 0.16 * s, 0.6 * s, c, 'mapStone', 1.04);
    H.box(j.x, 0.84 * s, j.z, 0.42 * s, 0.1 * s, 0.42 * s, c, 'mapStone', 1.08);
    if (k === 0) {
      // (the filter cloth over the one being filled, and its cord)
      H.fine.box(j.x, 0.9 * s, j.z, 0.5 * s, 0.03, 0.5 * s, 0xe8e0cc, 'mapStone', 1);
      H.fine.box(j.x, 0.86 * s, j.z, 0.46 * s, 0.03, 0.46 * s, 0x8a6a4a, 'mapStone', 1);
    } else H.fine.box(j.x, 0.87 * s, j.z, 0.3 * s, 0.03, 0.3 * s, 0x5a3212, 'mapStone', 0.9);
  });
  // A coconut-shell ladle on a long handle leaning on the middle jar.
  const j = JARS[1];
  H.fine.stick(j.x - 0.1, 0.85, j.z + 0.1, j.x - 0.55, 0.05, j.z + 0.45, 0.04, pick(WOOD, H.r(32)), 'mapBark');
  H.fine.box(j.x - 0.1, 0.9, j.z + 0.1, 0.16, 0.1, 0.16, 0x4a3422, 'mapBark');
}

/**
 * The woven mat where the syrup becomes cakes: rows of palm-leaf rings (the
 * moulds) — empty ones by the edge, freshly poured ones shining amber, set
 * ones golden; the little iron pot of thick syrup and its spoon by the grandmother.
 */
function mat(H: PsFrame): void {
  H = H.at(traceSource()).fine;
  const { x0, x1, z0, z1 } = MAT;
  H.span(x0, 0.03, z0, x1, 0.05, z1, pick(STRAW, H.r(33)), 'mapBark');
  for (let z = z0 + 0.12, j = 0; z < z1 - 0.05; z += 0.3, j++) H.span(x0, 0.045, z, x1, 0.055, z + 0.06, 0xa0643a, 'mapBark', 0.95);
  const cols = 6;
  const rows = 4;
  for (let i = 0; i < cols; i++)
    for (let k = 0; k < rows; k++) {
      const x = x0 + 0.2 + i * ((x1 - x0 - 0.4) / (cols - 1));
      const z = z0 + 0.18 + k * ((z1 - z0 - 0.36) / (rows - 1));
      // (east columns set, the middle freshly poured, the west ones waiting)
      const stage = i < 2 ? 0 : i < 4 ? 1 : 2;
      H.box(x, 0.075, z, 0.16, 0.045, 0.16, pick(STRAW, H.r(i, k, 34)), 'mapBark', 1.05);
      if (stage === 1) H.box(x, 0.085, z, 0.12, 0.04, 0.12, pick(SYRUP_FRESH, H.r(i, k, 35)), 'mapStone', 1.05);
      else if (stage === 2) H.box(x, 0.09, z, 0.13, 0.05, 0.13, pick(CAKE, H.r(i, k, 36)), 'mapStone');
    }
  // The pot of thick syrup, its wooden spoon.
  H.box(x0 - 0.02, 0.14, z1 - 0.1, 0.3, 0.24, 0.3, pick(IRON, H.r(37)), 'mapStone');
  H.box(x0 - 0.02, 0.265, z1 - 0.1, 0.24, 0.02, 0.24, 0x8a4a14, 'mapStone', 1.1);
  H.stick(x0 - 0.02, 0.24, z1 - 0.1, x0 + 0.1, 0.5, z1 - 0.22, 0.035, pick(WOOD, H.r(38)), 'mapBark');
  // A basket of empty rings ready by the mat.
  basket(H, x0 + 0.3, 0.03, z0 - 0.3, 0.42, 0.26, 47);
}

/** The bench under the east eaves (bamboo slats on hardwood legs), a clay water jug and two cups on it. */
function bench(H: PsFrame): void {
  H = H.at(traceSource());
  const { x, z0, z1, h } = BENCH;
  for (const z of [z0 + 0.12, z1 - 0.12]) for (const dx of [-0.16, 0.16]) H.box(x + dx, h / 2, z, 0.07, h, 0.07, pick(POST, H.r(z, dx, 52)), 'mapBark');
  for (let k = 0; k < 4; k++) H.span(x - 0.22 + k * 0.11, h - 0.04, z0, x - 0.13 + k * 0.11, h + 0.02, z1, pick(BAMBOO, H.r(k, 53)), 'mapBark', 0.95);
  H.fine.box(x, h + 0.14, z0 + 0.2, 0.2, 0.24, 0.2, 0x8a5a38, 'mapStone');
  H.fine.box(x, h + 0.29, z0 + 0.2, 0.1, 0.06, 0.1, 0x7a4e30, 'mapStone');
  for (const dz of [0.42, 0.54]) H.fine.box(x + 0.05, h + 0.06, z0 + dz, 0.08, 0.08, 0.08, 0xd8d0c0, 'mapStone');
  // The child's little stool beside it.
  H.box(KID_STOOL.x, 0.07, KID_STOOL.z, 0.3, 0.14, 0.26, pick(POST, H.r(72)), 'mapBark', 0.95);
  H.box(KID_STOOL.x, 0.15, KID_STOOL.z, 0.34, 0.03, 0.3, pick(BAMBOO, H.r(73)), 'mapBark');
}

/**
 * Hung under the roof: the lantern on its hook from the front beam (a tin
 * frame, the glass lit — `lamp` — while they work in the dark), bundles of
 * palm-leaf rings and a string of cakes wrapped in leaf on pegs of the
 * west wall, a checked krama over the tie beam, the long stirring paddles
 * resting on it.
 */
function hanging(H: PsFrame, lamp: PsGlowFn): void {
  H = H.at(traceSource()).fine;
  const L = LANTERN;
  H.box(L.x, L.y + 0.33, L.z, 0.02, 0.36, 0.02, 0x2e2a28, 'mapStone');
  H.box(L.x, L.y + 0.14, L.z, 0.2, 0.04, 0.2, 0x3e3830, 'mapStone');
  H.box(L.x, L.y - 0.14, L.z, 0.22, 0.05, 0.22, 0x3e3830, 'mapStone');
  for (const [dx, dz] of [
    [-0.09, -0.09],
    [0.09, -0.09],
    [-0.09, 0.09],
    [0.09, 0.09],
  ])
    H.box(L.x + dx, L.y, L.z + dz, 0.02, 0.26, 0.02, 0x2e2a28, 'mapStone');
  lamp(L.x, L.y, L.z, 0.13, 0.2, 0.13, LAMP_FLAME, 0.7);
  const x = -ROOF.postX + 0.12;
  // Bundles of rings (moulds) and leaf-wrapped cakes on the west wall's pegs.
  for (const [z, y, k] of [
    [-3.2, 1.9, 0],
    [-2.7, 1.8, 1],
    [1.1, 1.85, 2],
  ]) {
    H.box(x, y, z, 0.1, 0.05, 0.05, pick(POST, H.r(k, 80)), 'mapBark');
    H.box(x + 0.08, y - 0.2, z, 0.12, 0.34, 0.3, k === 2 ? pick(FROND, H.r(k, 81)) : pick(STRAW, H.r(k, 82)), 'mapBark', 1.02);
    if (k === 2) for (let n = 0; n < 3; n++) H.box(x + 0.08, y - 0.45 - n * 0.16, z, 0.13, 0.13, 0.13, pick(FROND, H.r(n, 83)), 'mapBark', 0.95);
  }
  // The krama over the middle tie beam (red and white checks), the paddles laid on the beam.
  const { eave, rows } = ROOF;
  H.box(-1.2, eave - 0.3, rows[1], 0.5, 0.36, 0.05, 0xb8342c, 'petal');
  H.box(-1.2, eave - 0.3, rows[1] + 0.03, 0.5, 0.08, 0.03, 0xf0e8dc, 'petal');
  for (const dz of [-0.12, 0.12]) H.stick(-2.6, eave - 0.06, rows[1] + dz, 0.4, eave - 0.06, rows[1] + dz * 1.5, 0.05, pick(WOOD, H.r(dz, 84)), 'mapBark');
}

/** North of the shed: dry palm fronds piled for the fire, their long stalks, split firewood stacked. */
function pile(H: PsFrame): void {
  H = H.at(traceSource());
  const { x0, x1, z0, z1 } = PILE;
  for (let k = 0; k < 9; k++) {
    const x = x0 + 0.6 + H.r(k, 54) * (x1 - x0 - 1.8);
    const z = z0 + 0.4 + H.r(k, 55) * (z1 - z0 - 0.8);
    H.slab(x, 0.08 + k * 0.07, z, 1.5, 1.3, 0.06, H.r(k, 56) * 6.28, Math.PI / 2 - 0.12, pick(FROND, H.r(k, 57)), 'mapBark', 0.95);
  }
  for (let k = 0; k < 6; k++) {
    const z = z0 + 0.2 + k * 0.2;
    H.fine.stick(x0 + 0.1, 0.05 + 0.04 * (k % 2), z, x0 + 2.3, 0.1, z + 0.3 * (H.r(k, 58) - 0.5), 0.07, pick(FROND, H.r(k, 59)), 'mapBark', 0.9);
  }
  // Firewood: three layers of split logs, crossways on top.
  for (let l = 0; l < 3; l++)
    for (let k = 0; k < 4; k++) {
      const cx = x1 - 0.55;
      const cz = (z0 + z1) / 2;
      if (l % 2 === 0) H.box(cx - 0.3 + k * 0.2, 0.08 + l * 0.15, cz, 0.15, 0.15, 1.0, pick(WOOD, H.r(l, k, 60)), 'mapBark', 0.95);
      else H.box(cx, 0.08 + l * 0.15, cz - 0.3 + k * 0.2, 0.9, 0.15, 0.15, pick(WOOD, H.r(l, k, 61)), 'mapBark');
    }
}

/** The rack of clean juice tubes drying upside down (they are washed and smoked between rounds), a basket of more under it. */
function rack(H: PsFrame): void {
  H = H.at(traceSource()).fine;
  const { x, z0, z1 } = RACK;
  for (const z of [z0, z1]) H.box(x, 0.7, z, 0.07, 1.4, 0.07, pick(BAMBOO, H.r(z, 62)), 'mapBark', 0.9);
  H.span(x - 0.035, 1.3, z0, x + 0.035, 1.37, z1, pick(BAMBOO, H.r(63)), 'mapBark');
  for (let k = 0; k < 6; k++) {
    const z = z0 + 0.18 + k * ((z1 - z0 - 0.36) / 5);
    const tl = 0.64 + 0.1 * H.r(k, 64);
    H.box(x, 1.28 - tl / 2, z, 0.15, tl, 0.15, pick(TUBE, H.r(k, 65)), 'mapBark', 0.95 + 0.1 * H.r(k, 66));
  }
  basket(H, x + 0.1, 0, (z0 + z1) / 2, 0.5, 0.32, 67);
  for (let k = 0; k < 3; k++) H.box(x + 0.02 + k * 0.08, 0.42, (z0 + z1) / 2 - 0.1 + k * 0.1, 0.13, 0.3, 0.13, pick(TUBE, H.r(k, 68)), 'mapBark');
}

