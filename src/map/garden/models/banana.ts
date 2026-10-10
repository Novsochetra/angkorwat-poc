import type { VoxelBuilder } from '../../../voxel/VoxelBuilder';
import { registerModel } from '../look';
import type { PlantLook } from '../state';
import { across, along, beam, lerp, leafTone, log, mix, pick, rng, woodTone, type P3 } from './_fruitKit';

/**
 * The banana ចេក (garden/kinds.ts `KINDS.banana`; the contract: garden/look.ts).
 *
 * Planted as a pup (a sucker cut from a clump) and grown in four game days to a
 * plant of ≈ 4.2 m: a soft green pseudostem of leaf sheaths, the old outer ones
 * streaked brown and peeling; seven to nine huge paddle leaves on short stalks,
 * the young one still rolled up in the middle, the old ones arching out and down,
 * torn into strips across their halves by the wind; an old leaf or two hanging dry
 * along the stem. Grown, it bears the Cambodian ចេកណាំវ៉ា: a bunch on a stalk
 * that leaves the crown and bends down, its hands of short plump fingers turned
 * up (green, then yellow), and below them on the bare stalk the big purple-red
 * banana flower ត្រយូងចេក, eaten in Khmer salads and soups. Pups come up round
 * its foot.
 */

/** Leaf blades (a fresh banana green, the map's own: hamlet/_psYard.ts, jungle/_campKit.ts), their pale midrib, stalks. */
const LEAF = [0x5e9632, 0x68a238, 0x578c2e, 0x72aa3e, 0x62983a] as const;
const RIB = 0xb4c46a;
const STALK = 0x86a046;
/** The rolled young leaf in the middle: lighter. */
const CIGAR = 0x8cbc4c;
/** Pseudostem: green with darker blotches; brown-streaked old sheaths; the corm at the foot. */
const STEM = [0x6f8a3c, 0x789242, 0x667f36, 0x7c8a44] as const;
const SHEATH = [0x7a5a36, 0x8a6a42, 0x9c7e52, 0x6e5232] as const;
const CORM = 0x5c5a34;
/** Old leaves hanging dry. */
const DRY = [0x8a7448, 0x7a6038, 0x9a8458, 0x84683e] as const;
/** The bunch: green fingers, ripe ណាំវ៉ា yellow; the flower's maroon bracts, their red inside, its pale male flowers. */
const GREEN_FRUIT = [0x86aa44, 0x7c9e3c, 0x8eb24c] as const;
const RIPE_FRUIT = [0xe2c63e, 0xd8bf3a, 0xcabf46, 0xe8cc48] as const;
const BUD = [0x6a2036, 0x7a283e, 0x84304a, 0x5e1c30] as const;
const BRACT_IN = 0xb04a58;
const MALE = 0xe6d2a0;
const PEDUNCLE = 0x7a8a40;

/** Per stage (0 pup … 4 grown): stem height and foot width, leaves, leaf length and width, blade pieces. */
const ST = {
  ht: [0.24, 0.42, 0.85, 1.5, 2.15],
  wb: [0.09, 0.12, 0.2, 0.3, 0.4],
  wt: [0.06, 0.085, 0.14, 0.2, 0.27],
  n: [2, 3, 5, 7, 8],
  len: [0.36, 0.62, 1.15, 1.9, 2.55],
  wid: [0.1, 0.2, 0.4, 0.64, 0.8],
  segs: [1, 2, 3, 4, 4],
} as const;

/** Width along a blade of `n` pieces (narrow at its foot, round at its tip). */
const WIDTH: readonly (readonly number[])[] = [[], [1], [0.85, 0.75], [0.7, 1, 0.75], [0.62, 1, 1, 0.72]];

interface Leaf {
  at: P3;
  az: number;
  /** The stalk's elevation (rad) and length; the blade's first elevation and how much each piece bends down. */
  el: number;
  stalk: number;
  blade: number;
  bend: number;
  len: number;
  wid: number;
  segs: number;
  /** Each half slopes down from the midrib (rad); torn into strips (0‥1). */
  fold: number;
  torn: number;
  color: number;
}

