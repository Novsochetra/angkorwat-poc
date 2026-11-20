import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { HeightField } from '../heightfield';
import { GATE, RING, SQUARE, STAGE } from './plan';
import { LATERITE, PAVER, PAVER_LIGHT, pick, RING_STONE } from './_sqKit';

/**
 * The square's paved floor (AWP-35): 1 m sandstone pavers over the ellipse `SQUARE`, laid flush with the land
 * (their tops `TOP` m over it: no step to stumble on; the part keeps them out of the walk map, `noWalk`), with
 *
 * - a laterite border round the edge, and loose pavers past it, fewer the farther out, sinking into the grass
 *   (the floor fades into the meadow, not a plate laid on it);
 * - the processional way of pale slabs from the gate (through it, and an apron outside) to the ring, and on from
 *   the ring to the stage's stairs;
 * - the ring's carved band of darker stone (where the ring of light lies, `_sqRing.ts`) round a disc of pale
 *   stone, so by day it reads as an inlay;
 * - concentric rings round it, so from above the square reads as one designed circle: a dark border ring with a
 *   gilt-stone band inlaid in it (`INLAY`; at night a thin gold glow lies on it, `_sqGlow.ts`), a second dark ring
 *   farther out, and radial joints of darker stone every 22.5° between the ring and the border.
 *
 * Returns the blocks laid.
 */

/** How far the pavers' tops stand over the land (m). */
export const TOP = 0.08;

/** The gilt band's radius round the ring's middle (m; `_sqGlow.ts` lays its night glow there). */
export const INLAY = 13.8;
/** Gilt sandstone (a warm ochre-gold inlay). */
const GILT = [0xc9a04c, 0xbf9644, 0xd2aa56];

/** On a radial joint (every 22.5° round the ring, half a paver wide). */
function radial(x: number, z: number, r: number): boolean {
  const a = Math.atan2(z - RING.z, x - RING.x);
  const step = Math.PI / 8;
  const off = a - Math.round(a / step) * step;
  return Math.abs(off) * r < 0.5;
}

export function layFloor(b: VoxelBuilder, field: HeightField, low: boolean): number {
  const src = traceSource();
  const n0 = b.boxes.length;
  const { x: sx, z: sz, rx, rz } = SQUARE;
  const ell = (x: number, z: number) => Math.hypot((x - sx) / rx, (z - sz) / rz);
  /** On the processional way (and its width there). */
  const way = (x: number, z: number): boolean => {
    if (z >= RING.z) return Math.abs(x - GATE.x) <= 2.5 && z <= GATE.z + 6.5;
    return Math.abs(x - STAGE.x) <= 3 && z >= STAGE.stairTo - 0.5;
  };
  const x0 = Math.floor(sx - rx * 1.16);
  const x1 = Math.ceil(sx + rx * 1.16);
  const z0 = Math.floor(Math.min(sz - rz * 1.16, STAGE.stairTo - 1));
  const z1 = Math.ceil(GATE.z + 7);
  for (let z = z0 + 0.5; z < z1; z += 1)
    for (let x = x0 + 0.5; x < x1; x += 1) {
      const e = ell(x, z);
      const onWay = way(x, z);
      const r = Math.hypot(x - RING.x, z - RING.z);
      const h = hash3(x, z, 3, 71);
      let color: number;
      let shade = 0.96 + 0.08 * hash3(x, z, 5, 71);
      let top = TOP;
      if (e > 1 && !onWay) {
        // Loose pavers past the border, fewer and lower the farther out (none where water or a trail is).
        const out = (e - 1) / 0.15;
        if (out >= 1 || h > 0.55 * (1 - out) * (1 - out) || low) continue;
        const c = field.index(x, z);
        if (c < 0 || field.waterAt(x, z) !== null || field.trail[c] === 2) continue;
        color = pick(hash3(x, z, 9, 71) < 0.5 ? PAVER : LATERITE, x, z, 7, 71);
        shade *= 0.88;
        top = 0.03 - 0.03 * out;
      } else if (Math.abs(r - RING.r) <= 0.55) color = pick(RING_STONE, x, z, 1, 71);
      else if (!onWay && e <= 0.94 && Math.abs(r - INLAY) <= 0.5) {
        color = pick(GILT, x, z, 8, 71);
        shade *= 1.02;
      } else if (!onWay && e <= 0.94 && (Math.abs(r - INLAY) <= 1.5 || Math.abs(r - 18.6) <= 0.5)) {
        color = pick(RING_STONE, x, z, 9, 71);
        shade *= 0.97;
      } else if (!onWay && e <= 0.94 && r > RING.r + 0.6 && radial(x, z, r)) {
        color = pick(PAVER, x, z, 10, 71);
        shade *= 0.86;
      }
      else if (r < RING.r - 0.55) {
        color = pick(PAVER_LIGHT, x, z, 2, 71);
        shade *= 0.98;
      } else if (onWay) color = pick(PAVER_LIGHT, x, z, 3, 71);
      else if (e > 0.94) {
        color = pick(LATERITE, x, z, 4, 71);
        shade *= 0.96;
      } else {
        color = pick(PAVER, x, z, 5, 71);
        // (now and then a warmer or a darker stone: an old floor, mended)
        if (h < 0.025) color = pick(LATERITE, x, z, 6, 71);
      }
      const g = field.heightAt(x, z);
      b.box(x, g + top - 0.15, z, 1, 0.3, 1, color, 'mapStone', { src, shade });
    }
  return b.boxes.length - n0;
}
