import { Group, Vector3, type InstancedMesh, type Mesh } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import type { Glow } from '../festival/_glow';
import type { Kit } from '../festival/_kit';
import { Mason, pick, prasat, SANDSTONE, SHADOW, SIDE, snapTo, STONE, STONE_DARK, STONE_LIGHT } from '../landmarks/_prasat';
import type { StairNagaSpec } from '../sacred/naga';
import { LAKE_STAGE } from './plan';
import { carvedPanels, type CarveQuad } from './_stCarve';
import { later } from './_stKit';
import { khmerLamp } from './_sqKit';
import { BAMBOO, banner, BULB, GOLD, lap, LACQUER, PLANK, ROPE, TIMBER, type Bodies, type LakeFrame } from './_lkKit';
import type { WaterLights } from './_lkReflect';
import { Fires } from './_lkStageFire';

/**
 * The floating stage on the great lake (AWP-35, the lake venue: lake.ts; the owner's picture
 * assets/new-year-online/lake-reference.png: a grand Angkor prasat over a big countdown board at the water's edge, red
 * banners, fire bowls, naga). Built in its own frame — x across its width, z toward the shore and the crowd, y the
 * map's height — and set on the water turned by `LAKE_STAGE.yaw`, so its blocks lie square to it (one voxel mesh in a
 * turned group; the walk map reads the group's matrix: the deck is walked on). From the water up:
 *
 * - bundled bamboo floats in rows under the whole deck, lashed with rope, half under the water, ripples lapping round
 *   their ends (the kit); bearers across them;
 * - the deck of weathered teak planks running toward the shore, a red lacquer skirt round it with a gilt line, gold
 *   rosettes and a row of small bulbs whose light lies on the water;
 * - at its front the gangway's opening between two fire bowls; two big seven-headed naga (sacred/naga.ts, as on Angkor
 *   Wat's causeway: cobras under one smooth hood) rearing either side of the board's front, their bodies running along
 *   the front rail out to the corners, where fire bowls burn on stone pillars; a low red rail with gilt knobs down the
 *   sides; Khmer lamps (a lantern under a small Angkor tower);
 * - at its back a deep sandstone gate (a gopura) round the countdown board: carved pillars (kbach, _stCarve.ts) on
 *   moulded bases, a carved lintel and cornice, a balustered base under the board, two braziers before it; over it a
 *   stepped terrace with THREE lotus-bud towers (landmarks/_prasat.ts) — the tall middle one and two lower ones, as
 *   Angkor Wat on the flag — lamps in their doors, their profiles and the gate's edges outlined in small bulbs (as the
 *   Royal Palace is lit for a festival); a false door and wall lamps on its back, toward the lake;
 * - red banners with the white Angkor Wat on tall lacquered poles either side of the gate (the kit, swaying).
 *
 * What glows (gilt, bulbs, the lamps' glass) goes into the venue's `Bodies`, the flames into their own live draw
 * (`_lkStageFire.ts`), the halos and every light's streak on the water into its `Glow`, in map metres; the naga's spec
 * in map metres too (lake.ts sculpts it).
 */

export interface LakeStage {
  /** The turned group: the stage's blocks and its carved panels (two draws). */
  object: Group;
  blocks: number;
  /** The board's middle and size (map m), facing the shore (`LAKE_STAGE.yaw`). */
  board: { x: number; y: number; z: number; w: number; h: number };
  /** Where string lights tie on: the banner poles W, E, the prasat's front, the side towers' W, E, the lintel's ends W, E (map m). */
  anchors: { x: number; y: number; z: number }[];
  /** The naga (map m), sculpted by lake.ts. */
  naga: Pick<StairNagaSpec, 'fans' | 'bodies' | 'radius'>;
  /** The tip of the middle tower (map y). */
  top: number;
  /** The live flames (one draw; null on low, where they are still glowing boxes). */
  fire: { mesh: InstancedMesh; update(t: number, night: number, event: number): void } | null;
  /** Flames, small bulbs (counts, for the build line). */
  flames: number;
  bulbs: number;
}

