import type { VoxelBuilder } from '../../../voxel/VoxelBuilder';
import { registerModel } from '../look';
import type { PlantLook } from '../state';
import { Blade, DEAD_LEAF, DEAD_STEM, marker, mix, mound, pt, rng, seg, thirsty, tone, type P, type Packet, type Rand } from './_crop';

/**
 * The pumpkin ល្ពៅ (garden/kinds.ts `KINDS.pumpkin`; the contract garden/look.ts): a vine that runs over the
 * ground from its hill, up to about 1.6 m out, low (its leaves stand on their stalks half a metre high at most):
 * big round leaves with five shallow lobes (a notch where the stalk joins), dark green with pale silvery veins,
 * a little cupped, each held up on its own long pale stalk so they stand at different heights over the vine like
 * small umbrellas, gaps between them where the earth, the vine and the fruit show; curling tendrils, yellow
 * trumpet flowers. The Cambodian
 * pumpkin: young fruit dark green speckled pale; ripe (`fruit` 2) big, flat and ribbed, dull green blotched
 * tan or tan-orange (by `look.seed`), lying on the ground on its vine.
 *
 * Stages: 0 the hill of earth with the seed in it and the marker with the empty packet; 1 two round seed leaves
 * and the first true leaf; 2 a short vine; 3 the vine running, flowers; 4 grown, its fruit.
 */

/** The leaves' upper face: dark green (each leaf one tone; its lobes a shade lighter or darker). */
const LEAF = [0x335f24, 0x3a6a2a, 0x2f5a21, 0x41702e] as const;
/** Young leaves at the runners' tips: smaller, lighter. */
const LEAF_YOUNG = 0x5c903a;
/** The pale silvery veins (the mottling along them near the middle). */
const VEIN = 0x9cb88a;
const VINE = 0x5e8a3a;
/** The leaf stalks: long, pale, hollow. */
const STALK = 0x7eaa58;
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

/**
 * A leaf on its stalk from the vine at `p`: the stalk rising `high` and leaning out toward `yaw`, the blade (`L`
 * from the notch to its tip, a little wider than long) held at its top facing up and a little out. Grown leaves
 * have five lobes and their veins; `young` ones (at the runners' tips) are smaller, lighter and plainer.
 */
function leaf(c: Ctx, p: P, yaw: number, L: number, high: number, i: number, young = false): void {
  const { b, r, dead, droop } = c;
  // The stalk: it stands (lies down with thirst; flat and brown when dead).
  const lean = dead ? 1.3 : 0.25 + r(i, 1) * 0.3 + droop * 0.3;
  const h = high * (dead ? 0.5 : droop === 2 ? 0.55 : droop === 1 ? 0.8 : 1);
  const q = pt(p.x, p.y, p.z);
  const stalkC = dead ? tone(DEAD_STEM, r(i, 2)) : thirsty(young ? mix(STALK, LEAF_YOUNG, 0.4) : STALK, droop);
  seg(b, q, h / Math.cos(Math.min(1.2, lean)), young ? 0.02 : 0.03, young ? 0.02 : 0.03, yaw, lean, stalkC, dead ? 'mapBark' : 'mapLeaf');
  // The blade: facing the light at its own angle; thirst tips it down and curls its lobes under.
  const S = L * (dead ? 0.62 : droop === 2 ? 0.84 : 1);
  const pitch = dead ? 1.25 : (r(i, 3) - 0.3) * 0.45 + droop * 0.5;
  const bl = new Blade(b, q, yaw + (r(i, 4) - 0.5) * 0.7, pitch, (r(i, 5) - 0.5) * 0.5);
  const mat = dead ? 'mapBark' : 'mapLeaf';
  const base = dead ? tone(DEAD_LEAF, r(i, 6)) : thirsty(young ? LEAF_YOUNG : tone(LEAF, r(i, 6)), droop, r(i, 7));
  const light = dead ? base : mix(base, 0x6e9a50, 0.06);
  const dark = dead ? mix(base, 0x4a3a28, 0.2) : mix(base, 0x1e3a14, 0.07);
  // (cupped: the middle low, the lobes' edges up; wilting rolls them under, dead leaves curl hard)
  const cup = dead ? -0.7 : droop === 2 ? -0.45 : droop === 1 ? 0.03 : 0.12;
  const t = 0.04;
  // (broad blocks overlapping into one round, filled blade, a little wider than long: the middle, the tip lobe,
  // the two upper side lobes stepping out)
  bl.put(0, S * 0.48, -0.006, S * 0.94, S * 0.66, t, 0, 0, 0, base, mat);
  bl.put(0, S * 0.8, -0.002, S * 0.62, S * 0.4, t, 0, 0, cup * 0.6, light, mat);
  for (const sd of [-1, 1]) bl.put(sd * S * 0.37, S * 0.58, 0.004, S * 0.48, S * 0.5, t, -sd * 0.45, sd * cup, 0, sd < 0 ? light : dark, mat);
  if (young || dead) return;
  // the two lower lobes, rounding back on either side of the notch where the stalk joins
  for (const sd of [-1, 1]) bl.put(sd * S * 0.31, S * 0.24, 0.002, S * 0.44, S * 0.36, t, -sd * 0.95, sd * cup * 0.8, 0, sd < 0 ? dark : base, mat);
  // the veins fanning from the notch: flush with the face, only a little paler (the silvery mottling along them)
  const vein = droop ? thirsty(mix(base, VEIN, 0.3), droop) : mix(base, VEIN, 0.24);
  bl.put(0, S * 0.5, 0.012, S * 0.07, S * 0.6, 0.012, 0, 0, 0, vein, 'mapLeaf');
  for (const sd of [-1, 1]) bl.put(sd * S * 0.2, S * 0.42, 0.012, S * 0.06, S * 0.46, 0.012, -sd * 0.72, 0, 0, vein, 'mapLeaf');
}

