import type { VoxelBuilder } from '../../../voxel/VoxelBuilder';
import { registerModel } from '../look';
import type { PlantLook } from '../state';
import { DEAD_LEAF, DEAD_STEM, marker, mix, mound, pt, rng, seg, thirsty, tone, turned, type P, type Packet, type Rand } from './_crop';

/**
 * The pumpkin ល្ពៅ (garden/kinds.ts `KINDS.pumpkin`; the contract garden/look.ts): a vine that runs over the
 * ground from its hill, up to about 1.6 m out, low (its leaves stand on their stalks half a metre high at most):
 * big lobed leaves, dark green with silvery marks, curling tendrils, yellow trumpet flowers. The Cambodian
 * pumpkin: young fruit dark green speckled pale; ripe (`fruit` 2) big, flat and ribbed, dull green blotched
 * tan or tan-orange (by `look.seed`), lying on the ground on its vine.
 *
 * Stages: 0 the hill of earth with the seed in it and the marker with the empty packet; 1 two round seed leaves
 * and the first true leaf; 2 a short vine; 3 the vine running, flowers; 4 grown, its fruit.
 */

const LEAF = [0x3f6e2a, 0x467830, 0x3a6626, 0x4c7e34] as const;
/** The silvery marks on the leaves (the cross block of each blade). */
const LEAF_MARK = 0x6e9468;
const VINE = 0x5e8a3a;
const STALK = 0x6a9844;
const TENDRIL = 0x8ab454;
const FLOWER = 0xf2b524;
const FLOWER_IN = 0xe89a1a;
const YOUNG = 0x355e2c;
const YOUNG_SPECK = 0x9ab47a;
/** Ripe: dull green blotched tan, or tan-orange. */
const RIPE_GREEN = [0x7a9458, 0x88985c] as const;
const RIPE_GREEN_BLOTCH = 0xdcaa5e;
const RIPE_TAN = [0xd88e40, 0xe09c50] as const;
const RIPE_TAN_RIB = 0xecb868;
const CORK = 0x8a7a52;

const PACKET: Packet = { paper: 0xf0ead6, band: 0x2e6e3a, art: 0xd8862a };

const TAU = Math.PI * 2;

interface Ctx {
  b: VoxelBuilder;
  look: PlantLook;
  r: Rand;
  tan: boolean;
  dead: boolean;
  droop: 0 | 1 | 2;
}

/** A big lobed leaf on its stalk from the vine at `p`, the blade facing up and out toward `yaw`. */
function leaf(c: Ctx, p: P, yaw: number, size: number, high: number, i: number): void {
  const { b, r, dead, droop } = c;
  const q = pt(p.x, p.y, p.z);
  // the stalk stands up (it lies down with thirst, flat when dead)
  const stand = dead ? 1.35 : 0.22 + droop * 0.4 + r(i, 1) * 0.25;
  seg(b, q, high, 0.036, 0.036, yaw, stand, dead ? tone(DEAD_STEM, r(i, 2)) : thirsty(STALK, droop), dead ? 'mapBark' : 'mapLeaf');
  // the blade: two crossed blocks (the lobes), the cross one paler (the silver marks), turned a little
  const s = size * (dead ? 0.6 : droop === 2 ? 0.78 : 1);
  const tilt = dead ? 2.2 : 1.32 + droop * 0.5 + (r(i, 3) - 0.5) * 0.4;
  const base = dead ? tone(DEAD_LEAF, r(i, 4)) : thirsty(tone(LEAF, r(i, 4)), droop, r(i, 5));
  const mat = dead ? 'mapBark' : 'mapLeaf';
  const roll = (r(i, 6) - 0.5) * 0.4;
  const from = pt(q.x, q.y, q.z);
  seg(b, q, s, s * 0.95, 0.05, yaw, tilt, base, mat, roll);
  if (dead) return;
  // (the cross block: turned 45° in the blade's plane, its points the lobes; paler: the silver marks)
  const mid = pt((from.x + q.x) / 2, (from.y + q.y) / 2, (from.z + q.z) / 2);
  turned(b, mid, s * 0.7, s * 0.7, 0.056, yaw, tilt, roll, Math.PI / 4, droop ? thirsty(LEAF_MARK, droop) : mix(base, LEAF_MARK, 0.55), mat);
}

/** A curling tendril from `p`: three short turns of a spiral. */
function tendril(c: Ctx, p: P, yaw: number): void {
  const q = pt(p.x, p.y, p.z);
  const col = thirsty(TENDRIL, c.droop);
  for (let k = 0; k < 3; k++) seg(c.b, q, 0.05, 0.012, 0.012, yaw + k * 1.7, 0.7 + k * 0.4, col, 'mapLeaf');
}

