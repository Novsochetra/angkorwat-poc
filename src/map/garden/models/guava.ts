import type { VoxelBuilder } from '../../../voxel/VoxelBuilder';
import { registerModel } from '../look';
import type { PlantLook } from '../state';
import { along, beam, leafTone, lerp, log, mix, pick, rng, surface, woodTone, type P3 } from './_fruitKit';

/**
 * The guava ត្របែក (garden/kinds.ts `KINDS.guava`; the contract: garden/look.ts).
 *
 * Bought as a seedling (planted, its bag off: a little stem with pairs of oval
 * leaves) and grown in six game days to a small tree of ≈ 4.5 m: a short trunk
 * of smooth coppery bark peeling in grey-green and pale patches, forking low into
 * twisted limbs; an open, irregular crown of clusters of oval leaves, dull green
 * with clear veins (paler beneath). The round fruit hangs under the leaves, green,
 * ripe a pale yellow-green; Cambodian growers wrap many of them in white foam
 * net sleeves against the fruit flies, so some hang white.
 */

/** Bark: smooth copper-brown; the peeling patches (grey-green old skin, fresh pale under it, dark edges). */
const BARK = [0xa06a48, 0x925e40, 0xae7856, 0x9a6444] as const;
const PATCH = [0x8a8a6a, 0xc49a74, 0x6e4c34, 0x9c9a78] as const;
/** Leaves: a dull guava green (darker than the banana's), lighter on top; a young shoot's bronze-green. */
const LEAF = [0x4c7a30, 0x56863a, 0x446e2a, 0x5e8e40, 0x3e6826] as const;
const LEAF_TOP = [0x6a9646, 0x74a04c] as const;
const SHOOT = 0x8a9a4a;
/** Fruit: green, ripe pale yellow-green; the dark calyx; the white foam net sleeve. */
const GREEN = [0x84ac48, 0x8eb452, 0x7aa242] as const;
const RIPE = [0xdedc7c, 0xe8e48a, 0xd2d472] as const;
const CALYX = 0x4a4228;
const NET = [0xf2f0e8, 0xe8e8e0] as const;

type R = (i: number, j?: number) => number;

/** One oval leaf (≈ 7 × 17 cm, a little bigger to read), from its stalk's point outward. */
function ovalLeaf(b: VoxelBuilder, p: P3, az: number, el: number, s: number, color: number, roll: number): void {
  beam(b, p, along(p, az, el, 0.17 * s), 0.075 * s, 0.022, color, 'mapLeaf', roll);
}

/**
 * A clump of leaves round `c` (`rc` its radius): a small dark core (the leaves deep inside, in their own shade),
 * then single oval leaves set round it at every angle, more of them toward the outside and the top, each turned
 * its own way: the guava's leafy, ragged edge. Thin and hanging when wilting.
 */
function cluster(b: VoxelBuilder, look: PlantLook, c: P3, rc: number, r: R, id: number): void {
  const droop = look.droop;
  const sag = droop ? rc * 0.12 * droop : 0;
  // The core: two darker blocks, so the crown is not see-through.
  for (let i = 0; i < 2; i++) {
    const a = r(id, 10 + i) * 6.28;
    b.box(c[0] + Math.sin(a) * rc * 0.12, c[1] - rc * 0.08 * i - sag, c[2] + Math.cos(a) * rc * 0.12, rc * 0.95, rc * 0.5, rc * 0.78, leafTone(LEAF[i], look, r(id, 12 + i)), 'mapLeaf', {
      ry: r(id, 14 + i) * 3.14,
      rx: (r(id, 16 + i) - 0.5) * 0.4,
      shade: 0.9,
    });
  }
  // The leaves: outward from the clump (its side away from the trunk first), up more than down.
  const n = Math.round((rc > 0.45 ? 12 : rc > 0.25 ? 8 : 5) * (droop === 2 ? 0.6 : 1));
  const out = Math.atan2(c[0], c[2]);
  const s = Math.max(0.75, rc / 0.5);
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    // (a spiral round the clump, its first half facing out from the trunk)
    const az = out + (i % 2 ? 1 : -1) * u * 3.0 + (r(id, 20 + i) - 0.5) * 0.7;
    const el = lerp(0.85, -0.55, r(id, 30 + i) * 0.7 + u * 0.3) - (droop ? 0.45 * droop : 0);
    const p = along(c, az, el * 0.6, rc * (0.42 + 0.22 * r(id, 40 + i)));
    p[1] -= sag;
    const k = r(id, 50 + i);
    const top = el > 0.25;
    const col = leafTone(top && k < 0.6 ? pick(LEAF_TOP, k / 0.6) : pick(LEAF, k), look, r(id, 55 + i));
    beam(b, p, along(p, az + (r(id, 60 + i) - 0.5) * 0.8, el, 0.3 * s), 0.15 * s, 0.026, col, 'mapLeaf', (r(id, 65 + i) - 0.5) * 1.6, top ? 1.05 : 0.95);
  }
}