/** One paddle leaf: its stalk, then the blade in pieces, each piece a pale midrib and two halves sloping off it (or torn into strips). */
function leaf(b: VoxelBuilder, L: Leaf, look: PlantLook, r: (i: number, j?: number) => number, id: number): void {
  const k = r(id, 77);
  const col = leafTone(L.color, look, k);
  const rib = leafTone(RIB, look, k);
  const stalkC = leafTone(STALK, look, k);
  const ribW = Math.max(0.026, L.wid * 0.085);
  let p = along(L.at, L.az, L.el, L.stalk);
  beam(b, L.at, p, ribW * 1.25, ribW * 1.1, stalkC, 'mapLeaf');
  const s = across(L.az);
  const sl = L.len / L.segs;
  const prof = WIDTH[L.segs];
  for (let i = 0; i < L.segs; i++) {
    const el = Math.max(-1.45, L.blade - L.bend * i);
    const q = along(p, L.az, el, sl);
    beam(b, p, q, ribW, ribW, rib, 'mapLeaf');
    const hw = (L.wid / 2) * prof[i];
    // Torn pieces: the outer pieces of older leaves split into strips across the half (the veins' way).
    const tear = L.torn > 0 && i >= L.segs / 2 && r(id, 10 + i) < L.torn;
    for (const side of [1, -1]) {
      const fold = L.fold + 0.08 * (r(id, 20 + i + side) - 0.5);
      const off = (ribW / 2 + (hw / 2) * Math.cos(fold)) * side;
      const dy = -(hw / 2) * Math.sin(fold);
      const ox = s[0] * off;
      const oz = s[2] * off;
      if (!tear || hw < 0.12) {
        beam(b, [p[0] + ox, p[1] + dy, p[2] + oz], [q[0] + ox, q[1] + dy, q[2] + oz], hw, 0.03, col, 'mapLeaf', -side * fold);
        continue;
      }
      // Two or three strips with gaps, each hanging a little more at its edge.
      const n = r(id, 30 + i + side) < 0.65 ? 2 : 3;
      for (let j = 0; j < n; j++) {
        const u0 = j / n + 0.02;
        const u1 = (j + 1) / n - 0.03;
        const f2 = fold + 0.1 + 0.3 * r(id, 40 + i * 7 + j + side);
        const o2 = (ribW / 2 + (hw / 2) * Math.cos(f2)) * side;
        const d2 = -(hw / 2) * Math.sin(f2);
        const a: P3 = [p[0] + (q[0] - p[0]) * u0 + s[0] * o2, p[1] + (q[1] - p[1]) * u0 + d2, p[2] + (q[2] - p[2]) * u0 + s[2] * o2];
        const c: P3 = [p[0] + (q[0] - p[0]) * u1 + s[0] * o2, p[1] + (q[1] - p[1]) * u1 + d2, p[2] + (q[2] - p[2]) * u1 + s[2] * o2];
        beam(b, a, c, hw * (0.92 - 0.1 * j / n), 0.03, mix(col, 0x8a8a40, 0.08 * j), 'mapLeaf', -side * f2);
      }
    }
    p = q;
  }
}

/** An old leaf hanging dry along the stem: its stalk snapped out, the blade down, crumpled. */
function dryLeaf(b: VoxelBuilder, y: number, az: number, w: number, len: number, r: (i: number, j?: number) => number, id: number): void {
  const at: P3 = [Math.sin(az) * w * 0.4, y, Math.cos(az) * w * 0.4];
  const knee = along(at, az, 0.35, 0.22);
  beam(b, at, knee, 0.05, 0.05, pick(DRY, r(id, 1)), 'mapLeaf');
  let p = knee;
  const n = 3;
  for (let i = 0; i < n; i++) {
    const q: P3 = [p[0] + Math.sin(az) * 0.05, p[1] - len / n, p[2] + Math.cos(az) * 0.05];
    const roll = (r(id, 10 + i) - 0.5) * 0.9;
    beam(b, p, q, 0.26 - 0.04 * i, 0.04, pick(DRY, r(id, 20 + i)), 'mapLeaf', roll);
    p = q;
  }
}

