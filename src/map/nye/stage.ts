import { Group, Vector3, type Mesh, type Points } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { LATERITE, STONE, STONE_DARK, STONE_LIGHT } from '../landmarks/_prasat';
import { nagaFanReady, stairNaga } from '../sacred/naga';
import { trackSacred } from '../sacred/pending';
import { SacredSet } from '../sacred/set';
import { addLamp } from '../sky/lampSlots';
import type { MapContext, MapFrame } from '../types';
import { buildGate } from './_stGate';
import { course, fireBowl, khmerLamp, Mason2, pick, StageGlow } from './_stKit';
import { buildBoard } from './board';
import type { NyePiece } from './index';
import { BOARD, GROUND, NAGA, STAGE } from './plan';

/**
 * The stage of the New Year's Eve square (AWP-35, docs/discussion/new-year-online.md "The countdown board and
 * the festival square"): the focal point, at the square's north side with its back to Kulen, facing south.
 *
 * - The platform (`STAGE`): a terrace of Angkor sandstone on a laterite footing, moulded as a temple terrace —
 *   footing, plinth, the body, a lotus moulding, a shadowed recess, the coping — paved on top; stairs down its
 *   front middle between stepped cheeks.
 * - Two Khmer naga (`NAGA`) on pedestals guard the stairs: seven cobra heads under one smooth hood in a halo of
 *   flame leaves (sacred/naga.ts, as on Angkor Wat's causeway), their bodies running as the balustrade along
 *   the terrace's front edge on short posts, tails rising at the corners.
 * - Fire bowls along the front edge and two braziers before the board; a Khmer lamp (a lantern under a small
 *   Angkor tower) on each corner.
 * - The gate round the board (_stGate.ts): carved pillars, lintel, a prasat temple top to `BOARD.top`, red
 *   banners with the white Angkor Wat, gilt edges glowing at night.
 * - The countdown board (board.ts): a canvas redrawn only when its text changes.
 *
 * Light: glow and bloom (flames, gilt, the board), two real lamps (sky/lampSlots.ts) at night: the fires
 * before the stage and the temple top. Nothing moves but the board's picture and the glow's flicker (in the
 * shader): the blocks, the naga and the carving are still.
 */