/** A guava hanging under the leaves: a round fruit on its stalk, or the white foam net sleeve tied round it. */
function guava(b: VoxelBuilder, p: P3, ripe: boolean, wrapped: boolean, s: number, k: number): void {
  beam(b, [p[0], p[1] + 0.13 * s, p[2]], [p[0], p[1] + 0.04 * s, p[2]], 0.018, 0.018, 0x6a6a3a, 'mapBark');
  if (wrapped) {
    const net = pick(NET, k);
    b.box(p[0], p[1] - 0.03 * s, p[2], 0.15 * s, 0.15 * s, 0.15 * s, net, 'petal', { ry: k * 3 });
    b.box(p[0], p[1] - 0.03 * s, p[2], 0.13 * s, 0.17 * s, 0.13 * s, mix(net, 0xd8dccc, 0.4), 'petal', { ry: k * 3 + Math.PI / 4 });
    b.box(p[0], p[1] + 0.06 * s, p[2], 0.05 * s, 0.05 * s, 0.05 * s, net, 'petal', { ry: k });
    return;
  }
  const c = ripe ? pick(RIPE, k) : pick(GREEN, k);
  b.box(p[0], p[1] - 0.03 * s, p[2], 0.11 * s, 0.1 * s, 0.11 * s, c, 'petal', { ry: k * 3 });
  b.box(p[0], p[1] - 0.03 * s, p[2], 0.08 * s, 0.13 * s, 0.08 * s, mix(c, ripe ? 0xe0e29a : 0x88b050, 0.25), 'petal', { ry: k * 3 + Math.PI / 4 });
  b.box(p[0], p[1] - 0.1 * s, p[2], 0.035 * s, 0.025 * s, 0.035 * s, CALYX, 'petal');
}

/** A twisted limb or twig from a to c: pieces bending off the straight line, thick ones octagonal with a peeling patch. */
function limb(b: VoxelBuilder, look: PlantLook, a: P3, c: P3, w0: number, w1: number, pieces: number, twist: number, r: R, id: number, arch = 0): P3 {
  const bark = woodTone(pick(BARK, r(id, 1)), look);
  let p = a;
  let joint = c;
  for (let i = 1; i <= pieces; i++) {
    const t = i / pieces;
    const bend = i < pieces ? twist * Math.sin(t * Math.PI) : 0;
    const lift = i < pieces ? arch * Math.sin(t * Math.PI) : 0;
    const q: P3 = [a[0] + (c[0] - a[0]) * t + (r(id, 2 + i) - 0.5) * bend, a[1] + (c[1] - a[1]) * t + (r(id, 6 + i) - 0.5) * bend * 0.5 + lift, a[2] + (c[2] - a[2]) * t + (r(id, 10 + i) - 0.5) * bend];
    const w = w0 + (w1 - w0) * (t - 0.5 / pieces);
    if (w < 0.085) beam(b, p, q, w, w, bark, 'mapBark', r(id, 14 + i));
    else {
      log(b, p, q, w, bark, 'mapBark', 0.94 + 0.08 * r(id, 14 + i));
      if (r(id, 18 + i) < 0.75) {
        const phi = r(id, 22 + i) * 6.28;
        const t0 = 0.2 + 0.3 * r(id, 26 + i);
        beam(b, surface(p, q, t0, phi, w * 0.42), surface(p, q, t0 + 0.3, phi, w * 0.42), w * 0.55, 0.02, woodTone(pick(PATCH, r(id, 30 + i)), look), 'mapBark', phi);
      }
    }
    if (i === 1) joint = q;
    p = q;
  }
  return joint;
}