/** A yellow trumpet flower facing up and out at `p`. */
function flower(c: Ctx, p: P, yaw: number): void {
  const q = pt(p.x, p.y, p.z);
  seg(c.b, q, 0.12, 0.018, 0.018, yaw, 0.5, STALK, 'mapLeaf');
  seg(c.b, q, 0.06, 0.05, 0.05, yaw, 0.55, FLOWER_IN, 'petal');
  seg(c.b, q, 0.035, 0.13, 0.13, yaw, 0.55, FLOWER, 'petal', 0.78);
}

/** A pumpkin lying by the vine at (`x`, `z`): green and speckled while young, big, flat and ribbed when ripe. */
function pumpkin(c: Ctx, x: number, z: number, ripe: boolean, i: number): void {
  const { b, r } = c;
  const ry = r(i, 40) * TAU;
  if (!ripe) {
    const s = 0.2 + r(i, 41) * 0.03;
    b.box(x, s * 0.4, z, s, s * 0.8, s * 0.9, YOUNG, 'petal', { ry });
    b.box(x, s * 0.4, z, s * 0.9, s * 0.74, s, mix(YOUNG, YOUNG_SPECK, 0.45), 'petal', { ry: ry + Math.PI / 4 });
    b.box(x, s * 0.84, z, 0.03, 0.04, 0.03, VINE, 'mapLeaf', { ry });
    return;
  }
  // Ripe: about half a metre across and 30 cm high (a big one, so it reads across the garden), its ribs (three blocks turned 30° apart, of two tones), the corky stalk.
  const s = 0.48 + r(i, 42) * 0.06;
  const h = s * 0.62;
  const [a, a2] = c.tan ? RIPE_TAN : RIPE_GREEN;
  const rib = c.tan ? RIPE_TAN_RIB : RIPE_GREEN_BLOTCH;
  b.box(x, h * 0.5, z, s, h, s * 0.8, a, 'petal', { ry });
  b.box(x, h * 0.49, z, s * 0.8, h * 0.97, s, a2, 'petal', { ry });
  b.box(x, h * 0.48, z, s * 0.93, h * 0.92, s * 0.93, rib, 'petal', { ry: ry + Math.PI / 4 });
  b.box(x, h * 0.96, z, s * 0.42, h * 0.16, s * 0.42, mix(a, rib, 0.4), 'petal', { ry: ry + 0.3 });
  b.box(x, h + 0.03, z, 0.045, 0.07, 0.045, CORK, 'mapBark', { ry, rz: 0.3 });
}

/** The vine running out from the hill toward `yaw`, `len` long: its nodes (where leaves, tendrils and fruit grow). */
function runner(c: Ctx, yaw: number, len: number, ri: number, from: P): { nodes: P[]; yaws: number[] } {
  const { b, r, dead, droop } = c;
  const nodes: P[] = [];
  const yaws: number[] = [];
  const q = pt(from.x, from.y, from.z);
  const k = Math.max(2, Math.round(len / 0.22));
  const col = dead ? tone(DEAD_STEM, r(ri, 20)) : thirsty(VINE, droop);
  let y = yaw;
  for (let s = 0; s < k; s++) {
    y += (r(ri * 10 + s, 21) - 0.5) * 0.6;
    seg(b, q, len / k, 0.05, 0.05, y, Math.PI / 2 - 0.02, col, dead ? 'mapBark' : 'mapLeaf');
    nodes.push(pt(q.x, q.y, q.z));
    yaws.push(y);
  }
  return { nodes, yaws };
}

/** A runner's leaves at its nodes (`n`), alternately left and right, the newest (at the tip) smaller; none over `clear`. */
function leaves(c: Ctx, run: { nodes: P[]; yaws: number[] }, n: number, size: number, ri: number, clear: readonly P[]): void {
  const { r } = c;
  const { nodes, yaws } = run;
  for (let j = 0; j < n; j++) {
    const k = Math.min(nodes.length - 1, Math.floor(((j + 0.6) / n) * nodes.length));
    const at = nodes[k];
    const side = j % 2 ? 1 : -1;
    const t = j / Math.max(1, n - 1);
    let yaw = yaws[k] + side * (0.9 + r(ri * 10 + j, 22) * 0.5);
    const s = size * (1 - t * 0.3);
    // (keep the fruit in the open: a leaf over it turns to the runner's other side, or is left out)
    const near = (y: number): boolean => clear.some((f) => Math.hypot(f.x - at.x - Math.sin(y) * s * 0.7, f.z - at.z - Math.cos(y) * s * 0.7) < 0.55);
    if (near(yaw)) {
      yaw = yaws[k] - side * (0.9 + r(ri * 10 + j, 22) * 0.5);
      if (near(yaw)) continue;
    }
    leaf(c, at, yaw, s, 0.13 + (1 - t) * 0.17, ri * 10 + j);
  }
}

