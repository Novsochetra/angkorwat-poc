import type { VoxelBuilder } from '../../../voxel/VoxelBuilder';
import { registerModel } from '../look';
import type { PlantLook } from '../state';
import { DEAD_LEAF, DEAD_STEM, marker, mix, mound, pt, ribbon, rng, seg, thirsty, tone, type P, type Packet, type Rand } from './_crop';

/**
 * The corn ពោត (garden/kinds.ts `KINDS.corn`; the contract garden/look.ts): a little clump of two or three
 * stalks (three seeds go in one hole, as Khmer gardeners sow it), each up to about 2.3 m: a jointed stalk on its
 * brace roots, long ribbon leaves arching out two ways, the tassel on top, an ear in its husk at the stalk's
 * middle with its silk. Cambodia grows much waxy corn (ពោតដំណើប: white, or white and purple) as well as yellow:
 * the kind is the plant's own (`look.seed`); the purple one has purplish silk and husk tips.
 *
 * Green ears (`fruit` 1): slim, the husk fresh, the silk pale green-yellow. Ripe (2): fat ears, the husk paler
 * and loosened at the tip so the kernels show, the silk brown and dry. It is picked once (`harvest: 'once'`).
 *
 * Stages: 0 the sown hills and the marker with the empty packet; 1 spikes of the first leaves; 2 knee-high,
 * leaves only; 3 tall, the tassel just showing; 4 grown, tasselled, with ears.
 */

const LEAF = [0x4f8f30, 0x58983a, 0x478529, 0x5f9c40] as const;
const LEAF_LOW = 0x6e9a42;
const STALK = [0x6c9a40, 0x78a648, 0x649238] as const;
const NODE = 0x557e30;
const ROOT = 0x8a9a52;
const TASSEL = 0xd2c470;
const TASSEL_OLD = 0xa88a58;
const HUSK = 0x7aac48;
const HUSK_RIPE = 0xc2c27a;
const HUSK_DRY = 0xd4c690;
const SILK = 0xdad688;
const SILK_PURPLE = 0xb47aa0;
const SILK_RIPE = 0x6a4428;
/** The kinds: white waxy, white-and-purple waxy, yellow. */
const KERNEL = { white: [0xf2ecd4, 0xe8e2c4], purple: [0x5e2a6c, 0xf0e8d6], yellow: [0xf2c43a, 0xe8b430] } as const;
type CornKind = keyof typeof KERNEL;

const PACKET: Packet = { paper: 0xf0ead6, band: 0x3a7a3a, art: 0xf0c03a };

interface Ctx {
  b: VoxelBuilder;
  look: PlantLook;
  r: Rand;
  kind: CornKind;
  dead: boolean;
  droop: 0 | 1 | 2;
}

/** One ear in its husk, leaning out from the stalk at `p` toward `yaw`. */
function ear(c: Ctx, p: P, yaw: number, i: number): void {
  const { b, look, r, kind } = c;
  const ripe = look.fruit === 2;
  const len = ripe ? 0.27 : 0.2;
  const w = ripe ? 0.095 : 0.07;
  const lean = 0.42 + r(i, 50) * 0.15 + (ripe ? 0.12 : 0);
  const q = pt(p.x, p.y, p.z);
  // its shank, then the husked ear
  seg(b, q, 0.05, 0.03, 0.03, yaw, lean + 0.4, mix(HUSK, NODE, 0.4), 'mapLeaf');
  const husk = ripe ? HUSK_RIPE : HUSK;
  seg(b, q, len * 0.62, w, w, yaw, lean, husk, 'mapLeaf', 0.3);
  const purple = kind === 'purple';
  if (!ripe) {
    seg(b, q, len * 0.38, w * 0.7, w * 0.7, yaw, lean - 0.12, purple ? mix(husk, 0x8a4a7a, 0.25) : mix(husk, 0x98bc58, 0.4), 'mapLeaf', 0.3);
    seg(b, q, 0.07, 0.04, 0.03, yaw, lean - 0.3, purple ? SILK_PURPLE : SILK, 'petal');
    return;
  }
  // Ripe: the husk's tip opened back, the kernels showing, a tuft of dry brown silk.
  const tip = pt(q.x, q.y, q.z);
  seg(b, q, len * 0.36, w * 0.82, w * 0.82, yaw, lean - 0.06, tone(KERNEL[kind], 0), 'petal', 0.6);
  if (kind === 'purple') seg(b, pt(tip.x, tip.y, tip.z), len * 0.3, w * 0.86, w * 0.6, yaw, lean - 0.06, KERNEL.purple[1], 'petal', 1.4);
  seg(b, q, 0.06, 0.04, 0.03, yaw, lean - 0.4, SILK_RIPE, 'mapBark');
  for (const s of [-1, 1]) seg(b, pt(tip.x, tip.y, tip.z), len * 0.3, w * 0.55, 0.02, yaw + s * 1.1, lean + 0.7, HUSK_DRY, 'mapLeaf');
}