/** A young stem with pairs of opposite leaves up it (stages 0 and 1), `h` tall. */
function sapling(b: VoxelBuilder, look: PlantLook, h: number, w: number, pairs: number, s: number, r: R): void {
  const lean: P3 = [(r(1, 1) - 0.5) * 0.12 * h, h, (r(2, 1) - 0.5) * 0.12 * h];
  const stemC = woodTone(look.dead ? 0x7a6a50 : 0x8a6a48, look);
  log(b, [0, 0, 0], [lean[0] * 0.5, h * 0.55, lean[2] * 0.5], w, stemC, 'mapBark');
  log(b, [lean[0] * 0.5, h * 0.55, lean[2] * 0.5], lean, w * 0.8, look.dead ? stemC : mix(stemC, SHOOT, 0.5), 'mapBark');
  const droop = look.dead ? 2 : look.droop;
  for (let i = 0; i < pairs; i++) {
    if (look.dead && i % 2 === 1) continue;
    const u = 1 - i / (pairs + 0.5);
    const p: P3 = [lean[0] * u * u, h * u, lean[2] * u * u];
    const az = i * (Math.PI / 2) + r(3, 1) * 3;
    const el = (droop === 2 ? -1.0 : droop === 1 ? -0.4 : 0.35 - 0.15 * (1 - u)) + (r(i, 2) - 0.5) * 0.2;
    const c = leafTone(i === 0 ? mix(pick(LEAF, r(i, 3)), SHOOT, 0.35) : pick(LEAF, r(i, 3)), look, r(i, 4));
    ovalLeaf(b, p, az, el, s * (i === 0 ? 0.7 : 1), c, 0);
    ovalLeaf(b, p, az + Math.PI, el, s * (i === 0 ? 0.7 : 1), c, 0);
  }
}

