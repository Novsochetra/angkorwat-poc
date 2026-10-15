import type { SourceTrace } from '../../feedback/sourceTrace';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { along, beam, long, mix, round, teardrop, type P3 } from './plantKit';

/**
 * Produce made of the plant kit's shapes (veg/plantKit.ts) for the stalls that
 * sell it (the markets' goods, hamlet/_mkGoods.ts; the Kulen stall,
 * hamlet/_knStall.ts, and its seller's counter, people/_sceneKulenKit.ts): a
 * hand of bananas lying on a table, a bunch hanging from a pole, a mango
 * lying on its side, small round fruit. On the builder's axes, as the kit's
 * shapes (a stall's frame: `MkBuild.point` and `heading`; a people rig:
 * people/_kitRig.ts). Sizes are the stalls' own (the markets' goods are 1.4 ×
 * true size: `_mkGoods.ts`).
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
  /**
   * Every block level, turned only about the upright (a hand on an offering plate): right in a turned `Frame`'s or
   * `Local`'s builder too (`Frame.place` adds its turn to `ry`, which holds only for level blocks). The fingers fan
   * out flat, no curve up.
   */
  flat?: boolean;
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
  // (flat: each block laid with a plain turn about the upright, `level`; `beam` gives some level headings as a half turn
  // about x and z with the turn about y between, which a turned frame's `place` cannot add its turn to)
  const lay = o.flat ? level : beam;
  lay(b, along(crown, az, 0, -thick * 0.8), along(crown, az, 0, thick * 0.6), thick * 1.6, thick * 0.9, CROWN, 'petal', 0, 1, o.src);
  for (let f = 0; f < n; f++) {
    const off = (f - (n - 1) / 2) * 0.24;
    const at = along(crown, az + Math.PI / 2, 0, (f - (n - 1) / 2) * thick * 0.5);
    const color = f % 2 ? o.color : mix(o.color, 0xa8b040, 0.12);
    if (o.flat) {
      // (two level pieces bending a little in plan, the dark tip level too)
      const m = along(at, az + off, 0, len * 0.5);
      const e = along(m, az + off * 1.6, 0, len * 0.5);
      level(b, at, along(m, az + off, 0, thick * 0.3), thick * 0.75, thick * 0.8, color, 'petal', 0, 1, o.src);
      level(b, m, e, thick * 0.85, thick * 0.85, color, 'petal', 0, 1, o.src);
      level(b, e, along(e, az + off * 1.6, 0, thick * 0.4), thick * 0.5, thick * 0.5, TIP, 'petal', 0, 1, o.src);
    } else long(b, at, { len, thick, az: az + off, el: o.el ?? 0.15, curve: 0.55, neck: 0.55, taper: 0.7, sides: 4, color, tip: TIP, src: o.src });
  }
}

/**
 * A level block from `a` to `c` (the same height), as `beam` lays it, turned only about the upright: `ry` alone (exact
 * in a turned frame: `Frame.place` adds its turn to `ry`). `beam`'s own arguments (its roll is ignored: none here).
 */
function level(b: VoxelBuilder, a: P3, c: P3, w: number, h: number, color: number, mat: 'petal', _roll: number, shade: number, src?: SourceTrace): void {
  const dx = c[0] - a[0];
  const dz = c[2] - a[2];
  const len = Math.hypot(dx, c[1] - a[1], dz);
  if (len < 1e-4) return;
  b.box((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2, w, h, len, color, mat, { shade, src, ry: Math.atan2(dx, dz) || undefined });
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

export interface MangoOpts {
  /** Its length (stalk end to round end) and width (m); a Khmer mango about 0.15 × 0.1, the markets' 1.4 × that. */
  len: number;
  wid: number;
  color: number;
  /** The ripe ones' red shoulders. */
  blush?: number;
  /** A little roll off lying flat (radians). */
  roll?: number;
  /** Two blocks (hidden in a heap, or far); no stalk. */
  low?: boolean;
  shade?: number;
  src?: SourceTrace;
}

/**
 * A mango lying on its flat side, its middle at `mid` (its foot on the
 * surface: `mid` is `wid` × 0.36 over it), heading `az` from its stalk end to
 * its round end: the kit's teardrop, its kidney curve, its narrow stalk end
 * greener with a dark nub of stalk. Blocks: 6 (`low` 2).
 */
export function mangoLying(b: VoxelBuilder, mid: P3, az: number, o: MangoOpts): void {
  const dir: P3 = [Math.sin(az), -0.08, Math.cos(az)];
  const tip: P3 = [mid[0] - (dir[0] * o.len) / 2, mid[1] - (dir[1] * o.len) / 2, mid[2] - (dir[2] * o.len) / 2];
  // (its stalk end greener, a dark nub of stalk on it: what tells a mango from a block at a step or two)
  teardrop(b, tip, { len: o.len, wid: o.wid, depth: 0.8, curve: 0.4, taper: 0.42, dir, roll: o.roll ?? 0, color: o.color, neck: mix(o.color, 0x6a8a22, 0.45), blush: o.blush, stalk: o.low ? undefined : o.wid * 0.18, stalkColor: 0x4a3a1e, low: o.low, shade: o.shade, src: o.src });
}

/** Small round fruit (lychee, rambutan, longan) on a surface, `n` of them about (x, y, z) within `r` (m), each `s` across: the kit's `round`, `low` (3 blocks each; `cap` a rambutan's green hair). */
export function smallRounds(b: VoxelBuilder, at: P3, n: number, r: number, s: number, colors: readonly number[], seed: number, cap?: number, src?: SourceTrace): void {
  for (let k = 0; k < n; k++) {
    const a = k * 2.4 + seed;
    const d = r * Math.sqrt((k + 0.5) / n);
    const layer = k >= n - Math.floor(n / 3) ? 1 : 0;
    round(b, [at[0] + Math.sin(a) * d * (1 - layer * 0.6), at[1] + layer * s * 0.7, at[2] + Math.cos(a) * d * (1 - layer * 0.6)], { wid: s, hgt: s * 0.9, color: colors[k % colors.length], ribs: false, cap, ry: a, low: true, src });
  }
}
