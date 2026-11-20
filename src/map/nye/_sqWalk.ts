import { traceSource } from '../../feedback/sourceTrace';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { TRADER_AT } from '../cattle/plan';
import type { Glow } from '../festival/_glow';
import { onNurseryLot } from '../hamlet/_nurseryPlan';
import { HOME_AT } from '../hamlet/_homePlan';
import type { HeightField } from '../heightfield';
import type { Lamps } from '../landmarks/_prasatKit';
import { GATE, LANTERN_WALK, onSquare } from './plan';
import { khmerLamp } from './_sqKit';

/**
 * The lantern walk (AWP-35; plan.ts `LANTERN_WALK`): Khmer lamps on their stone posts (`_sqKit.ts` `khmerLamp`)
 * both sides of the way from the sugar-palm village up the Kulen foot trail to the square's gate, every
 * `step` m. Each lamp looks for its ground a little way out from the line: never on the trail's tread, on
 * water, a cliff lip or anything built (the nursery, his house, the cattle trader's meadow); a spot it cannot
 * find is left out. The last stretch before the gate is the gate's own (its four lamps, `square.ts`).
 *
 * Returns where the lamps stand (map x, z), for the culling groups.
 */
export function layLanternWalk(b: VoxelBuilder, field: HeightField, lamps: Lamps, glow: Glow | null, step: number): [number, number][] {
  const src = traceSource();
  const out: [number, number][] = [];
  // (the line's length so far at each point)
  const pts = LANTERN_WALK;
  const acc: number[] = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = acc[acc.length - 1];
  const at = (s: number): [number, number, number, number] => {
    let i = 1;
    while (i < pts.length - 1 && acc[i] < s) i++;
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const L = acc[i] - acc[i - 1];
    const u = Math.min(1, Math.max(0, (s - acc[i - 1]) / L));
    return [ax + (bx - ax) * u, az + (bz - az) * u, (bx - ax) / L, (bz - az) / L];
  };
  const ok = (x: number, z: number): boolean => {
    const c = field.index(x, z);
    if (c < 0 || field.trail[c] === 2 || field.occupied[c] || field.waterAt(x, z) !== null || field.dropAt(x, z) > 1.2) return false;
    if (onNurseryLot(x, z, 2) || Math.hypot(x - HOME_AT.x, z - HOME_AT.z) < 9 || Math.hypot(x - TRADER_AT.x, z - TRADER_AT.z) < 10) return false;
    if (onSquare(x, z, 2) || Math.hypot(x - GATE.x, z - GATE.z) < 9) return false;
    // (none on the gate's approach: the way into it stays open)
    if (Math.abs(x - GATE.x) < 4 && z > GATE.z && z < GATE.z + 18) return false;
    // (the ground round its plinth as level as a man would set it)
    const g = field.heightAt(x, z);
    return Math.abs(field.heightAt(x + 0.6, z) - g) < 0.6 && Math.abs(field.heightAt(x, z + 0.6) - g) < 0.6;
  };
  const n = Math.max(2, Math.round((total - 6) / step));
  for (let q = 0; q <= n; q++) {
    const s = (q / n) * (total - 6);
    const [cx, cz, tx, tz] = at(s);
    for (const side of [-1, 1]) {
      for (const d of [2.6, 3.1, 3.7, 4.4, 5.2]) {
        const x = cx - tz * side * d;
        const z = cz + tx * side * d;
        if (!ok(x, z)) continue;
        khmerLamp(b, x, field.heightAt(x, z), z, 1.3, q * 2 + (side > 0 ? 1 : 0), src, lamps, glow);
        field.occupy(x - 0.6, z - 0.6, x + 0.6, z + 0.6);
        out.push([x, z]);
        break;
      }
    }
  }
  return out;
}