/** One stalk from `base`, `H` tall, `n` leaves arching out two ways (`face`: the way the first leans). */
function stalk(c: Ctx, base: P, H: number, n: number, face: number, lyaw: number, lean: number, si: number, tassel: boolean, ears: number): void {
  const { b, look, r, dead, droop } = c;
  const stage = look.stage;
  const thick = stage === 4 ? 0.085 : stage === 3 ? 0.072 : stage === 2 ? 0.05 : 0.024;
  const colStalk = dead ? tone(DEAD_STEM, r(si, 1)) : thirsty(tone(STALK, r(si, 2)), droop);
  const mat = dead ? 'mapBark' : 'mapLeaf';
  const top = H * (!tassel ? 1 : stage === 4 ? 0.86 : 0.93);
  // Brace roots splayed at its foot (from knee-high on).
  if (stage >= 3 && !dead) for (let k = 0; k < 3; k++) seg(b, pt(base.x, base.y + 0.12, base.z), 0.15, 0.022, 0.022, face + (k * Math.PI * 2) / 3 + 0.5, 2.55, ROOT, 'mapBark');
  // The stalk: thicker below, a darker joint at each leaf.
  const p = pt(base.x, base.y, base.z);
  seg(b, p, top * 0.5, thick, thick, lyaw, lean, colStalk, mat);
  seg(b, p, top * 0.5, thick * 0.78, thick * 0.78, lyaw, lean, colStalk, mat);
  const tipP = pt(p.x, p.y, p.z);
  const at = (t: number): P => pt(base.x + (tipP.x - base.x) * t, base.y + (tipP.y - base.y) * t, base.z + (tipP.z - base.z) * t);
  if (stage >= 3 && !dead) for (const t of [0.22, 0.42, 0.62]) {
    const j = at(t);
    b.box(j.x, j.y, j.z, thick * 1.25, 0.03, thick * 1.25, thirsty(NODE, droop), 'mapLeaf');
  }
  // Leaves: alternating sides up the stalk, the long ones in the middle, the low ones paler; they arch out and
  // hang at the tips (more with thirst; dead, brown and hanging).
  const L = [0, 0.16, 0.5, 0.82, 0.95][stage];
  const W = [0, 0.05, 0.1, 0.145, 0.155][stage];
  const segs = stage <= 2 ? 2 : 3;
  for (let k = 0; k < n; k++) {
    const t = stage === 1 ? 0.35 + 0.5 * (k / n) : 0.08 + 0.84 * (k / Math.max(1, n - 1));
    const j = at(t);
    const yaw = face + (k % 2) * Math.PI + (r(si * 20 + k, 4) - 0.5) * 0.7;
    const midness = 1 - Math.abs(t - 0.45) * 1.1;
    const len = L * (0.62 + 0.38 * Math.max(0, midness)) * (dead ? 0.6 : droop === 2 ? 0.8 : 1);
    const tilt = (stage === 1 ? 0.3 : 0.35) + (1 - t) * 0.15 + (dead ? 0.9 : droop * 0.32);
    const bend = (stage <= 2 ? 0.5 : 0.7) + (dead ? 0.5 : droop * 0.3);
    const low = t < 0.3;
    const col = (i: number): number => {
      if (dead) return tone(DEAD_LEAF, r(si * 20 + k, 5 + i));
      const c0 = low && stage === 4 ? mix(tone(LEAF, r(si * 20 + k, 6)), LEAF_LOW, 0.55) : tone(LEAF, r(si * 20 + k, 6));
      return thirsty(i === segs - 1 ? mix(c0, 0x6ea040, 0.2) : c0, droop, r(si * 20 + k, 7));
    };
    if (dead && k % 2 === 1) continue;
    ribbon(b, j, yaw, tilt, bend, segs, len, W, W * 0.5, 0.042, col, dead ? 'mapBark' : 'mapLeaf', (r(si * 20 + k, 8) - 0.5) * 0.7);
  }
  if (dead) return;
  // The tassel: a spike and its spreading branches.
  if (tassel) {
    const old = look.fruit === 2;
    const col = thirsty(old ? TASSEL_OLD : TASSEL, droop);
    const tq = pt(tipP.x, tipP.y, tipP.z);
    seg(b, tq, H - top, 0.026, 0.026, lyaw, lean, col, 'petal');
    for (let k = 0; k < 5; k++)
      seg(b, pt(tipP.x, tipP.y + (H - top) * (0.15 + 0.1 * (k % 2)), tipP.z), (H - top) * 0.7, 0.018, 0.018, lyaw + k * 1.256 + r(si, 9), 0.75 + (old ? 0.3 : 0) + droop * 0.2, col, 'petal');
  }
  // Ears: half way up, leaning out (the second one lower, on the other side).
  for (let e = 0; e < ears; e++) ear(c, at(0.5 - e * 0.13), face + Math.PI / 2 + e * Math.PI + (r(si, 10) - 0.5) * 0.6, si * 2 + e);
}

