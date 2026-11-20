import { Group, Vector3, type Mesh } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { GLOW_MODE, type Glow } from '../festival/_glow';
import type { Kit } from '../festival/_kit';
import { Mason, pick, prasat, SANDSTONE, SHADOW, SIDE, STONE, STONE_DARK, STONE_LIGHT } from '../landmarks/_prasat';
import type { StairNagaSpec } from '../sacred/naga';
import { LAKE_STAGE } from './plan';
import { carvedPanels, type CarveQuad } from './_stCarve';
import { later } from './_stKit';
import { khmerLamp } from './_sqKit';
import { BAMBOO, banner, GOLD, lap, LACQUER, PLANK, ROPE, TIMBER, type Bodies, type LakeFrame } from './_lkKit';

/**
 * The floating stage on the great lake (AWP-35, the lake venue: lake.ts). Built in its own frame — x across its width,
 * z toward the shore and the crowd, y the map's height — and set on the water turned by `LAKE_STAGE.yaw`, so its
 * blocks lie square to it (one voxel mesh in a turned group; the walk map reads the group's matrix: the deck is walked
 * on). From the water up:
 *
 * - bundled bamboo floats in rows under the whole deck, lashed with rope, half under the water, ripples lapping round
 *   their ends (the kit); bearers across them;
 * - the deck of weathered teak planks running toward the shore, a red lacquer skirt round it with a gilt line and gold
 *   rosettes, as a royal barge's side;
 * - at its front the gangway's opening between two fire bowls; naga balustrades along the front edge — a seven-headed
 *   cobra with one smooth hood at each front corner (sacred/naga.ts, as on Angkor Wat's causeway), its body running
 *   along the rail to the opening; a low red rail with gilt knobs down the sides;
 * - a Khmer lamp (a lantern under a small Angkor tower) on each corner;
 * - at its back the gate round the countdown board: carved sandstone pillars (kbach, _stCarve.ts) on moulded bases, a
 *   carved lintel and cornice, a balustered base under the board, and over it a stepped terrace with a lotus-bud prasat
 *   (landmarks/_prasat.ts) and two small corner towers, lamps in their doors; two braziers before the board;
 * - red banners with the white Angkor Wat on lacquered poles either side of the gate (the kit, swaying).
 *
 * What glows (flames, gilt, the doors) goes into the venue's `Bodies` and its halos and their streaks on the water into
 * its `Glow`, in map metres; the naga's spec in map metres too (lake.ts sculpts it).
 */

export interface LakeStage {
  /** The turned group: the stage's blocks and its carved panels (two draws). */
  object: Group;
  blocks: number;
  /** The board's middle and size (map m), facing the shore (`LAKE_STAGE.yaw`). */
  board: { x: number; y: number; z: number; w: number; h: number };
  /** Where string lights tie on: the prasat's front, the corner towers', the lintel's ends (map m). */
  anchors: { x: number; y: number; z: number }[];
  /** The naga (map m), sculpted by lake.ts. */
  naga: Pick<StairNagaSpec, 'fans' | 'bodies' | 'radius'>;
  /** The tip of the prasat (map y). */
  top: number;
}

/** The board's screen (m): smaller than Kulen's 18 × 9, the same 2 : 1 picture. */
const BW = 9;
const BH = 4.5;