registerModel('guava', (b, look) => {
  const st = look.stage;
  const r = rng(look, 0x6a);
  if (st === 0) {
    sapling(b, look, 0.4, 0.035, 4, 1.4, r);
    return;
  }
  if (st === 1) {
    sapling(b, look, 0.9, 0.045, 6, 1.5, r);
    // A first side twig with its own pair of leaves.
    const p: P3 = [0, 0.45, 0];
    const az = r(5, 5) * 6.28;
    const q = along(p, az, 0.6, 0.22);
    beam(b, p, q, 0.025, 0.025, woodTone(0x8a6a48, look), 'mapBark');
    if (!look.dead || r(5, 6) < 0.5) {
      const c = leafTone(pick(LEAF, r(5, 7)), look, r(5, 8));
      const el = look.dead || look.droop === 2 ? -1 : look.droop === 1 ? -0.4 : 0.3;
      ovalLeaf(b, q, az + 0.8, el, 1.4, c, 0);
      ovalLeaf(b, q, az - 0.8, el, 1.4, c, 0);
    }
    return;
  }

  // A small tree: a short trunk forking low into twisted limbs; twigs from the limbs out to clumps of leaves
  // spread over a rounded, irregular crown (an ellipsoid's upper shell, `cy` its middle, `rx` / `ry` its radii).
  const P = {
    2: { fork: 0.4, w: 0.06, limbs: 2, cy: 1.18, rx: 0.55, ry: 0.45, clumps: 6, rc: 0.3 },
    3: { fork: 0.45, w: 0.12, limbs: 3, cy: 1.9, rx: 1.2, ry: 0.95, clumps: 12, rc: 0.48 },
    4: { fork: 0.6, w: 0.2, limbs: 4, cy: 2.7, rx: 1.75, ry: 1.3, clumps: 17, rc: 0.62 },
  }[st as 2 | 3 | 4];
  const fork: P3 = [(r(1, 3) - 0.5) * 0.15, P.fork, (r(2, 3) - 0.5) * 0.15];
  limb(b, look, [0, 0, 0], fork, P.w, P.w * 0.92, 1, 0, r, 1);
  if (st === 4) b.box(0, 0.06, 0, P.w * 1.3, 0.12, P.w * 1.3, woodTone(BARK[1], look), 'mapBark', { ry: r(4, 3) });
  if (st >= 3) {
    for (let i = 0; i < 2; i++) {
      const phi = r(i, 40) * 6.28;
      const t = 0.15 + 0.4 * r(i, 41);
      beam(b, surface([0, 0, 0], fork, t, phi, P.w * 0.43), surface([0, 0, 0], fork, t + 0.3, phi, P.w * 0.43), P.w * 0.5, 0.02, woodTone(pick(PATCH, r(i, 42)), look), 'mapBark', phi);
    }
  }
  // The limbs: out and up from the fork to their elbows inside the crown.
  const az0 = r(5, 3) * 6.28;
  const elbows: P3[] = [];
  const joints: P3[] = [];
  const limbAz: number[] = [];
  for (let i = 0; i < P.limbs; i++) {
    const az = az0 + (i / P.limbs) * 6.28 + (r(i, 4) - 0.5) * 0.7;
    const out = P.rx * (i === 0 ? 0.15 : 0.45 + 0.15 * r(i, 5));
    const e: P3 = [fork[0] + Math.sin(az) * out, P.cy - P.ry * (i === 0 ? -0.05 : 0.35 + 0.15 * r(i, 6)), fork[2] + Math.cos(az) * out];
    joints.push(limb(b, look, fork, e, P.w * 0.75, P.w * 0.45, 2, 0.35 * P.rx, r, 10 + i));
    elbows.push(e);
    limbAz.push(az);
  }
  // The clumps: points spread over the crown's upper shell (a seeded spiral), each fed by a twig from the nearest elbow.
  const droop = look.droop;
  const tips: P3[] = [];
  const rcs: number[] = [];
  // Low twigs off the limbs' bends (a grown or nearly grown tree): small clumps at his chest, where he picks.
  const low = st >= 3 ? P.limbs - 1 : 0;
  for (let i = 1; i <= low; i++) {
    const j = joints[i];
    const az = limbAz[i] + (r(i, 90) - 0.5) * 0.9;
    const c: P3 = [j[0] + Math.sin(az) * P.rx * 0.32, Math.min(j[1] + 0.08, st === 4 ? 1.75 : 1.5) - (droop ? 0.1 * droop : 0), j[2] + Math.cos(az) * P.rx * 0.32];
    limb(b, look, j, c, P.w * 0.3, P.w * 0.18, 2, 0.15, r, 400 + i, 0.06);
    const rc = P.rc * 0.62;
    if (!look.dead) cluster(b, look, c, rc, r, 450 + i);
    tips.push(c);
    rcs.push(rc);
  }
  for (let k = 0; k < P.clumps; k++) {
    const u = (k + 0.5) / P.clumps;
    const y = 1 - u * 1.55; // down to −0.55 of the shell
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const az = az0 + k * 2.39996 + (r(k, 50) - 0.5) * 0.5;
    const push = 0.82 + 0.3 * r(k, 51);
    const c: P3 = [fork[0] + Math.sin(az) * rad * P.rx * push, P.cy + y * P.ry * push - (droop ? 0.12 * droop * P.ry : 0), fork[2] + Math.cos(az) * rad * P.rx * push];
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < elbows.length; i++) {
      const d = Math.hypot(c[0] - elbows[i][0], c[1] - elbows[i][1], c[2] - elbows[i][2]);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    // (a twig bends: out and up in an arc, a kink of its own, never a straight spoke)
    limb(b, look, elbows[best], c, P.w * 0.3, P.w * 0.16, bd > 0.7 ? 3 : 2, 0.55 * bd, r, 100 + k, (r(k, 53) - 0.3) * 0.3 * bd);
    const rc = P.rc * (0.8 + 0.4 * r(k, 52));
    if (!look.dead) cluster(b, look, c, rc, r, 200 + k);
    tips.push(c);
    rcs.push(rc);
  }

  if (look.dead) {
    // A few brown leaves still hanging on the dry twigs.
    for (let i = 0; i < Math.min(5, tips.length); i++) {
      const c = tips[i * 3 % tips.length];
      ovalLeaf(b, c, r(i, 70) * 6.28, -1.1, 1.2, leafTone(pick(LEAF, r(i, 71)), look, r(i, 72)), 0.4);
    }
    return;
  }

  if (st === 4 && look.fruit === 0 && look.cut) {
    // Picked: the tree flowers again: white flowers (a puff of stamens on white petals) and small green buds.
    let k = 0;
    for (let i = 0; i < tips.length && k < 14; i++) {
      const c = tips[i];
      if (c[1] > P.cy + P.ry * 0.7 || r(i, 80) < 0.25) continue;
      const a = Math.atan2(c[0], c[2]) + (r(i, 81) - 0.5) * 1.6;
      const p: P3 = [c[0] + Math.sin(a) * rcs[i] * 0.7, c[1] - rcs[i] * 0.5, c[2] + Math.cos(a) * rcs[i] * 0.7];
      beam(b, [p[0], p[1] + 0.12, p[2]], [p[0], p[1] + 0.02, p[2]], 0.016, 0.016, 0x6a6a3a, 'mapBark');
      if (k % 3 === 2) b.box(p[0], p[1], p[2], 0.06, 0.07, 0.06, leafTone(0x9ab858, look), 'petal', { ry: a });
      else {
        b.box(p[0], p[1], p[2], 0.15, 0.04, 0.15, 0xfbf9f2, 'petal', { ry: a });
        b.box(p[0], p[1] + 0.04, p[2], 0.09, 0.05, 0.09, 0xf4ecc0, 'petal', { ry: a + 0.8 });
      }
      k++;
    }
  }

  if (st === 4 && look.fruit > 0) {
    // Fruit under the clusters: one or two each (most), some in white foam sleeves.
    const ripe = look.fruit === 2;
    const wrapShare = 0.25 + 0.3 * r(6, 7);
    let k = 0;
    for (let i = 0; i < tips.length; i++) {
      const c = tips[i];
      const rc = rcs[i];
      // (fruit hangs under the lower and outer clumps, where the leaves let it down)
      // (the low clumps always bear one, bare of a sleeve: the fruit at hand height he picks)
      const n = i < low ? 1 : Math.min(c[1] > P.cy + P.ry * 0.45 || r(i, 8) < 0.2 ? 0 : r(i, 9) < 0.3 ? 2 : 1, 14 - k);
      for (let j = 0; j < n; j++) {
        // (on the clump's outer side, just under its leaves)
        const a = Math.atan2(c[0], c[2]) + (r(i * 3 + j, 10) - 0.5) * 1.8;
        const d = rc * (0.3 + 0.4 * r(i * 3 + j, 11));
        const p: P3 = [c[0] + Math.sin(a) * d, c[1] - rc * 0.5 - 0.06 * r(i * 3 + j, 12), c[2] + Math.cos(a) * d];
        guava(b, p, ripe, i >= low && r(i * 3 + j, 13) < wrapShare, 1.4 + 0.2 * r(i * 3 + j, 14), r(i * 3 + j, 15));
        k++;
      }
    }
  }
});
