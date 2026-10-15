import type { SourceTrace } from '../../feedback/sourceTrace';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { plantsLite } from './detail';
import { fan, log, teardrop, type P3 } from './plantKit';

/**
 * The map's papaya trees (ល្ហុង) from the plant kit (veg/plantKit.ts): a slim
 * grey trunk, greener near the crown, a crown of hand-shaped leaves (`fan`) on
 * long pale stalks (the young ones up, the old ones out and down), the rolled
 * young leaves at the top, the fruit clustered on the trunk under the crown
 * (`teardrop`, the lowest ripening). The back hamlet's (hamlet/_bhTrees.ts),
 * the east village's and the floating village's (hamlet/_evKit.ts `papaya`).
 * The home garden's papaya is its own model (garden/models/papaya.ts).
 *
 * Into a builder on the map's axes, the foot at (x, y, z), `h` to the crown.
 * `r` is the caller's seeded 0‥1 (the same calls give the same tree). Blocks:
 * ≈ 170 (nine leaves of seven lobes, six fruit); on the low graphics level
 * (veg/detail.ts) ≈ 80 (six leaves of five lobes, four fruit, the kit's `low`
 * ones).
 */

/** Papaya leaves (the garden's: garden/models/papaya.ts), their pale hollow stalks. */
const LEAF = [0x4e8a30, 0x5a9a38, 0x62a03e];
const STALK = 0x9cb85a;

export interface PapayaOpts {
  h: number;
  /** Turns the crown and the fruit (radians). */
  turn: number;
  r: (i: number, j?: number, k?: number) => number;
  src?: SourceTrace;
}

export function papayaTree(b: VoxelBuilder, x: number, y: number, z: number, o: PapayaOpts): void {
  const { h, src } = o;
  const lite = plantsLite();
  const i = o.turn;
  log(b, [x, y - 0.1, z], [x, y + h * 0.55, z], 0.24, 0x8a8478, 'mapBark', 1, src);
  log(b, [x, y + h * 0.5, z], [x, y + h, z], 0.19, 0x8e9070, 'mapBark', 1, src);
  const n = lite ? 6 : 9;
  for (let k = 0; k < n; k++) {
    const u = k / (n - 1);
    const az = k * 2.4 + i + (o.r(k, i, 71) - 0.5) * 0.4;
    const top: P3 = [x, y + h - 0.04 * k, z];
    fan(b, top, { az, el: 0.95 - 1.15 * u, stalk: 0.6 + 0.2 * o.r(k, 72), lobes: lite ? 5 : 7, spread: lite ? 2.8 : 3.2, len: 0.55, wid: lite ? 0.26 : 0.22, segs: 1, rib: false, bend: 0.3, color: LEAF[k % LEAF.length], stalkColor: STALK, src });
  }
  // The rolled young leaves at the very top.
  b.box(x, y + h + 0.12, z, 0.16, 0.24, 0.16, 0x7aa848, 'mapLeaf', { src, ry: i });
  const nf = lite ? 4 : 6;
  for (let k = 0; k < nf; k++) {
    const a = (k / nf) * Math.PI * 2 + i * 0.7;
    const ripe = k === 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    // (on the trunk under the crown, hanging down and a little out: the lowest the biggest)
    const low = k % 2;
    teardrop(b, [x + ca * 0.12, y + h - 0.3 - low * 0.26, z + sa * 0.12], { len: 0.26 - low * 0.03, wid: 0.15 - low * 0.02, taper: 0.65, dir: [ca * 0.3, -1, sa * 0.3], color: ripe ? 0xe0a030 : 0x7aa040, neck: ripe ? 0x9aa83a : 0x6a9a38, low: lite, src });
  }
}
