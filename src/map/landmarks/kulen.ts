import { Group } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { PATHS, type PlaceDef } from '../layout';
import type { MapContext, MapFrame, MapPart } from '../types';
import { FLOWER_PINK, gardenTree, Mason, type Palette, prasat, redent, SHADOW, SIDE, tieredTop } from './_prasat';
import { Frame, grassOverPad, Lamps } from './_prasatKit';

/**
 * Phnom Kulen — "The Mountain Temple", in the manner of Phnom Bakheng: a
 * temple-mountain on the summit of the holy mountain, ~700 m from the
 * overview camera (a 1 m block is about one pixel there), so it is made of
 * big, clear shapes.
 *
 * The pad stands 6 m proud of the summit: its sides are clad as the first
 * terrace with a parapet round the rim, and a broad stair comes down to the
 * mountain road on the south. On it a stepped pyramid of five square tiers,
 * each with a dark footing, a light cornice and small towers on its corners;
 * a steep central stair runs up the front, and the main tower — a stepped
 * square spire over a sanctuary with four doors — stands on the top
 * platform with four corner towers round it. Two small shrines flank
 * the foot of the stair. At night lamps burn up the stair and at the doors,
 * with one warm light on the tower's face. The tip stays under ~188 m: the
 * overview frame's top edge is at about 192 m over the pad.
 */

/** Weathered grey-brown sandstone and laterite, as at Bakheng. */
const BK: Palette = {
  stone: [0x9d8f7a, 0x91836f, 0xa89a84, 0x877a67],
  light: [0xb8a98f, 0xaea086, 0xc1b298],
  dark: [0x6f6353, 0x655a4b, 0x786b5a],
  base: [0x8f6a52, 0x84614b, 0x997358, 0x7d5c47],
};
/** Square tiers of the pyramid: half size (m); each is TIER_H tall. */
const TIERS = [14, 12, 10, 8, 6];
const TIER_H = 3;
/** The main tower: sanctuary width (m); the spire above it tops out ~20 m over the top tier. */
const TOWER = { w: 10 };

