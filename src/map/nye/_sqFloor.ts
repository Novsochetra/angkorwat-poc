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
 * - the gathering area round the ring of light (the owner's sheet, "PLAYER GATHERING AREA"; the lake reference's
 *   plaza): pavers laid in concentric courses (`COURSES`), each stone turned along its course and the joints
 *   staggered course to course, over a dark bed that shows in the joints, so from above the circle reads stone by
 *   stone: pale stone under the lotus (`_sqRing.ts`), the ring's carved band of darker stone, a gilt-stone band
 *   between two dark courses (`INLAY`; at night a thin gold glow lies on it, `_sqGlow.ts`), and a darker border
 *   course round it all (to `GATHER` m), the plain pavers of the square beyond it.
 *
 * Returns the blocks laid.
 */

/** How far the pavers' tops stand over the land (m). */
export const TOP = 0.08;

/** The gilt band's radius round the ring's middle (m; `_sqGlow.ts` lays its night glow there). */
export const INLAY = 13.8;
/** Gilt sandstone (a warm ochre-gold inlay). */
const GILT = [0xc9a04c, 0xbf9644, 0xd2aa56];
/** The dark bed under the gathering area's pavers (it shows in the joints). */
const BED = [0x4a4034, 0x463c31, 0x4f4438];
/** The border course round the gathering area: a darker, browner stone. */
const BORDER = [0x6e6150, 0x675a4a, 0x746655];

/** The gathering area's radius round the ring's middle (m): its border course's outer edge. */
export const GATHER = 19.1;
/** Its joints (m). */
const JOINT = 0.07;

/** The courses of the gathering area from the middle out: inner and outer radius (m), stone, shade. */
const COURSES: readonly [number, number, readonly number[], number][] = (() => {
  const out: [number, number, readonly number[], number][] = [];
  // Pale stone under the lotus, from the round heart stone out to the carved band.
  const pale = 10;
  for (let i = 0; i < pale; i++) out.push([0.7 + (i * 8.75) / pale, 0.7 + ((i + 1) * 8.75) / pale, PAVER_LIGHT, i % 2 ? 0.97 : 1]);
  out.push([9.45, 10.55, RING_STONE, 0.98]);
  out.push([10.55, 11.43, PAVER, 1], [11.43, 12.3, PAVER, 0.97]);
  out.push([12.3, 13.3, RING_STONE, 0.97], [13.3, 14.3, GILT, 1.02], [14.3, 15.3, RING_STONE, 0.97]);
  out.push([15.3, 16.2, PAVER, 1], [16.2, 17.1, PAVER, 0.97], [17.1, 18.0, PAVER, 1]);
  out.push([18.0, GATHER, BORDER, 0.95]);
  return out;
})();

/**
 * The gathering area's pavers: each course a ring of stones about `len` m long, turned along it, joints staggered
 * from one course to the next; the heart a round gilt stone (two crossed squares). Over the dark bed.
 */
function layCourses(b: VoxelBuilder, field: HeightField, low: boolean, src: ReturnType<typeof traceSource>): void {
  const len = low ? 1.5 : 1.1;
  const g0 = field.heightAt(RING.x, RING.z);
  for (const r of [0, Math.PI / 4]) b.box(RING.x, g0 + TOP - 0.15, RING.z, 1.3, 0.3, 1.3, pick(GILT, 1, 2, 3, 72), 'mapStone', { src, ry: r, shade: 1.04 });
  for (const [k, [r0, r1, tones, shade]] of COURSES.entries()) {
    const rm = (r0 + r1) / 2;
    const n = Math.max(8, Math.round((2 * Math.PI * rm) / len));
    const step = (2 * Math.PI) / n;
    const off = (k % 2) * step * 0.5 + 0.13 * k;
    const w = r1 - r0 - JOINT;
    // (the stone's length along its course: the chord at its middle, less the joint)
    const L = 2 * rm * Math.sin(step / 2) - JOINT;
    for (let i = 0; i < n; i++) {
      const a = off + i * step;
      const x = RING.x + Math.cos(a) * rm;
      const z = RING.z + Math.sin(a) * rm;
      const g = field.heightAt(x, z);
      const h = hash3(k, i, 5, 72);
      b.box(x, g + TOP - 0.15, z, L, 0.3, w, pick(tones, k, i, 7, 72), 'mapStone', { src, ry: Math.PI / 2 - a, shade: shade * (0.95 + 0.09 * h) });
    }
  }
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
      if (r < GATHER - 0.2) {
        // The gathering area's bed: dark, a little low (its turned pavers lie over it: `layCourses`).
        color = pick(BED, x, z, 11, 71);
        top = TOP - 0.035;
      } else if (e > 1 && !onWay) {
        // Loose pavers just past the border, few, bedded flush in the grass (none where water or a trail is): the floor
        // fades into the meadow, no dark slab lies dropped on it.
        const out = (e - 1) / 0.1;
        if (out >= 1 || h > 0.35 * (1 - out) * (1 - out) || low) continue;
        const c = field.index(x, z);
        if (c < 0 || field.waterAt(x, z) !== null || field.trail[c] === 2) continue;
        color = pick(PAVER, x, z, 7, 71);
        shade *= 0.94;
        top = 0.015 - 0.02 * out;
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
  layCourses(b, field, low, src);
  return b.boxes.length - n0;
}