registerModel('corn', (b, look) => {
  const r = rng(look, 47);
  const kr = r(0, 1);
  const c: Ctx = { b, look, r, kind: kr < 0.45 ? 'white' : kr < 0.7 ? 'purple' : 'yellow', dead: look.dead, droop: look.droop };
  const { stage } = look;
  const nStalks = r(0, 2) < 0.4 ? 2 : 3;
  const turn = r(0, 3) * Math.PI * 2;
  // The hills where the stalks come up (a triangle or a pair, 22 cm apart).
  const spots: [number, number][] = [];
  for (let i = 0; i < nStalks; i++) {
    const a = turn + (i * Math.PI * 2) / nStalks + (r(i, 4) - 0.5) * 0.4;
    const d = nStalks === 2 ? 0.11 : 0.13;
    spots.push([Math.sin(a) * d, Math.cos(a) * d]);
  }
  if (stage <= 1) {
    for (const [x, z] of spots) mound(b, x, z, 0.12, r(x * 100, 5));
    marker(b, 0.24, -0.16, 0.5 + r(0, 6) * 0.4, PACKET, r(0, 7), look.dead && stage === 0);
    if (stage === 0) return;
  }
  const H0 = [0, 0.2, 0.62, 1.65, 2.3][stage];
  const face = turn + 0.8;
  for (let i = 0; i < nStalks; i++) {
    const [x, z] = spots[i];
    const H = H0 * (i === 0 ? 1 : 0.86 + r(i, 8) * 0.1) * (look.dead ? 0.85 : 1);
    const n = [0, 2, 5, 9, 10][stage] - (i === 0 ? 0 : 1);
    const lean = 0.05 + r(i, 9) * 0.06 + (look.dead ? 0.15 : look.droop * 0.05);
    const outYaw = Math.atan2(x, z) + (r(i, 11) - 0.5) * 0.8;
    const ears = stage === 4 && look.fruit > 0 && !look.dead ? 1 : 0;
    // (stage 3: the tassel just showing in the top leaves, a bud of an ear with fresh silk on the main stalk)
    stalk(c, pt(x, stage === 1 ? 0.06 : 0, z), H, n, face + i * 0.5, outYaw, lean, i, stage === 4 || (stage === 3 && i === 0), ears);
  }
});
