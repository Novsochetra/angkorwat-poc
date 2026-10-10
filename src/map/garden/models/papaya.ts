import type { VoxelBuilder } from '../../../voxel/VoxelBuilder';
import { registerModel } from '../look';
import { along, beam, lerp, leafTone, log, mix, pick, rng, woodTone, type P3 } from './_fruitKit';

/**
 * The papaya ល្ហុង (garden/kinds.ts `KINDS.papaya`; the contract: garden/look.ts).
 *
 * Bought as a seedling in a black nursery bag (planted, the bag is off: a small
 * plant of three or four leaves) and grown in four game days to a tree of ≈ 4 m:
 * one slim grey trunk ringed with the scars of fallen leaves, green near the
 * top, and a crown of deeply lobed hand-shaped leaves on long hollow stalks, the
 * young ones up, the old ones out and down, the oldest yellowing. The fruit
 * clusters on the trunk right under the crown, the lowest the biggest and first
 * to ripen (green; ripe: a yellow-orange blush from the bottom up); a few small
 * cream flowers in the leaf axils above them.
 */

/** Leaf lobes (the map's papaya greens: hamlet/_evKit.ts, hamlet/_bhTrees.ts), the hollow stalks, the yellowing oldest leaf. */
const LEAF = [0x4e8a30, 0x5a9a38, 0x4a8230, 0x62a03e, 0x55923a] as const;
const STALK = [0x9cb85a, 0xa8bc62, 0x8eaa50] as const;
const OLD = [0xc8b444, 0xd2bc4c, 0xb8a83e] as const;
/** Trunk: grey below, grey-green toward the crown; the leaf scars' rings, darker and lighter. */
const TRUNK = [0x9c988a, 0xa49f90, 0x948f80] as const;
const TRUNK_TOP = 0x92a060;
const SCAR = [0x7a766a, 0xb4b09e, 0x84806e] as const;
/** Fruit: green, its paler streaks; ripe yellow-orange and the orange blush; the flowers. */
const GREEN = [0x8ab444, 0x94bc4e, 0x80aa3e] as const;
const RIPE = [0xe8a832, 0xeeb43a, 0xdc9a2c] as const;
const BLUSH = 0xf08a2a;
const FLOWER = 0xf2ecd0;

/** Per stage: trunk height, foot and top widths, leaves, stalk length, blade radius, lobes. */
const ST = {
  ht: [0.16, 0.42, 1.0, 2.2, 3.1],
  wb: [0.035, 0.055, 0.09, 0.15, 0.2],
  wt: [0.03, 0.045, 0.07, 0.1, 0.13],
  n: [4, 5, 7, 10, 13],
  stalk: [0.08, 0.2, 0.45, 0.7, 0.9],
  R: [0.11, 0.19, 0.34, 0.5, 0.6],
  lobes: [3, 5, 5, 7, 7],
} as const;

/**
 * One leaf: its stalk from the trunk's top (two pieces, bending down), then the blade, its lobes fanning out
 * from the stalk's end, the middle ones longest; side lobes on the big middle ones (the deep lobing).
 */
function leaf(b: VoxelBuilder, at: P3, az: number, el: number, stalk: number, R: number, lobes: number, bladeEl: number, color: number, stalkC: number, curl: number, r: (i: number, j?: number) => number, id: number): void {
  const mid = along(at, az, el, stalk * 0.55);
  const end = along(mid, az, el - 0.3, stalk * 0.45);
  const sw = Math.max(0.022, R * 0.07);
  beam(b, at, mid, sw, sw, stalkC, 'mapLeaf');
  beam(b, mid, end, sw, sw, stalkC, 'mapLeaf');
  const spread = lobes <= 3 ? 1.5 : 3.7;
  for (let j = 0; j < lobes; j++) {
    const f = lobes > 1 ? j / (lobes - 1) - 0.5 : 0;
    const phi = f * spread + (r(id, 10 + j) - 0.5) * 0.15;
    const a2 = az + phi;
    const len = R * (1 - 0.42 * Math.abs(f) * 2 * 0.8) * (0.9 + 0.2 * r(id, 20 + j));
    const e2 = bladeEl - 0.35 * Math.abs(phi);
    const tip = along(end, a2, e2, len);
    const w = R * (lobes <= 3 ? 0.46 : 0.42 - 0.12 * Math.abs(f)) * (1 - curl * 0.45);
    const c = j % 2 ? color : mix(color, 0x3e7a28, 0.15);
    beam(b, end, tip, w, 0.026, c, 'mapLeaf', (r(id, 30 + j) - 0.5) * 0.3 + curl * (f < 0 ? 0.9 : -0.9));
    // A side lobe off the big middle lobes (grown leaves): the papaya's deep cut lobing.
    if (lobes >= 7 && Math.abs(f) < 0.3 && R > 0.35) {
      const m = along(end, a2, e2, len * 0.5);
      const side = r(id, 40 + j) < 0.5 ? -1 : 1;
      beam(b, m, along(m, a2 + side * 0.65, e2 - 0.15, len * 0.4), w * 0.7, 0.024, c, 'mapLeaf', curl * side);
    }
  }
}