/** The pseudostem from its foot to `ht`: octagonal pieces narrowing upward, the corm, brown sheath streaks, `lean` its top's offset. */
function stem(b: VoxelBuilder, look: PlantLook, ht: number, wb: number, wt: number, lean: P3, r: (i: number, j?: number) => number, stage: number): void {
  const n = Math.max(2, Math.round(ht / 0.36));
  const at = (u: number): P3 => [lean[0] * u * u, ht * u, lean[2] * u * u];
  for (let i = 0; i < n; i++) {
    const u0 = i / n;
    const u1 = (i + 1) / n;
    const c = woodTone(pick(STEM, r(i, 1)), look, 0.85);
    log(b, at(u0), at(u1 + 0.02), lerp(wb, wt, (u0 + u1) / 2), look.dead ? c : mix(c, 0x5c6a30, u0 < 0.2 ? 0.25 : 0), 'mapBark', 0.96 + 0.08 * r(i, 2));
  }
  b.box(0, 0.05, 0, wb * 1.25, 0.1, wb * 1.25, woodTone(CORM, look), 'mapBark', { ry: r(1, 3) * 1.5 });
  // Old outer sheaths: brown streaks up the lower stem, one peeling away at its top.
  const streaks = stage >= 2 ? 3 + stage : stage === 1 ? 2 : 0;
  for (let i = 0; i < streaks; i++) {
    const th = r(i, 5) * Math.PI * 2;
    const len = ht * (0.25 + 0.35 * r(i, 6));
    const y0 = ht * 0.04;
    const rad = lerp(wb, wt, (len * 0.5) / ht) * 0.5 + 0.004;
    const peel = i === 0 && stage >= 3 ? 0.07 : 0;
    const a: P3 = [Math.sin(th) * rad, y0, Math.cos(th) * rad];
    const c: P3 = [Math.sin(th) * (rad + peel), y0 + len, Math.cos(th) * (rad + peel)];
    beam(b, a, c, Math.max(0.03, wb * 0.28), 0.02, woodTone(pick(SHEATH, r(i, 7)), look, 0.5), 'mapBark', 0);
  }
}

/** A pup at the foot: a little stem and two or three narrow upright leaves. */
function pup(b: VoxelBuilder, look: PlantLook, x: number, z: number, h: number, r: (i: number, j?: number) => number, id: number): void {
  const w = 0.05 + h * 0.07;
  log(b, [x, 0, z], [x, h * 0.45, z], w, woodTone(pick(STEM, r(id, 1)), look), 'mapBark');
  const n = h > 0.6 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const az = r(id, 2) * 6.28 + i * 2.4;
    leaf(
      b,
      { at: [x, h * 0.42, z], az, el: 1.2, stalk: 0.05, blade: 1.0, bend: 0.3, len: h * (0.6 + 0.2 * r(id, 3 + i)), wid: 0.09 + 0.1 * h, segs: h > 0.6 ? 2 : 1, fold: 0.25, torn: 0, color: pick(LEAF, r(id, 6 + i)) },
      look,
      r,
      100 + id * 10 + i,
    );
  }
  b.box(x, h * 0.55, z, 0.035, h * 0.35, 0.035, leafTone(CIGAR, look), 'mapLeaf');
}