export function buildLakeStage(fr: LakeFrame, kit: Kit, bodies: Bodies, glow: Glow, low: boolean): LakeStage {
  const src = traceSource();
  const b = new VoxelBuilder();
  const W = fr.water;
  const D = fr.deck;
  const hw = LAKE_STAGE.w / 2;
  const hd = LAKE_STAGE.d / 2;
  const yaw = fr.yaw;
  /** Local (x across, z toward the shore) → map metres, y as it is. */
  const P = (x: number, y: number, z: number): [number, number, number] => {
    const [mx, mz] = fr.at(x, z);
    return [mx, y, mz];
  };
  const span = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, shade = 1) => b.span(x0, y0, z0, x1, y1, z1, color, 'mapStone', { src, shade });
  const flame = (x: number, y: number, z: number, s: number, h: number, k = 1.2) => {
    const [mx, my, mz] = P(x, y, z);
    bodies.add(mx, my, mz, s, h, s, 0xffa040, k, yaw);
    bodies.add(mx, my + h * 0.55, mz, s * 0.55, h * 0.7, s * 0.55, 0xff7a24, k, yaw + 0.6);
  };
  const gilt = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, k = 0.75) => {
    const [mx, my, mz] = P((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    bodies.add(mx, my, mz, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), 0xffc35a, k, yaw);
  };
  const halo = (x: number, y: number, z: number, size: number, level = 0.8) => {
    const [mx, my, mz] = P(x, y, z);
    glow.add(mx, my, mz, 0xffb45a, size, { level });
  };
  const streak = (x: number, z: number, len: number, level = 1.6, width = 0.4) => {
    const [mx, , mz] = P(x, 0, z);
    glow.add(mx, W, mz, 0xffa040, len, { mode: GLOW_MODE.streak, level, width });
  };

  // ── The floats: bundled bamboo in rows, lashed; bearers over them ─────────
  const rows = low ? 6 : 9;
  for (let r = 0; r < rows; r++) {
    const z = -hd + 0.55 + ((2 * hd - 1.1) * r) / (rows - 1);
    const pieces = 3;
    for (let p = 0; p < pieces; p++) {
      const x0 = -hw - 0.2 + ((2 * hw + 0.4) * p) / pieces;
      const x1 = -hw - 0.2 + ((2 * hw + 0.4) * (p + 1)) / pieces;
      span(x0, W - 0.3, z - 0.32, x1, W + 0.2, z + 0.32, pick(BAMBOO, hash3(r, p, 1, 401)), 0.95 + 0.08 * hash3(r, p, 2, 401));
    }
    // (the bundles' cut ends, darker)
    for (const s of [-1, 1]) span(s * (hw + 0.2) - 0.06, W - 0.26, z - 0.28, s * (hw + 0.2) + 0.06, W + 0.16, z + 0.28, 0x6f6440, 0.85);
    if (!low) for (let x = -hw + 1.4; x < hw; x += 2.8) span(x - 0.05, W - 0.32, z - 0.34, x + 0.05, W + 0.23, z + 0.34, ROPE, 0.95);
    // Ripples where each bundle meets the water at the stage's sides.
    for (const s of [-1, 1]) {
      const [mx, mz] = fr.at(s * (hw + 0.45), z);
      lap(kit, mx, W, mz, 0.9, yaw, r * 2 + (s > 0 ? 1 : 0));
    }
  }
  // (and along the front and back, where the outer bundles lie)
  for (const s of [-1, 1])
    for (let x = -hw + 1; x < hw; x += low ? 4 : 2.2) {
      const [mx, mz] = fr.at(x + 0.6 * hash3(x, s, 3, 402), s * (hd + 0.1));
      lap(kit, mx, W, mz, 1.3, yaw + Math.PI / 2, 40 + Math.round(x) * 2 + (s > 0 ? 1 : 0));
    }
  for (let x = -hw + 0.6; x <= hw - 0.5; x += 2.9) span(x - 0.13, W + 0.2, -hd + 0.1, x + 0.13, W + 0.55, hd - 0.1, pick(TIMBER, hash3(x, 1, 1, 403)));

  // ── The deck: the skirt, the planks ───────────────────────────────────────
  const skirt = (x0: number, z0: number, x1: number, z1: number) => span(x0, W + 0.3, z0, x1, D - 0.1, z1, pick(LACQUER, hash3(x0, z0, 1, 404)), 0.95);
  skirt(-hw - 0.1, hd - 0.02, hw + 0.1, hd + 0.1);
  skirt(-hw - 0.1, -hd - 0.1, hw + 0.1, -hd + 0.02);
  skirt(-hw - 0.1, -hd, -hw + 0.02, hd);
  skirt(hw - 0.02, -hd, hw + 0.1, hd);
  // (the gilt line under the deck's edge, gold rosettes along the skirt)
  gilt(-hw - 0.14, D - 0.2, hd + 0.08, hw + 0.14, D - 0.13, hd + 0.13);
  gilt(-hw - 0.14, D - 0.2, -hd - 0.13, hw + 0.14, D - 0.13, -hd - 0.08);
  for (const s of [-1, 1]) gilt(s * (hw + 0.1) - 0.03, D - 0.2, -hd - 0.1, s * (hw + 0.1) + 0.03, D - 0.13, hd + 0.1);
  const rosette = (x: number, z: number, nx: number, nz: number) => {
    span(x - 0.18 - nz * 0, W + 0.62, z - 0.18, x + 0.18, W + 0.86, z + 0.18, pick(GOLD, hash3(x, z, 2, 404)), 1.05);
    void nx;
  };
  for (let x = -hw + 0.9; x < hw; x += low ? 2.4 : 1.2) {
    rosette(x, hd + 0.04, 0, 1);
    rosette(x, -hd - 0.04, 0, -1);
  }
  const plank = low ? 0.84 : 0.42;
  for (let x = -hw; x < hw - 0.01; x += plank) {
    const cut = -hd + 2 + (2 * hd - 4) * hash3(x, 2, 2, 405);
    const shade = 0.94 + 0.1 * hash3(x, 3, 2, 405);
    span(x + 0.01, D - 0.12, -hd, x + plank - 0.01, D, cut - 0.01, pick(PLANK, hash3(x, 1, 2, 405)), shade);
    span(x + 0.01, D - 0.12, cut + 0.01, x + plank - 0.01, D - 0.005 * (hash3(x, 4, 2, 405) > 0.6 ? 1 : 0), hd, pick(PLANK, hash3(x, 5, 2, 405)), shade * 0.98);
  }

  // ── The front: the opening, fire bowls, naga balustrades; side rails ─────
  const open = 1.7;
  const bowl = (x: number, z: number, big: boolean, ph: number) => {
    const s = big ? 1.3 : 1;
    span(x - 0.3 * s, D, z - 0.3 * s, x + 0.3 * s, D + 0.14 * s, z + 0.3 * s, pick(STONE, 0.7), 0.95);
    span(x - 0.14 * s, D + 0.14 * s, z - 0.14 * s, x + 0.14 * s, D + 0.7 * s, z + 0.14 * s, pick(STONE, 0.2));
    span(x - 0.22 * s, D + 0.7 * s, z - 0.22 * s, x + 0.22 * s, D + 0.78 * s, z + 0.22 * s, pick(STONE_LIGHT, 0.5), 1.05);
    span(x - 0.34 * s, D + 0.78 * s, z - 0.34 * s, x + 0.34 * s, D + 0.96 * s, z + 0.34 * s, 0x5c4430, 0.9);
    span(x - 0.4 * s, D + 0.96 * s, z - 0.4 * s, x + 0.4 * s, D + 1.06 * s, z + 0.4 * s, 0x664c36, 0.95);
    flame(x, D + 1.22 * s, z, 0.5 * s, 0.34 * s, 1.25);
    halo(x, D + 1.4 * s, z, big ? 3.8 : 3, 0.9);
    void ph;
  };
  bowl(-open - 0.55, hd - 0.7, false, 0.3);
  bowl(open + 0.55, hd - 0.7, false, 1.7);
  streak(0, hd + 1, 12, 1.8, 0.6);
  // The naga's posts along the front edge, from each corner to the opening.
  const railY = D + 0.62;
  const zRail = hd - 0.35;
  const corner = hw - 0.9;
  for (const s of [-1, 1]) {
    for (let x = corner - 1.2; x >= open + 1.25; x -= 1.5) {
      const px = s * x;
      span(px - 0.15, D, zRail - 0.15, px + 0.15, railY - 0.16, zRail + 0.15, pick(STONE, hash3(px, 4, 4, 406)));
      span(px - 0.19, D, zRail - 0.19, px + 0.19, D + 0.1, zRail + 0.19, pick(STONE_LIGHT, 0.4), 0.95);
    }
    // The naga's pedestal at the corner.
    const nx = s * corner;
    span(nx - 0.75, D, zRail - 0.75, nx + 0.75, D + 0.3, zRail + 0.75, pick(STONE_DARK, 0.4));
    span(nx - 0.62, D + 0.3, zRail - 0.62, nx + 0.62, D + 0.62, zRail + 0.62, pick(STONE_LIGHT, 0.5), 1.04);
    // Side rails: lacquered posts with gilt knobs and a top rail, from the corner to the gate.
    const rx = s * (hw - 0.25);
    for (let z = hd - 1.6; z >= -hd + 3.4; z -= 1.8) {
      span(rx - 0.08, D, z - 0.08, rx + 0.08, D + 0.86, z + 0.08, pick(LACQUER, hash3(z, s, 1, 407)));
      span(rx - 0.1, D + 0.86, z - 0.1, rx + 0.1, D + 0.98, z + 0.1, pick(GOLD, hash3(z, s, 2, 407)), 1.05);
    }
    span(rx - 0.06, D + 0.74, -hd + 3.3, rx + 0.06, D + 0.82, hd - 1.5, pick(LACQUER, 0.6));
    span(rx - 0.04, D + 0.36, -hd + 3.3, rx + 0.04, D + 0.42, hd - 1.5, pick(LACQUER, 0.3));
  }
  const fanY = D + 0.62;
  const fanH = 2.3;
  const V = (x: number, y: number, z: number) => new Vector3(...P(x, y, z));
  const look = new Vector3(fr.f[0], 0, fr.f[1]);
  const naga: LakeStage['naga'] = {
    fans: [-1, 1].map((s) => ({ at: V(s * corner, fanY, zRail), look: look.clone(), height: fanH })),
    bodies: [-1, 1].map((s) => {
      const end = open + 0.95;
      return {
        path: [
          V(s * corner, fanY + 0.24, zRail - 0.55),
          V(s * corner, fanY + 0.45, zRail - 0.95),
          V(s * (corner - 0.35), railY - 0.05, zRail - 0.05),
          V(s * (corner - 1.4), railY, zRail),
          V(s * (end + 1.1), railY, zRail),
          V(s * end, railY + 0.22, zRail),
          V(s * (end - 0.22), railY + 0.6, zRail + 0.08),
          V(s * (end - 0.12), railY + 0.85, zRail + 0.22),
        ],
        tail: 1.1,
      };
    }),
    radius: 0.2,
  };

  // ── The Khmer lamps on the corners ─────────────────────────────────────────
  const toMap = (p: [number, number, number]) => P(p[0], p[1], p[2]);
  const lampFlames = bodies.asLamps(glow, toMap, 2.4);
  for (const [x, z] of [
    [-hw + 0.55, hd - 0.55],
    [hw - 0.55, hd - 0.55],
    [-hw + 0.55, -hd + 0.55],
    [hw - 0.55, -hd + 0.55],
  ]) {
    khmerLamp(b, x, D, z, 1.1, 60 + Math.round(x + z), src, lampFlames, null, 2.4);
    if (z > 0) streak(x, z + 0.5, 8, 1.4, 0.35);
  }

  // ── The gate round the board ──────────────────────────────────────────────
  const zb = -hd + 1.4; // the board's face
  const yb0 = D + 0.95;
  const yb1 = yb0 + BH;
  const bx = BW / 2;
  const ZB = -hd + 0.3;
  const ZF = zb + 0.35;
  const Y1 = yb1 + 0.5;
  // Pillars: a moulded base, the shaft, a capital.
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -bx - 1.6 : bx + 0.35;
    const x1 = x0 + 1.25;
    span(x0 - 0.2, D, ZB - 0.2, x1 + 0.2, D + 0.35, ZF + 0.2, pick(STONE_DARK, 0.5));
    span(x0 - 0.12, D + 0.35, ZB - 0.12, x1 + 0.12, D + 0.6, ZF + 0.12, pick(STONE_LIGHT, 0.4), 1.03);
    span(x0, D + 0.6, ZB, x1, Y1 - 0.45, ZF, pick(STONE, 0.4));
    span(x0 - 0.15, Y1 - 0.45, ZB - 0.15, x1 + 0.15, Y1, ZF + 0.15, pick(STONE_LIGHT, 0.6), 1.04);
    gilt(x0 - 0.02, D + 0.6, ZF - 0.01, x0 + 0.05, Y1 - 0.45, ZF + 0.03, 0.6);
    gilt(x1 - 0.05, D + 0.6, ZF - 0.01, x1 + 0.02, Y1 - 0.45, ZF + 0.03, 0.6);
  }
  // The wall behind the board, the screen's dark housing, its stone frame and gilt line.
  span(-bx - 0.35, D, ZB, bx + 0.35, Y1, zb - 0.25, pick(STONE, 0.5));
  span(-bx - 0.35, yb0 - 0.1, zb - 0.25, bx + 0.35, yb1 + 0.1, zb - 0.04, 0x15100c, 0.7);
  span(-bx - 0.35, yb0 - 0.15, zb - 0.04, -bx, yb1 + 0.15, zb + 0.22, pick(STONE_LIGHT, 0.4));
  span(bx, yb0 - 0.15, zb - 0.04, bx + 0.35, yb1 + 0.15, zb + 0.22, pick(STONE_LIGHT, 0.6));
  span(-bx, yb1, zb - 0.04, bx, yb1 + 0.15, zb + 0.22, pick(STONE_LIGHT, 0.2));
  span(-bx, yb0 - 0.15, zb - 0.04, bx, yb0, zb + 0.22, pick(STONE_LIGHT, 0.8));
  gilt(-bx - 0.06, yb0 - 0.06, zb + 0.2, bx + 0.06, yb0, zb + 0.25);
  gilt(-bx - 0.06, yb1, zb + 0.2, bx + 0.06, yb1 + 0.06, zb + 0.25);
  gilt(-bx - 0.06, yb0, zb + 0.2, -bx, yb1, zb + 0.25);
  gilt(bx, yb0, zb + 0.2, bx + 0.06, yb1, zb + 0.25);
  // Under the board: the base with turned balusters in a dark window.
  span(-bx - 0.35, D, zb - 0.25, bx + 0.35, D + 0.12, zb + 0.3, pick(STONE_LIGHT, 0.3));
  span(-bx + 0.4, D + 0.12, zb - 0.25, bx - 0.4, yb0 - 0.15, zb - 0.1, pick(SHADOW, 0.4), 0.8);
  for (let i = 0; i < (low ? 7 : 13); i++) {
    const x = -bx + 0.8 + ((2 * bx - 1.6) * i) / (low ? 6 : 12);
    span(x - 0.09, D + 0.12, zb - 0.1, x + 0.09, yb0 - 0.15, zb + 0.1, pick(STONE_LIGHT, (i * 0.37) % 1));
    if (!low) span(x - 0.13, D + 0.42, zb - 0.13, x + 0.13, D + 0.52, zb + 0.13, pick(STONE_LIGHT, 0.6), 1.05);
  }
  // The lintel and its cornice.
  const L = bx + 2;
  span(-L, Y1, ZB - 0.1, L, Y1 + 0.9, ZF + 0.2, pick(STONE, 0.3));
  span(-L - 0.3, Y1 + 0.9, ZB - 0.3, L + 0.3, Y1 + 1.2, ZF + 0.45, pick(STONE_LIGHT, 0.5), 1.04);
  gilt(-L, Y1 - 0.02, ZF + 0.19, L, Y1 + 0.05, ZF + 0.24);
  gilt(-L - 0.3, Y1 + 1.14, ZF + 0.43, L + 0.3, Y1 + 1.2, ZF + 0.48);
  // The stepped terrace over it (its top on the prasat's grid), the prasat and two corner towers.
  const ty = Math.ceil((Y1 + 1.75) * 2) / 2;
  span(-L + 0.6, Y1 + 1.2, ZB, L - 0.6, Y1 + 1.5, ZF, pick(STONE, 0.6));
  span(-L + 1.1, Y1 + 1.5, ZB + 0.2, L - 1.1, ty, ZF - 0.2, pick(STONE_LIGHT, 0.3), 1.02);
  const m = new Mason(b, 0.5, { seed: 41, jitter: 0.035, ao: 0.3 });
  const pz = Math.round(((ZB + ZF) / 2) * 2) / 2;
  const main = prasat(m, 0, pz, ty, { h: low ? 6 : 7, w: 3, tiers: low ? 4 : 5, doors: SIDE.pz | SIDE.px | SIDE.nx, body: 0.32, src, pal: SANDSTONE });
  for (const s of [-1, 1]) prasat(m, s * 3.5, pz, ty, { h: 3.5, w: 2, tiers: 3, doors: SIDE.pz, body: 0.36, src });
  m.weather(0.025, 42);
  m.mottle(0.05, STONE_DARK, 43);
  m.commit('none');
  // (lamps in the doors, a gilt tip)
  flame(0, ty + 0.55, pz + 2.05, 0.5, 0.75, 1.1);
  halo(0, ty + 0.7, pz + 2.3, 3.2);
  for (const s of [-1, 1]) {
    flame(s * 3.5, ty + 0.4, pz + 1.55, 0.45, 0.55, 1);
    halo(s * 3.5, ty + 0.5, pz + 1.8, 2.2);
  }
  gilt(-0.08, main.top, pz - 0.08, 0.08, main.top + 0.45, pz + 0.08, 1);
  // Braziers before the board.
  bowl(-bx + 0.6, zb + 1.4, true, 2.1);
  bowl(bx - 0.6, zb + 1.4, true, 3.3);
  // The board's light on the deck and the water before it.
  streak(0, hd + 0.5, 16, 0.9, 1.6);

  // ── Banners on lacquered poles either side of the gate ────────────────────
  const anchors: { x: number; y: number; z: number }[] = [];
  const barY = Y1 + 0.9;
  for (const s of [-1, 1]) {
    const x = s * (L + 1.0);
    const z = pz + 0.3;
    span(x - 0.3, D, z - 0.3, x + 0.3, D + 0.3, z + 0.3, pick(STONE_DARK, 0.6));
    span(x - 0.09, D + 0.3, z - 0.09, x + 0.09, barY + 0.55, z + 0.09, pick(LACQUER, 0.5));
    span(x - 0.95, barY - 0.05, z - 0.06, x + 0.95, barY + 0.07, z + 0.06, pick(LACQUER, 0.2));
    span(x - 0.13, barY + 0.55, z - 0.13, x + 0.13, barY + 0.75, z + 0.13, pick(GOLD, 0.5), 1.05);
    span(x - 0.07, barY + 0.75, z - 0.07, x + 0.07, barY + 0.98, z + 0.07, pick(GOLD, 0.8), 1.1);
    const [mx, mz] = fr.at(x, z + 0.12);
    banner(kit, mx, barY - 0.05, mz, yaw, 1.6, 4.8, low, 7 + s);
    anchors.push({ ...xyz(P(x, barY + 0.7, z)) });
  }
  anchors.push(xyz(P(0, ty + 2.6, pz + 1.6)), xyz(P(-3.5, ty + 2.4, pz + 1.0)), xyz(P(3.5, ty + 2.4, pz + 1.0)), xyz(P(-L, Y1 + 1.2, ZF + 0.4)), xyz(P(L, Y1 + 1.2, ZF + 0.4)));

  // ── The carved panels: the pillars' fronts, the lintel ────────────────────
  const quads: CarveQuad[] = [];
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -bx - 1.6 : bx + 0.35;
    quads.push({ at: [x0 + 0.12, D + 0.72, ZF + 0.01], u: [1.0, 0, 0], v: [0, Y1 - 0.6 - (D + 0.72), 0], part: 'pillar' });
  }
  quads.push({ at: [-L + 0.12, Y1 + 0.08, ZF + 0.21], u: [2 * L - 0.24, 0, 0], v: [0, 0.74, 0], part: 'lintel' });
  const carving: Mesh = carvedPanels(quads, later);
  carving.name = 'nye:lake:carving';

  const object = new Group();
  object.name = 'nye:lake:stage';
  object.position.set(fr.x, 0, fr.z);
  object.rotation.y = yaw;
  const blocks = b.boxes.length;
  const vox = buildVoxelMesh(b, { quality: low ? 'low' : 'medium', name: 'nye:lake:stage', hideCovered: true });
  object.add(vox, carving);
  object.updateMatrixWorld(true);

  const [bxm, , bzm] = P(0, 0, zb + 0.24);
  return {
    object,
    blocks,
    board: { x: bxm, y: (yb0 + yb1) / 2, z: bzm, w: BW, h: BH },
    anchors,
    naga,
    top: main.top,
  };
}

const xyz = (p: [number, number, number]) => ({ x: p[0], y: p[1], z: p[2] });