export function buildKulen(ctx: MapContext, place: PlaceDef): MapPart {
  const f = ctx.field;
  const g = place.y;
  const [phx, phz] = place.pad;
  // Local frame at the pad centre (+x east, +z south, world heights).
  const fr = new Frame(place.x, 0, place.z, 0);
  const b = new VoxelBuilder();
  const m = new Mason(b, 1, { seed: 31 });
  const d = new Mason(b, 0.5, { seed: 32 });
  const lamps = new Lamps(0.35, 5);
  const src = traceSource();

  // The flat top reaches one terrain cell past the pad's half size.
  const ex = phx + 2;
  const ez = phz + 2;
  const ground = (lx: number, lz: number) => f.heightAt(fr.wx(lx, lz), fr.wz(lx, lz));

  // Where the road meets the pad (the grand stair comes down to it).
  const road = (PATHS.find((p) => p.name === 'garden and mountain road') ?? PATHS[PATHS.length - 1]).points;
  const [rx, rz] = road[road.length - 1];
  const stairX = Math.max(-ex + 6, Math.min(ex - 6, Math.round(fr.local(rx, rz)[0])));
  const stairHalf = 4;

  // ── The pad's sides clad in stone, a parapet round the rim ───────────────
  for (let x = -ex - 1; x < ex + 1; x++)
    for (let z = -ez - 1; z < ez + 1; z++) {
      if (!(x < -ex || x >= ex || z < -ez || z >= ez)) continue;
      const y0 = Math.min(ground(x + 0.5, z + 0.5), g - 1);
      m.fill(x, y0, z, x + 1, g - 1, z + 1, BK.stone, { src });
      m.fill(x, g - 1, z, x + 1, g, z + 1, BK.light, { src });
    }
  m.paint(-ex - 1, g - 12, -ez - 1, ex + 1, g - 4, ez + 1, BK.dark, { src });
  const rim = (x: number, _y: number, z: number) => (x < -ex + 1 || x > ex - 1 || z < -ez + 1 || z > ez - 1) && !(z > 0 && Math.abs(x - stairX) < stairHalf + 1);
  m.fill(-ex, g, -ez, ex, g + 1, ez, BK.stone, { src, keep: rim });
  // Grand stair from the road up to the pad, with cheek walls and lamps.
  const foot = Math.min(...[-3, 0, 3].map((dx) => ground(stairX + dx, ez + 6)));
  const rise = Math.max(0, g - foot);
  for (let s = 0; s < rise; s++) {
    const z0 = ez + rise - s - 1;
    m.fill(stairX - stairHalf, foot, z0, stairX + stairHalf, foot + s + 1, z0 + 1, s % 2 ? BK.stone : BK.light, { src });
  }
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? stairX - stairHalf - 1 : stairX + stairHalf;
    for (let s = 0; s < rise; s++) m.fill(x0, foot, ez + s, x0 + 1, g + 1 - s, ez + s + 1, BK.base, { src });
    lamps.add(fr.world(x0 + 0.5, foot + 2, ez + rise - 0.5), 0.9);
    lamps.add(fr.world(x0 + 0.5, g + 1.6, ez - 0.5), 0.9);
  }

  // ── The stepped pyramid ──────────────────────────────────────────────────
  let y = g;
  const towers: [number, number, number][] = [];
  for (const [k, half] of TIERS.entries()) {
    // Plain square tiers, as at Bakheng.
    m.fill(-half, y, -half, half, y + 1, half, BK.base, { src });
    m.fill(-half, y + 1, -half, half, y + TIER_H - 1, half, BK.stone, { src });
    m.fill(-half, y + TIER_H - 1, -half, half, y + TIER_H, half, BK.light, { src });
    // Dark niches along the walls.
    for (let x = -half + 2; x < half - 2; x += 3) {
      if (Math.abs(x + 0.5) < 3) continue;
      for (const [x0, z0, x1, z1] of [
        [x, half - 1, x + 1, half],
        [x, -half, x + 1, -half + 1],
        [half - 1, x, half, x + 1],
        [-half, x, -half + 1, x + 1],
      ])
        m.paint(x0, y + 1, z0, x1, y + TIER_H - 1, z1, SHADOW, { src });
    }
    y += TIER_H;
    // Small towers on the corners of the tier's top (the top one rings the main tower).
    const next = TIERS[k + 1] ?? 0;
    const a = next ? half - 1 : half - 1.5;
    for (const [sx, sz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ])
      towers.push([sx * a, y, sz * a]);
    // Lamps on both sides of the stair at every tier.
    for (const sx of [-1, 1]) lamps.add(fr.world(sx * 3, y + 0.6, half - 0.5), 0.9);
  }
  for (const [x, ty, z] of towers) {
    d.fill(x - 1, ty, z - 1, x + 1, ty + 1.5, z + 1, BK.stone, { src });
    d.paint(x - 0.5, ty, z + 0.5, x + 0.5, ty + 1, z + 1, SHADOW, { src });
    tieredTop(d, x, z, ty + 1.5, [1, 0.5], 1, src, BK);
  }
  // The steep central stair up the front, with cheek walls.
  const top = y;
  const stairFace = (yy: number) => TIERS[0] - 0.5 - (yy - g) * 0.5;
  for (let s = 0; s < top - g; s++) {
    const z1 = stairFace(g + s) + 0.5;
    const z0 = stairFace(g + s + 1);
    d.fill(-2, g, z0, 2, g + s + 1, z1, s % 2 ? BK.light : BK.stone, { src });
    d.fill(-2.5, g, z0, -2, g + s + 1.5, z1, BK.base, { src });
    d.fill(2, g, z0, 2.5, g + s + 1.5, z1, BK.base, { src });
  }

  // ── The main tower: a stepped square spire over a sanctuary with four doors ─
  const TW = TOWER.w / 2;
  m.fill(-TW, top, -TW, TW, top + 6, TW, BK.stone, { src });
  m.paint(-TW, top, -TW, TW, top + 1, TW, BK.dark, { src });
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    // Porch frame, a dark door, a pediment.
    const px = (x0: number, x1: number, z0: number, z1: number) => (dx ? [dx > 0 ? x0 : -x1, dx > 0 ? x1 : -x0, z0, z1] : [z0, z1, dz > 0 ? x0 : -x1, dz > 0 ? x1 : -x0]);
    const [a0, a1, b0, b1] = px(TW, TW + 1, -2, 2);
    m.fill(a0, top, b0, a1, top + 5, b1, BK.stone, { src });
    const [c0, c1, e0, e1] = px(TW, TW + 1, -1, 1);
    m.clear(c0, top, e0, c1, top + 3, e1);
    const [f0, f1, h0, h1] = px(TW - 1, TW, -1, 1);
    m.paint(f0, top, h0, f1, top + 3, h1, SHADOW, { src });
    const [p0, p1, q0, q1] = px(TW, TW + 1, -1.5, 1.5);
    d.fill(p0, top + 5, q0, p1, top + 6, q1, BK.light, { src });
  }
  d.fill(-TW - 0.5, top + 6, -TW - 0.5, TW + 0.5, top + 7, TW + 0.5, BK.light, { src });
  let sy = top + 7;
  for (const half of [4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1]) {
    d.fill(-half, sy, -half, half, sy + 1, half, BK.stone, { src });
    d.fill(-half, sy + 1, -half, half, sy + 1.5, half, BK.light, { src });
    if (half >= 2)
      for (const [x0, z0, x1, z1] of [
        [-0.5, half - 0.5, 0.5, half],
        [-0.5, -half, 0.5, -half + 0.5],
        [half - 0.5, -0.5, half, 0.5],
        [-half, -0.5, -half + 0.5, 0.5],
      ])
        d.paint(x0, sy, z0, x1, sy + 1, z1, SHADOW, { src });
    sy += 1.5;
  }
  d.fill(-0.5, sy, -0.5, 0.5, sy + 1.5, 0.5, BK.light, { src });
  // Its south door glows (a lamp just inside the recess), and lamps at the door.
  const doorZ = TW + 1;
  lamps.strip(fr.world(0, top + 1.5, TW + 0.1), 1.6, 0.2, 2.6, 0, 1.1);
  for (const sx of [-1, 1]) lamps.add(fr.world(sx * 2.5, top + 1.2, doorZ + 0.6), 0.9);

  // ── Two small shrines at the foot of the stair ───────────────────────────
  for (const sx of [-1, 1]) {
    const cx = sx * (TIERS[0] + 3.5);
    const cz = TIERS[0] + 1.5;
    if (Math.abs(cx) + 2.5 > ex - 1 || cz + 2.5 > ez - 1) continue;
    redent(d, cx, cz, g, g + 1, 2.5, 2.5, BK.base, { src });
    prasat(d, cx, cz, g + 1, { h: 8, w: 4, tiers: 3, doors: SIDE.pz, pal: BK, src });
    lamps.add(fr.world(cx, g + 1.3, cz + 3), 0.6);
  }

  m.weather(0.14);
  d.weather(0.1);
  m.commit();
  d.commit();

  // Trees on the pad's back corners, and grass on the open top.
  const trees: [number, number, number][] = [
    [-17, -15, 9],
    [17, -14, 8],
    [-17.5, 3, 7],
    [17.5, -3, 8],
  ];
  for (const [i, [x, z, h]] of trees.entries()) gardenTree(b, x + 0.5, g, z + 0.5, h, 40 + i, i % 2 ? FLOWER_PINK : undefined);
  const world = new VoxelBuilder();
  fr.place(b, world);
  for (const bx of world.boxes) bx.ry = undefined;
  grassOverPad(f, world, { x0: place.x - ex, z0: place.z - ez, x1: place.x + ex, z1: place.z + ez, y: g }, (x, z) => {
    const [lx, lz] = fr.local(x, z);
    return (Math.abs(lx) < TIERS[0] + 1 && Math.abs(lz) < TIERS[0] + 1) || Math.abs(lx) > ex - 1.5 || Math.abs(lz) > ez - 1.5;
  });
  f.occupy(place.x - ex - 1, place.z - ez - 1, place.x + ex + 1, place.z + ez + rise + 1);

  const object = new Group();
  object.name = `landmark:${place.id}`;
  object.add(buildVoxelMesh(world, { quality: ctx.quality === 'low' ? 'low' : 'medium', name: `landmark:${place.id}` }));
  object.add(lamps.addLight(fr.world(0, top - 2, TIERS[0] + 8), 1100, 60));
  const lampMesh = lamps.build(`landmark:${place.id}:lamps`);
  if (lampMesh) object.add(lampMesh);
  return {
    name: `landmark:${place.id}`,
    object,
    blocks: world.boxes.length,
    update(fr: MapFrame) {
      lamps.update(fr.night, fr.t);
    },
  };
}