registerModel('pumpkin', (b, look) => {
  const r = rng(look, 59);
  const c: Ctx = { b, look, r, tan: r(0, 1) < 0.45, dead: look.dead, droop: look.droop };
  const { stage, dead } = look;
  const turn = r(0, 2) * TAU;
  if (stage <= 1) {
    // the hill (pumpkins are sown in a raised hill of earth)
    mound(b, 0, 0, 0.26, r(0, 3));
    marker(b, 0.26, -0.22, 0.4 + r(0, 4) * 0.5, PACKET, r(0, 5), dead && stage === 0);
    if (stage === 0) return;
    // Two round seed leaves and the first rough true leaf.
    const p = pt(0, 0.08, 0);
    const col = dead ? tone(DEAD_STEM, r(0, 6)) : thirsty(STALK, look.droop);
    seg(b, p, 0.07, 0.022, 0.022, turn, 0.15 + (dead ? 0.7 : 0), col, dead ? 'mapBark' : 'mapLeaf');
    for (const s of [0, Math.PI]) {
      const q = pt(p.x, p.y - 0.01, p.z);
      seg(b, q, 0.075, 0.06, 0.022, turn + s + Math.PI / 2, 1.4 + (dead ? 0.6 : look.droop * 0.3), dead ? tone(DEAD_LEAF, r(1, s)) : thirsty(0x6a9a44, look.droop), dead ? 'mapBark' : 'mapLeaf');
    }
    if (!dead) leaf(c, p, turn, 0.11, 0.04, 9);
    return;
  }
  // The hill under the plant, then its runners.
  mound(b, 0, 0, 0.3, r(0, 7));
  const from = pt(0, 0.08, 0);
  const crown = pt(0, 0.08, 0);
  const lens = stage === 2 ? [0.45] : stage === 3 ? [1.15, 0.6] : [1.5, 1.05, 0.55];
  const counts = stage === 2 ? [4] : stage === 3 ? [7, 4] : [10, 7, 4];
  const size = stage === 2 ? 0.26 : stage === 3 ? 0.36 : 0.42;
  const runs: { nodes: P[]; yaws: number[] }[] = [];
  for (let i = 0; i < lens.length; i++) {
    const yaw = turn + (i === 0 ? 0 : i === 1 ? 2.3 : -2.2) + (r(i, 8) - 0.5) * 0.4;
    runs.push(runner(c, yaw, lens[i] * (dead ? 0.8 : 1), i, from));
  }
  // The fruit: one lying beside the main runner, a second by the side runner; the leaves leave them in the open.
  const fruits: { at: P; k: number }[] = [];
  if (stage === 4 && look.fruit > 0 && !dead) {
    // (two, on runners turned well apart: from wherever he stands one lies in view)
    const nf = 2;
    for (let k = 0; k < nf; k++) {
      const { nodes, yaws } = runs[k];
      const j = Math.floor(nodes.length * (k === 0 ? 0.6 : 0.65));
      const side = (k === 0 ? 1 : -1) * 0.26;
      fruits.push({ at: pt(nodes[j].x + Math.cos(yaws[j]) * side, 0, nodes[j].z - Math.sin(yaws[j]) * side), k });
    }
  }
  const clear = fruits.map((f) => f.at);
  for (let i = 0; i < runs.length; i++) leaves(c, runs[i], dead ? Math.ceil(counts[i] / 3) : counts[i], size, i, clear);
  // two or three leaves standing over the hill itself
  for (let k = 0; k < (dead ? 1 : 3); k++) leaf(c, crown, turn + 1 + k * 2.1, size * 0.95, 0.22, 90 + k);
  if (dead) return;
  // Tendrils and flowers along the runners.
  for (let i = 0; i < runs.length; i++) {
    const n = runs[i].nodes;
    tendril(c, n[n.length - 1], turn + i);
    if (n.length > 3) tendril(c, n[Math.floor(n.length / 2)], turn + i + 2);
  }
  const flowers = stage === 2 ? 0 : stage === 3 ? 2 : look.fruit === 0 ? 3 : 1;
  for (let k = 0; k < flowers; k++) {
    const n = runs[k % runs.length].nodes;
    flower(c, n[Math.min(n.length - 1, 1 + k)], turn + k * 2.4);
  }
  for (const f of fruits) pumpkin(c, f.at.x, f.at.z, look.fruit === 2, f.k);
});