/** One fruit hugging the trunk: an oblong body (two blocks, an octagon) and its round blossom end; ripe: yellow-orange from the bottom. */
function fruit(b: VoxelBuilder, x: number, y: number, z: number, s: number, th: number, ripe: boolean, k: number): void {
  const w = 0.18 * s;
  const h = 0.27 * s;
  const body = ripe ? pick(RIPE, k) : pick(GREEN, k);
  const top = ripe ? mix(body, 0x9aa83a, 0.55) : mix(body, 0xb4cc62, 0.3);
  b.box(x, y, z, w, h, w, top, 'petal', { ry: th });
  b.box(x, y - h * 0.08, z, w * 0.98, h * 0.82, w * 0.98, body, 'petal', { ry: th + Math.PI / 4 });
  b.box(x, y - h * 0.55, z, w * 0.7, h * 0.18, w * 0.7, ripe ? BLUSH : mix(body, 0x46762a, 0.3), 'petal', { ry: th });
}

registerModel('papaya', (b, look) => {
  const st = look.stage;
  const r = rng(look, 0x9a);
  const dead = look.dead;
  const droop = dead ? 2 : look.droop;
  const ht = ST.ht[st] * (dead ? 0.9 : 1);
  const wb = ST.wb[st];
  const wt = ST.wt[st];

  // The trunk, a little bent: grey pieces narrowing up, green-grey near the top; a dead one leans and greys.
  const lean: P3 = [(r(1, 1) - 0.5) * 0.08 * ht + (dead ? 0.1 * ht : 0), 0, (r(2, 1) - 0.5) * 0.08 * ht];
  const at = (u: number): P3 => [lean[0] * u * u, ht * u, lean[2] * u * u];
  const n = Math.max(1, Math.round(ht / 0.3));
  for (let i = 0; i < n; i++) {
    const u0 = i / n;
    const u1 = (i + 1) / n;
    let c = pick(TRUNK, r(i, 2));
    if (st <= 1) c = 0x7a9a48;
    else c = mix(c, TRUNK_TOP, Math.max(0, (u1 - 0.65) / 0.35) * (st === 2 ? 1 : 0.8));
    if (st === 2) c = mix(c, 0x7a9a48, 0.45);
    log(b, at(u0), at(u1 + 0.02), lerp(wb, wt, (u0 + u1) / 2), woodTone(c, look, 0.8), 'mapBark', 0.97 + 0.06 * r(i, 3));
  }
  if (st >= 3) b.box(0, 0.06, 0, wb * 1.35, 0.12, wb * 1.35, woodTone(TRUNK[0], look), 'mapBark', { ry: r(3, 3) });
  // Leaf scars: thin rings up the trunk, closer under the crown.
  if (st >= 2) {
    const rings = Math.round(ht / (st === 2 ? 0.22 : 0.19));
    for (let i = 1; i < rings; i++) {
      const u = Math.pow(i / rings, 0.8);
      if (u > 0.92) break;
      const p = at(u);
      const w = lerp(wb, wt, u) * 0.86 + 0.022;
      b.box(p[0], p[1], p[2], w, 0.028, w, woodTone(pick(SCAR, r(i, 4)), look), 'mapBark', { ry: r(i, 5) * 1.57 });
    }
  }
  const top = at(1);

  if (dead) {
    // Dry: the crown gone, two or three brown leaves hanging from the top, a broken stalk.
    const k = st === 0 ? 2 : 3;
    for (let i = 0; i < k; i++) {
      const az = r(i, 60) * 6.28 + i * 2.1;
      leaf(b, [top[0], top[1] - 0.02 * i, top[2]], az, -1.1 + 0.2 * r(i, 61), ST.stalk[st] * 0.8, ST.R[st] * 0.8, Math.max(3, ST.lobes[st] - 2), -1.35, leafTone(pick(LEAF, r(i, 62)), look, r(i, 63)), leafTone(STALK[0], look), 1, r, 400 + i);
    }
    if (st >= 2) beam(b, top, along(top, r(9, 60) * 6.28, 0.4, ST.stalk[st] * 0.35), 0.03, 0.03, 0x7a6a50, 'mapBark');
    return;
  }

  // The crown: leaves on a spiral, young ones up, old ones out and down; the oldest yellowing (grown).
  const nl = ST.n[st] + (st >= 3 ? Math.floor(r(4, 6) * 2) : 0);
  for (let i = 0; i < nl; i++) {
    const u = nl > 1 ? i / (nl - 1) : 0;
    const az = i * 2.4 + r(5, 6) * 6.28;
    const y = top[1] - u * Math.min(0.32, ht * 0.12) + 0.02;
    let el = st === 0 ? lerp(1.0, 0.45, u) : lerp(1.05, -0.12, u);
    let bladeEl = st === 0 ? lerp(0.35, 0.05, u) : lerp(0.3, -0.38, u);
    let curl = 0;
    if (droop === 1) {
      el -= 0.4;
      bladeEl -= 0.45;
      curl = 0.25;
    } else if (droop === 2) {
      el = lerp(-0.5, -1.15, u);
      bladeEl = -1.2;
      curl = 0.8;
    }
    const old = st >= 3 && i === nl - 1 && droop === 0 && r(9, 6) < 0.6;
    const color = old ? pick(OLD, r(i, 7)) : pick(LEAF, r(i, 7));
    const k = r(i, 8);
    const sc = old ? STALK[0] : pick(STALK, r(i, 9));
    leaf(
      b,
      [top[0] + Math.sin(az) * wt * 0.4, y, top[2] + Math.cos(az) * wt * 0.4],
      az,
      old ? -0.02 : el,
      ST.stalk[st] * (i === 0 ? 0.75 : 0.9 + 0.2 * r(i, 10)),
      ST.R[st] * (i === 0 ? 0.75 : old ? 0.75 : 0.9 + 0.2 * r(i, 11)),
      ST.lobes[st],
      old ? -1.0 : bladeEl,
      leafTone(color, look, k),
      leafTone(sc, look, k),
      curl,
      r,
      i,
    );
  }
  // The bud of young leaves in the middle of the crown.
  b.box(top[0], top[1] + 0.04, top[2], wt * 1.1, Math.max(0.05, wt * 0.9), wt * 1.1, leafTone(0x7aa848, look), 'mapLeaf');

  if (st === 4 && droop === 0) {
    // Small cream flowers in the leaf axils.
    for (let i = 0; i < 3; i++) {
      const th = r(i, 12) * 6.28;
      const d = wt * 0.5 + 0.04;
      b.box(top[0] + Math.sin(th) * d, top[1] - 0.08 - 0.05 * i, top[2] + Math.cos(th) * d, 0.05, 0.05, 0.05, FLOWER, 'petal', { ry: th });
    }
  }

  if (st === 4 && look.fruit === 0 && look.cut) {
    // Picked: the next fruit already set: cream flowers and tiny green fruit up the trunk under the crown.
    for (let i = 0; i < 11; i++) {
      const u = i / 10;
      const y = top[1] - 0.12 - u * 0.62;
      const th = i * 2.4 + r(11, 13) * 6.28;
      const c = at(y / ht);
      const d = lerp(wb, wt, y / ht) * 0.5 + 0.035;
      const x = c[0] + Math.sin(th) * d;
      const z = c[2] + Math.cos(th) * d;
      if (i % 2 === 0) {
        const fx = x + Math.sin(th) * 0.03;
        const fz = z + Math.cos(th) * 0.03;
        b.box(fx, y, fz, 0.1, 0.06, 0.1, 0xfaf4dc, 'petal', { ry: th + 0.4 });
        b.box(fx, y + 0.035, fz, 0.045, 0.03, 0.045, 0xf2d878, 'petal', { ry: th });
        b.box(fx, y - 0.05, fz, 0.05, 0.05, 0.05, mix(GREEN[0], 0xc8d890, 0.3), 'petal', { ry: th });
      } else {
        const s = lerp(0.42, 0.28, u) * (0.9 + 0.2 * r(i, 17));
        b.box(x + Math.sin(th) * 0.02, y, z + Math.cos(th) * 0.02, 0.18 * s, 0.27 * s, 0.18 * s, GREEN[i % 3], 'petal', { ry: th });
      }
    }
  }

  if (st === 4 && look.fruit > 0) {
    // The fruit, clustered round the trunk under the crown: big and low, smaller up toward the flowers.
    const count = 8 + Math.floor(r(6, 13) * 4);
    const ripeN = look.fruit === 2 ? 2 + Math.floor(r(7, 13) * 2) : 0;
    for (let i = 0; i < count; i++) {
      const u = i / (count - 1);
      const y = top[1] - 0.86 + u * 0.66 + (r(i, 14) - 0.5) * 0.06;
      const s = lerp(1.08, 0.62, u) * (0.92 + 0.16 * r(i, 15));
      const th = i * 2.4 + r(8, 13) * 6.28;
      const c = at(y / ht);
      const d = lerp(wb, wt, y / ht) * 0.5 + 0.088 * s;
      fruit(b, c[0] + Math.sin(th) * d, y, c[2] + Math.cos(th) * d, s, th, i < ripeN, r(i, 16));
    }
  }
});