/** A curling tendril from `p`: three short turns of a spiral. */
function tendril(c: Ctx, p: P, yaw: number): void {
  const q = pt(p.x, p.y, p.z);
  const col = thirsty(TENDRIL, c.droop);
  for (let k = 0; k < 3; k++) seg(c.b, q, 0.055, 0.013, 0.013, yaw + k * 2.1, 0.45 + k * 0.55, col, 'mapLeaf');
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
  const k = Math.max(2, Math.round(len / 0.3));
  const col = dead ? tone(DEAD_STEM, r(ri, 20)) : thirsty(VINE, droop);
  let y = yaw;
  for (let s = 0; s < k; s++) {
    y += (r(ri * 10 + s, 21) - 0.5) * 0.6;
    // (off the hill and down to the earth, then creeping along it)
    seg(b, q, len / k, 0.042, 0.042, y, s === 0 ? Math.PI / 2 - 0.12 : Math.PI / 2, col, dead ? 'mapBark' : 'mapLeaf');
    nodes.push(pt(q.x, q.y, q.z));
    yaws.push(y);
  }
  return { nodes, yaws };
}

/**
 * A runner's leaves (`n`), one at each node on alternate sides, the newest (at the tip) young; none over `clear`
 * (the fruit stays in the open). `L` the grown leaf's size, `tall` how high the stalks hold the oldest.
 */
function leaves(c: Ctx, run: { nodes: P[]; yaws: number[] }, n: number, L: number, tall: number, ri: number, clear: readonly P[]): void {
  const { r } = c;
  const { nodes, yaws } = run;
  for (let j = 0; j < n; j++) {
    const k = Math.min(nodes.length - 1, Math.floor(((j + 0.5) / n) * nodes.length));
    const at = pt(nodes[k].x, 0.03, nodes[k].z);
    const side = j % 2 ? 1 : -1;
    const t = j / Math.max(1, n - 1);
    const young = n > 1 && j === n - 1;
    const s = L * (young ? 0.5 : 1 - t * 0.12) * (0.88 + r(ri * 10 + j, 23) * 0.24);
    const high = tall * (young ? 0.5 : 1 - t * 0.2) * (0.72 + r(ri * 10 + j, 24) * 0.55);
    let yaw = yaws[k] + side * (0.7 + r(ri * 10 + j, 22) * 0.6);
    // (where the blade's middle comes: a leaf over a fruit turns to the runner's other side, or is left out)
    const near = (y: number): boolean => clear.some((f) => Math.hypot(f.x - at.x - Math.sin(y) * (high * 0.4 + s * 0.5), f.z - at.z - Math.cos(y) * (high * 0.4 + s * 0.5)) < 0.5);
    if (near(yaw)) {
      yaw = yaws[k] - side * (0.7 + r(ri * 10 + j, 22) * 0.6);
      if (near(yaw)) continue;
    }
    leaf(c, at, yaw, s, high, ri * 10 + j, young);
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
    if (!dead) leaf(c, p, turn, 0.12, 0.05, 9, true);
    return;
  }
  // The hill under the plant, then its runners.
  mound(b, 0, 0, 0.3, r(0, 7));
  const from = pt(0, 0.08, 0);
  const crown = pt(0, 0.08, 0);
  const lens = stage === 2 ? [0.5] : stage === 3 ? [1.15, 0.65] : [1.5, 1.1, 0.65];
  const counts = stage === 2 ? [3] : stage === 3 ? [5, 3] : [6, 5, 3];
  const L = stage === 2 ? 0.3 : stage === 3 ? 0.42 : 0.5;
  const tall = stage === 2 ? 0.18 : stage === 3 ? 0.3 : 0.36;
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
  for (let i = 0; i < runs.length; i++) leaves(c, runs[i], dead ? Math.ceil(counts[i] / 2) : counts[i], L, tall, i, clear);
  // the oldest leaves, standing tallest over the hill itself
  for (let k = 0; k < (dead ? 1 : stage === 2 ? 1 : stage === 3 ? 2 : 3); k++) leaf(c, crown, turn + 1.1 + k * 2.1, L * 1.02, tall * (1.05 + (k % 2) * 0.2), 90 + k);
  if (dead) return;
  // Tendrils curling at the runners' tips and flowers along them.
  for (let i = 0; i < runs.length; i++) {
    const n = runs[i].nodes;
    tendril(c, n[n.length - 1], runs[i].yaws[n.length - 1] + 0.6);
  }
  const flowers = stage === 2 ? 0 : stage === 3 ? 2 : look.fruit === 0 ? 3 : 1;
  for (let k = 0; k < flowers; k++) {
    const n = runs[k % runs.length].nodes;
    flower(c, n[Math.min(n.length - 1, 1 + k)], turn + k * 2.4);
  }
  for (const f of fruits) pumpkin(c, f.at.x, f.at.z, look.fruit === 2, f.k);
});