/** The bunch: its stalk out of the crown and bending down, the hands of fingers turned up, the bare stalk, the flower. */
function bunch(b: VoxelBuilder, look: PlantLook, top: P3, r: (i: number, j?: number) => number): void {
  const az = (r(1, 50) - 0.5) * 1.1;
  const dx = Math.sin(az);
  const dz = Math.cos(az);
  const P = (o: number, y: number): P3 => [top[0] + dx * o, top[1] + y, top[2] + dz * o];
  const pts = [P(0, 0), P(0.28, 0.3), P(0.62, 0.24), P(0.82, -0.08), P(0.86, -0.4)];
  for (let i = 0; i < pts.length - 1; i++) log(b, pts[i], pts[i + 1], 0.075, PEDUNCLE, 'mapBark');
  const axis = (y: number): P3 => [top[0] + dx * 0.86, top[1] + y, top[2] + dz * 0.86];
  const hands = 6 + Math.floor(r(2, 50) * 2);
  const y0 = -0.4;
  const y1 = -1.04;
  log(b, axis(y0), axis(y1 - 0.06), 0.07, PEDUNCLE, 'mapBark');
  const ripe = look.fruit === 2;
  for (let h = 0; h < hands; h++) {
    const u = h / (hands - 1);
    const y = lerp(y0, y1, u);
    const fingers = u < 0.5 ? 7 : u < 0.85 ? 6 : 4;
    const flen = lerp(0.22, 0.15, u);
    const th0 = h * 2.4 + r(3, 50) * 6.28;
    for (let f = 0; f < fingers; f++) {
      const th = th0 + (f - (fingers - 1) / 2) * 0.46;
      const c = axis(y);
      const base: P3 = [c[0] + Math.sin(th) * 0.07, c[1] + (f % 2) * 0.03, c[2] + Math.cos(th) * 0.07];
      const tip = along(base, th, 0.7 + 0.25 * r(h, f), flen);
      const col = ripe ? pick(RIPE_FRUIT, r(h * 7 + f, 51)) : pick(GREEN_FRUIT, r(h * 7 + f, 52));
      beam(b, base, tip, 0.075, 0.07, ripe && r(h, f + 60) < 0.25 ? mix(col, 0x9aa83a, 0.4) : col, 'petal');
    }
  }
  // The bare stalk (the old flowers' scars) and the flower hanging at its end.
  const yb = y1 - 0.3;
  log(b, axis(y1 - 0.06), axis(yb), 0.05, PEDUNCLE, 'mapBark');
  b.box(axis(y1 - 0.2)[0], top[1] + y1 - 0.2, axis(0)[2], 0.07, 0.03, 0.07, 0x6a5232, 'mapBark');
  const c = axis(yb);
  const lay: [number, number, number][] = [
    // (drop below the stalk's end, width, height)
    [0.03, 0.08, 0.07],
    [0.11, 0.17, 0.11],
    [0.23, 0.22, 0.15],
    [0.36, 0.17, 0.13],
    [0.46, 0.1, 0.09],
    [0.53, 0.05, 0.06],
  ];
  for (let i = 0; i < lay.length; i++) {
    const [d, w, hh] = lay[i];
    b.box(c[0], c[1] - d, c[2], w, hh, w, pick(BUD, r(i, 53)), 'petal', { ry: (i % 2) * (Math.PI / 4) + az });
  }
  // One bract lifting at the top, red inside, the pale male flowers under it.
  const ba = az + (r(4, 50) - 0.5) * 1.2;
  const hinge: P3 = [c[0] + Math.sin(ba) * 0.08, c[1] - 0.1, c[2] + Math.cos(ba) * 0.08];
  beam(b, hinge, along(hinge, ba, -0.5, 0.17), 0.15, 0.025, BRACT_IN, 'petal', 0);
  b.box(hinge[0], hinge[1] - 0.03, hinge[2], 0.09, 0.035, 0.04, MALE, 'petal', { ry: ba });
}

/**
 * After a harvest, before the next bunch: the follower, the strongest pup, grown tall beside the cut stump (the
 * next to bear): a stem as high as his chest and four broad young leaves, a rolled one in the middle.
 */
