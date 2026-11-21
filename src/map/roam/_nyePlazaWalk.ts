import {
  LAKE_GATE,
  LAKE_NAGA,
  LAKE_POND,
  LAKE_SALA_FLOOR,
  LAKE_SALA_FURNITURE,
  LAKE_SALAS,
  LAKE_SHORE,
  LAKE_STALL_COUNTER,
  LAKE_STALLS,
  LAKE_WALL,
  lakeFacingIn,
  lakePlazaAt,
  lakePlazaPolar,
  lakeWallRuns,
} from '../nye/plan';
import { registerAddon } from './_addons';
import type { RoamWorld } from './types';

/**
 * New Year's Eve's lake plaza in the walk map (AWP-35; the plaza: nye/_lkPlaza*.ts, where: nye/plan.ts): its low
 * stonework is in his way, never a step he climbs onto. The walk map (walkmap.ts) holds the plaza's blocks like any
 * part's, and the walker climbs onto what carries three of his rim's probes (walker.ts `carried`): the slim ring wall
 * (0.9 m) does not, straight on, but sliding along it its 0.5 m columns' staircase now and then did, and the sala's
 * bench, the naga's pedestals, the pond's kerb always did. So, as the zip line's rails (_zipWalk.ts) and his built
 * pieces (_buildWalk.ts), they are laid over the world's `standAt` (his feet, the dog's way-finding) as walls to feet
 * below their top (and a little over it: no hop or jump lands on them), wherever the plaza stands:
 *
 * - the ring wall along its runs (`lakeWallRuns`: the openings, the gate and the salas left out), its footing's half
 *   thickness and a hair (`BAND`) either side of its line;
 * - the naga's and the braziers' pedestals either side of the avenue (`LAKE_NAGA`);
 * - the lily pond's kerb (an elliptic ring: he does not step into the water);
 * - the salas' low tables and back bench (`LAKE_SALA_FURNITURE`, over each sala's floor: the floor itself he steps up
 *   onto, as a terrace), the stalls' counters (`LAKE_STALL_COUNTER`).
 *
 * The camera's maps (`hardStandAt`, clearance) are left as they were. Only while the New Year venue is built (the `nye`
 * part, nye/clock.ts `squareShown`); anywhere else every answer is the world's own. Cheap: one circle test far from
 * the plaza, a few sums near it; nothing allocated per question.
 */

/** Beyond the wall's footing either side of its line (m): his rim's probes stop there. */
const BAND = 0.06;
/** Over a thing's top this far (m) feet are not held off it: none gets there by a step, a hop or a jump. */
const OVER = 0.5;
/** Questions farther than this from the plaza's middle (m) are the world's (the avenue's pedestals are ≈ 31 m out). */
const NEAR = 36;

/** A box turned about y: middle, unit axes (across, along), half sizes, its top over its own floor, that floor. */
interface Box {
  x: number;
  z: number;
  ax: number;
  az: number;
  hx: number;
  hz: number;
  top: number;
  floor: number;
}