export function buildNyeStage(ctx: MapContext): NyePiece {
  const t0 = performance.now();
  const src = traceSource();
  const b = new VoxelBuilder();
  const m = new Mason2(b, src);
  const glow = new StageGlow();
  const G = GROUND;
  const top = G + STAGE.h;
  const foot = Math.min(G, ctx.field.heightAt(STAGE.x0, STAGE.front), ctx.field.heightAt(STAGE.x1, STAGE.front), ctx.field.heightAt(STAGE.x0, STAGE.back), ctx.field.heightAt(STAGE.x1, STAGE.back)) - 0.4;
  const R = { x0: STAGE.x0, x1: STAGE.x1, z0: STAGE.back, z1: STAGE.front };

  // ── The platform: one hidden core, the moulded courses round it, the paving ──
  m.span(R.x0 + 0.3, foot, R.z0 + 0.3, R.x1 - 0.3, G + 1.25, R.z1 - 0.3, pick(STONE_DARK, 0.5));
  course(m, R, foot, G + 0.35, 0.5, LATERITE, 1.5, 1, 0.8);
  course(m, R, G + 0.35, G + 0.6, 0.25, STONE_LIGHT, 1.7, 2);
  course(m, R, G + 0.6, G + 1.0, 0, STONE, 1.3, 3);
  course(m, R, G + 1.0, G + 1.15, 0.12, STONE_LIGHT, 1.9, 4, 0.6, 1.04);
  course(m, R, G + 1.15, G + 1.25, -0.06, STONE_DARK, 2.2, 5, 0.6, 0.8);
  course(m, R, G + 1.25, top, 0.2, STONE_LIGHT, 1.6, 6, 0.65);
  // (the paving inside the coping: big slabs in close tones)
  {
    const x0 = R.x0 + 0.45;
    const x1 = R.x1 - 0.45;
    const z0 = R.z0 + 0.45;
    const z1 = R.z1 - 0.45;
    const nx = 16;
    const nz = 7;
    for (let i = 0; i < nx; i++)
      for (let k = 0; k < nz; k++) {
        const r = hash3(i, k, 3, 351);
        m.span(x0 + ((x1 - x0) * i) / nx, G + 1.25, z0 + ((z1 - z0) * k) / nz, x0 + ((x1 - x0) * (i + 1)) / nx, top - 0.02 * (r > 0.5 ? 1 : 0), z0 + ((z1 - z0) * (k + 1)) / nz, pick(STONE, r), 'mapStone', 0.97 + 0.06 * hash3(k, i, 5, 352));
      }
  }

  // ── The stairs down the front middle, between stepped cheeks ─────────────
  const sx0 = STAGE.x - STAGE.stair / 2;
  const sx1 = STAGE.x + STAGE.stair / 2;
  const steps = Math.round(STAGE.h / 0.2);
  const rise = STAGE.h / steps;
  const run = (STAGE.stairTo - STAGE.front) / steps;
  for (let k = 0; k < steps; k++) {
    const zEnd = STAGE.stairTo - run * k;
    const y = G + rise * (k + 1);
    for (let p = 0; p < 3; p++) {
      const xa = sx0 + (STAGE.stair * p) / 3;
      const xb = sx0 + (STAGE.stair * (p + 1)) / 3;
      m.span(xa, foot, STAGE.front, xb, y, zEnd, pick(STONE_LIGHT, hash3(k, p, 1, 353)), 'mapStone', 0.98 + 0.04 * (k % 2));
    }
    for (const [c0, c1] of [
      [sx0 - 0.6, sx0],
      [sx1, sx1 + 0.6],
    ])
      m.span(c0, foot, STAGE.front, c1, y + 0.4, zEnd, pick(STONE, hash3(k, c0, 2, 354)));
  }
  // (the cheeks' tops at the stair's head, and a gilt nosing on the top step)
  for (const [c0, c1] of [
    [sx0 - 0.6, sx0],
    [sx1, sx1 + 0.6],
  ])
    m.span(c0 - 0.05, top + 0.4, STAGE.front - 0.4, c1 + 0.05, top + 0.5, STAGE.front + run, pick(STONE_LIGHT, 0.7));
  glow.edge(sx0, top - 0.04, STAGE.front + run - 0.04, sx1, top + 0.01, STAGE.front + run + 0.01);

  // ── The naga's pedestals and the balustrade's posts (the naga themselves are sculpted: later) ──
  const fanY = G + 0.95;
  const fanH = 3.1;
  for (const n of NAGA) {
    m.span(n.x - 0.95, foot, n.z - 0.95, n.x + 0.95, G + 0.25, n.z + 0.95, pick(LATERITE, 0.4));
    m.span(n.x - 0.8, G + 0.25, n.z - 0.8, n.x + 0.8, G + 0.8, n.z + 0.8, pick(STONE, 0.5));
    m.span(n.x - 0.88, G + 0.8, n.z - 0.88, n.x + 0.88, fanY, n.z + 0.88, pick(STONE_LIGHT, 0.5), 'mapStone', 1.04);
    // (a lamp at the pedestal's foot, lit at night)
    glow.flame(n.x, G + 0.45, n.z + 0.84, 0.26, 0.3, 0.06, 0xffb45a, n.x);
  }
  const railY = top + 0.62;
  const outward = (n: (typeof NAGA)[number]) => (n.x < STAGE.x ? -1 : 1);
  const zRail = STAGE.front - 0.3;
  for (const n of NAGA) {
    const s = outward(n);
    const end = s < 0 ? STAGE.x0 + 1.9 : STAGE.x1 - 1.9;
    for (let x = n.x + s * 1.2; s < 0 ? x >= end : x <= end; x += s * 1.6) {
      m.span(x - 0.15, top, zRail - 0.15, x + 0.15, railY - 0.18, zRail + 0.15, pick(STONE, hash3(Math.round(x), 4, 4, 355)));
      m.span(x - 0.19, top, zRail - 0.19, x + 0.19, top + 0.1, zRail + 0.19, pick(STONE_LIGHT, 0.4), 'mapStone', 0.95);
    }
  }

  // ── Fire bowls along the front edge, braziers before the board, Khmer lamps at the corners ──
  let ph = 0;
  for (const n of NAGA) {
    const s = outward(n);
    for (const d of [2.6, 5.6]) fireBowl(m, glow, n.x + s * d, top, STAGE.front - 1.05, STONE, false, (ph += 1.7));
  }
  for (const x of [sx0 - 0.3, sx1 + 0.3]) fireBowl(m, glow, x, top, STAGE.front - 1.05, STONE, false, (ph += 1.7));
  for (const x of [BOARD.x - 4.2, BOARD.x + 4.2]) fireBowl(m, glow, x, top, BOARD.z + 2.6, STONE, true, (ph += 1.7));
  for (const [x, z] of [
    [STAGE.x0 + 0.55, STAGE.front - 0.55],
    [STAGE.x1 - 0.55, STAGE.front - 0.55],
    [STAGE.x0 + 0.55, STAGE.back + 0.55],
    [STAGE.x1 - 0.55, STAGE.back + 0.55],
  ])
    khmerLamp(m, glow, x, top, z, STONE, STONE_LIGHT, (ph += 1.3));

  // ── The gate, its temple top and banners ──────────────────────────────────
  const tBlocks = performance.now();
  const gate = buildGate(b, glow);
  const tGate = performance.now();

  const object = new Group();
  object.name = 'nye:stage';
  const blocks = b.boxes.length;
  const voxels = buildVoxelMesh(b, { quality: ctx.quality === 'low' ? 'low' : 'medium', name: 'nye:stage', hideCovered: true });
  object.add(voxels, gate.carving, gate.banners);
  const tMesh = performance.now();
  const lights = glow.build(ctx.renderer, 'nye:stage');
  object.add(lights.object);
  const tBoard0 = performance.now();
  const board = buildBoard();
  const tBoard = performance.now() - tBoard0;
  object.add(board.mesh);

  // ── The naga (sculpted in a worker: sacred/naga.ts) ───────────────────────
  const sacred = new SacredSet('nye:stage');
  object.add(sacred.object);
  const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
  void trackSacred(
    Promise.all([nagaFanReady('stair'), nagaFanReady('stairFar')]).then(() => {
      const fans = NAGA.map((n) => ({ at: V(n.x, fanY, n.z), look: V(Math.sin(n.facing), 0, Math.cos(n.facing)), height: fanH }));
      const bodies = NAGA.map((n) => {
        const s = outward(n);
        const end = s < 0 ? STAGE.x0 + 1.7 : STAGE.x1 - 1.7;
        return {
          path: [
            V(n.x, fanY + 0.26, n.z - 0.62),
            V(n.x, fanY + 0.52, n.z - 1.15),
            V(n.x + s * 0.3, railY - 0.05, zRail + 0.05),
            V(n.x + s * 1.4, railY, zRail),
            V(end + -s * 1.2, railY, zRail),
            V(end, railY + 0.25, zRail),
            V(end + s * 0.25, railY + 0.65, zRail - 0.1),
            V(end + s * 0.15, railY + 0.9, zRail - 0.25),
          ],
          tail: 1.1,
        };
      });
      sacred.add(stairNaga({ fans, bodies, radius: 0.24, look: 'stone', hide: 320 }));
    }),
  );

  // ── Two real lamps at night: the fires before the stage, the temple top ───
  const fires = addLamp({ kind: 'point', name: 'nye stage fires', color: 0xffa050, distance: 34 });
  fires.position.set(STAGE.x, top + 2.6, STAGE.front + 3.5);
  const temple = addLamp({ kind: 'point', name: 'nye temple top', color: 0xffb066, distance: 30 });
  temple.position.set(BOARD.x, gate.top - 5, BOARD.z + 7);

  const ms = performance.now() - t0;
  let draws = 0;
  object.traverse((o) => {
    if ((o as Mesh).isMesh || (o as Points).isPoints) draws++;
  });
  console.info(`[map] nye stage: ${blocks} blocks, ${draws} meshes (the naga's when sculpted: +1), tower tip ${gate.top.toFixed(1)} m · ${ms.toFixed(0)} ms (stage ${(tBlocks - t0).toFixed(0)}, gate and carving ${(tGate - tBlocks).toFixed(0)}, meshes ${(tMesh - tGate).toFixed(0)}, board ${tBoard.toFixed(0)})`);
  return {
    object,
    blocks,
    update(f: MapFrame) {
      const n = f.night;
      const k = n * n * (3 - 2 * n);
      const breathe = 1 + 0.06 * Math.sin(f.t * 2.3) + 0.04 * Math.sin(f.t * 3.7);
      // (softer since the aisle to the stairs is open: the stairs had burned white under it)
      fires.intensity = 180 * k * breathe;
      temple.intensity = 200 * k;
      lights.update(f);
      gate.update(f);
      board.update(f);
      sacred.update(f);
    },
  };
}