function follower(b: VoxelBuilder, look: PlantLook, r: (i: number, j?: number) => number): void {
  const th = -1.35 + (r(1, 70) - 0.5) * 0.4 + 0.95;
  const x = Math.sin(th) * 0.78;
  const z = Math.cos(th) * 0.78;
  const h = 0.85 + 0.15 * r(5, 70);
  log(b, [x, 0, z], [x, h * 0.55, z], 0.17, woodTone(STEM[0], look), 'mapBark');
  log(b, [x, h * 0.55, z], [x, h, z], 0.13, woodTone(STEM[1], look), 'mapBark');
  beam(b, [x, h * 0.1, z], [x + Math.sin(th) * 0.02, h * 0.5, z + Math.cos(th) * 0.02], 0.05, 0.02, woodTone(SHEATH[0], look, 0.5), 'mapBark');
  const droop = look.droop;
  for (let i = 0; i < 4; i++) {
    const az = th + i * 2.4 + r(6, 70);
    leaf(
      b,
      { at: [x, h - 0.03 * i, z], az, el: droop ? 0.5 - 0.4 * droop : 1.15 - 0.12 * i, stalk: 0.14, blade: droop ? 0 - 0.4 * droop : 0.85 - 0.12 * i, bend: 0.3 + 0.1 * droop, len: 1.05, wid: 0.36 * (droop === 2 ? 0.65 : 1), segs: 3, fold: droop === 2 ? 1 : 0.15, torn: 0, color: pick(LEAF, r(i, 71)) },
      look,
      r,
      500 + i,
    );
  }
  if (droop < 2) beam(b, [x, h, z], [x, h + 0.45, z], 0.06, 0.06, leafTone(CIGAR, look), 'mapLeaf', 0.4);
}

/**
 * The plant it came from, cut down at the harvest (a banana bears once per stem; the next bunch comes on a
 * follower): a stump of old sheaths chopped at knee height, its pale cut top, a dry sheath hanging off it.
 */
function mother(b: VoxelBuilder, look: PlantLook, r: (i: number, j?: number) => number): void {
  const th = -1.35 + (r(1, 70) - 0.5) * 0.4;
  const x = Math.sin(th) * 0.62;
  const z = Math.cos(th) * 0.62;
  const h = 0.6 + 0.25 * r(2, 70);
  log(b, [x, 0, z], [x, h, z], 0.3, woodTone(mix(STEM[2], 0x7a6a44, 0.45), look), 'mapBark');
  b.box(x, h + 0.01, z, 0.24, 0.03, 0.24, 0xd6cc9a, 'petal', { ry: r(3, 70) });
  b.box(x, h + 0.025, z, 0.1, 0.02, 0.1, 0xb8b47a, 'petal', { ry: r(3, 70) });
  const a = th + 1.4;
  beam(b, [x + Math.sin(a) * 0.15, h * 0.9, z + Math.cos(a) * 0.15], [x + Math.sin(a) * 0.3, 0.05, z + Math.cos(a) * 0.3], 0.12, 0.025, pick(DRY, r(4, 70)), 'mapLeaf', 0.3);
}

