import type { SourceTrace } from '../../feedback/sourceTrace';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { along, beam, long, mix, type P3 } from './plantKit';

/**
 * Produce made of the plant kit's shapes (veg/plantKit.ts) for the stalls that
 * sell it (the markets' goods, hamlet/_mkGoods.ts; the Kulen stall,
 * hamlet/_knStall.ts): a hand of bananas lying on a table, a bunch hanging
 * from a pole. On the map's axes, as the kit's shapes (a stall's frame:
 * `MkBuild.point` and `heading`). Sizes are the stalls' own (the markets'
 * goods are 1.4 × true size: `_mkGoods.ts`).
 */

/** The dark end of a banana. */
const TIP = 0x3a2a1a;
/** A hand's crown and a bunch's stalk: green going brown. */
const CROWN = 0x6a7a3a;

export interface HandOpts {
  /** Fingers (default 5), each `len` long and `thick` (default 0.2 × 0.045 m). */
  fingers?: number;
  len?: number;
  thick?: number;
  color: number;
  /** How the fingers rise from the crown (radians, default 0.15: lying). */
  el?: number;
  src?: SourceTrace;
}

/**
 * A hand of bananas lying on a table: the crown at `crown`, the fingers side by
 * side fanning out from it toward `az`, curving up. Blocks: 1 + 3 a finger (16
 * for five).
 */
export function bananaHand(b: VoxelBuilder, crown: P3, az: number, o: HandOpts): void {
  const n = o.fingers ?? 5;
  const len = o.len ?? 0.2;
  const thick = o.thick ?? 0.045;
  beam(b, along(crown, az, 0, -thick * 0.8), along(crown, az, 0, thick * 0.6), thick * 1.6, thick * 0.9, CROWN, 'petal', 0, 1, o.src);
  for (let f = 0; f < n; f++) {
    const off = (f - (n - 1) / 2) * 0.24;
    long(b, along(crown, az + Math.PI / 2, 0, (f - (n - 1) / 2) * thick * 0.5), { len, thick, az: az + off, el: o.el ?? 0.15, curve: 0.55, neck: 0.55, taper: 0.7, sides: 4, color: f % 2 ? o.color : mix(o.color, 0xa8b040, 0.12), tip: TIP, src: o.src });
  }
}

export interface BunchOpts {
  /** Hands up the stalk (default 2), fingers each (default 5), each finger `len` long and `thick` (default 0.18 × 0.045 m). */
  hands?: number;
  fingers?: number;
  len?: number;
  thick?: number;
  color: number;
  seed?: number;
  src?: SourceTrace;
}

/**
 * A bunch of bananas hanging from `top` (a string on a pole): its stalk down,
 * the hands on its sides one over the other (each a curved row of fingers),
 * the fingers pointing up and a little out, their tips curving in.
 * Blocks: 1 + 2 a finger (21 for two hands of five).
 */
export function bananaBunch(b: VoxelBuilder, top: P3, az0: number, o: BunchOpts): void {
  const hands = o.hands ?? 2;
  const n = o.fingers ?? 5;
  const len = o.len ?? 0.18;
  const thick = o.thick ?? 0.045;
  // (a hand's height up the stalk, in proportion to its fingers)
  const step = len * 0.9;
  const h = len * 1.2 + hands * step;
  beam(b, top, [top[0], top[1] - h, top[2]], 0.04, 0.04, CROWN, 'petal', 0, 1, o.src);
  for (let k = 0; k < hands; k++) {
    const y = top[1] - h + len * 0.33 + (hands - 1 - k) * step;
    // (a hand is a curved row of fingers on one side of the stalk, the next hand on the other side; the fingers
    // close together, pointing up and a little out, curving in toward the stalk at their tips)
    const side = az0 + (o.seed ?? 0) + k * Math.PI;
    for (let f = 0; f < n; f++) {
      const az = side + (f - (n - 1) / 2) * 0.42;
      const base: P3 = [top[0] + Math.sin(az) * thick * 1.1, y, top[2] + Math.cos(az) * thick * 1.1];
      long(b, base, { len, thick, az, el: 1.15, curve: -0.35, neck: 0.55, taper: 0.7, sides: 4, color: (f + k) % 2 ? o.color : mix(o.color, 0xa8b040, 0.12), src: o.src });
    }
  }
}