export function installPlazaWalk(world: RoamWorld): void {
  const { standAt, field } = world;
  if (!standAt) return;
  const runs = lakeWallRuns();
  const RW = LAKE_WALL.r;
  const half = LAKE_WALL.half + BAND;
  const boxes: Box[] = [];
  /** A box in a frame at (x, z) facing `yaw` (+z its front), its middle at local (lx, lz). */
  const box = (x: number, z: number, yaw: number, lx: number, lz: number, hx: number, hz: number, top: number, floor: number) => {
    const ax = Math.cos(yaw);
    const az = -Math.sin(yaw);
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    boxes.push({ x: x + ax * lx + fx * lz, z: z + az * lx + fz * lz, ax, az, hx, hz, top, floor });
  };
  // The naga's pedestals: in the gate's frame (+z out along the avenue), on the land under each.
  {
    const yawOut = lakeFacingIn(LAKE_GATE.phi) + Math.PI;
    const [gx, gz] = lakePlazaAt(LAKE_GATE.phi, RW);
    for (const s of [-1, 1])
      for (const [lz, hw, top] of [
        [LAKE_NAGA.foot, LAKE_NAGA.footHalf, LAKE_NAGA.footTop],
        [LAKE_NAGA.head, LAKE_NAGA.headHalf, LAKE_NAGA.headTop],
      ] as const) {
        const ax = Math.cos(yawOut);
        const az = -Math.sin(yawOut);
        const px = gx + ax * s * LAKE_NAGA.kerb + Math.sin(yawOut) * lz;
        const pz = gz + az * s * LAKE_NAGA.kerb + Math.cos(yawOut) * lz;
        box(px, pz, yawOut, 0, 0, hw, hw, top, field.heightAt(px, pz));
      }
  }
  // The salas' tables and bench, over each one's floor (its lowest corner's land, as the sala is built).
  for (const s of LAKE_SALAS) {
    const ax = Math.cos(s.facing);
    const az = -Math.sin(s.facing);
    const fx = Math.sin(s.facing);
    const fz = Math.cos(s.facing);
    const g = Math.min(...[-1, 1].flatMap((i) => [-1, 1].map((k) => field.heightAt(s.x + ax * i * (s.w / 2) + fx * k * (s.d / 2), s.z + az * i * (s.w / 2) + fz * k * (s.d / 2)))));
    for (const f of LAKE_SALA_FURNITURE) box(s.x, s.z, s.facing, f.x, f.z, f.hx, f.hz, f.top, g + LAKE_SALA_FLOOR);
  }
  // The stalls' counters (the stall's floor: the paving's top over the land at its middle).
  for (const p of LAKE_STALLS) {
    const C = LAKE_STALL_COUNTER;
    box(p.x, p.z, p.facing, 0, C.z, C.w / 2, C.d / 2, C.top, field.heightAt(p.x, p.z) + 0.08);
  }
  // The pond's kerb: its ring's middle line (the ellipse 0.2 m out), half its stones' width and a hair either side.
  const P = LAKE_POND;
  const pf = [Math.sin(P.yaw), Math.cos(P.yaw)];
  const pa = [Math.cos(P.yaw), -Math.sin(P.yaw)];
  const pondTop = 0.33;
  const pondFloor = field.heightAt(P.x, P.z);

  const blocked = (x: number, z: number, y: number): boolean => {
    // The ring wall.
    const [phi, r] = lakePlazaPolar(x, z);
    if (Math.abs(r - RW) <= half) {
      const a = phi < 0 ? phi + 2 * Math.PI : phi;
      for (const [a0, a1] of runs)
        if (a >= a0 && a <= a1) {
          if (y < field.heightAt(x, z) + LAKE_WALL.top + OVER) return true;
          break;
        }
    }
    // The boxes.
    for (const b of boxes) {
      const dx = x - b.x;
      const dz = z - b.z;
      if (Math.abs(dx * b.ax + dz * b.az) > b.hx + BAND || Math.abs(dx * -b.az + dz * b.ax) > b.hz + BAND) continue;
      if (y < b.floor + b.top + OVER && y > b.floor - 1) return true;
    }
    // The pond's kerb.
    {
      const dx = x - P.x;
      const dz = z - P.z;
      const a = dx * pf[0] + dz * pf[1];
      const c = dx * pa[0] + dz * pa[1];
      const q = Math.hypot(a / (P.rx + 0.2), c / (P.rz + 0.2));
      if (Math.abs(q - 1) * Math.min(P.rx, P.rz) < 0.28 && y < pondFloor + pondTop + OVER) return true;
    }
    return false;
  };

  world.standAt = (x, z, y, up, h) => {
    const dx = x - LAKE_SHORE.x;
    const dz = z - LAKE_SHORE.z;
    if (dx * dx + dz * dz < NEAR * NEAR && blocked(x, z, y)) return NaN;
    return standAt(x, z, y, up, h);
  };
}

registerAddon({
  id: 'nyePlazaWalk',
  init(e) {
    // (only while the New Year venue stands: the part is built from the day it ships to the day after the night)
    if (e.parts.some((p) => p.name === 'nye')) installPlazaWalk(e.world);
  },
});