registerModel('banana', (b, look) => {
  const st = look.stage;
  const r = rng(look, 0xb4);
  const dead = look.dead;
  const droop = dead ? 2 : look.droop;
  // A dead plant shrinks and leans: its sheaths dry and slump.
  const ht = ST.ht[st] * (dead ? 0.82 : 1);
  const lean: P3 = dead ? [(r(1, 9) - 0.5) * 0.3 * ht, 0, 0.12 * ht] : [(r(1, 8) - 0.5) * 0.06 * ht, 0, (r(2, 8) - 0.5) * 0.06 * ht];
  stem(b, look, ht, ST.wb[st] * (dead ? 0.8 : 1), ST.wt[st] * (dead ? 0.7 : 1), lean, r, st);
  const top: P3 = [lean[0], ht, lean[2]];

  if (dead) {
    // Three brown leaves hanging limp from the top, nothing green.
    const n = st === 0 ? 2 : 3;
    for (let i = 0; i < n; i++) dryLeaf(b, ht - 0.03 - i * 0.04, r(i, 30) * 6.28 + i * 2.1, ST.wt[st], Math.max(0.25, ST.len[st] * 0.55), r, 200 + i);
    return;
  }

  // The rolled young leaf, standing up out of the middle (gone when the plant wilts).
  if (droop < 2) {
    const cl = ST.len[st] * (st === 0 ? 0.75 : 0.45);
    beam(b, top, [top[0] + 0.02, top[1] + cl, top[2]], Math.max(0.045, ST.wt[st] * 0.35), Math.max(0.045, ST.wt[st] * 0.35), leafTone(CIGAR, look), 'mapLeaf', 0.4);
  }

  const n = ST.n[st] + (st === 4 ? Math.floor(r(3, 3) * 2) : 0);
  const young = st <= 1;
  for (let i = 0; i < n; i++) {
    const u = n > 1 ? i / (n - 1) : 0;
    const az = i * 2.4 + r(4, 3) * 6.28 + (r(i, 4) - 0.5) * 0.4;
    let el = young ? lerp(1.32, 1.05, u) : lerp(1.15, 0.6, u);
    let blade = el - (young ? 0.15 : 0.32);
    let bend = young ? 0.16 : lerp(0.26, 0.42, u);
    let wid = ST.wid[st] * (0.9 + 0.2 * r(i, 5));
    let fold = young ? 0.2 : 0.12;
    if (droop === 1) {
      el -= 0.35;
      blade -= 0.45;
      bend += 0.12;
      fold = 0.32;
    } else if (droop === 2) {
      el = lerp(0.2, -0.3, u);
      blade = -0.7;
      bend = 0.25;
      fold = 1.0;
      wid *= 0.65;
    }
    const len = ST.len[st] * (i === 0 ? 0.72 : 0.88 + 0.24 * r(i, 6));
    // The youngest open leaf is still half rolled: narrow, its halves folded up.
    if (i === 0 && droop === 0 && st >= 2) {
      wid *= 0.55;
      fold = -0.35;
    }
    leaf(
      b,
      {
        at: [top[0] + Math.sin(az) * 0.02, top[1] - 0.02 - i * 0.05 * (st / 4 + 0.2), top[2] + Math.cos(az) * 0.02],
        az,
        el,
        stalk: ST.len[st] * 0.17,
        blade,
        bend,
        len,
        wid,
        segs: ST.segs[st],
        fold,
        torn: st >= 3 && u > 0.35 ? 0.1 + 0.6 * u : 0,
        color: pick(LEAF, r(i, 7)),
      },
      look,
      r,
      i,
    );
  }

  // Old leaves hanging dry down the stem.
  const dry = st === 4 ? 1 + Math.floor(r(5, 3) * 2) : st === 3 ? 1 : 0;
  for (let i = 0; i < dry; i++) dryLeaf(b, ht * (0.86 - 0.08 * i), r(i, 31) * 6.28 + Math.PI * 0.6, ST.wt[st], ST.len[st] * 0.55, r, 300 + i);

  // Pups round the foot (away from the bunch's side).
  const pups = st === 4 ? 2 + Math.floor(r(6, 3) * 2) : st === 3 ? 1 : 0;
  for (let i = 0; i < pups; i++) {
    const th = Math.PI + (i - (pups - 1) / 2) * 1.3 + (r(i, 32) - 0.5) * 0.5;
    const d = 0.42 + 0.18 * r(i, 33);
    pup(b, look, Math.sin(th) * d, Math.cos(th) * d, i === 0 ? 0.85 : 0.4 + 0.25 * r(i, 34), r, i);
  }

  if (st === 4 && look.fruit > 0) bunch(b, look, top, r);
  if (st === 4 && look.cut) {
    mother(b, look, r);
    if (look.fruit === 0) follower(b, look, r);
  }
});