/** The board's screen (m): smaller than Kulen's 18 × 9, the same 2 : 1 picture. */
const BW = 10;
const BH = 5;

export function buildLakeStage(fr: LakeFrame, kit: Kit, bodies: Bodies, glow: Glow, lights: WaterLights, low: boolean): LakeStage {
  const src = traceSource();
  const b = new VoxelBuilder();
  const W = fr.water;
  const D = fr.deck;
  const hw = LAKE_STAGE.w / 2;
  const hd = LAKE_STAGE.d / 2;
  const yaw = fr.yaw;
  const fires = new Fires(low ? bodies : null);
  let bulbs = 0;
  /** Local (x across, z toward the shore) → map metres, y as it is. */
  const P = (x: number, y: number, z: number): [number, number, number] => {
    const [mx, mz] = fr.at(x, z);
    return [mx, y, mz];
  };
  const span = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, shade = 1) => b.span(x0, y0, z0, x1, y1, z1, color, 'mapStone', { src, shade });
  const flame = (x: number, y: number, z: number, w: number, h: number, ph: number, k = 1.2) => {
    const [mx, my, mz] = P(x, y, z);
    fires.flame(mx, my, mz, w, h, yaw, ph, k);
  };
  const gilt = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, k = 0.45) => {
    const [mx, my, mz] = P((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    bodies.add(mx, my, mz, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), 0xffc35a, k, yaw);
  };
  /** A small bulb (warm white), its face toward the shore. */
  const bulb = (x: number, y: number, z: number, k = 0.95) => {
    const [mx, my, mz] = P(x, y, z);
    bodies.add(mx, my, mz, 0.075, 0.085, 0.075, BULB[Math.floor(hash3(x, y, z, 451) * BULB.length) % BULB.length], k, yaw);
    bulbs++;
  };
  /** Bulbs from (x0, y0) to (x1, y1) at depth z, about `every` m apart, both ends included. */
  const bulbRow = (x0: number, y0: number, x1: number, y1: number, z: number, every: number, k = 0.95) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / every));
    for (let i = 0; i <= n; i++) bulb(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, z, k);
  };
  const halo = (x: number, y: number, z: number, size: number, level = 0.6) => {
    const [mx, my, mz] = P(x, y, z);
    glow.add(mx, my, mz, 0xffb45a, size, { level });
  };
  /** A light's reflection on the water at the stage's edge (x, z local), the light `high` m over the water. */
  const streak = (x: number, z: number, high: number, level = 1.4, width = 0.4, color?: number) => {
    const [mx, , mz] = P(x, 0, z);
    lights.streak(mx, W, mz, high, color, { level, width });
  };
  const every = low ? 0.7 : 0.36;

  // ── The floats: bundled bamboo in rows, lashed; bearers over them ─────────
  const rows = low ? 6 : 9;
  for (let r = 0; r < rows; r++) {
    const z = -hd + 0.12 + ((2 * hd - 0.24) * r) / (rows - 1);
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
  const skirt = (x0: number, z0: number, x1: number, z1: number) => span(x0, W + 0.42, z0, x1, D - 0.1, z1, pick(LACQUER, hash3(x0, z0, 1, 404)), 0.95);
  skirt(-hw - 0.1, hd - 0.02, hw + 0.1, hd + 0.1);
  skirt(-hw - 0.1, -hd - 0.1, hw + 0.1, -hd + 0.02);
  skirt(-hw - 0.1, -hd, -hw + 0.02, hd);
  skirt(hw - 0.02, -hd, hw + 0.1, hd);
  // (the gilt line under the deck's edge, gold rosettes along the skirt)
  gilt(-hw - 0.14, D - 0.2, hd + 0.08, hw + 0.14, D - 0.13, hd + 0.13, 0.5);
  gilt(-hw - 0.14, D - 0.2, -hd - 0.13, hw + 0.14, D - 0.13, -hd - 0.08, 0.5);
  for (const s of [-1, 1]) gilt(s * (hw + 0.1) - 0.03, D - 0.2, -hd - 0.1, s * (hw + 0.1) + 0.03, D - 0.13, hd + 0.1, 0.5);
  const rosette = (x: number, z: number) => span(x - 0.18, W + 0.62, z - 0.18, x + 0.18, W + 0.86, z + 0.18, pick(GOLD, hash3(x, z, 2, 404)), 1.05);
  for (let x = -hw + 0.9; x < hw; x += low ? 2.4 : 1.2) {
    rosette(x, hd + 0.04);
    rosette(x, -hd - 0.04);
  }
  // A row of small bulbs along the skirt under the gilt line, all round; their light on the water.
  {
    const by = D - 0.32;
    const n = Math.round((2 * hw) / (every * 1.5));
    for (let i = 0; i <= n; i++) {
      const x = -hw + (2 * hw * i) / n;
      bulb(x, by, hd + 0.15);
      bulb(x, by, -hd - 0.15);
    }
    const m = Math.round((2 * hd) / (every * 1.5));
    for (let i = 1; i < m; i++) {
      const z = -hd + (2 * hd * i) / m;
      for (const s of [-1, 1]) bulb(s * (hw + 0.15), by, z);
    }
    // (a streak every 1.4 m along the front and the sides, every 2.8 m behind)
    for (let x = -hw + 0.7; x < hw; x += low ? 2.8 : 1.4) {
      streak(x, hd + 0.3, 1.6, 0.5, 0.8, 0xffc070);
      if (Math.round(x / 1.4) % 2 === 0) streak(x, -hd - 0.3, 1.6, 0.4, 0.8, 0xffc070);
    }
    for (const s of [-1, 1]) for (let z = -hd + 1; z < hd; z += low ? 3 : 1.5) streak(s * (hw + 0.3), z, 1.6, 0.4, 0.8, 0xffc070);
  }
  const plank = low ? 0.84 : 0.42;
  for (let x = -hw; x < hw - 0.01; x += plank) {
    const cut = -hd + 2 + (2 * hd - 4) * hash3(x, 2, 2, 405);
    const shade = 0.94 + 0.1 * hash3(x, 3, 2, 405);
    span(x + 0.01, D - 0.12, -hd, x + plank - 0.01, D, cut - 0.01, pick(PLANK, hash3(x, 1, 2, 405)), shade);
    span(x + 0.01, D - 0.12, cut + 0.01, x + plank - 0.01, D - 0.005 * (hash3(x, 4, 2, 405) > 0.6 ? 1 : 0), hd, pick(PLANK, hash3(x, 5, 2, 405)), shade * 0.98);
  }

  // ── The front: the opening, fire bowls, the naga, side rails ──────────────
  const open = 1.7;
  /** A fire bowl standing on `y0`, scale `s`: a stone foot and stem, a bronze bowl, its flame, a halo, its streak. */
  const bowl = (x: number, z: number, y0: number, s: number, ph: number, wet = true) => {
    span(x - 0.3 * s, y0, z - 0.3 * s, x + 0.3 * s, y0 + 0.14 * s, z + 0.3 * s, pick(STONE, 0.7), 0.95);
    span(x - 0.14 * s, y0 + 0.14 * s, z - 0.14 * s, x + 0.14 * s, y0 + 0.7 * s, z + 0.14 * s, pick(STONE, 0.2));
    span(x - 0.22 * s, y0 + 0.7 * s, z - 0.22 * s, x + 0.22 * s, y0 + 0.78 * s, z + 0.22 * s, pick(STONE_LIGHT, 0.5), 1.05);
    span(x - 0.34 * s, y0 + 0.78 * s, z - 0.34 * s, x + 0.34 * s, y0 + 0.96 * s, z + 0.34 * s, 0x5c4430, 0.9);
    span(x - 0.4 * s, y0 + 0.96 * s, z - 0.4 * s, x + 0.4 * s, y0 + 1.06 * s, z + 0.4 * s, 0x664c36, 0.95);
    flame(x, y0 + 1.02 * s, z, 0.62 * s, 0.95 * s, ph, 1.25);
    halo(x, y0 + 1.45 * s, z, 2.3 * s, 0.6);
    if (wet) streak(x, hd + 0.3, y0 + 1.4 * s - W, 1.4, 0.5 * s);
  };
  bowl(-open - 0.55, hd - 0.7, D, 1, 0.3);
  bowl(open + 0.55, hd - 0.7, D, 1, 1.7);
  // The naga: rearing either side of the board's front, their bodies along the front rail out to the corners.
  const railY = D + 0.62;
  const zRail = hd - 0.35;
  const NX = 6.7;
  const TAIL = hw - 1.9;
  for (const s of [-1, 1]) {
    // (rail posts: from the gangway to the hood, and under the body out to its tail)
    for (const [a, c] of [
      [open + 1.15, NX - 1.0],
      [NX + 1.3, TAIL - 0.2],
    ])
      for (let x = a; x <= c + 0.01; x += (c - a) / Math.max(1, Math.round((c - a) / 1.4))) {
        const px = s * x;
        span(px - 0.15, D, zRail - 0.15, px + 0.15, railY - 0.16, zRail + 0.15, pick(STONE, hash3(px, 4, 4, 406)));
        span(px - 0.19, D, zRail - 0.19, px + 0.19, D + 0.1, zRail + 0.19, pick(STONE_LIGHT, 0.4), 0.95);
      }
    // (a low rail between the gangway and the hood)
    span(Math.min(s * (open + 1.0), s * (NX - 0.9)) - 0.06, railY - 0.2, zRail - 0.07, Math.max(s * (open + 1.0), s * (NX - 0.9)) + 0.06, railY - 0.12, zRail + 0.07, pick(STONE_LIGHT, 0.3));
    // The naga's pedestal under its hood.
    const nx = s * NX;
    span(nx - 0.85, D, zRail - 0.85, nx + 0.85, D + 0.3, zRail + 0.85, pick(STONE_DARK, 0.4));
    span(nx - 0.72, D + 0.3, zRail - 0.72, nx + 0.72, D + 0.62, zRail + 0.72, pick(STONE_LIGHT, 0.5), 1.04);
    // A fire bowl on a stone pillar at the front corner.
    const cx = s * (hw - 0.6);
    const cz = hd - 0.6;
    span(cx - 0.42, D, cz - 0.42, cx + 0.42, D + 0.2, cz + 0.42, pick(STONE_DARK, 0.6));
    span(cx - 0.3, D + 0.2, cz - 0.3, cx + 0.3, D + 1.3, cz + 0.3, pick(STONE, 0.5));
    span(cx - 0.38, D + 1.3, cz - 0.38, cx + 0.38, D + 1.44, cz + 0.38, pick(STONE_LIGHT, 0.6), 1.04);
    bowl(cx, cz, D + 1.44, 1.05, 2.4 + s);
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
  const fanH = 3.3;
  const V = (x: number, y: number, z: number) => new Vector3(...P(x, y, z));
  const look = new Vector3(fr.f[0], 0, fr.f[1]);
  const naga: LakeStage['naga'] = {
    fans: [-1, 1].map((s) => ({ at: V(s * NX, fanY, zRail), look: look.clone(), height: fanH })),
    bodies: [-1, 1].map((s) => ({
      path: [
        V(s * NX, fanY + 0.3, zRail - 0.6),
        V(s * NX, fanY + 0.5, zRail - 1.05),
        V(s * (NX + 0.4), railY - 0.02, zRail - 0.08),
        V(s * (NX + 1.5), railY, zRail),
        V(s * (TAIL - 1.1), railY, zRail),
        V(s * TAIL, railY + 0.22, zRail),
        V(s * (TAIL + 0.22), railY + 0.6, zRail + 0.08),
        V(s * (TAIL + 0.12), railY + 0.85, zRail + 0.22),
      ],
      tail: 1.1,
    })),
    radius: 0.24,
  };

  // ── The Khmer lamps by the side rails and on the back corners ─────────────
  const toMap = (p: [number, number, number]) => P(p[0], p[1], p[2]);
  const lampFlames = bodies.asLamps(glow, toMap, 2.0);
  for (const [x, z] of [
    [-hw + 1.1, hd - 3.3],
    [hw - 1.1, hd - 3.3],
    [-hw + 0.55, -hd + 0.55],
    [hw - 0.55, -hd + 0.55],
  ]) {
    khmerLamp(b, x, D, z, 1.1, 60 + Math.round(x + z), src, lampFlames, null, 2.0);
    streak(x + Math.sign(x) * 1.2, z + Math.sign(z) * 0.4, 3.2, 1.1, 0.35);
  }

  // ── The gate round the board: a deep sandstone gopura ─────────────────────
  /** The gate's back, its pillars' front, the board's face (local z). */
  const ZB = -hd + 0.3;
  const ZF = -1.5;
  const zb = ZF - 0.35;
  const yb0 = D + 1.05;
  const yb1 = yb0 + BH;
  const bx = BW / 2;
  const Y1 = yb1 + 0.5;
  const px0 = bx + 0.35;
  const px1 = bx + 1.85;
  // Pillars: a moulded base, the shaft, a capital; gilt lines up their fronts' inner edges.
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -px1 : px0;
    const x1 = s < 0 ? -px0 : px1;
    span(x0 - 0.22, D, ZB - 0.2, x1 + 0.22, D + 0.4, ZF + 0.22, pick(STONE_DARK, 0.5));
    span(x0 - 0.12, D + 0.4, ZB - 0.12, x1 + 0.12, D + 0.66, ZF + 0.12, pick(STONE_LIGHT, 0.4), 1.03);
    span(x0, D + 0.66, ZB, x1, Y1 - 0.45, ZF, pick(STONE, 0.4));
    span(x0 - 0.16, Y1 - 0.45, ZB - 0.16, x1 + 0.16, Y1, ZF + 0.16, pick(STONE_LIGHT, 0.6), 1.04);
    const inner = s < 0 ? x1 : x0;
    gilt(inner - 0.035, D + 0.66, ZF - 0.01, inner + 0.035, Y1 - 0.45, ZF + 0.03, 0.3);
    // (bulbs up the pillar's outer front edge)
    const outer = s < 0 ? x0 - 0.04 : x1 + 0.04;
    bulbRow(outer, D + 0.7, outer, Y1 - 0.5, ZF + 0.06, every * 1.2);
  }
  // The wall behind the board, the screen's dark housing, its stone frame and gilt line.
  span(-bx - 0.35, D, ZB, bx + 0.35, Y1, zb - 0.25, pick(STONE, 0.5));
  span(-bx - 0.35, yb0 - 0.1, zb - 0.25, bx + 0.35, yb1 + 0.1, zb - 0.04, 0x15100c, 0.7);
  span(-bx - 0.35, yb0 - 0.15, zb - 0.04, -bx, yb1 + 0.15, zb + 0.22, pick(STONE_LIGHT, 0.4));
  span(bx, yb0 - 0.15, zb - 0.04, bx + 0.35, yb1 + 0.15, zb + 0.22, pick(STONE_LIGHT, 0.6));
  span(-bx, yb1, zb - 0.04, bx, yb1 + 0.15, zb + 0.22, pick(STONE_LIGHT, 0.2));
  span(-bx, yb0 - 0.15, zb - 0.04, bx, yb0, zb + 0.22, pick(STONE_LIGHT, 0.8));
  gilt(-bx - 0.05, yb0 - 0.05, zb + 0.2, bx + 0.05, yb0, zb + 0.25, 0.35);
  gilt(-bx - 0.05, yb1, zb + 0.2, bx + 0.05, yb1 + 0.05, zb + 0.25, 0.35);
  gilt(-bx - 0.05, yb0, zb + 0.2, -bx, yb1, zb + 0.25, 0.35);
  gilt(bx, yb0, zb + 0.2, bx + 0.05, yb1, zb + 0.25, 0.35);
  // Under the board: the base with turned balusters in a dark window.
  span(-bx - 0.35, D, zb - 0.25, bx + 0.35, D + 0.12, zb + 0.3, pick(STONE_LIGHT, 0.3));
  span(-bx + 0.4, D + 0.12, zb - 0.25, bx - 0.4, yb0 - 0.15, zb - 0.1, pick(SHADOW, 0.4), 0.8);
  const nBal = low ? 7 : 15;
  for (let i = 0; i < nBal; i++) {
    const x = -bx + 0.8 + ((2 * bx - 1.6) * i) / (nBal - 1);
    span(x - 0.09, D + 0.12, zb - 0.1, x + 0.09, yb0 - 0.15, zb + 0.1, pick(STONE_LIGHT, (i * 0.37) % 1));
    if (!low) span(x - 0.13, D + 0.45, zb - 0.13, x + 0.13, D + 0.55, zb + 0.13, pick(STONE_LIGHT, 0.6), 1.05);
  }
  // The board's light on the water before the stage: a broad pale-gold shimmer.
  streak(0, hd + 0.3, 4.5, 0.5, 4.2, 0xffd9a0);
  // The back (seen from the lake and the boats): pilasters, a false door under a carved lintel, two wall lamps.
  const zk = ZB - 0.12;
  for (const x of [-3.2, 3.2, -px1 + 0.25, px1 - 0.25]) span(x - 0.28, D + 0.3, zk, x + 0.28, Y1 - 0.2, ZB, pick(STONE_LIGHT, hash3(x, 1, 1, 408)), 1.03);
  span(-px1 - 0.22, D, zk - 0.08, px1 + 0.22, D + 0.3, ZB, pick(STONE_DARK, 0.3));
  span(-px1 - 0.22, Y1 - 0.2, zk - 0.05, px1 + 0.22, Y1, ZB, pick(STONE_LIGHT, 0.7), 1.04);
  span(-1.15, D + 0.3, zk - 0.1, 1.15, D + 3.3, zk + 0.02, pick(STONE_LIGHT, 0.5), 1.05);
  span(-0.8, D + 0.3, zk - 0.14, 0.8, D + 2.9, zk - 0.08, 0x3a2418, 0.85);
  for (const x of [-0.42, 0.42]) for (const y of [0.9, 1.8, 2.5]) span(x - 0.26, D + y - 0.3, zk - 0.18, x + 0.26, D + y + 0.2, zk - 0.12, 0x4a2e1c, 0.95);
  span(-1.5, D + 3.3, zk - 0.2, 1.5, D + 3.9, zk + 0.02, pick(STONE, 0.3));
  gilt(-0.82, D + 0.32, zk - 0.16, 0.82, D + 0.36, zk - 0.12, 0.4);
  for (const x of [-2.2, 2.2]) {
    span(x - 0.18, D + 2.6, zk - 0.3, x + 0.18, D + 2.7, zk, pick(STONE_LIGHT, 0.4));
    flame(x, D + 2.7, zk - 0.18, 0.32, 0.52, 4 + x, 1.1);
    halo(x, D + 3.0, zk - 0.3, 2.0);
    streak(x, -hd - 0.3, 3.9, 1.3, 0.45);
  }

  // The lintel and its cornice (bulbs along its top edge).
  const L = px1 + 0.35;
  span(-L, Y1, ZB - 0.1, L, Y1 + 0.95, ZF + 0.2, pick(STONE, 0.3));
  span(-L - 0.3, Y1 + 0.95, ZB - 0.3, L + 0.3, Y1 + 1.25, ZF + 0.45, pick(STONE_LIGHT, 0.5), 1.04);
  gilt(-L, Y1 - 0.02, ZF + 0.19, L, Y1 + 0.05, ZF + 0.24, 0.35);
  bulbRow(-L - 0.3, Y1 + 1.29, L + 0.3, Y1 + 1.29, ZF + 0.43, every);
  // The stepped terrace over it (its top on the prasat's grid), deep enough for the towers.
  const ty = Math.ceil((Y1 + 1.85) * 2) / 2;
  span(-L + 0.1, Y1 + 1.25, ZB, L - 0.1, Y1 + 1.55, ZF + 0.55, pick(STONE, 0.6));
  span(-L + 0.5, Y1 + 1.55, ZB + 0.15, L - 0.5, ty, ZF + 0.4, pick(STONE_LIGHT, 0.3), 1.02);
  bulbRow(-L + 0.1, Y1 + 1.58, L - 0.1, Y1 + 1.58, ZF + 0.58, every);
  bulbRow(-L + 0.5, ty + 0.03, L - 0.5, ty + 0.03, ZF + 0.43, every);
  // THREE towers: the tall middle one and two lower ones (as Angkor Wat on the flag).
  const m = new Mason(b, 0.5, { seed: 41, jitter: 0.035, ao: 0.3 });
  // (the tiers on a finer grid: a smoother lotus bud, thinner cornices)
  const fine = low ? undefined : new Mason(b, 0.25, { seed: 44, jitter: 0.03, ao: 0.3 });
  const pz = -3.5;
  const SX = 5;
  const mainO = { h: low ? 10 : 11.5, w: 4, tiers: low ? 5 : 7, doors: SIDE.pz | SIDE.px | SIDE.nx, body: 0.28, src, pal: SANDSTONE, fine };
  const sideO = { h: low ? 6.5 : 7, w: 3, tiers: low ? 4 : 5, doors: SIDE.pz | SIDE.px | SIDE.nx, body: 0.33, src, pal: SANDSTONE, fine };
  const main = prasat(m, 0, pz, ty, mainO);
  const sides = [-1, 1].map((s) => prasat(m, s * SX, pz, ty, sideO));
  for (const g of fine ? [m, fine] : [m]) {
    g.weather(0.025, 42);
    g.mottle(0.05, STONE_DARK, 43);
    g.commit('none');
  }
  // Their profiles in bulbs: each tier's cornice corners up the bud, the body's corners, a light on the tip (softer than
  // the gate's: a fine line of light round the stone, not a glare over it).
  const tk = 0.55;
  const outline = (cx: number, o: typeof mainO, top: number) => {
    const c = 0.5;
    const tc = fine ? 0.25 : 0.5;
    const hw2 = o.w / 2;
    const bodyH = snapTo(o.h * o.body, c);
    const finialH = snapTo(o.h * 0.08, tc);
    const tierH = Math.max(3 * tc, snapTo((o.h - bodyH - c - finialH) / o.tiers, tc));
    // (a redented block's corners are cut two cells deep: a corner's bulb sits on its side face's front edge)
    const zCorner = (half: number, cell: number) => pz + Math.max(0, half - 2 * cell) + 0.04;
    for (const s of [-1, 1]) bulbRow(cx + s * (hw2 + 0.04), ty + 0.3, cx + s * (hw2 + 0.04), ty + bodyH - 0.1, zCorner(hw2, c), every * 1.4, tk);
    let y = ty + bodyH + c;
    bulbRow(cx - hw2 + c, y + 0.03, cx + hw2 - c, y + 0.03, pz + hw2 + c + 0.04, every * 1.2, tk);
    for (const s of [-1, 1]) bulb(cx + s * (hw2 + c + 0.03), y + 0.03, zCorner(hw2 + c, c), tk);
    for (let n = 0; n < o.tiers; n++) {
      const u = (n + 0.5) / o.tiers;
      const half = Math.max(tc, snapTo(hw2 * 0.94 * Math.pow(1 - Math.pow(u, 2.2), 0.5), tc));
      y += tierH;
      for (const s of [-1, 1]) bulb(cx + s * (half + tc + 0.03), y + 0.03, zCorner(half + tc, tc), tk);
      if (half >= 1) bulb(cx, y + 0.03, pz + half + tc + 0.04, tk);
    }
    bulb(cx, top + 0.08, pz, 1.2);
  };
  outline(0, mainO, main.top);
  for (const [i, s] of [-1, 1].entries()) outline(s * SX, sideO, sides[i].top);
  // (lamps in the doors, a gilt tip)
  flame(0, ty + 0.05, pz + 2.35, 0.55, 0.85, 5.1, 1.1);
  halo(0, ty + 0.7, pz + 2.6, 2.6);
  for (const s of [-1, 1]) {
    flame(s * SX, ty + 0.05, pz + 1.85, 0.45, 0.65, 6 + s, 1);
    halo(s * SX, ty + 0.5, pz + 2.1, 1.9);
  }
  gilt(-0.08, main.top, pz - 0.08, 0.08, main.top + 0.45, pz + 0.08, 1);
  // Braziers before the board (their light on the water seen past the deck's front).
  bowl(-bx + 0.7, zb + 1.5, D, 1.35, 2.1, false);
  bowl(bx - 0.7, zb + 1.5, D, 1.35, 3.3, false);
  for (const s of [-1, 1]) streak(s * (bx - 0.7), hd + 0.3, 3.2, 1.0, 0.6);

  // ── Banners on tall lacquered poles either side of the gate ───────────────
  const anchors: { x: number; y: number; z: number }[] = [];
  const barY = Y1 + 2.2;
  for (const s of [-1, 1]) {
    const x = s * (L + 1.25);
    const z = ZF - 0.6;
    span(x - 0.32, D, z - 0.32, x + 0.32, D + 0.32, z + 0.32, pick(STONE_DARK, 0.6));
    span(x - 0.1, D + 0.32, z - 0.1, x + 0.1, barY + 0.55, z + 0.1, pick(LACQUER, 0.5));
    span(x - 1.12, barY - 0.05, z - 0.06, x + 1.12, barY + 0.07, z + 0.06, pick(LACQUER, 0.2));
    span(x - 0.14, barY + 0.55, z - 0.14, x + 0.14, barY + 0.75, z + 0.14, pick(GOLD, 0.5), 1.05);
    span(x - 0.08, barY + 0.75, z - 0.08, x + 0.08, barY + 1.0, z + 0.08, pick(GOLD, 0.8), 1.1);
    const [mx, mz] = fr.at(x, z + 0.12);
    banner(kit, mx, barY - 0.05, mz, yaw, 1.95, 6.4, low, 7 + s);
    anchors.push({ ...xyz(P(x, barY + 0.7, z)) });
  }
  anchors.push(xyz(P(0, ty + 2.8, pz + 2.1)), xyz(P(-SX, ty + 2.4, pz + 1.6)), xyz(P(SX, ty + 2.4, pz + 1.6)), xyz(P(-L, Y1 + 1.25, ZF + 0.45)), xyz(P(L, Y1 + 1.25, ZF + 0.45)));

  // ── The carved panels: the pillars' fronts, the lintel ────────────────────
  const quads: CarveQuad[] = [];
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -px1 : px0;
    quads.push({ at: [x0 + 0.12, D + 0.78, ZF + 0.01], u: [px1 - px0 - 0.24, 0, 0], v: [0, Y1 - 0.6 - (D + 0.78), 0], part: 'pillar' });
  }
  quads.push({ at: [-L + 0.12, Y1 + 0.08, ZF + 0.21], u: [2 * L - 0.24, 0, 0], v: [0, 0.78, 0], part: 'lintel' });
  // (and on the back: the lintel's back face, the false door's lintel, the pillars' backs)
  quads.push({ at: [L - 0.12, Y1 + 0.08, ZB - 0.11], u: [-(2 * L - 0.24), 0, 0], v: [0, 0.78, 0], part: 'lintel' });
  quads.push({ at: [1.4, D + 3.35, zk - 0.21], u: [-2.8, 0, 0], v: [0, 0.5, 0], part: 'lintel' });
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -px1 : px0;
    quads.push({ at: [x0 + (px1 - px0) - 0.12, D + 0.78, ZB - 0.01], u: [-(px1 - px0 - 0.24), 0, 0], v: [0, Y1 - 0.6 - (D + 0.78), 0], part: 'pillar' });
  }
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
    fire: fires.build('nye:lake:fire'),
    flames: fires.count,
    bulbs,
  };
}

const xyz = (p: [number, number, number]) => ({ x: p[0], y: p[1], z: p[2] });
